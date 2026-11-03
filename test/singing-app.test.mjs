import test from 'node:test'
import assert from 'node:assert/strict'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import { wavFromSamples } from '../core/audio/cover-stage-bytes-internal.mjs'
import { openSingingApp, SINGING_APP_ERRORS } from '../core/singing-app-internal.mjs'
import { coverDependencies } from './support/cover-dependencies.mjs'

const NOW = '2026-11-01T00:00:00.000Z'
const EXPIRES = '2026-11-02T00:00:00.000Z'
const SCOPE = 'scope:fixture-singing-app'
const PROOF = 'fixture-rights:singing-app'

const VOICE = {
  voiceProfileId: 'voice:demo-hero',
  profileRevision: 1,
  modelAssetId: 'asset:fixture-model-a',
  modelRevision: 1,
  modelIntegrityTruth: 'DECLARED_FIXTURE',
  instanceId: 'instance:rvc',
  candidateId: 'rvc',
  modelRef: 'rvc-model:fixture-a',
  backendRevision: 1,
  label: '演示声线',
}

function draft(sourceRef, overrides = {}) {
  return {
    sourceRef,
    voiceProfileId: VOICE.voiceProfileId,
    sourceLayout: 'MIXED',
    mixMode: 'WITH_INSTRUMENTAL',
    pitchShift: 0,
    vocalGainDb: 0,
    instrumentalGainDb: 0,
    ...overrides,
  }
}

async function setup() {
  const sandbox = createConfigSandbox()
  const library = await openFixtureArtifactLibrary({ sandbox })
  const imported = await library.value.import({
    schemaVersion: 1,
    scopeId: SCOPE,
    requestKey: 'import:singing-app',
    bytes: wavFromSamples([1200, -2200, 32767, -32768], 44100),
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
  })
  assert.equal(imported.ok, true)
  const sourceRef = imported.value.artifact.artifactRef
  const source = {
    sourceRef,
    sourceRevision: 1,
    rights: { state: 'GRANTED', proofRef: PROOF, expiresAt: EXPIRES },
    label: '演示曲',
  }
  return { sandbox, sourceRef, source }
}

function appFor(sandbox, source, overrides = {}) {
  return openSingingApp({
    sandbox,
    scopeId: SCOPE,
    sources: [source],
    voices: [VOICE],
    now: () => NOW,
    dependenciesProvider: ({ taskId, intent, now, expiresAt }) => coverDependencies({
      scopeId: SCOPE,
      sourceRef: source.sourceRef,
      taskId,
      now,
      expiresAt,
      intent,
    }),
    ...overrides,
  })
}

test('singing app lists trusted Fixture facts without realReady', async () => {
  const { sandbox, source } = await setup()
  try {
    const opened = appFor(sandbox, source)
    assert.equal(opened.ok, true)
    const list = opened.app.list()
    assert.equal(list.ok, true)
    assert.equal(list.realReady, false)
    assert.equal(list.fixtureOnly, true)
    assert.equal(list.sources.length, 1)
    assert.equal(list.voices.length, 1)
    assert.equal(JSON.stringify(list).includes(PROOF), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a MIXED Fixture run saves one MASTER and preview reads bounded stored bytes', async () => {
  const { sandbox, sourceRef, source } = await setup()
  try {
    const app = appFor(sandbox, source).app
    const run = await app.run(draft(sourceRef))
    assert.equal(run.ok, true)
    assert.equal(run.stage.state, 'SAVED')
    assert.ok(run.stage.master && run.stage.master.artifactRef)
    assert.equal(run.stage.realReady, false)
    const preview = await app.preview({ taskId: run.taskId, draft: draft(sourceRef) })
    assert.equal(preview.ok, true)
    assert.ok(preview.bytes.length > 0)
    assert.equal(preview.byteLength, preview.bytes.length)
    assert.equal(preview.fixtureOnly, true)
    assert.equal(preview.realReady, false)

    const again = await app.run(draft(sourceRef))
    assert.equal(again.ok, true)
    assert.equal(again.taskId, run.taskId)
    assert.equal(again.reused, true)
    const created = await app.create(draft(sourceRef))
    assert.equal(created.ok, true)
    assert.equal(created.taskId, run.taskId)
    assert.equal(created.outcome, 'EXISTING')
    const cancel = await app.cancel(run.taskId)
    assert.equal(cancel.ok, true)
    assert.equal(cancel.cancelState, 'TOO_LATE')
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a CLEAN_VOCAL layout runs through the same task/Artifact boundary', async () => {
  const { sandbox, sourceRef, source } = await setup()
  try {
    const app = appFor(sandbox, source).app
    const run = await app.run(draft(sourceRef, { sourceLayout: 'CLEAN_VOCAL', mixMode: 'VOCAL_ONLY', pitchShift: 2 }))
    assert.equal(run.ok, true)
    assert.equal(run.stage.state, 'SAVED')
    assert.equal(run.stage.stages.some((stage) => stage.stage === 'SEPARATING'), false)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a controlled slow run is queryable and cancel reaches CANCELLED with no MASTER', async () => {
  const { sandbox, sourceRef, source } = await setup()
  try {
    const app = appFor(sandbox, source, { stageDelayMs: 150 }).app
    const started = await app.start(draft(sourceRef))
    assert.equal(started.ok, true)
    assert.ok(started.taskId)
    let mid = await app.status(started.taskId)
    for (let attempt = 0; attempt < 40 && (!mid.ok || mid.stage.state !== 'CLAIMED'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      mid = await app.status(started.taskId)
    }
    assert.equal(mid.ok, true)
    assert.equal(mid.stage.state, 'CLAIMED')
    const cancel = await app.cancel(started.taskId)
    assert.equal(cancel.ok, true)
    assert.equal(cancel.cancelState, 'ACCEPTED')
    await app.waitFor(started.taskId)
    let final = await app.status(started.taskId)
    for (let attempt = 0; attempt < 60 && final.stage.state === 'CLAIMED'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      final = await app.status(started.taskId)
    }
    assert.equal(final.ok, true)
    assert.equal(final.stage.state, 'CANCELLED')
    assert.equal(final.stage.master, null)
    const preview = await app.preview({ taskId: started.taskId, draft: draft(sourceRef) })
    assert.equal(preview.ok, false)
    assert.equal(preview.code, SINGING_APP_ERRORS.NOT_SAVED)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('changed parameters on the same source/voice are a parameter conflict, not a second task', async () => {
  const { sandbox, sourceRef, source } = await setup()
  try {
    const app = appFor(sandbox, source).app
    const first = await app.create(draft(sourceRef))
    assert.equal(first.ok, true)
    const changed = await app.create(draft(sourceRef, { sourceLayout: 'CLEAN_VOCAL', mixMode: 'VOCAL_ONLY' }))
    assert.equal(changed.ok, false)
    assert.equal(changed.code, SINGING_APP_ERRORS.PARAMETER_CONFLICT)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('missing dependency provider refuses execution; unknown source/voice is rejected', async () => {
  const { sandbox, sourceRef, source } = await setup()
  try {
    const noDeps = appFor(sandbox, source, { dependenciesProvider: null }).app
    const blocked = await noDeps.run(draft(sourceRef))
    assert.equal(blocked.ok, false)
    assert.equal(blocked.code, SINGING_APP_ERRORS.NO_DEPENDENCIES)

    const app = appFor(sandbox, source).app
    assert.equal((await app.create(draft('fixture://unknown'))).code, SINGING_APP_ERRORS.SOURCE_UNKNOWN)
    assert.equal((await app.create(draft(sourceRef, { voiceProfileId: 'voice:unknown' }))).code, SINGING_APP_ERRORS.VOICE_UNKNOWN)
  } finally {
    removeConfigSandbox(sandbox)
  }
})

test('a rejected source rights declaration is surfaced as a Core rejection, not success', async () => {
  const { sandbox, sourceRef, source } = await setup()
  try {
    const wrong = { ...source, rights: { ...source.rights, proofRef: 'fixture-rights:wrong' } }
    const app = appFor(sandbox, wrong).app
    const created = await app.create(draft(sourceRef))
    assert.equal(created.ok, false)
    assert.equal(created.code, SINGING_APP_ERRORS.CORE_REJECTED)
  } finally {
    removeConfigSandbox(sandbox)
  }
})
