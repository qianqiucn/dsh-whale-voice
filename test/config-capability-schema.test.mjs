/* Fixture-only tests for the Phase 4B-2B-1 capability contract.
 *
 * They prove the separation the audit document requires:
 * owner API presence / Core authorization / effective enablement / save capability /
 * saved revision / loaded revision / apply confirmation / boot read / hot reload.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createCapabilityReport,
  CAPABILITY_SCHEMA_VERSION,
} from './helpers/config-capability-schema.mjs'

function source(name, surfaces, overrides = {}) {
  return {
    source: name,
    authority: 'fixture component',
    readTiming: 'SERVICE_BOOT',
    hotReload: 'NONE',
    requiresRestart: 'REQUIRED',
    risk: 'HIGH',
    surfaces,
    ...overrides,
  }
}

function senderAutomation(overrides = {}) {
  return {
    surface: 'automation',
    ownerApi: {
      state: 'AVAILABLE',
      kind: 'HTTP',
      scope: 'COMPONENT',
      endpoint: 'PUT /v1/automation/config',
    },
    savedRevision: { state: 'UNSUPPORTED', kind: null },
    loadedRevision: { state: 'UNSUPPORTED', kind: null },
    save: { state: 'SUPPORTED', authorization: 'NOT_AUTHORIZED' },
    apply: { state: 'UNSUPPORTED', reason: 'NO_LOADED_REVISION' },
    blockers: ['NO_WRITE_AUTHORIZATION', 'NO_LOADED_REVISION'],
    ...overrides,
  }
}

function senderTts(overrides = {}) {
  return {
    surface: 'tts',
    ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
    savedRevision: { state: 'UNSUPPORTED', kind: null },
    loadedRevision: { state: 'UNSUPPORTED', kind: null },
    save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
    apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
    blockers: ['NO_OWNER_API', 'REQUIRES_RESTART', 'NO_LOADED_REVISION'],
    ...overrides,
  }
}

function bridgeVoice() {
  return {
    surface: 'voiceSettings',
    ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
    savedRevision: { state: 'UNSUPPORTED', kind: null },
    loadedRevision: { state: 'UNSUPPORTED', kind: null },
    save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
    apply: { state: 'UNSUPPORTED', reason: 'NO_LOADED_REVISION' },
    blockers: ['NO_OWNER_API'],
  }
}

function wechatConsole() {
  return {
    surface: 'config',
    ownerApi: {
      state: 'AVAILABLE',
      kind: 'HTTP_CONSOLE',
      scope: 'HUMAN_CONSOLE',
      endpoint: 'POST /api/config',
    },
    savedRevision: { state: 'SUPPORTED', kind: 'file-sha256' },
    loadedRevision: { state: 'UNSUPPORTED', kind: null },
    save: { state: 'SUPPORTED', authorization: 'NOT_AUTHORIZED' },
    apply: { state: 'UNSUPPORTED', reason: 'NO_LOADED_REVISION' },
    blockers: ['HUMAN_CONSOLE_ONLY', 'NO_WRITE_AUTHORIZATION', 'NO_LOADED_REVISION', 'MIXED_WRITERS'],
  }
}

function report(sources, writeMode = 'READ_ONLY') {
  return createCapabilityReport({
    writeMode,
    observedAt: '2026-10-25T00:00:00.000Z',
    sources,
  })
}

test('Sender automation: owner PUT exists, Core is not authorized, save stays supported', () => {
  const result = report([source('senderService', [senderAutomation()])])
  const entry = result.sources[0].surfaces[0]

  assert.equal(result.schemaVersion, CAPABILITY_SCHEMA_VERSION)
  assert.equal(entry.ownerApi.state, 'AVAILABLE')
  assert.equal(entry.ownerApi.scope, 'COMPONENT')
  assert.equal(entry.save.state, 'SUPPORTED')
  assert.equal(entry.save.authorization, 'NOT_AUTHORIZED')
  assert.equal(entry.save.enabled, false)
  assert.equal(entry.save.gate, 'NO_WRITE_AUTHORIZATION')
  // Missing loaded revision constrains apply, not save.
  assert.equal(entry.loadedRevision.state, 'UNSUPPORTED')
  assert.equal(entry.apply.state, 'UNSUPPORTED')
  assert.equal(entry.apply.reason, 'NO_LOADED_REVISION')
  assert.deepEqual([...entry.blockers].sort(), ['NO_LOADED_REVISION', 'NO_WRITE_AUTHORIZATION'])
  assert.deepEqual([...result.summary.saveSupported], ['senderService.automation'])
  assert.deepEqual([...result.summary.writeEnabled], [])
})

test('Sender TTS: no owner API is UNSUPPORTED, not NOT_AUTHORIZED or UNKNOWN', () => {
  const result = report([source('senderService', [senderTts()])])
  const entry = result.sources[0].surfaces[0]

  assert.equal(entry.ownerApi.state, 'UNSUPPORTED')
  assert.equal(entry.save.state, 'UNSUPPORTED')
  assert.equal(entry.save.gate, 'NO_OWNER_API')
  assert.equal(entry.save.enabled, false)
  // Authorization is its own field: no API does not erase the authorization state.
  assert.equal(entry.save.authorization, 'NOT_AUTHORIZED')
  assert.equal(entry.loadedRevision.state, 'UNSUPPORTED')
  assert.equal(entry.apply.state, 'UNSUPPORTED')
  assert.equal(entry.apply.reason, 'NO_OWNER_API')
  assert.ok([...entry.blockers].includes('NO_OWNER_API'))
})

test('Bridge and WeChatAgent: read timing, hot reload and human console are distinct', () => {
  const result = report([
    source('bridgeVoice', [bridgeVoice()], {
      readTiming: 'PER_CALL',
      hotReload: 'FULL',
      requiresRestart: 'NOT_REQUIRED',
      risk: 'CRITICAL',
    }),
    source('wechatPermissions', [wechatConsole()], {
      readTiming: 'MIXED',
      hotReload: 'PARTIAL',
      requiresRestart: 'REQUIRED',
      risk: 'CRITICAL',
    }),
  ])

  const bridge = result.sources[0]
  assert.equal(bridge.readTiming, 'PER_CALL')
  assert.equal(bridge.hotReload, 'FULL')
  assert.equal(bridge.requiresRestart, 'NOT_REQUIRED')
  assert.equal(bridge.surfaces[0].save.state, 'UNSUPPORTED')

  const wechat = result.sources[1]
  assert.equal(wechat.readTiming, 'MIXED')
  assert.equal(wechat.hotReload, 'PARTIAL')
  assert.equal(wechat.surfaces[0].ownerApi.scope, 'HUMAN_CONSOLE')
  assert.equal(wechat.surfaces[0].save.state, 'SUPPORTED')
  assert.equal(wechat.surfaces[0].save.gate, 'HUMAN_CONSOLE_ONLY')
  assert.equal(wechat.surfaces[0].save.enabled, false)
  assert.equal(wechat.surfaces[0].savedRevision.state, 'SUPPORTED')
})

test('UNKNOWN is not null, UNSUPPORTED or NOT_AUTHORIZED', () => {
  const unknown = {
    surface: 'config',
    ownerApi: { state: 'UNKNOWN', kind: null, scope: null, endpoint: null },
    savedRevision: { state: 'UNKNOWN', kind: null },
    loadedRevision: { state: 'UNKNOWN', kind: null },
    save: { state: 'UNKNOWN', authorization: 'UNKNOWN' },
    apply: { state: 'UNKNOWN', reason: null },
    blockers: ['CAPABILITY_UNKNOWN'],
  }
  const result = report([source('unknownComponent', [unknown], {
    readTiming: 'UNKNOWN',
    hotReload: 'UNKNOWN',
    requiresRestart: 'UNKNOWN',
  })])
  const entry = result.sources[0].surfaces[0]

  for (const value of [
    entry.ownerApi.state,
    entry.savedRevision.state,
    entry.loadedRevision.state,
    entry.save.state,
    entry.save.authorization,
    entry.apply.state,
  ]) {
    assert.equal(value, 'UNKNOWN')
    assert.notEqual(value, null)
    assert.notEqual(value, 'UNSUPPORTED')
    assert.notEqual(value, 'NOT_AUTHORIZED')
  }
  assert.equal(entry.save.enabled, false)
  assert.equal(entry.save.gate, 'UNKNOWN')
  assert.equal(result.sources[0].requiresRestart, 'UNKNOWN')
})

test('null status, a missing owner-API detail and a null restart flag are rejected', () => {
  assert.throws(
    () => report([source('bad', [{ ...senderAutomation(), save: { state: null, authorization: 'UNKNOWN' } }])]),
    /CAPABILITY_SCHEMA_INVALID/,
  )
  assert.throws(
    () => report([source('bad', [{ ...senderAutomation(), ownerApi: { state: 'AVAILABLE', kind: null, scope: 'COMPONENT' } }])]),
    /CAPABILITY_SCHEMA_INVALID/,
  )
  assert.throws(
    () => report([source('bad', [senderAutomation()], { requiresRestart: null })]),
    /CAPABILITY_SCHEMA_INVALID/,
  )
  assert.throws(
    () => report([source('bad', [{ ...senderAutomation(), apply: { state: 'SUPPORTED', reason: null } }])]),
    /CAPABILITY_SCHEMA_INVALID/,
  )
  assert.throws(
    () => report([source('bad', [{ ...senderAutomation(), savedRevision: { state: 'SUPPORTED', kind: null } }])]),
    /CAPABILITY_SCHEMA_INVALID/,
  )
})

test('writeEnabled requires owner API, save capability, authorization, component scope and write mode', () => {
  const authorized = senderAutomation({
    save: { state: 'SUPPORTED', authorization: 'AUTHORIZED' },
    blockers: ['NO_LOADED_REVISION'],
  })
  const readOnly = report([source('senderService', [authorized])], 'READ_ONLY')
  assert.equal(readOnly.sources[0].surfaces[0].save.enabled, false)
  assert.equal(readOnly.sources[0].surfaces[0].save.gate, 'PHASE_READ_ONLY')
  assert.deepEqual([...readOnly.summary.writeAuthorized], ['senderService.automation'])
  assert.deepEqual([...readOnly.summary.writeEnabled], [])

  const writable = report([source('senderService', [authorized])], 'AUTHORIZED_WRITE')
  assert.equal(writable.sources[0].surfaces[0].save.enabled, true)
  assert.equal(writable.sources[0].surfaces[0].save.gate, 'NONE')
  assert.deepEqual([...writable.summary.writeEnabled], ['senderService.automation'])

  const humanConsole = wechatConsole()
  humanConsole.save = { state: 'SUPPORTED', authorization: 'AUTHORIZED' }
  const consoleResult = report([source('wechatPermissions', [humanConsole])], 'AUTHORIZED_WRITE')
  assert.equal(consoleResult.sources[0].surfaces[0].save.enabled, false)
  assert.equal(consoleResult.sources[0].surfaces[0].save.gate, 'HUMAN_CONSOLE_ONLY')
})

test('summary keeps save, authorization and apply capability separate', () => {
  const result = report([
    source('senderService', [senderAutomation(), senderTts()]),
    source('wechatPermissions', [wechatConsole()]),
  ])

  assert.deepEqual([...result.summary.ownerApiAvailable], ['senderService.automation', 'wechatPermissions.config'])
  assert.deepEqual([...result.summary.saveSupported], ['senderService.automation', 'wechatPermissions.config'])
  assert.deepEqual([...result.summary.writeAuthorized], [])
  assert.deepEqual([...result.summary.writeEnabled], [])
  assert.deepEqual([...result.summary.loadedRevisionAvailable], [])
  assert.deepEqual([...result.summary.applySupported], [])
  assert.equal(result.writeMode, 'READ_ONLY')
  assert.equal(JSON.stringify(result).includes('fixture-token'), false)
})
