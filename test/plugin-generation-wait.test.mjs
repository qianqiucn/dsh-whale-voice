import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { bridgeScript, installHostBridge } from '../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
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

const TOKEN = 'generation-wait-token'
const SCOPE = 'scope:fixture-generation-wait-156'
const PROOF = 'fixture-rights:generation-wait-156'

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

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
}

function baseUrl(server) {
  return 'http://127.0.0.1:' + server.address().port
}

/** The exact production browser bridge script, with fetch resolving the page-relative URLs. */
function createBridge(base) {
  const window = {}
  vm.runInNewContext(bridgeScript(TOKEN), {
    window,
    fetch: (input, init) => globalThis.fetch(new URL(String(input), base), init),
    AbortController,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    JSON,
    Set,
    String,
    Number,
    console,
  })
  return window.__WHALE_SETUP__
}

function runtimeOptions(sandbox, args, requestTimeoutMs) {
  return {
    sandbox,
    scopeId: SCOPE,
    rightsProofRef: PROOF,
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args },
    requestTimeoutMs,
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
  }
}

test('156 the formal client waits beyond the old 15 s for a generation inside the effective limit', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-wait-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox, ['--mode=ok', '--synth-delay-ms=16000'], 30000))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const harness = makeHarness()
  const host = installHostBridge(harness.scope, { token: TOKEN, generation: opened.value.app })
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const route = harness.routes.find((item) => item.path === url.pathname)
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not_found' }))
      return
    }
    await route.handler(req, res)
  })
  await listen(server)
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    host.dispose()
    await opened.value.close()
  })

  const bridge = createBridge(baseUrl(server))
  const catalog = await bridge.getGenerationCatalog()
  assert.equal(catalog.ok, true, JSON.stringify(catalog))
  assert.equal(catalog.generationTimeoutMs, 30000)

  const started = Date.now()
  const generated = await bridge.generatePreset(
    { text: '这次生成超过旧的十五秒等待。', voiceId: 'demo-voice-a', language: 'zh-CN' },
    { timeoutMs: catalog.generationTimeoutMs + 10000 },
  )
  const elapsed = Date.now() - started
  assert.equal(generated.ok, true, JSON.stringify(generated))
  assert.equal(generated.state, 'SAVED')
  assert.ok(elapsed > 15000, 'the formal client must wait beyond the old 15 s: ' + elapsed)
  const results = await bridge.getGenerationResults()
  assert.equal(results.ok, true, JSON.stringify(results))
  assert.equal(results.results.length, 1, 'one user request must create exactly one saved task')
  assert.equal(results.results[0].taskId, generated.taskId)
})

test('156 the formal client reports an explicit backend failure instead of SAVED', { skip: spawnSkip }, async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-generation-timeout-' })
  t.after(() => removeConfigSandbox(sandbox))
  const opened = await openQwenGenerationRuntime(runtimeOptions(sandbox, ['--mode=ok', '--synth-delay-ms=5000'], 1000))
  assert.equal(opened.ok, true, JSON.stringify(opened))
  const harness = makeHarness()
  const host = installHostBridge(harness.scope, { token: TOKEN, generation: opened.value.app })
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const route = harness.routes.find((item) => item.path === url.pathname)
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not_found' }))
      return
    }
    await route.handler(req, res)
  })
  await listen(server)
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    host.dispose()
    await opened.value.close()
  })

  const bridge = createBridge(baseUrl(server))
  const catalog = await bridge.getGenerationCatalog()
  assert.equal(catalog.generationTimeoutMs, 1000)
  const generated = await bridge.generatePreset(
    { text: '这次超过后端许可时限。', voiceId: 'demo-voice-a', language: 'zh-CN' },
    { timeoutMs: catalog.generationTimeoutMs + 10000 },
  )
  assert.equal(generated.ok, false, JSON.stringify(generated))
  assert.notEqual(generated.state, 'SAVED')
  const results = await bridge.getGenerationResults()
  assert.equal(results.ok, true, JSON.stringify(results))
  assert.equal(results.results.length, 0, 'a failed generation must not be reported as a saved result')
})

test('156 a client-side abort reports an unconfirmed result, not success or a chosen failure', async (t) => {
  const server = http.createServer((req, res) => {
    res.on('error', () => {})
    setTimeout(() => {
      try {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, state: 'SAVED', taskId: 'task:fixture-' + 'a'.repeat(32) }))
      } catch {}
    }, 3000)
  })
  await listen(server)
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const bridge = createBridge(baseUrl(server))
  const started = Date.now()
  const result = await bridge.generatePreset({ text: 'x' }, { timeoutMs: 300 })
  assert.ok(Date.now() - started < 3000)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'generation_unconfirmed')
})
