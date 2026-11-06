/* 177 / Plan 13-A — a saved Provider generation result is delivered only through the separate
 * persisted confirmation permit.
 *
 * Every case starts from a real saved Provider generation result produced by the existing Core
 * generation/save chain (`openPresetGenerationApp` over the real Task catalog/owner, Artifact library
 * and Provider coordinator) in a temporary Fixture sandbox, then lets the unified relay re-read that
 * same persisted relation. No hand-written task/artifact record is ever used as proof.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { openFixtureTaskOwner } from '../core/audio/task-owner.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import {
  RELAY_ERRORS,
  RELAY_STATES,
  createFakeDeliveryBackend,
  openUnifiedRelay,
} from '../core/audio/relay-core-offline.mjs'
import { openPresetGenerationApp } from '../core/preset-generation-app.mjs'
import { createVoiceSavedTask, mutableClock, readRelayStore } from './support/relay-authority.mjs'

const SCOPE = 'scope:fixture-relay-provider'
const PROOF = 'fixture-rights:relay-provider'
const VOICES = Object.freeze([{ id: 'demo-voice-a', label: '示例女声 A', languages: ['zh-CN'] }])
const PROVIDER_FACTS = Object.freeze({
  providerId: 'qwen3-tts',
  instanceId: 'instance-1',
  model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
  backend: 'fixture',
})
const T0 = '2026-11-06T10:00:00.000Z'
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

/* 250 ms of deterministic 24 kHz / mono / PCM16 samples: inside the provider output limits. */
function fixtureSpeechBytes() {
  const samples = new Array(6000)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(Math.sin((2 * Math.PI * 220 * index) / 24000) * 3000)
  }
  return wavFromSamples(samples, 24000)
}

function createMockProvider() {
  return {
    async beginSynthesis() {
      const requestId = 'mock-qwen-request'
      return {
        ok: true,
        requestId,
        result: Promise.resolve({
          ok: true,
          providerId: 'qwen3-tts',
          requestId,
          bytes: fixtureSpeechBytes(),
        }),
        cancel: async () => ({ ok: true }),
      }
    },
  }
}

/** One saved Provider generation result written by the real generation entry (never hand-built). */
async function createSavedResult(sandbox, clock, text) {
  const opened = await openPresetGenerationApp({
    sandbox,
    provider: createMockProvider(),
    scopeId: SCOPE,
    rightsProofRef: PROOF,
    voices: VOICES,
    textLimit: 200,
    providerFacts: PROVIDER_FACTS,
    now: clock.now,
  })
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const generated = await opened.value.generate({ text, voiceId: 'demo-voice-a', language: 'zh-CN' })
  assert.equal(generated.ok, true, JSON.stringify(generated))
  assert.equal(generated.state, 'SAVED')
  return generated
}

async function openRelay(sandbox, clock, options = {}) {
  const backend = options.backend || createFakeDeliveryBackend({ targets: options.backendTargets || [TARGET, TARGET_B] })
  const relay = await openUnifiedRelay({
    sandbox,
    backend,
    targets: options.targets || [TARGET, TARGET_B],
    now: clock.now,
    maxDeliveries: options.maxDeliveries,
    maxPermits: options.maxPermits,
  })
  assert.equal(relay.ok, true, JSON.stringify(relay))
  return { relay, backend }
}

function handoff(saved, { targetId = TARGET.targetId, requestKey = 'provider-request-1', permitId, proofRef = PROOF } = {}) {
  const envelope = {
    schemaVersion: 1,
    scopeId: SCOPE,
    taskId: saved.taskId,
    artifactRef: saved.artifactRef,
    targetId,
    requestKey,
    rights: { state: 'GRANTED', proofRef },
  }
  if (permitId) envelope.permitId = permitId
  return { handoff: envelope }
}

function permitEnvelope(saved, { targetId = TARGET.targetId } = {}) {
  return {
    permit: {
      schemaVersion: 1,
      scopeId: SCOPE,
      taskId: saved.taskId,
      artifactRef: saved.artifactRef,
      targetId,
      rights: { state: 'GRANTED', proofRef: PROOF },
    },
  }
}

test('177 a saved Provider generation result is not a delivery permission by itself', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const saved = await createSavedResult(sandbox, clock, '第一份隔离生成，保存本身不投递。')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true, JSON.stringify(owner))
    const got = await owner.value.get({ schemaVersion: 1, scopeId: SCOPE, taskId: saved.taskId })
    assert.equal(got.ok, true, JSON.stringify(got))
    assert.equal(got.value.task.deliveryRequested, false)
    const { relay, backend } = await openRelay(sandbox, clock)
    const unconfirmed = await relay.ensureDelivery(handoff(saved))
    assert.equal(unconfirmed.ok, false)
    assert.equal(unconfirmed.code, RELAY_ERRORS.PERMIT_REQUIRED)
    assert.equal(backend.stats().submitted, 0)
    assert.equal(readRelayStore(sandbox.root), null)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('177 a separately confirmed saved Provider result is accepted once and repeats reuse it', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const saved = await createSavedResult(sandbox, clock, '第二份隔离生成，确认后投递一次。')
    const { relay, backend } = await openRelay(sandbox, clock)
    const issued = await relay.issueDeliveryPermit(permitEnvelope(saved))
    assert.equal(issued.ok, true, JSON.stringify(issued))
    assert.equal(issued.outcome, 'ISSUED')
    assert.equal(issued.permit.authorityKind, 'PROVIDER_OWNER_SAVED_V2')
    assert.match(issued.permit.permitId, /^permit:[0-9a-f]{32}$/)
    const again = await relay.issueDeliveryPermit(permitEnvelope(saved))
    assert.equal(again.outcome, 'EXISTING')
    assert.equal(again.permit.permitId, issued.permit.permitId)
    const ensured = await relay.ensureDelivery(handoff(saved, { permitId: issued.permit.permitId }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    assert.equal(ensured.outcome, 'CREATED')
    assert.equal(ensured.delivery.taskId, saved.taskId)
    assert.equal(ensured.delivery.artifactRef, saved.artifactRef)
    assert.equal(ensured.delivery.authority, 'PROVIDER_OWNER_SAVED_V2')
    assert.equal(ensured.delivery.deliveryRequested, false)
    assert.equal(ensured.delivery.permitId, issued.permit.permitId)
    assert.equal(ensured.delivery.state, RELAY_STATES.QUEUED)
    const first = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(first.delivery.backendState, 'QUEUED')
    assert.match(first.delivery.receiptId, /^fixture-receipt-/)
    assert.equal(backend.stats().submitted, 1)
    assert.equal(backend.stats().accepted, 1)
    const duplicate = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(duplicate.ok, true)
    assert.equal(duplicate.outcome, 'EXISTING')
    assert.equal(backend.stats().submitted, 1)
    // A changed request key is only an alias; a reopened store reuses the same delivery and never
    // asks the Fake backend a second time.
    const reopened = await openUnifiedRelay({ sandbox, backend, targets: [TARGET, TARGET_B], now: clock.now })
    assert.equal(reopened.ok, true, JSON.stringify(reopened))
    const alias = await reopened.ensureDelivery(handoff(saved, {
      permitId: issued.permit.permitId, requestKey: 'provider-request-1-alias',
    }))
    assert.equal(alias.ok, true, JSON.stringify(alias))
    assert.equal(alias.outcome, 'EXISTING')
    assert.equal(alias.delivery.deliveryId, ensured.delivery.deliveryId)
    const replay = await reopened.submit(ensured.delivery.deliveryId)
    assert.equal(replay.ok, true)
    assert.equal(replay.outcome, 'EXISTING')
    assert.equal(backend.stats().submitted, 1)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.deliveries.length, 1)
    assert.equal(store.permits.length, 1)
    assert.equal(store.deliveries[0].intent.authorizedBy, 'PERSISTED_PROVIDER_DELIVERY_PERMIT')
    assert.equal(store.deliveries[0].intent.deliveryRequested, false)
    // The delivery referenced the already-saved original task; no second task was created.
    const owner = await openFixtureTaskOwner({ sandbox })
    const listed = await owner.value.listSaved({ schemaVersion: 1, scopeId: SCOPE })
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.equal(listed.value.results.length, 1)
    assert.equal(listed.value.results[0].taskId, saved.taskId)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('177 a confirmation is bound to its own task and target and never widens another relation', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const savedA = await createSavedResult(sandbox, clock, '第三份隔离生成，确认 A。')
    const savedB = await createSavedResult(sandbox, clock, '第四份隔离生成，未确认 B。')
    const { relay, backend } = await openRelay(sandbox, clock)
    const issuedA = await relay.issueDeliveryPermit(permitEnvelope(savedA))
    assert.equal(issuedA.ok, true, JSON.stringify(issuedA))
    const unconfirmedB = await relay.ensureDelivery(handoff(savedB))
    assert.equal(unconfirmedB.ok, false)
    assert.equal(unconfirmedB.code, RELAY_ERRORS.PERMIT_REQUIRED)
    const wrongTask = await relay.ensureDelivery(handoff(savedB, { permitId: issuedA.permit.permitId }))
    assert.equal(wrongTask.ok, false)
    assert.equal(wrongTask.code, RELAY_ERRORS.PERMIT_REQUIRED)
    const wrongTarget = await relay.ensureDelivery(handoff(savedA, {
      targetId: TARGET_B.targetId, permitId: issuedA.permit.permitId, requestKey: 'provider-wrong-target',
    }))
    assert.equal(wrongTarget.ok, false)
    assert.equal(wrongTarget.code, RELAY_ERRORS.PERMIT_REQUIRED)
    // A confirmation does not survive a revoked rights proof either.
    const revokedRights = await relay.ensureDelivery(handoff(savedA, {
      permitId: issuedA.permit.permitId, requestKey: 'provider-rights-revoked', proofRef: 'fixture-rights:other',
    }))
    assert.equal(revokedRights.ok, false)
    assert.equal(revokedRights.code, RELAY_ERRORS.TASK_NOT_SAVED)
    // A target the Core directory does not authorize cannot be confirmed at all.
    const unauthorized = await openUnifiedRelay({
      sandbox, backend, targets: [{ ...TARGET, authorized: false }], now: clock.now,
    })
    const rejected = await unauthorized.issueDeliveryPermit(permitEnvelope(savedA))
    assert.equal(rejected.ok, false)
    assert.equal(rejected.code, RELAY_ERRORS.TARGET_REJECTED)
    // After confirmation, a revoked Core target refuses the delivery without any backend submit.
    const revoked = await openUnifiedRelay({ sandbox, backend, targets: [], now: clock.now })
    const revokedResult = await revoked.ensureDelivery(handoff(savedA, {
      permitId: issuedA.permit.permitId, requestKey: 'provider-revoked',
    }))
    assert.equal(revokedResult.ok, false)
    assert.equal(revokedResult.code, RELAY_ERRORS.TARGET_REJECTED)
    assert.equal(backend.stats().submitted, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('177 a caller record is never an authority and a gone saved result fails honestly', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const saved = await createSavedResult(sandbox, clock, '第五份隔离生成，用于失败分支。')
    const { relay, backend } = await openRelay(sandbox, clock)
    const forged = await relay.ensureDelivery({
      handoff: {
        ...handoff(saved).handoff,
        taskRecord: { taskId: saved.taskId, deliveryRequested: true, state: 'SAVED' },
      },
    })
    assert.equal(forged.ok, false)
    assert.equal(forged.code, RELAY_ERRORS.INPUT_INVALID)
    assert.equal(forged.detail, 'taskRecord')
    const issued = await relay.issueDeliveryPermit(permitEnvelope(saved))
    assert.equal(issued.ok, true, JSON.stringify(issued))
    const library = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(library.ok, true, JSON.stringify(library))
    const deleted = await library.value.delete({
      schemaVersion: 1, scopeId: SCOPE, artifactRef: saved.artifactRef, now: clock.now(),
    })
    assert.equal(deleted.ok, true, JSON.stringify(deleted))
    const unavailable = await relay.ensureDelivery(handoff(saved, { permitId: issued.permit.permitId }))
    assert.equal(unavailable.ok, false)
    assert.equal(unavailable.code, RELAY_ERRORS.TASK_NOT_SAVED)
    assert.equal(backend.stats().submitted, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('177 a still-readable Provider result older than the recorded 24 h is confirmed and accepted', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const saved = await createSavedResult(sandbox, clock, '第六份隔离生成，超过记录的 24 小时后仍可读。')
    clock.set('2026-11-13T11:00:00.000Z')
    const { relay, backend } = await openRelay(sandbox, clock)
    const issued = await relay.issueDeliveryPermit(permitEnvelope(saved))
    assert.equal(issued.ok, true, JSON.stringify(issued))
    assert.equal(Date.parse(issued.permit.rightsExpiresAt) < Date.parse(clock.now()), true)
    const ensured = await relay.ensureDelivery(handoff(saved, { permitId: issued.permit.permitId }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(backend.stats().accepted, 1)
    // A separate store still enforces the real expiry of a Fixture-import artifact.
    const voiceSandbox = createConfigSandbox()
    try {
      const voice = await createVoiceSavedTask(voiceSandbox, {
        now: T0, saveNow: '2026-11-06T10:00:01.000Z', expiresAt: '2026-11-12T12:00:00.000Z', proofRef: PROOF,
      })
      const voiceRelay = await openUnifiedRelay({
        sandbox: voiceSandbox,
        backend: createFakeDeliveryBackend({ targets: [TARGET] }),
        targets: [TARGET],
        now: clock.now,
      })
      const expired = await voiceRelay.ensureDelivery({
        handoff: {
          schemaVersion: 1, scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
          targetId: TARGET.targetId, requestKey: 'provider-real-expiry',
          rights: { state: 'GRANTED', proofRef: PROOF },
        },
      })
      assert.equal(expired.ok, false)
      assert.equal(expired.code, RELAY_ERRORS.TASK_NOT_SAVED)
    } finally {
      removeConfigSandbox(voiceSandbox)
    }
    assert.equal(backend.stats().submitted, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('177 bounded confirmation and delivery capacity fail closed without a false success', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const savedA = await createSavedResult(sandbox, clock, '第七份隔离生成，容量 A。')
    const savedB = await createSavedResult(sandbox, clock, '第八份隔离生成，容量 B。')
    const limitedPermits = await openUnifiedRelay({
      sandbox, backend: createFakeDeliveryBackend({ targets: [TARGET] }), targets: [TARGET],
      now: clock.now, maxPermits: 1,
    })
    const first = await limitedPermits.issueDeliveryPermit(permitEnvelope(savedA))
    assert.equal(first.ok, true, JSON.stringify(first))
    const second = await limitedPermits.issueDeliveryPermit(permitEnvelope(savedB))
    assert.equal(second.ok, false)
    assert.equal(second.code, RELAY_ERRORS.CAPACITY)
    const withoutPermit = await limitedPermits.ensureDelivery(handoff(savedB))
    assert.equal(withoutPermit.ok, false)
    assert.equal(withoutPermit.code, RELAY_ERRORS.PERMIT_REQUIRED)
    const limitedDeliveries = await openUnifiedRelay({
      sandbox, backend: createFakeDeliveryBackend({ targets: [TARGET] }), targets: [TARGET],
      now: clock.now, maxDeliveries: 1,
    })
    const permitB = await limitedDeliveries.issueDeliveryPermit(permitEnvelope(savedB))
    assert.equal(permitB.ok, true, JSON.stringify(permitB))
    const ensuredA = await limitedDeliveries.ensureDelivery(handoff(savedA, {
      permitId: first.permit.permitId, requestKey: 'provider-capacity-a',
    }))
    assert.equal(ensuredA.ok, true, JSON.stringify(ensuredA))
    const full = await limitedDeliveries.ensureDelivery(handoff(savedB, {
      permitId: permitB.permit.permitId, requestKey: 'provider-capacity-b',
    }))
    assert.equal(full.ok, false)
    assert.equal(full.code, RELAY_ERRORS.CAPACITY)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.permits.length, 2)
    assert.equal(store.deliveries.length, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('177 an unknown backend result for the confirmed Provider source stays UNKNOWN without resend', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const saved = await createSavedResult(sandbox, clock, '第九份隔离生成，后端结果不确定。')
    const backend = createFakeDeliveryBackend({ targets: [TARGET], failMode: 'unknown' })
    const { relay } = await openRelay(sandbox, clock, { backend, targets: [TARGET] })
    const issued = await relay.issueDeliveryPermit(permitEnvelope(saved))
    assert.equal(issued.ok, true, JSON.stringify(issued))
    const ensured = await relay.ensureDelivery(handoff(saved, { permitId: issued.permit.permitId }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.UNKNOWN)
    const replay = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(replay.ok, false)
    assert.equal(replay.code, RELAY_ERRORS.UNKNOWN_NO_RESEND)
    assert.equal(backend.stats().accepted, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
