/* Whale Voice — conservative cloud cost and request ledger (Plan11, offline unit).
 *
 * One durable authority per ledger file. Every reserve/commit/unknown/release re-reads the file
 * under an in-process queue plus a bounded file lock, so two handles on the same root cannot spend
 * the same budget or overwrite each other. A paid request reserves a conservative character-based
 * upper bound before it is sent; a success commits the actual amount; a timeout/unknown keeps the
 * reservation as UNKNOWN and never turns it into a free retry. A PENDING reservation found after a
 * restart becomes UNKNOWN. A same-requestId PENDING duplicate is refused, not silently allowed to
 * enter transport a second time. The completed/deduplication history is bounded by `maxCalls` and
 * fails closed at capacity instead of truncating old UNKNOWN records. A free ledger mode shares the
 * same authority for explicit-free custom services (zero price, call/character limits, dedup).
 */

import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
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
const LOCK_STALE_MS = 30000
const MODES = new Set(['paid', 'free'])
const PATH_QUEUES = new Map()

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

async function atomicWriteJson(target, value, hooks) {
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
    if (hooks && typeof hooks.beforeRename === 'function') await hooks.beforeRename(temp, target)
    await fsp.rename(temp, target)
    try { await fsp.chmod(target, 0o600) } catch {}
  } catch (error) {
    if (handle && !closed) { try { await handle.close() } catch {} }
    try { await fsp.unlink(temp) } catch {}
    throw error
  }
}

async function acquireFileLock(lockPath) {
  const started = Date.now()
  for (;;) {
    try {
      const handle = await fsp.open(lockPath, 'wx', 0o600)
      try { await handle.writeFile(String(process.pid), 'utf8') } catch {}
      await handle.close()
      return
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_BUSY)
      try {
        const stat = await fsp.stat(lockPath)
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fsp.unlink(lockPath)
          continue
        }
      } catch {}
      if (Date.now() - started > LOCK_TIMEOUT_MS) throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_BUSY)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}

function withFileLock(target, fn) {
  const previous = PATH_QUEUES.get(target) || Promise.resolve()
  const run = previous.then(async () => {
    const lockPath = target + '.lock'
    await acquireFileLock(lockPath)
    try {
      return await fn()
    } finally {
      try { await fsp.unlink(lockPath) } catch {}
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
 * (explicit zero price, still call/character bounded and deduplicated). A PENDING reservation
 * recovered after a restart is counted as UNKNOWN, never silently released.
 */
export async function openCostLedger({
  rootDir,
  currency = 'USD',
  limitMicros = null,
  unitPriceMicrosPerCharacter = null,
  mode = 'paid',
  maxCalls = MAX_COMPLETED,
  now = () => new Date(),
  hooks = {},
} = {}) {
  const checked = normalizeOpenOptions({ rootDir, currency, limitMicros, unitPriceMicrosPerCharacter, mode, maxCalls })
  if (!checked.ok) return checked
  const namespaceDir = path.join(rootDir, CLOUD_COST_NAMESPACE)
  const target = path.join(namespaceDir, 'cost-ledger-v1.json')
  await fsp.mkdir(namespaceDir, { recursive: true, mode: 0o700 })

  function initialState() {
    return {
      schemaVersion: CLOUD_COST_SCHEMA_VERSION,
      currency,
      mode,
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

  async function readDisk() {
    let text
    try {
      text = await fsp.readFile(target, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
      throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
    }
    let parsed
    try { parsed = JSON.parse(text) } catch { throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT) }
    if (!validState(parsed)) throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
    assertConfig(parsed)
    return parsed
  }

  let state
  let recoveredUnknown = 0
  try {
    const opened = await withFileLock(target, async () => {
      let loaded
      try {
        loaded = await readDisk()
      } catch (error) {
        if (!(error instanceof CostFailure) || error.code !== CLOUD_COST_ERRORS.LEDGER_CORRUPT) throw error
        try {
          const stat = await fsp.stat(target)
          if (stat.isFile()) throw error
        } catch (statError) {
          if (statError instanceof CostFailure) throw statError
          if (!statError || statError.code !== 'ENOENT') throw new CostFailure(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
        }
        loaded = initialState()
        await atomicWriteJson(target, loaded, hooks)
        return { state: loaded, recovered: 0 }
      }
      if (loaded.reservations.length > 0) {
        const at = now().toISOString()
        const recovered = loaded.reservations.length
        for (const item of loaded.reservations) {
          loaded.unknownMicros += item.micros
          loaded.completed.push({ requestId: item.requestId, state: 'UNKNOWN', micros: item.micros, at })
        }
        loaded.reservations = []
        if (loaded.completed.length > loaded.maxCalls) {
          throw new CostFailure(CLOUD_COST_ERRORS.DEDUP_CAPACITY)
        }
        loaded.updatedAt = at
        await atomicWriteJson(target, loaded, hooks)
        return { state: loaded, recovered }
      }
      return { state: loaded, recovered: 0 }
    })
    state = opened.state
    recoveredUnknown = opened.recovered
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
    try {
      const next = await withFileLock(target, async () => {
        const current = await readDisk()
        assertConfig(current)
        const result = await fn(current)
        current.updatedAt = now().toISOString()
        await atomicWriteJson(target, current, hooks)
        return { state: current, result }
      })
      state = next.state
      return next.result
    } catch (error) {
      if (error instanceof CostFailure) return fail(error.code)
      return fail(CLOUD_COST_ERRORS.LEDGER_WRITE_FAILED)
    }
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
      current.reservations.push({ reservationId, requestId, micros, createdAt: now().toISOString() })
      return { ok: true, duplicate: false, reservationId, micros }
    })
  }

  function commit({ reservationId, actualMicros } = {}) {
    return run((current) => {
      const item = current.reservations.find((entry) => entry.reservationId === reservationId)
      if (!item) return fail(CLOUD_COST_ERRORS.RESERVATION_NOT_FOUND)
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
      current.reservations = current.reservations.filter((entry) => entry.reservationId !== reservationId)
      current.completed.push({ requestId: item.requestId, state: 'RELEASED', micros: 0, at: now().toISOString() })
      return { ok: true, reservationId, state: 'RELEASED' }
    })
  }

  return {
    ok: true,
    snapshot,
    reserve,
    commit,
    markUnknown,
    release,
    recoveredUnknown,
    namespace: CLOUD_COST_NAMESPACE,
  }
}
