/**
 * Cover store — the durable v3 snapshots for the offline Cover chain.
 *
 * File selection follows contract §15.1: a fresh sandbox writes the v3 snapshot directly to the
 * legacy catalog/owner filename; an existing v3 file there is read/written in place; a legacy v1/v2
 * snapshot makes the store fall back to the dedicated `audio-cover-catalog-v3.json` /
 * `audio-cover-owner-v3.json` files so the old writer is never rewritten. All variants use the same
 * durability rules (bounded read, strict JSON, single temp+fsync+rename, digest check).
 *
 * Pure schedule: one serial tail per sandbox capability; any unknown outcome locks the capability.
 */
import fs from 'node:fs'
import path from 'node:path'

import { sha256, stableStringify, checkSandbox } from './fixture-store-base-internal.mjs'
import { identityHashOf } from './fixture-task-store-internal.mjs'
import { COVER_INTENT_KEYS, intentHashOf } from './cover-intent-internal.mjs'

export const COVER_CATALOG_FILE = 'audio-cover-catalog-v3.json'
export const COVER_OWNER_FILE = 'audio-cover-owner-v3.json'
export const LEGACY_CATALOG_FILE = 'audio-task-catalog-v1.json'
export const LEGACY_OWNER_FILE = 'audio-task-owner-v1.json'
export const COVER_STORE_MAX_BYTES = 128 * 1024
export const COVER_STORE_MAX_ENTRIES = 32
export const COVER_STORE_SCHEMA_VERSION = 3

export const COVER_STORE_CODES = Object.freeze({
  STORE_INVALID: 'COVER_STORE_INVALID',
  STORE_CHANGED: 'COVER_STORE_CHANGED',
  WRITE_REJECTED: 'COVER_WRITE_REJECTED',
  WRITE_UNKNOWN: 'COVER_WRITE_UNKNOWN',
  RESOURCE_LIMIT: 'COVER_STORE_RESOURCE_LIMIT',
  SANDBOX_INVALID: 'COVER_SANDBOX_INVALID',
  COVER_UNKNOWN: 'COVER_STORE_UNKNOWN',
  NOT_FOUND: 'COVER_NOT_FOUND',
})

export class CoverStoreFailure extends Error {
  constructor(key, errorPath) {
    super(key)
    this.name = 'CoverStoreFailure'
    this.key = key
    this.path = errorPath
  }
}

const STATES = new WeakMap()

/* --------------------------------------------- validation ---------------------------------- */

const COVER_ENTRY_KEYS = ['createdAt', 'entryVersion', 'idempotencyKey', 'identityHash', 'intent', 'intentHash', 'kind', 'record', 'scopeId']
const OWNER_ENTRY_KEYS = ['attempt', 'birthIdentityHash', 'cancel', 'checkpoints', 'completion', 'entryVersion', 'intent', 'intentHash', 'kind', 'manifest', 'phase', 'record', 'scopeId', 'taskId']
const ATTEMPT_KEYS = ['attemptId', 'attemptSeq', 'error', 'finishedAt', 'lease', 'requestKey', 'startedAt', 'status']
const LEASE_KEYS = ['acquiredAt', 'gpu', 'kind', 'leaseId', 'releasedAt']
const CHECKPOINT_KEYS = ['at', 'importReceipt', 'index', 'stage', 'status', 'tempSummary']
const RECEIPT_KEYS = ['artifactRef', 'byteLength', 'byteSha256', 'expiresAt', 'requestKey']
const CANCEL_KEYS = ['acknowledgedAt', 'confirmedAt', 'reason', 'requested', 'requestedAt']
const MANIFEST_KEYS = ['converted', 'instrumental', 'master', 'source', 'verification', 'vocal']
const RECORD_KEYS = [
  'cancel', 'delivery', 'deliveryRequested', 'feature', 'lastError', 'mockOnly', 'observedAt', 'outputArtifactRef',
  'realOperationAllowed', 'rights', 'schemaVersion', 'source', 'state', 'taskId', 'taskType', 'voiceProfileId',
]
const PHASES = new Set(['CLAIMED', 'FINAL'])
const COMPLETIONS = new Set(['SAVED', 'CANCELLED', 'FAILED'])
const OWNER_STATES = new Set(['CREATED', 'CANCELLED', 'FAILED', 'SAVED'])

function exactKeys(value, keys) {
  if (!isPlainObject(value)) return false
  const actual = Object.keys(value).sort().join(',')
  return actual === keys.slice().sort().join(',')
}

function isIso(value) {
  if (typeof value !== 'string') return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString() === value
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function validRecord(record, taskId) {
  if (!exactKeys(record, RECORD_KEYS)) return false
  if (record.schemaVersion !== 1 || record.taskId !== taskId || record.deliveryRequested !== false) return false
  if (record.mockOnly !== true || record.realOperationAllowed !== false) return false
  return true
}

function validCheckpoint(checkpoint) {
  if (!exactKeys(checkpoint, CHECKPOINT_KEYS)) return false
  if (!Number.isInteger(checkpoint.index) || checkpoint.index < 0 || checkpoint.index > 5) return false
  if (typeof checkpoint.stage !== 'string' || checkpoint.status !== 'DONE' || !isIso(checkpoint.at)) return false
  if (checkpoint.tempSummary !== null) {
    if (!exactKeys(checkpoint.tempSummary, ['byteLength', 'byteSha256', 'role'])) return false
    if (!isSha256(checkpoint.tempSummary.byteSha256) || !Number.isInteger(checkpoint.tempSummary.byteLength)) return false
  }
  if (checkpoint.importReceipt !== null) {
    if (!exactKeys(checkpoint.importReceipt, RECEIPT_KEYS)) return false
    if (!isSha256(checkpoint.importReceipt.byteSha256) || typeof checkpoint.importReceipt.artifactRef !== 'string') return false
    if (typeof checkpoint.importReceipt.requestKey !== 'string' || !isIso(checkpoint.importReceipt.expiresAt)) return false
    if (!Number.isInteger(checkpoint.importReceipt.byteLength) || checkpoint.importReceipt.byteLength < 1) return false
  }
  return true
}

function parentLink(object, role, hash) {
  return Array.isArray(object.parentLinks) && object.parentLinks.some((link) => link.role === role && link.byteSha256 === hash)
}

/**
 * Full lineage proof for a receipted Cover entry (contract §7.5–7.8). Any mismatch between the
 * Intent source identity, the manifest stages, the MASTER inspection and the checkpoint[4] receipt
 * invalidates the entry; there is no partial acceptance.
 */
export function validateCoverLineage(entry) {
  const intent = entry.intent
  const manifest = entry.manifest
  if (!isPlainObject(intent) || !isPlainObject(manifest)) return false
  const source = manifest.source
  const converted = manifest.converted
  const master = manifest.master
  if (!isPlainObject(source) || !isPlainObject(converted) || !isPlainObject(master)) return false
  const sourceHash = source.byteSha256
  const vocalHash = manifest.vocal ? manifest.vocal.byteSha256 : null
  const instrumentalHash = manifest.instrumental ? manifest.instrumental.byteSha256 : null
  if (source.role !== 'SOURCE' || source.taskId !== entry.taskId || source.scopeId !== entry.scopeId) return false
  if (source.intentHash !== entry.intentHash || source.attemptId !== entry.attempt.attemptId) return false
  if (sourceHash !== intent.sourceByteSha256 || source.byteLength !== intent.sourceByteLength) return false
  if (source.rootSourceSha256 !== intent.sourceByteSha256 || source.rootSourceIdentityHash !== intent.sourceEntryIdentityHash) return false
  if (!isPlainObject(source.rights) || source.rights.state !== 'GRANTED' || source.rights.proofRef !== intent.rightsProofRef) return false
  if (source.expiresAt !== intent.rightsExpiresAt || !isPlainObject(source.inspection)) return false
  if (source.inspection.sha256 !== sourceHash || source.inspection.byteLength !== source.byteLength) return false
  if (manifest.vocal) {
    if (manifest.vocal.role !== 'VOCAL' || !parentLink(manifest.vocal, 'SOURCE', sourceHash)) return false
  }
  if (manifest.instrumental) {
    if (manifest.instrumental.role !== 'INSTRUMENTAL' || !parentLink(manifest.instrumental, 'SOURCE', sourceHash)) return false
  }
  if (converted.role !== 'CONVERTED_VOCAL' || !parentLink(converted, 'SOURCE', vocalHash || sourceHash)) return false
  if (master.role !== 'MASTER' || master.taskId !== entry.taskId || master.scopeId !== entry.scopeId) return false
  if (master.intentHash !== entry.intentHash || master.attemptId !== entry.attempt.attemptId) return false
  if (!parentLink(master, 'CONVERTED_VOCAL', converted.byteSha256)) return false
  if (instrumentalHash === null) {
    if (master.parentLinks.some((link) => link.role === 'INSTRUMENTAL')) return false
  } else if (!parentLink(master, 'INSTRUMENTAL', instrumentalHash)) return false
  if (master.parentLinks.length !== (instrumentalHash === null ? 1 : 2)) return false
  if (master.rootSourceSha256 !== intent.sourceByteSha256 || master.rootSourceIdentityHash !== intent.sourceEntryIdentityHash) return false
  if (!isPlainObject(master.inspection) || master.inspection.sha256 !== master.byteSha256 || master.inspection.byteLength !== master.byteLength) return false
  if (master.expiresAt !== intent.rightsExpiresAt || !isPlainObject(master.rights)) return false
  if (master.rights.state !== 'GRANTED' || master.rights.proofRef !== intent.rightsProofRef) return false
  if (master.modelRevision !== intent.modelRevision || master.profileRevision !== intent.profileRevision) return false
  if (master.backendRevision !== intent.backendRevision) return false
  const receiptCheckpoint = (entry.checkpoints || []).find((checkpoint) => checkpoint.index === 4 && checkpoint.importReceipt)
  if (!receiptCheckpoint) return false
  const receipt = receiptCheckpoint.importReceipt
  if (receipt.requestKey !== 'import:cover-master:' + entry.attempt.attemptId.slice(-16)) return false
  if (receipt.byteSha256 !== master.byteSha256 || receipt.byteLength !== master.byteLength) return false
  if (receipt.expiresAt !== intent.rightsExpiresAt) return false
  return typeof receipt.artifactRef === 'string'
}

function validOwnerCoverEntry(entry) {
  if (!exactKeys(entry, OWNER_ENTRY_KEYS)) return false
  if (entry.entryVersion !== 1 || entry.kind !== 'COVER') return false
  if (typeof entry.scopeId !== 'string' || typeof entry.taskId !== 'string') return false
  if (!PHASES.has(entry.phase) || !isSha256(entry.birthIdentityHash)) return false
  if (!isPlainObject(entry.intent) || Object.keys(entry.intent).sort().join(',') !== [...COVER_INTENT_KEYS].sort().join(',')) return false
  if (entry.intent.taskId !== entry.taskId || entry.intent.scopeId !== entry.scopeId) return false
  if (!isSha256(entry.intentHash) || intentHashOf(entry.intent) !== entry.intentHash) return false
  if (!validRecord(entry.record, entry.taskId)) return false
  if (!exactKeys(entry.attempt, ATTEMPT_KEYS)) return false
  if (typeof entry.attempt.attemptId !== 'string' || !/^cover-attempt:[0-9a-f]{32}$/.test(entry.attempt.attemptId)) return false
  if (entry.attempt.attemptSeq !== 1 || typeof entry.attempt.requestKey !== 'string') return false
  if (entry.attempt.status !== 'RUNNING' && entry.attempt.status !== 'SAVED' && entry.attempt.status !== 'CANCELLED' && entry.attempt.status !== 'FAILED') return false
  if (!isIso(entry.attempt.startedAt)) return false
  if (entry.attempt.lease !== null) {
    if (!exactKeys(entry.attempt.lease, LEASE_KEYS)) return false
    if (typeof entry.attempt.lease.leaseId !== 'string' || entry.attempt.lease.kind !== 'LOGICAL_FIXTURE') return false
    if (entry.attempt.lease.gpu !== 'EXCLUSIVE' && entry.attempt.lease.gpu !== 'NONE') return false
    if (!isIso(entry.attempt.lease.acquiredAt)) return false
    if (entry.attempt.lease.releasedAt !== null && !isIso(entry.attempt.lease.releasedAt)) return false
  }
  if (!Array.isArray(entry.checkpoints) || entry.checkpoints.length < 1 || entry.checkpoints.length > 6) return false
  const indices = new Set()
  for (const checkpoint of entry.checkpoints) {
    if (!validCheckpoint(checkpoint)) return false
    if (indices.has(checkpoint.index)) return false
    indices.add(checkpoint.index)
  }
  if (!exactKeys(entry.manifest, MANIFEST_KEYS)) return false
  if (!exactKeys(entry.cancel, CANCEL_KEYS)) return false

  if (entry.phase === 'CLAIMED') {
    if (entry.completion !== null || entry.attempt.status !== 'RUNNING') return false
    if (entry.attempt.finishedAt !== null) return false
    if (entry.attempt.lease !== null && entry.attempt.lease.releasedAt !== null) return false
    // A claim before any stage has an all-null manifest; once the source is known it must match the
    // Intent exactly, and once the MASTER receipt exists the complete lineage must verify.
    if (entry.manifest.source !== null) {
      if (!isPlainObject(entry.manifest.source) || entry.manifest.source.byteSha256 !== entry.intent.sourceByteSha256) return false
      if (entry.manifest.source.byteLength !== entry.intent.sourceByteLength) return false
    }
    if (entry.manifest.master !== null) return validateCoverLineage(entry)
    return true
  }
  if (!exactKeys(entry.completion, ['kind', 'reason'])) return false
  if (!COMPLETIONS.has(entry.completion.kind)) return false
  if (entry.attempt.status !== entry.completion.kind || !isIso(entry.attempt.finishedAt)) return false
  if (entry.attempt.lease !== null && !isIso(entry.attempt.lease.releasedAt)) return false
  if (entry.manifest.master !== null && !validateCoverLineage(entry)) return false
  if (entry.completion.kind === 'SAVED') {
    if (entry.record.state !== 'SAVED' || typeof entry.record.outputArtifactRef !== 'string') return false
    const receipt = entry.checkpoints.find((checkpoint) => checkpoint.index === 4 && checkpoint.importReceipt !== null)
    if (!receipt || !entry.manifest.master) return false
    if (receipt.importReceipt.artifactRef !== entry.record.outputArtifactRef) return false
    if (entry.manifest.master.availability !== 'STORED') return false
    return true
  }
  if (entry.record.state !== entry.completion.kind) return false
  return true
}

function validLegacyOwnerEntry(entry) {
  if (!exactKeys(entry, ['birthIdentityHash', 'completion', 'phase', 'record', 'scopeId', 'taskId'])) return false
  if (!PHASES.has(entry.phase) || !isPlainObject(entry.record)) return false
  if (entry.phase === 'CLAIMED') return entry.completion === null
  return isPlainObject(entry.completion) && typeof entry.completion.kind === 'string'
}

function validCatalogEntry(entry) {
  if (!isPlainObject(entry) || typeof entry.scopeId !== 'string' || typeof entry.idempotencyKey !== 'string') return false
  if (entry.kind === 'COVER') {
    if (!exactKeys(entry, COVER_ENTRY_KEYS) || entry.entryVersion !== 1) return false
    if (!isSha256(entry.identityHash) || identityHashOf(entry.record) !== entry.identityHash) return false
    if (!isPlainObject(entry.intent) || Object.keys(entry.intent).sort().join(',') !== [...COVER_INTENT_KEYS].sort().join(',')) return false
    if (!isSha256(entry.intentHash) || intentHashOf(entry.intent) !== entry.intentHash) return false
    if (!isPlainObject(entry.record) || entry.record.deliveryRequested !== false) return false
    return isIso(entry.createdAt)
  }
  if (entry.kind !== undefined) return false
  if (!exactKeys(entry, ['identityHash', 'idempotencyKey', 'record', 'scopeId'])) return false
  return isSha256(entry.identityHash) && identityHashOf(entry.record) === entry.identityHash
}

function probeLegacySnapshot(state, kind) {
  const name = kind === 'owner' ? LEGACY_OWNER_FILE : LEGACY_CATALOG_FILE
  const target = path.join(state.sandbox.root, name)
  let stat
  try {
    stat = fs.lstatSync(target)
  } catch (error) {
    if (error && error.code === 'ENOENT') return { missing: true }
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (!stat.isFile() || stat.isSymbolicLink()) raise(COVER_STORE_CODES.STORE_INVALID, '$')
  if (stat.size > COVER_STORE_MAX_BYTES) raise(COVER_STORE_CODES.RESOURCE_LIMIT, '$')
  let bytes
  try {
    bytes = fs.readFileSync(target)
  } catch {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (bytes.length > COVER_STORE_MAX_BYTES) raise(COVER_STORE_CODES.RESOURCE_LIMIT, '$')
  let parsed
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (!isPlainObject(parsed) || !Number.isInteger(parsed.revision) || parsed.revision < 0 || !Array.isArray(parsed.entries)) {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (parsed.schemaVersion === COVER_STORE_SCHEMA_VERSION) {
    for (const entry of parsed.entries) {
      if (kind === 'owner' ? !(entry.kind === 'COVER' ? validOwnerCoverEntry(entry) : validLegacyOwnerEntry(entry)) : !validCatalogEntry(entry)) {
        raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
      }
    }
    return { v3: true }
  }
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) raise(COVER_STORE_CODES.STORE_INVALID, 'schemaVersion')
  for (const entry of parsed.entries) {
    if (!isPlainObject(entry) || typeof entry.scopeId !== 'string') raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    if (kind === 'owner') {
      if (typeof entry.taskId !== 'string' || (entry.phase !== 'CLAIMED' && entry.phase !== 'FINAL')) {
        raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
      }
    } else if (typeof entry.idempotencyKey !== 'string') {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
  }
  return { v3: false }
}

/** One serialised cover-store state per trusted sandbox capability. */
/**
 * Resolve which file carries the Cover v3 snapshot. The legacy filename is used when it is absent or
 * already holds a valid v3 snapshot; a valid known v1/v2 snapshot forces the dedicated fallback. A
 * damaged, oversized, symlinked or unknown-version legacy file fails closed instead of being silently
 * treated as a fallback (contract §15.1 / 104-R04).
 */
export function resolveCoverFile(state, kind) {
  checkSandbox(state)
  const legacyName = kind === 'owner' ? LEGACY_OWNER_FILE : LEGACY_CATALOG_FILE
  const dedicatedName = kind === 'owner' ? COVER_OWNER_FILE : COVER_CATALOG_FILE
  const dedicatedPath = path.join(state.sandbox.root, dedicatedName)
  const probe = probeLegacySnapshot(state, kind)
  if (probe.missing) {
    try {
      return fs.lstatSync(dedicatedPath).isFile() ? dedicatedName : legacyName
    } catch {
      return legacyName
    }
  }
  return probe.v3 ? legacyName : dedicatedName
}
export function getCoverState(sandbox) {
  let state = STATES.get(sandbox)
  if (!state) {
    state = { sandbox, tail: Promise.resolve(), locked: false, digests: new Map() }
    STATES.set(sandbox, state)
  }
  return state
}

/** Serialise every cover-store operation for one capability (same tail pattern as the legacy store). */
export function enqueueCover(state, run) {
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

export function lockCoverStore(state) {
  state.locked = true
}

export function isCoverStoreLocked(state) {
  return state.locked === true
}

function filePath(state, name) {
  return path.join(state.sandbox.root, name)
}

function raise(key, errorPath) {
  throw new CoverStoreFailure(key, errorPath)
}

function readBounded(state, name) {
  checkSandbox(state)
  if (state.locked) raise(COVER_STORE_CODES.COVER_UNKNOWN, '$')
  const target = filePath(state, name)
  let stat
  try {
    stat = fs.lstatSync(target)
  } catch (error) {
    if (error && error.code === 'ENOENT') return { missing: true, bytes: null, digest: null }
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (!stat.isFile() || stat.isSymbolicLink()) raise(COVER_STORE_CODES.STORE_INVALID, '$')
  if (stat.size > COVER_STORE_MAX_BYTES) raise(COVER_STORE_CODES.RESOURCE_LIMIT, '$')
  let bytes
  try {
    bytes = fs.readFileSync(target)
  } catch {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (bytes.length > COVER_STORE_MAX_BYTES) raise(COVER_STORE_CODES.RESOURCE_LIMIT, '$')
  return { missing: false, bytes, digest: sha256(bytes) }
}

function parseJson(bytes) {
  let text
  try {
    text = bytes.toString('utf8')
  } catch {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (!Buffer.from(text, 'utf8').equals(bytes)) raise(COVER_STORE_CODES.STORE_INVALID, '$')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  return parsed
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Read the Cover catalog snapshot (`null` when the file does not exist yet). */
export function readCoverCatalog(state) {
  const raw = readBounded(state, resolveCoverFile(state, 'catalog'))
  if (raw.missing) return { snapshot: null, digest: null }
  const parsed = parseJson(raw.bytes)
  if (!isPlainObject(parsed) || parsed.schemaVersion !== COVER_STORE_SCHEMA_VERSION) {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (!Number.isInteger(parsed.revision) || parsed.revision < 0) raise(COVER_STORE_CODES.STORE_INVALID, 'revision')
  if (!Array.isArray(parsed.entries) || parsed.entries.length > COVER_STORE_MAX_ENTRIES) {
    raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
  }
  for (const entry of parsed.entries) {
    if (!validCatalogEntry(entry)) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
  }
  return { snapshot: parsed, digest: raw.digest }
}

/** Read the Cover owner snapshot (`null` when the file does not exist yet). */
export function readCoverOwner(state) {
  const raw = readBounded(state, resolveCoverFile(state, 'owner'))
  if (raw.missing) return { snapshot: null, digest: null }
  const parsed = parseJson(raw.bytes)
  if (!isPlainObject(parsed) || parsed.schemaVersion !== COVER_STORE_SCHEMA_VERSION) {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (!Number.isInteger(parsed.revision) || parsed.revision < 0) raise(COVER_STORE_CODES.STORE_INVALID, 'revision')
  if (!Array.isArray(parsed.entries) || parsed.entries.length > COVER_STORE_MAX_ENTRIES) {
    raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
  }
  for (const entry of parsed.entries) {
    if (!isPlainObject(entry) || typeof entry.scopeId !== 'string' || typeof entry.taskId !== 'string') {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
    if (entry.kind === 'COVER') {
      if (!validOwnerCoverEntry(entry)) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    } else if (!validLegacyOwnerEntry(entry)) {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
  }
  return { snapshot: parsed, digest: raw.digest }
}

function encode(value) {
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (typeof text !== 'string') raise(COVER_STORE_CODES.STORE_INVALID, '$')
  return Buffer.from(text, 'utf8')
}

function writeAtomic(state, name, bytes) {
  const target = filePath(state, name)
  const temp = target + '.tmp-' + process.pid + '-' + Date.now().toString(36)
  let fd = null
  try {
    fd = fs.openSync(temp, 'wx', 0o600)
    fs.writeSync(fd, bytes, 0, bytes.length, 0)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = null
    fs.renameSync(temp, target)
  } catch {
    try {
      if (fd !== null) fs.closeSync(fd)
    } catch {}
    try {
      fs.unlinkSync(temp)
    } catch {}
    lockCoverStore(state)
    raise(COVER_STORE_CODES.WRITE_UNKNOWN, '$')
  }
}

/**
 * Write one Cover snapshot with an explicit base digest and revision policy.
 * `mode: 'increment'` requires `candidate.revision === current.revision + 1`;
 * `mode: 'same'` keeps the current revision and only allows content updates.
 */
function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right)
}

/** Only explicit legal deltas may replace an existing owner entry (contract §7.5–7.8). */
function validateOwnerTransition(before, after) {
  if (!isPlainObject(before) || !isPlainObject(after)) return false
  if (before.kind !== 'COVER') return sameValue(before, after)
  if (after.kind !== 'COVER') return false
  for (const key of ['entryVersion', 'kind', 'scopeId', 'taskId', 'birthIdentityHash', 'intentHash', 'intent']) {
    if (!sameValue(before[key], after[key])) return false
  }
  if (!isPlainObject(before.attempt) || !isPlainObject(after.attempt)) return false
  for (const key of ['attemptId', 'attemptSeq', 'requestKey', 'startedAt']) {
    if (!sameValue(before.attempt[key], after.attempt[key])) return false
  }
  if (before.phase === 'CLAIMED' && after.phase === 'CLAIMED' && !sameValue(before.record, after.record)) return false
  const oldCheckpoints = before.checkpoints || []
  const newCheckpoints = after.checkpoints || []
  if (newCheckpoints.length < oldCheckpoints.length) return false
  for (let i = 0; i < oldCheckpoints.length; i += 1) {
    if (!sameValue(oldCheckpoints[i], newCheckpoints[i])) return false
  }
  for (const key of MANIFEST_KEYS) {
    if (before.manifest[key] !== null && !sameValue(before.manifest[key], after.manifest[key])) return false
  }
  if (before.cancel.requested === true && after.cancel.requested !== true) return false
  if (before.phase === 'FINAL') return false
  return after.phase === 'CLAIMED' || after.phase === 'FINAL'
}

function assertSnapshotDelta(current, candidate, isCatalog) {
  const oldEntries = current.snapshot ? current.snapshot.entries : []
  const newEntries = candidate.entries
  if (newEntries.length !== oldEntries.length && newEntries.length !== oldEntries.length + 1) {
    raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
  }
  let changed = -1
  const compared = Math.min(oldEntries.length, newEntries.length)
  for (let i = 0; i < compared; i += 1) {
    if (sameValue(oldEntries[i], newEntries[i])) continue
    if (isCatalog) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    if (changed !== -1) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    if (!validateOwnerTransition(oldEntries[i], newEntries[i])) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    changed = i
  }
  if (newEntries.length === oldEntries.length + 1) {
    if (changed !== -1) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    if (isCatalog) return
    const appended = newEntries[newEntries.length - 1]
    if (!isPlainObject(appended) || appended.kind !== 'COVER' || appended.phase !== 'CLAIMED') {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
    if (!Array.isArray(appended.checkpoints) || appended.checkpoints.length !== 1) {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
  }
}

export function writeCoverSnapshot(state, name, candidate, options) {
  const mode = options && options.mode === 'same' ? 'same' : 'increment'
  const baseDigest = options ? options.baseDigest : undefined
  if (!isPlainObject(candidate) || candidate.schemaVersion !== COVER_STORE_SCHEMA_VERSION || !Array.isArray(candidate.entries)) {
    raise(COVER_STORE_CODES.STORE_INVALID, '$')
  }
  if (!Number.isInteger(candidate.revision) || candidate.revision < 0) raise(COVER_STORE_CODES.STORE_INVALID, 'revision')
  const isCatalog = name.includes('catalog')
  for (const entry of candidate.entries) {
    if (isCatalog) {
      if (!validCatalogEntry(entry)) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    } else if (entry && entry.kind === 'COVER') {
      if (!isPlainObject(entry) || !validOwnerCoverEntry(entry)) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    } else if (!validLegacyOwnerEntry(entry)) {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
  }
  const current = isCatalog ? readCoverCatalog(state) : readCoverOwner(state)
  const currentDigest = current.digest
  if (baseDigest !== currentDigest) {
    raise(COVER_STORE_CODES.STORE_CHANGED, '$')
  }
  assertSnapshotDelta(current, candidate, isCatalog)
  const expectedRevision = current.snapshot ? current.snapshot.revision : 0
  if (mode === 'increment') {
    if (candidate.revision !== expectedRevision + 1) raise(COVER_STORE_CODES.WRITE_REJECTED, 'revision')
  } else if (candidate.revision !== expectedRevision) {
    raise(COVER_STORE_CODES.WRITE_REJECTED, 'revision')
  }
  if (candidate.entries.length > COVER_STORE_MAX_ENTRIES) raise(COVER_STORE_CODES.RESOURCE_LIMIT, 'entries')
  const bytes = encode(candidate)
  if (bytes.length > COVER_STORE_MAX_BYTES) raise(COVER_STORE_CODES.RESOURCE_LIMIT, '$')
  writeAtomic(state, name, bytes)
  let verify
  try {
    verify = fs.readFileSync(filePath(state, name))
  } catch {
    lockCoverStore(state)
    raise(COVER_STORE_CODES.WRITE_UNKNOWN, '$')
  }
  if (!verify.equals(bytes)) {
    lockCoverStore(state)
    raise(COVER_STORE_CODES.WRITE_UNKNOWN, '$')
  }
  const digest = sha256(verify)
  state.digests.set(name, digest)
  return { digest, revision: candidate.revision, bytes: bytes.length }
}

/** Build an empty v3 catalog snapshot. */
export function emptyCoverCatalog() {
  return { schemaVersion: COVER_STORE_SCHEMA_VERSION, revision: 0, entries: [] }
}

/** Build an empty v3 owner snapshot. */
export function emptyCoverOwner() {
  return { schemaVersion: COVER_STORE_SCHEMA_VERSION, revision: 0, entries: [] }
}

/** True when two snapshots are byte-identical (used by tests and idempotency checks). */
export function sameSnapshot(left, right) {
  return stableStringify(left) === stableStringify(right)
}
