import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

import { SVC_ERRORS, normalizeSvcResult, validateSvcRequest } from '../core/svc/svc-contract.mjs'
import { getSvcCandidate, getSvcRegistryView, listSvcCandidates, selectSvcCandidate } from '../core/svc/svc-registry.mjs'
import { getProviderCandidate, getRegistryView } from '../core/tts/provider-registry.mjs'

const request = {
  sourceAudioRef: 'artifact:source-voice-1',
  targetVoiceId: 'shared-voice-a',
  pitchShift: 0,
  formantShift: 0,
  conversionStrength: 0.8,
  outputFormat: 'audio/wav',
}

const validRequest = (overrides = {}) => ({ ...request, ...overrides })

const validResult = (overrides = {}) => ({
  requestId: 'svc-1',
  targetVoiceId: 'shared-voice-a',
  artifactRef: 'artifact:converted-1',
  mime: 'audio/wav',
  sampleRate: 44100,
  durationMs: 2200,
  ...overrides,
})

function expectFailure(result, code, path) {
  assert.equal(result.ok, false, 'expected failure')
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'expected errors')
  assert.equal(result.errors[0].code, code)
  if (path !== undefined) assert.equal(result.errors[0].path, path)
  return result
}

function serialized(result) {
  return JSON.stringify(result)
}

// ---------------------------------------------------------------------------
// Original 5 security-intent tests (kept; one division point follows the new
// fixed error-domain contract: top-level send/wechat keys are delivery errors).
// ---------------------------------------------------------------------------

test('SVC request requires source audio and a shared target voice', () => {
  const ok = validateSvcRequest(request)
  assert.equal(ok.ok, true)
  assert.equal(validateSvcRequest({ ...request, sourceAudioRef: '' }).ok, false)
  assert.equal(validateSvcRequest({ ...request, targetVoiceId: '' }).errors[0].code, SVC_ERRORS.UNSUPPORTED_VOICE)
  assert.equal(validateSvcRequest({ ...request, pitchShift: 25 }).ok, false)
  assert.equal(validateSvcRequest({ ...request, apiKey: 'not-allowed' }).ok, false)
  assert.equal(validateSvcRequest({ ...request, outputFormat: 'video/mp4' }).ok, false)
})

test('SVC result is pending the shared delivery router, never WeChat delivery', () => {
  const ok = normalizeSvcResult('seed-vc', {
    requestId: 'svc-1',
    targetVoiceId: 'shared-voice-a',
    artifactRef: 'artifact:converted-1',
    mime: 'audio/wav',
    sampleRate: 44100,
    durationMs: 2200,
  })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.result.delivery, { state: 'PENDING_ROUTER' })
  assert.equal(ok.result.engineId, 'seed-vc')
  assert.equal(normalizeSvcResult('seed-vc', {
    requestId: 'svc-2', targetVoiceId: 'shared-voice-a', artifactRef: 'a', mime: 'audio/wav', sampleRate: 44100, durationMs: 1,
    delivery: { state: 'SENT' },
  }).ok, false)
  assert.equal(normalizeSvcResult('seed-vc', {
    requestId: 'svc-3', targetVoiceId: 'shared-voice-a', artifactRef: 'a', mime: 'audio/wav', sampleRate: 44100, durationMs: 1,
    wechat: { target: 'demo' },
  }).ok, false)
  assert.equal(normalizeSvcResult('seed-vc', {
    requestId: 'svc-4', targetVoiceId: 'shared-voice-a', artifactRef: 'a', mime: 'audio/wav', sampleRate: 44100, durationMs: 1,
    token: 'not-allowed',
  }).ok, false)
})

test('SVC request rejects unknown target fields and returns only allow-listed fields', () => {
  for (const field of ['targetChatId', 'recipient', 'extraField']) {
    const result = validateSvcRequest({ ...request, [field]: 'not-allowed' })
    assert.equal(result.ok, false, field + ' must be rejected')
    assert.equal(result.errors[0].code, SVC_ERRORS.INVALID_REQUEST)
    assert.equal(result.errors[0].path, '<unknown-key>')
  }
  const deliveryField = validateSvcRequest({ ...request, wechat: { target: 'demo' } })
  assert.equal(deliveryField.ok, false)
  assert.equal(deliveryField.errors[0].code, SVC_ERRORS.DELIVERY_NOT_PROVIDER)
  const ok = validateSvcRequest(request)
  assert.equal(ok.ok, true)
  assert.deepEqual(Object.keys(ok.request).sort(), ['conversionStrength', 'formantShift', 'outputFormat', 'pitchShift', 'sourceAudioRef', 'targetVoiceId'])
  const withFormat = validateSvcRequest({ ...request, outputFormat: 'audio/flac' })
  assert.equal(withFormat.ok, true)
  assert.equal(withFormat.request.outputFormat, 'audio/flac')
})

test('SVC candidates are separate from the TTS Provider Registry', () => {
  const svc = getSvcRegistryView()
  assert.equal(svc.status, 'DESIGN_ONLY')
  assert.equal(svc.engineType, 'SVC')
  assert.equal(svc.defaultVoiceId, null)
  assert.deepEqual(svc.selectable, [])
  assert.deepEqual(svc.implemented, [])
  assert.equal(listSvcCandidates().length, 2)
  assert.deepEqual(listSvcCandidates().map((candidate) => candidate.id).sort(), ['rvc', 'seed-vc'])
  assert.ok(listSvcCandidates().every((candidate) => candidate.integrationStatus === 'NOT_IMPLEMENTED' && candidate.selectable === false))
  assert.equal(selectSvcCandidate('seed-vc').ok, false)
  assert.equal(selectSvcCandidate('seed-vc').code, 'NOT_IMPLEMENTED')
  assert.equal(getSvcCandidate('rvc').kind, 'SVC')

  assert.equal(getProviderCandidate('seed-vc'), null)
  assert.equal(getProviderCandidate('rvc'), null)
  assert.equal(getRegistryView().candidates.some((candidate) => candidate.kind === 'SVC'), false)
  assert.equal(getSvcCandidate('qwen3-tts'), null)
})

test('SVC contract has no I/O or delivery side effects', async () => {
  const contract = await readFile(new URL('../core/svc/svc-contract.mjs', import.meta.url), 'utf8')
  const registry = await readFile(new URL('../core/svc/svc-registry.mjs', import.meta.url), 'utf8')
  for (const source of [contract, registry]) {
    assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|writeFile|spawn\s*\(/)
    assert.doesNotMatch(source, /wechat\.send|sendWeChat|sendToWeChat|\bfunction\s+send\b|\.send\s*\(/)
  }
})

// ---------------------------------------------------------------------------
// R01–R24 regression matrix (pre-merge SVC input boundary repair).
// ---------------------------------------------------------------------------

test('R01 request accepts with and without outputFormat and keeps canonical values', () => {
  const withFormat = validateSvcRequest(validRequest())
  assert.equal(withFormat.ok, true)
  assert.deepEqual(withFormat.request, request)
  assert.deepEqual(withFormat.errors, [])

  const withoutFormat = validateSvcRequest(validRequest({ outputFormat: undefined }))
  assert.equal(withoutFormat.ok, true)
  assert.equal(Object.prototype.hasOwnProperty.call(withoutFormat.request, 'outputFormat'), false)
  assert.equal(withoutFormat.request.sourceAudioRef, request.sourceAudioRef)
  assert.equal(withoutFormat.request.targetVoiceId, request.targetVoiceId)
  assert.equal(withoutFormat.request.pitchShift, request.pitchShift)
  assert.equal(withoutFormat.request.formantShift, request.formantShift)
  assert.equal(withoutFormat.request.conversionStrength, request.conversionStrength)
})

test('R02 result without delivery/providerId/createdAt succeeds with PENDING_ROUTER and null createdAt', () => {
  const result = normalizeSvcResult('seed-vc', validResult())
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(Object.keys(result.result).sort(), [
    'artifactRef', 'createdAt', 'delivery', 'durationMs', 'engineId', 'mime', 'requestId', 'sampleRate', 'schemaVersion', 'targetVoiceId',
  ])
  assert.equal(result.result.createdAt, null)
  assert.deepEqual(result.result.delivery, { state: 'PENDING_ROUTER' })
})

test('R03 explicit legal delivery, matching providerId and canonical UTC createdAt succeed', () => {
  const createdAt = '2026-10-26T00:00:00.000Z'
  const result = normalizeSvcResult('seed-vc', validResult({
    providerId: 'seed-vc',
    createdAt,
    delivery: { state: 'PENDING_ROUTER' },
  }))
  assert.equal(result.ok, true)
  assert.equal(result.result.createdAt, createdAt)
  assert.deepEqual(result.result.delivery, { state: 'PENDING_ROUTER' })
  assert.equal(result.result.engineId, 'seed-vc')
  assert.equal(result.result.sampleRate, 44100)
  assert.equal(result.result.durationMs, 2200)
})

test('R04 result rejects unknown ordinary keys and 07-B-only fields with a fixed placeholder', () => {
  for (const overrides of [
    { extraField: 'x' },
    { targetModelId: 'rvc-model:fixture-a' },
    { inputAudio: { durationMs: 1, byteLength: 1, sampleRate: 44100, channels: 1 } },
    { rights: { state: 'CONFIRMED_FIXTURE' } },
    { status: 'SUCCEEDED_FAKE' },
    { code: 'RVC_FAKE_TIMEOUT' },
    { cancel: { requested: false, confirmed: false } },
    { schemaVersion: 1 },
  ]) {
    const result = expectFailure(normalizeSvcResult('seed-vc', validResult(overrides)), SVC_ERRORS.INVALID_RESULT, '<unknown-key>')
    assert.equal(result.errors[0].reason, 'unknown field is not allowed')
    assert.match(serialized(result), /<unknown-key>/)
    for (const key of Object.keys(overrides)) {
      if (key === 'code') continue // the error envelope itself has a `code` field
      assert.equal(serialized(result).includes(key), false, key + ' must not be echoed')
    }
  }
})

test('R05 delivery and top-level delivery fields are rejected as DELIVERY_NOT_PROVIDER', () => {
  for (const delivery of [
    { state: 'PENDING_ROUTER', submitAllowed: true },
    { state: 'PENDING_ROUTER', submitAllowed: false },
    { state: 'PENDING_ROUTER', target: 'chat-1' },
    { state: 'PENDING_ROUTER', token: 'secret' },
    { state: 'PENDING_ROUTER', extra: 1 },
    { state: 'SENT' },
    { state: 'NOT_REQUESTED' },
    { state: 'pening_router' },
  ]) {
    const result = normalizeSvcResult('seed-vc', validResult({ delivery }))
    expectFailure(result, SVC_ERRORS.DELIVERY_NOT_PROVIDER)
    assert.match(serialized(result), /delivery/)
  }
  for (const key of ['send', 'wechat', 'sentToWechat']) {
    const result = normalizeSvcResult('seed-vc', validResult({ [key]: { target: 'x' } }))
    expectFailure(result, SVC_ERRORS.DELIVERY_NOT_PROVIDER, '<unknown-key>')
    assert.equal(serialized(result).includes(key), false, key + ' must not be echoed')
  }
})

test('R06 hidden unknown token and hidden known fields are rejected without being read', () => {
  const hiddenToken = validResult()
  Object.defineProperty(hiddenToken, 'token', { value: 'hidden-secret', enumerable: false, configurable: true })
  expectFailure(normalizeSvcResult('seed-vc', hiddenToken), SVC_ERRORS.INVALID_RESULT, '<unknown-key>')
  assert.equal(serialized(normalizeSvcResult('seed-vc', hiddenToken)).includes('hidden-secret'), false)

  const hiddenKnown = validResult()
  Object.defineProperty(hiddenKnown, 'requestId', { value: 'hidden-request', enumerable: false, configurable: true })
  expectFailure(normalizeSvcResult('seed-vc', hiddenKnown), SVC_ERRORS.INVALID_RESULT, 'requestId')

  const hiddenRequest = validRequest()
  Object.defineProperty(hiddenRequest, 'sourceAudioRef', { value: 'hidden-source', enumerable: false, configurable: true })
  expectFailure(validateSvcRequest(hiddenRequest), SVC_ERRORS.INVALID_REQUEST, 'sourceAudioRef')

  const hiddenState = { state: 'PENDING_ROUTER' }
  Object.defineProperty(hiddenState, 'state', { value: 'PENDING_ROUTER', enumerable: false, configurable: true })
  expectFailure(normalizeSvcResult('seed-vc', validResult({ delivery: hiddenState })), SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery.state')
})

test('R07 Symbol keys are rejected at every layer and never echoed', () => {
  const marker = 'SYMBOL_MARKER_7'
  const requestWithSymbol = validRequest()
  requestWithSymbol[Symbol(marker)] = 'x'
  expectFailure(validateSvcRequest(requestWithSymbol), SVC_ERRORS.INVALID_REQUEST, '<unknown-key>')
  assert.equal(serialized(validateSvcRequest(requestWithSymbol)).includes(marker), false)

  const resultWithSymbol = validResult()
  resultWithSymbol[Symbol(marker)] = 'x'
  expectFailure(normalizeSvcResult('seed-vc', resultWithSymbol), SVC_ERRORS.INVALID_RESULT, '<unknown-key>')
  assert.equal(serialized(normalizeSvcResult('seed-vc', resultWithSymbol)).includes(marker), false)

  const deliveryWithSymbol = { state: 'PENDING_ROUTER' }
  deliveryWithSymbol[Symbol(marker)] = 'x'
  expectFailure(normalizeSvcResult('seed-vc', validResult({ delivery: deliveryWithSymbol })), SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery.<unknown-key>')
  assert.equal(serialized(normalizeSvcResult('seed-vc', validResult({ delivery: deliveryWithSymbol }))).includes(marker), false)
})

test('R08 getters and setters are rejected on known and unknown fields and never executed', () => {
  let getterCalls = 0
  const requestWithGetter = validRequest()
  Object.defineProperty(requestWithGetter, 'pitchShift', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return 0 },
  })
  expectFailure(validateSvcRequest(requestWithGetter), SVC_ERRORS.INVALID_REQUEST, 'pitchShift')
  assert.equal(getterCalls, 0)

  const requestWithUnknownGetter = validRequest()
  Object.defineProperty(requestWithUnknownGetter, 'mystery', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return 'x' },
  })
  expectFailure(validateSvcRequest(requestWithUnknownGetter), SVC_ERRORS.INVALID_REQUEST, '<unknown-key>')
  assert.equal(getterCalls, 0)

  const resultWithGetter = validResult()
  Object.defineProperty(resultWithGetter, 'mime', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; throw new Error('GETTER_MARKER_8') },
  })
  const throwing = normalizeSvcResult('seed-vc', resultWithGetter)
  expectFailure(throwing, SVC_ERRORS.INVALID_RESULT, 'mime')
  assert.equal(getterCalls, 0)
  assert.equal(serialized(throwing).includes('GETTER_MARKER_8'), false)

  const withSetter = validRequest()
  Object.defineProperty(withSetter, 'formantShift', { enumerable: true, configurable: true, set() {} })
  expectFailure(validateSvcRequest(withSetter), SVC_ERRORS.INVALID_REQUEST, 'formantShift')
})

test('R09 delivery accessors are rejected with zero calls', () => {
  let calls = 0
  const delivery = {}
  Object.defineProperty(delivery, 'state', {
    enumerable: true,
    configurable: true,
    get() { calls += 1; return 'PENDING_ROUTER' },
  })
  const result = normalizeSvcResult('seed-vc', validResult({ delivery }))
  expectFailure(result, SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery.state')
  assert.equal(calls, 0)

  const unknownAccessor = {}
  Object.defineProperty(unknownAccessor, 'submitAllowed', {
    enumerable: true,
    configurable: true,
    get() { calls += 1; return true },
  })
  expectFailure(normalizeSvcResult('seed-vc', validResult({ delivery: unknownAccessor })), SVC_ERRORS.DELIVERY_NOT_PROVIDER)
  assert.equal(calls, 0)
})

test('R10 null-prototype and frozen legal inputs pass', () => {
  const nullProto = Object.assign(Object.create(null), validRequest())
  const accepted = validateSvcRequest(Object.freeze(nullProto))
  assert.equal(accepted.ok, true)
  assert.equal(accepted.request.sourceAudioRef, request.sourceAudioRef)

  const frozenResult = Object.freeze(validResult({ delivery: Object.freeze({ state: 'PENDING_ROUTER' }) }))
  const normalized = normalizeSvcResult('seed-vc', frozenResult)
  assert.equal(normalized.ok, true)
  assert.deepEqual(normalized.result.delivery, { state: 'PENDING_ROUTER' })
})

test('R11 arrays, class instances, custom prototypes and inherited fields fail without reading inheritance', () => {
  assert.equal(validateSvcRequest([]).ok, false)
  assert.equal(validateSvcRequest(null).ok, false)
  assert.equal(validateSvcRequest('text').ok, false)
  class Sample { constructor() { Object.assign(this, validRequest()) } }
  expectFailure(validateSvcRequest(new Sample()), SVC_ERRORS.INVALID_REQUEST, '$')

  let inheritedReads = 0
  const inherited = Object.create({
    get sourceAudioRef() { inheritedReads += 1; return 'artifact:inherited' },
  })
  inherited.targetVoiceId = 'shared-voice-a'
  inherited.pitchShift = 0
  inherited.formantShift = 0
  inherited.conversionStrength = 0.5
  expectFailure(validateSvcRequest(inherited), SVC_ERRORS.INVALID_REQUEST, '$')
  assert.equal(inheritedReads, 0)

  assert.equal(normalizeSvcResult('seed-vc', []).ok, false)
  assert.equal(normalizeSvcResult('seed-vc', new Sample()).ok, false)
})

test('R12 every required field is required in both entries and is never defaulted', () => {
  for (const field of ['sourceAudioRef', 'targetVoiceId', 'pitchShift', 'formantShift', 'conversionStrength']) {
    const missing = validRequest()
    delete missing[field]
    const result = expectFailure(validateSvcRequest(missing), SVC_ERRORS.INVALID_REQUEST, field)
    assert.equal(result.errors[0].reason, 'required')
    const explicitUndefined = validateSvcRequest(validRequest({ [field]: undefined }))
    expectFailure(explicitUndefined, SVC_ERRORS.INVALID_REQUEST, field)
  }

  for (const field of ['requestId', 'targetVoiceId', 'artifactRef', 'mime', 'sampleRate', 'durationMs']) {
    const missing = validResult()
    delete missing[field]
    expectFailure(normalizeSvcResult('seed-vc', missing), SVC_ERRORS.INVALID_RESULT, field)
    expectFailure(normalizeSvcResult('seed-vc', validResult({ [field]: undefined })), SVC_ERRORS.INVALID_RESULT, field)
  }
})

test('R13 optional result keys and explicit undefined outputFormat stay compatible', () => {
  const result = normalizeSvcResult('seed-vc', validResult({
    providerId: undefined,
    delivery: undefined,
    createdAt: undefined,
  }))
  assert.equal(result.ok, true)
  assert.equal(result.result.createdAt, null)
  assert.deepEqual(result.result.delivery, { state: 'PENDING_ROUTER' })

  const nullCreatedAt = normalizeSvcResult('seed-vc', validResult({ createdAt: null }))
  assert.equal(nullCreatedAt.ok, true)
  assert.equal(nullCreatedAt.result.createdAt, null)

  const requestResult = validateSvcRequest(validRequest({ outputFormat: undefined }))
  assert.equal(requestResult.ok, true)
  assert.equal('outputFormat' in requestResult.request, false)
})

test('R14 delivery must be exactly PENDING_ROUTER and cannot be null, empty or other states', () => {
  for (const delivery of [null, {}, { state: '' }, { state: 1 }, { state: true }, { state: null }]) {
    const result = normalizeSvcResult('seed-vc', validResult({ delivery }))
    expectFailure(result, SVC_ERRORS.DELIVERY_NOT_PROVIDER)
    assert.match(serialized(result), /delivery/)
  }
})

test('R15 providerId and engineId mismatches are rejected', () => {
  expectFailure(normalizeSvcResult('seed-vc', validResult({ providerId: 'rvc' })), SVC_ERRORS.INVALID_RESULT, 'providerId')
  expectFailure(normalizeSvcResult('seed-vc', validResult({ providerId: 7 })), SVC_ERRORS.INVALID_RESULT, 'providerId')
  expectFailure(normalizeSvcResult('', validResult()), SVC_ERRORS.INVALID_RESULT, 'engineId')
  expectFailure(normalizeSvcResult(null, validResult()), SVC_ERRORS.INVALID_RESULT, 'engineId')
  expectFailure(normalizeSvcResult(42, validResult()), SVC_ERRORS.INVALID_RESULT, 'engineId')
})

test('R16 numeric domains are preserved and never clamped', () => {
  for (const value of [-24, 24, 2.5, 0]) assert.equal(validateSvcRequest(validRequest({ pitchShift: value })).ok, true)
  for (const value of [-24.0001, 24.0001, NaN, Infinity, -Infinity, '0', null]) {
    expectFailure(validateSvcRequest(validRequest({ pitchShift: value })), SVC_ERRORS.INVALID_REQUEST, 'pitchShift')
  }
  for (const value of [-1, 1, 0.25]) assert.equal(validateSvcRequest(validRequest({ formantShift: value })).ok, true)
  for (const value of [-1.01, 1.01, NaN, Infinity]) {
    expectFailure(validateSvcRequest(validRequest({ formantShift: value })), SVC_ERRORS.INVALID_REQUEST, 'formantShift')
  }
  for (const value of [0, 1, 0.5]) assert.equal(validateSvcRequest(validRequest({ conversionStrength: value })).ok, true)
  for (const value of [-0.01, 1.01, NaN]) {
    expectFailure(validateSvcRequest(validRequest({ conversionStrength: value })), SVC_ERRORS.INVALID_REQUEST, 'conversionStrength')
  }
  const kept = validateSvcRequest(validRequest({ pitchShift: 24 }))
  assert.equal(kept.request.pitchShift, 24)
})

test('R17 original reference, voice, format, sample-rate and duration boundaries hold', () => {
  assert.equal(validateSvcRequest(validRequest({ sourceAudioRef: 'ab' })).ok, true)
  expectFailure(validateSvcRequest(validRequest({ sourceAudioRef: 'a' })), SVC_ERRORS.INVALID_REQUEST, 'sourceAudioRef')
  expectFailure(validateSvcRequest(validRequest({ sourceAudioRef: 'a b' })), SVC_ERRORS.INVALID_REQUEST, 'sourceAudioRef')
  assert.equal(validateSvcRequest(validRequest({ targetVoiceId: 'a' })).ok, true)
  expectFailure(validateSvcRequest(validRequest({ targetVoiceId: 'bad voice' })), SVC_ERRORS.UNSUPPORTED_VOICE, 'targetVoiceId')
  expectFailure(validateSvcRequest(validRequest({ outputFormat: 'audio/' })), SVC_ERRORS.UNSUPPORTED_FORMAT, 'outputFormat')

  assert.equal(normalizeSvcResult('seed-vc', validResult({ sampleRate: 8000 })).ok, true)
  assert.equal(normalizeSvcResult('seed-vc', validResult({ sampleRate: 192000 })).ok, true)
  expectFailure(normalizeSvcResult('seed-vc', validResult({ sampleRate: 7999 })), SVC_ERRORS.UNSUPPORTED_FORMAT, 'sampleRate')
  expectFailure(normalizeSvcResult('seed-vc', validResult({ sampleRate: 192001 })), SVC_ERRORS.UNSUPPORTED_FORMAT, 'sampleRate')
  assert.equal(normalizeSvcResult('seed-vc', validResult({ durationMs: 0 })).ok, true)
  expectFailure(normalizeSvcResult('seed-vc', validResult({ durationMs: -1 })), SVC_ERRORS.INVALID_RESULT, 'durationMs')
  expectFailure(normalizeSvcResult('seed-vc', validResult({ durationMs: 1.5 })), SVC_ERRORS.INVALID_RESULT, 'durationMs')
  expectFailure(normalizeSvcResult('seed-vc', validResult({ mime: 'video/mp4' })), SVC_ERRORS.UNSUPPORTED_FORMAT, 'mime')
})

test('R18 createdAt accepts only canonical UTC ISO strings and rejects everything else', () => {
  const accepted = ['2026-10-26T00:00:00.000Z', '2024-02-29T23:59:59.999Z', '2026-01-01T00:00:00.000Z']
  for (const value of accepted) {
    const result = normalizeSvcResult('seed-vc', validResult({ createdAt: value }))
    assert.equal(result.ok, true, value)
    assert.equal(result.result.createdAt, value)
  }
  const rejected = [
    {}, [], 0, 1, true, false, '',
    '2026-10-26T00:00:00Z',
    '2026-10-26T00:00:00.000+00:00',
    '2026-10-26 00:00:00.000Z',
    '2026-02-30T00:00:00.000Z',
    '2026-13-01T00:00:00.000Z',
    '2026-10-26T24:00:00.000Z',
    'not-a-date',
    '2026-10-26T00:00:00.000z',
  ]
  for (const value of rejected) {
    expectFailure(normalizeSvcResult('seed-vc', validResult({ createdAt: value })), SVC_ERRORS.INVALID_RESULT, 'createdAt')
  }
})

test('R19 cycles, deep values and >32 keys fail finitely without traversal', () => {
  const cyclic = {}
  cyclic.self = cyclic
  expectFailure(normalizeSvcResult('seed-vc', validResult({ artifactRef: cyclic })), SVC_ERRORS.INVALID_RESULT, 'artifactRef')
  expectFailure(normalizeSvcResult('seed-vc', validResult({ durationMs: cyclic })), SVC_ERRORS.INVALID_RESULT, 'durationMs')
  expectFailure(validateSvcRequest(validRequest({ pitchShift: cyclic })), SVC_ERRORS.INVALID_REQUEST, 'pitchShift')

  let deep = { value: 'x' }
  for (let index = 0; index < 200; index += 1) deep = { nested: deep }
  expectFailure(normalizeSvcResult('seed-vc', validResult({ mime: deep })), SVC_ERRORS.INVALID_RESULT, 'mime')

  const manyKeys = validRequest()
  for (let index = 0; index < 33; index += 1) manyKeys['extra' + index] = index
  expectFailure(validateSvcRequest(manyKeys), SVC_ERRORS.INVALID_REQUEST, '$')
  assert.equal(validateSvcRequest(manyKeys).errors[0].reason, 'invalid object structure')

  const manyResultKeys = validResult()
  for (let index = 0; index < 33; index += 1) manyResultKeys['extra' + index] = index
  expectFailure(normalizeSvcResult('seed-vc', manyResultKeys), SVC_ERRORS.INVALID_RESULT, '$')

  const manyDeliveryKeys = { state: 'PENDING_ROUTER' }
  for (let index = 0; index < 33; index += 1) manyDeliveryKeys['extra' + index] = index
  expectFailure(normalizeSvcResult('seed-vc', validResult({ delivery: manyDeliveryKeys })), SVC_ERRORS.DELIVERY_NOT_PROVIDER, 'delivery')
})

test('R20 error envelopes never echo keys, values, symbols, exceptions or stack text', () => {
  const keyMarker = 'PRIVATE_KEY_MARKER_20'
  const valueMarker = 'PRIVATE_VALUE_MARKER_20'
  const symbolMarker = 'PRIVATE_SYMBOL_MARKER_20'
  const errorMarker = 'PRIVATE_ERROR_MARKER_20'

  const unknown = validResult({ [keyMarker]: valueMarker })
  const result = normalizeSvcResult('seed-vc', unknown)
  expectFailure(result, SVC_ERRORS.INVALID_RESULT, '<unknown-key>')
  const encoded = serialized(result)
  assert.equal(encoded.includes(keyMarker), false)
  assert.equal(encoded.includes(valueMarker), false)
  assert.equal(encoded.includes('at '), false)

  const withSymbol = validResult()
  withSymbol[Symbol(symbolMarker)] = valueMarker
  assert.equal(serialized(normalizeSvcResult('seed-vc', withSymbol)).includes(symbolMarker), false)

  const throwing = validResult()
  Object.defineProperty(throwing, 'requestId', {
    enumerable: true,
    configurable: true,
    get() { throw new Error(errorMarker) },
  })
  const thrown = normalizeSvcResult('seed-vc', throwing)
  expectFailure(thrown, SVC_ERRORS.INVALID_RESULT, 'requestId')
  assert.equal(serialized(thrown).includes(errorMarker), false)

  const proxy = new Proxy({}, {
    ownKeys() { throw new Error(errorMarker) },
  })
  const proxied = normalizeSvcResult('seed-vc', proxy)
  expectFailure(proxied, SVC_ERRORS.INVALID_RESULT, '$')
  assert.equal(proxied.errors[0].reason, 'input could not be inspected safely')
  assert.equal(serialized(proxied).includes(errorMarker), false)
})

test('R21 outputs are fresh objects and inputs are never mutated or shared', () => {
  const input = validResult({ delivery: { state: 'PENDING_ROUTER' }, createdAt: '2026-10-26T00:00:00.000Z' })
  const snapshot = JSON.stringify(input)
  const first = normalizeSvcResult('seed-vc', input)
  const second = normalizeSvcResult('seed-vc', input)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.notEqual(first.result, second.result)
  assert.notEqual(first.result.delivery, second.result.delivery)
  assert.notEqual(first.result.delivery, input.delivery)

  first.result.delivery.state = 'SENT'
  first.result.requestId = 'mutated'
  const third = normalizeSvcResult('seed-vc', input)
  assert.equal(third.ok, true)
  assert.deepEqual(third.result.delivery, { state: 'PENDING_ROUTER' })
  assert.equal(third.result.requestId, 'svc-1')
  assert.equal(JSON.stringify(input), snapshot)

  const requestInput = validRequest()
  const requestSnapshot = JSON.stringify(requestInput)
  const requestOne = validateSvcRequest(requestInput)
  const requestTwo = validateSvcRequest(requestInput)
  assert.notEqual(requestOne.request, requestTwo.request)
  assert.equal(JSON.stringify(requestInput), requestSnapshot)
})

test('R22 the original F1–F8 probes are all rejected with zero getter calls and no key echo', () => {
  let getterCalls = 0

  // F1 unknown result key
  expectFailure(normalizeSvcResult('seed-vc', validResult({ unknownResultKey: 'x' })), SVC_ERRORS.INVALID_RESULT, '<unknown-key>')

  // F2 delivery with submitAllowed
  expectFailure(normalizeSvcResult('seed-vc', validResult({ delivery: { state: 'PENDING_ROUTER', submitAllowed: true } })), SVC_ERRORS.DELIVERY_NOT_PROVIDER)

  // F3 hidden token
  const hiddenToken = validResult()
  Object.defineProperty(hiddenToken, 'token', { value: 'hidden', enumerable: false, configurable: true })
  expectFailure(normalizeSvcResult('seed-vc', hiddenToken), SVC_ERRORS.INVALID_RESULT, '<unknown-key>')

  // F4 Symbol key
  const withSymbol = validResult()
  withSymbol[Symbol('F4_MARKER')] = 'x'
  const symbolResult = normalizeSvcResult('seed-vc', withSymbol)
  expectFailure(symbolResult, SVC_ERRORS.INVALID_RESULT, '<unknown-key>')
  assert.equal(serialized(symbolResult).includes('F4_MARKER'), false)

  // F5 mime getter
  const getterResult = validResult()
  Object.defineProperty(getterResult, 'mime', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return 'audio/wav' },
  })
  expectFailure(normalizeSvcResult('seed-vc', getterResult), SVC_ERRORS.INVALID_RESULT, 'mime')

  // F6 request unknown key echoed in path
  const unknownRequest = validateSvcRequest(validRequest({ mysteryField: 'x' }))
  expectFailure(unknownRequest, SVC_ERRORS.INVALID_REQUEST, '<unknown-key>')
  assert.equal(serialized(unknownRequest).includes('mysteryField'), false)

  // F7 request getter
  const getterRequest = validRequest()
  Object.defineProperty(getterRequest, 'sourceAudioRef', {
    enumerable: true,
    configurable: true,
    get() { getterCalls += 1; return 'artifact:source' },
  })
  expectFailure(validateSvcRequest(getterRequest), SVC_ERRORS.INVALID_REQUEST, 'sourceAudioRef')

  // F8 createdAt object
  expectFailure(normalizeSvcResult('seed-vc', validResult({ createdAt: {} })), SVC_ERRORS.INVALID_RESULT, 'createdAt')

  assert.equal(getterCalls, 0)
})

test('R23 07-B-only request and Fake-style result fields are rejected inside v1 without imports', () => {
  const fakeStyleRequest = {
    schemaVersion: 1,
    sourceAudioRef: 'artifact:fixture-source',
    targetModelId: 'rvc-model:fixture-a',
    pitchShift: 0,
    outputFormat: 'audio/wav',
  }
  expectFailure(validateSvcRequest(fakeStyleRequest), SVC_ERRORS.INVALID_REQUEST, '<unknown-key>')

  const fakeStyleResult = {
    requestId: 'request:fixture-1',
    targetModelId: 'rvc-model:fixture-a',
    artifactRef: 'artifact:fixture-output-1',
    mime: 'audio/wav',
    sampleRate: 44100,
    durationMs: 1000,
    delivery: { state: 'NOT_REQUESTED', submitAllowed: false },
  }
  expectFailure(normalizeSvcResult('rvc', fakeStyleResult), SVC_ERRORS.INVALID_RESULT, '<unknown-key>')

  const fakeResultWithoutTargetVoice = {
    requestId: 'request:fixture-1',
    artifactRef: 'artifact:fixture-output-1',
    mime: 'audio/wav',
    sampleRate: 44100,
    durationMs: 1000,
  }
  expectFailure(normalizeSvcResult('rvc', fakeResultWithoutTargetVoice), SVC_ERRORS.INVALID_RESULT, 'targetVoiceId')
})

test('R24 catalogue stays NOT_IMPLEMENTED and the module stays pure', async () => {
  assert.deepEqual(getSvcRegistryView().selectable, [])
  assert.deepEqual(getSvcRegistryView().implemented, [])
  assert.equal(selectSvcCandidate('rvc').code, 'NOT_IMPLEMENTED')
  assert.equal(getSvcCandidate('rvc').selectable, false)

  const contract = await readFile(new URL('../core/svc/svc-contract.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(contract, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|new\s+Date\s*\(\s*\)|Date\.now|Math\.random/)
  assert.doesNotMatch(contract, /wechat\.send|sendWeChat|sendToWeChat|\.send\s*\(/)
})
