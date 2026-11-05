import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { apply } from '../index.js'
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

const GENERATE = '/whale-voice/setup/generation'
const RUNTIME = '/whale-voice/setup/settings/qwen-runtime'
const APPLY = '/whale-voice/setup/settings/qwen-runtime/apply'
const SCOPE = 'scope:fixture-runtime-applied-149'
const PROOF = 'fixture-rights:runtime-applied-149'

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
  const row = table.find((item) => item && item.kind === 'script' && String(item.text || '').includes('__WHALE_SETUP__'))
  assert.ok(row, 'bridge script was not injected')
  const match = /const coreToken = "([^"]+)"/.exec(row.text)
  assert.ok(match, 'bridge token missing')
  return match[1]
}

function routeOf(harness, pathname) {
  return harness.routes.find((route) => route.path === pathname)
}

function draftConfig(draftRoot) {
  return { settings: { draftRoot } }
}

function generationConfig(draftRoot, storageRoot, runtime, args) {
  return {
    settings: { draftRoot },
    generation: {
      enabled: true,
      scopeId: SCOPE,
      rightsProofRef: PROOF,
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime, args },
      storageRoot,
      instanceId: 'instance-1',
      requestTimeoutMs: 5000,
      handshakeTimeoutMs: 5000,
      shutdownGraceMs: 500,
      killWaitMs: 300,
    },
  }
}

async function generate(harness, token) {
  const response = await callRoute(routeOf(harness, GENERATE), {
    method: 'POST', url: GENERATE, token, body: { text: '应用运行路径后的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' },
  })
  assert.equal(response.status, 200, response.body)
  const body = JSON.parse(response.body)
  assert.equal(body.ok, true, response.body)
  assert.equal(body.state, 'SAVED')
  return body
}

test('149 the applied Qwen runtime paths are adopted on the next open and a generation succeeds', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-runtime-applied-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'settings')
  const storageRoot = path.join(parent, 'generation')
  const modelOld = path.join(parent, 'models-old')
  const modelNew = path.join(parent, 'models-new')
  const pythonOld = path.join(parent, 'python-old-not-installed')
  const pythonNew = process.execPath
  const recordFile = path.join(parent, 'worker-argv.json')
  fs.mkdirSync(modelNew, { recursive: true })
  fs.mkdirSync(modelOld, { recursive: true })
  assert.equal(fs.existsSync(pythonOld), false)

  // First open: draft-only config. Saving the draft does not apply it.
  const draftOpen = makeHarness()
  await apply(draftOpen.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const draftToken = bridgeToken(draftOpen)
  const saved = await callRoute(routeOf(draftOpen, RUNTIME), {
    method: 'PUT', url: RUNTIME, token: draftToken, body: { modelDirectory: modelNew, pythonPath: pythonNew },
  })
  assert.equal(saved.status, 200, saved.body)
  const savedBody = JSON.parse(saved.body)
  assert.deepEqual(savedBody.runtimeDraft, { modelDirectory: modelNew, pythonPath: pythonNew })
  assert.equal(savedBody.applied, null)
  await draftOpen.effects[0]()()

  // Save-only must not change the assembly source: the old Python path is still taken and fails.
  const notApplied = makeHarness()
  await assert.rejects(apply(notApplied.ctx, JSON.parse(JSON.stringify(
    generationConfig(draftRoot, storageRoot, pythonOld, ['--mode=ok', '--model-dir', modelOld, '--argv-record=' + recordFile]),
  ))))

  // Apply the saved paths through the same Host route the settings page uses.
  const applying = makeHarness()
  await apply(applying.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const applyingToken = bridgeToken(applying)
  const applied = await callRoute(routeOf(applying, APPLY), { method: 'POST', url: APPLY, token: applyingToken, body: {} })
  assert.equal(applied.status, 200, applied.body)
  const appliedBody = JSON.parse(applied.body)
  assert.deepEqual(appliedBody.applied, { modelDirectory: modelNew, pythonPath: pythonNew })
  assert.match(appliedBody.appliedAt, /^\d{4}-\d{2}-\d{2}T/)
  const denied = await callRoute(routeOf(applying, GENERATE), {
    method: 'POST', url: GENERATE, token: applyingToken, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(denied.status, 503)
  await applying.effects[0]()()

  // Reopen with the same trusted config but old runtime paths: the applied paths replace them.
  const reopened = makeHarness()
  await apply(reopened.ctx, JSON.parse(JSON.stringify(
    generationConfig(draftRoot, storageRoot, pythonOld, ['--mode=ok', '--model-dir', modelOld, '--argv-record=' + recordFile]),
  )))
  const reopenedToken = bridgeToken(reopened)
  const generated = await generate(reopened, reopenedToken)
  assert.match(generated.taskId, /^task:fixture-[0-9a-f]{32}$/)
  const recorded = JSON.parse(fs.readFileSync(recordFile, 'utf8'))
  const modelIndex = recorded.argv.lastIndexOf('--model-dir')
  assert.ok(modelIndex >= 0, recorded.argv.join(' '))
  assert.equal(recorded.argv[modelIndex + 1], modelNew, 'the applied model directory is passed to the worker')
  assert.equal(recorded.argv.includes(modelOld), false)
  assert.equal(fs.existsSync(path.join(storageRoot, CATALOG_FILE_NAME)), true)
  assert.equal(fs.existsSync(path.join(storageRoot, ARTIFACT_FILE_NAME)), true)
  const dispose = reopened.effects[0]
  assert.equal(typeof dispose, 'function')
  assert.deepEqual(await dispose()(), { ok: true })
})

test('149 applying the runtime paths does not enable generation and persists across reopen', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-runtime-applied-disabled-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'settings')
  const modelDirectory = path.join(parent, 'model')
  const pythonPath = process.execPath

  const first = makeHarness()
  await apply(first.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const token = bridgeToken(first)
  await callRoute(routeOf(first, RUNTIME), {
    method: 'PUT', url: RUNTIME, token, body: { modelDirectory, pythonPath },
  })
  const applied = await callRoute(routeOf(first, APPLY), { method: 'POST', url: APPLY, token, body: {} })
  assert.equal(applied.status, 200, applied.body)
  assert.equal(JSON.parse(applied.body).applied.modelDirectory, modelDirectory)
  const denied = await callRoute(routeOf(first, GENERATE), {
    method: 'POST', url: GENERATE, token, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(denied.status, 503)
  assert.equal(JSON.parse(denied.body).error, 'generation_not_enabled')
  await first.effects[0]()()

  const second = makeHarness()
  await apply(second.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const secondToken = bridgeToken(second)
  const reread = await callRoute(routeOf(second, RUNTIME), { method: 'GET', url: RUNTIME, token: secondToken })
  const rereadBody = JSON.parse(reread.body)
  assert.deepEqual(rereadBody.applied, { modelDirectory, pythonPath })
  const deniedAgain = await callRoute(routeOf(second, GENERATE), {
    method: 'POST', url: GENERATE, token: secondToken, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(deniedAgain.status, 503)
  await second.effects[0]()()
})
