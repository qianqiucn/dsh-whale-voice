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
import { COVER_EXECUTION_CODES, createCoverTask, executeCover } from './support/cover-run.mjs'
import {
  acquireCoverLease,
  coverCpuLeaseCount,
  isCoverGpuBusy,
  releaseCoverLease,
} from '../core/audio/cover-lease-internal.mjs'
import { coverDependencies } from './support/cover-dependencies.mjs'

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

function cloudDependencies(birth) {
  return coverDependencies({
    scopeId: SCOPE,
    sourceRef: birth.value.intent.sourceRef,
    taskId: birth.value.taskId,
    now: NOW,
    expiresAt: EXPIRES,
    intent: birth.value.intent,
    overrides: { cloud: { authorized: true, providerReady: true } },
  })
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

test('a CPU/cloud execution uses gpu:NONE and makes progress while a GPU lease is held', async () => {
  const { sandbox, birth } = await setup()
  try {
    const cpuOnly = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:cpu', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent, compute: 'CPU_CLOUD', dependencies: cloudDependencies(birth),
    })
    assert.equal(cpuOnly.ok, true)
    assert.equal(cpuOnly.value.outcome, 'SAVED')
    assert.equal(isCoverGpuBusy(sandbox), false)
    assert.equal(ownerEntries(sandbox)[0].attempt.lease.gpu, 'NONE')

    const second = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:lease-cpu-2', intentDraft: draft(birth.value.intent.sourceRef), observedAt: NOW })
    const held = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(held.ok, true)
    const whileHeld = await executeCover({
      sandbox, scopeId: SCOPE, taskId: second.value.taskId, requestKey: 'cover-exec:cpu-2', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: second.value.intent, compute: 'CPU_CLOUD', dependencies: cloudDependencies(second),
    })
    assert.equal(whileHeld.ok, true)
    assert.equal(whileHeld.value.outcome, 'SAVED')
    const blocked = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:lease-cpu-3', intentDraft: draft(birth.value.intent.sourceRef), observedAt: NOW })
    assert.equal(blocked.ok, true)
    const gpuBlocked = await executeCover({
      sandbox, scopeId: SCOPE, taskId: blocked.value.taskId, requestKey: 'cover-exec:gpu-3', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: blocked.value.intent,
    })
    assert.equal(gpuBlocked.ok, false)
    assert.equal(gpuBlocked.errors[0].code, COVER_EXECUTION_CODES.RESOURCE_LIMIT)
    releaseCoverLease({ sandbox, leaseId: held.value.leaseId })
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a CPU/cloud execution without cloud facts blocks after the claim and releases its lease', async () => {
  const { sandbox, birth } = await setup()
  try {
    const runWithoutCloud = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:cpu-denied', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent, compute: 'CPU_CLOUD',
    })
    assert.equal(runWithoutCloud.ok, false)
    assert.equal(runWithoutCloud.errors[0].code, COVER_EXECUTION_CODES.DEPENDENCY_FAILURE)
    const entry = ownerEntries(sandbox)[0]
    assert.equal(entry.completion.kind, 'FAILED')
    assert.equal(entry.attempt.lease.releasedAt !== null, true)
    assert.equal(isCoverGpuBusy(sandbox), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
