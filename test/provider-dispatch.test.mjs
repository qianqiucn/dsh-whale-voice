import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  PROVIDER_DISPATCH_ERRORS,
  PROVIDER_DISPATCH_SCHEMA_VERSION,
  dispatchRvcFakeOnce,
} from '../core/audio/provider-dispatch.mjs'
import * as instanceModule from '../core/audio/provider-instances.mjs'
import { PROVIDER_KINDS } from '../core/tts/provider-contract.mjs'
import { getRegistryView, selectProviderCandidate } from '../core/tts/provider-registry.mjs'
import { getSvcRegistryView, selectSvcCandidate } from '../core/svc/svc-registry.mjs'
import {
  RVC_FAKE_SCENARIOS,
  simulateRvcFakeConversion,
  validateRvcFakeResult,
} from '../core/svc/rvc-fake-gateway.mjs'

const ERR = PROVIDER_DISPATCH_ERRORS

function localManifest() {
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
    resources: { local: true, gpuRequired: false, cpuCapable: true },
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
    manifest: localManifest(),
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

function negotiation(instances, selection, request) {
  return {
    schemaVersion: 1,
    registry: { schemaVersion: 1, instances },
    selection,
    consent: { networkAllowed: false, textUploadAllowed: false, paidAllowed: false },
    request,
  }
}

function context(overrides = {}) {
  return {
    requestId: 'request:fixture-1',
    endpointId: 'gateway:fixture-rvc',
    scenario: 'SUCCESS',
    ...overrides,
  }
}

function dispatchInput(negotiationValue, contextOverrides = {}) {
  return { schemaVersion: 1, negotiation: negotiationValue, context: context(contextOverrides) }
}

function rvcInput(request = rvcRequest(), scenario = 'SUCCESS') {
  return dispatchInput(
    negotiation([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, request),
    { scenario },
  )
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
  assert.equal(result.value.phase, 'BLOCKED')
  assert.equal(result.value.result, null)
  assert.equal(result.value.reason, reason)
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
  assert.equal(result.value.result.delivery.state, 'NOT_REQUESTED')
  assert.equal(result.value.result.delivery.submitAllowed, false)
  return result
}

const SCENARIOS = {
  SUCCESS: ['SUCCEEDED_FAKE', null, false, false, true],
  OFFLINE: ['OFFLINE', 'RVC_FAKE_OFFLINE', false, false, false],
  MODEL_MISSING: ['MODEL_NOT_AVAILABLE', 'RVC_FAKE_MODEL_NOT_AVAILABLE', false, false, false],
  TIMEOUT: ['TIMEOUT', 'RVC_FAKE_TIMEOUT', false, false, false],
  CANCEL_REQUESTED: ['CANCEL_REQUESTED', 'RVC_FAKE_CANCEL_PENDING', true, false, false],
  CANCEL_CONFIRMED: ['CANCELLED_FAKE', 'RVC_FAKE_CANCELLED', true, true, false],
  UNKNOWN: ['UNKNOWN', 'RVC_FAKE_UNKNOWN', false, false, false],
}

const PATH_WHITELIST = new Set(['$', 'schemaVersion', 'context', 'negotiation', 'result', '<unknown-key>'])

test('T01 a normal SVC/RVC/A/SUCCESS call is SIMULATED/SUCCEEDED_FAKE with linked ids', () => {
  const result = dispatchRvcFakeOnce(rvcInput())
  expectSimulated(result)
  const value = result.value
  assert.deepEqual(Object.keys(value).sort(), [
    'automaticRetryAllowed', 'candidateId', 'category', 'instanceId', 'messageZh', 'mockOnly',
    'negotiation', 'phase', 'realOperationAllowed', 'reason', 'requestId', 'result', 'schemaVersion', 'submitAllowed',
  ])
  assert.equal(value.schemaVersion, PROVIDER_DISPATCH_SCHEMA_VERSION)
  assert.equal(value.category, 'SVC')
  assert.equal(value.instanceId, 'instance:rvc')
  assert.equal(value.candidateId, 'rvc')
  assert.equal(value.requestId, 'request:fixture-1')
  assert.equal(value.reason, null)
  assert.equal(value.result.status, 'SUCCEEDED_FAKE')
  assert.equal(value.result.code, null)
  assert.equal(value.result.requestId, 'request:fixture-1')
  assert.equal(value.result.targetModelId, 'rvc-model:fixture-a')
  assert.match(value.result.artifactRef, /^artifact:fixture-output-/)
  assert.match(value.messageZh, /没有生成真实音频/)
})

test('T02 all seven scenarios preserve exact status/code/cancel/delivery and fixed Chinese', () => {
  for (const scenario of RVC_FAKE_SCENARIOS) {
    const result = dispatchRvcFakeOnce(rvcInput(rvcRequest(), scenario))
    expectSimulated(result)
    const [status, code, requested, confirmed, hasArtifact] = SCENARIOS[scenario]
    assert.equal(result.value.result.status, status, scenario)
    assert.equal(result.value.result.code, code, scenario)
    assert.equal(result.value.reason, code, scenario)
    assert.equal(result.value.result.cancel.requested, requested, scenario)
    assert.equal(result.value.result.cancel.confirmed, confirmed, scenario)
    assert.equal(result.value.result.delivery.state, 'NOT_REQUESTED', scenario)
    assert.equal(result.value.result.delivery.submitAllowed, false, scenario)
    assert.equal(result.value.result.artifactRef === null, !hasArtifact, scenario)
    assert.equal(typeof result.value.messageZh, 'string')
    assert.ok(result.value.messageZh.length > 0)
  }
  assert.match(dispatchRvcFakeOnce(rvcInput(rvcRequest(), 'OFFLINE')).value.messageZh, /不会自动重试/)
  assert.match(dispatchRvcFakeOnce(rvcInput(rvcRequest(), 'CANCEL_REQUESTED')).value.messageZh, /尚未确认停止/)
  assert.match(dispatchRvcFakeOnce(rvcInput(rvcRequest(), 'UNKNOWN')).value.messageZh, /不会自动重试或发送/)
})

test('T03 offline/unknown/timeout/degraded/version-unknown instances block with no result', () => {
  const cases = [
    [rvcInstance({ observation: obs({ state: 'offline' }) }), 'PROVIDER_INSTANCE_OFFLINE'],
    [rvcInstance({ observation: obs({ state: 'unknown' }) }), 'PROVIDER_INSTANCE_HEALTH_UNKNOWN'],
    [rvcInstance({ observation: obs({ state: 'timeout' }) }), 'PROVIDER_INSTANCE_TIMEOUT'],
    [rvcInstance({ observation: obs({ state: 'degraded' }) }), 'PROVIDER_INSTANCE_DEGRADED'],
    [rvcInstance({ observation: obs({ versionMatches: false }) }), 'PROVIDER_INSTANCE_VERSION_UNKNOWN'],
  ]
  for (const [instance, reason] of cases) {
    const input = dispatchInput(negotiation([instance], { category: 'SVC', instanceId: instance.instanceId }, rvcRequest()))
    expectBlocked(dispatchRvcFakeOnce(input), reason)
  }
})

test('T04 model B and unknown models block in 06-B without simulating or falling back to A', () => {
  for (const targetModelId of ['rvc-model:fixture-b', 'rvc-model:other']) {
    const result = dispatchRvcFakeOnce(rvcInput(rvcRequest({ targetModelId })))
    expectBlocked(result, 'PROVIDER_INSTANCE_MODEL_NOT_AVAILABLE')
    assert.equal(result.value.result, null)
  }
})

test('T05 a compatible TTS instance is UNSUPPORTED_DISPATCH, not a fake TTS generator', () => {
  const input = dispatchInput(negotiation([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()))
  const result = dispatchRvcFakeOnce(input)
  expectBlocked(result, ERR.UNSUPPORTED_DISPATCH)
  assert.equal(result.value.result, null)
  assert.match(result.value.messageZh, /尚未实现/)
})

test('T06 seed-vc, unknown instance and category mismatch keep 06-B reasons and do not simulate', () => {
  expectBlocked(
    dispatchRvcFakeOnce(dispatchInput(negotiation([seedInstance()], { category: 'SVC', instanceId: 'instance:seed' }, rvcRequest()))),
    'PROVIDER_INSTANCE_NOT_IMPLEMENTED',
  )
  expectBlocked(
    dispatchRvcFakeOnce(dispatchInput(negotiation([rvcInstance()], { category: 'SVC', instanceId: 'instance:none' }, rvcRequest()))),
    'PROVIDER_INSTANCE_INSTANCE_UNKNOWN',
  )
  expectBlocked(
    dispatchRvcFakeOnce(dispatchInput(negotiation([rvcInstance()], { category: 'TTS', instanceId: 'instance:rvc' }, rvcRequest()))),
    'PROVIDER_INSTANCE_CATEGORY_MISMATCH',
  )
})

test('T07 missing/unknown top fields and a caller-made decision view fail closed', () => {
  const valid = rvcInput()
  const missingNegotiation = { schemaVersion: 1, context: context() }
  expectError(dispatchRvcFakeOnce(missingNegotiation), 'INVALID_INPUT', '$')
  const missingContext = { schemaVersion: 1, negotiation: valid.negotiation }
  expectError(dispatchRvcFakeOnce(missingContext), 'INVALID_INPUT', '$')
  const unknownTop = { ...valid, extra: 1 }
  expectError(dispatchRvcFakeOnce(unknownTop), 'INVALID_INPUT', '<unknown-key>')
  const forged = {
    schemaVersion: 1,
    negotiation: { schemaVersion: 1, decision: 'FIXTURE_COMPATIBLE', category: 'SVC', candidateId: 'rvc' },
    context: context(),
  }
  expectError(dispatchRvcFakeOnce(forged), 'NEGOTIATION_INVALID', 'negotiation')
})

test('T08 schemaVersion rules match the fixed version contract', () => {
  for (const schemaVersion of ['1', null, true, 0, 2, [], {}]) {
    expectError(dispatchRvcFakeOnce({ ...rvcInput(), schemaVersion }), 'UNSUPPORTED_VERSION', 'schemaVersion')
  }
  const missing = { ...rvcInput() }
  delete missing.schemaVersion
  expectError(dispatchRvcFakeOnce(missing), 'INVALID_INPUT', 'schemaVersion')
})

test('T09 context is exact and never defaults to SUCCESS', () => {
  const valid = rvcInput()
  for (const key of ['requestId', 'endpointId', 'scenario']) {
    const broken = { ...valid, context: { ...valid.context } }
    delete broken.context[key]
    expectError(dispatchRvcFakeOnce(broken), 'INVALID_CONTEXT', 'context')
  }
  expectError(
    dispatchRvcFakeOnce({ ...valid, context: { ...valid.context, extra: 1 } }),
    'INVALID_CONTEXT',
    'context',
  )
  expectError(
    dispatchRvcFakeOnce({ ...valid, context: { ...valid.context, requestId: 'https://fixture.invalid' } }),
    'INVALID_CONTEXT',
    'context',
  )
  expectError(
    dispatchRvcFakeOnce({ ...valid, context: { ...valid.context, endpointId: 'https://fixture.invalid/rvc' } }),
    'INVALID_CONTEXT',
    'context',
  )
  expectError(
    dispatchRvcFakeOnce({ ...valid, context: { ...valid.context, scenario: 'DEFAULT' } }),
    'INVALID_CONTEXT',
    'context',
  )
})

test('T10 invalid Fixture request fields block in 06-B before any simulation', () => {
  const cases = [
    rvcRequest({ rights: { state: 'UNVERIFIED' } }),
    rvcRequest({ pitchShift: 13 }),
    rvcRequest({ pitchShift: 0.5 }),
    rvcRequest({ outputFormat: 'video/mp4' }),
    rvcRequest({ sourceAudioRef: 'https://fixture.invalid/song' }),
  ]
  for (const request of cases) {
    const result = dispatchRvcFakeOnce(rvcInput(request))
    expectBlocked(result, 'PROVIDER_INSTANCE_INVALID_REQUEST')
  }
})

test('T11 A + MODEL_MISSING is a legal SIMULATED/MODEL_NOT_AVAILABLE, not a success', () => {
  const result = dispatchRvcFakeOnce(rvcInput(rvcRequest(), 'MODEL_MISSING'))
  expectSimulated(result)
  assert.equal(result.value.result.status, 'MODEL_NOT_AVAILABLE')
  assert.equal(result.value.result.artifactRef, null)
  assert.equal(result.value.reason, 'RVC_FAKE_MODEL_NOT_AVAILABLE')
})

test('T12 TIMEOUT/UNKNOWN produce no artifact and no retry permission', () => {
  for (const scenario of ['TIMEOUT', 'UNKNOWN']) {
    const result = dispatchRvcFakeOnce(rvcInput(rvcRequest(), scenario))
    expectSimulated(result)
    assert.equal(result.value.result.artifactRef, null)
    assert.equal(result.value.result.mime, null)
    assert.equal(result.value.result.sampleRate, null)
    assert.equal(result.value.result.durationMs, null)
    assert.equal(result.value.result.automaticRetryAllowed, false)
    assert.equal(result.value.result.cancel.requested, false)
    assert.equal(result.value.result.cancel.confirmed, false)
  }
})

test('T13 cancel request and confirmation remain distinct and never claim a real stop', () => {
  const requested = dispatchRvcFakeOnce(rvcInput(rvcRequest(), 'CANCEL_REQUESTED'))
  const confirmed = dispatchRvcFakeOnce(rvcInput(rvcRequest(), 'CANCEL_CONFIRMED'))
  expectSimulated(requested)
  expectSimulated(confirmed)
  assert.equal(requested.value.result.cancel.requested, true)
  assert.equal(requested.value.result.cancel.confirmed, false)
  assert.match(requested.value.messageZh, /尚未确认停止/)
  assert.equal(confirmed.value.result.cancel.requested, true)
  assert.equal(confirmed.value.result.cancel.confirmed, true)
  assert.equal(confirmed.value.result.status, 'CANCELLED_FAKE')
  assert.match(confirmed.value.messageZh, /不证明真实进程已停止/)
})

test('T14 two instances and request ids stay deterministic and never cross values', () => {
  const a = dispatchInput(
    negotiation(
      [rvcInstance({ instanceId: 'instance:a' }), rvcInstance({ instanceId: 'instance:b' })],
      { category: 'SVC', instanceId: 'instance:a' },
      rvcRequest(),
    ),
    { requestId: 'request:fixture-a' },
  )
  const b = dispatchInput(
    negotiation(
      [rvcInstance({ instanceId: 'instance:a' }), rvcInstance({ instanceId: 'instance:b' })],
      { category: 'SVC', instanceId: 'instance:b' },
      rvcRequest(),
    ),
    { requestId: 'request:fixture-b' },
  )
  const first = dispatchRvcFakeOnce(a)
  const second = dispatchRvcFakeOnce(b)
  expectSimulated(first)
  expectSimulated(second)
  assert.equal(first.value.instanceId, 'instance:a')
  assert.equal(first.value.requestId, 'request:fixture-a')
  assert.equal(first.value.result.requestId, 'request:fixture-a')
  assert.equal(second.value.instanceId, 'instance:b')
  assert.equal(second.value.requestId, 'request:fixture-b')
  assert.equal(second.value.result.requestId, 'request:fixture-b')
  assert.deepEqual(dispatchRvcFakeOnce(a), first)
})

test('T15 getters/setters/Symbols/hidden keys/custom prototypes are rejected without invocation', () => {
  let calls = 0
  const getterRoot = rvcInput()
  Object.defineProperty(getterRoot, 'negotiation', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1
      return getterRoot._negotiation
    },
  })
  expectError(dispatchRvcFakeOnce(getterRoot), 'INVALID_INPUT', '$')
  assert.equal(calls, 0)

  const getterContext = rvcInput()
  Object.defineProperty(getterContext.context, 'requestId', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1
      return 'request:fixture-1'
    },
  })
  expectError(dispatchRvcFakeOnce(getterContext), 'INVALID_INPUT', '$')
  assert.equal(calls, 0)

  const symbolInput = rvcInput()
  symbolInput[Symbol('marker')] = 'x'
  expectError(dispatchRvcFakeOnce(symbolInput), 'INVALID_INPUT', '$')

  const hiddenInput = rvcInput()
  Object.defineProperty(hiddenInput, 'hidden', { value: 'x', enumerable: false, configurable: true })
  expectError(dispatchRvcFakeOnce(hiddenInput), 'INVALID_INPUT', '$')

  const custom = Object.assign(Object.create({}), rvcInput())
  expectError(dispatchRvcFakeOnce(custom), 'INVALID_INPUT', '$')
  assert.equal(calls, 0)
})

test('T16 null prototypes and frozen inputs are accepted; input stays unchanged and output is frozen', () => {
  const normal = rvcInput()
  const nullProto = Object.assign(Object.create(null), normal)
  const accepted = dispatchRvcFakeOnce(nullProto)
  expectSimulated(accepted)
  assert.equal(Object.isFrozen(accepted.value), true)
  assert.equal(Object.isFrozen(accepted.value.result), true)
  assert.equal(Object.isFrozen(accepted.value.negotiation), true)

  const frozen = rvcInput()
  frozen.negotiation = Object.freeze(frozen.negotiation)
  frozen.context = Object.freeze(frozen.context)
  const snapshot = JSON.stringify(frozen)
  const result = dispatchRvcFakeOnce(Object.freeze(frozen))
  expectSimulated(result)
  assert.equal(JSON.stringify(frozen), snapshot)
})

test('T17 cycles, holes, array extras, unsupported values and limits fail finitely', () => {
  const cycle = rvcInput()
  cycle.context.self = cycle.context
  expectError(dispatchRvcFakeOnce(cycle), 'INVALID_INPUT', '$')

  const withHole = rvcInput()
  withHole.negotiation.registry.instances = []
  withHole.negotiation.registry.instances[1] = rvcInstance()
  expectError(dispatchRvcFakeOnce(withHole), 'INVALID_INPUT', '$')

  const extraArray = rvcInput()
  extraArray.negotiation.registry.instances.extra = 1
  expectError(dispatchRvcFakeOnce(extraArray), 'INVALID_INPUT', '$')

  for (const value of [() => 1, 1n, NaN, Infinity]) {
    const input = rvcInput()
    input.context.requestId = value
    expectError(dispatchRvcFakeOnce(input), 'INVALID_INPUT', '$')
  }

  let deep = { value: 'x' }
  for (let index = 0; index < 20; index += 1) deep = { nested: deep }
  const deepInput = rvcInput()
  deepInput.context = deep
  expectError(dispatchRvcFakeOnce(deepInput), 'RESOURCE_LIMIT', '$')

  const longString = rvcInput()
  longString.context.requestId = 'request:fixture-' + 'a'.repeat(9000)
  expectError(dispatchRvcFakeOnce(longString), 'RESOURCE_LIMIT', '$')

  const manyKeys = rvcInput()
  for (let index = 0; index < 33; index += 1) manyKeys.context['extra' + index] = index
  expectError(dispatchRvcFakeOnce(manyKeys), 'RESOURCE_LIMIT', '$')
})

test('T18 Proxy exceptions and private markers never leak; paths stay whitelisted', () => {
  const marker = 'PRIVATE_PROXY_MARKER_18'
  const proxy = new Proxy({}, {
    ownKeys() {
      throw new Error(marker)
    },
  })
  const proxied = dispatchRvcFakeOnce(proxy)
  expectError(proxied, 'INVALID_INPUT', '$')
  assert.equal(JSON.stringify(proxied).includes(marker), false)

  const unknownKey = 'PRIVATE_KEY_MARKER_18'
  const unknownValue = 'PRIVATE_VALUE_MARKER_18'
  const unknown = rvcInput()
  unknown[unknownKey] = unknownValue
  const unknownResult = dispatchRvcFakeOnce(unknown)
  expectError(unknownResult, 'INVALID_INPUT', '<unknown-key>')
  assert.equal(JSON.stringify(unknownResult).includes(unknownKey), false)
  assert.equal(JSON.stringify(unknownResult).includes(unknownValue), false)

  for (const error of [proxied, unknownResult]) {
    assert.ok(PATH_WHITELIST.has(error.errors[0].path))
    assert.equal(JSON.stringify(error).includes('stack'), false)
  }
})

test('T19 the 06-B public surface and representative behaviour are unchanged', () => {
  assert.deepEqual(Object.keys(instanceModule).sort(), [
    'PROVIDER_INSTANCES_SCHEMA_VERSION',
    'PROVIDER_INSTANCE_ERRORS',
    'buildProviderInstanceView',
    'negotiateProviderInstance',
  ])
  const view = instanceModule.buildProviderInstanceView({ schemaVersion: 1, instances: [rvcInstance()] })
  assert.equal(view.ok, true)
  assert.equal(view.value.instances[0].status, 'FIXTURE_AVAILABLE')
  const negotiated = instanceModule.negotiateProviderInstance(
    negotiation([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest()),
  )
  assert.equal(negotiated.ok, true)
  assert.equal(negotiated.value.decision, 'FIXTURE_COMPATIBLE')
})

test('T20 the original catalogues and selectors stay unchanged', () => {
  const ttsBefore = JSON.stringify(getRegistryView())
  const svcBefore = JSON.stringify(getSvcRegistryView())
  const before = dispatchRvcFakeOnce(rvcInput())
  assert.equal(before.ok, true)
  assert.equal(JSON.stringify(getRegistryView()), ttsBefore)
  assert.equal(JSON.stringify(getSvcRegistryView()), svcBefore)
  assert.deepEqual(getRegistryView().selectable, [])
  assert.deepEqual(getSvcRegistryView().selectable, [])
  assert.equal(selectProviderCandidate('piper').code, 'NOT_IMPLEMENTED')
  assert.equal(selectSvcCandidate('rvc').code, 'NOT_IMPLEMENTED')
})

test('T21 every branch keeps fixed safety flags and BLOCKED has a null result', () => {
  const blocked = dispatchRvcFakeOnce(dispatchInput(negotiation([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest())))
  expectBlocked(blocked, ERR.UNSUPPORTED_DISPATCH)

  const simulated = dispatchRvcFakeOnce(rvcInput())
  const result = expectSimulated(simulated)
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('PENDING_ROUTER'), false)
  assert.equal(encoded.includes('"submitAllowed":true'), false)
  assert.equal(encoded.includes('"realOperationAllowed":true'), false)
  assert.equal(encoded.includes('taskId'), false)
})

test('T22 SIMULATED.result revalidates with the existing validator and matches direct simulation', () => {
  for (const scenario of RVC_FAKE_SCENARIOS) {
    const request = rvcRequest()
    const ctx = context({ scenario })
    const dispatch = dispatchRvcFakeOnce(dispatchInput(
      negotiation([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, request),
      { scenario },
    ))
    expectSimulated(dispatch)
    const revalidated = validateRvcFakeResult(dispatch.value.result, request, ctx)
    assert.equal(revalidated.ok, true, scenario)
    const direct = simulateRvcFakeConversion(request, ctx)
    assert.equal(direct.ok, true, scenario)
    assert.deepEqual(dispatch.value.result, direct.value, scenario)
  }
})

test('T23 tampered result fields are rejected by the existing validator (direct negative)', () => {
  const request = rvcRequest()
  const ctx = context()
  const success = simulateRvcFakeConversion(request, ctx)
  assert.equal(success.ok, true)
  const valid = success.value
  const tampered = [
    { ...valid, requestId: 'request:fixture-other' },
    { ...valid, targetModelId: 'rvc-model:fixture-b' },
    { ...valid, artifactRef: 'artifact:fixture-output-other' },
    { ...valid, delivery: { state: 'SENT', submitAllowed: false } },
    { ...valid, delivery: { state: 'NOT_REQUESTED', submitAllowed: true } },
    { ...valid, mockOnly: false },
  ]
  for (const value of tampered) {
    assert.equal(validateRvcFakeResult(value, request, ctx).ok, false)
  }
})

test('T24 static call graph has one simulator call after negotiation and always before validation', async () => {
  const source = await readFile(new URL('../core/audio/provider-dispatch.mjs', import.meta.url), 'utf8')
  assert.equal((source.match(/simulateRvcFakeConversion\(/g) || []).length, 1)
  assert.equal((source.match(/validateRvcFakeResult\(/g) || []).length, 1)
  const negotiateAt = source.indexOf('negotiateProviderInstance(')
  const simulateAt = source.indexOf('simulateRvcFakeConversion(')
  const validateAt = source.indexOf('validateRvcFakeResult(')
  assert.ok(negotiateAt >= 0 && simulateAt > negotiateAt && validateAt > simulateAt)
  assert.doesNotMatch(source, /\bwhile\s*\(|setTimeout|setInterval/)
})

test('T25 shared helper, dispatcher and 06-B modules remain pure', async () => {
  for (const file of ['../core/audio/fixture-input-boundary.mjs', '../core/audio/provider-dispatch.mjs', '../core/audio/provider-instances.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(|process\.|Date\.now|Math\.random|setTimeout/)
  }
})

test('T26 the dispatcher never rereads the original input or echoes its markers', () => {
  const marker = 'PRIVATE_INPUT_MARKER_26'
  const input = rvcInput(rvcRequest({ extra: marker }))
  const snapshot = JSON.stringify(input)
  const result = dispatchRvcFakeOnce(input)
  expectBlocked(result, 'PROVIDER_INSTANCE_INVALID_REQUEST')
  assert.equal(JSON.stringify(result).includes(marker), false)
  assert.equal(JSON.stringify(input), snapshot)

  const spy = rvcInput()
  let reads = 0
  Object.defineProperty(spy, 'context', {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1
      return context()
    },
  })
  expectError(dispatchRvcFakeOnce(spy), 'INVALID_INPUT', '$')
  assert.equal(reads, 0)
})
