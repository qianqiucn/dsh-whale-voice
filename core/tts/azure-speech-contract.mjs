/* Whale Voice — Azure Speech standard preset neural TTS contract (Plan11, offline unit).
 *
 * This is deliberately narrow: one synchronous REST endpoint, a fixed region allowlist, a small
 * audited set of zh-CN/en-US preset neural voices, plain text escaped into SSML, and RIFF
 * 24 kHz/16-bit/mono output. Clone, custom voice, arbitrary SSML, streaming and paid downgrade
 * paths are absent. Prices and account terms are UNKNOWN; no real request is made here.
 *
 * Official references (read-only design basis):
 * - https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
 * - https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts
 */

import { PROVIDER_ERRORS } from './provider-contract.mjs'

export const AZURE_SPEECH_PROVIDER_ID = 'azure-speech'
export const AZURE_SPEECH_PROVIDER_NAME = 'Azure Speech 标准云端 TTS（离线候选）'
export const AZURE_SPEECH_API_VERSION = 'v1'
export const AZURE_SPEECH_OUTPUT_FORMAT = 'riff-24khz-16bit-mono-pcm'
export const AZURE_SPEECH_MIME = 'audio/wav'
export const AZURE_SPEECH_SAMPLE_RATE = 24000
export const AZURE_SPEECH_CHANNELS = 1

export const AZURE_SPEECH_REGIONS = Object.freeze([
  'australiaeast', 'brazilsouth', 'canadacentral', 'centralindia', 'eastasia', 'eastus', 'eastus2',
  'francecentral', 'germanywestcentral', 'japaneast', 'koreacentral', 'northeurope', 'norwayeast',
  'southafricanorth', 'southeastasia', 'swedencentral', 'switzerlandnorth', 'uaenorth', 'uksouth',
  'westeurope', 'westus', 'westus2',
])

export const AZURE_SPEECH_VOICES = Object.freeze([
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（中文女声）', language: 'zh-CN' },
  { id: 'zh-CN-YunxiNeural', name: '云希（中文男声）', language: 'zh-CN' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊（中文女声）', language: 'zh-CN' },
  { id: 'zh-CN-YunjianNeural', name: '云健（中文男声）', language: 'zh-CN' },
  { id: 'en-US-JennyNeural', name: 'Jenny（英文女声）', language: 'en-US' },
  { id: 'en-US-GuyNeural', name: 'Guy（英文男声）', language: 'en-US' },
])

export const AZURE_SPEECH_LANGUAGES = Object.freeze(['zh-CN', 'en-US'])

export const AZURE_SPEECH_LIMITS = Object.freeze({
  maxChars: 2000,
  maxAudioSeconds: 600,
  timeoutMs: 30000,
  maxResponseBytes: 8 * 1024 * 1024,
  maxHeaderBytes: 16384,
})

export const AZURE_SPEECH_ERRORS = Object.freeze({
  REGION_UNSUPPORTED: 'AZURE_REGION_UNSUPPORTED',
  VOICE_UNSUPPORTED: 'AZURE_VOICE_UNSUPPORTED',
  LANGUAGE_UNSUPPORTED: 'AZURE_LANGUAGE_UNSUPPORTED',
  TEXT_INVALID: 'AZURE_TEXT_INVALID',
  TEXT_TOO_LONG: 'AZURE_TEXT_TOO_LONG',
  SSML_INVALID: 'AZURE_SSML_INVALID',
  CREDENTIALS_MISSING: 'AZURE_CREDENTIALS_MISSING',
  NETWORK_DISABLED: 'AZURE_NETWORK_DISABLED',
  TEXT_UPLOAD_NOT_CONFIRMED: 'AZURE_TEXT_UPLOAD_NOT_CONFIRMED',
  COST_UNKNOWN: 'AZURE_COST_UNKNOWN',
  COST_QUOTA_EXCEEDED: 'AZURE_COST_QUOTA_EXCEEDED',
  COST_DUPLICATE_REQUEST: 'AZURE_COST_DUPLICATE_REQUEST',
  AUTH_FAILED: 'AZURE_AUTH_FAILED',
  RATE_LIMITED: 'AZURE_RATE_LIMITED',
  PROVIDER_ERROR: 'AZURE_PROVIDER_ERROR',
  TIMEOUT: 'AZURE_TIMEOUT',
  CANCELLED: 'AZURE_CANCELLED',
  INVALID_AUDIO: 'AZURE_INVALID_AUDIO',
  RESPONSE_TOO_LARGE: 'AZURE_RESPONSE_TOO_LARGE',
  REDIRECT_REJECTED: 'AZURE_REDIRECT_REJECTED',
  PROVIDER_NOT_AVAILABLE: 'AZURE_PROVIDER_NOT_AVAILABLE',
})

const VOICE_BY_ID = new Map(AZURE_SPEECH_VOICES.map((voice) => [voice.id, voice]))
const REGION_SET = new Set(AZURE_SPEECH_REGIONS)

export function isAzureRegion(value) {
  return typeof value === 'string' && REGION_SET.has(value)
}

export function azureVoice(value) {
  return typeof value === 'string' ? VOICE_BY_ID.get(value) || null : null
}

export function azureVoiceLanguage(value) {
  const voice = azureVoice(value)
  return voice ? voice.language : null
}

export function azureEndpoint(region) {
  if (!isAzureRegion(region)) return null
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
}

export function escapeSsmlText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Plain text only: control characters (except tab/newline) and NUL are rejected before SSML. */
export function validateAzureText(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, code: AZURE_SPEECH_ERRORS.TEXT_INVALID }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { ok: false, code: AZURE_SPEECH_ERRORS.TEXT_INVALID }
  if (text.length > AZURE_SPEECH_LIMITS.maxChars) return { ok: false, code: AZURE_SPEECH_ERRORS.TEXT_TOO_LONG }
  return { ok: true, text }
}

/**
 * Build the only SSML shape this provider emits. There is no caller-supplied SSML and no voice
 * name interpolation before validation; both are checked against the audited sets first.
 */
export function buildAzureSsml({ text, voiceId, language }) {
  const validated = validateAzureText(text)
  if (!validated.ok) return validated
  const voice = azureVoice(voiceId)
  if (!voice) return { ok: false, code: AZURE_SPEECH_ERRORS.VOICE_UNSUPPORTED }
  const lang = language || voice.language
  if (lang !== voice.language || !AZURE_SPEECH_LANGUAGES.includes(lang)) {
    return { ok: false, code: AZURE_SPEECH_ERRORS.LANGUAGE_UNSUPPORTED }
  }
  return {
    ok: true,
    ssml: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice.id}">${escapeSsmlText(text)}</voice></speak>`,
    voiceId: voice.id,
    language: lang,
  }
}

function readLimits(input) {
  const limits = { ...AZURE_SPEECH_LIMITS, ...(input && typeof input === 'object' && !Array.isArray(input) ? input : {}) }
  if (!Number.isInteger(limits.maxChars) || limits.maxChars < 1 || limits.maxChars > AZURE_SPEECH_LIMITS.maxChars) return null
  if (!Number.isInteger(limits.maxAudioSeconds) || limits.maxAudioSeconds < 1 || limits.maxAudioSeconds > AZURE_SPEECH_LIMITS.maxAudioSeconds) return null
  if (!Number.isInteger(limits.timeoutMs) || limits.timeoutMs < 1000 || limits.timeoutMs > AZURE_SPEECH_LIMITS.timeoutMs) return null
  return {
    maxChars: limits.maxChars,
    maxAudioSeconds: limits.maxAudioSeconds,
    timeoutMs: limits.timeoutMs,
    maxResponseBytes: AZURE_SPEECH_LIMITS.maxResponseBytes,
    maxHeaderBytes: AZURE_SPEECH_LIMITS.maxHeaderBytes,
  }
}

/** Build the provider-neutral manifest for the narrow Azure adapter. */
export function buildAzureSpeechManifest({ region, credentialRef = null, voices = null, limits = null } = {}) {
  if (!isAzureRegion(region)) return { ok: false, code: AZURE_SPEECH_ERRORS.REGION_UNSUPPORTED }
  const selected = Array.isArray(voices) && voices.length > 0 ? voices : AZURE_SPEECH_VOICES
  const unique = new Set()
  const declaredVoices = []
  for (const item of selected) {
    const voice = azureVoice(typeof item === 'string' ? item : item && item.id)
    if (!voice || unique.has(voice.id)) continue
    unique.add(voice.id)
    declaredVoices.push({
      id: voice.id,
      name: voice.name,
      kind: 'preset',
      languages: [voice.language],
      referenceAudioRequired: false,
    })
  }
  if (declaredVoices.length === 0) return { ok: false, code: AZURE_SPEECH_ERRORS.VOICE_UNSUPPORTED }
  const languages = [...new Set(declaredVoices.map((voice) => voice.languages[0]))]
  const limitValues = readLimits(limits)
  if (!limitValues) return { ok: false, code: AZURE_SPEECH_ERRORS.TEXT_TOO_LONG }
  if (credentialRef !== null && (typeof credentialRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@/-]{1,127}$/.test(credentialRef))) {
    return { ok: false, code: AZURE_SPEECH_ERRORS.CREDENTIALS_MISSING }
  }
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      id: AZURE_SPEECH_PROVIDER_ID,
      name: AZURE_SPEECH_PROVIDER_NAME,
      kind: 'CLOUD',
      version: {
        value: null,
        source: 'Azure Speech REST text-to-speech (official docs; no service version pinned)',
        audited: false,
      },
      capabilities: {
        languages,
        voices: declaredVoices,
        clone: { supported: false, requiresReferenceAudio: false },
        emotion: { supported: false, modes: [], defaultMode: 'neutral' },
        streaming: false,
        formats: [{ mime: AZURE_SPEECH_MIME, sampleRate: AZURE_SPEECH_SAMPLE_RATE, channels: AZURE_SPEECH_CHANNELS }],
        limits: { maxChars: limitValues.maxChars, timeoutMs: limitValues.timeoutMs, maxAudioSeconds: limitValues.maxAudioSeconds },
        retry: { maxAttempts: 0, idempotent: false, retryOn: [] },
        cancellation: true,
      },
      health: { mode: 'none', path: null, timeoutMs: 10000, auth: 'none' },
      credentials: { required: true, storage: 'dpapi', ref: credentialRef },
      network: { required: true, textUpload: true, endpointPolicy: 'https-only' },
      privacy: {
        textLeavesDevice: true,
        retention: 'provider',
        note: 'Azure Speech 标准预置神经音色；官方说明预置音色文字/音频不存日志，账户/地区条款及留存仍需自行确认。',
      },
      cost: {
        paid: true,
        model: 'per-character',
        note: '价格随地区/账户/协议变化；确切单价与额度 UNKNOWN，真实执行前必须显式确认费用上界，不能默认免费。',
      },
      resources: { local: false, gpuRequired: false, cpuCapable: true },
    },
  }
}

/** Map an Azure failure to the provider-neutral error vocabulary. */
export function providerCodeForAzure(code) {
  switch (code) {
    case AZURE_SPEECH_ERRORS.TIMEOUT: return PROVIDER_ERRORS.TIMEOUT
    case AZURE_SPEECH_ERRORS.CANCELLED: return PROVIDER_ERRORS.CANCELLED
    case AZURE_SPEECH_ERRORS.AUTH_FAILED:
    case AZURE_SPEECH_ERRORS.CREDENTIALS_MISSING: return PROVIDER_ERRORS.CREDENTIALS_MISSING
    case AZURE_SPEECH_ERRORS.RATE_LIMITED: return PROVIDER_ERRORS.RATE_LIMITED
    case AZURE_SPEECH_ERRORS.VOICE_UNSUPPORTED: return PROVIDER_ERRORS.UNSUPPORTED_VOICE
    case AZURE_SPEECH_ERRORS.LANGUAGE_UNSUPPORTED: return PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE
    case AZURE_SPEECH_ERRORS.NETWORK_DISABLED:
    case AZURE_SPEECH_ERRORS.PROVIDER_NOT_AVAILABLE: return PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE
    case AZURE_SPEECH_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED: return PROVIDER_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED
    case AZURE_SPEECH_ERRORS.INVALID_AUDIO:
    case AZURE_SPEECH_ERRORS.RESPONSE_TOO_LARGE:
    case AZURE_SPEECH_ERRORS.REDIRECT_REJECTED: return PROVIDER_ERRORS.INVALID_RESPONSE
    default: return PROVIDER_ERRORS.PROVIDER_ERROR
  }
}
