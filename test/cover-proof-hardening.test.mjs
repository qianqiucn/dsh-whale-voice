/* Whale Voice — Cover save/recovery proof hardening (Plan 08-F-B / 090, v1.77 A).
 *
 * The persisted checkpoint[4] receipt and the manifest chain are the only recovery proof. A mutated
 * receipt key, a mutated SOURCE hash, a rewritten historical checkpoint or a FINAL rewrite must never
 * become SAVED and must never be accepted by the writer (delta-only admission).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { coverStatus, createCoverTask, executeCover, resumeCoverFinal } from './support/cover-run.mjs'
import {
  CoverStoreFailure,
  LEGACY_OWNER_FILE,
  getCoverState,
  readCoverOwner,
  writeCoverSnapshot,
} from '../core/audio/cover-store-internal.mjs'

const SCOPE = 'scope:fixture-proof'
const PROOF = 'fixture-rights:cover-proof'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const EXEC_KEY = 'cover-exec:proof'

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
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:proof-source', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:proof', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  return { sandbox, birth }
}

function run(sandbox, birth, requestKey = EXEC_KEY) {
  return executeCover({
    sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey, now: NOW, expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
  })
}

/** Capture and restore the durable owner bytes written by checkpoint[4] (before FINAL). */
async function captureCheckpoint4(sandbox, birth) {
  const original = fs.renameSync
  let imported = false
  let ownerRenames = 0
  let snapshot = null
  fs.renameSync = function patchedRename(from, to) {
    original(from, to)
    if (typeof to === 'string' && path.basename(to) === 'audio-artifacts-v1.json') imported = true
    if (imported && typeof to === 'string' && path.basename(to) === LEGACY_OWNER_FILE) {
      ownerRenames += 1
      if (ownerRenames === 1) snapshot = fs.readFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE))
    }
  }
  let result
  try {
    result = await run(sandbox, birth)
  } finally {
    fs.renameSync = original
  }
  assert.equal(result.value.outcome, 'SAVED')
  fs.writeFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE), snapshot)
  return snapshot
}

function readJson(sandbox) {
  return JSON.parse(fs.readFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE), 'utf8'))
}

function writeJson(sandbox, value) {
  fs.writeFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE), Buffer.from(JSON.stringify(value), 'utf8'))
}

function expectStoreInvalid(fn) {
  assert.throws(fn, (error) => error instanceof CoverStoreFailure && error.key === 'COVER_STORE_INVALID')
}

test('a mutated receipt key is rejected by the writer and never becomes SAVED by resume', async () => {
  const { sandbox, birth } = await setup()
  try {
    const validBytes = await captureCheckpoint4(sandbox, birth)
    const state = getCoverState(sandbox)
    const owner = readCoverOwner(state)
    const mutated = readJson(sandbox)
    mutated.entries[0].checkpoints.find((checkpoint) => checkpoint.index === 4).importReceipt.requestKey = 'import:WRONG'
    expectStoreInvalid(() => writeCoverSnapshot(state, LEGACY_OWNER_FILE, mutated, { baseDigest: owner.digest, mode: 'same' }))
    assert.equal(fs.readFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE)).equals(validBytes), true)

    writeJson(sandbox, mutated)
    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: owner.snapshot.entries[0].attempt.attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(resumed.ok, false)
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.ok, false)

    fs.writeFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE), validBytes)
    const recovered = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: owner.snapshot.entries[0].attempt.attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(recovered.ok, true)
    assert.equal(recovered.value.outcome, 'SAVED')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a mutated SOURCE hash is rejected by the writer and never becomes SAVED by resume', async () => {
  const { sandbox, birth } = await setup()
  try {
    const validBytes = await captureCheckpoint4(sandbox, birth)
    const state = getCoverState(sandbox)
    const owner = readCoverOwner(state)
    const mutated = readJson(sandbox)
    mutated.entries[0].manifest.source.byteSha256 = 'a'.repeat(64)
    expectStoreInvalid(() => writeCoverSnapshot(state, LEGACY_OWNER_FILE, mutated, { baseDigest: owner.digest, mode: 'same' }))
    assert.equal(fs.readFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE)).equals(validBytes), true)

    writeJson(sandbox, mutated)
    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: owner.snapshot.entries[0].attempt.attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(resumed.ok, false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a mutated MASTER inspection field is rejected by the writer and never becomes SAVED', async () => {
  const { sandbox, birth } = await setup()
  try {
    await captureCheckpoint4(sandbox, birth)
    const state = getCoverState(sandbox)
    const owner = readCoverOwner(state)
    const mutated = readJson(sandbox)
    mutated.entries[0].manifest.master.inspection.peak = 0
    expectStoreInvalid(() => writeCoverSnapshot(state, LEGACY_OWNER_FILE, mutated, { baseDigest: owner.digest, mode: 'same' }))
    writeJson(sandbox, mutated)
    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: owner.snapshot.entries[0].attempt.attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(resumed.ok, false)
    const pack = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'audio-artifacts-v1.json'), 'utf8'))
    assert.equal(pack.entries.length, 2)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a rewritten historical checkpoint is rejected by the delta-only writer', async () => {
  const { sandbox, birth } = await setup()
  try {
    await captureCheckpoint4(sandbox, birth)
    const state = getCoverState(sandbox)
    const owner = readCoverOwner(state)
    const mutated = readJson(sandbox)
    mutated.entries[0].checkpoints[0].at = '2026-11-01T00:00:01.000Z'
    expectStoreInvalid(() => writeCoverSnapshot(state, LEGACY_OWNER_FILE, mutated, { baseDigest: owner.digest, mode: 'same' }))
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a FINAL entry is immutable and cannot be rewritten in place', async () => {
  const { sandbox, birth } = await setup()
  try {
    const result = await run(sandbox, birth)
    assert.equal(result.value.outcome, 'SAVED')
    const state = getCoverState(sandbox)
    const owner = readCoverOwner(state)
    const mutated = readJson(sandbox)
    mutated.entries[0].record.outputArtifactRef = 'artifact:fixture-bytes-' + '1'.repeat(32)
    expectStoreInvalid(() => writeCoverSnapshot(state, LEGACY_OWNER_FILE, mutated, { baseDigest: owner.digest, mode: 'same' }))
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.value.state, 'SAVED')
  } finally {
    removeConfigSandbox(sandbox)
  }
})
