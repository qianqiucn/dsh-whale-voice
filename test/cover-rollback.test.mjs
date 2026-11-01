/* Whale Voice — explicit Cover v3 rollback (Plan 08-F-B / 090, OFFLINE / FIXTURE_ONLY).
 *
 * The same-file v3 integration writes Cover snapshots to the legacy filenames when they are free.
 * These tests prove the checked rollback: a valid Cover-v3 snapshot moves back to the dedicated v3
 * files byte-for-byte, legacy v1/v2 snapshots are never touched, mixed legacy data and an existing
 * target refuse the operation and leave every file exactly as it was.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { coverStatus, createCoverTask, executeCover } from '../core/audio/cover-executor-internal.mjs'
import { applyCoverV3Rollback, planCoverV3Rollback, COVER_ROLLBACK_CODES } from '../core/audio/cover-rollback-internal.mjs'

const SCOPE = 'scope:fixture-rollback'
const PROOF = 'fixture-rights:cover-rollback'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const LEGACY_CATALOG = 'audio-task-catalog-v1.json'
const LEGACY_OWNER = 'audio-task-owner-v1.json'
const DEDICATED_CATALOG = 'audio-cover-catalog-v3.json'
const DEDICATED_OWNER = 'audio-cover-owner-v3.json'

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

async function setupCover() {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  const imported = await library.value.import({
    schemaVersion: 1,
    scopeId: SCOPE,
    requestKey: 'import:rollback-source',
    bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:rollback', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
  assert.equal(birth.ok, true)
  const run = await executeCover({
    sandbox,
    scopeId: SCOPE,
    taskId: birth.value.taskId,
    requestKey: 'cover-exec:rollback',
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
    intent: birth.value.intent,
  })
  assert.equal(run.ok, true)
  assert.equal(run.value.outcome, 'SAVED')
  return { sandbox, taskId: birth.value.taskId }
}

function read(sandbox, name) {
  return fs.readFileSync(path.join(sandbox.root, name))
}

test('a Cover-v3 snapshot moves back to the dedicated files byte-for-byte and stays readable', async () => {
  const { sandbox, taskId } = await setupCover()
  try {
    const beforeCatalog = read(sandbox, LEGACY_CATALOG)
    const beforeOwner = read(sandbox, LEGACY_OWNER)
    const plan = planCoverV3Rollback({ sandbox })
    assert.equal(plan.ok, true)
    assert.equal(plan.value.moves.length, 2)
    assert.deepEqual(plan.value.moves.map((move) => move.kind).sort(), ['catalog', 'owner'])

    const applied = applyCoverV3Rollback({ sandbox })
    assert.equal(applied.ok, true)
    assert.equal(applied.value.applied, 2)
    assert.equal(fs.existsSync(path.join(sandbox.root, LEGACY_CATALOG)), false)
    assert.equal(fs.existsSync(path.join(sandbox.root, LEGACY_OWNER)), false)
    assert.equal(read(sandbox, DEDICATED_CATALOG).equals(beforeCatalog), true)
    assert.equal(read(sandbox, DEDICATED_OWNER).equals(beforeOwner), true)

    const status = await coverStatus({ sandbox, scopeId: SCOPE, taskId, now: NOW })
    assert.equal(status.value.state, 'SAVED')

    const again = applyCoverV3Rollback({ sandbox })
    assert.equal(again.ok, true)
    assert.equal(again.value.applied, 0)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('legacy v1/v2 snapshots are reported untouched and never rewritten', async () => {
  const sandbox = createConfigSandbox()
  try {
    const catalogBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: 1, entries: [] }), 'utf8')
    const ownerBytes = Buffer.from(JSON.stringify({ schemaVersion: 2, revision: 1, entries: [] }), 'utf8')
    fs.writeFileSync(path.join(sandbox.root, LEGACY_CATALOG), catalogBytes)
    fs.writeFileSync(path.join(sandbox.root, LEGACY_OWNER), ownerBytes)
    const plan = planCoverV3Rollback({ sandbox })
    assert.equal(plan.ok, true)
    assert.equal(plan.value.moves.length, 0)
    assert.equal(plan.value.untouched.length, 2)
    assert.equal(read(sandbox, LEGACY_CATALOG).equals(catalogBytes), true)
    assert.equal(read(sandbox, LEGACY_OWNER).equals(ownerBytes), true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an existing dedicated file refuses the rollback and changes nothing', async () => {
  const { sandbox } = await setupCover()
  try {
    const before = read(sandbox, LEGACY_OWNER)
    fs.writeFileSync(path.join(sandbox.root, DEDICATED_OWNER), Buffer.from('{"schemaVersion":3,"revision":0,"entries":[]}', 'utf8'))
    const plan = planCoverV3Rollback({ sandbox })
    assert.equal(plan.ok, false)
    assert.equal(plan.errors[0].code, COVER_ROLLBACK_CODES.TARGET_EXISTS)
    assert.equal(plan.errors[0].path, 'owner')
    const applied = applyCoverV3Rollback({ sandbox })
    assert.equal(applied.ok, false)
    assert.equal(read(sandbox, LEGACY_OWNER).equals(before), true)
    assert.equal(fs.existsSync(path.join(sandbox.root, DEDICATED_CATALOG)), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a snapshot with a legacy entry refuses to move and keeps the Cover data in place', async () => {
  const { sandbox } = await setupCover()
  try {
    const owner = JSON.parse(read(sandbox, LEGACY_OWNER).toString('utf8'))
    owner.entries.push({
      scopeId: SCOPE,
      taskId: 'task:' + 'a'.repeat(32),
      birthIdentityHash: 'b'.repeat(64),
      phase: 'FINAL',
      record: { schemaVersion: 1 },
      completion: { kind: 'SAVED', reason: null },
    })
    fs.writeFileSync(path.join(sandbox.root, LEGACY_OWNER), Buffer.from(JSON.stringify(owner), 'utf8'))
    const plan = planCoverV3Rollback({ sandbox })
    assert.equal(plan.ok, false)
    assert.equal(plan.errors[0].code, COVER_ROLLBACK_CODES.LEGACY_DATA)
    assert.equal(fs.existsSync(path.join(sandbox.root, LEGACY_OWNER)), true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an unreadable snapshot fails closed instead of guessing', async () => {
  const sandbox = createConfigSandbox()
  try {
    fs.writeFileSync(path.join(sandbox.root, LEGACY_CATALOG), Buffer.from('{not json', 'utf8'))
    const plan = planCoverV3Rollback({ sandbox })
    assert.equal(plan.ok, false)
    assert.equal(plan.errors[0].code, COVER_ROLLBACK_CODES.STORE_INVALID)
    assert.equal(plan.errors[0].path, 'catalog')
  } finally {
    removeConfigSandbox(sandbox)
  }
})
