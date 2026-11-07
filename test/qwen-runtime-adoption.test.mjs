/* 183 / Plan 14 — adopt an existing local Qwen runtime configuration.
 *
 * The formal owner is Whale Voice's own `%DSH_HOME%/whale-voice/core.json` (`qwenRuntime`); the
 * generation assembly reads it on plugin open. Tests use a temporary DSH_HOME, a synthetic model
 * directory and the existing fake worker — nothing is installed/downloaded and no real model runs.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply, installHostBridge } from '../index.js'
import { adoptLocalQwenRuntime, readLocalQwenAdoption } from '../core/qwen-runtime-adoption.mjs'
import { maskPath } from '../core/detect.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeRoot = path.join(here, '..', 'test-fixtures')
const fakeWorker = path.join(fakeRoot, 'fake-qwen-worker.mjs')

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function makeRequest({ method, url, body, token = 'host-token' }) {
  const listeners = {}
  const headers = { host: '127.0.0.1:59575' }
  if (token) headers['x-whale-core-token'] = token
  const req = { method, url, socket: { remoteAddress: '127.0.0.1' }, headers, on(event, fn) { listeners[event] = fn } }
  if (body !== undefined) {
    queueMicrotask(() => {
      if (listeners.data) listeners.data(Buffer.from(JSON.stringify(body)))
      if (listeners.end) listeners.end()
    })
  }
  return req
}

async function callRoute(route, options) {
  const res = { status: null, body: '', writeHead(code) { this.status = code }, end(text) { this.body = text } }
  await route.handler(makeRequest(options), res)
  return res
}

function makeScope(routes) {
  return {
    webServer: { register(route) { routes.push(route); return () => {} }, tapIndex() { return () => {} } },
    get() { return { requestRejection() { return null } } },
    on() { return () => {} },
  }
}

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-qwen-adopt-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const home = path.join(root, 'home')
  const model = path.join(root, 'model')
  fs.mkdirSync(model, { recursive: true })
  const python = process.execPath
  return { root, home, model, python }
}

test('183 adopting a local Qwen runtime writes only Whale Voice config and validates the paths', async (t) => {
  const fixture = makeFixture(t)
  const env = { DSH_HOME: fixture.home }
  const coreFile = path.join(fixture.home, 'whale-voice', 'core.json')
  writeJson(coreFile, { wechatAgentRoot: 'C:\\keep-me', qwenUrl: 'http://127.0.0.1:9' })
  const adopted = adoptLocalQwenRuntime({ modelDirectory: fixture.model, pythonPath: fixture.python, env })
  assert.equal(adopted.ok, true, JSON.stringify(adopted))
  assert.equal(adopted.adoption.modelDirectory, maskPath(fixture.model))
  const core = readJson(coreFile)
  assert.equal(core.qwenRuntime.modelDirectory, fixture.model)
  assert.equal(core.qwenRuntime.pythonPath, fixture.python)
  assert.equal(core.wechatAgentRoot, 'C:\\keep-me')
  assert.equal(core.qwenUrl, 'http://127.0.0.1:9')
  assert.equal(readLocalQwenAdoption({ env }).saved.modelDirectory, maskPath(fixture.model))

  const missingModel = adoptLocalQwenRuntime({ modelDirectory: path.join(fixture.root, 'nope'), pythonPath: fixture.python, env })
  assert.equal(missingModel.ok, false)
  assert.equal(missingModel.error, 'qwen_runtime_model_missing')
  assert.match(missingModel.messageZh, /未写入任何内容/)
  const missingPython = adoptLocalQwenRuntime({ modelDirectory: fixture.model, pythonPath: path.join(fixture.root, 'nope.exe'), env })
  assert.equal(missingPython.error, 'qwen_runtime_python_missing')
  const relative = adoptLocalQwenRuntime({ modelDirectory: 'model', pythonPath: fixture.python, env })
  assert.equal(relative.error, 'qwen_runtime_path_invalid')
  fs.writeFileSync(coreFile, '{"qwenRuntime": ', 'utf8')
  const corrupt = adoptLocalQwenRuntime({ modelDirectory: fixture.model, pythonPath: fixture.python, env })
  assert.equal(corrupt.error, 'core_config_invalid')
  assert.match(corrupt.messageZh, /未写入任何内容/)
  assert.equal(fs.readFileSync(coreFile, 'utf8'), '{"qwenRuntime": ')
})

test('183 the trusted Host saves the runtime and reports saved/running/pending-restart facts', async (t) => {
  const fixture = makeFixture(t)
  const env = { DSH_HOME: fixture.home }
  const routes = []
  const running = { modelDirectory: path.join(fixture.root, 'old-model'), pythonPath: process.execPath }
  installHostBridge(makeScope(routes), {
    token: 'host-token',
    env,
    fetchImpl: async () => ({ ok: true, status: 200, body: null }),
    timeoutMs: 50,
    localQwen: { running, source: 'deployment', worker: { state: 'DISABLED', code: 'generation_disabled' } },
  })
  const adoptRoute = routes.find((route) => route.path === '/whale-voice/setup/qwen-runtime/adopt')
  assert.ok(adoptRoute, 'qwen runtime adopt route missing')
  const denied = await callRoute(adoptRoute, { method: 'POST', url: '/whale-voice/setup/qwen-runtime/adopt', body: { modelDirectory: fixture.model, pythonPath: fixture.python }, token: '' })
  assert.equal(denied.status, 401)
  const invalid = await callRoute(adoptRoute, { method: 'POST', url: '/whale-voice/setup/qwen-runtime/adopt', body: { modelDirectory: '', pythonPath: '' } })
  assert.equal(invalid.status, 400)
  const adopted = await callRoute(adoptRoute, {
    method: 'POST', url: '/whale-voice/setup/qwen-runtime/adopt', body: { modelDirectory: fixture.model, pythonPath: fixture.python },
  })
  assert.equal(adopted.status, 200, adopted.body)
  const body = JSON.parse(adopted.body)
  assert.equal(body.ok, true)
  assert.equal(body.saved.modelDirectory, maskPath(fixture.model))
  assert.equal(body.running.modelDirectory, maskPath(running.modelDirectory))
  assert.equal(body.pendingRestart, true)
  const status = await callRoute(routes.find((route) => route.path === '/whale-voice/setup/status'), { method: 'GET', url: '/whale-voice/setup/status' })
  const statusBody = JSON.parse(status.body)
  assert.equal(statusBody.localQwen.saved.modelDirectory, maskPath(fixture.model))
  assert.equal(statusBody.localQwen.pendingRestart, true)
  assert.equal(statusBody.localQwen.source, 'deployment')
  assert.equal(statusBody.localQwen.worker.state, 'DISABLED')
})

test('183 the formal generation assembly consumes the adopted runtime on plugin open', async (t) => {
  const fixture = makeFixture(t)
  const storageRoot = path.join(fixture.root, 'storage')
  fs.mkdirSync(storageRoot, { recursive: true })
  const recordFile = path.join(fixture.root, 'argv.json')
  const oldModel = path.join(fixture.root, 'old-model')
  fs.mkdirSync(oldModel, { recursive: true })
  writeJson(path.join(fixture.home, 'whale-voice', 'core.json'), {
    qwenRuntime: { modelDirectory: fixture.model, pythonPath: fixture.python, savedAt: new Date().toISOString() },
  })
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = fixture.home
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })
  const routes = []
  const scope = {
    webServer: { register(route) { routes.push(route); return () => {} }, tapIndex() { return () => {} } },
    get() { return { requestRejection() { return null } } },
    on(event, fn) { if (event === 'webserver/index-inject') scope.injectCallback = fn; return () => {} },
    effect(fn) { scope.effectFn = fn },
  }
  await apply({ inject(services, callback) { callback(scope) } }, {
    generation: {
      enabled: true,
      scopeId: 'scope:fixture-qwen-adopted-183',
      rightsProofRef: 'fixture-rights:qwen-adopted-183',
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok', '--model-dir', oldModel, '--argv-record=' + recordFile] },
      storageRoot,
      instanceId: 'instance-1',
      requestTimeoutMs: 5000,
      handshakeTimeoutMs: 5000,
    },
  })
  const table = []
  scope.injectCallback(table)
  const token = /const coreToken = "([^"]+)"/.exec(table.find((row) => String(row.text || '').includes('__WHALE_SETUP__')).text)[1]
  const generation = await callRoute(routes.find((route) => route.path === '/whale-voice/setup/generation'), {
    method: 'POST', url: '/whale-voice/setup/generation', token, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(generation.status, 200, generation.body)
  const recorded = readJson(recordFile)
  const modelIndex = recorded.argv.lastIndexOf('--model-dir')
  assert.ok(modelIndex >= 0, recorded.argv.join(' '))
  assert.equal(recorded.argv[modelIndex + 1], fixture.model, 'the adopted model directory reaches the worker')
  assert.equal(recorded.argv.includes(oldModel), false)
  const status = await callRoute(routes.find((route) => route.path === '/whale-voice/setup/status'), { method: 'GET', url: '/whale-voice/setup/status', token })
  const localQwen = JSON.parse(status.body).localQwen
  assert.equal(localQwen.saved.modelDirectory, maskPath(fixture.model))
  assert.equal(localQwen.running.modelDirectory, maskPath(fixture.model))
  assert.equal(localQwen.source, 'adopted')
  assert.equal(localQwen.pendingRestart, false)
  assert.equal(localQwen.worker.state, 'READY')
  assert.equal(typeof scope.effectFn, 'function')
  await scope.effectFn()()
})
