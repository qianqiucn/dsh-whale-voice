/* Whale Voice — Plan 08-E-D bounded byte preparation inside the single task engine.
 *
 * D01–D07 drive the real internal engine entry `runExistingFixtureTaskBytesOnce`: the same accepted
 * source/readiness/dispatch/Fake-result flow, one real 08-E-C producer call after the verified Fake
 * SUCCESS, a bounded 1 MiB frame precondition, and a PROCESSING record with no ATTACH/SAVED. A
 * test-only vm worker wraps the real dependencies and counts calls / injects producer faults; it
 * never replaces the engine algorithms and no product DI exists. No real media, Task persistence,
 * network, clock or device is used.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { projectAudioTask } from '../core/audio/task-contract.mjs'
import {
  runExistingFixtureTaskBytesOnce,
  runExistingFixtureTaskOnce,
  TASK_FIXTURE_BYTES_ERRORS,
} from '../core/audio/task-fixture-engine-internal.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const SCOPE = 'scope:fixture-demo'
const NOW = '2026-10-27T00:00:00.000Z'
const PACK_FILE = 'audio-task-catalog-v1.json'

/* --------------------------------------------- fixtures ------------------------------------- */

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function extractExample(heading) {
  const doc = fs.readFileSync(new URL('../docs/TASK_FIXTURE_RUNNER_OFFLINE.md', import.meta.url), 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, 'missing doc heading ' + heading)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

async function withExistingFrame(example, key, fn) {
  const sandbox = createConfigSandbox()
  try {
    const opened = await openFixtureTaskCatalog({ sandbox })
    assert.equal(opened.ok, true, JSON.stringify(opened))
    const binding = example.sourceInput.voiceBinding
    const draft = { ...binding.taskDraft }
    delete draft.taskId
    const reserved = await opened.value.reserve({
      schemaVersion: 1,
      scopeId: binding.expectation.scopeId,
      idempotencyKey: key,
      draft,
      observedAt: NOW,
    })
    assert.equal(reserved.ok, true, JSON.stringify(reserved))
    const snapshot = JSON.parse(fs.readFileSync(path.join(sandbox.root, PACK_FILE), 'utf8'))
    const entry = snapshot.entries[snapshot.entries.length - 1]
    const input = clone(example)
    input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
    input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
    const frame = { scopeId: binding.expectation.scopeId, record: entry.record, input }
    return await fn({ sandbox, entry, frame, input })
  } finally {
    removeConfigSandbox(sandbox)
  }
}

function withDuration(frame, durationMs) {
  const variant = clone(frame)
  variant.input.sourceInput.artifactLibrary.artifacts[0].audio.durationMs = durationMs
  variant.input.sourceInput.voiceBinding.negotiation.request.inputAudio.durationMs = durationMs
  return variant
}

function expectBytesError(result, key) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal(result.errors.length, 1)
  assert.deepEqual(Object.keys(result.errors[0]).sort(), ['code', 'path', 'reason'])
  assert.equal(result.errors[0].code, TASK_FIXTURE_BYTES_ERRORS[key])
  assert.equal(result.errors[0].path, '$')
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.errors[0]), true)
}

/* ------------------------------ test-only vm worker (counts / faults) ------------------------ */

const WORKER = String.raw`
import vm from 'node:vm'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const base = process.env.WV_BASE
const entry = process.env.WV_ENTRY || 'bytes'
const fault = JSON.parse(process.env.WV_FAULT || 'null')
const frame = JSON.parse(process.env.WV_FRAME || 'null')
const load = (p) => import(pathToFileURL(base + '/core/audio/' + p).href)

const deps = {
  input: await load('fixture-input-boundary.mjs'),
  source: await load('source-artifacts.mjs'),
  ready: await load('provider-readiness.mjs'),
  dispatch: await load('provider-dispatch.mjs'),
  task: await load('task-contract.mjs'),
  gateway: await import(pathToFileURL(base + '/core/svc/rvc-fake-gateway.mjs').href),
  producer: await load('fixture-wav-producer.mjs'),
  facade: await load('task-fixture-runner.mjs'),
}

const counts = { source: 0, gate: 0, dispatch: 0, create: 0, transition: 0, validateRecord: 0, rvc: 0, rvcOk: 0, producer: 0, realProducer: 0, realProducerOk: 0 }
let getterCalls = 0

const wrap = (name, original) => (...args) => {
  counts[name] += 1
  return original(...args)
}

function producerFault(request) {
  if (!fault || fault.target !== 'producer') return null
  const kind = fault.kind
  if (kind === 'throw') throw new Error('injected producer throw')
  if (kind === 'okfalse') return { ok: false, errors: [{ code: 'FIXTURE_WAV_PRODUCER_RESOURCE_LIMIT', path: 'frameCount', reason: 'injected' }] }
  return { kind, request }
}

const wrappedProducer = (request) => {
  counts.producer += 1
  const out = deps.producer.produceFixtureWav(request)
  counts.realProducer += 1
  if (out && out.ok === true) counts.realProducerOk += 1
  if (!fault || fault.target !== 'producer') return out
  if (fault.kind === 'throw') throw new Error('injected producer throw')
  if (fault.kind === 'okfalse') return { ok: false, errors: [{ code: 'FIXTURE_WAV_PRODUCER_RESOURCE_LIMIT', path: 'frameCount', reason: 'injected' }] }
  const value = { ...out.value }
  if (fault.kind === 'missing-bytes') { delete value.bytes; return { ok: true, value: Object.freeze(value) } }
  if (fault.kind === 'view-length') { value.bytes = new Uint8Array(out.value.bytes.length + 2); return { ok: true, value: Object.freeze(value) } }
  if (fault.kind === 'duration') { const inspection = { ...out.value.inspection, durationMs: out.value.inspection.durationMs + 1 }; value.inspection = Object.freeze(inspection); return { ok: true, value: Object.freeze(value) } }
  if (fault.kind === 'flag') { value.mockOnly = false; return { ok: true, value: Object.freeze(value) } }
  if (fault.kind === 'accessor') {
    delete value.origin
    Object.defineProperty(value, 'origin', { enumerable: true, configurable: true, get() { getterCalls += 1; return 'SYNTHETIC_FIXTURE' } })
    return { ok: true, value: Object.freeze(value) }
  }
  throw new Error('unknown producer fault ' + fault.kind)
}

const dispatch = (request) => {
  counts.dispatch += 1
  return deps.ready.dispatchReadyRvcFakeOnce(request)
}
const validateRvc = (...args) => {
  counts.rvc += 1
  const out = deps.gateway.validateRvcFakeResult(...args)
  if (out && out.ok === true) counts.rvcOk += 1
  return out
}

const exportsByKey = {
  'fixture-input-boundary.mjs': { copyFixtureInput: deps.input.copyFixtureInput, deepFreezeFixtureValue: deps.input.deepFreezeFixtureValue },
  'source-artifacts.mjs': { resolveFixtureTaskSource: wrap('source', deps.source.resolveFixtureTaskSource) },
  'provider-readiness.mjs': { negotiateReadyFixtureProvider: wrap('gate', deps.ready.negotiateReadyFixtureProvider), dispatchReadyRvcFakeOnce: dispatch },
  'provider-dispatch.mjs': { PROVIDER_DISPATCH_ERRORS: deps.dispatch.PROVIDER_DISPATCH_ERRORS },
  'task-contract.mjs': {
    createAudioTaskRecord: wrap('create', deps.task.createAudioTaskRecord),
    projectAudioTask: deps.task.projectAudioTask,
    transitionAudioTask: wrap('transition', deps.task.transitionAudioTask),
    validateAudioTaskDraft: deps.task.validateAudioTaskDraft,
    validateAudioTaskRecord: wrap('validateRecord', deps.task.validateAudioTaskRecord),
  },
  'rvc-fake-gateway.mjs': { RVC_FAKE_SCENARIOS: deps.gateway.RVC_FAKE_SCENARIOS, validateRvcFakeResult: validateRvc },
  'fixture-wav-producer.mjs': { produceFixtureWav: wrappedProducer },
}
const enginePath = pathToFileURL(base + '/core/audio/task-fixture-engine-internal.mjs').href
const engine = new vm.SourceTextModule(fs.readFileSync(new URL(enginePath), 'utf8'), { identifier: enginePath })
await engine.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  const key = url.split('/').pop()
  const exp = exportsByKey[key]
  if (!exp) throw new Error('unexpected engine import ' + url)
  return new vm.SyntheticModule(Object.keys(exp), function () { for (const k of Object.keys(exp)) this.setExport(k, exp[k]) }, { identifier: url })
})
await engine.evaluate()

const facadePath = pathToFileURL(base + '/core/audio/task-fixture-runner.mjs').href
const facade = new vm.SourceTextModule(fs.readFileSync(new URL(facadePath), 'utf8'), { identifier: facadePath })
await facade.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === enginePath) return engine
  const key = url.split('/').pop()
  const exp = exportsByKey[key]
  if (!exp) throw new Error('unexpected facade import ' + url)
  return new vm.SyntheticModule(Object.keys(exp), function () { for (const k of Object.keys(exp)) this.setExport(k, exp[k]) }, { identifier: url })
})
await facade.evaluate()

let out
if (entry === 'bytes') out = engine.namespace.runExistingFixtureTaskBytesOnce(frame)
else if (entry === 'existing') out = engine.namespace.runExistingFixtureTaskOnce(frame)
else if (entry === 'draft') out = engine.namespace.runDraftFixtureTaskOnce(frame.input)
else out = { result: facade.namespace.runFixtureAudioTaskOnce(frame.input) }

const summary = {
  counts,
  getterCalls,
  rootKeys: out && typeof out === 'object' ? Object.keys(out) : null,
  rootFrozen: out ? Object.isFrozen(out) : null,
  recordState: out.record ? out.record.state : null,
  recordFrozen: out.record ? Object.isFrozen(out.record) : null,
  result: out.result ? JSON.parse(JSON.stringify(out.result)) : null,
  production: out.production === null || out.production === undefined ? null : {
    keys: Object.keys(out.production),
    byteLength: out.production.bytes.length,
    sha256: out.production.inspection.sha256,
    frozen: Object.isFrozen(out.production),
    inspectionFrozen: Object.isFrozen(out.production.inspection),
    bytesFrozen: Object.isFrozen(out.production.bytes),
    origin: out.production.origin,
  },
}
if (out.production && process.env.WV_MUTATE === '1') {
  const before = out.production.bytes[0]
  out.production.bytes[0] = 0
  summary.production.mutatedFrom = before
}
process.stdout.write(JSON.stringify(summary))
`

function runWorker(scenario) {
  const output = execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', WORKER], {
    cwd: BASE,
    encoding: 'utf8',
    env: {
      ...process.env,
      WV_BASE: BASE,
      WV_ENTRY: scenario.entry || 'bytes',
      WV_FAULT: JSON.stringify(scenario.fault || null),
      WV_FRAME: JSON.stringify(scenario.frame),
      WV_MUTATE: scenario.mutate ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(output)
}

/* ============================================= D01 ========================================== */

test('D01 real causal chain: one source/gate/dispatch/RVC/producer and one PROCESSING transition', async () => {
  const example = extractExample('## 7.')
  await withExistingFrame(example, 'key:fixture-d01', async ({ frame }) => {
    const snapshot = clone(frame.input)
    const before = runWorker({ frame })
    assert.deepEqual(before.counts, {
      source: 1,
      gate: 1,
      dispatch: 1,
      create: 0,
      transition: 1,
      validateRecord: 2,
      rvc: 1,
      rvcOk: 1,
      producer: 1,
      realProducer: 1,
      realProducerOk: 1,
    })
    assert.deepEqual(before.rootKeys, ['record', 'result', 'production'])
    assert.equal(before.rootFrozen, true)
    assert.equal(before.recordState, 'PROCESSING')
    assert.equal(before.production.byteLength, 88244)
    assert.equal(before.production.origin, 'SYNTHETIC_FIXTURE')
    assert.equal(before.production.bytesFrozen, false)
    assert.equal(before.production.inspectionFrozen, true)
    const result = before.result
    assert.equal(result.ok, true)
    assert.equal(result.value.phase, 'SIMULATED')
    assert.equal(result.value.reason, null)
    assert.deepEqual(result.value.states, ['CREATED', 'PROCESSING'])
    assert.equal(result.value.task.hasOutput, false)
    assert.equal(result.value.task.state, 'PROCESSING')
    assert.equal(result.value.messageZh, '演示字节已准备，尚未登记资产或保存任务。')
    assert.deepEqual(Object.keys(result.value).sort(), [
      'automaticRetryAllowed',
      'execution',
      'messageZh',
      'mockOnly',
      'phase',
      'readiness',
      'realOperationAllowed',
      'reason',
      'schemaVersion',
      'sourceCheck',
      'states',
      'submitAllowed',
      'task',
    ])
    assert.deepEqual(frame.input, snapshot)

    // The real in-process entry agrees with the worker and keeps the record identity.
    const direct = runExistingFixtureTaskBytesOnce(frame)
    assert.equal(direct.record.state, 'PROCESSING')
    assert.equal(direct.record.taskId, frame.record.taskId)
    assert.equal(direct.record.observedAt, frame.record.observedAt)
    assert.equal(direct.record.outputArtifactRef, null)
    assert.equal(direct.result.value.task.hasOutput, false)
    assert.equal(direct.production.bytes.length, 88244)
    assert.equal(direct.production.inspection.peak, 0)
    assert.equal(direct.production.inspection.fullScaleSampleCount, 0)
  })
})

/* ============================================= D02 ========================================== */

test('D02 five exact duration boundaries: three PROCESSING successes, 1 ms and 11890 ms refused before BEGIN', async () => {
  const example = extractExample('## 7.')
  await withExistingFrame(example, 'key:fixture-d02', async ({ frame }) => {
    const cases = [
      { duration: 10, frames: 441, bytes: 926 },
      { duration: 1000, frames: 44100, bytes: 88244 },
      { duration: 11880, frames: 523908, bytes: 1047860 },
    ]
    for (const item of cases) {
      const out = runWorker({ frame: withDuration(frame, item.duration) })
      assert.equal(out.result.ok, true, JSON.stringify(out.result))
      assert.equal(out.recordState, 'PROCESSING')
      assert.equal(out.production.byteLength, item.bytes)
      assert.deepEqual(out.counts.producer, 1)
      assert.deepEqual(out.counts.transition, 1)
      assert.deepEqual(out.result.value.states, ['CREATED', 'PROCESSING'])
    }
    for (const item of [
      { duration: 1, key: 'UNREPRESENTABLE_DURATION' },
      { duration: 11890, key: 'RESOURCE_LIMIT' },
    ]) {
      const out = runWorker({ frame: withDuration(frame, item.duration) })
      assert.equal(out.result.ok, false, JSON.stringify(out.result))
      assert.equal(out.result.errors[0].code, TASK_FIXTURE_BYTES_ERRORS[item.key])
      assert.equal(out.result.errors[0].path, '$')
      assert.equal(out.recordState, null)
      assert.equal(out.production, null)
      assert.equal(out.counts.producer, 0, 'the duration/budget gate runs before the producer')
      assert.equal(out.counts.transition, 0)
      assert.equal(out.counts.dispatch, 1, 'the real Fake dispatch already happened once')
      assert.equal(out.counts.rvc, 1)
    }
  })
})

/* ============================================= D03 ========================================== */

test('D03 producer protocol faults: seven injected failures fail closed with no second call', async () => {
  const example = extractExample('## 7.')
  await withExistingFrame(example, 'key:fixture-d03', async ({ frame }) => {
    for (const kind of ['throw', 'okfalse', 'missing-bytes', 'view-length', 'duration', 'flag', 'accessor']) {
      const out = runWorker({ frame, fault: { target: 'producer', kind } })
      assert.equal(out.result.ok, false, kind + ' ' + JSON.stringify(out.result))
      assert.equal(out.result.errors[0].code, TASK_FIXTURE_BYTES_ERRORS.DEPENDENCY_FAILURE, kind)
      assert.equal(out.result.errors[0].path, '$', kind)
      assert.equal(out.recordState, null, kind)
      assert.equal(out.production, null, kind)
      assert.equal(out.counts.producer, 1, kind)
      assert.equal(out.counts.realProducer, 1, kind)
      assert.equal(out.counts.realProducerOk, 1, kind)
      assert.equal(out.getterCalls, 0, kind)
      assert.equal(out.counts.transition, 0, kind)
    }
  })
})

/* ============================================= D04 ========================================== */

test('D04 non-success and blocked compatibility: record/result equal the legacy entry, production null', async () => {
  const example = extractExample('## 7.')
  await withExistingFrame(example, 'key:fixture-d04', async ({ frame }) => {
    const scenarios = [
      { name: 'OFFLINE', mutate: (f) => { f.input.context.scenario = 'OFFLINE' } },
      { name: 'MODEL_MISSING', mutate: (f) => { f.input.context.scenario = 'MODEL_MISSING' } },
      { name: 'TIMEOUT', mutate: (f) => { f.input.context.scenario = 'TIMEOUT' } },
      { name: 'CANCEL_REQUESTED', mutate: (f) => { f.input.context.scenario = 'CANCEL_REQUESTED' } },
      { name: 'CANCEL_CONFIRMED', mutate: (f) => { f.input.context.scenario = 'CANCEL_CONFIRMED' } },
      { name: 'UNKNOWN', mutate: (f) => { f.input.context.scenario = 'UNKNOWN' } },
      { name: 'SOURCE_BLOCKED', mutate: (f) => { f.input.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT' } },
      { name: 'READINESS_BLOCKED', mutate: (f) => { f.input.readiness.instances[0].installation = 'ABSENT' } },
    ]
    for (const item of scenarios) {
      const variant = clone(frame)
      item.mutate(variant)
      const bytesOut = runWorker({ frame: variant })
      const legacyOut = runWorker({ entry: 'existing', frame: variant })
      assert.equal(bytesOut.result.ok, legacyOut.result.ok, item.name)
      assert.deepEqual(bytesOut.result, legacyOut.result, item.name)
      assert.deepEqual(bytesOut.recordState, legacyOut.recordState, item.name)
      assert.equal(bytesOut.production, null, item.name)
      assert.equal(bytesOut.counts.producer, 0, item.name)
      assert.equal(legacyOut.counts.producer, 0, item.name)
      assert.equal(bytesOut.counts.dispatch, legacyOut.counts.dispatch, item.name)
      assert.equal(bytesOut.counts.transition, legacyOut.counts.transition, item.name)
    }
  })
})

/* ============================================= D05 ========================================== */

test('D05 precheck and non-reentry: bad frames and PROCESSING/SAVED/UNKNOWN stop before dispatch/producer', async () => {
  const example = extractExample('## 7.')
  await withExistingFrame(example, 'key:fixture-d05', async ({ frame }) => {
    const badFrames = [
      { ...clone(frame), extra: true },
      (() => { const copy = clone(frame); delete copy.input; return copy })(),
      (() => { const copy = clone(frame); copy.scopeId = 'scope:fixture-other'; return copy })(),
    ]
    for (const bad of badFrames) {
      const out = runWorker({ frame: bad })
      assert.equal(out.result.ok, false)
      assert.equal(out.counts.dispatch, 0)
      assert.equal(out.counts.producer, 0)
      assert.equal(out.counts.transition, 0)
    }

    // A record already beyond the initial states is refused before dispatch or producer.
    for (const state of ['PROCESSING', 'SAVED', 'UNKNOWN']) {
      const copy = clone(frame)
      copy.record.state = state
      const out = runWorker({ frame: copy })
      assert.equal(out.result.ok, false, state)
      assert.equal(out.counts.dispatch, 0, state)
      assert.equal(out.counts.producer, 0, state)
    }
  })
})

/* ============================================= D06 ========================================== */

test('D06 memory and private boundary: frozen root, mutable independent bytes, no record leak to facade', async () => {
  const example = extractExample('## 7.')
  await withExistingFrame(example, 'key:fixture-d06', async ({ frame }) => {
    const out = runWorker({ frame, mutate: true })
    assert.equal(out.rootFrozen, true)
    assert.equal(out.recordFrozen, true)
    assert.equal(out.production.frozen, true)
    assert.equal(out.production.inspectionFrozen, true)
    assert.equal(out.production.bytesFrozen, false)
    assert.equal(out.production.mutatedFrom, 0x52, 'bytes stay writable')

    const first = runExistingFixtureTaskBytesOnce(frame)
    const second = runExistingFixtureTaskBytesOnce(clone(frame))
    assert.notEqual(first.production.bytes, second.production.bytes)
    assert.notEqual(first.production.bytes.buffer, second.production.bytes.buffer)
    first.production.bytes[0] = 0
    assert.equal(second.production.bytes[0], 0x52)

    const facadeOut = runWorker({ entry: 'public', frame })
    assert.deepEqual(facadeOut.rootKeys, ['result'])
    assert.equal('record' in facadeOut.result.value, false)
    assert.equal('production' in facadeOut.result.value, false)
  })
})

/* ============================================= D07 ========================================== */

test('D07 legacy paths stay byte-free and the documented examples run as written', async () => {
  const example = extractExample('## 7.')
  await withExistingFrame(example, 'key:fixture-d07', async ({ frame }) => {
    for (const entry of ['existing', 'public']) {
      const out = runWorker({ entry, frame })
      assert.equal(out.counts.producer, 0, entry)
      assert.equal(out.result.ok, true, entry)
    }

    const doc = fs.readFileSync(new URL('../docs/TASK_FIXTURE_RECORD_INTERNAL.md', import.meta.url), 'utf8')
    const section = doc.indexOf('## 12.')
    assert.ok(section >= 0, 'the internal doc must document the bytes entry examples')
    const blocks = []
    let from = section
    for (;;) {
      const open = doc.indexOf('```json', from)
      if (open === -1) break
      const start = doc.indexOf('\n', open)
      const close = doc.indexOf('```', start + 1)
      blocks.push(JSON.parse(doc.slice(start + 1, close).trim()))
      from = close + 3
    }
    assert.ok(blocks.some((block) => block.name === 'bytes-success'))
    assert.ok(blocks.some((block) => block.name === 'bytes-refused-unrepresentable'))
    assert.ok(blocks.some((block) => block.name === 'bytes-refused-budget'))
    for (const block of blocks) {
      const out = runWorker({ frame: withDuration(frame, block.durationMs) })
      if (block.expect === 'PROCESSING') {
        assert.equal(out.result.ok, true, block.name)
        assert.equal(out.production.byteLength, block.byteLength)
      } else {
        assert.equal(out.result.ok, false, block.name)
        assert.equal(out.result.errors[0].code, TASK_FIXTURE_BYTES_ERRORS[block.expect], block.name)
        assert.equal(out.production, null)
      }
    }
  })

  // The public artifact library is not touched by this entry: no pack is created in the sandbox.
  await withExistingFrame(example, 'key:fixture-d07b', async ({ sandbox, frame }) => {
    const before = fs.readdirSync(sandbox.root).sort()
    const out = runExistingFixtureTaskBytesOnce(frame)
    assert.equal(out.result.ok, true)
    assert.deepEqual(fs.readdirSync(sandbox.root).sort(), before)
    const opened = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(opened.ok, true, 'the E-B library still opens independently')
  })
})
