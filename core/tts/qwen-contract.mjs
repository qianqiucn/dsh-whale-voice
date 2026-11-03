/* Whale Voice — Qwen3-TTS local provider contract (Plan10 10-A, offline candidate).
 *
 * Fixed upstream metadata, backend/se-modality matrix, limits and the provider-neutral manifest
 * builder. Pure: no I/O, no process, no model load, no network, no credential access.
 */

export const QWEN_PROVIDER_ID = 'qwen3-tts-local'

/** Verified upstream references only. They do not prove a local install, weights or voice rights. */
export const QWEN_UPSTREAM = Object.freeze({
  codeRepository: 'https://github.com/QwenLM/Qwen3-TTS',
  codeCommit: '022e286b98fbec7e1e916cb940cdf532cd9f488e',
  packageName: 'qwen-tts',
  packageVersion: '0.1.1',
  pythonRequires: '>=3.9',
  baseModel: 'Qwen/Qwen3-TTS-12Hz-1.7B-Base',
  baseModelRevision: 'fd4b254389122332181a7c3db7f27e918eec64e3',
  modelCardUrl: 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/blob/fd4b254389122332181a7c3db7f27e918eec64e3/README.md',
  license: 'Apache-2.0',
  licenseScope: 'Upstream code and the Base model card are Apache-2.0; dependencies, variants and private reference material are not covered by that statement.',
})

export const QWEN_BACKENDS = Object.freeze({
  CUSTOM_VOICE: 'custom-voice',
  BASE_CLONE: 'base-clone',
  VOICE_DESIGN: 'voice-design',
})

const BACKEND_VALUES = new Set(Object.values(QWEN_BACKENDS))

/**
 * Audited released model identities (README model table at the fixed commit). Anything outside this
 * table is unverified: the adapter refuses it instead of accepting a prefix match. 25 Hz variants are
 * mentioned in the upstream benchmarks but are not part of the released table, so they stay out.
 */
export const QWEN_AUDITED_MODELS = Object.freeze({
  'Qwen3-TTS-12Hz-1.7B-Base': Object.freeze({ backend: 'base-clone', size: '1b7' }),
  'Qwen3-TTS-12Hz-0.6B-Base': Object.freeze({ backend: 'base-clone', size: '0b6' }),
  'Qwen3-TTS-12Hz-1.7B-CustomVoice': Object.freeze({ backend: 'custom-voice', size: '1b7' }),
  'Qwen3-TTS-12Hz-0.6B-CustomVoice': Object.freeze({ backend: 'custom-voice', size: '0b6' }),
  'Qwen3-TTS-12Hz-1.7B-VoiceDesign': Object.freeze({ backend: 'voice-design', size: '1b7' }),
})

const AUDITED_MODEL_NAMES = new Set(Object.keys(QWEN_AUDITED_MODELS))

/**
 * Static dependency inventory from the fixed upstream `pyproject.toml`. These are enumerated, not
 * installed. Upstream lists no per-dependency license, so every entry stays UNKNOWN until separately
 * audited; a pinned version is metadata, not an installation or a licence grant.
 */
export const QWEN_DEPENDENCIES = Object.freeze([
  Object.freeze({ name: 'transformers', constraint: '==4.57.3', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'accelerate', constraint: '==1.12.0', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'gradio', constraint: 'unpinned', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'librosa', constraint: 'unpinned', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'torchaudio', constraint: 'unpinned', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'soundfile', constraint: 'unpinned', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'sox', constraint: 'unpinned', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'onnxruntime', constraint: 'unpinned', licenseStatus: 'UNKNOWN' }),
  Object.freeze({ name: 'einops', constraint: 'unpinned', licenseStatus: 'UNKNOWN' }),
])

/**
 * Tokenizer inventory. The upstream loader calls `AutoConfig`, `AutoModel.from_pretrained` and
 * `AutoProcessor.from_pretrained` on the same local model directory; the speech tokenizer is part of
 * the loaded model weights. Nothing may fall back to a network fetch when a local file is missing.
 * The tokenizer's own identity/version and licence are only known after a real load, which this batch
 * does not perform, so they stay explicitly unknown instead of guessed.
 */
export const QWEN_TOKENIZER = Object.freeze({
  name: 'Qwen3-TTS-Tokenizer-12Hz',
  loader: 'AutoConfig + AutoModel.from_pretrained + AutoProcessor.from_pretrained(local model directory); speech tokenizer is part of the model weights',
  version: null,
  versionStatus: 'UNKNOWN',
  licenseStatus: 'UNKNOWN',
  networkFallback: 'PROHIBITED',
  evidence: 'static upstream reading at the fixed commit; not executed in this batch',
})

/**
 * Static description of the loading boundary enforced by the worker. This is a contract statement,
 * not proof that a real model was loaded.
 */
export const QWEN_LOADING_BOUNDARY = Object.freeze({
  modelSource: 'existing local directory inside an explicit allowed root only',
  localFilesOnly: true,
  trustRemoteCode: false,
  offlineEnvironment: Object.freeze(['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE']),
  networkGuard: 'in-process socket/urllib guard installed before the official import',
  referenceAudio: 'trusted local index entry only; re-audited and held at actual use',
})

/**
 * Modality matrix. Voice IDs, clone prompts/references and voice-design instructions are separate
 * modalities and may never be mixed in one request.
 */
export const QWEN_CAPABILITIES = Object.freeze({
  'custom-voice': Object.freeze({
    label: 'CustomVoice 预设音色',
    presetVoices: true,
    clone: false,
    requiresReferenceAudio: false,
    voiceDesign: false,
    emotion: true,
    emotionModes: Object.freeze(['neutral', 'cheerful', 'gentle']),
    publicRequest: true,
  }),
  'base-clone': Object.freeze({
    label: 'Base 音色克隆（需可信参考绑定）',
    presetVoices: false,
    clone: true,
    requiresReferenceAudio: true,
    voiceDesign: false,
    emotion: false,
    emotionModes: Object.freeze([]),
    publicRequest: false,
  }),
  'voice-design': Object.freeze({
    label: 'VoiceDesign 指令生成',
    presetVoices: false,
    clone: false,
    requiresReferenceAudio: false,
    voiceDesign: true,
    emotion: false,
    emotionModes: Object.freeze([]),
    publicRequest: false,
  }),
})

export const QWEN_LIMITS = Object.freeze({
  maxChars: 200,
  maxAudioSeconds: 20,
  timeoutMs: 120000,
  maxRequestTimeoutMs: 600000,
  minRequestTimeoutMs: 100,
  handshakeTimeoutMs: 10000,
  cancelAckTimeoutMs: 3000,
  maxBytes: 1048576,
  sampleRate: 24000,
  channels: 1,
  mime: 'audio/wav',
})

export const QWEN_ERRORS = Object.freeze({
  INVALID_INPUT: 'QWEN_INVALID_INPUT',
  UNKNOWN_BACKEND: 'QWEN_UNKNOWN_BACKEND',
  VOICE_DESIGN_NOT_EXPOSED: 'QWEN_VOICE_DESIGN_NOT_EXPOSED',
  CLONE_BINDING_REQUIRED: 'QWEN_CLONE_BINDING_REQUIRED',
  MIXED_MODALITY: 'QWEN_MIXED_MODALITY',
  UNSUPPORTED_MODALITY: 'QWEN_UNSUPPORTED_MODALITY',
  PROVIDER_NOT_READY: 'QWEN_PROVIDER_NOT_READY',
  UNRELATED_SERVICE: 'QWEN_UNRELATED_SERVICE',
  VERSION_MISMATCH: 'QWEN_VERSION_MISMATCH',
  WORKER_PROTOCOL_MISMATCH: 'QWEN_WORKER_PROTOCOL_MISMATCH',
  MODEL_MISMATCH: 'QWEN_MODEL_MISMATCH',
  MODEL_BACKEND_MISMATCH: 'QWEN_MODEL_BACKEND_MISMATCH',
  DISCOVERY_INCOMPLETE: 'QWEN_DISCOVERY_INCOMPLETE',
  DEPENDENCY_MISSING: 'QWEN_DEPENDENCY_MISSING',
  RESOURCE_UNVERIFIED: 'QWEN_RESOURCE_UNVERIFIED',
  OUTPUT_INVALID: 'QWEN_OUTPUT_INVALID',
  OUTPUT_FORMAT_MISMATCH: 'QWEN_OUTPUT_FORMAT_MISMATCH',
  OUTPUT_TOO_LARGE: 'QWEN_OUTPUT_TOO_LARGE',
  OUTPUT_IDENTITY_MISMATCH: 'QWEN_OUTPUT_IDENTITY_MISMATCH',
  RESPONSE_IDENTITY_MISMATCH: 'QWEN_RESPONSE_IDENTITY_MISMATCH',
  CANCEL_NOT_CONFIRMED: 'QWEN_CANCEL_NOT_CONFIRMED',
  NETWORK_BLOCKED: 'QWEN_NETWORK_BLOCKED',
  RESOURCE_CHANGED: 'QWEN_RESOURCE_CHANGED',
  WORKER_NOT_CONFIGURED: 'QWEN_WORKER_NOT_CONFIGURED',
  WORKER_UNAVAILABLE: 'QWEN_WORKER_UNAVAILABLE',
  TIMEOUT: 'QWEN_TIMEOUT',
  CANCELLED: 'QWEN_CANCELLED',
  UNKNOWN_RESULT: 'QWEN_UNKNOWN_RESULT',
  PROTOCOL_INVALID: 'QWEN_PROTOCOL_INVALID',
  RESPONSE_TYPE_MISMATCH: 'QWEN_RESPONSE_TYPE_MISMATCH',
  STOPPING: 'QWEN_STOPPING',
  UNRESOLVED_ACTIVITY: 'QWEN_UNRESOLVED_ACTIVITY',
  EXIT_UNCONFIRMED: 'QWEN_EXIT_UNCONFIRMED',
  CLEANUP_INCOMPLETE: 'QWEN_CLEANUP_INCOMPLETE',
  UNKNOWN_REQUEST: 'QWEN_UNKNOWN_REQUEST',
})

const LANGUAGES = Object.freeze(['zh-CN', 'en-US'])

export function qwenBackendCapabilities(backend) {
  return QWEN_CAPABILITIES[backend] || null
}

export function qwenCapabilityMatrix() {
  return Object.entries(QWEN_CAPABILITIES).map(([backend, capability]) => ({
    backend,
    ...capability,
    emotionModes: [...capability.emotionModes],
  }))
}

export function qwenLicenseView() {
  return {
    license: QWEN_UPSTREAM.license,
    scope: QWEN_UPSTREAM.licenseScope,
    codeCommit: QWEN_UPSTREAM.codeCommit,
    packageVersion: QWEN_UPSTREAM.packageVersion,
    modelRevision: QWEN_UPSTREAM.baseModelRevision,
    privateMaterialCovered: false,
    dependenciesCovered: false,
    tokenizerCovered: false,
  }
}

/**
 * Complete static inventory required by the plan. Known fixed facts are returned as facts; anything
 * that can only be learned from a real installation/load is returned as null/UNKNOWN.
 */
export function qwenMetadataInventory() {
  return {
    code: {
      repository: QWEN_UPSTREAM.codeRepository,
      commit: QWEN_UPSTREAM.codeCommit,
      license: QWEN_UPSTREAM.license,
    },
    pythonPackage: {
      name: QWEN_UPSTREAM.packageName,
      version: QWEN_UPSTREAM.packageVersion,
      pythonRequires: QWEN_UPSTREAM.pythonRequires,
      installed: null,
      installedStatus: 'UNKNOWN',
    },
    baseModel: {
      id: QWEN_UPSTREAM.baseModel,
      revision: QWEN_UPSTREAM.baseModelRevision,
      license: QWEN_UPSTREAM.license,
      localAvailability: null,
      localAvailabilityStatus: 'UNKNOWN',
    },
    variants: Object.keys(QWEN_AUDITED_MODELS).map((id) => ({
      id,
      backend: QWEN_AUDITED_MODELS[id].backend,
      size: QWEN_AUDITED_MODELS[id].size,
      licenseStatus: 'UNKNOWN',
      localAvailabilityStatus: 'UNKNOWN',
    })),
    tokenizer: { ...QWEN_TOKENIZER },
    loadingBoundary: { ...QWEN_LOADING_BOUNDARY, offlineEnvironment: [...QWEN_LOADING_BOUNDARY.offlineEnvironment] },
    dependencies: QWEN_DEPENDENCIES.map((item) => ({ ...item })),
    unknown: [
      'per-dependency licences are not stated by the upstream pyproject',
      'tokenizer version/identity is only known after a real load',
      'local installation and weight availability are not verified by this batch',
      'private reference material rights are not verified by this batch',
      'the tokenizer/speech-tokenizer version is only known after a real load',
      'the real sub-loader chain was read statically but not executed in this batch',
    ],
  }
}

export function normalizeQwenBackend(value) {
  return BACKEND_VALUES.has(value) ? value : null
}

export function isAuditedQwenModel(value) {
  return typeof value === 'string' && AUDITED_MODEL_NAMES.has(value)
}

export function qwenModelBackend(value) {
  return isAuditedQwenModel(value) ? QWEN_AUDITED_MODELS[value].backend : null
}

export function qwenModelSize(value) {
  return isAuditedQwenModel(value) ? QWEN_AUDITED_MODELS[value].size : null
}

/** 0.6B CustomVoice has no instruction control in the fixed upstream code. */
export function qwenModelSupportsInstruct(value) {
  return isAuditedQwenModel(value) && QWEN_AUDITED_MODELS[value].size !== '0b6'
}

/** Preset voices for custom-voice; cloned bindings are resolved outside the browser. */
export function normalizeQwenVoice(voice, backend) {
  if (!voice || typeof voice !== 'object') return null
  const id = typeof voice.id === 'string' ? voice.id.trim() : ''
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) return null
  const name = typeof voice.name === 'string' && voice.name.trim() ? voice.name.trim().slice(0, 128) : id
  const languages = (Array.isArray(voice.languages) ? voice.languages : []).filter((item) => LANGUAGES.includes(item))
  if (backend === QWEN_BACKENDS.BASE_CLONE) {
    return { id, name, kind: 'cloned', languages: [...languages], referenceAudioRequired: true }
  }
  if (backend === QWEN_BACKENDS.VOICE_DESIGN) return null
  return { id, name, kind: 'preset', languages: [...languages], referenceAudioRequired: false }
}

function readLimits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const keys = Object.keys(input)
  if (keys.some((key) => !['maxChars', 'maxAudioSeconds', 'timeoutMs'].includes(key))) return null
  const maxChars = input.maxChars
  const maxAudioSeconds = input.maxAudioSeconds
  const timeoutMs = input.timeoutMs
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > QWEN_LIMITS.maxChars) return null
  if (!Number.isInteger(maxAudioSeconds) || maxAudioSeconds < 1 || maxAudioSeconds > QWEN_LIMITS.maxAudioSeconds) return null
  if (!Number.isInteger(timeoutMs) || timeoutMs < QWEN_LIMITS.minRequestTimeoutMs || timeoutMs > QWEN_LIMITS.maxRequestTimeoutMs) return null
  return { maxChars, maxAudioSeconds, timeoutMs }
}

/**
 * Build a provider-neutral manifest (schemaVersion 1) from a verified worker description.
 * Returns an error instead of inventing capabilities when the description is incomplete. Declared
 * worker limits are honoured as a cap (never raised to the batch defaults) and instruction support
 * follows the audited model size.
 */
export function buildQwenManifest(input = {}) {
  const backend = normalizeQwenBackend(input.backend)
  if (!backend) return { ok: false, code: QWEN_ERRORS.UNKNOWN_BACKEND }
  const capability = QWEN_CAPABILITIES[backend]
  const rawVoices = Array.isArray(input.voices) ? input.voices : []
  const voices = rawVoices.map((voice) => normalizeQwenVoice(voice, backend)).filter(Boolean)
  if (voices.length === 0) return { ok: false, code: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
  const languages = (Array.isArray(input.languages) ? input.languages : []).filter((item) => LANGUAGES.includes(item))
  if (languages.length === 0) return { ok: false, code: QWEN_ERRORS.DISCOVERY_INCOMPLETE }
  const limits = readLimits(input.limits)
  if (!limits) return { ok: false, code: QWEN_ERRORS.DISCOVERY_INCOMPLETE }
  const versionValue = typeof input.qwenTtsVersion === 'string' && input.qwenTtsVersion.trim() ? input.qwenTtsVersion.trim().slice(0, 64) : null
  const versionAudited = versionValue === QWEN_UPSTREAM.packageVersion
  if (!versionAudited) return { ok: false, code: QWEN_ERRORS.VERSION_MISMATCH }
  if (!isAuditedQwenModel(input.model)) return { ok: false, code: QWEN_ERRORS.MODEL_MISMATCH }
  if (qwenModelBackend(input.model) !== backend) return { ok: false, code: QWEN_ERRORS.MODEL_BACKEND_MISMATCH }
  const instructSupported = backend === QWEN_BACKENDS.CUSTOM_VOICE && qwenModelSupportsInstruct(input.model)
  const emotionSupported = capability.emotion && instructSupported
  const emotionModes = emotionSupported ? [...capability.emotionModes] : []
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      id: QWEN_PROVIDER_ID,
      name: 'Qwen3-TTS 本地服务（演示候选）',
      kind: 'LOCAL',
      version: {
        value: versionValue,
        source: `qwen-tts ${QWEN_UPSTREAM.packageVersion} @ ${QWEN_UPSTREAM.codeCommit.slice(0, 12)}`,
        audited: true,
      },
      capabilities: {
        languages,
        voices,
        clone: { supported: capability.clone, requiresReferenceAudio: capability.requiresReferenceAudio },
        emotion: { supported: emotionSupported, modes: emotionModes, defaultMode: 'neutral' },
        streaming: false,
        formats: [{ mime: QWEN_LIMITS.mime, sampleRate: QWEN_LIMITS.sampleRate, channels: QWEN_LIMITS.channels }],
        limits: { maxChars: limits.maxChars, timeoutMs: limits.timeoutMs, maxAudioSeconds: limits.maxAudioSeconds },
        retry: { maxAttempts: 0, idempotent: false, retryOn: [] },
        cancellation: true,
      },
      health: { mode: 'local', path: null, timeoutMs: QWEN_LIMITS.handshakeTimeoutMs, auth: 'none' },
      credentials: { required: false, storage: 'none', ref: null },
      network: { required: false, textUpload: false, endpointPolicy: 'loopback-only' },
      privacy: { textLeavesDevice: false, retention: 'none', note: '本机进程内合成；文本不离开本机，不写入日志、不读取私人素材。' },
      cost: { paid: false, model: 'free', note: '本机运行，无按次费用；模型与依赖的许可需单独确认。' },
      resources: { local: true, gpuRequired: true, cpuCapable: false },
    },
  }
}

/**
 * Internal modality guard. A request may carry exactly one of: a preset voice id, a trusted clone
 * reference binding, or a voice-design instruction. The public provider contract only exposes the
 * preset path; the other two require an explicit trusted binding supplied by Core.
 */
export function checkQwenModality(request, binding) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return { ok: false, code: QWEN_ERRORS.INVALID_INPUT }
  const hasPreset = typeof request.voiceId === 'string' && request.voiceId.length > 0
  const hasClone = Boolean(binding && binding.kind === 'clone')
  const hasDesign = Boolean(request.voicePrompt)
  const used = [hasPreset, hasClone, hasDesign].filter(Boolean).length
  if (used === 0) return { ok: false, code: QWEN_ERRORS.INVALID_INPUT }
  if (used > 1) return { ok: false, code: QWEN_ERRORS.MIXED_MODALITY }
  return { ok: true, modality: hasPreset ? 'preset' : hasClone ? 'clone' : 'design' }
}

export const QWEN_SUPPORTED_LANGUAGES = LANGUAGES
