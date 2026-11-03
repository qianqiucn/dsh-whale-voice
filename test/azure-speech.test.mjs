import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'
import { openCostLedger } from '../core/tts/cloud-cost.mjs'
import {
  AZURE_HEALTH_STATES,
  azureHealthLabel,
  createAzureSpeechProvider,
} from '../core/tts/azure-speech-adapter.mjs'
import {
  AZURE_SPEECH_ERRORS,
  buildAzureSpeechManifest,
  buildAzureSsml,
  escapeSsmlText,
} from '../core/tts/azure-speech-contract.mjs'

function wavBytes() {
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount: 2400, pattern: 'SILENCE' })
  assert.equal(produced.ok, true)
  return produced.value.bytes
}

function fakeStore({ present = true, secret = 'synthetic-azure-key' } = {}) {
  return {
    async has() { return { ok: true, present } },
    async resolve() { return present ? { ok: true, secret } : { ok: false, code: 'CREDENTIAL_NOT_FOUND' } },
  }
}

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wv-azure-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  return root
}

async function ledgerFor(t, { limitMicros = 100000, price = 10 } = {}) {
  const root = await tempRoot(t)
  const ledger = await openCostLedger({ rootDir: root, limitMicros, unitPriceMicrosPerCharacter: price })
  assert.equal(ledger.ok, true)
  return ledger
}

function baseOptions(overrides = {}) {
  return {
    region: 'eastus',
    credentialRef: 'dpapi:whale-voice:azure-test',
    credentialStore: fakeStore(),
    networkEnabled: true,
    consent: { textUpload: true, providerId: 'azure-speech' },
    unitPriceMicrosPerCharacter: 10,
    ...overrides,
  }
}

const goodRequest = {
  requestId: 'azure-request-001',
  text: '你好，小鲸鱼。',
  voiceId: 'zh-CN-XiaoxiaoNeural',
  language: 'zh-CN',
}

test('SSML escapes plain text and rejects control characters or mismatched voice/language', () => {
  const escaped = escapeSsmlText('<b>&"\'</b>')
  assert.equal(escaped, '&lt;b&gt;&amp;&quot;&apos;&lt;/b&gt;')
  const built = buildAzureSsml({ text: '你好 <&>', voiceId: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN' })
  assert.equal(built.ok, true)
  assert.ok(built.ssml.includes('&lt;&amp;&gt;'))
  assert.equal(built.ssml.includes('<&>'), false)
  assert.equal(buildAzureSsml({ text: 'x', voiceId: 'zh-CN-XiaoxiaoNeural', language: 'en-US' }).code, AZURE_SPEECH_ERRORS.LANGUAGE_UNSUPPORTED)
  assert.equal(buildAzureSsml({ text: 'x', voiceId: 'not-a-voice', language: 'zh-CN' }).code, AZURE_SPEECH_ERRORS.VOICE_UNSUPPORTED)
  assert.equal(buildAzureSsml({ text: 'x\u0000y', voiceId: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN' }).code, AZURE_SPEECH_ERRORS.TEXT_INVALID)
})

test('manifest exposes a narrow preset-only Azure capability set', () => {
  const built = buildAzureSpeechManifest({ region: 'eastus', credentialRef: 'dpapi:whale-voice:azure' })
  assert.equal(built.ok, true)
  assert.equal(built.manifest.kind, 'CLOUD')
  assert.equal(built.manifest.capabilities.clone.supported, false)
  assert.equal(built.manifest.capabilities.emotion.supported, false)
  assert.equal(built.manifest.capabilities.streaming, false)
  assert.equal(built.manifest.capabilities.formats[0].sampleRate, 24000)
  assert.equal(built.manifest.capabilities.formats[0].channels, 1)
  assert.equal(built.manifest.credentials.storage, 'dpapi')
  assert.equal(built.manifest.network.textUpload, true)
  assert.equal(built.manifest.cost.paid, true)
  assert.equal(buildAzureSpeechManifest({ region: 'not-a-region' }).code, AZURE_SPEECH_ERRORS.REGION_UNSUPPORTED)
})

test('health distinguishes unconfigured, missing credential, network disabled, unverified and live verified', async (t) => {
  const ledger = await ledgerFor(t)
  const noRegion = createAzureSpeechProvider({ ...baseOptions(), region: null })
  assert.equal((await noRegion.health()).status.state, AZURE_HEALTH_STATES.NOT_CONFIGURED)
  assert.equal(azureHealthLabel(AZURE_HEALTH_STATES.NETWORK_DISABLED), '网络未启用')

  const missing = createAzureSpeechProvider({ ...baseOptions({ credentialStore: fakeStore({ present: false }) }), costLedger: ledger })
  assert.equal((await missing.health()).status.state, AZURE_HEALTH_STATES.CREDENTIALS_MISSING)

  const offline = createAzureSpeechProvider({ ...baseOptions({ networkEnabled: false }), costLedger: ledger })
  assert.equal((await offline.health()).status.state, AZURE_HEALTH_STATES.NETWORK_DISABLED)

  const provider = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: ledger,
    transport: async () => ({ ok: true, status: 200, body: wavBytes(), headers: {}, live: false }),
  })
  assert.equal((await provider.health()).status.state, AZURE_HEALTH_STATES.CONFIGURED_UNVERIFIED)
  const result = await provider.synthesize({ ...goodRequest, requestId: 'azure-health-fake' })
  assert.equal(result.ok, true)
  assert.equal((await provider.health()).status.state, AZURE_HEALTH_STATES.CONFIGURED_UNVERIFIED)

  const live = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: await ledgerFor(t),
    transport: async () => ({ ok: true, status: 200, body: wavBytes(), headers: {}, live: true }),
  })
  assert.equal((await live.synthesize({ ...goodRequest, requestId: 'azure-health-live' })).ok, true)
  assert.equal((await live.health()).status.state, AZURE_HEALTH_STATES.AVAILABLE)
})

test('every gate rejects before transport and a normal fake call returns a neutral non-persisted result', async (t) => {
  const ledger = await ledgerFor(t)
  let calls = 0
  const transport = async () => { calls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false } }
  const make = (overrides = {}) => {
    const providerOptions = { ...baseOptions(overrides), transport }
    if (!Object.prototype.hasOwnProperty.call(overrides, 'costLedger')) providerOptions.costLedger = ledger
    return createAzureSpeechProvider(providerOptions)
  }

  assert.equal((await make({ networkEnabled: false }).synthesize({ ...goodRequest, requestId: 'gate-network' })).code, AZURE_SPEECH_ERRORS.NETWORK_DISABLED)
  assert.equal((await make({ consent: null }).synthesize({ ...goodRequest, requestId: 'gate-consent' })).code, AZURE_SPEECH_ERRORS.TEXT_UPLOAD_NOT_CONFIRMED)
  assert.equal((await make({ credentialStore: fakeStore({ present: false }) }).synthesize({ ...goodRequest, requestId: 'gate-credential' })).code, AZURE_SPEECH_ERRORS.CREDENTIALS_MISSING)
  assert.equal((await make({ costLedger: null }).synthesize({ ...goodRequest, requestId: 'gate-cost' })).code, AZURE_SPEECH_ERRORS.COST_UNKNOWN)
  assert.equal(calls, 0)

  const provider = make()
  const result = await provider.synthesize(goodRequest)
  assert.equal(result.ok, true)
  assert.equal(result.providerId, 'azure-speech')
  assert.equal(result.persisted, false)
  assert.equal(result.result.delivery.state, 'PENDING_ROUTER')
  assert.equal(result.result.mime, 'audio/wav')
  assert.equal(result.result.sampleRate, 24000)
  assert.equal(result.result.channels, 1)
  assert.ok(result.result.artifactRef.startsWith('cloud:azure-speech:'))
  assert.ok(result.bytes.length > 0)
  assert.equal(ledger.snapshot().spentMicros, goodRequest.text.length * 10)
  const projection = provider.publicProjection()
  assert.equal(JSON.stringify(projection).includes('synthetic-azure-key'), false)
  assert.equal(JSON.stringify(projection).includes('dpapi:whale-voice'), false)
})

test('quota and duplicate request gates never send a second request', async (t) => {
  const ledger = await ledgerFor(t, { limitMicros: 20, price: 10 })
  let calls = 0
  const provider = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: ledger,
    transport: async () => { calls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false } },
  })
  const first = await provider.synthesize({ ...goodRequest, requestId: 'dup-001', text: 'ab' })
  assert.equal(first.ok, true)
  const duplicate = await provider.synthesize({ ...goodRequest, requestId: 'dup-001', text: 'ab' })
  assert.equal(duplicate.code, AZURE_SPEECH_ERRORS.COST_DUPLICATE_REQUEST)
  assert.equal(calls, 1)
  const over = await provider.synthesize({ ...goodRequest, requestId: 'quota-001', text: 'abc' })
  assert.equal(over.code, AZURE_SPEECH_ERRORS.COST_QUOTA_EXCEEDED)
  assert.equal(calls, 1)
})

test('HTTP 401/403, 429, 5xx, redirect, bad WAV and oversize map to stable errors', async (t) => {
  const ledger = await ledgerFor(t)
  const make = (response) => createAzureSpeechProvider({ ...baseOptions(), costLedger: ledger, transport: async () => response })
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 401, sent: true }).synthesize({ ...goodRequest, requestId: 'err-401' })).code, AZURE_SPEECH_ERRORS.AUTH_FAILED)
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 403, sent: true }).synthesize({ ...goodRequest, requestId: 'err-403' })).code, AZURE_SPEECH_ERRORS.AUTH_FAILED)
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 429, sent: true }).synthesize({ ...goodRequest, requestId: 'err-429' })).code, AZURE_SPEECH_ERRORS.RATE_LIMITED)
  assert.equal((await make({ ok: false, code: 'CLOUD_HTTP_STATUS', status: 500, sent: true }).synthesize({ ...goodRequest, requestId: 'err-500' })).code, AZURE_SPEECH_ERRORS.PROVIDER_ERROR)
  assert.equal((await make({ ok: false, code: 'CLOUD_REDIRECT_REJECTED', sent: true }).synthesize({ ...goodRequest, requestId: 'err-redirect' })).code, AZURE_SPEECH_ERRORS.REDIRECT_REJECTED)
  assert.equal((await make({ ok: false, code: 'CLOUD_RESPONSE_TOO_LARGE', sent: true }).synthesize({ ...goodRequest, requestId: 'err-large' })).code, AZURE_SPEECH_ERRORS.RESPONSE_TOO_LARGE)
  assert.equal((await make({ ok: true, status: 200, body: Buffer.from('not a wav'), headers: {} }).synthesize({ ...goodRequest, requestId: 'err-wav' })).code, AZURE_SPEECH_ERRORS.INVALID_AUDIO)
})

test('timeout and cancellation are UNKNOWN/CANCELLED and never resent', async (t) => {
  const ledger = await ledgerFor(t)
  let calls = 0
  const timeoutProvider = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: ledger,
    transport: async () => { calls += 1; return { ok: false, code: 'CLOUD_TIMEOUT', sent: true } },
  })
  const timeout = await timeoutProvider.synthesize({ ...goodRequest, requestId: 'timeout-001' })
  assert.equal(timeout.code, AZURE_SPEECH_ERRORS.TIMEOUT)
  assert.equal(timeout.unknown, true)
  assert.equal(timeout.terminal, 'UNKNOWN')
  assert.equal(calls, 1)
  assert.equal(ledger.snapshot().unknownMicros, goodRequest.text.length * 10)

  const controller = new AbortController()
  const cancelProvider = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: await ledgerFor(t),
    transport: async (requestOptions) => new Promise((resolve) => {
      requestOptions.signal.addEventListener('abort', () => resolve({ ok: false, code: 'CLOUD_CANCELLED', sent: true }), { once: true })
      setTimeout(() => controller.abort(), 10)
    }),
  })
  const cancelled = await cancelProvider.synthesize({ ...goodRequest, requestId: 'cancel-001' }, { signal: controller.signal })
  assert.equal(cancelled.code, AZURE_SPEECH_ERRORS.CANCELLED)
  assert.equal(cancelled.terminal, 'CANCELLED')
})

test('same requestId concurrent calls enter transport exactly once', async (t) => {
  const ledger = await ledgerFor(t)
  let calls = 0
  const provider = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: ledger,
    transport: async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false }
    },
  })
  const [first, second] = await Promise.all([
    provider.synthesize({ ...goodRequest, requestId: 'azure-concurrent-001' }),
    provider.synthesize({ ...goodRequest, requestId: 'azure-concurrent-001' }),
  ])
  assert.equal(calls, 1)
  assert.equal([first, second].filter((item) => item.ok === true).length, 1)
  assert.equal([first, second].filter((item) => item.code === AZURE_SPEECH_ERRORS.COST_DUPLICATE_REQUEST).length, 1)
})

test('pre-cancel and cancel during credential resolution never create a request', async (t) => {
  const ledger = await ledgerFor(t)
  let transportCalls = 0
  const pre = new AbortController()
  pre.abort()
  const preProvider = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: ledger,
    transport: async () => { transportCalls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {} } },
  })
  const preResult = await preProvider.synthesize({ ...goodRequest, requestId: 'azure-pre-cancel' }, { signal: pre.signal })
  assert.equal(preResult.code, AZURE_SPEECH_ERRORS.CANCELLED)
  assert.equal(preResult.sent, false)

  const controller = new AbortController()
  const slowStore = {
    async has() { await new Promise((resolve) => setTimeout(resolve, 40)); return { ok: true, present: true } },
    async resolve() { return { ok: true, secret: 'synthetic' } },
  }
  const provider = createAzureSpeechProvider({
    ...baseOptions({ credentialStore: slowStore }),
    costLedger: ledger,
    transport: async () => { transportCalls += 1; return { ok: true, status: 200, body: wavBytes(), headers: {} } },
  })
  setTimeout(() => controller.abort(), 5)
  const result = await provider.synthesize({ ...goodRequest, requestId: 'azure-credential-cancel' }, { signal: controller.signal })
  assert.equal(result.code, AZURE_SPEECH_ERRORS.CANCELLED)
  assert.equal(result.sent, false)
  assert.equal(transportCalls, 0)
})

test('cancel during cost commit does not return success audio and keeps the charge/UNKNOWN', async (t) => {
  const baseLedger = await ledgerFor(t)
  const slowLedger = {
    ...baseLedger,
    async commit(args) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return baseLedger.commit(args)
    },
  }
  const controller = new AbortController()
  const provider = createAzureSpeechProvider({
    ...baseOptions(),
    costLedger: slowLedger,
    transport: async () => {
      setTimeout(() => controller.abort(), 5)
      return { ok: true, status: 200, body: wavBytes(), headers: {}, live: false }
    },
  })
  const result = await provider.synthesize({ ...goodRequest, requestId: 'azure-commit-cancel' }, { signal: controller.signal })
  assert.equal(result.code, AZURE_SPEECH_ERRORS.CANCELLED)
  assert.equal(result.cancelled, true)
  assert.equal(result.ok, false)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'bytes'), false)
  const snapshot = baseLedger.snapshot()
  assert.equal(snapshot.pendingMicros, 0)
  assert.ok(snapshot.spentMicros > 0 || snapshot.unknownMicros > 0)
})

test('transport secrets never appear in results, errors or public projection', async (t) => {
  const ledger = await ledgerFor(t)
  const secret = 'SECRET-SHOULD-NOT-LEAK-0123456789'
  const provider = createAzureSpeechProvider({
    ...baseOptions({ credentialStore: fakeStore({ secret }) }),
    costLedger: ledger,
    transport: async (requestOptions) => {
      assert.equal(requestOptions.headers['Ocp-Apim-Subscription-Key'], secret)
      assert.equal(JSON.stringify(requestOptions).includes('SECRET-SHOULD-NOT-LEAK'), true)
      return { ok: false, code: 'CLOUD_HTTP_STATUS', status: 500, sent: true }
    },
  })
  const result = await provider.synthesize({ ...goodRequest, requestId: 'secret-001' })
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(JSON.stringify(provider.publicProjection()).includes(secret), false)
  assert.equal(JSON.stringify(provider.publicProjection()).includes('dpapi:whale-voice'), false)
})
