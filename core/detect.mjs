/* Whale Voice Core — read-only component detection.
 *
 * This module never starts services, changes configuration, sends messages, installs packages,
 * reads Hook/audit token files or reads chat databases. It reads only explicit configuration,
 * small version/state manifests, process liveness and fixed local health endpoints.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { detectWeChatAgent } from '../packages/adapter-wechatagent/index.mjs'
export { SUPPORTED_WECHATAGENT, detectWeChatAgent } from '../packages/adapter-wechatagent/index.mjs'

export const SCHEMA_VERSION = 1
const MAX_JSON_BYTES = 512 * 1024
const DEFAULT_TIMEOUT_MS = 1500
const DEFAULT_QWEN_URL = 'http://127.0.0.1:8765'

function readJson(file) {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > MAX_JSON_BYTES) return null
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function fileExists(file) {
  try { return fs.statSync(file).isFile() } catch { return false }
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

export function maskPath(value) {
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
    if (url.username || url.password) return null
    if (url.search || url.hash) return null
    return url
  } catch {
    return null
  }
}

export function readCoreConfig(env = process.env) {
  const dshHome = env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const configPath = path.join(dshHome, 'whale-voice', 'core.json')
  const file = readJson(configPath) || {}
  return {
    dshHome,
    configPath,
    wechatAgentRoot: String(env.WHALE_WECHATAGENT_HOME || file.wechatAgentRoot || '').trim(),
    senderRoot: String(env.WHALE_VOICE_SENDER_HOME || file.voiceSenderRoot || '').trim(),
    qwenUrl: String(env.WHALE_VOICE_QWEN_URL || file.qwenUrl || DEFAULT_QWEN_URL).trim(),
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
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    const response = await Promise.race([request, timeout])
    if (response && response.__timeout) return { state: 'timeout', status: null, error: 'timeout' }
    let body = null
    let text = ''
    try {
      text = await response.text()
      if (text.length <= 16 * 1024) body = JSON.parse(text)
    } catch {}
    if (response.status === 401 || response.status === 403) {
      return { state: 'auth_required', status: response.status, body: null, error: 'auth_required' }
    }
    if (response.status === 404) {
      return { state: 'unsupported', status: 404, body: null, error: 'endpoint_not_found' }
    }
    if (!response.ok) {
      return { state: 'connection_failed', status: response.status, body: null, error: 'http_' + response.status }
    }
    if (!body || typeof body !== 'object') {
      return { state: 'unknown', status: response.status, body: null, error: 'invalid_json' }
    }
    return { state: 'ok', status: response.status, body, error: null }
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')
    return { state: aborted ? 'timeout' : 'connection_failed', status: null, error: aborted ? 'timeout' : String(error && error.code || error && error.name || error).slice(0, 80) }
  } finally {
    clearTimeout(timer)
  }
}

function baseEvidence(sources) {
  return sources.filter(Boolean).join(' + ')
}

export async function detectVoiceSender(config, options = {}) {
  const started = Date.now()
  const observedAt = new Date().toISOString()
  const root = config.senderRoot
  const base = {
    state: 'not_configured', installed: false, version: null, installPath: null,
    processRunning: false, health: null, healthy: null, powershell: null, dotnet: null, node: null,
    vbCable: null, capture: null, queue: null, recoveryPending: null,
    observedAt, durationMs: 0, evidence: 'no configured Voice Sender root',
  }
  if (!root) return { ...base, error: 'sender_not_configured', observedAt, durationMs: Date.now() - started }
  const packageFile = path.join(root, 'service', 'package.json')
  const configFile = path.join(root, 'service', 'service.config.json')
  const stateFile = path.join(root, 'service', 'runtime', 'service.json')
  const pkg = readJson(packageFile)
  if (!pkg || typeof pkg !== 'object') {
    return { ...base, installPath: maskPath(root), error: 'sender_not_installed', evidence: 'service/package.json missing', observedAt, durationMs: Date.now() - started }
  }
  const serviceConfig = readJson(configFile) || {}
  const runtime = readJson(stateFile) || {}
  const pid = Number(runtime.pid) || null
  const running = processAlive(pid)
  const port = Number(serviceConfig.port) || 43371
  const url = safeHttpUrl('http://127.0.0.1:' + port + '/health')
  const health = url ? await httpJson(options.fetchImpl || globalThis.fetch, url, options.timeoutMs || DEFAULT_TIMEOUT_MS) : { state: 'unsupported', status: null, error: 'invalid_port' }
  const body = health.body || {}
  const healthy = health.state === 'ok' ? body.ok === true && body.service === 'voice-sender' : null
  let state = 'installed'
  if (!running) state = 'not_running'
  if (health.state === 'auth_required') state = 'auth_required'
  else if (health.state === 'timeout') state = 'timeout'
  else if (health.state === 'connection_failed') state = 'connection_failed'
  if (healthy) state = 'installed'
  return {
    ...base,
    state,
    installed: true,
    version: typeof pkg.version === 'string' ? pkg.version : null,
    installPath: maskPath(root),
    processRunning: running,
    health: health.state,
    healthy,
    powershell: null,
    dotnet: null,
    node: null,
    vbCable: null,
    capture: null,
    queue: healthy && body.queue && typeof body.queue === 'object' ? (Number(body.queue.pending) || 0) : null,
    recoveryPending: null,
    observedAt,
    durationMs: Date.now() - started,
    evidence: baseEvidence([
      'service/package.json v' + (pkg.version || '?'),
      'runtime/service.json pid=' + (pid || '?') + ' alive=' + running,
      'GET /health -> ' + (health.status || health.state),
    ]),
    error: healthy ? null : (health.error || (running ? null : 'not_running')),
  }
}

export async function detectQwen(config, options = {}) {
  const started = Date.now()
  const observedAt = new Date().toISOString()
  const url = safeHttpUrl(config.qwenUrl)
  if (!url) {
    return { state: 'not_configured', reachable: false, configured: false, preview: { ok: false, reason: 'invalid_url' }, error: 'qwen_url_invalid', observedAt, durationMs: Date.now() - started, evidence: 'invalid configured URL' }
  }
  const health = await httpJson(options.fetchImpl || globalThis.fetch, new URL('/health', url), options.timeoutMs || DEFAULT_TIMEOUT_MS)
  const body = health.body || {}
  const ok = health.state === 'ok' && body.ok === true
  return {
    state: ok ? 'ok' : health.state,
    reachable: ok,
    configured: false,
    provider: 'qwen-local',
    model: ok && typeof body.model === 'string' ? body.model : null,
    voice: ok && typeof body.voice === 'string' ? body.voice : null,
    preview: { ok: false, reason: 'not_run_in_readonly_phase' },
    observedAt,
    durationMs: Date.now() - started,
    evidence: 'GET /health -> ' + (health.status || health.state),
    error: ok ? null : health.error,
  }
}

function normalizeFailure(component, error) {
  return { state: 'unknown', error: 'detection_failed', detail: String(error && error.message || error).slice(0, 160), observedAt: new Date().toISOString(), component }
}

export function createDetector(options = {}) {
  const env = options.env || process.env
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const now = options.now || (() => new Date())
  const config = options.config || readCoreConfig(env)
  let generation = 0

  async function detectComponent(component) {
    if (component === 'wechatagent') return detectWeChatAgent(config, { fetchImpl, timeoutMs })
    if (component === 'sender') return detectVoiceSender(config, { fetchImpl, timeoutMs })
    if (component === 'qwen') return detectQwen(config, { fetchImpl, timeoutMs })
    throw Object.assign(new Error('unsupported component'), { code: 'unsupported_component' })
  }

  async function detectAll() {
    const myGeneration = ++generation
    const started = Date.now()
    const [wechatAgent, sender, qwen] = await Promise.all([
      detectComponent('wechatagent').catch((e) => normalizeFailure('wechatagent', e)),
      detectComponent('sender').catch((e) => normalizeFailure('sender', e)),
      detectComponent('qwen').catch((e) => normalizeFailure('qwen', e)),
    ])
    const completed = false
    return {
      schemaVersion: SCHEMA_VERSION,
      completed,
      completedReason: 'installation_and_preview_not_implemented',
      core: { version: '0.1.0', mode: 'read-only' },
      environment: { windows: process.platform === 'win32', architecture: process.arch, node: process.version },
      voiceEnabled: null,
      voiceStateSource: 'not_read',
      wechatAgent,
      sender,
      senderEvidence: { observedAt: sender.observedAt, evidence: sender.evidence },
      tts: {
        configured: false,
        provider: qwen.state === 'ok' ? 'qwen-local' : null,
        available: qwen.state === 'ok' ? ['qwen-local'] : [],
        model: qwen.model || null,
        voice: qwen.voice || null,
        preview: qwen.preview,
        state: qwen.state,
        evidence: qwen.evidence,
        observedAt: qwen.observedAt,
      },
      ttsEvidence: { observedAt: qwen.observedAt, evidence: qwen.evidence },
      qwen,
      observedAt: now().toISOString(),
      durationMs: Date.now() - started,
      generation: myGeneration,
      stale: myGeneration !== generation,
      evidence: baseEvidence([wechatAgent.evidence, sender.evidence, qwen.evidence]),
    }
  }

  return {
    config,
    detectComponent,
    detectAll,
    isCurrent(g) { return g === generation },
    get generation() { return generation },
  }
}

export const components = Object.freeze(['wechatagent', 'sender', 'qwen'])
