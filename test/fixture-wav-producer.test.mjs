/* Whale Voice — Plan 08-E-C restricted PCM16 fixture WAV producer behavior tests.
 *
 * C01-C08 drive the real synchronous producer: byte-exact WAV construction for both patterns, six
 * sample rates and one/two channels, independent literal vectors, the fixed first-error order,
 * budget-before-allocation boundaries, independent return memory, the thin 08-E-A dependency guard
 * (fault injection only at the test-only module-link layer) and a real isolated 08-E-B
 * import/read/delete chain over a trusted temporary sandbox. No real media/model/device/Task,
 * network, clock or production path is used.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import {
  ARTIFACT_LIBRARY_LIMITS,
  ARTIFACT_LIBRARY_SCHEMA_VERSION,
  openFixtureArtifactLibrary,
} from '../core/audio/artifact-library.mjs'
import * as producerModule from '../core/audio/fixture-wav-producer.mjs'
import {
  FIXTURE_WAV_PRODUCER_ERRORS,
  FIXTURE_WAV_PRODUCER_LIMITS,
  FIXTURE_WAV_PRODUCER_SCHEMA_VERSION,
  produceFixtureWav,
} from '../core/audio/fixture-wav-producer.mjs'

const BASE = fileURLToPath(new URL('..', import.meta.url))
const PACK = 'audio-artifacts-v1.json'
const MARKER = '.whale-voice-sandbox.json'
const NOW = '2026-10-29T00:00:00.000Z'
const LATER = '2026-10-29T00:10:00.000Z'
const EXPIRES = '2026-10-29T01:00:00.000Z'
const PROOF = 'fixture-rights:proof-1'
const RATES = [16000, 22050, 24000, 32000, 44100, 48000]
const EDGE = [-32768, -16384, 0, 16384, 32767]
const MAX = FIXTURE_WAV_PRODUCER_LIMITS.maxByteLength

/* --------------------------------------------- helpers -------------------------------------- */

function manualWav({ sampleRate, channels, frameCount, samples }) {
  const blockAlign = channels * 2
  const dataByteLength = frameCount * blockAlign
  const byteLength = 44 + dataByteLength
  const bytes = Buffer.alloc(byteLength)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(byteLength - 8, 4)
  bytes.write('WAVE', 8, 'ascii')
  bytes.write('fmt ', 12, 'ascii')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(channels, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * blockAlign, 28)
  bytes.writeUInt16LE(blockAlign, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36, 'ascii')
  bytes.writeUInt32LE(dataByteLength, 40)
  for (let index = 0; index < samples.length; index += 1) bytes.writeInt16LE(samples[index], 44 + index * 2)
  return bytes
}

function patternSamples(pattern, sampleCount) {
  if (pattern === 'SILENCE') return new Array(sampleCount).fill(0)
  return Array.from({ length: sampleCount }, (_, index) => EDGE[index % EDGE.length])
}

function expectedStatistical(pattern, frameCount, channels) {
  const samples = patternSamples(pattern, frameCount * channels)
  let peakMagnitude = 0
  let fullScale = 0
  for (const sample of samples) {
    const magnitude = sample < 0 ? -sample : sample
    if (magnitude > peakMagnitude) peakMagnitude = magnitude
    if (sample === -32768 || sample === 32767) fullScale += 1
  }
  return { peak: peakMagnitude / 32768, fullScaleSampleCount: fullScale }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function expectSuccess(result) {
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.value), true)
  assert.equal(Object.isFrozen(result.value.inspection), true)
  assert.deepEqual(Object.keys(result.value).sort(), [
    'automaticRetryAllowed',
    'bytes',
    'inspection',
    'messageZh',
    'mockOnly',
    'origin',
    'realOperationAllowed',
    'schemaVersion',
    'submitAllowed',
  ])
  assert.equal(result.value.schemaVersion, 1)
  assert.equal(result.value.origin, 'SYNTHETIC_FIXTURE')
  assert.equal(result.value.mockOnly, true)
  assert.equal(result.value.realOperationAllowed, false)
  assert.equal(result.value.submitAllowed, false)
  assert.equal(result.value.automaticRetryAllowed, false)
  assert.equal(result.value.messageZh, '已生成演示PCM16测试信号；不是TTS或翻唱结果，也不代表保存或发送。')
  assert.equal(Object.keys(result.value.inspection).length, 19)
  return result.value
}

function expectError(result, key, errorPath) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal('value' in result, false, 'a failed call must not return bytes or a partial value')
  assert.equal(result.errors.length, 1)
  const error = result.errors[0]
  assert.deepEqual(Object.keys(error).sort(), ['code', 'path', 'reason'])
  assert.equal(error.code, FIXTURE_WAV_PRODUCER_ERRORS[key], JSON.stringify(result))
  if (errorPath !== undefined) assert.equal(error.path, errorPath)
  assert.equal(typeof error.reason, 'string')
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(error), true)
  return error
}

function input(overrides = {}) {
  return { schemaVersion: 1, sampleRate: 16000, channels: 1, frameCount: 5, pattern: 'EDGE_SEQUENCE', ...overrides }
}

/* ------------------------------- test-only module-link worker (C01/C03/C04/C06) -------------- */

const VM_SCRIPT = `
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'

const base = process.env.WV_BASE
const scenario = JSON.parse(process.env.WV_SCENARIO)
const producerPath = pathToFileURL(path.join(base, 'core', 'audio', 'fixture-wav-producer.mjs')).href
const inspectorPath = pathToFileURL(path.join(base, 'core', 'audio', 'wav-byte-inspector.mjs')).href
const realInspector = await import(inspectorPath)

// Passive observation of real Uint8Array construction in this test-only worker. The subclass only
// delegates to the real constructor and records which call site created the view; the real
// inspector's own internal copy is counted separately through the insideInspector marker.
const RealUint8Array = globalThis.Uint8Array
let insideInspector = 0
let outputViews = []
let inspectorCopies = 0
class ObservedUint8Array extends RealUint8Array {
  constructor(...args) {
    super(...args)
    if (insideInspector > 0) inspectorCopies += 1
    else outputViews.push(this)
  }
}
globalThis.Uint8Array = ObservedUint8Array

let producerCalls = 0
let realCalls = 0
let realOk = 0
let getterCalls = 0

function wrapped(request) {
  producerCalls += 1
  let out
  insideInspector += 1
  try {
    out = realInspector.inspectFixtureWavBytes(request)
  } finally {
    insideInspector -= 1
  }
  realCalls += 1
  if (out && out.ok === true) realOk += 1
  const fault = scenario.fault
  if (!fault) return out
  if (fault === 'throw') throw new Error('injected inspector throw')
  if (fault === 'okfalse') return { ok: false, errors: [{ code: 'WAV_BYTES_INVALID_PCM', path: '$', reason: 'injected' }] }
  if (fault === 'null') return null
  if (fault === 'missing') {
    const value = { ...out.value }
    delete value.sha256
    return { ok: true, value }
  }
  if (fault === 'mismatch') return { ok: true, value: { ...out.value, frameCount: out.value.frameCount + 1 } }
  if (fault === 'accessor') {
    const value = { ...out.value }
    delete value.frameCount
    Object.defineProperty(value, 'frameCount', {
      enumerable: true,
      configurable: true,
      get() { getterCalls += 1; return out.value.frameCount },
    })
    return { ok: true, value }
  }
  if (fault === 'message') {
    const value = { ...out.value, messageZh: 'injected non-empty but wrong inspector message' }
    Object.freeze(value)
    return Object.freeze({ ok: true, value })
  }
  throw new Error('unknown injected fault')
}

const inspectorModule = new vm.SyntheticModule(['inspectFixtureWavBytes'], function () {
  this.setExport('inspectFixtureWavBytes', wrapped)
}, { identifier: inspectorPath })

const producerModule = new vm.SourceTextModule(fs.readFileSync(new URL(producerPath), 'utf8'), { identifier: producerPath })
await producerModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === inspectorPath) return inspectorModule
  const namespace = await import(url)
  return new vm.SyntheticModule(Object.keys(namespace), function () {
    for (const key of Object.keys(namespace)) this.setExport(key, namespace[key])
  }, { identifier: url })
})
await producerModule.evaluate()
const produce = producerModule.namespace.produceFixtureWav

let results
try {
  results = scenario.inputs.map((candidate) => {
    outputViews = []
    inspectorCopies = 0
    let result
    try {
      result = produce(candidate)
    } catch (error) {
      return { threw: String(error), outputConstructions: outputViews.length, outputLengths: [], inspectorCopies }
    }
    const observed = outputViews
    const copies = inspectorCopies
    const outputConstructions = observed.length
    const outputLengths = observed.map((view) => view.byteLength)
    if (!result.ok) {
      return {
        ok: false,
        errors: result.errors.map((error) => ({ code: error.code, path: error.path })),
        hasValue: 'value' in result,
        frozen: Object.isFrozen(result),
        outputConstructions,
        outputLengths,
        inspectorCopies: copies,
      }
    }
    return {
      ok: true,
      byteLength: result.value.bytes.length,
      sha256: result.value.inspection.sha256,
      frameCount: result.value.inspection.frameCount,
      bytesFrozen: Object.isFrozen(result.value.bytes),
      envelopeFrozen: Object.isFrozen(result),
      valueFrozen: Object.isFrozen(result.value),
      inspectionFrozen: Object.isFrozen(result.value.inspection),
      outputConstructions,
      outputLengths,
      returnedIsObserved: outputConstructions === 1 && observed[0] === result.value.bytes,
      inspectorCopies: copies,
    }
  })
} finally {
  globalThis.Uint8Array = RealUint8Array
}
process.stdout.write(JSON.stringify({ producerCalls, realCalls, realOk, getterCalls, results }))
`

function runVm(scenario) {
  const output = execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', VM_SCRIPT], {
    cwd: BASE,
    encoding: 'utf8',
    env: { ...process.env, WV_BASE: BASE, WV_SCENARIO: JSON.stringify(scenario) },
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(output)
}

/* -------------------------------------- documented examples -------------------------------- */

function documentedExamples() {
  const doc = fs.readFileSync(new URL('../docs/FIXTURE_WAV_PRODUCER_OFFLINE.md', import.meta.url), 'utf8')
  const blocks = []
  let from = 0
  for (;;) {
    const start = doc.indexOf('```json', from)
    if (start === -1) break
    const open = doc.indexOf('\n', start)
    const close = doc.indexOf('```', open + 1)
    blocks.push(JSON.parse(doc.slice(open + 1, close).trim()))
    from = close + 3
  }
  return blocks
}

/* ============================================= C01 ========================================== */

test('C01 real PCM16 bytes: both patterns, six sample rates, mono/stereo and one inspector call', () => {
  const cases = []
  for (const sampleRate of RATES) {
    cases.push({ schemaVersion: 1, sampleRate, channels: 1, frameCount: 5, pattern: 'SILENCE' })
    cases.push({ schemaVersion: 1, sampleRate, channels: 2, frameCount: 5, pattern: 'EDGE_SEQUENCE' })
  }
  cases.push({ schemaVersion: 1, sampleRate: 16000, channels: 1, frameCount: 5, pattern: 'EDGE_SEQUENCE' })
  cases.push({ schemaVersion: 1, sampleRate: 16000, channels: 2, frameCount: 5, pattern: 'SILENCE' })

  for (const candidate of cases) {
    const snapshot = JSON.parse(JSON.stringify(candidate))
    const value = expectSuccess(produceFixtureWav(candidate))
    const samples = patternSamples(candidate.pattern, candidate.frameCount * candidate.channels)
    const expected = manualWav({ ...candidate, samples })
    assert.equal(Buffer.compare(Buffer.from(value.bytes), expected), 0, JSON.stringify(candidate))
    const stats = expectedStatistical(candidate.pattern, candidate.frameCount, candidate.channels)
    assert.equal(value.inspection.byteLength, expected.length)
    assert.equal(value.inspection.dataByteLength, candidate.frameCount * candidate.channels * 2)
    assert.equal(value.inspection.sampleRate, candidate.sampleRate)
    assert.equal(value.inspection.channels, candidate.channels)
    assert.equal(value.inspection.frameCount, candidate.frameCount)
    assert.equal(value.inspection.durationMs, (candidate.frameCount * 1000) / candidate.sampleRate)
    assert.equal(value.inspection.peak, stats.peak)
    assert.equal(value.inspection.fullScaleSampleCount, stats.fullScaleSampleCount)
    assert.equal(value.inspection.sha256, sha256(expected))
    assert.deepEqual(candidate, snapshot, 'the request object must not be mutated')
  }

  const batched = runVm({ inputs: cases.slice(0, 4) })
  assert.deepEqual(
    { producer: batched.producerCalls, real: batched.realCalls, realOk: batched.realOk },
    { producer: 4, real: 4, realOk: 4 },
    'one real inspector call per produced file',
  )
  for (const result of batched.results) {
    assert.equal(result.ok, true)
    assert.equal(result.bytesFrozen, false, 'non-empty Uint8Array must stay writable')
    assert.equal(result.envelopeFrozen, true)
    assert.equal(result.valueFrozen, true)
    assert.equal(result.inspectionFrozen, true)
  }
})

/* ============================================= C02 ========================================== */

test('C02 independent literal vectors: bytes, hash, frames, exact duration, peak and full-scale count', () => {
  const vectors = [
    {
      input: { schemaVersion: 1, sampleRate: 16000, channels: 1, frameCount: 1, pattern: 'SILENCE' },
      samples: [0],
      byteLength: 46,
      durationMs: 0.0625,
      peak: 0,
      fullScaleSampleCount: 0,
      sha256: '156075e2635b9b2c186258f4db987ed9fbdfb727f49e5eac4b9a126aefbdf727',
    },
    {
      input: { schemaVersion: 1, sampleRate: 16000, channels: 1, frameCount: 5, pattern: 'EDGE_SEQUENCE' },
      samples: [-32768, -16384, 0, 16384, 32767],
      byteLength: 54,
      durationMs: 0.3125,
      peak: 1,
      fullScaleSampleCount: 2,
      sha256: '87615e424bb548113f3b8afdc7ff93f6b2de088b925e23216fcb65f6a91f73d2',
    },
    {
      input: { schemaVersion: 1, sampleRate: 48000, channels: 2, frameCount: 3, pattern: 'EDGE_SEQUENCE' },
      samples: [-32768, -16384, 0, 16384, 32767, -32768],
      byteLength: 56,
      durationMs: 0.0625,
      peak: 1,
      fullScaleSampleCount: 3,
      sha256: '8b6a5a5542a9ee92ce450a7db0ac951e512c670c8b19b90a67037dbd1f151485',
    },
  ]
  for (const vector of vectors) {
    const value = expectSuccess(produceFixtureWav(vector.input))
    const expected = manualWav({
      sampleRate: vector.input.sampleRate,
      channels: vector.input.channels,
      frameCount: vector.input.frameCount,
      samples: vector.samples,
    })
    assert.equal(Buffer.compare(Buffer.from(value.bytes), expected), 0, vector.sha256)
    assert.equal(value.bytes.length, vector.byteLength)
    assert.equal(value.inspection.sha256, vector.sha256)
    assert.equal(value.inspection.frameCount, vector.input.frameCount)
    assert.equal(value.inspection.durationMs, vector.durationMs)
    assert.equal(value.inspection.peak, vector.peak)
    assert.equal(value.inspection.fullScaleSampleCount, vector.fullScaleSampleCount)
  }
})

/* ============================================= C03 ========================================== */

test('C03 structure and first error: plain five-field root, version/type/format/frame order, zero getter', () => {
  const badRoots = [null, 5, 'x', [], new Map(), () => {}, Object.create({})]
  for (const root of badRoots) expectError(produceFixtureWav(root), 'INVALID_INPUT', '$')

  expectError(produceFixtureWav({ ...input(), [Symbol('hidden')]: 1 }), 'INVALID_INPUT', '<unknown-key>')
  expectError(produceFixtureWav({ ...input(), extra: true }), 'INVALID_INPUT', '<unknown-key>')
  const hiddenUnknown = input()
  Object.defineProperty(hiddenUnknown, 'extra', { enumerable: false, configurable: true, value: 1 })
  expectError(produceFixtureWav(hiddenUnknown), 'INVALID_INPUT', '<unknown-key>')

  for (const key of ['schemaVersion', 'sampleRate', 'channels', 'frameCount', 'pattern']) {
    const missing = input()
    delete missing[key]
    expectError(produceFixtureWav(missing), 'INVALID_INPUT', key)
    const hidden = input()
    Object.defineProperty(hidden, key, { enumerable: false, configurable: true, value: hidden[key] })
    expectError(produceFixtureWav(hidden), 'INVALID_INPUT', key)
  }

  // A missing field is a structure error before any value check of a later field.
  expectError(produceFixtureWav({ schemaVersion: 1, sampleRate: 16000, channels: 1, frameCount: 0 }), 'INVALID_INPUT', 'pattern')

  let getterCalls = 0
  const getterInput = { schemaVersion: 1, sampleRate: 16000, channels: 1, frameCount: 5 }
  Object.defineProperty(getterInput, 'pattern', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1
      return 'SILENCE'
    },
  })
  expectError(produceFixtureWav(getterInput), 'INVALID_INPUT', 'pattern')
  assert.equal(getterCalls, 0, 'no accessor may be invoked')

  const throwingProxy = new Proxy(input(), {
    getPrototypeOf() {
      throw new Error('injected proxy trap')
    },
  })
  expectError(produceFixtureWav(throwingProxy), 'INVALID_INPUT', '$')

  for (const schemaVersion of [1.5, 0, -1, Number.NaN, '1']) {
    expectError(produceFixtureWav(input({ schemaVersion })), 'INVALID_INPUT', 'schemaVersion')
  }
  expectError(produceFixtureWav(input({ schemaVersion: 2 })), 'UNSUPPORTED_VERSION', 'schemaVersion')

  for (const sampleRate of [16000.5, '16000', Number.NaN, Number.POSITIVE_INFINITY]) {
    expectError(produceFixtureWav(input({ sampleRate })), 'INVALID_INPUT', 'sampleRate')
  }
  expectError(produceFixtureWav(input({ sampleRate: 12345 })), 'UNSUPPORTED_FORMAT', 'sampleRate')

  for (const channels of [1.5, '1', Number.NaN, Number.POSITIVE_INFINITY]) {
    expectError(produceFixtureWav(input({ channels })), 'INVALID_INPUT', 'channels')
  }
  expectError(produceFixtureWav(input({ channels: 3 })), 'UNSUPPORTED_FORMAT', 'channels')

  for (const pattern of [1, null, undefined, true]) {
    expectError(produceFixtureWav(input({ pattern })), 'INVALID_INPUT', 'pattern')
  }
  expectError(produceFixtureWav(input({ pattern: 'LOUD' })), 'UNSUPPORTED_FORMAT', 'pattern')

  for (const frameCount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '5', Number.MAX_SAFE_INTEGER + 1]) {
    expectError(produceFixtureWav(input({ frameCount })), 'INVALID_PCM', 'frameCount')
  }

  // Mixed errors keep the fixed order and never echo a key/value.
  expectError(produceFixtureWav(input({ schemaVersion: 2, frameCount: 0 })), 'UNSUPPORTED_VERSION', 'schemaVersion')
  expectError(produceFixtureWav(input({ sampleRate: 12345, channels: 3 })), 'UNSUPPORTED_FORMAT', 'sampleRate')

  const batched = runVm({ inputs: [input({ frameCount: 0 }), input({ pattern: 'LOUD' }), input({ schemaVersion: 2 })] })
  assert.equal(batched.producerCalls, 0, 'no invalid request may reach the inspector')
  assert.equal(batched.realCalls, 0)
  for (const result of batched.results) {
    assert.equal(result.ok, false)
    assert.equal(result.hasValue, false)
  }
})

/* ============================================= C04 ========================================== */

test('C04 budget before allocation: five boundary cases, real output construction observed or absent', () => {
  const mono = expectSuccess(produceFixtureWav(input({ sampleRate: 16000, channels: 1, frameCount: 524266, pattern: 'SILENCE' })))
  assert.equal(mono.bytes.length, MAX)
  assert.equal(mono.inspection.frameCount, 524266)
  assert.equal(mono.inspection.dataByteLength, MAX - 44)

  const stereo = expectSuccess(
    produceFixtureWav(input({ sampleRate: 48000, channels: 2, frameCount: 262133, pattern: 'EDGE_SEQUENCE' })),
  )
  assert.equal(stereo.bytes.length, MAX)
  assert.equal(stereo.inspection.frameCount, 262133)
  assert.equal(stereo.inspection.dataByteLength, MAX - 44)

  for (const candidate of [
    input({ channels: 1, frameCount: 524267, pattern: 'SILENCE' }),
    input({ channels: 2, frameCount: 262134, pattern: 'SILENCE' }),
    input({ channels: 1, frameCount: Number.MAX_SAFE_INTEGER, pattern: 'SILENCE' }),
    input({ channels: 2, frameCount: Number.MAX_SAFE_INTEGER, pattern: 'EDGE_SEQUENCE' }),
  ]) {
    const error = expectError(produceFixtureWav(candidate), 'RESOURCE_LIMIT', 'frameCount')
    assert.equal(error.reason, 'fixture byte budget exceeded')
  }

  const batched = runVm({
    inputs: [
      input({ sampleRate: 16000, channels: 1, frameCount: 524266, pattern: 'SILENCE' }),
      input({ channels: 1, frameCount: 524267, pattern: 'SILENCE' }),
      input({ channels: 2, frameCount: 262133, pattern: 'EDGE_SEQUENCE' }),
      input({ channels: 2, frameCount: 262134, pattern: 'SILENCE' }),
      input({ channels: 1, frameCount: Number.MAX_SAFE_INTEGER, pattern: 'SILENCE' }),
    ],
  })
  assert.equal(batched.producerCalls, 2, 'only the two legal boundary files reach the inspector')
  assert.equal(batched.realCalls, 2)
  assert.equal(batched.realOk, 2)
  assert.equal(batched.results[0].ok, true)
  assert.equal(batched.results[1].ok, false)
  assert.equal(batched.results[2].ok, true)
  assert.equal(batched.results[3].ok, false)
  assert.equal(batched.results[4].ok, false)
  assert.deepEqual(batched.results[1].errors, [{ code: 'FIXTURE_WAV_PRODUCER_RESOURCE_LIMIT', path: 'frameCount' }])
  for (const result of batched.results) assert.equal('threw' in result, false, 'budget overflow must not throw')

  // Passive real-construction observation in the same worker: the two legal boundary files each
  // construct exactly one 1 MiB view that IS the returned bytes object, while the real inspector's
  // internal copy is counted separately; the three rejects construct no output at all.
  const [monoOk, monoOver, stereoOk, stereoOver, unsafe] = batched.results
  for (const legal of [monoOk, stereoOk]) {
    assert.equal(legal.outputConstructions, 1, 'exactly one output Uint8Array construction')
    assert.deepEqual(legal.outputLengths, [MAX])
    assert.equal(legal.returnedIsObserved, true, 'the observed view is the returned bytes object')
    assert.ok(legal.inspectorCopies >= 1, 'the real inspector internal copy is observed separately')
  }
  for (const rejected of [monoOver, stereoOver, unsafe]) {
    assert.equal(rejected.outputConstructions, 0, 'a rejected request must not construct an output')
    assert.deepEqual(rejected.outputLengths, [])
    assert.equal(rejected.inspectorCopies, 0)
  }
})

/* ============================================= C05 ========================================== */

test('C05 memory isolation: independent bytes and backing stores, writable bytes, frozen metadata', () => {
  const request = input({ sampleRate: 44100, channels: 2, frameCount: 7, pattern: 'EDGE_SEQUENCE' })
  const snapshot = JSON.parse(JSON.stringify(request))
  const first = expectSuccess(produceFixtureWav(request))
  const second = expectSuccess(produceFixtureWav(request))
  const baseline = manualWav({
    sampleRate: 44100,
    channels: 2,
    frameCount: 7,
    samples: patternSamples('EDGE_SEQUENCE', 14),
  })
  assert.notEqual(first.bytes, second.bytes)
  assert.notEqual(first.bytes.buffer, second.bytes.buffer, 'each call must own a separate backing store')
  assert.equal(Buffer.compare(Buffer.from(first.bytes), baseline), 0)
  assert.equal(Buffer.compare(Buffer.from(second.bytes), baseline), 0)

  const firstInspection = first.inspection
  first.bytes[0] = 0
  assert.equal(Buffer.compare(Buffer.from(second.bytes), baseline), 0, 'mutating A must not change B')
  assert.equal(first.bytes[0], 0, 'non-empty Uint8Array stays writable')
  assert.equal(first.inspection.sha256, firstInspection.sha256, 'an old inspection is not rewritten')
  assert.equal(Buffer.compare(Buffer.from(second.bytes), baseline), 0)
  assert.deepEqual(request, snapshot)

  assert.equal(Object.isFrozen(first.bytes), false)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.value ?? first), true)
  assert.throws(() => {
    'use strict'
    first.mockOnly = false
  })

  const nullProto = Object.assign(Object.create(null), request)
  expectSuccess(produceFixtureWav(nullProto))
})

/* ============================================= C06 ========================================== */

test('C06 thin dependency guard: seven injected inspector failures fail closed without a retry', () => {
  const request = input({ sampleRate: 22050, channels: 1, frameCount: 5, pattern: 'EDGE_SEQUENCE' })
  const control = runVm({ inputs: [request] })
  assert.equal(control.producerCalls, 1)
  assert.equal(control.realCalls, 1)
  assert.equal(control.realOk, 1)
  assert.equal(control.results[0].ok, true)

  for (const fault of ['throw', 'okfalse', 'null', 'missing', 'mismatch', 'accessor', 'message']) {
    const batched = runVm({ fault, inputs: [request] })
    assert.equal(batched.producerCalls, 1, 'producer calls the wrapper exactly once: ' + fault)
    assert.equal(batched.realCalls, 1, 'the wrapper delegates to the real inspector once: ' + fault)
    assert.equal(batched.realOk, 1, 'the delegated real inspection succeeds before the fault: ' + fault)
    assert.equal(batched.getterCalls, 0, 'no dependency payload accessor is invoked: ' + fault)
    const result = batched.results[0]
    assert.equal(result.ok, false)
    assert.equal(result.hasValue, false, 'no bytes or partial success on dependency failure: ' + fault)
    assert.deepEqual(result.errors, [{ code: 'FIXTURE_WAV_PRODUCER_DEPENDENCY_FAILURE', path: '$' }])
  }
})

/* ============================================= C07 ========================================== */

test('C07 real isolated library chain: import, get, readBytes, delete and no Task/owner writes', async () => {
  const example = documentedExamples().find((block) => block.name === 'library-roundtrip')
  assert.ok(example, 'the documented library round-trip example must exist')
  const value = expectSuccess(produceFixtureWav(example.producerInput))
  const original = Buffer.from(value.bytes)
  const sandbox = createConfigSandbox()
  try {
    const opened = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(opened.ok, true, JSON.stringify(opened))
    const library = opened.value
    const imported = await library.import({
      schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION,
      scopeId: example.scopeId,
      requestKey: example.requestKey,
      bytes: value.bytes,
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
    })
    assert.equal(imported.ok, true, JSON.stringify(imported))
    assert.equal(imported.value.outcome, 'STORED')
    const artifact = imported.value.artifact
    assert.match(artifact.artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    assert.equal(artifact.origin, 'FIXTURE_IMPORT', 'the library keeps its own import origin, never SYNTHETIC_FIXTURE')
    assert.equal(artifact.inspection.sha256, value.inspection.sha256)
    assert.deepEqual(artifact.inspection, value.inspection)

    const read = { schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION, scopeId: example.scopeId, artifactRef: artifact.artifactRef, now: LATER, rights: { state: 'GRANTED', proofRef: PROOF } }
    const found = await library.get(read)
    assert.equal(found.ok, true)
    assert.equal(found.value.outcome, 'FOUND')
    assert.deepEqual(found.value.artifact.inspection, value.inspection)

    const bytesRead = await library.readBytes(read)
    assert.equal(bytesRead.ok, true)
    assert.equal(Buffer.compare(Buffer.from(bytesRead.value.bytes), original), 0)
    bytesRead.value.bytes[0] = 0

    // Mutating the producer's own bytes after import must not change the stored pack.
    value.bytes[0] = 0
    const readAgain = await library.readBytes(read)
    assert.equal(Buffer.compare(Buffer.from(readAgain.value.bytes), original), 0)
    assert.equal(readAgain.value.artifact.inspection.sha256, sha256(original))

    const deleted = await library.delete({ schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION, scopeId: example.scopeId, artifactRef: artifact.artifactRef, now: LATER })
    assert.equal(deleted.ok, true)
    assert.equal(deleted.value.outcome, 'DELETED')
    const gone = await library.get(read)
    assert.equal(gone.ok, true)
    assert.equal(gone.value.outcome, 'DELETED')
    assert.equal('bytes' in (await library.readBytes(read)).value, false)
    assert.deepEqual(fs.readdirSync(sandbox.root).sort(), [MARKER, PACK], 'no Task/owner files are created')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

/* ============================================= C08 ========================================== */

test('C08 public surface and documented examples: four exports, frozen limits/errors, runnable docs', () => {
  assert.deepEqual(Object.keys(producerModule).sort(), [
    'FIXTURE_WAV_PRODUCER_ERRORS',
    'FIXTURE_WAV_PRODUCER_LIMITS',
    'FIXTURE_WAV_PRODUCER_SCHEMA_VERSION',
    'produceFixtureWav',
  ])
  assert.equal(FIXTURE_WAV_PRODUCER_SCHEMA_VERSION, 1)
  assert.deepEqual(Object.keys(FIXTURE_WAV_PRODUCER_LIMITS).sort(), ['channels', 'maxByteLength', 'patterns', 'sampleRates'])
  assert.deepEqual(FIXTURE_WAV_PRODUCER_LIMITS.sampleRates, [16000, 22050, 24000, 32000, 44100, 48000])
  assert.deepEqual(FIXTURE_WAV_PRODUCER_LIMITS.channels, [1, 2])
  assert.deepEqual(FIXTURE_WAV_PRODUCER_LIMITS.patterns, ['SILENCE', 'EDGE_SEQUENCE'])
  assert.equal(FIXTURE_WAV_PRODUCER_LIMITS.maxByteLength, 1048576)
  assert.equal(
    FIXTURE_WAV_PRODUCER_LIMITS.maxByteLength,
    ARTIFACT_LIBRARY_LIMITS.maxItemBytes,
    'the producer cap must equal the E-B single-item budget',
  )
  assert.equal(Object.isFrozen(FIXTURE_WAV_PRODUCER_LIMITS), true)
  assert.equal(Object.isFrozen(FIXTURE_WAV_PRODUCER_LIMITS.sampleRates), true)
  assert.deepEqual(Object.keys(FIXTURE_WAV_PRODUCER_ERRORS).sort(), [
    'DEPENDENCY_FAILURE',
    'INTERNAL_FAILURE',
    'INVALID_INPUT',
    'INVALID_PCM',
    'RESOURCE_LIMIT',
    'UNSUPPORTED_FORMAT',
    'UNSUPPORTED_VERSION',
  ])
  assert.equal(Object.isFrozen(FIXTURE_WAV_PRODUCER_ERRORS), true)
  for (const [key, code] of Object.entries(FIXTURE_WAV_PRODUCER_ERRORS)) {
    assert.equal(code, 'FIXTURE_WAV_PRODUCER_' + key)
  }

  const examples = documentedExamples().filter((block) => block.name === 'producer-silence' || block.name === 'producer-edge')
  assert.equal(examples.length, 2, 'the document must keep one runnable example per pattern')
  for (const example of examples) {
    const result = produceFixtureWav(example.input)
    assert.equal(result.ok, true, JSON.stringify(example.name))
    assert.equal(result.value.bytes.length, example.expected.byteLength)
    assert.equal(result.value.inspection.sha256, example.expected.sha256)
    assert.equal(result.value.inspection.durationMs, example.expected.durationMs)
    assert.equal(result.value.inspection.peak, example.expected.peak)
    assert.equal(result.value.inspection.fullScaleSampleCount, example.expected.fullScaleSampleCount)
    assert.match(example.note, /测试信号|not TTS/i)
  }
})
