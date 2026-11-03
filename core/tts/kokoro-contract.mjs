/* Whale Voice — Kokoro-82M local provider contract (Plan10 10-C, offline candidate).
 *
 * Fixed upstream metadata, preset-voice/language capability matrix, limits and provider-neutral
 * manifest builder. Pure: no I/O, no process, no model load, no network, no credential access.
 * Code/model are Apache-2.0; dependencies, voices and G2P resources are NOT blanket-covered.
 */

export const KOKORO_PROVIDER_ID = 'kokoro-local'
export const KOKORO_MODEL = 'Kokoro-82M-v1.0'
export const KOKORO_BACKEND = 'preset'

export const KOKORO_UPSTREAM = Object.freeze({
  codeRepository: 'https://github.com/hexgrad/kokoro',
  codeCommit: 'dfb907a02bba8152ca444717ca5d78747ccb4bec',
  packageName: 'kokoro',
  packageVersion: '0.9.4',
  pythonRequires: '>=3.9',
  model: 'hexgrad/Kokoro-82M',
  modelRevision: 'f3ff3571791e39611d31c381e3a41a3af07b4987',
  modelVersion: '1.0',
  modelCardUrl: 'https://huggingface.co/hexgrad/Kokoro-82M/blob/f3ff3571791e39611d31c381e3a41a3af07b4987/README.md',
  license: 'Apache-2.0',
  licenseScope: 'Upstream code and the Kokoro-82M model are marked Apache-2.0. Dependencies, voice tensors, Misaki/espeak G2P and dictionaries, and private reference material are not covered by that blanket statement and stay separately UNKNOWN.',
})

export const KOKORO_LICENSE = Object.freeze({
  id: 'Apache-2.0',
  codeCommit: KOKORO_UPSTREAM.codeCommit,
  modelRevision: KOKORO_UPSTREAM.modelRevision,
  codeApache2: true,
  modelApache2: true,
  dependenciesCovered: false,
  voicesCovered: false,
  g2pCovered: false,
  privateMaterialCovered: false,
  chineseTextAuthoritative: false,
})

/** Official pipeline language codes at the fixed commit; actual capability is the voice intersection. */
export const KOKORO_LANGUAGE_CODES = Object.freeze({
  'en-US': 'a',
  'en-GB': 'b',
  'es-ES': 'e',
  'fr-FR': 'f',
  'hi-IN': 'h',
  'it-IT': 'i',
  'pt-BR': 'p',
  'ja-JP': 'j',
  'zh-CN': 'z',
})

export const KOKORO_LANGUAGES = Object.freeze(Object.keys(KOKORO_LANGUAGE_CODES))

export const KOKORO_LIMITS = Object.freeze({
  maxChars: 300,
  maxAudioSeconds: 60,
  timeoutMs: 120000,
  maxRequestTimeoutMs: 600000,
  minRequestTimeoutMs: 100,
  handshakeTimeoutMs: 10000,
  cancelAckTimeoutMs: 3000,
  maxBytes: 4 * 1024 * 1024,
  sampleRate: 24000,
  channels: 1,
  mime: 'audio/wav',
})

export const KOKORO_ERRORS = Object.freeze({
  INVALID_INPUT: 'KOKORO_INVALID_INPUT',
  UNKNOWN_BACKEND: 'KOKORO_UNKNOWN_BACKEND',
  CLONE_NOT_SUPPORTED: 'KOKORO_CLONE_NOT_SUPPORTED',
  MIXED_MODALITY: 'KOKORO_MIXED_MODALITY',
  UNSUPPORTED_MODALITY: 'KOKORO_UNSUPPORTED_MODALITY',
  PROVIDER_NOT_READY: 'KOKORO_PROVIDER_NOT_READY',
  UNRELATED_SERVICE: 'KOKORO_UNRELATED_SERVICE',
  VERSION_MISMATCH: 'KOKORO_VERSION_MISMATCH',
  WORKER_PROTOCOL_MISMATCH: 'KOKORO_WORKER_PROTOCOL_MISMATCH',
  MODEL_MISMATCH: 'KOKORO_MODEL_MISMATCH',
  MODEL_BACKEND_MISMATCH: 'KOKORO_MODEL_BACKEND_MISMATCH',
  DISCOVERY_INCOMPLETE: 'KOKORO_DISCOVERY_INCOMPLETE',
  DEPENDENCY_MISSING: 'KOKORO_DEPENDENCY_MISSING',
  RESOURCE_UNVERIFIED: 'KOKORO_RESOURCE_UNVERIFIED',
  OUTPUT_INVALID: 'KOKORO_OUTPUT_INVALID',
  OUTPUT_FORMAT_MISMATCH: 'KOKORO_OUTPUT_FORMAT_MISMATCH',
  OUTPUT_TOO_LARGE: 'KOKORO_OUTPUT_TOO_LARGE',
  OUTPUT_IDENTITY_MISMATCH: 'KOKORO_OUTPUT_IDENTITY_MISMATCH',
  RESPONSE_IDENTITY_MISMATCH: 'KOKORO_RESPONSE_IDENTITY_MISMATCH',
  CANCEL_NOT_CONFIRMED: 'KOKORO_CANCEL_NOT_CONFIRMED',
  NETWORK_BLOCKED: 'KOKORO_NETWORK_BLOCKED',
  RESOURCE_CHANGED: 'KOKORO_RESOURCE_CHANGED',
  WORKER_NOT_CONFIGURED: 'KOKORO_WORKER_NOT_CONFIGURED',
  WORKER_UNAVAILABLE: 'KOKORO_WORKER_UNAVAILABLE',
  TIMEOUT: 'KOKORO_TIMEOUT',
  CANCELLED: 'KOKORO_CANCELLED',
  UNKNOWN_RESULT: 'KOKORO_UNKNOWN_RESULT',
  PROTOCOL_INVALID: 'KOKORO_PROTOCOL_INVALID',
  RESPONSE_TYPE_MISMATCH: 'KOKORO_RESPONSE_TYPE_MISMATCH',
  STOPPING: 'KOKORO_STOPPING',
  UNRESOLVED_ACTIVITY: 'KOKORO_UNRESOLVED_ACTIVITY',
  EXIT_UNCONFIRMED: 'KOKORO_EXIT_UNCONFIRMED',
  CLEANUP_INCOMPLETE: 'KOKORO_CLEANUP_INCOMPLETE',
  UNKNOWN_REQUEST: 'KOKORO_UNKNOWN_REQUEST',
  G2P_UNAVAILABLE: 'KOKORO_G2P_UNAVAILABLE',
})

/** Static dependency inventory from the fixed pyproject/requirements; enumerated, not installed. */
export const KOKORO_DEPENDENCIES = Object.freeze([
  'torch', 'transformers', 'huggingface_hub', 'misaki[en,ja,zh]', 'espeak-ng',
  'numpy', 'scipy', 'loguru', 'pydantic', 'tqdm',
].map((name) => Object.freeze({ name, licenseStatus: 'UNKNOWN' })))

export const KOKORO_LOADING_BOUNDARY = Object.freeze({
  modelSource: 'existing local config.json and kokoro-v1_0.pth inside an explicit allowed root',
  snapshot: 'every regular model/voice file is copied byte-for-byte to a private worker snapshot before construction',
  localFilesOnly: true,
  offlineEnvironment: Object.freeze(['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE']),
  networkGuard: 'in-process socket/urllib guard installed before the official import',
  voices: 'trusted local .pt paths only; no voice name is allowed to reach the HF download helper',
  g2p: 'Misaki/espeak dictionaries and language resources must already exist locally; missing G2P fails closed',
  device: 'CPU only (device="cpu"); real CPU performance is not verified by this batch',
})

export function kokoroLicenseView() {
  return { ...KOKORO_LICENSE }
}

export function kokoroMetadataInventory() {
  return {
    code: { repository: KOKORO_UPSTREAM.codeRepository, commit: KOKORO_UPSTREAM.codeCommit, license: 'Apache-2.0' },
    pythonPackage: { name: 'kokoro', version: '0.9.4', pythonRequires: '>=3.9', installed: null, installedStatus: 'UNKNOWN' },
    model: { id: KOKORO_UPSTREAM.model, revision: KOKORO_UPSTREAM.modelRevision, version: '1.0', license: 'Apache-2.0', localAvailability: null, localAvailabilityStatus: 'UNKNOWN' },
    dependencies: KOKORO_DEPENDENCIES.map((item) => ({ ...item })),
    voices: { licenseStatus: 'UNKNOWN', localAvailabilityStatus: 'UNKNOWN' },
    g2p: { licenseStatus: 'UNKNOWN', localAvailabilityStatus: 'UNKNOWN' },
    loadingBoundary: { ...KOKORO_LOADING_BOUNDARY, offlineEnvironment: [...KOKORO_LOADING_BOUNDARY.offlineEnvironment] },
    unknown: [
      'per-dependency licences are not audited',
      'voice tensor and Misaki/espeak dictionary licences are not blanket Apache-2.0',
      'local installation/weight/voice/G2P availability is not verified',
      'real CPU latency/quality is not verified',
      'private reference material is not used by this preset-only provider',
    ],
  }
}

export function isKokoroLanguage(value) {
  return KOKORO_LANGUAGES.includes(value)
}

export function isKokoroModel(value) {
  return value === KOKORO_MODEL
}

export function kokoroLanguageCode(value) {
  return KOKORO_LANGUAGE_CODES[value] || null
}

export function normalizeKokoroVoice(value) {
  if (!value || typeof value !== 'object') return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) return null
  const language = isKokoroLanguage(value.language)
    ? value.language
    : (Array.isArray(value.languages) ? value.languages.find(isKokoroLanguage) : null)
  if (!language) return null
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 128) : id
  return { id, name, kind: 'preset', languages: [language], referenceAudioRequired: false }
}

function readLimits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const keys = Object.keys(input)
  if (keys.some((key) => !['maxChars', 'maxAudioSeconds', 'timeoutMs'].includes(key))) return null
  const { maxChars, maxAudioSeconds, timeoutMs } = input
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > KOKORO_LIMITS.maxChars) return null
  if (!Number.isInteger(maxAudioSeconds) || maxAudioSeconds < 1 || maxAudioSeconds > KOKORO_LIMITS.maxAudioSeconds) return null
  if (!Number.isInteger(timeoutMs) || timeoutMs < KOKORO_LIMITS.minRequestTimeoutMs || timeoutMs > KOKORO_LIMITS.maxRequestTimeoutMs) return null
  return { maxChars, maxAudioSeconds, timeoutMs }
}

export function buildKokoroManifest(input = {}) {
  const voices = (Array.isArray(input.voices) ? input.voices : []).map(normalizeKokoroVoice).filter(Boolean)
  if (voices.length === 0) return { ok: false, code: KOKORO_ERRORS.DISCOVERY_INCOMPLETE }
  const declared = new Set(voices.map((voice) => voice.languages[0]))
  const languages = (Array.isArray(input.languages) ? input.languages : []).filter((item) => isKokoroLanguage(item) && declared.has(item))
  if (languages.length === 0) return { ok: false, code: KOKORO_ERRORS.DISCOVERY_INCOMPLETE }
  const limits = readLimits(input.limits)
  if (!limits) return { ok: false, code: KOKORO_ERRORS.DISCOVERY_INCOMPLETE }
  const versionValue = typeof input.kokoroVersion === 'string' && input.kokoroVersion.trim() ? input.kokoroVersion.trim().slice(0, 64) : null
  if (versionValue !== KOKORO_UPSTREAM.packageVersion) return { ok: false, code: KOKORO_ERRORS.VERSION_MISMATCH }
  if (input.model !== KOKORO_MODEL || input.modelVersion !== KOKORO_UPSTREAM.modelVersion) {
    return { ok: false, code: KOKORO_ERRORS.MODEL_MISMATCH }
  }
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      id: KOKORO_PROVIDER_ID,
      name: 'Kokoro-82M 本地服务（演示候选）',
      kind: 'LOCAL',
      version: { value: versionValue, source: `kokoro ${KOKORO_UPSTREAM.packageVersion} / Kokoro-82M v1.0 @ ${KOKORO_UPSTREAM.codeCommit.slice(0, 12)}`, audited: true },
      capabilities: {
        languages,
        voices,
        clone: { supported: false, requiresReferenceAudio: false },
        emotion: { supported: false, modes: [], defaultMode: 'neutral' },
        streaming: false,
        formats: [{ mime: 'audio/wav', sampleRate: 24000, channels: 1 }],
        limits: { maxChars: limits.maxChars, timeoutMs: limits.timeoutMs, maxAudioSeconds: limits.maxAudioSeconds },
        retry: { maxAttempts: 0, idempotent: false, retryOn: [] },
        cancellation: true,
      },
      health: { mode: 'local', path: null, timeoutMs: KOKORO_LIMITS.handshakeTimeoutMs, auth: 'none' },
      credentials: { required: false, storage: 'none', ref: null },
      network: { required: false, textUpload: false, endpointPolicy: 'loopback-only' },
      privacy: { textLeavesDevice: false, retention: 'none', note: '本机进程内合成；文本不离开本机，不写入日志、不读取私人素材。' },
      cost: { paid: false, model: 'free', note: '本机运行，无按次费用；依赖/音色/G2P 许可需单独确认。' },
      resources: { local: true, gpuRequired: false, cpuCapable: true },
    },
  }
}

/** Kokoro is preset-only; clone/design requests are rejected instead of being mapped onto a voice. */
export function checkKokoroModality(request, binding) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return { ok: false, code: KOKORO_ERRORS.INVALID_INPUT }
  const hasPreset = typeof request.voiceId === 'string' && request.voiceId.length > 0
  const hasClone = Boolean(binding && binding.kind === 'clone')
  const hasDesign = Boolean(request.voicePrompt)
  if (hasClone) return { ok: false, code: KOKORO_ERRORS.CLONE_NOT_SUPPORTED }
  if (hasDesign) return { ok: false, code: KOKORO_ERRORS.UNSUPPORTED_MODALITY }
  if (!hasPreset) return { ok: false, code: KOKORO_ERRORS.INVALID_INPUT }
  return { ok: true, modality: 'preset' }
}
