/* Plan10 10-A — 095 focused repair evidence (121-R01..R05).
 *
 * These tests reproduce the 0121 review counterexamples against the real supervisor/adapter/Fake
 * worker path: capability intersection, cancellation facts, occupancy correlation and the
 * start/stop race. R01 resource revalidation and loading-boundary tests live in
 * `qwen-official-worker.test.mjs` because they need the real Python worker.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn as nodeSpawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PROVIDER_ERRORS } from '../core/tts/provider-contract.mjs'
import { QWEN_ERRORS } from '../core/tts/qwen-contract.mjs'
import { createQwenSupervisor } from '../core/tts/qwen-supervisor.mjs'
import { createQwenProvider } from '../core/tts/qwen-adapter.mjs'

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

function makeSupervisor(mode, extra = {}) {
  return createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args: [`--mode=${mode}`, ...(extra.args || [])] },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 200,
    killWaitMs: 300,
    ...(extra.supervisor || {}),
  })
}

async function withProvider(mode, options = {}, fn) {
  const supervisor = makeSupervisor(mode, options)
  const provider = createQwenProvider({
    supervisor,
    requestTimeoutMs: options.requestTimeoutMs === undefined ? 5000 : options.requestTimeoutMs,
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

function synthPayload(requestId) {
  return {
    requestId,
    text: '修复验证',
    model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
    backend: 'custom-voice',
    modality: 'preset',
    voiceId: 'demo-voice-a',
    language: 'zh-CN',
    emotion: 'neutral',
    format: { mime: 'audio/wav', sampleRate: 24000, channels: 1 },
    maxBytes: 1048576,
  }
}

test('121-R02 a conflicting per-voice language is skipped, not widened to the global list', { skip: spawnSkip }, async () => {
  await withProvider('voice-language-conflict', {}, async ({ provider }) => {
    const started = await provider.start()
    assert.equal(started.ok, true, JSON.stringify(started))
    const voices = provider.manifest().capabilities.voices
    assert.deepEqual(voices.map((voice) => voice.id), ['demo-voice-b'])
    assert.deepEqual(voices[0].languages, ['zh-CN'])
    const conflicted = await provider.synthesize(
      { text: '冲突语言', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-language-conflict' },
    )
    assert.equal(conflicted.ok, false)
    assert.equal(conflicted.code, PROVIDER_ERRORS.UNSUPPORTED_VOICE)
    const compatible = await provider.synthesize(
      { text: '兼容语言', voiceId: 'demo-voice-b', language: 'zh-CN' },
      { taskId: 'task-language-conflict' },
    )
    assert.equal(compatible.ok, true, JSON.stringify(compatible.code || compatible.qwenCode))
  })
})

test('121-R02 the published audio-duration cap rejects a longer produced artifact', { skip: spawnSkip }, async () => {
  await withProvider('tiny-audio', {}, async ({ provider }) => {
    const started = await provider.start()
    assert.equal(started.ok, true)
    assert.equal(provider.capabilities().limits.maxAudioSeconds, 1)
    const synthesized = await provider.synthesize(
      { text: '两秒音频', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-duration-cap' },
    )
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.code, PROVIDER_ERRORS.INVALID_RESPONSE)
    assert.equal(synthesized.qwenCode, QWEN_ERRORS.OUTPUT_TOO_LARGE)
  })
})

test('121-R02 a smaller published timeout wins over the provider configuration', { skip: spawnSkip }, async () => {
  await withProvider('tiny-timeout', { requestTimeoutMs: 1000 }, async ({ provider, supervisor }) => {
    const started = await provider.start()
    assert.equal(started.ok, true)
    assert.equal(provider.capabilities().limits.timeoutMs, 100)
    const begun = await provider.beginSynthesis(
      { text: '小期限', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-timeout-cap' },
    )
    assert.equal(begun.ok, true)
    assert.equal(begun.timeoutMs, 100)
    const result = await begun.result
    assert.equal(result.ok, false)
    assert.equal(result.code, PROVIDER_ERRORS.TIMEOUT)
    assert.equal(result.unknown, true)
  })
})

test('121-R03 a rejected cancel never fabricates a confirmed cancellation', { skip: spawnSkip }, async () => {
  await withProvider('cancel-reject', { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
    await provider.start()
    const begun = await provider.beginSynthesis(
      { text: '拒绝取消', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-cancel-reject' },
    )
    assert.equal(begun.ok, true)
    await waitFor(() => supervisor.state().activeOperations === 1)
    const ack = await begun.cancel()
    assert.equal(ack.ok, false)
    assert.equal(ack.confirmed, false)
    assert.equal(ack.workerRejected, true)
    const result = await begun.result
    assert.notEqual(result.cancelled, true)
    assert.equal(result.ok, true, JSON.stringify(result.code || result.qwenCode))
    assert.equal(supervisor.state().unresolvedOperations, 0)
  })
})

test('121-R03 a progress or wrong-identity acknowledgement is not a cancellation', { skip: spawnSkip }, async () => {
  for (const mode of ['progress-ack', 'wrong-ack-id']) {
    await withProvider(mode, { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
      await provider.start()
      const begun = await provider.beginSynthesis(
        { text: '非终止回执', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task-cancel-ack' },
      )
      assert.equal(begun.ok, true)
      await waitFor(() => supervisor.state().activeOperations === 1)
      const ack = await begun.cancel()
      assert.equal(ack.ok, false, mode)
      assert.equal(ack.confirmed, false, mode)
      assert.equal(ack.code, QWEN_ERRORS.CANCEL_NOT_CONFIRMED, mode)
      const result = await begun.result
      assert.equal(result.ok, true, mode)
      assert.notEqual(result.cancelled, true, mode)
    })
  }
})

test('121-R04 a never-issued message id cannot release an unconfirmed operation', { skip: spawnSkip }, async () => {
  for (const mode of ['ghost-error', 'ghost-result']) {
    await withProvider(mode, { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
      await provider.start()
      const begun = await provider.beginSynthesis(
        { text: '幽灵消息', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task-ghost-message' },
      )
      assert.equal(begun.ok, true)
      await waitFor(() => supervisor.state().activeOperations === 1)
      const ack = await begun.cancel()
      assert.equal(ack.ok, true, mode)
      assert.equal(ack.confirmed, true, mode)
      assert.equal(supervisor.state().unresolvedOperations, 1, mode)
      await waitFor(() => supervisor.state().lateResponses >= 1, 2000)
      assert.equal(supervisor.state().unresolvedOperations, 1, mode)
      const blocked = await provider.synthesize(
        { text: '不应派发', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task-ghost-message' },
      )
      assert.equal(blocked.ok, false, mode)
      assert.equal(blocked.blockedByUnresolved, true, mode)
    })
  }
})

test('121-R03 a cancel timeout or a claimed rejection does not clear the operation', { skip: spawnSkip }, async () => {
  await withProvider('cancel-ignore', { requestTimeoutMs: 5000 }, async ({ provider }) => {
    await provider.start()
    const begun = await provider.beginSynthesis(
      { text: '取消无回应', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-cancel-timeout' },
    )
    assert.equal(begun.ok, true)
    const ack = await begun.cancel()
    assert.equal(ack.ok, false)
    assert.equal(ack.confirmed, false)
    assert.equal(ack.unknown, true)
    assert.equal(ack.code, QWEN_ERRORS.UNKNOWN_RESULT)
    const result = await begun.result
    assert.equal(result.ok, true, JSON.stringify(result.code || result.qwenCode))
  })
  await withProvider('cancel-reject-claimed', { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
    await provider.start()
    const begun = await provider.beginSynthesis(
      { text: '拒绝但声称请求身份', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-cancel-claimed' },
    )
    assert.equal(begun.ok, true)
    await waitFor(() => supervisor.state().activeOperations === 1)
    const ack = await begun.cancel()
    assert.equal(ack.ok, false)
    assert.equal(ack.confirmed, false)
    const blocked = await provider.synthesize(
      { text: '不应重叠', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-cancel-claimed' },
    )
    assert.equal(blocked.ok, false)
    assert.equal(blocked.blockedByUnresolved, true)
    const result = await begun.result
    assert.equal(result.ok, true, JSON.stringify(result.code || result.qwenCode))
    assert.equal(supervisor.state().unresolvedOperations, 0)
  })
})

test('121-R04 a wrong-identity result or a wrong-type event keeps occupancy unresolved', { skip: spawnSkip }, async () => {
  for (const [mode, expectedQwenCode] of [
    ['wrong-identity', QWEN_ERRORS.RESPONSE_IDENTITY_MISMATCH],
    ['event-result', QWEN_ERRORS.RESPONSE_TYPE_MISMATCH],
  ]) {
    await withProvider(mode, { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
      await provider.start()
      const synthesized = await provider.synthesize(
        { text: '错误关联', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task-wrong-correlation' },
      )
      assert.equal(synthesized.ok, false, mode)
      assert.equal(synthesized.qwenCode, expectedQwenCode, mode)
      assert.equal(synthesized.unknown, true, mode)
      assert.equal(supervisor.state().unresolvedOperations, 1, mode)
      const blocked = await provider.synthesize(
        { text: '不应派发', voiceId: 'demo-voice-a', language: 'zh-CN' },
        { taskId: 'task-wrong-correlation' },
      )
      assert.equal(blocked.blockedByUnresolved, true, mode)
    })
  }
})

test('121-R04 a correctly correlated UNKNOWN terminal releases occupancy', { skip: spawnSkip }, async () => {
  await withProvider('unknown-terminal', { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
    await provider.start()
    const synthesized = await provider.synthesize(
      { text: '关联未知', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-unknown-release' },
    )
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.unknown, true)
    assert.equal(synthesized.terminal, 'UNKNOWN')
    assert.equal(supervisor.state().unresolvedOperations, 0)
    const next = await provider.synthesize(
      { text: '后续请求', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-unknown-release' },
    )
    assert.notEqual(next.blockedByUnresolved, true)
  })
})

test('121-R04 a wrong-claimed late message keeps the issued message id for a later real terminal', { skip: spawnSkip }, async () => {
  await withProvider('wrong-then-correct', { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
    await provider.start()
    const synthesized = await provider.synthesize(
      { text: '先错后对', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-wrong-then-correct' },
    )
    assert.equal(synthesized.ok, false)
    assert.equal(synthesized.qwenCode, QWEN_ERRORS.RESPONSE_IDENTITY_MISMATCH)
    await waitFor(() => supervisor.state().unresolvedOperations === 0, 3000)
    const next = await provider.synthesize(
      { text: '后续请求', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-wrong-then-correct' },
    )
    assert.notEqual(next.blockedByUnresolved, true)
  })
})

test('121-R04 a late progress event does not destroy a still-correlated operation', { skip: spawnSkip }, async () => {
  await withProvider('late-progress-then-cancel', { requestTimeoutMs: 5000 }, async ({ provider, supervisor }) => {
    await provider.start()
    const begun = await provider.beginSynthesis(
      { text: '迟到进度', voiceId: 'demo-voice-a', language: 'zh-CN' },
      { taskId: 'task-late-progress' },
    )
    assert.equal(begun.ok, true)
    await waitFor(() => supervisor.state().activeOperations === 1)
    const ack = await begun.cancel()
    assert.equal(ack.ok, true)
    assert.equal(ack.confirmed, true)
    assert.equal(supervisor.state().unresolvedOperations, 1)
    await waitFor(() => supervisor.state().lateResponses >= 2, 3000)
    assert.equal(supervisor.state().unresolvedOperations, 0)
  })
})

test('121-R05 a stop intent racing the handshake keeps admission closed', { skip: spawnSkip }, async () => {
  const capture = captureSpawn()
  const supervisor = createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: stubbornWorker, runtime: process.execPath, args: ['--hello-delay=500'] },
    handshakeTimeoutMs: 4000,
    shutdownGraceMs: 100,
    killWaitMs: 200,
    spawnProcess: capture.spawnProcess,
  })
  try {
    const starting = supervisor.start()
    await waitFor(() => supervisor.state().alive === true, 2000)
    const child = capture.child()
    child.kill = () => false
    const stopping = supervisor.stop()
    const [started, stopped] = await Promise.all([starting, stopping])
    assert.equal(stopped.ok, false)
    assert.equal(stopped.code, QWEN_ERRORS.EXIT_UNCONFIRMED)
    assert.equal(supervisor.state().alive, true)
    assert.equal(supervisor.state().accepting, false)
    assert.equal(supervisor.state().stopRequested, true)
    assert.equal(started.ok, false)
    assert.equal(started.code, QWEN_ERRORS.STOPPING)
    const rejected = await supervisor.synthesize(synthPayload('race-1'), { timeoutMs: 1000 })
    assert.equal(rejected.ok, false)
    assert.equal(rejected.code, QWEN_ERRORS.STOPPING)
  } finally {
    const pid = supervisor.state().pid
    if (pid) {
      try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
      await waitFor(() => supervisor.state().alive === false, 5000)
    }
    await supervisor.stop()
  }
})
