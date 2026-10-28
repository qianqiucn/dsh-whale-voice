/* Whale Voice — one Fixture audio-task composition (Plan 08-C, OFFLINE / FIXTURE_ONLY).
 *
 * One synchronous call composes, over the same original input:
 *   1. the accepted 08-B source association (which itself reuses the 08-A voice binding once);
 *   2. the accepted 06-D pure readiness gate;
 *   3. at most one existing RVC Fixture dispatch through 06-D → 06-C;
 *   4. the existing AudioTask v1 create/transition/validate/project functions.
 *
 * A successful run ends at the existing task state ARTIFACT_READY with a Fake output reference. It
 * never MARK_SAVED, never creates a delivery/Relay candidate and never sends. TTS has no Fixture
 * synthesizer and stays an explicit UNSUPPORTED_DISPATCH block. No I/O, clock, randomness, process,
 * queue, persistent task or cross-call state is used or created.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { resolveFixtureTaskSource } from './source-artifacts.mjs'
import { dispatchReadyRvcFakeOnce, negotiateReadyFixtureProvider } from './provider-readiness.mjs'
import { PROVIDER_DISPATCH_ERRORS } from './provider-dispatch.mjs'
import {
  createAudioTaskRecord,
  projectAudioTask,
  transitionAudioTask,
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
const REQUEST_ID_PATTERN = /^request:fixture-[A-Za-z0-9_-]{1,32}$/
const ENDPOINT_ID = 'gateway:fixture-rvc'

const FEATURE_TTS = 'voice-bubbles'
const FEATURE_SVC = 'singing'
const TTS_UNSUPPORTED_MESSAGE = '该实例的演示执行尚未实现；可以查看能力说明或稍后再说。'

const SOURCE_KINDS = Object.freeze(new Set(['TEXT', 'AUDIO']))
const GATE_DECISIONS = Object.freeze(new Set(['FIXTURE_READY', 'BLOCKED']))
const CATEGORIES = Object.freeze(new Set(['TTS', 'SVC']))
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

function runFixtureAudioTaskOnceInternal(input) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) return fail(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) return fail('INVALID_INPUT', '$')

  const surface = keySurface(payload, RESOLVER_KEYS)
  if (surface === 'unknown') return fail('INVALID_INPUT', '<unknown-key>')
  if (surface !== 'ok') return fail('INVALID_INPUT', '$')
  if (payload.schemaVersion !== TASK_FIXTURE_SCHEMA_VERSION) {
    return fail('UNSUPPORTED_VERSION', 'schemaVersion')
  }

  // 1. The accepted 08-B source association, over the same original input.
  let sourceResult
  try {
    sourceResult = resolveFixtureTaskSource(payload.sourceInput)
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!sourceResult || typeof sourceResult !== 'object' || typeof sourceResult.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (sourceResult.ok === false) return fail('SOURCE_INPUT_INVALID', 'sourceInput')
  if (!validSourceValue(sourceResult.value)) return fail('DEPENDENCY_FAILURE', '$')
  const sourceCheck = sourceResult.value
  const feature = sourceCheck.voiceBinding.feature

  // 2. Context variant, validated even when the source result is a legal BLOCKED.
  const context = validateContext(payload.context, feature)
  if (!context.ok) return fail('INVALID_CONTEXT', 'context')

  // 3. The accepted 06-D pure readiness gate (full observation-table validation).
  let gateResult
  try {
    gateResult = negotiateReadyFixtureProvider({
      schemaVersion: 1,
      negotiation: payload.sourceInput.voiceBinding.negotiation,
      readiness: payload.readiness,
    })
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!gateResult || typeof gateResult !== 'object' || typeof gateResult.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (gateResult.ok === false) return fail('READINESS_INVALID', 'readiness')
  if (!validGateValue(gateResult.value)) return fail('DEPENDENCY_FAILURE', '$')
  const readiness = gateResult.value

  // 4. A legal source block wins over the gate: no Task, no dispatch.
  if (sourceCheck.decision === 'BLOCKED') {
    return envelope({
      phase: 'BLOCKED',
      reason: TASK_FIXTURE_ERRORS.SOURCE_BLOCKED,
      messageZh: sourceCheck.messageZh,
      sourceCheck,
      readiness,
      execution: null,
      task: null,
      states: [],
    })
  }

  // 5. Task creation always completes before any Fake call.
  const created = createTask(payload.sourceInput.voiceBinding.taskDraft, payload.sourceInput.voiceBinding.now)
  if (!created.ok) return fail(created.errorKey, '$')
  let record = created.value
  const states = [record.state]
  const createdProjection = taskProjection(record)
  if (!createdProjection.ok) return fail(createdProjection.errorKey, '$')

  // 6. A legal readiness block keeps the CREATED task and never begins processing.
  if (readiness.decision === 'BLOCKED') {
    return envelope({
      phase: 'BLOCKED',
      reason: TASK_FIXTURE_ERRORS.READINESS_BLOCKED,
      messageZh: readiness.messageZh,
      sourceCheck,
      readiness,
      execution: null,
      task: createdProjection.value,
      states,
    })
  }

  // 7. TTS has no Fixture synthesizer: explicit controlled block, CREATED, no dispatch.
  if (feature === FEATURE_TTS) {
    return envelope({
      phase: 'BLOCKED',
      reason: PROVIDER_DISPATCH_ERRORS.UNSUPPORTED_DISPATCH,
      messageZh: TTS_UNSUPPORTED_MESSAGE,
      sourceCheck,
      readiness,
      execution: null,
      task: createdProjection.value,
      states,
    })
  }

  // 8. At most one existing RVC Fixture dispatch through 06-D.
  let execution
  try {
    execution = dispatchReadyRvcFakeOnce({
      schemaVersion: 1,
      negotiation: payload.sourceInput.voiceBinding.negotiation,
      readiness: payload.readiness,
      context: context.value,
    })
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!execution || typeof execution !== 'object' || typeof execution.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (execution.ok === false) return fail('DISPATCH_REJECTED', '$')
  if (!validExecutionValue(execution.value)) return fail('DEPENDENCY_FAILURE', '$')
  const executionValue = execution.value

  if (executionValue.phase === 'BLOCKED') {
    return envelope({
      phase: 'BLOCKED',
      reason: TASK_FIXTURE_ERRORS.DISPATCH_BLOCKED,
      messageZh: executionValue.messageZh,
      sourceCheck,
      readiness,
      execution: executionValue,
      task: createdProjection.value,
      states,
    })
  }

  // 9. Revalidate the original 15-field result and enforce output ownership.
  if (!sameDispatchIdentity(readiness, executionValue)) return fail('DEPENDENCY_FAILURE', '$')
  const request = payload.sourceInput.voiceBinding.negotiation.request
  let verified
  try {
    verified = validateRvcFakeResult(executionValue.dispatch.result, request, context.value)
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!verified || typeof verified !== 'object' || typeof verified.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (verified.ok === false) return fail('INVALID_TASK_RESULT', '$')
  if (!isPlainObject(verified.value)) return fail('DEPENDENCY_FAILURE', '$')
  const result = verified.value

  const taskSourceRef = payload.sourceInput.voiceBinding.taskDraft.source.ref
  if (result.status === 'SUCCEEDED_FAKE' && result.artifactRef === taskSourceRef) {
    return fail('INVALID_TASK_RESULT', '$')
  }

  // 10. Reduce the real Task through the existing v1 actions only.
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
    return fail('DEPENDENCY_FAILURE', '$')
  }

  for (const action of actions) {
    const applied = applyAction(record, action)
    if (!applied.ok) return fail(applied.errorKey, '$')
    record = applied.value
    states.push(record.state)
  }

  let finalRecord
  try {
    finalRecord = validateAudioTaskRecord(record)
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!finalRecord || typeof finalRecord !== 'object' || typeof finalRecord.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (finalRecord.ok === false) return fail('TASK_TRANSITION_REJECTED', '$')

  const finalProjection = taskProjection(finalRecord.value)
  if (!finalProjection.ok) return fail(finalProjection.errorKey, '$')
  if (finalProjection.value.state !== states[states.length - 1]) {
    return fail('DEPENDENCY_FAILURE', '$')
  }

  return envelope({
    phase: 'SIMULATED',
    reason: result.code,
    messageZh: executionValue.messageZh,
    sourceCheck,
    readiness,
    execution: executionValue,
    task: finalProjection.value,
    states,
  })
}

/**
 * Run one Fixture audio task: source association → readiness → at most one RVC Fake → Task.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function runFixtureAudioTaskOnce(input) {
  try {
    return runFixtureAudioTaskOnceInternal(input)
  } catch {
    return fail('INVALID_INPUT', '$')
  }
}
