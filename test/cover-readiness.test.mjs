import test from 'node:test'
import assert from 'node:assert/strict'

import { computeCoverReadiness } from '../core/audio/cover-readiness-internal.mjs'
import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { buildRelayHandoffCandidate } from '../core/audio/relay-handoff.mjs'
import { createCoverTask, executeCover } from '../core/audio/cover-executor-internal.mjs'
import { createFakeRelay, FAKE_RELAY_CODES } from '../core/audio/cover-fake-relay-internal.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'

const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'

const EVIDENCE = { observedAt: NOW, expiresAt: EXPIRES, realReady: false, source: 'FIXTURE' }
const CONFIRMATION = { firstVisit: false, confirmed: false }
const SOURCE = { present: true, rightsState: 'GRANTED', expiresAt: EXPIRES }
const MODEL = { present: true, revision: 2, requiredRevision: 2 }
const GPU = { available: true }
const CLOUD_READY = { authorized: false, providerReady: true }

function svc(extra = {}) {
  return computeCoverReadiness({
    mode: 'SVC',
    sourceType: 'AUDIO_REF',
    source: SOURCE,
    model: MODEL,
    gpu: GPU,
    cloud: CLOUD_READY,
    evidence: EVIDENCE,
    confirmation: CONFIRMATION,
    now: NOW,
    ...extra,
  })
}

test('local SVC with a matching model and GPU is ready, but realReady stays false', () => {
  const result = svc()
  assert.equal(result.ok, true)
  assert.equal(result.value.ready, true)
  assert.equal(result.value.realReady, false)
  assert.equal(result.value.fixtureEvidence, true)
  assert.equal(result.value.evidence.state, 'VALID_FIXTURE')
})

test('SVC without GPU falls back to authorized cloud, otherwise both reasons appear', () => {
  const cloud = svc({ gpu: { available: false }, cloud: { authorized: true, providerReady: true } })
  assert.equal(cloud.value.ready, true)
  const blocked = svc({ gpu: { available: false }, cloud: { authorized: false, providerReady: true } })
  assert.equal(blocked.value.ready, false)
  assert.deepEqual(blocked.value.blockedBy.map((item) => item.code), ['COVER_READINESS_GPU_UNAVAILABLE', 'COVER_READINESS_CLOUD_NOT_AUTHORIZED'])
})

test('an authorized but not-ready SVC cloud never becomes ready', () => {
  const cloud = svc({ gpu: { available: false }, cloud: { authorized: true, providerReady: false } })
  assert.equal(cloud.value.ready, false)
  assert.deepEqual(cloud.value.blockedBy.map((item) => item.code), ['COVER_READINESS_GPU_UNAVAILABLE', 'COVER_READINESS_PROVIDER_NOT_READY'])
})

test('a future observedAt is invalid evidence, not a valid fixture', () => {
  const future = svc({ evidence: { observedAt: '2026-11-03T00:00:00.000Z', expiresAt: '2026-11-04T00:00:00.000Z', realReady: false } })
  assert.equal(future.value.ready, false)
  assert.equal(future.value.evidence.state, 'UNKNOWN')
  assert.equal(future.value.blockedBy.some((item) => item.code === 'COVER_READINESS_EVIDENCE_UNKNOWN'), true)
})

test('a missing or mismatched model blocks SVC', () => {
  assert.equal(svc({ model: { present: false, revision: 0, requiredRevision: 2 } }).value.ready, false)
  assert.equal(svc({ model: { present: true, revision: 1, requiredRevision: 2 } }).value.ready, false)
})

test('TTS requires a ready provider and cloud authorization and differs from SVC', () => {
  const tts = computeCoverReadiness({
    mode: 'TTS', sourceType: 'TEXT', cloud: { authorized: true, providerReady: true }, evidence: EVIDENCE, confirmation: CONFIRMATION, now: NOW,
  })
  assert.equal(tts.value.ready, true)
  const denied = computeCoverReadiness({
    mode: 'TTS', sourceType: 'TEXT', cloud: { authorized: false, providerReady: false }, evidence: EVIDENCE, confirmation: CONFIRMATION, now: NOW,
  })
  assert.equal(denied.value.ready, false)
  assert.equal(denied.value.blockedBy.some((item) => item.code === 'COVER_READINESS_CLOUD_NOT_AUTHORIZED'), true)
})

test('revoked, expired rights and missing source block AUDIO_REF', () => {
  assert.equal(svc({ source: { present: false, rightsState: 'GRANTED', expiresAt: EXPIRES } }).value.ready, false)
  assert.equal(svc({ source: { present: true, rightsState: 'REVOKED', expiresAt: EXPIRES } }).value.ready, false)
  assert.equal(svc({ source: { present: true, rightsState: 'GRANTED', expiresAt: NOW } }).value.ready, false)
})

test('stale or unknown evidence never becomes ready', () => {
  const stale = svc({ evidence: { observedAt: NOW, expiresAt: NOW, realReady: false } })
  assert.equal(stale.value.ready, false)
  assert.equal(stale.value.evidence.state, 'STALE')
  const unknown = svc({ evidence: { observedAt: NOW, expiresAt: EXPIRES, realReady: true } })
  assert.equal(unknown.value.ready, false)
  assert.equal(unknown.value.evidence.state, 'UNKNOWN')
})

test('first-visit confirmation is separate from availability', () => {
  const pending = svc({ confirmation: { firstVisit: true, confirmed: false } })
  assert.equal(pending.value.ready, false)
  assert.equal(pending.value.blockedBy[0].code, 'COVER_READINESS_CONFIRMATION_REQUIRED')
  const confirmed = svc({ confirmation: { firstVisit: true, confirmed: true } })
  assert.equal(confirmed.value.ready, true)
})

test('TTS and SVC alternate in one session with different minimal dependency sets', () => {
  const tts = computeCoverReadiness({ mode: 'TTS', sourceType: 'TEXT', cloud: { authorized: true, providerReady: true }, evidence: EVIDENCE, confirmation: CONFIRMATION, now: NOW })
  const back = svc()
  assert.equal(tts.value.ready, true)
  assert.equal(back.value.ready, true)
  assert.notDeepEqual(tts.value.dependencies.map((item) => item.id), back.value.dependencies.map((item) => item.id))
})

/* ---------------------------------------------- fake relay E2E ------------------------------- */

function savedRecord(taskId, deliveryRequested) {
  return {
    schemaVersion: 1,
    taskId,
    feature: 'singing',
    taskType: 'SVC',
    source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-bytes-0123456789abcdef0123456789abcdef' },
    voiceProfileId: 'voice:demo-hero',
    deliveryRequested,
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
}

test('a Cover SAVED record refuses an unauthorized delivery candidate', () => {
  const result = buildRelayHandoffCandidate(savedRecord('task:fixture-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', false), 'delivery:test-1')
  assert.equal(result.ok, false)
  assert.equal(result.errors[0].path, 'deliveryRequested')
})

test('the Fake Relay sends once, deduplicates and never resends UNKNOWN', () => {
  const record = savedRecord('task:fixture-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true)
  const candidate = buildRelayHandoffCandidate(record, 'delivery:test-2')
  assert.equal(candidate.ok, true)
  const relay = createFakeRelay()
  const first = relay.submit(candidate.value)
  assert.equal(first.value.outcome, 'SENT')
  const duplicate = relay.submit(candidate.value)
  assert.equal(duplicate.value.outcome, 'EXISTING')
  assert.equal(relay.stats().sent, 1)
  relay.simulateUnknown('delivery:test-2')
  const resend = relay.submit(candidate.value)
  assert.equal(resend.ok, false)
  assert.equal(resend.errors[0].code, FAKE_RELAY_CODES.UNKNOWN_NO_RESEND)
  assert.equal(relay.stats().sent, 1)
})

test('the real Fixture chain reaches SAVED and then stops at the delivery boundary', async () => {
  const sandbox = createConfigSandbox()
  try {
    const library = await openFixtureArtifactLibrary({ sandbox })
    const source = wavFromSamples([1000, -2000, 32767, -32768], 44100)
    const imported = await library.value.import({
      schemaVersion: 1, scopeId: 'scope:e2e', requestKey: 'import:source', bytes: source, now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: 'fixture-rights:e2e' },
    })
    const sourceRef = imported.value.artifact.artifactRef
    const draft = {
      intentVersion: 1, scopeId: 'scope:e2e', sourceRef, sourceRevision: 1, rightsState: 'GRANTED',
      rightsProofRef: 'fixture-rights:e2e', rightsExpiresAt: EXPIRES, voiceProfileId: 'voice:demo-hero', profileRevision: 1,
      modelAssetId: 'asset:fixture-model-a', modelRevision: 1, modelIntegrityTruth: 'DECLARED_FIXTURE',
      instanceId: 'instance:rvc', candidateId: 'rvc', modelRef: 'rvc-model:fixture-a', backendRevision: 1, pitchShift: 0,
      recipe: { sourceLayout: 'MIXED', separationPreset: 'FIXTURE_TWO_STEM', mixMode: 'WITH_INSTRUMENTAL', vocalGainDb: 0, instrumentalGainDb: 0 },
      outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: 44100, channels: 1 },
    }
    const birth = await createCoverTask({ sandbox, scopeId: 'scope:e2e', idempotencyKey: 'cover:e2e', intentDraft: draft, observedAt: NOW })
    assert.equal(birth.ok, true)
    const run = await executeCover({
      sandbox, scopeId: 'scope:e2e', taskId: birth.value.taskId, requestKey: 'exec:e2e', now: NOW, expiresAt: EXPIRES,
      rights: { state: 'GRANTED', proofRef: 'fixture-rights:e2e' }, intent: birth.value.intent,
    })
    assert.equal(run.value.outcome, 'SAVED')
    const record = { ...birth.value.record, state: 'SAVED', outputArtifactRef: run.value.value.master.artifactRef }
    const candidate = buildRelayHandoffCandidate(record, 'delivery:e2e')
    assert.equal(candidate.ok, false)
    assert.equal(candidate.errors[0].path, 'deliveryRequested')
  } finally {
    removeConfigSandbox(sandbox)
  }
})
