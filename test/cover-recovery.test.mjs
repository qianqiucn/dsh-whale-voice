/* Whale Voice — Cover crash recovery and terminal identity (Plan 08-F-B / 090, OFFLINE).
 *
 * 104-R02/R03: a resume may only continue the exact attempt/request that owns the claim, must use the
 * persisted checkpoint[4] receipt plus a fresh library proof, and must return the real terminal state
 * (SAVED/EXISTING, CANCELLED, FAILED) instead of fabricating SAVED. A crash between the durable
 * receipt and FINAL is simulated by failing the fresh proof read, which leaves a real CLAIMED entry
 * with the receipt on disk; the resume then completes it with zero second import.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, coverStatus, createCoverTask, executeCover, requestCoverCancel, resumeCoverFinal } from '../core/audio/cover-executor-internal.mjs'

const SCOPE = 'scope:fixture-recovery'
const PROOF = 'fixture-rights:cover-recovery'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const OWNER_FILE = 'audio-task-owner-v1.json'
const ARTIFACT_FILE = 'audio-artifacts-v1.json'
const EXEC_KEY = 'cover-exec:recovery'

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
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:recovery-source', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:recovery', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  return { sandbox, library, birth }
}

function run(sandbox, birth, requestKey) {
  return executeCover({
    sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey, now: NOW, expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
  })
}

function ownerBytes(sandbox) {
  return fs.readFileSync(path.join(sandbox.root, OWNER_FILE))
}

function packEntries(sandbox) {
  return JSON.parse(fs.readFileSync(path.join(sandbox.root, ARTIFACT_FILE), 'utf8')).entries
}

/**
 * Capture the exact durable owner bytes written by the checkpoint[4] write (after the real rename,
 * before FINAL) and then restore them after a normal run. This is the state a process crash at that
 * window leaves on disk — no test-only hook exists in production code.
 */
async function runAndCaptureReceiptState(sandbox, birth) {
  const original = fs.renameSync
  let imported = false
  let ownerRenames = 0
  let snapshot = null
  fs.renameSync = function patchedRename(from, to) {
    original(from, to)
    if (typeof to === 'string' && path.basename(to) === ARTIFACT_FILE) imported = true
    if (imported && typeof to === 'string' && path.basename(to) === OWNER_FILE) {
      ownerRenames += 1
      if (ownerRenames === 1) snapshot = fs.readFileSync(path.join(sandbox.root, OWNER_FILE))
    }
  }
  let result
  try {
    result = await run(sandbox, birth, EXEC_KEY)
  } finally {
    fs.renameSync = original
  }
  assert.equal(result.ok, true)
  assert.equal(result.value.outcome, 'SAVED')
  assert.notEqual(snapshot, null)
  fs.writeFileSync(path.join(sandbox.root, OWNER_FILE), snapshot)
  return result
}

test('resume completes a real crash state with the correct identity and zero second import', async () => {
  const { sandbox, birth } = await setup()
  try {
    await runAndCaptureReceiptState(sandbox, birth)
    const claimed = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(claimed.value.state, 'CLAIMED')
    assert.notEqual(claimed.value.master, null)
    const attemptId = claimed.value.attemptId
    assert.equal(packEntries(sandbox).length, 2)

    const before = ownerBytes(sandbox)
    const wrongAttempt = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: 'cover-attempt:' + '0'.repeat(32), requestKey: EXEC_KEY, now: NOW })
    assert.equal(wrongAttempt.ok, false)
    assert.equal(wrongAttempt.errors[0].code, COVER_EXECUTION_CODES.NOT_FOUND)
    assert.equal(wrongAttempt.errors[0].path, 'attemptId')
    const wrongKey = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: 'cover-exec:other', now: NOW })
    assert.equal(wrongKey.ok, false)
    assert.equal(wrongKey.errors[0].code, COVER_EXECUTION_CODES.NOT_FOUND)
    assert.equal(wrongKey.errors[0].path, 'requestKey')
    assert.equal(ownerBytes(sandbox).equals(before), true)

    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(resumed.ok, true)
    assert.equal(resumed.value.outcome, 'SAVED')
    assert.equal(packEntries(sandbox).length, 2)
    const saved = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(saved.value.state, 'SAVED')
    assert.equal(saved.value.stages[3].status, 'DONE')

    const again = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(again.ok, true)
    assert.equal(again.value.outcome, 'EXISTING')
    assert.equal(packEntries(sandbox).length, 2)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an artifact deleted between receipt and FINAL is never turned into SAVED', async () => {
  const { sandbox, library, birth } = await setup()
  try {
    await runAndCaptureReceiptState(sandbox, birth)
    const claimed = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(claimed.value.state, 'CLAIMED')
    const attemptId = claimed.value.attemptId
    const deleted = await library.value.delete({
      schemaVersion: 1, scopeId: SCOPE, artifactRef: claimed.value.master.artifactRef, now: NOW,
    })
    assert.equal(deleted.ok, true)
    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(resumed.ok, false)
    assert.equal(resumed.errors[0].code, COVER_EXECUTION_CODES.SAVE_REJECTED)
    const after = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(after.value.state, 'CLAIMED')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an uncertain FINAL rename locks the store and never reruns silently', async () => {
  const { sandbox, birth } = await setup()
  const original = fs.renameSync
  try {
    let imported = false
    let ownerRenames = 0
    fs.renameSync = function patchedRename(from, to) {
      original(from, to)
      if (typeof to === 'string' && path.basename(to) === ARTIFACT_FILE) imported = true
      if (imported && typeof to === 'string' && path.basename(to) === OWNER_FILE) {
        ownerRenames += 1
        if (ownerRenames === 2) throw new Error('injected uncertain FINAL rename')
      }
    }
    const result = await run(sandbox, birth, EXEC_KEY)
    fs.renameSync = original
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SAVE_UNKNOWN)
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.ok, false)
    assert.equal(status.errors[0].code, COVER_EXECUTION_CODES.UNKNOWN)
    const again = await run(sandbox, birth, EXEC_KEY)
    assert.equal(again.ok, false)
    assert.equal(again.errors[0].code, COVER_EXECUTION_CODES.UNKNOWN)
    assert.equal(packEntries(sandbox).length, 2)
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})

test('resume returns the real CANCELLED terminal instead of SAVED', async () => {
  const { sandbox, birth } = await setup()
  try {
    const pending = run(sandbox, birth, EXEC_KEY)
    let attemptId = null
    for (let i = 0; i < 200 && attemptId === null; i += 1) {
      const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
      if (status.value.attemptId) attemptId = status.value.attemptId
      else await new Promise((resolve) => setImmediate(resolve))
    }
    assert.notEqual(attemptId, null)
    await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, now: NOW })
    const cancelled = await pending
    assert.equal(cancelled.value.outcome, 'CANCELLED')
    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(resumed.ok, true)
    assert.equal(resumed.value.outcome, 'CANCELLED')
    assert.equal(resumed.value.statusState, 'CANCELLED')
    const wrong = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: 'cover-attempt:' + 'f'.repeat(32), requestKey: EXEC_KEY, now: NOW })
    assert.equal(wrong.ok, false)
    assert.equal(wrong.errors[0].code, COVER_EXECUTION_CODES.NOT_FOUND)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('resume returns the real FAILED terminal instead of SAVED', async () => {
  const { sandbox, birth } = await setup()
  const original = fs.renameSync
  try {
    let failed = false
    fs.renameSync = function patchedRename(from, to) {
      if (!failed && typeof to === 'string' && path.basename(to) === ARTIFACT_FILE) {
        failed = true
        throw new Error('injected import failure')
      }
      return original(from, to)
    }
    const result = await run(sandbox, birth, EXEC_KEY)
    fs.renameSync = original
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SAVE_REJECTED)
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.value.state, 'FAILED')
    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: status.value.attemptId, requestKey: EXEC_KEY, now: NOW })
    assert.equal(resumed.ok, true)
    assert.equal(resumed.value.outcome, 'FAILED')
    assert.equal(resumed.value.statusState, 'FAILED')
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})
