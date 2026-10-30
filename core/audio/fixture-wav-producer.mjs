/* Whale Voice — Plan 08-E-C restricted PCM16 fixture signal producer.
 *
 * One pure, synchronous and bounded function builds a real PCM16 WAV entirely in memory from a
 * five-field request, then re-checks exactly those final bytes once with the verified 08-E-A
 * inspector. The module reads no file, network, clock, random, model or device, keeps no state
 * between calls and signs no Task/Artifact id: the output is an artificial test signal, not a
 * TTS/RVC result, not a rights/ownership proof and never a saved Task.
 */

import { inspectFixtureWavBytes } from './wav-byte-inspector.mjs'

export const FIXTURE_WAV_PRODUCER_SCHEMA_VERSION = 1

export const FIXTURE_WAV_PRODUCER_LIMITS = Object.freeze({
  maxByteLength: 1048576,
  sampleRates: Object.freeze([16000, 22050, 24000, 32000, 44100, 48000]),
  channels: Object.freeze([1, 2]),
  patterns: Object.freeze(['SILENCE', 'EDGE_SEQUENCE']),
})

export const FIXTURE_WAV_PRODUCER_ERRORS = Object.freeze({
  INVALID_INPUT: 'FIXTURE_WAV_PRODUCER_INVALID_INPUT',
  UNSUPPORTED_VERSION: 'FIXTURE_WAV_PRODUCER_UNSUPPORTED_VERSION',
  UNSUPPORTED_FORMAT: 'FIXTURE_WAV_PRODUCER_UNSUPPORTED_FORMAT',
  INVALID_PCM: 'FIXTURE_WAV_PRODUCER_INVALID_PCM',
  RESOURCE_LIMIT: 'FIXTURE_WAV_PRODUCER_RESOURCE_LIMIT',
  DEPENDENCY_FAILURE: 'FIXTURE_WAV_PRODUCER_DEPENDENCY_FAILURE',
  INTERNAL_FAILURE: 'FIXTURE_WAV_PRODUCER_INTERNAL_FAILURE',
})

const ROOT_KEYS = Object.freeze(['schemaVersion', 'sampleRate', 'channels', 'frameCount', 'pattern'])
const SAMPLE_RATES = FIXTURE_WAV_PRODUCER_LIMITS.sampleRates
const CHANNELS = FIXTURE_WAV_PRODUCER_LIMITS.channels
const PATTERNS = FIXTURE_WAV_PRODUCER_LIMITS.patterns
const MAX_BYTE_LENGTH = FIXTURE_WAV_PRODUCER_LIMITS.maxByteLength
const HEADER_BYTES = 44
const EDGE_SEQUENCE = Object.freeze([-32768, -16384, 0, 16384, 32767])
const MESSAGE_ZH = '已生成演示PCM16测试信号；不是TTS或翻唱结果，也不代表保存或发送。'
/* The 08-E-A inspector's fixed success message: the dependency contract is exact, so any other
 * non-empty text (even with every other measurement field unchanged) is a protocol failure. */
const INSPECTION_MESSAGE_ZH = '演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。'

const REASONS = Object.freeze({
  INVALID_INPUT: 'invalid fixture input',
  UNSUPPORTED_VERSION: 'unsupported fixture version',
  UNSUPPORTED_FORMAT: 'unsupported fixture format',
  INVALID_PCM: 'invalid PCM frame count',
  RESOURCE_LIMIT: 'fixture byte budget exceeded',
  DEPENDENCY_FAILURE: 'fixture inspection unavailable',
  INTERNAL_FAILURE: 'internal fixture failure',
})

/* The exact 19-key success measurement of the 08-E-A inspector. Only these keys, read as data
 * descriptors, are accepted; anything else is a dependency protocol failure. */
const MEASUREMENT_KEYS = Object.freeze([
  'schemaVersion',
  'format',
  'codec',
  'bitsPerSample',
  'sampleRate',
  'channels',
  'byteLength',
  'dataByteLength',
  'frameCount',
  'durationMs',
  'peak',
  'fullScaleSampleCount',
  'sha256',
  'validationState',
  'mockOnly',
  'realOperationAllowed',
  'submitAllowed',
  'automaticRetryAllowed',
  'messageZh',
])

class ProducerFailure {
  constructor(key, path) {
    this.key = key
    this.path = path
  }
}

class DependencyFailure extends ProducerFailure {
  constructor() {
    super('DEPENDENCY_FAILURE', '$')
  }
}

function raise(key, path) {
  throw new ProducerFailure(key, path)
}

function raiseDependency() {
  throw new DependencyFailure()
}

/* ------------------------------------------- input reads ------------------------------------- */

function isPlainRoot(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  let proto
  try {
    proto = Object.getPrototypeOf(value)
  } catch {
    return false
  }
  return proto === Object.prototype || proto === null
}

/** Own, enumerable, data-only descriptor; never invokes an accessor. */
function ownDataDescriptor(target, key) {
  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(target, key)
  } catch {
    return null
  }
  if (descriptor === undefined) return null
  if (!descriptor.enumerable) return null
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null
  return descriptor
}

function readRequest(input) {
  if (!isPlainRoot(input)) raise('INVALID_INPUT', '$')
  let keys
  try {
    keys = Reflect.ownKeys(input)
  } catch {
    raise('INVALID_INPUT', '$')
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !ROOT_KEYS.includes(key)) raise('INVALID_INPUT', '<unknown-key>')
  }
  const snapshot = {}
  for (const key of ROOT_KEYS) {
    const descriptor = ownDataDescriptor(input, key)
    if (descriptor === null) raise('INVALID_INPUT', key)
    snapshot[key] = descriptor.value
  }
  return snapshot
}

/* ---------------------------------------- value validation ----------------------------------- */

function requireBoundedRequest(request) {
  const version = request.schemaVersion
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0) {
    raise('INVALID_INPUT', 'schemaVersion')
  }
  if (version !== FIXTURE_WAV_PRODUCER_SCHEMA_VERSION) raise('UNSUPPORTED_VERSION', 'schemaVersion')

  const sampleRate = request.sampleRate
  if (typeof sampleRate !== 'number' || !Number.isInteger(sampleRate) || !Number.isFinite(sampleRate)) {
    raise('INVALID_INPUT', 'sampleRate')
  }
  if (!SAMPLE_RATES.includes(sampleRate)) raise('UNSUPPORTED_FORMAT', 'sampleRate')

  const channels = request.channels
  if (typeof channels !== 'number' || !Number.isInteger(channels) || !Number.isFinite(channels)) {
    raise('INVALID_INPUT', 'channels')
  }
  if (!CHANNELS.includes(channels)) raise('UNSUPPORTED_FORMAT', 'channels')

  const pattern = request.pattern
  if (typeof pattern !== 'string') raise('INVALID_INPUT', 'pattern')
  if (!PATTERNS.includes(pattern)) raise('UNSUPPORTED_FORMAT', 'pattern')

  const frameCount = request.frameCount
  if (typeof frameCount !== 'number' || !Number.isSafeInteger(frameCount) || frameCount <= 0) {
    raise('INVALID_PCM', 'frameCount')
  }

  // Budget first: the cap is checked before any multiplication, allocation or loop, so an
  // over-budget request never allocates an output or reaches the inspector.
  const blockAlign = channels * 2
  const maxFrames = Math.floor((MAX_BYTE_LENGTH - HEADER_BYTES) / blockAlign)
  if (frameCount > maxFrames) raise('RESOURCE_LIMIT', 'frameCount')
  return { sampleRate, channels, pattern, frameCount, blockAlign }
}

/* ----------------------------------------- WAV construction ---------------------------------- */

function writeTag(bytes, offset, tag) {
  for (let index = 0; index < 4; index += 1) bytes[offset + index] = tag.charCodeAt(index)
}

function writeU16(bytes, offset, value) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
  bytes[offset + 3] = (value >>> 24) & 0xff
}

function buildWav({ sampleRate, channels, pattern, frameCount, blockAlign }) {
  const dataByteLength = frameCount * blockAlign
  const byteLength = HEADER_BYTES + dataByteLength
  const bytes = new Uint8Array(byteLength)
  writeTag(bytes, 0, 'RIFF')
  writeU32(bytes, 4, byteLength - 8)
  writeTag(bytes, 8, 'WAVE')
  writeTag(bytes, 12, 'fmt ')
  writeU32(bytes, 16, 16)
  writeU16(bytes, 20, 1)
  writeU16(bytes, 22, channels)
  writeU32(bytes, 24, sampleRate)
  writeU32(bytes, 28, sampleRate * blockAlign)
  writeU16(bytes, 32, blockAlign)
  writeU16(bytes, 34, 16)
  writeTag(bytes, 36, 'data')
  writeU32(bytes, 40, dataByteLength)
  if (pattern === 'EDGE_SEQUENCE') {
    const samples = frameCount * channels
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
      const value = EDGE_SEQUENCE[sampleIndex % EDGE_SEQUENCE.length]
      const offset = HEADER_BYTES + sampleIndex * 2
      bytes[offset] = value & 0xff
      bytes[offset + 1] = (value >>> 8) & 0xff
    }
  }
  return bytes
}

/* ------------------------------------- dependency thin guard -------------------------------- */

function inspectFinalBytes(bytes, expected) {
  let result
  try {
    result = inspectFixtureWavBytes({ schemaVersion: 1, bytes })
  } catch {
    raiseDependency()
  }
  if (result === null || typeof result !== 'object' || Array.isArray(result)) raiseDependency()
  let rootKeys
  try {
    rootKeys = Reflect.ownKeys(result)
  } catch {
    raiseDependency()
  }
  if (rootKeys.length !== 2) raiseDependency()
  for (const key of rootKeys) {
    if (key !== 'ok' && key !== 'value') raiseDependency()
  }
  const okDescriptor = ownDataDescriptor(result, 'ok')
  if (okDescriptor === null || okDescriptor.value !== true) raiseDependency()
  const valueDescriptor = ownDataDescriptor(result, 'value')
  if (valueDescriptor === null) raiseDependency()
  const measurement = valueDescriptor.value
  if (measurement === null || typeof measurement !== 'object' || Array.isArray(measurement)) raiseDependency()
  let measurementKeys
  try {
    measurementKeys = Reflect.ownKeys(measurement)
  } catch {
    raiseDependency()
  }
  if (measurementKeys.length !== MEASUREMENT_KEYS.length) raiseDependency()
  const fields = {}
  for (const key of MEASUREMENT_KEYS) {
    if (!measurementKeys.includes(key)) raiseDependency()
    const descriptor = ownDataDescriptor(measurement, key)
    if (descriptor === null) raiseDependency()
    fields[key] = descriptor.value
  }
  if (fields.schemaVersion !== 1) raiseDependency()
  if (fields.format !== 'WAV' || fields.codec !== 'PCM_S16LE' || fields.bitsPerSample !== 16) raiseDependency()
  if (fields.sampleRate !== expected.sampleRate) raiseDependency()
  if (fields.channels !== expected.channels) raiseDependency()
  if (fields.frameCount !== expected.frameCount) raiseDependency()
  if (fields.dataByteLength !== expected.dataByteLength) raiseDependency()
  if (fields.byteLength !== bytes.length) raiseDependency()
  if (typeof fields.durationMs !== 'number' || !Number.isFinite(fields.durationMs)) raiseDependency()
  if (fields.durationMs !== (expected.frameCount * 1000) / expected.sampleRate) raiseDependency()
  if (typeof fields.peak !== 'number' || !Number.isFinite(fields.peak)) raiseDependency()
  if (fields.peak < 0 || fields.peak > 1) raiseDependency()
  const sampleTotal = expected.frameCount * expected.channels
  if (!Number.isSafeInteger(fields.fullScaleSampleCount)) raiseDependency()
  if (fields.fullScaleSampleCount < 0 || fields.fullScaleSampleCount > sampleTotal) raiseDependency()
  if (typeof fields.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(fields.sha256)) raiseDependency()
  if (fields.validationState !== 'FIXTURE_WAV_CHECKED') raiseDependency()
  if (fields.mockOnly !== true) raiseDependency()
  if (fields.realOperationAllowed !== false) raiseDependency()
  if (fields.submitAllowed !== false) raiseDependency()
  if (fields.automaticRetryAllowed !== false) raiseDependency()
  if (fields.messageZh !== INSPECTION_MESSAGE_ZH) raiseDependency()
  if (!Object.isFrozen(measurement)) raiseDependency()
  return measurement
}

/* ---------------------------------------------- entry -------------------------------------- */

function failure(key, path) {
  const error = { code: FIXTURE_WAV_PRODUCER_ERRORS[key], path, reason: REASONS[key] }
  const errors = Object.freeze([Object.freeze(error)])
  return Object.freeze({ ok: false, errors })
}

/**
 * Build one bounded synthetic PCM16 WAV and re-check its final bytes once with the 08-E-A inspector.
 * @param {{schemaVersion:1,sampleRate:number,channels:number,frameCount:number,pattern:string}} input
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<object>}}
 */
export function produceFixtureWav(input) {
  try {
    const request = readRequest(input)
    const bounded = requireBoundedRequest(request)
    const bytes = buildWav(bounded)
    const inspection = inspectFinalBytes(bytes, {
      sampleRate: bounded.sampleRate,
      channels: bounded.channels,
      frameCount: bounded.frameCount,
      dataByteLength: bounded.frameCount * bounded.blockAlign,
    })
    const value = Object.freeze({
      schemaVersion: FIXTURE_WAV_PRODUCER_SCHEMA_VERSION,
      origin: 'SYNTHETIC_FIXTURE',
      bytes,
      inspection,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
      messageZh: MESSAGE_ZH,
    })
    return Object.freeze({ ok: true, value })
  } catch (error) {
    if (error instanceof ProducerFailure) return failure(error.key, error.path)
    return failure('INTERNAL_FAILURE', '$')
  }
}
