import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSetupScanGate, readBridgeSetupStatus } from '../core/setup-status.mjs'

const valid = { schemaVersion: 1, completed: false, wechatAgent: {}, sender: {}, tts: {} }

test('No-Core is a behavior, not a source-string claim', async () => {
  const result = await readBridgeSetupStatus(null)
  assert.equal(result.available, false)
  assert.equal(result.reason, 'core_not_connected')
  assert.equal(result.data, null)
})

test('valid Core schema becomes available', async () => {
  const result = await readBridgeSetupStatus({ getStatus: async () => valid })
  assert.equal(result.available, true)
  assert.equal(result.data, valid)
  assert.equal(result.reason, '')
})

test('invalid schema and bridge rejection degrade safely', async () => {
  const invalid = await readBridgeSetupStatus({ getStatus: async () => ({ schemaVersion: 1 }) })
  assert.equal(invalid.available, false)
  assert.equal(invalid.reason, 'core_invalid_response')
  const rejected = await readBridgeSetupStatus({ getStatus: async () => { throw new Error('offline') } })
  assert.equal(rejected.available, false)
  assert.match(rejected.reason, /^core_error:/)
})

test('a hanging bridge times out and a later value cannot become the result', async () => {
  let resolve
  const pending = new Promise((r) => { resolve = r })
  const result = await readBridgeSetupStatus({ getStatus: () => pending }, { timeoutMs: 25 })
  assert.equal(result.available, false)
  assert.equal(result.reason, 'core_timeout')
  resolve(valid)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(result.reason, 'core_timeout')
})

test('scan gate marks an older request stale and keeps the newest current', () => {
  const gate = createSetupScanGate()
  const first = gate.begin()
  assert.equal(gate.isCurrent(first), true)
  const second = gate.begin()
  assert.equal(gate.isCurrent(first), false)
  assert.equal(gate.isCurrent(second), true)
  const third = gate.begin()
  assert.equal(gate.isCurrent(second), false)
  assert.equal(gate.isCurrent(third), true)
})
