/* Plan10 10-C — official Kokoro worker integration with real supervisor/protocol/adapter. */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createKokoroSupervisor } from '../core/tts/kokoro-supervisor.mjs'
import { createKokoroProvider } from '../core/tts/kokoro-adapter.mjs'
import { KOKORO_ERRORS } from '../core/tts/kokoro-contract.mjs'
import { PROVIDER_ERRORS } from '../core/tts/provider-contract.mjs'
import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '..')
const fakeSdkSource = path.join(repoRoot, 'test-fixtures', 'fake-kokoro-sdk')
const workerScript = 'workers/kokoro_worker.py'

function findPython() {
  for (const candidate of ['python', 'python3', 'py']) {
    try {
      const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', timeout: 10000 })
      if (!probe.error && probe.status === 0) {
        const executable = String(probe.stdout || '').trim()
        if (executable && fs.existsSync(executable)) return executable
      }
    } catch { /* next */ }
  }
  return null
}

const PYTHON = findPython()
const pythonSkip = PYTHON ? false : 'python 3 is not available on this platform'

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-kokoro-official-'))
  const runtime = path.join(root, 'runtime')
  fs.cpSync(fakeSdkSource, runtime, { recursive: true })
  const model = path.join(root, 'model')
  fs.mkdirSync(model, { recursive: true })
  fs.writeFileSync(path.join(model, 'config.json'), JSON.stringify({ vocab: { a: 1, b: 2, c: 3 }, n_token: 3 }))
  fs.writeFileSync(path.join(model, 'kokoro-v1_0.pth'), Buffer.alloc(2048, 0x41))
  const voices = path.join(root, 'voices')
  fs.mkdirSync(voices, { recursive: true })
  fs.writeFileSync(path.join(voices, 'af-demo.pt'), Buffer.alloc(1024, 0x42))
  fs.writeFileSync(path.join(voices, 'zf-demo.pt'), Buffer.alloc(1024, 0x43))
  const voiceIndex = path.join(root, 'voices.json')
  fs.writeFileSync(voiceIndex, JSON.stringify({
    'af-demo': { file: 'voices/af-demo.pt', language: 'en-US', name: 'Demo US' },
    'zf-demo': { file: 'voices/zf-demo.pt', language: 'zh-CN', name: 'Demo CN' },
  }))
  const tmpRoot = path.join(root, 'tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  return { root, runtime, model, voices, voiceIndex, tmpRoot, dispose: () => fs.rmSync(root, { recursive: true, force: true }) }
}

function makeSupervisor(workspace, args = []) {
  return createKokoroSupervisor({
    allowedRoot: repoRoot,
    worker: {
      command: workerScript,
      runtime: PYTHON,
      args: [
        `--allowed-root=${workspace.root}`,
        `--model-dir=${workspace.model}`,
        '--model-id=Kokoro-82M-v1.0',
        '--backend=preset',
        `--voice-index=${workspace.voiceIndex}`,
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
    .filter((name) => name.startsWith('wv-kokoro-') && !name.startsWith('wv-kokoro-snap-'))
    .map((name) => path.join(workspace.tmpRoot, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
}

function fakeCalls(workspace) {
  const dirs = tempDirs(workspace)
  if (dirs.length === 0) return []
  const file = path.join(dirs[0], 'fake-kokoro-calls.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function setFakeMode(workspace, mode) {
  const dirs = tempDirs(workspace)
  assert.equal(dirs.length > 0, true)
  for (const dir of dirs) fs.writeFileSync(path.join(dir, 'fake-kokoro-mode.json'), JSON.stringify(mode))
}

function withProvider(workspace, fn, options = {}) {
  const supervisor = makeSupervisor(workspace, options.workerArgs || [])
  const provider = createKokoroProvider({
    supervisor,
    requestTimeoutMs: options.requestTimeoutMs || 120000,
    modelIdentity: 'Kokoro-82M-v1.0',
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

function request(text = 'Hello from Kokoro.', extra = {}) {
  return {
    request: { text, voiceId: 'af-demo', language: 'en-US', emotion: 'neutral', ...extra },
    context: { taskId: 'task-kokoro-1' },
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

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

test('Kokoro starts statically and exposes only the trusted preset voices/languages', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      assert.equal(provider.manifest().id, 'kokoro-local')
      assert.equal(provider.manifest().capabilities.clone.supported, false)
      assert.equal(provider.manifest().capabilities.emotion.supported, false)
      assert.deepEqual(provider.discovery().voices.map((voice) => voice.id).sort(), ['af-demo', 'zf-demo'])
      assert.deepEqual(provider.discovery().languages.sort(), ['en-US', 'zh-CN'])
      assert.equal(provider.manifest().capabilities.formats[0].sampleRate, 24000)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'kmodel').length, 0)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'infer').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro maps a preset voice, CPU pipeline and 24 kHz output', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const { request: req, context } = request('Hello Kokoro.')
      setFakeMode(workspace, {})
      const result = await provider.synthesize(req, context)
      assert.equal(result.ok, true, JSON.stringify({ code: result.code, kokoroCode: result.kokoroCode, terminal: result.terminal }))
      assert.equal(result.result.sampleRate, 24000)
      assert.equal(result.result.mime, 'audio/wav')
      assert.equal(result.persisted, false)
      const calls = fakeCalls(workspace)
      const kmodel = calls.find((call) => call.event === 'kmodel')
      assert.ok(kmodel)
      assert.equal(kmodel.config.includes('wv-kokoro-snap-'), true)
      assert.equal(kmodel.offlineEnv.HF_HUB_OFFLINE, '1')
      const inferred = calls.find((call) => call.event === 'infer')
      assert.equal(inferred.lang, 'a')
      assert.equal(inferred.text, 'Hello Kokoro.')
      assert.equal(inferred.speed, 1.0)
      assert.equal(inferred.voice.endsWith('.pt'), true)
      assert.equal(inferred.voiceSha256, sha256(fs.readFileSync(path.join(workspace.voices, 'af-demo.pt'))))
    })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro merges multiple generated chunks with bounded silence', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { chunks: 2 })
      const { request: req, context } = request('Two chunks.')
      const result = await provider.synthesize(req, context)
      assert.equal(result.ok, true, JSON.stringify(result.code || result.kokoroCode))
      assert.equal(result.result.durationMs >= 200, true)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'infer').length, 1)
    })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro refuses missing voices/languages and clone requests before the SDK', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const unknown = await provider.synthesize(
        { text: 'Bad voice', voiceId: 'missing', language: 'en-US', emotion: 'neutral' },
        { taskId: 'task-kokoro-bad' },
      )
      assert.equal(unknown.ok, false)
      const clone = await provider.synthesize(
        { text: 'Clone', language: 'en-US', emotion: 'neutral' },
        { taskId: 'task-kokoro-clone', binding: { kind: 'clone', voiceId: 'af-demo' } },
      )
      assert.equal(clone.ok, false)
      assert.equal(clone.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'infer').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro refuses a changed config or voice tensor before the SDK', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      fs.appendFileSync(path.join(workspace.model, 'config.json'), ' ')
      const badConfig = await provider.synthesize(...Object.values(request()))
      assert.equal(badConfig.ok, false)
      assert.equal(fakeCalls(workspace).filter((call) => call.event === 'kmodel').length, 0)
    })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro cancellation during loading never promotes completion and reloads next time', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider, supervisor }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadDelayMs: 700 })
      const { request: req, context } = request('Cancel loading.')
      const begun = await provider.beginSynthesis(req, context)
      assert.equal(begun.ok, true, JSON.stringify(begun))
      await waitFor(() => fakeCalls(workspace).some((call) => call.event === 'kmodel'), 10000)
      const ack = await begun.cancel()
      assert.equal(ack.ok, true, JSON.stringify(ack))
      assert.equal(ack.confirmed, true)
      const result = await begun.result
      assert.equal(result.ok, false)
      assert.equal(result.cancelled, true)
      await waitFor(() => supervisor.state().lateResponses >= 1, 10000)
      setFakeMode(workspace, {})
      const second = await provider.synthesize(
        { text: 'After cancel', voiceId: 'af-demo', language: 'en-US', emotion: 'neutral' },
        { taskId: 'task-kokoro-cancel' },
      )
      assert.equal(second.ok, true, JSON.stringify(second.code || second.kokoroCode))
    })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro timeout becomes UNKNOWN without retry', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadDelayMs: 1500 })
      const { request: req, context } = request('Timeout.')
      const result = await provider.synthesize(req, context)
      assert.equal(result.ok, false)
      assert.equal(result.terminal, 'UNKNOWN')
      assert.equal(result.code, PROVIDER_ERRORS.TIMEOUT)
    }, { requestTimeoutMs: 300 })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro maps load errors, missing G2P and empty audio to honest failures', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      setFakeMode(workspace, { loadError: true })
      const load = await provider.synthesize(...Object.values(request('Load error.')))
      assert.equal(load.ok, false)
      assert.equal(load.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
      setFakeMode(workspace, { g2pError: true })
      const g2p = await provider.synthesize(...Object.values(request('G2P error.')))
      assert.equal(g2p.ok, false)
      assert.equal(g2p.code, PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE, JSON.stringify({ code: g2p.code, kokoroCode: g2p.kokoroCode }))
      setFakeMode(workspace, { noAudio: true })
      const empty = await provider.synthesize(...Object.values(request('No audio.')))
      assert.equal(empty.ok, false)
      assert.equal(empty.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    })
  } finally {
    workspace.dispose()
  }
})

test('Kokoro stops cleanly and reports missing package honestly', { skip: pythonSkip, timeout: 120000 }, async () => {
  const workspace = makeWorkspace()
  try {
    await withProvider(workspace, async ({ provider }) => {
      const started = await provider.start()
      assert.equal(started.ok, true, JSON.stringify(started))
      const { request: req, context } = request('Cleanup.')
      const result = await provider.synthesize(req, context)
      assert.equal(result.ok, true, JSON.stringify(result.code || result.kokoroCode))
    })
    assert.equal(fs.readdirSync(workspace.tmpRoot).length, 0)
    fs.rmSync(path.join(workspace.runtime, 'kokoro'), { recursive: true, force: true })
    await withProvider(workspace, async ({ supervisor }) => {
      const started = await supervisor.start()
      assert.equal(started.ok, false)
      assert.equal(started.code, KOKORO_ERRORS.DEPENDENCY_MISSING)
    })
  } finally {
    workspace.dispose()
  }
})
