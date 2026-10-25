import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSetupScanGate, readBridgeSetupStatus, readBridgeCapabilitySnapshot } from '../core/setup-status.mjs'

const valid = { schemaVersion: 1, completed: false, wechatAgent: {}, sender: {}, tts: {} }
const validCapability = {
  schemaVersion: 3, ok: true, mode: 'read-only', writeMode: 'READ_ONLY',
  observedAt: '2026-10-25T00:00:00.000Z',
  components: [{ id: 'core', status: 'AVAILABLE' }],
  sources: [{ id: 'core', surfaces: [{ id: 'paths' }] }],
  summary: { surfaceCount: 1 },
}

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

test('capability snapshot requires schema v3 and fails closed on older data', async () => {
  const ok = await readBridgeCapabilitySnapshot({ getCapabilities: async () => validCapability })
  assert.equal(ok.available, true)
  assert.equal(ok.data.schemaVersion, 3)

  const old = await readBridgeCapabilitySnapshot({ getCapabilities: async () => ({ ...validCapability, schemaVersion: 2 }) })
  assert.equal(old.available, false)
  assert.equal(old.reason, 'core_invalid_response')

  const missing = await readBridgeCapabilitySnapshot({})
  assert.equal(missing.available, false)
  assert.equal(missing.reason, 'core_not_connected')
})

test('capability snapshot times out and never accepts a late value', async () => {
  let resolve
  const pending = new Promise((r) => { resolve = r })
  const result = await readBridgeCapabilitySnapshot({ getCapabilities: () => pending }, { timeoutMs: 25 })
  assert.equal(result.available, false)
  assert.equal(result.reason, 'core_timeout')
  resolve(validCapability)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(result.reason, 'core_timeout')
})
