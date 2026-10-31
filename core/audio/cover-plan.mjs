/* Whale Voice — pure Fixture cover stage planner (Plan 08-F-A, OFFLINE / PLAN_ONLY).
 *
 * One synchronous, side-effect-free function that validates an existing Fixture source/binding
 * request plus one cover recipe and one Fixture capability declaration, and returns the frozen,
 * explicitly non-executing stage plan. It reuses the original source resolver exactly once and never
 * calls an engine, gateway simulator, producer, owner/save, artifact writer/store, filesystem,
 * network, process, clock or random source. The result is planning metadata only: no Task is
 * created or executed and no audio is generated, saved or sent.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { SOURCE_ARTIFACT_ERRORS, resolveFixtureTaskSource } from './source-artifacts.mjs'

export const COVER_PLAN_SCHEMA_VERSION = 1

export const COVER_PLAN_LIMITS = deepFreezeFixtureValue({
  minPitchShift: -12,
  maxPitchShift: 12,
  minGainDb: -24,
  maxGainDb: 12,
  maxStages: 4,
})

const CODE_KEYS = Object.freeze([
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
])

export const COVER_PLAN_CODES = deepFreezeFixtureValue(
  Object.fromEntries(CODE_KEYS.map((key) => [key, 'COVER_PLAN_' + key])),
)

const ERROR_REASONS = Object.freeze({
  INVALID_INPUT: 'invalid input',
  RESOURCE_LIMIT: 'resource limit exceeded',
  UNSUPPORTED_VERSION: 'unsupported schema version',
  INVALID_RECIPE: 'invalid cover recipe',
  INVALID_CAPABILITIES: 'invalid fixture capabilities',
  SOURCE_INVALID: 'invalid fixture source',
  DEPENDENCY_FAILURE: 'source dependency failure',
})

const BUSINESS_MESSAGES_ZH = Object.freeze({
  SOURCE_BLOCKED: '所选演示源或音色目前不可用；请重新核对，系统不会自动替换或重试。',
  UNSUPPORTED_TASK: '当前演示规划仅支持唱歌的SVC任务。',
  SEPARATION_UNAVAILABLE: '演示分离能力不可用，暂不能规划混合歌曲的翻唱。',
  SEPARATION_UNKNOWN: '演示分离能力状态未知，请先确认。',
  MIXING_UNAVAILABLE: '演示混音能力不可用，暂不能完成阶段规划。',
  MIXING_UNKNOWN: '演示混音能力状态未知，请先确认。',
  INSTRUMENTAL_MISSING: '清唱源未提供伴奏，不能规划带伴奏混音；请选择仅人声。',
})

const PLANNED_MESSAGE_ZH = '已生成演示翻唱阶段计划；尚未分离、转换、混音、校验或保存音频。'

const ROOT_KEYS = Object.freeze(new Set(['schemaVersion', 'sourceInput', 'recipe', 'capabilities']))
const RECIPE_KEYS = Object.freeze(new Set(['schemaVersion', 'sourceLayout', 'separationPreset', 'mixConfig']))
const MIX_KEYS = Object.freeze(new Set(['mode', 'vocalGainDb', 'instrumentalGainDb']))
const CAPABILITY_KEYS = Object.freeze(new Set(['schemaVersion', 'separator', 'mixer']))
const SOURCE_RESULT_KEYS = Object.freeze(new Set(['ok', 'value']))
const SOURCE_FAILED_KEYS = Object.freeze(new Set(['ok', 'errors']))
const SOURCE_VALUE_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'decision',
    'reason',
    'messageZh',
    'voiceBinding',
    'source',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
  ]),
)
const BINDING_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'decision',
    'reason',
    'messageZh',
    'taskId',
    'feature',
    'voiceProfileId',
    'binding',
    'provider',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
  ]),
)
const BINDING_INNER_KEYS = Object.freeze(
  new Set([
    'scopeId',
    'profileRevision',
    'assetId',
    'assetRevision',
    'kind',
    'instanceId',
    'candidateId',
    'providerRef',
  ]),
)
const PROVIDER_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'category',
    'instanceId',
    'candidateId',
    'decision',
    'reason',
    'messageZh',
    'mockOnly',
    'realOperationAllowed',
    'submitAllowed',
    'automaticRetryAllowed',
  ]),
)
const SOURCE_POINTER_KEYS = Object.freeze(new Set(['kind', 'revision']))

const SOURCE_LAYOUTS = Object.freeze(
  new Map([
    ['MIXED', 'FIXTURE_TWO_STEM'],
    ['CLEAN_VOCAL', 'NONE'],
  ]),
)
const SEPARATION_PRESETS = Object.freeze(new Set(['NONE', 'FIXTURE_TWO_STEM']))
const MIX_MODES = Object.freeze(new Set(['VOCAL_ONLY', 'WITH_INSTRUMENTAL']))
const CAPABILITY_STATES = Object.freeze(new Set(['AVAILABLE_FIXTURE', 'UNAVAILABLE', 'UNKNOWN']))

const BLOCKED_BUSINESS_REASONS = Object.freeze(
  new Set([
    SOURCE_ARTIFACT_ERRORS.VOICE_BINDING_BLOCKED,
    SOURCE_ARTIFACT_ERRORS.SOURCE_UNAVAILABLE,
    SOURCE_ARTIFACT_ERRORS.SOURCE_REVISION_MISMATCH,
    SOURCE_ARTIFACT_ERRORS.SOURCE_RIGHTS_UNCONFIRMED,
    SOURCE_ARTIFACT_ERRORS.SOURCE_MISSING,
    SOURCE_ARTIFACT_ERRORS.SOURCE_UNKNOWN,
    SOURCE_ARTIFACT_ERRORS.SOURCE_EXPIRED,
    SOURCE_ARTIFACT_ERRORS.SOURCE_KIND_MISMATCH,
    SOURCE_ARTIFACT_ERRORS.SOURCE_TEXT_MISMATCH,
    SOURCE_ARTIFACT_ERRORS.SOURCE_AUDIO_MISMATCH,
  ]),
)
const SOURCE_ERROR_VALUES = Object.freeze(new Set(Object.values(SOURCE_ARTIFACT_ERRORS)))

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function ownData(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null
  if (descriptor.enumerable !== true) return null
  return { value: descriptor.value }
}

function ownKeys(object) {
  let keys
  try {
    keys = Reflect.ownKeys(object)
  } catch {
    return null
  }
  for (const key of keys) {
    if (typeof key !== 'string') return null
  }
  return keys
}

function keySurface(object, expected) {
  const keys = ownKeys(object)
  if (keys === null) return 'malformed'
  for (const key of keys) {
    if (!expected.has(key)) return 'unknown'
  }
  if (keys.length !== expected.size) return 'missing'
  for (const key of expected) {
    if (!ownData(object, key)) return 'malformed'
  }
  return 'ok'
}

function issue(code, path, reason) {
  return { code, path, reason }
}

function fail(key, path) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [issue(COVER_PLAN_CODES[key], path, ERROR_REASONS[key])],
  })
}

function blocked(key, dependencyReason = null) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: COVER_PLAN_SCHEMA_VERSION,
      decision: 'BLOCKED',
      reason: COVER_PLAN_CODES[key],
      dependencyReason,
      messageZh: BUSINESS_MESSAGES_ZH[key],
      association: null,
      recipe: null,
      stages: [],
      outputSlot: null,
      outputArtifactRef: null,
      taskAuthority: 'UNVERIFIED',
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

function planned(association, recipe, stages) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: COVER_PLAN_SCHEMA_VERSION,
      decision: 'PLANNED',
      reason: null,
      dependencyReason: null,
      messageZh: PLANNED_MESSAGE_ZH,
      association,
      recipe,
      stages,
      outputSlot: 'VERIFIED_MASTER',
      outputArtifactRef: null,
      taskAuthority: 'UNVERIFIED',
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

/* -------------------------------------- local protocol -------------------------------------- */

function readRecipe(value) {
  if (!isPlainObject(value) || keySurface(value, RECIPE_KEYS) !== 'ok') return { ok: false, key: 'INVALID_RECIPE' }
  const version = ownData(value, 'schemaVersion').value
  if (version !== COVER_PLAN_SCHEMA_VERSION) {
    return { ok: false, key: 'UNSUPPORTED_VERSION', path: 'recipe.schemaVersion' }
  }
  const sourceLayout = ownData(value, 'sourceLayout').value
  const separationPreset = ownData(value, 'separationPreset').value
  if (typeof sourceLayout !== 'string' || !SOURCE_LAYOUTS.has(sourceLayout)) return { ok: false, key: 'INVALID_RECIPE' }
  if (typeof separationPreset !== 'string' || !SEPARATION_PRESETS.has(separationPreset)) {
    return { ok: false, key: 'INVALID_RECIPE' }
  }
  if (SOURCE_LAYOUTS.get(sourceLayout) !== separationPreset) return { ok: false, key: 'INVALID_RECIPE' }
  const mixRaw = ownData(value, 'mixConfig').value
  if (!isPlainObject(mixRaw) || keySurface(mixRaw, MIX_KEYS) !== 'ok') return { ok: false, key: 'INVALID_RECIPE' }
  const mode = ownData(mixRaw, 'mode').value
  const vocalGainDb = ownData(mixRaw, 'vocalGainDb').value
  const instrumentalGainDb = ownData(mixRaw, 'instrumentalGainDb').value
  if (typeof mode !== 'string' || !MIX_MODES.has(mode)) return { ok: false, key: 'INVALID_RECIPE' }
  if (typeof vocalGainDb !== 'number' || !Number.isFinite(vocalGainDb)) return { ok: false, key: 'INVALID_RECIPE' }
  if (typeof instrumentalGainDb !== 'number' || !Number.isFinite(instrumentalGainDb)) {
    return { ok: false, key: 'INVALID_RECIPE' }
  }
  if (vocalGainDb < COVER_PLAN_LIMITS.minGainDb || vocalGainDb > COVER_PLAN_LIMITS.maxGainDb) {
    return { ok: false, key: 'INVALID_RECIPE' }
  }
  if (instrumentalGainDb < COVER_PLAN_LIMITS.minGainDb || instrumentalGainDb > COVER_PLAN_LIMITS.maxGainDb) {
    return { ok: false, key: 'INVALID_RECIPE' }
  }
  if (mode === 'VOCAL_ONLY' && instrumentalGainDb !== 0) return { ok: false, key: 'INVALID_RECIPE' }
  return {
    ok: true,
    value: {
      schemaVersion: COVER_PLAN_SCHEMA_VERSION,
      sourceLayout,
      separationPreset,
      mixConfig: { mode, vocalGainDb, instrumentalGainDb },
    },
  }
}

function readCapabilities(value) {
  if (!isPlainObject(value) || keySurface(value, CAPABILITY_KEYS) !== 'ok') {
    return { ok: false, key: 'INVALID_CAPABILITIES' }
  }
  const version = ownData(value, 'schemaVersion').value
  if (version !== COVER_PLAN_SCHEMA_VERSION) {
    return { ok: false, key: 'UNSUPPORTED_VERSION', path: 'capabilities.schemaVersion' }
  }
  const separator = ownData(value, 'separator').value
  const mixer = ownData(value, 'mixer').value
  if (typeof separator !== 'string' || !CAPABILITY_STATES.has(separator)) {
    return { ok: false, key: 'INVALID_CAPABILITIES' }
  }
  if (typeof mixer !== 'string' || !CAPABILITY_STATES.has(mixer)) {
    return { ok: false, key: 'INVALID_CAPABILITIES' }
  }
  return { ok: true, value: { separator, mixer } }
}

/** Capture the resolver return without ever reading an accessor; null means a bad dependency shape. */
function captureSourceResult(resolved) {
  if (!isPlainObject(resolved)) return null
  const okField = ownData(resolved, 'ok')
  if (!okField || typeof okField.value !== 'boolean') return null
  if (okField.value === false) {
    if (keySurface(resolved, SOURCE_FAILED_KEYS) !== 'ok') return null
    const errors = ownData(resolved, 'errors').value
    if (!Array.isArray(errors) || errors.length !== 1) return null
    if (Object.getPrototypeOf(errors) !== Array.prototype) return null
    const error = errors[0]
    if (!isPlainObject(error)) return null
    const errorKeys = ownKeys(error)
    if (errorKeys === null || errorKeys.length !== 3) return null
    if (keySurface(error, new Set(['code', 'path', 'reason'])) !== 'ok') return null
    const code = ownData(error, 'code').value
    if (typeof code !== 'string' || !SOURCE_ERROR_VALUES.has(code)) return null
    if (typeof ownData(error, 'path').value !== 'string') return null
    if (typeof ownData(error, 'reason').value !== 'string') return null
    return { kind: 'failed' }
  }
  if (keySurface(resolved, SOURCE_RESULT_KEYS) !== 'ok') return null
  const value = ownData(resolved, 'value').value
  if (!isPlainObject(value) || keySurface(value, SOURCE_VALUE_KEYS) !== 'ok') return null
  const schemaVersion = ownData(value, 'schemaVersion').value
  if (schemaVersion !== 1) return null
  const decision = ownData(value, 'decision').value
  if (decision !== 'FIXTURE_SOURCE_LINKED' && decision !== 'BLOCKED') return null
  if (ownData(value, 'mockOnly').value !== true) return null
  if (ownData(value, 'realOperationAllowed').value !== false) return null
  if (ownData(value, 'submitAllowed').value !== false) return null
  if (ownData(value, 'automaticRetryAllowed').value !== false) return null
  const messageZh = ownData(value, 'messageZh').value
  if (typeof messageZh !== 'string' || messageZh.length < 1 || messageZh.length > 512) return null
  const reason = ownData(value, 'reason').value
  if (decision === 'BLOCKED') {
    if (typeof reason !== 'string' || !BLOCKED_BUSINESS_REASONS.has(reason)) return null
    if (ownData(value, 'source').value !== null) return null
    return { kind: 'blocked', dependencyReason: reason }
  }
  if (reason !== null) return null
  const binding = ownData(value, 'voiceBinding').value
  if (!isPlainObject(binding) || keySurface(binding, BINDING_KEYS) !== 'ok') return null
  if (ownData(binding, 'schemaVersion').value !== 1) return null
  if (ownData(binding, 'decision').value !== 'FIXTURE_BOUND') return null
  if (ownData(binding, 'reason').value !== null) return null
  const bindingMessage = ownData(binding, 'messageZh').value
  if (typeof bindingMessage !== 'string' || bindingMessage.length < 1 || bindingMessage.length > 512) return null
  for (const key of ['taskId', 'feature', 'voiceProfileId']) {
    if (typeof ownData(binding, key).value !== 'string') return null
  }
  for (const key of ['mockOnly', 'realOperationAllowed', 'submitAllowed', 'automaticRetryAllowed']) {
    if (typeof ownData(binding, key).value !== 'boolean') return null
  }
  if (ownData(binding, 'mockOnly').value !== true || ownData(binding, 'realOperationAllowed').value !== false) {
    return null
  }
  if (ownData(binding, 'submitAllowed').value !== false || ownData(binding, 'automaticRetryAllowed').value !== false) {
    return null
  }
  const inner = ownData(binding, 'binding').value
  if (!isPlainObject(inner) || keySurface(inner, BINDING_INNER_KEYS) !== 'ok') return null
  for (const key of ['scopeId', 'instanceId', 'candidateId', 'providerRef']) {
    if (typeof ownData(inner, key).value !== 'string') return null
  }
  if (typeof ownData(inner, 'kind').value !== 'string') return null
  for (const key of ['profileRevision', 'assetRevision']) {
    const number = ownData(inner, key).value
    if (!Number.isInteger(number) || number < 1) return null
  }
  const provider = ownData(binding, 'provider').value
  if (!isPlainObject(provider)) return null
  // 088-R01/A: only the provider facts this planner actually consumes are required. Unconsumed
  // provider internals (schemaVersion/decision/reason/messageZh/flags or any extra safe field) are
  // not turned into a new local schema and are never existence- or value-checked here.
  const category = ownData(provider, 'category')
  if (category === null) return null
  const categoryValue = category.value
  if (categoryValue !== 'SVC' && categoryValue !== 'TTS') return null
  for (const key of ['instanceId', 'candidateId']) {
    const field = ownData(provider, key)
    if (field === null || typeof field.value !== 'string') return null
  }
  const pointer = ownData(value, 'source').value
  if (!isPlainObject(pointer) || keySurface(pointer, SOURCE_POINTER_KEYS) !== 'ok') return null
  const pointerKind = ownData(pointer, 'kind').value
  if (pointerKind !== 'AUDIO' && pointerKind !== 'TEXT') return null
  const revision = ownData(pointer, 'revision').value
  if (!Number.isInteger(revision) || revision < 1) return null
  return {
    kind: 'linked',
    value: {
      taskId: ownData(binding, 'taskId').value,
      feature: ownData(binding, 'feature').value,
      voiceProfileId: ownData(binding, 'voiceProfileId').value,
      kind: ownData(inner, 'kind').value,
      scopeId: ownData(inner, 'scopeId').value,
      profileRevision: ownData(inner, 'profileRevision').value,
      assetId: ownData(inner, 'assetId').value,
      assetRevision: ownData(inner, 'assetRevision').value,
      instanceId: ownData(inner, 'instanceId').value,
      candidateId: ownData(inner, 'candidateId').value,
      providerRef: ownData(inner, 'providerRef').value,
      providerCategory: categoryValue,
      providerInstanceId: ownData(provider, 'instanceId').value,
      providerCandidateId: ownData(provider, 'candidateId').value,
      sourceKind: pointerKind,
      sourceRevision: revision,
    },
  }
}

/** Common facts every accepted source must agree with, before the task-kind branch. */
function commonFacts(sourceInput, linked) {
  const voiceBinding = sourceInput.voiceBinding
  if (!isPlainObject(voiceBinding)) return null
  const draft = voiceBinding.taskDraft
  if (!isPlainObject(draft)) return null
  if (linked.taskId !== draft.taskId) return null
  if (linked.feature !== draft.feature) return null
  if (linked.voiceProfileId !== draft.voiceProfileId) return null
  return draft
}

/** The complete SVC-only single-source association check (§5.2); any mismatch is a dependency bug. */
function svcFacts(sourceInput, linked, draft) {
  const voiceBinding = sourceInput.voiceBinding
  const negotiation = voiceBinding.negotiation
  const expectation = voiceBinding.expectation
  const library = voiceBinding.library
  const artifactLibrary = sourceInput.artifactLibrary
  if (![negotiation, expectation, library, artifactLibrary].every(isPlainObject)) return null
  const selection = negotiation.selection
  const request = negotiation.request
  if (!isPlainObject(selection) || !isPlainObject(request)) return null
  if (linked.providerCategory !== 'SVC') return null
  if (linked.kind !== 'RVC_MODEL' || linked.candidateId !== 'rvc') return null
  if (linked.scopeId !== expectation.scopeId) return null
  if (linked.profileRevision !== expectation.profileRevision) return null
  if (linked.assetRevision !== expectation.assetRevision) return null
  if (linked.instanceId !== selection.instanceId) return null
  if (linked.providerInstanceId !== linked.instanceId) return null
  if (linked.providerCandidateId !== linked.candidateId) return null
  if (linked.providerRef !== request.targetModelId) return null
  const draftSource = draft.source
  if (!isPlainObject(draftSource)) return null
  if (draftSource.kind !== 'AUDIO_REF') return null
  if (draftSource.ref !== request.sourceAudioRef) return null
  if (linked.sourceKind !== 'AUDIO') return null
  if (linked.sourceRevision !== sourceInput.sourceRevision) return null
  const profiles = library.profiles
  const assets = library.assets
  const artifacts = artifactLibrary.artifacts
  if (!Array.isArray(profiles) || !Array.isArray(assets) || !Array.isArray(artifacts)) return null
  const profile = profiles.find(
    (item) => isPlainObject(item) && item.voiceProfileId === linked.voiceProfileId && item.scopeId === linked.scopeId,
  )
  if (!profile || profile.revision !== linked.profileRevision) return null
  if (!Array.isArray(profile.bindings)) return null
  const binding = profile.bindings.find(
    (item) => isPlainObject(item) && item.instanceId === linked.instanceId && item.assetId === linked.assetId,
  )
  if (!binding) return null
  const asset = assets.find(
    (item) => isPlainObject(item) && item.assetId === linked.assetId && item.scopeId === linked.scopeId,
  )
  if (!asset || asset.revision !== linked.assetRevision) return null
  if (asset.candidateId !== linked.candidateId || asset.providerRef !== linked.providerRef) return null
  const artifact = artifacts.find(
    (item) => isPlainObject(item) && item.artifactRef === draftSource.ref && item.scopeId === linked.scopeId,
  )
  if (!artifact || artifact.revision !== linked.sourceRevision || artifact.kind !== 'AUDIO') return null
  const pitch = request.pitchShift
  if (!Number.isInteger(pitch)) return null
  if (pitch < COVER_PLAN_LIMITS.minPitchShift || pitch > COVER_PLAN_LIMITS.maxPitchShift) return null
  return { pitchShift: pitch }
}
/* ------------------------------------------ stages ------------------------------------------ */

function stageName(name, inputs, outputs) {
  return { stage: name, inputs: [...inputs], outputs: [...outputs] }
}

function buildStages(sourceLayout, mode) {
  if (sourceLayout === 'CLEAN_VOCAL') {
    return [
      stageName('CONVERTING', ['SOURCE'], ['CONVERTED_VOCAL']),
      stageName('MIXING', ['CONVERTED_VOCAL'], ['MASTER']),
      stageName('VERIFYING', ['MASTER'], ['VERIFIED_MASTER']),
    ]
  }
  const stages = [
    stageName('SEPARATING', ['SOURCE'], ['VOCAL', 'INSTRUMENTAL']),
    stageName('CONVERTING', ['VOCAL'], ['CONVERTED_VOCAL']),
  ]
  if (mode === 'WITH_INSTRUMENTAL') {
    stages.push(stageName('MIXING', ['CONVERTED_VOCAL', 'INSTRUMENTAL'], ['MASTER']))
  } else {
    stages.push(stageName('MIXING', ['CONVERTED_VOCAL'], ['MASTER']))
  }
  stages.push(stageName('VERIFYING', ['MASTER'], ['VERIFIED_MASTER']))
  return stages
}

/* ------------------------------------------- planner ------------------------------------------ */

/**
 * Validate one Fixture cover request and return a frozen, explicitly non-executing stage plan.
 * Pure and synchronous: the only dependency call is `resolveFixtureTaskSource` exactly once.
 */
export function planFixtureCover(payload) {
  const copied = copyFixtureInput(payload)
  if (!copied.ok) return fail(copied.key === 'RESOURCE_LIMIT' ? 'RESOURCE_LIMIT' : 'INVALID_INPUT', '$')
  const root = copied.value
  if (!isPlainObject(root)) return fail('INVALID_INPUT', '$')
  const surface = keySurface(root, ROOT_KEYS)
  if (surface === 'unknown') return fail('INVALID_INPUT', '<unknown-key>')
  if (surface !== 'ok') return fail('INVALID_INPUT', '$')
  if (ownData(root, 'schemaVersion').value !== COVER_PLAN_SCHEMA_VERSION) {
    return fail('UNSUPPORTED_VERSION', 'schemaVersion')
  }

  const recipe = readRecipe(ownData(root, 'recipe').value)
  if (!recipe.ok) return fail(recipe.key, recipe.path || 'recipe')
  const capabilities = readCapabilities(ownData(root, 'capabilities').value)
  if (!capabilities.ok) return fail(capabilities.key, capabilities.path || 'capabilities')

  const sourceInput = ownData(root, 'sourceInput').value
  if (!isPlainObject(sourceInput)) return fail('SOURCE_INVALID', 'sourceInput')
  let resolved
  try {
    resolved = resolveFixtureTaskSource(sourceInput)
  } catch {
    return fail('DEPENDENCY_FAILURE', 'sourceInput')
  }
  // 088-R01: the whole dependency return is bounded-safe-copied by the original helper before any
  // field is read, so accessors, throwing proxies, over-budget/unconsumed subgraphs and malformed
  // failures all close into the fixed DEPENDENCY_FAILURE without leaking an exception or a getter.
  let copiedReturn
  try {
    copiedReturn = copyFixtureInput(resolved)
  } catch {
    return fail('DEPENDENCY_FAILURE', 'sourceInput')
  }
  if (!copiedReturn.ok) return fail('DEPENDENCY_FAILURE', 'sourceInput')
  const captured = captureSourceResult(copiedReturn.value)
  if (captured === null) return fail('DEPENDENCY_FAILURE', 'sourceInput')
  if (captured.kind === 'failed') return fail('SOURCE_INVALID', 'sourceInput')
  if (captured.kind === 'blocked') return blocked('SOURCE_BLOCKED', captured.dependencyReason)

  const linked = captured.value
  const draft = commonFacts(sourceInput, linked)
  if (draft === null) return fail('DEPENDENCY_FAILURE', 'sourceInput')
  if (draft.feature !== 'singing' || draft.taskType !== 'SVC') return blocked('UNSUPPORTED_TASK')
  const facts = svcFacts(sourceInput, linked, draft)
  if (facts === null) return fail('DEPENDENCY_FAILURE', 'sourceInput')

  const recipeValue = recipe.value
  const layout = recipeValue.sourceLayout
  const mode = recipeValue.mixConfig.mode
  if (layout === 'CLEAN_VOCAL' && mode === 'WITH_INSTRUMENTAL') return blocked('INSTRUMENTAL_MISSING')
  if (layout === 'MIXED') {
    if (capabilities.value.separator === 'UNAVAILABLE') return blocked('SEPARATION_UNAVAILABLE')
    if (capabilities.value.separator === 'UNKNOWN') return blocked('SEPARATION_UNKNOWN')
  }
  if (capabilities.value.mixer === 'UNAVAILABLE') return blocked('MIXING_UNAVAILABLE')
  if (capabilities.value.mixer === 'UNKNOWN') return blocked('MIXING_UNKNOWN')

  const association = {
    taskId: linked.taskId,
    scopeId: linked.scopeId,
    voiceProfileId: linked.voiceProfileId,
    profileRevision: linked.profileRevision,
    modelAssetId: linked.assetId,
    modelRevision: linked.assetRevision,
    instanceId: linked.instanceId,
    candidateId: linked.candidateId,
    modelId: linked.providerRef,
    sourceRef: draft.source.ref,
    sourceRevision: linked.sourceRevision,
  }
  const plannedRecipe = {
    schemaVersion: COVER_PLAN_SCHEMA_VERSION,
    sourceLayout: layout,
    separationPreset: recipeValue.separationPreset,
    mixConfig: {
      mode: recipeValue.mixConfig.mode,
      vocalGainDb: recipeValue.mixConfig.vocalGainDb,
      instrumentalGainDb: recipeValue.mixConfig.instrumentalGainDb,
    },
    pitchShift: facts.pitchShift,
  }
  return planned(association, plannedRecipe, buildStages(layout, mode))
}
