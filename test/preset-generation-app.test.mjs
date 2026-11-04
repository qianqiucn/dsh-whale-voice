import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { PRESET_GENERATION_APP_ERRORS, openPresetGenerationApp } from '../core/preset-generation-app.mjs'
import { createQwenProvider } from '../core/tts/qwen-adapter.mjs'
import { createQwenSupervisor } from '../core/tts/qwen-supervisor.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const coreFile = path.join(here, '..', 'core', 'preset-generation-app.mjs')
const fakeRoot = path.join(here, '..', 'test-fixtures')
const fakeWorker = path.join(fakeRoot, 'fake-qwen-worker.mjs')

const SPAWN_OK = (() => {
  try {
    const probe = spawnSync(process.execPath, ['-e', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
    return !probe.error && probe.status === 0
  } catch {
    return false
  }
})()
const spawnSkip = SPAWN_OK ? false : 'child_process spawn is not permitted on this platform'

const SCOPE = 'scope:fixture-core-preset'
const PROOF = 'fixture-rights:core-preset'
const VOICES = Object.freeze([
  { id: 'demo-voice-a', label: '示例女声 A', languages: ['zh-CN'] },
  { id: 'demo-voice-b', label: '示例男声 B', languages: ['zh-CN', 'en-US'] },
])

function makeSupervisor() {
  return createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
  })
}

async function openApp(sandbox, provider) {
  const opened = await openPresetGenerationApp({
    sandbox,
    provider,
    scopeId: SCOPE,
    rightsProofRef: PROOF,
    voices: VOICES,
    now: () => new Date().toISOString(),
  })
  assert.equal(opened.ok, true, JSON.stringify(opened))
  return opened.value
}

test('135 the Core preset generation entry generates, saves on the original task and reopens', { skip: spawnSkip }, async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-core-preset-' })
  const supervisor = makeSupervisor()
  let provider = null
  try {
    provider = createQwenProvider({ supervisor, requestTimeoutMs: 5000 })
    assert.equal(provider.ok, true, JSON.stringify(provider))
    const started = await provider.start()
    assert.equal(started.ok, true, JSON.stringify(started))
    const app = await openApp(sandbox, provider)

    const catalog = app.catalog()
    assert.equal(catalog.ok, true)
    assert.equal(catalog.fixtureOnly, true)
    assert.equal(catalog.realReady, false)
    assert.equal(catalog.textLimit, 200)
    assert.deepEqual(catalog.voices.map((voice) => voice.id), ['demo-voice-a', 'demo-voice-b'])

    const first = await app.generate({ text: '你好，这是正式 Core 的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(first.state, 'SAVED')
    assert.equal(first.ownerState, 'SAVED')
    assert.equal(first.origin, 'PROVIDER_GENERATION_FIXTURE')
    assert.match(first.taskId, /^task:fixture-[0-9a-f]{32}$/)
    assert.match(first.artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    assert.match(first.sha256, /^[0-9a-f]{64}$/)
    assert.ok(first.byteLength > 44)

    const status = await app.status(first.taskId)
    assert.equal(status.ok, true, JSON.stringify(status))
    assert.equal(status.state, 'SAVED')
    assert.equal(status.ownerState, 'SAVED')
    assert.equal(status.readable, true)
    assert.equal(status.artifactRef, first.artifactRef)
    assert.equal(status.sha256, first.sha256)
    assert.equal(status.byteLength, first.byteLength)
    assert.equal(status.origin, 'PROVIDER_GENERATION_FIXTURE')

    // Existing Fixture imports keep their own origin; the Provider generation record does not change it.
    const library = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(library.ok, true, JSON.stringify(library))
    const imported = await library.value.import({
      schemaVersion: 1,
      scopeId: SCOPE,
      requestKey: 'key:fixture-import-origin',
      bytes: wavFromSamples([1200, -2200, 32767, -32768], 24000),
      now: new Date().toISOString(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      rights: { state: 'GRANTED', proofRef: PROOF },
    })
    assert.equal(imported.ok, true, JSON.stringify(imported))
    assert.equal(imported.value.artifact.origin, 'FIXTURE_IMPORT')
    const unknownOrigin = await library.value.import({
      schemaVersion: 1,
      scopeId: SCOPE,
      requestKey: 'key:fixture-import-bad-origin',
      bytes: wavFromSamples([1, 2, 3, 4], 24000),
      now: new Date().toISOString(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      rights: { state: 'GRANTED', proofRef: PROOF },
      origin: 'NOT_A_REAL_ORIGIN',
    })
    assert.equal(unknownOrigin.ok, false)
    assert.equal(unknownOrigin.errors[0].path, 'origin')

    // Invalid requests are rejected; they are not turned into a fixed success result.
    const badVoice = await app.generate({ text: 'x', voiceId: 'not-a-voice' })
    assert.equal(badVoice.ok, false)
    assert.equal(badVoice.code, PRESET_GENERATION_APP_ERRORS.VOICE_REJECTED)
    const badText = await app.generate({ text: '   ', voiceId: 'demo-voice-a' })
    assert.equal(badText.ok, false)
    assert.equal(badText.code, PRESET_GENERATION_APP_ERRORS.TEXT_REJECTED)

    // A second generation mints a different original task.
    const second = await app.generate({ text: '第二个 Core 隔离请求。', voiceId: 'demo-voice-a' })
    assert.equal(second.ok, true, JSON.stringify(second))
    assert.notEqual(second.taskId, first.taskId)

    // Reopen: a new Core entry over the same sandbox reads the first saved result again.
    const reopened = await openApp(sandbox, provider)
    const reopenedStatus = await reopened.status(first.taskId)
    assert.equal(reopenedStatus.ok, true, JSON.stringify(reopenedStatus))
    assert.equal(reopenedStatus.readable, true)
    assert.equal(reopenedStatus.artifactRef, first.artifactRef)
    assert.equal(reopenedStatus.sha256, first.sha256)
    assert.equal(reopenedStatus.origin, 'PROVIDER_GENERATION_FIXTURE')

    // The formal Core entry does not import the UI test bridge or the Fixture worker file.
    const source = fs.readFileSync(coreFile, 'utf8')
    assert.doesNotMatch(source, /tests\/|fake-qwen-worker|studio-generation-bridge/)
  } finally {
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    else await supervisor.stop().catch(() => null)
    removeConfigSandbox(sandbox)
  }
})
