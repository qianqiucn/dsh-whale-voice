import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import {
  RELAY_ERRORS,
  RELAY_STATES,
  createFakeDeliveryBackend,
  openUnifiedRelay,
  projectUnifiedRelayComponent,
} from '../core/audio/relay-core-offline.mjs'
import { createVoiceSavedTask, mutableClock, relayHandoff } from './support/relay-authority.mjs'

const SAVE_NOW = '2026-10-27T00:00:01.000Z'
const RELAY_NOW = '2026-10-27T00:00:02.000Z'
const EXPIRES = '2026-10-28T00:00:00.000Z'
const SCOPE = 'scope:fixture-demo'
const PROOF = 'fixture-rights:relay-demo'
const TARGET = {
  targetId: 'fixture-private-a',
  kind: 'PRIVATE',
  authorized: true,
  allowlisted: true,
  identityVerified: true,
  bridgeAllowed: true,
  workerAllowed: true,
}
const TARGET_B = { ...TARGET, targetId: 'fixture-private-b' }

async function setup({ backendOptions = {}, backendTargets = [TARGET, TARGET_B], relayTargets = [TARGET, TARGET_B], maxDeliveries } = {}) {
  const sandbox = createConfigSandbox()
  const voice = await createVoiceSavedTask(sandbox, { now: '2026-10-27T00:00:00.000Z', saveNow: SAVE_NOW, expiresAt: EXPIRES, proofRef: PROOF })
  const clock = mutableClock(RELAY_NOW)
  const backend = createFakeDeliveryBackend({ targets: backendTargets, ...backendOptions })
  const relay = await openUnifiedRelay({ sandbox, backend, targets: relayTargets, now: clock.now, maxDeliveries })
  const handoff = (overrides = {}) => relayHandoff({
    scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
    targetId: TARGET.targetId, requestKey: 'relay-request-a', proofRef: PROOF, overrides,
  })
  return { sandbox, backend, relay, voice, clock, handoff }
}

test('delivery ids are persistent, stable across request-key aliases and conflicts', async () => {
  const { sandbox, relay, handoff } = await setup()
  try {
    const first = await relay.ensureDelivery(handoff())
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.outcome, 'CREATED')
    assert.match(first.delivery.deliveryId, /^delivery:[0-9a-f]{32}$/)
    assert.match(first.delivery.intentId, /^intent:[0-9a-f]{32}$/)
    assert.equal(first.delivery.authority, 'TASK_OWNER_SAVED_V2')
    assert.equal(first.delivery.deliveryRequested, true)
    const mappings = await relay.mappings()
    assert.equal(mappings.ok, true)
    assert.match(mappings.deliveries[0].backendRequestId, /^[A-Za-z0-9_-]{8,64}$/)
    assert.equal(mappings.deliveries[0].backendRequestId.includes(':'), false)
    assert.match(mappings.deliveries[0].intentId, /^intent:[0-9a-f]{32}$/)
    const alias = await relay.ensureDelivery(handoff({ requestKey: 'relay-request-a2' }))
    assert.equal(alias.ok, true)
    assert.equal(alias.outcome, 'EXISTING')
    assert.equal(alias.delivery.deliveryId, first.delivery.deliveryId)
    const conflict = await relay.ensureDelivery(handoff({ targetId: TARGET_B.targetId }))
    assert.equal(conflict.ok, false)
    assert.equal(conflict.code, RELAY_ERRORS.CONFLICT)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a real SAVED fixture artifact is submitted once; duplicate returns EXISTING', async () => {
  const { sandbox, backend, relay, handoff } = await setup()
  try {
    const ensured = await relay.ensureDelivery(handoff())
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const first = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.delivery.state, RELAY_STATES.ACCEPTED)
    assert.match(first.delivery.receiptId, /^fixture-receipt-/)
    const second = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(second.ok, true)
    assert.equal(second.outcome, 'EXISTING')
    assert.equal(backend.stats().submitted, 1)
    assert.equal(backend.stats().accepted, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('the reader refuses an unknown target and the Fake Worker independently rechecks its own gate', async () => {
  const { sandbox, backend, relay, handoff } = await setup({ backendTargets: [{ ...TARGET, bridgeAllowed: false }] })
  try {
    const unknown = await relay.ensureDelivery(handoff({ targetId: 'fixture-private-missing' }))
    assert.equal(unknown.ok, false)
    assert.equal(unknown.code, RELAY_ERRORS.TARGET_REJECTED)
    const ensured = await relay.ensureDelivery(handoff())
    assert.equal(ensured.ok, true)
    const blocked = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(blocked.ok, true)
    assert.equal(blocked.delivery.state, RELAY_STATES.FAILED)
    assert.equal(backend.stats().accepted, 0)
    assert.ok(backend.stats().targetChecks > 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a caller-supplied task record is never an authority for a delivery', async () => {
  const { sandbox, relay, voice, handoff } = await setup()
  try {
    const forgedRecord = {
      schemaVersion: 1, taskId: voice.taskId, feature: 'singing', taskType: 'SVC',
      source: { kind: 'AUDIO_REF', ref: voice.sourceRef || voice.artifactRef },
      voiceProfileId: 'voice:demo-hero', deliveryRequested: true,
      rights: { state: 'CONFIRMED_FIXTURE' }, state: 'SAVED',
      outputArtifactRef: voice.artifactRef, cancel: { requested: false, confirmed: false },
      delivery: { state: 'NOT_REQUESTED', deliveryId: null }, lastError: null,
      observedAt: SAVE_NOW, mockOnly: true, realOperationAllowed: false,
    }
    const withRecord = await relay.ensureDelivery(handoff({ taskRecord: forgedRecord }))
    assert.equal(withRecord.ok, false)
    assert.equal(withRecord.code, RELAY_ERRORS.INPUT_INVALID)
    assert.equal(withRecord.detail, 'taskRecord')
    const wrongRef = 'artifact:fixture-bytes-' + 'c'.repeat(32)
    const unknownRef = await relay.ensureDelivery(handoff({ artifactRef: wrongRef }))
    assert.equal(unknownRef.ok, false)
    assert.equal(unknownRef.code, RELAY_ERRORS.TASK_NOT_SAVED)
    const unknownTask = await relay.ensureDelivery(handoff({ taskId: 'task:fixture-unborn' }))
    assert.equal(unknownTask.ok, false)
    assert.equal(unknownTask.code, RELAY_ERRORS.TASK_NOT_SAVED)
    const revokedRights = await relay.ensureDelivery(handoff({ rights: { state: 'GRANTED', proofRef: 'fixture-rights:other' } }))
    assert.equal(revokedRights.ok, false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an artifact deleted/changed between ensure and submit never reaches Fake submit', async () => {
  const { sandbox, backend, relay, voice, handoff } = await setup()
  try {
    const ensured = await relay.ensureDelivery(handoff())
    const library = await openFixtureArtifactLibrary({ sandbox })
    const deleted = await library.value.delete({ schemaVersion: 1, scopeId: SCOPE, artifactRef: voice.artifactRef, now: RELAY_NOW })
    assert.equal(deleted.ok, true)
    const blocked = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(blocked.ok, true)
    assert.equal(blocked.delivery.state, RELAY_STATES.FAILED)
    assert.equal(blocked.delivery.error.code, RELAY_ERRORS.ARTIFACT_UNAVAILABLE)
    assert.equal(backend.stats().submitted, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('UNKNOWN is terminal and never resent or moved to another backend', async () => {
  const { sandbox, relay, handoff } = await setup({ backendOptions: { failMode: 'unknown' } })
  try {
    const ensured = await relay.ensureDelivery(handoff())
    const first = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(first.ok, true)
    assert.equal(first.delivery.state, RELAY_STATES.UNKNOWN)
    const second = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(second.ok, false)
    assert.equal(second.code, RELAY_ERRORS.UNKNOWN_NO_RESEND)
    const alias = await relay.ensureDelivery(handoff({ requestKey: 'relay-request-new' }))
    assert.equal(alias.ok, true)
    assert.equal(alias.outcome, 'EXISTING')
    assert.equal(alias.delivery.state, RELAY_STATES.UNKNOWN)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('cancel is requested first and confirmed only by the explicit confirmation path', async () => {
  const { sandbox, relay, handoff } = await setup()
  try {
    const ensured = await relay.ensureDelivery(handoff())
    const requested = await relay.cancel(ensured.delivery.deliveryId)
    assert.equal(requested.ok, true)
    assert.equal(requested.cancelState, 'REQUESTED')
    assert.equal(requested.delivery.cancel.confirmed, false)
    const confirmed = await relay.confirmCancel(ensured.delivery.deliveryId)
    assert.equal(confirmed.ok, true)
    assert.equal(confirmed.delivery.state, RELAY_STATES.CANCELLED)
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, false)
    assert.equal(submitted.code, RELAY_ERRORS.CANCELLED)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('bounded capacity fails closed without evicting an existing delivery', async () => {
  const { sandbox, relay, voice, handoff } = await setup({ maxDeliveries: 1 })
  try {
    const first = await relay.ensureDelivery(handoff())
    assert.equal(first.ok, true)
    const second = await createVoiceSavedTask(sandbox, {
      idempotencyKey: 'key:fixture-relay-voice-b', saveRequestKey: 'save:relay-voice-b',
      now: '2026-10-27T00:00:00.000Z', saveNow: SAVE_NOW, expiresAt: EXPIRES, proofRef: PROOF,
    })
    const capacity = await relay.ensureDelivery(relayHandoff({
      scopeId: second.scopeId, taskId: second.taskId, artifactRef: second.artifactRef,
      targetId: TARGET.targetId, requestKey: 'relay-request-b', proofRef: PROOF,
    }))
    assert.equal(capacity.ok, false)
    assert.equal(capacity.code, RELAY_ERRORS.CAPACITY)
    assert.equal((await relay.status(first.delivery.deliveryId)).ok, true)
    assert.notEqual(second.taskId, voice.taskId)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a concurrent second handle cannot duplicate the single submit', async () => {
  const { sandbox, backend, relay, handoff } = await setup()
  try {
    const ensured = await relay.ensureDelivery(handoff())
    const other = await openUnifiedRelay({ sandbox, backend, targets: [TARGET, TARGET_B], now: () => RELAY_NOW })
    const results = await Promise.all([relay.submit(ensured.delivery.deliveryId), other.submit(ensured.delivery.deliveryId)])
    assert.ok(results.some((item) => item.ok === true))
    assert.equal(backend.stats().accepted, 1)
    assert.equal(backend.stats().submitted, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a live same-process submit owner is not recovered by another open', async () => {
  const { sandbox, backend, relay, handoff } = await setup({ backendOptions: { failMode: 'defer' } })
  try {
    const ensured = await relay.ensureDelivery(handoff())
    const running = relay.submit(ensured.delivery.deliveryId)
    let state = null
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const probe = await relay.status(ensured.delivery.deliveryId)
      state = probe.ok ? probe.delivery.state : null
      // Only release once the Fake backend is really inside its deferred call (a release before the
      // call would be a test-side lost wake-up, not an owner-liveness observation).
      if (state === RELAY_STATES.SUBMITTING && backend.stats().submitted === 1 && backend.stats().deliveries === 0) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.equal(state, RELAY_STATES.SUBMITTING)
    assert.equal(backend.stats().submitted, 1)
    const other = await openUnifiedRelay({ sandbox, backend, targets: [TARGET, TARGET_B], now: () => RELAY_NOW })
    assert.equal(other.ok, true)
    assert.equal(other.recovered.includes(ensured.delivery.deliveryId), false)
    const live = await other.status(ensured.delivery.deliveryId)
    assert.equal(live.delivery.state, RELAY_STATES.SUBMITTING)
    const duplicate = await other.submit(ensured.delivery.deliveryId)
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.code, RELAY_ERRORS.STORE_BUSY)
    backend.releaseDeferred()
    const result = await running
    assert.equal(result.ok, true)
    assert.equal(result.delivery.state, RELAY_STATES.ACCEPTED)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a real child-process exit leaves SUBMITTING as UNKNOWN, no replay', async () => {
  const { sandbox, relay, handoff } = await setup()
  try {
    const ensured = await relay.ensureDelivery(handoff())
    const deliveryId = ensured.delivery.deliveryId
    const storePath = JSON.stringify(sandbox.root + '/unified-relay-v1.json')
    const code = `
      import fs from 'node:fs';
      const file = ${storePath};
      const store = JSON.parse(fs.readFileSync(file, 'utf8'));
      const record = store.deliveries.find((item) => item.deliveryId === ${JSON.stringify(deliveryId)});
      record.state = 'SUBMITTING';
      record.owner = { token: 'child-' + process.pid, pid: process.pid, host: 'child', at: new Date().toISOString() };
      fs.writeFileSync(file, JSON.stringify(store) + '\\n');
    `
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore', windowsHide: true })
    const exited = new Promise((resolve) => child.once('exit', resolve))
    await exited
    const reopened = await openUnifiedRelay({ sandbox, targets: [TARGET, TARGET_B], backend: createFakeDeliveryBackend({ targets: [TARGET] }), now: () => RELAY_NOW })
    assert.equal(reopened.ok, true)
    assert.ok(reopened.recovered.includes(deliveryId))
    const status = await reopened.status(deliveryId)
    assert.equal(status.delivery.state, RELAY_STATES.UNKNOWN)
    const replay = await reopened.submit(deliveryId)
    assert.equal(replay.ok, false)
    assert.equal(replay.code, RELAY_ERRORS.UNKNOWN_NO_RESEND)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('the component view is one 鲸递 unit with legacy aliases and no second install store', () => {
  const view = projectUnifiedRelayComponent({
    whaleRelay: { state: 'VERIFIED' },
    voiceSender: { state: 'MISSING' },
  })
  assert.equal(view.id, 'whale-relay')
  assert.equal(view.installAsOneUnit, true)
  assert.equal(view.secondInstallStore, false)
  assert.deepEqual(view.legacyAliases, ['whale-relay', 'voice-sender'])
  assert.equal(view.internalModules.length, 2)
  assert.equal(view.state, 'MISSING')
  assert.equal(view.realReady, false)
})
