/* Whale Voice — narrow versioned Qwen worker protocol (Plan10 10-A, internal only).
 *
 * Newline-delimited JSON over the child process stdio. Every message is validated for version,
 * shape, size and forbidden transport fields before it reaches the supervisor. No paths, URLs,
 * commands, environment or secrets may cross this boundary; clone material is referenced only by an
 * opaque trusted binding token resolved by Core.
 */

export const QWEN_PROTOCOL_VERSION = 1
export const QWEN_PROTOCOL_MAX_BYTES = 2 * 1024 * 1024

export const QWEN_REQUEST_TYPES = Object.freeze(['hello', 'health', 'discover', 'synthesize', 'cancel', 'shutdown'])
export const QWEN_RESPONSE_TYPES = Object.freeze(['ready', 'result', 'error', 'event'])

export const QWEN_PROTOCOL_ERRORS = Object.freeze({
  INVALID_INPUT: 'QWEN_PROTOCOL_INVALID_INPUT',
  UNSUPPORTED_VERSION: 'QWEN_PROTOCOL_UNSUPPORTED_VERSION',
  INVALID_TYPE: 'QWEN_PROTOCOL_INVALID_TYPE',
  INVALID_ID: 'QWEN_PROTOCOL_INVALID_ID',
  INVALID_PAYLOAD: 'QWEN_PROTOCOL_INVALID_PAYLOAD',
  OVERSIZED: 'QWEN_PROTOCOL_OVERSIZED',
  FORBIDDEN_FIELD: 'QWEN_PROTOCOL_FORBIDDEN_FIELD',
})

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/
const FORBIDDEN_KEYS = new Set([
  'path', 'filepath', 'file', 'files', 'url', 'uri', 'endpoint', 'host', 'port',
  'command', 'cmd', 'args', 'argv', 'shell', 'env', 'environment',
  'token', 'apikey', 'api_key', 'password', 'secret', 'authorization', 'clientsecret',
])
const REQUEST_PAYLOAD_KEYS = Object.freeze({
  hello: new Set(['protocol']),
  health: new Set([]),
  discover: new Set([]),
  synthesize: new Set(['requestId', 'text', 'voiceId', 'model', 'backend', 'modality', 'bindingRef', 'language', 'emotion', 'format', 'maxBytes']),
  cancel: new Set(['requestId']),
  shutdown: new Set([]),
})
const RESULT_KEYS = new Set([
  'state', 'reason', 'mime', 'sampleRate', 'channels', 'durationMs', 'bytesBase64', 'model', 'backend',
  'voiceId', 'workerVersion', 'workerProtocol', 'qwenTtsVersion', 'models', 'voices', 'languages',
  'formats', 'limits', 'capabilities', 'requestId', 'warnings', 'loaded', 'closing', 'provider', 'message', 'code',
])

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function hasForbidden(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some((child) => hasForbidden(child, seen))
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) return true
    if (hasForbidden(child, seen)) return true
  }
  return false
}

function requestError(code, path) {
  return { ok: false, code, path }
}

function validateFormat(format) {
  if (!isPlainObject(format)) return false
  const keys = Object.keys(format)
  if (keys.length !== 3 || !keys.includes('mime') || !keys.includes('sampleRate') || !keys.includes('channels')) return false
  return typeof format.mime === 'string' && /^audio\/[a-z0-9.+-]+$/.test(format.mime) &&
    Number.isInteger(format.sampleRate) && format.sampleRate >= 8000 && format.sampleRate <= 192000 &&
    Number.isInteger(format.channels) && (format.channels === 1 || format.channels === 2)
}

function validateSynthesizePayload(payload) {
  if (!isPlainObject(payload)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'payload')
  for (const key of Object.keys(payload)) {
    if (!REQUEST_PAYLOAD_KEYS.synthesize.has(key)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, key)
  }
  if (typeof payload.requestId !== 'string' || !ID_PATTERN.test(payload.requestId)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_ID, 'requestId')
  if (typeof payload.text !== 'string' || payload.text.trim().length === 0) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'text')
  if (payload.text.length > 2000) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'text')
  if (typeof payload.model !== 'string' || !payload.model.trim()) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'model')
  if (!['preset', 'clone'].includes(payload.modality)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'modality')
  if (payload.modality === 'preset' && (typeof payload.voiceId !== 'string' || !ID_PATTERN.test(payload.voiceId))) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_ID, 'voiceId')
  }
  if (payload.modality === 'clone' && (typeof payload.bindingRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/.test(payload.bindingRef))) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_ID, 'bindingRef')
  }
  if (payload.language !== undefined && !['zh-CN', 'en-US'].includes(payload.language)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'language')
  if (payload.emotion !== undefined && !['neutral', 'cheerful', 'gentle'].includes(payload.emotion)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'emotion')
  if (!validateFormat(payload.format)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'format')
  if (!Number.isInteger(payload.maxBytes) || payload.maxBytes < 44 || payload.maxBytes > 52428800) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'maxBytes')
  return { ok: true }
}

/**
 * Validate and serialize one request. Returns a single line (without the trailing newline).
 */
export function encodeRequest(message) {
  const size = (() => {
    try { return Buffer.byteLength(JSON.stringify(message), 'utf8') } catch { return Infinity }
  })()
  if (size > QWEN_PROTOCOL_MAX_BYTES) return { ok: false, code: QWEN_PROTOCOL_ERRORS.OVERSIZED }
  if (!isPlainObject(message)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_INPUT }
  if (message.v !== QWEN_PROTOCOL_VERSION) return { ok: false, code: QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION }
  if (!QWEN_REQUEST_TYPES.includes(message.type)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_TYPE }
  if (typeof message.id !== 'string' || !ID_PATTERN.test(message.id)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_ID }
  if (hasForbidden(message.payload)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD }
  if (!isPlainObject(message.payload)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD }
  const allowed = REQUEST_PAYLOAD_KEYS[message.type]
  for (const key of Object.keys(message.payload)) {
    if (!allowed.has(key)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, path: key }
  }
  if (message.type === 'synthesize') {
    const checked = validateSynthesizePayload(message.payload)
    if (!checked.ok) return checked
  }
  if (message.type === 'cancel' && (typeof message.payload.requestId !== 'string' || !ID_PATTERN.test(message.payload.requestId))) {
    return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_ID, path: 'payload.requestId' }
  }
  if (message.type === 'hello' && message.payload.protocol !== QWEN_PROTOCOL_VERSION) {
    return { ok: false, code: QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION, path: 'payload.protocol' }
  }
  return { ok: true, line: JSON.stringify(message) }
}

/**
 * Decode one worker line. Unknown extra fields are rejected; a bounded property count keeps a
 * hostile worker from smuggling a deep structure through the event loop.
 */
export function decodeResponse(line) {
  if (typeof line !== 'string') return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_INPUT }
  if (Buffer.byteLength(line, 'utf8') > QWEN_PROTOCOL_MAX_BYTES) return { ok: false, code: QWEN_PROTOCOL_ERRORS.OVERSIZED }
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_INPUT }
  }
  if (!isPlainObject(message)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_INPUT }
  if (message.v !== QWEN_PROTOCOL_VERSION) return { ok: false, code: QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION }
  if (!QWEN_RESPONSE_TYPES.includes(message.type)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_TYPE }
  if (typeof message.id !== 'string' || !ID_PATTERN.test(message.id)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_ID }
  if (!isPlainObject(message.payload)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD }
  if (hasForbidden(message.payload)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD }
  for (const key of Object.keys(message.payload)) {
    if (!RESULT_KEYS.has(key)) return { ok: false, code: QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, path: key }
  }
  return { ok: true, message }
}
