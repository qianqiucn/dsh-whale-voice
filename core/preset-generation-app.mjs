/* Whale Voice Core — preset generation application entry (Plan 10-R1, OFFLINE / ISOLATED).
 *
 * The application-facing entry for "short text + an existing preset voice -> one isolated generation
 * -> the original task is SAVED". It composes the existing Task catalog, Task owner, Artifact library
 * and the provider-generation coordinator; the caller supplies the trusted sandbox and an already
 * started audited provider. It never starts a model, process, device or Host route, and it does not
 * import any test bridge or Fixture worker.
 *
 * 155: generation results stay usable beyond the fixed store budgets. The first segment is the given
 * storage root (so pre-fix results stay where they are); when the current segment approaches the
 * existing per-file task/artifact budgets, a new `segments/NNNN` store is opened and writes continue
 * there. Reads (status/results/download) search every segment, nothing is deleted and old results
 * keep their original task association. Saved Provider generation artifacts are not subject to the
 * recorded 24 h expiration; other artifact origins keep their expiry contract.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { openConfigStorage } from './config-sandbox.mjs'
import { openFixtureTaskCatalog } from './audio/task-catalog.mjs'
import { openFixtureTaskOwner } from './audio/task-owner.mjs'
import { openFixtureArtifactLibrary } from './audio/artifact-library.mjs'
import { AUDIO_TASK_FEATURES, AUDIO_TASK_TYPES } from './audio/task-contract.mjs'
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
  RESULTS_REJECTED: 'PRESET_GENERATION_RESULTS_REJECTED',
  DOWNLOAD_REJECTED: 'PRESET_GENERATION_DOWNLOAD_REJECTED',
})

const SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const TASK_PATTERN = /^task:fixture-[0-9a-f]{32}$/
const PROOF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/
const PROVIDER_ID_PATTERN = /^[a-z0-9-]{1,64}$/
const PROVIDER_INSTANCE_PATTERN = /^[A-Za-z0-9:._-]{1,64}$/
const PROVIDER_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9. _-]{0,127}$/
const PROVIDER_BACKEND_PATTERN = /^[a-z0-9-]{1,32}$/
const DEFAULT_TEXT_LIMIT = 200
const DEFAULT_PROVIDER_FACTS = Object.freeze({
  providerId: 'qwen3-tts',
  instanceId: 'instance-1',
  model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
  backend: 'custom-voice',
})
/* Rotation keeps each segment inside the unchanged store guarantees: the task catalog/owner allow
 * 32 entries, the artifact pack 32 entries and 4 MiB in total. These thresholds are not product
 * quotas; they only decide when the next segment starts. */
const SEGMENTS_DIR_NAME = 'segments'
const SEGMENT_ROTATE_ENTRIES = 24
const SEGMENT_ROTATE_AUDIO_BYTES = 3 * 1024 * 1024
const SEGMENT_NAME_PATTERN = /^\d{4}$/

function failure(code, detail = null) {
  return detail === null ? { ok: false, code } : { ok: false, code, detail }
}

/** The provider facts written into the task: an explicit runtime label or the documented example. */
function readProviderFacts(value) {
  const facts = value === undefined ? DEFAULT_PROVIDER_FACTS : value
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return null
  if (typeof facts.providerId !== 'string' || !PROVIDER_ID_PATTERN.test(facts.providerId)) return null
  if (typeof facts.instanceId !== 'string' || !PROVIDER_INSTANCE_PATTERN.test(facts.instanceId)) return null
  if (typeof facts.model !== 'string' || !PROVIDER_MODEL_PATTERN.test(facts.model)) return null
  if (typeof facts.backend !== 'string' || !PROVIDER_BACKEND_PATTERN.test(facts.backend)) return null
  return Object.freeze({
    providerId: facts.providerId,
    instanceId: facts.instanceId,
    model: facts.model,
    backend: facts.backend,
  })
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function randomSuffix() {
  return crypto.randomBytes(8).toString('hex')
}

/** The existing `segments/NNNN` directories of one storage root, in creation order. */
function segmentNames(root) {
  let items
  try {
    items = fs.readdirSync(path.join(root, SEGMENTS_DIR_NAME), { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  return items
    .filter((item) => item.isDirectory() && SEGMENT_NAME_PATTERN.test(item.name))
    .map((item) => item.name)
    .sort()
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
 * @param {{providerId:string,instanceId:string,model:string,backend:string}} [options.providerFacts]
 *   provider facts written into the task (defaults to the documented example)
 * @param {number} [options.textLimit] max text characters (default 200)
 * @param {number} [options.generationTimeoutMs] effective generation limit published to the client
 * @param {Function} [options.now] ISO clock
 * @returns {Promise<{ok:true,value:{catalog:Function,generate:Function,status:Function,results:Function,download:Function}}|{ok:false,code:string,detail?:string}>}
 */
export async function openPresetGenerationApp(options = {}) {
  const sandbox = options.sandbox
  const provider = options.provider
  const scopeId = options.scopeId
  const rightsProofRef = options.rightsProofRef
  const voices = options.voices
  const textLimit = Number.isInteger(options.textLimit) ? options.textLimit : DEFAULT_TEXT_LIMIT
  const generationTimeoutMs = Number.isInteger(options.generationTimeoutMs) ? options.generationTimeoutMs : null
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const providerFacts = readProviderFacts(options.providerFacts)
  if (!providerFacts) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'providerFacts')

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

  async function openSegment(segmentSandbox) {
    const catalog = await openFixtureTaskCatalog({ sandbox: segmentSandbox })
    if (!catalog.ok) return null
    const owner = await openFixtureTaskOwner({ sandbox: segmentSandbox })
    if (!owner.ok) return null
    const artifacts = await openFixtureArtifactLibrary({ sandbox: segmentSandbox })
    if (!artifacts.ok) return null
    async function authority({ scopeId: requestedScope, taskId }) {
      if (requestedScope !== scopeId) return { ok: false }
      const got = await catalog.value.get({ schemaVersion: 1, scopeId, taskId })
      if (!got.ok) return { ok: false }
      return { ok: true, birth: { identityHash: sha256(scopeId + '|' + taskId), state: got.value.task.state } }
    }
    const coordinator = createProviderGenerationCoordinator({
      sandbox: segmentSandbox,
      artifacts: artifacts.value,
      provider,
      authority,
      taskOwner: owner.value,
      now,
    })
    if (!coordinator.ok) return null
    return { catalog: catalog.value, owner: owner.value, artifacts: artifacts.value, coordinator, usage: { entries: 0, bytes: 0 } }
  }

  async function measure(segment) {
    const counted = await segment.catalog.count({ schemaVersion: 1, scopeId })
    if (!counted.ok) return null
    const listed = await segment.owner.listSaved({ schemaVersion: 1, scopeId })
    if (!listed.ok) return null
    let bytes = 0
    for (const item of listed.value.results) {
      const metadata = await segment.artifacts.get({
        schemaVersion: 1,
        scopeId,
        artifactRef: item.artifactRef,
        now: now(),
        rights: { state: 'GRANTED', proofRef: rightsProofRef },
      })
      if (!metadata.ok) return null
      if (metadata.value.outcome === 'FOUND') bytes += metadata.value.artifact.inspection.byteLength
    }
    return { entries: Math.max(counted.value.count, listed.value.entryCount), bytes }
  }

  const segments = []
  try {
    const base = await openSegment(sandbox)
    if (!base) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')
    segments.push(base)
    for (const name of segmentNames(sandbox.root)) {
      const segment = await openSegment(openConfigStorage({ root: path.join(sandbox.root, SEGMENTS_DIR_NAME, name) }))
      if (!segment) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')
      segments.push(segment)
    }
  } catch {
    return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')
  }
  let current = segments[segments.length - 1]
  const initialUsage = await measure(current)
  if (!initialUsage) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'sandbox')
  current.usage = initialUsage

  async function rotate() {
    const name = String(segments.length).padStart(4, '0')
    const segment = await openSegment(openConfigStorage({ root: path.join(sandbox.root, SEGMENTS_DIR_NAME, name) }))
    if (!segment) throw new Error('generation segment unavailable')
    segments.push(segment)
    current = segment
  }

  /* 157 v1.1: only the segment switch is serialized. Two requests accepted at the same moment run
   * their own provider request, so a second request gets no hidden queue time outside the client's
   * declared wait; a provider that cannot run two syntheses rejects the extra request honestly. */
  let segmentSwitch = Promise.resolve()
  function enqueueSegmentSwitch(task) {
    const next = segmentSwitch.then(task, task)
    segmentSwitch = next.then(() => undefined, () => undefined)
    return next
  }
  async function ensureCurrentSegment() {
    return enqueueSegmentSwitch(async () => {
      if (current.usage.entries < SEGMENT_ROTATE_ENTRIES && current.usage.bytes < SEGMENT_ROTATE_AUDIO_BYTES) {
        return current
      }
      await rotate()
      return current
    })
  }

  async function segmentForTask(taskId) {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const got = await segments[index].owner.get({ schemaVersion: 1, scopeId, taskId })
      if (got.ok) return { segment: segments[index] }
      const code = got.errors && got.errors[0] ? got.errors[0].code : ''
      if (code !== 'TASK_OWNER_NOT_FOUND') return { error: code || 'owner read rejected' }
    }
    return { segment: null }
  }

  function catalog() {
    return {
      ok: true,
      fixtureOnly: true,
      realReady: false,
      textLimit,
      generationTimeoutMs,
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

    let segment
    try {
      segment = await ensureCurrentSegment()
    } catch {
      return failure(PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED, 'capacity')
    }

    const reserved = await segment.catalog.reserve({
      schemaVersion: 1,
      scopeId,
      idempotencyKey: 'key:fixture-preset-' + randomSuffix(),
      draft: {
        schemaVersion: 2,
        feature: 'provider-generation',
        taskType: 'PROVIDER_TTS',
        provider: providerFacts,
        voice: { kind: 'PRESET', voiceId: voice.id },
        input: { kind: 'TEXT', text },
        deliveryRequested: false,
        rights: { state: 'CONFIRMED_FIXTURE' },
      },
      observedAt,
    })
    if (!reserved.ok) {
      return failure(PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED, reserved.code || 'task birth rejected')
    }
    segment.usage.entries += 1
    const taskId = reserved.value.task.taskId

    const prepared = await segment.coordinator.prepare({
      schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION,
      scopeId,
      taskId,
      requestKey: 'key:preset-run-' + randomSuffix(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
      provider: { ...providerFacts, voiceId: voice.id },
      request: { text, language, emotion: '', modality: 'preset' },
    })
    if (!prepared.ok) {
      return failure(prepared.code || PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED, prepared.detail || null)
    }
    const submitted = await segment.coordinator.submit({ claimId: prepared.claim.claimId })
    if (!submitted.ok) {
      return failure(
        submitted.code || PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED,
        (submitted.claim && submitted.claim.lastError) || null,
      )
    }
    const metadata = await segment.artifacts.get({
      schemaVersion: 1,
      scopeId,
      artifactRef: submitted.claim.artifact.artifactRef,
      now: now(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
    })
    if (!metadata.ok || !metadata.value.artifact) {
      return failure(PRESET_GENERATION_APP_ERRORS.GENERATION_REJECTED, 'artifact metadata')
    }
    segment.usage.bytes += submitted.claim.artifact.byteLength
    return {
      ok: true,
      taskId,
      state: 'SAVED',
      ownerState: 'SAVED',
      artifactRef: submitted.claim.artifact.artifactRef,
      sha256: submitted.claim.artifact.sha256,
      byteLength: submitted.claim.artifact.byteLength,
      durationMs: submitted.claim.artifact.durationMs,
      // 138: the saved record's truthful source is the stored Artifact's origin.
      origin: metadata.value.artifact.origin,
      // 139: the formal Provider task facts, consistent with the issued task record.
      provider: { providerId: providerFacts.providerId, model: providerFacts.model },
      voice: { kind: 'PRESET', voiceId: voice.id },
      input: { kind: 'TEXT' },
      language,
      fixtureOnly: true,
      realReady: false,
    }
  }

  async function status(taskId) {
    if (typeof taskId !== 'string' || !TASK_PATTERN.test(taskId)) {
      return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, 'taskId')
    }
    const found = await segmentForTask(taskId)
    if (found.error) return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, found.error)
    const segment = found.segment
    if (!segment) return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, 'not found')
    const got = await segment.owner.get({ schemaVersion: 1, scopeId, taskId })
    if (!got.ok) {
      return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, got.errors && got.errors[0] ? got.errors[0].code : 'not found')
    }
    const artifactStatus = await segment.owner.artifactStatus({
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
        provider: { providerId: got.value.task.provider.providerId, model: got.value.task.provider.model },
        voice: { kind: got.value.task.voice.kind, voiceId: got.value.task.voice.voiceId },
        input: { kind: got.value.task.input.kind },
        fixtureOnly: true,
        realReady: false,
      }
    }
    const read = await segment.artifacts.readBytes({
      schemaVersion: 1,
      scopeId,
      artifactRef: artifactStatus.value.artifactRef,
      now: now(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
    })
    const bytes = read.ok && read.value ? read.value.bytes : null
    const origin = read.ok && read.value && read.value.artifact ? read.value.artifact.origin : null
    return {
      ok: true,
      taskId,
      state: got.value.task.state,
      ownerState: got.value.ownerState,
      readable: true,
      artifactRef: artifactStatus.value.artifactRef,
      sha256: bytes ? sha256(bytes) : null,
      byteLength: bytes ? bytes.length : null,
      origin,
      provider: { providerId: got.value.task.provider.providerId, model: got.value.task.provider.model },
      voice: { kind: got.value.task.voice.kind, voiceId: got.value.task.voice.voiceId },
      input: { kind: got.value.task.input.kind },
      fixtureOnly: true,
      realReady: false,
    }
  }

  /**
   * 151/155: the saved generation results of this scope across every segment; read-only, oldest
   * segment first, and nothing is created, changed or deleted.
   */
  async function results() {
    const items = []
    for (const segment of segments) {
      const listed = await segment.owner.listSaved({ schemaVersion: 1, scopeId })
      if (!listed.ok) {
        return failure(
          PRESET_GENERATION_APP_ERRORS.RESULTS_REJECTED,
          listed.errors && listed.errors[0] ? listed.errors[0].code : 'list rejected',
        )
      }
      for (const entry of listed.value.results) {
        if (entry.feature !== AUDIO_TASK_FEATURES.PROVIDER_GENERATION) continue
        if (entry.taskType !== AUDIO_TASK_TYPES.PROVIDER_TTS) continue
        const metadata = await segment.artifacts.get({
          schemaVersion: 1,
          scopeId,
          artifactRef: entry.artifactRef,
          now: now(),
          rights: { state: 'GRANTED', proofRef: rightsProofRef },
        })
        if (!metadata.ok) {
          return failure(
            PRESET_GENERATION_APP_ERRORS.RESULTS_REJECTED,
            metadata.errors && metadata.errors[0] ? metadata.errors[0].code : 'artifact read rejected',
          )
        }
        const artifact = metadata.value.outcome === 'FOUND' ? metadata.value.artifact : null
        items.push({
          taskId: entry.taskId,
          state: entry.state,
          artifactRef: entry.artifactRef,
          readable: artifact !== null,
          sha256: artifact ? artifact.inspection.sha256 : null,
          byteLength: artifact ? artifact.inspection.byteLength : null,
          origin: artifact ? artifact.origin : null,
          createdAt: artifact ? artifact.createdAt : null,
        })
      }
    }
    return { ok: true, fixtureOnly: true, realReady: false, results: items }
  }

  /**
   * 150: read the already-saved bytes of one original task from whichever segment holds it. This only
   * reads the persisted artifact; it never creates a task, re-synthesises or mutates the result.
   */
  async function download(taskId) {
    if (typeof taskId !== 'string' || !TASK_PATTERN.test(taskId)) {
      return failure(PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED, 'taskId')
    }
    const found = await segmentForTask(taskId)
    if (found.error) return failure(PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED, found.error)
    const segment = found.segment
    if (!segment) return failure(PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED, 'not found')
    const got = await segment.owner.get({ schemaVersion: 1, scopeId, taskId })
    if (!got.ok) {
      return failure(PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED, got.errors && got.errors[0] ? got.errors[0].code : 'not found')
    }
    const artifactStatus = await segment.owner.artifactStatus({
      schemaVersion: 1,
      scopeId,
      taskId,
      now: now(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
    })
    if (!artifactStatus.ok) {
      return failure(
        PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED,
        artifactStatus.errors && artifactStatus.errors[0] ? artifactStatus.errors[0].code : 'artifact status rejected',
      )
    }
    if (artifactStatus.value.state !== 'READABLE') {
      return failure(PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED, 'not readable')
    }
    const read = await segment.artifacts.readBytes({
      schemaVersion: 1,
      scopeId,
      artifactRef: artifactStatus.value.artifactRef,
      now: now(),
      rights: { state: 'GRANTED', proofRef: rightsProofRef },
    })
    if (!read.ok || !read.value || !read.value.bytes) {
      return failure(PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED, 'read rejected')
    }
    const bytes = read.value.bytes
    return {
      ok: true,
      taskId,
      state: got.value.task.state,
      artifactRef: artifactStatus.value.artifactRef,
      origin: read.value.artifact ? read.value.artifact.origin : null,
      sha256: sha256(bytes),
      byteLength: bytes.length,
      fileName: 'whale-voice-' + taskId.slice('task:fixture-'.length) + '.wav',
      bytes,
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: PRESET_GENERATION_APP_SCHEMA_VERSION,
      catalog,
      generate,
      status,
      results,
      download,
    }),
  }
}
