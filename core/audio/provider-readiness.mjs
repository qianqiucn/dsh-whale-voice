/* Whale Voice — Fixture provider readiness (Plan 06-D, OFFLINE / FIXTURE_ONLY).
 *
 * A thin gateway around the accepted 06-B negotiation and 06-C dispatch:
 *   negotiation → full observation-table validation → selected installation state
 *   → resource admission → optional single existing RVC Fixture dispatch.
 *
 * It adds no real installation probe, hardware probe, registry, queue, scheduler or synthesizer.
 * `PRESENT` / `FIXTURE_READY` are demonstration states only; they do not prove real installation,
 * real CPU/GPU capacity or product integration.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { dispatchRvcFakeOnce } from './provider-dispatch.mjs'
import { negotiateProviderInstance } from './provider-instances.mjs'
import { RVC_FAKE_SCENARIOS } from '../svc/rvc-fake-gateway.mjs'

export const PROVIDER_READINESS_SCHEMA_VERSION = 1

export const PROVIDER_READINESS_ERRORS = Object.freeze({
  INVALID_INPUT: 'PROVIDER_READINESS_INVALID_INPUT',
  RESOURCE_LIMIT: 'PROVIDER_READINESS_RESOURCE_LIMIT',
  UNSUPPORTED_VERSION: 'PROVIDER_READINESS_UNSUPPORTED_VERSION',
  INVALID_READINESS: 'PROVIDER_READINESS_INVALID_READINESS',
  DUPLICATE_OBSERVATION: 'PROVIDER_READINESS_DUPLICATE_OBSERVATION',
  UNKNOWN_OBSERVATION_INSTANCE: 'PROVIDER_READINESS_UNKNOWN_OBSERVATION_INSTANCE',
  NEGOTIATION_INVALID: 'PROVIDER_READINESS_NEGOTIATION_INVALID',
  INVALID_CONTEXT: 'PROVIDER_READINESS_INVALID_CONTEXT',
  DEPENDENCY_FAILURE: 'PROVIDER_READINESS_DEPENDENCY_FAILURE',
  DISPATCH_REJECTED: 'PROVIDER_READINESS_DISPATCH_REJECTED',
  OBSERVATION_MISSING: 'PROVIDER_READINESS_OBSERVATION_MISSING',
  INSTALLATION_MISSING: 'PROVIDER_READINESS_INSTALLATION_MISSING',
  INSTALLATION_UNKNOWN: 'PROVIDER_READINESS_INSTALLATION_UNKNOWN',
  RESOURCE_POLICY_UNKNOWN: 'PROVIDER_READINESS_RESOURCE_POLICY_UNKNOWN',
  RESOURCE_UNKNOWN: 'PROVIDER_READINESS_RESOURCE_UNKNOWN',
  RESOURCE_UNAVAILABLE: 'PROVIDER_READINESS_RESOURCE_UNAVAILABLE',
})

const NEGOTIATION_KEYS = Object.freeze(new Set(['schemaVersion', 'negotiation', 'readiness']))
const DISPATCH_KEYS = Object.freeze(new Set(['schemaVersion', 'negotiation', 'readiness', 'context']))
const READINESS_KEYS = Object.freeze(new Set(['schemaVersion', 'instances']))
const OBSERVATION_KEYS = Object.freeze(new Set(['instanceId', 'installation', 'resources']))
const RESOURCE_KEYS = Object.freeze(new Set(['profile', 'cpu', 'gpu']))
const INSTALLATIONS = Object.freeze(new Set(['PRESENT', 'ABSENT', 'UNKNOWN']))
const PROFILES = Object.freeze(new Set(['TTS_MANIFEST', 'CPU_FIXTURE', 'GPU_FIXTURE']))
const RESOURCE_STATES = Object.freeze(new Set(['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN']))
const CONTEXT_KEYS = Object.freeze(new Set(['requestId', 'endpointId', 'scenario']))
const INSTANCE_ID_PATTERN = /^instance:[A-Za-z0-9_-]{1,64}$/
const REQUEST_ID_PATTERN = /^request:fixture-[A-Za-z0-9_-]{1,32}$/
const ENDPOINT_ID = 'gateway:fixture-rvc'
const MAX_OBSERVATIONS = 32

const ERROR_REASONS = Object.freeze({
  INVALID_INPUT: 'invalid input',
  RESOURCE_LIMIT: 'resource limit exceeded',
  UNSUPPORTED_VERSION: 'unsupported schema version',
  INVALID_READINESS: 'invalid readiness observation',
  DUPLICATE_OBSERVATION: 'duplicate observation instance',
  UNKNOWN_OBSERVATION_INSTANCE: 'observation references an unknown instance',
  NEGOTIATION_INVALID: 'negotiation is invalid',
  INVALID_CONTEXT: 'invalid fixture context',
  DEPENDENCY_FAILURE: 'dependency returned an invalid result',
  DISPATCH_REJECTED: 'dispatch rejected the request',
})

const MESSAGES = Object.freeze({
  READY: '演示准入通过；尚未接入真实生成、安装或发送。',
  OBSERVATION_MISSING: '缺少所选实例的演示观察，请重新检查。',
  INSTALLATION_MISSING: '演示组件未安装，请检查依赖或稍后再说。',
  INSTALLATION_UNKNOWN: '演示安装状态未知，请重新检查。',
  RESOURCE_POLICY_UNKNOWN: '演示资源要求尚不明确，暂不能继续。',
  RESOURCE_UNKNOWN: '演示资源状态未知，请重新检查。',
  RESOURCE_UNAVAILABLE: '演示所需资源不可用，请重新选择可用方案或稍后再说。',
})

function failKey(key, path) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [{ code: PROVIDER_READINESS_ERRORS[key], path, reason: ERROR_REASONS[key] }],
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

function exactKeys(value, allowed) {
  if (!isPlainObject(value)) return false
  const keys = Reflect.ownKeys(value)
  if (keys.length !== allowed.size) return false
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) return false
  }
  return true
}

function validateContext(context) {
  if (!exactKeys(context, CONTEXT_KEYS)) return null
  if (typeof context.requestId !== 'string' || !REQUEST_ID_PATTERN.test(context.requestId)) return null
  if (context.endpointId !== ENDPOINT_ID) return null
  if (!RVC_FAKE_SCENARIOS.includes(context.scenario)) return null
  return { requestId: context.requestId, endpointId: context.endpointId, scenario: context.scenario }
}

function validateReadinessShape(readiness) {
  if (!isPlainObject(readiness) || !exactKeys(readiness, READINESS_KEYS)) {
    return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
  }
  if (!hasOwn(readiness, 'schemaVersion')) return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
  if (readiness.schemaVersion !== PROVIDER_READINESS_SCHEMA_VERSION) {
    return { ok: false, key: 'UNSUPPORTED_VERSION', path: 'readiness' }
  }
  if (!Array.isArray(readiness.instances)) return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
  if (readiness.instances.length > MAX_OBSERVATIONS) return { ok: false, key: 'RESOURCE_LIMIT', path: '$' }

  const seen = new Set()
  const observations = []
  for (const item of readiness.instances) {
    if (!isPlainObject(item) || !exactKeys(item, OBSERVATION_KEYS)) {
      return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
    }
    if (typeof item.instanceId !== 'string' || !INSTANCE_ID_PATTERN.test(item.instanceId)) {
      return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
    }
    if (seen.has(item.instanceId)) return { ok: false, key: 'DUPLICATE_OBSERVATION', path: 'readiness' }
    seen.add(item.instanceId)
    if (!INSTALLATIONS.has(item.installation)) return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
    const resources = item.resources
    if (!isPlainObject(resources) || !exactKeys(resources, RESOURCE_KEYS)) {
      return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
    }
    if (!PROFILES.has(resources.profile)) return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
    if (!RESOURCE_STATES.has(resources.cpu) || !RESOURCE_STATES.has(resources.gpu)) {
      return { ok: false, key: 'INVALID_READINESS', path: 'readiness' }
    }
    observations.push({
      instanceId: item.instanceId,
      installation: item.installation,
      profile: resources.profile,
      cpu: resources.cpu,
      gpu: resources.gpu,
    })
  }
  return { ok: true, value: observations }
}

function prepare(input, requireContext) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) return failKey(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) return failKey('INVALID_INPUT', '$')

  const allowed = requireContext ? DISPATCH_KEYS : NEGOTIATION_KEYS
  for (const key of Reflect.ownKeys(payload)) {
    if (typeof key !== 'string' || !allowed.has(key)) return failKey('INVALID_INPUT', '<unknown-key>')
  }
  for (const key of allowed) {
    if (hasOwn(payload, key)) continue
    return failKey('INVALID_INPUT', key === 'schemaVersion' ? 'schemaVersion' : '$')
  }
  if (payload.schemaVersion !== PROVIDER_READINESS_SCHEMA_VERSION) {
    return failKey('UNSUPPORTED_VERSION', 'schemaVersion')
  }

  const readiness = validateReadinessShape(payload.readiness)
  if (!readiness.ok) return failKey(readiness.key, readiness.path)

  let context = null
  if (requireContext) {
    context = validateContext(payload.context)
    if (context === null) return failKey('INVALID_CONTEXT', 'context')
  }
  return { ok: true, payload, readiness: readiness.value, context }
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

function computeRequiredResource(category, profile, registryInstance) {
  if (category === 'SVC') {
    if (profile === 'CPU_FIXTURE') return 'CPU'
    if (profile === 'GPU_FIXTURE') return 'GPU'
    return 'UNKNOWN'
  }
  const resources = registryInstance.manifest.resources
  if (!isPlainObject(resources)) return 'UNKNOWN'
  if (resources.local === false) return 'REMOTE'
  if (resources.gpuRequired === true) return 'GPU'
  if (resources.cpuCapable === true) return 'CPU'
  return 'UNKNOWN'
}

function gateValue(fields) {
  return {
    schemaVersion: PROVIDER_READINESS_SCHEMA_VERSION,
    category: fields.category,
    instanceId: fields.instanceId,
    candidateId: fields.candidateId,
    decision: fields.decision,
    reason: fields.reason,
    negotiation: fields.negotiation,
    observation: fields.observation,
    messageZh: fields.messageZh,
    mockOnly: true,
    realOperationAllowed: false,
    submitAllowed: false,
    automaticRetryAllowed: false,
  }
}

function blockedValue(base, reason, messageZh, observation, negotiation) {
  return gateValue({
    category: base.category,
    instanceId: base.instanceId,
    candidateId: base.candidateId,
    decision: 'BLOCKED',
    reason,
    negotiation,
    observation,
    messageZh,
  })
}

function evaluate(payload, observations, context) {
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

  const oldValue = negotiation.value
  const registryInstances = payload.negotiation.registry.instances
  if (!Array.isArray(registryInstances)) return failKey('DEPENDENCY_FAILURE', '$')
  const registryById = new Map()
  for (const item of registryInstances) {
    if (!isPlainObject(item) || typeof item.instanceId !== 'string') continue
    registryById.set(item.instanceId, item)
  }
  const observationById = new Map()
  for (const item of observations) observationById.set(item.instanceId, item)

  for (const item of observations) {
    const registryItem = registryById.get(item.instanceId)
    if (!registryItem) return failKey('UNKNOWN_OBSERVATION_INSTANCE', 'readiness')
    if (registryItem.category === 'TTS') {
      if (item.profile !== 'TTS_MANIFEST') return failKey('INVALID_READINESS', 'readiness')
    } else if (registryItem.category === 'SVC') {
      if (item.profile !== 'CPU_FIXTURE' && item.profile !== 'GPU_FIXTURE') {
        return failKey('INVALID_READINESS', 'readiness')
      }
    } else {
      return failKey('INVALID_READINESS', 'readiness')
    }
  }

  const negotiationCopy = copyFixtureInput(oldValue)
  if (!negotiationCopy.ok) return failKey('DEPENDENCY_FAILURE', '$')

  if (oldValue.decision === 'BLOCKED') {
    return {
      ok: true,
      value: blockedValue(oldValue, oldValue.reason, oldValue.messageZh, null, negotiationCopy.value),
    }
  }

  const selected = registryById.get(oldValue.instanceId)
  if (!selected) return failKey('DEPENDENCY_FAILURE', '$')
  const observation = observationById.get(oldValue.instanceId)
  if (!observation) {
    return {
      ok: true,
      value: blockedValue(
        oldValue,
        PROVIDER_READINESS_ERRORS.OBSERVATION_MISSING,
        MESSAGES.OBSERVATION_MISSING,
        null,
        negotiationCopy.value,
      ),
    }
  }

  const requiredResource = computeRequiredResource(oldValue.category, observation.profile, selected)
  const projection = {
    installation: observation.installation,
    profile: observation.profile,
    requiredResource,
    cpu: observation.cpu,
    gpu: observation.gpu,
  }

  if (observation.installation === 'ABSENT') {
    return {
      ok: true,
      value: blockedValue(
        oldValue,
        PROVIDER_READINESS_ERRORS.INSTALLATION_MISSING,
        MESSAGES.INSTALLATION_MISSING,
        projection,
        negotiationCopy.value,
      ),
    }
  }
  if (observation.installation === 'UNKNOWN') {
    return {
      ok: true,
      value: blockedValue(
        oldValue,
        PROVIDER_READINESS_ERRORS.INSTALLATION_UNKNOWN,
        MESSAGES.INSTALLATION_UNKNOWN,
        projection,
        negotiationCopy.value,
      ),
    }
  }

  if (requiredResource === 'UNKNOWN') {
    return {
      ok: true,
      value: blockedValue(
        oldValue,
        PROVIDER_READINESS_ERRORS.RESOURCE_POLICY_UNKNOWN,
        MESSAGES.RESOURCE_POLICY_UNKNOWN,
        projection,
        negotiationCopy.value,
      ),
    }
  }
  if (requiredResource !== 'REMOTE') {
    const state = requiredResource === 'CPU' ? observation.cpu : observation.gpu
    if (state === 'UNKNOWN') {
      return {
        ok: true,
        value: blockedValue(
          oldValue,
          PROVIDER_READINESS_ERRORS.RESOURCE_UNKNOWN,
          MESSAGES.RESOURCE_UNKNOWN,
          projection,
          negotiationCopy.value,
        ),
      }
    }
    if (state === 'UNAVAILABLE') {
      return {
        ok: true,
        value: blockedValue(
          oldValue,
          PROVIDER_READINESS_ERRORS.RESOURCE_UNAVAILABLE,
          MESSAGES.RESOURCE_UNAVAILABLE,
          projection,
          negotiationCopy.value,
        ),
      }
    }
  }

  return {
    ok: true,
    value: gateValue({
      category: oldValue.category,
      instanceId: oldValue.instanceId,
      candidateId: oldValue.candidateId,
      decision: 'FIXTURE_READY',
      reason: null,
      negotiation: negotiationCopy.value,
      observation: projection,
      messageZh: MESSAGES.READY,
    }),
  }
}

export function negotiateReadyFixtureProvider(input) {
  const prepared = prepare(input, false)
  if (!prepared.ok) return prepared
  const result = evaluate(prepared.payload, prepared.readiness, null)
  if (!result.ok) return result
  return deepFreezeFixtureValue({ ok: true, value: result.value })
}

export function dispatchReadyRvcFakeOnce(input) {
  const prepared = prepare(input, true)
  if (!prepared.ok) return prepared
  const gate = evaluate(prepared.payload, prepared.readiness, prepared.context)
  if (!gate.ok) return gate
  const readiness = gate.value

  if (readiness.decision === 'BLOCKED') {
    return deepFreezeFixtureValue({
      ok: true,
      value: {
        schemaVersion: PROVIDER_READINESS_SCHEMA_VERSION,
        readiness,
        dispatch: null,
        phase: 'BLOCKED',
        reason: readiness.reason,
        messageZh: readiness.messageZh,
        mockOnly: true,
        realOperationAllowed: false,
        submitAllowed: false,
        automaticRetryAllowed: false,
      },
    })
  }

  let dispatched
  try {
    dispatched = dispatchRvcFakeOnce({
      schemaVersion: 1,
      negotiation: prepared.payload.negotiation,
      context: prepared.context,
    })
  } catch {
    return failKey('DEPENDENCY_FAILURE', '$')
  }
  if (!dispatched || typeof dispatched !== 'object' || typeof dispatched.ok !== 'boolean') {
    return failKey('DEPENDENCY_FAILURE', '$')
  }
  if (dispatched.ok === false) return failKey('DISPATCH_REJECTED', '$')
  if (!isPlainObject(dispatched.value)) return failKey('DEPENDENCY_FAILURE', '$')
  if (dispatched.value.phase !== 'BLOCKED' && dispatched.value.phase !== 'SIMULATED') {
    return failKey('DEPENDENCY_FAILURE', '$')
  }

  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: PROVIDER_READINESS_SCHEMA_VERSION,
      readiness,
      dispatch: dispatched.value,
      phase: dispatched.value.phase,
      reason: dispatched.value.reason,
      messageZh: dispatched.value.messageZh,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}
