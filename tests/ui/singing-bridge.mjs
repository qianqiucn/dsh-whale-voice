/* Test-only HTTP bridge for the Whale Singing page harness.
 *
 * The browser adapter in tests/ui/harness.js talks to these endpoints. Every endpoint calls the
 * real openSingingApp / Cover executor / Fixture Artifact library against a temporary sandbox; there
 * are no fixed task ids, stage labels or hashes here. Nothing in this file is imported by index.js
 * or the production Host.
 */

import { createConfigSandbox, removeConfigSandbox } from '../../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../../core/audio/cover-stage-bytes-internal.mjs'
import { openSingingApp } from '../../core/singing-app-internal.mjs'
import { coverDependencies } from '../../test/support/cover-dependencies.mjs'

const SCOPE = 'scope:fixture-ui-singing'
const PROOF = 'fixture-rights:ui-singing'
const EXPIRES = '2027-01-01T00:00:00.000Z'
const VOICE = {
  voiceProfileId: 'voice:demo-hero',
  profileRevision: 1,
  modelAssetId: 'asset:fixture-model-a',
  modelRevision: 1,
  modelIntegrityTruth: 'DECLARED_FIXTURE',
  instanceId: 'instance:rvc',
  candidateId: 'rvc',
  modelRef: 'rvc-model:fixture-a',
  backendRevision: 1,
  label: '演示声线',
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

export async function createSingingBridge() {
  let sandbox = null
  let app = null
  let sources = []
  let lastDraft = null
  let lastTaskId = null
  let lastPreview = null

  async function reset() {
    if (sandbox) removeConfigSandbox(sandbox)
    sandbox = createConfigSandbox()
    const library = await openFixtureArtifactLibrary({ sandbox })
    const imported = await library.value.import({
      schemaVersion: 1,
      scopeId: SCOPE,
      requestKey: 'import:ui-singing-a',
      bytes: wavFromSamples([1200, -2200, 32767, -32768, 4000, -5000, 9000, -9000], 44100),
      now: new Date().toISOString(),
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
    })
    const importedB = await library.value.import({
      schemaVersion: 1,
      scopeId: SCOPE,
      requestKey: 'import:ui-singing-b',
      bytes: wavFromSamples([-3000, 6000, -12000, 24000, -4000, 8000, -16000, 32000], 44100),
      now: new Date().toISOString(),
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
    })
    if (!imported.ok || !importedB.ok) throw new Error('fixture source import failed')
    sources = [
      {
        sourceRef: imported.value.artifact.artifactRef,
        sourceRevision: 1,
        rights: { state: 'GRANTED', proofRef: PROOF, expiresAt: EXPIRES },
        label: '演示曲 A · Fixture',
      },
      {
        sourceRef: importedB.value.artifact.artifactRef,
        sourceRevision: 1,
        rights: { state: 'GRANTED', proofRef: PROOF, expiresAt: EXPIRES },
        label: '演示曲 B · Fixture',
      },
    ]
    const opened = openSingingApp({
      sandbox,
      scopeId: SCOPE,
      sources,
      voices: [VOICE],
      stageDelayMs: 300,
      now: () => new Date().toISOString(),
      dependenciesProvider: ({ taskId, intent, now, expiresAt }) => coverDependencies({
        scopeId: SCOPE,
        sourceRef: intent.sourceRef,
        taskId,
        now,
        expiresAt,
        intent,
      }),
    })
    if (!opened.ok) throw new Error('singing app open failed: ' + opened.code)
    app = opened.app
    lastDraft = null
    lastTaskId = null
    lastPreview = null
  }

  async function metrics() {
    if (!app || !lastTaskId) return { ok: true, taskId: null, state: 'NO_ATTEMPT', masterCount: 0, preview: lastPreview }
    const status = await app.status(lastTaskId)
    return {
      ok: true,
      taskId: lastTaskId,
      state: status.ok ? status.stage.state : 'UNKNOWN',
      masterCount: status.ok && status.stage.master ? 1 : 0,
      master: status.ok ? status.stage.master : null,
      preview: lastPreview,
      sourceRef: lastDraft ? lastDraft.sourceRef : null,
      catalogSources: sources.map((item) => item.sourceRef),
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = url.pathname
    if (!pathname.startsWith('/singing-app/')) return false
    try {
      if (pathname === '/singing-app/catalog' && req.method === 'GET') {
        json(res, 200, app.list())
        return true
      }
      if (pathname === '/singing-app/reset' && req.method === 'POST') {
        await readBody(req)
        await reset()
        json(res, 200, app.list())
        return true
      }
      if (pathname === '/singing-app/create' && req.method === 'POST') {
        const body = await readBody(req)
        lastDraft = body
        const result = await app.create(body)
        if (result.ok) lastTaskId = result.taskId
        json(res, 200, result)
        return true
      }
      if (pathname === '/singing-app/execute' && req.method === 'POST') {
        const body = await readBody(req)
        if (!lastDraft || body.taskId !== lastTaskId) { json(res, 409, { ok: false, code: 'SINGING_APP_INVALID', detail: 'taskId' }); return true }
        const result = await app.start(lastDraft)
        json(res, 200, result)
        return true
      }
      if (pathname === '/singing-app/status' && req.method === 'GET') {
        const taskId = url.searchParams.get('taskId')
        const result = await app.status(taskId)
        json(res, 200, result)
        return true
      }
      if (pathname === '/singing-app/cancel' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await app.cancel(body.taskId)
        json(res, 200, result)
        return true
      }
      if (pathname === '/singing-app/preview' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await app.preview({ taskId: body.taskId, draft: body.draft || lastDraft })
        if (result.ok) {
          lastPreview = { byteLength: result.byteLength, sha256: result.sha256, artifactRef: result.artifactRef }
          json(res, 200, { ok: true, taskId: result.taskId, byteLength: result.byteLength, sha256: result.sha256, artifactRef: result.artifactRef, fixtureOnly: true, realReady: false })
        } else {
          json(res, 200, result)
        }
        return true
      }
      if (pathname === '/singing-app/metrics' && req.method === 'GET') {
        json(res, 200, await metrics())
        return true
      }
      json(res, 404, { ok: false, code: 'SINGING_APP_NOT_FOUND' })
      return true
    } catch {
      json(res, 500, { ok: false, code: 'SINGING_APP_BRIDGE_FAILED' })
      return true
    }
  }

  async function close() {
    if (sandbox) removeConfigSandbox(sandbox)
    sandbox = null
    app = null
  }

  await reset()
  return { handle, reset, metrics, close }
}
