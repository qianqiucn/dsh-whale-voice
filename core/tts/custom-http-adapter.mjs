/* Whale Voice — fixed custom HTTP TTS adapter (Plan11, offline unit).
 *
 * One trusted target, one versioned JSON request, one WAV response. The target is validated and
 * resolved once, then pinned into the connection lookup; redirects are rejected, TLS verification
 * stays on, and the response is streamed under an immediate byte cap. Auth is limited to the
 * predefined bearer/x-api-key headers and a credentialRef resolved by Core. No arbitrary template,
 * script, URL downloader, Task, Artifact or delivery route is created here.
 */

import crypto from 'node:crypto'

import { inspectFixtureWavBytes } from '../audio/wav-byte-inspector.mjs'
import {
  PROVIDER_ERRORS,
  checkSynthesisRequest,
  normalizeSynthesisResult,
} from './provider-contract.mjs'
import {
  CUSTOM_HTTP_CHANNELS,
  CUSTOM_HTTP_ERRORS,
  CUSTOM_HTTP_LIMITS,
  CUSTOM_HTTP_MIME,
  CUSTOM_HTTP_PROVIDER_ID,
  CUSTOM_HTTP_PROVIDER_NAME,
  CUSTOM_HTTP_SAMPLE_RATE,
  buildCustomHttpManifest,
  buildCustomRequest,
  customAuthHeader,
  validateCustomTargetShape,
} from './custom-http-contract.mjs'
import {
  CLOUD_HTTP_ERRORS,
  pinnedLookup,
  requestBuffer,
  validateCustomTarget,
} from './cloud-http-security.mjs'

export const CUSTOM_HEALTH_STATES = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CREDENTIALS_MISSING: 'CREDENTIALS_MISSING',
  NETWORK_DISABLED: 'NETWORK_DISABLED',
  CONFIGURED_UNVERIFIED: 'CONFIGURED_UNVERIFIED',
  AVAILABLE: 'AVAILABLE',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  UNKNOWN: 'UNKNOWN',
})

export const CUSTOM_HEALTH_LABELS = Object.freeze({
  NOT_CONFIGURED: '未配置',
  CREDENTIALS_MISSING: '凭据缺失',
  NETWORK_DISABLED: '网络未启用',
  CONFIGURED_UNVERIFIED: '已配置，目标未验证',
  AVAILABLE: '实际可用（已通过真实请求）',
  DEGRADED: '降级',
  UNAVAILABLE: '不可用',
  UNKNOWN: '未知',
})

export function customHealthLabel(state) {
  return CUSTOM_HEALTH_LABELS[state] || CUSTOM_HEALTH_LABELS.UNKNOWN
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@-]{1,127}$/

function fail(code, extra = {}) {
  return { ok: false, code, ...extra }
}

function mapTransportFailure(response) {
  const status = response && response.status
  if (response && response.code === CLOUD_HTTP_ERRORS.CANCELLED) return { code: CUSTOM_HTTP_ERRORS.CANCELLED, cancelled: true, unknown: false, sent: response.sent === true }
  if (response && response.code === CLOUD_HTTP_ERRORS.TIMEOUT) return { code: CUSTOM_HTTP_ERRORS.TIMEOUT, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.REDIRECT_REJECTED) return { code: CUSTOM_HTTP_ERRORS.REDIRECT_REJECTED, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.RESPONSE_TOO_LARGE) return { code: CUSTOM_HTTP_ERRORS.RESPONSE_TOO_LARGE, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.CONTENT_TYPE) return { code: CUSTOM_HTTP_ERRORS.INVALID_AUDIO, unknown: true, sent: true }
  if (response && response.code === CLOUD_HTTP_ERRORS.HTTP_STATUS) {
    if (status === 401 || status === 403) return { code: CUSTOM_HTTP_ERRORS.AUTH_FAILED, unknown: false, sent: true, status }
    if (status === 429) return { code: CUSTOM_HTTP_ERRORS.RATE_LIMITED, unknown: false, sent: true, status }
    return { code: CUSTOM_HTTP_ERRORS.PROVIDER_ERROR, unknown: true, sent: true, status }
  }
  return { code: CUSTOM_HTTP_ERRORS.PROVIDER_ERROR, unknown: true, sent: true }
}

/** Build one fixed custom provider. `transport` is injectable for offline tests. */
export function createCustomHttpProvider(options = {}) {
  const {
    target = null,
    auth = { mode: 'none', credentialRef: null },
    credentialStore = null,
    resolveCredential = null,
    transport = null,
    networkEnabled = false,
    consent = null,
    now = () => new Date(),
    limits = null,
    costMode = 'unknown',
    freeConfirmed = false,
    costLedger = null,
    unitPriceMicrosPerCharacter = null,
    dnsLookup = null,
    requestIdFactory = () => `custom-${crypto.randomUUID()}`,
  } = options
  const shape = validateCustomTargetShape(target)
  const built = shape.ok ? buildCustomHttpManifest({ target, auth, limits, costMode }) : shape
  const manifest = built.ok ? built.manifest : null
  const authMode = auth && auth.mode ? auth.mode : 'none'
  const credentialRef = auth && auth.credentialRef ? auth.credentialRef : null
  let credentialPresent = false
  let credentialCheckedAt = null
  let lastVerifiedAt = null
  let lastVerificationSource = null
  let lastError = null

  async function refreshCredential() {
    if (authMode === 'none') { credentialPresent = false; return false }
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
      if (authMode === 'none') return { ok: true, secret: '' }
      if (typeof resolveCredential === 'function') return await resolveCredential()
      if (credentialStore && typeof credentialStore.resolve === 'function') return await credentialStore.resolve(credentialRef)
    } catch {}
    return fail(CUSTOM_HTTP_ERRORS.CREDENTIALS_MISSING)
  }

  function healthState() {
    if (!built.ok || !manifest) return { state: CUSTOM_HEALTH_STATES.NOT_CONFIGURED, reason: built.code || CUSTOM_HTTP_ERRORS.TARGET_INVALID }
    if (authMode !== 'none' && !credentialPresent) return { state: CUSTOM_HEALTH_STATES.CREDENTIALS_MISSING, reason: CUSTOM_HTTP_ERRORS.CREDENTIALS_MISSING }
    if (!networkEnabled) return { state: CUSTOM_HEALTH_STATES.NETWORK_DISABLED, reason: CUSTOM_HTTP_ERRORS.NETWORK_DISABLED }
    if (lastError) return { state: CUSTOM_HEALTH_STATES.DEGRADED, reason: lastError }
    if (lastVerifiedAt && lastVerificationSource === 'LIVE') return { state: CUSTOM_HEALTH_STATES.AVAILABLE, reason: null }
    return { state: CUSTOM_HEALTH_STATES.CONFIGURED_UNVERIFIED, reason: null }
  }

  async function health() {
    await refreshCredential()
    const state = healthState()
    return {
      ok: true,
      status: {
        providerId: CUSTOM_HTTP_PROVIDER_ID,
        state: state.state,
        stateLabel: customHealthLabel(state.state),
        reason: state.reason,
        observedAt: now().toISOString(),
        credentials: authMode === 'none' ? 'NOT_REQUIRED' : (credentialPresent ? 'PRESENT' : 'MISSING'),
        credentialCheckedAt,
        network: networkEnabled ? (lastVerifiedAt && lastVerificationSource === 'LIVE' ? 'VERIFIED' : 'ENABLED_UNVERIFIED') : 'DISABLED',
        costMode: costMode === 'free' && freeConfirmed === true ? 'FREE' : (costMode === 'paid' ? 'PAID' : 'UNKNOWN'),
        lastVerifiedAt,
        lastVerificationSource,
      },
      manifest: manifest ? JSON.parse(JSON.stringify(manifest)) : null,
    }
  }

  function publicProjection() {
    const state = healthState()
    return {
      providerId: CUSTOM_HTTP_PROVIDER_ID,
      name: CUSTOM_HTTP_PROVIDER_NAME,
      kind: 'CUSTOM',
      state: state.state,
      stateLabel: customHealthLabel(state.state),
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
        credential: authMode === 'none' ? 'NOT_REQUIRED' : (credentialPresent ? 'PRESENT' : 'MISSING'),
        credentialLabel: authMode === 'none' ? '无需凭据' : (credentialPresent ? '凭据已配置' : '凭据缺失'),
        cost: costMode === 'free' && freeConfirmed === true ? 'FREE' : (costMode === 'paid' ? 'PAID' : 'UNKNOWN'),
        costLabel: costMode === 'free' && freeConfirmed === true
          ? '已明确确认免费（仍受调用次数与文字上限及持久去重约束）'
          : costMode === 'paid'
            ? (unitPriceMicrosPerCharacter ? '明确付费，单价已配置' : '明确付费，但单价未知，禁止请求')
            : '费用未知，禁止请求；不能按免费执行',
      },
      retention: 'unknown',
      retentionLabel: '自定义服务留存政策 UNKNOWN，不能继承 Azure 的说明。',
      target: { configured: Boolean(shape.ok), scheme: shape.ok ? shape.protocol : null },
      note: '离线候选；公开投影不包含目标主机、路径、凭据引用或秘密。',
    }
  }

  async function defaultTransport(requestOptions, targetInfo) {
    return requestBuffer({
      ...requestOptions,
      url: targetInfo.url,
      lookup: pinnedLookup(targetInfo.pinnedAddress, targetInfo.family),
    }).then((response) => {
      if (response.ok) response.live = true
      return response
    })
  }

  async function synthesize(request, context = {}) {
    if (!manifest) return fail(CUSTOM_HTTP_ERRORS.PROVIDER_NOT_AVAILABLE)
    if (!request || typeof request !== 'object' || Array.isArray(request)) return fail(PROVIDER_ERRORS.INVALID_RESPONSE)
    const signal = context.signal || null
    if (signal && signal.aborted) {
      return fail(CUSTOM_HTTP_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    const requestId = typeof request.requestId === 'string' ? request.requestId : requestIdFactory()
    if (!REQUEST_ID_PATTERN.test(requestId)) return fail(CUSTOM_HTTP_ERRORS.PROTOCOL_INVALID)
    const builtRequest = buildCustomRequest({
      requestId,
      text: request.text,
      voiceId: request.voiceId || 'custom-default',
      language: request.language || 'zh-CN',
    })
    if (!builtRequest.ok) return fail(builtRequest.code)
    if (!networkEnabled) return fail(CUSTOM_HTTP_ERRORS.NETWORK_DISABLED)
    if (!consent || consent.textUpload !== true || (consent.providerId && consent.providerId !== CUSTOM_HTTP_PROVIDER_ID)) {
      return fail(CUSTOM_HTTP_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED)
    }
    await refreshCredential()
    if (signal && signal.aborted) {
      return fail(CUSTOM_HTTP_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    const secret = await resolveSecret()
    if (signal && signal.aborted) {
      return fail(CUSTOM_HTTP_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    if (authMode !== 'none' && (!secret || secret.ok !== true || typeof secret.secret !== 'string' || secret.secret.length === 0)) {
      return fail(CUSTOM_HTTP_ERRORS.CREDENTIALS_MISSING)
    }
    if (Buffer.byteLength(builtRequest.body, 'utf8') > CUSTOM_HTTP_LIMITS.maxRequestBytes) {
      return fail(CUSTOM_HTTP_ERRORS.PROTOCOL_INVALID)
    }
    const checked = checkSynthesisRequest(manifest, { state: 'ok', credentials: authMode === 'none' ? 'not_required' : 'present', observedAt: now().toISOString() }, {
      ...request,
      requestId,
      voiceId: request.voiceId || 'custom-default',
      language: request.language || 'zh-CN',
    })
    if (!checked.ok) return fail(checked.code)
    const targetInfo = dnsLookup
      ? await validateCustomTarget(target, { dnsLookup })
      : await validateCustomTarget(target)
    if (!targetInfo.ok) return fail(targetInfo.code, { sent: false })
    if (signal && signal.aborted) {
      return fail(CUSTOM_HTTP_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    if (costMode === 'unknown' || (costMode === 'free' && freeConfirmed !== true)) {
      return fail(CUSTOM_HTTP_ERRORS.COST_UNKNOWN, { sent: false })
    }
    if (!costLedger || typeof costLedger.reserve !== 'function') {
      return fail(CUSTOM_HTTP_ERRORS.COST_UNKNOWN, { sent: false })
    }
    const ledgerView = costLedger.snapshot ? costLedger.snapshot() : null
    if (!ledgerView || !ledgerView.ok || ledgerView.mode !== costMode) {
      return fail(CUSTOM_HTTP_ERRORS.COST_UNKNOWN, { sent: false })
    }
    if (costMode === 'paid' && !(ledgerView.unitPriceMicrosPerCharacter > 0)) {
      return fail(CUSTOM_HTTP_ERRORS.COST_UNKNOWN, { sent: false })
    }
    const reservation = await costLedger.reserve({ requestId, charCount: String(request.text).length })
    if (!reservation || reservation.ok !== true) {
      const code = reservation && reservation.code
      if (code === 'COST_DUPLICATE_REQUEST') return fail(CUSTOM_HTTP_ERRORS.COST_DUPLICATE_REQUEST, { sent: false })
      if (code === 'COST_CALL_LIMIT_EXCEEDED') return fail(CUSTOM_HTTP_ERRORS.COST_CALL_LIMIT_EXCEEDED, { sent: false })
      if (code === 'COST_QUOTA_EXCEEDED' || code === 'COST_DEDUP_CAPACITY') {
        return fail(CUSTOM_HTTP_ERRORS.COST_QUOTA_EXCEEDED, { sent: false })
      }
      return fail(CUSTOM_HTTP_ERRORS.COST_UNKNOWN, { sent: false })
    }
    if (signal && signal.aborted) {
      await costLedger.release({ reservationId: reservation.reservationId }).catch(() => {})
      return fail(CUSTOM_HTTP_ERRORS.CANCELLED, { terminal: 'CANCELLED', cancelled: true, sent: false })
    }
    const authHeader = customAuthHeader(auth, secret && secret.secret ? secret.secret : '')
    if (!authHeader) {
      await costLedger.release({ reservationId: reservation.reservationId }).catch(() => {})
      return fail(CUSTOM_HTTP_ERRORS.AUTH_INVALID, { sent: false })
    }
    const startedAt = now().toISOString()
    const transportFn = transport || ((requestOptions) => defaultTransport(requestOptions, targetInfo))
    let response
    try {
      response = await transportFn({
        url: targetInfo.url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: CUSTOM_HTTP_MIME,
          ...authHeader,
        },
        body: builtRequest.body,
        timeoutMs: manifest.capabilities.limits.timeoutMs,
        maxResponseBytes: CUSTOM_HTTP_LIMITS.maxResponseBytes,
        maxHeaderBytes: CUSTOM_HTTP_LIMITS.maxHeaderBytes,
        expectedMime: CUSTOM_HTTP_MIME,
        signal: context.signal || null,
      })
    } catch {
      response = fail(CLOUD_HTTP_ERRORS.NETWORK_ERROR, { sent: true })
    }

    if (!response || response.ok !== true) {
      const mapped = mapTransportFailure(response)
      if (mapped.sent === true) {
        await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      } else {
        await costLedger.release({ reservationId: reservation.reservationId }).catch(() => {})
      }
      lastError = mapped.code
      return fail(mapped.code, {
        terminal: mapped.cancelled ? 'CANCELLED' : (mapped.unknown ? 'UNKNOWN' : 'FAILED'),
        cancelled: mapped.cancelled === true,
        unknown: mapped.unknown === true,
        sent: mapped.sent === true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot ? costLedger.snapshot() : null,
      })
    }

    if (signal && signal.aborted) {
      const committedOnCancel = await costLedger.commit({ reservationId: reservation.reservationId, actualMicros: reservation.micros }).catch(() => null)
      if (!committedOnCancel || committedOnCancel.ok !== true) {
        await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      }
      return fail(CUSTOM_HTTP_ERRORS.CANCELLED, {
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
    if (!inspection || inspection.sampleRate !== CUSTOM_HTTP_SAMPLE_RATE ||
        inspection.channels !== CUSTOM_HTTP_CHANNELS ||
        inspection.durationMs > manifest.capabilities.limits.maxAudioSeconds * 1000) {
      await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      lastError = CUSTOM_HTTP_ERRORS.INVALID_AUDIO
      return fail(CUSTOM_HTTP_ERRORS.INVALID_AUDIO, {
        terminal: 'UNKNOWN',
        unknown: true,
        sent: true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot(),
      })
    }

    const digest = crypto.createHash('sha256').update(response.body).digest('hex')
    const normalized = normalizeSynthesisResult(manifest, {
      requestId,
      voiceId: 'custom-default',
      language: checked.language || 'zh-CN',
      emotion: 'neutral',
      artifactRef: `cloud:${CUSTOM_HTTP_PROVIDER_ID}:${digest}`,
      mime: CUSTOM_HTTP_MIME,
      sampleRate: CUSTOM_HTTP_SAMPLE_RATE,
      channels: CUSTOM_HTTP_CHANNELS,
      durationMs: inspection.durationMs,
      createdAt: now().toISOString(),
      warnings: ['PRESET_ONLY', 'CUSTOM_SERVICE_RETENTION_UNKNOWN', 'NO_CLONE'],
      delivery: { state: 'PENDING_ROUTER' },
    })
    if (!normalized.ok) {
      await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      lastError = PROVIDER_ERRORS.INVALID_RESPONSE
      return fail(PROVIDER_ERRORS.INVALID_RESPONSE, { terminal: 'FAILED', requestId, startedAt, finishedAt: now().toISOString(), cost: costLedger.snapshot() })
    }
    let committed
    try {
      committed = await costLedger.commit({ reservationId: reservation.reservationId, actualMicros: reservation.micros })
    } catch {
      committed = null
    }
    if (signal && signal.aborted) {
      if (!committed || committed.ok !== true) {
        await costLedger.markUnknown({ reservationId: reservation.reservationId }).catch(() => {})
      }
      return fail(CUSTOM_HTTP_ERRORS.CANCELLED, {
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
      return fail(CUSTOM_HTTP_ERRORS.COST_UNKNOWN, {
        terminal: 'UNKNOWN',
        unknown: true,
        sent: true,
        requestId,
        startedAt,
        finishedAt: now().toISOString(),
        cost: costLedger.snapshot(),
      })
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
      providerId: CUSTOM_HTTP_PROVIDER_ID,
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
    providerId: CUSTOM_HTTP_PROVIDER_ID,
    health,
    synthesize,
    capabilities: () => (manifest ? JSON.parse(JSON.stringify(manifest.capabilities)) : null),
    manifest: () => (manifest ? JSON.parse(JSON.stringify(manifest)) : null),
    publicProjection,
    metadata: () => ({
      providerId: CUSTOM_HTTP_PROVIDER_ID,
      protocol: 'whale-voice-custom-tts/v1',
      outputFormat: CUSTOM_HTTP_MIME,
      sampleRate: CUSTOM_HTTP_SAMPLE_RATE,
      channels: CUSTOM_HTTP_CHANNELS,
      targetPolicy: 'https or explicit numeric loopback HTTP; DNS pinned; redirects rejected',
      retention: 'UNKNOWN',
      costMode: costMode === 'free' && freeConfirmed === true ? 'FREE' : (costMode === 'paid' ? 'PAID' : 'UNKNOWN'),
    }),
  }
}
