/* 178 / Plan 13-A — the unified relay reads the original task from the storage segment that holds
 * it, through the generation application's trusted locator.
 *
 * Every case builds real base and rotated segments with the existing generation/save chain in a
 * temporary Fixture sandbox; the delivery caller only names the original task and a confirmed target,
 * never a storage path or artifact facts.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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
import { mutableClock, readRelayStore } from './support/relay-authority.mjs'

const SCOPE = 'scope:fixture-relay-segments'
const PROOF = 'fixture-rights:relay-segments'
const VOICES = Object.freeze([{ id: 'demo-voice-a', label: '示例女声 A', languages: ['zh-CN'] }])
const PROVIDER_FACTS = Object.freeze({
  providerId: 'qwen3-tts',
  instanceId: 'instance-1',
  model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
  backend: 'fixture',
})
const T0 = '2026-11-06T10:00:00.000Z'
/* 178 saves one more than the unchanged per-segment entry threshold (24), so the last result really
 * lives in `segments/0001` and the earlier ones stay in the base segment. */
const BASE_COUNT = 24
const TOTAL_COUNT = 26
const TARGET = {
  targetId: 'fixture-private-a',
  kind: 'PRIVATE',
  authorized: true,
  allowlisted: true,
  identityVerified: true,
  bridgeAllowed: true,
  workerAllowed: true,
}

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

async function openGenerationApp(sandbox, clock) {
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
  return opened.value
}

/** The real generation/save chain: base segment first, then the rotated `segments/0001` store. */
async function generateSavedResults(app, count) {
  const results = []
  for (let index = 0; index < count; index += 1) {
    const generated = await app.generate({
      text: '第' + (index + 1) + '份隔离生成，用于跨分段来源。',
      voiceId: 'demo-voice-a',
      language: 'zh-CN',
    })
    assert.equal(generated.ok, true, JSON.stringify(generated))
    assert.equal(generated.state, 'SAVED')
    results.push(generated)
  }
  assert.equal(results.length, TOTAL_COUNT)
  return results
}

async function openRelay(sandbox, clock, locateTask, options = {}) {
  const backend = options.backend || createFakeDeliveryBackend({ targets: [TARGET] })
  const relay = await openUnifiedRelay({
    sandbox,
    backend,
    targets: [TARGET],
    now: clock.now,
    locateTask,
    maxDeliveries: options.maxDeliveries,
    maxPermits: options.maxPermits,
  })
  assert.equal(relay.ok, true, JSON.stringify(relay))
  return { relay, backend }
}

function permitEnvelope(result) {
  return {
    permit: {
      schemaVersion: 1,
      scopeId: SCOPE,
      taskId: result.taskId,
      artifactRef: result.artifactRef,
      targetId: TARGET.targetId,
      rights: { state: 'GRANTED', proofRef: PROOF },
    },
  }
}

function handoff(result, { requestKey, permitId } = {}) {
  const envelope = {
    schemaVersion: 1,
    scopeId: SCOPE,
    taskId: result.taskId,
    artifactRef: result.artifactRef,
    targetId: TARGET.targetId,
    requestKey: requestKey || 'relay-segment-' + result.taskId.slice('task:fixture-'.length, 'task:fixture-'.length + 12),
    rights: { state: 'GRANTED', proofRef: PROOF },
  }
  if (permitId) envelope.permitId = permitId
  return { handoff: envelope }
}

test('178 a base-segment and a rotated-segment result reach the same relay owner once', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const app = await openGenerationApp(sandbox, clock)
    const results = await generateSavedResults(app, TOTAL_COUNT)
    const baseResult = results[0]
    const rotatedResult = results[TOTAL_COUNT - 1]
    assert.ok(fs.existsSync(path.join(sandbox.root, 'segments', '0001')))
    const baseOwner = await openFixtureTaskOwner({ sandbox })
    assert.equal(baseOwner.ok, true, JSON.stringify(baseOwner))
    assert.equal((await baseOwner.value.get({ schemaVersion: 1, scopeId: SCOPE, taskId: baseResult.taskId })).ok, true)
    assert.equal((await baseOwner.value.get({ schemaVersion: 1, scopeId: SCOPE, taskId: rotatedResult.taskId })).ok, false)
    const located = await app.locateTask({ scopeId: SCOPE, taskId: rotatedResult.taskId })
    assert.equal(located.ok, true, JSON.stringify(located))
    const rotatedOwner = await openFixtureTaskOwner({ sandbox: located.value.sandbox })
    assert.equal(rotatedOwner.ok, true, JSON.stringify(rotatedOwner))
    assert.equal((await rotatedOwner.value.get({ schemaVersion: 1, scopeId: SCOPE, taskId: rotatedResult.taskId })).ok, true)

    const { relay, backend } = await openRelay(sandbox, clock, app.locateTask)
    const basePermit = await relay.issueDeliveryPermit(permitEnvelope(baseResult))
    assert.equal(basePermit.ok, true, JSON.stringify(basePermit))
    const rotatedPermit = await relay.issueDeliveryPermit(permitEnvelope(rotatedResult))
    assert.equal(rotatedPermit.ok, true, JSON.stringify(rotatedPermit))
    for (const [result, permit] of [[baseResult, basePermit], [rotatedResult, rotatedPermit]]) {
      const ensured = await relay.ensureDelivery(handoff(result, { permitId: permit.permit.permitId }))
      assert.equal(ensured.ok, true, JSON.stringify(ensured))
      assert.equal(ensured.outcome, 'CREATED')
      assert.equal(ensured.delivery.taskId, result.taskId)
      const submitted = await relay.submit(ensured.delivery.deliveryId)
      assert.equal(submitted.ok, true, JSON.stringify(submitted))
      assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    }
    assert.equal(backend.stats().submitted, 2)
    assert.equal(backend.stats().accepted, 2)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.deliveries.length, 2)
    assert.equal(store.permits.length, 2)
    // One owner only: the rotated segment holds tasks/artifacts, never a second delivery store.
    assert.equal(readRelayStore(path.join(sandbox.root, 'segments', '0001')), null)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('178 a reopened application and relay still find the old segment result without resubmitting', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const app = await openGenerationApp(sandbox, clock)
    const results = await generateSavedResults(app, TOTAL_COUNT)
    const rotatedResult = results[TOTAL_COUNT - 1]
    const { relay, backend } = await openRelay(sandbox, clock, app.locateTask)
    const issued = await relay.issueDeliveryPermit(permitEnvelope(rotatedResult))
    assert.equal(issued.ok, true, JSON.stringify(issued))
    const ensured = await relay.ensureDelivery(handoff(rotatedResult, { permitId: issued.permit.permitId }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(backend.stats().submitted, 1)

    const reopenedApp = await openGenerationApp(sandbox, clock)
    const locatedAgain = await reopenedApp.locateTask({ scopeId: SCOPE, taskId: rotatedResult.taskId })
    assert.equal(locatedAgain.ok, true, JSON.stringify(locatedAgain))
    const reopened = await openUnifiedRelay({
      sandbox, backend, targets: [TARGET], now: clock.now, locateTask: reopenedApp.locateTask,
    })
    assert.equal(reopened.ok, true, JSON.stringify(reopened))
    const again = await reopened.issueDeliveryPermit(permitEnvelope(rotatedResult))
    assert.equal(again.outcome, 'EXISTING')
    assert.equal(again.permit.permitId, issued.permit.permitId)
    const alias = await reopened.ensureDelivery(handoff(rotatedResult, {
      permitId: issued.permit.permitId, requestKey: 'relay-segment-reopened',
    }))
    assert.equal(alias.ok, true, JSON.stringify(alias))
    assert.equal(alias.outcome, 'EXISTING')
    assert.equal(alias.delivery.deliveryId, ensured.delivery.deliveryId)
    const replay = await reopened.submit(ensured.delivery.deliveryId)
    assert.equal(replay.ok, true)
    assert.equal(replay.outcome, 'EXISTING')
    assert.equal(backend.stats().submitted, 1)
    assert.equal(readRelayStore(sandbox.root).deliveries.length, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('178 a retained rotated result stays confirmable; a missing or deleted one fails honestly', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const app = await openGenerationApp(sandbox, clock)
    const results = await generateSavedResults(app, TOTAL_COUNT)
    const deletedResult = results[BASE_COUNT]
    const retainedResult = results[TOTAL_COUNT - 1]
    const located = await app.locateTask({ scopeId: SCOPE, taskId: deletedResult.taskId })
    assert.equal(located.ok, true, JSON.stringify(located))
    const library = await openFixtureArtifactLibrary({ sandbox: located.value.sandbox })
    assert.equal(library.ok, true, JSON.stringify(library))
    const deleted = await library.value.delete({
      schemaVersion: 1, scopeId: SCOPE, artifactRef: deletedResult.artifactRef, now: clock.now(),
    })
    assert.equal(deleted.ok, true, JSON.stringify(deleted))
    clock.set('2026-11-07T11:00:00.000Z')
    const { relay, backend } = await openRelay(sandbox, clock, app.locateTask)
    const gone = await relay.issueDeliveryPermit(permitEnvelope(deletedResult))
    assert.equal(gone.ok, false)
    assert.equal(gone.code, RELAY_ERRORS.TASK_NOT_SAVED)
    const missing = await relay.ensureDelivery(handoff({
      taskId: 'task:fixture-' + 'd'.repeat(32),
      artifactRef: 'artifact:fixture-bytes-' + 'd'.repeat(32),
    }, { requestKey: 'relay-segment-missing' }))
    assert.equal(missing.ok, false)
    assert.equal(missing.code, RELAY_ERRORS.TASK_NOT_SAVED)
    const issued = await relay.issueDeliveryPermit(permitEnvelope(retainedResult))
    assert.equal(issued.ok, true, JSON.stringify(issued))
    const ensured = await relay.ensureDelivery(handoff(retainedResult, { permitId: issued.permit.permitId }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(backend.stats().submitted, 1)
    assert.equal(backend.stats().accepted, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('178 confirmation and delivery capacity stay one count across source segments', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const app = await openGenerationApp(sandbox, clock)
    const results = await generateSavedResults(app, TOTAL_COUNT)
    const baseResult = results[0]
    const rotatedResult = results[TOTAL_COUNT - 1]
    const limitedPermits = await openRelay(sandbox, clock, app.locateTask, { maxPermits: 1 })
    const firstPermit = await limitedPermits.relay.issueDeliveryPermit(permitEnvelope(baseResult))
    assert.equal(firstPermit.ok, true, JSON.stringify(firstPermit))
    const secondPermit = await limitedPermits.relay.issueDeliveryPermit(permitEnvelope(rotatedResult))
    assert.equal(secondPermit.ok, false)
    assert.equal(secondPermit.code, RELAY_ERRORS.CAPACITY)
    const ensured = await limitedPermits.relay.ensureDelivery(handoff(baseResult, {
      permitId: firstPermit.permit.permitId,
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const limitedDeliveries = await openRelay(sandbox, clock, app.locateTask, { maxDeliveries: 1 })
    const rotatedPermit = await limitedDeliveries.relay.issueDeliveryPermit(permitEnvelope(rotatedResult))
    assert.equal(rotatedPermit.ok, true, JSON.stringify(rotatedPermit))
    const full = await limitedDeliveries.relay.ensureDelivery(handoff(rotatedResult, {
      permitId: rotatedPermit.permit.permitId,
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
