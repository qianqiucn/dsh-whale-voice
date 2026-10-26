/* Whale Audio Core — offline pure-contract tests (Plan 05-A).
 *
 * Covers T01–T28 (CoreTask), F01–F14 (FeatureDependencyManifest) and R01–R10 (Relay candidate),
 * plus static purity guards. Everything here is Fake: no model, no audio file, no network, no
 * WeChat and no user data. Fixtures only use the reserved `artifact:fixture-*`,
 * `voice:fixture-*`, `task:fixture-*` and `delivery:fixture-*` placeholders.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  AUDIO_ERRORS,
  AUDIO_TASK_MESSAGES_ZH,
  AUDIO_TASK_SCHEMA_VERSION,
  AUDIO_TASK_STATE_LIST,
  AUDIO_TASK_STATES,
  createAudioTaskRecord,
  projectAudioTask,
  transitionAudioTask,
  validateAudioTaskDraft,
} from '../core/audio/task-contract.mjs'
import {
  FEATURE_IDS,
  FEATURE_MANIFEST_ERRORS,
  FEATURE_MANIFEST_REVISION,
  SEED_VC_STATUS,
  evaluateFirstUse,
  listFeatureDependencies,
  projectFeatureAvailability,
} from '../core/audio/feature-manifest.mjs'
import {
  RELAY_CANDIDATE_SCHEMA_VERSION,
  RELAY_CANDIDATE_STAGE,
  buildRelayHandoffCandidate,
} from '../core/audio/relay-handoff.mjs'
// Namespace import keeps the F01 regression suite loadable before the new export exists, so the
// pre-fix failures can be recorded honestly instead of failing at module load.
import * as audioContract from '../core/audio/task-contract.mjs'

const OBSERVED_AT = '2026-10-25T12:00:00.000Z'
// F01-03: unknown keys are reported with this fixed placeholder, never with the caller's key.
const UNKNOWN_PATH = '<unknown-key>'

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

function codesOf(result) {
  return result.ok ? [] : result.errors.map((error) => error.code)
}

function expectOk(result, label) {
  assert.equal(result.ok, true, label + ' expected ok, got ' + JSON.stringify(result.errors))
  return result.value
}

function expectError(result, code, label) {
  assert.equal(result.ok, false, label + ' expected a structured failure')
  assert.ok(
    codesOf(result).includes(code),
    label + ' expected ' + code + ', got ' + JSON.stringify(result.errors),
  )
  return result.errors
}

function record(draft) {
  return expectOk(createAudioTaskRecord(draft, { observedAt: OBSERVED_AT }), 'createAudioTaskRecord')
}

function step(current, action) {
  return expectOk(transitionAudioTask(current, action), 'transitionAudioTask ' + action.type)
}

function processingRecord() {
  return step(record(ttsDraft()), { type: 'BEGIN_PROCESS' })
}

function attachedRecord() {
  return step(processingRecord(), { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-out-01' })
}

function savedRecord(overrides = {}) {
  const created = record(ttsDraft(overrides))
  const processing = step(created, { type: 'BEGIN_PROCESS' })
  const attached = step(processing, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-out-01' })
  return step(attached, { type: 'MARK_SAVED' })
}

function savedFixture() {
  return step(attachedRecord(), { type: 'MARK_SAVED' })
}

function savedSvcFixture(deliveryRequested = false) {
  const created = record(svcDraft({ deliveryRequested }))
  const processing = step(created, { type: 'BEGIN_PROCESS' })
  const attached = step(processing, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-stage-out-01' })
  return step(attached, { type: 'MARK_SAVED' })
}

function cancelledRecord() {
  return step(step(record(ttsDraft()), { type: 'REQUEST_CANCEL' }), { type: 'CONFIRM_CANCEL' })
}

function failedRecord() {
  return step(record(ttsDraft()), { type: 'FAIL', code: 'AUDIO_FAKE_FAILURE' })
}

function unknownRecord() {
  return step(processingRecord(), { type: 'MARK_UNKNOWN' })
}

// ---------------------------------------------------------------------------------------------
// CoreTask · draft validation (T01–T12)
// ---------------------------------------------------------------------------------------------

test('T01 TTS 基础 draft 通过并返回冻结的深度新拷贝', () => {
  const draft = ttsDraft()
  const { deliveryRequested: _ignored, ...withoutDelivery } = ttsDraft()
  const result = validateAudioTaskDraft(draft)
  const value = expectOk(result, 'T01')
  assert.equal(value.schemaVersion, AUDIO_TASK_SCHEMA_VERSION)
  assert.equal(value.taskId, 'task:fixture-voice-01')
  assert.equal(value.feature, 'voice-bubbles')
  assert.equal(value.taskType, 'TTS')
  assert.deepEqual({ ...value.source }, { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' })
  assert.equal(value.voiceProfileId, 'voice:fixture-voice-01')
  assert.equal(value.deliveryRequested, false)
  assert.deepEqual({ ...value.rights }, { state: 'CONFIRMED_FIXTURE' })
  assert.notStrictEqual(value, draft)
  assert.notStrictEqual(value.source, draft.source)
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.source), true)
  assert.equal(expectOk(validateAudioTaskDraft(withoutDelivery), 'T01 default').deliveryRequested, false)
})

test('T02 SVC 基础 draft 通过', () => {
  const value = expectOk(validateAudioTaskDraft(svcDraft()), 'T02')
  assert.equal(value.feature, 'singing')
  assert.equal(value.taskType, 'SVC')
  assert.equal(value.source.kind, 'AUDIO_REF')
  assert.equal(value.taskId, 'task:fixture-stage-01')
})

test('T03 feature 与 taskType 交叉配对必须被拒绝', () => {
  const voiceAsSvc = validateAudioTaskDraft(
    ttsDraft({ taskType: 'SVC', source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-vocal-01' } }),
  )
  expectError(voiceAsSvc, AUDIO_ERRORS.TYPE_MISMATCH, 'T03 voice-bubbles+SVC')
  const singingAsTts = validateAudioTaskDraft(
    svcDraft({ taskType: 'TTS', source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' } }),
  )
  expectError(singingAsTts, AUDIO_ERRORS.TYPE_MISMATCH, 'T03 singing+TTS')
})

test('T04 未知顶层字段被拒绝且不会被静默丢弃', () => {
  const errors = expectError(validateAudioTaskDraft(ttsDraft({ nickname: 'x' })), AUDIO_ERRORS.UNKNOWN_FIELD, 'T04')
  assert.equal(errors.length, 1)
  assert.equal(errors[0].path, UNKNOWN_PATH)
})

test('T04b 错误对象不回显看似路径或 URL 的字段名', () => {
  const result = validateAudioTaskDraft(ttsDraft({ 'C:\\Users\\fixture\\secret.txt': 'fixture' }))
  expectError(result, AUDIO_ERRORS.UNKNOWN_FIELD, 'T04b')
  const text = JSON.stringify(result)
  assert.equal(text.includes('Users'), false)
  assert.equal(text.includes('secret.txt'), false)
  assert.ok(text.includes('<unknown-key>'))
})

test('T05 发送与凭据类字段全部被拒绝', () => {
  const forbidden = ['send', 'wechat', 'targetChatId', 'token', 'apiKey', 'recipient', 'providerId', 'params', 'songId']
  for (const key of forbidden) {
    const result = validateAudioTaskDraft(ttsDraft({ [key]: 'fixture-value' }))
    expectError(result, AUDIO_ERRORS.UNKNOWN_FIELD, 'T05 ' + key)
  }
})

test('T06 用 URL 代替不透明 ref 被拒绝', () => {
  const result = validateAudioTaskDraft(
    ttsDraft({ source: { kind: 'TEXT_REF', ref: 'https://example.com/fixture.wav' } }),
  )
  expectError(result, AUDIO_ERRORS.INVALID_ID, 'T06')
})

test('T07 Windows 绝对路径或 UNC 路径被拒绝', () => {
  const paths = ['C:\\fixture\\vocal.wav', 'D:/fixture/vocal.wav', '\\\\fixture-host\\share\\vocal.wav']
  for (const value of paths) {
    expectError(
      validateAudioTaskDraft(svcDraft({ source: { kind: 'AUDIO_REF', ref: value } })),
      AUDIO_ERRORS.INVALID_ID,
      'T07 ' + value,
    )
  }
})

test('T08 缺少 source 被拒绝', () => {
  const { source: _ignored, ...withoutSource } = ttsDraft()
  const errors = expectError(validateAudioTaskDraft(withoutSource), AUDIO_ERRORS.INVALID_REQUEST, 'T08')
  assert.ok(errors.some((error) => error.path === 'source'))
})

test('T09 source.kind 非法或与任务类型不匹配被拒绝', () => {
  expectError(
    validateAudioTaskDraft(ttsDraft({ source: { kind: 'IMAGE_REF', ref: 'artifact:fixture-text-01' } })),
    AUDIO_ERRORS.INVALID_REQUEST,
    'T09 unknown kind',
  )
  expectError(
    validateAudioTaskDraft(ttsDraft({ source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-vocal-01' } })),
    AUDIO_ERRORS.TYPE_MISMATCH,
    'T09 TTS with AUDIO_REF',
  )
  expectError(
    validateAudioTaskDraft(svcDraft({ source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' } })),
    AUDIO_ERRORS.TYPE_MISMATCH,
    'T09 SVC with TEXT_REF',
  )
})

test('T10 模型文件名不能冒充共享 voiceProfileId', () => {
  const modelNames = ['whale-v1.pth', 'pretrained_v2/f0G40k.pth', 'C:\\models\\fixture.pth', 'model:whale']
  for (const value of modelNames) {
    expectError(validateAudioTaskDraft(ttsDraft({ voiceProfileId: value })), AUDIO_ERRORS.INVALID_ID, 'T10 ' + value)
  }
})

test('T11 非对象输入不抛错并返回结构化失败', () => {
  const inputs = [null, undefined, [], 'fixture', 42, () => {}, new Map()]
  for (const value of inputs) {
    const result = validateAudioTaskDraft(value)
    assert.equal(result.ok, false)
    assert.equal(codesOf(result)[0], AUDIO_ERRORS.INVALID_REQUEST)
  }
})

test('T12 schema 版本变化与非整数版本被拒绝', () => {
  expectError(validateAudioTaskDraft(ttsDraft({ schemaVersion: 2 })), AUDIO_ERRORS.INVALID_REQUEST, 'T12 v2')
  expectError(validateAudioTaskDraft(ttsDraft({ schemaVersion: 1.5 })), AUDIO_ERRORS.TYPE_MISMATCH, 'T12 v1.5')
  expectError(validateAudioTaskDraft(ttsDraft({ schemaVersion: '1' })), AUDIO_ERRORS.TYPE_MISMATCH, 'T12 string')
  const { schemaVersion: _ignored, ...withoutVersion } = ttsDraft()
  expectError(validateAudioTaskDraft(withoutVersion), AUDIO_ERRORS.INVALID_REQUEST, 'T12 missing')
})

test('T12b 循环引用输入被拒绝且不会无限递归', () => {
  const draft = ttsDraft()
  draft.source.self = draft
  const result = validateAudioTaskDraft(draft)
  expectError(result, AUDIO_ERRORS.INVALID_REQUEST, 'T12b cycle')
})

test('T12c source 与 rights 内部的未知字段被拒绝', () => {
  expectError(
    validateAudioTaskDraft(ttsDraft({ source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01', text: 'hello' } })),
    AUDIO_ERRORS.UNKNOWN_FIELD,
    'T12c source',
  )
  expectError(
    validateAudioTaskDraft(ttsDraft({ rights: { state: 'CONFIRMED_FIXTURE', approvedBy: 'fixture-user' } })),
    AUDIO_ERRORS.UNKNOWN_FIELD,
    'T12c rights',
  )
})

test('T12d 数组或超大对象图在固定预算内 fail closed', () => {
  const huge = new Array(10000).fill('fixture')
  expectError(validateAudioTaskDraft(ttsDraft({ source: huge })), AUDIO_ERRORS.INVALID_REQUEST, 'T12d array')
  expectError(validateAudioTaskDraft(ttsDraft({ rights: huge })), AUDIO_ERRORS.INVALID_REQUEST, 'T12d rights array')
})

// ---------------------------------------------------------------------------------------------
// CoreTask · records and state machine (T13–T20)
// ---------------------------------------------------------------------------------------------

test('T13 fixture rights 初始化为 CREATED 且固定 Mock 标记', () => {
  const value = record(ttsDraft())
  assert.equal(value.state, AUDIO_TASK_STATES.CREATED)
  assert.equal(value.mockOnly, true)
  assert.equal(value.realOperationAllowed, false)
  assert.equal(value.outputArtifactRef, null)
  assert.deepEqual({ ...value.cancel }, { requested: false, confirmed: false })
  assert.deepEqual({ ...value.delivery }, { state: 'NOT_REQUESTED', deliveryId: null })
  assert.equal(value.lastError, null)
  assert.equal(value.observedAt, OBSERVED_AT)
})

test('T13b metadata 时间戳必须由调用者注入且为合法 UTC RFC3339', () => {
  const good = ttsDraft()
  expectError(createAudioTaskRecord(good, {}), AUDIO_ERRORS.INVALID_REQUEST, 'T13b missing observedAt')
  expectError(createAudioTaskRecord(good, { observedAt: '2026-13-01T00:00:00.000Z' }), AUDIO_ERRORS.INVALID_REQUEST, 'T13b month')
  expectError(createAudioTaskRecord(good, { observedAt: '2026-02-30T00:00:00.000Z' }), AUDIO_ERRORS.INVALID_REQUEST, 'T13b day')
  expectError(
    createAudioTaskRecord(good, { observedAt: '2026-10-25T12:00:00+01:00' }),
    AUDIO_ERRORS.INVALID_REQUEST,
    'T13b offset',
  )
  expectError(
    createAudioTaskRecord(good, { observedAt: OBSERVED_AT, now: OBSERVED_AT }),
    AUDIO_ERRORS.UNKNOWN_FIELD,
    'T13b extra field',
  )
  assert.equal(expectOk(createAudioTaskRecord(good, { observedAt: '2024-02-29T23:59:59Z' }), 'T13b leap').observedAt, '2024-02-29T23:59:59Z')
})

test('T14 UNVERIFIED rights 进入 BLOCKED_RIGHTS 且不能开始处理', () => {
  const blocked = record(ttsDraft({ rights: { state: 'UNVERIFIED' } }))
  assert.equal(blocked.state, AUDIO_TASK_STATES.BLOCKED_RIGHTS)
  expectError(transitionAudioTask(blocked, { type: 'BEGIN_PROCESS' }), AUDIO_ERRORS.RIGHTS_UNCONFIRMED, 'T14')
  expectError(
    transitionAudioTask(blocked, { type: 'RELEASE_RIGHTS' }),
    AUDIO_ERRORS.UNKNOWN_FIELD,
    'T14 unknown action',
  )
})

test('T15 BEGIN_PROCESS 只允许 CREATED→PROCESSING 且不修改输入', () => {
  const created = record(ttsDraft())
  const processing = step(created, { type: 'BEGIN_PROCESS' })
  assert.equal(processing.state, AUDIO_TASK_STATES.PROCESSING)
  assert.equal(created.state, AUDIO_TASK_STATES.CREATED)
  assert.notStrictEqual(processing, created)
  expectError(transitionAudioTask(processing, { type: 'BEGIN_PROCESS' }), AUDIO_ERRORS.STATE_CONFLICT, 'T15 duplicate')
})

test('T16 只能挂载合法 Fake artifact', () => {
  const processing = processingRecord()
  const attached = step(processing, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-out-01' })
  assert.equal(attached.state, AUDIO_TASK_STATES.ARTIFACT_READY)
  assert.equal(attached.outputArtifactRef, 'artifact:fixture-out-01')
  expectError(
    transitionAudioTask(processing, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'C:\\fixture\\out.wav' }),
    AUDIO_ERRORS.INVALID_ID,
    'T16 path',
  )
  expectError(
    transitionAudioTask(attached, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-out-02' }),
    AUDIO_ERRORS.STATE_CONFLICT,
    'T16 repeat',
  )
})

test('T17 MARK_SAVED 只在 ARTIFACT_READY 后允许并保留输出引用', () => {
  const saved = savedFixture()
  assert.equal(saved.state, AUDIO_TASK_STATES.SAVED)
  assert.equal(saved.outputArtifactRef, 'artifact:fixture-out-01')
  const projection = expectOk(projectAudioTask(saved), 'T17 projection')
  assert.equal(projection.hasOutput, true)
})

test('T18 没有音频产物不能标记保存', () => {
  expectError(transitionAudioTask(processingRecord(), { type: 'MARK_SAVED' }), AUDIO_ERRORS.STATE_CONFLICT, 'T18 early')
  const forged = { ...savedFixture(), state: AUDIO_TASK_STATES.ARTIFACT_READY, outputArtifactRef: null }
  expectError(transitionAudioTask(forged, { type: 'MARK_SAVED' }), AUDIO_ERRORS.ARTIFACT_REQUIRED, 'T18 forged')
})

test('T19 取消、失败、未知终态不能继续推进', () => {
  const terminals = [cancelledRecord(), failedRecord(), unknownRecord()]
  for (const current of terminals) {
    for (const action of [
      { type: 'BEGIN_PROCESS' },
      { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-out-01' },
      { type: 'MARK_SAVED' },
      { type: 'REQUEST_CANCEL' },
      { type: 'CONFIRM_CANCEL' },
      { type: 'MARK_UNKNOWN' },
    ]) {
      expectError(
        transitionAudioTask(current, action),
        AUDIO_ERRORS.STATE_CONFLICT,
        'T19 ' + current.state + ' ' + action.type,
      )
    }
  }
})

test('T20 record/action 与输出之间没有共享的可变对象', () => {
  const draft = ttsDraft()
  const created = record(draft)
  draft.taskId = 'task:fixture-mutated'
  draft.source.ref = 'artifact:fixture-mutated'
  assert.equal(created.taskId, 'task:fixture-voice-01')
  assert.equal(created.source.ref, 'artifact:fixture-text-01')
  assert.notStrictEqual(created.source, draft.source)
  assert.throws(() => {
    created.state = AUDIO_TASK_STATES.SAVED
  }, TypeError)
  assert.throws(() => {
    created.source.ref = 'artifact:fixture-mutated'
  }, TypeError)
  const next = step(created, { type: 'BEGIN_PROCESS' })
  assert.notStrictEqual(next, created)
  assert.equal(created.state, AUDIO_TASK_STATES.CREATED)
  const action = { type: 'BEGIN_PROCESS' }
  step(created, action)
  assert.deepEqual(action, { type: 'BEGIN_PROCESS' })
})

test('T20b action 只接受预定义类型与字段', () => {
  const created = record(ttsDraft())
  expectError(transitionAudioTask(created, { type: 'SEND_TO_WECHAT' }), AUDIO_ERRORS.UNKNOWN_FIELD, 'T20b type')
  expectError(transitionAudioTask(created, { type: 'BEGIN_PROCESS', targetChatId: 'fixture' }), AUDIO_ERRORS.UNKNOWN_FIELD, 'T20b field')
  expectError(transitionAudioTask(created, null), AUDIO_ERRORS.INVALID_REQUEST, 'T20b null')
  expectError(transitionAudioTask(created, { type: 'FAIL', code: 'AUDIO_STACK_TRACE' }), AUDIO_ERRORS.INVALID_REQUEST, 'T20b code')
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    expectError(transitionAudioTask(created, { type }), AUDIO_ERRORS.UNKNOWN_FIELD, 'T20b prototype key ' + type)
  }
})

// ---------------------------------------------------------------------------------------------
// CoreTask · cancellation, UNKNOWN, SAVED semantics, projection (T21–T28)
// ---------------------------------------------------------------------------------------------

test('T21 CREATED 可以申请取消', () => {
  const requested = step(record(ttsDraft()), { type: 'REQUEST_CANCEL' })
  assert.equal(requested.state, AUDIO_TASK_STATES.CANCEL_REQUESTED)
  assert.equal(requested.cancel.requested, true)
  assert.equal(requested.cancel.confirmed, false)
})

test('T22 取消请求不等于取消确认', () => {
  const requested = step(record(ttsDraft()), { type: 'REQUEST_CANCEL' })
  assert.equal(requested.cancel.confirmed, false)
  expectError(transitionAudioTask(requested, { type: 'MARK_SAVED' }), AUDIO_ERRORS.STATE_CONFLICT, 'T22 no save')
  expectError(transitionAudioTask(requested, { type: 'BEGIN_PROCESS' }), AUDIO_ERRORS.STATE_CONFLICT, 'T22 no begin')
  assert.notEqual(requested.state, AUDIO_TASK_STATES.CANCELLED)
})

test('T23 CONFIRM_CANCEL 只在已申请后允许并给出 CANCELLED', () => {
  const cancelled = step(step(record(ttsDraft()), { type: 'REQUEST_CANCEL' }), { type: 'CONFIRM_CANCEL' })
  assert.equal(cancelled.state, AUDIO_TASK_STATES.CANCELLED)
  assert.equal(cancelled.cancel.requested, true)
  assert.equal(cancelled.cancel.confirmed, true)
})

test('T23b 从 ARTIFACT_READY 取消时保留已生成的 Fake 产物引用', () => {
  const attached = attachedRecord()
  const cancelled = step(step(attached, { type: 'REQUEST_CANCEL' }), { type: 'CONFIRM_CANCEL' })
  assert.equal(cancelled.state, AUDIO_TASK_STATES.CANCELLED)
  assert.equal(cancelled.outputArtifactRef, 'artifact:fixture-out-01')
  assert.equal(expectOk(projectAudioTask(cancelled), 'T23b').hasOutput, true)
})

test('T24 非法取消确认被拒绝', () => {
  expectError(transitionAudioTask(record(ttsDraft()), { type: 'CONFIRM_CANCEL' }), AUDIO_ERRORS.STATE_CONFLICT, 'T24 created')
  expectError(
    transitionAudioTask(processingRecord(), { type: 'CONFIRM_CANCEL' }),
    AUDIO_ERRORS.STATE_CONFLICT,
    'T24 processing',
  )
})

test('T25 PROCESSING→UNKNOWN 后不自动重试', () => {
  const processing = processingRecord()
  const unknown = step(processing, { type: 'MARK_UNKNOWN' })
  assert.equal(unknown.state, AUDIO_TASK_STATES.UNKNOWN)
  expectError(transitionAudioTask(unknown, { type: 'BEGIN_PROCESS' }), AUDIO_ERRORS.STATE_CONFLICT, 'T25 retry')
  expectError(transitionAudioTask(unknown, { type: 'MARK_UNKNOWN' }), AUDIO_ERRORS.STATE_CONFLICT, 'T25 repeat')
  expectError(transitionAudioTask(unknown, { type: 'MARK_SAVED' }), AUDIO_ERRORS.STATE_CONFLICT, 'T25 save')
  assert.ok(AUDIO_TASK_MESSAGES_ZH.UNKNOWN.includes('不会自动重发'))
})

test('T26 SAVED 是纯音频任务终态，不等于 APPLIED 或 SENT_LOCAL', () => {
  const saved = savedFixture()
  assert.equal(saved.state, AUDIO_TASK_STATES.SAVED)
  assert.equal(AUDIO_TASK_STATE_LIST.includes('APPLIED'), false)
  assert.equal(AUDIO_TASK_STATE_LIST.includes('SENT_LOCAL'), false)
  for (const action of [
    { type: 'BEGIN_PROCESS' },
    { type: 'REQUEST_CANCEL' },
    { type: 'FAIL', code: 'AUDIO_FAKE_FAILURE' },
    { type: 'MARK_UNKNOWN' },
  ]) {
    expectError(transitionAudioTask(saved, action), AUDIO_ERRORS.STATE_CONFLICT, 'T26 ' + action.type)
  }
  assert.ok(AUDIO_TASK_MESSAGES_ZH.SAVED.includes('不代表已经发送'))
})

test('T27 外部输入不能伪造 mockOnly 或 realOperationAllowed', () => {
  const created = record(ttsDraft())
  expectError(
    transitionAudioTask({ ...created, realOperationAllowed: true }, { type: 'BEGIN_PROCESS' }),
    AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    'T27 real',
  )
  expectError(
    transitionAudioTask({ ...created, mockOnly: false }, { type: 'BEGIN_PROCESS' }),
    AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    'T27 mock',
  )
})

test('T27b 伪造已发送或投递字段被拒绝', () => {
  const saved = savedFixture()
  expectError(transitionAudioTask({ ...saved, sent: true }, { type: 'MARK_SAVED' }), AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'T27b sent')
  expectError(
    transitionAudioTask({ ...saved, delivery: { state: 'SENT_LOCAL', deliveryId: 'delivery:fixture-01' } }, { type: 'MARK_SAVED' }),
    AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    'T27b delivery',
  )
  expectError(
    transitionAudioTask({ ...saved, lastError: { code: 'AUDIO_FAKE_FAILURE', stack: 'fixture' } }, { type: 'MARK_SAVED' }),
    AUDIO_ERRORS.STATE_CONFLICT,
    'T27b stray error',
  )
})

test('T28 projection 只输出白名单字段并给出中文演示状态', () => {
  const projection = expectOk(projectAudioTask(savedFixture()), 'T28')
  const expectedKeys = [
    'cancelConfirmed',
    'cancelRequested',
    'deliveryRequested',
    'feature',
    'hasInput',
    'hasOutput',
    'mockOnly',
    'realOperationAllowed',
    'schemaVersion',
    'state',
    'taskId',
    'taskType',
    'userMessageZh',
    'voiceProfileId',
  ]
  assert.deepEqual(Object.keys(projection).sort(), expectedKeys)
  const text = JSON.stringify(projection)
  assert.equal(text.includes('artifact:'), false)
  assert.equal(text.includes('"rights"'), false)
  assert.equal(text.includes('"source"'), false)
  assert.equal(text.includes('observedAt'), false)
  assert.ok(projection.userMessageZh.includes('演示状态，尚未接入真实生成'))
  assert.equal(projection.mockOnly, true)
  assert.equal(projection.realOperationAllowed, false)
  for (const state of AUDIO_TASK_STATE_LIST) {
    assert.equal(typeof AUDIO_TASK_MESSAGES_ZH[state], 'string')
  }
})

// ---------------------------------------------------------------------------------------------
// FeatureDependencyManifest (F01–F14)
// ---------------------------------------------------------------------------------------------

function dependencyBuckets(feature) {
  const dependencies = expectOk(listFeatureDependencies(feature), 'listFeatureDependencies ' + feature)
  return {
    dependencies,
    ids: dependencies.map((item) => item.id),
    required: dependencies.filter((item) => item.requirement === 'REQUIRED').map((item) => item.id),
    conditional: dependencies.filter((item) => item.requirement === 'CONDITIONAL').map((item) => item.id),
    optional: dependencies.filter((item) => item.requirement === 'OPTIONAL').map((item) => item.id),
    delivery: dependencies.filter((item) => item.requirement === 'DELIVERY_ONLY').map((item) => item.id),
  }
}

test('F01 Voice 的必需/可选/投递依赖分类', () => {
  const buckets = dependencyBuckets('voice-bubbles')
  assert.deepEqual(buckets.required, ['audio-core', 'tts-selected', 'voice-profile', 'preview-save'])
  assert.deepEqual(buckets.delivery, ['wechatagent', 'whale-relay', 'voice-sender'])
  assert.deepEqual(buckets.optional, [])
  assert.deepEqual(buckets.conditional, [])
  for (const item of buckets.dependencies) {
    assert.equal(item.implemented, false)
    assert.equal(typeof item.labelZh, 'string')
    assert.equal(typeof item.purposeZh, 'string')
    assert.deepEqual(Object.keys(item).sort(), ['id', 'implemented', 'labelZh', 'purposeZh', 'requirement'])
  }
})

test('F02 Singing 首发必需集合围绕 RVC，不包含 Seed-VC', () => {
  const buckets = dependencyBuckets('singing')
  assert.deepEqual(buckets.required, ['audio-core', 'rvc-gateway', 'rvc-voice-model', 'source-rights', 'preview-save'])
  assert.deepEqual(buckets.conditional, ['separator', 'mixer-encoder'])
  assert.deepEqual(buckets.optional, ['seed-vc'])
  assert.deepEqual(buckets.delivery, ['wechatagent', 'whale-relay', 'voice-sender'])
  assert.equal(buckets.required.includes('seed-vc'), false)
})

test('F03 Seed-VC 是后续 OPTIONAL/NOT_READY，不是首发依赖也不会自动安装', () => {
  const dependencies = expectOk(listFeatureDependencies('singing'), 'F03')
  const seedVc = dependencies.find((item) => item.id === 'seed-vc')
  assert.equal(seedVc.requirement, 'OPTIONAL')
  assert.equal(seedVc.implemented, false)
  assert.ok(seedVc.labelZh.includes('暂不支持'))
  assert.equal(SEED_VC_STATUS.requirementState, 'NOT_READY')
  assert.equal(SEED_VC_STATUS.supportedNow, false)
  assert.equal(SEED_VC_STATUS.notDefault, true)
  assert.equal(SEED_VC_STATUS.noAutoInstall, true)
})

test('F04 Singing 不接受未登记的组件键', () => {
  expectError(
    projectFeatureAvailability('singing', { 'telegram-bot': 'VERIFIED' }),
    FEATURE_MANIFEST_ERRORS.UNKNOWN_OBSERVATION,
    'F04 other platform',
  )
  expectError(
    projectFeatureAvailability('singing', { 'wechatagent-2': 'VERIFIED' }),
    FEATURE_MANIFEST_ERRORS.UNKNOWN_OBSERVATION,
    'F04 second account',
  )
  expectError(
    projectFeatureAvailability('voice-bubbles', { 'rvc-gateway': 'VERIFIED' }),
    FEATURE_MANIFEST_ERRORS.UNKNOWN_OBSERVATION,
    'F04 cross feature',
  )
  const pathLike = expectError(
    projectFeatureAvailability('singing', { 'C:\\Users\\fixture\\id.txt': 'VERIFIED' }),
    FEATURE_MANIFEST_ERRORS.UNKNOWN_OBSERVATION,
    'F04 path-like key',
  )
  assert.equal(JSON.stringify(pathLike).includes('Users'), false)
})

test('F05 缺 WeChatAgent 不阻塞本地生成、试听和保存', () => {
  const availability = expectOk(
    projectFeatureAvailability('voice-bubbles', {
      'audio-core': 'VERIFIED',
      'tts-selected': 'VERIFIED',
      'voice-profile': 'VERIFIED',
      'preview-save': 'VERIFIED',
      wechatagent: 'MISSING',
    }),
    'F05',
  )
  assert.deepEqual([...availability.missingRequired], [])
  assert.deepEqual([...availability.unknownRequired], [])
  assert.ok(availability.deliveryRequired.includes('wechatagent'))
  assert.equal(availability.realReady, false)
  assert.equal(availability.mode, 'MOCK_ONLY')
  assert.ok(availability.userMessageZh.includes('不影响本地生成、试听和保存'))
})

test('F06 缺少 Audio Core 时永远不是 ready', () => {
  const availability = expectOk(
    projectFeatureAvailability('voice-bubbles', {
      'audio-core': 'MISSING',
      'tts-selected': 'VERIFIED',
      'voice-profile': 'VERIFIED',
      'preview-save': 'VERIFIED',
    }),
    'F06',
  )
  assert.deepEqual([...availability.missingRequired], ['audio-core'])
  assert.equal(availability.realReady, false)
  assert.ok(availability.userMessageZh.includes('必需组件缺失'))
})

test('F07 未知的模型资产只报 UNKNOWN', () => {
  const availability = expectOk(
    projectFeatureAvailability('singing', {
      'audio-core': 'VERIFIED',
      'rvc-gateway': 'VERIFIED',
      'rvc-voice-model': 'UNKNOWN',
      'source-rights': 'VERIFIED',
      'preview-save': 'VERIFIED',
    }),
    'F07',
  )
  assert.deepEqual([...availability.unknownRequired], ['rvc-voice-model'])
  assert.deepEqual([...availability.missingRequired], [])
  assert.equal(availability.realReady, false)
})

test('F08 无 GPU 或资源未证只能显示未知，不能宣称可用', () => {
  const availability = expectOk(
    projectFeatureAvailability('singing', {
      'rvc-gateway': 'UNKNOWN',
      'rvc-voice-model': 'UNKNOWN',
      'source-rights': 'UNKNOWN',
    }),
    'F08',
  )
  assert.deepEqual([...availability.unknownRequired], ['audio-core', 'rvc-gateway', 'rvc-voice-model', 'source-rights', 'preview-save'])
  assert.equal(availability.realReady, false)
  assert.ok(availability.userMessageZh.includes('状态未知'))
  assert.ok(availability.userMessageZh.includes('免训练试唱模式暂不支持'))
  assert.equal(/CPU 可(用|运行)/.test(availability.userMessageZh), false)
})

test('F09 即使全部 Fake VERIFIED 也不是真实 READY', () => {
  const buckets = dependencyBuckets('singing')
  const observations = Object.fromEntries(buckets.ids.map((id) => [id, 'VERIFIED']))
  const availability = expectOk(projectFeatureAvailability('singing', observations), 'F09')
  assert.equal(availability.mode, 'MOCK_ONLY')
  assert.equal(availability.realReady, false)
  assert.deepEqual([...availability.missingRequired], [])
  assert.deepEqual([...availability.unknownRequired], [])
  assert.deepEqual([...availability.blockedRequired], [])
  assert.ok(availability.optionalUnavailable.includes('seed-vc'))
  assert.ok(availability.userMessageZh.includes('仍不代表真实可用'))
  assert.ok(availability.userMessageZh.includes('演示模式'))
})

test('F10 依赖列表读取不共享可变数组或对象', () => {
  const first = expectOk(listFeatureDependencies('voice-bubbles'), 'F10 first')
  const second = expectOk(listFeatureDependencies('voice-bubbles'), 'F10 second')
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first[0], second[0])
  assert.throws(() => {
    first[0].requirement = 'OPTIONAL'
  }, TypeError)
  first.push({ id: 'fixture-injected' })
  assert.equal(second.length, 7)
  assert.equal(expectOk(listFeatureDependencies('voice-bubbles'), 'F10 third').length, 7)
})

test('F11 Voice 首次进入需要弹依赖说明', () => {
  const decision = expectOk(
    evaluateFirstUse('voice-bubbles', { 'voice-bubbles': null, singing: null }, FEATURE_MANIFEST_REVISION),
    'F11',
  )
  assert.equal(decision.feature, 'voice-bubbles')
  assert.equal(decision.showDialog, true)
  assert.equal(decision.reason, 'FIRST_USE')
  assert.equal(decision.readOnly, true)
})

test('F12 Voice 已确认不豁免 Singing，两个功能首访标记独立', () => {
  const acknowledged = { 'voice-bubbles': FEATURE_MANIFEST_REVISION, singing: null }
  const voice = expectOk(evaluateFirstUse('voice-bubbles', acknowledged, FEATURE_MANIFEST_REVISION), 'F12 voice')
  assert.equal(voice.showDialog, false)
  assert.equal(voice.reason, 'ALREADY_ACKNOWLEDGED')
  const singing = expectOk(evaluateFirstUse('singing', acknowledged, FEATURE_MANIFEST_REVISION), 'F12 singing')
  assert.equal(singing.showDialog, true)
  assert.equal(singing.reason, 'FIRST_USE')
})

test('F13 manifestRevision 变化必须重新提示', () => {
  const acknowledged = { 'voice-bubbles': 'plan05a.v1', singing: 'plan05a.v1' }
  const decision = expectOk(evaluateFirstUse('singing', acknowledged, 'plan05a.v2'), 'F13')
  assert.equal(decision.showDialog, true)
  assert.equal(decision.reason, 'REVISION_CHANGED')
})

test('F14 非法 acknowledge、未知 feature 与无效版本 fail closed', () => {
  expectError(
    evaluateFirstUse('audio-core', {}, FEATURE_MANIFEST_REVISION),
    FEATURE_MANIFEST_ERRORS.UNKNOWN_FEATURE,
    'F14 feature',
  )
  expectError(
    evaluateFirstUse('singing', { wechat: 'plan05a.v1' }, FEATURE_MANIFEST_REVISION),
    FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT,
    'F14 extra key',
  )
  expectError(
    evaluateFirstUse('singing', { singing: 42 }, FEATURE_MANIFEST_REVISION),
    FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT,
    'F14 bad value',
  )
  expectError(evaluateFirstUse('singing', null, FEATURE_MANIFEST_REVISION), FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT, 'F14 null ack')
  expectError(evaluateFirstUse('singing', { singing: null }, ''), FEATURE_MANIFEST_ERRORS.INVALID_REVISION, 'F14 empty revision')
  expectError(evaluateFirstUse('singing', { singing: null }, 'bad revision!'), FEATURE_MANIFEST_ERRORS.INVALID_REVISION, 'F14 bad revision')
})

test('F15 evaluateFirstUse 是纯决策，不持久化也不改写输入', () => {
  const acknowledged = { 'voice-bubbles': null, singing: FEATURE_MANIFEST_REVISION }
  const snapshot = JSON.stringify(acknowledged)
  const first = expectOk(evaluateFirstUse('singing', acknowledged, FEATURE_MANIFEST_REVISION), 'F15 first')
  const second = expectOk(evaluateFirstUse('singing', acknowledged, FEATURE_MANIFEST_REVISION), 'F15 second')
  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(acknowledged), snapshot)
  assert.equal(first.readOnly, true)
  assert.equal(FEATURE_IDS.includes('singing'), true)
})

test('F16 observations 必须是普通对象且状态值受控', () => {
  expectError(
    projectFeatureAvailability('voice-bubbles', { 'audio-core': 'READY' }),
    FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION,
    'F16 bad state',
  )
  expectError(
    projectFeatureAvailability('voice-bubbles', { 'audio-core': 42 }),
    FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION,
    'F16 non string',
  )
  expectError(projectFeatureAvailability('voice-bubbles', null), FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION, 'F16 null')
  expectError(projectFeatureAvailability('voice-bubbles', ['VERIFIED']), FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION, 'F16 array')
})

// ---------------------------------------------------------------------------------------------
// RelayHandoffCandidate (R01–R10)
// ---------------------------------------------------------------------------------------------

test('R01 已保存并请求投递的任务只生成不可提交候选', () => {
  const candidate = expectOk(
    buildRelayHandoffCandidate(savedRecord({ deliveryRequested: true }), 'delivery:fixture-01'),
    'R01',
  )
  assert.equal(candidate.schemaVersion, RELAY_CANDIDATE_SCHEMA_VERSION)
  assert.equal(candidate.stage, RELAY_CANDIDATE_STAGE)
  assert.equal(candidate.artifactRef, 'artifact:fixture-out-01')
  assert.equal(candidate.mockOnly, true)
  assert.equal(candidate.submitAllowed, false)
  assert.equal(candidate.targetVerified, false)
  assert.equal(candidate.authorizationVerified, false)
  assert.equal(candidate.backendSelected, false)
  assert.equal(Object.isFrozen(candidate), true)
})

test('R01b 未知任务 schema 版本不得跨过投递边界', () => {
  const forged = { ...savedRecord({ deliveryRequested: true }), schemaVersion: 2 }
  expectError(buildRelayHandoffCandidate(forged, 'delivery:fixture-01'), AUDIO_ERRORS.INVALID_REQUEST, 'R01b')
})

test('R02 已保存但没有投递意图时拒绝', () => {
  expectError(
    buildRelayHandoffCandidate(savedRecord({ deliveryRequested: false }), 'delivery:fixture-01'),
    AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    'R02',
  )
})

test('R03 未保存的 CREATED 任务拒绝', () => {
  expectError(
    buildRelayHandoffCandidate(record(ttsDraft({ deliveryRequested: true })), 'delivery:fixture-01'),
    AUDIO_ERRORS.STATE_CONFLICT,
    'R03',
  )
})

test('R04 UNKNOWN 任务拒绝', () => {
  expectError(buildRelayHandoffCandidate(unknownRecord(), 'delivery:fixture-01'), AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'R04')
})

test('R05 已取消任务拒绝', () => {
  expectError(buildRelayHandoffCandidate(cancelledRecord(), 'delivery:fixture-01'), AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'R05')
})

test('R06 畸形 deliveryId 拒绝，且不能与 taskId 相同', () => {
  const saved = savedRecord({ deliveryRequested: true })
  const malformed = ['', 'delivery:', 'delivery:has space', 'delivery:' + 'a'.repeat(65), 'task:fixture-voice-01', 42, null, undefined]
  for (const value of malformed) {
    expectError(buildRelayHandoffCandidate(saved, value), AUDIO_ERRORS.INVALID_ID, 'R06 ' + String(value).slice(0, 24))
  }
})

test('R07 候选不含目标、Token、URL 或发送后端字段', () => {
  const candidate = expectOk(
    buildRelayHandoffCandidate(savedRecord({ deliveryRequested: true }), 'delivery:fixture-01'),
    'R07',
  )
  assert.deepEqual(Object.keys(candidate).sort(), [
    'artifactRef',
    'authorizationVerified',
    'backendSelected',
    'deliveryId',
    'mockOnly',
    'schemaVersion',
    'stage',
    'submitAllowed',
    'targetVerified',
    'taskId',
  ])
  for (const forbidden of ['targetId', 'chatId', 'targetName', 'token', 'backend', 'url', 'path', 'sendMessage']) {
    assert.equal(Object.prototype.hasOwnProperty.call(candidate, forbidden), false, 'R07 ' + forbidden)
  }
  const text = JSON.stringify(candidate)
  assert.equal(text.includes('http://'), false)
  assert.equal(text.includes('https://'), false)
  assert.equal(/chat/i.test(text), false)
  const forged = expectError(
    buildRelayHandoffCandidate(
      { ...savedRecord({ deliveryRequested: true }), 'C:\\Users\\fixture\\id.txt': 'fixture' },
      'delivery:fixture-01',
    ),
    AUDIO_ERRORS.UNKNOWN_FIELD,
    'R07 path-like key',
  )
  assert.equal(JSON.stringify(forged).includes('Users'), false)
})

test('R08 模块内没有队列、HTTP、定时器或自动重试实现', () => {
  const source = readModule('core/audio/relay-handoff.mjs')
  const exported = [...source.matchAll(/export function (\w+)/g)].map((match) => match[1])
  assert.deepEqual(exported, ['buildRelayHandoffCandidate'])
  assert.equal(/\basync\b|\bawait\b|\bPromise\b/.test(source), false)
  assert.equal(/\.push\s*\(/.test(source), false)
  assert.equal(/\.submit\s*\(|\bsubmit\s*\(\s*\)/.test(source), false)
  const saved = savedRecord({ deliveryRequested: true })
  for (let index = 0; index < 25; index += 1) {
    const candidate = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-01'), 'R08 loop')
    assert.equal(candidate.submitAllowed, false)
    assert.equal(candidate.stage, 'PROPOSED_NOT_AUTHORIZED')
  }
  assert.equal(saved.state, 'SAVED')
})

test('R09 taskId 与 deliveryId 都由外部注入，模块不生成唯一 ID', () => {
  const saved = savedRecord({ deliveryRequested: true })
  const first = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-a'), 'R09 a')
  const second = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-b'), 'R09 b')
  assert.equal(first.taskId, saved.taskId)
  assert.equal(first.deliveryId, 'delivery:fixture-a')
  assert.equal(second.deliveryId, 'delivery:fixture-b')
  assert.notEqual(first.deliveryId, second.deliveryId)
  expectError(buildRelayHandoffCandidate(saved), AUDIO_ERRORS.INVALID_ID, 'R09 missing id')
})

test('R10 多次调用是确定的纯数据结果，不触发任何提交', () => {
  const saved = savedRecord({ deliveryRequested: true })
  const snapshot = JSON.stringify(saved)
  const first = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-01'), 'R10 first')
  const second = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-01'), 'R10 second')
  assert.deepEqual(first, second)
  assert.notStrictEqual(first, second)
  assert.equal(JSON.stringify(saved), snapshot)
  assert.equal(saved.state, 'SAVED')
  assert.equal(first.submitAllowed, false)
  assert.equal(first.stage, 'PROPOSED_NOT_AUTHORIZED')
})

// ---------------------------------------------------------------------------------------------
// F01 · input boundary regressions (N01–N16)
// ---------------------------------------------------------------------------------------------

function expectReject(result, label) {
  assert.equal(result.ok, false, label + ' must fail closed')
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'value'), false, label + ' must not expose a value')
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, label + ' must report at least one error')
  for (const error of result.errors) {
    assert.equal(typeof error.code, 'string', label + ' error code')
    assert.equal(typeof error.path, 'string', label + ' error path')
    assert.equal(typeof error.reason, 'string', label + ' error reason')
  }
  return result.errors
}

function errorText(errors) {
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

test('N01 统一记录验证与 Relay 对合法 SAVED 记录给出一致结果', () => {
  const cases = [savedRecord({ deliveryRequested: true }), savedSvcFixture(true)]
  for (const saved of cases) {
    const validated = expectOk(audioContract.validateAudioTaskRecord(saved), 'N01 validate')
    assert.notStrictEqual(validated, saved)
    assert.equal(Object.isFrozen(validated), true)
    assert.deepEqual(validated, saved)
    const candidate = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-01'), 'N01 relay')
    assert.equal(candidate.taskId, saved.taskId)
    assert.equal(candidate.artifactRef, saved.outputArtifactRef)
    assert.equal(candidate.stage, RELAY_CANDIDATE_STAGE)
    assert.equal(candidate.submitAllowed, false)
    assert.equal(Object.keys(candidate).length, 10)
  }
})

test('N02 删除任一必填记录字段都会被统一验证、投影与 Relay 拒绝', () => {
  const saved = savedRecord({ deliveryRequested: true })
  const keys = Object.keys(saved)
  assert.equal(keys.length, 16)
  for (const key of keys) {
    const broken = { ...saved }
    delete broken[key]
    expectReject(audioContract.validateAudioTaskRecord(broken), 'N02 validate ' + key)
    expectReject(projectAudioTask(broken), 'N02 project ' + key)
    expectReject(buildRelayHandoffCandidate(broken, 'delivery:fixture-01'), 'N02 relay ' + key)
  }
})

test('N03 配对、音色与时间错误在 Core 与 Relay 同时被拒绝', () => {
  const saved = savedRecord({ deliveryRequested: true })
  const marker = 'fixture-marker-not-a-date'
  const mutated = [
    { ...saved, feature: 'singing' },
    { ...saved, taskType: 'SVC' },
    { ...saved, source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-vocal-01' } },
    { ...saved, voiceProfileId: 'whale-v1.pth' },
    { ...saved, voiceProfileId: 'C:\\models\\fixture.pth' },
    { ...saved, observedAt: marker },
  ]
  for (const variant of mutated) {
    expectReject(audioContract.validateAudioTaskRecord(variant), 'N03 validate')
    expectReject(projectAudioTask(variant), 'N03 project')
    const relayErrors = expectReject(buildRelayHandoffCandidate(variant, 'delivery:fixture-01'), 'N03 relay')
    assert.equal(errorText(relayErrors).includes(marker), false)
  }
})

test('N04 嵌套对象夹带 token/send/未知键一律拒绝且不回显', () => {
  const saved = savedRecord({ deliveryRequested: true })
  const variants = [
    { ...saved, source: { ...saved.source, token: 'fixture' } },
    { ...saved, source: { ...saved.source, send: true } },
    { ...saved, source: { ...saved.source, 'fixture-private@example.test': 'x' } },
    { ...saved, rights: { ...saved.rights, token: 'fixture' } },
    { ...saved, cancel: { ...saved.cancel, token: 'fixture' } },
    { ...saved, delivery: { ...saved.delivery, token: 'fixture' } },
    { ...saved, delivery: { ...saved.delivery, backend: 'fixture' } },
  ]
  for (const variant of variants) {
    const errors = expectReject(audioContract.validateAudioTaskRecord(variant), 'N04 validate')
    assert.equal(errorText(errors).includes('token'), false)
    assert.equal(errorText(errors).includes('fixture-private'), false)
    expectReject(buildRelayHandoffCandidate(variant, 'delivery:fixture-01'), 'N04 relay')
  }
  const failed = failedRecord()
  const withToken = { ...failed, lastError: { ...failed.lastError, token: 'fixture' } }
  expectReject(audioContract.validateAudioTaskRecord(withToken), 'N04 lastError')
})

test('N05 状态与字段矛盾（SAVED 带错误、确认取消、缺产物、UNVERIFIED）被拒绝', () => {
  const saved = savedRecord({ deliveryRequested: true })
  const variants = [
    { ...saved, lastError: { code: 'AUDIO_FAKE_FAILURE' } },
    { ...saved, cancel: { requested: true, confirmed: true } },
    { ...saved, cancel: { requested: true, confirmed: false } },
    { ...saved, outputArtifactRef: null },
    { ...saved, rights: { state: 'UNVERIFIED' } },
    { ...saved, state: 'BLOCKED_RIGHTS' },
  ]
  for (const variant of variants) {
    expectReject(audioContract.validateAudioTaskRecord(variant), 'N05 validate')
    expectReject(projectAudioTask(variant), 'N05 project')
    expectReject(buildRelayHandoffCandidate(variant, 'delivery:fixture-01'), 'N05 relay')
  }
})

test('N06 顶层不可枚举 token/send 被拒绝且 action 不推进', () => {
  const draft = withHidden(ttsDraft(), 'token', 'fixture')
  const draftErrors = expectReject(validateAudioTaskDraft(draft), 'N06 draft')
  assert.ok(draftErrors.some((error) => error.code === AUDIO_ERRORS.UNKNOWN_FIELD))
  expectReject(createAudioTaskRecord(draft, { observedAt: OBSERVED_AT }), 'N06 create')

  const metadata = withHidden({ observedAt: OBSERVED_AT }, 'send', true)
  expectReject(createAudioTaskRecord(ttsDraft(), metadata), 'N06 metadata')

  const created = record(ttsDraft())
  const action = withHidden({ type: 'BEGIN_PROCESS' }, 'send', 'fixture')
  expectReject(transitionAudioTask(created, action), 'N06 action')
  assert.equal(created.state, AUDIO_TASK_STATES.CREATED)

  const recordWithHidden = withHidden(savedRecord({ deliveryRequested: true }), 'token', 'fixture')
  expectReject(audioContract.validateAudioTaskRecord(recordWithHidden), 'N06 record')
  expectReject(buildRelayHandoffCandidate(recordWithHidden, 'delivery:fixture-01'), 'N06 relay')
})

test('N07 嵌套对象中的不可枚举未知字段同样被拒绝', () => {
  const source = withHidden({ kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' }, 'token', 'fixture')
  expectReject(validateAudioTaskDraft(ttsDraft({ source })), 'N07 draft source')

  const saved = savedRecord({ deliveryRequested: true })
  const variants = [
    { ...saved, source: withHidden({ ...saved.source }, 'send', true) },
    { ...saved, rights: withHidden({ ...saved.rights }, 'token', 'fixture') },
    { ...saved, cancel: withHidden({ ...saved.cancel }, 'token', 'fixture') },
    { ...saved, delivery: withHidden({ ...saved.delivery }, 'backend', 'fixture') },
  ]
  for (const variant of variants) {
    expectReject(audioContract.validateAudioTaskRecord(variant), 'N07 record')
    expectReject(buildRelayHandoffCandidate(variant, 'delivery:fixture-01'), 'N07 relay')
  }
})

test('N08 Symbol 键在全部入口都被拒绝且不泄露描述', () => {
  const marker = 'fixture-symbol-secret'
  const draft = withSymbol(ttsDraft(), marker, 'x')
  const draftErrors = expectReject(validateAudioTaskDraft(draft), 'N08 draft')
  assert.equal(errorText(draftErrors).includes(marker), false)
  expectReject(createAudioTaskRecord(draft, { observedAt: OBSERVED_AT }), 'N08 create')

  const created = record(ttsDraft())
  expectReject(transitionAudioTask(created, withSymbol({ type: 'BEGIN_PROCESS' }, marker, 'x')), 'N08 action')

  const saved = savedRecord({ deliveryRequested: true })
  const withSym = withSymbol(saved, marker, 'x')
  expectReject(audioContract.validateAudioTaskRecord(withSym), 'N08 record')
  const relayErrors = expectReject(buildRelayHandoffCandidate(withSym, 'delivery:fixture-01'), 'N08 relay')
  assert.equal(errorText(relayErrors).includes(marker), false)

  expectError(
    projectFeatureAvailability('singing', withSymbol({}, marker, 'VERIFIED')),
    FEATURE_MANIFEST_ERRORS.UNKNOWN_OBSERVATION,
    'N08 observations',
  )
  expectError(
    evaluateFirstUse('singing', withSymbol({}, marker, 'plan05a.v1'), FEATURE_MANIFEST_REVISION),
    FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT,
    'N08 ack',
  )
})

test('N09 已知字段不可枚举时按固定错误拒绝', () => {
  expectError(
    validateAudioTaskDraft(withHidden(ttsDraft(), 'taskId', 'task:fixture-hidden-01')),
    AUDIO_ERRORS.TYPE_MISMATCH,
    'N09 draft taskId',
  )

  const missingTaskId = { ...ttsDraft() }
  delete missingTaskId.taskId
  expectReject(
    validateAudioTaskDraft(withHidden(missingTaskId, 'taskId', 'task:fixture-hidden-01')),
    'N09 hidden taskId cannot replace a missing field',
  )

  expectError(
    createAudioTaskRecord(ttsDraft(), withHidden({ observedAt: OBSERVED_AT }, 'observedAt', OBSERVED_AT)),
    AUDIO_ERRORS.TYPE_MISMATCH,
    'N09 metadata observedAt',
  )

  const created = record(ttsDraft())
  expectError(
    transitionAudioTask(created, withHidden({ type: 'BEGIN_PROCESS' }, 'type', 'BEGIN_PROCESS')),
    AUDIO_ERRORS.TYPE_MISMATCH,
    'N09 action type',
  )
  assert.equal(created.state, AUDIO_TASK_STATES.CREATED)

  expectError(
    projectFeatureAvailability('singing', withHidden({}, 'audio-core', 'VERIFIED')),
    FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION,
    'N09 observations audio-core',
  )
  expectError(
    evaluateFirstUse('singing', withHidden({}, 'singing', FEATURE_MANIFEST_REVISION), FEATURE_MANIFEST_REVISION),
    FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT,
    'N09 ack singing',
  )
  expectError(
    evaluateFirstUse('singing', withHidden({}, 'singing', 'bad/revision'), FEATURE_MANIFEST_REVISION),
    FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT,
    'N09 hidden invalid revision',
  )
})

test('N10 getter/setter 一律拒绝且从不执行访问器', () => {
  let reads = 0
  const knownGetter = { ...ttsDraft() }
  Object.defineProperty(knownGetter, 'taskId', {
    get() {
      reads += 1
      return 'task:fixture-getter-01'
    },
    enumerable: true,
    configurable: true,
  })
  expectError(validateAudioTaskDraft(knownGetter), AUDIO_ERRORS.TYPE_MISMATCH, 'N10 known getter')
  assert.equal(reads, 0)

  const unknownGetter = { ...ttsDraft() }
  Object.defineProperty(unknownGetter, 'token', {
    get() {
      reads += 1
      return 'fixture'
    },
    enumerable: true,
    configurable: true,
  })
  expectError(validateAudioTaskDraft(unknownGetter), AUDIO_ERRORS.UNKNOWN_FIELD, 'N10 unknown getter')
  assert.equal(reads, 0)

  const throwingAction = {}
  Object.defineProperty(throwingAction, 'type', {
    get() {
      reads += 1
      throw new Error('fixture-getter-marker')
    },
    enumerable: true,
    configurable: true,
  })
  const created = record(ttsDraft())
  const actionErrors = expectReject(transitionAudioTask(created, throwingAction), 'N10 throwing getter')
  assert.equal(reads, 0)
  assert.equal(errorText(actionErrors).includes('fixture-getter-marker'), false)

  const observations = {}
  Object.defineProperty(observations, 'audio-core', {
    get() {
      reads += 1
      return 'VERIFIED'
    },
    enumerable: true,
    configurable: true,
  })
  expectError(
    projectFeatureAvailability('singing', observations),
    FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION,
    'N10 observations getter',
  )
  assert.equal(reads, 0)
})

test('N11 三模块错误路径固定为占位符，不回显任何未知键名', () => {
  const markers = [
    'fixture-private-contact@example.test',
    'S3CR3T-fixture-marker',
    'C:\\fixture\\private\\contact.txt',
    'https://fixture.example.test/private',
    '私密标记-fixture',
  ]
  for (const marker of markers) {
    const draftErrors = expectReject(validateAudioTaskDraft(ttsDraft({ [marker]: 'fixture' })), 'N11 draft')
    assert.ok(draftErrors.some((error) => error.path === UNKNOWN_PATH), 'N11 draft placeholder')
    assert.equal(errorText(draftErrors).includes(marker), false)

    const observationsErrors = expectReject(projectFeatureAvailability('singing', { [marker]: 'VERIFIED' }), 'N11 observations')
    assert.ok(observationsErrors.some((error) => error.path === 'observations.' + UNKNOWN_PATH), 'N11 observations placeholder')
    assert.equal(errorText(observationsErrors).includes(marker), false)

    const ackErrors = expectReject(evaluateFirstUse('singing', { [marker]: 'plan05a.v1' }, FEATURE_MANIFEST_REVISION), 'N11 ack')
    assert.ok(ackErrors.some((error) => error.path === 'acknowledgedByFeature.' + UNKNOWN_PATH), 'N11 ack placeholder')
    assert.equal(errorText(ackErrors).includes(marker), false)

    const saved = savedRecord({ deliveryRequested: true })
    const relayErrors = expectReject(
      buildRelayHandoffCandidate({ ...saved, [marker]: 'fixture' }, 'delivery:fixture-01'),
      'N11 relay',
    )
    assert.ok(relayErrors.some((error) => error.path === UNKNOWN_PATH), 'N11 relay placeholder')
    assert.equal(errorText(relayErrors).includes(marker), false)
  }
})

test('N12 已知字段的非法值与异常内容不会进入错误信封', () => {
  const marker = 'fixture-value-marker-9f3'
  const idErrors = expectError(validateAudioTaskDraft(ttsDraft({ taskId: marker })), AUDIO_ERRORS.INVALID_ID, 'N12 id')
  assert.equal(errorText(idErrors).includes(marker), false)

  const saved = savedRecord({ deliveryRequested: true })
  const relayErrors = expectReject(
    buildRelayHandoffCandidate({ ...saved, observedAt: marker }, 'delivery:fixture-01'),
    'N12 relay observedAt',
  )
  assert.equal(errorText(relayErrors).includes(marker), false)

  const throwing = { ...ttsDraft() }
  Object.defineProperty(throwing, 'taskId', {
    get() {
      throw new Error(marker)
    },
    enumerable: true,
    configurable: true,
  })
  const throwErrors = expectReject(validateAudioTaskDraft(throwing), 'N12 throwing getter')
  assert.equal(errorText(throwErrors).includes(marker), false)
  assert.equal(errorText(throwErrors).includes('stack'), false)
})

test('N13 仅普通对象可入；null 原型与冻结对象可用，自定义原型被拒绝', () => {
  const nullProto = Object.assign(Object.create(null), ttsDraft())
  const accepted = expectOk(validateAudioTaskDraft(nullProto), 'N13 null proto')
  assert.notStrictEqual(accepted, nullProto)
  assert.equal(Object.isFrozen(accepted), true)

  const frozenDraft = Object.freeze(ttsDraft())
  assert.equal(expectOk(validateAudioTaskDraft(frozenDraft), 'N13 frozen').taskId, 'task:fixture-voice-01')

  const customProto = Object.create({ taskId: 'task:fixture-inherited-01' })
  customProto.schemaVersion = 1
  customProto.feature = 'voice-bubbles'
  customProto.taskType = 'TTS'
  customProto.source = { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' }
  customProto.voiceProfileId = 'voice:fixture-voice-01'
  customProto.deliveryRequested = false
  customProto.rights = { state: 'CONFIRMED_FIXTURE' }
  expectError(validateAudioTaskDraft(customProto), AUDIO_ERRORS.INVALID_REQUEST, 'N13 custom proto')

  class FixtureDraft {}
  expectError(validateAudioTaskDraft(new FixtureDraft()), AUDIO_ERRORS.INVALID_REQUEST, 'N13 class instance')

  const recordWithProto = Object.assign(Object.create({ extra: true }), savedRecord({ deliveryRequested: true }))
  expectReject(audioContract.validateAudioTaskRecord(recordWithProto), 'N13 record proto')
  expectReject(buildRelayHandoffCandidate(recordWithProto, 'delivery:fixture-01'), 'N13 relay proto')
})

test('N14 首访与 observations 的兼容行为不退化', () => {
  const first = expectOk(evaluateFirstUse('singing', {}, FEATURE_MANIFEST_REVISION), 'N14 empty ack')
  assert.equal(first.showDialog, true)
  assert.equal(first.reason, 'FIRST_USE')

  const otherFeature = expectOk(
    evaluateFirstUse('voice-bubbles', { singing: FEATURE_MANIFEST_REVISION }, FEATURE_MANIFEST_REVISION),
    'N14 other feature',
  )
  assert.equal(otherFeature.showDialog, true)

  const changed = expectOk(
    evaluateFirstUse('singing', { singing: 'plan05a.v0' }, FEATURE_MANIFEST_REVISION),
    'N14 changed revision',
  )
  assert.equal(changed.showDialog, true)
  assert.equal(changed.reason, 'REVISION_CHANGED')

  const unknownAll = expectOk(projectFeatureAvailability('singing'), 'N14 undefined observations')
  assert.equal(unknownAll.realReady, false)
  assert.deepEqual(
    [...unknownAll.unknownRequired],
    ['audio-core', 'rvc-gateway', 'rvc-voice-model', 'source-rights', 'preview-save'],
  )

  const allVerified = expectOk(
    projectFeatureAvailability(
      'singing',
      Object.fromEntries(dependencyBuckets('singing').ids.map((id) => [id, 'VERIFIED'])),
    ),
    'N14 all verified',
  )
  assert.equal(allVerified.mode, 'MOCK_ONLY')
  assert.equal(allVerified.realReady, false)
})

test('N15 所有可达状态送入 Relay：仅 SAVED+意图可通过，且重复调用确定', () => {
  const states = {
    CREATED: record(ttsDraft({ deliveryRequested: true })),
    BLOCKED_RIGHTS: record(ttsDraft({ deliveryRequested: true, rights: { state: 'UNVERIFIED' } })),
    PROCESSING: step(record(ttsDraft({ deliveryRequested: true })), { type: 'BEGIN_PROCESS' }),
    ARTIFACT_READY: step(step(record(ttsDraft({ deliveryRequested: true })), { type: 'BEGIN_PROCESS' }), {
      type: 'ATTACH_FAKE_ARTIFACT',
      artifactRef: 'artifact:fixture-out-01',
    }),
    SAVED: savedRecord({ deliveryRequested: true }),
    CANCEL_REQUESTED: step(record(ttsDraft({ deliveryRequested: true })), { type: 'REQUEST_CANCEL' }),
    CANCELLED: cancelledRecord(),
    FAILED: failedRecord(),
    UNKNOWN: unknownRecord(),
  }
  const expectations = {
    CREATED: AUDIO_ERRORS.STATE_CONFLICT,
    BLOCKED_RIGHTS: AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    PROCESSING: AUDIO_ERRORS.STATE_CONFLICT,
    ARTIFACT_READY: AUDIO_ERRORS.STATE_CONFLICT,
    SAVED: null,
    CANCEL_REQUESTED: AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    CANCELLED: AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    FAILED: AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    UNKNOWN: AUDIO_ERRORS.DELIVERY_FORBIDDEN,
  }
  for (const [state, value] of Object.entries(states)) {
    assert.equal(value.state, state, 'N15 fixture state ' + state)
    const expected = expectations[state]
    if (expected === null) {
      expectOk(buildRelayHandoffCandidate(value, 'delivery:fixture-01'), 'N15 ' + state)
    } else {
      expectError(buildRelayHandoffCandidate(value, 'delivery:fixture-01'), expected, 'N15 ' + state)
    }
  }

  expectError(
    buildRelayHandoffCandidate(savedRecord({ deliveryRequested: false }), 'delivery:fixture-01'),
    AUDIO_ERRORS.DELIVERY_FORBIDDEN,
    'N15 no intent',
  )

  const saved = states.SAVED
  const first = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-01'), 'N15 first')
  const second = expectOk(buildRelayHandoffCandidate(saved, 'delivery:fixture-01'), 'N15 second')
  assert.deepEqual(first, second)
  assert.notStrictEqual(first, second)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(saved.state, AUDIO_TASK_STATES.SAVED)
})

test('N16 循环、重复节点、过深与隐藏属性组合均有限失败', () => {
  const cyclic = ttsDraft()
  cyclic.source.self = cyclic
  expectError(validateAudioTaskDraft(cyclic), AUDIO_ERRORS.INVALID_REQUEST, 'N16 cycle')

  const shared = { kind: 'TEXT_REF', ref: 'artifact:fixture-text-01' }
  expectReject(validateAudioTaskDraft(ttsDraft({ source: shared, rights: shared })), 'N16 repeated node')

  let deep = { leaf: 'fixture' }
  for (let index = 0; index < 8; index += 1) deep = { nested: deep }
  expectReject(validateAudioTaskDraft(ttsDraft({ extra: deep })), 'N16 deep graph')

  const saved = savedRecord({ deliveryRequested: true })
  const recordCycle = { ...saved, cancel: { ...saved.cancel } }
  recordCycle.cancel.self = recordCycle
  expectReject(audioContract.validateAudioTaskRecord(recordCycle), 'N16 record cycle')

  const combo = withSymbol(withHidden(ttsDraft(), 'token', 'fixture'), 'fixture-symbol', 'x')
  expectReject(validateAudioTaskDraft(combo), 'N16 hidden + symbol')

  for (const relative of MODULE_PATHS) {
    const source = readModule(relative)
    assert.equal(/\bnode:fs\b|\bnode:child_process\b|\bnode:http\b/.test(source), false, relative + ' must stay pure')
    assert.equal(/\brequire\s*\(/.test(source), false, relative + ' must not require')
  }
})

// ---------------------------------------------------------------------------------------------
// Static purity guards (B03 / B13 evidence)
// ---------------------------------------------------------------------------------------------

const MODULE_PATHS = [
  'core/audio/task-contract.mjs',
  'core/audio/feature-manifest.mjs',
  'core/audio/relay-handoff.mjs',
]

function readModule(relative) {
  return readFileSync(fileURLToPath(new URL('../' + relative, import.meta.url)), 'utf8')
}

test('S01 三个模块只允许导入本任务的纯模块', () => {
  const allowed = new Set(['./task-contract.mjs', './feature-manifest.mjs', './relay-handoff.mjs'])
  for (const relative of MODULE_PATHS) {
    const source = readModule(relative)
    const specifiers = [...source.matchAll(/^\s*import\s+(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/gm)].map((match) => match[1])
    for (const specifier of specifiers) {
      assert.ok(allowed.has(specifier), relative + ' imports non-contract module ' + specifier)
    }
    assert.equal(/\brequire\s*\(/.test(source), false, relative + ' must not use require()')
  }
})

test('S02 三个模块没有时钟、随机、网络、进程或文件副作用', () => {
  const banned = [
    [/\bDate\.now\b/, 'Date.now'],
    [/\bnew Date\b/, 'new Date'],
    [/\bDate\.parse\b/, 'Date.parse'],
    [/\bMath\.random\b/, 'Math.random'],
    [/\bprocess\.env\b/, 'process.env'],
    [/\bprocess\.argv\b/, 'process.argv'],
    [/\bfetch\s*\(/, 'fetch()'],
    [/\bnew URL\b/, 'new URL'],
    [/\bsetTimeout\s*\(/, 'setTimeout'],
    [/\bsetInterval\s*\(/, 'setInterval'],
    [/\bsetImmediate\s*\(/, 'setImmediate'],
    [/\brandomUUID\b/, 'randomUUID'],
    [/\bchild_process\b/, 'child_process'],
    [/\bworker_threads\b/, 'worker_threads'],
    [/\bnode:fs\b/, 'node:fs'],
    [/\bnode:net\b/, 'node:net'],
    [/\bnode:http\b/, 'node:http'],
  ]
  for (const relative of MODULE_PATHS) {
    const source = readModule(relative)
    for (const [pattern, label] of banned) {
      assert.equal(pattern.test(source), false, relative + ' must not reference ' + label)
    }
  }
})
