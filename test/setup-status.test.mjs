import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createSetupScanGate,
  readBridgeSetupStatus,
  readBridgeCapabilitySnapshot,
  readBridgeCapabilityStatus,
  isValidCapabilitySnapshot,
  isValidCapabilityStatus,
} from '../core/setup-status.mjs'

const valid = { schemaVersion: 1, completed: false, wechatAgent: {}, sender: {}, tts: {} }

function validCapabilityPayload() {
  return {
    schemaVersion: 3,
    ok: true,
    mode: 'read-only',
    writeMode: 'READ_ONLY',
    observedAt: '2026-10-25T00:00:00.000Z',
    components: [{ id: 'core', label: 'Whale Voice Core', status: 'AVAILABLE', versionMatch: 'NOT_APPLICABLE' }],
    sources: [{
      id: 'core',
      label: 'Core',
      surfaces: [{
        id: 'paths',
        label: 'Component paths',
        readTiming: 'HOST_BOOT',
        hotReload: 'NONE',
        requiresRestart: 'REQUIRED',
        ownerApi: { state: 'UNSUPPORTED' },
        save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'UNSUPPORTED', kind: null },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
        status: {
          saved: { state: 'UNAVAILABLE', values: null },
          runtime: { state: 'AVAILABLE' },
          apply: { state: 'UNKNOWN', activeConfirmed: false },
        },
        blockers: [],
      }],
    }],
    summary: {},
  }
}

const validCapability = validCapabilityPayload()

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

test('malformed schema-v3 payloads fail closed', async () => {
  const cases = [
    ['missing surface.save', (data) => { delete data.sources[0].surfaces[0].save }],
    ['missing surface.ownerApi', (data) => { delete data.sources[0].surfaces[0].ownerApi }],
    ['status is a string', (data) => { data.sources[0].surfaces[0].status = 'ok' }],
    ['missing nested status.saved', (data) => { delete data.sources[0].surfaces[0].status.saved }],
    ['null source', (data) => { data.sources = [null] }],
    ['invalid component object', (data) => { data.components = [null] }],
    ['missing summary', (data) => { data.summary = null }],
    ['non-read-only writeMode', (data) => { data.writeMode = 'AUTHORIZED_WRITE' }],
    ['surface blockers is not an array', (data) => { data.sources[0].surfaces[0].blockers = null }],
  ]
  for (const [name, mutate] of cases) {
    const data = validCapabilityPayload()
    mutate(data)
    assert.equal(isValidCapabilitySnapshot(data), false, name + ' should be invalid')
    const result = await readBridgeCapabilitySnapshot({ getCapabilities: async () => data })
    assert.equal(result.available, false, name + ' must fail closed')
    assert.equal(result.reason, 'core_invalid_response', name)
  }
  assert.equal(isValidCapabilitySnapshot(validCapabilityPayload()), true)
})

test('a stale capability result cannot replace a newer one', async () => {
  const gate = createSetupScanGate()
  let applied = null
  let resolveOld
  const old = new Promise((resolve) => { resolveOld = resolve })
  const apply = async (sequence, valuePromise) => {
    const value = await valuePromise
    if (!gate.isCurrent(sequence)) return
    applied = value
  }
  const oldSequence = gate.begin()
  const oldApply = apply(oldSequence, old)
  const newSequence = gate.begin()
  await apply(newSequence, Promise.resolve({ observedAt: 'new' }))
  resolveOld({ observedAt: 'old' })
  await oldApply
  assert.equal(applied.observedAt, 'new')
})

test('capability status reader validates components and surface status blocks', async () => {
  const validStatus = {
    schemaVersion: 3,
    ok: true,
    mode: 'read-only',
    writeMode: 'READ_ONLY',
    observedAt: '2026-10-25T00:00:00.000Z',
    components: [{ id: 'core', label: 'Whale Voice Core', status: 'AVAILABLE', versionMatch: 'NOT_APPLICABLE' }],
    surfaces: [{
      source: 'core',
      surface: 'paths',
      saved: { state: 'UNAVAILABLE' },
      runtime: { state: 'AVAILABLE' },
      apply: { state: 'UNKNOWN' },
      blockers: [],
    }],
    summary: {},
  }
  assert.equal(isValidCapabilityStatus(validStatus), true)
  const ok = await readBridgeCapabilityStatus({ getCapabilityStatus: async () => validStatus })
  assert.equal(ok.available, true)

  const bad = [
    { ...validStatus, schemaVersion: 2 },
    { ...validStatus, components: [null] },
    { ...validStatus, surfaces: [null] },
    { ...validStatus, surfaces: [{ ...validStatus.surfaces[0], saved: 'ok' }] },
    { ...validStatus, surfaces: [{ ...validStatus.surfaces[0], blockers: null }] },
  ]
  for (const data of bad) {
    assert.equal(isValidCapabilityStatus(data), false)
    const result = await readBridgeCapabilityStatus({ getCapabilityStatus: async () => data })
    assert.equal(result.available, false)
    assert.equal(result.reason, 'core_invalid_response')
  }
})
