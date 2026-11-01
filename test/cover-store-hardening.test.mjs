/* Whale Voice — Cover store file selection and candidate hardening (Plan 08-F-B / 090, OFFLINE).
 *
 * 104-R04: only a valid known v1/v2 legacy snapshot triggers the dedicated fallback. A damaged,
 * oversized, symlinked or unknown-version file fails closed before any parse is trusted, and a
 * malformed v3 candidate is rejected without touching the existing file.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { createCoverTask, executeCover } from '../core/audio/cover-executor-internal.mjs'
import {
  CoverStoreFailure,
  LEGACY_CATALOG_FILE,
  LEGACY_OWNER_FILE,
  getCoverState,
  readCoverCatalog,
  readCoverOwner,
  resolveCoverFile,
  writeCoverSnapshot,
} from '../core/audio/cover-store-internal.mjs'

const SCOPE = 'scope:fixture-hardening'
const PROOF = 'fixture-rights:cover-hardening'
const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'

function expectStoreFailure(fn, code) {
  assert.throws(fn, (error) => error instanceof CoverStoreFailure && error.key === code)
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

test('a damaged or unknown-version legacy file fails closed before any fallback', () => {
  const sandbox = createConfigSandbox()
  try {
    const state = getCoverState(sandbox)
    const target = path.join(sandbox.root, LEGACY_CATALOG_FILE)
    fs.writeFileSync(target, Buffer.from('{not json', 'utf8'))
    expectStoreFailure(() => readCoverCatalog(state), 'COVER_STORE_INVALID')
    expectStoreFailure(() => resolveCoverFile(state, 'catalog'), 'COVER_STORE_INVALID')

    fs.writeFileSync(target, Buffer.from(JSON.stringify({ schemaVersion: 9, revision: 1, entries: [] }), 'utf8'))
    expectStoreFailure(() => readCoverCatalog(state), 'COVER_STORE_INVALID')

    fs.writeFileSync(target, Buffer.from(JSON.stringify({ schemaVersion: 2, revision: 1, entries: [{ scopeId: SCOPE }] }), 'utf8'))
    expectStoreFailure(() => readCoverCatalog(state), 'COVER_STORE_INVALID')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('an oversized legacy snapshot is rejected with the resource-limit code', () => {
  const sandbox = createConfigSandbox()
  try {
    const state = getCoverState(sandbox)
    const bytes = Buffer.alloc(128 * 1024 + 1, 0x20)
    fs.writeFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE), bytes)
    expectStoreFailure(() => readCoverOwner(state), 'COVER_STORE_RESOURCE_LIMIT')
    expectStoreFailure(() => resolveCoverFile(state, 'owner'), 'COVER_STORE_RESOURCE_LIMIT')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a symlinked legacy snapshot is never treated as a normal file', (t) => {
  const sandbox = createConfigSandbox()
  try {
    const state = getCoverState(sandbox)
    const real = path.join(sandbox.root, 'real-catalog.json')
    fs.writeFileSync(real, Buffer.from(JSON.stringify({ schemaVersion: 1, revision: 1, entries: [] }), 'utf8'))
    try {
      fs.symlinkSync(real, path.join(sandbox.root, LEGACY_CATALOG_FILE))
    } catch {
      t.skip('symlink creation is not available in this environment')
      return
    }
    expectStoreFailure(() => readCoverCatalog(state), 'COVER_STORE_INVALID')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a malformed v3 Cover entry is rejected on read', () => {
  const sandbox = createConfigSandbox()
  try {
    const state = getCoverState(sandbox)
    const bad = { schemaVersion: 3, revision: 1, entries: [{ kind: 'COVER', scopeId: SCOPE, taskId: 'task:fixture-' + 'a'.repeat(32) }] }
    fs.writeFileSync(path.join(sandbox.root, LEGACY_OWNER_FILE), Buffer.from(JSON.stringify(bad), 'utf8'))
    expectStoreFailure(() => readCoverOwner(state), 'COVER_STORE_INVALID')

    const badCatalog = { schemaVersion: 3, revision: 1, entries: [{ kind: 'COVER', scopeId: SCOPE, idempotencyKey: 'key:fixture-x' }] }
    fs.writeFileSync(path.join(sandbox.root, LEGACY_CATALOG_FILE), Buffer.from(JSON.stringify(badCatalog), 'utf8'))
    expectStoreFailure(() => readCoverCatalog(state), 'COVER_STORE_INVALID')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a malformed FINAL candidate is rejected by the writer without touching the file', async () => {
  const sandbox = createConfigSandbox()
  try {
    const library = await openFixtureArtifactLibrary({ sandbox })
    const imported = await library.value.import({
      schemaVersion: 1, scopeId: SCOPE, requestKey: 'import:hardening-source', bytes: wavFromSamples([1000, -2000, 32767, -32768], 44100),
      now: NOW, expiresAt: EXPIRES, rights: { state: 'GRANTED', proofRef: PROOF },
    })
    const birth = await createCoverTask({ sandbox, scopeId: SCOPE, idempotencyKey: 'cover:hardening', intentDraft: draft(imported.value.artifact.artifactRef), observedAt: NOW })
    assert.equal(birth.ok, true)
    const run = await executeCover({
      sandbox, scopeId: SCOPE, taskId: birth.value.taskId, requestKey: 'cover-exec:hardening', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: PROOF }, intent: birth.value.intent,
    })
    assert.equal(run.ok, true)
    assert.equal(run.value.outcome, 'SAVED')
    const state = getCoverState(sandbox)
    const before = readCoverOwner(state)
    assert.notEqual(before.snapshot, null)
    const file = path.join(sandbox.root, LEGACY_OWNER_FILE)
    const originalBytes = fs.readFileSync(file)
    const candidate = JSON.parse(originalBytes.toString('utf8'))
    candidate.entries[0].record = { schemaVersion: 1 }
    expectStoreFailure(() => writeCoverSnapshot(state, LEGACY_OWNER_FILE, candidate, { baseDigest: before.digest, mode: 'same' }), 'COVER_STORE_INVALID')
    assert.equal(fs.readFileSync(file).equals(originalBytes), true)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
