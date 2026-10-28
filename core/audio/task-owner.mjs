/* Whale Voice — isolated persistent task owner (Plan 08-D-C, OFFLINE / FIXTURE_ONLY).
 *
 * One accepted attempt per catalog birth task, inside the same Node process and the same trusted
 * sandbox capability:
 *   trusted sandbox -> catalog birth record (catalog stays the only TaskId issuer)
 *   -> atomic CLAIMED snapshot -> the existing internal existing-record engine at most once
 *   -> validated FINAL snapshot -> safe projection.
 *
 * Repeated run/get calls only read the stored conclusion; a confirmed claim without a trusted FINAL
 * stays a tombstone and is reported as owner UNKNOWN. This module keeps no queue, recovery or
 * cross-process state of its own: the serial queue, confirmed digests and the shared unknown lock
 * come from `fixture-task-store-internal.mjs`.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { isTrustedSandbox } from '../config-sandbox.mjs'
import { projectAudioTask, validateAudioTaskRecord } from './task-contract.mjs'
import {
  TASK_FIXTURE_ERRORS,
  runExistingFixtureTaskOnce,
} from './task-fixture-engine-internal.mjs'
import { PROVIDER_DISPATCH_ERRORS } from './provider-dispatch.mjs'
import { RVC_FAKE_ERRORS } from '../svc/rvc-fake-gateway.mjs'
import {
  OWNER_FILE_NAME,
  MAX_OWNER_BYTES,
  MAX_OWNER_ENTRIES,
  SCOPE_PATTERN,
  TASK_ID_PATTERN,
  checkSandbox,
  enqueue,
  getStoreState,
  hasOwn,
  identityHashOf,
  isPlainObject,
  isStoreFailure,
  keySurface,
  openStoreFile,
  parseStoreJson,
  raiseStore,
  readCatalogEntries,
  sha256,
  stableStringify,
  storeReason,
} from './fixture-task-store-internal.mjs'

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
])

/** Fixed error protocol. Every value is `TASK_OWNER_` plus the key itself. */
export const TASK_OWNER_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'TASK_OWNER_' + key])),
)

const OWNER_FILE_SPEC = Object.freeze({
  name: OWNER_FILE_NAME,
  maxBytes: MAX_OWNER_BYTES,
  maxEntries: MAX_OWNER_ENTRIES,
  unknownKey: 'OWNER_UNKNOWN',
  parse: (bytes) => parseOwnerSnapshot(bytes, MAX_OWNER_ENTRIES),
})

const RUN_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId', 'input']))
const GET_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId']))
const INPUT_KEYS = Object.freeze(new Set(['schemaVersion', 'sourceInput', 'readiness', 'context']))
const SNAPSHOT_KEYS = Object.freeze(new Set(['schemaVersion', 'revision', 'entries']))
const ENTRY_KEYS = Object.freeze(new Set(['scopeId', 'taskId', 'birthIdentityHash', 'phase', 'record', 'completion']))
const COMPLETION_KEYS = Object.freeze(new Set(['kind', 'reason']))
const HASH_PATTERN = /^[0-9a-f]{64}$/

const INITIAL_STATES = Object.freeze(new Set(['CREATED', 'BLOCKED_RIGHTS']))
const SIMULATED_STATES = Object.freeze(
  new Set(['ARTIFACT_READY', 'FAILED', 'UNKNOWN', 'CANCEL_REQUESTED', 'CANCELLED']),
)
const NO_EXECUTION_REASONS = Object.freeze([
  TASK_FIXTURE_ERRORS.SOURCE_BLOCKED,
  TASK_FIXTURE_ERRORS.READINESS_BLOCKED,
  TASK_FIXTURE_ERRORS.DISPATCH_BLOCKED,
  PROVIDER_DISPATCH_ERRORS.UNSUPPORTED_DISPATCH,
])
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

/* ---------------------------------- owner snapshot schema ---------------------------------- */

function ownerRecord(record, entryTaskId) {
  let validated
  try {
    validated = validateAudioTaskRecord(record)
  } catch {
    raise('STORE_INVALID', '$')
  }
  if (!validated || typeof validated !== 'object' || typeof validated.ok !== 'boolean') {
    raise('STORE_INVALID', '$')
  }
  if (validated.ok === false) raise('STORE_INVALID', '$')
  const value = validated.value
  if (!isPlainObject(value)) raise('STORE_INVALID', '$')
  if (value.taskId !== entryTaskId) raise('STORE_INVALID', '$')
  if (value.mockOnly !== true || value.realOperationAllowed !== false) raise('STORE_INVALID', '$')
  if (!isPlainObject(value.delivery) || value.delivery.deliveryId !== null) raise('STORE_INVALID', '$')
  if (value.delivery.state !== 'NOT_REQUESTED') raise('STORE_INVALID', '$')
  return value
}

function initialOnly(record) {
  if (!INITIAL_STATES.has(record.state)) raise('STORE_INVALID', '$')
  if (record.outputArtifactRef !== null) raise('STORE_INVALID', '$')
  if (!isPlainObject(record.cancel) || record.cancel.requested !== false || record.cancel.confirmed !== false) {
    raise('STORE_INVALID', '$')
  }
  if (record.lastError !== null) raise('STORE_INVALID', '$')
}

function parseOwnerSnapshot(bytes, maxEntries) {
  const snapshot = parseStoreJson(bytes)
  if (!isPlainObject(snapshot)) raise('STORE_INVALID', '$')
  if (keySurface(snapshot, SNAPSHOT_KEYS) !== 'ok') raise('STORE_INVALID', '$')
  if (snapshot.schemaVersion !== TASK_OWNER_SCHEMA_VERSION) raise('STORE_INVALID', '$')
  if (!Array.isArray(snapshot.entries)) raise('STORE_INVALID', '$')
  if (snapshot.entries.length > maxEntries) raise('RESOURCE_LIMIT', '$')
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) raise('STORE_INVALID', '$')

  const seen = new Set()
  let weight = 0
  const entries = []
  for (const entry of snapshot.entries) {
    if (!isPlainObject(entry) || keySurface(entry, ENTRY_KEYS) !== 'ok') raise('STORE_INVALID', '$')
    if (typeof entry.scopeId !== 'string' || !SCOPE_PATTERN.test(entry.scopeId)) raise('STORE_INVALID', '$')
    if (typeof entry.taskId !== 'string' || !TASK_ID_PATTERN.test(entry.taskId)) raise('STORE_INVALID', '$')
    if (typeof entry.birthIdentityHash !== 'string' || !HASH_PATTERN.test(entry.birthIdentityHash)) {
      raise('STORE_INVALID', '$')
    }
    const key = entry.scopeId + '\u0000' + entry.taskId
    if (seen.has(key)) raise('STORE_INVALID', '$')
    seen.add(key)

    const record = ownerRecord(entry.record, entry.taskId)
    if (entry.phase === 'CLAIMED') {
      initialOnly(record)
      if (entry.completion !== null) raise('STORE_INVALID', '$')
      weight += 1
      entries.push({
        scopeId: entry.scopeId,
        taskId: entry.taskId,
        birthIdentityHash: entry.birthIdentityHash,
        phase: 'CLAIMED',
        record,
        completion: null,
      })
      continue
    }
    if (entry.phase !== 'FINAL') raise('STORE_INVALID', '$')
    if (!isPlainObject(entry.completion) || keySurface(entry.completion, COMPLETION_KEYS) !== 'ok') {
      raise('STORE_INVALID', '$')
    }
    const kind = entry.completion.kind
    const reason = entry.completion.reason
    if (kind === 'SIMULATED') {
      if (reason !== null) raise('STORE_INVALID', '$')
      if (!SIMULATED_STATES.has(record.state)) raise('STORE_INVALID', '$')
      weight += 2
      entries.push({
        scopeId: entry.scopeId,
        taskId: entry.taskId,
        birthIdentityHash: entry.birthIdentityHash,
        phase: 'FINAL',
        record,
        completion: Object.freeze({ kind: 'SIMULATED', reason: null }),
      })
      continue
    }
    if (kind !== 'NO_EXECUTION') raise('STORE_INVALID', '$')
    if (!NO_EXECUTION_REASONS.includes(reason)) raise('STORE_INVALID', '$')
    initialOnly(record)
    weight += 2
    entries.push({
      scopeId: entry.scopeId,
      taskId: entry.taskId,
      birthIdentityHash: entry.birthIdentityHash,
      phase: 'FINAL',
      record,
      completion: Object.freeze({ kind: 'NO_EXECUTION', reason }),
    })
  }
  if (snapshot.revision !== weight) raise('STORE_INVALID', '$')
  return { revision: snapshot.revision, entries }
}

function sameImmutable(finalRecord, birthRecord) {
  return (
    finalRecord.taskId === birthRecord.taskId &&
    finalRecord.feature === birthRecord.feature &&
    finalRecord.taskType === birthRecord.taskType &&
    finalRecord.source.kind === birthRecord.source.kind &&
    finalRecord.source.ref === birthRecord.source.ref &&
    finalRecord.voiceProfileId === birthRecord.voiceProfileId &&
    finalRecord.rights.state === birthRecord.rights.state &&
    finalRecord.deliveryRequested === birthRecord.deliveryRequested &&
    finalRecord.observedAt === birthRecord.observedAt
  )
}

/** Every owner entry must resolve to its catalog birth entry and to the same immutable identity. */
function crossCheck(snapshot, catalog) {
  for (const entry of snapshot.entries) {
    const birth = catalog.entries.find(
      (item) => item.scopeId === entry.scopeId && item.record.taskId === entry.taskId,
    )
    if (!birth) raise('BIRTH_INVALID', '$')
    if (identityHashOf(birth.record) !== entry.birthIdentityHash) raise('BIRTH_INVALID', '$')
    if (entry.phase === 'CLAIMED') {
      if (stableStringify(entry.record) !== stableStringify(birth.record)) raise('BIRTH_INVALID', '$')
      continue
    }
    if (!sameImmutable(entry.record, birth.record)) raise('BIRTH_INVALID', '$')
    if (entry.completion.kind === 'NO_EXECUTION' && stableStringify(entry.record) !== stableStringify(birth.record)) {
      raise('BIRTH_INVALID', '$')
    }
  }
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

function ownerFile(state) {
  return openStoreFile(state, OWNER_FILE_SPEC)
}

function readOwner(state) {
  return ownerFile(state).read()
}

function writeOwner(state, snapshot, baseDigest) {
  const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8')
  return ownerFile(state).write(bytes, baseDigest, snapshot.revision)
}

function entryFor(snapshot, scopeId, taskId) {
  return snapshot.entries.find((item) => item.scopeId === scopeId && item.taskId === taskId) || null
}

/* ----------------------------------------- one run ----------------------------------------- */

function interpretEngine(out, birthRecord) {
  if (!out || typeof out !== 'object') return null
  const result = out.result
  const record = out.record
  if (!result || typeof result !== 'object' || result.ok !== true) return null
  const value = result.value
  if (!isPlainObject(value) || !isPlainObject(record)) return null
  let validated
  try {
    validated = validateAudioTaskRecord(record)
  } catch {
    return null
  }
  if (!validated || validated.ok !== true) return null
  const finalRecord = validated.value
  if (!sameImmutable(finalRecord, birthRecord)) return null
  if (value.phase === 'BLOCKED') {
    if (!NO_EXECUTION_REASONS.includes(value.reason)) return null
    if (!INITIAL_STATES.has(finalRecord.state)) return null
    if (stableStringify(finalRecord) !== stableStringify(birthRecord)) return null
    return { kind: 'NO_EXECUTION', reason: value.reason, record: finalRecord }
  }
  if (value.phase !== 'SIMULATED') return null
  if (value.reason !== null && !RVC_REASONS.includes(value.reason)) return null
  if (!SIMULATED_STATES.has(finalRecord.state)) return null
  if (finalRecord.delivery.state !== 'NOT_REQUESTED') return null
  return { kind: 'SIMULATED', reason: null, record: finalRecord }
}

async function runOnce(state, input) {
  if (state.locked) return failure('OWNER_UNKNOWN', '$')
  try {
    const request = readRun(input)
    const catalog = readCatalogEntries(state, 'OWNER_UNKNOWN')
    const birth = catalog.entries.find(
      (entry) => entry.scopeId === request.scopeId && entry.record.taskId === request.taskId,
    )
    if (!birth) raise('NOT_FOUND', '$')

    const owner = readOwner(state)
    crossCheck(owner.snapshot, catalog)
    const existing = entryFor(owner.snapshot, request.scopeId, request.taskId)
    if (existing) {
      if (existing.phase === 'FINAL') {
        const stateName = existing.completion.kind === 'SIMULATED' ? 'SIMULATED' : 'NO_EXECUTION'
        return successValue('EXISTING', owner.revision, existing.record, stateName, existing.completion.reason)
      }
      return unknownValue('EXISTING', owner.revision, existing.record)
    }

    const claimRevision = owner.revision + 1
    const claim = {
      schemaVersion: TASK_OWNER_SCHEMA_VERSION,
      revision: claimRevision,
      entries: [
        ...owner.snapshot.entries,
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
    writeOwner(state, claim, owner.digest)
    const claimDigest = sha256(claimBytes)

    let engineOut
    try {
      engineOut = runExistingFixtureTaskOnce({
        scopeId: request.scopeId,
        record: birth.record,
        input: request.input,
      })
    } catch {
      return unknownValue('RECORDED', claimRevision, birth.record)
    }
    const decision = interpretEngine(engineOut, birth.record)
    if (decision === null) return unknownValue('RECORDED', claimRevision, birth.record)

    const finalRevision = claimRevision + 1
    const finalEntry = {
      scopeId: request.scopeId,
      taskId: request.taskId,
      birthIdentityHash: birth.identityHash,
      phase: 'FINAL',
      record: decision.record,
      completion: { kind: decision.kind, reason: decision.kind === 'SIMULATED' ? null : decision.reason },
    }
    const finalSnapshot = {
      schemaVersion: TASK_OWNER_SCHEMA_VERSION,
      revision: finalRevision,
      entries: [...owner.snapshot.entries, finalEntry],
    }
    try {
      ownerFile(state).write(Buffer.from(JSON.stringify(finalSnapshot), 'utf8'), claimDigest, finalRevision)
    } catch (error) {
      if (isStoreFailure(error) && error.key === 'WRITE_UNKNOWN') throw error
      // A confirmed claim stays a tombstone: never a plain retryable WRITE_REJECTED.
      return unknownValue('RECORDED', claimRevision, birth.record)
    }
    return successValue(
      'RECORDED',
      finalRevision,
      decision.record,
      decision.kind === 'SIMULATED' ? 'SIMULATED' : 'NO_EXECUTION',
      decision.reason,
    )
  } catch (error) {
    return toFailure(error)
  }
}

async function getOnce(state, input) {
  if (state.locked) return failure('OWNER_UNKNOWN', '$')
  try {
    const request = readGet(input)
    const catalog = readCatalogEntries(state, 'OWNER_UNKNOWN')
    const birth = catalog.entries.find(
      (entry) => entry.scopeId === request.scopeId && entry.record.taskId === request.taskId,
    )
    if (!birth) raise('NOT_FOUND', '$')
    const owner = readOwner(state)
    crossCheck(owner.snapshot, catalog)
    const entry = entryFor(owner.snapshot, request.scopeId, request.taskId)
    if (!entry) raise('NOT_FOUND', '$')
    if (entry.phase === 'CLAIMED') return unknownValue('FOUND', owner.revision, entry.record)
    const stateName = entry.completion.kind === 'SIMULATED' ? 'SIMULATED' : 'NO_EXECUTION'
    return successValue('FOUND', owner.revision, entry.record, stateName, entry.completion.reason)
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
        ownerFile(state).read()
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
