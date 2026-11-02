/* Whale Voice — controlled Qwen worker supervisor (Plan10 10-A, internal only).
 *
 * Owns exactly one worker child process that this module started. No implicit start, no download, no
 * network, no retry, no fallback, no killing of unknown processes. Every request is bounded by a
 * positive timeout; a timeout cancels and the outcome becomes UNKNOWN instead of being retried.
 *
 * Lifecycle rules added in the 10-A repair round:
 *  - every start owns one generation; handlers, pending map, stdio buffer and temporary directories
 *    belong to that generation, so a late event from an old process can never release a new one;
 *  - a child `error` event is not an exit: the handle and its temporary directory stay owned until
 *    the process really closes;
 *  - shutdown closes admission to new work, and only a confirmed exit releases ownership; a failed
 *    kill/cleanup is reported as a failure instead of a green `ok`;
 *  - an operation that ended without a definitive terminal answer keeps the worker "occupied" until
 *    a terminal answer or a confirmed exit arrives, so new synthesis cannot silently overlap it.
 */

import { spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { QWEN_ERRORS, QWEN_LIMITS } from './qwen-contract.mjs'
import { QWEN_PROTOCOL_VERSION, decodeResponse, encodeRequest } from './qwen-worker-protocol.mjs'

const MAX_STDOUT_BUFFER = 4 * 1024 * 1024
const MAX_STDERR = 8192
const DEFAULT_KILL_WAIT_MS = 1000
const PROTOCOL_KILL_CODES = new Set([
  'QWEN_PROTOCOL_TOO_DEEP',
  'QWEN_PROTOCOL_TOO_COMPLEX',
  'QWEN_PROTOCOL_OVERSIZED',
  'QWEN_PROTOCOL_FORBIDDEN_FIELD',
])

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

function positiveInteger(value, fallback, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) return fallback
  return value
}

/**
 * @param {object} options
 * @param {Function} [options.spawnProcess] injected spawn (tests use real Node spawn children too)
 * @param {Function} [options.rmTree] injected bounded tree removal (tests may deny one directory)
 * @param {number} [options.requestTimeoutMs] finite default for requests that omit a timeout
 */
export function createQwenSupervisor(options = {}) {
  const spawnProcess = typeof options.spawnProcess === 'function' ? options.spawnProcess : nodeSpawn
  const rmTree = typeof options.rmTree === 'function'
    ? options.rmTree
    : (dir) => fs.rmSync(dir, { recursive: true, force: true })
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const worker = options.worker || null
  const allowedRoot = options.allowedRoot || null
  const handshakeTimeoutMs = positiveInteger(options.handshakeTimeoutMs, 10000, 100, 60000)
  const shutdownGraceMs = positiveInteger(options.shutdownGraceMs, 2000, 0, 30000)
  const killWaitMs = positiveInteger(options.killWaitMs, DEFAULT_KILL_WAIT_MS, 0, 10000)
  const defaultRequestTimeoutMs = positiveInteger(
    options.requestTimeoutMs,
    QWEN_LIMITS.timeoutMs,
    QWEN_LIMITS.minRequestTimeoutMs,
    QWEN_LIMITS.maxRequestTimeoutMs,
  )

  let generation = null
  let generationSeq = 0
  let retainedTempDirs = []
  let stopping = null
  let accepting = false
  let lateResponses = 0
  let protocolErrors = 0
  let lastRequestTimeoutMs = null
  let sequence = 0
  const unresolvedOperations = new Map()

  function cleanupDirs(dirs) {
    const failed = []
    for (const dir of dirs) {
      try {
        rmTree(dir)
      } catch {
        failed.push(dir)
      }
    }
    return failed
  }

  function settle(entry, kind, value) {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    if (kind === 'resolve') entry.resolve(value)
    else entry.reject(value)
  }

  function endOperation(gen, requestId) {
    if (requestId) unresolvedOperations.delete(requestId)
    if (gen) gen.activeOps.delete(requestId)
  }

  function finalize(gen, kind, code, signal) {
    if (!gen || gen.finalized) return
    gen.finalized = true
    gen.child = null
    gen.readyInfo = null
    gen.exitInfo = { code, signal, at: now(), via: kind }
    for (const [, entry] of gen.pending) {
      settle(entry, 'reject', { ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE, detail: 'worker exited' })
    }
    gen.pending.clear()
    for (const requestId of [...gen.activeOps.keys()]) endOperation(gen, requestId)
    if (gen.tempDirs.size > 0) {
      const failed = cleanupDirs([...gen.tempDirs])
      gen.tempDirs.clear()
      if (failed.length > 0) retainedTempDirs.push(...failed)
    }
    if (gen.exitResolve) {
      const resolve = gen.exitResolve
      gen.exitResolve = null
      resolve()
    }
  }

  function recordProtocolViolation(gen, code) {
    protocolErrors += 1
    gen.protocolErrors += 1
    if (PROTOCOL_KILL_CODES.has(code) && gen.child) {
      gen.protocolViolation = code
      try { gen.child.kill('SIGKILL') } catch { /* own child only */ }
    }
  }

  function registerOp(gen, message) {
    if (message.type !== 'synthesize') return
    const requestId = message.payload && message.payload.requestId ? message.payload.requestId : null
    if (requestId) {
      gen.activeOps.set(requestId, { messageId: message.id, startedAt: now() })
      gen.opIndex.set(message.id, requestId)
    }
  }

  function handleMessage(gen, message) {
    const entry = gen.pending.get(message.id)
    if (!entry) {
      lateResponses += 1
      if (message.type === 'result' || message.type === 'error') {
        const requestId = (message.payload && message.payload.requestId) || gen.opIndex.get(message.id)
        if (requestId) endOperation(gen, requestId)
        gen.opIndex.delete(message.id)
      }
      return
    }
    if (message.type !== 'error' && Array.isArray(entry.expect) && entry.expect.length > 0 && !entry.expect.includes(message.type)) {
      gen.pending.delete(message.id)
      recordProtocolViolation(gen, QWEN_ERRORS.RESPONSE_TYPE_MISMATCH)
      settle(entry, 'reject', {
        ok: false,
        code: QWEN_ERRORS.RESPONSE_TYPE_MISMATCH,
        detail: `expected ${entry.expect.join('|')} but received ${message.type}`,
      })
      return
    }
    gen.pending.delete(message.id)
    if (message.type === 'error') {
      const indexed = gen.opIndex.get(message.id)
      const claimed = message.payload && message.payload.requestId
      gen.opIndex.delete(message.id)
      if (indexed) endOperation(gen, indexed)
      if (claimed && claimed !== indexed) endOperation(gen, claimed)
      settle(entry, 'reject', {
        ok: false,
        code: String(message.payload.code || QWEN_ERRORS.PROVIDER_NOT_READY),
        detail: typeof message.payload.message === 'string' ? message.payload.message.slice(0, 240) : '',
        workerError: true,
      })
      return
    }
    if (message.type === 'result') {
      const indexed = gen.opIndex.get(message.id)
      const claimed = message.payload && message.payload.requestId
      gen.opIndex.delete(message.id)
      if (indexed) endOperation(gen, indexed)
      if (claimed && claimed !== indexed) endOperation(gen, claimed)
    }
    settle(entry, 'resolve', { ok: true, type: message.type, payload: message.payload })
  }

  function onStdout(gen, chunk) {
    if (!gen || gen.finalized) return
    try {
      gen.stdoutBuffer += chunk.toString('utf8')
      if (gen.stdoutBuffer.length > MAX_STDOUT_BUFFER) {
        recordProtocolViolation(gen, 'QWEN_PROTOCOL_OVERSIZED')
        gen.stdoutBuffer = ''
        return
      }
      let index = gen.stdoutBuffer.indexOf('\n')
      while (index >= 0) {
        const line = gen.stdoutBuffer.slice(0, index)
        gen.stdoutBuffer = gen.stdoutBuffer.slice(index + 1)
        if (line.trim()) {
          const decoded = decodeResponse(line)
          if (decoded.ok) handleMessage(gen, decoded.message)
          else recordProtocolViolation(gen, decoded.code)
        }
        index = gen.stdoutBuffer.indexOf('\n')
      }
    } catch {
      /* A broken worker line must never escape into the Core host event loop. */
      recordProtocolViolation(gen, QWEN_ERRORS.PROTOCOL_INVALID)
      gen.stdoutBuffer = ''
    }
  }

  function onStderr(gen, chunk) {
    if (!gen || gen.finalized) return
    if (gen.stderrText.length >= MAX_STDERR) return
    gen.stderrText = (gen.stderrText + chunk.toString('utf8')).slice(0, MAX_STDERR)
  }

  function onError(gen, error) {
    if (!gen || gen.finalized) return
    gen.errorInfo = { message: String((error && error.message) || error || 'worker error').slice(0, 240), at: now() }
    /* An `error` event is not an exit: keep the handle and its ownership until `close`. */
  }

  function send(gen, message, { timeoutMs, expect } = {}) {
    return new Promise((resolve, reject) => {
      if (!gen || gen.finalized || !gen.child || !gen.child.stdin || !gen.child.stdin.writable) {
        reject({ ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE })
        return
      }
      const encoded = encodeRequest(message)
      if (!encoded.ok) {
        reject({ ok: false, code: encoded.code, detail: encoded.path || '' })
        return
      }
      const effectiveTimeout = positiveInteger(
        timeoutMs,
        defaultRequestTimeoutMs,
        QWEN_LIMITS.minRequestTimeoutMs,
        QWEN_LIMITS.maxRequestTimeoutMs,
      )
      lastRequestTimeoutMs = effectiveTimeout
      const entry = { resolve, reject, timer: null, expect: Array.isArray(expect) ? expect : null, requestId: null }
      entry.timer = setTimeout(() => {
        if (!gen.pending.has(message.id)) return
        gen.pending.delete(message.id)
        const requestId = entry.requestId
        if (requestId) {
          unresolvedOperations.set(requestId, { at: now(), reason: 'timeout', generation: gen.id })
          gen.opIndex.delete(message.id)
        }
        reject({
          ok: false,
          code: QWEN_ERRORS.TIMEOUT,
          detail: 'worker request timed out',
          requestId,
          unknown: true,
        })
      }, effectiveTimeout)
      if (message.type === 'synthesize' && message.payload && message.payload.requestId) {
        entry.requestId = message.payload.requestId
      }
      gen.pending.set(message.id, entry)
      registerOp(gen, message)
      try {
        gen.child.stdin.write(encoded.line + '\n')
      } catch {
        gen.pending.delete(message.id)
        settle(entry, 'reject', { ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE })
      }
    })
  }

  function nextId(prefix) {
    sequence += 1
    return `${prefix}-${sequence}`
  }

  async function start() {
    if (stopping) return stateError(QWEN_ERRORS.STOPPING, 'worker is stopping')
    if (generation && generation.child) return stateError(QWEN_ERRORS.PROVIDER_NOT_READY, 'worker already running')
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
    if (!worker.args.every((arg) => typeof arg === 'string' && arg.length <= 1024 && !/[\u0000-\u001f]/.test(arg))) {
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
    /* A previous generation's un-cleaned directories stay owned; retry before adding another one. */
    retainedTempDirs = cleanupDirs(retainedTempDirs)
    let tempDir
    try {
      tempDir = fs.mkdtempSync(path.join(fs.realpathSync(options.tmpRoot || os.tmpdir()), 'wv-qwen-'))
    } catch {
      return stateError(QWEN_ERRORS.WORKER_NOT_CONFIGURED, 'temporary directory is unavailable')
    }
    generationSeq += 1
    const gen = {
      id: generationSeq,
      child: null,
      stdoutBuffer: '',
      stderrText: '',
      startedAt: now(),
      exitInfo: null,
      errorInfo: null,
      readyInfo: null,
      pending: new Map(),
      activeOps: new Map(),
      opIndex: new Map(),
      tempDirs: new Set([tempDir]),
      exitPromise: null,
      exitResolve: null,
      finalized: false,
      intentionalStop: false,
      protocolErrors: 0,
      protocolViolation: null,
    }
    generation = gen
    unresolvedOperations.clear()
    accepting = false
    try {
      gen.child = spawnProcess(spawnCommand, spawnArgs, {
        cwd: options.cwd || allowedRoot,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { WV_QWEN_PROTOCOL: String(QWEN_PROTOCOL_VERSION), WV_QWEN_TMP: tempDir },
      })
    } catch {
      gen.child = null
    }
    if (!gen.child) {
      gen.tempDirs.delete(tempDir)
      const failed = cleanupDirs([tempDir])
      retainedTempDirs.push(...failed)
      return stateError(QWEN_ERRORS.WORKER_UNAVAILABLE, 'worker could not be spawned')
    }
    gen.exitPromise = new Promise((resolve) => { gen.exitResolve = resolve })
    gen.child.stdout.on('data', (chunk) => onStdout(gen, chunk))
    gen.child.stderr.on('data', (chunk) => onStderr(gen, chunk))
    gen.child.on('error', (error) => onError(gen, error))
    gen.child.on('exit', (code, signal) => finalize(gen, 'exit', code, signal))
    gen.child.on('close', (code, signal) => finalize(gen, 'close', code, signal))
    const helloId = nextId('hello')
    const ready = await send(gen, { v: QWEN_PROTOCOL_VERSION, id: helloId, type: 'hello', payload: { protocol: QWEN_PROTOCOL_VERSION } }, { timeoutMs: handshakeTimeoutMs, expect: ['ready'] })
      .catch((error) => ({ ok: false, code: (error && error.code) || QWEN_ERRORS.WORKER_UNAVAILABLE, detail: (error && error.detail) || '' }))
    if (!ready.ok) {
      const failure = { ok: false, code: ready.code, detail: ready.detail || '' }
      await stop()
      return failure
    }
    if (ready.type !== 'ready') {
      await stop()
      return stateError(QWEN_ERRORS.PROTOCOL_INVALID, 'first worker answer was not ready')
    }
    gen.readyInfo = { ...ready.payload }
    accepting = true
    return { ok: true, ready: { ...ready.payload }, generation: gen.id }
  }

  async function request(type, payload = {}, { timeoutMs, expect = ['result'] } = {}) {
    if (!generation || !generation.child) return stateError(QWEN_ERRORS.WORKER_UNAVAILABLE)
    if (type === 'synthesize' && (stopping || !accepting)) return stateError(QWEN_ERRORS.STOPPING, 'worker is not accepting work')
    try {
      return await send(generation, { v: QWEN_PROTOCOL_VERSION, id: nextId(type.slice(0, 3)), type, payload }, { timeoutMs, expect })
    } catch (error) {
      return { ok: false, code: (error && error.code) || QWEN_ERRORS.WORKER_UNAVAILABLE, detail: (error && error.detail) || '' }
    }
  }

  async function health({ timeoutMs } = {}) {
    const result = await request('health', {}, { timeoutMs, expect: ['result'] })
    if (!result.ok) return result
    return { ok: true, state: result.payload.state || 'unknown', payload: result.payload }
  }

  async function discover({ timeoutMs } = {}) {
    return request('discover', {}, { timeoutMs, expect: ['result'] })
  }

  async function synthesize(payload, { timeoutMs } = {}) {
    const requestId = payload && payload.requestId ? payload.requestId : null
    if (requestId && unresolvedOperations.has(requestId)) {
      return stateError(QWEN_ERRORS.UNRESOLVED_ACTIVITY, 'a previous operation has no confirmed terminal state')
    }
    if (unresolvedOperations.size > 0) {
      return stateError(QWEN_ERRORS.UNRESOLVED_ACTIVITY, 'the worker still owns an unconfirmed operation')
    }
    return request('synthesize', payload, { timeoutMs, expect: ['result'] })
  }

  /**
   * Cancel one synthesis by its request id. The original waiter is settled immediately; the worker
   * stays "occupied" until a terminal answer or a confirmed exit proves the operation ended, so a
   * subsequent synthesis cannot overlap an unconfirmed one.
   */
  async function cancel(requestId, { timeoutMs = QWEN_LIMITS.cancelAckTimeoutMs } = {}) {
    const gen = generation
    if (!gen || !gen.child) return { ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE }
    if (typeof requestId !== 'string' || !requestId) return { ok: false, code: QWEN_ERRORS.INVALID_INPUT }
    const op = gen.activeOps.get(requestId)
    if (op) {
      const entry = gen.pending.get(op.messageId)
      if (entry) {
        gen.pending.delete(op.messageId)
        settle(entry, 'reject', { ok: false, code: QWEN_ERRORS.CANCELLED, cancelled: true, requestId })
      }
      gen.activeOps.delete(requestId)
      gen.opIndex.delete(op.messageId)
      unresolvedOperations.set(requestId, { at: now(), reason: 'cancel-requested', generation: gen.id })
    }
    if (!op && !unresolvedOperations.has(requestId)) {
      return { ok: false, code: QWEN_ERRORS.UNKNOWN_REQUEST }
    }
    const result = await send(gen, { v: QWEN_PROTOCOL_VERSION, id: nextId('cnl'), type: 'cancel', payload: { requestId } }, { timeoutMs, expect: ['event', 'result'] })
      .catch((error) => ({ ok: false, code: (error && error.code) || QWEN_ERRORS.WORKER_UNAVAILABLE }))
    if (!result.ok) {
      if (result.code === QWEN_ERRORS.TIMEOUT) return { ok: false, code: QWEN_ERRORS.UNKNOWN_RESULT, unknown: true, requestId }
      return { ok: false, code: result.code, requestId }
    }
    const state = result.payload && result.payload.state ? result.payload.state : 'UNKNOWN'
    return { ok: true, state, ack: true, requestId }
  }

  async function stop() {
    if (stopping) return stopping
    accepting = false
    stopping = (async () => {
      const gen = generation
      if (gen && gen.child) {
        gen.intentionalStop = true
        await send(gen, { v: QWEN_PROTOCOL_VERSION, id: nextId('bye'), type: 'shutdown', payload: {} }, { timeoutMs: 2000, expect: ['event', 'result'] })
          .catch(() => null)
        if (gen.exitPromise) {
          await Promise.race([
            gen.exitPromise,
            new Promise((resolve) => setTimeout(resolve, shutdownGraceMs)),
          ])
        }
        if (gen.child) {
          try { gen.child.kill('SIGKILL') } catch { /* own child only */ }
          if (gen.exitPromise) await Promise.race([gen.exitPromise, new Promise((resolve) => setTimeout(resolve, killWaitMs))])
        }
        if (gen.child) {
          /* The process did not exit: keep the handle, the pending work and the temp ownership. */
          return {
            ok: false,
            code: QWEN_ERRORS.EXIT_UNCONFIRMED,
            pid: gen.child.pid,
            generation: gen.id,
            cleanupPending: retainedTempDirs.length,
          }
        }
      }
      if (gen) {
        for (const [, entry] of gen.pending) settle(entry, 'reject', { ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE, detail: 'worker stopped' })
        gen.pending.clear()
      }
      unresolvedOperations.clear()
      const dirs = [...(gen ? gen.tempDirs : []), ...retainedTempDirs]
      if (gen) gen.tempDirs.clear()
      retainedTempDirs = []
      retainedTempDirs = cleanupDirs(dirs)
      if (retainedTempDirs.length > 0) {
        return {
          ok: false,
          code: QWEN_ERRORS.CLEANUP_INCOMPLETE,
          tempDirs: [...retainedTempDirs],
          generation: gen ? gen.id : 0,
          cleanupPending: retainedTempDirs.length,
        }
      }
      return { ok: true, generation: gen ? gen.id : 0 }
    })()
    try {
      return await stopping
    } finally {
      stopping = null
    }
  }

  function state() {
    const gen = generation
    const alive = Boolean(gen && gen.child)
    const workerState = alive
      ? (gen.readyInfo ? 'ready' : 'starting')
      : (stopping ? 'stopping' : gen && gen.exitInfo ? (gen.intentionalStop ? 'stopped' : 'exited') : 'stopped')
    return {
      state: workerState,
      generation: gen ? gen.id : 0,
      pid: alive ? gen.child.pid : null,
      alive,
      accepting,
      stopping: Boolean(stopping),
      startedAt: gen ? gen.startedAt : null,
      exit: gen && gen.exitInfo ? { ...gen.exitInfo } : null,
      error: gen && gen.errorInfo ? { ...gen.errorInfo } : null,
      ready: gen && gen.readyInfo ? { ...gen.readyInfo } : null,
      pendingRequests: gen ? gen.pending.size : 0,
      activeOperations: gen ? gen.activeOps.size : 0,
      unresolvedOperations: unresolvedOperations.size,
      lateResponses,
      protocolErrors,
      stderrBytes: gen ? gen.stderrText.length : 0,
      lastStderr: gen ? gen.stderrText.slice(-400) : '',
      tempDirActive: Boolean((gen && gen.tempDirs.size > 0) || retainedTempDirs.length > 0),
      retainedTempDirs: retainedTempDirs.length,
      lastRequestTimeoutMs,
      observedAt: now(),
    }
  }

  return { start, request, health, discover, synthesize, cancel, stop, state }
}
