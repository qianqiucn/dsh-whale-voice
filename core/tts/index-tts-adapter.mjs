/* Whale Voice — IndexTTS-2.5 provider adapter (Plan10 10-B, offline candidate).
 *
 * Wraps one explicitly started Index worker through the narrow protocol and maps it onto the
 * provider-neutral contract. Honest failure only: no implicit start, no model load at import, no
 * network fallback, no retry, no invented availability, no persisted artifact. The provider never
 * creates a Task, Artifact or delivery itself.
 */

import { inspectFixtureWavBytes } from '../audio/wav-byte-inspector.mjs'
import {
  PROVIDER_ERRORS,
  checkSynthesisRequest,
  evaluateProviderStatus,
  normalizeSynthesisResult,
} from './provider-contract.mjs'
import {
  INDEX_TTS_BACKEND,
  INDEX_TTS_ERRORS,
  INDEX_TTS_LANGUAGES,
  INDEX_TTS_LIMITS,
  INDEX_TTS_MODEL,
  INDEX_TTS_PROVIDER_ID,
  INDEX_TTS_UPSTREAM,
  buildIndexManifest,
  checkIndexModality,
  indexBackendCapabilities,
  indexLanguageCode,
  indexLicenseView,
  indexMetadataInventory,
  indexEmotionVector,
  isIndexLanguage,
  isIndexModel,
  normalizeIndexBackend,
  normalizeIndexEmotion,
} from './index-tts-contract.mjs'

const PROVIDER_CODE_BY_INDEX = Object.freeze({
  [INDEX_TTS_ERRORS.TIMEOUT]: PROVIDER_ERRORS.TIMEOUT,
  [INDEX_TTS_ERRORS.CANCELLED]: PROVIDER_ERRORS.CANCELLED,
  [INDEX_TTS_ERRORS.WORKER_UNAVAILABLE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.WORKER_NOT_CONFIGURED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.PROVIDER_NOT_READY]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.PROTOCOL_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [INDEX_TTS_ERRORS.RESPONSE_TYPE_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [INDEX_TTS_ERRORS.OUTPUT_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH]: PROVIDER_ERRORS.UNSUPPORTED_FORMAT,
  [INDEX_TTS_ERRORS.OUTPUT_TOO_LARGE]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [INDEX_TTS_ERRORS.OUTPUT_IDENTITY_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [INDEX_TTS_ERRORS.RESPONSE_IDENTITY_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [INDEX_TTS_ERRORS.CANCEL_NOT_CONFIRMED]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [INDEX_TTS_ERRORS.NETWORK_BLOCKED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.RESOURCE_CHANGED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.UNRELATED_SERVICE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.VERSION_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.WORKER_PROTOCOL_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.MODEL_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.MODEL_BACKEND_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.DEPENDENCY_MISSING]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.RESOURCE_UNVERIFIED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.MIXED_MODALITY]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [INDEX_TTS_ERRORS.UNSUPPORTED_MODALITY]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [INDEX_TTS_ERRORS.UNKNOWN_RESULT]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [INDEX_TTS_ERRORS.STOPPING]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.UNRESOLVED_ACTIVITY]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.EXIT_UNCONFIRMED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [INDEX_TTS_ERRORS.CLEANUP_INCOMPLETE]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [INDEX_TTS_ERRORS.UNKNOWN_REQUEST]: PROVIDER_ERRORS.INVALID_RESPONSE,
})

export function providerCodeForIndexCode(code) {
  return PROVIDER_CODE_BY_INDEX[code] || PROVIDER_ERRORS.PROVIDER_ERROR
}

export function classifyIndexHealth({
  ready = null,
  health = null,
  expectedModel = null,
} = {}) {
  if (!ready) return { state: 'offline', code: INDEX_TTS_ERRORS.WORKER_UNAVAILABLE, model: null, backend: null }
  if (ready.provider !== INDEX_TTS_PROVIDER_ID) return { state: 'error', code: INDEX_TTS_ERRORS.UNRELATED_SERVICE, model: null, backend: null }
  const backend = normalizeIndexBackend(ready.backend)
  if (!backend) return { state: 'error', code: INDEX_TTS_ERRORS.UNKNOWN_BACKEND, model: ready.model || null, backend: null }
  if (ready.workerProtocol !== 1) return { state: 'error', code: INDEX_TTS_ERRORS.WORKER_PROTOCOL_MISMATCH, model: ready.model || null, backend }
  if (!isIndexModel(ready.model)) return { state: 'error', code: INDEX_TTS_ERRORS.MODEL_MISMATCH, model: ready.model || null, backend }
  if (expectedModel && ready.model !== expectedModel) return { state: 'error', code: INDEX_TTS_ERRORS.MODEL_MISMATCH, model: ready.model, backend }
  if (ready.modelVersion !== INDEX_TTS_UPSTREAM.modelVersion) {
    return { state: 'error', code: INDEX_TTS_ERRORS.MODEL_MISMATCH, model: ready.model, backend }
  }
  const version = typeof ready.indexTtsVersion === 'string' ? ready.indexTtsVersion : null
  if (version !== INDEX_TTS_UPSTREAM.packageVersion) {
    return { state: 'degraded', code: INDEX_TTS_ERRORS.VERSION_MISMATCH, model: ready.model, backend, version }
  }
  if (typeof ready.qwenEmoAvailable !== 'boolean') {
    return { state: 'degraded', code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE, model: ready.model, backend, version }
  }
  if (!health) return { state: 'unknown', code: null, model: ready.model, backend, version }
  if (health.state !== 'ok') {
    return { state: health.state === 'offline' ? 'offline' : 'degraded', code: null, model: ready.model, backend, version }
  }
  if (health.model && health.model !== ready.model) {
    return { state: 'degraded', code: INDEX_TTS_ERRORS.MODEL_MISMATCH, model: health.model, backend, version }
  }
  if (health.backend && health.backend !== backend) {
    return { state: 'degraded', code: INDEX_TTS_ERRORS.MODEL_BACKEND_MISMATCH, model: ready.model, backend, version }
  }
  return { state: 'ok', code: null, model: ready.model, backend, version }
}

export function indexObservation(classification, observedAt) {
  return {
    state: classification.state,
    reason: classification.code || null,
    model: classification.model || null,
    observedAt: observedAt || null,
  }
}

function readDiscoveryLimits(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { maxChars, maxAudioSeconds, timeoutMs } = raw
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > INDEX_TTS_LIMITS.maxChars) return null
  if (!Number.isInteger(maxAudioSeconds) || maxAudioSeconds < 1 || maxAudioSeconds > INDEX_TTS_LIMITS.maxAudioSeconds) return null
  if (!Number.isInteger(timeoutMs) || timeoutMs < INDEX_TTS_LIMITS.minRequestTimeoutMs) return null
  return {
    maxChars,
    maxAudioSeconds,
    timeoutMs: Math.min(timeoutMs, INDEX_TTS_LIMITS.maxRequestTimeoutMs),
  }
}

export function normalizeIndexDiscovery({ ready = null, discovery = null, bindings = [] } = {}) {
  if (!ready || !normalizeIndexBackend(ready.backend)) return { ok: false, code: INDEX_TTS_ERRORS.UNKNOWN_BACKEND }
  const backend = ready.backend
  const model = ready.model
  if (!isIndexModel(model)) return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH }
  if (ready.modelVersion !== INDEX_TTS_UPSTREAM.modelVersion) return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH }
  if (typeof ready.qwenEmoAvailable !== 'boolean') return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  const declaredModels = discovery && Array.isArray(discovery.models) ? discovery.models : null
  if (!declaredModels || declaredModels.length === 0) return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  if (!declaredModels.every((item) => isIndexModel(item))) return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH }
  if (!declaredModels.includes(model)) return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH }
  if (discovery.model !== undefined && discovery.model !== model) return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH }
  if (discovery.backend !== undefined && discovery.backend !== backend) {
    return { ok: false, code: INDEX_TTS_ERRORS.MODEL_BACKEND_MISMATCH }
  }
  const declaredLanguages = discovery && Array.isArray(discovery.languages) ? discovery.languages : null
  if (!declaredLanguages || declaredLanguages.length === 0) return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  if (!declaredLanguages.every(isIndexLanguage)) return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  const limits = readDiscoveryLimits(discovery && discovery.limits)
  if (!limits) return { ok: false, code: INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE }
  const voices = []
  const bindingIndex = Object.create(null)
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    if (!binding || binding.kind !== 'clone') continue
    if (typeof binding.voiceId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(binding.voiceId)) continue
    if (typeof binding.referenceRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/.test(binding.referenceRef)) continue
    if (bindingIndex[binding.voiceId]) continue
    bindingIndex[binding.voiceId] = { referenceRef: binding.referenceRef }
    const declaredVoiceLanguages = Array.isArray(binding.languages)
      ? binding.languages.filter(isIndexLanguage)
      : []
    const languages = declaredVoiceLanguages.length > 0
      ? declaredVoiceLanguages.filter((item) => declaredLanguages.includes(item))
      : [...declaredLanguages]
    if (declaredVoiceLanguages.length > 0 && languages.length === 0) continue
    voices.push({ id: binding.voiceId, name: binding.name || binding.voiceId, kind: 'cloned', languages, referenceAudioRequired: true })
  }
  if (voices.length === 0) return { ok: false, code: INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED }
  return {
    ok: true,
    backend,
    model,
    modelVersion: ready.modelVersion,
    qwenEmoAvailable: ready.qwenEmoAvailable,
    versions: { worker: ready.workerVersion || null, indexTts: ready.indexTtsVersion || null },
    voices,
    languages: [...declaredLanguages],
    models: [...declaredModels],
    limits,
    bindingIndex,
  }
}

function decodeBase64Bytes(value) {
  if (typeof value !== 'string' || value.length === 0) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_INVALID }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_INVALID }
  const buffer = Buffer.from(value, 'base64')
  if (buffer.length === 0) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_INVALID }
  return { ok: true, bytes: new Uint8Array(buffer) }
}

export function validateIndexOutput({
  payload,
  manifest = null,
  requestId,
  voiceId,
  model,
  backend,
  language,
  emotion,
  createdAt = null,
  maxBytes = INDEX_TTS_LIMITS.maxBytes,
  maxAudioSeconds = INDEX_TTS_LIMITS.maxAudioSeconds,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_INVALID }
  if (payload.requestId !== requestId) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'requestId' }
  if (payload.model !== model) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'model' }
  if (payload.backend !== backend) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'backend' }
  if (payload.voiceId !== voiceId) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'voiceId' }
  if (payload.state === 'cancelled') return { ok: false, code: INDEX_TTS_ERRORS.CANCELLED, cancelled: true, terminal: 'CANCELLED' }
  if (payload.state === 'unknown') return { ok: false, code: INDEX_TTS_ERRORS.UNKNOWN_RESULT, unknown: true, terminal: 'UNKNOWN' }
  if (payload.state !== 'ok') return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_INVALID }
  const decoded = decodeBase64Bytes(payload.bytesBase64)
  if (!decoded.ok) return decoded
  if (decoded.bytes.byteLength > maxBytes) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_TOO_LARGE }
  const inspection = inspectFixtureWavBytes({ schemaVersion: 1, bytes: decoded.bytes })
  if (!inspection.ok) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_INVALID, detail: inspection.code }
  const value = inspection.value
  const mime = value.format === 'WAV' && value.codec === 'PCM_S16LE' ? 'audio/wav' : null
  const durationMs = Math.round(value.durationMs)
  if (!mime) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (value.sampleRate !== INDEX_TTS_LIMITS.sampleRate || value.channels !== INDEX_TTS_LIMITS.channels) {
    return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH }
  }
  if (durationMs > maxAudioSeconds * 1000) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_TOO_LARGE }
  if (payload.sampleRate !== undefined && payload.sampleRate !== value.sampleRate) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.channels !== undefined && payload.channels !== value.channels) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.mime !== undefined && payload.mime !== mime) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.durationMs !== undefined && payload.durationMs !== durationMs) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH }
  const artifactRef = 'indextts-bytes:' + value.sha256.slice(0, 32)
  const resultManifest = manifest || {
    id: INDEX_TTS_PROVIDER_ID,
    capabilities: {
      languages: [language],
      voices: [{ id: voiceId, name: voiceId, kind: 'cloned' }],
      formats: [{ mime: INDEX_TTS_LIMITS.mime, sampleRate: INDEX_TTS_LIMITS.sampleRate, channels: INDEX_TTS_LIMITS.channels }],
      emotion: { supported: true, modes: [emotion], defaultMode: 'neutral' },
    },
  }
  const normalized = normalizeSynthesisResult(resultManifest, {
    requestId,
    voiceId,
    language,
    emotion,
    artifactRef,
    mime,
    sampleRate: value.sampleRate,
    channels: value.channels,
    durationMs,
    createdAt,
    warnings: ['NOT_PERSISTED'],
  })
  if (!normalized.ok) return { ok: false, code: INDEX_TTS_ERRORS.OUTPUT_INVALID }
  return { ok: true, bytes: decoded.bytes, inspection: { ...value, mime, durationMs }, result: normalized.result }
}

function validRequestTimeout(value) {
  if (value === undefined) return { ok: true, value: INDEX_TTS_LIMITS.timeoutMs }
  if (!Number.isInteger(value) || value < INDEX_TTS_LIMITS.minRequestTimeoutMs || value > INDEX_TTS_LIMITS.maxRequestTimeoutMs) {
    return { ok: false, code: INDEX_TTS_ERRORS.INVALID_INPUT }
  }
  return { ok: true, value }
}

function normalizeVector(value) {
  if (value === undefined) return { ok: true, value: null }
  if (!Array.isArray(value) || value.length !== 8) return { ok: false, code: INDEX_TTS_ERRORS.INVALID_INPUT }
  const vector = value.map((item) => (typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1.2 ? item : NaN))
  if (vector.some((item) => Number.isNaN(item))) return { ok: false, code: INDEX_TTS_ERRORS.INVALID_INPUT }
  return { ok: true, value: vector }
}

/**
 * Create the IndexTTS provider around an explicitly started supervisor. Nothing starts at creation.
 */
export function createIndexTtsProvider(options = {}) {
  const supervisor = options.supervisor
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const timeout = validRequestTimeout(options.requestTimeoutMs)
  if (!timeout.ok) return { ok: false, code: timeout.code, detail: 'requestTimeoutMs must be an integer within the finite bounds' }
  const requestTimeoutMs = timeout.value
  const bindingResolver = typeof options.bindingResolver === 'function' ? options.bindingResolver : null
  const modelIdentity = typeof options.modelIdentity === 'string' ? options.modelIdentity : null
  if (modelIdentity !== null && !isIndexModel(modelIdentity)) {
    return { ok: false, code: INDEX_TTS_ERRORS.MODEL_MISMATCH, detail: 'modelIdentity must be IndexTTS-2.5' }
  }
  const taskAuthority = typeof options.taskAuthority === 'function' ? options.taskAuthority : null
  let manifest = null
  let discovery = null
  let classification = null
  let sequence = 0

  if (!supervisor || typeof supervisor.start !== 'function') {
    return { ok: false, code: INDEX_TTS_ERRORS.WORKER_NOT_CONFIGURED }
  }

  function observation(observedAt) {
    return indexObservation(classification || { state: 'unknown', model: null }, observedAt || now())
  }

  async function start() {
    const started = await supervisor.start()
    if (!started.ok) {
      classification = { state: 'offline', code: started.code, model: null, backend: null }
      return { ok: false, code: providerCodeForIndexCode(started.code), indexCode: started.code, detail: started.detail || '' }
    }
    const abort = async (result) => {
      const stopped = await supervisor.stop().catch(() => ({ ok: false, code: INDEX_TTS_ERRORS.EXIT_UNCONFIRMED }))
      return { ...result, shutdown: stopped.ok ? { ok: true } : { ok: false, code: stopped.code } }
    }
    const ready = started.ready
    const health = await supervisor.health({ timeoutMs: INDEX_TTS_LIMITS.handshakeTimeoutMs })
    classification = classifyIndexHealth({
      ready,
      health: health.ok ? { state: health.state, ...health.payload } : null,
      expectedModel: modelIdentity,
    })
    if (classification.state !== 'ok') {
      const code = classification.code ? providerCodeForIndexCode(classification.code) : PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE
      return abort({ ok: false, code, indexCode: classification.code || null, classification })
    }
    const discovered = await supervisor.discover({ timeoutMs: INDEX_TTS_LIMITS.handshakeTimeoutMs })
    if (!discovered.ok) return abort({ ok: false, code: providerCodeForIndexCode(discovered.code), indexCode: discovered.code })
    discovery = normalizeIndexDiscovery({ ready, discovery: discovered.payload, bindings: options.bindings || [] })
    if (!discovery.ok) {
      classification = { state: 'degraded', code: discovery.code, model: ready.model, backend: ready.backend }
      return abort({ ok: false, code: providerCodeForIndexCode(discovery.code), indexCode: discovery.code })
    }
    const built = buildIndexManifest({
      backend: discovery.backend,
      model: discovery.model,
      modelVersion: discovery.modelVersion,
      voices: discovery.voices,
      languages: discovery.languages,
      limits: discovery.limits,
      indexTtsVersion: ready.indexTtsVersion,
      qwenEmoAvailable: discovery.qwenEmoAvailable,
    })
    if (!built.ok) return abort({ ok: false, code: providerCodeForIndexCode(built.code), indexCode: built.code })
    manifest = built.manifest
    return {
      ok: true,
      manifest: { ...manifest },
      discovery: {
        backend: discovery.backend,
        model: discovery.model,
        voices: discovery.voices.map((voice) => ({ ...voice })),
        languages: [...discovery.languages],
        limits: { ...discovery.limits },
      },
    }
  }

  async function health() {
    if (!manifest) return { ok: false, code: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE, state: 'offline' }
    const answer = await supervisor.health({ timeoutMs: INDEX_TTS_LIMITS.handshakeTimeoutMs })
    classification = classifyIndexHealth({
      ready: supervisor.state().ready,
      health: answer.ok ? { state: answer.state, ...answer.payload } : null,
      expectedModel: modelIdentity,
    })
    const status = evaluateProviderStatus(manifest, observation())
    return { ok: true, status, observation: observation(), worker: supervisor.state() }
  }

  function resolveVoice(request, context) {
    if (!discovery) return { ok: false, code: INDEX_TTS_ERRORS.PROVIDER_NOT_READY }
    if (discovery.backend !== INDEX_TTS_BACKEND) return { ok: false, code: INDEX_TTS_ERRORS.UNSUPPORTED_MODALITY }
    const binding = context.binding
    const voiceId = binding && typeof binding.voiceId === 'string' ? binding.voiceId : null
    const registered = voiceId && discovery.bindingIndex ? discovery.bindingIndex[voiceId] : null
    if (!registered) return { ok: false, code: INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED }
    if (!bindingResolver) return { ok: false, code: INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED }
    const resolved = bindingResolver(binding)
    if (!resolved || typeof resolved.referenceRef !== 'string') return { ok: false, code: INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED }
    if (resolved.referenceRef !== registered.referenceRef) return { ok: false, code: INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED }
    return { ok: true, voiceId, referenceRef: registered.referenceRef }
  }

  async function beginSynthesis(request, context = {}) {
    if (!manifest) return { ok: false, code: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE }
    const taskId = context.taskId
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/.test(taskId)) {
      return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'a Task id issued by the existing authority is required' }
    }
    if (taskAuthority) {
      let confirmation
      try {
        confirmation = await taskAuthority(taskId)
      } catch {
        confirmation = null
      }
      if (!confirmation || confirmation.ok !== true) {
        return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'the existing Task authority did not confirm this Task id' }
      }
      if (confirmation.state !== undefined && !['CREATED', 'PROCESSING'].includes(confirmation.state)) {
        return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'the Task is not in an issuing state' }
      }
    }
    const modality = checkIndexModality(request, context.binding)
    if (!modality.ok) return { ok: false, code: providerCodeForIndexCode(modality.code), indexCode: modality.code }
    const voice = resolveVoice(request, context)
    if (!voice.ok) return { ok: false, code: providerCodeForIndexCode(voice.code), indexCode: voice.code }
    const emotion = normalizeIndexEmotion(request && request.emotion)
    if (!emotion) return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_EMOTION }
    const requestIdPrefix = taskId.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 24)
    sequence += 1
    const requestId = `${requestIdPrefix || 'indextts'}-${sequence}`.slice(0, 64)
    const checked = checkSynthesisRequest(manifest, observation(), {
      ...(request && typeof request === 'object' ? request : {}),
      requestId,
      voiceId: voice.voiceId,
    })
    if (!checked.ok) return { ok: false, code: checked.code, status: checked.status || null }

    const vector = normalizeVector(context.emotionVector)
    if (!vector.ok) return { ok: false, code: providerCodeForIndexCode(vector.code), indexCode: vector.code }
    const useEmotionText = context.useEmotionText === true
    if (useEmotionText && manifest.capabilities.emotion.textSupported !== true) {
      return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_EMOTION, detail: 'text emotion requires the audited QwenEmotion resource' }
    }
    if (context.emotionText !== undefined && (typeof context.emotionText !== 'string' || context.emotionText.length === 0 || context.emotionText.length > 500)) {
      return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE }
    }
    let emotionRef = null
    if (context.emotionBindingRef !== undefined) {
      if (typeof context.emotionBindingRef !== 'string') return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE }
      const emotionBinding = (Array.isArray(options.bindings) ? options.bindings : []).find(
        (binding) => binding && binding.kind === 'clone' && binding.referenceRef === context.emotionBindingRef,
      )
      const registeredEmotion = discovery.bindingIndex ? discovery.bindingIndex[context.emotionBindingRef] : null
      if (emotionBinding) emotionRef = context.emotionBindingRef
      else if (registeredEmotion) emotionRef = registeredEmotion.referenceRef
      else return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE }
    }
    if (emotionRef && (vector.value || useEmotionText)) {
      return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'emotion reference cannot be mixed with vector/text emotion' }
    }
    if (!indexLanguageCode(checked.language)) return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE }
    const startedAt = now()
    const effectiveTimeoutMs = Math.max(
      INDEX_TTS_LIMITS.minRequestTimeoutMs,
      Math.min(requestTimeoutMs, manifest.capabilities.limits.timeoutMs),
    )
    const payload = {
      requestId,
      text: request.text,
      model: discovery.model,
      backend: discovery.backend,
      modality: 'clone',
      voiceId: checked.voiceId,
      bindingRef: voice.referenceRef,
      language: checked.language,
      emotion,
      format: { mime: INDEX_TTS_LIMITS.mime, sampleRate: INDEX_TTS_LIMITS.sampleRate, channels: INDEX_TTS_LIMITS.channels },
      maxBytes: INDEX_TTS_LIMITS.maxBytes,
    }
    if (vector.value) payload.emotionVector = vector.value
    if (context.emotionAlpha !== undefined) {
      if (typeof context.emotionAlpha !== 'number' || !Number.isFinite(context.emotionAlpha) || context.emotionAlpha < 0 || context.emotionAlpha > 1) {
        return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE }
      }
      payload.emotionAlpha = context.emotionAlpha
    }
    if (emotionRef) payload.emotionRef = emotionRef
    if (useEmotionText) {
      payload.useEmotionText = true
      payload.emotionText = context.emotionText
    }
    const result = (async () => {
      const answer = await supervisor.synthesize(payload, { timeoutMs: effectiveTimeoutMs })
      if (!answer.ok) {
        const code = answer.code || INDEX_TTS_ERRORS.WORKER_UNAVAILABLE
        if (code === INDEX_TTS_ERRORS.CANCELLED || answer.cancelled === true) {
          return {
            ok: false,
            code: PROVIDER_ERRORS.CANCELLED,
            indexCode: INDEX_TTS_ERRORS.CANCELLED,
            cancelled: true,
            unknown: false,
            terminal: 'CANCELLED',
            requestId,
            taskId,
            startedAt,
            finishedAt: now(),
          }
        }
        const unknown = code === INDEX_TTS_ERRORS.TIMEOUT || code === INDEX_TTS_ERRORS.UNKNOWN_RESULT || answer.unknown === true
        const cancelled = code === INDEX_TTS_ERRORS.TIMEOUT
          ? await supervisor.cancel(requestId, { timeoutMs: INDEX_TTS_LIMITS.cancelAckTimeoutMs }).catch(() => null)
          : null
        return {
          ok: false,
          code: providerCodeForIndexCode(code),
          indexCode: code,
          unknown,
          terminal: unknown ? 'UNKNOWN' : 'FAILED',
          requestId,
          taskId,
          cancellation: cancelled,
          blockedByUnresolved: code === INDEX_TTS_ERRORS.UNRESOLVED_ACTIVITY,
          startedAt,
          finishedAt: now(),
        }
      }
      const output = validateIndexOutput({
        payload: answer.payload,
        manifest,
        requestId,
        voiceId: checked.voiceId,
        model: discovery.model,
        backend: discovery.backend,
        language: checked.language,
        emotion,
        createdAt: now(),
        maxBytes: INDEX_TTS_LIMITS.maxBytes,
        maxAudioSeconds: manifest.capabilities.limits.maxAudioSeconds,
      })
      if (!output.ok) {
        return {
          ok: false,
          code: providerCodeForIndexCode(output.code),
          indexCode: output.code,
          unknown: output.unknown === true,
          cancelled: output.cancelled === true,
          terminal: output.terminal || 'FAILED',
          requestId,
          taskId,
          finishedAt: now(),
        }
      }
      return {
        ok: true,
        providerId: INDEX_TTS_PROVIDER_ID,
        taskId,
        requestId,
        result: output.result,
        bytes: output.bytes,
        inspection: output.inspection,
        persisted: false,
        startedAt,
        finishedAt: now(),
        worker: supervisor.state(),
      }
    })()
    return {
      ok: true,
      taskId,
      requestId,
      voiceId: checked.voiceId,
      modality: 'clone',
      timeoutMs: effectiveTimeoutMs,
      result,
      cancel: () => supervisor.cancel(requestId, { timeoutMs: INDEX_TTS_LIMITS.cancelAckTimeoutMs }),
    }
  }

  async function synthesize(request, context = {}) {
    const begun = await beginSynthesis(request, context)
    if (!begun.ok) return begun
    return begun.result
  }

  async function shutdown() {
    return supervisor.stop()
  }

  return {
    ok: true,
    start,
    health,
    synthesize,
    beginSynthesis,
    shutdown,
    cancel: (requestId) => supervisor.cancel(requestId, { timeoutMs: INDEX_TTS_LIMITS.cancelAckTimeoutMs }),
    capabilities: () => (manifest ? JSON.parse(JSON.stringify(manifest.capabilities)) : null),
    manifest: () => (manifest ? JSON.parse(JSON.stringify(manifest)) : null),
    discovery: () => (discovery ? {
      backend: discovery.backend,
      model: discovery.model,
      voices: discovery.voices.map((voice) => ({ ...voice })),
      languages: [...discovery.languages],
      limits: { ...discovery.limits },
    } : null),
    workerState: () => supervisor.state(),
    metadata: () => indexMetadataInventory(),
    license: () => indexLicenseView(),
  }
}
