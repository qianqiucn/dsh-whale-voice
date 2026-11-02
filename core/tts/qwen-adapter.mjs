/* Whale Voice — Qwen3-TTS provider adapter (Plan10 10-A, offline candidate).
 *
 * Wraps one controlled worker through the narrow protocol and maps it onto the provider-neutral
 * contract. Honest failure only: no implicit start, no model load at import, no network fallback, no
 * retry, no invented availability, no persisted artifact. Output bytes are measured and validated
 * before any handoff; the provider never creates a Task, Artifact or delivery itself.
 *
 * The 10-A repair round keeps the existing public request gate (unknown keys, format, streaming,
 * voice, language, emotion) applied to the *caller's* request, binds the actual backend/voice
 * identity, requires the audited model identity and backend capability intersection, carries the
 * worker's own limits as a cap, verifies the output belongs to the in-flight request, and preserves
 * explicit cancelled/unknown terminals.
 */

import { inspectFixtureWavBytes } from '../audio/wav-byte-inspector.mjs'
import {
  PROVIDER_ERRORS,
  PROVIDER_STATES,
  checkSynthesisRequest,
  evaluateProviderStatus,
  normalizeSynthesisResult,
} from './provider-contract.mjs'
import {
  QWEN_BACKENDS,
  QWEN_ERRORS,
  QWEN_LIMITS,
  QWEN_PROVIDER_ID,
  QWEN_UPSTREAM,
  buildQwenManifest,
  checkQwenModality,
  isAuditedQwenModel,
  normalizeQwenBackend,
  qwenMetadataInventory,
  qwenModelBackend,
  qwenModelSupportsInstruct,
} from './qwen-contract.mjs'

const PROVIDER_CODE_BY_QWEN = Object.freeze({
  [QWEN_ERRORS.TIMEOUT]: PROVIDER_ERRORS.TIMEOUT,
  [QWEN_ERRORS.CANCELLED]: PROVIDER_ERRORS.CANCELLED,
  [QWEN_ERRORS.WORKER_UNAVAILABLE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.WORKER_NOT_CONFIGURED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.PROVIDER_NOT_READY]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.PROTOCOL_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.RESPONSE_TYPE_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.OUTPUT_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH]: PROVIDER_ERRORS.UNSUPPORTED_FORMAT,
  [QWEN_ERRORS.OUTPUT_TOO_LARGE]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.OUTPUT_IDENTITY_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.UNRELATED_SERVICE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.VERSION_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.WORKER_PROTOCOL_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.MODEL_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.MODEL_BACKEND_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.DISCOVERY_INCOMPLETE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.DEPENDENCY_MISSING]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.RESOURCE_UNVERIFIED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.MIXED_MODALITY]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.UNSUPPORTED_MODALITY]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [QWEN_ERRORS.VOICE_DESIGN_NOT_EXPOSED]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [QWEN_ERRORS.CLONE_BINDING_REQUIRED]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [QWEN_ERRORS.UNKNOWN_RESULT]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [QWEN_ERRORS.STOPPING]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.UNRESOLVED_ACTIVITY]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.EXIT_UNCONFIRMED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.CLEANUP_INCOMPLETE]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [QWEN_ERRORS.UNKNOWN_REQUEST]: PROVIDER_ERRORS.INVALID_RESPONSE,
})

export function providerCodeForQwenCode(code) {
  return PROVIDER_CODE_BY_QWEN[code] || PROVIDER_ERRORS.PROVIDER_ERROR
}

/**
 * Classify a worker handshake + health answer. `ok` requires the exact Qwen provider identity, the
 * audited worker protocol, an audited model whose backend matches the declared backend, the audited
 * package version and a consistent health answer; anything unverified stays degraded/offline.
 */
export function classifyQwenHealth({
  ready = null,
  health = null,
  expectedVersion = QWEN_UPSTREAM.packageVersion,
  expectedModel = null,
} = {}) {
  if (!ready) return { state: 'offline', code: QWEN_ERRORS.WORKER_UNAVAILABLE, model: null, backend: null }
  if (ready.provider !== 'qwen-tts') return { state: 'error', code: QWEN_ERRORS.UNRELATED_SERVICE, model: null, backend: null }
  const backend = normalizeQwenBackend(ready.backend)
  if (!backend) return { state: 'error', code: QWEN_ERRORS.UNKNOWN_BACKEND, model: ready.model || null, backend: null }
  if (ready.workerProtocol !== 1) {
    return { state: 'error', code: QWEN_ERRORS.WORKER_PROTOCOL_MISMATCH, model: ready.model || null, backend }
  }
  if (!isAuditedQwenModel(ready.model)) {
    return { state: 'error', code: QWEN_ERRORS.MODEL_MISMATCH, model: ready.model || null, backend }
  }
  if (expectedModel && ready.model !== expectedModel) {
    return { state: 'error', code: QWEN_ERRORS.MODEL_MISMATCH, model: ready.model, backend }
  }
  if (qwenModelBackend(ready.model) !== backend) {
    return { state: 'error', code: QWEN_ERRORS.MODEL_BACKEND_MISMATCH, model: ready.model, backend }
  }
  const version = typeof ready.qwenTtsVersion === 'string' ? ready.qwenTtsVersion : null
  if (version !== expectedVersion) {
    return { state: 'degraded', code: QWEN_ERRORS.VERSION_MISMATCH, model: ready.model, backend, version }
  }
  if (backend === QWEN_BACKENDS.CUSTOM_VOICE) {
    if (typeof ready.instructSupported !== 'boolean') {
      return { state: 'degraded', code: QWEN_ERRORS.DISCOVERY_INCOMPLETE, model: ready.model, backend, version }
    }
    if (ready.instructSupported !== qwenModelSupportsInstruct(ready.model)) {
      return { state: 'error', code: QWEN_ERRORS.MODEL_MISMATCH, model: ready.model, backend, version }
    }
  }
  if (!health) return { state: 'unknown', code: null, model: ready.model, backend, version }
  if (health.state !== 'ok') {
    return { state: health.state === 'offline' ? 'offline' : 'degraded', code: null, model: ready.model, backend, version }
  }
  if (health.model && health.model !== ready.model) {
    return { state: 'degraded', code: QWEN_ERRORS.MODEL_MISMATCH, model: health.model, backend, version }
  }
  if (health.backend && health.backend !== backend) {
    return { state: 'degraded', code: QWEN_ERRORS.MODEL_BACKEND_MISMATCH, model: ready.model, backend, version }
  }
  return { state: 'ok', code: null, model: ready.model, backend, version }
}

/** Map classified health onto the provider-contract observation. */
export function qwenObservation(classification, observedAt) {
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
  if (!Number.isInteger(maxChars) || maxChars < 1) return null
  if (!Number.isInteger(maxAudioSeconds) || maxAudioSeconds < 1) return null
  if (!Number.isInteger(timeoutMs) || timeoutMs < QWEN_LIMITS.minRequestTimeoutMs) return null
  return {
    maxChars: Math.min(maxChars, QWEN_LIMITS.maxChars),
    maxAudioSeconds: Math.min(maxAudioSeconds, QWEN_LIMITS.maxAudioSeconds),
    timeoutMs: Math.min(timeoutMs, QWEN_LIMITS.maxRequestTimeoutMs),
  }
}

/**
 * Normalize discovery. Preset backends need a non-empty declared voice list with matching models,
 * languages and limits; a clone backend needs at least one trusted binding (provided by Core, never
 * by the browser or the worker). Missing/contradictory declarations fail closed instead of being
 * projected into audited capabilities.
 */
export function normalizeQwenDiscovery({ ready = null, discovery = null, bindings = [] } = {}) {
  if (!ready || !normalizeQwenBackend(ready.backend)) return { ok: false, code: QWEN_ERRORS.UNKNOWN_BACKEND }
  const backend = ready.backend
  const model = ready.model
  if (!isAuditedQwenModel(model) || qwenModelBackend(model) !== backend) {
    return { ok: false, code: QWEN_ERRORS.MODEL_BACKEND_MISMATCH }
  }
  const declaredModels = discovery && Array.isArray(discovery.models) ? discovery.models : null
  if (!declaredModels || declaredModels.length === 0) return { ok: false, code: QWEN_ERRORS.DISCOVERY_INCOMPLETE }
  if (!declaredModels.every((item) => isAuditedQwenModel(item))) return { ok: false, code: QWEN_ERRORS.MODEL_MISMATCH }
  if (!declaredModels.includes(model)) return { ok: false, code: QWEN_ERRORS.MODEL_MISMATCH }
  if (discovery.model !== undefined && discovery.model !== model) return { ok: false, code: QWEN_ERRORS.MODEL_MISMATCH }
  if (discovery.backend !== undefined && discovery.backend !== backend) {
    return { ok: false, code: QWEN_ERRORS.MODEL_BACKEND_MISMATCH }
  }
  const declaredLanguages = discovery && Array.isArray(discovery.languages) ? discovery.languages : null
  if (!declaredLanguages || declaredLanguages.length === 0) return { ok: false, code: QWEN_ERRORS.DISCOVERY_INCOMPLETE }
  if (!declaredLanguages.every((item) => item === 'zh-CN' || item === 'en-US')) {
    return { ok: false, code: QWEN_ERRORS.DISCOVERY_INCOMPLETE }
  }
  const limits = readDiscoveryLimits(discovery && discovery.limits)
  if (!limits) return { ok: false, code: QWEN_ERRORS.DISCOVERY_INCOMPLETE }
  const voices = []
  const bindingIndex = Object.create(null)
  if (backend === QWEN_BACKENDS.BASE_CLONE) {
    for (const binding of Array.isArray(bindings) ? bindings : []) {
      if (!binding || binding.kind !== 'clone') continue
      if (typeof binding.voiceId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(binding.voiceId)) continue
      if (typeof binding.referenceRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/.test(binding.referenceRef)) continue
      if (bindingIndex[binding.voiceId]) continue
      bindingIndex[binding.voiceId] = { referenceRef: binding.referenceRef }
      voices.push({ id: binding.voiceId, name: binding.name || binding.voiceId, kind: 'cloned', languages: [], referenceAudioRequired: true })
    }
  } else if (backend === QWEN_BACKENDS.CUSTOM_VOICE) {
    const declared = discovery && Array.isArray(discovery.voices) ? discovery.voices : []
    for (const voice of declared) {
      if (!voice || typeof voice.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(voice.id)) continue
      const languages = (Array.isArray(voice.languages) ? voice.languages : []).filter((item) => declaredLanguages.includes(item))
      voices.push({ id: voice.id, name: voice.name || voice.id, kind: 'preset', languages })
    }
  } else {
    return { ok: false, code: QWEN_ERRORS.VOICE_DESIGN_NOT_EXPOSED }
  }
  if (voices.length === 0) {
    return { ok: false, code: backend === QWEN_BACKENDS.BASE_CLONE ? QWEN_ERRORS.CLONE_BINDING_REQUIRED : QWEN_ERRORS.PROVIDER_NOT_READY }
  }
  const languages = [...declaredLanguages]
  return {
    ok: true,
    backend,
    model,
    versions: { worker: ready.workerVersion || null, qwenTts: ready.qwenTtsVersion || null },
    voices,
    languages,
    models: [...declaredModels],
    limits,
    bindingIndex,
  }
}

function decodeBase64Bytes(value) {
  if (typeof value !== 'string' || value.length === 0) return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID }
  const buffer = Buffer.from(value, 'base64')
  if (buffer.length === 0) return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID }
  return { ok: true, bytes: new Uint8Array(buffer) }
}

/**
 * Validate worker output against the in-flight request identity and the declared format before any
 * handoff. A valid WAV only proves bytes; it cannot substitute for a matching request/model/backend/
 * voice identity. The returned result follows the provider-neutral contract, but its artifactRef is
 * a content hash of in-memory bytes and is explicitly not persisted.
 */
export function validateQwenOutput({
  payload,
  manifest = null,
  requestId,
  voiceId,
  model,
  backend,
  language,
  emotion,
  createdAt = null,
  maxBytes = QWEN_LIMITS.maxBytes,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID }
  if (payload.requestId !== requestId) return { ok: false, code: QWEN_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'requestId' }
  if (payload.model !== model) return { ok: false, code: QWEN_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'model' }
  if (payload.backend !== backend) return { ok: false, code: QWEN_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'backend' }
  if (payload.voiceId !== voiceId) return { ok: false, code: QWEN_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'voiceId' }
  if (payload.state === 'cancelled') return { ok: false, code: QWEN_ERRORS.CANCELLED, cancelled: true, terminal: 'CANCELLED' }
  if (payload.state === 'unknown') return { ok: false, code: QWEN_ERRORS.UNKNOWN_RESULT, unknown: true, terminal: 'UNKNOWN' }
  if (payload.state !== 'ok') return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID }
  const decoded = decodeBase64Bytes(payload.bytesBase64)
  if (!decoded.ok) return decoded
  if (decoded.bytes.byteLength > maxBytes) return { ok: false, code: QWEN_ERRORS.OUTPUT_TOO_LARGE }
  const inspection = inspectFixtureWavBytes({ schemaVersion: 1, bytes: decoded.bytes })
  if (!inspection.ok) return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID, detail: inspection.code }
  const value = inspection.value
  const mime = value.format === 'WAV' && value.codec === 'PCM_S16LE' ? 'audio/wav' : null
  const durationMs = Math.round(value.durationMs)
  if (!mime) return { ok: false, code: QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (value.sampleRate !== QWEN_LIMITS.sampleRate || value.channels !== QWEN_LIMITS.channels) {
    return { ok: false, code: QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH }
  }
  if (durationMs > QWEN_LIMITS.maxAudioSeconds * 1000) return { ok: false, code: QWEN_ERRORS.OUTPUT_TOO_LARGE }
  if (payload.sampleRate !== undefined && payload.sampleRate !== value.sampleRate) return { ok: false, code: QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.channels !== undefined && payload.channels !== value.channels) return { ok: false, code: QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.mime !== undefined && payload.mime !== mime) return { ok: false, code: QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.durationMs !== undefined && payload.durationMs !== durationMs) return { ok: false, code: QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH }
  const artifactRef = 'qwen-bytes:' + value.sha256.slice(0, 32)
  const resultManifest = manifest || {
    id: QWEN_PROVIDER_ID,
    capabilities: {
      languages: [language],
      voices: [{ id: voiceId, name: voiceId, kind: 'preset' }],
      formats: [{ mime: QWEN_LIMITS.mime, sampleRate: QWEN_LIMITS.sampleRate, channels: QWEN_LIMITS.channels }],
      emotion: { supported: false, modes: [], defaultMode: 'neutral' },
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
  if (!normalized.ok) return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID }
  return { ok: true, bytes: decoded.bytes, inspection: { ...value, mime, durationMs }, result: normalized.result }
}

function validRequestTimeout(value) {
  if (value === undefined) return { ok: true, value: QWEN_LIMITS.timeoutMs }
  if (!Number.isInteger(value) || value < QWEN_LIMITS.minRequestTimeoutMs || value > QWEN_LIMITS.maxRequestTimeoutMs) {
    return { ok: false, code: QWEN_ERRORS.INVALID_INPUT }
  }
  return { ok: true, value }
}

/**
 * Create the Qwen provider around an explicitly started supervisor. Nothing starts at creation.
 *
 * @param {object} options
 * @param {object} options.supervisor required explicit supervisor
 * @param {number} [options.requestTimeoutMs] finite positive timeout; invalid values fail closed
 * @param {Function} [options.bindingResolver] trusted clone binding resolver (Core-owned)
 * @param {Array} [options.bindings] registered clone bindings (Core-owned)
 * @param {string} [options.modelIdentity] expected audited model identity
 * @param {Function} [options.taskAuthority] optional existing Task authority confirmation
 */
export function createQwenProvider(options = {}) {
  const supervisor = options.supervisor
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const timeout = validRequestTimeout(options.requestTimeoutMs)
  if (!timeout.ok) return { ok: false, code: timeout.code, detail: 'requestTimeoutMs must be an integer within the finite bounds' }
  const requestTimeoutMs = timeout.value
  const bindingResolver = typeof options.bindingResolver === 'function' ? options.bindingResolver : null
  const modelIdentity = typeof options.modelIdentity === 'string' ? options.modelIdentity : null
  if (modelIdentity !== null && !isAuditedQwenModel(modelIdentity)) {
    return { ok: false, code: QWEN_ERRORS.MODEL_MISMATCH, detail: 'modelIdentity must be an audited model identity' }
  }
  const taskAuthority = typeof options.taskAuthority === 'function' ? options.taskAuthority : null
  let manifest = null
  let discovery = null
  let classification = null
  let sequence = 0

  if (!supervisor || typeof supervisor.start !== 'function') {
    return { ok: false, code: QWEN_ERRORS.WORKER_NOT_CONFIGURED }
  }

  function observation(observedAt) {
    return qwenObservation(classification || { state: 'unknown', model: null }, observedAt || now())
  }

  async function start() {
    const started = await supervisor.start()
    if (!started.ok) {
      classification = { state: 'offline', code: started.code, model: null, backend: null }
      return { ok: false, code: providerCodeForQwenCode(started.code), qwenCode: started.code, detail: started.detail || '' }
    }
    const abort = async (result) => {
      const stopped = await supervisor.stop().catch(() => ({ ok: false, code: QWEN_ERRORS.EXIT_UNCONFIRMED }))
      return { ...result, shutdown: stopped.ok ? { ok: true } : { ok: false, code: stopped.code } }
    }
    const ready = started.ready
    const health = await supervisor.health({ timeoutMs: QWEN_LIMITS.handshakeTimeoutMs })
    classification = classifyQwenHealth({
      ready,
      health: health.ok ? { state: health.state, ...health.payload } : null,
      expectedModel: modelIdentity,
    })
    if (classification.state !== 'ok') {
      const code = classification.code ? providerCodeForQwenCode(classification.code) : PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE
      return abort({ ok: false, code, qwenCode: classification.code || null, classification })
    }
    const discovered = await supervisor.discover({ timeoutMs: QWEN_LIMITS.handshakeTimeoutMs })
    if (!discovered.ok) return abort({ ok: false, code: providerCodeForQwenCode(discovered.code), qwenCode: discovered.code })
    discovery = normalizeQwenDiscovery({ ready, discovery: discovered.payload, bindings: options.bindings || [] })
    if (!discovery.ok) {
      classification = { state: 'degraded', code: discovery.code, model: ready.model, backend: ready.backend }
      return abort({ ok: false, code: providerCodeForQwenCode(discovery.code), qwenCode: discovery.code })
    }
    const built = buildQwenManifest({
      backend: discovery.backend,
      model: discovery.model,
      voices: discovery.voices,
      languages: discovery.languages,
      limits: discovery.limits,
      qwenTtsVersion: ready.qwenTtsVersion,
    })
    if (!built.ok) return abort({ ok: false, code: providerCodeForQwenCode(built.code), qwenCode: built.code })
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
    const answer = await supervisor.health({ timeoutMs: QWEN_LIMITS.handshakeTimeoutMs })
    classification = classifyQwenHealth({
      ready: supervisor.state().ready,
      health: answer.ok ? { state: answer.state, ...answer.payload } : null,
      expectedModel: modelIdentity,
    })
    const status = evaluateProviderStatus(manifest, observation())
    return { ok: true, status, observation: observation(), worker: supervisor.state() }
  }

  function resolveVoice(request, context, modality) {
    if (!discovery) return { ok: false, code: QWEN_ERRORS.PROVIDER_NOT_READY }
    const backend = discovery.backend
    if (modality === 'design') return { ok: false, code: QWEN_ERRORS.VOICE_DESIGN_NOT_EXPOSED }
    if (modality === 'clone') {
      if (backend !== QWEN_BACKENDS.BASE_CLONE) return { ok: false, code: QWEN_ERRORS.UNSUPPORTED_MODALITY }
      const binding = context.binding
      const voiceId = binding && typeof binding.voiceId === 'string' ? binding.voiceId : null
      const registered = voiceId && discovery.bindingIndex ? discovery.bindingIndex[voiceId] : null
      if (!registered) return { ok: false, code: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
      if (!bindingResolver) return { ok: false, code: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
      const resolved = bindingResolver(binding)
      if (!resolved || typeof resolved.referenceRef !== 'string') return { ok: false, code: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
      if (resolved.referenceRef !== registered.referenceRef) return { ok: false, code: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
      return { ok: true, voiceId, referenceRef: registered.referenceRef }
    }
    if (backend !== QWEN_BACKENDS.CUSTOM_VOICE) return { ok: false, code: QWEN_ERRORS.UNSUPPORTED_MODALITY }
    return { ok: true, voiceId: request && request.voiceId ? request.voiceId : null }
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
    const modality = checkQwenModality(request, context.binding)
    if (!modality.ok) return { ok: false, code: providerCodeForQwenCode(modality.code), qwenCode: modality.code }
    if (modality.modality === 'design') return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE, qwenCode: QWEN_ERRORS.VOICE_DESIGN_NOT_EXPOSED }
    const voice = resolveVoice(request, context, modality.modality)
    if (!voice.ok) return { ok: false, code: providerCodeForQwenCode(voice.code), qwenCode: voice.code }
    const requestIdPrefix = taskId.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 24)
    sequence += 1
    const requestId = `${requestIdPrefix || 'qwen'}-${sequence}`.slice(0, 64)
    const checked = checkSynthesisRequest(manifest, observation(), {
      ...(request && typeof request === 'object' ? request : {}),
      requestId,
      voiceId: voice.voiceId,
    })
    if (!checked.ok) return { ok: false, code: checked.code, status: checked.status || null }
    const startedAt = now()
    const payload = {
      requestId,
      text: request.text,
      model: discovery.model,
      backend: discovery.backend,
      modality: modality.modality,
      voiceId: checked.voiceId,
      language: checked.language,
      emotion: checked.emotion,
      format: { mime: QWEN_LIMITS.mime, sampleRate: QWEN_LIMITS.sampleRate, channels: QWEN_LIMITS.channels },
      maxBytes: QWEN_LIMITS.maxBytes,
    }
    if (modality.modality === 'clone') payload.bindingRef = voice.referenceRef
    const result = (async () => {
      const answer = await supervisor.synthesize(payload, { timeoutMs: requestTimeoutMs })
      if (!answer.ok) {
        const code = answer.code || QWEN_ERRORS.WORKER_UNAVAILABLE
        if (code === QWEN_ERRORS.CANCELLED || answer.cancelled === true) {
          return {
            ok: false,
            code: PROVIDER_ERRORS.CANCELLED,
            qwenCode: QWEN_ERRORS.CANCELLED,
            cancelled: true,
            unknown: false,
            terminal: 'CANCELLED',
            requestId,
            taskId,
            startedAt,
            finishedAt: now(),
          }
        }
        const unknown = code === QWEN_ERRORS.TIMEOUT || code === QWEN_ERRORS.UNKNOWN_RESULT || answer.unknown === true
        const cancelled = code === QWEN_ERRORS.TIMEOUT ? await supervisor.cancel(requestId, { timeoutMs: QWEN_LIMITS.cancelAckTimeoutMs }).catch(() => null) : null
        return {
          ok: false,
          code: providerCodeForQwenCode(code),
          qwenCode: code,
          unknown,
          terminal: unknown ? 'UNKNOWN' : 'FAILED',
          requestId,
          taskId,
          cancellation: cancelled,
          blockedByUnresolved: code === QWEN_ERRORS.UNRESOLVED_ACTIVITY,
          startedAt,
          finishedAt: now(),
        }
      }
      const output = validateQwenOutput({
        payload: answer.payload,
        manifest,
        requestId,
        voiceId: checked.voiceId,
        model: discovery.model,
        backend: discovery.backend,
        language: checked.language,
        emotion: checked.emotion,
        createdAt: now(),
        maxBytes: QWEN_LIMITS.maxBytes,
      })
      if (!output.ok) {
        return {
          ok: false,
          code: providerCodeForQwenCode(output.code),
          qwenCode: output.code,
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
        providerId: QWEN_PROVIDER_ID,
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
      modality: modality.modality,
      result,
      cancel: () => supervisor.cancel(requestId, { timeoutMs: QWEN_LIMITS.cancelAckTimeoutMs }),
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
    cancel: (requestId) => supervisor.cancel(requestId, { timeoutMs: QWEN_LIMITS.cancelAckTimeoutMs }),
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
    metadata: () => qwenMetadataInventory(),
    license: () => ({
      license: QWEN_UPSTREAM.license,
      scope: QWEN_UPSTREAM.licenseScope,
      codeCommit: QWEN_UPSTREAM.codeCommit,
      packageVersion: QWEN_UPSTREAM.packageVersion,
      modelRevision: QWEN_UPSTREAM.baseModelRevision,
    }),
  }
}
