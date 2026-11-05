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
import { CATALOG_FILE_NAME } from '../core/audio/fixture-task-store-internal.mjs'
import { PRESET_GENERATION_APP_ERRORS } from '../core/preset-generation-app.mjs'

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

const SCOPE = 'scope:fixture-download-150'
const PROOF = 'fixture-rights:download-150'
const DOWNLOAD = '/whale-voice/setup/generation/download'

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function runtimeOptions(sandbox) {
  return {
    sandbox,
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

test('150 the Core entry downloads the already-saved bytes without generating again', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-download-core-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const runtime = opened.value
  try {
    const generated = await runtime.app.generate({ text: '下载原任务保存结果的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(generated.ok, true, JSON.stringify(generated))
    assert.equal(generated.state, 'SAVED')

    const download = await runtime.app.download(generated.taskId)
    assert.equal(download.ok, true, JSON.stringify(download))
    assert.equal(download.taskId, generated.taskId)
    assert.equal(download.artifactRef, generated.artifactRef)
    assert.equal(download.origin, generated.origin)
    assert.equal(download.sha256, generated.sha256)
    assert.equal(download.byteLength, download.bytes.length)
    assert.equal(sha256(download.bytes), generated.sha256)
    assert.match(download.fileName, /^whale-voice-[0-9a-f]{32}\.wav$/)

    // A second download returns the same saved bytes and adds no task.
    const before = JSON.parse(fs.readFileSync(path.join(sandbox.root, CATALOG_FILE_NAME), 'utf8'))
    const again = await runtime.app.download(generated.taskId)
    assert.equal(again.ok, true)
    assert.deepEqual(Buffer.from(again.bytes), Buffer.from(download.bytes))
    const after = JSON.parse(fs.readFileSync(path.join(sandbox.root, CATALOG_FILE_NAME), 'utf8'))
    assert.equal(after.entries.length, before.entries.length)

    const missing = await runtime.app.download('task:fixture-00000000000000000000000000000000')
    assert.equal(missing.ok, false)
    assert.equal(missing.code, PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED)
  } finally {
    await runtime.close()
  }
})

test('150 the Host download route serves the stored WAV and fails honestly when unavailable', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-download-host-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const runtime = opened.value
  try {
    const generated = await runtime.app.generate({ text: '经 Host 下载已保存结果的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' })
    assert.equal(generated.ok, true, JSON.stringify(generated))

    const token = 'download-route-token'
    const harness = makeHarness()
    installHostBridge(harness.scope, { token, generation: runtime.app })
    const route = harness.routes.find((item) => item.path === DOWNLOAD)
    assert.ok(route)

    const response = await callRoute(route, { method: 'GET', url: DOWNLOAD + '?taskId=' + encodeURIComponent(generated.taskId), token })
    assert.equal(response.status, 200)
    assert.equal(response.headers['content-type'], 'audio/wav')
    assert.equal(response.headers['content-length'], generated.byteLength)
    assert.match(response.headers['content-disposition'], /^attachment; filename="whale-voice-[0-9a-f]{32}\.wav"$/)
    const bytes = Buffer.from(response.body)
    assert.equal(bytes.length, generated.byteLength)
    assert.equal(sha256(bytes), generated.sha256)

    const unknown = await callRoute(route, {
      method: 'GET', url: DOWNLOAD + '?taskId=' + encodeURIComponent('task:fixture-00000000000000000000000000000000'), token,
    })
    assert.equal(unknown.status, 404)
    assert.equal(JSON.parse(unknown.body).ok, false)

    const denied = await callRoute(route, { method: 'GET', url: DOWNLOAD + '?taskId=' + encodeURIComponent(generated.taskId), token: 'wrong' })
    assert.equal(denied.status, 401)

    const bare = makeHarness()
    installHostBridge(bare.scope, { token })
    const disabled = await callRoute(bare.routes.find((item) => item.path === DOWNLOAD), {
      method: 'GET', url: DOWNLOAD + '?taskId=' + encodeURIComponent(generated.taskId), token,
    })
    assert.equal(disabled.status, 503)
    assert.equal(JSON.parse(disabled.body).error, 'generation_not_enabled')
  } finally {
    await runtime.close()
  }
})
