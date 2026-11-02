/* Plan 09 UX model + real Coordinator adapter contract (Fake sources, isolated sandbox). */

import test from 'node:test'
import assert from 'node:assert/strict'
import fsPromises from 'node:fs/promises'
import { after } from 'node:test'

import {
  PLAN09_MANIFEST_REVISION,
  plan09DefaultSingingDraft,
  plan09DefaultVoiceDraft,
  plan09DependencyGroups,
  plan09DependencySummary,
  plan09DeriveWizardView,
  plan09DraftToChanges,
  plan09InstallFailureReason,
  plan09ProjectCoordinatorResult,
  plan09ReadWizard,
  plan09SwitchEngine,
  plan09SwitchMode,
  plan09ValidateSingingDraft,
  plan09ValidateVoiceDraft,
  plan09WizardKey,
  plan09WriteWizard,
} from '../core/plan09-ux-internal.mjs'
import { COORDINATION_STATES, createConfigCoordinator } from '../core/config-coordinator.mjs'
import { createConfigSandbox } from '../core/config-sandbox.mjs'
import { createFixtureSource } from './helpers/config-coordination-fixture.mjs'

const sandboxes = []
after(async () => {
  for (const sandbox of sandboxes) await fsPromises.rm(sandbox.root, { recursive: true, force: true })
})

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  }
}

test('wizard persists the chosen mode, browse dismissal and capability revision per feature/profile', () => {
  const storage = memoryStorage()
  const voiceKey = plan09WizardKey({ workspace: 'ws', profile: 'p1', feature: 'voice-bubbles', manifestRevision: 2 })
  const singingKey = plan09WizardKey({ workspace: 'ws', profile: 'p1', feature: 'singing', manifestRevision: 2 })
  const otherProfile = plan09WizardKey({ workspace: 'ws', profile: 'p2', feature: 'voice-bubbles', manifestRevision: 2 })
  assert.notEqual(voiceKey, singingKey)
  assert.notEqual(voiceKey, otherProfile)

  plan09WriteWizard(storage, voiceKey, { mode: 'cpu', introAcknowledged: true, capabilityRevisionSeen: 3 })
  const voice = plan09ReadWizard(storage, voiceKey)
  assert.equal(voice.selectedMode, 'cpu')
  assert.equal(voice.mode, 'cpu')
  assert.equal(voice.introAcknowledged, true)
  assert.equal(voice.capabilityRevisionSeen, 3)
  assert.equal(plan09ReadWizard(storage, singingKey).introAcknowledged, false)

  const acknowledged = plan09DeriveWizardView({ stored: voice, capabilityRevision: 3 })
  assert.equal(acknowledged.shouldOpen, false)
  assert.equal(plan09DeriveWizardView({ stored: voice, capabilityRevision: 4 }).reason, 'CAPABILITY_CHANGED')
  assert.equal(plan09DeriveWizardView({ stored: voice, globalSetupOpen: true }).deferred, true)

  const browseKey = plan09WizardKey({ workspace: 'ws', profile: 'p1', feature: 'singing', manifestRevision: 2 })
  plan09WriteWizard(storage, browseKey, { browseDismissedRevision: 2, mode: 'local', capabilityRevisionSeen: 3 })
  assert.equal(plan09DeriveWizardView({ stored: plan09ReadWizard(storage, browseKey) }).shouldOpen, false)
  assert.equal(plan09DeriveWizardView({ stored: plan09ReadWizard(storage, browseKey), force: true }).shouldOpen, true)
  assert.equal(plan09DeriveWizardView({ stored: plan09ReadWizard(storage, browseKey), capabilityRevision: 5 }).reason, 'CAPABILITY_CHANGED')
})

test('dependency groups follow feature, mode, source layout and delivery instead of forcing local models', () => {
  const localMixed = plan09DependencyGroups('singing', 'local', { sourceLayout: 'MIXED' })
  assert.deepEqual(localMixed.required.map((item) => item.key), ['core', 'rvc', 'separation'])
  assert.deepEqual(localMixed.conditional.map((item) => item.key), ['gpu'])
  const localClean = plan09DependencyGroups('singing', 'local', { sourceLayout: 'CLEAN_VOCAL' })
  assert.equal(localClean.required.some((item) => item.key === 'separation'), false)
  const cloud = plan09DependencyGroups('singing', 'cloud', { sourceLayout: 'MIXED' })
  assert.equal(cloud.required.some((item) => item.key === 'separation'), false)
  assert.equal(cloud.conditional.some((item) => item.key === 'cloud'), true)
  assert.equal(cloud.conditional.some((item) => item.key === 'gpu'), false)
  const existing = plan09DependencyGroups('singing', 'existing', { sourceLayout: 'MIXED' })
  assert.equal(existing.conditional.some((item) => item.key === 'gateway'), true)
  const voice = plan09DependencyGroups('voice-bubbles', 'local', { deliveryRequested: true })
  assert.deepEqual(voice.required.map((item) => item.key), ['core', 'tts'])
  assert.deepEqual(voice.deliveryOnly.map((item) => item.key), ['sender', 'wechat'])
  assert.equal(voice.deliveryOnly[0].label.includes('鲸递'), true)
  assert.equal(plan09DependencySummary(voice).required, 2)
  assert.equal(PLAN09_MANIFEST_REVISION, 2)
})

test('voice drafts use the shared provider/voice catalog, clear incompatible fields and reject NaN', () => {
  const base = plan09DefaultVoiceDraft()
  assert.equal(plan09ValidateVoiceDraft(base).ok, true)
  assert.equal(plan09ValidateVoiceDraft({ ...base, voiceProfile: 'other' }).ok, false)
  assert.equal(plan09ValidateVoiceDraft({ ...base, model: 'other' }).ok, false)
  assert.equal(plan09ValidateVoiceDraft({ ...base, speed: Number.NaN }).ok, false)
  assert.equal(plan09ValidateVoiceDraft({ ...base, volume: Number.POSITIVE_INFINITY }).ok, false)
  assert.equal(plan09ValidateVoiceDraft({ ...base, text: '  ' }).ok, false)
  const cloud = plan09SwitchEngine('voice-bubbles', base, 'cloud')
  assert.deepEqual(cloud.cleared.sort(), ['emotion', 'language', 'model', 'provider', 'voiceProfile'])
  assert.equal(cloud.draft.voiceProfile, 'cloud-voice-a')
  assert.equal(plan09ValidateVoiceDraft(cloud.draft, { cloudAuthorized: false }).ok, false)
  assert.equal(plan09ValidateVoiceDraft(cloud.draft, { cloudAuthorized: true }).ok, true)
  const custom = plan09SwitchEngine('voice-bubbles', base, 'custom')
  assert.equal(custom.draft.voiceProfile, 'custom-voice-a')
})

test('singing drafts validate trusted fictional source, consent, numeric ranges and mode/engine consistency', () => {
  const base = { ...plan09DefaultSingingDraft(), sourceAuthorized: true, voiceConsent: true, sourceRef: 'fixture://demo-song-01' }
  assert.equal(plan09ValidateSingingDraft(base).ok, true)
  assert.equal(plan09ValidateSingingDraft({ ...base, sourceRef: '' }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, sourceRef: 'C:\\real.mp3' }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, voiceProfile: 'other' }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, pitch: 13 }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, vocalGainDb: Number.NaN }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, sourceLayout: 'OTHER' }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, deliveryRequested: true }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, deliveryRequested: true }, { deliveryAuthorized: true }).ok, true)
  assert.equal(plan09ValidateSingingDraft({ ...base, engine: 'svc' }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, engine: 'rvc' }, { mode: 'cloud' }).ok, false)
  const switched = plan09SwitchMode('singing', 'cloud', base)
  assert.equal(switched.draft.engine, 'gateway')
  assert.deepEqual(switched.cleared.sort(), ['engine', 'voiceProfile'])
  assert.equal(plan09InstallFailureReason('NO_ADAPTER').includes('适配器'), true)
})

test('draft-to-change mapping uses only existing writable fields and reports draft-only fields', () => {
  const base = plan09DefaultVoiceDraft()
  const mapped = plan09DraftToChanges('voice-bubbles', base, { senderRevision: 7 })
  assert.equal(mapped.supported, true)
  assert.equal(mapped.changes.changes.senderService.expectedRevision, 7)
  assert.deepEqual(mapped.changes.changes.senderService.set, {
    tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'demo-voice-a' },
  })
  const changed = plan09DraftToChanges('voice-bubbles', { ...base, emotion: 'happy', speed: 1.2, volume: 40 }, { senderRevision: 7 })
  assert.deepEqual(changed.unsupported.sort(), ['情绪', '音量', '语速'].sort())
  assert.equal(changed.applied.includes('词色'), false)
  const singing = plan09DraftToChanges('singing', plan09DefaultSingingDraft(), { senderRevision: 7 })
  assert.equal(singing.supported, false)
  assert.equal(singing.changes, null)
  assert.match(singing.unsupported[0], /没有对应的 Coordinator 可写字段/)
  assert.equal(plan09ProjectCoordinatorResult({ state: 'APPLIED' }).label, '已生效')
  assert.equal(plan09ProjectCoordinatorResult({ state: 'UNKNOWN' }).canApply, false)
})

function bridgeDocument(overrides = {}) {
  return { schemaVersion: 1, enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0, defaultVoice: 'whale-v1', allowedTargets: ['fixture-private-target'], token: 'fixture-bridge-token', ...overrides }
}

function createSandbox() {
  const sandbox = createConfigSandbox()
  sandboxes.push(sandbox)
  return sandbox
}

function makeAdapter(coordinator, bridge) {
  return {
    getContext() {
      return { workspace: 'fixture-ws', profile: 'fixture-profile', manifestRevision: 2, capabilityRevision: 3, senderRevision: bridge.revision, cloudAuthorized: false, deliveryAuthorized: false }
    },
    checkDependency() { return { ready: true } },
    prepareChange: (draft) => coordinator.prepareChange(draft),
    execute: (planId, options) => coordinator.execute(planId, options),
    apply: (transactionId, options) => coordinator.apply(transactionId, options),
    recover: (transactionId) => coordinator.recover(transactionId),
  }
}

test('the injected adapter contract drives the real Coordinator from a mapped draft', async () => {
  const sandbox = createSandbox()
  const bridge = createFixtureSource('bridgeVoice', { document: bridgeDocument() })
  const sender = createFixtureSource('senderService', {
    document: { schemaVersion: 1, tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' }, automation: 'manual', allowedChats: ['fixture-private-target'], token: 'fixture-sender-token' },
  })
  const core = createFixtureSource('core', { document: { schemaVersion: 1, qwenUrl: 'http://127.0.0.1:8765', roots: { wechatAgent: 'fixture-root', sender: 'fixture-root' }, token: 'fixture-core-token' } })
  const worker = createFixtureSource('workerSafety', { document: { schemaVersion: 1, voice_enabled: true, voice_auto_mode: 'manual', token: 'fixture-worker-token' } })
  const permissions = createFixtureSource('wechatPermissions', { document: { schemaVersion: 1, wechat: { whitelist: ['fixture-private-target'], wake_mode: 'explicit' }, token: 'fixture-wechat-token' } })
  const coordinator = createConfigCoordinator({ sandbox, sources: { bridgeVoice: bridge, senderService: sender, core, workerSafety: worker, wechatPermissions: permissions } })
  const adapter = makeAdapter(coordinator, sender)
  const draft = { ...plan09DefaultVoiceDraft(), voiceProfile: 'demo-voice-b' }
  const mapped = plan09DraftToChanges('voice-bubbles', draft, { senderRevision: adapter.getContext().senderRevision })
  assert.equal(mapped.supported, true)

  const prepared = await adapter.prepareChange(mapped.changes)
  assert.equal(prepared.ok, true)
  assert.equal(prepared.plan.state, COORDINATION_STATES.PREPARED)
  assert.equal(prepared.plan.previewOnly, true)

  const wrong = await adapter.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: 'a'.repeat(32) })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.error.code, 'CONFIG_COORDINATION_CONFIRMATION_REQUIRED')
  assert.equal(sender.saveCount, 0)

  const executed = await adapter.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId })
  assert.equal(executed.ok, true)
  assert.equal(executed.state, COORDINATION_STATES.SAVED)
  assert.equal(executed.applyState, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(sender.saveCount, 1)
  assert.equal(sender.document.tts.voice, 'demo-voice-b')

  const applied = await adapter.apply(executed.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(applied.activeConfirmed, false)
  const recovered = await adapter.recover(executed.transactionId)
  assert.equal(recovered.state, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(recovered.replayed, false)

  const consumed = await adapter.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId })
  assert.equal(consumed.ok, false)
  assert.equal(consumed.error.code, 'CONFIG_COORDINATION_PLAN_CONSUMED')
  assert.equal(sender.saveCount, 1)
})
