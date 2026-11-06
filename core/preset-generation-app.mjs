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
 *
 * 178: `locateTask({scopeId, taskId})` is the trusted source locator the unified delivery owner uses
 * to re-read the original task/artifact from the segment that actually holds it. The delivery owner
 * keeps one store at its own sandbox; this entry never writes, delivers or opens a second queue.
 *
 * 179: `confirmDelivery({taskId, targetId})` / `deliveryStatus({taskId, targetId})` compose the
 * optional delivery wiring (trusted target directory + Fake backend) with the saved result and the
 * unified relay. The caller only names the original task and target: the artifact ref comes from this
 * entry's own status read and the rights proof from the assembly. Without that wiring both methods
 * answer DELIVERY_UNAVAILABLE and generation/save/download keep working. The status read-back is bound
 * to this entry's scope, so another scope's record is never returned (179 v1.1).
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
import { openUnifiedRelay, RELAY_ERRORS } from './audio/relay-core-offline.mjs'

export const PRESET_GENERATION_APP_SCHEMA_VERSION = 1

export const PRESET_GENERATION_APP_ERRORS = Object.freeze({
  INPUT_INVALID: 'PRESET_GENERATION_INPUT_INVALID',
  VOICE_REJECTED: 'PRESET_GENERATION_VOICE_REJECTED',
  TEXT_REJECTED: 'PRESET_GENERATION_TEXT_REJECTED',
  LANGUAGE_REJECTED: 'PRESET_GENERATION_LANGUAGE_REJECTED',
  GENERATION_REJECTED: 'PRESET_GENERATION_REJECTED',
  STATUS_REJECTED: 'PRESET_GENERATION_STATUS_REJECTED',
  RESULTS_REJECTED: 'PRESET_GENERATION_RESULTS_REJECTED',
  DOWNLOAD_REJECTED: 'PRESET_GENERATION_DOWNLOAD_REJECTED',
  DELIVERY_UNAVAILABLE: 'PRESET_GENERATION_DELIVERY_UNAVAILABLE',
  DELIVERY_REFUSED: 'PRESET_GENERATION_DELIVERY_REFUSED',
  DELIVERY_NOT_ACCEPTED: 'PRESET_GENERATION_DELIVERY_NOT_ACCEPTED',
  DELIVERY_NOT_FOUND: 'PRESET_GENERATION_DELIVERY_NOT_FOUND',
})

const SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const TASK_PATTERN = /^task:fixture-[0-9a-f]{32}$/
const PROOF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/
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
 * @param {{providerId:string,instanceId:string,model:string,backend:string}} options.providerFacts
 *   provider facts written into the task
 * @param {number} options.textLimit max text characters
 * @param {number} [options.generationTimeoutMs] effective generation limit published to the client
 * @param {Function} [options.now] ISO clock
 * @param {{backend:object, targets:Array<object>, maxDeliveries?:number, maxPermits?:number}} [options.delivery]
 *   optional unified-relay wiring; when present the entry also exposes `confirmDelivery`/
 *   `deliveryStatus` over the same sandbox, and when absent those methods answer
 *   `PRESET_GENERATION_DELIVERY_UNAVAILABLE` without affecting generation/save/download
 * @returns {Promise<{ok:true,value:{catalog:Function,generate:Function,status:Function,results:Function,download:Function,locateTask:Function,confirmDelivery:Function,deliveryStatus:Function}}|{ok:false,code:string,detail?:string}>}
 */
export async function openPresetGenerationApp(options = {}) {
  const sandbox = options.sandbox
  const provider = options.provider
  const scopeId = options.scopeId
  const rightsProofRef = options.rightsProofRef
  const voices = options.voices
  const textLimit = options.textLimit
  const generationTimeoutMs = Number.isInteger(options.generationTimeoutMs) ? options.generationTimeoutMs : null
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const providerFacts = options.providerFacts
  const delivery = options.delivery

  if (typeof scopeId !== 'string' || !SCOPE_PATTERN.test(scopeId)) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'scopeId')
  if (typeof rightsProofRef !== 'string' || !PROOF_PATTERN.test(rightsProofRef)) {
    return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'rightsProofRef')
  }
  if (!Array.isArray(voices) || voices.length === 0) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'voices')
  // 161/base-clone: a voice whose backend reports no language still refuses here; the adapter already
  // checked the other voice shapes, so only the empty list is kept.
  for (const voice of voices) {
    if (voice.languages.length === 0) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'voices')
  }

  async function openSegment(segmentSandbox) {
    const catalog = await openFixtureTaskCatalog({ sandbox: segmentSandbox })
    if (!catalog.ok) return { ok: false, detail: 'sandbox' }
    const owner = await openFixtureTaskOwner({ sandbox: segmentSandbox })
    if (!owner.ok) return { ok: false, detail: 'sandbox' }
    const artifacts = await openFixtureArtifactLibrary({ sandbox: segmentSandbox })
    if (!artifacts.ok) return { ok: false, detail: 'sandbox' }
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
    if (!coordinator.ok) return { ok: false, detail: 'sandbox' }
    // 165: a claim left active by an interrupted process is settled before this location is used.
    // 169: only a failed settlement write refuses the location. A ledger that cannot be read at all
    // keeps the location usable for the already-saved results; prepare() rejects a new generation on
    // the same ledger with its real reason instead of this location being reported as unwritable.
    const reconciled = coordinator.reconcile()
    if (!reconciled.ok && reconciled.detail === 'claim-write') return { ok: false, detail: 'claim-write' }
    return {
      ok: true,
      value: {
        sandbox: segmentSandbox,
        catalog: catalog.value, owner: owner.value, artifacts: artifacts.value, coordinator,
        usage: { entries: 0, bytes: 0 },
      },
    }
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
    return { entries: counted.value.count, bytes }
  }

  const segments = []
  try {
    const base = await openSegment(sandbox)
    if (!base.ok) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, base.detail)
    segments.push(base.value)
    for (const name of segmentNames(sandbox.root)) {
      const segment = await openSegment(openConfigStorage({ root: path.join(sandbox.root, SEGMENTS_DIR_NAME, name) }))
      if (!segment.ok) return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, segment.detail)
      segments.push(segment.value)
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
    if (!segment.ok) throw new Error('generation segment unavailable')
    segments.push(segment.value)
    current = segment.value
  }

  /* 157 v1.1: only the segment switch is serialized. Two requests accepted at the same moment run
   * their own provider request, so a second request gets no hidden queue time outside the client's
   * declared wait; a provider that cannot run two syntheses rejects the extra request honestly. */
  let segmentSwitch = Promise.resolve()
  function enqueueSegmentSwitch(task) {
    const next = segmentSwitch.then(task)
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
      if (got.ok) return { segment: segments[index], got }
      const code = got.errors[0].code
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
    // 161: a request that submits a language must get exactly that language or an honest rejection;
    // only a request that submits no language at all uses the voice's original default.
    const language = input.language === undefined ? voice.languages[0] : input.language
    if (!voice.languages.includes(language)) {
      return failure(PRESET_GENERATION_APP_ERRORS.LANGUAGE_REJECTED, 'language')
    }
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
    const { segment, got } = found
    if (!segment) return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, 'not found')
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
        artifactStatus.errors[0].code,
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
    // 159: the owner said READABLE, but only the actual byte read decides whether this query can
    // report the result. A successful outcome without bytes (NOT_FOUND / DELETED / EXPIRED) is the
    // same honest failure download() reports, never a readable result with empty artifact facts.
    if (!read.ok || !read.value.bytes) {
      return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, 'read rejected')
    }
    const bytes = read.value.bytes
    const origin = read.value.artifact.origin
    return {
      ok: true,
      taskId,
      state: got.value.task.state,
      ownerState: got.value.ownerState,
      readable: true,
      artifactRef: artifactStatus.value.artifactRef,
      sha256: sha256(bytes),
      byteLength: bytes.length,
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
   * segment first, and nothing is created, changed or deleted. 158: one segment's artifact pack is
   * read once for the whole list instead of once per listed result.
   */
  async function results() {
    const items = []
    for (const segment of segments) {
      const listed = await segment.owner.listSaved({ schemaVersion: 1, scopeId })
      if (!listed.ok) {
        return failure(
          PRESET_GENERATION_APP_ERRORS.RESULTS_REJECTED,
          listed.errors[0].code,
        )
      }
      const saved = listed.value.results.filter(
        (entry) =>
          entry.feature === AUDIO_TASK_FEATURES.PROVIDER_GENERATION && entry.taskType === AUDIO_TASK_TYPES.PROVIDER_TTS,
      )
      if (saved.length === 0) continue
      const metadata = await segment.artifacts.getMany({
        schemaVersion: 1,
        scopeId,
        artifactRefs: saved.map((entry) => entry.artifactRef),
        now: now(),
        rights: { state: 'GRANTED', proofRef: rightsProofRef },
      })
      if (!metadata.ok) {
        return failure(
          PRESET_GENERATION_APP_ERRORS.RESULTS_REJECTED,
          metadata.errors[0].code,
        )
      }
      const byRef = new Map(metadata.value.results.map((item) => [item.artifactRef, item]))
      for (const entry of saved) {
        const read = byRef.get(entry.artifactRef)
        const artifact = read.outcome === 'FOUND' ? read.artifact : null
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
    const { segment, got } = found
    if (!segment) return failure(PRESET_GENERATION_APP_ERRORS.DOWNLOAD_REJECTED, 'not found')
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
        artifactStatus.errors[0].code,
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

  /**
   * 179: the application entry for one saved result's independent confirmation and offline delivery.
   * Only the original taskId and an explicitly confirmed trusted target are caller inputs: the saved
   * artifact ref comes from this entry's own status read, the rights proof from the assembly, and the
   * trusted target directory/backend from the optional `delivery` wiring. Without that wiring both
   * methods answer DELIVERY_UNAVAILABLE and every generation/save/download capability stays usable.
   */
  let relayPromise = null
  function deliveryRelay() {
    if (!delivery) return Promise.resolve(null)
    if (!relayPromise) {
      relayPromise = openUnifiedRelay({
        sandbox,
        backend: delivery.backend,
        targets: delivery.targets,
        now,
        locateTask,
        maxDeliveries: delivery.maxDeliveries,
        maxPermits: delivery.maxPermits,
      })
    }
    return relayPromise
  }

  function refused(stage, cause, detail = null) {
    return {
      ok: false,
      code: PRESET_GENERATION_APP_ERRORS.DELIVERY_REFUSED,
      stage,
      cause: cause || null,
      detail,
    }
  }

  function deliveryView(record) {
    return {
      deliveryId: record.deliveryId,
      taskId: record.taskId,
      artifactRef: record.artifactRef,
      targetId: record.targetId,
      authority: record.authority,
      permitId: record.permitId || null,
      state: record.state,
      backendState: record.backendState || null,
      receiptId: record.receiptId || null,
      error: record.error || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      mockOnly: true,
      realOperationAllowed: false,
    }
  }

  async function deliveryRelayOrFailure() {
    const relay = await deliveryRelay()
    if (!relay) return { ok: false, code: PRESET_GENERATION_APP_ERRORS.DELIVERY_UNAVAILABLE, detail: 'delivery' }
    if (relay.ok !== true) return refused('open', relay.code, relay.detail)
    return { ok: true, relay }
  }

  /** Confirm one saved result for one trusted target and return that delivery's current state. */
  async function confirmDelivery(input = {}) {
    const taskId = input.taskId
    const targetId = input.targetId
    if (typeof taskId !== 'string' || !TASK_PATTERN.test(taskId)) {
      return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'taskId')
    }
    const wired = await deliveryRelayOrFailure()
    if (!wired.ok) return wired
    const saved = await status(taskId)
    if (!saved.ok) return failure(saved.code, saved.detail === undefined ? null : saved.detail)
    if (saved.readable !== true || typeof saved.artifactRef !== 'string') {
      return failure(PRESET_GENERATION_APP_ERRORS.STATUS_REJECTED, 'not readable')
    }
    const rights = { state: 'GRANTED', proofRef: rightsProofRef }
    const permit = await wired.relay.issueDeliveryPermit({
      permit: { schemaVersion: 1, scopeId, taskId, artifactRef: saved.artifactRef, targetId, rights },
    })
    if (!permit.ok) return refused('permit', permit.code, permit.detail)
    const ensured = await wired.relay.ensureDelivery({
      handoff: {
        schemaVersion: 1,
        scopeId,
        taskId,
        artifactRef: saved.artifactRef,
        targetId,
        requestKey: 'saved-delivery:' + taskId + ':' + targetId,
        rights,
        permitId: permit.permit.permitId,
      },
    })
    if (!ensured.ok) return refused('ensure', ensured.code, ensured.detail)
    const deliveryId = ensured.delivery.deliveryId
    const submitted = await wired.relay.submit(deliveryId)
    if (submitted.ok === true && submitted.delivery.state === 'ACCEPTED') {
      return { ok: true, outcome: 'ACCEPTED', delivery: deliveryView(submitted.delivery) }
    }
    let record = submitted.ok === true ? submitted.delivery : null
    if (!record) {
      const current = await wired.relay.status(deliveryId)
      if (current.ok === true) record = current.delivery
    }
    if (!record) return refused('submit', submitted.code, submitted.detail)
    return {
      ok: false,
      code: PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_ACCEPTED,
      state: record.state,
      cause: submitted.ok === true ? null : (submitted.code || null),
      delivery: deliveryView(record),
    }
  }

  /** Read back the persisted delivery of one original result/target relation, if it exists. */
  async function deliveryStatus(input = {}) {
    const taskId = input.taskId
    const targetId = input.targetId
    if (typeof taskId !== 'string' || !TASK_PATTERN.test(taskId)) {
      return failure(PRESET_GENERATION_APP_ERRORS.INPUT_INVALID, 'taskId')
    }
    const wired = await deliveryRelayOrFailure()
    if (!wired.ok) return wired
    // 179 v1.1: the lookup is bound to this entry's scope, so a record created by another scope can
    // never be returned (even when its taskId/targetId are known); the saved result's current
    // readability is not needed because the delivery record is the relay's own persisted fact.
    const found = await wired.relay.deliveryFor({ scopeId, taskId, targetId })
    if (found.ok !== true) {
      if (found.code === RELAY_ERRORS.NOT_FOUND) {
        return failure(PRESET_GENERATION_APP_ERRORS.DELIVERY_NOT_FOUND, 'delivery')
      }
      return refused('status', found.code, found.detail)
    }
    return { ok: true, state: found.delivery.state, delivery: deliveryView(found.delivery) }
  }

  /**
   * 178: trusted source locator for the unified delivery owner. It answers with the segment this
   * entry already owns that holds the original task, so the owner re-reads that task/artifact under
   * its real persisted relation; the caller of a delivery never names a storage path. A task from
   * another scope, an unknown task, or an unreadable segment answers not-found, which keeps the
   * delivery on its owner sandbox and fails that task honestly instead of switching segments.
   */
  async function locateTask(input = {}) {
    if (input.scopeId !== scopeId) return { ok: false }
    const taskId = input.taskId
    if (typeof taskId !== 'string' || !TASK_PATTERN.test(taskId)) return { ok: false }
    const found = await segmentForTask(taskId)
    if (found.error || !found.segment) return { ok: false }
    return { ok: true, value: { sandbox: found.segment.sandbox } }
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
      locateTask,
      confirmDelivery,
      deliveryStatus,
    }),
  }
}
