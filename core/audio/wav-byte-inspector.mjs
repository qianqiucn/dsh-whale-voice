/* Whale Voice — bounded WAV byte inspector (Plan 08-E-A, OFFLINE / FIXTURE_ONLY).
 *
 * One synchronous, storage-free入口 that inspects caller-supplied WAV bytes: it copies the native
 * view once, parses the complete RIFF/WAVE container inside fixed budgets, derives the measured
 * metadata and the SHA256 of the whole owned file, and returns a frozen 19-key value or a single
 * fixed error. It has no file, network, process, clock, random, playback or decoder access, issues
 * no id, does not touch Task/owner/store, and never claims a registered Artifact or user rights.
 *
 * Supported profile (this inspector's policy, not a statement about every WAV or backend): RIFF/WAVE,
 * formatTag 1 PCM, 16-bit, sampleRate 16000/22050/24000/32000/44100/48000, channels 1-2, full file
 * <= 50 MiB, duration <= 300000 ms, at most 128 top-level chunks. RIFX/RF64/bare PCM/compressed/
 * float/extensible and every other encoding are explicitly unsupported.
 */

import crypto from 'node:crypto'

import { deepFreezeFixtureValue } from './fixture-input-boundary.mjs'

export const WAV_BYTES_SCHEMA_VERSION = 1

const SAMPLE_RATES = Object.freeze([16000, 22050, 24000, 32000, 44100, 48000])
const CHANNELS = Object.freeze([1, 2])

export const WAV_BYTE_LIMITS = Object.freeze({
  maxByteLength: 52428800,
  maxDurationMs: 300000,
  maxChunks: 128,
  bitsPerSample: 16,
  sampleRates: SAMPLE_RATES,
  channels: CHANNELS,
})

export const WAV_BYTE_ERRORS = Object.freeze({
  INVALID_INPUT: 'WAV_BYTES_INVALID_INPUT',
  UNSUPPORTED_VERSION: 'WAV_BYTES_UNSUPPORTED_VERSION',
  INVALID_BYTES: 'WAV_BYTES_INVALID_BYTES',
  RESOURCE_LIMIT: 'WAV_BYTES_RESOURCE_LIMIT',
  UNSUPPORTED_FORMAT: 'WAV_BYTES_UNSUPPORTED_FORMAT',
  INVALID_CONTAINER: 'WAV_BYTES_INVALID_CONTAINER',
  INVALID_PCM: 'WAV_BYTES_INVALID_PCM',
  INTERNAL_FAILURE: 'WAV_BYTES_INTERNAL_FAILURE',
})

const REASONS = Object.freeze({
  INVALID_INPUT: 'input must be exactly {schemaVersion, bytes}',
  UNSUPPORTED_VERSION: 'unsupported schema version',
  INVALID_BYTES: 'bytes must be a real Uint8Array view',
  RESOURCE_LIMIT: 'byte, chunk or duration budget exceeded',
  UNSUPPORTED_FORMAT: 'WAV container or format is outside the supported profile',
  INVALID_CONTAINER: 'RIFF/WAVE container is truncated or inconsistent',
  INVALID_PCM: 'PCM16 parameters or data are inconsistent',
  INTERNAL_FAILURE: 'internal failure',
})

const MESSAGE_ZH = '演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。'
const ROOT_KEYS = Object.freeze(['schemaVersion', 'bytes'])

class WavFailure extends Error {
  constructor(key, path) {
    super(key)
    this.key = key
    this.path = path
  }
}

function fail(key, path) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [
      {
        code: WAV_BYTE_ERRORS[key],
        path,
        reason: REASONS[key],
      },
    ],
  })
}

function raise(key, path) {
  throw new WavFailure(key, path)
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function ownDataField(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return { ok: false }
  if (descriptor.enumerable !== true) return { ok: false }
  return { ok: true, value: descriptor.value }
}

/* ------------------------- native view boundary (no user overrides) ------------------------- */

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)
const TYPED_ARRAY_TAG = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get
const VIEW_BUFFER = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get
const VIEW_BYTE_LENGTH = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get
const VIEW_BYTE_OFFSET = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get
const ARRAY_BUFFER_RESIZABLE = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable').get
const ARRAY_BUFFER_MAX = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'maxByteLength').get
/**
 * Detachment probe that never consults the caller's `constructor`, `Symbol.species`, iterator or any
 * other property: the platform `detached` getter reads the internal slot only, and the fallback is
 * an intrinsic zero-range view over the already-confirmed native backing buffer. Both are
 * species-free, so shadowed constructor/species getters and user constructors are never executed.
 */
const ARRAY_BUFFER_DETACHED = (() => {
  const descriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'detached')
  return descriptor && typeof descriptor.get === 'function' ? descriptor.get : null
})()

function isDetachedBuffer(buffer) {
  if (ARRAY_BUFFER_DETACHED !== null) {
    try {
      return ARRAY_BUFFER_DETACHED.call(buffer) === true
    } catch {
      return true
    }
  }
  try {
    // Intrinsic %TypedArray% construction over an ArrayBuffer reads only internal slots.
    new Uint8Array(buffer, 0, 0)
    return false
  } catch {
    return true
  }
}

/**
 * Read the real native slots of a Uint8Array (including Buffer) through trusted intrinsics only.
 * A Proxy, a forged prototype, an array, a string, a DataView or any other typed array fails the
 * brand/slot check and is rejected; user overrides of length/byteLength/buffer are never consulted.
 */
function nativeView(value) {
  if (value === null || typeof value !== 'object') return null
  let tag
  let buffer
  let byteLength
  let byteOffset
  try {
    tag = TYPED_ARRAY_TAG.call(value)
    buffer = VIEW_BUFFER.call(value)
    byteLength = VIEW_BYTE_LENGTH.call(value)
    byteOffset = VIEW_BYTE_OFFSET.call(value)
  } catch {
    return null
  }
  if (tag !== 'Uint8Array') return null
  if (!Number.isInteger(byteLength) || byteLength < 0) return null
  if (!Number.isInteger(byteOffset) || byteOffset < 0) return null
  let bufferLength
  let resizable
  let maxLength
  try {
    bufferLength = ARRAY_BUFFER_BYTE_LENGTH.call(buffer)
    resizable = ARRAY_BUFFER_RESIZABLE.call(buffer)
    maxLength = ARRAY_BUFFER_MAX.call(buffer)
  } catch {
    return null
  }
  if (resizable === true) return null
  if (!Number.isInteger(maxLength) || maxLength !== bufferLength) return null
  if (bufferLength === 0 && isDetachedBuffer(buffer)) return null
  if (byteOffset + byteLength > bufferLength) return null
  if (byteLength > 0 && bufferLength === 0) return null
  return { buffer, byteLength, byteOffset }
}

function copyOwnedBytes(source, byteLength) {
  const owned = new Uint8Array(byteLength)
  if (owned.length !== byteLength) return null
  Uint8Array.prototype.set.call(owned, source)
  return owned
}

/* ------------------------------------- RIFF/WAVE parsing ----------------------------------- */

function readTag(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function findChunks(bytes) {
  const length = bytes.length
  let offset = 12
  let chunks = 0
  let fmt = null
  let data = null
  while (offset < length) {
    if (offset + 8 > length) raise('INVALID_CONTAINER', '$')
    const id = readTag(bytes, offset)
    const size = readU32(bytes, offset + 4)
    const payload = offset + 8
    if (payload + size > length) raise('INVALID_CONTAINER', '$')
    const padded = payload + size + (size % 2)
    if (padded > length) raise('INVALID_CONTAINER', '$')
    chunks += 1
    if (chunks > WAV_BYTE_LIMITS.maxChunks) raise('RESOURCE_LIMIT', '$')
    if (id === 'fmt ') {
      if (fmt !== null) raise('INVALID_CONTAINER', '$')
      fmt = { offset: payload, size }
    } else if (id === 'data') {
      if (data !== null) raise('INVALID_CONTAINER', '$')
      data = { offset: payload, size }
    }
    offset = padded
  }
  if (offset !== length) raise('INVALID_CONTAINER', '$')
  if (fmt === null || data === null) raise('INVALID_CONTAINER', '$')
  if (data.size === 0) raise('INVALID_CONTAINER', '$')
  return { fmt, data }
}

function readFormat(bytes, fmt) {
  if (fmt.size < 16) raise('INVALID_CONTAINER', '$')
  if (fmt.size !== 16) {
    if (fmt.size !== 18) raise('UNSUPPORTED_FORMAT', '$')
    if (bytes[fmt.offset + 16] !== 0 || bytes[fmt.offset + 17] !== 0) raise('UNSUPPORTED_FORMAT', '$')
  }
  const formatTag = readU16(bytes, fmt.offset)
  const channels = readU16(bytes, fmt.offset + 2)
  const sampleRate = readU32(bytes, fmt.offset + 4)
  const byteRate = readU32(bytes, fmt.offset + 8)
  const blockAlign = readU16(bytes, fmt.offset + 12)
  const bitsPerSample = readU16(bytes, fmt.offset + 14)
  if (formatTag !== 1) raise('UNSUPPORTED_FORMAT', '$')
  if (bitsPerSample !== WAV_BYTE_LIMITS.bitsPerSample) raise('UNSUPPORTED_FORMAT', '$')
  if (!SAMPLE_RATES.includes(sampleRate)) raise('UNSUPPORTED_FORMAT', '$')
  if (!CHANNELS.includes(channels)) raise('UNSUPPORTED_FORMAT', '$')
  if (blockAlign !== channels * 2) raise('INVALID_PCM', '$')
  if (byteRate !== sampleRate * blockAlign) raise('INVALID_PCM', '$')
  return { channels, sampleRate, byteRate, blockAlign, bitsPerSample }
}

function inspectOwned(owned) {
  const length = owned.length
  if (length < 12) raise('INVALID_CONTAINER', '$')
  const riff = readTag(owned, 0)
  if (riff !== 'RIFF') {
    if (riff === 'RIFX' || riff === 'RF64') raise('UNSUPPORTED_FORMAT', '$')
    raise('INVALID_CONTAINER', '$')
  }
  if (readTag(owned, 8) !== 'WAVE') raise('UNSUPPORTED_FORMAT', '$')
  if (readU32(owned, 4) !== length - 8) raise('INVALID_CONTAINER', '$')

  const { fmt, data } = findChunks(owned)
  const format = readFormat(owned, fmt)
  if (data.size % format.blockAlign !== 0) raise('INVALID_PCM', '$')
  const frameCount = data.size / format.blockAlign
  if (frameCount <= 0) raise('INVALID_CONTAINER', '$')
  if (frameCount * 1000 > WAV_BYTE_LIMITS.maxDurationMs * format.sampleRate) raise('RESOURCE_LIMIT', '$')

  let peakMagnitude = 0
  let fullScaleSampleCount = 0
  for (let index = 0; index < data.size; index += 2) {
    const raw = readU16(owned, data.offset + index)
    const sample = raw > 0x7fff ? raw - 0x10000 : raw
    const magnitude = sample < 0 ? -sample : sample
    if (magnitude > peakMagnitude) peakMagnitude = magnitude
    if (sample === -32768 || sample === 32767) fullScaleSampleCount += 1
  }

  return {
    schemaVersion: WAV_BYTES_SCHEMA_VERSION,
    format: 'WAV',
    codec: 'PCM_S16LE',
    bitsPerSample: format.bitsPerSample,
    sampleRate: format.sampleRate,
    channels: format.channels,
    byteLength: length,
    dataByteLength: data.size,
    frameCount,
    durationMs: (frameCount * 1000) / format.sampleRate,
    peak: peakMagnitude / 32768,
    fullScaleSampleCount,
    sha256: crypto.createHash('sha256').update(owned).digest('hex'),
    validationState: 'FIXTURE_WAV_CHECKED',
    mockOnly: true,
    realOperationAllowed: false,
    submitAllowed: false,
    automaticRetryAllowed: false,
    messageZh: MESSAGE_ZH,
  }
}

/* ------------------------------------------ entry ------------------------------------------ */

function readRoot(input) {
  if (!isPlainObject(input)) raise('INVALID_INPUT', '$')
  let keys
  try {
    keys = Reflect.ownKeys(input)
  } catch {
    raise('INVALID_INPUT', '$')
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !ROOT_KEYS.includes(key)) raise('INVALID_INPUT', '<unknown-key>')
  }
  if (keys.length !== ROOT_KEYS.length) raise('INVALID_INPUT', '$')
  const version = ownDataField(input, 'schemaVersion')
  if (!version.ok) raise('INVALID_INPUT', '$')
  if (version.value !== WAV_BYTES_SCHEMA_VERSION) raise('UNSUPPORTED_VERSION', 'schemaVersion')
  const bytes = ownDataField(input, 'bytes')
  if (!bytes.ok) raise('INVALID_INPUT', '$')
  return bytes.value
}

function inspect(input) {
  const value = readRoot(input)
  const view = nativeView(value)
  if (view === null) raise('INVALID_BYTES', 'bytes')
  if (view.byteLength > WAV_BYTE_LIMITS.maxByteLength) raise('RESOURCE_LIMIT', 'bytes')
  const owned = copyOwnedBytes(value, view.byteLength)
  if (owned === null) raise('INVALID_BYTES', 'bytes')
  return inspectOwned(owned)
}

/**
 * Inspect caller-supplied WAV bytes inside fixed budgets.
 * @param {{schemaVersion: 1, bytes: Uint8Array|Buffer}} input
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<object>}}
 */
export function inspectFixtureWavBytes(input) {
  try {
    return deepFreezeFixtureValue({ ok: true, value: inspect(input) })
  } catch (error) {
    if (error instanceof WavFailure) return fail(error.key, error.path)
    return fail('INTERNAL_FAILURE', '$')
  }
}
