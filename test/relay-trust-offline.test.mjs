/* 137-TRUST-01 / 137-TRUST-02 — trusted persisted task authority + independent Worker gate.
 *
 * Every positive case starts from a *real* persisted SAVED task (Voice legacy owner save, or Singing
 * Cover save) and reaches the Fake Worker through the same relay relation. No test ever hands a
 * hand-written "SAVED record" to the relay as proof.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import {
  RELAY_ERRORS,
  RELAY_STATES,
  createFakeDeliveryBackend,
  openUnifiedRelay,
} from '../core/audio/relay-core-offline.mjs'
import {
  createSingingSavedTask,
  createVoiceSavedTask,
  mutableClock,
  relayHandoff,
} from './support/relay-authority.mjs'

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
const VOICE_NOW = '2026-10-27T00:00:02.000Z'
const VOICE_EXPIRES = '2026-10-28T00:00:00.000Z'
const VOICE_PROOF = 'fixture-rights:relay-demo'
const SINGING_NOW = '2026-11-01T00:00:02.000Z'
const SINGING_EXPIRES = '2026-11-02T00:00:00.000Z'
const SINGING_PROOF = 'fixture-rights:relay-singing'

function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  return Promise.resolve().then(() => fn(sandbox)).finally(() => removeConfigSandbox(sandbox))
}

function targetGate(overrides = {}) {
  return createFakeDeliveryBackend({
    targets: [TARGET, TARGET_B].map((target) => ({ ...target, ...overrides })),
  })
}

test('TRUST-01 Voice: a real persisted SAVED task reaches the Fake chain once', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: VOICE_EXPIRES, proofRef: VOICE_PROOF,
    })
    const clock = mutableClock(VOICE_NOW)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET], now: clock.now })
    assert.equal(relay.ok, true, JSON.stringify(relay))
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'voice-request-1', proofRef: VOICE_PROOF,
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    assert.equal(ensured.outcome, 'CREATED')
    assert.equal(ensured.delivery.authority, 'TASK_OWNER_SAVED_V2')
    assert.equal(ensured.delivery.deliveryRequested, true)
    assert.match(ensured.delivery.intentId, /^intent:[0-9a-f]{32}$/)
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(backend.stats().submitted, 1)
    assert.equal(backend.stats().accepted, 1)
    assert.equal(backend.stats().targetChecks >= 1, true)
    const store = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'unified-relay-v1.json'), 'utf8'))
    const record = store.deliveries[0]
    assert.equal(record.intent.kind, 'TASK_OWNER_SAVED_V2')
    assert.equal(record.intent.deliveryRequested, true)
    assert.equal(record.intent.authorizedBy, 'PERSISTED_TASK_DELIVERY_INTENT')
    assert.equal(record.backendRequestId.includes(':'), false)
  })
})

test('TRUST-01 Singing: a frozen Cover SAVED record reaches the Fake chain through the persisted issuance', async () => {
  await withSandbox(async (sandbox) => {
    const singing = await createSingingSavedTask(sandbox, {
      now: '2026-11-01T00:00:00.000Z', expiresAt: SINGING_EXPIRES, proofRef: SINGING_PROOF,
    })
    // The frozen v3 Cover record still says deliveryRequested:false; the relay never edits it.
    const ownerFile = ['audio-cover-owner-v3.json', 'audio-task-owner-v1.json']
      .map((name) => path.join(sandbox.root, name))
      .find((file) => fs.existsSync(file))
    assert.ok(ownerFile, 'cover owner store missing')
    assert.match(fs.readFileSync(ownerFile, 'utf8'), /"deliveryRequested":false/)
    const clock = mutableClock(SINGING_NOW)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET], now: clock.now })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: singing.scopeId, taskId: singing.taskId, artifactRef: singing.artifactRef,
      targetId: TARGET.targetId, requestKey: 'singing-request-1', proofRef: SINGING_PROOF,
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    assert.equal(ensured.delivery.authority, 'COVER_OWNER_SAVED_V3')
    assert.equal(ensured.delivery.deliveryRequested, false)
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(backend.stats().accepted, 1)
    const store = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'unified-relay-v1.json'), 'utf8'))
    assert.equal(store.deliveries[0].intent.authorizedBy, 'RELAY_ISSUED_FOR_FROZEN_COVER')
    // The MASTER is the delivery artifact; the source input can never be substituted for it.
    assert.equal(store.deliveries[0].artifactRef, singing.artifactRef)
    assert.notEqual(singing.sourceRef, singing.artifactRef)
  })
})

test('TRUST-01 refusals: no store, no SAVED relation, no persisted intent, no source substitution', async () => {
  // (a) A sandbox with no persisted task at all can never produce a delivery from a JSON record.
  await withSandbox(async (sandbox) => {
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET], now: () => VOICE_NOW })
    const result = await relay.ensureDelivery(relayHandoff({
      scopeId: 'scope:fixture-demo', taskId: 'task:fixture-' + 'a'.repeat(32),
      artifactRef: 'artifact:fixture-bytes-' + 'b'.repeat(32),
      targetId: TARGET.targetId, requestKey: 'ghost-request', proofRef: VOICE_PROOF,
    }))
    assert.equal(result.ok, false)
    assert.equal(result.code, RELAY_ERRORS.TASK_NOT_SAVED)
    assert.equal(backend.stats().submitted, 0)
  })

  // (b) A real Voice task saved with deliveryRequested:false cannot be flipped by a caller copy.
  await withSandbox(async (sandbox) => {
    const frozen = await createVoiceSavedTask(sandbox, {
      idempotencyKey: 'key:fixture-relay-frozen', saveRequestKey: 'save:relay-frozen',
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z',
      expiresAt: VOICE_EXPIRES, proofRef: VOICE_PROOF, deliveryRequested: false,
    })
    const relay = await openUnifiedRelay({
      sandbox, backend: createFakeDeliveryBackend({ targets: [TARGET] }), targets: [TARGET], now: () => VOICE_NOW,
    })
    const withCopy = await relay.ensureDelivery({
      handoff: {
        schemaVersion: 1, scopeId: frozen.scopeId, taskId: frozen.taskId, artifactRef: frozen.artifactRef,
        targetId: TARGET.targetId, requestKey: 'frozen-request', rights: { state: 'GRANTED', proofRef: VOICE_PROOF },
        taskRecord: { ...frozen.saved.value.task, deliveryRequested: true, state: 'SAVED', outputArtifactRef: frozen.artifactRef },
      },
    })
    assert.equal(withCopy.ok, false)
    assert.equal(withCopy.code, RELAY_ERRORS.INPUT_INVALID)
    assert.equal(withCopy.detail, 'taskRecord')
    const stillFrozen = await relay.ensureDelivery(relayHandoff({
      scopeId: frozen.scopeId, taskId: frozen.taskId, artifactRef: frozen.artifactRef,
      targetId: TARGET.targetId, requestKey: 'frozen-request', proofRef: VOICE_PROOF,
    }))
    assert.equal(stillFrozen.ok, false)
    assert.equal(stillFrozen.code, RELAY_ERRORS.TASK_NOT_SAVED)
    assert.equal(stillFrozen.detail, 'delivery intent')
  })

  // (c) A real Cover SAVED MASTER cannot be replaced by the source input reference.
  await withSandbox(async (sandbox) => {
    const singing = await createSingingSavedTask(sandbox, {
      now: '2026-11-01T00:00:00.000Z', expiresAt: SINGING_EXPIRES, proofRef: SINGING_PROOF,
    })
    const relay = await openUnifiedRelay({
      sandbox, backend: createFakeDeliveryBackend({ targets: [TARGET] }), targets: [TARGET], now: () => SINGING_NOW,
    })
    const asSource = await relay.ensureDelivery(relayHandoff({
      scopeId: singing.scopeId, taskId: singing.taskId, artifactRef: singing.sourceRef,
      targetId: TARGET.targetId, requestKey: 'singing-source-request', proofRef: SINGING_PROOF,
    }))
    assert.equal(asSource.ok, false)
    assert.equal(asSource.code, RELAY_ERRORS.TASK_NOT_SAVED)
    const wrongScope = await relay.ensureDelivery(relayHandoff({
      scopeId: 'scope:fixture-other', taskId: singing.taskId, artifactRef: singing.artifactRef,
      targetId: TARGET.targetId, requestKey: 'singing-scope-request', proofRef: SINGING_PROOF,
    }))
    assert.equal(wrongScope.ok, false)
    assert.equal(wrongScope.code, RELAY_ERRORS.TASK_NOT_SAVED)
  })
})

test('TRUST-01 freshness: artifact deleted during an awaited preflight is never accepted', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: VOICE_EXPIRES, proofRef: VOICE_PROOF,
    })
    const clock = mutableClock(VOICE_NOW)
    const base = createFakeDeliveryBackend({ targets: [TARGET] })
    let deleted = null
    const backend = {
      id: base.id,
      health: () => base.health(),
      capabilities: () => base.capabilities(),
      resolveTarget: async (args) => {
        const library = await openFixtureArtifactLibrary({ sandbox })
        deleted = await library.value.delete({
          schemaVersion: 1, scopeId: voice.scopeId, artifactRef: voice.artifactRef, now: clock.now(),
        })
        return base.resolveTarget(args)
      },
      submit: (args) => base.submit(args),
    }
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET], now: clock.now })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'fresh-delete', proofRef: VOICE_PROOF,
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(deleted && deleted.ok, true)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.FAILED)
    assert.equal(base.stats().submitted, 0, 'a revoked artifact must never reach Fake submit')
    assert.equal(base.stats().accepted, 0)
  })
})

test('TRUST-01 freshness: expiry reached during an awaited preflight is never accepted', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: VOICE_EXPIRES, proofRef: VOICE_PROOF,
    })
    const clock = mutableClock(VOICE_NOW)
    const base = createFakeDeliveryBackend({ targets: [TARGET] })
    const backend = {
      id: base.id,
      health: () => base.health(),
      capabilities: () => base.capabilities(),
      resolveTarget: async (args) => {
        clock.set(VOICE_EXPIRES) // exactly at expiry while the preflight is awaiting
        return base.resolveTarget(args)
      },
      submit: (args) => base.submit(args),
    }
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET], now: clock.now })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'fresh-expiry', proofRef: VOICE_PROOF,
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.FAILED)
    assert.equal(base.stats().submitted, 0)
    assert.equal(base.stats().accepted, 0)
  })
})

test('TRUST-02 the Fake Worker reads its own directory, never the upstream booleans', async () => {
  const deliveries = [
    { deliveryId: 'delivery:' + '1'.repeat(32), targetId: TARGET.targetId, targetKind: TARGET.kind, backendId: 'fake-relay' },
    { deliveryId: 'delivery:' + '2'.repeat(32), targetId: TARGET_B.targetId, targetKind: TARGET_B.kind, backendId: 'fake-relay' },
  ]
  const artifact = { artifactRef: 'artifact:fixture-bytes-' + 'a'.repeat(32), sha256: 'b'.repeat(64), byteLength: 4096, durationMs: 100, format: 'WAV' }
  const upstream = { ...TARGET, authorized: true, allowlisted: true, identityVerified: true, bridgeAllowed: true, workerAllowed: true }

  const cases = [
    { name: 'empty directory', backend: createFakeDeliveryBackend({ targets: [] }), delivery: deliveries[0], target: upstream },
    { name: 'directory not authorized', backend: targetGate({ authorized: false, allowlisted: false }), delivery: deliveries[0], target: upstream },
    { name: 'directory identity unverified', backend: targetGate({ identityVerified: false }), delivery: deliveries[0], target: upstream },
    { name: 'directory bridge closed', backend: targetGate({ bridgeAllowed: false }), delivery: deliveries[0], target: upstream },
    { name: 'directory worker closed', backend: targetGate({ workerAllowed: false }), delivery: deliveries[0], target: upstream },
    { name: 'directory kind is GROUP', backend: targetGate({ kind: 'GROUP' }), delivery: deliveries[0], target: upstream },
    { name: 'delivery bound to another backend', backend: createFakeDeliveryBackend({ targets: [TARGET] }), delivery: { ...deliveries[0], backendId: 'other-backend' }, target: upstream },
    { name: 'caller target is another id', backend: createFakeDeliveryBackend({ targets: [TARGET, TARGET_B] }), delivery: deliveries[0], target: { ...upstream, targetId: TARGET_B.targetId } },
    { name: 'caller target widens a revoked directory', backend: createFakeDeliveryBackend({ targets: [{ ...TARGET, authorized: false }] }), delivery: deliveries[0], target: upstream },
  ]
  for (const item of cases) {
    const result = await item.backend.submit({ delivery: item.delivery, artifact, target: item.target })
    assert.equal(result.ok, false, item.name)
    assert.equal(result.preSubmit, true, item.name)
    assert.equal(result.code, RELAY_ERRORS.TARGET_REJECTED, item.name)
    const stats = item.backend.stats()
    assert.equal(stats.accepted, 0, item.name)
    assert.ok(stats.targetChecks >= 1, item.name)
  }

  const accepted = await createFakeDeliveryBackend({ targets: [TARGET] }).submit({ delivery: deliveries[0], artifact, target: upstream })
  assert.equal(accepted.ok, true)
  assert.equal(accepted.accepted, true)
})

test('TRUST-02 a full Core chain with a revoked Worker directory and a handed-over resolver still fails closed', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: VOICE_EXPIRES, proofRef: VOICE_PROOF,
    })
    const fake = createFakeDeliveryBackend({ targets: [{ ...TARGET, authorized: false, allowlisted: false }] })
    const wrapper = {
      id: fake.id,
      health: () => fake.health(),
      capabilities: () => fake.capabilities(),
      // A faulty/old resolver hands back a fully "granted" descriptor; it may not grant anything.
      resolveTarget: async () => ({ ok: true, value: { ...TARGET } }),
      submit: (args) => fake.submit(args),
    }
    const relay = await openUnifiedRelay({ sandbox, backend: wrapper, targets: [TARGET], now: () => VOICE_NOW })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'revoked-worker', proofRef: VOICE_PROOF,
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.FAILED)
    assert.equal(submitted.delivery.error.code, RELAY_ERRORS.TARGET_REJECTED)
    assert.equal(fake.stats().accepted, 0)
    assert.equal(fake.stats().submitted, 1)
    assert.equal(fake.stats().targetChecks >= 1, true)
  })
})

test('TRUST-02 the Worker gate still accepts a fully trusted directory entry', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: VOICE_EXPIRES, proofRef: VOICE_PROOF,
    })
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET], now: () => VOICE_NOW })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'trusted-worker', proofRef: VOICE_PROOF,
    }))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(backend.stats().accepted, 1)
    assert.equal(backend.stats().targetChecks >= 2, true)
  })
})
