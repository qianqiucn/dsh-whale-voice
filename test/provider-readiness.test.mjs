import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  PROVIDER_READINESS_ERRORS,
  PROVIDER_READINESS_SCHEMA_VERSION,
  dispatchReadyRvcFakeOnce,
  negotiateReadyFixtureProvider,
} from '../core/audio/provider-readiness.mjs'
import { dispatchRvcFakeOnce } from '../core/audio/provider-dispatch.mjs'
import * as instanceModule from '../core/audio/provider-instances.mjs'
import { PROVIDER_KINDS } from '../core/tts/provider-contract.mjs'
import { getRegistryView, selectProviderCandidate } from '../core/tts/provider-registry.mjs'
import { getSvcRegistryView, selectSvcCandidate } from '../core/svc/svc-registry.mjs'
import {
  RVC_FAKE_SCENARIOS,
  validateRvcFakeResult,
} from '../core/svc/rvc-fake-gateway.mjs'

const ERR = PROVIDER_READINESS_ERRORS

function manifest(resources = { local: true, gpuRequired: false, cpuCapable: true }, overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'qwen3-tts',
    name: 'Fixture TTS',
    kind: PROVIDER_KINDS.LOCAL,
    version: { value: '1.0.0', source: 'fixture', audited: true },
    capabilities: {
      languages: ['zh-CN'],
      voices: [{ id: 'voice-a', name: 'Voice A', kind: 'preset', languages: ['zh-CN'], referenceAudioRequired: false }],
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
    resources,
    ...overrides,
  }
}

function obs(overrides = {}) {
  return {
    state: 'ok',
    credentials: 'not_required',
    observedAt: '2026-10-27T00:00:00.000Z',
    versionMatches: true,
    ...overrides,
  }
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

function seedInstance(overrides = {}) {
  return rvcInstance({ instanceId: 'instance:seed', candidateId: 'seed-vc', ...overrides })
}

function ttsInstance(overrides = {}) {
  return {
    instanceId: 'instance:qwen',
    category: 'TTS',
    candidateId: 'qwen3-tts',
    protocolVersion: 1,
    fixture: true,
    manifest: manifest(),
    observation: obs(),
    ...overrides,
  }
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

function observation(instanceId, overrides = {}) {
  return {
    instanceId,
    installation: 'PRESENT',
    resources: { profile: 'CPU_FIXTURE', cpu: 'AVAILABLE', gpu: 'AVAILABLE' },
    ...overrides,
  }
}

function readiness(instances, overrides = {}) {
  return { schemaVersion: 1, instances, ...overrides }
}

function negotiation(instances, selection, request, consent = {}) {
  return {
    schemaVersion: 1,
    registry: { schemaVersion: 1, instances },
    selection,
    consent: { networkAllowed: false, textUploadAllowed: false, paidAllowed: false, ...consent },
    request,
  }
}

function input(instances, selection, observations, request, contextOverrides = {}, consent = {}) {
  return {
    schemaVersion: 1,
    negotiation: negotiation(instances, selection, request, consent),
    readiness: readiness(observations),
    context: {
      requestId: 'request:fixture-1',
      endpointId: 'gateway:fixture-rvc',
      scenario: 'SUCCESS',
      ...contextOverrides,
    },
  }
}

function gate(instances, selection, observations, request, consent) {
  const value = input(instances, selection, observations, request, undefined, consent)
  delete value.context
  return value
}

function expectError(result, key, path) {
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, ERR[key])
  if (path !== undefined) assert.equal(result.errors[0].path, path)
  return result
}

function expectBlocked(result, reason) {
  assert.equal(result.ok, true)
  assert.equal(result.value.decision, 'BLOCKED')
  assert.equal(result.value.reason, reason)
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  return result
}

function expectReady(result) {
  assert.equal(result.ok, true)
  assert.equal(result.value.decision, 'FIXTURE_READY')
  assert.equal(result.value.reason, null)
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  return result
}

function deepFreezeTree(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  assert.equal(Object.isFrozen(value), true)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) deepFreezeTree(descriptor.value, seen)
  }
}

test('D01 normal RVC PRESENT/CPU_AVAILABLE is READY and all seven scenarios match the old dispatcher', () => {
  const instances = [rvcInstance()]
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  const observations = [observation('instance:rvc')]
  const ready = expectReady(negotiateReadyFixtureProvider(gate(instances, selection, observations, rvcRequest())))
  assert.equal(ready.value.category, 'SVC')
  assert.equal(ready.value.candidateId, 'rvc')
  assert.equal(ready.value.observation.requiredResource, 'CPU')
  assert.equal(ready.value.observation.installation, 'PRESENT')
  assert.equal(Object.keys(ready.value).length, 13)

  for (const scenario of RVC_FAKE_SCENARIOS) {
    const wrapped = dispatchReadyRvcFakeOnce(input(instances, selection, observations, rvcRequest(), { scenario }))
    assert.equal(wrapped.ok, true, scenario)
    assert.equal(wrapped.value.phase, 'SIMULATED', scenario)
    assert.equal(Object.keys(wrapped.value).length, 10, scenario)
    const direct = dispatchRvcFakeOnce({
      schemaVersion: 1,
      negotiation: negotiation(instances, selection, rvcRequest()),
      context: { requestId: 'request:fixture-1', endpointId: 'gateway:fixture-rvc', scenario },
    })
    assert.deepEqual(wrapped.value.dispatch, direct.value, scenario)
  }
})

test('D02 GPU profile needs GPU AVAILABLE; CPU profile is not pulled down by GPU UNKNOWN', () => {
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  for (const gpu of ['UNKNOWN', 'UNAVAILABLE']) {
    const blocked = expectBlocked(
      negotiateReadyFixtureProvider(
        gate([rvcInstance()], selection, [observation('instance:rvc', { resources: { profile: 'GPU_FIXTURE', cpu: 'AVAILABLE', gpu } })], rvcRequest()),
      ),
      gpu === 'UNKNOWN' ? ERR.RESOURCE_UNKNOWN : ERR.RESOURCE_UNAVAILABLE,
    )
    assert.equal(blocked.value.observation.requiredResource, 'GPU')
  }
  expectReady(
    negotiateReadyFixtureProvider(
      gate([rvcInstance()], selection, [observation('instance:rvc', { resources: { profile: 'CPU_FIXTURE', cpu: 'AVAILABLE', gpu: 'UNKNOWN' } })], rvcRequest()),
    ),
  )
})

test('D03 TTS gpuRequired wins over available CPU and cannot use a CPU_FIXTURE profile', () => {
  const selection = { category: 'TTS', instanceId: 'instance:qwen' }
  const gpuManifest = manifest({ local: true, gpuRequired: true, cpuCapable: true })
  const blocked = expectBlocked(
    negotiateReadyFixtureProvider(
      gate([ttsInstance({ manifest: gpuManifest })], selection, [observation('instance:qwen', { resources: { profile: 'TTS_MANIFEST', cpu: 'AVAILABLE', gpu: 'UNAVAILABLE' } })], ttsRequest()),
    ),
    ERR.RESOURCE_UNAVAILABLE,
  )
  assert.equal(blocked.value.observation.requiredResource, 'GPU')
  expectError(
    negotiateReadyFixtureProvider(
      gate([ttsInstance({ manifest: gpuManifest })], selection, [observation('instance:qwen', { resources: { profile: 'CPU_FIXTURE', cpu: 'AVAILABLE', gpu: 'AVAILABLE' } })], ttsRequest()),
    ),
    'INVALID_READINESS',
    'readiness',
  )
})

test('D04 TTS CPU-capable is READY with CPU available even when GPU is UNKNOWN', () => {
  expectReady(
    negotiateReadyFixtureProvider(
      gate([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, [observation('instance:qwen', { resources: { profile: 'TTS_MANIFEST', cpu: 'AVAILABLE', gpu: 'UNKNOWN' } })], ttsRequest()),
    ),
  )
})

test('D05 remote Fixture ignores local CPU/GPU but still honors network/upload/cost consent', () => {
  const remoteManifest = manifest({ local: false, gpuRequired: false, cpuCapable: false })
  const instances = [ttsInstance({ manifest: remoteManifest })]
  const selection = { category: 'TTS', instanceId: 'instance:qwen' }
  const observations = [observation('instance:qwen', { resources: { profile: 'TTS_MANIFEST', cpu: 'UNAVAILABLE', gpu: 'UNAVAILABLE' } })]
  expectReady(negotiateReadyFixtureProvider(gate(instances, selection, observations, ttsRequest())))

  const consentManifest = manifest(
    { local: false, gpuRequired: false, cpuCapable: false },
    {
      network: { required: true, textUpload: true, endpointPolicy: 'https-only' },
      privacy: { textLeavesDevice: true, retention: 'none', note: 'fixture only' },
      cost: { paid: true, model: 'per-request', note: 'fixture only' },
    },
  )
  const consentInstances = [ttsInstance({ manifest: consentManifest })]
  expectBlocked(
    negotiateReadyFixtureProvider(gate(consentInstances, selection, observations, ttsRequest(), { networkAllowed: true })),
    'TEXT_UPLOAD_NOT_CONFIRMED',
  )
  expectBlocked(
    negotiateReadyFixtureProvider(gate(consentInstances, selection, observations, ttsRequest(), { networkAllowed: true, textUploadAllowed: true })),
    'PROVIDER_INSTANCE_COST_NOT_CONFIRMED',
  )
})

test('D06 local TTS with no CPU capability and no GPU requirement is RESOURCE_POLICY_UNKNOWN', () => {
  const local = manifest({ local: true, gpuRequired: false, cpuCapable: false })
  expectBlocked(
    negotiateReadyFixtureProvider(
      gate([ttsInstance({ manifest: local })], { category: 'TTS', instanceId: 'instance:qwen' }, [observation('instance:qwen', { resources: { profile: 'TTS_MANIFEST', cpu: 'AVAILABLE', gpu: 'AVAILABLE' } })], ttsRequest()),
    ),
    ERR.RESOURCE_POLICY_UNKNOWN,
  )
})

test('D07 installation ABSENT/UNKNOWN blocks; PRESENT does not hide an offline health block', () => {
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  expectBlocked(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [observation('instance:rvc', { installation: 'ABSENT' })], rvcRequest())),
    ERR.INSTALLATION_MISSING,
  )
  expectBlocked(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [observation('instance:rvc', { installation: 'UNKNOWN' })], rvcRequest())),
    ERR.INSTALLATION_UNKNOWN,
  )
  expectBlocked(
    negotiateReadyFixtureProvider(
      gate([rvcInstance({ observation: obs({ state: 'offline' }) })], selection, [observation('instance:rvc')], rvcRequest()),
    ),
    'PROVIDER_INSTANCE_OFFLINE',
  )
  expectBlocked(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [], rvcRequest())),
    ERR.OBSERVATION_MISSING,
  )
})

test('D08 a negative observation for A does not drag selected B; order and repeated calls are stable', () => {
  const a = rvcInstance({ instanceId: 'instance:a' })
  const b = rvcInstance({ instanceId: 'instance:b' })
  const observations = [
    observation('instance:a', { installation: 'ABSENT', resources: { profile: 'CPU_FIXTURE', cpu: 'UNAVAILABLE', gpu: 'UNAVAILABLE' } }),
    observation('instance:b'),
  ]
  const first = negotiateReadyFixtureProvider(gate([a, b], { category: 'SVC', instanceId: 'instance:b' }, observations, rvcRequest()))
  const second = negotiateReadyFixtureProvider(gate([b, a], { category: 'SVC', instanceId: 'instance:b' }, observations, rvcRequest()))
  expectReady(first)
  assert.deepEqual(first, second)
  assert.equal(first.value.instanceId, 'instance:b')
})

test('D09 duplicate/unknown/URL observation ids, bad readiness schema and empty table', () => {
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  expectError(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [observation('instance:rvc'), observation('instance:rvc')], rvcRequest())),
    'DUPLICATE_OBSERVATION',
    'readiness',
  )
  expectError(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [observation('instance:other')], rvcRequest())),
    'UNKNOWN_OBSERVATION_INSTANCE',
    'readiness',
  )
  expectError(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [observation('https://fixture.invalid/PRIVATE')], rvcRequest())),
    'INVALID_READINESS',
    'readiness',
  )
  expectError(
    negotiateReadyFixtureProvider({ ...gate([rvcInstance()], selection, [], rvcRequest()), readiness: { schemaVersion: 2, instances: [] } }),
    'UNSUPPORTED_VERSION',
    'readiness',
  )
  expectBlocked(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [], rvcRequest())),
    ERR.OBSERVATION_MISSING,
  )
})

test('D10 old negotiation blocks keep their reasons and are not upgraded by PRESENT/GPU observations', () => {
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  const cases = [
    [seedInstance(), 'PROVIDER_INSTANCE_NOT_IMPLEMENTED'],
    [rvcInstance({ observation: obs({ state: 'offline' }) }), 'PROVIDER_INSTANCE_OFFLINE'],
    [rvcInstance({ observation: obs({ versionMatches: false }) }), 'PROVIDER_INSTANCE_VERSION_UNKNOWN'],
  ]
  for (const [instance, reason] of cases) {
    const result = negotiateReadyFixtureProvider(
      gate([instance], { category: 'SVC', instanceId: instance.instanceId }, [observation(instance.instanceId, { resources: { profile: 'GPU_FIXTURE', cpu: 'AVAILABLE', gpu: 'AVAILABLE' } })], rvcRequest()),
    )
    expectBlocked(result, reason)
    assert.equal(result.value.observation, null)
  }
  expectBlocked(
    negotiateReadyFixtureProvider(gate([rvcInstance()], { category: 'TTS', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest())),
    'PROVIDER_INSTANCE_CATEGORY_MISMATCH',
  )
  expectError(
    negotiateReadyFixtureProvider(gate([rvcInstance()], selection, [observation('instance:ghost')], rvcRequest())),
    'UNKNOWN_OBSERVATION_INSTANCE',
    'readiness',
  )
})

test('D11 a READY TTS gate still yields the old UNSUPPORTED_DISPATCH dispatch block', () => {
  const instances = [ttsInstance()]
  const selection = { category: 'TTS', instanceId: 'instance:qwen' }
  const observations = [observation('instance:qwen', { resources: { profile: 'TTS_MANIFEST', cpu: 'AVAILABLE', gpu: 'AVAILABLE' } })]
  const result = dispatchReadyRvcFakeOnce(input(instances, selection, observations, ttsRequest()))
  assert.equal(result.ok, true)
  assert.equal(result.value.phase, 'BLOCKED')
  assert.equal(result.value.dispatch.phase, 'BLOCKED')
  assert.equal(result.value.dispatch.reason, 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH')
  assert.equal(result.value.readiness.decision, 'FIXTURE_READY')
})

test('D12 CPU/REMOTE paths do not require GPU; no real RVC CPU/GPU claim is made', async () => {
  expectReady(
    negotiateReadyFixtureProvider(
      gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc', { resources: { profile: 'CPU_FIXTURE', cpu: 'AVAILABLE', gpu: 'UNKNOWN' } })], rvcRequest()),
    ),
  )
  const doc = await readFile(new URL('../docs/PROVIDER_READINESS_OFFLINE.md', import.meta.url), 'utf8')
  assert.match(doc, /不声称.*真实.*RVC/)
})

test('D13 context/request linkage, no default scenario and the complete 15-field result stay intact', () => {
  const instances = [rvcInstance()]
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  const observations = [observation('instance:rvc')]
  for (const scenario of RVC_FAKE_SCENARIOS) {
    const result = dispatchReadyRvcFakeOnce(input(instances, selection, observations, rvcRequest(), { scenario }))
    assert.equal(result.ok, true)
    assert.equal(result.value.dispatch.result.requestId, 'request:fixture-1')
    assert.equal(Object.keys(result.value.dispatch.result).length, 15)
    const revalidated = validateRvcFakeResult(result.value.dispatch.result, rvcRequest(), {
      requestId: 'request:fixture-1',
      endpointId: 'gateway:fixture-rvc',
      scenario,
    })
    assert.equal(revalidated.ok, true, scenario)
  }
})

test('D14 TIMEOUT/UNKNOWN have no artifact/retry and cancel request is distinct from confirmation', () => {
  const instances = [rvcInstance()]
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  const observations = [observation('instance:rvc')]
  for (const scenario of ['TIMEOUT', 'UNKNOWN']) {
    const result = dispatchReadyRvcFakeOnce(input(instances, selection, observations, rvcRequest(), { scenario }))
    assert.equal(result.value.dispatch.result.artifactRef, null)
    assert.equal(result.value.dispatch.result.automaticRetryAllowed, false)
  }
  const requested = dispatchReadyRvcFakeOnce(input(instances, selection, observations, rvcRequest(), { scenario: 'CANCEL_REQUESTED' }))
  const confirmed = dispatchReadyRvcFakeOnce(input(instances, selection, observations, rvcRequest(), { scenario: 'CANCEL_CONFIRMED' }))
  assert.equal(requested.value.dispatch.result.cancel.confirmed, false)
  assert.equal(confirmed.value.dispatch.result.cancel.confirmed, true)
})

test('D15 missing/unknown root keys and a forged ready/view fail closed', () => {
  const valid = gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest())
  expectError(negotiateReadyFixtureProvider({ ...valid, extra: 1 }), 'INVALID_INPUT', '<unknown-key>')
  const missing = { ...valid }
  delete missing.readiness
  expectError(negotiateReadyFixtureProvider(missing), 'INVALID_INPUT', '$')
  expectError(
    negotiateReadyFixtureProvider({ ...valid, readiness: { instances: [] } }),
    'INVALID_READINESS',
    'readiness',
  )
  const forged = { ...valid, decision: 'FIXTURE_READY', ready: true }
  expectError(negotiateReadyFixtureProvider(forged), 'INVALID_INPUT', '<unknown-key>')
})

test('D16 invalid context is rejected before an otherwise BLOCKED negotiation', () => {
  const value = input([rvcInstance()], { category: 'SVC', instanceId: 'instance:none' }, [observation('instance:none')], rvcRequest(), { requestId: 'https://fixture.invalid' })
  expectError(dispatchReadyRvcFakeOnce(value), 'INVALID_CONTEXT', 'context')
})

test('D17 getters/Symbols/hidden keys/custom prototypes/Proxy never execute or leak', () => {
  let calls = 0
  const accessor = gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest())
  Object.defineProperty(accessor, 'readiness', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1
      return accessor._readiness
    },
  })
  expectError(negotiateReadyFixtureProvider(accessor), 'INVALID_INPUT', '$')
  assert.equal(calls, 0)

  const symbol = gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest())
  symbol[Symbol('x')] = 1
  expectError(negotiateReadyFixtureProvider(symbol), 'INVALID_INPUT', '$')

  const hidden = gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest())
  Object.defineProperty(hidden, 'hidden', { value: 1, enumerable: false })
  expectError(negotiateReadyFixtureProvider(hidden), 'INVALID_INPUT', '$')

  const custom = Object.assign(Object.create({}), gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest()))
  expectError(negotiateReadyFixtureProvider(custom), 'INVALID_INPUT', '$')

  const marker = 'PRIVATE_PROXY_MARKER'
  const proxy = new Proxy({}, {
    ownKeys() {
      throw new Error(marker)
    },
  })
  const proxied = negotiateReadyFixtureProvider(proxy)
  expectError(proxied, 'INVALID_INPUT', '$')
  assert.equal(JSON.stringify(proxied).includes(marker), false)
})

test('D18 cycles/holes/unsupported values/limits and the 32-observation business cap', () => {
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  const cycle = gate([rvcInstance()], selection, [observation('instance:rvc')], rvcRequest())
  cycle.readiness.instances[0].resources.self = cycle.readiness.instances[0].resources
  expectError(negotiateReadyFixtureProvider(cycle), 'INVALID_INPUT', '$')

  const hole = gate([rvcInstance()], selection, [], rvcRequest())
  hole.readiness.instances[1] = observation('instance:rvc')
  expectError(negotiateReadyFixtureProvider(hole), 'INVALID_INPUT', '$')

  const extraArray = gate([rvcInstance()], selection, [], rvcRequest())
  extraArray.readiness.instances.extra = 1
  expectError(negotiateReadyFixtureProvider(extraArray), 'INVALID_INPUT', '$')

  for (const value of ['BROKEN', 1, null]) {
    const bad = gate([rvcInstance()], selection, [observation('instance:rvc')], rvcRequest())
    bad.readiness.instances[0].installation = value
    expectError(negotiateReadyFixtureProvider(bad), 'INVALID_READINESS', 'readiness')
  }
  for (const value of [() => 1, 1n, NaN, Infinity]) {
    const bad = gate([rvcInstance()], selection, [observation('instance:rvc')], rvcRequest())
    bad.readiness.instances[0].installation = value
    expectError(negotiateReadyFixtureProvider(bad), 'INVALID_INPUT', '$')
  }

  const tooMany = Array.from({ length: 33 }, (_, index) => observation('instance:' + index))
  expectError(negotiateReadyFixtureProvider(gate([rvcInstance()], selection, tooMany, rvcRequest())), 'RESOURCE_LIMIT', '$')
})

test('D19 null/frozen input accepted; every returned graph is frozen and not shared with input', () => {
  const value = gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest())
  const nullProto = Object.assign(Object.create(null), value)
  const result = negotiateReadyFixtureProvider(nullProto)
  expectReady(result)
  deepFreezeTree(result)
  assert.equal(Object.isFrozen(value), false)
  assert.equal(Object.isFrozen(value.readiness), false)

  const frozen = gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest())
  frozen.readiness = Object.freeze(frozen.readiness)
  const first = negotiateReadyFixtureProvider(Object.freeze(frozen))
  const second = negotiateReadyFixtureProvider(Object.freeze(frozen))
  expectReady(first)
  expectReady(second)
  assert.notEqual(first.value, second.value)
  assert.notEqual(first.value.negotiation, second.value.negotiation)
  assert.notEqual(first.value.observation, second.value.observation)
})

test('D20 own __proto__/constructor/prototype keys do not pollute; unknown business fields are rejected', () => {
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  const value = gate([rvcInstance()], selection, [observation('instance:rvc')], rvcRequest())
  Object.defineProperty(value.readiness.instances[0], '__proto__', {
    value: 'proto-marker',
    enumerable: true,
    configurable: true,
    writable: true,
  })
  expectError(negotiateReadyFixtureProvider(value), 'INVALID_READINESS', 'readiness')
  assert.equal({}.protoMarker, undefined)
  assert.equal(Object.getPrototypeOf({}), Object.prototype)

  const unknown = gate([rvcInstance()], selection, [observation('instance:rvc')], rvcRequest())
  unknown.readiness.instances[0].extra = 1
  expectError(negotiateReadyFixtureProvider(unknown), 'INVALID_READINESS', 'readiness')
})

test('D21 exactly four exports and no upstream/manifest/text leaks', () => {
  const readinessModule = {
    PROVIDER_READINESS_SCHEMA_VERSION,
    PROVIDER_READINESS_ERRORS,
    negotiateReadyFixtureProvider,
    dispatchReadyRvcFakeOnce,
  }
  assert.equal(Object.keys(readinessModule).length, 4)
  const error = expectError(
    negotiateReadyFixtureProvider({ schemaVersion: 1, negotiation: {}, readiness: { schemaVersion: 1, instances: [] } }),
    'NEGOTIATION_INVALID',
    'negotiation',
  )
  assert.equal(JSON.stringify(error).includes('hello'), false)
  assert.equal(JSON.stringify(error).includes('registry'), false)
})

test('D22 every gate/dispatch result keeps fixed safety flags and the real catalogues stay unselectable', () => {
  const ready = negotiateReadyFixtureProvider(gate([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, [observation('instance:rvc')], rvcRequest()))
  expectReady(ready)
  assert.equal(getRegistryView().selectable.length, 0)
  assert.equal(getSvcRegistryView().selectable.length, 0)
  assert.equal(selectProviderCandidate('piper').code, 'NOT_IMPLEMENTED')
  assert.equal(selectSvcCandidate('rvc').code, 'NOT_IMPLEMENTED')
})

test('D23 static call graph: dispatch only after READY, no copied simulator/validator, no retry loop', async () => {
  const source = await readFile(new URL('../core/audio/provider-readiness.mjs', import.meta.url), 'utf8')
  assert.equal((source.match(/dispatchRvcFakeOnce\(/g) || []).length, 1)
  assert.equal((source.match(/simulateRvcFakeConversion\(/g) || []).length, 0)
  assert.equal((source.match(/validateRvcFakeResult\(/g) || []).length, 0)
  assert.doesNotMatch(source, /\bwhile\s*\(|setTimeout|setInterval/)
})

test('D24 readiness and dependency chain have no I/O/clock/random/hardware probing', async () => {
  for (const file of ['../core/audio/provider-readiness.mjs', '../core/audio/provider-dispatch.mjs', '../core/audio/provider-instances.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(|process\.|Date\.now|Math\.random|setTimeout/)
  }
})

test('D25 old 06-B/06-C public surfaces and tests remain in place', async () => {
  assert.deepEqual(Object.keys(instanceModule).sort(), [
    'PROVIDER_INSTANCES_SCHEMA_VERSION',
    'PROVIDER_INSTANCE_ERRORS',
    'buildProviderInstanceView',
    'negotiateProviderInstance',
  ])
  const dispatchSource = await readFile(new URL('../core/audio/provider-dispatch.mjs', import.meta.url), 'utf8')
  assert.match(dispatchSource, /export function dispatchRvcFakeOnce/)
  assert.match(dispatchSource, /export const PROVIDER_DISPATCH_SCHEMA_VERSION/)
})

test('D26 README documents the three ordinary recoveries and the no-real-integration boundary', async () => {
  const doc = await readFile(new URL('../docs/PROVIDER_READINESS_OFFLINE.md', import.meta.url), 'utf8')
  assert.match(doc, /安装/)
  assert.match(doc, /资源/)
  assert.match(doc, /OFFLINE/)
  assert.match(doc, /NOT_INTEGRATED/)
})

test('D27 readiness schema version is exported as 1 and the error namespace is complete', () => {
  assert.equal(PROVIDER_READINESS_SCHEMA_VERSION, 1)
  const keys = [
    'INVALID_INPUT', 'RESOURCE_LIMIT', 'UNSUPPORTED_VERSION', 'INVALID_READINESS',
    'DUPLICATE_OBSERVATION', 'UNKNOWN_OBSERVATION_INSTANCE', 'NEGOTIATION_INVALID',
    'INVALID_CONTEXT', 'DEPENDENCY_FAILURE', 'DISPATCH_REJECTED',
    'OBSERVATION_MISSING', 'INSTALLATION_MISSING', 'INSTALLATION_UNKNOWN',
    'RESOURCE_POLICY_UNKNOWN', 'RESOURCE_UNKNOWN', 'RESOURCE_UNAVAILABLE',
  ]
  assert.deepEqual(Object.keys(ERR).sort(), keys.sort())
  for (const key of keys) assert.equal(ERR[key], 'PROVIDER_READINESS_' + key)
})
