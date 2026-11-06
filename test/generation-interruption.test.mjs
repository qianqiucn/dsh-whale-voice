import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

import { openConfigStorage } from '../core/config-sandbox.mjs'
import { openQwenGenerationRuntime } from '../core/qwen-generation-runtime.mjs'
import { CATALOG_FILE_NAME } from '../core/audio/fixture-task-store-internal.mjs'
import { ARTIFACT_FILE_NAME } from '../core/audio/fixture-artifact-store-internal.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeRoot = path.join(here, '..', 'test-fixtures')
const fakeWorker = path.join(fakeRoot, 'fake-qwen-worker.mjs')
const childScript = path.join(fakeRoot, 'interrupted-generation-child.mjs')

const SPAWN_OK = (() => {
  try {
    const probe = spawnSync(process.execPath, ['-e', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
    return !probe.error && probe.status === 0
  } catch {
    return false
  }
})()
const spawnSkip = SPAWN_OK ? false : 'child_process spawn is not permitted on this platform'

const SCOPE = 'scope:fixture-interruption-165'
const PROOF = 'fixture-rights:interruption-165'
const CLAIMS = path.join('provider-generation', 'claims.json')

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function options(root) {
  return {
    sandbox: openConfigStorage({ root }),
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

function ledgerOf(root) {
  return JSON.parse(fs.readFileSync(path.join(root, CLAIMS), 'utf8'))
}

function catalogEntries(root) {
  const file = path.join(root, CATALOG_FILE_NAME)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).entries.length : 0
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Wait until the interrupted child has persisted an active claim, then kill that real process. */
function interruptGeneration(root) {
  const child = spawn(process.execPath, [childScript, root, fakeRoot, fakeWorker, SCOPE, PROOF], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdout.resume()
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const deadline = Date.now() + 20000
  let active = null
  while (Date.now() < deadline && active === null) {
    try {
      active = ledgerOf(root).entries.find((entry) => entry.state === 'BEGINNING' || entry.state === 'CLAIMED') || null
    } catch {
      active = null
    }
    if (active === null) sleepSync(25)
  }
  assert.ok(active, 'the child generation must leave an active persisted claim: ' + stderr)
  // Kill the whole child tree (including its Fixture worker) so no orphan keeps this test's pipes open.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
  return Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))])
}

async function seedSavedResult(root) {
  const opened = await openQwenGenerationRuntime(options(root))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const saved = await opened.value.app.generate({
    text: '中断之前已经保存好的结果。',
    voiceId: 'demo-voice-a',
    language: 'zh-CN',
  })
  assert.equal(saved.ok, true, JSON.stringify(saved))
  await opened.value.close()
  return saved
}

// 165: a real process interruption leaves an active BEGINNING claim; reopening the same storage
// location settles it as UNKNOWN without replaying, re-saving or deleting anything.
test('165 an interrupted generation is settled as UNKNOWN on reopen without replaying it', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-interruption-165-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const root = path.join(parent, 'store')

  const saved = await seedSavedResult(root)
  const entriesAfterSeed = catalogEntries(root)
  const packAfterSeed = fs.readFileSync(path.join(root, ARTIFACT_FILE_NAME))

  await interruptGeneration(root)
  const interrupted = ledgerOf(root)
  assert.equal(interrupted.entries.filter((entry) => entry.state === 'BEGINNING' || entry.state === 'CLAIMED').length, 1)
  assert.equal(catalogEntries(root), entriesAfterSeed + 1, 'the interrupted request had reserved one task')
  assert.deepEqual(fs.readFileSync(path.join(root, ARTIFACT_FILE_NAME)), packAfterSeed, 'the interrupted request saved no artifact')

  const reopened = await openQwenGenerationRuntime(options(root))
  assert.equal(reopened.ok, true, JSON.stringify(reopened))
  try {
    const settled = ledgerOf(root)
    assert.equal(settled.entries.filter((entry) => entry.state === 'UNKNOWN').length, 1)
    assert.equal(settled.entries.filter((entry) => entry.state === 'BEGINNING' || entry.state === 'CLAIMED').length, 0)
    const legacy = settled.entries.find((entry) => entry.state === 'UNKNOWN')
    assert.equal(legacy.lastError, 'interrupted before completion')
    assert.notEqual(legacy.claimId, undefined)
    assert.equal(catalogEntries(root), entriesAfterSeed + 1, 'settling the claim must not create a task')
    assert.deepEqual(fs.readFileSync(path.join(root, ARTIFACT_FILE_NAME)), packAfterSeed, 'settling the claim must not touch artifacts')

    const listed = await reopened.value.app.results()
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.deepEqual(listed.results.map((item) => item.taskId), [saved.taskId])
    const download = await reopened.value.app.download(saved.taskId)
    assert.equal(download.ok, true, JSON.stringify(download))
    assert.equal(download.sha256, saved.sha256)
    assert.equal(sha256(download.bytes), saved.sha256)
  } finally {
    await reopened.value.close()
  }

  // Reopening again keeps the same settled fact; the ledger is not rewritten.
  const ledgerBytes = fs.readFileSync(path.join(root, CLAIMS))
  const again = await openQwenGenerationRuntime(options(root))
  assert.equal(again.ok, true, JSON.stringify(again))
  try {
    assert.deepEqual(fs.readFileSync(path.join(root, CLAIMS)), ledgerBytes)
    const listed = await again.value.app.results()
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.deepEqual(listed.results.map((item) => item.taskId), [saved.taskId])
  } finally {
    await again.value.close()
  }
})

// 165: when settling the interrupted claim cannot be persisted, the reopen reports failure honestly
// and leaves the original claim and the saved artifacts untouched.
test('165 an unwritable claim ledger reports failure without clearing the interrupted record', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-interruption-write-165-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const root = path.join(parent, 'store')
  const blockedRoot = path.join(parent, 'store-unwritable')

  await seedSavedResult(root)
  await interruptGeneration(root)
  fs.cpSync(root, blockedRoot, { recursive: true })

  const ledgerPath = path.join(blockedRoot, CLAIMS)
  const ledgerBefore = fs.readFileSync(ledgerPath)
  const packBefore = fs.readFileSync(path.join(blockedRoot, ARTIFACT_FILE_NAME))
  // Windows refuses to replace a read-only file; POSIX only needs the directory to be writable, so the
  // directory itself is made unwritable there to reach the same real write failure.
  const blockedDir = path.dirname(ledgerPath)
  if (process.platform === 'win32') fs.chmodSync(ledgerPath, 0o444)
  else fs.chmodSync(blockedDir, 0o555)
  let opened
  try {
    opened = await openQwenGenerationRuntime(options(blockedRoot))
  } finally {
    if (process.platform === 'win32') fs.chmodSync(ledgerPath, 0o644)
    else fs.chmodSync(blockedDir, 0o755)
    if (opened && opened.ok === true) await opened.value.close()
  }
  assert.equal(opened.ok, false, JSON.stringify(opened))
  assert.equal(opened.code, 'QWEN_GENERATION_RUNTIME_APP_REJECTED')
  assert.equal(opened.detail, 'claim-write')
  assert.deepEqual(fs.readFileSync(ledgerPath), ledgerBefore, 'the interrupted claim must stay as it was')
  assert.deepEqual(fs.readFileSync(path.join(blockedRoot, ARTIFACT_FILE_NAME)), packBefore)
})
