/* Whale Voice — normal cancellation must actually release the shared lease (Plan 08-F-B / 090, v1.79).
 *
 * Regression: `return cancelNow(...)` let the execute `finally` run before the async cancel queue
 * finished, so a normal CANCELLED left `isCoverGpuBusy=true` and blocked later GPU tasks. The fix
 * awaits the cancel transaction, so the finally sees FINAL and releases.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { coverStatus, createCoverTask, executeCover, requestCoverCancel } from './support/cover-run.mjs'
import { coverDependencies } from './support/cover-dependencies.mjs'
import { acquireCoverLease, coverCpuLeaseCount, isCoverGpuBusy, releaseCoverLease } from '../core/audio/cover-lease-internal.mjs'

const SCOPE = 'scope:fixture-cancel-release'
const PROOF = 'fixture-rights:cover-cancel-release'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'

function samples(count) {
  const out = new Array(count)
  for (let i = 0; i < count; i += 1) out[i] = ((i * 37 + 11) % 2000) - 1000
  return out
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
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:cancel-release', bytes: wavFromSamples(samples(520000), 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:cancel-release', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  return { sandbox, birth }
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

async function waitForClaim(sandbox, taskId) {
  for (let i = 0; i < 500; i += 1) {
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId, now: NOW })
    if (status.ok && status.value.attemptId) return status.value.attemptId
    await new Promise((resolve) => setImmediate(resolve))
  }
  return null
}

test('a normal cancelled execution releases the GPU lease and later tasks can run', async () => {
  const { sandbox, birth } = await setup()
  try {
    const pending = executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:cancel-release', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    const attemptId = await waitForClaim(sandbox, birth.value.taskId)
    assert.notEqual(attemptId, null)
    await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, now: NOW })
    const cancelled = await pending
    assert.equal(cancelled.ok, true)
    assert.equal(cancelled.value.outcome, 'CANCELLED')
    assert.equal(isCoverGpuBusy(sandbox), false)
    const lease = acquireCoverLease({ sandbox, compute: 'LOCAL_GPU', now: NOW })
    assert.equal(lease.ok, true)
    releaseCoverLease({ sandbox, leaseId: lease.value.leaseId })

    const second = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:cancel-release-2', intentDraft: draft(birth.value.intent.sourceRef), observedAt: NOW })
    assert.equal(second.ok, true)
    const later = await executeCover({
      sandbox, scopeId: SCOPE, taskId: second.value.taskId, requestKey: 'cover-exec:cancel-release-2', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: second.value.intent,
    })
    assert.equal(later.ok, true)
    assert.equal(later.value.outcome, 'SAVED')
    assert.equal(isCoverGpuBusy(sandbox), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a normal cancelled CPU/cloud execution returns its CPU lease count to zero', async () => {
  const { sandbox, birth } = await setup()
  try {
    const pending = executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:cancel-cpu', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent, compute: 'CPU_CLOUD', dependencies: cloudDependencies(birth),
    })
    const attemptId = await waitForClaim(sandbox, birth.value.taskId)
    assert.notEqual(attemptId, null)
    await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId, now: NOW })
    const cancelled = await pending
    assert.equal(cancelled.ok, true)
    assert.equal(cancelled.value.outcome, 'CANCELLED')
    assert.equal(isCoverGpuBusy(sandbox), false)
    assert.equal(coverCpuLeaseCount(sandbox), 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
