/* Whale Voice — shared voice assets & explicit Provider binding (Plan 08-A, OFFLINE / FIXTURE_ONLY).
 *
 * One bounded, pure Fixture layer over the existing 05-A AudioTaskDraft v1 and the existing 06-B
 * Provider instance negotiation. It answers one question only: "does this demonstration task's
 * shared voice profile explicitly bind the selected instance to the asset whose canonical
 * candidate and Provider-specific voice/model reference match the same negotiation request?"
 *
 * A FIXTURE_BOUND decision means the declared mapping is consistent. It never means the dependency
 * is ready, the model exists, audio was generated, preview/save/delivery is possible, or that a real
 * authorization was granted. This module performs no I/O, starts no process, reads no clock or
 * randomness, invokes no dispatcher, advances no task and keeps no module-level mutable state.
 *
 * Both public entry points take exactly one bounded structural copy through the existing shared
 * Fixture input boundary before any schema access, then build fresh, deeply frozen output graphs.
 * The library is a declaration surface only: canonical candidates, TTS voice catalogues and RVC
 * model availability stay authoritative in the existing 06-B layer and its original catalogues.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { validateAudioTaskDraft } from './task-contract.mjs'
import { negotiateProviderInstance } from './provider-instances.mjs'

export const VOICE_ASSETS_SCHEMA_VERSION = 1

const ERROR_KEYS = Object.freeze([
  'INVALID_INPUT',
  'RESOURCE_LIMIT',
  'UNSUPPORTED_VERSION',
  'INVALID_LIBRARY',
  'DUPLICATE_ID',
  'INVALID_REFERENCE',
  'INVALID_TASK',
  'INVALID_NEGOTIATION',
  'INVALID_EXPECTATION',
  'INVALID_NOW',
  'DEPENDENCY_FAILURE',
  'TASK_KIND_MISMATCH',
  'SOURCE_MISMATCH',
  'TASK_RIGHTS_UNCONFIRMED',
  'PROFILE_UNAVAILABLE',
  'PROFILE_REVISION_MISMATCH',
  'PROFILE_RIGHTS_UNCONFIRMED',
  'BINDING_MISSING',
  'ASSET_REVISION_MISMATCH',
  'ASSET_RIGHTS_UNCONFIRMED',
  'ASSET_MISSING',
  'ASSET_UNKNOWN',
  'ASSET_EXPIRED',
  'ASSET_KIND_MISMATCH',
  'CANDIDATE_MISMATCH',
  'PROVIDER_REF_MISMATCH',
  'PROVIDER_BLOCKED',
])

/** Fixed error/reason protocol. Every value is `VOICE_ASSET_` plus the key itself. */
export const VOICE_ASSET_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'VOICE_ASSET_' + key])),
)

const LIBRARY_KEYS = Object.freeze(new Set(['schemaVersion', 'profiles', 'assets']))
const PROFILE_KEYS = Object.freeze(
  new Set(['voiceProfileId', 'revision', 'scopeId', 'displayName', 'rightsState', 'bindings']),
)
const BINDING_KEYS = Object.freeze(new Set(['instanceId', 'assetId']))
const ASSET_KEYS = Object.freeze(
  new Set([
    'assetId',
    'revision',
    'scopeId',
    'kind',
    'candidateId',
    'providerRef',
    'availability',
    'rightsState',
    'integrity',
    'expiresAt',
  ]),
)
const INTEGRITY_KEYS = Object.freeze(new Set(['sha256', 'byteLength']))
const EXPECTATION_KEYS = Object.freeze(new Set(['scopeId', 'profileRevision', 'assetRevision']))
const RESOLVER_KEYS = Object.freeze(
  new Set(['schemaVersion', 'library', 'taskDraft', 'negotiation', 'expectation', 'now']),
)

const VOICE_PROFILE_PATTERN = /^voice:[A-Za-z0-9_-]{1,64}$/
const ASSET_ID_PATTERN = /^asset:fixture-[A-Za-z0-9_-]{1,48}$/
const SCOPE_PATTERN = /^scope:fixture-[A-Za-z0-9_-]{1,32}$/
const INSTANCE_PATTERN = /^instance:[A-Za-z0-9_-]{1,64}$/
const CANDIDATE_PATTERN = /^[a-z][a-z0-9-]{1,63}$/
const RVC_MODEL_REF_PATTERN = /^rvc-model:fixture-[A-Za-z0-9_-]{1,48}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CONTROL_PATTERN = /[\u0000-\u001F\u007F]/

const MAX_PROFILES = 16
const MAX_ASSETS = 32
const MAX_BINDINGS = 8
const MAX_REVISION = 2147483647
const MAX_ASSET_BYTES = 8589934592
const MAX_DISPLAY_NAME = 64

const RIGHTS_STATES = Object.freeze(new Set(['CONFIRMED_FIXTURE', 'UNVERIFIED', 'REVOKED']))
const ASSET_KINDS = Object.freeze(new Set(['TTS_VOICE', 'RVC_MODEL']))
const AVAILABILITY_STATES = Object.freeze(new Set(['PRESENT', 'ABSENT', 'UNKNOWN']))

const RIGHTS_CONFIRMED = 'CONFIRMED_FIXTURE'
const TTS_VOICE = 'TTS_VOICE'
const RVC_MODEL = 'RVC_MODEL'

const BOUND_MESSAGE = '演示音色绑定已核对；尚未生成音频，不能据此试听、保存或发送。'
const MISMATCH_MESSAGE = '演示任务与所选音色不一致，请重新选择；系统不会自动替换。'
const RIGHTS_MESSAGE = '演示使用权尚未确认或已撤销，请确认后再继续。'
const UNAVAILABLE_MESSAGE = '没有可用的演示音色绑定，请重新选择或稍后再说。'
const REVISION_MESSAGE = '演示资产版本已变化，请刷新后重新选择。'
const UNKNOWN_MESSAGE = '演示资产状态未知，请重新检查，系统不会自动下载。'
const EXPIRED_MESSAGE = '演示资产已过期，请重新选择可用资产。'

const BUSINESS_MESSAGES = Object.freeze({
  TASK_KIND_MISMATCH: MISMATCH_MESSAGE,
  SOURCE_MISMATCH: MISMATCH_MESSAGE,
  ASSET_KIND_MISMATCH: MISMATCH_MESSAGE,
  CANDIDATE_MISMATCH: MISMATCH_MESSAGE,
  PROVIDER_REF_MISMATCH: MISMATCH_MESSAGE,
  TASK_RIGHTS_UNCONFIRMED: RIGHTS_MESSAGE,
  PROFILE_RIGHTS_UNCONFIRMED: RIGHTS_MESSAGE,
  ASSET_RIGHTS_UNCONFIRMED: RIGHTS_MESSAGE,
  PROFILE_UNAVAILABLE: UNAVAILABLE_MESSAGE,
  BINDING_MISSING: UNAVAILABLE_MESSAGE,
  ASSET_MISSING: UNAVAILABLE_MESSAGE,
  PROFILE_REVISION_MISMATCH: REVISION_MESSAGE,
  ASSET_REVISION_MISMATCH: REVISION_MESSAGE,
  ASSET_UNKNOWN: UNKNOWN_MESSAGE,
  ASSET_EXPIRED: EXPIRED_MESSAGE,
})

function issue(code, path, reason) {
  return { code, path, reason }
}

function errorReason(key) {
  return key.toLowerCase().replace(/_/g, ' ')
}

function fail(key, path) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [issue(VOICE_ASSET_ERRORS[key], path, errorReason(key))],
  })
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function keySurface(object, allowed) {
  const keys = Reflect.ownKeys(object)
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) return 'unknown'
  }
  if (keys.length !== allowed.size) return 'count'
  return 'ok'
}

function isRevision(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_REVISION
}

function canonicalUtc(value) {
  if (typeof value !== 'string' || !UTC_PATTERN.test(value)) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString() === value ? value : null
}

function validDisplayName(value) {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > MAX_DISPLAY_NAME) return false
  if (value.trim() !== value) return false
  return !CONTROL_PATTERN.test(value)
}

function parseIntegrity(integrity) {
  if (!isPlainObject(integrity)) return false
  if (keySurface(integrity, INTEGRITY_KEYS) !== 'ok') return false
  if (typeof integrity.sha256 !== 'string' || !SHA256_PATTERN.test(integrity.sha256)) return false
  if (!Number.isInteger(integrity.byteLength)) return false
  if (integrity.byteLength < 1 || integrity.byteLength > MAX_ASSET_BYTES) return false
  return true
}

function parseAsset(raw, index) {
  if (!isPlainObject(raw)) return fail('INVALID_LIBRARY', 'library')
  if (keySurface(raw, ASSET_KEYS) !== 'ok') return fail('INVALID_LIBRARY', 'library')

  const assetId = raw.assetId
  if (typeof assetId !== 'string' || !ASSET_ID_PATTERN.test(assetId)) return fail('INVALID_LIBRARY', 'library')
  if (index.has(assetId)) return fail('DUPLICATE_ID', 'library')

  const revision = raw.revision
  if (!isRevision(revision)) return fail('INVALID_LIBRARY', 'library')

  const scopeId = raw.scopeId
  if (typeof scopeId !== 'string' || !SCOPE_PATTERN.test(scopeId)) return fail('INVALID_LIBRARY', 'library')

  const kind = raw.kind
  if (typeof kind !== 'string' || !ASSET_KINDS.has(kind)) return fail('INVALID_LIBRARY', 'library')

  const candidateId = raw.candidateId
  if (typeof candidateId !== 'string' || !CANDIDATE_PATTERN.test(candidateId)) {
    return fail('INVALID_LIBRARY', 'library')
  }
  if (kind === RVC_MODEL && candidateId !== 'rvc') return fail('INVALID_LIBRARY', 'library')

  const providerRef = raw.providerRef
  if (kind === TTS_VOICE) {
    if (typeof providerRef !== 'string' || !CANDIDATE_PATTERN.test(providerRef)) {
      return fail('INVALID_LIBRARY', 'library')
    }
  } else if (typeof providerRef !== 'string' || !RVC_MODEL_REF_PATTERN.test(providerRef)) {
    return fail('INVALID_LIBRARY', 'library')
  }

  const availability = raw.availability
  if (typeof availability !== 'string' || !AVAILABILITY_STATES.has(availability)) {
    return fail('INVALID_LIBRARY', 'library')
  }

  const rightsState = raw.rightsState
  if (typeof rightsState !== 'string' || !RIGHTS_STATES.has(rightsState)) {
    return fail('INVALID_LIBRARY', 'library')
  }

  const integrity = raw.integrity
  if (kind === TTS_VOICE) {
    if (integrity !== null) return fail('INVALID_LIBRARY', 'library')
  } else if (!parseIntegrity(integrity)) {
    return fail('INVALID_LIBRARY', 'library')
  }

  const expiresAt = raw.expiresAt
  if (expiresAt !== null && canonicalUtc(expiresAt) === null) return fail('INVALID_LIBRARY', 'library')

  const asset = {
    assetId,
    revision,
    scopeId,
    kind,
    candidateId,
    providerRef,
    availability,
    rightsState,
    integrity:
      kind === TTS_VOICE
        ? null
        : { sha256: integrity.sha256, byteLength: integrity.byteLength },
    expiresAt,
  }
  index.set(assetId, asset)
  return { ok: true, value: asset }
}

function parseBinding(raw, seenInstances) {
  if (!isPlainObject(raw)) return fail('INVALID_LIBRARY', 'library')
  if (keySurface(raw, BINDING_KEYS) !== 'ok') return fail('INVALID_LIBRARY', 'library')

  const instanceId = raw.instanceId
  if (typeof instanceId !== 'string' || !INSTANCE_PATTERN.test(instanceId)) {
    return fail('INVALID_LIBRARY', 'library')
  }
  if (seenInstances.has(instanceId)) return fail('DUPLICATE_ID', 'library')
  seenInstances.add(instanceId)

  const assetId = raw.assetId
  if (typeof assetId !== 'string') return fail('INVALID_LIBRARY', 'library')

  return { ok: true, value: { instanceId, assetId } }
}

function parseProfile(raw, seenProfiles) {
  if (!isPlainObject(raw)) return fail('INVALID_LIBRARY', 'library')
  if (keySurface(raw, PROFILE_KEYS) !== 'ok') return fail('INVALID_LIBRARY', 'library')

  const voiceProfileId = raw.voiceProfileId
  if (typeof voiceProfileId !== 'string' || !VOICE_PROFILE_PATTERN.test(voiceProfileId)) {
    return fail('INVALID_LIBRARY', 'library')
  }
  if (seenProfiles.has(voiceProfileId)) return fail('DUPLICATE_ID', 'library')

  const revision = raw.revision
  if (!isRevision(revision)) return fail('INVALID_LIBRARY', 'library')

  const scopeId = raw.scopeId
  if (typeof scopeId !== 'string' || !SCOPE_PATTERN.test(scopeId)) return fail('INVALID_LIBRARY', 'library')

  const displayName = raw.displayName
  if (!validDisplayName(displayName)) return fail('INVALID_LIBRARY', 'library')

  const rightsState = raw.rightsState
  if (typeof rightsState !== 'string' || !RIGHTS_STATES.has(rightsState)) {
    return fail('INVALID_LIBRARY', 'library')
  }

  const rawBindings = raw.bindings
  if (!Array.isArray(rawBindings)) return fail('INVALID_LIBRARY', 'library')
  if (rawBindings.length > MAX_BINDINGS) return fail('RESOURCE_LIMIT', '$')

  const seenInstances = new Set()
  const bindings = []
  for (const rawBinding of rawBindings) {
    const binding = parseBinding(rawBinding, seenInstances)
    if (!binding.ok) return binding
    bindings.push(binding.value)
  }

  seenProfiles.add(voiceProfileId)
  return {
    ok: true,
    value: {
      voiceProfileId,
      revision,
      scopeId,
      displayName,
      rightsState,
      bindings,
    },
  }
}

/**
 * Validate one FixtureVoiceAssetLibrary v1. `nested` selects the resolver's nested-library surface:
 * the outer envelope has already been copied and its unknown/missing keys are reported through
 * INVALID_INPUT, while a malformed nested library is reported as INVALID_LIBRARY/library.
 */
function parseLibrary(library, nested) {
  const shapeKey = nested ? 'INVALID_LIBRARY' : 'INVALID_INPUT'
  const shapePath = nested ? 'library' : '$'

  if (!isPlainObject(library)) return fail(shapeKey, shapePath)

  const surface = keySurface(library, LIBRARY_KEYS)
  if (surface === 'unknown') {
    return fail(nested ? 'INVALID_LIBRARY' : 'INVALID_INPUT', nested ? 'library' : '<unknown-key>')
  }
  if (surface !== 'ok') return fail(shapeKey, shapePath)

  if (library.schemaVersion !== VOICE_ASSETS_SCHEMA_VERSION) {
    return fail('UNSUPPORTED_VERSION', nested ? 'library' : 'schemaVersion')
  }

  const rawAssets = library.assets
  if (!Array.isArray(rawAssets)) return fail('INVALID_LIBRARY', 'library')
  if (rawAssets.length > MAX_ASSETS) return fail('RESOURCE_LIMIT', '$')

  const assetIndex = new Map()
  const assets = []
  for (const rawAsset of rawAssets) {
    const asset = parseAsset(rawAsset, assetIndex)
    if (!asset.ok) return asset
    assets.push(asset.value)
  }

  const rawProfiles = library.profiles
  if (!Array.isArray(rawProfiles)) return fail('INVALID_LIBRARY', 'library')
  if (rawProfiles.length > MAX_PROFILES) return fail('RESOURCE_LIMIT', '$')

  const seenProfiles = new Set()
  const profiles = []
  for (const rawProfile of rawProfiles) {
    const profile = parseProfile(rawProfile, seenProfiles)
    if (!profile.ok) return profile
    profiles.push(profile.value)
  }

  for (const profile of profiles) {
    for (const binding of profile.bindings) {
      const asset = assetIndex.get(binding.assetId)
      if (!asset) return fail('INVALID_REFERENCE', 'library')
      if (asset.scopeId !== profile.scopeId) return fail('INVALID_REFERENCE', 'library')
    }
  }

  return {
    ok: true,
    value: {
      library: { schemaVersion: VOICE_ASSETS_SCHEMA_VERSION, profiles, assets },
      profiles,
      assets,
      assetIndex,
    },
  }
}

function validateVoiceAssetLibraryInternal(input) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) return fail(copied.key, '$')

  const parsed = parseLibrary(copied.value, false)
  if (!parsed.ok) return parsed

  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: VOICE_ASSETS_SCHEMA_VERSION,
      library: parsed.value.library,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

/**
 * Validate a FixtureVoiceAssetLibrary v1.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function validateVoiceAssetLibrary(input) {
  try {
    return validateVoiceAssetLibraryInternal(input)
  } catch {
    return fail('INVALID_INPUT', '$')
  }
}

function parseExpectation(raw) {
  if (!isPlainObject(raw)) return { ok: false }
  if (keySurface(raw, EXPECTATION_KEYS) !== 'ok') return { ok: false }
  if (typeof raw.scopeId !== 'string' || !SCOPE_PATTERN.test(raw.scopeId)) return { ok: false }
  if (!isRevision(raw.profileRevision)) return { ok: false }
  if (!isRevision(raw.assetRevision)) return { ok: false }
  return {
    ok: true,
    value: { scopeId: raw.scopeId, profileRevision: raw.profileRevision, assetRevision: raw.assetRevision },
  }
}

function validTaskValue(value) {
  if (!isPlainObject(value)) return false
  if (typeof value.taskId !== 'string' || typeof value.voiceProfileId !== 'string') return false
  if (typeof value.feature !== 'string') return false
  if (value.taskType !== 'TTS' && value.taskType !== 'SVC') return false
  if (!isPlainObject(value.source) || typeof value.source.ref !== 'string') return false
  if (!isPlainObject(value.rights) || typeof value.rights.state !== 'string') return false
  return true
}

function validNegotiationValue(value) {
  if (!isPlainObject(value)) return false
  if (value.decision !== 'FIXTURE_COMPATIBLE' && value.decision !== 'BLOCKED') return false
  if (value.category !== 'TTS' && value.category !== 'SVC') return false
  if (typeof value.instanceId !== 'string' || !INSTANCE_PATTERN.test(value.instanceId)) return false
  if (value.candidateId !== null && typeof value.candidateId !== 'string') return false
  if (value.reason !== null && typeof value.reason !== 'string') return false
  if (typeof value.messageZh !== 'string') return false
  if (value.mockOnly !== true) return false
  if (value.realOperationAllowed !== false) return false
  if (value.submitAllowed !== false) return false
  if (value.automaticRetryAllowed !== false) return false
  if (value.decision === 'FIXTURE_COMPATIBLE') {
    if (value.reason !== null) return false
    if (typeof value.candidateId !== 'string') return false
  }
  if (value.decision === 'BLOCKED' && typeof value.reason !== 'string') return false
  return true
}

function blockingEnvelope(draft, provider, reasonKey, messageZh) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: VOICE_ASSETS_SCHEMA_VERSION,
      decision: 'BLOCKED',
      reason: VOICE_ASSET_ERRORS[reasonKey],
      messageZh: messageZh === undefined ? BUSINESS_MESSAGES[reasonKey] : messageZh,
      taskId: draft.taskId,
      feature: draft.feature,
      voiceProfileId: draft.voiceProfileId,
      binding: null,
      provider,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

function boundEnvelope(draft, provider, expectation, profile, asset, instanceId) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: VOICE_ASSETS_SCHEMA_VERSION,
      decision: 'FIXTURE_BOUND',
      reason: null,
      messageZh: BOUND_MESSAGE,
      taskId: draft.taskId,
      feature: draft.feature,
      voiceProfileId: draft.voiceProfileId,
      binding: {
        scopeId: expectation.scopeId,
        profileRevision: profile.revision,
        assetId: asset.assetId,
        assetRevision: asset.revision,
        kind: asset.kind,
        instanceId,
        candidateId: asset.candidateId,
        providerRef: asset.providerRef,
      },
      provider,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

function resolveFixtureVoiceBindingInternal(input) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) return fail(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) return fail('INVALID_INPUT', '$')

  const surface = keySurface(payload, RESOLVER_KEYS)
  if (surface === 'unknown') return fail('INVALID_INPUT', '<unknown-key>')
  if (surface !== 'ok') return fail('INVALID_INPUT', '$')
  if (payload.schemaVersion !== VOICE_ASSETS_SCHEMA_VERSION) {
    return fail('UNSUPPORTED_VERSION', 'schemaVersion')
  }

  const expectation = parseExpectation(payload.expectation)
  if (!expectation.ok) return fail('INVALID_EXPECTATION', 'expectation')

  const now = canonicalUtc(payload.now)
  if (now === null) return fail('INVALID_NOW', 'now')

  const parsed = parseLibrary(payload.library, true)
  if (!parsed.ok) return parsed
  const { profiles, assetIndex } = parsed.value

  let task
  try {
    task = validateAudioTaskDraft(payload.taskDraft)
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!task || typeof task !== 'object' || typeof task.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (task.ok === false) return fail('INVALID_TASK', 'taskDraft')
  const draft = task.value
  if (!validTaskValue(draft)) return fail('DEPENDENCY_FAILURE', '$')

  let negotiation
  try {
    negotiation = negotiateProviderInstance(payload.negotiation)
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!negotiation || typeof negotiation !== 'object' || typeof negotiation.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (negotiation.ok === false) return fail('INVALID_NEGOTIATION', 'negotiation')
  if (!validNegotiationValue(negotiation.value)) return fail('DEPENDENCY_FAILURE', '$')

  const providerCopy = copyFixtureInput(negotiation.value)
  if (!providerCopy.ok) return fail('DEPENDENCY_FAILURE', '$')
  const provider = providerCopy.value

  if (draft.taskType !== negotiation.value.category) {
    return blockingEnvelope(draft, provider, 'TASK_KIND_MISMATCH')
  }
  if (draft.rights.state !== RIGHTS_CONFIRMED) {
    return blockingEnvelope(draft, provider, 'TASK_RIGHTS_UNCONFIRMED')
  }
  if (negotiation.value.decision === 'BLOCKED') {
    return blockingEnvelope(draft, provider, 'PROVIDER_BLOCKED', negotiation.value.messageZh)
  }

  const selection = payload.negotiation.selection
  if (!isPlainObject(selection) || typeof selection.instanceId !== 'string') {
    return fail('INVALID_NEGOTIATION', 'negotiation')
  }
  const instanceId = selection.instanceId

  const profile = profiles.find(
    (item) => item.voiceProfileId === draft.voiceProfileId && item.scopeId === expectation.value.scopeId,
  )
  if (!profile) return blockingEnvelope(draft, provider, 'PROFILE_UNAVAILABLE')
  if (profile.revision !== expectation.value.profileRevision) {
    return blockingEnvelope(draft, provider, 'PROFILE_REVISION_MISMATCH')
  }
  if (profile.rightsState !== RIGHTS_CONFIRMED) {
    return blockingEnvelope(draft, provider, 'PROFILE_RIGHTS_UNCONFIRMED')
  }

  const binding = profile.bindings.find((item) => item.instanceId === instanceId)
  if (!binding) return blockingEnvelope(draft, provider, 'BINDING_MISSING')
  const asset = assetIndex.get(binding.assetId)
  if (!asset) return fail('INVALID_REFERENCE', 'library')

  if (asset.revision !== expectation.value.assetRevision) {
    return blockingEnvelope(draft, provider, 'ASSET_REVISION_MISMATCH')
  }
  if (asset.rightsState !== RIGHTS_CONFIRMED) {
    return blockingEnvelope(draft, provider, 'ASSET_RIGHTS_UNCONFIRMED')
  }
  if (asset.availability === 'ABSENT') return blockingEnvelope(draft, provider, 'ASSET_MISSING')
  if (asset.availability === 'UNKNOWN') return blockingEnvelope(draft, provider, 'ASSET_UNKNOWN')
  if (asset.expiresAt !== null && Date.parse(asset.expiresAt) <= Date.parse(now)) {
    return blockingEnvelope(draft, provider, 'ASSET_EXPIRED')
  }

  const expectedKind = draft.taskType === 'TTS' ? TTS_VOICE : RVC_MODEL
  if (asset.kind !== expectedKind) return blockingEnvelope(draft, provider, 'ASSET_KIND_MISMATCH')
  if (asset.candidateId !== negotiation.value.candidateId) {
    return blockingEnvelope(draft, provider, 'CANDIDATE_MISMATCH')
  }

  const request = payload.negotiation.request
  const expectedProviderRef = draft.taskType === 'TTS' ? request.voiceId : request.targetModelId
  if (typeof expectedProviderRef !== 'string' || asset.providerRef !== expectedProviderRef) {
    return blockingEnvelope(draft, provider, 'PROVIDER_REF_MISMATCH')
  }
  if (draft.taskType === 'SVC' && draft.source.ref !== request.sourceAudioRef) {
    return blockingEnvelope(draft, provider, 'SOURCE_MISMATCH')
  }

  return boundEnvelope(draft, provider, expectation.value, profile, asset, instanceId)
}

/**
 * Resolve one explicit Fixture voice binding.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function resolveFixtureVoiceBinding(input) {
  try {
    return resolveFixtureVoiceBindingInternal(input)
  } catch {
    return fail('INVALID_INPUT', '$')
  }
}
