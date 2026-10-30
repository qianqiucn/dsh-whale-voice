/* Whale Voice — one internal Fixture audio-task engine (Plan 08-D-B, OFFLINE / FIXTURE_ONLY).
 *
 * A single private flow implements the accepted 08-C composition:
 *   1. the accepted 08-B source association (which itself reuses the 08-A voice binding once);
 *   2. the accepted 06-D pure readiness gate;
 *   3. at most one existing RVC Fixture dispatch through 06-D → 06-C;
 *   4. the existing AudioTask v1 create/transition/validate/project functions.
 *
 * Two explicit internal entries share it:
 *   - runDraftFixtureTaskOnce(input): the legacy draft path, which creates the initial Task;
 *   - runExistingFixtureTaskOnce(frame): reuses an already valid initial Task record and scope.
 *
 * Plan 08-E-D adds a third internal entry in the same flow:
 *   - runExistingFixtureTaskBytesOnce(frame): after the same real Fake SUCCESS validation, produces
 *     one bounded synthetic PCM16 byte pack and stops at PROCESSING (no ATTACH/SAVED).
 *
 * The legacy entries return a private {record, result} object; the bytes entry returns a private
 * {record, result, production} object. Only legacy `result` may leave the legacy facade. No I/O,
 * clock, randomness, process, queue or cross-call state is used.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { resolveFixtureTaskSource } from './source-artifacts.mjs'
import { dispatchReadyRvcFakeOnce, negotiateReadyFixtureProvider } from './provider-readiness.mjs'
import { PROVIDER_DISPATCH_ERRORS } from './provider-dispatch.mjs'
import {
  createAudioTaskRecord,
  projectAudioTask,
  transitionAudioTask,
  validateAudioTaskDraft,
  validateAudioTaskRecord,
} from './task-contract.mjs'
import { RVC_FAKE_SCENARIOS, validateRvcFakeResult } from '../svc/rvc-fake-gateway.mjs'
import { produceFixtureWav } from './fixture-wav-producer.mjs'

export const TASK_FIXTURE_SCHEMA_VERSION = 1

const ERROR_KEYS = Object.freeze([
  'INVALID_INPUT',
  'RESOURCE_LIMIT',
  'UNSUPPORTED_VERSION',
  'SOURCE_INPUT_INVALID',
  'READINESS_INVALID',
  'INVALID_CONTEXT',
  'DEPENDENCY_FAILURE',
  'TASK_CREATION_REJECTED',
  'DISPATCH_REJECTED',
  'TASK_TRANSITION_REJECTED',
  'INVALID_TASK_RESULT',
  'SOURCE_BLOCKED',
  'READINESS_BLOCKED',
  'DISPATCH_BLOCKED',
])

/** Fixed error/reason protocol. Every value is `TASK_FIXTURE_` plus the key itself. */
export const TASK_FIXTURE_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'TASK_FIXTURE_' + key])),
)

const RESOLVER_KEYS = Object.freeze(new Set(['schemaVersion', 'sourceInput', 'readiness', 'context']))
const CONTEXT_KEYS = Object.freeze(new Set(['requestId', 'endpointId', 'scenario']))
const EXISTING_KEYS = Object.freeze(new Set(['scopeId', 'record', 'input']))
const REQUEST_ID_PATTERN = /^request:fixture-[A-Za-z0-9_-]{1,32}$/
const SCOPE_PATTERN = /^scope:fixture-[A-Za-z0-9_-]{1,32}$/
const ENDPOINT_ID = 'gateway:fixture-rvc'

const FEATURE_TTS = 'voice-bubbles'
const FEATURE_SVC = 'singing'
const TTS_UNSUPPORTED_MESSAGE = '该实例的演示执行尚未实现；可以查看能力说明或稍后再说。'

const SOURCE_KINDS = Object.freeze(new Set(['TEXT', 'AUDIO']))
const GATE_DECISIONS = Object.freeze(new Set(['FIXTURE_READY', 'BLOCKED']))
const CATEGORIES = Object.freeze(new Set(['TTS', 'SVC']))
const INITIAL_STATES = Object.freeze(new Set(['CREATED', 'BLOCKED_RIGHTS']))
const TASK_STATE_CREATED = 'CREATED'
const DELIVERY_STATE_NOT_REQUESTED = 'NOT_REQUESTED'

function issue(code, path, reason) {
  return { code, path, reason }
}

function errorReason(key) {
  return key.toLowerCase().replace(/_/g, ' ')
}

function fail(key, path) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [issue(TASK_FIXTURE_ERRORS[key], path, errorReason(key))],
  })
}

function privateResult(record, result) {
  return deepFreezeFixtureValue({ record, result })
}

/* ------------------------------------- 08-E-D bytes mode ----------------------------------- */

/** The bytes entry's own three-code table; the legacy 14 codes stay unchanged. */
export const TASK_FIXTURE_BYTES_ERRORS = Object.freeze({
  UNREPRESENTABLE_DURATION: 'TASK_FIXTURE_BYTES_UNREPRESENTABLE_DURATION',
  RESOURCE_LIMIT: 'TASK_FIXTURE_BYTES_RESOURCE_LIMIT',
  DEPENDENCY_FAILURE: 'TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE',
})

const BYTES_REASONS = Object.freeze({
  UNREPRESENTABLE_DURATION: 'fixture duration cannot form complete frames',
  RESOURCE_LIMIT: 'fixture output byte budget exceeded',
  DEPENDENCY_FAILURE: 'fixture byte production unavailable',
})

const BYTES_SAMPLE_RATE = 44100
const BYTES_MAX_FRAMES = Math.floor((1048576 - 44) / 2)
const BYTES_MESSAGE_ZH = '演示字节已准备，尚未登记资产或保存任务。'
const PRODUCER_MESSAGE_ZH = '已生成演示PCM16测试信号；不是TTS或翻唱结果，也不代表保存或发送。'
const INSPECTION_MESSAGE_ZH = '演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。'
const PRODUCER_VALUE_KEYS = Object.freeze([
  'schemaVersion',
  'origin',
  'bytes',
  'inspection',
  'mockOnly',
  'realOperationAllowed',
  'submitAllowed',
  'automaticRetryAllowed',
  'messageZh',
])
const PRODUCER_INSPECTION_KEYS = Object.freeze([
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
])

/* Native-slot getters: never read a shadowable name/length/byteLength/byteOffset/buffer property. */
const TYPED_ARRAY_PROTO = Object.getPrototypeOf(Uint8Array.prototype)
const TYPED_ARRAY_TAG = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, Symbol.toStringTag).get
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, 'byteLength').get
const TYPED_ARRAY_BYTE_OFFSET = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, 'byteOffset').get
const TYPED_ARRAY_LENGTH = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, 'length').get
const TYPED_ARRAY_BUFFER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO, 'buffer').get
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get
const ARRAY_BUFFER_RESIZABLE = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable').get
const ARRAY_BUFFER_DETACHED = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'detached').get

function bytesResult(record, result, production) {
  return Object.freeze({ record, result, production })
}

function bytesFail(key) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [issue(TASK_FIXTURE_BYTES_ERRORS[key], '$', BYTES_REASONS[key])],
  })
}

function ownDataValue(object, key) {
  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(object, key)
  } catch {
    return undefined
  }
  if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return undefined
  return descriptor.value
}

/** Exactly the listed own enumerable data keys, read without invoking accessors. */
function exactSurface(object, keys) {
  if (!isPlainObject(object)) return null
  let ownKeys
  try {
    ownKeys = Reflect.ownKeys(object)
  } catch {
    return null
  }
  if (ownKeys.length !== keys.length) return null
  const values = {}
  for (const key of keys) {
    if (!ownKeys.includes(key)) return null
    const value = ownDataValue(object, key)
    if (value === undefined) return null
    values[key] = value
  }
  return values
}

/**
 * Native carrier check for the produced byte pack. The brand comes from the intrinsic
 * %TypedArray% @@toStringTag getter (it reads [[TypedArrayName]], so an own @@toStringTag or
 * byteLength accessor is never consulted), from the prototype identity, and from the intrinsic
 * length/byteLength/byteOffset/buffer plus ArrayBuffer byteLength/resizable/detached accessors.
 * No instanceof, constructor, own-property read or Object.prototype.toString is used, no getter,
 * iterator or species hook is executed, and the bytes are never copied.
 */
function ownSyntheticBytes(value, expectedByteLength) {
  if (value === null || typeof value !== 'object') return false
  if (typeof TYPED_ARRAY_TAG !== 'function') return false
  if (typeof ARRAY_BUFFER_RESIZABLE !== 'function' || typeof ARRAY_BUFFER_DETACHED !== 'function') return false
  try {
    if (TYPED_ARRAY_TAG.call(value) !== 'Uint8Array') return false
    if (Object.getPrototypeOf(value) !== Uint8Array.prototype) return false
    const byteLength = TYPED_ARRAY_BYTE_LENGTH.call(value)
    const byteOffset = TYPED_ARRAY_BYTE_OFFSET.call(value)
    const length = TYPED_ARRAY_LENGTH.call(value)
    const buffer = TYPED_ARRAY_BUFFER.call(value)
    if (byteLength !== expectedByteLength || length !== expectedByteLength) return false
    if (byteOffset !== 0) return false
    if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype) return false
    if (ARRAY_BUFFER_RESIZABLE.call(buffer) !== false) return false
    if (ARRAY_BUFFER_DETACHED.call(buffer) !== false) return false
    return ARRAY_BUFFER_BYTE_LENGTH.call(buffer) === byteLength
  } catch {
    return false
  }
}

/** Derive the one bounded producer request from the already verified Fake SUCCESS result. */
function deriveByteRequest(result) {
  if (result.sampleRate !== BYTES_SAMPLE_RATE) return { ok: false, key: 'DEPENDENCY_FAILURE' }
  const duration = result.durationMs
  if (typeof duration !== 'number' || !Number.isSafeInteger(duration) || duration <= 0) {
    return { ok: false, key: 'DEPENDENCY_FAILURE' }
  }
  const numerator = duration * BYTES_SAMPLE_RATE
  if (!Number.isSafeInteger(numerator) || numerator % 1000 !== 0) {
    return { ok: false, key: 'UNREPRESENTABLE_DURATION' }
  }
  const frameCount = numerator / 1000
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0) {
    return { ok: false, key: 'UNREPRESENTABLE_DURATION' }
  }
  if (frameCount > BYTES_MAX_FRAMES) return { ok: false, key: 'RESOURCE_LIMIT' }
  return {
    ok: true,
    frameCount,
    durationMs: duration,
    input: { schemaVersion: 1, sampleRate: BYTES_SAMPLE_RATE, channels: 1, frameCount, pattern: 'SILENCE' },
  }
}

/**
 * Thin 08-E-C protocol guard over the real producer value; never re-parses WAV or re-hashes.
 * Any throw inside the private guard stays at this dependency boundary: the caller maps a
 * non-ok result to TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE, never to the legacy INVALID_INPUT.
 */
function guardProducedBytes(produced, derived) {
  try {
    return guardProducedBytesChecked(produced, derived)
  } catch {
    return { ok: false }
  }
}

function guardProducedBytesChecked(produced, derived) {
  if (!isPlainObject(produced) || !Object.isFrozen(produced)) return { ok: false }
  const root = exactSurface(produced, ['ok', 'value'])
  if (root === null || root.ok !== true) return { ok: false }
  const value = root.value
  if (!isPlainObject(value) || !Object.isFrozen(value)) return { ok: false }
  const fields = exactSurface(value, PRODUCER_VALUE_KEYS)
  if (fields === null) return { ok: false }
  if (fields.schemaVersion !== 1) return { ok: false }
  if (fields.origin !== 'SYNTHETIC_FIXTURE') return { ok: false }
  if (fields.mockOnly !== true || fields.realOperationAllowed !== false) return { ok: false }
  if (fields.submitAllowed !== false || fields.automaticRetryAllowed !== false) return { ok: false }
  if (fields.messageZh !== PRODUCER_MESSAGE_ZH) return { ok: false }
  const expectedData = derived.frameCount * 2
  const expectedByteLength = 44 + expectedData
  if (!ownSyntheticBytes(fields.bytes, expectedByteLength)) return { ok: false }
  const inspection = fields.inspection
  if (!isPlainObject(inspection) || !Object.isFrozen(inspection)) return { ok: false }
  const measured = exactSurface(inspection, PRODUCER_INSPECTION_KEYS)
  if (measured === null) return { ok: false }
  if (measured.schemaVersion !== 1) return { ok: false }
  if (measured.format !== 'WAV' || measured.codec !== 'PCM_S16LE' || measured.bitsPerSample !== 16) return { ok: false }
  if (measured.sampleRate !== BYTES_SAMPLE_RATE || measured.channels !== 1) return { ok: false }
  if (measured.frameCount !== derived.frameCount) return { ok: false }
  if (measured.dataByteLength !== expectedData || measured.byteLength !== expectedByteLength) return { ok: false }
  if (measured.durationMs !== derived.durationMs) return { ok: false }
  if (measured.peak !== 0 || measured.fullScaleSampleCount !== 0) return { ok: false }
  if (typeof measured.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(measured.sha256)) return { ok: false }
  if (measured.validationState !== 'FIXTURE_WAV_CHECKED') return { ok: false }
  if (measured.mockOnly !== true || measured.realOperationAllowed !== false) return { ok: false }
  if (measured.submitAllowed !== false || measured.automaticRetryAllowed !== false) return { ok: false }
  if (measured.messageZh !== INSPECTION_MESSAGE_ZH) return { ok: false }
  return { ok: true, production: value }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function keySurface(object, allowed) {
  const keys = Reflect.ownKeys(object)
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) return 'unknown'
  }
  if (keys.length !== allowed.size) return 'count'
  return 'ok'
}

function isValidRevision(value) {
  return Number.isInteger(value) && value >= 1 && value <= 2147483647
}

function validSourceValue(value) {
  if (!isPlainObject(value)) return false
  if (value.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) return false
  if (value.decision !== 'FIXTURE_SOURCE_LINKED' && value.decision !== 'BLOCKED') return false
  if (value.reason !== null && typeof value.reason !== 'string') return false
  if (typeof value.messageZh !== 'string') return false
  if (!isPlainObject(value.voiceBinding)) return false
  if (typeof value.voiceBinding.feature !== 'string') return false
  if (value.mockOnly !== true) return false
  if (value.realOperationAllowed !== false) return false
  if (value.submitAllowed !== false) return false
  if (value.automaticRetryAllowed !== false) return false
  if (value.decision === 'BLOCKED') {
    if (value.reason === null) return false
    return value.source === null
  }
  if (value.reason !== null) return false
  if (!isPlainObject(value.source)) return false
  if (!SOURCE_KINDS.has(value.source.kind)) return false
  return isValidRevision(value.source.revision)
}

function validGateValue(value) {
  if (!isPlainObject(value)) return false
  if (value.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) return false
  if (!GATE_DECISIONS.has(value.decision)) return false
  if (!CATEGORIES.has(value.category)) return false
  if (typeof value.instanceId !== 'string') return false
  if (value.candidateId !== null && typeof value.candidateId !== 'string') return false
  if (value.reason !== null && typeof value.reason !== 'string') return false
  if (typeof value.messageZh !== 'string') return false
  if (!isPlainObject(value.negotiation)) return false
  if (value.observation !== null && !isPlainObject(value.observation)) return false
  if (value.mockOnly !== true) return false
  if (value.realOperationAllowed !== false) return false
  if (value.submitAllowed !== false) return false
  if (value.automaticRetryAllowed !== false) return false
  if (value.decision === 'FIXTURE_READY') {
    if (value.reason !== null) return false
    if (typeof value.candidateId !== 'string') return false
    if (!isPlainObject(value.observation)) return false
  } else if (value.reason === null) {
    return false
  }
  return true
}

function validExecutionValue(value) {
  if (!isPlainObject(value)) return false
  if (value.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) return false
  if (!validGateValue(value.readiness)) return false
  if (value.phase !== 'BLOCKED' && value.phase !== 'SIMULATED') return false
  if (value.reason !== null && typeof value.reason !== 'string') return false
  if (typeof value.messageZh !== 'string') return false
  if (value.mockOnly !== true) return false
  if (value.realOperationAllowed !== false) return false
  if (value.submitAllowed !== false) return false
  if (value.automaticRetryAllowed !== false) return false
  if (value.phase === 'SIMULATED') {
    if (!isPlainObject(value.dispatch)) return false
    if (value.dispatch.phase !== 'SIMULATED') return false
    if (!isPlainObject(value.dispatch.result)) return false
  } else if (value.dispatch !== null && !isPlainObject(value.dispatch)) {
    return false
  }
  return true
}

function validateContext(value, feature) {
  if (feature === FEATURE_TTS) {
    return value === null ? { ok: true, value: null } : { ok: false }
  }
  if (feature !== FEATURE_SVC) return { ok: false }
  if (!isPlainObject(value)) return { ok: false }
  if (keySurface(value, CONTEXT_KEYS) !== 'ok') return { ok: false }
  if (typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) return { ok: false }
  if (value.endpointId !== ENDPOINT_ID) return { ok: false }
  if (!RVC_FAKE_SCENARIOS.includes(value.scenario)) return { ok: false }
  return { ok: true, value: { requestId: value.requestId, endpointId: value.endpointId, scenario: value.scenario } }
}

function envelope(fields) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: TASK_FIXTURE_SCHEMA_VERSION,
      phase: fields.phase,
      reason: fields.reason,
      messageZh: fields.messageZh,
      sourceCheck: fields.sourceCheck,
      readiness: fields.readiness,
      execution: fields.execution,
      task: fields.task,
      states: fields.states,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

/** The only physical copyFixtureInput call; existing mode invokes it for two partitions. */
function copyPartition(root) {
  return copyFixtureInput(root)
}

function taskProjection(record) {
  let projected
  try {
    projected = projectAudioTask(record)
  } catch {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (!projected || typeof projected !== 'object' || typeof projected.ok !== 'boolean') {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (projected.ok === false) return { errorKey: 'TASK_TRANSITION_REJECTED' }
  if (!isPlainObject(projected.value)) return { errorKey: 'DEPENDENCY_FAILURE' }
  return { ok: true, value: projected.value }
}

function createTask(draft, now) {
  let created
  try {
    created = createAudioTaskRecord(draft, { observedAt: now })
  } catch {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (!created || typeof created !== 'object' || typeof created.ok !== 'boolean') {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (created.ok === false) return { errorKey: 'TASK_CREATION_REJECTED' }
  if (!isPlainObject(created.value)) return { errorKey: 'DEPENDENCY_FAILURE' }
  if (created.value.state !== TASK_STATE_CREATED) return { errorKey: 'DEPENDENCY_FAILURE' }
  if (created.value.outputArtifactRef !== null) return { errorKey: 'DEPENDENCY_FAILURE' }
  if (!isPlainObject(created.value.delivery)) return { errorKey: 'DEPENDENCY_FAILURE' }
  if (created.value.delivery.state !== DELIVERY_STATE_NOT_REQUESTED) return { errorKey: 'DEPENDENCY_FAILURE' }
  if (created.value.delivery.deliveryId !== null) return { errorKey: 'DEPENDENCY_FAILURE' }
  return { ok: true, value: created.value }
}

function applyAction(record, action) {
  let applied
  try {
    applied = transitionAudioTask(record, action)
  } catch {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (!applied || typeof applied !== 'object' || typeof applied.ok !== 'boolean') {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (applied.ok === false) return { errorKey: 'TASK_TRANSITION_REJECTED' }
  if (!isPlainObject(applied.value)) return { errorKey: 'DEPENDENCY_FAILURE' }
  return { ok: true, value: applied.value }
}

function validRecordSuccessShape(value) {
  return (
    isPlainObject(value) &&
    value.schemaVersion === TASK_FIXTURE_SCHEMA_VERSION &&
    isPlainObject(value.source) &&
    typeof value.source.kind === 'string' &&
    typeof value.source.ref === 'string' &&
    typeof value.taskId === 'string' &&
    typeof value.state === 'string' &&
    typeof value.feature === 'string' &&
    typeof value.taskType === 'string' &&
    typeof value.voiceProfileId === 'string' &&
    typeof value.deliveryRequested === 'boolean' &&
    isPlainObject(value.rights) &&
    typeof value.rights.state === 'string' &&
    isPlainObject(value.cancel) &&
    isPlainObject(value.delivery)
  )
}

function validDraftSuccessShape(value) {
  return (
    isPlainObject(value) &&
    value.schemaVersion === TASK_FIXTURE_SCHEMA_VERSION &&
    isPlainObject(value.source) &&
    typeof value.source.kind === 'string' &&
    typeof value.source.ref === 'string' &&
    typeof value.taskId === 'string' &&
    typeof value.feature === 'string' &&
    typeof value.taskType === 'string' &&
    typeof value.voiceProfileId === 'string' &&
    typeof value.deliveryRequested === 'boolean' &&
    isPlainObject(value.rights) &&
    typeof value.rights.state === 'string'
  )
}

/** The only physical validateAudioTaskRecord call; rejectKey separates legal refusal from bad protocol. */
function validateRecord(record, rejectKey) {
  let validated
  try {
    validated = validateAudioTaskRecord(record)
  } catch {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (!validated || typeof validated !== 'object' || typeof validated.ok !== 'boolean') {
    return { errorKey: 'DEPENDENCY_FAILURE' }
  }
  if (validated.ok === false) return { errorKey: rejectKey }
  if (!validRecordSuccessShape(validated.value)) return { errorKey: 'DEPENDENCY_FAILURE' }
  return { ok: true, value: validated.value }
}

function sameDispatchIdentity(gate, execution) {
  if (gate.decision !== 'FIXTURE_READY') return false
  if (execution.phase !== 'SIMULATED') return false
  if (!isPlainObject(execution.dispatch)) return false
  if (!isPlainObject(execution.readiness)) return false
  if (execution.readiness.decision !== 'FIXTURE_READY') return false
  if (execution.readiness.category !== gate.category) return false
  if (execution.readiness.instanceId !== gate.instanceId) return false
  if (execution.readiness.candidateId !== gate.candidateId) return false
  const dispatch = execution.dispatch
  if (dispatch.category !== gate.category) return false
  if (dispatch.instanceId !== gate.instanceId) return false
  if (dispatch.candidateId !== gate.candidateId) return false
  return true
}

/**
 * A legal block: the legacy entries return the private two-key root, while the bytes entry always
 * returns its own three-key root with `production: null`. Same record/result in both modes.
 */
function blockedEnvelope(
  sourceCheck,
  readiness,
  record,
  projection,
  states,
  reason,
  messageZh,
  execution = null,
  byteMode = false,
) {
  const result = envelope({
    phase: 'BLOCKED',
    reason,
    messageZh,
    sourceCheck,
    readiness,
    execution,
    task: projection,
    states,
  })
  return byteMode ? bytesResult(record, result, null) : privateResult(record, result)
}

function runFlow(payload, existingRecord, byteMode) {
  const finish = (record, result) => (byteMode ? bytesResult(record, result, null) : privateResult(record, result))
  const surface = keySurface(payload, RESOLVER_KEYS)
  if (surface === 'unknown') return finish(null, fail('INVALID_INPUT', '<unknown-key>'))
  if (surface !== 'ok') return finish(null, fail('INVALID_INPUT', '$'))
  if (payload.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) {
    return finish(null, fail('UNSUPPORTED_VERSION', 'schemaVersion'))
  }

  let sourceResult
  try {
    sourceResult = resolveFixtureTaskSource(payload.sourceInput)
  } catch {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!sourceResult || typeof sourceResult !== 'object' || typeof sourceResult.ok !== 'boolean') {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (sourceResult.ok === false) return finish(null, fail('SOURCE_INPUT_INVALID', 'sourceInput'))
  if (!validSourceValue(sourceResult.value)) return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  const sourceCheck = sourceResult.value
  const feature = sourceCheck.voiceBinding.feature

  const context = validateContext(payload.context, feature)
  if (!context.ok) return finish(null, fail('INVALID_CONTEXT', 'context'))

  let gateResult
  try {
    gateResult = negotiateReadyFixtureProvider({
      schemaVersion: 1,
      negotiation: payload.sourceInput.voiceBinding.negotiation,
      readiness: payload.readiness,
    })
  } catch {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!gateResult || typeof gateResult !== 'object' || typeof gateResult.ok !== 'boolean') {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (gateResult.ok === false) return finish(null, fail('READINESS_INVALID', 'readiness'))
  if (!validGateValue(gateResult.value)) return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  const readiness = gateResult.value

  if (sourceCheck.decision === 'BLOCKED') {
    if (existingRecord !== null) {
      const projection = taskProjection(existingRecord)
      if (!projection.ok) return finish(null, fail(projection.errorKey, '$'))
      return blockedEnvelope(
        sourceCheck,
        readiness,
        existingRecord,
        projection.value,
        [existingRecord.state],
        TASK_FIXTURE_ERRORS.SOURCE_BLOCKED,
        sourceCheck.messageZh,
        null,
        byteMode,
      )
    }
    return finish(
      null,
      envelope({
        phase: 'BLOCKED',
        reason: TASK_FIXTURE_ERRORS.SOURCE_BLOCKED,
        messageZh: sourceCheck.messageZh,
        sourceCheck,
        readiness,
        execution: null,
        task: null,
        states: [],
      }),
    )
  }

  let record = existingRecord
  if (record === null) {
    const created = createTask(payload.sourceInput.voiceBinding.taskDraft, payload.sourceInput.voiceBinding.now)
    if (!created.ok) return finish(null, fail(created.errorKey, '$'))
    record = created.value
  }
  const states = [record.state]
  const initialProjection = taskProjection(record)
  if (!initialProjection.ok) return finish(null, fail(initialProjection.errorKey, '$'))

  if (readiness.decision === 'BLOCKED') {
    return blockedEnvelope(
      sourceCheck,
      readiness,
      record,
      initialProjection.value,
      states,
      TASK_FIXTURE_ERRORS.READINESS_BLOCKED,
      readiness.messageZh,
      null,
      byteMode,
    )
  }

  if (record.state === 'BLOCKED_RIGHTS') {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }

  if (feature === FEATURE_TTS) {
    return blockedEnvelope(
      sourceCheck,
      readiness,
      record,
      initialProjection.value,
      states,
      PROVIDER_DISPATCH_ERRORS.UNSUPPORTED_DISPATCH,
      TTS_UNSUPPORTED_MESSAGE,
      null,
      byteMode,
    )
  }

  let execution
  try {
    execution = dispatchReadyRvcFakeOnce({
      schemaVersion: 1,
      negotiation: payload.sourceInput.voiceBinding.negotiation,
      readiness: payload.readiness,
      context: context.value,
    })
  } catch {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!execution || typeof execution !== 'object' || typeof execution.ok !== 'boolean') {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (execution.ok === false) return finish(null, fail('DISPATCH_REJECTED', '$'))
  if (!validExecutionValue(execution.value)) return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  const executionValue = execution.value

  if (executionValue.phase === 'BLOCKED') {
    return blockedEnvelope(
      sourceCheck,
      readiness,
      record,
      initialProjection.value,
      states,
      TASK_FIXTURE_ERRORS.DISPATCH_BLOCKED,
      executionValue.messageZh,
      executionValue,
      byteMode,
    )
  }

  if (!sameDispatchIdentity(readiness, executionValue)) return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  const request = payload.sourceInput.voiceBinding.negotiation.request
  let verified
  try {
    verified = validateRvcFakeResult(executionValue.dispatch.result, request, context.value)
  } catch {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!verified || typeof verified !== 'object' || typeof verified.ok !== 'boolean') {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (verified.ok === false) return finish(null, fail('INVALID_TASK_RESULT', '$'))
  if (!isPlainObject(verified.value)) return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  const result = verified.value

  const taskSourceRef = payload.sourceInput.voiceBinding.taskDraft.source.ref
  if (result.status === 'SUCCEEDED_FAKE' && result.artifactRef === taskSourceRef) {
    return finish(null, fail('INVALID_TASK_RESULT', '$'))
  }

  if (byteMode && result.status === 'SUCCEEDED_FAKE') {
    const derived = deriveByteRequest(result)
    if (!derived.ok) return finish(null, bytesFail(derived.key))
    let produced
    try {
      produced = produceFixtureWav(derived.input)
    } catch {
      return finish(null, bytesFail('DEPENDENCY_FAILURE'))
    }
    const guarded = guardProducedBytes(produced, derived)
    if (!guarded.ok) return finish(null, bytesFail('DEPENDENCY_FAILURE'))
    const begin = applyAction(record, { type: 'BEGIN_PROCESS' })
    if (!begin.ok) return finish(null, fail(begin.errorKey, '$'))
    const bytesStates = [record.state, begin.value.state]
    const validatedBytes = validateRecord(begin.value, 'TASK_TRANSITION_REJECTED')
    if (!validatedBytes.ok) return finish(null, fail(validatedBytes.errorKey, '$'))
    const bytesProjection = taskProjection(validatedBytes.value)
    if (!bytesProjection.ok) return finish(null, fail(bytesProjection.errorKey, '$'))
    if (bytesProjection.value.state !== bytesStates[1]) return finish(null, fail('DEPENDENCY_FAILURE', '$'))
    return bytesResult(
      validatedBytes.value,
      envelope({
        phase: 'SIMULATED',
        reason: null,
        messageZh: BYTES_MESSAGE_ZH,
        sourceCheck,
        readiness,
        execution: executionValue,
        task: bytesProjection.value,
        states: bytesStates,
      }),
      guarded.production,
    )
  }
  const actions = [{ type: 'BEGIN_PROCESS' }]
  if (result.status === 'SUCCEEDED_FAKE') {
    actions.push({ type: 'ATTACH_FAKE_ARTIFACT', artifactRef: result.artifactRef })
  } else if (result.status === 'OFFLINE' || result.status === 'MODEL_NOT_AVAILABLE') {
    actions.push({ type: 'FAIL', code: 'AUDIO_FAKE_FAILURE' })
  } else if (result.status === 'TIMEOUT' || result.status === 'UNKNOWN') {
    actions.push({ type: 'MARK_UNKNOWN' })
  } else if (result.status === 'CANCEL_REQUESTED') {
    actions.push({ type: 'REQUEST_CANCEL' })
  } else if (result.status === 'CANCELLED_FAKE') {
    actions.push({ type: 'REQUEST_CANCEL' })
    actions.push({ type: 'CONFIRM_CANCEL' })
  } else {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }

  for (const action of actions) {
    const applied = applyAction(record, action)
    if (!applied.ok) return finish(null, fail(applied.errorKey, '$'))
    record = applied.value
    states.push(record.state)
  }

  const finalRecord = validateRecord(record, 'TASK_TRANSITION_REJECTED')
  if (!finalRecord.ok) return finish(null, fail(finalRecord.errorKey, '$'))
  const finalProjection = taskProjection(finalRecord.value)
  if (!finalProjection.ok) return finish(null, fail(finalProjection.errorKey, '$'))
  if (finalProjection.value.state !== states[states.length - 1]) {
    return finish(null, fail('DEPENDENCY_FAILURE', '$'))
  }

  return finish(
    finalRecord.value,
    envelope({
      phase: 'SIMULATED',
      reason: result.code,
      messageZh: executionValue.messageZh,
      sourceCheck,
      readiness,
      execution: executionValue,
      task: finalProjection.value,
      states,
    }),
  )
}

/** Legacy draft entry: creates the initial Task exactly as 08-C did. */
export function runDraftFixtureTaskOnce(input) {
  try {
    const copied = copyPartition(input)
    if (!copied.ok) return privateResult(null, fail(copied.key, '$'))
    if (!isPlainObject(copied.value)) return privateResult(null, fail('INVALID_INPUT', '$'))
    return runFlow(copied.value, null)
  } catch {
    return privateResult(null, fail('INVALID_INPUT', '$'))
  }
}

function readExistingFrame(frame) {
  if (!isPlainObject(frame)) return { ok: false, key: 'INVALID_INPUT', path: '$' }
  let keys
  try {
    keys = Reflect.ownKeys(frame)
  } catch {
    return { ok: false, key: 'INVALID_INPUT', path: '$' }
  }
  if (keys.length > 32) return { ok: false, key: 'RESOURCE_LIMIT', path: '$' }
  for (const key of keys) {
    if (typeof key !== 'string' || !EXISTING_KEYS.has(key)) {
      return { ok: false, key: 'INVALID_INPUT', path: '<unknown-key>' }
    }
  }
  if (keys.length !== EXISTING_KEYS.size) return { ok: false, key: 'INVALID_INPUT', path: '$' }

  const values = {}
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(frame, key)
    if (
      !descriptor ||
      !hasOwn(descriptor, 'value') ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      return { ok: false, key: 'INVALID_INPUT', path: '$' }
    }
    values[key] = descriptor.value
  }
  return { ok: true, scopeId: values.scopeId, record: values.record, input: values.input }
}

function draftFields(record) {
  return {
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    feature: record.feature,
    taskType: record.taskType,
    source: { kind: record.source.kind, ref: record.source.ref },
    voiceProfileId: record.voiceProfileId,
    deliveryRequested: record.deliveryRequested,
    rights: { state: record.rights.state },
  }
}

function sameDraftDomain(left, right) {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.taskId === right.taskId &&
    left.feature === right.feature &&
    left.taskType === right.taskType &&
    left.source.kind === right.source.kind &&
    left.source.ref === right.source.ref &&
    left.voiceProfileId === right.voiceProfileId &&
    left.deliveryRequested === right.deliveryRequested &&
    left.rights.state === right.rights.state
  )
}

function validateExisting(owner, input) {
  if (!isPlainObject(owner)) return { ok: false, key: 'INVALID_INPUT', path: '$' }
  if (!isPlainObject(input)) return { ok: false, key: 'INVALID_INPUT', path: '$' }
  const surface = keySurface(input, RESOLVER_KEYS)
  if (surface === 'unknown') return { ok: false, key: 'INVALID_INPUT', path: '<unknown-key>' }
  if (surface !== 'ok') return { ok: false, key: 'INVALID_INPUT', path: '$' }
  if (input.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) {
    return { ok: false, key: 'UNSUPPORTED_VERSION', path: 'schemaVersion' }
  }

  if (typeof owner.scopeId !== 'string' || !SCOPE_PATTERN.test(owner.scopeId)) {
    return { ok: false, key: 'INVALID_INPUT', path: '$' }
  }

  const validated = validateRecord(owner.record, 'INVALID_INPUT')
  if (!validated.ok) return { ok: false, key: validated.errorKey, path: '$' }
  const record = validated.value
  if (!INITIAL_STATES.has(record.state)) {
    return { ok: false, key: 'TASK_TRANSITION_REJECTED', path: '$' }
  }
  if (
    record.outputArtifactRef !== null ||
    !isPlainObject(record.cancel) ||
    record.cancel.requested !== false ||
    record.cancel.confirmed !== false ||
    !isPlainObject(record.delivery) ||
    record.delivery.state !== DELIVERY_STATE_NOT_REQUESTED ||
    record.delivery.deliveryId !== null ||
    record.lastError !== null ||
    record.mockOnly !== true ||
    record.realOperationAllowed !== false
  ) {
    return { ok: false, key: 'TASK_TRANSITION_REJECTED', path: '$' }
  }

  if (!isPlainObject(input.sourceInput) || !isPlainObject(input.sourceInput.voiceBinding)) {
    return { ok: false, key: 'SOURCE_INPUT_INVALID', path: 'sourceInput' }
  }
  const voiceBinding = input.sourceInput.voiceBinding
  if (!isPlainObject(voiceBinding.taskDraft)) {
    return { ok: false, key: 'SOURCE_INPUT_INVALID', path: 'sourceInput' }
  }

  let normalized
  try {
    normalized = validateAudioTaskDraft(voiceBinding.taskDraft)
  } catch {
    return { ok: false, key: 'DEPENDENCY_FAILURE', path: '$' }
  }
  if (!normalized || typeof normalized !== 'object' || typeof normalized.ok !== 'boolean') {
    return { ok: false, key: 'DEPENDENCY_FAILURE', path: '$' }
  }
  if (normalized.ok === false) return { ok: false, key: 'SOURCE_INPUT_INVALID', path: 'sourceInput' }
  if (!validDraftSuccessShape(normalized.value)) return { ok: false, key: 'DEPENDENCY_FAILURE', path: '$' }

  if (!isPlainObject(voiceBinding.expectation)) return { ok: false, key: 'INVALID_INPUT', path: '$' }
  if (voiceBinding.expectation.scopeId !== owner.scopeId) {
    return { ok: false, key: 'INVALID_INPUT', path: '$' }
  }
  if (!sameDraftDomain(draftFields(normalized.value), draftFields(record))) {
    return { ok: false, key: 'INVALID_INPUT', path: '$' }
  }
  return { ok: true, record, scopeId: owner.scopeId }
}

/**
 * Existing-record entry: reuses a complete initial AudioTask record and its scope.
 * The full record is returned only through this private result object.
 */
export function runExistingFixtureTaskOnce(frame) {
  try {
    const shallow = readExistingFrame(frame)
    if (!shallow.ok) return privateResult(null, fail(shallow.key, shallow.path))

    const ownerCopy = copyPartition({ scopeId: shallow.scopeId, record: shallow.record })
    if (!ownerCopy.ok) return privateResult(null, fail(ownerCopy.key, '$'))
    const inputCopy = copyPartition(shallow.input)
    if (!inputCopy.ok) return privateResult(null, fail(inputCopy.key, '$'))

    const checked = validateExisting(ownerCopy.value, inputCopy.value)
    if (!checked.ok) return privateResult(null, fail(checked.key, checked.path))
    return runFlow(inputCopy.value, checked.record)
  } catch {
    return privateResult(null, fail('INVALID_INPUT', '$'))
  }
}

/**
 * Bytes entry: the same existing-frame precheck and the same single flow, but after the real Fake
 * SUCCESS validation it prepares one bounded synthetic PCM16 pack and stops at PROCESSING.
 * It never ATTACHes the Fake ref, never marks SAVED and never creates a second Task.
 */
export function runExistingFixtureTaskBytesOnce(frame) {
  try {
    const shallow = readExistingFrame(frame)
    if (!shallow.ok) return bytesResult(null, fail(shallow.key, shallow.path), null)

    const ownerCopy = copyPartition({ scopeId: shallow.scopeId, record: shallow.record })
    if (!ownerCopy.ok) return bytesResult(null, fail(ownerCopy.key, '$'), null)
    const inputCopy = copyPartition(shallow.input)
    if (!inputCopy.ok) return bytesResult(null, fail(inputCopy.key, '$'), null)

    const checked = validateExisting(ownerCopy.value, inputCopy.value)
    if (!checked.ok) return bytesResult(null, fail(checked.key, checked.path), null)
    return runFlow(inputCopy.value, checked.record, true)
  } catch {
    return bytesResult(null, fail('INVALID_INPUT', '$'), null)
  }
}
