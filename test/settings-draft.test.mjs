import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { installHostBridge } from '../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import {
  GENERATION_SETTINGS_DRAFT_FILE,
  openGenerationSettingsDraft,
} from '../core/settings-draft.mjs'

const ROUTE_PATH = '/whale-voice/setup/settings/generation-storage'

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
  const scope = {
    webServer: {
      register(route) { routes.push(route); return () => {} },
      tapIndex() { return () => {} },
    },
    get() { return { requestRejection() { return null } } },
    on() { return () => {} },
  }
  return { routes, scope }
}

function settingsRoute(harness) {
  return harness.routes.find((route) => route.path === ROUTE_PATH)
}

test('144 the generation storage draft is a real file and a reopened store reads the same value', (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-settings-draft-' })
  t.after(() => removeConfigSandbox(sandbox))
  const draft = openGenerationSettingsDraft({ sandbox })
  assert.deepEqual(draft.read(), { ok: true, draft: null, savedAt: null })

  const target = path.join(os.tmpdir(), 'whale-voice-generation-draft-target')
  const saved = draft.save({ generationStorageRoot: target })
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.draft.generationStorageRoot, target)
  assert.match(saved.savedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

  // A reopened store over the same storage context (page reload / host restart) reads that same draft.
  const reopened = openGenerationSettingsDraft({ sandbox })
  assert.deepEqual(reopened.read(), saved)
  const onDisk = JSON.parse(fs.readFileSync(path.join(sandbox.root, GENERATION_SETTINGS_DRAFT_FILE), 'utf8'))
  assert.deepEqual(onDisk, {
    schemaVersion: 1,
    generationStorageRoot: target,
    savedAt: saved.savedAt,
  })

  assert.equal(reopened.save({ generationStorageRoot: '' }).error, 'draft_root_invalid')
  assert.equal(reopened.save({ generationStorageRoot: '   ' }).error, 'draft_root_invalid')
  assert.equal(reopened.save({}).error, 'draft_root_invalid')
  assert.equal(reopened.save({ generationStorageRoot: 42 }).error, 'draft_root_invalid')
  assert.equal(reopened.save({ generationStorageRoot: 'relative/path' }).error, 'draft_root_not_absolute')
  assert.deepEqual(reopened.read(), saved, 'rejected saves must not change the saved draft')
})

test('144 the Host route saves and re-reads the draft without a generation service', async (t) => {
  const sandbox = createConfigSandbox({ prefix: 'wv-settings-draft-host-' })
  t.after(() => removeConfigSandbox(sandbox))
  const token = 'settings-draft-token'
  const harness = makeHarness()
  installHostBridge(harness.scope, { token, settingsDraft: openGenerationSettingsDraft({ sandbox }) })
  const route = settingsRoute(harness)
  assert.ok(route)

  const empty = await callRoute(route, { method: 'GET', url: ROUTE_PATH, token })
  assert.equal(empty.status, 200)
  assert.deepEqual(JSON.parse(empty.body), { ok: true, draft: null, savedAt: null })

  const target = path.join(os.tmpdir(), 'whale-voice-generation-draft-host-target')
  const saved = await callRoute(route, { method: 'PUT', url: ROUTE_PATH, token, body: { generationStorageRoot: target } })
  assert.equal(saved.status, 200, saved.body)
  const savedBody = JSON.parse(saved.body)
  assert.equal(savedBody.ok, true)
  assert.equal(savedBody.draft.generationStorageRoot, target)

  const read = await callRoute(route, { method: 'GET', url: ROUTE_PATH, token })
  assert.deepEqual(JSON.parse(read.body), savedBody)

  // A new Host assembly and draft store over the same storage context serve the same saved value.
  const reopened = makeHarness()
  installHostBridge(reopened.scope, { token, settingsDraft: openGenerationSettingsDraft({ sandbox }) })
  const again = await callRoute(settingsRoute(reopened), { method: 'GET', url: ROUTE_PATH, token })
  assert.deepEqual(JSON.parse(again.body), savedBody)

  const relative = await callRoute(route, { method: 'PUT', url: ROUTE_PATH, token, body: { generationStorageRoot: 'relative/path' } })
  assert.equal(relative.status, 400)
  assert.equal(JSON.parse(relative.body).error, 'draft_root_not_absolute')
  const missing = await callRoute(route, { method: 'PUT', url: ROUTE_PATH, token, body: {} })
  assert.equal(missing.status, 400)
  assert.equal(JSON.parse(missing.body).error, 'draft_root_invalid')

  const denied = await callRoute(route, { method: 'GET', url: ROUTE_PATH, token: 'wrong-token' })
  assert.equal(denied.status, 401)

  // Without a draft store the route stays explicitly unavailable; generation is still not enabled.
  const bare = makeHarness()
  installHostBridge(bare.scope, { token })
  const unavailable = await callRoute(settingsRoute(bare), { method: 'GET', url: ROUTE_PATH, token })
  assert.equal(unavailable.status, 503)
  assert.equal(JSON.parse(unavailable.body).error, 'settings_draft_unavailable')
  const generation = await callRoute(
    bare.routes.find((item) => item.path === '/whale-voice/setup/generation'),
    { method: 'POST', url: '/whale-voice/setup/generation', token, body: { text: 'x', voiceId: 'demo-voice-a' } },
  )
  assert.equal(generation.status, 503)
  assert.equal(JSON.parse(generation.body).error, 'generation_not_enabled')
})
