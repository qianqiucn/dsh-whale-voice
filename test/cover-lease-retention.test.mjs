/* Whale Voice — Cover lease retention across every exit path (Plan 08-F-B / 090, v1.78 B1).
 *
 * Contract §8.3: the shared GPU lease is released only after a confirmed FINAL SAVED/CANCELLED/FAILED.
 * Claim-write, checkpoint-write, cancel-final and terminal-final failures keep both the claim and
 * the lease; the disk entry keeps `lease.releasedAt:null`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, coverStatus, createCoverTask, executeCover, requestCoverCancel } from './support/cover-run.mjs'
import { acquireCoverLease, isCoverGpuBusy } from '../core/audio/cover-lease-internal.mjs'

const SCOPE = 'scope:fixture-retention'
const PROOF = 'fixture-rights:cover-retention'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const OWNER_FILE = 'audio-task-owner-v1.json'

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

function bigSamples(count) {
  const out = new Array(count)
  for (let i = 0; i < count; i += 1) out[i] = ((i * 37 + 11) % 2000) - 1000
  return out
}

async function setup({ big = false } = {}) {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  const imported = await library.value.import({
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:retention', bytes: wavFromSamples(big ? bigSamples(520000) : [1000, -2000, 32767, -32768], 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:retention', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  return { sandbox, library, birth, artifactRef: imported.value.artifact.artifactRef }
}

function run(sandbox, birth) {
  return executeCover({
    sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:retention', now: NOW, expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
  })
}

function ownerEntry(sandbox) {
  return JSON.parse(fs.readFileSync(path.join(sandbox.root, OWNER_FILE), 'utf8')).entries[0]
}

test('a failed claim write keeps the claim and the lease (store unknown)', async () => {
  const { sandbox, birth } = await setup()
  const original = fs.renameSync
  try {
    let ownerRenames = 0
    fs.renameSync = function patched(from, to) {
      const result = original(from, to)
      if (typeof to === 'string' && path.basename(to) === OWNER_FILE) {
        ownerRenames += 1
        if (ownerRenames === 1) throw new Error('injected claim rename uncertainty')
      }
      return result
    }
    const result = await run(sandbox, birth)
    fs.renameSync = original
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SAVE_UNKNOWN)
    assert.equal(isCoverGpuBusy(sandbox), true)
    const retry = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(retry.ok, false)
    assert.equal(retry.errors[0].code, 'COVER_LEASE_BUSY')
    const entry = ownerEntry(sandbox)
    assert.equal(entry.phase, 'CLAIMED')
    assert.equal(entry.attempt.lease.releasedAt, null)
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})

test('a failed checkpoint write keeps the claim and the lease', async () => {
  const { sandbox, birth } = await setup()
  const original = fs.renameSync
  try {
    let ownerRenames = 0
    fs.renameSync = function patched(from, to) {
      const result = original(from, to)
      if (typeof to === 'string' && path.basename(to) === OWNER_FILE) {
        ownerRenames += 1
        if (ownerRenames === 2) throw new Error('injected checkpoint rename uncertainty')
      }
      return result
    }
    const result = await run(sandbox, birth)
    fs.renameSync = original
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SAVE_UNKNOWN)
    assert.equal(isCoverGpuBusy(sandbox), true)
    const entry = ownerEntry(sandbox)
    assert.equal(entry.phase, 'CLAIMED')
    assert.equal(entry.checkpoints.some((checkpoint) => checkpoint.index === 1), true)
    assert.equal(entry.attempt.lease.releasedAt, null)
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})

test('a failed cancel FINAL write keeps the acknowledged claim and the lease', async () => {
  const { sandbox, birth } = await setup({ big: true })
  const original = fs.renameSync
  try {
    fs.renameSync = function patched(from, to) {
      if (typeof to === 'string' && path.basename(to) === OWNER_FILE && typeof from === 'string' && from.includes('.tmp-')) {
        let doc = null
        try {
          doc = JSON.parse(fs.readFileSync(from, 'utf8'))
        } catch {}
        if (doc && doc.entries && doc.entries.some((entry) => entry.phase === 'FINAL' && entry.completion && entry.completion.kind === 'CANCELLED')) {
          throw new Error('injected cancel FINAL uncertainty')
        }
      }
      return original(from, to)
    }
    const pending = run(sandbox, birth)
    let attemptId = null
    for (let i = 0; i < 500 && attemptId === null; i += 1) {
      const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
      if (status.ok && status.value.attemptId) attemptId = status.value.attemptId
      else await new Promise((resolve) => setImmediate(resolve))
    }
    assert.notEqual(attemptId, null)
    await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, now: NOW })
    const result = await pending
    fs.renameSync = original
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SAVE_UNKNOWN)
    assert.equal(isCoverGpuBusy(sandbox), true)
    const entry = ownerEntry(sandbox)
    assert.equal(entry.phase, 'CLAIMED')
    assert.equal(entry.cancel.requested, true)
    assert.equal(entry.attempt.lease.releasedAt, null)
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})

test('a failed terminal FINAL write keeps the claim and the lease', async () => {
  const { sandbox, library, birth, artifactRef } = await setup()
  const original = fs.renameSync
  try {
    const deleted = await library.value.delete({ schemaVersion: 1, scopeId: SCOPE, artifactRef, now: NOW })
    assert.equal(deleted.ok, true)
    let ownerRenames = 0
    fs.renameSync = function patched(from, to) {
      if (typeof to === 'string' && path.basename(to) === OWNER_FILE) {
        ownerRenames += 1
        if (ownerRenames === 2) throw new Error('injected terminal FINAL uncertainty')
      }
      return original(from, to)
    }
    const result = await run(sandbox, birth)
    fs.renameSync = original
    assert.equal(result.ok, false)
    assert.equal(result.errors[0].code, COVER_EXECUTION_CODES.SOURCE_UNAVAILABLE)
    assert.equal(isCoverGpuBusy(sandbox), true)
    const entry = ownerEntry(sandbox)
    assert.equal(entry.phase, 'CLAIMED')
    assert.equal(entry.attempt.lease.releasedAt, null)
  } finally {
    fs.renameSync = original
    removeConfigSandbox(sandbox)
  }
})
