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
  validateAudioTaskDraft,
  validateAudioTaskRecord,
} from '../core/audio/task-contract.mjs'
import { validateVoiceAssetLibrary } from '../core/audio/voice-assets.mjs'

const SCOPE = 'scope:fixture-demo'
const NOW = '2026-10-27T00:00:00.000Z'
const FILE = 'audio-task-catalog-v1.json'
const AUDIO_BASE = new URL('../core/audio/', import.meta.url).href

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

/** Fixed error envelope: exactly one issue with only code/path/reason and no echoed input. */
function assertNoEcho(result, label) {
  assert.equal(result.ok, false, label)
  assert.equal(result.errors.length, 1, label)
  assert.deepEqual(Object.keys(result.errors[0]).sort(), ['code', 'path', 'reason'], label)
  const text = JSON.stringify(result)
  for (const marker of [
    'injected',
    'Error:',
    'stack',
    'taskDraft',
    'artifactLibrary',
    'profiles',
    'voiceBinding',
    'negotiation',
    'observedAt',
  ]) {
    assert.equal(text.includes(marker), false, label + ' leaked ' + marker)
  }
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

/** Max structural depth, measured through own data descriptors only (no getter is invoked). */
function depthOf(value) {
  const seen = new Set()
  const walk = (current, depth) => {
    if (current === null || typeof current !== 'object' || seen.has(current)) return depth
    seen.add(current)
    let max = depth
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue
      const child = walk(descriptor.value, depth + 1)
      if (child > max) max = child
    }
    return max
  }
  return walk(value, 0)
}

/** A plain nested chain: nested(n) is n `{child: value}` objects around a null leaf. */
function nested(n) {
  let value = null
  for (let index = 0; index < n; index += 1) value = { child: value }
  return value
}

/** Every own data-property object of the whole graph, with its frozen state and JSON projection. */
function collectGraph(value) {
  const objects = new Set()
  const frozen = new Map()
  const seen = new Set()
  const walk = (current) => {
    if (current === null || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    objects.add(current)
    frozen.set(current, Object.isFrozen(current))
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) walk(descriptor.value)
    }
  }
  walk(value)
  return { objects, frozen, json: JSON.stringify(value) }
}

function nullProtoClone(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(nullProtoClone)
  const output = Object.create(null)
  for (const key of Object.keys(value)) output[key] = nullProtoClone(value[key])
  return output
}

function draftOf(record) {
  return {
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    feature: record.feature,
    taskType: record.taskType,
    source: { kind: record.source.kind, ref: record.source.ref },
    voiceProfileId: record.voiceProfileId,
    deliveryRequested: record.deliveryRequested,
    rights: { state: record.rights.state },
  }
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

test('B05 a legal cross-scope voice library blocks the source and keeps the original record', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b05-legal')
  try {
    const library = clone(ctx.input.sourceInput.voiceBinding.library)
    library.profiles[0].scopeId = 'scope:fixture-other'
    library.assets[0].scopeId = 'scope:fixture-other'
    const libraryCheck = validateVoiceAssetLibrary(library)
    assert.equal(libraryCheck.ok, true)

    const input = clone(ctx.input)
    input.sourceInput.voiceBinding.library = clone(library)
    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input })
    expectBlocked(out.result, 'TASK_FIXTURE_SOURCE_BLOCKED')
    assert.equal(out.result.value.sourceCheck.decision, 'BLOCKED')
    assert.equal(out.result.value.sourceCheck.source, null)
    assert.equal(out.result.value.sourceCheck.voiceBinding.reason, 'VOICE_ASSET_PROFILE_UNAVAILABLE')
    assert.deepEqual(out.result.value.states, [ctx.record.state])
    assert.equal(out.result.value.task.taskId, ctx.record.taskId)
    assert.equal(out.record.taskId, ctx.record.taskId)

    // Moving only the profile leaves the library structurally invalid: that older control stays structural.
    const single = clone(ctx.input)
    single.sourceInput.voiceBinding.library.profiles[0].scopeId = 'scope:fixture-other'
    assert.equal(validateVoiceAssetLibrary(single.sourceInput.voiceBinding.library).ok, false)
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: single }).result, 'SOURCE_INPUT_INVALID', 'sourceInput')
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B06 every illegal draft/record identity domain is rejected before any Fake', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b06')
  try {
    const record = ctx.record
    const illegal = [
      ['feature alone', (d) => { d.feature = 'other' }],
      ['taskType alone', (d) => { d.taskType = 'TTS' }],
      ['source.kind alone', (d) => { d.source.kind = 'TEXT_REF' }],
      ['schemaVersion 2', (d) => { d.schemaVersion = 2 }],
      ['taskId pattern', (d) => { d.taskId = 'not-a-task-id' }],
      ['voiceProfileId pattern', (d) => { d.voiceProfileId = 'not-a-voice' }],
      ['rights enum', (d) => { d.rights.state = 'NOPE' }],
    ]
    for (const [label, mutate] of illegal) {
      const draft = draftOf(record)
      mutate(draft)
      assert.equal(validateAudioTaskDraft(draft).ok, false, label)
      const input = clone(ctx.input)
      mutate(input.sourceInput.voiceBinding.taskDraft)
      const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record, input })
      expectError(out.result, 'SOURCE_INPUT_INVALID', 'sourceInput')
      assert.equal(out.record, null, label)
    }
    const deliveryless = clone(ctx.input)
    delete deliveryless.sourceInput.voiceBinding.taskDraft.deliveryRequested
    const ok = runExistingFixtureTaskOnce({ scopeId: SCOPE, record, input: deliveryless })
    expectSimulated(ok.result)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B06 legal normalized identity controls reach the record comparison, not the draft validator', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b06-legal')
  try {
    const record = ctx.record
    const legal = [
      ['taskId', (d) => { d.taskId = 'task:fixture-b06-other' }],
      ['linked feature/taskType/source.kind', (d) => { d.feature = 'voice-bubbles'; d.taskType = 'TTS'; d.source.kind = 'TEXT_REF' }],
      ['source.ref', (d) => { d.source.ref = 'artifact:other-ref' }],
      ['voiceProfileId', (d) => { d.voiceProfileId = 'voice:other' }],
      ['rights.state', (d) => { d.rights.state = 'UNVERIFIED' }],
      ['deliveryRequested', (d) => { d.deliveryRequested = true }],
    ]
    for (const [label, mutate] of legal) {
      const draft = draftOf(record)
      mutate(draft)
      const normalized = validateAudioTaskDraft(draft)
      assert.equal(normalized.ok, true, label)
      assert.notEqual(validateAudioTaskDraft(draftOf(record)).ok, false, label)

      const input = clone(ctx.input)
      mutate(input.sourceInput.voiceBinding.taskDraft)
      const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record, input })
      expectError(out.result, 'INVALID_INPUT', '$')
      assert.equal(out.record, null, label)
    }

    // schemaVersion has exactly one legal value: a different version can only be a draft refusal.
    const versioned = draftOf(record)
    versioned.schemaVersion = 1
    assert.equal(validateAudioTaskDraft(versioned).ok, true)
    versioned.schemaVersion = 2
    assert.equal(validateAudioTaskDraft(versioned).ok, false)

    // The corrected attribution: a legal linked TTS-shaped draft validates OK and then fails only identity.
    const linked = draftOf(record)
    linked.feature = 'voice-bubbles'
    linked.taskType = 'TTS'
    linked.source.kind = 'TEXT_REF'
    const linkedCheck = validateAudioTaskDraft(linked)
    assert.equal(linkedCheck.ok, true)
    assert.equal(linkedCheck.value.feature, 'voice-bubbles')
    assert.equal(linkedCheck.value.taskType, 'TTS')
    assert.equal(linkedCheck.value.source.kind, 'TEXT_REF')
    assert.equal(linkedCheck.value.taskId, record.taskId)
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

test('B09 a legal source block stays structural for a bad context/readiness and the REMOTE policy stays reachable', async () => {
  const svc = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(svc, 'key:fixture-b09-overlay')
  try {
    const absent = clone(ctx.input)
    absent.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
    const blocked = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: absent })
    expectBlocked(blocked.result, 'TASK_FIXTURE_SOURCE_BLOCKED')
    assert.equal(blocked.result.value.sourceCheck.reason, 'SOURCE_ARTIFACT_SOURCE_MISSING')
    assert.equal(blocked.record.taskId, ctx.record.taskId)

    const badContext = clone(absent)
    badContext.context = { requestId: 'request:fixture-1' }
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: badContext }).result, 'INVALID_CONTEXT', 'context')

    const badReadiness = clone(absent)
    badReadiness.readiness.instances[0].resources.gpu = 'NOT_A_STATE'
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: badReadiness }).result, 'READINESS_INVALID', 'readiness')
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }

  const tts = extractExample('## 8. TTS阻断示例')
  const ctx2 = await makeExisting(tts, 'key:fixture-b09-remote')
  try {
    const remote = clone(ctx2.input)
    remote.sourceInput.voiceBinding.negotiation.registry.instances[0].manifest.resources.local = false
    remote.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    remote.readiness.instances[0].resources.gpu = 'UNAVAILABLE'
    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx2.record, input: remote })
    expectBlocked(out.result, 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH')
    assert.equal(out.result.value.readiness.decision, 'FIXTURE_READY')
    assert.equal(out.result.value.readiness.observation.requiredResource, 'REMOTE')
    assert.equal(out.result.value.task.state, 'CREATED')

    const missing = clone(ctx2.input)
    missing.readiness.instances[0].installation = 'ABSENT'
    const absentOut = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx2.record, input: missing })
    expectBlocked(absentOut.result, 'TASK_FIXTURE_READINESS_BLOCKED')
    assert.equal(absentOut.result.value.readiness.reason, 'PROVIDER_READINESS_INSTALLATION_MISSING')
    assert.equal(absentOut.record.taskId, ctx2.record.taskId)
    assert.deepEqual(absentOut.result.value.states, ['CREATED'])
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

test('B12 measured partition boundary: depth 12 accepted, depth 13 rejected, legal input depth 12', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b12-precise')
  const tts = extractExample('## 8. TTS阻断示例')
  const ctx2 = await makeExisting(tts, 'key:fixture-b12-tts')
  try {
    assert.equal(depthOf(ctx.input), 8)
    assert.equal(depthOf(ctx2.input), 12)
    const legalTts = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx2.record, input: ctx2.input })
    expectBlocked(legalTts.result, 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH')

    const input13 = nested(13)
    assert.equal(depthOf(input13), 13)
    const tooDeep = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: input13 })
    expectError(tooDeep.result, 'RESOURCE_LIMIT', '$')
    assert.equal(tooDeep.record, null)

    const input12 = nested(12)
    assert.equal(depthOf(input12), 12)
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: input12 }).result, 'INVALID_INPUT', '<unknown-key>')

    const record12 = nested(12)
    const owner13 = { scopeId: SCOPE, record: record12 }
    assert.equal(depthOf(owner13), 13)
    const ownerTooDeep = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: record12, input: ctx.input })
    expectError(ownerTooDeep.result, 'RESOURCE_LIMIT', '$')
    assert.equal(ownerTooDeep.record, null)

    const record11 = nested(11)
    assert.equal(depthOf({ scopeId: SCOPE, record: record11 }), 12)
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: record11, input: ctx.input }).result, 'INVALID_INPUT', '$')

    const hidden = clone(ctx.input)
    Object.defineProperty(hidden, 'extra', { value: 1, enumerable: false, configurable: true })
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: hidden }).result, 'INVALID_INPUT', '$')

    const cyclic = clone(ctx.input)
    cyclic.self = cyclic
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: cyclic }).result, 'INVALID_INPUT', '$')

    const nullProto = nullProtoClone(ctx.input)
    assert.equal(Object.getPrototypeOf(nullProto), null)
    const nullOut = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: nullProto })
    expectSimulated(nullOut.result)
    assert.equal(nullOut.record.taskId, ctx.record.taskId)
  } finally {
    removeConfigSandbox(ctx.sandbox)
    removeConfigSandbox(ctx2.sandbox)
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

test('B13 full-graph isolation: wrapper/output all frozen, no shared object with the actual input, repeat runs disjoint', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b13-graph')
  try {
    const before = collectGraph(ctx.input)
    const recordBefore = collectGraph(ctx.record)
    assert.equal(Object.isFrozen(ctx.input), false)
    assert.equal(Object.isFrozen(ctx.record), false)

    const first = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input })
    expectSimulated(first.result)
    assert.equal(Object.isFrozen(first), true)

    const afterInput = collectGraph(ctx.input)
    assert.equal(afterInput.json, before.json)
    assert.deepEqual([...afterInput.frozen.entries()].map(([, frozen]) => frozen).sort(), [...before.frozen.entries()].map(([, frozen]) => frozen).sort())
    assert.equal(collectGraph(ctx.record).json, recordBefore.json)

    const firstGraph = collectGraph(first)
    for (const object of firstGraph.objects) {
      assert.equal(Object.isFrozen(object), true)
      assert.equal(before.objects.has(object), false)
      assert.equal(recordBefore.objects.has(object), false)
    }

    const second = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: ctx.input })
    expectSimulated(second.result)
    const secondGraph = collectGraph(second)
    for (const object of secondGraph.objects) {
      assert.equal(Object.isFrozen(object), true)
      assert.equal(firstGraph.objects.has(object), false)
      assert.equal(before.objects.has(object), false)
    }
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
    const outGraph = collectGraph(out)
    for (const object of outGraph.objects) assert.equal(Object.isFrozen(object), true)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

/*
 * Test-only worker. It loads the real engine inside a vm module graph so dependency calls can be
 * counted and one controlled fault can be injected. Entry selection (existing / draft / public) is
 * independent from the fault target and fault name; the "final" record-validator call is derived
 * from the entry that actually runs it (existing has an initial validation, draft/public do not).
 * Nothing here changes product code, and the public entry only ever reports its public envelope.
 */
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
const entry = process.env.WORKER_ENTRY || 'existing'
const fault = JSON.parse(process.env.WORKER_FAULT || 'null')
const frame = JSON.parse(process.env.WORKER_FRAME || 'null')
const counts = { source: 0, gate: 0, dispatch: 0, create: 0, transition: 0, validateRecord: 0, validateDraft: 0, validatorOk: 0, rvcCalls: 0, rvcOk: 0 }
const finalRecordCall = entry === 'existing' ? 2 : 1
let faultHit = 0
let faultAt = null
const clone = (value) => JSON.parse(JSON.stringify(value))
const dropped = (value, field) => { const copy = clone(value); delete copy[field]; return copy }
function claim(target, call) {
  if (faultHit !== 0 || fault === null || fault.target !== target) return null
  let wanted = 1
  if (fault.call === 'final') wanted = target === 'record' ? finalRecordCall : 1
  else if (fault.call === 'first') wanted = 1
  else if (typeof fault.call === 'number') wanted = fault.call
  if (call !== wanted) return null
  faultHit += 1
  faultAt = { target: target, call: call }
  return fault.kind
}
function mutatedSuccess(kind, result) {
  const shape = kind.slice('success-'.length)
  if (shape === '42') return { ok: true, value: 42 }
  if (shape === 'empty') return { ok: true, value: {} }
  const value = { ...result.value }
  if (shape === 'missing-source') delete value.source
  else if (shape === 'source-42') value.source = 42
  else if (shape === 'schema-undefined') value.schemaVersion = undefined
  else if (shape === 'taskid-undefined') value.taskId = undefined
  else if (shape === 'delivery-undefined') value.deliveryRequested = undefined
  else throw new Error('unknown success shape ' + shape)
  return { ...result, value: value }
}
function protocolFault(kind, result) {
  if (kind === 'null') return null
  if (kind === 'not-boolean') return { ok: 'yes', value: null }
  if (kind === 'scalar-result') return 42
  return mutatedSuccess(kind, result)
}
const realValidateRecord = deps.task.validateAudioTaskRecord
const realValidateDraft = deps.task.validateAudioTaskDraft
const validateRecord = (...args) => {
  counts.validateRecord += 1
  const kind = claim('record', counts.validateRecord)
  if (kind === 'throw') throw new Error('injected record throw')
  if (kind !== null && kind.indexOf('legal-delete-') === 0) {
    return realValidateRecord(dropped(args[0], kind.slice('legal-delete-'.length)))
  }
  const result = realValidateRecord(...args)
  if (result && result.ok === true) counts.validatorOk += 1
  if (kind === null) return result
  return protocolFault(kind, result)
}
const validateDraft = (...args) => {
  counts.validateDraft += 1
  const kind = claim('draft', counts.validateDraft)
  if (kind === 'throw') throw new Error('injected draft throw')
  if (kind !== null && kind.indexOf('legal-delete-') === 0) {
    return realValidateDraft(dropped(args[0], kind.slice('legal-delete-'.length)))
  }
  const result = realValidateDraft(...args)
  if (kind === null) return result
  return protocolFault(kind, result)
}
const wrap = (key, fn) => (...args) => { counts[key] += 1; return fn(...args) }
const dispatch = (...args) => {
  counts.dispatch += 1
  const result = deps.ready.dispatchReadyRvcFakeOnce(...args)
  const kind = claim('dispatch', counts.dispatch)
  if (kind === null) return result
  if (kind === 'throw') throw new Error('injected dispatch throw')
  const copy = structuredClone(result)
  const execution = copy.value
  if (kind === 'missing-field') execution.dispatch.result.durationMs = undefined
  else if (kind === 'type-bad') execution.dispatch.result.status = 42
  else if (kind === 'request-bad') execution.dispatch.result.requestId = 'request:fixture-other'
  else if (kind === 'model-bad') execution.dispatch.result.targetModelId = 'rvc-model:fixture-other'
  else if (kind === 'identity-bad') execution.dispatch.instanceId = 'instance:other'
  else if (kind === 'candidate-bad') execution.dispatch.candidateId = 'candidate:other'
  else if (kind === 'category-bad') execution.dispatch.category = 'TTS'
  else if (kind === 'readiness-instance-bad') execution.readiness.instanceId = 'instance:other'
  else if (kind === 'collision') {
    execution.dispatch.result.artifactRef = frame.record.source.ref
    execution.dispatch.result.status = 'SUCCEEDED_FAKE'
  } else throw new Error('unknown dispatch fault ' + kind)
  return copy
}
const validateRvc = (...args) => {
  counts.rvcCalls += 1
  const result = deps.gateway.validateRvcFakeResult(...args)
  if (result && result.ok === true) counts.rvcOk += 1
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
    validateRvcFakeResult: validateRvc,
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
const facadeUrl = new URL('task-fixture-runner.mjs', base).href
const facade = new vm.SourceTextModule(fs.readFileSync(new URL(facadeUrl), 'utf8'), { identifier: facadeUrl })
await facade.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === enginePath) return engine
  const key = url.split('/').pop()
  const exp = exportsByKey[key]
  if (!exp) throw new Error('unexpected facade import ' + url)
  return new vm.SyntheticModule(Object.keys(exp), function () {
    for (const k of Object.keys(exp)) this.setExport(k, exp[k])
  }, { identifier: url })
})
await facade.evaluate()
const out = entry === 'draft'
  ? engine.namespace.runDraftFixtureTaskOnce(frame.input)
  : entry === 'public'
    ? { result: facade.namespace.runFixtureAudioTaskOnce(frame.input) }
    : engine.namespace.runExistingFixtureTaskOnce(frame)
console.log(JSON.stringify({
  entry: entry,
  counts: counts,
  faultHit: faultHit,
  faultAt: faultAt,
  exposesPrivateRecord: out.record !== undefined,
  record: out.record === undefined ? null : out.record,
  result: out.result,
}))
`

function runWorker(entry, fault, payload, base = AUDIO_BASE) {
  const script = WORKER_SCRIPT(base)
  const output = execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], {
    env: {
      ...process.env,
      WORKER_ENTRY: entry,
      WORKER_FAULT: JSON.stringify(fault),
      WORKER_FRAME: JSON.stringify(payload),
    },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(output.trim())
}

const NORMAL_COUNTS = Object.freeze({
  source: 1,
  gate: 1,
  dispatch: 1,
  create: 0,
  transition: 2,
  validateRecord: 2,
  validateDraft: 1,
  validatorOk: 2,
  rvcCalls: 1,
  rvcOk: 1,
})

const DRAFT_COUNTS = Object.freeze({
  source: 1,
  gate: 1,
  dispatch: 1,
  create: 1,
  transition: 2,
  validateRecord: 1,
  validateDraft: 0,
  validatorOk: 1,
  rvcCalls: 1,
  rvcOk: 1,
})

function expectDependencyFailure(run, label) {
  assert.equal(run.result.ok, false, label)
  assert.equal(run.result.errors.length, 1, label)
  assert.equal(run.result.errors[0].code, 'TASK_FIXTURE_DEPENDENCY_FAILURE', label)
  assert.equal(run.result.errors[0].path, '$', label)
  assert.equal(run.faultHit, 1, label)
  if (run.exposesPrivateRecord) assert.equal(run.record, null, label)
}

test('T01 worker: native counts, entry separation and the actual public envelope', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-t01')
  try {
    const frame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }
    const native = JSON.parse(JSON.stringify(runExistingFixtureTaskOnce(frame)))

    const normal = runWorker('existing', null, frame)
    assert.deepEqual(normal.record, native.record)
    assert.deepEqual(normal.result, native.result)
    assert.deepEqual(normal.counts, NORMAL_COUNTS)
    assert.equal(normal.faultHit, 0)
    assert.equal(normal.exposesPrivateRecord, true)

    const legacy = runWorker('draft', null, { input: ctx.input })
    const nativeLegacy = JSON.parse(JSON.stringify(runDraftFixtureTaskOnce(ctx.input)))
    assert.deepEqual(legacy.result, nativeLegacy.result)
    assert.deepEqual(legacy.record, nativeLegacy.record)
    assert.deepEqual(legacy.counts, DRAFT_COUNTS)

    const publicRun = runWorker('public', null, { input: ctx.input })
    assert.deepEqual(publicRun.result, JSON.parse(JSON.stringify(runFixtureAudioTaskOnce(ctx.input))))
    assert.deepEqual(publicRun.counts, DRAFT_COUNTS)
    assert.equal(publicRun.exposesPrivateRecord, false)
    assert.equal(JSON.stringify(publicRun.result).includes('observedAt'), false)
    assert.equal(JSON.stringify(publicRun.result).includes('"record"'), false)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('T02 stage protocol matrix: legal refusal vs bad protocol at record/draft/final, both final entries', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-t02')
  try {
    const frame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }

    const initialLegal = runWorker('existing', { target: 'record', kind: 'legal-delete-schemaVersion', call: 'first' }, frame)
    assert.equal(initialLegal.faultHit, 1)
    assert.deepEqual(initialLegal.faultAt, { target: 'record', call: 1 })
    expectError(initialLegal.result, 'INVALID_INPUT', '$')
    assert.equal(initialLegal.record, null)
    assert.equal(initialLegal.counts.validateRecord, 1)
    assert.equal(initialLegal.counts.validateDraft, 0)
    assert.equal(initialLegal.counts.source, 0)
    assert.equal(initialLegal.counts.gate, 0)
    assert.equal(initialLegal.counts.dispatch, 0)
    assert.equal(initialLegal.counts.transition, 0)
    assertNoEcho(initialLegal.result, 'initial legal refusal')

    const draftLegal = runWorker('existing', { target: 'draft', kind: 'legal-delete-taskId', call: 'first' }, frame)
    assert.equal(draftLegal.faultHit, 1)
    expectError(draftLegal.result, 'SOURCE_INPUT_INVALID', 'sourceInput')
    assert.equal(draftLegal.record, null)
    assert.equal(draftLegal.counts.validateRecord, 1)
    assert.equal(draftLegal.counts.validateDraft, 1)
    assert.equal(draftLegal.counts.dispatch, 0)
    assert.equal(draftLegal.counts.transition, 0)
    assertNoEcho(draftLegal.result, 'draft legal refusal')

    const stages = [
      { entry: 'existing', finalCall: 2, create: 0 },
      { entry: 'draft', finalCall: 1, create: 1 },
      { entry: 'public', finalCall: 1, create: 1 },
    ]
    for (const stage of stages) {
      const payload = stage.entry === 'existing' ? frame : { input: ctx.input }
      const run = runWorker(stage.entry, { target: 'record', kind: 'legal-delete-deliveryRequested', call: 'final' }, payload)
      assert.equal(run.faultHit, 1, stage.entry)
      assert.deepEqual(run.faultAt, { target: 'record', call: stage.finalCall }, stage.entry)
      expectError(run.result, 'TASK_TRANSITION_REJECTED', '$')
      assert.equal(run.counts.transition, 2, stage.entry)
      assert.equal(run.counts.dispatch, 1, stage.entry)
      assert.equal(run.counts.create, stage.create, stage.entry)
      assert.equal(run.counts.rvcCalls, 1, stage.entry)
      assert.equal(run.counts.rvcOk, 1, stage.entry)
      if (run.exposesPrivateRecord) assert.equal(run.record, null, stage.entry)
      assertNoEcho(run.result, 'final legal refusal ' + stage.entry)
    }

    const recordInitialFaults = ['throw', 'null', 'not-boolean', 'scalar-result', 'success-42', 'success-empty', 'success-missing-source', 'success-source-42']
    for (const kind of recordInitialFaults) {
      const run = runWorker('existing', { target: 'record', kind, call: 'first' }, frame)
      expectDependencyFailure(run, 'initial record ' + kind)
      assert.equal(run.counts.dispatch, 0, kind)
      assert.equal(run.counts.transition, 0, kind)
      assert.equal(run.counts.validateDraft, 0, kind)
      assertNoEcho(run.result, 'initial record ' + kind)
    }

    const recordUndefinedFaults = ['success-schema-undefined', 'success-taskid-undefined', 'success-delivery-undefined']
    for (const kind of recordUndefinedFaults) {
      const run = runWorker('existing', { target: 'record', kind, call: 'final' }, frame)
      expectDependencyFailure(run, 'final record ' + kind)
      assert.equal(run.counts.transition, 2, kind)
      assert.equal(run.counts.dispatch, 1, kind)
      assertNoEcho(run.result, 'final record ' + kind)
    }

    const draftFaults = ['throw', 'null', 'not-boolean', 'scalar-result', 'success-42', 'success-empty', 'success-missing-source', 'success-source-42']
    for (const kind of draftFaults) {
      const run = runWorker('existing', { target: 'draft', kind, call: 'first' }, frame)
      expectDependencyFailure(run, 'draft ' + kind)
      assert.equal(run.counts.validateDraft, 1, kind)
      assert.equal(run.counts.dispatch, 0, kind)
      assert.equal(run.counts.transition, 0, kind)
      assertNoEcho(run.result, 'draft ' + kind)
    }

    const draftUndefinedFaults = ['success-taskid-undefined', 'success-delivery-undefined']
    for (const kind of draftUndefinedFaults) {
      expectDependencyFailure(runWorker('existing', { target: 'draft', kind, call: 'first' }, frame), 'draft ' + kind)
    }

    for (const entry of ['draft', 'public']) {
      for (const kind of ['throw', 'null', 'scalar-result']) {
        const run = runWorker(entry, { target: 'record', kind, call: 'final' }, { input: ctx.input })
        expectDependencyFailure(run, entry + ' final ' + kind)
        assert.equal(run.counts.transition, 2, entry + kind)
        assert.equal(run.counts.dispatch, 1, entry + kind)
        assertNoEcho(run.result, entry + ' final ' + kind)
      }
    }

    const dispatchThrow = runWorker('existing', { target: 'dispatch', kind: 'throw', call: 1 }, frame)
    expectDependencyFailure(dispatchThrow, 'dispatch throw')
    assert.equal(dispatchThrow.counts.dispatch, 1)
    assert.equal(dispatchThrow.counts.transition, 0)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B10 worker counts: legacy/still-blocked initial states and six mixed prechecks call nothing extra', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b10')
  try {
    const frame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }

    const blockedInput = clone(ctx.input)
    blockedInput.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    const blocked = runWorker('existing', null, { scopeId: SCOPE, record: ctx.record, input: blockedInput })
    expectBlocked(blocked.result, 'TASK_FIXTURE_READINESS_BLOCKED')
    assert.equal(blocked.counts.dispatch, 0)
    assert.equal(blocked.counts.create, 0)
    assert.equal(blocked.counts.transition, 0)
    assert.equal(blocked.counts.source, 1)

    const unknownRecord = advance(ctx.record, [{ type: 'BEGIN_PROCESS' }, { type: 'MARK_UNKNOWN' }])
    const unknown = runWorker('existing', null, { scopeId: SCOPE, record: unknownRecord, input: ctx.input })
    expectError(unknown.result, 'TASK_TRANSITION_REJECTED', '$')
    assert.equal(unknown.record, null)
    assert.equal(unknown.counts.source, 0)
    assert.equal(unknown.counts.gate, 0)
    assert.equal(unknown.counts.create, 0)
    assert.equal(unknown.counts.transition, 0)
    assert.equal(unknown.counts.dispatch, 0)
    assert.equal(unknown.counts.validateRecord, 1)
    assert.equal(unknown.counts.validateDraft, 0)

    const saved = advance(ctx.record, [
      { type: 'BEGIN_PROCESS' },
      { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-fake-saved' },
      { type: 'MARK_SAVED' },
    ])
    const savedRun = runWorker('existing', null, { scopeId: SCOPE, record: saved, input: ctx.input })
    expectError(savedRun.result, 'TASK_TRANSITION_REJECTED', '$')
    assert.equal(savedRun.record, null)
    assert.equal(savedRun.counts.source, 0)
    assert.equal(savedRun.counts.gate, 0)
    assert.equal(savedRun.counts.create, 0)
    assert.equal(savedRun.counts.transition, 0)
    assert.equal(savedRun.counts.dispatch, 0)

    const absent = clone(ctx.input)
    absent.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
    const legacySourceBlock = runWorker('draft', null, { input: absent })
    expectBlocked(legacySourceBlock.result, 'TASK_FIXTURE_SOURCE_BLOCKED')
    assert.equal(legacySourceBlock.counts.create, 0)
    assert.equal(legacySourceBlock.counts.dispatch, 0)
    assert.equal(legacySourceBlock.counts.transition, 0)
    assert.equal(legacySourceBlock.counts.validateRecord, 0)

    const legacyReadiness = clone(ctx.input)
    legacyReadiness.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    const legacyGateBlock = runWorker('draft', null, { input: legacyReadiness })
    expectBlocked(legacyGateBlock.result, 'TASK_FIXTURE_READINESS_BLOCKED')
    assert.equal(legacyGateBlock.counts.create, 1)
    assert.equal(legacyGateBlock.counts.dispatch, 0)
    assert.equal(legacyGateBlock.counts.transition, 0)

    const version = clone(ctx.input)
    version.schemaVersion = 2
    const mixedVersion = runWorker('existing', null, { scopeId: 'bad-scope', record: ctx.record, input: version })
    expectError(mixedVersion.result, 'UNSUPPORTED_VERSION', 'schemaVersion')
    assert.equal(mixedVersion.counts.validateRecord, 0)
    assert.equal(mixedVersion.counts.validateDraft, 0)

    const unknownKey = clone(ctx.input)
    unknownKey.extra = 1
    const mixedUnknown = runWorker('existing', null, { scopeId: 'bad-scope', record: ctx.record, input: unknownKey })
    expectError(mixedUnknown.result, 'INVALID_INPUT', '<unknown-key>')
    assert.equal(mixedUnknown.counts.validateRecord, 0)

    const processing = advance(ctx.record, [{ type: 'BEGIN_PROCESS' }])
    const noDraft = clone(ctx.input)
    noDraft.sourceInput.voiceBinding.taskDraft = null
    const mixedNoDraft = runWorker('existing', null, { scopeId: SCOPE, record: processing, input: noDraft })
    expectError(mixedNoDraft.result, 'TASK_TRANSITION_REJECTED', '$')
    assert.equal(mixedNoDraft.counts.validateRecord, 1)
    assert.equal(mixedNoDraft.counts.validateDraft, 0)

    const badRecord = clone(ctx.record)
    delete badRecord.taskId
    const noSource = clone(ctx.input)
    noSource.sourceInput = null
    const mixedNoSource = runWorker('existing', null, { scopeId: SCOPE, record: badRecord, input: noSource })
    expectError(mixedNoSource.result, 'INVALID_INPUT', '$')
    assert.equal(mixedNoSource.counts.validateRecord, 1)

    const wrongScope = clone(ctx.input)
    wrongScope.sourceInput.voiceBinding.expectation.scopeId = 'scope:fixture-other'
    const mixedWrongScope = runWorker('existing', null, { scopeId: SCOPE, record: processing, input: wrongScope })
    expectError(mixedWrongScope.result, 'TASK_TRANSITION_REJECTED', '$')
    assert.equal(mixedWrongScope.counts.validateRecord, 1)
    assert.equal(mixedWrongScope.counts.validateDraft, 0)

    const badDraft = clone(ctx.input)
    badDraft.sourceInput.voiceBinding.taskDraft.feature = 'broken'
    badDraft.sourceInput.voiceBinding.expectation.scopeId = 'scope:fixture-other'
    const mixedBadDraft = runWorker('existing', null, { scopeId: SCOPE, record: ctx.record, input: badDraft })
    expectError(mixedBadDraft.result, 'SOURCE_INPUT_INVALID', 'sourceInput')
    assert.equal(mixedBadDraft.counts.validateDraft, 1)

    for (const run of [mixedVersion, mixedUnknown, mixedNoDraft, mixedNoSource, mixedWrongScope, mixedBadDraft]) {
      assert.equal(run.counts.source, 0)
      assert.equal(run.counts.gate, 0)
      assert.equal(run.counts.create, 0)
      assert.equal(run.counts.transition, 0)
      assert.equal(run.counts.dispatch, 0)
      assert.equal(run.record, null)
    }
    assert.equal(frame.input.sourceInput.voiceBinding.taskDraft.taskId.length > 0, true)
  } finally {
    removeConfigSandbox(ctx.sandbox)
  }
})

test('B11 gate/dispatch association faults and RVC result association keep separate fixed errors', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-b11')
  try {
    const frame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }

    const identityFaults = ['identity-bad', 'candidate-bad', 'category-bad', 'readiness-instance-bad']
    for (const kind of identityFaults) {
      const run = runWorker('existing', { target: 'dispatch', kind, call: 1 }, frame)
      expectDependencyFailure(run, kind)
      assert.equal(run.counts.dispatch, 1, kind)
      assert.equal(run.counts.transition, 0, kind)
      assert.equal(run.counts.rvcCalls, 0, kind)
      assert.equal(run.counts.rvcOk, 0, kind)
      assertNoEcho(run.result, kind)
    }

    const resultFaults = ['request-bad', 'model-bad']
    for (const kind of resultFaults) {
      const run = runWorker('existing', { target: 'dispatch', kind, call: 1 }, frame)
      assert.equal(run.faultHit, 1, kind)
      assert.equal(run.result.ok, false, kind)
      assert.equal(run.result.errors[0].code, 'TASK_FIXTURE_INVALID_TASK_RESULT', kind)
      assert.equal(run.result.errors[0].path, '$', kind)
      assert.equal(run.record, null, kind)
      assert.equal(run.counts.dispatch, 1, kind)
      assert.equal(run.counts.rvcCalls, 1, kind)
      assert.equal(run.counts.rvcOk, 0, kind)
      assert.equal(run.counts.transition, 0, kind)
      assertNoEcho(run.result, kind)
    }

    for (const kind of ['missing-field', 'type-bad']) {
      const run = runWorker('existing', { target: 'dispatch', kind, call: 1 }, frame)
      assert.equal(run.faultHit, 1, kind)
      assert.equal(run.result.ok, false, kind)
      assert.equal(run.result.errors[0].code, 'TASK_FIXTURE_INVALID_TASK_RESULT', kind)
      assert.equal(run.result.errors[0].path, '$', kind)
      assert.equal(run.record, null, kind)
      assert.equal(run.counts.dispatch, 1, kind)
      assert.equal(run.counts.rvcCalls, 1, kind)
      assert.equal(run.counts.rvcOk, 0, kind)
      assert.equal(run.counts.transition, 0, kind)
      assert.equal(run.counts.create, 0, kind)
      assertNoEcho(run.result, kind)
    }

    const normal = runWorker('existing', null, frame)
    assert.deepEqual(normal.counts, NORMAL_COUNTS)
    assert.equal(normal.counts.rvcOk, 1)
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

    assert.equal(collRecord.source.ref, outputRef)
    assert.equal(collInput.sourceInput.voiceBinding.taskDraft.source.ref, outputRef)
    assert.equal(collInput.sourceInput.voiceBinding.negotiation.request.sourceAudioRef, outputRef)
    assert.equal(collInput.sourceInput.artifactLibrary.artifacts[0].artifactRef, outputRef)

    const out = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: collRecord, input: collInput })
    assert.equal(out.result.ok, false)
    assert.equal(out.result.errors[0].code, 'TASK_FIXTURE_INVALID_TASK_RESULT')
    assert.equal(out.result.errors[0].path, '$')
    assert.equal(out.record, null)
    assertNoEcho(out.result, 'legal collision native')

    const frame = { scopeId: SCOPE, record: collRecord, input: collInput }
    const worker = runWorker('existing', null, frame)
    assert.deepEqual(worker.result, JSON.parse(JSON.stringify(out.result)))
    assert.equal(worker.result.ok, false)
    assert.equal(worker.result.errors[0].code, 'TASK_FIXTURE_INVALID_TASK_RESULT')
    assert.equal(worker.result.errors[0].path, '$')
    assert.equal(worker.record, null)
    assert.equal(worker.faultHit, 0)
    assert.equal(worker.counts.source, 1)
    assert.equal(worker.counts.gate, 1)
    assert.equal(worker.counts.dispatch, 1)
    assert.equal(worker.counts.create, 0)
    assert.equal(worker.counts.transition, 0)
    assert.equal(worker.counts.rvcCalls, 1)
    assert.equal(worker.counts.rvcOk, 1)

    const unsynced = clone(collInput)
    unsynced.sourceInput.voiceBinding.negotiation.request.sourceAudioRef = base.record.source.ref
    const unsyncedNative = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: collRecord, input: unsynced })
    expectBlocked(unsyncedNative.result, 'TASK_FIXTURE_SOURCE_BLOCKED')
    const unsyncedWorker = runWorker('existing', null, { scopeId: SCOPE, record: collRecord, input: unsynced })
    assert.deepEqual(unsyncedWorker.result, JSON.parse(JSON.stringify(unsyncedNative.result)))
    assert.deepEqual(unsyncedWorker.record, JSON.parse(JSON.stringify(unsyncedNative.record)))
    assert.equal(unsyncedWorker.counts.source, 1)
    assert.equal(unsyncedWorker.counts.gate, 1)
    assert.equal(unsyncedWorker.counts.dispatch, 0)
    assert.equal(unsyncedWorker.counts.create, 0)
    assert.equal(unsyncedWorker.counts.transition, 0)
    assert.equal(unsyncedWorker.counts.rvcCalls, 0)
  } finally {
    removeConfigSandbox(base.sandbox)
    if (coll !== null) removeConfigSandbox(coll.sandbox)
  }
})

test('F03 remaining: cross-scope artifact, deep input and deep owner partitions', async () => {
  const example = extractExample('## 7. RVC完整示例')
  const ctx = await makeExisting(example, 'key:fixture-f03')
  try {
    const crossScope = clone(ctx.input)
    crossScope.sourceInput.artifactLibrary.artifacts[0].scopeId = 'scope:fixture-other'
    const crossOut = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: crossScope })
    assert.equal(crossOut.result.ok, true)
    assert.equal(crossOut.result.value.phase, 'BLOCKED')

    let deep = {}
    for (let i = 0; i < 13; i += 1) deep = { nested: deep }
    const deepInput = clone(ctx.input)
    deepInput.extra = deep
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: deepInput }).result, 'RESOURCE_LIMIT', '$')

    const deepRecord = clone(ctx.record)
    deepRecord.extra = deep
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: deepRecord, input: ctx.input }).result, 'RESOURCE_LIMIT', '$')

    const voiceScope = clone(ctx.input)
    voiceScope.sourceInput.voiceBinding.library.profiles[0].scopeId = 'scope:fixture-other'
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: voiceScope }).result, 'SOURCE_INPUT_INVALID', 'sourceInput')

    const blockedContext = clone(ctx.input)
    blockedContext.context = { requestId: 'request:fixture-1' }
    expectError(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: blockedContext }).result, 'INVALID_CONTEXT', 'context')

    const gpu = clone(ctx.input)
    gpu.readiness.instances[0].resources.profile = 'GPU_FIXTURE'
    gpu.readiness.instances[0].resources.gpu = 'UNAVAILABLE'
    expectBlocked(runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: gpu }).result, 'TASK_FIXTURE_READINESS_BLOCKED')

    const linked = clone(ctx.input)
    linked.sourceInput.voiceBinding.taskDraft.feature = 'voice-bubbles'
    linked.sourceInput.voiceBinding.taskDraft.taskType = 'TTS'
    linked.sourceInput.voiceBinding.taskDraft.source.kind = 'TEXT_REF'
    linked.sourceInput.voiceBinding.taskDraft.source.ref = 'artifact:fixture-text-1'
    const linkedOut = runExistingFixtureTaskOnce({ scopeId: SCOPE, record: ctx.record, input: linked })
    assert.equal(linkedOut.result.ok, false)
    assert.equal(linkedOut.record, null)

    const okFrame = { scopeId: SCOPE, record: ctx.record, input: ctx.input }
    const okOut = runExistingFixtureTaskOnce(okFrame)
    assert.equal(okOut.result.ok, true)
    assert.notEqual(okOut.result.value.sourceCheck, ctx.input.sourceInput)
    assert.notEqual(okOut.result.value.readiness, ctx.input.readiness)
    assert.notEqual(okOut.result.value.task, ctx.record)
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
  for (const marker of [
    '内部',
    'scopeId',
    'observedAt',
    '不持久',
    '不宣称',
    'OFFLINE',
    'NOT_INTEGRATED',
    'depth12',
    'DEPENDENCY_FAILURE',
    'REMOTE',
  ]) {
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
