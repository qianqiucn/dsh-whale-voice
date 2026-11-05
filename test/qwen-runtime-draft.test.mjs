import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import {
  QWEN_RUNTIME_DRAFT_FILE,
  openGenerationSettingsDraft,
} from '../core/settings-draft.mjs'

const ROUTE = '/whale-voice/setup/settings/qwen-runtime'
const GENERATE = '/whale-voice/setup/generation'

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

const modelDirectory = path.join(os.tmpdir(), 'whale-voice-qwen-model')
const pythonPath = path.join(os.tmpdir(), 'whale-voice-python', 'python.exe')

test('148 the Qwen runtime draft is a real file that a reopened store reads back', (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-qwen-runtime-draft-' })
  t.after(() => removeConfigSandbox(sandbox))
  const store = openGenerationSettingsDraft({ sandbox })
  assert.deepEqual(store.readRuntimeDraft(), { ok: true, runtimeDraft: null, savedAt: null })

  const saved = store.saveRuntimeDraft({ modelDirectory, pythonPath })
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.deepEqual(saved.runtimeDraft, { modelDirectory, pythonPath })
  assert.match(saved.savedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

  const reopened = openGenerationSettingsDraft({ sandbox })
  assert.deepEqual(reopened.readRuntimeDraft(), saved)
  const onDisk = JSON.parse(fs.readFileSync(path.join(sandbox.root, QWEN_RUNTIME_DRAFT_FILE), 'utf8'))
  assert.deepEqual(onDisk, { schemaVersion: 1, modelDirectory, pythonPath, savedAt: saved.savedAt })

  assert.equal(reopened.saveRuntimeDraft({ modelDirectory: '', pythonPath }).error, 'runtime_model_invalid')
  assert.equal(reopened.saveRuntimeDraft({ modelDirectory, pythonPath: '  ' }).error, 'runtime_python_invalid')
  assert.equal(reopened.saveRuntimeDraft({ modelDirectory: 'relative/model', pythonPath }).error, 'runtime_model_not_absolute')
  assert.equal(reopened.saveRuntimeDraft({ modelDirectory, pythonPath: 'python.exe' }).error, 'runtime_python_not_absolute')
  assert.deepEqual(reopened.readRuntimeDraft(), saved, 'rejected saves must not change the saved draft')
})

test('148 the formal plugin persists the Qwen runtime draft across a reopen without enabling generation', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-qwen-runtime-draft-plugin-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'settings')
  const config = { settings: { draftRoot } }

  const first = makeHarness()
  await apply(first.ctx, JSON.parse(JSON.stringify(config)))
  const firstToken = bridgeToken(first)
  const firstRoute = routeOf(first, ROUTE)
  assert.ok(firstRoute)

  const denied = await callRoute(routeOf(first, GENERATE), {
    method: 'POST', url: GENERATE, token: firstToken, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(denied.status, 503)
  assert.equal(JSON.parse(denied.body).error, 'generation_not_enabled')

  const empty = await callRoute(firstRoute, { method: 'GET', url: ROUTE, token: firstToken })
  assert.equal(empty.status, 200)
  assert.deepEqual(JSON.parse(empty.body), { ok: true, runtimeDraft: null, savedAt: null })

  const invalid = await callRoute(firstRoute, {
    method: 'PUT', url: ROUTE, token: firstToken, body: { modelDirectory: 'relative/model', pythonPath },
  })
  assert.equal(invalid.status, 400)
  assert.equal(JSON.parse(invalid.body).error, 'runtime_model_not_absolute')

  const saved = await callRoute(firstRoute, {
    method: 'PUT', url: ROUTE, token: firstToken, body: { modelDirectory, pythonPath },
  })
  assert.equal(saved.status, 200, saved.body)
  const savedBody = JSON.parse(saved.body)
  assert.deepEqual(savedBody.runtimeDraft, { modelDirectory, pythonPath })

  const dispose = first.effects[0]
  assert.equal(typeof dispose, 'function')
  await dispose()()
  assert.equal(fs.existsSync(path.join(draftRoot, QWEN_RUNTIME_DRAFT_FILE)), true)

  const second = makeHarness()
  await apply(second.ctx, JSON.parse(JSON.stringify(config)))
  const secondToken = bridgeToken(second)
  const reread = await callRoute(routeOf(second, ROUTE), { method: 'GET', url: ROUTE, token: secondToken })
  assert.deepEqual(JSON.parse(reread.body), savedBody)
  const deniedAgain = await callRoute(routeOf(second, GENERATE), {
    method: 'POST', url: GENERATE, token: secondToken, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(deniedAgain.status, 503)
  const disposeSecond = second.effects[0]
  if (typeof disposeSecond === 'function') await disposeSecond()()
})

test('148 without a draft store the Qwen runtime route stays explicitly unavailable', async () => {
  const harness = makeHarness()
  await apply(harness.ctx, undefined)
  const token = bridgeToken(harness)
  const response = await callRoute(routeOf(harness, ROUTE), { method: 'GET', url: ROUTE, token })
  assert.equal(response.status, 503)
  assert.equal(JSON.parse(response.body).error, 'settings_draft_unavailable')
  const dispose = harness.effects[0]
  if (typeof dispose === 'function') dispose()()
})
