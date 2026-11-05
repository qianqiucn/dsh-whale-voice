import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, openConfigStorage, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { ARTIFACT_FILE_NAME } from '../core/audio/fixture-artifact-store-internal.mjs'
import { CATALOG_FILE_NAME } from '../core/audio/fixture-task-store-internal.mjs'
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
    assert.deepEqual(first.provider, { providerId: 'qwen3-tts', model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' })
    assert.deepEqual(first.voice, { kind: 'PRESET', voiceId: 'demo-voice-a' })
    assert.deepEqual(first.input, { kind: 'TEXT' })

    // 139: the issued formal task itself carries the Provider, preset voice, submitted text and rights.
    const catalogBytes = fs.readFileSync(path.join(sandbox.root, CATALOG_FILE_NAME))
    const catalogSnapshot = JSON.parse(catalogBytes.toString('utf8'))
    const issued = catalogSnapshot.entries.find((entry) => entry.record.taskId === first.taskId)
    assert.ok(issued)
    assert.equal(issued.record.schemaVersion, 2)
    assert.equal(issued.record.feature, 'provider-generation')
    assert.equal(issued.record.taskType, 'PROVIDER_TTS')
    assert.deepEqual(issued.record.provider, {
      providerId: 'qwen3-tts',
      instanceId: 'instance-1',
      model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
      backend: 'custom-voice',
    })
    assert.deepEqual(issued.record.voice, { kind: 'PRESET', voiceId: 'demo-voice-a' })
    assert.deepEqual(issued.record.input, { kind: 'TEXT', text: '你好，这是正式 Core 的隔离生成。' })
    assert.equal(issued.record.rights.state, 'CONFIRMED_FIXTURE')
    assert.equal(issued.record.mockOnly, true)
    assert.equal(issued.record.realOperationAllowed, false)

    const status = await app.status(first.taskId)
    assert.equal(status.ok, true, JSON.stringify(status))
    assert.equal(status.state, 'SAVED')
    assert.equal(status.ownerState, 'SAVED')
    assert.equal(status.readable, true)
    assert.equal(status.artifactRef, first.artifactRef)
    assert.equal(status.sha256, first.sha256)
    assert.equal(status.byteLength, first.byteLength)
    assert.equal(status.origin, 'PROVIDER_GENERATION_FIXTURE')
    assert.deepEqual(status.provider, { providerId: 'qwen3-tts', model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' })
    assert.deepEqual(status.voice, { kind: 'PRESET', voiceId: 'demo-voice-a' })
    assert.deepEqual(status.input, { kind: 'TEXT' })

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
    assert.deepEqual(reopenedStatus.provider, { providerId: 'qwen3-tts', model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' })
    assert.deepEqual(reopenedStatus.voice, { kind: 'PRESET', voiceId: 'demo-voice-a' })
    assert.deepEqual(reopenedStatus.input, { kind: 'TEXT' })

    // The formal Core entry does not import the UI test bridge or the Fixture worker file.
    const source = fs.readFileSync(coreFile, 'utf8')
    assert.doesNotMatch(source, /tests\/|fake-qwen-worker|studio-generation-bridge/)
  } finally {
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    else await supervisor.stop().catch(() => null)
    removeConfigSandbox(sandbox)
  }
})

// 159: the real failure window is a byte read that fails after the owner availability check already
// said READABLE. The query must report that failure, never a successful readable result with empty
// artifact facts, and it must not change the saved task or artifact.
test('159 a byte read that fails after the availability check reports a failure, not a readable result', { skip: spawnSkip }, async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-core-preset-status-fault-' })
  const supervisor = makeSupervisor()
  let provider = null
  try {
    provider = createQwenProvider({ supervisor, requestTimeoutMs: 5000 })
    assert.equal(provider.ok, true, JSON.stringify(provider))
    assert.equal((await provider.start()).ok, true, JSON.stringify(provider))
    const app = await openApp(sandbox, provider)
    const saved = await app.generate({ text: '读取失败时应当如实报错的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(saved.ok, true, JSON.stringify(saved))
    assert.equal(saved.state, 'SAVED')

    const packPath = path.join(sandbox.root, ARTIFACT_FILE_NAME)
    const packBefore = fs.readFileSync(packPath)
    const entriesBefore = JSON.parse(fs.readFileSync(path.join(sandbox.root, CATALOG_FILE_NAME), 'utf8')).entries.length

    // The owner availability check reads the pack first; every later read in this status call is the
    // real byte read and fails like a damaged or unreadable file would.
    const realOpenSync = fs.openSync
    let packOpens = 0
    fs.openSync = function patchedOpen(target, ...rest) {
      if (String(target) === packPath) {
        packOpens += 1
        if (packOpens > 1) {
          const error = new Error('injected artifact read fault')
          error.code = 'EIO'
          throw error
        }
      }
      return realOpenSync.call(fs, target, ...rest)
    }
    let failed
    try {
      failed = await app.status(saved.taskId)
    } finally {
      fs.openSync = realOpenSync
    }
    assert.ok(packOpens > 1, 'the availability check must have read the pack before the failed byte read')
    assert.equal(failed.ok, false, JSON.stringify(failed))
    assert.equal(failed.code, PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED)
    assert.equal(failed.detail, 'read rejected')
    assert.equal('readable' in failed, false)
    assert.equal('sha256' in failed, false)
    assert.equal('byteLength' in failed, false)

    // The failed read created, changed and deleted nothing in the saved task or the artifact pack.
    assert.deepEqual(fs.readFileSync(packPath), packBefore)
    assert.equal(JSON.parse(fs.readFileSync(path.join(sandbox.root, CATALOG_FILE_NAME), 'utf8')).entries.length, entriesBefore)

    // Reopening the same saved location still reports the whole original result and returns its bytes.
    const reopened = await openApp(openConfigStorage({ root: sandbox.root }), provider)
    const status = await reopened.status(saved.taskId)
    assert.equal(status.ok, true, JSON.stringify(status))
    assert.equal(status.readable, true)
    assert.equal(status.artifactRef, saved.artifactRef)
    assert.equal(status.sha256, saved.sha256)
    assert.equal(status.byteLength, saved.byteLength)
    assert.equal(status.origin, saved.origin)
    const download = await reopened.download(saved.taskId)
    assert.equal(download.ok, true, JSON.stringify(download))
    assert.equal(download.sha256, saved.sha256)
    assert.equal(Buffer.from(download.bytes).length, saved.byteLength)
  } finally {
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    else await supervisor.stop().catch(() => null)
    removeConfigSandbox(sandbox)
  }
})
