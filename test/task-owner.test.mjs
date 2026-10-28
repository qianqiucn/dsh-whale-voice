import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { copyFixtureInput } from '../core/audio/fixture-input-boundary.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { openFixtureTaskOwner, TASK_OWNER_ERRORS, TASK_OWNER_SCHEMA_VERSION } from '../core/audio/task-owner.mjs'
import * as storeModule from '../core/audio/fixture-task-store-internal.mjs'

const OWNER_FILE = 'audio-task-owner-v1.json'
const CATALOG_FILE = 'audio-task-catalog-v1.json'
const MARKER_FILE = '.whale-voice-sandbox.json'
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

function docExample(heading) {
  const doc = fs.readFileSync('docs/TASK_OWNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, heading)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function filePath(sandbox, name) {
  return path.join(sandbox.root, name)
}

function readJson(sandbox, name) {
  return JSON.parse(fs.readFileSync(filePath(sandbox, name), 'utf8'))
}

function ownerBytes(sandbox) {
  try {
    return fs.readFileSync(filePath(sandbox, OWNER_FILE))
  } catch {
    return null
  }
}

function catalogBytes(sandbox) {
  return fs.readFileSync(filePath(sandbox, CATALOG_FILE))
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
  const snapshot = readJson(sandbox, CATALOG_FILE)
  const entry = snapshot.entries[snapshot.entries.length - 1]
  const input = clone(ex)
  input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
  input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
  return { scopeId: binding.expectation.scopeId, taskId: entry.record.taskId, input, record: entry.record, handle: opened.value }
}

function runFrame(b) {
  return { schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: b.input }
}

function getFrame(b) {
  return { schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }
}

function expectOwnerError(result, key, errorPath) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal(result.errors[0].code, TASK_OWNER_ERRORS[key])
  if (errorPath !== undefined) assert.equal(result.errors[0].path, errorPath)
}

/* ---------------------------------------------------------------- worker */

/* One VM module graph shares one store instance for the catalog facade and the owner: the same
 * WeakMap state, the same serial queue, the same per-file digests and the same unknown lock. The
 * fs proxy injects faults at the real call site (never before the call) and supports phase
 * predicates, so "after the real claim rename" / "after the real FINAL rename" are real phases. */
const OWNER_WORKER = (base) => `
import vm from 'node:vm'
import fsReal from 'node:fs'
import pathReal from 'node:path'
import cryptoReal from 'node:crypto'

const base = ${JSON.stringify(base)}
const scenario = JSON.parse(process.env.OWNER_SCENARIO)
const counts = { engine: 0, fsFaults: 0 }
let hits = 0
let faultAt = null
let root = ''
const fdPaths = new Map()

function readText(file) {
  try { return fsReal.readFileSync(file, 'utf8') } catch { return null }
}

function ownerPhase() {
  const text = readText(root + '/audio-task-owner-v1.json')
  if (text === null) return 'MISSING'
  if (text.length === 0) return 'EMPTY'
  if (text.includes('"phase":"FINAL"')) return 'FINAL'
  if (text.includes('"phase":"CLAIMED"')) return 'CLAIMED'
  return 'OTHER'
}

function legalBirthAdd() {
  const file = root + '/audio-task-catalog-v1.json'
  const snapshot = JSON.parse(fsReal.readFileSync(file, 'utf8'))
  const copy = JSON.parse(JSON.stringify(snapshot.entries[0]))
  const n = snapshot.entries.length
  copy.record.taskId = 'task:fixture-' + (n + 1).toString(16).padStart(32, '0')
  copy.idempotencyKey = 'key:fixture-extra-' + n
  snapshot.entries.push(copy)
  snapshot.revision = snapshot.entries.length
  fsReal.writeFileSync(file, JSON.stringify(snapshot))
}

function whenMatches(when) {
  if (!when || when === 'always') return true
  if (when === 'engine0') return counts.engine === 0
  if (when === 'engineDone') return counts.engine >= 1
  if (when === 'claimOnDisk') return counts.engine === 0 && ownerPhase() === 'CLAIMED'
  if (when === 'diskClaimed') return ownerPhase() === 'CLAIMED'
  if (when === 'diskFinal') return ownerPhase() === 'FINAL'
  return false
}

const fsProxy = new Proxy({}, {
  get(_target, prop) {
    const original = fsReal[prop]
    if (typeof original !== 'function') return original
    return function (...args) {
      const fdTarget = typeof args[0] === 'number' ? (fdPaths.get(args[0]) || '') : ''
      const file = typeof args[0] === 'string' ? args[0] : fdTarget
      const fault = scenario.fsFault
      if (fault && prop === fault.call && file.includes(fault.match) && whenMatches(fault.when)) {
        hits += 1
        if (counts.fsFaults === 0 && hits === (fault.skip || 0) + 1) {
          counts.fsFaults += 1
          faultAt = { call: prop, engine: counts.engine, ownerPhase: ownerPhase(), args0: String(args[0]).slice(-24) }
          if (fault.action === 'corrupt-birth') {
            fsReal.writeFileSync(root + '/audio-task-catalog-v1.json', '{bad')
            return original.apply(fsReal, args)
          }
          if (fault.action === 'legal-birth-add') {
            legalBirthAdd()
            return original.apply(fsReal, args)
          }
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
  engine: await import(new URL('task-fixture-engine-internal.mjs', base).href),
  sandbox: await import(new URL('../config-sandbox.mjs', base).href),
}

const synth = (url, ns) => new vm.SyntheticModule(Object.keys(ns), function () {
  for (const key of Object.keys(ns)) this.setExport(key, ns[key])
}, { identifier: url })

const engineUrl = new URL('task-fixture-engine-internal.mjs', base).href
const storeUrl = new URL('fixture-task-store-internal.mjs', base).href
const catalogUrl = new URL('task-catalog.mjs', base).href
const ownerUrl = new URL('task-owner.mjs', base).href

const wrappedEngine = (frame) => {
  counts.engine += 1
  const out = real.engine.runExistingFixtureTaskOnce(frame)
  const fault = scenario.engineFault
  if (!fault || counts.engine !== 1) return out
  if (fault === 'throw') throw new Error('injected engine throw')
  if (fault === 'null') return { record: null, result: out.result }
  const copy = JSON.parse(JSON.stringify(out))
  if (fault === 'identity') copy.record.taskId = 'task:fixture-' + 'f'.repeat(32)
  else if (fault === 'phase') copy.result.value.phase = 'WEIRD'
  else if (fault === 'projection') copy.result.value.task.state = 'CANCELLED'
  else if (fault === 'flag') copy.result.value.realOperationAllowed = true
  else if (fault === 'submit-flag') copy.result.value.submitAllowed = true
  else if (fault === 'missing-field') delete copy.result.value.submitAllowed
  else if (fault === 'schema-version') copy.result.value.schemaVersion = 2
  else if (fault === 'states') copy.result.value.states = [copy.result.value.states[0]]
  else if (fault === 'accessor') Object.defineProperty(copy.result.value, 'task', {
    enumerable: true,
    configurable: true,
    get() { throw new Error('injected accessor') },
  })
  else if (fault === 'root-extra') copy.extra = 1
  else if (fault === 'result-extra') copy.result.extra = true
  return copy
}
const engineModule = new vm.SyntheticModule(
  ['TASK_FIXTURE_ERRORS', 'TASK_FIXTURE_SCHEMA_VERSION', 'runExistingFixtureTaskOnce'],
  function () {
    this.setExport('TASK_FIXTURE_ERRORS', real.engine.TASK_FIXTURE_ERRORS)
    this.setExport('TASK_FIXTURE_SCHEMA_VERSION', real.engine.TASK_FIXTURE_SCHEMA_VERSION)
    this.setExport('runExistingFixtureTaskOnce', wrappedEngine)
  },
  { identifier: engineUrl },
)

const storeSource = fsReal.readFileSync(new URL(storeUrl), 'utf8')
const storeModule = new vm.SourceTextModule(storeSource, { identifier: storeUrl })
await storeModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === engineUrl) return engineModule
  if (specifier === 'node:fs') return synth('node:fs', { default: fsProxy })
  if (specifier === 'node:path') return synth('node:path', { default: pathReal })
  if (specifier === 'node:crypto') return synth('node:crypto', { default: cryptoReal })
  return synth(url, await import(url))
})
await storeModule.evaluate()

const catalogSource = fsReal.readFileSync(new URL(catalogUrl), 'utf8')
const catalogModule = new vm.SourceTextModule(catalogSource, { identifier: catalogUrl })
await catalogModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === storeUrl) return storeModule
  return synth(url, await import(url))
})
await catalogModule.evaluate()

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
root = sandbox.root
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
  const binding = source.sourceInput.voiceBinding
  const catalog = await catalogModule.namespace.openFixtureTaskCatalog({ sandbox })

  const birthOne = async (key) => {
    const draft = JSON.parse(JSON.stringify(binding.taskDraft))
    delete draft.taskId
    const reserved = await catalog.value.reserve({
      schemaVersion: 1,
      scopeId: binding.expectation.scopeId,
      idempotencyKey: key,
      draft,
      observedAt: '2026-10-27T00:00:00.000Z',
    })
    if (!reserved.ok) throw new Error('birth failed: ' + reserved.errors[0].code)
    const snapshot = JSON.parse(fsReal.readFileSync(root + '/audio-task-catalog-v1.json', 'utf8'))
    const entry = snapshot.entries[snapshot.entries.length - 1]
    const input = JSON.parse(JSON.stringify(source))
    input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
    input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
    if (scenario.context) input.context.scenario = scenario.context
    return { scopeId: binding.expectation.scopeId, taskId: entry.record.taskId, input }
  }

  const mode = scenario.mode || 'single'
  const firstBirth = await birthOne(scenario.key || 'key:fixture-worker')
  const secondBirth = mode === 'twoTasks' ? await birthOne(scenario.key2 || 'key:fixture-worker-b') : null
  const catalogBefore = fsReal.readFileSync(root + '/audio-task-catalog-v1.json', 'utf8')

  const results = []
  const record = (label, result) => { results.push({ label, result }) }
  const frame = { schemaVersion: 1, scopeId: firstBirth.scopeId, taskId: firstBirth.taskId, input: firstBirth.input }
  const owner = () => ownerModule.namespace.openFixtureTaskOwner({ sandbox })

  if (mode === 'mixed') {
    const first = await owner()
    const second = await owner()
    const outcomes = await Promise.all([
      first.value.run(frame),
      second.value.run(frame),
      catalog.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }),
    ])
    record('owner-a', outcomes[0])
    record('owner-b', outcomes[1])
    record('catalog-get', outcomes[2])
  } else if (mode === 'double') {
    const opened = await owner()
    const outcomes = await Promise.all([opened.value.run(frame), opened.value.run(frame)])
    record('double-1', outcomes[0])
    record('double-2', outcomes[1])
  } else if (mode === 'retrySameCap') {
    const opened = await owner()
    record('first', await opened.value.run(frame))
    const again = await owner()
    if (!again.ok) record('second-open', again)
    else record('second', await again.value.run(frame))
  } else if (mode === 'twoTasks') {
    const opened = await owner()
    record('task-a', await opened.value.run(frame))
    const secondFrame = { schemaVersion: 1, scopeId: secondBirth.scopeId, taskId: secondBirth.taskId, input: secondBirth.input }
    record('task-b', await opened.value.run(secondFrame))
    record('task-a-get', await opened.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
  } else {
    const opened = await owner()
    if (!opened.ok) {
      record('open', opened)
    } else {
      record('run', await opened.value.run(frame))
      if (mode === 'get') record('get', await opened.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
      if (mode === 'reopen') {
        const again = await owner()
        record('reopen-run', again.ok ? await again.value.run(frame) : again)
      }
      if (scenario.followUp) {
        const again = await owner()
        if (!again.ok) {
          record('followup-open', again)
        } else {
          record('followup-run', await again.value.run(frame))
          record('followup-get', await again.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
        }
      }
    }
  }

  const ownerText = readText(root + '/audio-task-owner-v1.json')
  let ownerRaw = null
  if (ownerText !== null) {
    try { ownerRaw = JSON.parse(ownerText) } catch { ownerRaw = { corrupt: true } }
  }
  const catalogAfter = fsReal.readFileSync(root + '/audio-task-catalog-v1.json', 'utf8')
  let catalogEntries = -1
  try { catalogEntries = JSON.parse(catalogAfter).entries.length } catch { catalogEntries = -1 }
  console.log(JSON.stringify({
    counts,
    faultAt,
    hits,
    results,
    ownerRaw,
    ownerPhase: ownerPhase(),
    ownerPresent: ownerText !== null,
    catalogUnchanged: catalogAfter === catalogBefore,
    catalogEntries,
    taskId: firstBirth.taskId,
    files: fsReal.readdirSync(root).sort(),
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
    throw new Error('owner worker failed: ' + String(error.stderr || error.message).slice(0, 3000))
  }
}

function workerResult(worker, label) {
  const entry = worker.results.find((item) => item.label === label)
  assert.ok(entry, 'missing worker result: ' + label)
  return entry.result
}

/* ------------------------------------------------------------------ C01 */

test('C01 one accepted attempt: real birth, one engine run, FINAL persisted, catalog untouched', async () => {
  const worker = runOwnerWorker({ key: 'key:fixture-c01', mode: 'get' })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.fsFaults, 0)
  assert.equal(worker.catalogEntries, 1)
  assert.equal(worker.catalogUnchanged, true)
  const run = workerResult(worker, 'run')
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
  const read = workerResult(worker, 'get')
  assert.equal(read.value.outcome, 'FOUND')
  assert.equal(read.value.task.taskId, worker.taskId)
  assert.equal(worker.ownerPhase, 'FINAL')
  assert.equal(worker.ownerRaw.revision, 2)
  assert.equal(worker.ownerRaw.entries.length, 1)
  assert.equal(worker.ownerRaw.entries[0].phase, 'FINAL')
  assert.equal(worker.ownerRaw.entries[0].completion.kind, 'SIMULATED')
  assert.equal(Object.keys(worker.ownerRaw.entries[0].record).length, 16)
  assert.equal(worker.ownerRaw.entries[0].record.observedAt, NOW)
  assert.equal(JSON.stringify(worker.ownerRaw).includes('sourceInput'), false)
  assert.deepEqual(worker.files, [MARKER_FILE, OWNER_FILE, CATALOG_FILE].sort())
})

/* ------------------------------------------------------------------ C02 */

test('C02 same task: concurrent, repeated, reopened and wrong-scope calls never run the engine twice', async () => {
  const double = runOwnerWorker({ key: 'key:fixture-c02-double', mode: 'double' })
  assert.equal(double.counts.engine, 1)
  const states = [workerResult(double, 'double-1'), workerResult(double, 'double-2')].map((r) => r.value.ownerState).sort()
  assert.deepEqual(states, ['SIMULATED', 'SIMULATED'])
  const outcomes = [workerResult(double, 'double-1'), workerResult(double, 'double-2')].map((r) => r.value.outcome).sort()
  assert.deepEqual(outcomes, ['EXISTING', 'RECORDED'])
  assert.equal(double.ownerRaw.revision, 2)

  const reopen = runOwnerWorker({ key: 'key:fixture-c02-reopen', mode: 'reopen' })
  assert.equal(reopen.counts.engine, 1)
  assert.equal(workerResult(reopen, 'run').value.outcome, 'RECORDED')
  assert.equal(workerResult(reopen, 'reopen-run').value.outcome, 'EXISTING')
  assert.equal(workerResult(reopen, 'reopen-run').value.revision, 2)

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
      const read = await again.value.get(getFrame(b))
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

test('C05 a confirmed-uncommitted claim write is a plain WRITE_REJECTED and the same cap may retry', async () => {
  const faulted = runOwnerWorker({
    key: 'key:fixture-c05',
    mode: 'retrySameCap',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 0 },
  })
  assert.equal(faulted.counts.fsFaults, 1)
  assert.equal(faulted.faultAt.engine, 0)
  assert.equal(faulted.catalogEntries, 1)
  assert.equal(faulted.faultAt.call, 'fsyncSync')
  // No owner file existed when the claim write failed: the fault hit a real call, before any commit.
  assert.equal(faulted.faultAt.ownerPhase, 'MISSING')
  expectOwnerError(workerResult(faulted, 'first'), 'WRITE_REJECTED', '$')
  // Same capability, same sandbox, same Task: a new handle after clearing the one-shot fault runs.
  const retried = workerResult(faulted, 'second')
  assert.equal(retried.ok, true, JSON.stringify(retried))
  assert.equal(retried.value.outcome, 'RECORDED')
  assert.equal(faulted.counts.engine, 1)
  assert.equal(faulted.ownerPhase, 'FINAL')
})

/* ------------------------------------------------------------------ C06 */

test('C06 after a confirmed claim an unusable engine result is the fixed EXECUTION_UNKNOWN tombstone', async () => {
  const faults = [
    'throw', 'null', 'identity', 'phase', 'projection', 'flag', 'submit-flag',
    'missing-field', 'schema-version', 'states', 'accessor', 'root-extra', 'result-extra',
  ]
  for (const engineFault of faults) {
    const worker = runOwnerWorker({ key: 'key:fixture-c06-' + engineFault, engineFault, followUp: true })
    assert.equal(worker.counts.engine, 1, engineFault)
    const first = workerResult(worker, 'run')
    expectOwnerError(first, 'EXECUTION_UNKNOWN', '$')
    assert.equal(worker.ownerRaw.entries[0].phase, 'CLAIMED', engineFault)
    assert.equal(worker.ownerRaw.revision, 1, engineFault)
    const later = workerResult(worker, 'followup-run')
    assert.equal(later.ok, true, engineFault)
    assert.equal(later.value.outcome, 'EXISTING', engineFault)
    assert.equal(later.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(later.value.reason, TASK_OWNER_ERRORS.EXECUTION_UNKNOWN, engineFault)
    assert.equal(later.value.revision, 1, engineFault)
    assert.match(later.value.userMessageZh, /无法确认/, engineFault)
    const read = workerResult(worker, 'followup-get')
    assert.equal(read.value.outcome, 'FOUND', engineFault)
    assert.equal(read.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(worker.counts.engine, 1, engineFault)
  }

  // The final ordinary write failure before its rename keeps the claim as a tombstone.
  const finalReject = runOwnerWorker({
    key: 'key:fixture-c06-final-reject',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 1 },
    followUp: true,
  })
  assert.equal(finalReject.counts.engine, 1)
  expectOwnerError(workerResult(finalReject, 'run'), 'EXECUTION_UNKNOWN', '$')
  assert.equal(finalReject.ownerRaw.entries[0].phase, 'CLAIMED')
  assert.equal(finalReject.ownerRaw.revision, 1)
  assert.equal(workerResult(finalReject, 'followup-run').value.ownerState, 'UNKNOWN')
  assert.equal(finalReject.counts.engine, 1)
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
      fs.writeFileSync(filePath(sandbox, OWNER_FILE), content, 'utf8')
      const before = fs.readFileSync(filePath(sandbox, OWNER_FILE))
      const owner = await openFixtureTaskOwner({ sandbox })
      if (owner.ok) {
        const run = await owner.value.run(runFrame(b))
        assert.equal(run.ok, false, name)
        assert.equal(run.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID, name)
      } else {
        assert.equal(owner.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID, name)
      }
      assert.equal(fs.readFileSync(filePath(sandbox, OWNER_FILE)).equals(before), true, name)
    })
  }

  // External replacement after a confirmed digest is STORE_INVALID (corrupt) without repair.
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-c07-change')
    const owner = await openFixtureTaskOwner({ sandbox })
    const first = await owner.value.run(runFrame(b))
    assert.equal(first.value.outcome, 'RECORDED')
    fs.writeFileSync(filePath(sandbox, OWNER_FILE), '{bad', 'utf8')
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

    expectOwnerError(await openFixtureTaskOwner({ sandbox, extra: 1 }), 'INVALID_INPUT', '<unknown-key>')
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
    for (const marker of ['observedAt', 'sourceInput', 'artifactLibrary', 'voiceBinding', 'birthIdentityHash', OWNER_FILE]) {
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

/* ------------------------------------------------------------------ T01 */

test('T01 fresh birth association: claim rename, engine boundary and FINAL confirm are real gates', async () => {
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-t01-control')
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run(runFrame(b))
    assert.equal(run.value.outcome, 'RECORDED')
  })

  // (a) The real CLAIMED rename happened, then the birth file is corrupted: engine must stay 0.
  const corrupt = runOwnerWorker({
    key: 'key:fixture-t01-claim-corrupt',
    fsFault: { call: 'lstatSync', match: CATALOG_FILE, when: 'claimOnDisk', action: 'corrupt-birth' },
    followUp: true,
  })
  assert.equal(corrupt.counts.fsFaults, 1)
  assert.equal(corrupt.counts.engine, 0)
  assert.equal(corrupt.faultAt.ownerPhase, 'CLAIMED')
  expectOwnerError(workerResult(corrupt, 'run'), 'STORE_INVALID', '$')
  assert.equal(corrupt.ownerPhase, 'CLAIMED')
  assert.equal(corrupt.ownerRaw.entries[0].phase, 'CLAIMED')
  expectOwnerError(workerResult(corrupt, 'followup-open'), 'OWNER_UNKNOWN', '$')
  assert.equal(corrupt.counts.engine, 0)

  // (b) A legal external birth addition after the engine returned must not be committed over.
  const legalAdd = runOwnerWorker({
    key: 'key:fixture-t01-legal-add',
    fsFault: { call: 'lstatSync', match: CATALOG_FILE, when: 'engineDone', action: 'legal-birth-add' },
    followUp: true,
  })
  assert.equal(legalAdd.counts.engine, 1)
  assert.equal(legalAdd.counts.fsFaults, 1)
  assert.equal(legalAdd.faultAt.engine, 1)
  expectOwnerError(workerResult(legalAdd, 'run'), 'STORE_CHANGED', '$')
  assert.equal(legalAdd.ownerPhase, 'CLAIMED')
  assert.equal(legalAdd.catalogEntries, 2)
  expectOwnerError(workerResult(legalAdd, 'followup-open'), 'OWNER_UNKNOWN', '$')

  // (c) A failure after the real FINAL rename keeps the on-disk bytes and locks every handle.
  const finalUnknown = runOwnerWorker({
    key: 'key:fixture-t01-final-unknown',
    fsFault: { call: 'lstatSync', match: OWNER_FILE, when: 'diskFinal' },
    followUp: true,
  })
  assert.equal(finalUnknown.counts.engine, 1)
  assert.equal(finalUnknown.counts.fsFaults, 1)
  assert.equal(finalUnknown.faultAt.ownerPhase, 'FINAL')
  expectOwnerError(workerResult(finalUnknown, 'run'), 'WRITE_UNKNOWN', '$')
  assert.equal(finalUnknown.ownerPhase, 'FINAL')
  assert.equal(finalUnknown.ownerRaw.revision, 2)
  assert.equal(finalUnknown.ownerRaw.entries[0].phase, 'FINAL')
  expectOwnerError(workerResult(finalUnknown, 'followup-open'), 'OWNER_UNKNOWN', '$')
  assert.equal(finalUnknown.counts.engine, 1)

  // (d) The factory refuses to hand out a handle when an owner entry lost its birth association.
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const snapshot = baseSnapshot(buds)
    snapshot.entries[0].birthIdentityHash = 'a'.repeat(64)
    writeRawOwner(sandbox, snapshot)
    const opened = await openFixtureTaskOwner({ sandbox })
    expectOwnerError(opened, 'BIRTH_INVALID', '$')
  })
})

/* ------------------------------------------------------------------ T02 */

test('T02 trusted return: only the real projection plus the frozen envelope may become FINAL', async () => {
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-t02-control')
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run(runFrame(b))
    assert.equal(run.ok, true)
    assert.equal(run.value.revision, 2)
    const raw = readJson(sandbox, OWNER_FILE)
    assert.equal(raw.entries[0].phase, 'FINAL')
    assert.equal(raw.entries[0].completion.kind, 'SIMULATED')
  })

  for (const engineFault of ['projection', 'flag', 'submit-flag', 'missing-field', 'schema-version', 'states', 'accessor', 'root-extra', 'result-extra']) {
    const worker = runOwnerWorker({ key: 'key:fixture-t02-' + engineFault, engineFault, followUp: true })
    assert.equal(worker.counts.engine, 1, engineFault)
    expectOwnerError(workerResult(worker, 'run'), 'EXECUTION_UNKNOWN', '$')
    assert.equal(worker.ownerRaw.revision, 1, engineFault)
    assert.equal(worker.ownerRaw.entries[0].phase, 'CLAIMED', engineFault)
    assert.equal(worker.ownerRaw.entries[0].completion, null, engineFault)
    const later = workerResult(worker, 'followup-run')
    assert.equal(later.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(later.value.revision, 1, engineFault)
    assert.equal(worker.counts.engine, 1, engineFault)
  }
})

/* ------------------------------------------------------------------ T03 */

test('T03 one shared queue and one shared lock across owner and catalog handles on one capability', async () => {
  // (a) Two owner handles plus a catalog handle, same Task, concurrently: one engine, no deadlock.
  const mixed = runOwnerWorker({ key: 'key:fixture-t03-mixed', mode: 'mixed' })
  assert.equal(mixed.counts.engine, 1)
  assert.equal(mixed.catalogUnchanged, true)
  assert.equal(mixed.ownerRaw.revision, 2)
  const ownerA = workerResult(mixed, 'owner-a')
  const ownerB = workerResult(mixed, 'owner-b')
  assert.deepEqual([ownerA.value.outcome, ownerB.value.outcome].sort(), ['EXISTING', 'RECORDED'])
  assert.equal(workerResult(mixed, 'catalog-get').value.task.taskId, mixed.taskId)

  // (b) The real claim rename succeeded and the post-rename read-back failed: shared lock, engine 0.
  const claimUnknown = runOwnerWorker({
    key: 'key:fixture-t03-claim-unknown',
    fsFault: { call: 'lstatSync', match: OWNER_FILE, when: 'diskClaimed' },
    followUp: true,
  })
  assert.equal(claimUnknown.counts.fsFaults, 1)
  assert.equal(claimUnknown.counts.engine, 0)
  assert.equal(claimUnknown.faultAt.ownerPhase, 'CLAIMED')
  expectOwnerError(workerResult(claimUnknown, 'run'), 'WRITE_UNKNOWN', '$')
  assert.equal(claimUnknown.ownerPhase, 'CLAIMED')
  expectOwnerError(workerResult(claimUnknown, 'followup-open'), 'OWNER_UNKNOWN', '$')

  // (c) An ordinary final failure only tombstones that Task; an unrelated Task still executes.
  const twoTasks = runOwnerWorker({
    key: 'key:fixture-t03-a',
    key2: 'key:fixture-t03-b',
    mode: 'twoTasks',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 1 },
  })
  assert.equal(twoTasks.counts.fsFaults, 1)
  assert.equal(twoTasks.counts.engine, 2)
  expectOwnerError(workerResult(twoTasks, 'task-a'), 'EXECUTION_UNKNOWN', '$')
  const taskB = workerResult(twoTasks, 'task-b')
  assert.equal(taskB.ok, true, JSON.stringify(taskB))
  assert.equal(taskB.value.outcome, 'RECORDED')
  const tombstone = workerResult(twoTasks, 'task-a-get')
  assert.equal(tombstone.value.ownerState, 'UNKNOWN')
  assert.equal(tombstone.value.outcome, 'FOUND')
  assert.equal(twoTasks.catalogEntries, 2)

  // (d) A real FINAL rename whose confirmation failed keeps the bytes and locks all handles.
  const finalUnknown = runOwnerWorker({
    key: 'key:fixture-t03-final',
    fsFault: { call: 'lstatSync', match: OWNER_FILE, when: 'diskFinal' },
    followUp: true,
  })
  expectOwnerError(workerResult(finalUnknown, 'run'), 'WRITE_UNKNOWN', '$')
  assert.equal(finalUnknown.ownerPhase, 'FINAL')
  assert.equal(finalUnknown.ownerRaw.entries[0].phase, 'FINAL')
  expectOwnerError(workerResult(finalUnknown, 'followup-open'), 'OWNER_UNKNOWN', '$')
  assert.equal(finalUnknown.counts.engine, 1)
})

/* ------------------------------------------------------------------ T04 */

test('T04 the private store exposes only the two fixed files: no third file, no caller parser', async () => {
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-t04')
    const owner = await openFixtureTaskOwner({ sandbox })
    const control = await owner.value.run(runFrame(b))
    assert.equal(control.ok, true)

    const state = storeModule.getStoreState(sandbox)
    assert.equal(typeof storeModule.openStoreFile, 'undefined')
    assert.equal(typeof storeModule.openCatalogFile, 'function')
    assert.equal(typeof storeModule.openOwnerFile, 'function')

    // A third file name, a self-made spec, a caller parser or a missing domain is rejected before
    // any I/O. The owner opener has no caller-selectable name/budget/parser at all.
    let parserCalls = 0
    const callerParser = () => {
      parserCalls += 1
      return { revision: 0, entries: [] }
    }
    const isInternalFailure = (error) => error && error.key === 'INTERNAL_FAILURE'
    assert.throws(() => storeModule.openCatalogFile(state, 'third'), isInternalFailure)
    assert.throws(
      () => storeModule.openCatalogFile(state, { name: 'audio-task-third.json', maxBytes: 1024, parse: callerParser }),
      isInternalFailure,
    )
    assert.throws(() => storeModule.openCatalogFile(state), isInternalFailure)
    assert.equal(parserCalls, 0)
    assert.equal(fs.existsSync(filePath(sandbox, 'audio-task-third.json')), false)
    assert.deepEqual(fs.readdirSync(sandbox.root).sort(), [MARKER_FILE, CATALOG_FILE, OWNER_FILE].sort())

    // The two fixed files keep working through their fixed domains; extra arguments cannot retarget
    // the owner file and its fixed parser is the only one used.
    const catalog = storeModule.openCatalogFile(state, storeModule.STORE_DOMAINS.CATALOG).read()
    assert.equal(catalog.entries.length, 1)
    const ownerFile = storeModule.openOwnerFile(state, { name: 'audio-task-third.json', parse: callerParser })
    assert.equal(ownerFile.name, OWNER_FILE)
    const ownerRead = ownerFile.read()
    assert.equal(ownerRead.revision, 2)
    assert.equal(ownerRead.entries[0].phase, 'FINAL')
    assert.equal(parserCalls, 0)
    assert.equal(fs.existsSync(filePath(sandbox, 'audio-task-third.json')), false)
    const birthEntry = storeModule.readBirthRecord(state, storeModule.STORE_DOMAINS.OWNER, b.scopeId, b.taskId)
    assert.equal(birthEntry.scopeId, b.scopeId)
    assert.equal(birthEntry.record.taskId, b.taskId)
  })
})

/* ------------------------------------------------------------------ T05 */

async function twoBirths(sandbox) {
  const svc = example('## 7.')
  const first = await birth(sandbox, svc, 'key:fixture-t05-a')
  const second = await birth(sandbox, svc, 'key:fixture-t05-b')
  const snapshot = readJson(sandbox, CATALOG_FILE)
  return { first, second, catalog: snapshot.entries }
}

function claimedEntry(catalogEntry) {
  return {
    scopeId: catalogEntry.scopeId,
    taskId: catalogEntry.record.taskId,
    birthIdentityHash: catalogEntry.identityHash,
    phase: 'CLAIMED',
    record: clone(catalogEntry.record),
    completion: null,
  }
}

function baseSnapshot(buds) {
  const entries = buds.catalog.map((entry) => claimedEntry(entry))
  return { schemaVersion: 1, revision: entries.length, entries }
}

function writeRawOwner(sandbox, snapshot, padTo) {
  const text = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot)
  const padded = padTo ? text + ' '.repeat(Math.max(0, padTo - text.length)) : text
  fs.writeFileSync(filePath(sandbox, OWNER_FILE), padded)
  return fs.readFileSync(filePath(sandbox, OWNER_FILE))
}

async function schemaCase(name, mutate, expected) {
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    writeRawOwner(sandbox, baseSnapshot(buds))
    const legalOpen = await openFixtureTaskOwner({ sandbox })
    assert.equal(legalOpen.ok, true, name + ' legal control')
    const read = await legalOpen.value.get(getFrame(buds.first))
    assert.equal(read.value.outcome, 'FOUND', name)
    assert.equal(read.value.ownerState, 'UNKNOWN', name)
    assert.equal(read.value.revision, 2, name)
  })
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const snapshot = baseSnapshot(buds)
    mutate(snapshot)
    const bytes = writeRawOwner(sandbox, snapshot)
    const result = await openFixtureTaskOwner({ sandbox })
    assert.equal(result.ok, false, name)
    assert.equal(result.errors[0].code, TASK_OWNER_ERRORS[expected], name + ' -> ' + (result.ok ? '' : result.errors[0].code))
    assert.equal(ownerBytes(sandbox).equals(bytes), true, name + ' must not be repaired')
  })
}

test('T05 owner schema and storage boundaries: legal control first, whole-snapshot rejection, no repair', async () => {
  // Legal control: a two-entry CLAIMED snapshot opens, reads and stays read-only.
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    writeRawOwner(sandbox, baseSnapshot(buds))
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, true)
    const read = await opened.value.get(getFrame(buds.first))
    assert.equal(read.value.outcome, 'FOUND')
    assert.equal(read.value.ownerState, 'UNKNOWN')
    assert.equal(read.value.revision, 2)
    const rerun = await opened.value.run(runFrame(buds.first))
    assert.equal(rerun.value.outcome, 'EXISTING')
    assert.equal(JSON.parse(ownerBytes(sandbox)).revision, 2)
  })

  await schemaCase(
    'duplicate same scope',
    (snapshot) => {
      snapshot.entries.push(clone(snapshot.entries[0]))
      snapshot.revision += 1
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'duplicate cross scope',
    (snapshot) => {
      const copy = clone(snapshot.entries[0])
      copy.scopeId = 'scope:fixture-other'
      snapshot.entries.push(copy)
      snapshot.revision += 1
    },
    'BIRTH_INVALID',
  )
  await schemaCase(
    'birth identity hash',
    (snapshot) => {
      snapshot.entries[0].birthIdentityHash = 'a'.repeat(64)
    },
    'BIRTH_INVALID',
  )
  await schemaCase(
    'illegal final state',
    (snapshot) => {
      snapshot.entries[0].phase = 'FINAL'
      snapshot.entries[0].completion = { kind: 'SIMULATED', reason: null }
      snapshot.revision += 1
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'illegal final reason',
    (snapshot) => {
      snapshot.entries[0].phase = 'FINAL'
      snapshot.entries[0].completion = { kind: 'NO_EXECUTION', reason: 'TASK_FIXTURE_NOT_A_REASON' }
      snapshot.revision += 1
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'weighted revision',
    (snapshot) => {
      snapshot.revision = 5
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'missing association',
    (snapshot) => {
      const copy = clone(snapshot.entries[0])
      copy.taskId = 'task:fixture-' + '1'.repeat(32)
      copy.record.taskId = copy.taskId
      copy.birthIdentityHash = 'b'.repeat(64)
      snapshot.entries.push(copy)
      snapshot.revision += 1
    },
    'BIRTH_INVALID',
  )
  await schemaCase(
    'unknown phase',
    (snapshot) => {
      snapshot.entries[0].phase = 'WEIRD'
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'completion on claimed',
    (snapshot) => {
      snapshot.entries[0].completion = { kind: 'SIMULATED', reason: null }
    },
    'STORE_INVALID',
  )

  // Entry cap: 32 legal entries pass, a 33rd is refused by the entry cap (not by an invented birth).
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    for (let index = 0; index < 32; index += 1) {
      await birth(sandbox, svc, 'key:fixture-t05-cap-' + index)
    }
    const catalog = readJson(sandbox, CATALOG_FILE).entries
    assert.equal(catalog.length, 32)
    const snapshot = { schemaVersion: 1, revision: 32, entries: catalog.map((entry) => claimedEntry(entry)) }
    const bytes = writeRawOwner(sandbox, snapshot)
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, true, opened.ok ? '' : opened.errors[0].code)
    const read = await opened.value.get({ schemaVersion: 1, scopeId: catalog[0].scopeId, taskId: catalog[0].record.taskId })
    assert.equal(read.value.outcome, 'FOUND')
    assert.equal(read.value.revision, 32)
    assert.equal(ownerBytes(sandbox).equals(bytes), true)

    const over = clone(snapshot)
    const extra = clone(over.entries[0])
    extra.taskId = 'task:fixture-' + '2'.repeat(32)
    extra.record.taskId = extra.taskId
    over.entries.push(extra)
    over.revision = 33
    const overBytes = writeRawOwner(sandbox, over)
    const rejected = await openFixtureTaskOwner({ sandbox })
    assert.equal(rejected.ok, false)
    assert.equal(rejected.errors[0].code, TASK_OWNER_ERRORS.RESOURCE_LIMIT)
    assert.equal(ownerBytes(sandbox).equals(overBytes), true)
  })

  // Byte budget: exactly 128 KiB of legal JSON passes, 128 KiB + 1 is refused by the read budget.
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const text = JSON.stringify(baseSnapshot(buds))
    assert.ok(text.length < 128 * 1024)
    writeRawOwner(sandbox, text, 128 * 1024)
    assert.equal(ownerBytes(sandbox).length, 128 * 1024)
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, true, opened.ok ? '' : opened.errors[0].code)
    const read = await opened.value.get(getFrame(buds.first))
    assert.equal(read.value.outcome, 'FOUND')
  })
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const text = JSON.stringify(baseSnapshot(buds))
    writeRawOwner(sandbox, text, 128 * 1024 + 1)
    assert.equal(ownerBytes(sandbox).length, 128 * 1024 + 1)
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, false)
    assert.equal(opened.errors[0].code, TASK_OWNER_ERRORS.RESOURCE_LIMIT)
  })
})

/* ------------------------------------------------------------------ T06 */

function nest(count) {
  let value = 'leaf'
  for (let index = 0; index < count; index += 1) value = { a: value }
  return value
}

test('T06 input boundary, no re-run after a stored conclusion and full graph isolation', async () => {
  // Depth boundary is the shared input boundary, proven at exactly depth 12 / 13.
  assert.equal(copyFixtureInput(nest(12)).ok, true)
  assert.equal(copyFixtureInput(nest(13)).ok, false)
  assert.equal(copyFixtureInput(nest(13)).key, 'RESOURCE_LIMIT')

  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-t06')
    const owner = await openFixtureTaskOwner({ sandbox })

    // A legal input is copied fine; a 13-deep probe and an over-wide array are refused before the
    // engine runs and leave no owner file behind.
    const deep = clone(b.input)
    assert.equal(copyFixtureInput(deep).ok, true)
    assert.ok(Object.keys(deep.sourceInput.artifactLibrary).length <= 30)
    deep.sourceInput.artifactLibrary.deepProbe = nest(10)
    assert.equal(copyFixtureInput(deep).key, 'RESOURCE_LIMIT')
    expectOwnerError(
      await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: deep }),
      'RESOURCE_LIMIT',
      'input',
    )
    const wide = clone(b.input)
    assert.ok(Object.keys(wide.sourceInput.artifactLibrary).length <= 30)
    wide.sourceInput.artifactLibrary.extraItems = new Array(257).fill(null)
    assert.equal(copyFixtureInput(wide).key, 'RESOURCE_LIMIT')
    expectOwnerError(
      await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: wide }),
      'RESOURCE_LIMIT',
      'input',
    )
    assert.equal(ownerBytes(sandbox), null)

    // Frozen caller input, unchanged, and never shared with the output graph.
    const frozen = clone(b.input)
    const freezeAll = (value) => {
      if (value === null || typeof value !== 'object') return
      Object.freeze(value)
      for (const key of Reflect.ownKeys(value)) freezeAll(value[key])
    }
    freezeAll(frozen)
    const before = JSON.stringify(frozen)
    const first = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: frozen })
    assert.equal(first.value.outcome, 'RECORDED')
    assert.equal(JSON.stringify(frozen), before)
    assert.equal(Object.isFrozen(frozen), true)
    const inputObjects = new Set()
    const collect = (value) => {
      if (value === null || typeof value !== 'object' || inputObjects.has(value)) return
      inputObjects.add(value)
      for (const key of Reflect.ownKeys(value)) collect(value[key])
    }
    collect(frozen)
    const outputObjects = new Set()
    const walkOutput = (value) => {
      if (value === null || typeof value !== 'object' || outputObjects.has(value)) return
      outputObjects.add(value)
      for (const key of Reflect.ownKeys(value)) walkOutput(value[key])
    }
    walkOutput(first)
    for (const value of outputObjects) assert.equal(inputObjects.has(value), false)

    const second = await owner.value.get(getFrame(b))
    assert.equal(second.value.outcome, 'FOUND')
    assert.notEqual(second, first)
    assert.notEqual(second.value, first.value)
    assert.notEqual(second.value.task, first.value.task)
  })

  // A stored NO_EXECUTION conclusion survives a later executable input: engine count stays 0 new.
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const blocked = await birth(sandbox, svc, 'key:fixture-t06-blocked', (draft) => {
      draft.rights.state = 'UNVERIFIED'
    })
    const blockedInput = clone(blocked.input)
    blockedInput.sourceInput.voiceBinding.taskDraft.rights.state = 'UNVERIFIED'
    const owner = await openFixtureTaskOwner({ sandbox })
    const first = await owner.value.run({ schemaVersion: 1, scopeId: blocked.scopeId, taskId: blocked.taskId, input: blockedInput })
    assert.equal(first.value.ownerState, 'NO_EXECUTION')
    assert.equal(first.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')
    const bytesAfterFirst = ownerBytes(sandbox)
    const executable = clone(blockedInput)
    executable.sourceInput.voiceBinding.taskDraft.rights.state = 'VERIFIED'
    const repeat = await owner.value.run({ schemaVersion: 1, scopeId: blocked.scopeId, taskId: blocked.taskId, input: executable })
    assert.equal(repeat.value.outcome, 'EXISTING')
    assert.equal(repeat.value.ownerState, 'NO_EXECUTION')
    assert.equal(ownerBytes(sandbox).equals(bytesAfterFirst), true)
  })
})
