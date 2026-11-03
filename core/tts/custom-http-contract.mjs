/* Whale Voice — fixed custom HTTP TTS contract (Plan11, offline unit).
 *
 * One versioned JSON text request to one trusted target, one WAV byte response. There is no
 * template language, script, URL downloader or caller-supplied target. Targets are HTTPS, or HTTP
 * only for an explicit numeric loopback address; the adapter resolves and pins the address at
 * request time. Authentication is limited to no auth, a bearer header or an x-api-key header whose
 * value comes from a credentialRef resolved by Core.
 */

import { PROVIDER_ERRORS } from './provider-contract.mjs'

export const CUSTOM_HTTP_PROVIDER_ID = 'custom-http'
export const CUSTOM_HTTP_PROVIDER_NAME = '自定义 HTTP TTS（离线候选）'
export const CUSTOM_HTTP_PROTOCOL = 'whale-voice-custom-tts'
export const CUSTOM_HTTP_PROTOCOL_VERSION = 1
export const CUSTOM_HTTP_MIME = 'audio/wav'
export const CUSTOM_HTTP_SAMPLE_RATE = 24000
export const CUSTOM_HTTP_CHANNELS = 1

export const CUSTOM_HTTP_LIMITS = Object.freeze({
  maxChars: 2000,
  maxAudioSeconds: 600,
  timeoutMs: 30000,
  maxRequestBytes: 64 * 1024,
  maxResponseBytes: 8 * 1024 * 1024,
  maxHeaderBytes: 16384,
})

export const CUSTOM_HTTP_ERRORS = Object.freeze({
  TARGET_INVALID: 'CUSTOM_TARGET_INVALID',
  TARGET_SCHEME: 'CUSTOM_TARGET_SCHEME',
  TARGET_CREDENTIALS: 'CUSTOM_TARGET_CREDENTIALS',
  TARGET_LOOPBACK_ONLY: 'CUSTOM_TARGET_LOOPBACK_ONLY',
  AUTH_INVALID: 'CUSTOM_AUTH_INVALID',
  PROTOCOL_INVALID: 'CUSTOM_PROTOCOL_INVALID',
  TEXT_INVALID: 'CUSTOM_TEXT_INVALID',
  TEXT_TOO_LONG: 'CUSTOM_TEXT_TOO_LONG',
  VOICE_UNSUPPORTED: 'CUSTOM_VOICE_UNSUPPORTED',
  LANGUAGE_UNSUPPORTED: 'CUSTOM_LANGUAGE_UNSUPPORTED',
  CREDENTIALS_MISSING: 'CUSTOM_CREDENTIALS_MISSING',
  NETWORK_DISABLED: 'CUSTOM_NETWORK_DISABLED',
  TEXT_UPLOAD_NOT_CONFIRMED: 'CUSTOM_TEXT_UPLOAD_NOT_CONFIRMED',
  COST_UNKNOWN: 'CUSTOM_COST_UNKNOWN',
  COST_QUOTA_EXCEEDED: 'CUSTOM_COST_QUOTA_EXCEEDED',
  COST_DUPLICATE_REQUEST: 'CUSTOM_COST_DUPLICATE_REQUEST',
  AUTH_FAILED: 'CUSTOM_AUTH_FAILED',
  RATE_LIMITED: 'CUSTOM_RATE_LIMITED',
  PROVIDER_ERROR: 'CUSTOM_PROVIDER_ERROR',
  TIMEOUT: 'CUSTOM_TIMEOUT',
  CANCELLED: 'CUSTOM_CANCELLED',
  INVALID_AUDIO: 'CUSTOM_INVALID_AUDIO',
  RESPONSE_TOO_LARGE: 'CUSTOM_RESPONSE_TOO_LARGE',
  REDIRECT_REJECTED: 'CUSTOM_REDIRECT_REJECTED',
  PROVIDER_NOT_AVAILABLE: 'CUSTOM_PROVIDER_NOT_AVAILABLE',
})

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/
const VOICE_IDS = new Set(['custom-default'])
const LANGUAGES = new Set(['zh-CN', 'en-US'])

export function isCustomVoice(value) {
  return typeof value === 'string' && VOICE_IDS.has(value)
}

export function isCustomLanguage(value) {
  return typeof value === 'string' && LANGUAGES.has(value)
}

export function validateCustomText(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, code: CUSTOM_HTTP_ERRORS.TEXT_INVALID }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { ok: false, code: CUSTOM_HTTP_ERRORS.TEXT_INVALID }
  if (text.length > CUSTOM_HTTP_LIMITS.maxChars) return { ok: false, code: CUSTOM_HTTP_ERRORS.TEXT_TOO_LONG }
  return { ok: true, text }
}

/** Synchronous shape check before DNS resolution; the async adapter re-checks and pins the host. */
export function validateCustomTargetShape(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) return { ok: false, code: CUSTOM_HTTP_ERRORS.TARGET_INVALID }
  let url
  try { url = new URL(rawUrl) } catch { return { ok: false, code: CUSTOM_HTTP_ERRORS.TARGET_INVALID } }
  if (url.username || url.password || url.search || url.hash) return { ok: false, code: CUSTOM_HTTP_ERRORS.TARGET_CREDENTIALS }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, code: CUSTOM_HTTP_ERRORS.TARGET_SCHEME }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname) return { ok: false, code: CUSTOM_HTTP_ERRORS.TARGET_INVALID }
  if (url.protocol === 'http:') {
    if (hostname !== '127.0.0.1' && hostname !== '::1') return { ok: false, code: CUSTOM_HTTP_ERRORS.TARGET_LOOPBACK_ONLY }
  } else {
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return { ok: false, code: CUSTOM_HTTP_ERRORS.TARGET_INVALID }
  }
  return { ok: true, url: url.toString(), protocol: url.protocol, hostname }
}

export function customAuthHeader(auth, secret) {
  if (!auth || auth.mode === 'none') return {}
  if (auth.mode === 'bearer') return { Authorization: `Bearer ${secret}` }
  if (auth.mode === 'x-api-key') return { 'X-API-Key': secret }
  return null
}

export function buildCustomHttpManifest({ target, auth = { mode: 'none', credentialRef: null }, limits = null } = {}) {
  const shape = validateCustomTargetShape(target)
  if (!shape.ok) return { ok: false, code: shape.code }
  if (!auth || !['none', 'bearer', 'x-api-key'].includes(auth.mode)) return { ok: false, code: CUSTOM_HTTP_ERRORS.AUTH_INVALID }
  const credentialRef = auth.credentialRef || null
  if (auth.mode !== 'none') {
    if (typeof credentialRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@/-]{1,127}$/.test(credentialRef)) {
      return { ok: false, code: CUSTOM_HTTP_ERRORS.CREDENTIALS_MISSING }
    }
  } else if (credentialRef !== null) {
    return { ok: false, code: CUSTOM_HTTP_ERRORS.AUTH_INVALID }
  }
  const limitValues = { ...CUSTOM_HTTP_LIMITS, ...(limits && typeof limits === 'object' && !Array.isArray(limits) ? limits : {}) }
  if (!Number.isInteger(limitValues.maxChars) || limitValues.maxChars < 1 || limitValues.maxChars > CUSTOM_HTTP_LIMITS.maxChars) {
    return { ok: false, code: CUSTOM_HTTP_ERRORS.TEXT_TOO_LONG }
  }
  if (!Number.isInteger(limitValues.maxAudioSeconds) || limitValues.maxAudioSeconds < 1 || limitValues.maxAudioSeconds > CUSTOM_HTTP_LIMITS.maxAudioSeconds) {
    return { ok: false, code: CUSTOM_HTTP_ERRORS.TEXT_TOO_LONG }
  }
  if (!Number.isInteger(limitValues.timeoutMs) || limitValues.timeoutMs < 1000 || limitValues.timeoutMs > CUSTOM_HTTP_LIMITS.timeoutMs) {
    return { ok: false, code: CUSTOM_HTTP_ERRORS.PROTOCOL_INVALID }
  }
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      id: CUSTOM_HTTP_PROVIDER_ID,
      name: CUSTOM_HTTP_PROVIDER_NAME,
      kind: 'CUSTOM',
      version: { value: `${CUSTOM_HTTP_PROTOCOL}/v${CUSTOM_HTTP_PROTOCOL_VERSION}`, source: 'Whale Voice fixed custom HTTP protocol', audited: true },
      capabilities: {
        languages: [...LANGUAGES],
        voices: [{ id: 'custom-default', name: '自定义服务默认音色', kind: 'preset', languages: [...LANGUAGES], referenceAudioRequired: false }],
        clone: { supported: false, requiresReferenceAudio: false },
        emotion: { supported: false, modes: [], defaultMode: 'neutral' },
        streaming: false,
        formats: [{ mime: CUSTOM_HTTP_MIME, sampleRate: CUSTOM_HTTP_SAMPLE_RATE, channels: CUSTOM_HTTP_CHANNELS }],
        limits: { maxChars: limitValues.maxChars, timeoutMs: limitValues.timeoutMs, maxAudioSeconds: limitValues.maxAudioSeconds },
        retry: { maxAttempts: 0, idempotent: false, retryOn: [] },
        cancellation: true,
      },
      health: { mode: 'none', path: null, timeoutMs: 10000, auth: 'none' },
      credentials: { required: auth.mode !== 'none', storage: auth.mode === 'none' ? 'none' : 'dpapi', ref: credentialRef },
      network: { required: true, textUpload: true, endpointPolicy: 'https-or-loopback' },
      privacy: {
        textLeavesDevice: true,
        retention: 'unknown',
        note: '自定义服务端的留存、日志和训练政策 UNKNOWN；不得继承 Azure 的留存说明，真实启用前需由服务方确认。',
      },
      cost: {
        paid: false,
        model: 'free',
        note: '默认按自托管/免费服务处理；若实际为付费服务，必须在接入配置中显式提供单价与额度，未知价格不得执行。',
      },
      resources: { local: false, gpuRequired: false, cpuCapable: true },
    },
  }
}

export function buildCustomRequest({ requestId, text, voiceId = 'custom-default', language = 'zh-CN' }) {
  if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) return { ok: false, code: CUSTOM_HTTP_ERRORS.PROTOCOL_INVALID }
  const validated = validateCustomText(text)
  if (!validated.ok) return validated
  if (!isCustomVoice(voiceId)) return { ok: false, code: CUSTOM_HTTP_ERRORS.VOICE_UNSUPPORTED }
  if (!isCustomLanguage(language)) return { ok: false, code: CUSTOM_HTTP_ERRORS.LANGUAGE_UNSUPPORTED }
  const payload = {
    protocol: CUSTOM_HTTP_PROTOCOL,
    version: CUSTOM_HTTP_PROTOCOL_VERSION,
    requestId,
    text,
    voiceId,
    language,
    format: 'wav',
  }
  return { ok: true, payload, body: JSON.stringify(payload) }
}

export function providerCodeForCustom(code) {
  switch (code) {
    case CUSTOM_HTTP_ERRORS.TIMEOUT: return PROVIDER_ERRORS.TIMEOUT
    case CUSTOM_HTTP_ERRORS.CANCELLED: return PROVIDER_ERRORS.CANCELLED
    case CUSTOM_HTTP_ERRORS.AUTH_FAILED:
    case CUSTOM_HTTP_ERRORS.CREDENTIALS_MISSING: return PROVIDER_ERRORS.CREDENTIALS_MISSING
    case CUSTOM_HTTP_ERRORS.RATE_LIMITED: return PROVIDER_ERRORS.RATE_LIMITED
    case CUSTOM_HTTP_ERRORS.VOICE_UNSUPPORTED: return PROVIDER_ERRORS.UNSUPPORTED_VOICE
    case CUSTOM_HTTP_ERRORS.LANGUAGE_UNSUPPORTED: return PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE
    case CUSTOM_HTTP_ERRORS.NETWORK_DISABLED:
    case CUSTOM_HTTP_ERRORS.PROVIDER_NOT_AVAILABLE: return PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE
    case CUSTOM_HTTP_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED: return PROVIDER_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED
    case CUSTOM_HTTP_ERRORS.INVALID_AUDIO:
    case CUSTOM_HTTP_ERRORS.RESPONSE_TOO_LARGE:
    case CUSTOM_HTTP_ERRORS.REDIRECT_REJECTED: return PROVIDER_ERRORS.INVALID_RESPONSE
    default: return PROVIDER_ERRORS.PROVIDER_ERROR
  }
}
