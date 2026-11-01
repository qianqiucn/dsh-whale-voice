/**
 * Cover shared logical lease — the offline stand-in for the Core's exclusive local-GPU claim.
 *
 * One sandbox capability owns at most one LOCAL_GPU lease. A CPU/CLOUD lease never occupies the GPU
 * slot, so a local task and a cloud/CPU task can overlap; two local tasks cannot. This is a logical
 * Fixture lease (no GPU, VRAM, process or device measurement) and is released by the executor on
 * every terminal path.
 */
import crypto from 'node:crypto'

import { isTrustedSandbox } from '../config-sandbox.mjs'

export const COVER_LEASE_SCHEMA_VERSION = 1

export const COVER_LEASE_CODES = Object.freeze({
  INPUT_INVALID: 'COVER_LEASE_INPUT_INVALID',
  BUSY: 'COVER_LEASE_BUSY',
})

const STATES = new WeakMap()

function stateOf(sandbox) {
  let state = STATES.get(sandbox)
  if (!state) {
    state = { gpu: null, cpu: new Map() }
    STATES.set(sandbox, state)
  }
  return state
}

function failure(key, errorPath) {
  return Object.freeze({
    ok: false,
    errors: Object.freeze([Object.freeze({ code: COVER_LEASE_CODES[key], path: errorPath || '$', reason: key.toLowerCase().replace(/_/g, ' ') })]),
  })
}

function canonicalIso(value) {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) return null
  return value
}

/**
 * Acquire one logical lease.
 * @param {{sandbox:object, compute?:'LOCAL_GPU'|'CPU_CLOUD', now:string}} input
 */
export function acquireCoverLease({ sandbox, compute = 'LOCAL_GPU', now } = {}) {
  if (!isTrustedSandbox(sandbox)) return failure('INPUT_INVALID', 'sandbox')
  if (compute !== 'LOCAL_GPU' && compute !== 'CPU_CLOUD') return failure('INPUT_INVALID', 'compute')
  const acquiredAt = canonicalIso(now)
  if (acquiredAt === null) return failure('INPUT_INVALID', 'now')
  const state = stateOf(sandbox)
  const leaseId = 'lease:cover:' + crypto.randomBytes(12).toString('hex')
  if (compute === 'LOCAL_GPU') {
    if (state.gpu !== null) return failure('BUSY', 'gpu')
    state.gpu = leaseId
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        schemaVersion: COVER_LEASE_SCHEMA_VERSION,
        leaseId,
        kind: 'LOGICAL_FIXTURE',
        gpu: 'EXCLUSIVE',
        compute: 'LOCAL_GPU',
        acquiredAt,
      }),
    })
  }
  state.cpu.set(leaseId, acquiredAt)
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: COVER_LEASE_SCHEMA_VERSION,
      leaseId,
      kind: 'LOGICAL_FIXTURE',
      gpu: 'NONE',
      compute: 'CPU_CLOUD',
      acquiredAt,
    }),
  })
}

/** Release one lease; an unknown id is a no-op so terminal cleanup is always safe. */
export function releaseCoverLease({ sandbox, leaseId } = {}) {
  if (!isTrustedSandbox(sandbox) || typeof leaseId !== 'string') return failure('INPUT_INVALID')
  const state = stateOf(sandbox)
  if (state.gpu === leaseId) state.gpu = null
  state.cpu.delete(leaseId)
  return Object.freeze({ ok: true, value: Object.freeze({ schemaVersion: COVER_LEASE_SCHEMA_VERSION, leaseId, released: true }) })
}

/** True while a local-GPU lease is held. */
export function isCoverGpuBusy(sandbox) {
  if (!isTrustedSandbox(sandbox)) return false
  return stateOf(sandbox).gpu !== null
}

/** Test/status helper: count of live CPU/cloud leases. */
export function coverCpuLeaseCount(sandbox) {
  if (!isTrustedSandbox(sandbox)) return 0
  return stateOf(sandbox).cpu.size
}
