import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COVER_INTENT_KEYS,
  COVER_INTENT_DRAFT_KEYS,
  buildIntent,
  canonicalIntent,
  intentHashOf,
  normalizeIntentDraft,
  sourceEntryIdentityHash,
} from '../core/audio/cover-intent-internal.mjs'
import {
  COVER_GAIN_PERMILLE,
  CoverStageFailure,
  convertVocal,
  mixStems,
  runCoverGraph,
  samplesFromWav,
  separateTwoStem,
  wavFromSamples,
} from '../core/audio/cover-stage-bytes-internal.mjs'

const SOURCE_SAMPLES = [1000, -2000, 32767, -32768]
const SOURCE_WAV = wavFromSamples(SOURCE_SAMPLES, 44100)
const SOURCE_SHA = '11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd'

function draft(overrides = {}) {
  return {
    intentVersion: 1,
    scopeId: 'scope:fixture-demo',
    sourceRef: 'artifact:fixture-bytes-0123456789abcdef0123456789abcdef',
    sourceRevision: 1,
    rightsState: 'GRANTED',
    rightsProofRef: 'fixture-rights:cover-demo-1',
    rightsExpiresAt: '2026-11-02T00:00:00.000Z',
    voiceProfileId: 'voice:demo-hero',
    profileRevision: 1,
    modelAssetId: 'asset:fixture-model-a',
    modelRevision: 1,
    modelIntegrityTruth: 'DECLARED_FIXTURE',
    instanceId: 'instance:rvc',
    candidateId: 'rvc',
    modelRef: 'rvc-model:fixture-a',
    backendRevision: 1,
    pitchShift: 0,
    recipe: {
      sourceLayout: 'MIXED',
      separationPreset: 'FIXTURE_TWO_STEM',
      mixMode: 'WITH_INSTRUMENTAL',
      vocalGainDb: 0,
      instrumentalGainDb: 0,
    },
    outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 1 },
    ...overrides,
  }
}

const SOURCE_FACTS = {
  artifactRef: 'artifact:fixture-bytes-0123456789abcdef0123456789abcdef',
  scopeId: 'scope:fixture-demo',
  requestKey: 'import:fixture-source-1',
  origin: 'FIXTURE_IMPORT',
  createdAt: '2026-11-01T00:00:00.000Z',
  byteSha256: SOURCE_SHA,
  byteLength: 52,
}

const BIRTH_IDENTITY = 'bf3c034eb609624d27f8d3994c9b5b86500eca247a7171e27466bf4c212ffedc'
const BASE_INTENT_HASH = 'c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35'

function buildBaseIntent(overrides = {}) {
  const normalized = normalizeIntentDraft(draft(overrides.draft))
  assert.equal(normalized.ok, true)
  const intent = buildIntent({
    draft: normalized.value,
    sourceFacts: SOURCE_FACTS,
    taskId: 'task:fixture-0123456789abcdef0123456789abcdef',
    birthIdentityHash: BIRTH_IDENTITY,
    birthObservedAt: '2026-11-01T00:00:00.000Z',
  })
  return { ...intent, ...overrides.intent }
}

test('intent has exactly the contract key sets', () => {
  assert.equal(COVER_INTENT_KEYS.length, 25)
  assert.equal(COVER_INTENT_DRAFT_KEYS.length, 19)
  assert.equal(COVER_INTENT_KEYS[0], 'intentVersion')
  assert.equal(COVER_INTENT_KEYS[24], 'outputProfile')
})

test('canonical intent is 1140 bytes and matches the documented hash', () => {
  const intent = buildBaseIntent()
  const canonical = canonicalIntent(intent)
  assert.equal(Buffer.byteLength(canonical, 'utf8'), 1140)
  assert.equal(intentHashOf(intent), BASE_INTENT_HASH)
})

test('five single-field variants keep the documented hashes', () => {
  const base = buildBaseIntent()
  const variants = {
    sourceByteSha: { ...base, sourceByteSha256: 'd4'.repeat(32) },
    pitch: { ...base, pitchShift: 7 },
    modelRevision: { ...base, modelRevision: 2 },
    vocalGain: { ...base, recipe: { ...base.recipe, vocalGainDb: -6 } },
    rights: { ...base, rightsState: 'REVOKED' },
  }
  assert.equal(intentHashOf(variants.sourceByteSha), '2d374e51ccb020cfb905338a5c9a19fab7e91c5b42b984c4cbc9d39009e0a8c3')
  assert.equal(intentHashOf(variants.pitch), '5b0d1e3b41ac69844bb5b36d9498c4059005df3d719e77e9a53b9395eeb0c8a7')
  assert.equal(intentHashOf(variants.modelRevision), '10404b39418ef35ea106ef1c418c8bef8d614b5747ff01171a3d61993cd7e928')
  assert.equal(intentHashOf(variants.vocalGain), 'e487db0c8ca340a135319dc356012408f8bdad50975b7da7a6aad8ecbd2cd76d')
  assert.equal(intentHashOf(variants.rights), '701d72fe81364b2f898d55b6f32990d9461ea97c1ac094b1e3f9967d3c3c7027')
  const hashes = new Set([BASE_INTENT_HASH, ...Object.values(variants).map((value) => intentHashOf(value))])
  assert.equal(hashes.size, 6)
})

test('stable source identity matches the documented hash', () => {
  assert.equal(sourceEntryIdentityHash(SOURCE_FACTS), '04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61')
})

test('draft validation rejects unsafe or unsupported values', () => {
  assert.equal(normalizeIntentDraft(draft({ rightsState: 'REVOKED' })).ok, false)
  assert.equal(normalizeIntentDraft(draft({ outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 2 } })).ok, false)
  assert.equal(normalizeIntentDraft(draft({ pitchShift: 13 })).ok, false)
  assert.equal(normalizeIntentDraft(draft({ rightS: 'x' })).ok, false)
  assert.equal(
    normalizeIntentDraft(
      draft({ recipe: { sourceLayout: 'CLEAN_VOCAL', separationPreset: 'NONE', mixMode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 } }),
    ).ok,
    false,
  )
  assert.equal(
    normalizeIntentDraft(
      draft({ recipe: { sourceLayout: 'MIXED', separationPreset: 'NONE', mixMode: 'VOCAL_ONLY', vocalGainDb: 0, instrumentalGainDb: 0 } }),
    ).ok,
    false,
  )
})

test('buildIntent yields exactly the 25 contract keys in order', () => {
  const intent = buildBaseIntent()
  assert.deepEqual(Object.keys(intent), [...COVER_INTENT_KEYS])
  assert.equal(intent.sourceEntryIdentityHash, '04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61')
  assert.equal(intent.intentVersion, 1)
  assert.equal(intent.candidateId, 'rvc')
})

test('source WAV bytes and separator vectors match', () => {
  assert.equal(Buffer.byteLength(SOURCE_WAV), 52)
  const parsed = samplesFromWav(SOURCE_WAV)
  assert.deepEqual(parsed.samples, SOURCE_SAMPLES)
  const stems = separateTwoStem(SOURCE_SAMPLES)
  assert.deepEqual(stems.vocal, [500, -1000, 16383, -16384])
  assert.deepEqual(stems.instrumental, [500, -1000, 16384, -16384])
})

test('gain table spot values match the contract', () => {
  assert.equal(COVER_GAIN_PERMILLE['-24'], 63)
  assert.equal(COVER_GAIN_PERMILLE['-6'], 501)
  assert.equal(COVER_GAIN_PERMILLE['0'], 1000)
  assert.equal(COVER_GAIN_PERMILLE['12'], 3981)
})

test('mix clamps overflow and truncates toward zero', () => {
  assert.deepEqual(mixStems({ converted: [32767, -32768], instrumental: null, vocalGainDb: 0, instrumentalGainDb: 0 }), [32767, -32768])
  assert.deepEqual(convertVocal([1000, -1000], 12), [1300, -1300])
  assert.equal(mixStems({ converted: [20000], instrumental: [20000], vocalGainDb: 6, instrumentalGainDb: 6 })[0], 32767)
})

test('MIXED/WITH_INSTRUMENTAL graph matches all documented hashes', () => {
  const graph = runCoverGraph({
    sourceBytes: SOURCE_WAV,
    sourceLayout: 'MIXED',
    mixMode: 'WITH_INSTRUMENTAL',
    pitchShift: 0,
    vocalGainDb: 0,
    instrumentalGainDb: 0,
    sampleRate: 44100,
  })
  assert.equal(graph.source.byteSha256, SOURCE_SHA)
  assert.equal(graph.source.byteLength, 52)
  assert.equal(graph.vocal.byteSha256, '3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2')
  assert.equal(graph.instrumental.byteSha256, '5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f')
  assert.equal(graph.converted.byteSha256, '3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2')
  assert.equal(graph.master.byteSha256, SOURCE_SHA)
  assert.equal(graph.master.inspection.channels, 1)
  assert.equal(graph.master.inspection.validationState, 'FIXTURE_WAV_CHECKED')
  assert.equal(graph.truthLevel, 'MEASURED_SYNTHETIC')
  assert.equal(graph.masterTruthLevel, 'MEASURED_SYNTHETIC_VERIFIED')
  assert.equal(graph.origin, 'SYNTHETIC_FIXTURE')
})

test('pitch +7 conversion matches the documented vector', () => {
  const graph = runCoverGraph({
    sourceBytes: SOURCE_WAV,
    sourceLayout: 'MIXED',
    mixMode: 'WITH_INSTRUMENTAL',
    pitchShift: 7,
    vocalGainDb: 0,
    instrumentalGainDb: 0,
    sampleRate: 44100,
  })
  assert.equal(graph.converted.byteSha256, '63db9d5f601f19613d1056d7c7ecc1cb2f8f3ab16a97d873c1cae751d7725c8f')
})

test('vocal -6 dB master matches the documented vector', () => {
  const graph = runCoverGraph({
    sourceBytes: SOURCE_WAV,
    sourceLayout: 'MIXED',
    mixMode: 'WITH_INSTRUMENTAL',
    pitchShift: 0,
    vocalGainDb: -6,
    instrumentalGainDb: 0,
    sampleRate: 44100,
  })
  assert.equal(graph.master.byteSha256, '751a15a688306c0dee934c113675b488393d126bb181e0fe9dbe69a2ac4e94b7')
})

test('CLEAN_VOCAL graph converts the SOURCE directly', () => {
  const graph = runCoverGraph({
    sourceBytes: SOURCE_WAV,
    sourceLayout: 'CLEAN_VOCAL',
    mixMode: 'VOCAL_ONLY',
    pitchShift: 0,
    vocalGainDb: 0,
    instrumentalGainDb: 0,
    sampleRate: 44100,
  })
  assert.equal(graph.vocal, null)
  assert.equal(graph.instrumental, null)
  assert.equal(graph.converted.parentLinks[0].role, 'SOURCE')
  assert.equal(graph.converted.parentLinks[0].byteSha256, SOURCE_SHA)
})

test('stereo or malformed WAV input is rejected', () => {
  const stereo = Buffer.from(SOURCE_WAV)
  stereo.writeUInt16LE(2, 22)
  stereo.writeUInt16LE(4, 32)
  stereo.writeUInt32LE(44100 * 4, 28)
  const data = Buffer.alloc(SOURCE_SAMPLES.length * 4)
  for (let i = 0; i < SOURCE_SAMPLES.length; i += 1) {
    data.writeInt16LE(SOURCE_SAMPLES[i], i * 4)
    data.writeInt16LE(SOURCE_SAMPLES[i], i * 4 + 2)
  }
  const stereoWav = Buffer.concat([stereo.subarray(0, 44), data])
  stereoWav.writeUInt32LE(36 + data.length, 4)
  stereoWav.writeUInt32LE(data.length, 40)
  assert.throws(() => samplesFromWav(stereoWav), (error) => error instanceof CoverStageFailure)

  const broken = Buffer.from(SOURCE_WAV)
  broken.writeUInt32LE(999, 40)
  assert.throws(() => samplesFromWav(broken), (error) => error instanceof CoverStageFailure)
})

test('oversize generated bytes are rejected', () => {
  assert.throws(() => wavFromSamples(new Array(524267).fill(0), 44100), (error) => error instanceof CoverStageFailure && error.code === 'COVER_STAGE_RESOURCE_LIMIT')
})
