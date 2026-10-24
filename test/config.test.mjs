import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, after } from 'node:test'

import { readConfigSnapshot } from '../core/config.mjs'
import { deriveConfigView } from '../core/view.mjs'

const roots = []
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'whale-config-'))
  roots.push(root)
  return root
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value), 'utf8')
}
async function makePaths() {
  const root = await fixture()
  const dshHome = path.join(root, '.dsh')
  const wechatAgentRoot = path.join(root, 'wechat-agent')
  const senderRoot = path.join(root, 'voice-sender')
  await mkdir(dshHome, { recursive: true })
  return {
    root,
    config: {
      dshHome,
      configPath: path.join(dshHome, 'whale-voice', 'core.json'),
      wechatAgentRoot,
      senderRoot,
      qwenUrl: 'http://127.0.0.1:8765',
    },
  }
}
async function makeFixture(options = {}) {
  const { root, config } = await makePaths()
  const wa = options.wa === undefined ? {
    wechat: {
      wake_mode: 'mention',
      whitelist: { private: ['wechat:private:fixture-a', 'wechat:private:fixture-b'], groups: ['wechat:group:fixture-group'] },
    },
  } : options.wa
  const voiceSettings = options.voiceSettings === undefined ? {
    enabled: false,
    mode: 'explicit',
    for_group: false,
    auto_probability: 0,
    default_voice: 'whale-v1',
    allowed_targets: { 'private:fixture-a': 'Fixture A' },
  } : options.voiceSettings
  const worker = options.worker === undefined ? {
    voice_enabled: false,
    voice_auto_mode: 'explicit',
    voice_allow_group_auto: false,
    voice_auto_find_window: true,
    voice_auto_open_chat: false,
    voice_auto_restore_minimized: true,
    voice_pause_when_fullscreen: true,
  } : options.worker
  const service = options.service === undefined ? {
    port: 43371,
    host: '127.0.0.1',
    tts: { provider: 'qwen-local', voiceId: 'whale-v1', baseUrl: 'http://127.0.0.1:8765', model: 'saved-model' },
    automation: { mode: 'explicit', autoFindWindow: true, autoOpenChat: false, autoRestoreMinimized: true, pauseWhenFullscreen: true },
    allowedChats: ['wechat:private:fixture-a'],
  } : options.service
  const servicePackage = options.servicePackage === undefined ? { name: 'voice-sender-service', version: '0.1.0' } : options.servicePackage
  const write = options.write || {}
  if (write.core !== false) await writeJson(config.configPath, options.core || { schemaVersion: 1 })
  if (write.wa !== false && wa !== null) await writeJson(path.join(config.wechatAgentRoot, 'data/workspace/config/wechatagent.json'), wa)
  if (write.voiceSettings !== false && voiceSettings !== null) await writeJson(path.join(config.wechatAgentRoot, 'data/workspace/state/voice-settings.json'), voiceSettings)
  if (write.worker !== false && worker !== null) await writeJson(path.join(config.senderRoot, 'config.json'), worker)
  if (write.service !== false && service !== null) await writeJson(path.join(config.senderRoot, 'service/service.config.json'), service)
  if (write.servicePackage !== false && servicePackage !== null) await writeJson(path.join(config.senderRoot, 'service/package.json'), servicePackage)
  return { root, config }
}
function runtime(overrides = {}) {
  return {
    wechatAgent: { state: 'auth_required' },
    sender: { processRunning: false, healthReachable: false, healthy: null, state: 'connection_failed' },
    tts: { state: 'ok', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', preview: { ok: false } },
    ...overrides,
  }
}
function workerConfig(overrides = {}) {
  return {
    voice_enabled: false,
    voice_auto_mode: 'explicit',
    voice_allow_group_auto: false,
    voice_auto_find_window: true,
    voice_auto_open_chat: false,
    voice_auto_restore_minimized: true,
    voice_pause_when_fullscreen: true,
    ...overrides,
  }
}
function serviceConfig(overrides = {}) {
  return {
    port: 43371,
    host: '127.0.0.1',
    tts: { provider: 'qwen-local', voiceId: 'whale-v1', baseUrl: 'http://127.0.0.1:8765', model: 'saved-model' },
    automation: { mode: 'explicit', autoFindWindow: true, autoOpenChat: false, autoRestoreMinimized: true, pauseWhenFullscreen: true },
    allowedChats: ['wechat:private:fixture-a'],
    ...overrides,
  }
}
function revisionOf(config) {
  return readConfigSnapshot({ config, runtime: runtime() }).configRevision
}

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

test('missing config files remain unknown and never become false', async () => {
  const { config } = await makePaths()
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.voice.enabled, null)
  assert.equal(snapshot.voice.mode, null)
  assert.equal(snapshot.tts.configured, false)
  assert.equal(snapshot.permissions.privateCount, null)
  assert.equal(snapshot.application.state, 'UNKNOWN')
  assert.ok(snapshot.sources.some((source) => source.id === 'voice-settings' && source.error === 'missing'))
})

test('invalid JSON degrades per source and does not hide the error', async () => {
  const { config } = await makeFixture()
  await writeFile(path.join(config.wechatAgentRoot, 'data/workspace/state/voice-settings.json'), '{not-json', 'utf8')
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.voice.enabled, null)
  assert.ok(snapshot.sources.find((source) => source.id === 'voice-settings').error === 'invalid_json')
  assert.ok(snapshot.sourceErrors.some((row) => row.id === 'voice-settings'))
})

test('unsupported schema is rejected instead of interpreted', async () => {
  const { config } = await makeFixture({
    voiceSettings: { schemaVersion: 2, enabled: true, mode: 'explicit' },
    worker: {},
  })
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.voice.enabled, null)
  assert.ok(snapshot.sources.find((source) => source.id === 'voice-settings').error === 'schema_unsupported')
})

test('saved enabled false is read as false, not unknown', async () => {
  const { config } = await makeFixture()
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.voice.enabled, false)
  assert.equal(snapshot.voice.mode, 'explicit')
  assert.equal(snapshot.voice.triggerMode, 'mention')
  assert.equal(snapshot.voice.consistency, 'not_comparable')
  assert.equal(snapshot.voice.worker.enabled, false)
  assert.equal(snapshot.voice.worker.role, 'final_safety_gate')
})

test('Bridge user switch and Worker safety permit are separate layers', async () => {
  const { config } = await makeFixture({
    voiceSettings: { enabled: false, mode: 'explicit', default_voice: 'whale-v1' },
    worker: { voice_enabled: true, voice_auto_mode: 'manual', voice_allow_group_auto: false },
    service: {
      tts: { provider: 'qwen-local', voiceId: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' },
      automation: { mode: 'manual', autoFindWindow: true, autoOpenChat: false, autoRestoreMinimized: true, pauseWhenFullscreen: true },
      allowedChats: ['fixture'],
    },
  })
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.voice.enabled, false)
  assert.equal(snapshot.voice.worker.enabled, true)
  assert.equal(snapshot.voice.consistency, 'not_comparable')
  assert.equal(snapshot.application.state, 'UNKNOWN')
  assert.equal(snapshot.voice.worker.role, 'final_safety_gate')
})

test('saved enabled true is read as true, not treated as active', async () => {
  const { config } = await makeFixture({
    voiceSettings: { enabled: true, mode: 'manual', for_group: false, auto_probability: 10, default_voice: 'whale-v1' },
    worker: { voice_enabled: true, voice_auto_mode: 'manual', voice_allow_group_auto: false },
  })
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.voice.enabled, true)
  assert.equal(snapshot.voice.active.confirmed, false)
  assert.equal(snapshot.application.activeRevision, null)
})

test('enabled null remains null', async () => {
  const { config } = await makeFixture({ voiceSettings: { mode: 'explicit', default_voice: 'whale-v1' } })
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.voice.enabled, null)
})

test('saved and active states stay separate', async () => {
  const { config } = await makeFixture()
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.application.saved, true)
  assert.equal(snapshot.application.activeConfirmed, false)
  assert.equal(snapshot.application.activeRevision, null)
  assert.equal(snapshot.voice.active.confirmed, false)
  assert.notEqual(snapshot.application.state, 'ACTIVE')
})

test('service/worker mismatch is reported instead of merged', async () => {
  const { config } = await makeFixture({
    service: {
      tts: { provider: 'qwen-local', voiceId: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' },
      automation: { mode: 'manual', autoFindWindow: true, autoOpenChat: true, autoRestoreMinimized: true, pauseWhenFullscreen: true },
      allowedChats: ['fixture'],
    },
    worker: { voice_auto_mode: 'manual', voice_auto_open_chat: false },
  })
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.sender.serviceWorkerConsistency, 'mismatch')
  assert.equal(snapshot.application.state, 'MISMATCH')
  assert.equal(snapshot.sender.configAvailable, true)
})

test('sender offline is reported as config/process mismatch with unknown health', async () => {
  const { config } = await makeFixture()
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.sender.serviceRunning, false)
  assert.equal(snapshot.sender.configProcessMismatch, true)
  assert.equal(snapshot.sender.healthReachable, false)
  assert.equal(snapshot.sender.healthy, null)
  assert.equal(snapshot.sender.recoveryPending, null)
})

test('Qwen health can be reachable while provider config is absent', async () => {
  const { config } = await makeFixture({ service: { port: 43371, allowedChats: [] } })
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.tts.configured, false)
  assert.equal(snapshot.tts.runtime.reachable, true)
  assert.equal(snapshot.tts.runtime.model, 'Qwen3-TTS-12Hz-1.7B-Base')
})

test('saved TTS model and runtime model mismatch is explicit', async () => {
  const { config } = await makeFixture()
  const snapshot = readConfigSnapshot({ config, runtime: runtime({ tts: { state: 'ok', model: 'another-model', voice: 'whale-v1' } }) })
  assert.equal(snapshot.tts.mismatch, 'model')
})

test('permission counts are exposed without private target details', async () => {
  const { config } = await makeFixture()
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  assert.equal(snapshot.permissions.privateCount, 2)
  assert.equal(snapshot.permissions.groupCount, 1)
  assert.equal(snapshot.permissions.detailAvailable, false)
  const serialized = JSON.stringify(snapshot)
  assert.equal(serialized.includes('Fixture A'), false)
  assert.equal(serialized.includes('fixture-group'), false)
  assert.equal(serialized.includes('wechat:private:fixture-a'), false)
})

test('sensitive fixture fields never enter the snapshot', async () => {
  const { config } = await makeFixture({
    wa: { wechat: { whitelist: { private: ['private-secret-name'], groups: ['group-secret-name'] } } },
    voiceSettings: { enabled: false, allowed_targets: { 'private-secret-name': 'Secret Person' } },
    service: { tts: { provider: 'qwen-local', voiceId: 'whale-v1', baseUrl: 'http://127.0.0.1:8765', tokenFile: 'C:/secret/token.txt' }, allowedChats: ['secret-chat'] },
  })
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  const serialized = JSON.stringify(snapshot)
  for (const secret of ['private-secret-name', 'group-secret-name', 'Secret Person', 'secret-chat', 'token.txt', 'Bearer']) {
    assert.equal(serialized.includes(secret), false, 'leaked ' + secret)
  }
})

test('reading config does not mutate files or start a process', async () => {
  const { config } = await makeFixture()
  const file = path.join(config.senderRoot, 'config.json')
  const before = await readFile(file, 'utf8')
  const beforeStat = await stat(file)
  readConfigSnapshot({ config, runtime: runtime() })
  const after = await readFile(file, 'utf8')
  const afterStat = await stat(file)
  assert.equal(after, before)
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs)
})

test('frontend config view uses real values and unknown stays unknown', async () => {
  const { config } = await makeFixture()
  const snapshot = readConfigSnapshot({ config, runtime: runtime() })
  const view = deriveConfigView(snapshot)
  assert.equal(view.available, true)
  assert.equal(view.voice.enabledText, 'Bridge 已保存：关闭')
  assert.equal(view.voice.activeText, '实际生效：未确认')
  assert.equal(view.tts.provider, 'qwen-local')
  assert.equal(view.permissions.detailAvailable, false)
  assert.equal(view.sender.runningText, '未运行')
  assert.equal(view.application.state, 'UNKNOWN')
})

test('Core disconnected and Mock config are not treated as real config', () => {
  assert.equal(deriveConfigView(null).available, false)
  assert.equal(deriveConfigView({ schemaVersion: 1, demo: true, voice: { enabled: false } }).available, false)
})

test('old config result cannot replace a newer view through the scan gate', async () => {
  const { createSetupScanGate } = await import('../core/setup-status.mjs')
  const gate = createSetupScanGate()
  const old = gate.begin()
  const fresh = gate.begin()
  assert.equal(gate.isCurrent(old), false)
  assert.equal(gate.isCurrent(fresh), true)
})

test('config revision changes for every authoritative worker field', async () => {
  const base = await makeFixture()
  const r0 = revisionOf(base.config)
  for (const change of [
    { voice_auto_mode: 'manual' },
    { voice_allow_group_auto: true },
    { voice_enabled: true },
  ]) {
    await writeJson(path.join(base.config.senderRoot, 'config.json'), workerConfig(change))
    assert.notEqual(revisionOf(base.config), r0, JSON.stringify(change))
  }
})

test('config revision changes when TTS base URL changes', async () => {
  const a = await makeFixture({ service: serviceConfig() })
  const b = await makeFixture({ service: serviceConfig({ tts: { provider: 'qwen-local', voiceId: 'whale-v1', baseUrl: 'http://127.0.0.1:9999', model: 'saved-model' } }) })
  assert.notEqual(revisionOf(a.config), revisionOf(b.config))
})

test('config revision changes when an allowlist ID changes without count change', async () => {
  const a = await makeFixture()
  await writeJson(path.join(a.config.wechatAgentRoot, 'data/workspace/state/voice-settings.json'), {
    enabled: false, mode: 'explicit', for_group: false, auto_probability: 0, default_voice: 'whale-v1',
    allowed_targets: { 'private:fixture-a': 'Fixture A' },
  })
  const r1 = revisionOf(a.config)
  await writeJson(path.join(a.config.wechatAgentRoot, 'data/workspace/state/voice-settings.json'), {
    enabled: false, mode: 'explicit', for_group: false, auto_probability: 0, default_voice: 'whale-v1',
    allowed_targets: { 'private:fixture-z': 'Fixture A' },
  })
  assert.notEqual(revisionOf(a.config), r1)
})

test('config revision changes when permission identity changes without count change', async () => {
  const a = await makeFixture()
  const r1 = revisionOf(a.config)
  await writeJson(path.join(a.config.wechatAgentRoot, 'data/workspace/config/wechatagent.json'), {
    wechat: { wake_mode: 'mention', whitelist: { private: ['wechat:private:fixture-z', 'wechat:private:fixture-b'], groups: ['wechat:group:fixture-group'] } },
  })
  assert.notEqual(revisionOf(a.config), r1)
})

test('config revision changes when a config source appears or disappears', async () => {
  const hidden = await makeFixture({ write: { voiceSettings: false } })
  const hiddenRevision = revisionOf(hidden.config)
  const visible = await makeFixture()
  assert.notEqual(revisionOf(visible.config), hiddenRevision)
})

test('config revision changes when a config source becomes unreadable', async () => {
  const f = await makeFixture()
  const before = revisionOf(f.config)
  await writeFile(path.join(f.config.wechatAgentRoot, 'data/workspace/state/voice-settings.json'), '{broken', 'utf8')
  const after = readConfigSnapshot({ config: f.config, runtime: runtime() })
  assert.notEqual(after.configRevision, before)
  assert.ok(after.sources.some((source) => source.id === 'voice-settings' && source.error === 'invalid_json'))
})

test('config revision changes when permission counts change', async () => {
  const f = await makeFixture()
  const before = revisionOf(f.config)
  await writeJson(path.join(f.config.wechatAgentRoot, 'data/workspace/config/wechatagent.json'), {
    wechat: { wake_mode: 'mention', whitelist: { private: ['wechat:private:fixture-a', 'wechat:private:fixture-b'], groups: ['wechat:group:fixture-group', 'wechat:group:fixture-second'] } },
  })
  assert.notEqual(revisionOf(f.config), before)
})

test('config revision is stable for no change and for object key order', async () => {
  const a = await makeFixture()
  const r1 = revisionOf(a.config)
  const r2 = revisionOf(a.config)
  assert.equal(r1, r2)
  await writeJson(path.join(a.config.senderRoot, 'config.json'), {
    voice_pause_when_fullscreen: true,
    voice_auto_restore_minimized: true,
    voice_auto_open_chat: false,
    voice_auto_find_window: true,
    voice_allow_group_auto: false,
    voice_auto_mode: 'explicit',
    voice_enabled: false,
  })
  assert.equal(revisionOf(a.config), r1)
})

test('config revision is opaque and does not expose private values', async () => {
  const f = await makeFixture({
    wa: { wechat: { whitelist: { private: ['private-secret-id'], groups: ['group-secret-id'] } } },
    voiceSettings: { enabled: false, allowed_targets: { 'private-secret-id': 'Secret Name' } },
    service: serviceConfig({ tts: { provider: 'qwen-local', voiceId: 'whale-v1', baseUrl: 'http://127.0.0.1:9999' }, allowedChats: ['secret-chat'] }),
  })
  const snapshot = readConfigSnapshot({ config: f.config, runtime: runtime() })
  assert.match(snapshot.configRevision, /^[a-f0-9]{32}$/)
  const serialized = JSON.stringify(snapshot)
  for (const secret of ['private-secret-id', 'group-secret-id', 'Secret Name', 'secret-chat', 'http://127.0.0.1:9999']) {
    assert.equal(serialized.includes(secret), false, 'leaked ' + secret)
  }
  assert.equal(snapshot.application.activeRevision, null)
  assert.equal(snapshot.application.activeConfirmed, false)
})
