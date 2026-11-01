/* Whale Voice — shared Cover logical lease (Plan 08-F-B / 090, OFFLINE).
 *
 * 104-R05: a local-GPU lease is exclusive per sandbox; a CPU/cloud lease never occupies the GPU slot;
 * the executor releases its lease on every terminal path and refuses a conflicting local run with
 * RESOURCE_LIMIT before any claim is written.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, createCoverTask, executeCover } from '../core/audio/cover-executor-internal.mjs'
import {
  acquireCoverLease,
  coverCpuLeaseCount,
  isCoverGpuBusy,
  releaseCoverLease,
} from '../core/audio/cover-lease-internal.mjs'

const SCOPE = 'scope:fixture-lease'
const PROOF = 'fixture-rights:cover-lease'
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

async function setup() {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  const imported = await library.value.import({
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:lease-source', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:lease', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  return { sandbox, birth }
}

function run(sandbox, birth) {
  return executeCover({
    sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:lease', now: NOW, expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
  })
}

function ownerEntries(sandbox) {
  const file = path.join(sandbox.root, OWNER_FILE)
  if (!fs.existsSync(file)) return []
  return JSON.parse(fs.readFileSync(file, 'utf8')).entries
}

test('one local GPU lease is exclusive, while CPU/cloud leases never take the GPU', () => {
  const sandbox = createConfigSandbox()
  try {
    const first = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(first.ok, true)
    assert.equal(first.value.gpu, 'EXCLUSIVE')
    assert.equal(isCoverGpuBusy(sandbox), true)
    const second = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(second.ok, false)
    assert.equal(second.errors[0].code, 'COVER_LEASE_BUSY')

    const cpuA = acquireCoverLease({ sandbox, compute: 'CPU_CLOUD', now: NOW })
    const cpuB = acquireCoverLease({ sandbox, compute: 'CPU_CLOUD', now: NOW })
    assert.equal(cpuA.ok, true)
    assert.equal(cpuB.ok, true)
    assert.equal(cpuA.value.gpu, 'NONE')
    assert.equal(coverCpuLeaseCount(sandbox), 2)
    assert.equal(isCoverGpuBusy(sandbox), true)

    releaseCoverLease({ sandbox, leaseId: first.value.leaseId })
    assert.equal(isCoverGpuBusy(sandbox), false)
    const third = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(third.ok, true)
    releaseCoverLease({ sandbox, leaseId: third.value.leaseId })
    releaseCoverLease({ sandbox, leaseId: cpuA.value.leaseId })
    releaseCoverLease({ sandbox, leaseId: cpuB.value.leaseId })
    assert.equal(coverCpuLeaseCount(sandbox), 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a conflicting executor run is refused before any claim and releases on success', async () => {
  const { sandbox, birth } = await setup()
  try {
    const held = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(held.ok, true)
    const blocked = await run(sandbox, birth)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.errors[0].code, COVER_EXECUTION_CODES.RESOURCE_LIMIT)
    assert.equal(ownerEntries(sandbox).length, 0)

    releaseCoverLease({ sandbox, leaseId: held.value.leaseId })
    const saved = await run(sandbox, birth)
    assert.equal(saved.ok, true)
    assert.equal(saved.value.outcome, 'SAVED')
    assert.equal(isCoverGpuBusy(sandbox), false)
    const entry = ownerEntries(sandbox)[0]
    assert.equal(entry.attempt.lease.gpu, 'EXCLUSIVE')
    assert.equal(typeof entry.attempt.lease.releasedAt, 'string')
  } finally {
    removeConfigSandbox(sandbox)
  }
})
