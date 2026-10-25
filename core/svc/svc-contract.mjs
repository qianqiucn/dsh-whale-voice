/* Whale Voice — SVC (singing/voice conversion) contract (TTS-A-H design only).
 *
 * SVC is deliberately separate from the ordinary TTS Provider Registry: input is an existing
 * speech/singing audio artifact, not text. This module is pure and performs no conversion,
 * process launch, network request, credential access or WeChat delivery.
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

const FORBIDDEN_KEYS = new Set(['apiKey', 'api_key', 'token', 'accessToken', 'password', 'secret', 'authorization', 'clientSecret', 'send', 'wechat', 'sentToWechat'])
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@/-]{1,511}$/
const VOICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,127}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function issue(code, path, reason) {
  return { code, path, reason }
}

function rejectSecretKeys(value, path, errors, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectSecretKeys(child, path + '[' + index + ']', errors, seen))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) errors.push(issue(SVC_ERRORS.INVALID_REQUEST, path ? path + '.' + key : key, 'secret or delivery field is not allowed'))
    rejectSecretKeys(child, path ? path + '.' + key : key, errors, seen)
  }
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validate an SVC request. The source is an opaque audio artifact, never a filesystem path;
 * the target is a voice ID from the shared voice library, never a provider default.
 */
export function validateSvcRequest(input) {
  const errors = []
  if (!isObject(input)) return { ok: false, errors: [issue(SVC_ERRORS.INVALID_REQUEST, '$', 'expected object')] }
  rejectSecretKeys(input, '', errors)
  if (typeof input.sourceAudioRef !== 'string' || !REF_PATTERN.test(input.sourceAudioRef)) {
    errors.push(issue(SVC_ERRORS.INVALID_REQUEST, 'sourceAudioRef', 'opaque source audio reference required'))
  }
  if (typeof input.targetVoiceId !== 'string' || !VOICE_PATTERN.test(input.targetVoiceId)) {
    errors.push(issue(SVC_ERRORS.UNSUPPORTED_VOICE, 'targetVoiceId', 'valid shared voice id required'))
  }
  if (!finite(input.pitchShift) || input.pitchShift < -24 || input.pitchShift > 24) {
    errors.push(issue(SVC_ERRORS.INVALID_REQUEST, 'pitchShift', 'expected -24..24 semitones'))
  }
  if (!finite(input.formantShift) || input.formantShift < -1 || input.formantShift > 1) {
    errors.push(issue(SVC_ERRORS.INVALID_REQUEST, 'formantShift', 'expected -1..1'))
  }
  if (!finite(input.conversionStrength) || input.conversionStrength < 0 || input.conversionStrength > 1) {
    errors.push(issue(SVC_ERRORS.INVALID_REQUEST, 'conversionStrength', 'expected 0..1'))
  }
  if (input.outputFormat !== undefined && (typeof input.outputFormat !== 'string' || !/^audio\/[a-z0-9.+-]+$/.test(input.outputFormat))) {
    errors.push(issue(SVC_ERRORS.UNSUPPORTED_FORMAT, 'outputFormat', 'expected audio/* mime'))
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], request: JSON.parse(JSON.stringify(input)) }
}

/**
 * Normalize an SVC result. Delivery remains outside the SVC engine; all output goes to the
 * shared audio pipeline and then the Whale Relay delivery router.
 */
export function normalizeSvcResult(engineId, input) {
  const errors = []
  if (!isObject(input)) return { ok: false, errors: [issue(SVC_ERRORS.INVALID_RESULT, '$', 'expected object')] }
  rejectSecretKeys(input, '', errors)
  if (typeof engineId !== 'string' || !engineId) errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'engineId', 'required'))
  if (input.providerId !== undefined && input.providerId !== engineId) errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'providerId', 'must match the SVC engine'))
  if (typeof input.requestId !== 'string' || !input.requestId) errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'requestId', 'required'))
  if (typeof input.targetVoiceId !== 'string' || !VOICE_PATTERN.test(input.targetVoiceId)) errors.push(issue(SVC_ERRORS.UNSUPPORTED_VOICE, 'targetVoiceId', 'valid voice id required'))
  if (typeof input.artifactRef !== 'string' || !REF_PATTERN.test(input.artifactRef)) errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'artifactRef', 'opaque audio artifact required'))
  if (typeof input.mime !== 'string' || !/^audio\/[a-z0-9.+-]+$/.test(input.mime)) errors.push(issue(SVC_ERRORS.UNSUPPORTED_FORMAT, 'mime', 'expected audio/* mime'))
  if (!Number.isInteger(input.sampleRate) || input.sampleRate < 8000 || input.sampleRate > 192000) errors.push(issue(SVC_ERRORS.UNSUPPORTED_FORMAT, 'sampleRate', 'expected 8000..192000'))
  if (!Number.isInteger(input.durationMs) || input.durationMs < 0) errors.push(issue(SVC_ERRORS.INVALID_RESULT, 'durationMs', 'non-negative integer required'))
  if (isObject(input) && input.delivery !== undefined) {
    if (!isObject(input.delivery) || input.delivery.state !== 'PENDING_ROUTER') {
      errors.push(issue(SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery', 'SVC engine result must be pending the shared delivery router'))
    }
  }
  if (isObject(input) && (input.wechat !== undefined || input.send !== undefined)) errors.push(issue(SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery', 'SVC engine cannot deliver to WeChat'))
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    result: {
      schemaVersion: SVC_SCHEMA_VERSION,
      engineId,
      requestId: input.requestId,
      targetVoiceId: input.targetVoiceId,
      artifactRef: input.artifactRef,
      mime: input.mime,
      sampleRate: input.sampleRate,
      durationMs: input.durationMs,
      createdAt: input.createdAt || null,
      delivery: { state: 'PENDING_ROUTER' },
    },
  }
}
