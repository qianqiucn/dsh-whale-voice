/* 182 / Plan 14 — adopt an already-installed WeChatAgent and use it immediately.
 *
 * The adoption owner is Whale Voice's own `%DSH_HOME%/whale-voice/core.json`; the tests use a
 * temporary sandbox as DSH_HOME and synthetic install directories. Nothing is installed, started,
 * logged in or authenticated, and no network/WeChat call is made.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import { bridgeScript, installHostBridge } from '../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { createDetector, maskPath, readCoreConfig } from '../core/detect.mjs'
import { adoptWeChatAgentRoot, readAdoption } from '../core/wechatagent-adoption.mjs'
import { inspectWeChatAgentRoot, resolveWeChatAgentDataHome } from '../packages/adapter-wechatagent/index.mjs'

const TOKEN = 'adoption-token'

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function makeInstall(root, { version = '0.3.9', dataHome = null, iniEncoding = 'utf8' } = {}) {
  writeJson(path.join(root, 'app', 'resources', 'project', 'package.json'), { name: 'wechat-agent', version })
  const data = dataHome || path.join(root, 'data')
  writeJson(path.join(data, 'workspace', 'config', 'wechatagent.json'), {
    hook: { baseUrl: 'http://127.0.0.1:9', expectedVersion: '4.1.10.27' },
  })
  writeJson(path.join(data, 'workspace', 'state', 'runtime.json'), { reader: { pid: 0 } })
  if (dataHome) {
    const text = '[Storage]\r\ndataHome=' + dataHome + '\r\n'
    if (iniEncoding === 'utf16le') {
      fs.writeFileSync(path.join(root, 'app', 'storage.ini'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]))
    } else {
      fs.writeFileSync(path.join(root, 'app', 'storage.ini'), text, 'utf8')
    }
  }
  return { root, data }
}

/** An isolated fetch: no real loopback request, deterministic 'unsupported' health. */
function offlineFetch() {
  return async () => ({ ok: true, status: 200, body: null })
}

function listFiles(root) {
  const out = []
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? prefix + '/' + entry.name : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel)
      else out.push(rel)
    }
  }
  walk(root, '')
  return out.sort()
}

function makeScope(routes) {
  return {
    webServer: { register(route) { routes.push(route); return () => {} }, tapIndex() { return () => {} } },
    get() { return { requestRejection() { return null } } },
    on() { return () => {} },
  }
}

function makeRequest({ method, url, body, token = TOKEN, omitToken = false }) {
  const listeners = {}
  const headers = { host: '127.0.0.1:59575' }
  if (!omitToken) headers['x-whale-core-token'] = token
  const req = {
    method, url, socket: { remoteAddress: '127.0.0.1' }, headers,
    on(event, fn) { listeners[event] = fn },
  }
  if (body !== undefined) {
    queueMicrotask(() => {
      if (listeners.data) listeners.data(Buffer.from(JSON.stringify(body)))
      if (listeners.end) listeners.end()
    })
  }
  return req
}

async function callRoute(route, options) {
  const res = { status: null, body: '', writeHead(code) { this.status = code }, end(text) { this.body = text } }
  await route.handler(makeRequest(options), res)
  return res
}

test('182 adopting an installed root writes only Whale Voice config and the next detection uses it', async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-adopt-' })
  try {
    const env = { DSH_HOME: sandbox.root }
    const install = makeInstall(path.join(sandbox.root, 'wechatagent'))
    const coreFile = path.join(sandbox.root, 'whale-voice', 'core.json')
    writeJson(coreFile, { wechatAgentRoot: path.join(sandbox.root, 'old-root'), qwenUrl: 'http://127.0.0.1:9999' })
    const detector = createDetector({ env, fetchImpl: offlineFetch(), timeoutMs: 50 })
    const before = await detector.detectAll()
    assert.equal(before.wechatAgent.state, 'not_installed')
    assert.equal(before.wechatAgent.adoption.source, 'config')
    const installFiles = listFiles(install.root)

    const adopted = adoptWeChatAgentRoot({ root: install.root, env })
    assert.equal(adopted.ok, true, JSON.stringify(adopted))
    assert.equal(adopted.adoption.savedRoot, maskPath(install.root))
    assert.equal(adopted.adoption.effectiveRoot, maskPath(install.root))
    assert.equal(adopted.adoption.source, 'config')
    assert.equal(adopted.adoption.applied, true)
    assert.equal(adopted.adoption.install.dataPath, maskPath(install.data))
    assert.equal(adopted.adoption.install.dataSource, 'layout')
    const core = readJson(coreFile)
    assert.equal(core.wechatAgentRoot, install.root)
    assert.equal(core.qwenUrl, 'http://127.0.0.1:9999')
    assert.deepEqual(listFiles(install.root), installFiles)

    const after = await detector.detectAll()
    assert.equal(after.wechatAgent.installed, true)
    assert.equal(after.wechatAgent.dataPath, maskPath(install.data))
    assert.equal(after.wechatAgent.adoption.savedRoot, maskPath(install.root))
    assert.equal(after.wechatAgent.adoption.effectiveRoot, maskPath(install.root))
    assert.equal(after.wechatAgent.adoption.applied, true)
    assert.equal((after.wechatAgent.adoption.sourceLabel || '').includes('core.json'), true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('182 the environment variable keeps precedence and the saved root is reported as not applied', async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-adopt-env-' })
  try {
    const savedInstall = makeInstall(path.join(sandbox.root, 'saved-agent'), { version: '0.3.9' })
    const envInstall = makeInstall(path.join(sandbox.root, 'env-agent'), { version: '0.4.2' })
    const env = { DSH_HOME: sandbox.root, WHALE_WECHATAGENT_HOME: envInstall.root }
    const adopted = adoptWeChatAgentRoot({ root: savedInstall.root, env })
    assert.equal(adopted.ok, true, JSON.stringify(adopted))
    assert.equal(adopted.adoption.savedRoot, maskPath(savedInstall.root))
    assert.equal(adopted.adoption.effectiveRoot, maskPath(envInstall.root))
    assert.equal(adopted.adoption.source, 'environment')
    assert.equal(adopted.adoption.applied, false)
    const effective = readCoreConfig(env)
    assert.equal(effective.wechatAgentRoot, envInstall.root)
    const detection = await createDetector({ env, fetchImpl: offlineFetch(), timeoutMs: 50 }).detectAll()
    assert.equal(detection.wechatAgent.installed, true)
    assert.equal(detection.wechatAgent.version, '0.4.2')
    assert.equal(detection.wechatAgent.adoption.applied, false)
    assert.equal(detection.wechatAgent.adoption.source, 'environment')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('182 a declared custom data location is used by detection and the config snapshot', async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-adopt-data-' })
  try {
    for (const iniEncoding of ['utf8', 'utf16le']) {
      const root = path.join(sandbox.root, 'agent-' + iniEncoding)
      const custom = path.join(sandbox.root, 'custom-data-' + iniEncoding)
      makeInstall(root, { dataHome: custom, iniEncoding })
      const inspected = inspectWeChatAgentRoot(root)
      assert.equal(inspected.ok, true, JSON.stringify(inspected))
      assert.equal(inspected.dataHome, custom)
      assert.equal(inspected.dataSource, 'storage.ini')
      const env = { DSH_HOME: sandbox.root, WHALE_WECHATAGENT_HOME: root }
      const detection = await createDetector({ env, fetchImpl: offlineFetch(), timeoutMs: 50 }).detectAll()
      assert.equal(detection.wechatAgent.dataPath, maskPath(custom))
      assert.equal(detection.wechatAgent.dataSource, 'storage.ini')
      assert.equal(detection.wechatAgent.wechatVersion, '4.1.10.27')
      assert.equal(detection.config.sources.find((row) => row.id === 'wechatagent-config').available, true)
    }
    const plain = makeInstall(path.join(sandbox.root, 'agent-layout'), {})
    assert.equal(resolveWeChatAgentDataHome(path.join(plain.root, 'app')).dataHome, path.join(plain.root, 'data'))
    assert.equal(resolveWeChatAgentDataHome(path.join(plain.root, 'app')).source, 'layout')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('182 invalid input, a corrupt config and a write failure stay explicit and change nothing', async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-adopt-bad-' })
  try {
    const env = { DSH_HOME: sandbox.root }
    const install = makeInstall(path.join(sandbox.root, 'wechatagent'))
    const coreFile = path.join(sandbox.root, 'whale-voice', 'core.json')
    const missing = adoptWeChatAgentRoot({ root: path.join(sandbox.root, 'missing'), env })
    assert.equal(missing.ok, false)
    assert.equal(missing.error, 'wechatagent_install_invalid')
    assert.match(missing.messageZh, /不是受支持的 WeChatAgent 安装/)
    const relative = adoptWeChatAgentRoot({ root: 'relative/path', env })
    assert.equal(relative.ok, false)
    assert.equal(relative.error, 'wechatagent_path_invalid')
    writeJson(coreFile, { wechatAgentRoot: path.join(sandbox.root, 'keep-me') })
    fs.writeFileSync(coreFile, '{"wechatAgentRoot": ', 'utf8')
    const corrupt = adoptWeChatAgentRoot({ root: install.root, env })
    assert.equal(corrupt.ok, false)
    assert.equal(corrupt.error, 'core_config_invalid')
    assert.match(corrupt.messageZh, /未写入任何内容/)
    assert.equal(fs.readFileSync(coreFile, 'utf8'), '{"wechatAgentRoot": ')
    fs.rmSync(coreFile, { force: true })
    fs.mkdirSync(coreFile, { recursive: true })
    const failed = adoptWeChatAgentRoot({ root: install.root, env })
    assert.equal(failed.ok, false)
    assert.match(failed.messageZh, /未写入任何内容/)
    assert.equal(fs.statSync(coreFile).isDirectory(), true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('182 the trusted Host route adopts through the bridge contract and reports the adoption in status', async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-adopt-host-' })
  try {
    const env = { DSH_HOME: sandbox.root }
    const install = makeInstall(path.join(sandbox.root, 'wechatagent'))
    const routes = []
    const host = installHostBridge(makeScope(routes), { token: TOKEN, env, fetchImpl: offlineFetch(), timeoutMs: 50 })
    const adoptRoute = routes.find((route) => route.path === '/whale-voice/setup/wechatagent/adopt')
    assert.ok(adoptRoute, 'adopt route missing')
    const denied = await callRoute(adoptRoute, { method: 'POST', url: '/whale-voice/setup/wechatagent/adopt', body: { root: install.root }, omitToken: true })
    assert.equal(denied.status, 401)
    const wrongMethod = await callRoute(adoptRoute, { method: 'GET', url: '/whale-voice/setup/wechatagent/adopt' })
    assert.equal(wrongMethod.status, 405)
    const invalid = await callRoute(adoptRoute, { method: 'POST', url: '/whale-voice/setup/wechatagent/adopt', body: { root: '' } })
    assert.equal(invalid.status, 400)
    assert.equal(JSON.parse(invalid.body).ok, false)
    const adopted = await callRoute(adoptRoute, { method: 'POST', url: '/whale-voice/setup/wechatagent/adopt', body: { root: install.root } })
    assert.equal(adopted.status, 200, adopted.body)
    const adoptedBody = JSON.parse(adopted.body)
    assert.equal(adoptedBody.ok, true)
    assert.equal(adoptedBody.adoption.savedRoot, maskPath(install.root))
    assert.equal(adoptedBody.adoption.dataPath || adoptedBody.adoption.install.dataPath, maskPath(install.data))
    const statusRoute = routes.find((route) => route.path === '/whale-voice/setup/status')
    const status = await callRoute(statusRoute, { method: 'GET', url: '/whale-voice/setup/status' })
    assert.equal(status.status, 200)
    const statusBody = JSON.parse(status.body)
    assert.equal(statusBody.wechatAgent.adoption.savedRoot, maskPath(install.root))
    assert.equal(statusBody.wechatAgent.adoption.applied, true)
    assert.equal(statusBody.wechatAgent.installed, true)
    host.dispose()
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('182 v1.1 the bridge reports a lost adoption reply as unconfirmed, not as a save failure', async () => {
  const context = (fetchImpl, window = {}) => {
    vm.runInNewContext(bridgeScript('host-token'), {
      window, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, encodeURIComponent, JSON, Set, String,
    })
    return window.__WHALE_SETUP__
  }
  const lostBridge = context(async () => { throw new TypeError('Failed to fetch') })
  const lost = await lostBridge.adoptWechatAgent({ root: '/tmp/agent' })
  assert.equal(lost.ok, false)
  assert.equal(lost.error, 'adoption_unconfirmed')
  const rejectedBridge = context(async () => ({
    ok: false,
    status: 400,
    async json() { return { ok: false, error: 'wechatagent_install_invalid', messageZh: '选择的目录不是受支持的 WeChatAgent 安装。' } },
  }))
  const rejected = await rejectedBridge.adoptWechatAgent({ root: '/tmp/nope' })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error, 'wechatagent_install_invalid')
  assert.match(rejected.messageZh, /不是受支持/)
  const abortedBridge = context(async () => ({
    ok: true,
    status: 200,
    async json() { const error = new Error('aborted'); error.name = 'AbortError'; throw error },
  }))
  const aborted = await abortedBridge.adoptWechatAgent({ root: '/tmp/agent' })
  assert.equal(aborted.ok, false)
  assert.equal(aborted.error, 'adoption_unconfirmed')
})
