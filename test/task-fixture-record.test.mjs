import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

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
      (d) => { d.taskId = 'task:fixture-' + 'f'.repeat(32) },
      (d) => { d.deliveryRequested = true },
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

    const manyKeys = { scopeId: SCOPE, record: ctx.record, input: ctx.input }
    for (let i = 0; i < 30; i += 1) manyKeys['extra' + i] = i
    expectError(runExistingFixtureTaskOnce(manyKeys).result, 'RESOURCE_LIMIT', '$')

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

test('F01 six mixed invalid inputs keep the fixed precheck order', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-f01')
  try {
    const version = clone(ctx.input)
    version.schemaVersion = 2
    expectError(runExistingFixtureTaskOnce({ scopeId: 'bad-scope', record: ctx.record, input: version }).result, 'UNSUPPORTED_VERSION', 'schemaVersion')

    const unknown = clone(ctx.input)
    unknown.extra = 1
    expectError(runExistingFixtureTaskOnce({ scopeId: 'bad-scope', record: ctx.record, input: unknown }).result, 'INVALID_INPUT', '<unknown-key>')

    const processing = advance(ctx.record, [{ type: 'BEGIN_PROCESS' }])
    const noDraft = clone(ctx.input)
    noDraft.sourceInput.voiceBinding.taskDraft = null
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: processing, input: noDraft }).result, 'TASK_TRANSITION_REJECTED', '$')

    const badRecord = clone(ctx.record)
    delete badRecord.taskId
    const noSource = clone(ctx.input)
    noSource.sourceInput = null
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: badRecord, input: noSource }).result, 'INVALID_INPUT', '$')

    const wrongScope = clone(ctx.input)
    wrongScope.sourceInput.voiceBinding.expectation.scopeId = 'scope:fixture-other'
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: processing, input: wrongScope }).result, 'TASK_TRANSITION_REJECTED', '$')

    const badDraft = clone(ctx.input)
    badDraft.sourceInput.voiceBinding.taskDraft.feature = 'broken'
    badDraft.sourceInput.voiceBinding.expectation.scopeId = 'scope:fixture-other'
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: badDraft }).result, 'SOURCE_INPUT_INVALID', 'sourceInput')
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('F04 SAVED and BLOCKED_RIGHTS round out the initial-state and legal-block branches', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-f04-saved')
  try {
    const saved = advance(ctx.record, [
      { type: 'BEGIN_PROCESS' },
      { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-fake-saved' },
      { type: 'MARK_SAVED' },
    ])
    assert.equal(saved.state, 'SAVED')
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: saved, input: ctx.input }).result, 'TASK_TRANSITION_REJECTED', '$')
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }

  const blocked = await makeExisting(example, 'key:fixture-f04-br', (draft) => {
    draft.rights.state = 'UNVERIFIED'
  })
  try {
    const input = clone(blocked.input)
    input.sourceInput.voiceBinding.taskDraft.rights.state = 'UNVERIFIED'
    const ready = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: blocked.record, input })
    assert.equal(ready.result.ok, true)
    assert.equal(ready.result.value.phase, 'BLOCKED')
    assert.equal(ready.result.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')
    assert.equal(ready.record.taskId, blocked.record.taskId)
    assert.equal(ready.record.state, 'BLOCKED_RIGHTS')
  } finally {
    removeConfigSandbox(blocked.sandbox)
  }
})

test('R03 missing scope, zero-getter counting and real deep-freeze checks', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-r03')
  try {
    expectError(runExistingFixtureTaskOnce({ record: ctx.record, input: ctx.input }).result, 'INVALID_INPUT', '$')

    let getterCalls = 0
    const frame = { record: ctx.record, input: ctx.input }
    Object.defineProperty(frame, 'scopeId', {
      enumerable: true,
      get() {
        getterCalls += 1
        return SCOPE
      },
    })
    expectError(runExistingFixtureTaskOnce(frame).result, 'INVALID_INPUT', '$')
    assert.equal(getterCalls, 0)

    const before = JSON.stringify(ctx.input)
    const beforeRecord = JSON.stringify(ctx.record)
    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input })
    expectSimulated(out.result)
    assert.equal(JSON.stringify(ctx.input), before)
    assert.equal(JSON.stringify(ctx.record), beforeRecord)
    assert.equal(Object.isFrozen(ctx.input), false)
    assert.equal(Object.isFrozen(ctx.record), false)
    const seen = new Set()
    const assertFrozenDeep = (value) => {
      if (value === null || typeof value !== 'object' || seen.has(value)) return
      seen.add(value)
      assert.equal(Object.isFrozen(value), true)
      for (const key of Reflect.ownKeys(value)) {
        assertFrozenDeep(Object.getOwnPropertyDescriptor(value, key).value)
      }
    }
    assertFrozenDeep(out.result)
    assertFrozenDeep(out.record)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

const WORKER_SCRIPT = (base) => `
import vm from 'node:vm'
import fs from 'node:fs'

const base = ${JSON.stringify(base)}
const load = (p) => import(new URL(p, base).href)
const deps = {
  input: await load('fixture-input-boundary.mjs'),
  source: await load('source-artifacts.mjs'),
  ready: await load('provider-readiness.mjs'),
  dispatch: await load('provider-dispatch.mjs'),
  task: await load('task-contract.mjs'),
  gateway: await load('../svc/rvc-fake-gateway.mjs'),
}
const mode = process.env.WORKER_MODE || 'normal'
const frame = JSON.parse(process.env.WORKER_FRAME)
const counts = { source: 0, gate: 0, dispatch: 0, create: 0, transition: 0, validateRecord: 0, validateDraft: 0 }
let faultHit = 0
const wrap = (key, fn) => (...args) => { counts[key] += 1; return fn(...args) }
const realValidateRecord = deps.task.validateAudioTaskRecord
const realValidateDraft = deps.task.validateAudioTaskDraft
const validateRecord = (...args) => {
  counts.validateRecord += 1
  const result = realValidateRecord(...args)
  if (mode === 'record-throw' && faultHit === 0) { faultHit += 1; throw new Error('injected record throw') }
  if (mode === 'record-missing-schema' && faultHit === 0 && result && result.ok === true) {
    faultHit += 1
    return { ...result, value: { ...result.value, schemaVersion: undefined } }
  }
  return result
}
const validateDraft = (...args) => {
  counts.validateDraft += 1
  const result = realValidateDraft(...args)
  if (mode === 'draft-throw' && faultHit === 0) { faultHit += 1; throw new Error('injected draft throw') }
  if (mode === 'draft-missing-taskId' && faultHit === 0 && result && result.ok === true) {
    faultHit += 1
    return { ...result, value: { ...result.value, taskId: undefined } }
  }
  if (mode === 'draft-missing-delivery' && faultHit === 0 && result && result.ok === true) {
    faultHit += 1
    return { ...result, value: { ...result.value, deliveryRequested: undefined } }
  }
  return result
}
const dispatch = (...args) => {
  counts.dispatch += 1
  const result = deps.ready.dispatchReadyRvcFakeOnce(...args)
  if (mode === 'collision' && faultHit === 0) {
    faultHit += 1
    const copy = structuredClone(result)
    copy.value.dispatch.result.artifactRef = frame.record.source.ref
    copy.value.dispatch.result.status = 'SUCCEEDED_FAKE'
    return copy
  }
  return result
}
const exportsByKey = {
  'fixture-input-boundary.mjs': {
    copyFixtureInput: deps.input.copyFixtureInput,
    deepFreezeFixtureValue: deps.input.deepFreezeFixtureValue,
  },
  'source-artifacts.mjs': { resolveFixtureTaskSource: wrap('source', deps.source.resolveFixtureTaskSource) },
  'provider-readiness.mjs': {
    negotiateReadyFixtureProvider: wrap('gate', deps.ready.negotiateReadyFixtureProvider),
    dispatchReadyRvcFakeOnce: dispatch,
  },
  'provider-dispatch.mjs': { PROVIDER_DISPATCH_ERRORS: deps.dispatch.PROVIDER_DISPATCH_ERRORS },
  'task-contract.mjs': {
    createAudioTaskRecord: wrap('create', deps.task.createAudioTaskRecord),
    projectAudioTask: deps.task.projectAudioTask,
    transitionAudioTask: wrap('transition', deps.task.transitionAudioTask),
    validateAudioTaskDraft: validateDraft,
    validateAudioTaskRecord: validateRecord,
  },
  'rvc-fake-gateway.mjs': {
    RVC_FAKE_SCENARIOS: deps.gateway.RVC_FAKE_SCENARIOS,
    validateRvcFakeResult: deps.gateway.validateRvcFakeResult,
  },
}
const enginePath = new URL('task-fixture-engine-internal.mjs', base).href
const engine = new vm.SourceTextModule(fs.readFileSync(new URL(enginePath), 'utf8'), { identifier: enginePath })
await engine.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  const key = url.split('/').pop()
  const exp = exportsByKey[key]
  if (!exp) throw new Error('unexpected import ' + url)
  const mod = new vm.SyntheticModule(Object.keys(exp), function () {
    for (const k of Object.keys(exp)) this.setExport(k, exp[k])
  }, { identifier: url })
  return mod
})
await engine.evaluate()
const out = mode === 'legacy'
  ? engine.namespace.runDraftFixtureTaskOnce(frame.input)
  : engine.namespace.runExistingFixtureTaskOnce(frame)
console.log(JSON.stringify({ counts, faultHit, record: out.record, result: out.result }))
`

function runWorker(mode, payload, base) {
  const script = WORKER_SCRIPT(base)
  const output = execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], {
    env: { ...process.env, WORKER_MODE: mode, WORKER_FRAME: JSON.stringify(payload) },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(output.trim())
}

test('T01/T02/T03 worker: native counts, validator fault, root-field fault and collision', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-t01')
  try {
    const frame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }
    const native = runExistingFixtureTaskOnce(frame)
    const nativeJson = JSON.parse(JSON.stringify(native))
    const base = new URL('../core/audio/', import.meta.url).href

    const normal = runWorker('normal', frame, base)
    assert.deepEqual(normal.record, nativeJson.record)
    assert.deepEqual(normal.result, nativeJson.result)
    assert.deepEqual(normal.counts, {
      source: 1, gate: 1, dispatch: 1, create: 0, transition: 2, validateRecord: 2, validateDraft: 1,
    })

    for (const mode of ['record-throw', 'draft-throw', 'record-missing-schema', 'draft-missing-taskId', 'draft-missing-delivery']) {
      const fault = runWorker(mode, frame, base)
      assert.equal(fault.faultHit, 1, mode)
      assert.equal(fault.record, null, mode)
      assert.equal(fault.result.ok, false, mode)
      assert.equal(fault.result.errors[0].code, 'TASK_FIXTURE_DEPENDENCY_FAILURE', mode)
      assert.equal(fault.result.errors[0].path, '$', mode)
    }

    const collision = runWorker('collision', frame, base)
    assert.equal(collision.faultHit, 1)
    assert.equal(collision.record, null)
    assert.equal(collision.result.ok, false)
    assert.equal(collision.result.errors[0].code, 'TASK_FIXTURE_INVALID_TASK_RESULT')
    assert.equal(collision.counts.dispatch, 1)

    const legacy = runWorker('legacy', { input: ctx.input }, base)
    const nativeLegacy = JSON.parse(JSON.stringify(runDraftFixtureTaskOnce(ctx.input)))
    assert.deepEqual(legacy.result, nativeLegacy.result)
    assert.deepEqual(legacy.record, nativeLegacy.record)
    assert.equal(legacy.counts.create, 1)
    assert.equal(legacy.counts.source, 1)
    assert.equal(legacy.counts.gate, 1)
    assert.equal(legacy.counts.dispatch, 1)

    const blockedInput = clone(ctx.input)
    blockedInput.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    const blocked = runWorker('normal', { scopeId: SCOPE, record: ctx.record, input: blockedInput }, base)
    assert.equal(blocked.result.ok, true)
    assert.equal(blocked.result.value.phase, 'BLOCKED')
    assert.equal(blocked.counts.dispatch, 0)
    assert.equal(blocked.counts.create, 0)
    assert.equal(blocked.counts.transition, 0)

    const unknownRecord = advance(ctx.record, [{ type: 'BEGIN_PROCESS' }, { type: 'MARK_UNKNOWN' }])
    const unknown = runWorker('normal', { scopeId: SCOPE, record: unknownRecord, input: ctx.input }, base)
    assert.equal(unknown.result.ok, false)
    assert.equal(unknown.result.errors[0].code, 'TASK_FIXTURE_TASK_TRANSITION_REJECTED')
    assert.equal(unknown.counts.source, 0)
    assert.equal(unknown.counts.gate, 0)
    assert.equal(unknown.counts.create, 0)
    assert.equal(unknown.counts.transition, 0)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('F01 legal collision: a natural Fake output equal to the synchronized task source ref hits the dedicated gate', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const base = await makeExisting(example, 'key:fixture-legal-collision-base')
  let coll = null
  try {
    const baseOut = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: base.record, input: base.input })
    assert.equal(baseOut.result.ok, true)
    const outputRef = baseOut.result.value.execution.dispatch.result.artifactRef
    assert.notEqual(outputRef, base.record.source.ref)

    coll = await makeExisting(example, 'key:fixture-legal-collision', (draft) => {
      draft.source.ref = outputRef
    })
    const collRecord = coll.record
    const collInput = clone(coll.input)
    collInput.sourceInput.voiceBinding.taskDraft.source.ref = outputRef
    collInput.sourceInput.voiceBinding.negotiation.request.sourceAudioRef = outputRef
    collInput.sourceInput.artifactLibrary.artifacts[0].artifactRef = outputRef

    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: collRecord, input: collInput })
    assert.equal(out.result.ok, false)
    assert.equal(out.result.errors[0].code, 'TASK_FIXTURE_INVALID_TASK_RESULT')
    assert.equal(out.record, null)

    const frame = { scopeId: SCOPE, record: collRecord, input: collInput }
    const worker = runWorker('normal', frame, new URL('../core/audio/', import.meta.url).href)
    assert.equal(worker.result.ok, false)
    assert.equal(worker.result.errors[0].code, 'TASK_FIXTURE_INVALID_TASK_RESULT')
    assert.equal(worker.record, null)
    assert.equal(worker.counts.source, 1)
    assert.equal(worker.counts.gate, 1)
    assert.equal(worker.counts.dispatch, 1)
    assert.equal(worker.counts.create, 0)
    assert.equal(worker.counts.transition, 0)

    const unsynced = clone(collInput)
    unsynced.sourceInput.voiceBinding.negotiation.request.sourceAudioRef = base.record.source.ref
    expectBlocked(
      runExistingFixtureTaskOnce({ scopeId: SCOPE, record: collRecord, input: unsynced }).result,
      'TASK_FIXTURE_SOURCE_BLOCKED',
    )
  } finally {
    removeConfigSandbox(base.sandbox)
    if (coll !== null) removeConfigSandbox(coll.sandbox)
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
