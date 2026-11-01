/* Test-only Cover dependency bundle: the real Fixture voice binding + provider readiness from the
 * documented example, adapted to the caller's scope/source/task and with valid model/evidence/
 * cloud facts. Tests that exercise the dependency gate override individual fields explicitly.
 */
import fs from 'node:fs'

export function exampleVoiceBinding() {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf('## 7.')
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function coverDependencies({ scopeId, sourceRef, taskId, now, expiresAt, intent, overrides = {} }) {
  const base = exampleVoiceBinding()
  const binding = clone(base.sourceInput.voiceBinding)
  const voiceProfileId = intent ? intent.voiceProfileId : 'voice:demo-hero'
  const assetId = intent ? intent.modelAssetId : 'asset:fixture-model-a'
  const modelRef = intent ? intent.modelRef : 'rvc-model:fixture-a'
  const candidateId = intent ? intent.candidateId : 'rvc'
  const instanceId = intent ? intent.instanceId : 'instance:rvc'
  const profileRevision = intent ? intent.profileRevision : 1
  const modelRevision = intent ? intent.modelRevision : 1
  for (const profile of binding.library.profiles) {
    profile.scopeId = scopeId
    profile.voiceProfileId = voiceProfileId
    profile.revision = profileRevision
    for (const item of profile.bindings) item.instanceId = instanceId
  }
  for (const asset of binding.library.assets) {
    asset.scopeId = scopeId
    asset.assetId = assetId
    asset.candidateId = candidateId
    asset.providerRef = modelRef
    asset.revision = modelRevision
  }
  binding.library.profiles[0].bindings[0].assetId = assetId
  binding.taskDraft = {
    schemaVersion: 1,
    taskId,
    feature: 'singing',
    taskType: 'SVC',
    source: { kind: 'AUDIO_REF', ref: sourceRef },
    voiceProfileId,
    deliveryRequested: false,
    rights: { state: 'CONFIRMED_FIXTURE' },
  }
  binding.negotiation.registry.instances[0].instanceId = instanceId
  binding.negotiation.registry.instances[0].candidateId = candidateId
  binding.negotiation.selection.instanceId = instanceId
  binding.negotiation.request.sourceAudioRef = sourceRef
  binding.negotiation.request.targetModelId = modelRef
  binding.expectation = { scopeId, profileRevision, assetRevision: modelRevision }
  const readiness = clone(base.readiness)
  readiness.instances[0].instanceId = instanceId
  const dependencies = {
    voiceBinding: {
      library: binding.library,
      taskDraft: binding.taskDraft,
      negotiation: binding.negotiation,
      expectation: binding.expectation,
    },
    provider: { negotiation: binding.negotiation, readiness },
    model: { present: true, revision: modelRevision, requiredRevision: modelRevision },
    evidence: { observedAt: now, expiresAt, realReady: false, source: 'FIXTURE_LIBRARY_PROOF' },
    confirmation: { firstVisit: false, confirmed: false },
    cloud: { authorized: false, providerReady: false },
  }
  for (const [key, value] of Object.entries(overrides)) dependencies[key] = value
  return dependencies
}
