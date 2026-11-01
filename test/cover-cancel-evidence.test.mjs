/* Whale Voice — Cover cancellation evidence (Plan 08-F-B / 090, OFFLINE / FIXTURE_ONLY).
 *
 * Proves the contract §8.1 cooperation points (a 4,096-frame synchronous fence read and a real
 * macrotask yield at least every 65,536 frames) and the §8.2/§8.3 evidence chain:
 *   request (ACCEPTED) -> acknowledged (persisted) -> stopped (FINAL CANCELLED) ->
 *   lease released -> attempt-owned temp bytes cleaned, with no MASTER import.
 *
 * The frame-level cooperation is proven directly against the chunked stage functions; the executor
 * tests drive a real sandbox and read the real owner file at every atomic rename, so ACKNOWLEDGED is
 * observed on disk before STOPPED rather than inferred from timing.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import {
  COVER_CANCEL_CHECK_FRAMES,
  COVER_CANCEL_YIELD_FRAMES,
  buildCoverStageRecord,
  convertVocalCooperative,
  mixStemsCooperative,
  separateTwoStemCooperative,
  wavFromSamples,
} from '../core/audio/cover-stage-bytes-internal.mjs'
import { coverStatus, createCoverTask, executeCover, requestCoverCancel } from './support/cover-run.mjs'

const SCOPE = 'scope:fixture-cancel'
const PROOF = 'fixture-rights:cover-cancel'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const OWNER_FILE = 'audio-task-owner-v1.json'
const ARTIFACT_FILE = 'audio-artifacts-v1.json'

function draft(sourceRef, overrides = {}) {
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
    ...overrides,
  }
}

async function setup() {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  assert.equal(library.ok, true)
  const imported = await library.value.import({
    schemaVersion: 1,
    scopeId: SCOPE,
    requestKey: 'import:cover-cancel-source',
    bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  return { sandbox, library, sourceRef: imported.value.artifact.artifactRef }
}

function startRun(sandbox, birth) {
  return executeCover({
    sandbox,
    scopeId: SCOPE,
    taskId: birth.value.taskId,
    requestKey: 'cover-exec:cancel',
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
    intent: birth.value.intent,
  })
}

async function readStatus(sandbox, taskId) {
  return coverStatus({ sandbox, scopeId: SCOPE, taskId, now: NOW })
}

async function waitForStatus(sandbox, taskId, predicate) {
  for (let i = 0; i < 500; i += 1) {
    const status = await readStatus(sandbox, taskId)
    if (status.ok && predicate(status.value)) return status.value
    await new Promise((resolve) => setImmediate(resolve))
  }
  return null
}

/** Snapshot the real owner file after every atomic rename, so intermediate writes are not guessed. */
function captureOwnerWrites() {
  const original = fs.renameSync
  const snapshots = []
  fs.renameSync = function patchedRename(from, to) {
    original(from, to)
    if (typeof to === 'string' && path.basename(to) === OWNER_FILE) {
      try {
        snapshots.push(JSON.parse(fs.readFileSync(to, 'utf8')))
      } catch {
        // a snapshot that cannot be read is itself a failure of the store contract
      }
    }
  }
  return {
    snapshots,
    restore() {
      fs.renameSync = original
    },
  }
}

function tempLeftovers(sandbox) {
  return fs.readdirSync(sandbox.root).filter((name) => name.includes('.tmp-'))
}

/* ------------------------------------------------------------- frame cooperation ------------ */

test('the chunked SEPARATING stage checks every 4,096 frames and yields every 65,536 frames', async () => {
  const samples = new Array(200000).fill(7)
  let checks = 0
  let yields = 0
  const cancelled = await separateTwoStemCooperative(samples, {
    isCancelled: () => {
      checks += 1
      return yields >= 1
    },
    yieldNow: async () => {
      yields += 1
    },
  })
  assert.equal(cancelled.cancelled, true)
  assert.equal(yields, 1)
  assert.equal(checks, COVER_CANCEL_YIELD_FRAMES / COVER_CANCEL_CHECK_FRAMES + 1)

  let yieldCount = 0
  const complete = await separateTwoStemCooperative(samples, {
    isCancelled: () => false,
    yieldNow: async () => {
      yieldCount += 1
    },
  })
  assert.equal(complete.cancelled, false)
  assert.equal(complete.vocal.length, samples.length)
  assert.equal(yieldCount, Math.floor(samples.length / COVER_CANCEL_YIELD_FRAMES))
  assert.equal(complete.vocal[0], 3)
  assert.equal(complete.instrumental[0], 4)
})

test('the chunked CONVERTING and MIXING stages honour the same cancel contract', async () => {
  const samples = new Array(120000).fill(1000)
  let convertYields = 0
  const converting = await convertVocalCooperative(samples, 7, {
    isCancelled: () => convertYields >= 1,
    yieldNow: async () => {
      convertYields += 1
    },
  })
  assert.equal(converting.cancelled, true)

  const converted = new Array(120000).fill(1000)
  const instrumental = new Array(120000).fill(-1000)
  let mixYields = 0
  const mixing = await mixStemsCooperative(
    { converted, instrumental, vocalGainDb: 0, instrumentalGainDb: 0 },
    {
      isCancelled: () => mixYields >= 1,
      yieldNow: async () => {
        mixYields += 1
      },
    },
  )
  assert.equal(mixing.cancelled, true)
})

/* ------------------------------------------------------------- executor evidence -------------- */

test('a cancel accepted during the run stops before CONVERTED and cleans its temp bytes', async () => {
  const { sandbox, library, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:cancel-1', intentDraft: draft(sourceRef), observedAt: NOW })
    assert.equal(birth.ok, true)
    const capture = captureOwnerWrites()
    let run
    try {
      const pending = startRun(sandbox, birth)
      const separated = await waitForStatus(sandbox, birth.value.taskId, (value) => value.stages.length > 0 && value.stages[0].status === 'DONE')
      assert.notEqual(separated, null)
      const cancel = await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: separated.attemptId, now: NOW })
      assert.equal(cancel.ok, true)
      assert.equal(cancel.value.cancelState, 'ACCEPTED')
      run = await pending
    } finally {
      capture.restore()
    }
    assert.equal(run.ok, true)
    assert.equal(run.value.outcome, 'CANCELLED')

    const status = await readStatus(sandbox, birth.value.taskId)
    assert.equal(status.value.state, 'CANCELLED')
    assert.equal(status.value.cancel.requested, true)
    assert.equal(typeof status.value.cancel.acknowledgedAt, 'string')
    assert.equal(typeof status.value.cancel.confirmedAt, 'string')
    assert.equal(status.value.lease.releasedAt !== null, true)
    assert.equal(status.value.stages[0].status, 'DONE')
    assert.equal(status.value.stages[1].status, 'PENDING')
    assert.equal(status.value.tempArtifacts.length, 1)
    assert.equal(status.value.tempArtifacts[0].role, 'VOCAL')
    assert.equal(status.value.tempArtifacts[0].availability, 'CLEANED')
    assert.equal(status.value.master, null)

    // Fact 2 must be on disk separately from fact 3: an acknowledged-but-not-confirmed snapshot
    // exists before the FINAL CANCELLED snapshot.
    const acknowledged = capture.snapshots.filter((snapshot) => snapshot.entries[0].cancel.acknowledgedAt && !snapshot.entries[0].cancel.confirmedAt)
    const stopped = capture.snapshots.filter((snapshot) => snapshot.entries[0].cancel.confirmedAt)
    assert.equal(acknowledged.length >= 1, true)
    assert.equal(stopped.length >= 1, true)
    assert.equal(stopped[stopped.length - 1].entries[0].phase, 'FINAL')
    assert.equal(stopped[stopped.length - 1].entries[0].attempt.lease.releasedAt !== null, true)

    const pack = JSON.parse(fs.readFileSync(path.join(sandbox.root, ARTIFACT_FILE), 'utf8'))
    assert.equal(pack.entries.length, 1)
    assert.equal(pack.entries[0].artifactRef, sourceRef)
    assert.deepEqual(tempLeftovers(sandbox), [])
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a cancel accepted during CONVERTING keeps MIXING pending and imports nothing', async () => {
  const { sandbox, library, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:cancel-2', intentDraft: draft(sourceRef), observedAt: NOW })
    const pending = startRun(sandbox, birth)
    const converted = await waitForStatus(sandbox, birth.value.taskId, (value) => value.stages.length > 1 && value.stages[1].status === 'DONE')
    assert.notEqual(converted, null)
    const cancel = await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: converted.attemptId, now: NOW })
    assert.equal(cancel.value.cancelState, 'ACCEPTED')
    const run = await pending
    assert.equal(run.value.outcome, 'CANCELLED')
    const status = await readStatus(sandbox, birth.value.taskId)
    assert.equal(status.value.stages[2].status, 'PENDING')
    assert.equal(status.value.tempArtifacts.length, 2)
    assert.equal(status.value.tempArtifacts.every((item) => item.availability === 'CLEANED'), true)
    assert.equal(status.value.master, null)
    const pack = JSON.parse(fs.readFileSync(path.join(sandbox.root, ARTIFACT_FILE), 'utf8'))
    assert.equal(pack.entries.length, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a cancel observed during the import keeps the STORED MASTER and stops before VERIFIED', async () => {
  const { sandbox, library, sourceRef } = await setup()
  const original = fs.renameSync
  let cancelPromise = null
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:cancel-import', intentDraft: draft(sourceRef), observedAt: NOW })
    fs.renameSync = function patchedRename(from, to) {
      original(from, to)
      if (typeof to === 'string' && path.basename(to) === ARTIFACT_FILE && cancelPromise === null) {
        const owner = JSON.parse(fs.readFileSync(path.join(sandbox.root, OWNER_FILE), 'utf8'))
        const attemptId = owner.entries[0].attempt.attemptId
        cancelPromise = requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, now: NOW })
      }
    }
    const run = await startRun(sandbox, birth)
    fs.renameSync = original
    assert.notEqual(cancelPromise, null)
    const cancel = await cancelPromise
    assert.equal(cancel.value.cancelState, 'ACCEPTED')
    assert.equal(run.value.outcome, 'CANCELLED')

    const status = await readStatus(sandbox, birth.value.taskId)
    assert.equal(status.value.state, 'CANCELLED')
    assert.equal(status.value.stages[3].status, 'PENDING')
    assert.notEqual(status.value.master, null)
    assert.equal(status.value.tempArtifacts.some((item) => item.role === 'MASTER' && item.availability === 'STORED'), true)
    assert.equal(status.value.lease.releasedAt !== null, true)

    // The imported MASTER is kept (never deleted) and is still readable through the real library.
    const pack = JSON.parse(fs.readFileSync(path.join(sandbox.root, ARTIFACT_FILE), 'utf8'))
    assert.equal(pack.entries.length, 2)
    const stored = await library.value.get({ schemaVersion: 1, scopeId: SCOPE, artifactRef: status.value.master.artifactRef, now: NOW, rights: { state: 'GRANTED', proofRef: PROOF } })
    assert.equal(stored.ok, true)
    assert.equal(stored.value.outcome, 'FOUND')
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})

test('a cancel accepted right after the claim stops before any stage checkpoint', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:cancel-3', intentDraft: draft(sourceRef), observedAt: NOW })
    const pending = startRun(sandbox, birth)
    const claimed = await waitForStatus(sandbox, birth.value.taskId, (value) => value.state === 'CLAIMED' && typeof value.attemptId === 'string')
    assert.notEqual(claimed, null)
    const cancel = await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: claimed.attemptId, now: NOW })
    assert.equal(cancel.value.cancelState, 'ACCEPTED')
    const run = await pending
    assert.equal(run.value.outcome, 'CANCELLED')
    const status = await readStatus(sandbox, birth.value.taskId)
    assert.equal(status.value.stages.every((stage) => stage.status === 'PENDING'), true)
    assert.deepEqual(status.value.tempArtifacts, [])
    assert.equal(status.value.lease.releasedAt !== null, true)
    assert.equal(status.value.cancel.confirmedAt !== null, true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
