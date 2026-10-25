/* Test-only capability model for the Phase 4B-2B-1 component audit.
 *
 * These fixtures encode the audited write/read semantics of the real components without touching
 * any production file:
 *   - Bridge voice settings: read on every call, no supported write API, no loaded-revision API.
 *   - Voice Sender service: config read at service boot, PUT automation only, no loaded revision.
 *   - WeChatAgent console: revision-guarded save, but no loaded-config confirmation.
 *
 * They are NOT production adapters. They exist to prove which states the coordinator may claim and
 * which must remain PENDING_APPLY / UNKNOWN until an owning component exposes a trusted revision.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { canonicalize } from '../core/config-schema.mjs'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { createConfigCoordinator, COORDINATION_STATES } from '../core/config-coordinator.mjs'
import { createFixtureSource } from './helpers/config-coordination-fixture.mjs'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function revisionOf(document) {
  return createHash('sha256').update(JSON.stringify(canonicalize(document))).digest('hex').slice(0, 32)
}

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
    tts: { provider: 'qwen-local', model: 'fixture-model', voice: 'whale-v1' },
    automation: 'manual',
    allowedChats: ['fixture-private-target'],
    token: 'fixture-sender-token',
    ...overrides,
  }
}

const PROFILES = Object.freeze({
  bridgeHotRead: Object.freeze({
    readTiming: 'per-call',
    writeApi: 'none',
    loadedRevisionApi: false,
    requiresRestart: false,
  }),
  senderBootRead: Object.freeze({
    readTiming: 'service-boot',
    writeApi: 'PUT /v1/automation/config',
    loadedRevisionApi: false,
    requiresRestart: true,
  }),
  senderWithLoadedRevision: Object.freeze({
    readTiming: 'service-boot',
    writeApi: 'PUT /v1/automation/config',
    loadedRevisionApi: true,
    requiresRestart: true,
  }),
})

/**
 * Wraps the in-memory fixture source with the loaded/running copy that a real component keeps.
 * `profile` describes the audited interface; it is not a production behaviour switch.
 */
function createAuditedSource(id, profile, document) {
  const saved = createFixtureSource(id, {
    document,
    supportsRuntimeConfirmation: profile.loadedRevisionApi === true,
  })
  let loaded = clone(document)
  let pendingApply = false

  return {
    id,
    simulatedOnly: true,
    supportsRuntimeConfirmation: profile.loadedRevisionApi === true,
    profile,
    read: () => saved.read(),
    validateChange: (documentValue, set) => saved.validateChange(documentValue, set),
    async save(args) {
      const result = await saved.save(args)
      if (result.ok) {
        pendingApply = true
        if (profile.readTiming === 'per-call') loaded = clone(args.document)
      }
      return result
    },
    async rollback(args) {
      const result = await saved.rollback(args)
      if (result.ok) {
        pendingApply = false
        loaded = clone(saved.document)
      }
      return result
    },
    restart() {
      loaded = clone(saved.document)
      pendingApply = false
    },
    get loadedDocument() { return clone(loaded) },
    get loadedRevision() { return revisionOf(loaded) },
    get pendingApply() { return pendingApply },
    get revision() { return saved.revision },
    get document() { return saved.document },
  }
}

function createLoadedRevisionRuntime(source) {
  return {
    async apply() {
      return { ok: true, loadedRevision: source.loadedRevision }
    },
  }
}

function makeSetup(profile = PROFILES.senderBootRead, runtime = {}) {
  const sandbox = createConfigSandbox()
  const bridge = createAuditedSource('bridgeVoice', PROFILES.bridgeHotRead, bridgeDocument())
  const sender = createAuditedSource('senderService', profile, senderDocument())
  const coordinator = createConfigCoordinator({
    sandbox,
    sources: { bridgeVoice: bridge, senderService: sender },
    runtime,
  })
  return { sandbox, bridge, sender, coordinator }
}

async function save(coordinator, bridge, sender, sets) {
  const changes = {}
  if (sets.bridgeVoice) changes.bridgeVoice = { expectedRevision: bridge.revision, set: sets.bridgeVoice }
  if (sets.senderService) changes.senderService = { expectedRevision: sender.revision, set: sets.senderService }
  const prepared = await coordinator.prepareChange({ schemaVersion: 1, changes })
  assert.equal(prepared.ok, true, JSON.stringify(prepared))
  const executed = await coordinator.execute(prepared.plan.planId, {
    userConfirmed: true,
    confirmedPlanId: prepared.plan.planId,
  })
  assert.equal(executed.state, COORDINATION_STATES.SAVED, JSON.stringify(executed))
  return executed
}

test('audited models without a loaded-revision API cannot claim APPLIED', async (t) => {
  const { sandbox, bridge, sender, coordinator } = makeSetup()
  t.after(() => removeConfigSandbox(sandbox))

  const saved = await save(coordinator, bridge, sender, {
    bridgeVoice: { enabled: true },
    senderService: { tts: { voice: 'fixture-voice-2' } },
  })
  const applied = await coordinator.apply(saved.transactionId, { userConfirmed: true })

  assert.equal(applied.state, COORDINATION_STATES.PENDING_APPLY)
  assert.equal(applied.activeConfirmed, false)
  assert.equal(applied.activeRevision, null)
  assert.equal(applied.steps.every((step) => step.applyStatus === 'NO_RUNTIME_CONFIRMATION'), true)

  // A hot-read Bridge observes the saved value on its next call, but that is not a trusted
  // loaded revision and must not be upgraded to APPLIED.
  assert.equal(bridge.loadedDocument.enabled, true)
  // The Sender service keeps its boot-time copy until it is restarted.
  assert.equal(sender.loadedDocument.tts.voice, 'whale-v1')
  assert.equal(sender.pendingApply, true)
})

test('boot-read Sender with a mismatched loaded revision is UNKNOWN, not APPLIED', async (t) => {
  const { sandbox, bridge, sender, coordinator } = makeSetup(PROFILES.senderWithLoadedRevision)
  coordinator.runtime = { senderService: createLoadedRevisionRuntime(sender) }
  t.after(() => removeConfigSandbox(sandbox))

  const saved = await save(coordinator, bridge, sender, {
    senderService: { tts: { voice: 'fixture-voice-2' } },
  })
  const applied = await coordinator.apply(saved.transactionId, { userConfirmed: true })

  assert.equal(applied.state, COORDINATION_STATES.UNKNOWN)
  assert.equal(applied.activeConfirmed, false)
  assert.equal(applied.steps.find((step) => step.source === 'senderService').applyStatus, 'REVISION_MISMATCH')
})

test('after a restart, an exact loaded revision from the owning component is APPLIED', async (t) => {
  const { sandbox, bridge, sender, coordinator } = makeSetup(PROFILES.senderWithLoadedRevision)
  coordinator.runtime = { senderService: createLoadedRevisionRuntime(sender) }
  t.after(() => removeConfigSandbox(sandbox))

  const saved = await save(coordinator, bridge, sender, {
    senderService: { tts: { voice: 'fixture-voice-2' } },
  })
  sender.restart()
  const applied = await coordinator.apply(saved.transactionId, { userConfirmed: true })

  assert.equal(applied.state, COORDINATION_STATES.APPLIED)
  assert.equal(applied.activeConfirmed, true)
  const step = applied.steps.find((candidate) => candidate.source === 'senderService')
  assert.equal(step.activeRevision, step.savedRevision)
  assert.equal(step.activeRevision, sender.loadedRevision)
})

test('revision-guarded save is compare-and-swap, not proof of apply', async (t) => {
  const sandbox = createConfigSandbox()
  t.after(() => removeConfigSandbox(sandbox))
  const source = createAuditedSource('senderService', PROFILES.senderBootRead, senderDocument())
  const snapshot = await source.read()

  const rejected = await source.save({
    document: senderDocument({ tts: { provider: 'qwen-local', model: 'fixture-model', voice: 'fixture-voice-2' } }),
    expectedRevision: '0'.repeat(32),
  })
  assert.equal(rejected.ok, false)
  assert.equal(source.document.tts.voice, 'whale-v1')
  assert.equal(source.pendingApply, false)

  const accepted = await source.save({
    document: senderDocument({ tts: { provider: 'qwen-local', model: 'fixture-model', voice: 'fixture-voice-2' } }),
    expectedRevision: snapshot.revision,
  })
  assert.equal(accepted.ok, true)
  assert.equal(source.pendingApply, true)
  // The saved file changed; the running component still has the old copy.
  assert.equal(source.loadedDocument.tts.voice, 'whale-v1')
  assert.notEqual(source.loadedRevision, accepted.revision)
})

test('plans and apply results never echo fixture secrets or target IDs', async (t) => {
  const { sandbox, bridge, sender, coordinator } = makeSetup()
  t.after(() => removeConfigSandbox(sandbox))

  const prepared = await coordinator.prepareChange({
    schemaVersion: 1,
    changes: {
      bridgeVoice: { expectedRevision: bridge.revision, set: { enabled: true } },
      senderService: { expectedRevision: sender.revision, set: { tts: { voice: 'fixture-voice-2' } } },
    },
  })
  const executed = await coordinator.execute(prepared.plan.planId, {
    confirmedPlanId: prepared.plan.planId,
    userConfirmed: true,
  })
  const serialized = JSON.stringify({ plan: prepared.plan, result: executed })
  for (const value of ['fixture-bridge-token', 'fixture-sender-token', 'fixture-private-target']) {
    assert.equal(serialized.includes(value), false, 'output leaked ' + value)
  }
})
