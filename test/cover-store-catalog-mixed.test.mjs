import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { createCoverTask, executeCover } from '../core/audio/cover-executor-internal.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'

const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const PROOF = 'fixture-rights:catalog-mixed'
const SCOPE = 'scope:fixture-catmixed'

test('a v3 catalog file keeps a legacy entry while a Cover birth is appended', async () => {
  const sandbox = createConfigSandbox()
  try {
    const legacyEntry = {
      scopeId: SCOPE,
      idempotencyKey: 'key:fixture-legacy-1',
      identityHash: 'f'.repeat(64),
      record: { schemaVersion: 1, taskId: 'task:fixture-' + 'a'.repeat(32), feature: 'singing', taskType: 'SVC', source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-bytes-' + '0'.repeat(32) }, voiceProfileId: 'voice:demo-hero', deliveryRequested: false, rights: { state: 'CONFIRMED_FIXTURE' }, state: 'CREATED', outputArtifactRef: null, cancel: { requested: false, confirmed: false }, delivery: { state: 'NOT_REQUESTED', deliveryId: null }, lastError: null, observedAt: NOW, mockOnly: true, realOperationAllowed: false },
    }
    fs.writeFileSync(path.join(sandbox.root, 'audio-task-catalog-v1.json'), JSON.stringify({ schemaVersion: 3, revision: 1, entries: [legacyEntry] }))
    const library = await openFixtureArtifactLibrary({ sandbox })
    const imported = await library.value.import({
      schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:catmixed', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
      now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
    })
    const draft = {
      intentVersion: 1, scopeId: SCOPE, sourceRef: imported.value.artifact.artifactRef, sourceRevision: 1, rightsState: 'GRANTED',
      rightsProofRef: PROOF, rightsExpiresAt: EXPIRES, voiceProfileId: 'voice:demo-hero', profileRevision: 1, modelAssetId: 'asset:a',
      modelRevision: 1, modelIntegrityTruth: 'DECLARED_FIXTURE', instanceId: 'instance:rvc', candidateId: 'rvc', modelRef: 'rvc-model:a',
      backendRevision: 1, pitchShift: 0,
      recipe: { sourceLayout: 'MIXED', separationPreset: 'FIXTURE_TWO_STEM', mixMode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 },
      outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 1 },
    }
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:catmixed', intentDraft: draft, observedAt: NOW })
    assert.equal(birth.ok, true)
    const catalogRaw = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'audio-task-catalog-v1.json'), 'utf8'))
    assert.equal(catalogRaw.entries.length, 2)
    assert.deepEqual(catalogRaw.entries[0], legacyEntry)
    assert.equal(catalogRaw.entries[1].kind, 'COVER')
    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'exec:catmixed', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    assert.equal(run.value.outcome, 'SAVED')
    const after = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'audio-task-catalog-v1.json'), 'utf8'))
    assert.deepEqual(after.entries[0], legacyEntry)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
