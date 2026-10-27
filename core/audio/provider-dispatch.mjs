/* Whale Voice — single RVC Fixture dispatch (Plan 06-C, OFFLINE / FIXTURE_ONLY).
 *
 * One synchronous call composes three existing pieces:
 *   1. the accepted 06-B negotiation input (recomputed, never trusted from the caller);
 *   2. the existing RVC Fake gateway's single simulated conversion;
 *   3. the existing strict RVC Fake result validator over the same request/context copies.
 *
 * It does not add a second model catalogue, conversion algorithm, result schema, queue, retry or
 * real adapter. A SIMULATED phase means one legal demonstration simulation completed; it does not
 * mean audio exists or that anything can be previewed, saved, delivered or retried.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { negotiateProviderInstance } from './provider-instances.mjs'
import {
  RVC_FAKE_SCENARIOS,
  simulateRvcFakeConversion,
  validateRvcFakeResult,
} from '../svc/rvc-fake-gateway.mjs'

export const PROVIDER_DISPATCH_SCHEMA_VERSION = 1

export const PROVIDER_DISPATCH_ERRORS = Object.freeze({
  INVALID_INPUT: 'PROVIDER_DISPATCH_INVALID_INPUT',
  RESOURCE_LIMIT: 'PROVIDER_DISPATCH_RESOURCE_LIMIT',
  UNSUPPORTED_VERSION: 'PROVIDER_DISPATCH_UNSUPPORTED_VERSION',
  INVALID_CONTEXT: 'PROVIDER_DISPATCH_INVALID_CONTEXT',
  NEGOTIATION_INVALID: 'PROVIDER_DISPATCH_NEGOTIATION_INVALID',
  UNSUPPORTED_DISPATCH: 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH',
  DEPENDENCY_FAILURE: 'PROVIDER_DISPATCH_DEPENDENCY_FAILURE',
  SIMULATION_REJECTED: 'PROVIDER_DISPATCH_SIMULATION_REJECTED',
  INVALID_RESULT: 'PROVIDER_DISPATCH_INVALID_RESULT',
})

const INPUT_KEYS = Object.freeze(new Set(['schemaVersion', 'negotiation', 'context']))
const CONTEXT_KEYS = Object.freeze(new Set(['requestId', 'endpointId', 'scenario']))
const REQUEST_ID_PATTERN = /^request:fixture-[A-Za-z0-9_-]{1,32}$/
const ENDPOINT_ID = 'gateway:fixture-rvc'

const ERROR_REASONS = Object.freeze({
  INVALID_INPUT: 'invalid input',
  RESOURCE_LIMIT: 'resource limit exceeded',
  UNSUPPORTED_VERSION: 'unsupported schema version',
  INVALID_CONTEXT: 'invalid fixture context',
  NEGOTIATION_INVALID: 'negotiation is invalid',
  UNSUPPORTED_DISPATCH: 'this instance cannot be dispatched',
  DEPENDENCY_FAILURE: 'dependency returned an invalid result',
  SIMULATION_REJECTED: 'simulation rejected the request',
  INVALID_RESULT: 'simulation result is invalid',
})

const SIMULATED_MESSAGES = Object.freeze({
  SUCCEEDED_FAKE: '已完成一次演示模拟；没有生成真实音频，不能试听、保存或发送。',
  OFFLINE: '演示后端未连接；可重新检查或稍后再说，不会自动重试。',
  MODEL_NOT_AVAILABLE: '演示模型未就绪；请重新选择，不会自动换模型或下载。',
  TIMEOUT: '演示结果超时；请核查状态，不会自动重试或发送。',
  CANCEL_REQUESTED: '已模拟请求取消；尚未确认停止，请先核查状态。',
  CANCELLED_FAKE: '已模拟确认取消；这不证明真实进程已停止。',
  UNKNOWN: '演示结果未知；请人工核查，不会自动重试或发送。',
})

const UNSUPPORTED_DISPATCH_MESSAGE = '该实例的演示执行尚未实现；可以查看能力说明或稍后再说。'

function issue(code, path, reason) {
  return { code, path, reason }
}

function failKey(key, path) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [issue(PROVIDER_DISPATCH_ERRORS[key], path, ERROR_REASONS[key])],
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

function buildEnvelope(fields) {
  return deepFreezeFixtureValue({
    schemaVersion: PROVIDER_DISPATCH_SCHEMA_VERSION,
    category: fields.category,
    instanceId: fields.instanceId,
    candidateId: fields.candidateId,
    requestId: fields.requestId,
    phase: fields.phase,
    reason: fields.reason,
    negotiation: fields.negotiation,
    result: fields.result,
    messageZh: fields.messageZh,
    mockOnly: true,
    realOperationAllowed: false,
    submitAllowed: false,
    automaticRetryAllowed: false,
  })
}

function successEnvelope(value) {
  return deepFreezeFixtureValue({ ok: true, value })
}

function validateContext(context) {
  if (!isPlainObject(context)) return { ok: false }
  const keys = Reflect.ownKeys(context)
  for (const key of keys) {
    if (typeof key !== 'string' || !CONTEXT_KEYS.has(key)) return { ok: false }
  }
  if (keys.length !== CONTEXT_KEYS.size) return { ok: false }
  if (typeof context.requestId !== 'string' || !REQUEST_ID_PATTERN.test(context.requestId)) return { ok: false }
  if (context.endpointId !== ENDPOINT_ID) return { ok: false }
  if (!RVC_FAKE_SCENARIOS.includes(context.scenario)) return { ok: false }
  return {
    ok: true,
    value: {
      requestId: context.requestId,
      endpointId: context.endpointId,
      scenario: context.scenario,
    },
  }
}

function validNegotiationValue(value) {
  if (!isPlainObject(value)) return false
  if (value.decision !== 'BLOCKED' && value.decision !== 'FIXTURE_COMPATIBLE') return false
  if (value.category !== 'TTS' && value.category !== 'SVC') return false
  if (typeof value.instanceId !== 'string') return false
  if (value.candidateId !== null && typeof value.candidateId !== 'string') return false
  if (value.reason !== null && typeof value.reason !== 'string') return false
  if (typeof value.messageZh !== 'string') return false
  return true
}

function simulatedMessage(status) {
  return SIMULATED_MESSAGES[status] || '已返回一次演示模拟结果；尚未生成真实音频，不能试听、保存或发送。'
}

function copyNegotiationValue(value) {
  const copied = copyFixtureInput(value)
  return copied.ok ? copied.value : null
}

export function dispatchRvcFakeOnce(input) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) return failKey(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) return failKey('INVALID_INPUT', '$')

  for (const key of Reflect.ownKeys(payload)) {
    if (typeof key !== 'string' || !INPUT_KEYS.has(key)) return failKey('INVALID_INPUT', '<unknown-key>')
  }
  for (const key of INPUT_KEYS) {
    if (!hasOwn(payload, key)) return failKey('INVALID_INPUT', key === 'schemaVersion' ? 'schemaVersion' : '$')
  }
  if (payload.schemaVersion !== PROVIDER_DISPATCH_SCHEMA_VERSION) {
    return failKey('UNSUPPORTED_VERSION', 'schemaVersion')
  }

  const context = validateContext(payload.context)
  if (!context.ok) return failKey('INVALID_CONTEXT', 'context')

  let negotiation
  try {
    negotiation = negotiateProviderInstance(payload.negotiation)
  } catch {
    return failKey('DEPENDENCY_FAILURE', '$')
  }
  if (!negotiation || typeof negotiation !== 'object' || typeof negotiation.ok !== 'boolean') {
    return failKey('DEPENDENCY_FAILURE', '$')
  }
  if (negotiation.ok === false) return failKey('NEGOTIATION_INVALID', 'negotiation')
  if (!validNegotiationValue(negotiation.value)) return failKey('DEPENDENCY_FAILURE', '$')

  const value = negotiation.value
  const negotiationCopy = copyNegotiationValue(value)
  if (negotiationCopy === null) return failKey('DEPENDENCY_FAILURE', '$')

  if (value.decision === 'BLOCKED') {
    return successEnvelope(
      buildEnvelope({
        category: value.category,
        instanceId: value.instanceId,
        candidateId: value.candidateId,
        requestId: context.value.requestId,
        phase: 'BLOCKED',
        reason: value.reason,
        negotiation: negotiationCopy,
        result: null,
        messageZh: value.messageZh,
      }),
    )
  }

  if (value.category !== 'SVC' || value.candidateId !== 'rvc') {
    return successEnvelope(
      buildEnvelope({
        category: value.category,
        instanceId: value.instanceId,
        candidateId: value.candidateId,
        requestId: context.value.requestId,
        phase: 'BLOCKED',
        reason: PROVIDER_DISPATCH_ERRORS.UNSUPPORTED_DISPATCH,
        negotiation: negotiationCopy,
        result: null,
        messageZh: UNSUPPORTED_DISPATCH_MESSAGE,
      }),
    )
  }

  const request = payload.negotiation.request
  if (!isPlainObject(request)) return failKey('NEGOTIATION_INVALID', 'negotiation')

  let simulation
  try {
    simulation = simulateRvcFakeConversion(request, context.value)
  } catch {
    return failKey('DEPENDENCY_FAILURE', '$')
  }
  if (!simulation || simulation.ok !== true || !isPlainObject(simulation.value)) {
    return failKey('SIMULATION_REJECTED', 'result')
  }

  let validated
  try {
    validated = validateRvcFakeResult(simulation.value, request, context.value)
  } catch {
    return failKey('DEPENDENCY_FAILURE', '$')
  }
  if (!validated || validated.ok !== true || !isPlainObject(validated.value)) {
    return failKey('INVALID_RESULT', 'result')
  }

  const resultCopy = copyFixtureInput(validated.value)
  if (!resultCopy.ok) return failKey('INVALID_RESULT', 'result')
  const result = resultCopy.value
  if (typeof result.status !== 'string' || !hasOwn(SIMULATED_MESSAGES, result.status)) {
    return failKey('INVALID_RESULT', 'result')
  }

  return successEnvelope(
    buildEnvelope({
      category: value.category,
      instanceId: value.instanceId,
      candidateId: value.candidateId,
      requestId: context.value.requestId,
      phase: 'SIMULATED',
      reason: result.code,
      negotiation: negotiationCopy,
      result,
      messageZh: simulatedMessage(result.status),
    }),
  )
}
