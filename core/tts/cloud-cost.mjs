/* Whale Voice — conservative cloud cost and request ledger (Plan11, offline unit).
 *
 * One durable authority per ledger file. Every write uses an optimistic revision check plus a
 * token-owned short file lock; the slow temp-file write (and test hook) happens outside the lock,
 * and a lock is never removed just because its mtime is old. A release only deletes a lock whose
 * token still matches. A paid request reserves a conservative character-based upper bound before
 * it is sent; a success commits the actual amount; a timeout/unknown keeps the reservation as
 * UNKNOWN and never turns it into a free retry. A same-requestId PENDING duplicate is refused.
 *
 * Reservations carry an execution owner (ownerId/pid/host). A normal open by another live handle
 * does not convert those PENDING entries; only a PENDING whose owner is no longer alive (or is
 * absent from an older record) becomes UNKNOWN. A full dedup history fails closed instead of
 * truncating old UNKNOWN ids. A `free` mode shares the same authority (zero price, call/character
 * limits, dedup) for explicitly confirmed free custom services.
 */

import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const CLOUD_COST_SCHEMA_VERSION = 1
export const CLOUD_COST_NAMESPACE = 'whale-voice-cost-v1'

export const CLOUD_COST_ERRORS = Object.freeze({
  INVALID: 'COST_INVALID',
  UNKNOWN_PRICE: 'COST_UNKNOWN',
  LIMIT_NOT_CONFIGURED: 'COST_LIMIT_NOT_CONFIGURED',
  QUOTA_EXCEEDED: 'COST_QUOTA_EXCEEDED',
  DUPLICATE_REQUEST: 'COST_DUPLICATE_REQUEST',
  CALL_LIMIT_EXCEEDED: 'COST_CALL_LIMIT_EXCEEDED',
  DEDUP_CAPACITY: 'COST_DEDUP_CAPACITY',
  RESERVATION_NOT_FOUND: 'COST_RESERVATION_NOT_FOUND',
  OWNERSHIP_MISMATCH: 'COST_OWNERSHIP_MISMATCH',
  OVER_RESERVED: 'COST_OVER_RESERVED',
  OVERFLOW: 'COST_OVERFLOW',
  LEDGER_CORRUPT: 'COST_LEDGER_CORRUPT',
  LEDGER_BUSY: 'COST_LEDGER_BUSY',
  LEDGER_WRITE_FAILED: 'COST_LEDGER_WRITE_FAILED',
  CONFIG_MISMATCH: 'COST_CONFIG_MISMATCH',
})

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/
const MAX_COMPLETED = 512
const MAX_CHARS = 1000000
const LOCK_TIMEOUT_MS = 5000
const MAX_WRITE_ATTEMPTS = 4
const MODES = new Set(['paid', 'free'])
const PATH_QUEUES = new Map()
const LIVE_OWNERS = new Set()

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

function isInteger(value) {
  return Number.isInteger(value) && Number.isSafeInteger(value)
}

class CostFailure extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

function pendingTotal(state) {
  return state.reservations.reduce((sum, item) => sum + item.micros, 0)
}

function validState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.schemaVersion !== CLOUD_COST_SCHEMA_VERSION) return false
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) return false
  if (!MODES.has(value.mode)) return false
  if (!isInteger(value.revision) || value.revision < 0) return false
  if (!isInteger(value.maxCalls) || value.maxCalls < 1 || value.maxCalls > MAX_COMPLETED) return false
  if (!isInteger(value.limitMicros) || value.limitMicros < 0) return false
  if (!isInteger(value.unitPriceMicrosPerCharacter) || value.unitPriceMicrosPerCharacter < 0) return false
  if (value.mode === 'paid' && (value.limitMicros < 1 || value.unitPriceMicrosPerCharacter < 1)) return false
  if (value.mode === 'free' && (value.limitMicros !== 0 || value.unitPriceMicrosPerCharacter !== 0)) return false
  if (!isInteger(value.spentMicros) || value.spentMicros < 0) return false
  if (!isInteger(value.unknownMicros) || value.unknownMicros < 0) return false
  if (!Array.isArray(value.reservations) || value.reservations.length > value.maxCalls) return false
  if (!Array.isArray(value.completed) || value.completed.length > value.maxCalls) return false
  if (value.reservations.length + value.completed.length > value.maxCalls) return false
  for (const item of value.reservations) {
    if (!item || typeof item !== 'object') return false
    if (typeof item.reservationId !== 'string' || typeof item.requestId !== 'string') return false
    if (!isInteger(item.micros) || item.micros < 0) return false
    if (typeof item.createdAt !== 'string') return false
  }
  for (const item of value.completed) {
    if (!item || typeof item !== 'object') return false
    if (typeof item.requestId !== 'string' || typeof item.state !== 'string') return false
    if (!isInteger(item.micros) || item.micros < 0) return false
    if (typeof item.at !== 'string') return false
  }
  return true
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function ownerIsLive(item) {
  if (item && typeof item.ownerId === 'string' && LIVE_OWNERS.has(item.ownerId)) return true
  if (!item || item.ownerHost !== os.hostname() || !isInteger(item.ownerPid) || item.ownerPid < 1) return false
  /* A same-process reservation that is not in LIVE_OWNERS belongs to a handle that was closed or
   * lost its execution owner; a live handle always registers its ownerId at open. A different
   * process is still checked by liveness. */
  if (item.ownerPid === process.pid) return false
  try {
    process.kill(item.ownerPid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

async function prepareTemp(target, value, hooks) {
  const directory = path.dirname(target)
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 })
  const temp = path.join(directory, `.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`)
  let handle = null
  let closed = false
  try {
    handle = await fsp.open(temp, 'wx', 0o600)
    await handle.writeFile(JSON.stringify(value) + '\n', 'utf8')
    await handle.sync()
    await handle.close()
    closed = true
    /* The slow test hook deliberately runs outside the file lock, so a live holder cannot be
     * mistaken for a crashed owner merely because it is taking a long time to write. */
    if (hooks && typeof hooks.beforeRename === 'function') await hooks.beforeRename(temp, target)
    return temp
  } catch (error) {
    if (handle && !closed) { try { await handle.close() } catch {} }
    try { await fsp.unlink(temp) } catch {}
    throw error
  }
}

async function commitTemp(temp, target) {
  await fsp.rename(temp, target)
  try { await fsp.chmod(target, 0o600) } catch {}
}

async function discardTemp(temp) {
  try { await fsp.unlink(temp) } catch {}
}

async function readDisk(target) {
  let text
  try {
    text = await fsp.readFile(target, 'utf8')
  } catch {
    throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
  }
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT) }
  if (!validState(parsed)) throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
  return parsed
}

async function acquireLock(target, timeoutMs) {
  const lockPath = target + '.lock'
  const token = crypto.randomBytes(24).toString('hex')
  const started = Date.now()
  for (;;) {
    try {
      const handle = await fsp.open(lockPath, 'wx', 0o600)
      await handle.writeFile(JSON.stringify({
        schemaVersion: 1,
        token,
        pid: process.pid,
        host: os.hostname(),
        createdAt: new Date().toISOString(),
      }), 'utf8')
      await handle.close()
      return { lockPath, token }
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_BUSY)
      /* No mtime-based stealing and no PID guess: a lock is either released by its owner or the
       * operation fails closed as BUSY. */
      if (Date.now() - started > timeoutMs) throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_BUSY)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}

async function releaseLock(lock) {
  try {
    const text = await fsp.readFile(lock.lockPath, 'utf8')
    let parsed
    try { parsed = JSON.parse(text) } catch { return }
    if (parsed && parsed.token === lock.token) await fsp.unlink(lock.lockPath)
  } catch {}
}

async function withLock(target, fn, timeoutMs) {
  const previous = PATH_QUEUES.get(target) || Promise.resolve()
  const run = previous.then(async () => {
    const lock = await acquireLock(target, timeoutMs)
    try {
      return await fn()
    } finally {
      await releaseLock(lock)
    }
  })
  PATH_QUEUES.set(target, run.then(() => {}, () => {}))
  return run
}

/** Conservative character-based upper bound in integer micro-units of the configured currency. */
export function estimateCostMicros({ charCount, unitPriceMicrosPerCharacter }) {
  if (!isInteger(charCount) || charCount < 1 || charCount > MAX_CHARS) return fail(CLOUD_COST_ERRORS.INVALID)
  if (!isInteger(unitPriceMicrosPerCharacter) || unitPriceMicrosPerCharacter < 1) return fail(CLOUD_COST_ERRORS.UNKNOWN_PRICE)
  const micros = charCount * unitPriceMicrosPerCharacter
  if (!isInteger(micros)) return fail(CLOUD_COST_ERRORS.OVERFLOW)
  return { ok: true, micros }
}

function normalizeOpenOptions({ rootDir, currency, limitMicros, unitPriceMicrosPerCharacter, mode, maxCalls }) {
  if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) return fail(CLOUD_COST_ERRORS.INVALID)
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return fail(CLOUD_COST_ERRORS.INVALID)
  if (!MODES.has(mode)) return fail(CLOUD_COST_ERRORS.INVALID)
  if (!isInteger(maxCalls) || maxCalls < 1 || maxCalls > MAX_COMPLETED) return fail(CLOUD_COST_ERRORS.INVALID)
  if (mode === 'paid') {
    if (!isInteger(limitMicros) || limitMicros < 1) return fail(CLOUD_COST_ERRORS.LIMIT_NOT_CONFIGURED)
    if (!isInteger(unitPriceMicrosPerCharacter) || unitPriceMicrosPerCharacter < 1) return fail(CLOUD_COST_ERRORS.UNKNOWN_PRICE)
  } else {
    if (limitMicros !== 0) return fail(CLOUD_COST_ERRORS.LIMIT_NOT_CONFIGURED)
    if (unitPriceMicrosPerCharacter !== 0) return fail(CLOUD_COST_ERRORS.UNKNOWN_PRICE)
  }
  return { ok: true }
}

/**
 * Open one application-owned budget/request ledger. `mode` is `paid` (character price) or `free`
 * (explicit zero price, still call/character bounded and deduplicated). A PENDING reservation whose
 * execution owner is no longer live becomes UNKNOWN; a PENDING owned by a live handle/process is
 * left alone.
 */
export async function openCostLedger({
  rootDir,
  currency = 'USD',
  limitMicros = null,
  unitPriceMicrosPerCharacter = null,
  mode = 'paid',
  maxCalls = MAX_COMPLETED,
  lockTimeoutMs = LOCK_TIMEOUT_MS,
  now = () => new Date(),
  hooks = {},
} = {}) {
  const checked = normalizeOpenOptions({ rootDir, currency, limitMicros, unitPriceMicrosPerCharacter, mode, maxCalls })
  if (!checked.ok) return checked
  if (!isInteger(lockTimeoutMs) || lockTimeoutMs < 50 || lockTimeoutMs > 60000) return fail(CLOUD_COST_ERRORS.INVALID)
  const namespaceDir = path.join(rootDir, CLOUD_COST_NAMESPACE)
  const target = path.join(namespaceDir, 'cost-ledger-v1.json')
  await fsp.mkdir(namespaceDir, { recursive: true, mode: 0o700 })
  const ownerId = `owner-${crypto.randomUUID()}`

  function initialState() {
    return {
      schemaVersion: CLOUD_COST_SCHEMA_VERSION,
      currency,
      mode,
      revision: 0,
      maxCalls,
      limitMicros: mode === 'paid' ? limitMicros : 0,
      unitPriceMicrosPerCharacter: mode === 'paid' ? unitPriceMicrosPerCharacter : 0,
      spentMicros: 0,
      unknownMicros: 0,
      reservations: [],
      completed: [],
      updatedAt: now().toISOString(),
    }
  }

  function assertConfig(state) {
    if (state.currency !== currency || state.mode !== mode || state.maxCalls !== maxCalls ||
        state.limitMicros !== (mode === 'paid' ? limitMicros : 0) ||
        state.unitPriceMicrosPerCharacter !== (mode === 'paid' ? unitPriceMicrosPerCharacter : 0)) {
      throw new CostFailure(CLOUD_COST_ERRORS.CONFIG_MISMATCH)
    }
  }

  let state
  let recoveredUnknown = 0
  try {
    const opened = await withLock(target, async () => {
      let loaded
      let exists = true
      try {
        loaded = await readDisk(target)
      } catch (error) {
        if (!(error instanceof CostFailure) || error.code !== CLOUD_COST_ERRORS.LEDGER_CORRUPT) throw error
        try {
          await fsp.stat(target)
        } catch (statError) {
          if (!statError || statError.code !== 'ENOENT') throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
          exists = false
          loaded = initialState()
        }
        if (exists) throw error
      }
      assertConfig(loaded)
      let recovered = 0
      let changed = !exists
      const liveReservations = []
      for (const item of loaded.reservations) {
        if (ownerIsLive(item)) {
          liveReservations.push(item)
          continue
        }
        const at = now().toISOString()
        loaded.unknownMicros += item.micros
        loaded.completed.push({ requestId: item.requestId, state: 'UNKNOWN', micros: item.micros, at })
        recovered += 1
        changed = true
      }
      loaded.reservations = liveReservations
      if (loaded.completed.length + loaded.reservations.length > loaded.maxCalls) {
        throw new CostFailure(CLOUD_COST_ERRORS.DEDUP_CAPACITY)
      }
      if (changed) {
        loaded.revision += 1
        loaded.updatedAt = now().toISOString()
        const temp = await prepareTemp(target, loaded, hooks)
        try { await commitTemp(temp, target) } catch (error) { await discardTemp(temp); throw error }
      }
      return { state: loaded, recovered }
    }, lockTimeoutMs)
    state = opened.state
    recoveredUnknown = opened.recovered
    LIVE_OWNERS.add(ownerId)
  } catch (error) {
    if (error instanceof CostFailure) return fail(error.code)
    return fail(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
  }

  function snapshot() {
    const pendingMicros = pendingTotal(state)
    return {
      ok: true,
      schemaVersion: state.schemaVersion,
      currency: state.currency,
      mode: state.mode,
      revision: state.revision,
      maxCalls: state.maxCalls,
      limitMicros: state.limitMicros,
      unitPriceMicrosPerCharacter: state.unitPriceMicrosPerCharacter,
      spentMicros: state.spentMicros,
      unknownMicros: state.unknownMicros,
      pendingMicros,
      remainingMicros: state.limitMicros - state.spentMicros - state.unknownMicros - pendingMicros,
      pendingCount: state.reservations.length,
      completedCount: state.completed.length,
      callsUsed: state.completed.length + state.reservations.length,
    }
  }

  async function run(fn) {
    let lastError = null
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      let base
      try {
        base = await readDisk(target)
        assertConfig(base)
      } catch (error) {
        return fail(error instanceof CostFailure ? error.code : CLOUD_COST_ERRORS.LEDGER_CORRUPT)
      }
      const next = clone(base)
      let result
      try {
        result = await fn(next)
      } catch {
        return fail(CLOUD_COST_ERRORS.LEDGER_WRITE_FAILED)
      }
      if (result && result.ok === false) return result
      next.revision = base.revision + 1
      next.updatedAt = now().toISOString()
      let temp
      try {
        temp = await prepareTemp(target, next, hooks)
      } catch {
        return fail(CLOUD_COST_ERRORS.LEDGER_WRITE_FAILED)
      }
      let lock = null
      try {
        lock = await acquireLock(target, lockTimeoutMs)
        const current = await readDisk(target)
        assertConfig(current)
        if (current.revision !== base.revision) {
          await discardTemp(temp)
          continue
        }
        await commitTemp(temp, target)
        state = next
        return result
      } catch (error) {
        await discardTemp(temp)
        lastError = error instanceof CostFailure ? error.code : CLOUD_COST_ERRORS.LEDGER_WRITE_FAILED
        if (lastError === CLOUD_COST_ERRORS.LEDGER_BUSY) break
      } finally {
        if (lock) await releaseLock(lock)
      }
    }
    return fail(lastError || CLOUD_COST_ERRORS.LEDGER_BUSY)
  }

  function reserve({ requestId, charCount } = {}) {
    return run((current) => {
      if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) return fail(CLOUD_COST_ERRORS.INVALID)
      if (!isInteger(charCount) || charCount < 1 || charCount > MAX_CHARS) return fail(CLOUD_COST_ERRORS.INVALID)
      const duplicate = current.completed.find((item) => item.requestId === requestId)
      if (duplicate) return fail(CLOUD_COST_ERRORS.DUPLICATE_REQUEST, duplicate.state)
      if (current.reservations.some((item) => item.requestId === requestId)) {
        return fail(CLOUD_COST_ERRORS.DUPLICATE_REQUEST, 'PENDING')
      }
      if (current.completed.length + current.reservations.length >= current.maxCalls) {
        return fail(CLOUD_COST_ERRORS.CALL_LIMIT_EXCEEDED)
      }
      let micros = 0
      if (current.mode === 'paid') {
        const estimate = estimateCostMicros({ charCount, unitPriceMicrosPerCharacter: current.unitPriceMicrosPerCharacter })
        if (!estimate.ok) return estimate
        micros = estimate.micros
        const pending = pendingTotal(current)
        if (current.spentMicros + current.unknownMicros + pending + micros > current.limitMicros) {
          return fail(CLOUD_COST_ERRORS.QUOTA_EXCEEDED)
        }
      }
      const reservationId = `resv-${crypto.randomUUID()}`
      current.reservations.push({
        reservationId,
        requestId,
        micros,
        createdAt: now().toISOString(),
        ownerId,
        ownerPid: process.pid,
        ownerHost: os.hostname(),
      })
      return { ok: true, duplicate: false, reservationId, micros }
    })
  }

  function commit({ reservationId, actualMicros } = {}) {
    return run((current) => {
      const item = current.reservations.find((entry) => entry.reservationId === reservationId)
      if (!item) return fail(CLOUD_COST_ERRORS.RESERVATION_NOT_FOUND)
      if (item.ownerId !== ownerId) return fail(CLOUD_COST_ERRORS.OWNERSHIP_MISMATCH)
      if (!isInteger(actualMicros) || actualMicros < 0 || actualMicros > item.micros) {
        return fail(CLOUD_COST_ERRORS.OVER_RESERVED)
      }
      current.reservations = current.reservations.filter((entry) => entry.reservationId !== reservationId)
      current.spentMicros += actualMicros
      current.completed.push({ requestId: item.requestId, state: 'COMMITTED', micros: actualMicros, at: now().toISOString() })
      return { ok: true, reservationId, micros: actualMicros }
    })
  }

  function markUnknown({ reservationId } = {}) {
    return run((current) => {
      const item = current.reservations.find((entry) => entry.reservationId === reservationId)
      if (!item) return fail(CLOUD_COST_ERRORS.RESERVATION_NOT_FOUND)
      if (item.ownerId !== ownerId) return fail(CLOUD_COST_ERRORS.OWNERSHIP_MISMATCH)
      current.reservations = current.reservations.filter((entry) => entry.reservationId !== reservationId)
      current.unknownMicros += item.micros
      current.completed.push({ requestId: item.requestId, state: 'UNKNOWN', micros: item.micros, at: now().toISOString() })
      return { ok: true, reservationId, micros: item.micros, state: 'UNKNOWN' }
    })
  }

  function release({ reservationId } = {}) {
    return run((current) => {
      const item = current.reservations.find((entry) => entry.reservationId === reservationId)
      if (!item) return fail(CLOUD_COST_ERRORS.RESERVATION_NOT_FOUND)
      if (item.ownerId !== ownerId) return fail(CLOUD_COST_ERRORS.OWNERSHIP_MISMATCH)
      current.reservations = current.reservations.filter((entry) => entry.reservationId !== reservationId)
      current.completed.push({ requestId: item.requestId, state: 'RELEASED', micros: 0, at: now().toISOString() })
      return { ok: true, reservationId, state: 'RELEASED' }
    })
  }

  function close() {
    LIVE_OWNERS.delete(ownerId)
  }

  return {
    ok: true,
    ownerId,
    snapshot,
    reserve,
    commit,
    markUnknown,
    release,
    close,
    recoveredUnknown,
    namespace: CLOUD_COST_NAMESPACE,
  }
}
