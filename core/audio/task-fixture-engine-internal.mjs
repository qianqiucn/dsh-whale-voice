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
 * Both return a private {record, result} object. Only `result` (the old 13-key public envelope) may
 * leave the legacy facade; the full record stays internal. No I/O, clock, randomness, process,
 * queue or cross-call state is used. A successful run ends at ARTIFACT_READY with a Fake reference.
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

function blockedEnvelope(sourceCheck, readiness, record, projection, states, reason, messageZh, execution = null) {
  return privateResult(
    record,
    envelope({
      phase: 'BLOCKED',
      reason,
      messageZh,
      sourceCheck,
      readiness,
      execution,
      task: projection,
      states,
    }),
  )
}

function runFlow(payload, existingRecord) {
  const surface = keySurface(payload, RESOLVER_KEYS)
  if (surface === 'unknown') return privateResult(null, fail('INVALID_INPUT', '<unknown-key>'))
  if (surface !== 'ok') return privateResult(null, fail('INVALID_INPUT', '$'))
  if (payload.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) {
    return privateResult(null, fail('UNSUPPORTED_VERSION', 'schemaVersion'))
  }

  let sourceResult
  try {
    sourceResult = resolveFixtureTaskSource(payload.sourceInput)
  } catch {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!sourceResult || typeof sourceResult !== 'object' || typeof sourceResult.ok !== 'boolean') {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (sourceResult.ok === false) return privateResult(null, fail('SOURCE_INPUT_INVALID', 'sourceInput'))
  if (!validSourceValue(sourceResult.value)) return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  const sourceCheck = sourceResult.value
  const feature = sourceCheck.voiceBinding.feature

  const context = validateContext(payload.context, feature)
  if (!context.ok) return privateResult(null, fail('INVALID_CONTEXT', 'context'))

  let gateResult
  try {
    gateResult = negotiateReadyFixtureProvider({
      schemaVersion: 1,
      negotiation: payload.sourceInput.voiceBinding.negotiation,
      readiness: payload.readiness,
    })
  } catch {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!gateResult || typeof gateResult !== 'object' || typeof gateResult.ok !== 'boolean') {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (gateResult.ok === false) return privateResult(null, fail('READINESS_INVALID', 'readiness'))
  if (!validGateValue(gateResult.value)) return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  const readiness = gateResult.value

  if (sourceCheck.decision === 'BLOCKED') {
    if (existingRecord !== null) {
      const projection = taskProjection(existingRecord)
      if (!projection.ok) return privateResult(null, fail(projection.errorKey, '$'))
      return blockedEnvelope(
        sourceCheck,
        readiness,
        existingRecord,
        projection.value,
        [existingRecord.state],
        TASK_FIXTURE_ERRORS.SOURCE_BLOCKED,
        sourceCheck.messageZh,
      )
    }
    return privateResult(
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
    if (!created.ok) return privateResult(null, fail(created.errorKey, '$'))
    record = created.value
  }
  const states = [record.state]
  const initialProjection = taskProjection(record)
  if (!initialProjection.ok) return privateResult(null, fail(initialProjection.errorKey, '$'))

  if (readiness.decision === 'BLOCKED') {
    return blockedEnvelope(
      sourceCheck,
      readiness,
      record,
      initialProjection.value,
      states,
      TASK_FIXTURE_ERRORS.READINESS_BLOCKED,
      readiness.messageZh,
    )
  }

  if (record.state === 'BLOCKED_RIGHTS') {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
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
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!execution || typeof execution !== 'object' || typeof execution.ok !== 'boolean') {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (execution.ok === false) return privateResult(null, fail('DISPATCH_REJECTED', '$'))
  if (!validExecutionValue(execution.value)) return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
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
    )
  }

  if (!sameDispatchIdentity(readiness, executionValue)) return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  const request = payload.sourceInput.voiceBinding.negotiation.request
  let verified
  try {
    verified = validateRvcFakeResult(executionValue.dispatch.result, request, context.value)
  } catch {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (!verified || typeof verified !== 'object' || typeof verified.ok !== 'boolean') {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }
  if (verified.ok === false) return privateResult(null, fail('INVALID_TASK_RESULT', '$'))
  if (!isPlainObject(verified.value)) return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  const result = verified.value

  const taskSourceRef = payload.sourceInput.voiceBinding.taskDraft.source.ref
  if (result.status === 'SUCCEEDED_FAKE' && result.artifactRef === taskSourceRef) {
    return privateResult(null, fail('INVALID_TASK_RESULT', '$'))
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
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }

  for (const action of actions) {
    const applied = applyAction(record, action)
    if (!applied.ok) return privateResult(null, fail(applied.errorKey, '$'))
    record = applied.value
    states.push(record.state)
  }

  const finalRecord = validateRecord(record, 'TASK_TRANSITION_REJECTED')
  if (!finalRecord.ok) return privateResult(null, fail(finalRecord.errorKey, '$'))
  const finalProjection = taskProjection(finalRecord.value)
  if (!finalProjection.ok) return privateResult(null, fail(finalProjection.errorKey, '$'))
  if (finalProjection.value.state !== states[states.length - 1]) {
    return privateResult(null, fail('DEPENDENCY_FAILURE', '$'))
  }

  return privateResult(
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
