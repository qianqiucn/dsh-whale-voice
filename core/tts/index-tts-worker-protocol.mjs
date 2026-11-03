/* Whale Voice — narrow IndexTTS worker protocol (Plan10 10-B, internal only).
 *
 * Versioned NDJSON with strict envelopes, bounded parsing and payload whitelists. The protocol never
 * carries paths, URLs, commands, environment variables, credentials or arbitrary extra fields.
 */

export const INDEX_TTS_PROTOCOL_VERSION = 1
export const INDEX_TTS_PROTOCOL_MAX_BYTES = 2 * 1024 * 1024
export const INDEX_TTS_PROTOCOL_MAX_DEPTH = 32
export const INDEX_TTS_PROTOCOL_MAX_NODES = 4096

export const INDEX_TTS_REQUEST_TYPES = Object.freeze(['hello', 'health', 'discover', 'synthesize', 'cancel', 'shutdown'])
export const INDEX_TTS_RESPONSE_TYPES = Object.freeze(['ready', 'result', 'error', 'event'])
export const INDEX_TTS_RESULT_STATES = Object.freeze(['ok', 'cancelled', 'unknown'])
export const INDEX_TTS_HEALTH_STATES = Object.freeze(['ok', 'degraded', 'offline', 'unknown'])
export const INDEX_TTS_EVENT_STATES = Object.freeze(['started', 'progress', 'cancelled', 'closing', 'stopped', 'UNKNOWN'])

export const INDEX_TTS_PROTOCOL_ERRORS = Object.freeze({
  INVALID_INPUT: 'INDEX_TTS_PROTOCOL_INVALID_INPUT',
  INVALID_PAYLOAD: 'INDEX_TTS_PROTOCOL_INVALID_PAYLOAD',
  INVALID_ID: 'INDEX_TTS_PROTOCOL_INVALID_ID',
  UNSUPPORTED_VERSION: 'INDEX_TTS_PROTOCOL_UNSUPPORTED_VERSION',
  FORBIDDEN_FIELD: 'INDEX_TTS_PROTOCOL_FORBIDDEN_FIELD',
  TOO_DEEP: 'INDEX_TTS_PROTOCOL_TOO_DEEP',
  TOO_COMPLEX: 'INDEX_TTS_PROTOCOL_TOO_COMPLEX',
  OVERSIZED: 'INDEX_TTS_PROTOCOL_OVERSIZED',
  RESPONSE_TYPE_MISMATCH: 'INDEX_TTS_PROTOCOL_RESPONSE_TYPE_MISMATCH',
})

const FORBIDDEN_KEYS = new Set([
  'path', 'file', 'url', 'uri', 'command', 'cmd', 'shell', 'env', 'environment', 'token',
  'apikey', 'api_key', 'password', 'secret', 'authorization', 'referencepath', 'modeldir',
])
const ENVELOPE_KEYS = new Set(['v', 'id', 'type', 'payload'])
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,80}$/
const LANGUAGE_VALUES = new Set(['zh-CN', 'en-US', 'ja-JP', 'es-ES', 'ar-SA'])
const EMOTION_VALUES = new Set(['neutral', 'happy', 'angry', 'sad', 'afraid', 'disgusted', 'melancholic', 'surprised', 'calm'])

const REQUEST_PAYLOAD_KEYS = Object.freeze({
  hello: new Set(['protocol']),
  health: new Set([]),
  discover: new Set([]),
  synthesize: new Set([
    'requestId', 'text', 'model', 'backend', 'modality', 'bindingRef', 'voiceId', 'language', 'emotion',
    'emotionVector', 'emotionAlpha', 'emotionRef', 'emotionText', 'useEmotionText', 'format', 'maxBytes',
  ]),
  cancel: new Set(['requestId']),
  shutdown: new Set([]),
})

const READY_KEYS = new Set([
  'provider', 'workerVersion', 'workerProtocol', 'indexTtsVersion', 'backend', 'model',
  'modelVersion', 'modelSize', 'languages', 'voices', 'limits', 'loaded', 'networkBlocked',
  'dependencies', 'qwenEmoAvailable', 'snapshotCleanupPending', 'state',
])
const RESULT_KEYS = new Set([
  'state', 'requestId', 'model', 'backend', 'voiceId', 'bytesBase64', 'mime', 'sampleRate',
  'channels', 'durationMs', 'loaded', 'models', 'languages', 'limits', 'voices', 'capabilities',
  'modelVersion', 'dependencies', 'networkBlocked', 'qwenEmoAvailable', 'snapshotCleanupPending', 'error',
])
const ERROR_KEYS = new Set(['code', 'message', 'reason', 'state', 'requestId'])
const EVENT_KEYS = new Set(['requestId', 'state', 'message', 'code', 'loaded', 'closing'])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requestError(code, path) {
  return { ok: false, code, path }
}

/** Reject oversized lines and impossible structural depth before JSON.parse. */
function scanStructure(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > INDEX_TTS_PROTOCOL_MAX_BYTES) {
    return INDEX_TTS_PROTOCOL_ERRORS.OVERSIZED
  }
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{' || char === '[') {
      depth += 1
      if (depth > INDEX_TTS_PROTOCOL_MAX_DEPTH) return INDEX_TTS_PROTOCOL_ERRORS.TOO_DEEP
    } else if (char === '}' || char === ']') {
      depth -= 1
      if (depth < 0) return INDEX_TTS_PROTOCOL_ERRORS.INVALID_INPUT
    }
  }
  if (inString || depth !== 0) return INDEX_TTS_PROTOCOL_ERRORS.INVALID_INPUT
  return null
}

/** Iterative bounded scan: forbidden transport keys, excessive depth and node count. */
function scanValue(root) {
  const stack = [{ value: root, depth: 0 }]
  let nodes = 0
  while (stack.length > 0) {
    const { value, depth } = stack.pop()
    nodes += 1
    if (nodes > INDEX_TTS_PROTOCOL_MAX_NODES) return INDEX_TTS_PROTOCOL_ERRORS.TOO_COMPLEX
    if (depth > INDEX_TTS_PROTOCOL_MAX_DEPTH) return INDEX_TTS_PROTOCOL_ERRORS.TOO_DEEP
    if (Array.isArray(value)) {
      for (const item of value) stack.push({ value: item, depth: depth + 1 })
      continue
    }
    if (isPlainObject(value)) {
      for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) return INDEX_TTS_PROTOCOL_ERRORS.FORBIDDEN_FIELD
        stack.push({ value: value[key], depth: depth + 1 })
      }
    }
  }
  return null
}

function validateEnvelope(message, allowedTypes) {
  if (!isPlainObject(message)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_INPUT, '$')
  for (const key of Object.keys(message)) {
    if (!ENVELOPE_KEYS.has(key)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_INPUT, key)
  }
  if (message.v !== INDEX_TTS_PROTOCOL_VERSION) return requestError(INDEX_TTS_PROTOCOL_ERRORS.UNSUPPORTED_VERSION, 'v')
  if (typeof message.id !== 'string' || !ID_PATTERN.test(message.id)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_ID, 'id')
  if (!allowedTypes.includes(message.type)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_INPUT, 'type')
  if (!isPlainObject(message.payload)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'payload')
  return null
}

function checkPayloadKeys(payload, allowed) {
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, key)
  }
  return null
}

function boundedString(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function validateFormat(format) {
  if (!isPlainObject(format)) return false
  const keys = Object.keys(format)
  return keys.length === 3 && keys.includes('mime') && keys.includes('sampleRate') && keys.includes('channels')
    && format.mime === 'audio/wav' && format.sampleRate === 22050 && format.channels === 1
}

function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 8) return false
  return vector.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1.2)
}

function validateSynthesizePayload(payload) {
  const keys = checkPayloadKeys(payload, REQUEST_PAYLOAD_KEYS.synthesize)
  if (keys) return keys
  if (typeof payload.requestId !== 'string' || !ID_PATTERN.test(payload.requestId)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_ID, 'requestId')
  if (!boundedString(payload.text, 2000) || payload.text.trim().length === 0) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'text')
  if (!boundedString(payload.model, 128)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'model')
  if (payload.backend !== 'clone-emotion') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'backend')
  if (payload.modality !== 'clone') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'modality')
  if (typeof payload.bindingRef !== 'string' || !REF_PATTERN.test(payload.bindingRef)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'bindingRef')
  if (typeof payload.voiceId !== 'string' || !ID_PATTERN.test(payload.voiceId)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'voiceId')
  if (!LANGUAGE_VALUES.has(payload.language)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'language')
  if (!EMOTION_VALUES.has(payload.emotion)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'emotion')
  if (payload.emotionVector !== undefined && !validateVector(payload.emotionVector)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'emotionVector')
  if (payload.emotionAlpha !== undefined && (typeof payload.emotionAlpha !== 'number' || !Number.isFinite(payload.emotionAlpha) || payload.emotionAlpha < 0 || payload.emotionAlpha > 1)) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'emotionAlpha')
  }
  if (payload.emotionRef !== undefined && (typeof payload.emotionRef !== 'string' || !REF_PATTERN.test(payload.emotionRef))) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'emotionRef')
  }
  if (payload.emotionText !== undefined && !boundedString(payload.emotionText, 500)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'emotionText')
  if (payload.useEmotionText !== undefined && typeof payload.useEmotionText !== 'boolean') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'useEmotionText')
  if (payload.useEmotionText === true && !boundedString(payload.emotionText, 500)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'emotionText')
  if (!validateFormat(payload.format)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'format')
  if (!Number.isInteger(payload.maxBytes) || payload.maxBytes < 44 || payload.maxBytes > 52428800) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'maxBytes')
  return null
}

function validateReadyPayload(payload) {
  const keys = checkPayloadKeys(payload, READY_KEYS)
  if (keys) return keys
  if (typeof payload.provider !== 'string' || !payload.provider.trim()) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'provider')
  if (typeof payload.model !== 'string' || !payload.model.trim()) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'model')
  if (payload.backend !== 'clone-emotion') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'backend')
  if (!Number.isInteger(payload.workerProtocol)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'workerProtocol')
  if (payload.indexTtsVersion !== null && typeof payload.indexTtsVersion !== 'string') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'indexTtsVersion')
  if (payload.modelVersion !== undefined && payload.modelVersion !== null && typeof payload.modelVersion !== 'string') {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'modelVersion')
  }
  if (payload.qwenEmoAvailable !== undefined && typeof payload.qwenEmoAvailable !== 'boolean') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'qwenEmoAvailable')
  if (payload.networkBlocked !== undefined && typeof payload.networkBlocked !== 'boolean') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'networkBlocked')
  if (payload.loaded !== undefined && typeof payload.loaded !== 'boolean') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'loaded')
  if (payload.languages !== undefined && (!Array.isArray(payload.languages) || payload.languages.some((item) => typeof item !== 'string'))) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'languages')
  }
  if (payload.voices !== undefined && !Array.isArray(payload.voices)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'voices')
  if (payload.limits !== undefined && !isPlainObject(payload.limits)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'limits')
  if (payload.snapshotCleanupPending !== undefined && (!Number.isInteger(payload.snapshotCleanupPending) || payload.snapshotCleanupPending < 0)) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'snapshotCleanupPending')
  }
  return null
}

function validateResultPayload(payload) {
  const keys = checkPayloadKeys(payload, RESULT_KEYS)
  if (keys) return keys
  const stateless = payload.state === undefined
  if (!stateless) {
    const allowedStates = payload.state === 'degraded' || payload.state === 'offline'
      ? INDEX_TTS_HEALTH_STATES
      : INDEX_TTS_RESULT_STATES
    if (!allowedStates.includes(payload.state)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
    if (payload.state === 'ok') {
      if (payload.bytesBase64 !== undefined) {
        if (typeof payload.bytesBase64 !== 'string' || payload.bytesBase64.length > 8 * 1024 * 1024) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'bytesBase64')
        if (!boundedString(payload.mime, 64)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'mime')
        if (!Number.isInteger(payload.sampleRate) || payload.sampleRate < 8000 || payload.sampleRate > 192000) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'sampleRate')
        if (!Number.isInteger(payload.channels) || (payload.channels !== 1 && payload.channels !== 2)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'channels')
        if (!Number.isInteger(payload.durationMs) || payload.durationMs < 0) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'durationMs')
      }
    } else if (payload.bytesBase64 !== undefined) {
      return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'bytesBase64')
    }
  } else if (payload.loaded === undefined && payload.models === undefined && payload.voices === undefined
    && payload.languages === undefined && payload.limits === undefined && payload.capabilities === undefined) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
  }
  for (const key of ['requestId', 'model', 'backend', 'voiceId', 'modelVersion']) {
    if (payload[key] !== undefined && payload[key] !== null && typeof payload[key] !== 'string') {
      return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, key)
    }
  }
  if (payload.snapshotCleanupPending !== undefined && (!Number.isInteger(payload.snapshotCleanupPending) || payload.snapshotCleanupPending < 0)) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'snapshotCleanupPending')
  }
  return null
}

function validateErrorPayload(payload) {
  const keys = checkPayloadKeys(payload, ERROR_KEYS)
  if (keys) return keys
  if (typeof payload.code !== 'string' || !CODE_PATTERN.test(payload.code)) return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'code')
  if (payload.message !== undefined && (typeof payload.message !== 'string' || payload.message.length > 512)) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'message')
  }
  if (payload.state !== undefined && typeof payload.state !== 'string') return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
  if (payload.requestId !== undefined && (typeof payload.requestId !== 'string' || !ID_PATTERN.test(payload.requestId))) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'requestId')
  }
  return null
}

function validateEventPayload(payload) {
  const keys = checkPayloadKeys(payload, EVENT_KEYS)
  if (keys) return keys
  if (!INDEX_TTS_EVENT_STATES.includes(payload.state) && payload.closing !== true) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
  }
  if (payload.requestId !== undefined && (typeof payload.requestId !== 'string' || !ID_PATTERN.test(String(payload.requestId)))) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'requestId')
  }
  return null
}

function validateResponsePayload(type, payload) {
  if (type === 'ready') return validateReadyPayload(payload)
  if (type === 'result') return validateResultPayload(payload)
  if (type === 'error') return validateErrorPayload(payload)
  return validateEventPayload(payload)
}

/** Encode one bounded request line; returns { ok, line } or { ok:false, code, path }. */
export function encodeRequest(message) {
  const envelope = validateEnvelope(message, INDEX_TTS_REQUEST_TYPES)
  if (envelope) return envelope
  const payloadKeys = checkPayloadKeys(message.payload, REQUEST_PAYLOAD_KEYS[message.type])
  if (payloadKeys) return payloadKeys
  if (message.type === 'synthesize') {
    const checked = validateSynthesizePayload(message.payload)
    if (checked) return checked
  }
  if (message.type === 'cancel' && (typeof message.payload.requestId !== 'string' || !ID_PATTERN.test(message.payload.requestId))) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_ID, 'payload.requestId')
  }
  if (message.type === 'hello' && message.payload.protocol !== INDEX_TTS_PROTOCOL_VERSION) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.UNSUPPORTED_VERSION, 'payload.protocol')
  }
  const line = JSON.stringify(message)
  if (Buffer.byteLength(line, 'utf8') > INDEX_TTS_PROTOCOL_MAX_BYTES) return requestError(INDEX_TTS_PROTOCOL_ERRORS.OVERSIZED, '$')
  return { ok: true, line }
}

/** Decode and validate one worker response line; `expect` optionally restricts the type. */
export function decodeResponse(line, { expect = null } = {}) {
  const structural = scanStructure(line)
  if (structural) return requestError(structural, '$')
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.INVALID_INPUT, '$')
  }
  const scanned = scanValue(message)
  if (scanned) return requestError(scanned, '$')
  const envelope = validateEnvelope(message, INDEX_TTS_RESPONSE_TYPES)
  if (envelope) return envelope
  if (expect && !expect.includes(message.type)) {
    return requestError(INDEX_TTS_PROTOCOL_ERRORS.RESPONSE_TYPE_MISMATCH, 'type')
  }
  const payload = validateResponsePayload(message.type, message.payload)
  if (payload) return payload
  return { ok: true, message }
}
