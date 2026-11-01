import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { createCoverTask, executeCover } from './support/cover-run.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'

const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const PROOF = 'fixture-rights:mixed'
const SCOPE = 'scope:fixture-mixed'

test('a v3 owner file may hold a legacy entry and the Cover chain preserves it byte-for-byte', async () => {
  const sandbox = createConfigSandbox()
  try {
    const legacyEntry = {
      scopeId: SCOPE,
      taskId: 'task:fixture-' + 'd'.repeat(32),
      birthIdentityHash: 'e'.repeat(64),
      phase: 'FINAL',
      record: { schemaVersion: 1, taskId: 'task:fixture-' + 'd'.repeat(32), state: 'SAVED' },
      completion: { kind: 'SAVED', reason: null },
    }
    const ownerText = JSON.stringify({ schemaVersion: 3, revision: 1, entries: [legacyEntry] })
    fs.writeFileSync(path.join(sandbox.root, 'audio-task-owner-v1.json'), ownerText)
    const library = await openFixtureArtifactLibrary({ sandbox })
    const imported = await library.value.import({
      schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:mixed', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
      now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
    })
    const draft = {
      intentVersion: 1, scopeId: SCOPE, sourceRef: imported.value.artifact.artifactRef, sourceRevision: 1, rightsState: 'GRANTED',
      rightsProofRef: PROOF, rightsExpiresAt: EXPIRES, voiceProfileId: 'voice:demo-hero', profileRevision: 1, modelAssetId: 'asset:fixture-model-a',
      modelRevision: 1, modelIntegrityTruth: 'DECLARED_FIXTURE', instanceId: 'instance:rvc', candidateId: 'rvc', modelRef: 'rvc-model:fixture-a',
      backendRevision: 1, pitchShift: 0,
      recipe: { sourceLayout: 'MIXED', separationPreset: 'FIXTURE_TWO_STEM', mixMode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 },
      outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 1 },
    }
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:mixed', intentDraft: draft, observedAt: NOW })
    assert.equal(birth.ok, true)
    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'exec:mixed', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    assert.equal(run.value.outcome, 'SAVED')
    const ownerRaw = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'audio-task-owner-v1.json'), 'utf8'))
    assert.equal(ownerRaw.schemaVersion, 3)
    assert.equal(ownerRaw.entries.length, 2)
    assert.deepEqual(ownerRaw.entries[0], legacyEntry)
    assert.equal(ownerRaw.entries[1].kind, 'COVER')
    assert.equal(ownerRaw.entries[1].phase, 'FINAL')
  } finally {
    removeConfigSandbox(sandbox)
  }
})
