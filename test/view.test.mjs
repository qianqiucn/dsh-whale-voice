import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, after } from 'node:test'

import { createDetector, detectQwen } from '../core/detect.mjs'
import { deriveSetupView } from '../core/view.mjs'

const roots = []
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'whale-view-'))
  roots.push(root)
  return root
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value), 'utf8')
}
async function components() {
  const wa = await fixture()
  await writeJson(path.join(wa, 'app/resources/project/package.json'), { name: 'wechatagent-runtime', version: '0.3.9' })
  await writeJson(path.join(wa, 'data/workspace/config/wechatagent.json'), {
    hook: { baseUrl: 'http://127.0.0.1:30001', expectedVersion: '4.1.10.27' },
  })
  await writeJson(path.join(wa, 'data/workspace/state/runtime.json'), {
    reader: { pid: process.pid }, bridge: { pid: process.pid }, adapter: { pid: process.pid },
  })
  const sender = await fixture()
  await writeJson(path.join(sender, 'service/package.json'), { name: 'voice-sender-service', version: '0.1.0' })
  await writeJson(path.join(sender, 'service/service.config.json'), { port: 43371 })
  await writeJson(path.join(sender, 'service/runtime/service.json'), { pid: process.pid })
  return { wechatAgentRoot: wa, senderRoot: sender, qwenUrl: 'http://127.0.0.1:8765' }
}
function response(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    status,
    ok: status >= 200 && status < 300,
    body: {
      getReader() {
        let sent = false
        return {
          async read() {
            if (sent) return { done: true }
            sent = true
            return { done: false, value: new TextEncoder().encode(text) }
          },
          async cancel() {},
          releaseLock() {},
        }
      },
    },
    async text() { return text },
  }
}
function healthyFetch() {
  return async (url) => {
    url = String(url)
    if (url.includes('/WeChatAgent/health')) {
      return response(200, { integration: 'WeChatAgent-1', backend: 'wechat-hook', startupState: 'ready' })
    }
    if (url.includes('/health') && url.includes('8765')) {
      return response(200, { ok: true, model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1' })
    }
    return response(200, { ok: true, service: 'voice-sender', queue: { pending: 0 } })
  }
}
function senderRejectFetch() {
  return async (url) => {
    url = String(url)
    if (url.includes('/WeChatAgent/health')) return response(200, { integration: 'WeChatAgent-1', backend: 'wechat-hook', startupState: 'ready' })
    if (url.includes('8765')) return response(200, { ok: true, model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1' })
    return response(401, { ok: false, error: 'unauthorized' })
  }
}

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

test('unconfigured components stay unknown, not failed or installed', async () => {
  const detector = createDetector({
    config: { wechatAgentRoot: '', senderRoot: '', qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: async () => response(500, {}),
    timeoutMs: 100,
  })
  const status = await detector.detectAll()
  const view = deriveSetupView(status)
  assert.equal(view.wechat.installedState, 'unknown')
  assert.equal(view.wechat.connectedState, 'unknown')
  assert.equal(view.sender.installedState, 'unknown')
  assert.equal(view.sender.processState, 'unknown')
  assert.equal(view.sender.healthReachableState, 'unknown')
  assert.equal(view.sender.ready, 'unknown')
  assert.equal(view.advance.sender, false)
  assert.equal(view.checks.find((c) => c.id === 'sender').state, 'unknown')
  assert.equal(view.checks.find((c) => c.id === 'wechat').state, 'unknown')
})

test('Core sender health ok + healthy true drives the sender step', async () => {
  const status = await createDetector({ config: await components(), fetchImpl: healthyFetch(), timeoutMs: 100 }).detectAll()
  assert.equal(status.sender.health, 'ok')
  assert.equal(status.sender.healthState, 'ok')
  assert.equal(status.sender.healthReachable, true)
  assert.equal(status.sender.healthy, true)

  const view = deriveSetupView(status)
  assert.equal(view.sender.installed, true)
  assert.equal(view.sender.processRunning, true)
  assert.equal(view.sender.healthReachable, true)
  assert.equal(view.sender.healthy, true)
  assert.equal(view.sender.ready, 'pass')
  assert.equal(view.advance.sender, true)
  assert.equal(view.components.find((c) => c.id === 'sender').healthy, true)
})

test('401 sender is reachable but not healthy and blocks the step', async () => {
  const status = await createDetector({ config: await components(), fetchImpl: senderRejectFetch(), timeoutMs: 100 }).detectAll()
  assert.equal(status.sender.healthState, 'auth_required')
  assert.equal(status.sender.healthReachable, true)
  assert.equal(status.sender.healthy, null)

  const view = deriveSetupView(status)
  assert.equal(view.sender.installed, true)
  assert.equal(view.sender.processRunning, true)
  assert.equal(view.sender.healthReachable, true)
  assert.equal(view.sender.healthyState, 'unknown')
  assert.equal(view.sender.ready, 'unknown')
  assert.equal(view.advance.sender, false)
  assert.equal(view.checks.find((c) => c.id === 'sender').state, 'unknown')
})

test('null recovery stays unknown; only explicit false passes', async () => {
  const status = await createDetector({ config: await components(), fetchImpl: healthyFetch(), timeoutMs: 100 }).detectAll()
  assert.equal(status.sender.recoveryPending, null)
  let view = deriveSetupView(status)
  assert.equal(view.sender.recoveryState, 'unknown')
  assert.equal(view.checks.find((c) => c.id === 'recovery').state, 'unknown')

  status.sender.recoveryPending = false
  view = deriveSetupView(status)
  assert.equal(view.sender.recoveryState, 'pass')
  assert.equal(view.checks.find((c) => c.id === 'recovery').state, 'pass')

  status.sender.recoveryPending = true
  view = deriveSetupView(status)
  assert.equal(view.sender.recoveryState, 'fail')
})

test('completion requires every explicit check and a known voice switch', async () => {
  const status = await createDetector({ config: await components(), fetchImpl: healthyFetch(), timeoutMs: 100 }).detectAll()
  status.completed = true
  status.voiceEnabled = false
  status.tts.configured = true
  status.tts.preview = { ok: true }
  status.sender.recoveryPending = false

  let view = deriveSetupView(status)
  assert.equal(view.checks.every((c) => c.state === 'pass'), true)
  assert.equal(view.complete, true)

  status.voiceEnabled = null
  view = deriveSetupView(status)
  assert.equal(view.checks.find((c) => c.id === 'voice-switch').state, 'unknown')
  assert.equal(view.complete, false)

  status.voiceEnabled = false
  status.sender.recoveryPending = null
  view = deriveSetupView(status)
  assert.equal(view.checks.find((c) => c.id === 'recovery').state, 'unknown')
  assert.equal(view.complete, false)
})

test('Qwen negative responses are invalid, not a reachable Qwen', async () => {
  const base = { qwenUrl: 'http://127.0.0.1:8765' }
  for (const body of [
    { ok: false },
    { ok: true, service: 'unrelated-service' },
    { ok: true, model: '', voice: 'whale-v1' },
    { ok: true, model: 'Qwen3-TTS', voice: '' },
    [],
    { error: 'not_found' },
  ]) {
    const qwen = await detectQwen(base, { fetchImpl: async () => response(200, body), timeoutMs: 100 })
    assert.notEqual(qwen.state, 'ok')
    assert.equal(qwen.reachable, true)
    assert.equal(qwen.configured, false)
    assert.equal(qwen.preview.ok, false)
    assert.equal(qwen.model, null)
  }
})

test('invalid Qwen is not advertised in the provider summary', async () => {
  const config = await components()
  const fetchImpl = async (url) => {
    url = String(url)
    if (url.includes('/WeChatAgent/health')) return response(401, {})
    if (url.includes('/health') && url.includes('8765')) return response(200, { ok: true, service: 'unrelated-service' })
    return response(401, {})
  }
  const status = await createDetector({ config, fetchImpl, timeoutMs: 100 }).detectAll()
  assert.equal(status.qwen.state, 'invalid_response')
  assert.equal(status.tts.state, 'invalid_response')
  assert.equal(status.tts.provider, null)
  assert.deepEqual(status.tts.available, [])
  const view = deriveSetupView(status)
  assert.equal(view.tts.provider, null)
  assert.equal(view.tts.configured, false)
})

test('Qwen service and model/voice evidence is accepted without inventing fields', async () => {
  const qwen = await detectQwen({ qwenUrl: 'http://127.0.0.1:8765' }, {
    fetchImpl: async () => response(200, { ok: true, model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1' }),
    timeoutMs: 100,
  })
  assert.equal(qwen.state, 'ok')
  assert.equal(qwen.reachable, true)
  assert.equal(qwen.model, 'Qwen3-TTS-12Hz-1.7B-Base')
  assert.equal(qwen.voice, 'whale-v1')
  assert.equal(qwen.preview.ok, false)
})
