/* Read-only WeChatAgent adapter.
 *
 * The adapter is deliberately narrow: installation/version discovery, process liveness and the
 * supported loopback health endpoint. It never reads Hook token files, chat databases, target maps
 * or arbitrary paths, and it never starts/stops/updates WeChatAgent.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

async function httpJson(fetchImpl, url, timeoutMs) {
  if (!fetchImpl) return { state: 'unsupported', status: null, error: 'fetch_unavailable' }
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      try { controller.abort() } catch {}
      resolve({ __timeout: true })
    }, timeoutMs)
  })
  try {
    const request = fetchImpl(url, {
      method: 'GET', redirect: 'manual', signal: controller.signal, headers: { accept: 'application/json' },
    })
    const response = await Promise.race([request, timeout])
    if (response && response.__timeout) return { state: 'timeout', status: null, error: 'timeout' }
    let body = null
    try {
      const text = await response.text()
      if (text.length <= 16 * 1024) body = JSON.parse(text)
    } catch {}
    if (response.status === 401 || response.status === 403) return { state: 'auth_required', status: response.status, body: null, error: 'auth_required' }
    if (response.status === 404) return { state: 'unsupported', status: 404, body: null, error: 'endpoint_not_found' }
    if (!response.ok) return { state: 'connection_failed', status: response.status, body: null, error: 'http_' + response.status }
    if (!body || typeof body !== 'object') return { state: 'unknown', status: response.status, body: null, error: 'invalid_json' }
    return { state: 'ok', status: response.status, body, error: null }
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')
    return { state: aborted ? 'timeout' : 'connection_failed', status: null, error: aborted ? 'timeout' : String(error && error.code || error && error.name || error).slice(0, 80) }
  } finally {
    clearTimeout(timer)
  }
}

export async function detectWeChatAgent(config, options = {}) {
  const started = Date.now()
  const observedAt = new Date().toISOString()
  const root = config.wechatAgentRoot
  const base = {
    state: 'not_configured', installed: false, version: null, installPath: null,
    processRunning: false, connected: false, accountVerified: null,
    reader: 'unknown', bridge: 'unknown', dsh: 'unknown', compatibility: 'unknown',
    wechatVersion: null, wechatVersionSource: null, wechatVersionVerified: false,
    observedAt, durationMs: 0, evidence: 'no configured WeChatAgent root', processes: {},
  }
  if (!root) return { ...base, error: 'wechatagent_not_configured', observedAt, durationMs: Date.now() - started }

  const pkg = readJson(path.join(root, 'app', 'resources', 'project', 'package.json'))
  if (!pkg || typeof pkg !== 'object') {
    return { ...base, installPath: maskPath(root), error: 'wechatagent_not_installed', evidence: 'package.json missing', observedAt, durationMs: Date.now() - started }
  }
  const configJson = readJson(path.join(root, 'data', 'workspace', 'config', 'wechatagent.json')) || {}
  const runtime = readJson(path.join(root, 'data', 'workspace', 'state', 'runtime.json')) || {}
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
  if (baseUrl) health = await httpJson(options.fetchImpl || globalThis.fetch, new URL('/WeChatAgent/health', baseUrl), options.timeoutMs || DEFAULT_TIMEOUT_MS)
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
  return {
    ...base,
    state, installed: true, version, installPath: maskPath(root), processRunning: anyRunning,
    connected,
    accountVerified: connected && typeof body.account === 'object' ? true : null,
    reader: pids.reader.running ? 'running' : 'unknown',
    bridge: health.state === 'ok' ? (connected ? 'ok' : 'unexpected_response') : health.state,
    dsh: 'unknown', compatibility,
    wechatVersion: expectedWechat,
    wechatVersionSource: expectedWechat ? 'config_expected' : null,
    wechatVersionVerified: false,
    processes: pids, observedAt, durationMs: Date.now() - started,
    evidence: [
      'app/resources/project/package.json v' + (version || '?'),
      'state/runtime.json pids=' + Object.values(pids).filter((p) => p.running).length,
      baseUrl ? 'GET /WeChatAgent/health -> ' + (health.status || health.state) : 'bridge URL not configured',
    ].join(' + '),
    error: connected ? null : (health.error || (anyRunning ? null : 'not_running')),
  }
}
