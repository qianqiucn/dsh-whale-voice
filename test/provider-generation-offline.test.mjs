import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import {
  PROVIDER_GENERATION_ERRORS,
  PROVIDER_GENERATION_SCHEMA_VERSION,
  createProviderGenerationCoordinator,
} from '../core/audio/provider-generation-offline.mjs'

const SCOPE = 'scope:fixture-test'
const TASK = 'task:fixture-' + 'a'.repeat(32)
const NOW = '2026-11-04T06:00:00.000Z'
const PROOF = 'fixture-rights:test-proof-1'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/** A deterministic 24 kHz / mono / PCM16 WAV with a tiny ramp, built without any external file. */
function makeWav({ sampleRate = 24000, channels = 1, durationMs = 500, amplitude = 0.1 } = {}) {
  const frames = Math.round((sampleRate * durationMs) / 1000)
  const data = Buffer.alloc(frames * channels * 2)
  for (let index = 0; index < frames; index += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 32767 * amplitude)
    for (let channel = 0; channel < channels; channel += 1) data.writeInt16LE(sample, (index * channels + channel) * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * 2, 28)
  header.writeUInt16LE(channels * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return new Uint8Array(Buffer.concat([header, data]))
}

function createAuthority(state = 'CREATED') {
  return async ({ scopeId, taskId }) => ({ ok: true, birth: { identityHash: sha256(scopeId + '|' + taskId), state } })
}

function createMockProvider({ bytes, answer = null, defer = false } = {}) {
  let pendingResolve = null
  const calls = []
  const provider = {
    get calls() {
      return calls.length
    },
    get lastRequest() {
      return calls[calls.length - 1] || null
    },
    async beginSynthesis(request) {
      calls.push(request)
      const requestId = 'qwen-request-' + calls.length
      let result
      if (defer === true) {
        result = new Promise((resolve) => {
          pendingResolve = resolve
        })
      } else {
        result = Promise.resolve(answer || { ok: true, providerId: 'qwen3-tts', requestId, bytes: bytes || makeWav() })
      }
      return { ok: true, requestId, result, cancel: async () => ({ ok: true }) }
    },
    async cancel() {
      return { ok: true, ack: 'CANCEL_ACK' }
    },
    resolve(value) {
      assert.ok(pendingResolve, 'no pending synthesis')
      pendingResolve(value)
    },
  }
  return provider
}

function claimInput(overrides = {}) {
  return {
    schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION,
    scopeId: SCOPE,
    taskId: TASK,
    requestKey: 'key:fixture-test-1',
    rights: { state: 'GRANTED', proofRef: PROOF },
    provider: {
      providerId: 'qwen3-tts',
      instanceId: 'instance-1',
      model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
      backend: 'gpu',
      voiceId: 'whale-v1',
    },
    request: { text: '你好，隔离测试。', language: 'zh', emotion: '', modality: 'clone' },
    ...overrides,
  }
}

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try {
    const opened = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(opened.ok, true, JSON.stringify(opened))
    return await fn({ sandbox, artifacts: opened.value })
  } finally {
    removeConfigSandbox(sandbox)
  }
}

async function open({ sandbox, artifacts, provider, authority = createAuthority(), now = () => NOW }) {
  const coordinator = createProviderGenerationCoordinator({ sandbox, artifacts, provider, authority, now })
  assert.equal(coordinator.ok, true, JSON.stringify(coordinator))
  return coordinator
}

test('provider generation: prepare → submit → SAVED artifact, reopen and readback', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const bytes = makeWav({ durationMs: 800 })
    const provider = createMockProvider({ bytes })
    const coordinator = await open({ sandbox, artifacts, provider })

    const prepared = await coordinator.prepare(claimInput())
    assert.equal(prepared.ok, true, JSON.stringify(prepared))
    assert.equal(prepared.outcome, 'CREATED')
    assert.equal(prepared.claim.state, 'CLAIMED')
    assert.equal(provider.calls, 0, 'prepare must not synthesise')

    const submitted = await coordinator.submit({ claimId: prepared.claim.claimId })
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.outcome, 'SAVED')
    assert.equal(submitted.claim.state, 'SAVED')
    assert.match(submitted.claim.artifact.artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    assert.equal(submitted.claim.artifact.sha256, sha256(bytes))
    assert.equal(submitted.claim.artifact.byteLength, bytes.length)
    assert.equal(submitted.claim.jointProof.artifactSha256, sha256(bytes))
    assert.equal(submitted.claim.jointProof.taskIdentityHash, sha256(SCOPE + '|' + TASK))
    assert.equal(prepared.claim.provider.model, 'Qwen3-TTS-12Hz-1.7B-CustomVoice')
    assert.equal(provider.calls, 1)

    // A second submit of a terminal claim never synthesises again.
    const again = await coordinator.submit({ claimId: prepared.claim.claimId })
    assert.equal(again.outcome, 'EXISTING')
    assert.equal(provider.calls, 1)

    // A fresh coordinator over the same sandbox sees the same SAVED claim and artifact.
    const reopened = await open({ sandbox, artifacts, provider: createMockProvider({ bytes }) })
    const status = reopened.status(prepared.claim.claimId)
    assert.equal(status.ok, true)
    assert.equal(status.claim.state, 'SAVED')
    const read = await reopened.get(prepared.claim.claimId)
    assert.equal(read.ok, true, JSON.stringify(read))
    assert.equal(sha256(read.value.bytes), sha256(bytes))
  })
})

test('provider generation: version, rights, authority and duplicate rules fail closed before synthesis', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const provider = createMockProvider({})
    const coordinator = await open({ sandbox, artifacts, provider })

    const version = await coordinator.prepare(claimInput({ schemaVersion: 2 }))
    assert.equal(version.ok, false)
    assert.equal(version.code, PROVIDER_GENERATION_ERRORS.UNSUPPORTED_VERSION)

    const rights = await coordinator.prepare(claimInput({ rights: { state: 'DENIED', proofRef: PROOF } }))
    assert.equal(rights.ok, false)
    assert.equal(rights.code, PROVIDER_GENERATION_ERRORS.RIGHTS_REJECTED)

    const first = await coordinator.prepare(claimInput())
    assert.equal(first.ok, true)
    const duplicate = await coordinator.prepare(claimInput())
    assert.equal(duplicate.outcome, 'EXISTING')
    assert.equal(duplicate.claim.claimId, first.claim.claimId)

    const conflicting = await coordinator.prepare(claimInput({ request: { text: '不同的文本', language: 'zh', emotion: '', modality: 'clone' } }))
    assert.equal(conflicting.ok, false)
    assert.equal(conflicting.code, PROVIDER_GENERATION_ERRORS.CONFLICT)

    const crossScope = await coordinator.prepare(claimInput({ scopeId: 'scope:fixture-other' }))
    assert.equal(crossScope.ok, false)
    assert.equal(crossScope.code, PROVIDER_GENERATION_ERRORS.CROSS_SCOPE)

    const tooLong = await coordinator.prepare(claimInput({ request: { text: 'x'.repeat(201), language: 'zh', emotion: '', modality: 'clone' } }))
    assert.equal(tooLong.ok, false)
    assert.equal(tooLong.code, PROVIDER_GENERATION_ERRORS.RESOURCE_LIMIT)
    assert.equal(provider.calls, 0, 'no refusal path may synthesise')
  })
})

test('provider generation: an already-settled task or a missing authority is refused', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const provider = createMockProvider({})
    const settled = await open({ sandbox, artifacts, provider, authority: createAuthority('SAVED') })
    const refused = await settled.prepare(claimInput())
    assert.equal(refused.ok, false)
    assert.equal(refused.code, PROVIDER_GENERATION_ERRORS.AUTHORITY_REJECTED)

    const missing = await open({ sandbox, artifacts, provider, authority: async () => ({ ok: false }) })
    const notFound = await missing.prepare(claimInput())
    assert.equal(notFound.ok, false)
    assert.equal(notFound.code, PROVIDER_GENERATION_ERRORS.AUTHORITY_REJECTED)
    assert.equal(provider.calls, 0)
  })
})

test('provider generation: invalid or over-limit provider output fails without saving', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const badRate = createMockProvider({ bytes: makeWav({ sampleRate: 22050 }) })
    const coordinator = await open({ sandbox, artifacts, provider: badRate })
    const prepared = await coordinator.prepare(claimInput())
    const submitted = await coordinator.submit({ claimId: prepared.claim.claimId })
    assert.equal(submitted.ok, false)
    assert.equal(submitted.outcome, 'FAILED')
    assert.match(submitted.claim.lastError, /sampleRate/)

    const badChannels = createMockProvider({ bytes: makeWav({ channels: 2 }) })
    const second = await open({ sandbox, artifacts, provider: badChannels })
    const claim2 = await second.prepare(claimInput({ taskId: 'task:fixture-' + 'b'.repeat(32), requestKey: 'key:fixture-test-2' }))
    const result2 = await second.submit({ claimId: claim2.claim.claimId })
    assert.equal(result2.outcome, 'FAILED')
    assert.match(result2.claim.lastError, /channels/)

    const tooLongAudio = createMockProvider({ bytes: makeWav({ durationMs: 21000 }) })
    const third = await open({ sandbox, artifacts, provider: tooLongAudio })
    const claim3 = await third.prepare(claimInput({ taskId: 'task:fixture-' + 'c'.repeat(32), requestKey: 'key:fixture-test-3' }))
    const result3 = await third.submit({ claimId: claim3.claim.claimId })
    assert.equal(result3.outcome, 'FAILED')
    assert.match(result3.claim.lastError, /durationMs/)

    for (const claim of [submitted.claim, result2.claim, result3.claim]) {
      assert.equal(claim.artifact, null, 'no artifact may be stored for invalid output')
    }
  })
})

test('provider generation: cancellation and unknown results stay terminal and never resend', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const deferred = createMockProvider({ defer: true })
    const coordinator = await open({ sandbox, artifacts, provider: deferred })
    const prepared = await coordinator.prepare(claimInput())
    const running = coordinator.submit({ claimId: prepared.claim.claimId })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const cancelled = await coordinator.cancel(prepared.claim.claimId)
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled))
    assert.equal(cancelled.claim.cancel.requested, true)
    assert.equal(cancelled.claim.cancel.ack, 'ACKED')
    deferred.resolve({ ok: false, cancelled: true })
    const settled = await running
    assert.equal(settled.outcome, 'CANCELLED')
    assert.equal(settled.claim.state, 'CANCELLED')
    assert.equal(settled.claim.artifact, null)

    const unknown = createMockProvider({ answer: { ok: false, unknown: true, code: 'TIMEOUT' } })
    const second = await open({ sandbox, artifacts, provider: unknown })
    const claim2 = await second.prepare(claimInput({ taskId: 'task:fixture-' + 'd'.repeat(32), requestKey: 'key:fixture-test-4' }))
    const firstRun = await second.submit({ claimId: claim2.claim.claimId })
    assert.equal(firstRun.outcome, 'UNKNOWN')
    const retry = await second.submit({ claimId: claim2.claim.claimId })
    assert.equal(retry.outcome, 'EXISTING')
    assert.equal(unknown.calls, 1, 'UNKNOWN must never resynthesise')
  })
})

test('provider generation: a failed artifact write leaves a SAVE_UNKNOWN tombstone, never a second synthesis', async () => {
  await withSandbox(async ({ sandbox }) => {
    const broken = {
      async import() {
        return { ok: false, errors: [{ code: 'WRITE_UNKNOWN', path: '$' }] }
      },
      async readBytes() {
        return { ok: false }
      },
    }
    const provider = createMockProvider({})
    const coordinator = await open({ sandbox, artifacts: broken, provider })
    const prepared = await coordinator.prepare(claimInput())
    const submitted = await coordinator.submit({ claimId: prepared.claim.claimId })
    assert.equal(submitted.ok, false)
    assert.equal(submitted.outcome, 'SAVE_UNKNOWN')
    assert.equal(submitted.claim.state, 'SAVE_UNKNOWN')
    assert.equal(submitted.claim.artifact, null)
    const again = await coordinator.submit({ claimId: prepared.claim.claimId })
    assert.equal(again.outcome, 'EXISTING')
    assert.equal(provider.calls, 1)
  })
})

test('provider generation: a readback mismatch is a tombstone, not a SAVED claim', async () => {
  await withSandbox(async ({ sandbox }) => {
    const bytes = makeWav()
    const mismatched = {
      async import() {
        return {
          ok: true,
          value: {
            outcome: 'STORED',
            artifact: {
              artifactRef: 'artifact:fixture-bytes-' + '1'.repeat(32),
              inspection: { sha256: sha256(bytes), byteLength: bytes.length },
            },
          },
        }
      },
      async readBytes() {
        return { ok: true, value: { bytes: makeWav({ durationMs: 600 }) } }
      },
    }
    const provider = createMockProvider({ bytes })
    const coordinator = await open({ sandbox, artifacts: mismatched, provider })
    const prepared = await coordinator.prepare(claimInput())
    const submitted = await coordinator.submit({ claimId: prepared.claim.claimId })
    assert.equal(submitted.ok, false)
    assert.equal(submitted.outcome, 'SAVE_UNKNOWN')
    assert.match(submitted.claim.lastError, /readback/)
  })
})

test('provider generation: a closed coordinator rejects new claims without side effects', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const provider = createMockProvider({})
    const coordinator = await open({ sandbox, artifacts, provider })
    const prepared = await coordinator.prepare(claimInput())
    assert.equal(prepared.ok, true)
    await coordinator.close()
    const refused = await coordinator.prepare(claimInput({ taskId: 'task:fixture-' + 'e'.repeat(32), requestKey: 'key:fixture-test-5' }))
    assert.equal(refused.ok, false)
    assert.equal(refused.code, PROVIDER_GENERATION_ERRORS.INPUT_INVALID)
  })
})

function createDeferredProvider({ bytes = makeWav(), cancelAnswer = { ok: true, ack: 'CANCEL_ACK' }, beginDelay = 20 } = {}) {
  let pendingResolve = null
  let beginResolve = null
  const calls = []
  return {
    get calls() {
      return calls.length
    },
    async beginSynthesis(request) {
      calls.push(request)
      const requestId = 'qwen-request-' + calls.length
      const result = new Promise((resolve) => {
        pendingResolve = resolve
      })
      const gate = new Promise((resolve) => {
        beginResolve = resolve
      })
      // The begin promise stays pending for beginDelay ms, modelling a supervisor handshake.
      await gate
      return { ok: true, requestId, result, cancel: async () => cancelAnswer }
    },
    async cancel() {
      return cancelAnswer
    },
    releaseBegin() {
      if (beginResolve) beginResolve()
    },
    resolve(value) {
      assert.ok(pendingResolve, 'no pending synthesis')
      pendingResolve(value)
    },
  }
}

test('provider generation: a cancel that arrives while begin is pending is honoured after the handle appears', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const provider = createDeferredProvider()
    const coordinator = await open({ sandbox, artifacts, provider })
    const prepared = await coordinator.prepare(claimInput())
    const running = coordinator.submit({ claimId: prepared.claim.claimId })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const pending = await coordinator.cancel(prepared.claim.claimId)
    assert.equal(pending.ok, true, JSON.stringify(pending))
    assert.equal(pending.claim.cancel.ack, 'PENDING')
    provider.releaseBegin()
    await new Promise((resolve) => setTimeout(resolve, 10))
    const after = coordinator.status(prepared.claim.claimId)
    assert.equal(after.claim.cancel.requested, true)
    assert.equal(after.claim.cancel.ack, 'ACKED')
    provider.resolve({ ok: false, cancelled: true })
    const settled = await running
    assert.equal(settled.outcome, 'CANCELLED')
    assert.equal(settled.claim.artifact, null)
  })
})

test('provider generation: close during begin settles UNKNOWN and never writes a SAVED artifact', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const provider = createDeferredProvider()
    const coordinator = await open({ sandbox, artifacts, provider })
    const prepared = await coordinator.prepare(claimInput())
    const running = coordinator.submit({ claimId: prepared.claim.claimId })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const closed = await coordinator.close()
    assert.equal(closed.ok, true)
    assert.ok(closed.settled.includes(prepared.claim.claimId))
    provider.releaseBegin()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const state = coordinator.status(prepared.claim.claimId)
    assert.equal(state.claim.state, 'UNKNOWN')
    assert.equal(state.claim.cancel.requested, true)
    const late = await running
    assert.equal(late.ok, false)
    // The late provider result must not turn the closed claim into SAVED.
    provider.resolve({ ok: true, bytes: makeWav(), providerId: 'qwen3-tts' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(coordinator.status(prepared.claim.claimId).claim.artifact, null)
  })
})

test('provider generation: an unconfirmed cancel and a contradictory cancelled+unknown stay unknown', async () => {
  await withSandbox(async ({ sandbox, artifacts }) => {
    const unconfirmed = createDeferredProvider({ cancelAnswer: { ok: false, confirmed: false } })
    const coordinator = await open({ sandbox, artifacts, provider: unconfirmed })
    const prepared = await coordinator.prepare(claimInput())
    const running = coordinator.submit({ claimId: prepared.claim.claimId })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const cancel = await coordinator.cancel(prepared.claim.claimId)
    assert.equal(cancel.ok, true)
    unconfirmed.releaseBegin()
    await new Promise((resolve) => setTimeout(resolve, 15))
    assert.equal(coordinator.status(prepared.claim.claimId).claim.cancel.ack, 'UNCONFIRMED')
    unconfirmed.resolve({ ok: false, cancelled: true, unknown: true })
    const settled = await running
    assert.equal(settled.outcome, 'UNKNOWN')
    assert.equal(coordinator.status(prepared.claim.claimId).claim.artifact, null)
  })
})
