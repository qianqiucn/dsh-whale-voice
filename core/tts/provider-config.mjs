/* Whale Voice — TTS provider configuration v2 and migration proposal (TTS-A, design only).
 *
 * This module never reads or writes a file. It validates and migrates plain objects so the
 * future Core can adopt a provider-neutral schema without silently changing production JSON.
 * Existing qwen-local v1 data is preserved; cloud/custom legacy values require an explicit
 * provider selection instead of being guessed into a Qwen instance.
 */

export const TTS_CONFIG_SCHEMA_VERSION = 2

export const TTS_CONFIG_ERRORS = Object.freeze({
  INVALID: 'TTS_CONFIG_INVALID',
  UNSUPPORTED_SCHEMA: 'TTS_CONFIG_SCHEMA_UNSUPPORTED',
  DUPLICATE_ID: 'TTS_CONFIG_DUPLICATE_ID',
  PROVIDER_UNKNOWN: 'TTS_PROVIDER_UNKNOWN',
  PROVIDER_DISABLED: 'TTS_PROVIDER_DISABLED',
  PROVIDER_NOT_CONFIGURED: 'TTS_PROVIDER_NOT_CONFIGURED',
  VOICE_UNSUPPORTED: 'TTS_VOICE_UNSUPPORTED',
  VOICE_PROVIDER_MISMATCH: 'TTS_VOICE_PROVIDER_MISMATCH',
  EMOTION_UNSUPPORTED: 'TTS_EMOTION_UNSUPPORTED',
  CREDENTIALS_MISSING: 'TTS_CREDENTIALS_MISSING',
  ENDPOINT_INVALID: 'TTS_ENDPOINT_INVALID',
  SECRET_FIELD: 'TTS_CONFIG_SECRET_FIELD',
})

const KINDS = new Set(['LOCAL', 'CLOUD', 'CUSTOM'])
const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@/-]{1,127}$/
const SECRET_KEYS = new Set(['apiKey', 'api_key', 'token', 'accessToken', 'password', 'secret', 'authorization', 'clientSecret'])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function issue(code, path, reason) {
  return { code, path, reason }
}

function rejectSecrets(value, path, errors, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectSecrets(child, path + '[' + index + ']', errors, seen))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) errors.push(issue(TTS_CONFIG_ERRORS.SECRET_FIELD, path ? path + '.' + key : key, 'secrets are not allowed; use credentialRef'))
    rejectSecrets(child, path ? path + '.' + key : key, errors, seen)
  }
}

function string(value, path, errors, max = 128) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path, 'expected non-empty string within limits'))
    return false
  }
  return true
}

function boolean(value, path, errors) {
  if (typeof value !== 'boolean') {
    errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path, 'expected boolean'))
    return false
  }
  return true
}

function endpointValid(value, kind, errors, path) {
  if (value === null) return true
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    errors.push(issue(TTS_CONFIG_ERRORS.ENDPOINT_INVALID, path, 'invalid endpoint'))
    return false
  }
  let url
  try {
    url = new URL(value)
  } catch {
    errors.push(issue(TTS_CONFIG_ERRORS.ENDPOINT_INVALID, path, 'invalid URL'))
    return false
  }
  if (url.username || url.password || url.search || url.hash) {
    errors.push(issue(TTS_CONFIG_ERRORS.ENDPOINT_INVALID, path, 'credentials, query and fragment are not allowed'))
    return false
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
  if (kind === 'CLOUD' && url.protocol !== 'https:') {
    errors.push(issue(TTS_CONFIG_ERRORS.ENDPOINT_INVALID, path, 'cloud endpoints must use HTTPS'))
    return false
  }
  if (kind === 'CUSTOM' && url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    errors.push(issue(TTS_CONFIG_ERRORS.ENDPOINT_INVALID, path, 'custom endpoint must be HTTPS or loopback HTTP'))
    return false
  }
  if (kind === 'LOCAL' && url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    errors.push(issue(TTS_CONFIG_ERRORS.ENDPOINT_INVALID, path, 'local endpoint must be HTTPS or loopback HTTP'))
    return false
  }
  return true
}

function idValid(value, path, errors) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path, 'invalid lowercase id'))
    return false
  }
  return true
}

function uniqueIds(items, path, errors, key = 'id') {
  const seen = new Set()
  for (let i = 0; i < items.length; i += 1) {
    if (!isObject(items[i]) || !idValid(items[i][key], path + '[' + i + '].' + key, errors)) continue
    if (seen.has(items[i][key])) errors.push(issue(TTS_CONFIG_ERRORS.DUPLICATE_ID, path + '[' + i + '].' + key, 'duplicate id'))
    seen.add(items[i][key])
  }
}

function defaultLimits() {
  return { timeoutMs: 120000 }
}

function qwenProvider(endpoint, modelId, credentialRef = null) {
  return {
    instanceId: 'qwen-local-default',
    providerId: 'qwen3-tts',
    displayName: 'Qwen3-TTS (local reference)',
    kind: 'LOCAL',
    enabled: true,
    transport: 'http',
    endpoint,
    modelId,
    credentialRef,
    limits: defaultLimits(),
  }
}

function emptyConfig() {
  return {
    schemaVersion: TTS_CONFIG_SCHEMA_VERSION,
    selectedProviderId: null,
    selectedVoiceId: null,
    providers: [],
    models: [],
    voices: [],
    voicePacks: [],
    compatibility: {
      migratedFrom: null,
      requiresUserSelection: true,
      notes: [],
    },
  }
}

/**
 * Convert a legacy v0/v1 TTS object into the v2 shape. The migration is pure and idempotent.
 * It never maps an unknown cloud/custom provider to qwen-local and never invents a voice.
 */
export function migrateTtsConfig(input) {
  if (!isObject(input)) return { ok: false, config: null, migrated: false, fromSchemaVersion: null, errors: [issue(TTS_CONFIG_ERRORS.INVALID, '$', 'expected object')] }
  if (input.schemaVersion === TTS_CONFIG_SCHEMA_VERSION) {
    const result = validateTtsConfig(input)
    return { ...result, migrated: false, fromSchemaVersion: 2 }
  }
  if (input.schemaVersion !== undefined && input.schemaVersion !== 0 && input.schemaVersion !== 1) {
    return { ok: false, config: null, migrated: false, fromSchemaVersion: null, errors: [issue(TTS_CONFIG_ERRORS.UNSUPPORTED_SCHEMA, 'schemaVersion', 'unsupported schema')] }
  }
  const tts = isObject(input.tts) ? input.tts : input
  if (!isObject(tts)) return { ok: false, config: null, migrated: false, fromSchemaVersion: input.schemaVersion === undefined ? null : input.schemaVersion, errors: [issue(TTS_CONFIG_ERRORS.INVALID, 'tts', 'expected object')] }
  if (hasOwn(tts, 'provider') === false) return { ok: false, config: null, migrated: false, fromSchemaVersion: input.schemaVersion === undefined ? null : input.schemaVersion, errors: [issue(TTS_CONFIG_ERRORS.INVALID, 'tts.provider', 'provider is required')] }

  const provider = typeof tts.provider === 'string' ? tts.provider.trim() : ''
  const voice = typeof tts.voice === 'string' ? tts.voice.trim() : ''
  const model = typeof tts.model === 'string' ? tts.model.trim() : null
  const endpoint = typeof tts.baseUrl === 'string' && tts.baseUrl.trim() ? tts.baseUrl.trim() : null
  const from = input.schemaVersion === 0 ? 0 : 1
  if (provider === 'qwen-local') {
    const modelId = model ? 'qwen-local-primary' : null
    const config = emptyConfig()
    config.compatibility = {
      migratedFrom: from,
      requiresUserSelection: false,
      notes: ['qwen-local legacy values preserved; no write or provider switch performed.'],
    }
    config.selectedProviderId = 'qwen-local-default'
    config.selectedVoiceId = voice || null
    config.providers = [qwenProvider(endpoint, modelId)]
    config.models = model ? [{ id: modelId, providerInstanceId: 'qwen-local-default', model }] : []
    config.voices = voice ? [{ id: voice, providerInstanceId: 'qwen-local-default', displayName: voice, kind: 'legacy', referenceAudio: null }] : []
    const validated = validateTtsConfig(config)
    return { ...validated, migrated: true, fromSchemaVersion: from }
  }

  const config = emptyConfig()
  config.compatibility = {
    migratedFrom: from,
    requiresUserSelection: true,
    legacyProvider: provider || null,
    legacyModel: model,
    legacyVoice: voice || null,
    legacyEndpointConfigured: endpoint !== null,
    notes: ['Cloud/custom legacy provider was not mapped to a concrete adapter; user selection is required.'],
  }
  const validated = validateTtsConfig(config)
  return { ...validated, migrated: true, fromSchemaVersion: from }
}

export function validateTtsConfig(input) {
  const errors = []
  if (!isObject(input)) return { ok: false, config: null, errors: [issue(TTS_CONFIG_ERRORS.INVALID, '$', 'expected object')] }
  rejectSecrets(input, '', errors)
  if (input.schemaVersion !== TTS_CONFIG_SCHEMA_VERSION) errors.push(issue(TTS_CONFIG_ERRORS.UNSUPPORTED_SCHEMA, 'schemaVersion', 'expected version 2'))
  for (const key of ['providers', 'models', 'voices', 'voicePacks']) {
    if (!Array.isArray(input[key])) errors.push(issue(TTS_CONFIG_ERRORS.INVALID, key, 'expected array'))
  }
  if (errors.length) return { ok: false, config: null, errors }
  uniqueIds(input.providers, 'providers', errors, 'instanceId')
  uniqueIds(input.models, 'models', errors)
  uniqueIds(input.voices, 'voices', errors)
  uniqueIds(input.voicePacks, 'voicePacks', errors)

  const providers = new Map()
  for (let i = 0; i < input.providers.length; i += 1) {
    const provider = input.providers[i]
    const path = 'providers[' + i + ']'
    if (!isObject(provider)) { errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path, 'expected object')); continue }
    if (!idValid(provider.instanceId, path + '.instanceId', errors)) continue
    if (!KINDS.has(provider.kind)) errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path + '.kind', 'unsupported kind'))
    if (!string(provider.providerId, path + '.providerId', errors)) continue
    if (!string(provider.displayName, path + '.displayName', errors)) continue
    if (!boolean(provider.enabled, path + '.enabled', errors)) continue
    if (!['http', 'local', 'custom'].includes(provider.transport)) errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path + '.transport', 'unsupported transport'))
    endpointValid(provider.endpoint === undefined ? null : provider.endpoint, provider.kind, errors, path + '.endpoint')
    if (provider.credentialRef !== null && provider.credentialRef !== undefined && (!string(provider.credentialRef, path + '.credentialRef', errors, 128) || !REF_PATTERN.test(provider.credentialRef))) {
      errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path + '.credentialRef', 'invalid credential reference'))
    }
    if (!isObject(provider.limits) || !Number.isInteger(provider.limits.timeoutMs) || provider.limits.timeoutMs < 1000 || provider.limits.timeoutMs > 600000) {
      errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path + '.limits.timeoutMs', 'expected 1000..600000'))
    }
    if (provider.kind === 'CUSTOM' && provider.enabled && provider.endpoint === null) errors.push(issue(TTS_CONFIG_ERRORS.ENDPOINT_INVALID, path + '.endpoint', 'enabled custom provider requires an endpoint'))
    providers.set(provider.instanceId, provider)
  }

  const models = new Map()
  for (let i = 0; i < input.models.length; i += 1) {
    const model = input.models[i]
    const path = 'models[' + i + ']'
    if (!isObject(model) || !idValid(model.id, path + '.id', errors)) continue
    if (!providers.has(model.providerInstanceId)) errors.push(issue(TTS_CONFIG_ERRORS.PROVIDER_UNKNOWN, path + '.providerInstanceId', 'unknown provider instance'))
    if (!string(model.model, path + '.model', errors)) continue
    models.set(model.id, model)
  }

  const voices = new Map()
  for (let i = 0; i < input.voices.length; i += 1) {
    const voice = input.voices[i]
    const path = 'voices[' + i + ']'
    if (!isObject(voice) || !idValid(voice.id, path + '.id', errors)) continue
    if (!providers.has(voice.providerInstanceId)) errors.push(issue(TTS_CONFIG_ERRORS.PROVIDER_UNKNOWN, path + '.providerInstanceId', 'unknown provider instance'))
    if (!string(voice.displayName, path + '.displayName', errors)) continue
    if (!['preset', 'cloned', 'legacy', 'unknown'].includes(voice.kind)) errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path + '.kind', 'unsupported voice kind'))
    if (voice.referenceAudio !== null && typeof voice.referenceAudio !== 'boolean') errors.push(issue(TTS_CONFIG_ERRORS.INVALID, path + '.referenceAudio', 'expected boolean or null'))
    voices.set(voice.id, voice)
  }

  for (let i = 0; i < input.voicePacks.length; i += 1) {
    const pack = input.voicePacks[i]
    const path = 'voicePacks[' + i + ']'
    if (!isObject(pack) || !idValid(pack.id, path + '.id', errors)) continue
    if (!providers.has(pack.providerInstanceId)) errors.push(issue(TTS_CONFIG_ERRORS.PROVIDER_UNKNOWN, path + '.providerInstanceId', 'unknown provider instance'))
    if (!Array.isArray(pack.voiceIds) || pack.voiceIds.some((id) => !voices.has(id))) errors.push(issue(TTS_CONFIG_ERRORS.VOICE_UNSUPPORTED, path + '.voiceIds', 'voice pack references unknown voices'))
  }

  const selectedProvider = input.selectedProviderId
  if (selectedProvider !== null) {
    if (!providers.has(selectedProvider)) errors.push(issue(TTS_CONFIG_ERRORS.PROVIDER_UNKNOWN, 'selectedProviderId', 'unknown provider instance'))
    else if (providers.get(selectedProvider).enabled !== true) errors.push(issue(TTS_CONFIG_ERRORS.PROVIDER_DISABLED, 'selectedProviderId', 'selected provider is disabled'))
  }
  if (input.selectedVoiceId !== null) {
    if (!voices.has(input.selectedVoiceId)) errors.push(issue(TTS_CONFIG_ERRORS.VOICE_UNSUPPORTED, 'selectedVoiceId', 'unknown voice'))
    else if (selectedProvider && voices.get(input.selectedVoiceId).providerInstanceId !== selectedProvider) {
      errors.push(issue(TTS_CONFIG_ERRORS.VOICE_PROVIDER_MISMATCH, 'selectedVoiceId', 'selected voice belongs to another provider'))
    }
  }
  for (const provider of input.providers) {
    if (provider.modelId !== null && provider.modelId !== undefined && !models.has(provider.modelId)) {
      errors.push(issue(TTS_CONFIG_ERRORS.INVALID, 'providers.modelId', 'unknown model reference'))
    }
  }
  if (errors.length) return { ok: false, config: null, errors }
  return { ok: true, config: JSON.parse(JSON.stringify(input)), errors: [] }
}

export function selectProvider(config, providerInstanceId) {
  if (!config || !Array.isArray(config.providers)) return { ok: false, code: TTS_CONFIG_ERRORS.PROVIDER_NOT_CONFIGURED }
  const provider = config.providers.find((item) => item.instanceId === providerInstanceId)
  if (!provider) return { ok: false, code: TTS_CONFIG_ERRORS.PROVIDER_UNKNOWN }
  if (provider.enabled !== true) return { ok: false, code: TTS_CONFIG_ERRORS.PROVIDER_DISABLED }
  return { ok: true, provider: JSON.parse(JSON.stringify(provider)) }
}

export function resolveVoiceForProvider(config, providerInstanceId, voiceId) {
  if (!config || !Array.isArray(config.voices)) return { ok: false, code: TTS_CONFIG_ERRORS.VOICE_UNSUPPORTED }
  const voice = config.voices.find((item) => item.id === voiceId)
  if (!voice) return { ok: false, code: TTS_CONFIG_ERRORS.VOICE_UNSUPPORTED }
  if (voice.providerInstanceId !== providerInstanceId) return { ok: false, code: TTS_CONFIG_ERRORS.VOICE_PROVIDER_MISMATCH }
  return { ok: true, voice: JSON.parse(JSON.stringify(voice)) }
}

export function resolveEmotionForProvider(manifest, emotion) {
  if (!manifest || !manifest.capabilities || !manifest.capabilities.emotion) return { ok: false, code: TTS_CONFIG_ERRORS.EMOTION_UNSUPPORTED }
  const capability = manifest.capabilities.emotion
  if (emotion === null || emotion === undefined) return { ok: true, mode: capability.defaultMode || null }
  if (capability.supported !== true || !capability.modes.includes(emotion)) return { ok: false, code: TTS_CONFIG_ERRORS.EMOTION_UNSUPPORTED }
  return { ok: true, mode: emotion }
}

export function credentialStateForProvider(config, providerInstanceId) {
  const provider = config && Array.isArray(config.providers) ? config.providers.find((item) => item.instanceId === providerInstanceId) : null
  if (!provider) return { state: 'unknown', required: null }
  const required = provider.kind === 'CLOUD' || Boolean(provider.credentialRef)
  return { state: provider.credentialRef ? 'present' : (required ? 'missing' : 'not_required'), required }
}

export function publicTtsConfig(config) {
  if (!config || config.schemaVersion !== TTS_CONFIG_SCHEMA_VERSION) return null
  return {
    schemaVersion: TTS_CONFIG_SCHEMA_VERSION,
    selectedProviderId: config.selectedProviderId || null,
    selectedVoiceId: config.selectedVoiceId || null,
    providerCount: config.providers.length,
    voiceCount: config.voices.length,
    voicePackCount: config.voicePacks.length,
    providers: config.providers.map((provider) => ({
      instanceId: provider.instanceId,
      providerId: provider.providerId,
      displayName: provider.displayName,
      kind: provider.kind,
      enabled: provider.enabled,
      endpointConfigured: Boolean(provider.endpoint),
      credentialConfigured: Boolean(provider.credentialRef),
      modelId: provider.modelId || null,
    })),
    voices: config.voices.map((voice) => ({
      id: voice.id,
      providerInstanceId: voice.providerInstanceId,
      displayName: voice.displayName,
      kind: voice.kind,
      referenceAudio: voice.referenceAudio,
    })),
    compatibility: {
      migratedFrom: config.compatibility ? config.compatibility.migratedFrom : null,
      requiresUserSelection: Boolean(config.compatibility && config.compatibility.requiresUserSelection),
    },
  }
}
