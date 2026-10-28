/* Whale Voice — Fixture source Artifact library & task/request association (Plan 08-B,
 * OFFLINE / FIXTURE_ONLY).
 *
 * One bounded, pure Fixture layer over the accepted 08-A voice binding. It answers one question
 * only: "does the task's declared source reference point at a source entry in the same fixture
 * scope whose declared content/metadata exactly matches the same Provider request?"
 *
 * TTS compares the fixture text with the request text by strict JavaScript string equality (no
 * trim, concatenation, newline or Unicode normalisation). SVC compares the fixture audio metadata
 * (durationMs, byteLength, sampleRate, channels) with the request inputAudio fields. A
 * FIXTURE_SOURCE_LINKED decision proves only that declared Fixture data is consistent: it does not
 * prove bytes exist, audio decodes, a codec/peak/checksum is valid, a real authorization exists, or
 * that audio was generated, saved, delivered or sent.
 *
 * No I/O, no clock/randomness, no network, no process, no dispatcher, no Task transition, no queue,
 * no ID allocation and no module-level mutable business state. Both entry points take one bounded
 * structural copy through the shared Fixture input boundary; outputs are fresh and deeply frozen.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { resolveFixtureVoiceBinding } from './voice-assets.mjs'
import { RVC_FAKE_LIMITS } from '../svc/rvc-fake-gateway.mjs'

export const SOURCE_ARTIFACTS_SCHEMA_VERSION = 1

const ERROR_KEYS = Object.freeze([
  'INVALID_INPUT',
  'RESOURCE_LIMIT',
  'UNSUPPORTED_VERSION',
  'INVALID_LIBRARY',
  'DUPLICATE_ARTIFACT',
  'INVALID_SOURCE_REVISION',
  'VOICE_BINDING_INVALID',
  'DEPENDENCY_FAILURE',
  'VOICE_BINDING_BLOCKED',
  'SOURCE_UNAVAILABLE',
  'SOURCE_REVISION_MISMATCH',
  'SOURCE_RIGHTS_UNCONFIRMED',
  'SOURCE_MISSING',
  'SOURCE_UNKNOWN',
  'SOURCE_EXPIRED',
  'SOURCE_KIND_MISMATCH',
  'SOURCE_TEXT_MISMATCH',
  'SOURCE_AUDIO_MISMATCH',
])

/** Fixed error/reason protocol. Every value is `SOURCE_ARTIFACT_` plus the key itself. */
export const SOURCE_ARTIFACT_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'SOURCE_ARTIFACT_' + key])),
)

const LIBRARY_KEYS = Object.freeze(new Set(['schemaVersion', 'artifacts']))
const ARTIFACT_KEYS = Object.freeze(
  new Set([
    'artifactRef',
    'revision',
    'scopeId',
    'kind',
    'rightsState',
    'availability',
    'expiresAt',
    'text',
    'audio',
  ]),
)
const AUDIO_KEYS = Object.freeze(new Set(['durationMs', 'byteLength', 'sampleRate', 'channels']))
const RESOLVER_KEYS = Object.freeze(
  new Set(['schemaVersion', 'voiceBinding', 'artifactLibrary', 'sourceRevision']),
)

const ARTIFACT_REF_PATTERN = /^artifact:fixture-[A-Za-z0-9_-]{1,48}$/
const SCOPE_PATTERN = /^scope:fixture-[A-Za-z0-9_-]{1,32}$/
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const MAX_ARTIFACTS = 32
const MAX_REVISION = 2147483647
const MAX_TEXT = 8192

const KINDS = Object.freeze(new Set(['TEXT', 'AUDIO']))
const RIGHTS_STATES = Object.freeze(new Set(['CONFIRMED_FIXTURE', 'UNVERIFIED', 'REVOKED']))
const AVAILABILITY_STATES = Object.freeze(new Set(['PRESENT', 'ABSENT', 'UNKNOWN']))

const RIGHTS_CONFIRMED = 'CONFIRMED_FIXTURE'
const TEXT = 'TEXT'
const AUDIO = 'AUDIO'
const FEATURE_TTS = 'voice-bubbles'
const FEATURE_SVC = 'singing'

const LINKED_MESSAGE = '演示源内容与任务请求已核对；尚未生成音频，不能据此试听、保存或发送。'
const UNAVAILABLE_MESSAGE = '没有可用的演示任务源，请重新选择或稍后再说。'
const REVISION_MESSAGE = '演示任务源版本已变化，请刷新后重新选择。'
const RIGHTS_MESSAGE = '演示任务源使用权尚未确认或已撤销，请确认后再继续。'
const UNKNOWN_MESSAGE = '演示任务源状态未知，请重新检查，系统不会自动获取。'
const EXPIRED_MESSAGE = '演示任务源已过期，请重新选择。'
const MISMATCH_MESSAGE = '演示任务源与请求不一致，请重新选择；系统不会自动替换。'

const BUSINESS_MESSAGES = Object.freeze({
  SOURCE_UNAVAILABLE: UNAVAILABLE_MESSAGE,
  SOURCE_MISSING: UNAVAILABLE_MESSAGE,
  SOURCE_REVISION_MISMATCH: REVISION_MESSAGE,
  SOURCE_RIGHTS_UNCONFIRMED: RIGHTS_MESSAGE,
  SOURCE_UNKNOWN: UNKNOWN_MESSAGE,
  SOURCE_EXPIRED: EXPIRED_MESSAGE,
  SOURCE_KIND_MISMATCH: MISMATCH_MESSAGE,
  SOURCE_TEXT_MISMATCH: MISMATCH_MESSAGE,
  SOURCE_AUDIO_MISMATCH: MISMATCH_MESSAGE,
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
    errors: [issue(SOURCE_ARTIFACT_ERRORS[key], path, errorReason(key))],
  })
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
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

function validAudio(value) {
  if (!isPlainObject(value)) return false
  if (keySurface(value, AUDIO_KEYS) !== 'ok') return false
  const { durationMs, byteLength, sampleRate, channels } = value
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > RVC_FAKE_LIMITS.maxDurationMs) {
    return false
  }
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > RVC_FAKE_LIMITS.maxByteLength) {
    return false
  }
  if (!RVC_FAKE_LIMITS.inputSampleRates.includes(sampleRate)) return false
  if (channels !== RVC_FAKE_LIMITS.inputChannels) return false
  return true
}

function parseArtifact(raw, index) {
  if (!isPlainObject(raw)) return fail('INVALID_LIBRARY', 'artifactLibrary')
  if (keySurface(raw, ARTIFACT_KEYS) !== 'ok') return fail('INVALID_LIBRARY', 'artifactLibrary')

  const artifactRef = raw.artifactRef
  if (typeof artifactRef !== 'string' || !ARTIFACT_REF_PATTERN.test(artifactRef)) {
    return fail('INVALID_LIBRARY', 'artifactLibrary')
  }
  if (index.has(artifactRef)) return fail('DUPLICATE_ARTIFACT', 'artifactLibrary')

  const revision = raw.revision
  if (!isRevision(revision)) return fail('INVALID_LIBRARY', 'artifactLibrary')

  const scopeId = raw.scopeId
  if (typeof scopeId !== 'string' || !SCOPE_PATTERN.test(scopeId)) {
    return fail('INVALID_LIBRARY', 'artifactLibrary')
  }

  const kind = raw.kind
  if (typeof kind !== 'string' || !KINDS.has(kind)) return fail('INVALID_LIBRARY', 'artifactLibrary')

  const rightsState = raw.rightsState
  if (typeof rightsState !== 'string' || !RIGHTS_STATES.has(rightsState)) {
    return fail('INVALID_LIBRARY', 'artifactLibrary')
  }

  const availability = raw.availability
  if (typeof availability !== 'string' || !AVAILABILITY_STATES.has(availability)) {
    return fail('INVALID_LIBRARY', 'artifactLibrary')
  }

  const expiresAt = raw.expiresAt
  if (expiresAt !== null && canonicalUtc(expiresAt) === null) {
    return fail('INVALID_LIBRARY', 'artifactLibrary')
  }

  const text = raw.text
  const audio = raw.audio
  if (kind === TEXT) {
    if (typeof text !== 'string' || text.length < 1 || text.length > MAX_TEXT) {
      return fail('INVALID_LIBRARY', 'artifactLibrary')
    }
    if (audio !== null) return fail('INVALID_LIBRARY', 'artifactLibrary')
  } else {
    if (text !== null) return fail('INVALID_LIBRARY', 'artifactLibrary')
    if (!validAudio(audio)) return fail('INVALID_LIBRARY', 'artifactLibrary')
  }

  const artifact = {
    artifactRef,
    revision,
    scopeId,
    kind,
    rightsState,
    availability,
    expiresAt,
    text: kind === TEXT ? text : null,
    audio:
      kind === AUDIO
        ? {
            durationMs: audio.durationMs,
            byteLength: audio.byteLength,
            sampleRate: audio.sampleRate,
            channels: audio.channels,
          }
        : null,
  }
  index.set(artifactRef, artifact)
  return { ok: true, value: artifact }
}

/**
 * Validate one FixtureSourceLibrary v1. `nested` selects the resolver's nested surface: a malformed
 * nested library is INVALID_LIBRARY/artifactLibrary, while the public root maps its own shape errors
 * to INVALID_INPUT and its own schema errors to UNSUPPORTED_VERSION/schemaVersion.
 */
function parseLibrary(library, nested) {
  const shapeKey = nested ? 'INVALID_LIBRARY' : 'INVALID_INPUT'
  const shapePath = nested ? 'artifactLibrary' : '$'

  if (!isPlainObject(library)) return fail(shapeKey, shapePath)

  const surface = keySurface(library, LIBRARY_KEYS)
  if (surface === 'unknown') {
    return fail(nested ? 'INVALID_LIBRARY' : 'INVALID_INPUT', nested ? 'artifactLibrary' : '<unknown-key>')
  }
  if (surface !== 'ok') return fail(shapeKey, shapePath)

  if (library.schemaVersion !== SOURCE_ARTIFACTS_SCHEMA_VERSION) {
    return fail('UNSUPPORTED_VERSION', nested ? 'artifactLibrary' : 'schemaVersion')
  }

  const rawArtifacts = library.artifacts
  if (!Array.isArray(rawArtifacts)) return fail('INVALID_LIBRARY', 'artifactLibrary')
  if (rawArtifacts.length > MAX_ARTIFACTS) return fail('RESOURCE_LIMIT', '$')

  const index = new Map()
  const artifacts = []
  for (const rawArtifact of rawArtifacts) {
    const artifact = parseArtifact(rawArtifact, index)
    if (!artifact.ok) return artifact
    artifacts.push(artifact.value)
  }

  return { ok: true, value: { artifacts, index } }
}

function validateFixtureSourceLibraryInternal(input) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) return fail(copied.key, '$')

  const parsed = parseLibrary(copied.value, false)
  if (!parsed.ok) return parsed

  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: SOURCE_ARTIFACTS_SCHEMA_VERSION,
      artifactCount: parsed.value.artifacts.length,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

/**
 * Validate one FixtureSourceLibrary v1.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function validateFixtureSourceLibrary(input) {
  try {
    return validateFixtureSourceLibraryInternal(input)
  } catch {
    return fail('INVALID_INPUT', '$')
  }
}

function validVoiceBindingValue(value) {
  if (!isPlainObject(value)) return false
  if (value.schemaVersion !== 1) return false
  if (value.decision !== 'FIXTURE_BOUND' && value.decision !== 'BLOCKED') return false
  if (value.reason !== null && typeof value.reason !== 'string') return false
  if (typeof value.messageZh !== 'string') return false
  if (value.mockOnly !== true) return false
  if (value.realOperationAllowed !== false) return false
  if (value.submitAllowed !== false) return false
  if (value.automaticRetryAllowed !== false) return false
  if (typeof value.taskId !== 'string') return false
  if (typeof value.feature !== 'string') return false
  if (typeof value.voiceProfileId !== 'string') return false
  if (value.decision === 'FIXTURE_BOUND') {
    if (value.reason !== null) return false
    if (!isPlainObject(value.binding)) return false
  } else if (value.binding !== null) {
    return false
  }
  return true
}

function buildEnvelope(voiceBinding, decision, reasonKey, messageZh, source) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: SOURCE_ARTIFACTS_SCHEMA_VERSION,
      decision,
      reason: reasonKey === null ? null : SOURCE_ARTIFACT_ERRORS[reasonKey],
      messageZh,
      voiceBinding,
      source,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

function blocked(voiceBinding, reasonKey) {
  return buildEnvelope(voiceBinding, 'BLOCKED', reasonKey, BUSINESS_MESSAGES[reasonKey], null)
}

function resolveFixtureTaskSourceInternal(input) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) return fail(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) return fail('INVALID_INPUT', '$')

  const surface = keySurface(payload, RESOLVER_KEYS)
  if (surface === 'unknown') return fail('INVALID_INPUT', '<unknown-key>')
  if (surface !== 'ok') return fail('INVALID_INPUT', '$')
  if (payload.schemaVersion !== SOURCE_ARTIFACTS_SCHEMA_VERSION) {
    return fail('UNSUPPORTED_VERSION', 'schemaVersion')
  }
  if (!isRevision(payload.sourceRevision)) return fail('INVALID_SOURCE_REVISION', 'sourceRevision')

  const parsed = parseLibrary(payload.artifactLibrary, true)
  if (!parsed.ok) return parsed

  let voiceResult
  try {
    voiceResult = resolveFixtureVoiceBinding(payload.voiceBinding)
  } catch {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (!voiceResult || typeof voiceResult !== 'object' || typeof voiceResult.ok !== 'boolean') {
    return fail('DEPENDENCY_FAILURE', '$')
  }
  if (voiceResult.ok === false) return fail('VOICE_BINDING_INVALID', 'voiceBinding')
  if (!validVoiceBindingValue(voiceResult.value)) return fail('DEPENDENCY_FAILURE', '$')

  const voiceBinding = voiceResult.value
  if (voiceBinding.decision === 'BLOCKED') {
    return buildEnvelope(voiceBinding, 'BLOCKED', 'VOICE_BINDING_BLOCKED', voiceBinding.messageZh, null)
  }

  const sourceRef = payload.voiceBinding.taskDraft.source.ref
  const scopeId = payload.voiceBinding.expectation.scopeId
  const now = payload.voiceBinding.now
  const artifact = parsed.value.index.get(sourceRef)
  if (!artifact || artifact.scopeId !== scopeId) return blocked(voiceBinding, 'SOURCE_UNAVAILABLE')

  if (artifact.revision !== payload.sourceRevision) {
    return blocked(voiceBinding, 'SOURCE_REVISION_MISMATCH')
  }
  if (artifact.rightsState !== RIGHTS_CONFIRMED) {
    return blocked(voiceBinding, 'SOURCE_RIGHTS_UNCONFIRMED')
  }
  if (artifact.availability === 'ABSENT') return blocked(voiceBinding, 'SOURCE_MISSING')
  if (artifact.availability === 'UNKNOWN') return blocked(voiceBinding, 'SOURCE_UNKNOWN')
  if (artifact.expiresAt !== null && Date.parse(artifact.expiresAt) <= Date.parse(now)) {
    return blocked(voiceBinding, 'SOURCE_EXPIRED')
  }

  const expectedKind = voiceBinding.feature === FEATURE_TTS ? TEXT : voiceBinding.feature === FEATURE_SVC ? AUDIO : null
  if (expectedKind === null || artifact.kind !== expectedKind) {
    return blocked(voiceBinding, 'SOURCE_KIND_MISMATCH')
  }

  const request = payload.voiceBinding.negotiation.request
  if (expectedKind === TEXT) {
    if (!isPlainObject(request) || typeof request.text !== 'string' || artifact.text !== request.text) {
      return blocked(voiceBinding, 'SOURCE_TEXT_MISMATCH')
    }
  } else {
    const inputAudio = isPlainObject(request) ? request.inputAudio : null
    if (
      !isPlainObject(inputAudio) ||
      artifact.audio.durationMs !== inputAudio.durationMs ||
      artifact.audio.byteLength !== inputAudio.byteLength ||
      artifact.audio.sampleRate !== inputAudio.sampleRate ||
      artifact.audio.channels !== inputAudio.channels
    ) {
      return blocked(voiceBinding, 'SOURCE_AUDIO_MISMATCH')
    }
  }

  return buildEnvelope(
    voiceBinding,
    'FIXTURE_SOURCE_LINKED',
    null,
    LINKED_MESSAGE,
    { kind: artifact.kind, revision: artifact.revision },
  )
}

/**
 * Resolve one Fixture task source and its request association.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function resolveFixtureTaskSource(input) {
  try {
    return resolveFixtureTaskSourceInternal(input)
  } catch {
    return fail('INVALID_INPUT', '$')
  }
}
