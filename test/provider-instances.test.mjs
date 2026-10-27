import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  PROVIDER_INSTANCES_SCHEMA_VERSION,
  PROVIDER_INSTANCE_ERRORS,
  buildProviderInstanceView,
  negotiateProviderInstance,
} from '../core/audio/provider-instances.mjs'
import { PROVIDER_ERRORS, PROVIDER_KINDS, normalizeProviderManifest } from '../core/tts/provider-contract.mjs'
import { getRegistryView, selectProviderCandidate } from '../core/tts/provider-registry.mjs'
import { getSvcRegistryView, selectSvcCandidate } from '../core/svc/svc-registry.mjs'

const ERR = PROVIDER_INSTANCE_ERRORS

function baseManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'qwen3-tts',
    name: 'Fixture Local TTS',
    kind: PROVIDER_KINDS.LOCAL,
    version: { value: '1.0.0', source: 'fixture', audited: true },
    capabilities: {
      languages: ['zh-CN'],
      voices: [
        { id: 'voice-a', name: 'Voice A', kind: 'preset', languages: ['zh-CN'], referenceAudioRequired: false },
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
  return baseManifest({
    id: 'azure-speech',
    name: 'Fixture Cloud TTS',
    kind: PROVIDER_KINDS.CLOUD,
    capabilities: {
      ...baseManifest().capabilities,
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
  })
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

function piperInstance(overrides = {}) {
  return ttsInstance({ instanceId: 'instance:piper', candidateId: 'piper', manifest: baseManifest({ id: 'piper', name: 'Fixture Piper' }), ...overrides })
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

function seedVcInstance(overrides = {}) {
  return rvcInstance({ instanceId: 'instance:seed', candidateId: 'seed-vc', ...overrides })
}

function viewInput(instances) {
  return { schemaVersion: 1, instances }
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
  return ttsRequest({ voiceId: 'voice-cloud', language: 'en-US', format: 'audio/mp3', ...overrides })
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

function negotiationInput(instances, selection, request, consentOverrides = {}) {
  return {
    schemaVersion: 1,
    registry: viewInput(instances),
    selection,
    consent: consent(consentOverrides),
    request,
  }
}

function expectError(result, key, path) {
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, ERR[key])
  if (path !== undefined) assert.equal(result.errors[0].path, path)
  return result
}

const NEW_REASON_KEYS = new Set([
  'NOT_IMPLEMENTED',
  'VERSION_UNKNOWN',
  'CREDENTIALS_MISSING',
  'CREDENTIALS_UNKNOWN',
  'HEALTH_UNKNOWN',
  'TIMEOUT',
  'OFFLINE',
  'DEGRADED',
  'INSTANCE_UNKNOWN',
  'CATEGORY_MISMATCH',
  'INVALID_REQUEST',
  'MODEL_NOT_AVAILABLE',
  'COST_NOT_CONFIRMED',
])

function expectBlocked(result, reason) {
  const expected = NEW_REASON_KEYS.has(reason) ? ERR[reason] : reason
  assert.equal(result.ok, true)
  assert.equal(result.value.decision, 'BLOCKED')
  assert.equal(result.value.reason, expected)
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  return result
}

function expectCompatible(result, candidateId) {
  assert.equal(result.ok, true)
  assert.equal(result.value.decision, 'FIXTURE_COMPATIBLE')
  assert.equal(result.value.reason, null)
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  if (candidateId !== undefined) assert.equal(result.value.candidateId, candidateId)
  return result
}

const PATH_WHITELIST = new Set(['$', 'schemaVersion', 'instances', 'instance', 'manifest', 'observation', 'registry', 'selection', 'consent', 'request', '<unknown-key>'])

test('R01 empty instances produces an empty fixture view', () => {
  const result = buildProviderInstanceView(viewInput([]))
  assert.equal(result.ok, true)
  assert.equal(result.value.schemaVersion, PROVIDER_INSTANCES_SCHEMA_VERSION)
  assert.equal(result.value.mode, 'FIXTURE_ONLY')
  assert.deepEqual(result.value.instances, [])
  assert.deepEqual(result.value.realSelectable, [])
  assert.equal(result.value.defaultInstanceId, null)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.candidates.tts.status, 'DESIGN_ONLY')
  assert.equal(result.value.candidates.svc.status, 'DESIGN_ONLY')
})

test('R02 one valid TTS fixture becomes FIXTURE_AVAILABLE only in the new layer', () => {
  const result = buildProviderInstanceView(viewInput([ttsInstance()]))
  assert.equal(result.ok, true)
  assert.equal(result.value.instances.length, 1)
  const item = result.value.instances[0]
  assert.deepEqual(Object.keys(item).sort(), [
    'adapter', 'candidateId', 'category', 'fixtureSelectable', 'instanceId', 'kind', 'mockOnly', 'observedAt', 'realOperationAllowed', 'reason', 'status',
  ])
  assert.equal(item.status, 'FIXTURE_AVAILABLE')
  assert.equal(item.reason, null)
  assert.equal(item.fixtureSelectable, true)
  assert.equal(item.adapter, 'TTS_CONTRACT_FIXTURE')
  assert.equal(item.kind, PROVIDER_KINDS.LOCAL)
  assert.equal(item.mockOnly, true)
  assert.equal(item.realOperationAllowed, false)
  assert.deepEqual(result.value.realSelectable, [])
  assert.equal(result.value.defaultInstanceId, null)
})

test('R03 qwen-local alias normalizes to qwen3-tts without a default', () => {
  const result = buildProviderInstanceView(viewInput([ttsInstance({ candidateId: 'qwen-local' })]))
  assert.equal(result.ok, true)
  assert.equal(result.value.instances[0].candidateId, 'qwen3-tts')
  assert.equal(result.value.defaultInstanceId, null)
  assert.equal(result.value.instances[0].fixtureSelectable, true)
})

test('R04 two instance ids may share one candidate and keep input order', () => {
  const result = buildProviderInstanceView(
    viewInput([ttsInstance({ instanceId: 'instance:one' }), ttsInstance({ instanceId: 'instance:two' })]),
  )
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.instances.map((item) => item.instanceId), ['instance:one', 'instance:two'])
  assert.ok(result.value.instances.every((item) => item.candidateId === 'qwen3-tts'))
})

test('R05 duplicate instance id across categories is rejected immediately', () => {
  const result = buildProviderInstanceView(
    viewInput([ttsInstance({ instanceId: 'instance:same' }), rvcInstance({ instanceId: 'instance:same' })]),
  )
  expectError(result, 'DUPLICATE_INSTANCE', 'instance')
})

test('R06 unknown candidate and cross-category candidate are distinguished', () => {
  expectError(buildProviderInstanceView(viewInput([ttsInstance({ candidateId: 'rvc', manifest: null })])), 'INVALID_INSTANCE', 'instance')
  expectError(buildProviderInstanceView(viewInput([rvcInstance({ candidateId: 'qwen3-tts' })])), 'INVALID_INSTANCE', 'instance')
  expectError(buildProviderInstanceView(viewInput([ttsInstance({ candidateId: 'nope' })])), 'UNKNOWN_CANDIDATE', 'instance')
})

test('R07 fixture=false is a forbidden real operation', () => {
  const result = buildProviderInstanceView(viewInput([ttsInstance({ fixture: false })]))
  expectError(result, 'REAL_OPERATION_FORBIDDEN', 'instance')
})

test('R08 version conditions dominate healthy observations', () => {
  const protocol = buildProviderInstanceView(viewInput([ttsInstance({ protocolVersion: 2 })]))
  assert.equal(protocol.value.instances[0].status, 'VERSION_UNKNOWN')
  assert.equal(protocol.value.instances[0].fixtureSelectable, false)

  for (const versionMatches of [false, null]) {
    const result = buildProviderInstanceView(viewInput([ttsInstance({ observation: obs({ versionMatches }) })]))
    assert.equal(result.value.instances[0].status, 'VERSION_UNKNOWN')
    assert.equal(result.value.instances[0].reason, ERR.VERSION_UNKNOWN)
  }

  const unaudited = buildProviderInstanceView(
    viewInput([ttsInstance({ manifest: baseManifest({ version: { value: '1.0.0', source: 'fixture', audited: false } }) })]),
  )
  assert.equal(unaudited.value.instances[0].status, 'VERSION_UNKNOWN')

  const negotiated = negotiateProviderInstance(
    negotiationInput([ttsInstance({ protocolVersion: 2 })], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
  )
  expectBlocked(negotiated, 'VERSION_UNKNOWN')
})

test('R09 required credential states are separated and not_required cannot masquerade', () => {
  const missing = buildProviderInstanceView(viewInput([cloudInstance({ observation: obs({ credentials: 'missing' }) })]))
  assert.equal(missing.value.instances[0].status, 'CREDENTIALS_MISSING')
  assert.equal(missing.value.instances[0].reason, ERR.CREDENTIALS_MISSING)

  const unknown = buildProviderInstanceView(viewInput([cloudInstance({ observation: obs({ credentials: 'unknown' }) })]))
  assert.equal(unknown.value.instances[0].status, 'UNKNOWN')
  assert.equal(unknown.value.instances[0].reason, ERR.CREDENTIALS_UNKNOWN)

  const fakeNotRequired = buildProviderInstanceView(viewInput([cloudInstance({ observation: obs() })]))
  expectError(fakeNotRequired, 'INVALID_INSTANCE', 'instance')
})

test('R10 optional credentials cannot be reported as present', () => {
  const result = buildProviderInstanceView(viewInput([ttsInstance({ observation: obs({ credentials: 'present' }) })]))
  expectError(result, 'INVALID_INSTANCE', 'instance')
})

test('R11 timeout, unknown, offline and degraded map to fixed statuses', () => {
  const cases = [
    ['timeout', 'UNKNOWN', 'TIMEOUT'],
    ['unknown', 'UNKNOWN', 'HEALTH_UNKNOWN'],
    ['offline', 'OFFLINE', 'OFFLINE'],
    ['degraded', 'DEGRADED', 'DEGRADED'],
  ]
  for (const [state, status, reason] of cases) {
    const result = buildProviderInstanceView(viewInput([ttsInstance({ observation: obs({ state }) })]))
    assert.equal(result.value.instances[0].status, status, state)
    assert.equal(result.value.instances[0].reason, ERR[reason], state)
    assert.equal(result.value.instances[0].fixtureSelectable, false)
  }
})

test('R12 an offline Qwen instance does not block an independent TTS fixture', () => {
  const qwen = ttsInstance({ instanceId: 'instance:qwen', observation: obs({ state: 'offline' }) })
  const piper = piperInstance()
  const view = buildProviderInstanceView(viewInput([qwen, piper]))
  assert.equal(view.ok, true)
  assert.equal(view.value.instances[0].status, 'OFFLINE')
  assert.equal(view.value.instances[1].status, 'FIXTURE_AVAILABLE')

  const qwenResult = negotiateProviderInstance(
    negotiationInput([qwen, piper], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
  )
  expectBlocked(qwenResult, 'OFFLINE')

  const piperResult = negotiateProviderInstance(
    negotiationInput([qwen, piper], { category: 'TTS', instanceId: 'instance:piper' }, ttsRequest()),
  )
  expectCompatible(piperResult, 'piper')
})

test('R13 selection is explicit and never falls back', () => {
  const instances = [ttsInstance()]
  expectError(
    negotiateProviderInstance(negotiationInput(instances, { instanceId: 'instance:qwen' }, ttsRequest())),
    'INVALID_INPUT',
    'selection',
  )
  const unknown = negotiateProviderInstance(
    negotiationInput(instances, { category: 'TTS', instanceId: 'instance:nope' }, ttsRequest()),
  )
  expectBlocked(unknown, 'INSTANCE_UNKNOWN')
  assert.equal(unknown.value.candidateId, null)

  const mismatch = negotiateProviderInstance(
    negotiationInput(instances, { category: 'SVC', instanceId: 'instance:qwen' }, rvcRequest()),
  )
  expectBlocked(mismatch, 'CATEGORY_MISMATCH')
  assert.equal(mismatch.value.candidateId, 'qwen3-tts')
})

test('R14 a legal TTS request becomes FIXTURE_COMPATIBLE without leaking request data', () => {
  const result = negotiateProviderInstance(
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ text: 'PRIVATE_TEXT_14' })),
  )
  expectCompatible(result, 'qwen3-tts')
  assert.equal(Object.keys(result.value).length, 11)
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('PRIVATE_TEXT_14'), false)
  assert.equal(encoded.includes('manifest'), false)
  assert.equal(encoded.includes('fixture only'), false)
  assert.equal(result.value.messageZh.length > 0, true)
})

test('R15 unsupported voice, language and emotion each block without dropping parameters', () => {
  const instances = [ttsInstance()]
  for (const [overrides, reason] of [
    [{ voiceId: 'voice-x' }, 'UNSUPPORTED_VOICE'],
    [{ language: 'en-US' }, 'UNSUPPORTED_LANGUAGE'],
    [{ emotion: 'happy' }, 'UNSUPPORTED_EMOTION'],
  ]) {
    const result = negotiateProviderInstance(
      negotiationInput(instances, { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest(overrides)),
    )
    expectBlocked(result, reason)
  }
})

test('R16 unsupported streaming/format, empty text and over-limit text block', () => {
  const instances = [ttsInstance()]
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ streaming: true }))),
    'UNSUPPORTED_STREAMING',
  )
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ format: 'audio/mp3' }))),
    'UNSUPPORTED_FORMAT',
  )
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ text: '' }))),
    'INVALID_REQUEST',
  )
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ text: 'x'.repeat(101) }))),
    'INVALID_RESPONSE',
  )
})

test('R17 cloud consent gates run before existing capability checks', () => {
  const instances = [cloudInstance()]
  const selection = { category: 'TTS', instanceId: 'instance:cloud' }
  expectBlocked(negotiateProviderInstance(negotiationInput(instances, selection, cloudRequest(), {})), 'NETWORK_REQUIRED')
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, selection, cloudRequest(), { networkAllowed: true })),
    'TEXT_UPLOAD_NOT_CONFIRMED',
  )
  expectBlocked(
    negotiateProviderInstance(
      negotiationInput(instances, selection, cloudRequest(), { networkAllowed: true, textUploadAllowed: true }),
    ),
    'COST_NOT_CONFIRMED',
  )
  const compatible = negotiateProviderInstance(
    negotiationInput(instances, selection, cloudRequest(), {
      networkAllowed: true,
      textUploadAllowed: true,
      paidAllowed: true,
    }),
  )
  expectCompatible(compatible, 'azure-speech')
  const encoded = JSON.stringify(compatible)
  assert.equal(encoded.includes('textLeavesDevice'), false)
  assert.equal(encoded.includes('paid'), false)
})

test('R18 a legal RVC fixture A request is compatible and does not simulate conversion', () => {
  const result = negotiateProviderInstance(
    negotiationInput([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest()),
  )
  expectCompatible(result, 'rvc')
  assert.equal(result.value.category, 'SVC')
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('artifact:'), false)
  assert.equal(encoded.includes('SUCCEEDED_FAKE'), false)
})

test('R19 RVC fixture B is MODEL_NOT_AVAILABLE and never falls back to A', () => {
  const result = negotiateProviderInstance(
    negotiationInput([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest({ targetModelId: 'rvc-model:fixture-b' })),
  )
  expectBlocked(result, 'MODEL_NOT_AVAILABLE')
})

test('R20 seed-vc stays NOT_IMPLEMENTED and cannot negotiate', () => {
  const view = buildProviderInstanceView(viewInput([seedVcInstance()]))
  assert.equal(view.value.instances[0].status, 'NOT_IMPLEMENTED')
  assert.equal(view.value.instances[0].adapter, null)
  assert.equal(view.value.instances[0].fixtureSelectable, false)
  const result = negotiateProviderInstance(
    negotiationInput([seedVcInstance()], { category: 'SVC', instanceId: 'instance:seed' }, rvcRequest()),
  )
  expectBlocked(result, 'NOT_IMPLEMENTED')
})

test('R21 invalid Fake model, pitch, rights and metadata are rejected without clamping', () => {
  const instances = [rvcInstance()]
  const selection = { category: 'SVC', instanceId: 'instance:rvc' }
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, selection, rvcRequest({ targetModelId: 'rvc-model:other' }))),
    'MODEL_NOT_AVAILABLE',
  )
  for (const overrides of [
    { pitchShift: 13 },
    { pitchShift: 0.5 },
    { rights: { state: 'UNVERIFIED' } },
    { inputAudio: { durationMs: 0, byteLength: 1000, sampleRate: 44100, channels: 1 } },
  ]) {
    expectBlocked(negotiateProviderInstance(negotiationInput(instances, selection, rvcRequest(overrides))), 'INVALID_REQUEST')
  }
})

test('R22 structural and schema errors use the fixed envelope without defaults', () => {
  const extraTop = viewInput([])
  extraTop.extra = 1
  expectError(buildProviderInstanceView(extraTop), 'INVALID_INPUT', '<unknown-key>')
  expectError(buildProviderInstanceView({ schemaVersion: 2, instances: [] }), 'UNSUPPORTED_VERSION', 'schemaVersion')
  expectError(buildProviderInstanceView({ instances: [] }), 'INVALID_INPUT', 'schemaVersion')
  expectError(buildProviderInstanceView({ schemaVersion: 1, instances: {} }), 'INVALID_INPUT', 'instances')

  const missingObservation = ttsInstance()
  delete missingObservation.observation
  expectError(buildProviderInstanceView(viewInput([missingObservation])), 'INVALID_INSTANCE', 'instance')

  const badObservation = ttsInstance({ observation: obs({ state: 'weird' }) })
  expectError(buildProviderInstanceView(viewInput([badObservation])), 'INVALID_INSTANCE', 'instance')

  const selectionExtra = { category: 'TTS', instanceId: 'instance:qwen', extra: 1 }
  expectError(
    negotiateProviderInstance(negotiationInput([ttsInstance()], selectionExtra, ttsRequest())),
    'INVALID_INPUT',
    '<unknown-key>',
  )

  const consentMissing = { networkAllowed: false, textUploadAllowed: false }
  const consentInput = negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest())
  consentInput.consent = consentMissing
  expectError(negotiateProviderInstance(consentInput), 'INVALID_INPUT', 'consent')

  const requestExtra = negotiateProviderInstance(
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ extra: 1 })),
  )
  expectBlocked(requestExtra, 'INVALID_REQUEST')

  const missingRequest = negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest())
  delete missingRequest.request
  expectError(negotiateProviderInstance(missingRequest), 'INVALID_INPUT', 'request')
})

test('R23 manifest id/kind mismatches and SVC manifests are rejected', () => {
  expectError(
    buildProviderInstanceView(viewInput([ttsInstance({ manifest: baseManifest({ id: 'piper' }) })])),
    'INVALID_INSTANCE',
    'instance',
  )
  expectError(
    buildProviderInstanceView(viewInput([ttsInstance({ manifest: baseManifest({ kind: PROVIDER_KINDS.CLOUD }) })])),
    'INVALID_INSTANCE',
    'instance',
  )
  expectError(
    buildProviderInstanceView(viewInput([rvcInstance({ manifest: baseManifest() })])),
    'INVALID_INSTANCE',
    'instance',
  )
})

test('R24 getters, setters, Symbols, hidden keys and custom prototypes are rejected without invocation', () => {
  let calls = 0
  const getterRoot = viewInput([])
  Object.defineProperty(getterRoot, 'instances', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1
      return []
    },
  })
  expectError(buildProviderInstanceView(getterRoot), 'INVALID_INPUT', '$')
  assert.equal(calls, 0)

  const getterInstance = ttsInstance()
  Object.defineProperty(getterInstance, 'candidateId', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1
      return 'qwen3-tts'
    },
  })
  expectError(buildProviderInstanceView(viewInput([getterInstance])), 'INVALID_INPUT', '$')
  assert.equal(calls, 0)

  const symbolInstance = ttsInstance()
  symbolInstance[Symbol('marker')] = 'x'
  expectError(buildProviderInstanceView(viewInput([symbolInstance])), 'INVALID_INPUT', '$')

  const hiddenInstance = ttsInstance()
  Object.defineProperty(hiddenInstance, 'hidden', { value: 'x', enumerable: false, configurable: true })
  expectError(buildProviderInstanceView(viewInput([hiddenInstance])), 'INVALID_INPUT', '$')

  const customProto = Object.assign(Object.create({}), ttsInstance())
  expectError(buildProviderInstanceView(viewInput([customProto])), 'INVALID_INPUT', '$')
  assert.equal(calls, 0)
})

test('R25 holes, array extras, cycles, depth and size limits fail finitely', () => {
  const hole = []
  hole[0] = ttsInstance()
  hole[2] = ttsInstance()
  expectError(buildProviderInstanceView({ schemaVersion: 1, instances: hole }), 'INVALID_INPUT', '$')

  const extraArray = [ttsInstance()]
  extraArray.extra = 1
  expectError(buildProviderInstanceView({ schemaVersion: 1, instances: extraArray }), 'INVALID_INPUT', '$')

  const cycle = ttsInstance()
  cycle.observation.self = cycle.observation
  expectError(buildProviderInstanceView(viewInput([cycle])), 'INVALID_INPUT', '$')

  const thirtyThree = ttsInstance()
  for (let index = 0; index < 30; index += 1) thirtyThree.observation['extra' + index] = index
  expectError(buildProviderInstanceView(viewInput([thirtyThree])), 'RESOURCE_LIMIT', '$')

  const tooMany = viewInput([])
  tooMany.instances = new Array(257).fill(ttsInstance())
  expectError(buildProviderInstanceView(tooMany), 'RESOURCE_LIMIT', '$')

  const longString = viewInput([ttsInstance({ instanceId: 'instance:' + 'a'.repeat(8200) })])
  expectError(buildProviderInstanceView(longString), 'RESOURCE_LIMIT', '$')

  let deep = { value: 'x' }
  for (let index = 0; index < 20; index += 1) deep = { nested: deep }
  expectError(buildProviderInstanceView(viewInput([ttsInstance({ observation: deep })])), 'RESOURCE_LIMIT', '$')

  const tooManyValues = viewInput([])
  tooManyValues.extra = new Array(200).fill(0).map(() => new Array(30).fill(1))
  expectError(buildProviderInstanceView(tooManyValues), 'RESOURCE_LIMIT', '$')
})

test('R26 null prototypes and frozen inputs are accepted; throwing Proxy is a fixed error', () => {
  const nullProto = Object.assign(Object.create(null), viewInput([ttsInstance()]))
  const accepted = buildProviderInstanceView(nullProto)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.value.instances[0].status, 'FIXTURE_AVAILABLE')

  const frozen = Object.freeze(viewInput([Object.freeze(ttsInstance())]))
  assert.equal(buildProviderInstanceView(frozen).ok, true)

  const marker = 'PROXY_MARKER_26'
  const proxy = new Proxy({}, {
    ownKeys() {
      throw new Error(marker)
    },
  })
  const result = buildProviderInstanceView(proxy)
  expectError(result, 'INVALID_INPUT', '$')
  assert.equal(JSON.stringify(result).includes(marker), false)
})

test('R27 errors never echo private keys, values, exception text or stack text', () => {
  const keyMarker = 'PRIVATE_KEY_MARKER_27'
  const valueMarker = 'PRIVATE_VALUE_MARKER_27'
  const errorMarker = 'PRIVATE_ERROR_MARKER_27'

  const input = viewInput([])
  input[keyMarker] = valueMarker
  const result = buildProviderInstanceView(input)
  expectError(result, 'INVALID_INPUT', '<unknown-key>')
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes(keyMarker), false)
  assert.equal(encoded.includes(valueMarker), false)
  assert.equal(encoded.includes('stack'), false)

  const getter = ttsInstance()
  Object.defineProperty(getter, 'manifest', {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error(errorMarker)
    },
  })
  const thrown = buildProviderInstanceView(viewInput([getter]))
  expectError(thrown, 'INVALID_INPUT', '$')
  assert.equal(JSON.stringify(thrown).includes(errorMarker), false)

  for (const error of [result, thrown]) {
    assert.ok(PATH_WHITELIST.has(error.errors[0].path))
    assert.equal(typeof error.errors[0].reason, 'string')
  }
})

test('R28 outputs are deterministic, frozen, fresh and never mutate the input', () => {
  const input = viewInput([ttsInstance()])
  const snapshot = JSON.stringify(input)
  const first = buildProviderInstanceView(input)
  const second = buildProviderInstanceView(input)
  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(input), snapshot)

  assert.equal(Object.isFrozen(first.value), true)
  assert.equal(Object.isFrozen(first.value.instances), true)
  assert.equal(Object.isFrozen(first.value.instances[0]), true)
  assert.equal(Object.isFrozen(first.value.candidates), true)

  buildProviderInstanceView(viewInput([piperInstance()]))
  const third = buildProviderInstanceView(input)
  assert.deepEqual(first, third)

  const negotiated = negotiateProviderInstance(
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
  )
  assert.equal(Object.isFrozen(negotiated.value), true)
})

test('R29 the original catalogues and selectors are unchanged', () => {
  const ttsBefore = JSON.stringify(getRegistryView())
  const svcBefore = JSON.stringify(getSvcRegistryView())
  buildProviderInstanceView(viewInput([ttsInstance(), rvcInstance()]))
  assert.equal(JSON.stringify(getRegistryView()), ttsBefore)
  assert.equal(JSON.stringify(getSvcRegistryView()), svcBefore)
  assert.deepEqual(getRegistryView().selectable, [])
  assert.deepEqual(getSvcRegistryView().selectable, [])
  assert.equal(selectProviderCandidate('piper').code, 'NOT_IMPLEMENTED')
  assert.equal(selectSvcCandidate('rvc').code, 'NOT_IMPLEMENTED')
  assert.equal(getRegistryView().defaultProviderId, null)
  assert.equal(getSvcRegistryView().defaultVoiceId, null)
})

test('R30 every negotiation result stays non-operational and the module has no side effects', async () => {
  const inputs = [
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
    negotiationInput([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest()),
    negotiationInput([seedVcInstance()], { category: 'SVC', instanceId: 'instance:seed' }, rvcRequest()),
  ]
  for (const input of inputs) {
    const result = negotiateProviderInstance(input)
    assert.equal(result.ok, true)
    assert.equal(result.value.realOperationAllowed, false)
    assert.equal(result.value.submitAllowed, false)
    assert.equal(result.value.automaticRetryAllowed, false)
    assert.equal(result.value.mockOnly, true)
    const encoded = JSON.stringify(result)
    assert.equal(encoded.includes('artifactRef'), false)
    assert.equal(encoded.includes('SUCCEEDED_FAKE'), false)
  }

  const source = await readFile(new URL('../core/audio/provider-instances.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(|process\.|Date\.now|Math\.random|setTimeout/)
  assert.doesNotMatch(source, /simulateRvcFakeConversion|normalizeSvcResult|normalizeSynthesisResult|transitionAudioTask/)
})

// ---------------------------------------------------------------------------
// N01–N18: Plan06-B-F01 review repairs.
// ---------------------------------------------------------------------------

function brokenManifest(mutator) {
  const manifest = baseManifest()
  mutator(manifest)
  return manifest
}

function buildBroken(manifest) {
  return buildProviderInstanceView(viewInput([ttsInstance({ manifest })]))
}

function negotiateBroken(manifest) {
  return negotiateProviderInstance(
    negotiationInput([ttsInstance({ manifest })], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
  )
}

test('N01 malformed clone/formats is rejected instead of becoming a usable instance', () => {
  const manifest = brokenManifest((value) => {
    value.capabilities.clone = null
    value.capabilities.formats = null
  })
  const result = buildBroken(manifest)
  expectError(result, 'INVALID_INSTANCE', 'instance')
  assert.equal(JSON.stringify(result).includes('FIXTURE_AVAILABLE'), false)
})

test('N02 negotiating the same malformed manifest fails closed without throwing', () => {
  const manifest = brokenManifest((value) => {
    value.capabilities.clone = null
    value.capabilities.formats = null
  })
  let result
  assert.doesNotThrow(() => {
    result = negotiateBroken(manifest)
  })
  expectError(result, 'INVALID_INSTANCE', 'instance')
})

test('N03 malformed clone/limits is rejected by both entries', () => {
  const manifest = brokenManifest((value) => {
    value.capabilities.clone = null
    value.capabilities.limits = { maxChars: {}, timeoutMs: 5000, maxAudioSeconds: 30 }
  })
  expectError(buildBroken(manifest), 'INVALID_INSTANCE', 'instance')
  expectError(negotiateBroken(manifest), 'INVALID_INSTANCE', 'instance')
})

test('N04 clone=null alone is still rejected, not only the formats crash path', () => {
  const manifest = brokenManifest((value) => {
    value.capabilities.clone = null
  })
  expectError(buildBroken(manifest), 'INVALID_INSTANCE', 'instance')
  expectError(negotiateBroken(manifest), 'INVALID_INSTANCE', 'instance')
})

test('N05 selection ids use the registration regex exactly', () => {
  const ids = [
    'https://fixture.invalid/PRIVATE_MARKER_05',
    '/absolute/path',
    '   ',
    'instance:\n',
    'missingprefix',
    'instance:' + 'a'.repeat(65),
  ]
  for (const instanceId of ids) {
    const result = negotiateProviderInstance(
      negotiationInput([ttsInstance()], { category: 'TTS', instanceId }, ttsRequest()),
    )
    expectError(result, 'INVALID_INPUT', 'selection')
  }
})

test('N06 a private marker in an invalid selection is never echoed', () => {
  const marker = 'PRIVATE_SELECTION_MARKER_06'
  const result = negotiateProviderInstance(
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'https://fixture.invalid/' + marker }, ttsRequest()),
  )
  expectError(result, 'INVALID_INPUT', 'selection')
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes(marker), false)
  assert.equal(encoded.includes('https://'), false)
})

test('N07 a valid but missing instance id stays a legal BLOCKED/INSTANCE_UNKNOWN', () => {
  const result = negotiateProviderInstance(
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:missing' }, ttsRequest()),
  )
  expectBlocked(result, 'INSTANCE_UNKNOWN')
  assert.equal(result.value.reason, ERR.INSTANCE_UNKNOWN)
  assert.equal(result.value.candidateId, null)
})

test('N08 registration and selection share the same 1..64 character boundary', () => {
  const suffix64 = 'a'.repeat(64)
  const suffix65 = 'a'.repeat(65)
  const boundary = buildProviderInstanceView(viewInput([ttsInstance({ instanceId: 'instance:' + suffix64 })]))
  assert.equal(boundary.ok, true)
  expectError(
    buildProviderInstanceView(viewInput([ttsInstance({ instanceId: 'instance:' + suffix65 })])),
    'INVALID_INSTANCE',
    'instance',
  )
  expectBlocked(
    negotiateProviderInstance(
      negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:' + suffix64 }, ttsRequest()),
    ),
    'INSTANCE_UNKNOWN',
  )
  expectError(
    negotiateProviderInstance(
      negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:' + suffix65 }, ttsRequest()),
    ),
    'INVALID_INPUT',
    'selection',
  )
})

test('N09 all view reasons use the exported enum values, while status words stay unchanged', () => {
  const view = buildProviderInstanceView(
    viewInput([
      ttsInstance({ instanceId: 'instance:version', protocolVersion: 2 }),
      ttsInstance({ instanceId: 'instance:offline', observation: obs({ state: 'offline' }) }),
      seedVcInstance(),
      ttsInstance({ instanceId: 'instance:available' }),
    ]),
  )
  assert.equal(view.ok, true)
  const statuses = new Set(['FIXTURE_AVAILABLE', 'NOT_IMPLEMENTED', 'VERSION_UNKNOWN', 'UNKNOWN', 'OFFLINE', 'DEGRADED', 'CREDENTIALS_MISSING'])
  const reasons = new Set(Object.values(ERR))
  for (const item of view.value.instances) {
    assert.ok(statuses.has(item.status), item.status)
    if (item.reason !== null) assert.ok(reasons.has(item.reason), item.reason)
  }
})

test('N10 the blocked reason matches the view reason and keeps the fixed Chinese message', () => {
  const offline = ttsInstance({ observation: obs({ state: 'offline' }) })
  const view = buildProviderInstanceView(viewInput([offline]))
  const result = negotiateProviderInstance(
    negotiationInput([offline], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
  )
  expectBlocked(result, 'OFFLINE')
  assert.equal(result.value.reason, view.value.instances[0].reason)
  assert.match(result.value.messageZh, /不会自动重试/)
})

test('N11 selection, model, request and cost reasons use the new namespace', () => {
  const instances = [ttsInstance(), rvcInstance(), cloudInstance()]
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, { category: 'TTS', instanceId: 'instance:none' }, ttsRequest())),
    'INSTANCE_UNKNOWN',
  )
  expectBlocked(
    negotiateProviderInstance(negotiationInput(instances, { category: 'SVC', instanceId: 'instance:qwen' }, rvcRequest())),
    'CATEGORY_MISMATCH',
  )
  expectBlocked(
    negotiateProviderInstance(
      negotiationInput(instances, { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest({ targetModelId: 'rvc-model:fixture-b' })),
    ),
    'MODEL_NOT_AVAILABLE',
  )
  expectBlocked(
    negotiateProviderInstance(
      negotiationInput(instances, { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest({ targetModelId: 'rvc-model:other' })),
    ),
    'MODEL_NOT_AVAILABLE',
  )
  expectBlocked(
    negotiateProviderInstance(
      negotiationInput(instances, { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest({ extra: 1 })),
    ),
    'INVALID_REQUEST',
  )
  expectBlocked(
    negotiateProviderInstance(
      negotiationInput(
        instances,
        { category: 'TTS', instanceId: 'instance:cloud' },
        cloudRequest(),
        { networkAllowed: true, textUploadAllowed: true, paidAllowed: false },
      ),
    ),
    'COST_NOT_CONFIRMED',
  )
})

test('N12 existing TTS capability codes keep their original provider namespace', () => {
  const instances = [ttsInstance()]
  const selection = { category: 'TTS', instanceId: 'instance:qwen' }
  const cases = [
    [{ voiceId: 'voice-x' }, PROVIDER_ERRORS.UNSUPPORTED_VOICE],
    [{ language: 'en-US' }, PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE],
    [{ emotion: 'happy' }, PROVIDER_ERRORS.UNSUPPORTED_EMOTION],
    [{ streaming: true }, PROVIDER_ERRORS.UNSUPPORTED_STREAMING],
    [{ format: 'audio/mp3' }, PROVIDER_ERRORS.UNSUPPORTED_FORMAT],
    [{ text: 'x'.repeat(101) }, PROVIDER_ERRORS.INVALID_RESPONSE],
  ]
  for (const [overrides, reason] of cases) {
    const result = negotiateProviderInstance(negotiationInput(instances, selection, ttsRequest(overrides)))
    assert.equal(result.value.reason, reason)
    assert.equal(result.value.reason.startsWith('PROVIDER_INSTANCE_'), false)
  }
})

test('N13 network/upload keep provider codes, cost uses the new enum, priority unchanged', () => {
  const instances = [cloudInstance()]
  const selection = { category: 'TTS', instanceId: 'instance:cloud' }
  assert.equal(
    negotiateProviderInstance(negotiationInput(instances, selection, cloudRequest(), {})).value.reason,
    PROVIDER_ERRORS.NETWORK_REQUIRED,
  )
  assert.equal(
    negotiateProviderInstance(
      negotiationInput(instances, selection, cloudRequest(), { networkAllowed: true }),
    ).value.reason,
    PROVIDER_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED,
  )
  const cost = negotiateProviderInstance(
    negotiationInput(instances, selection, cloudRequest(), { networkAllowed: true, textUploadAllowed: true }),
  )
  expectBlocked(cost, 'COST_NOT_CONFIRMED')
  assert.equal(cost.value.reason, ERR.COST_NOT_CONFIRMED)
})

test('N14 non-integer non-1 schema versions are UNSUPPORTED_VERSION in all three positions', () => {
  const variants = ['1', null, true, 0, 2, 1.5, [], {}]
  for (const schemaVersion of variants) {
    const buildResult = buildProviderInstanceView({ schemaVersion, instances: [] })
    assert.equal(buildResult.ok, false)
    assert.equal(buildResult.errors[0].code, ERR.UNSUPPORTED_VERSION)
    assert.equal(buildResult.errors[0].path, 'schemaVersion')

    const negotiateTop = negotiationInput([], { category: 'TTS', instanceId: 'instance:x' }, ttsRequest())
    negotiateTop.schemaVersion = schemaVersion
    assert.equal(negotiateProviderInstance(negotiateTop).errors[0].code, ERR.UNSUPPORTED_VERSION)

    const negotiateRegistry = negotiationInput([], { category: 'TTS', instanceId: 'instance:x' }, ttsRequest())
    negotiateRegistry.registry.schemaVersion = schemaVersion
    assert.equal(negotiateProviderInstance(negotiateRegistry).errors[0].code, ERR.UNSUPPORTED_VERSION)
  }
})

test('N15 missing schema versions stay INVALID_INPUT and unsafe-copy values still fail structurally', () => {
  expectError(buildProviderInstanceView({ instances: [] }), 'INVALID_INPUT', 'schemaVersion')

  const negotiateTop = negotiationInput([], { category: 'TTS', instanceId: 'instance:x' }, ttsRequest())
  delete negotiateTop.schemaVersion
  expectError(negotiateProviderInstance(negotiateTop), 'INVALID_INPUT', 'schemaVersion')

  const negotiateRegistry = negotiationInput([], { category: 'TTS', instanceId: 'instance:x' }, ttsRequest())
  delete negotiateRegistry.registry.schemaVersion
  expectError(negotiateProviderInstance(negotiateRegistry), 'INVALID_INPUT', 'schemaVersion')

  expectError(buildProviderInstanceView({ schemaVersion: undefined, instances: [] }), 'INVALID_INPUT', '$')
  expectError(buildProviderInstanceView({ schemaVersion: () => 1, instances: [] }), 'INVALID_INPUT', '$')

  assert.equal(buildProviderInstanceView({ schemaVersion: 1, instances: [] }).ok, true)
})

test('N16 instance protocolVersion semantics are unchanged', () => {
  const view = buildProviderInstanceView(viewInput([ttsInstance({ instanceId: 'instance:v2', protocolVersion: 2 })]))
  assert.equal(view.value.instances[0].status, 'VERSION_UNKNOWN')
  assert.equal(view.value.instances[0].reason, ERR.VERSION_UNKNOWN)
  expectError(
    buildProviderInstanceView(viewInput([ttsInstance({ instanceId: 'instance:bad', protocolVersion: '1' })])),
    'INVALID_INSTANCE',
    'instance',
  )
  expectError(
    buildProviderInstanceView(viewInput([ttsInstance({ instanceId: 'instance:bad', protocolVersion: 0 })])),
    'INVALID_INSTANCE',
    'instance',
  )
})

test('N17 repair paths never invoke getters, mutate input or leak markers', () => {
  let calls = 0
  const getterManifest = baseManifest()
  Object.defineProperty(getterManifest.capabilities, 'clone', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1
      return null
    },
  })
  const result = buildProviderInstanceView(viewInput([ttsInstance({ manifest: getterManifest })]))
  expectError(result, 'INVALID_INPUT', '$')
  assert.equal(calls, 0)

  const input = viewInput([ttsInstance()])
  const snapshot = JSON.stringify(input)
  buildProviderInstanceView(input)
  negotiateProviderInstance(negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()))
  assert.equal(JSON.stringify(input), snapshot)

  const marker = 'PRIVATE_REPAIR_MARKER_17'
  const marked = negotiateProviderInstance(
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'https://x/' + marker }, ttsRequest()),
  )
  assert.equal(JSON.stringify(marked).includes(marker), false)
})

test('N18 normal TTS and RVC demonstrations still match with all safety flags false', () => {
  const tts = negotiateProviderInstance(
    negotiationInput([ttsInstance()], { category: 'TTS', instanceId: 'instance:qwen' }, ttsRequest()),
  )
  expectCompatible(tts, 'qwen3-tts')
  const rvc = negotiateProviderInstance(
    negotiationInput([rvcInstance()], { category: 'SVC', instanceId: 'instance:rvc' }, rvcRequest()),
  )
  expectCompatible(rvc, 'rvc')
  for (const result of [tts, rvc]) {
    assert.equal(result.value.mockOnly, true)
    assert.equal(result.value.realOperationAllowed, false)
    assert.equal(result.value.submitAllowed, false)
    assert.equal(result.value.automaticRetryAllowed, false)
    const encoded = JSON.stringify(result)
    assert.equal(encoded.includes('artifactRef'), false)
    assert.equal(encoded.includes('sampleRate'), false)
  }
})
