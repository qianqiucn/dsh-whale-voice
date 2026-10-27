import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import * as voiceAssets from '../core/audio/voice-assets.mjs'
import {
  VOICE_ASSETS_SCHEMA_VERSION,
  VOICE_ASSET_ERRORS,
  resolveFixtureVoiceBinding,
  validateVoiceAssetLibrary,
} from '../core/audio/voice-assets.mjs'
import { negotiateProviderInstance } from '../core/audio/provider-instances.mjs'
import { PROVIDER_ERRORS } from '../core/tts/provider-contract.mjs'

const ERR = VOICE_ASSET_ERRORS
const SCOPE = 'scope:fixture-demo'
const NOW = '2026-10-27T00:00:00.000Z'
const BOUND_MESSAGE = '演示音色绑定已核对；尚未生成音频，不能据此试听、保存或发送。'

// ---------------------------------------------------------------------------------------------
// Fixtures: fictional data only. Nothing here reads a real model, file, credential or user asset.
// ---------------------------------------------------------------------------------------------

function baseManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'qwen3-tts',
    name: 'Fixture Local TTS',
    kind: 'LOCAL',
    version: { value: '1.0.0', source: 'fixture', audited: true },
    capabilities: {
      languages: ['zh-CN'],
      voices: [
        { id: 'voice-a', name: 'Voice A', kind: 'preset', languages: ['zh-CN'], referenceAudioRequired: false },
        { id: 'voice-b', name: 'Voice B', kind: 'preset', languages: ['zh-CN'], referenceAudioRequired: false },
      ],
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
  const base = baseManifest()
  return {
    ...base,
    id: 'azure-speech',
    name: 'Fixture Cloud TTS',
    kind: 'CLOUD',
    capabilities: {
      ...base.capabilities,
      languages: ['en-US'],
      voices: [
        { id: 'voice-cloud', name: 'Voice Cloud', kind: 'preset', languages: ['en-US'], referenceAudioRequired: false },
      ],
      emotion: { supported: true, modes: ['neutral', 'happy'], defaultMode: 'neutral' },
      streaming: true,
      formats: [{ mime: 'audio/mp3', sampleRate: 44100, channels: 1 }],
    },
    credentials: { required: true, storage: 'os-keychain', ref: null },
    network: { required: true, textUpload: true, endpointPolicy: 'https-only' },
    privacy: { textLeavesDevice: true, retention: 'provider', note: 'fixture declares upload' },
    cost: { paid: true, model: 'per-character', note: 'fixture only' },
    resources: { local: false, gpuRequired: false, cpuCapable: false },
    ...overrides,
  }
}

function obs(overrides = {}) {
  return {
    state: 'ok',
    credentials: 'not_required',
    observedAt: '2026-10-26T00:00:00.000Z',
    versionMatches: true,
    ...overrides,
  }
}

function ttsInstance(overrides = {}) {
  return {
    instanceId: 'instance:qwen',
    category: 'TTS',
    candidateId: 'qwen3-tts',
    protocolVersion: 1,
    fixture: true,
    manifest: baseManifest(),
    observation: obs(),
    ...overrides,
  }
}

function cloudInstance(overrides = {}) {
  return ttsInstance({
    instanceId: 'instance:cloud',
    candidateId: 'azure-speech',
    manifest: cloudManifest(),
    observation: obs({ credentials: 'present' }),
    ...overrides,
  })
}

function rvcInstance(overrides = {}) {
  return {
    instanceId: 'instance:rvc',
    category: 'SVC',
    candidateId: 'rvc',
    protocolVersion: 1,
    fixture: true,
    manifest: null,
    observation: obs(),
    ...overrides,
  }
}

function ttsAsset(overrides = {}) {
  return {
    assetId: 'asset:fixture-voice-a',
    revision: 1,
    scopeId: SCOPE,
    kind: 'TTS_VOICE',
    candidateId: 'qwen3-tts',
    providerRef: 'voice-a',
    availability: 'PRESENT',
    rightsState: 'CONFIRMED_FIXTURE',
    integrity: null,
    expiresAt: null,
    ...overrides,
  }
}

function rvcAsset(overrides = {}) {
  return {
    assetId: 'asset:fixture-model-a',
    revision: 1,
    scopeId: SCOPE,
    kind: 'RVC_MODEL',
    candidateId: 'rvc',
    providerRef: 'rvc-model:fixture-a',
    availability: 'PRESENT',
    rightsState: 'CONFIRMED_FIXTURE',
    integrity: { sha256: 'a'.repeat(64), byteLength: 1048576 },
    expiresAt: null,
    ...overrides,
  }
}

function profile(overrides = {}) {
  return {
    voiceProfileId: 'voice:demo-hero',
    revision: 1,
    scopeId: SCOPE,
    displayName: '演示角色',
    rightsState: 'CONFIRMED_FIXTURE',
    bindings: [
      { instanceId: 'instance:qwen', assetId: 'asset:fixture-voice-a' },
      { instanceId: 'instance:rvc', assetId: 'asset:fixture-model-a' },
    ],
    ...overrides,
  }
}

function library(overrides = {}) {
  return {
    schemaVersion: 1,
    profiles: [profile()],
    assets: [ttsAsset(), rvcAsset()],
    ...overrides,
  }
}

function draftTts(overrides = {}) {
  return {
    schemaVersion: 1,
    taskId: 'task:demo-tts',
    feature: 'voice-bubbles',
    taskType: 'TTS',
    source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-1' },
    voiceProfileId: 'voice:demo-hero',
    deliveryRequested: false,
    rights: { state: 'CONFIRMED_FIXTURE' },
    ...overrides,
  }
}

function draftSvc(overrides = {}) {
  return {
    schemaVersion: 1,
    taskId: 'task:demo-svc',
    feature: 'singing',
    taskType: 'SVC',
    source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-source-1' },
    voiceProfileId: 'voice:demo-hero',
    deliveryRequested: false,
    rights: { state: 'CONFIRMED_FIXTURE' },
    ...overrides,
  }
}

function ttsRequest(overrides = {}) {
  return {
    requestId: 'request:fixture-1',
    text: 'hello',
    voiceId: 'voice-a',
    language: 'zh-CN',
    emotion: 'neutral',
    format: 'audio/wav',
    streaming: false,
    ...overrides,
  }
}

function cloudRequest(overrides = {}) {
  return ttsRequest({
    voiceId: 'voice-cloud',
    language: 'en-US',
    format: 'audio/mp3',
    ...overrides,
  })
}

function rvcRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceAudioRef: 'artifact:fixture-source-1',
    targetModelId: 'rvc-model:fixture-a',
    pitchShift: 0,
    outputFormat: 'audio/wav',
    inputAudio: { durationMs: 1000, byteLength: 1000, sampleRate: 44100, channels: 1 },
    rights: { state: 'CONFIRMED_FIXTURE' },
    ...overrides,
  }
}

function consent(overrides = {}) {
  return { networkAllowed: false, textUploadAllowed: false, paidAllowed: false, ...overrides }
}

function negotiation(instances, selection, request, consentOverrides = {}) {
  return {
    schemaVersion: 1,
    registry: { schemaVersion: 1, instances },
    selection,
    consent: consent(consentOverrides),
    request,
  }
}

function expectation(overrides = {}) {
  return { scopeId: SCOPE, profileRevision: 1, assetRevision: 1, ...overrides }
}

function ttsInput(overrides = {}) {
  return {
    schemaVersion: 1,
    library: library(),
    taskDraft: draftTts(),
    negotiation: negotiation([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
    expectation: expectation(),
    now: NOW,
    ...overrides,
  }
}

function svcInput(overrides = {}) {
  return {
    schemaVersion: 1,
    library: library(),
    taskDraft: draftSvc(),
    negotiation: negotiation([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest()),
    expectation: expectation(),
    now: NOW,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Assertion helpers (real module results only; no hand-built envelopes).
// ---------------------------------------------------------------------------------------------

function expectError(result, key, path) {
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, ERR[key], 'error code')
  assert.equal(result.errors[0].path, path, 'error path')
  assert.equal(result.errors[0].reason, key.toLowerCase().replace(/_/g, ' '), 'error reason')
  return result
}

function expectBound(result, kind) {
  assert.equal(result.ok, true)
  assert.equal(result.value.decision, 'FIXTURE_BOUND')
  assert.equal(result.value.reason, null)
  assert.equal(result.value.messageZh, BOUND_MESSAGE)
  assert.equal(result.value.binding.kind, kind)
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  return result
}

function expectBlocked(result, key) {
  assert.equal(result.ok, true)
  assert.equal(result.value.decision, 'BLOCKED')
  assert.equal(result.value.reason, ERR[key])
  assert.equal(result.value.binding, null)
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  return result
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  assert.equal(Object.isFrozen(value), true)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    assert.ok(descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value'))
    assertDeepFrozen(descriptor.value, seen)
  }
}

function deepFreezeForTest(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value)) deepFreezeForTest(value[key], seen)
  return value
}

const VALUE_KEYS = [
  'schemaVersion',
  'decision',
  'reason',
  'messageZh',
  'taskId',
  'feature',
  'voiceProfileId',
  'binding',
  'provider',
  'mockOnly',
  'realOperationAllowed',
  'submitAllowed',
  'automaticRetryAllowed',
]
const BINDING_KEYS = [
  'scopeId',
  'profileRevision',
  'assetId',
  'assetRevision',
  'kind',
  'instanceId',
  'candidateId',
  'providerRef',
]

// ---------------------------------------------------------------------------------------------
// V01–V03: the same profile can bind a TTS instance and an SVC instance independently.
// ---------------------------------------------------------------------------------------------

test('V01 one profile binds TTS and SVC instances independently with different provider refs', () => {
  const tts = expectBound(resolveFixtureVoiceBinding(ttsInput()), 'TTS_VOICE')
  const svc = expectBound(resolveFixtureVoiceBinding(svcInput()), 'RVC_MODEL')

  assert.equal(tts.value.binding.instanceId, 'instance:qwen')
  assert.equal(tts.value.binding.candidateId, 'qwen3-tts')
  assert.equal(tts.value.binding.providerRef, 'voice-a')
  assert.equal(svc.value.binding.instanceId, 'instance:rvc')
  assert.equal(svc.value.binding.candidateId, 'rvc')
  assert.equal(svc.value.binding.providerRef, 'rvc-model:fixture-a')
  assert.notEqual(tts.value.binding.providerRef, svc.value.binding.providerRef)
  assert.equal(tts.value.voiceProfileId, svc.value.voiceProfileId)
  assert.equal(tts.value.binding.scopeId, SCOPE)
  assert.equal(svc.value.binding.scopeId, SCOPE)
})

test('V02 TTS binding is proven only as a mapping; no TTS call, artifact or text echo', () => {
  const result = expectBound(resolveFixtureVoiceBinding(ttsInput()), 'TTS_VOICE')
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('hello'), false)
  assert.equal(encoded.includes('artifact:fixture-output'), false)
  assert.equal(encoded.includes('audioRef'), false)
  assert.equal('result' in result.value, false)
  assert.equal('text' in result.value, false)
  assert.equal(result.value.provider.category, 'TTS')
  assert.equal(result.value.provider.decision, 'FIXTURE_COMPATIBLE')
})

test('V03 SVC binding keeps the complete original provider value and never calls the fake dispatcher', () => {
  const input = svcInput()
  const direct = negotiateProviderInstance(input.negotiation)
  assert.equal(direct.ok, true)
  const result = expectBound(resolveFixtureVoiceBinding(input), 'RVC_MODEL')
  assert.deepEqual(plain(result.value.provider), plain(direct.value))
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('artifact:fixture-output-'), false)
  assert.equal(encoded.includes('SIMULATED'), false)
  assert.equal(encoded.includes('rvc-fake'), false)
  assert.equal(result.value.binding.providerRef, input.negotiation.request.targetModelId)
})

// ---------------------------------------------------------------------------------------------
// V04–V07: original Provider blocks stay intact; raw request fields are compared exactly.
// ---------------------------------------------------------------------------------------------

test('V04 model B declared PRESENT still stays blocked by the original MODEL_NOT_AVAILABLE', () => {
  const lib = library({
    profiles: [profile({
      bindings: [{ instanceId: 'instance:rvc', assetId: 'asset:fixture-model-b' }],
    })],
    assets: [rvcAsset({ assetId: 'asset:fixture-model-b', providerRef: 'rvc-model:fixture-b' })],
  })
  const input = svcInput({
    library: lib,
    negotiation: negotiation(
      [rvcInstance()],
      { category: 'SVC', instanceId: 'instance:rvc' },
      rvcRequest({ targetModelId: 'rvc-model:fixture-b' }),
    ),
  })
  const result = expectBlocked(resolveFixtureVoiceBinding(input), 'PROVIDER_BLOCKED')
  assert.equal(result.value.provider.reason, 'PROVIDER_INSTANCE_MODEL_NOT_AVAILABLE')
  assert.equal(result.value.messageZh, result.value.provider.messageZh)
  assert.equal(JSON.stringify(result).includes('asset:fixture-model-a'), false)
  assert.equal(result.value.binding, null)
})

test('V05 a swapped raw request voiceId is PROVIDER_REF_MISMATCH; unsupported voice stays PROVIDER_BLOCKED', () => {
  const swapped = expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({
      negotiation: negotiation([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ voiceId: 'voice-b' })),
    })),
    'PROVIDER_REF_MISMATCH',
  )
  assert.equal(swapped.value.provider.decision, 'FIXTURE_COMPATIBLE')

  const unsupported = expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({
      negotiation: negotiation([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ voiceId: 'voice-z' })),
    })),
    'PROVIDER_BLOCKED',
  )
  assert.equal(unsupported.value.provider.reason, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
})

test('V06 task kind and selected instance category must match in both directions', () => {
  const ttsDraftWithSvc = expectBlocked(
    resolveFixtureVoiceBinding(svcInput({ taskDraft: draftTts() })),
    'TASK_KIND_MISMATCH',
  )
  assert.equal(ttsDraftWithSvc.value.taskId, 'task:demo-tts')

  const svcDraftWithTts = expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ taskDraft: draftSvc() })),
    'TASK_KIND_MISMATCH',
  )
  assert.equal(svcDraftWithTts.value.taskId, 'task:demo-svc')
})

test('V07 SVC source reference must match exactly; a non-fixture ref is blocked by the original Provider', () => {
  const mismatched = expectBlocked(
    resolveFixtureVoiceBinding(svcInput({
      taskDraft: draftSvc({ source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-source-2' } }),
    })),
    'SOURCE_MISMATCH',
  )
  assert.equal(mismatched.value.provider.decision, 'FIXTURE_COMPATIBLE')

  const rejected = expectBlocked(
    resolveFixtureVoiceBinding(svcInput({
      taskDraft: draftSvc({ source: { kind: 'AUDIO_REF', ref: 'artifact:other-source' } }),
      negotiation: negotiation(
        [rvcInstance()],
        { category: 'SVC', instanceId: 'instance:rvc' },
        rvcRequest({ sourceAudioRef: 'artifact:other-source' }),
      ),
    })),
    'PROVIDER_BLOCKED',
  )
  assert.equal(rejected.value.provider.reason, 'PROVIDER_INSTANCE_INVALID_REQUEST')
})

// ---------------------------------------------------------------------------------------------
// V08–V09: missing/foreign profiles and structural reference failures.
// ---------------------------------------------------------------------------------------------

test('V08 missing profile and profile in another scope give identical non-leaking results', () => {
  const missing = expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ profiles: [] }) })),
    'PROFILE_UNAVAILABLE',
  )

  const foreign = expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({
      library: library({
        profiles: [profile({
          scopeId: 'scope:fixture-other',
          displayName: '其他角色',
          bindings: [{ instanceId: 'instance:qwen', assetId: 'asset:fixture-voice-z' }],
        })],
        assets: [ttsAsset({ assetId: 'asset:fixture-voice-z', scopeId: 'scope:fixture-other' })],
      }),
    })),
    'PROFILE_UNAVAILABLE',
  )

  assert.deepEqual(foreign.value, missing.value)
  const encoded = JSON.stringify(foreign)
  assert.equal(encoded.includes('scope:fixture-other'), false)
  assert.equal(encoded.includes('其他角色'), false)
  assert.equal(encoded.includes('asset:fixture-voice-z'), false)
  assert.equal(foreign.value.binding, null)
})

test('V09 dangling/cross-scope references and duplicate IDs fail closed on the whole library', () => {
  expectError(
    validateVoiceAssetLibrary(library({
      profiles: [profile({ bindings: [{ instanceId: 'instance:qwen', assetId: 'asset:fixture-missing' }] })],
    })),
    'INVALID_REFERENCE',
    'library',
  )

  expectError(
    validateVoiceAssetLibrary(library({
      profiles: [profile({ bindings: [{ instanceId: 'instance:qwen', assetId: 'asset:fixture-voice-other' }] })],
      assets: [ttsAsset({ assetId: 'asset:fixture-voice-other', scopeId: 'scope:fixture-other' }), rvcAsset()],
    })),
    'INVALID_REFERENCE',
    'library',
  )

  expectError(
    validateVoiceAssetLibrary(library({ assets: [ttsAsset(), ttsAsset({ providerRef: 'voice-b' })] })),
    'DUPLICATE_ID',
    'library',
  )

  expectError(
    validateVoiceAssetLibrary(library({ profiles: [profile(), profile()] })),
    'DUPLICATE_ID',
    'library',
  )

  expectError(
    validateVoiceAssetLibrary(library({
      profiles: [profile({
        bindings: [
          { instanceId: 'instance:qwen', assetId: 'asset:fixture-voice-a' },
          { instanceId: 'instance:qwen', assetId: 'asset:fixture-model-a' },
        ],
      })],
    })),
    'DUPLICATE_ID',
    'library',
  )

  // An invalid unselected profile still rejects the whole library, even for a valid lookup.
  const polluted = library({
    profiles: [
      profile(),
      profile({
        voiceProfileId: 'voice:broken',
        bindings: [{ instanceId: 'instance:qwen', assetId: 'asset:fixture-missing' }],
      }),
    ],
  })
  expectError(validateVoiceAssetLibrary(polluted), 'INVALID_REFERENCE', 'library')
  expectError(resolveFixtureVoiceBinding(ttsInput({ library: polluted })), 'INVALID_REFERENCE', 'library')
})

// ---------------------------------------------------------------------------------------------
// V10–V13: three independent rights layers, revisions, availability/expiry and isolation.
// ---------------------------------------------------------------------------------------------

test('V10 task, profile and asset rights are independent; a task REVOKED value is rejected by v1', () => {
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ taskDraft: draftTts({ rights: { state: 'UNVERIFIED' } }) })),
    'TASK_RIGHTS_UNCONFIRMED',
  )
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ profiles: [profile({ rightsState: 'UNVERIFIED' })] }) })),
    'PROFILE_RIGHTS_UNCONFIRMED',
  )
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ assets: [ttsAsset({ rightsState: 'REVOKED' }), rvcAsset()] }) })),
    'ASSET_RIGHTS_UNCONFIRMED',
  )
  expectError(
    resolveFixtureVoiceBinding(ttsInput({ taskDraft: draftTts({ rights: { state: 'REVOKED' } }) })),
    'INVALID_TASK',
    'taskDraft',
  )
  // A confirmed profile does not substitute for an unconfirmed task layer.
  const both = resolveFixtureVoiceBinding(ttsInput({ taskDraft: draftTts({ rights: { state: 'UNVERIFIED' } }) }))
  expectBlocked(both, 'TASK_RIGHTS_UNCONFIRMED')
})

test('V11 stale revisions block; invalid revision types are structural failures', () => {
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ expectation: expectation({ profileRevision: 2 }) })),
    'PROFILE_REVISION_MISMATCH',
  )
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ expectation: expectation({ assetRevision: 2 }) })),
    'ASSET_REVISION_MISMATCH',
  )

  for (const revision of [0, 1.5, '1', -1]) {
    expectError(
      validateVoiceAssetLibrary(library({ assets: [ttsAsset({ revision }), rvcAsset()] })),
      'INVALID_LIBRARY',
      'library',
    )
    expectError(
      validateVoiceAssetLibrary(library({ profiles: [profile({ revision })] })),
      'INVALID_LIBRARY',
      'library',
    )
    expectError(
      resolveFixtureVoiceBinding(ttsInput({ expectation: expectation({ assetRevision: revision }) })),
      'INVALID_EXPECTATION',
      'expectation',
    )
  }
})

test('V12 ABSENT/UNKNOWN/expiry are exact business states with repeatable explicit now', () => {
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ assets: [ttsAsset({ availability: 'ABSENT' }), rvcAsset()] }) })),
    'ASSET_MISSING',
  )
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ assets: [ttsAsset({ availability: 'UNKNOWN' }), rvcAsset()] }) })),
    'ASSET_UNKNOWN',
  )
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({
      library: library({ assets: [ttsAsset({ expiresAt: '2026-10-26T23:59:59.999Z' }), rvcAsset()] }),
    })),
    'ASSET_EXPIRED',
  )
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({
      library: library({ assets: [ttsAsset({ expiresAt: NOW }), rvcAsset()] }),
    })),
    'ASSET_EXPIRED',
  )
  const future = expectBound(
    resolveFixtureVoiceBinding(ttsInput({
      library: library({ assets: [ttsAsset({ expiresAt: '2026-10-27T00:00:00.001Z' }), rvcAsset()] }),
    })),
    'TTS_VOICE',
  )
  const noExpiry = expectBound(resolveFixtureVoiceBinding(ttsInput()), 'TTS_VOICE')
  assert.deepEqual(future.value.binding.assetId, noExpiry.value.binding.assetId)

  const first = resolveFixtureVoiceBinding(ttsInput())
  const second = resolveFixtureVoiceBinding(ttsInput())
  assert.deepEqual(first.value, second.value)
})

test('V13 one broken asset does not contaminate the other feature; a revoked profile blocks both', () => {
  const absentTts = library({ assets: [ttsAsset({ availability: 'ABSENT' }), rvcAsset()] })
  expectBlocked(resolveFixtureVoiceBinding(ttsInput({ library: absentTts })), 'ASSET_MISSING')
  expectBound(resolveFixtureVoiceBinding(svcInput({ library: absentTts })), 'RVC_MODEL')

  const revokedTts = library({ assets: [ttsAsset({ rightsState: 'REVOKED' }), rvcAsset()] })
  expectBlocked(resolveFixtureVoiceBinding(ttsInput({ library: revokedTts })), 'ASSET_RIGHTS_UNCONFIRMED')
  expectBound(resolveFixtureVoiceBinding(svcInput({ library: revokedTts })), 'RVC_MODEL')

  const expiredTts = library({ assets: [ttsAsset({ expiresAt: '2026-10-26T00:00:00.000Z' }), rvcAsset()] })
  expectBlocked(resolveFixtureVoiceBinding(ttsInput({ library: expiredTts })), 'ASSET_EXPIRED')
  expectBound(resolveFixtureVoiceBinding(svcInput({ library: expiredTts })), 'RVC_MODEL')

  const revokedProfile = library({ profiles: [profile({ rightsState: 'REVOKED' })] })
  expectBlocked(resolveFixtureVoiceBinding(ttsInput({ library: revokedProfile })), 'PROFILE_RIGHTS_UNCONFIRMED')
  expectBlocked(resolveFixtureVoiceBinding(svcInput({ library: revokedProfile })), 'PROFILE_RIGHTS_UNCONFIRMED')
})

// ---------------------------------------------------------------------------------------------
// V14–V16: instance binding, kind, canonical candidate and unknown catalog entries.
// ---------------------------------------------------------------------------------------------

test('V14 no fallback by candidate/order: missing instance, wrong kind, wrong canonical candidate', () => {
  const noRvcBinding = library({
    profiles: [profile({ bindings: [{ instanceId: 'instance:qwen', assetId: 'asset:fixture-voice-a' }] })],
  })
  expectBlocked(resolveFixtureVoiceBinding(svcInput({ library: noRvcBinding })), 'BINDING_MISSING')

  const rvcBoundToTts = library({
    profiles: [profile({ bindings: [{ instanceId: 'instance:qwen', assetId: 'asset:fixture-model-a' }] })],
  })
  expectBlocked(resolveFixtureVoiceBinding(ttsInput({ library: rvcBoundToTts })), 'ASSET_KIND_MISMATCH')

  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({
      library: library({ assets: [ttsAsset({ candidateId: 'qwen-local' }), rvcAsset()] }),
    })),
    'CANDIDATE_MISMATCH',
  )
  expectBlocked(
    resolveFixtureVoiceBinding(ttsInput({
      library: library({ assets: [ttsAsset({ candidateId: 'piper' }), rvcAsset()] }),
    })),
    'CANDIDATE_MISMATCH',
  )
})

test('V15 original Provider negative reasons are preserved and never upgraded by a PRESENT asset', () => {
  const cases = [
    {
      name: 'version',
      input: ttsInput({
        negotiation: negotiation(
          [ttsInstance({ manifest: baseManifest({ version: { value: '1.0.0', source: 'fixture', audited: false } }) })],
          { category: 'TTS', instanceId: 'instance:qwen' },
          ttsRequest(),
        ),
      }),
      reason: 'PROVIDER_INSTANCE_VERSION_UNKNOWN',
    },
    {
      name: 'offline',
      input: ttsInput({
        negotiation: negotiation(
          [ttsInstance({ observation: obs({ state: 'offline' }) })],
          { category: 'TTS', instanceId: 'instance:qwen' },
          ttsRequest(),
        ),
      }),
      reason: 'PROVIDER_INSTANCE_OFFLINE',
    },
    {
      name: 'credentials',
      input: ttsInput({
        negotiation: negotiation(
          [cloudInstance({ observation: obs({ credentials: 'missing' }) })],
          { category: 'TTS', instanceId: 'instance:cloud' },
          cloudRequest(),
        ),
      }),
      reason: 'PROVIDER_INSTANCE_CREDENTIALS_MISSING',
    },
    {
      name: 'network',
      input: ttsInput({
        negotiation: negotiation(
          [cloudInstance()],
          { category: 'TTS', instanceId: 'instance:cloud' },
          cloudRequest(),
          { networkAllowed: false },
        ),
      }),
      reason: PROVIDER_ERRORS.NETWORK_REQUIRED,
    },
    {
      name: 'text upload',
      input: ttsInput({
        negotiation: negotiation(
          [cloudInstance()],
          { category: 'TTS', instanceId: 'instance:cloud' },
          cloudRequest(),
          { networkAllowed: true, textUploadAllowed: false },
        ),
      }),
      reason: PROVIDER_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED,
    },
    {
      name: 'cost',
      input: ttsInput({
        negotiation: negotiation(
          [cloudInstance()],
          { category: 'TTS', instanceId: 'instance:cloud' },
          cloudRequest(),
          { networkAllowed: true, textUploadAllowed: true, paidAllowed: false },
        ),
      }),
      reason: 'PROVIDER_INSTANCE_COST_NOT_CONFIRMED',
    },
    {
      name: 'language',
      input: ttsInput({
        negotiation: negotiation(
          [ttsInstance()],
          { category: 'TTS', instanceId: 'instance:qwen' },
          ttsRequest({ language: 'fr-FR' }),
        ),
      }),
      reason: PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE,
    },
    {
      name: 'format',
      input: ttsInput({
        negotiation: negotiation(
          [ttsInstance()],
          { category: 'TTS', instanceId: 'instance:qwen' },
          ttsRequest({ format: 'audio/mp3' }),
        ),
      }),
      reason: PROVIDER_ERRORS.UNSUPPORTED_FORMAT,
    },
  ]

  for (const item of cases) {
    const result = expectBlocked(resolveFixtureVoiceBinding(item.input), 'PROVIDER_BLOCKED')
    assert.equal(result.value.provider.reason, item.reason, item.name)
    assert.equal(result.value.messageZh, result.value.provider.messageZh, item.name)
    assert.equal(result.value.binding, null, item.name)
  }
})

test('V16 unknown but syntactically valid catalogue labels never become a declaration of support', () => {
  const futureTts = library({ assets: [ttsAsset({ candidateId: 'future-tts' }), rvcAsset()] })
  const validated = validateVoiceAssetLibrary(futureTts)
  assert.equal(validated.ok, true)
  const blocked = expectBlocked(resolveFixtureVoiceBinding(ttsInput({ library: futureTts })), 'CANDIDATE_MISMATCH')
  assert.equal(blocked.value.provider.decision, 'FIXTURE_COMPATIBLE')

  const futureRvc = library({
    profiles: [profile({ bindings: [{ instanceId: 'instance:rvc', assetId: 'asset:fixture-model-future' }] })],
    assets: [rvcAsset({ assetId: 'asset:fixture-model-future', providerRef: 'rvc-model:fixture-future' })],
  })
  assert.equal(validateVoiceAssetLibrary(futureRvc).ok, true)
  const rvcBlocked = expectBlocked(
    resolveFixtureVoiceBinding(svcInput({
      library: futureRvc,
      negotiation: negotiation(
        [rvcInstance()],
        { category: 'SVC', instanceId: 'instance:rvc' },
        rvcRequest({ targetModelId: 'rvc-model:fixture-future' }),
      ),
    })),
    'PROVIDER_BLOCKED',
  )
  assert.equal(rvcBlocked.value.provider.reason, 'PROVIDER_INSTANCE_MODEL_NOT_AVAILABLE')
})

// ---------------------------------------------------------------------------------------------
// V17–V19: metadata declarations, structural protocol and hostile input surfaces.
// ---------------------------------------------------------------------------------------------

test('V17 integrity is a declaration only: TTS must be null, RVC needs bounded checksum metadata', () => {
  expectError(
    validateVoiceAssetLibrary(library({ assets: [ttsAsset({ integrity: { sha256: 'a'.repeat(64), byteLength: 1 } }), rvcAsset()] })),
    'INVALID_LIBRARY',
    'library',
  )
  expectError(
    validateVoiceAssetLibrary(library({ assets: [ttsAsset(), rvcAsset({ integrity: null })] })),
    'INVALID_LIBRARY',
    'library',
  )
  expectError(
    validateVoiceAssetLibrary(library({ assets: [rvcAsset({ integrity: { sha256: 'A'.repeat(64), byteLength: 10 } })] })),
    'INVALID_LIBRARY',
    'library',
  )
  expectError(
    validateVoiceAssetLibrary(library({ assets: [rvcAsset({ integrity: { sha256: 'a'.repeat(64), byteLength: 0 } })] })),
    'INVALID_LIBRARY',
    'library',
  )
  expectError(
    validateVoiceAssetLibrary(library({ assets: [rvcAsset({ integrity: { sha256: 'a'.repeat(64), byteLength: 8589934593 } })] })),
    'INVALID_LIBRARY',
    'library',
  )
  assert.equal(
    validateVoiceAssetLibrary(library({
      assets: [ttsAsset(), rvcAsset({ integrity: { sha256: 'a'.repeat(64), byteLength: 8589934592 } })],
    })).ok,
    true,
  )
  expectError(
    validateVoiceAssetLibrary(library({ assets: [ttsAsset({ expiresAt: '2026-10-27T00:00:00Z' }), rvcAsset()] })),
    'INVALID_LIBRARY',
    'library',
  )
  expectError(
    validateVoiceAssetLibrary(library({ assets: [ttsAsset({ expiresAt: '2026-02-30T00:00:00.000Z' }), rvcAsset()] })),
    'INVALID_LIBRARY',
    'library',
  )
})

test('V18 fixed root/nested error protocol and first-error order by declared field order', () => {
  expectError(resolveFixtureVoiceBinding({ ...ttsInput(), ready: true }), 'INVALID_INPUT', '<unknown-key>')

  const missing = ttsInput()
  delete missing.expectation
  expectError(resolveFixtureVoiceBinding(missing), 'INVALID_INPUT', '$')

  expectError(resolveFixtureVoiceBinding({ ...ttsInput(), schemaVersion: 2 }), 'UNSUPPORTED_VERSION', 'schemaVersion')

  expectError(
    resolveFixtureVoiceBinding(ttsInput({ library: { ...library(), extra: 1 } })),
    'INVALID_LIBRARY',
    'library',
  )
  expectError(
    resolveFixtureVoiceBinding(ttsInput({ library: { ...library(), schemaVersion: 2 } })),
    'UNSUPPORTED_VERSION',
    'library',
  )
  const noAssets = library()
  delete noAssets.assets
  expectError(resolveFixtureVoiceBinding(ttsInput({ library: noAssets })), 'INVALID_LIBRARY', 'library')

  failLibraryField()
  function failLibraryField() {
    expectError(
      validateVoiceAssetLibrary(library({ assets: [ttsAsset({ availability: 'READY' }), rvcAsset()] })),
      'INVALID_LIBRARY',
      'library',
    )
    expectError(
      validateVoiceAssetLibrary(library({ assets: [ttsAsset({ kind: 'OTHER' }), rvcAsset()] })),
      'INVALID_LIBRARY',
      'library',
    )
    expectError(
      validateVoiceAssetLibrary(library({ profiles: [profile({ rightsState: 'CONFIRMED_REAL' })] })),
      'INVALID_LIBRARY',
      'library',
    )
    expectError(
      validateVoiceAssetLibrary(library({ profiles: [profile({ displayName: ' 前后空格 ' })] })),
      'INVALID_LIBRARY',
      'library',
    )
    expectError(
      validateVoiceAssetLibrary(library({ profiles: [profile({ displayName: '坏\u0007名字' })] })),
      'INVALID_LIBRARY',
      'library',
    )
  }

  // Unknown key wins regardless of insertion order, including over a wrong schema value.
  const orderedA = { schemaVersion: 2, profiles: [], assets: [], ready: true }
  const orderedB = {}
  orderedB.ready = true
  orderedB.assets = []
  orderedB.profiles = []
  orderedB.schemaVersion = 2
  expectError(validateVoiceAssetLibrary(orderedA), 'INVALID_INPUT', '<unknown-key>')
  expectError(validateVoiceAssetLibrary(orderedB), 'INVALID_INPUT', '<unknown-key>')

  // Assets are validated before profiles: a duplicate asset id wins over a 17-profile limit.
  const prematureProfileLimit = library({
    assets: [ttsAsset(), ttsAsset({ providerRef: 'voice-b' })],
    profiles: Array.from({ length: 17 }, (_, index) => profile({ voiceProfileId: 'voice:p' + index, bindings: [] })),
  })
  expectError(validateVoiceAssetLibrary(prematureProfileLimit), 'DUPLICATE_ID', 'library')
})

test('V19 accessors, Symbols, hidden keys, custom prototypes and throwing Proxies fail closed', () => {
  let reads = 0
  const accessorRoot = library()
  Object.defineProperty(accessorRoot, 'library', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return library()
    },
  })
  expectError(validateVoiceAssetLibrary(accessorRoot), 'INVALID_INPUT', '$')
  assert.equal(reads, 0)

  const accessorAsset = ttsAsset()
  Object.defineProperty(accessorAsset, 'availability', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return 'PRESENT'
    },
  })
  expectError(
    validateVoiceAssetLibrary(library({ assets: [accessorAsset, rvcAsset()] })),
    'INVALID_INPUT',
    '$',
  )
  assert.equal(reads, 0)

  const withSymbol = library()
  withSymbol[Symbol('secret')] = true
  expectError(validateVoiceAssetLibrary(withSymbol), 'INVALID_INPUT', '$')

  const hidden = library()
  Object.defineProperty(hidden, 'hiddenKey', { value: 1, enumerable: false })
  expectError(validateVoiceAssetLibrary(hidden), 'INVALID_INPUT', '$')

  const custom = Object.create({ inherited: 1 })
  Object.assign(custom, library())
  expectError(validateVoiceAssetLibrary(custom), 'INVALID_INPUT', '$')

  const marker = 'PRIVATE_MARKER_V19'
  const proxy = new Proxy({}, {
    ownKeys() {
      throw new Error(marker)
    },
  })
  const proxied = expectError(validateVoiceAssetLibrary(proxy), 'INVALID_INPUT', '$')
  assert.equal(JSON.stringify(proxied).includes(marker), false)
  assert.equal(JSON.stringify(proxied).includes('stack'), false)
})

// ---------------------------------------------------------------------------------------------
// V20–V22: copy budgets, business limits, prototype safety and freshness/freezing invariants.
// ---------------------------------------------------------------------------------------------

test('V20 copy budgets and business limits fail closed on both sides of the boundary', () => {
  const cyclic = ttsInput()
  cyclic.self = cyclic
  expectError(resolveFixtureVoiceBinding(cyclic), 'INVALID_INPUT', '$')

  const holes = library()
  holes.assets = new Array(1)
  expectError(validateVoiceAssetLibrary(holes), 'INVALID_INPUT', '$')

  const extraProp = library()
  extraProp.assets = [ttsAsset(), rvcAsset()]
  extraProp.assets.extra = 1
  expectError(validateVoiceAssetLibrary(extraProp), 'INVALID_INPUT', '$')

  expectError(validateVoiceAssetLibrary(library({ profiles: [profile({ displayName: () => 'x' })] })), 'INVALID_INPUT', '$')
  expectError(validateVoiceAssetLibrary(library({ assets: [ttsAsset({ revision: NaN }), rvcAsset()] })), 'INVALID_INPUT', '$')
  expectError(validateVoiceAssetLibrary(library({ assets: [ttsAsset({ revision: 1n }), rvcAsset()] })), 'INVALID_INPUT', '$')
  expectError(
    validateVoiceAssetLibrary(library({ profiles: [profile({ displayName: 'a'.repeat(8193) })] })),
    'RESOURCE_LIMIT',
    '$',
  )

  let deep = []
  const deepRoot = deep
  for (let index = 0; index < 14; index += 1) {
    const next = []
    deep.push(next)
    deep = next
  }
  const deepInput = ttsInput()
  deepInput.ready = deepRoot
  expectError(resolveFixtureVoiceBinding(deepInput), 'RESOURCE_LIMIT', '$')

  const wide = Array.from({ length: 256 }, () => {
    const entry = {}
    for (let index = 0; index < 16; index += 1) entry['k' + index] = 1
    return entry
  })
  const wideInput = ttsInput()
  wideInput.ready = wide
  expectError(resolveFixtureVoiceBinding(wideInput), 'RESOURCE_LIMIT', '$')

  const seventeenProfiles = Array.from({ length: 17 }, (_, index) => profile({ voiceProfileId: 'voice:p' + index, bindings: [] }))
  expectError(validateVoiceAssetLibrary(library({ profiles: seventeenProfiles })), 'RESOURCE_LIMIT', '$')

  const thirtyThreeAssets = Array.from({ length: 33 }, (_, index) => ttsAsset({ assetId: 'asset:fixture-t' + index }))
  expectError(validateVoiceAssetLibrary(library({ profiles: [], assets: thirtyThreeAssets })), 'RESOURCE_LIMIT', '$')

  const nineAssets = Array.from({ length: 9 }, (_, index) => ttsAsset({ assetId: 'asset:fixture-t' + index }))
  const nineBindings = nineAssets.map((asset, index) => ({ instanceId: 'instance:i' + index, assetId: asset.assetId }))
  expectError(
    validateVoiceAssetLibrary(library({
      profiles: [profile({ bindings: nineBindings })],
      assets: nineAssets,
    })),
    'RESOURCE_LIMIT',
    '$',
  )

  const sixteenProfiles = Array.from({ length: 16 }, (_, index) => profile({ voiceProfileId: 'voice:p' + index, bindings: [] }))
  assert.equal(validateVoiceAssetLibrary(library({ profiles: sixteenProfiles })).ok, true)

  const thirtyTwoAssets = Array.from({ length: 32 }, (_, index) => ttsAsset({ assetId: 'asset:fixture-t' + index }))
  assert.equal(validateVoiceAssetLibrary(library({ profiles: [], assets: thirtyTwoAssets })).ok, true)

  const eightAssets = Array.from({ length: 8 }, (_, index) => ttsAsset({ assetId: 'asset:fixture-t' + index }))
  const eightBindings = eightAssets.map((asset, index) => ({ instanceId: 'instance:i' + index, assetId: asset.assetId }))
  assert.equal(
    validateVoiceAssetLibrary(library({ profiles: [profile({ bindings: eightBindings })], assets: eightAssets })).ok,
    true,
  )
})

test('V21 null prototypes, frozen inputs, shared references and __proto__ stay safe', () => {
  const nullProto = Object.assign(Object.create(null), {
    schemaVersion: 1,
    profiles: [Object.assign(Object.create(null), { ...profile(), bindings: [] })],
    assets: [Object.assign(Object.create(null), ttsAsset())],
  })
  assert.equal(validateVoiceAssetLibrary(nullProto).ok, true)

  const frozen = deepFreezeForTest(library())
  const validated = validateVoiceAssetLibrary(frozen)
  assert.equal(validated.ok, true)
  assert.equal(Object.isFrozen(frozen), true)

  const shared = ttsAsset()
  expectError(
    validateVoiceAssetLibrary(library({ assets: [shared, shared] })),
    'DUPLICATE_ID',
    'library',
  )

  const pollution = JSON.parse('{"schemaVersion":1,"profiles":[],"assets":[],"__proto__":{"polluted":true}}')
  const pollutedResult = expectError(validateVoiceAssetLibrary(pollution), 'INVALID_INPUT', '<unknown-key>')
  assert.equal(JSON.stringify(pollutedResult).includes('__proto__'), false)
  assert.equal({}.polluted, undefined)

  const constructorKey = JSON.parse('{"schemaVersion":1,"profiles":[],"assets":[],"constructor":1}')
  expectError(validateVoiceAssetLibrary(constructorKey), 'INVALID_INPUT', '<unknown-key>')
})

test('V22 results are fresh and deeply frozen, inputs stay untouched and calls share no objects', () => {
  const first = resolveFixtureVoiceBinding(ttsInput())
  const second = resolveFixtureVoiceBinding(ttsInput())
  expectBound(first, 'TTS_VOICE')
  expectBound(second, 'TTS_VOICE')

  assert.notEqual(first, second)
  assert.notEqual(first.value, second.value)
  assert.notEqual(first.value.provider, second.value.provider)
  assert.notEqual(first.value.binding, second.value.binding)
  assert.deepEqual(first.value, second.value)

  assert.deepEqual(Object.keys(first.value), VALUE_KEYS)
  assert.deepEqual(Object.keys(first.value.binding), BINDING_KEYS)
  assertDeepFrozen(first)

  const error = validateVoiceAssetLibrary({ schemaVersion: 99 })
  assert.deepEqual(Object.keys(error), ['ok', 'errors'])
  assertDeepFrozen(error)

  const blocked = resolveFixtureVoiceBinding(ttsInput({ library: library({ profiles: [] }) }))
  assertDeepFrozen(blocked)

  const input = ttsInput()
  const snapshot = JSON.stringify(input)
  const result = resolveFixtureVoiceBinding(input)
  assert.equal(Object.isFrozen(input), false)
  input.library.profiles[0].rightsState = 'REVOKED'
  assert.equal(JSON.stringify(input) !== snapshot, true)
  assert.equal(result.value.decision, 'FIXTURE_BOUND')
})

// ---------------------------------------------------------------------------------------------
// V23–V25: public surface, real reason codes/Chinese text, static dependency chain and docs.
// ---------------------------------------------------------------------------------------------

test('V23 exactly four exports, 27 fixed error codes and exact envelope fields', () => {
  assert.deepEqual(Object.keys(voiceAssets).sort(), [
    'VOICE_ASSETS_SCHEMA_VERSION',
    'VOICE_ASSET_ERRORS',
    'resolveFixtureVoiceBinding',
    'validateVoiceAssetLibrary',
  ])
  assert.equal(VOICE_ASSETS_SCHEMA_VERSION, 1)

  const keys = Object.keys(VOICE_ASSET_ERRORS)
  assert.equal(keys.length, 27)
  for (const key of keys) assert.equal(VOICE_ASSET_ERRORS[key], 'VOICE_ASSET_' + key)

  const bound = resolveFixtureVoiceBinding(ttsInput())
  expectBound(bound, 'TTS_VOICE')
  assert.deepEqual(Object.keys(bound.value), VALUE_KEYS)
  assert.equal(bound.value.messageZh, '演示音色绑定已核对；尚未生成音频，不能据此试听、保存或发送。')

  const mismatch = resolveFixtureVoiceBinding(ttsInput({ taskDraft: draftSvc() }))
  expectBlocked(mismatch, 'TASK_KIND_MISMATCH')
  assert.equal(mismatch.value.messageZh, '演示任务与所选音色不一致，请重新选择；系统不会自动替换。')

  assert.equal(
    resolveFixtureVoiceBinding(ttsInput({ taskDraft: draftTts({ rights: { state: 'UNVERIFIED' } }) })).value.messageZh,
    '演示使用权尚未确认或已撤销，请确认后再继续。',
  )
  assert.equal(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ profiles: [] }) })).value.messageZh,
    '没有可用的演示音色绑定，请重新选择或稍后再说。',
  )
  assert.equal(
    resolveFixtureVoiceBinding(ttsInput({ expectation: expectation({ profileRevision: 2 }) })).value.messageZh,
    '演示资产版本已变化，请刷新后重新选择。',
  )
  assert.equal(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ assets: [ttsAsset({ availability: 'UNKNOWN' }), rvcAsset()] }) })).value.messageZh,
    '演示资产状态未知，请重新检查，系统不会自动下载。',
  )
  assert.equal(
    resolveFixtureVoiceBinding(ttsInput({ library: library({ assets: [ttsAsset({ expiresAt: '2026-10-26T00:00:00.000Z' }), rvcAsset()] }) })).value.messageZh,
    '演示资产已过期，请重新选择可用资产。',
  )

  const validated = validateVoiceAssetLibrary(library())
  assert.equal(validated.ok, true)
  assert.deepEqual(Object.keys(validated.value), [
    'schemaVersion',
    'library',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
  ])
  assert.deepEqual(Object.keys(validated.value.library), ['schemaVersion', 'profiles', 'assets'])
  assertDeepFrozen(validated)
})

test('V24 static call graph reuses the real draft/negotiation modules and stays pure', async () => {
  const source = await readFile(new URL('../core/audio/voice-assets.mjs', import.meta.url), 'utf8')
  assert.equal((source.match(/validateAudioTaskDraft\(/g) || []).length, 1)
  assert.equal((source.match(/negotiateProviderInstance\(/g) || []).length, 1)
  assert.match(source, /from '\.\/task-contract\.mjs'/)
  assert.match(source, /from '\.\/provider-instances\.mjs'/)
  assert.match(source, /from '\.\/fixture-input-boundary\.mjs'/)
  assert.doesNotMatch(source, /dispatchRvcFakeOnce|simulateRvcFakeConversion|createAudioTaskRecord|transitionAudioTask/)
  assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(|process\.|Date\.now|Math\.random|setTimeout|setInterval/)

  const resolverStart = source.indexOf('function resolveFixtureVoiceBindingInternal')
  const resolverEnd = source.indexOf('export function resolveFixtureVoiceBinding')
  assert.ok(resolverStart >= 0 && resolverEnd > resolverStart)
  assert.equal(source.slice(resolverStart, resolverEnd).includes('validateVoiceAssetLibrary('), false)

  // No public test hook was added for dependency failure injection; only the four exports exist.
  assert.equal(Object.keys(voiceAssets).length, 4)
})

test('V25 offline documentation states the mapping limit and three recoveries without a GUI claim', async () => {
  const doc = await readFile(new URL('../docs/VOICE_ASSETS_OFFLINE.md', import.meta.url), 'utf8')
  for (const marker of ['FIXTURE_BOUND', 'CONFIRMED_FIXTURE', 'OFFLINE', 'FIXTURE_ONLY', 'NOT_INTEGRATED']) {
    assert.equal(doc.includes(marker), true, marker)
  }
  assert.equal(doc.includes('尚未生成音频'), true)
  assert.equal(doc.includes('演示绑定'), true)
  assert.equal(doc.includes('没有新增可点击按钮'), true)
  assert.equal(doc.includes('版本已变化'), true)
  assert.equal(doc.includes('使用权'), true)
  assert.equal(doc.includes('重新选择'), true)
})

// ---------------------------------------------------------------------------------------------
// Additional boundaries: invalid roots, dependency rejection mapping and provider value size.
// ---------------------------------------------------------------------------------------------

test('B01 non-object roots and invalid dependency inputs map to the fixed protocol', () => {
  for (const value of [null, undefined, [], 'x', 7, true]) {
    expectError(validateVoiceAssetLibrary(value), 'INVALID_INPUT', '$')
    expectError(resolveFixtureVoiceBinding(value), 'INVALID_INPUT', '$')
  }

  expectError(resolveFixtureVoiceBinding(ttsInput({ taskDraft: {} })), 'INVALID_TASK', 'taskDraft')
  expectError(resolveFixtureVoiceBinding(ttsInput({ negotiation: { schemaVersion: 1 } })), 'INVALID_NEGOTIATION', 'negotiation')

  const badNow = ttsInput({ now: '2026-10-27T00:00:00Z' })
  expectError(resolveFixtureVoiceBinding(badNow), 'INVALID_NOW', 'now')

  expectError(
    resolveFixtureVoiceBinding(ttsInput({ expectation: { scopeId: 'scope:demo', profileRevision: 1, assetRevision: 1 } })),
    'INVALID_EXPECTATION',
    'expectation',
  )
  expectError(
    resolveFixtureVoiceBinding(ttsInput({ expectation: { ...expectation(), extra: 1 } })),
    'INVALID_EXPECTATION',
    'expectation',
  )
})

test('B02 a caller-forged validate envelope is not accepted as resolver input', () => {
  const validated = validateVoiceAssetLibrary(library())
  assert.equal(validated.ok, true)
  expectError(resolveFixtureVoiceBinding(validated.value), 'INVALID_INPUT', '<unknown-key>')
})

test('B03 resolver business block keeps the original provider value unmodified across calls', () => {
  const input = svcInput({
    negotiation: negotiation(
      [rvcInstance()],
      { category: 'SVC', instanceId: 'instance:rvc' },
      rvcRequest({ targetModelId: 'rvc-model:fixture-b' }),
    ),
    library: library({
      profiles: [profile({ bindings: [{ instanceId: 'instance:rvc', assetId: 'asset:fixture-model-b' }] })],
      assets: [rvcAsset({ assetId: 'asset:fixture-model-b', providerRef: 'rvc-model:fixture-b' })],
    }),
  })
  const direct = negotiateProviderInstance(input.negotiation)
  assert.equal(direct.ok, true)
  const first = expectBlocked(resolveFixtureVoiceBinding(input), 'PROVIDER_BLOCKED')
  const second = expectBlocked(resolveFixtureVoiceBinding(input), 'PROVIDER_BLOCKED')
  assert.deepEqual(plain(first.value.provider), plain(direct.value))
  assert.deepEqual(plain(first.value.provider), plain(second.value.provider))
  assert.notEqual(first.value.provider, second.value.provider)
  assert.equal(first.value.provider.mockOnly, true)
  assert.equal(first.value.provider.realOperationAllowed, false)
})
