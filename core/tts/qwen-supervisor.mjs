/* Whale Voice — controlled Qwen worker supervisor (Plan10 10-A, internal only).
 *
 * Owns exactly one worker child process that this module started. No implicit start, no download, no
 * network, no retry, no fallback, no killing of unknown processes. Every request is bounded by a
 * positive timeout; a timeout cancels and the outcome becomes UNKNOWN instead of being retried.
 *
 * Lifecycle rules (095 round):
 *  - every start owns one generation; handlers, pending map, operation table, stdio buffer and
 *    temporary directories belong to that generation, so a late event from an old process can never
 *    release a new one;
 *  - a child `error` event is not an exit: the handle and its temporary directory stay owned until
 *    the process really closes;
 *  - an operation is only released by a terminal message that is correlated through its issued
 *    message id, its request id and its generation. A never-issued message id, a wrong identity, an
 *    unexpected response type or a progress event cannot clear another operation's occupancy;
 *  - cancellation is separated into request, trusted acknowledgement, actual stop and the final
 *    result: a rejected/timed-out/wrong-identity/non-terminal acknowledgement never fabricates a
 *    confirmed cancellation, and a late success is discarded rather than promoted;
 *  - shutdown closes admission immediately; a stop intent that races the handshake keeps admission
 *    closed, and only a confirmed exit releases ownership.
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

  function operationCounts(gen) {
    let active = 0
    let unresolved = 0
    if (gen) {
      for (const operation of gen.operations.values()) {
        if (operation.state === 'ACTIVE') active += 1
        else if (operation.state === 'UNRESOLVED') unresolved += 1
      }
    }
    return { active, unresolved }
  }

  function markUnresolved(gen, requestId, reason) {
    const operation = gen && gen.operations.get(requestId)
    if (!operation) return
    operation.state = 'UNRESOLVED'
    operation.reason = reason
    operation.updatedAt = now()
  }

  /**
   * A synthesis may only be released by a complete terminal answer: terminal state plus the exact
   * request id, model, backend and voice id captured when the request was sent. A generic result
   * (for example `loaded:true`), a missing/null request id, a wrong identity or a health-shaped
   * answer proves nothing about the execution and must keep the operation occupied.
   */
  function isCompleteSynthTerminal(operation, payload) {
    if (!operation || !payload || typeof payload !== 'object') return false
    if (!['ok', 'cancelled', 'unknown'].includes(payload.state)) return false
    if (payload.requestId !== operation.requestId) return false
    if (payload.model !== operation.identity.model) return false
    if (payload.backend !== operation.identity.backend) return false
    if (payload.voiceId !== operation.identity.voiceId) return false
    return true
  }

  async function failStart(gen, failure) {
    if (gen && gen === generation && !gen.finalized) {
      await stop()
    } else if (gen) {
      const dirs = [...gen.tempDirs]
      gen.tempDirs.clear()
      retainedTempDirs.push(...cleanupDirs(dirs))
    }
    return failure
  }

  function releaseOperation(gen, requestId) {
    if (!gen) return
    gen.operations.delete(requestId)
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
    gen.operations.clear()
    gen.messageOwners.clear()
    gen.cancelMessages.clear()
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

  /**
   * A message without a pending waiter is late by definition. It may only release an operation when
   * its *issued* message id belongs to that operation and its claimed request id (if any) matches.
   * A never-issued message id, a cancel message id, a progress event or a wrong claimed id never
   * clears anything.
   */
  function handleLate(gen, message) {
    if (message.type !== 'result' && message.type !== 'error') return
    if (gen.cancelMessages.has(message.id)) {
      gen.cancelMessages.delete(message.id)
      return
    }
    const owner = gen.messageOwners.get(message.id)
    if (!owner) return
    const manager = gen.operations.get(owner)
    if (!manager) {
      gen.messageOwners.delete(message.id)
      return
    }
    if (message.type === 'result') {
      if (!isCompleteSynthTerminal(manager, message.payload)) {
        /* Invalid late message: do not release the operation and keep the issued message id so a
         * later fully correlated terminal can still recover it. */
        return
      }
      gen.messageOwners.delete(message.id)
      releaseOperation(gen, owner)
      return
    }
    const claimed = message.payload && message.payload.requestId
    if (claimed !== undefined && claimed !== null && claimed !== manager.requestId) return
    gen.messageOwners.delete(message.id)
    releaseOperation(gen, owner)
  }

  function handleMessage(gen, message) {
    const entry = gen.pending.get(message.id)
    if (!entry) {
      lateResponses += 1
      handleLate(gen, message)
      return
    }
    if (message.type === 'error') {
      gen.pending.delete(message.id)
      if (entry.kind === 'cancel') {
        gen.cancelMessages.delete(message.id)
        settle(entry, 'reject', {
          ok: false,
          code: String(message.payload.code || QWEN_ERRORS.PROVIDER_NOT_READY),
          detail: typeof message.payload.message === 'string' ? message.payload.message.slice(0, 240) : '',
          workerRejected: true,
        })
        return
      }
      if (entry.kind === 'synthesize') {
        const claimed = message.payload && message.payload.requestId
        if (claimed !== undefined && claimed !== null && claimed !== entry.requestId) {
          recordProtocolViolation(gen, QWEN_ERRORS.RESPONSE_IDENTITY_MISMATCH)
          markUnresolved(gen, entry.requestId, 'error-identity-mismatch')
          settle(entry, 'reject', {
            ok: false,
            code: QWEN_ERRORS.RESPONSE_IDENTITY_MISMATCH,
            unknown: true,
            detail: 'worker error claimed a different request id',
          })
          return
        }
        gen.messageOwners.delete(message.id)
        releaseOperation(gen, entry.requestId)
        settle(entry, 'reject', {
          ok: false,
          code: String(message.payload.code || QWEN_ERRORS.PROVIDER_NOT_READY),
          detail: typeof message.payload.message === 'string' ? message.payload.message.slice(0, 240) : '',
          workerError: true,
        })
        return
      }
      settle(entry, 'reject', {
        ok: false,
        code: String(message.payload.code || QWEN_ERRORS.PROVIDER_NOT_READY),
        detail: typeof message.payload.message === 'string' ? message.payload.message.slice(0, 240) : '',
        workerError: true,
      })
      return
    }
    if (entry.kind === 'cancel') {
      gen.pending.delete(message.id)
      gen.cancelMessages.delete(message.id)
      settle(entry, 'resolve', { ok: true, type: message.type, payload: message.payload })
      return
    }
    if (Array.isArray(entry.expect) && entry.expect.length > 0 && !entry.expect.includes(message.type)) {
      gen.pending.delete(message.id)
      recordProtocolViolation(gen, QWEN_ERRORS.RESPONSE_TYPE_MISMATCH)
      if (entry.kind === 'synthesize') markUnresolved(gen, entry.requestId, 'type-mismatch')
      settle(entry, 'reject', {
        ok: false,
        code: QWEN_ERRORS.RESPONSE_TYPE_MISMATCH,
        unknown: entry.kind === 'synthesize',
        detail: `expected ${entry.expect.join('|')} but received ${message.type}`,
      })
      return
    }
    if (entry.kind === 'synthesize') {
      const operation = gen.operations.get(entry.requestId)
      if (!isCompleteSynthTerminal(operation, message.payload)) {
        gen.pending.delete(message.id)
        recordProtocolViolation(gen, QWEN_ERRORS.RESPONSE_IDENTITY_MISMATCH)
        markUnresolved(gen, entry.requestId, 'incomplete-terminal')
        settle(entry, 'reject', {
          ok: false,
          code: QWEN_ERRORS.RESPONSE_IDENTITY_MISMATCH,
          unknown: true,
          detail: 'synthesis result is not a complete correlated terminal',
        })
        return
      }
      if (operation.cancelRequested && message.payload && message.payload.state === 'cancelled') {
        /* A cancellation terminal can race the acknowledgement. It proves the operation ended, so
         * occupancy is released, but it is reported as a cancellation rather than a success. A
         * successful completion that races an unconfirmed cancel is still a real completion and is
         * handled by the normal terminal path; only a success after a *confirmed* cancel is late. */
        gen.pending.delete(message.id)
        gen.messageOwners.delete(message.id)
        releaseOperation(gen, entry.requestId)
        settle(entry, 'reject', {
          ok: false,
          code: QWEN_ERRORS.CANCELLED,
          cancelled: true,
          cancelConfirmed: false,
          stopped: false,
          requestId: entry.requestId,
        })
        return
      }
      gen.pending.delete(message.id)
      gen.messageOwners.delete(message.id)
      releaseOperation(gen, entry.requestId)
      settle(entry, 'resolve', { ok: true, type: message.type, payload: message.payload })
      return
    }
    gen.pending.delete(message.id)
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

  function send(gen, message, { timeoutMs, expect, kind = 'request', requestId = null } = {}) {
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
      const entry = {
        resolve,
        reject,
        timer: null,
        expect: Array.isArray(expect) ? expect : null,
        kind,
        requestId,
      }
      entry.timer = setTimeout(() => {
        if (!gen.pending.has(message.id)) return
        gen.pending.delete(message.id)
        if (kind === 'synthesize' && requestId) markUnresolved(gen, requestId, 'timeout')
        reject({
          ok: false,
          code: QWEN_ERRORS.TIMEOUT,
          detail: 'worker request timed out',
          requestId,
          unknown: true,
        })
      }, effectiveTimeout)
      gen.pending.set(message.id, entry)
      try {
        gen.child.stdin.write(encoded.line + '\n')
      } catch {
        gen.pending.delete(message.id)
        if (kind === 'synthesize' && requestId) markUnresolved(gen, requestId, 'write-failed')
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
      operations: new Map(),
      messageOwners: new Map(),
      cancelMessages: new Map(),
      tempDirs: new Set([tempDir]),
      exitPromise: null,
      exitResolve: null,
      finalized: false,
      intentionalStop: false,
      stopRequested: false,
      protocolErrors: 0,
      protocolViolation: null,
    }
    generation = gen
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
      return failStart(gen, failure)
    }
    if (gen.stopRequested || gen !== generation || stopping) {
      /* A stop raced the handshake: never re-open admission for this generation. */
      return { ok: false, code: QWEN_ERRORS.STOPPING, detail: 'stop requested during the handshake', generation: gen.id }
    }
    if (ready.type !== 'ready') {
      return failStart(gen, stateError(QWEN_ERRORS.PROTOCOL_INVALID, 'first worker answer was not ready'))
    }
    gen.readyInfo = { ...ready.payload }
    accepting = true
    return { ok: true, ready: { ...ready.payload }, generation: gen.id }
  }

  function rejectState(error) {
    return {
      ok: false,
      code: (error && error.code) || QWEN_ERRORS.WORKER_UNAVAILABLE,
      detail: (error && error.detail) || '',
      unknown: Boolean(error && error.unknown),
      cancelled: Boolean(error && error.cancelled),
      cancelConfirmed: Boolean(error && error.cancelConfirmed),
      workerError: Boolean(error && error.workerError),
      workerRejected: Boolean(error && error.workerRejected),
      requestId: (error && error.requestId) || null,
    }
  }

  async function request(type, payload = {}, { timeoutMs, expect = ['result'] } = {}) {
    if (!generation || !generation.child) return stateError(QWEN_ERRORS.WORKER_UNAVAILABLE)
    if (type === 'synthesize' && (stopping || !accepting)) return stateError(QWEN_ERRORS.STOPPING, 'worker is not accepting work')
    try {
      return await send(generation, { v: QWEN_PROTOCOL_VERSION, id: nextId(type.slice(0, 3)), type, payload }, { timeoutMs, expect })
    } catch (error) {
      return rejectState(error)
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
    const gen = generation
    if (!gen || !gen.child) return stateError(QWEN_ERRORS.WORKER_UNAVAILABLE)
    if (stopping || !accepting) return stateError(QWEN_ERRORS.STOPPING, 'worker is not accepting work')
    const requestId = payload && payload.requestId ? payload.requestId : null
    if (!requestId) return stateError(QWEN_ERRORS.INVALID_INPUT, 'a request id is required')
    const { active, unresolved } = operationCounts(gen)
    if (active > 0 || unresolved > 0) {
      return stateError(QWEN_ERRORS.UNRESOLVED_ACTIVITY, 'the worker still owns an operation without a trusted terminal answer')
    }
    const messageId = nextId('syn')
    const operation = {
      requestId,
      messageId,
      state: 'ACTIVE',
      reason: null,
      startedAt: now(),
      identity: {
        model: payload.model,
        backend: payload.backend,
        voiceId: payload.voiceId,
      },
    }
    gen.operations.set(requestId, operation)
    gen.messageOwners.set(messageId, requestId)
    try {
      return await send(gen, { v: QWEN_PROTOCOL_VERSION, id: messageId, type: 'synthesize', payload }, { timeoutMs, expect: ['result'], kind: 'synthesize', requestId })
    } catch (error) {
      const current = gen.operations.get(requestId)
      if (current && current.state === 'ACTIVE') markUnresolved(gen, requestId, 'send-failed')
      return rejectState(error)
    }
  }

  /**
   * Cancel one synthesis. The caller's result is settled as CANCELLED only after a trusted
   * acknowledgement that names the same request id and a terminal `cancelled` state. A rejection,
   * timeout, wrong identity or progress event leaves the original operation untouched, and the
   * worker stays occupied until a correlated terminal message or a confirmed exit arrives.
   */
  async function cancel(requestId, { timeoutMs = QWEN_LIMITS.cancelAckTimeoutMs } = {}) {
    const gen = generation
    if (!gen || !gen.child) return { ok: false, code: QWEN_ERRORS.WORKER_UNAVAILABLE }
    if (typeof requestId !== 'string' || !requestId) return { ok: false, code: QWEN_ERRORS.INVALID_INPUT }
    const operation = gen.operations.get(requestId)
    if (!operation) return { ok: false, code: QWEN_ERRORS.UNKNOWN_REQUEST }
    operation.cancelRequested = true
    operation.cancelRequestedAt = now()
    const messageId = nextId('cnl')
    gen.cancelMessages.set(messageId, requestId)
    const result = await send(
      gen,
      { v: QWEN_PROTOCOL_VERSION, id: messageId, type: 'cancel', payload: { requestId } },
      { timeoutMs, expect: ['event', 'result'], kind: 'cancel', requestId },
    ).catch((error) => ({ ok: false, code: (error && error.code) || QWEN_ERRORS.WORKER_UNAVAILABLE, detail: (error && error.detail) || '', workerRejected: Boolean(error && error.workerRejected) }))
    gen.cancelMessages.delete(messageId)
    if (!result.ok) {
      if (result.code === QWEN_ERRORS.TIMEOUT) {
        return { ok: false, code: QWEN_ERRORS.UNKNOWN_RESULT, unknown: true, confirmed: false, requestId }
      }
      return { ok: false, code: result.code, confirmed: false, requestId, workerRejected: result.workerRejected === true }
    }
    const payload = result.payload || {}
    if (payload.requestId !== requestId || payload.state !== 'cancelled') {
      return {
        ok: false,
        code: QWEN_ERRORS.CANCEL_NOT_CONFIRMED,
        confirmed: false,
        requestId,
        ackType: result.type,
        ackState: payload.state || null,
      }
    }
    const entry = gen.pending.get(operation.messageId)
    if (entry) {
      gen.pending.delete(operation.messageId)
      settle(entry, 'reject', {
        ok: false,
        code: QWEN_ERRORS.CANCELLED,
        cancelled: true,
        cancelConfirmed: true,
        stopped: false,
        requestId,
      })
    }
    /* Keep the operation and its issued message id until the worker supplies a correlated terminal
     * answer or really exits; an acknowledgement is not proof of actual stop. */
    markUnresolved(gen, requestId, 'cancel-confirmed')
    return { ok: true, state: 'cancelled', ack: true, confirmed: true, stopped: false, requestId }
  }

  async function stop() {
    if (stopping) return stopping
    accepting = false
    if (generation) generation.stopRequested = true
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
        gen.operations.clear()
        gen.messageOwners.clear()
        gen.cancelMessages.clear()
      }
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
    const counts = operationCounts(gen)
    return {
      state: workerState,
      generation: gen ? gen.id : 0,
      pid: alive ? gen.child.pid : null,
      alive,
      accepting,
      stopping: Boolean(stopping),
      stopRequested: Boolean(gen && gen.stopRequested),
      startedAt: gen ? gen.startedAt : null,
      exit: gen && gen.exitInfo ? { ...gen.exitInfo } : null,
      error: gen && gen.errorInfo ? { ...gen.errorInfo } : null,
      ready: gen && gen.readyInfo ? { ...gen.readyInfo } : null,
      pendingRequests: gen ? gen.pending.size : 0,
      activeOperations: counts.active,
      unresolvedOperations: counts.unresolved,
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
