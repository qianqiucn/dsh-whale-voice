import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { apply } from '../index.js'

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

const SCOPE = 'scope:fixture-plugin-142'
const PROOF = 'fixture-rights:plugin-142'
const SANDBOX_PREFIX = 'whale-voice-qwen-runtime-'

function makeRequest({ method, url, body, token = '' }) {
  const listeners = {}
  const req = {
    method,
    url,
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:59575', 'x-whale-core-token': token },
    on(event, fn) { listeners[event] = fn },
  }
  if (body !== undefined) {
    queueMicrotask(() => {
      if (listeners.data) listeners.data(Buffer.from(JSON.stringify(body)))
      if (listeners.end) listeners.end()
    })
  }
  return req
}

function makeResponse() {
  return {
    status: null,
    body: '',
    writeHead(code) { this.status = code },
    end(text) { this.body = text },
  }
}

async function callRoute(route, options) {
  const response = makeResponse()
  await route.handler(makeRequest(options), response)
  return response
}

/** The formal plugin entry receives the Host scope through ctx.inject; this is that same scope shape. */
function makeHarness() {
  const routes = []
  const effects = []
  let injectCallback = null
  const scope = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
      tapIndex() { return () => {} },
    },
    get() { return { requestRejection() { return null } } },
    on(event, fn) {
      if (event === 'webserver/index-inject') injectCallback = fn
      return () => {}
    },
    effect(fn) { effects.push(fn) },
  }
  const ctx = { inject(services, callback) { callback(scope) } }
  return {
    routes,
    effects,
    scope,
    ctx,
    injected() {
      const table = []
      if (injectCallback) injectCallback(table)
      return table
    },
  }
}

function bridgeToken(harness) {
  const table = harness.injected()
  assert.equal(Array.isArray(table), true)
  const row = table.find((item) => item && item.kind === 'script' && String(item.text || '').includes('__WHALE_SETUP__'))
  assert.ok(row, 'bridge script was not injected')
  const match = /const coreToken = "([^"]+)"/.exec(row.text)
  assert.ok(match, 'bridge token missing')
  return match[1]
}

function runtimeSandboxes() {
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(SANDBOX_PREFIX)).length
}

test('142 the plugin assembles the generation service from serialized runtime config', { skip: spawnSkip }, async () => {
  const harness = makeHarness()
  const config = {
    generation: {
      enabled: true,
      scopeId: SCOPE,
      rightsProofRef: PROOF,
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
      instanceId: 'instance-1',
      requestTimeoutMs: 5000,
      handshakeTimeoutMs: 5000,
      shutdownGraceMs: 500,
      killWaitMs: 300,
    },
  }
  const before = runtimeSandboxes()
  await apply(harness.ctx, JSON.parse(JSON.stringify(config)))
  assert.equal(runtimeSandboxes(), before + 1)

  const token = bridgeToken(harness)
  const generateRoute = harness.routes.find((route) => route.path === '/whale-voice/setup/generation')
  const statusRoute = harness.routes.find((route) => route.path === '/whale-voice/setup/generation/status')
  const catalogRoute = harness.routes.find((route) => route.path === '/whale-voice/setup/generation/catalog')
  assert.ok(generateRoute)
  assert.ok(statusRoute)
  assert.ok(catalogRoute)

  const catalog = await callRoute(catalogRoute, { method: 'GET', url: '/whale-voice/setup/generation/catalog', token })
  assert.equal(catalog.status, 200)
  const catalogBody = JSON.parse(catalog.body)
  assert.deepEqual(catalogBody.voices.map((voice) => voice.id), ['demo-voice-a', 'demo-voice-b'])
  assert.deepEqual(catalogBody.voices.map((voice) => voice.label), ['示例音色 A', '示例音色 B'])

  const generated = await callRoute(generateRoute, {
    method: 'POST',
    url: '/whale-voice/setup/generation',
    token,
    body: { text: '你好，这是正式插件配置的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' },
  })
  assert.equal(generated.status, 200)
  const saved = JSON.parse(generated.body)
  assert.equal(saved.ok, true, generated.body)
  assert.equal(saved.state, 'SAVED')
  assert.match(saved.taskId, /^task:fixture-[0-9a-f]{32}$/)
  assert.match(saved.artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
  assert.deepEqual(saved.provider, { providerId: 'qwen3-tts-local', model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' })

  const queried = await callRoute(statusRoute, {
    method: 'GET',
    url: '/whale-voice/setup/generation/status?taskId=' + encodeURIComponent(saved.taskId),
    token,
  })
  assert.equal(queried.status, 200)
  const status = JSON.parse(queried.body)
  assert.equal(status.ok, true, queried.body)
  assert.equal(status.readable, true)
  assert.equal(status.state, 'SAVED')
  assert.equal(status.artifactRef, saved.artifactRef)
  assert.deepEqual(status.provider, saved.provider)

  const dispose = harness.effects[0]
  assert.equal(typeof dispose, 'function')
  const closed = await dispose()()
  assert.deepEqual(closed, { ok: true })
  assert.equal(harness.routes.length, 0)
  assert.equal(runtimeSandboxes(), before)
})

test('142 without runtime config the generation surface stays explicitly not enabled', async () => {
  for (const config of [undefined, { generation: { enabled: false } }]) {
    const harness = makeHarness()
    const before = runtimeSandboxes()
    await apply(harness.ctx, config)
    assert.equal(runtimeSandboxes(), before)
    const token = bridgeToken(harness)
    const generationRoutes = harness.routes.filter((route) => route.path.startsWith('/whale-voice/setup/generation'))
    assert.equal(generationRoutes.length, 4)
    const generateRoute = harness.routes.find((route) => route.path === '/whale-voice/setup/generation')
    const denied = await callRoute(generateRoute, {
      method: 'POST',
      url: '/whale-voice/setup/generation',
      token,
      body: { text: 'x', voiceId: 'demo-voice-a' },
    })
    assert.equal(denied.status, 503)
    assert.equal(JSON.parse(denied.body).error, 'generation_not_enabled')
    const dispose = harness.effects[0]
    dispose()()
  }
})
