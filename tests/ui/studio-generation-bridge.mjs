/* Test-only HTTP bridge for the Studio page's isolated preset generation entry.
 *
 * The business flow lives in the formal Core entry `core/preset-generation-app.mjs`. This file only
 * supplies the controlled execution object (the existing Fixture worker behind the real Qwen
 * adapter), a temporary sandbox, the HTTP surface consumed by tests/ui/harness.js, and the UI
 * session's "last task" pointer. Nothing here is imported by index.js or the production Host.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../../core/config-sandbox.mjs'
import { openPresetGenerationApp } from '../../core/preset-generation-app.mjs'
import { createQwenProvider } from '../../core/tts/qwen-adapter.mjs'
import { createQwenSupervisor } from '../../core/tts/qwen-supervisor.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeRoot = path.join(here, '..', '..', 'test-fixtures')
const fakeWorker = path.join(fakeRoot, 'fake-qwen-worker.mjs')

const SCOPE = 'scope:fixture-ui-studio'
const PROOF = 'fixture-rights:ui-studio'
const VOICES = Object.freeze([
  { id: 'demo-voice-a', label: '示例女声 A', languages: ['zh-CN'] },
  { id: 'demo-voice-b', label: '示例男声 B', languages: ['zh-CN', 'en-US'] },
])

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('invalid json')) }
    })
    req.on('error', reject)
  })
}

export async function createStudioGenerationBridge() {
  let sandbox = null
  let supervisor = null
  let provider = null
  let app = null
  let lastTaskId = null

  async function reset() {
    if (sandbox) {
      if (provider && provider.ok) await provider.shutdown().catch(() => null)
      removeConfigSandbox(sandbox)
    }
    sandbox = null
    supervisor = null
    provider = null
    app = null
    lastTaskId = null

    sandbox = createConfigSandbox({ prefix: 'wv-ui-studio-' })
    supervisor = createQwenSupervisor({
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
      handshakeTimeoutMs: 5000,
      shutdownGraceMs: 500,
      killWaitMs: 300,
    })
    provider = createQwenProvider({ supervisor, requestTimeoutMs: 5000 })
    if (!provider.ok) throw new Error('studio qwen provider unavailable: ' + (provider.code || 'UNKNOWN'))
    const started = await provider.start()
    if (!started.ok) throw new Error('studio qwen provider start failed: ' + (started.code || 'UNKNOWN'))

    const opened = await openPresetGenerationApp({
      sandbox,
      provider,
      scopeId: SCOPE,
      rightsProofRef: PROOF,
      voices: VOICES,
      now: () => new Date().toISOString(),
    })
    if (!opened.ok) throw new Error('studio preset generation app unavailable: ' + (opened.code || 'UNKNOWN'))
    app = opened.value
  }

  async function generate(body) {
    if (!app) return { ok: false, code: 'STUDIO_GENERATION_UNAVAILABLE' }
    const result = await app.generate({
      text: typeof body.text === 'string' ? body.text : '',
      voiceId: body.voiceId,
      language: body.language,
    })
    if (result.ok) lastTaskId = result.taskId
    return result
  }

  async function status(taskIdArg) {
    if (!app) return { ok: false, code: 'STUDIO_GENERATION_UNAVAILABLE' }
    const taskId = typeof taskIdArg === 'string' && taskIdArg.length > 0 ? taskIdArg : lastTaskId
    if (!taskId) return { ok: true, taskId: null, state: 'NO_TASK', fixtureOnly: true, realReady: false }
    return await app.status(taskId)
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = url.pathname
    if (!pathname.startsWith('/studio-generation/')) return false
    try {
      if (pathname === '/studio-generation/catalog' && req.method === 'GET') {
        json(res, 200, app ? app.catalog() : { ok: false, code: 'STUDIO_GENERATION_UNAVAILABLE' })
        return true
      }
      if (pathname === '/studio-generation/generate' && req.method === 'POST') {
        json(res, 200, await generate(await readBody(req)))
        return true
      }
      if (pathname === '/studio-generation/status' && req.method === 'GET') {
        json(res, 200, await status(url.searchParams.get('taskId')))
        return true
      }
      if (pathname === '/studio-generation/reset' && req.method === 'POST') {
        await readBody(req)
        await reset()
        json(res, 200, app.catalog())
        return true
      }
      json(res, 404, { ok: false, code: 'STUDIO_GENERATION_NOT_FOUND' })
      return true
    } catch {
      json(res, 500, { ok: false, code: 'STUDIO_GENERATION_BRIDGE_FAILED' })
      return true
    }
  }

  async function close() {
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    if (sandbox) removeConfigSandbox(sandbox)
    sandbox = null
    supervisor = null
    provider = null
    app = null
  }

  await reset()
  return { handle, reset, close }
}
