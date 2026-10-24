import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, after } from 'node:test'

import { createDetector, detectQwen } from '../core/detect.mjs'
import { createCoreServer } from '../core/server.mjs'
import { fetchJson } from '../core/http.mjs'
import { installHostBridge, apply as applyHost } from '../index.js'

const roots = []
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'whale-core-'))
  roots.push(root)
  return root
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value), 'utf8')
}
async function wechatFixture(version = '0.3.9') {
  const root = await fixture()
  await writeJson(path.join(root, 'app/resources/project/package.json'), { name: 'wechatagent-runtime', version })
  await writeJson(path.join(root, 'data/workspace/config/wechatagent.json'), {
    version: 1, hook: { baseUrl: 'http://127.0.0.1:30001', expectedVersion: '4.1.10.27' },
  })
  await writeJson(path.join(root, 'data/workspace/state/runtime.json'), {
    reader: { pid: process.pid }, bridge: { pid: process.pid }, adapter: { pid: process.pid },
  })
  return root
}
async function senderFixture(version = '0.1.0') {
  const root = await fixture()
  await writeJson(path.join(root, 'service/package.json'), { name: 'voice-sender-service', version })
  await writeJson(path.join(root, 'service/service.config.json'), { port: 43371, host: '127.0.0.1' })
  await writeJson(path.join(root, 'service/runtime/service.json'), { pid: process.pid, port: 43371 })
  return root
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
function fakeFetch(handler) {
  const calls = []
  const impl = async (url, options) => {
    calls.push({ url: String(url), method: options && options.method })
    return handler(String(url), options)
  }
  impl.calls = calls
  return impl
}

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

test('no configured roots fails closed and never completes', async () => {
  const detector = createDetector({
    env: { DSH_HOME: await fixture() },
    fetchImpl: fakeFetch(() => response(500, {})),
  })
  const status = await detector.detectAll()
  assert.equal(status.schemaVersion, 1)
  assert.equal(status.completed, false)
  assert.equal(status.wechatAgent.state, 'not_configured')
  assert.equal(status.sender.state, 'not_configured')
  assert.equal(status.tts.preview.ok, false)
  assert.equal(status.stale, false)
})

test('empty configured roots report not installed, not online', async () => {
  const wa = await fixture()
  const sender = await fixture()
  const detector = createDetector({
    config: { wechatAgentRoot: wa, senderRoot: sender, qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: fakeFetch(() => response(500, {})),
    timeoutMs: 100,
  })
  const status = await detector.detectAll()
  assert.equal(status.wechatAgent.installed, false)
  assert.equal(status.wechatAgent.connected, false)
  assert.equal(status.sender.installed, false)
  assert.equal(status.completed, false)
})

test('401 from health is classified as auth_required, not connected/healthy', async () => {
  const wa = await wechatFixture()
  const sender = await senderFixture()
  const detector = createDetector({
    config: { wechatAgentRoot: wa, senderRoot: sender, qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: fakeFetch(() => response(401, { error: 'Unauthorized' })),
    timeoutMs: 100,
  })
  const status = await detector.detectAll()
  assert.equal(status.wechatAgent.installed, true)
  assert.equal(status.wechatAgent.version, '0.3.9')
  assert.equal(status.wechatAgent.connected, false)
  assert.equal(status.wechatAgent.bridge, 'auth_required')
  assert.equal(status.sender.installed, true)
  assert.equal(status.sender.processRunning, true)
  assert.equal(status.sender.healthy, null)
  assert.equal(status.sender.health, 'auth_required')
  assert.equal(status.completed, false)
})

test('account verification is explicit, not inferred from an account object', async () => {
  const wa = await wechatFixture()
  const sender = await senderFixture()
  async function detect(health) {
    const detector = createDetector({
      config: { wechatAgentRoot: wa, senderRoot: sender, qwenUrl: 'http://127.0.0.1:8765' },
      fetchImpl: fakeFetch((url) => url.includes('/WeChatAgent/health') ? response(200, health) : response(401, {})),
      timeoutMs: 100,
    })
    return (await detector.detectAll()).wechatAgent
  }
  const connected = {
    integration: 'WeChatAgent-1', backend: 'wechat-hook', startupState: 'ready',
    version: '4.1.10.27',
  }
  assert.equal((await detect({ ...connected, account: {} })).accountVerified, null)
  assert.equal((await detect({ ...connected, account: { nickname: 'fixture' } })).accountVerified, null)
  assert.equal((await detect({ ...connected, accountVerified: true })).accountVerified, true)
  assert.equal((await detect({ ...connected, accountVerified: false })).accountVerified, false)
  const auth = createDetector({
    config: { wechatAgentRoot: wa, senderRoot: sender, qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: fakeFetch(() => response(401, {})),
    timeoutMs: 100,
  })
  assert.equal((await auth.detectAll()).wechatAgent.accountVerified, null)
})

test('version mismatch is visible and cannot be marked compatible', async () => {
  const wa = await wechatFixture('0.4.0')
  const detector = createDetector({
    config: { wechatAgentRoot: wa, senderRoot: await fixture(), qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: fakeFetch(() => response(401, {})),
    timeoutMs: 100,
  })
  const status = await detector.detectAll()
  assert.equal(status.wechatAgent.state, 'incompatible')
  assert.equal(status.wechatAgent.compatibility, 'unknown')
  assert.equal(status.wechatAgent.connected, false)
})

test('health timeout wins even when a fetch implementation ignores abort', async () => {
  const detector = createDetector({
    config: { wechatAgentRoot: await wechatFixture(), senderRoot: await senderFixture(), qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: () => new Promise(() => {}),
    timeoutMs: 30,
  })
  const status = await detector.detectAll()
  assert.equal(status.wechatAgent.state, 'timeout')
  assert.equal(status.sender.state, 'timeout')
  assert.equal(status.tts.state, 'timeout')
})

test('qwen read-only health accepts model/voice but never previews audio', async () => {
  const fetchImpl = fakeFetch(() => response(200, { ok: true, model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1' }))
  const qwen = await detectQwen({ qwenUrl: 'http://127.0.0.1:8765' }, { fetchImpl, timeoutMs: 100 })
  assert.equal(qwen.state, 'ok')
  assert.equal(qwen.reachable, true)
  assert.equal(qwen.model, 'Qwen3-TTS-12Hz-1.7B-Base')
  assert.equal(qwen.preview.ok, false)
  assert.equal(fetchImpl.calls.every((c) => c.method === 'GET'), true)
})

test('concurrent detection marks stale results instead of overwriting', async () => {
  const wa = await wechatFixture()
  const sender = await senderFixture()
  const fetchImpl = fakeFetch(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
    return response(401, {})
  })
  const detector = createDetector({
    config: { wechatAgentRoot: wa, senderRoot: sender, qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl, timeoutMs: 500,
  })
  const first = detector.detectAll()
  const second = detector.detectAll()
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.stale, true)
  assert.equal(b.stale, false)
  assert.equal(detector.isCurrent(b.generation), true)
})

test('core server requires its token and rejects writes / arbitrary components', async () => {
  const wa = await wechatFixture()
  const core = createCoreServer({
    token: 'test-token',
    detector: createDetector({
      config: { wechatAgentRoot: wa, senderRoot: await fixture(), qwenUrl: 'http://127.0.0.1:8765' },
      fetchImpl: fakeFetch(() => response(401, {})),
      timeoutMs: 100,
    }),
  })
  const address = await core.listen(0)
  const base = 'http://127.0.0.1:' + address.port
  try {
    let res = await fetch(base + '/setup/status')
    assert.equal(res.status, 401)
    res = await fetch(base + '/setup/status', { headers: { 'x-whale-core-token': 'test-token' } })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.schemaVersion, 1)
    res = await fetch(base + '/setup/config', { headers: { 'x-whale-core-token': 'test-token' } })
    assert.equal(res.status, 200)
    const config = await res.json()
    assert.equal(config.schemaVersion, 1)
    assert.equal(config.readMode, 'read-only')
    res = await fetch(base + '/setup/config?path=C:/etc/passwd', { headers: { 'x-whale-core-token': 'test-token' } })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).readMode, 'read-only')
    res = await fetch(base + '/setup/config/sources', { headers: { 'x-whale-core-token': 'test-token' } })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray((await res.json()).sources))
    res = await fetch(base + '/setup/config/status', { headers: { 'x-whale-core-token': 'test-token' } })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).schemaVersion, 1)
    res = await fetch(base + '/setup/config')
    assert.equal(res.status, 401)
    res = await fetch(base + '/setup/detect?component=../../etc/passwd', { headers: { 'x-whale-core-token': 'test-token' } })
    assert.equal(res.status, 400)
    res = await fetch(base + '/setup/status', { method: 'POST', headers: { 'x-whale-core-token': 'test-token' } })
    assert.equal(res.status, 405)
    res = await fetch(base + '/setup/status', { headers: { 'x-whale-core-token': 'test-token', 'sec-fetch-site': 'cross-site' } })
    assert.equal(res.status, 403)
    const origin = 'http://127.0.0.1:' + address.port
    res = await fetch(base + '/setup/status', { headers: { 'x-whale-core-token': 'test-token', origin } })
    assert.equal(res.status, 200)
    res = await fetch(base + '/setup/status', { headers: { 'x-whale-core-token': 'test-token', origin: 'https://127.0.0.1:' + address.port } })
    assert.equal(res.status, 403)
    res = await fetch(base + '/setup/status', { headers: { 'x-whale-core-token': 'test-token', origin: 'http://127.0.0.1:' + (address.port + 1) } })
    assert.equal(res.status, 403)
    res = await fetch(base + '/setup/status', { headers: { origin } })
    assert.equal(res.status, 401)
  } finally {
    await core.close()
  }
})

test('healthy evidence still cannot claim setup completion or preview', async () => {
  const wa = await wechatFixture()
  const sender = await senderFixture()
  const fetchImpl = fakeFetch((url) => {
    if (url.includes('/WeChatAgent/health')) {
      return response(200, { integration: 'WeChatAgent-1', backend: 'wechat-hook', startupState: 'ready', version: '4.1.10.27' })
    }
    if (url.endsWith('/health')) {
      return response(200, { ok: true, service: 'voice-sender', queue: { pending: 0 } })
    }
    return response(404, {})
  })
  const detector = createDetector({
    config: { wechatAgentRoot: wa, senderRoot: sender, qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl, timeoutMs: 100,
  })
  const status = await detector.detectAll()
  assert.equal(status.wechatAgent.connected, true)
  assert.equal(status.sender.healthy, true)
  assert.equal(status.completed, false)
  assert.equal(status.tts.preview.ok, false)
  assert.equal(status.voiceEnabled, null)
})

test('detector source has no shell, write or installer side effects', () => {
  const source = readFileSync(new URL('../core/detect.mjs', import.meta.url), 'utf8')
  const httpSource = readFileSync(new URL('../core/http.mjs', import.meta.url), 'utf8')
  for (const forbidden of ['child_process', 'execFile', 'spawn(', 'writeFile', 'mkdir(', 'unlink(', 'rename(', 'createWriteStream']) {
    assert.equal(source.includes(forbidden), false, 'forbidden detector primitive: ' + forbidden)
  }
  assert.match(httpSource, /method: 'GET'/)
  assert.match(httpSource, /maxBytes/)
  assert.match(source, /voiceEnabled: null/)
})

test('HTTP deadline covers a hanging response body and cancels it', async () => {
  let cancelled = 0
  const body = {
    getReader() {
      return {
        read() { return new Promise(() => {}) },
        cancel() { cancelled++ },
        releaseLock() {},
      }
    },
    cancel() { cancelled++ },
  }
  const result = await fetchJson(async () => ({ status: 200, ok: true, body }), 'http://127.0.0.1:8765/health', { timeoutMs: 30, maxBytes: 32 })
  assert.equal(result.state, 'timeout')
  assert.equal(cancelled > 0, true)
})

test('HTTP body limit is enforced while streaming and cancels the reader', async () => {
  let cancelled = 0
  const body = {
    getReader() {
      let sent = false
      return {
        async read() {
          if (sent) return { done: true }
          sent = true
          return { done: false, value: new Uint8Array(64) }
        },
        cancel() { cancelled++ },
        releaseLock() {},
      }
    },
    cancel() { cancelled++ },
  }
  const result = await fetchJson(async () => ({ status: 200, ok: true, body }), 'http://127.0.0.1:8765/health', { timeoutMs: 100, maxBytes: 16 })
  assert.equal(result.state, 'oversize')
  assert.equal(cancelled > 0, true)
})

test('HTTP response without a streaming reader fails closed', async () => {
  const result = await fetchJson(async () => ({
    status: 200,
    ok: true,
    headers: { get() { return '4' } },
    async text() { return '{"ok":true}' },
  }), 'http://127.0.0.1:8765/health', { timeoutMs: 100, maxBytes: 16 })
  assert.equal(result.state, 'unsupported')
  assert.equal(result.error, 'body_stream_unsupported')
})

test('HTTP array response is returned without treating it as a service object', async () => {
  const result = await fetchJson(async () => response(200, '[{"unexpected":true}]'), 'http://127.0.0.1:8765/health', { timeoutMs: 100 })
  assert.equal(result.state, 'ok')
  assert.equal(Array.isArray(result.body), true)
})

test('HTTP non-JSON, redirect, auth and not-found states are explicit', async () => {
  const nonJson = await fetchJson(async () => response(200, 'not json'), 'http://127.0.0.1:8765/health', { timeoutMs: 100 })
  assert.equal(nonJson.state, 'invalid_json')
  const redirect = await fetchJson(async () => response(302, {}), 'http://127.0.0.1:8765/health', { timeoutMs: 100 })
  assert.equal(redirect.state, 'redirect')
  const auth = await fetchJson(async () => response(401, {}), 'http://127.0.0.1:8765/health', { timeoutMs: 100 })
  assert.equal(auth.state, 'auth_required')
  const forbidden = await fetchJson(async () => response(403, {}), 'http://127.0.0.1:8765/health', { timeoutMs: 100 })
  assert.equal(forbidden.state, 'auth_required')
  const missing = await fetchJson(async () => response(404, {}), 'http://127.0.0.1:8765/health', { timeoutMs: 100 })
  assert.equal(missing.state, 'unsupported')
})

test('HTTP fetch that never returns is bounded by the deadline', async () => {
  const result = await fetchJson(() => new Promise(() => {}), 'http://127.0.0.1:8765/health', { timeoutMs: 30 })
  assert.equal(result.state, 'timeout')
})

test('host bridge fails closed without connection and follows replacement', async () => {
  const routes = []
  const rows = []
  let connection = { requestRejection() { return null } }
  let disposedRoutes = 0
  let disposedInject = 0
  const scope = {
    webServer: {
      register(route) { routes.push(route); return () => { disposedRoutes++ } },
      tapIndex() { return () => {} },
    },
    get(name) { return name === 'connection' ? connection : null },
    on(name, callback) {
      if (name === 'webserver/index-inject') callback(rows)
      return () => { disposedInject++ }
    },
    effect() {},
  }
  const detector = createDetector({
    config: { wechatAgentRoot: await fixture(), senderRoot: await fixture(), qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: fakeFetch(() => response(500, {})),
    timeoutMs: 100,
  })
  const host = installHostBridge(scope, { token: 'lifecycle-token', detector })
  const route = routes.find((r) => r.path === '/whale-voice/setup/status')
  const call = async () => {
    const res = { status: null, body: '', writeHead(code) { this.status = code }, end(text) { this.body = text } }
    await route.handler({
      method: 'GET', url: '/whale-voice/setup/status', socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:59575', 'x-whale-core-token': 'lifecycle-token' },
    }, res)
    return res.status
  }
  assert.equal(await call(), 200)
  connection = null
  assert.equal(await call(), 503)
  connection = { requestRejection() { return 401 } }
  assert.equal(await call(), 401)
  connection = { requestRejection() { return null } }
  assert.equal(await call(), 200)
  host.dispose()
  assert.equal(disposedRoutes, 6)
  assert.equal(disposedInject, 1)
})

test('host plugin injects only after webServer and connection are available', () => {
  const seen = []
  const scope = {
    webServer: { register() { return () => {} }, tapIndex() { return () => {} } },
    get() { return { requestRejection() { return null } } },
    on() { return () => {} },
    effect() {},
  }
  applyHost({ inject(services, callback) { seen.push(services.slice()); callback(scope) } })
  assert.deepEqual(seen, [['webServer', 'connection']])
})

test('host bridge injects a token-protected bridge and same-origin route', async () => {
  const routes = []
  const rows = []
  const scope = {
    webServer: {
      register(route) { routes.push(route); return () => {} },
      tapIndex() { return () => {} },
    },
    get() {
      return { requestRejection() { return null } }
    },
    on(name, callback) {
      if (name === 'webserver/index-inject') callback(rows)
      return () => {}
    },
    effect() {},
  }
  const detector = createDetector({
    config: { wechatAgentRoot: await fixture(), senderRoot: await fixture(), qwenUrl: 'http://127.0.0.1:8765' },
    fetchImpl: fakeFetch(() => response(500, {})),
    timeoutMs: 100,
  })
  const host = installHostBridge(scope, { token: 'host-token', detector })
  assert.equal(rows.length, 1)
  assert.match(rows[0].text, /window\.__WHALE_SETUP__/)
  assert.match(rows[0].text, /prefix \+ path/)
  assert.match(rows[0].text, /getStatus: \(\) => call\('\/status'\)/)
  assert.equal(host.scripts.includes('host-token'), true)

  const route = routes.find((r) => r.path === '/whale-voice/setup/status')
  const response = { status: null, body: '', writeHead(code) { this.status = code }, end(text) { this.body = text } }
  await route.handler({
    method: 'GET', url: '/whale-voice/setup/status', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:59575', 'x-whale-core-token': 'host-token' },
  }, response)
  assert.equal(response.status, 200)
  assert.equal(JSON.parse(response.body).schemaVersion, 1)

  const originOk = { status: null, body: '', writeHead(code) { this.status = code }, end(text) { this.body = text } }
  await route.handler({
    method: 'GET', url: '/whale-voice/setup/status', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:59575', 'x-whale-core-token': 'host-token', origin: 'http://127.0.0.1:59575' },
  }, originOk)
  assert.equal(originOk.status, 200)
  const originWrongScheme = { status: null, body: '', writeHead(code) { this.status = code }, end(text) { this.body = text } }
  await route.handler({
    method: 'GET', url: '/whale-voice/setup/status', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:59575', 'x-whale-core-token': 'host-token', origin: 'https://127.0.0.1:59575' },
  }, originWrongScheme)
  assert.equal(originWrongScheme.status, 403)

  const denied = { status: null, body: '', writeHead(code) { this.status = code }, end(text) { this.body = text } }
  await route.handler({
    method: 'GET', url: '/whale-voice/setup/status', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:59575' },
  }, denied)
  assert.equal(denied.status, 401)
})
