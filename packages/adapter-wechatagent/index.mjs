/* Read-only WeChatAgent adapter.
 *
 * The adapter is deliberately narrow: installation/version discovery, process liveness and the
 * supported loopback health endpoint. It never reads Hook token files, chat databases, target maps
 * or arbitrary paths, and it never starts/stops/updates WeChatAgent.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fetchJson } from '../../core/http.mjs'

export const SUPPORTED_WECHATAGENT = '0.3.9'
const DEFAULT_TIMEOUT_MS = 1500

function readJson(file) {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > 512 * 1024) return null
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function processAlive(pid) {
  const n = Number(pid)
  if (!Number.isSafeInteger(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (error) {
    return error && error.code === 'EPERM'
  }
}

function maskPath(value) {
  let text = String(value || '')
  for (const [needle, replacement] of [
    [os.homedir(), '%USERPROFILE%'],
    [process.env.DSH_HOME, '$DSH_HOME'],
  ]) {
    if (needle) text = text.split(needle).join(replacement)
  }
  return text
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'http:') return null
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) return null
    if (url.username || url.password || url.search || url.hash) return null
    return url
  } catch {
    return null
  }
}

function storageIniText(bytes) {
  // The upstream installer writes app/storage.ini as UTF-8 or UTF-16LE (BOM).
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.toString('utf16le')
  return bytes.toString('utf8')
}

/**
 * 182: the install itself declares its data location in `app/storage.ini` (`[Storage] dataHome=`),
 * with the documented sibling `data` directory as the fallback. The adapter only reads that
 * declaration; it never writes the install's config or searches other directories.
 */
export function resolveWeChatAgentDataHome(appDir) {
  let declared = null
  try {
    const bytes = fs.readFileSync(path.join(appDir, 'storage.ini'))
    let active = false
    for (const raw of storageIniText(bytes).replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const line = raw.trim()
      if (line.startsWith('[')) {
        active = /^\[Storage\]$/i.test(line)
        continue
      }
      if (!active) continue
      const match = /^dataHome=(.*)$/i.exec(line)
      if (match && match[1].trim()) {
        declared = match[1].trim()
        break
      }
    }
  } catch {
    declared = null
  }
  if (declared && path.isAbsolute(declared)) return { dataHome: path.resolve(declared), source: 'storage.ini' }
  const fallback = path.basename(appDir).toLowerCase() === 'app'
    ? path.join(path.dirname(appDir), 'data')
    : appDir + '-data'
  return { dataHome: path.resolve(fallback), source: 'layout' }
}

/**
 * 182: one shared inspection of a user-picked WeChatAgent root. The supported layout is `app/` next
 * to `data/` (or a data location declared by the install itself); a directory without the supported
 * app manifest is not adopted.
 */
export function inspectWeChatAgentRoot(root) {
  if (typeof root !== 'string' || root.trim() === '') {
    return { ok: false, reason: 'not_configured', root: null, appDir: null, dataHome: null, dataSource: null, version: null }
  }
  const rootPath = path.resolve(root.trim())
  const appDir = path.join(rootPath, 'app')
  const pkg = readJson(path.join(appDir, 'resources', 'project', 'package.json'))
  if (!pkg || typeof pkg !== 'object') {
    return { ok: false, reason: 'not_installed', root: rootPath, appDir, dataHome: null, dataSource: null, version: null }
  }
  const data = resolveWeChatAgentDataHome(appDir)
  return {
    ok: true,
    root: rootPath,
    appDir,
    dataHome: data.dataHome,
    dataSource: data.source,
    version: typeof pkg.version === 'string' ? pkg.version : null,
  }
}

export async function detectWeChatAgent(config, options = {}) {
  const started = Date.now()
  const observedAt = new Date().toISOString()
  const root = config.wechatAgentRoot
  const base = {
    state: 'not_configured', installed: false, version: null, installPath: null,
    dataPath: null, dataSource: null,
    processRunning: false, connected: false, accountVerified: null,
    reader: 'unknown', bridge: 'unknown', dsh: 'unknown', compatibility: 'unknown',
    wechatVersion: null, wechatVersionSource: null, wechatVersionVerified: false,
    observedAt, durationMs: 0, evidence: 'no configured WeChatAgent root', processes: {},
  }
  if (!root) return { ...base, error: 'wechatagent_not_configured', observedAt, durationMs: Date.now() - started }

  const inspected = inspectWeChatAgentRoot(root)
  if (!inspected.ok) {
    return {
      ...base, state: 'not_installed', installPath: maskPath(root),
      error: 'wechatagent_not_installed', evidence: 'app/resources/project/package.json missing',
      observedAt, durationMs: Date.now() - started,
    }
  }
  const pkg = readJson(path.join(inspected.appDir, 'resources', 'project', 'package.json'))
  const configJson = readJson(path.join(inspected.dataHome, 'workspace', 'config', 'wechatagent.json')) || {}
  const runtime = readJson(path.join(inspected.dataHome, 'workspace', 'state', 'runtime.json')) || {}
  const hook = configJson.hook && typeof configJson.hook === 'object' ? configJson.hook : {}
  const pids = {}
  for (const name of ['reader', 'bridge', 'adapter']) {
    const pid = runtime[name] && runtime[name].pid
    pids[name] = { pid: Number(pid) || null, running: processAlive(pid) }
  }
  const anyRunning = Object.values(pids).some((p) => p.running)
  const version = typeof pkg.version === 'string' ? pkg.version : null
  const compatibility = version === SUPPORTED_WECHATAGENT ? 'compatible' : 'unknown'
  const expectedWechat = typeof hook.expectedVersion === 'string' ? hook.expectedVersion : null
  const baseUrl = safeHttpUrl(hook.baseUrl)
  let health = { state: 'unknown', status: null, body: null, error: 'bridge_url_missing' }
  if (baseUrl) health = await fetchJson(options.fetchImpl || globalThis.fetch, new URL('/WeChatAgent/health', baseUrl), { timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS })
  const body = health.body || {}
  const connected = health.state === 'ok'
    && body.integration === 'WeChatAgent-1'
    && body.backend === 'wechat-hook'
    && body.startupState === 'ready'
  let state = 'installed'
  if (!anyRunning) state = 'not_running'
  if (health.state === 'auth_required') state = 'auth_required'
  else if (health.state === 'timeout') state = 'timeout'
  else if (health.state === 'connection_failed') state = 'connection_failed'
  else if (health.state === 'unsupported') state = 'unknown'
  if (connected) state = 'connected'
  if (version && version !== SUPPORTED_WECHATAGENT) state = 'incompatible'
  const accountVerified = connected && typeof body.accountVerified === 'boolean'
    ? body.accountVerified
    : null
  return {
    ...base,
    state, installed: true, version, installPath: maskPath(root),
    dataPath: maskPath(inspected.dataHome), dataSource: inspected.dataSource,
    processRunning: anyRunning,
    connected,
    accountVerified,
    reader: pids.reader.running ? 'running' : 'unknown',
    bridge: health.state === 'ok' ? (connected ? 'ok' : 'unexpected_response') : health.state,
    dsh: 'unknown', compatibility,
    wechatVersion: expectedWechat,
    wechatVersionSource: expectedWechat ? 'config_expected' : null,
    wechatVersionVerified: false,
    processes: pids, observedAt, durationMs: Date.now() - started,
    evidence: [
      'app/resources/project/package.json v' + (version || '?'),
      'data=' + inspected.dataSource + ' workspace/state/runtime.json pids=' + Object.values(pids).filter((p) => p.running).length,
      baseUrl ? 'GET /WeChatAgent/health -> ' + (health.status || health.state) : 'bridge URL not configured',
    ].join(' + '),
    error: connected ? null : (health.error || (anyRunning ? null : 'not_running')),
  }
}
