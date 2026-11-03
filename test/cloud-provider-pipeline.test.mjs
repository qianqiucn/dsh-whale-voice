import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'
import { openCostLedger } from '../core/tts/cloud-cost.mjs'
import { createAzureSpeechProvider } from '../core/tts/azure-speech-adapter.mjs'
import { createCustomHttpProvider } from '../core/tts/custom-http-adapter.mjs'
import {
  cloudProviderComparison,
  cloudProviderPublicView,
  runCloudSynthesisFixture,
} from '../core/tts/cloud-provider-pipeline.mjs'

function wavBytes() {
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount: 2400, pattern: 'SILENCE' })
  assert.equal(produced.ok, true)
  return produced.value.bytes
}

async function ledger(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wv-pipeline-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  return openCostLedger({ rootDir: root, limitMicros: 100000, unitPriceMicrosPerCharacter: 10 })
}

test('both cloud adapters complete the neutral fixture flow without Task, Artifact or delivery', async (t) => {
  const azure = createAzureSpeechProvider({
    region: 'eastus',
    credentialRef: 'dpapi:whale-voice:azure',
    credentialStore: {
      async has() { return { ok: true, present: true } },
      async resolve() { return { ok: true, secret: 'synthetic-azure' } },
    },
    networkEnabled: true,
    consent: { textUpload: true, providerId: 'azure-speech' },
    costLedger: await ledger(t),
    unitPriceMicrosPerCharacter: 10,
    transport: async () => ({ ok: true, status: 200, body: wavBytes(), headers: {}, live: false }),
  })
  const custom = createCustomHttpProvider({
    target: 'http://127.0.0.1:9/tts',
    networkEnabled: true,
    consent: { textUpload: true, providerId: 'custom-http' },
    transport: async () => ({ ok: true, status: 200, body: wavBytes(), headers: {}, live: false }),
  })

  const azureRun = await runCloudSynthesisFixture({
    adapter: azure,
    request: { requestId: 'pipeline-azure', text: '你好，流水线。', voiceId: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN' },
  })
  assert.equal(azureRun.ok, true)
  assert.equal(azureRun.providerId, 'azure-speech')
  assert.equal(azureRun.persisted, false)
  assert.equal(azureRun.taskCreated, false)
  assert.equal(azureRun.artifactCreated, false)
  assert.equal(azureRun.delivery.state, 'PENDING_ROUTER')
  assert.equal(azureRun.neutralResult.delivery.state, 'PENDING_ROUTER')

  const customRun = await runCloudSynthesisFixture({
    adapter: custom,
    request: { requestId: 'pipeline-custom', text: '你好，自定义。', voiceId: 'custom-default', language: 'zh-CN' },
  })
  assert.equal(customRun.ok, true)
  assert.equal(customRun.providerId, 'custom-http')
  assert.equal(customRun.persisted, false)
  assert.equal(customRun.taskCreated, false)
  assert.equal(customRun.artifactCreated, false)
})

test('a non-persisted neutral result is enforced and malformed provider output fails closed', async () => {
  const invalidAdapter = {
    async health() { return { ok: true, status: { state: 'CONFIGURED_UNVERIFIED' } } },
    async synthesize() {
      return {
        ok: true,
        providerId: 'fake',
        requestId: 'x',
        persisted: true,
        result: { delivery: { state: 'SENT' } },
        bytes: Buffer.from('x'),
        inspection: { sampleRate: 24000 },
      }
    },
  }
  const run = await runCloudSynthesisFixture({ adapter: invalidAdapter, request: { text: 'x' } })
  assert.equal(run.ok, false)
  assert.equal(run.code, 'INVALID_RESPONSE')
})

test('public projections expose Chinese gates and never expose targets, refs or secrets', async (t) => {
  const azure = createAzureSpeechProvider({
    region: 'eastus',
    credentialRef: 'dpapi:whale-voice:azure-secret-ref',
    credentialStore: {
      async has() { return { ok: true, present: true } },
      async resolve() { return { ok: true, secret: 'AZURE-SECRET-VALUE' } },
    },
    networkEnabled: true,
    consent: { textUpload: true, providerId: 'azure-speech' },
    costLedger: await ledger(t),
    unitPriceMicrosPerCharacter: 10,
  })
  const custom = createCustomHttpProvider({
    target: 'https://tts.example.test/v1/synthesize',
    auth: { mode: 'bearer', credentialRef: 'dpapi:whale-voice:custom-secret-ref' },
    credentialStore: {
      async has() { return { ok: true, present: true } },
      async resolve() { return { ok: true, secret: 'CUSTOM-SECRET-VALUE' } },
    },
    networkEnabled: true,
    consent: { textUpload: true, providerId: 'custom-http' },
  })

  await azure.health()
  await custom.health()
  const azureView = cloudProviderPublicView(azure)
  const customView = cloudProviderPublicView(custom)
  assert.equal(azureView.ok, true)
  assert.equal(customView.ok, true)
  assert.equal(azureView.view.gates.networkLabel, '网络已启用（每次仍需操作授权）')
  assert.equal(azureView.view.gates.uploadLabel, '已确认文字上传')
  assert.equal(customView.view.gates.credentialLabel, '凭据已配置')

  const serialized = JSON.stringify({ azure: azureView, custom: customView })
  assert.equal(serialized.includes('AZURE-SECRET-VALUE'), false)
  assert.equal(serialized.includes('CUSTOM-SECRET-VALUE'), false)
  assert.equal(serialized.includes('dpapi:whale-voice'), false)
  assert.equal(serialized.includes('tts.example.test'), false)
  assert.equal(serialized.includes('127.0.0.1'), false)

  const comparison = cloudProviderComparison([azure, custom])
  assert.equal(comparison.ok, true)
  assert.equal(comparison.rows.length, 2)
  assert.equal(comparison.rows[0].providerId, 'azure-speech')
  assert.equal(comparison.rows[1].providerId, 'custom-http')
  assert.equal(comparison.rows[0].streaming, false)
  assert.equal(comparison.rows[0].clone, false)
})
