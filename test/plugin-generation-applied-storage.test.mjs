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
const DRAFT = '/whale-voice/setup/settings/generation-storage'
const APPLY = '/whale-voice/setup/settings/generation-storage/apply'
const SCOPE = 'scope:fixture-applied-storage-146'
const PROOF = 'fixture-rights:applied-storage-146'

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
  const row = table.find((item) => item && item.kind === 'script' && String(item.text || '').includes('__WHALE_SETUP__'))
  assert.ok(row, 'bridge script was not injected')
  const match = /const coreToken = "([^"]+)"/.exec(row.text)
  assert.ok(match, 'bridge token missing')
  return match[1]
}

function routeOf(harness, pathname) {
  return harness.routes.find((route) => route.path === pathname)
}

function generationConfig(draftRoot, storageRoot) {
  return {
    settings: { draftRoot },
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

function catalogEntries(root) {
  return JSON.parse(fs.readFileSync(path.join(root, CATALOG_FILE_NAME), 'utf8')).entries.length
}

async function generate(harness, token, text) {
  const response = await callRoute(routeOf(harness, GENERATE), {
    method: 'POST',
    url: GENERATE,
    token,
    body: { text, voiceId: 'demo-voice-a', language: 'zh-CN' },
  })
  assert.equal(response.status, 200, response.body)
  const body = JSON.parse(response.body)
  assert.equal(body.ok, true, response.body)
  assert.equal(body.state, 'SAVED')
  return body
}

test('146 an applied location is used on the next plugin open and the old location is kept', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-applied-storage-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const a = path.join(parent, 'generation-a')
  const b = path.join(parent, 'generation-b')
  const draftRoot = path.join(parent, 'settings')
  const config = generationConfig(draftRoot, a)

  const first = makeHarness()
  await apply(first.ctx, JSON.parse(JSON.stringify(config)))
  const firstToken = bridgeToken(first)
  const firstDraftRoute = routeOf(first, DRAFT)
  assert.ok(firstDraftRoute)
  assert.ok(routeOf(first, APPLY))

  await generate(first, firstToken, '应用前的结果进入位置 A。')
  assert.equal(catalogEntries(a), 1)
  assert.equal(fs.existsSync(b), false)

  // Saving a new draft must not move the current runtime; only an explicit apply records the fact.
  const saved = await callRoute(firstDraftRoute, {
    method: 'PUT', url: DRAFT, token: firstToken, body: { generationStorageRoot: b },
  })
  assert.equal(saved.status, 200, saved.body)
  const savedBody = JSON.parse(saved.body)
  assert.equal(savedBody.draft.generationStorageRoot, b)
  assert.equal(savedBody.applied, null)
  await generate(first, firstToken, '仅保存草稿后仍写入位置 A。')
  assert.equal(catalogEntries(a), 2)
  assert.equal(fs.existsSync(b), false)

  const applied = await callRoute(routeOf(first, APPLY), { method: 'POST', url: APPLY, token: firstToken, body: {} })
  assert.equal(applied.status, 200, applied.body)
  const appliedBody = JSON.parse(applied.body)
  assert.equal(appliedBody.applied.generationStorageRoot, b)
  assert.match(appliedBody.appliedAt, /^\d{4}-\d{2}-\d{2}T/)
  await generate(first, firstToken, '应用后当前装配仍写入位置 A。')
  assert.equal(catalogEntries(a), 3)
  assert.equal(fs.existsSync(b), false, 'the applied location is used on the next open, not the current runtime')

  // Normal close: the current runtime closes, the old location and the applied fact stay on disk.
  const dispose = first.effects[0]
  assert.equal(typeof dispose, 'function')
  assert.deepEqual(await dispose()(), { ok: true })
  assert.equal(first.routes.length, 0)
  const aBeforeReopen = fs.readFileSync(path.join(a, CATALOG_FILE_NAME))

  // Reopen through the same serialized config: the plugin reads the applied location and new results go to B.
  const second = makeHarness()
  await apply(second.ctx, JSON.parse(JSON.stringify(config)))
  const secondToken = bridgeToken(second)
  const reopened = await callRoute(routeOf(second, DRAFT), { method: 'GET', url: DRAFT, token: secondToken })
  const reopenedBody = JSON.parse(reopened.body)
  assert.equal(reopenedBody.applied.generationStorageRoot, b)
  await generate(second, secondToken, '重开后的新结果进入位置 B。')
  assert.equal(catalogEntries(b), 1)
  assert.equal(fs.existsSync(path.join(b, ARTIFACT_FILE_NAME)), true)
  assert.deepEqual(fs.readFileSync(path.join(a, CATALOG_FILE_NAME)), aBeforeReopen, 'location A history stays untouched')
  assert.equal(catalogEntries(a), 3)

  const disposeSecond = second.effects[0]
  if (typeof disposeSecond === 'function') await disposeSecond()()
})

test('146 applying a location does not enable generation or start a worker', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-applied-disabled-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const target = path.join(parent, 'generation-target')
  const draftRoot = path.join(parent, 'settings')
  const config = { settings: { draftRoot } }

  const first = makeHarness()
  await apply(first.ctx, JSON.parse(JSON.stringify(config)))
  const token = bridgeToken(first)
  const denied = await callRoute(routeOf(first, GENERATE), {
    method: 'POST', url: GENERATE, token, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(denied.status, 503)
  assert.equal(JSON.parse(denied.body).error, 'generation_not_enabled')

  await callRoute(routeOf(first, DRAFT), {
    method: 'PUT', url: DRAFT, token, body: { generationStorageRoot: target },
  })
  const applied = await callRoute(routeOf(first, APPLY), { method: 'POST', url: APPLY, token, body: {} })
  assert.equal(applied.status, 200, applied.body)
  assert.equal(JSON.parse(applied.body).applied.generationStorageRoot, target)
  assert.equal(fs.existsSync(target), false, 'applying only records the fact and does not create the location')

  const dispose = first.effects[0]
  await dispose()()

  const second = makeHarness()
  await apply(second.ctx, JSON.parse(JSON.stringify(config)))
  const secondToken = bridgeToken(second)
  const reread = await callRoute(routeOf(second, DRAFT), { method: 'GET', url: DRAFT, token: secondToken })
  const rereadBody = JSON.parse(reread.body)
  assert.equal(rereadBody.applied.generationStorageRoot, target)
  const deniedAgain = await callRoute(routeOf(second, GENERATE), {
    method: 'POST', url: GENERATE, token: secondToken, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(deniedAgain.status, 503)
  assert.equal(JSON.parse(deniedAgain.body).error, 'generation_not_enabled')
  if (typeof second.effects[0] === 'function') await second.effects[0]()()
})
