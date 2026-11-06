import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { openFixtureTaskOwner } from '../core/audio/task-owner.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import {
  PROVIDER_GENERATION_SCHEMA_VERSION,
  createProviderGenerationCoordinator,
} from '../core/audio/provider-generation-offline.mjs'
import { createQwenProvider } from '../core/tts/qwen-adapter.mjs'
import { createQwenSupervisor } from '../core/tts/qwen-supervisor.mjs'
import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fakeWorker = path.join(here, '..', 'test-fixtures', 'fake-qwen-worker.mjs')
const fakeRoot = path.join(here, '..', 'test-fixtures')

const SPAWN_OK = (() => {
  try {
    const probe = spawnSync(process.execPath, ['-e', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
    return !probe.error && probe.status === 0
  } catch {
    return false
  }
})()
const spawnSkip = SPAWN_OK ? false : 'child_process spawn is not permitted on this platform'

const SCOPE = 'scope:fixture-qwen-preset'
const NOW = '2026-11-04T16:00:00.000Z'
const SAMPLE_RATE = 24000
const TEXT = '你好，这是隔离预设音色演示。'
const PROOF = 'fixture-rights:qwen-preset-1'

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

/** The archived Fixture worker path: a real Node child process that never loads a model. */
function makeSupervisor() {
  return createQwenSupervisor({
    allowedRoot: fakeRoot,
    worker: { command: fakeWorker, runtime: process.execPath, args: ['--mode=ok'] },
    handshakeTimeoutMs: 5000,
    shutdownGraceMs: 500,
    killWaitMs: 300,
  })
}

async function openCatalogWithBirth(sandbox) {
  const catalog = await openFixtureTaskCatalog({ sandbox })
  assert.equal(catalog.ok, true, JSON.stringify(catalog))
  const reserved = await catalog.value.reserve({
    schemaVersion: 1,
    scopeId: SCOPE,
    idempotencyKey: 'key:fixture-qwen-preset-birth',
    draft: {
      schemaVersion: 1,
      feature: 'voice-bubbles',
      taskType: 'TTS',
      source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-1' },
      voiceProfileId: 'voice:demo-hero',
      deliveryRequested: false,
      rights: { state: 'CONFIRMED_FIXTURE' },
    },
    observedAt: NOW,
  })
  assert.equal(reserved.ok, true, JSON.stringify(reserved))
  return { catalog, taskId: reserved.value.task.taskId }
}

function claimFrame(taskId) {
  return {
    schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION,
    scopeId: SCOPE,
    taskId,
    requestKey: 'key:fixture-qwen-preset-1',
    rights: { state: 'GRANTED', proofRef: PROOF },
    provider: {
      providerId: 'qwen3-tts',
      instanceId: 'instance-1',
      model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
      backend: 'custom-voice',
      voiceId: 'demo-voice-a',
    },
    request: { text: TEXT, language: 'zh-CN', emotion: '', modality: 'preset' },
  }
}

function expectedFixtureBytes() {
  const ms = Math.min(20000, 200 + String(TEXT).length * 8)
  const frameCount = Math.round((SAMPLE_RATE * ms) / 1000)
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: SAMPLE_RATE, channels: 1, frameCount, pattern: 'EDGE_SEQUENCE' })
  assert.equal(produced.ok, true, JSON.stringify(produced))
  return produced.value.bytes
}

test('133 a preset CustomVoice request runs through the real Qwen public interface and the original task saves it', { skip: spawnSkip }, async () => {
  const sandbox = createConfigSandbox({ prefix: 'wv-qwen-preset-' })
  const supervisor = makeSupervisor()
  let provider = null
  try {
    const { catalog, taskId } = await openCatalogWithBirth(sandbox)
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true, JSON.stringify(owner))
    const library = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(library.ok, true, JSON.stringify(library))

    // The real public Qwen provider, pointed at the existing Fixture worker.
    provider = createQwenProvider({
      supervisor,
      requestTimeoutMs: 5000,
      taskAuthority: async (id) => {
        const got = await catalog.value.get({ schemaVersion: 1, scopeId: SCOPE, taskId: id })
        return got.ok ? { ok: true, state: got.value.task.state } : { ok: false }
      },
    })
    assert.equal(provider.ok, true, JSON.stringify(provider))
    const started = await provider.start()
    assert.equal(started.ok, true, JSON.stringify(started))

    const authority = async ({ scopeId, taskId: id }) => {
      const got = await catalog.value.get({ schemaVersion: 1, scopeId, taskId: id })
      if (!got.ok) return { ok: false }
      return { ok: true, birth: { identityHash: sha256(scopeId + '|' + id), state: got.value.task.state } }
    }
    const coordinator = createProviderGenerationCoordinator({
      sandbox,
      artifacts: library.value,
      provider,
      authority,
      taskOwner: owner.value,
      now: () => NOW,
    })
    assert.equal(coordinator.ok, true, JSON.stringify(coordinator))

    // The legal preset request is accepted (modality:'preset' and the voiceId-derived preset path).
    const prepared = await coordinator.prepare(claimFrame(taskId))
    assert.equal(prepared.ok, true, JSON.stringify(prepared))
    assert.equal(prepared.outcome, 'CREATED')
    assert.equal(prepared.claim.state, 'CLAIMED')

    const submitted = await coordinator.submit({ claimId: prepared.claim.claimId })
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.outcome, 'SAVED')
    assert.equal(submitted.claim.state, 'SAVED')
    assert.equal(submitted.claim.provider.voiceId, 'demo-voice-a')
    assert.equal(submitted.claim.provider.backend, 'custom-voice')

    // The bytes are exactly the Fixture worker's deterministic output for this text.
    const expected = expectedFixtureBytes()
    assert.equal(submitted.claim.artifact.sha256, sha256(expected))
    assert.equal(submitted.claim.artifact.byteLength, expected.length)

    // 132 flow: the original task is formally SAVED and points at that artifact.
    assert.equal(submitted.task.ownerState, 'SAVED')
    assert.equal(submitted.task.artifact.artifactRef, submitted.claim.artifact.artifactRef)
  } finally {
    if (provider && provider.ok) await provider.shutdown().catch(() => null)
    else await supervisor.stop().catch(() => null)
    removeConfigSandbox(sandbox)
  }
})
