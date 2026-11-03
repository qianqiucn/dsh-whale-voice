import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  CLOUD_COST_ERRORS,
  CLOUD_COST_NAMESPACE,
  estimateCostMicros,
  openCostLedger,
} from '../core/tts/cloud-cost.mjs'

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wv-cost-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  return root
}

test('cost ledger reserves before send, commits actual and rejects duplicate requests', async (t) => {
  const root = await tempRoot(t)
  const ledger = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(ledger.ok, true)
  const reservation = await ledger.reserve({ requestId: 'req-001', charCount: 10 })
  assert.equal(reservation.ok, true)
  assert.equal(reservation.micros, 100)
  assert.equal(ledger.snapshot().pendingMicros, 100)
  const duplicate = await ledger.reserve({ requestId: 'req-001', charCount: 10 })
  assert.equal(duplicate.ok, false)
  assert.equal(duplicate.code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
  assert.equal(duplicate.detail, 'PENDING')
  const commit = await ledger.commit({ reservationId: reservation.reservationId, actualMicros: 100 })
  assert.equal(commit.ok, true)
  const snapshot = ledger.snapshot()
  assert.equal(snapshot.spentMicros, 100)
  assert.equal(snapshot.remainingMicros, 900)
  assert.equal(snapshot.pendingMicros, 0)
  const duplicateAfterCommit = await ledger.reserve({ requestId: 'req-001', charCount: 10 })
  assert.equal(duplicateAfterCommit.code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
  const tooLarge = await ledger.reserve({ requestId: 'req-002', charCount: 95 })
  assert.equal(tooLarge.code, CLOUD_COST_ERRORS.QUOTA_EXCEEDED)
})

test('unknown price or limit fails closed before any reservation', async (t) => {
  const root = await tempRoot(t)
  assert.equal((await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: null })).code, CLOUD_COST_ERRORS.UNKNOWN_PRICE)
  assert.equal((await openCostLedger({ rootDir: root, limitMicros: 0, unitPriceMicrosPerCharacter: 10 })).code, CLOUD_COST_ERRORS.LIMIT_NOT_CONFIGURED)
  assert.equal(estimateCostMicros({ charCount: 10, unitPriceMicrosPerCharacter: 0 }).code, CLOUD_COST_ERRORS.UNKNOWN_PRICE)
})

test('concurrent reservations never overspend the hard limit', async (t) => {
  const root = await tempRoot(t)
  const ledger = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) => ledger.reserve({ requestId: `concurrent-${index}`, charCount: 10 })))
  const accepted = attempts.filter((item) => item.ok === true)
  const rejected = attempts.filter((item) => item.ok === false)
  assert.equal(accepted.length, 10)
  assert.equal(rejected.length, 10)
  assert.ok(rejected.every((item) => item.code === CLOUD_COST_ERRORS.QUOTA_EXCEEDED))
  const snapshot = ledger.snapshot()
  assert.equal(snapshot.pendingMicros, 1000)
  assert.equal(snapshot.remainingMicros, 0)
  for (const item of accepted) {
    assert.equal((await ledger.commit({ reservationId: item.reservationId, actualMicros: item.micros })).ok, true)
  }
  assert.equal(ledger.snapshot().spentMicros, 1000)
})

test('a live PENDING is protected; an owner that loses its claim is recovered as UNKNOWN', async (t) => {
  const root = await tempRoot(t)
  const first = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  const reservation = await first.reserve({ requestId: 'restart-001', charCount: 10 })
  assert.equal(reservation.ok, true)

  const live = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(live.ok, true)
  assert.equal(live.recoveredUnknown, 0)
  assert.equal(live.snapshot().pendingMicros, 100)
  assert.equal((await first.commit({ reservationId: reservation.reservationId, actualMicros: 100 })).ok, true)

  const abandonedReservation = await first.reserve({ requestId: 'restart-002', charCount: 10 })
  assert.equal(abandonedReservation.ok, true)
  first.close()
  const recovered = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(recovered.ok, true)
  assert.equal(recovered.recoveredUnknown, 1)
  const snapshot = recovered.snapshot()
  assert.equal(snapshot.unknownMicros, 100)
  assert.equal(snapshot.remainingMicros, 800)
  const replay = await recovered.reserve({ requestId: 'restart-002', charCount: 10 })
  assert.equal(replay.code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
})

test('a failed ledger write keeps the old durable state', async (t) => {
  const root = await tempRoot(t)
  let failRename = false
  const ledger = await openCostLedger({
    rootDir: root,
    limitMicros: 1000,
    unitPriceMicrosPerCharacter: 10,
    hooks: {
      beforeRename() {
        if (failRename) throw new Error('injected ledger write failure')
      },
    },
  })
  failRename = true
  const failed = await ledger.reserve({ requestId: 'write-fail-001', charCount: 10 })
  assert.equal(failed.code, CLOUD_COST_ERRORS.LEDGER_WRITE_FAILED)
  assert.equal(ledger.snapshot().pendingMicros, 0)
  failRename = false
  const reopened = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(reopened.recoveredUnknown, 0)
  assert.equal(reopened.snapshot().pendingMicros, 0)
})

test('a corrupt ledger fails closed instead of resetting the budget', async (t) => {
  const root = await tempRoot(t)
  const ledger = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(ledger.ok, true)
  await fs.writeFile(path.join(root, CLOUD_COST_NAMESPACE, 'cost-ledger-v1.json'), '{"schemaVersion":1,"currency":"USD"}', 'utf8')
  const reopened = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(reopened.code, CLOUD_COST_ERRORS.LEDGER_CORRUPT)
})

test('a changed budget/price does not silently reuse the old ledger', async (t) => {
  const root = await tempRoot(t)
  const first = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(first.ok, true)
  const changed = await openCostLedger({ rootDir: root, limitMicros: 2000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(changed.code, CLOUD_COST_ERRORS.CONFIG_MISMATCH)
})

test('two handles on the same root share one atomic authority and cannot overspend', async (t) => {
  const root = await tempRoot(t)
  const first = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  const second = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  const reservationA = await first.reserve({ requestId: 'shared-a', charCount: 10 })
  assert.equal(reservationA.ok, true)
  assert.equal((await first.commit({ reservationId: reservationA.reservationId, actualMicros: 100 })).ok, true)
  const reservationB = await second.reserve({ requestId: 'shared-b', charCount: 95 })
  assert.equal(reservationB.code, CLOUD_COST_ERRORS.QUOTA_EXCEEDED)
  const reservationC = await second.reserve({ requestId: 'shared-c', charCount: 10 })
  assert.equal(reservationC.ok, true)
  assert.equal((await second.commit({ reservationId: reservationC.reservationId, actualMicros: 100 })).ok, true)
  const reopened = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(reopened.snapshot().spentMicros, 200)
  const over = await reopened.reserve({ requestId: 'shared-d', charCount: 100 })
  assert.equal(over.code, CLOUD_COST_ERRORS.QUOTA_EXCEEDED)
})

test('a live/foreign lock is not stolen by age and is not deleted by another handle', async (t) => {
  const root = await tempRoot(t)
  const ledger = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10, lockTimeoutMs: 100 })
  assert.equal(ledger.ok, true)
  const lockPath = path.join(root, CLOUD_COST_NAMESPACE, 'cost-ledger-v1.json.lock')
  await fs.writeFile(lockPath, JSON.stringify({ schemaVersion: 1, token: 'someone-else', pid: 999999, host: 'test', createdAt: '2000-01-01T00:00:00.000Z' }), 'utf8')
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await fs.utimes(lockPath, old, old)
  const blocked = await ledger.reserve({ requestId: 'foreign-lock', charCount: 10 })
  assert.equal(blocked.code, CLOUD_COST_ERRORS.LEDGER_BUSY)
  const still = JSON.parse(await fs.readFile(lockPath, 'utf8'))
  assert.equal(still.token, 'someone-else')
  await fs.unlink(lockPath)
  assert.equal((await ledger.reserve({ requestId: 'after-lock', charCount: 10 })).ok, true)
})

test('slow temp I/O cannot overwrite a concurrently committed record', async (t) => {
  const root = await tempRoot(t)
  let delayNext = true
  const slow = await openCostLedger({
    rootDir: root,
    limitMicros: 1000,
    unitPriceMicrosPerCharacter: 10,
    hooks: {
      async beforeRename() {
        if (!delayNext) return
        delayNext = false
        await new Promise((resolve) => setTimeout(resolve, 120))
      },
    },
  })
  const fast = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  const slowReservationPromise = slow.reserve({ requestId: 'slow-a', charCount: 10 })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const fastReservation = await fast.reserve({ requestId: 'fast-b', charCount: 10 })
  assert.equal(fastReservation.ok, true)
  assert.equal((await fast.commit({ reservationId: fastReservation.reservationId, actualMicros: 100 })).ok, true)
  const slowReservation = await slowReservationPromise
  assert.equal(slowReservation.ok, true)
  assert.equal((await slow.commit({ reservationId: slowReservation.reservationId, actualMicros: 100 })).ok, true)
  const reopened = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(reopened.snapshot().spentMicros, 200)
  assert.equal(reopened.snapshot().completedCount, 2)
  assert.equal((await reopened.reserve({ requestId: 'fast-b', charCount: 10 })).code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
  assert.equal((await reopened.reserve({ requestId: 'slow-a', charCount: 10 })).code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
})

test('a crashed child process leaves PENDING as UNKNOWN and the same id cannot replay', async (t) => {
  const root = await tempRoot(t)
  const moduleUrl = pathToFileURL(path.resolve('core/tts/cloud-cost.mjs')).href
  const code = `
import { openCostLedger } from ${JSON.stringify(moduleUrl)}
const ledger = await openCostLedger({ rootDir: process.env.WV_COST_ROOT, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
const reservation = await ledger.reserve({ requestId: 'crash-child', charCount: 10 })
if (!reservation.ok) process.exit(3)
process.exit(0)
`
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(),
    env: { ...process.env, WV_COST_ROOT: root },
    stdio: 'ignore',
  })
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (codeValue) => resolve(codeValue))
  })
  assert.equal(exitCode, 0)
  const reopened = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(reopened.ok, true)
  assert.equal(reopened.recoveredUnknown, 1)
  assert.equal(reopened.snapshot().unknownMicros, 100)
  assert.equal((await reopened.reserve({ requestId: 'crash-child', charCount: 10 })).code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
})

test('a full dedup history fails closed without losing an old UNKNOWN request', async (t) => {
  const root = await tempRoot(t)
  const dir = path.join(root, CLOUD_COST_NAMESPACE)
  await fs.mkdir(dir, { recursive: true })
  const completed = Array.from({ length: 512 }, (_, index) => ({
    requestId: `old-${index}`,
    state: 'UNKNOWN',
    micros: 10,
    at: '2026-11-03T00:00:00.000Z',
  }))
  const state = {
    schemaVersion: 1,
    currency: 'USD',
    mode: 'paid',
    revision: 0,
    maxCalls: 512,
    limitMicros: 1000000,
    unitPriceMicrosPerCharacter: 10,
    spentMicros: 0,
    unknownMicros: 5120,
    reservations: [],
    completed,
    updatedAt: '2026-11-03T00:00:00.000Z',
  }
  await fs.writeFile(path.join(dir, 'cost-ledger-v1.json'), JSON.stringify(state), 'utf8')
  const ledger = await openCostLedger({ rootDir: root, limitMicros: 1000000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(ledger.ok, true)
  assert.equal((await ledger.reserve({ requestId: 'old-0', charCount: 1 })).code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
  assert.equal((await ledger.reserve({ requestId: 'new-after-full', charCount: 1 })).code, CLOUD_COST_ERRORS.CALL_LIMIT_EXCEEDED)
})

test('a free ledger still enforces a durable call limit and deduplication', async (t) => {
  const root = await tempRoot(t)
  const ledger = await openCostLedger({ rootDir: root, mode: 'free', maxCalls: 2, limitMicros: 0, unitPriceMicrosPerCharacter: 0 })
  assert.equal(ledger.ok, true)
  const first = await ledger.reserve({ requestId: 'free-1', charCount: 10 })
  const second = await ledger.reserve({ requestId: 'free-2', charCount: 10 })
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.micros, 0)
  assert.equal((await ledger.reserve({ requestId: 'free-3', charCount: 10 })).code, CLOUD_COST_ERRORS.CALL_LIMIT_EXCEEDED)
  assert.equal((await ledger.reserve({ requestId: 'free-1', charCount: 10 })).code, CLOUD_COST_ERRORS.DUPLICATE_REQUEST)
  assert.equal(ledger.snapshot().mode, 'free')
  assert.equal(ledger.snapshot().callsUsed, 2)
})
