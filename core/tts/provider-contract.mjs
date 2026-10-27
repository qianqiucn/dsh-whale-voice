/* Whale Voice — Provider-neutral TTS contract (TTS-A, design only).
 *
 * This module is pure: it validates and normalizes manifests, observations, synthesis
 * requests and results. It performs no I/O, starts no process, calls no provider and never
 * touches WeChat or Voice Sender. No provider below is implemented by this module.
 */

export const PROVIDER_SCHEMA_VERSION = 1

export const PROVIDER_KINDS = Object.freeze({
  LOCAL: 'LOCAL',
  CLOUD: 'CLOUD',
  CUSTOM: 'CUSTOM',
})

export const PROVIDER_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  UNKNOWN: 'UNKNOWN',
  CREDENTIALS_MISSING: 'CREDENTIALS_MISSING',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
})

export const PROVIDER_VERSION_STATES = Object.freeze({
  AUDITED: 'AUDITED',
  CHANGED: 'CHANGED',
  UNKNOWN: 'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
})

export const PROVIDER_ERRORS = Object.freeze({
  INVALID_MANIFEST: 'INVALID_MANIFEST',
  PROVIDER_NOT_AVAILABLE: 'PROVIDER_NOT_AVAILABLE',
  UNSUPPORTED_VOICE: 'UNSUPPORTED_VOICE',
  UNSUPPORTED_LANGUAGE: 'UNSUPPORTED_LANGUAGE',
  UNSUPPORTED_EMOTION: 'UNSUPPORTED_EMOTION',
  UNSUPPORTED_STREAMING: 'UNSUPPORTED_STREAMING',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  CREDENTIALS_MISSING: 'CREDENTIALS_MISSING',
  NETWORK_REQUIRED: 'NETWORK_REQUIRED',
  TEXT_UPLOAD_NOT_CONFIRMED: 'TEXT_UPLOAD_NOT_CONFIRMED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  RETRY_NOT_ALLOWED: 'RETRY_NOT_ALLOWED',
  DELIVERY_NOT_PROVIDER: 'DELIVERY_NOT_PROVIDER',
})

const KINDS = new Set(Object.values(PROVIDER_KINDS))
const STORAGES = new Set(['none', 'os-keychain', 'dpapi', 'environment'])
const ENDPOINT_POLICIES = new Set(['loopback-only', 'https-only', 'https-or-loopback'])
const RETENTIONS = new Set(['none', 'provider', 'unknown'])
const COST_MODELS = new Set(['free', 'per-request', 'per-character', 'unknown'])
const RETRY_REASONS = new Set(['TIMEOUT', 'RATE_LIMITED', 'TRANSIENT'])
const FORBIDDEN_KEYS = new Set(['apiKey', 'api_key', 'token', 'accessToken', 'password', 'secret', 'authorization', 'clientSecret', 'send', 'wechat', 'sentToWechat'])
const MANIFEST_KEYS = new Set(['schemaVersion', 'id', 'name', 'kind', 'version', 'capabilities', 'health', 'credentials', 'network', 'privacy', 'cost', 'resources'])
const SYNTHESIS_REQUEST_KEYS = new Set(['requestId', 'text', 'voiceId', 'language', 'emotion', 'format', 'streaming'])
const SYNTHESIS_RESULT_KEYS = new Set(['requestId', 'voiceId', 'language', 'emotion', 'artifactRef', 'mime', 'sampleRate', 'channels', 'durationMs', 'createdAt', 'warnings', 'delivery'])
const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@/-]{1,127}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function issue(code, path, reason) {
  return { code, path, reason }
}

function requireObject(value, path, errors) {
  if (!isObject(value)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path, 'expected object'))
    return false
  }
  return true
}

function requireBoolean(value, path, errors) {
  if (typeof value !== 'boolean') {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path, 'expected boolean'))
    return false
  }
  return true
}

function requireString(value, path, errors, max = 128) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path, 'expected non-empty string within limits'))
    return false
  }
  return true
}

function requireInteger(value, path, errors, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path, 'expected integer in range'))
    return false
  }
  return true
}

function rejectSecretKeys(value, path, errors, seen = new Set(), code = PROVIDER_ERRORS.INVALID_MANIFEST) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectSecretKeys(child, path ? path + '[' + index + ']' : '[' + index + ']', errors, seen, code))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      errors.push(issue(code, path ? path + '.' + key : key, 'secret or delivery field is not allowed in a provider contract'))
    }
    rejectSecretKeys(child, path ? path + '.' + key : key, errors, seen, code)
  }
}

function validateVersion(value, errors) {
  if (!requireObject(value, 'version', errors)) return false
  if (value.value !== null && !requireString(value.value, 'version.value', errors)) return false
  if (value.source !== null && !requireString(value.source, 'version.source', errors)) return false
  if (!requireBoolean(value.audited, 'version.audited', errors)) return false
  if (value.audited === true && !value.value) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'version.audited', 'an audited version requires a value'))
    return false
  }
  return true
}

function validateVoice(value, errors, index) {
  const path = 'capabilities.voices[' + index + ']'
  if (!requireObject(value, path, errors)) return false
  if (!requireString(value.id, path + '.id', errors, 64) || !ID_PATTERN.test(value.id)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path + '.id', 'invalid voice id'))
    return false
  }
  if (!requireString(value.name, path + '.name', errors)) return false
  if (!['preset', 'cloned', 'unknown'].includes(value.kind)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path + '.kind', 'unsupported voice kind'))
    return false
  }
  if (value.languages !== undefined) {
    if (!Array.isArray(value.languages) || value.languages.some((x) => typeof x !== 'string')) {
      errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path + '.languages', 'expected string array'))
      return false
    }
  }
  if (value.referenceAudioRequired !== undefined && typeof value.referenceAudioRequired !== 'boolean') {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path + '.referenceAudioRequired', 'expected boolean'))
    return false
  }
  return true
}

function validateCapabilities(value, errors) {
  if (!requireObject(value, 'capabilities', errors)) return false
  if (!Array.isArray(value.languages) || value.languages.length === 0 || value.languages.some((x) => typeof x !== 'string' || !x.trim())) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.languages', 'expected non-empty language array'))
    return false
  }
  if (!Array.isArray(value.voices) || value.voices.length === 0 || value.voices.length > 256) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.voices', 'expected 1..256 voices'))
    return false
  }
  if (!value.voices.every((voice, index) => validateVoice(voice, errors, index))) return false

  if (!isObject(value.clone) || !requireBoolean(value.clone.supported, 'capabilities.clone.supported', errors)) return false
  if (!requireBoolean(value.clone.requiresReferenceAudio, 'capabilities.clone.requiresReferenceAudio', errors)) return false
  if (!isObject(value.emotion) || !requireBoolean(value.emotion.supported, 'capabilities.emotion.supported', errors)) return false
  if (!Array.isArray(value.emotion.modes) || value.emotion.modes.some((x) => typeof x !== 'string' || !x.trim())) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.emotion.modes', 'expected string array'))
    return false
  }
  if (value.emotion.supported && value.emotion.modes.length === 0) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.emotion.modes', 'supported emotion requires at least one mode'))
    return false
  }
  if (value.emotion.defaultMode !== null && value.emotion.supported === true && !value.emotion.modes.includes(value.emotion.defaultMode)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.emotion.defaultMode', 'default mode must be listed when emotion control is supported'))
    return false
  }
  if (!requireBoolean(value.streaming, 'capabilities.streaming', errors)) return false
  if (!Array.isArray(value.formats) || value.formats.length === 0) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.formats', 'expected at least one audio format'))
    return false
  }
  for (let i = 0; i < value.formats.length; i += 1) {
    const format = value.formats[i]
    const path = 'capabilities.formats[' + i + ']'
    if (!isObject(format) || !requireString(format.mime, path + '.mime', errors) || !/^audio\/[a-z0-9.+-]+$/.test(format.mime)) {
      errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path + '.mime', 'expected audio/* mime'))
      return false
    }
    if (!requireInteger(format.sampleRate, path + '.sampleRate', errors, 8000, 192000)) return false
    if (!Number.isInteger(format.channels) || ![1, 2].includes(format.channels)) {
      errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, path + '.channels', 'expected 1 or 2 channels'))
      return false
    }
  }
  if (!isObject(value.limits) || !requireInteger(value.limits.maxChars, 'capabilities.limits.maxChars', errors, 1, 10000)) return false
  if (!requireInteger(value.limits.timeoutMs, 'capabilities.limits.timeoutMs', errors, 1000, 600000)) return false
  if (!requireInteger(value.limits.maxAudioSeconds, 'capabilities.limits.maxAudioSeconds', errors, 1, 600)) return false
  if (!isObject(value.retry) || !requireInteger(value.retry.maxAttempts, 'capabilities.retry.maxAttempts', errors, 0, 5)) return false
  if (!requireBoolean(value.retry.idempotent, 'capabilities.retry.idempotent', errors)) return false
  if (!Array.isArray(value.retry.retryOn) || value.retry.retryOn.some((x) => !RETRY_REASONS.has(x))) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.retry.retryOn', 'unsupported retry reason'))
    return false
  }
  if (value.retry.maxAttempts > 0 && value.retry.retryOn.length === 0) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'capabilities.retry.retryOn', 'retry attempts require a retry reason'))
    return false
  }
  if (!requireBoolean(value.cancellation, 'capabilities.cancellation', errors)) return false
  return true
}

function validateHealth(value, errors) {
  if (!requireObject(value, 'health', errors)) return false
  if (!['http', 'local', 'none'].includes(value.mode)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'health.mode', 'unsupported health mode'))
    return false
  }
  if (value.mode === 'http') {
    if (!requireString(value.path, 'health.path', errors, 256) || !value.path.startsWith('/')) {
      errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'health.path', 'health path must start with /'))
      return false
    }
  } else if (value.path !== null) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'health.path', 'non-http health path must be null'))
    return false
  }
  if (!requireInteger(value.timeoutMs, 'health.timeoutMs', errors, 100, 60000)) return false
  if (!['none', 'credentialRef'].includes(value.auth)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'health.auth', 'unsupported health auth mode'))
    return false
  }
  return true
}

function validateCredentials(value, errors) {
  if (!requireObject(value, 'credentials', errors)) return false
  if (!requireBoolean(value.required, 'credentials.required', errors)) return false
  if (!STORAGES.has(value.storage)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'credentials.storage', 'unsupported credential storage'))
    return false
  }
  if (value.ref !== null && (!requireString(value.ref, 'credentials.ref', errors, 128) || !REF_PATTERN.test(value.ref))) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'credentials.ref', 'invalid credential reference'))
    return false
  }
  if (value.required && value.storage === 'none') {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'credentials.storage', 'required credentials need protected storage'))
    return false
  }
  return true
}

function validateNetwork(value, errors) {
  if (!requireObject(value, 'network', errors)) return false
  if (!requireBoolean(value.required, 'network.required', errors)) return false
  if (!requireBoolean(value.textUpload, 'network.textUpload', errors)) return false
  if (!ENDPOINT_POLICIES.has(value.endpointPolicy)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'network.endpointPolicy', 'unsupported endpoint policy'))
    return false
  }
  return true
}

function validatePrivacy(value, errors) {
  if (!requireObject(value, 'privacy', errors)) return false
  if (!requireBoolean(value.textLeavesDevice, 'privacy.textLeavesDevice', errors)) return false
  if (!RETENTIONS.has(value.retention)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'privacy.retention', 'unsupported retention policy'))
    return false
  }
  if (!requireString(value.note, 'privacy.note', errors, 512)) return false
  return true
}

function validateCost(value, errors) {
  if (!requireObject(value, 'cost', errors)) return false
  if (!requireBoolean(value.paid, 'cost.paid', errors)) return false
  if (!COST_MODELS.has(value.model)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'cost.model', 'unsupported cost model'))
    return false
  }
  if (!requireString(value.note, 'cost.note', errors, 512)) return false
  return true
}

function validateResources(value, errors) {
  if (!requireObject(value, 'resources', errors)) return false
  for (const key of ['local', 'gpuRequired', 'cpuCapable']) {
    if (!requireBoolean(value[key], 'resources.' + key, errors)) return false
  }
  return true
}

/**
 * Validate a provider manifest. This is intentionally strict: unknown top-level fields and
 * secret-looking keys are rejected, so a provider cannot smuggle credentials or delivery
 * behavior into a capability declaration.
 */
export function validateProviderManifest(input) {
  const errors = []
  if (!requireObject(input, '$', errors)) return { ok: false, errors }
  rejectSecretKeys(input, '', errors)
  for (const key of Object.keys(input)) {
    if (!MANIFEST_KEYS.has(key)) errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, key, 'unknown top-level manifest field'))
  }
  if (input.schemaVersion !== PROVIDER_SCHEMA_VERSION) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'schemaVersion', 'expected provider schema version 1'))
  }
  if (!requireString(input.id, 'id', errors, 64) || !ID_PATTERN.test(input.id)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'id', 'invalid provider id'))
  }
  if (!requireString(input.name, 'name', errors)) return { ok: false, errors }
  if (!KINDS.has(input.kind)) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'kind', 'unsupported provider kind'))
  }
  const sections = [
    ['version', validateVersion],
    ['capabilities', validateCapabilities],
    ['health', validateHealth],
    ['credentials', validateCredentials],
    ['network', validateNetwork],
    ['privacy', validatePrivacy],
    ['cost', validateCost],
    ['resources', validateResources],
  ]
  let sectionsOk = true
  for (const [field, validate] of sections) {
    const before = errors.length
    const passed = validate(input[field], errors)
    if (passed !== true) {
      sectionsOk = false
      if (errors.length === before) {
        errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, field, 'invalid manifest section'))
      }
    }
  }
  if (isObject(input.network) && isObject(input.privacy) && input.network.textUpload === true && input.privacy.textLeavesDevice !== true) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_MANIFEST, 'privacy.textLeavesDevice', 'text upload requires an explicit text-leaves-device declaration'))
  }
  if (errors.length || !sectionsOk) return { ok: false, errors }
  return { ok: true, errors: [], manifest: JSON.parse(JSON.stringify(input)) }
}

export function normalizeProviderManifest(input) {
  const result = validateProviderManifest(input)
  return result.ok ? { ok: true, manifest: result.manifest, errors: [] } : { ok: false, manifest: null, errors: result.errors }
}

export function providerCapabilitySummary(manifest) {
  if (!manifest || typeof manifest !== 'object') return null
  return {
    providerId: manifest.id,
    kind: manifest.kind,
    voiceCount: Array.isArray(manifest.capabilities && manifest.capabilities.voices) ? manifest.capabilities.voices.length : 0,
    languages: [...(manifest.capabilities && manifest.capabilities.languages || [])],
    clone: manifest.capabilities && manifest.capabilities.clone ? manifest.capabilities.clone.supported === true : false,
    emotion: manifest.capabilities && manifest.capabilities.emotion ? manifest.capabilities.emotion.supported === true : false,
    emotionModes: [...(manifest.capabilities && manifest.capabilities.emotion && manifest.capabilities.emotion.modes || [])],
    streaming: manifest.capabilities ? manifest.capabilities.streaming === true : false,
    formats: (manifest.capabilities && manifest.capabilities.formats || []).map((format) => ({ ...format })),
    credentialsRequired: manifest.credentials ? manifest.credentials.required === true : true,
    networkRequired: manifest.network ? manifest.network.required === true : true,
    textLeavesDevice: manifest.privacy ? manifest.privacy.textLeavesDevice === true : null,
    paid: manifest.cost ? manifest.cost.paid === true : null,
  }
}

export function providerVersionView(manifest) {
  const version = manifest && manifest.version
  if (!version || !version.value) return { state: PROVIDER_VERSION_STATES.UNKNOWN, value: null, audited: false }
  if (version.audited !== true) return { state: PROVIDER_VERSION_STATES.UNKNOWN, value: version.value, audited: false }
  return { state: PROVIDER_VERSION_STATES.AUDITED, value: version.value, audited: true }
}

export function evaluateProviderStatus(manifest, observation = {}) {
  const version = providerVersionView(manifest)
  const credentialsRequired = Boolean(manifest && manifest.credentials && manifest.credentials.required)
  const credentials = observation.credentials || (credentialsRequired ? 'unknown' : 'not_required')
  const base = { providerId: manifest && manifest.id || null, credentials, version, observedAt: observation.observedAt || null }
  if (credentialsRequired && credentials === 'missing') {
    return { ...base, state: PROVIDER_STATES.CREDENTIALS_MISSING, reason: PROVIDER_ERRORS.CREDENTIALS_MISSING }
  }
  if (credentialsRequired && credentials !== 'present' && observation.state === 'ok') {
    return { ...base, state: PROVIDER_STATES.UNKNOWN, reason: null }
  }
  if (observation.state === 'ok') return { ...base, state: PROVIDER_STATES.AVAILABLE, reason: null }
  if (observation.state === 'degraded') return { ...base, state: PROVIDER_STATES.DEGRADED, reason: observation.reason || null }
  if (observation.state === 'offline') return { ...base, state: PROVIDER_STATES.UNAVAILABLE, reason: observation.reason || null }
  if (observation.state === 'timeout') return { ...base, state: PROVIDER_STATES.DEGRADED, reason: PROVIDER_ERRORS.TIMEOUT }
  if (observation.state === 'error') return { ...base, state: PROVIDER_STATES.DEGRADED, reason: observation.reason || PROVIDER_ERRORS.PROVIDER_ERROR }
  return { ...base, state: PROVIDER_STATES.UNKNOWN, reason: null }
}

export function providerSupportsVoice(manifest, voiceId) {
  return Boolean(manifest && manifest.capabilities && manifest.capabilities.voices.some((voice) => voice.id === voiceId))
}

export function providerSupportsEmotion(manifest, mode) {
  const emotion = manifest && manifest.capabilities && manifest.capabilities.emotion
  if (!emotion) return false
  if (!emotion.supported) return mode === emotion.defaultMode
  return emotion.modes.includes(mode)
}

/**
 * Validate whether a provider may be asked to synthesize a request. This does not issue a
 * request; it returns a stable error code for UI/coordinator decisions.
 */
export function checkSynthesisRequest(manifest, observation, request) {
  if (!isObject(request)) return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE }
  for (const key of Object.keys(request)) {
    if (!SYNTHESIS_REQUEST_KEYS.has(key)) return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE }
  }
  const status = evaluateProviderStatus(manifest, observation)
  if (status.state !== PROVIDER_STATES.AVAILABLE) {
    return { ok: false, code: status.state === PROVIDER_STATES.CREDENTIALS_MISSING ? PROVIDER_ERRORS.CREDENTIALS_MISSING : PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE, status }
  }
  const text = request.text
  if (typeof text !== 'string' || text.length === 0 || text.length > manifest.capabilities.limits.maxChars) {
    return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, status, detail: 'text length is outside provider limits' }
  }
  if (!request.voiceId || !providerSupportsVoice(manifest, request.voiceId)) {
    return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE, status }
  }
  const voice = manifest.capabilities.voices.find((item) => item.id === request.voiceId)
  const language = request.language || manifest.capabilities.languages[0]
  const languages = voice.languages && voice.languages.length ? voice.languages : manifest.capabilities.languages
  if (!languages.includes(language)) {
    return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE, status }
  }
  const emotion = request.emotion || manifest.capabilities.emotion.defaultMode || 'neutral'
  if (!providerSupportsEmotion(manifest, emotion)) {
    return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_EMOTION, status }
  }
  if (request.streaming === true && manifest.capabilities.streaming !== true) {
    return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_STREAMING, status }
  }
  if (request.format) {
    const format = manifest.capabilities.formats.find((item) => item.mime === request.format)
    if (!format) return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_FORMAT, status }
  }
  return { ok: true, code: null, status, voiceId: voice.id, language, emotion }
}

export function normalizeProviderError(error, manifest, attempt = 1) {
  const code = error && error.code ? error.code : PROVIDER_ERRORS.PROVIDER_ERROR
  const retry = manifest && manifest.capabilities && manifest.capabilities.retry
  const retryable = Boolean(retry && retry.maxAttempts > 0 && attempt <= retry.maxAttempts && retry.retryOn.includes(code))
  return {
    ok: false,
    code,
    retryable,
    attempt,
    message: String(error && error.message || error || 'provider error').slice(0, 240),
    safeToRetry: retryable && retry.idempotent === true,
  }
}

export function normalizeSynthesisResult(manifest, input) {
  if (!isObject(input)) return { ok: false, errors: [issue(PROVIDER_ERRORS.INVALID_RESPONSE, '$', 'expected result object')] }
  const errors = []
  for (const key of Object.keys(input)) {
    if (!SYNTHESIS_RESULT_KEYS.has(key)) errors.push(issue(PROVIDER_ERRORS.INVALID_RESPONSE, key, 'unknown synthesis result field'))
  }
  rejectSecretKeys(input, '', errors, new Set(), PROVIDER_ERRORS.INVALID_RESPONSE)
  if (hasOwn(input, 'delivery')) {
    if (!isObject(input.delivery) || input.delivery.state !== 'PENDING_ROUTER') {
      return { ok: false, errors: [issue(PROVIDER_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery', 'provider result must be pending the shared delivery router')] }
    }
  }
  if (typeof input.requestId !== 'string' || !input.requestId) errors.push(issue(PROVIDER_ERRORS.INVALID_RESPONSE, 'requestId', 'required'))
  if (typeof input.voiceId !== 'string' || !providerSupportsVoice(manifest, input.voiceId)) {
    errors.push(issue(PROVIDER_ERRORS.UNSUPPORTED_VOICE, 'voiceId', 'voice is not declared by this provider'))
  }
  if (typeof input.artifactRef !== 'string' || input.artifactRef.length === 0 || input.artifactRef.length > 512) {
    errors.push(issue(PROVIDER_ERRORS.INVALID_RESPONSE, 'artifactRef', 'opaque artifact reference required'))
  }
  if (typeof input.mime !== 'string' || !manifest.capabilities.formats.some((format) => format.mime === input.mime)) {
    errors.push(issue(PROVIDER_ERRORS.UNSUPPORTED_FORMAT, 'mime', 'format is not declared by this provider'))
  }
  if (!Number.isInteger(input.sampleRate) || !manifest.capabilities.formats.some((format) => format.sampleRate === input.sampleRate)) {
    errors.push(issue(PROVIDER_ERRORS.UNSUPPORTED_FORMAT, 'sampleRate', 'sample rate is not declared by this provider'))
  }
  if (!Number.isInteger(input.durationMs) || input.durationMs < 0) errors.push(issue(PROVIDER_ERRORS.INVALID_RESPONSE, 'durationMs', 'non-negative integer required'))
  if (input.channels !== undefined && ![1, 2].includes(input.channels)) errors.push(issue(PROVIDER_ERRORS.INVALID_RESPONSE, 'channels', 'expected 1 or 2 channels'))
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    result: {
      schemaVersion: PROVIDER_SCHEMA_VERSION,
      providerId: manifest.id,
      requestId: input.requestId,
      voiceId: input.voiceId,
      language: input.language || manifest.capabilities.languages[0],
      emotion: input.emotion || manifest.capabilities.emotion.defaultMode || 'neutral',
      artifactRef: input.artifactRef,
      mime: input.mime,
      sampleRate: input.sampleRate,
      channels: input.channels || 1,
      durationMs: input.durationMs,
      createdAt: input.createdAt || null,
      delivery: { state: 'PENDING_ROUTER' },
      warnings: Array.isArray(input.warnings) ? input.warnings.slice(0, 20) : [],
    },
  }
}
