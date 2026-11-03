/* 137-PERSIST-01 / 137-PERSIST-02 — immutable request-key binding and single-writer fencing.
 *
 * The tests use real Voice SAVED tasks and the real relay store; locking interleavings are created
 * by hooking the exact filesystem call that the relay itself uses, never by editing relay state by
 * hand, so each counterexample is deterministic and reproducible.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import {
  RELAY_ERRORS,
  RELAY_STATES,
  createFakeDeliveryBackend,
  openUnifiedRelay,
} from '../core/audio/relay-core-offline.mjs'
import { createVoiceSavedTask, latestRelayStoreFile, mutableClock, readRelayStore, relayHandoff } from './support/relay-authority.mjs'

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
const NOW = '2026-10-27T00:00:02.000Z'
const EXPIRES = '2026-10-28T00:00:00.000Z'
const PROOF = 'fixture-rights:relay-demo'
const STORE = 'unified-relay-v1.json'
const LOCK = 'unified-relay-v1.lock'

function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  return Promise.resolve().then(() => fn(sandbox)).finally(() => removeConfigSandbox(sandbox))
}

function readStore(sandbox) {
  return readRelayStore(sandbox.root)
}

async function openRelay(sandbox, { backend, targets = [TARGET, TARGET_B], clock } = {}) {
  return openUnifiedRelay({
    sandbox,
    backend: backend || createFakeDeliveryBackend({ targets }),
    targets,
    now: (clock || mutableClock(NOW)).now,
  })
}

function handoffOf(task, requestKey, targetId, proofRef = PROOF) {
  return relayHandoff({
    scopeId: task.scopeId, taskId: task.taskId, artifactRef: task.artifactRef,
    targetId, requestKey, proofRef,
  })
}

/* ------------------------------------------------------------------ PERSIST-01 */

test('PERSIST-01 an existing digest can never hijack another content request key', async () => {
  await withSandbox(async (sandbox) => {
    const taskA = await createVoiceSavedTask(sandbox, {
      idempotencyKey: 'key:fixture-relay-p1-a', saveRequestKey: 'save:p1-a',
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const taskB = await createVoiceSavedTask(sandbox, {
      idempotencyKey: 'key:fixture-relay-p1-b', saveRequestKey: 'save:p1-b',
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const relay = await openRelay(sandbox)
    const first = await relay.ensureDelivery(handoffOf(taskA, 'request-a', TARGET.targetId))
    assert.equal(first.ok, true, JSON.stringify(first))
    const second = await relay.ensureDelivery(handoffOf(taskB, 'request-b', TARGET_B.targetId))
    assert.equal(second.ok, true, JSON.stringify(second))
    assert.notEqual(first.delivery.deliveryId, second.delivery.deliveryId)

    // Same content digest as A, but the key is already bound to B: conflict, never a silent re-point.
    const hijack = await relay.ensureDelivery(handoffOf(taskA, 'request-b', TARGET_B.targetId))
    assert.equal(hijack.ok, false)
    assert.equal(hijack.code, RELAY_ERRORS.CONFLICT)
    const store = readStore(sandbox)
    assert.equal(store.deliveries.length, 2)
    assert.equal(store.byRequestKey['request-a'], first.delivery.deliveryId)
    assert.equal(store.byRequestKey['request-b'], second.delivery.deliveryId)
    // The existing delivery keeps its own content/target binding.
    const storedA = store.deliveries.find((item) => item.deliveryId === first.delivery.deliveryId)
    assert.equal(storedA.taskId, taskA.taskId)
    assert.equal(storedA.targetId, TARGET.targetId)
    assert.equal(storedA.targetKind, TARGET.kind)
  })
})

test('PERSIST-01 a fresh alias for an existing digest becomes immutable after binding', async () => {
  await withSandbox(async (sandbox) => {
    const taskA = await createVoiceSavedTask(sandbox, {
      idempotencyKey: 'key:fixture-relay-p1-c', saveRequestKey: 'save:p1-c',
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const taskB = await createVoiceSavedTask(sandbox, {
      idempotencyKey: 'key:fixture-relay-p1-d', saveRequestKey: 'save:p1-d',
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const relay = await openRelay(sandbox)
    const created = await relay.ensureDelivery(handoffOf(taskA, 'request-c', TARGET.targetId))
    assert.equal(created.ok, true)
    // Unbound key + existing digest: a legal alias is registered.
    const alias = await relay.ensureDelivery(handoffOf(taskA, 'request-c-alias', TARGET.targetId))
    assert.equal(alias.ok, true)
    assert.equal(alias.outcome, 'EXISTING')
    assert.equal(alias.delivery.deliveryId, created.delivery.deliveryId)
    assert.equal(readStore(sandbox).byRequestKey['request-c-alias'], created.delivery.deliveryId)
    // That alias is now immutable: different content can never take it over.
    const conflict = await relay.ensureDelivery(handoffOf(taskB, 'request-c-alias', TARGET_B.targetId))
    assert.equal(conflict.ok, false)
    assert.equal(conflict.code, RELAY_ERRORS.CONFLICT)
    assert.equal(readStore(sandbox).byRequestKey['request-c-alias'], created.delivery.deliveryId)
    // Repeating the same relation is still the normal EXISTING path (no persist, same id).
    const again = await relay.ensureDelivery(handoffOf(taskA, 'request-c', TARGET.targetId))
    assert.equal(again.ok, true)
    assert.equal(again.delivery.deliveryId, created.delivery.deliveryId)
  })
})

/* ------------------------------------------------------------------ PERSIST-02 */

test('PERSIST-02 a normal concurrent open at the accept boundary never recovers the live submit', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const clock = mutableClock(NOW)
    const base = createFakeDeliveryBackend({ targets: [TARGET] })
    let concurrent = null
    let concurrentStatus = null
    const backend = {
      id: base.id,
      health: () => base.health(),
      capabilities: () => base.capabilities(),
      resolveTarget: (args) => base.resolveTarget(args),
      submit: async (args) => {
        // Exactly the reported interleaving: a normal `open` (and a normal read) runs while the
        // backend result is being handed over, i.e. before the terminal state could be committed.
        concurrent = await openUnifiedRelay({ sandbox, backend: base, targets: [TARGET], now: clock.now })
        concurrentStatus = await concurrent.status(args.delivery.deliveryId)
        return base.submit(args)
      },
    }
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET], now: clock.now })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'owner-boundary', proofRef: PROOF,
    }))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(concurrent && concurrent.ok, true)
    assert.deepEqual(concurrent.recovered, [])
    assert.equal(concurrentStatus && concurrentStatus.ok, true)
    assert.equal(concurrentStatus.delivery.state, RELAY_STATES.SUBMITTING)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, RELAY_STATES.ACCEPTED)
    assert.match(submitted.delivery.receiptId, /^fixture-receipt-/)
    assert.equal(base.stats().accepted, 1)
    assert.equal(readStore(sandbox).deliveries[0].state, 'ACCEPTED')
  })
})

test('PERSIST-02 stale lock reclaim never deletes a live replacement lease', async () => {
  await withSandbox(async (sandbox) => {
    const lockFile = path.join(sandbox.root, LOCK)
    const dead = { token: 'dead-lease-token', pid: 2147483646, host: 'test', createdAt: new Date().toISOString() }
    fs.writeFileSync(lockFile, JSON.stringify(dead) + '\n')
    const live = { token: 'live-replacement-token', pid: process.pid, host: 'test', createdAt: new Date().toISOString() }
    let replaced = 0
    const originalRename = fs.renameSync
    fs.renameSync = function patchedRename(from, to) {
      if (replaced === 0 && typeof from === 'string' && from === lockFile && typeof to === 'string' && to.includes('.stale.')) {
        replaced += 1
        // A live owner took the canonical lease between the stale read and the reclaim rename.
        fs.writeFileSync(lockFile, JSON.stringify(live) + '\n')
      }
      return originalRename(from, to)
    }
    try {
      const started = Date.now()
      const relay = await openRelay(sandbox)
      assert.equal(replaced, 1, 'the stale-reclaim rename was never exercised')
      assert.equal(relay.ok, false)
      assert.equal(relay.code, RELAY_ERRORS.STORE_BUSY)
      assert.ok(Date.now() - started >= 2500, 'a fenced reclaim must not succeed by deleting the live lease')
      const current = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      assert.equal(current.token, live.token, 'the live replacement lease was deleted or overwritten')
    } finally {
      fs.renameSync = originalRename
    }
  })
})

test('PERSIST-02 releasing a moved foreign lease restores it instead of deleting it', async () => {
  await withSandbox(async (sandbox) => {
    const lockFile = path.join(sandbox.root, LOCK)
    const foreign = { token: 'foreign-live-token', pid: process.pid, host: 'other', createdAt: new Date().toISOString() }
    let fired = 0
    const originalRename = fs.renameSync
    fs.renameSync = function patchedRename(from, to) {
      if (fired === 0 && typeof from === 'string' && from === lockFile && typeof to === 'string' && to.includes('.release.')) {
        fired += 1
        // Another owner replaced the canonical lease after our release read its own token.
        fs.writeFileSync(lockFile, JSON.stringify(foreign) + '\n')
      }
      return originalRename(from, to)
    }
    try {
      const relay = await openRelay(sandbox)
      assert.equal(fired, 1, 'the release rename was never exercised')
      assert.equal(relay.ok, true, JSON.stringify(relay))
      const current = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      assert.equal(current.token, foreign.token, 'the foreign live lease was not restored')
    } finally {
      fs.renameSync = originalRename
    }
  })
})

test('PERSIST-02 a release restore can never overwrite a third live lease', async () => {
  await withSandbox(async (sandbox) => {
    const lockFile = path.join(sandbox.root, LOCK)
    const foreign = { token: 'foreign-live-token', pid: process.pid, host: 'other', createdAt: new Date().toISOString() }
    const third = { token: 'third-live-token', pid: process.pid, host: 'third', createdAt: new Date().toISOString() }
    let fired = 0
    let thirdCreated = false
    const originalRename = fs.renameSync
    fs.renameSync = function patchedRename(from, to) {
      if (fired === 0 && typeof from === 'string' && from === lockFile && typeof to === 'string' && to.includes('.release.')) {
        fired += 1
        fs.writeFileSync(lockFile, JSON.stringify(foreign) + '\n')
        originalRename(from, to)
        // The name is briefly empty, so a third owner legally acquires the canonical lease.
        fs.writeFileSync(lockFile, JSON.stringify(third) + '\n', { flag: 'wx' })
        thirdCreated = true
        throw Object.assign(new Error('injected after move'), { code: 'EIO' })
      }
      return originalRename(from, to)
    }
    try {
      const relay = await openRelay(sandbox)
      assert.equal(fired, 1)
      assert.equal(thirdCreated, true)
      assert.equal(relay.ok, true, JSON.stringify(relay))
      const current = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      assert.equal(current.token, third.token, 'a live third lease was overwritten by the restore')
    } finally {
      fs.renameSync = originalRename
    }
  })
})

test('PERSIST-02 a failed claim commit leaves no phantom live owner and stays retryable', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const relay = await openRelay(sandbox, { backend })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'claim-failure', proofRef: PROOF,
    }))
    let injected = 0
    const originalLink = fs.linkSync
    fs.linkSync = function patchedLink(from, to) {
      if (injected === 0 && typeof to === 'string' && /\.r[0-9]+\.json$/.test(to)) {
        injected += 1
        throw Object.assign(new Error('injected claim failure'), { code: 'EIO' })
      }
      return originalLink(from, to)
    }
    try {
      const failed = await relay.submit(ensured.delivery.deliveryId)
      assert.equal(failed.ok, false)
      assert.equal(failed.code, RELAY_ERRORS.STORE_INVALID)
    } finally {
      fs.linkSync = originalLink
    }
    assert.equal(injected, 1)
    // The claim never committed: the record is still QUEUED, not a phantom SUBMITTING owner.
    const store = readStore(sandbox)
    assert.equal(store.deliveries[0].state, 'QUEUED')
    assert.equal(store.deliveries[0].owner, null)
    const reopened = await openRelay(sandbox, { backend })
    assert.deepEqual(reopened.recovered, [])
    const retried = await reopened.submit(ensured.delivery.deliveryId)
    assert.equal(retried.ok, true, JSON.stringify(retried))
    assert.equal(retried.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(backend.stats().accepted, 1)
  })
})

test('PERSIST-02 a terminal-state write failure stays BUSY for the live owner instead of UNKNOWN', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const base = createFakeDeliveryBackend({ targets: [TARGET] })
    let armed = false
    let armedWrites = 0
    const originalLink = fs.linkSync
    const originalCopy = fs.copyFileSync
    fs.linkSync = function patchedLink(from, to) {
      if (armed && typeof to === 'string' && /\.r[0-9]+\.json$/.test(to)) {
        armedWrites += 1
        // The claim (first armed commit) publishes; every terminal commit after it fails.
        if (armedWrites >= 2) throw Object.assign(new Error('injected finalize failure'), { code: 'EIO' })
      }
      return originalLink(from, to)
    }
    fs.copyFileSync = function patchedCopy(from, to, ...rest) {
      if (armed && typeof to === 'string' && /\.r[0-9]+\.json$/.test(to) && armedWrites >= 2) {
        throw Object.assign(new Error('injected finalize copy failure'), { code: 'EIO' })
      }
      return originalCopy(from, to, ...rest)
    }
    try {
      const relay = await openRelay(sandbox, { backend: base })
      const ensured = await relay.ensureDelivery(relayHandoff({
        scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
        targetId: TARGET.targetId, requestKey: 'finalize-failure', proofRef: PROOF,
      }))
      // From here on, the claim is the first store write and the terminal write is the second.
      armed = true
      const submitted = await relay.submit(ensured.delivery.deliveryId)
      assert.ok(armedWrites >= 2)
      assert.equal(base.stats().accepted, 1)
      assert.equal(submitted.ok, false)
      assert.equal(submitted.code, RELAY_ERRORS.STORE_INVALID)
    } finally {
      fs.linkSync = originalLink
      fs.copyFileSync = originalCopy
    }
    // The Fake Worker really accepted, so the durable outcome is unknown at best; the live owner is
    // retained (busy) rather than a concurrent open silently rewriting it to UNKNOWN.
    const store = readStore(sandbox)
    assert.equal(store.deliveries[0].state, 'SUBMITTING')
    assert.equal(typeof store.deliveries[0].owner.token, 'string')
    const reopened = await openRelay(sandbox)
    assert.deepEqual(reopened.recovered, [])
    const busy = await reopened.submit(store.deliveries[0].deliveryId)
    assert.equal(busy.ok, false)
    assert.equal(busy.code, RELAY_ERRORS.STORE_BUSY)
  })
})

/* ------------------------------------------------------------------ PERSIST-01/STORE */

test('PERSIST-01 a corrupt or inconsistent store is refused instead of re-minting an accepted delivery', async () => {
  const variants = ['digest-index', 'key-index', 'both-indexes', 'dangling-digest', 'duplicate-record', 'terminal-state', 'canonical-digest']
  for (const variant of variants) {
    await withSandbox(async (sandbox) => {
      const voice = await createVoiceSavedTask(sandbox, {
        idempotencyKey: 'key:fixture-store-' + variant, saveRequestKey: 'save:store-' + variant,
        now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
      })
      const backend = createFakeDeliveryBackend({ targets: [TARGET] })
      const args = { sandbox, backend, targets: [TARGET], now: () => NOW }
      const relay = await openUnifiedRelay(args)
      const handoff = relayHandoff({
        scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
        targetId: TARGET.targetId, requestKey: 'store-request', proofRef: PROOF,
      })
      const first = await relay.ensureDelivery(handoff)
      const accepted = await relay.submit(first.delivery.deliveryId)
      assert.equal(accepted.delivery.state, RELAY_STATES.ACCEPTED)
      assert.equal(backend.stats().accepted, 1)
      const storeFile = latestRelayStoreFile(sandbox.root)
      const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
      if (variant === 'digest-index') store.byDigest = {}
      if (variant === 'key-index') delete store.byRequestKey
      if (variant === 'both-indexes') { store.byDigest = {}; delete store.byRequestKey }
      if (variant === 'dangling-digest') store.byDigest['f'.repeat(64)] = first.delivery.deliveryId
      if (variant === 'duplicate-record') store.deliveries.push({ ...store.deliveries[0], deliveryId: 'delivery:' + 'e'.repeat(32) })
      if (variant === 'terminal-state') store.deliveries[0].receiptId = null
      if (variant === 'canonical-digest') {
        // Keep every semantic fact and the terminal state, re-point only the digest (and its index)
        // to another syntactically valid 64-hex value.
        const record = store.deliveries[0]
        delete store.byDigest[record.digest]
        record.digest = 'a'.repeat(64)
        store.byDigest[record.digest] = record.deliveryId
      }
      fs.writeFileSync(storeFile, JSON.stringify(store) + '\n')
      const before = fs.readFileSync(storeFile)
      const reopened = await openUnifiedRelay(args)
      assert.equal(reopened.ok, false, variant + ' reopen must fail closed')
      assert.equal(reopened.code, RELAY_ERRORS.STORE_INVALID, variant)
      // The corrupt file is never repaired, re-minted or treated as a fresh store.
      assert.equal(fs.readFileSync(storeFile).equals(before), true, variant + ' store file was rewritten')
      assert.equal(typeof reopened.ensureDelivery, 'undefined', variant + ' corrupt store produced a usable handle')
      assert.equal(backend.stats().accepted, 1, variant + ' accepted the same request twice')
      const onDisk = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
      assert.equal(onDisk.deliveries.length, variant === 'duplicate-record' ? 2 : 1, variant)
    })
  }
})

test('PERSIST-02 a commit can never overwrite an already published revision', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z', expiresAt: EXPIRES, proofRef: PROOF,
    })
    const relay = await openRelay(sandbox)
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'revision-collision', proofRef: PROOF,
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const originalLink = fs.linkSync
    let injected = 0
    fs.linkSync = function patchedLink(from, to) {
      if (injected === 0 && typeof to === 'string' && /\.r[0-9]+\.json$/.test(to)) {
        injected += 1
        // Simulate another process publishing exactly this revision first: a valid store snapshot
        // with the same revision but a different terminal outcome for this delivery.
        const base = JSON.parse(fs.readFileSync(latestRelayStoreFile(sandbox.root), 'utf8'))
        const competing = JSON.parse(JSON.stringify(base))
        competing.revision = base.revision + 1
        competing.deliveries[0].state = RELAY_STATES.CANCEL_REQUESTED
        competing.deliveries[0].cancel = { requested: true, confirmed: false, requestedAt: NOW, confirmedAt: null }
        competing.deliveries[0].updatedAt = NOW
        fs.writeFileSync(to, JSON.stringify(competing) + '\n')
      }
      return originalLink(from, to)
    }
    let result
    try {
      result = await relay.cancel(ensured.delivery.deliveryId)
    } finally {
      fs.linkSync = originalLink
    }
    assert.equal(injected, 1, 'the immutable revision create was not exercised')
    assert.equal(result.ok, false, JSON.stringify(result))
    assert.equal(result.code, RELAY_ERRORS.STORE_BUSY)
    // The competing revision survives byte-for-byte; the losing writer published nothing.
    const store = readStore(sandbox)
    assert.equal(store.deliveries[0].state, RELAY_STATES.CANCEL_REQUESTED)
    assert.equal(store.deliveries[0].cancel.requested, true)
  })
})