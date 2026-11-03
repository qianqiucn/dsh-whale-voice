/* Plan10 10-B — official IndexTTS-2.5 worker integration with the real supervisor/protocol/adapter.
 *
 * The audited `indextts` package and real weights are not installed. A local Fake package is injected
 * through the worker's explicit `--runtime-dir` test hook and records every official call. This proves
 * the documented official mapping, local-only resource boundary, cancellation/output/lifecycle
 * behavior and honest failure. It does not claim real inference, GPU use or audio quality.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createIndexTtsSupervisor } from '../core/tts/index-tts-supervisor.mjs'
import { createIndexTtsProvider } from '../core/tts/index-tts-adapter.mjs'
import { INDEX_TTS_ERRORS } from '../core/tts/index-tts-contract.mjs'
import { PROVIDER_ERRORS } from '../core/tts/provider-contract.mjs'
import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '..')
const fakeSdkSource = path.join(repoRoot, 'test-fixtures', 'fake-indextts-sdk')
const workerScript = 'workers/index_tts_worker.py'

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

const CONFIG_YAML = [
  'version: 2.5',
  'gpt:',
  '  max_text_tokens: 600',
  's2mel:',
  '  preprocess_params:',
  '    sr: 22050',
  'qwen_emo_path: qwen0.6bemo4-merge/',
  '',
].join('\n')

function makeWorkspace({ qwenEmo = true, largeWeight = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-indextts-official-'))
  const runtime = path.join(root, 'runtime')
  fs.cpSync(fakeSdkSource, runtime, { recursive: true })
  const model = path.join(root, 'model')
  fs.mkdirSync(model, { recursive: true })
  fs.writeFileSync(path.join(model, 'config.yaml'), CONFIG_YAML)
  for (const name of ['gpt.pth', 's2mel.pth', 'codec.pth', 'feat1.pt', 'feat2.pt', 'wav2vec2bert_stats.pt', 'multilingual_zh_ja_yue_char_del.tiktoken']) {
    fs.writeFileSync(path.join(model, name), Buffer.alloc(1024, 0x41))
  }
  fs.mkdirSync(path.join(model, 'hf_cache', 'w2v-bert-2.0'), { recursive: true })
  fs.writeFileSync(path.join(model, 'hf_cache', 'w2v-bert-2.0', 'config.json'), '{"model_type":"wav2vec2-bert"}')
  fs.mkdirSync(path.join(model, 'hf_cache', 'bigvgan'), { recursive: true })
  fs.writeFileSync(path.join(model, 'hf_cache', 'bigvgan', 'config.json'), '{"model_type":"bigvgan"}')
  fs.writeFileSync(path.join(model, 'hf_cache', 'campplus_cn_common.bin'), Buffer.alloc(1024, 0x42))
  if (qwenEmo) {
    fs.mkdirSync(path.join(model, 'qwen0.6bemo4-merge'), { recursive: true })
    fs.writeFileSync(path.join(model, 'qwen0.6bemo4-merge', 'config.json'), '{"model_type":"qwen"}')
  }
  if (largeWeight) fs.writeFileSync(path.join(model, 'model.safetensors'), Buffer.alloc(8 * 1024 * 1024 + 1, 0x5a))
  const refs = path.join(root, 'refs')
  fs.mkdirSync(refs, { recursive: true })
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 22050, channels: 1, frameCount: 4410, pattern: 'EDGE_SEQUENCE' })
  assert.equal(produced.ok, true)
  fs.writeFileSync(path.join(refs, 'ref.wav'), produced.value.bytes)
  fs.writeFileSync(path.join(refs, 'emo.wav'), produced.value.bytes)
  const bindings = path.join(root, 'bindings.json')
  fs.writeFileSync(bindings, JSON.stringify({ 'binding:demo-1': { file: 'refs/ref.wav' }, 'binding:emo-1': { file: 'refs/emo.wav' } }))
  const tmpRoot = path.join(root, 'tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  return { root, runtime, model, refs, bindings, tmpRoot, dispose: () => fs.rmSync(root, { recursive: true, force: true }) }
}

function makeSupervisor(workspace, args = []) {
  return createIndexTtsSupervisor({
    allowedRoot: repoRoot,
    worker: {
      command: workerScript,
      runtime: PYTHON,
      args: [
        `--allowed-root=${workspace.root}`,
        `--model-dir=${workspace.model}`,
        '--model-id=IndexTTS-2.5',
        '--backend=clone-emotion',
        `--binding-index=${workspace.bindings}`,
        `--runtime-dir=${workspace.runtime}`,
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
    .filter((name) => name.startsWith('wv-indextts-') && !name.startsWith('wv-indextts-snap-'))
    .map((name) => path.join(workspace.tmpRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
}

function fakeCalls(workspace) {
  const dirs = tempDirs(workspace)
  if (dirs.length === 0) return []
  const file = path.join(dirs[0], 'fake-indextts-calls.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function setFakeMode(workspace, mode) {
  const dirs = tempDirs(workspace)
  assert.equal(dirs.length > 0, true)
  for (const dir of dirs) fs.writeFileSync(path.join(dir, 'fake-indextts-mode.json'), JSON.stringify(mode))
}

const BINDINGS = [
  { voiceId: 'demo-voice', name: '演示音色', kind: 'clone', referenceRef: 'binding:demo-1', languages: ['zh-CN', 'en-US'] },
  { voiceId: 'emotion-voice', name: '情绪参考', kind: 'clone', referenceRef: 'binding:emo-1', languages: ['zh-CN'] },
]

const resolver = (binding) => {
  const found = BINDINGS.find((item) => item.voiceId === binding.voiceId)
  return found ? { referenceRef: found.referenceRef } : null
}

function withProvider(workspace, fn, options = {}) {
  const supervisor = makeSupervisor(workspace, options.workerArgs || [])
  const provider = createIndexTtsProvider({
    supervisor,
    requestTimeoutMs: options.requestTimeoutMs || 120000,
    bindings: BINDINGS,
    bindingResolver: resolver,
    modelIdentity: 'IndexTTS-2.5',
  })
  return (async () => {
    try {
      return await fn({ provider, supervisor })
    } finally {
      if (provider && provider.ok) await provider.shutdown().catch(() => null)
      else await supervisor.stop().catch(() => null)
    }
  })()
}

function cloneRequest(text = '你好，IndexTTS。', extra = {}) {
  return {
    request: { text, language: 'zh-CN', emotion: 'happy', ...extra },
    context: { taskId: 'task-index-1', binding: { kind: 'clone', voiceId: 'demo-voice' } },
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

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

test('Index worker starts statically, proves clone/emotion discovery and loads no SDK at import/health/discover', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      assert.equal(provider.manifest().id, 'index-tts-local')
      assert.equal(provider.manifest().capabilities.clone.supported, true)
      assert.equal(provider.manifest().capabilities.emotion.supported, true)
      assert.equal(provider.manifest().capabilities.emotion.textSupported, true)
      assert.deepEqual(provider.discovery().voices.map((voice) => voice.id).sort(), ['demo-voice', 'emotion-voice'])
      assert.equal(provider.discovery().languages.join(','), 'zh-CN,en-US,ja-JP,es-ES,ar-SA')
      const health = await provider.health()
      assert.equal(health.status.state, 'AVAILABLE')
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'infer').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index success maps the official clone/emotion call and validates 22.05 kHz output', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const request = cloneRequest('中文情绪演示', { emotion: 'happy' })
      const result = await provider.synthesize(request.request, { ...request.context, emotionAlpha: 0.75 })
      assert.equal(result.ok, true, JSON.stringify(result.code || result.indexCode))
      assert.equal(result.persisted, false)
      assert.equal(result.result.sampleRate, 22050)
      assert.equal(result.result.mime, 'audio/wav')
      assert.equal(result.result.providerId, 'index-tts-local')
      assert.equal(result.result.voiceId, 'demo-voice')
      const calls = fakeCalls(workspace)
      const loaded = calls.find((call) => call.event === 'from_pretrained')
      assert.ok(loaded)
      assert.equal(loaded.path.includes('wv-indextts-snap-'), true)
      assert.equal(loaded.configVersion, '2.5')
      assert.equal(loaded.kwargs.use_qwen_emo, false)
      const inferred = calls.find((call) => call.event === 'infer')
      assert.ok(inferred)
      assert.equal(inferred.kwargs.lang, 'ZH')
      assert.equal(inferred.kwargs.text, '中文情绪演示')
      assert.deepEqual(inferred.kwargs.emo_vector, [1, 0, 0, 0, 0, 0, 0, 0])
      assert.equal(inferred.kwargs.emo_alpha, 0.75)
      assert.equal(inferred.refBytesSha256, sha256Buffer(fs.readFileSync(path.join(workspace.refs, 'ref.wav'))))
    })
  } finally {
    workspace.dispose()
  }
})

test('Index maps an 8-float context vector and text emotion only when QwenEmotion is available', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const vector = await provider.synthesize(
        { text: '向量情绪', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-vector', binding: { kind: 'clone', voiceId: 'demo-voice' }, emotionVector: [0, 0, 0.8, 0, 0, 0, 0.1, 0] },
      )
      assert.equal(vector.ok, true, JSON.stringify(vector.code || vector.indexCode))
      const vectorCall = fakeCalls(workspace).find((call) => call.event === 'infer' && call.kwargs.text === '向量情绪')
      assert.deepEqual(vectorCall.kwargs.emo_vector, [0, 0, 0.8, 0, 0, 0, 0.1, 0])

      const text = await provider.synthesize(
        { text: '文本情绪', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-text', binding: { kind: 'clone', voiceId: 'demo-voice' }, useEmotionText: true, emotionText: '开心一点' },
      )
      assert.equal(text.ok, true, JSON.stringify(text.code || text.indexCode))
      const textCall = fakeCalls(workspace).find((call) => call.event === 'infer' && call.kwargs.text === '文本情绪')
      assert.equal(textCall.kwargs.use_emo_text, true)
      assert.equal(textCall.kwargs.emo_text, '开心一点')
      const textLoad = fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').at(-1)
      assert.equal(textLoad.kwargs.use_qwen_emo, true)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index rejects text emotion when the audited QwenEmotion resource is absent, without loading the SDK', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace({ qwenEmo: false })
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const result = await provider.synthesize(
        { text: '文本情绪', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-no-emo', binding: { kind: 'clone', voiceId: 'demo-voice' }, useEmotionText: true, emotionText: '开心' },
      )
      assert.equal(result.ok, false)
      assert.equal(result.code, PROVIDER_ERRORS.UNSUPPORTED_EMOTION)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index rejects preset/mixed/unregistered clone requests before the SDK', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const preset = await provider.synthesize(
        { text: '预设', language: 'zh-CN', voiceId: 'demo-voice', emotion: 'neutral' },
        { taskId: 'task-index-preset' },
      )
      assert.equal(preset.ok, false)
      const mixed = await provider.synthesize(
        { text: '混合', language: 'zh-CN', voiceId: 'demo-voice', emotion: 'neutral' },
        { taskId: 'task-index-mixed', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(mixed.ok, false)
      const unregistered = await provider.synthesize(
        { text: '未登记', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-unregistered', binding: { kind: 'clone', voiceId: 'missing-voice' } },
      )
      assert.equal(unregistered.ok, false)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index refuses a model config changed before synthesis and never calls the SDK', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const configPath = path.join(workspace.model, 'config.yaml')
      fs.appendFileSync(configPath, '# changed after hello\n')
      const result = await provider.synthesize(...Object.values(cloneRequest()))
      assert.equal(result.ok, false)
      assert.equal(result.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index copies large model files instead of hardlinking and consumes the stable snapshot', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace({ largeWeight: true })
  try {
    const original = fs.readFileSync(path.join(workspace.model, 'model.safetensors'))
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const begun = await provider.beginSynthesis(
        { text: '大文件快照', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-large', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(begun.ok, true, JSON.stringify(begun))
      await waitFor(() => fakeCalls(workspace).some((call) => call.event === 'from_pretrained'), 10000)
      const changed = Buffer.from(original)
      changed[changed.length - 1] = 0xa5
      fs.writeFileSync(path.join(workspace.model, 'model.safetensors'), changed)
      const result = await begun.result
      assert.equal(result.ok, true, JSON.stringify(result.code || result.indexCode))
      const loaded = fakeCalls(workspace).find((call) => call.event === 'from_pretrained')
      assert.equal(loaded.weightSha256, sha256Buffer(original))
      assert.equal(loaded.path.includes('wv-indextts-snap-'), true)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index enforces the cumulative snapshot budget before loading', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    fs.writeFileSync(path.join(workspace.model, 'part-a.safetensors'), Buffer.alloc(3 * 1024 * 1024, 0x11))
    fs.writeFileSync(path.join(workspace.model, 'part-b.safetensors'), Buffer.alloc(3 * 1024 * 1024, 0x22))
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const result = await provider.synthesize(...Object.values(cloneRequest()))
      assert.equal(result.ok, false)
      assert.equal(result.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 0)
    }, { workerArgs: ['--snapshot-budget-bytes=4194304'] })
  } finally {
    workspace.dispose()
  }
})

test('Index cancellation before loading and during loading never fabricates completion', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider, supervisor }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadDelayMs: 700 })
      const begun = await provider.beginSynthesis(
        { text: '加载中取消', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-cancel', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(begun.ok, true, JSON.stringify(begun))
      await waitFor(() => fakeCalls(workspace).some((call) => call.event === 'from_pretrained'), 10000)
      const ack = await begun.cancel()
      assert.equal(ack.ok, true, JSON.stringify(ack))
      assert.equal(ack.confirmed, true)
      const result = await begun.result
      assert.equal(result.ok, false)
      assert.equal(result.cancelled, true)
      await waitFor(() => supervisor.state().lateResponses >= 1, 10000)
      setFakeMode(workspace, {})
      const second = await provider.synthesize(
        { text: '取消后重载', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-cancel', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(second.ok, true, JSON.stringify(second.code || second.indexCode))
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 2)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index timeout becomes UNKNOWN, never retries and blocks overlapping work until settled', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadDelayMs: 1500 })
      const result = await provider.synthesize(
        { text: '超时', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-timeout', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(result.ok, false, `result ok=${result.ok} code=${result.code || result.indexCode} unknown=${result.unknown}`)
      assert.equal(result.terminal, 'UNKNOWN')
      assert.equal(result.code, PROVIDER_ERRORS.TIMEOUT)
    }, { requestTimeoutMs: 300 })
  } finally {
    workspace.dispose()
  }
})

test('Index maps a Fake load error to a provider failure and a wrong output format is rejected', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadError: true })
      const failed = await provider.synthesize(
        { text: '加载失败', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-load-error', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(failed.ok, false)
      assert.equal(failed.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      setFakeMode(workspace, { sampleRate: 16000 })
      const wrong = await provider.synthesize(
        { text: '错误采样率', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-wrong-rate', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(wrong.ok, false)
      assert.equal(wrong.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index health reports missing package honestly and never invents availability', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    fs.rmSync(path.join(workspace.runtime, 'indextts'), { recursive: true, force: true })
    await withProvider(workspace, async ({ supervisor }) => {
      const started = await supervisor.start()
      assert.equal(started.ok, false)
      assert.equal(started.code, INDEX_TTS_ERRORS.DEPENDENCY_MISSING)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index worker crash is a provider failure and is never retried', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider, supervisor }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { crash: true })
      const result = await provider.synthesize(
        { text: '崩溃', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-crash', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(result.ok, false, JSON.stringify(result.code || result.indexCode))
      assert.equal(result.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      assert.equal(supervisor.state().alive, false)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index timeout keeps the operation unresolved and blocks a reentrant synthesis', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadDelayMs: 900 })
      const first = await provider.synthesize(
        { text: '第一次超时', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-reentry', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(first.ok, false)
      assert.equal(first.terminal, 'UNKNOWN')
      const second = await provider.synthesize(
        { text: '第二次', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-reentry', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(second.ok, false)
      assert.equal(second.indexCode, INDEX_TTS_ERRORS.UNRESOLVED_ACTIVITY)
    }, { requestTimeoutMs: 300 })
  } finally {
    workspace.dispose()
  }
})

test('Index supervisor can restart a clean generation after stop', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const first = await provider.synthesize(
        { text: '第一代', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-generation', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(first.ok, true, JSON.stringify(first.code || first.indexCode))
      const stopped = await provider.shutdown()
      assert.equal(stopped.ok, true)
      const restarted = await provider.start()
      assert.equal(restarted.ok, true, JSON.stringify(restarted))
      const second = await provider.synthesize(
        { text: '第二代', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-generation', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(second.ok, true, JSON.stringify(second.code || second.indexCode))
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'from_pretrained').length, 1)
    })
  } finally {
    workspace.dispose()
  }
})

test('Index stop removes its worker temporary directory and snapshots', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const result = await provider.synthesize(
        { text: '清理', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-cleanup', binding: { kind: 'clone', voiceId: 'demo-voice' } },
      )
      assert.equal(result.ok, true, JSON.stringify(result.code || result.indexCode))
      assert.equal(fs.readdirSync(workspace.tmpRoot).length > 0, true)
    })
    assert.equal(fs.readdirSync(workspace.tmpRoot).length, 0)
  } finally {
    workspace.dispose()
  }
})

test('Index maps a trusted emotion reference audio without mixing it with vector/text emotion', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const result = await provider.synthesize(
        { text: '情绪参考', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-emo-ref', binding: { kind: 'clone', voiceId: 'demo-voice' }, emotionBindingRef: 'binding:emo-1' },
      )
      assert.equal(result.ok, true, JSON.stringify(result.code || result.indexCode))
      const call = fakeCalls(workspace).find((entry) => entry.event === 'infer' && entry.kwargs.text === '情绪参考')
      assert.equal(call.kwargs.emo_audio_prompt !== null, true)
      assert.equal(call.emoBytesSha256, sha256Buffer(fs.readFileSync(path.join(workspace.refs, 'emo.wav'))))
      assert.equal(call.kwargs.emo_vector, null)
      assert.equal(call.kwargs.use_emo_text, false)
      const mixed = await provider.synthesize(
        { text: '混合情绪', language: 'zh-CN', emotion: 'neutral' },
        { taskId: 'task-index-emo-mixed', binding: { kind: 'clone', voiceId: 'demo-voice' }, emotionBindingRef: 'binding:emo-1', emotionVector: [1, 0, 0, 0, 0, 0, 0, 0] },
      )
      assert.equal(mixed.ok, false)
    })
  } finally {
    workspace.dispose()
  }
})
