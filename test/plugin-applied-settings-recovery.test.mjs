import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { apply } from '../index.js'
import { CATALOG_FILE_NAME } from '../core/audio/fixture-task-store-internal.mjs'
import {
  GENERATION_SETTINGS_APPLIED_FILE,
  QWEN_RUNTIME_APPLIED_FILE,
} from '../core/settings-draft.mjs'

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
const ASSEMBLY = '/whale-voice/setup/generation/assembly'
const DRAFT = '/whale-voice/setup/settings/generation-storage'
const DRAFT_APPLY = '/whale-voice/setup/settings/generation-storage/apply'
const RUNTIME = '/whale-voice/setup/settings/qwen-runtime'
const RUNTIME_APPLY = '/whale-voice/setup/settings/qwen-runtime/apply'
const SCOPE = 'scope:fixture-applied-recovery-154'
const PROOF = 'fixture-rights:applied-recovery-154'

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

function draftConfig(draftRoot) {
  return { settings: { draftRoot } }
}

async function disposeOf(harness) {
  const dispose = harness.effects[0]
  assert.equal(typeof dispose, 'function')
  await dispose()()
}

async function saveDraft(harness, token, generationStorageRoot) {
  const response = await callRoute(routeOf(harness, DRAFT), {
    method: 'PUT', url: DRAFT, token, body: { generationStorageRoot },
  })
  assert.equal(response.status, 200, response.body)
  return JSON.parse(response.body)
}

async function saveRuntime(harness, token, modelDirectory, pythonPath) {
  const response = await callRoute(routeOf(harness, RUNTIME), {
    method: 'PUT', url: RUNTIME, token, body: { modelDirectory, pythonPath },
  })
  assert.equal(response.status, 200, response.body)
  return JSON.parse(response.body)
}

async function applyDraft(harness, token, pathname) {
  const response = await callRoute(routeOf(harness, pathname), { method: 'POST', url: pathname, token, body: {} })
  assert.equal(response.status, 200, response.body)
  return JSON.parse(response.body)
}

async function assemblyState(harness, token) {
  const response = await callRoute(routeOf(harness, ASSEMBLY), { method: 'GET', url: ASSEMBLY, token })
  assert.equal(response.status, 200, response.body)
  return JSON.parse(response.body)
}

async function generationDenied(harness, token) {
  const response = await callRoute(routeOf(harness, GENERATE), {
    method: 'POST', url: GENERATE, token, body: { text: 'x', voiceId: 'demo-voice-a' },
  })
  assert.equal(response.status, 503)
  assert.equal(JSON.parse(response.body).error, 'generation_not_enabled')
}

async function generate(harness, token) {
  const response = await callRoute(routeOf(harness, GENERATE), {
    method: 'POST', url: GENERATE, token, body: { text: '修正设置后的隔离生成。', voiceId: 'demo-voice-a', language: 'zh-CN' },
  })
  assert.equal(response.status, 200, response.body)
  const body = JSON.parse(response.body)
  assert.equal(body.ok, true, response.body)
  assert.equal(body.state, 'SAVED')
  return body
}

function catalogEntries(root) {
  return JSON.parse(fs.readFileSync(path.join(root, CATALOG_FILE_NAME), 'utf8')).entries.length
}

test('154 a nonexistent applied runtime keeps the settings entry and recovers after repair', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-recovery-runtime-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'settings')
  const storageRoot = path.join(parent, 'generation')
  const missingPython = path.join(parent, 'python-not-installed')

  const seed = makeHarness()
  await apply(seed.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const seedToken = bridgeToken(seed)
  await saveRuntime(seed, seedToken, fakeRoot, missingPython)
  const applied = await applyDraft(seed, seedToken, RUNTIME_APPLY)
  assert.equal(applied.applied.pythonPath, missingPython)
  await disposeOf(seed)

  // Reopen with generation enabled: the bad applied runtime must not take the plugin down.
  const broken = makeHarness()
  await apply(broken.ctx, JSON.parse(JSON.stringify(generationConfig(draftRoot, storageRoot))))
  const brokenToken = bridgeToken(broken)
  const state = await assemblyState(broken, brokenToken)
  assert.equal(state.state, 'FAILED')
  assert.equal(state.code, 'runtime_unavailable')
  assert.match(state.messageZh, /运行/)
  await generationDenied(broken, brokenToken)
  const readable = await callRoute(routeOf(broken, RUNTIME), { method: 'GET', url: RUNTIME, token: brokenToken })
  assert.equal(readable.status, 200, readable.body)
  assert.equal(JSON.parse(readable.body).applied.pythonPath, missingPython)

  // Correct it through the same page routes: save and apply a working program.
  await saveRuntime(broken, brokenToken, fakeRoot, process.execPath)
  await applyDraft(broken, brokenToken, RUNTIME_APPLY)
  await disposeOf(broken)

  // The same config reopened uses the corrected runtime and saves the original task again.
  const recovered = makeHarness()
  await apply(recovered.ctx, JSON.parse(JSON.stringify(generationConfig(draftRoot, storageRoot))))
  const recoveredToken = bridgeToken(recovered)
  assert.equal((await assemblyState(recovered, recoveredToken)).state, 'READY')
  const generated = await generate(recovered, recoveredToken)
  assert.match(generated.taskId, /^task:fixture-[0-9a-f]{32}$/)
  assert.equal(catalogEntries(storageRoot), 1)
  await disposeOf(recovered)
})

test('154 an unusable applied storage location keeps the settings entry and recovers after repair', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-recovery-storage-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'settings')
  const blocker = path.join(parent, 'plain-file')
  fs.writeFileSync(blocker, 'not a directory')
  const unusable = path.join(blocker, 'generation')
  const goodRoot = path.join(parent, 'generation-good')

  const seed = makeHarness()
  await apply(seed.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const seedToken = bridgeToken(seed)
  await saveDraft(seed, seedToken, unusable)
  await applyDraft(seed, seedToken, DRAFT_APPLY)
  await disposeOf(seed)

  const broken = makeHarness()
  await apply(broken.ctx, JSON.parse(JSON.stringify(generationConfig(draftRoot, goodRoot))))
  const brokenToken = bridgeToken(broken)
  const state = await assemblyState(broken, brokenToken)
  assert.equal(state.state, 'FAILED')
  assert.equal(state.code, 'storage_unavailable')
  assert.ok(state.messageZh.includes(unusable))
  await generationDenied(broken, brokenToken)

  // Correct the location through the page routes, then reopen.
  const saved = await saveDraft(broken, brokenToken, goodRoot)
  assert.equal(saved.draft.generationStorageRoot, goodRoot)
  await applyDraft(broken, brokenToken, DRAFT_APPLY)
  await disposeOf(broken)

  const recovered = makeHarness()
  await apply(recovered.ctx, JSON.parse(JSON.stringify(generationConfig(draftRoot, goodRoot))))
  const recoveredToken = bridgeToken(recovered)
  assert.equal((await assemblyState(recovered, recoveredToken)).state, 'READY')
  await generate(recovered, recoveredToken)
  assert.equal(catalogEntries(goodRoot), 1)
  await disposeOf(recovered)
})

test('154 a truncated applied storage record is readable and repairable from the settings routes', { skip: spawnSkip }, async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-recovery-corrupt-storage-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'settings')
  const storageRoot = path.join(parent, 'generation')

  const seed = makeHarness()
  await apply(seed.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const seedToken = bridgeToken(seed)
  await saveDraft(seed, seedToken, storageRoot)
  await applyDraft(seed, seedToken, DRAFT_APPLY)
  await disposeOf(seed)
  fs.writeFileSync(path.join(draftRoot, GENERATION_SETTINGS_APPLIED_FILE), '{"schemaVersion":1,"generationSto')

  const broken = makeHarness()
  await apply(broken.ctx, JSON.parse(JSON.stringify(generationConfig(draftRoot, storageRoot))))
  const brokenToken = bridgeToken(broken)
  const state = await assemblyState(broken, brokenToken)
  assert.equal(state.state, 'FAILED')
  assert.equal(state.code, 'applied_storage_invalid')
  await generationDenied(broken, brokenToken)
  const readable = await callRoute(routeOf(broken, DRAFT), { method: 'GET', url: DRAFT, token: brokenToken })
  assert.equal(readable.status, 200, readable.body)
  const readableBody = JSON.parse(readable.body)
  assert.equal(readableBody.ok, true)
  assert.equal(readableBody.appliedError, 'applied_invalid')
  assert.equal(readableBody.applied, null)
  assert.equal(readableBody.draft.generationStorageRoot, storageRoot)

  // Saving the draft and applying it repairs the damaged applied record.
  await saveDraft(broken, brokenToken, storageRoot)
  await applyDraft(broken, brokenToken, DRAFT_APPLY)
  await disposeOf(broken)

  const recovered = makeHarness()
  await apply(recovered.ctx, JSON.parse(JSON.stringify(generationConfig(draftRoot, storageRoot))))
  const recoveredToken = bridgeToken(recovered)
  assert.equal((await assemblyState(recovered, recoveredToken)).state, 'READY')
  await generate(recovered, recoveredToken)
  assert.equal(catalogEntries(storageRoot), 1)
  await disposeOf(recovered)
})

test('154 a truncated applied runtime record cannot lock the settings page while generation is off', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-voice-recovery-corrupt-runtime-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const draftRoot = path.join(parent, 'settings')

  const seed = makeHarness()
  await apply(seed.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const seedToken = bridgeToken(seed)
  await saveRuntime(seed, seedToken, fakeRoot, process.execPath)
  await applyDraft(seed, seedToken, RUNTIME_APPLY)
  await disposeOf(seed)
  fs.writeFileSync(path.join(draftRoot, QWEN_RUNTIME_APPLIED_FILE), '{"schemaVersion":1,"modelDirec')

  const broken = makeHarness()
  await apply(broken.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const brokenToken = bridgeToken(broken)
  assert.equal((await assemblyState(broken, brokenToken)).state, 'DISABLED')
  await generationDenied(broken, brokenToken)
  const readable = await callRoute(routeOf(broken, RUNTIME), { method: 'GET', url: RUNTIME, token: brokenToken })
  assert.equal(readable.status, 200, readable.body)
  const readableBody = JSON.parse(readable.body)
  assert.equal(readableBody.ok, true)
  assert.equal(readableBody.appliedError, 'runtime_applied_invalid')
  assert.equal(readableBody.applied, null)
  assert.equal(readableBody.runtimeDraft.pythonPath, process.execPath)

  await saveRuntime(broken, brokenToken, fakeRoot, process.execPath)
  await applyDraft(broken, brokenToken, RUNTIME_APPLY)
  await disposeOf(broken)

  const reopened = makeHarness()
  await apply(reopened.ctx, JSON.parse(JSON.stringify(draftConfig(draftRoot))))
  const reopenedToken = bridgeToken(reopened)
  const reread = await callRoute(routeOf(reopened, RUNTIME), { method: 'GET', url: RUNTIME, token: reopenedToken })
  const rereadBody = JSON.parse(reread.body)
  assert.equal(rereadBody.applied.pythonPath, process.execPath)
  assert.equal(rereadBody.appliedError, undefined)
  assert.equal((await assemblyState(reopened, reopenedToken)).state, 'DISABLED')
  await generationDenied(reopened, reopenedToken)
  await disposeOf(reopened)
})
