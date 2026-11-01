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
})

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
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: COVER_DEPENDENCY_SCHEMA_VERSION,
      voice: 'FIXTURE_BOUND',
      provider: 'FIXTURE_READY',
      realReady: false,
      instanceId: gate.value.instanceId,
      candidateId: gate.value.candidateId,
    }),
  })
}
