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

const SCOPE = 'scope:fixture-persistent-155'
const PROOF = 'fixture-rights:persistent-155'
const LONG_TEXT = '长'.repeat(200)

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function runtimeOptions(storageRoot, extra = {}) {
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
    ...extra,
  }
}

async function generateMany(app, count) {
  const tasks = []
  for (let index = 0; index < count; index += 1) {
    const generated = await app.generate({ text: LONG_TEXT, voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(generated.ok, true, JSON.stringify(generated))
    assert.equal(generated.state, 'SAVED')
    tasks.push(generated)
  }
  return tasks
}

test('155 generation keeps saving past the old task, claim and 4 MiB budgets and reopens a day later', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-persistent-155-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const storageRoot = path.join(parent, 'store')

  const opened = await openQwenGenerationRuntime(runtimeOptions(storageRoot))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  let tasks
  try {
    tasks = await generateMany(opened.value.app, 66)
  } finally {
    await opened.value.close()
  }
  const totalBytes = tasks.reduce((sum, item) => sum + item.byteLength, 0)
  assert.ok(totalBytes > 4 * 1024 * 1024, 'saved audio must exceed the old 4 MiB budget: ' + totalBytes)
  assert.ok(fs.existsSync(path.join(storageRoot, 'segments')))
  assert.ok(fs.readdirSync(path.join(storageRoot, 'segments')).length >= 1)

  // Same persistent location reopened two days later: the recorded 24 h expiration is not a
  // retention limit for saved Provider generation results (this also covers pre-fix records).
  const twoDaysLater = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
  const reopened = await openQwenGenerationRuntime(runtimeOptions(storageRoot, { now: twoDaysLater }))
  assert.equal(reopened.ok, true, JSON.stringify(reopened))
  try {
    const listed = await reopened.value.app.results()
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.equal(listed.results.length, 66)
    assert.deepEqual(listed.results.map((item) => item.taskId), tasks.map((item) => item.taskId))
    for (const index of [0, 33, 65]) {
      const fetched = await reopened.value.app.download(tasks[index].taskId)
      assert.equal(fetched.ok, true, JSON.stringify(fetched))
      assert.equal(sha256(fetched.bytes), tasks[index].sha256)
      const status = await reopened.value.app.status(tasks[index].taskId)
      assert.equal(status.ok, true, JSON.stringify(status))
      assert.equal(status.readable, true)
      assert.equal(status.sha256, tasks[index].sha256)
    }
  } finally {
    await reopened.value.close()
  }
})

test('155 a failing store write reports failure instead of SAVED and keeps earlier results', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-write-failure-155-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const storageRoot = path.join(parent, 'store')
  const catalogPath = path.join(storageRoot, CATALOG_FILE_NAME)

  const opened = await openQwenGenerationRuntime(runtimeOptions(storageRoot))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const first = await opened.value.app.generate({ text: '保存成功的第一条结果。', voiceId: 'demo-voice-a', language: 'zh-CN' })
  assert.equal(first.ok, true, JSON.stringify(first))

  // Make the next catalog write fail on the real storage medium, without touching a real disk.
  if (process.platform === 'win32') fs.chmodSync(catalogPath, 0o444)
  else fs.chmodSync(storageRoot, 0o555)
  let failed
  try {
    failed = await opened.value.app.generate({ text: '这次写入应当失败。', voiceId: 'demo-voice-a', language: 'zh-CN' })
  } finally {
    if (process.platform === 'win32') fs.chmodSync(catalogPath, 0o644)
    else fs.chmodSync(storageRoot, 0o755)
  }
  assert.equal(failed.ok, false, JSON.stringify(failed))
  assert.notEqual(failed.state, 'SAVED')
  await opened.value.close()

  const reopened = await openQwenGenerationRuntime(runtimeOptions(storageRoot))
  assert.equal(reopened.ok, true, JSON.stringify(reopened))
  try {
    const listed = await reopened.value.app.results()
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.deepEqual(listed.results.map((item) => item.taskId), [first.taskId])
    const fetched = await reopened.value.app.download(first.taskId)
    assert.equal(fetched.ok, true, JSON.stringify(fetched))
    assert.equal(sha256(fetched.bytes), first.sha256)
  } finally {
    await reopened.value.close()
  }
})
