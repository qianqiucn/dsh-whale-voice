/* Whale Voice — Cover lifecycle unification (Plan 08-F-B / 090, v1.80 R01–R04).
 *
 * Real interruption -> resume must release the exact attempt lease, concurrent resume must return
 * the completed result, an accepted cancel must not be bypassed by resume, an unconfirmed JOINT must
 * stay UNKNOWN across status/retry/resume, and a cancellation-observation read failure must return
 * the fixed error envelope instead of rejecting.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, coverStatus, createCoverTask, executeCover, requestCoverCancel, resumeCoverFinal } from './support/cover-run.mjs'
import { acquireCoverLease, isCoverGpuBusy, releaseCoverLease } from '../core/audio/cover-lease-internal.mjs'

const SCOPE = 'scope:fixture-lifecycle'
const PROOF = 'fixture-rights:cover-lifecycle'
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
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:lifecycle', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:lifecycle', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  return { sandbox, birth }
}

function run(sandbox, birth, key = 'cover-exec:lifecycle') {
  return executeCover({
    sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: key, now: NOW, expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
  })
}

function ownerDoc(sandbox) {
  return JSON.parse(fs.readFileSync(path.join(sandbox.root, OWNER_FILE), 'utf8'))
}

function packEntries(sandbox) {
  return JSON.parse(fs.readFileSync(path.join(sandbox.root, ARTIFACT_FILE), 'utf8')).entries
}

/** Real interruption: the owner read inside finalizeCoverSaved fails after checkpoint[4]. */
async function interruptAfterReceipt(sandbox, birth) {
  const originalRead = fs.readFileSync
  const originalRename = fs.renameSync
  let armed = false
  let reads = 0
  let thrown = false
  fs.renameSync = function patchedRename(from, to) {
    originalRename(from, to)
    if (typeof to === 'string' && path.basename(to) === OWNER_FILE) {
      try {
        const doc = JSON.parse(originalRead.call(fs, to, 'utf8'))
        const entry = doc.entries && doc.entries[0]
        if (entry && entry.phase === 'CLAIMED' && (entry.checkpoints || []).some((checkpoint) => checkpoint.index === 4)) {
          armed = true
          reads = 0
        }
      } catch {}
    }
  }
  fs.readFileSync = function patchedRead(target, ...rest) {
    if (armed && !thrown && typeof target === 'string' && path.basename(target) === OWNER_FILE) {
      reads += 1
      // The first read is the writer's own post-rename verification; the next one is the FINAL
      // transaction's fresh read, which is where the simulated process interruption happens.
      if (reads >= 2) {
        thrown = true
        throw new Error('injected interruption after receipt')
      }
    }
    return originalRead.call(fs, target, ...rest)
  }
  let result
  try {
    result = await run(sandbox, birth)
  } finally {
    fs.readFileSync = originalRead
    fs.renameSync = originalRename
  }
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal([COVER_EXECUTION_CODES.EXECUTION_UNKNOWN, COVER_EXECUTION_CODES.SAVE_UNKNOWN].includes(result.errors[0].code), true, result.errors[0].code)
  assert.equal(isCoverGpuBusy(sandbox), true)
  return result
}

test('a real interrupted receipt is resumed, releases the lease and lets the next task run', async () => {
  const { sandbox, birth } = await setup()
  try {
    await interruptAfterReceipt(sandbox, birth)
    const claimed = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(claimed.ok, true, JSON.stringify(claimed))
    assert.equal(claimed.value.state, 'CLAIMED')
    const attemptId = claimed.value.attemptId

    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: 'cover-exec:lifecycle', now: NOW })
    assert.equal(resumed.ok, true)
    assert.equal(resumed.value.outcome, 'SAVED')
    assert.equal(isCoverGpuBusy(sandbox), false)
    const lease = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(lease.ok, true)
    releaseCoverLease({ sandbox, leaseId: lease.value.leaseId })

    const second = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:lifecycle-2', intentDraft: draft(birth.value.intent.sourceRef), observedAt: NOW })
    const later = await run(sandbox, second, 'cover-exec:lifecycle-2')
    assert.equal(later.ok, true)
    assert.equal(later.value.outcome, 'SAVED')
    assert.equal(packEntries(sandbox).length, 3)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('two concurrent resumes return SAVED and EXISTING, not EXECUTION_UNKNOWN', async () => {
  const { sandbox, birth } = await setup()
  try {
    await interruptAfterReceipt(sandbox, birth)
    const claimed = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    const attemptId = claimed.value.attemptId
    const [first, second] = await Promise.all([
      resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: 'cover-exec:lifecycle', now: NOW }),
      resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: 'cover-exec:lifecycle', now: NOW }),
    ])
    const outcomes = [first, second].map((result) => (result.ok ? result.value.outcome : result.errors[0].code)).sort()
    assert.deepEqual(outcomes, ['EXISTING', 'SAVED'])
    assert.equal(isCoverGpuBusy(sandbox), false)
    assert.equal(packEntries(sandbox).length, 2)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an accepted cancel is completed by resume instead of being bypassed into SAVED', async () => {
  const { sandbox, birth } = await setup()
  try {
    await interruptAfterReceipt(sandbox, birth)
    const claimed = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    const attemptId = claimed.value.attemptId
    const cancel = await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, now: NOW })
    assert.equal(cancel.ok, true)
    assert.equal(cancel.value.cancelState, 'ACCEPTED')
    const persisted = ownerDoc(sandbox).entries[0]
    assert.equal(persisted.cancel.requested, true)

    const resumed = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, requestKey: 'cover-exec:lifecycle', now: NOW })
    assert.equal(resumed.ok, true)
    assert.equal(resumed.value.outcome, 'CANCELLED')
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.value.state, 'CANCELLED')
    assert.equal(isCoverGpuBusy(sandbox), false)
    assert.equal(packEntries(sandbox).length, 2)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

async function runWithJointFailure(sandbox, birth, failArtifact) {
  const originalRename = fs.renameSync
  const originalOpen = fs.openSync
  let finalWritten = false
  let thrown = false
  fs.renameSync = function patchedRename(from, to) {
    originalRename(from, to)
    if (typeof to === 'string' && path.basename(to) === OWNER_FILE) {
      try {
        const doc = JSON.parse(fs.readFileSync(to, 'utf8'))
        if (doc.entries && doc.entries.some((entry) => entry.phase === 'FINAL')) finalWritten = true
      } catch {}
    }
  }
  fs.openSync = function patchedOpen(target, ...rest) {
    if (finalWritten && !thrown && typeof target === 'string') {
      const name = path.basename(target)
      if ((failArtifact && name === ARTIFACT_FILE) || (!failArtifact && name === OWNER_FILE)) {
        thrown = true
        throw new Error('injected JOINT confirmation failure')
      }
    }
    return originalOpen.call(fs, target, ...rest)
  }
  try {
    return await run(sandbox, birth)
  } finally {
    fs.renameSync = originalRename
    fs.openSync = originalOpen
  }
}

test('an unconfirmed Artifact JOINT stays UNKNOWN for status/retry and keeps the lease', async () => {
  const { sandbox, birth } = await setup()
  try {
    const result = await runWithJointFailure(sandbox, birth, true)
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SAVE_UNKNOWN)
    assert.equal(isCoverGpuBusy(sandbox), true)
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.ok, false)
    assert.equal(status.errors[0].code, COVER_EXECUTION_CODES.UNKNOWN)
    const retry = await run(sandbox, birth, 'cover-exec:lifecycle-retry')
    assert.equal(retry.ok, false)
    assert.equal(retry.errors[0].code, COVER_EXECUTION_CODES.UNKNOWN)
    assert.equal(packEntries(sandbox).length, 2)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an unconfirmed owner JOINT stays UNKNOWN and keeps the lease', async () => {
  const { sandbox, birth } = await setup()
  try {
    const result = await runWithJointFailure(sandbox, birth, false)
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SAVE_UNKNOWN)
    assert.equal(isCoverGpuBusy(sandbox), true)
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.ok, false)
    assert.equal(status.errors[0].code, COVER_EXECUTION_CODES.UNKNOWN)
    const retry = await run(sandbox, birth, 'cover-exec:lifecycle-retry')
    assert.equal(retry.ok, false)
    assert.equal(retry.errors[0].code, COVER_EXECUTION_CODES.UNKNOWN)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a cancellation-observation read failure returns the fixed error envelope', async () => {
  const { sandbox, birth } = await setup()
  const originalRename = fs.renameSync
  const originalOpen = fs.openSync
  try {
    let ownerRenames = 0
    let arm = false
    let thrown = false
    fs.renameSync = function patchedRename(from, to) {
      originalRename(from, to)
      if (typeof to === 'string' && path.basename(to) === OWNER_FILE) {
        ownerRenames += 1
        if (ownerRenames === 2) arm = true
      }
    }
    fs.openSync = function patchedOpen(target, ...rest) {
      if (arm && !thrown && typeof target === 'string' && path.basename(target) === OWNER_FILE) {
        thrown = true
        throw new Error('injected cancellation observation failure')
      }
      return originalOpen.call(fs, target, ...rest)
    }
    const result = await run(sandbox, birth)
    fs.renameSync = originalRename
    fs.openSync = originalOpen
    assert.equal(result.ok, false)
    assert.equal(Array.isArray(result.errors), true)
    assert.equal(typeof result.errors[0].code, 'string')
    assert.equal(isCoverGpuBusy(sandbox), true)
    const entry = ownerDoc(sandbox).entries[0]
    assert.equal(entry.phase, 'CLAIMED')
    assert.equal(entry.attempt.lease.releasedAt, null)
  } finally {
    fs.renameSync = originalRename
    fs.openSync = originalOpen
    removeConfigSandbox(sandbox)
  }
})
