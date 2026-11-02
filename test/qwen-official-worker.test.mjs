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
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createQwenSupervisor } from '../core/tts/qwen-supervisor.mjs'
import { createQwenProvider } from '../core/tts/qwen-adapter.mjs'
import { QWEN_ERRORS } from '../core/tts/qwen-contract.mjs'
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

function createDirLink(linkPath, target) {
  fs.rmSync(linkPath, { recursive: true, force: true })
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

function removeDirLink(linkPath) {
  try {
    fs.rmdirSync(linkPath)
  } catch {
    try { fs.unlinkSync(linkPath) } catch { /* already gone */ }
  }
}

function makeOutsideRefs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-qwen-outside-'))
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount: 2400, pattern: 'EDGE_SEQUENCE' })
  fs.writeFileSync(path.join(dir, 'ref.wav'), produced.value.bytes)
  return { dir, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

const CLONE_BINDINGS = [{ voiceId: 'clone-bound', name: '绑定音色', kind: 'clone', referenceRef: 'binding:demo-1' }]
const cloneResolver = (binding) => (binding && binding.voiceId === 'clone-bound' ? { referenceRef: 'binding:demo-1' } : null)

function cloneOptions(workspace) {
  return {
    modelDir: workspace.baseModel,
    modelId: 'Qwen3-TTS-12Hz-1.7B-Base',
    bindings: CLONE_BINDINGS,
    bindingResolver: cloneResolver,
  }
}

function cloneRequest() {
  return {
    request: { text: '克隆资源审计', language: 'zh-CN' },
    context: { binding: { kind: 'clone', voiceId: 'clone-bound' } },
  }
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
      assert.equal(loaded[0].offline_env.HF_HUB_OFFLINE, '1')
      assert.equal(loaded[0].offline_env.TRANSFORMERS_OFFLINE, '1')
      for (const name of ['nested_AutoConfig', 'nested_AutoModel', 'nested_AutoProcessor']) {
        assert.equal(calls.some((call) => call.event === name), true, name)
      }
      assert.equal(calls.filter((call) => call.event === 'top_network_attempt').every((call) => call.blocked === true), true)
      const nestedAttempts = calls.filter((call) => call.event === 'nested_network_attempt')
      assert.equal(nestedAttempts.length >= 3, true)
      assert.equal(nestedAttempts.every((call) => call.blocked === true && call.error === 'NetworkBlocked'), true)
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
      assert.equal(cloned[0].ref_audio_kind, 'data-uri')
      assert.equal(cloned[0].ref_audio_bytes, fs.statSync(path.join(workspace.refs, 'ref.wav')).size)
      assert.equal(cloned[0].ref_audio_sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace.refs, 'ref.wav'))).digest('hex'))
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
      await waitFor(() => supervisor.state().unresolvedOperations === 0, 5000)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R01 a changed model configuration is refused before any SDK call', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, cloneOptions(workspace), async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const configPath = path.join(workspace.baseModel, 'config.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      config.tts_model_size = '0b6'
      fs.writeFileSync(configPath, JSON.stringify(config))
      const { request, context } = cloneRequest()
      const synthesized = await provider.synthesize(request, { taskId: 'task-config-change', ...context })
      assert.equal(synthesized.ok, false)
      assert.equal(synthesized.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R01 an oversized clone reference is refused before any SDK call', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, cloneOptions(workspace), async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      fs.truncateSync(path.join(workspace.refs, 'ref.wav'), 20 * 1024 * 1024 + 1)
      const { request, context } = cloneRequest()
      const synthesized = await provider.synthesize(request, { taskId: 'task-ref-size', ...context })
      assert.equal(synthesized.ok, false)
      assert.equal(synthesized.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'generate_voice_clone').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R01 a junction or symlink escaping the allowed root is refused and recovered', { skip: pythonSkip, timeout: 120000 }, async (t) => {
  const workspace = makeWorkspace()
  const outside = makeOutsideRefs()
  const refs = path.join(workspace.refs)
  const refsReal = path.join(workspace.root, 'refs-real')
  let linked = false
  try {
    await withOfficialProvider(workspace, cloneOptions(workspace), async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      fs.renameSync(refs, refsReal)
      try {
        createDirLink(refs, outside.dir)
        linked = true
      } catch {
        fs.renameSync(refsReal, refs)
        t.skip('directory links are not permitted on this platform')
        return
      }
      const { request, context } = cloneRequest()
      const escaped = await provider.synthesize(request, { taskId: 'task-ref-escape', ...context })
      assert.equal(escaped.ok, false)
      assert.equal(escaped.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'generate_voice_clone').length, 0)
      removeDirLink(refs)
      fs.renameSync(refsReal, refs)
      linked = false
      const recovered = await provider.synthesize(request, { taskId: 'task-ref-escape', ...context })
      assert.equal(recovered.ok, true, JSON.stringify(recovered.code || recovered.qwenCode))
    })
  } finally {
    if (linked) {
      removeDirLink(refs)
      try { fs.renameSync(refsReal, refs) } catch { /* best effort */ }
    }
    outside.dispose()
    workspace.dispose()
  }
})

test('121-R01 a missing direct runtime dependency fails closed at hello', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    fs.rmSync(path.join(workspace.runtime, 'soundfile'), { recursive: true, force: true })
    const provider = createQwenProvider({
      supervisor: makeSupervisor(workspace, [], {}),
      requestTimeoutMs: 120000,
    })
    try {
      const started = await provider.start()
      assert.equal(started.ok, false)
      assert.equal(started.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(started.qwenCode, 'QWEN_DEPENDENCY_MISSING')
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    } finally {
      await provider.shutdown()
    }
  } finally {
    workspace.dispose()
  }
})

test('121-R03 a cancel arriving with the request prevents the model load', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, {}, async ({ provider, supervisor }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const begun = await provider.beginSynthesis(
        { text: '预载取消', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-cancel-before-load' },
      )
      assert.equal(begun.ok, true)
      const ack = await begun.cancel()
      assert.equal(ack.ok, true)
      assert.equal(ack.confirmed, true)
      const result = await begun.result
      assert.equal(result.ok, false)
      assert.equal(result.cancelled, true)
      await waitFor(() => supervisor.state().lateResponses >= 1, 5000)
      const calls = sdkCalls(workspace)
      assert.equal(calls.filter((call) => call.event === 'from_pretrained').length, 0)
      assert.equal(calls.filter((call) => call.event === 'generate_custom_voice').length, 0)
      const after = await provider.synthesize(
        { text: '取消后正常', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-cancel-before-load' },
      )
      assert.equal(after.ok, true, JSON.stringify(after.code || after.qwenCode))
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 1)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R03 a cancel during loading prevents generation', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, {}, async ({ provider, supervisor }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadDelayMs: 700 })
      const begun = await provider.beginSynthesis(
        { text: '加载中取消', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-cancel-during-load' },
      )
      assert.equal(begun.ok, true)
      await waitFor(() => sdkCalls(workspace).some((call) => call.event === 'from_pretrained'), 5000)
      const ack = await begun.cancel()
      assert.equal(ack.ok, true)
      assert.equal(ack.confirmed, true)
      const result = await begun.result
      assert.equal(result.ok, false)
      assert.equal(result.cancelled, true)
      await waitFor(() => supervisor.state().lateResponses >= 1, 5000)
      const calls = sdkCalls(workspace)
      assert.equal(calls.filter((call) => call.event === 'from_pretrained').length, 1)
      assert.equal(calls.filter((call) => call.event === 'generate_custom_voice').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R01 a model-directory link escaping the allowed root is refused and recovered', { skip: pythonSkip, timeout: 120000 }, async (t) => {
  const workspace = makeWorkspace()
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-qwen-model-outside-'))
  const outsideModel = path.join(outsideRoot, 'model')
  fs.mkdirSync(outsideModel, { recursive: true })
  fs.writeFileSync(path.join(outsideModel, 'config.json'), JSON.stringify(configFor('custom_voice', '1b7', { speakers: { Vivian: 1, Ryan: 2 } })))
  const modelPath = workspace.customModel
  const modelReal = path.join(workspace.root, 'models', 'custom-real')
  let linked = false
  try {
    await withOfficialProvider(workspace, {}, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      fs.renameSync(modelPath, modelReal)
      try {
        createDirLink(modelPath, outsideModel)
        linked = true
      } catch {
        fs.renameSync(modelReal, modelPath)
        t.skip('directory links are not permitted on this platform')
        return
      }
      const escaped = await provider.synthesize(
        { text: '模型目录越界', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-model-escape' },
      )
      assert.equal(escaped.ok, false)
      assert.equal(escaped.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
      removeDirLink(modelPath)
      fs.renameSync(modelReal, modelPath)
      linked = false
      const recovered = await provider.synthesize(
        { text: '恢复后正常', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-model-escape' },
      )
      assert.equal(recovered.ok, true, JSON.stringify(recovered.code || recovered.qwenCode))
    })
  } finally {
    if (linked) {
      removeDirLink(modelPath)
      try { fs.renameSync(modelReal, modelPath) } catch { /* best effort */ }
    }
    fs.rmSync(outsideRoot, { recursive: true, force: true })
    workspace.dispose()
  }
})

test('121-R01 a disappeared clone reference is refused before any SDK call', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, cloneOptions(workspace), async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      fs.rmSync(path.join(workspace.refs, 'ref.wav'))
      const { request, context } = cloneRequest()
      const synthesized = await provider.synthesize(request, { taskId: 'task-ref-missing', ...context })
      assert.equal(synthesized.ok, false)
      assert.equal(synthesized.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'generate_voice_clone').length, 0)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function flipLastByte(file) {
  const original = fs.readFileSync(file)
  const changed = Buffer.from(original)
  changed[changed.length - 1] = changed[changed.length - 1] ^ 0xff
  fs.writeFileSync(file, changed)
  return { original, changed }
}

test('121-R01 a same-size in-place reference rewrite after hello is refused before loading', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, cloneOptions(workspace), async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      flipLastByte(path.join(workspace.refs, 'ref.wav'))
      const { request, context } = cloneRequest()
      const synthesized = await provider.synthesize(request, { taskId: 'task-ref-rewrite', ...context })
      assert.equal(synthesized.ok, false)
      assert.equal(synthesized.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'generate_voice_clone').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R01 the SDK consumes the audited reference bytes when the file changes during loading', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, cloneOptions(workspace), async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const refPath = path.join(workspace.refs, 'ref.wav')
      const originalHash = sha256File(refPath)
      setFakeMode(workspace, { loadDelayMs: 700 })
      const { request, context } = cloneRequest()
      const begun = await provider.beginSynthesis(request, { taskId: 'task-ref-stable', ...context })
      assert.equal(begun.ok, true)
      await waitFor(() => sdkCalls(workspace).some((call) => call.event === 'from_pretrained'), 5000)
      flipLastByte(refPath)
      const result = await begun.result
      assert.equal(result.ok, true, JSON.stringify(result.code || result.qwenCode))
      const cloned = sdkCalls(workspace).filter((call) => call.event === 'generate_voice_clone')
      assert.equal(cloned.length, 1)
      assert.equal(cloned[0].ref_audio_kind, 'data-uri')
      assert.equal(cloned[0].ref_audio_sha256, originalHash)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R01 a configuration change during loading is refused before generation', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, {}, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadDelayMs: 700 })
      const begun = await provider.beginSynthesis(
        { text: '加载中改配置', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-config-during-load' },
      )
      assert.equal(begun.ok, true)
      await waitFor(() => sdkCalls(workspace).some((call) => call.event === 'from_pretrained'), 5000)
      const configPath = path.join(workspace.customModel, 'config.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      config.tts_model_size = '0b6'
      fs.writeFileSync(configPath, JSON.stringify(config))
      const result = await begun.result
      assert.equal(result.ok, false)
      assert.equal(result.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'generate_custom_voice').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('121-R01 a speech-tokenizer sub-resource escaping the root is refused', { skip: pythonSkip, timeout: 120000 }, async (t) => {
  const workspace = makeWorkspace()
  const outside = makeOutsideRefs()
  const subPath = path.join(workspace.customModel, 'speech_tokenizer')
  let linked = false
  try {
    await withOfficialProvider(workspace, {}, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      try {
        createDirLink(subPath, outside.dir)
        linked = true
      } catch {
        t.skip('directory links are not permitted on this platform')
        return
      }
      const synthesized = await provider.synthesize(
        { text: '子资源越界', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-subresource-escape' },
      )
      assert.equal(synthesized.ok, false)
      assert.equal(synthesized.qwenCode, QWEN_ERRORS.RESOURCE_CHANGED)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    })
  } finally {
    if (linked) removeDirLink(subPath)
    outside.dispose()
    workspace.dispose()
  }
})

test('121-R01 a runtime dependency that disappears after hello is reported by health and recovers', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withOfficialProvider(workspace, {}, async ({ provider, supervisor }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const soundfileDir = path.join(workspace.runtime, 'soundfile')
      const movedDir = path.join(workspace.runtime, 'soundfile-away')
      fs.renameSync(soundfileDir, movedDir)
      const synthesized = await provider.synthesize(
        { text: '依赖失效', voiceId: 'vivian', language: 'zh-CN' },
        { taskId: 'task-runtime-dependency' },
      )
      assert.equal(synthesized.ok, false)
      assert.equal(synthesized.qwenCode, QWEN_ERRORS.DEPENDENCY_MISSING)
      assert.equal(sdkCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
      const degraded = await supervisor.health({ timeoutMs: 2000 })
      assert.equal(degraded.ok, true)
      assert.equal(degraded.payload.state, 'degraded')
      assert.equal(degraded.payload.dependencies.soundfile, false)
      fs.renameSync(movedDir, soundfileDir)
      const recovered = await supervisor.health({ timeoutMs: 2000 })
      assert.equal(recovered.ok, true)
      assert.equal(recovered.payload.state, 'ok')
      assert.equal(recovered.payload.dependencies.soundfile, true)
    })
  } finally {
    workspace.dispose()
  }
})
