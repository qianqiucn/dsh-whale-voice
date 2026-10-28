import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import * as sourceArtifacts from '../core/audio/source-artifacts.mjs'
import {
  SOURCE_ARTIFACTS_SCHEMA_VERSION,
  SOURCE_ARTIFACT_ERRORS,
  resolveFixtureTaskSource,
  validateFixtureSourceLibrary,
} from '../core/audio/source-artifacts.mjs'
import { resolveFixtureVoiceBinding } from '../core/audio/voice-assets.mjs'
import { RVC_FAKE_LIMITS } from '../core/svc/rvc-fake-gateway.mjs'

const ERR = SOURCE_ARTIFACT_ERRORS
const SCOPE = 'scope:fixture-demo'
const NOW = '2026-10-27T00:00:00.000Z'
const LINKED_MESSAGE = '演示源内容与任务请求已核对；尚未生成音频，不能据此试听、保存或发送。'

// ---------------------------------------------------------------------------------------------
// Fictional fixtures (no real media, file, credential or user data).
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

function observation(overrides = {}) {
  return {
    state: 'ok',
    credentials: 'not_required',
    observedAt: '2026-10-26T00:00:00.000Z',
    versionMatches: true,
    ...overrides,
  }
}

function ttsVoiceBinding() {
  return {
    schemaVersion: 1,
    library: {
      schemaVersion: 1,
      profiles: [
        {
          voiceProfileId: 'voice:demo-hero',
          revision: 1,
          scopeId: SCOPE,
          displayName: '演示角色',
          rightsState: 'CONFIRMED_FIXTURE',
          bindings: [{ instanceId: 'instance:qwen', assetId: 'asset:fixture-voice-a' }],
        },
      ],
      assets: [
        {
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
        },
      ],
    },
    taskDraft: {
      schemaVersion: 1,
      taskId: 'task:demo-tts',
      feature: 'voice-bubbles',
      taskType: 'TTS',
      source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-1' },
      voiceProfileId: 'voice:demo-hero',
      deliveryRequested: false,
      rights: { state: 'CONFIRMED_FIXTURE' },
    },
    negotiation: {
      schemaVersion: 1,
      registry: {
        schemaVersion: 1,
        instances: [
          {
            instanceId: 'instance:qwen',
            category: 'TTS',
            candidateId: 'qwen3-tts',
            protocolVersion: 1,
            fixture: true,
            manifest: baseManifest(),
            observation: observation(),
          },
        ],
      },
      selection: { category: 'TTS', instanceId: 'instance:qwen' },
      consent: { networkAllowed: false, textUploadAllowed: false, paidAllowed: false },
      request: {
        requestId: 'request:fixture-1',
        text: 'hello',
        voiceId: 'voice-a',
        language: 'zh-CN',
        emotion: 'neutral',
        format: 'audio/wav',
        streaming: false,
      },
    },
    expectation: { scopeId: SCOPE, profileRevision: 1, assetRevision: 1 },
    now: NOW,
  }
}

function svcVoiceBinding() {
  return {
    schemaVersion: 1,
    library: {
      schemaVersion: 1,
      profiles: [
        {
          voiceProfileId: 'voice:demo-hero',
          revision: 1,
          scopeId: SCOPE,
          displayName: '演示角色',
          rightsState: 'CONFIRMED_FIXTURE',
          bindings: [{ instanceId: 'instance:rvc', assetId: 'asset:fixture-model-a' }],
        },
      ],
      assets: [
        {
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
        },
      ],
    },
    taskDraft: {
      schemaVersion: 1,
      taskId: 'task:demo-svc',
      feature: 'singing',
      taskType: 'SVC',
      source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-source-1' },
      voiceProfileId: 'voice:demo-hero',
      deliveryRequested: false,
      rights: { state: 'CONFIRMED_FIXTURE' },
    },
    negotiation: {
      schemaVersion: 1,
      registry: {
        schemaVersion: 1,
        instances: [
          {
            instanceId: 'instance:rvc',
            category: 'SVC',
            candidateId: 'rvc',
            protocolVersion: 1,
            fixture: true,
            manifest: null,
            observation: observation(),
          },
        ],
      },
      selection: { category: 'SVC', instanceId: 'instance:rvc' },
      consent: { networkAllowed: false, textUploadAllowed: false, paidAllowed: false },
      request: {
        schemaVersion: 1,
        sourceAudioRef: 'artifact:fixture-source-1',
        targetModelId: 'rvc-model:fixture-a',
        pitchShift: 0,
        outputFormat: 'audio/wav',
        inputAudio: { durationMs: 1000, byteLength: 1000, sampleRate: 44100, channels: 1 },
        rights: { state: 'CONFIRMED_FIXTURE' },
      },
    },
    expectation: { scopeId: SCOPE, profileRevision: 1, assetRevision: 1 },
    now: NOW,
  }
}

function textArtifact(overrides = {}) {
  return {
    artifactRef: 'artifact:fixture-text-1',
    revision: 1,
    scopeId: SCOPE,
    kind: 'TEXT',
    rightsState: 'CONFIRMED_FIXTURE',
    availability: 'PRESENT',
    expiresAt: null,
    text: 'hello',
    audio: null,
    ...overrides,
  }
}

function audioArtifact(overrides = {}) {
  return {
    artifactRef: 'artifact:fixture-source-1',
    revision: 1,
    scopeId: SCOPE,
    kind: 'AUDIO',
    rightsState: 'CONFIRMED_FIXTURE',
    availability: 'PRESENT',
    expiresAt: null,
    text: null,
    audio: { durationMs: 1000, byteLength: 1000, sampleRate: 44100, channels: 1 },
    ...overrides,
  }
}

function sourceLibrary(artifacts) {
  return { schemaVersion: 1, artifacts }
}

function ttsInput(voiceBinding = ttsVoiceBinding(), artifacts = [textArtifact()]) {
  return { schemaVersion: 1, voiceBinding, artifactLibrary: sourceLibrary(artifacts), sourceRevision: 1 }
}

function svcInput(voiceBinding = svcVoiceBinding(), artifacts = [audioArtifact()]) {
  return { schemaVersion: 1, voiceBinding, artifactLibrary: sourceLibrary(artifacts), sourceRevision: 1 }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// ---------------------------------------------------------------------------------------------
// Assertion helpers (real module results only).
// ---------------------------------------------------------------------------------------------

function expectError(result, key, path) {
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, ERR[key], 'error code')
  assert.equal(result.errors[0].path, path, 'error path')
  assert.equal(result.errors[0].reason, key.toLowerCase().replace(/_/g, ' '), 'error reason')
  return result
}

function expectLinked(result, kind) {
  assert.equal(result.ok, true)
  assert.equal(result.value.decision, 'FIXTURE_SOURCE_LINKED')
  assert.equal(result.value.reason, null)
  assert.equal(result.value.messageZh, LINKED_MESSAGE)
  assert.equal(result.value.source.kind, kind)
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
  assert.equal(result.value.source, null)
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
  'voiceBinding',
  'source',
  'mockOnly',
  'realOperationAllowed',
  'submitAllowed',
  'automaticRetryAllowed',
]

// ---------------------------------------------------------------------------------------------
// S01–S04: text and audio association.
// ---------------------------------------------------------------------------------------------

test('S01 a complete TTS fixture links, hides text/sourceRef and preserves the 08-A value', () => {
  const input = ttsInput()
  const direct = resolveFixtureVoiceBinding(input.voiceBinding)
  const result = expectLinked(resolveFixtureTaskSource(input), 'TEXT')

  assert.equal(result.value.source.revision, 1)
  assert.deepEqual(Object.keys(result.value.source).sort(), ['kind', 'revision'])
  assert.deepEqual(Object.keys(result.value), VALUE_KEYS)
  assert.deepEqual(plain(result.value.voiceBinding), plain(direct.value))
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('hello'), false)
  assert.equal(encoded.includes('artifact:fixture-text-1'), false)
  assert.equal(encoded.includes('SECRET'), false)
})

test('S02 a complete SVC fixture links on metadata declarations only', () => {
  const input = svcInput()
  const result = expectLinked(resolveFixtureTaskSource(input), 'AUDIO')
  assert.equal(result.value.source.revision, 1)
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('byteLength'), false)
  assert.equal(encoded.includes('durationMs'), false)
  assert.equal(encoded.includes('sampleRate'), false)
  assert.equal(encoded.includes('audio/wav'), false)
  assert.equal(result.value.voiceBinding.provider.category, 'SVC')
})

test('S03 TTS text comparison is strict code-unit equality without normalisation', () => {
  const variants = ['hello ', 'Hello', 'hello\n', 'he\u0301llo']
  for (const text of variants) {
    const input = ttsInput()
    input.artifactLibrary.artifacts[0].text = text
    input.voiceBinding.negotiation.request.text = 'héllo'
    if (text === 'he\u0301llo') {
      input.voiceBinding.negotiation.request.text = 'héllo'
    }
    expectBlocked(resolveFixtureTaskSource(input), 'SOURCE_TEXT_MISMATCH')
  }

  const secret = 'SECRET_MARKER_S03'
  const marked = ttsInput()
  marked.artifactLibrary.artifacts[0].text = secret
  const result = expectBlocked(resolveFixtureTaskSource(marked), 'SOURCE_TEXT_MISMATCH')
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(JSON.stringify(result).includes('stack'), false)

  // NFC vs NFD are not equal even though they render the same.
  const nfc = ttsInput()
  nfc.artifactLibrary.artifacts[0].text = 'café'
  nfc.voiceBinding.negotiation.request.text = 'cafe\u0301'
  expectBlocked(resolveFixtureTaskSource(nfc), 'SOURCE_TEXT_MISMATCH')
})

test('S04 SVC compares all four audio metadata fields exactly', () => {
  for (const patch of [
    { durationMs: 1001 },
    { byteLength: 999 },
    { sampleRate: 48000 },
  ]) {
    const input = svcInput()
    Object.assign(input.artifactLibrary.artifacts[0].audio, patch)
    expectBlocked(resolveFixtureTaskSource(input), 'SOURCE_AUDIO_MISMATCH')
  }

  for (const channels of [2, '1', 1.5]) {
    const input = svcInput()
    input.artifactLibrary.artifacts[0].audio.channels = channels
    expectError(resolveFixtureTaskSource(input), 'INVALID_LIBRARY', 'artifactLibrary')
  }

  const alternative = svcInput()
  alternative.artifactLibrary.artifacts[0].audio.sampleRate = 48000
  alternative.voiceBinding.negotiation.request.inputAudio.sampleRate = 48000
  expectLinked(resolveFixtureTaskSource(alternative), 'AUDIO')
})

// ---------------------------------------------------------------------------------------------
// S05–S07: kind/payload rules, scope lookup and revisions.
// ---------------------------------------------------------------------------------------------

test('S05 kind mismatch is a business block; malformed payload variants are structural', () => {
  const svcWithText = svcInput()
  svcWithText.voiceBinding.taskDraft.source.ref = 'artifact:fixture-text-1'
  svcWithText.voiceBinding.negotiation.request.sourceAudioRef = 'artifact:fixture-text-1'
  svcWithText.artifactLibrary = sourceLibrary([textArtifact()])
  expectBlocked(resolveFixtureTaskSource(svcWithText), 'SOURCE_KIND_MISMATCH')

  const ttsWithAudio = ttsInput()
  ttsWithAudio.voiceBinding.taskDraft.source.ref = 'artifact:fixture-source-1'
  ttsWithAudio.artifactLibrary = sourceLibrary([audioArtifact()])
  expectBlocked(resolveFixtureTaskSource(ttsWithAudio), 'SOURCE_KIND_MISMATCH')

  const doublePayload = textArtifact({ audio: { durationMs: 1, byteLength: 1, sampleRate: 16000, channels: 1 } })
  expectError(validateFixtureSourceLibrary(sourceLibrary([doublePayload])), 'INVALID_LIBRARY', 'artifactLibrary')

  expectError(validateFixtureSourceLibrary(sourceLibrary([textArtifact({ text: null })])), 'INVALID_LIBRARY', 'artifactLibrary')
  expectError(validateFixtureSourceLibrary(sourceLibrary([audioArtifact({ text: 'x' })])), 'INVALID_LIBRARY', 'artifactLibrary')
  expectError(validateFixtureSourceLibrary(sourceLibrary([textArtifact({ text: '' })])), 'INVALID_LIBRARY', 'artifactLibrary')

  const audioMissingKey = audioArtifact()
  delete audioMissingKey.audio.channels
  expectError(validateFixtureSourceLibrary(sourceLibrary([audioMissingKey])), 'INVALID_LIBRARY', 'artifactLibrary')

  for (const patch of [
    { durationMs: 0 },
    { durationMs: RVC_FAKE_LIMITS.maxDurationMs + 1 },
    { byteLength: 0 },
    { byteLength: RVC_FAKE_LIMITS.maxByteLength + 1 },
    { sampleRate: 12345 },
  ]) {
    const artifact = audioArtifact()
    Object.assign(artifact.audio, patch)
    expectError(validateFixtureSourceLibrary(sourceLibrary([artifact])), 'INVALID_LIBRARY', 'artifactLibrary')
  }

  assert.equal(validateFixtureSourceLibrary(sourceLibrary([textArtifact({ text: 'a'.repeat(8192) })])).ok, true)
  expectError(
    validateFixtureSourceLibrary(sourceLibrary([textArtifact({ text: 'a'.repeat(8193) })])),
    'RESOURCE_LIMIT',
    '$',
  )
})

test('S06 missing source and source only in another scope are indistinguishable', () => {
  const missing = expectBlocked(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [])),
    'SOURCE_UNAVAILABLE',
  )
  const otherScope = expectBlocked(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ scopeId: 'scope:fixture-other' })])),
    'SOURCE_UNAVAILABLE',
  )
  assert.deepEqual(otherScope.value, missing.value)
  const encoded = JSON.stringify(otherScope)
  assert.equal(encoded.includes('scope:fixture-other'), false)
  assert.equal(encoded.includes('artifact:fixture-text-1'), false)
})

test('S07 source revisions are explicit; invalid revisions are structural errors', () => {
  const stale = ttsInput()
  stale.sourceRevision = 2
  expectBlocked(resolveFixtureTaskSource(stale), 'SOURCE_REVISION_MISMATCH')

  for (const revision of [0, 1.5, '1', -1]) {
    const input = ttsInput()
    input.sourceRevision = revision
    expectError(resolveFixtureTaskSource(input), 'INVALID_SOURCE_REVISION', 'sourceRevision')
  }

  for (const revision of [0, 1.5, '1']) {
    expectError(
      validateFixtureSourceLibrary(sourceLibrary([textArtifact({ revision })])),
      'INVALID_LIBRARY',
      'artifactLibrary',
    )
  }

  // No implicit "latest": an older explicit expectation stays stale.
  const older = ttsInput(ttsVoiceBinding(), [textArtifact({ revision: 2 })])
  older.sourceRevision = 1
  expectBlocked(resolveFixtureTaskSource(older), 'SOURCE_REVISION_MISMATCH')
})

// ---------------------------------------------------------------------------------------------
// S08–S10: rights, availability/expiry and isolation.
// ---------------------------------------------------------------------------------------------

test('S08 source rights are independent; the original 08-A block always wins', () => {
  for (const rightsState of ['UNVERIFIED', 'REVOKED']) {
    expectBlocked(
      resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ rightsState })])),
      'SOURCE_RIGHTS_UNCONFIRMED',
    )
  }

  const taskRights = ttsVoiceBinding()
  taskRights.taskDraft.rights = { state: 'UNVERIFIED' }
  const oldBlocked = expectBlocked(resolveFixtureTaskSource(ttsInput(taskRights)), 'VOICE_BINDING_BLOCKED')
  assert.equal(oldBlocked.value.reason, 'SOURCE_ARTIFACT_VOICE_BINDING_BLOCKED')
  assert.equal(oldBlocked.value.messageZh, '演示使用权尚未确认或已撤销，请确认后再继续。')
  assert.equal(oldBlocked.value.voiceBinding.decision, 'BLOCKED')

  // A legal PRESENT source cannot upgrade an old 08-A rejection.
  const stillBlocked = ttsInput(taskRights)
  stillBlocked.artifactLibrary.artifacts[0].availability = 'PRESENT'
  expectBlocked(resolveFixtureTaskSource(stillBlocked), 'VOICE_BINDING_BLOCKED')
})

test('S09 ABSENT/UNKNOWN/expiry are exact business states with explicit now', () => {
  expectBlocked(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ availability: 'ABSENT' })])),
    'SOURCE_MISSING',
  )
  expectBlocked(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ availability: 'UNKNOWN' })])),
    'SOURCE_UNKNOWN',
  )
  expectBlocked(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ expiresAt: '2026-10-26T23:59:59.999Z' })])),
    'SOURCE_EXPIRED',
  )
  expectBlocked(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ expiresAt: NOW })])),
    'SOURCE_EXPIRED',
  )
  expectLinked(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ expiresAt: '2026-10-27T00:00:00.001Z' })])),
    'TEXT',
  )
  expectLinked(resolveFixtureTaskSource(ttsInput()), 'TEXT')
})

test('S10 legal negatives on unselected entries do not contaminate; bad structure and duplicates do', () => {
  const extra = textArtifact({ artifactRef: 'artifact:fixture-text-other', availability: 'ABSENT' })
  const revoked = textArtifact({ artifactRef: 'artifact:fixture-text-old', rightsState: 'REVOKED' })
  const expired = textArtifact({ artifactRef: 'artifact:fixture-text-expired', expiresAt: '2026-10-26T00:00:00.000Z' })
  expectLinked(resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact(), extra, revoked, expired])), 'TEXT')

  const bad = textArtifact({ artifactRef: 'artifact:fixture-text-bad' })
  bad.extra = true
  expectError(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact(), bad])),
    'INVALID_LIBRARY',
    'artifactLibrary',
  )

  expectError(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [
      textArtifact(),
      textArtifact({ scopeId: 'scope:fixture-other' }),
    ])),
    'DUPLICATE_ARTIFACT',
    'artifactLibrary',
  )
})

// ---------------------------------------------------------------------------------------------
// S11–S13: old provider blocks, no re-implementation, fixed error priority.
// ---------------------------------------------------------------------------------------------

function modelBSvcBinding() {
  const binding = svcVoiceBinding()
  binding.library.assets[0].assetId = 'asset:fixture-model-b'
  binding.library.assets[0].providerRef = 'rvc-model:fixture-b'
  binding.library.profiles[0].bindings[0].assetId = 'asset:fixture-model-b'
  binding.negotiation.request.targetModelId = 'rvc-model:fixture-b'
  return binding
}

test('S11 every original 08-A/provider block is preserved and never upgraded by a source', () => {
  const modelB = svcInput(modelBSvcBinding(), [audioArtifact({ artifactRef: 'artifact:fixture-source-1' })])
  const result = expectBlocked(resolveFixtureTaskSource(modelB), 'VOICE_BINDING_BLOCKED')
  assert.equal(result.value.voiceBinding.reason, 'VOICE_ASSET_PROVIDER_BLOCKED')
  assert.equal(result.value.voiceBinding.provider.reason, 'PROVIDER_INSTANCE_MODEL_NOT_AVAILABLE')
  assert.equal(result.value.messageZh, result.value.voiceBinding.messageZh)

  const offline = ttsVoiceBinding()
  offline.negotiation.registry.instances[0].observation = observation({ state: 'offline' })
  const offlineResult = expectBlocked(resolveFixtureTaskSource(ttsInput(offline)), 'VOICE_BINDING_BLOCKED')
  assert.equal(offlineResult.value.voiceBinding.reason, 'VOICE_ASSET_PROVIDER_BLOCKED')
  assert.equal(offlineResult.value.voiceBinding.provider.reason, 'PROVIDER_INSTANCE_OFFLINE')

  const swapped = ttsVoiceBinding()
  swapped.negotiation.request.voiceId = 'voice-b'
  const swappedResult = expectBlocked(resolveFixtureTaskSource(ttsInput(swapped)), 'VOICE_BINDING_BLOCKED')
  assert.equal(swappedResult.value.voiceBinding.reason, 'VOICE_ASSET_PROVIDER_REF_MISMATCH')
  assert.equal(swappedResult.value.messageZh, swappedResult.value.voiceBinding.messageZh)
})

test('S12 the module never re-implements or fixes the original request/selection', () => {
  const wrongInstance = ttsVoiceBinding()
  wrongInstance.negotiation.selection = { category: 'SVC', instanceId: 'instance:rvc' }
  wrongInstance.negotiation.registry.instances[0].category = 'SVC'
  wrongInstance.negotiation.registry.instances[0].candidateId = 'rvc'
  wrongInstance.negotiation.registry.instances[0].manifest = null
  expectBlocked(resolveFixtureTaskSource(ttsInput(wrongInstance)), 'VOICE_BINDING_BLOCKED')

  const wrongSource = svcVoiceBinding()
  wrongSource.taskDraft.source.ref = 'artifact:fixture-other-source'
  const wrongSourceResult = expectBlocked(resolveFixtureTaskSource(svcInput(wrongSource)), 'VOICE_BINDING_BLOCKED')
  assert.equal(wrongSourceResult.value.voiceBinding.reason, 'VOICE_ASSET_SOURCE_MISMATCH')
  assert.equal(wrongSourceResult.value.voiceBinding.binding, null)
  assert.equal(wrongSourceResult.value.messageZh, wrongSourceResult.value.voiceBinding.messageZh)
})

test('S13 fixed first-error order: structure, revision, rights, availability, expiry, kind, content', () => {
  const invalidLibraryWithOldBlock = ttsInput()
  invalidLibraryWithOldBlock.voiceBinding.taskDraft.rights = { state: 'UNVERIFIED' }
  invalidLibraryWithOldBlock.artifactLibrary.artifacts[0].extra = 1
  expectError(resolveFixtureTaskSource(invalidLibraryWithOldBlock), 'INVALID_LIBRARY', 'artifactLibrary')

  const badRevision = ttsInput()
  badRevision.sourceRevision = 0
  badRevision.artifactLibrary.artifacts[0].extra = 1
  expectError(resolveFixtureTaskSource(badRevision), 'INVALID_SOURCE_REVISION', 'sourceRevision')

  const revisionAndRights = ttsInput(ttsVoiceBinding(), [textArtifact({ revision: 2, rightsState: 'REVOKED' })])
  revisionAndRights.sourceRevision = 1
  expectBlocked(resolveFixtureTaskSource(revisionAndRights), 'SOURCE_REVISION_MISMATCH')

  const rightsAndAbsent = ttsInput(ttsVoiceBinding(), [textArtifact({ rightsState: 'REVOKED', availability: 'ABSENT' })])
  expectBlocked(resolveFixtureTaskSource(rightsAndAbsent), 'SOURCE_RIGHTS_UNCONFIRMED')

  const absentAndExpired = ttsInput(ttsVoiceBinding(), [
    textArtifact({ availability: 'ABSENT', expiresAt: '2026-10-26T00:00:00.000Z' }),
  ])
  expectBlocked(resolveFixtureTaskSource(absentAndExpired), 'SOURCE_MISSING')

  const kindAndText = ttsInput(ttsVoiceBinding(), [audioArtifact({ artifactRef: 'artifact:fixture-text-1' })])
  kindAndText.voiceBinding.taskDraft.source.ref = 'artifact:fixture-text-1'
  expectBlocked(resolveFixtureTaskSource(kindAndText), 'SOURCE_KIND_MISMATCH')

  const rootSchema = ttsInput()
  rootSchema.schemaVersion = 2
  rootSchema.artifactLibrary.artifacts[0].extra = 1
  expectError(resolveFixtureTaskSource(rootSchema), 'UNSUPPORTED_VERSION', 'schemaVersion')
})

// ---------------------------------------------------------------------------------------------
// S14–S17: structural protocol, hostile input, budgets and freshness.
// ---------------------------------------------------------------------------------------------

test('S14 fixed root/nested protocol, forged envelopes and insertion order', () => {
  const unknownRoot = ttsInput()
  unknownRoot.ready = true
  expectError(resolveFixtureTaskSource(unknownRoot), 'INVALID_INPUT', '<unknown-key>')

  const missing = ttsInput()
  delete missing.sourceRevision
  expectError(resolveFixtureTaskSource(missing), 'INVALID_INPUT', '$')

  const wrongSchema = ttsInput()
  wrongSchema.schemaVersion = 2
  expectError(resolveFixtureTaskSource(wrongSchema), 'UNSUPPORTED_VERSION', 'schemaVersion')

  const nestedUnknown = ttsInput()
  nestedUnknown.artifactLibrary.extra = 1
  expectError(resolveFixtureTaskSource(nestedUnknown), 'INVALID_LIBRARY', 'artifactLibrary')

  const nestedSchema = ttsInput()
  nestedSchema.artifactLibrary.schemaVersion = 2
  expectError(resolveFixtureTaskSource(nestedSchema), 'UNSUPPORTED_VERSION', 'artifactLibrary')

  const nestedMissing = ttsInput()
  delete nestedMissing.artifactLibrary.artifacts
  expectError(resolveFixtureTaskSource(nestedMissing), 'INVALID_LIBRARY', 'artifactLibrary')

  const validated = validateFixtureSourceLibrary(sourceLibrary([textArtifact()]))
  expectError(resolveFixtureTaskSource(validated.value), 'INVALID_INPUT', '<unknown-key>')

  const orderedA = { schemaVersion: 2, voiceBinding: ttsVoiceBinding(), artifactLibrary: sourceLibrary([]), sourceRevision: 1, ready: true }
  const orderedB = {}
  orderedB.ready = true
  orderedB.sourceRevision = 1
  orderedB.artifactLibrary = sourceLibrary([])
  orderedB.voiceBinding = ttsVoiceBinding()
  orderedB.schemaVersion = 2
  expectError(resolveFixtureTaskSource(orderedA), 'INVALID_INPUT', '<unknown-key>')
  expectError(resolveFixtureTaskSource(orderedB), 'INVALID_INPUT', '<unknown-key>')

  // Public library root keeps its own shape mapping.
  expectError(validateFixtureSourceLibrary({ schemaVersion: 1, artifacts: [], extra: 1 }), 'INVALID_INPUT', '<unknown-key>')
  expectError(validateFixtureSourceLibrary({ schemaVersion: 1 }), 'INVALID_INPUT', '$')
  expectError(validateFixtureSourceLibrary({ schemaVersion: 2, artifacts: [] }), 'UNSUPPORTED_VERSION', 'schemaVersion')
})

test('S15 accessors, Symbols, hidden keys, custom prototypes and throwing Proxies fail closed', () => {
  let reads = 0
  const accessorRoot = ttsInput()
  Object.defineProperty(accessorRoot, 'artifactLibrary', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return sourceLibrary([textArtifact()])
    },
  })
  expectError(resolveFixtureTaskSource(accessorRoot), 'INVALID_INPUT', '$')
  assert.equal(reads, 0)

  const accessorArtifact = textArtifact()
  Object.defineProperty(accessorArtifact, 'text', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return 'hello'
    },
  })
  expectError(validateFixtureSourceLibrary(sourceLibrary([accessorArtifact])), 'INVALID_INPUT', '$')
  assert.equal(reads, 0)

  const symbol = ttsInput()
  symbol[Symbol('secret')] = true
  expectError(resolveFixtureTaskSource(symbol), 'INVALID_INPUT', '$')

  const hidden = ttsInput()
  Object.defineProperty(hidden, 'hiddenKey', { value: 1, enumerable: false })
  expectError(resolveFixtureTaskSource(hidden), 'INVALID_INPUT', '$')

  const custom = Object.create({ inherited: 1 })
  Object.assign(custom, ttsInput())
  expectError(resolveFixtureTaskSource(custom), 'INVALID_INPUT', '$')

  const marker = 'PRIVATE_MARKER_S15'
  const proxy = new Proxy({}, {
    ownKeys() {
      throw new Error(marker)
    },
  })
  const proxied = expectError(resolveFixtureTaskSource(proxy), 'INVALID_INPUT', '$')
  assert.equal(JSON.stringify(proxied).includes(marker), false)
  assert.equal(JSON.stringify(proxied).includes('stack'), false)

  const pollution = JSON.parse(JSON.stringify(ttsInput()))
  Object.defineProperty(pollution, '__proto__', {
    value: { polluted: true },
    enumerable: true,
    configurable: true,
  })
  expectError(resolveFixtureTaskSource(pollution), 'INVALID_INPUT', '<unknown-key>')
  assert.equal({}.polluted, undefined)
})

test('S16 copy budgets and the 32/33 artifact boundary are enforced', () => {
  const cyclic = ttsInput()
  cyclic.self = cyclic
  expectError(resolveFixtureTaskSource(cyclic), 'INVALID_INPUT', '$')

  const holes = ttsInput()
  holes.artifactLibrary.artifacts = new Array(1)
  expectError(resolveFixtureTaskSource(holes), 'INVALID_INPUT', '$')

  const extraProp = ttsInput()
  extraProp.artifactLibrary.artifacts.extra = 1
  expectError(resolveFixtureTaskSource(extraProp), 'INVALID_INPUT', '$')

  expectError(validateFixtureSourceLibrary(sourceLibrary([textArtifact({ text: () => 'x' })])), 'INVALID_INPUT', '$')
  expectError(validateFixtureSourceLibrary(sourceLibrary([textArtifact({ revision: NaN })])), 'INVALID_INPUT', '$')
  expectError(validateFixtureSourceLibrary(sourceLibrary([textArtifact({ revision: 1n })])), 'INVALID_INPUT', '$')

  let deep = []
  const deepRoot = deep
  for (let index = 0; index < 14; index += 1) {
    const next = []
    deep.push(next)
    deep = next
  }
  const deepInput = ttsInput()
  deepInput.extra = deepRoot
  expectError(resolveFixtureTaskSource(deepInput), 'RESOURCE_LIMIT', '$')

  const wide = Array.from({ length: 256 }, () => {
    const entry = {}
    for (let index = 0; index < 16; index += 1) entry['k' + index] = 1
    return entry
  })
  const wideInput = ttsInput()
  wideInput.extra = wide
  expectError(resolveFixtureTaskSource(wideInput), 'RESOURCE_LIMIT', '$')

  const many = Array.from({ length: 32 }, (_, index) =>
    textArtifact({ artifactRef: 'artifact:fixture-text-' + index }),
  )
  const thirtyTwo = validateFixtureSourceLibrary(sourceLibrary(many))
  assert.equal(thirtyTwo.ok, true)
  assert.equal(thirtyTwo.value.artifactCount, 32)

  const thirtyThree = Array.from({ length: 33 }, (_, index) =>
    textArtifact({ artifactRef: 'artifact:fixture-text-' + index }),
  )
  expectError(validateFixtureSourceLibrary(sourceLibrary(thirtyThree)), 'RESOURCE_LIMIT', '$')
})

test('S17 null prototypes, frozen inputs, shared references and freshness/freezing', () => {
  const nullProtoArtifact = Object.assign(Object.create(null), textArtifact())
  const nullProtoLibrary = Object.assign(Object.create(null), { schemaVersion: 1, artifacts: [nullProtoArtifact] })
  assert.equal(validateFixtureSourceLibrary(nullProtoLibrary).ok, true)

  const frozen = deepFreezeForTest(ttsInput())
  const frozenResult = resolveFixtureTaskSource(frozen)
  assert.equal(frozenResult.ok, true)
  assert.equal(Object.isFrozen(frozen), true)

  const shared = textArtifact()
  expectError(
    validateFixtureSourceLibrary(sourceLibrary([shared, shared])),
    'DUPLICATE_ARTIFACT',
    'artifactLibrary',
  )

  const first = resolveFixtureTaskSource(ttsInput())
  const second = resolveFixtureTaskSource(ttsInput())
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.notEqual(first, second)
  assert.notEqual(first.value, second.value)
  assert.notEqual(first.value.voiceBinding, second.value.voiceBinding)
  assert.notEqual(first.value.source, second.value.source)
  assert.deepEqual(first.value, second.value)
  assertDeepFrozen(first)

  const blocked = resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), []))
  assertDeepFrozen(blocked)
  const error = validateFixtureSourceLibrary({ schemaVersion: 99 })
  assert.deepEqual(Object.keys(error), ['ok', 'errors'])
  assertDeepFrozen(error)

  const input = ttsInput()
  const snapshot = JSON.stringify(input)
  const result = resolveFixtureTaskSource(input)
  assert.equal(Object.isFrozen(input), false)
  input.artifactLibrary.artifacts[0].text = 'changed'
  assert.notEqual(JSON.stringify(input), snapshot)
  assert.equal(result.value.decision, 'FIXTURE_SOURCE_LINKED')
})

// ---------------------------------------------------------------------------------------------
// S18–S22: public surface, static purity, docs examples/storyboard and references.
// ---------------------------------------------------------------------------------------------

test('S18 exactly four exports, 18 fixed codes and exact envelope fields', () => {
  assert.deepEqual(Object.keys(sourceArtifacts).sort(), [
    'SOURCE_ARTIFACTS_SCHEMA_VERSION',
    'SOURCE_ARTIFACT_ERRORS',
    'resolveFixtureTaskSource',
    'validateFixtureSourceLibrary',
  ])
  assert.equal(SOURCE_ARTIFACTS_SCHEMA_VERSION, 1)
  const keys = Object.keys(SOURCE_ARTIFACT_ERRORS)
  assert.equal(keys.length, 18)
  for (const key of keys) assert.equal(SOURCE_ARTIFACT_ERRORS[key], 'SOURCE_ARTIFACT_' + key)

  const validated = validateFixtureSourceLibrary(sourceLibrary([textArtifact(), audioArtifact()]))
  assert.equal(validated.ok, true)
  assert.deepEqual(Object.keys(validated.value), [
    'schemaVersion',
    'artifactCount',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
  ])
  assert.equal(validated.value.artifactCount, 2)

  const linked = resolveFixtureTaskSource(ttsInput())
  expectLinked(linked, 'TEXT')
  assert.deepEqual(Object.keys(linked.value), VALUE_KEYS)
  assert.equal(linked.value.messageZh, LINKED_MESSAGE)

  const blocked = resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), []))
  expectBlocked(blocked, 'SOURCE_UNAVAILABLE')
  assert.equal(blocked.value.messageZh, '没有可用的演示任务源，请重新选择或稍后再说。')

  assert.equal(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ rightsState: 'REVOKED' })])).value.messageZh,
    '演示任务源使用权尚未确认或已撤销，请确认后再继续。',
  )
  assert.equal(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ availability: 'UNKNOWN' })])).value.messageZh,
    '演示任务源状态未知，请重新检查，系统不会自动获取。',
  )
  assert.equal(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [textArtifact({ expiresAt: '2026-10-26T00:00:00.000Z' })])).value.messageZh,
    '演示任务源已过期，请重新选择。',
  )
  assert.equal(
    resolveFixtureTaskSource(ttsInput(ttsVoiceBinding(), [audioArtifact({ artifactRef: 'artifact:fixture-text-1' })])).value.messageZh,
    '演示任务源与请求不一致，请重新选择；系统不会自动替换。',
  )
})

test('S19 static call graph reuses 08-A exactly once and stays pure', async () => {
  const source = await readFile(new URL('../core/audio/source-artifacts.mjs', import.meta.url), 'utf8')
  assert.equal((source.match(/resolveFixtureVoiceBinding\(/g) || []).length, 1)
  assert.equal((source.match(/copyFixtureInput\(/g) || []).length, 2)
  assert.match(source, /from '\.\/voice-assets\.mjs'/)
  assert.match(source, /from '\.\/fixture-input-boundary\.mjs'/)
  assert.match(source, /from '\.\.\/svc\/rvc-fake-gateway\.mjs'/)
  assert.match(source, /RVC_FAKE_LIMITS/)
  assert.doesNotMatch(source, /validateAudioTaskDraft|negotiateProviderInstance|dispatchRvcFakeOnce|simulateRvcFakeConversion/)
  assert.doesNotMatch(source, /createAudioTaskRecord|transitionAudioTask|relay|Relay/)
  assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(|process\.|Date\.now|Math\.random|setTimeout|setInterval/)
  assert.doesNotMatch(source, /outputFormat/)
  assert.doesNotMatch(source, /300000|52428800|16000/)
})

function extractExample(doc, heading) {
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, 'heading missing: ' + heading)
  const rest = doc.slice(at)
  const fence = rest.indexOf('```json')
  const close = rest.indexOf('```', fence + 7)
  assert.ok(fence >= 0 && close > fence, 'json fence missing: ' + heading)
  return JSON.parse(rest.slice(fence + 7, close).trim())
}

test('S20 both documentation JSON examples run as written and fail minimally when tampered', async () => {
  const doc = await readFile(new URL('../docs/SOURCE_ARTIFACTS_OFFLINE.md', import.meta.url), 'utf8')
  const ttsExample = extractExample(doc, '## 7. TTS完整示例')
  const svcExample = extractExample(doc, '## 8. SVC完整示例')

  for (const example of [ttsExample, svcExample]) {
    assert.deepEqual(Object.keys(example).sort(), ['artifactLibrary', 'schemaVersion', 'sourceRevision', 'voiceBinding'])
    assert.equal(example.schemaVersion, 1)
    assert.equal(example.sourceRevision, 1)
    assert.deepEqual(Object.keys(example.voiceBinding).sort(), [
      'expectation',
      'library',
      'negotiation',
      'now',
      'schemaVersion',
      'taskDraft',
    ])
    assert.equal(example.voiceBinding.negotiation.registry.instances.length, 1)
  }

  const ttsValidated = validateFixtureSourceLibrary(ttsExample.artifactLibrary)
  assert.equal(ttsValidated.ok, true)
  expectLinked(resolveFixtureTaskSource(ttsExample), 'TEXT')

  const svcValidated = validateFixtureSourceLibrary(svcExample.artifactLibrary)
  assert.equal(svcValidated.ok, true)
  expectLinked(resolveFixtureTaskSource(svcExample), 'AUDIO')

  const ttsNegative = clone(ttsExample)
  ttsNegative.artifactLibrary.artifacts[0].text += ' '
  expectBlocked(resolveFixtureTaskSource(ttsNegative), 'SOURCE_TEXT_MISMATCH')

  const svcNegative = clone(svcExample)
  svcNegative.artifactLibrary.artifacts[0].audio.byteLength += 1
  expectBlocked(resolveFixtureTaskSource(svcNegative), 'SOURCE_AUDIO_MISMATCH')
})

test('S21 documentation keeps the user storyboard and three recoveries without a GUI claim', async () => {
  const doc = await readFile(new URL('../docs/SOURCE_ARTIFACTS_OFFLINE.md', import.meta.url), 'utf8')
  for (const marker of ['OFFLINE', 'FIXTURE_ONLY', 'NOT_INTEGRATED', '没有新增可点击按钮', '演示源关联', '源已核对']) {
    assert.equal(doc.includes(marker), true, marker)
  }
  for (const recovery of ['重新选择与请求一致的源', '刷新界面后重选', '先确认合法使用权']) {
    assert.equal(doc.includes(recovery), true, recovery)
  }
  assert.equal(doc.includes('已生成'), true)
  assert.equal(doc.includes('不会出现'), true)
})

test('S22 resolver keeps the old 08-A value intact across repeated calls and blocked paths', () => {
  const input = ttsInput()
  const direct = resolveFixtureVoiceBinding(input.voiceBinding)
  const first = resolveFixtureTaskSource(input)
  const second = resolveFixtureTaskSource(input)
  assert.deepEqual(plain(first.value.voiceBinding), plain(direct.value))
  assert.deepEqual(plain(first.value.voiceBinding), plain(second.value.voiceBinding))
  assert.notEqual(first.value.voiceBinding, second.value.voiceBinding)
  assert.equal(first.value.voiceBinding.binding.instanceId, 'instance:qwen')
  assert.equal(first.value.voiceBinding.binding.assetId, 'asset:fixture-voice-a')

  const blockedInput = ttsInput(ttsVoiceBinding(), [])
  const blockedDirect = resolveFixtureVoiceBinding(blockedInput.voiceBinding)
  const blocked = resolveFixtureTaskSource(blockedInput)
  assert.deepEqual(plain(blocked.value.voiceBinding), plain(blockedDirect.value))
  assert.equal(blocked.value.voiceBinding.decision, 'FIXTURE_BOUND')
})

// ---------------------------------------------------------------------------------------------
// Extra boundaries: invalid roots and forged pre-validated views.
// ---------------------------------------------------------------------------------------------

test('B01 non-object roots and invalid dependency inputs map to the fixed protocol', () => {
  for (const value of [null, undefined, [], 'x', 7, true]) {
    expectError(validateFixtureSourceLibrary(value), 'INVALID_INPUT', '$')
    expectError(resolveFixtureTaskSource(value), 'INVALID_INPUT', '$')
  }

  const brokenVoiceBinding = ttsInput()
  brokenVoiceBinding.voiceBinding = { schemaVersion: 1 }
  expectError(resolveFixtureTaskSource(brokenVoiceBinding), 'VOICE_BINDING_INVALID', 'voiceBinding')

  const badLibrary = ttsInput()
  badLibrary.artifactLibrary = { schemaVersion: 1, artifacts: 'nope' }
  expectError(resolveFixtureTaskSource(badLibrary), 'INVALID_LIBRARY', 'artifactLibrary')
})

test('B02 a caller-forged validate envelope is not accepted as resolver input', () => {
  const validated = validateFixtureSourceLibrary(sourceLibrary([textArtifact()]))
  assert.equal(validated.ok, true)
  expectError(resolveFixtureTaskSource(validated.value), 'INVALID_INPUT', '<unknown-key>')
})

test('B03 a non-conforming 08-A return shape would be a dependency failure, but public tests cannot inject it', () => {
  // No public fault-injection hook exists: exactly four exports, so DEPENDENCY_FAILURE is
  // STATIC_NOT_INJECTED. This test documents that boundary without adding a hook.
  assert.equal(Object.keys(sourceArtifacts).length, 4)
  const broken = ttsInput()
  broken.voiceBinding.taskDraft = {}
  expectError(resolveFixtureTaskSource(broken), 'VOICE_BINDING_INVALID', 'voiceBinding')
})
