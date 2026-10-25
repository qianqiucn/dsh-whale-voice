/* Whale Audio Core — composed read-only view tests (Plan 05-B).
 *
 * Covers V01–V28 from the Plan 05-B specification. All fixtures are fictional and offline: no
 * media, no WeChat target, no network, no installation. The suite only reads the two accepted
 * pure modules for its fixtures and compares the composed view against them.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  AUDIO_TASK_STATES,
  createAudioTaskRecord,
  projectAudioTask,
  transitionAudioTask,
} from '../core/audio/task-contract.mjs'
import {
  FEATURE_MANIFEST_REVISION,
  evaluateFirstUse,
  listFeatureDependencies,
  projectFeatureAvailability,
} from '../core/audio/feature-manifest.mjs'
import {
  AUDIO_CORE_VIEW_ERRORS,
  AUDIO_CORE_VIEW_SCHEMA_VERSION,
  projectAudioCoreView,
} from '../core/audio/core-view.mjs'

const OBSERVED_AT = '2026-10-25T12:00:00.000Z'
const FEATURES = ['voice-bubbles', 'singing']
const VIEW_KEYS = [
  'actions',
  'activeFeature',
  'features',
  'mockOnly',
  'mode',
  'realOperationAllowed',
  'schemaVersion',
  'task',
  'userMessageZh',
]
const FEATURE_KEYS = ['availability', 'dependencies', 'firstUse']
const ACTION_KEYS = ['canGenerate', 'canInstall', 'canPreview', 'canSave', 'canSend', 'canRequestCancel']

function ttsDraft(overrides = {}) {
  return {
    schemaVersion: 1,
    taskId: 'task:fixture-voice-01',
    feature: 'voice-bubbles',
    taskType: 'TTS',
    source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' },
    voiceProfileId: 'voice:fixture-voice-01',
    deliveryRequested: false,
    rights: { state: 'CONFIRMED_FIXTURE' },
    ...overrides,
  }
}

function svcDraft(overrides = {}) {
  return {
    schemaVersion: 1,
    taskId: 'task:fixture-stage-01',
    feature: 'singing',
    taskType: 'SVC',
    source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-vocal-01' },
    voiceProfileId: 'voice:fixture-model-01',
    deliveryRequested: false,
    rights: { state: 'CONFIRMED_FIXTURE' },
    ...overrides,
  }
}

function buildRecord(draft) {
  const result = createAudioTaskRecord(draft, { observedAt: OBSERVED_AT })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.value
}

function advance(record, action) {
  const result = transitionAudioTask(record, action)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.value
}

function savedTts(overrides = {}) {
  let current = buildRecord(ttsDraft(overrides))
  current = advance(current, { type: 'BEGIN_PROCESS' })
  current = advance(current, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-private-source' })
  return advance(current, { type: 'MARK_SAVED' })
}

function savedSvc(overrides = {}) {
  let current = buildRecord(svcDraft(overrides))
  current = advance(current, { type: 'BEGIN_PROCESS' })
  current = advance(current, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-private-stage' })
  return advance(current, { type: 'MARK_SAVED' })
}

function recordForState(state) {
  switch (state) {
    case 'CREATED':
      return buildRecord(ttsDraft())
    case 'BLOCKED_RIGHTS':
      return buildRecord(ttsDraft({ rights: { state: 'UNVERIFIED' } }))
    case 'PROCESSING':
      return advance(buildRecord(ttsDraft()), { type: 'BEGIN_PROCESS' })
    case 'ARTIFACT_READY':
      return advance(advance(buildRecord(ttsDraft()), { type: 'BEGIN_PROCESS' }), {
        type: 'ATTACH_FAKE_ARTIFACT',
        artifactRef: 'artifact:fixture-out-01',
      })
    case 'SAVED':
      return savedTts()
    case 'CANCEL_REQUESTED':
      return advance(buildRecord(ttsDraft()), { type: 'REQUEST_CANCEL' })
    case 'CANCELLED':
      return advance(advance(buildRecord(ttsDraft()), { type: 'REQUEST_CANCEL' }), { type: 'CONFIRM_CANCEL' })
    case 'FAILED':
      return advance(buildRecord(ttsDraft()), { type: 'FAIL', code: 'AUDIO_FAKE_FAILURE' })
    case 'UNKNOWN':
      return advance(advance(buildRecord(ttsDraft()), { type: 'BEGIN_PROCESS' }), { type: 'MARK_UNKNOWN' })
    default:
      throw new Error('fixture state not covered: ' + state)
  }
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: 1,
    activeFeature: 'voice-bubbles',
    taskRecord: null,
    observationsByFeature: { 'voice-bubbles': {}, singing: {} },
    acknowledgedByFeature: {},
    manifestRevision: FEATURE_MANIFEST_REVISION,
    ...overrides,
  }
}

function okView(input, label = 'view') {
  const result = projectAudioCoreView(input)
  assert.equal(result.ok, true, label + ' expected ok, got ' + JSON.stringify(result.errors))
  return result.value
}

function failView(input, code, path, label) {
  const result = projectAudioCoreView(input)
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

function allVerified(feature) {
  return Object.fromEntries(listFeatureDependencies(feature).value.map((item) => [item.id, 'VERIFIED']))
}

// ---------------------------------------------------------------------------------------------
// V01–V05 · composed shape and task integration
// ---------------------------------------------------------------------------------------------

test('V01 无任务 Voice：九键、双功能、task=null、六 actions=false', () => {
  const view = okView(baseInput(), 'V01')
  assert.equal(view.schemaVersion, AUDIO_CORE_VIEW_SCHEMA_VERSION)
  assert.equal(view.mode, 'MOCK_ONLY')
  assert.equal(view.activeFeature, 'voice-bubbles')
  assert.deepEqual(Object.keys(view).sort(), VIEW_KEYS)
  assert.deepEqual(Object.keys(view.features).sort(), ['singing', 'voice-bubbles'])
  for (const feature of FEATURES) {
    assert.deepEqual(Object.keys(view.features[feature]).sort(), FEATURE_KEYS)
    assert.equal(view.features[feature].availability.mode, 'MOCK_ONLY')
    assert.equal(view.features[feature].availability.realReady, false)
    assert.equal(view.features[feature].firstUse.readOnly, true)
    assert.ok(Array.isArray(view.features[feature].dependencies))
    assert.ok(view.features[feature].dependencies.length > 0)
  }
  assert.equal(view.task, null)
  assert.deepEqual(Object.keys(view.actions).sort(), ACTION_KEYS.slice().sort())
  for (const key of ACTION_KEYS) assert.equal(view.actions[key], false, 'V01 action ' + key)
  assert.equal(view.mockOnly, true)
  assert.equal(view.realOperationAllowed, false)
  assert.equal(view.userMessageZh, '当前为演示只读视图，尚未接入真实生成、安装、试听、保存或发送。')
})

test('V02 无任务 Singing：共享结构正确且首访独立', () => {
  const view = okView(baseInput({ activeFeature: 'singing' }), 'V02')
  assert.equal(view.activeFeature, 'singing')
  assert.equal(view.task, null)
  assert.deepEqual(Object.keys(view.features).sort(), ['singing', 'voice-bubbles'])
  assert.equal(view.features.singing.firstUse.showDialog, true)
  assert.equal(view.features['voice-bubbles'].firstUse.showDialog, true)
  for (const key of ACTION_KEYS) assert.equal(view.actions[key], false, 'V02 action ' + key)
})

test('V03 合法 TTS 任务与既有投影一致', () => {
  const record = savedTts()
  const view = okView(baseInput({ taskRecord: record }), 'V03')
  assert.deepEqual(view.task, projectAudioTask(record).value)
  assert.equal(view.task.feature, 'voice-bubbles')
  assert.equal(view.task.hasOutput, true)
  for (const key of ACTION_KEYS) assert.equal(view.actions[key], false, 'V03 action ' + key)
})

test('V04 合法 SVC 任务复用同一投影，不复制 Task Schema', () => {
  const record = savedSvc()
  const view = okView(baseInput({ activeFeature: 'singing', taskRecord: record }), 'V04')
  const projection = projectAudioTask(record)
  assert.equal(projection.ok, true)
  assert.deepEqual(view.task, projection.value)
  assert.deepEqual(Object.keys(view.task).sort(), Object.keys(projection.value).sort())
  assert.equal(view.task.taskType, 'SVC')
})

test('V05 任务与活动功能不符时 FEATURE_MISMATCH 且无部分输出', () => {
  const record = savedTts()
  const errors = failView(
    baseInput({ activeFeature: 'singing', taskRecord: record }),
    AUDIO_CORE_VIEW_ERRORS.FEATURE_MISMATCH,
    'taskRecord.feature',
    'V05',
  )
  assert.equal(errors[0].reason, 'task does not belong to the active feature')
})

// ---------------------------------------------------------------------------------------------
// V06–V10 · input boundary
// ---------------------------------------------------------------------------------------------

test('V06 逐个缺少六个顶层字段与两个功能键都会被拒绝', () => {
  for (const key of ['schemaVersion', 'activeFeature', 'taskRecord', 'observationsByFeature', 'acknowledgedByFeature', 'manifestRevision']) {
    const input = baseInput()
    delete input[key]
    const errors = failView(input, AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, key, 'V06 ' + key)
    assert.equal(errors[0].reason, 'required')
  }
  for (const feature of FEATURES) {
    const input = baseInput()
    delete input.observationsByFeature[feature]
    const errors = failView(
      input,
      AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST,
      'observationsByFeature.' + feature,
      'V06 observations ' + feature,
    )
    assert.equal(errors[0].reason, 'required')
  }
})

test('V07 非普通对象输入一律失败', () => {
  const values = [null, undefined, [], 'fixture', 42, () => {}, new Map()]
  for (const value of values) {
    failView(value, AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, '$', 'V07 ' + String(value).slice(0, 20))
  }
  class FixtureView {}
  failView(new FixtureView(), AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, '$', 'V07 class')
  const inherited = Object.create({ schemaVersion: 1 })
  Object.assign(inherited, baseInput())
  failView(inherited, AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, '$', 'V07 custom prototype')
})

test('V08 schema 版本错误使用对应错误码', () => {
  const stringErrors = failView(
    baseInput({ schemaVersion: '1' }),
    AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH,
    'schemaVersion',
    'V08 string',
  )
  assert.equal(stringErrors[0].reason, 'expected integer schema version')
  failView(baseInput({ schemaVersion: 1.5 }), AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH, 'schemaVersion', 'V08 float')
  const unsupported = failView(
    baseInput({ schemaVersion: 2 }),
    AUDIO_CORE_VIEW_ERRORS.SCHEMA_UNSUPPORTED,
    'schemaVersion',
    'V08 v2',
  )
  assert.equal(unsupported[0].reason, 'unsupported schema version')
  failView(baseInput({ schemaVersion: 0 }), AUDIO_CORE_VIEW_ERRORS.SCHEMA_UNSUPPORTED, 'schemaVersion', 'V08 v0')
})

test('V09 顶层投递、目标、凭据与未知字段被拒绝且不回显', () => {
  const markers = ['deliveryId', 'targetChatId', 'token', 'apiKey', 'providerId', 'backend', 'sendMessage', 'url', 'path', 'plainText']
  for (const key of markers) {
    const marker = 'fixture-marker-' + key
    const errors = failView(baseInput({ [key]: marker }), AUDIO_CORE_VIEW_ERRORS.UNKNOWN_FIELD, '<unknown-key>', 'V09 ' + key)
    assert.equal(errText(errors).includes(marker), false, 'V09 echo ' + key)
  }
})

test('V10 新增两层的 Symbol、隐藏与访问器被拒绝且不执行 getter', () => {
  let reads = 0
  const symbolInput = baseInput()
  Object.defineProperty(symbolInput, Symbol('fixture-secret'), { value: 'x', enumerable: true })
  const symbolErrors = failView(symbolInput, AUDIO_CORE_VIEW_ERRORS.UNKNOWN_FIELD, '<unknown-key>', 'V10 symbol input')
  assert.equal(errText(symbolErrors).includes('fixture-secret'), false)

  failView(withHidden(baseInput(), 'token', 'fixture'), AUDIO_CORE_VIEW_ERRORS.UNKNOWN_FIELD, '<unknown-key>', 'V10 hidden input')

  const accessorInput = baseInput()
  Object.defineProperty(accessorInput, 'schemaVersion', {
    get() {
      reads += 1
      return 1
    },
    enumerable: true,
    configurable: true,
  })
  failView(accessorInput, AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH, 'schemaVersion', 'V10 accessor input')

  const symbolObservations = { 'voice-bubbles': {}, singing: {} }
  Object.defineProperty(symbolObservations, Symbol('fixture-secret'), { value: 'VERIFIED', enumerable: true })
  failView(
    baseInput({ observationsByFeature: symbolObservations }),
    AUDIO_CORE_VIEW_ERRORS.UNKNOWN_FIELD,
    'observationsByFeature.<unknown-key>',
    'V10 symbol observations',
  )

  failView(
    baseInput({ observationsByFeature: withHidden({ 'voice-bubbles': {}, singing: {} }, 'token', 'fixture') }),
    AUDIO_CORE_VIEW_ERRORS.UNKNOWN_FIELD,
    'observationsByFeature.<unknown-key>',
    'V10 hidden observations',
  )

  const accessorObservations = { 'voice-bubbles': {}, singing: {} }
  Object.defineProperty(accessorObservations, 'singing', {
    get() {
      reads += 1
      return {}
    },
    enumerable: true,
    configurable: true,
  })
  failView(
    baseInput({ observationsByFeature: accessorObservations }),
    AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH,
    'observationsByFeature.singing',
    'V10 accessor observations',
  )

  assert.equal(reads, 0)
})

// ---------------------------------------------------------------------------------------------
// V11–V14 · manifest failures
// ---------------------------------------------------------------------------------------------

test('V11 非法观察对象整体失败并归因到对应功能', () => {
  failView(
    baseInput({ observationsByFeature: { 'voice-bubbles': {}, singing: { 'telegram-bot': 'VERIFIED' } } }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'observationsByFeature.singing',
    'V11 unknown component',
  )
  failView(
    baseInput({ observationsByFeature: { 'voice-bubbles': { 'rvc-gateway': 'VERIFIED' }, singing: {} } }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'observationsByFeature.voice-bubbles',
    'V11 cross-feature component',
  )
  failView(
    baseInput({ observationsByFeature: { 'voice-bubbles': { 'audio-core': 'READY' }, singing: {} } }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'observationsByFeature.voice-bubbles',
    'V11 invalid state',
  )
  failView(
    baseInput({
      observationsByFeature: { 'voice-bubbles': withHidden({}, 'audio-core', 'VERIFIED'), singing: {} },
    }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'observationsByFeature.voice-bubbles',
    'V11 hidden component',
  )
  failView(
    baseInput({
      observationsByFeature: { 'voice-bubbles': withSymbol({}, 'fixture-secret', 'VERIFIED'), singing: {} },
    }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'observationsByFeature.voice-bubbles',
    'V11 symbol component',
  )
})

test('V12 非活动功能的输入错误同样导致整体失败', () => {
  const errors = failView(
    baseInput({
      activeFeature: 'voice-bubbles',
      observationsByFeature: { 'voice-bubbles': {}, singing: { 'telegram-bot': 'VERIFIED' } },
    }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'observationsByFeature.singing',
    'V12',
  )
  assert.ok(errors.length > 0)
})

test('V13 非法 acknowledgement 失败且不执行访问器、不回显', () => {
  failView(baseInput({ acknowledgedByFeature: null }), AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID, 'acknowledgedByFeature', 'V13 null')
  failView(
    baseInput({ acknowledgedByFeature: { wechat: 'plan05a.v1' } }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'acknowledgedByFeature',
    'V13 unknown key',
  )
  failView(
    baseInput({ acknowledgedByFeature: { singing: 42 } }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'acknowledgedByFeature',
    'V13 bad value',
  )
  failView(
    baseInput({ acknowledgedByFeature: withHidden({}, 'singing', FEATURE_MANIFEST_REVISION) }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'acknowledgedByFeature',
    'V13 hidden entry',
  )
  const symbolAck = withSymbol({}, 'fixture-secret', FEATURE_MANIFEST_REVISION)
  const symbolErrors = failView(baseInput({ acknowledgedByFeature: symbolAck }), AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID, 'acknowledgedByFeature', 'V13 symbol')
  assert.equal(errText(symbolErrors).includes('fixture-secret'), false)

  let reads = 0
  const throwingAck = {}
  Object.defineProperty(throwingAck, 'singing', {
    get() {
      reads += 1
      throw new Error('fixture-ack-marker')
    },
    enumerable: true,
    configurable: true,
  })
  const accessorErrors = failView(
    baseInput({ acknowledgedByFeature: throwingAck }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'acknowledgedByFeature',
    'V13 accessor',
  )
  assert.equal(reads, 0)
  assert.equal(errText(accessorErrors).includes('fixture-ack-marker'), false)
})

test('V14 manifestRevision 的类型与格式错误使用固定安全错误', () => {
  const emptyErrors = failView(
    baseInput({ manifestRevision: '' }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'manifestRevision',
    'V14 empty',
  )
  assert.equal(emptyErrors[0].reason, 'manifest revision could not be validated')
  failView(
    baseInput({ manifestRevision: 'bad revision!' }),
    AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
    'manifestRevision',
    'V14 format',
  )
  failView(baseInput({ manifestRevision: 42 }), AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH, 'manifestRevision', 'V14 type')
  failView(baseInput({ manifestRevision: undefined }), AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH, 'manifestRevision', 'V14 undefined')
})

// ---------------------------------------------------------------------------------------------
// V15–V18 · task validation and first-use isolation
// ---------------------------------------------------------------------------------------------

test('V15 draft、投影或残缺记录都不能冒充任务记录', () => {
  failView(baseInput({ taskRecord: ttsDraft() }), AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'V15 draft')
  const saved = savedTts()
  const partial = { ...saved }
  delete partial.source
  failView(baseInput({ taskRecord: partial }), AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'V15 partial')
  failView(
    baseInput({ taskRecord: projectAudioTask(saved).value }),
    AUDIO_CORE_VIEW_ERRORS.TASK_INVALID,
    'taskRecord',
    'V15 projection',
  )
  failView(baseInput({ taskRecord: 'fixture' }), AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH, 'taskRecord', 'V15 string')
  failView(baseInput({ taskRecord: [] }), AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH, 'taskRecord', 'V15 array')
})

test('V16 任务内的敏感、隐藏、Symbol 与访问器沿用 F01 拒绝', () => {
  const saved = savedTts()
  failView(
    baseInput({ taskRecord: { ...saved, source: { ...saved.source, token: 'fixture' } } }),
    AUDIO_CORE_VIEW_ERRORS.TASK_INVALID,
    'taskRecord',
    'V16 nested token',
  )
  failView(baseInput({ taskRecord: withHidden(saved, 'token', 'fixture') }), AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'V16 hidden')
  failView(
    baseInput({ taskRecord: withSymbol(saved, 'fixture-secret', 'x') }),
    AUDIO_CORE_VIEW_ERRORS.TASK_INVALID,
    'taskRecord',
    'V16 symbol',
  )
  let reads = 0
  const accessorRecord = { ...saved }
  Object.defineProperty(accessorRecord, 'source', {
    get() {
      reads += 1
      return { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' }
    },
    enumerable: true,
    configurable: true,
  })
  failView(baseInput({ taskRecord: accessorRecord }), AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'V16 accessor')
  assert.equal(reads, 0)
})

test('V17 两个功能的首访保持独立', () => {
  const view = okView(
    baseInput({ acknowledgedByFeature: { 'voice-bubbles': FEATURE_MANIFEST_REVISION } }),
    'V17',
  )
  assert.equal(view.features['voice-bubbles'].firstUse.showDialog, false)
  assert.equal(view.features.singing.firstUse.showDialog, true)
  assert.equal(view.features['voice-bubbles'].firstUse.reason, 'ALREADY_ACKNOWLEDGED')
  assert.equal(view.features.singing.firstUse.reason, 'FIRST_USE')
})

test('V18 清单版本变化时按各自记录重新提示', () => {
  const view = okView(
    baseInput({
      acknowledgedByFeature: { 'voice-bubbles': 'plan05a.v0', singing: FEATURE_MANIFEST_REVISION },
    }),
    'V18',
  )
  assert.equal(view.features['voice-bubbles'].firstUse.showDialog, true)
  assert.equal(view.features['voice-bubbles'].firstUse.reason, 'REVISION_CHANGED')
  assert.equal(view.features.singing.firstUse.showDialog, false)
  assert.equal(view.features.singing.firstUse.reason, 'ALREADY_ACKNOWLEDGED')
})

// ---------------------------------------------------------------------------------------------
// V19–V23 · availability behaviour and redaction
// ---------------------------------------------------------------------------------------------

test('V19 全部 Fake VERIFIED 仍为 MOCK_ONLY 且 actions 全 false', () => {
  const view = okView(
    baseInput({
      observationsByFeature: { 'voice-bubbles': allVerified('voice-bubbles'), singing: allVerified('singing') },
    }),
    'V19',
  )
  assert.equal(view.mode, 'MOCK_ONLY')
  assert.equal(view.mockOnly, true)
  assert.equal(view.realOperationAllowed, false)
  for (const feature of FEATURES) {
    assert.equal(view.features[feature].availability.mode, 'MOCK_ONLY')
    assert.equal(view.features[feature].availability.realReady, false)
  }
  for (const key of ACTION_KEYS) assert.equal(view.actions[key], false, 'V19 action ' + key)
})

test('V20 缺微信组件只影响 deliveryRequired', () => {
  const observations = {
    'audio-core': 'VERIFIED',
    'tts-selected': 'VERIFIED',
    'voice-profile': 'VERIFIED',
    'preview-save': 'VERIFIED',
    wechatagent: 'MISSING',
  }
  const view = okView(
    baseInput({ observationsByFeature: { 'voice-bubbles': observations, singing: {} } }),
    'V20',
  )
  const availability = view.features['voice-bubbles'].availability
  assert.deepEqual([...availability.missingRequired], [])
  assert.ok(availability.deliveryRequired.includes('wechatagent'))
  assert.equal(availability.realReady, false)
})

test('V21 Seed-VC 即使 VERIFIED 仍不可用，RVC 必需集合不变', () => {
  const view = okView(
    baseInput({
      activeFeature: 'singing',
      observationsByFeature: { 'voice-bubbles': {}, singing: allVerified('singing') },
    }),
    'V21',
  )
  const singing = view.features.singing
  assert.ok(singing.availability.optionalUnavailable.includes('seed-vc'))
  const required = singing.dependencies.filter((item) => item.requirement === 'REQUIRED').map((item) => item.id)
  assert.deepEqual(required, ['audio-core', 'rvc-gateway', 'rvc-voice-model', 'source-rights', 'preview-save'])
  assert.equal(required.includes('seed-vc'), false)
})

test('V22 九个合法可达状态都使用既有演示投影', () => {
  for (const state of Object.values(AUDIO_TASK_STATES)) {
    const record = recordForState(state)
    assert.equal(record.state, state)
    const view = okView(baseInput({ activeFeature: record.feature, taskRecord: record }), 'V22 ' + state)
    assert.deepEqual(view.task, projectAudioTask(record).value, 'V22 projection ' + state)
    for (const key of ACTION_KEYS) assert.equal(view.actions[key], false, 'V22 action ' + state)
  }
})

test('V23 输出与序列化都不含原始引用、rights、时间或私密标记', () => {
  const record = savedTts()
  assert.equal(record.outputArtifactRef, 'artifact:fixture-private-source')
  const view = okView(baseInput({ taskRecord: record }), 'V23')
  const text = JSON.stringify(view)
  for (const fragment of [
    'artifact:',
    'fixture-private-source',
    'fixture-private-stage',
    '"source"',
    '"rights"',
    'observedAt',
    'deliveryId',
    'outputArtifactRef',
    'artifactRef',
    'rawError',
  ]) {
    assert.equal(text.includes(fragment), false, 'V23 leak ' + fragment)
  }
  assert.equal(Object.prototype.hasOwnProperty.call(view.task, 'source'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(view.task, 'outputArtifactRef'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(view.task, 'rights'), false)
  assert.equal(typeof view.task.taskId, 'string')
  assert.equal(typeof view.task.voiceProfileId, 'string')
  assert.equal(typeof view.task.deliveryRequested, 'boolean')
})

// ---------------------------------------------------------------------------------------------
// V24–V28 · immutability, compatibility, robustness, purity
// ---------------------------------------------------------------------------------------------

test('V24 结果深冻结、每次新对象图、输入不变', () => {
  const input = baseInput({
    taskRecord: savedTts(),
    acknowledgedByFeature: { 'voice-bubbles': FEATURE_MANIFEST_REVISION },
  })
  const snapshot = JSON.stringify(input)
  const first = okView(input, 'V24 first')
  const second = okView(input, 'V24 second')
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first.features, second.features)
  assert.notStrictEqual(first.features['voice-bubbles'], second.features['voice-bubbles'])
  assert.notStrictEqual(first.features['voice-bubbles'].dependencies, second.features['voice-bubbles'].dependencies)
  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(input), snapshot)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.features))
  assert.ok(Object.isFrozen(first.features['voice-bubbles']))
  assert.ok(Object.isFrozen(first.features['voice-bubbles'].dependencies))
  assert.ok(Object.isFrozen(first.features['voice-bubbles'].availability))
  assert.ok(Object.isFrozen(first.features['voice-bubbles'].firstUse))
  assert.ok(Object.isFrozen(first.actions))
  assert.ok(Object.isFrozen(first.task))
  assert.throws(() => {
    first.actions.canGenerate = true
  }, TypeError)
  assert.throws(() => {
    first.features.singing.firstUse.showDialog = true
  }, TypeError)
  assert.equal(first.actions.canGenerate, false)
})

test('V25 null 原型与冻结输入可用，继承字段不能替代必填项', () => {
  const nullProto = Object.assign(Object.create(null), baseInput())
  const view = okView(nullProto, 'V25 null prototype')
  assert.equal(view.task, null)
  const frozen = Object.freeze(baseInput())
  okView(frozen, 'V25 frozen')
  const inherited = Object.create(baseInput())
  failView(inherited, AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, '$', 'V25 inherited fields')
  const nullProtoMissing = Object.assign(Object.create(null), baseInput())
  delete nullProtoMissing.schemaVersion
  failView(nullProtoMissing, AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, 'schemaVersion', 'V25 null proto missing')
})

test('V26 超限、循环、过深、重复节点均有限失败', () => {
  const manyKeys = baseInput()
  for (let index = 0; index < 27; index += 1) manyKeys['extra' + index] = 'x'
  const tooMany = failView(manyKeys, AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, '$', 'V26 input keys')
  assert.equal(tooMany[0].reason, 'too many fields')

  const manyObservations = { 'voice-bubbles': {}, singing: {} }
  for (let index = 0; index < 31; index += 1) manyObservations['extra' + index] = 'VERIFIED'
  const tooManyObservations = failView(
    baseInput({ observationsByFeature: manyObservations }),
    AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST,
    'observationsByFeature',
    'V26 observation keys',
  )
  assert.equal(tooManyObservations[0].reason, 'too many fields')

  const cyclic = { ...savedTts() }
  cyclic.cancel = { ...cyclic.cancel }
  cyclic.cancel.self = cyclic
  failView(baseInput({ taskRecord: cyclic }), AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'V26 task cycle')

  const shared = { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' }
  const repeatedDraft = ttsDraft({ source: shared, rights: shared })
  failView(baseInput({ taskRecord: repeatedDraft }), AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'V26 repeated')

  let deep = { leaf: 'fixture' }
  for (let index = 0; index < 8; index += 1) deep = { nested: deep }
  failView(
    baseInput({ taskRecord: { ...savedTts(), extra: deep } }),
    AUDIO_CORE_VIEW_ERRORS.TASK_INVALID,
    'taskRecord',
    'V26 deep',
  )
})

test('V27 组合结果与两个功能的公开函数逐项一致且互不影响', () => {
  const observationsVoice = {
    'audio-core': 'VERIFIED',
    'tts-selected': 'MISSING',
    'voice-profile': 'VERIFIED',
    'preview-save': 'UNKNOWN',
  }
  const observationsSinging = {
    'audio-core': 'VERIFIED',
    'rvc-gateway': 'BLOCKED',
    'rvc-voice-model': 'UNKNOWN',
    'source-rights': 'VERIFIED',
    'preview-save': 'VERIFIED',
  }
  const acknowledged = { 'voice-bubbles': FEATURE_MANIFEST_REVISION }
  const input = baseInput({
    observationsByFeature: { 'voice-bubbles': observationsVoice, singing: observationsSinging },
    acknowledgedByFeature: acknowledged,
  })
  const view = okView(input, 'V27')
  for (const feature of FEATURES) {
    assert.deepEqual(view.features[feature].dependencies, listFeatureDependencies(feature).value, 'V27 dependencies ' + feature)
    assert.deepEqual(
      view.features[feature].availability,
      projectFeatureAvailability(feature, input.observationsByFeature[feature]).value,
      'V27 availability ' + feature,
    )
    assert.deepEqual(
      view.features[feature].firstUse,
      evaluateFirstUse(feature, acknowledged, FEATURE_MANIFEST_REVISION).value,
      'V27 firstUse ' + feature,
    )
  }
  const changed = okView(
    baseInput({
      observationsByFeature: { 'voice-bubbles': observationsVoice, singing: { 'audio-core': 'MISSING' } },
      acknowledgedByFeature: acknowledged,
    }),
    'V27 changed',
  )
  assert.deepEqual(changed.features['voice-bubbles'], view.features['voice-bubbles'])
  assert.notDeepEqual(changed.features.singing, view.features.singing)
})

test('V28 模块只导入两个纯模块，无 I/O、时钟、随机、进程或状态转移', () => {
  const source = readFileSync(fileURLToPath(new URL('../core/audio/core-view.mjs', import.meta.url)), 'utf8')
  const specifiers = [...source.matchAll(/^\s*import\s+(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/gm)].map((match) => match[1])
  assert.deepEqual(specifiers.sort(), ['./feature-manifest.mjs', './task-contract.mjs'])
  const banned = [
    [/\bcreateAudioTaskRecord\b/, 'createAudioTaskRecord'],
    [/\btransitionAudioTask\b/, 'transitionAudioTask'],
    [/\bbuildRelayHandoffCandidate\b/, 'buildRelayHandoffCandidate'],
    [/\bnode:fs\b/, 'node:fs'],
    [/\bnode:http\b/, 'node:http'],
    [/\bnode:net\b/, 'node:net'],
    [/\bchild_process\b/, 'child_process'],
    [/\brequire\s*\(/, 'require()'],
    [/\bDate\.now\b/, 'Date.now'],
    [/\bnew Date\b/, 'new Date'],
    [/\bMath\.random\b/, 'Math.random'],
    [/\bprocess\.env\b/, 'process.env'],
    [/\bfetch\s*\(/, 'fetch()'],
    [/\bsetTimeout\s*\(/, 'setTimeout'],
    [/^(?:let|var)\s+/m, 'module-level mutable binding'],
    [/\brandomUUID\b/, 'randomUUID'],
  ]
  for (const [pattern, label] of banned) {
    assert.equal(pattern.test(source), false, 'V28 must not reference ' + label)
  }
})
