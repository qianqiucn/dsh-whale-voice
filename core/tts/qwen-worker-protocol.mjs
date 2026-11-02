/* Whale Voice — narrow versioned Qwen worker protocol (Plan10 10-A, internal only).
 *
 * Newline-delimited JSON over the child process stdio. Every message is validated for version,
 * envelope shape, response type, size, nesting depth, node count and forbidden transport fields
 * before it reaches the supervisor. Parsing is bounded and never recursive, so a hostile or broken
 * worker cannot exhaust the Core host stack. No paths, URLs, commands, environment or secrets may
 * cross this boundary; clone material is referenced only by an opaque trusted binding token resolved
 * by Core.
 */

export const QWEN_PROTOCOL_VERSION = 1
export const QWEN_PROTOCOL_MAX_BYTES = 2 * 1024 * 1024
export const QWEN_PROTOCOL_MAX_DEPTH = 24
export const QWEN_PROTOCOL_MAX_NODES = 4096
export const QWEN_PROTOCOL_MAX_ARRAY = 256

export const QWEN_REQUEST_TYPES = Object.freeze(['hello', 'health', 'discover', 'synthesize', 'cancel', 'shutdown'])
export const QWEN_RESPONSE_TYPES = Object.freeze(['ready', 'result', 'error', 'event'])

/** Terminal states a worker may report inside a `result` payload. */
export const QWEN_RESULT_STATES = Object.freeze(['ok', 'cancelled', 'unknown'])
export const QWEN_EVENT_STATES = Object.freeze(['started', 'progress', 'cancelled', 'closing', 'stopped', 'UNKNOWN'])

export const QWEN_PROTOCOL_ERRORS = Object.freeze({
  INVALID_INPUT: 'QWEN_PROTOCOL_INVALID_INPUT',
  UNSUPPORTED_VERSION: 'QWEN_PROTOCOL_UNSUPPORTED_VERSION',
  INVALID_TYPE: 'QWEN_PROTOCOL_INVALID_TYPE',
  INVALID_ID: 'QWEN_PROTOCOL_INVALID_ID',
  INVALID_PAYLOAD: 'QWEN_PROTOCOL_INVALID_PAYLOAD',
  OVERSIZED: 'QWEN_PROTOCOL_OVERSIZED',
  FORBIDDEN_FIELD: 'QWEN_PROTOCOL_FORBIDDEN_FIELD',
  TOO_DEEP: 'QWEN_PROTOCOL_TOO_DEEP',
  TOO_COMPLEX: 'QWEN_PROTOCOL_TOO_COMPLEX',
})

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/
const ERROR_CODE_PATTERN = /^QWEN_[A-Z0-9_]{1,63}$/
const FORBIDDEN_KEYS = new Set([
  'path', 'filepath', 'file', 'files', 'url', 'uri', 'endpoint', 'host', 'port',
  'command', 'cmd', 'args', 'argv', 'shell', 'env', 'environment',
  'token', 'apikey', 'api_key', 'password', 'secret', 'authorization', 'clientsecret',
  '__proto__', 'constructor', 'prototype',
])
const ENVELOPE_KEYS = Object.freeze(new Set(['v', 'id', 'type', 'payload']))
const REQUEST_PAYLOAD_KEYS = Object.freeze({
  hello: new Set(['protocol']),
  health: new Set([]),
  discover: new Set([]),
  synthesize: new Set(['requestId', 'text', 'voiceId', 'model', 'backend', 'modality', 'bindingRef', 'language', 'emotion', 'format', 'maxBytes']),
  cancel: new Set(['requestId']),
  shutdown: new Set([]),
})
const READY_KEYS = new Set([
  'provider', 'model', 'backend', 'modelSize', 'instructSupported', 'qwenTtsVersion', 'workerVersion',
  'workerProtocol', 'languages', 'voices', 'limits', 'loaded', 'state', 'message', 'code',
])
const RESULT_KEYS = new Set([
  'state', 'reason', 'mime', 'sampleRate', 'channels', 'durationMs', 'bytesBase64', 'model', 'backend',
  'voiceId', 'workerVersion', 'workerProtocol', 'qwenTtsVersion', 'models', 'voices', 'languages',
  'formats', 'limits', 'capabilities', 'requestId', 'warnings', 'loaded', 'closing', 'provider',
  'message', 'code', 'modelSize', 'instructSupported',
])
const ERROR_KEYS = new Set(['code', 'message', 'reason', 'state', 'requestId'])
const EVENT_KEYS = new Set(['requestId', 'state', 'message', 'code', 'loaded', 'closing'])

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function requestError(code, path) {
  return { ok: false, code, path }
}

/**
 * Raw-text structural pre-scan. Counts nesting depth outside strings so a deeply nested but small
 * payload is rejected before `JSON.parse`, and caps the number of structural openers.
 */
function scanStructure(text) {
  let depth = 0
  let opened = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index)
    if (inString) {
      if (escaped) escaped = false
      else if (char === 0x5c) escaped = true
      else if (char === 0x22) inString = false
      continue
    }
    if (char === 0x22) {
      inString = true
      continue
    }
    if (char === 0x7b || char === 0x5b) {
      depth += 1
      opened += 1
      if (depth > QWEN_PROTOCOL_MAX_DEPTH) return QWEN_PROTOCOL_ERRORS.TOO_DEEP
      if (opened > QWEN_PROTOCOL_MAX_NODES) return QWEN_PROTOCOL_ERRORS.TOO_COMPLEX
      continue
    }
    if (char === 0x7d || char === 0x5d) {
      depth -= 1
      if (depth < 0) return QWEN_PROTOCOL_ERRORS.INVALID_INPUT
    }
  }
  if (inString || depth !== 0) return QWEN_PROTOCOL_ERRORS.INVALID_INPUT
  return null
}

/**
 * Iterative, bounded scan of a parsed value: rejects forbidden transport keys, excessive depth and
 * excessive node/array counts without recursion.
 */
function scanValue(root) {
  const stack = [{ value: root, depth: 0 }]
  let nodes = 0
  while (stack.length > 0) {
    const { value, depth } = stack.pop()
    nodes += 1
    if (nodes > QWEN_PROTOCOL_MAX_NODES) return QWEN_PROTOCOL_ERRORS.TOO_COMPLEX
    if (value === null || typeof value !== 'object') continue
    if (depth > QWEN_PROTOCOL_MAX_DEPTH) return QWEN_PROTOCOL_ERRORS.TOO_DEEP
    if (Array.isArray(value)) {
      if (value.length > QWEN_PROTOCOL_MAX_ARRAY) return QWEN_PROTOCOL_ERRORS.TOO_COMPLEX
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push({ value: value[index], depth: depth + 1 })
      continue
    }
    if (!isPlainObject(value)) return QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) return QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD
      stack.push({ value: child, depth: depth + 1 })
    }
  }
  return null
}

function validateEnvelope(message, allowedTypes) {
  if (!isPlainObject(message)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_INPUT)
  for (const key of Object.keys(message)) {
    if (!ENVELOPE_KEYS.has(key)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_INPUT, key)
  }
  if (message.v !== QWEN_PROTOCOL_VERSION) return requestError(QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION, 'v')
  if (!allowedTypes.includes(message.type)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_TYPE, 'type')
  if (typeof message.id !== 'string' || !ID_PATTERN.test(message.id)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_ID, 'id')
  if (!isPlainObject(message.payload)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'payload')
  return null
}

function checkPayloadKeys(payload, allowed) {
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, key)
  }
  return null
}

function isBoundedString(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
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
  return null
}

function validateReadyPayload(payload) {
  const keys = checkPayloadKeys(payload, READY_KEYS)
  if (keys) return keys
  if (typeof payload.provider !== 'string' || !payload.provider.trim()) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'provider')
  if (typeof payload.model !== 'string' || !payload.model.trim()) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'model')
  if (typeof payload.backend !== 'string' || !payload.backend.trim()) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'backend')
  if (!Number.isInteger(payload.workerProtocol)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'workerProtocol')
  if (payload.qwenTtsVersion !== null && typeof payload.qwenTtsVersion !== 'string') return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'qwenTtsVersion')
  if (payload.instructSupported !== undefined && typeof payload.instructSupported !== 'boolean') return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'instructSupported')
  if (payload.languages !== undefined && (!Array.isArray(payload.languages) || payload.languages.some((item) => typeof item !== 'string'))) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'languages')
  }
  if (payload.voices !== undefined && !Array.isArray(payload.voices)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'voices')
  if (payload.limits !== undefined && !isPlainObject(payload.limits)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'limits')
  return null
}

function validateResultPayload(payload) {
  const keys = checkPayloadKeys(payload, RESULT_KEYS)
  if (keys) return keys
  const stateless = payload.state === undefined
  if (!stateless) {
    if (!QWEN_RESULT_STATES.includes(payload.state)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
    if (payload.state === 'ok') {
      if (payload.bytesBase64 !== undefined) {
        if (!isBoundedString(payload.bytesBase64, QWEN_PROTOCOL_MAX_BYTES)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'bytesBase64')
        if (!isBoundedString(payload.mime, 64)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'mime')
        if (!Number.isInteger(payload.sampleRate) || payload.sampleRate < 8000 || payload.sampleRate > 192000) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'sampleRate')
        if (!Number.isInteger(payload.channels) || (payload.channels !== 1 && payload.channels !== 2)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'channels')
        if (!Number.isInteger(payload.durationMs) || payload.durationMs < 0) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'durationMs')
      }
    } else if (payload.bytesBase64 !== undefined) {
      /* A cancelled/unknown result must not carry audio bytes pretending to be a success. */
      return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'bytesBase64')
    }
  } else if (payload.loaded === undefined && payload.models === undefined && payload.voices === undefined &&
    payload.languages === undefined && payload.limits === undefined && payload.capabilities === undefined) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
  }
  for (const key of ['requestId', 'model', 'backend', 'voiceId']) {
    if (payload[key] !== undefined && payload[key] !== null && typeof payload[key] !== 'string') {
      return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, key)
    }
  }
  return null
}

function validateErrorPayload(payload) {
  const keys = checkPayloadKeys(payload, ERROR_KEYS)
  if (keys) return keys
  if (typeof payload.code !== 'string' || !ERROR_CODE_PATTERN.test(payload.code)) return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'code')
  if (payload.message !== undefined && (typeof payload.message !== 'string' || payload.message.length > 512)) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'message')
  }
  if (payload.state !== undefined && typeof payload.state !== 'string') return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
  return null
}

function validateEventPayload(payload) {
  const keys = checkPayloadKeys(payload, EVENT_KEYS)
  if (keys) return keys
  if (!QWEN_EVENT_STATES.includes(payload.state) && payload.closing !== true) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD, 'state')
  }
  if (payload.requestId !== undefined && !ID_PATTERN.test(String(payload.requestId))) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_ID, 'requestId')
  }
  return null
}

function validateResponsePayload(type, payload) {
  if (type === 'ready') return validateReadyPayload(payload)
  if (type === 'result') return validateResultPayload(payload)
  if (type === 'error') return validateErrorPayload(payload)
  return validateEventPayload(payload)
}

/**
 * Validate and serialize one request. Returns a single line (without the trailing newline).
 */
export function encodeRequest(message) {
  let text
  try {
    text = JSON.stringify(message)
  } catch {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_INPUT)
  }
  if (Buffer.byteLength(text, 'utf8') > QWEN_PROTOCOL_MAX_BYTES) return requestError(QWEN_PROTOCOL_ERRORS.OVERSIZED)
  const structural = scanStructure(text)
  if (structural) return requestError(structural)
  const scanned = scanValue(message)
  if (scanned) return requestError(scanned)
  const envelope = validateEnvelope(message, QWEN_REQUEST_TYPES)
  if (envelope) return envelope
  const keys = checkPayloadKeys(message.payload, REQUEST_PAYLOAD_KEYS[message.type])
  if (keys) return keys
  if (message.type === 'synthesize') {
    const checked = validateSynthesizePayload(message.payload)
    if (checked) return checked
  }
  if (message.type === 'cancel' && (typeof message.payload.requestId !== 'string' || !ID_PATTERN.test(message.payload.requestId))) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_ID, 'payload.requestId')
  }
  if (message.type === 'hello' && message.payload.protocol !== QWEN_PROTOCOL_VERSION) {
    return requestError(QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION, 'payload.protocol')
  }
  return { ok: true, line: text }
}

/**
 * Decode one worker line with bounded structure and response-type validation. `expect` may list the
 * response types this operation accepts; anything else is rejected instead of being handed to an
 * unrelated waiter.
 */
export function decodeResponse(line, { expect = null } = {}) {
  if (typeof line !== 'string') return requestError(QWEN_PROTOCOL_ERRORS.INVALID_INPUT)
  if (Buffer.byteLength(line, 'utf8') > QWEN_PROTOCOL_MAX_BYTES) return requestError(QWEN_PROTOCOL_ERRORS.OVERSIZED)
  const structural = scanStructure(line)
  if (structural) return requestError(structural)
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_INPUT)
  }
  const scanned = scanValue(message)
  if (scanned) return requestError(scanned)
  const envelope = validateEnvelope(message, QWEN_RESPONSE_TYPES)
  if (envelope) return envelope
  if (Array.isArray(expect) && expect.length > 0 && !expect.includes(message.type)) {
    return requestError(QWEN_PROTOCOL_ERRORS.INVALID_TYPE, 'type')
  }
  const payload = validateResponsePayload(message.type, message.payload)
  if (payload) return payload
  return { ok: true, message }
}
