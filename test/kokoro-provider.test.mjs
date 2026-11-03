/* Plan10 10-C — Kokoro contract/adapter/protocol unit tests (pure). */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KOKORO_ERRORS, KOKORO_LANGUAGES, KOKORO_LIMITS, KOKORO_MODEL,
  buildKokoroManifest, checkKokoroModality, kokoroLicenseView, kokoroMetadataInventory,
} from '../core/tts/kokoro-contract.mjs'
import { validateProviderManifest } from '../core/tts/provider-contract.mjs'
import {
  classifyKokoroHealth, createKokoroProvider, normalizeKokoroDiscovery, validateKokoroOutput,
} from '../core/tts/kokoro-adapter.mjs'
import { createKokoroSupervisor } from '../core/tts/kokoro-supervisor.mjs'
import { PROVIDER_ERRORS } from '../core/tts/provider-contract.mjs'
import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'
import { decodeResponse, encodeRequest } from '../core/tts/kokoro-worker-protocol.mjs'

const VOICES = [
  { id: 'af-demo', name: 'Demo US', language: 'en-US' },
  { id: 'zf-demo', name: 'Demo CN', language: 'zh-CN' },
]

function manifestInput(overrides = {}) {
  return {
    model: KOKORO_MODEL, modelVersion: '1.0', voices: VOICES,
    languages: ['en-US', 'zh-CN'], limits: { maxChars: 300, maxAudioSeconds: 60, timeoutMs: 120000 },
    kokoroVersion: '0.9.4', ...overrides,
  }
}

function ready(overrides = {}) {
  return {
    provider: 'kokoro-local', workerVersion: '0.1.0', workerProtocol: 1, kokoroVersion: '0.9.4',
    backend: 'preset', model: KOKORO_MODEL, modelVersion: '1.0', modelSize: '82M',
    languages: [...KOKORO_LANGUAGES], voices: VOICES,
    limits: { maxChars: 300, maxAudioSeconds: 60, timeoutMs: 120000 },
    loaded: false, networkBlocked: true, dependencies: { kokoro: true }, snapshotCleanupPending: 0, state: 'ok',
    ...overrides,
  }
}

function discovery(overrides = {}) {
  return {
    models: [KOKORO_MODEL], model: KOKORO_MODEL, modelVersion: '1.0', backend: 'preset',
    languages: ['en-US', 'zh-CN'], voices: VOICES,
    limits: { maxChars: 300, maxAudioSeconds: 60, timeoutMs: 120000 }, ...overrides,
  }
}

test('Kokoro metadata fixes Apache code/model while dependencies/voices/G2P stay UNKNOWN', () => {
  const license = kokoroLicenseView()
  assert.equal(license.codeApache2, true)
  assert.equal(license.modelApache2, true)
  assert.equal(license.dependenciesCovered, false)
  assert.equal(license.voicesCovered, false)
  const inventory = kokoroMetadataInventory()
  assert.equal(inventory.dependencies.every((item) => item.licenseStatus === 'UNKNOWN'), true)
  assert.equal(inventory.voices.licenseStatus, 'UNKNOWN')
  assert.equal(inventory.g2p.licenseStatus, 'UNKNOWN')
  assert.equal(inventory.loadingBoundary.device, 'CPU only (device="cpu"); real CPU performance is not verified by this batch')
  assert.equal(KOKORO_LIMITS.sampleRate, 24000)
})

test('Kokoro manifest is preset-only, validates, and intersects declared voices/languages', () => {
  const built = buildKokoroManifest(manifestInput())
  assert.equal(built.ok, true, JSON.stringify(built))
  const validation = validateProviderManifest(built.manifest)
  assert.equal(validation.ok, true, JSON.stringify(validation.errors))
  assert.equal(built.manifest.id, 'kokoro-local')
  assert.equal(built.manifest.capabilities.clone.supported, false)
  assert.equal(built.manifest.capabilities.emotion.supported, false)
  assert.deepEqual(built.manifest.capabilities.languages.sort(), ['en-US', 'zh-CN'])
  assert.equal(built.manifest.capabilities.formats[0].sampleRate, 24000)
  assert.equal(built.manifest.resources.cpuCapable, true)
  assert.equal(buildKokoroManifest(manifestInput({ kokoroVersion: '0.9.5' })).code, KOKORO_ERRORS.VERSION_MISMATCH)
  assert.equal(buildKokoroManifest(manifestInput({ modelVersion: '1.1' })).code, KOKORO_ERRORS.MODEL_MISMATCH)
  assert.equal(buildKokoroManifest(manifestInput({ voices: [] })).code, KOKORO_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(buildKokoroManifest(manifestInput({ languages: ['fr-FR'] })).code, KOKORO_ERRORS.DISCOVERY_INCOMPLETE)
})

test('Kokoro modality guard rejects clone/design and accepts one preset voice', () => {
  assert.equal(checkKokoroModality({ voiceId: 'af-demo' }, null).ok, true)
  assert.equal(checkKokoroModality({ voiceId: 'af-demo' }, { kind: 'clone', voiceId: 'af-demo' }).code, KOKORO_ERRORS.CLONE_NOT_SUPPORTED)
  assert.equal(checkKokoroModality({ voicePrompt: 'x' }, null).code, KOKORO_ERRORS.UNSUPPORTED_MODALITY)
  assert.equal(checkKokoroModality({}, null).code, KOKORO_ERRORS.INVALID_INPUT)
})

test('Kokoro health/discovery identity and output validation are strict', () => {
  assert.equal(classifyKokoroHealth({ ready: ready(), health: { state: 'ok' } }).state, 'ok')
  assert.equal(classifyKokoroHealth({ ready: ready({ provider: 'qwen-tts' }) }).code, KOKORO_ERRORS.UNRELATED_SERVICE)
  assert.equal(classifyKokoroHealth({ ready: ready({ backend: 'clone' }) }).code, KOKORO_ERRORS.UNKNOWN_BACKEND)
  assert.equal(classifyKokoroHealth({ ready: ready({ kokoroVersion: '0.9.5' }) }).code, KOKORO_ERRORS.VERSION_MISMATCH)
  const normalized = normalizeKokoroDiscovery({ ready: ready(), discovery: discovery() })
  assert.equal(normalized.ok, true, JSON.stringify(normalized))
  assert.deepEqual(normalized.voices.map((voice) => voice.id).sort(), ['af-demo', 'zf-demo'])
  assert.equal(normalizeKokoroDiscovery({ ready: ready(), discovery: discovery({ voices: [] }) }).code, KOKORO_ERRORS.DISCOVERY_INCOMPLETE)

  const built = buildKokoroManifest(manifestInput())
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount: 2400, pattern: 'EDGE_SEQUENCE' })
  const payload = {
    state: 'ok', requestId: 'kokoro-1', model: KOKORO_MODEL, backend: 'preset', voiceId: 'af-demo',
    bytesBase64: Buffer.from(produced.value.bytes).toString('base64'), mime: 'audio/wav',
    sampleRate: 24000, channels: 1, durationMs: 100,
  }
  const base = { payload, manifest: built.manifest, requestId: 'kokoro-1', voiceId: 'af-demo', language: 'en-US' }
  assert.equal(validateKokoroOutput(base).ok, true)
  assert.equal(validateKokoroOutput({ ...base, voiceId: 'zf-demo' }).code, KOKORO_ERRORS.OUTPUT_IDENTITY_MISMATCH)
  assert.equal(validateKokoroOutput({ ...base, payload: { ...payload, sampleRate: 22050 } }).code, KOKORO_ERRORS.OUTPUT_FORMAT_MISMATCH)
  assert.equal(validateKokoroOutput({ ...base, payload: { ...payload, state: 'cancelled' } }).cancelled, true)
})

test('Kokoro protocol rejects clone/extra fields and requires preset/24k', () => {
  const valid = encodeRequest({
    v: 1, id: 'syn-1', type: 'synthesize',
    payload: {
      requestId: 'kokoro-1', text: 'Hello', model: KOKORO_MODEL, backend: 'preset',
      modality: 'preset', voiceId: 'af-demo', language: 'en-US',
      format: { mime: 'audio/wav', sampleRate: 24000, channels: 1 }, maxBytes: KOKORO_LIMITS.maxBytes,
    },
  })
  assert.equal(valid.ok, true, JSON.stringify(valid))
  const extra = encodeRequest({ v: 1, id: 'syn-1', type: 'synthesize', payload: { requestId: 'k', text: 'x', model: KOKORO_MODEL, backend: 'preset', modality: 'preset', voiceId: 'af-demo', language: 'en-US', format: { mime: 'audio/wav', sampleRate: 24000, channels: 1 }, maxBytes: 100, path: '/tmp/x' } })
  assert.equal(extra.ok, false)
  const readyLine = JSON.stringify({ v: 1, id: 'r1', type: 'ready', payload: ready() })
  assert.equal(decodeResponse(readyLine, { expect: ['ready'] }).ok, true)
})

test('Kokoro provider creation and supervisor startup fail closed', async () => {
  assert.equal(createKokoroProvider({}).code, KOKORO_ERRORS.WORKER_NOT_CONFIGURED)
  assert.equal(createKokoroProvider({ supervisor: { start: async () => ({ ok: true }) }, requestTimeoutMs: 1 }).code, KOKORO_ERRORS.INVALID_INPUT)
  const supervisor = createKokoroSupervisor({})
  const started = await supervisor.start()
  assert.equal(started.code, KOKORO_ERRORS.WORKER_NOT_CONFIGURED)
  let sends = 0
  const fake = {
    start: async () => ({ ok: true, ready: ready() }),
    health: async () => ({ ok: true, state: 'ok', payload: ready() }),
    discover: async () => ({ ok: true, payload: discovery() }),
    synthesize: async () => { sends += 1; return { ok: false } },
    cancel: async () => ({ ok: false }), stop: async () => ({ ok: true }),
    state: () => ({ ready: ready(), activeOperations: 0, unresolvedOperations: 0 }),
  }
  const provider = createKokoroProvider({ supervisor: fake })
  assert.equal((await provider.start()).ok, true)
  const noTask = await provider.synthesize({ text: 'x', voiceId: 'af-demo', language: 'en-US', emotion: 'neutral' }, {})
  assert.equal(noTask.code, PROVIDER_ERRORS.INVALID_RESPONSE)
  const rejected = createKokoroProvider({ supervisor: fake, taskAuthority: async () => ({ ok: false }) })
  await rejected.start()
  const refused = await rejected.synthesize({ text: 'x', voiceId: 'af-demo', language: 'en-US', emotion: 'neutral' }, { taskId: 'task-kokoro-1' })
  assert.equal(refused.code, PROVIDER_ERRORS.INVALID_RESPONSE)
  assert.equal(sends, 0)
})
