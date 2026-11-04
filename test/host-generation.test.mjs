import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { installHostBridge } from '../index.js'
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

const SCOPE = 'scope:fixture-host-preset'
const PROOF = 'fixture-rights:host-preset'
const TOKEN = 'host-generation-token'

/** The existing isolated Host scope shape used by core.test.mjs. */
function makeScope(routes) {
  return {
    webServer: {
      register(route) { routes.push(route); return () => {} },
      tapIndex() { return () => {} },
    },
    get() { return { requestRejection() { return null } } },
    on() { return () => {} },
  }
}

function makeRequest({ method, url, body, token = TOKEN, headers = {} }) {
  const listeners = {}
  const req = {
    method,
    url,
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:59575', 'x-whale-core-token': token, ...headers },
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

async function openRuntime(sandbox) {
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
  return opened.value
}

test('136 the formal Host surface generates through the Core entry, queries by task and survives a reopen', { skip: spawnSkip }, async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-host-preset-' })
  let runtime = null
  let reopenedRuntime = null
  try {
    runtime = await openRuntime(sandbox)

    const routes = []
    const host = installHostBridge(makeScope(routes), { token: TOKEN, generation: runtime.app })
    const generateRoute = routes.find((route) => route.path === '/whale-voice/setup/generation')
    const statusRoute = routes.find((route) => route.path === '/whale-voice/setup/generation/status')
    const catalogRoute = routes.find((route) => route.path === '/whale-voice/setup/generation/catalog')
    assert.ok(generateRoute, 'generation route missing')
    assert.ok(statusRoute, 'generation status route missing')
    assert.ok(catalogRoute, 'generation catalog route missing')

    // The catalog is the worker's real discovery result, not a fixed test voice list.
    const catalog = await callRoute(catalogRoute, { method: 'GET', url: '/whale-voice/setup/generation/catalog' })
    assert.equal(catalog.status, 200)
    const catalogBody = JSON.parse(catalog.body)
    assert.deepEqual(catalogBody.voices.map((voice) => voice.id), ['demo-voice-a', 'demo-voice-b'])
    assert.deepEqual(catalogBody.voices.map((voice) => voice.label), ['示例音色 A', '示例音色 B'])
    assert.equal(catalogBody.textLimit, 200)

    const generated = await callRoute(generateRoute, {
      method: 'POST',
      url: '/whale-voice/setup/generation',
      body: { text: '你好，这是正式 Host 的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' },
    })
    assert.equal(generated.status, 200)
    const saved = JSON.parse(generated.body)
    assert.equal(saved.ok, true, generated.body)
    assert.equal(saved.state, 'SAVED')
    assert.equal(saved.ownerState, 'SAVED')
    assert.match(saved.taskId, /^task:fixture-[0-9a-f]{32}$/)
    assert.match(saved.artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    assert.match(saved.sha256, /^[0-9a-f]{64}$/)
    assert.deepEqual(saved.provider, { providerId: runtime.provider.providerId, model: runtime.provider.model })
    assert.deepEqual(saved.voice, { kind: 'PRESET', voiceId: 'demo-voice-a' })

    const queried = await callRoute(statusRoute, {
      method: 'GET',
      url: '/whale-voice/setup/generation/status?taskId=' + encodeURIComponent(saved.taskId),
    })
    assert.equal(queried.status, 200)
    const status = JSON.parse(queried.body)
    assert.equal(status.ok, true, queried.body)
    assert.equal(status.readable, true)
    assert.equal(status.state, 'SAVED')
    assert.equal(status.artifactRef, saved.artifactRef)
    assert.equal(status.sha256, saved.sha256)
    assert.deepEqual(status.provider, saved.provider)

    // The existing Host gate still applies: token required, method must match the route.
    const unauthorized = await callRoute(generateRoute, {
      method: 'POST',
      url: '/whale-voice/setup/generation',
      token: 'wrong-token',
      body: { text: 'x', voiceId: 'demo-voice-a' },
    })
    assert.equal(unauthorized.status, 401)
    const wrongMethod = await callRoute(generateRoute, { method: 'GET', url: '/whale-voice/setup/generation' })
    assert.equal(wrongMethod.status, 405)
    const readOnlyWrite = await callRoute(statusRoute, { method: 'POST', url: '/whale-voice/setup/generation/status' })
    assert.equal(readOnlyWrite.status, 405)

    host.dispose()

    // Reopen: a second formal assembly over the same sandbox queries the same saved result.
    reopenedRuntime = await openRuntime(sandbox)
    const reopenedRoutes = []
    const reopenedHost = installHostBridge(makeScope(reopenedRoutes), { token: TOKEN, generation: reopenedRuntime.app })
    const reopenedStatusRoute = reopenedRoutes.find((route) => route.path === '/whale-voice/setup/generation/status')
    const reopenedStatus = await callRoute(reopenedStatusRoute, {
      method: 'GET',
      url: '/whale-voice/setup/generation/status?taskId=' + encodeURIComponent(saved.taskId),
    })
    assert.equal(reopenedStatus.status, 200)
    const reopened = JSON.parse(reopenedStatus.body)
    assert.equal(reopened.ok, true, reopenedStatus.body)
    assert.equal(reopened.readable, true)
    assert.equal(reopened.artifactRef, saved.artifactRef)
    assert.equal(reopened.sha256, saved.sha256)
    assert.deepEqual(reopened.provider, saved.provider)
    reopenedHost.dispose()

    // Each assembly closes only the worker it created; a second close is a normal no-op.
    assert.deepEqual(await runtime.close(), { ok: true })
    assert.deepEqual(await runtime.close(), { ok: true })
    assert.deepEqual(await reopenedRuntime.close(), { ok: true })
    runtime = null
    reopenedRuntime = null

    // Without a configured generation runtime the same formal surface is explicitly not enabled.
    const disabledRoutes = []
    const disabledHost = installHostBridge(makeScope(disabledRoutes), { token: TOKEN })
    const disabledGenerate = disabledRoutes.find((route) => route.path === '/whale-voice/setup/generation')
    const disabled = await callRoute(disabledGenerate, {
      method: 'POST',
      url: '/whale-voice/setup/generation',
      body: { text: 'x', voiceId: 'demo-voice-a' },
    })
    assert.equal(disabled.status, 503)
    assert.equal(JSON.parse(disabled.body).error, 'generation_not_enabled')
    disabledHost.dispose()
  } finally {
    if (runtime) await runtime.close().catch(() => null)
    if (reopenedRuntime) await reopenedRuntime.close().catch(() => null)
    removeConfigSandbox(sandbox)
  }
})
