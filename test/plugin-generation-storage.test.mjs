import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { apply } from '../index.js'
import { SANDBOX_MARKER_NAME } from '../core/config-sandbox.mjs'
import { CATALOG_FILE_NAME, OWNER_FILE_NAME } from '../core/audio/fixture-task-store-internal.mjs'
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

const SCOPE = 'scope:fixture-plugin-143'
const PROOF = 'fixture-rights:plugin-143'

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

/** The bytes of the three store files and the marker id: a query-only reopen leaves all of them untouched. */
function readStorage(root) {
  const marker = JSON.parse(fs.readFileSync(path.join(root, SANDBOX_MARKER_NAME), 'utf8'))
  return {
    id: marker.id,
    catalog: fs.readFileSync(path.join(root, CATALOG_FILE_NAME)),
    owner: fs.readFileSync(path.join(root, OWNER_FILE_NAME)),
    artifacts: fs.readFileSync(path.join(root, ARTIFACT_FILE_NAME)),
  }
}

function generationConfig(storageRoot) {
  return {
    generation: {
      enabled: true,
      scopeId: SCOPE,
      rightsProofRef: PROOF,
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
      storageRoot,
      instanceId: 'instance-1',
      requestTimeoutMs: 5000,
      handshakeTimeoutMs: 5000,
      shutdownGraceMs: 500,
      killWaitMs: 300,
    },
  }
}

test('143 the plugin keeps saved generation data at the configured location and reopens it', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-generation-storage-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const storageRoot = path.join(parent, 'store')

  // First assembly: the Host names one explicit storage location through the serializable config.
  const harness = makeHarness()
  await apply(harness.ctx, JSON.parse(JSON.stringify(generationConfig(storageRoot))))
  assert.equal(fs.existsSync(path.join(storageRoot, SANDBOX_MARKER_NAME)), true)

  const token = bridgeToken(harness)
  const generateRoute = harness.routes.find((route) => route.path === '/whale-voice/setup/generation')
  const statusRoute = harness.routes.find((route) => route.path === '/whale-voice/setup/generation/status')
  assert.ok(generateRoute)
  assert.ok(statusRoute)

  const generated = await callRoute(generateRoute, {
    method: 'POST',
    url: '/whale-voice/setup/generation',
    token,
    body: { text: '你好，这条结果要在插件重开后仍然存在。', voiceId: 'demo-voice-a', language: 'zh-CN' },
  })
  assert.equal(generated.status, 200)
  const saved = JSON.parse(generated.body)
  assert.equal(saved.ok, true, generated.body)
  assert.equal(saved.state, 'SAVED')
  assert.equal(saved.origin, 'PROVIDER_GENERATION_FIXTURE')
  assert.match(saved.taskId, /^task:fixture-[0-9a-f]{32}$/)

  const stored = readStorage(storageRoot)
  assert.match(stored.id, /^[0-9a-f]{64}$/)
  assert.equal(JSON.parse(stored.catalog.toString('utf8')).entries.length, 1)

  // Normal dispose closes the runtime and routes but keeps the configured location.
  const dispose = harness.effects[0]
  assert.equal(typeof dispose, 'function')
  assert.deepEqual(await dispose()(), { ok: true })
  assert.equal(harness.routes.length, 0)
  assert.deepEqual(readStorage(storageRoot), stored)

  // Second assembly over the same location and config: the original Task ID still resolves to the
  // same saved artifact and source, and the query writes nothing (no second synthesis).
  const reopened = makeHarness()
  await apply(reopened.ctx, JSON.parse(JSON.stringify(generationConfig(storageRoot))))
  const reopenedToken = bridgeToken(reopened)
  const reopenedStatusRoute = reopened.routes.find((route) => route.path === '/whale-voice/setup/generation/status')
  assert.ok(reopenedStatusRoute)
  const queried = await callRoute(reopenedStatusRoute, {
    method: 'GET',
    url: '/whale-voice/setup/generation/status?taskId=' + encodeURIComponent(saved.taskId),
    token: reopenedToken,
  })
  assert.equal(queried.status, 200)
  const restored = JSON.parse(queried.body)
  assert.equal(restored.ok, true, queried.body)
  assert.equal(restored.state, 'SAVED')
  assert.equal(restored.readable, true)
  assert.equal(restored.artifactRef, saved.artifactRef)
  assert.deepEqual(readStorage(storageRoot), stored)

  const disposeReopened = reopened.effects[0]
  assert.deepEqual(await disposeReopened()(), { ok: true })
  assert.deepEqual(readStorage(storageRoot), stored)
})
