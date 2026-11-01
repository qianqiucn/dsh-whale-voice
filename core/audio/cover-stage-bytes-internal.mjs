/**
 * Cover stage bytes — the deterministic Synthetic Fixture graphs.
 *
 * Implements the contract's three graphs with integer-only maths:
 *   MIXED + WITH_INSTRUMENTAL: SOURCE -> {VOCAL, INSTRUMENTAL} -> CONVERTED -> MASTER
 *   MIXED + VOCAL_ONLY:        SOURCE -> {VOCAL, INSTRUMENTAL} -> CONVERTED -> MASTER
 *   CLEAN_VOCAL + VOCAL_ONLY:  SOURCE -> CONVERTED -> MASTER
 *
 * Everything here is pure and in-memory: no I/O, clock or random. The result is a set of owned
 * Buffers plus the real inspector's 19-key facts. This is NOT real separation, RVC inference or
 * mixing; `origin` stays `SYNTHETIC_FIXTURE` and the truth levels are `MEASURED_SYNTHETIC`.
 */
import { sha256 } from './fixture-store-base-internal.mjs'
import { inspectFixtureWavBytes } from './wav-byte-inspector.mjs'

export const COVER_STAGE_GRAPH_VERSION = 1
export const COVER_STAGE_MAX_BYTES = 1048576
export const COVER_STAGE_MIN_BYTES = 44
export const COVER_STAGE_CHANNELS = 1
export const COVER_STAGE_SAMPLE_RATES = Object.freeze([16000, 22050, 24000, 32000, 44100, 48000])

export const COVER_STAGE_CODES = Object.freeze({
  INPUT_INVALID: 'COVER_STAGE_INPUT_INVALID',
  RESOURCE_LIMIT: 'COVER_STAGE_RESOURCE_LIMIT',
  INVALID_WAV: 'COVER_STAGE_INVALID_WAV',
})

export const COVER_STAGE_ERRORS = Object.freeze(
  Object.fromEntries(Object.entries(COVER_STAGE_CODES).map(([key, code]) => [key, code])),
)

/** Integer permille gain table for every whole dB in -24..12 (`round(1000 * 10^(dB/20))`). */
export const COVER_GAIN_PERMILLE = Object.freeze({
  '-24': 63, '-23': 71, '-22': 79, '-21': 89, '-20': 100, '-19': 112, '-18': 126,
  '-17': 141, '-16': 158, '-15': 178, '-14': 200, '-13': 224, '-12': 251,
  '-11': 282, '-10': 316, '-9': 355, '-8': 398, '-7': 447, '-6': 501, '-5': 562,
  '-4': 631, '-3': 708, '-2': 794, '-1': 891, '0': 1000, '1': 1122, '2': 1259,
  '3': 1413, '4': 1585, '5': 1778, '6': 1995, '7': 2239, '8': 2512, '9': 2818,
  '10': 3162, '11': 3548, '12': 3981,
})

export class CoverStageFailure extends Error {
  constructor(code, path) {
    super(code)
    this.name = 'CoverStageFailure'
    this.code = code
    this.path = path
  }
}

function fail(code, path) {
  throw new CoverStageFailure(code, path)
}

export function clamp16(value) {
  if (value > 32767) return 32767
  if (value < -32768) return -32768
  return value
}

export function gainPermille(gainDb) {
  const key = String(gainDb)
  if (!Object.prototype.hasOwnProperty.call(COVER_GAIN_PERMILLE, key)) fail(COVER_STAGE_CODES.INPUT_INVALID, 'gainDb')
  return COVER_GAIN_PERMILLE[key]
}

/** Parse a canonical 44-byte-header PCM16 mono WAV into signed samples. */
export function samplesFromWav(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail(COVER_STAGE_CODES.INPUT_INVALID, 'bytes')
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buf.length < COVER_STAGE_MIN_BYTES || buf.length > COVER_STAGE_MAX_BYTES) fail(COVER_STAGE_CODES.RESOURCE_LIMIT, 'bytes')
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') fail(COVER_STAGE_CODES.INVALID_WAV, 'bytes')
  if (buf.readUInt32LE(4) !== buf.length - 8) fail(COVER_STAGE_CODES.INVALID_WAV, 'bytes')
  if (buf.toString('ascii', 12, 16) !== 'fmt ') fail(COVER_STAGE_CODES.INVALID_WAV, 'bytes')
  if (buf.readUInt32LE(16) !== 16) fail(COVER_STAGE_CODES.INVALID_WAV, 'bytes')
  if (buf.readUInt16LE(20) !== 1) fail(COVER_STAGE_CODES.INVALID_WAV, 'codec')
  const channels = buf.readUInt16LE(22)
  const sampleRate = buf.readUInt32LE(24)
  if (channels !== COVER_STAGE_CHANNELS) fail(COVER_STAGE_CODES.INPUT_INVALID, 'channels')
  if (!COVER_STAGE_SAMPLE_RATES.includes(sampleRate)) fail(COVER_STAGE_CODES.INPUT_INVALID, 'sampleRate')
  if (buf.readUInt32LE(28) !== sampleRate * channels * 2) fail(COVER_STAGE_CODES.INVALID_WAV, 'byteRate')
  if (buf.readUInt16LE(32) !== channels * 2) fail(COVER_STAGE_CODES.INVALID_WAV, 'blockAlign')
  if (buf.readUInt16LE(34) !== 16) fail(COVER_STAGE_CODES.INVALID_WAV, 'bitsPerSample')
  if (buf.toString('ascii', 36, 40) !== 'data') fail(COVER_STAGE_CODES.INVALID_WAV, 'bytes')
  const dataByteLength = buf.readUInt32LE(40)
  if (dataByteLength !== buf.length - 44) fail(COVER_STAGE_CODES.INVALID_WAV, 'byteLength')
  if (dataByteLength % 2 !== 0) fail(COVER_STAGE_CODES.INVALID_WAV, 'dataByteLength')
  const frameCount = dataByteLength / (2 * channels)
  const samples = new Array(frameCount)
  for (let i = 0; i < frameCount; i += 1) samples[i] = buf.readInt16LE(44 + i * 2)
  return { samples, sampleRate, channels, frameCount, dataByteLength }
}

/** Build a canonical PCM16 mono WAV from signed samples. */
export function wavFromSamples(samples, sampleRate) {
  if (!Array.isArray(samples) || samples.length < 1) fail(COVER_STAGE_CODES.INPUT_INVALID, 'samples')
  if (!COVER_STAGE_SAMPLE_RATES.includes(sampleRate)) fail(COVER_STAGE_CODES.INPUT_INVALID, 'sampleRate')
  const byteLength = 44 + samples.length * 2
  if (byteLength > COVER_STAGE_MAX_BYTES) fail(COVER_STAGE_CODES.RESOURCE_LIMIT, 'bytes')
  const out = Buffer.alloc(byteLength)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + samples.length * 2, 4)
  out.write('WAVE', 8, 'ascii')
  out.write('fmt ', 12, 'ascii')
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]
    if (!Number.isInteger(sample)) fail(COVER_STAGE_CODES.INPUT_INVALID, 'samples')
    out.writeInt16LE(clamp16(sample), 44 + i * 2)
  }
  return out
}

/** MIXED graph: split each sample into vocal (half) and instrumental (exact remainder). */
export function separateTwoStem(samples) {
  const vocal = new Array(samples.length)
  const instrumental = new Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]
    const half = Math.trunc(sample / 2)
    vocal[i] = half
    instrumental[i] = sample - half
  }
  return { vocal, instrumental }
}

/** Pitch factor `1000 + 25 * pitchShift`, integer maths, clamp to PCM16. */
export function convertVocal(samples, pitchShift) {
  if (!Number.isInteger(pitchShift) || pitchShift < -12 || pitchShift > 12) {
    fail(COVER_STAGE_CODES.INPUT_INVALID, 'pitchShift')
  }
  const factor = 1000 + 25 * pitchShift
  const out = new Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) out[i] = clamp16(Math.trunc((samples[i] * factor) / 1000))
  return out
}

/** Mix the converted vocal with the optional instrumental using the integer permille table. */
export function mixStems({ converted, instrumental, vocalGainDb, instrumentalGainDb }) {
  const vocalFactor = gainPermille(vocalGainDb)
  if (instrumental !== null) {
    const instrumentalFactor = gainPermille(instrumentalGainDb)
    if (instrumental.length !== converted.length) fail(COVER_STAGE_CODES.INPUT_INVALID, 'instrumental')
    const out = new Array(converted.length)
    for (let i = 0; i < converted.length; i += 1) {
      out[i] = clamp16(Math.trunc((converted[i] * vocalFactor + instrumental[i] * instrumentalFactor) / 1000))
    }
    return out
  }
  const out = new Array(converted.length)
  for (let i = 0; i < converted.length; i += 1) out[i] = clamp16(Math.trunc((converted[i] * vocalFactor) / 1000))
  return out
}

function inspectOrFail(bytes) {
  const result = inspectFixtureWavBytes({ schemaVersion: 1, bytes })
  if (!result || result.ok !== true) {
    const error = result && Array.isArray(result.errors) && result.errors[0] ? result.errors[0] : null
    fail(error && error.code ? error.code : COVER_STAGE_CODES.INVALID_WAV, error && error.path ? error.path : 'bytes')
  }
  return result.value
}

/** Build one owned stage record (bytes, hash, samples, parent link). */
export function buildCoverStageRecord(role, samples, sampleRate, inputHash) {
  const bytes = wavFromSamples(samples, sampleRate)
  return Object.freeze({
    role,
    byteLength: bytes.length,
    byteSha256: sha256(bytes),
    parentLinks: Object.freeze([{ role: 'SOURCE', byteSha256: inputHash }].filter((link) => link.byteSha256 !== null)),
    samples,
    bytes,
  })
}

/** Build the owned MASTER record with the real inspector's canonical facts. */
export function buildCoverMasterRecord(samples, sampleRate) {
  const bytes = wavFromSamples(samples, sampleRate)
  return Object.freeze({
    role: 'MASTER',
    byteLength: bytes.length,
    byteSha256: sha256(bytes),
    samples,
    bytes,
    inspection: inspectOrFail(bytes),
  })
}

/** Build the owned SOURCE record (canonical WAV parse + real inspector verification). */
export function prepareCoverSource(sourceBytes, sampleRate) {
  const parsed = samplesFromWav(sourceBytes)
  if (sampleRate !== parsed.sampleRate) fail(COVER_STAGE_CODES.INPUT_INVALID, 'sampleRate')
  const owned = Buffer.from(sourceBytes)
  return Object.freeze({
    role: 'SOURCE',
    byteLength: owned.length,
    byteSha256: sha256(owned),
    samples: parsed.samples,
    bytes: owned,
    inspection: inspectOrFail(owned),
  })
}

/** Validate the three graph shapes before any byte work starts. */
export function validateCoverGraphShape(sourceLayout, mixMode) {
  if (sourceLayout !== 'MIXED' && sourceLayout !== 'CLEAN_VOCAL') fail(COVER_STAGE_CODES.INPUT_INVALID, 'sourceLayout')
  if (mixMode !== 'VOCAL_ONLY' && mixMode !== 'WITH_INSTRUMENTAL') fail(COVER_STAGE_CODES.INPUT_INVALID, 'mixMode')
  if (sourceLayout === 'CLEAN_VOCAL' && mixMode === 'WITH_INSTRUMENTAL') fail(COVER_STAGE_CODES.INPUT_INVALID, 'mixMode')
}

/* ----------------------------------------- cooperative cancellation -------------------------- */

/**
 * Contract §8.1 cooperation points: a cheap synchronous fence check before every 4,096-frame slice
 * and a real macrotask yield at least every 65,536 frames. The callback returns `false` when the
 * caller must stop and discard the partial arrays (no checkpoint, no import, no MASTER).
 */
export const COVER_CANCEL_CHECK_FRAMES = 4096
export const COVER_CANCEL_YIELD_FRAMES = 65536

async function cooperativeSlices(length, hooks, write) {
  let sinceYield = 0
  for (let start = 0; start < length; start += COVER_CANCEL_CHECK_FRAMES) {
    if (hooks && typeof hooks.isCancelled === 'function' && hooks.isCancelled()) return false
    const end = Math.min(length, start + COVER_CANCEL_CHECK_FRAMES)
    write(start, end)
    sinceYield += end - start
    if (sinceYield >= COVER_CANCEL_YIELD_FRAMES && hooks && typeof hooks.yieldNow === 'function') {
      sinceYield = 0
      await hooks.yieldNow()
      if (typeof hooks.isCancelled === 'function' && hooks.isCancelled()) return false
    }
  }
  return true
}

/** Chunked SEPARATING stage; returns `{cancelled:true}` when a cancel was observed. */
export async function separateTwoStemCooperative(samples, hooks) {
  if (!Array.isArray(samples) || samples.length < 1) fail(COVER_STAGE_CODES.INPUT_INVALID, 'samples')
  const vocal = new Array(samples.length)
  const instrumental = new Array(samples.length)
  const completed = await cooperativeSlices(samples.length, hooks, (start, end) => {
    for (let i = start; i < end; i += 1) {
      const half = Math.trunc(samples[i] / 2)
      vocal[i] = half
      instrumental[i] = samples[i] - half
    }
  })
  return completed ? { cancelled: false, vocal, instrumental } : { cancelled: true }
}

/** Chunked CONVERTING stage; returns `{cancelled:true}` when a cancel was observed. */
export async function convertVocalCooperative(samples, pitchShift, hooks) {
  if (!Number.isInteger(pitchShift) || pitchShift < -12 || pitchShift > 12) {
    fail(COVER_STAGE_CODES.INPUT_INVALID, 'pitchShift')
  }
  const factor = 1000 + 25 * pitchShift
  const out = new Array(samples.length)
  const completed = await cooperativeSlices(samples.length, hooks, (start, end) => {
    for (let i = start; i < end; i += 1) out[i] = clamp16(Math.trunc((samples[i] * factor) / 1000))
  })
  return completed ? { cancelled: false, samples: out } : { cancelled: true }
}

/** Chunked MIXING stage; returns `{cancelled:true}` when a cancel was observed. */
export async function mixStemsCooperative({ converted, instrumental, vocalGainDb, instrumentalGainDb }, hooks) {
  const vocalFactor = gainPermille(vocalGainDb)
  const instrumentalFactor = instrumental === null ? null : gainPermille(instrumentalGainDb)
  if (instrumental !== null && instrumental.length !== converted.length) fail(COVER_STAGE_CODES.INPUT_INVALID, 'instrumental')
  const out = new Array(converted.length)
  const completed = await cooperativeSlices(converted.length, hooks, (start, end) => {
    for (let i = start; i < end; i += 1) {
      out[i] =
        instrumentalFactor === null
          ? clamp16(Math.trunc((converted[i] * vocalFactor) / 1000))
          : clamp16(Math.trunc((converted[i] * vocalFactor + instrumental[i] * instrumentalFactor) / 1000))
    }
  })
  return completed ? { cancelled: false, samples: out } : { cancelled: true }
}

/**
 * Run one of the three contract graphs over `sourceBytes` and return the owned synthetic stages.
 * @param {{sourceBytes: Buffer, sampleRate: number, sourceLayout: 'MIXED'|'CLEAN_VOCAL', mixMode: 'VOCAL_ONLY'|'WITH_INSTRUMENTAL', pitchShift: number, vocalGainDb: number, instrumentalGainDb: number}} input
 */
export function runCoverGraph(input) {
  if (!input || typeof input !== 'object') fail(COVER_STAGE_CODES.INPUT_INVALID, '$')
  const { sourceBytes, sourceLayout, mixMode, pitchShift, vocalGainDb, instrumentalGainDb } = input
  validateCoverGraphShape(sourceLayout, mixMode)
  const sampleRate = input.sampleRate
  const source = prepareCoverSource(sourceBytes, sampleRate)
  let vocal = null
  let instrumental = null
  let conversionInput = source.samples
  if (sourceLayout === 'MIXED') {
    const stems = separateTwoStem(source.samples)
    vocal = buildCoverStageRecord('VOCAL', stems.vocal, sampleRate, source.byteSha256)
    instrumental = buildCoverStageRecord('INSTRUMENTAL', stems.instrumental, sampleRate, source.byteSha256)
    conversionInput = stems.vocal
  }
  const convertedSamples = convertVocal(conversionInput, pitchShift)
  const converted = buildCoverStageRecord('CONVERTED_VOCAL', convertedSamples, sampleRate, vocal ? vocal.byteSha256 : source.byteSha256)
  const mixedSamples = mixStems({
    converted: convertedSamples,
    instrumental: mixMode === 'WITH_INSTRUMENTAL' ? instrumental.samples : null,
    vocalGainDb,
    instrumentalGainDb,
  })
  const master = buildCoverMasterRecord(mixedSamples, sampleRate)
  return Object.freeze({
    graphVersion: COVER_STAGE_GRAPH_VERSION,
    sourceLayout,
    mixMode,
    sampleRate,
    source,
    vocal,
    instrumental,
    converted,
    master,
    mediaProfile: Object.freeze({ format: 'WAV', codec: 'PCM_S16LE', sampleRate, channels: 1 }),
    origin: 'SYNTHETIC_FIXTURE',
    truthLevel: 'MEASURED_SYNTHETIC',
    masterTruthLevel: 'MEASURED_SYNTHETIC_VERIFIED',
  })
}
