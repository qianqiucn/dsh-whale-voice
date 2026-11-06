import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { openConfigStorage } from '../core/config-sandbox.mjs'
import { openQwenGenerationRuntime } from '../core/qwen-generation-runtime.mjs'

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

const SCOPE = 'scope:fixture-concurrent-157'
const PROOF = 'fixture-rights:concurrent-157'

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function runtimeOptions(storageRoot) {
  return {
    sandbox: openConfigStorage({ root: storageRoot }),
    scopeId: SCOPE,
    rightsProofRef: PROOF,
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
    requestTimeoutMs: 5000,
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
  }
}

async function generate(app, text) {
  const generated = await app.generate({ text, voiceId: 'demo-voice-a', language: 'zh-CN' })
  assert.equal(generated.ok, true, JSON.stringify(generated))
  assert.equal(generated.state, 'SAVED')
  return generated
}

test('157 two simultaneous generations at the segment boundary keep results, downloads and later saves usable', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-concurrent-157-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const storageRoot = path.join(parent, 'store')

  const opened = await openQwenGenerationRuntime(runtimeOptions(storageRoot))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const app = opened.value.app
  try {
    // 24 short results fill the first segment exactly up to the rotation threshold.
    const tasks = []
    for (let index = 0; index < 24; index += 1) tasks.push(await generate(app, '同时生成边界'))
    const filled = await app.results()
    assert.equal(filled.ok, true, JSON.stringify(filled))
    assert.equal(filled.results.length, 24)
    assert.equal(fs.existsSync(path.join(storageRoot, 'segments')), false, 'no rotation before the boundary request')

    // Two requests at the segment boundary: both used to rotate the same directory at once.
    const pair = await Promise.all([
      app.generate({ text: '同时生成一', voiceId: 'demo-voice-a', language: 'zh-CN' }),
      app.generate({ text: '同时生成二', voiceId: 'demo-voice-a', language: 'zh-CN' }),
    ])
    const succeeded = pair.filter((item) => item.ok === true)
    const rejected = pair.filter((item) => item.ok !== true)
    for (const item of succeeded) assert.equal(item.state, 'SAVED', JSON.stringify(item))
    // A request the fixture provider cannot run in parallel is rejected by the provider, not by a
    // failed shared segment switch: the alternative is the always-passing assertion this replaces.
    for (const item of rejected) assert.equal(item.detail, 'PROVIDER_NOT_AVAILABLE', JSON.stringify(item))
    assert.ok(succeeded.length >= 1, 'at least one simultaneous request must return a real saved result')

    // The same runtime session keeps its saved-result list usable, without reopening the plugin.
    const listed = await app.results()
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.deepEqual(
      listed.results.map((item) => item.taskId),
      [...tasks, ...succeeded].map((item) => item.taskId),
    )

    // Old results still resolve their own bytes by original taskId.
    const oldest = await app.download(tasks[0].taskId)
    assert.equal(oldest.ok, true, JSON.stringify(oldest))
    assert.equal(sha256(oldest.bytes), tasks[0].sha256)
    const newest = await app.download(succeeded[succeeded.length - 1].taskId)
    assert.equal(newest.ok, true, JSON.stringify(newest))
    assert.equal(sha256(newest.bytes), succeeded[succeeded.length - 1].sha256)

    // A later normal generation still succeeds and appears in the list.
    const later = await generate(app, '之后的一次正常生成')
    const after = await app.results()
    assert.equal(after.ok, true, JSON.stringify(after))
    assert.equal(after.results.length, 24 + succeeded.length + 1)
    assert.equal(after.results[after.results.length - 1].taskId, later.taskId)

    // Exactly one new segment was created by the simultaneous pair.
    const segmentDirs = fs.readdirSync(path.join(storageRoot, 'segments'), { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
    assert.deepEqual(segmentDirs, ['0001'])
  } finally {
    await opened.value.close()
  }
})
