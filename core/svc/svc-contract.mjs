/* Whale Voice — SVC (singing/voice conversion) contract (TTS-A-H design only).
 *
 * SVC is deliberately separate from the ordinary TTS Provider Registry: input is an existing
 * speech/singing audio artifact, not text. This module is pure and performs no conversion,
 * process launch, network request, credential access or WeChat delivery.
 *
 * Input boundary (Plan 03-A-F01):
 * - both entry points accept only plain objects (Object.prototype or null prototype);
 * - every own property of each fixed schema layer is inspected with property descriptors:
 *   string keys that are enumerable data properties. Symbol keys, hidden/non-enumerable
 *   properties, getters and setters are rejected without ever being invoked;
 * - unknown fields are rejected, never silently dropped, and error paths use a fixed
 *   placeholder instead of the caller's key text;
 * - values are read only from already validated data descriptors, so error paths cannot
 *   leak caller keys, values, exception text or stack text.
 *
 * The public contract is unchanged: SVC_SCHEMA_VERSION, SVC_ERRORS, validateSvcRequest and
 * normalizeSvcResult keep their existing success/error envelopes. No export is added.
 */

export const SVC_SCHEMA_VERSION = 1

export const SVC_ERRORS = Object.freeze({
  INVALID_REQUEST: 'SVC_INVALID_REQUEST',
  INVALID_RESULT: 'SVC_INVALID_RESULT',
  UNSUPPORTED_VOICE: 'SVC_UNSUPPORTED_VOICE',
  UNSUPPORTED_FORMAT: 'SVC_UNSUPPORTED_FORMAT',
  DELIVERY_NOT_PROVIDER: 'SVC_DELIVERY_NOT_PROVIDER',
  NOT_IMPLEMENTED: 'SVC_NOT_IMPLEMENTED',
})

const SVC_REQUEST_KEYS = Object.freeze(
  new Set(['sourceAudioRef', 'targetVoiceId', 'pitchShift', 'formantShift', 'conversionStrength', 'outputFormat']),
)
const SVC_RESULT_KEYS = Object.freeze(
  new Set([
    'providerId',
    'requestId',
    'targetVoiceId',
    'artifactRef',
    'mime',
    'sampleRate',
    'durationMs',
    'createdAt',
    'delivery',
  ]),
)
const SVC_DELIVERY_KEYS = Object.freeze(new Set(['state']))
const SEND_KEYS = Object.freeze(new Set(['send', 'wechat', 'sentToWechat']))

const MAX_LAYER_KEYS = 32
const UNKNOWN_KEY_PLACEHOLDER = '<unknown-key>'
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@/-]{1,511}$/
const VOICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,127}$/
const FORMAT_PATTERN = /^audio\/[a-z0-9.+-]+$/
const CREATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function issue(code, path, reason) {
  return { code, path, reason }
}

function fail(code, path, reason) {
  return { ok: false, errors: [issue(code, path, reason)] }
}

function failOf(errors) {
  return { ok: false, errors }
}

/**
 * Convert any inspection exception into a fixed safe failure. This does not claim to sandbox a
 * malicious Proxy; it only guarantees that exceptions never escape and never leak their text.
 */
function attempt(domainCode, run) {
  try {
    return run()
  } catch {
    return fail(domainCode, '$', 'input could not be inspected safely')
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function joinPath(prefix, key) {
  return prefix === '' ? key : prefix + '.' + key
}

/**
 * Inspect one fixed object layer: string enumerable data properties only, at most 32 own keys.
 * Unknown keys are reported with a placeholder, never with the caller's key text. Returns true
 * only when every own property is acceptable; callers must not read values otherwise.
 */
function inspectLayer(object, allowedKeys, prefix, errors, options) {
  const keys = Reflect.ownKeys(object)
  if (keys.length > MAX_LAYER_KEYS) {
    errors.push(issue(options.domainCode, prefix === '' ? '$' : prefix, 'invalid object structure'))
    return false
  }
  let clean = true
  for (const key of keys) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) {
      if (typeof key === 'string' && options.deliveryFields === true && SEND_KEYS.has(key)) {
        errors.push(
          issue(
            options.deliveryCode || options.domainCode,
            joinPath(prefix, UNKNOWN_KEY_PLACEHOLDER),
            'SVC engine cannot deliver to WeChat',
          ),
        )
      } else {
        errors.push(
          issue(options.unknownCode || options.domainCode, joinPath(prefix, UNKNOWN_KEY_PLACEHOLDER), 'unknown field is not allowed'),
        )
      }
      clean = false
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    const isDataProperty =
      descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    if (!isDataProperty || descriptor.enumerable !== true) {
      errors.push(issue(options.typeCode || options.domainCode, joinPath(prefix, key), 'invalid field type'))
      clean = false
    }
  }
  return clean
}

/** Read an own data-property value. Only called after inspectLayer returned true. */
function readOwnValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value
    : undefined
}

function hasOwnKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function pushMissing(errors, code, key) {
  errors.push(issue(code, key, 'required'))
}

function binaryString(object, key, code, pattern, semanticReason, errors) {
  const value = readOwnValue(object, key)
  if (value === undefined) {
    pushMissing(errors, code, key)
    return null
  }
  if (typeof value !== 'string') {
    errors.push(issue(code, key, 'invalid field type'))
    return null
  }
  if (!pattern.test(value)) {
    errors.push(issue(code, key, semanticReason))
    return null
  }
  return value
}

function boundedNumber(object, key, code, min, max, errors) {
  const value = readOwnValue(object, key)
  if (value === undefined) {
    pushMissing(errors, code, key)
    return null
  }
  if (typeof value !== 'number') {
    errors.push(issue(code, key, 'invalid field type'))
    return null
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    errors.push(issue(code, key, 'invalid field value'))
    return null
  }
  return value
}

function boundedInteger(object, key, code, min, max, errors) {
  const value = readOwnValue(object, key)
  if (value === undefined) {
    pushMissing(errors, code, key)
    return null
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push(issue(code, key, 'invalid field value'))
    return null
  }
  if (value < min || value > max) {
    errors.push(issue(code, key, 'invalid field value'))
    return null
  }
  return value
}

/** Canonical UTC timestamp only: exactly `YYYY-MM-DDTHH:mm:ss.sssZ` and a real calendar instant. */
function canonicalUtcTimestamp(value) {
  if (typeof value !== 'string' || !CREATED_AT_PATTERN.test(value)) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  const canonical = new Date(parsed).toISOString()
  return canonical === value ? value : null
}

/**
 * Validate an SVC request. The source is an opaque audio artifact, never a filesystem path;
 * the target is a voice ID from the shared voice library, never a provider default.
 */
export function validateSvcRequest(input) {
  return attempt(SVC_ERRORS.INVALID_REQUEST, () => {
    if (!isPlainObject(input)) return fail(SVC_ERRORS.INVALID_REQUEST, '$', 'invalid object structure')

    const errors = []
    const clean = inspectLayer(input, SVC_REQUEST_KEYS, '', errors, {
      domainCode: SVC_ERRORS.INVALID_REQUEST,
      unknownCode: SVC_ERRORS.INVALID_REQUEST,
      typeCode: SVC_ERRORS.INVALID_REQUEST,
      deliveryCode: SVC_ERRORS.DELIVERY_NOT_PROVIDER,
      deliveryFields: true,
    })
    if (!clean) return failOf(errors)

    const sourceAudioRef = binaryString(
      input,
      'sourceAudioRef',
      SVC_ERRORS.INVALID_REQUEST,
      REF_PATTERN,
      'opaque source audio reference required',
      errors,
    )

    const targetVoiceIdRaw = readOwnValue(input, 'targetVoiceId')
    let targetVoiceId = null
    if (targetVoiceIdRaw === undefined) {
      pushMissing(errors, SVC_ERRORS.INVALID_REQUEST, 'targetVoiceId')
    } else if (typeof targetVoiceIdRaw !== 'string') {
      errors.push(issue(SVC_ERRORS.INVALID_REQUEST, 'targetVoiceId', 'invalid field type'))
    } else if (!VOICE_PATTERN.test(targetVoiceIdRaw)) {
      errors.push(issue(SVC_ERRORS.UNSUPPORTED_VOICE, 'targetVoiceId', 'valid shared voice id required'))
    } else {
      targetVoiceId = targetVoiceIdRaw
    }

    const pitchShift = boundedNumber(input, 'pitchShift', SVC_ERRORS.INVALID_REQUEST, -24, 24, errors)
    const formantShift = boundedNumber(input, 'formantShift', SVC_ERRORS.INVALID_REQUEST, -1, 1, errors)
    const conversionStrength = boundedNumber(
      input,
      'conversionStrength',
      SVC_ERRORS.INVALID_REQUEST,
      0,
      1,
      errors,
    )

    let outputFormat = null
    if (hasOwnKey(input, 'outputFormat')) {
      const outputFormatRaw = readOwnValue(input, 'outputFormat')
      if (outputFormatRaw !== undefined) {
        if (typeof outputFormatRaw !== 'string') {
          errors.push(issue(SVC_ERRORS.UNSUPPORTED_FORMAT, 'outputFormat', 'invalid field type'))
        } else if (!FORMAT_PATTERN.test(outputFormatRaw)) {
          errors.push(issue(SVC_ERRORS.UNSUPPORTED_FORMAT, 'outputFormat', 'invalid field value'))
        } else {
          outputFormat = outputFormatRaw
        }
      }
    }

    if (errors.length) return failOf(errors)

    const request = {
      sourceAudioRef,
      targetVoiceId,
      pitchShift,
      formantShift,
      conversionStrength,
    }
    if (outputFormat !== null) request.outputFormat = outputFormat
    return { ok: true, errors: [], request }
  })
}

/**
 * Normalize an SVC result. Delivery remains outside the SVC engine; all output goes to the
 * shared audio pipeline and then the Whale Relay delivery router.
 */
export function normalizeSvcResult(engineId, input) {
  return attempt(SVC_ERRORS.INVALID_RESULT, () => {
    if (!isPlainObject(input)) return fail(SVC_ERRORS.INVALID_RESULT, '$', 'invalid object structure')

    const errors = []
    const clean = inspectLayer(input, SVC_RESULT_KEYS, '', errors, {
      domainCode: SVC_ERRORS.INVALID_RESULT,
      unknownCode: SVC_ERRORS.INVALID_RESULT,
      typeCode: SVC_ERRORS.INVALID_RESULT,
      deliveryCode: SVC_ERRORS.DELIVERY_NOT_PROVIDER,
      deliveryFields: true,
    })
    if (!clean) return failOf(errors)

    if (typeof engineId !== 'string' || !engineId) {
      errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'engineId', 'required'))
    }

    if (hasOwnKey(input, 'providerId')) {
      const providerId = readOwnValue(input, 'providerId')
      if (providerId !== undefined) {
        if (typeof providerId !== 'string') {
          errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'providerId', 'invalid field type'))
        } else if (providerId !== engineId) {
          errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'providerId', 'must match the SVC engine'))
        }
      }
    }

    const requestIdRaw = readOwnValue(input, 'requestId')
    let requestId = null
    if (requestIdRaw === undefined || requestIdRaw === '') {
      pushMissing(errors, SVC_ERRORS.INVALID_RESULT, 'requestId')
    } else if (typeof requestIdRaw !== 'string') {
      errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'requestId', 'invalid field type'))
    } else {
      requestId = requestIdRaw
    }

    const targetVoiceIdRaw = readOwnValue(input, 'targetVoiceId')
    let targetVoiceId = null
    if (targetVoiceIdRaw === undefined) {
      pushMissing(errors, SVC_ERRORS.INVALID_RESULT, 'targetVoiceId')
    } else if (typeof targetVoiceIdRaw !== 'string') {
      errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'targetVoiceId', 'invalid field type'))
    } else if (!VOICE_PATTERN.test(targetVoiceIdRaw)) {
      errors.push(issue(SVC_ERRORS.UNSUPPORTED_VOICE, 'targetVoiceId', 'valid voice id required'))
    } else {
      targetVoiceId = targetVoiceIdRaw
    }

    const artifactRef = binaryString(
      input,
      'artifactRef',
      SVC_ERRORS.INVALID_RESULT,
      REF_PATTERN,
      'opaque audio artifact required',
      errors,
    )

    const mimeRaw = readOwnValue(input, 'mime')
    let mime = null
    if (mimeRaw === undefined) {
      pushMissing(errors, SVC_ERRORS.INVALID_RESULT, 'mime')
    } else if (typeof mimeRaw !== 'string') {
      errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'mime', 'invalid field type'))
    } else if (!FORMAT_PATTERN.test(mimeRaw)) {
      errors.push(issue(SVC_ERRORS.UNSUPPORTED_FORMAT, 'mime', 'invalid field value'))
    } else {
      mime = mimeRaw
    }

    const sampleRateRaw = readOwnValue(input, 'sampleRate')
    let sampleRate = null
    if (sampleRateRaw === undefined) {
      pushMissing(errors, SVC_ERRORS.INVALID_RESULT, 'sampleRate')
    } else if (!Number.isInteger(sampleRateRaw) || sampleRateRaw < 8000 || sampleRateRaw > 192000) {
      errors.push(issue(SVC_ERRORS.UNSUPPORTED_FORMAT, 'sampleRate', 'invalid field value'))
    } else {
      sampleRate = sampleRateRaw
    }

    const durationMs = boundedInteger(input, 'durationMs', SVC_ERRORS.INVALID_RESULT, 0, Infinity, errors)

    let createdAt = null
    if (hasOwnKey(input, 'createdAt')) {
      const createdAtRaw = readOwnValue(input, 'createdAt')
      if (createdAtRaw !== undefined && createdAtRaw !== null) {
        const canonical = canonicalUtcTimestamp(createdAtRaw)
        if (canonical === null) {
          const reason = typeof createdAtRaw === 'string' ? 'invalid field value' : 'invalid field type'
          errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'createdAt', reason))
        } else {
          createdAt = canonical
        }
      }
    }

    if (hasOwnKey(input, 'delivery')) {
      const deliveryRaw = readOwnValue(input, 'delivery')
      if (deliveryRaw !== undefined) {
        if (!isPlainObject(deliveryRaw)) {
          errors.push(
            issue(SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery', 'SVC engine result must be pending the shared delivery router'),
          )
        } else {
          const deliveryErrors = []
          const deliveryClean = inspectLayer(deliveryRaw, SVC_DELIVERY_KEYS, 'delivery', deliveryErrors, {
            domainCode: SVC_ERRORS.DELIVERY_NOT_PROVIDER,
            unknownCode: SVC_ERRORS.DELIVERY_NOT_PROVIDER,
            typeCode: SVC_ERRORS.DELIVERY_NOT_PROVIDER,
            deliveryFields: false,
          })
          if (!deliveryClean) {
            errors.push(...deliveryErrors)
          } else {
            const state = readOwnValue(deliveryRaw, 'state')
            if (state === undefined) {
              errors.push(issue(SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery.state', 'required'))
            } else if (typeof state !== 'string') {
              errors.push(issue(SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery.state', 'invalid field type'))
            } else if (state !== 'PENDING_ROUTER') {
              errors.push(
                issue(
                  SVC_ERRORS.DELIVERY_NOT_PROVIDER,
                  'delivery.state',
                  'SVC engine result must be pending the shared delivery router',
                ),
              )
            }
          }
        }
      }
    }

    if (errors.length) return failOf(errors)

    return {
      ok: true,
      errors: [],
      result: {
        schemaVersion: SVC_SCHEMA_VERSION,
        engineId,
        requestId,
        targetVoiceId,
        artifactRef,
        mime,
        sampleRate,
        durationMs,
        createdAt,
        delivery: { state: 'PENDING_ROUTER' },
      },
    }
  })
}
