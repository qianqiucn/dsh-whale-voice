import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { test, after } from 'node:test'

import {
  COORDINATION_STATES,
  ConfigCoordinatorError,
  createConfigCoordinator,
  getConfigAuthorityMatrix,
} from '../core/config-coordinator.mjs'
import { createConfigSandbox } from '../core/config-sandbox.mjs'
import { createFakeRuntime, createFixtureSource } from './helpers/config-coordination-fixture.mjs'

const sandboxes = []
after(async () => {
  for (const sandbox of sandboxes) {
    await fsPromises.rm(sandbox.root, { recursive: true, force: true })
  }
})

function bridgeDocument(overrides = {}) {
  return {
    schemaVersion: 1,
    enabled: false,
    mode: 'explicit',
    forGroup: false,
    autoProbability: 0,
    defaultVoice: 'whale-v1',
    allowedTargets: ['fixture-private-target'],
    token: 'fixture-bridge-token',
    ...overrides,
  }
}

function senderDocument(overrides = {}) {
  return {
    schemaVersion: 1,
    tts: {
      provider: 'qwen-local',
      model: 'Qwen3-TTS-12Hz-1.7B-Base',
      voice: 'whale-v1',
      baseUrl: 'http://127.0.0.1:8765',
    },
    automation: 'manual',
    allowedChats: ['fixture-private-target'],
    token: 'fixture-sender-token',
    ...overrides,
  }
}

function coreDocument() {
  return {
    schemaVersion: 1,
    qwenUrl: 'http://127.0.0.1:8765',
    roots: { wechatAgent: 'fixture-root', sender: 'fixture-root' },
    token: 'fixture-core-token',
  }
}

function workerDocument() {
  return {
    schemaVersion: 1,
    voice_enabled: true,
    voice_auto_mode: 'manual',
    token: 'fixture-worker-token',
  }
}

function permissionsDocument() {
  return {
    schemaVersion: 1,
    wechat: { whitelist: ['fixture-private-target'], wake_mode: 'explicit' },
    token: 'fixture-wechat-token',
  }
}

async function setup(options = {}) {
  const sandbox = createConfigSandbox()
  sandboxes.push(sandbox)
  const bridge = createFixtureSource('bridgeVoice', {
    document: bridgeDocument(options.bridgeDocument),
    supportsRuntimeConfirmation: options.bridgeConfirm === true,
    saveFailure: options.bridgeSaveFailure,
    rollbackFailure: options.bridgeRollbackFailure,
  })
  const sender = createFixtureSource('senderService', {
    document: senderDocument(options.senderDocument),
    supportsRuntimeConfirmation: options.senderConfirm === true,
    saveFailure: options.senderSaveFailure,
    saveFailureOutcome: options.senderSaveFailureOutcome,
    rollbackFailure: options.senderRollbackFailure,
  })
  const core = options.coreInvalid
    ? {
      id: 'core',
      simulatedOnly: true,
      supportsRuntimeConfirmation: false,
      async read() { return { ok: false, error: { code: 'SCHEMA_UNSUPPORTED' } } },
      async validateChange() { return { ok: false, errors: [] } },
      async save() { return { ok: false } },
    }
    : createFixtureSource('core', {
      document: coreDocument(),
      readFailure: options.coreReadFailure,
    })
  const worker = createFixtureSource('workerSafety', { document: workerDocument() })
  const permissions = createFixtureSource('wechatPermissions', { document: permissionsDocument() })
  const sources = { bridgeVoice: bridge, senderService: sender, core, workerSafety: worker, wechatPermissions: permissions }
  const coordinator = createConfigCoordinator({
    sandbox,
    sources,
    runtime: options.runtime || {},
    fsImpl: options.fsImpl,
    now: options.now,
    planTtlMs: options.planTtlMs,
  })
  return { sandbox, bridge, sender, core, worker, permissions, coordinator }
}

function changeFor(bridge, sender, sets, revisions = {}) {
  const changes = {}
  if (sets.bridgeVoice) {
    changes.bridgeVoice = { expectedRevision: revisions.bridgeVoice || bridge.revision, set: sets.bridgeVoice }
  }
  if (sets.senderService) {
    changes.senderService = { expectedRevision: revisions.senderService || sender.revision, set: sets.senderService }
  }
  if (sets.workerSafety) {
    changes.workerSafety = { expectedRevision: revisions.workerSafety || workerRevision(), set: sets.workerSafety }
  }
  if (sets.wechatPermissions) {
    changes.wechatPermissions = { expectedRevision: revisions.wechatPermissions || 'a'.repeat(32), set: sets.wechatPermissions }
  }
  return { schemaVersion: 1, changes }
}

function workerRevision() {
  return 'a'.repeat(32)
}

async function execute(bridge, sender, coordinator, sets, options = {}) {
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, sets, options.revisions))
  assert.equal(prepared.ok, true, JSON.stringify(prepared))
  const result = await coordinator.execute(prepared.plan.planId, {
    userConfirmed: options.userConfirmed === false ? false : true,
    confirmedPlanId: prepared.plan.planId,
  })
  return { prepared, result }
}

test('authority matrix keeps Bridge and Worker as separate safety layers', () => {
  const matrix = getConfigAuthorityMatrix()
  const bridge = matrix.find((item) => item.id === 'bridgeVoice')
  const worker = matrix.find((item) => item.id === 'workerSafety')
  const permissions = matrix.find((item) => item.id === 'wechatPermissions')
  const tts = matrix.find((item) => item.id === 'ttsProvider')
  assert.equal(bridge.writable, true)
  assert.equal(bridge.risk, 'CRITICAL')
  assert.equal(worker.writable, false)
  assert.equal(worker.finalSafetyGate, true)
  assert.equal(worker.risk, 'CRITICAL')
  assert.equal(permissions.writable, false)
  assert.equal(permissions.sensitive, true)
  assert.equal(tts.coordinatorSource, 'senderService')
  assert.notEqual(bridge.location, worker.location)
})

test('baseline exposes only allow-listed settings and contains no private data', async () => {
  const { coordinator } = await setup()
  const baseline = await coordinator.getBaseline()
  assert.equal(baseline.ok, true)
  const bridge = baseline.sources.find((source) => source.id === 'bridgeVoice')
  const sender = baseline.sources.find((source) => source.id === 'senderService')
  const worker = baseline.sources.find((source) => source.id === 'workerSafety')
  const permissions = baseline.sources.find((source) => source.id === 'wechatPermissions')
  const targetMap = baseline.sources.find((source) => source.id === 'targetMap')
  assert.equal(bridge.settings.enabled, false)
  assert.equal(sender.settings.tts.voice, 'whale-v1')
  assert.equal(worker.settings, null)
  assert.equal(permissions.errorCode, 'CONFIG_COORDINATION_NOT_READ_BY_DESIGN')
  assert.equal(targetMap.errorCode, 'CONFIG_COORDINATION_NOT_READ_BY_DESIGN')
  const serialized = JSON.stringify(baseline)
  assert.equal(serialized.includes('fixture-bridge-token'), false)
  assert.equal(serialized.includes('fixture-private-target'), false)
  assert.equal(serialized.includes('allowedChats'), false)
  assert.equal(serialized.includes('qwenUrl'), false)
})

test('single-source preview reports fields and risk without saving', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  assert.equal(prepared.ok, true)
  assert.equal(prepared.plan.state, COORDINATION_STATES.PREPARED)
  assert.equal(prepared.plan.previewOnly, true)
  assert.equal(prepared.plan.saved, false)
  assert.equal(prepared.plan.applyState, 'NOT_APPLIED')
  assert.equal(prepared.plan.sources.length, 1)
  assert.deepEqual(prepared.plan.sources[0].fields, ['enabled'])
  assert.equal(prepared.plan.sources[0].risk, 'CRITICAL')
  assert.equal(prepared.plan.requiresUserConfirmation, true)
  assert.equal(bridge.saveCount, 0)
  assert.equal(bridge.document.enabled, false)
})

test('multi-source preview lists both sources without private values', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  }))
  assert.equal(prepared.ok, true)
  assert.equal(prepared.plan.sources.length, 2)
  const text = JSON.stringify(prepared.plan)
  assert.equal(text.includes('fixture-voice'), false)
  assert.equal(text.includes('fixture-bridge-token'), false)
  assert.equal(text.includes('fixture-private-target'), false)
})

test('different values from the same revision get different plan identities and execute their own content', async () => {
  const { bridge, sender, coordinator } = await setup()
  const planA = await coordinator.prepareChange(changeFor(bridge, sender, { senderService: { tts: { voice: 'voice-a' } } }))
  const planB = await coordinator.prepareChange(changeFor(bridge, sender, { senderService: { tts: { voice: 'voice-b' } } }))
  assert.equal(planA.ok, true)
  assert.equal(planB.ok, true)
  assert.notEqual(planA.plan.planId, planB.plan.planId)
  const result = await coordinator.execute(planA.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: planA.plan.planId,
  })
  assert.equal(result.state, COORDINATION_STATES.SAVED)
  assert.equal(sender.document.tts.voice, 'voice-a')
  const stale = await coordinator.execute(planB.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: planB.plan.planId,
  })
  assert.equal(stale.state, COORDINATION_STATES.CONFLICT)
  assert.equal(sender.document.tts.voice, 'voice-a')
})

test('user confirmation must name the exact high-risk plan', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  const wrong = await coordinator.execute(prepared.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: 'a'.repeat(32),
  })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.error.code, 'CONFIG_COORDINATION_CONFIRMATION_REQUIRED')
  assert.equal(bridge.saveCount, 0)
  const correct = await coordinator.execute(prepared.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: prepared.plan.planId,
  })
  assert.equal(correct.state, COORDINATION_STATES.SAVED)
})

test('a consumed plan cannot be executed twice', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  const first = await coordinator.execute(prepared.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: prepared.plan.planId,
  })
  assert.equal(first.state, COORDINATION_STATES.SAVED)
  const second = await coordinator.execute(prepared.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: prepared.plan.planId,
  })
  assert.equal(second.ok, false)
  assert.equal(second.error.code, 'CONFIG_COORDINATION_PLAN_CONSUMED')
  assert.equal(bridge.saveCount, 1)
})

test('an expired plan cannot be executed', async () => {
  let clock = Date.UTC(2026, 9, 25, 0, 0, 0)
  const { bridge, sender, coordinator } = await setup({
    now: () => new Date(clock),
    planTtlMs: 10,
  })
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  clock += 20
  const result = await coordinator.execute(prepared.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: prepared.plan.planId,
  })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_COORDINATION_PLAN_EXPIRED')
  assert.equal(bridge.saveCount, 0)
})

test('schema-invalid draft and unknown fields are rejected', async () => {
  const { bridge, sender, coordinator } = await setup()
  const invalid = await coordinator.prepareChange({ schemaVersion: 1, changes: { bridgeVoice: { expectedRevision: bridge.revision, set: { bogus: true } } } })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'CONFIG_COORDINATION_SCHEMA_INVALID')
  const unknown = await coordinator.prepareChange({ schemaVersion: 1, changes: {}, extra: true })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.code, 'CONFIG_COORDINATION_UNKNOWN_FIELD')
  assert.equal(bridge.saveCount, 0)
  assert.equal(sender.saveCount, 0)
})

test('read-only Worker and permission sources cannot be drafted', async () => {
  const { bridge, sender, coordinator } = await setup()
  const worker = await coordinator.prepareChange(changeFor(bridge, sender, { workerSafety: { voice_enabled: false } }))
  assert.equal(worker.ok, false)
  assert.equal(worker.error.code, 'CONFIG_COORDINATION_SOURCE_READ_ONLY')
  const permissions = await coordinator.prepareChange(changeFor(bridge, sender, { wechatPermissions: { add: 'x' } }))
  assert.equal(permissions.ok, false)
  assert.equal(permissions.error.code, 'CONFIG_COORDINATION_SOURCE_READ_ONLY')
})

test('revision mismatch returns CONFLICT and writes nothing', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  bridge.externalWrite(bridgeDocument({ enabled: true }))
  const result = await coordinator.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId })
  assert.equal(result.ok, false)
  assert.equal(result.state, COORDINATION_STATES.CONFLICT)
  assert.equal(result.error.code, 'CONFIG_COORDINATION_CONFLICT')
  assert.equal(bridge.saveCount, 0)
})

test('execute requires explicit user confirmation', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  const result = await coordinator.execute(prepared.plan.planId)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_COORDINATION_CONFIRMATION_REQUIRED')
  assert.equal(bridge.saveCount, 0)
})

test('successful save is SAVED/PENDING_APPLY, not APPLIED', async () => {
  const { bridge, sender, coordinator } = await setup()
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  assert.equal(result.ok, true)
  assert.equal(result.state, COORDINATION_STATES.SAVED)
  assert.equal(result.saveState, COORDINATION_STATES.SAVED)
  assert.equal(result.applyState, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(result.activeRevision, null)
  assert.equal(result.activeConfirmed, false)
  assert.equal(bridge.document.enabled, true)
  assert.equal(bridge.saveCount, 1)
})

test('multi-source save commits both adapters and reports per-source revisions', async () => {
  const { bridge, sender, coordinator } = await setup()
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.ok, true)
  assert.equal(result.state, COORDINATION_STATES.SAVED)
  assert.equal(bridge.saveCount, 1)
  assert.equal(sender.saveCount, 1)
  assert.equal(result.steps.length, 2)
  assert.ok(result.steps.every((step) => step.status === 'SAVED' && /^[a-f0-9]{32}$/.test(step.savedRevision)))
})

test('a no-op change does not create a plan or write', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: false } }))
  assert.equal(prepared.ok, true)
  assert.equal(prepared.noChanges, true)
  assert.equal(prepared.sources.length, 0)
  assert.equal(bridge.saveCount, 0)
  assert.equal(sender.saveCount, 0)
})

test('same-instance concurrent executes serialize to one save and one conflict', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  const results = await Promise.all([
    coordinator.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId }),
    coordinator.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId }),
  ])
  const states = results.map((result) => result.state).sort()
  assert.deepEqual(states, [COORDINATION_STATES.CONFLICT, COORDINATION_STATES.SAVED])
  const consumed = results.find((result) => result.state === COORDINATION_STATES.CONFLICT)
  assert.equal(consumed.error.code, 'CONFIG_COORDINATION_PLAN_CONSUMED')
  assert.equal(bridge.saveCount, 1)
})

test('external non-cooperating modification after prepare is detected', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  bridge.externalWrite(bridgeDocument({ enabled: true, defaultVoice: 'external' }))
  const result = await coordinator.execute(prepared.plan.planId, { userConfirmed: true, confirmedPlanId: prepared.plan.planId })
  assert.equal(result.state, COORDINATION_STATES.CONFLICT)
  assert.equal(bridge.saveCount, 0)
})

function forceRollbackResult(adapter, result) {
  const original = adapter.rollback.bind(adapter)
  adapter.rollback = async (args) => {
    await original(args)
    return result
  }
}

test('second save failure stops and rolls back the first confirmed reversible save', async () => {
  const { bridge, sender, coordinator } = await setup({ senderSaveFailure: 'EIO' })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.ok, false)
  assert.equal(result.state, COORDINATION_STATES.FAILED)
  assert.equal(result.error.code, 'CONFIG_COORDINATION_SAVE_FAILED')
  assert.equal(result.error.rolledBack, true)
  assert.equal(result.error.rollbackEvidence.length, 1)
  assert.equal(result.error.rollbackEvidence[0].status, 'CONFIRMED')
  assert.equal(result.error.rollbackEvidence[0].reportedRevision, result.error.rollbackEvidence[0].expectedRevision)
  assert.equal(result.error.rollbackEvidence[0].observedRevision, result.error.rollbackEvidence[0].expectedRevision)
  assert.equal(bridge.document.enabled, false)
  assert.equal(bridge.rollbackCount, 1)
  assert.equal(sender.document.tts.voice, 'whale-v1')
})

test('unconfirmed rollback is reported as UNKNOWN, never full rollback', async () => {
  const { bridge, sender, coordinator } = await setup({ senderSaveFailure: 'EIO', bridgeRollbackFailure: 'EPERM' })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.ok, false)
  assert.equal(result.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(result.error.rolledBack, false)
  assert.equal(bridge.document.enabled, true)
})

test('rollback revision mismatch is not accepted as full rollback', async () => {
  const { bridge, sender, coordinator } = await setup({ senderSaveFailure: 'EIO' })
  forceRollbackResult(bridge, { ok: true, revision: 'f'.repeat(32) })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(result.error.rolledBack, false)
  assert.equal(result.error.rollbackEvidence[0].status, 'UNCONFIRMED')
  assert.equal(result.error.rollbackEvidence[0].reason, 'REVISION_MISMATCH')
  assert.equal(result.error.rollbackEvidence[0].reportedRevision, 'f'.repeat(32))
})

test('rollback without a revision is not accepted as full rollback', async () => {
  const { bridge, sender, coordinator } = await setup({ senderSaveFailure: 'EIO' })
  forceRollbackResult(bridge, { ok: true })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(result.error.rollbackEvidence[0].status, 'UNCONFIRMED')
  assert.equal(result.error.rollbackEvidence[0].reason, 'REVISION_MISSING')
})

test('rollback read failure is not accepted as full rollback', async () => {
  const { bridge, sender, coordinator } = await setup({ senderSaveFailure: 'EIO' })
  const originalRollback = bridge.rollback.bind(bridge)
  const originalRead = bridge.read.bind(bridge)
  let armed = false
  bridge.rollback = async (args) => {
    const result = await originalRollback(args)
    armed = true
    return result
  }
  bridge.read = async () => {
    if (armed) throw new Error('read after rollback failed')
    return originalRead()
  }
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(result.error.rollbackEvidence[0].status, 'UNCONFIRMED')
  assert.equal(result.error.rollbackEvidence[0].reason, 'READ_FAILED')
})

test('external modification during rollback invalidates rollback evidence', async () => {
  const { bridge, sender, coordinator } = await setup({ senderSaveFailure: 'EIO' })
  const originalRollback = bridge.rollback.bind(bridge)
  bridge.rollback = async (args) => {
    const result = await originalRollback(args)
    bridge.externalWrite(bridgeDocument({ enabled: true, defaultVoice: 'external' }))
    return result
  }
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(result.error.rollbackEvidence[0].status, 'UNCONFIRMED')
  assert.equal(result.error.rollbackEvidence[0].reason, 'OBSERVED_REVISION_MISMATCH')
})

test('a multi-source rollback with one unconfirmed source is not reported complete', async () => {
  const { bridge, sender, coordinator } = await setup()
  const record = {
    steps: [
      { source: 'bridgeVoice', status: 'SAVED' },
      { source: 'senderService', status: 'SAVED' },
    ],
  }
  const saved = [
    {
      source: 'bridgeVoice',
      adapter: bridge,
      previousRevision: bridge.revision,
      previousDocument: bridge.document,
    },
    {
      source: 'senderService',
      adapter: sender,
      previousRevision: sender.revision,
      previousDocument: sender.document,
    },
  ]
  forceRollbackResult(sender, { ok: true, revision: 'f'.repeat(32) })
  const rollback = await coordinator._rollback(record, saved, 'a'.repeat(32))
  assert.equal(rollback.confirmed, false)
  assert.equal(rollback.evidence.length, 2)
  const senderEvidence = rollback.evidence.find((item) => item.source === 'senderService')
  const bridgeEvidence = rollback.evidence.find((item) => item.source === 'bridgeVoice')
  assert.equal(senderEvidence.status, 'UNCONFIRMED')
  assert.equal(bridgeEvidence.status, 'CONFIRMED')
  assert.equal(record.steps.find((step) => step.source === 'bridgeVoice').status, 'ROLLED_BACK')
})

test('failure with an unconfirmed write outcome stays UNKNOWN even after prior rollback', async () => {
  const { bridge, sender, coordinator } = await setup({
    senderSaveFailure: 'EIO',
    senderSaveFailureOutcome: 'UNKNOWN',
  })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  assert.equal(result.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(result.error.writeOutcome, 'UNKNOWN')
  assert.equal(result.error.rolledBack, false)
  assert.equal(bridge.document.enabled, false)
  assert.equal(bridge.rollbackCount, 1)
})

test('journal schema tampering is rejected without writes', async () => {
  const { bridge, sender, coordinator } = await setup()
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const journalPath = path.join(coordinator.journalDir, result.transactionId + '.json')
  const record = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
  record.extra = 'unexpected'
  fs.writeFileSync(journalPath, JSON.stringify(record), 'utf8')
  const status = await coordinator.getStatus(result.transactionId)
  assert.equal(status.ok, false)
  assert.equal(status.error.code, 'CONFIG_COORDINATION_JOURNAL_INVALID')
  const recovered = await coordinator.recover(result.transactionId)
  assert.equal(recovered.ok, false)
  assert.equal(recovered.error.code, 'CONFIG_COORDINATION_JOURNAL_INVALID')
  assert.equal(bridge.saveCount, 1)
})

test('truncated and oversized journals fail closed', async () => {
  const { bridge, sender, coordinator } = await setup()
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const journalPath = path.join(coordinator.journalDir, result.transactionId + '.json')
  fs.writeFileSync(journalPath, '{"journalVersion":1', 'utf8')
  let status = await coordinator.getStatus(result.transactionId)
  assert.equal(status.error.code, 'CONFIG_COORDINATION_JOURNAL_INVALID')
  fs.writeFileSync(journalPath, 'x'.repeat(300 * 1024), 'utf8')
  status = await coordinator.getStatus(result.transactionId)
  assert.equal(status.error.code, 'CONFIG_COORDINATION_JOURNAL_INVALID')
  assert.equal(bridge.saveCount, 1)
})

test('recovery is read-only and repeatable after a saved transaction', async () => {
  const { bridge, sender, coordinator } = await setup()
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const first = await coordinator.recover(result.transactionId)
  assert.equal(first.state, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(first.replayed, false)
  const second = await coordinator.recover(result.transactionId)
  assert.equal(second.state, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(bridge.saveCount, 1)
})

test('journal file symlink replacement is rejected when the host permits symlinks', async (t) => {
  const { bridge, sender, coordinator, sandbox } = await setup()
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const journalPath = path.join(coordinator.journalDir, result.transactionId + '.json')
  const outside = path.join(sandbox.root, 'journal-outside.json')
  fs.copyFileSync(journalPath, outside)
  fs.rmSync(journalPath, { force: true })
  try {
    fs.symlinkSync(outside, journalPath)
  } catch {
    t.skip('symlink creation is not permitted on this platform')
    return
  }
  const status = await coordinator.getStatus(result.transactionId)
  assert.equal(status.ok, false)
  assert.equal(status.error.code, 'CONFIG_COORDINATION_JOURNAL_INVALID')
  assert.equal(bridge.saveCount, 1)
})

test('journal failure before any source write leaves both sources untouched', async () => {
  const failingFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'writeFileSync') {
        return (file, ...args) => {
          if (String(file).includes('.whale-coordination')) throw Object.assign(new Error('journal denied'), { code: 'EACCES' })
          return target.writeFileSync(file, ...args)
        }
      }
      const value = target[property]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const { bridge, sender, coordinator } = await setup({ fsImpl: failingFs })
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  assert.equal(result.ok, false)
  assert.equal(result.state, COORDINATION_STATES.FAILED)
  assert.equal(result.error.code, 'CONFIG_COORDINATION_JOURNAL_FAILED')
  assert.equal(bridge.saveCount, 0)
  assert.equal(sender.saveCount, 0)
})

test('journal failure after the first save is UNKNOWN and recovery is read-only', async () => {
  let journalWrites = 0
  const flakyFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'writeFileSync') {
        return (file, ...args) => {
          if (String(file).includes('.whale-coordination')) {
            journalWrites += 1
            if (journalWrites === 3) throw Object.assign(new Error('journal lost'), { code: 'EIO' })
          }
          return target.writeFileSync(file, ...args)
        }
      }
      const value = target[property]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const { bridge, sender, coordinator, sandbox } = await setup({ fsImpl: flakyFs })
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  assert.equal(result.ok, false)
  assert.equal(result.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(result.error.code, 'CONFIG_COORDINATION_JOURNAL_FAILED')
  assert.equal(bridge.saveCount, 1)
  const txid = result.transactionId
  const journalPath = path.join(sandbox.root, '.whale-coordination', txid + '.json')
  assert.equal(fs.existsSync(journalPath), true)

  const recovered = await coordinator.recover(txid)
  assert.equal(recovered.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(recovered.recoveryRequired, true)
  const before = bridge.saveCount
  const again = await coordinator.recover(txid)
  assert.equal(again.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(bridge.saveCount, before)
})

test('manual save state applies as PENDING_APPLY when no runtime confirmation exists', async () => {
  const { bridge, sender, coordinator } = await setup()
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const applied = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(applied.applyState, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(applied.activeRevision, null)
  assert.equal(applied.activeConfirmed, false)
})

test('Fake Runtime confirmation produces APPLIED only with trusted loaded revisions', async () => {
  const bridgeRuntime = createFakeRuntime()
  const senderRuntime = createFakeRuntime()
  const { bridge, sender, coordinator } = await setup({
    bridgeConfirm: true,
    senderConfirm: true,
    runtime: { bridgeVoice: bridgeRuntime, senderService: senderRuntime },
  })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  const applied = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.APPLIED)
  assert.equal(applied.applyState, COORDINATION_STATES.APPLIED)
  assert.equal(applied.activeConfirmed, true)
  assert.equal(applied.activeRevision, null)
  assert.deepEqual(applied.confirmed.sort(), ['bridgeVoice', 'senderService'])
  assert.equal(bridgeRuntime.calls, 1)
  assert.equal(senderRuntime.calls, 1)
  assert.equal(bridgeRuntime.dispatchCalls, 0)
  assert.equal(senderRuntime.dispatchCalls, 0)
})

test('single-source APPLIED requires the runtime revision to equal the saved revision', async () => {
  const runtime = createFakeRuntime()
  const { bridge, sender, coordinator } = await setup({
    bridgeConfirm: true,
    runtime: { bridgeVoice: runtime },
  })
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const savedRevision = result.steps[0].savedRevision
  const applied = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.APPLIED)
  assert.equal(applied.activeRevision, savedRevision)
  assert.equal(applied.activeConfirmed, true)
  assert.equal(runtime.calls, 1)
})

test('runtime revision mismatch, old, empty and forged success are not APPLIED', async () => {
  for (const mode of ['mismatch', 'old', 'empty', 'forged']) {
    const runtime = createFakeRuntime({ mode })
    const { bridge, sender, coordinator } = await setup({
      bridgeConfirm: true,
      runtime: { bridgeVoice: runtime },
    })
    const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
    const applied = await coordinator.apply(result.transactionId, { userConfirmed: true })
    assert.equal(applied.state, COORDINATION_STATES.UNKNOWN, mode)
    assert.equal(applied.activeConfirmed, false, mode)
    assert.equal(applied.activeRevision, null, mode)
    assert.deepEqual(applied.mismatch, ['bridgeVoice'], mode)
    assert.equal(applied.steps[0].applyStatus, 'REVISION_MISMATCH', mode)
    assert.equal(applied.steps[0].activeRevision, null, mode)
    const again = await coordinator.apply(result.transactionId, { userConfirmed: true })
    assert.equal(again.state, COORDINATION_STATES.UNKNOWN, mode)
    assert.equal(runtime.calls, 1, mode)
  }
})

test('one exact confirmation and one mismatch is PARTIALLY_APPLIED, not APPLIED', async () => {
  const bridgeRuntime = createFakeRuntime()
  const senderRuntime = createFakeRuntime({ mode: 'mismatch' })
  const { bridge, sender, coordinator } = await setup({
    bridgeConfirm: true,
    senderConfirm: true,
    runtime: { bridgeVoice: bridgeRuntime, senderService: senderRuntime },
  })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  const applied = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.PARTIALLY_APPLIED)
  assert.equal(applied.activeConfirmed, false)
  assert.deepEqual(applied.confirmed, ['bridgeVoice'])
  assert.deepEqual(applied.mismatch, ['senderService'])
  assert.equal(applied.activeRevision, null)
})

test('partial runtime confirmation is PARTIALLY_APPLIED and is not retried', async () => {
  const bridgeRuntime = createFakeRuntime()
  const senderRuntime = createFakeRuntime({ mode: 'reject' })
  const { bridge, sender, coordinator } = await setup({
    bridgeConfirm: true,
    senderConfirm: true,
    runtime: { bridgeVoice: bridgeRuntime, senderService: senderRuntime },
  })
  const { result } = await execute(bridge, sender, coordinator, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice' } },
  })
  const applied = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.PARTIALLY_APPLIED)
  assert.equal(applied.activeConfirmed, false)
  assert.deepEqual(applied.confirmed, ['bridgeVoice'])
  assert.deepEqual(applied.rejected, ['senderService'])
  const again = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(again.state, COORDINATION_STATES.PARTIALLY_APPLIED)
  assert.equal(bridgeRuntime.calls, 1)
  assert.equal(senderRuntime.calls, 1)
})

test('unknown runtime result stays UNKNOWN and does not invent APPLIED', async () => {
  const bridgeRuntime = createFakeRuntime({ mode: 'unknown' })
  const { bridge, sender, coordinator } = await setup({
    bridgeConfirm: true,
    runtime: { bridgeVoice: bridgeRuntime },
  })
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const applied = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(applied.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(applied.activeRevision, null)
  assert.equal(applied.activeConfirmed, false)
})

test('apply before save is rejected without runtime side effects', async () => {
  const runtime = createFakeRuntime()
  const { coordinator } = await setup({ bridgeConfirm: true, runtime: { bridgeVoice: runtime } })
  const applied = await coordinator.apply('a'.repeat(32), { userConfirmed: true })
  assert.equal(applied.ok, false)
  assert.equal(applied.error.code, 'CONFIG_COORDINATION_TRANSACTION_UNKNOWN')
  assert.equal(runtime.calls, 0)
})

test('sensitive source values never enter plan, journal, status or errors', async () => {
  const { bridge, sender, coordinator } = await setup()
  const { prepared, result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const planText = JSON.stringify(prepared.plan)
  const status = await coordinator.getStatus(result.transactionId)
  const journalRaw = fs.readFileSync(path.join(coordinator.journalDir, result.transactionId + '.json'), 'utf8')
  const statusText = JSON.stringify(status)
  for (const text of [planText, journalRaw, statusText]) {
    assert.equal(text.includes('fixture-bridge-token'), false)
    assert.equal(text.includes('fixture-sender-token'), false)
    assert.equal(text.includes('fixture-private-target'), false)
    assert.equal(text.includes('allowedTargets'), false)
  }
})

test('Worker safety and permission expanders are not bypassed by Bridge changes', async () => {
  const { bridge, sender, worker, permissions, coordinator } = await setup()
  const beforeWorker = worker.document
  const beforePermissions = permissions.document
  const { prepared, result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  assert.equal(result.state, COORDINATION_STATES.SAVED)
  assert.equal(prepared.plan.sources.some((source) => source.source === 'workerSafety'), false)
  assert.deepEqual(worker.document, beforeWorker)
  assert.deepEqual(permissions.document, beforePermissions)
  assert.equal(bridge.document.enabled, true)
})

test('Core read failure and invalid schema are exposed without writes', async () => {
  const { bridge, sender, coordinator } = await setup({ coreReadFailure: 'ETIMEDOUT' })
  const baseline = await coordinator.getBaseline()
  const core = baseline.sources.find((source) => source.id === 'core')
  assert.equal(core.available, false)
  assert.equal(core.errorCode, 'CONFIG_COORDINATION_SOURCE_UNAVAILABLE')
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  assert.equal(result.state, COORDINATION_STATES.SAVED)
  assert.equal(bridge.saveCount, 1)
})

test('Core invalid schema is reported as invalid, not as a usable value', async () => {
  const { coordinator } = await setup({ coreInvalid: true })
  const baseline = await coordinator.getBaseline()
  const core = baseline.sources.find((source) => source.id === 'core')
  assert.equal(core.available, false)
  assert.equal(core.errorCode, 'CONFIG_COORDINATION_SOURCE_INVALID')
})

test('stale status observer and stale apply result cannot overwrite newer state', async () => {
  const runtime = createFakeRuntime()
  const { bridge, sender, coordinator } = await setup({ bridgeConfirm: true, runtime: { bridgeVoice: runtime } })
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const status = await coordinator.getStatus(result.transactionId)
  assert.equal(status.ok, true)
  const stale = await coordinator.getStatus(result.transactionId, { observedVersion: status.version - 1 })
  assert.equal(stale.stale, true)
  assert.equal(stale.ignored, true)
  const applied = await coordinator.apply(result.transactionId, { userConfirmed: true, observedVersion: status.version - 1 })
  assert.equal(applied.ok, false)
  assert.equal(applied.error.code, 'CONFIG_COORDINATION_STALE_RESULT')
  assert.equal(runtime.calls, 0)
})

test('terminal APPLIED apply is idempotent and does not retry runtime', async () => {
  const bridgeRuntime = createFakeRuntime()
  const { bridge, sender, coordinator } = await setup({
    bridgeConfirm: true,
    runtime: { bridgeVoice: bridgeRuntime },
  })
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const first = await coordinator.apply(result.transactionId, { userConfirmed: true })
  const second = await coordinator.apply(result.transactionId, { userConfirmed: true })
  assert.equal(first.state, COORDINATION_STATES.APPLIED)
  assert.equal(second.state, COORDINATION_STATES.APPLIED)
  assert.equal(second.replayed, false)
  assert.equal(bridgeRuntime.calls, 1)
})

test('production Host has no coordinator import or write route', () => {
  const index = fs.readFileSync(path.resolve('index.js'), 'utf8')
  const server = fs.readFileSync(path.resolve('core/server.mjs'), 'utf8')
  assert.equal(index.includes('config-coordinator'), false)
  assert.equal(server.includes('config-coordinator'), false)
})

test('coordination journal lives only inside the trusted sandbox', async () => {
  const { bridge, sender, coordinator, sandbox } = await setup()
  const { result } = await execute(bridge, sender, coordinator, { bridgeVoice: { enabled: true } })
  const journal = path.join(coordinator.journalDir, result.transactionId + '.json')
  assert.equal(fs.existsSync(journal), true)
  assert.equal(path.dirname(journal).startsWith(sandbox.root), true)
  assert.equal(journal.includes(path.sep + 'runtime' + path.sep), false)
})

test('coordinator rejects an untrusted sandbox capability', () => {
  assert.throws(
    () => createConfigCoordinator({ sandbox: { root: process.cwd() }, sources: { bridgeVoice: createFixtureSource('bridgeVoice', { document: bridgeDocument() }) } }),
    (error) => error instanceof ConfigCoordinatorError && error.code === 'CONFIG_COORDINATION_SANDBOX_REQUIRED'
  )
})

test('validatePlan rechecks revisions and does not write', async () => {
  const { bridge, sender, coordinator } = await setup()
  const prepared = await coordinator.prepareChange(changeFor(bridge, sender, { bridgeVoice: { enabled: true } }))
  const valid = await coordinator.validatePlan(prepared.plan.planId)
  assert.equal(valid.ok, true)
  bridge.externalWrite(bridgeDocument({ enabled: true }))
  const conflict = await coordinator.validatePlan(prepared.plan.planId)
  assert.equal(conflict.ok, false)
  assert.equal(conflict.state, COORDINATION_STATES.CONFLICT)
  assert.equal(bridge.saveCount, 0)
})
