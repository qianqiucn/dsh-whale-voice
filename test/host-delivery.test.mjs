/* 180 / Plan 13-A — the isolated trusted Host call surface for a saved result's delivery.
 *
 * The routes run on the existing guard/token/connection contract and are wired to an already-opened
 * Fixture application with an explicitly assembled Fake delivery capability. No page, real Host,
 * production auth change or real backend is involved.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'

import { installHostBridge, bridgeScript } from '../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { createFakeDeliveryBackend, RELAY_STATES } from '../core/audio/relay-core-offline.mjs'
import { PRESET_GENERATION_APP_ERRORS, openPresetGenerationApp } from '../core/preset-generation-app.mjs'
import { mutableClock, readRelayStore } from './support/relay-authority.mjs'

const SCOPE = 'scope:fixture-host-delivery'
const PROOF = 'fixture-rights:host-delivery'
const VOICES = Object.freeze([{ id: 'demo-voice-a', label: '示例女声 A', languages: ['zh-CN'] }])
const PROVIDER_FACTS = Object.freeze({
  providerId: 'qwen3-tts',
  instanceId: 'instance-1',
  model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
  backend: 'fixture',
})
const T0 = '2026-11-07T00:10:00.000Z'
const TOKEN = 'host-delivery-token'
const DELIVERY_PATH = '/whale-voice/setup/generation/delivery'
const TARGET = {
  targetId: 'fixture-private-a',
  kind: 'PRIVATE',
  authorized: true,
  allowlisted: true,
  identityVerified: true,
  bridgeAllowed: true,
  workerAllowed: true,
}

function fixtureSpeechBytes() {
  const samples = new Array(6000)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(Math.sin((2 * Math.PI * 220 * index) / 24000) * 3000)
  }
  return wavFromSamples(samples, 24000)
}

function createMockProvider() {
  return {
    async beginSynthesis() {
      const requestId = 'mock-qwen-request'
      return {
        ok: true,
        requestId,
        result: Promise.resolve({ ok: true, providerId: 'qwen3-tts', requestId, bytes: fixtureSpeechBytes() }),
        cancel: async () => ({ ok: true }),
      }
    },
  }
}

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

function makeRequest({ method, url, body, raw, token = TOKEN, omitToken = false, headers = {} }) {
  const listeners = {}
  const baseHeaders = { host: '127.0.0.1:59575' }
  if (!omitToken) baseHeaders['x-whale-core-token'] = token
  const req = {
    method,
    url,
    socket: { remoteAddress: '127.0.0.1' },
    headers: { ...baseHeaders, ...headers },
    on(event, fn) { listeners[event] = fn },
  }
  if (raw !== undefined || body !== undefined) {
    const text = raw !== undefined ? raw : JSON.stringify(body)
    queueMicrotask(() => {
      if (listeners.data) listeners.data(Buffer.from(text))
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

async function openApp(sandbox, clock, { backend, withDelivery = true, scopeId = SCOPE, proofRef = PROOF } = {}) {
  const opened = await openPresetGenerationApp({
    sandbox,
    provider: createMockProvider(),
    scopeId,
    rightsProofRef: proofRef,
    voices: VOICES,
    textLimit: 200,
    providerFacts: PROVIDER_FACTS,
    now: clock.now,
    delivery: withDelivery ? { backend, targets: [TARGET] } : undefined,
  })
  assert.equal(opened.ok, true, JSON.stringify(opened))
  return opened.value
}

async function generateSaved(app, text = 'Host 投递面的隔离保存结果。') {
  const generated = await app.generate({ text, voiceId: 'demo-voice-a', language: 'zh-CN' })
  assert.equal(generated.ok, true, JSON.stringify(generated))
  assert.equal(generated.state, 'SAVED')
  return generated
}

function deliveryRouteOf(routes) {
  const route = routes.find((item) => item.path === DELIVERY_PATH)
  assert.ok(route, 'delivery route missing')
  return route
}

test('180 the trusted connection confirms a saved result and reads the same delivery back after a reopen', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(sandbox, clock, { backend })
    const saved = await generateSaved(app)
    const routes = []
    installHostBridge(makeScope(routes), { token: TOKEN, generation: app })
    const route = deliveryRouteOf(routes)
    const confirmed = await callRoute(route, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: saved.taskId, targetId: TARGET.targetId },
    })
    assert.equal(confirmed.status, 200, confirmed.body)
    const body = JSON.parse(confirmed.body)
    assert.equal(body.ok, true)
    assert.equal(body.outcome, 'ACCEPTED')
    assert.equal(body.delivery.state, RELAY_STATES.ACCEPTED)
    assert.equal(body.delivery.taskId, saved.taskId)
    assert.equal(body.delivery.targetId, TARGET.targetId)
    assert.equal(body.delivery.realOperationAllowed, false)
    assert.equal(backend.stats().submitted, 1)
    const statusQuery = '/whale-voice/setup/generation/delivery?taskId=' + encodeURIComponent(saved.taskId) + '&targetId=' + encodeURIComponent(TARGET.targetId)
    const readback = await callRoute(route, { method: 'GET', url: statusQuery })
    assert.equal(readback.status, 200, readback.body)
    const readBody = JSON.parse(readback.body)
    assert.equal(readBody.ok, true)
    assert.equal(readBody.state, RELAY_STATES.ACCEPTED)
    assert.equal(readBody.delivery.deliveryId, body.delivery.deliveryId)
    const repeated = await callRoute(route, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: saved.taskId, targetId: TARGET.targetId },
    })
    assert.equal(JSON.parse(repeated.body).delivery.deliveryId, body.delivery.deliveryId)
    assert.equal(backend.stats().submitted, 1)

    const reopenedApp = await openApp(sandbox, clock, { backend })
    const reopenedRoutes = []
    installHostBridge(makeScope(reopenedRoutes), { token: TOKEN, generation: reopenedApp })
    const reopenedRoute = deliveryRouteOf(reopenedRoutes)
    const reopenedStatus = await callRoute(reopenedRoute, { method: 'GET', url: statusQuery })
    assert.equal(reopenedStatus.status, 200, reopenedStatus.body)
    assert.equal(JSON.parse(reopenedStatus.body).delivery.deliveryId, body.delivery.deliveryId)
    const reopenedConfirm = await callRoute(reopenedRoute, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: saved.taskId, targetId: TARGET.targetId },
    })
    assert.equal(JSON.parse(reopenedConfirm.body).delivery.deliveryId, body.delivery.deliveryId)
    assert.equal(backend.stats().submitted, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('180 unauthorized, wrong-method and malformed calls cannot confirm a delivery', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(sandbox, clock, { backend })
    const saved = await generateSaved(app)
    const routes = []
    installHostBridge(makeScope(routes), { token: TOKEN, generation: app })
    const route = deliveryRouteOf(routes)
    const body = { taskId: saved.taskId, targetId: TARGET.targetId }
    const noToken = await callRoute(route, { method: 'POST', url: DELIVERY_PATH, body, omitToken: true })
    assert.equal(noToken.status, 401)
    const wrongToken = await callRoute(route, { method: 'POST', url: DELIVERY_PATH, body, token: 'wrong-token' })
    assert.equal(wrongToken.status, 401)
    const wrongMethod = await callRoute(route, { method: 'PUT', url: DELIVERY_PATH, body })
    assert.equal(wrongMethod.status, 405)
    const invalidBody = await callRoute(route, { method: 'POST', url: DELIVERY_PATH, raw: '{' })
    assert.equal(invalidBody.status, 400)
    assert.equal(JSON.parse(invalidBody.body).error, 'invalid_body')
    const missingTarget = await callRoute(route, { method: 'POST', url: DELIVERY_PATH, body: { taskId: saved.taskId } })
    assert.equal(missingTarget.status, 400)
    const missingQuery = await callRoute(route, { method: 'GET', url: DELIVERY_PATH })
    assert.equal(missingQuery.status, 400)
    assert.equal(backend.stats().submitted, 0)
    assert.equal(readRelayStore(sandbox.root), null)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('180 without generation or without delivery wiring the surface is explicitly unavailable', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const disabledRoutes = []
    installHostBridge(makeScope(disabledRoutes), { token: TOKEN })
    const disabledRoute = deliveryRouteOf(disabledRoutes)
    const disabled = await callRoute(disabledRoute, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: 'task:fixture-' + 'a'.repeat(32), targetId: TARGET.targetId },
    })
    assert.equal(disabled.status, 503)
    assert.equal(JSON.parse(disabled.body).error, 'generation_not_enabled')

    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(sandbox, clock, { backend, withDelivery: false })
    const saved = await generateSaved(app)
    const routes = []
    installHostBridge(makeScope(routes), { token: TOKEN, generation: app })
    const route = deliveryRouteOf(routes)
    const confirm = await callRoute(route, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: saved.taskId, targetId: TARGET.targetId },
    })
    assert.equal(confirm.status, 503)
    assert.equal(JSON.parse(confirm.body).code, PRESET_GENERATION_APP_ERRORS.DELIVERY_UNAVAILABLE)
    const status = await callRoute(route, {
      method: 'GET', url: DELIVERY_PATH + '?taskId=' + encodeURIComponent(saved.taskId) + '&targetId=' + encodeURIComponent(TARGET.targetId),
    })
    assert.equal(status.status, 503)
    assert.equal(JSON.parse(status.body).code, PRESET_GENERATION_APP_ERRORS.DELIVERY_UNAVAILABLE)
    assert.equal(backend.stats().submitted, 0)
    assert.equal(readRelayStore(sandbox.root), null)
    // The existing generation/status surface is untouched by the missing delivery capability.
    const statusRoute = routes.find((item) => item.path === '/whale-voice/setup/generation/status')
    const generationRead = await callRoute(statusRoute, {
      method: 'GET', url: '/whale-voice/setup/generation/status?taskId=' + encodeURIComponent(saved.taskId),
    })
    assert.equal(generationRead.status, 200)
    assert.equal(JSON.parse(generationRead.body).readable, true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('180 Core refusals keep their cause through the Host and HTTP 200 never means accepted', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET] })
    const app = await openApp(sandbox, clock, { backend })
    const saved = await generateSaved(app)
    const routes = []
    installHostBridge(makeScope(routes), { token: TOKEN, generation: app })
    const route = deliveryRouteOf(routes)
    const unknownTarget = await callRoute(route, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: saved.taskId, targetId: 'fixture-not-configured' },
    })
    assert.equal(unknownTarget.status, 200)
    const unknownTargetBody = JSON.parse(unknownTarget.body)
    assert.equal(unknownTargetBody.ok, false)
    assert.equal(unknownTargetBody.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_REFUSED)
    assert.equal(unknownTargetBody.stage, 'permit')
    assert.equal(unknownTargetBody.cause, 'RELAY_CORE_TARGET_REJECTED')
    const missingTask = await callRoute(route, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: 'task:fixture-' + 'c'.repeat(32), targetId: TARGET.targetId },
    })
    assert.equal(missingTask.status, 200)
    assert.equal(JSON.parse(missingTask.body).code, PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED)
    const notFound = await callRoute(route, {
      method: 'GET', url: DELIVERY_PATH + '?taskId=' + encodeURIComponent('task:fixture-' + 'c'.repeat(32)) + '&targetId=' + encodeURIComponent(TARGET.targetId),
    })
    assert.equal(notFound.status, 200)
    assert.equal(JSON.parse(notFound.body).code, PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_FOUND)
    assert.equal(backend.stats().submitted, 0)
    const accepted = await callRoute(route, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: saved.taskId, targetId: TARGET.targetId },
    })
    const acceptedBody = JSON.parse(accepted.body)
    assert.equal(acceptedBody.ok, true)
    assert.equal(acceptedBody.outcome, 'ACCEPTED')
    // The receipt is a Fixture acceptance fact, never a real send claim.
    assert.equal(acceptedBody.delivery.backendState, 'QUEUED')
    assert.equal(acceptedBody.delivery.mockOnly, true)
    assert.equal(acceptedBody.delivery.realOperationAllowed, false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('180 the Host status query keeps the application scope boundary', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backendA = createFakeDeliveryBackend({ targets: [TARGET] })
    const appA = await openApp(sandbox, clock, { backend: backendA })
    const savedA = await generateSaved(appA, '范围 A 的 Host 投递素材。')
    const routesA = []
    installHostBridge(makeScope(routesA), { token: TOKEN, generation: appA })
    const accepted = await callRoute(deliveryRouteOf(routesA), {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: savedA.taskId, targetId: TARGET.targetId },
    })
    assert.equal(JSON.parse(accepted.body).ok, true)

    const backendB = createFakeDeliveryBackend({ targets: [TARGET] })
    const appB = await openApp(sandbox, clock, {
      backend: backendB, scopeId: 'scope:fixture-host-delivery-b', proofRef: 'fixture-rights:host-delivery-b',
    })
    const routesB = []
    installHostBridge(makeScope(routesB), { token: TOKEN, generation: appB })
    const routeB = deliveryRouteOf(routesB)
    const statusQuery = DELIVERY_PATH + '?taskId=' + encodeURIComponent(savedA.taskId) + '&targetId=' + encodeURIComponent(TARGET.targetId)
    const statusB = await callRoute(routeB, { method: 'GET', url: statusQuery })
    assert.equal(statusB.status, 200)
    const statusBodyB = JSON.parse(statusB.body)
    assert.equal(statusBodyB.ok, false)
    assert.equal(statusBodyB.code, PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_FOUND)
    assert.equal(statusBodyB.delivery, undefined)
    const confirmB = await callRoute(routeB, {
      method: 'POST', url: DELIVERY_PATH, body: { taskId: savedA.taskId, targetId: TARGET.targetId },
    })
    assert.equal(confirmB.status, 200)
    assert.equal(JSON.parse(confirmB.body).ok, false)
    assert.equal(backendB.stats().submitted, 0)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.deliveries.length, 1)
    assert.equal(store.permits.length, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('180 a confirm left without an answer stays unconfirmed and the persisted state is queryable', async () => {
  const sandbox = createConfigSandbox()
  try {
    const clock = mutableClock(T0)
    const backend = createFakeDeliveryBackend({ targets: [TARGET], failMode: 'defer' })
    const app = await openApp(sandbox, clock, { backend })
    const saved = await generateSaved(app, '延迟受理的 Host 投递素材。')
    const routes = []
    installHostBridge(makeScope(routes), { token: TOKEN, generation: app })
    const route = deliveryRouteOf(routes)
    const body = { taskId: saved.taskId, targetId: TARGET.targetId }
    const statusQuery = DELIVERY_PATH + '?taskId=' + encodeURIComponent(saved.taskId) + '&targetId=' + encodeURIComponent(TARGET.targetId)
    const pending = callRoute(route, { method: 'POST', url: DELIVERY_PATH, body })
    try {
      let mid = null
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const response = await callRoute(route, { method: 'GET', url: statusQuery })
        mid = JSON.parse(response.body)
        if (mid.ok === true) break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      assert.equal(mid.ok, true, JSON.stringify(mid))
      assert.notEqual(mid.state, RELAY_STATES.ACCEPTED)
      assert.equal(backend.stats().submitted, 1)
      backend.releaseDeferred()
      const answered = await pending
      assert.equal(answered.status, 200)
      const answeredBody = JSON.parse(answered.body)
      assert.equal(answeredBody.outcome, 'ACCEPTED')
      const after = await callRoute(route, { method: 'GET', url: statusQuery })
      const afterBody = JSON.parse(after.body)
      assert.equal(afterBody.ok, true)
      assert.equal(afterBody.state, RELAY_STATES.ACCEPTED)
      assert.equal(afterBody.delivery.deliveryId, answeredBody.delivery.deliveryId)
      assert.equal(backend.stats().submitted, 1)
    } finally {
      backend.releaseDeferred()
    }
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('180 the injected bridge exposes the delivery calls on the same token contract', async () => {
  const calls = []
  const window = {}
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options })
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, outcome: 'ACCEPTED', delivery: { deliveryId: 'delivery:' + 'a'.repeat(32) } } },
    }
  }
  vm.runInNewContext(bridgeScript('host-token'), {
    window, fetch: fakeFetch, AbortController, setTimeout, clearTimeout, encodeURIComponent, JSON, Set, String,
  })
  const bridge = window.__WHALE_SETUP__
  const request = { taskId: 'task:fixture-' + 'b'.repeat(32), targetId: TARGET.targetId }
  const confirmed = await bridge.confirmSavedResultDelivery(request)
  assert.equal(confirmed.outcome, 'ACCEPTED')
  const post = calls.find((call) => call.url === DELIVERY_PATH && call.options.method === 'POST')
  assert.equal(post.options.headers['x-whale-core-token'], 'host-token')
  assert.deepEqual(JSON.parse(post.options.body), request)
  await bridge.getSavedResultDeliveryStatus(request.taskId, request.targetId)
  const get = calls.find((call) => call.url.startsWith(DELIVERY_PATH + '?taskId='))
  assert.match(get.url, /targetId=fixture-private-a/)
  const abortWindow = {}
  vm.runInNewContext(bridgeScript('host-token'), {
    window: abortWindow,
    fetch: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error },
    AbortController, setTimeout, clearTimeout, encodeURIComponent, JSON, Set, String,
  })
  const aborted = await abortWindow.__WHALE_SETUP__.confirmSavedResultDelivery(request)
  assert.equal(aborted.ok, false)
  assert.equal(aborted.error, 'delivery_unconfirmed')
})

test('180 v1.1 a timeout while reading the confirmation reply stays delivery_unconfirmed', async () => {
  const calls = []
  const window = {}
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'POST') {
      return {
        ok: true,
        status: 200,
        async json() { const error = new Error('aborted'); error.name = 'AbortError'; throw error },
      }
    }
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, state: 'ACCEPTED', delivery: { deliveryId: 'delivery:' + 'a'.repeat(32) } } },
    }
  }
  vm.runInNewContext(bridgeScript('host-token'), {
    window, fetch: fakeFetch, AbortController, setTimeout, clearTimeout, encodeURIComponent, JSON, Set, String,
  })
  const bridge = window.__WHALE_SETUP__
  const request = { taskId: 'task:fixture-' + 'b'.repeat(32), targetId: 'fixture-private-a' }
  const confirmed = await bridge.confirmSavedResultDelivery(request)
  assert.equal(confirmed.ok, false)
  assert.equal(confirmed.error, 'delivery_unconfirmed')
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1)
  // The request was sent once; the persisted state is still readable afterwards.
  const status = await bridge.getSavedResultDeliveryStatus(request.taskId, request.targetId)
  assert.equal(status.ok, true)
  assert.equal(status.state, 'ACCEPTED')
  // The fix is scoped to this call: the same reply-read abort on another generation call keeps its
  // existing result instead of being reinterpreted.
  const generateWindow = {}
  vm.runInNewContext(bridgeScript('host-token'), {
    window: generateWindow,
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() { const error = new Error('aborted'); error.name = 'AbortError'; throw error },
    }),
    AbortController, setTimeout, clearTimeout, encodeURIComponent, JSON, Set, String,
  })
  const generated = await generateWindow.__WHALE_SETUP__.generatePreset({ text: 'x', voiceId: 'demo-voice-a', language: 'zh-CN' })
  assert.equal(generated.ok, false)
  assert.equal(generated.error, 'core_http_200')
})
