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
const PROOF = 'fixture-rights:fallback'
const SCOPE = 'scope:fixture-fallback'

test('an existing v1 legacy snapshot keeps its bytes and the Cover chain falls back to dedicated v3 files', async () => {
  const sandbox = createConfigSandbox()
  try {
    const catalogText = JSON.stringify({ schemaVersion: 1, revision: 0, entries: [] })
    const ownerText = JSON.stringify({ schemaVersion: 1, revision: 0, entries: [] })
    fs.writeFileSync(path.join(sandbox.root, 'audio-task-catalog-v1.json'), catalogText)
    fs.writeFileSync(path.join(sandbox.root, 'audio-task-owner-v1.json'), ownerText)
    const library = await openFixtureArtifactLibrary({ sandbox })
    const imported = await library.value.import({
      schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:fallback', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
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
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:fallback', intentDraft: draft, observedAt: NOW })
    assert.equal(birth.ok, true)
    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'exec:fallback', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    assert.equal(run.value.outcome, 'SAVED')
    assert.equal(fs.readFileSync(path.join(sandbox.root, 'audio-task-catalog-v1.json'), 'utf8'), catalogText)
    assert.equal(fs.readFileSync(path.join(sandbox.root, 'audio-task-owner-v1.json'), 'utf8'), ownerText)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-cover-catalog-v3.json')), true)
    assert.equal(fs.existsSync(path.join(sandbox.root, 'audio-cover-owner-v3.json')), true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
