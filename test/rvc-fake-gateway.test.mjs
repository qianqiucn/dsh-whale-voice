/* Whale Voice SVC — original RVC Fake Gateway protocol tests (Plan 07-B).
 *
 * G01–G40 from the Plan 07-B task book. Every fixture is fictional: no real audio, model,
 * credential, target or network endpoint is read or produced. The suite only imports the module
 * under test plus Node's test/assert/fs helpers for static checks.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  RVC_FAKE_ERRORS,
  RVC_FAKE_GATEWAY_SCHEMA_VERSION,
  RVC_FAKE_LIMITS,
  RVC_FAKE_SCENARIOS,
  listRvcFakeModels,
  simulateRvcFakeConversion,
  validateRvcFakeRequest,
  validateRvcFakeResult,
} from '../core/svc/rvc-fake-gateway.mjs'

const REQUEST_KEYS = ['inputAudio', 'outputFormat', 'pitchShift', 'rights', 'schemaVersion', 'sourceAudioRef', 'targetModelId']
const AUDIO_KEYS = ['byteLength', 'channels', 'durationMs', 'sampleRate']
const CONTEXT_KEYS = ['endpointId', 'requestId', 'scenario']
const MODEL_KEYS = ['engine', 'integrationStatus', 'labelZh', 'mockOnly', 'modelId', 'realOperationAllowed', 'selectable', 'simulatedAvailable']
const RESULT_KEYS = [
  'artifactRef',
  'automaticRetryAllowed',
  'cancel',
  'code',
  'delivery',
  'durationMs',
  'engine',
  'mime',
  'mockOnly',
  'realOperationAllowed',
  'requestId',
  'sampleRate',
  'schemaVersion',
  'status',
  'targetModelId',
]
const MODEL_A = 'rvc-model:fixture-a'
const MODEL_B = 'rvc-model:fixture-b'
const ENDPOINT = 'gateway:fixture-rvc'
const SAMPLE_RATES = [16000, 22050, 24000, 32000, 44100, 48000]

function audio(overrides = {}) {
  return { durationMs: 1200, byteLength: 48000, sampleRate: 44100, channels: 1, ...overrides }
}

function request(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceAudioRef: 'artifact:fixture-vocal-a',
    targetModelId: MODEL_A,
    pitchShift: 0,
    outputFormat: 'audio/wav',
    inputAudio: audio(),
    rights: { state: 'CONFIRMED_FIXTURE' },
    ...overrides,
  }
}

function context(overrides = {}) {
  return { requestId: 'request:fixture-demo-a', endpointId: ENDPOINT, scenario: 'SUCCESS', ...overrides }
}

function expectOk(result, label) {
  assert.equal(result.ok, true, label + ' expected ok, got ' + JSON.stringify(result.errors))
  return result.value
}

function expectError(result, code, path, label) {
  assert.equal(result.ok, false, label + ' must fail closed')
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'value'), false, label + ' must not expose a value')
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, label + ' must report errors')
  for (const error of result.errors) {
    assert.equal(typeof error.code, 'string', label + ' code')
    assert.equal(typeof error.path, 'string', label + ' path')
    assert.equal(typeof error.reason, 'string', label + ' reason')
  }
  assert.ok(
    result.errors.map((error) => error.code).includes(code),
    label + ' expected ' + code + ', got ' + JSON.stringify(result.errors),
  )
  if (path !== undefined) {
    assert.ok(
      result.errors.some((error) => error.path === path),
      label + ' expected path ' + path + ', got ' + JSON.stringify(result.errors),
    )
  }
  return result.errors
}

function errText(errors) {
  return errors.map((error) => error.path + '|' + error.reason).join(';')
}

function withHidden(object, key, value) {
  const clone = { ...object }
  Object.defineProperty(clone, key, { value, enumerable: false, configurable: true, writable: true })
  return clone
}

function withSymbol(object, description, value) {
  const clone = { ...object }
  Object.defineProperty(clone, Symbol(description), { value, enumerable: true, configurable: true, writable: true })
  return clone
}

function scenarioResult(scenario, overrides = {}) {
  return expectOk(simulateRvcFakeConversion(request(overrides), context({ scenario })), 'scenario ' + scenario)
}

// ---------------------------------------------------------------------------------------------
// G01–G05 · catalogue and request identity
// ---------------------------------------------------------------------------------------------

test('G01 模型目录恰好 A/B 两项且八键与模拟状态正确', () => {
  const models = expectOk(listRvcFakeModels(), 'G01')
  assert.equal(Array.isArray(models), true)
  assert.equal(models.length, 2)
  assert.deepEqual(models.map((model) => model.modelId), [MODEL_A, MODEL_B])
  for (const model of models) {
    assert.deepEqual(Object.keys(model).sort(), MODEL_KEYS)
    assert.equal(model.engine, 'RVC_FAKE')
    assert.equal(model.integrationStatus, 'NOT_IMPLEMENTED')
    assert.equal(model.selectable, false)
    assert.equal(model.mockOnly, true)
    assert.equal(model.realOperationAllowed, false)
  }
  assert.equal(models[0].simulatedAvailable, true)
  assert.equal(models[1].simulatedAvailable, false)
  assert.ok(models[0].labelZh.includes('演示音色A'))
  assert.ok(models[1].labelZh.includes('演示音色B'))
  assert.deepEqual({ ...RVC_FAKE_LIMITS }, {
    maxDurationMs: 300000,
    maxByteLength: 52428800,
    inputSampleRates: SAMPLE_RATES,
    inputChannels: 1,
    outputSampleRate: 44100,
  })
  assert.equal(RVC_FAKE_GATEWAY_SCHEMA_VERSION, 1)
  assert.deepEqual([...RVC_FAKE_SCENARIOS], [
    'SUCCESS',
    'OFFLINE',
    'MODEL_MISSING',
    'TIMEOUT',
    'CANCEL_REQUESTED',
    'CANCEL_CONFIRMED',
    'UNKNOWN',
  ])
})

test('G02 目录每次返回新的深冻结拷贝，不能被污染', () => {
  const first = expectOk(listRvcFakeModels(), 'G02 first')
  const second = expectOk(listRvcFakeModels(), 'G02 second')
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first[0], second[0])
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first[0]), true)
  assert.throws(() => {
    first[0].selectable = true
  }, TypeError)
  assert.throws(() => {
    first.push({ modelId: 'rvc-model:fixture-injected' })
  }, TypeError)
  assert.equal(second.length, 2)
  assert.equal(expectOk(listRvcFakeModels(), 'G02 third').length, 2)
  assert.equal(second[0].selectable, false)
})

test('G03 合法请求与边界值规范化为七键并保持不可变', () => {
  const cases = [
    request(),
    request({ pitchShift: -12 }),
    request({ pitchShift: 12 }),
    request({ inputAudio: audio({ durationMs: 1, byteLength: 1, sampleRate: 16000 }) }),
    request({ inputAudio: audio({ durationMs: 300000, byteLength: 52428800, sampleRate: 48000 }) }),
  ]
  for (const value of cases) {
    const parsed = expectOk(validateRvcFakeRequest(value), 'G03')
    assert.deepEqual(Object.keys(parsed).sort(), REQUEST_KEYS)
    assert.deepEqual(Object.keys(parsed.inputAudio).sort(), AUDIO_KEYS)
    assert.deepEqual({ ...parsed.rights }, { state: 'CONFIRMED_FIXTURE' })
    assert.equal(Object.isFrozen(parsed), true)
    assert.equal(Object.isFrozen(parsed.inputAudio), true)
    assert.equal(Object.isFrozen(parsed.rights), true)
    assert.notStrictEqual(parsed, value)
    assert.notStrictEqual(parsed.inputAudio, value.inputAudio)
  }
  for (const sampleRate of SAMPLE_RATES) {
    expectOk(validateRvcFakeRequest(request({ inputAudio: audio({ sampleRate }) })), 'G03 rate ' + sampleRate)
  }
})

test('G04 URL、路径、正文与非 Fixture 源引用全部拒绝', () => {
  const refs = [
    'https://example.test/vocal.wav',
    'http://127.0.0.1:7865/vocal.wav',
    'C:\\fixture\\vocal.wav',
    'D:/fixture/vocal.wav',
    '\\\\fixture-host\\share\\vocal.wav',
    'fixture plain text',
    'artifact:other-fixture-a',
    'artifact:fixture-a.b',
    'artifact:fixture-',
    '',
    42,
  ]
  for (const sourceAudioRef of refs) {
    const expected = typeof sourceAudioRef === 'string' ? RVC_FAKE_ERRORS.INVALID_REQUEST : RVC_FAKE_ERRORS.TYPE_MISMATCH
    expectError(validateRvcFakeRequest(request({ sourceAudioRef })), expected, 'sourceAudioRef', 'G04 ' + String(sourceAudioRef).slice(0, 30))
  }
})

test('G05 未注册、路径样与 VoiceProfile 样模型 ID 被拒绝且不回退 A', () => {
  const ids = ['rvc-model:fixture-c', 'C:\\models\\fixture.pth', 'voice:fixture-01', '', 'rvc-model:fixture-a ']
  for (const targetModelId of ids) {
    expectError(
      validateRvcFakeRequest(request({ targetModelId })),
      RVC_FAKE_ERRORS.MODEL_NOT_AVAILABLE,
      'targetModelId',
      'G05 ' + targetModelId,
    )
    expectError(
      simulateRvcFakeConversion(request({ targetModelId }), context()),
      RVC_FAKE_ERRORS.MODEL_NOT_AVAILABLE,
      'targetModelId',
      'G05 simulate ' + targetModelId,
    )
  }
  expectError(
    validateRvcFakeRequest(request({ targetModelId: 42 })),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'targetModelId',
    'G05 non-string',
  )
})

// ---------------------------------------------------------------------------------------------
// G06–G11 · numeric, format and rights edges
// ---------------------------------------------------------------------------------------------

test('G06 pitchShift 边界、越界与非法数值', () => {
  expectOk(validateRvcFakeRequest(request({ pitchShift: -12 })), 'G06 -12')
  expectOk(validateRvcFakeRequest(request({ pitchShift: 12 })), 'G06 12')
  for (const pitchShift of [-13, 13, 24]) {
    expectError(
      validateRvcFakeRequest(request({ pitchShift })),
      RVC_FAKE_ERRORS.RESOURCE_LIMIT,
      'pitchShift',
      'G06 range ' + pitchShift,
    )
  }
  for (const pitchShift of [1.5, NaN, Infinity, '0']) {
    expectError(
      validateRvcFakeRequest(request({ pitchShift })),
      RVC_FAKE_ERRORS.TYPE_MISMATCH,
      'pitchShift',
      'G06 type ' + String(pitchShift),
    )
  }
})

test('G07 outputFormat 只接受必填 audio/wav', () => {
  expectOk(validateRvcFakeRequest(request({ outputFormat: 'audio/wav' })), 'G07 wav')
  expectError(
    validateRvcFakeRequest(request({ outputFormat: 'audio/mp3' })),
    RVC_FAKE_ERRORS.UNSUPPORTED_FORMAT,
    'outputFormat',
    'G07 mp3',
  )
  expectError(
    validateRvcFakeRequest(request({ outputFormat: 42 })),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'outputFormat',
    'G07 type',
  )
  const missing = request()
  delete missing.outputFormat
  expectError(validateRvcFakeRequest(missing), RVC_FAKE_ERRORS.INVALID_REQUEST, 'outputFormat', 'G07 missing')
})

test('G08 时长边界、越界与小数', () => {
  expectOk(validateRvcFakeRequest(request({ inputAudio: audio({ durationMs: 1 }) })), 'G08 1')
  expectOk(validateRvcFakeRequest(request({ inputAudio: audio({ durationMs: 300000 }) })), 'G08 max')
  for (const durationMs of [0, 300001]) {
    expectError(
      validateRvcFakeRequest(request({ inputAudio: audio({ durationMs }) })),
      RVC_FAKE_ERRORS.RESOURCE_LIMIT,
      'inputAudio.durationMs',
      'G08 range ' + durationMs,
    )
  }
  expectError(
    validateRvcFakeRequest(request({ inputAudio: audio({ durationMs: 1.5 }) })),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'inputAudio.durationMs',
    'G08 float',
  )
})

test('G09 字节数边界、越界与非整数', () => {
  expectOk(validateRvcFakeRequest(request({ inputAudio: audio({ byteLength: 1 }) })), 'G09 1')
  expectOk(validateRvcFakeRequest(request({ inputAudio: audio({ byteLength: 52428800 }) })), 'G09 max')
  for (const byteLength of [0, 52428801]) {
    expectError(
      validateRvcFakeRequest(request({ inputAudio: audio({ byteLength }) })),
      RVC_FAKE_ERRORS.RESOURCE_LIMIT,
      'inputAudio.byteLength',
      'G09 range ' + byteLength,
    )
  }
  expectError(
    validateRvcFakeRequest(request({ inputAudio: audio({ byteLength: 48000.5 }) })),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'inputAudio.byteLength',
    'G09 float',
  )
})

test('G10 采样率枚举与单声道严格校验', () => {
  for (const sampleRate of SAMPLE_RATES) {
    expectOk(validateRvcFakeRequest(request({ inputAudio: audio({ sampleRate }) })), 'G10 rate ' + sampleRate)
  }
  expectError(
    validateRvcFakeRequest(request({ inputAudio: audio({ sampleRate: 8000 }) })),
    RVC_FAKE_ERRORS.RESOURCE_LIMIT,
    'inputAudio.sampleRate',
    'G10 unsupported rate',
  )
  expectError(
    validateRvcFakeRequest(request({ inputAudio: audio({ sampleRate: '44100' }) })),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'inputAudio.sampleRate',
    'G10 rate type',
  )
  expectOk(validateRvcFakeRequest(request({ inputAudio: audio({ channels: 1 }) })), 'G10 mono')
  expectError(
    validateRvcFakeRequest(request({ inputAudio: audio({ channels: 2 }) })),
    RVC_FAKE_ERRORS.RESOURCE_LIMIT,
    'inputAudio.channels',
    'G10 stereo',
  )
  for (const channels of [0, 1.5, '1']) {
    expectError(
      validateRvcFakeRequest(request({ inputAudio: audio({ channels }) })),
      channels === 0 ? RVC_FAKE_ERRORS.RESOURCE_LIMIT : RVC_FAKE_ERRORS.TYPE_MISMATCH,
      'inputAudio.channels',
      'G10 channels ' + String(channels),
    )
  }
})

test('G11 只有 CONFIRMED_FIXTURE 权利可用', () => {
  expectOk(validateRvcFakeRequest(request({ rights: { state: 'CONFIRMED_FIXTURE' } })), 'G11 ok')
  for (const state of ['UNVERIFIED', 'AUTHORIZED', 'CONFIRMED', '']) {
    expectError(
      validateRvcFakeRequest(request({ rights: { state } })),
      RVC_FAKE_ERRORS.RIGHTS_UNCONFIRMED,
      'rights.state',
      'G11 ' + state,
    )
  }
  expectError(
    validateRvcFakeRequest(request({ rights: 'CONFIRMED_FIXTURE' })),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'rights',
    'G11 not object',
  )
  expectError(validateRvcFakeRequest(request({ rights: {} })), RVC_FAKE_ERRORS.INVALID_REQUEST, 'rights.state', 'G11 missing')
})

// ---------------------------------------------------------------------------------------------
// G12–G18 · unknown fields and property policy
// ---------------------------------------------------------------------------------------------

test('G12 顶层目标、发送、凭据、歌曲与混音字段全部拒绝且不回显', () => {
  const forbidden = ['targetChatId', 'token', 'send', 'providerId', 'songId', 'separation', 'gain', 'formantShift', 'conversionStrength', 'text', 'url', 'backend']
  for (const key of forbidden) {
    const marker = 'fixture-secret-marker'
    const errors = expectError(
      validateRvcFakeRequest(request({ [key]: marker })),
      RVC_FAKE_ERRORS.UNKNOWN_FIELD,
      '<unknown-key>',
      'G12 ' + key,
    )
    assert.equal(errText(errors).includes(marker), false, 'G12 echo ' + key)
  }
})

test('G13 嵌套对象中的未知键全部拒绝', () => {
  expectError(
    validateRvcFakeRequest(request({ inputAudio: { ...audio(), token: 'fixture' } })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'inputAudio.<unknown-key>',
    'G13 inputAudio',
  )
  expectError(
    validateRvcFakeRequest(request({ rights: { state: 'CONFIRMED_FIXTURE', approvedBy: 'fixture' } })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'rights.<unknown-key>',
    'G13 rights',
  )
  expectError(
    validateRvcFakeRequest(request({ rights: { state: 'CONFIRMED_FIXTURE', userToken: 'fixture' } })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'rights.<unknown-key>',
    'G13 rights token',
  )
  expectError(
    simulateRvcFakeConversion(request(), context({ url: 'https://example.test' })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    '<unknown-key>',
    'G13 context',
  )
  const success = scenarioResult('SUCCESS')
  expectError(
    validateRvcFakeResult({ ...success, cancel: { ...success.cancel, token: 'fixture' } }, request(), context()),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'cancel.<unknown-key>',
    'G13 result cancel',
  )
  expectError(
    validateRvcFakeResult({ ...success, delivery: { ...success.delivery, backend: 'fixture' } }, request(), context()),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'delivery.<unknown-key>',
    'G13 result delivery',
  )
})

test('G14 Symbol、隐藏与访问器在各层被拒绝且从不执行', () => {
  let reads = 0
  const symbolRequest = withSymbol(request(), 'fixture-secret', 'x')
  const symbolErrors = expectError(validateRvcFakeRequest(symbolRequest), RVC_FAKE_ERRORS.UNKNOWN_FIELD, '<unknown-key>', 'G14 symbol')
  assert.equal(errText(symbolErrors).includes('fixture-secret'), false)

  expectError(
    validateRvcFakeRequest(withHidden(request(), 'token', 'fixture')),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    '<unknown-key>',
    'G14 hidden request',
  )
  expectError(
    validateRvcFakeRequest(request({ inputAudio: withHidden(audio(), 'send', true) })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'inputAudio.<unknown-key>',
    'G14 hidden inputAudio',
  )
  expectError(
    validateRvcFakeRequest(request({ rights: withSymbol({ state: 'CONFIRMED_FIXTURE' }, 'fixture-secret', 'x') })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'rights.<unknown-key>',
    'G14 symbol rights',
  )

  const getterRequest = { ...request() }
  Object.defineProperty(getterRequest, 'pitchShift', {
    get() {
      reads += 1
      return 0
    },
    enumerable: true,
    configurable: true,
  })
  expectError(validateRvcFakeRequest(getterRequest), RVC_FAKE_ERRORS.TYPE_MISMATCH, 'pitchShift', 'G14 getter request')

  const getterContext = {}
  Object.defineProperty(getterContext, 'requestId', {
    get() {
      reads += 1
      return 'request:fixture-demo-a'
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(getterContext, 'endpointId', { value: ENDPOINT, enumerable: true, configurable: true, writable: true })
  Object.defineProperty(getterContext, 'scenario', { value: 'SUCCESS', enumerable: true, configurable: true, writable: true })
  expectError(
    simulateRvcFakeConversion(request(), getterContext),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'requestId',
    'G14 getter context',
  )
  assert.equal(reads, 0)
})

test('G15 null 原型与冻结合法输入可用，其他根类型按域拒绝', () => {
  const nullProto = Object.assign(Object.create(null), request())
  nullProto.inputAudio = Object.assign(Object.create(null), audio())
  nullProto.rights = Object.assign(Object.create(null), { state: 'CONFIRMED_FIXTURE' })
  expectOk(validateRvcFakeRequest(nullProto), 'G15 null proto')

  expectOk(validateRvcFakeRequest(Object.freeze(request())), 'G15 frozen request')
  expectOk(simulateRvcFakeConversion(Object.freeze(request()), Object.freeze(context())), 'G15 frozen simulate')

  for (const value of [null, [], 'fixture', 42, () => {}, new Date(0), new Map()]) {
    expectError(validateRvcFakeRequest(value), RVC_FAKE_ERRORS.INVALID_REQUEST, undefined, 'G15 request ' + String(value).slice(0, 20))
    expectError(simulateRvcFakeConversion(request(), value), RVC_FAKE_ERRORS.INVALID_CONTEXT, undefined, 'G15 context ' + String(value).slice(0, 20))
  }
  class FixtureRequest {}
  expectError(validateRvcFakeRequest(new FixtureRequest()), RVC_FAKE_ERRORS.INVALID_REQUEST, undefined, 'G15 class')
  expectError(
    validateRvcFakeRequest(Object.create({ schemaVersion: 1 })),
    RVC_FAKE_ERRORS.INVALID_REQUEST,
    undefined,
    'G15 custom prototype',
  )
})

test('G16 超限、循环、重复节点与深嵌输入有限失败', () => {
  const manyKeys = request()
  for (let index = 0; index < 26; index += 1) manyKeys['extra' + index] = 'x'
  const tooMany = expectError(validateRvcFakeRequest(manyKeys), RVC_FAKE_ERRORS.INVALID_REQUEST, undefined, 'G16 root keys')
  assert.equal(tooMany[0].reason, 'invalid object structure')

  const manyAudio = { ...audio() }
  for (let index = 0; index < 29; index += 1) manyAudio['extra' + index] = 'x'
  expectError(
    validateRvcFakeRequest(request({ inputAudio: manyAudio })),
    RVC_FAKE_ERRORS.INVALID_REQUEST,
    'inputAudio',
    'G16 nested keys',
  )

  const cyclic = request()
  cyclic.inputAudio = cyclic
  expectError(validateRvcFakeRequest(cyclic), RVC_FAKE_ERRORS.UNKNOWN_FIELD, 'inputAudio.<unknown-key>', 'G16 cycle')

  let deep = { leaf: 'fixture' }
  for (let index = 0; index < 10; index += 1) deep = { nested: deep }
  expectError(validateRvcFakeRequest(request({ extra: deep })), RVC_FAKE_ERRORS.UNKNOWN_FIELD, '<unknown-key>', 'G16 deep')

  const shared = { state: 'CONFIRMED_FIXTURE' }
  expectError(
    validateRvcFakeRequest(request({ rights: shared, inputAudio: shared })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    'inputAudio.<unknown-key>',
    'G16 repeated node',
  )
})

test('G17 context 的 ID、固定 endpoint 与 scenario 严格校验', () => {
  for (const requestId of ['request:demo', 'request:fixture-a b', 'request:fixture-', 'request:fixture-' + 'a'.repeat(33)]) {
    expectError(
      simulateRvcFakeConversion(request(), context({ requestId })),
      RVC_FAKE_ERRORS.INVALID_CONTEXT,
      'requestId',
      'G17 id ' + requestId.slice(0, 24),
    )
  }
  for (const endpointId of ['http://127.0.0.1:7865', 'https://example.test/rvc', 'localhost', 'gateway:other', '']) {
    expectError(
      simulateRvcFakeConversion(request(), context({ endpointId })),
      RVC_FAKE_ERRORS.INVALID_CONTEXT,
      'endpointId',
      'G17 endpoint ' + endpointId,
    )
  }
  expectError(
    simulateRvcFakeConversion(request(), context({ scenario: 'DONE' })),
    RVC_FAKE_ERRORS.INVALID_CONTEXT,
    'scenario',
    'G17 scenario',
  )
  expectError(
    simulateRvcFakeConversion(request(), context({ scenario: 42 })),
    RVC_FAKE_ERRORS.TYPE_MISMATCH,
    'scenario',
    'G17 scenario type',
  )
  expectError(
    simulateRvcFakeConversion(request(), { requestId: 'request:fixture-demo-a', endpointId: ENDPOINT }),
    RVC_FAKE_ERRORS.INVALID_CONTEXT,
    'scenario',
    'G17 missing scenario',
  )
  assert.deepEqual(Object.keys(context()).sort(), CONTEXT_KEYS)
})

test('G18 逐个缺失或显式 undefined 都拒绝且不补默认值', () => {
  for (const key of REQUEST_KEYS) {
    const missing = request()
    delete missing[key]
    expectError(validateRvcFakeRequest(missing), RVC_FAKE_ERRORS.INVALID_REQUEST, key, 'G18 missing ' + key)
    expectError(
      validateRvcFakeRequest(request({ [key]: undefined })),
      RVC_FAKE_ERRORS.INVALID_REQUEST,
      key,
      'G18 undefined ' + key,
    )
  }
  for (const key of AUDIO_KEYS) {
    expectError(
      validateRvcFakeRequest(request({ inputAudio: { ...audio(), [key]: undefined } })),
      RVC_FAKE_ERRORS.INVALID_REQUEST,
      'inputAudio.' + key,
      'G18 audio undefined ' + key,
    )
  }
  expectError(
    validateRvcFakeRequest(request({ rights: { state: undefined } })),
    RVC_FAKE_ERRORS.INVALID_REQUEST,
    'rights.state',
    'G18 rights undefined',
  )
  for (const key of CONTEXT_KEYS) {
    expectError(
      simulateRvcFakeConversion(request(), context({ [key]: undefined })),
      RVC_FAKE_ERRORS.INVALID_CONTEXT,
      key,
      'G18 context ' + key,
    )
  }
})

// ---------------------------------------------------------------------------------------------
// G19–G28 · simulation semantics
// ---------------------------------------------------------------------------------------------

test('G19 模型A + SUCCESS 产生 SUCCEEDED_FAKE 与关联产物', () => {
  const value = scenarioResult('SUCCESS')
  assert.deepEqual(Object.keys(value).sort(), RESULT_KEYS)
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.requestId, 'request:fixture-demo-a')
  assert.equal(value.engine, 'RVC_FAKE')
  assert.equal(value.targetModelId, MODEL_A)
  assert.equal(value.status, 'SUCCEEDED_FAKE')
  assert.equal(value.code, null)
  assert.equal(value.artifactRef, 'artifact:fixture-output-demo-a')
  assert.equal(value.mime, 'audio/wav')
  assert.equal(value.sampleRate, 44100)
  assert.equal(value.durationMs, 1200)
  assert.deepEqual({ ...value.cancel }, { requested: false, confirmed: false })
  assert.deepEqual({ ...value.delivery }, { state: 'NOT_REQUESTED', submitAllowed: false })
  assert.equal(value.mockOnly, true)
  assert.equal(value.realOperationAllowed, false)
  assert.equal(value.automaticRetryAllowed, false)
  assert.deepEqual(Object.keys(value.cancel).sort(), ['confirmed', 'requested'])
  assert.deepEqual(Object.keys(value.delivery).sort(), ['state', 'submitAllowed'])
})

test('G20 模型B 未就绪优先且不回退模型A', () => {
  const value = expectOk(simulateRvcFakeConversion(request({ targetModelId: MODEL_B }), context()), 'G20')
  assert.equal(value.targetModelId, MODEL_B)
  assert.equal(value.status, 'MODEL_NOT_AVAILABLE')
  assert.equal(value.code, RVC_FAKE_ERRORS.MODEL_NOT_AVAILABLE)
  for (const field of ['artifactRef', 'mime', 'sampleRate', 'durationMs']) assert.equal(value[field], null)
  assert.deepEqual({ ...value.cancel }, { requested: false, confirmed: false })
})

test('G21 OFFLINE 模拟响应无产物且禁自动重试', () => {
  const value = scenarioResult('OFFLINE')
  assert.equal(value.status, 'OFFLINE')
  assert.equal(value.code, RVC_FAKE_ERRORS.OFFLINE)
  for (const field of ['artifactRef', 'mime', 'sampleRate', 'durationMs']) assert.equal(value[field], null)
  assert.equal(value.automaticRetryAllowed, false)
})

test('G22 TIMEOUT 模拟响应无产物且不得自动重试', () => {
  const value = scenarioResult('TIMEOUT')
  assert.equal(value.status, 'TIMEOUT')
  assert.equal(value.code, RVC_FAKE_ERRORS.TIMEOUT)
  for (const field of ['artifactRef', 'mime', 'sampleRate', 'durationMs']) assert.equal(value[field], null)
  assert.equal(value.automaticRetryAllowed, false)
})

test('G23 MODEL_MISSING 模拟结果准确', () => {
  const value = scenarioResult('MODEL_MISSING')
  assert.equal(value.status, 'MODEL_NOT_AVAILABLE')
  assert.equal(value.code, RVC_FAKE_ERRORS.MODEL_NOT_AVAILABLE)
  for (const field of ['artifactRef', 'mime', 'sampleRate', 'durationMs']) assert.equal(value[field], null)
})

test('G24 取消请求不等于已停止', () => {
  const value = scenarioResult('CANCEL_REQUESTED')
  assert.equal(value.status, 'CANCEL_REQUESTED')
  assert.equal(value.code, RVC_FAKE_ERRORS.CANCEL_PENDING)
  assert.equal(value.cancel.requested, true)
  assert.equal(value.cancel.confirmed, false)
  for (const field of ['artifactRef', 'mime', 'sampleRate', 'durationMs']) assert.equal(value[field], null)
})

test('G25 CANCELLED_FAKE 仅表示模拟确认', () => {
  const value = scenarioResult('CANCEL_CONFIRMED')
  assert.equal(value.status, 'CANCELLED_FAKE')
  assert.equal(value.code, RVC_FAKE_ERRORS.CANCELLED)
  assert.deepEqual({ ...value.cancel }, { requested: true, confirmed: true })
  for (const field of ['artifactRef', 'mime', 'sampleRate', 'durationMs']) assert.equal(value[field], null)
})

test('G26 UNKNOWN 无产物、无重试、无后端切换', () => {
  const value = scenarioResult('UNKNOWN')
  assert.equal(value.status, 'UNKNOWN')
  assert.equal(value.code, RVC_FAKE_ERRORS.UNKNOWN)
  for (const field of ['artifactRef', 'mime', 'sampleRate', 'durationMs']) assert.equal(value[field], null)
  assert.equal(value.automaticRetryAllowed, false)
})

test('G27 模型B优先于 scenario，但 context 仍先校验', () => {
  for (const scenario of ['SUCCESS', 'OFFLINE', 'TIMEOUT', 'CANCEL_CONFIRMED', 'UNKNOWN']) {
    const value = expectOk(
      simulateRvcFakeConversion(request({ targetModelId: MODEL_B }), context({ scenario })),
      'G27 ' + scenario,
    )
    assert.equal(value.status, 'MODEL_NOT_AVAILABLE', 'G27 ' + scenario)
    assert.equal(value.code, RVC_FAKE_ERRORS.MODEL_NOT_AVAILABLE)
  }
  expectError(
    simulateRvcFakeConversion(request({ targetModelId: MODEL_B }), context({ scenario: 'DONE' })),
    RVC_FAKE_ERRORS.INVALID_CONTEXT,
    'scenario',
    'G27 invalid context first',
  )
  expectError(
    simulateRvcFakeConversion(request({ targetModelId: MODEL_B, pitchShift: 99 }), context()),
    RVC_FAKE_ERRORS.RESOURCE_LIMIT,
    'pitchShift',
    'G27 invalid request first',
  )
})

test('G28 成功产物与 requestId 关联且元数据准确', () => {
  const value = expectOk(
    simulateRvcFakeConversion(
      request({ inputAudio: audio({ durationMs: 2500 }) }),
      context({ requestId: 'request:fixture-x1' }),
    ),
    'G28',
  )
  assert.equal(value.requestId, 'request:fixture-x1')
  assert.equal(value.artifactRef, 'artifact:fixture-output-x1')
  assert.equal(value.sampleRate, 44100)
  assert.equal(value.durationMs, 2500)
  assert.equal(value.mime, 'audio/wav')
})

// ---------------------------------------------------------------------------------------------
// G29–G35 · result validation
// ---------------------------------------------------------------------------------------------

test('G29 合法结果验证返回新冻结副本，ok 不等于真实成功', () => {
  const req = request()
  const ctx = context()
  const simulated = expectOk(simulateRvcFakeConversion(req, ctx), 'G29 simulate')
  const validated = expectOk(validateRvcFakeResult(simulated, req, ctx), 'G29 validate')
  assert.deepEqual(validated, simulated)
  assert.notStrictEqual(validated, simulated)
  assert.equal(Object.isFrozen(validated), true)
  assert.equal(Object.isFrozen(validated.cancel), true)
  assert.equal(Object.isFrozen(validated.delivery), true)
  assert.equal(validated.mockOnly, true)
  assert.equal(validated.realOperationAllowed, false)
  assert.equal(validated.automaticRetryAllowed, false)
})

test('G30 结果关联错误被拒绝', () => {
  const req = request()
  const ctx = context()
  const success = scenarioResult('SUCCESS')
  const variants = [
    [{ ...success, requestId: 'request:fixture-other' }, RVC_FAKE_ERRORS.INVALID_RESULT],
    [{ ...success, targetModelId: MODEL_B }, RVC_FAKE_ERRORS.INVALID_RESULT],
    [{ ...success, engine: 'RVC_REAL' }, RVC_FAKE_ERRORS.INVALID_RESULT],
    [{ ...success, schemaVersion: 2 }, RVC_FAKE_ERRORS.UNSUPPORTED_VERSION],
    [{ ...success, status: 'SUCCEEDED' }, RVC_FAKE_ERRORS.INVALID_RESULT],
  ]
  for (const [result, code] of variants) {
    expectError(validateRvcFakeResult(result, req, ctx), code, undefined, 'G30 ' + code)
  }
})

test('G31 路径、URL、他产物或字节冒充结果被拒绝', () => {
  const req = request()
  const ctx = context()
  const success = scenarioResult('SUCCESS')
  for (const artifactRef of ['artifact:fixture-output-other', 'C:\\fixture\\out.wav', 'https://example.test/out.wav', 'fixture.wav']) {
    expectError(
      validateRvcFakeResult({ ...success, artifactRef }, req, ctx),
      RVC_FAKE_ERRORS.INVALID_RESULT,
      undefined,
      'G31 artifact ' + artifactRef,
    )
  }
  expectError(
    validateRvcFakeResult({ ...success, bytes: 'fixture' }, req, ctx),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    '<unknown-key>',
    'G31 bytes',
  )
})

test('G32 错误 mime、采样率与时长被拒绝', () => {
  const req = request()
  const ctx = context()
  const success = scenarioResult('SUCCESS')
  for (const patch of [{ mime: 'audio/mp3' }, { sampleRate: 22050 }, { durationMs: 999 }]) {
    expectError(
      validateRvcFakeResult({ ...success, ...patch }, req, ctx),
      RVC_FAKE_ERRORS.INVALID_RESULT,
      'result',
      'G32 ' + Object.keys(patch)[0],
    )
  }
})

test('G33 非成功状态不得携带音频描述', () => {
  const req = request()
  const ctx = context({ scenario: 'OFFLINE' })
  const offline = expectOk(simulateRvcFakeConversion(req, ctx), 'G33 simulate')
  assert.equal(offline.status, 'OFFLINE')
  for (const patch of [{ artifactRef: 'artifact:fixture-output-demo-a' }, { mime: 'audio/wav' }, { sampleRate: 44100 }, { durationMs: 1200 }]) {
    expectError(
      validateRvcFakeResult({ ...offline, ...patch }, req, ctx),
      RVC_FAKE_ERRORS.INVALID_RESULT,
      'result',
      'G33 ' + Object.keys(patch)[0],
    )
  }
})

test('G34 取消标志与状态矛盾被拒绝', () => {
  const req = request()
  const ctx = context()
  const success = scenarioResult('SUCCESS')
  expectError(
    validateRvcFakeResult({ ...success, cancel: { requested: true, confirmed: false } }, req, ctx),
    RVC_FAKE_ERRORS.INVALID_RESULT,
    'result',
    'G34 success cancelled',
  )
  const cancelCtx = context({ scenario: 'CANCEL_REQUESTED' })
  const cancelRequested = expectOk(simulateRvcFakeConversion(req, cancelCtx), 'G34 simulate cancel')
  expectError(
    validateRvcFakeResult({ ...cancelRequested, cancel: { requested: true, confirmed: true } }, req, cancelCtx),
    RVC_FAKE_ERRORS.INVALID_RESULT,
    'result',
    'G34 premature confirmation',
  )
})

test('G35 固定标志与发送状态不可翻转', () => {
  const req = request()
  const ctx = context()
  const success = scenarioResult('SUCCESS')
  const variants = [
    { ...success, mockOnly: false },
    { ...success, realOperationAllowed: true },
    { ...success, automaticRetryAllowed: true },
    { ...success, delivery: { state: 'SENT', submitAllowed: false } },
    { ...success, delivery: { state: 'NOT_REQUESTED', submitAllowed: true } },
    { ...success, status: 'SENT' },
  ]
  for (const result of variants) {
    expectError(validateRvcFakeResult(result, req, ctx), RVC_FAKE_ERRORS.INVALID_RESULT, undefined, 'G35 ' + JSON.stringify(result.delivery || result.status))
  }
})

// ---------------------------------------------------------------------------------------------
// G36–G40 · privacy, immutability, determinism, purity
// ---------------------------------------------------------------------------------------------

test('G36 错误信封不回显私密键值、Symbol、异常或堆栈', () => {
  const marker = 'fixture-private-marker'
  const errors = expectError(
    validateRvcFakeRequest(request({ [marker + '@example.test']: marker })),
    RVC_FAKE_ERRORS.UNKNOWN_FIELD,
    '<unknown-key>',
    'G36 key',
  )
  assert.equal(errText(errors).includes(marker), false)

  const symbolRequest = withSymbol(request(), marker, 'x')
  const symbolErrors = expectError(validateRvcFakeRequest(symbolRequest), RVC_FAKE_ERRORS.UNKNOWN_FIELD, '<unknown-key>', 'G36 symbol')
  assert.equal(errText(symbolErrors).includes(marker), false)

  const throwing = { ...request() }
  Object.defineProperty(throwing, 'pitchShift', {
    get() {
      throw new Error(marker)
    },
    enumerable: true,
    configurable: true,
  })
  const throwErrors = expectError(validateRvcFakeRequest(throwing), RVC_FAKE_ERRORS.TYPE_MISMATCH, 'pitchShift', 'G36 throw')
  assert.equal(errText(throwErrors).includes(marker), false)
  assert.equal(errText(throwErrors).includes('stack'), false)
})

test('G37 输入不被修改，返回对象为新的冻结拷贝', () => {
  const req = request()
  const ctx = context()
  const reqSnapshot = JSON.stringify(req)
  const ctxSnapshot = JSON.stringify(ctx)
  const parsed = expectOk(validateRvcFakeRequest(req), 'G37 request')
  expectOk(simulateRvcFakeConversion(req, ctx), 'G37 simulate')
  assert.equal(JSON.stringify(req), reqSnapshot)
  assert.equal(JSON.stringify(ctx), ctxSnapshot)
  assert.notStrictEqual(parsed, req)
  assert.notStrictEqual(parsed.inputAudio, req.inputAudio)
  assert.throws(() => {
    parsed.pitchShift = 3
  }, TypeError)
})

test('G38 重复调用确定，不同 ID 输出不同，不宣称持久幂等', () => {
  const req = request()
  const ctx = context()
  const first = expectOk(simulateRvcFakeConversion(req, ctx), 'G38 first')
  const second = expectOk(simulateRvcFakeConversion(req, ctx), 'G38 second')
  assert.deepEqual(first, second)
  assert.notStrictEqual(first, second)
  const other = expectOk(simulateRvcFakeConversion(req, context({ requestId: 'request:fixture-demo-b' })), 'G38 other')
  assert.notEqual(first.artifactRef, other.artifactRef)
  const offline = expectOk(simulateRvcFakeConversion(req, context({ scenario: 'OFFLINE' })), 'G38 offline')
  assert.equal(offline.status, 'OFFLINE')
  assert.equal(first.status, 'SUCCEEDED_FAKE')
})

test('G39 固定 endpoint 不是网络授权，任意 URL 或备用后端被拒绝', () => {
  const endpoints = ['http://127.0.0.1:7865', 'http://localhost:7865', 'https://fixture.example.test', 'gateway:fixture-rvc-2', 'ws://127.0.0.1:7865']
  for (const endpointId of endpoints) {
    expectError(
      simulateRvcFakeConversion(request(), context({ endpointId })),
      RVC_FAKE_ERRORS.INVALID_CONTEXT,
      'endpointId',
      'G39 ' + endpointId,
    )
  }
  const source = readFileSync(fileURLToPath(new URL('../core/svc/rvc-fake-gateway.mjs', import.meta.url)), 'utf8')
  assert.equal(/\bfetch\s*\(|\bnode:http\b|\bnode:net\b|\bws:/.test(source), false, 'G39 no network client')
})

test('G40 模块零 import、无 I/O/时钟/随机/进程/异步/队列/持久化', () => {
  const source = readFileSync(fileURLToPath(new URL('../core/svc/rvc-fake-gateway.mjs', import.meta.url)), 'utf8')
  assert.equal(/^\s*import\s/m.test(source), false, 'G40 no import statements')
  const banned = [
    [/\brequire\s*\(/, 'require()'],
    [/\bnode:fs\b/, 'node:fs'],
    [/\bnode:http\b/, 'node:http'],
    [/\bnode:net\b/, 'node:net'],
    [/\bchild_process\b/, 'child_process'],
    [/\bDate\.now\b/, 'Date.now'],
    [/\bnew Date\b/, 'new Date'],
    [/\bMath\.random\b/, 'Math.random'],
    [/\bprocess\.env\b/, 'process.env'],
    [/\bsetTimeout\s*\(/, 'setTimeout'],
    [/\bsetInterval\s*\(/, 'setInterval'],
    [/\bPromise\b/, 'Promise'],
    [/\basync\b/, 'async'],
    [/\bawait\b/, 'await'],
    [/^(?:let|var)\s+/m, 'module-level mutable binding'],
  ]
  for (const [pattern, label] of banned) {
    assert.equal(pattern.test(source), false, 'G40 must not reference ' + label)
  }
  assert.equal(Object.keys(RVC_FAKE_ERRORS).length, 15)
  assert.equal(Object.isFrozen(RVC_FAKE_ERRORS), true)
  assert.equal(RVC_FAKE_ERRORS.INVALID_REQUEST, 'RVC_FAKE_INVALID_REQUEST')
  assert.equal(RVC_FAKE_ERRORS.UNKNOWN, 'RVC_FAKE_UNKNOWN')
})
