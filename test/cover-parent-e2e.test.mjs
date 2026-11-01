import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { buildRelayHandoffCandidate } from '../core/audio/relay-handoff.mjs'
import { createCoverTask, executeCover } from '../core/audio/cover-executor-internal.mjs'
import { createFakeRelay } from '../core/audio/cover-fake-relay-internal.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'

const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const PROOF = 'fixture-rights:parent-e2e'
const PLACEHOLDER = 'task:fixture-catalog-validation'

function coverDraft(sourceRef) {
  return {
    intentVersion: 1,
    scopeId: 'scope:fixture-parent',
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
    recipe: { sourceLayout: 'MIXED', separationPreset: 'FIXTURE_TWO_STEM', mixMode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 },
    outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 1 },
  }
}

async function setup() {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  const imported = await library.value.import({
    schemaVersion: 1, scopeId: 'scope:fixture-parent', requestKey: 'import:parent', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100), now: NOW, expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  return { sandbox, library, sourceRef: imported.value.artifact.artifactRef }
}

test('the real legacy catalog issues a single Task id for a singing/SVC draft', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const catalog = await openFixtureTaskCatalog({ sandbox })
    assert.equal(catalog.ok, true)
    const reserved = await catalog.value.reserve({
      schemaVersion: 1,
      scopeId: 'scope:fixture-parent',
      idempotencyKey: 'key:fixture-parent-1',
      draft: {
        schemaVersion: 1,
        feature: 'singing',
        taskType: 'SVC',
        source: { kind: 'AUDIO_REF', ref: sourceRef },
        voiceProfileId: 'voice:demo-hero',
        deliveryRequested: false,
        rights: { state: 'CONFIRMED_FIXTURE' },
      },
      observedAt: NOW,
    })
    assert.equal(reserved.ok, true)
    assert.equal(reserved.value.outcome, 'CREATED')
    assert.equal(Object.keys(reserved.value.task).length >= 14, true)
    assert.equal(reserved.value.task.state, 'CREATED')
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-task-catalog-v1.json')), true)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-task-owner-v1.json')), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('one real source drives both the legacy catalog and a Cover run to SAVED', async () => {
  const { sandbox, library, sourceRef } = await setup()
  try {
    const catalog = await openFixtureTaskCatalog({ sandbox })
    const reserved = await catalog.value.reserve({
      schemaVersion: 1, scopeId: 'scope:fixture-parent', idempotencyKey: 'key:fixture-parent-2',
      draft: {
        schemaVersion: 1, feature: 'singing', taskType: 'SVC',
        source: { kind: 'AUDIO_REF', ref: sourceRef }, voiceProfileId: 'voice:demo-hero',
        deliveryRequested: false, rights: { state: 'CONFIRMED_FIXTURE' },
      },
      observedAt: NOW,
    })
    assert.equal(reserved.ok, true)
    const birth = await createCoverTask({ sandbox, scopeId: 'scope:fixture-parent', idempotencyKey: 'cover:parent-2', intentDraft: coverDraft(sourceRef), observedAt: NOW })
    assert.equal(birth.ok, true)
    const run = await executeCover({
      sandbox, scopeId: 'scope:fixture-parent', taskId: birth.value.taskId, requestKey: 'exec:parent-2', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    assert.equal(run.value.outcome, 'SAVED')
    const stored = await library.value.get({ schemaVersion: 1, scopeId: 'scope:fixture-parent', artifactRef: run.value.value.master.artifactRef, now: NOW, rights: { state: 'GRANTED', proofRef: PROOF } })
    assert.equal(stored.value.outcome, 'FOUND')
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-cover-owner-v3.json')), true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('the Cover SAVED record still cannot request delivery and the Fake Relay stays inert', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: 'scope:fixture-parent', idempotencyKey: 'cover:parent-3', intentDraft: coverDraft(sourceRef), observedAt: NOW })
    const run = await executeCover({
      sandbox, scopeId: 'scope:fixture-parent', taskId: birth.value.taskId, requestKey: 'exec:parent-3', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    const record = { ...birth.value.record, state: 'SAVED', outputArtifactRef: run.value.value.master.artifactRef }
    const candidate = buildRelayHandoffCandidate(record, 'delivery:parent-3')
    assert.equal(candidate.ok, false)
    assert.equal(candidate.errors[0].path, 'deliveryRequested')
    const relay = createFakeRelay()
    assert.equal(relay.stats().sent, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a legacy SAVED record with delivery intent reaches the Fake Relay exactly once', async () => {
  const relay = createFakeRelay()
  const record = {
    schemaVersion: 1,
    taskId: 'task:fixture-' + 'c'.repeat(32),
    feature: 'singing',
    taskType: 'SVC',
    source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-bytes-0123456789abcdef0123456789abcdef' },
    voiceProfileId: 'voice:demo-hero',
    deliveryRequested: true,
    rights: { state: 'CONFIRMED_FIXTURE' },
    state: 'SAVED',
    outputArtifactRef: 'artifact:fixture-bytes-00112233445566778899aabbccddeeff',
    cancel: { requested: false, confirmed: false },
    delivery: { state: 'NOT_REQUESTED', deliveryId: null },
    lastError: null,
    observedAt: NOW,
    mockOnly: true,
    realOperationAllowed: false,
  }
  const candidate = buildRelayHandoffCandidate(record, 'delivery:parent-4')
  assert.equal(candidate.ok, true)
  const first = relay.submit(candidate.value)
  assert.equal(first.value.outcome, 'SENT')
  const duplicate = relay.submit(candidate.value)
  assert.equal(duplicate.value.outcome, 'EXISTING')
  relay.simulateUnknown('delivery:parent-4')
  const resend = relay.submit(candidate.value)
  assert.equal(resend.ok, false)
  assert.equal(relay.stats().sent, 1)
  assert.equal(relay.stats().duplicates, 1)
})

test('a Cover task id is unknown to the legacy owner store (no silent cross-store execution)', async () => {
  const { sandbox, sourceRef } = await setup()
  try {
    const birth = await createCoverTask({ sandbox, scopeId: 'scope:fixture-parent', idempotencyKey: 'cover:parent-5', intentDraft: coverDraft(sourceRef), observedAt: NOW })
    const owner = await import('../core/audio/task-owner.mjs')
    const handle = await owner.openFixtureTaskOwner({ sandbox })
    assert.equal(handle.ok, true)
    const read = await handle.value.get({ schemaVersion: 1, scopeId: 'scope:fixture-parent', taskId: birth.value.taskId })
    assert.equal(read.ok, false)
    assert.equal(read.errors[0].code, 'TASK_OWNER_NOT_FOUND')
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-task-owner-v1.json')), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
