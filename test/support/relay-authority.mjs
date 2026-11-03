/* Test-only builders for the two *persisted* SAVED authorities the relay core must read.
 *
 * `createVoiceSavedTask` drives the real AudioTask catalog + owner save transaction from the
 * documented Fixture runner example, so the resulting SAVED record and artifact bytes are produced
 * by the real writer (no hand-written JSON record). `createSingingSavedTask` drives the real Cover
 * birth/execute transaction to a SAVED MASTER. Both return only references; a caller can never
 * inject a record as proof.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { openFixtureTaskCatalog } from '../../core/audio/task-catalog.mjs'
import { openFixtureTaskOwner } from '../../core/audio/task-owner.mjs'
import { openFixtureArtifactLibrary } from '../../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../../core/audio/cover-stage-bytes-internal.mjs'
import { createCoverTask, executeCover } from './cover-run.mjs'

export function fixtureRunnerExample() {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf('## 7.')
  assert.ok(at >= 0)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

export async function createVoiceSavedTask(sandbox, options = {}) {
  const {
    scopeId = 'scope:fixture-demo',
    idempotencyKey = 'key:fixture-relay-voice',
    saveRequestKey = 'save:relay-voice',
    now = '2026-10-27T00:00:00.000Z',
    saveNow = '2026-10-27T00:00:01.000Z',
    expiresAt = '2026-10-28T00:00:00.000Z',
    proofRef = 'fixture-rights:relay-demo',
    deliveryRequested = true,
  } = options
  const example = fixtureRunnerExample()
  const binding = example.sourceInput.voiceBinding
  const catalog = await openFixtureTaskCatalog({ sandbox })
  assert.equal(catalog.ok, true, JSON.stringify(catalog))
  const draft = JSON.parse(JSON.stringify(binding.taskDraft))
  delete draft.taskId
  draft.deliveryRequested = deliveryRequested
  const reserved = await catalog.value.reserve({
    schemaVersion: 1, scopeId, idempotencyKey, draft, observedAt: now,
  })
  assert.equal(reserved.ok, true, JSON.stringify(reserved))
  const taskId = reserved.value.task.taskId

  const input = JSON.parse(JSON.stringify(example))
  input.sourceInput.voiceBinding.taskDraft.taskId = taskId
  input.sourceInput.voiceBinding.taskDraft.deliveryRequested = deliveryRequested

  const owner = await openFixtureTaskOwner({ sandbox })
  assert.equal(owner.ok, true, JSON.stringify(owner))
  const saved = await owner.value.save({
    schemaVersion: 1, scopeId, taskId, requestKey: saveRequestKey, now: saveNow, expiresAt,
    rights: { state: 'GRANTED', proofRef }, input,
  })
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.value.ownerState, 'SAVED')
  return {
    scopeId,
    taskId,
    artifactRef: saved.value.artifact.artifactRef,
    artifactSha256: saved.value.artifact.sha256,
    artifactByteLength: saved.value.artifact.byteLength,
    sourceRef: draft.source.ref,
    expiresAt,
    saveNow,
    proofRef,
    saved,
  }
}

function coverDraft(scopeId, sourceRef, expiresAt, proofRef) {
  return {
    intentVersion: 1,
    scopeId,
    sourceRef,
    sourceRevision: 1,
    rightsState: 'GRANTED',
    rightsProofRef: proofRef,
    rightsExpiresAt: expiresAt,
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
    recipe: { sourceLayout: 'MIXED', separationPreset: 'FIXTURE_TWO_STEM', mixMode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 },
    outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 1 },
  }
}

export async function createSingingSavedTask(sandbox, options = {}) {
  const {
    scopeId = 'scope:fixture-relay-singing',
    now = '2026-11-01T00:00:00.000Z',
    expiresAt = '2026-11-02T00:00:00.000Z',
    proofRef = 'fixture-rights:relay-singing',
    importKey = 'import:relay-singing',
    birthKey = 'cover:relay-singing',
    runKey = 'exec:relay-singing',
  } = options
  const library = await openFixtureArtifactLibrary({ sandbox })
  assert.equal(library.ok, true)
  const imported = await library.value.import({
    schemaVersion: 1, scopeId, requestKey: importKey,
    bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now, expiresAt, rights: { state: 'GRANTED', proofRef },
  })
  assert.equal(imported.ok, true, JSON.stringify(imported))
  const sourceRef = imported.value.artifact.artifactRef
  const birth = await createCoverTask({
    sandbox, scopeId, idempotencyKey: birthKey,
    intentDraft: coverDraft(scopeId, sourceRef, expiresAt, proofRef), observedAt: now,
  })
  assert.equal(birth.ok, true, JSON.stringify(birth))
  const run = await executeCover({
    sandbox, scopeId, taskId: birth.value.taskId, requestKey: runKey, now, expiresAt,
    rights: { state: 'GRANTED', proofRef }, intent: birth.value.intent,
  })
  assert.equal(run.ok, true, JSON.stringify(run))
  assert.equal(run.value.outcome, 'SAVED')
  const master = run.value.value.master
  return {
    scopeId,
    taskId: birth.value.taskId,
    artifactRef: master.artifactRef,
    artifactSha256: master.sha256,
    artifactByteLength: master.byteLength,
    sourceRef,
    expiresAt,
    proofRef,
    run,
  }
}

export function relayHandoff({ scopeId, taskId, artifactRef, targetId, requestKey, proofRef, overrides = {} }) {
  return {
    handoff: {
      schemaVersion: 1,
      scopeId,
      taskId,
      artifactRef,
      targetId,
      requestKey,
      rights: { state: 'GRANTED', proofRef },
      ...overrides,
    },
  }
}

export function mutableClock(startIso) {
  let value = startIso
  return {
    now: () => value,
    set(next) { value = next },
    advance(ms) { value = new Date(Date.parse(value) + ms).toISOString() },
  }
}
