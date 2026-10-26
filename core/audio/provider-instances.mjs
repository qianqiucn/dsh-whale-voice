/* Whale Voice — Provider instance view & capability negotiation (Plan 06-B, OFFLINE / FIXTURE_ONLY).
 *
 * One bounded, pure composition layer over the existing TTS/SVC candidate catalogues. It answers
 * only one question: "could this demonstration request be accepted by this explicitly selected
 * demonstration instance?" It never makes a real provider call, starts a process, opens a socket,
 * reads a file, loads a model, synthesizes audio, advances a Core task or creates a delivery
 * candidate.
 *
 * Every public call:
 * - takes one bounded snapshot, not shared mutable state;
 * - deep-copies the input through a fixed structural policy before any schema access, so caller
 *   getters/accessors are never invoked;
 * - re-validates the registry on every negotiation call (a caller-built view is never trusted);
 * - returns fresh, deeply frozen output objects.
 */

import { getProviderCandidate, getRegistryView } from '../tts/provider-registry.mjs'
import {
  PROVIDER_ERRORS,
  PROVIDER_STATES,
  checkSynthesisRequest,
  evaluateProviderStatus,
  normalizeProviderManifest,
  providerVersionView,
} from '../tts/provider-contract.mjs'
import { getSvcCandidate, getSvcRegistryView } from '../svc/svc-registry.mjs'
import { listRvcFakeModels, validateRvcFakeRequest } from '../svc/rvc-fake-gateway.mjs'

export const PROVIDER_INSTANCES_SCHEMA_VERSION = 1

export const PROVIDER_INSTANCE_ERRORS = Object.freeze({
  INVALID_INPUT: 'PROVIDER_INSTANCE_INVALID_INPUT',
  RESOURCE_LIMIT: 'PROVIDER_INSTANCE_RESOURCE_LIMIT',
  UNSUPPORTED_VERSION: 'PROVIDER_INSTANCE_UNSUPPORTED_VERSION',
  INVALID_INSTANCE: 'PROVIDER_INSTANCE_INVALID_INSTANCE',
  DUPLICATE_INSTANCE: 'PROVIDER_INSTANCE_DUPLICATE_INSTANCE',
  UNKNOWN_CANDIDATE: 'PROVIDER_INSTANCE_UNKNOWN_CANDIDATE',
  REAL_OPERATION_FORBIDDEN: 'PROVIDER_INSTANCE_REAL_OPERATION_FORBIDDEN',
  INSTANCE_UNKNOWN: 'PROVIDER_INSTANCE_INSTANCE_UNKNOWN',
  CATEGORY_MISMATCH: 'PROVIDER_INSTANCE_CATEGORY_MISMATCH',
  NOT_IMPLEMENTED: 'PROVIDER_INSTANCE_NOT_IMPLEMENTED',
  VERSION_UNKNOWN: 'PROVIDER_INSTANCE_VERSION_UNKNOWN',
  CREDENTIALS_MISSING: 'PROVIDER_INSTANCE_CREDENTIALS_MISSING',
  CREDENTIALS_UNKNOWN: 'PROVIDER_INSTANCE_CREDENTIALS_UNKNOWN',
  HEALTH_UNKNOWN: 'PROVIDER_INSTANCE_HEALTH_UNKNOWN',
  TIMEOUT: 'PROVIDER_INSTANCE_TIMEOUT',
  OFFLINE: 'PROVIDER_INSTANCE_OFFLINE',
  DEGRADED: 'PROVIDER_INSTANCE_DEGRADED',
  INVALID_REQUEST: 'PROVIDER_INSTANCE_INVALID_REQUEST',
  MODEL_NOT_AVAILABLE: 'PROVIDER_INSTANCE_MODEL_NOT_AVAILABLE',
  COST_NOT_CONFIRMED: 'PROVIDER_INSTANCE_COST_NOT_CONFIRMED',
})

const VIEW_KEYS = Object.freeze(new Set(['schemaVersion', 'instances']))
const INSTANCE_KEYS = Object.freeze(
  new Set(['instanceId', 'category', 'candidateId', 'protocolVersion', 'fixture', 'manifest', 'observation']),
)
const OBSERVATION_KEYS = Object.freeze(new Set(['state', 'credentials', 'observedAt', 'versionMatches']))
const NEGOTIATION_KEYS = Object.freeze(new Set(['schemaVersion', 'registry', 'selection', 'consent', 'request']))
const SELECTION_KEYS = Object.freeze(new Set(['category', 'instanceId']))
const CONSENT_KEYS = Object.freeze(new Set(['networkAllowed', 'textUploadAllowed', 'paidAllowed']))
const TTS_REQUEST_KEYS = Object.freeze(
  new Set(['requestId', 'text', 'voiceId', 'language', 'emotion', 'format', 'streaming']),
)
const RVC_REQUEST_KEYS = Object.freeze(
  new Set(['schemaVersion', 'sourceAudioRef', 'targetModelId', 'pitchShift', 'outputFormat', 'inputAudio', 'rights']),
)

const INSTANCE_ID_PATTERN = /^instance:[A-Za-z0-9_-]{1,64}$/
const REQUEST_ID_PATTERN = /^request:fixture-[A-Za-z0-9_-]{1,32}$/
const CREATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const MAX_VALUES = 4096
const MAX_DEPTH = 12
const MAX_OBJECT_KEYS = 32
const MAX_ARRAY_ITEMS = 256
const MAX_STRING_LENGTH = 8192
const MAX_INSTANCES = 32

const STATES = Object.freeze(new Set(['ok', 'degraded', 'offline', 'timeout', 'unknown']))
const CREDENTIAL_STATES = Object.freeze(new Set(['present', 'missing', 'unknown', 'not_required']))
const CATEGORIES = Object.freeze(new Set(['TTS', 'SVC']))

const ALLOWED_TTS_REASONS = Object.freeze(
  new Set([
    PROVIDER_ERRORS.UNSUPPORTED_VOICE,
    PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE,
    PROVIDER_ERRORS.UNSUPPORTED_EMOTION,
    PROVIDER_ERRORS.UNSUPPORTED_STREAMING,
    PROVIDER_ERRORS.UNSUPPORTED_FORMAT,
    PROVIDER_ERRORS.NETWORK_REQUIRED,
    PROVIDER_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED,
    PROVIDER_ERRORS.CREDENTIALS_MISSING,
    PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
    PROVIDER_ERRORS.INVALID_RESPONSE,
  ]),
)

const ERROR_REASONS = Object.freeze({
  INVALID_INPUT: 'invalid input',
  RESOURCE_LIMIT: 'resource limit exceeded',
  UNSUPPORTED_VERSION: 'unsupported schema version',
  INVALID_INSTANCE: 'invalid instance',
  DUPLICATE_INSTANCE: 'duplicate instance id',
  UNKNOWN_CANDIDATE: 'unknown candidate',
  REAL_OPERATION_FORBIDDEN: 'real operation is not allowed',
  INSTANCE_UNKNOWN: 'unknown instance',
  CATEGORY_MISMATCH: 'category mismatch',
  NOT_IMPLEMENTED: 'not implemented',
  VERSION_UNKNOWN: 'version unknown',
  CREDENTIALS_MISSING: 'credentials missing',
  CREDENTIALS_UNKNOWN: 'credentials unknown',
  HEALTH_UNKNOWN: 'health unknown',
  TIMEOUT: 'timeout',
  OFFLINE: 'offline',
  DEGRADED: 'degraded',
  INVALID_REQUEST: 'invalid request',
  MODEL_NOT_AVAILABLE: 'model not available',
  COST_NOT_CONFIRMED: 'cost consent not confirmed',
})

const MESSAGE_ZH = Object.freeze({
  FIXTURE_COMPATIBLE: '演示实例与请求匹配；尚未生成音频，不能据此试听、保存或发送。',
  INSTANCE_UNKNOWN: '没有找到匹配的演示实例；请重新选择，系统不会自动换引擎。',
  UNKNOWN_CANDIDATE: '没有找到匹配的演示实例；请重新选择，系统不会自动换引擎。',
  CATEGORY_MISMATCH: '没有找到匹配的演示实例；请重新选择，系统不会自动换引擎。',
  NOT_IMPLEMENTED: '该引擎尚未接入；请选择已支持的演示方式或稍后再说。',
  VERSION_UNKNOWN: '实例版本尚未确认；请重新核查版本，暂时不能继续。',
  CREDENTIALS_MISSING: '凭据状态尚未就绪；请在后续正式设置界面确认，本演示不会读取或保存密钥。',
  CREDENTIALS_UNKNOWN: '凭据状态尚未就绪；请在后续正式设置界面确认，本演示不会读取或保存密钥。',
  OFFLINE: '实例状态尚未就绪；可重新检查或稍后再说，系统不会自动重试。',
  HEALTH_UNKNOWN: '实例状态尚未就绪；可重新检查或稍后再说，系统不会自动重试。',
  DEGRADED: '实例状态尚未就绪；可重新检查或稍后再说，系统不会自动重试。',
  TIMEOUT: '实例状态尚未就绪；可重新检查或稍后再说，系统不会自动重试。',
  PROVIDER_NOT_AVAILABLE: '实例状态尚未就绪；可重新检查或稍后再说，系统不会自动重试。',
  MODEL_NOT_AVAILABLE: '所选音色或演示模型不可用；请选择兼容项，不会自动换模型或下载。',
  UNSUPPORTED_VOICE: '所选音色或演示模型不可用；请选择兼容项，不会自动换模型或下载。',
  UNSUPPORTED_LANGUAGE: '所选实例不支持这些生成要求；请调整选项，不会静默丢弃参数。',
  UNSUPPORTED_EMOTION: '所选实例不支持这些生成要求；请调整选项，不会静默丢弃参数。',
  UNSUPPORTED_STREAMING: '所选实例不支持这些生成要求；请调整选项，不会静默丢弃参数。',
  UNSUPPORTED_FORMAT: '所选实例不支持这些生成要求；请调整选项，不会静默丢弃参数。',
  NETWORK_REQUIRED: '网络、上传或费用同意尚未满足；本演示不会联网、上传或收费。',
  TEXT_UPLOAD_NOT_CONFIRMED: '网络、上传或费用同意尚未满足；本演示不会联网、上传或收费。',
  COST_NOT_CONFIRMED: '网络、上传或费用同意尚未满足；本演示不会联网、上传或收费。',
  INVALID_REQUEST: '演示请求不符合接口要求；请检查输入，系统不会自动重试。',
  INVALID_RESPONSE: '演示请求不符合接口要求；请检查输入，系统不会自动重试。',
  INVALID_INPUT: '演示输入不符合接口要求；请检查输入，系统不会自动重试。',
  INVALID_INSTANCE: '演示实例描述不符合接口要求；请检查输入，系统不会自动重试。',
})

function issue(code, path, reason) {
  return { code, path, reason }
}

function fail(code, path, reason) {
  return { ok: false, errors: [issue(code, path, reason || ERROR_REASONS[codeKey(code)] || 'invalid input')] }
}

function codeKey(code) {
  for (const [key, value] of Object.entries(PROVIDER_INSTANCE_ERRORS)) {
    if (value === code) return key
  }
  return 'INVALID_INPUT'
}

function failKey(key, path) {
  return fail(PROVIDER_INSTANCE_ERRORS[key], path, ERROR_REASONS[key])
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return true
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function joinPath(prefix, key) {
  return prefix === '' ? key : prefix + '.' + key
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      deepFreeze(descriptor.value, seen)
    }
  }
  return value
}

/**
 * Bounded structural copy. Accepts only plain/null-prototype objects, finite numbers, strings,
 * booleans, null and dense standard arrays of those. Accessors, Symbols, hidden properties,
 * extra array properties, holes, cycles, functions, BigInt, Date/Map/Set and over-limit structures
 * are rejected before any schema access. The caller's original object is never mutated.
 */
function safeCopy(root) {
  let values = 0
  const ancestors = new Set()

  function copy(value, depth) {
    values += 1
    if (values > MAX_VALUES) return { ok: false, key: 'RESOURCE_LIMIT' }
    if (depth > MAX_DEPTH) return { ok: false, key: 'RESOURCE_LIMIT' }

    if (value === null) return { ok: true, value: null }
    const type = typeof value
    if (type === 'string') {
      if (value.length > MAX_STRING_LENGTH) return { ok: false, key: 'RESOURCE_LIMIT' }
      return { ok: true, value }
    }
    if (type === 'boolean') return { ok: true, value }
    if (type === 'number') {
      if (!Number.isFinite(value)) return { ok: false, key: 'INVALID_INPUT' }
      return { ok: true, value }
    }
    if (type !== 'object') return { ok: false, key: 'INVALID_INPUT' }
    if (ancestors.has(value)) return { ok: false, key: 'INVALID_INPUT' }

    ancestors.add(value)
    let result
    try {
      result = Array.isArray(value) ? copyArray(value, depth) : copyObject(value, depth)
    } finally {
      ancestors.delete(value)
    }
    return result
  }

  function copyObject(value, depth) {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return { ok: false, key: 'INVALID_INPUT' }
    const keys = Reflect.ownKeys(value)
    if (keys.length > MAX_OBJECT_KEYS) return { ok: false, key: 'RESOURCE_LIMIT' }
    const output = Object.create(null)
    for (const key of keys) {
      if (typeof key !== 'string') return { ok: false, key: 'INVALID_INPUT' }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const isData = descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      if (!isData || descriptor.enumerable !== true) return { ok: false, key: 'INVALID_INPUT' }
      const copied = copy(descriptor.value, depth + 1)
      if (!copied.ok) return copied
      output[key] = copied.value
    }
    return { ok: true, value: output }
  }

  function copyArray(value, depth) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return { ok: false, key: 'INVALID_INPUT' }
    const length = value.length
    if (!Number.isInteger(length) || length < 0 || length > MAX_ARRAY_ITEMS) {
      return { ok: false, key: 'RESOURCE_LIMIT' }
    }
    const output = []
    const seen = new Set()
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') {
        const descriptor = Object.getOwnPropertyDescriptor(value, 'length')
        if (descriptor === undefined || descriptor.value !== length) return { ok: false, key: 'INVALID_INPUT' }
        continue
      }
      if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return { ok: false, key: 'INVALID_INPUT' }
      const index = Number(key)
      if (index >= length) return { ok: false, key: 'INVALID_INPUT' }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const isData = descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      if (!isData || descriptor.enumerable !== true) return { ok: false, key: 'INVALID_INPUT' }
      seen.add(index)
    }
    if (seen.size !== length) return { ok: false, key: 'INVALID_INPUT' }
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor === undefined) return { ok: false, key: 'INVALID_INPUT' }
      const copied = copy(descriptor.value, depth + 1)
      if (!copied.ok) return copied
      output.push(copied.value)
    }
    return { ok: true, value: output }
  }

  try {
    return copy(root, 0)
  } catch {
    return { ok: false, key: 'INVALID_INPUT' }
  }
}

function canonicalUtcTimestamp(value) {
  if (typeof value !== 'string' || !CREATED_AT_PATTERN.test(value)) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString() === value ? value : null
}

function nonEmptyString(value, max = 8192) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function resolveCandidate(category, candidateId) {
  if (category === 'TTS') {
    const candidate = getProviderCandidate(candidateId)
    if (candidate) return { candidate, canonicalId: candidate.id }
    if (getSvcCandidate(candidateId)) return { errorKey: 'INVALID_INSTANCE' }
    return { errorKey: 'UNKNOWN_CANDIDATE' }
  }
  const candidate = getSvcCandidate(candidateId)
  if (candidate) return { candidate, canonicalId: candidate.id }
  if (getProviderCandidate(candidateId)) return { errorKey: 'INVALID_INSTANCE' }
  return { errorKey: 'UNKNOWN_CANDIDATE' }
}

function adapterFor(category, canonicalId) {
  if (category === 'TTS') return 'TTS_CONTRACT_FIXTURE'
  if (canonicalId === 'rvc') return 'RVC_FAKE_V1'
  return null
}

function computeStatus(instance) {
  if (instance.adapter === null) {
    return { status: 'NOT_IMPLEMENTED', reason: PROVIDER_INSTANCE_ERRORS.NOT_IMPLEMENTED }
  }
  if (instance.protocolVersion !== PROVIDER_INSTANCES_SCHEMA_VERSION || instance.observation.versionMatches !== true) {
    return { status: 'VERSION_UNKNOWN', reason: PROVIDER_INSTANCE_ERRORS.VERSION_UNKNOWN }
  }
  if (instance.category === 'TTS') {
    if (providerVersionView(instance.manifest).state !== 'AUDITED') {
      return { status: 'VERSION_UNKNOWN', reason: PROVIDER_INSTANCE_ERRORS.VERSION_UNKNOWN }
    }
    if (instance.manifest.credentials.required === true) {
      if (instance.observation.credentials === 'missing') {
        return { status: 'CREDENTIALS_MISSING', reason: PROVIDER_INSTANCE_ERRORS.CREDENTIALS_MISSING }
      }
      if (instance.observation.credentials === 'unknown') {
        return { status: 'UNKNOWN', reason: PROVIDER_INSTANCE_ERRORS.CREDENTIALS_UNKNOWN }
      }
    }
  }
  switch (instance.observation.state) {
    case 'timeout':
      return { status: 'UNKNOWN', reason: PROVIDER_INSTANCE_ERRORS.TIMEOUT }
    case 'unknown':
      return { status: 'UNKNOWN', reason: PROVIDER_INSTANCE_ERRORS.HEALTH_UNKNOWN }
    case 'offline':
      return { status: 'OFFLINE', reason: PROVIDER_INSTANCE_ERRORS.OFFLINE }
    case 'degraded':
      return { status: 'DEGRADED', reason: PROVIDER_INSTANCE_ERRORS.DEGRADED }
    case 'ok':
      break
    default:
      return { status: 'UNKNOWN', reason: PROVIDER_INSTANCE_ERRORS.HEALTH_UNKNOWN }
  }
  if (instance.category === 'TTS') {
    const evaluated = evaluateProviderStatus(instance.manifest, instance.observation)
    if (evaluated.state === PROVIDER_STATES.AVAILABLE) {
      return { status: 'FIXTURE_AVAILABLE', reason: null }
    }
    return { status: 'UNKNOWN', reason: PROVIDER_INSTANCE_ERRORS.HEALTH_UNKNOWN }
  }
  return { status: 'FIXTURE_AVAILABLE', reason: null }
}

function validateObservation(category, manifest, observation) {
  if (!isPlainObject(observation)) return { errorKey: 'INVALID_INSTANCE' }
  const keys = Reflect.ownKeys(observation)
  if (keys.length !== OBSERVATION_KEYS.size) return { errorKey: 'INVALID_INSTANCE' }
  for (const key of keys) {
    if (typeof key !== 'string' || !OBSERVATION_KEYS.has(key)) return { errorKey: 'INVALID_INSTANCE' }
  }
  const state = observation.state
  const credentials = observation.credentials
  const observedAt = observation.observedAt
  const versionMatches = observation.versionMatches
  if (!STATES.has(state)) return { errorKey: 'INVALID_INSTANCE' }
  if (!CREDENTIAL_STATES.has(credentials)) return { errorKey: 'INVALID_INSTANCE' }
  if (observedAt !== null && canonicalUtcTimestamp(observedAt) === null) return { errorKey: 'INVALID_INSTANCE' }
  if (versionMatches !== true && versionMatches !== false && versionMatches !== null) {
    return { errorKey: 'INVALID_INSTANCE' }
  }
  if (category === 'SVC') {
    if (credentials !== 'not_required') return { errorKey: 'INVALID_INSTANCE' }
    return { ok: true, value: { state, credentials, observedAt, versionMatches } }
  }
  const required = manifest.credentials.required === true
  if (required) {
    if (!['present', 'missing', 'unknown'].includes(credentials)) return { errorKey: 'INVALID_INSTANCE' }
  } else if (credentials !== 'not_required') {
    return { errorKey: 'INVALID_INSTANCE' }
  }
  return { ok: true, value: { state, credentials, observedAt, versionMatches } }
}

function validateInstance(copiedInstance, seenIds) {
  if (!isPlainObject(copiedInstance)) return { errorKey: 'INVALID_INSTANCE' }
  const keys = Reflect.ownKeys(copiedInstance)
  if (keys.length !== INSTANCE_KEYS.size) return { errorKey: 'INVALID_INSTANCE' }
  for (const key of keys) {
    if (typeof key !== 'string' || !INSTANCE_KEYS.has(key)) return { errorKey: 'INVALID_INSTANCE' }
  }

  const instanceId = copiedInstance.instanceId
  if (typeof instanceId !== 'string' || !INSTANCE_ID_PATTERN.test(instanceId)) {
    return { errorKey: 'INVALID_INSTANCE' }
  }
  if (seenIds.has(instanceId)) return { errorKey: 'DUPLICATE_INSTANCE' }
  seenIds.add(instanceId)

  const category = copiedInstance.category
  if (!CATEGORIES.has(category)) return { errorKey: 'INVALID_INSTANCE' }

  const candidateId = copiedInstance.candidateId
  if (typeof candidateId !== 'string' || candidateId.length === 0) return { errorKey: 'INVALID_INSTANCE' }

  const protocolVersion = copiedInstance.protocolVersion
  if (
    !Number.isInteger(protocolVersion) ||
    protocolVersion < 1 ||
    protocolVersion > 2147483647
  ) {
    return { errorKey: 'INVALID_INSTANCE' }
  }

  if (copiedInstance.fixture !== true) return { errorKey: 'REAL_OPERATION_FORBIDDEN' }

  try {
    const resolved = resolveCandidate(category, candidateId)
    if (resolved.errorKey) return { errorKey: resolved.errorKey }

    let manifest = null
    if (category === 'TTS') {
      const normalized = normalizeProviderManifest(copiedInstance.manifest)
      if (!normalized.ok) return { errorKey: 'INVALID_INSTANCE' }
      manifest = normalized.manifest
      if (manifest.id !== resolved.canonicalId) return { errorKey: 'INVALID_INSTANCE' }
      if (manifest.kind !== resolved.candidate.kind) return { errorKey: 'INVALID_INSTANCE' }
    } else if (copiedInstance.manifest !== null) {
      return { errorKey: 'INVALID_INSTANCE' }
    }

    const observation = validateObservation(category, manifest, copiedInstance.observation)
    if (observation.errorKey) return { errorKey: observation.errorKey }

    const instance = {
      instanceId,
      category,
      candidateId: resolved.canonicalId,
      kind: category === 'TTS' ? resolved.candidate.kind : 'SVC',
      adapter: adapterFor(category, resolved.canonicalId),
      protocolVersion,
      manifest,
      observation: observation.value,
    }
    const status = computeStatus(instance)
    return { ok: true, value: { ...instance, ...status } }
  } catch {
    return { errorKey: 'INVALID_INSTANCE' }
  }
}

function validateRegistry(copiedRegistry) {
  if (!isPlainObject(copiedRegistry)) return failKey('INVALID_INPUT', 'registry')
  const keys = Reflect.ownKeys(copiedRegistry)
  for (const key of keys) {
    if (typeof key !== 'string' || !VIEW_KEYS.has(key)) return failKey('INVALID_INPUT', '<unknown-key>')
  }
  if (!hasOwn(copiedRegistry, 'schemaVersion') || !hasOwn(copiedRegistry, 'instances')) {
    return failKey('INVALID_INPUT', 'schemaVersion')
  }
  if (copiedRegistry.schemaVersion !== PROVIDER_INSTANCES_SCHEMA_VERSION) {
    return failKey('UNSUPPORTED_VERSION', 'schemaVersion')
  }
  if (!Array.isArray(copiedRegistry.instances)) return failKey('INVALID_INPUT', 'instances')
  if (copiedRegistry.instances.length > MAX_INSTANCES) return failKey('RESOURCE_LIMIT', 'instances')

  const seenIds = new Set()
  const instances = []
  for (const raw of copiedRegistry.instances) {
    const validated = validateInstance(raw, seenIds)
    if (validated.errorKey) return failKey(validated.errorKey, 'instance')
    instances.push(validated.value)
  }

  const view = {
    schemaVersion: PROVIDER_INSTANCES_SCHEMA_VERSION,
    mode: 'FIXTURE_ONLY',
    candidates: {
      tts: deepFreeze(getRegistryView()),
      svc: deepFreeze(getSvcRegistryView()),
    },
    instances: instances.map((instance) => ({
      instanceId: instance.instanceId,
      category: instance.category,
      candidateId: instance.candidateId,
      kind: instance.kind,
      adapter: instance.adapter,
      status: instance.status,
      reason: instance.reason,
      fixtureSelectable: instance.status === 'FIXTURE_AVAILABLE',
      mockOnly: true,
      realOperationAllowed: false,
      observedAt: instance.observation.observedAt,
    })),
    realSelectable: [],
    defaultInstanceId: null,
    realOperationAllowed: false,
  }

  return { ok: true, value: { view: deepFreeze(view), instances } }
}

function buildProviderInstanceViewInternal(input) {
  const copied = safeCopy(input)
  if (!copied.ok) return failKey(copied.key, '$')
  let built
  try {
    built = validateRegistry(copied.value)
  } catch {
    return failKey('INVALID_INSTANCE', 'instance')
  }
  if (!built.ok) return built
  return { ok: true, value: built.value.view }
}

export function buildProviderInstanceView(input) {
  try {
    return buildProviderInstanceViewInternal(input)
  } catch {
    return failKey('INVALID_INPUT', '$')
  }
}

function messageFor(reason) {
  if (!reason) return MESSAGE_ZH.FIXTURE_COMPATIBLE
  const prefix = 'PROVIDER_INSTANCE_'
  const key = reason.startsWith(prefix) ? reason.slice(prefix.length) : reason
  return MESSAGE_ZH[key] || MESSAGE_ZH.INVALID_REQUEST
}

function blocked(category, instanceId, candidateId, reason) {
  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: PROVIDER_INSTANCES_SCHEMA_VERSION,
      category,
      instanceId,
      candidateId,
      decision: 'BLOCKED',
      reason,
      messageZh: messageFor(reason),
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    }),
  }
}

function compatible(category, instanceId, candidateId) {
  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: PROVIDER_INSTANCES_SCHEMA_VERSION,
      category,
      instanceId,
      candidateId,
      decision: 'FIXTURE_COMPATIBLE',
      reason: null,
      messageZh: MESSAGE_ZH.FIXTURE_COMPATIBLE,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    }),
  }
}

function validateSelection(selection) {
  if (!isPlainObject(selection)) return failKey('INVALID_INPUT', 'selection')
  const keys = Reflect.ownKeys(selection)
  for (const key of keys) {
    if (typeof key !== 'string' || !SELECTION_KEYS.has(key)) return failKey('INVALID_INPUT', '<unknown-key>')
  }
  if (keys.length !== SELECTION_KEYS.size) return failKey('INVALID_INPUT', 'selection')
  if (!CATEGORIES.has(selection.category)) return failKey('INVALID_INPUT', 'selection')
  if (typeof selection.instanceId !== 'string' || !INSTANCE_ID_PATTERN.test(selection.instanceId)) {
    return failKey('INVALID_INPUT', 'selection')
  }
  return { ok: true, value: { category: selection.category, instanceId: selection.instanceId } }
}

function validateConsent(consent) {
  if (!isPlainObject(consent)) return failKey('INVALID_INPUT', 'consent')
  const keys = Reflect.ownKeys(consent)
  for (const key of keys) {
    if (typeof key !== 'string' || !CONSENT_KEYS.has(key)) return failKey('INVALID_INPUT', '<unknown-key>')
  }
  if (keys.length !== CONSENT_KEYS.size) return failKey('INVALID_INPUT', 'consent')
  for (const key of CONSENT_KEYS) {
    if (typeof consent[key] !== 'boolean') return failKey('INVALID_INPUT', 'consent')
  }
  return {
    ok: true,
    value: {
      networkAllowed: consent.networkAllowed,
      textUploadAllowed: consent.textUploadAllowed,
      paidAllowed: consent.paidAllowed,
    },
  }
}

function validateTtsRequest(request) {
  if (!isPlainObject(request)) return false
  const keys = Reflect.ownKeys(request)
  if (keys.length !== TTS_REQUEST_KEYS.size) return false
  for (const key of keys) {
    if (typeof key !== 'string' || !TTS_REQUEST_KEYS.has(key)) return false
  }
  if (typeof request.requestId !== 'string' || !REQUEST_ID_PATTERN.test(request.requestId)) return false
  if (!nonEmptyString(request.text, MAX_STRING_LENGTH)) return false
  if (!nonEmptyString(request.voiceId, 128)) return false
  if (!nonEmptyString(request.language, 64)) return false
  if (!nonEmptyString(request.emotion, 64)) return false
  if (!nonEmptyString(request.format, 64)) return false
  if (typeof request.streaming !== 'boolean') return false
  return true
}

function validateRvcRequestShape(request) {
  if (!isPlainObject(request)) return false
  const keys = Reflect.ownKeys(request)
  if (keys.length !== RVC_REQUEST_KEYS.size) return false
  for (const key of keys) {
    if (typeof key !== 'string' || !RVC_REQUEST_KEYS.has(key)) return false
  }
  return true
}

function consentGate(instance, consent) {
  if (instance.manifest.network.required === true && consent.networkAllowed !== true) {
    return PROVIDER_ERRORS.NETWORK_REQUIRED
  }
  if (
    (instance.manifest.network.textUpload === true || instance.manifest.privacy.textLeavesDevice === true) &&
    consent.textUploadAllowed !== true
  ) {
    return PROVIDER_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED
  }
  if (instance.manifest.cost.paid === true && consent.paidAllowed !== true) {
    return PROVIDER_INSTANCE_ERRORS.COST_NOT_CONFIRMED
  }
  return null
}

function negotiateProviderInstanceInternal(input) {
  const copied = safeCopy(input)
  if (!copied.ok) return failKey(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) return failKey('INVALID_INPUT', '$')
  const topKeys = Reflect.ownKeys(payload)
  for (const key of topKeys) {
    if (typeof key !== 'string' || !NEGOTIATION_KEYS.has(key)) return failKey('INVALID_INPUT', '<unknown-key>')
  }
  for (const key of NEGOTIATION_KEYS) {
    if (!hasOwn(payload, key)) return failKey('INVALID_INPUT', key)
  }
  if (payload.schemaVersion !== PROVIDER_INSTANCES_SCHEMA_VERSION) {
    return failKey('UNSUPPORTED_VERSION', 'schemaVersion')
  }

  let registry
  try {
    registry = validateRegistry(payload.registry)
  } catch {
    return failKey('INVALID_INSTANCE', 'instance')
  }
  if (!registry.ok) return registry

  const selection = validateSelection(payload.selection)
  if (!selection.ok) return selection
  const consent = validateConsent(payload.consent)
  if (!consent.ok) return consent

  const instance = registry.value.instances.find((item) => item.instanceId === selection.value.instanceId)
  if (!instance) {
    return blocked(
      selection.value.category,
      selection.value.instanceId,
      null,
      PROVIDER_INSTANCE_ERRORS.INSTANCE_UNKNOWN,
    )
  }
  if (instance.category !== selection.value.category) {
    return blocked(
      selection.value.category,
      selection.value.instanceId,
      instance.candidateId,
      PROVIDER_INSTANCE_ERRORS.CATEGORY_MISMATCH,
    )
  }
  if (instance.status !== 'FIXTURE_AVAILABLE') {
    return blocked(instance.category, instance.instanceId, instance.candidateId, instance.reason)
  }

  if (instance.category === 'TTS') {
    if (!validateTtsRequest(payload.request)) {
      return blocked(
        instance.category,
        instance.instanceId,
        instance.candidateId,
        PROVIDER_INSTANCE_ERRORS.INVALID_REQUEST,
      )
    }
    const gate = consentGate(instance, consent.value)
    if (gate) return blocked(instance.category, instance.instanceId, instance.candidateId, gate)
    let checked
    try {
      checked = checkSynthesisRequest(instance.manifest, instance.observation, payload.request)
    } catch {
      return blocked(
        instance.category,
        instance.instanceId,
        instance.candidateId,
        PROVIDER_INSTANCE_ERRORS.INVALID_REQUEST,
      )
    }
    if (!checked.ok) {
      const reason = ALLOWED_TTS_REASONS.has(checked.code)
        ? checked.code
        : PROVIDER_INSTANCE_ERRORS.INVALID_REQUEST
      return blocked(instance.category, instance.instanceId, instance.candidateId, reason)
    }
    return compatible(instance.category, instance.instanceId, instance.candidateId)
  }

  if (!validateRvcRequestShape(payload.request)) {
    return blocked(
      instance.category,
      instance.instanceId,
      instance.candidateId,
      PROVIDER_INSTANCE_ERRORS.INVALID_REQUEST,
    )
  }
  let validated
  try {
    validated = validateRvcFakeRequest(payload.request)
  } catch {
    return blocked(
      instance.category,
      instance.instanceId,
      instance.candidateId,
      PROVIDER_INSTANCE_ERRORS.INVALID_REQUEST,
    )
  }
  if (!validated.ok) {
    const first = Array.isArray(validated.errors) ? validated.errors[0] : null
    const reason =
      first && first.code === 'RVC_FAKE_MODEL_NOT_AVAILABLE'
        ? PROVIDER_INSTANCE_ERRORS.MODEL_NOT_AVAILABLE
        : PROVIDER_INSTANCE_ERRORS.INVALID_REQUEST
    return blocked(instance.category, instance.instanceId, instance.candidateId, reason)
  }
  let models
  try {
    models = listRvcFakeModels()
  } catch {
    return blocked(
      instance.category,
      instance.instanceId,
      instance.candidateId,
      PROVIDER_INSTANCE_ERRORS.INVALID_REQUEST,
    )
  }
  if (!models.ok) {
    return blocked(
      instance.category,
      instance.instanceId,
      instance.candidateId,
      PROVIDER_INSTANCE_ERRORS.MODEL_NOT_AVAILABLE,
    )
  }
  const model = models.value.find((item) => item.modelId === payload.request.targetModelId)
  if (!model || model.simulatedAvailable !== true) {
    return blocked(
      instance.category,
      instance.instanceId,
      instance.candidateId,
      PROVIDER_INSTANCE_ERRORS.MODEL_NOT_AVAILABLE,
    )
  }
  return compatible(instance.category, instance.instanceId, instance.candidateId)
}

export function negotiateProviderInstance(input) {
  try {
    return negotiateProviderInstanceInternal(input)
  } catch {
    return failKey('INVALID_INPUT', '$')
  }
}
