/* Whale Voice — isolated persistent task owner (Plan 08-D-C, OFFLINE / FIXTURE_ONLY).
 *
 * One accepted attempt per catalog birth task, inside the same Node process and the same trusted
 * sandbox capability:
 *   trusted sandbox -> catalog birth record (catalog stays the only TaskId issuer)
 *   -> atomic CLAIMED snapshot -> the existing internal existing-record engine at most once
 *   -> validated FINAL snapshot -> safe projection.
 *
 * Every dependent action is guarded by a fresh, restricted read of the two fixed store files:
 * the factory, `run` and `get` re-read the birth registry and re-check *all* owner associations,
 * and so do the checkpoints after the claim, after the engine returned and after the final commit.
 * A broken or externally changed birth registry therefore stops the engine instead of being
 * discovered by the next `get`.
 *
 * Repeated run/get calls only read the stored conclusion; a confirmed claim without a trusted
 * FINAL stays an unreleasable tombstone. The first attempt that cannot be confirmed returns the
 * fixed `TASK_OWNER_EXECUTION_UNKNOWN` error (never `ok:true`/RECORDED); later run/get calls report
 * the same tombstone as the safe UNKNOWN projection. This module keeps no queue, recovery or
 * cross-process state of its own: the serial queue, confirmed digests, fresh association reads and
 * the shared unknown lock come from `fixture-task-store-internal.mjs`.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { isTrustedSandbox } from '../config-sandbox.mjs'
import { projectAudioTask, validateAudioTaskRecord } from './task-contract.mjs'
import {
  TASK_FIXTURE_SCHEMA_VERSION,
  runExistingFixtureTaskOnce,
} from './task-fixture-engine-internal.mjs'
import { RVC_FAKE_ERRORS } from '../svc/rvc-fake-gateway.mjs'
import {
  INITIAL_STATES,
  OWNER_NO_EXECUTION_REASONS,
  OWNER_SIMULATED_STATES,
  OWNER_SNAPSHOT_SCHEMA_VERSION,
  SCOPE_PATTERN,
  STORE_DOMAINS,
  TASK_ID_PATTERN,
  checkSandbox,
  enqueue,
  getStoreState,
  hasOwn,
  isPlainObject,
  isStoreFailure,
  keySurface,
  lockStore,
  openOwnerFile,
  raiseStore,
  sameOwnerImmutable,
  sha256,
  stableStringify,
  storeReason,
  verifyOwnerAssociations,
} from './fixture-task-store-internal.mjs'

export const TASK_OWNER_SCHEMA_VERSION = OWNER_SNAPSHOT_SCHEMA_VERSION

const ERROR_KEYS = Object.freeze([
  'INVALID_INPUT',
  'RESOURCE_LIMIT',
  'UNSUPPORTED_VERSION',
  'SANDBOX_INVALID',
  'NOT_FOUND',
  'BIRTH_INVALID',
  'STORE_INVALID',
  'STORE_CHANGED',
  'WRITE_REJECTED',
  'WRITE_UNKNOWN',
  'OWNER_UNKNOWN',
  'EXECUTION_UNKNOWN',
  'DEPENDENCY_FAILURE',
  'INTERNAL_FAILURE',
])

/** Fixed error protocol. Every value is `TASK_OWNER_` plus the key itself. */
export const TASK_OWNER_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'TASK_OWNER_' + key])),
)

const RUN_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId', 'input']))
const GET_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId']))
const INPUT_KEYS = Object.freeze(new Set(['schemaVersion', 'sourceInput', 'readiness', 'context']))

/* The existing internal engine keeps its own frozen protocol; this owner only adapts it. */
const ENGINE_ROOT_KEYS = Object.freeze(new Set(['record', 'result']))
const ENGINE_RESULT_KEYS = Object.freeze(new Set(['ok', 'value']))
const ENGINE_VALUE_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'phase',
    'reason',
    'messageZh',
    'sourceCheck',
    'readiness',
    'execution',
    'task',
    'states',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
  ]),
)
const ENGINE_PHASES = Object.freeze(new Set(['BLOCKED', 'SIMULATED']))
const MAX_MESSAGE_LENGTH = 512
const RVC_REASONS = Object.freeze(Object.values(RVC_FAKE_ERRORS))

const MESSAGES_ZH = Object.freeze({
  SIMULATED: '演示执行已完成：结果只保存在当前隔离目录，不会发送或保存为真实资产。',
  NO_EXECUTION: '本次演示没有执行真实生成：任务保持原状态，系统不会自动重试。',
  UNKNOWN: '无法确认这次演示是否完成；系统不会自动重跑，请人工核对。',
})

function failure(key, errorPath) {
  const code = TASK_OWNER_ERRORS[key] || TASK_OWNER_ERRORS.INTERNAL_FAILURE
  return deepFreezeFixtureValue({
    ok: false,
    errors: [{ code, path: errorPath, reason: storeReason(key) }],
  })
}

function raise(key, errorPath) {
  raiseStore(key, errorPath)
}

function toFailure(error) {
  if (isStoreFailure(error) && TASK_OWNER_ERRORS[error.key]) return failure(error.key, error.errorPath)
  return failure('INTERNAL_FAILURE', '$')
}

function project(record) {
  let projected
  try {
    projected = projectAudioTask(record)
  } catch {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (!projected || typeof projected !== 'object' || typeof projected.ok !== 'boolean') {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (projected.ok === false) raise('DEPENDENCY_FAILURE', '$')
  if (!isPlainObject(projected.value)) raise('DEPENDENCY_FAILURE', '$')
  return projected.value
}

function successValue(outcome, revision, record, ownerState, reason) {
  const normalized = ownerState === 'SIMULATED' ? null : reason
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: TASK_OWNER_SCHEMA_VERSION,
      outcome,
      revision,
      ownerState,
      reason: normalized,
      task: project(record),
      userMessageZh: MESSAGES_ZH[ownerState],
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

function unknownValue(outcome, revision, record) {
  return successValue(outcome, revision, record, 'UNKNOWN', TASK_OWNER_ERRORS.EXECUTION_UNKNOWN)
}

/* ------------------------------- fresh association gates (R01) ------------------------------- */

function birthOf(catalog, scopeId, taskId) {
  return catalog.entries.find((item) => item.scopeId === scopeId && item.record.taskId === taskId) || null
}

/**
 * Restricted real reads of the two fixed files plus the full association gate. Nothing here is
 * cached: `openOwnerFile` re-validates the capability and re-reads the owner bytes bounded, and the
 * shared `verifyOwnerAssociations` (one implementation, also used by the owner write transaction)
 * re-resolves every owner entry against a freshly read birth registry.
 */
function freshAssociations(state) {
  const owner = openOwnerFile(state).read()
  const catalog = verifyOwnerAssociations(state, owner.snapshot)
  return { catalog, owner }
}

function requireClaimed(owner, scopeId, taskId) {
  const entry = entryFor(owner.snapshot, scopeId, taskId)
  if (!entry || entry.phase !== 'CLAIMED') raise('STORE_INVALID', '$')
  return entry
}

/* --------------------------------------- input readers -------------------------------------- */

function ownDataField(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return { ok: false }
  return { ok: true, value: descriptor.value }
}

function readExactRoot(payload, allowed, errorPath) {
  if (!isPlainObject(payload)) raise('INVALID_INPUT', errorPath)
  let keys
  try {
    keys = Reflect.ownKeys(payload)
  } catch {
    raise('INVALID_INPUT', errorPath)
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) raise('INVALID_INPUT', '<unknown-key>')
  }
  if (keys.length !== allowed.size) raise('INVALID_INPUT', errorPath)
  for (const key of keys) {
    if (!ownDataField(payload, key).ok) raise('INVALID_INPUT', errorPath)
  }
  if (payload.schemaVersion !== TASK_OWNER_SCHEMA_VERSION) raise('UNSUPPORTED_VERSION', 'schemaVersion')
}

function validateScopeTask(payload) {
  if (typeof payload.scopeId !== 'string' || !SCOPE_PATTERN.test(payload.scopeId)) raise('INVALID_INPUT', 'scopeId')
  if (typeof payload.taskId !== 'string' || !TASK_ID_PATTERN.test(payload.taskId)) raise('INVALID_INPUT', 'taskId')
}

function readRun(input) {
  readExactRoot(input, RUN_KEYS, '$')
  validateScopeTask(input)
  const copiedInput = copyFixtureInput(input.input)
  if (!copiedInput.ok) raise(copiedInput.key, 'input')
  const payload = copiedInput.value
  if (!isPlainObject(payload)) raise('INVALID_INPUT', 'input')
  const surface = keySurface(payload, INPUT_KEYS)
  if (surface === 'unknown') raise('INVALID_INPUT', 'input')
  if (surface !== 'ok') raise('INVALID_INPUT', 'input')
  if (payload.schemaVersion !== 1) raise('UNSUPPORTED_VERSION', 'input')
  return { scopeId: input.scopeId, taskId: input.taskId, input: payload }
}

function readGet(input) {
  readExactRoot(input, GET_KEYS, '$')
  validateScopeTask(input)
  return { scopeId: input.scopeId, taskId: input.taskId }
}

function readOptions(options) {
  if (!isPlainObject(options)) raise('INVALID_INPUT', '$')
  const keys = Reflect.ownKeys(options)
  if (keys.length !== 1 || keys[0] !== 'sandbox') {
    raise('INVALID_INPUT', keys.length === 0 ? '$' : '<unknown-key>')
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, 'sandbox')
  if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) raise('INVALID_INPUT', '$')
  if (!isTrustedSandbox(descriptor.value)) raise('SANDBOX_INVALID', '$')
  return descriptor.value
}

/* ---------------------------------------- owner file ---------------------------------------- */

function writeOwner(state, bytes, baseDigest, revision) {
  return openOwnerFile(state).write(bytes, baseDigest, revision)
}

function entryFor(snapshot, scopeId, taskId) {
  return snapshot.entries.find((item) => item.scopeId === scopeId && item.taskId === taskId) || null
}

/* ------------------------------ existing engine adapter guard (R02) ------------------------- */

function engineObject(value, allowed) {
  if (!isPlainObject(value)) return null
  if (keySurface(value, allowed) !== 'ok') return null
  const copied = {}
  for (const key of allowed) {
    const field = ownDataField(value, key)
    if (!field.ok) return null
    copied[key] = field.value
  }
  return copied
}

function projectOrNull(record) {
  let projected
  try {
    projected = projectAudioTask(record)
  } catch {
    return null
  }
  if (!projected || typeof projected !== 'object' || typeof projected.ok !== 'boolean') return null
  if (projected.ok !== true || !isPlainObject(projected.value)) return null
  return projected.value
}

/**
 * Data-descriptor-only copy of the engine's task projection. Accessors, hidden keys, Symbols and
 * extra keys are rejected without being invoked, so the later structural comparison can never run a
 * getter or silently drop a non-enumerable key. This is a bounded copy, not a second Task Schema.
 */
function copyDataGraph(value, depth) {
  if (depth > 6) return { ok: false }
  if (value === null) return { ok: true, value: null }
  const type = typeof value
  if (type === 'string' || type === 'boolean') return { ok: true, value }
  if (type === 'number' && Number.isFinite(value)) return { ok: true, value }
  if (type !== 'object') return { ok: false }
  if (Array.isArray(value)) {
    const length = value.length
    if (!Number.isInteger(length) || length > 64) return { ok: false }
    if (Reflect.ownKeys(value).length !== length + 1) return { ok: false }
    const copied = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return { ok: false }
      const inner = copyDataGraph(descriptor.value, depth + 1)
      if (!inner.ok) return { ok: false }
      copied.push(inner.value)
    }
    return { ok: true, value: copied }
  }
  if (!isPlainObject(value)) return { ok: false }
  const keys = Reflect.ownKeys(value)
  if (keys.length > 32) return { ok: false }
  const copied = {}
  for (const key of keys) {
    if (typeof key !== 'string') return { ok: false }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return { ok: false }
    const inner = copyDataGraph(descriptor.value, depth + 1)
    if (!inner.ok) return { ok: false }
    copied[key] = inner.value
  }
  return { ok: true, value: copied }
}

/** Guard `value.task` against the real expected projection key set before comparing it. */
function guardProjection(value, expected) {
  const top = engineObject(value, new Set(Object.keys(expected)))
  if (top === null) return null
  const copied = copyDataGraph(top, 0)
  if (!copied.ok) return null
  return copied.value
}

/**
 * Thin adapter guard for the unchanged existing engine. It re-checks the frozen protocol shape,
 * the fixed safety flags, the immutable birth identity, the real old validator, the complete
 * `projectAudioTask` equality with the engine's own projection, and the legal phase/reason/state
 * combinations. Any deviation is treated as an unusable result, never echoed back.
 */
function interpretEngine(out, birthRecord) {
  try {
    return interpretEngineUnsafe(out, birthRecord)
  } catch {
    return null
  }
}

function interpretEngineUnsafe(out, birthRecord) {
  const root = engineObject(out, ENGINE_ROOT_KEYS)
  if (root === null) return null
  const result = engineObject(root.result, ENGINE_RESULT_KEYS)
  if (result === null) return null
  if (result.ok !== true) return null
  const value = engineObject(result.value, ENGINE_VALUE_KEYS)
  if (value === null) return null

  if (value.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) return null
  if (!ENGINE_PHASES.has(value.phase)) return null
  if (value.mockOnly !== true || value.realOperationAllowed !== false) return null
  if (value.submitAllowed !== false || value.automaticRetryAllowed !== false) return null
  if (typeof value.messageZh !== 'string' || value.messageZh.length > MAX_MESSAGE_LENGTH) return null
  if (!isPlainObject(value.sourceCheck) || !isPlainObject(value.readiness)) return null
  if (value.execution !== null && !isPlainObject(value.execution)) return null
  if (!Array.isArray(value.states) || value.states.length === 0) return null
  for (const state of value.states) {
    if (typeof state !== 'string') return null
  }

  let validated
  try {
    validated = validateAudioTaskRecord(root.record)
  } catch {
    return null
  }
  if (!validated || typeof validated !== 'object' || validated.ok !== true) return null
  if (!isPlainObject(validated.value)) return null
  const finalRecord = validated.value
  if (!sameOwnerImmutable(finalRecord, birthRecord)) return null
  if (finalRecord.mockOnly !== true || finalRecord.realOperationAllowed !== false) return null
  if (!isPlainObject(finalRecord.delivery) || finalRecord.delivery.deliveryId !== null) return null

  const expectedTask = projectOrNull(finalRecord)
  if (expectedTask === null) return null
  const guardedTask = guardProjection(value.task, expectedTask)
  if (guardedTask === null) return null
  if (stableStringify(expectedTask) !== stableStringify(guardedTask)) return null
  if (value.states[value.states.length - 1] !== finalRecord.state) return null

  if (value.phase === 'BLOCKED') {
    if (!OWNER_NO_EXECUTION_REASONS.includes(value.reason)) return null
    if (value.states.length !== 1) return null
    if (!INITIAL_STATES.has(finalRecord.state)) return null
    if (stableStringify(finalRecord) !== stableStringify(birthRecord)) return null
    return { kind: 'NO_EXECUTION', reason: value.reason, record: finalRecord }
  }

  if (value.reason !== null && !RVC_REASONS.includes(value.reason)) return null
  if (!OWNER_SIMULATED_STATES.has(finalRecord.state)) return null
  if (finalRecord.delivery.state !== 'NOT_REQUESTED') return null
  if (value.states[0] !== birthRecord.state) return null
  return { kind: 'SIMULATED', reason: null, record: finalRecord }
}

/* ----------------------------------------- one run ----------------------------------------- */

async function runOnce(state, input) {
  if (state.locked) return failure('OWNER_UNKNOWN', '$')
  try {
    const request = readRun(input)

    // Gate 1 (current): the birth registry and every owner association, read fresh.
    const current = freshAssociations(state)
    const birth = birthOf(current.catalog, request.scopeId, request.taskId)
    if (!birth) raise('NOT_FOUND', '$')
    const existing = entryFor(current.owner.snapshot, request.scopeId, request.taskId)
    if (existing) {
      if (existing.phase === 'FINAL') {
        const stateName = existing.completion.kind === 'SIMULATED' ? 'SIMULATED' : 'NO_EXECUTION'
        return successValue('EXISTING', current.owner.revision, existing.record, stateName, existing.completion.reason)
      }
      return unknownValue('EXISTING', current.owner.revision, existing.record)
    }

    const claimRevision = current.owner.revision + 1
    const claim = {
      schemaVersion: TASK_OWNER_SCHEMA_VERSION,
      revision: claimRevision,
      entries: [
        ...current.owner.snapshot.entries,
        {
          scopeId: request.scopeId,
          taskId: request.taskId,
          birthIdentityHash: birth.identityHash,
          phase: 'CLAIMED',
          record: birth.record,
          completion: null,
        },
      ],
    }
    const claimBytes = Buffer.from(JSON.stringify(claim), 'utf8')
    writeOwner(state, claimBytes, current.owner.digest, claimRevision)
    const claimDigest = sha256(claimBytes)

    // Gate 2 (post-claim, pre-engine): the claim must be confirmed on disk and the birth record and
    // all associations must still hold. A broken or externally changed registry stops the engine.
    const afterClaim = freshAssociations(state)
    const claimed = requireClaimed(afterClaim.owner, request.scopeId, request.taskId)
    if (afterClaim.owner.digest !== claimDigest) raise('STORE_CHANGED', '$')
    const freshBirth = birthOf(afterClaim.catalog, request.scopeId, request.taskId)
    if (!freshBirth) raise('BIRTH_INVALID', '$')
    if (stableStringify(claimed.record) !== stableStringify(freshBirth.record)) raise('BIRTH_INVALID', '$')

    let engineOut = null
    try {
      engineOut = runExistingFixtureTaskOnce({
        scopeId: request.scopeId,
        record: freshBirth.record,
        input: request.input,
      })
    } catch {
      // The claim stays a tombstone; the first attempt is a fixed unknown, never a plain retry.
      return failure('EXECUTION_UNKNOWN', '$')
    }
    const decision = interpretEngine(engineOut, freshBirth.record)
    if (decision === null) return failure('EXECUTION_UNKNOWN', '$')

    // Gate 3 (post-engine, pre-final): an external change must not be committed over.
    const beforeFinal = freshAssociations(state)
    requireClaimed(beforeFinal.owner, request.scopeId, request.taskId)

    const finalRevision = claimRevision + 1
    const finalBytes = Buffer.from(
      JSON.stringify({
        schemaVersion: TASK_OWNER_SCHEMA_VERSION,
        revision: finalRevision,
        entries: [
          ...current.owner.snapshot.entries,
          {
            scopeId: request.scopeId,
            taskId: request.taskId,
            birthIdentityHash: freshBirth.identityHash,
            phase: 'FINAL',
            record: decision.record,
            completion: { kind: decision.kind, reason: decision.kind === 'SIMULATED' ? null : decision.reason },
          },
        ],
      }),
      'utf8',
    )
    try {
      writeOwner(state, finalBytes, claimDigest, finalRevision)
    } catch (error) {
      // A rename that was already attempted keeps the shared unknown lock (WRITE_UNKNOWN). Any
      // other confirmed-uncommitted final failure leaves the claim as a tombstone.
      if (isStoreFailure(error) && error.key === 'WRITE_UNKNOWN') throw error
      if (isStoreFailure(error) && error.key === 'WRITE_REJECTED') return failure('EXECUTION_UNKNOWN', '$')
      throw error
    }

    // Gate 4 (post-final): a confirmed final commit needs fresh bytes and fresh associations.
    // Once the real rename happened the on-disk bytes are kept as they are and the store is locked;
    // it is never reported as a confirmed RECORDED result.
    let confirmed = null
    try {
      confirmed = freshAssociations(state)
    } catch {
      lockStore(state)
      raise('WRITE_UNKNOWN', '$')
    }
    const finalEntry = entryFor(confirmed.owner.snapshot, request.scopeId, request.taskId)
    if (!finalEntry || finalEntry.phase !== 'FINAL' || confirmed.owner.revision !== finalRevision) {
      lockStore(state)
      raise('WRITE_UNKNOWN', '$')
    }
    const stateName = finalEntry.completion.kind === 'SIMULATED' ? 'SIMULATED' : 'NO_EXECUTION'
    return successValue('RECORDED', confirmed.owner.revision, finalEntry.record, stateName, finalEntry.completion.reason)
  } catch (error) {
    return toFailure(error)
  }
}

async function getOnce(state, input) {
  if (state.locked) return failure('OWNER_UNKNOWN', '$')
  try {
    const request = readGet(input)
    const current = freshAssociations(state)
    if (!birthOf(current.catalog, request.scopeId, request.taskId)) raise('NOT_FOUND', '$')
    const entry = entryFor(current.owner.snapshot, request.scopeId, request.taskId)
    if (!entry) raise('NOT_FOUND', '$')
    if (entry.phase === 'CLAIMED') return unknownValue('FOUND', current.owner.revision, entry.record)
    const stateName = entry.completion.kind === 'SIMULATED' ? 'SIMULATED' : 'NO_EXECUTION'
    return successValue('FOUND', current.owner.revision, entry.record, stateName, entry.completion.reason)
  } catch (error) {
    return toFailure(error)
  }
}

/**
 * Open one isolated persistent task owner over a trusted temporary sandbox capability.
 * @param {{sandbox: object}} options
 * @returns {Promise<{ok:true,value:{run:Function,get:Function}}|{ok:false,errors:Array<object>}>}
 */
export async function openFixtureTaskOwner(options) {
  let sandbox
  try {
    sandbox = readOptions(options)
  } catch (error) {
    return toFailure(error)
  }
  const state = getStoreState(sandbox)
  try {
    return await enqueue(state, async () => {
      try {
        if (state.locked) return failure('OWNER_UNKNOWN', '$')
        checkSandbox(state)
        // Factory gate: a usable handle is only handed out when the birth registry is readable and
        // every existing owner entry still resolves to its birth record.
        freshAssociations(state)
        const handle = Object.freeze({
          run: (input) => enqueue(state, () => runOnce(state, input)),
          get: (input) => enqueue(state, () => getOnce(state, input)),
        })
        return deepFreezeFixtureValue({ ok: true, value: handle })
      } catch (error) {
        return toFailure(error)
      }
    })
  } catch (error) {
    return toFailure(error)
  }
}
