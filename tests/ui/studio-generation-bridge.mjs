/* Test-only HTTP bridge for the Studio page's isolated preset generation entry.
 *
 * The browser adapter in tests/ui/harness.js talks to these endpoints. Every generation drives the
 * real public Qwen adapter over the existing Fixture worker, then the 133 coordinator and the 132
 * original-task save against a temporary sandbox; there are no fixed task ids, artifact refs or
 * success values here. Nothing in this file is imported by index.js or the production Host.
 */

import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../../core/audio/task-catalog.mjs'
import { openFixtureTaskOwner } from '../../core/audio/task-owner.mjs'
import { openFixtureArtifactLibrary } from '../../core/audio/artifact-library.mjs'
import {
  PROVIDER_GENERATION_SCHEMA_VERSION,
  createProviderGenerationCoordinator,
} from '../../core/audio/provider-generation-offline.mjs'
import { createQwenProvider } from '../../core/tts/qwen-adapter.mjs'
import { createQwenSupervisor } from '../../core/tts/qwen-supervisor.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeRoot = path.join(here, '..', '..', 'test-fixtures')
const fakeWorker = path.join(fakeRoot, 'fake-qwen-worker.mjs')

const SCOPE = 'scope:fixture-ui-studio'
const PROOF = 'fixture-rights:ui-studio'
const TEXT_LIMIT = 200
const MODEL = 'Qwen3-TTS-12Hz-1.7B-CustomVoice'
const VOICES = Object.freeze([
  { id: 'demo-voice-a', label: '示例女声 A', languages: ['zh-CN'] },
  { id: 'demo-voice-b', label: '示例男声 B', languages: ['zh-CN', 'en-US'] },
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

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
  let catalog = null
  let owner = null
  let library = null
  let coordinator = null
  let lastTaskId = null
  let counter = 0

  async function reset() {
    if (sandbox) {
      if (provider && provider.ok) await provider.shutdown().catch(() => null)
      removeConfigSandbox(sandbox)
    }
    sandbox = null
    supervisor = null
    provider = null
    catalog = null
    owner = null
    library = null
    coordinator = null
    lastTaskId = null
    counter = 0

    sandbox = createConfigSandbox({ prefix: 'wv-ui-studio-' })
    const catalogOpened = await openFixtureTaskCatalog({ sandbox })
    if (!catalogOpened.ok) throw new Error('studio catalog unavailable')
    catalog = catalogOpened.value
    const ownerOpened = await openFixtureTaskOwner({ sandbox })
    if (!ownerOpened.ok) throw new Error('studio owner unavailable')
    owner = ownerOpened.value
    const libraryOpened = await openFixtureArtifactLibrary({ sandbox })
    if (!libraryOpened.ok) throw new Error('studio artifact library unavailable')
    library = libraryOpened.value

    supervisor = createQwenSupervisor({
      allowedRoot: fakeRoot,
      worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
      handshakeTimeoutMs: 5000,
      shutdownGraceMs: 500,
      killWaitMs: 300,
    })
    provider = createQwenProvider({
      supervisor,
      requestTimeoutMs: 5000,
      taskAuthority: async (taskId) => {
        const got = await catalog.get({ schemaVersion: 1, scopeId: SCOPE, taskId })
        return got.ok ? { ok: true, state: got.value.task.state } : { ok: false }
      },
    })
    if (!provider.ok) throw new Error('studio qwen provider unavailable: ' + (provider.code || 'UNKNOWN'))
    const started = await provider.start()
    if (!started.ok) throw new Error('studio qwen provider start failed: ' + (started.code || 'UNKNOWN'))

    const opened = createProviderGenerationCoordinator({
      sandbox,
      artifacts: library,
      provider,
      authority: async ({ scopeId, taskId }) => {
        const got = await catalog.get({ schemaVersion: 1, scopeId, taskId })
        if (!got.ok) return { ok: false }
        return { ok: true, birth: { identityHash: sha256(scopeId + '|' + taskId), state: got.value.task.state } }
      },
      taskOwner: owner,
      now: () => new Date().toISOString(),
    })
    if (!opened.ok) throw new Error('studio generation coordinator unavailable: ' + (opened.code || 'UNKNOWN'))
    coordinator = opened
  }

  function catalogView() {
    return {
      ok: true,
      fixtureOnly: true,
      realReady: false,
      textLimit: TEXT_LIMIT,
      voices: VOICES.map((voice) => ({ ...voice, languages: [...voice.languages] })),
    }
  }

  async function generate(body) {
    if (!coordinator) return { ok: false, code: 'STUDIO_GENERATION_UNAVAILABLE' }
    const text = typeof body.text === 'string' ? body.text : ''
    const voice = VOICES.find((item) => item.id === body.voiceId) || null
    if (!voice) return { ok: false, code: 'STUDIO_VOICE_INVALID' }
    if (text.trim().length === 0 || text.length > TEXT_LIMIT) return { ok: false, code: 'STUDIO_TEXT_INVALID' }
    const language = voice.languages.includes(body.language) ? body.language : voice.languages[0]
    counter += 1
    const observedAt = new Date().toISOString()
    const reserved = await catalog.reserve({
      schemaVersion: 1,
      scopeId: SCOPE,
      idempotencyKey: 'key:fixture-ui-studio-' + counter,
      draft: {
        schemaVersion: 1,
        feature: 'voice-bubbles',
        taskType: 'TTS',
        source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-1' },
        voiceProfileId: 'voice:demo-hero',
        deliveryRequested: false,
        rights: { state: 'CONFIRMED_FIXTURE' },
      },
      observedAt,
    })
    if (!reserved.ok) return { ok: false, code: reserved.code || 'STUDIO_BIRTH_REJECTED' }
    const taskId = reserved.value.task.taskId
    const prepared = await coordinator.prepare({
      schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION,
      scopeId: SCOPE,
      taskId,
      requestKey: 'key:ui-studio-run-' + counter,
      rights: { state: 'GRANTED', proofRef: PROOF },
      provider: {
        providerId: 'qwen3-tts',
        instanceId: 'instance-1',
        model: MODEL,
        backend: 'custom-voice',
        voiceId: voice.id,
      },
      request: { text, language, emotion: '', modality: 'preset' },
    })
    if (!prepared.ok) return { ok: false, code: prepared.code || 'STUDIO_PREPARE_REJECTED', detail: prepared.detail || null }
    const submitted = await coordinator.submit({ claimId: prepared.claim.claimId })
    if (!submitted.ok) {
      return { ok: false, code: submitted.code || 'STUDIO_SUBMIT_REJECTED', detail: (submitted.claim && submitted.claim.lastError) || null }
    }
    lastTaskId = taskId
    return {
      ok: true,
      taskId,
      state: 'SAVED',
      ownerState: 'SAVED',
      artifactRef: submitted.claim.artifact.artifactRef,
      sha256: submitted.claim.artifact.sha256,
      byteLength: submitted.claim.artifact.byteLength,
      durationMs: submitted.claim.artifact.durationMs,
      voiceId: voice.id,
      language,
      fixtureOnly: true,
      realReady: false,
    }
  }

  async function status(taskIdArg) {
    const taskId = typeof taskIdArg === 'string' && taskIdArg.length > 0 ? taskIdArg : lastTaskId
    if (!taskId) return { ok: true, taskId: null, state: 'NO_TASK', fixtureOnly: true, realReady: false }
    const got = await owner.get({ schemaVersion: 1, scopeId: SCOPE, taskId })
    if (!got.ok) return { ok: false, code: got.errors && got.errors[0] ? got.errors[0].code : 'STUDIO_STATUS_REJECTED' }
    const artifactStatus = await owner.artifactStatus({
      schemaVersion: 1, scopeId: SCOPE, taskId, now: new Date().toISOString(),
      rights: { state: 'GRANTED', proofRef: PROOF },
    })
    if (!artifactStatus.ok) {
      return { ok: false, code: artifactStatus.errors && artifactStatus.errors[0] ? artifactStatus.errors[0].code : 'STUDIO_STATUS_REJECTED' }
    }
    if (artifactStatus.value.state !== 'READABLE') {
      return {
        ok: true,
        taskId,
        state: got.value.task.state,
        ownerState: got.value.ownerState,
        readable: false,
        artifactRef: artifactStatus.value.artifactRef || null,
        fixtureOnly: true,
        realReady: false,
      }
    }
    const read = await library.readBytes({
      schemaVersion: 1, scopeId: SCOPE, artifactRef: artifactStatus.value.artifactRef,
      now: new Date().toISOString(), rights: { state: 'GRANTED', proofRef: PROOF },
    })
    const bytes = read.ok && read.value ? read.value.bytes : null
    return {
      ok: true,
      taskId,
      state: got.value.task.state,
      ownerState: got.value.ownerState,
      readable: true,
      artifactRef: artifactStatus.value.artifactRef,
      sha256: bytes ? sha256(bytes) : null,
      byteLength: bytes ? bytes.length : null,
      fixtureOnly: true,
      realReady: false,
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = url.pathname
    if (!pathname.startsWith('/studio-generation/')) return false
    try {
      if (pathname === '/studio-generation/catalog' && req.method === 'GET') {
        json(res, 200, catalogView())
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
        json(res, 200, catalogView())
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
    catalog = null
    owner = null
    library = null
    coordinator = null
  }

  await reset()
  return { handle, reset, close }
}
