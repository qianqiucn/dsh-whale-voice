/* Plan10 10-B — IndexTTS adapter/supervisor unit tests (pure, no Python/model). */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INDEX_TTS_ERRORS,
  INDEX_TTS_LANGUAGES,
  INDEX_TTS_LIMITS,
  INDEX_TTS_MODEL,
  buildIndexManifest,
  indexEmotionVector,
} from '../core/tts/index-tts-contract.mjs'
import {
  classifyIndexHealth,
  createIndexTtsProvider,
  normalizeIndexDiscovery,
  validateIndexOutput,
} from '../core/tts/index-tts-adapter.mjs'
import { createIndexTtsSupervisor } from '../core/tts/index-tts-supervisor.mjs'
import { PROVIDER_ERRORS } from '../core/tts/provider-contract.mjs'
import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

function ready(overrides = {}) {
  return {
    provider: 'index-tts-local',
    workerVersion: '0.1.0',
    workerProtocol: 1,
    indexTtsVersion: '2.0.0',
    backend: 'clone-emotion',
    model: 'IndexTTS-2.5',
    modelVersion: '2.5',
    modelSize: '0.8B',
    languages: [...INDEX_TTS_LANGUAGES],
    voices: [],
    limits: { maxChars: 200, maxAudioSeconds: 60, timeoutMs: 180000 },
    loaded: false,
    networkBlocked: true,
    dependencies: { indextts: true },
    qwenEmoAvailable: true,
    snapshotCleanupPending: 0,
    state: 'ok',
    ...overrides,
  }
}

function discovery(overrides = {}) {
  return {
    models: [INDEX_TTS_MODEL],
    model: INDEX_TTS_MODEL,
    modelVersion: '2.5',
    backend: 'clone-emotion',
    languages: [...INDEX_TTS_LANGUAGES],
    voices: [],
    limits: { maxChars: 200, maxAudioSeconds: 60, timeoutMs: 180000 },
    qwenEmoAvailable: true,
    ...overrides,
  }
}

const BINDINGS = [
  { voiceId: 'demo-voice', name: 'Demo', kind: 'clone', referenceRef: 'binding:demo-1', languages: ['zh-CN'] },
]

test('Index health classification requires the exact provider/model/version/protocol identity', () => {
  assert.equal(classifyIndexHealth({ ready: ready() }).state, 'unknown')
  assert.equal(classifyIndexHealth({ ready: ready(), health: { state: 'ok' } }).state, 'ok')
  assert.equal(classifyIndexHealth({ ready: ready({ provider: 'qwen-tts' }) }).code, INDEX_TTS_ERRORS.UNRELATED_SERVICE)
  assert.equal(classifyIndexHealth({ ready: ready({ workerProtocol: 2 }) }).code, INDEX_TTS_ERRORS.WORKER_PROTOCOL_MISMATCH)
  assert.equal(classifyIndexHealth({ ready: ready({ model: 'IndexTTS-2' }) }).code, INDEX_TTS_ERRORS.MODEL_MISMATCH)
  assert.equal(classifyIndexHealth({ ready: ready({ modelVersion: '2.0' }) }).code, INDEX_TTS_ERRORS.MODEL_MISMATCH)
  assert.equal(classifyIndexHealth({ ready: ready({ indexTtsVersion: '2.0.1' }) }).code, INDEX_TTS_ERRORS.VERSION_MISMATCH)
  assert.equal(classifyIndexHealth({ ready: ready({ qwenEmoAvailable: undefined }) }).code, INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(classifyIndexHealth({ ready: ready(), health: { state: 'degraded' } }).state, 'degraded')
})

test('Index discovery normalizes trusted clone voices and language intersections', () => {
  const normalized = normalizeIndexDiscovery({ ready: ready(), discovery: discovery(), bindings: BINDINGS })
  assert.equal(normalized.ok, true, JSON.stringify(normalized))
  assert.equal(normalized.voices[0].id, 'demo-voice')
  assert.deepEqual(normalized.voices[0].languages, ['zh-CN'])
  assert.equal(normalized.bindingIndex['demo-voice'].referenceRef, 'binding:demo-1')
  const noBinding = normalizeIndexDiscovery({ ready: ready(), discovery: discovery(), bindings: [] })
  assert.equal(noBinding.code, INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED)
  const conflicting = normalizeIndexDiscovery({
    ready: ready(),
    discovery: discovery({ languages: ['en-US'] }),
    bindings: [{ voiceId: 'demo-voice', kind: 'clone', referenceRef: 'binding:demo-1', languages: ['zh-CN'] }],
  })
  assert.equal(conflicting.code, INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED)
  const wrongModel = normalizeIndexDiscovery({ ready: ready(), discovery: discovery({ models: ['IndexTTS-2'] }), bindings: BINDINGS })
  assert.equal(wrongModel.code, INDEX_TTS_ERRORS.MODEL_MISMATCH)
})

test('Index output validation rejects wrong identity, format, duration and oversized bytes', () => {
  const built = buildIndexManifest({
    backend: 'clone-emotion',
    model: INDEX_TTS_MODEL,
    modelVersion: '2.5',
    voices: BINDINGS.map((voice) => ({ id: voice.voiceId, name: voice.name, languages: voice.languages })),
    languages: [...INDEX_TTS_LANGUAGES],
    limits: { maxChars: 200, maxAudioSeconds: 60, timeoutMs: 180000 },
    indexTtsVersion: '2.0.0',
    qwenEmoAvailable: true,
  })
  assert.equal(built.ok, true, JSON.stringify(built))
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 22050, channels: 1, frameCount: 2205, pattern: 'EDGE_SEQUENCE' })
  assert.equal(produced.ok, true)
  const bytes = produced.value.bytes
  const base = {
    payload: {
      state: 'ok',
      requestId: 'indextts-1',
      model: INDEX_TTS_MODEL,
      backend: 'clone-emotion',
      voiceId: 'demo-voice',
      bytesBase64: Buffer.from(bytes).toString('base64'),
      mime: 'audio/wav',
      sampleRate: 22050,
      channels: 1,
      durationMs: 100,
    },
    manifest: built.manifest,
    requestId: 'indextts-1',
    voiceId: 'demo-voice',
    model: INDEX_TTS_MODEL,
    backend: 'clone-emotion',
    language: 'zh-CN',
    emotion: 'happy',
  }
  const valid = validateIndexOutput(base)
  assert.equal(valid.ok, true, JSON.stringify(valid.code || valid.field || valid.detail))
  assert.equal(valid.result.sampleRate, 22050)
  assert.equal(validateIndexOutput({ ...base, requestId: 'other' }).code, INDEX_TTS_ERRORS.OUTPUT_IDENTITY_MISMATCH)
  assert.equal(validateIndexOutput({ ...base, voiceId: 'other-voice' }).code, INDEX_TTS_ERRORS.OUTPUT_IDENTITY_MISMATCH)
  assert.equal(validateIndexOutput({ ...base, payload: { ...base.payload, sampleRate: 16000 } }).code, INDEX_TTS_ERRORS.OUTPUT_FORMAT_MISMATCH)
  assert.equal(validateIndexOutput({ ...base, maxAudioSeconds: 0.01 }).code, INDEX_TTS_ERRORS.OUTPUT_TOO_LARGE)
  assert.equal(validateIndexOutput({ ...base, maxBytes: 100 }).code, INDEX_TTS_ERRORS.OUTPUT_TOO_LARGE)
  assert.equal(validateIndexOutput({ ...base, payload: { ...base.payload, state: 'cancelled' } }).cancelled, true)
})

test('Index provider creation and supervisor startup fail closed without explicit configuration', async () => {
  const noSupervisor = createIndexTtsProvider({})
  assert.equal(noSupervisor.code, INDEX_TTS_ERRORS.WORKER_NOT_CONFIGURED)
  const badTimeout = createIndexTtsProvider({ supervisor: { start: async () => ({ ok: true }) }, requestTimeoutMs: 1 })
  assert.equal(badTimeout.code, INDEX_TTS_ERRORS.INVALID_INPUT)
  const badModel = createIndexTtsProvider({ supervisor: { start: async () => ({ ok: true }) }, modelIdentity: 'Qwen3-TTS' })
  assert.equal(badModel.code, INDEX_TTS_ERRORS.MODEL_MISMATCH)
  const supervisor = createIndexTtsSupervisor({})
  const started = await supervisor.start()
  assert.equal(started.ok, false)
  assert.equal(started.code, INDEX_TTS_ERRORS.WORKER_NOT_CONFIGURED)
})

test('Index provider requires a Task id and refuses a rejecting authority before any worker request', async () => {
  let sends = 0
  const supervisor = {
    start: async () => ({ ok: true, ready: ready() }),
    health: async () => ({ ok: true, state: 'ok', payload: ready() }),
    discover: async () => ({ ok: true, payload: discovery() }),
    synthesize: async () => { sends += 1; return { ok: false } },
    cancel: async () => ({ ok: false }),
    stop: async () => ({ ok: true }),
    state: () => ({ ready: ready(), activeOperations: 0, unresolvedOperations: 0 }),
  }
  const provider = createIndexTtsProvider({ supervisor, bindings: BINDINGS, bindingResolver: () => ({ referenceRef: 'binding:demo-1' }) })
  const started = await provider.start()
  assert.equal(started.ok, true, JSON.stringify(started))
  const noTask = await provider.synthesize(
    { text: '任务', language: 'zh-CN', emotion: 'happy' },
    { binding: { kind: 'clone', voiceId: 'demo-voice' } },
  )
  assert.equal(noTask.ok, false)
  assert.equal(noTask.code, PROVIDER_ERRORS.INVALID_RESPONSE)
  const rejecting = createIndexTtsProvider({
    supervisor,
    bindings: BINDINGS,
    bindingResolver: () => ({ referenceRef: 'binding:demo-1' }),
    taskAuthority: async () => ({ ok: false }),
  })
  await rejecting.start()
  const refused = await rejecting.synthesize(
    { text: '任务', language: 'zh-CN', emotion: 'happy' },
    { taskId: 'task-index-1', binding: { kind: 'clone', voiceId: 'demo-voice' } },
  )
  assert.equal(refused.ok, false)
  assert.equal(refused.code, PROVIDER_ERRORS.INVALID_RESPONSE)
  assert.equal(sends, 0)
  assert.deepEqual(indexEmotionVector('happy'), [1, 0, 0, 0, 0, 0, 0, 0])
})
