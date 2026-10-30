/* Whale Voice — Plan 08-E-D / E-D-F01 bounded byte preparation inside the single task engine.
 *
 * D01–D07 drive the real internal engine entry `runExistingFixtureTaskBytesOnce`: the same accepted
 * source/readiness/dispatch/Fake-result flow, one real 08-E-C producer call after the verified Fake
 * SUCCESS, a bounded 1 MiB frame precondition, and a PROCESSING record with no ATTACH/SAVED.
 *
 * E-D-F01 (067) closes three finite groups inside the same private flow:
 *   R1 every bytes-entry exit is exactly {record, result, production} with `production: null` on a
 *      legal block, while the legacy two-key root stays unchanged;
 *   R2 the thin carrier guard reads only native internal slots (no shadowable own getter), so
 *      Int8Array/resizable ArrayBuffer are refused and own byteLength/@@toStringTag getters are
 *      never executed;
 *   R3 the original D01–D07 evidence gaps: three-key roots on every fault, full record equality,
 *      a legal TTS block control, output-construction observation, extra precheck representatives
 *      and a complete executable frame documented in `docs/TASK_FIXTURE_RECORD_INTERNAL.md`.
 *
 * A test-only vm worker wraps the real dependencies and counts calls / injects producer, task and
 * frame faults; it never replaces the engine algorithms and no product DI exists. No real media,
 * Task persistence, network, clock or device is used.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import {
  runExistingFixtureTaskBytesOnce,
  runExistingFixtureTaskOnce,
  TASK_FIXTURE_BYTES_ERRORS,
  TASK_FIXTURE_ERRORS,
} from '../core/audio/task-fixture-engine-internal.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const NOW = '2026-10-27T00:00:00.000Z'
const PACK_FILE = 'audio-task-catalog-v1.json'
const PRODUCER_VALUE_KEYS = [
  'automaticRetryAllowed',
  'bytes',
  'inspection',
  'messageZh',
  'mockOnly',
  'origin',
  'realOperationAllowed',
  'schemaVersion',
  'submitAllowed',
]

const BYTES_REASONS = {
  UNREPRESENTABLE_DURATION: 'fixture duration cannot form complete frames',
  RESOURCE_LIMIT: 'fixture output byte budget exceeded',
  DEPENDENCY_FAILURE: 'fixture byte production unavailable',
}

/* --------------------------------------------- fixtures ------------------------------------- */

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function extractExample(heading = '## 7.') {
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

/* --------------------------------------------- assertions ----------------------------------- */

function assertBytesRoot(out, label) {
  assert.deepEqual(out.rootKeys, ['record', 'result', 'production'], label)
  assert.equal(out.rootFrozen, true, label)
  assert.equal(out.hasProduction, true, label)
}

function assertBytesError(out, key, label) {
  assertBytesRoot(out, label)
  assert.equal(out.productionKind, 'null', label)
  assert.equal(out.rawProduction.hasProductionKey, true, label)
  assert.equal(out.rawProduction.productionNull, true, label)
  assert.equal(out.rawRecord.hasRecordKey, true, label)
  assert.equal(out.rawRecord.recordNull, true, label + ': the original record must be strictly null')
  assert.equal(out.rawRecord.recordType, 'object', label)
  assert.equal(out.recordState, null, label)
  assert.equal(out.result.ok, false, label)
  assert.equal(out.result.errors.length, 1, label)
  assert.deepEqual(Object.keys(out.result.errors[0]).sort(), ['code', 'path', 'reason'], label)
  assert.equal(out.result.errors[0].code, TASK_FIXTURE_BYTES_ERRORS[key], label)
  assert.equal(out.result.errors[0].path, '$', label)
  assert.equal(out.result.errors[0].reason, BYTES_REASONS[key], label)
  assert.equal(out.resultFrozen, true, label)
  assert.equal(out.errorsFrozen, true, label)
  assert.equal(out.errorsEntryFrozen, true, label)
}

/** A post-bytes rejection keeps the legacy task error code but the bytes root and null contract. */
function assertTaskRejected(out, label) {
  assertBytesRoot(out, label)
  assert.equal(out.productionKind, 'null', label)
  assert.equal(out.rawProduction.hasProductionKey, true, label)
  assert.equal(out.rawProduction.productionNull, true, label)
  assert.equal(out.rawRecord.hasRecordKey, true, label)
  assert.equal(out.rawRecord.recordNull, true, label + ': the original record must be strictly null')
  assert.equal(out.rawRecord.recordType, 'object', label)
  assert.equal(out.recordState, null, label)
  assert.equal(out.result.ok, false, label)
  assert.equal(out.result.errors.length, 1, label)
  assert.deepEqual(Object.keys(out.result.errors[0]).sort(), ['code', 'path', 'reason'], label)
  assert.equal(out.result.errors[0].code, TASK_FIXTURE_ERRORS.TASK_TRANSITION_REJECTED, label)
  assert.equal(out.result.errors[0].path, '$', label)
  assert.equal(out.result.errors[0].reason, 'task transition rejected', label)
  assert.equal(out.resultFrozen, true, label)
  assert.equal(out.errorsFrozen, true, label)
  assert.equal(out.errorsEntryFrozen, true, label)
}

function assertSuccessGraph(out, label) {
  assertBytesRoot(out, label)
  assert.equal(out.recordState, 'PROCESSING', label)
  assert.equal(out.recordFrozen, true, label)
  assert.deepEqual(out.recordNested, { source: true, rights: true, cancel: true, delivery: true }, label)
  assert.equal(out.resultFrozen, true, label)
  assert.deepEqual(
    out.resultNested,
    {
      value: true,
      states: true,
      task: true,
      sourceCheck: true,
      readiness: true,
      execution: true,
      dispatch: true,
    },
    label,
  )
  assert.equal(out.productionKind, 'object', label)
  assert.equal(out.production.frozen, true, label)
  assert.equal(out.production.inspectionFrozen, true, label)
  assert.equal(out.production.bytesFrozen, false, label)
  assert.deepEqual(out.production.keys.slice().sort(), PRODUCER_VALUE_KEYS, label)
  assert.equal(out.production.origin, 'SYNTHETIC_FIXTURE', label)
}

function assertLegacyAgreement(bytesOut, legacyOut, label) {
  assert.deepEqual(bytesOut.result, legacyOut.result, label)
  assert.deepEqual(bytesOut.record, legacyOut.record, label)
  assert.equal(bytesOut.recordState, legacyOut.recordState, label)
  assert.equal(bytesOut.counts.producer, 0, label)
  assert.equal(legacyOut.counts.producer, 0, label)
  assert.equal(bytesOut.counts.dispatch, legacyOut.counts.dispatch, label)
  assert.equal(bytesOut.counts.transition, legacyOut.counts.transition, label)
  assert.equal(bytesOut.counts.create, legacyOut.counts.create, label)
  assert.equal(bytesOut.counts.validateRecord, legacyOut.counts.validateRecord, label)
  assert.equal(bytesOut.counts.project, legacyOut.counts.project, label)
  assert.equal(bytesOut.productionKind, 'null', label)
}

/* ------------------------------ test-only vm worker (counts / faults) ------------------------ */

const WORKER = String.raw`
import vm from 'node:vm'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const base = process.env.WV_BASE
const entry = process.env.WV_ENTRY || 'bytes'
const fault = JSON.parse(process.env.WV_FAULT || 'null')
const frameFault = process.env.WV_FRAME_FAULT || ''
const observe = process.env.WV_OBSERVE === '1'
const reentry = process.env.WV_REENTRY === '1'
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

const counts = {
  source: 0, gate: 0, dispatch: 0, create: 0,
  transition: 0, realTransition: 0, realTransitionOk: 0,
  validateRecord: 0, realValidateRecord: 0, realValidateRecordOk: 0,
  project: 0, realProject: 0, realProjectOk: 0,
  rvc: 0, rvcOk: 0, producer: 0, realProducer: 0, realProducerOk: 0,
}
const faultHits = { begin: 0, record: 0, projection: 0 }
const actions = []
let getterCalls = 0
let faultIntegrity = null
let advancedLegal = null
let injectedBuffer = null

// Passive observation of real Uint8Array construction in this worker only; the engine-side and the
// producer-side (which includes the inspector's owned copy) constructions are counted separately.
const RealUint8Array = globalThis.Uint8Array
let insideProducer = 0
const producerViews = []
let outsideViews = 0
class ObservedUint8Array extends RealUint8Array {
  constructor(...args) {
    super(...args)
    if (insideProducer > 0) producerViews.push(this)
    else outsideViews += 1
  }
}

const wrap = (name, original) => (...args) => {
  counts[name] += 1
  return original(...args)
}

function advance(record, list) {
  let current = record
  for (const action of list) {
    const out = deps.task.transitionAudioTask(current, action)
    if (!out.ok) throw new Error('advance failed: ' + JSON.stringify(out.errors))
    current = out.value
  }
  return current
}

function freezeInjected(value) {
  const root = Object.freeze({ ok: true, value: Object.freeze(value) })
  faultIntegrity = {
    rootFrozen: Object.isFrozen(root),
    valueFrozen: Object.isFrozen(value),
    keys: Object.keys(value).length,
    inspectionFrozen: Object.isFrozen(value.inspection),
    bytesFrozen: Object.isFrozen(value.bytes),
  }
  return root
}

function injectProducerFault(out, kind) {
  const value = { ...out.value }
  if (kind === 'missing-bytes') { delete value.bytes; return freezeInjected(value) }
  if (kind === 'view-length') { value.bytes = new Uint8Array(out.value.bytes.length + 2); return freezeInjected(value) }
  if (kind === 'duration') { value.inspection = Object.freeze({ ...out.value.inspection, durationMs: out.value.inspection.durationMs + 1 }); return freezeInjected(value) }
  if (kind === 'flag') { value.mockOnly = false; return freezeInjected(value) }
  if (kind === 'accessor') {
    delete value.origin
    Object.defineProperty(value, 'origin', { enumerable: true, configurable: true, get() { getterCalls += 1; return 'SYNTHETIC_FIXTURE' } })
    return freezeInjected(value)
  }
  if (kind === 'int8') { value.bytes = new Int8Array(out.value.bytes.length); return freezeInjected(value) }
  if (kind === 'resizable') {
    const buffer = new ArrayBuffer(out.value.bytes.length, { maxByteLength: out.value.bytes.length * 2 })
    value.bytes = new Uint8Array(buffer)
    Uint8Array.prototype.set.call(value.bytes, out.value.bytes)
    return freezeInjected(value)
  }
  if (kind === 'byte-getter' || kind === 'byte-getter-throw') {
    // E3: the original 067 defect is an own byteLength getter on the ArrayBuffer carrier,
    // not on the Uint8Array view. Inject exactly there and nowhere else.
    const buffer = out.value.bytes.buffer
    const byteLength = out.value.bytes.byteLength
    injectedBuffer = buffer
    Object.defineProperty(buffer, 'byteLength', {
      configurable: true,
      enumerable: true,
      get() { getterCalls += 1; if (kind === 'byte-getter-throw') throw new Error('injected ArrayBuffer byteLength getter'); return byteLength },
    })
    const frozen = freezeInjected(value)
    faultIntegrity.injectionLevel = 'buffer'
    faultIntegrity.injectedOnBuffer = out.value.bytes.buffer === buffer
    return frozen
  }
  if (kind === 'tag-getter' || kind === 'tag-getter-throw') {
    // E3: same for an own Symbol.toStringTag getter on the ArrayBuffer carrier.
    const buffer = out.value.bytes.buffer
    injectedBuffer = buffer
    Object.defineProperty(buffer, Symbol.toStringTag, {
      configurable: true,
      enumerable: true,
      get() { getterCalls += 1; if (kind === 'tag-getter-throw') throw new Error('injected ArrayBuffer tag getter'); return 'ArrayBuffer' },
    })
    const frozen = freezeInjected(value)
    faultIntegrity.injectionLevel = 'buffer'
    faultIntegrity.injectedOnBuffer = out.value.bytes.buffer === buffer
    return frozen
  }
  throw new Error('unknown producer fault ' + kind)
}

const wrappedProducer = (request) => {
  counts.producer += 1
  let out
  try {
    insideProducer += 1
    out = deps.producer.produceFixtureWav(request)
  } finally {
    insideProducer -= 1
  }
  counts.realProducer += 1
  if (out && out.ok === true) counts.realProducerOk += 1
  if (!fault || fault.target !== 'producer') return out
  if (fault.kind === 'throw') throw new Error('injected producer throw')
  if (fault.kind === 'okfalse') return Object.freeze({ ok: false, errors: Object.freeze([Object.freeze({ code: 'FIXTURE_WAV_PRODUCER_RESOURCE_LIMIT', path: 'frameCount', reason: 'injected' })]) })
  return injectProducerFault(out, fault.kind)
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
// E1: every injection first performs the single real delegation at its stage, confirms the real
// success, and only then replaces that one result with a fixed legal rejection. The real function
// is never called twice and the product code keeps no injection hook.
const transition = (record, action) => {
  counts.transition += 1
  actions.push(action.type)
  const out = deps.task.transitionAudioTask(record, action)
  counts.realTransition += 1
  if (out && out.ok === true) counts.realTransitionOk += 1
  if (fault && fault.target === 'task' && fault.kind === 'begin-reject' && action.type === 'BEGIN_PROCESS' && out && out.ok === true) {
    faultHits.begin += 1
    return { ok: false, errors: [{ code: 'AUDIO_TASK_CONFLICT', path: '$', reason: 'injected begin rejection' }] }
  }
  return out
}
const validateRecord = (record) => {
  counts.validateRecord += 1
  const out = deps.task.validateAudioTaskRecord(record)
  counts.realValidateRecord += 1
  if (out && out.ok === true) counts.realValidateRecordOk += 1
  if (fault && fault.target === 'task' && fault.kind === 'record-validate-reject' && counts.validateRecord >= 2 && out && out.ok === true) {
    faultHits.record += 1
    return { ok: false, errors: [{ code: 'AUDIO_TASK_INVALID_RECORD', path: '$', reason: 'injected final record rejection' }] }
  }
  return out
}
const project = (record) => {
  counts.project += 1
  const out = deps.task.projectAudioTask(record)
  counts.realProject += 1
  if (out && out.ok === true) counts.realProjectOk += 1
  if (fault && fault.target === 'task' && fault.kind === 'projection-reject' && counts.project >= 2 && out && out.ok === true) {
    faultHits.projection += 1
    return { ok: false, errors: [{ code: 'AUDIO_TASK_INVALID_RECORD', path: '$', reason: 'injected final projection rejection' }] }
  }
  return out
}

const exportsByKey = {
  'fixture-input-boundary.mjs': { copyFixtureInput: deps.input.copyFixtureInput, deepFreezeFixtureValue: deps.input.deepFreezeFixtureValue },
  'source-artifacts.mjs': { resolveFixtureTaskSource: wrap('source', deps.source.resolveFixtureTaskSource) },
  'provider-readiness.mjs': { negotiateReadyFixtureProvider: wrap('gate', deps.ready.negotiateReadyFixtureProvider), dispatchReadyRvcFakeOnce: dispatch },
  'provider-dispatch.mjs': { PROVIDER_DISPATCH_ERRORS: deps.dispatch.PROVIDER_DISPATCH_ERRORS },
  'task-contract.mjs': {
    createAudioTaskRecord: wrap('create', deps.task.createAudioTaskRecord),
    projectAudioTask: project,
    transitionAudioTask: transition,
    validateAudioTaskDraft: deps.task.validateAudioTaskDraft,
    validateAudioTaskRecord: validateRecord,
  },
  'rvc-fake-gateway.mjs': { RVC_FAKE_SCENARIOS: deps.gateway.RVC_FAKE_SCENARIOS, validateRvcFakeResult: validateRvc },
  'fixture-wav-producer.mjs': { produceFixtureWav: wrappedProducer },
}
const enginePath = pathToFileURL(base + '/core/audio/task-fixture-engine-internal.mjs').href
const engine = new vm.SourceTextModule(fs.readFileSync(new URL(enginePath), 'utf8'), { identifier: enginePath })
await engine.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  const exp = exportsByKey[url.split('/').pop()]
  if (!exp) throw new Error('unexpected engine import ' + url)
  return new vm.SyntheticModule(Object.keys(exp), function () { for (const k of Object.keys(exp)) this.setExport(k, exp[k]) }, { identifier: url })
})
await engine.evaluate()

const facadePath = pathToFileURL(base + '/core/audio/task-fixture-runner.mjs').href
const facade = new vm.SourceTextModule(fs.readFileSync(new URL(facadePath), 'utf8'), { identifier: facadePath })
await facade.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === enginePath) return engine
  const exp = exportsByKey[url.split('/').pop()]
  if (!exp) throw new Error('unexpected facade import ' + url)
  return new vm.SyntheticModule(Object.keys(exp), function () { for (const k of Object.keys(exp)) this.setExport(k, exp[k]) }, { identifier: url })
})
await facade.evaluate()

if (frameFault === 'accessor-scope') {
  const value = frame.scopeId
  delete frame.scopeId
  Object.defineProperty(frame, 'scopeId', { enumerable: true, configurable: true, get() { getterCalls += 1; return value } })
} else if (frameFault === 'draft-conflict') {
  frame.input.sourceInput.voiceBinding.taskDraft.voiceProfileId = 'voice:fixture-demo-2'
} else if (frameFault === 'invalid-record') {
  frame.record.mockOnly = false
} else if (frameFault === 'rights-block') {
  frame.input.sourceInput.voiceBinding.taskDraft.rights.state = 'UNVERIFIED'
  const created = deps.task.createAudioTaskRecord({ ...frame.input.sourceInput.voiceBinding.taskDraft }, { observedAt: frame.record.observedAt })
  if (!created.ok) throw new Error('rights record creation failed')
  frame.record = created.value
} else if (frameFault === 'saved' || frameFault === 'unknown') {
  const list = frameFault === 'saved'
    ? [{ type: 'BEGIN_PROCESS' }, { type: 'ATTACH_FAKE_ARTIFACT', artifactRef: 'artifact:fixture-doc-output' }, { type: 'MARK_SAVED' }]
    : [{ type: 'BEGIN_PROCESS' }, { type: 'MARK_UNKNOWN' }]
  frame.record = advance(frame.record, list)
  advancedLegal = deps.task.validateAudioTaskRecord(frame.record).ok === true
}

function summarize(out) {
  if (!out || typeof out !== 'object') return null
  const record = out.record || null
  const value = out.result && out.result.ok === true ? out.result.value : null
  return {
    // Raw pre-normalisation observations: undefined, null and an object stay distinguishable.
    rawRecord: {
      hasRecordKey: Object.prototype.hasOwnProperty.call(out, 'record'),
      recordNull: out.record === null,
      recordType: typeof out.record,
    },
    rawProduction: {
      hasProductionKey: Object.prototype.hasOwnProperty.call(out, 'production'),
      productionNull: out.production === null,
      productionType: typeof out.production,
    },
    rootKeys: Object.keys(out),
    rootFrozen: Object.isFrozen(out),
    hasProduction: Object.prototype.hasOwnProperty.call(out, 'production'),
    productionKind: out.production === undefined ? 'undefined' : out.production === null ? 'null' : 'object',
    record,
    recordState: record ? record.state : null,
    recordFrozen: record ? Object.isFrozen(record) : null,
    recordNested: record ? { source: Object.isFrozen(record.source), rights: Object.isFrozen(record.rights), cancel: Object.isFrozen(record.cancel), delivery: Object.isFrozen(record.delivery) } : null,
    result: out.result ? JSON.parse(JSON.stringify(out.result)) : null,
    resultFrozen: out.result ? Object.isFrozen(out.result) : null,
    resultNested: value ? {
      value: Object.isFrozen(value),
      states: Object.isFrozen(value.states),
      task: Object.isFrozen(value.task),
      sourceCheck: Object.isFrozen(value.sourceCheck),
      readiness: Object.isFrozen(value.readiness),
      execution: value.execution ? Object.isFrozen(value.execution) : null,
      dispatch: value.execution && value.execution.dispatch ? Object.isFrozen(value.execution.dispatch) : null,
    } : null,
    errorsFrozen: out.result && out.result.ok === false ? Object.isFrozen(out.result.errors) : null,
    errorsEntryFrozen: out.result && out.result.ok === false ? Object.isFrozen(out.result.errors[0]) : null,
    production: out.production ? {
      keys: Object.keys(out.production),
      byteLength: out.production.bytes.length,
      sha256: out.production.inspection.sha256,
      frozen: Object.isFrozen(out.production),
      inspectionFrozen: Object.isFrozen(out.production.inspection),
      bytesFrozen: Object.isFrozen(out.production.bytes),
      origin: out.production.origin,
      sameBuffer: injectedBuffer === null ? null : out.production.bytes.buffer === injectedBuffer,
    } : null,
  }
}

if (observe) globalThis.Uint8Array = ObservedUint8Array
let out
let reentryOut = null
try {
  if (entry === 'bytes') out = engine.namespace.runExistingFixtureTaskBytesOnce(frame)
  else if (entry === 'existing') out = engine.namespace.runExistingFixtureTaskOnce(frame)
  else if (entry === 'draft') out = engine.namespace.runDraftFixtureTaskOnce(frame.input)
  else out = { result: facade.namespace.runFixtureAudioTaskOnce(frame.input) }
  if (reentry && out && out.record) {
    reentryOut = engine.namespace.runExistingFixtureTaskBytesOnce({ scopeId: frame.scopeId, record: out.record, input: frame.input })
  }
} finally {
  if (observe) globalThis.Uint8Array = RealUint8Array
}

const summary = summarize(out)
if (summary.production && process.env.WV_MUTATE === '1') {
  const before = out.production.bytes[0]
  out.production.bytes[0] = 0
  summary.production.mutatedFrom = before
}
const payload = Object.assign({}, summary, {
  counts,
  actions,
  getterCalls,
  faultHits,
  faultIntegrity,
  advancedLegal,
  observation: {
    enabled: observe,
    outsideViews,
    producerViews: producerViews.length,
    identity: observe && out && out.production ? out.production.bytes === producerViews[0] : null,
  },
  reentry: summarize(reentryOut),
})
process.stdout.write(JSON.stringify(payload))
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
      WV_FRAME_FAULT: scenario.frameFault || '',
      WV_FRAME: JSON.stringify(scenario.frame),
      WV_MUTATE: scenario.mutate ? '1' : '0',
      WV_OBSERVE: scenario.observe ? '1' : '0',
      WV_REENTRY: scenario.reentry ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(output)
}

/* ============================================= D01 ========================================== */

test('D01 real causal chain: one source/gate/dispatch/RVC/producer, one PROCESSING transition, frozen graph', async () => {
  const example = extractExample()
  await withExistingFrame(example, 'key:fixture-d01', async ({ frame }) => {
    const snapshot = clone(frame)
    const before = runWorker({ frame })
    assert.deepEqual(before.counts, {
      source: 1,
      gate: 1,
      dispatch: 1,
      create: 0,
      transition: 1,
      realTransition: 1,
      realTransitionOk: 1,
      validateRecord: 2,
      realValidateRecord: 2,
      realValidateRecordOk: 2,
      project: 2,
      realProject: 2,
      realProjectOk: 2,
      rvc: 1,
      rvcOk: 1,
      producer: 1,
      realProducer: 1,
      realProducerOk: 1,
    })
    assert.deepEqual(before.faultHits, { begin: 0, record: 0, projection: 0 })
    assert.deepEqual(before.actions, ['BEGIN_PROCESS'])
    assertSuccessGraph(before, 'worker success')
    assert.equal(before.production.byteLength, 88244)
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
    assert.equal('record' in result.value, false, 'the private record never leaves through result')

    // The real in-process entry agrees with the worker, keeps the record identity and never mutates
    // the complete input frame (record + input are compared before and after the call).
    const direct = runExistingFixtureTaskBytesOnce(frame)
    assert.deepEqual(frame, snapshot, 'the complete frame must be unchanged by the call')
    assert.deepEqual(Object.keys(direct), ['record', 'result', 'production'])
    assert.equal(Object.isFrozen(direct), true)
    assert.equal(direct.record.state, 'PROCESSING')
    assert.equal(direct.record.taskId, frame.record.taskId)
    assert.equal(direct.record.observedAt, frame.record.observedAt)
    assert.equal(direct.record.outputArtifactRef, null)
    assert.equal(direct.result.value.task.hasOutput, false)
    assert.equal(direct.production.bytes.length, 88244)
    assert.equal(direct.production.inspection.peak, 0)
    assert.equal(direct.production.inspection.fullScaleSampleCount, 0)
    assert.equal(Object.isFrozen(direct.production), true)
    assert.equal(Object.isFrozen(direct.production.inspection), true)
    assert.equal(Object.isFrozen(direct.production.bytes), false, 'non-empty bytes stay writable')

    // The bytes entry owns exactly three fixed codes; the legacy table keeps its fourteen.
    assert.deepEqual(TASK_FIXTURE_BYTES_ERRORS, {
      UNREPRESENTABLE_DURATION: 'TASK_FIXTURE_BYTES_UNREPRESENTABLE_DURATION',
      RESOURCE_LIMIT: 'TASK_FIXTURE_BYTES_RESOURCE_LIMIT',
      DEPENDENCY_FAILURE: 'TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE',
    })
    assert.equal(Object.isFrozen(TASK_FIXTURE_BYTES_ERRORS), true)
    assert.equal(Object.keys(TASK_FIXTURE_ERRORS).length, 14)
  })
})

/* ============================================= D02 ========================================== */

test('D02 five exact duration boundaries plus real output construction observation', async () => {
  const example = extractExample()
  await withExistingFrame(example, 'key:fixture-d02', async ({ frame }) => {
    const cases = [
      { duration: 10, frames: 441, bytes: 926 },
      { duration: 1000, frames: 44100, bytes: 88244 },
      { duration: 11880, frames: 523908, bytes: 1047860 },
    ]
    for (const item of cases) {
      const out = runWorker({ frame: withDuration(frame, item.duration), observe: true })
      assertSuccessGraph(out, 'duration ' + item.duration)
      assert.equal(out.production.byteLength, item.bytes)
      assert.equal(out.counts.producer, 1)
      assert.equal(out.counts.realProducer, 1)
      assert.equal(out.counts.realProducerOk, 1)
      assert.equal(out.counts.transition, 1)
      assert.deepEqual(out.result.value.states, ['CREATED', 'PROCESSING'])
      assert.deepEqual(out.observation, { enabled: true, outsideViews: 0, producerViews: 2, identity: true })
    }
    for (const item of [
      { duration: 1, key: 'UNREPRESENTABLE_DURATION' },
      { duration: 11890, key: 'RESOURCE_LIMIT' },
    ]) {
      const out = runWorker({ frame: withDuration(frame, item.duration), observe: true })
      assertBytesError(out, item.key, 'duration ' + item.duration)
      assert.equal(out.counts.source, 1)
      assert.equal(out.counts.gate, 1)
      assert.equal(out.counts.dispatch, 1, 'the real Fake dispatch already happened once')
      assert.equal(out.counts.rvc, 1)
      assert.equal(out.counts.rvcOk, 1)
      assert.equal(out.counts.producer, 0, 'the duration/budget gate runs before the producer')
      assert.equal(out.counts.transition, 0)
      assert.deepEqual(out.observation, { enabled: true, outsideViews: 0, producerViews: 0, identity: null })
    }
  })
})

/* ============================================= D03 ========================================== */

test('D03 producer protocol and carrier faults: seven failures, four carrier refusals, zero getter', async () => {
  const example = extractExample()
  await withExistingFrame(example, 'key:fixture-d03', async ({ frame }) => {
    for (const kind of ['throw', 'okfalse', 'missing-bytes', 'view-length', 'duration', 'flag', 'accessor']) {
      const out = runWorker({ frame, fault: { target: 'producer', kind } })
      assertBytesError(out, 'DEPENDENCY_FAILURE', kind)
      assert.equal(out.counts.producer, 1, kind)
      assert.equal(out.counts.realProducer, 1, kind)
      assert.equal(out.counts.realProducerOk, 1, kind)
      assert.equal(out.counts.transition, 0, kind)
      assert.equal(out.getterCalls, 0, kind)
      assert.deepEqual(out.actions, [], kind)
      if (kind === 'throw' || kind === 'okfalse') {
        assert.equal(out.faultIntegrity, null, kind)
      } else {
        assert.equal(out.faultIntegrity.rootFrozen, true, kind)
        assert.equal(out.faultIntegrity.valueFrozen, true, kind)
        assert.equal(out.faultIntegrity.inspectionFrozen, true, kind)
        assert.equal(out.faultIntegrity.keys, kind === 'missing-bytes' ? 8 : 9, kind)
      }
    }

    // R2: an Int8Array or a resizable ArrayBuffer carrier is refused at the dependency boundary.
    for (const kind of ['int8', 'resizable']) {
      const out = runWorker({ frame, fault: { target: 'producer', kind } })
      assertBytesError(out, 'DEPENDENCY_FAILURE', kind)
      assert.equal(out.counts.producer, 1, kind)
      assert.equal(out.counts.transition, 0, kind)
      assert.equal(out.getterCalls, 0, kind)
      assert.equal(out.faultIntegrity.valueFrozen, true, kind)
      assert.equal(out.faultIntegrity.bytesFrozen, false, kind)
    }

    // E3/R2: an own byteLength or @@toStringTag getter is installed on the produced ArrayBuffer
    // carrier itself (the original 067 defect), not on the Uint8Array view, and is never executed.
    // The native slots still describe a complete legal carrier, so the chosen strategy accepts it
    // and reaches PROCESSING, including the variants whose getter body would throw.
    for (const kind of ['byte-getter', 'tag-getter', 'byte-getter-throw', 'tag-getter-throw']) {
      const out = runWorker({ frame, fault: { target: 'producer', kind } })
      assertSuccessGraph(out, kind)
      assert.equal(out.getterCalls, 0, kind + ': no own getter may run')
      assert.equal(out.faultIntegrity.injectionLevel, 'buffer', kind)
      assert.equal(out.faultIntegrity.injectedOnBuffer, true, kind)
      assert.equal(out.production.sameBuffer, true, kind + ': the returned bytes keep the same carrier')
      assert.equal(out.counts.producer, 1, kind)
      assert.equal(out.counts.realProducerOk, 1, kind)
      assert.equal(out.counts.transition, 1, kind)
      assert.equal(out.faultIntegrity.valueFrozen, true, kind)
      assert.equal(out.production.byteLength, 88244, kind)
    }

    // E1: the three post-bytes rejections are actually executed here. Each wrapper first performs
    // the single real delegation at its own stage, confirms that real success, and only then
    // replaces that one result with a fixed legal rejection; no stage is delegated twice.
    const e1Cases = [
      {
        kind: 'begin-reject',
        hits: { begin: 1, record: 0, projection: 0 },
        expected: { transition: 1, realTransition: 1, realTransitionOk: 1, validateRecord: 1, realValidateRecord: 1, realValidateRecordOk: 1, project: 1, realProject: 1, realProjectOk: 1 },
      },
      {
        kind: 'record-validate-reject',
        hits: { begin: 0, record: 1, projection: 0 },
        expected: { transition: 1, realTransition: 1, realTransitionOk: 1, validateRecord: 2, realValidateRecord: 2, realValidateRecordOk: 2, project: 1, realProject: 1, realProjectOk: 1 },
      },
      {
        kind: 'projection-reject',
        hits: { begin: 0, record: 0, projection: 1 },
        expected: { transition: 1, realTransition: 1, realTransitionOk: 1, validateRecord: 2, realValidateRecord: 2, realValidateRecordOk: 2, project: 2, realProject: 2, realProjectOk: 2 },
      },
    ]
    for (const item of e1Cases) {
      const out = runWorker({ frame, fault: { target: 'task', kind: item.kind } })
      assertTaskRejected(out, item.kind)
      assert.deepEqual(out.faultHits, item.hits, item.kind)
      assert.equal(out.counts.source, 1, item.kind)
      assert.equal(out.counts.gate, 1, item.kind)
      assert.equal(out.counts.dispatch, 1, item.kind)
      assert.equal(out.counts.rvc, 1, item.kind)
      assert.equal(out.counts.rvcOk, 1, item.kind)
      assert.equal(out.counts.producer, 1, item.kind)
      assert.equal(out.counts.realProducer, 1, item.kind)
      assert.equal(out.counts.realProducerOk, 1, item.kind)
      assert.equal(out.counts.create, 0, item.kind)
      assert.deepEqual(out.actions, ['BEGIN_PROCESS'], item.kind)
      assert.equal(out.counts.transition, item.expected.transition, item.kind)
      for (const key of Object.keys(item.expected)) {
        assert.equal(out.counts[key], item.expected[key], item.kind + ' ' + key)
      }
      assert.equal(out.result.errors[0].reason, 'task transition rejected', item.kind)
    }

    // Control: without a fault the same counts reach PROCESSING, so the counters are active.
    const control = runWorker({ frame })
    assertSuccessGraph(control, 'control')
    assert.deepEqual(control.faultHits, { begin: 0, record: 0, projection: 0 })
    assert.equal(control.counts.transition, 1)
    assert.equal(control.counts.producer, 1)
  })
})

/* ============================================= D04 ========================================== */

test('D04 non-success and legal blocks: full record/result equal the legacy entry, production strictly null', async () => {
  const svc = extractExample()
  await withExistingFrame(svc, 'key:fixture-d04', async ({ frame }) => {
    const scenarios = [
      { name: 'OFFLINE', mutate: (f) => { f.input.context.scenario = 'OFFLINE' }, state: 'FAILED', phase: 'SIMULATED', reason: 'RVC_FAKE_OFFLINE', dispatch: 1, rvc: 1, transition: 2 },
      { name: 'MODEL_MISSING', mutate: (f) => { f.input.context.scenario = 'MODEL_MISSING' }, state: 'FAILED', phase: 'SIMULATED', reason: 'RVC_FAKE_MODEL_NOT_AVAILABLE', dispatch: 1, rvc: 1, transition: 2 },
      { name: 'TIMEOUT', mutate: (f) => { f.input.context.scenario = 'TIMEOUT' }, state: 'UNKNOWN', phase: 'SIMULATED', reason: 'RVC_FAKE_TIMEOUT', dispatch: 1, rvc: 1, transition: 2 },
      { name: 'CANCEL_REQUESTED', mutate: (f) => { f.input.context.scenario = 'CANCEL_REQUESTED' }, state: 'CANCEL_REQUESTED', phase: 'SIMULATED', reason: 'RVC_FAKE_CANCEL_PENDING', dispatch: 1, rvc: 1, transition: 2 },
      { name: 'CANCEL_CONFIRMED', mutate: (f) => { f.input.context.scenario = 'CANCEL_CONFIRMED' }, state: 'CANCELLED', phase: 'SIMULATED', reason: 'RVC_FAKE_CANCELLED', dispatch: 1, rvc: 1, transition: 3 },
      { name: 'UNKNOWN', mutate: (f) => { f.input.context.scenario = 'UNKNOWN' }, state: 'UNKNOWN', phase: 'SIMULATED', reason: 'RVC_FAKE_UNKNOWN', dispatch: 1, rvc: 1, transition: 2 },
      { name: 'SOURCE_BLOCKED', mutate: (f) => { f.input.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT' }, state: 'CREATED', phase: 'BLOCKED', reason: 'TASK_FIXTURE_SOURCE_BLOCKED', dispatch: 0, rvc: 0, transition: 0 },
      { name: 'READINESS_BLOCKED', mutate: (f) => { f.input.readiness.instances[0].installation = 'ABSENT' }, state: 'CREATED', phase: 'BLOCKED', reason: 'TASK_FIXTURE_READINESS_BLOCKED', dispatch: 0, rvc: 0, transition: 0 },
    ]
    for (const item of scenarios) {
      const variant = clone(frame)
      item.mutate(variant)
      const bytesOut = runWorker({ frame: variant })
      const legacyOut = runWorker({ entry: 'existing', frame: variant })
      assertLegacyAgreement(bytesOut, legacyOut, item.name)
      // E2: the existing nine cases also pin the bytes root, the strict nulls, the fixed
      // phase/reason and the absolute call counts instead of only comparing both paths.
      assertBytesRoot(bytesOut, item.name)
      assert.equal(bytesOut.rawProduction.hasProductionKey, true, item.name)
      assert.equal(bytesOut.rawProduction.productionNull, true, item.name)
      assert.equal(bytesOut.rawProduction.productionType, 'object', item.name)
      assert.equal(bytesOut.result.value.phase, item.phase, item.name)
      assert.equal(bytesOut.result.value.reason, item.reason, item.name)
      assert.equal(bytesOut.counts.source, 1, item.name)
      assert.equal(bytesOut.counts.gate, 1, item.name)
      assert.equal(bytesOut.counts.dispatch, item.dispatch, item.name)
      assert.equal(bytesOut.counts.rvc, item.rvc, item.name)
      assert.equal(bytesOut.counts.rvcOk, item.rvc, item.name)
      assert.equal(bytesOut.counts.producer, 0, item.name)
      assert.equal(bytesOut.counts.transition, item.transition, item.name)
      assert.equal(legacyOut.counts.transition, item.transition, item.name)
      assert.equal(bytesOut.recordState, item.state, item.name)
      assert.deepEqual(Object.keys(bytesOut.record).sort(), [
        'cancel',
        'delivery',
        'deliveryRequested',
        'feature',
        'lastError',
        'mockOnly',
        'observedAt',
        'outputArtifactRef',
        'realOperationAllowed',
        'rights',
        'schemaVersion',
        'source',
        'state',
        'taskId',
        'taskType',
        'voiceProfileId',
      ], item.name)
      assert.equal(bytesOut.record.outputArtifactRef, null, item.name)
      assert.deepEqual(Object.keys(bytesOut.record.delivery).sort(), ['deliveryId', 'state'], item.name)
      assert.equal(bytesOut.record.delivery.state, 'NOT_REQUESTED', item.name)
      assert.equal(bytesOut.record.delivery.deliveryId, null, item.name)
      assert.deepEqual(Object.keys(bytesOut.record.cancel).sort(), ['confirmed', 'requested'], item.name)
      assert.equal(typeof bytesOut.record.cancel.requested, 'boolean', item.name)
      assert.equal(typeof bytesOut.record.cancel.confirmed, 'boolean', item.name)
      assert.equal(bytesOut.record.lastError === null || typeof bytesOut.record.lastError === 'object', true, item.name)
      assert.equal(legacyOut.hasProduction, false, item.name + ': the legacy root stays two-key')
    }

    // A legal TTS frame reaches the original TTS gate (not an early failure) and is blocked there.
    const tts = extractExample('## 8.')
    await withExistingFrame(tts, 'key:fixture-d04-tts', async ({ frame: ttsFrame }) => {
      const bytesOut = runWorker({ frame: ttsFrame })
      const legacyOut = runWorker({ entry: 'existing', frame: ttsFrame })
      assertLegacyAgreement(bytesOut, legacyOut, 'TTS')
      assertBytesRoot(bytesOut, 'TTS')
      assert.equal(bytesOut.rawProduction.productionNull, true, 'TTS')
      assert.equal(bytesOut.result.value.phase, 'BLOCKED')
      assert.equal(bytesOut.result.value.reason, 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH')
      assert.equal(bytesOut.counts.source, 1, 'TTS')
      assert.equal(bytesOut.counts.gate, 1, 'TTS')
      assert.equal(bytesOut.counts.dispatch, 0, 'the TTS gate stops before the RVC dispatch')
      assert.equal(bytesOut.counts.rvc, 0, 'TTS')
      assert.equal(bytesOut.counts.transition, 0, 'TTS')
      assert.equal(bytesOut.counts.producer, 0, 'TTS')
      assert.equal(legacyOut.counts.dispatch, 0)
      assert.equal(bytesOut.recordState, 'CREATED')
    })
  })
})

/* ============================================= D05 ========================================== */

test('D05 precheck and non-reentry: accessor, conflict, invalid record, rights, PROCESSING/SAVED/UNKNOWN', async () => {
  const example = extractExample()
  await withExistingFrame(example, 'key:fixture-d05', async ({ frame }) => {
    const badFrames = [
      { frame: { ...clone(frame), extra: true }, path: '<unknown-key>' },
      { frame: (() => { const copy = clone(frame); delete copy.input; return copy })(), path: '$' },
      { frame: (() => { const copy = clone(frame); copy.scopeId = 'scope:fixture-other'; return copy })(), path: '$' },
    ]
    for (const item of badFrames) {
      const out = runWorker({ frame: item.frame })
      assertBytesRoot(out, 'bad frame')
      assert.equal(out.productionKind, 'null', 'bad frame')
      assert.equal(out.rawRecord.recordNull, true, 'bad frame: original record is strictly null')
      assert.equal(out.rawProduction.productionNull, true, 'bad frame')
      assert.equal(out.result.ok, false, 'bad frame')
      assert.equal(out.result.errors[0].code, TASK_FIXTURE_ERRORS.INVALID_INPUT, 'bad frame')
      assert.equal(out.result.errors[0].path, item.path, 'bad frame')
      assert.equal(out.counts.dispatch, 0, 'bad frame')
      assert.equal(out.counts.producer, 0, 'bad frame')
      assert.equal(out.counts.transition, 0, 'bad frame')
    }

    // An accessor frame is rejected without running its getter. The frame is built inside the
    // worker, i.e. in the same context as the call, so JSON serialisation cannot drop the getter.
    const accessor = runWorker({ frame, frameFault: 'accessor-scope' })
    assert.equal(accessor.result.ok, false)
    assert.equal(accessor.result.errors[0].code, TASK_FIXTURE_ERRORS.INVALID_INPUT)
    assert.equal(accessor.result.errors[0].path, '$')
    assert.equal(accessor.rawRecord.recordNull, true)
    assert.equal(accessor.getterCalls, 0, 'no frame accessor may be invoked')
    assert.equal(accessor.counts.dispatch, 0)
    assert.equal(accessor.counts.producer, 0)

    // A draft that is still legal but conflicts with the record's identity domain is refused; the
    // exact INVALID_INPUT code (not SOURCE_INPUT_INVALID) proves the draft itself validated.
    const conflict = runWorker({ frame, frameFault: 'draft-conflict' })
    assert.equal(conflict.result.ok, false)
    assert.equal(conflict.result.errors[0].code, TASK_FIXTURE_ERRORS.INVALID_INPUT)
    assert.equal(conflict.result.errors[0].path, '$')
    assert.equal(conflict.rawRecord.recordNull, true)
    assert.equal(conflict.counts.dispatch, 0)
    assert.equal(conflict.counts.producer, 0)
    assert.equal(conflict.counts.transition, 0)

    // A complete record that is itself illegal is refused before the flow.
    const invalid = runWorker({ frame, frameFault: 'invalid-record' })
    assert.equal(invalid.result.ok, false)
    assert.equal(invalid.result.errors[0].code, TASK_FIXTURE_ERRORS.INVALID_INPUT)
    assert.equal(invalid.result.errors[0].path, '$')
    assert.equal(invalid.rawRecord.recordNull, true)
    assert.equal(invalid.counts.dispatch, 0)
    assert.equal(invalid.counts.producer, 0)

    // Representative of the current rights gate: a legal BLOCKED_RIGHTS record whose draft also
    // declares UNVERIFIED rights. The source association blocks it first (the shared flow's
    // `BLOCKED_RIGHTS` fallback needs a source-linked record, which an UNVERIFIED draft can never
    // produce; a CONFIRMED draft with a BLOCKED_RIGHTS record fails the identity domain first,
    // covered by the conflict case above). dispatch/producer stay at zero.
    const rights = runWorker({ frame, frameFault: 'rights-block' })
    assert.equal(rights.result.ok, true)
    assert.equal(rights.result.value.phase, 'BLOCKED')
    assert.equal(rights.result.value.reason, TASK_FIXTURE_ERRORS.SOURCE_BLOCKED)
    assert.equal(rights.recordState, 'BLOCKED_RIGHTS')
    assert.equal(rights.productionKind, 'null')
    assert.equal(rights.counts.dispatch, 0)
    assert.equal(rights.counts.producer, 0)
    assert.equal(rights.counts.transition, 0)

    // PROCESSING re-entry uses the real record returned by this run's own success.
    const reentry = runWorker({ frame, reentry: true })
    assertSuccessGraph(reentry, 'first call')
    assert.equal(reentry.counts.producer, 1)
    assert.equal(reentry.counts.dispatch, 1)
    assert.equal(reentry.reentry.result.ok, false)
    assert.equal(reentry.reentry.result.errors[0].code, TASK_FIXTURE_ERRORS.TASK_TRANSITION_REJECTED)
    assert.equal(reentry.reentry.result.errors[0].path, '$')
    assert.equal(reentry.reentry.recordState, null)
    assert.equal(reentry.reentry.rawRecord.recordNull, true)
    assert.equal(reentry.reentry.productionKind, 'null')
    assert.deepEqual(reentry.reentry.rootKeys, ['record', 'result', 'production'])
    assert.equal(reentry.counts.producer, 1, 'no second producer call on re-entry')
    assert.equal(reentry.counts.dispatch, 1, 'no second dispatch on re-entry')

    // SAVED and UNKNOWN are proven legal through the original validator before the refusal.
    for (const frameFault of ['saved', 'unknown']) {
      const out = runWorker({ frame, frameFault })
      assert.equal(out.advancedLegal, true, frameFault + ': the constructed record must be legal')
      assert.equal(out.result.ok, false, frameFault)
      assert.equal(out.result.errors[0].code, TASK_FIXTURE_ERRORS.TASK_TRANSITION_REJECTED, frameFault)
      assert.equal(out.result.errors[0].path, '$', frameFault)
      assert.equal(out.productionKind, 'null', frameFault)
      assert.equal(out.counts.dispatch, 0, frameFault)
      assert.equal(out.counts.producer, 0, frameFault)
      assert.equal(out.counts.transition, 0, frameFault)
    }
  })
})

/* ============================================= D06 ========================================== */

test('D06 memory and private boundary: frozen root, mutable independent bytes, no record leak to facade', async () => {
  const example = extractExample()
  await withExistingFrame(example, 'key:fixture-d06', async ({ frame }) => {
    const out = runWorker({ frame, mutate: true })
    assertSuccessGraph(out, 'mutation')
    assert.equal(out.production.mutatedFrom, 0x52, 'bytes stay writable; byte 0 is the RIFF R')

    const first = runExistingFixtureTaskBytesOnce(frame)
    const second = runExistingFixtureTaskBytesOnce(clone(frame))
    assert.notEqual(first.production.bytes, second.production.bytes)
    assert.notEqual(first.production.bytes.buffer, second.production.bytes.buffer)
    first.production.bytes[0] = 0
    assert.equal(second.production.bytes[0], 0x52)
    assert.equal(first.record.state, 'PROCESSING')
    assert.equal(first.result.value.task.hasOutput, false)

    const facadeOut = runWorker({ entry: 'public', frame })
    assert.deepEqual(facadeOut.rootKeys, ['result'])
    assert.equal('record' in facadeOut.result.value, false)
    assert.equal('production' in facadeOut.result.value, false)
  })
})

/* ============================================= D07 ========================================== */

test('D07 legacy paths stay byte-free and the documented complete frame runs as written', async () => {
  const example = extractExample()
  await withExistingFrame(example, 'key:fixture-d07', async ({ frame }) => {
    for (const entry of ['existing', 'draft', 'public']) {
      const out = runWorker({ entry, frame })
      assert.equal(out.counts.producer, 0, entry)
      assert.equal(out.result.ok, true, entry)
    }
  })

  const doc = fs.readFileSync(new URL('../docs/TASK_FIXTURE_RECORD_INTERNAL.md', import.meta.url), 'utf8')
  const section = doc.indexOf('## 12.')
  assert.ok(section >= 0, 'the internal doc must document the bytes entry')
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

  const frameBlock = blocks.find((block) => block.name === 'bytes-frame')
  assert.ok(frameBlock, 'the doc must contain a complete executable frame')
  assert.equal(typeof frameBlock.scopeId, 'string')
  assert.equal(typeof frameBlock.record, 'object')
  assert.equal(typeof frameBlock.input, 'object')
  assert.equal(Object.keys(frameBlock.record).length, 16)
  const docFrame = { scopeId: frameBlock.scopeId, record: frameBlock.record, input: frameBlock.input }
  const out = runWorker({ frame: docFrame })
  assertSuccessGraph(out, 'documented frame')
  assert.equal(out.production.byteLength, 88244)
  assert.deepEqual(out.result.value.states, ['CREATED', 'PROCESSING'])

  const variants = blocks.filter((block) => block.from === 'bytes-frame')
  assert.deepEqual(variants.map((block) => block.name).sort(), [
    'bytes-refused-budget',
    'bytes-refused-unrepresentable',
    'bytes-success',
  ])
  for (const block of variants) {
    const variantOut = runWorker({ frame: withDuration(docFrame, block.durationMs) })
    if (block.expect === 'PROCESSING') {
      assertSuccessGraph(variantOut, block.name)
      assert.equal(variantOut.production.byteLength, block.byteLength, block.name)
    } else {
      assertBytesError(variantOut, block.expect, block.name)
    }
  }

  // The bytes entry does not touch the public artifact library: no pack is created in the sandbox.
  await withExistingFrame(example, 'key:fixture-d07b', async ({ sandbox, frame }) => {
    const before = fs.readdirSync(sandbox.root).sort()
    const direct = runExistingFixtureTaskBytesOnce(frame)
    assert.equal(direct.result.ok, true)
    assert.deepEqual(fs.readdirSync(sandbox.root).sort(), before)
    const opened = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(opened.ok, true, 'the E-B library still opens independently')
  })
})
