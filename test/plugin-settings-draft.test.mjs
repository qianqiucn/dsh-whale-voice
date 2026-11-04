import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { apply } from '../index.js'
import { SANDBOX_MARKER_NAME } from '../core/config-sandbox.mjs'
import { GENERATION_SETTINGS_DRAFT_FILE } from '../core/settings-draft.mjs'

const ROUTE = '/whale-voice/setup/settings/generation-storage'

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

test('145 the formal plugin opens the serialized draft storage and keeps it across a reopen', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-plugin-draft-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'draft-store')
  const location = path.join(parent, 'generation-data')
  const config = { settings: { draftRoot } }

  const harness = makeHarness()
  await apply(harness.ctx, JSON.parse(JSON.stringify(config)))
  assert.equal(fs.existsSync(path.join(draftRoot, SANDBOX_MARKER_NAME)), true, 'the plugin opened the configured draft location')
  const token = bridgeToken(harness)
  const route = harness.routes.find((item) => item.path === ROUTE)
  assert.ok(route)

  // The draft is independent from generation: the generation surface stays explicitly not enabled.
  const denied = await callRoute(
    harness.routes.find((item) => item.path === '/whale-voice/setup/generation'),
    { method: 'POST', url: '/whale-voice/setup/generation', token, body: { text: 'x', voiceId: 'demo-voice-a' } },
  )
  assert.equal(denied.status, 503)
  assert.equal(JSON.parse(denied.body).error, 'generation_not_enabled')

  const empty = await callRoute(route, { method: 'GET', url: ROUTE, token })
  assert.equal(empty.status, 200)
  assert.deepEqual(JSON.parse(empty.body), { ok: true, draft: null, savedAt: null })

  const saved = await callRoute(route, { method: 'PUT', url: ROUTE, token, body: { generationStorageRoot: location } })
  assert.equal(saved.status, 200, saved.body)
  const savedBody = JSON.parse(saved.body)
  assert.equal(savedBody.draft.generationStorageRoot, location)

  // A normal plugin dispose keeps the configured draft location and its file.
  const dispose = harness.effects[0]
  assert.equal(typeof dispose, 'function')
  await dispose()()
  assert.equal(harness.routes.length, 0)
  assert.equal(fs.existsSync(path.join(draftRoot, SANDBOX_MARKER_NAME)), true)
  const onDisk = JSON.parse(fs.readFileSync(path.join(draftRoot, GENERATION_SETTINGS_DRAFT_FILE), 'utf8'))
  assert.equal(onDisk.generationStorageRoot, location)

  // The same serialized config and location reopened through the formal plugin entry read it back.
  const reopened = makeHarness()
  await apply(reopened.ctx, JSON.parse(JSON.stringify(config)))
  const reopenedRoute = reopened.routes.find((item) => item.path === ROUTE)
  assert.ok(reopenedRoute)
  const reopenedToken = bridgeToken(reopened)
  const reread = await callRoute(reopenedRoute, { method: 'GET', url: ROUTE, token: reopenedToken })
  assert.deepEqual(JSON.parse(reread.body), savedBody)
  const reopenedDenied = await callRoute(
    reopened.routes.find((item) => item.path === '/whale-voice/setup/generation'),
    { method: 'POST', url: '/whale-voice/setup/generation', token: reopenedToken, body: { text: 'x', voiceId: 'demo-voice-a' } },
  )
  assert.equal(reopenedDenied.status, 503)
})

test('145 without a serialized draft location the formal plugin keeps the draft surface unavailable', async () => {
  for (const config of [undefined, {}, { settings: {} }, { generation: { enabled: false } }]) {
    const harness = makeHarness()
    await apply(harness.ctx, config)
    const token = bridgeToken(harness)
    const route = harness.routes.find((item) => item.path === ROUTE)
    assert.ok(route)
    const response = await callRoute(route, { method: 'GET', url: ROUTE, token })
    assert.equal(response.status, 503, JSON.stringify(config))
    assert.equal(JSON.parse(response.body).error, 'settings_draft_unavailable')
    const dispose = harness.effects[0]
    if (typeof dispose === 'function') dispose()()
  }
})
