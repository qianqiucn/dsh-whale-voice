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
  PROVIDER_NOT_READY: 'QWEN_PROVIDER_NOT_READY',
  UNRELATED_SERVICE: 'QWEN_UNRELATED_SERVICE',
  VERSION_MISMATCH: 'QWEN_VERSION_MISMATCH',
  MODEL_MISMATCH: 'QWEN_MODEL_MISMATCH',
  OUTPUT_INVALID: 'QWEN_OUTPUT_INVALID',
  OUTPUT_FORMAT_MISMATCH: 'QWEN_OUTPUT_FORMAT_MISMATCH',
  OUTPUT_TOO_LARGE: 'QWEN_OUTPUT_TOO_LARGE',
  WORKER_NOT_CONFIGURED: 'QWEN_WORKER_NOT_CONFIGURED',
  WORKER_UNAVAILABLE: 'QWEN_WORKER_UNAVAILABLE',
  TIMEOUT: 'QWEN_TIMEOUT',
  CANCELLED: 'QWEN_CANCELLED',
  UNKNOWN_RESULT: 'QWEN_UNKNOWN_RESULT',
  PROTOCOL_INVALID: 'QWEN_PROTOCOL_INVALID',
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
  }
}

export function normalizeQwenBackend(value) {
  return BACKEND_VALUES.has(value) ? value : null
}

/** Preset voices for custom-voice; cloned bindings are resolved outside the browser. */
export function normalizeQwenVoice(voice, backend) {
  if (!voice || typeof voice !== 'object') return null
  const id = typeof voice.id === 'string' ? voice.id.trim() : ''
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) return null
  const name = typeof voice.name === 'string' && voice.name.trim() ? voice.name.trim().slice(0, 128) : id
  if (backend === QWEN_BACKENDS.BASE_CLONE) {
    return { id, name, kind: 'cloned', languages: [...(Array.isArray(voice.languages) ? voice.languages : [])], referenceAudioRequired: true }
  }
  if (backend === QWEN_BACKENDS.VOICE_DESIGN) return null
  return { id, name, kind: 'preset', languages: [...(Array.isArray(voice.languages) ? voice.languages : [])], referenceAudioRequired: false }
}

/**
 * Build a provider-neutral manifest (schemaVersion 1) from a verified worker description.
 * Returns an error instead of inventing capabilities when the description is incomplete.
 */
export function buildQwenManifest(input = {}) {
  const backend = normalizeQwenBackend(input.backend)
  if (!backend) return { ok: false, code: QWEN_ERRORS.UNKNOWN_BACKEND }
  const capability = QWEN_CAPABILITIES[backend]
  const rawVoices = Array.isArray(input.voices) ? input.voices : []
  const voices = rawVoices.map((voice) => normalizeQwenVoice(voice, backend)).filter(Boolean)
  if (voices.length === 0) return { ok: false, code: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
  const languages = (Array.isArray(input.languages) ? input.languages : LANGUAGES).filter((item) => LANGUAGES.includes(item))
  if (languages.length === 0) return { ok: false, code: QWEN_ERRORS.UNKNOWN_BACKEND }
  const versionValue = typeof input.qwenTtsVersion === 'string' && input.qwenTtsVersion.trim() ? input.qwenTtsVersion.trim().slice(0, 64) : null
  const versionAudited = versionValue === QWEN_UPSTREAM.packageVersion
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
        audited: versionAudited,
      },
      capabilities: {
        languages,
        voices,
        clone: { supported: capability.clone, requiresReferenceAudio: capability.requiresReferenceAudio },
        emotion: { supported: capability.emotion, modes: capability.emotion ? [...capability.emotionModes] : [], defaultMode: 'neutral' },
        streaming: false,
        formats: [{ mime: QWEN_LIMITS.mime, sampleRate: QWEN_LIMITS.sampleRate, channels: QWEN_LIMITS.channels }],
        limits: { maxChars: QWEN_LIMITS.maxChars, timeoutMs: QWEN_LIMITS.timeoutMs, maxAudioSeconds: QWEN_LIMITS.maxAudioSeconds },
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
  if (!request || typeof request !== 'object') return { ok: false, code: QWEN_ERRORS.INVALID_INPUT }
  const hasPreset = typeof request.voiceId === 'string' && request.voiceId.length > 0
  const hasClone = Boolean(binding && binding.kind === 'clone')
  const hasDesign = Boolean(request.voicePrompt)
  const used = [hasPreset, hasClone, hasDesign].filter(Boolean).length
  if (used === 0) return { ok: false, code: QWEN_ERRORS.INVALID_INPUT }
  if (used > 1) return { ok: false, code: QWEN_ERRORS.MIXED_MODALITY }
  return { ok: true, modality: hasPreset ? 'preset' : hasClone ? 'clone' : 'design' }
}

export const QWEN_SUPPORTED_LANGUAGES = LANGUAGES
