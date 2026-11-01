/* Whale Voice — Cover voice/provider/manifest dependency gate (Plan 08-F-B / 090, OFFLINE).
 *
 * 104-R05: the execution can consume the same real Fixture voice binding and provider readiness
 * facts as the legacy engine. A binding that does not resolve to FIXTURE_BOUND, whose profile/asset/
 * instance/candidate/modelRef differs from the Intent, or whose provider is not FIXTURE_READY blocks
 * the run before any claim. The readiness evaluator also gates the actual run (future evidence).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, coverStatus, createCoverTask, executeCover } from './support/cover-run.mjs'
import { executeCover as rawExecuteCover } from '../core/audio/cover-executor-internal.mjs'
import { COVER_DEPENDENCY_CODES, verifyCoverDependencies } from '../core/audio/cover-dependencies-internal.mjs'
import { computeCoverReadiness } from '../core/audio/cover-readiness-internal.mjs'

const SCOPE = 'scope:fixture-demo'
const PROOF = 'fixture-rights:demo-1'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const OWNER_FILE = 'audio-task-owner-v1.json'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function example() {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf('## 7.')
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function draft(sourceRef) {
  return {
    intentVersion: 1,
    scopeId: SCOPE,
    sourceRef,
    sourceRevision: 1,
    rightsState: 'GRANTED',
    rightsProofRef: PROOF,
    rightsExpiresAt: EXPIRES,
    voiceProfileId: 'voice:demo-hero',
    profileRevision: 1,
    modelAssetId: 'asset:fixture-model-a',
    modelRevision: 1,
    modelIntegrityTruth: 'DECLARED_FIXTURE',
    instanceId: 'instance:rvc',
    candidateId: 'rvc',
    modelRef: 'rvc-model:fixture-a',
    backendRevision: 1,
    pitchShift: 0,
    recipe: {
      sourceLayout: 'MIXED',
      separationPreset: 'FIXTURE_TWO_STEM',
      mixMode: 'WITH_INSTRUMENTAL',
      vocalGainDb: 0,
      instrumentalGainDb: 0,
    },
    outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 1 },
  }
}

async function setup() {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  const imported = await library.value.import({
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:dep-source', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:dependency', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  return { sandbox, birth, sourceRef: imported.value.artifact.artifactRef }
}

function dependenciesFor(sourceRef, taskId, { assetRevision = 1, providerInstallation = 'PRESENT' } = {}) {
  const ex = example()
  const binding = clone(ex.sourceInput.voiceBinding)
  binding.taskDraft.taskId = taskId
  binding.taskDraft.source.ref = sourceRef
  binding.negotiation.request.sourceAudioRef = sourceRef
  const readiness = clone(ex.readiness)
  readiness.instances[0].installation = providerInstallation
  return {
    voiceBinding: {
      library: binding.library,
      taskDraft: binding.taskDraft,
      negotiation: binding.negotiation,
      expectation: { scopeId: SCOPE, profileRevision: 1, assetRevision },
    },
    provider: { negotiation: binding.negotiation, readiness },
    model: { present: true, revision: 1, requiredRevision: 1 },
    evidence: { observedAt: NOW, expiresAt: EXPIRES, realReady: false, source: 'FIXTURE' },
    confirmation: { firstVisit: false, confirmed: false },
    cloud: { authorized: false, providerReady: false },
  }
}

test('a matching real voice binding and provider readiness verify', async () => {
  const { sandbox, birth, sourceRef } = await setup()
  try {
    const verified = verifyCoverDependencies({ intent: birth.value.intent, dependencies: dependenciesFor(sourceRef, birth.value.taskId), now: NOW })
    assert.equal(verified.ok, true)
    assert.equal(verified.value.voice, 'FIXTURE_BOUND')
    assert.equal(verified.value.provider, 'FIXTURE_READY')
    assert.equal(verified.value.realReady, false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a stale asset revision or non-ready provider blocks the execution before any claim', async () => {
  const { sandbox, birth, sourceRef } = await setup()
  try {
    const stale = dependenciesFor(sourceRef, birth.value.taskId, { assetRevision: 2 })
    const staleResult = verifyCoverDependencies({ intent: birth.value.intent, dependencies: stale, now: NOW })
    assert.equal(staleResult.ok, false)
    assert.equal(staleResult.errors[0].code, COVER_DEPENDENCY_CODES.VOICE_BINDING_NOT_READY)

    const broken = dependenciesFor(sourceRef, birth.value.taskId, { providerInstallation: 'MISSING' })
    const brokenResult = verifyCoverDependencies({ intent: birth.value.intent, dependencies: broken, now: NOW })
    assert.equal(brokenResult.ok, false)
    assert.equal(brokenResult.errors[0].code, COVER_DEPENDENCY_CODES.PROVIDER_NOT_READY)

    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:dep', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent, dependencies: stale,
    })
    assert.equal(run.ok, false)
    assert.equal(run.errors[0].code, COVER_EXECUTION_CODES.DEPENDENCY_FAILURE)
    const file = path.join(sandbox.root, OWNER_FILE)
    assert.equal(fs.existsSync(file), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a matching dependency bundle lets the real execution reach SAVED', async () => {
  const { sandbox, birth, sourceRef } = await setup()
  try {
    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:dep-ok', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
      dependencies: dependenciesFor(sourceRef, birth.value.taskId),
    })
    assert.equal(run.ok, true)
    assert.equal(run.value.outcome, 'SAVED')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('omitting the dependency facts is a hard block, not a default-ready shortcut', async () => {
  const { sandbox, birth } = await setup()
  try {
    const run = await rawExecuteCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:omitted', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    assert.equal(run.ok, false)
    assert.equal(run.errors[0].code, COVER_EXECUTION_CODES.DEPENDENCY_FAILURE)
    assert.equal(run.errors[0].path, 'dependencies')
    assert.equal(fs.existsSync(path.join(sandbox.root, OWNER_FILE)), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a deleted/reinstalled model revision blocks before any claim', async () => {
  const { sandbox, birth, sourceRef } = await setup()
  try {
    const dependencies = dependenciesFor(sourceRef, birth.value.taskId)
    dependencies.model = { present: true, revision: 0, requiredRevision: 1 }
    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:model', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent, dependencies,
    })
    assert.equal(run.ok, false)
    assert.equal(run.errors[0].code, COVER_EXECUTION_CODES.DEPENDENCY_FAILURE)
    assert.equal(run.errors[0].path, 'model')
    assert.equal(fs.existsSync(path.join(sandbox.root, OWNER_FILE)), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a shared provider invalidation blocks the next task while the saved one stays intact', async () => {
  const { sandbox, birth, sourceRef } = await setup()
  try {
    const first = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:shared-a', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
      dependencies: dependenciesFor(sourceRef, birth.value.taskId),
    })
    assert.equal(first.value.outcome, 'SAVED')
    const second = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:shared-b', intentDraft: draft(sourceRef), observedAt: NOW })
    assert.equal(second.ok, true)
    const broken = dependenciesFor(sourceRef, second.value.taskId, { providerInstallation: 'MISSING' })
    const blocked = await executeCover({
      sandbox, scopeId: SCOPE, taskId: second.value.taskId, requestKey: 'cover-exec:shared-b', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: second.value.intent, dependencies: broken,
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.errors[0].path, 'provider')
    const firstStatus = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(firstStatus.value.state, 'SAVED')
    const secondStatus = await coverStatus({ sandbox, scopeId: SCOPE, taskId: second.value.taskId, now: NOW })
    assert.equal(secondStatus.value.state, 'NO_ATTEMPT')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('TTS and SVC alternate on the same facts with different cloud requirements', async () => {
  const { sandbox, birth, sourceRef } = await setup()
  try {
    const svcRun = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:alternate', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent, dependencies: dependenciesFor(sourceRef, birth.value.taskId),
    })
    assert.equal(svcRun.value.outcome, 'SAVED')
    const evidence = { observedAt: NOW, expiresAt: EXPIRES, realReady: false, source: 'FIXTURE' }
    const confirmation = { firstVisit: false, confirmed: false }
    const ttsDenied = computeCoverReadiness({ mode: 'TTS', sourceType: 'TEXT', cloud: { authorized: false, providerReady: false }, evidence, confirmation, now: NOW })
    assert.equal(ttsDenied.value.ready, false)
    assert.equal(ttsDenied.value.blockedBy.some((item) => item.code === 'COVER_READINESS_CLOUD_NOT_AUTHORIZED'), true)
    const ttsReady = computeCoverReadiness({ mode: 'TTS', sourceType: 'TEXT', cloud: { authorized: true, providerReady: true }, evidence, confirmation, now: NOW })
    assert.equal(ttsReady.value.ready, true)
    const svcStatus = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(svcStatus.value.state, 'SAVED')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('the readiness evidence gate blocks the actual run when evidence is in the future', async () => {
  const { sandbox, birth, sourceRef } = await setup()
  try {
    const dependencies = dependenciesFor(sourceRef, birth.value.taskId)
    dependencies.evidence = { observedAt: '2026-11-03T00:00:00.000Z', expiresAt: '2026-11-04T00:00:00.000Z', realReady: false }
    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:future', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent, dependencies,
    })
    assert.equal(run.ok, false)
    assert.equal(run.errors[0].code, COVER_EXECUTION_CODES.DEPENDENCY_FAILURE)
    assert.equal(run.errors[0].path, 'evidence')
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.value.state, 'NO_ATTEMPT')
  } finally {
    removeConfigSandbox(sandbox)
  }
})
