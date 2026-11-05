/* Whale Voice — IndexTTS-2.5 local provider contract (Plan10 10-B, offline candidate).
 *
 * Fixed upstream metadata, clone/emotion capability matrix, languages, output format and the
 * provider-neutral manifest builder. Pure: no I/O, no process, no model load, no network, no
 * credential access. The fixed model/code licences are NOT Apache-2.0; see INDEX_TTS_LICENSE.
 */

export const INDEX_TTS_PROVIDER_ID = 'index-tts-local'
export const INDEX_TTS_BACKEND = 'clone-emotion'
export const INDEX_TTS_MODEL = 'IndexTTS-2.5'

/** Verified upstream references only. They do not prove a local install, weights or voice rights. */
export const INDEX_TTS_UPSTREAM = Object.freeze({
  codeRepository: 'https://github.com/index-tts/index-tts',
  codeCommit: 'd9e41aac89fd00b3d71497fddb287b7f24613712',
  packageName: 'indextts',
  packageVersion: '2.0.0',
  pythonRequires: '>=3.10,<3.12',
  model: 'IndexTeam/IndexTTS-2.5',
  modelRevision: 'c39ce5ba981572cb187443877ff559dfb246ce63',
  modelVersion: '2.5',
  modelCardUrl: 'https://huggingface.co/IndexTeam/IndexTTS-2.5/blob/c39ce5ba981572cb187443877ff559dfb246ce63/README.md',
  license: 'LicenseRef-Bilibili-IndexTTS',
  licenseName: 'bilibili模型使用许可协议',
  licenseUrl: 'https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/LICENSE_ZH.txt',
  licenseScope: 'The code/model licence is the bilibili model-use agreement, not Apache-2.0 or an unrestricted distribution licence. Commercial use above the stated MAU/revenue thresholds needs a separate commercial licence; private reference material and third-party dependencies are not covered. The Chinese text is authoritative.',
})

export const INDEX_TTS_LICENSE = Object.freeze({
  id: 'LicenseRef-Bilibili-IndexTTS',
  name: 'bilibili模型使用许可协议',
  url: INDEX_TTS_UPSTREAM.licenseUrl,
  codeCommit: INDEX_TTS_UPSTREAM.codeCommit,
  modelRevision: INDEX_TTS_UPSTREAM.modelRevision,
  apache2: false,
  unrestrictedRedistribution: false,
  commercialThreshold: 'previous-month MAU > 100,000,000 or previous-calendar-year revenue > CNY 100,000,000 requires a separate commercial licence',
  privateMaterialCovered: false,
  dependenciesCovered: false,
  modelWeightsCovered: true,
  chineseTextAuthoritative: true,
})

/** Model identity is additionally checked against config.yaml `version: 2.5` by the worker. */
export const INDEX_TTS_MODEL_IDENTITY = Object.freeze({
  id: INDEX_TTS_MODEL,
  backend: INDEX_TTS_BACKEND,
  modelVersion: INDEX_TTS_UPSTREAM.modelVersion,
  packageName: INDEX_TTS_UPSTREAM.packageName,
  packageVersion: INDEX_TTS_UPSTREAM.packageVersion,
  sampleRate: 22050,
})

/**
 * Dependency inventory from the fixed upstream pyproject. Enumerated, not installed. Upstream does
 * not declare a per-dependency licence, so each one stays UNKNOWN until separately audited.
 */
export const INDEX_TTS_DEPENDENCIES = Object.freeze([
  'accelerate==1.8.1', 'cn2an==0.5.22', 'cython==3.0.7', 'descript-audiotools==0.7.2',
  'einops>=0.8.1', 'ffmpeg-python==0.2.0', 'fugashi>=1.2.0', 'unidic-lite>=1.0.0',
  'g2p-en==2.1.0', 'jieba==0.42.1', 'json5==0.10.0', 'keras==2.9.0',
  'librosa==0.10.2.post1', 'matplotlib==3.10.0', 'modelscope==1.27.0', 'munch==4.0.0',
  'numba==0.63.0', 'numpy==2.2.6', 'omegaconf>=2.3.0', 'opencv-python==4.9.0.80',
  'pandas==2.3.2', 'safetensors==0.5.2', 'sentencepiece>=0.2.1', 'tensorboard==2.20.0',
  'textstat>=0.7.10', 'tokenizers==0.21.0', 'torch==2.8.*', 'torchaudio==2.8.*',
  'requests>=2.28', 'tqdm>=4.67.1', 'transformers==4.52.1', 'openai-whisper>=20231117',
  'wetext>=0.0.9 (non-linux)', 'WeTextProcessing (linux)',
].map((constraint) => Object.freeze({ constraint, licenseStatus: 'UNKNOWN' })))

export const INDEX_TTS_TOKENIZER = Object.freeze({
  name: 'IndexTTS multilingual tokenizer',
  loader: 'get_tokenizer(multilingual=True, model_dir=<snapshot>); Whisper/tiktoken vocabulary and tokenizer files are read from the local model directory',
  version: null,
  versionStatus: 'UNKNOWN',
  licenseStatus: 'UNKNOWN',
  evidence: 'static upstream reading at the fixed commit; not executed in this batch',
})

export const INDEX_TTS_LOADING_BOUNDARY = Object.freeze({
  modelSource: 'existing local directory inside an explicit allowed root only',
  snapshot: 'every regular model file is copied byte-for-byte to a private worker snapshot before the constructor runs',
  localFilesOnly: true,
  trustRemoteCode: false,
  offlineEnvironment: Object.freeze(['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'MODELSCOPE_OFFLINE']),
  networkGuard: 'in-process socket/urllib guard installed before the official import',
  auxiliaryModels: 'w2v-bert-2.0, semantic codec, CAMPPlus and BigVGAN must already exist under the local model tree; a missing auxiliary resource fails closed instead of calling ensure_models_available/download',
  referenceAudio: 'trusted local index entry only; bytes are copied to a private stable file at actual use',
})

export const INDEX_TTS_LANGUAGES = Object.freeze(['zh-CN', 'en-US', 'ja-JP', 'es-ES', 'ar-SA'])

export const INDEX_TTS_EMOTION_MODES = Object.freeze([
  'neutral', 'happy', 'angry', 'sad', 'afraid', 'disgusted', 'melancholic', 'surprised', 'calm',
])

/** Eight-float order from the fixed model card: [happy, angry, sad, afraid, disgusted, melancholic, surprised, calm]. */
export const INDEX_TTS_EMOTION_VECTORS = Object.freeze({
  neutral: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]),
  happy: Object.freeze([1, 0, 0, 0, 0, 0, 0, 0]),
  angry: Object.freeze([0, 1, 0, 0, 0, 0, 0, 0]),
  sad: Object.freeze([0, 0, 1, 0, 0, 0, 0, 0]),
  afraid: Object.freeze([0, 0, 0, 1, 0, 0, 0, 0]),
  disgusted: Object.freeze([0, 0, 0, 0, 1, 0, 0, 0]),
  melancholic: Object.freeze([0, 0, 0, 0, 0, 1, 0, 0]),
  surprised: Object.freeze([0, 0, 0, 0, 0, 0, 1, 0]),
  calm: Object.freeze([0, 0, 0, 0, 0, 0, 0, 1]),
})

export const INDEX_TTS_LIMITS = Object.freeze({
  maxChars: 200,
  maxAudioSeconds: 60,
  timeoutMs: 180000,
  maxRequestTimeoutMs: 600000,
  minRequestTimeoutMs: 100,
  handshakeTimeoutMs: 10000,
  cancelAckTimeoutMs: 3000,
  maxBytes: 4 * 1024 * 1024,
  sampleRate: 22050,
  channels: 1,
  mime: 'audio/wav',
})

export const INDEX_TTS_ERRORS = Object.freeze({
  INVALID_INPUT: 'INDEX_TTS_INVALID_INPUT',
  UNKNOWN_BACKEND: 'INDEX_TTS_UNKNOWN_BACKEND',
  CLONE_BINDING_REQUIRED: 'INDEX_TTS_CLONE_BINDING_REQUIRED',
  MIXED_MODALITY: 'INDEX_TTS_MIXED_MODALITY',
  UNSUPPORTED_MODALITY: 'INDEX_TTS_UNSUPPORTED_MODALITY',
  PROVIDER_NOT_READY: 'INDEX_TTS_PROVIDER_NOT_READY',
  UNRELATED_SERVICE: 'INDEX_TTS_UNRELATED_SERVICE',
  VERSION_MISMATCH: 'INDEX_TTS_VERSION_MISMATCH',
  WORKER_PROTOCOL_MISMATCH: 'INDEX_TTS_WORKER_PROTOCOL_MISMATCH',
  MODEL_MISMATCH: 'INDEX_TTS_MODEL_MISMATCH',
  MODEL_BACKEND_MISMATCH: 'INDEX_TTS_MODEL_BACKEND_MISMATCH',
  DISCOVERY_INCOMPLETE: 'INDEX_TTS_DISCOVERY_INCOMPLETE',
  DEPENDENCY_MISSING: 'INDEX_TTS_DEPENDENCY_MISSING',
  RESOURCE_UNVERIFIED: 'INDEX_TTS_RESOURCE_UNVERIFIED',
  OUTPUT_INVALID: 'INDEX_TTS_OUTPUT_INVALID',
  OUTPUT_FORMAT_MISMATCH: 'INDEX_TTS_OUTPUT_FORMAT_MISMATCH',
  OUTPUT_TOO_LARGE: 'INDEX_TTS_OUTPUT_TOO_LARGE',
  OUTPUT_IDENTITY_MISMATCH: 'INDEX_TTS_OUTPUT_IDENTITY_MISMATCH',
  RESPONSE_IDENTITY_MISMATCH: 'INDEX_TTS_RESPONSE_IDENTITY_MISMATCH',
  CANCEL_NOT_CONFIRMED: 'INDEX_TTS_CANCEL_NOT_CONFIRMED',
  NETWORK_BLOCKED: 'INDEX_TTS_NETWORK_BLOCKED',
  RESOURCE_CHANGED: 'INDEX_TTS_RESOURCE_CHANGED',
  WORKER_NOT_CONFIGURED: 'INDEX_TTS_WORKER_NOT_CONFIGURED',
  WORKER_UNAVAILABLE: 'INDEX_TTS_WORKER_UNAVAILABLE',
  TIMEOUT: 'INDEX_TTS_TIMEOUT',
  CANCELLED: 'INDEX_TTS_CANCELLED',
  UNKNOWN_RESULT: 'INDEX_TTS_UNKNOWN_RESULT',
  PROTOCOL_INVALID: 'INDEX_TTS_PROTOCOL_INVALID',
  RESPONSE_TYPE_MISMATCH: 'INDEX_TTS_RESPONSE_TYPE_MISMATCH',
  STOPPING: 'INDEX_TTS_STOPPING',
  UNRESOLVED_ACTIVITY: 'INDEX_TTS_UNRESOLVED_ACTIVITY',
  EXIT_UNCONFIRMED: 'INDEX_TTS_EXIT_UNCONFIRMED',
  CLEANUP_INCOMPLETE: 'INDEX_TTS_CLEANUP_INCOMPLETE',
  UNKNOWN_REQUEST: 'INDEX_TTS_UNKNOWN_REQUEST',
})

export function indexBackendCapabilities() {
  return {
    label: 'IndexTTS-2.5 零样本克隆 + 情绪控制',
    presetVoices: false,
    clone: true,
    requiresReferenceAudio: true,
    voiceDesign: false,
    emotion: true,
    emotionModes: [...INDEX_TTS_EMOTION_MODES],
    publicRequest: true,
  }
}

export function indexCapabilityMatrix() {
  return [{ backend: INDEX_TTS_BACKEND, ...indexBackendCapabilities() }]
}

export function indexLicenseView() {
  return { ...INDEX_TTS_LICENSE }
}

/** Full static inventory; installation/weights/tokenizer identity stay explicitly UNKNOWN. */
export function indexMetadataInventory() {
  return {
    code: {
      repository: INDEX_TTS_UPSTREAM.codeRepository,
      commit: INDEX_TTS_UPSTREAM.codeCommit,
      license: INDEX_TTS_UPSTREAM.license,
      licenseUrl: INDEX_TTS_UPSTREAM.licenseUrl,
    },
    pythonPackage: {
      name: INDEX_TTS_UPSTREAM.packageName,
      version: INDEX_TTS_UPSTREAM.packageVersion,
      pythonRequires: INDEX_TTS_UPSTREAM.pythonRequires,
      installed: null,
      installedStatus: 'UNKNOWN',
    },
    model: {
      id: INDEX_TTS_UPSTREAM.model,
      revision: INDEX_TTS_UPSTREAM.modelRevision,
      version: INDEX_TTS_UPSTREAM.modelVersion,
      license: INDEX_TTS_UPSTREAM.license,
      licenseStatus: 'KNOWN',
      localAvailability: null,
      localAvailabilityStatus: 'UNKNOWN',
    },
    tokenizer: { ...INDEX_TTS_TOKENIZER },
    loadingBoundary: { ...INDEX_TTS_LOADING_BOUNDARY, offlineEnvironment: [...INDEX_TTS_LOADING_BOUNDARY.offlineEnvironment] },
    dependencies: INDEX_TTS_DEPENDENCIES.map((item) => ({ ...item })),
    unknown: [
      'per-dependency licences are not stated by the upstream pyproject',
      'tokenizer identity/version is only known after a real load',
      'local installation/weight availability is not verified by this batch',
      'private reference audio/cloned voice rights are not verified',
      'the 2.5 interface is declared by infer_v2_5.IndexTTS2 even though the package version is still 2.0.0',
      'the real loader/evaluator was read statically but not executed in this batch',
    ],
  }
}

export function normalizeIndexBackend(value) {
  return value === INDEX_TTS_BACKEND ? value : null
}

export function isIndexModel(value) {
  return value === INDEX_TTS_MODEL
}

export function isIndexLanguage(value) {
  return INDEX_TTS_LANGUAGES.includes(value)
}

export function indexLanguageCode(value) {
  return {
    'zh-CN': 'ZH', 'en-US': 'EN', 'ja-JP': 'JA', 'es-ES': 'ES', 'ar-SA': 'AR',
  }[value] || null
}

export function normalizeIndexEmotion(value) {
  if (value === undefined || value === null || value === '') return 'neutral'
  return INDEX_TTS_EMOTION_MODES.includes(value) ? value : null
}

export function indexEmotionVector(mode) {
  const normalized = normalizeIndexEmotion(mode)
  return normalized ? [...INDEX_TTS_EMOTION_VECTORS[normalized]] : null
}

function readLimits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const keys = Object.keys(input)
  if (keys.some((key) => !['maxChars', 'maxAudioSeconds', 'timeoutMs'].includes(key))) return null
  const { maxChars, maxAudioSeconds, timeoutMs } = input
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > INDEX_TTS_LIMITS.maxChars) return null
  if (!Number.isInteger(maxAudioSeconds) || maxAudioSeconds < 1 || maxAudioSeconds > INDEX_TTS_LIMITS.maxAudioSeconds) return null
  if (!Number.isInteger(timeoutMs) || timeoutMs < INDEX_TTS_LIMITS.minRequestTimeoutMs || timeoutMs > INDEX_TTS_LIMITS.maxRequestTimeoutMs) return null
  return { maxChars, maxAudioSeconds, timeoutMs }
}

function normalizeVoice(voice) {
  if (!voice || typeof voice !== 'object') return null
  const id = typeof voice.id === 'string' ? voice.id.trim() : ''
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) return null
  const name = typeof voice.name === 'string' && voice.name.trim() ? voice.name.trim().slice(0, 128) : id
  const declared = Array.isArray(voice.languages) ? voice.languages.filter(isIndexLanguage) : []
  return { id, name, kind: 'cloned', languages: declared, referenceAudioRequired: true }
}

export function buildIndexManifest(input = {}) {
  const backend = normalizeIndexBackend(input.backend)
  if (!backend) return { ok: false, code: INDEX_TTS_ERRORS.UNKNOWN_BACKEND }
  const voices = (Array.isArray(input.voices) ? input.voices : []).map(normalizeVoice).filter(Boolean)
  if (voices.length === 0) return { ok: false, code: INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED }
  const languages = (Array.isArray(input.languages) ? input.languages : []).filter(isIndexLanguage)
  if (languages.length === 0) return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  const limits = readLimits(input.limits)
  if (!limits) return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  const versionValue = typeof input.indexTtsVersion === 'string' && input.indexTtsVersion.trim()
    ? input.indexTtsVersion.trim().slice(0, 64) : null
  if (versionValue !== INDEX_TTS_UPSTREAM.packageVersion) return { ok: false, code: INDEX_TTS_ERRORS.VERSION_MISMATCH }
  if (!isIndexModel(input.model)) return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH }
  if (input.modelVersion !== INDEX_TTS_UPSTREAM.modelVersion) return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH }
  if (typeof input.qwenEmoAvailable !== 'boolean') return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  const capability = indexBackendCapabilities()
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      id: INDEX_TTS_PROVIDER_ID,
      name: 'IndexTTS-2.5 本地服务（演示候选）',
      kind: 'LOCAL',
      version: {
        value: versionValue,
        source: `indextts ${INDEX_TTS_UPSTREAM.packageVersion} / IndexTTS-2.5 @ ${INDEX_TTS_UPSTREAM.codeCommit.slice(0, 12)}`,
        audited: true,
      },
      capabilities: {
        languages,
        voices,
        clone: { supported: true, requiresReferenceAudio: true },
        emotion: {
          supported: true,
          modes: [...INDEX_TTS_EMOTION_MODES],
          defaultMode: 'neutral',
          textSupported: input.qwenEmoAvailable === true,
        },
        streaming: false,
        formats: [{ mime: INDEX_TTS_LIMITS.mime, sampleRate: INDEX_TTS_LIMITS.sampleRate, channels: INDEX_TTS_LIMITS.channels }],
        limits: { maxChars: limits.maxChars, timeoutMs: limits.timeoutMs, maxAudioSeconds: limits.maxAudioSeconds },
        retry: { maxAttempts: 0, idempotent: false, retryOn: [] },
        cancellation: true,
      },
      health: { mode: 'local', path: null, timeoutMs: INDEX_TTS_LIMITS.handshakeTimeoutMs, auth: 'none' },
      credentials: { required: false, storage: 'none', ref: null },
      network: { required: false, textUpload: false, endpointPolicy: 'loopback-only' },
      privacy: { textLeavesDevice: false, retention: 'none', note: '本机进程内合成；文本不离开本机，不写入日志、不读取私人素材。' },
      cost: { paid: false, model: 'free', note: '本机运行，无按次费用；bilibili 模型协议与依赖许可需单独确认。' },
      resources: { local: true, gpuRequired: true, cpuCapable: false },
    },
  }
}

/** Clone-only modality guard. Preset voice and voice-design requests are rejected, never mixed. */
export function checkIndexModality(request, binding) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return { ok: false, code: INDEX_TTS_ERRORS.INVALID_INPUT }
  const hasPreset = typeof request.voiceId === 'string' && request.voiceId.length > 0
  const hasClone = Boolean(binding && binding.kind === 'clone')
  const hasDesign = Boolean(request.voicePrompt)
  if (hasPreset && hasClone) return { ok: false, code: INDEX_TTS_ERRORS.MIXED_MODALITY }
  if (hasDesign) return { ok: false, code: INDEX_TTS_ERRORS.UNSUPPORTED_MODALITY }
  if (!hasClone) return { ok: false, code: INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED }
  return { ok: true, modality: 'clone' }
}
