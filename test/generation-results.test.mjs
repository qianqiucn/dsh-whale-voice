import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

import { installHostBridge } from '../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openQwenGenerationRuntime } from '../core/qwen-generation-runtime.mjs'
import { openFixtureTaskOwner } from '../core/audio/task-owner.mjs'
import { CATALOG_FILE_NAME } from '../core/audio/fixture-task-store-internal.mjs'
import { ARTIFACT_FILE_NAME } from '../core/audio/fixture-artifact-store-internal.mjs'

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

const SCOPE = 'scope:fixture-results-151'
const PROOF = 'fixture-rights:results-151'
const RESULTS = '/whale-voice/setup/generation/results'

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function runtimeOptions(sandbox, scopeId = SCOPE) {
  return {
    sandbox,
    scopeId,
    rightsProofRef: PROOF,
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
    requestTimeoutMs: 5000,
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
  }
}

function makeRequest({ method, url, token = '' }) {
  const listeners = {}
  return {
    method,
    url,
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:59575', 'x-whale-core-token': token },
    on(event, fn) { listeners[event] = fn },
  }
}

function makeResponse() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(code, headers) { this.status = code; this.headers = headers || null },
    end(value) { this.body = value },
  }
}

async function callRoute(route, options) {
  const response = makeResponse()
  await route.handler(makeRequest(options), response)
  return response
}

function makeHarness() {
  const routes = []
  const scope = {
    webServer: {
      register(route) { routes.push(route); return () => {} },
      tapIndex() { return () => {} },
    },
    get() { return { requestRejection() { return null } } },
    on() { return () => {} },
    effect() {},
  }
  return { routes, scope }
}

function catalogEntryCount(sandbox) {
  const file = path.join(sandbox.root, CATALOG_FILE_NAME)
  if (!fs.existsSync(file)) return 0
  return JSON.parse(fs.readFileSync(file, 'utf8')).entries.length
}

test('151 the Core lists both saved results and downloads each original byte without generating', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-results-core-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const runtime = opened.value
  let first = null
  let second = null
  try {
    const empty = await runtime.app.results()
    assert.equal(empty.ok, true, JSON.stringify(empty))
    assert.deepEqual(empty.results, [])

    first = await runtime.app.generate({ text: '第一份已保存的生成结果。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(first.ok, true, JSON.stringify(first))
    second = await runtime.app.generate({ text: '第二份已保存的生成结果。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(second.ok, true, JSON.stringify(second))
    assert.notEqual(second.taskId, first.taskId)

    const before = catalogEntryCount(sandbox)
    const listed = await runtime.app.results()
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.equal(listed.fixtureOnly, true)
    assert.equal(listed.realReady, false)
    assert.deepEqual(listed.results.map((item) => item.taskId), [first.taskId, second.taskId])
    for (const [index, item] of listed.results.entries()) {
      const generated = index === 0 ? first : second
      assert.equal(item.state, 'SAVED')
      assert.equal(item.artifactRef, generated.artifactRef)
      assert.equal(item.readable, true)
      assert.equal(item.sha256, generated.sha256)
      assert.equal(item.byteLength, generated.byteLength)
      assert.equal(item.origin, generated.origin)
      assert.match(item.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    }

    const firstDownload = await runtime.app.download(listed.results[0].taskId)
    assert.equal(firstDownload.ok, true, JSON.stringify(firstDownload))
    assert.equal(sha256(firstDownload.bytes), first.sha256)
    const secondDownload = await runtime.app.download(listed.results[1].taskId)
    assert.equal(secondDownload.ok, true, JSON.stringify(secondDownload))
    assert.equal(sha256(secondDownload.bytes), second.sha256)
    assert.equal(catalogEntryCount(sandbox), before)
  } finally {
    await runtime.close()
  }

  // The same isolated config reopened reads the same two saved results and the same original bytes.
  const reopened = await openQwenGenerationRuntime(runtimeOptions(sandbox))
  assert.equal(reopened.ok, true, JSON.stringify(reopened))
  try {
    const again = await reopened.value.app.results()
    assert.equal(again.ok, true, JSON.stringify(again))
    assert.deepEqual(again.results.map((item) => item.taskId), [first.taskId, second.taskId])
    assert.equal(again.results[0].sha256, first.sha256)
    const bytes = await reopened.value.app.download(first.taskId)
    assert.equal(bytes.ok, true, JSON.stringify(bytes))
    assert.equal(sha256(bytes.bytes), first.sha256)
    assert.equal(catalogEntryCount(sandbox), 2)
  } finally {
    await reopened.value.close()
  }
})

test('151 the Host results route lists the saved results and fails honestly', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-results-host-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const runtime = opened.value
  try {
    const first = await runtime.app.generate({ text: '经 Host 列出的第一份结果。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(first.ok, true, JSON.stringify(first))
    const second = await runtime.app.generate({ text: '经 Host 列出的第二份结果。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(second.ok, true, JSON.stringify(second))

    const token = 'results-route-token'
    const harness = makeHarness()
    installHostBridge(harness.scope, { token, generation: runtime.app })
    const route = harness.routes.find((item) => item.path === RESULTS)
    assert.ok(route)

    const before = catalogEntryCount(sandbox)
    const response = await callRoute(route, { method: 'GET', url: RESULTS, token })
    assert.equal(response.status, 200)
    const payload = JSON.parse(response.body)
    assert.equal(payload.ok, true)
    assert.deepEqual(payload.results.map((item) => item.taskId), [first.taskId, second.taskId])
    assert.equal(catalogEntryCount(sandbox), before)

    const denied = await callRoute(route, { method: 'GET', url: RESULTS, token: 'wrong' })
    assert.equal(denied.status, 401)

    const bare = makeHarness()
    installHostBridge(bare.scope, { token })
    const disabled = await callRoute(bare.routes.find((item) => item.path === RESULTS), { method: 'GET', url: RESULTS, token })
    assert.equal(disabled.status, 503)
    assert.equal(JSON.parse(disabled.body).error, 'generation_not_enabled')
  } finally {
    await runtime.close()
  }
})

test('151 the saved-result list stays inside the current generation scope', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-results-scope-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  try {
    const generated = await opened.value.app.generate({ text: '只属于当前范围的一份结果。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(generated.ok, true, JSON.stringify(generated))

    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true, JSON.stringify(owner))
    const current = await owner.value.listSaved({ schemaVersion: 1, scopeId: SCOPE })
    assert.equal(current.ok, true, JSON.stringify(current))
    assert.deepEqual(current.value.results.map((item) => item.taskId), [generated.taskId])
    assert.equal(current.value.results[0].artifactRef, generated.artifactRef)
    assert.equal(current.value.results[0].feature, 'provider-generation')
    assert.equal(current.value.results[0].taskType, 'PROVIDER_TTS')

    const other = await owner.value.listSaved({ schemaVersion: 1, scopeId: 'scope:fixture-results-other' })
    assert.equal(other.ok, true, JSON.stringify(other))
    assert.deepEqual(other.value.results, [])
  } finally {
    await opened.value.close()
  }
})

// 158: the list across segments reads each segment's artifact pack once, so the wait no longer grows
// with every listed result. The saved results themselves stay the original tasks in their order.
test('158 the saved-result list reads one artifact pack per segment, not one per result', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-results-158-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const runtime = opened.value
  const realOpenSync = fs.openSync
  try {
    const generated = []
    for (let index = 0; index < 25; index += 1) {
      const item = await runtime.app.generate({ text: '第' + index + '份已保存的生成结果。', voiceId: 'demo-voice-a', language: 'zh-CN' })
      assert.equal(item.ok, true, JSON.stringify(item))
      generated.push(item)
    }
    const segments = fs.readdirSync(path.join(sandbox.root, 'segments'), { withFileTypes: true })
    const segmentCount = 1 + segments.filter((entry) => entry.isDirectory()).length
    assert.ok(segmentCount > 1, 'the saved results must span more than one segment')

    let packReads = 0
    fs.openSync = function patchedOpen(target, ...rest) {
      if (String(target).endsWith(ARTIFACT_FILE_NAME)) packReads += 1
      return realOpenSync.call(fs, target, ...rest)
    }
    const listed = await runtime.app.results()
    fs.openSync = realOpenSync
    assert.equal(listed.ok, true, JSON.stringify(listed))
    assert.equal(packReads, segmentCount, 'each segment artifact pack must be read once for the whole list')
    assert.deepEqual(listed.results.map((item) => item.taskId), generated.map((item) => item.taskId))
    for (const [index, item] of listed.results.entries()) {
      assert.equal(item.readable, true)
      assert.equal(item.sha256, generated[index].sha256)
      assert.equal(item.byteLength, generated[index].byteLength)
    }
  } finally {
    fs.openSync = realOpenSync
    await runtime.close()
  }
})
