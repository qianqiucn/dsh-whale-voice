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
  runExistingFixtureTaskBytesOnce,
  runExistingFixtureTaskOnce,
} from './task-fixture-engine-internal.mjs'
import { RVC_FAKE_ERRORS } from '../svc/rvc-fake-gateway.mjs'
import {
  INITIAL_STATES,
  OWNER_NO_EXECUTION_REASONS,
  OWNER_SIMULATED_STATES,
  SCOPE_PATTERN,
  STORE_DOMAINS,
  TASK_ID_PATTERN,
  checkSandbox,
  enqueue,
  getStoreState,
  hasOwn,
  identityHashOf,
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
import { transitionAudioTask } from './task-contract.mjs'
import { WAV_BYTE_LIMITS } from './wav-byte-inspector.mjs'
import { enqueueArtifact, getArtifactState, isArtifactLocked, lockArtifact } from './fixture-artifact-store-internal.mjs'
import { readStoredForSave } from './fixture-artifact-store-internal.mjs'
import { importInQueue } from './artifact-library.mjs'

/** The public owner schema is frozen at 1 and never follows the on-disk owner snapshot version. */
export const TASK_OWNER_SCHEMA_VERSION = 1

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
  'SAVE_INPUT_INVALID',
  'SAVE_RIGHTS_REJECTED',
  'SAVE_EXPIRED_REQUEST',
  'SAVE_PRECONDITION',
  'SAVE_ARTIFACT_REJECTED',
  'SAVE_ARTIFACT_UNKNOWN',
  'SAVE_TASK_REJECTED',
  'SAVE_UNKNOWN',
])

/** Fixed error protocol. Every value is `TASK_OWNER_` plus the key itself. */
export const TASK_OWNER_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'TASK_OWNER_' + key])),
)

const RUN_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId', 'input']))
const GET_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId']))
const INPUT_KEYS = Object.freeze(new Set(['schemaVersion', 'sourceInput', 'readiness', 'context']))
const SAVE_KEYS = Object.freeze(
  new Set(['schemaVersion', 'scopeId', 'taskId', 'requestKey', 'now', 'expiresAt', 'rights', 'input']),
)
const STATUS_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId', 'now', 'rights']))
const RIGHTS_KEYS = Object.freeze(new Set(['state', 'proofRef']))
const REQUEST_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const PROOF_REF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/

/** The eight new frozen reasons of §4.3; the original fourteen keep the store's own reason text. */
const SAVE_REASONS = Object.freeze({
  SAVE_INPUT_INVALID: 'save input invalid',
  SAVE_RIGHTS_REJECTED: 'save rights rejected',
  SAVE_EXPIRED_REQUEST: 'save request expired',
  SAVE_PRECONDITION: 'save precondition failed',
  SAVE_ARTIFACT_REJECTED: 'artifact import rejected',
  SAVE_ARTIFACT_UNKNOWN: 'artifact import unknown',
  SAVE_TASK_REJECTED: 'task attach or save rejected',
  SAVE_UNKNOWN: 'save outcome unknown',
})

const SAVE_MESSAGES_ZH = Object.freeze({
  MISSING: '没有已保存的演示资产。',
  UNKNOWN: '无法确认这次演示保存结果。',
  RIGHTS_REJECTED: '当前授权不允许读取此演示资产。',
  DELETED: '演示资产已删除。',
  EXPIRED: '演示资产已过期。',
  READABLE: '演示资产当前可读取。',
})

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
  SAVED: '演示结果已保存到本地演示资产库；这不会发送到微信，也不代表真实生成。',
  UNKNOWN: '无法确认这次演示是否完成；系统不会自动重跑，请人工核对。',
})

function failure(key, errorPath) {
  const code = TASK_OWNER_ERRORS[key] || TASK_OWNER_ERRORS.INTERNAL_FAILURE
  return deepFreezeFixtureValue({
    ok: false,
    errors: [{ code, path: errorPath, reason: SAVE_REASONS[key] || storeReason(key) }],
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

/** save success: the original eleven fields plus `artifact`, exactly twelve keys. */
function saveValue(outcome, revision, record, ownerState, reason, artifact) {
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
      artifact: artifact === null ? null : { ...artifact },
      userMessageZh: MESSAGES_ZH[ownerState],
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

/** artifactStatus success: exactly the six frozen fields, never bytes/sha/proof/record. */
function statusValue(stateName, ownerState, artifactRef, expiresAt) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: TASK_OWNER_SCHEMA_VERSION,
      state: stateName,
      ownerState,
      artifactRef,
      expiresAt,
      messageZh: SAVE_MESSAGES_ZH[stateName],
    },
  })
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

function writeOwner(state, bytes, baseDigest, revision, proof = null) {
  return openOwnerFile(state).write(bytes, baseDigest, revision, proof)
}

/** The owner state a stored FINAL conclusion projects into (SAVED is a real fourth kind). */
function finalKind(entry) {
  if (entry.completion.kind === 'SIMULATED') return 'SIMULATED'
  if (entry.completion.kind === 'SAVED') return 'SAVED'
  return 'NO_EXECUTION'
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
        return successValue(
          'EXISTING',
          current.owner.revision,
          existing.record,
          finalKind(existing),
          existing.completion.reason,
        )
      }
      return unknownValue('EXISTING', current.owner.revision, existing.record)
    }

    const claimRevision = current.owner.revision + 1
    const claim = {
      schemaVersion: current.owner.schemaVersion,
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
        schemaVersion: current.owner.schemaVersion,
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
    const stateName = finalKind(finalEntry)
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
    const stateName = finalKind(entry)
    return successValue('FOUND', current.owner.revision, entry.record, stateName, entry.completion.reason)
  } catch (error) {
    return toFailure(error)
  }
}

/* ------------------------------------ save / status (08-E-C) -------------------------------- */

function readSaveRoot(input) {
  if (!isPlainObject(input)) raise('SAVE_INPUT_INVALID', '$')
  let keys
  try {
    keys = Reflect.ownKeys(input)
  } catch {
    raise('SAVE_INPUT_INVALID', '$')
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !SAVE_KEYS.has(key)) raise('SAVE_INPUT_INVALID', '<unknown-key>')
  }
  if (keys.length !== SAVE_KEYS.size) raise('SAVE_INPUT_INVALID', '$')
  for (const key of keys) {
    if (!ownDataField(input, key).ok) raise('SAVE_INPUT_INVALID', key)
  }
  if (input.schemaVersion !== TASK_OWNER_SCHEMA_VERSION) raise('UNSUPPORTED_VERSION', 'schemaVersion')
}

function readSaveIso(root, key, failKey = 'SAVE_INPUT_INVALID') {
  const field = ownDataField(root, key)
  if (!field.ok || typeof field.value !== 'string') raise(failKey, key)
  const ms = Date.parse(field.value)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== field.value) raise(failKey, key)
  return { iso: field.value, ms }
}

function readSaveRights(root, failKey = 'SAVE_INPUT_INVALID') {
  const field = ownDataField(root, 'rights')
  if (!field.ok || !isPlainObject(field.value)) raise(failKey, 'rights')
  const value = field.value
  let keys
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    raise(failKey, 'rights')
  }
  if (keys.length !== RIGHTS_KEYS.size) raise(failKey, 'rights')
  for (const key of keys) {
    if (typeof key !== 'string' || !RIGHTS_KEYS.has(key)) raise(failKey, 'rights')
  }
  const stateField = ownDataField(value, 'state')
  const proofField = ownDataField(value, 'proofRef')
  if (!stateField.ok || !proofField.ok) raise(failKey, 'rights')
  const state = stateField.value
  if (state !== 'GRANTED' && state !== 'DENIED' && state !== 'UNKNOWN') raise(failKey, 'rights')
  const proofRef = proofField.value
  if (proofRef !== null) {
    if (typeof proofRef !== 'string' || proofRef.length > 128 || !PROOF_REF_PATTERN.test(proofRef)) {
      raise(failKey, 'rights')
    }
  }
  return Object.freeze({ state, proofRef })
}

function readSave(input) {
  readSaveRoot(input)
  if (typeof input.scopeId !== 'string' || !SCOPE_PATTERN.test(input.scopeId)) raise('SAVE_INPUT_INVALID', 'scopeId')
  if (typeof input.taskId !== 'string' || !TASK_ID_PATTERN.test(input.taskId)) raise('SAVE_INPUT_INVALID', 'taskId')
  if (typeof input.requestKey !== 'string' || !REQUEST_KEY_PATTERN.test(input.requestKey)) {
    raise('SAVE_INPUT_INVALID', 'requestKey')
  }
  const now = readSaveIso(input, 'now')
  const expiresAt = readSaveIso(input, 'expiresAt')
  const rights = readSaveRights(input)
  const copied = copyFixtureInput(input.input)
  if (!copied.ok) raise(copied.key === 'RESOURCE_LIMIT' ? 'RESOURCE_LIMIT' : 'SAVE_INPUT_INVALID', 'input')
  const payload = copied.value
  if (!isPlainObject(payload)) raise('SAVE_INPUT_INVALID', 'input')
  if (keySurface(payload, INPUT_KEYS) !== 'ok') raise('SAVE_INPUT_INVALID', 'input')
  if (payload.schemaVersion !== 1) raise('UNSUPPORTED_VERSION', 'input')
  return Object.freeze({
    scopeId: input.scopeId,
    taskId: input.taskId,
    requestKey: input.requestKey,
    now,
    expiresAt,
    rights,
    input: payload,
  })
}

function readStatus(input) {
  readExactRoot(input, STATUS_KEYS, '$')
  validateScopeTask(input)
  const now = readSaveIso(input, 'now', 'INVALID_INPUT')
  const rights = readSaveRights(input, 'INVALID_INPUT')
  return Object.freeze({ scopeId: input.scopeId, taskId: input.taskId, now, rights })
}

/** A format-valid save whose stated task identity disagrees with the catalog birth is refused. */
function checkSavePrecondition(request, birthRecord) {
  const sourceInput = isPlainObject(request.input.sourceInput) ? request.input.sourceInput : null
  const draft = sourceInput && isPlainObject(sourceInput.voiceBinding) && isPlainObject(sourceInput.voiceBinding.taskDraft)
    ? sourceInput.voiceBinding.taskDraft
    : null
  if (!isPlainObject(draft)) return
  const same =
    draft.taskId === birthRecord.taskId &&
    draft.feature === birthRecord.feature &&
    draft.taskType === birthRecord.taskType &&
    isPlainObject(draft.source) &&
    draft.source.kind === birthRecord.source.kind &&
    draft.source.ref === birthRecord.source.ref &&
    draft.voiceProfileId === birthRecord.voiceProfileId &&
    isPlainObject(draft.rights) &&
    draft.rights.state === birthRecord.rights.state &&
    draft.deliveryRequested === birthRecord.deliveryRequested
  if (!same) raise('SAVE_PRECONDITION', '$')
}

/** The bytes engine either produces one bounded synthetic pack or a legal non-SUCCESS conclusion. */
const BYTES_ROOT_KEYS = Object.freeze(new Set(['record', 'result', 'production']))
const BYTES_PRODUCTION_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'origin',
    'bytes',
    'inspection',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
    'messageZh',
  ]),
)
const BYTES_INSPECTION_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'format',
    'codec',
    'bitsPerSample',
    'sampleRate',
    'channels',
    'byteLength',
    'dataByteLength',
    'frameCount',
    'durationMs',
    'peak',
    'fullScaleSampleCount',
    'sha256',
    'validationState',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
    'messageZh',
  ]),
)
const MAX_SAVE_BYTES = 1048576
const TYPED_PROTO = Object.getPrototypeOf(Uint8Array.prototype)
const TYPED_TAG = Object.getOwnPropertyDescriptor(TYPED_PROTO, Symbol.toStringTag).get
const VIEW_BUFFER = Object.getOwnPropertyDescriptor(TYPED_PROTO, 'buffer').get
const VIEW_BYTE_LENGTH = Object.getOwnPropertyDescriptor(TYPED_PROTO, 'byteLength').get
const VIEW_BYTE_OFFSET = Object.getOwnPropertyDescriptor(TYPED_PROTO, 'byteOffset').get
const BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get
const BUFFER_RESIZABLE = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable').get
const ARRAY_PROTO = Array.prototype

/**
 * F01: copy the producer's real native byte view. Only the intrinsic typed-array slots participate,
 * so shadowed length/byteLength/buffer properties and accessors are ignored instead of being read.
 */
function ownedProducedBytes(value) {
  if (value === null || typeof value !== 'object') return null
  let tag
  let buffer
  let byteLength
  let byteOffset
  try {
    tag = TYPED_TAG.call(value)
    buffer = VIEW_BUFFER.call(value)
    byteLength = VIEW_BYTE_LENGTH.call(value)
    byteOffset = VIEW_BYTE_OFFSET.call(value)
  } catch {
    return null
  }
  if (tag !== 'Uint8Array') return null
  if (!Number.isInteger(byteLength) || byteLength <= 0 || byteLength > MAX_SAVE_BYTES) return null
  if (!Number.isInteger(byteOffset) || byteOffset < 0) return null
  let bufferLength
  try {
    bufferLength = BUFFER_BYTE_LENGTH.call(buffer)
    if (BUFFER_RESIZABLE.call(buffer) === true) return null
  } catch {
    return null
  }
  if (byteOffset + byteLength > bufferLength) return null
  const copy = new Uint8Array(byteLength)
  Uint8Array.prototype.set.call(copy, new Uint8Array(buffer, byteOffset, byteLength))
  return Buffer.from(copy)
}

/**
 * F01: full protocol guard over the real bytes engine. The three-key root, the result envelope, the
 * production value and its 19-field inspection are copied through own data descriptors only; a
 * missing production is not production:null; a SUCCESS must be PROCESSING with the pristine
 * immutable identity and the fixed synthetic safety flags; the byte view comes from the native slots
 * and is re-hashed. Any deviation is a bad protocol, never a silent save.
 */
function safeStateList(value) {
  if (!Array.isArray(value)) return null
  const length = value.length
  if (!Number.isInteger(length) || length < 1 || length > 64) return null
  if (Object.getPrototypeOf(value) !== ARRAY_PROTO) return null
  if (Reflect.ownKeys(value).length !== length + 1) return null
  const copied = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return null
    if (typeof descriptor.value !== 'string' || descriptor.value.length === 0 || descriptor.value.length > 64) {
      return null
    }
    copied.push(descriptor.value)
  }
  return copied
}

function interpretBytesEngine(out, birthRecord) {
  try {
    const root = engineObject(out, BYTES_ROOT_KEYS)
    if (root === null) return null
    const production = root.production
    if (production === null) {
      const settled = interpretEngine({ record: root.record, result: root.result }, birthRecord)
      if (settled === null) return null
      return { kind: settled.kind, reason: settled.reason, record: settled.record }
    }
    if (!isPlainObject(production)) return null
    const fields = engineObject(production, BYTES_PRODUCTION_KEYS)
    if (fields === null) return null
    if (fields.schemaVersion !== 1 || fields.origin !== 'SYNTHETIC_FIXTURE') return null
    if (fields.mockOnly !== true || fields.realOperationAllowed !== false) return null
    if (fields.submitAllowed !== false || fields.automaticRetryAllowed !== false) return null
    if (typeof fields.messageZh !== 'string' || fields.messageZh.length < 1 || fields.messageZh.length > 256) {
      return null
    }
    const inspection = isPlainObject(fields.inspection)
      ? engineObject(fields.inspection, BYTES_INSPECTION_KEYS)
      : null
    if (inspection === null) return null
    if (inspection.schemaVersion !== 1 || inspection.format !== 'WAV' || inspection.codec !== 'PCM_S16LE') {
      return null
    }
    if (inspection.bitsPerSample !== 16) return null
    if (inspection.channels !== 1 && inspection.channels !== 2) return null
    if (!WAV_BYTE_LIMITS.sampleRates.includes(inspection.sampleRate)) return null
    if (!Number.isInteger(inspection.dataByteLength) || inspection.dataByteLength < 2) return null
    if (!Number.isInteger(inspection.frameCount) || inspection.frameCount < 1) return null
    if (inspection.frameCount !== inspection.dataByteLength / (inspection.channels * 2)) return null
    if (inspection.byteLength !== inspection.dataByteLength + 44) return null
    if (inspection.durationMs !== (inspection.frameCount * 1000) / inspection.sampleRate) return null
    if (typeof inspection.peak !== 'number' || !Number.isFinite(inspection.peak) || inspection.peak < 0 || inspection.peak > 1) return null
    if (!Number.isInteger(inspection.fullScaleSampleCount) || inspection.fullScaleSampleCount < 0) return null
    if (inspection.fullScaleSampleCount > inspection.frameCount * inspection.channels) return null
    if (inspection.validationState !== 'FIXTURE_WAV_CHECKED') return null
    if (inspection.mockOnly !== true || inspection.realOperationAllowed !== false) return null
    if (inspection.submitAllowed !== false || inspection.automaticRetryAllowed !== false) return null
    const bytes = ownedProducedBytes(fields.bytes)
    if (bytes === null) return null
    if (inspection.byteLength !== bytes.length) return null
    if (typeof inspection.sha256 !== 'string' || sha256(bytes) !== inspection.sha256) return null

    const result = engineObject(root.result, ENGINE_RESULT_KEYS)
    if (result === null || result.ok !== true) return null
    const value = engineObject(result.value, ENGINE_VALUE_KEYS)
    if (value === null) return null
    if (value.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION || value.phase !== 'SIMULATED') return null
    if (value.reason !== null) return null
    if (value.mockOnly !== true || value.realOperationAllowed !== false) return null
    if (value.submitAllowed !== false || value.automaticRetryAllowed !== false) return null
    if (typeof value.messageZh !== 'string' || value.messageZh.length < 1 || value.messageZh.length > 512) return null
    if (value.execution !== null) {
      const copied = copyDataGraph(value.execution, 0)
      if (!copied.ok || copied.value === null) return null
      if (copied.value.mockOnly !== true || copied.value.realOperationAllowed !== false) return null
    }
    if (!isPlainObject(value.sourceCheck) || !isPlainObject(value.readiness)) return null
    const states = safeStateList(value.states)
    if (states === null) return null

    let validated
    try {
      validated = validateAudioTaskRecord(root.record)
    } catch {
      return null
    }
    if (!validated || validated.ok !== true || !isPlainObject(validated.value)) return null
    const record = validated.value
    if (record.state !== 'PROCESSING' || record.outputArtifactRef !== null) return null
    if (record.mockOnly !== true || record.realOperationAllowed !== false) return null
    if (!sameOwnerImmutable(record, birthRecord)) return null
    if (stableStringify(record) !== stableStringify(root.record)) return null
    if (states[0] !== birthRecord.state) return null
    if (states[states.length - 1] !== record.state) return null
    const expectedTask = projectOrNull(record)
    if (expectedTask === null) return null
    const guardedTask = guardProjection(value.task, expectedTask)
    if (guardedTask === null) return null
    if (stableStringify(expectedTask) !== stableStringify(guardedTask)) return null
    return { kind: 'SUCCESS', record, bytes }
  } catch {
    return null
  }
}

function libraryFailureKey(error) {
  const code = error && error.errors && error.errors[0] ? String(error.errors[0].code) : ''
  if (code === 'ARTIFACT_LIBRARY_WRITE_UNKNOWN' || code === 'ARTIFACT_LIBRARY_LIBRARY_UNKNOWN') {
    return 'SAVE_ARTIFACT_UNKNOWN'
  }
  return 'SAVE_ARTIFACT_REJECTED'
}

/** One complete same-claim attempt: bytes -> new STORED -> strict SAVED FINAL -> availability. */
async function saveOnce(state, input) {
  if (state.locked) return failure('OWNER_UNKNOWN', '$')
  try {
    const request = readSave(input)
    const current = freshAssociations(state)
    const birth = birthOf(current.catalog, request.scopeId, request.taskId)
    if (!birth) raise('NOT_FOUND', '$')

    const existing = entryFor(current.owner.snapshot, request.scopeId, request.taskId)
    if (existing) {
      if (existing.phase === 'FINAL') {
        return saveValue(
          'EXISTING',
          current.owner.revision,
          existing.record,
          finalKind(existing),
          existing.completion.reason,
          null,
        )
      }
      return failure('SAVE_UNKNOWN', '$')
    }

    if (request.rights.state !== 'GRANTED' || request.rights.proofRef === null) {
      raise('SAVE_RIGHTS_REJECTED', 'rights')
    }
    if (request.expiresAt.ms <= request.now.ms) raise('SAVE_EXPIRED_REQUEST', 'expiresAt')
    checkSavePrecondition(request, birth.record)

    const claimRevision = current.owner.revision + 1
    const claimEntries = [
      ...current.owner.snapshot.entries,
      {
        scopeId: request.scopeId,
        taskId: request.taskId,
        birthIdentityHash: birth.identityHash,
        phase: 'CLAIMED',
        record: birth.record,
        completion: null,
      },
    ]
    const claimBytes = Buffer.from(
      JSON.stringify({ schemaVersion: current.owner.schemaVersion, revision: claimRevision, entries: claimEntries }),
      'utf8',
    )
    try {
      writeOwner(state, claimBytes, current.owner.digest, claimRevision)
    } catch (error) {
      if (isStoreFailure(error) && error.key === 'WRITE_UNKNOWN') return failure('SAVE_UNKNOWN', '$')
      throw error
    }
    const claimDigest = sha256(claimBytes)

    const afterClaim = freshAssociations(state)
    const claimed = requireClaimed(afterClaim.owner, request.scopeId, request.taskId)
    if (afterClaim.owner.digest !== claimDigest) raise('STORE_CHANGED', '$')
    const freshBirth = birthOf(afterClaim.catalog, request.scopeId, request.taskId)
    if (!freshBirth) raise('BIRTH_INVALID', '$')
    if (stableStringify(claimed.record) !== stableStringify(freshBirth.record)) raise('BIRTH_INVALID', '$')

    let engineOut = null
    try {
      engineOut = runExistingFixtureTaskBytesOnce({
        scopeId: request.scopeId,
        record: freshBirth.record,
        input: request.input,
      })
    } catch {
      return failure('SAVE_UNKNOWN', '$')
    }
    const decision = interpretBytesEngine(engineOut, freshBirth.record)
    if (decision === null) return failure('SAVE_UNKNOWN', '$')

    const beforeFinal = freshAssociations(state)
    requireClaimed(beforeFinal.owner, request.scopeId, request.taskId)
    const baseEntries = current.owner.snapshot.entries
    const finalRevision = claimRevision + 1

    if (decision.kind !== 'SUCCESS') {
      const finalBytes = Buffer.from(
        JSON.stringify({
          schemaVersion: beforeFinal.owner.schemaVersion,
          revision: finalRevision,
          entries: [
            ...baseEntries,
            {
              scopeId: request.scopeId,
              taskId: request.taskId,
              birthIdentityHash: freshBirth.identityHash,
              phase: 'FINAL',
              record: decision.record,
              completion: { kind: decision.kind, reason: decision.reason },
            },
          ],
        }),
        'utf8',
      )
      try {
        writeOwner(state, finalBytes, claimDigest, finalRevision)
      } catch (error) {
        if (isStoreFailure(error) && error.key === 'WRITE_UNKNOWN') return failure('SAVE_UNKNOWN', '$')
        throw error
      }
      // The writer's internal post gate never replaces the owner's own final fresh confirmation.
      let settled = null
      try {
        settled = freshAssociations(state)
      } catch {
        lockStore(state)
        return failure('SAVE_UNKNOWN', '$')
      }
      const settledEntry = entryFor(settled.owner.snapshot, request.scopeId, request.taskId)
      if (
        !settledEntry ||
        settledEntry.phase !== 'FINAL' ||
        settledEntry.completion.kind !== decision.kind ||
        settled.owner.revision !== finalRevision
      ) {
        lockStore(state)
        return failure('SAVE_UNKNOWN', '$')
      }
      return saveValue(
        'RECORDED',
        settled.owner.revision,
        settledEntry.record,
        decision.kind,
        settledEntry.completion.reason,
        null,
      )
    }

    const artifactState = getArtifactState(state.sandbox)
    const outcome = await enqueueArtifact(artifactState, () => {
      const imported = importInQueue(artifactState, {
        schemaVersion: 1,
        scopeId: request.scopeId,
        requestKey: request.requestKey,
        bytes: decision.bytes,
        now: request.now.iso,
        expiresAt: request.expiresAt.iso,
        rights: request.rights,
      })
      if (!imported || imported.ok !== true) return { kind: 'ARTIFACT_FAILED', error: imported }
      if (imported.value.outcome !== 'STORED') return { kind: 'ARTIFACT_REJECTED' }
      const artifactRef = imported.value.artifact.artifactRef
      const fresh = readStoredForSave(artifactState, {
        scopeId: request.scopeId,
        artifactRef,
        now: request.now.iso,
      })
      if (!fresh || fresh.ok !== true) return { kind: 'ARTIFACT_FAILED', error: fresh }
      if (fresh.value.state !== 'STORED') return { kind: 'ARTIFACT_REJECTED' }
      const artifact = fresh.value.artifact

      const attached = transitionAudioTask(decision.record, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef })
      if (!attached || attached.ok !== true) return { kind: 'TASK_REJECTED' }
      const marked = transitionAudioTask(attached.value, { type: 'MARK_SAVED' })
      if (!marked || marked.ok !== true) return { kind: 'TASK_REJECTED' }
      const savedRecord = marked.value

      const proof = deepFreezeFixtureValue({
        schemaVersion: 1,
        scopeId: request.scopeId,
        taskId: request.taskId,
        birthIdentityHash: freshBirth.identityHash,
        birthObservedAt: freshBirth.record.observedAt,
        claimRevision,
        claimDigest,
        candidateRevision: finalRevision,
        recordIdentityHash: identityHashOf(savedRecord),
        artifact: {
          artifactRef: artifact.artifactRef,
          identityHash: artifact.identityHash,
          byteSha256: artifact.byteSha256,
          byteLength: artifact.byteLength,
          expiresAt: artifact.expiresAt,
          requestKey: artifact.requestKey,
          rights: { state: artifact.rights.state, proofRef: artifact.rights.proofRef },
          inspection: artifact.inspection,
        },
        evaluatedAt: request.now.iso,
      })
      const finalBytes = Buffer.from(
        JSON.stringify({
          schemaVersion: 2,
          revision: finalRevision,
          entries: [
            ...baseEntries,
            {
              scopeId: request.scopeId,
              taskId: request.taskId,
              birthIdentityHash: freshBirth.identityHash,
              phase: 'FINAL',
              record: savedRecord,
              completion: { kind: 'SAVED', reason: null },
            },
          ],
        }),
        'utf8',
      )
      try {
        writeOwner(state, finalBytes, claimDigest, finalRevision, proof)
      } catch (error) {
        if (!isStoreFailure(error)) return { kind: 'INTERNAL' }
        if (error.key === 'WRITE_UNKNOWN') return { kind: 'SAVE_UNKNOWN' }
        if (error.key === 'WRITE_REJECTED') return { kind: 'WRITE_REJECTED' }
        if (error.key === 'SAVE_ARTIFACT_REJECTED') return { kind: 'SAVE_ARTIFACT_REJECTED' }
        if (error.key === 'SAVE_ARTIFACT_UNKNOWN') return { kind: 'SAVE_ARTIFACT_UNKNOWN' }
        return { kind: 'STORED_ERROR', key: error.key }
      }

      let confirmed = null
      try {
        confirmed = freshAssociations(state)
      } catch {
        lockStore(state)
        return { kind: 'SAVE_UNKNOWN' }
      }
      const jointEntry = entryFor(confirmed.owner.snapshot, request.scopeId, request.taskId)
      if (
        !jointEntry ||
        jointEntry.phase !== 'FINAL' ||
        jointEntry.completion.kind !== 'SAVED' ||
        confirmed.owner.revision !== finalRevision
      ) {
        lockStore(state)
        return { kind: 'SAVE_UNKNOWN' }
      }
      const jointArtifact = readStoredForSave(artifactState, {
        scopeId: request.scopeId,
        artifactRef,
        now: request.now.iso,
      })
      if (!jointArtifact || jointArtifact.ok !== true || jointArtifact.value.state !== 'STORED') {
        lockArtifact(artifactState)
        return { kind: 'SAVE_ARTIFACT_UNKNOWN' }
      }
      return {
        kind: 'SAVED',
        revision: finalRevision,
        record: jointEntry.record,
        artifact: {
          artifactRef: artifact.artifactRef,
          byteLength: artifact.byteLength,
          sha256: artifact.byteSha256,
          expiresAt: artifact.expiresAt,
        },
      }
    })

    if (outcome.kind === 'SAVED') {
      return saveValue('SAVED', outcome.revision, outcome.record, 'SAVED', null, outcome.artifact)
    }
    if (outcome.kind === 'ARTIFACT_FAILED') return failure(libraryFailureKey(outcome.error), '$')
    if (outcome.kind === 'TASK_REJECTED') return failure('SAVE_TASK_REJECTED', '$')
    if (outcome.kind === 'STORED_ERROR') {
      const mapped = TASK_OWNER_ERRORS[outcome.key] ? outcome.key : 'INTERNAL_FAILURE'
      return failure(mapped, '$')
    }
    const SAVE_OUTCOME_FAILURES = Object.freeze({
      ARTIFACT_REJECTED: 'SAVE_ARTIFACT_REJECTED',
      SAVE_ARTIFACT_REJECTED: 'SAVE_ARTIFACT_REJECTED',
      SAVE_ARTIFACT_UNKNOWN: 'SAVE_ARTIFACT_UNKNOWN',
      SAVE_UNKNOWN: 'SAVE_UNKNOWN',
      WRITE_REJECTED: 'WRITE_REJECTED',
    })
    return failure(SAVE_OUTCOME_FAILURES[outcome.kind] || 'INTERNAL_FAILURE', '$')
  } catch (error) {
    return toFailure(error)
  }
}

/** The frozen fourteen-step availability order; history is reported, never rewritten. */
async function statusOnce(state, input) {
  if (state.locked) return failure('OWNER_UNKNOWN', '$')
  try {
    const request = readStatus(input)
    const current = freshAssociations(state)
    if (!birthOf(current.catalog, request.scopeId, request.taskId)) raise('NOT_FOUND', '$')
    const entry = entryFor(current.owner.snapshot, request.scopeId, request.taskId)
    if (!entry) return statusValue('MISSING', null, null, null)
    if (entry.phase === 'CLAIMED') return statusValue('UNKNOWN', 'UNKNOWN', null, null)
    if (entry.completion.kind !== 'SAVED') {
      return statusValue('MISSING', finalKind(entry), null, null)
    }
    if (request.rights.state !== 'GRANTED' || request.rights.proofRef === null) {
      return statusValue('RIGHTS_REJECTED', 'SAVED', null, null)
    }
    const artifactState = getArtifactState(state.sandbox)
    if (isArtifactLocked(artifactState)) return failure('SAVE_ARTIFACT_UNKNOWN', '$')
    const read = readStoredForSave(artifactState, {
      scopeId: request.scopeId,
      artifactRef: entry.record.outputArtifactRef,
      now: request.now.iso,
    })
    if (!read || read.ok !== true) {
      if (read && read.errorKey === 'LIBRARY_UNKNOWN') return failure('SAVE_ARTIFACT_UNKNOWN', '$')
      if (read && (read.errorKey === 'STORE_CHANGED' || read.errorKey === 'STORE_INVALID')) {
        raise(read.errorKey, '$')
      }
      return failure('SAVE_ARTIFACT_UNKNOWN', '$')
    }
    if (read.value.state === 'MISSING') return statusValue('MISSING', 'SAVED', null, null)
    const artifact = read.value.artifact
    if (artifact.artifactRef !== entry.record.outputArtifactRef) {
      return statusValue('RIGHTS_REJECTED', 'SAVED', null, null)
    }
    if (artifact.rights.proofRef !== request.rights.proofRef) {
      return statusValue('RIGHTS_REJECTED', 'SAVED', null, null)
    }
    if (read.value.state === 'DELETED') {
      return statusValue('DELETED', 'SAVED', artifact.artifactRef, artifact.expiresAt)
    }
    if (read.value.state === 'EXPIRED') {
      return statusValue('EXPIRED', 'SAVED', artifact.artifactRef, artifact.expiresAt)
    }
    return statusValue('READABLE', 'SAVED', artifact.artifactRef, artifact.expiresAt)
  } catch (error) {
    return toFailure(error)
  }
}

/**
 * Open one isolated persistent task owner over a trusted temporary sandbox capability.
 * @param {{sandbox: object}} options
 * @returns {Promise<{ok:true,value:{run:Function,get:Function,save:Function,artifactStatus:Function}}|{ok:false,errors:Array<object>}>}
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
          save: (input) => enqueue(state, () => saveOnce(state, input)),
          artifactStatus: (input) => enqueue(state, () => statusOnce(state, input)),
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
