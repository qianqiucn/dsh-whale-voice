/* Test-only isolated Host assembly for the Studio page's formal generation path.
 *
 * The browser page talks to the production bridge contract (`window.__WHALE_SETUP__` generation
 * methods from index.js `bridgeScript`); this file serves the real 136 Host routes through the
 * harness HTTP server and supplies the controlled execution object (the existing Fixture worker
 * behind the real Qwen adapter) plus a temporary sandbox. The business flow lives in the formal Core
 * entry `core/preset-generation-app.mjs`; nothing here is imported by index.js or production.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { installHostBridge } from '../../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../../core/config-sandbox.mjs'
import { openPresetGenerationApp } from '../../core/preset-generation-app.mjs'
import { createQwenProvider } from '../../core/tts/qwen-adapter.mjs'
import { createQwenSupervisor } from '../../core/tts/qwen-supervisor.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeRoot = path.join(here, '..', '..', 'test-fixtures')
const fakeWorker = path.join(fakeRoot, 'fake-qwen-worker.mjs')

const TOKEN = 'host-generation-ui-token'
const SCOPE = 'scope:fixture-ui-host-generation'
const PROOF = 'fixture-rights:ui-host-generation'
const VOICES = Object.freeze([
  { id: 'demo-voice-a', label: '示例女声 A', languages: ['zh-CN'] },
  { id: 'demo-voice-b', label: '示例男声 B', languages: ['zh-CN', 'en-US'] },
])

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}

export async function createHostGenerationAssembly() {
  let sandbox = null
  let supervisor = null
  let provider = null
  let app = null
  let routes = []
  let host = null
  let generationEnabled = true

  async function reset() {
    if (host) host.dispose()
    if (sandbox) {
      if (provider && provider.ok) await provider.shutdown().catch(() => null)
      removeConfigSandbox(sandbox)
    }
    sandbox = null
    supervisor = null
    provider = null
    app = null
    routes = []
    host = null
    generationEnabled = true

    sandbox = createConfigSandbox({ prefix: 'wv-ui-host-generation-' })
    supervisor = createQwenSupervisor({
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
      handshakeTimeoutMs: 5000,
      shutdownGraceMs: 500,
      killWaitMs: 300,
    })
    provider = createQwenProvider({ supervisor, requestTimeoutMs: 5000 })
    if (!provider.ok) throw new Error('ui host generation provider unavailable: ' + (provider.code || 'UNKNOWN'))
    const started = await provider.start()
    if (!started.ok) throw new Error('ui host generation provider start failed: ' + (started.code || 'UNKNOWN'))
    const opened = await openPresetGenerationApp({
      sandbox,
      provider,
      scopeId: SCOPE,
      rightsProofRef: PROOF,
      voices: VOICES,
      now: () => new Date().toISOString(),
    })
    if (!opened.ok) throw new Error('ui host generation app unavailable: ' + (opened.code || 'UNKNOWN'))
    app = opened.value

    const scope = {
      webServer: {
        register(route) { routes.push(route); return () => {} },
        tapIndex() { return () => {} },
      },
      get() { return { requestRejection() { return null } } },
      on() { return () => {} },
    }
    host = installHostBridge(scope, { token: TOKEN, generation: app })
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith('/whale-voice/setup/')) return false
    if (!generationEnabled && url.pathname.startsWith('/whale-voice/setup/generation')) {
      json(res, 503, { ok: false, error: 'generation_not_enabled' })
      return true
    }
    const route = routes.find((item) => item.path === url.pathname)
    if (!route) {
      json(res, 404, { ok: false, error: 'not_found' })
      return true
    }
    await route.handler(req, res)
    return true
  }

  function setGenerationEnabled(value) {
    generationEnabled = value === true
  }

  async function close() {
    if (host) host.dispose()
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    if (sandbox) removeConfigSandbox(sandbox)
    host = null
    sandbox = null
    supervisor = null
    provider = null
    app = null
    routes = []
  }

  await reset()
  return { handle, close, token: TOKEN, setGenerationEnabled }
}
