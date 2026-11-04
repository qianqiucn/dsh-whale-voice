import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openQwenGenerationRuntime } from '../core/qwen-generation-runtime.mjs'
import { CATALOG_FILE_NAME } from '../core/audio/fixture-task-store-internal.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
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

const SCOPE = 'scope:fixture-runtime-140'
const PROOF = 'fixture-rights:runtime-140'

test('140 the formal Qwen runtime assembles the discovered facts, saves and closes its own worker', { skip: spawnSkip }, async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-qwen-runtime-' })
  const opened = await openQwenGenerationRuntime({
    sandbox,
    scopeId: SCOPE,
    rightsProofRef: PROOF,
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
    requestTimeoutMs: 5000,
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
  })
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const runtime = opened.value
  try {
    // The runtime facts are the worker handshake/discovery result, not the documented example.
    assert.deepEqual(runtime.provider, {
      providerId: 'qwen3-tts-local',
      instanceId: 'instance-1',
      model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
      backend: 'custom-voice',
    })
    assert.deepEqual(runtime.discovery.voices.map((voice) => voice.id), ['demo-voice-a', 'demo-voice-b'])
    assert.deepEqual(runtime.discovery.voices.map((voice) => voice.label), ['示例音色 A', '示例音色 B'])
    assert.equal(runtime.discovery.limits.maxChars, 200)

    const catalog = runtime.app.catalog()
    assert.equal(catalog.ok, true)
    assert.deepEqual(catalog.voices, runtime.discovery.voices)
    assert.equal(catalog.textLimit, 200)

    const generated = await runtime.app.generate({
      text: '你好，这是正式装配入口的隔离生成。',
      voiceId: 'demo-voice-a',
      language: 'zh-CN',
    })
    assert.equal(generated.ok, true, JSON.stringify(generated))
    assert.equal(generated.state, 'SAVED')
    assert.equal(generated.origin, 'PROVIDER_GENERATION_FIXTURE')
    assert.deepEqual(generated.provider, { providerId: runtime.provider.providerId, model: runtime.provider.model })
    assert.deepEqual(generated.voice, { kind: 'PRESET', voiceId: 'demo-voice-a' })

    const status = await runtime.app.status(generated.taskId)
    assert.equal(status.ok, true, JSON.stringify(status))
    assert.equal(status.readable, true)
    assert.equal(status.artifactRef, generated.artifactRef)
    assert.deepEqual(status.provider, generated.provider)

    // The persisted original task carries exactly the runtime provider facts.
    const snapshot = JSON.parse(fs.readFileSync(path.join(sandbox.root, CATALOG_FILE_NAME), 'utf8'))
    const issued = snapshot.entries.find((entry) => entry.record.taskId === generated.taskId)
    assert.ok(issued)
    assert.deepEqual(issued.record.provider, runtime.provider)
    assert.deepEqual(issued.record.voice, { kind: 'PRESET', voiceId: 'demo-voice-a' })

    // Normal close stops the worker this runtime created; a second close is a no-op.
    assert.deepEqual(await runtime.close(), { ok: true })
    assert.deepEqual(await runtime.close(), { ok: true })
    const after = await runtime.app.generate({ text: '关闭后再生成', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(after.ok, false)
  } finally {
    await runtime.close().catch(() => null)
    removeConfigSandbox(sandbox)
  }
})
