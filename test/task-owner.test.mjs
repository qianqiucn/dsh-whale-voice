import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { openFixtureTaskOwner, TASK_OWNER_ERRORS, TASK_OWNER_SCHEMA_VERSION } from '../core/audio/task-owner.mjs'

const OWNER_FILE = 'audio-task-owner-v1.json'
const CATALOG_FILE = 'audio-task-catalog-v1.json'
const NOW = '2026-10-27T00:00:00.000Z'
const BASE = new URL('../core/audio/', import.meta.url).href

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function example(heading) {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function ownerBytes(sandbox) {
  try {
    return fs.readFileSync(path.join(sandbox.root, OWNER_FILE))
  } catch {
    return null
  }
}

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try {
    return await fn(sandbox)
  } finally {
    removeConfigSandbox(sandbox)
  }
}

async function birth(sandbox, ex, key, mutateDraft) {
  const opened = await openFixtureTaskCatalog({ sandbox })
  assert.equal(opened.ok, true)
  const binding = ex.sourceInput.voiceBinding
  const draft = clone(binding.taskDraft)
  delete draft.taskId
  if (mutateDraft) mutateDraft(draft)
  const reserved = await opened.value.reserve({
    schemaVersion: 1,
    scopeId: binding.expectation.scopeId,
    idempotencyKey: key,
    draft,
    observedAt: NOW,
  })
  assert.equal(reserved.ok, true, reserved.ok ? '' : reserved.errors[0].code)
  const snapshot = JSON.parse(fs.readFileSync(path.join(sandbox.root, CATALOG_FILE), 'utf8'))
  const entry = snapshot.entries[snapshot.entries.length - 1]
  const input = clone(ex)
  input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
  input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
  return { scopeId: binding.expectation.scopeId, taskId: entry.record.taskId, input, record: entry.record, handle: opened.value }
}

function runFrame(b) {
  return { schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: b.input }
}

function expectOwnerError(result, key, errorPath) {
  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, TASK_OWNER_ERRORS[key])
  assert.equal(result.errors[0].path, errorPath)
}

/* ---------------------------------------------------------------- worker */

const OWNER_WORKER = (base) => `
import vm from 'node:vm'
import fsReal from 'node:fs'
import pathReal from 'node:path'
import cryptoReal from 'node:crypto'
import { pathToFileURL } from 'node:url'

const base = ${JSON.stringify(base)}
const scenario = JSON.parse(process.env.OWNER_SCENARIO)
const counts = { engine: 0, fsFaults: 0 }
let hits = 0
const fdPaths = new Map()
const fsProxy = new Proxy({}, {
  get(_target, prop) {
    const original = fsReal[prop]
    if (typeof original !== 'function') return original
    return (...args) => {
      const fdTarget = typeof args[0] === 'number' ? (fdPaths.get(args[0]) || '') : ''
      const file = typeof args[0] === 'string' ? args[0] : fdTarget
      const fault = scenario.fsFault
      if (fault && prop === fault.call && file.includes(fault.match)) {
        hits += 1
        if (counts.fsFaults === 0 && hits === (fault.skip || 0) + 1) {
          counts.fsFaults += 1
          const error = new Error('injected fs fault')
          error.code = 'EIO'
          throw error
        }
      }
      const result = original.apply(fsReal, args)
      if (prop === 'openSync' && typeof result === 'number') fdPaths.set(result, String(args[0]))
      if (prop === 'closeSync') fdPaths.delete(args[0])
      return result
    }
  },
})
const real = {
  boundary: await import(new URL('fixture-input-boundary.mjs', base).href),
  contract: await import(new URL('task-contract.mjs', base).href),
  dispatch: await import(new URL('provider-dispatch.mjs', base).href),
  gateway: await import(new URL('../svc/rvc-fake-gateway.mjs', base).href),
  engine: await import(new URL('task-fixture-engine-internal.mjs', base).href),
  sandbox: await import(new URL('../config-sandbox.mjs', base).href),
  catalog: await import(new URL('task-catalog.mjs', base).href),
}
const synth = (url, ns) => new vm.SyntheticModule(Object.keys(ns), function () {
  for (const key of Object.keys(ns)) this.setExport(key, ns[key])
}, { identifier: url })
const engineUrl = new URL('task-fixture-engine-internal.mjs', base).href
const storeUrl = new URL('fixture-task-store-internal.mjs', base).href
const ownerUrl = new URL('task-owner.mjs', base).href
const wrappedEngine = (frame) => {
  counts.engine += 1
  const out = real.engine.runExistingFixtureTaskOnce(frame)
  const fault = scenario.engineFault
  if (fault && counts.engine === 1) {
    if (fault === 'throw') throw new Error('injected engine throw')
    if (fault === 'null') return { record: null, result: out.result }
    if (fault === 'identity') {
      const copy = JSON.parse(JSON.stringify(out))
      copy.record.taskId = 'task:fixture-' + 'f'.repeat(32)
      return copy
    }
    if (fault === 'phase') {
      const copy = JSON.parse(JSON.stringify(out))
      copy.result.value.phase = 'WEIRD'
      return copy
    }
  }
  return out
}
const engineModule = new vm.SyntheticModule(['TASK_FIXTURE_ERRORS', 'runExistingFixtureTaskOnce'], function () {
  this.setExport('TASK_FIXTURE_ERRORS', real.engine.TASK_FIXTURE_ERRORS)
  this.setExport('runExistingFixtureTaskOnce', wrappedEngine)
}, { identifier: engineUrl })
const storeSource = fsReal.readFileSync(new URL(storeUrl), 'utf8')
const storeModule = new vm.SourceTextModule(storeSource, { identifier: storeUrl })
const linkStore = async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (specifier === 'node:fs') return synth('node:fs', { default: fsProxy })
  if (specifier === 'node:path') return synth('node:path', { default: pathReal })
  if (specifier === 'node:crypto') return synth('node:crypto', { default: cryptoReal })
  return synth(url, await import(url))
}
await storeModule.link(linkStore)
await storeModule.evaluate()
const ownerSource = fsReal.readFileSync(new URL(ownerUrl), 'utf8')
const ownerModule = new vm.SourceTextModule(ownerSource, { identifier: ownerUrl })
await ownerModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === storeUrl) return storeModule
  if (url === engineUrl) return engineModule
  return synth(url, await import(url))
})
await ownerModule.evaluate()

const sandbox = real.sandbox.createConfigSandbox()
try {
  const ex = (heading) => {
    const doc = fsReal.readFileSync(new URL('../../docs/TASK_FIXTURE_RUNNER_OFFLINE.md', base), 'utf8')
    const at = doc.indexOf(heading)
    const fenceMark = String.fromCharCode(96, 96, 96)
    const fence = doc.indexOf(fenceMark + 'json', at)
    const close = doc.indexOf(fenceMark, fence + 7)
    return JSON.parse(doc.slice(fence + 7, close).trim())
  }
  const source = ex(scenario.example || '## 7.')
  const catalog = await real.catalog.openFixtureTaskCatalog({ sandbox })
  const binding = source.sourceInput.voiceBinding
  const draft = { ...binding.taskDraft }
  delete draft.taskId
  const reserved = await catalog.value.reserve({
    schemaVersion: 1,
    scopeId: binding.expectation.scopeId,
    idempotencyKey: scenario.key || 'key:fixture-worker',
    draft,
    observedAt: '2026-10-27T00:00:00.000Z',
  })
  const snapshot = JSON.parse(fsReal.readFileSync(sandbox.root + '/audio-task-catalog-v1.json', 'utf8'))
  const entry = snapshot.entries[snapshot.entries.length - 1]
  const input = JSON.parse(JSON.stringify(source))
  input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
  input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
  const frame = { schemaVersion: 1, scopeId: binding.expectation.scopeId, taskId: entry.record.taskId, input }
  const catalogHash = fsReal.readFileSync(sandbox.root + '/audio-task-catalog-v1.json', 'utf8')
  const owner = await ownerModule.namespace.openFixtureTaskOwner({ sandbox })
  const results = []
  if (scenario.mode === 'double') {
    results.push(...(await Promise.all([owner.value.run(frame), owner.value.run(frame)])))
  } else if (scenario.mode === 'reopen') {
    results.push(await owner.value.run(frame))
    const again = await ownerModule.namespace.openFixtureTaskOwner({ sandbox })
    results.push(await again.value.run(frame))
  } else {
    results.push(await owner.value.run(frame))
    if (scenario.mode === 'get') {
      results.push(await owner.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
    }
  }
  if (scenario.followUp) {
    const again = await ownerModule.namespace.openFixtureTaskOwner({ sandbox })
    if (!again.ok) {
      results.push(again)
    } else {
      results.push(await again.value.run(frame))
      results.push(await again.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
    }
  }
  let ownerRaw = null
  try {
    ownerRaw = JSON.parse(fsReal.readFileSync(sandbox.root + '/audio-task-owner-v1.json', 'utf8'))
  } catch {
    ownerRaw = null
  }
  const catalogAfter = fsReal.readFileSync(sandbox.root + '/audio-task-catalog-v1.json', 'utf8')
  console.log(JSON.stringify({
    counts,
    results,
    ownerRaw,
    catalogUnchanged: catalogAfter === catalogHash,
    taskId: entry.record.taskId,
    catalogEntries: JSON.parse(catalogAfter).entries.length,
  }))
} finally {
  real.sandbox.removeConfigSandbox(sandbox)
}
`

function runOwnerWorker(scenario) {
  const script = OWNER_WORKER(BASE)
  try {
    const output = execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], {
      env: { ...process.env, OWNER_SCENARIO: JSON.stringify(scenario) },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    return JSON.parse(output.trim())
  } catch (error) {
    throw new Error('owner worker failed: ' + String(error.stderr || error.message).slice(0, 2000))
  }
}

/* ------------------------------------------------------------------ C01 */

test('C01 one accepted attempt: real birth, one engine run, FINAL persisted, catalog untouched', async () => {
  const worker = runOwnerWorker({ key: 'key:fixture-c01' })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.catalogEntries, 1)
  assert.equal(worker.catalogUnchanged, true)
  const run = worker.results[0]
  assert.equal(run.ok, true, JSON.stringify(run))
  assert.equal(run.value.outcome, 'RECORDED')
  assert.equal(run.value.ownerState, 'SIMULATED')
  assert.equal(run.value.reason, null)
  assert.equal(run.value.revision, 2)
  assert.equal(run.value.task.taskId, worker.taskId)
  assert.equal(run.value.task.state, 'ARTIFACT_READY')
  assert.deepEqual(Object.keys(run.value), [
    'schemaVersion', 'outcome', 'revision', 'ownerState', 'reason', 'task',
    'userMessageZh', 'mockOnly', 'realOperationAllowed', 'submitAllowed', 'automaticRetryAllowed',
  ])
  assert.equal(worker.ownerRaw.revision, 2)
  assert.equal(worker.ownerRaw.entries.length, 1)
  assert.equal(worker.ownerRaw.entries[0].phase, 'FINAL')
  assert.equal(worker.ownerRaw.entries[0].completion.kind, 'SIMULATED')
  assert.equal(Object.keys(worker.ownerRaw.entries[0].record).length, 16)
  assert.equal(worker.ownerRaw.entries[0].record.observedAt, NOW)
  assert.equal(JSON.stringify(worker.ownerRaw).includes('sourceInput'), false)
})

/* ------------------------------------------------------------------ C02 */

test('C02 same task: concurrent, repeated, reopened and wrong-scope calls never run the engine twice', async () => {
  const double = runOwnerWorker({ key: 'key:fixture-c02-double', mode: 'double' })
  assert.equal(double.counts.engine, 1)
  const states = double.results.map((r) => r.value.ownerState).sort()
  assert.deepEqual(states, ['SIMULATED', 'SIMULATED'])
  const outcomes = double.results.map((r) => r.value.outcome).sort()
  assert.deepEqual(outcomes, ['EXISTING', 'RECORDED'])
  assert.equal(double.ownerRaw.revision, 2)

  const reopen = runOwnerWorker({ key: 'key:fixture-c02-reopen', mode: 'reopen' })
  assert.equal(reopen.counts.engine, 1)
  assert.equal(reopen.results[0].value.outcome, 'RECORDED')
  assert.equal(reopen.results[1].value.outcome, 'EXISTING')
  assert.equal(reopen.results[1].value.revision, 2)

  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-c02-native')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)
    const missing = await owner.value.run({
      schemaVersion: 1,
      scopeId: b.scopeId,
      taskId: 'task:fixture-' + 'a'.repeat(32),
      input: b.input,
    })
    expectOwnerError(missing, 'NOT_FOUND', '$')
    const wrongScope = await owner.value.get({ schemaVersion: 1, scopeId: 'scope:fixture-other', taskId: b.taskId })
    expectOwnerError(wrongScope, 'NOT_FOUND', '$')
    assert.equal(ownerBytes(sandbox), null)
    const first = await owner.value.run(runFrame(b))
    assert.equal(first.value.outcome, 'RECORDED')
    const second = await owner.value.run(runFrame(b))
    assert.equal(second.value.outcome, 'EXISTING')
    const after = ownerBytes(sandbox)
    assert.equal(JSON.parse(after).revision, 2)
  })
})

/* ------------------------------------------------------------------ C03 */

test('C03 the seven RVC scenarios persist their real task state and survive reopening', async () => {
  const expected = {
    SUCCESS: ['ARTIFACT_READY', 'SIMULATED'],
    OFFLINE: ['FAILED', 'SIMULATED'],
    MODEL_MISSING: ['FAILED', 'SIMULATED'],
    TIMEOUT: ['UNKNOWN', 'SIMULATED'],
    CANCEL_REQUESTED: ['CANCEL_REQUESTED', 'SIMULATED'],
    CANCEL_CONFIRMED: ['CANCELLED', 'SIMULATED'],
    UNKNOWN: ['UNKNOWN', 'SIMULATED'],
  }
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    for (const [scenarioName, [state, ownerState]] of Object.entries(expected)) {
      const b = await birth(sandbox, svc, 'key:fixture-c03-' + scenarioName.toLowerCase())
      const input = clone(b.input)
      input.context.scenario = scenarioName
      const owner = await openFixtureTaskOwner({ sandbox })
      const first = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input })
      assert.equal(first.ok, true, scenarioName)
      assert.equal(first.value.task.state, state, scenarioName)
      assert.equal(first.value.ownerState, ownerState, scenarioName)
      const again = await openFixtureTaskOwner({ sandbox })
      const read = await again.value.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId })
      assert.equal(read.value.task.state, state, scenarioName)
      assert.equal(read.value.reason, null, scenarioName)
      const repeat = await again.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: clone(input) })
      assert.equal(repeat.value.outcome, 'EXISTING', scenarioName)
      assert.equal(repeat.value.task.state, state, scenarioName)
    }
  })
})

/* ------------------------------------------------------------------ C04 */

test('C04 legal blocks save NO_EXECUTION with the fixed reason and never re-run', async () => {
  const svc = example('## 7.')
  const tts = example('## 8.')
  await withSandbox(async (sandbox) => {
    const cases = []
    const ttsBirth = await birth(sandbox, tts, 'key:fixture-c04-tts')
    cases.push([ttsBirth, clone(ttsBirth.input), 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH'])
    const brBirth = await birth(sandbox, svc, 'key:fixture-c04-br', (draft) => {
      draft.rights.state = 'UNVERIFIED'
    })
    const brInput = clone(brBirth.input)
    brInput.sourceInput.voiceBinding.taskDraft.rights.state = 'UNVERIFIED'
    cases.push([brBirth, brInput, 'TASK_FIXTURE_SOURCE_BLOCKED'])
    const missingBirth = await birth(sandbox, svc, 'key:fixture-c04-missing')
    const missingInput = clone(missingBirth.input)
    missingInput.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
    cases.push([missingBirth, missingInput, 'TASK_FIXTURE_SOURCE_BLOCKED'])
    const readinessBirth = await birth(sandbox, svc, 'key:fixture-c04-readiness')
    const readinessInput = clone(readinessBirth.input)
    readinessInput.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    cases.push([readinessBirth, readinessInput, 'TASK_FIXTURE_READINESS_BLOCKED'])

    for (const [b, input, reason] of cases) {
      const owner = await openFixtureTaskOwner({ sandbox })
      const first = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input })
      assert.equal(first.ok, true)
      assert.equal(first.value.ownerState, 'NO_EXECUTION', reason)
      assert.equal(first.value.reason, reason)
      assert.equal(first.value.task.state, b.record.state)
      const repeat = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: clone(input) })
      assert.equal(repeat.value.outcome, 'EXISTING')
      assert.equal(repeat.value.reason, reason)
    }
  })
})

/* ------------------------------------------------------------------ C05 */

test('C05 a confirmed-uncommitted claim write is a plain WRITE_REJECTED and a later explicit run may retry', async () => {
  const faulted = runOwnerWorker({
    key: 'key:fixture-c05',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 0 },
  })
  assert.equal(faulted.counts.engine, 0)
  assert.equal(faulted.ownerRaw, null)
  expectOwnerError(faulted.results[0], 'WRITE_REJECTED', '$')
  assert.equal(faulted.catalogEntries, 1)

  const retry = runOwnerWorker({ key: 'key:fixture-c05', followUp: false })
  assert.equal(retry.results[0].value.outcome, 'RECORDED')
  assert.equal(retry.counts.engine, 1)
})

/* ------------------------------------------------------------------ C06 */

test('C06 after a confirmed claim, engine or final-write uncertainty keeps the tombstone and reports UNKNOWN', async () => {
  for (const engineFault of ['throw', 'null', 'identity', 'phase']) {
    const worker = runOwnerWorker({ key: 'key:fixture-c06-' + engineFault, engineFault, followUp: true })
    assert.equal(worker.counts.engine, 1, engineFault)
    const first = worker.results[0]
    assert.equal(first.ok, true, engineFault)
    assert.equal(first.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(first.value.reason, TASK_OWNER_ERRORS.EXECUTION_UNKNOWN, engineFault)
    assert.equal(first.value.revision, 1, engineFault)
    assert.match(first.value.userMessageZh, /无法确认/, engineFault)
    assert.equal(worker.ownerRaw.entries[0].phase, 'CLAIMED', engineFault)
    assert.equal(worker.ownerRaw.revision, 1, engineFault)
    assert.equal(worker.results[1].value.outcome, 'EXISTING', engineFault)
    assert.equal(worker.results[1].value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(worker.results[2].value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(worker.counts.engine, 1, engineFault)
  }

  const finalReject = runOwnerWorker({
    key: 'key:fixture-c06-final-reject',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 1 },
    followUp: true,
  })
  assert.equal(finalReject.counts.engine, 1)
  assert.equal(finalReject.results[0].ownerState, undefined)
  assert.equal(finalReject.results[0].ok, true)
  assert.equal(finalReject.results[0].value.ownerState, 'UNKNOWN')
  assert.equal(finalReject.results[0].value.revision, 1)
  assert.equal(finalReject.ownerRaw.entries[0].phase, 'CLAIMED')
  assert.equal(finalReject.results[1].value.ownerState, 'UNKNOWN')
  assert.equal(finalReject.counts.engine, 1)

  const finalUnknown = runOwnerWorker({
    key: 'key:fixture-c06-final-unknown',
    fsFault: { call: 'renameSync', match: 'audio-task-owner-v1.', skip: 1 },
    followUp: true,
  })
  expectOwnerError(finalUnknown.results[0], 'WRITE_UNKNOWN', '$')
  assert.equal(finalUnknown.ownerRaw.entries[0].phase, 'CLAIMED')
  assert.equal(finalUnknown.results[1].ok, false)
  assert.equal(finalUnknown.results[1].errors[0].code, TASK_OWNER_ERRORS.OWNER_UNKNOWN)
  assert.equal(finalUnknown.counts.engine, 1)
})

/* ------------------------------------------------------------------ C07 */

test('C07 a corrupted or externally changed owner store is rejected without repair or reuse', async () => {
  const svc = example('## 7.')
  const variants = [
    ['empty', ''],
    ['bad-json', '{not json'],
    ['bad-version', JSON.stringify({ schemaVersion: 2, revision: 0, entries: [] })],
    ['bad-revision', JSON.stringify({ schemaVersion: 1, revision: 3, entries: [] })],
    ['bad-root-key', JSON.stringify({ schemaVersion: 1, revision: 0, entries: [], extra: 1 })],
  ]
  for (const [name, content] of variants) {
    await withSandbox(async (sandbox) => {
      const b = await birth(sandbox, svc, 'key:fixture-c07-' + name)
      fs.writeFileSync(path.join(sandbox.root, OWNER_FILE), content, 'utf8')
      const before = fs.readFileSync(path.join(sandbox.root, OWNER_FILE))
      const owner = await openFixtureTaskOwner({ sandbox })
      if (owner.ok) {
        const run = await owner.value.run(runFrame(b))
        assert.equal(run.ok, false, name)
        assert.equal(run.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID, name)
      } else {
        assert.equal(owner.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID, name)
      }
      assert.equal(fs.readFileSync(path.join(sandbox.root, OWNER_FILE)).equals(before), true, name)
    })
  }

  // External replacement after a confirmed digest is STORE_INVALID (corrupt) without repair.
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-c07-change')
    const owner = await openFixtureTaskOwner({ sandbox })
    const first = await owner.value.run(runFrame(b))
    assert.equal(first.value.outcome, 'RECORDED')
    fs.writeFileSync(path.join(sandbox.root, OWNER_FILE), '{bad', 'utf8')
    const after = ownerBytes(sandbox)
    const reopened = await openFixtureTaskOwner({ sandbox })
    assert.equal(reopened.ok, false)
    assert.equal(reopened.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID)
    assert.equal(ownerBytes(sandbox).equals(after), true)
  })
})

/* ------------------------------------------------------------------ C08 */

test('C08 public surface, descriptors and input boundaries stay safe and frozen', async () => {
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-c08')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)
    assert.deepEqual(Object.keys(owner.value).sort(), ['get', 'run'])
    assert.equal(Object.isFrozen(owner.value), true)

    expectOwnerError(await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }), 'INVALID_INPUT', '$')
    expectOwnerError(
      await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: b.input, record: b.record }),
      'INVALID_INPUT',
      '<unknown-key>',
    )
    expectOwnerError(await owner.value.get({ schemaVersion: 2, scopeId: b.scopeId, taskId: b.taskId }), 'UNSUPPORTED_VERSION', 'schemaVersion')
    expectOwnerError(await owner.value.get({ schemaVersion: 1, scopeId: 'bad-scope', taskId: b.taskId }), 'INVALID_INPUT', 'scopeId')

    const getterFrame = { schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }
    Object.defineProperty(getterFrame, 'input', { get() { throw new Error('getter') }, enumerable: true })
    let getterCalls = 0
    Object.defineProperty(getterFrame, 'taskId', {
      enumerable: true,
      get() {
        getterCalls += 1
        return b.taskId
      },
    })
    const beforeJson = JSON.stringify(b.input)
    expectOwnerError(await owner.value.run(getterFrame), 'INVALID_INPUT', '$')
    assert.equal(getterCalls, 0)

    expectOwnerError(
      await openFixtureTaskOwner({ sandbox, extra: 1 }),
      'INVALID_INPUT',
      '<unknown-key>',
    )
    expectOwnerError(await openFixtureTaskOwner({ sandbox: 'not-a-cap' }), 'SANDBOX_INVALID', '$')

    const run = await owner.value.run(runFrame(b))
    assert.equal(run.ok, true)
    assert.equal(JSON.stringify(b.input), beforeJson)
    assert.equal(Object.isFrozen(run), true)
    const deepFrozen = new Set()
    const walk = (value) => {
      if (value === null || typeof value !== 'object' || deepFrozen.has(value)) return
      deepFrozen.add(value)
      assert.equal(Object.isFrozen(value), true)
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        walk(descriptor.value)
      }
    }
    walk(run)
    const text = JSON.stringify(run)
    for (const marker of ['observedAt', 'sourceInput', 'artifactLibrary', 'voiceBinding', 'birthIdentityHash', 'audio-task-owner-v1']) {
      assert.equal(text.includes(marker), false, marker)
    }
    assert.equal(text.includes(sandbox.root), false)

    assert.equal(TASK_OWNER_SCHEMA_VERSION, 1)
    assert.equal(Object.keys(TASK_OWNER_ERRORS).length, 14)
    for (const [key, code] of Object.entries(TASK_OWNER_ERRORS)) {
      assert.equal(code, 'TASK_OWNER_' + key)
    }
  })
})

/* ------------------------------------------------------------------ C10 */

function docExample(heading) {
  const doc = fs.readFileSync('docs/TASK_OWNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, heading)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

test('C10 both documented owner examples run as written against a real temporary sandbox', async () => {
  const reserveExample = docExample('## 7. 前置reserve示例')
  const successExample = docExample('## 8. 成功执行示例')
  const blockedExample = docExample('## 9. 权利阻断示例')
  const getExample = docExample('## 10. 读取示例')

  await withSandbox(async (sandbox) => {
    const catalog = await openFixtureTaskCatalog({ sandbox })
    const reserved = await catalog.value.reserve(reserveExample)
    assert.equal(reserved.ok, true)
    const taskId = reserved.value.task.taskId
    const owner = await openFixtureTaskOwner({ sandbox })

    const successRun = clone(successExample)
    successRun.taskId = taskId
    successRun.input.sourceInput.voiceBinding.taskDraft.taskId = taskId
    const success = await owner.value.run(successRun)
    assert.equal(success.ok, true)
    assert.equal(success.value.outcome, 'RECORDED')
    assert.equal(success.value.ownerState, 'SIMULATED')
    assert.equal(success.value.task.state, 'ARTIFACT_READY')

    const blockedDraft = clone(blockedExample.input.sourceInput.voiceBinding.taskDraft)
    delete blockedDraft.taskId
    const blockedBirth = await catalog.value.reserve({
      schemaVersion: 1,
      scopeId: reserveExample.scopeId,
      idempotencyKey: 'key:fixture-doc-br',
      draft: blockedDraft,
      observedAt: reserveExample.observedAt,
    })
    assert.equal(blockedBirth.ok, true, blockedBirth.ok ? '' : blockedBirth.errors[0].code)
    const blockedRun = clone(blockedExample)
    blockedRun.taskId = blockedBirth.value.task.taskId
    blockedRun.input.sourceInput.voiceBinding.taskDraft.taskId = blockedBirth.value.task.taskId
    const blocked = await owner.value.run(blockedRun)
    assert.equal(blocked.ok, true)
    assert.equal(blocked.value.ownerState, 'NO_EXECUTION')
    assert.equal(blocked.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')

    const get = await owner.value.get({ ...clone(getExample), taskId })
    assert.equal(get.ok, true)
    assert.equal(get.value.outcome, 'FOUND')
    assert.equal(get.value.task.state, 'ARTIFACT_READY')
  })
})
