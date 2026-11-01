/**
 * Cover dependency gate — connects an execution to the existing voice-asset, provider-instance and
 * provider-readiness facts instead of evaluating readiness in isolation.
 *
 * The caller supplies the same real Fixture `voiceBinding` (library + taskDraft + negotiation +
 * expectation) and provider readiness instances that the legacy engine uses. A binding that cannot be
 * resolved to FIXTURE_BOUND, or whose profile/asset/instance/candidate/modelRef does not match the
 * Intent exactly, fails closed before any claim.
 */
import { negotiateReadyFixtureProvider } from './provider-readiness.mjs'
import { resolveFixtureVoiceBinding } from './voice-assets.mjs'

export const COVER_DEPENDENCY_SCHEMA_VERSION = 1

export const COVER_DEPENDENCY_CODES = Object.freeze({
  VOICE_BINDING_NOT_READY: 'COVER_DEPENDENCY_VOICE_BINDING_NOT_READY',
  VOICE_BINDING_MISMATCH: 'COVER_DEPENDENCY_VOICE_BINDING_MISMATCH',
  PROVIDER_NOT_READY: 'COVER_DEPENDENCY_PROVIDER_NOT_READY',
  PROVIDER_MISMATCH: 'COVER_DEPENDENCY_PROVIDER_MISMATCH',
  MODEL_NOT_READY: 'COVER_DEPENDENCY_MODEL_NOT_READY',
  EVIDENCE_INVALID: 'COVER_DEPENDENCY_EVIDENCE_INVALID',
  CLOUD_INVALID: 'COVER_DEPENDENCY_CLOUD_INVALID',
})

function isoOrNull(value) {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) return null
  return value
}

function failure(key, errorPath) {
  return Object.freeze({
    ok: false,
    errors: Object.freeze([Object.freeze({ code: COVER_DEPENDENCY_CODES[key], path: errorPath || '$', reason: key.toLowerCase().replace(/_/g, ' ') })]),
  })
}

/**
 * @param {{intent:object, dependencies:object, now:string}} input
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<object>}}
 */
export function verifyCoverDependencies({ intent, dependencies, now }) {
  if (!dependencies || typeof dependencies !== 'object') return failure('VOICE_BINDING_NOT_READY', 'dependencies')
  const voice = dependencies.voiceBinding
  if (!voice || typeof voice !== 'object') return failure('VOICE_BINDING_NOT_READY', 'voiceBinding')
  const resolved = resolveFixtureVoiceBinding({
    schemaVersion: 1,
    library: voice.library,
    taskDraft: voice.taskDraft,
    negotiation: voice.negotiation,
    expectation: voice.expectation,
    now,
  })
  if (!resolved || resolved.ok !== true || !resolved.value || resolved.value.decision !== 'FIXTURE_BOUND') {
    return failure('VOICE_BINDING_NOT_READY', 'voiceBinding')
  }
  const binding = resolved.value.binding
  if (!binding || typeof binding !== 'object') return failure('VOICE_BINDING_NOT_READY', 'voiceBinding')
  if (
    resolved.value.voiceProfileId !== intent.voiceProfileId ||
    binding.profileRevision !== intent.profileRevision ||
    binding.assetId !== intent.modelAssetId ||
    binding.assetRevision !== intent.modelRevision ||
    binding.instanceId !== intent.instanceId ||
    binding.candidateId !== intent.candidateId ||
    binding.providerRef !== intent.modelRef ||
    binding.kind !== 'RVC_MODEL'
  ) {
    return failure('VOICE_BINDING_MISMATCH', 'voiceBinding')
  }

  const provider = dependencies.provider
  if (!provider || typeof provider !== 'object') return failure('PROVIDER_NOT_READY', 'provider')
  const gate = negotiateReadyFixtureProvider({
    schemaVersion: 1,
    negotiation: provider.negotiation,
    readiness: provider.readiness,
  })
  if (!gate || gate.ok !== true || !gate.value || gate.value.decision !== 'FIXTURE_READY') {
    return failure('PROVIDER_NOT_READY', 'provider')
  }
  if (gate.value.instanceId !== intent.instanceId || gate.value.candidateId !== intent.candidateId) {
    return failure('PROVIDER_MISMATCH', 'provider')
  }

  const model = dependencies.model
  if (!model || model.present !== true || model.revision !== intent.modelRevision || model.requiredRevision !== intent.modelRevision) {
    return failure('MODEL_NOT_READY', 'model')
  }
  const evidence = dependencies.evidence
  const observedAt = evidence ? isoOrNull(evidence.observedAt) : null
  const expiresAt = evidence ? isoOrNull(evidence.expiresAt) : null
  if (
    !evidence ||
    observedAt === null ||
    expiresAt === null ||
    evidence.realReady !== false ||
    Date.parse(observedAt) > Date.parse(now) ||
    Date.parse(expiresAt) <= Date.parse(now)
  ) {
    return failure('EVIDENCE_INVALID', 'evidence')
  }
  const confirmation = dependencies.confirmation === undefined ? { firstVisit: false, confirmed: false } : dependencies.confirmation
  if (!confirmation || typeof confirmation.firstVisit !== 'boolean' || typeof confirmation.confirmed !== 'boolean') {
    return failure('EVIDENCE_INVALID', 'confirmation')
  }
  const cloud = dependencies.cloud === undefined ? { authorized: false, providerReady: false } : dependencies.cloud
  if (!cloud || typeof cloud.authorized !== 'boolean' || typeof cloud.providerReady !== 'boolean') {
    return failure('CLOUD_INVALID', 'cloud')
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: COVER_DEPENDENCY_SCHEMA_VERSION,
      voice: 'FIXTURE_BOUND',
      provider: 'FIXTURE_READY',
      realReady: false,
      instanceId: gate.value.instanceId,
      candidateId: gate.value.candidateId,
      model: Object.freeze({ present: true, revision: model.revision, requiredRevision: model.requiredRevision }),
      evidence: Object.freeze({ observedAt, expiresAt, realReady: false }),
      confirmation: Object.freeze({ firstVisit: confirmation.firstVisit, confirmed: confirmation.confirmed }),
      cloud: Object.freeze({ authorized: cloud.authorized, providerReady: cloud.providerReady }),
    }),
  })
}
