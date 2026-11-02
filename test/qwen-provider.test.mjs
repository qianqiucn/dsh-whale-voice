/* Plan10 10-A — Qwen3-TTS provider contract, worker protocol, supervisor and Fake end-to-end. */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateProviderManifest, PROVIDER_ERRORS, PROVIDER_STATES } from '../core/tts/provider-contract.mjs'
import {
  QWEN_ERRORS,
  QWEN_LIMITS,
  QWEN_PROVIDER_ID,
  buildQwenManifest,
  checkQwenModality,
  qwenCapabilityMatrix,
  qwenLicenseView,
} from '../core/tts/qwen-contract.mjs'
import { encodeRequest, decodeResponse, QWEN_PROTOCOL_ERRORS } from '../core/tts/qwen-worker-protocol.mjs'
import { createQwenSupervisor } from '../core/tts/qwen-supervisor.mjs'
import { classifyQwenHealth, createQwenProvider, normalizeQwenDiscovery } from '../core/tts/qwen-adapter.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeWorker = path.join(here, '..', 'test-fixtures', 'fake-qwen-worker.mjs')
const fakeRoot = path.dirname(fakeWorker)

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

function makeSupervisor(mode, extra = {}) {
  const args = [`--mode=${mode}`, ...(extra.args || [])]
  return createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    ...(extra.supervisor || {}),
  })
}

async function withProvider(mode, options = {}, fn) {
  const supervisor = makeSupervisor(mode, options)
  const provider = createQwenProvider({
    supervisor,
    requestTimeoutMs: options.requestTimeoutMs || 5000,
    bindingResolver: options.bindingResolver,
    bindings: options.bindings,
  })
  try {
    return await fn({ provider, supervisor })
  } finally {
    await provider.shutdown().catch(() => null)
  }
}

test('qwen capability matrix keeps preset voice, clone and voice design separate', () => {
  const matrix = qwenCapabilityMatrix()
  assert.equal(matrix.length, 3)
  const custom = matrix.find((item) => item.backend === 'custom-voice')
  const clone = matrix.find((item) => item.backend === 'base-clone')
  const design = matrix.find((item) => item.backend === 'voice-design')
  assert.equal(custom.presetVoices, true)
  assert.equal(custom.clone, false)
  assert.equal(custom.emotion, true)
  assert.equal(clone.clone, true)
  assert.equal(clone.requiresReferenceAudio, true)
  assert.equal(clone.presetVoices, false)
  assert.equal(design.voiceDesign, true)
  assert.equal(design.publicRequest, false)

  const built = buildQwenManifest({ backend: 'custom-voice', voices: voices(), languages: ['zh-CN'], qwenTtsVersion: '0.1.1' })
  assert.equal(built.ok, true)
  const validated = validateProviderManifest(built.manifest)
  assert.equal(validated.ok, true, JSON.stringify(validated.errors))
  assert.equal(built.manifest.id, QWEN_PROVIDER_ID)
  assert.equal(built.manifest.network.required, false)
  assert.equal(built.manifest.privacy.textLeavesDevice, false)
  assert.equal(built.manifest.version.audited, true)
  assert.equal(buildQwenManifest({ backend: 'base-clone', voices: [] }).ok, false)
  assert.equal(buildQwenManifest({ backend: 'nope', voices: voices() }).code, QWEN_ERRORS.UNKNOWN_BACKEND)

  const licence = qwenLicenseView()
  assert.equal(licence.license, 'Apache-2.0')
  assert.equal(licence.privateMaterialCovered, false)
  assert.equal(licence.dependenciesCovered, false)
})

test('modality guard rejects mixed voice id, clone binding and voice design', () => {
  assert.equal(checkQwenModality({ text: 'x' }, null).ok, false)
  assert.equal(checkQwenModality({ text: 'x', voiceId: 'demo-voice-a' }, null).modality, 'preset')
  assert.equal(checkQwenModality({ text: 'x' }, { kind: 'clone', referenceRef: 'binding:demo-1' }).modality, 'clone')
  assert.equal(checkQwenModality({ text: 'x', voicePrompt: '低沉男声' }, null).modality, 'design')
  assert.equal(checkQwenModality({ text: 'x', voiceId: 'demo-voice-a', voicePrompt: '低沉男声' }, null).code, QWEN_ERRORS.MIXED_MODALITY)
  assert.equal(checkQwenModality({ text: 'x', voiceId: 'demo-voice-a' }, { kind: 'clone', referenceRef: 'binding:demo-1' }).code, QWEN_ERRORS.MIXED_MODALITY)
})

test('worker protocol rejects paths, URLs, secrets, unknown fields and oversized lines', () => {
  const base = { v: 1, id: 'req-1', type: 'synthesize', payload: { requestId: 'r-1', text: '你好', model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'custom-voice', modality: 'preset', voiceId: 'demo-voice-a', language: 'zh-CN', format: { mime: 'audio/wav', sampleRate: 24000, channels: 1 }, maxBytes: 1048576 } }
  assert.equal(encodeRequest(base).ok, true)
  assert.equal(encodeRequest({ ...base, payload: { ...base.payload, url: 'http://x' } }).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(encodeRequest({ ...base, payload: { ...base.payload, voiceId: undefined, modality: 'clone', bindingRef: 'C:\\secret.wav' } }).code, QWEN_PROTOCOL_ERRORS.INVALID_ID)
  assert.equal(encodeRequest({ ...base, payload: { ...base.payload, token: 'x' } }).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(encodeRequest({ ...base, v: 2 }).code, QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION)
  assert.equal(encodeRequest({ ...base, type: 'eval' }).code, QWEN_PROTOCOL_ERRORS.INVALID_TYPE)
  assert.equal(encodeRequest({ ...base, id: '../x' }).code, QWEN_PROTOCOL_ERRORS.INVALID_ID)

  assert.equal(decodeResponse('not json').ok, false)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result' })).ok, false)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result', payload: { path: '/etc/passwd' } })).code, QWEN_PROTOCOL_ERRORS.FORBIDDEN_FIELD)
  assert.equal(decodeResponse(JSON.stringify({ v: 1, id: 'x', type: 'result', payload: { unexpected: 1 } })).code, QWEN_PROTOCOL_ERRORS.INVALID_PAYLOAD)
  assert.equal(decodeResponse(JSON.stringify({ v: 2, id: 'x', type: 'result', payload: {} })).code, QWEN_PROTOCOL_ERRORS.UNSUPPORTED_VERSION)
})

test('health classification never turns an unverified worker into available', () => {
  assert.equal(classifyQwenHealth({}).state, 'offline')
  assert.equal(classifyQwenHealth({ ready: { provider: 'other', model: 'OtherTTS-1' } }).code, QWEN_ERRORS.UNRELATED_SERVICE)
  assert.equal(classifyQwenHealth({ ready: { provider: 'qwen-tts', model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'custom-voice', qwenTtsVersion: '9.9.9' } }).code, QWEN_ERRORS.VERSION_MISMATCH)
  assert.equal(classifyQwenHealth({ ready: { provider: 'qwen-tts', model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'unknown', qwenTtsVersion: '0.1.1' } }).code, QWEN_ERRORS.UNKNOWN_BACKEND)
  const ok = classifyQwenHealth({
    ready: { provider: 'qwen-tts', model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'custom-voice', qwenTtsVersion: '0.1.1' },
    health: { state: 'ok', model: 'Qwen3-TTS-12Hz-1.7B-Base' },
  })
  assert.equal(ok.state, 'ok')
  assert.equal(classifyQwenHealth({
    ready: { provider: 'qwen-tts', model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'custom-voice', qwenTtsVersion: '0.1.1' },
    health: { state: 'ok', model: 'Qwen3-TTS-12Hz-0.6B' },
  }).code, QWEN_ERRORS.MODEL_MISMATCH)
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
    const tooLong = await provider.synthesize({ text: 'x'.repeat(QWEN_LIMITS.maxChars + 1), voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-long' })
    assert.equal(tooLong.ok, false)
  })
})

test('worker errors and crashes map to honest provider errors', { skip: spawnSkip }, async () => {
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
})

test('timeout cancels, reports UNKNOWN and never retries', { skip: spawnSkip }, async () => {
  await withProvider('hang', { requestTimeoutMs: 300 }, async ({ provider, supervisor }) => {
    await provider.start()
    const startedAt = Date.now()
    const synthesized = await provider.synthesize({ text: '超时', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-timeout' })
    const elapsed = Date.now() - startedAt
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.code, PROVIDER_ERRORS.TIMEOUT)
    assert.equal(synthesized.unknown, true)
    assert.equal(synthesized.cancellation && synthesized.cancellation.ok, true)
    assert.equal(['cancelled', 'UNKNOWN'].includes(synthesized.cancellation.state), true)
    assert.equal(elapsed < 4000, true)
    assert.equal(supervisor.state().pendingRequests, 0)
  })
})

test('a late worker answer after timeout is ignored, not retried', { skip: spawnSkip }, async () => {
  await withProvider('late', { requestTimeoutMs: 300 }, async ({ provider, supervisor }) => {
    const started = await provider.start()
    assert.equal(started.ok, true)
    const synthesized = await provider.synthesize({ text: '迟到', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-late' })
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.code, PROVIDER_ERRORS.TIMEOUT)
    await new Promise((resolve) => setTimeout(resolve, 1800))
    assert.equal(supervisor.state().lateResponses >= 1, true)
    assert.equal(supervisor.state().pendingRequests, 0)
  })
})

test('unverified or unrelated workers cannot be started as available', { skip: spawnSkip }, async () => {
  for (const [mode, expected] of [
    ['unrelated', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['version-mismatch', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['health-degraded', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['no-voices', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
    ['voice-design', PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE],
  ]) {
    await withProvider(mode, {}, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, false, mode)
      assert.equal(started.code, expected, mode)
      const synthesized = await provider.synthesize({ text: 'x', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-blocked' })
      assert.equal(synthesized.ok, false)
      assert.equal(synthesized.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
    })
  }
})

test('clone modality needs a trusted binding token and never accepts a path', { skip: spawnSkip }, async () => {
  const bindings = [{ voiceId: 'clone-bound', name: '绑定音色', kind: 'clone', referenceRef: 'binding:demo-1' }]
  const resolver = (binding) => (binding && binding.kind === 'clone' ? { referenceRef: 'binding:demo-1' } : null)
  await withProvider('ok', { args: ['--backend=base-clone'], bindings, bindingResolver: resolver }, async ({ provider }) => {
    const started = await provider.start()
    assert.equal(started.ok, true, JSON.stringify(started))
    const manifest = provider.manifest()
    assert.equal(manifest.capabilities.voices[0].kind, 'cloned')
    const synthesized = await provider.synthesize(
      { text: '克隆音色演示', language: 'zh-CN' },
      { taskId: 'task-clone', binding: { kind: 'clone', voiceId: 'clone-bound' } },
    )
    assert.equal(synthesized.ok, true, JSON.stringify(synthesized.code || synthesized.qwenCode || synthesized))
  })
  await withProvider('ok', { args: ['--backend=base-clone'], bindings, bindingResolver: null }, async ({ provider }) => {
    const started = await provider.start()
    assert.equal(started.ok, true)
    const refused = await provider.synthesize(
      { text: '克隆音色演示', language: 'zh-CN' },
      { taskId: 'task-clone', binding: { kind: 'clone', voiceId: 'clone-bound' } },
    )
    assert.equal(refused.ok, false)
    assert.equal(refused.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
  })
})

test('provider requires an authority-issued task id and never creates a task', { skip: spawnSkip }, async () => {
  await withProvider('ok', {}, async ({ provider }) => {
    await provider.start()
    const missing = await provider.synthesize({ text: '无任务', voiceId: 'demo-voice-a', language: 'zh-CN' }, {})
    assert.equal(missing.ok, false)
    assert.equal(missing.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    const bad = await provider.synthesize({ text: '无任务', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: '../task' })
    assert.equal(bad.ok, false)
    const ok = await provider.synthesize({ text: '任务关联', voiceId: 'demo-voice-a', language: 'zh-CN' }, { taskId: 'task-authority-9' })
    assert.equal(ok.ok, true)
    assert.equal(ok.taskId, 'task-authority-9')
    assert.equal(ok.result.artifactRef.startsWith('qwen-bytes:'), true)
    assert.equal(ok.persisted, false)
  })
})

test('discovery keeps preset and clone voices apart', () => {
  const readyCustom = { backend: 'custom-voice', model: 'Qwen3-TTS-12Hz-1.7B-Base', qwenTtsVersion: '0.1.1' }
  const custom = normalizeQwenDiscovery({ ready: readyCustom, discovery: { voices: voices(), languages: ['zh-CN'], models: ['Qwen3-TTS-12Hz-1.7B-Base'] } })
  assert.equal(custom.ok, true)
  assert.equal(custom.voices.every((voice) => voice.kind === 'preset'), true)
  const readyClone = { backend: 'base-clone', model: 'Qwen3-TTS-12Hz-1.7B-Base', qwenTtsVersion: '0.1.1' }
  assert.equal(normalizeQwenDiscovery({ ready: readyClone, discovery: { voices: voices() }, bindings: [] }).code, QWEN_ERRORS.CLONE_BINDING_REQUIRED)
  const clone = normalizeQwenDiscovery({ ready: readyClone, discovery: {}, bindings: [{ voiceId: 'clone-bound', kind: 'clone', referenceRef: 'binding:demo-1' }] })
  assert.equal(clone.ok, true)
  assert.equal(clone.voices[0].kind, 'cloned')
  assert.equal(normalizeQwenDiscovery({ ready: readyClone, discovery: {}, bindings: [{ voiceId: 'clone-bound', kind: 'clone', referenceRef: './private.wav' }] }).ok, false)
})
