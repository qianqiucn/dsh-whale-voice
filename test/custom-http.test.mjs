import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'
import { openCostLedger } from '../core/tts/cloud-cost.mjs'
import {
  CUSTOM_HEALTH_STATES,
  createCustomHttpProvider,
} from '../core/tts/custom-http-adapter.mjs'
import {
  CUSTOM_HTTP_ERRORS,
  buildCustomHttpManifest,
  buildCustomRequest,
  customAuthHeader,
  validateCustomTargetShape,
} from '../core/tts/custom-http-contract.mjs'

function wavBytes() {
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount: 2400, pattern: 'SILENCE' })
  assert.equal(produced.ok, true)
  return produced.value.bytes
}

function fakeStore({ present = true, secret = 'synthetic-custom-token' } = {}) {
  return {
    async has() { return { ok: true, present } },
    async resolve() { return present ? { ok: true, secret } : { ok: false, code: 'CREDENTIAL_NOT_FOUND' } },
  }
}

async function freeLedger(t, { maxCalls = 100 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wv-custom-cost-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  return openCostLedger({ rootDir: root, mode: 'free', maxCalls, limitMicros: 0, unitPriceMicrosPerCharacter: 0 })
}

function baseOptions(overrides = {}) {
  return {
    target: 'http://127.0.0.1:9/tts',
    auth: { mode: 'none', credentialRef: null },
    networkEnabled: true,
    consent: { textUpload: true, providerId: 'custom-http' },
    costMode: 'free',
    freeConfirmed: true,
    ...overrides,
  }
}

const goodRequest = {
  requestId: 'custom-request-001',
  text: '你好，自定义服务。',
  voiceId: 'custom-default',
  language: 'zh-CN',
}

test('custom target shape and predefined auth are strict', () => {
  assert.equal(validateCustomTargetShape('https://tts.example.test/v1').ok, true)
  assert.equal(validateCustomTargetShape('http://127.0.0.1:8080/tts').ok, true)
  assert.equal(validateCustomTargetShape('http://localhost:8080/tts').code, CUSTOM_HTTP_ERRORS.TARGET_LOOPBACK_ONLY)
  assert.equal(validateCustomTargetShape('http://93.184.216.34/tts').code, CUSTOM_HTTP_ERRORS.TARGET_LOOPBACK_ONLY)
  assert.equal(validateCustomTargetShape('https://user:pass@example.test/').code, CUSTOM_HTTP_ERRORS.TARGET_CREDENTIALS)
  assert.equal(validateCustomTargetShape('https://example.test/?a=1').code, CUSTOM_HTTP_ERRORS.TARGET_CREDENTIALS)
  assert.equal(validateCustomTargetShape('https://example.test/#x').code, CUSTOM_HTTP_ERRORS.TARGET_CREDENTIALS)
  assert.equal(validateCustomTargetShape('ftp://example.test/').code, CUSTOM_HTTP_ERRORS.TARGET_SCHEME)
  assert.deepEqual(customAuthHeader({ mode: 'none' }, ''), {})
  assert.deepEqual(customAuthHeader({ mode: 'bearer' }, 'token'), { Authorization: 'Bearer token' })
  assert.deepEqual(customAuthHeader({ mode: 'x-api-key' }, 'token'), { 'X-API-Key': 'token' })
  assert.equal(customAuthHeader({ mode: 'custom-header' }, 'token'), null)
})

test('custom manifest is fixed-protocol, preset-only and keeps retention UNKNOWN', () => {
  const built = buildCustomHttpManifest({ target: 'https://tts.example.test/v1', auth: { mode: 'none' } })
  assert.equal(built.ok, true)
  assert.equal(built.manifest.kind, 'CUSTOM')
  assert.equal(built.manifest.capabilities.clone.supported, false)
  assert.equal(built.manifest.capabilities.emotion.supported, false)
  assert.equal(built.manifest.capabilities.streaming, false)
  assert.equal(built.manifest.capabilities.formats[0].sampleRate, 24000)
  assert.equal(built.manifest.privacy.retention, 'unknown')
  assert.equal(built.manifest.cost.paid, false)
  assert.equal(buildCustomHttpManifest({ target: 'https://tts.example.test/v1', auth: { mode: 'bearer' } }).code, CUSTOM_HTTP_ERRORS.CREDENTIALS_MISSING)
  assert.equal(buildCustomHttpManifest({ target: 'https://tts.example.test/v1', auth: { mode: 'none', credentialRef: 'dpapi:x:y' } }).code, CUSTOM_HTTP_ERRORS.AUTH_INVALID)
  assert.equal(buildCustomRequest({ requestId: 'bad id', text: 'x' }).code, CUSTOM_HTTP_ERRORS.PROTOCOL_INVALID)
  const payload = buildCustomRequest({ requestId: 'req-1', text: 'hello', voiceId: 'custom-default', language: 'en-US' })
  assert.equal(payload.ok, true)
  assert.deepEqual(JSON.parse(payload.body), { protocol: 'whale-voice-custom-tts', version: 1, requestId: 'req-1', text: 'hello', voiceId: 'custom-default', language: 'en-US', format: 'wav' })
})

test('custom health distinguishes missing credential, network disabled, unverified and live', async (t) => {
  const noTarget = createCustomHttpProvider({ ...baseOptions(), target: null })
  assert.equal((await noTarget.health()).status.state, CUSTOM_HEALTH_STATES.NOT_CONFIGURED)

  const missing = createCustomHttpProvider({
    ...baseOptions({ auth: { mode: 'bearer', credentialRef: 'dpapi:whale-voice:custom' }, credentialStore: fakeStore({ present: false }) }),
  })
  assert.equal((await missing.health()).status.state, CUSTOM_HEALTH_STATES.CREDENTIALS_MISSING)

  const offline = createCustomHttpProvider({ ...baseOptions({ networkEnabled: false }) })
  assert.equal((await offline.health()).status.state, CUSTOM_HEALTH_STATES.NETWORK_DISABLED)

  const fake = createCustomHttpProvider({
    ...baseOptions(),
    costLedger: await freeLedger(t),
    transport: async () => ({ ok: true, status: 200, body: wavBytes(), headers: {}, live: false }),
  })
  assert.equal((await fake.health()).status.state, CUSTOM_HEALTH_STATES.CONFIGURED_UNVERIFIED)
  assert.equal((await fake.synthesize({ ...goodRequest, requestId: 'custom-health-fake' })).ok, true)
  assert.equal((await fake.health()).status.state, CUSTOM_HEALTH_STATES.CONFIGURED_UNVERIFIED)

  const live = createCustomHttpProvider({
    ...baseOptions(),
    costLedger: await freeLedger(t),
    transport: async () => ({ ok: true, status: 200, body: wavBytes(), headers: {}, live: true }),
  })
  assert.equal((await live.synthesize({ ...goodRequest, requestId: 'custom-health-live' })).ok, true)
  assert.equal((await live.health()).status.state, CUSTOM_HEALTH_STATES.AVAILABLE)
})

test('gates reject before transport; unsupported modality and caller target are refused', async (t) => {
  let calls = 0
  const transport = async () => { calls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false } }
  const make = (overrides = {}) => createCustomHttpProvider({ ...baseOptions(overrides), transport })

  assert.equal((await make({ networkEnabled: false }).synthesize({ ...goodRequest, requestId: 'gate-network' })).code, CUSTOM_HTTP_ERRORS.NETWORK_DISABLED)
  assert.equal((await make({ consent: null }).synthesize({ ...goodRequest, requestId: 'gate-consent' })).code, CUSTOM_HTTP_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED)
  assert.equal((await make({ auth: { mode: 'bearer', credentialRef: 'dpapi:whale-voice:custom' }, credentialStore: fakeStore({ present: false }) }).synthesize({ ...goodRequest, requestId: 'gate-cred' })).code, CUSTOM_HTTP_ERRORS.CREDENTIALS_MISSING)
  assert.equal(calls, 0)

  const provider = make()
  assert.equal((await provider.synthesize({ ...goodRequest, requestId: 'gate-target', target: 'https://evil.example/' })).code, 'INVALID_RESPONSE')
  assert.equal((await provider.synthesize({ ...goodRequest, requestId: 'gate-stream', streaming: true })).code, 'UNSUPPORTED_STREAMING')
  assert.equal((await provider.synthesize({ ...goodRequest, requestId: 'gate-emotion', emotion: 'happy' })).code, 'UNSUPPORTED_EMOTION')
  assert.equal((await provider.synthesize({ ...goodRequest, requestId: 'gate-voice', voiceId: 'cloned-voice' })).code, CUSTOM_HTTP_ERRORS.VOICE_UNSUPPORTED)
  assert.equal(calls, 0)
})

test('a normal fake custom call returns a neutral non-persisted result and keeps secrets out', async (t) => {
  let captured = null
  const provider = createCustomHttpProvider({
    ...baseOptions({ auth: { mode: 'bearer', credentialRef: 'dpapi:whale-voice:custom' }, credentialStore: fakeStore({ secret: 'CUSTOM-SECRET' }) }),
    costLedger: await freeLedger(t),
    transport: async (options) => { captured = options; return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false } },
  })
  const result = await provider.synthesize(goodRequest)
  assert.equal(result.ok, true)
  assert.equal(result.persisted, false)
  assert.equal(result.result.delivery.state, 'PENDING_ROUTER')
  assert.equal(result.result.mime, 'audio/wav')
  assert.equal(result.result.sampleRate, 24000)
  assert.equal(captured.headers.Authorization, 'Bearer CUSTOM-SECRET')
  assert.equal(JSON.stringify(result).includes('CUSTOM-SECRET'), false)
  const projection = provider.publicProjection()
  assert.equal(JSON.stringify(projection).includes('CUSTOM-SECRET'), false)
  assert.equal(JSON.stringify(projection).includes('127.0.0.1'), false)
  assert.equal(JSON.stringify(projection).includes('dpapi:whale-voice'), false)
})

test('custom cancellation is CANCELLED and never resent', async (t) => {
  const controller = new AbortController()
  let calls = 0
  const provider = createCustomHttpProvider({
    ...baseOptions(),
    costLedger: await freeLedger(t),
    transport: async (options) => new Promise((resolve) => {
      calls += 1
      options.signal.addEventListener('abort', () => resolve({ ok: false, code: 'CLOUD_CANCELLED', sent: true }), { once: true })
      setTimeout(() => controller.abort(), 10)
    }),
  })
  const result = await provider.synthesize({ ...goodRequest, requestId: 'custom-cancel-001' }, { signal: controller.signal })
  assert.equal(result.code, CUSTOM_HTTP_ERRORS.CANCELLED)
  assert.equal(result.terminal, 'CANCELLED')
  assert.equal(calls, 1)
})

test('custom errors map without retry or response-body passthrough', async (t) => {
  const ledger = await freeLedger(t)
  const make = (response) => createCustomHttpProvider({ ...baseOptions(), costLedger: ledger, transport: async () => response })
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 401, sent: true }).synthesize({ ...goodRequest, requestId: 'err-401' })).code, CUSTOM_HTTP_ERRORS.AUTH_FAILED)
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 403, sent: true }).synthesize({ ...goodRequest, requestId: 'err-403' })).code, CUSTOM_HTTP_ERRORS.AUTH_FAILED)
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 429, sent: true }).synthesize({ ...goodRequest, requestId: 'err-429' })).code, CUSTOM_HTTP_ERRORS.RATE_LIMITED)
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 500, sent: true }).synthesize({ ...goodRequest, requestId: 'err-500' })).code, CUSTOM_HTTP_ERRORS.PROVIDER_ERROR)
  assert.equal((await make({ ok: false, code: 'CLOUD_REDIRECT_REJECTED', sent: true }).synthesize({ ...goodRequest, requestId: 'err-redirect' })).code, CUSTOM_HTTP_ERRORS.REDIRECT_REJECTED)
  assert.equal((await make({ ok: false, code: 'CLOUD_TIMEOUT', sent: true }).synthesize({ ...goodRequest, requestId: 'err-timeout' })).code, CUSTOM_HTTP_ERRORS.TIMEOUT)
  assert.equal((await make({ ok: true, status: 200, body: Buffer.from('not a wav'), headers: {} }).synthesize({ ...goodRequest, requestId: 'err-wav' })).code, CUSTOM_HTTP_ERRORS.INVALID_AUDIO)
  assert.equal((await make({ ok: false, code: 'CLOUD_RESPONSE_TOO_LARGE', sent: true }).synthesize({ ...goodRequest, requestId: 'err-large' })).code, CUSTOM_HTTP_ERRORS.RESPONSE_TOO_LARGE)
})

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

test('custom cost modes are explicit; unknown or unconfirmed-free makes zero requests', async (t) => {
  let calls = 0
  const transport = async () => { calls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false } }
  const unknown = createCustomHttpProvider({
    ...baseOptions({ costMode: 'unknown' }),
    costLedger: await freeLedger(t),
    transport,
  })
  assert.equal((await unknown.synthesize({ ...goodRequest, requestId: 'cost-unknown' })).code, CUSTOM_HTTP_ERRORS.COST_UNKNOWN)
  assert.equal(calls, 0)

  const unconfirmed = createCustomHttpProvider({
    ...baseOptions({ costMode: 'free', freeConfirmed: false }),
    costLedger: await freeLedger(t),
    transport,
  })
  assert.equal((await unconfirmed.synthesize({ ...goodRequest, requestId: 'cost-unconfirmed' })).code, CUSTOM_HTTP_ERRORS.COST_UNKNOWN)
  assert.equal(calls, 0)

  const free = createCustomHttpProvider({
    ...baseOptions(),
    costLedger: await freeLedger(t, { maxCalls: 2 }),
    transport,
  })
  assert.equal((await free.synthesize({ ...goodRequest, requestId: 'cost-free-1' })).ok, true)
  assert.equal((await free.synthesize({ ...goodRequest, requestId: 'cost-free-1' })).code, CUSTOM_HTTP_ERRORS.COST_DUPLICATE_REQUEST)
  assert.equal((await free.synthesize({ ...goodRequest, requestId: 'cost-free-2' })).ok, true)
  assert.equal((await free.synthesize({ ...goodRequest, requestId: 'cost-free-3' })).code, CUSTOM_HTTP_ERRORS.COST_CALL_LIMIT_EXCEEDED)
  assert.equal(calls, 2)

  const paidRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wv-custom-paid-'))
  t.after(async () => { await fs.rm(paidRoot, { recursive: true, force: true }) })
  const paidLedger = await openCostLedger({ rootDir: paidRoot, mode: 'paid', limitMicros: 20, unitPriceMicrosPerCharacter: 10 })
  const paid = createCustomHttpProvider({
    ...baseOptions({ costMode: 'paid', unitPriceMicrosPerCharacter: 10 }),
    costLedger: paidLedger,
    transport,
  })
  assert.equal((await paid.synthesize({ ...goodRequest, requestId: 'cost-paid-1', text: 'ab' })).ok, true)
  assert.equal((await paid.synthesize({ ...goodRequest, requestId: 'cost-paid-2', text: 'cd' })).code, CUSTOM_HTTP_ERRORS.COST_QUOTA_EXCEEDED)
  assert.equal(calls, 3)
  const projection = paid.publicProjection()
  assert.equal(projection.gates.cost, 'PAID')
  assert.equal(projection.gates.costLabel.includes('明确付费'), true)
})

test('custom timeout UNKNOWN is not retried, and a pre-cancel creates no outbound request', async (t) => {
  let calls = 0
  const ledger = await freeLedger(t)
  const provider = createCustomHttpProvider({
    ...baseOptions(),
    costLedger: ledger,
    transport: async () => { calls += 1; return { ok: false, code: 'CLOUD_TIMEOUT', sent: true } },
  })
  const first = await provider.synthesize({ ...goodRequest, requestId: 'custom-unknown-1' })
  assert.equal(first.code, CUSTOM_HTTP_ERRORS.TIMEOUT)
  assert.equal(first.unknown, true)
  const second = await provider.synthesize({ ...goodRequest, requestId: 'custom-unknown-1' })
  assert.equal(second.code, CUSTOM_HTTP_ERRORS.COST_DUPLICATE_REQUEST)
  assert.equal(calls, 1)

  let requests = 0
  const { server, port } = await startServer((req, res) => {
    requests += 1
    res.writeHead(200, { 'Content-Type': 'audio/wav' })
    res.end(wavBytes())
  })
  t.after(() => server.close())
  const controller = new AbortController()
  controller.abort()
  const preProvider = createCustomHttpProvider({
    ...baseOptions({ target: `http://127.0.0.1:${port}/tts` }),
    costLedger: await freeLedger(t),
  })
  const pre = await preProvider.synthesize({ ...goodRequest, requestId: 'custom-pre-cancel' }, { signal: controller.signal })
  assert.equal(pre.code, CUSTOM_HTTP_ERRORS.CANCELLED)
  assert.equal(pre.sent, false)
  assert.equal(requests, 0)
})

test('custom same requestId concurrent and restart never resend', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wv-custom-restart-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  const firstLedger = await openCostLedger({ rootDir: root, mode: 'free', maxCalls: 10, limitMicros: 0, unitPriceMicrosPerCharacter: 0 })
  let calls = 0
  const transport = async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false }
  }
  const provider = createCustomHttpProvider({ ...baseOptions(), costLedger: firstLedger, transport })
  const [one, two] = await Promise.all([
    provider.synthesize({ ...goodRequest, requestId: 'custom-concurrent-001' }),
    provider.synthesize({ ...goodRequest, requestId: 'custom-concurrent-001' }),
  ])
  assert.equal(calls, 1)
  assert.equal([one, two].filter((item) => item.ok === true).length, 1)
  assert.equal([one, two].filter((item) => item.code === CUSTOM_HTTP_ERRORS.COST_DUPLICATE_REQUEST).length, 1)

  const unknownLedger = await openCostLedger({ rootDir: root, mode: 'free', maxCalls: 10, limitMicros: 0, unitPriceMicrosPerCharacter: 0 })
  const unknownProvider = createCustomHttpProvider({
    ...baseOptions(),
    costLedger: unknownLedger,
    transport: async () => { calls += 1; return { ok: false, code: 'CLOUD_TIMEOUT', sent: true } },
  })
  assert.equal((await unknownProvider.synthesize({ ...goodRequest, requestId: 'custom-restart-unknown' })).code, CUSTOM_HTTP_ERRORS.TIMEOUT)
  const reopenedLedger = await openCostLedger({ rootDir: root, mode: 'free', maxCalls: 10, limitMicros: 0, unitPriceMicrosPerCharacter: 0 })
  const reopenedProvider = createCustomHttpProvider({
    ...baseOptions(),
    costLedger: reopenedLedger,
    transport: async () => { calls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false } },
  })
  assert.equal((await reopenedProvider.synthesize({ ...goodRequest, requestId: 'custom-restart-unknown' })).code, CUSTOM_HTTP_ERRORS.COST_DUPLICATE_REQUEST)
  assert.equal(calls, 2)
})

test('custom cancel during target DNS resolution never enters transport', async (t) => {
  const controller = new AbortController()
  let transportCalls = 0
  const provider = createCustomHttpProvider({
    ...baseOptions({ target: 'https://tts.example.test/v1' }),
    costLedger: await freeLedger(t),
    dnsLookup: async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
      return [{ address: '93.184.216.34', family: 4 }]
    },
    transport: async () => { transportCalls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {} } },
  })
  setTimeout(() => controller.abort(), 5)
  const result = await provider.synthesize({ ...goodRequest, requestId: 'custom-dns-cancel' }, { signal: controller.signal })
  assert.equal(result.code, CUSTOM_HTTP_ERRORS.CANCELLED)
  assert.equal(result.sent, false)
  assert.equal(transportCalls, 0)
})

test('the real loopback transport executes the fixed JSON protocol and validates a real WAV', async (t) => {
  const wav = wavBytes()
  let received = null
  const { server, port } = await startServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      received = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      res.writeHead(200, { 'Content-Type': 'audio/wav' })
      res.end(wav)
    })
  })
  t.after(() => server.close())
  const provider = createCustomHttpProvider({
    ...baseOptions({ target: `http://127.0.0.1:${port}/tts` }),
    costLedger: await freeLedger(t),
  })
  const result = await provider.synthesize({ ...goodRequest, requestId: 'loopback-real' })
  assert.equal(result.ok, true)
  assert.equal(received.protocol, 'whale-voice-custom-tts')
  assert.equal(received.version, 1)
  assert.equal(received.requestId, 'loopback-real')
  assert.equal(received.text, goodRequest.text)
  assert.equal((await provider.health()).status.state, CUSTOM_HEALTH_STATES.AVAILABLE)
})

test('the real loopback path rejects a redirect before accepting bytes', async (t) => {
  const { server, port } = await startServer((req, res) => {
    res.writeHead(302, { Location: 'https://evil.example/' })
    res.end()
  })
  t.after(() => server.close())
  const provider = createCustomHttpProvider({ ...baseOptions({ target: `http://127.0.0.1:${port}/tts` }), costLedger: await freeLedger(t) })
  const result = await provider.synthesize({ ...goodRequest, requestId: 'loopback-redirect' })
  assert.equal(result.code, CUSTOM_HTTP_ERRORS.REDIRECT_REJECTED)
})
