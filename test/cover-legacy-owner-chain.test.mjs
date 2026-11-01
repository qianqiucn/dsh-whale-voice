/* Whale Voice — Cover / legacy owner engine parent chain (Plan 08-F-B / 090, OFFLINE / FIXTURE_ONLY).
 *
 * Closes the last parent-chain gap recorded in the contract (§15): the *legacy* owner run/save engine
 * chain and a Cover task driven by the same real Fixture source in one sandbox. The legacy chain uses
 * the real catalog, owner store, existing-record engine and artifact writer; the Cover chain writes its
 * v3 snapshots to the dedicated files only because the legacy v1/v2 snapshots already exist. Nothing
 * here executes real separation, RVC, mixing, playback, WeChat or installation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { openFixtureTaskOwner } from '../core/audio/task-owner.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { coverStatus, createCoverTask, executeCover } from './support/cover-run.mjs'
import { buildRelayHandoffCandidate } from '../core/audio/relay-handoff.mjs'
import { createFakeRelay } from '../core/audio/cover-fake-relay-internal.mjs'

const SCOPE = 'scope:fixture-demo'
const PROOF = 'fixture-rights:demo-1'
const NOW = '2026-10-27T00:00:00.000Z'
const SAVE_NOW = '2026-10-27T00:00:01.000Z'
const EXPIRES = '2026-10-28T00:00:00.000Z'
const OWNER_FILE = 'audio-task-owner-v1.json'
const CATALOG_FILE = 'audio-task-catalog-v1.json'
const ARTIFACT_FILE = 'audio-artifacts-v1.json'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function example() {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf('## 7.')
  assert.ok(at >= 0)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

async function reserveLegacyTask(catalog, artifactRef, key, deliveryRequested = false) {
  const reserved = await catalog.value.reserve({
    schemaVersion: 1,
    scopeId: SCOPE,
    idempotencyKey: key,
    draft: {
      schemaVersion: 1,
      feature: 'singing',
      taskType: 'SVC',
      source: { kind: 'AUDIO_REF', ref: artifactRef },
      voiceProfileId: 'voice:demo-hero',
      deliveryRequested,
      rights: { state: 'CONFIRMED_FIXTURE' },
    },
    observedAt: NOW,
  })
  assert.equal(reserved.ok, true, reserved.ok ? '' : JSON.stringify(reserved.errors))
  return reserved.value.task.taskId
}

function bindExample(base, taskId, artifactRef) {
  const input = clone(base)
  input.sourceInput.voiceBinding.taskDraft.taskId = taskId
  input.sourceInput.voiceBinding.taskDraft.source.ref = artifactRef
  input.sourceInput.voiceBinding.negotiation.request.sourceAudioRef = artifactRef
  input.sourceInput.artifactLibrary.artifacts[0].artifactRef = artifactRef
  return input
}

function saveFrame(taskId, input, requestKey) {
  return {
    schemaVersion: 1,
    scopeId: SCOPE,
    taskId,
    requestKey,
    now: SAVE_NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
    input,
  }
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

test('the legacy owner run/save engine chain and a Cover run share one real Fixture source', async () => {
  const sandbox = createConfigSandbox()
  try {
    const library = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(library.ok, true)
    const imported = await library.value.import({
      schemaVersion: 1,
      scopeId: SCOPE,
      requestKey: 'import:legacy-parent-source',
      bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
    })
    assert.equal(imported.ok, true)
    const artifactRef = imported.value.artifact.artifactRef

    const base = example()
    const catalog = await openFixtureTaskCatalog({ sandbox })
    assert.equal(catalog.ok, true)
    const runTaskId = await reserveLegacyTask(catalog, artifactRef, 'key:fixture-legacy-run')
    const saveTaskId = await reserveLegacyTask(catalog, artifactRef, 'key:fixture-legacy-save')

    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true, owner.ok ? '' : JSON.stringify(owner.errors))

    // 1. legacy run: claim + the existing-record engine, stopping at SIMULATED with no save.
    const runInput = bindExample(base, runTaskId, artifactRef)
    const ran = await owner.value.run({ schemaVersion: 1, scopeId: SCOPE, taskId: runTaskId, input: runInput })
    assert.equal(ran.ok, true, ran.ok ? '' : JSON.stringify(ran.errors))
    assert.equal(ran.value.outcome, 'RECORDED')
    assert.equal(ran.value.ownerState, 'SIMULATED')
    assert.equal(ran.value.task.state, 'ARTIFACT_READY')

    // 2. legacy save: same-claim byte engine + real artifact writer, one MASTER saved.
    const saveInput = bindExample(base, saveTaskId, artifactRef)
    const saved = await owner.value.save(saveFrame(saveTaskId, saveInput, 'save:legacy-parent'))
    assert.equal(saved.ok, true, saved.ok ? '' : JSON.stringify(saved.errors))
    assert.equal(saved.value.outcome, 'SAVED')
    assert.equal(saved.value.ownerState, 'SAVED')
    assert.equal(saved.value.task.state, 'SAVED')

    const legacyOwnerAfterSave = fs.readFileSync(path.join(sandbox.root, OWNER_FILE))
    const legacyCatalogAfterSave = fs.readFileSync(path.join(sandbox.root, CATALOG_FILE))
    assert.equal(JSON.parse(legacyOwnerAfterSave.toString()).schemaVersion, 2)

    // 3. Cover birth/execute over the same source; the legacy v2 snapshots force the dedicated v3 files.
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:legacy-parent', intentDraft: draft(artifactRef), observedAt: NOW })
    assert.equal(birth.ok, true, birth.ok ? '' : JSON.stringify(birth.errors))
    const cover = await executeCover({
      sandbox,
      scopeId: SCOPE,
      taskId: birth.value.taskId,
      requestKey: 'cover-exec:legacy-parent',
      now: NOW,
      expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF },
      intent: birth.value.intent,
    })
    assert.equal(cover.ok, true, cover.ok ? '' : JSON.stringify(cover.errors))
    assert.equal(cover.value.outcome, 'SAVED')

    // The legacy chain is byte-identical before/after the Cover run and still readable by the old API.
    assert.equal(fs.readFileSync(path.join(sandbox.root, OWNER_FILE)).equals(legacyOwnerAfterSave), true)
    assert.equal(fs.readFileSync(path.join(sandbox.root, CATALOG_FILE)).equals(legacyCatalogAfterSave), true)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-cover-catalog-v3.json')), true)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-cover-owner-v3.json')), true)

    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId: birth.value.taskId, now: NOW })
    assert.equal(status.value.state, 'SAVED')
    assert.equal(status.value.master.artifactRef.startsWith('artifact:fixture-bytes-'), true)

    const got = await owner.value.get({ schemaVersion: 1, scopeId: SCOPE, taskId: saveTaskId })
    assert.equal(got.ok, true)
    assert.equal(got.value.outcome, 'FOUND')
    assert.equal(got.value.ownerState, 'SAVED')
    const rerun = await owner.value.run({ schemaVersion: 1, scopeId: SCOPE, taskId: saveTaskId, input: saveInput })
    assert.equal(rerun.ok, true)
    assert.equal(rerun.value.outcome, 'EXISTING')

    // One real library pack holds the source plus the two separately saved MASTERs.
    const pack = JSON.parse(fs.readFileSync(path.join(sandbox.root, ARTIFACT_FILE), 'utf8'))
    assert.equal(pack.entries.length, 3)
    const owners = JSON.parse(fs.readFileSync(path.join(sandbox.root, OWNER_FILE), 'utf8'))
    assert.equal(owners.entries.length, 2)
    const sources = owners.entries.map((entry) => entry.record.source.ref)
    assert.deepEqual(new Set(sources), new Set([artifactRef]))
    assert.equal(birth.value.intent.sourceRef, artifactRef)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('the real legacy SAVED record reaches the Fake Relay and dedups on reopen', async () => {
  const sandbox = createConfigSandbox()
  try {
    const library = await openFixtureArtifactLibrary({ sandbox })
    const imported = await library.value.import({
      schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:relay-source', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
      now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
    })
    assert.equal(imported.ok, true)
    const artifactRef = imported.value.artifact.artifactRef
    const catalog = await openFixtureTaskCatalog({ sandbox })
    const taskId = await reserveLegacyTask(catalog, artifactRef, 'key:fixture-relay', true)
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)
    const input = bindExample(example(), taskId, artifactRef)
    input.sourceInput.voiceBinding.taskDraft.deliveryRequested = true
    const saved = await owner.value.save(saveFrame(taskId, input, 'save:relay'))
    assert.equal(saved.ok, true, saved.ok ? '' : JSON.stringify(saved.errors))
    assert.equal(saved.value.outcome, 'SAVED')

    const ownerDoc = JSON.parse(fs.readFileSync(path.join(sandbox.root, OWNER_FILE), 'utf8'))
    const record = ownerDoc.entries.find((entry) => entry.taskId === taskId).record
    assert.equal(record.state, 'SAVED')
    assert.equal(record.deliveryRequested, true)
    assert.equal(record.outputArtifactRef, saved.value.artifact.artifactRef)

    const candidate = buildRelayHandoffCandidate(record, 'delivery:parent-real')
    assert.equal(candidate.ok, true, candidate.ok ? '' : JSON.stringify(candidate.errors))
    assert.equal(candidate.value.stage, 'PROPOSED_NOT_AUTHORIZED')
    const relay = createFakeRelay()
    const first = relay.submit(candidate.value)
    assert.equal(first.value.outcome, 'SENT')
    const duplicate = relay.submit(candidate.value)
    assert.equal(duplicate.value.outcome, 'EXISTING')

    // Reopen the owner, re-read the same persisted record and hand it off again: still EXISTING.
    const reopened = await openFixtureTaskOwner({ sandbox })
    assert.equal(reopened.ok, true)
    const got = await reopened.value.get({ schemaVersion: 1, scopeId: SCOPE, taskId })
    assert.equal(got.ok, true)
    assert.equal(got.value.ownerState, 'SAVED')
    const again = buildRelayHandoffCandidate(record, 'delivery:parent-real')
    assert.equal(again.ok, true)
    assert.equal(relay.submit(again.value).value.outcome, 'EXISTING')

    relay.simulateUnknown('delivery:parent-real')
    const resend = relay.submit(candidate.value)
    assert.equal(resend.ok, false)
    assert.equal(relay.stats().sent, 1)
    assert.equal(relay.stats().duplicates, 2)

    // A real Cover SAVED record keeps deliveryRequested=false and is rejected at the handoff.
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:relay', intentDraft: draft(artifactRef), observedAt: NOW })
    assert.equal(birth.ok, true)
    const cover = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:relay', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    assert.equal(cover.value.outcome, 'SAVED')
    const coverOwner = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'audio-cover-owner-v3.json'), 'utf8'))
    const coverRecord = coverOwner.entries.find((entry) => entry.taskId === birth.value.taskId).record
    assert.equal(coverRecord.deliveryRequested, false)
    const blocked = buildRelayHandoffCandidate(coverRecord, 'delivery:cover-real')
    assert.equal(blocked.ok, false)
    assert.equal(blocked.errors[0].path, 'deliveryRequested')
    assert.equal(relay.stats().sent, 1)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
