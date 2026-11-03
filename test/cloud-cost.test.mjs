import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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
  assert.equal(duplicate.ok, true)
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.reservationId, reservation.reservationId)
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

test('a PENDING reservation recovered after restart becomes UNKNOWN and is not a free retry', async (t) => {
  const root = await tempRoot(t)
  const first = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  const reservation = await first.reserve({ requestId: 'restart-001', charCount: 10 })
  assert.equal(reservation.ok, true)
  const second = await openCostLedger({ rootDir: root, limitMicros: 1000, unitPriceMicrosPerCharacter: 10 })
  assert.equal(second.ok, true)
  assert.equal(second.recoveredUnknown, 1)
  const snapshot = second.snapshot()
  assert.equal(snapshot.unknownMicros, 100)
  assert.equal(snapshot.remainingMicros, 900)
  const replay = await second.reserve({ requestId: 'restart-001', charCount: 10 })
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
