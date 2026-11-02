/* Whale Voice — controlled Qwen worker supervisor (Plan10 10-A, internal only).
 *
 * Owns exactly one worker child process that this module started. No implicit start, no download, no
 * network, no retry, no fallback, no killing of unknown processes. Every request is bounded by a
 * timeout; a timeout cancels and the outcome becomes UNKNOWN instead of being retried.
 */

import { spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { QWEN_ERRORS } from './qwen-contract.mjs'
import { QWEN_PROTOCOL_VERSION, decodeResponse, encodeRequest } from './qwen-worker-protocol.mjs'

const MAX_STDOUT_BUFFER = 4 * 1024 * 1024
const MAX_STDERR = 8192

function resolveInside(root, candidate) {
  const realRoot = fs.realpathSync(root)
  const absolute = path.isAbsolute(candidate) ? candidate : path.join(realRoot, candidate)
  const realCandidate = fs.realpathSync(absolute)
  const relative = path.relative(realRoot, realCandidate)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return realCandidate
}

function stateError(code, detail = '') {
  return { ok: false, code, detail }
}

export function createQwenSupervisor(options = {}) {
  const spawnProcess = typeof options.spawnProcess === 'function' ? options.spawnProcess : nodeSpawn
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const worker = options.worker || null
  const allowedRoot = options.allowedRoot || null
  const handshakeTimeoutMs = Number.isInteger(options.handshakeTimeoutMs) ? options.handshakeTimeoutMs : 10000
  const shutdownGraceMs = Number.isInteger(options.shutdownGraceMs) ? options.shutdownGraceMs : 2000

  let child = null
  let stdoutBuffer = ''
  let stderrText = ''
  let sequence = 0
  let startedAt = null
  let tempDir = null
  let stopping = null
  let exitInfo = null
  let readyInfo = null
  let lateResponses = 0
  let protocolErrors = 0
  let exitResolve = null
  let exitSignal = null
  let intentionalStop = false
  const pending = new Map()

  function clearPending(code, detail) {
    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer)
      entry.reject({ ok: false, code, detail })
    }
    pending.clear()
  }

  function settle(entry, kind, value) {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    if (kind === 'resolve') entry.resolve(value)
    else entry.reject(value)
  }

  function handleMessage(message) {
    const entry = pending.get(message.id)
    if (!entry) {
      lateResponses += 1
      return
    }
    pending.delete(message.id)
    if (message.type === 'error') {
      settle(entry, 'reject', {
        ok: false,
        code: message.payload.code || QWEN_ERRORS.PROVIDER_NOT_READY,
        detail: typeof message.payload.message === 'string' ? message.payload.message.slice(0, 240) : '',
      })
      return
    }
    settle(entry, 'resolve', { ok: true, type: message.type, payload: message.payload })
  }

  function onStdout(chunk) {
    stdoutBuffer += chunk.toString('utf8')
    if (stdoutBuffer.length > MAX_STDOUT_BUFFER) {
      protocolErrors += 1
      stdoutBuffer = ''
      try { child && child.kill('SIGKILL') } catch { /* own child only */ }
      return
    }
    let index = stdoutBuffer.indexOf('\n')
    while (index >= 0) {
      const line = stdoutBuffer.slice(0, index)
      stdoutBuffer = stdoutBuffer.slice(index + 1)
      if (line.trim()) {
        const decoded = decodeResponse(line)
        if (decoded.ok) handleMessage(decoded.message)
        else protocolErrors += 1
      }
      index = stdoutBuffer.indexOf('\n')
    }
  }

  function onStderr(chunk) {
    if (stderrText.length >= MAX_STDERR) return
    stderrText = (stderrText + chunk.toString('utf8')).slice(0, MAX_STDERR)
  }

  function onExit(code, signal) {
    exitInfo = { code, signal, at: now() }
    readyInfo = null
    child = null
    clearPending(QWEN_ERRORS.WORKER_UNAVAILABLE, `worker exited (${code})`)
    if (exitResolve) {
      const resolve = exitResolve
      exitResolve = null
      resolve()
    }
  }

  function send(message, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!child || !child.stdin || !child.stdin.writable) {
        reject({ ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE })
        return
      }
      const encoded = encodeRequest(message)
      if (!encoded.ok) {
        reject({ ok: false, code: encoded.code, detail: encoded.path || '' })
        return
      }
      const entry = { resolve, reject, timer: null }
      if (Number.isInteger(timeoutMs) && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          if (!pending.has(message.id)) return
          pending.delete(message.id)
          reject({ ok: false, code: QWEN_ERRORS.TIMEOUT, detail: 'worker request timed out' })
        }, timeoutMs)
      }
      pending.set(message.id, entry)
      try {
        child.stdin.write(encoded.line + '\n')
      } catch {
        pending.delete(message.id)
        settle(entry, 'reject', { ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE })
      }
    })
  }

  function nextId(prefix) {
    sequence += 1
    return `${prefix}-${sequence}`
  }

  async function start() {
    if (child) return { ok: false, code: QWEN_ERRORS.PROVIDER_NOT_READY, detail: 'worker already running' }
    if (!worker || typeof worker.command !== 'string' || !Array.isArray(worker.args)) {
      return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'an explicit command and args are required')
    }
    if (!allowedRoot) return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'an explicit allowed root is required')
    let resolved
    try {
      resolved = resolveInside(allowedRoot, worker.command)
    } catch {
      return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'worker command is not readable')
    }
    if (!resolved) return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'worker command escaped the allowed root')
    if (!worker.args.every((arg) => typeof arg === 'string' && arg.length <= 512 && !/[\u0000-\u001f]/.test(arg))) {
      return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'worker args must be bounded strings')
    }
    let spawnCommand = resolved
    let spawnArgs = [...worker.args]
    if (worker.runtime !== undefined && worker.runtime !== null) {
      if (typeof worker.runtime !== 'string' || !path.isAbsolute(worker.runtime) || !fs.existsSync(worker.runtime)) {
        return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'worker runtime must be an existing absolute file')
      }
      spawnCommand = worker.runtime
      spawnArgs = [resolved, ...worker.args]
    }
    try {
      tempDir = fs.mkdtempSync(path.join(fs.realpathSync(options.tmpRoot || os.tmpdir()), 'wv-qwen-'))
    } catch {
      return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'temporary directory is unavailable')
    }
    exitInfo = null
    readyInfo = null
    intentionalStop = false
    stderrText = ''
    stdoutBuffer = ''
    child = (() => {
      try {
        return spawnProcess(spawnCommand, spawnArgs, {
          cwd: options.cwd || allowedRoot,
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { WV_QWEN_PROTOCOL: String(QWEN_PROTOCOL_VERSION), WV_QWEN_TMP: tempDir },
        })
      } catch {
        return null
      }
    })()
    if (!child) {
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* best effort */ }
        tempDir = null
      }
      return stateError(QWEN_ERRORS.WORKER_UNAVAILABLE, 'worker could not be spawned')
    }
    startedAt = now()
    exitSignal = new Promise((resolve) => { exitResolve = resolve })
    child.stdout.on('data', onStdout)
    child.stderr.on('data', onStderr)
    child.on('exit', onExit)
    child.on('error', (error) => onExit(-1, String(error && error.message || error)))
    const helloId = nextId('hello')
    const ready = await send({ v: QWEN_PROTOCOL_VERSION, id: helloId, type: 'hello', payload: { protocol: QWEN_PROTOCOL_VERSION } }, handshakeTimeoutMs)
      .catch((error) => ({ ok: false, code: error.code || QWEN_ERRORS.WORKER_UNAVAILABLE, detail: error.detail || '' }))
    if (!ready.ok) {
      await stop()
      return { ok: false, code: ready.code === QWEN_ERRORS.TIMEOUT ? QWEN_ERRORS.TIMEOUT : QWEN_ERRORS.WORKER_UNAVAILABLE, detail: ready.detail || '' }
    }
    if (ready.type !== 'ready') {
      await stop()
      return stateError(QWEN_ERRORS.PROTOCOL_INVALID, 'first worker answer was not ready')
    }
    readyInfo = { ...ready.payload }
    return { ok: true, ready: { ...ready.payload } }
  }

  async function request(type, payload = {}, { timeoutMs } = {}) {
    if (!child) return stateError(QWEN_ERRORS.WORKER_UNAVAILABLE)
    try {
      return await send({ v: QWEN_PROTOCOL_VERSION, id: nextId(type.slice(0, 3)), type, payload }, timeoutMs)
    } catch (error) {
      return { ok: false, code: error && error.code ? error.code : QWEN_ERRORS.WORKER_UNAVAILABLE, detail: error && error.detail ? error.detail : '' }
    }
  }

  async function health({ timeoutMs } = {}) {
    const result = await request('health', {}, { timeoutMs })
    if (!result.ok) return result
    return { ok: true, state: result.payload.state || 'unknown', payload: result.payload }
  }

  async function discover({ timeoutMs } = {}) {
    const result = await request('discover', {}, { timeoutMs })
    if (!result.ok) return result
    return { ok: true, payload: result.payload }
  }

  async function synthesize(payload, { timeoutMs } = {}) {
    const result = await request('synthesize', payload, { timeoutMs })
    if (!result.ok) return result
    return { ok: true, payload: result.payload }
  }

  /**
   * Ask the worker to cancel one request. A missing acknowledgement is reported as UNKNOWN; the
   * caller must not treat cancellation as proof that the worker released resources.
   */
  async function cancel(requestId, { timeoutMs = 3000 } = {}) {
    if (!child) return { ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE }
    const result = await send(
      { v: QWEN_PROTOCOL_VERSION, id: nextId('cnl'), type: 'cancel', payload: { requestId } },
      timeoutMs,
    ).catch((error) => ({ ok: false, code: error.code || QWEN_ERRORS.TIMEOUT }))
    if (!result.ok) return { ok: false, code: result.code === QWEN_ERRORS.TIMEOUT ? QWEN_ERRORS.UNKNOWN_RESULT : result.code }
    return { ok: true, state: result.payload && result.payload.state ? result.payload.state : 'UNKNOWN', requestId }
  }

  async function stop() {
    if (stopping) return stopping
    intentionalStop = true
    stopping = (async () => {
      if (child) {
        await send({ v: QWEN_PROTOCOL_VERSION, id: nextId('bye'), type: 'shutdown', payload: {} }, 2000).catch(() => null)
        if (exitSignal) {
          await Promise.race([
            exitSignal,
            new Promise((resolve) => setTimeout(resolve, shutdownGraceMs)),
          ])
        }
        if (child) {
          try { child.kill('SIGKILL') } catch { /* own child only */ }
          if (exitSignal) await Promise.race([exitSignal, new Promise((resolve) => setTimeout(resolve, 1000))])
        }
      }
      readyInfo = null
      clearPending(QWEN_ERRORS.WORKER_UNAVAILABLE, 'worker stopped')
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* best effort */ }
        tempDir = null
      }
      return { ok: true }
    })()
    try {
      return await stopping
    } finally {
      stopping = null
    }
  }

  function state() {
    return {
      state: child ? (readyInfo ? 'ready' : 'starting') : intentionalStop ? 'stopped' : exitInfo ? 'exited' : 'stopped',
      pid: child ? child.pid : null,
      startedAt,
      exit: exitInfo ? { ...exitInfo } : null,
      ready: readyInfo ? { ...readyInfo } : null,
      pendingRequests: pending.size,
      lateResponses,
      protocolErrors,
      stderrBytes: stderrText.length,
      tempDirActive: Boolean(tempDir),
      lastStderr: stderrText.slice(-400),
      observedAt: now(),
    }
  }

  return { start, request, health, discover, synthesize, cancel, stop, state }
}
