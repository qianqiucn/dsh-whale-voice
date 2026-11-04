/* Whale Voice Core — preset generation application entry (Plan 10-R1, OFFLINE / ISOLATED).
 *
 * The application-facing entry for "short text + an existing preset voice -> one isolated generation
 * -> the original task is SAVED". It composes the existing Task catalog, Task owner, Artifact library
 * and the provider-generation coordinator; the caller supplies the trusted sandbox and an already
 * started audited provider. It never starts a model, process, device or Host route, and it does not
 * import any test bridge or Fixture worker.
 */

import crypto from 'node:crypto'

import { openFixtureTaskCatalog } from './audio/task-catalog.mjs'
import { openFixtureTaskOwner } from './audio/task-owner.mjs'
import { openFixtureArtifactLibrary } from './audio/artifact-library.mjs'
import {
  PROVIDER_GENERATION_SCHEMA_VERSION,
  createProviderGenerationCoordinator,
} from './audio/provider-generation-offline.mjs'

export const PRESET_GENERATION_APP_SCHEMA_VERSION = 1

export const PRESET_GENERATION_APP_ERRORS = Object.freeze({
  INPUT_INVALID: 'PRESET_GENERATION_INPUT_INVALID',
  VOICE_REJECTED: 'PRESET_GENERATION_VOICE_REJECTED',
  TEXT_REJECTED: 'PRESET_GENERATION_TEXT_REJECTED',
  GENERATION_REJECTED: 'PRESET_GENERATION_REJECTED',
  STATUS_REJECTED: 'PRESET_GENERATION_STATUS_REJECTED',
})

const SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const TASK_PATTERN = /^task:fixture-[0-9a-f]{32}$/
const PROOF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/
const DEFAULT_TEXT_LIMIT = 200

function failure(code, detail = null) {
  return detail === null ? { ok: false, code } : { ok: false, code, detail }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function randomSuffix() {
  return crypto.randomBytes(8).toString('hex')
}

/**
 * Open the application entry over one trusted sandbox and one already started audited provider.
 *
 * @param {object} options
 * @param {object} options.sandbox trusted sandbox (same one the catalog/owner/artifact library use)
 * @param {object} options.provider audited provider with `beginSynthesis` and `cancel`
 * @param {string} options.scopeId application scope
 * @param {string} options.rightsProofRef `fixture-rights:...` proof for generation and reads
 * @param {Array<{id:string,label:string,languages:string[]}>} options.voices existing preset voices
 * @param {number} [options.textLimit] max text characters (default 200)
 * @param {Function} [options.now] ISO clock
 * @returns {Promise<{ok:true,value:{catalog:Function,generate:Function,status:Function}}|{ok:false,code:string,detail?:string}>}
 */
export async function openPresetGenerationApp(options = {}) {
  const sandbox = options.sandbox
  const provider = options.provider
  const scopeId = options.scopeId
  const rightsProofRef = options.rightsProofRef
  const voices = options.voices
  const textLimit = Number.isInteger(options.textLimit) ? options.textLimit : DEFAULT_TEXT_LIMIT
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()

  if (typeof scopeId !== 'string' || !SCOPE_PATTERN.test(scopeId)) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'scopeId')
  if (typeof rightsProofRef !== 'string' || !PROOF_PATTERN.test(rightsProofRef)) {
    return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'rightsProofRef')
  }
  if (!Array.isArray(voices) || voices.length === 0) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'voices')
  for (const voice of voices) {
    if (!voice || typeof voice.id !== 'string' || voice.id.length === 0) {
      return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'voices')
    }
    if (typeof voice.label !== 'string' || !Array.isArray(voice.languages) || voice.languages.length === 0) {
      return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'voices')
    }
  }
  if (textLimit < 1 || textLimit > 200) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'textLimit')
  if (!provider || typeof provider.beginSynthesis !== 'function' || typeof provider.cancel !== 'function') {
    return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'provider')
  }

  const catalogHandle = await openFixtureTaskCatalog({ sandbox })
  if (!catalogHandle.ok) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')
  const ownerHandle = await openFixtureTaskOwner({ sandbox })
  if (!ownerHandle.ok) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')
  const artifactLibrary = await openFixtureArtifactLibrary({ sandbox })
  if (!artifactLibrary.ok) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')

  async function authority({ scopeId: requestedScope, taskId }) {
    if (requestedScope !== scopeId) return { ok: false }
    const got = await catalogHandle.value.get({ schemaVersion: 1, scopeId, taskId })
    if (!got.ok) return { ok: false }
    return { ok: true, birth: { identityHash: sha256(scopeId + '|' + taskId), state: got.value.task.state } }
  }

  const coordinator = createProviderGenerationCoordinator({
    sandbox,
    artifacts: artifactLibrary.value,
    provider,
    authority,
    taskOwner: ownerHandle.value,
    now,
  })
  if (!coordinator.ok) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')

  function catalog() {
    return {
      ok: true,
      fixtureOnly: true,
      realReady: false,
      textLimit,
      voices: voices.map((voice) => ({ id: voice.id, label: voice.label, languages: [...voice.languages] })),
    }
  }

  async function generate(input = {}) {
    const text = typeof input.text === 'string' ? input.text.trim() : ''
    const voice = voices.find((item) => item.id === input.voiceId) || null
    if (!voice) return failure(PRESET_GENERATION_APP_ERRORS.VOICE_REJECTED, 'voiceId')
    if (text.length === 0 || text.length > textLimit) return failure(PRESET_GENERATION_APP_ERRORS.TEXT_REJECTED, 'text')
    const language = voice.languages.includes(input.language) ? input.language : voice.languages[0]
    const observedAt = now()

    const reserved = await catalogHandle.value.reserve({
      schemaVersion: 1,
      scopeId,
      idempotencyKey: 'key:fixture-preset-' + randomSuffix(),
      draft: {
        schemaVersion: 1,
        feature: 'voice-bubbles',
        taskType: 'TTS',
        source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-1' },
        voiceProfileId: 'voice:demo-hero',
        deliveryRequested: false,
        rights: { state: 'CONFIRMED_FIXTURE' },
      },
      observedAt,
    })
    if (!reserved.ok) {
      return failure(PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED, reserved.code || 'task birth rejected')
    }
    const taskId = reserved.value.task.taskId

    const prepared = await coordinator.prepare({
      schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION,
      scopeId,
      taskId,
      requestKey: 'key:preset-run-' + randomSuffix(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
      provider: {
        providerId: 'qwen3-tts',
        instanceId: 'instance-1',
        model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
        backend: 'custom-voice',
        voiceId: voice.id,
      },
      request: { text, language, emotion: '', modality: 'preset' },
    })
    if (!prepared.ok) {
      return failure(prepared.code || PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED, prepared.detail || null)
    }
    const submitted = await coordinator.submit({ claimId: prepared.claim.claimId })
    if (!submitted.ok) {
      return failure(
        submitted.code || PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED,
        (submitted.claim && submitted.claim.lastError) || null,
      )
    }
    return {
      ok: true,
      taskId,
      state: 'SAVED',
      ownerState: 'SAVED',
      artifactRef: submitted.claim.artifact.artifactRef,
      sha256: submitted.claim.artifact.sha256,
      byteLength: submitted.claim.artifact.byteLength,
      durationMs: submitted.claim.artifact.durationMs,
      voiceId: voice.id,
      language,
      fixtureOnly: true,
      realReady: false,
    }
  }

  async function status(taskId) {
    if (typeof taskId !== 'string' || !TASK_PATTERN.test(taskId)) {
      return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, 'taskId')
    }
    const got = await ownerHandle.value.get({ schemaVersion: 1, scopeId, taskId })
    if (!got.ok) {
      return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, got.errors && got.errors[0] ? got.errors[0].code : 'not found')
    }
    const artifactStatus = await ownerHandle.value.artifactStatus({
      schemaVersion: 1,
      scopeId,
      taskId,
      now: now(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
    })
    if (!artifactStatus.ok) {
      return failure(
        PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED,
        artifactStatus.errors && artifactStatus.errors[0] ? artifactStatus.errors[0].code : 'artifact status rejected',
      )
    }
    if (artifactStatus.value.state !== 'READABLE') {
      return {
        ok: true,
        taskId,
        state: got.value.task.state,
        ownerState: got.value.ownerState,
        readable: false,
        artifactRef: artifactStatus.value.artifactRef || null,
        fixtureOnly: true,
        realReady: false,
      }
    }
    const read = await artifactLibrary.value.readBytes({
      schemaVersion: 1,
      scopeId,
      artifactRef: artifactStatus.value.artifactRef,
      now: now(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
    })
    const bytes = read.ok && read.value ? read.value.bytes : null
    return {
      ok: true,
      taskId,
      state: got.value.task.state,
      ownerState: got.value.ownerState,
      readable: true,
      artifactRef: artifactStatus.value.artifactRef,
      sha256: bytes ? sha256(bytes) : null,
      byteLength: bytes ? bytes.length : null,
      fixtureOnly: true,
      realReady: false,
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: PRESET_GENERATION_APP_SCHEMA_VERSION,
      catalog,
      generate,
      status,
    }),
  }
}
