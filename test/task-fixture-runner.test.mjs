import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import * as runnerModule from '../core/audio/task-fixture-runner.mjs'
import {
  TASK_FIXTURE_SCHEMA_VERSION,
  TASK_FIXTURE_ERRORS,
  runFixtureAudioTaskOnce,
} from '../core/audio/task-fixture-runner.mjs'
import { resolveFixtureTaskSource } from '../core/audio/source-artifacts.mjs'

const ERR = TASK_FIXTURE_ERRORS
const SCOPE = 'scope:fixture-demo'
const NOW = '2026-10-27T00:00:00.000Z'
const UNSUPPORTED = 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH'

// ---------------------------------------------------------------------------------------------
// Fictional fixtures.
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

function ttsSourceInput(voiceBinding = ttsVoiceBinding(), artifacts = [textArtifact()]) {
  return { schemaVersion: 1, voiceBinding, artifactLibrary: sourceLibrary(artifacts), sourceRevision: 1 }
}

function svcSourceInput(voiceBinding = svcVoiceBinding(), artifacts = [audioArtifact()]) {
  return { schemaVersion: 1, voiceBinding, artifactLibrary: sourceLibrary(artifacts), sourceRevision: 1 }
}

function readinessEntry(instanceId, profile, overrides = {}) {
  return {
    instanceId,
    installation: 'PRESENT',
    resources: { profile, cpu: 'AVAILABLE', gpu: 'AVAILABLE' },
    ...overrides,
  }
}

function svcReadiness(entries = [readinessEntry('instance:rvc', 'CPU_FIXTURE')]) {
  return { schemaVersion: 1, instances: entries }
}

function ttsReadiness(entries = [readinessEntry('instance:qwen', 'TTS_MANIFEST')]) {
  return { schemaVersion: 1, instances: entries }
}

function svcContext(scenario = 'SUCCESS', overrides = {}) {
  return {
    requestId: 'request:fixture-1',
    endpointId: 'gateway:fixture-rvc',
    scenario,
    ...overrides,
  }
}

function rvcRun(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceInput: svcSourceInput(),
    readiness: svcReadiness(),
    context: svcContext('SUCCESS'),
    ...overrides,
  }
}

function ttsRun(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceInput: ttsSourceInput(),
    readiness: ttsReadiness(),
    context: null,
    ...overrides,
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// ---------------------------------------------------------------------------------------------
// Assertions.
// ---------------------------------------------------------------------------------------------

function expectError(result, key, path) {
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, ERR[key], 'error code')
  assert.equal(result.errors[0].path, path, 'error path')
  assert.equal(result.errors[0].reason, key.toLowerCase().replace(/_/g, ' '), 'error reason')
  return result
}

function expectBlocked(result, reason) {
  assert.equal(result.ok, true)
  assert.equal(result.value.phase, 'BLOCKED')
  assert.equal(result.value.reason, reason)
  assert.equal(result.value.execution, null)
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  return result
}

function expectSimulated(result) {
  assert.equal(result.ok, true)
  assert.equal(result.value.phase, 'SIMULATED')
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
  'phase',
  'reason',
  'messageZh',
  'sourceCheck',
  'readiness',
  'execution',
  'task',
  'states',
  'mockOnly',
  'realOperationAllowed',
  'submitAllowed',
  'automaticRetryAllowed',
]

const PROJECTION_KEYS = [
  'schemaVersion',
  'taskId',
  'feature',
  'taskType',
  'state',
  'voiceProfileId',
  'hasInput',
  'hasOutput',
  'cancelRequested',
  'cancelConfirmed',
  'deliveryRequested',
  'mockOnly',
  'realOperationAllowed',
  'userMessageZh',
]

// ---------------------------------------------------------------------------------------------
// C01–C04: the seven scenarios and their real Task reductions.
// ---------------------------------------------------------------------------------------------

test('C01 SUCCESS runs source→readiness→one Fake→Task and ends at ARTIFACT_READY', () => {
  const result = expectSimulated(runFixtureAudioTaskOnce(rvcRun()))
  assert.equal(result.value.reason, null)
  assert.deepEqual(result.value.states, ['CREATED', 'PROCESSING', 'ARTIFACT_READY'])
  assert.equal(result.value.task.state, 'ARTIFACT_READY')
  assert.equal(result.value.task.hasOutput, true)
  assert.equal(result.value.task.taskId, 'task:demo-svc')
  assert.equal(result.value.task.mockOnly, true)
  assert.equal(result.value.sourceCheck.decision, 'FIXTURE_SOURCE_LINKED')
  assert.equal(result.value.readiness.decision, 'FIXTURE_READY')
  assert.equal(result.value.execution.phase, 'SIMULATED')
  const fake = result.value.execution.dispatch.result
  assert.equal(fake.status, 'SUCCEEDED_FAKE')
  assert.equal(fake.artifactRef, 'artifact:fixture-output-1')
  assert.equal(fake.targetModelId, 'rvc-model:fixture-a')
  assert.equal(fake.requestId, 'request:fixture-1')
  assert.deepEqual(Object.keys(result.value), VALUE_KEYS)
  assert.deepEqual(Object.keys(result.value.task), PROJECTION_KEYS)
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('artifact:fixture-source-1'), false)
  assert.equal(encoded.includes('"SAVED"'), false)
})

test('C02 OFFLINE and MODEL_MISSING are Task FAILED with no output', () => {
  for (const [scenario, code] of [
    ['OFFLINE', 'RVC_FAKE_OFFLINE'],
    ['MODEL_MISSING', 'RVC_FAKE_MODEL_NOT_AVAILABLE'],
  ]) {
    const result = expectSimulated(runFixtureAudioTaskOnce(rvcRun({ context: svcContext(scenario) })))
    assert.equal(result.value.reason, code, scenario)
    assert.deepEqual(result.value.states, ['CREATED', 'PROCESSING', 'FAILED'], scenario)
    assert.equal(result.value.task.state, 'FAILED', scenario)
    assert.equal(result.value.task.hasOutput, false, scenario)
    assert.equal(result.value.execution.dispatch.result.status, scenario === 'OFFLINE' ? 'OFFLINE' : 'MODEL_NOT_AVAILABLE')
  }
})

test('C03 TIMEOUT and UNKNOWN end UNKNOWN with no output and no retry loop', () => {
  for (const [scenario, code] of [
    ['TIMEOUT', 'RVC_FAKE_TIMEOUT'],
    ['UNKNOWN', 'RVC_FAKE_UNKNOWN'],
  ]) {
    const result = expectSimulated(runFixtureAudioTaskOnce(rvcRun({ context: svcContext(scenario) })))
    assert.equal(result.value.reason, code, scenario)
    assert.deepEqual(result.value.states, ['CREATED', 'PROCESSING', 'UNKNOWN'], scenario)
    assert.equal(result.value.task.state, 'UNKNOWN', scenario)
    assert.equal(result.value.task.hasOutput, false, scenario)
  }
  const first = runFixtureAudioTaskOnce(rvcRun({ context: svcContext('UNKNOWN') }))
  const second = runFixtureAudioTaskOnce(rvcRun({ context: svcContext('UNKNOWN') }))
  assert.deepEqual(first.value, second.value)
})

test('C04 cancellation request and simulated confirmation stay separate', () => {
  const requested = expectSimulated(runFixtureAudioTaskOnce(rvcRun({ context: svcContext('CANCEL_REQUESTED') })))
  assert.deepEqual(requested.value.states, ['CREATED', 'PROCESSING', 'CANCEL_REQUESTED'])
  assert.equal(requested.value.task.state, 'CANCEL_REQUESTED')
  assert.equal(requested.value.task.cancelRequested, true)
  assert.equal(requested.value.task.cancelConfirmed, false)
  assert.equal(requested.value.task.hasOutput, false)

  const confirmed = expectSimulated(runFixtureAudioTaskOnce(rvcRun({ context: svcContext('CANCEL_CONFIRMED') })))
  assert.deepEqual(confirmed.value.states, ['CREATED', 'PROCESSING', 'CANCEL_REQUESTED', 'CANCELLED'])
  assert.equal(confirmed.value.task.state, 'CANCELLED')
  assert.equal(confirmed.value.task.cancelRequested, true)
  assert.equal(confirmed.value.task.cancelConfirmed, true)
  assert.equal(confirmed.value.task.hasOutput, false)
})

// ---------------------------------------------------------------------------------------------
// C05–C09: source, readiness, TTS and original provider blocks.
// ---------------------------------------------------------------------------------------------

test('C05 a legal source block stops before Task creation and dispatch', () => {
  const cases = [
    ['text mismatch', ttsRun({ sourceInput: ttsSourceInput(ttsVoiceBinding(), [textArtifact({ text: 'HELLO' })]) })],
    ['missing source', ttsRun({ sourceInput: ttsSourceInput(ttsVoiceBinding(), []) })],
    ['other scope', ttsRun({ sourceInput: ttsSourceInput(ttsVoiceBinding(), [textArtifact({ scopeId: 'scope:fixture-other' })]) })],
    ['stale revision', (() => { const input = ttsRun(); input.sourceInput.sourceRevision = 2; return input })()],
    ['revoked source', ttsRun({ sourceInput: ttsSourceInput(ttsVoiceBinding(), [textArtifact({ rightsState: 'REVOKED' })]) })],
    ['expired source', ttsRun({ sourceInput: ttsSourceInput(ttsVoiceBinding(), [textArtifact({ expiresAt: '2026-10-26T00:00:00.000Z' })]) })],
  ]
  for (const [label, input] of cases) {
    const result = expectBlocked(runFixtureAudioTaskOnce(input), ERR.SOURCE_BLOCKED)
    assert.equal(result.value.task, null, label)
    assert.deepEqual(result.value.states, [], label)
    assert.equal(result.value.execution, null, label)
    assert.equal(result.value.messageZh, result.value.sourceCheck.messageZh, label)
  }
})

test('C06 structure errors are never hidden by a legal source block', () => {
  const blocked = ttsRun({ sourceInput: ttsSourceInput(ttsVoiceBinding(), [textArtifact({ text: 'HELLO' })]) })

  const badReadiness = clone(blocked)
  badReadiness.readiness = { schemaVersion: 1, instances: 'nope' }
  expectError(runFixtureAudioTaskOnce(badReadiness), 'READINESS_INVALID', 'readiness')

  const badContext = clone(blocked)
  badContext.context = { requestId: 'request:fixture-1', endpointId: 'gateway:fixture-rvc', scenario: 'SUCCESS' }
  expectError(runFixtureAudioTaskOnce(badContext), 'INVALID_CONTEXT', 'context')

  const badSource = ttsRun()
  badSource.sourceInput.artifactLibrary = { schemaVersion: 1, artifacts: [{ bad: true }] }
  expectError(runFixtureAudioTaskOnce(badSource), 'SOURCE_INPUT_INVALID', 'sourceInput')
})

test('C07 a legal readiness block keeps CREATED and never begins or simulates', () => {
  const blockedCases = [
    svcReadiness([readinessEntry('instance:rvc', 'CPU_FIXTURE', { installation: 'ABSENT' })]),
    svcReadiness([readinessEntry('instance:rvc', 'CPU_FIXTURE', { installation: 'UNKNOWN' })]),
    svcReadiness([{ instanceId: 'instance:rvc', installation: 'PRESENT', resources: { profile: 'CPU_FIXTURE', cpu: 'UNKNOWN', gpu: 'AVAILABLE' } }]),
    svcReadiness([{ instanceId: 'instance:rvc', installation: 'PRESENT', resources: { profile: 'CPU_FIXTURE', cpu: 'UNAVAILABLE', gpu: 'AVAILABLE' } }]),
    svcReadiness([{ instanceId: 'instance:rvc', installation: 'PRESENT', resources: { profile: 'GPU_FIXTURE', cpu: 'AVAILABLE', gpu: 'UNAVAILABLE' } }]),
    { schemaVersion: 1, instances: [] },
  ]
  for (const readiness of blockedCases) {
    const result = expectBlocked(runFixtureAudioTaskOnce(rvcRun({ readiness })), ERR.READINESS_BLOCKED)
    assert.deepEqual(result.value.states, ['CREATED'])
    assert.equal(result.value.task.state, 'CREATED')
    assert.equal(result.value.execution, null)
    assert.equal(result.value.messageZh, result.value.readiness.messageZh)
  }

  const structuralCases = [
    svcReadiness([readinessEntry('instance:rvc', 'CPU_FIXTURE'), readinessEntry('instance:rvc', 'CPU_FIXTURE')]),
    svcReadiness([readinessEntry('instance:other', 'CPU_FIXTURE')]),
    svcReadiness([readinessEntry('instance:rvc', 'TTS_MANIFEST')]),
    svcReadiness([{ instanceId: 'instance:rvc', installation: 'PRESENT', resources: { profile: 'CPU_FIXTURE', cpu: 'MAYBE', gpu: 'AVAILABLE' } }]),
  ]
  for (const readiness of structuralCases) {
    expectError(runFixtureAudioTaskOnce(rvcRun({ readiness })), 'READINESS_INVALID', 'readiness')
  }
})

test('C08 TTS remains a controlled unsupported block with CREATED and no dispatcher', () => {
  const result = expectBlocked(runFixtureAudioTaskOnce(ttsRun()), UNSUPPORTED)
  assert.deepEqual(result.value.states, ['CREATED'])
  assert.equal(result.value.task.state, 'CREATED')
  assert.equal(result.value.execution, null)
  assert.equal(result.value.messageZh, '该实例的演示执行尚未实现；可以查看能力说明或稍后再说。')

  expectError(runFixtureAudioTaskOnce(ttsRun({ context: svcContext('SUCCESS') })), 'INVALID_CONTEXT', 'context')
  const missingContext = ttsRun()
  delete missingContext.context
  expectError(runFixtureAudioTaskOnce(missingContext), 'INVALID_INPUT', '$')
})

test('C09 original provider/model blocks cannot be bypassed by source, readiness or TTS', () => {
  const modelB = svcVoiceBinding()
  modelB.library.assets[0].assetId = 'asset:fixture-model-b'
  modelB.library.assets[0].providerRef = 'rvc-model:fixture-b'
  modelB.library.profiles[0].bindings[0].assetId = 'asset:fixture-model-b'
  modelB.negotiation.request.targetModelId = 'rvc-model:fixture-b'
  const result = expectBlocked(runFixtureAudioTaskOnce(rvcRun({ sourceInput: svcSourceInput(modelB) })), ERR.SOURCE_BLOCKED)
  assert.equal(result.value.sourceCheck.voiceBinding.reason, 'VOICE_ASSET_PROVIDER_BLOCKED')
  assert.equal(result.value.task, null)
  assert.equal(result.value.execution, null)

  const offline = svcVoiceBinding()
  offline.negotiation.registry.instances[0].observation = observation({ state: 'offline' })
  expectBlocked(runFixtureAudioTaskOnce(rvcRun({ sourceInput: svcSourceInput(offline) })), ERR.SOURCE_BLOCKED)
})

// ---------------------------------------------------------------------------------------------
// C10–C12: single input chain, identity, ownership, delivery intent.
// ---------------------------------------------------------------------------------------------

test('C10 only the single original negotiation/draft/context are accepted; IDs are never rewritten', () => {
  const extraRoot = rvcRun()
  extraRoot.second = 1
  expectError(runFixtureAudioTaskOnce(extraRoot), 'INVALID_INPUT', '<unknown-key>')

  const extraSource = rvcRun()
  extraSource.sourceInput.secondNegotiation = clone(extraSource.sourceInput.voiceBinding.negotiation)
  expectError(runFixtureAudioTaskOnce(extraSource), 'SOURCE_INPUT_INVALID', 'sourceInput')

  const prevalidated = resolveFixtureTaskSource(svcSourceInput())
  assert.equal(prevalidated.ok, true)
  expectError(runFixtureAudioTaskOnce(rvcRun({ sourceInput: prevalidated.value })), 'SOURCE_INPUT_INVALID', 'sourceInput')

  const result = expectSimulated(runFixtureAudioTaskOnce(rvcRun()))
  const draft = svcVoiceBinding().taskDraft
  assert.equal(result.value.task.taskId, draft.taskId)
  assert.equal(result.value.execution.dispatch.requestId, 'request:fixture-1')
  assert.equal(result.value.execution.dispatch.result.artifactRef, 'artifact:fixture-output-1')

  expectError(runFixtureAudioTaskOnce(rvcRun({ context: {} })), 'INVALID_CONTEXT', 'context')
  expectError(runFixtureAudioTaskOnce(rvcRun({ context: svcContext('SUCCESS', { endpointId: 'gateway:other' }) })), 'INVALID_CONTEXT', 'context')
  expectError(runFixtureAudioTaskOnce(rvcRun({ context: svcContext('SUCCESS', { scenario: 'OTHER' }) })), 'INVALID_CONTEXT', 'context')
})

test('C11 the original 15-field result is revalidated; source=output collision is rejected', () => {
  const result = expectSimulated(runFixtureAudioTaskOnce(rvcRun()))
  const fake = result.value.execution.dispatch.result
  assert.equal(Object.keys(fake).length, 15)
  assert.equal(fake.mockOnly, true)
  assert.equal(fake.realOperationAllowed, false)
  assert.equal(fake.automaticRetryAllowed, false)

  const collisionSource = svcVoiceBinding()
  collisionSource.taskDraft.source.ref = 'artifact:fixture-output-1'
  collisionSource.negotiation.request.sourceAudioRef = 'artifact:fixture-output-1'
  const collided = rvcRun({
    sourceInput: svcSourceInput(collisionSource, [audioArtifact({ artifactRef: 'artifact:fixture-output-1' })]),
  })
  const error = expectError(runFixtureAudioTaskOnce(collided), 'INVALID_TASK_RESULT', '$')
  assert.equal(JSON.stringify(error).includes('artifact:fixture-output-1'), false)
  assert.equal(JSON.stringify(error).includes('artifact:fixture-source-1'), false)
})

test('C12 delivery intent is preserved but no Relay/delivery is created', () => {
  const binding = svcVoiceBinding()
  binding.taskDraft.deliveryRequested = true
  const result = expectSimulated(runFixtureAudioTaskOnce(rvcRun({ sourceInput: svcSourceInput(binding) })))
  assert.equal(result.value.task.deliveryRequested, true)
  assert.equal('delivery' in result.value.task, false)
  assert.equal(JSON.stringify(result).includes('deliveryId'), false)
})

// ---------------------------------------------------------------------------------------------
// C13–C15: error protocol, hostile input and freshness.
// ---------------------------------------------------------------------------------------------

test('C13 fixed error protocol and priority; no public dependency injection', () => {
  for (const value of [null, undefined, [], 'x', 7, true]) {
    expectError(runFixtureAudioTaskOnce(value), 'INVALID_INPUT', '$')
  }

  const missing = rvcRun()
  delete missing.context
  expectError(runFixtureAudioTaskOnce(missing), 'INVALID_INPUT', '$')

  const schema = rvcRun()
  schema.schemaVersion = 2
  expectError(runFixtureAudioTaskOnce(schema), 'UNSUPPORTED_VERSION', 'schemaVersion')

  const unknownOrderA = { schemaVersion: 2, readiness: { schemaVersion: 1, instances: 'bad' }, sourceInput: {}, context: null, ready: true }
  const unknownOrderB = {}
  unknownOrderB.ready = true
  unknownOrderB.context = null
  unknownOrderB.sourceInput = {}
  unknownOrderB.readiness = { schemaVersion: 1, instances: 'bad' }
  unknownOrderB.schemaVersion = 2
  expectError(runFixtureAudioTaskOnce(unknownOrderA), 'INVALID_INPUT', '<unknown-key>')
  expectError(runFixtureAudioTaskOnce(unknownOrderB), 'INVALID_INPUT', '<unknown-key>')

  assert.equal(Object.keys(runnerModule).length, 3)
})

test('C14 getters, Symbols, hidden keys, custom prototypes, Proxy, cycles and budgets fail closed', () => {
  let reads = 0
  const accessorRoot = rvcRun()
  Object.defineProperty(accessorRoot, 'sourceInput', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return svcSourceInput()
    },
  })
  expectError(runFixtureAudioTaskOnce(accessorRoot), 'INVALID_INPUT', '$')
  assert.equal(reads, 0)

  const accessorArtifact = audioArtifact()
  Object.defineProperty(accessorArtifact, 'availability', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return 'PRESENT'
    },
  })
  const accessorInput = rvcRun({ sourceInput: svcSourceInput(svcVoiceBinding(), [accessorArtifact]) })
  expectError(runFixtureAudioTaskOnce(accessorInput), 'INVALID_INPUT', '$')
  assert.equal(reads, 0)

  const symbol = rvcRun()
  symbol[Symbol('secret')] = true
  expectError(runFixtureAudioTaskOnce(symbol), 'INVALID_INPUT', '$')

  const hidden = rvcRun()
  Object.defineProperty(hidden, 'hiddenKey', { value: 1, enumerable: false })
  expectError(runFixtureAudioTaskOnce(hidden), 'INVALID_INPUT', '$')

  const custom = Object.create({ inherited: 1 })
  Object.assign(custom, rvcRun())
  expectError(runFixtureAudioTaskOnce(custom), 'INVALID_INPUT', '$')

  const marker = 'PRIVATE_MARKER_C14'
  const proxy = new Proxy({}, {
    ownKeys() {
      throw new Error(marker)
    },
  })
  const proxied = expectError(runFixtureAudioTaskOnce(proxy), 'INVALID_INPUT', '$')
  assert.equal(JSON.stringify(proxied).includes(marker), false)
  assert.equal(JSON.stringify(proxied).includes('stack'), false)

  const cyclic = rvcRun()
  cyclic.self = cyclic
  expectError(runFixtureAudioTaskOnce(cyclic), 'INVALID_INPUT', '$')

  const holes = rvcRun()
  holes.sourceInput.artifactLibrary.artifacts = new Array(1)
  expectError(runFixtureAudioTaskOnce(holes), 'INVALID_INPUT', '$')

  const extraArray = rvcRun()
  extraArray.sourceInput.artifactLibrary.artifacts.extra = 1
  expectError(runFixtureAudioTaskOnce(extraArray), 'INVALID_INPUT', '$')

  let deep = []
  const deepRoot = deep
  for (let index = 0; index < 14; index += 1) {
    const next = []
    deep.push(next)
    deep = next
  }
  const deepInput = rvcRun()
  deepInput.extra = deepRoot
  expectError(runFixtureAudioTaskOnce(deepInput), 'RESOURCE_LIMIT', '$')

  const pollution = JSON.parse(JSON.stringify(rvcRun()))
  Object.defineProperty(pollution, '__proto__', { value: { polluted: true }, enumerable: true, configurable: true })
  expectError(runFixtureAudioTaskOnce(pollution), 'INVALID_INPUT', '<unknown-key>')
  assert.equal({}.polluted, undefined)
})

test('C15 null prototypes, frozen inputs, shared references and fresh/deep-frozen results', () => {
  const nullProto = Object.assign(Object.create(null), rvcRun())
  assert.equal(runFixtureAudioTaskOnce(nullProto).ok, true)

  const frozen = deepFreezeForTest(rvcRun())
  assert.equal(runFixtureAudioTaskOnce(frozen).ok, true)
  assert.equal(Object.isFrozen(frozen), true)

  const shared = audioArtifact()
  const sharedInput = rvcRun({ sourceInput: svcSourceInput(svcVoiceBinding(), [shared, shared]) })
  expectError(runFixtureAudioTaskOnce(sharedInput), 'SOURCE_INPUT_INVALID', 'sourceInput')

  const first = runFixtureAudioTaskOnce(rvcRun())
  const second = runFixtureAudioTaskOnce(rvcRun())
  assert.deepEqual(first.value, second.value)
  assert.notEqual(first.value, second.value)
  assert.notEqual(first.value.sourceCheck, second.value.sourceCheck)
  assert.notEqual(first.value.execution, second.value.execution)
  assert.notEqual(first.value.task, second.value.task)
  assert.notEqual(first.value.states, second.value.states)
  assertDeepFrozen(first)

  const blocked = runFixtureAudioTaskOnce(ttsRun())
  assertDeepFrozen(blocked)
  const error = runFixtureAudioTaskOnce({ schemaVersion: 2 })
  assertDeepFrozen(error)

  const input = rvcRun()
  const snapshot = JSON.stringify(input)
  const result = runFixtureAudioTaskOnce(input)
  assert.equal(Object.isFrozen(input), false)
  input.readiness.instances[0].installation = 'ABSENT'
  assert.notEqual(JSON.stringify(input), snapshot)
  assert.equal(result.value.phase, 'SIMULATED')
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('artifact:fixture-source-1'), false)
  assert.equal(encoded.includes('"text"'), false)
})

// ---------------------------------------------------------------------------------------------
// C16–C19: public surface, static purity, documentation examples and storyboard.
// ---------------------------------------------------------------------------------------------

test('C16 exactly three exports, 14 codes, 13-key value and real projections', () => {
  assert.deepEqual(Object.keys(runnerModule).sort(), [
    'TASK_FIXTURE_ERRORS',
    'TASK_FIXTURE_SCHEMA_VERSION',
    'runFixtureAudioTaskOnce',
  ])
  assert.equal(TASK_FIXTURE_SCHEMA_VERSION, 1)
  const keys = Object.keys(TASK_FIXTURE_ERRORS)
  assert.equal(keys.length, 14)
  for (const key of keys) assert.equal(TASK_FIXTURE_ERRORS[key], 'TASK_FIXTURE_' + key)

  const success = runFixtureAudioTaskOnce(rvcRun())
  assert.deepEqual(Object.keys(success.value), VALUE_KEYS)
  assert.ok(success.value.states.length <= 4)
  assert.equal(success.value.task.state, success.value.states[success.value.states.length - 1])

  const block = runFixtureAudioTaskOnce(ttsRun())
  assert.deepEqual(Object.keys(block.value), VALUE_KEYS)
  assert.deepEqual(block.value.states, ['CREATED'])
  assert.equal(block.value.task.state, 'CREATED')
  assert.equal(block.value.execution, null)
})

test('C17 static call graph: one source, one readiness gate, at most one dispatch, old Task only', async () => {
  const source = await readFile(new URL('../core/audio/task-fixture-runner.mjs', import.meta.url), 'utf8')
  assert.equal((source.match(/resolveFixtureTaskSource\(/g) || []).length, 1)
  assert.equal((source.match(/negotiateReadyFixtureProvider\(/g) || []).length, 1)
  assert.equal((source.match(/dispatchReadyRvcFakeOnce\(/g) || []).length, 1)
  assert.equal((source.match(/validateRvcFakeResult\(/g) || []).length, 1)
  assert.equal((source.match(/createAudioTaskRecord\(/g) || []).length, 1)
  assert.equal((source.match(/transitionAudioTask\(/g) || []).length, 1)
  assert.equal((source.match(/validateAudioTaskRecord\(/g) || []).length, 1)
  assert.equal((source.match(/projectAudioTask\(/g) || []).length, 1)
  assert.equal((source.match(/copyFixtureInput\(/g) || []).length, 1)
  assert.doesNotMatch(source, /dispatchRvcFakeOnce\(|simulateRvcFakeConversion\(/)
  assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(|process\.|Date\.now|Math\.random|setTimeout|setInterval/)
  assert.doesNotMatch(source, /type: 'MARK_SAVED'|type: 'SAVED'|createRelay|relayCandidate/)
  assert.match(source, /AUDIO_FAKE_FAILURE/)
  assert.doesNotMatch(source, /RVC_FAKE_(OFFLINE|MODEL_NOT_AVAILABLE|TIMEOUT|UNKNOWN|CANCEL_PENDING|CANCELLED)/)
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

test('C18 both documentation JSON examples run as written and fail minimally when tampered', async () => {
  const doc = await readFile(new URL('../docs/TASK_FIXTURE_RUNNER_OFFLINE.md', import.meta.url), 'utf8')
  const rvcExample = extractExample(doc, '## 7. RVC完整示例')
  const ttsExample = extractExample(doc, '## 8. TTS阻断示例')

  for (const example of [rvcExample, ttsExample]) {
    assert.deepEqual(Object.keys(example).sort(), ['context', 'readiness', 'schemaVersion', 'sourceInput'])
    assert.deepEqual(Object.keys(example.sourceInput).sort(), ['artifactLibrary', 'schemaVersion', 'sourceRevision', 'voiceBinding'])
  }

  const rvc = expectSimulated(runFixtureAudioTaskOnce(rvcExample))
  assert.equal(rvc.value.task.state, 'ARTIFACT_READY')
  assert.deepEqual(rvc.value.states, ['CREATED', 'PROCESSING', 'ARTIFACT_READY'])

  const tts = expectBlocked(runFixtureAudioTaskOnce(ttsExample), UNSUPPORTED)
  assert.equal(tts.value.task.state, 'CREATED')
  assert.deepEqual(tts.value.states, ['CREATED'])

  const metadataNegative = clone(rvcExample)
  metadataNegative.sourceInput.artifactLibrary.artifacts[0].audio.byteLength += 1
  expectBlocked(runFixtureAudioTaskOnce(metadataNegative), ERR.SOURCE_BLOCKED)

  const resourceNegative = clone(rvcExample)
  resourceNegative.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
  expectBlocked(runFixtureAudioTaskOnce(resourceNegative), ERR.READINESS_BLOCKED)
})

test('C19 the documentation keeps the storyboard and three recoveries without a GUI claim', async () => {
  const doc = await readFile(new URL('../docs/TASK_FIXTURE_RUNNER_OFFLINE.md', import.meta.url), 'utf8')
  for (const marker of ['OFFLINE', 'FIXTURE_ONLY', 'NOT_INTEGRATED', '没有新增可点击按钮', '演示任务状态', '不 MARK_SAVED']) {
    assert.equal(doc.includes(marker), true, marker)
  }
  for (const recovery of ['重新选择源', '资源未知/不足', '人工核查']) {
    assert.equal(doc.includes(recovery), true, recovery)
  }
  assert.equal(doc.includes('不会自动重发'), true)
})

test('C20 a legal source block still validates readiness and never simulates', () => {
  const blocked = ttsRun({ sourceInput: ttsSourceInput(ttsVoiceBinding(), [textArtifact({ text: 'DIFFERENT' })]) })
  const result = expectBlocked(runFixtureAudioTaskOnce(blocked), ERR.SOURCE_BLOCKED)
  assert.equal(result.value.readiness.decision, 'FIXTURE_READY')
  assert.equal(result.value.execution, null)
  assert.equal(result.value.task, null)
  assert.deepEqual(result.value.states, [])
})
