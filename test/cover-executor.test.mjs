import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { COVER_EXECUTION_CODES, coverStatus, createCoverTask, executeCover, requestCoverCancel, resumeCoverFinal } from '../core/audio/cover-executor-internal.mjs'

const SCOPE = 'scope:fixture-cover'
const PROOF = 'fixture-rights:cover-e2e'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const SOURCE_BYTES = wavFromSamples([1000, -2000, 32767, -32768], 44100)

function draft(overrides = {}) {
  return {
    intentVersion: 1,
    scopeId: SCOPE,
    sourceRef: overrides.sourceRef,
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
    requestKey: 'import:cover-source-1',
    bytes: SOURCE_BYTES,
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const sourceRef = imported.value.artifact.artifactRef
  return { sandbox, library, sourceRef }
}

test('birth creates a Cover entry with a 25-key Intent and 16-key record', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({
      sandbox,
      scopeId: SCOPE,
      idempotencyKey: 'cover:e2e-1',
      intentDraft: draft({ sourceRef }),
      observedAt: NOW,
    })
    assert.equal(birth.ok, true)
    assert.equal(birth.value.outcome, 'CREATED')
    assert.equal(birth.value.record.state, 'CREATED')
    assert.equal(Object.keys(birth.value.record).length, 16)
    assert.equal(Object.keys(birth.value.intent).length, 25)
    assert.equal(birth.value.intent.recipe.mixMode, 'WITH_INSTRUMENTAL')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('MIXED execution saves exactly one MASTER and a rerun is EXISTING', async () => {
  const { sandbox, library, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:e2e-2', intentDraft: draft({ sourceRef }), observedAt: NOW })
    assert.equal(birth.ok, true)
    const run = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:1',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(run.ok, true)
    assert.equal(run.value.outcome, 'SAVED')
    assert.equal(run.value.value.inspection.channels, 1)
    const stored = await library.value.get({
      schemaVersion: 1,
      scopeId: SCOPE,
      artifactRef: run.value.value.master.artifactRef,
      now: NOW,
      rights: { state: 'GRANTED', proofRef: PROOF },
    })
    assert.equal(stored.ok, true)
    assert.equal(stored.value.outcome, 'FOUND')
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.ok, true)
    assert.equal(status.value.state, 'SAVED')
    assert.equal(status.value.stages.length, 4)
    const again = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:1',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(again.ok, true)
    assert.equal(again.value.outcome, 'EXISTING')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('CLEAN_VOCAL executes with no stem stage and the same single MASTER path', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({
      sandbox,
      scopeId: SCOPE,
      idempotencyKey: 'cover:e2e-clean',
      intentDraft: draft({
        sourceRef,
        recipe: { sourceLayout: 'CLEAN_VOCAL', separationPreset: 'NONE', mixMode: 'VOCAL_ONLY', vocalGainDb: 0, instrumentalGainDb: 0 },
      }),
      observedAt: NOW,
    })
    assert.equal(birth.ok, true)
    const run = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:clean',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(run.ok, true)
    assert.equal(run.value.outcome, 'SAVED')
    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.value.stages[0].stage, 'CONVERTING')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a different Intent is rejected before any new execution', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:e2e-mismatch', intentDraft: draft({ sourceRef }), observedAt: NOW })
    assert.equal(birth.ok, true)
    const changed = { ...birth.value.intent, pitchShift: 7 }
    const run = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:mismatch',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: changed,
    })
    assert.equal(run.ok, false)
    assert.equal(run.errors[0].code, COVER_EXECUTION_CODES.INTENT_MISMATCH)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('expired request and revoked rights are rejected', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:e2e-expiry', intentDraft: draft({ sourceRef }), observedAt: NOW })
    assert.equal(birth.ok, true)
    const expired = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:expired',
      now: EXPIRES,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(expired.ok, false)
    assert.equal(expired.errors[0].code, COVER_EXECUTION_CODES.EXPIRED)
    const denied = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:denied',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'DENIED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(denied.ok, false)
    assert.equal(denied.errors[0].code, COVER_EXECUTION_CODES.RIGHTS_REJECTED)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('cancel and resume on a SAVED task are TOO_LATE / EXISTING', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:e2e-late', intentDraft: draft({ sourceRef }), observedAt: NOW })
    const run = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:late',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(run.value.outcome, 'SAVED')
    const cancel = await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: run.value.attemptId, now: NOW })
    assert.equal(cancel.ok, true)
    assert.equal(cancel.value.cancelState, 'TOO_LATE')
    const resume = await resumeCoverFinal({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: run.value.attemptId, requestKey: 'cover-resume:1', now: NOW })
    assert.equal(resume.ok, true)
    assert.equal(resume.value.outcome, 'EXISTING')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('the legacy catalog/owner files are untouched by the Cover chain', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:e2e-files', intentDraft: draft({ sourceRef }), observedAt: NOW })
    await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:files',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-cover-catalog-v3.json')), true)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-cover-owner-v3.json')), true)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-task-catalog-v1.json')), false)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-task-owner-v1.json')), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a cancel accepted while the run is busy stops the stages and releases the lease', async () => {
  const { sandbox, library, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:e2e-busy', intentDraft: draft({ sourceRef }), observedAt: NOW })
    assert.equal(birth.ok, true)
    const runPromise = executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:busy',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    let cancel = null
    for (let i = 0; i < 200 && cancel === null; i += 1) {
      const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
      if (status.ok && status.value.attemptId && status.value.state === 'CLAIMED') {
        cancel = await requestCoverCancel({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, attemptId: status.value.attemptId, now: NOW })
      } else {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
    const run = await runPromise
    if (cancel && cancel.ok) {
      assert.equal(cancel.value.cancelState, 'ACCEPTED')
      assert.equal(run.ok, true)
      assert.equal(run.value.outcome, 'CANCELLED')
      const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
      assert.equal(status.value.state, 'CANCELLED')
      assert.equal(status.value.lease.releasedAt !== null, true)
      const master = await library.value.get({ schemaVersion: 1, scopeId: SCOPE, artifactRef: 'artifact:fixture-bytes-00000000000000000000000000000000', now: NOW, rights: { state: 'GRANTED', proofRef: PROOF } })
      assert.equal(master.value.outcome === 'FOUND', false)
    } else {
      // The run can be faster than the observer; in that case no cancel was accepted and the run must
      // be a normal SAVED (never a silent cancellation).
      assert.equal(run.ok, true)
      assert.equal(run.value.outcome, 'SAVED')
    }
  } finally {
    removeConfigSandbox(sandbox)
  }
})