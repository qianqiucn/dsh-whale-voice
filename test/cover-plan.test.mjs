/* Whale Voice — pure Fixture cover stage planner tests (Plan 08-F-A, OFFLINE / PLAN_ONLY).
 *
 * The suite drives the real public `planFixtureCover` on the real source resolver. The only wrapped
 * test path (dependency call counting / bad protocol) runs the real resolver first through a VM
 * facade in a child process and never replaces it with a fabricated success.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

import {
  COVER_PLAN_CODES,
  COVER_PLAN_LIMITS,
  COVER_PLAN_SCHEMA_VERSION,
  planFixtureCover,
} from '../core/audio/cover-plan.mjs'

const BASE = new URL('../core/audio/', import.meta.url).href
const RUNNER_DOC = new URL('../docs/TASK_FIXTURE_RUNNER_OFFLINE.md', import.meta.url)
const COVER_DOC = new URL('../docs/COVER_PLAN_OFFLINE.md', import.meta.url)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function docExamples(file, heading) {
  const doc = fs.readFileSync(file, 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, 'missing doc heading ' + heading)
  const blocks = []
  let cursor = at
  const next = () => {
    const fence = doc.indexOf('```json', cursor)
    assert.ok(fence >= 0)
    const close = doc.indexOf('```', fence + 7)
    assert.ok(close > fence)
    blocks.push(JSON.parse(doc.slice(fence + 7, close).trim()))
    cursor = close + 3
  }
  return { blocks, next }
}

function runnerSource(heading) {
  const { blocks, next } = docExamples(RUNNER_DOC, heading)
  next()
  return blocks[0].sourceInput
}

const SVC_SOURCE = runnerSource('## 7.')
const TTS_SOURCE = runnerSource('## 8.')

function recipe(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceLayout: 'MIXED',
    separationPreset: 'FIXTURE_TWO_STEM',
    mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 },
    ...overrides,
  }
}

function capabilities(overrides = {}) {
  return { schemaVersion: 1, separator: 'AVAILABLE_FIXTURE', mixer: 'AVAILABLE_FIXTURE', ...overrides }
}

function payload(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceInput: clone(SVC_SOURCE),
    recipe: recipe(),
    capabilities: capabilities(),
    ...overrides,
  }
}

const VALUE_KEYS = [
  'schemaVersion',
  'decision',
  'reason',
  'dependencyReason',
  'messageZh',
  'association',
  'recipe',
  'stages',
  'outputSlot',
  'outputArtifactRef',
  'taskAuthority',
  'mockOnly',
  'realOperationAllowed',
  'submitAllowed',
  'automaticRetryAllowed',
]
const ASSOCIATION_KEYS = [
  'taskId',
  'scopeId',
  'voiceProfileId',
  'profileRevision',
  'modelAssetId',
  'modelRevision',
  'instanceId',
  'candidateId',
  'modelId',
  'sourceRef',
  'sourceRevision',
]
const CODE_KEYS = [
  'INVALID_INPUT',
  'RESOURCE_LIMIT',
  'UNSUPPORTED_VERSION',
  'INVALID_RECIPE',
  'INVALID_CAPABILITIES',
  'SOURCE_INVALID',
  'DEPENDENCY_FAILURE',
  'SOURCE_BLOCKED',
  'UNSUPPORTED_TASK',
  'SEPARATION_UNAVAILABLE',
  'SEPARATION_UNKNOWN',
  'MIXING_UNAVAILABLE',
  'MIXING_UNKNOWN',
  'INSTRUMENTAL_MISSING',
]

function expectError(result, key, errorPath) {
  assert.equal(result.ok, false, JSON.stringify(result).slice(0, 300))
  assert.equal(Object.keys(result).length, 2)
  assert.equal(result.errors.length, 1)
  assert.deepEqual(Object.keys(result.errors[0]), ['code', 'path', 'reason'])
  assert.equal(result.errors[0].code, COVER_PLAN_CODES[key])
  assert.equal(result.errors[0].path, errorPath)
  assert.equal(result.value, undefined)
}

function expectBlocked(result, key) {
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300))
  assert.deepEqual(Object.keys(result), ['ok', 'value'])
  const value = result.value
  assert.deepEqual(Object.keys(value), VALUE_KEYS)
  assert.equal(value.schemaVersion, COVER_PLAN_SCHEMA_VERSION)
  assert.equal(value.decision, 'BLOCKED')
  assert.equal(value.reason, COVER_PLAN_CODES[key])
  assert.equal(value.association, null)
  assert.equal(value.recipe, null)
  assert.deepEqual(value.stages, [])
  assert.equal(value.outputSlot, null)
  assert.equal(value.outputArtifactRef, null)
  assert.equal(value.taskAuthority, 'UNVERIFIED')
  assert.equal(value.mockOnly, true)
  assert.equal(value.realOperationAllowed, false)
  assert.equal(value.submitAllowed, false)
  assert.equal(value.automaticRetryAllowed, false)
  return value
}

function expectPlanned(result, stageCount, checkFrozen = true) {
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400))
  const value = result.value
  assert.deepEqual(Object.keys(value), VALUE_KEYS)
  assert.equal(value.decision, 'PLANNED')
  assert.equal(value.reason, null)
  assert.equal(value.dependencyReason, null)
  assert.equal(value.messageZh, '已生成演示翻唱阶段计划；尚未分离、转换、混音、校验或保存音频。')
  assert.deepEqual(Object.keys(value.association), ASSOCIATION_KEYS)
  assert.deepEqual(Object.keys(value.recipe), [
    'schemaVersion',
    'sourceLayout',
    'separationPreset',
    'mixConfig',
    'pitchShift',
  ])
  assert.deepEqual(Object.keys(value.recipe.mixConfig), ['mode', 'vocalGainDb', 'instrumentalGainDb'])
  assert.equal(value.stages.length, stageCount)
  for (const stage of value.stages) {
    assert.deepEqual(Object.keys(stage), ['stage', 'inputs', 'outputs'])
  }
  assert.equal(value.outputSlot, 'VERIFIED_MASTER')
  assert.equal(value.outputArtifactRef, null)
  assert.equal(value.taskAuthority, 'UNVERIFIED')
  assert.equal(value.mockOnly, true)
  assert.equal(value.realOperationAllowed, false)
  assert.equal(value.submitAllowed, false)
  assert.equal(value.automaticRetryAllowed, false)
  if (checkFrozen) {
    assert.equal(Object.isFrozen(value), true)
    assert.equal(Object.isFrozen(value.association), true)
    assert.equal(Object.isFrozen(value.recipe), true)
    assert.equal(Object.isFrozen(value.stages), true)
    for (const stage of value.stages) assert.equal(Object.isFrozen(stage), true)
  }
  return value
}

/* ---------------------------------------------------------------- exports */

test('F01 the module exposes exactly the four frozen planner exports', () => {
  assert.equal(COVER_PLAN_SCHEMA_VERSION, 1)
  assert.deepEqual(Object.keys(COVER_PLAN_LIMITS), [
    'minPitchShift',
    'maxPitchShift',
    'minGainDb',
    'maxGainDb',
    'maxStages',
  ])
  assert.deepEqual(COVER_PLAN_LIMITS, {
    minPitchShift: -12,
    maxPitchShift: 12,
    minGainDb: -24,
    maxGainDb: 12,
    maxStages: 4,
  })
  assert.equal(Object.isFrozen(COVER_PLAN_LIMITS), true)
  assert.deepEqual(Object.keys(COVER_PLAN_CODES), CODE_KEYS)
  for (const key of CODE_KEYS) assert.equal(COVER_PLAN_CODES[key], 'COVER_PLAN_' + key)
  assert.equal(Object.isFrozen(COVER_PLAN_CODES), true)
  assert.equal(typeof planFixtureCover, 'function')
})

/* --------------------------------------------------------------- protocol */

test('F01 protocol failures keep the fixed one-error shape and never echo the payload', () => {
  expectError(planFixtureCover({ ...payload(), extra: 1 }), 'INVALID_INPUT', '<unknown-key>')
  const missing = payload()
  delete missing.capabilities
  expectError(planFixtureCover(missing), 'INVALID_INPUT', '$')
  expectError(planFixtureCover(null), 'INVALID_INPUT', '$')
  expectError(planFixtureCover([]), 'INVALID_INPUT', '$')
  expectError(planFixtureCover({ ...payload(), schemaVersion: 2 }), 'UNSUPPORTED_VERSION', 'schemaVersion')
  expectError(planFixtureCover({ ...payload(), schemaVersion: '1' }), 'UNSUPPORTED_VERSION', 'schemaVersion')
  expectError(
    planFixtureCover(payload({ recipe: { ...recipe(), schemaVersion: 2 } })),
    'UNSUPPORTED_VERSION',
    'recipe.schemaVersion',
  )
  expectError(
    planFixtureCover(payload({ capabilities: { ...capabilities(), schemaVersion: 2 } })),
    'UNSUPPORTED_VERSION',
    'capabilities.schemaVersion',
  )
})

test('F01 recipe and capability rules are strict and do not silently normalise', () => {
  const badRecipes = [
    { ...recipe(), sourceLayout: 'CLEAN' },
    { ...recipe(), separationPreset: 'NONE' },
    { ...recipe(), sourceLayout: 'CLEAN_VOCAL', separationPreset: 'FIXTURE_TWO_STEM' },
    { ...recipe(), mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: 0 } },
    { ...recipe(), mixConfig: { mode: 'STEREO', vocalGainDb: 0, instrumentalGainDb: 0 } },
    { ...recipe(), mixConfig: { mode: 'VOCAL_ONLY', vocalGainDb: 0, instrumentalGainDb: 3 } },
    { ...recipe(), mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: 12.5, instrumentalGainDb: 0 } },
    { ...recipe(), mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: -24.5, instrumentalGainDb: 0 } },
    { ...recipe(), mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: '0', instrumentalGainDb: 0 } },
    { ...recipe(), extra: true },
    { schemaVersion: 1, sourceLayout: 'MIXED', mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 } },
  ]
  for (const bad of badRecipes) expectError(planFixtureCover(payload({ recipe: bad })), 'INVALID_RECIPE', 'recipe')
  const badCaps = [
    { ...capabilities(), separator: 'READY' },
    { ...capabilities(), mixer: true },
    { ...capabilities(), extra: false },
    { schemaVersion: 1, mixer: 'AVAILABLE_FIXTURE' },
  ]
  for (const bad of badCaps) {
    expectError(planFixtureCover(payload({ capabilities: bad })), 'INVALID_CAPABILITIES', 'capabilities')
  }
  const good = planFixtureCover(
    payload({ recipe: recipe({ mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: -24, instrumentalGainDb: 12 } }) }),
  )
  const value = expectPlanned(good, 4)
  assert.equal(value.recipe.mixConfig.vocalGainDb, -24)
  assert.equal(value.recipe.mixConfig.instrumentalGainDb, 12)
})

test('F01 the original safe copy rejects accessors, symbols, holes, non-finite values and over-budget roots', () => {
  let getterCalls = 0
  const accessor = payload()
  Object.defineProperty(accessor, 'recipe', {
    enumerable: true,
    get() {
      getterCalls += 1
      return recipe()
    },
  })
  expectError(planFixtureCover(accessor), 'INVALID_INPUT', '$')
  assert.equal(getterCalls, 0)

  const symbol = payload()
  symbol[Symbol('secret')] = 1
  expectError(planFixtureCover(symbol), 'INVALID_INPUT', '$')

  const hole = payload()
  hole.sourceInput.artifactLibrary.artifacts = new Array(1)
  expectError(planFixtureCover(hole), 'INVALID_INPUT', '$')

  const nonFinite = payload({ recipe: recipe({ mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: NaN, instrumentalGainDb: 0 } }) })
  expectError(planFixtureCover(nonFinite), 'INVALID_INPUT', '$')

  const big = payload()
  big.sourceInput.fat = new Array(300).fill(0)
  expectError(planFixtureCover(big), 'RESOURCE_LIMIT', '$')
})

test('F01 the caller payload is not modified and repeated calls are deterministic', () => {
  const first = payload()
  const snapshot = JSON.stringify(first)
  const a = planFixtureCover(first)
  const b = planFixtureCover(first)
  expectPlanned(a, 4)
  expectPlanned(b, 4)
  assert.equal(JSON.stringify(first), snapshot)
  assert.notEqual(a.value, b.value)
  assert.notEqual(a.value.association, b.value.association)
  assert.deepEqual(a.value, b.value)
})

/* ----------------------------------------------------------------- routes */

test('F03 the default mixed plan yields the frozen four-stage graph', () => {
  const value = expectPlanned(planFixtureCover(payload()), 4)
  assert.deepEqual(value.association, {
    taskId: 'task:demo-svc',
    scopeId: 'scope:fixture-demo',
    voiceProfileId: 'voice:demo-hero',
    profileRevision: 1,
    modelAssetId: 'asset:fixture-model-a',
    modelRevision: 1,
    instanceId: 'instance:rvc',
    candidateId: 'rvc',
    modelId: 'rvc-model:fixture-a',
    sourceRef: 'artifact:fixture-source-1',
    sourceRevision: 1,
  })
  assert.equal(value.recipe.pitchShift, 0)
  assert.equal(value.recipe.sourceLayout, 'MIXED')
  assert.deepEqual(value.stages, [
    { stage: 'SEPARATING', inputs: ['SOURCE'], outputs: ['VOCAL', 'INSTRUMENTAL'] },
    { stage: 'CONVERTING', inputs: ['VOCAL'], outputs: ['CONVERTED_VOCAL'] },
    { stage: 'MIXING', inputs: ['CONVERTED_VOCAL', 'INSTRUMENTAL'], outputs: ['MASTER'] },
    { stage: 'VERIFYING', inputs: ['MASTER'], outputs: ['VERIFIED_MASTER'] },
  ])
})

test('F03 mixed vocal-only keeps the separator stage and drops the instrumental input', () => {
  const value = expectPlanned(
    planFixtureCover(payload({ recipe: recipe({ mixConfig: { mode: 'VOCAL_ONLY', vocalGainDb: 0, instrumentalGainDb: 0 } }) })),
    4,
  )
  assert.deepEqual(value.stages[2], { stage: 'MIXING', inputs: ['CONVERTED_VOCAL'], outputs: ['MASTER'] })
})

test('F03 clean-vocal yields exactly three stages and ignores the separator state', () => {
  const clean = recipe({
    sourceLayout: 'CLEAN_VOCAL',
    separationPreset: 'NONE',
    mixConfig: { mode: 'VOCAL_ONLY', vocalGainDb: 0, instrumentalGainDb: 0 },
  })
  const value = expectPlanned(planFixtureCover(payload({ recipe: clean, capabilities: capabilities({ separator: 'UNKNOWN' }) })), 3)
  assert.deepEqual(value.stages, [
    { stage: 'CONVERTING', inputs: ['SOURCE'], outputs: ['CONVERTED_VOCAL'] },
    { stage: 'MIXING', inputs: ['CONVERTED_VOCAL'], outputs: ['MASTER'] },
    { stage: 'VERIFYING', inputs: ['MASTER'], outputs: ['VERIFIED_MASTER'] },
  ])
})

test('F03 recipe routing rejects before capability availability', () => {
  const cleanWithInstrumental = recipe({
    sourceLayout: 'CLEAN_VOCAL',
    separationPreset: 'NONE',
    mixConfig: { mode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 },
  })
  const value = expectBlocked(
    planFixtureCover(
      payload({ recipe: cleanWithInstrumental, capabilities: capabilities({ separator: 'UNKNOWN', mixer: 'UNAVAILABLE' }) }),
    ),
    'INSTRUMENTAL_MISSING',
  )
  assert.equal(value.dependencyReason, null)
  assert.equal(value.messageZh, '清唱源未提供伴奏，不能规划带伴奏混音；请选择仅人声。')
})

test('F03 capability priority: separator before mixer for mixed, mixer only for clean', () => {
  expectBlocked(
    planFixtureCover(payload({ capabilities: capabilities({ separator: 'UNAVAILABLE', mixer: 'UNKNOWN' }) })),
    'SEPARATION_UNAVAILABLE',
  )
  expectBlocked(
    planFixtureCover(payload({ capabilities: capabilities({ separator: 'UNKNOWN', mixer: 'UNAVAILABLE' }) })),
    'SEPARATION_UNKNOWN',
  )
  const clean = recipe({
    sourceLayout: 'CLEAN_VOCAL',
    separationPreset: 'NONE',
    mixConfig: { mode: 'VOCAL_ONLY', vocalGainDb: 0, instrumentalGainDb: 0 },
  })
  expectBlocked(
    planFixtureCover(payload({ recipe: clean, capabilities: capabilities({ separator: 'UNAVAILABLE', mixer: 'UNKNOWN' }) })),
    'MIXING_UNKNOWN',
  )
  expectBlocked(
    planFixtureCover(payload({ recipe: clean, capabilities: capabilities({ separator: 'UNKNOWN', mixer: 'UNAVAILABLE' }) })),
    'MIXING_UNAVAILABLE',
  )
})

test('F02 a legal TTS source returns UNSUPPORTED_TASK with the blocked envelope', () => {
  const value = expectBlocked(planFixtureCover(payload({ sourceInput: clone(TTS_SOURCE) })), 'UNSUPPORTED_TASK')
  assert.equal(value.dependencyReason, null)
})

test('F02 source blocks win over task, recipe and capability routing', () => {
  const absent = payload({ capabilities: capabilities({ separator: 'UNAVAILABLE', mixer: 'UNAVAILABLE' }) })
  absent.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
  const value = expectBlocked(planFixtureCover(absent), 'SOURCE_BLOCKED')
  assert.equal(value.dependencyReason, 'SOURCE_ARTIFACT_SOURCE_MISSING')
  assert.equal(value.messageZh, '所选演示源或音色目前不可用；请重新核对，系统不会自动替换或重试。')

  const revoked = payload()
  revoked.sourceInput.artifactLibrary.artifacts[0].rightsState = 'REVOKED'
  assert.equal(expectBlocked(planFixtureCover(revoked), 'SOURCE_BLOCKED').dependencyReason, 'SOURCE_ARTIFACT_SOURCE_RIGHTS_UNCONFIRMED')

  const pitch = payload()
  pitch.sourceInput.voiceBinding.negotiation.request.pitchShift = 13
  assert.equal(expectBlocked(planFixtureCover(pitch), 'SOURCE_BLOCKED').dependencyReason, 'SOURCE_ARTIFACT_VOICE_BINDING_BLOCKED')

  const revision = payload()
  revision.sourceInput.sourceRevision = 2
  assert.equal(expectBlocked(planFixtureCover(revision), 'SOURCE_BLOCKED').dependencyReason, 'SOURCE_ARTIFACT_SOURCE_REVISION_MISMATCH')
})

test('F01 pitch boundaries come from the accepted request and are never normalised', () => {
  for (const pitch of [-12, 0, 12]) {
    const input = payload()
    input.sourceInput.voiceBinding.negotiation.request.pitchShift = pitch
    const value = expectPlanned(planFixtureCover(input), 4)
    assert.equal(value.recipe.pitchShift, pitch)
  }
  for (const pitch of [13, -13, 1.5, '0']) {
    const input = payload()
    input.sourceInput.voiceBinding.negotiation.request.pitchShift = pitch
    assert.equal(expectBlocked(planFixtureCover(input), 'SOURCE_BLOCKED').reason, COVER_PLAN_CODES.SOURCE_BLOCKED)
  }
})

/* ---------------------------------------------------------------- worker */

const COVER_WORKER = String.raw`
import vm from 'node:vm'
import fsReal from 'node:fs'

const base = process.env.COVER_BASE
const scenario = JSON.parse(process.env.COVER_SCENARIO)
const payload = JSON.parse(process.env.COVER_PAYLOAD)
const real = await import(new URL('source-artifacts.mjs', base).href)
const boundary = await import(new URL('fixture-input-boundary.mjs', base).href)
const counts = { calls: 0, getters: 0 }

const synth = (url, ns) => new vm.SyntheticModule(Object.keys(ns), function () {
  for (const key of Object.keys(ns)) this.setExport(key, ns[key])
}, { identifier: url })

const sourceModule = new vm.SyntheticModule(Object.keys(real), function () {
  for (const key of Object.keys(real)) {
    if (key === 'resolveFixtureTaskSource') continue
    this.setExport(key, real[key])
  }
  this.setExport('resolveFixtureTaskSource', (input) => {
    counts.calls += 1
    const result = real.resolveFixtureTaskSource(input)
    if (scenario.mode === 'throw') throw new Error('injected dependency throw')
    if (scenario.mode === 'proxy-prototype') {
      return new Proxy(result, {
        getPrototypeOf() {
          throw new Error('injected proxy prototype')
        },
      })
    }
    if (!result.ok) {
      if (scenario.mode === 'failed-error-getter') {
        // 089-R01/B: reproduce the original bug shape — an own getter at the errors array index 0,
        // which a bare errors[0] read would have executed exactly once.
        const original = result.errors[0]
        const errors = new Array(1)
        Object.defineProperty(errors, 0, {
          enumerable: true,
          get() {
            counts.getters += 1
            return original
          },
        })
        return { ok: false, errors }
      }
      return result
    }
    if (scenario.mode === 'control') return result
    const value = { ...result.value }
    if (scenario.mode === 'accessor') {
      Object.defineProperty(value, 'decision', {
        enumerable: true,
        get() {
          counts.getters += 1
          return result.value.decision
        },
      })
      return { ok: true, value }
    }
    if (scenario.mode === 'bad-shape') return { ok: true, value: { ...value, extra: true } }
    if (scenario.mode === 'mismatch') {
      const voiceBinding = { ...value.voiceBinding, binding: { ...value.voiceBinding.binding, instanceId: 'instance:other' } }
      return { ok: true, value: { ...value, voiceBinding } }
    }
    if (scenario.mode === 'budget-message') {
      const provider = { ...value.voiceBinding.provider, messageZh: 'x'.repeat(8193) }
      const voiceBinding = { ...value.voiceBinding, provider }
      return { ok: true, value: { ...value, voiceBinding } }
    }
    if (scenario.mode === 'provider-extra') {
      const provider = { ...value.voiceBinding.provider, descriptionForAudit: 'safe demo description' }
      const voiceBinding = { ...value.voiceBinding, provider }
      return { ok: true, value: { ...value, voiceBinding } }
    }
    if (scenario.mode === 'provider-minimal') {
      const provider = {
        category: value.voiceBinding.provider.category,
        instanceId: value.voiceBinding.provider.instanceId,
        candidateId: value.voiceBinding.provider.candidateId,
      }
      const voiceBinding = { ...value.voiceBinding, provider }
      return { ok: true, value: { ...value, voiceBinding } }
    }
    if (scenario.mode === 'provider-null-message') {
      const provider = { ...value.voiceBinding.provider, messageZh: null }
      const voiceBinding = { ...value.voiceBinding, provider }
      return { ok: true, value: { ...value, voiceBinding } }
    }
    if (scenario.mode === 'blocked-getter') {
      if (value.decision !== 'BLOCKED') return result
      const voiceBinding = { ...value.voiceBinding }
      Object.defineProperty(voiceBinding, 'taskId', {
        enumerable: true,
        get() {
          counts.getters += 1
          return 'task:demo-svc'
        },
      })
      return { ok: true, value: { ...value, voiceBinding } }
    }
    if (scenario.mode === 'failed-envelope') {
      return { ok: false, errors: [{ code: 'SOURCE_ARTIFACT_INVALID_INPUT', path: '$', reason: 'invalid input' }] }
    }
    return result
  })
}, { identifier: new URL('source-artifacts.mjs', base).href })

const boundaryModule = synth(new URL('fixture-input-boundary.mjs', base).href, boundary)
const moduleUrl = new URL('cover-plan.mjs', base).href
const module = new vm.SourceTextModule(fsReal.readFileSync(new URL(moduleUrl), 'utf8'), { identifier: moduleUrl })
await module.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === new URL('source-artifacts.mjs', base).href) return sourceModule
  if (url === new URL('fixture-input-boundary.mjs', base).href) return boundaryModule
  return synth(url, await import(url))
})
await module.evaluate()
const result = module.namespace.planFixtureCover(payload)
console.log(JSON.stringify({ counts, result }))
`

function runCoverWorker(scenario, input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-cover-worker-'))
  const file = path.join(dir, 'worker.mjs')
  fs.writeFileSync(file, COVER_WORKER)
  try {
    const output = execFileSync(process.execPath, ['--experimental-vm-modules', file], {
      env: {
        ...process.env,
        COVER_BASE: BASE,
        COVER_SCENARIO: JSON.stringify(scenario),
        COVER_PAYLOAD: JSON.stringify(input),
      },
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
    return JSON.parse(output.trim())
  } catch (error) {
    throw new Error('cover worker failed: ' + String(error.stderr || error.message).slice(0, 2000))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('F02 the real resolver is delegated exactly once and the control plans', () => {
  const worker = runCoverWorker({ mode: 'control' }, payload())
  assert.equal(worker.counts.calls, 1)
  assert.equal(worker.result.ok, true, JSON.stringify(worker.result).slice(0, 400))
  expectPlanned(worker.result, 4, false)
})

test('F02 dependency throw, accessor and consumed-field mismatch are DEPENDENCY_FAILURE with getter 0', () => {
  const thrown = runCoverWorker({ mode: 'throw' }, payload())
  assert.equal(thrown.counts.calls, 1)
  expectError(thrown.result, 'DEPENDENCY_FAILURE', 'sourceInput')

  const accessor = runCoverWorker({ mode: 'accessor' }, payload())
  assert.equal(accessor.counts.calls, 1)
  assert.equal(accessor.counts.getters, 0)
  expectError(accessor.result, 'DEPENDENCY_FAILURE', 'sourceInput')

  const badShape = runCoverWorker({ mode: 'bad-shape' }, payload())
  assert.equal(badShape.counts.calls, 1)
  expectError(badShape.result, 'DEPENDENCY_FAILURE', 'sourceInput')

  const mismatch = runCoverWorker({ mode: 'mismatch' }, payload())
  assert.equal(mismatch.counts.calls, 1)
  expectError(mismatch.result, 'DEPENDENCY_FAILURE', 'sourceInput')
})

test('F02 a legal resolver failure envelope maps to SOURCE_INVALID without echoing it', () => {
  const worker = runCoverWorker({ mode: 'failed-envelope' }, payload())
  assert.equal(worker.counts.calls, 1)
  expectError(worker.result, 'SOURCE_INVALID', 'sourceInput')
  assert.equal(JSON.stringify(worker.result).includes('SOURCE_ARTIFACT_INVALID_INPUT'), false)
})

test('F01 protocol failures never call the resolver', () => {
  const worker = runCoverWorker({ mode: 'control' }, payload({ schemaVersion: 2 }))
  assert.equal(worker.counts.calls, 0)
  expectError(worker.result, 'UNSUPPORTED_VERSION', 'schemaVersion')

  const badRecipe = runCoverWorker({ mode: 'control' }, payload({ recipe: { ...recipe(), sourceLayout: 'CLEAN' } }))
  assert.equal(badRecipe.counts.calls, 0)
  expectError(badRecipe.result, 'INVALID_RECIPE', 'recipe')

  const badCaps = runCoverWorker({ mode: 'control' }, payload({ capabilities: { ...capabilities(), mixer: 'READY' } }))
  assert.equal(badCaps.counts.calls, 0)
  expectError(badCaps.result, 'INVALID_CAPABILITIES', 'capabilities')
})

/* ------------------------------------------------------------- examples */

test('F06 the three documented complete roots run verbatim', () => {
  const doc = fs.readFileSync(COVER_DOC, 'utf8')
  const at = doc.indexOf('## 7.')
  assert.ok(at >= 0)
  const blocks = []
  let cursor = at
  while (true) {
    const fence = doc.indexOf('```json', cursor)
    if (fence < 0) break
    const close = doc.indexOf('```', fence + 7)
    assert.ok(close > fence)
    blocks.push(JSON.parse(doc.slice(fence + 7, close).trim()))
    cursor = close + 3
    if (blocks.length >= 4) break
  }
  assert.equal(blocks.length, 4)
  const [rootA, expectedAssociation, rootB, rootC] = blocks
  for (const root of [rootA, rootB, rootC]) {
    assert.deepEqual(Object.keys(root), ['schemaVersion', 'sourceInput', 'recipe', 'capabilities'])
    assert.deepEqual(Object.keys(root.sourceInput), [
      'schemaVersion',
      'voiceBinding',
      'artifactLibrary',
      'sourceRevision',
    ])
  }

  const a = planFixtureCover(rootA)
  const valueA = expectPlanned(a, 4)
  assert.deepEqual(valueA.association, expectedAssociation)
  assert.equal(valueA.recipe.pitchShift, 0)
  assert.equal(valueA.recipe.sourceLayout, 'MIXED')
  assert.equal(valueA.recipe.mixConfig.mode, 'WITH_INSTRUMENTAL')
  assert.deepEqual(valueA.stages[0].outputs, ['VOCAL', 'INSTRUMENTAL'])

  const b = planFixtureCover(rootB)
  const valueB = expectPlanned(b, 3)
  assert.equal(valueB.recipe.sourceLayout, 'CLEAN_VOCAL')
  assert.equal(valueB.recipe.mixConfig.mode, 'VOCAL_ONLY')
  assert.equal(valueB.stages.some((stage) => stage.stage === 'SEPARATING'), false)
  assert.equal(valueB.stages.some((stage) => stage.outputs.includes('INSTRUMENTAL')), false)
  assert.deepEqual(valueB.stages.map((stage) => stage.stage), ['CONVERTING', 'MIXING', 'VERIFYING'])

  const c = planFixtureCover(rootC)
  const valueC = expectBlocked(c, 'INSTRUMENTAL_MISSING')
  assert.equal(valueC.dependencyReason, null)
})
test('F02-R01 the whole dependency return is bounded-safe-copied before consumption', () => {
  const failureInput = payload({ sourceInput: { schemaVersion: 1 } })
  const failedGetter = runCoverWorker({ mode: 'failed-error-getter' }, failureInput)
  assert.equal(failedGetter.counts.calls, 1)
  assert.equal(failedGetter.counts.getters, 0)
  expectError(failedGetter.result, 'DEPENDENCY_FAILURE', 'sourceInput')

  const proxy = runCoverWorker({ mode: 'proxy-prototype' }, payload())
  assert.equal(proxy.counts.calls, 1)
  expectError(proxy.result, 'DEPENDENCY_FAILURE', 'sourceInput')

  const budget = runCoverWorker({ mode: 'budget-message' }, payload())
  assert.equal(budget.counts.calls, 1)
  expectError(budget.result, 'DEPENDENCY_FAILURE', 'sourceInput')

  const blockedInput = payload()
  blockedInput.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
  const blockedGetter = runCoverWorker({ mode: 'blocked-getter' }, blockedInput)
  assert.equal(blockedGetter.counts.calls, 1)
  assert.equal(blockedGetter.counts.getters, 0)
  expectError(blockedGetter.result, 'DEPENDENCY_FAILURE', 'sourceInput')

  const extra = runCoverWorker({ mode: 'provider-extra' }, payload())
  assert.equal(extra.counts.calls, 1)
  expectPlanned(extra.result, 4, false)

  const minimal = runCoverWorker({ mode: 'provider-minimal' }, payload())
  assert.equal(minimal.counts.calls, 1)
  expectPlanned(minimal.result, 4, false)

  const nullMessage = runCoverWorker({ mode: 'provider-null-message' }, payload())
  assert.equal(nullMessage.counts.calls, 1)
  expectPlanned(nullMessage.result, 4, false)
})