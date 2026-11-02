/* Whale Voice — Qwen3-TTS provider adapter (Plan10 10-A, offline candidate).
 *
 * Wraps one controlled worker through the narrow protocol and maps it onto the provider-neutral
 * contract. Honest failure only: no implicit start, no model load at import, no network fallback, no
 * retry, no invented availability, no persisted artifact. Output bytes are measured and validated
 * before any handoff; the provider never creates a Task, Artifact or delivery itself.
 */

import { createHash } from 'node:crypto'

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
  normalizeQwenBackend,
} from './qwen-contract.mjs'

const PROVIDER_CODE_BY_QWEN = Object.freeze({
  [QWEN_ERRORS.TIMEOUT]: PROVIDER_ERRORS.TIMEOUT,
  [QWEN_ERRORS.CANCELLED]: PROVIDER_ERRORS.CANCELLED,
  [QWEN_ERRORS.WORKER_UNAVAILABLE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.WORKER_NOT_CONFIGURED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.PROVIDER_NOT_READY]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.PROTOCOL_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.OUTPUT_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.OUTPUT_FORMAT_MISMATCH]: PROVIDER_ERRORS.UNSUPPORTED_FORMAT,
  [QWEN_ERRORS.OUTPUT_TOO_LARGE]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.UNRELATED_SERVICE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.VERSION_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.MODEL_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [QWEN_ERRORS.MIXED_MODALITY]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [QWEN_ERRORS.VOICE_DESIGN_NOT_EXPOSED]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [QWEN_ERRORS.CLONE_BINDING_REQUIRED]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [QWEN_ERRORS.UNKNOWN_RESULT]: PROVIDER_ERRORS.PROVIDER_ERROR,
})

export function providerCodeForQwenCode(code) {
  return PROVIDER_CODE_BY_QWEN[code] || PROVIDER_ERRORS.PROVIDER_ERROR
}

function isQwenModel(model) {
  return typeof model === 'string' && /^Qwen3-TTS-[A-Za-z0-9._-]+$/.test(model)
}

function isQwenWorkerIdentity(ready) {
  return Boolean(ready && (ready.provider === 'qwen-tts' || isQwenModel(ready.model)))
}

/**
 * Classify a worker handshake + health answer. `ok` requires an identified Qwen worker, an audited
 * package version and a matching model; anything unverified stays degraded/offline, never available.
 */
export function classifyQwenHealth({ ready = null, health = null, expectedVersion = QWEN_UPSTREAM.packageVersion } = {}) {
  if (!ready) return { state: 'offline', code: QWEN_ERRORS.WORKER_UNAVAILABLE, model: null, backend: null }
  if (!isQwenWorkerIdentity(ready)) return { state: 'error', code: QWEN_ERRORS.UNRELATED_SERVICE, model: null, backend: null }
  const backend = normalizeQwenBackend(ready.backend)
  if (!backend) return { state: 'error', code: QWEN_ERRORS.UNKNOWN_BACKEND, model: ready.model || null, backend: null }
  if (!isQwenModel(ready.model)) return { state: 'error', code: QWEN_ERRORS.MODEL_MISMATCH, model: ready.model || null, backend }
  const version = typeof ready.qwenTtsVersion === 'string' ? ready.qwenTtsVersion : null
  if (version !== expectedVersion) {
    return { state: 'degraded', code: QWEN_ERRORS.VERSION_MISMATCH, model: ready.model, backend, version }
  }
  if (!health) return { state: 'unknown', code: null, model: ready.model, backend, version }
  if (health.state !== 'ok') {
    return { state: health.state === 'offline' ? 'offline' : 'degraded', code: null, model: ready.model, backend, version }
  }
  if (health.model && health.model !== ready.model) {
    return { state: 'degraded', code: QWEN_ERRORS.MODEL_MISMATCH, model: health.model, backend, version }
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

/**
 * Normalize discovery. Preset backends need at least one declared voice; a clone backend needs at
 * least one trusted binding (provided by Core, never by the browser or the worker).
 */
export function normalizeQwenDiscovery({ ready = null, discovery = null, bindings = [] } = {}) {
  if (!ready || !normalizeQwenBackend(ready.backend)) return { ok: false, code: QWEN_ERRORS.UNKNOWN_BACKEND }
  const backend = ready.backend
  const voices = []
  if (backend === QWEN_BACKENDS.BASE_CLONE) {
    for (const binding of Array.isArray(bindings) ? bindings : []) {
      if (!binding || binding.kind !== 'clone') continue
      if (typeof binding.voiceId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(binding.voiceId)) continue
      if (typeof binding.referenceRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/.test(binding.referenceRef)) continue
      voices.push({ id: binding.voiceId, name: binding.name || binding.voiceId, kind: 'cloned', languages: [], referenceAudioRequired: true })
    }
  } else if (backend === QWEN_BACKENDS.CUSTOM_VOICE) {
    const declared = Array.isArray(discovery && discovery.voices) ? discovery.voices : []
    for (const voice of declared) {
      if (!voice || typeof voice.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(voice.id)) continue
      voices.push({ id: voice.id, name: voice.name || voice.id, kind: 'preset', languages: Array.isArray(voice.languages) ? voice.languages : [] })
    }
  }
  if (voices.length === 0) {
    return { ok: false, code: backend === QWEN_BACKENDS.BASE_CLONE ? QWEN_ERRORS.CLONE_BINDING_REQUIRED : QWEN_ERRORS.PROVIDER_NOT_READY }
  }
  const languages = (Array.isArray(discovery && discovery.languages) ? discovery.languages : ['zh-CN'])
    .filter((item) => item === 'zh-CN' || item === 'en-US')
  const models = (Array.isArray(discovery && discovery.models) ? discovery.models : [ready.model])
    .filter((item) => isQwenModel(item))
  return {
    ok: true,
    backend,
    model: ready.model,
    versions: { worker: ready.workerVersion || null, qwenTts: ready.qwenTtsVersion || null },
    voices,
    languages: languages.length ? languages : ['zh-CN'],
    models,
    workerLimits: discovery && discovery.limits ? { ...discovery.limits } : null,
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
 * Validate worker output bytes against the declared format before any handoff. The returned result
 * follows the provider-neutral contract, but its artifactRef is a content hash of in-memory bytes
 * and is explicitly not persisted.
 */
export function validateQwenOutput({ payload, requestId, voiceId, language, emotion, createdAt = null, maxBytes = QWEN_LIMITS.maxBytes } = {}) {
  if (!payload || typeof payload !== 'object') return { ok: false, code: QWEN_ERRORS.OUTPUT_INVALID }
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
  const normalized = normalizeSynthesisResult({
    schemaVersion: 1,
    id: QWEN_PROVIDER_ID,
    capabilities: {
      languages: [language],
      voices: [{ id: voiceId, name: voiceId, kind: 'preset' }, { id: 'clone-bound', name: 'clone', kind: 'cloned' }],
      clone: { supported: true, requiresReferenceAudio: true },
      emotion: { supported: true, modes: [emotion], defaultMode: emotion },
      streaming: false,
      formats: [{ mime: QWEN_LIMITS.mime, sampleRate: QWEN_LIMITS.sampleRate, channels: QWEN_LIMITS.channels }],
      limits: { maxChars: QWEN_LIMITS.maxChars, timeoutMs: QWEN_LIMITS.timeoutMs, maxAudioSeconds: QWEN_LIMITS.maxAudioSeconds },
      retry: { maxAttempts: 0, idempotent: false, retryOn: [] },
      cancellation: true,
    },
  }, {
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

/**
 * Create the Qwen provider around an explicitly started supervisor. Nothing starts at creation.
 */
export function createQwenProvider(options = {}) {
  const supervisor = options.supervisor
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const requestTimeoutMs = Number.isInteger(options.requestTimeoutMs) ? options.requestTimeoutMs : QWEN_LIMITS.timeoutMs
  const bindingResolver = typeof options.bindingResolver === 'function' ? options.bindingResolver : null
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
    const ready = started.ready
    const health = await supervisor.health({ timeoutMs: QWEN_LIMITS.handshakeTimeoutMs })
    classification = classifyQwenHealth({ ready, health: health.ok ? { state: health.state, ...health.payload } : null })
    if (classification.state !== 'ok') {
      const code = classification.code ? providerCodeForQwenCode(classification.code) : PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE
      return { ok: false, code, qwenCode: classification.code || null, classification }
    }
    const discovered = await supervisor.discover({ timeoutMs: QWEN_LIMITS.handshakeTimeoutMs })
    if (!discovered.ok) return { ok: false, code: providerCodeForQwenCode(discovered.code), qwenCode: discovered.code }
    discovery = normalizeQwenDiscovery({ ready, discovery: discovered.payload, bindings: options.bindings || [] })
    if (!discovery.ok) {
      classification = { state: 'degraded', code: discovery.code, model: ready.model, backend: ready.backend }
      return { ok: false, code: providerCodeForQwenCode(discovery.code), qwenCode: discovery.code }
    }
    const built = buildQwenManifest({
      backend: discovery.backend,
      voices: discovery.voices,
      languages: discovery.languages,
      qwenTtsVersion: ready.qwenTtsVersion,
    })
    if (!built.ok) return { ok: false, code: providerCodeForQwenCode(built.code), qwenCode: built.code }
    manifest = built.manifest
    return { ok: true, manifest: { ...manifest }, discovery: { ...discovery } }
  }

  async function health() {
    if (!manifest) return { ok: false, code: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE, state: 'offline' }
    const health = await supervisor.health({ timeoutMs: QWEN_LIMITS.handshakeTimeoutMs })
    classification = classifyQwenHealth({ ready: supervisor.state().ready, health: health.ok ? { state: health.state, ...health.payload } : null })
    const status = evaluateProviderStatus(manifest, observation())
    return { ok: true, status, observation: observation(), worker: supervisor.state() }
  }

  async function synthesize(request, context = {}) {
    if (!manifest) return { ok: false, code: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE }
    const taskId = context.taskId
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/.test(taskId)) {
      return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'a Task id issued by the existing authority is required' }
    }
    const modality = checkQwenModality(request, context.binding)
    if (!modality.ok) return { ok: false, code: providerCodeForQwenCode(modality.code), qwenCode: modality.code }
    if (modality.modality === 'design') return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE, qwenCode: QWEN_ERRORS.VOICE_DESIGN_NOT_EXPOSED }
    if (modality.modality === 'clone') {
      const binding = context.binding
      if (!bindingResolver) return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE, qwenCode: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
      const resolved = bindingResolver(binding)
      if (!resolved || typeof resolved.referenceRef !== 'string') {
        return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE, qwenCode: QWEN_ERRORS.CLONE_BINDING_REQUIRED }
      }
      context = { ...context, binding: { ...binding, referenceRef: resolved.referenceRef } }
    }
    const requestIdPrefix = taskId.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 24)
    sequence += 1
    const requestId = `${requestIdPrefix || 'qwen'}-${sequence}`.slice(0, 64)
    const checked = checkSynthesisRequest(manifest, observation(), {
      requestId,
      text: request && request.text,
      voiceId: modality.modality === 'clone' ? 'clone-bound' : request && request.voiceId,
      language: request && request.language,
      emotion: request && request.emotion,
      format: QWEN_LIMITS.mime,
    })
    if (!checked.ok) return { ok: false, code: checked.code, status: checked.status || null }
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
    if (modality.modality === 'clone') payload.bindingRef = context.binding.referenceRef
    const startedAt = now()
    const result = await supervisor.synthesize(payload, { timeoutMs: requestTimeoutMs })
    if (!result.ok) {
      const timedOut = result.code === QWEN_ERRORS.TIMEOUT
      const cancelled = timedOut ? await supervisor.cancel(requestId) : null
      return {
        ok: false,
        code: providerCodeForQwenCode(result.code),
        qwenCode: result.code,
        unknown: timedOut,
        requestId,
        taskId,
        cancellation: cancelled,
        startedAt,
        finishedAt: now(),
      }
    }
    const output = validateQwenOutput({
      payload: result.payload,
      requestId,
      voiceId: checked.voiceId,
      language: checked.language,
      emotion: checked.emotion,
      createdAt: now(),
      maxBytes: QWEN_LIMITS.maxBytes,
    })
    if (!output.ok) {
      return { ok: false, code: providerCodeForQwenCode(output.code), qwenCode: output.code, requestId, taskId, finishedAt: now() }
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
  }

  async function shutdown() {
    return supervisor.stop()
  }

  return {
    ok: true,
    start,
    health,
    synthesize,
    shutdown,
    cancel: (requestId) => supervisor.cancel(requestId),
    capabilities: () => (manifest ? manifest.capabilities : null),
    manifest: () => (manifest ? { ...manifest } : null),
    discovery: () => (discovery ? { ...discovery } : null),
    workerState: () => supervisor.state(),
    license: () => ({
      license: QWEN_UPSTREAM.license,
      scope: QWEN_UPSTREAM.licenseScope,
      codeCommit: QWEN_UPSTREAM.codeCommit,
      packageVersion: QWEN_UPSTREAM.packageVersion,
      modelRevision: QWEN_UPSTREAM.baseModelRevision,
    }),
  }
}
