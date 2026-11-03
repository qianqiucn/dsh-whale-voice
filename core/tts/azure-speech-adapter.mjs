/* Whale Voice — narrow Azure Speech standard preset neural adapter (Plan11, offline unit).
 *
 * One synchronous REST call, one small preset voice set, plain text only. The credential is
 * resolved by Core from a credentialRef and placed only in the required request header. Network is
 * disabled by default and requires explicit consent, a known conservative cost bound and a valid
 * credential before any request. Fake/offline successes never become ONLINE; only a real live
 * response can set the verified state.
 */

import crypto from 'node:crypto'

import { inspectFixtureWavBytes } from '../audio/wav-byte-inspector.mjs'
import {
  PROVIDER_ERRORS,
  checkSynthesisRequest,
  normalizeSynthesisResult,
} from './provider-contract.mjs'
import {
  AZURE_SPEECH_CHANNELS,
  AZURE_SPEECH_ERRORS,
  AZURE_SPEECH_LIMITS,
  AZURE_SPEECH_MIME,
  AZURE_SPEECH_OUTPUT_FORMAT,
  AZURE_SPEECH_PROVIDER_ID,
  AZURE_SPEECH_PROVIDER_NAME,
  AZURE_SPEECH_SAMPLE_RATE,
  buildAzureSpeechManifest,
  buildAzureSsml,
  azureEndpoint,
  providerCodeForAzure,
} from './azure-speech-contract.mjs'
import {
  CLOUD_HTTP_ERRORS,
  pinnedLookup,
  requestBuffer,
  validateCustomTarget,
} from './cloud-http-security.mjs'

export const AZURE_HEALTH_STATES = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CREDENTIALS_MISSING: 'CREDENTIALS_MISSING',
  NETWORK_DISABLED: 'NETWORK_DISABLED',
  CONFIGURED_UNVERIFIED: 'CONFIGURED_UNVERIFIED',
  AVAILABLE: 'AVAILABLE',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  UNKNOWN: 'UNKNOWN',
})

export const AZURE_HEALTH_LABELS = Object.freeze({
  NOT_CONFIGURED: '未配置',
  CREDENTIALS_MISSING: '凭据缺失',
  NETWORK_DISABLED: '网络未启用',
  CONFIGURED_UNVERIFIED: '已配置，网络未验证',
  AVAILABLE: '实际可用（已通过真实请求）',
  DEGRADED: '降级',
  UNAVAILABLE: '不可用',
  UNKNOWN: '未知',
})

export function azureHealthLabel(state) {
  return AZURE_HEALTH_LABELS[state] || AZURE_HEALTH_LABELS.UNKNOWN
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/

function fail(code, extra = {}) {
  return { ok: false, code, ...extra }
}

function mapTransportFailure(response) {
  const status = response && response.status
  if (response && response.code === CLOUD_HTTP_ERRORS.CANCELLED) return { code: AZURE_SPEECH_ERRORS.CANCELLED, cancelled: true, unknown: false, sent: response.sent === true }
  if (response && response.code === CLOUD_HTTP_ERRORS.TIMEOUT) return { code: AZURE_SPEECH_ERRORS.TIMEOUT, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.REDIRECT_REJECTED) return { code: AZURE_SPEECH_ERRORS.REDIRECT_REJECTED, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.RESPONSE_TOO_LARGE) return { code: AZURE_SPEECH_ERRORS.RESPONSE_TOO_LARGE, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.CONTENT_TYPE) return { code: AZURE_SPEECH_ERRORS.INVALID_AUDIO, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.HTTP_STATUS) {
    if (status === 401 || status === 403) return { code: AZURE_SPEECH_ERRORS.AUTH_FAILED, unknown: false, sent: true, status }
    if (status === 429) return { code: AZURE_SPEECH_ERRORS.RATE_LIMITED, unknown: false, sent: true, status }
    return { code: AZURE_SPEECH_ERRORS.PROVIDER_ERROR, unknown: true, sent: true, status }
  }
  return { code: AZURE_SPEECH_ERRORS.PROVIDER_ERROR, unknown: true, sent: true }
}

function auditVoiceIds(manifest) {
  return new Set(manifest.capabilities.voices.map((voice) => voice.id))
}

/** Build the one narrow Azure provider. `transport` is injectable for offline tests. */
export function createAzureSpeechProvider(options = {}) {
  const {
    region = null,
    credentialRef = null,
    credentialStore = null,
    resolveCredential = null,
    transport = null,
    networkEnabled = false,
    consent = null,
    costLedger = null,
    unitPriceMicrosPerCharacter = null,
    now = () => new Date(),
    voices = null,
    limits = null,
    requestIdFactory = () => `azure-${crypto.randomUUID()}`,
  } = options

  let manifest = null
  let lastVerifiedAt = null
  let lastVerificationSource = null
  let lastError = null
  let credentialPresent = false
  let credentialCheckedAt = null

  const built = buildAzureSpeechManifest({ region, credentialRef, voices, limits })
  if (built.ok) manifest = built.manifest
  const voiceIds = manifest ? auditVoiceIds(manifest) : new Set()
  const endpoint = azureEndpoint(region)

  async function refreshCredential() {
    if (!credentialRef) { credentialPresent = false; return false }
    try {
      if (credentialStore && typeof credentialStore.has === 'function') {
        const result = await credentialStore.has(credentialRef)
        credentialPresent = Boolean(result && result.ok && result.present)
      } else if (typeof resolveCredential === 'function') {
        const result = await resolveCredential()
        credentialPresent = Boolean(result && result.ok === true)
      } else {
        credentialPresent = false
      }
    } catch {
      credentialPresent = false
    }
    credentialCheckedAt = now().toISOString()
    return credentialPresent
  }

  async function resolveSecret() {
    try {
      if (typeof resolveCredential === 'function') return await resolveCredential()
      if (credentialStore && typeof credentialStore.resolve === 'function') return await credentialStore.resolve(credentialRef)
    } catch {}
    return fail(AZURE_SPEECH_ERRORS.CREDENTIALS_MISSING)
  }

  function costLedgerView() {
    try {
      return costLedger && typeof costLedger.snapshot === 'function' ? costLedger.snapshot() : null
    } catch {
      return null
    }
  }

  function costValid() {
    const view = costLedgerView()
    return Boolean(view && view.ok === true && view.mode === 'paid' && view.unitPriceMicrosPerCharacter > 0)
  }

  function healthState() {
    if (!built.ok) return { state: AZURE_HEALTH_STATES.NOT_CONFIGURED, reason: built.code }
    if (!credentialRef) return { state: AZURE_HEALTH_STATES.NOT_CONFIGURED, reason: AZURE_SPEECH_ERRORS.CREDENTIALS_MISSING }
    if (!credentialPresent) return { state: AZURE_HEALTH_STATES.CREDENTIALS_MISSING, reason: AZURE_SPEECH_ERRORS.CREDENTIALS_MISSING }
    if (!networkEnabled) return { state: AZURE_HEALTH_STATES.NETWORK_DISABLED, reason: AZURE_SPEECH_ERRORS.NETWORK_DISABLED }
    if (!costValid()) return { state: AZURE_HEALTH_STATES.DEGRADED, reason: AZURE_SPEECH_ERRORS.COST_UNKNOWN }
    if (lastError) return { state: AZURE_HEALTH_STATES.DEGRADED, reason: lastError }
    if (lastVerifiedAt && lastVerificationSource === 'LIVE') return { state: AZURE_HEALTH_STATES.AVAILABLE, reason: null }
    return { state: AZURE_HEALTH_STATES.CONFIGURED_UNVERIFIED, reason: null }
  }

  async function health() {
    await refreshCredential()
    const observedAt = now().toISOString()
    const state = healthState()
    return {
      ok: true,
      status: {
        providerId: AZURE_SPEECH_PROVIDER_ID,
        state: state.state,
        stateLabel: azureHealthLabel(state.state),
        reason: state.reason,
        observedAt,
        credentials: credentialPresent ? 'PRESENT' : 'MISSING',
        credentialCheckedAt,
        network: networkEnabled ? (lastVerifiedAt && lastVerificationSource === 'LIVE' ? 'VERIFIED' : 'ENABLED_UNVERIFIED') : 'DISABLED',
        cost: { mode: costLedgerView() ? costLedgerView().mode : null, valid: costValid(), unitPriceMicrosPerCharacter: costLedgerView() ? costLedgerView().unitPriceMicrosPerCharacter : null },
        version: { value: null, audited: false },
        lastVerifiedAt,
        lastVerificationSource,
      },
      manifest: manifest ? JSON.parse(JSON.stringify(manifest)) : null,
    }
  }

  function publicProjection() {
    const state = healthState()
    return {
      providerId: AZURE_SPEECH_PROVIDER_ID,
      name: AZURE_SPEECH_PROVIDER_NAME,
      kind: 'CLOUD',
      state: state.state,
      stateLabel: azureHealthLabel(state.state),
      capabilities: manifest ? {
        languages: [...manifest.capabilities.languages],
        voices: manifest.capabilities.voices.map((voice) => ({ id: voice.id, name: voice.name, kind: voice.kind, languages: [...voice.languages] })),
        clone: false,
        emotion: false,
        streaming: false,
        formats: manifest.capabilities.formats.map((format) => ({ ...format })),
        maxChars: manifest.capabilities.limits.maxChars,
        maxAudioSeconds: manifest.capabilities.limits.maxAudioSeconds,
      } : null,
      gates: {
        network: networkEnabled ? 'ENABLED' : 'DISABLED',
        networkLabel: networkEnabled ? '网络已启用（每次仍需操作授权）' : '网络未启用',
        upload: consent && consent.textUpload === true ? 'CONFIRMED' : 'NOT_CONFIRMED',
        uploadLabel: consent && consent.textUpload === true ? '已确认文字上传' : '未确认文字上传',
        credential: credentialPresent ? 'PRESENT' : 'MISSING',
        credentialLabel: credentialPresent ? '凭据已配置' : '凭据缺失',
        cost: costValid() ? 'KNOWN' : 'UNKNOWN',
        costLabel: costValid() ? '付费账本与正价已配置' : '付费账本/正价无效，禁止请求',
      },
      retention: manifest ? manifest.privacy.retention : 'unknown',
      retentionLabel: 'Azure 标准预置音色官方说明不存文字/音频日志；账户与地区条款仍需确认。',
      note: '离线候选；不包含真实凭据、端点或账户权限。',
    }
  }

  async function defaultTransport(requestOptions) {
    const target = await validateCustomTarget(requestOptions.url)
    if (!target.ok) return fail(target.code, { sent: false })
    const response = await requestBuffer({
      ...requestOptions,
      url: target.url,
      lookup: pinnedLookup(target.pinnedAddress, target.family),
    })
    if (response.ok) response.live = true
    return response
  }

  async function synthesize(request, context = {}) {
    if (!manifest) return fail(AZURE_SPEECH_ERRORS.PROVIDER_NOT_AVAILABLE)
    if (!request || typeof request !== 'object' || Array.isArray(request)) return fail(PROVIDER_ERRORS.INVALID_RESPONSE)
    const signal = context.signal || null
    if (signal && signal.aborted) {
      return fail(AZURE_SPEECH_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    const text = request.text
    const voiceId = request.voiceId
    const language = request.language || null
    const ssml = buildAzureSsml({ text, voiceId, language })
    if (!ssml.ok) return fail(ssml.code)
    if (!voiceIds.has(ssml.voiceId)) return fail(AZURE_SPEECH_ERRORS.VOICE_UNSUPPORTED)
    if (!networkEnabled) return fail(AZURE_SPEECH_ERRORS.NETWORK_DISABLED)
    if (!consent || consent.textUpload !== true || (consent.providerId && consent.providerId !== AZURE_SPEECH_PROVIDER_ID)) {
      return fail(AZURE_SPEECH_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED)
    }
    await refreshCredential()
    if (signal && signal.aborted) {
      return fail(AZURE_SPEECH_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    const secret = await resolveSecret()
    if (signal && signal.aborted) {
      return fail(AZURE_SPEECH_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    if (!secret || secret.ok !== true || typeof secret.secret !== 'string' || secret.secret.length === 0) {
      return fail(AZURE_SPEECH_ERRORS.CREDENTIALS_MISSING)
    }
    if (!costLedger || !costValid()) return fail(AZURE_SPEECH_ERRORS.COST_UNKNOWN, { sent: false })
    const requestId = typeof request.requestId === 'string' ? request.requestId : requestIdFactory()
    if (!REQUEST_ID_PATTERN.test(requestId)) return fail(PROVIDER_ERRORS.INVALID_RESPONSE)
    const checked = checkSynthesisRequest(manifest, { state: 'ok', credentials: 'present', observedAt: now().toISOString() }, {
      ...request,
      requestId,
      voiceId: ssml.voiceId,
      language: ssml.language,
    })
    if (!checked.ok) return fail(checked.code)
    const reservation = await costLedger.reserve({ requestId, charCount: text.length })
    if (!reservation || reservation.ok !== true) {
      const code = reservation && reservation.code
      if (code === 'COST_QUOTA_EXCEEDED' || code === 'COST_CALL_LIMIT_EXCEEDED' || code === 'COST_DEDUP_CAPACITY') {
        return fail(AZURE_SPEECH_ERRORS.COST_QUOTA_EXCEEDED)
      }
      if (code === 'COST_DUPLICATE_REQUEST') return fail(AZURE_SPEECH_ERRORS.COST_DUPLICATE_REQUEST)
      return fail(AZURE_SPEECH_ERRORS.COST_UNKNOWN)
    }
    if (signal && signal.aborted) {
      await costLedger.release({ reservationId: reservation.reservationId }).catch(() => {})
      return fail(AZURE_SPEECH_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    const startedAt = now().toISOString()
    const transportFn = transport || defaultTransport
    const timeoutMs = manifest.capabilities.limits.timeoutMs
    let response
    try {
      response = await transportFn({
        url: endpoint,
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': secret.secret,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': AZURE_SPEECH_OUTPUT_FORMAT,
          'User-Agent': 'WhaleVoice/0.1 (offline candidate)',
        },
        body: ssml.ssml,
        timeoutMs,
        maxResponseBytes: AZURE_SPEECH_LIMITS.maxResponseBytes,
        maxHeaderBytes: AZURE_SPEECH_LIMITS.maxHeaderBytes,
        expectedMime: AZURE_SPEECH_MIME,
        signal: context.signal || null,
      })
    } catch {
      response = fail(CLOUD_HTTP_ERRORS.NETWORK_ERROR, { sent: true })
    }

    if (!response || response.ok !== true) {
      const mapped = mapTransportFailure(response)
      const sent = mapped.sent === true
      if (sent) {
        await costLedger.markUnknown({ reservationId: reservation.reservationId })
      } else {
        await costLedger.release({ reservationId: reservation.reservationId })
      }
      lastError = mapped.code
      return fail(mapped.code, {
        terminal: mapped.cancelled ? 'CANCELLED' : (mapped.unknown ? 'UNKNOWN' : 'FAILED'),
        cancelled: mapped.cancelled === true,
        unknown: mapped.unknown === true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot(),
      })
    }

    if (signal && signal.aborted) {
      const committedOnCancel = await costLedger.commit({ reservationId: reservation.reservationId, actualMicros: reservation.micros }).catch(() => null)
      if (!committedOnCancel || committedOnCancel.ok !== true) {
        await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      }
      return fail(AZURE_SPEECH_ERRORS.CANCELLED, {
        terminal: 'CANCELLED',
        cancelled: true,
        unknown: false,
        sent: true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot(),
      })
    }

    const inspected = inspectFixtureWavBytes({ schemaVersion: 1, bytes: response.body })
    const inspection = inspected.ok ? inspected.value : null
    if (!inspection || inspection.sampleRate !== AZURE_SPEECH_SAMPLE_RATE ||
        inspection.channels !== AZURE_SPEECH_CHANNELS ||
        inspection.durationMs > manifest.capabilities.limits.maxAudioSeconds * 1000) {
      await costLedger.markUnknown({ reservationId: reservation.reservationId })
      lastError = AZURE_SPEECH_ERRORS.INVALID_AUDIO
      return fail(AZURE_SPEECH_ERRORS.INVALID_AUDIO, {
        terminal: 'UNKNOWN',
        unknown: true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot(),
      })
    }

    const actualMicros = reservation.micros
    let committed
    try {
      committed = await costLedger.commit({ reservationId: reservation.reservationId, actualMicros })
    } catch {
      committed = null
    }
    if (signal && signal.aborted) {
      if (!committed || committed.ok !== true) {
        await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      }
      return fail(AZURE_SPEECH_ERRORS.CANCELLED, {
        terminal: 'CANCELLED',
        cancelled: true,
        unknown: false,
        sent: true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot(),
      })
    }
    if (!committed || committed.ok !== true) {
      await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      return fail(AZURE_SPEECH_ERRORS.COST_UNKNOWN, {
        terminal: 'UNKNOWN',
        unknown: true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot(),
      })
    }

    const digest = crypto.createHash('sha256').update(response.body).digest('hex')
    const normalized = normalizeSynthesisResult(manifest, {
      requestId,
      voiceId: ssml.voiceId,
      language: ssml.language,
      emotion: 'neutral',
      artifactRef: `cloud:${AZURE_SPEECH_PROVIDER_ID}:${digest}`,
      mime: AZURE_SPEECH_MIME,
      sampleRate: AZURE_SPEECH_SAMPLE_RATE,
      channels: AZURE_SPEECH_CHANNELS,
      durationMs: inspection.durationMs,
      createdAt: now().toISOString(),
      warnings: ['PRESET_ONLY', 'NO_SSML_INPUT', 'NO_CLONE'],
      delivery: { state: 'PENDING_ROUTER' },
    })
    if (!normalized.ok) {
      lastError = PROVIDER_ERRORS.INVALID_RESPONSE
      return fail(PROVIDER_ERRORS.INVALID_RESPONSE, { terminal: 'FAILED', requestId, startedAt, finishedAt: now().toISOString() })
    }
    if (response.live === true) {
      lastVerifiedAt = now().toISOString()
      lastVerificationSource = 'LIVE'
      lastError = null
    } else {
      lastVerificationSource = 'INJECTED_TEST'
    }
    return {
      ok: true,
      providerId: AZURE_SPEECH_PROVIDER_ID,
      requestId,
      result: normalized.result,
      bytes: Buffer.from(response.body),
      inspection,
      persisted: false,
      startedAt,
      finishedAt: now().toISOString(),
      cost: costLedger.snapshot(),
    }
  }

  return {
    ok: Boolean(manifest),
    providerId: AZURE_SPEECH_PROVIDER_ID,
    health,
    synthesize,
    capabilities: () => (manifest ? JSON.parse(JSON.stringify(manifest.capabilities)) : null),
    manifest: () => (manifest ? JSON.parse(JSON.stringify(manifest)) : null),
    publicProjection,
    metadata: () => ({
      providerId: AZURE_SPEECH_PROVIDER_ID,
      endpointPolicy: 'https-only',
      outputFormat: AZURE_SPEECH_OUTPUT_FORMAT,
      sampleRate: AZURE_SPEECH_SAMPLE_RATE,
      channels: AZURE_SPEECH_CHANNELS,
      regions: 'fixed allowlist',
      voices: 'fixed preset allowlist',
      officialDocs: 'https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech',
      price: 'UNKNOWN; explicit bound required before real execution',
    }),
  }
}
