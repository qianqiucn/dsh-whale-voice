/* 179 / Plan 13-A — the application entry for one saved result's independent confirmation and
 * offline delivery.
 *
 * Every case uses the existing generation/save chain in a temporary Fixture sandbox and an explicitly
 * assembled Fake delivery capability; the caller only names the original task and the confirmed
 * target. No test hands the app a storage path, artifact fact or authorization fact.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { RELAY_ERRORS, RELAY_STATES, createFakeDeliveryBackend } from '../core/audio/relay-core-offline.mjs'
import { PRESET_GENERATION_APP_ERRORS, openPresetGenerationApp } from '../core/preset-generation-app.mjs'
import { mutableClock, readRelayStore } from './support/relay-authority.mjs'

const SCOPE = 'scope:fixture-delivery-app'
const PROOF = 'fixture-rights:delivery-app'
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

async function openApp(sandbox, clock, delivery, identity = {}) {
  const opened = await openPresetGenerationApp({
    sandbox,
    provider: createMockProvider(),
    scopeId: identity.scopeId || SCOPE,
    rightsProofRef: identity.proofRef || PROOF,
    voices: VOICES,
    textLimit: 200,
    providerFacts: PROVIDER_FACTS,
    now: clock.now,
    delivery,
  })
  assert.equal(opened.ok, true, JSON.stringify(opened))
  return opened.value
}

async function generateSaved(app, text) {
  const generated = await app.generate({ text, voiceId: 'demo-voice-a', language: 'zh-CN' })
  assert.equal(generated.ok, true, JSON.stringify(generated))
  assert.equal(generated.state, 'SAVED')
  return generated
}

test('179 without the delivery wiring generation/save/download still work and delivery is unavailable', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const app = await openApp(sandbox, clock)
    const saved = await generateSaved(app, '第一份隔离生成，未装配投递能力。')
    const confirm = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(confirm.ok, false)
    assert.equal(confirm.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_UNAVAILABLE)
    const status = await app.deliveryStatus({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(status.ok, false)
    assert.equal(status.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_UNAVAILABLE)
    const readback = await app.status(saved.taskId)
    assert.equal(readback.ok, true, JSON.stringify(readback))
    assert.equal(readback.readable, true)
    const download = await app.download(saved.taskId)
    assert.equal(download.ok, true, JSON.stringify(download))
    assert.equal(readRelayStore(sandbox.root), null)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('179 confirming a saved result accepts once; repeats and a reopen reuse it, and status reads it back', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const delivery = { backend, targets: [TARGET] }
    const app = await openApp(sandbox, clock, delivery)
    const saved = await generateSaved(app, '第二份隔离生成，确认一次即可受理。')
    const first = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.outcome, 'ACCEPTED')
    assert.equal(first.delivery.taskId, saved.taskId)
    assert.equal(first.delivery.targetId, TARGET.targetId)
    assert.equal(first.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(first.delivery.backendState, 'QUEUED')
    assert.match(first.delivery.receiptId, /^fixture-receipt-/)
    assert.equal(first.delivery.mockOnly, true)
    assert.equal(first.delivery.realOperationAllowed, false)
    const again = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(again.ok, true, JSON.stringify(again))
    assert.equal(again.delivery.deliveryId, first.delivery.deliveryId)
    assert.equal(backend.stats().submitted, 1)
    const readback = await app.deliveryStatus({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(readback.ok, true, JSON.stringify(readback))
    assert.equal(readback.state, RELAY_STATES.ACCEPTED)
    assert.equal(readback.delivery.deliveryId, first.delivery.deliveryId)
    const reopened = await openApp(sandbox, clock, delivery)
    const reConfirmed = await reopened.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(reConfirmed.ok, true, JSON.stringify(reConfirmed))
    assert.equal(reConfirmed.delivery.deliveryId, first.delivery.deliveryId)
    assert.equal(backend.stats().submitted, 1)
    const reStatus = await reopened.deliveryStatus({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(reStatus.ok, true, JSON.stringify(reStatus))
    assert.equal(reStatus.delivery.deliveryId, first.delivery.deliveryId)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.deliveries.length, 1)
    assert.equal(store.permits.length, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('179 unconfirmed, missing, unreadable and unauthorized relations fail explicitly', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(sandbox, clock, { backend, targets: [TARGET] })
    const saved = await generateSaved(app, '第三份隔离生成，失败分支素材。')
    const unconfirmed = await app.deliveryStatus({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(unconfirmed.ok, false)
    assert.equal(unconfirmed.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_FOUND)
    const missing = await app.confirmDelivery({
      taskId: 'task:fixture-' + 'c'.repeat(32), targetId: TARGET.targetId,
    })
    assert.equal(missing.ok, false)
    assert.equal(missing.code, PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED)
    const unknownTarget = await app.confirmDelivery({ taskId: saved.taskId, targetId: 'fixture-not-configured' })
    assert.equal(unknownTarget.ok, false)
    assert.equal(unknownTarget.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_REFUSED)
    assert.equal(unknownTarget.stage, 'permit')
    assert.equal(unknownTarget.cause, RELAY_ERRORS.TARGET_REJECTED)
    const library = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(library.ok, true, JSON.stringify(library))
    const deleted = await library.value.delete({
      schemaVersion: 1, scopeId: SCOPE, artifactRef: saved.artifactRef, now: clock.now(),
    })
    assert.equal(deleted.ok, true, JSON.stringify(deleted))
    const unreadable = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(unreadable.ok, false)
    assert.equal(unreadable.code, PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED)
    assert.equal(backend.stats().submitted, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('179 an unknown backend result stays not accepted, is never resent, and status keeps saying UNKNOWN', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET], failMode: 'unknown' })
    const app = await openApp(sandbox, clock, { backend, targets: [TARGET] })
    const saved = await generateSaved(app, '第四份隔离生成，后端结果不确定。')
    const first = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(first.ok, false)
    assert.equal(first.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_ACCEPTED)
    assert.equal(first.state, RELAY_STATES.UNKNOWN)
    assert.equal(first.delivery.error.code, RELAY_ERRORS.OWNER_LOST)
    assert.equal(backend.stats().submitted, 1)
    const again = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(again.ok, false)
    assert.equal(again.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_ACCEPTED)
    assert.equal(again.state, RELAY_STATES.UNKNOWN)
    assert.equal(backend.stats().submitted, 1)
    const status = await app.deliveryStatus({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(status.ok, true, JSON.stringify(status))
    assert.equal(status.state, RELAY_STATES.UNKNOWN)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('179 base and rotated segment results are confirmed by one entry, including a retained one', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(sandbox, clock, { backend, targets: [TARGET] })
    const results = []
    for (let index = 0; index < 26; index += 1) {
      results.push(await generateSaved(app, '第' + (index + 1) + '份隔离生成，跨分段素材。'))
    }
    clock.set('2026-11-07T11:00:00.000Z')
    const base = results[0]
    const rotated = results[25]
    const baseDelivery = await app.confirmDelivery({ taskId: base.taskId, targetId: TARGET.targetId })
    assert.equal(baseDelivery.ok, true, JSON.stringify(baseDelivery))
    const rotatedDelivery = await app.confirmDelivery({ taskId: rotated.taskId, targetId: TARGET.targetId })
    assert.equal(rotatedDelivery.ok, true, JSON.stringify(rotatedDelivery))
    assert.notEqual(baseDelivery.delivery.deliveryId, rotatedDelivery.delivery.deliveryId)
    assert.equal(backend.stats().accepted, 2)
    const baseStatus = await app.deliveryStatus({ taskId: base.taskId, targetId: TARGET.targetId })
    assert.equal(baseStatus.ok, true, JSON.stringify(baseStatus))
    assert.equal(baseStatus.delivery.deliveryId, baseDelivery.delivery.deliveryId)
    const rotatedStatus = await app.deliveryStatus({ taskId: rotated.taskId, targetId: TARGET.targetId })
    assert.equal(rotatedStatus.ok, true, JSON.stringify(rotatedStatus))
    assert.equal(rotatedStatus.delivery.deliveryId, rotatedDelivery.delivery.deliveryId)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.deliveries.length, 2)
    assert.equal(readRelayStore(path.join(sandbox.root, 'segments', '0001')), null)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('179 confirmation and delivery capacity refusals stay explicit at the application entry', async () => {
  const permitSandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(permitSandbox, clock, { backend, targets: [TARGET], maxPermits: 1 })
    const first = await generateSaved(app, '第五份隔离生成，确认容量 A。')
    const second = await generateSaved(app, '第六份隔离生成，确认容量 B。')
    const accepted = await app.confirmDelivery({ taskId: first.taskId, targetId: TARGET.targetId })
    assert.equal(accepted.ok, true, JSON.stringify(accepted))
    const refused = await app.confirmDelivery({ taskId: second.taskId, targetId: TARGET.targetId })
    assert.equal(refused.ok, false)
    assert.equal(refused.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_REFUSED)
    assert.equal(refused.stage, 'permit')
    assert.equal(refused.cause, RELAY_ERRORS.CAPACITY)
    assert.equal(backend.stats().submitted, 1)
  } finally {
    removeConfigSandbox(permitSandbox)
  }
  const deliverySandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(deliverySandbox, clock, { backend, targets: [TARGET], maxDeliveries: 1 })
    const first = await generateSaved(app, '第七份隔离生成，投递容量 A。')
    const second = await generateSaved(app, '第八份隔离生成，投递容量 B。')
    const accepted = await app.confirmDelivery({ taskId: first.taskId, targetId: TARGET.targetId })
    assert.equal(accepted.ok, true, JSON.stringify(accepted))
    const refused = await app.confirmDelivery({ taskId: second.taskId, targetId: TARGET.targetId })
    assert.equal(refused.ok, false)
    assert.equal(refused.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_REFUSED)
    assert.equal(refused.stage, 'ensure')
    assert.equal(refused.cause, RELAY_ERRORS.CAPACITY)
    const missing = await app.deliveryStatus({ taskId: second.taskId, targetId: TARGET.targetId })
    assert.equal(missing.ok, false)
    assert.equal(missing.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_FOUND)
    assert.equal(backend.stats().submitted, 1)
  } finally {
    removeConfigSandbox(deliverySandbox)
  }
})

test('179 v1.1 a delivery status query never returns another scope record', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backendA = createFakeDeliveryBackend({ targets: [TARGET] })
    const appA = await openApp(sandbox, clock, { backend: backendA, targets: [TARGET] })
    const savedA = await generateSaved(appA, '第九份隔离生成，范围 A。')
    const confirmedA = await appA.confirmDelivery({ taskId: savedA.taskId, targetId: TARGET.targetId })
    assert.equal(confirmedA.ok, true, JSON.stringify(confirmedA))
    const backendB = createFakeDeliveryBackend({ targets: [TARGET] })
    const appB = await openApp(sandbox, clock, { backend: backendB, targets: [TARGET] }, {
      scopeId: 'scope:fixture-delivery-app-b',
      proofRef: 'fixture-rights:delivery-app-b',
    })
    const statusB = await appB.deliveryStatus({ taskId: savedA.taskId, targetId: TARGET.targetId })
    assert.equal(statusB.ok, false)
    assert.equal(statusB.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_FOUND)
    assert.equal(statusB.delivery, undefined)
    assert.equal(Object.prototype.hasOwnProperty.call(statusB, 'artifactRef'), false)
    const readB = await appB.status(savedA.taskId)
    assert.equal(readB.ok, false)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.deliveries.length, 1)
    assert.equal(store.permits.length, 1)
    assert.equal(backendB.stats().submitted, 0)
    const statusA = await appA.deliveryStatus({ taskId: savedA.taskId, targetId: TARGET.targetId })
    assert.equal(statusA.ok, true, JSON.stringify(statusA))
    assert.equal(statusA.state, RELAY_STATES.ACCEPTED)
    assert.equal(statusA.delivery.deliveryId, confirmedA.delivery.deliveryId)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('179 v1.1 the same scope still reads its delivery after the saved result is deleted', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(sandbox, clock, { backend, targets: [TARGET] })
    const saved = await generateSaved(app, '第十份隔离生成，删除后仍可查投递记录。')
    const confirmed = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed))
    const library = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(library.ok, true, JSON.stringify(library))
    const deleted = await library.value.delete({
      schemaVersion: 1, scopeId: SCOPE, artifactRef: saved.artifactRef, now: clock.now(),
    })
    assert.equal(deleted.ok, true, JSON.stringify(deleted))
    const again = await app.confirmDelivery({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(again.ok, false)
    assert.equal(again.code, PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED)
    const status = await app.deliveryStatus({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(status.ok, true, JSON.stringify(status))
    assert.equal(status.state, RELAY_STATES.ACCEPTED)
    assert.equal(status.delivery.deliveryId, confirmed.delivery.deliveryId)
    const reopened = await openApp(sandbox, clock, { backend, targets: [TARGET] })
    const reopenedStatus = await reopened.deliveryStatus({ taskId: saved.taskId, targetId: TARGET.targetId })
    assert.equal(reopenedStatus.ok, true, JSON.stringify(reopenedStatus))
    assert.equal(reopenedStatus.delivery.deliveryId, confirmed.delivery.deliveryId)
    assert.equal(backend.stats().submitted, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
