/* Whale Voice — conservative cloud cost ledger (Plan11, offline unit).
 *
 * Paid cloud/custom execution needs an explicit integer price and a hard budget. A request
 * reserves a conservative character-based upper bound before it is sent; a success commits the
 * actual amount; a timeout/unknown keeps the reserved amount as UNKNOWN and never turns it into a
 * free retry. A PENDING reservation found after a restart becomes UNKNOWN, so a crash cannot make
 * the same spend disappear. The ledger is a small atomic JSON file in an application namespace and
 * contains no credential, text or endpoint.
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
  RESERVATION_NOT_FOUND: 'COST_RESERVATION_NOT_FOUND',
  OVER_RESERVED: 'COST_OVER_RESERVED',
  OVERFLOW: 'COST_OVERFLOW',
  LEDGER_CORRUPT: 'COST_LEDGER_CORRUPT',
  LEDGER_WRITE_FAILED: 'COST_LEDGER_WRITE_FAILED',
  CONFIG_MISMATCH: 'COST_CONFIG_MISMATCH',
})

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/
const MAX_COMPLETED = 512
const MAX_CHARS = 1000000

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

function isInteger(value) {
  return Number.isInteger(value) && Number.isSafeInteger(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function pendingTotal(state) {
  return state.reservations.reduce((sum, item) => sum + item.micros, 0)
}

function validState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.schemaVersion !== CLOUD_COST_SCHEMA_VERSION) return false
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) return false
  if (!isInteger(value.limitMicros) || value.limitMicros < 1) return false
  if (!isInteger(value.unitPriceMicrosPerCharacter) || value.unitPriceMicrosPerCharacter < 1) return false
  if (!isInteger(value.spentMicros) || value.spentMicros < 0) return false
  if (!isInteger(value.unknownMicros) || value.unknownMicros < 0) return false
  if (!Array.isArray(value.reservations) || value.reservations.length > 128) return false
  if (!Array.isArray(value.completed) || value.completed.length > MAX_COMPLETED) return false
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

/** Conservative character-based upper bound in integer micro-units of the configured currency. */
export function estimateCostMicros({ charCount, unitPriceMicrosPerCharacter }) {
  if (!isInteger(charCount) || charCount < 1 || charCount > MAX_CHARS) return fail(CLOUD_COST_ERRORS.INVALID)
  if (!isInteger(unitPriceMicrosPerCharacter) || unitPriceMicrosPerCharacter < 1) return fail(CLOUD_COST_ERRORS.UNKNOWN_PRICE)
  const micros = charCount * unitPriceMicrosPerCharacter
  if (!isInteger(micros)) return fail(CLOUD_COST_ERRORS.OVERFLOW)
  return { ok: true, micros }
}

/**
 * Open one application-owned budget ledger. Unknown price or limit fails closed; a PENDING
 * reservation recovered after a restart is counted as UNKNOWN (never silently released).
 */
export async function openCostLedger({
  rootDir,
  currency = 'USD',
  limitMicros = null,
  unitPriceMicrosPerCharacter = null,
  now = () => new Date(),
  hooks = {},
} = {}) {
  if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) return fail(CLOUD_COST_ERRORS.INVALID)
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return fail(CLOUD_COST_ERRORS.INVALID)
  if (!isInteger(limitMicros) || limitMicros < 1) return fail(CLOUD_COST_ERRORS.LIMIT_NOT_CONFIGURED)
  if (!isInteger(unitPriceMicrosPerCharacter) || unitPriceMicrosPerCharacter < 1) return fail(CLOUD_COST_ERRORS.UNKNOWN_PRICE)
  const namespaceDir = path.join(rootDir, CLOUD_COST_NAMESPACE)
  const target = path.join(namespaceDir, 'cost-ledger-v1.json')
  await fsp.mkdir(namespaceDir, { recursive: true, mode: 0o700 })

  let state
  let recoveredUnknown = 0
  try {
    const text = await fsp.readFile(target, 'utf8')
    let parsed
    try { parsed = JSON.parse(text) } catch { return fail(CLOUD_COST_ERRORS.LEDGER_CORRUPT) }
    if (!validState(parsed)) return fail(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
    if (parsed.currency !== currency) return fail(CLOUD_COST_ERRORS.CONFIG_MISMATCH)
    if (parsed.limitMicros !== limitMicros || parsed.unitPriceMicrosPerCharacter !== unitPriceMicrosPerCharacter) {
      return fail(CLOUD_COST_ERRORS.CONFIG_MISMATCH)
    }
    state = parsed
    if (state.reservations.length > 0) {
      const at = now().toISOString()
      for (const item of state.reservations) {
        state.unknownMicros += item.micros
        state.completed.push({ requestId: item.requestId, state: 'UNKNOWN', micros: item.micros, at })
        recoveredUnknown += 1
      }
      state.reservations = []
      state.completed = state.completed.slice(-MAX_COMPLETED)
      state.updatedAt = at
      await atomicWriteJson(target, state, hooks)
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      state = {
        schemaVersion: CLOUD_COST_SCHEMA_VERSION,
        currency,
        limitMicros,
        unitPriceMicrosPerCharacter,
        spentMicros: 0,
        unknownMicros: 0,
        reservations: [],
        completed: [],
        updatedAt: now().toISOString(),
      }
      try { await atomicWriteJson(target, state, hooks) } catch { return fail(CLOUD_COST_ERRORS.LEDGER_WRITE_FAILED) }
    } else {
      return fail(CLOUD_COST_ERRORS.LEDGER_CORRUPT)
    }
  }

  let queue = Promise.resolve()
  function enqueue(fn) {
    const run = queue.then(fn)
    queue = run.catch(() => {})
    return run
  }

  async function persist(next) {
    await atomicWriteJson(target, next, hooks)
  }

  async function mutate(fn) {
    const before = clone(state)
    let result
    try {
      result = await fn(state)
      if (result && result.ok === false) {
        state = before
        return result
      }
      state.updatedAt = now().toISOString()
      await persist(state)
      return result
    } catch {
      state = before
      return fail(CLOUD_COST_ERRORS.LEDGER_WRITE_FAILED)
    }
  }

  function snapshot() {
    const pendingMicros = pendingTotal(state)
    return {
      ok: true,
      schemaVersion: state.schemaVersion,
      currency: state.currency,
      limitMicros: state.limitMicros,
      unitPriceMicrosPerCharacter: state.unitPriceMicrosPerCharacter,
      spentMicros: state.spentMicros,
      unknownMicros: state.unknownMicros,
      pendingMicros,
      remainingMicros: state.limitMicros - state.spentMicros - state.unknownMicros - pendingMicros,
      pendingCount: state.reservations.length,
      completedCount: state.completed.length,
    }
  }

  function reserve({ requestId, charCount } = {}) {
    return enqueue(() => {
      if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) return fail(CLOUD_COST_ERRORS.INVALID)
      if (!isInteger(charCount) || charCount < 1 || charCount > MAX_CHARS) return fail(CLOUD_COST_ERRORS.INVALID)
      const duplicate = state.completed.find((item) => item.requestId === requestId)
      if (duplicate) return fail(CLOUD_COST_ERRORS.DUPLICATE_REQUEST, duplicate.state)
      const existing = state.reservations.find((item) => item.requestId === requestId)
      if (existing) return { ok: true, duplicate: true, reservationId: existing.reservationId, micros: existing.micros }
      const estimate = estimateCostMicros({ charCount, unitPriceMicrosPerCharacter: state.unitPriceMicrosPerCharacter })
      if (!estimate.ok) return estimate
      const pending = pendingTotal(state)
      if (state.spentMicros + state.unknownMicros + pending + estimate.micros > state.limitMicros) {
        return fail(CLOUD_COST_ERRORS.QUOTA_EXCEEDED)
      }
      const reservationId = `resv-${crypto.randomUUID()}`
      return mutate(() => {
        state.reservations.push({ reservationId, requestId, micros: estimate.micros, createdAt: now().toISOString() })
        return { ok: true, duplicate: false, reservationId, micros: estimate.micros }
      })
    })
  }

  function commit({ reservationId, actualMicros } = {}) {
    return enqueue(() => {
      const item = state.reservations.find((entry) => entry.reservationId === reservationId)
      if (!item) return fail(CLOUD_COST_ERRORS.RESERVATION_NOT_FOUND)
      if (!isInteger(actualMicros) || actualMicros < 0 || actualMicros > item.micros) {
        return fail(CLOUD_COST_ERRORS.OVER_RESERVED)
      }
      return mutate(() => {
        state.reservations = state.reservations.filter((entry) => entry.reservationId !== reservationId)
        state.spentMicros += actualMicros
        state.completed.push({ requestId: item.requestId, state: 'COMMITTED', micros: actualMicros, at: now().toISOString() })
        state.completed = state.completed.slice(-MAX_COMPLETED)
        return { ok: true, reservationId, micros: actualMicros }
      })
    })
  }

  function markUnknown({ reservationId } = {}) {
    return enqueue(() => {
      const item = state.reservations.find((entry) => entry.reservationId === reservationId)
      if (!item) return fail(CLOUD_COST_ERRORS.RESERVATION_NOT_FOUND)
      return mutate(() => {
        state.reservations = state.reservations.filter((entry) => entry.reservationId !== reservationId)
        state.unknownMicros += item.micros
        state.completed.push({ requestId: item.requestId, state: 'UNKNOWN', micros: item.micros, at: now().toISOString() })
        state.completed = state.completed.slice(-MAX_COMPLETED)
        return { ok: true, reservationId, micros: item.micros, state: 'UNKNOWN' }
      })
    })
  }

  function release({ reservationId } = {}) {
    return enqueue(() => {
      const item = state.reservations.find((entry) => entry.reservationId === reservationId)
      if (!item) return fail(CLOUD_COST_ERRORS.RESERVATION_NOT_FOUND)
      return mutate(() => {
        state.reservations = state.reservations.filter((entry) => entry.reservationId !== reservationId)
        state.completed.push({ requestId: item.requestId, state: 'RELEASED', micros: 0, at: now().toISOString() })
        state.completed = state.completed.slice(-MAX_COMPLETED)
        return { ok: true, reservationId, state: 'RELEASED' }
      })
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
