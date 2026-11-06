/* Test-only isolated Host assembly for the Studio page's formal generation path.
 *
 * The browser page talks to the production bridge contract (`window.__WHALE_SETUP__` generation
 * methods from index.js `bridgeScript`); this file serves the real 136 Host routes through the
 * harness HTTP server. The worker, provider, discovery and Core application object are assembled by
 * the formal 140 entry `openQwenGenerationRuntime` with a temporary sandbox and the existing Fixture
 * worker. Nothing here is imported by index.js or production.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { installHostBridge } from '../../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../../core/config-sandbox.mjs'
import { openQwenGenerationRuntime } from '../../core/qwen-generation-runtime.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeRoot = path.join(here, '..', '..', 'test-fixtures')
const fakeWorker = path.join(fakeRoot, 'fake-qwen-worker.mjs')

const TOKEN = 'host-generation-ui-token'
const SCOPE = 'scope:fixture-ui-host-generation'
const PROOF = 'fixture-rights:ui-host-generation'

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}

export async function createHostGenerationAssembly() {
  let sandbox = null
  let runtime = null
  let routes = []
  let host = null
  let generationEnabled = true
  let generationFailure = null

  async function reset() {
    if (host) host.dispose()
    if (runtime) await runtime.close().catch(() => null)
    if (sandbox) removeConfigSandbox(sandbox)
    sandbox = null
    runtime = null
    routes = []
    host = null
    generationEnabled = true
    generationFailure = null

    sandbox = createConfigSandbox({ prefix: 'wv-ui-host-generation-' })
    const opened = await openQwenGenerationRuntime({
      sandbox,
      scopeId: SCOPE,
      rightsProofRef: PROOF,
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
      requestTimeoutMs: 5000,
      handshakeTimeoutMs: 5000,
      shutdownGraceMs: 500,
      killWaitMs: 300,
    })
    if (!opened.ok) throw new Error('ui host generation runtime unavailable: ' + (opened.code || 'UNKNOWN'))
    runtime = opened.value

    const scope = {
      webServer: {
        register(route) { routes.push(route); return () => {} },
        tapIndex() { return () => {} },
      },
      get() { return { requestRejection() { return null } } },
      on() { return () => {} },
    }
    host = installHostBridge(scope, { token: TOKEN, generation: runtime.app })
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith('/whale-voice/setup/')) return false
    // 164: the real Host keeps the assembly route available even when generation is off or failed, so
    // the page can tell "not configured" from "configured but failed to start".
    if (url.pathname === '/whale-voice/setup/generation/assembly') {
      if (generationFailure) {
        json(res, 200, { ok: true, state: 'FAILED', code: generationFailure.code, messageZh: generationFailure.messageZh })
        return true
      }
      json(res, 200, { ok: true, state: generationEnabled ? 'READY' : 'DISABLED' })
      return true
    }
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
    if (generationEnabled) generationFailure = null
  }

  /** 164: a configured generation that failed to start (the same state index.js reports as FAILED). */
  function setGenerationFailure(failure) {
    generationFailure = failure && typeof failure === 'object'
      ? { code: String(failure.code || ''), messageZh: String(failure.messageZh || '') }
      : null
    generationEnabled = generationFailure === null
  }

  function resetGeneration() {
    generationEnabled = true
    generationFailure = null
  }

  async function close() {
    if (host) host.dispose()
    if (runtime) await runtime.close().catch(() => null)
    if (sandbox) removeConfigSandbox(sandbox)
    host = null
    sandbox = null
    runtime = null
    routes = []
  }

  await reset()
  return { handle, close, token: TOKEN, setGenerationEnabled, setGenerationFailure, resetGeneration }
}
