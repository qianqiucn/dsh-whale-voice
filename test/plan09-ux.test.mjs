/* Plan 09 UX model + real Coordinator mapping (Fake sources, isolated sandbox).
 *
 * Verifies wizard persistence, dependency grouping, draft validation/cleanup, the explicitly fake
 * UI transaction, and that the real config Coordinator produces the states the UI projects.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fsPromises from 'node:fs/promises'
import { after } from 'node:test'

import {
  PLAN09_FEATURES,
  PLAN09_MANIFEST_REVISION,
  PLAN09_MODES,
  createPlan09DemoTransaction,
  plan09DefaultSingingDraft,
  plan09DefaultVoiceDraft,
  plan09DependencyGroups,
  plan09DependencySummary,
  plan09DeriveWizardView,
  plan09InstallFailureReason,
  plan09ReadWizard,
  plan09SwitchEngine,
  plan09TransactionView,
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
    dump: () => Object.fromEntries(map),
  }
}

test('wizard state is isolated by feature and manifest revision and never means READY', () => {
  const storage = memoryStorage()
  const voiceKey = plan09WizardKey({ workspace: 'ws', profile: 'p', feature: 'voice-bubbles', manifestRevision: 7 })
  const singingKey = plan09WizardKey({ workspace: 'ws', profile: 'p', feature: 'singing', manifestRevision: 7 })
  assert.notEqual(voiceKey, singingKey)
  assert.deepEqual(plan09ReadWizard(storage, voiceKey), { introAcknowledged: false, selectedMode: null, verifiedCapabilitiesRevision: null, updatedAt: null })

  plan09WriteWizard(storage, voiceKey, { introAcknowledged: true, selectedMode: 'local', verifiedCapabilitiesRevision: 3 })
  assert.equal(plan09ReadWizard(storage, voiceKey).introAcknowledged, true)
  assert.equal(plan09ReadWizard(storage, singingKey).introAcknowledged, false)

  const firstVoice = plan09DeriveWizardView({ stored: plan09ReadWizard(storage, voiceKey), capabilityRevision: 3 })
  assert.equal(firstVoice.shouldOpen, false)
  const changed = plan09DeriveWizardView({ stored: plan09ReadWizard(storage, voiceKey), capabilityRevision: 4 })
  assert.equal(changed.shouldOpen, true)
  assert.equal(changed.reason, 'CAPABILITY_CHANGED')
  const deferred = plan09DeriveWizardView({ stored: plan09ReadWizard(storage, singingKey), globalSetupOpen: true })
  assert.equal(deferred.shouldOpen, false)
  assert.equal(deferred.deferred, true)
  const firstSinging = plan09DeriveWizardView({ stored: plan09ReadWizard(storage, singingKey) })
  assert.equal(firstSinging.reason, 'FIRST_VISIT')
})

test('mode-based dependency groups distinguish required, conditional and delivery-only', () => {
  const local = plan09DependencyGroups('singing', 'local')
  assert.deepEqual(local.required.map((item) => item.key), ['core', 'tts', 'rvc', 'separation'])
  assert.deepEqual(local.conditional.map((item) => item.key), ['gpu'])
  assert.deepEqual(local.deliveryOnly.map((item) => item.key), ['sender', 'wechat'])
  const cloud = plan09DependencyGroups('voice-bubbles', 'cloud')
  assert.deepEqual(cloud.conditional.map((item) => item.key), ['network'])
  assert.equal(plan09DependencySummary(local).required, 4)
  assert.equal(PLAN09_MODES.length, 4)
  assert.equal(PLAN09_FEATURES.length, 2)
})

test('voice drafts enforce ranges, cloud authorization and engine cleanup', () => {
  const base = plan09DefaultVoiceDraft()
  assert.equal(plan09ValidateVoiceDraft(base).ok, true)
  assert.equal(plan09ValidateVoiceDraft(base, { cloudAuthorized: false }).ok, true)
  const cloud = plan09SwitchEngine('voice-bubbles', base, 'cloud')
  assert.deepEqual(cloud.cleared.sort(), ['model', 'provider'])
  assert.equal(cloud.draft.provider, 'fixture-cloud')
  assert.equal(plan09ValidateVoiceDraft(cloud.draft, { cloudAuthorized: false }).ok, false)
  assert.equal(plan09ValidateVoiceDraft(cloud.draft, { cloudAuthorized: true }).ok, true)
  assert.equal(plan09ValidateVoiceDraft({ ...base, speed: 3 }).ok, false)
  assert.equal(plan09ValidateVoiceDraft({ ...base, volume: 101 }).ok, false)
  assert.equal(plan09ValidateVoiceDraft({ ...base, text: '   ' }).ok, false)
  const custom = plan09SwitchEngine('voice-bubbles', base, 'custom')
  assert.equal(custom.draft.provider, 'custom-local')
})

test('singing drafts require rights, consent, pitch range and reject SVC as unavailable', () => {
  const base = { ...plan09DefaultSingingDraft(), sourceAuthorized: true, voiceConsent: true }
  assert.equal(plan09ValidateSingingDraft(base).ok, true)
  assert.equal(plan09ValidateSingingDraft({ ...base, sourceAuthorized: false }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, voiceConsent: false }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, pitch: 13 }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, pitch: -12 }).ok, true)
  assert.equal(plan09ValidateSingingDraft({ ...base, engine: 'svc' }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, deliveryRequested: true }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, deliveryRequested: true }, { deliveryAuthorized: true }).ok, true)
  assert.equal(plan09ValidateSingingDraft({ ...base }, { gpuAvailable: false }).ok, false)
  assert.equal(plan09InstallFailureReason('NO_GPU').includes('GPU'), true)
  assert.equal(plan09InstallFailureReason('OFFLINE').includes('网络'), true)
})

test('demo transaction is one-shot, revision-aware and never turns UNKNOWN into APPLIED', () => {
  let clock = 1_000
  const tx = createPlan09DemoTransaction({ baseRevision: 4, planTtlMs: 100, now: () => clock })
  assert.equal(tx.view().phase, 'DIRTY')
  tx.prepare()
  assert.equal(tx.view().phase, 'PREPARED')
  const planId = tx.view().planId
  assert.equal(tx.validate({ confirmedPlanId: 'wrong' }).ok, false)
  assert.equal(tx.view().phase, 'CONFLICT')

  const ok = createPlan09DemoTransaction({ baseRevision: 4, planTtlMs: 100, now: () => clock })
  ok.prepare()
  assert.equal(ok.validate({ confirmedPlanId: ok.view().planId }).ok, true)
  assert.equal(ok.save({ currentRevision: 4 }).ok, true)
  assert.equal(ok.view().phase, 'SAVED')
  assert.equal(ok.view().revision, 5)
  assert.equal(ok.view().pendingApply, true)
  assert.equal(ok.save({ currentRevision: 5 }).ok, false)
  assert.equal(ok.apply({ runtimeRevision: 4 }).ok, false)
  assert.equal(ok.view().phase, 'UNKNOWN')
  const view = plan09TransactionView(ok.view())
  assert.equal(view.phase, 'UNKNOWN')
  assert.equal(view.canSave, false)

  const conflict = createPlan09DemoTransaction({ baseRevision: 4, now: () => clock })
  conflict.prepare()
  conflict.validate({ confirmedPlanId: conflict.view().planId })
  assert.equal(conflict.save({ currentRevision: 99 }).ok, false)
  assert.equal(conflict.view().phase, 'CONFLICT')

  const expired = createPlan09DemoTransaction({ baseRevision: 4, planTtlMs: 10, now: () => clock })
  expired.prepare()
  clock += 20
  assert.equal(expired.validate({ confirmedPlanId: expired.view().planId }).ok, false)
  assert.equal(expired.view().lastError, 'PLAN_EXPIRED')
})

function bridgeDocument(overrides = {}) {
  return { schemaVersion: 1, enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0, defaultVoice: 'whale-v1', allowedTargets: ['fixture-private-target'], token: 'fixture-bridge-token', ...overrides }
}

function createSandbox() {
  const sandbox = createConfigSandbox()
  sandboxes.push(sandbox)
  return sandbox
}

test('the real Coordinator produces the states the UI transaction projects', async () => {
  const sandbox = createSandbox()
  const bridge = createFixtureSource('bridgeVoice', { document: bridgeDocument() })
  const sender = createFixtureSource('senderService', {
    document: { schemaVersion: 1, tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' }, automation: 'manual', allowedChats: ['fixture-private-target'], token: 'fixture-sender-token' },
  })
  const core = createFixtureSource('core', { document: { schemaVersion: 1, qwenUrl: 'http://127.0.0.1:8765', roots: { wechatAgent: 'fixture-root', sender: 'fixture-root' }, token: 'fixture-core-token' } })
  const worker = createFixtureSource('workerSafety', { document: { schemaVersion: 1, voice_enabled: true, voice_auto_mode: 'manual', token: 'fixture-worker-token' } })
  const permissions = createFixtureSource('wechatPermissions', { document: { schemaVersion: 1, wechat: { whitelist: ['fixture-private-target'], wake_mode: 'explicit' }, token: 'fixture-wechat-token' } })
  const coordinator = createConfigCoordinator({ sandbox, sources: { bridgeVoice: bridge, senderService: sender, core, workerSafety: worker, wechatPermissions: permissions } })

  const prepared = await coordinator.prepareChange({ schemaVersion: 1, changes: { bridgeVoice: { expectedRevision: bridge.revision, set: { enabled: true } } } })
  assert.equal(prepared.ok, true)
  assert.equal(prepared.plan.state, COORDINATION_STATES.PREPARED)
  assert.equal(prepared.plan.previewOnly, true)

  const wrong = await coordinator.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: 'a'.repeat(32) })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.error.code, 'CONFIG_COORDINATION_CONFIRMATION_REQUIRED')
  assert.equal(bridge.saveCount, 0)

  const executed = await coordinator.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId })
  assert.equal(executed.ok, true)
  assert.equal(executed.state, COORDINATION_STATES.SAVED)
  assert.equal(executed.applyState, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(bridge.saveCount, 1)

  const applied = await coordinator.apply(executed.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(applied.activeConfirmed, false)

  const second = await coordinator.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId })
  assert.equal(second.ok, false)
  assert.equal(second.error.code, 'CONFIG_COORDINATION_PLAN_CONSUMED')
  assert.equal(bridge.saveCount, 1)
})
