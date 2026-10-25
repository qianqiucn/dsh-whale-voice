import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  buildCapabilitySnapshot,
  buildCapabilityStatus,
  CAPABILITY_SCHEMA_VERSION,
} from '../core/capabilities.mjs'
import { deriveCapabilityView } from '../core/capability-view.mjs'

function detected(overrides = {}) {
  const base = {
    observedAt: '2026-10-25T00:00:00.000Z',
    wechatAgent: {
      state: 'auth_required', installed: true, version: '0.3.9', processRunning: true,
      connected: false, healthy: null, bridge: 'auth_required', compatibility: 'compatible',
      observedAt: '2026-10-25T00:00:00.000Z', error: 'auth_required',
    },
    sender: {
      state: 'not_running', installed: true, version: '0.1.0', processRunning: false,
      health: 'connection_failed', healthReachable: false, healthy: null,
      observedAt: '2026-10-25T00:00:00.000Z', error: 'not_running',
    },
    qwen: {
      state: 'ok', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1',
      observedAt: '2026-10-25T00:00:00.000Z', error: null,
    },
    config: {
      voice: {
        enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0,
        defaultVoice: 'whale-v1', source: 'voice-settings',
        worker: { enabled: true, mode: 'manual', role: 'final_safety_gate', forGroup: false },
      },
      tts: {
        provider: 'qwen-local', model: null, voice: 'whale-v1', configured: true,
        runtime: { reachable: true, state: 'ok', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1' },
      },
      permissions: { privateCount: 2, groupCount: 1, senderAllowedCount: 1, readable: true },
      sender: {
        serviceVersion: '0.1.0',
        automation: {
          mode: 'manual', autoFindWindow: true, autoOpenChat: false,
          autoRestoreMinimized: true, pauseWhenFullscreen: true, focusFailure: 'text_fallback',
        },
      },
      sources: [{ id: 'core-config', readable: true }],
    },
  }
  return { ...base, ...overrides }
}

function surfaceOf(snapshot, sourceId, surfaceId) {
  const source = snapshot.sources.find((item) => item.id === sourceId)
  assert.ok(source, 'missing source ' + sourceId)
  const surface = source.surfaces.find((item) => item.id === surfaceId)
  assert.ok(surface, 'missing surface ' + sourceId + '.' + surfaceId)
  return surface
}

test('schema v3 keeps reload semantics at surface level', () => {
  const snapshot = buildCapabilitySnapshot({ detected: detected() })
  assert.equal(snapshot.schemaVersion, CAPABILITY_SCHEMA_VERSION)
  assert.equal(snapshot.schemaVersion, 3)
  assert.equal(snapshot.writeMode, 'READ_ONLY')
  assert.equal(snapshot.mode, 'read-only')

  const automation = surfaceOf(snapshot, 'senderService', 'automation')
  assert.equal(automation.readTiming, 'RUNTIME_API')
  assert.equal(automation.hotReload, 'FULL')
  assert.equal(automation.requiresRestart, 'NOT_REQUIRED')

  const tts = surfaceOf(snapshot, 'senderService', 'tts')
  assert.equal(tts.readTiming, 'SERVICE_BOOT')
  assert.equal(tts.hotReload, 'NONE')
  assert.equal(tts.requiresRestart, 'REQUIRED')

  // A source must not carry a reload value that could override its surfaces.
  const senderSource = snapshot.sources.find((item) => item.id === 'senderService')
  assert.equal(Object.hasOwn(senderSource, 'readTiming'), false)
  assert.equal(Object.hasOwn(senderSource, 'hotReload'), false)
  assert.equal(Object.hasOwn(senderSource, 'requiresRestart'), false)
})

test('sender automation is save-capable but unauthorized; TTS has no API', () => {
  const snapshot = buildCapabilitySnapshot({ detected: detected() })
  const automation = surfaceOf(snapshot, 'senderService', 'automation')
  assert.equal(automation.ownerApi.state, 'AVAILABLE')
  assert.equal(automation.save.state, 'SUPPORTED')
  assert.equal(automation.save.authorization, 'NOT_AUTHORIZED')
  assert.equal(automation.save.enabled, false)
  assert.equal(automation.save.gate, 'NO_WRITE_AUTHORIZATION')
  assert.equal(automation.apply.state, 'UNSUPPORTED')
  assert.equal(automation.apply.reason, 'NO_LOADED_REVISION')

  const tts = surfaceOf(snapshot, 'senderService', 'tts')
  assert.equal(tts.ownerApi.state, 'UNSUPPORTED')
  assert.equal(tts.save.state, 'UNSUPPORTED')
  assert.equal(tts.save.gate, 'NO_OWNER_API')

  assert.deepEqual(snapshot.summary.saveSupported, ['senderService.automation', 'wechatPermissions.config'])
  assert.deepEqual(snapshot.summary.writeAuthorized, [])
  assert.deepEqual(snapshot.summary.writeEnabled, [])
  assert.deepEqual(snapshot.summary.loadedRevisionAvailable, [])
  assert.deepEqual(snapshot.summary.applySupported, [])
})

test('changed or unknown component versions downgrade capabilities safely', () => {
  const changed = buildCapabilitySnapshot({ detected: detected({
    wechatAgent: { ...detected().wechatAgent, version: '0.4.0' },
  }) })
  const bridge = surfaceOf(changed, 'bridgeVoice', 'voiceSettings')
  assert.equal(changed.sources.find((item) => item.id === 'bridgeVoice').versionMatch, 'CHANGED')
  assert.equal(bridge.ownerApi.state, 'UNKNOWN')
  assert.equal(bridge.save.state, 'UNKNOWN')
  assert.equal(bridge.apply.state, 'UNKNOWN')
  assert.ok(bridge.blockers.some((blocker) => blocker.code === 'VERSION_NOT_AUDITED'))
  // Sender is a different audited component and must keep its own verdict.
  assert.equal(changed.sources.find((item) => item.id === 'senderService').versionMatch, 'AUDITED')

  const unknown = buildCapabilitySnapshot({ detected: detected({
    sender: { ...detected().sender, version: null },
    config: { ...detected().config, sender: { serviceVersion: null, automation: null } },
  }) })
  const automation = surfaceOf(unknown, 'senderService', 'automation')
  assert.equal(unknown.sources.find((item) => item.id === 'senderService').versionMatch, 'UNKNOWN')
  assert.equal(automation.ownerApi.state, 'UNKNOWN')
  assert.ok(automation.blockers.some((blocker) => blocker.code === 'VERSION_UNKNOWN'))
})

test('static capability and dynamic runtime status stay separate', () => {
  const snapshot = buildCapabilitySnapshot({ detected: detected() })
  const automation = surfaceOf(snapshot, 'senderService', 'automation')
  assert.equal(automation.save.state, 'SUPPORTED')
  assert.equal(automation.status.runtime.state, 'DEGRADED')
  assert.equal(automation.status.saved.state, 'AVAILABLE')
  assert.equal(automation.status.saved.values.mode, 'manual')
  assert.equal(automation.status.apply.state, 'UNKNOWN')
  assert.equal(automation.status.apply.activeConfirmed, false)

  const status = buildCapabilityStatus(snapshot)
  assert.equal(status.schemaVersion, 3)
  assert.equal(status.ok, true)
  assert.equal(status.surfaces.length, 7)
  assert.equal(status.components.length, 6)
  assert.ok(status.surfaces.every((surface) => surface.activeConfirmed !== true))
})

test('no private target, token or absolute path is exposed', () => {
  const snapshot = buildCapabilitySnapshot({ detected: detected() })
  const text = JSON.stringify(snapshot)
  for (const secret of ['fixture-token', 'fixture-private-target', 'fixture-install-path']) {
    assert.equal(text.includes(secret), false, 'capability snapshot leaked ' + secret)
  }
  assert.equal(text.includes('installPath'), false)
  assert.equal(text.includes('privateCount'), true)
  assert.equal(text.includes('privateCount":2'), true)
})

test('capability view renders readable states and surface-specific reload text', () => {
  const snapshot = buildCapabilitySnapshot({ detected: detected() })
  const view = deriveCapabilityView(snapshot)
  assert.equal(view.available, true)
  assert.equal(view.summary.surfaceCount, 7)
  assert.equal(view.summary.saveSupported, 2)
  assert.equal(view.summary.notAuthorized, 7)
  assert.equal(view.summary.writeEnabled, 0)
  assert.match(view.headline, /只读阶段/)
  assert.match(view.groups.senderAutomation.readText, /运行时通过受支持接口更新/)
  assert.match(view.groups.senderAutomation.hotText, /无需重启/)
  assert.match(view.groups.senderTts.readText, /服务启动时读取/)
  assert.match(view.groups.senderTts.hotText, /不会热更新/)
  assert.match(view.groups.senderTts.restartText, /需要重启/)
  assert.equal(view.groups.worker.authorization, 'NOT_AUTHORIZED')
  assert.equal(view.groups.worker.saveState, 'UNSUPPORTED')
  assert.equal(view.groups.qwen.applyCapability, 'UNSUPPORTED')
  assert.ok(view.blockedReasons.length > 0)
})

test('invalid or older capability schema is rejected by the view', () => {
  assert.equal(deriveCapabilityView(null).available, false)
  assert.equal(deriveCapabilityView({ schemaVersion: 2, ok: true, sources: [] }).available, false)
  assert.equal(deriveCapabilityView({ schemaVersion: 3, ok: false, sources: [] }).available, false)
})

test('capability projection source has no I/O, shell or write path', () => {
  const source = readFileSync(new URL('../core/capabilities.mjs', import.meta.url), 'utf8')
  for (const forbidden of ['node:fs', 'node:http', 'child_process', 'writeFile', "fetch("]) {
    assert.equal(source.includes(forbidden), false, 'capability module contains ' + forbidden)
  }
})
