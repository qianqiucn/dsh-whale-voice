/**
 * Cover Intent — canonical form, identity hashes and draft validation.
 *
 * This is the implementation of the FUTURE/`NOT_IMPLEMENTED` shapes described in
 * `docs/COVER_TASK_EXECUTION_CONTRACT.md`. It is pure: no I/O, no clock, no random, no globals.
 *
 * The canonical Intent is exactly the 25 keys/order fixed by the contract, so its SHA-256 can be
 * recomputed independently from the documented vector.
 */
import { sha256 } from './fixture-store-base-internal.mjs'

/** Contract version of the canonical Intent. */
export const COVER_INTENT_VERSION = 1

/** Exact key order of the canonical Intent (25 keys). */
export const COVER_INTENT_KEYS = Object.freeze([
  'intentVersion',
  'taskId',
  'scopeId',
  'birthIdentityHash',
  'birthObservedAt',
  'sourceRef',
  'sourceEntryIdentityHash',
  'sourceByteSha256',
  'sourceByteLength',
  'sourceRevision',
  'rightsState',
  'rightsProofRef',
  'rightsExpiresAt',
  'voiceProfileId',
  'profileRevision',
  'modelAssetId',
  'modelRevision',
  'modelIntegrityTruth',
  'instanceId',
  'candidateId',
  'modelRef',
  'backendRevision',
  'pitchShift',
  'recipe',
  'outputProfile',
])

/** The caller-decidable 19-key draft. */
export const COVER_INTENT_DRAFT_KEYS = Object.freeze([
  'intentVersion',
  'scopeId',
  'sourceRef',
  'sourceRevision',
  'rightsState',
  'rightsProofRef',
  'rightsExpiresAt',
  'voiceProfileId',
  'profileRevision',
  'modelAssetId',
  'modelRevision',
  'modelIntegrityTruth',
  'instanceId',
  'candidateId',
  'modelRef',
  'backendRevision',
  'pitchShift',
  'recipe',
  'outputProfile',
])

export const COVER_RECIPE_KEYS = Object.freeze([
  'sourceLayout',
  'separationPreset',
  'mixMode',
  'vocalGainDb',
  'instrumentalGainDb',
])

export const COVER_OUTPUT_PROFILE_KEYS = Object.freeze(['format', 'codec', 'sampleRate', 'channels'])

/** Stable source identity keys (7, fixed order). */
export const COVER_SOURCE_IDENTITY_KEYS = Object.freeze([
  'artifactRef',
  'scopeId',
  'requestKey',
  'origin',
  'createdAt',
  'byteSha256',
  'byteLength',
])

export const COVER_INTENT_LIMITS = Object.freeze({
  minPitchShift: -12,
  maxPitchShift: 12,
  minGainDb: -24,
  maxGainDb: 12,
  minSourceBytes: 44,
  maxSourceBytes: 1048576,
  minRevision: 1,
  maxSourceRevision: 1000000,
  sampleRates: Object.freeze([16000, 22050, 24000, 32000, 44100, 48000]),
  channels: 1,
})

export const COVER_INTENT_CODES = Object.freeze({
  INPUT_INVALID: 'COVER_INTENT_INPUT_INVALID',
})

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function readOwn(object, key) {
  if (!isPlainObject(object)) return { ok: false }
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return { ok: false }
  return { ok: true, value: descriptor.value }
}

function requireString(object, key, pattern, maxLength) {
  const field = readOwn(object, key)
  if (!field.ok || typeof field.value !== 'string') return null
  const value = field.value
  if (value.length < 1 || value.length > maxLength) return null
  if (pattern && !pattern.test(value)) return null
  if (value !== value.trim()) return null
  return value
}

function requireIso(object, key) {
  const field = readOwn(object, key)
  if (!field.ok || typeof field.value !== 'string') return null
  return canonicalIso(field.value)
}

function requireInt(object, key, min, max) {
  const field = readOwn(object, key)
  if (!field.ok || !Number.isInteger(field.value)) return null
  if (field.value < min || field.value > max) return null
  return field.value
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const HEX64 = /^[0-9a-f]{64}$/
const PHYSICAL_REF = /^artifact:fixture-bytes-[0-9a-f]{32}$/
const SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const TOKEN_PATTERN = /^[A-Za-z0-9:_.:/@-]{1,128}$/

function canonicalIso(value) {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value)) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  if (new Date(ms).toISOString() !== value) return null
  return value
}

/**
 * Validate the caller's 19-key draft and return a normalized frozen copy.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<object>}}
 */
export function normalizeIntentDraft(input) {
  const fail = (path) => ({
    ok: false,
    errors: [{ code: COVER_INTENT_CODES.INPUT_INVALID, path, reason: 'invalid cover intent draft' }],
  })
  if (!isPlainObject(input)) return fail('$')
  const keys = Object.keys(input)
  if (keys.length !== COVER_INTENT_DRAFT_KEYS.length) return fail('$')
  for (const key of keys) if (!COVER_INTENT_DRAFT_KEYS.includes(key)) return fail('$')

  const intentVersion = requireInt(input, 'intentVersion', 1, 1)
  if (intentVersion === null) return fail('intentVersion')
  const scopeId = requireString(input, 'scopeId', SCOPE_PATTERN, 64)
  if (scopeId === null) return fail('scopeId')
  const sourceRef = requireString(input, 'sourceRef', PHYSICAL_REF, 64)
  if (sourceRef === null) return fail('sourceRef')
  const sourceRevision = requireInt(input, 'sourceRevision', 1, COVER_INTENT_LIMITS.maxSourceRevision)
  if (sourceRevision === null) return fail('sourceRevision')
  const rightsStateField = readOwn(input, 'rightsState')
  if (!rightsStateField.ok || rightsStateField.value !== 'GRANTED') return fail('rightsState')
  const rightsState = rightsStateField.value
  const rightsProofRef = requireString(input, 'rightsProofRef', /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/, 128)
  if (rightsProofRef === null) return fail('rightsProofRef')
  const rightsExpiresAt = requireIso(input, 'rightsExpiresAt')
  if (rightsExpiresAt === null) return fail('rightsExpiresAt')
  const voiceProfileId = requireString(input, 'voiceProfileId', TOKEN_PATTERN, 128)
  if (voiceProfileId === null) return fail('voiceProfileId')
  const profileRevision = requireInt(input, 'profileRevision', 1, 1000000)
  if (profileRevision === null) return fail('profileRevision')
  const modelAssetId = requireString(input, 'modelAssetId', TOKEN_PATTERN, 128)
  if (modelAssetId === null) return fail('modelAssetId')
  const modelRevision = requireInt(input, 'modelRevision', 1, 1000000)
  if (modelRevision === null) return fail('modelRevision')
  const integrity = readOwn(input, 'modelIntegrityTruth')
  if (!integrity.ok || integrity.value !== 'DECLARED_FIXTURE') return fail('modelIntegrityTruth')
  const instanceId = requireString(input, 'instanceId', TOKEN_PATTERN, 128)
  if (instanceId === null) return fail('instanceId')
  const candidate = readOwn(input, 'candidateId')
  if (!candidate.ok || candidate.value !== 'rvc') return fail('candidateId')
  const modelRef = requireString(input, 'modelRef', TOKEN_PATTERN, 128)
  if (modelRef === null) return fail('modelRef')
  const backendRevision = requireInt(input, 'backendRevision', 1, 1)
  if (backendRevision === null) return fail('backendRevision')
  const pitchShift = requireInt(input, 'pitchShift', COVER_INTENT_LIMITS.minPitchShift, COVER_INTENT_LIMITS.maxPitchShift)
  if (pitchShift === null) return fail('pitchShift')

  const recipeInput = readOwn(input, 'recipe')
  if (!recipeInput.ok || !isPlainObject(recipeInput.value)) return fail('recipe')
  const recipeKeys = Object.keys(recipeInput.value)
  if (recipeKeys.length !== COVER_RECIPE_KEYS.length || recipeKeys.some((key) => !COVER_RECIPE_KEYS.includes(key))) {
    return fail('recipe')
  }
  const sourceLayout = readOwn(recipeInput.value, 'sourceLayout')
  if (!sourceLayout.ok || !['MIXED', 'CLEAN_VOCAL'].includes(sourceLayout.value)) return fail('recipe.sourceLayout')
  const separationPreset = readOwn(recipeInput.value, 'separationPreset')
  if (!separationPreset.ok || !['NONE', 'FIXTURE_TWO_STEM'].includes(separationPreset.value)) {
    return fail('recipe.separationPreset')
  }
  if (sourceLayout.value === 'MIXED' && separationPreset.value !== 'FIXTURE_TWO_STEM') {
    return fail('recipe.separationPreset')
  }
  if (sourceLayout.value === 'CLEAN_VOCAL' && separationPreset.value !== 'NONE') {
    return fail('recipe.separationPreset')
  }
  const mixMode = readOwn(recipeInput.value, 'mixMode')
  if (!mixMode.ok || !['VOCAL_ONLY', 'WITH_INSTRUMENTAL'].includes(mixMode.value)) return fail('recipe.mixMode')
  if (sourceLayout.value === 'CLEAN_VOCAL' && mixMode.value === 'WITH_INSTRUMENTAL') return fail('recipe.mixMode')
  const vocalGainDb = requireInt(recipeInput.value, 'vocalGainDb', COVER_INTENT_LIMITS.minGainDb, COVER_INTENT_LIMITS.maxGainDb)
  if (vocalGainDb === null) return fail('recipe.vocalGainDb')
  const instrumentalGainDb = requireInt(
    recipeInput.value,
    'instrumentalGainDb',
    COVER_INTENT_LIMITS.minGainDb,
    COVER_INTENT_LIMITS.maxGainDb,
  )
  if (instrumentalGainDb === null) return fail('recipe.instrumentalGainDb')
  if (mixMode.value === 'VOCAL_ONLY' && instrumentalGainDb !== 0) return fail('recipe.instrumentalGainDb')

  const profileInput = readOwn(input, 'outputProfile')
  if (!profileInput.ok || !isPlainObject(profileInput.value)) return fail('outputProfile')
  const profileKeys = Object.keys(profileInput.value)
  if (
    profileKeys.length !== COVER_OUTPUT_PROFILE_KEYS.length ||
    profileKeys.some((key) => !COVER_OUTPUT_PROFILE_KEYS.includes(key))
  ) {
    return fail('outputProfile')
  }
  const format = readOwn(profileInput.value, 'format')
  if (!format.ok || format.value !== 'WAV') return fail('outputProfile.format')
  const codec = readOwn(profileInput.value, 'codec')
  if (!codec.ok || codec.value !== 'PCM_S16LE') return fail('outputProfile.codec')
  const sampleRate = requireInt(profileInput.value, 'sampleRate', 16000, 48000)
  if (sampleRate === null || !COVER_INTENT_LIMITS.sampleRates.includes(sampleRate)) return fail('outputProfile.sampleRate')
  const channels = requireInt(profileInput.value, 'channels', 1, 1)
  if (channels === null) return fail('outputProfile.channels')

  return {
    ok: true,
    value: Object.freeze({
      intentVersion,
      scopeId,
      sourceRef,
      sourceRevision,
      rightsState,
      rightsProofRef,
      rightsExpiresAt,
      voiceProfileId,
      profileRevision,
      modelAssetId,
      modelRevision,
      modelIntegrityTruth: 'DECLARED_FIXTURE',
      instanceId,
      candidateId: 'rvc',
      modelRef,
      backendRevision,
      pitchShift,
      recipe: Object.freeze({ sourceLayout: sourceLayout.value, separationPreset: separationPreset.value, mixMode: mixMode.value, vocalGainDb, instrumentalGainDb }),
      outputProfile: Object.freeze({ format: 'WAV', codec: 'PCM_S16LE', sampleRate, channels }),
    }),
  }
}

/**
 * Assemble the 25-key canonical Intent from a normalized draft, the measured source facts and the
 * catalog-issued birth facts.
 */
export function buildIntent({ draft, sourceFacts, taskId, birthIdentityHash, birthObservedAt }) {
  return Object.freeze({
    intentVersion: 1,
    taskId,
    scopeId: draft.scopeId,
    birthIdentityHash,
    birthObservedAt,
    sourceRef: draft.sourceRef,
    sourceEntryIdentityHash: sourceEntryIdentityHash(sourceFacts),
    sourceByteSha256: sourceFacts.byteSha256,
    sourceByteLength: sourceFacts.byteLength,
    sourceRevision: draft.sourceRevision,
    rightsState: draft.rightsState,
    rightsProofRef: draft.rightsProofRef,
    rightsExpiresAt: draft.rightsExpiresAt,
    voiceProfileId: draft.voiceProfileId,
    profileRevision: draft.profileRevision,
    modelAssetId: draft.modelAssetId,
    modelRevision: draft.modelRevision,
    modelIntegrityTruth: draft.modelIntegrityTruth,
    instanceId: draft.instanceId,
    candidateId: draft.candidateId,
    modelRef: draft.modelRef,
    backendRevision: draft.backendRevision,
    pitchShift: draft.pitchShift,
    recipe: draft.recipe,
    outputProfile: draft.outputProfile,
  })
}

/** Canonical UTF-8 JSON text of the 25-key Intent (fixed key order, no whitespace). */
export function canonicalIntent(intent) {
  if (!isPlainObject(intent)) throw new TypeError('intent must be a plain object')
  const missing = COVER_INTENT_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(intent, key))
  if (missing.length > 0) throw new TypeError('intent is missing keys: ' + missing.join(','))
  const extra = Object.keys(intent).filter((key) => !COVER_INTENT_KEYS.includes(key))
  if (extra.length > 0) throw new TypeError('intent has unexpected keys: ' + extra.join(','))
  const s = (value) => JSON.stringify(value)
  const n = (value) => String(value)
  const recipe = intent.recipe
  const profile = intent.outputProfile
  const recipeText =
    '{"sourceLayout":' + s(recipe.sourceLayout) +
    ',"separationPreset":' + s(recipe.separationPreset) +
    ',"mixMode":' + s(recipe.mixMode) +
    ',"vocalGainDb":' + n(recipe.vocalGainDb) +
    ',"instrumentalGainDb":' + n(recipe.instrumentalGainDb) + '}'
  const profileText =
    '{"format":' + s(profile.format) +
    ',"codec":' + s(profile.codec) +
    ',"sampleRate":' + n(profile.sampleRate) +
    ',"channels":' + n(profile.channels) + '}'
  return (
    '{"intentVersion":' + n(intent.intentVersion) +
    ',"taskId":' + s(intent.taskId) +
    ',"scopeId":' + s(intent.scopeId) +
    ',"birthIdentityHash":' + s(intent.birthIdentityHash) +
    ',"birthObservedAt":' + s(intent.birthObservedAt) +
    ',"sourceRef":' + s(intent.sourceRef) +
    ',"sourceEntryIdentityHash":' + s(intent.sourceEntryIdentityHash) +
    ',"sourceByteSha256":' + s(intent.sourceByteSha256) +
    ',"sourceByteLength":' + n(intent.sourceByteLength) +
    ',"sourceRevision":' + n(intent.sourceRevision) +
    ',"rightsState":' + s(intent.rightsState) +
    ',"rightsProofRef":' + s(intent.rightsProofRef) +
    ',"rightsExpiresAt":' + s(intent.rightsExpiresAt) +
    ',"voiceProfileId":' + s(intent.voiceProfileId) +
    ',"profileRevision":' + n(intent.profileRevision) +
    ',"modelAssetId":' + s(intent.modelAssetId) +
    ',"modelRevision":' + n(intent.modelRevision) +
    ',"modelIntegrityTruth":' + s(intent.modelIntegrityTruth) +
    ',"instanceId":' + s(intent.instanceId) +
    ',"candidateId":' + s(intent.candidateId) +
    ',"modelRef":' + s(intent.modelRef) +
    ',"backendRevision":' + n(intent.backendRevision) +
    ',"pitchShift":' + n(intent.pitchShift) +
    ',"recipe":' + recipeText +
    ',"outputProfile":' + profileText + '}'
  )
}

/** SHA-256 (hex) of the canonical Intent bytes. */
export function intentHashOf(intent) {
  return sha256(Buffer.from(canonicalIntent(intent), 'utf8'))
}

/** Canonical UTF-8 text of the 7 stable source identity fields. */
export function canonicalSourceIdentity(facts) {
  return (
    '{"artifactRef":' + JSON.stringify(facts.artifactRef) +
    ',"scopeId":' + JSON.stringify(facts.scopeId) +
    ',"requestKey":' + JSON.stringify(facts.requestKey) +
    ',"origin":' + JSON.stringify(facts.origin) +
    ',"createdAt":' + JSON.stringify(facts.createdAt) +
    ',"byteSha256":' + JSON.stringify(facts.byteSha256) +
    ',"byteLength":' + String(facts.byteLength) + '}'
  )
}

/** Stable source identity hash (7 fields, fixed order). */
export function sourceEntryIdentityHash(facts) {
  return sha256(Buffer.from(canonicalSourceIdentity(facts), 'utf8'))
}
