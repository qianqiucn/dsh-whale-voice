/* Test-only isolated Host assembly for adopting an existing WeChatAgent install (182).
 *
 * The browser page talks to the production bridge contract (`window.__WHALE_SETUP__.adoptWechatAgent`
 * from index.js `bridgeScript`); this file serves the real Host route through the harness HTTP server.
 * The Whale Voice config owner is a fresh temporary sandbox used as DSH_HOME, and the "installed"
 * WeChatAgent is a synthetic directory tree. Nothing is installed, started, logged in or contacted.
 */

import fs from 'node:fs'
import path from 'node:path'

import { installHostBridge } from '../../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../../core/config-sandbox.mjs'

const TOKEN = 'host-adoption-ui-token'

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

export async function createHostAdoptionAssembly() {
  const home = createConfigSandbox({ prefix: 'wv-ui-adopt-home-' })
  const installSandbox = createConfigSandbox({ prefix: 'wv-ui-adopt-agent-' })
  const installRoot = path.join(installSandbox.root, 'WeChatAgent')
  writeJson(path.join(installRoot, 'app', 'resources', 'project', 'package.json'), { name: 'wechat-agent', version: '0.3.9' })
  writeJson(path.join(installRoot, 'data', 'workspace', 'config', 'wechatagent.json'), {
    hook: { baseUrl: 'http://127.0.0.1:9', expectedVersion: '4.1.10.27' },
  })
  writeJson(path.join(installRoot, 'data', 'workspace', 'state', 'runtime.json'), { reader: { pid: 0 } })
  const qwenModelDirectory = path.join(installSandbox.root, 'qwen-model')
  fs.mkdirSync(qwenModelDirectory, { recursive: true })
  const qwenPythonPath = path.join(installSandbox.root, 'python.exe')
  fs.writeFileSync(qwenPythonPath, 'fixture python program (never executed)', 'utf8')

  const routes = []
  const scope = {
    webServer: { register(route) { routes.push(route); return () => {} }, tapIndex() { return () => {} } },
    get() { return { requestRejection() { return null } } },
    on() { return () => {} },
  }
  const host = installHostBridge(scope, {
    token: TOKEN,
    env: { DSH_HOME: home.root },
    fetchImpl: async () => ({ ok: true, status: 200, body: null }),
    timeoutMs: 50,
  })

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith('/whale-voice/setup/wechatagent/') && !url.pathname.startsWith('/whale-voice/setup/qwen-runtime/')) return false
    const route = routes.find((item) => item.path === url.pathname)
    if (!route) {
      json(res, 404, { ok: false, error: 'not_found' })
      return true
    }
    await route.handler(req, res)
    return true
  }

  async function close() {
    host.dispose()
    removeConfigSandbox(home)
    removeConfigSandbox(installSandbox)
  }

  return { handle, close, token: TOKEN, installRoot, qwenModelDirectory, qwenPythonPath }
}
