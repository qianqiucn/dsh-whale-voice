/* Whale Voice — private shared Fixture task store (Plan 08-D-C internal helper).
 *
 * One implementation of the already verified isolated file storage, shared by the 08-D-A catalog
 * and the 08-D-C task owner. It is not a public API and not a generic file service: the two fixed
 * file names, their byte/entry budgets, their error domains and their Schema parsers are module
 * constants bound to two module functions (`openCatalogFile` / `openOwnerFile`). Callers cannot
 * pass a path, file name, budget, fs, validator or parse callback, so no third file can be
 * addressed through this module.
 *
 * Preserved from the verified catalog implementation: bounded fd reads (128 KiB+1 / 4 KiB+1),
 * strict UTF-8/JSON/Schema reads, capability/root/marker identity checks, short-write completion,
 * fsync + a single close per lease, full temporary read-back, rename-then-read-back identity,
 * one-shot cleanup eligibility, corruption-before-external-change priority and WRITE_UNKNOWN with
 * a shared lock once a rename was attempted. `audio-task-owner-v1.json` now records its own
 * confirmed digest separately from the catalog file; the lock itself is shared per capability.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import {
  StoreFailure,
  storeReason,
  raiseStore,
  isStoreFailure,
  isPlainObject,
  keySurface,
  hasOwn,
  sha256,
  stableStringify,
  checkSandbox,
  readBoundedPath,
  sameIdentity,
  assertRegularStat,
  isInside,
} from './fixture-store-base-internal.mjs'

/* Plan 08-E-E-B Step 1: keep the ten former shared bindings re-exported with the same identity so
 * existing catalog/owner/library imports keep resolving to the single StoreFailure class. */
export {
  StoreFailure,
  storeReason,
  raiseStore,
  isStoreFailure,
  isPlainObject,
  keySurface,
  hasOwn,
  sha256,
  stableStringify,
  checkSandbox,
}
import { createAudioTaskRecord, validateAudioTaskRecord } from './task-contract.mjs'
import { TASK_FIXTURE_ERRORS } from './task-fixture-engine-internal.mjs'
import { PROVIDER_DISPATCH_ERRORS } from './provider-dispatch.mjs'
import { getArtifactState, readStoredForSave } from './fixture-artifact-store-internal.mjs'

export const CATALOG_FILE_NAME = 'audio-task-catalog-v1.json'
export const OWNER_FILE_NAME = 'audio-task-owner-v1.json'
export const MAX_CATALOG_BYTES = 128 * 1024
export const MAX_OWNER_BYTES = 128 * 1024
export const MAX_CATALOG_ENTRIES = 32
export const MAX_OWNER_ENTRIES = 32

/** The only two error domains an internal file operation may declare. */
export const STORE_DOMAINS = Object.freeze({
  CATALOG: 'catalog',
  OWNER: 'owner',
})

const SCOPE_PATTERN = /^scope:fixture-[A-Za-z0-9_-]{1,32}$/
const KEY_PATTERN = /^key:fixture-[A-Za-z0-9_-]{1,48}$/
const TASK_ID_PATTERN = /^task:fixture-[0-9a-f]{32}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/
const OWNER_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const OWNER_PROOF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/
const SNAPSHOT_KEYS = Object.freeze(new Set(['schemaVersion', 'revision', 'entries']))
const CATALOG_ENTRY_KEYS = Object.freeze(new Set(['scopeId', 'idempotencyKey', 'identityHash', 'record']))
const CATALOG_SCHEMA_VERSION = 1
const INITIAL_STATES = Object.freeze(new Set(['CREATED', 'BLOCKED_RIGHTS']))
const OWNER_SNAPSHOT_KEYS = Object.freeze(new Set(['schemaVersion', 'revision', 'entries']))
const OWNER_ENTRY_KEYS = Object.freeze(new Set(['scopeId', 'taskId', 'birthIdentityHash', 'phase', 'record', 'completion']))
const OWNER_COMPLETION_KEYS = Object.freeze(new Set(['kind', 'reason']))
const OWNER_SNAPSHOT_SCHEMA_VERSION = 1
/** Plan 08-E-C: the only second on-disk owner snapshot version, written when a SAVED FINAL exists. */
const OWNER_SNAPSHOT_SCHEMA_VERSION_V2 = 2
const ARTIFACT_REF_PATTERN = /^artifact:fixture-bytes-[0-9a-f]{32}$/
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const PROOF_KEYS = Object.freeze([
  'schemaVersion',
  'scopeId',
  'taskId',
  'birthIdentityHash',
  'birthObservedAt',
  'claimRevision',
  'claimDigest',
  'candidateRevision',
  'recordIdentityHash',
  'artifact',
  'evaluatedAt',
])
const PROOF_KEY_SET = Object.freeze(new Set(PROOF_KEYS))
const PROOF_ARTIFACT_KEYS = Object.freeze([
  'artifactRef',
  'identityHash',
  'byteSha256',
  'byteLength',
  'expiresAt',
  'requestKey',
  'rights',
  'inspection',
])
const PROOF_ARTIFACT_KEY_SET = Object.freeze(new Set(PROOF_ARTIFACT_KEYS))
const OWNER_RIGHTS_KEYS = Object.freeze(new Set(['state', 'proofRef']))
const OWNER_INSPECTION_KEYS = Object.freeze([
  'schemaVersion',
  'format',
  'codec',
  'bitsPerSample',
  'sampleRate',
  'channels',
  'byteLength',
  'dataByteLength',
  'frameCount',
  'durationMs',
  'peak',
  'fullScaleSampleCount',
  'sha256',
  'validationState',
  'mockOnly',
  'realOperationAllowed',
  'submitAllowed',
  'automaticRetryAllowed',
  'messageZh',
])
const OWNER_INSPECTION_KEY_SET = Object.freeze(new Set(OWNER_INSPECTION_KEYS))
const OWNER_SIMULATED_STATES = Object.freeze(
  new Set(['ARTIFACT_READY', 'FAILED', 'UNKNOWN', 'CANCEL_REQUESTED', 'CANCELLED']),
)
/** The four fixed reasons the existing engine may report for a legal no-execution Task. */
const OWNER_NO_EXECUTION_REASONS = Object.freeze([
  TASK_FIXTURE_ERRORS.SOURCE_BLOCKED,
  TASK_FIXTURE_ERRORS.READINESS_BLOCKED,
  TASK_FIXTURE_ERRORS.DISPATCH_BLOCKED,
  PROVIDER_DISPATCH_ERRORS.UNSUPPORTED_DISPATCH,
])
const STATES = new WeakMap()

export function identityOf(record) {
  return {
    schemaVersion: record.schemaVersion,
    feature: record.feature,
    taskType: record.taskType,
    source: { kind: record.source.kind, ref: record.source.ref },
    voiceProfileId: record.voiceProfileId,
    deliveryRequested: record.deliveryRequested,
    rights: { state: record.rights.state },
  }
}

export function identityHashOf(record) {
  return sha256(Buffer.from(JSON.stringify(identityOf(record)), 'utf8'))
}

export function getStoreState(sandbox) {
  let state = STATES.get(sandbox)
  if (!state) {
    state = {
      sandbox,
      tail: Promise.resolve(),
      locked: null,
      files: new Map(),
    }
    STATES.set(sandbox, state)
  }
  return state
}

export function enqueue(state, run) {
  const next = state.tail.then(
    () => run(),
    () => run(),
  )
  state.tail = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

export function lockStore(state) {
  state.locked = 'UNKNOWN'
}

export function isStoreLocked(state) {
  return state.locked !== null
}

function fileState(state, name) {
  let file = state.files.get(name)
  if (!file) {
    file = { confirmedDigest: undefined }
    state.files.set(name, file)
  }
  return file
}

function parseSnapshot(bytes) {
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) raiseStore('STORE_INVALID', '$')
  let snapshot
  try {
    snapshot = JSON.parse(text)
  } catch {
    raiseStore('STORE_INVALID', '$')
  }
  return snapshot
}

function canonicalInitialRecord(record) {
  let validated
  try {
    validated = validateAudioTaskRecord(record)
  } catch {
    raiseStore('STORE_INVALID', '$')
  }
  if (!validated || typeof validated !== 'object' || typeof validated.ok !== 'boolean') {
    raiseStore('STORE_INVALID', '$')
  }
  if (validated.ok === false) raiseStore('STORE_INVALID', '$')
  const value = validated.value
  if (!isPlainObject(value)) raiseStore('STORE_INVALID', '$')
  if (!TASK_ID_PATTERN.test(value.taskId)) raiseStore('STORE_INVALID', '$')
  if (!INITIAL_STATES.has(value.state)) raiseStore('STORE_INVALID', '$')
  if (value.outputArtifactRef !== null) raiseStore('STORE_INVALID', '$')
  if (!isPlainObject(value.cancel) || value.cancel.requested !== false || value.cancel.confirmed !== false) {
    raiseStore('STORE_INVALID', '$')
  }
  if (
    !isPlainObject(value.delivery) ||
    value.delivery.state !== 'NOT_REQUESTED' ||
    value.delivery.deliveryId !== null
  ) {
    raiseStore('STORE_INVALID', '$')
  }
  if (value.lastError !== null) raiseStore('STORE_INVALID', '$')
  if (value.mockOnly !== true || value.realOperationAllowed !== false) raiseStore('STORE_INVALID', '$')

  const draft = {
    schemaVersion: value.schemaVersion,
    taskId: value.taskId,
    feature: value.feature,
    taskType: value.taskType,
    source: { kind: value.source.kind, ref: value.source.ref },
    voiceProfileId: value.voiceProfileId,
    deliveryRequested: value.deliveryRequested,
    rights: { state: value.rights.state },
  }
  let recreated
  try {
    recreated = createAudioTaskRecord(draft, { observedAt: value.observedAt })
  } catch {
    raiseStore('STORE_INVALID', '$')
  }
  if (!recreated || recreated.ok !== true) raiseStore('STORE_INVALID', '$')
  if (stableStringify(recreated.value) !== stableStringify(record)) raiseStore('STORE_INVALID', '$')
  return recreated.value
}

/** Catalog snapshot schema, kept byte-for-byte compatible with the verified 08-D-A rules. */
export function parseCatalogSnapshot(bytes, maxEntries = MAX_CATALOG_ENTRIES) {
  const snapshot = parseSnapshot(bytes)
  if (!isPlainObject(snapshot)) raiseStore('STORE_INVALID', '$')
  if (keySurface(snapshot, SNAPSHOT_KEYS) !== 'ok') raiseStore('STORE_INVALID', '$')
  if (snapshot.schemaVersion !== CATALOG_SCHEMA_VERSION) raiseStore('STORE_INVALID', '$')
  if (!Array.isArray(snapshot.entries)) raiseStore('STORE_INVALID', '$')
  if (snapshot.entries.length > maxEntries) raiseStore('RESOURCE_LIMIT', '$')
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) raiseStore('STORE_INVALID', '$')
  if (snapshot.revision !== snapshot.entries.length) raiseStore('STORE_INVALID', '$')

  const taskIds = new Set()
  const pairKeys = new Set()
  const entries = []
  for (const entry of snapshot.entries) {
    if (!isPlainObject(entry) || keySurface(entry, CATALOG_ENTRY_KEYS) !== 'ok') raiseStore('STORE_INVALID', '$')
    if (typeof entry.scopeId !== 'string' || !SCOPE_PATTERN.test(entry.scopeId)) raiseStore('STORE_INVALID', '$')
    if (typeof entry.idempotencyKey !== 'string' || !KEY_PATTERN.test(entry.idempotencyKey)) {
      raiseStore('STORE_INVALID', '$')
    }
    if (typeof entry.identityHash !== 'string' || !HASH_PATTERN.test(entry.identityHash)) {
      raiseStore('STORE_INVALID', '$')
    }
    const record = canonicalInitialRecord(entry.record)
    if (taskIds.has(record.taskId)) raiseStore('STORE_INVALID', '$')
    taskIds.add(record.taskId)
    const pair = entry.scopeId + '\u0000' + entry.idempotencyKey
    if (pairKeys.has(pair)) raiseStore('STORE_INVALID', '$')
    pairKeys.add(pair)
    if (identityHashOf(record) !== entry.identityHash) raiseStore('STORE_INVALID', '$')
    entries.push({
      scopeId: entry.scopeId,
      idempotencyKey: entry.idempotencyKey,
      identityHash: entry.identityHash,
      record,
    })
  }
  return { revision: snapshot.revision, entries }
}

/* ------------------------------- owner snapshot schema (08-D-C) ------------------------------- */

function ownerRecord(record, entryTaskId) {
  let validated
  try {
    validated = validateAudioTaskRecord(record)
  } catch {
    raiseStore('STORE_INVALID', '$')
  }
  if (!validated || typeof validated !== 'object' || typeof validated.ok !== 'boolean') {
    raiseStore('STORE_INVALID', '$')
  }
  if (validated.ok === false) raiseStore('STORE_INVALID', '$')
  const value = validated.value
  if (!isPlainObject(value)) raiseStore('STORE_INVALID', '$')
  if (value.taskId !== entryTaskId) raiseStore('STORE_INVALID', '$')
  if (value.mockOnly !== true || value.realOperationAllowed !== false) raiseStore('STORE_INVALID', '$')
  if (!isPlainObject(value.delivery) || value.delivery.deliveryId !== null) raiseStore('STORE_INVALID', '$')
  if (value.delivery.state !== 'NOT_REQUESTED') raiseStore('STORE_INVALID', '$')
  return value
}

function initialOnly(record) {
  if (!INITIAL_STATES.has(record.state)) raiseStore('STORE_INVALID', '$')
  if (record.outputArtifactRef !== null) raiseStore('STORE_INVALID', '$')
  if (!isPlainObject(record.cancel) || record.cancel.requested !== false || record.cancel.confirmed !== false) {
    raiseStore('STORE_INVALID', '$')
  }
  if (record.lastError !== null) raiseStore('STORE_INVALID', '$')
}

/** Owner snapshot schema: the single copy used by the fixed owner file spec. */
export function parseOwnerSnapshot(bytes) {
  const snapshot = parseSnapshot(bytes)
  if (!isPlainObject(snapshot)) raiseStore('STORE_INVALID', '$')
  if (keySurface(snapshot, OWNER_SNAPSHOT_KEYS) !== 'ok') raiseStore('STORE_INVALID', '$')
  const schemaVersion = snapshot.schemaVersion
  if (schemaVersion !== OWNER_SNAPSHOT_SCHEMA_VERSION && schemaVersion !== OWNER_SNAPSHOT_SCHEMA_VERSION_V2) {
    raiseStore('STORE_INVALID', '$')
  }
  if (!Array.isArray(snapshot.entries)) raiseStore('STORE_INVALID', '$')
  if (snapshot.entries.length > MAX_OWNER_ENTRIES) raiseStore('RESOURCE_LIMIT', '$')
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) raiseStore('STORE_INVALID', '$')

  const seen = new Set()
  let weight = 0
  let savedCount = 0
  const entries = []
  for (const entry of snapshot.entries) {
    if (!isPlainObject(entry) || keySurface(entry, OWNER_ENTRY_KEYS) !== 'ok') raiseStore('STORE_INVALID', '$')
    if (typeof entry.scopeId !== 'string' || !SCOPE_PATTERN.test(entry.scopeId)) raiseStore('STORE_INVALID', '$')
    if (typeof entry.taskId !== 'string' || !TASK_ID_PATTERN.test(entry.taskId)) raiseStore('STORE_INVALID', '$')
    if (typeof entry.birthIdentityHash !== 'string' || !HASH_PATTERN.test(entry.birthIdentityHash)) {
      raiseStore('STORE_INVALID', '$')
    }
    const key = entry.scopeId + '\u0000' + entry.taskId
    if (seen.has(key)) raiseStore('STORE_INVALID', '$')
    seen.add(key)

    const record = ownerRecord(entry.record, entry.taskId)
    if (entry.phase === 'CLAIMED') {
      initialOnly(record)
      if (entry.completion !== null) raiseStore('STORE_INVALID', '$')
      weight += 1
      entries.push({
        scopeId: entry.scopeId,
        taskId: entry.taskId,
        birthIdentityHash: entry.birthIdentityHash,
        phase: 'CLAIMED',
        record,
        completion: null,
      })
      continue
    }
    if (entry.phase !== 'FINAL') raiseStore('STORE_INVALID', '$')
    if (!isPlainObject(entry.completion) || keySurface(entry.completion, OWNER_COMPLETION_KEYS) !== 'ok') {
      raiseStore('STORE_INVALID', '$')
    }
    const kind = entry.completion.kind
    const reason = entry.completion.reason
    if (kind === 'SIMULATED') {
      if (reason !== null) raiseStore('STORE_INVALID', '$')
      if (!OWNER_SIMULATED_STATES.has(record.state)) raiseStore('STORE_INVALID', '$')
      weight += 2
      entries.push({
        scopeId: entry.scopeId,
        taskId: entry.taskId,
        birthIdentityHash: entry.birthIdentityHash,
        phase: 'FINAL',
        record,
        completion: Object.freeze({ kind: 'SIMULATED', reason: null }),
      })
      continue
    }
    if (kind === 'SAVED') {
      if (schemaVersion !== OWNER_SNAPSHOT_SCHEMA_VERSION_V2) raiseStore('STORE_INVALID', '$')
      if (reason !== null) raiseStore('STORE_INVALID', '$')
      if (record.state !== 'SAVED') raiseStore('STORE_INVALID', '$')
      if (typeof record.outputArtifactRef !== 'string' || !ARTIFACT_REF_PATTERN.test(record.outputArtifactRef)) {
        raiseStore('STORE_INVALID', '$')
      }
      if (record.cancel.requested !== false || record.cancel.confirmed !== false) raiseStore('STORE_INVALID', '$')
      if (record.lastError !== null) raiseStore('STORE_INVALID', '$')
      savedCount += 1
      weight += 2
      entries.push({
        scopeId: entry.scopeId,
        taskId: entry.taskId,
        birthIdentityHash: entry.birthIdentityHash,
        phase: 'FINAL',
        record,
        completion: Object.freeze({ kind: 'SAVED', reason: null }),
      })
      continue
    }
    if (kind !== 'NO_EXECUTION') raiseStore('STORE_INVALID', '$')
    if (!OWNER_NO_EXECUTION_REASONS.includes(reason)) raiseStore('STORE_INVALID', '$')
    initialOnly(record)
    weight += 2
    entries.push({
      scopeId: entry.scopeId,
      taskId: entry.taskId,
      birthIdentityHash: entry.birthIdentityHash,
      phase: 'FINAL',
      record,
      completion: Object.freeze({ kind: 'NO_EXECUTION', reason }),
    })
  }
  if (snapshot.revision !== weight) raiseStore('STORE_INVALID', '$')
  if (schemaVersion === OWNER_SNAPSHOT_SCHEMA_VERSION_V2) {
    if (savedCount === 0) raiseStore('STORE_INVALID', '$')
  } else if (savedCount !== 0) {
    raiseStore('STORE_INVALID', '$')
  }
  return { revision: snapshot.revision, entries, schemaVersion }
}

/* ------------------------------- owner association gate (08-D-C) ----------------------------- */

function sameImmutable(finalRecord, birthRecord) {
  return (
    finalRecord.taskId === birthRecord.taskId &&
    finalRecord.feature === birthRecord.feature &&
    finalRecord.taskType === birthRecord.taskType &&
    finalRecord.source.kind === birthRecord.source.kind &&
    finalRecord.source.ref === birthRecord.source.ref &&
    finalRecord.voiceProfileId === birthRecord.voiceProfileId &&
    finalRecord.rights.state === birthRecord.rights.state &&
    finalRecord.deliveryRequested === birthRecord.deliveryRequested &&
    finalRecord.observedAt === birthRecord.observedAt
  )
}

/** The one immutable-identity rule, shared by the association gate and the engine adapter guard. */
export function sameOwnerImmutable(finalRecord, birthRecord) {
  return sameImmutable(finalRecord, birthRecord)
}

/** Every owner entry must resolve to its catalog birth entry and to the same immutable identity. */
function checkOwnerAssociations(snapshot, catalog) {
  for (const entry of snapshot.entries) {
    const birth = catalog.entries.find(
      (item) => item.scopeId === entry.scopeId && item.record.taskId === entry.taskId,
    )
    if (!birth) raiseStore('BIRTH_INVALID', '$')
    if (identityHashOf(birth.record) !== entry.birthIdentityHash) raiseStore('BIRTH_INVALID', '$')
    if (entry.phase === 'CLAIMED') {
      if (stableStringify(entry.record) !== stableStringify(birth.record)) raiseStore('BIRTH_INVALID', '$')
      continue
    }
    if (!sameImmutable(entry.record, birth.record)) raiseStore('BIRTH_INVALID', '$')
    if (entry.completion.kind === 'NO_EXECUTION' && stableStringify(entry.record) !== stableStringify(birth.record)) {
      raiseStore('BIRTH_INVALID', '$')
    }
  }
}

/**
 * One association implementation, reused by the owner module's checkpoints and by the owner write
 * transaction itself (current read, pre-rename read, post-rename confirmation). It performs real
 * bounded reads of both fixed files and never accepts a caller-supplied validator. An association
 * failure locks the shared capability so no other handle of the same sandbox can keep writing.
 */
export function verifyOwnerAssociations(state, snapshot) {
  const catalog = openCatalogFile(state, STORE_DOMAINS.OWNER).read()
  try {
    checkOwnerAssociations(snapshot, catalog)
  } catch (error) {
    lockStore(state)
    throw error
  }
  return catalog
}

/* -------------------- Plan 08-E-C: mandatory SAVED delta and SaveProof ---------------------- */

function ownerEntryKey(entry) {
  return entry.scopeId + '\u0000' + entry.taskId
}

function rejectWrite() {
  raiseStore('WRITE_REJECTED', '$')
}

/**
 * The only writer-side classification of a candidate snapshot against the current one. Exactly one
 * `CLAIMED -> SAVED FINAL` transition is the sole write that must carry a proof; rewriting an
 * already SAVED entry, deleting entries, changing more than one task, writing a FINAL without a
 * claim, a wrong candidate revision or a snapshot version that disagrees with its SAVED content are
 * all pre-rejections without a lock.
 */
function planOwnerDelta(spec, current, bytes, expectedRevision, proof) {
  let candidate
  try {
    candidate = spec.parse(bytes)
  } catch {
    rejectWrite()
  }
  if (!Number.isInteger(expectedRevision) || candidate.revision !== expectedRevision) rejectWrite()
  const savedEntries = candidate.entries.filter(
    (entry) => entry.phase === 'FINAL' && entry.completion.kind === 'SAVED',
  )
  const expectedVersion =
    savedEntries.length > 0 ? OWNER_SNAPSHOT_SCHEMA_VERSION_V2 : OWNER_SNAPSHOT_SCHEMA_VERSION
  if (candidate.schemaVersion !== expectedVersion) rejectWrite()

  const currentMap = new Map(current.entries.map((entry) => [ownerEntryKey(entry), entry]))
  const nextMap = new Map(candidate.entries.map((entry) => [ownerEntryKey(entry), entry]))
  for (const key of currentMap.keys()) {
    if (!nextMap.has(key)) rejectWrite()
  }

  let savedEntry = null
  let changed = 0
  for (const [key, entry] of nextMap) {
    const previous = currentMap.get(key) || null
    if (previous && stableStringify(previous) === stableStringify(entry)) continue
    changed += 1
    if (previous && previous.phase === 'FINAL' && previous.completion.kind === 'SAVED') rejectWrite()
    if (entry.phase === 'FINAL' && entry.completion.kind === 'SAVED') {
      if (!previous || previous.phase !== 'CLAIMED' || savedEntry !== null) rejectWrite()
      savedEntry = entry
      continue
    }
    if (!previous) {
      if (entry.phase !== 'CLAIMED') rejectWrite()
      continue
    }
    if (!(previous.phase === 'CLAIMED' && entry.phase === 'FINAL')) rejectWrite()
  }
  if (changed > 1) rejectWrite()
  if (savedEntry !== null && proof === null) rejectWrite()
  if (savedEntry === null && proof !== null) rejectWrite()
  return { candidate, savedEntry }
}

function proofDataField(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) rejectWrite()
  return descriptor.value
}

/** Strict shape/descriptor/type pass: the only way to obtain `evaluatedAt` for a fresh library read. */
function proofFieldsOnly(proof) {
  if (!isPlainObject(proof) || keySurface(proof, PROOF_KEY_SET) !== 'ok') rejectWrite()
  const fields = {}
  for (const key of PROOF_KEYS) fields[key] = proofDataField(proof, key)
  if (fields.schemaVersion !== 1) rejectWrite()
  if (typeof fields.evaluatedAt !== 'string' || !ISO_PATTERN.test(fields.evaluatedAt)) rejectWrite()
  const evaluatedMs = Date.parse(fields.evaluatedAt)
  if (!Number.isFinite(evaluatedMs) || new Date(evaluatedMs).toISOString() !== fields.evaluatedAt) rejectWrite()
  const artifact = fields.artifact
  if (!isPlainObject(artifact) || keySurface(artifact, PROOF_ARTIFACT_KEY_SET) !== 'ok') rejectWrite()
  for (const key of PROOF_ARTIFACT_KEYS) proofDataField(artifact, key)
  const inspection = artifact.inspection
  if (!isPlainObject(inspection) || keySurface(inspection, OWNER_INSPECTION_KEY_SET) !== 'ok') rejectWrite()
  for (const key of OWNER_INSPECTION_KEYS) proofDataField(inspection, key)
  if (typeof artifact.artifactRef !== 'string' || !ARTIFACT_REF_PATTERN.test(artifact.artifactRef)) rejectWrite()
  if (typeof artifact.expiresAt !== 'string' || !ISO_PATTERN.test(artifact.expiresAt)) rejectWrite()
  if (artifact.inspection.sha256 !== artifact.byteSha256) rejectWrite()
  if (artifact.inspection.byteLength !== artifact.byteLength) rejectWrite()
  if (!(artifact.inspection.byteLength >= artifact.inspection.dataByteLength + 44)) rejectWrite()
  if (artifact.inspection.peak < 0 || artifact.inspection.peak > 1) rejectWrite()
  return fields
}

/**
 * Full §2.4 binding of one SaveProof against fresh authoritative data: the current CLAIMED
 * snapshot/digest/revision, the catalog birth identity, the candidate record identity and the
 * actual artifact that the same save just imported. Only WRITE_REJECTED may come out of here.
 */
/**
 * F04/G02: every local (library-free) proof fact is captured and checked before the fresh library
 * read: strict 11+8+19 data, hash/ref/key/rights shapes, revisions and the bindings that only need
 * the current CLAIMED snapshot, the catalog birth and the candidate record.
 */
function validateSaveProofLocal(proof, context) {
  const fields = proofFieldsOnly(proof)
  const evaluatedMs = Date.parse(fields.evaluatedAt)
  const entry = context.entry
  const birth = context.birth
  if (typeof fields.scopeId !== 'string' || fields.scopeId !== entry.scopeId) rejectWrite()
  if (typeof fields.taskId !== 'string' || fields.taskId !== entry.taskId) rejectWrite()
  if (typeof fields.birthIdentityHash !== 'string' || !HASH_PATTERN.test(fields.birthIdentityHash)) rejectWrite()
  if (fields.birthIdentityHash !== entry.birthIdentityHash) rejectWrite()
  if (typeof fields.birthObservedAt !== 'string' || !ISO_PATTERN.test(fields.birthObservedAt)) rejectWrite()
  if (!birth || birth.identityHash !== entry.birthIdentityHash) rejectWrite()
  if (birth.record.observedAt !== fields.birthObservedAt) rejectWrite()
  if (typeof fields.claimDigest !== 'string' || !HASH_PATTERN.test(fields.claimDigest)) rejectWrite()
  if (fields.claimDigest !== context.baseDigest) rejectWrite()
  if (!Number.isInteger(fields.claimRevision) || fields.claimRevision < 1) rejectWrite()
  if (fields.claimRevision !== context.current.revision) rejectWrite()
  if (!Number.isInteger(fields.candidateRevision) || fields.candidateRevision !== context.expectedRevision) rejectWrite()
  if (fields.candidateRevision !== fields.claimRevision + 1) rejectWrite()
  if (typeof fields.recordIdentityHash !== 'string' || !HASH_PATTERN.test(fields.recordIdentityHash)) rejectWrite()

  const record = entry.record
  if (record.state !== 'SAVED') rejectWrite()
  if (fields.recordIdentityHash !== identityHashOf(record)) rejectWrite()
  if (!sameImmutable(record, birth.record)) rejectWrite()

  const artifact = fields.artifact
  if (typeof artifact.identityHash !== 'string' || !HASH_PATTERN.test(artifact.identityHash)) rejectWrite()
  if (typeof artifact.byteSha256 !== 'string' || !HASH_PATTERN.test(artifact.byteSha256)) rejectWrite()
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 44) rejectWrite()
  if (artifact.byteLength > 1048576) rejectWrite()
  if (typeof artifact.requestKey !== 'string' || !OWNER_KEY_PATTERN.test(artifact.requestKey)) rejectWrite()
  if (record.outputArtifactRef !== artifact.artifactRef) rejectWrite()
  const rights = artifact.rights
  if (!isPlainObject(rights) || keySurface(rights, OWNER_RIGHTS_KEYS) !== 'ok') rejectWrite()
  if (proofDataField(rights, 'state') !== 'GRANTED') rejectWrite()
  const proofRef = proofDataField(rights, 'proofRef')
  if (typeof proofRef !== 'string' || !OWNER_PROOF_PATTERN.test(proofRef)) rejectWrite()
  const expiresMs = Date.parse(artifact.expiresAt)
  if (!Number.isFinite(expiresMs) || new Date(expiresMs).toISOString() !== artifact.expiresAt) rejectWrite()
  if (expiresMs <= evaluatedMs) rejectWrite()
  return fields
}

/** Only the facts that require the actual fresh library entry remain after the local gate. */
function validateSaveArtifact(fields, actual) {
  if (!actual) rejectWrite()
  const artifact = fields.artifact
  if (artifact.artifactRef !== actual.artifactRef) rejectWrite()
  if (artifact.identityHash !== actual.identityHash) rejectWrite()
  if (artifact.byteSha256 !== actual.byteSha256) rejectWrite()
  if (artifact.byteLength !== actual.byteLength) rejectWrite()
  if (artifact.expiresAt !== actual.expiresAt) rejectWrite()
  if (artifact.requestKey !== actual.requestKey) rejectWrite()
  if (stableStringify(artifact.rights) !== stableStringify(actual.rights)) rejectWrite()
  if (stableStringify(artifact.inspection) !== stableStringify(actual.inspection)) rejectWrite()
  return true
}

/** The fresh STORED artifact a proof must bind to; an unusable library read is never a proof pass. */
function freshSaveArtifact(state, entry, evaluatedAt) {
  const read = readStoredForSave(getArtifactState(state.sandbox), {
    scopeId: entry.scopeId,
    artifactRef: entry.record.outputArtifactRef,
    now: evaluatedAt,
  })
  if (!read || read.ok !== true) {
    if (read && read.errorKey === 'LIBRARY_UNKNOWN') raiseStore('SAVE_ARTIFACT_UNKNOWN', '$')
    raiseStore('SAVE_ARTIFACT_REJECTED', '$')
  }
  if (!read.value || read.value.state !== 'STORED' || !read.value.artifact) rejectWrite()
  return read.value.artifact
}

/* ------------------------------------- the two fixed files ------------------------------------ */

const CATALOG_SPEC = Object.freeze({
  name: CATALOG_FILE_NAME,
  maxBytes: MAX_CATALOG_BYTES,
  maxEntries: MAX_CATALOG_ENTRIES,
  parse: (bytes) => parseCatalogSnapshot(bytes),
})

const OWNER_SPEC = Object.freeze({
  name: OWNER_FILE_NAME,
  maxBytes: MAX_OWNER_BYTES,
  maxEntries: MAX_OWNER_ENTRIES,
  associations: true,
  parse: (bytes) => parseOwnerSnapshot(bytes),
})

function unknownKeyFor(domain) {
  if (domain === STORE_DOMAINS.OWNER) return 'OWNER_UNKNOWN'
  if (domain === STORE_DOMAINS.CATALOG) return 'CATALOG_UNKNOWN'
  // Illegal internal kind/domain: no read, no write, no caller parser. A fixed internal failure is
  // raised before any capability or file work, so no third file can be addressed.
  raiseStore('INTERNAL_FAILURE', '$')
}

/** The one fixed catalog file. `domain` only selects the caller module's fixed error domain. */
export function openCatalogFile(state, domain) {
  return openStoreFile(state, CATALOG_SPEC, unknownKeyFor(domain))
}

/** The one fixed owner file. It always reports in the owner error domain. */
export function openOwnerFile(state) {
  return openStoreFile(state, OWNER_SPEC, 'OWNER_UNKNOWN')
}

/**
 * One fixed store file over a shared capability state.
 * All reads re-validate the capability; the confirmed digest is tracked per file.
 */
function openStoreFile(state, spec, unknownKey) {
  const target = () => path.join(state.sandbox.root, spec.name)
  const file = fileState(state, spec.name)

  function readRaw() {
    checkSandbox(state)
    return readBoundedPath(state, target(), spec.maxBytes, {
      failKey: 'STORE_INVALID',
      sizeKey: 'RESOURCE_LIMIT',
      closeKey: 'SANDBOX_INVALID',
      allowMissing: true,
    })
  }

  function finishRead(identity) {
    try {
      checkSandbox(state)
      if (identity) {
        const stat = fs.lstatSync(target())
        if (!stat.isFile() || stat.isSymbolicLink() || !sameIdentity(stat, identity)) throw new Error('identity')
      } else {
        try {
          fs.lstatSync(target())
          throw new Error('appeared')
        } catch (error) {
          if (!error || error.code !== 'ENOENT') throw error
        }
      }
    } catch {
      lockStore(state)
      raiseStore('WRITE_UNKNOWN', '$')
    }
  }

  function read() {
    if (state.locked) raiseStore(unknownKey, '$')
    let raw
    try {
      raw = readRaw()
    } catch (error) {
      if (
        file.confirmedDigest !== undefined &&
        error instanceof StoreFailure &&
        (error.key === 'STORE_INVALID' || error.key === 'RESOURCE_LIMIT')
      ) {
        lockStore(state)
      }
      throw error
    }

    if (raw.missing) {
      if (file.confirmedDigest === undefined) file.confirmedDigest = null
      if (file.confirmedDigest !== null) {
        lockStore(state)
        raiseStore('STORE_CHANGED', '$')
      }
      finishRead(null)
      return { revision: 0, entries: [], digest: null, missing: true, schemaVersion: 1, snapshot: { schemaVersion: 1, revision: 0, entries: [] } }
    }

    let parsed = null
    let parseError = null
    try {
      parsed = spec.parse(raw.bytes)
    } catch (error) {
      parseError = error
    }

    if (file.confirmedDigest === undefined) {
      if (parseError) throw parseError
      file.confirmedDigest = raw.digest
      finishRead(raw.identity)
      return { revision: parsed.revision, entries: parsed.entries, digest: raw.digest, missing: false, schemaVersion: parsed.schemaVersion, snapshot: parsed }
    }

    if (file.confirmedDigest === raw.digest) {
      if (parseError) throw parseError
      finishRead(raw.identity)
      return { revision: parsed.revision, entries: parsed.entries, digest: raw.digest, missing: false, schemaVersion: parsed.schemaVersion, snapshot: parsed }
    }

    lockStore(state)
    if (parseError) throw parseError
    raiseStore('STORE_CHANGED', '$')
  }

  function readVerified(baseDigest) {
    let raw
    try {
      raw = readRaw()
    } catch (error) {
      if (error instanceof StoreFailure && (error.key === 'STORE_INVALID' || error.key === 'RESOURCE_LIMIT')) {
        lockStore(state)
      }
      throw error
    }
    if (raw.missing) {
      if (baseDigest !== null) {
        lockStore(state)
        raiseStore('STORE_CHANGED', '$')
      }
      return { missing: true, revision: 0, entries: [], digest: null, schemaVersion: 1, snapshot: { schemaVersion: 1, revision: 0, entries: [] } }
    }
    let parsed
    try {
      parsed = spec.parse(raw.bytes)
    } catch (error) {
      lockStore(state)
      throw error
    }
    if (raw.digest !== baseDigest) {
      lockStore(state)
      raiseStore('STORE_CHANGED', '$')
    }
    return { missing: false, revision: parsed.revision, entries: parsed.entries, digest: raw.digest, schemaVersion: parsed.schemaVersion, snapshot: parsed }
  }

  const associationsGate = (snapshot) => {
    if (spec.associations === true) return verifyOwnerAssociations(state, snapshot)
    return null
  }

  function write(bytes, baseDigest, expectedRevision, proof = null) {
    if (bytes.length > spec.maxBytes) raiseStore('RESOURCE_LIMIT', '$')

    checkSandbox(state)
    const root = state.sandbox.root
    const fileTarget = target()

    const current = readVerified(baseDigest)
    associationsGate(current.snapshot)
    // Plan 08-E-C: the mandatory delta rule is decided on the exact candidate bytes before any temp
    // file exists, so a bad proof/record/candidate is a plain WRITE_REJECTED with no lock and no
    // side effect. The full proof binding is re-checked against fresh data at the pre-rename gate.
    const plan = spec.associations === true ? planOwnerDelta(spec, current, bytes, expectedRevision, proof) : null

    const tempName = spec.name.replace(/\.json$/, '') + '.' + crypto.randomBytes(16).toString('hex') + '.tmp'
    const tempPath = path.join(root, tempName)
    let fd = null
    let tempIdentity = null
    let renameAttempted = false
    let cleanupAttempted = false
    let cleanupBlocked = false
    let lastCleanupStatus = null
    const attemptCleanup = () => {
      if (cleanupAttempted) return lastCleanupStatus
      cleanupAttempted = true
      if (tempIdentity === null) {
        lastCleanupStatus = 'not-owned'
        return lastCleanupStatus
      }
      const status = cleanupOwnTemp(state, tempPath, tempIdentity)
      lastCleanupStatus = status
      if (status !== 'unlinked') cleanupBlocked = true
      return status
    }
    const blockCleanup = () => {
      cleanupAttempted = true
      cleanupBlocked = true
      lastCleanupStatus = 'blocked'
    }
    try {
      try {
        fd = fs.openSync(tempPath, 'wx', 0o600)
      } catch {
        raiseStore('WRITE_REJECTED', '$')
      }
      try {
        const opened = fs.fstatSync(fd)
        assertRegularStat(opened, 'WRITE_REJECTED')
        tempIdentity = { dev: opened.dev, ino: opened.ino }
        let offset = 0
        while (offset < bytes.length) {
          let written
          try {
            written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset)
          } catch {
            raiseStore('WRITE_REJECTED', '$')
          }
          if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
            raiseStore('WRITE_REJECTED', '$')
          }
          offset += written
        }
        fs.fsyncSync(fd)
        const closing = fd
        fd = null
        try {
          fs.closeSync(closing)
        } catch {
          raiseStore('WRITE_REJECTED', '$')
        }
      } catch (error) {
        if (fd !== null) {
          try {
            fs.closeSync(fd)
          } catch {
            // pre-commit close failure keeps the WRITE_REJECTED classification
          }
          fd = null
        }
        try {
          checkSandbox(state)
        } catch (sandboxError) {
          blockCleanup()
          throw sandboxError
        }
        const cleanupStatus = attemptCleanup()
        if (
          cleanupStatus === 'blocked' &&
          (!(error instanceof StoreFailure) || error.key === 'WRITE_REJECTED')
        ) {
          raiseStore('SANDBOX_INVALID', '$')
        }
        if (error instanceof StoreFailure) throw error
        raiseStore('WRITE_REJECTED', '$')
      }

      let tempRead
      try {
        tempRead = readBoundedPath(state, tempPath, spec.maxBytes, {
          failKey: 'STORE_INVALID',
          sizeKey: 'RESOURCE_LIMIT',
          closeKey: 'WRITE_REJECTED',
        })
      } catch (error) {
        try {
          checkSandbox(state)
        } catch (sandboxError) {
          blockCleanup()
          throw sandboxError
        }
        const cleanupStatus = attemptCleanup()
        if (cleanupStatus === 'blocked' && error instanceof StoreFailure && error.key === 'WRITE_REJECTED') {
          raiseStore('SANDBOX_INVALID', '$')
        }
        if (error instanceof StoreFailure && error.key === 'WRITE_REJECTED') throw error
        lockStore(state)
        raiseStore('STORE_CHANGED', '$')
      }
      if (
        !sameIdentity(tempRead.identity, tempIdentity) ||
        tempRead.bytes.length !== bytes.length ||
        !tempRead.bytes.equals(bytes)
      ) {
        blockCleanup()
        lockStore(state)
        raiseStore('STORE_CHANGED', '$')
      }

      try {
        readVerified(baseDigest)
      } catch (error) {
        try {
          checkSandbox(state)
        } catch {
          blockCleanup()
          throw error
        }
        attemptCleanup()
        throw error
      }

      // Pre-rename gate: the exact bytes about to be committed are parsed, the current owner
      // snapshot and the latest birth registry are read again, and a SAVED delta re-reads the
      // artifact pack so the proof is bound once more against fresh data. A Task change between
      // the temp fsync and the rename stops the commit here, so confirmed bytes stay on disk.
      let preParse
      try {
        preParse = spec.parse(bytes)
      } catch {
        attemptCleanup()
        rejectWrite()
      }
      const preCurrent = readVerified(baseDigest)
      const preCatalog = associationsGate(preParse)
      if (plan && plan.savedEntry !== null) {
        const preEntry = preParse.entries.find((entry) => ownerEntryKey(entry) === ownerEntryKey(plan.savedEntry))
        if (!preEntry) rejectWrite()
        const birth = preCatalog.entries.find(
          (item) => item.scopeId === preEntry.scopeId && item.record.taskId === preEntry.taskId,
        )
        if (!birth) raiseStore('BIRTH_INVALID', '$')
        const preFields = validateSaveProofLocal(proof, {
          entry: preEntry,
          birth,
          current: preCurrent,
          baseDigest,
          expectedRevision,
        })
        const artifact = freshSaveArtifact(state, preEntry, preFields.evaluatedAt)
        validateSaveArtifact(preFields, artifact)
      }

      renameAttempted = true
      try {
        fs.renameSync(tempPath, fileTarget)
      } catch {
        lockStore(state)
        raiseStore('WRITE_UNKNOWN', '$')
      }

      try {
        checkSandbox(state)
        const targetStat = fs.lstatSync(fileTarget)
        assertRegularStat(targetStat, 'STORE_INVALID')
        if (!sameIdentity(targetStat, tempIdentity)) raiseStore('STORE_INVALID', '$')
        const readBack = readBoundedPath(state, fileTarget, spec.maxBytes, {
          failKey: 'STORE_INVALID',
          sizeKey: 'RESOURCE_LIMIT',
        })
        if (readBack.missing || !sameIdentity(readBack.identity, tempIdentity)) raiseStore('STORE_INVALID', '$')
        if (!readBack.bytes.equals(bytes)) raiseStore('STORE_INVALID', '$')
        const verified = spec.parse(readBack.bytes)
        if (verified.revision !== expectedRevision) raiseStore('STORE_INVALID', '$')
        // Post-rename association gate: after the real rename the birth association is re-checked
        // against freshly read bytes. A failure here is a storage-unknown outcome, never a made-up
        // rollback: the actual FINAL bytes stay untouched and the capability stays locked.
        const postCatalog = associationsGate(verified)
        if (plan && plan.savedEntry !== null) {
          const postEntry = verified.entries.find((entry) => ownerEntryKey(entry) === ownerEntryKey(plan.savedEntry))
          if (!postEntry) rejectWrite()
          const birth = postCatalog.entries.find(
            (item) => item.scopeId === postEntry.scopeId && item.record.taskId === postEntry.taskId,
          )
          if (!birth) raiseStore('BIRTH_INVALID', '$')
          const postFields = validateSaveProofLocal(proof, {
            entry: postEntry,
            birth,
            current: { revision: expectedRevision - 1 },
            baseDigest,
            expectedRevision,
          })
          const artifact = freshSaveArtifact(state, postEntry, postFields.evaluatedAt)
          validateSaveArtifact(postFields, artifact)
        }
        checkSandbox(state)
        file.confirmedDigest = sha256(bytes)
        return verified.revision
      } catch {
        lockStore(state)
        raiseStore('WRITE_UNKNOWN', '$')
      }
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd)
        } catch {
          // ignore close failure after a classified result
        }
      }
      if (!renameAttempted) attemptCleanup()
    }
  }

  return { name: spec.name, read, readVerified, write }
}

function tempCleanupAllowed(state, tempPath, tempIdentity) {
  if (!tempIdentity) return 'not-owned'
  try {
    checkSandbox(state)
  } catch {
    return 'blocked'
  }
  try {
    const stat = fs.lstatSync(tempPath)
    if (!stat.isFile() || stat.isSymbolicLink()) return 'not-owned'
    if (typeof stat.nlink === 'number' && stat.nlink > 1) return 'not-owned'
    if (!sameIdentity(stat, tempIdentity)) return 'not-owned'
    const real = fs.realpathSync(tempPath)
    if (!isInside(state.sandbox.root, real)) return 'not-owned'
    return 'ok'
  } catch {
    return 'blocked'
  }
}

function cleanupOwnTemp(state, tempPath, tempIdentity) {
  const status = tempCleanupAllowed(state, tempPath, tempIdentity)
  if (status !== 'ok') return status
  try {
    fs.unlinkSync(tempPath)
    return 'unlinked'
  } catch {
    return 'failed'
  }
}

/**
 * Read every immutable birth entry from the one fixed catalog file, server-side only.
 * `domain` is the caller module's fixed error domain (`catalog` or `owner`).
 */
export function readCatalogEntries(state, domain) {
  return openCatalogFile(state, domain).read()
}

export function readBirthRecord(state, domain, scopeId, taskId) {
  const catalog = readCatalogEntries(state, domain)
  const entry = catalog.entries.find((item) => item.scopeId === scopeId && item.record.taskId === taskId)
  return entry || null
}

export {
  CATALOG_SCHEMA_VERSION,
  INITIAL_STATES,
  TASK_ID_PATTERN,
  SCOPE_PATTERN,
  KEY_PATTERN,
  OWNER_SNAPSHOT_SCHEMA_VERSION,
  OWNER_NO_EXECUTION_REASONS,
  OWNER_SIMULATED_STATES,
}

