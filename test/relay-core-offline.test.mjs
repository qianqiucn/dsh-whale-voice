import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import {
  RELAY_ERRORS,
  RELAY_STATES,
  createFakeDeliveryBackend,
  openUnifiedRelay,
  projectUnifiedRelayComponent,
} from '../core/audio/relay-core-offline.mjs'

const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2027-01-01T00:00:00.000Z'
const TASK = 'task:fixture-relay-a'
const ARTIFACT = 'artifact:fixture-bytes-' + 'a'.repeat(32)
const ARTIFACT_SHA = 'b'.repeat(64)
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

function artifact() {
  const bytes = wavFromSamples([1200, -2200, 32767, -32768], 44100)
  return {
    artifactRef: ARTIFACT,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
    durationMs: 10,
    format: 'WAV',
  }
}

function input(overrides = {}) {
  return {
    taskId: TASK,
    artifact: artifact(),
    target: TARGET,
    rights: { state: 'GRANTED', expiresAt: EXPIRES },
    requestKey: 'relay-request-a',
    ...overrides,
  }
}

async function setup(options = {}) {
  const sandbox = createConfigSandbox()
  const backend = createFakeDeliveryBackend({ targets: [TARGET, TARGET_B], ...options.backend })
  const relay = await openUnifiedRelay({ sandbox, backend, now: () => NOW, maxDeliveries: options.maxDeliveries })
  return { sandbox, backend, relay }
}

test('delivery ids are persistent, stable and mapped to a safe legacy request id', async () => {
  const { sandbox, relay } = await setup()
  try {
    const first = await relay.ensureDelivery(input())
    assert.equal(first.ok, true)
    assert.equal(first.outcome, 'CREATED')
    assert.match(first.delivery.deliveryId, /^delivery:[0-9a-f]{32}$/)
    const mappings = await relay.mappings()
    assert.equal(mappings.ok, true)
    assert.match(mappings.deliveries[0].backendRequestId, /^[A-Za-z0-9_-]{8,64}$/)
    assert.equal(mappings.deliveries[0].backendRequestId.includes(':'), false)
    const again = await relay.ensureDelivery(input())
    assert.equal(again.ok, true)
    assert.equal(again.outcome, 'EXISTING')
    assert.equal(again.delivery.deliveryId, first.delivery.deliveryId)
    const conflict = await relay.ensureDelivery(input({ target: TARGET_B }))
    assert.equal(conflict.ok, false)
    assert.equal(conflict.code, RELAY_ERRORS.CONFLICT)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a saved artifact is submitted once; duplicate submit returns EXISTING', async () => {
  const { sandbox, backend, relay } = await setup()
  try {
    const ensured = await relay.ensureDelivery(input())
    const first = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(first.ok, true)
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

test('target/rights/capability gates fail closed before a successful acceptance', async () => {
  const { sandbox, relay } = await setup()
  try {
    const badTarget = { ...TARGET, targetId: 'fixture-private-revoked' }
    const backend = createFakeDeliveryBackend({ targets: [badTarget], bridgeAllowed: false })
    const relay2 = await openUnifiedRelay({ sandbox, backend, now: () => NOW })
    const ensured = await relay2.ensureDelivery(input({ target: badTarget, requestKey: 'gate-target' }))
    assert.equal(ensured.ok, true)
    const blocked = await relay2.submit(ensured.delivery.deliveryId)
    assert.equal(blocked.ok, true)
    assert.equal(blocked.delivery.state, RELAY_STATES.FAILED)
    assert.equal(backend.stats().accepted, 0)

    const expired = await relay.ensureDelivery(input({ requestKey: 'gate-expired', rights: { state: 'GRANTED', expiresAt: '2026-10-31T00:00:00.000Z' } }))
    assert.equal(expired.ok, false)
    assert.equal(expired.code, RELAY_ERRORS.TARGET_REJECTED)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('UNKNOWN is terminal and never resent or moved to another backend', async () => {
  const { sandbox, relay } = await setup({ backend: { failMode: 'unknown' } })
  try {
    const ensured = await relay.ensureDelivery(input())
    const first = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(first.ok, true)
    assert.equal(first.delivery.state, RELAY_STATES.UNKNOWN)
    const second = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(second.ok, false)
    assert.equal(second.code, RELAY_ERRORS.UNKNOWN_NO_RESEND)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('cancel is requested first and confirmed only by the explicit confirmation path', async () => {
  const { sandbox, relay } = await setup()
  try {
    const ensured = await relay.ensureDelivery(input())
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
  const { sandbox, relay } = await setup({ maxDeliveries: 1 })
  try {
    const first = await relay.ensureDelivery(input())
    assert.equal(first.ok, true)
    const second = await relay.ensureDelivery(input({ taskId: 'task:fixture-relay-b', requestKey: 'relay-request-b' }))
    assert.equal(second.ok, false)
    assert.equal(second.code, RELAY_ERRORS.CAPACITY)
    assert.equal((await relay.status(first.delivery.deliveryId)).ok, true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a concurrent second handle cannot duplicate the single submit', async () => {
  const { sandbox, backend, relay } = await setup()
  try {
    const ensured = await relay.ensureDelivery(input())
    const other = await openUnifiedRelay({ sandbox, backend, now: () => NOW })
    const results = await Promise.all([relay.submit(ensured.delivery.deliveryId), other.submit(ensured.delivery.deliveryId)])
    assert.ok(results.some((item) => item.ok === true))
    assert.equal(backend.stats().accepted, 1)
    assert.equal(backend.stats().submitted, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a real child-process exit leaves SUBMITTING as UNKNOWN, no replay', async () => {
  const { sandbox, relay } = await setup()
  const moduleUrl = new URL('../core/audio/relay-core-offline.mjs', import.meta.url).href
  try {
    const ensured = await relay.ensureDelivery(input())
    const deliveryId = ensured.delivery.deliveryId
    const code = `
      import { openUnifiedRelay, createFakeDeliveryBackend } from ${JSON.stringify(moduleUrl)};
      const relay = await openUnifiedRelay({ sandbox: { root: ${JSON.stringify(sandbox.root)} }, backend: createFakeDeliveryBackend({ targets: [${JSON.stringify(TARGET)}], failMode: 'hang' }) });
      await relay.submit(${JSON.stringify(deliveryId)});
    `
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore', windowsHide: true })
    const exited = new Promise((resolve) => child.once('exit', resolve))
    await new Promise((resolve) => setTimeout(resolve, 500))
    child.kill('SIGKILL')
    await exited
    const reopened = await openUnifiedRelay({ sandbox, backend: createFakeDeliveryBackend({ targets: [TARGET] }), now: () => NOW })
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
