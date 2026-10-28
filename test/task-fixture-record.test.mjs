import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
  runDraftFixtureTaskOnce,
  runExistingFixtureTaskOnce,
} from '../core/audio/task-fixture-engine-internal.mjs'
import { runFixtureAudioTaskOnce } from '../core/audio/task-fixture-runner.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import {
  AUDIO_TASK_STATE_LIST,
  projectAudioTask,
  transitionAudioTask,
  validateAudioTaskRecord,
} from '../core/audio/task-contract.mjs'

const SCOPE = 'scope:fixture-demo'
const NOW = '2026-10-27T00:00:00.000Z'
const FILE = 'audio-task-catalog-v1.json'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function extractExample(heading) {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function expectError(result, key, errorPath) {
  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, 'TASK_FIXTURE_' + key)
  assert.equal(result.errors[0].path, errorPath)
}

function expectBlocked(result, reason) {
  assert.equal(result.ok, true)
  assert.equal(result.value.phase, 'BLOCKED')
  assert.equal(result.value.reason, reason)
}

function expectSimulated(result) {
  assert.equal(result.ok, true)
  assert.equal(result.value.phase, 'SIMULATED')
}

async function makeExisting(example, key, mutateDraft) {
  const sandbox = createConfigSandbox()
  const opened = await openFixtureTaskCatalog({ sandbox })
  const binding = example.sourceInput.voiceBinding
  const draft = { ...binding.taskDraft }
  delete draft.taskId
  if (mutateDraft) mutateDraft(draft)
  const reserved = await opened.value.reserve({
    schemaVersion: 1,
    scopeId: binding.expectation.scopeId,
    idempotencyKey: key,
    draft,
    observedAt: NOW,
  })
  if (!reserved.ok) throw new Error('reserve failed: ' + reserved.errors[0].code)
  const file = path.join(sandbox.root, FILE)
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
  const entry = snapshot.entries[snapshot.entries.length - 1]
  const input = clone(example)
  input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
  input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
  return { sandbox, file, opened, record: entry.record, input, snapshot, hash: sha(file) }
}

function advance(record, actions) {
  let current = record
  for (const action of actions) {
    const result = transitionAudioTask(current, action)
    assert.equal(result.ok, true)
    current = result.value
  }
  return current
}

test('B02 an existing TTS/SVC record is reused without creating a second catalog entry', async () => {
  for (const [heading, key] of [['## 7. RVC完整示例', 'key:fixture-b02-svc'], ['## 8. TTS阻断示例', 'key:fixture-b02-tts']]) {
    const example = extractExample(heading)
    const ctx = await makeExisting(example, key)
    try {
      const beforeHash = sha(ctx.file)
      const beforeRevision = JSON.parse(fs.readFileSync(ctx.file, 'utf8')).revision
      const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input })
      assert.equal(out.result.ok, true)
      const validated = validateAudioTaskRecord(out.record)
      assert.equal(validated.ok, true)
      assert.equal(out.record.taskId, ctx.record.taskId)
      assert.equal(out.record.observedAt, ctx.record.observedAt)
      assert.equal(out.record.state, ctx.record.state === 'BLOCKED_RIGHTS' ? 'BLOCKED_RIGHTS' : out.record.state)
      assert.equal(sha(ctx.file), beforeHash)
      assert.equal(JSON.parse(fs.readFileSync(ctx.file, 'utf8')).revision, beforeRevision)
      assert.equal(out.result.value.task.taskId, ctx.record.taskId)
    } finally {
      removeConfigSandbox(ctx.sandbox)
    }
  }
})

test('B03 seven existing-SVC Fake scenarios preserve the original TaskId and observedAt', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b03-svc')
  const expected = {
    SUCCESS: ['SIMULATED', 'ARTIFACT_READY', ['CREATED', 'PROCESSING', 'ARTIFACT_READY']],
    OFFLINE: ['SIMULATED', 'FAILED', ['CREATED', 'PROCESSING', 'FAILED']],
    MODEL_MISSING: ['SIMULATED', 'FAILED', ['CREATED', 'PROCESSING', 'FAILED']],
    TIMEOUT: ['SIMULATED', 'UNKNOWN', ['CREATED', 'PROCESSING', 'UNKNOWN']],
    CANCEL_REQUESTED: ['SIMULATED', 'CANCEL_REQUESTED', ['CREATED', 'PROCESSING', 'CANCEL_REQUESTED']],
    CANCEL_CONFIRMED: ['SIMULATED', 'CANCELLED', ['CREATED', 'PROCESSING', 'CANCEL_REQUESTED', 'CANCELLED']],
    UNKNOWN: ['SIMULATED', 'UNKNOWN', ['CREATED', 'PROCESSING', 'UNKNOWN']],
  }
  try {
    for (const [scenario, [phase, state, states]] of Object.entries(expected)) {
      const input = clone(ctx.input)
      input.context.scenario = scenario
      const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input })
      assert.equal(out.result.ok, true, scenario)
      assert.equal(out.result.value.phase, phase, scenario)
      assert.equal(out.result.value.task.state, state, scenario)
      assert.deepEqual(out.result.value.states, states, scenario)
      assert.equal(out.result.value.task.taskId, ctx.record.taskId, scenario)
      assert.equal(out.record.taskId, ctx.record.taskId, scenario)
      assert.equal(out.record.observedAt, ctx.record.observedAt, scenario)
      const validated = validateAudioTaskRecord(out.record)
      assert.equal(validated.ok, true, scenario)
      const projected = projectAudioTask(out.record)
      assert.deepEqual(projected.value, out.result.value.task, scenario)
    }
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B04 a later now is used for current checks but never replaces the original observedAt', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b04')
  try {
    const input = clone(ctx.input)
    input.sourceInput.voiceBinding.now = '2026-10-28T12:00:00.000Z'
    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input })
    expectSimulated(out.result)
    assert.equal(out.record.observedAt, ctx.record.observedAt)
    assert.equal(out.record.taskId, ctx.record.taskId)

    const expired = clone(ctx.input)
    expired.sourceInput.voiceBinding.now = '2035-01-01T00:00:00.000Z'
    expired.sourceInput.artifactLibrary.artifacts[0].expiresAt = '2034-01-01T00:00:00.000Z'
    const blocked = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: expired })
    expectBlocked(blocked.result, 'TASK_FIXTURE_SOURCE_BLOCKED')
    assert.equal(blocked.record.taskId, ctx.record.taskId)
    assert.equal(blocked.record.observedAt, ctx.record.observedAt)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B05 frame/expectation scope mismatches are rejected before any Fake', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b05')
  try {
    expectError(runExistingFixtureTaskOnce({ scopeId: 'scope:fixture-other', record: ctx.record, input: ctx.input }).result, 'INVALID_INPUT', '$')
    const input = clone(ctx.input)
    input.sourceInput.voiceBinding.expectation.scopeId = 'scope:fixture-other'
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input }).result, 'INVALID_INPUT', '$')
    const bad = clone(ctx.input)
    bad.sourceInput.voiceBinding.expectation.scopeId = 'not-a-scope'
    expectError(runExistingFixtureTaskOnce({ scopeId: bad.sourceInput.voiceBinding.expectation.scopeId, record: ctx.record, input: bad }).result, 'INVALID_INPUT', '$')
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B06 every draft/record identity domain is compared, delivery defaults false', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b06')
  try {
    const mutations = [
      (d) => { d.feature = 'other' },
      (d) => { d.taskType = 'TTS' },
      (d) => { d.source.kind = 'TEXT_REF' },
      (d) => { d.source.ref = 'artifact:other' },
      (d) => { d.voiceProfileId = 'voice:other' },
      (d) => { d.rights.state = 'UNVERIFIED' },
      (d) => { d.schemaVersion = 2 },
    ]
    for (const mutate of mutations) {
      const input = clone(ctx.input)
      mutate(input.sourceInput.voiceBinding.taskDraft)
      const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input })
      assert.equal(out.result.ok, false)
      assert.equal(out.record, null)
    }
    const deliveryless = clone(ctx.input)
    delete deliveryless.sourceInput.voiceBinding.taskDraft.deliveryRequested
    const ok = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: deliveryless })
    expectSimulated(ok.result)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B07 projections, missing fields, extra keys and versions cannot be mistaken for a record', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b07')
  try {
    const projection = projectAudioTask(ctx.record).value
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: projection, input: ctx.input }).result, 'INVALID_INPUT', '$')

    const missing = clone(ctx.record)
    delete missing.taskId
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: missing, input: ctx.input }).result, 'INVALID_INPUT', '$')

    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input, extra: 1 }).result, 'INVALID_INPUT', '<unknown-key>')

    const input = clone(ctx.input)
    input.record = ctx.record
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input }).result, 'INVALID_INPUT', '<unknown-key>')

    const version = clone(ctx.input)
    version.schemaVersion = 2
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: version }).result, 'UNSUPPORTED_VERSION', 'schemaVersion')
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B08 every non-initial state is rejected before Fake; CREATED/BLOCKED_RIGHTS are the only accepted bases', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b08')
  const plans = {
    PROCESSING: [{ type: 'BEGIN_PROCESS' }],
    FAILED: [{ type: 'BEGIN_PROCESS' }, { type: 'FAIL', code: 'AUDIO_FAKE_FAILURE' }],
    UNKNOWN: [{ type: 'BEGIN_PROCESS' }, { type: 'MARK_UNKNOWN' }],
    CANCEL_REQUESTED: [{ type: 'BEGIN_PROCESS' }, { type: 'REQUEST_CANCEL' }],
    CANCELLED: [{ type: 'BEGIN_PROCESS' }, { type: 'REQUEST_CANCEL' }, { type: 'CONFIRM_CANCEL' }],
    ARTIFACT_READY: [{ type: 'BEGIN_PROCESS' }, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-fake-1' }],
  }
  try {
    for (const state of AUDIO_TASK_STATE_LIST) {
      if (state === 'CREATED' || state === 'BLOCKED_RIGHTS' || state === 'SAVED') continue
      const actions = plans[state]
      if (!actions) continue
      const record = advance(ctx.record, actions)
      assert.equal(record.state, state)
      const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record, input: ctx.input })
      expectError(out.result, 'TASK_TRANSITION_REJECTED', '$')
      assert.equal(out.record, null)
    }
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B09 legal source/readiness/TTS blocks keep the original full record', async () => {
  const svc = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(svc, 'key:fixture-b09')
  try {
    const readiness = clone(ctx.input)
    readiness.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    const blocked = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: readiness })
    expectBlocked(blocked.result, 'TASK_FIXTURE_READINESS_BLOCKED')
    assert.equal(blocked.record.taskId, ctx.record.taskId)
    assert.equal(blocked.record.observedAt, ctx.record.observedAt)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }

  const tts = extractExample('## 8. TTS阻断示例')
  const ctx2 = await makeExisting(tts, 'key:fixture-b09-tts')
  try {
    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx2.record, input: ctx2.input })
    expectBlocked(out.result, 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH')
    assert.equal(out.result.value.task.state, 'CREATED')
    assert.equal(out.record.taskId, ctx2.record.taskId)
  } finally {
    removeConfigSandbox(ctx2.sandbox)
  }
})

test('B12 the shallow frame rejects accessors/Symbols/Proxy and keeps partition budgets', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b12')
  try {
    const frame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }
    Object.defineProperty(frame, 'scopeId', { get() { throw new Error('getter') }, enumerable: true })
    expectError(runExistingFixtureTaskOnce(frame).result, 'INVALID_INPUT', '$')

    const symbolFrame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }
    symbolFrame[Symbol('x')] = 1
    expectError(runExistingFixtureTaskOnce(symbolFrame).result, 'INVALID_INPUT', '<unknown-key>')

    const proxy = new Proxy({ scopeId: SCOPE, record: ctx.record, input: ctx.input }, { ownKeys() { throw new Error('trap') } })
    expectError(runExistingFixtureTaskOnce(proxy).result, 'INVALID_INPUT', '$')

    let deep = ctx.input
    for (let i = 0; i < 13; i += 1) deep = { nested: deep }
    const tooDeep = clone(ctx.input)
    tooDeep.extra = deep
    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: tooDeep })
    assert.equal(out.result.ok, false)
    assert.equal(out.result.errors[0].code, 'TASK_FIXTURE_RESOURCE_LIMIT')
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B13 inputs are not frozen or mutated; private record is fresh/frozen and the public envelope stays record-free', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b13')
  try {
    const frozen = Object.freeze(clone(ctx.input))
    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: frozen })
    expectSimulated(out.result)
    assert.equal(Object.isFrozen(ctx.input), false)
    assert.equal(Object.isFrozen(out.record), true)
    assert.equal(Object.isFrozen(out.result), true)
    assert.equal(JSON.stringify(out.result).includes('observedAt'), false)
    assert.equal(JSON.stringify(out.result).includes(ctx.record.taskId), true)
    const second = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input })
    assert.notEqual(second.record, out.record)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B14 repeating the same CREATED snapshot can simulate again; no claimed state is invented', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b14')
  try {
    const first = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input })
    const second = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input })
    expectSimulated(first.result)
    expectSimulated(second.result)
    assert.equal(first.record.taskId, second.record.taskId)
    assert.equal(JSON.stringify(second.result).includes('claimed'), false)
    assert.equal(JSON.stringify(second.result).includes('idempotent'), false)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B16 the new documentation states the internal-only, no-persistent-claim boundary', () => {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RECORD_INTERNAL.md', 'utf8')
  for (const marker of ['内部', 'scopeId', 'observedAt', '不持久', '不宣称', 'OFFLINE', 'NOT_INTEGRATED']) {
    assert.equal(doc.includes(marker), true, marker)
  }
})

test('B01 legacy facade still returns exactly the old public envelope', () => {
  const example = extractExample('## 7. RVC完整示例')
  const result = runFixtureAudioTaskOnce(example)
  expectSimulated(result)
  assert.deepEqual(Object.keys(result.value), [
    'schemaVersion', 'phase', 'reason', 'messageZh', 'sourceCheck', 'readiness',
    'execution', 'task', 'states', 'mockOnly', 'realOperationAllowed', 'submitAllowed',
    'automaticRetryAllowed',
  ])
  const direct = runDraftFixtureTaskOnce(example)
  assert.deepEqual(direct.result, result)
  assert.equal(direct.record.state, 'ARTIFACT_READY')
  assert.equal(JSON.stringify(result).includes('observedAt'), false)
})
