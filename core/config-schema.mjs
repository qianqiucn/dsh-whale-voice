/* Whale Voice Core — isolated configuration schema and public projection.
 *
 * This module is deliberately side-effect free: it validates and migrates JSON objects but never
 * reads, writes or applies a configuration. The write store in `config-store.mjs` is the only
 * component that touches the isolated file.
 */

export const CONFIG_SCHEMA_VERSION = 1
export const LEGACY_SCHEMA_VERSION = 0

export const CONFIG_STATES = Object.freeze({
  UNCHANGED: 'UNCHANGED',
  DIRTY: 'DIRTY',
  VALIDATING: 'VALIDATING',
  SAVING: 'SAVING',
  SAVED: 'SAVED',
  PENDING_APPLY: 'PENDING_APPLY',
  APPLIED: 'APPLIED',
  CONFLICT: 'CONFLICT',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
})

const MAX_IDS = 2000
const MAX_ID_LENGTH = 128
const MAX_TEXT = 128
const MAX_URL = 512
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]*$/

const TOP_KEYS = ['schemaVersion', 'voice', 'tts', 'permissions']
const VOICE_KEYS = ['enabled', 'mode', 'forGroup', 'autoProbability', 'defaultVoice']
const TTS_KEYS = ['provider', 'model', 'voice', 'baseUrl']
const PERMISSION_KEYS = ['private', 'groups']
const LEGACY_TOP_KEYS = [
  'schemaVersion',
  'enabled',
  'mode',
  'for_group',
  'auto_probability',
  'default_voice',
  'tts',
  'permissions',
]
const PROVIDERS = ['qwen-local', 'cloud', 'custom']
const MODES = ['explicit']

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function issue(code, path, reason) {
  return { code, path, reason }
}

function unknownKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(issue('CONFIG_UNKNOWN_FIELD', path ? path + '.' + key : key, 'unknown field'))
    }
  }
}

function requireObject(value, path, errors) {
  if (!isObject(value)) {
    errors.push(issue('CONFIG_TYPE_INVALID', path, 'expected object'))
    return false
  }
  return true
}

function requireBoolean(value, path, errors) {
  if (typeof value !== 'boolean') {
    errors.push(issue('CONFIG_TYPE_INVALID', path, 'expected boolean'))
    return false
  }
  return true
}

function requireString(value, path, errors, max = MAX_TEXT) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    errors.push(issue('CONFIG_STRING_INVALID', path, 'expected non-empty string within limits'))
    return false
  }
  return true
}

function optionalString(value, path, errors, max = MAX_TEXT) {
  if (value === undefined || value === null) return true
  return requireString(value, path, errors, max)
}

function validateIds(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue('CONFIG_ARRAY_INVALID', path, 'expected array'))
    return false
  }
  if (value.length > MAX_IDS) {
    errors.push(issue('CONFIG_ARRAY_INVALID', path, 'too many entries'))
    return false
  }
  const seen = new Set()
  let ok = true
  value.forEach((item, index) => {
    const itemPath = path + '[' + index + ']'
    if (typeof item !== 'string' || item.length === 0 || item.length > MAX_ID_LENGTH || !ID_PATTERN.test(item)) {
      errors.push(issue('CONFIG_ID_INVALID', itemPath, 'invalid target ID'))
      ok = false
      return
    }
    if (seen.has(item)) {
      errors.push(issue('CONFIG_DUPLICATE_ID', itemPath, 'duplicate target ID'))
      ok = false
    }
    seen.add(item)
  })
  return ok
}

function validateUrl(value, path, errors) {
  if (value === undefined || value === null) return true
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL || /[\u0000-\u001f\u007f]/.test(value)) {
    errors.push(issue('CONFIG_URL_INVALID', path, 'invalid URL string'))
    return false
  }
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      errors.push(issue('CONFIG_URL_INVALID', path, 'only http(s) URLs without credentials are accepted'))
      return false
    }
  } catch {
    errors.push(issue('CONFIG_URL_INVALID', path, 'invalid URL'))
    return false
  }
  return true
}

function validateVoice(value, errors) {
  if (!requireObject(value, 'voice', errors)) return null
  unknownKeys(value, VOICE_KEYS, 'voice', errors)
  for (const key of VOICE_KEYS) {
    if (!hasOwn(value, key)) errors.push(issue('CONFIG_REQUIRED_MISSING', 'voice.' + key, 'required field'))
  }
  if (hasOwn(value, 'enabled')) requireBoolean(value.enabled, 'voice.enabled', errors)
  if (hasOwn(value, 'mode') && !MODES.includes(value.mode)) {
    errors.push(issue('CONFIG_ENUM_INVALID', 'voice.mode', 'unsupported mode'))
  }
  if (hasOwn(value, 'forGroup')) requireBoolean(value.forGroup, 'voice.forGroup', errors)
  if (hasOwn(value, 'autoProbability') && (!Number.isInteger(value.autoProbability) || value.autoProbability < 0 || value.autoProbability > 100)) {
    errors.push(issue('CONFIG_RANGE_INVALID', 'voice.autoProbability', 'expected integer in [0,100]'))
  }
  if (hasOwn(value, 'defaultVoice')) requireString(value.defaultVoice, 'voice.defaultVoice', errors)
  return {
    enabled: value.enabled,
    mode: value.mode,
    forGroup: value.forGroup,
    autoProbability: value.autoProbability,
    defaultVoice: value.defaultVoice,
  }
}

function validateTts(value, errors) {
  if (!requireObject(value, 'tts', errors)) return null
  unknownKeys(value, TTS_KEYS, 'tts', errors)
  for (const key of ['provider', 'voice']) {
    if (!hasOwn(value, key)) errors.push(issue('CONFIG_REQUIRED_MISSING', 'tts.' + key, 'required field'))
  }
  if (hasOwn(value, 'provider') && !PROVIDERS.includes(value.provider)) {
    errors.push(issue('CONFIG_ENUM_INVALID', 'tts.provider', 'unsupported provider'))
  }
  if (hasOwn(value, 'voice')) requireString(value.voice, 'tts.voice', errors)
  optionalString(value.model, 'tts.model', errors)
  validateUrl(value.baseUrl, 'tts.baseUrl', errors)
  return {
    provider: value.provider,
    model: value.model === undefined ? null : value.model,
    voice: value.voice,
    baseUrl: value.baseUrl === undefined ? null : value.baseUrl,
  }
}

function validatePermissions(value, errors) {
  if (!requireObject(value, 'permissions', errors)) return null
  unknownKeys(value, PERMISSION_KEYS, 'permissions', errors)
  for (const key of PERMISSION_KEYS) {
    if (!hasOwn(value, key)) errors.push(issue('CONFIG_REQUIRED_MISSING', 'permissions.' + key, 'required field'))
  }
  const privateIds = validateIds(value.private, 'permissions.private', errors)
  const groupIds = validateIds(value.groups, 'permissions.groups', errors)
  return {
    private: privateIds && Array.isArray(value.private) ? clone(value.private) : null,
    groups: groupIds && Array.isArray(value.groups) ? clone(value.groups) : null,
  }
}

/**
 * Validate a v1 configuration object. Unknown fields are rejected; they are never silently dropped.
 * Required safety fields have no defaults.
 *
 * @param {unknown} input
 * @returns {{ok: true, config: object, errors: []}|{ok: false, config: null, errors: object[]}}
 */
export function validateConfig(input) {
  const errors = []
  if (!requireObject(input, '$', errors)) return { ok: false, config: null, errors }
  unknownKeys(input, TOP_KEYS, '', errors)
  for (const key of TOP_KEYS) {
    if (!hasOwn(input, key)) errors.push(issue('CONFIG_REQUIRED_MISSING', key, 'required field'))
  }
  if (hasOwn(input, 'schemaVersion')) {
    if (!Number.isInteger(input.schemaVersion)) {
      errors.push(issue('CONFIG_SCHEMA_VERSION_INVALID', 'schemaVersion', 'expected integer'))
    } else if (input.schemaVersion !== CONFIG_SCHEMA_VERSION) {
      errors.push(issue('CONFIG_SCHEMA_UNSUPPORTED', 'schemaVersion', 'unsupported schema version'))
    }
  }

  const voice = validateVoice(input.voice, errors)
  const tts = validateTts(input.tts, errors)
  const permissions = validatePermissions(input.permissions, errors)
  if (errors.length) return { ok: false, config: null, errors }

  const config = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    voice: {
      enabled: voice.enabled,
      mode: voice.mode,
      forGroup: voice.forGroup,
      autoProbability: voice.autoProbability,
      defaultVoice: voice.defaultVoice,
    },
    tts: {
      provider: tts.provider,
      model: tts.model,
      voice: tts.voice,
      baseUrl: tts.baseUrl,
    },
    permissions: {
      private: permissions.private,
      groups: permissions.groups,
    },
  }
  return { ok: true, config, errors: [] }
}

function validateLegacy(input) {
  const errors = []
  if (!requireObject(input, '$', errors)) return { ok: false, errors }
  unknownKeys(input, LEGACY_TOP_KEYS, '', errors)
  if (input.schemaVersion !== LEGACY_SCHEMA_VERSION) {
    errors.push(issue('CONFIG_SCHEMA_UNSUPPORTED', 'schemaVersion', 'expected legacy version 0'))
  }
  for (const key of ['enabled', 'mode', 'for_group', 'auto_probability', 'default_voice', 'tts', 'permissions']) {
    if (!hasOwn(input, key)) errors.push(issue('CONFIG_REQUIRED_MISSING', key, 'required legacy field'))
  }
  if (hasOwn(input, 'enabled')) requireBoolean(input.enabled, 'enabled', errors)
  if (hasOwn(input, 'mode') && !MODES.includes(input.mode)) errors.push(issue('CONFIG_ENUM_INVALID', 'mode', 'unsupported mode'))
  if (hasOwn(input, 'for_group')) requireBoolean(input.for_group, 'for_group', errors)
  if (hasOwn(input, 'auto_probability') && (!Number.isInteger(input.auto_probability) || input.auto_probability < 0 || input.auto_probability > 100)) {
    errors.push(issue('CONFIG_RANGE_INVALID', 'auto_probability', 'expected integer in [0,100]'))
  }
  if (hasOwn(input, 'default_voice')) requireString(input.default_voice, 'default_voice', errors)
  validateTts(input.tts, errors)
  validatePermissions(input.permissions, errors)
  return { ok: errors.length === 0, errors }
}

/**
 * Migrate a legacy v0 object to v1. The migration is pure and idempotent; a v1 object is returned
 * unchanged. It never writes to disk.
 *
 * @param {unknown} input
 * @returns {{ok: true, config: object, migrated: boolean, fromSchemaVersion: number, errors: []}|{ok: false, config: null, migrated: boolean, fromSchemaVersion: null, errors: object[]}}
 */
export function migrateConfig(input) {
  if (!isObject(input)) {
    return { ok: false, config: null, migrated: false, fromSchemaVersion: null, errors: [issue('CONFIG_TYPE_INVALID', '$', 'expected object')] }
  }
  if (!hasOwn(input, 'schemaVersion')) {
    return { ok: false, config: null, migrated: false, fromSchemaVersion: null, errors: [issue('CONFIG_SCHEMA_VERSION_MISSING', 'schemaVersion', 'required field')] }
  }
  if (input.schemaVersion === CONFIG_SCHEMA_VERSION) {
    const result = validateConfig(input)
    return { ...result, migrated: false, fromSchemaVersion: 1 }
  }
  if (input.schemaVersion !== LEGACY_SCHEMA_VERSION) {
    return { ok: false, config: null, migrated: false, fromSchemaVersion: null, errors: [issue('CONFIG_SCHEMA_UNSUPPORTED', 'schemaVersion', 'unsupported schema version')] }
  }

  const legacy = validateLegacy(input)
  if (!legacy.ok) return { ok: false, config: null, migrated: false, fromSchemaVersion: 0, errors: legacy.errors }
  const candidate = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    voice: {
      enabled: input.enabled,
      mode: input.mode,
      forGroup: input.for_group,
      autoProbability: input.auto_probability,
      defaultVoice: input.default_voice,
    },
    tts: input.tts,
    permissions: input.permissions,
  }
  const result = validateConfig(candidate)
  return { ...result, migrated: true, fromSchemaVersion: 0 }
}

/**
 * Public projection: never includes permission IDs, raw base URLs, tokens or file paths.
 */
export function toPublicConfig(config, meta = {}) {
  const revision = meta.revision || null
  const state = meta.state || CONFIG_STATES.UNCHANGED
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    readMode: 'isolated-config-store',
    source: 'isolated-config-store',
    observedAt: meta.observedAt || null,
    state,
    revision,
    migrated: meta.migrated === true,
    fromSchemaVersion: meta.fromSchemaVersion === undefined ? CONFIG_SCHEMA_VERSION : meta.fromSchemaVersion,
    voice: {
      enabled: config.voice.enabled,
      mode: config.voice.mode,
      forGroup: config.voice.forGroup,
      autoProbability: config.voice.autoProbability,
      defaultVoice: config.voice.defaultVoice,
    },
    tts: {
      provider: config.tts.provider,
      model: config.tts.model,
      voice: config.tts.voice,
      baseUrlConfigured: Boolean(config.tts.baseUrl),
    },
    permissions: {
      privateCount: config.permissions.private.length,
      groupCount: config.permissions.groups.length,
      detailAvailable: false,
      note: '只返回数量；不返回联系人、群聊或目标 ID。',
    },
    application: {
      state: CONFIG_STATES.PENDING_APPLY,
      activeState: CONFIG_STATES.UNKNOWN,
      savedRevision: revision,
      activeRevision: null,
      activeConfirmed: false,
      saved: true,
      note: '文件保存成功不等于运行时已生效；当前没有受支持的运行时配置版本接口。',
    },
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key])
    return result
  }
  return value === undefined ? null : value
}

export const CONFIG_LIMITS = Object.freeze({
  maxIds: MAX_IDS,
  maxIdLength: MAX_ID_LENGTH,
  maxText: MAX_TEXT,
  maxUrl: MAX_URL,
})
