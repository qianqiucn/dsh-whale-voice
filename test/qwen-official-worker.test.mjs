/* Plan10 10-A — official Qwen3-TTS worker (Python) integration with the same supervisor/protocol.
 *
 * The audited `qwen-tts` package is not installed and no model weights exist. Tests inject a local
 * Fake package through the worker's explicit `--runtime-dir` test hook, which records every official
 * call. This proves: no model load on import/health/discovery, the documented official mapping, the
 * local-only resource restrictions and honest failure when the package/model is missing or
 * contradictory. It does not claim real inference, GPU use or audio quality.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createQwenSupervisor } from '../core/tts/qwen-supervisor.mjs'
import { createQwenProvider } from '../core/tts/qwen-adapter.mjs'
import { PROVIDER_ERRORS } from '../core/tts/provider-contract.mjs'
import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '..')
const fakeSdkSource = path.join(repoRoot, 'test-fixtures', 'fake-qwen-sdk')
const workerScript = 'workers/qwen3_tts_worker.py'

function findPython() {
  for (const candidate of ['python', 'python3', 'py']) {
    try {
      const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', timeout: 10000 })
      if (!probe.error && probe.status === 0) {
        const executable = String(probe.stdout || '').trim()
        if (executable && fs.existsSync(executable)) return executable
      }
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

const PYTHON = findPython()
const pythonSkip = PYTHON ? false : 'python 3 is not available on this platform'

function configFor(type, size, options = {}) {
  return {
    tts_model_type: type,
    tts_model_size: size,
    tokenizer_type: 'qwen3-tts-tokenizer-12hz',
    talker_config: {
      spk_id: options.speakers || null,
      codec_language_id: { chinese: 1, english: 2 },
    },
  }
}

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-qwen-official-'))
  const runtime = path.join(root, 'runtime')
  fs.cpSync(fakeSdkSource, runtime, { recursive: true })
  const customModel = path.join(root, 'models', 'custom')
  fs.mkdirSync(customModel, { recursive: true })
  fs.writeFileSync(path.join(customModel, 'config.json'), JSON.stringify(configFor('custom_voice', '1b7', { speakers: { Vivian: 1, Ryan: 2 } })))
  const baseModel = path.join(root, 'models', 'base')
  fs.mkdirSync(baseModel, { recursive: true })
  fs.writeFileSync(path.join(baseModel, 'config.json'), JSON.stringify(configFor('base', '1b7')))
  const refs = path.join(root, 'refs')
  fs.mkdirSync(refs, { recursive: true })
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount: 2400, pattern: 'EDGE_SEQUENCE' })
  assert.equal(produced.ok, true)
  fs.writeFileSync(path.join(refs, 'ref.wav'), produced.value.bytes)
  const bindings = path.join(root, 'bindings.json')
  fs.writeFileSync(bindings, JSON.stringify({ 'binding:demo-1': { file: 'refs/ref.wav' } }))
  const tmpRoot = path.join(root, 'tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  return { root, runtime, customModel, baseModel, refs, bindings, tmpRoot, dispose: () => fs.rmSync(root, { recursive: true, force: true }) }
}

function makeSupervisor(workspace, args, options = {}) {
  return createQwenSupervisor({
    allowedRoot: repoRoot,
    worker: {
      command: workerScript,
      runtime: PYTHON,
      args: [
        `--allowed-root=${workspace.root}`,
        `--model-dir=${options.modelDir || workspace.customModel}`,
        `--model-id=${options.modelId || 'Qwen3-TTS-12Hz-1.7B-CustomVoice'}`,
        `--runtime-dir=${workspace.runtime}`,
        `--binding-index=${options.bindingIndex || workspace.bindings}`,
        ...args,
      ],
    },
    handshakeTimeoutMs: 20000,
    shutdownGraceMs: 500,
    killWaitMs: 500,
    tmpRoot: workspace.tmpRoot,
    requestTimeoutMs: 120000,
  })
}

function tempDirs(workspace) {
  return fs.readdirSync(workspace.tmpRoot)
    .filter((name) => name.startsWith('wv-qwen-'))
    .map((name) => path.join(workspace.tmpRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
}

function sdkCalls(workspace) {
  const dirs = tempDirs(workspace)
  if (dirs.length === 0) return []
  const file = path.join(dirs[0], 'fake-sdk-calls.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function setFakeMode(workspace, mode) {
  const dirs = tempDirs(workspace)
  assert.equal(dirs.length > 0, true)
  fs.writeFileSync(path.join(dirs[0], 'fake-sdk-mode.json'), JSON.stringify(mode))
}

async function waitFor(predicate, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('waitFor timed out')
}

async function withOfficialProvider(workspace, options, fn) {
  const supervisor = makeSupervisor(workspace, options.workerArgs || [], options)
  const provider = createQwenProvider({
    supervisor,
    requestTimeoutMs: options.requestTimeoutMs || 120000,
    bindings: options.bindings,
    bindingResolver: options.bindingResolver,
    modelIdentity: options.modelId || undefined,
  })
  try {
    return await fn({ provider, supervisor })
  } finally {
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    else await supervisor.stop().catch(() => null)
  }
}

test('official worker maps CustomVoice through the real worker without loading at import/health/discover', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, {}, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const discovery = provider.discovery()
      assert.equal(discovery.model, 'Qwen3-TTS-12Hz-1.7B-CustomVoice')
      assert.deepEqual(discovery.voices.map((voice) => voice.id).sort(), ['ryan', 'vivian'])
      assert.equal(provider.capabilities().limits.maxChars, 200)
      assert.equal(provider.capabilities().emotion.supported, true)

      const health = await provider.health()
      assert.equal(health.ok, true)
      assert.equal(health.worker.ready.loaded, false)
      assert.deepEqual(sdkCalls(workspace), [])

      const synthesized = await provider.synthesize(
        { text: '官方映射演示', voiceId: 'vivian', language: 'zh-CN', emotion: 'cheerful' },
        { taskId: 'task-official-custom' },
      )
      assert.equal(synthesized.ok, true, JSON.stringify(synthesized.code || synthesized.qwenCode))
      assert.equal(synthesized.result.voiceId, 'vivian')
      assert.equal(synthesized.result.durationMs, 100)
      assert.equal(synthesized.persisted, false)

      const calls = sdkCalls(workspace)
      const loaded = calls.filter((call) => call.event === 'from_pretrained')
      assert.equal(loaded.length, 1)
      assert.equal(loaded[0].path, fs.realpathSync(workspace.customModel))
      assert.equal(loaded[0].local_files_only, true)
      assert.equal(loaded[0].trust_remote_code, false)
      const generated = calls.filter((call) => call.event === 'generate_custom_voice')
      assert.equal(generated.length, 1)
      assert.equal(generated[0].language, 'Chinese')
      assert.equal(generated[0].speaker, 'Vivian')
      assert.equal(generated[0].text, '官方映射演示')
      assert.match(generated[0].instruct, /愉快|上扬/)
      assert.equal(calls.filter((call) => call.event === 'generate_voice_clone').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('official worker maps Base clone with the trusted local reference and no URL/base64 path', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  const bindings = [{ voiceId: 'clone-bound', name: '绑定音色', kind: 'clone', referenceRef: 'binding:demo-1' }]
  const resolver = (binding) => (binding && binding.voiceId === 'clone-bound' ? { referenceRef: 'binding:demo-1' } : null)
  try {
    await withOfficialProvider(workspace, {
      modelDir: workspace.baseModel,
      modelId: 'Qwen3-TTS-12Hz-1.7B-Base',
      bindings,
      bindingResolver: resolver,
    }, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      assert.equal(provider.capabilities().emotion.supported, false)
      assert.equal(provider.manifest().capabilities.voices[0].kind, 'cloned')

      const synthesized = await provider.synthesize(
        { text: '克隆映射演示', language: 'zh-CN' },
        { taskId: 'task-official-clone', binding: { kind: 'clone', voiceId: 'clone-bound' } },
      )
      assert.equal(synthesized.ok, true, JSON.stringify(synthesized.code || synthesized.qwenCode))
      assert.equal(synthesized.result.voiceId, 'clone-bound')

      const calls = sdkCalls(workspace)
      assert.equal(calls.filter((call) => call.event === 'generate_custom_voice').length, 0)
      const cloned = calls.filter((call) => call.event === 'generate_voice_clone')
      assert.equal(cloned.length, 1)
      assert.equal(cloned[0].ref_audio, fs.realpathSync(path.join(workspace.refs, 'ref.wav')))
      assert.equal(cloned[0].ref_text, null)
      assert.equal(cloned[0].x_vector_only_mode, true)
      assert.equal(cloned[0].language, 'Chinese')
      const loaded = calls.filter((call) => call.event === 'from_pretrained')
      assert.equal(loaded.length, 1)
      assert.equal(loaded[0].local_files_only, true)
    })
  } finally {
    workspace.dispose()
  }
})

test('official worker fails closed on missing package, contradictory model identity and escaping resources', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    const emptyRuntime = path.join(workspace.root, 'empty-runtime')
    fs.mkdirSync(emptyRuntime, { recursive: true })
    const providerMissing = createQwenProvider({
      supervisor: createQwenSupervisor({
        allowedRoot: repoRoot,
        worker: {
          command: workerScript,
          runtime: PYTHON,
          args: [
            `--allowed-root=${workspace.root}`,
            `--model-dir=${workspace.customModel}`,
            '--model-id=Qwen3-TTS-12Hz-1.7B-CustomVoice',
            `--runtime-dir=${emptyRuntime}`,
            `--binding-index=${workspace.bindings}`,
          ],
        },
        handshakeTimeoutMs: 20000,
        shutdownGraceMs: 500,
        tmpRoot: workspace.tmpRoot,
      }),
      requestTimeoutMs: 120000,
    })
    try {
      const started = await providerMissing.start()
      assert.equal(started.ok, false)
      assert.equal(started.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(started.qwenCode, 'QWEN_DEPENDENCY_MISSING')
    } finally {
      await providerMissing.shutdown()
    }

    const contradicting = createQwenProvider({
      supervisor: makeSupervisor(workspace, [], { modelDir: workspace.baseModel, modelId: 'Qwen3-TTS-12Hz-1.7B-CustomVoice' }),
      requestTimeoutMs: 120000,
    })
    try {
      const started = await contradicting.start()
      assert.equal(started.ok, false)
      assert.equal(started.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(started.qwenCode, 'QWEN_MODEL_BACKEND_MISMATCH')
    } finally {
      await contradicting.shutdown()
    }

    const escaping = createQwenProvider({
      supervisor: makeSupervisor(workspace, [], { modelDir: path.join(workspace.root, '..', 'outside-model') }),
      requestTimeoutMs: 120000,
    })
    try {
      const started = await escaping.start()
      assert.equal(started.ok, false)
      assert.equal(started.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(started.qwenCode, 'QWEN_RESOURCE_UNVERIFIED')
    } finally {
      await escaping.shutdown()
    }

    const badIndex = path.join(workspace.root, 'bad-bindings.json')
    fs.writeFileSync(badIndex, JSON.stringify({ 'binding:escape': { file: '../outside.wav' } }))
    const escapingBinding = createQwenProvider({
      supervisor: makeSupervisor(workspace, [], { modelDir: workspace.baseModel, modelId: 'Qwen3-TTS-12Hz-1.7B-Base', bindingIndex: badIndex }),
      requestTimeoutMs: 120000,
    })
    try {
      const started = await escapingBinding.start()
      assert.equal(started.ok, false)
      assert.equal(started.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(started.qwenCode, 'QWEN_RESOURCE_UNVERIFIED')
    } finally {
      await escapingBinding.shutdown()
    }

    assert.deepEqual(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained'), [])
  } finally {
    workspace.dispose()
  }
})

test('official worker cancellation keeps the ack and does not promote a later completion', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, {}, async ({ provider, supervisor }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { delayMs: 1200 })
      const begun = await provider.beginSynthesis(
        { text: '取消演示', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-official-cancel' },
      )
      assert.equal(begun.ok, true)
      await waitFor(() => supervisor.state().activeOperations === 1, 5000)
      const ack = await begun.cancel()
      assert.equal(ack.ok, true)
      assert.equal(ack.state, 'cancelled')
      const result = await begun.result
      assert.equal(result.ok, false)
      assert.equal(result.cancelled, true)
      assert.equal(result.code, PROVIDER_ERRORS.CANCELLED)
      await waitFor(() => supervisor.state().lateResponses >= 1, 5000)
      assert.equal(supervisor.state().unresolvedOperations, 0)
    })
  } finally {
    workspace.dispose()
  }
})
