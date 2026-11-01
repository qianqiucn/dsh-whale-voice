/* Whale Voice — Cover shared write queue vs long computation (Plan 08-F-B / 090, v1.78 B2).
 *
 * The long separate/convert/mix work must run outside the shared cover write queue: while a real
 * long local-GPU Fixture run is busy, another real CPU/cloud execution can claim, write checkpoints
 * and finish, and a second local-GPU execution is refused explicitly.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, coverStatus, createCoverTask, executeCover } from './support/cover-run.mjs'
import { coverDependencies } from './support/cover-dependencies.mjs'

const SCOPE = 'scope:fixture-queue'
const PROOF = 'fixture-rights:cover-queue'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'

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

function samples(count, seed) {
  const out = new Array(count)
  for (let i = 0; i < count; i += 1) out[i] = ((i * 37 + seed) % 2000) - 1000
  return out
}

async function setup() {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  const big = await library.value.import({
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:queue-big', bytes: wavFromSamples(samples(520000, 11), 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  const small = await library.value.import({
    schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:queue-small', bytes: wavFromSamples(samples(400, 7), 44100),
    now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(big.ok, true)
  assert.equal(small.ok, true)
  const a = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:queue-a', intentDraft: draft(big.value.artifact.artifactRef), observedAt: NOW })
  const b = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:queue-b', intentDraft: draft(small.value.artifact.artifactRef), observedAt: NOW })
  const c = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:queue-c', intentDraft: draft(small.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(a.ok && b.ok && c.ok, true)
  return { sandbox, a, b, c }
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

async function waitForStage(sandbox, taskId, predicate) {
  for (let i = 0; i < 500; i += 1) {
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId, now: NOW })
    if (status.ok && predicate(status.value)) return status.value
    await new Promise((resolve) => setImmediate(resolve))
  }
  return null
}

test('a long GPU run does not hold the write queue: CPU run progresses and a GPU run is refused', async () => {
  const { sandbox, a, b, c } = await setup()
  try {
    const order = []
    const longRun = executeCover({
      sandbox, scopeId: SCOPE, taskId: a.value.taskId, requestKey: 'cover-exec:queue-a', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: a.value.intent,
    }).then((result) => {
      order.push('A')
      return result
    })
    const separated = await waitForStage(sandbox, a.value.taskId, (value) => value.stages.length > 0 && value.stages[0].status === 'DONE')
    assert.notEqual(separated, null)

    const gpuConflict = await executeCover({
      sandbox, scopeId: SCOPE, taskId: c.value.taskId, requestKey: 'cover-exec:queue-c', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: c.value.intent,
    })
    assert.equal(gpuConflict.ok, false)
    assert.equal(gpuConflict.errors[0].code, COVER_EXECUTION_CODES.RESOURCE_LIMIT)

    const cpuRun = executeCover({
      sandbox, scopeId: SCOPE, taskId: b.value.taskId, requestKey: 'cover-exec:queue-b', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: b.value.intent, compute: 'CPU_CLOUD', dependencies: cloudDependencies(b),
    }).then((result) => {
      order.push('B')
      return result
    })

    const [longResult, cpuResult] = await Promise.all([longRun, cpuRun])
    assert.equal(longResult.ok, true)
    assert.equal(longResult.value.outcome, 'SAVED')
    assert.equal(cpuResult.ok, true)
    assert.equal(cpuResult.value.outcome, 'SAVED')
    assert.deepEqual(order, ['B', 'A'])
    const aStatus = await coverStatus({ sandbox, scopeId: SCOPE, taskId: a.value.taskId, now: NOW })
    assert.equal(aStatus.value.state, 'SAVED')
    const bStatus = await coverStatus({ sandbox, scopeId: SCOPE, taskId: b.value.taskId, now: NOW })
    assert.equal(bStatus.value.state, 'SAVED')
  } finally {
    removeConfigSandbox(sandbox)
  }
})
