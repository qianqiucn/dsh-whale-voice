/* Whale Voice — Cover single-claim concurrency (Plan 08-F-B / 090, OFFLINE / FIXTURE_ONLY).
 *
 * 104-R01: the outer owner read is only a fast path. The queue is the single writer, so the claim
 * gate must re-read the birth and the current entry inside the queue and return the existing
 * terminal/claim instead of minting a second attempt. Terminal states never rerun.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, coverStatus, createCoverTask, executeCover, requestCoverCancel } from './support/cover-run.mjs'
import { getCoverState, lockCoverStore } from '../core/audio/cover-store-internal.mjs'

const SCOPE = 'scope:fixture-concurrency'
const PROOF = 'fixture-rights:cover-concurrency'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const OWNER_FILE = 'audio-task-owner-v1.json'
const ARTIFACT_FILE = 'audio-artifacts-v1.json'

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
    schemaVersion: 1,
    scopeId: SCOPE,
    requestKey: 'import:concurrency-source',
    bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  return { sandbox, library, sourceRef: imported.value.artifact.artifactRef }
}

async function birth(sandbox, sourceRef, key) {
  const created = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: key, intentDraft: draft(sourceRef), observedAt: NOW })
  assert.equal(created.ok, true)
  return created
}

function run(sandbox, created, requestKey) {
  return executeCover({
    sandbox,
    scopeId: SCOPE,
    taskId: created.value.taskId,
    requestKey,
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
    intent: created.value.intent,
  })
}

function ownerEntries(sandbox) {
  const file = path.join(sandbox.root, OWNER_FILE)
  if (!fs.existsSync(file)) return []
  return JSON.parse(fs.readFileSync(file, 'utf8')).entries
}

function packEntries(sandbox) {
  return JSON.parse(fs.readFileSync(path.join(sandbox.root, ARTIFACT_FILE), 'utf8')).entries
}

test('two concurrent executions with the same request key save once and share one attempt', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const created = await birth(sandbox, sourceRef, 'cover:concurrent-same')
    const [first, second] = await Promise.all([run(sandbox, created, 'cover-exec:same'), run(sandbox, created, 'cover-exec:same')])
    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.deepEqual([first.value.outcome, second.value.outcome].sort(), ['EXISTING', 'SAVED'])
    assert.equal(first.value.attemptId, second.value.attemptId)
    assert.equal(ownerEntries(sandbox).length, 1)
    assert.equal(packEntries(sandbox).length, 2)
    const saved = await coverStatus({ sandbox, scopeId: SCOPE, taskId: created.value.taskId, now: NOW })
    assert.equal(saved.value.state, 'SAVED')
    assert.equal(saved.value.attemptSeq, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('two concurrent executions with different request keys still claim once', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const created = await birth(sandbox, sourceRef, 'cover:concurrent-diff')
    const [first, second] = await Promise.all([run(sandbox, created, 'cover-exec:diff-a'), run(sandbox, created, 'cover-exec:diff-b')])
    assert.deepEqual([first.value.outcome, second.value.outcome].sort(), ['EXISTING', 'SAVED'])
    assert.equal(first.value.attemptId, second.value.attemptId)
    assert.equal(ownerEntries(sandbox).length, 1)
    assert.equal(packEntries(sandbox).length, 2)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('different Cover tasks still execute independently and keep separate MASTERs', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const a = await birth(sandbox, sourceRef, 'cover:concurrent-task-a')
    const b = await birth(sandbox, sourceRef, 'cover:concurrent-task-b')
    const [first, second] = await Promise.all([run(sandbox, a, 'cover-exec:task-a'), run(sandbox, b, 'cover-exec:task-b')])
    assert.equal(first.value.outcome, 'SAVED')
    assert.equal(second.value.outcome, 'SAVED')
    assert.notEqual(first.value.attemptId, second.value.attemptId)
    assert.notEqual(first.value.value.master.artifactRef, second.value.value.master.artifactRef)
    assert.equal(ownerEntries(sandbox).length, 2)
    assert.equal(packEntries(sandbox).length, 3)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a FAILED terminal is never rerun by a later execution request', async () => {
  const { sandbox, sourceRef } = await setup()
  const original = fs.renameSync
  try {
    const created = await birth(sandbox, sourceRef, 'cover:failed-once')
    let failed = false
    fs.renameSync = function patchedRename(from, to) {
      if (!failed && typeof to === 'string' && path.basename(to) === ARTIFACT_FILE) {
        failed = true
        throw new Error('injected artifact rename failure')
      }
      return original(from, to)
    }
    const first = await run(sandbox, created, 'cover-exec:failed')
    fs.renameSync = original
    assert.equal(first.ok, false)
    assert.equal(first.errors[0].code, COVER_EXECUTION_CODES.SAVE_REJECTED)
    const entriesAfterFailure = ownerEntries(sandbox)
    assert.equal(entriesAfterFailure.length, 1)
    assert.equal(entriesAfterFailure[0].completion.kind, 'FAILED')

    const second = await run(sandbox, created, 'cover-exec:failed-retry')
    assert.equal(second.ok, true)
    assert.equal(second.value.outcome, 'FAILED')
    assert.equal(second.value.attemptId, entriesAfterFailure[0].attempt.attemptId)
    assert.equal(ownerEntries(sandbox).length, 1)
    assert.equal(packEntries(sandbox).length, 1)
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})

test('a CANCELLED terminal is never rerun by a later execution request', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const created = await birth(sandbox, sourceRef, 'cover:cancelled-once')
    const pending = run(sandbox, created, 'cover-exec:cancelled')
    let attemptId = null
    for (let i = 0; i < 200 && attemptId === null; i += 1) {
      const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: created.value.taskId, now: NOW })
      if (status.value.attemptId) attemptId = status.value.attemptId
      else await new Promise((resolve) => setImmediate(resolve))
    }
    assert.notEqual(attemptId, null)
    await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: created.value.taskId, attemptId, now: NOW })
    const first = await pending
    assert.equal(first.value.outcome, 'CANCELLED')
    const entriesAfterCancel = ownerEntries(sandbox)
    assert.equal(entriesAfterCancel.length, 1)

    const second = await run(sandbox, created, 'cover-exec:cancelled-retry')
    assert.equal(second.ok, true)
    assert.equal(second.value.outcome, 'CANCELLED')
    assert.equal(second.value.attemptId, entriesAfterCancel[0].attempt.attemptId)
    assert.equal(ownerEntries(sandbox).length, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a locked Cover store reports UNKNOWN instead of minting a new attempt', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const created = await birth(sandbox, sourceRef, 'cover:locked')
    lockCoverStore(getCoverState(sandbox))
    const result = await run(sandbox, created, 'cover-exec:locked')
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.UNKNOWN)
    assert.equal(ownerEntries(sandbox).length, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
