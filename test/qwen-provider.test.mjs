/* Plan10 10-A — Qwen3-TTS provider contract, worker protocol, supervisor, Fake end-to-end and the
 * 0120 counterexamples (request gate, identity/capability binding, UNKNOWN/cancel terminals, process
 * generation/cleanup, bounded protocol and existing Task authority). */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn as nodeSpawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateProviderManifest, PROVIDER_ERRORS, PROVIDER_STATES } from '../core/tts/provider-contract.mjs'
import {
  QWEN_AUDITED_MODELS,
  QWEN_DEPENDENCIES,
  QWEN_ERRORS,
  QWEN_LIMITS,
  QWEN_PROVIDER_ID,
  buildQwenManifest,
  checkQwenModality,
  qwenCapabilityMatrix,
  qwenLicenseView,
  qwenMetadataInventory,
} from '../core/tts/qwen-contract.mjs'
import {
  encodeRequest,
  decodeResponse,
  QWEN_PROTOCOL_ERRORS,
} from '../core/tts/qwen-worker-protocol.mjs'
import { createQwenSupervisor } from '../core/tts/qwen-supervisor.mjs'
import {
  classifyQwenHealth,
  createQwenProvider,
  normalizeQwenDiscovery,
  validateQwenOutput,
} from '../core/tts/qwen-adapter.mjs'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeWorker = path.join(here, '..', 'test-fixtures', 'fake-qwen-worker.mjs')
const stubbornWorker = path.join(here, '..', 'test-fixtures', 'fake-qwen-stubborn-worker.mjs')
const fakeRoot = path.join(here, '..', 'test-fixtures')

const SPAWN_OK = (() => {
  try {
    const probe = spawnSync(process.execPath, ['-e', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
    return !probe.error && probe.status === 0
  } catch {
    return false
  }
})()
const spawnSkip = SPAWN_OK ? false : 'child_process spawn is not permitted on this platform'

function voices() {
  return [
    { id: 'demo-voice-a', name: '示例音色 A', languages: ['zh-CN'] },
    { id: 'demo-voice-b', name: '示例音色 B', languages: ['zh-CN', 'en-US'] },
  ]
}

function ready(overrides = {}) {
  return {
    provider: 'qwen-tts',
    workerProtocol: 1,
    backend: 'custom-voice',
    model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
    qwenTtsVersion: '0.1.1',
    instructSupported: true,
    languages: ['zh-CN', 'en-US'],
    ...overrides,
  }
}

function discovery(overrides = {}) {
  return {
    models: ['Qwen3-TTS-12Hz-1.7B-CustomVoice'],
    voices: voices(),
    languages: ['zh-CN', 'en-US'],
    limits: { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 120000 },
    ...overrides,
  }
}

function makeSupervisor(mode, extra = {}) {
  const args = [`--mode=${mode}`, ...(extra.args || [])]
  return createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
    ...(extra.supervisor || {}),
  })
}

async function withProvider(mode, options = {}, fn) {
  const supervisor = options.supervisorFactory ? options.supervisorFactory() : makeSupervisor(mode, options)
  const provider = createQwenProvider({
    supervisor,
    requestTimeoutMs: options.requestTimeoutMs === undefined ? 5000 : options.requestTimeoutMs,
    bindingResolver: options.bindingResolver,
    bindings: options.bindings,
    taskAuthority: options.taskAuthority,
    modelIdentity: options.modelIdentity,
  })
  try {
    return await fn({ provider, supervisor })
  } finally {
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    else await supervisor.stop().catch(() => null)
  }
}

async function waitFor(predicate, timeoutMs = 3000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('waitFor timed out')
}

function captureSpawn() {
  let captured = null
  const spawnProcess = (command, args, options) => {
    captured = nodeSpawn(command, args, options)
    return captured
  }
  return { spawnProcess, child: () => captured }
}

async function catalogFixture() {
  const sandbox = createConfigSandbox({ prefix: 'wv-qwen-task-' })
  const opened = await openFixtureTaskCatalog({ sandbox })
  assert.equal(opened.ok, true, JSON.stringify(opened.errors))
  const handle = opened.value
  const scopeId = 'scope:fixture-qwen-task'
  const reserved = await handle.reserve({
    schemaVersion: 1,
    scopeId,
    idempotencyKey: 'key:fixture-qwen-task-1',
    draft: {
      schemaVersion: 1,
      feature: 'voice-bubbles',
      taskType: 'TTS',
      source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-1' },
      voiceProfileId: 'voice:demo-hero',
      deliveryRequested: false,
      rights: { state: 'CONFIRMED_FIXTURE' },
    },
    observedAt: '2026-11-02T00:00:00.000Z',
  })
  assert.equal(reserved.ok, true, JSON.stringify(reserved.errors))
  return {
    sandbox,
    handle,
    scopeId,
    taskId: reserved.value.task.taskId,
    dispose: () => removeConfigSandbox(sandbox),
  }
}

function authorityFrom(handle, scopeId) {
  return async (taskId) => {
    const found = await handle.get({ schemaVersion: 1, scopeId, taskId })
    if (!found.ok) return { ok: false }
    return { ok: true, state: found.value.task.state }
  }
}

test('capability matrix, audited models and static metadata inventory stay separate and honest', () => {
  const matrix = qwenCapabilityMatrix()
  assert.equal(matrix.length, 3)
  const custom = matrix.find((item) => item.backend === 'custom-voice')
  const clone = matrix.find((item) => item.backend === 'base-clone')
  const design = matrix.find((item) => item.backend === 'voice-design')
  assert.equal(custom.presetVoices, true)
  assert.equal(custom.clone, false)
  assert.equal(clone.clone, true)
  assert.equal(clone.requiresReferenceAudio, true)
  assert.equal(design.voiceDesign, true)
  assert.equal(design.publicRequest, false)

  const built = buildQwenManifest({
    backend: 'custom-voice',
    model: 'Qwen3-TTS-12Hz-1.7B-Base'.replace('Base', 'CustomVoice'),
    voices: voices(),
    languages: ['zh-CN'],
    limits: { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 120000 },
    qwenTtsVersion: '0.1.1',
  })
  assert.equal(built.ok, true, built.code)
  const validated = validateProviderManifest(built.manifest)
  assert.equal(validated.ok, true, JSON.stringify(validated.errors))
  assert.equal(built.manifest.id, QWEN_PROVIDER_ID)
  assert.equal(built.manifest.version.audited, true)
  assert.equal(built.manifest.capabilities.limits.maxChars, QWEN_LIMITS.maxChars)

  assert.equal(buildQwenManifest({ backend: 'custom-voice', model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice', voices: voices(), languages: ['zh-CN'] }).code, QWEN_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(buildQwenManifest({ backend: 'custom-voice', model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice', voices: voices(), languages: [], limits: { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 120000 }, qwenTtsVersion: '0.1.1' }).code, QWEN_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(buildQwenManifest({ backend: 'base-clone', model: 'Qwen3-TTS-12Hz-1.7B-Base', voices: [], languages: ['zh-CN'], limits: { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 120000 }, qwenTtsVersion: '0.1.1' }).ok, false)
  assert.equal(buildQwenManifest({ backend: 'nope', model: 'Qwen3-TTS-12Hz-1.7B-Base', voices: voices() }).code, QWEN_ERRORS.UNKNOWN_BACKEND)

  assert.equal(Object.keys(QWEN_AUDITED_MODELS).length, 5)
  assert.equal(QWEN_DEPENDENCIES.length >= 9, true)
  assert.equal(QWEN_DEPENDENCIES.every((item) => item.licenseStatus === 'UNKNOWN'), true)
  const inventory = qwenMetadataInventory()
  assert.equal(inventory.tokenizer.version, null)
  assert.equal(inventory.tokenizer.versionStatus, 'UNKNOWN')
  assert.equal(inventory.dependencies.length, QWEN_DEPENDENCIES.length)
  assert.equal(inventory.pythonPackage.pythonRequires, '>=3.9')
  assert.equal(inventory.unknown.length >= 4, true)
  assert.equal(inventory.loadingBoundary.localFilesOnly, true)
  assert.equal(inventory.loadingBoundary.trustRemoteCode, false)
  assert.deepEqual(inventory.loadingBoundary.offlineEnvironment, ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE'])

  const licence = qwenLicenseView()
  assert.equal(licence.license, 'Apache-2.0')
  assert.equal(licence.privateMaterialCovered, false)
  assert.equal(licence.dependenciesCovered, false)
  assert.equal(licence.tokenizerCovered, false)
})

test('modality guard rejects mixed voice id, clone binding and voice design', () => {
  assert.equal(checkQwenModality({ text: 'x' }, null).ok, false)
  assert.equal(checkQwenModality({ text: 'x', voiceId: 'demo-voice-a' }, null).modality, 'preset')
  assert.equal(checkQwenModality({ text: 'x' }, { kind: 'clone', referenceRef: 'binding:demo-1' }).modality, 'clone')
  assert.equal(checkQwenModality({ text: 'x', voicePrompt: '低沉男声' }, null).modality, 'design')
  assert.equal(checkQwenModality({ text: 'x', voiceId: 'demo-voice-a', voicePrompt: '低沉男声' }, null).code, QWEN_ERRORS.MIXED_MODALITY)
  assert.equal(checkQwenModality({ text: 'x', voiceId: 'demo-voice-a' }, { kind: 'clone', referenceRef: 'binding:demo-1' }).code, QWEN_ERRORS.MIXED_MODALITY)
})

test('worker protocol rejects paths, URLs, secrets, unknown fields, oversized and deeply nested lines', () => {
  const base = { v: 1, id: 'req-1', type: 'synthesize', payload: { requestId: 'r-1', text: '你好', model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'custom-voice', modality: 'preset', voiceId: 'demo-voice-a', language: 'zh-CN', format: { mime: 'audio/wav', sampleRate: 24000, channels: 1 }, maxBytes: 1048576 } }
  assert.equal(encodeRequest(base).ok, true)
  assert.equal(encodeRequest({ ...base, payload: { ...base.payload, url: 'http://x' } }).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(encodeRequest({ ...base, payload: { ...base.payload, voiceId: undefined, modality: 'clone', bindingRef: 'C:\\secret.wav' } }).code, QWEN_PROTOCOL_ERRORS.INVALID_ID)
  assert.equal(encodeRequest({ ...base, payload: { ...base.payload, token: 'x' } }).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(encodeRequest({ ...base, command: 'never-run' }).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(encodeRequest({ ...base, extra: 1 }).ok, false)
  assert.equal(encodeRequest({ ...base, v: 2 }).code, QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION)
  assert.equal(encodeRequest({ ...base, type: 'eval' }).code, QWEN_PROTOCOL_ERRORS.INVALID_TYPE)
  assert.equal(encodeRequest({ ...base, id: '../x' }).code, QWEN_PROTOCOL_ERRORS.INVALID_ID)

  assert.equal(decodeResponse('not json').ok, false)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result' })).ok, false)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result', payload: { path: '/etc/passwd' } })).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result', payload: { unexpected: 1 } })).code, QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD)
  assert.equal(decodeResponse(JSON.stringify({ v: 2, id: 'x', type: 'result', payload: {} })).code, QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result', payload: {}, url: 'https://invalid.example/not-used' })).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result', payload: {}, extra: 1 })).code, QWEN_PROTOCOL_ERRORS.INVALID_INPUT)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'event', payload: { state: 'progress', bytesBase64: 'AAAA' } })).code, QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'event', payload: { state: 'progress' } }), { expect: ['result'] }).code, QWEN_PROTOCOL_ERRORS.INVALID_TYPE)

  let deep = '{"v":1,"id":"deep","type":"result","payload":{"capabilities":'
  for (let index = 0; index < 5000; index += 1) deep += '{"nested":'
  deep += '0' + '}'.repeat(5000) + '}}'
  const deepDecoded = decodeResponse(deep)
  assert.equal(deepDecoded.ok, false)
  assert.equal(deepDecoded.code, QWEN_PROTOCOL_ERRORS.TOO_DEEP)
  const wide = '{"v":1,"id":"wide","type":"result","payload":{"warnings":[' + '0,'.repeat(6000) + '0]}}'
  assert.equal(decodeResponse(wide).code, QWEN_PROTOCOL_ERRORS.TOO_COMPLEX)
})

test('health classification never turns an unverified worker into available', () => {
  assert.equal(classifyQwenHealth({}).state, 'offline')
  assert.equal(classifyQwenHealth({ ready: ready({ provider: 'other-service' }) }).code, QWEN_ERRORS.UNRELATED_SERVICE)
  assert.equal(classifyQwenHealth({ ready: ready({ model: 'OtherTTS-1' }) }).code, QWEN_ERRORS.MODEL_MISMATCH)
  assert.equal(classifyQwenHealth({ ready: ready({ model: 'Qwen3-TTS-NotAudited' }) }).code, QWEN_ERRORS.MODEL_MISMATCH)
  assert.equal(classifyQwenHealth({ ready: ready({ workerProtocol: 99 }) }).code, QWEN_ERRORS.WORKER_PROTOCOL_MISMATCH)
  assert.equal(classifyQwenHealth({ ready: ready({ model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'custom-voice' }) }).code, QWEN_ERRORS.MODEL_BACKEND_MISMATCH)
  assert.equal(classifyQwenHealth({ ready: ready({ qwenTtsVersion: '9.9.9' }) }).code, QWEN_ERRORS.VERSION_MISMATCH)
  assert.equal(classifyQwenHealth({ ready: ready({ instructSupported: undefined }) }).code, QWEN_ERRORS.DISCOVERY_INCOMPLETE)
  const ok = classifyQwenHealth({ ready: ready({ model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' }), health: { state: 'ok', model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' } })
  assert.equal(ok.state, 'ok')
  assert.equal(classifyQwenHealth({ ready: ready(), health: { state: 'ok', model: 'Qwen3-TTS-12Hz-0.6B-Base' } }).code, QWEN_ERRORS.MODEL_MISMATCH)
  assert.equal(classifyQwenHealth({ ready: ready(), expectedModel: 'Qwen3-TTS-12Hz-0.6B-CustomVoice' }).code, QWEN_ERRORS.MODEL_MISMATCH)
})

test('discovery refuses empty declarations instead of inventing models, languages or limits', () => {
  const cloneReady = ready({ backend: 'base-clone', model: 'Qwen3-TTS-12Hz-1.7B-Base' })
  assert.equal(normalizeQwenDiscovery({ ready: ready({ model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' }), discovery: discovery({ models: [] }) }).code, QWEN_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(normalizeQwenDiscovery({ ready: ready({ model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' }), discovery: discovery({ languages: [] }) }).code, QWEN_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(normalizeQwenDiscovery({ ready: ready({ model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' }), discovery: discovery({ languages: ['ja-JP'] }) }).code, QWEN_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(normalizeQwenDiscovery({ ready: ready({ model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' }), discovery: discovery({ limits: undefined }) }).code, QWEN_ERRORS.DISCOVERY_INCOMPLETE)
  const tiny = normalizeQwenDiscovery({ ready: ready({ model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' }), discovery: discovery({ limits: { maxChars: 1, maxAudioSeconds: 20, timeoutMs: 120000 } }) })
  assert.equal(tiny.ok, true)
  assert.equal(tiny.limits.maxChars, 1)
  assert.equal(normalizeQwenDiscovery({ ready: cloneReady, discovery: discovery({ models: [cloneReady.model] }), bindings: [] }).code, QWEN_ERRORS.CLONE_BINDING_REQUIRED)
  const clone = normalizeQwenDiscovery({
    ready: cloneReady,
    discovery: discovery({ models: [cloneReady.model] }),
    bindings: [{ voiceId: 'clone-bound', kind: 'clone', referenceRef: 'binding:demo-1' }],
  })
  assert.equal(clone.ok, true)
  assert.equal(clone.voices[0].kind, 'cloned')
  assert.equal(normalizeQwenDiscovery({
    ready: cloneReady,
    discovery: discovery({ models: [cloneReady.model] }),
    bindings: [{ voiceId: 'clone-bound', kind: 'clone', referenceRef: './private.wav' }],
  }).ok, false)
})

test('supervisor refuses implicit workers and escaped commands', async () => {
  const implicit = createQwenSupervisor({ allowedRoot: fakeRoot })
  assert.equal((await implicit.start()).code, QWEN_ERRORS.WORKER_NOT_CONFIGURED)
  const escaped = createQwenSupervisor({ allowedRoot: fakeRoot, worker: { command: path.join(here, '..', 'package.json'), args: [] } })
  assert.equal((await escaped.start()).code, QWEN_ERRORS.WORKER_NOT_CONFIGURED)
  const noRuntime = createQwenSupervisor({ allowedRoot: fakeRoot, worker: { command: fakeWorker, args: [] } })
  const started = await noRuntime.start()
  assert.equal(started.ok, false)
  await noRuntime.stop()
})

test('an authority-issued Task id flows through the Fake boundary without a second authority', { skip: spawnSkip }, async () => {
  const fixture = await catalogFixture()
  try {
    assert.match(fixture.taskId, /^task:fixture-[0-9a-f]{32}$/)
    await withProvider('ok', { taskAuthority: authorityFrom(fixture.handle, fixture.scopeId) }, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const synthesized = await provider.synthesize(
        { text: '任务关联', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: fixture.taskId },
      )
      assert.equal(synthesized.ok, true, JSON.stringify(synthesized))
      assert.equal(synthesized.taskId, fixture.taskId)
      assert.equal(synthesized.persisted, false)
      assert.equal(synthesized.result.delivery.state, 'PENDING_ROUTER')
      assert.match(synthesized.result.artifactRef, /^qwen-bytes:[a-f0-9]{32}$/)

      const found = await fixture.handle.get({ schemaVersion: 1, scopeId: fixture.scopeId, taskId: fixture.taskId })
      assert.equal(found.ok, true)
      assert.equal(found.value.task.taskId, fixture.taskId)
      const snapshot = JSON.parse(fs.readFileSync(path.join(fixture.sandbox.root, 'audio-task-catalog-v1.json'), 'utf8'))
      assert.equal(snapshot.entries.length, 1)
      assert.equal(snapshot.entries[0].record.taskId, fixture.taskId)

      const unknownTask = await provider.synthesize(
        { text: '未签发', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task:fixture-' + '0'.repeat(32) },
      )
      assert.equal(unknownTask.ok, false)
      assert.equal(unknownTask.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    })
  } finally {
    fixture.dispose()
  }
})

test('fake worker end-to-end produces validated bytes without persisting an artifact', { skip: spawnSkip }, async () => {
  await withProvider('ok', {}, async ({ provider, supervisor }) => {
    const started = await provider.start()
    assert.equal(started.ok, true, JSON.stringify(started))
    const manifest = provider.manifest()
    assert.equal(manifest.id, QWEN_PROVIDER_ID)
    assert.equal(validateProviderManifest(manifest).ok, true)

    const health = await provider.health()
    assert.equal(health.ok, true)
    assert.equal(health.status.state, PROVIDER_STATES.AVAILABLE)
    assert.equal(health.worker.pid > 0, true)

    const synthesized = await provider.synthesize(
      { text: '你好，这是虚构演示。', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-demo-1' },
    )
    assert.equal(synthesized.ok, true, JSON.stringify(synthesized.code || synthesized.qwenCode || synthesized))
    assert.equal(synthesized.taskId, 'task-demo-1')
    assert.equal(synthesized.persisted, false)
    assert.equal(synthesized.result.mime, 'audio/wav')
    assert.equal(synthesized.result.sampleRate, QWEN_LIMITS.sampleRate)
    assert.equal(synthesized.result.channels, 1)
    assert.equal(synthesized.result.delivery.state, 'PENDING_ROUTER')
    assert.match(synthesized.result.artifactRef, /^qwen-bytes:[a-f0-9]{32}$/)
    assert.equal(synthesized.bytes instanceof Uint8Array, true)
    assert.equal(synthesized.bytes.byteLength > 44, true)
    assert.match(synthesized.inspection.sha256, /^[a-f0-9]{64}$/)
    assert.equal(synthesized.result.durationMs, synthesized.inspection.durationMs)
    assert.deepEqual(synthesized.result.warnings, ['NOT_PERSISTED'])

    const beforeStop = supervisor.state()
    assert.equal(beforeStop.tempDirActive, true)
    await provider.shutdown()
    const afterStop = supervisor.state()
    assert.equal(afterStop.state, 'stopped')
    assert.equal(afterStop.tempDirActive, false)
    assert.equal(afterStop.pid, null)
  })
})

test('the public request gate is applied to the caller request instead of being rebuilt away', { skip: spawnSkip }, async () => {
  await withProvider('ok', {}, async ({ provider }) => {
    await provider.start()
    const base = { text: '门禁', voiceId: 'demo-voice-a', language: 'zh-CN' }
    const mpeg = await provider.synthesize({ ...base, format: 'audio/mpeg' }, { taskId: 'task-gate' })
    assert.equal(mpeg.ok, false)
    assert.equal(mpeg.code, PROVIDER_ERRORS.UNSUPPORTED_FORMAT)
    const streaming = await provider.synthesize({ ...base, streaming: true }, { taskId: 'task-gate' })
    assert.equal(streaming.ok, false)
    assert.equal(streaming.code, PROVIDER_ERRORS.UNSUPPORTED_STREAMING)
    const extra = await provider.synthesize({ ...base, url: 'https://invalid.example/not-used' }, { taskId: 'task-gate' })
    assert.equal(extra.ok, false)
    assert.equal(extra.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    const unexpected = await provider.synthesize({ ...base, unexpected: 'not allowed' }, { taskId: 'task-gate' })
    assert.equal(unexpected.ok, false)
    const callerId = await provider.synthesize({ ...base, requestId: 'caller-original-id' }, { taskId: 'task-gate' })
    assert.equal(callerId.ok, true, JSON.stringify(callerId.code || callerId.qwenCode))
    assert.notEqual(callerId.requestId, 'caller-original-id')
  })
})

test('worker output is rejected when bytes, format or size are wrong', { skip: spawnSkip }, async () => {
  for (const [mode, expected] of [['bad-bytes', PROVIDER_ERRORS.INVALID_RESPONSE], ['bad-format', PROVIDER_ERRORS.UNSUPPORTED_FORMAT], ['oversized', PROVIDER_ERRORS.INVALID_RESPONSE]]) {
    await withProvider(mode, {}, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, mode)
      const synthesized = await provider.synthesize(
        { text: '格式校验', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task-output' },
      )
      assert.equal(synthesized.ok, false, mode)
      assert.equal(synthesized.code, expected, mode)
    })
  }
  await withProvider('ok', {}, async ({ provider }) => {
    await provider.start()
    const remoteVoice = await provider.synthesize({ text: 'x', voiceId: 'not-a-voice', language: 'zh-CN' }, { taskId: 'task-voice' })
    assert.equal(remoteVoice.ok, false)
    assert.equal(remoteVoice.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
    const badLanguage = await provider.synthesize({ text: 'x', voiceId: 'demo-voice-a', language: 'ja-JP' }, { taskId: 'task-lang' })
    assert.equal(badLanguage.ok, false)
    assert.equal(badLanguage.code, PROVIDER_ERRORS.UNSUPPORTED_LANGUAGE)
    const tooLong = await provider.synthesize({ text: 'x'.repeat(QWEN_LIMITS.maxChars + 1), voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-long' })
    assert.equal(tooLong.ok, false)
    assert.equal(tooLong.code, PROVIDER_ERRORS.INVALID_RESPONSE)
  })
})

test('worker limits are honoured as a cap instead of being raised to the batch default', { skip: spawnSkip }, async () => {
  await withProvider('tiny-limit', {}, async ({ provider }) => {
    const started = await provider.start()
    assert.equal(started.ok, true, JSON.stringify(started))
    assert.equal(provider.capabilities().limits.maxChars, 1)
    const tooLong = await provider.synthesize({ text: 'ab', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-tiny' })
    assert.equal(tooLong.ok, false)
    assert.equal(tooLong.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    const short = await provider.synthesize({ text: 'a', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-tiny' })
    assert.equal(short.ok, true, JSON.stringify(short.code || short.qwenCode))
  })
})

test('worker errors, crashes and unavailable declarations map to honest provider errors', { skip: spawnSkip }, async () => {
  await withProvider('error', {}, async ({ provider }) => {
    await provider.start()
    const synthesized = await provider.synthesize({ text: '失败', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-error' })
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
  })
  await withProvider('crash', {}, async ({ provider, supervisor }) => {
    await provider.start()
    const synthesized = await provider.synthesize({ text: '崩溃', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-crash' })
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
    const state = supervisor.state()
    assert.equal(state.state, 'exited')
    assert.equal(state.pid, null)
    assert.equal(state.exit.code, 7)
  })
  for (const [mode, expected] of [
    ['unrelated', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['version-mismatch', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['health-degraded', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['no-voices', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['voice-design', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['invented-model', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['wrong-provider', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['wrong-protocol', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['base-model-custom-backend', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['empty-models', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['empty-languages', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['no-limits', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
  ]) {
    await withProvider(mode, {}, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, false, mode)
      assert.equal(started.code, expected, mode)
      const synthesized = await provider.synthesize({ text: 'x', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-blocked' })
      assert.equal(synthesized.ok, false, mode)
      assert.equal(synthesized.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE, mode)
    })
  }
})

test('clone modality binds the actual registered voice and refuses unregistered bindings', { skip: spawnSkip }, async () => {
  const bindings = [{ voiceId: 'registered-clone', name: '绑定音色', kind: 'clone', referenceRef: 'binding:registered' }]
  const resolver = (binding) => (binding && binding.voiceId === 'registered-clone' ? { referenceRef: 'binding:registered' } : null)
  await withProvider('ok', { args: ['--backend=base-clone'], bindings, bindingResolver: resolver }, async ({ provider }) => {
    const started = await provider.start()
    assert.equal(started.ok, true, JSON.stringify(started))
    const manifest = provider.manifest()
    assert.equal(manifest.capabilities.voices[0].kind, 'cloned')
    assert.equal(manifest.capabilities.emotion.supported, false)
    const synthesized = await provider.synthesize(
      { text: '克隆音色演示', language: 'zh-CN' },
      { taskId: 'task-clone', binding: { kind: 'clone', voiceId: 'registered-clone' } },
    )
    assert.equal(synthesized.ok, true, JSON.stringify(synthesized.code || synthesized.qwenCode))
    assert.equal(synthesized.result.voiceId, 'registered-clone')

    const presetBypass = await provider.synthesize(
      { text: '预设绕过', voiceId: 'registered-clone', language: 'zh-CN' },
      { taskId: 'task-clone' },
    )
    assert.equal(presetBypass.ok, false)
    assert.equal(presetBypass.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)

    const unregistered = await provider.synthesize(
      { text: '未登记', language: 'zh-CN' },
      { taskId: 'task-clone', binding: { kind: 'clone', voiceId: 'not-declared' } },
    )
    assert.equal(unregistered.ok, false)
    assert.equal(unregistered.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
  })

  await withProvider('ok', { args: ['--backend=base-clone'], bindings, bindingResolver: null }, async ({ provider }) => {
    const started = await provider.start()
    assert.equal(started.ok, true)
    const refused = await provider.synthesize(
      { text: '克隆音色演示', language: 'zh-CN' },
      { taskId: 'task-clone', binding: { kind: 'clone', voiceId: 'registered-clone' } },
    )
    assert.equal(refused.ok, false)
    assert.equal(refused.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
  })

  const mismatched = (binding) => (binding ? { referenceRef: 'binding:other' } : null)
  await withProvider('ok', { args: ['--backend=base-clone'], bindings, bindingResolver: mismatched }, async ({ provider }) => {
    await provider.start()
    const refused = await provider.synthesize(
      { text: '身份不一致', language: 'zh-CN' },
      { taskId: 'task-clone', binding: { kind: 'clone', voiceId: 'registered-clone' } },
    )
    assert.equal(refused.ok, false)
    assert.equal(refused.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
  })

  await withProvider('ok', {}, async ({ provider }) => {
    await provider.start()
    const cloneOnCustom = await provider.synthesize(
      { text: '预设后端克隆', language: 'zh-CN' },
      { taskId: 'task-clone-custom', binding: { kind: 'clone', voiceId: 'clone-bound' } },
    )
    assert.equal(cloneOnCustom.ok, false)
    assert.equal(cloneOnCustom.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
  })
})

test('output identity is checked before handoff, not relabelled with the current request', { skip: spawnSkip }, async () => {
  for (const corrupt of ['requestId', 'model', 'backend', 'voiceId', 'requestId,model,backend,voiceId']) {
    await withProvider('ok', { args: [`--corrupt=${corrupt}`] }, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, corrupt)
      const synthesized = await provider.synthesize(
        { text: '身份校验', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task-identity' },
      )
      assert.equal(synthesized.ok, false, corrupt)
      assert.equal(synthesized.code, PROVIDER_ERRORS.INVALID_RESPONSE, corrupt)
      assert.equal(synthesized.qwenCode, QWEN_ERRORS.RESPONSE_IDENTITY_MISMATCH, corrupt)
    })
  }
  await withProvider('ok', {}, async ({ provider }) => {
    await provider.start()
    const control = await provider.synthesize({ text: '身份对照', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-identity' })
    assert.equal(control.ok, true)
  })
})

test('explicit unknown and cancelled worker terminals keep their semantics', { skip: spawnSkip }, async () => {
  await withProvider('unknown-error', {}, async ({ provider }) => {
    await provider.start()
    const result = await provider.synthesize({ text: '未知错误', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-unknown' })
    assert.equal(result.ok, false)
    assert.equal(result.unknown, true)
    assert.equal(result.terminal, 'UNKNOWN')
    assert.equal(result.qwenCode, QWEN_ERRORS.UNKNOWN_RESULT)
    assert.equal(result.code, PROVIDER_ERRORS.PROVIDER_ERROR)
  })
  await withProvider('unknown-state', {}, async ({ provider }) => {
    await provider.start()
    const result = await provider.synthesize({ text: '未知状态', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-unknown' })
    assert.equal(result.ok, false)
    assert.equal(result.unknown, true)
    assert.equal(result.terminal, 'UNKNOWN')
  })
  await withProvider('cancelled', {}, async ({ provider }) => {
    await provider.start()
    const result = await provider.synthesize({ text: '已取消', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-cancelled' })
    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
    assert.equal(result.unknown, false)
    assert.equal(result.terminal, 'CANCELLED')
    assert.equal(result.code, PROVIDER_ERRORS.CANCELLED)
  })
  await withProvider('event-result', {}, async ({ provider }) => {
    await provider.start()
    const result = await provider.synthesize({ text: '错误类型', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-event' })
    assert.equal(result.ok, false)
    assert.equal(result.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    assert.equal(result.qwenCode, QWEN_ERRORS.RESPONSE_TYPE_MISMATCH)
  })
})

test('timeout cancels, reports UNKNOWN, never retries and blocks overlapping work', { skip: spawnSkip }, async () => {
  await withProvider('hang', { requestTimeoutMs: 300 }, async ({ provider, supervisor }) => {
    await provider.start()
    const startedAt = Date.now()
    const synthesized = await provider.synthesize({ text: '超时', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-timeout' })
    const elapsed = Date.now() - startedAt
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.code, PROVIDER_ERRORS.TIMEOUT)
    assert.equal(synthesized.unknown, true)
    assert.equal(synthesized.terminal, 'UNKNOWN')
    assert.equal(synthesized.cancellation && synthesized.cancellation.ok, true)
    assert.equal(['cancelled', 'UNKNOWN'].includes(synthesized.cancellation.state), true)
    assert.equal(elapsed < 4000, true)
    assert.equal(supervisor.state().pendingRequests, 0)
    assert.equal(supervisor.state().unresolvedOperations > 0, true)

    const overlapping = await provider.synthesize({ text: '重入', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-timeout' })
    assert.equal(overlapping.ok, false)
    assert.equal(overlapping.blockedByUnresolved, true)
    /* The refused request itself never started; the unknown belongs to the blocked prior operation. */
    assert.equal(overlapping.unknown, false)
  })
})

test('a late worker answer after timeout is ignored, not retried or promoted', { skip: spawnSkip }, async () => {
  await withProvider('late', { requestTimeoutMs: 300 }, async ({ provider, supervisor }) => {
    const started = await provider.start()
    assert.equal(started.ok, true)
    const synthesized = await provider.synthesize({ text: '迟到', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-late' })
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.code, PROVIDER_ERRORS.TIMEOUT)
    await waitFor(() => supervisor.state().lateResponses >= 1, 4000)
    assert.equal(supervisor.state().pendingRequests, 0)
    assert.equal(supervisor.state().unresolvedOperations, 0)
    const afterLate = await provider.synthesize({ text: '迟到后', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-late' })
    assert.notEqual(afterLate.blockedByUnresolved, true)
    assert.equal(supervisor.state().unresolvedOperations >= 0, true)
  })
})

test('explicit cancel settles the operation and a late success is discarded', { skip: spawnSkip }, async () => {
  await withProvider('cancel-ack', { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
    await provider.start()
    const begun = await provider.beginSynthesis({ text: '取消', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-cancel' })
    assert.equal(begun.ok, true)
    assert.equal(typeof begun.requestId, 'string')
    await waitFor(() => supervisor.state().activeOperations === 1, 3000)
    const ack = await begun.cancel()
    assert.equal(ack.ok, true)
    assert.equal(ack.state, 'cancelled')
    const result = await begun.result
    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
    assert.equal(result.code, PROVIDER_ERRORS.CANCELLED)
    assert.equal(supervisor.state().unresolvedOperations, 1)
    await waitFor(() => supervisor.state().lateResponses >= 1, 4000)
    assert.equal(supervisor.state().unresolvedOperations, 0)
  })
})

test('request timeouts are finite: invalid configuration fails closed and omitted timeouts use the default', { skip: spawnSkip }, async () => {
  const supervisor = makeSupervisor('ok')
  const zero = createQwenProvider({ supervisor, requestTimeoutMs: 0 })
  assert.equal(zero.ok, false)
  assert.equal(zero.code, QWEN_ERRORS.INVALID_INPUT)
  const negative = createQwenProvider({ supervisor, requestTimeoutMs: -5 })
  assert.equal(negative.ok, false)
  assert.equal(negative.code, QWEN_ERRORS.INVALID_INPUT)
  const tooLarge = createQwenProvider({ supervisor, requestTimeoutMs: QWEN_LIMITS.maxRequestTimeoutMs + 1 })
  assert.equal(tooLarge.ok, false)
  const provider = createQwenProvider({ supervisor, requestTimeoutMs: 5000 })
  assert.equal(provider.ok, true)
  try {
    const started = await provider.start()
    assert.equal(started.ok, true)
    const health = await supervisor.health()
    assert.equal(health.ok, true)
    assert.equal(supervisor.state().lastRequestTimeoutMs, QWEN_LIMITS.timeoutMs)
  } finally {
    await provider.shutdown()
  }
})

test('bounded protocol isolates a hostile worker instead of crashing the Core host', { skip: spawnSkip }, async () => {
  await withProvider('deep', { requestTimeoutMs: 3000 }, async ({ provider, supervisor }) => {
    const started = await provider.start()
    assert.equal(started.ok, true)
    const synthesized = await provider.synthesize({ text: '深嵌套', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-deep' })
    assert.equal(synthesized.ok, false)
    assert.equal(supervisor.state().protocolErrors >= 1, true)
  })
})

test('an unconfirmed worker exit is a failure, not a green stop', { skip: spawnSkip }, async () => {
  const capture = captureSpawn()
  const supervisor = createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: stubbornWorker, runtime: process.execPath, args: [] },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 100,
    killWaitMs: 200,
    spawnProcess: capture.spawnProcess,
  })
  const started = await supervisor.start()
  assert.equal(started.ok, true, JSON.stringify(started))
  const child = capture.child()
  child.kill = () => false
  const stopped = await supervisor.stop()
  assert.equal(stopped.ok, false)
  assert.equal(stopped.code, QWEN_ERRORS.EXIT_UNCONFIRMED)
  assert.equal(typeof stopped.pid, 'number')
  assert.equal(supervisor.state().tempDirActive, true)
  assert.doesNotThrow(() => process.kill(stopped.pid, 0))
  process.kill(stopped.pid, 'SIGKILL')
  await waitFor(() => supervisor.state().alive === false, 5000)
  const retried = await supervisor.stop()
  assert.equal(retried.ok, true, JSON.stringify(retried))
  assert.equal(supervisor.state().tempDirActive, false)
})

test('an error event is not an exit and old-generation events cannot touch a new generation', { skip: spawnSkip }, async () => {
  const capture = captureSpawn()
  const supervisor = createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: stubbornWorker, runtime: process.execPath, args: [] },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 100,
    killWaitMs: 200,
    spawnProcess: capture.spawnProcess,
  })
  const first = await supervisor.start()
  assert.equal(first.ok, true)
  const child1 = capture.child()
  child1.emit('error', new Error('simulated EPERM kill failure'))
  assert.equal(supervisor.state().alive, true)
  assert.equal(supervisor.state().error.message.includes('simulated EPERM'), true)
  const second = await supervisor.start()
  assert.equal(second.ok, false)
  assert.equal(second.code, QWEN_ERRORS.PROVIDER_NOT_READY)
  process.kill(supervisor.state().pid, 'SIGKILL')
  await waitFor(() => supervisor.state().alive === false, 5000)
  const third = await supervisor.start()
  assert.equal(third.ok, true, JSON.stringify(third))
  const newPid = supervisor.state().pid
  assert.equal(typeof newPid, 'number')
  child1.stdout.emit('data', Buffer.from(JSON.stringify({
    v: 1,
    id: 'stale-1',
    type: 'result',
    payload: {
      state: 'ok',
      requestId: 'stale-request',
      model: 'Qwen3-TTS-12Hz-1.7B-Base',
      backend: 'custom-voice',
      voiceId: 'demo-voice-a',
      mime: 'audio/wav',
      sampleRate: 24000,
      channels: 1,
      durationMs: 1,
      bytesBase64: 'AAAA',
    },
  }) + '\n'))
  child1.emit('error', new Error('stale generation error'))
  assert.equal(supervisor.state().alive, true)
  assert.equal(supervisor.state().pid, newPid)
  const health = await supervisor.health({ timeoutMs: 2000 })
  assert.equal(health.ok, true)
  await supervisor.stop()
})

test('shutdown closes admission before the worker is gone', { skip: spawnSkip }, async () => {
  const supervisor = makeSupervisor('ok')
  const provider = createQwenProvider({ supervisor, requestTimeoutMs: 5000 })
  await provider.start()
  const stopping = supervisor.stop()
  const rejected = await supervisor.synthesize({
    requestId: 'r-during-stop',
    text: '关闭中',
    model: 'Qwen3-TTS-12Hz-1.7B-Base',
    backend: 'custom-voice',
    modality: 'preset',
    voiceId: 'demo-voice-a',
    language: 'zh-CN',
    emotion: 'neutral',
    format: { mime: 'audio/wav', sampleRate: 24000, channels: 1 },
    maxBytes: 1048576,
  }, { timeoutMs: 3000 })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.code, QWEN_ERRORS.STOPPING)
  await stopping
})

test('failed temp cleanup keeps ownership and stays retryable', { skip: spawnSkip }, async () => {
  let deny = false
  const supervisor = createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
    rmTree: (dir) => {
      if (deny) {
        const error = new Error('simulated EACCES cleanup denial')
        error.code = 'EACCES'
        throw error
      }
      fs.rmSync(dir, { recursive: true, force: true })
    },
  })
  const started = await supervisor.start()
  assert.equal(started.ok, true)
  deny = true
  const stopped = await supervisor.stop()
  assert.equal(stopped.ok, false)
  assert.equal(stopped.code, QWEN_ERRORS.CLEANUP_INCOMPLETE)
  assert.equal(supervisor.state().tempDirActive, true)
  assert.equal(supervisor.state().retainedTempDirs, 1)
  deny = false
  const retried = await supervisor.stop()
  assert.equal(retried.ok, true, JSON.stringify(retried))
  assert.equal(supervisor.state().tempDirActive, false)
  assert.equal(supervisor.state().retainedTempDirs, 0)
})

test('validateQwenOutput does not accept an unassociated audio payload', () => {
  const decoded = validateQwenOutput({
    payload: {
      state: 'ok',
      requestId: 'other-request',
      model: 'Qwen3-TTS-12Hz-1.7B-Base',
      backend: 'custom-voice',
      voiceId: 'demo-voice-a',
      mime: 'audio/wav',
      sampleRate: 24000,
      channels: 1,
      durationMs: 100,
      bytesBase64: Buffer.alloc(44, 0).toString('base64'),
    },
    requestId: 'request-1',
    voiceId: 'demo-voice-a',
    model: 'Qwen3-TTS-12Hz-1.7B-Base',
    backend: 'custom-voice',
    language: 'zh-CN',
    emotion: 'neutral',
  })
  assert.equal(decoded.ok, false)
  assert.equal(decoded.code, QWEN_ERRORS.OUTPUT_IDENTITY_MISMATCH)
  assert.equal(decoded.field, 'requestId')
})
