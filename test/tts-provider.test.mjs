import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PROVIDER_ERRORS,
  PROVIDER_KINDS,
  PROVIDER_STATES,
  PROVIDER_VERSION_STATES,
  checkSynthesisRequest,
  evaluateProviderStatus,
  normalizeProviderError,
  normalizeProviderManifest,
  normalizeSynthesisResult,
  providerCapabilitySummary,
  providerVersionView,
  validateProviderManifest,
} from '../core/tts/provider-contract.mjs'
import {
  getProviderCandidate,
  getRegistryView,
  listProviderCandidates,
  selectProviderCandidate,
} from '../core/tts/provider-registry.mjs'
import {
  TTS_CONFIG_SCHEMA_VERSION,
  TTS_CONFIG_ERRORS,
  credentialStateForProvider,
  migrateTtsConfig,
  publicTtsConfig,
  resolveEmotionForProvider,
  resolveVoiceForProvider,
  selectProvider,
  validateTtsConfig,
} from '../core/tts/provider-config.mjs'

function localManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'fake-local',
    name: 'Fake Local TTS',
    kind: PROVIDER_KINDS.LOCAL,
    version: { value: '1.0.0', source: 'fixture', audited: false },
    capabilities: {
      languages: ['zh-CN'],
      voices: [{ id: 'voice-local', name: 'Local Voice', kind: 'preset', languages: ['zh-CN'], referenceAudioRequired: false }],
      clone: { supported: false, requiresReferenceAudio: false },
      emotion: { supported: false, modes: [], defaultMode: 'neutral' },
      streaming: false,
      formats: [{ mime: 'audio/wav', sampleRate: 24000, channels: 1 }],
      limits: { maxChars: 100, timeoutMs: 5000, maxAudioSeconds: 30 },
      retry: { maxAttempts: 1, retryOn: ['TIMEOUT'], idempotent: true },
      cancellation: true,
    },
    health: { mode: 'local', path: null, timeoutMs: 1000, auth: 'none' },
    credentials: { required: false, storage: 'none', ref: null },
    network: { required: false, textUpload: false, endpointPolicy: 'loopback-only' },
    privacy: { textLeavesDevice: false, retention: 'none', note: 'fixture only' },
    cost: { paid: false, model: 'free', note: 'fixture only' },
    resources: { local: true, gpuRequired: false, cpuCapable: true },
    ...overrides,
  }
}

function cloudManifest(overrides = {}) {
  return localManifest({
    id: 'fake-cloud',
    name: 'Fake Cloud TTS',
    kind: PROVIDER_KINDS.CLOUD,
    capabilities: {
      ...localManifest().capabilities,
      voices: [{ id: 'voice-cloud', name: 'Cloud Voice', kind: 'preset', languages: ['zh-CN', 'en-US'], referenceAudioRequired: false }],
      emotion: { supported: true, modes: ['neutral', 'happy'], defaultMode: 'neutral' },
      streaming: true,
    },
    credentials: { required: true, storage: 'os-keychain', ref: null },
    network: { required: true, textUpload: true, endpointPolicy: 'https-only' },
    privacy: { textLeavesDevice: true, retention: 'provider', note: 'fixture declares upload' },
    cost: { paid: true, model: 'per-character', note: 'fixture only' },
    resources: { local: false, gpuRequired: false, cpuCapable: false },
    ...overrides,
  })
}

test('local and fake-cloud providers expose independent capabilities and status', () => {
  const local = normalizeProviderManifest(localManifest())
  const cloud = normalizeProviderManifest(cloudManifest())
  assert.equal(local.ok, true)
  assert.equal(cloud.ok, true)

  assert.equal(evaluateProviderStatus(local.manifest, { state: 'ok' }).state, PROVIDER_STATES.AVAILABLE)
  assert.equal(evaluateProviderStatus(cloud.manifest, { state: 'ok', credentials: 'present' }).state, PROVIDER_STATES.AVAILABLE)
  assert.equal(evaluateProviderStatus(cloud.manifest, { state: 'ok', credentials: 'missing' }).state, PROVIDER_STATES.CREDENTIALS_MISSING)
  assert.equal(evaluateProviderStatus(local.manifest, { state: 'offline' }).state, PROVIDER_STATES.UNAVAILABLE)
  assert.equal(evaluateProviderStatus(cloud.manifest, { state: 'offline', credentials: 'present' }).state, PROVIDER_STATES.UNAVAILABLE)

  const localSummary = providerCapabilitySummary(local.manifest)
  const cloudSummary = providerCapabilitySummary(cloud.manifest)
  assert.equal(localSummary.clone, false)
  assert.equal(localSummary.emotion, false)
  assert.equal(localSummary.streaming, false)
  assert.equal(cloudSummary.emotion, true)
  assert.equal(cloudSummary.streaming, true)
  assert.equal(cloudSummary.textLeavesDevice, true)
  assert.equal(cloudSummary.paid, true)
})

test('Qwen offline does not make another provider unavailable', () => {
  const qwen = normalizeProviderManifest(localManifest({ id: 'qwen3-tts', name: 'Qwen3-TTS' }))
  const cloud = normalizeProviderManifest(cloudManifest())
  assert.equal(qwen.ok, true)
  assert.equal(cloud.ok, true)
  assert.equal(evaluateProviderStatus(qwen.manifest, { state: 'offline' }).state, PROVIDER_STATES.UNAVAILABLE)
  assert.equal(evaluateProviderStatus(cloud.manifest, { state: 'ok', credentials: 'present' }).state, PROVIDER_STATES.AVAILABLE)

  // Registry selection remains design-only and never silently falls back to Qwen.
  const registry = getRegistryView()
  assert.equal(registry.status, 'DESIGN_ONLY')
  assert.equal(registry.defaultProviderId, null)
  assert.deepEqual(registry.selectable, [])
  assert.deepEqual(registry.implemented, [])
  assert.equal(selectProviderCandidate('qwen3-tts').ok, false)
  assert.equal(selectProviderCandidate('fake-cloud').code, 'PROVIDER_UNKNOWN')
})

test('unsupported voice, language, emotion and streaming fail closed', () => {
  const local = normalizeProviderManifest(localManifest()).manifest
  const cloud = normalizeProviderManifest(cloudManifest()).manifest
  const baseRequest = { text: 'hello', voiceId: 'voice-local', language: 'zh-CN' }

  assert.equal(checkSynthesisRequest(local, { state: 'ok' }, { ...baseRequest, voiceId: 'voice-missing' }).code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
  assert.equal(checkSynthesisRequest(local, { state: 'ok' }, baseRequest).ok, true)
  assert.equal(checkSynthesisRequest(local, { state: 'ok' }, { ...baseRequest, language: 'en-US' }).code, PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE)
  assert.equal(checkSynthesisRequest(local, { state: 'ok' }, { ...baseRequest, emotion: 'happy' }).code, PROVIDER_ERRORS.UNSUPPORTED_EMOTION)
  assert.equal(checkSynthesisRequest(local, { state: 'ok' }, { ...baseRequest, streaming: true }).code, PROVIDER_ERRORS.UNSUPPORTED_STREAMING)
  assert.equal(checkSynthesisRequest(cloud, { state: 'ok', credentials: 'missing' }, { ...baseRequest, voiceId: 'voice-cloud' }).code, PROVIDER_ERRORS.CREDENTIALS_MISSING)
  assert.equal(checkSynthesisRequest(cloud, { state: 'ok', credentials: 'present' }, { text: 'hello', voiceId: 'voice-cloud', language: 'en-US', emotion: 'happy' }).ok, true)
})

test('version evidence is never AUDITED without an audited value', () => {
  const unknown = normalizeProviderManifest(localManifest({ version: { value: null, source: null, audited: false } })).manifest
  assert.deepEqual(providerVersionView(unknown), { state: PROVIDER_VERSION_STATES.UNKNOWN, value: null, audited: false })
  assert.equal(providerVersionView(normalizeProviderManifest(localManifest()).manifest).state, PROVIDER_VERSION_STATES.UNKNOWN)
  const audited = normalizeProviderManifest(localManifest({ version: { value: '1.0.0', source: 'audit', audited: true } })).manifest
  assert.equal(providerVersionView(audited).state, PROVIDER_VERSION_STATES.AUDITED)
  assert.equal(validateProviderManifest(localManifest({ version: { value: null, source: null, audited: true } })).ok, false)
})

test('provider errors classify retry safely', () => {
  const manifest = normalizeProviderManifest(localManifest()).manifest
  const timeout = normalizeProviderError({ code: 'TIMEOUT', message: 'deadline' }, manifest, 1)
  assert.equal(timeout.retryable, true)
  assert.equal(timeout.safeToRetry, true)
  const unknownFailure = normalizeProviderError({ code: 'PROVIDER_ERROR', message: 'boom' }, manifest, 1)
  assert.equal(unknownFailure.retryable, false)
  assert.equal(unknownFailure.safeToRetry, false)
  assert.equal(evaluateProviderStatus(manifest, { state: 'timeout' }).state, PROVIDER_STATES.DEGRADED)
  assert.equal(evaluateProviderStatus(manifest, { state: 'error' }).state, PROVIDER_STATES.DEGRADED)
})

test('synthesis result is audio-only and never performs delivery', () => {
  const manifest = normalizeProviderManifest(localManifest()).manifest
  const normalized = normalizeSynthesisResult(manifest, {
    requestId: 'req-1',
    voiceId: 'voice-local',
    language: 'zh-CN',
    emotion: 'neutral',
    artifactRef: 'opaque-artifact-1',
    mime: 'audio/wav',
    sampleRate: 24000,
    channels: 1,
    durationMs: 1200,
  })
  assert.equal(normalized.ok, true)
  assert.deepEqual(normalized.result.delivery, { state: 'PENDING_ROUTER' })
  assert.equal(normalized.result.providerId, 'fake-local')
  assert.equal(normalized.result.wechat, undefined)

  const sent = normalizeSynthesisResult(manifest, {
    requestId: 'req-2', voiceId: 'voice-local', artifactRef: 'a', mime: 'audio/wav', sampleRate: 24000, durationMs: 1,
    delivery: { state: 'SENT' },
  })
  assert.equal(sent.ok, false)
  assert.equal(sent.errors[0].code, PROVIDER_ERRORS.DELIVERY_NOT_PROVIDER)

  const embedded = normalizeSynthesisResult(manifest, {
    requestId: 'req-3', voiceId: 'voice-local', artifactRef: 'a', mime: 'audio/wav', sampleRate: 24000, durationMs: 1,
    wechat: { target: 'demo' },
  })
  assert.equal(embedded.ok, false)
})

test('qwen-local legacy migration preserves the current selection without making it global', () => {
  const migrated = migrateTtsConfig({
    schemaVersion: 1,
    tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' },
  })
  assert.equal(migrated.ok, true)
  assert.equal(migrated.config.schemaVersion, TTS_CONFIG_SCHEMA_VERSION)
  assert.equal(migrated.config.selectedProviderId, 'qwen-local-default')
  assert.equal(migrated.config.providers[0].providerId, 'qwen3-tts')
  assert.equal(migrated.config.providers[0].endpoint, 'http://127.0.0.1:8765')
  assert.equal(migrated.config.voices[0].id, 'whale-v1')
  assert.equal(migrated.config.compatibility.requiresUserSelection, false)
  assert.equal(migrated.config.providers[0].credentialRef, null)
  assert.equal(migrated.config.selectedVoiceId, 'whale-v1')

  const publicConfig = publicTtsConfig(migrated.config)
  assert.equal(JSON.stringify(publicConfig).includes('127.0.0.1:8765'), false)
  assert.equal(publicConfig.providers[0].endpointConfigured, true)
  assert.equal(publicConfig.providers[0].credentialConfigured, false)

  // Idempotent: a v2 object is validated, not remigrated.
  const again = migrateTtsConfig(migrated.config)
  assert.equal(again.ok, true)
  assert.equal(again.migrated, false)
  assert.equal(again.fromSchemaVersion, 2)
})

test('cloud/custom legacy values require an explicit provider selection', () => {
  for (const provider of ['cloud', 'custom', 'future-provider']) {
    const migrated = migrateTtsConfig({ schemaVersion: 1, tts: { provider, model: 'unknown-model', voice: 'unknown-voice', baseUrl: 'https://example.test/v1' } })
    assert.equal(migrated.ok, true)
    assert.equal(migrated.config.selectedProviderId, null)
    assert.equal(migrated.config.providers.length, 0)
    assert.equal(migrated.config.compatibility.requiresUserSelection, true)
    assert.equal(migrated.config.compatibility.legacyProvider, provider)
    assert.equal(migrated.config.compatibility.legacyVoice, 'unknown-voice')
  }
})

test('v2 config rejects secrets, URL credentials and provider/voice mismatches', () => {
  const migrated = migrateTtsConfig({ schemaVersion: 1, tts: { provider: 'qwen-local', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' } })
  assert.equal(migrated.ok, true)
  const config = migrated.config

  const secret = JSON.parse(JSON.stringify(config))
  secret.providers[0].apiKey = 'not-allowed'
  assert.equal(validateTtsConfig(secret).ok, false)

  const urlSecret = JSON.parse(JSON.stringify(config))
  urlSecret.providers[0].endpoint = 'http://user:pass@127.0.0.1:8765'
  assert.equal(validateTtsConfig(urlSecret).ok, false)

  const mismatch = JSON.parse(JSON.stringify(config))
  mismatch.selectedVoiceId = 'another-voice'
  mismatch.voices.push({ id: 'another-voice', providerInstanceId: 'other', displayName: 'Other', kind: 'preset', referenceAudio: false })
  const result = validateTtsConfig(mismatch)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.code === TTS_CONFIG_ERRORS.VOICE_PROVIDER_MISMATCH))

  assert.equal(selectProvider(config, 'missing').code, TTS_CONFIG_ERRORS.PROVIDER_UNKNOWN)
  assert.equal(resolveVoiceForProvider(config, 'qwen-local-default', 'missing').code, TTS_CONFIG_ERRORS.VOICE_UNSUPPORTED)
  assert.equal(resolveVoiceForProvider(config, 'other', 'whale-v1').code, TTS_CONFIG_ERRORS.VOICE_PROVIDER_MISMATCH)
})

test('cloud credentials and emotion capability are explicit, not guessed', () => {
  const cloud = normalizeProviderManifest(cloudManifest()).manifest
  assert.equal(resolveEmotionForProvider(cloud, 'happy').ok, true)
  assert.equal(resolveEmotionForProvider(cloud, 'angry').code, TTS_CONFIG_ERRORS.EMOTION_UNSUPPORTED)
  const local = normalizeProviderManifest(localManifest()).manifest
  assert.equal(resolveEmotionForProvider(local, 'happy').code, TTS_CONFIG_ERRORS.EMOTION_UNSUPPORTED)
  const config = migrateTtsConfig({ schemaVersion: 1, tts: { provider: 'qwen-local', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' } }).config
  assert.equal(credentialStateForProvider(config, 'qwen-local-default').state, 'not_required')
  assert.equal(credentialStateForProvider(config, 'none').state, 'unknown')

  const cloudConfig = {
    schemaVersion: 2,
    selectedProviderId: 'cloud-a',
    selectedVoiceId: 'cloud-voice',
    providers: [{
      instanceId: 'cloud-a', providerId: 'fake-cloud', displayName: 'Cloud A', kind: 'CLOUD',
      enabled: true, transport: 'http', endpoint: 'https://example.test/v1', modelId: null,
      credentialRef: null, limits: { timeoutMs: 5000 },
    }],
    models: [],
    voices: [{ id: 'cloud-voice', providerInstanceId: 'cloud-a', displayName: 'Cloud Voice', kind: 'preset', referenceAudio: null }],
    voicePacks: [],
    compatibility: { migratedFrom: null, requiresUserSelection: false, notes: [] },
  }
  assert.equal(validateTtsConfig(cloudConfig).ok, true)
  assert.equal(credentialStateForProvider(cloudConfig, 'cloud-a').state, 'missing')
  const withRef = JSON.parse(JSON.stringify(cloudConfig))
  withRef.providers[0].credentialRef = 'keychain:azure'
  assert.equal(credentialStateForProvider(withRef, 'cloud-a').state, 'present')
})

test('manifest rejects unknown top-level target and delivery fields', () => {
  for (const field of ['unexpectedField', 'targetChatId', 'deliveryTarget']) {
    const result = validateProviderManifest({ ...localManifest(), [field]: 'not-allowed' })
    assert.equal(result.ok, false, field + ' must be rejected')
    assert.equal(result.manifest, undefined)
    assert.ok(result.errors.some((error) => error.path === field), field + ' error path')
  }
  assert.equal(validateProviderManifest(localManifest()).ok, true)
})

test('TTS request rejects hidden delivery fields before normal validation', () => {
  const manifest = normalizeProviderManifest(localManifest()).manifest
  const request = { requestId: 'req-a', text: 'hello', voiceId: 'voice-local', language: 'zh-CN' }
  assert.equal(checkSynthesisRequest(manifest, { state: 'ok' }, request).ok, true)
  for (const field of ['wechat', 'targetChatId', 'recipient', 'send', 'deliveryTarget']) {
    const result = checkSynthesisRequest(manifest, { state: 'ok' }, { ...request, [field]: 'not-allowed' })
    assert.equal(result.ok, false, field + ' must be rejected')
    assert.equal(result.code, PROVIDER_ERRORS.INVALID_RESPONSE, field + ' error code')
  }
})

test('required cloud credentials must be explicitly present before AVAILABLE', () => {
  const cloud = normalizeProviderManifest(cloudManifest()).manifest
  const request = { text: 'hello', voiceId: 'voice-cloud', language: 'zh-CN' }
  assert.equal(evaluateProviderStatus(cloud, { state: 'ok', credentials: 'unknown' }).state, PROVIDER_STATES.UNKNOWN)
  assert.equal(checkSynthesisRequest(cloud, { state: 'ok', credentials: 'unknown' }, request).code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
  assert.equal(evaluateProviderStatus(cloud, { state: 'ok', credentials: 'missing' }).state, PROVIDER_STATES.CREDENTIALS_MISSING)
  assert.equal(checkSynthesisRequest(cloud, { state: 'ok', credentials: 'missing' }, request).code, PROVIDER_ERRORS.CREDENTIALS_MISSING)
  assert.equal(evaluateProviderStatus(cloud, { state: 'ok', credentials: 'present' }).state, PROVIDER_STATES.AVAILABLE)
  assert.equal(checkSynthesisRequest(cloud, { state: 'ok', credentials: 'present' }, request).ok, true)
  assert.equal(evaluateProviderStatus(cloud, { state: 'offline', credentials: 'present' }).state, PROVIDER_STATES.UNAVAILABLE)
  assert.equal(evaluateProviderStatus(cloud, { state: 'timeout', credentials: 'present' }).state, PROVIDER_STATES.DEGRADED)
})

test('synthesis result rejects unknown target fields instead of silently dropping them', () => {
  const manifest = normalizeProviderManifest(localManifest()).manifest
  const base = {
    requestId: 'req-b', voiceId: 'voice-local', artifactRef: 'opaque-a', mime: 'audio/wav',
    sampleRate: 24000, channels: 1, durationMs: 1200,
  }
  assert.equal(normalizeSynthesisResult(manifest, base).ok, true)
  for (const field of ['target', 'targetChatId', 'recipient', 'unexpectedResultField']) {
    const result = normalizeSynthesisResult(manifest, { ...base, [field]: 'not-allowed' })
    assert.equal(result.ok, false, field + ' must be rejected')
    assert.ok(result.errors.some((error) => error.code === PROVIDER_ERRORS.INVALID_RESPONSE), field + ' error code')
  }
  const sent = normalizeSynthesisResult(manifest, { ...base, delivery: { state: 'SENT' } })
  assert.equal(sent.ok, false)
  assert.equal(sent.errors[0].code, PROVIDER_ERRORS.DELIVERY_NOT_PROVIDER)
})

test('registry candidates are explicitly not implemented', () => {
  const all = listProviderCandidates()
  assert.equal(all.length, 10)
  assert.ok(all.every((candidate) => candidate.integrationStatus === 'NOT_IMPLEMENTED'))
  assert.ok(all.every((candidate) => candidate.selectable === false))
  assert.equal(getProviderCandidate('qwen-local').id, 'qwen3-tts')
  assert.equal(getProviderCandidate('indextts').kind, PROVIDER_KINDS.LOCAL)
  assert.equal(getProviderCandidate('google-gemini-tts').kind, PROVIDER_KINDS.CLOUD)
  assert.equal(getProviderCandidate('openai-speech').kind, PROVIDER_KINDS.CLOUD)
  assert.equal(getProviderCandidate('azure-speech').kind, PROVIDER_KINDS.CLOUD)
  assert.equal(getProviderCandidate('custom-http').kind, PROVIDER_KINDS.CUSTOM)
  assert.equal(selectProviderCandidate('piper').ok, false)
  assert.equal(selectProviderCandidate('piper').code, 'NOT_IMPLEMENTED')
})

test('provider contract modules have no I/O or delivery side effects', async () => {
  const { readFile } = await import('node:fs/promises')
  const contract = await readFile(new URL('../core/tts/provider-contract.mjs', import.meta.url), 'utf8')
  const registry = await readFile(new URL('../core/tts/provider-registry.mjs', import.meta.url), 'utf8')
  const config = await readFile(new URL('../core/tts/provider-config.mjs', import.meta.url), 'utf8')
  for (const source of [contract, registry, config]) {
    assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|writeFile|spawn\s*\(/)
    assert.doesNotMatch(source, /wechat\.send|sendWeChat|sendToWeChat|\bfunction\s+send\b|\.send\s*\(/)
  }
})

// ---------------------------------------------------------------------------
// M01–M05: Plan06-B-F01 provider-manifest helper-failure regressions.
// ---------------------------------------------------------------------------

test('M01 a valid manifest still succeeds and never shares the input object', () => {
  const manifest = localManifest()
  const snapshot = JSON.stringify(manifest)
  const validated = validateProviderManifest(manifest)
  assert.equal(validated.ok, true)
  assert.notEqual(validated.manifest, manifest)
  assert.equal(JSON.stringify(manifest), snapshot)
  const normalized = normalizeProviderManifest(manifest)
  assert.equal(normalized.ok, true)
  assert.notEqual(normalized.manifest, manifest)
})

test('M02 invalid clone values fail with an INVALID_MANIFEST error', () => {
  for (const clone of [null, 0, 'invalid']) {
    const manifest = localManifest()
    manifest.capabilities.clone = clone
    const result = validateProviderManifest(manifest)
    assert.equal(result.ok, false, String(clone))
    assert.ok(result.errors.some((error) => error.code === PROVIDER_ERRORS.INVALID_MANIFEST))
    assert.equal(normalizeProviderManifest(manifest).ok, false)
  }
})

test('M03 clone=null with formats=null or limits.maxChars={} cannot normalize successfully', () => {
  const formatsBroken = localManifest()
  formatsBroken.capabilities.clone = null
  formatsBroken.capabilities.formats = null
  assert.equal(validateProviderManifest(formatsBroken).ok, false)
  assert.equal(normalizeProviderManifest(formatsBroken).ok, false)

  const limitsBroken = localManifest()
  limitsBroken.capabilities.clone = null
  limitsBroken.capabilities.limits = { maxChars: {}, timeoutMs: 5000, maxAudioSeconds: 30 }
  assert.equal(validateProviderManifest(limitsBroken).ok, false)
  assert.equal(normalizeProviderManifest(limitsBroken).ok, false)
})

test('M04 short-circuiting sections with null/base values still fail the whole manifest', () => {
  for (const mutate of [
    (manifest) => { manifest.capabilities.emotion = null },
    (manifest) => { manifest.capabilities.limits = null },
    (manifest) => { manifest.capabilities.retry = null },
    (manifest) => { manifest.capabilities.voices = null },
  ]) {
    const manifest = localManifest()
    mutate(manifest)
    const result = validateProviderManifest(manifest)
    assert.equal(result.ok, false)
    assert.ok(result.errors.length > 0)
  }
})

test('M05 every top-level section is required and invalid subfields keep failing', () => {
  for (const field of ['version', 'capabilities', 'health', 'credentials', 'network', 'privacy', 'cost', 'resources']) {
    const manifest = localManifest()
    delete manifest[field]
    const result = validateProviderManifest(manifest)
    assert.equal(result.ok, false, field)
    assert.ok(result.errors.some((error) => error.code === PROVIDER_ERRORS.INVALID_MANIFEST), field)
  }
})
