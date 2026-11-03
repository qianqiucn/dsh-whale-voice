/* PERSIST-02/LEASE — the real three-process interleaving from the 0139 review, replayed as a test.
 *
 * A live writer (A) reads the store and is paused before its commit. A stale reclaim moves A's live
 * lease aside, which briefly empties the canonical lock name, so C legally acquires it and commits
 * its own normal cancel. A then tries to commit its old snapshot. The fix must make A fail closed
 * (lease/revision lost) instead of overwriting C's successful result; no successful result may be
 * lost. The interleaving is arranged with real child processes and file markers, never by editing a
 * relay record.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { createFakeDeliveryBackend, openUnifiedRelay } from '../core/audio/relay-core-offline.mjs'
import { createVoiceSavedTask, latestRelayStoreFile, relayHandoff } from './support/relay-authority.mjs'

const TARGET_A = {
  targetId: 'fixture-private-a', kind: 'PRIVATE', authorized: true, allowlisted: true,
  identityVerified: true, bridgeAllowed: true, workerAllowed: true,
}
const TARGET_B = { ...TARGET_A, targetId: 'fixture-private-b' }
const NOW = '2026-10-27T00:00:02.000Z'
const LOCK = 'unified-relay-v1.lock'
const STORE = 'unified-relay-v1.json'

function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) return false
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  return true
}

test('PERSIST-02 a stolen live lease cannot let a stale snapshot overwrite a newer commit', async () => {
  const sandbox = createConfigSandbox()
  const outDir = path.join(sandbox.root, 'race-out')
  fs.mkdirSync(outDir, { recursive: true })
  let childA = null
  const originalRename = fs.renameSync
  try {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z',
      expiresAt: '2026-10-28T00:00:00.000Z', proofRef: 'fixture-rights:relay-demo',
    })
    const backend = createFakeDeliveryBackend({ targets: [TARGET_A, TARGET_B] })
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET_A, TARGET_B], now: () => NOW })
    assert.equal(relay.ok, true, JSON.stringify(relay))
    const first = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET_A.targetId, requestKey: 'lease-race-a', proofRef: 'fixture-rights:relay-demo',
    }))
    const second = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET_B.targetId, requestKey: 'lease-race-b', proofRef: 'fixture-rights:relay-demo',
    }))
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(second.ok, true, JSON.stringify(second))
    assert.notEqual(first.delivery.deliveryId, second.delivery.deliveryId)

    const lockFile = path.join(sandbox.root, LOCK)
    const ready = path.join(sandbox.root, 'race.ready')
    const release = path.join(sandbox.root, 'race.release')
    const payloadFile = path.join(outDir, 'race-payload.json')
    fs.writeFileSync(payloadFile, JSON.stringify({
      root: sandbox.root, target: TARGET_A, now: NOW, outDir,
      idA: first.delivery.deliveryId, idB: second.delivery.deliveryId,
      ready, release,
    }))
    const worker = fileURLToPath(new URL('./support/relay-lease-worker.mjs', import.meta.url))

    // A dead lease is the legitimate trigger for the observer's stale reclaim.
    fs.writeFileSync(lockFile, JSON.stringify({ token: 'dead-lease', pid: 2147483646, host: 'fixture-host' }) + '\n')
    let injected = false
    fs.renameSync = function patchedRename(from, to) {
      if (!injected && typeof from === 'string' && path.resolve(from) === lockFile && String(to).includes('.stale.')) {
        injected = true
        childA = spawn(process.execPath, [worker, 'A', payloadFile], { cwd: sandbox.root, stdio: 'ignore', windowsHide: true })
        if (!waitForFile(ready, 15000)) throw new Error('worker A never paused inside its run')
        const moved = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
        assert.equal(moved.pid, childA.pid, 'worker A must hold the live lease that gets moved aside')
        originalRename(from, to)
        const workerC = spawnSync(process.execPath, [worker, 'C', payloadFile], {
          cwd: sandbox.root, encoding: 'utf8', timeout: 20000, windowsHide: true,
        })
        assert.equal(workerC.status, 0, 'worker C: ' + String(workerC.stderr || workerC.stdout || '').slice(0, 400))
        fs.writeFileSync(release, 'release')
        return
      }
      return originalRename(from, to)
    }
    let observed = null
    try {
      observed = await openUnifiedRelay({ sandbox, backend, targets: [TARGET_A, TARGET_B], now: () => NOW })
    } finally {
      fs.renameSync = originalRename
    }
    assert.equal(injected, true)
    const resultAFile = path.join(outDir, 'worker-A-result.json')
    const resultCFile = path.join(outDir, 'worker-C-result.json')
    assert.equal(waitForFile(resultAFile, 20000), true, 'worker A never wrote its result')
    assert.equal(waitForFile(resultCFile, 5000), true, 'worker C never wrote its result')
    const resultA = JSON.parse(fs.readFileSync(resultAFile, 'utf8'))
    const resultC = JSON.parse(fs.readFileSync(resultCFile, 'utf8'))
    const store = JSON.parse(fs.readFileSync(latestRelayStoreFile(sandbox.root), 'utf8'))
    const storedA = store.deliveries.find((item) => item.deliveryId === first.delivery.deliveryId)
    const storedB = store.deliveries.find((item) => item.deliveryId === second.delivery.deliveryId)
    // C's successful cancel must survive.
    assert.equal(resultC.ok, true, JSON.stringify(resultC))
    assert.equal(storedB.state, 'CANCEL_REQUESTED', 'worker C cancellation was lost: ' + JSON.stringify({ resultC, resultA }))
    assert.equal(storedB.cancel.requested, true)
    // A must not have committed a stale snapshot over C: its lease/revision authority was lost, so
    // it fails closed with BUSY and its own record stays QUEUED (no successful result is lost).
    assert.equal(resultA.ok, false, JSON.stringify(resultA))
    assert.equal(resultA.code, 'RELAY_CORE_STORE_BUSY', JSON.stringify(resultA))
    assert.equal(storedA.state, 'QUEUED')
  } finally {
    fs.renameSync = originalRename
    if (childA && childA.exitCode === null) {
      try { childA.kill() } catch {}
    }
    removeConfigSandbox(sandbox)
  }
})

/* The same three-process interleaving, but with the pause *after* the lease/revision fence and after
 * the temp file was written/fsynced, immediately before the final temp → store rename (the 0140
 * after-fence window). The commit reservation must keep this revision exclusively ours: C cannot
 * commit the same revision, A's publish is the only one, and no successful result is lost. */
test('PERSIST-02 a stolen lease after the fence cannot let another process publish the same revision', async () => {
  const sandbox = createConfigSandbox()
  const outDir = path.join(sandbox.root, 'race-out')
  fs.mkdirSync(outDir, { recursive: true })
  let childA = null
  const originalRename = fs.renameSync
  try {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z',
      expiresAt: '2026-10-28T00:00:00.000Z', proofRef: 'fixture-rights:relay-demo',
    })
    const backend = createFakeDeliveryBackend({ targets: [TARGET_A, TARGET_B] })
    const relay = await openUnifiedRelay({ sandbox, backend, targets: [TARGET_A, TARGET_B], now: () => NOW })
    assert.equal(relay.ok, true, JSON.stringify(relay))
    const first = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET_A.targetId, requestKey: 'after-fence-a', proofRef: 'fixture-rights:relay-demo',
    }))
    const second = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET_B.targetId, requestKey: 'after-fence-b', proofRef: 'fixture-rights:relay-demo',
    }))
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(second.ok, true, JSON.stringify(second))
    const lockFile = path.join(sandbox.root, LOCK)
    const ready = path.join(sandbox.root, 'race.ready')
    const release = path.join(sandbox.root, 'race.release')
    const payloadFile = path.join(outDir, 'race-payload.json')
    fs.writeFileSync(payloadFile, JSON.stringify({
      root: sandbox.root, target: TARGET_A, now: NOW, outDir,
      idA: first.delivery.deliveryId, idB: second.delivery.deliveryId, ready, release,
    }))
    const worker = fileURLToPath(new URL('./support/relay-lease-worker.mjs', import.meta.url))
    fs.writeFileSync(lockFile, JSON.stringify({ token: 'dead-lease', pid: 2147483646, host: 'fixture-host' }) + '\n')
    let injected = false
    fs.renameSync = function patchedRename(from, to) {
      if (!injected && typeof from === 'string' && path.resolve(from) === lockFile && String(to).includes('.stale.')) {
        injected = true
        childA = spawn(process.execPath, [worker, 'A_PUBLISH', payloadFile], { cwd: sandbox.root, stdio: 'ignore', windowsHide: true })
        if (!waitForFile(ready, 15000)) throw new Error('worker A never paused before its final rename')
        const moved = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
        assert.equal(moved.pid, childA.pid, 'worker A must hold the live lease that gets moved aside')
        originalRename(from, to)
        const workerC = spawnSync(process.execPath, [worker, 'C', payloadFile], {
          cwd: sandbox.root, encoding: 'utf8', timeout: 20000, windowsHide: true,
        })
        assert.equal(workerC.status, 0, 'worker C: ' + String(workerC.stderr || workerC.stdout || '').slice(0, 400))
        fs.writeFileSync(release, 'release')
        return
      }
      return originalRename(from, to)
    }
    let observed = null
    try {
      observed = await openUnifiedRelay({ sandbox, backend, targets: [TARGET_A, TARGET_B], now: () => NOW })
    } finally {
      fs.renameSync = originalRename
    }
    assert.equal(injected, true)
    const resultAFile = path.join(outDir, 'worker-A_PUBLISH-result.json')
    const resultCFile = path.join(outDir, 'worker-C-result.json')
    assert.equal(waitForFile(resultAFile, 20000), true, 'worker A never wrote its result')
    assert.equal(waitForFile(resultCFile, 5000), true, 'worker C never wrote its result')
    const resultA = JSON.parse(fs.readFileSync(resultAFile, 'utf8'))
    const resultC = JSON.parse(fs.readFileSync(resultCFile, 'utf8'))
    const store = JSON.parse(fs.readFileSync(latestRelayStoreFile(sandbox.root), 'utf8'))
    const storedA = store.deliveries.find((item) => item.deliveryId === first.delivery.deliveryId)
    const storedB = store.deliveries.find((item) => item.deliveryId === second.delivery.deliveryId)
    // A had read base N and paused before publishing revision N+1; C legally acquired the lock and
    // published N+1 first. A's immutable create therefore fails: its old snapshot can never overwrite
    // C's successful cancel.
    assert.equal(resultC.ok, true, JSON.stringify(resultC))
    assert.equal(storedB.state, 'CANCEL_REQUESTED', 'worker C cancellation was lost: ' + JSON.stringify({ resultC, resultA }))
    assert.equal(storedB.cancel.requested, true)
    assert.equal(resultA.ok, false, JSON.stringify(resultA))
    assert.equal(resultA.code, 'RELAY_CORE_STORE_BUSY', JSON.stringify(resultA))
    assert.equal(storedA.state, 'QUEUED')
    assert.notEqual(observed && observed.ok, undefined)
  } finally {
    fs.renameSync = originalRename
    if (childA && childA.exitCode === null) {
      try { childA.kill() } catch {}
    }
    removeConfigSandbox(sandbox)
  }
})
