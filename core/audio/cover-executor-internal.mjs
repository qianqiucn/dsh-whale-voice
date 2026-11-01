/**
 * Cover executor — the offline single-claim chain over the approved contract.
 *
 * AS-BUILT: uses the Cover v3 store (contract §15.1) and the real Fixture artifact library for the
 * source bytes and the MASTER import. The legacy catalog/owner files and the frozen v1.6 save writer
 * are never rewritten; a fresh sandbox carries the v3 snapshot in the legacy filenames, a legacy
 * v1/v2 snapshot forces the dedicated v3 files. Cancellation follows §8.1/§15.2 with a 4,096-frame
 * synchronous fence, a 65,536-frame macrotask yield and separate request/ack/stop/release/cleanup
 * evidence. All synthetic media is produced by cover-stage-bytes; no real model, audio device,
 * network or WeChat path is involved.
 */
import crypto from 'node:crypto'

import { importInQueue, openFixtureArtifactLibrary } from './artifact-library.mjs'
import {
  enqueueArtifact,
  getArtifactState,
  isArtifactLocked,
  lockArtifact,
  readStoredForSave,
} from './fixture-artifact-store-internal.mjs'
import { identityHashOf } from './fixture-task-store-internal.mjs'
import {
  buildIntent,
  canonicalIntent,
  intentHashOf,
  normalizeIntentDraft,
  sourceEntryIdentityHash,
} from './cover-intent-internal.mjs'
import {
  buildCoverMasterRecord,
  buildCoverStageRecord,
  convertVocalCooperative,
  mixStemsCooperative,
  prepareCoverSource,
  separateTwoStemCooperative,
  validateCoverGraphShape,
} from './cover-stage-bytes-internal.mjs'
import { computeCoverReadiness } from './cover-readiness-internal.mjs'
import { verifyCoverDependencies } from './cover-dependencies-internal.mjs'
import { acquireCoverLease, releaseCoverLease } from './cover-lease-internal.mjs'
import {
  COVER_CATALOG_FILE,
  COVER_OWNER_FILE,
  CoverStoreFailure,
  emptyCoverCatalog,
  emptyCoverOwner,
  enqueueCover,
  getCoverState,
  isCoverStoreLocked,
  readCoverCatalog,
  readCoverOwner,
  resolveCoverFile,
  validateCoverLineage,
  writeCoverSnapshot,
} from './cover-store-internal.mjs'

export const COVER_EXECUTION_VERSION = 1
export const COVER_ATTEMPT_SEQ = 1

export const COVER_EXECUTION_CODES = Object.freeze({
  INPUT_INVALID: 'TASK_OWNER_COVER_INPUT_INVALID',
  BIRTH_REQUIRED: 'TASK_OWNER_COVER_BIRTH_REQUIRED',
  INTENT_MISMATCH: 'TASK_OWNER_COVER_INTENT_MISMATCH',
  RIGHTS_REJECTED: 'TASK_OWNER_COVER_RIGHTS_REJECTED',
  EXPIRED: 'TASK_OWNER_COVER_EXPIRED',
  SOURCE_CHANGED: 'TASK_OWNER_COVER_SOURCE_CHANGED',
  SOURCE_UNAVAILABLE: 'TASK_OWNER_COVER_SOURCE_UNAVAILABLE',
  RESOURCE_LIMIT: 'TASK_OWNER_COVER_RESOURCE_LIMIT',
  STAGE_REJECTED: 'TASK_OWNER_COVER_STAGE_REJECTED',
  DEPENDENCY_FAILURE: 'TASK_OWNER_COVER_DEPENDENCY_FAILURE',
  CANCEL_TOO_LATE: 'TASK_OWNER_COVER_CANCEL_TOO_LATE',
  EXECUTION_UNKNOWN: 'TASK_OWNER_COVER_EXECUTION_UNKNOWN',
  SAVE_REJECTED: 'TASK_OWNER_COVER_SAVE_REJECTED',
  SAVE_UNKNOWN: 'TASK_OWNER_COVER_SAVE_UNKNOWN',
  NOT_FOUND: 'TASK_OWNER_COVER_NOT_FOUND',
  STORE_INVALID: 'TASK_OWNER_COVER_STORE_INVALID',
  STORE_CHANGED: 'TASK_OWNER_COVER_STORE_CHANGED',
  INTERNAL_FAILURE: 'TASK_OWNER_COVER_INTERNAL_FAILURE',
  UNKNOWN: 'TASK_OWNER_COVER_UNKNOWN',
})

const REASONS = Object.freeze({
  INPUT_INVALID: 'invalid cover input',
  BIRTH_REQUIRED: 'cover birth required',
  INTENT_MISMATCH: 'cover intent mismatch',
  RIGHTS_REJECTED: 'cover rights rejected',
  EXPIRED: 'cover request expired',
  SOURCE_CHANGED: 'cover source changed',
  SOURCE_UNAVAILABLE: 'cover source unavailable',
  RESOURCE_LIMIT: 'cover resource limit exceeded',
  STAGE_REJECTED: 'cover stage rejected',
  DEPENDENCY_FAILURE: 'cover dependency failure',
  CANCEL_TOO_LATE: 'cover cancel too late',
  EXECUTION_UNKNOWN: 'cover execution unknown',
  SAVE_REJECTED: 'cover save rejected',
  SAVE_UNKNOWN: 'cover save unknown',
  NOT_FOUND: 'cover task not found',
  STORE_INVALID: 'cover store invalid',
  STORE_CHANGED: 'cover store changed',
  INTERNAL_FAILURE: 'cover internal failure',
  UNKNOWN: 'cover unknown',
})

const MESSAGES = Object.freeze({
  CREATED: '演示翻唱已创建并绑定意图；尚未执行。',
  EXISTING: '该演示翻唱请求已存在，未重复执行。',
  SAVED: '演示翻唱已保存到本地演示资产库；这不是真实生成，也没有发送到微信。',
  CANCELLED: '演示翻唱已取消；未保存成品。',
  FAILED: '演示翻唱执行失败。',
  UNKNOWN: '演示翻唱处于不确定状态；未自动重跑。',
  ACCEPTED: '已收到演示取消请求；尚未确认阶段停止。',
  TOO_LATE: '保存已提交，不能再取消。',
})

function failure(key, path) {
  return Object.freeze({
    ok: false,
    errors: Object.freeze([Object.freeze({ code: COVER_EXECUTION_CODES[key], path: path || '$', reason: REASONS[key] })]),
  })
}

function success(value) {
  return Object.freeze({ ok: true, value })
}

function mapStoreError(error) {
  if (!(error instanceof CoverStoreFailure)) return null
  if (error.key === 'COVER_STORE_CHANGED') return failure('STORE_CHANGED')
  if (error.key === 'COVER_STORE_INVALID') return failure('STORE_INVALID')
  if (error.key === 'COVER_WRITE_REJECTED') return failure('SAVE_REJECTED')
  if (error.key === 'COVER_WRITE_UNKNOWN') return failure('SAVE_UNKNOWN')
  if (error.key === 'COVER_STORE_RESOURCE_LIMIT') return failure('RESOURCE_LIMIT')
  if (error.key === 'COVER_STORE_UNKNOWN') return failure('UNKNOWN')
  return failure('INTERNAL_FAILURE')
}

function canonicalIso(value) {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  if (new Date(ms).toISOString() !== value) return null
  return value
}

function findCatalogEntry(snapshot, scopeId, taskId, idempotencyKey) {
  if (!snapshot) return null
  return (
    snapshot.entries.find(
      (entry) =>
        entry.scopeId === scopeId &&
        (taskId === null || taskId === undefined || entry.record.taskId === taskId) &&
        (idempotencyKey === null || idempotencyKey === undefined || entry.idempotencyKey === idempotencyKey),
    ) || null
  )
}

function buildRecord({ taskId, draft, observedAt }) {
  return {
    schemaVersion: 1,
    taskId,
    feature: 'singing',
    taskType: 'SVC',
    source: { kind: 'AUDIO_REF', ref: draft.sourceRef },
    voiceProfileId: draft.voiceProfileId,
    deliveryRequested: false,
    rights: { state: 'CONFIRMED_FIXTURE' },
    state: 'CREATED',
    outputArtifactRef: null,
    cancel: { requested: false, confirmed: false },
    delivery: { state: 'NOT_REQUESTED', deliveryId: null },
    lastError: null,
    observedAt,
    mockOnly: true,
    realOperationAllowed: false,
  }
}

function makeAttempt(requestKey, now, lease) {
  return {
    attemptId: 'cover-attempt:' + crypto.randomBytes(16).toString('hex'),
    attemptSeq: COVER_ATTEMPT_SEQ,
    requestKey,
    startedAt: now,
    finishedAt: null,
    status: 'RUNNING',
    error: null,
    lease: {
      leaseId: lease.leaseId,
      kind: 'LOGICAL_FIXTURE',
      gpu: lease.gpu,
      acquiredAt: lease.acquiredAt,
      releasedAt: null,
    },
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function fenceOf(state, taskId) {
  if (!state.fences) state.fences = new Map()
  return state.fences.get(taskId) || null
}

function setFence(state, taskId, at) {
  if (!state.fences) state.fences = new Map()
  state.fences.set(taskId, at)
}

function clearFence(state, taskId) {
  if (!state.fences) return
  state.fences.delete(taskId)
}

async function yieldMacrotask() {
  await new Promise((resolve) => setImmediate(resolve))
}

function readSourceFacts({ library, state, sandbox, scopeId, artifactRef, proofRef, now }) {
  const stored = readStoredForSave(getArtifactState(sandbox), { scopeId, artifactRef, now })
  if (!stored || stored.ok !== true) return { ok: false, key: 'SOURCE_UNAVAILABLE' }
  if (stored.value.state !== 'STORED') return { ok: false, key: 'SOURCE_UNAVAILABLE' }
  return library.readBytes({ schemaVersion: 1, scopeId, artifactRef, now, rights: { state: 'GRANTED', proofRef } }).then((read) => {
    if (!read || read.ok !== true) return { ok: false, key: 'SOURCE_UNAVAILABLE' }
    if (read.value.outcome !== 'FOUND') return { ok: false, key: 'SOURCE_UNAVAILABLE' }
    const proof = stored.value.artifact
    const metadata = read.value.artifact
    if (!metadata || metadata.artifactRef !== artifactRef || metadata.scopeId !== scopeId) {
      return { ok: false, key: 'SOURCE_CHANGED' }
    }
    const inspection = metadata.inspection || {}
    if (inspection.sha256 !== proof.byteSha256 || inspection.byteLength !== proof.byteLength) {
      return { ok: false, key: 'SOURCE_CHANGED' }
    }
    return {
      ok: true,
      bytes: Buffer.from(read.value.bytes),
      proof,
      metadata,
      facts: {
        artifactRef,
        scopeId,
        requestKey: proof.requestKey,
        origin: metadata.origin,
        createdAt: metadata.createdAt,
        byteSha256: proof.byteSha256,
        byteLength: proof.byteLength,
      },
    }
  })
}

function compactOf(stage) {
  if (!stage) return null
  return {
    role: stage.role,
    producedByStage: stage.role === 'VOCAL' || stage.role === 'INSTRUMENTAL' ? 'SEPARATING' : 'CONVERTING',
    sequence: stage.role === 'CONVERTED_VOCAL' ? 2 : 1,
    byteSha256: stage.byteSha256,
    byteLength: stage.byteLength,
    parentLinks: clone(stage.parentLinks),
    availability: 'CLEANED',
  }
}

function fullManifest(stage, { intentHash, attemptId, rootSourceIdentityHash, truthLevel, producedByStage, sequence, parentLinks, availability }) {
  const inspection = stage.inspection || null
  return {
    manifestVersion: 1,
    taskId: null,
    scopeId: null,
    intentHash,
    attemptId,
    role: stage.role,
    producedByStage,
    sequence,
    parentLinks,
    rootSourceIdentityHash,
    rootSourceSha256: null,
    byteLength: stage.byteLength,
    byteSha256: stage.byteSha256,
    inspection,
    mediaProfile: null,
    rights: null,
    expiresAt: null,
    modelRevision: null,
    profileRevision: null,
    backendRevision: null,
    origin: 'SYNTHETIC_FIXTURE',
    truthLevel,
    availability,
    verification: null,
  }
}

/**
 * Rebuild the 7-key attachment from the persisted 14-key owner entry and verify every lineage link.
 * The owner v3 entry shape has no attachment key, so the attachment is a derived proof: it is only
 * accepted when it matches the Intent, attempt, manifest stages and MASTER receipt exactly.
 */
function attachmentFromEntry(entry) {
  if (!validateCoverLineage(entry)) return null
  const manifest = entry.manifest
  const receiptCheckpoint = (entry.checkpoints || []).find((checkpoint) => checkpoint.index === 4 && checkpoint.importReceipt)
  if (!receiptCheckpoint) return null
  const proof = receiptCheckpoint.importReceipt
  const instrumentalSha = manifest.instrumental ? manifest.instrumental.byteSha256 : null
  return {
    attachmentVersion: 1,
    intentHash: entry.intentHash,
    attemptId: entry.attempt.attemptId,
    sourceEntryIdentityHash: entry.intent.sourceEntryIdentityHash,
    lineage: {
      sourceSha256: manifest.source.byteSha256,
      vocalInputSha256: manifest.vocal ? manifest.vocal.byteSha256 : manifest.source.byteSha256,
      instrumentalSha256: instrumentalSha,
      convertedSha256: manifest.converted.byteSha256,
    },
    masterSha256: proof.byteSha256,
    verification: {
      validationState: manifest.master.inspection.validationState,
      peak: manifest.master.inspection.peak,
      fullScaleSampleCount: manifest.master.inspection.fullScaleSampleCount,
      durationMs: manifest.master.inspection.durationMs,
    },
  }
}

/**
 * Shared FINAL transaction used by execute and resume. The caller holds the Artifact queue and has
 * already persisted checkpoint[4] with the receipt. This function performs the fresh JOINT proof,
 * the FINAL SAVED write and the post-commit owner+artifact confirmation.
 */
async function finalizeCoverSaved(state, artifactState, { scopeId, taskId, attemptId, requestNow }) {
  let owner
  try {
    owner = readCoverOwner(state)
  } catch {
    return { kind: 'EXECUTION_UNKNOWN' }
  }
  const claimed = findOwnerEntry(owner.snapshot, scopeId, taskId)
  if (!claimed || claimed.kind !== 'COVER' || claimed.phase !== 'CLAIMED' || claimed.attempt.attemptId !== attemptId) {
    return { kind: 'EXECUTION_UNKNOWN' }
  }
  const receiptCheckpoint = (claimed.checkpoints || []).find((checkpoint) => checkpoint.index === 4 && checkpoint.importReceipt)
  if (!receiptCheckpoint) return { kind: 'EXECUTION_UNKNOWN' }
  const receipt = receiptCheckpoint.importReceipt
  const expectedImportKey = 'import:cover-master:' + attemptId.slice(-16)
  if (receipt.requestKey !== expectedImportKey || receipt.expiresAt !== claimed.intent.rightsExpiresAt) {
    return { kind: 'EXECUTION_UNKNOWN' }
  }
  const attachment = attachmentFromEntry(claimed)
  if (!attachment || attachment.masterSha256 !== receipt.byteSha256) return { kind: 'EXECUTION_UNKNOWN' }
  let fresh
  try {
    fresh = readStoredForSave(artifactState, { scopeId, artifactRef: receipt.artifactRef, now: requestNow })
  } catch {
    return { kind: 'EXECUTION_UNKNOWN' }
  }
  if (!fresh || fresh.ok !== true || fresh.value.state !== 'STORED') return { kind: 'ARTIFACT_MISSING' }
  const proof = fresh.value.artifact
  if (proof.requestKey !== expectedImportKey || proof.expiresAt !== receipt.expiresAt) return { kind: 'ARTIFACT_CHANGED' }
  if (proof.byteSha256 !== receipt.byteSha256 || proof.byteLength !== receipt.byteLength) return { kind: 'ARTIFACT_CHANGED' }
  if (!proof.inspection || proof.inspection.sha256 !== receipt.byteSha256 || proof.inspection.byteLength !== receipt.byteLength) {
    return { kind: 'ARTIFACT_CHANGED' }
  }
  if (!proof.rights || proof.rights.state !== 'GRANTED' || proof.rights.proofRef !== claimed.intent.rightsProofRef) {
    return { kind: 'ARTIFACT_RIGHTS' }
  }
  if (Date.parse(proof.expiresAt) <= Date.parse(requestNow)) return { kind: 'ARTIFACT_EXPIRED' }

  const finishedAt = new Date().toISOString()
  const next = clone(claimed)
  next.phase = 'FINAL'
  next.completion = { kind: 'SAVED', reason: null }
  next.record.state = 'SAVED'
  next.record.outputArtifactRef = receipt.artifactRef
  next.record.observedAt = requestNow
  next.attempt.status = 'SAVED'
  next.attempt.finishedAt = finishedAt
  if (next.attempt.lease) next.attempt.lease.releasedAt = finishedAt
  next.manifest.verification = { state: 'PASSED', inspectedAt: requestNow, inspector: 'FIXTURE_WAV_CHECKED', masterSha256: receipt.byteSha256 }
  if (!next.checkpoints.some((checkpoint) => checkpoint.index === 5)) {
    next.checkpoints.push({
      index: 5,
      stage: 'VERIFIED',
      at: requestNow,
      status: 'DONE',
      tempSummary: { role: 'MASTER', byteSha256: receipt.byteSha256, byteLength: receipt.byteLength },
      importReceipt: null,
    })
  }
  try {
    writeOwner(state, owner, next, 'increment')
  } catch (error) {
    return { kind: 'FINAL_FAILED', mapped: mapStoreError(error) }
  }

  let confirmedOwner
  try {
    confirmedOwner = readCoverOwner(state)
  } catch {
    lockCoverStore(state)
    lockArtifact(artifactState)
    return { kind: 'SAVE_UNKNOWN' }
  }
  const finalEntry = findOwnerEntry(confirmedOwner.snapshot, scopeId, taskId)
  if (!finalEntry || finalEntry.phase !== 'FINAL' || !finalEntry.completion || finalEntry.completion.kind !== 'SAVED') {
    lockCoverStore(state)
    lockArtifact(artifactState)
    return { kind: 'SAVE_UNKNOWN' }
  }
  let confirmedArtifact
  try {
    confirmedArtifact = readStoredForSave(artifactState, { scopeId, artifactRef: receipt.artifactRef, now: requestNow })
  } catch {
    lockArtifact(artifactState)
    return { kind: 'SAVE_UNKNOWN' }
  }
  if (!confirmedArtifact || confirmedArtifact.ok !== true || confirmedArtifact.value.state !== 'STORED') {
    lockArtifact(artifactState)
    return { kind: 'SAVE_UNKNOWN' }
  }
  return {
    kind: 'SAVED',
    entry: finalEntry,
    master: {
      artifactRef: receipt.artifactRef,
      byteLength: proof.byteLength,
      sha256: proof.byteSha256,
      expiresAt: proof.expiresAt,
    },
  }
}

function resultForSaved(entry, master) {
  return success({
    schemaVersion: 1,
    outcome: 'SAVED',
    attemptId: entry.attempt.attemptId,
    statusState: 'SAVED',
    messageZh: MESSAGES.SAVED,
    value: {
      taskId: entry.taskId,
      scopeId: entry.scopeId,
      intentHash: entry.intentHash,
      attemptId: entry.attempt.attemptId,
      master: { artifactRef: master.artifactRef, byteLength: master.byteLength, sha256: master.sha256, expiresAt: master.expiresAt },
      inspection: entry.manifest.master.inspection,
      messageZh: MESSAGES.SAVED,
      mockOnly: true,
    },
  })
}

function writeOwner(state, owner, entry, mode) {
  const snapshot = owner.snapshot || emptyCoverOwner()
  const next = clone(snapshot)
  const index = next.entries.findIndex((item) => item.scopeId === entry.scopeId && item.taskId === entry.taskId)
  if (index >= 0) next.entries[index] = clone(entry)
  else next.entries.push(clone(entry))
  next.revision = mode === 'same' ? snapshot.revision : snapshot.revision + 1
  return writeCoverSnapshot(state, resolveCoverFile(state, 'owner'), next, { baseDigest: owner.digest, mode })
}

function buildStatus(entry) {
  if (!entry) {
    return {
      schemaVersion: 1,
      state: 'NO_ATTEMPT',
      phase: null,
      attemptId: null,
      attemptSeq: 0,
      intentHash: null,
      stages: [],
      cancel: { requested: false, requestedAt: null, acknowledgedAt: null, confirmedAt: null, reason: null },
      lease: null,
      tempArtifacts: [],
      master: null,
      lastError: null,
      messageZh: '该演示任务尚未开始翻唱。',
      createdAt: null,
      updatedAt: null,
    }
  }
  const record = entry.record
  const attempt = entry.attempt
  const master = entry.manifest && entry.manifest.master ? entry.manifest.master : null
  const receipt = Array.isArray(entry.checkpoints)
    ? entry.checkpoints.find((checkpoint) => checkpoint.index === 4 && checkpoint.importReceipt)
    : null
  const state =
    entry.phase === 'FINAL'
      ? entry.completion && entry.completion.kind === 'SAVED'
        ? 'SAVED'
        : entry.completion && entry.completion.kind === 'CANCELLED'
          ? 'CANCELLED'
          : entry.completion && entry.completion.kind === 'FAILED'
            ? 'FAILED'
            : 'UNKNOWN'
      : attempt && attempt.status === 'RUNNING'
        ? 'CLAIMED'
        : 'UNKNOWN'
  const stages = []
  const checkpointStages = new Set((entry.checkpoints || []).map((checkpoint) => checkpoint.stage))
  if (entry.intent.recipe.sourceLayout === 'MIXED') {
    stages.push({ stage: 'SEPARATING', status: checkpointStages.has('SEPARATED') ? 'DONE' : 'PENDING' })
  }
  stages.push({ stage: 'CONVERTING', status: checkpointStages.has('CONVERTED') ? 'DONE' : 'PENDING' })
  stages.push({ stage: 'MIXING', status: checkpointStages.has('MIXED') ? 'DONE' : 'PENDING' })
  stages.push({ stage: 'VERIFYING', status: checkpointStages.has('VERIFIED') ? 'DONE' : 'PENDING' })
  const tempArtifacts = []
  for (const checkpoint of entry.checkpoints || []) {
    if (checkpoint.tempSummary) {
      tempArtifacts.push({
        role: checkpoint.tempSummary.role,
        byteLength: checkpoint.tempSummary.byteLength,
        sha256: checkpoint.tempSummary.byteSha256,
        availability: checkpoint.stage === 'MASTER_IMPORTED' ? 'STORED' : 'CLEANED',
      })
    }
  }
  return {
    schemaVersion: 1,
    state,
    phase: entry.phase,
    attemptId: attempt ? attempt.attemptId : null,
    attemptSeq: attempt ? attempt.attemptSeq : 0,
    intentHash: entry.intentHash,
    stages,
    cancel: entry.cancel,
    lease: attempt ? attempt.lease : null,
    tempArtifacts,
    master: receipt
      ? {
          artifactRef: receipt.importReceipt.artifactRef,
          byteLength: receipt.importReceipt.byteLength,
          sha256: receipt.importReceipt.byteSha256,
          expiresAt: receipt.importReceipt.expiresAt,
        }
      : null,
    lastError: attempt ? attempt.error : null,
    messageZh: state === 'SAVED' ? '演示翻唱已保存。' : state === 'CLAIMED' ? '演示翻唱执行中。' : '演示翻唱当前可读取。',
    createdAt: attempt ? attempt.startedAt : null,
    updatedAt: attempt ? attempt.finishedAt || attempt.startedAt : null,
  }
}

/* ------------------------------------------------ birth ------------------------------------- */

export async function createCoverTask({ sandbox, scopeId, idempotencyKey, intentDraft, observedAt }) {
  if (!sandbox || typeof scopeId !== 'string' || typeof idempotencyKey !== 'string') return failure('INPUT_INVALID')
  const now = canonicalIso(observedAt)
  if (now === null) return failure('INPUT_INVALID', 'observedAt')
  const normalized = normalizeIntentDraft(intentDraft)
  if (!normalized.ok) return failure('INPUT_INVALID', normalized.errors[0] ? normalized.errors[0].path : '$')
  const draft = normalized.value
  if (draft.scopeId !== scopeId) return failure('INPUT_INVALID', 'scopeId')

  let library
  try {
    library = await openFixtureArtifactLibrary({ sandbox })
  } catch {
    return failure('DEPENDENCY_FAILURE')
  }
  if (!library || library.ok !== true) return failure('DEPENDENCY_FAILURE')
  const source = await readSourceFacts({
    library: library.value,
    state: getCoverState(sandbox),
    sandbox,
    scopeId,
    artifactRef: draft.sourceRef,
    proofRef: draft.rightsProofRef,
    now,
  })
  if (!source || source.ok !== true) return failure(source && source.key === 'SOURCE_CHANGED' ? 'SOURCE_CHANGED' : 'SOURCE_UNAVAILABLE', 'sourceInput')
  if (Date.parse(source.metadata.expiresAt) <= Date.parse(now)) return failure('EXPIRED', 'rightsExpiresAt')
  if (source.metadata.rights.state !== 'GRANTED' || source.metadata.rights.proofRef !== draft.rightsProofRef) {
    return failure('RIGHTS_REJECTED', 'rights')
  }
  if (source.metadata.expiresAt !== draft.rightsExpiresAt) return failure('RIGHTS_REJECTED', 'rightsExpiresAt')

  const state = getCoverState(sandbox)
  return enqueueCover(state, async () => {
    if (isCoverStoreLocked(state)) return failure('UNKNOWN')
    const catalog = readCoverCatalog(state)
    const existing = findCatalogEntry(catalog.snapshot, scopeId, null, idempotencyKey)
    if (existing) {
      if (existing.kind !== 'COVER') return failure('INTENT_MISMATCH', 'idempotencyKey')
      const rebuilt = buildIntent({
        draft,
        sourceFacts: source.facts,
        taskId: existing.record.taskId,
        birthIdentityHash: existing.identityHash,
        birthObservedAt: existing.record.observedAt,
      })
      if (intentHashOf(rebuilt) !== existing.intentHash) return failure('INTENT_MISMATCH', 'idempotencyKey')
      return success({
        schemaVersion: 1,
        outcome: 'EXISTING',
        taskId: existing.record.taskId,
        scopeId,
        idempotencyKey,
        intentHash: existing.intentHash,
        intent: existing.intent,
        record: existing.record,
        messageZh: MESSAGES.EXISTING,
      })
    }
    const taskId = 'task:fixture-' + crypto.randomBytes(16).toString('hex')
    const record = buildRecord({ taskId, draft, observedAt: now })
    const birthIdentityHash = identityHashOf(record)
    const intent = buildIntent({
      draft,
      sourceFacts: source.facts,
      taskId,
      birthIdentityHash,
      birthObservedAt: now,
    })
    const intentHash = intentHashOf(intent)
    const entry = {
      entryVersion: 1,
      kind: 'COVER',
      scopeId,
      idempotencyKey,
      identityHash: birthIdentityHash,
      intentHash,
      intent,
      record,
      createdAt: now,
    }
    try {
      const snapshot = catalog.snapshot || emptyCoverCatalog()
      const next = clone(snapshot)
      next.entries.push(entry)
      next.revision = snapshot.revision + 1
      writeCoverSnapshot(state, resolveCoverFile(state, 'catalog'), next, { baseDigest: catalog.digest, mode: 'increment' })
    } catch (error) {
      const mapped = mapStoreError(error)
      if (mapped) return mapped
      return failure('INTERNAL_FAILURE')
    }
    return success({
      schemaVersion: 1,
      outcome: 'CREATED',
      taskId,
      scopeId,
      idempotencyKey,
      intentHash,
      intent,
      record,
      messageZh: MESSAGES.CREATED,
    })
  })
}

/* ----------------------------------------------- execute ------------------------------------ */

function sameIntent(entry, request) {
  const canonical = canonicalIntent(request.intent)
  return intentHashOf(JSON.parse(canonical)) === entry.intentHash
}

function resultForExisting(existing) {
  const attemptId = existing.attempt && existing.attempt.attemptId ? existing.attempt.attemptId : null
  if (existing.phase !== 'FINAL') {
    return success({ schemaVersion: 1, outcome: 'EXISTING', attemptId, statusState: 'CLAIMED', messageZh: MESSAGES.EXISTING, value: null })
  }
  const kind = existing.completion ? existing.completion.kind : 'UNKNOWN'
  if (kind === 'SAVED') {
    return success({ schemaVersion: 1, outcome: 'EXISTING', attemptId, statusState: 'SAVED', messageZh: MESSAGES.EXISTING, value: null })
  }
  if (kind === 'CANCELLED') {
    return success({ schemaVersion: 1, outcome: 'CANCELLED', attemptId, statusState: 'CANCELLED', messageZh: MESSAGES.CANCELLED, value: null })
  }
  if (kind === 'FAILED') {
    return success({ schemaVersion: 1, outcome: 'FAILED', attemptId, statusState: 'FAILED', messageZh: MESSAGES.FAILED, value: null })
  }
  return success({ schemaVersion: 1, outcome: 'UNKNOWN', attemptId, statusState: 'UNKNOWN', messageZh: MESSAGES.UNKNOWN, value: null })
}

function findOwnerEntry(snapshot, scopeId, taskId) {
  if (!snapshot) return null
  return snapshot.entries.find((entry) => entry.scopeId === scopeId && entry.taskId === taskId) || null
}

export async function executeCover({ sandbox, scopeId, taskId, requestKey, now, expiresAt, rights, intent, dependencies, compute = 'LOCAL_GPU' }) {
  if (!sandbox || typeof scopeId !== 'string' || typeof taskId !== 'string' || typeof requestKey !== 'string') {
    return failure('INPUT_INVALID')
  }
  if (compute !== 'LOCAL_GPU' && compute !== 'CPU_CLOUD') return failure('INPUT_INVALID', 'compute')
  const requestNow = canonicalIso(now)
  if (requestNow === null) return failure('INPUT_INVALID', 'now')
  if (!intent || typeof intent !== 'object') return failure('INPUT_INVALID', 'intent')
  if (intent.taskId !== taskId || intent.scopeId !== scopeId) return failure('INTENT_MISMATCH', 'intent')
  if (Date.parse(intent.rightsExpiresAt) <= Date.parse(requestNow)) return failure('EXPIRED', 'expiresAt')
  if (!rights || rights.state !== 'GRANTED' || rights.proofRef !== intent.rightsProofRef) {
    return failure('RIGHTS_REJECTED', 'rights')
  }
  if (!dependencies || typeof dependencies !== 'object') return failure('DEPENDENCY_FAILURE', 'dependencies')
  const verifiedDependencies = verifyCoverDependencies({ intent, dependencies, now: requestNow })
  if (!verifiedDependencies.ok) return failure('DEPENDENCY_FAILURE', verifiedDependencies.errors[0].path)
  const state = getCoverState(sandbox)
  if (isCoverStoreLocked(state)) return failure('UNKNOWN')

  let catalog
  let owner
  try {
    catalog = readCoverCatalog(state)
    owner = readCoverOwner(state)
  } catch (error) {
    const mapped = mapStoreError(error)
    return mapped || failure('INTERNAL_FAILURE')
  }
  const birth = findCatalogEntry(catalog.snapshot, scopeId, taskId, null)
  if (!birth) return failure('BIRTH_REQUIRED')
  if (!sameIntent(birth, { intent })) return failure('INTENT_MISMATCH', 'intent')
  const existing = findOwnerEntry(owner.snapshot, scopeId, taskId)
  if (existing) return resultForExisting(existing)

  let library
  try {
    library = await openFixtureArtifactLibrary({ sandbox })
  } catch {
    return failure('DEPENDENCY_FAILURE')
  }
  if (!library || library.ok !== true) return failure('DEPENDENCY_FAILURE')

  return enqueueCover(state, async () => {
    if (isCoverStoreLocked(state)) return failure('UNKNOWN')
    let catalogNow
    let ownerNow
    try {
      catalogNow = readCoverCatalog(state)
      ownerNow = readCoverOwner(state)
    } catch (error) {
      const mapped = mapStoreError(error)
      return mapped || failure('INTERNAL_FAILURE')
    }
    const birthNow = findCatalogEntry(catalogNow.snapshot, scopeId, taskId, null)
    if (!birthNow) return failure('BIRTH_REQUIRED')
    if (!sameIntent(birthNow, { intent })) return failure('INTENT_MISMATCH', 'intent')
    // The outer read is only a fast path; the queue is the single writer, so the authoritative
    // single-claim check must repeat here after the previous holder released the tail.
    const existingNow = findOwnerEntry(ownerNow.snapshot, scopeId, taskId)
    if (existingNow) return resultForExisting(existingNow)
    const lease = acquireCoverLease({ sandbox, compute, now: requestNow })
    if (!lease.ok) return failure('RESOURCE_LIMIT', 'gpu')
    let retainLease = false
    try {
    const attempt = makeAttempt(requestKey, requestNow, lease.value)
    const entry = {
      entryVersion: 1,
      kind: 'COVER',
      scopeId,
      taskId,
      birthIdentityHash: birthNow.identityHash,
      phase: 'CLAIMED',
      record: clone(birthNow.record),
      completion: null,
      intentHash: birthNow.intentHash,
      intent: clone(birthNow.intent),
      attempt,
      checkpoints: [
        { index: 0, stage: 'CLAIMED', at: requestNow, status: 'DONE', tempSummary: null, importReceipt: null },
      ],
      manifest: { source: null, vocal: null, instrumental: null, converted: null, master: null, verification: null },
      cancel: { requested: false, requestedAt: null, acknowledgedAt: null, confirmedAt: null, reason: null },
    }
    try {
      writeOwner(state, ownerNow, entry, 'increment')
    } catch (error) {
      const mapped = mapStoreError(error)
      return mapped || failure('INTERNAL_FAILURE')
    }
    await yieldMacrotask()

    // fresh source read at execution time
    const source = await readSourceFacts({
      library: library.value,
      state,
      sandbox,
      scopeId,
      artifactRef: entry.intent.sourceRef,
      proofRef: entry.intent.rightsProofRef,
      now: requestNow,
    })
    if (!source || source.ok !== true) {
      await finalizeTerminal(state, entry, 'FAILED', source && source.key === 'SOURCE_CHANGED' ? 'SOURCE_CHANGED' : 'SOURCE_UNAVAILABLE')
      return failure(source && source.key === 'SOURCE_CHANGED' ? 'SOURCE_CHANGED' : 'SOURCE_UNAVAILABLE', 'sourceInput')
    }
    if (source.proof.byteSha256 !== entry.intent.sourceByteSha256 || source.proof.byteLength !== entry.intent.sourceByteLength) {
      await finalizeTerminal(state, entry, 'FAILED', 'SOURCE_CHANGED')
      return failure('SOURCE_CHANGED', 'sourceInput')
    }
    if (Date.parse(source.metadata.expiresAt) <= Date.parse(requestNow)) {
      await finalizeTerminal(state, entry, 'FAILED', 'EXPIRED')
      return failure('EXPIRED', 'expiresAt')
    }
    if (source.metadata.rights.state !== 'GRANTED' || source.metadata.rights.proofRef !== entry.intent.rightsProofRef) {
      await finalizeTerminal(state, entry, 'FAILED', 'RIGHTS_REJECTED')
      return failure('RIGHTS_REJECTED', 'rights')
    }
    if (sourceEntryIdentityHash(source.facts) !== entry.intent.sourceEntryIdentityHash) {
      await finalizeTerminal(state, entry, 'FAILED', 'SOURCE_CHANGED')
      return failure('SOURCE_CHANGED', 'sourceInput')
    }

    // The same readiness evaluator used by the UI now gates the actual execution with the real
    // source proof, model revisions, GPU lease, evidence validity and first-visit confirmation.
    const readiness = computeCoverReadiness({
      mode: 'SVC',
      sourceType: 'AUDIO_REF',
      source: { present: true, rightsState: source.metadata.rights.state, expiresAt: source.metadata.expiresAt },
      model: verifiedDependencies.value.model,
      gpu: { available: compute === 'LOCAL_GPU' },
      cloud: verifiedDependencies.value.cloud,
      evidence: verifiedDependencies.value.evidence,
      confirmation: verifiedDependencies.value.confirmation,
      now: requestNow,
    })
    if (!readiness.ok || readiness.value.ready !== true) {
      await finalizeTerminal(state, entry, 'FAILED', 'DEPENDENCY_FAILURE')
      const blockedPath = readiness.ok && readiness.value.blockedBy.length > 0 ? readiness.value.blockedBy[0].path : 'readiness'
      return failure('DEPENDENCY_FAILURE', blockedPath)
    }

    const sampleRate = entry.intent.outputProfile.sampleRate
    let graph
    try {
      validateCoverGraphShape(entry.intent.recipe.sourceLayout, entry.intent.recipe.mixMode)
      graph = { source: prepareCoverSource(source.bytes, sampleRate) }
    } catch (error) {
      await finalizeTerminal(state, entry, 'FAILED', 'STAGE_REJECTED')
      return failure('STAGE_REJECTED')
    }
    graph.mediaProfile = Object.freeze({ format: 'WAV', codec: 'PCM_S16LE', sampleRate, channels: 1 })

    entry.manifest.source = {
      manifestVersion: 1,
      taskId,
      scopeId,
      intentHash: entry.intentHash,
      attemptId: attempt.attemptId,
      role: 'SOURCE',
      producedByStage: 'INGEST',
      sequence: 0,
      parentLinks: [],
      rootSourceIdentityHash: entry.intent.sourceEntryIdentityHash,
      rootSourceSha256: entry.intent.sourceByteSha256,
      byteLength: graph.source.byteLength,
      byteSha256: graph.source.byteSha256,
      inspection: graph.source.inspection,
      mediaProfile: graph.mediaProfile,
      rights: { state: 'GRANTED', proofRef: entry.intent.rightsProofRef },
      expiresAt: entry.intent.rightsExpiresAt,
      modelRevision: entry.intent.modelRevision,
      profileRevision: entry.intent.profileRevision,
      backendRevision: entry.intent.backendRevision,
      origin: 'FIXTURE_IMPORT',
      truthLevel: 'MEASURED_STORED_FIXTURE',
      availability: 'STORED',
      verification: { state: 'PASSED', inspectedAt: requestNow, inspector: 'FIXTURE_WAV_CHECKED', masterSha256: graph.source.byteSha256 },
    }

    const cancelled = async () => {
      if (fenceOf(state, taskId)) return true
      const fresh = readCoverOwner(state)
      const current = fresh.snapshot
        ? fresh.snapshot.entries.find((item) => item.scopeId === scopeId && item.taskId === taskId)
        : null
      return Boolean(current && current.cancel && current.cancel.requested)
    }
    // Contract §8.1: the cheap synchronous fence read before every 4,096-frame slice, and a real
    // macrotask yield at least every 65,536 frames so an external cancel callback can be delivered.
    const hooks = {
      isCancelled: () => Boolean(fenceOf(state, taskId)),
      yieldNow: () => yieldMacrotask(),
    }

    if (await cancelled()) return cancelNow(state, entry, requestNow)
    await yieldMacrotask()

    const guardedStage = async (run) => {
      try {
        return { ok: true, value: await run() }
      } catch {
        await finalizeTerminal(state, entry, 'FAILED', 'STAGE_REJECTED')
        return { ok: false }
      }
    }

    let conversionInput = graph.source.samples
    if (entry.intent.recipe.sourceLayout === 'MIXED') {
      const stemResult = await guardedStage(() => separateTwoStemCooperative(graph.source.samples, hooks))
      if (!stemResult.ok) return failure('STAGE_REJECTED')
      const stems = stemResult.value
      if (stems.cancelled) return cancelNow(state, entry, requestNow)
      graph.vocal = buildCoverStageRecord('VOCAL', stems.vocal, sampleRate, graph.source.byteSha256)
      graph.instrumental = buildCoverStageRecord('INSTRUMENTAL', stems.instrumental, sampleRate, graph.source.byteSha256)
      conversionInput = stems.vocal
      entry.manifest.vocal = compactOf(graph.vocal)
      entry.manifest.instrumental = compactOf(graph.instrumental)
      entry.checkpoints.push({ index: 1, stage: 'SEPARATED', at: requestNow, status: 'DONE', tempSummary: { role: 'VOCAL', byteSha256: graph.vocal.byteSha256, byteLength: graph.vocal.byteLength }, importReceipt: null })
      if (await cancelled()) return cancelNow(state, entry, requestNow)
      try {
        writeOwner(state, readCoverOwner(state), entry, 'same')
      } catch (error) {
        const mapped = mapStoreError(error)
        return mapped || failure('INTERNAL_FAILURE')
      }
      await yieldMacrotask()
    }

    const convertResult = await guardedStage(() => convertVocalCooperative(conversionInput, entry.intent.pitchShift, hooks))
    if (!convertResult.ok) return failure('STAGE_REJECTED')
    const converted = convertResult.value
    if (converted.cancelled) return cancelNow(state, entry, requestNow)
    graph.converted = buildCoverStageRecord('CONVERTED_VOCAL', converted.samples, sampleRate, graph.vocal ? graph.vocal.byteSha256 : graph.source.byteSha256)
    entry.manifest.converted = compactOf(graph.converted)
    entry.checkpoints.push({ index: 2, stage: 'CONVERTED', at: requestNow, status: 'DONE', tempSummary: { role: 'CONVERTED_VOCAL', byteSha256: graph.converted.byteSha256, byteLength: graph.converted.byteLength }, importReceipt: null })
    if (await cancelled()) return cancelNow(state, entry, requestNow)
    try {
      writeOwner(state, readCoverOwner(state), entry, 'same')
    } catch (error) {
      const mapped = mapStoreError(error)
      return mapped || failure('INTERNAL_FAILURE')
    }
    await yieldMacrotask()

    const mixResult = await guardedStage(() =>
      mixStemsCooperative(
        {
          converted: converted.samples,
          instrumental: entry.intent.recipe.mixMode === 'WITH_INSTRUMENTAL' ? graph.instrumental.samples : null,
          vocalGainDb: entry.intent.recipe.vocalGainDb,
          instrumentalGainDb: entry.intent.recipe.instrumentalGainDb,
        },
        hooks,
      ),
    )
    if (!mixResult.ok) return failure('STAGE_REJECTED')
    const mixed = mixResult.value
    if (mixed.cancelled) return cancelNow(state, entry, requestNow)
    graph.master = buildCoverMasterRecord(mixed.samples, sampleRate)
    entry.checkpoints.push({ index: 3, stage: 'MIXED', at: requestNow, status: 'DONE', tempSummary: { role: 'MASTER', byteSha256: graph.master.byteSha256, byteLength: graph.master.byteLength }, importReceipt: null })
    if (await cancelled()) return cancelNow(state, entry, requestNow)

    const artifactState = getArtifactState(sandbox)
    if (isArtifactLocked(artifactState)) {
      await finalizeTerminal(state, entry, 'FAILED', 'DEPENDENCY_FAILURE')
      return failure('DEPENDENCY_FAILURE')
    }
    const importKey = 'import:cover-master:' + attempt.attemptId.slice(-16)
    let outcome
    try {
      // One Artifact-queue critical section: import -> receipt checkpoint -> fresh JOINT proof ->
      // FINAL write -> post-commit confirmation. The Cover queue is held for the whole attempt.
      outcome = await enqueueArtifact(artifactState, async () => {
        if (isArtifactLocked(artifactState)) return { kind: 'ARTIFACT_LOCKED' }
        const imported = importInQueue(artifactState, {
          schemaVersion: 1,
          scopeId,
          requestKey: importKey,
          bytes: graph.master.bytes,
          now: requestNow,
          expiresAt: entry.intent.rightsExpiresAt,
          rights: { state: 'GRANTED', proofRef: entry.intent.rightsProofRef },
        })
        if (!imported || imported.ok !== true) return { kind: 'IMPORT_FAILED' }
        if (imported.value.outcome !== 'STORED' && imported.value.outcome !== 'EXISTING') return { kind: 'IMPORT_FAILED' }
        const artifactRef = imported.value.artifact.artifactRef
        const first = readStoredForSave(artifactState, { scopeId, artifactRef, now: requestNow })
        if (!first || first.ok !== true || first.value.state !== 'STORED') return { kind: 'ARTIFACT_MISSING' }
        const proof = first.value.artifact
        if (proof.byteSha256 !== graph.master.byteSha256 || proof.byteLength !== graph.master.byteLength) return { kind: 'ARTIFACT_MISMATCH' }
        if (Date.parse(proof.expiresAt) <= Date.parse(requestNow)) return { kind: 'ARTIFACT_EXPIRED' }
        if (!proof.rights || proof.rights.state !== 'GRANTED' || proof.rights.proofRef !== entry.intent.rightsProofRef) {
          return { kind: 'ARTIFACT_RIGHTS' }
        }

        entry.manifest.master = {
          manifestVersion: 1,
          taskId,
          scopeId,
          intentHash: entry.intentHash,
          attemptId: attempt.attemptId,
          role: 'MASTER',
          producedByStage: 'MIXING',
          sequence: 3,
          parentLinks: [
            { role: 'CONVERTED_VOCAL', byteSha256: graph.converted.byteSha256 },
            ...(graph.instrumental ? [{ role: 'INSTRUMENTAL', byteSha256: graph.instrumental.byteSha256 }] : []),
          ],
          rootSourceIdentityHash: entry.intent.sourceEntryIdentityHash,
          rootSourceSha256: entry.intent.sourceByteSha256,
          byteLength: graph.master.byteLength,
          byteSha256: graph.master.byteSha256,
          inspection: graph.master.inspection,
          mediaProfile: graph.mediaProfile,
          rights: { state: 'GRANTED', proofRef: entry.intent.rightsProofRef },
          expiresAt: entry.intent.rightsExpiresAt,
          modelRevision: entry.intent.modelRevision,
          profileRevision: entry.intent.profileRevision,
          backendRevision: entry.intent.backendRevision,
          origin: 'SYNTHETIC_FIXTURE',
          truthLevel: 'MEASURED_SYNTHETIC_VERIFIED',
          availability: 'STORED',
          verification: { state: 'PASSED', inspectedAt: requestNow, inspector: 'FIXTURE_WAV_CHECKED', masterSha256: graph.master.byteSha256 },
        }
        entry.manifest.verification = { state: 'PASSED', inspectedAt: requestNow, inspector: 'FIXTURE_WAV_CHECKED', masterSha256: graph.master.byteSha256 }
        entry.checkpoints.push({
          index: 4,
          stage: 'MASTER_IMPORTED',
          at: requestNow,
          status: 'DONE',
          tempSummary: { role: 'MASTER', byteSha256: graph.master.byteSha256, byteLength: graph.master.byteLength },
          importReceipt: {
            artifactRef,
            byteSha256: proof.byteSha256,
            byteLength: proof.byteLength,
            expiresAt: proof.expiresAt,
            requestKey: proof.requestKey || importKey,
          },
        })
        try {
          writeOwner(state, readCoverOwner(state), entry, 'same')
        } catch (error) {
          return { kind: 'CHECKPOINT_FAILED', mapped: mapStoreError(error) }
        }

        // Crash window: the claim and the receipt are now durable, but there is no FINAL yet.
        if (fenceOf(state, taskId)) return { kind: 'CANCEL_DURING_IMPORT' }
        return finalizeCoverSaved(state, artifactState, { scopeId, taskId, attemptId: attempt.attemptId, requestNow })
      })
    } catch {
      retainLease = true
      return failure('EXECUTION_UNKNOWN')
    }
    if (outcome.kind === 'SAVED') return resultForSaved(outcome.entry, outcome.master)
    if (outcome.kind === 'CANCEL_DURING_IMPORT') return cancelNow(state, entry, requestNow)
    if (outcome.kind === 'EXECUTION_UNKNOWN') {
      retainLease = true
      return failure('EXECUTION_UNKNOWN')
    }
    if (outcome.kind === 'CHECKPOINT_FAILED' || outcome.kind === 'FINAL_FAILED') {
      retainLease = true
      return outcome.mapped || failure('SAVE_UNKNOWN')
    }
    if (outcome.kind === 'SAVE_UNKNOWN') {
      retainLease = true
      return failure('SAVE_UNKNOWN')
    }
    if (outcome.kind === 'ARTIFACT_LOCKED') {
      retainLease = true
      return failure('DEPENDENCY_FAILURE')
    }
    const failureKey =
      outcome.kind === 'ARTIFACT_EXPIRED' ? 'EXPIRED' : outcome.kind === 'ARTIFACT_RIGHTS' ? 'RIGHTS_REJECTED' : 'SAVE_REJECTED'
    await finalizeTerminal(state, entry, 'FAILED', failureKey)
    return failure(failureKey)
    } finally {
      if (!retainLease) releaseCoverLease({ sandbox, leaseId: lease.value.leaseId })
    }
  })
}

async function finalizeTerminal(state, entry, kind, code) {
  try {
    const owner = readCoverOwner(state)
    const next = clone(entry)
    next.phase = 'FINAL'
    next.completion = { kind, reason: code || null }
    next.record.state = kind === 'CANCELLED' ? 'CANCELLED' : 'FAILED'
    next.record.lastError = kind === 'FAILED' ? { code: COVER_EXECUTION_CODES[code] || COVER_EXECUTION_CODES.FAILED } : null
    next.attempt.status = kind === 'CANCELLED' ? 'CANCELLED' : 'FAILED'
    next.attempt.error = kind === 'FAILED' ? { code: COVER_EXECUTION_CODES[code] || COVER_EXECUTION_CODES.FAILED, path: '$', reason: REASONS[code] || REASONS.STAGE_REJECTED } : null
    next.attempt.finishedAt = new Date().toISOString()
    if (next.attempt.lease) next.attempt.lease.releasedAt = next.attempt.finishedAt
    if (kind === 'CANCELLED') {
      next.record.cancel = { requested: true, confirmed: true }
      next.cancel = { requested: true, requestedAt: next.cancel.requestedAt, acknowledgedAt: next.attempt.finishedAt, confirmedAt: next.attempt.finishedAt, reason: 'USER_REQUEST' }
    }
    writeOwner(state, owner, next, 'increment')
  } catch {
    // A failed terminal write leaves the claim in place; the caller reports the original failure.
  }
  clearFence(state, entry.taskId)
}

async function cancelNow(state, entry, requestedAt) {
  const stoppedAt = new Date().toISOString()
  const ackAt = requestedAt || stoppedAt
  // Fact 2 (ack): the run observed the fence and persists the acknowledgement as its own short
  // owner write *before* stopping, so status/disk prove ACKNOWLEDGED separately from STOPPED.
  let acknowledged = false
  try {
    const ackOwner = readCoverOwner(state)
    const ackEntry = ackOwner.snapshot
      ? ackOwner.snapshot.entries.find((item) => item.scopeId === entry.scopeId && item.taskId === entry.taskId)
      : null
    if (ackEntry && ackEntry.phase !== 'FINAL') {
      const next = clone(entry)
      next.cancel = {
        requested: true,
        requestedAt: (ackEntry.cancel && ackEntry.cancel.requestedAt) || ackAt,
        acknowledgedAt: ackAt,
        confirmedAt: null,
        reason: 'USER_REQUEST',
      }
      writeOwner(state, ackOwner, next, 'same')
      acknowledged = true
      await yieldMacrotask()
    }
  } catch {
    // A failed ack write still stops the run; the FINAL write below records both timestamps.
  }

  let current
  try {
    const owner = readCoverOwner(state)
    current = owner.snapshot
      ? owner.snapshot.entries.find((item) => item.scopeId === entry.scopeId && item.taskId === entry.taskId)
      : null
  } catch {
    return failure('SAVE_UNKNOWN')
  }
  if (current && current.phase === 'FINAL' && current.completion && current.completion.kind === 'SAVED') {
    // The cancel lost the race against FINAL; keep the SAVED result and report it as too late.
    clearFence(state, current.taskId)
    return success({ schemaVersion: 1, outcome: 'EXISTING', attemptId: current.attempt.attemptId, statusState: 'SAVED', messageZh: MESSAGES.TOO_LATE, value: null })
  }
  // The in-memory entry is authoritative for this attempt (it may already hold checkpoint 4 from an
  // import that completed just before the fence check); only the cancel timestamps come from disk.
  const diskCancel = current && current.cancel ? current.cancel : null
  const next = clone(entry)
  next.phase = 'FINAL'
  next.completion = { kind: 'CANCELLED', reason: 'USER_REQUEST' }
  next.record.state = 'CANCELLED'
  next.record.cancel = { requested: true, confirmed: true }
  next.record.lastError = null
  next.attempt.status = 'CANCELLED'
  next.attempt.error = null
  next.attempt.finishedAt = stoppedAt
  if (next.attempt.lease) next.attempt.lease.releasedAt = stoppedAt
  next.cancel = {
    requested: true,
    requestedAt: (diskCancel && diskCancel.requestedAt) || (entry.cancel && entry.cancel.requestedAt) || ackAt,
    acknowledgedAt:
      (diskCancel && diskCancel.acknowledgedAt) || (entry.cancel && entry.cancel.acknowledgedAt) || (acknowledged ? ackAt : stoppedAt),
    confirmedAt: stoppedAt,
    reason: 'USER_REQUEST',
  }
  try {
    writeOwner(state, readCoverOwner(state), next, 'increment')
  } catch {
    return failure('SAVE_UNKNOWN')
  }
  clearFence(state, next.taskId)
  return success({
    schemaVersion: 1,
    outcome: 'CANCELLED',
    attemptId: next.attempt.attemptId,
    statusState: 'CANCELLED',
    messageZh: MESSAGES.CANCELLED,
    value: null,
  })
}

async function finalizeSaved_removed() {}

/* ------------------------------------------------ status/cancel ----------------------------- */

export async function coverStatus({ sandbox, scopeId, taskId, now }) {
  if (!sandbox || typeof scopeId !== 'string' || typeof taskId !== 'string') return failure('INPUT_INVALID')
  if (canonicalIso(now) === null) return failure('INPUT_INVALID', 'now')
  const state = getCoverState(sandbox)
  try {
    const owner = readCoverOwner(state)
    const entry = owner.snapshot
      ? owner.snapshot.entries.find((item) => item.scopeId === scopeId && item.taskId === taskId)
      : null
    return success(buildStatus(entry))
  } catch (error) {
    const mapped = mapStoreError(error)
    return mapped || failure('INTERNAL_FAILURE')
  }
}

export async function requestCoverCancel({ sandbox, scopeId, taskId, attemptId, now }) {
  if (!sandbox || typeof scopeId !== 'string' || typeof taskId !== 'string' || typeof attemptId !== 'string') {
    return failure('INPUT_INVALID')
  }
  const requestedAt = canonicalIso(now)
  if (requestedAt === null) return failure('INPUT_INVALID', 'now')
  const state = getCoverState(sandbox)
  let owner
  try {
    owner = readCoverOwner(state)
  } catch (error) {
    const mapped = mapStoreError(error)
    return mapped || failure('INTERNAL_FAILURE')
  }
  const entry = owner.snapshot
    ? owner.snapshot.entries.find((item) => item.scopeId === scopeId && item.taskId === taskId)
    : null
  if (!entry) return failure('NOT_FOUND')
  if (entry.phase === 'FINAL') {
    return success({ schemaVersion: 1, cancelRequested: false, cancelState: 'TOO_LATE', acknowledgedAt: null, messageZh: MESSAGES.TOO_LATE })
  }
  if (entry.attempt && entry.attempt.attemptId !== attemptId) return failure('NOT_FOUND', 'attemptId')
  setFence(state, taskId, requestedAt)
  const next = clone(entry)
  next.cancel = {
    requested: true,
    requestedAt,
    acknowledgedAt: null,
    confirmedAt: null,
    reason: 'USER_REQUEST',
  }
  // Best-effort short persistence; a busy executor may hold the tail, but the in-memory fence is the
  // side-channel the stage loop actually observes.
  enqueueCover(state, async () => {
    try {
      const fresh = readCoverOwner(state)
      const current = fresh.snapshot
        ? fresh.snapshot.entries.find((item) => item.scopeId === scopeId && item.taskId === taskId)
        : null
      if (!current || current.phase === 'FINAL' || (current.cancel && current.cancel.requested)) return
      writeOwner(state, fresh, next, 'same')
    } catch {
      // the fence still stops the run; the persisted flag may lag and be recovered by status
    }
  })
  return success({ schemaVersion: 1, cancelRequested: true, cancelState: 'ACCEPTED', acknowledgedAt: null, messageZh: MESSAGES.ACCEPTED })
}

export async function resumeCoverFinal({ sandbox, scopeId, taskId, attemptId, requestKey, now }) {
  if (!sandbox || typeof scopeId !== 'string' || typeof taskId !== 'string') return failure('INPUT_INVALID')
  if (typeof attemptId !== 'string' || typeof requestKey !== 'string') return failure('INPUT_INVALID', 'attemptId')
  const requestNow = canonicalIso(now)
  if (requestNow === null) return failure('INPUT_INVALID', 'now')
  const state = getCoverState(sandbox)
  if (isCoverStoreLocked(state)) return failure('UNKNOWN')
  let owner
  try {
    owner = readCoverOwner(state)
  } catch (error) {
    const mapped = mapStoreError(error)
    return mapped || failure('INTERNAL_FAILURE')
  }
  const existing = findOwnerEntry(owner.snapshot, scopeId, taskId)
  if (!existing || existing.kind !== 'COVER') return failure('NOT_FOUND')
  // Identity first: a resume may only continue the exact attempt/request that owns the claim.
  if (existing.attempt.attemptId !== attemptId) return failure('NOT_FOUND', 'attemptId')
  if (existing.attempt.requestKey !== requestKey) return failure('NOT_FOUND', 'requestKey')
  if (existing.phase === 'FINAL') return resultForExisting(existing)
  if (existing.attempt.status !== 'RUNNING') return failure('EXECUTION_UNKNOWN')
  if (!(existing.checkpoints || []).some((checkpoint) => checkpoint.index === 4 && checkpoint.importReceipt)) {
    return failure('EXECUTION_UNKNOWN')
  }
  const artifactState = getArtifactState(sandbox)
  if (isArtifactLocked(artifactState)) return failure('DEPENDENCY_FAILURE')
  return enqueueCover(state, async () => {
    try {
      let outcome
      try {
        // No second import: a resume only finishes an already receipted claim.
        outcome = await enqueueArtifact(artifactState, () =>
          finalizeCoverSaved(state, artifactState, { scopeId, taskId, attemptId, requestNow }),
        )
      } catch {
        return failure('EXECUTION_UNKNOWN')
      }
      if (outcome.kind === 'SAVED') return resultForSaved(outcome.entry, outcome.master)
      if (outcome.kind === 'EXECUTION_UNKNOWN') return failure('EXECUTION_UNKNOWN')
      if (outcome.kind === 'FINAL_FAILED') return outcome.mapped || failure('SAVE_UNKNOWN')
      if (outcome.kind === 'SAVE_UNKNOWN') return failure('SAVE_UNKNOWN')
      if (outcome.kind === 'ARTIFACT_EXPIRED') return failure('EXPIRED')
      return failure('SAVE_REJECTED')
    } catch (error) {
      const mapped = mapStoreError(error)
      return mapped || failure('INTERNAL_FAILURE')
    }
  })
}
