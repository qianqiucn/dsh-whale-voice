import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  WAV_BYTES_SCHEMA_VERSION,
  WAV_BYTE_ERRORS,
  WAV_BYTE_LIMITS,
  inspectFixtureWavBytes,
} from '../core/audio/wav-byte-inspector.mjs'
import { resolveFixtureTaskSource } from '../core/audio/source-artifacts.mjs'

/* --------------------------------------------- builders ------------------------------------ */

function u16(list, value) {
  list.push(value & 0xff, (value >> 8) & 0xff)
}

function u32(list, value) {
  list.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff)
}

function tag(list, text) {
  for (const char of text) list.push(char.charCodeAt(0))
}

function setU32(target, offset, value) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >> 8) & 0xff
  target[offset + 2] = (value >> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function fixRiffSize(bytes) {
  setU32(bytes, 4, bytes.length - 8)
  return bytes
}

function chunk(list, id, payload) {
  tag(list, id)
  u32(list, payload.length)
  for (const byte of payload) list.push(byte)
  if (payload.length % 2 === 1) list.push(0)
}

function samplesToBytes(samples) {
  const payload = []
  for (const sample of samples) u16(payload, sample < 0 ? sample + 0x10000 : sample)
  return payload
}

/** Build one complete RIFF/WAVE PCM16 file from explicit parts. */
function buildWav(options = {}) {
  const sampleRate = options.sampleRate ?? 16000
  const channels = options.channels ?? 1
  const samples = options.samples ?? new Array(16).fill(0)
  const bitsPerSample = options.bitsPerSample ?? 16
  const formatTag = options.formatTag ?? 1
  const blockAlign = options.blockAlign ?? channels * 2
  const byteRate = options.byteRate ?? sampleRate * blockAlign
  const fmtSize = options.fmtSize ?? 16
  const cbSize = options.cbSize ?? 0
  const dataBytes = options.dataBytes ?? samplesToBytes(samples)
  const before = options.before ?? []
  const middle = options.middle ?? []
  const after = options.after ?? []

  const fmt = []
  u16(fmt, formatTag)
  u16(fmt, channels)
  u32(fmt, sampleRate)
  u32(fmt, byteRate)
  u16(fmt, blockAlign)
  u16(fmt, bitsPerSample)
  if (fmtSize >= 18) u16(fmt, cbSize)
  while (fmt.length < fmtSize) fmt.push(0)

  const body = []
  for (const entry of before) chunk(body, entry.id, entry.payload)
  if (options.dataFirst === true) {
    chunk(body, 'data', dataBytes)
    chunk(body, 'fmt ', fmt)
  } else {
    chunk(body, 'fmt ', fmt)
    for (const entry of middle) chunk(body, entry.id, entry.payload)
    chunk(body, 'data', dataBytes)
  }
  for (const entry of after) chunk(body, entry.id, entry.payload)

  const file = []
  tag(file, options.riffTag ?? 'RIFF')
  u32(file, body.length + 4)
  tag(file, options.formTag ?? 'WAVE')
  for (const byte of body) file.push(byte)
  if (options.trailing !== undefined) for (const byte of options.trailing) file.push(byte)
  if (options.riffSizeOverride !== undefined) {
    file[4] = options.riffSizeOverride & 0xff
    file[5] = (options.riffSizeOverride >> 8) & 0xff
    file[6] = (options.riffSizeOverride >> 16) & 0xff
    file[7] = (options.riffSizeOverride >>> 24) & 0xff
  }
  return new Uint8Array(file)
}

function monoOneMs() {
  const samples = new Array(16).fill(0)
  samples[0] = 16384
  return buildWav({ samples })
}

function inspect(bytes) {
  return inspectFixtureWavBytes({ schemaVersion: WAV_BYTES_SCHEMA_VERSION, bytes })
}

function expectError(result, key, path) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.deepEqual(Object.keys(result), ['ok', 'errors'])
  assert.equal(result.errors.length, 1)
  assert.deepEqual(Object.keys(result.errors[0]), ['code', 'path', 'reason'])
  assert.equal(result.errors[0].code, WAV_BYTE_ERRORS[key])
  if (path !== undefined) assert.equal(result.errors[0].path, path)
  return result.errors[0]
}

const MESSAGE_ZH = '演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。'
const VALUE_KEYS = [
  'schemaVersion', 'format', 'codec', 'bitsPerSample', 'sampleRate', 'channels',
  'byteLength', 'dataByteLength', 'frameCount', 'durationMs', 'peak', 'fullScaleSampleCount',
  'sha256', 'validationState', 'mockOnly', 'realOperationAllowed', 'submitAllowed',
  'automaticRetryAllowed', 'messageZh',
]

/* ------------------------------------------------- W01 ------------------------------------- */

test('W01 real normal bytes and carriers: mono/stereo/fmt18, Buffer/view/subarray, no override use', () => {
  const bytes = monoOneMs()
  assert.equal(bytes.length, 76)
  const mono = inspect(bytes)
  assert.equal(mono.ok, true)
  assert.deepEqual(Object.keys(mono.value), VALUE_KEYS)
  assert.equal(mono.value.byteLength, 76)
  assert.equal(mono.value.dataByteLength, 32)
  assert.equal(mono.value.frameCount, 16)
  assert.equal(mono.value.durationMs, 1)
  assert.equal(mono.value.peak, 0.5)
  assert.equal(mono.value.fullScaleSampleCount, 0)
  assert.equal(mono.value.sampleRate, 16000)
  assert.equal(mono.value.channels, 1)
  assert.equal(mono.value.codec, 'PCM_S16LE')
  assert.equal(mono.value.bitsPerSample, 16)
  assert.equal(mono.value.format, 'WAV')
  assert.equal(mono.value.validationState, 'FIXTURE_WAV_CHECKED')
  assert.equal(mono.value.mockOnly, true)
  assert.equal(mono.value.realOperationAllowed, false)
  assert.equal(mono.value.submitAllowed, false)
  assert.equal(mono.value.automaticRetryAllowed, false)
  assert.equal(mono.value.messageZh, MESSAGE_ZH)
  assert.match(mono.value.sha256, /^[0-9a-f]{64}$/)

  const stereo = buildWav({ channels: 2, samples: [0, 1000, -1000, 2000] })
  const stereoOut = inspect(stereo)
  assert.equal(stereoOut.ok, true)
  assert.equal(stereoOut.value.channels, 2)
  assert.equal(stereoOut.value.frameCount, 2)
  assert.equal(stereoOut.value.peak, 2000 / 32768)

  const fmt18 = buildWav({ fmtSize: 18, cbSize: 0 })
  assert.equal(inspect(fmt18).ok, true)
  expectError(inspect(buildWav({ fmtSize: 18, cbSize: 1 })), 'UNSUPPORTED_FORMAT')

  // Buffer and plain views are equal; a subarray only covers its own bytes.
  const buffer = Buffer.from(monoOneMs())
  assert.equal(inspect(buffer).ok, true)
  assert.equal(inspect(buffer).value.sha256, mono.value.sha256)
  const padded = new Uint8Array(monoOneMs().length + 16).fill(0xaa)
  padded.set(monoOneMs(), 8)
  const subarray = padded.subarray(8, 8 + 76)
  const subarrayOut = inspect(subarray)
  assert.equal(subarrayOut.ok, true)
  assert.equal(subarrayOut.value.byteLength, 76)
  assert.equal(subarrayOut.value.sha256, mono.value.sha256)

  // Shadowed length/byteLength/buffer accessors on the view are never consulted.
  let getterCalls = 0
  const shadowed = new Uint8Array(monoOneMs())
  for (const key of ['length', 'byteLength', 'byteOffset', 'buffer']) {
    Object.defineProperty(shadowed, key, {
      configurable: true,
      enumerable: false,
      get() {
        getterCalls += 1
        throw new Error('shadowed ' + key)
      },
    })
  }
  assert.equal(inspect(shadowed).ok, true)
  assert.equal(getterCalls, 0)

  // The caller's bytes and frozen state are unchanged.
  const callerBytes = monoOneMs()
  const snapshot = Uint8Array.from(callerBytes)
  assert.equal(Object.isFrozen(callerBytes), false)
  assert.equal(inspect(callerBytes).ok, true)
  assert.equal(callerBytes.length, snapshot.length)
  for (let index = 0; index < snapshot.length; index += 1) assert.equal(callerBytes[index], snapshot[index])
  assert.equal(Object.isFrozen(callerBytes), false)
})

/* ------------------------------------------------- W02 ------------------------------------- */

test('W02 complete RIFF walk: orders, unknown chunks, odd pad and every structural refusal', () => {
  const quiet = new Array(8).fill(0)
  const base = buildWav({ samples: quiet })
  assert.equal(inspect(base).ok, true)

  assert.equal(inspect(buildWav({ samples: quiet, dataFirst: true })).ok, true)
  const unknownA = { id: 'LIST', payload: [1, 2, 3, 4] }
  const unknownB = { id: 'junk', payload: [7] }
  const unknownC = { id: 'cue ', payload: [] }
  const layered = buildWav({ samples: quiet, before: [unknownA], middle: [unknownB], after: [unknownC] })
  const layeredOut = inspect(layered)
  assert.equal(layeredOut.ok, true)
  assert.equal(layeredOut.value.byteLength, layered.length)
  // An odd-sized chunk keeps its pad byte and may use a non-zero pad value.
  const odd = buildWav({ samples: quiet, before: [{ id: 'odd ', payload: [9] }] })
  odd[odd.length - odd.length + 12 + 8 + 1] = 0x7f
  assert.equal(inspect(odd).ok, true)

  expectError(inspect(buildWav({ riffSizeOverride: 4 })), 'INVALID_CONTAINER')
  expectError(inspect(buildWav({ samples: quiet, trailing: [0] })), 'INVALID_CONTAINER')
  expectError(inspect(buildWav({ samples: quiet }).slice(0, 40)), 'INVALID_CONTAINER')
  expectError(inspect(new Uint8Array(8)), 'INVALID_CONTAINER')
  expectError(inspect(buildWav({ samples: quiet }).subarray(0, 20)), 'INVALID_CONTAINER')

  // Duplicate / missing fmt or data and empty data.
  const duplicate = []
  tag(duplicate, 'RIFF')
  u32(duplicate, 0)
  tag(duplicate, 'WAVE')
  const fmtOnly = []
  u16(fmtOnly, 1)
  u16(fmtOnly, 1)
  u32(fmtOnly, 16000)
  u32(fmtOnly, 32000)
  u16(fmtOnly, 2)
  u16(fmtOnly, 16)
  chunk(duplicate, 'fmt ', fmtOnly)
  chunk(duplicate, 'fmt ', fmtOnly)
  chunk(duplicate, 'data', [0, 0])
  duplicate[4] = (duplicate.length - 8) & 0xff
  duplicate[5] = ((duplicate.length - 8) >> 8) & 0xff
  expectError(inspect(new Uint8Array(duplicate)), 'INVALID_CONTAINER')

  expectError(inspect(buildWav({ samples: quiet, dataBytes: [] })), 'INVALID_CONTAINER')

  // Chunk budget: 128 chunks pass, 129 are refused. Zero-length unknown chunks still advance.
  const makeChunks = (count) => {
    const entries = []
    for (let index = 0; index < count; index += 1) entries.push({ id: 'zro ', payload: [] })
    return entries
  }
  assert.equal(inspect(buildWav({ samples: quiet, before: makeChunks(126) })).ok, true)
  expectError(inspect(buildWav({ samples: quiet, before: makeChunks(127) })), 'RESOURCE_LIMIT')

  // R3: seven inner chunk representatives. Each file keeps RIFF size == length - 8, so the outer
  // length gate cannot be the reason for the refusal, and each has a legal control first.
  const fmtPayload = []
  u16(fmtPayload, 1)
  u16(fmtPayload, 1)
  u32(fmtPayload, 16000)
  u32(fmtPayload, 32000)
  u16(fmtPayload, 2)
  u16(fmtPayload, 16)
  const assemble = (chunks) => {
    const body = []
    for (const entry of chunks) chunk(body, entry.id, entry.payload)
    const file = []
    tag(file, 'RIFF')
    u32(file, body.length + 4)
    tag(file, 'WAVE')
    for (const byte of body) file.push(byte)
    return new Uint8Array(file)
  }
  const legalInner = assemble([{ id: 'fmt ', payload: fmtPayload }, { id: 'data', payload: [0, 0, 0, 0] }])
  assert.equal(inspect(legalInner).ok, true)

  // 1. inner chunk header truncated (6 trailing bytes form an incomplete 8-byte header)
  const headerTruncated = fixRiffSize(Uint8Array.from([...legalInner, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66]))
  expectError(inspect(headerTruncated), 'INVALID_CONTAINER', '$')

  // 2. inner payload truncated (data declares 8 bytes but only 4 remain)
  const eightByteData = assemble([{ id: 'fmt ', payload: fmtPayload }, { id: 'data', payload: [0, 0, 0, 0, 0, 0, 0, 0] }])
  const payloadTruncated = fixRiffSize(eightByteData.slice(0, eightByteData.length - 4))
  expectError(inspect(payloadTruncated), 'INVALID_CONTAINER', '$')

  // 3. odd-size payload without its pad byte at the end of the file
  const oddFile = assemble([{ id: 'fmt ', payload: fmtPayload }, { id: 'data', payload: [0, 0] }, { id: 'odd ', payload: [1] }])
  const missingPad = fixRiffSize(oddFile.slice(0, oddFile.length - 1))
  expectError(inspect(missingPad), 'INVALID_CONTAINER', '$')

  // 4. huge chunkSize declaration with a short real payload
  const hugeSize = Uint8Array.from(legalInner)
  // data chunk header starts after RIFF(12) + fmt(8+16); its size field is at offset 40.
  setU32(hugeSize, 40, 0x00ffffff)
  fixRiffSize(hugeSize)
  expectError(inspect(hugeSize), 'INVALID_CONTAINER', '$')

  // 5. duplicate data
  const duplicateData = assemble([{ id: 'fmt ', payload: fmtPayload }, { id: 'data', payload: [0, 0] }, { id: 'data', payload: [0, 0] }])
  expectError(inspect(duplicateData), 'INVALID_CONTAINER', '$')

  // 6. missing fmt
  const missingFmt = assemble([{ id: 'data', payload: [0, 0] }])
  expectError(inspect(missingFmt), 'INVALID_CONTAINER', '$')

  // 7. missing data
  const missingData = assemble([{ id: 'fmt ', payload: fmtPayload }])
  expectError(inspect(missingData), 'INVALID_CONTAINER', '$')
})

/* ------------------------------------------------- W03 ------------------------------------- */

test('W03 format and arithmetic: only PCM16 inside the profile, mismatched parameters refused', () => {
  const quiet = new Array(4).fill(0)
  for (const sampleRate of [16000, 22050, 24000, 32000, 44100, 48000]) {
    assert.equal(inspect(buildWav({ samples: quiet, sampleRate })).ok, true)
  }
  expectError(inspect(buildWav({ samples: quiet, sampleRate: 8000 })), 'UNSUPPORTED_FORMAT')
  expectError(inspect(buildWav({ samples: quiet, channels: 3 })), 'UNSUPPORTED_FORMAT')
  expectError(inspect(buildWav({ samples: quiet, bitsPerSample: 8 })), 'UNSUPPORTED_FORMAT')
  expectError(inspect(buildWav({ samples: quiet, formatTag: 3 })), 'UNSUPPORTED_FORMAT')
  expectError(inspect(buildWav({ samples: quiet, riffTag: 'RIFX' })), 'UNSUPPORTED_FORMAT')
  expectError(inspect(buildWav({ samples: quiet, riffTag: 'RF64' })), 'UNSUPPORTED_FORMAT')
  expectError(inspect(buildWav({ samples: quiet, formTag: 'AVI ' })), 'UNSUPPORTED_FORMAT')
  // Bare PCM has no RIFF container at all.
  expectError(inspect(new Uint8Array(samplesToBytes(quiet))), 'INVALID_CONTAINER')
  // Arithmetic inconsistencies are PCM errors, not format support.
  expectError(inspect(buildWav({ samples: quiet, blockAlign: 4 })), 'INVALID_PCM')
  expectError(inspect(buildWav({ samples: quiet, byteRate: 1234 })), 'INVALID_PCM')
  expectError(inspect(buildWav({ samples: quiet, dataBytes: [0, 0, 0] })), 'INVALID_PCM')
})

/* ------------------------------------------------- W04 ------------------------------------- */

test('W04 resource boundaries: byte budget, exact-limit control and exact duration limit', () => {
  const limit = WAV_BYTE_LIMITS.maxByteLength
  const over = new Uint8Array(limit + 1)
  over.set(monoOneMs(), 0)
  const overResult = inspect(over)
  expectError(overResult, 'RESOURCE_LIMIT', 'bytes')

  // A legal complete WAV of exactly maxByteLength: 44-byte header (RIFF+fmt+data header) plus
  // 52,428,756 data bytes at 48 kHz stereo PCM16 -> 13,107,189 frames -> 273066.4375 ms, inside the
  // 300000 ms budget. This is the real exact-limit success control (allocated directly, not pushed).
  const legalLimit = new Uint8Array(limit)
  const legalDataSize = limit - 44
  legalLimit.set([0x52, 0x49, 0x46, 0x46], 0)
  legalLimit[4] = (limit - 8) & 0xff
  legalLimit[5] = ((limit - 8) >> 8) & 0xff
  legalLimit[6] = ((limit - 8) >> 16) & 0xff
  legalLimit[7] = ((limit - 8) >>> 24) & 0xff
  legalLimit.set([0x57, 0x41, 0x56, 0x45], 8)
  legalLimit.set([0x66, 0x6d, 0x74, 0x20], 12)
  const putU32 = (target, offset, value) => {
    target[offset] = value & 0xff
    target[offset + 1] = (value >> 8) & 0xff
    target[offset + 2] = (value >> 16) & 0xff
    target[offset + 3] = (value >>> 24) & 0xff
  }
  const putU16 = (target, offset, value) => {
    target[offset] = value & 0xff
    target[offset + 1] = (value >> 8) & 0xff
  }
  putU32(legalLimit, 16, 16)
  putU16(legalLimit, 20, 1)
  putU16(legalLimit, 22, 2)
  putU32(legalLimit, 24, 48000)
  putU32(legalLimit, 28, 48000 * 4)
  putU16(legalLimit, 32, 4)
  putU16(legalLimit, 34, 16)
  legalLimit.set([0x64, 0x61, 0x74, 0x61], 36)
  putU32(legalLimit, 40, legalDataSize)
  const legalOut = inspect(legalLimit)
  assert.equal(legalOut.ok, true, JSON.stringify(legalOut))
  assert.equal(legalOut.value.byteLength, limit)
  assert.equal(legalOut.value.dataByteLength, legalDataSize)
  assert.equal(legalOut.value.frameCount, 13107189)
  assert.equal(legalOut.value.sampleRate, 48000)
  assert.equal(legalOut.value.channels, 2)
  assert.equal(legalOut.value.durationMs, 273066.4375)
  assert.equal(legalOut.value.peak, 0)
  assert.equal(legalOut.value.mockOnly, true)
  assert.equal(legalOut.value.realOperationAllowed, false)
  // The same size with an inconsistent RIFF declaration is still refused by the outer length gate,
  // which is a rejection contrast, not a legal exact-limit success.

  // Exactly 300000 ms is legal, one more frame is not; fractional durations are not rounded.
  const framesAtLimit = (300000 * 16000) / 1000
  const atLimit = buildWav({ samples: new Array(framesAtLimit).fill(0) })
  const atLimitOut = inspect(atLimit)
  assert.equal(atLimitOut.ok, true)
  assert.equal(atLimitOut.value.durationMs, 300000)
  const overLimit = buildWav({ samples: new Array(framesAtLimit + 1).fill(0) })
  expectError(inspect(overLimit), 'RESOURCE_LIMIT')

  const fractional = inspect(buildWav({ samples: new Array(5).fill(0) }))
  assert.equal(fractional.ok, true)
  assert.equal(fractional.value.frameCount, 5)
  assert.equal(fractional.value.durationMs, 5 * 1000 / 16000)
  assert.equal(fractional.value.durationMs, 0.3125)
})

/* ------------------------------------------------- W05 ------------------------------------- */

test('W05 measured metrics and SHA256 on hand-built samples with a literal known vector', () => {
  // Independent oracle: SHA256 of these exact 76 bytes was computed outside the module.
  const vector = monoOneMs()
  const vectorOut = inspect(vector)
  assert.equal(vectorOut.value.sha256, '9d2b85f5df217dac492a908f7f42a837836ea165cfea7d34e0ff7a7038d4b65d')

  const silence = inspect(buildWav({ samples: new Array(10).fill(0) }))
  assert.equal(silence.value.peak, 0)
  assert.equal(silence.value.fullScaleSampleCount, 0)

  const rails = inspect(buildWav({ samples: [-32768, 32767, -32768, 0] }))
  assert.equal(rails.value.peak, 1)
  assert.equal(rails.value.fullScaleSampleCount, 3)
  assert.equal(rails.value.frameCount, 4)

  // Any byte of the file — data, header or a legal unknown-chunk pad — changes the whole-file hash.
  const changedData = Uint8Array.from(vector)
  changedData[48] = changedData[48] ^ 0xff
  assert.notEqual(inspect(changedData).value.sha256, vectorOut.value.sha256)
  const withChunk = buildWav({ samples: [16384, ...new Array(15).fill(0)], before: [{ id: 'note', payload: [1, 2] }] })
  assert.notEqual(inspect(withChunk).value.sha256, vectorOut.value.sha256)

  // The same data with an added pad-only change keeps the metrics but changes the hash.
  const paddedA = buildWav({ samples: [16384, ...new Array(15).fill(0)], before: [{ id: 'odd ', payload: [1] }] })
  const paddedB = Uint8Array.from(paddedA)
  const padIndex = 12 + 8 + 1
  paddedB[padIndex] = 0x55
  assert.equal(inspect(paddedB).value.dataByteLength, inspect(paddedA).value.dataByteLength)
  assert.notEqual(inspect(paddedB).value.sha256, inspect(paddedA).value.sha256)
})

/* ------------------------------------------------- W06 ------------------------------------- */

test('W06 input and output safety: carriers, descriptors and immutability', () => {
  const good = monoOneMs()
  assert.equal(inspect(good).ok, true)

  const inspectRoot = (root) => inspectFixtureWavBytes(root)
  expectError(inspectRoot({ schemaVersion: 1 }), 'INVALID_INPUT', '$')
  expectError(inspectRoot({ schemaVersion: 1, bytes: good, extra: 1 }), 'INVALID_INPUT', '<unknown-key>')
  expectError(inspectRoot({ schemaVersion: 2, bytes: good }), 'UNSUPPORTED_VERSION', 'schemaVersion')
  expectError(inspectRoot(null), 'INVALID_INPUT', '$')
  // Each carrier is passed at the level the public entry expects, so the real native object arrives.
  const inspectCarrier = (bytes) => inspectRoot({ schemaVersion: 1, bytes })
  expectError(inspectCarrier('RIFF'), 'INVALID_BYTES', 'bytes')
  expectError(inspectCarrier(Array.from(good)), 'INVALID_BYTES', 'bytes')
  expectError(inspectCarrier(Buffer.from(good).toString('base64')), 'INVALID_BYTES', 'bytes')
  expectError(inspectCarrier(new DataView(good.buffer)), 'INVALID_BYTES', 'bytes')
  expectError(inspectCarrier(new Uint16Array(4)), 'INVALID_BYTES', 'bytes')
  expectError(inspectCarrier(new Proxy(good, {})), 'INVALID_BYTES', 'bytes')
  expectError(inspectCarrier(Object.create(Uint8Array.prototype)), 'INVALID_BYTES', 'bytes')
  expectError(inspectCarrier(new Uint8Array(0)), 'INVALID_CONTAINER', '$')

  if (typeof SharedArrayBuffer === 'function') {
    const sharedBuffer = new SharedArrayBuffer(76)
    const shared = new Uint8Array(sharedBuffer)
    shared.set(good)
    assert.equal(shared.buffer instanceof SharedArrayBuffer, true)
    expectError(inspectCarrier(shared), 'INVALID_BYTES', 'bytes')
  }
  const resizable = new ArrayBuffer(76, { maxByteLength: 152 })
  const resizableView = new Uint8Array(resizable)
  resizableView.set(good)
  assert.equal(resizable.resizable, true)
  expectError(inspectCarrier(resizableView), 'INVALID_BYTES', 'bytes')
  const detachedBuffer = new ArrayBuffer(76)
  const detachedView = new Uint8Array(detachedBuffer)
  detachedView.set(good)
  structuredClone(detachedBuffer, { transfer: [detachedBuffer] })
  assert.equal(detachedBuffer.byteLength, 0)
  assert.equal(detachedView.byteLength, 0)
  expectError(inspectCarrier(detachedView), 'INVALID_BYTES', 'bytes')

  // A successful and a failed call never share a mutable object; both graphs are frozen and fresh.
  const firstSuccess = inspect(good)
  const secondSuccess = inspect(Uint8Array.from(good))
  assert.notEqual(firstSuccess, secondSuccess)
  assert.notEqual(firstSuccess.value, secondSuccess.value)
  const firstFailure = inspectCarrier('RIFF')
  const secondFailure = inspectCarrier('RIFF')
  assert.notEqual(firstFailure, secondFailure)
  assert.notEqual(firstFailure.errors, secondFailure.errors)
  assert.notEqual(firstFailure.errors[0], secondFailure.errors[0])
  assert.equal(Object.isFrozen(firstSuccess), true)
  assert.equal(Object.isFrozen(firstSuccess.value), true)
  assert.equal(Object.isFrozen(firstFailure), true)
  assert.equal(Object.isFrozen(firstFailure.errors[0]), true)
  assert.equal(JSON.stringify(firstSuccess), JSON.stringify(secondSuccess))

  // Root hidden key, Symbol key and accessors are refused without running the getter.
  const hidden = { schemaVersion: 1, bytes: good }
  Object.defineProperty(hidden, 'hiddenNote', { value: 1, enumerable: false })
  expectError(inspectRoot(hidden), 'INVALID_INPUT', '<unknown-key>')
  const symbol = { schemaVersion: 1, bytes: good }
  symbol[Symbol('secret')] = 1
  expectError(inspectRoot(symbol), 'INVALID_INPUT', '<unknown-key>')
  let getterCalls = 0
  const accessor = { schemaVersion: 1 }
  Object.defineProperty(accessor, 'bytes', {
    enumerable: true,
    get() {
      getterCalls += 1
      return good
    },
  })
  expectError(inspectRoot(accessor), 'INVALID_INPUT', '$')
  assert.equal(getterCalls, 0)

  // Output is a fresh fully frozen graph with no reference to the input bytes.
  const result = inspect(good)
  const seen = new Set()
  const walk = (value) => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    assert.equal(Object.isFrozen(value), true)
    for (const key of Reflect.ownKeys(value)) walk(Object.getOwnPropertyDescriptor(value, key).value)
  }
  walk(result)
  assert.notEqual(result.value, good)
  for (const value of seen) assert.notEqual(value, good.buffer)

  // Fixed budgets cannot be changed and no binary content leaks into the result.
  assert.equal(Object.isFrozen(WAV_BYTE_LIMITS), true)
  assert.equal(Object.isFrozen(WAV_BYTE_LIMITS.sampleRates), true)
  assert.equal(Object.isFrozen(WAV_BYTE_LIMITS.channels), true)
  const encoded = JSON.stringify(result)
  assert.equal(encoded.includes('RIFF'), false)
  assert.equal(encoded.includes('WAVE'), false)
})

/* ------------------------------------------------- W07 ------------------------------------- */

function docExample(heading) {
  const doc = fs.readFileSync('docs/SOURCE_ARTIFACTS_OFFLINE.md', 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, heading)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function patchMetadata(node, values) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) patchMetadata(item, values)
    return
  }
  const keys = Object.keys(node)
  if (
    keys.length === 4 &&
    typeof node.durationMs === 'number' &&
    typeof node.byteLength === 'number' &&
    typeof node.sampleRate === 'number' &&
    typeof node.channels === 'number'
  ) {
    node.durationMs = values.durationMs
    node.byteLength = values.byteLength
    node.sampleRate = values.sampleRate
    node.channels = values.channels
    return
  }
  for (const key of keys) patchMetadata(node[key], values)
}

test('W07 the old SVC source contract links with the measured four values and rejects mismatches', () => {
  const wav = monoOneMs()
  const measured = inspect(wav)
  assert.equal(measured.ok, true)
  assert.equal(measured.value.durationMs, 1)

  const example = docExample('## 8. SVC完整示例')
  patchMetadata(example, measured.value)
  const linked = resolveFixtureTaskSource(example)
  assert.equal(linked.ok, true, JSON.stringify(linked))
  assert.equal(linked.value.decision, 'FIXTURE_SOURCE_LINKED')

  const mismatch = docExample('## 8. SVC完整示例')
  patchMetadata(mismatch, measured.value)
  mismatch.voiceBinding.negotiation.request.inputAudio.durationMs += 1
  const rejected = resolveFixtureTaskSource(mismatch)
  assert.equal(rejected.ok, true)
  assert.equal(rejected.value.decision, 'BLOCKED')
  assert.equal(rejected.value.reason, 'SOURCE_ARTIFACT_SOURCE_AUDIO_MISMATCH')
})

/* ------------------------------------------------- W08 ------------------------------------- */

test('W08 documented examples run as written and the module stays storage-free', () => {
  const doc = fs.readFileSync('docs/WAV_BYTES_OFFLINE.md', 'utf8')
  assert.match(doc, /WAV_BYTES_INVALID_CONTAINER/)

  const extractHex = (heading) => {
    const at = doc.indexOf(heading)
    assert.ok(at >= 0, heading)
    const fence = doc.indexOf('```json', at)
    const close = doc.indexOf('```', fence + 7)
    const parsed = JSON.parse(doc.slice(fence + 7, close).trim())
    return Uint8Array.from(Buffer.from(parsed.bytesHex, 'hex'))
  }

  const okBytes = extractHex('## 7. 成功示例')
  const ok = inspect(okBytes)
  assert.equal(ok.ok, true, JSON.stringify(ok))
  assert.equal(ok.value.frameCount, 16)
  assert.equal(ok.value.durationMs, 1)
  assert.equal(ok.value.peak, 0.5)
  assert.equal(ok.value.sha256, '9d2b85f5df217dac492a908f7f42a837836ea165cfea7d34e0ff7a7038d4b65d')

  const badBytes = extractHex('## 8. 失败示例')
  expectError(inspect(badBytes), 'INVALID_CONTAINER', '$')

  const source = fs.readFileSync('core/audio/wav-byte-inspector.mjs', 'utf8')
  assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(|Math\.random|Date\.now/)
  assert.match(source, /node:crypto/)
  assert.equal(WAV_BYTES_SCHEMA_VERSION, 1)
  assert.equal(Object.keys(WAV_BYTE_ERRORS).length, 8)
  for (const [key, code] of Object.entries(WAV_BYTE_ERRORS)) assert.equal(code, 'WAV_BYTES_' + key)
})
