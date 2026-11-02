/* Plan 09 UX model + real Coordinator adapter contract (Fake sources, isolated sandbox). */

import test from 'node:test'
import assert from 'node:assert/strict'
import fsPromises from 'node:fs/promises'
import { after } from 'node:test'

import {
  PLAN09_MANIFEST_REVISION,
  plan09CanApply,
  plan09CanConfirm,
  plan09CanPrepare,
  plan09CanReadStatus,
  plan09CanReset,
  plan09ClassifyCoordinatorResult,
  plan09DefaultSingingDraft,
  plan09DefaultVoiceDraft,
  plan09DependencyGroups,
  plan09DependencyScope,
  plan09DependencySummary,
  plan09DeriveWizardView,
  plan09DraftToChanges,
  plan09EngineScope,
  plan09InstallFailureReason,
  plan09ProjectCoordinatorResult,
  plan09ReadWizard,
  plan09ReduceTransaction,
  plan09SwitchEngine,
  plan09SwitchMode,
  plan09TransactionInitial,
  plan09TransactionKey,
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
  const changedView = plan09DeriveWizardView({ stored: voice, capabilityRevision: 4 })
  assert.equal(changedView.reason, 'CAPABILITY_CHANGED')
  assert.equal(changedView.shouldOpen, false)
  assert.equal(changedView.reminder, true)
  assert.equal(plan09DeriveWizardView({ stored: voice, globalSetupOpen: true }).deferred, true)

  const browseKey = plan09WizardKey({ workspace: 'ws', profile: 'p1', feature: 'singing', manifestRevision: 2 })
  plan09WriteWizard(storage, browseKey, { browseDismissedRevision: 2, mode: 'local', capabilityRevisionSeen: 3 })
  assert.equal(plan09DeriveWizardView({ stored: plan09ReadWizard(storage, browseKey), manifestRevision: 2 }).shouldOpen, false)
  assert.equal(plan09DeriveWizardView({ stored: plan09ReadWizard(storage, browseKey), manifestRevision: 7 }).shouldOpen, true)
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
  assert.equal(cloud.required.some((item) => item.key === 'rvc'), false)
  assert.equal(cloud.conditional.some((item) => item.key === 'cloud'), true)
  assert.equal(cloud.conditional.some((item) => item.key === 'gpu'), false)
  const existing = plan09DependencyGroups('singing', 'existing', { sourceLayout: 'MIXED' })
  assert.equal(existing.conditional.some((item) => item.key === 'gateway'), true)
  assert.equal(existing.required.some((item) => item.key === 'rvc'), false)
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
  const modeExisting = plan09SwitchMode('voice-bubbles', 'existing', base)
  assert.equal(modeExisting.draft.engine, 'custom')
  assert.equal(plan09ValidateVoiceDraft(modeExisting.draft, { mode: 'existing' }).ok, true)
  assert.equal(plan09ValidateVoiceDraft({ ...base, engine: 'cloud' }, { mode: 'existing' }).ok, false)
  const modeCloud = plan09SwitchMode('voice-bubbles', 'cloud', base)
  assert.equal(modeCloud.draft.engine, 'cloud')
  assert.equal(modeCloud.draft.voiceProfile, 'cloud-voice-a')
  assert.equal(plan09ValidateVoiceDraft(modeCloud.draft, { cloudAuthorized: false, mode: 'cloud' }).ok, false)
  assert.equal(plan09ValidateVoiceDraft({ ...base, engine: 'cloud' }, { cloudAuthorized: true }).ok, false)
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
  assert.equal(plan09ValidateSingingDraft({ ...base, engine: 'gateway', voiceProfile: 'fixture-gateway' }, { mode: 'cloud', cloudAuthorized: false }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, engine: 'gateway', voiceProfile: 'fixture-gateway' }, { mode: 'cloud', cloudAuthorized: true }).ok, true)
  assert.equal(plan09ValidateSingingDraft({ ...base, engine: 'rvc' }, { mode: 'existing' }).ok, false)
  assert.equal(plan09ValidateSingingDraft({ ...base, engine: 'gateway', voiceProfile: 'fixture-gateway' }, { mode: 'existing' }).ok, true)
  assert.equal(plan09ValidateSingingDraft({ ...base, voiceProfile: 'fixture-gateway' }).ok, false)
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
  const cloudMapped = plan09DraftToChanges('voice-bubbles', plan09SwitchMode('voice-bubbles', 'cloud', base).draft, { senderRevision: 7 })
  assert.equal(cloudMapped.changes.changes.senderService.set.tts.provider, 'cloud')
  const existingMapped = plan09DraftToChanges('voice-bubbles', plan09SwitchMode('voice-bubbles', 'existing', base).draft, { senderRevision: 7 })
  assert.equal(existingMapped.changes.changes.senderService.set.tts.provider, 'custom')
  const singing = plan09DraftToChanges('singing', plan09DefaultSingingDraft(), { senderRevision: 7 })
  assert.equal(singing.supported, false)
  assert.equal(singing.changes, null)
  assert.match(singing.unsupported[0], /没有对应的 Coordinator 可写字段/)
  assert.equal(plan09ProjectCoordinatorResult({ state: 'APPLIED' }).label, '已生效')
  assert.equal(plan09ProjectCoordinatorResult({ state: 'UNKNOWN' }).canApply, false)
  const projected = plan09ProjectCoordinatorResult({ state: 'PARTIALLY_APPLIED', activeRevision: 'opaque-rev', steps: [{ source: 'senderService', status: 'SAVED', activeRevision: 'opaque-rev' }] })
  assert.equal(projected.phase, 'PARTIALLY_APPLIED')
  assert.equal(projected.activeRevision, 'opaque-rev')
  assert.equal(projected.steps[0].source, 'senderService')
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

function preparedEntry(overrides = {}) {
  const started = plan09ReduceTransaction(plan09TransactionInitial(), { type: 'PREPARE_START' })
  const prepared = plan09ReduceTransaction(started, {
    type: 'PREPARE_DONE',
    seq: started.inFlightSeq,
    result: { ok: true, plan: { planId: 'plan-a' } },
    frozenChanges: { schemaVersion: 1 },
    frozenSerial: 'serial-a',
    contextSerial: 'ctx-a',
  })
  return { ...prepared, ...overrides }
}

test('operation results without a trusted state stay UNKNOWN and cannot be reset or re-prepared', () => {
  const prepared = preparedEntry()
  assert.equal(prepared.phase, 'PREPARED')
  assert.equal(plan09CanConfirm(prepared, { currentSerial: 'serial-a', contextSerial: 'ctx-a' }), true)

  const emptyResults = [null, undefined, {}, { ok: true }, { ok: false }, { ok: false, error: { code: 'FIXTURE_FAILURE' } }]
  for (const result of emptyResults) {
    const started = plan09ReduceTransaction(prepared, { type: 'EXECUTE_START' })
    const done = plan09ReduceTransaction(started, { type: 'EXECUTE_DONE', seq: started.inFlightSeq, result })
    assert.equal(done.phase, 'UNKNOWN', String(JSON.stringify(result)))
    assert.equal(done.outcomeUnknown, true)
    assert.equal(done.txId, null)
    assert.equal(done.result, result === undefined ? null : result)
    assert.equal(plan09CanPrepare(done), false)
    assert.equal(plan09CanReset(done), false)
    assert.equal(plan09CanReadStatus(done), false)
    assert.equal(plan09CanApply(done), false)
    assert.equal(plan09TransactionView(done).phase, 'UNKNOWN')
  }
})

test('a trusted UNKNOWN keeps its transaction id, blocks reset and still allows a read-only check', () => {
  const saved = { ...preparedEntry(), phase: 'SAVED', txId: 'tx-1', frozenChanges: null }
  const started = plan09ReduceTransaction(saved, { type: 'APPLY_START' })
  const unknown = plan09ReduceTransaction(started, {
    type: 'APPLY_DONE',
    seq: started.inFlightSeq,
    result: { ok: true, state: 'UNKNOWN', transactionId: 'tx-1', error: { code: 'CONFIG_COORDINATION_REVISION_MISMATCH' } },
  })
  assert.equal(unknown.phase, 'UNKNOWN')
  assert.equal(unknown.txId, 'tx-1')
  assert.equal(unknown.outcomeUnknown, false)
  assert.equal(plan09CanReset(unknown), false)
  assert.equal(plan09CanApply(unknown), false)
  assert.equal(plan09CanPrepare(unknown), false)
  assert.equal(plan09CanReadStatus(unknown), true)

  const checking = plan09ReduceTransaction(unknown, { type: 'STATUS_START' })
  const applied = plan09ReduceTransaction(checking, {
    type: 'STATUS_DONE',
    seq: checking.inFlightSeq,
    result: { ok: true, state: 'APPLIED', transactionId: 'tx-1' },
  })
  assert.equal(applied.phase, 'APPLIED')
  assert.equal(plan09CanReset(applied), true)
  assert.equal(plan09CanReadStatus(applied), true)
})

test('classification never infers a save from ok and treats PREPARED as a no-write rejection', () => {
  assert.equal(plan09ClassifyCoordinatorResult({ ok: true }).phase, 'UNKNOWN')
  assert.equal(plan09ClassifyCoordinatorResult({ ok: true }).recognized, false)
  assert.equal(plan09ClassifyCoordinatorResult(null).phase, 'UNKNOWN')
  assert.equal(plan09ClassifyCoordinatorResult({ ok: true, state: 'SAVED', transactionId: 't1' }).phase, 'SAVED')
  assert.equal(plan09ClassifyCoordinatorResult({ ok: false, state: 'CONFLICT' }).phase, 'CONFLICT')
  assert.equal(plan09ClassifyCoordinatorResult({ ok: false, state: 'PREPARED', error: { code: 'CONFIG_COORDINATION_CONFIRMATION_REQUIRED' } }).phase, 'FAILED')
  assert.equal(plan09ProjectCoordinatorResult({ ok: true }).phase, 'UNKNOWN')
  assert.equal(plan09ProjectCoordinatorResult({ ok: true, state: 'PARTIALLY_APPLIED' }).phase, 'PARTIALLY_APPLIED')
})

test('late results only settle the operation they belong to', () => {
  const started = plan09ReduceTransaction(plan09TransactionInitial(), { type: 'PREPARE_START' })
  const seq = started.inFlightSeq
  const edited = plan09ReduceTransaction(started, { type: 'DRAFT_EDITED' })
  assert.equal(edited.busy, true, 'editing must not release the in-flight mutex')
  assert.equal(edited.draftVersion, 1)

  const foreign = plan09ReduceTransaction(edited, { type: 'PREPARE_DONE', seq: seq + 99, result: { ok: true, plan: { planId: 'late' } } })
  assert.equal(foreign.busy, true)
  assert.equal(foreign.plan, null)

  const stale = plan09ReduceTransaction(edited, {
    type: 'PREPARE_DONE',
    seq,
    stale: true,
    result: { ok: true, plan: { planId: 'stale' } },
    frozenSerial: 'serial-stale',
    contextSerial: 'ctx-a',
  })
  assert.equal(stale.phase, 'DIRTY')
  assert.equal(stale.error, 'STALE_PREPARE')
  assert.equal(stale.busy, false)
  assert.equal(stale.plan, null)
  assert.equal(plan09CanPrepare(stale), true)
})

test('editing during an in-flight execute keeps the mutex and the transaction result', () => {
  const started = plan09ReduceTransaction(preparedEntry(), { type: 'EXECUTE_START' })
  const edited = plan09ReduceTransaction(started, { type: 'DRAFT_EDITED' })
  assert.equal(edited.busy, true)
  assert.equal(edited.inFlight, 'execute')
  assert.equal(plan09CanPrepare(edited), false)
  assert.equal(plan09CanConfirm(edited, { currentSerial: 'serial-a', contextSerial: 'ctx-a' }), false)

  const saved = plan09ReduceTransaction(edited, {
    type: 'EXECUTE_DONE',
    seq: edited.inFlightSeq,
    result: { ok: true, state: 'SAVED', transactionId: 'tx-2' },
  })
  assert.equal(saved.phase, 'SAVED')
  assert.equal(saved.txId, 'tx-2')
  assert.equal(saved.busy, false)
  assert.equal(saved.draftDirty, true)
  assert.equal(saved.outcomeUnknown, false)
})

test('a determined APPLIED can start one new cycle while an unresolved UNKNOWN cannot', () => {
  const applied = { ...plan09TransactionInitial(), phase: 'APPLIED', txId: 'tx-9', result: { state: 'APPLIED', transactionId: 'tx-9' } }
  assert.equal(plan09CanReset(applied), true)

  const reset = plan09ReduceTransaction(applied, { type: 'RESET', at: '2026-11-02T18:00:00.000Z' })
  assert.equal(reset.phase, 'DIRTY')
  assert.equal(reset.txId, null)
  assert.equal(reset.history.length, 1)
  assert.equal(reset.history[0].txId, 'tx-9')
  assert.equal(plan09CanPrepare(reset), true)

  const edited = plan09ReduceTransaction(applied, { type: 'DRAFT_EDITED' })
  assert.equal(edited.phase, 'DIRTY')
  assert.equal(edited.history.length, 1)
  assert.equal(edited.history[0].phase, 'APPLIED')

  const unknown = { ...plan09TransactionInitial(), phase: 'UNKNOWN', txId: 'tx-10' }
  assert.equal(plan09CanReset(unknown), false)
  assert.equal(plan09ReduceTransaction(unknown, { type: 'RESET' }).txId, 'tx-10')
  assert.equal(plan09CanPrepare(unknown), false)
})

test('transaction identity ignores the manifest revision and keeps a source-wide pending latch', () => {
  const base = { workspace: 'ws', profile: 'p1', manifestRevision: 2, capabilityRevision: 3 }
  assert.equal(plan09TransactionKey(base, 'voice-bubbles'), plan09TransactionKey({ ...base, manifestRevision: 9, capabilityRevision: 4 }, 'voice-bubbles'))
  assert.notEqual(plan09TransactionKey(base, 'voice-bubbles'), plan09TransactionKey({ ...base, profile: 'p2' }, 'voice-bubbles'))
  assert.notEqual(plan09TransactionKey(base, 'voice-bubbles'), plan09TransactionKey(base, 'singing'))
  assert.equal(plan09DependencyScope(base, 'local', 'rvc', 'core'), plan09DependencyScope(base, 'cloud', 'gateway', 'core'))
  assert.equal(plan09DependencyScope(base, 'local', 'rvc', 'sender'), plan09DependencyScope(base, 'cpu', 'gateway', 'sender'))
  assert.equal(plan09DependencyScope(base, 'local', 'rvc', 'rvc'), plan09EngineScope(base, 'local', 'rvc'))
  assert.notEqual(plan09DependencyScope(base, 'local', 'rvc', 'rvc'), plan09DependencyScope(base, 'local', 'svc', 'rvc'))
})

test('a stale prepared plan can be re-prepared instead of staying disabled', () => {
  const prepared = preparedEntry({ frozenSerial: 'voice-b' })
  assert.equal(plan09CanConfirm(prepared, { currentSerial: 'voice-a', contextSerial: 'ctx-a' }), false)
  assert.equal(plan09CanPrepare(prepared, { currentSerial: 'voice-a' }), true)

  const restarted = plan09ReduceTransaction(prepared, { type: 'PREPARE_START' })
  assert.equal(restarted.busy, true)
  const redone = plan09ReduceTransaction(restarted, {
    type: 'PREPARE_DONE',
    seq: restarted.inFlightSeq,
    result: { ok: true, plan: { planId: 'plan-b' } },
    frozenChanges: { schemaVersion: 1 },
    frozenSerial: 'voice-a',
    contextSerial: 'ctx-a',
  })
  assert.equal(redone.phase, 'PREPARED')
  assert.equal(redone.plan.planId, 'plan-b')
  assert.equal(plan09CanConfirm(redone, { currentSerial: 'voice-a', contextSerial: 'ctx-a' }), true)
})
