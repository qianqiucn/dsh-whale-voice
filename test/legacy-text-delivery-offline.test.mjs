/* Plan 13-B — 144-LEGACY: the offline legacy text compatibility facade.
 *
 * Proves that a legacy text request travels the *existing* single chain exactly once:
 *   legacy text -> the same generation owner -> the same persisted SAVED Artifact
 *   -> the same persistent relay entry -> the same relay queue/backend.
 * No second cache, retry loop, synthesis path or generation registry is introduced. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openUnifiedRelay } from '../core/audio/relay-core-offline.mjs'
import { createInternalSenderOffline, createFixtureTransport, INTERNAL_SENDER_ID } from '../core/audio/internal-sender-offline.mjs'
import { LEGACY_TEXT_DELIVERY_ERRORS, createLegacyTextDeliveryFacade } from '../core/audio/legacy-text-delivery-offline.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TARGET = {
  targetId: 'fixture-private-a', kind: 'PRIVATE', chat: 'fixture-chat-a', authorized: true, allowlisted: true,
  identityVerified: true, bridgeAllowed: true, workerAllowed: true,
}
const RELAY_TARGETS = [(() => { const { chat, ...rest } = TARGET; return rest })()]
const SCOPE = 'scope:fixture-demo'
const NOW = '2026-10-27T00:00:00.000Z'
const EXPIRES = '2026-10-28T00:00:00.000Z'

function fixtureRunnerExample() {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf('## 7.')
  assert.ok(at >= 0)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try { return await fn(sandbox) } finally { removeConfigSandbox(sandbox) }
}

async function harness(sandbox, transport) {
  const internal = createInternalSenderOffline({ targets: [TARGET], transport, now: () => NOW })
  const relay = await openUnifiedRelay({ sandbox, backend: internal, targets: RELAY_TARGETS, now: () => NOW })
  const facade = createLegacyTextDeliveryFacade({ sandbox, relay })
  return { internal, relay, facade, input: fixtureRunnerExample() }
}

function request(input, overrides = {}) {
  return {
    legacyRequestId: 'legacy-request-1', text: '你好，鲸鱼。', scopeId: SCOPE, targetId: TARGET.targetId,
    savedInput: input, expiresAt: EXPIRES, now: NOW, ...overrides,
  }
}

test('144-LEGACY: one legacy text request generates, saves and delivers exactly once', async () => {
  await withSandbox(async (sandbox) => {
    const transport = createFixtureTransport()
    const { facade, internal, input } = await harness(sandbox, transport)
    const first = await facade.deliver(request(input))
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.stage, 'DELIVERY')
    assert.equal(first.state, 'ACCEPTED')
    assert.equal(first.generation, 'CREATED')
    assert.match(first.taskId, /^task:fixture-/)
    assert.match(first.artifactRef, /^artifact:fixture-bytes-/)
    assert.match(first.deliveryId, /^delivery:/)
    assert.equal(transport.invocations.length, 1)
    assert.equal(transport.invocations[0].scriptId, 'SEND')
    assert.equal(internal.stats().accepted, 1)
    assert.deepEqual(facade.stats(), { requests: 1, generations: 1, saveReplays: 0, deliveryReuses: 0, submitted: 1, rejected: 0 })

    // The exact same request reuses the same task, artifact and delivery: nothing is regenerated,
    // re-saved or re-sent, and no second local cache/registry is involved.
    const replay = await facade.deliver(request(input))
    assert.equal(replay.ok, true, JSON.stringify(replay))
    assert.equal(replay.generation, 'EXISTING')
    assert.equal(replay.deliveryOutcome, 'EXISTING')
    assert.equal(replay.taskId, first.taskId)
    assert.equal(replay.artifactRef, first.artifactRef)
    assert.equal(replay.deliveryId, first.deliveryId)
    assert.equal(replay.state, 'ACCEPTED')
    assert.equal(transport.invocations.length, 1)
    assert.equal(facade.stats().generations, 1)
    assert.equal(facade.stats().saveReplays, 1)
    assert.equal(facade.stats().deliveryReuses, 1)
  })
})

test('144-LEGACY: an UNKNOWN delivery is never regenerated or resent', async () => {
  await withSandbox(async (sandbox) => {
    const transport = createFixtureTransport({ results: [{ status: 'UNKNOWN', reason: 'worker_result_missing' }] })
    const { facade, input } = await harness(sandbox, transport)
    const first = await facade.deliver(request(input))
    assert.equal(first.ok, false)
    assert.equal(first.state, 'UNKNOWN')
    assert.equal(first.code, LEGACY_TEXT_DELIVERY_ERRORS.UNKNOWN_NO_RESEND)
    assert.equal(transport.invocations.length, 1)
    const replay = await facade.deliver(request(input))
    assert.equal(replay.ok, false)
    assert.equal(replay.state, 'UNKNOWN')
    assert.equal(replay.deliveryId, first.deliveryId)
    assert.equal(transport.invocations.length, 1)
    assert.equal(facade.stats().generations, 1)
  })
})

test('144-LEGACY: a cancelled delivery keeps its generation and is never resent', async () => {
  await withSandbox(async (sandbox) => {
    const transport = createFixtureTransport()
    const { relay, facade, input } = await harness(sandbox, transport)
    // Cancel between the persistent issuance and the submit: the delivered chain, not a fake hook.
    const cancellingRelay = Object.freeze({
      ensureDelivery: (args) => relay.ensureDelivery(args),
      issueDeliveryPermit: (args) => relay.issueDeliveryPermit(args),
      submit: async (deliveryId) => {
        await relay.cancel(deliveryId)
        return relay.submit(deliveryId)
      },
    })
    const cancelFacade = createLegacyTextDeliveryFacade({ sandbox, relay: cancellingRelay })
    const first = await cancelFacade.deliver(request(input))
    assert.equal(first.ok, false)
    assert.equal(first.state, 'CANCELLED')
    assert.equal(transport.invocations.length, 0)
    // Even through the normal relay the cancelled delivery is never sent afterwards.
    const after = await facade.deliver(request(input))
    assert.equal(after.ok, false)
    assert.equal(after.state, 'CANCELLED')
    assert.equal(transport.invocations.length, 0)
    assert.equal(facade.stats().generations, 0)
    assert.equal(after.generation, 'EXISTING')
  })
})

test('144-LEGACY: invalid legacy text is refused before any generation or delivery', async () => {
  await withSandbox(async (sandbox) => {
    const transport = createFixtureTransport()
    const { facade, input } = await harness(sandbox, transport)
    for (const bad of ['', '   ', 'x'.repeat(2001), 'line\u0000break', 'bell\u0007', null, 42]) {
      const result = await facade.deliver(request(input, { text: bad }))
      assert.equal(result.ok, false, JSON.stringify(bad))
      assert.equal(result.code, LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID)
    }
    assert.equal(transport.invocations.length, 0)
    assert.equal(transport.invocations.filter((item) => item.scriptId === 'SEND').length, 0)
    assert.equal(facade.stats().generations, 0)
    assert.equal(facade.stats().requests, 7)
  })
})

test('144-LEGACY: the facade is a thin chain, never a second generation path', () => {
  const facadePath = path.join(HERE, '..', 'core', 'audio', 'legacy-text-delivery-offline.mjs')
  const source = fs.readFileSync(facadePath, 'utf8')
  // It must use the existing generation owner and the existing relay only.
  assert.match(source, /openFixtureTaskOwner/)
  assert.match(source, /openFixtureTaskCatalog/)
  assert.doesNotMatch(source, /produceFixtureWav|provider-dispatch|dispatchRvcFakeOnce|fixture-wav-producer/)
  assert.doesNotMatch(source, /child_process|node:http|node:net/)
  assert.doesNotMatch(source, /setTimeout|setInterval/)
  // It must not keep its own store/cache/queue/generation registry.
  assert.doesNotMatch(source, /\b(writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync)\b/)
  assert.doesNotMatch(source, /new Map\(|new Set\(/)
  assert.equal(INTERNAL_SENDER_ID, 'whale-relay-internal-sender')
})
