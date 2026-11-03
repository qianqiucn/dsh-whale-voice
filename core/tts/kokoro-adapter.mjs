/* Whale Voice — Kokoro-82M provider adapter (Plan10 10-C, offline candidate).
 *
 * Preset-voice-only local provider. No clone/voice-design/emotion mapping; no implicit start,
 * network fallback, retry or persisted artifact. The provider never creates a Task/Artifact.
 */

import { inspectFixtureWavBytes } from '../audio/wav-byte-inspector.mjs'
import {
  PROVIDER_ERRORS,
  checkSynthesisRequest,
  evaluateProviderStatus,
  normalizeSynthesisResult,
} from './provider-contract.mjs'
import {
  KOKORO_ERRORS,
  KOKORO_LANGUAGES,
  KOKORO_LIMITS,
  KOKORO_MODEL,
  KOKORO_PROVIDER_ID,
  KOKORO_UPSTREAM,
  buildKokoroManifest,
  checkKokoroModality,
  isKokoroLanguage,
  isKokoroModel,
  kokoroLicenseView,
  kokoroMetadataInventory,
  normalizeKokoroVoice,
} from './kokoro-contract.mjs'

const PROVIDER_CODE_BY_KOKORO = Object.freeze({
  [KOKORO_ERRORS.TIMEOUT]: PROVIDER_ERRORS.TIMEOUT,
  [KOKORO_ERRORS.CANCELLED]: PROVIDER_ERRORS.CANCELLED,
  [KOKORO_ERRORS.WORKER_UNAVAILABLE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.WORKER_NOT_CONFIGURED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.PROVIDER_NOT_READY]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.PROTOCOL_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [KOKORO_ERRORS.RESPONSE_TYPE_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [KOKORO_ERRORS.OUTPUT_INVALID]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH]: PROVIDER_ERRORS.UNSUPPORTED_FORMAT,
  [KOKORO_ERRORS.OUTPUT_TOO_LARGE]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [KOKORO_ERRORS.OUTPUT_IDENTITY_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [KOKORO_ERRORS.RESPONSE_IDENTITY_MISMATCH]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [KOKORO_ERRORS.CANCEL_NOT_CONFIRMED]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [KOKORO_ERRORS.NETWORK_BLOCKED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.RESOURCE_CHANGED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.UNRELATED_SERVICE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.VERSION_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.WORKER_PROTOCOL_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.MODEL_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.MODEL_BACKEND_MISMATCH]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.DISCOVERY_INCOMPLETE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.DEPENDENCY_MISSING]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.G2P_UNAVAILABLE]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.RESOURCE_UNVERIFIED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.MIXED_MODALITY]: PROVIDER_ERRORS.INVALID_RESPONSE,
  [KOKORO_ERRORS.UNSUPPORTED_MODALITY]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [KOKORO_ERRORS.CLONE_NOT_SUPPORTED]: PROVIDER_ERRORS.UNSUPPORTED_VOICE,
  [KOKORO_ERRORS.UNKNOWN_RESULT]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [KOKORO_ERRORS.STOPPING]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.UNRESOLVED_ACTIVITY]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.EXIT_UNCONFIRMED]: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE,
  [KOKORO_ERRORS.CLEANUP_INCOMPLETE]: PROVIDER_ERRORS.PROVIDER_ERROR,
  [KOKORO_ERRORS.UNKNOWN_REQUEST]: PROVIDER_ERRORS.INVALID_RESPONSE,
})

export function providerCodeForKokoroCode(code) {
  return PROVIDER_CODE_BY_KOKORO[code] || PROVIDER_ERRORS.PROVIDER_ERROR
}

export function classifyKokoroHealth({ ready = null, health = null, expectedModel = null } = {}) {
  if (!ready) return { state: 'offline', code: KOKORO_ERRORS.WORKER_UNAVAILABLE, model: null, backend: null }
  if (ready.provider !== KOKORO_PROVIDER_ID) return { state: 'error', code: KOKORO_ERRORS.UNRELATED_SERVICE, model: null, backend: null }
  if (ready.backend !== 'preset') return { state: 'error', code: KOKORO_ERRORS.UNKNOWN_BACKEND, model: ready.model || null, backend: null }
  if (ready.workerProtocol !== 1) return { state: 'error', code: KOKORO_ERRORS.WORKER_PROTOCOL_MISMATCH, model: ready.model || null, backend: 'preset' }
  if (!isKokoroModel(ready.model)) return { state: 'error', code: KOKORO_ERRORS.MODEL_MISMATCH, model: ready.model || null, backend: 'preset' }
  if (expectedModel && ready.model !== expectedModel) return { state: 'error', code: KOKORO_ERRORS.MODEL_MISMATCH, model: ready.model, backend: 'preset' }
  if (ready.modelVersion !== KOKORO_UPSTREAM.modelVersion) return { state: 'error', code: KOKORO_ERRORS.MODEL_MISMATCH, model: ready.model, backend: 'preset' }
  const version = typeof ready.kokoroVersion === 'string' ? ready.kokoroVersion : null
  if (version !== KOKORO_UPSTREAM.packageVersion) {
    return { state: 'degraded', code: KOKORO_ERRORS.VERSION_MISMATCH, model: ready.model, backend: 'preset', version }
  }
  if (!health) return { state: 'unknown', code: null, model: ready.model, backend: 'preset', version }
  if (health.state !== 'ok') return { state: health.state === 'offline' ? 'offline' : 'degraded', code: null, model: ready.model, backend: 'preset', version }
  if (health.model && health.model !== ready.model) return { state: 'degraded', code: KOKORO_ERRORS.MODEL_MISMATCH, model: health.model, backend: 'preset', version }
  return { state: 'ok', code: null, model: ready.model, backend: 'preset', version }
}

export function kokoroObservation(classification, observedAt) {
  return { state: classification.state, reason: classification.code || null, model: classification.model || null, observedAt: observedAt || null }
}

function readDiscoveryLimits(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { maxChars, maxAudioSeconds, timeoutMs } = raw
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > KOKORO_LIMITS.maxChars) return null
  if (!Number.isInteger(maxAudioSeconds) || maxAudioSeconds < 1 || maxAudioSeconds > KOKORO_LIMITS.maxAudioSeconds) return null
  if (!Number.isInteger(timeoutMs) || timeoutMs < KOKORO_LIMITS.minRequestTimeoutMs) return null
  return { maxChars, maxAudioSeconds, timeoutMs: Math.min(timeoutMs, KOKORO_LIMITS.maxRequestTimeoutMs) }
}

export function normalizeKokoroDiscovery({ ready = null, discovery = null } = {}) {
  if (!ready || ready.backend !== 'preset') return { ok: false, code: KOKORO_ERRORS.UNKNOWN_BACKEND }
  if (!isKokoroModel(ready.model) || ready.modelVersion !== KOKORO_UPSTREAM.modelVersion) return { ok: false, code: KOKORO_ERRORS.MODEL_MISMATCH }
  const declaredModels = discovery && Array.isArray(discovery.models) ? discovery.models : null
  if (!declaredModels || declaredModels.length === 0 || !declaredModels.every((item) => item === KOKORO_MODEL)) {
    return { ok: false, code: KOKORO_ERRORS.MODEL_MISMATCH }
  }
  if (discovery.model !== undefined && discovery.model !== KOKORO_MODEL) return { ok: false, code: KOKORO_ERRORS.MODEL_MISMATCH }
  if (discovery.backend !== undefined && discovery.backend !== 'preset') return { ok: false, code: KOKORO_ERRORS.MODEL_BACKEND_MISMATCH }
  const declaredLanguages = discovery && Array.isArray(discovery.languages) ? discovery.languages : null
  if (!declaredLanguages || declaredLanguages.length === 0 || !declaredLanguages.every(isKokoroLanguage)) {
    return { ok: false, code: KOKORO_ERRORS.DISCOVERY_INCOMPLETE }
  }
  const limits = readDiscoveryLimits(discovery.limits)
  if (!limits) return { ok: false, code: KOKORO_ERRORS.DISCOVERY_INCOMPLETE }
  const rawVoices = discovery && Array.isArray(discovery.voices) ? discovery.voices : []
  const voices = []
  for (const raw of rawVoices) {
    const voice = normalizeKokoroVoice(raw)
    if (!voice) continue
    if (!declaredLanguages.includes(voice.languages[0])) continue
    voices.push(voice)
  }
  if (voices.length === 0) return { ok: false, code: KOKORO_ERRORS.DISCOVERY_INCOMPLETE }
  return {
    ok: true,
    backend: 'preset',
    model: KOKORO_MODEL,
    versions: { worker: ready.workerVersion || null, kokoro: ready.kokoroVersion || null },
    voices,
    languages: Array.from(new Set(voices.map((voice) => voice.languages[0]))),
    models: [...declaredModels],
    limits,
  }
}

function decodeBase64Bytes(value) {
  if (typeof value !== 'string' || value.length === 0) return { ok: false, code: KOKORO_ERRORS.OUTPUT_INVALID }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return { ok: false, code: KOKORO_ERRORS.OUTPUT_INVALID }
  const buffer = Buffer.from(value, 'base64')
  if (buffer.length === 0) return { ok: false, code: KOKORO_ERRORS.OUTPUT_INVALID }
  return { ok: true, bytes: new Uint8Array(buffer) }
}

export function validateKokoroOutput({
  payload, manifest = null, requestId, voiceId, model = KOKORO_MODEL, backend = 'preset', language,
  createdAt = null, maxBytes = KOKORO_LIMITS.maxBytes, maxAudioSeconds = KOKORO_LIMITS.maxAudioSeconds,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, code: KOKORO_ERRORS.OUTPUT_INVALID }
  if (payload.requestId !== requestId) return { ok: false, code: KOKORO_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'requestId' }
  if (payload.model !== model) return { ok: false, code: KOKORO_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'model' }
  if (payload.backend !== backend) return { ok: false, code: KOKORO_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'backend' }
  if (payload.voiceId !== voiceId) return { ok: false, code: KOKORO_ERRORS.OUTPUT_IDENTITY_MISMATCH, field: 'voiceId' }
  if (payload.state === 'cancelled') return { ok: false, code: KOKORO_ERRORS.CANCELLED, cancelled: true, terminal: 'CANCELLED' }
  if (payload.state === 'unknown') return { ok: false, code: KOKORO_ERRORS.UNKNOWN_RESULT, unknown: true, terminal: 'UNKNOWN' }
  if (payload.state !== 'ok') return { ok: false, code: KOKORO_ERRORS.OUTPUT_INVALID }
  const decoded = decodeBase64Bytes(payload.bytesBase64)
  if (!decoded.ok) return decoded
  if (decoded.bytes.byteLength > maxBytes) return { ok: false, code: KOKORO_ERRORS.OUTPUT_TOO_LARGE }
  const inspection = inspectFixtureWavBytes({ schemaVersion: 1, bytes: decoded.bytes })
  if (!inspection.ok) return { ok: false, code: KOKORO_ERRORS.OUTPUT_INVALID, detail: inspection.code }
  const value = inspection.value
  const mime = value.format === 'WAV' && value.codec === 'PCM_S16LE' ? 'audio/wav' : null
  const durationMs = Math.round(value.durationMs)
  if (!mime) return { ok: false, code: KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (value.sampleRate !== 24000 || value.channels !== 1) return { ok: false, code: KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (durationMs > maxAudioSeconds * 1000) return { ok: false, code: KOKORO_ERRORS.OUTPUT_TOO_LARGE }
  if (payload.sampleRate !== undefined && payload.sampleRate !== value.sampleRate) return { ok: false, code: KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.channels !== undefined && payload.channels !== value.channels) return { ok: false, code: KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.mime !== undefined && payload.mime !== mime) return { ok: false, code: KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH }
  if (payload.durationMs !== undefined && payload.durationMs !== durationMs) return { ok: false, code: KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH }
  const resultManifest = manifest || {
    id: KOKORO_PROVIDER_ID,
    capabilities: {
      languages: [language],
      voices: [{ id: voiceId, name: voiceId, kind: 'preset', languages: [language] }],
      formats: [{ mime: 'audio/wav', sampleRate: 24000, channels: 1 }],
      emotion: { supported: false, modes: [], defaultMode: 'neutral' },
    },
  }
  const normalized = normalizeSynthesisResult(resultManifest, {
    requestId, voiceId, language, emotion: 'neutral',
    artifactRef: 'kokoro-bytes:' + value.sha256.slice(0, 32),
    mime, sampleRate: value.sampleRate, channels: value.channels, durationMs,
    createdAt, warnings: ['NOT_PERSISTED'],
  })
  if (!normalized.ok) return { ok: false, code: KOKORO_ERRORS.OUTPUT_INVALID }
  return { ok: true, bytes: decoded.bytes, inspection: { ...value, mime, durationMs }, result: normalized.result }
}

function validRequestTimeout(value) {
  if (value === undefined) return { ok: true, value: KOKORO_LIMITS.timeoutMs }
  if (!Number.isInteger(value) || value < KOKORO_LIMITS.minRequestTimeoutMs || value > KOKORO_LIMITS.maxRequestTimeoutMs) {
    return { ok: false, code: KOKORO_ERRORS.INVALID_INPUT }
  }
  return { ok: true, value }
}

export function createKokoroProvider(options = {}) {
  const supervisor = options.supervisor
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const timeout = validRequestTimeout(options.requestTimeoutMs)
  if (!timeout.ok) return { ok: false, code: timeout.code, detail: 'requestTimeoutMs must be an integer within the finite bounds' }
  const requestTimeoutMs = timeout.value
  const modelIdentity = typeof options.modelIdentity === 'string' ? options.modelIdentity : null
  if (modelIdentity !== null && !isKokoroModel(modelIdentity)) return { ok: false, code: KOKORO_ERRORS.MODEL_MISMATCH }
  const taskAuthority = typeof options.taskAuthority === 'function' ? options.taskAuthority : null
  let manifest = null
  let discovery = null
  let classification = null
  let sequence = 0

  if (!supervisor || typeof supervisor.start !== 'function') return { ok: false, code: KOKORO_ERRORS.WORKER_NOT_CONFIGURED }

  function observation(observedAt) {
    return kokoroObservation(classification || { state: 'unknown', model: null }, observedAt || now())
  }

  async function start() {
    const started = await supervisor.start()
    if (!started.ok) {
      classification = { state: 'offline', code: started.code, model: null, backend: null }
      return { ok: false, code: providerCodeForKokoroCode(started.code), kokoroCode: started.code, detail: started.detail || '' }
    }
    const abort = async (result) => {
      const stopped = await supervisor.stop().catch(() => ({ ok: false, code: KOKORO_ERRORS.EXIT_UNCONFIRMED }))
      return { ...result, shutdown: stopped.ok ? { ok: true } : { ok: false, code: stopped.code } }
    }
    const ready = started.ready
    const health = await supervisor.health({ timeoutMs: KOKORO_LIMITS.handshakeTimeoutMs })
    classification = classifyKokoroHealth({ ready, health: health.ok ? { state: health.state, ...health.payload } : null, expectedModel: modelIdentity })
    if (classification.state !== 'ok') {
      return abort({ ok: false, code: providerCodeForKokoroCode(classification.code), kokoroCode: classification.code, classification })
    }
    const discovered = await supervisor.discover({ timeoutMs: KOKORO_LIMITS.handshakeTimeoutMs })
    if (!discovered.ok) return abort({ ok: false, code: providerCodeForKokoroCode(discovered.code), kokoroCode: discovered.code })
    discovery = normalizeKokoroDiscovery({ ready, discovery: discovered.payload })
    if (!discovery.ok) {
      classification = { state: 'degraded', code: discovery.code, model: ready.model, backend: 'preset' }
      return abort({ ok: false, code: providerCodeForKokoroCode(discovery.code), kokoroCode: discovery.code, detail: discovery })
    }
    const built = buildKokoroManifest({
      model: KOKORO_MODEL, modelVersion: KOKORO_UPSTREAM.modelVersion,
      voices: discovery.voices, languages: discovery.languages, limits: discovery.limits,
      kokoroVersion: ready.kokoroVersion,
    })
    if (!built.ok) return abort({ ok: false, code: providerCodeForKokoroCode(built.code), kokoroCode: built.code })
    manifest = built.manifest
    return {
      ok: true, manifest: { ...manifest },
      discovery: { backend: 'preset', model: KOKORO_MODEL, voices: discovery.voices.map((voice) => ({ ...voice })), languages: [...discovery.languages], limits: { ...discovery.limits } },
    }
  }

  async function health() {
    if (!manifest) return { ok: false, code: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE, state: 'offline' }
    const answer = await supervisor.health({ timeoutMs: KOKORO_LIMITS.handshakeTimeoutMs })
    classification = classifyKokoroHealth({ ready: supervisor.state().ready, health: answer.ok ? { state: answer.state, ...answer.payload } : null, expectedModel: modelIdentity })
    return { ok: true, status: evaluateProviderStatus(manifest, observation()), observation: observation(), worker: supervisor.state() }
  }

  async function beginSynthesis(request, context = {}) {
    if (!manifest) return { ok: false, code: PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE }
    const taskId = context.taskId
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/.test(taskId)) {
      return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'a Task id issued by the existing authority is required' }
    }
    if (taskAuthority) {
      let confirmation
      try { confirmation = await taskAuthority(taskId) } catch { confirmation = null }
      if (!confirmation || confirmation.ok !== true) return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'the existing Task authority did not confirm this Task id' }
      if (confirmation.state !== undefined && !['CREATED', 'PROCESSING'].includes(confirmation.state)) {
        return { ok: false, code: PROVIDER_ERRORS.INVALID_RESPONSE, detail: 'the Task is not in an issuing state' }
      }
    }
    const modality = checkKokoroModality(request, context.binding)
    if (!modality.ok) return { ok: false, code: providerCodeForKokoroCode(modality.code), kokoroCode: modality.code }
    const voiceId = request && request.voiceId
    if (typeof voiceId !== 'string' || !discovery.voices.some((voice) => voice.id === voiceId)) {
      return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_VOICE }
    }
    const requestIdPrefix = taskId.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 24)
    sequence += 1
    const requestId = `${requestIdPrefix || 'kokoro'}-${sequence}`.slice(0, 64)
    const checked = checkSynthesisRequest(manifest, observation(), {
      ...(request && typeof request === 'object' ? request : {}), requestId, voiceId,
    })
    if (!checked.ok) return { ok: false, code: checked.code, status: checked.status || null }
    if (checked.emotion !== 'neutral') return { ok: false, code: PROVIDER_ERRORS.UNSUPPORTED_EMOTION }
    const startedAt = now()
    const effectiveTimeoutMs = Math.max(KOKORO_LIMITS.minRequestTimeoutMs, Math.min(requestTimeoutMs, manifest.capabilities.limits.timeoutMs))
    const payload = {
      requestId, text: request.text, model: KOKORO_MODEL, backend: 'preset', modality: 'preset',
      voiceId: checked.voiceId, language: checked.language,
      format: { mime: 'audio/wav', sampleRate: 24000, channels: 1 }, maxBytes: KOKORO_LIMITS.maxBytes,
    }
    const result = (async () => {
      const answer = await supervisor.synthesize(payload, { timeoutMs: effectiveTimeoutMs })
      if (!answer.ok) {
        const code = answer.code || KOKORO_ERRORS.WORKER_UNAVAILABLE
        if (code === KOKORO_ERRORS.CANCELLED || answer.cancelled === true) {
          return { ok: false, code: PROVIDER_ERRORS.CANCELLED, kokoroCode: KOKORO_ERRORS.CANCELLED, cancelled: true, unknown: false, terminal: 'CANCELLED', requestId, taskId, startedAt, finishedAt: now() }
        }
        const unknown = code === KOKORO_ERRORS.TIMEOUT || code === KOKORO_ERRORS.UNKNOWN_RESULT || answer.unknown === true
        const cancelled = code === KOKORO_ERRORS.TIMEOUT ? await supervisor.cancel(requestId, { timeoutMs: KOKORO_LIMITS.cancelAckTimeoutMs }).catch(() => null) : null
        return { ok: false, code: providerCodeForKokoroCode(code), kokoroCode: code, unknown, terminal: unknown ? 'UNKNOWN' : 'FAILED', requestId, taskId, cancellation: cancelled, blockedByUnresolved: code === KOKORO_ERRORS.UNRESOLVED_ACTIVITY, startedAt, finishedAt: now() }
      }
      const output = validateKokoroOutput({
        payload: answer.payload, manifest, requestId, voiceId: checked.voiceId, model: KOKORO_MODEL,
        backend: 'preset', language: checked.language, createdAt: now(),
        maxBytes: KOKORO_LIMITS.maxBytes, maxAudioSeconds: manifest.capabilities.limits.maxAudioSeconds,
      })
      if (!output.ok) return { ok: false, code: providerCodeForKokoroCode(output.code), kokoroCode: output.code, unknown: output.unknown === true, cancelled: output.cancelled === true, terminal: output.terminal || 'FAILED', requestId, taskId, finishedAt: now() }
      return { ok: true, providerId: KOKORO_PROVIDER_ID, taskId, requestId, result: output.result, bytes: output.bytes, inspection: output.inspection, persisted: false, startedAt, finishedAt: now(), worker: supervisor.state() }
    })()
    return { ok: true, taskId, requestId, voiceId: checked.voiceId, modality: 'preset', timeoutMs: effectiveTimeoutMs, result, cancel: () => supervisor.cancel(requestId, { timeoutMs: KOKORO_LIMITS.cancelAckTimeoutMs }) }
  }

  async function synthesize(request, context = {}) {
    const begun = await beginSynthesis(request, context)
    if (!begun.ok) return begun
    return begun.result
  }

  return {
    ok: true, start, health, synthesize, beginSynthesis,
    shutdown: () => supervisor.stop(),
    cancel: (requestId) => supervisor.cancel(requestId, { timeoutMs: KOKORO_LIMITS.cancelAckTimeoutMs }),
    capabilities: () => (manifest ? JSON.parse(JSON.stringify(manifest.capabilities)) : null),
    manifest: () => (manifest ? JSON.parse(JSON.stringify(manifest)) : null),
    discovery: () => (discovery ? { backend: 'preset', model: KOKORO_MODEL, voices: discovery.voices.map((voice) => ({ ...voice })), languages: [...discovery.languages], limits: { ...discovery.limits } } : null),
    workerState: () => supervisor.state(),
    metadata: () => kokoroMetadataInventory(),
    license: () => kokoroLicenseView(),
  }
}
