/* Whale Relay Core — Plan 13-A offline unified delivery boundary.
 *
 * This is the first real (offline) owner of delivery persistence. It consumes a *persisted*,
 * already-SAVED Audio Core task and a trusted target descriptor; it never synthesizes audio,
 * resolves a chat from a display name, imports a Sender server, opens a socket, starts a process or
 * sends to WeChat. The only backend is an explicit Fake backend used by tests.
 *
 * Ownership:
 *   - taskId/artifact remain Whale Audio Core facts. A caller-supplied JSON "SAVED record" is never
 *     accepted as proof: the trusted AudioTask owner store (v2) or the Cover owner store (v3) is
 *     re-read here, in the same scope/task/artifact relation, on every ensure and again right before
 *     the Fake backend is asked to accept.
 *   - deliveryId is minted here once and persisted with the task/artifact/target/request digest,
 *     plus a versioned issuance (`intentId` + authority facts) that records which persisted SAVED
 *     relation authorized this delivery. The Cover record freezes `deliveryRequested:false`; for it
 *     the persisted issuance is the versioned authorized handoff, and the frozen record is never
 *     edited.
 *   - backendRequestId is an internal 8-64 [A-Za-z0-9_-] compatibility key; it is never a second
 *     global task id and never derived by truncating a colon id.
 *   - one persistent store, one in-process queue and one token-owned file lock serialize writes.
 *     Every lock path is fenced by "move aside, then verify the moved bytes": a live replacement
 *     lease is restored without overwriting anything, never blindly deleted.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { openFixtureArtifactLibrary } from './artifact-library.mjs'
import { coverStatus } from './cover-executor-internal.mjs'
import { samplesFromWav } from './cover-stage-bytes-internal.mjs'
import { openFixtureTaskOwner } from './task-owner.mjs'

export const RELAY_CORE_SCHEMA_VERSION = 1
export const RELAY_STORE_PREFIX = 'unified-relay-v1.r'
const STORE_REVISION_FILE = /^unified-relay-v1\.r([0-9]+)\.json$/
const STORE_TEMP_FILE = /^unified-relay-v1\.r[0-9]+\.json\.([0-9]+)\.[0-9a-f]+\.tmp$/
const KEEP_REVISIONS = 4
export const RELAY_LOCK_FILE = 'unified-relay-v1.lock'
export const RELAY_STATES = Object.freeze({
  QUEUED: 'QUEUED',
  SUBMITTING: 'SUBMITTING',
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  ACCEPTED: 'ACCEPTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  SENT_LOCAL: 'SENT_LOCAL',
})

export const RELAY_ERRORS = Object.freeze({
  INPUT_INVALID: 'RELAY_CORE_INPUT_INVALID',
  STORE_INVALID: 'RELAY_CORE_STORE_INVALID',
  STORE_BUSY: 'RELAY_CORE_STORE_BUSY',
  CAPACITY: 'RELAY_CORE_CAPACITY',
  CONFLICT: 'RELAY_CORE_CONFLICT',
  NOT_FOUND: 'RELAY_CORE_NOT_FOUND',
  TARGET_REJECTED: 'RELAY_CORE_TARGET_REJECTED',
  ARTIFACT_UNAVAILABLE: 'RELAY_CORE_ARTIFACT_UNAVAILABLE',
  TASK_NOT_SAVED: 'RELAY_CORE_TASK_NOT_SAVED',
  PERMIT_REQUIRED: 'RELAY_CORE_PERMIT_REQUIRED',
  UNSUPPORTED_CAPABILITY: 'RELAY_CORE_UNSUPPORTED_CAPABILITY',
  UNKNOWN_NO_RESEND: 'RELAY_CORE_UNKNOWN_NO_RESEND',
  CANCELLED: 'RELAY_CORE_CANCELLED',
  CANCEL_TOO_LATE: 'RELAY_CORE_CANCEL_TOO_LATE',
  BACKEND_REJECTED: 'RELAY_CORE_BACKEND_REJECTED',
  OWNER_LOST: 'RELAY_CORE_OWNER_LOST',
})

const DELIVERY_ID = /^delivery:[0-9a-f]{32}$/
const INTENT_ID = /^intent:[0-9a-f]{32}$/
const PERMIT_ID = /^permit:[0-9a-f]{32}$/
const BACKEND_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/
const TASK_ID = /^task:[A-Za-z0-9_-]{1,80}$/
const SCOPE_ID = /^[A-Za-z0-9:_-]{1,64}$/
const ARTIFACT_REF = /^artifact:fixture-bytes-[0-9a-f]{32}$/
const SHA256 = /^[0-9a-f]{64}$/
const TARGET_ID = /^[A-Za-z0-9:_-]{1,64}$/
const REQUEST_KEY = /^[A-Za-z0-9:_-]{1,128}$/
const LIVE_SUBMITS = new Map()
const QUEUES = new Map()
const MAX_ATTEMPTS = 40
const HANDOFF_REQUIRED_KEYS = Object.freeze(['schemaVersion', 'scopeId', 'taskId', 'artifactRef', 'targetId', 'requestKey', 'rights'])
const HANDOFF_KEYS = Object.freeze([...HANDOFF_REQUIRED_KEYS, 'permitId'])
const PERMIT_KEYS = Object.freeze(['schemaVersion', 'scopeId', 'taskId', 'artifactRef', 'targetId', 'rights'])
const RIGHTS_KEYS = Object.freeze(['state', 'proofRef'])
const RELAY_STATE_VALUES = Object.freeze(new Set(Object.values(RELAY_STATES)))

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function ownKeysOf(value) {
  try {
    return Reflect.ownKeys(value)
  } catch {
    return null
  }
}

function nowIso(now) {
  try {
    const value = typeof now === 'function' ? now() : now
    const iso = new Date(value).toISOString()
    return iso
  } catch {
    return null
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * The one canonical semantic digest of a delivery. Creation and store validation both call this
 * function over the persisted record facts, so a record whose digest/index was edited without the
 * facts (or vice versa) is not a trustworthy store and is refused instead of re-accepting the same
 * request under a new alias.
 */
function canonicalDeliveryDigest(facts) {
  return sha256([
    'relay-v3',
    facts.kind,
    facts.taskIdentityHash,
    facts.taskId,
    facts.artifactRef,
    facts.artifactSha256,
    String(facts.byteLength),
    String(facts.durationMs),
    facts.format,
    facts.targetId,
    facts.targetKind,
    facts.proofRef,
    facts.expiresAt,
    facts.permitId || '',
  ].join('|'))
}

function publicRecord(record) {
  if (!record) return null
  return {
    deliveryId: record.deliveryId,
    taskId: record.taskId,
    artifactRef: record.artifactRef,
    artifactSha256: record.artifactSha256,
    byteLength: record.byteLength,
    durationMs: record.durationMs,
    format: record.format,
    targetId: record.targetId,
    targetKind: record.targetKind,
    backendId: record.backendId,
    intentId: record.intentId || null,
    permitId: record.permitId || null,
    authority: record.intent ? record.intent.kind : null,
    deliveryRequested: record.intent ? record.intent.deliveryRequested : null,
    state: record.state,
    backendState: record.backendState || null,
    receiptId: record.receiptId || null,
    error: record.error || null,
    cancel: clone(record.cancel),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    mockOnly: true,
    realOperationAllowed: false,
  }
}

function validateTarget(target) {
  if (!isObject(target)) return null
  const keys = ['targetId', 'kind', 'authorized', 'allowlisted', 'identityVerified', 'bridgeAllowed', 'workerAllowed']
  if (Object.keys(target).some((key) => !keys.includes(key))) return null
  if (typeof target.targetId !== 'string' || !TARGET_ID.test(target.targetId)) return null
  if (target.kind !== 'PRIVATE' && target.kind !== 'GROUP') return null
  for (const key of keys.slice(2)) if (typeof target[key] !== 'boolean') return null
  return {
    targetId: target.targetId, kind: target.kind, authorized: target.authorized,
    allowlisted: target.allowlisted, identityVerified: target.identityVerified,
    bridgeAllowed: target.bridgeAllowed, workerAllowed: target.workerAllowed,
  }
}

function validateRights(rights) {
  if (!isObject(rights)) return null
  const keys = ownKeysOf(rights)
  if (!keys || keys.length !== RIGHTS_KEYS.length) return null
  for (const key of keys) if (typeof key !== 'string' || !RIGHTS_KEYS.includes(key)) return null
  if (rights.state !== 'GRANTED') return null
  if (typeof rights.proofRef !== 'string' || rights.proofRef.length < 1 || rights.proofRef.length > 128) return null
  return { state: 'GRANTED', proofRef: rights.proofRef }
}

function emptyStore() {
  return {
    schemaVersion: RELAY_CORE_SCHEMA_VERSION,
    revision: 0,
    deliveries: [],
    byDigest: {},
    byRequestKey: {},
    permits: [],
    byPermitKey: {},
  }
}

function publicPermit(permit) {
  if (!permit) return null
  return {
    permitId: permit.permitId,
    version: permit.version,
    scopeId: permit.scopeId,
    taskId: permit.taskId,
    artifactRef: permit.artifactRef,
    artifactSha256: permit.artifactSha256,
    targetId: permit.targetId,
    targetKind: permit.targetKind,
    rightsProofRef: permit.rightsProofRef,
    rightsExpiresAt: permit.rightsExpiresAt,
    authorityKind: permit.authorityKind,
    issuedBy: permit.issuedBy,
    issuedAt: permit.issuedAt,
    mockOnly: true,
    realOperationAllowed: false,
  }
}

function permitKeyOf({ scopeId, taskId, artifactRef, artifactSha256, targetId, targetKind, proofRef }) {
  return sha256(['permit-v1', scopeId, taskId, artifactRef, artifactSha256, targetId, targetKind, proofRef].join('|'))
}

function isIsoText(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

/**
 * Strict store gate. A store is accepted only when the persisted deliveries, the digest/request-key
 * indexes and the delivery permits are mutually consistent: every record is indexed both ways, every
 * index entry points at a record with the same key, there are no duplicates, and the terminal/owner
 * relations are legal. Any missing/extra/mismatched entry is treated as a corrupt store; it is never
 * silently repaired, re-minted or treated as a new empty store.
 */
function validateStoreState(store) {
  if (!isObject(store) || store.schemaVersion !== RELAY_CORE_SCHEMA_VERSION) return false
  if (!Number.isInteger(store.revision) || store.revision < 0) return false
  if (!Array.isArray(store.deliveries) || !isObject(store.byDigest) || !isObject(store.byRequestKey)) return false
  if (!Array.isArray(store.permits) || !isObject(store.byPermitKey)) return false
  const deliveries = new Map()
  for (const record of store.deliveries) {
    if (!isObject(record)) return false
    if (typeof record.deliveryId !== 'string' || !DELIVERY_ID.test(record.deliveryId)) return false
    if (deliveries.has(record.deliveryId)) return false
    if (typeof record.digest !== 'string' || !SHA256.test(record.digest)) return false
    if (canonicalDeliveryDigest({
      kind: record.intent ? record.intent.kind : null,
      taskIdentityHash: record.intent ? record.intent.taskIdentityHash : null,
      taskId: record.taskId,
      artifactRef: record.artifactRef,
      artifactSha256: record.artifactSha256,
      byteLength: record.byteLength,
      durationMs: record.durationMs,
      format: record.format,
      targetId: record.targetId,
      targetKind: record.targetKind,
      proofRef: record.rightsProofRef,
      expiresAt: record.rightsExpiresAt,
      permitId: record.permitId,
    }) !== record.digest) return false
    if (typeof record.requestKey !== 'string' || !REQUEST_KEY.test(record.requestKey)) return false
    if (!Array.isArray(record.requestKeys) || record.requestKeys.length < 1) return false
    if (record.requestKeys[0] !== record.requestKey) return false
    for (const key of record.requestKeys) {
      if (typeof key !== 'string' || !REQUEST_KEY.test(key)) return false
    }
    if (new Set(record.requestKeys).size !== record.requestKeys.length) return false
    if (typeof record.taskId !== 'string' || !TASK_ID.test(record.taskId)) return false
    if (typeof record.scopeId !== 'string' || !SCOPE_ID.test(record.scopeId)) return false
    if (typeof record.artifactRef !== 'string' || !ARTIFACT_REF.test(record.artifactRef)) return false
    if (typeof record.artifactSha256 !== 'string' || !SHA256.test(record.artifactSha256)) return false
    if (!Number.isInteger(record.byteLength) || record.byteLength < 1) return false
    if (!Number.isInteger(record.durationMs) || record.durationMs < 1) return false
    if (record.format !== 'WAV') return false
    if (typeof record.targetId !== 'string' || !TARGET_ID.test(record.targetId)) return false
    if (record.targetKind !== 'PRIVATE' && record.targetKind !== 'GROUP') return false
    if (typeof record.rightsProofRef !== 'string' || typeof record.rightsExpiresAt !== 'string') return false
    if (!isIsoText(record.rightsExpiresAt)) return false
    if (typeof record.backendId !== 'string' || typeof record.backendRequestId !== 'string') return false
    if (!BACKEND_REQUEST_ID.test(record.backendRequestId)) return false
    if (!isObject(record.intent) || record.intent.version !== 1) return false
    if (typeof record.intent.kind !== 'string') return false
    if (typeof record.intent.taskIdentityHash !== 'string' || !SHA256.test(record.intent.taskIdentityHash)) return false
    if (typeof record.intent.authorizedBy !== 'string') return false
    if (record.permitId !== null && record.permitId !== undefined) {
      if (typeof record.permitId !== 'string' || !PERMIT_ID.test(record.permitId)) return false
      if (record.intent.permitId !== record.permitId) return false
    } else if (record.intent.permitId !== null && record.intent.permitId !== undefined) return false
    if (typeof record.state !== 'string' || !RELAY_STATE_VALUES.has(record.state)) return false
    if (typeof record.backendState !== 'string' && record.backendState !== null) return false
    if (typeof record.receiptId !== 'string' && record.receiptId !== null) return false
    if (!isObject(record.cancel) || typeof record.cancel.requested !== 'boolean' || typeof record.cancel.confirmed !== 'boolean') return false
    if (record.state === RELAY_STATES.SUBMITTING) {
      if (!isObject(record.owner) || typeof record.owner.token !== 'string') return false
    } else if (record.owner !== null && record.owner !== undefined) {
      return false
    }
    if (record.state === RELAY_STATES.ACCEPTED) {
      if (typeof record.receiptId !== 'string') return false
      if (typeof record.backendState !== 'string') return false
    }
    deliveries.set(record.deliveryId, record)
  }
  for (const [digest, deliveryId] of Object.entries(store.byDigest)) {
    const record = deliveries.get(deliveryId)
    if (!record || record.digest !== digest) return false
  }
  for (const [requestKey, deliveryId] of Object.entries(store.byRequestKey)) {
    const record = deliveries.get(deliveryId)
    if (!record || !record.requestKeys.includes(requestKey)) return false
  }
  for (const record of deliveries.values()) {
    if (store.byDigest[record.digest] !== record.deliveryId) return false
    for (const key of record.requestKeys) {
      if (store.byRequestKey[key] !== record.deliveryId) return false
    }
  }
  const permitIds = new Set()
  const permitKeys = new Set()
  for (const permit of store.permits) {
    if (!isObject(permit)) return false
    if (typeof permit.permitId !== 'string' || !PERMIT_ID.test(permit.permitId)) return false
    if (permitIds.has(permit.permitId)) return false
    permitIds.add(permit.permitId)
    if (typeof permit.permitKey !== 'string' || !SHA256.test(permit.permitKey)) return false
    if (permitKeys.has(permit.permitKey)) return false
    permitKeys.add(permit.permitKey)
    if (permit.version !== 1) return false
    if (typeof permit.scopeId !== 'string' || !SCOPE_ID.test(permit.scopeId)) return false
    if (typeof permit.taskId !== 'string' || !TASK_ID.test(permit.taskId)) return false
    if (typeof permit.artifactRef !== 'string' || !ARTIFACT_REF.test(permit.artifactRef)) return false
    if (typeof permit.artifactSha256 !== 'string' || !SHA256.test(permit.artifactSha256)) return false
    if (typeof permit.targetId !== 'string' || !TARGET_ID.test(permit.targetId)) return false
    if (permit.targetKind !== 'PRIVATE' && permit.targetKind !== 'GROUP') return false
    if (typeof permit.rightsProofRef !== 'string' || typeof permit.rightsExpiresAt !== 'string') return false
    if (!isIsoText(permit.rightsExpiresAt)) return false
    if (permit.authorityKind !== 'COVER_OWNER_SAVED_V3') return false
    if (typeof permit.taskIdentityHash !== 'string' || !SHA256.test(permit.taskIdentityHash)) return false
    if (typeof permit.issuedAt !== 'string' || !isIsoText(permit.issuedAt)) return false
    if (store.byPermitKey[permit.permitKey] !== permit.permitId) return false
  }
  for (const [key, permitId] of Object.entries(store.byPermitKey)) {
    const permit = store.permits.find((item) => item.permitId === permitId)
    if (!permit || permit.permitKey !== key) return false
  }
  return true
}

function revisionStoreFile(root, revision) {
  return path.join(root, RELAY_STORE_PREFIX + revision + '.json')
}

function listRevisionFiles(root) {
  // Confirmed-empty and cannot-enumerate are different facts: an enumeration error is propagated so
  // every caller fails closed instead of treating an existing store as a brand-new one.
  const names = fs.readdirSync(root)
  const files = []
  for (const name of names) {
    if (typeof name !== 'string') continue
    const match = STORE_REVISION_FILE.exec(name)
    if (!match) continue
    const revision = Number(match[1])
    if (!Number.isSafeInteger(revision) || revision < 0) continue
    files.push({ revision, file: path.join(root, name) })
  }
  files.sort((left, right) => right.revision - left.revision)
  return files
}

function latestStoreRevision(root) {
  const files = listRevisionFiles(root)
  return files.length ? files[0].revision : 0
}

/**
 * The store is an append-only sequence of immutable revision files: `unified-relay-v1.r<N>.json`.
 * A commit is the atomic create-or-fail publication of exactly the next revision file (hard link of a
 * fully written/fsynced private temp). No fixed "current store" name is ever overwritten, moved,
 * reclaimed or deleted as part of a commit, so a writer whose advisory lease was moved aside can never
 * replace a newer commit: it either creates a revision nobody else took, or the create fails and it
 * reports BUSY. Readers take the highest validated revision; a corrupt higher revision fails closed
 * instead of falling back to older data.
 */
function readStore(root) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const files = listRevisionFiles(root)
    if (!files.length) return emptyStore()
    let text
    try {
      text = fs.readFileSync(files[0].file, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT' && attempt === 0) continue
      throw error
    }
    let parsed
    try { parsed = JSON.parse(text) } catch { throw new Error('corrupt') }
    if (isObject(parsed) && parsed.pruned === true) throw new Error('corrupt')
    if (!validateStoreState(parsed) || parsed.revision !== files[0].revision) throw new Error('corrupt')
    return parsed
  }
  throw new Error('corrupt')
}

/** Private temp files are never authoritative; only a provably dead owner's temp is removed. */
function removeStaleStoreTemps(root) {
  let names = []
  try { names = fs.readdirSync(root) } catch { return }
  for (const name of names) {
    if (typeof name !== 'string') continue
    const match = STORE_TEMP_FILE.exec(name)
    if (!match) continue
    const pid = Number(match[1])
    if (Number.isInteger(pid) && pid !== process.pid && pidAlive(pid)) continue
    try { fs.rmSync(path.join(root, name), { force: true }) } catch {}
  }
}

/**
 * Bound the payload of old revisions without ever freeing their numbers. The pruned revision file is
 * replaced by a small immutable tombstone at the same name, so a late writer whose base is older can
 * never re-create an already published revision and return success for a state readers would ignore.
 * The tombstone is written to a private temp and renamed over the old payload; old revisions are not
 * read by any path, so the replacement cannot race a reader.
 */
function pruneOldRevisions(root, revision) {
  for (const item of listRevisionFiles(root)) {
    if (item.revision > revision - KEEP_REVISIONS) continue
    const tombstone = JSON.stringify({ schemaVersion: RELAY_CORE_SCHEMA_VERSION, pruned: true, revision: item.revision }) + '\n'
    const temp = item.file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
    try {
      const handle = fs.openSync(temp, 'wx', 0o600)
      try {
        fs.writeFileSync(handle, tombstone, 'utf8')
        fs.fsyncSync(handle)
      } finally {
        fs.closeSync(handle)
      }
      fs.renameSync(temp, item.file)
    } catch {
      try { fs.rmSync(temp, { force: true }) } catch {}
    }
  }
}

/**
 * Publish exactly `store.revision + 1` as an immutable revision file. The content is fully written and
 * fsynced to a private temp first, then published with `link` (create-or-fail). The create is the
 * commit: there is no post-create step that could fail, so no successful commit can be lost or
 * overwritten, and a losing writer fails closed.
 */
function commitStore(root, store) {
  const revision = (Number.isInteger(store.revision) ? store.revision : 0) + 1
  const file = revisionStoreFile(root, revision)
  const temp = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
  let prepared = false
  try {
    const handle = fs.openSync(temp, 'wx', 0o600)
    try {
      fs.writeFileSync(handle, JSON.stringify({ ...store, revision }) + '\n', 'utf8')
      fs.fsyncSync(handle)
    } finally {
      fs.closeSync(handle)
    }
    prepared = true
  } catch {
    prepared = false
  }
  let created = false
  let busy = false
  if (prepared) {
    try {
      fs.linkSync(temp, file)
      created = true
    } catch (error) {
      const code = error && error.code
      if (code === 'EEXIST') busy = true
      // Only a filesystem that cannot hard-link falls back to an exclusive copy; any other error is a
      // failed commit (never silently retried).
      else if (['EPERM', 'ENOSYS', 'EXDEV', 'EOPNOTSUPP', 'ENOTSUP', 'EACCES'].includes(code)) {
        try { fs.copyFileSync(temp, file, fs.constants.COPYFILE_EXCL); created = true } catch (copyError) {
          busy = Boolean(copyError && copyError.code === 'EEXIST')
        }
      }
    }
  }
  try { fs.rmSync(temp, { force: true }) } catch {}
  if (!created) {
    if (!prepared) return fail(RELAY_ERRORS.STORE_INVALID, 'revision write failed')
    return busy
      ? fail(RELAY_ERRORS.STORE_BUSY, 'revision already committed')
      : fail(RELAY_ERRORS.STORE_INVALID, 'revision publish failed')
  }
  try { removeStaleStoreTemps(root) } catch {}
  try { pruneOldRevisions(root, revision) } catch {}
  return { ok: true, revision }
}

function lockPath(root) {
  return path.join(root, RELAY_LOCK_FILE)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

/** Bounded parse of a lock lease. Unreadable/foreign bytes are never treated as an owner. */
function readLease(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    return value && typeof value.token === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * Put a lease back without ever overwriting a lease another owner may have taken meanwhile.
 * A hard link is an atomic create-or-fail; if the canonical name is occupied the quarantined lease
 * is left untouched instead of clobbering a third live token.
 */
function restoreQuarantine(quarantine, file) {
  try {
    fs.linkSync(quarantine, file)
  } catch (error) {
    if (error && error.code === 'EEXIST') return false
    try {
      fs.copyFileSync(quarantine, file, fs.constants.COPYFILE_EXCL)
    } catch (copyError) {
      return false
    }
  }
  try { fs.rmSync(quarantine, { force: true }) } catch {}
  return true
}

async function acquireLock(root, owner) {
  const file = lockPath(root)
  const started = Date.now()
  while (Date.now() - started < 3000) {
    try {
      fs.writeFileSync(file, JSON.stringify(owner) + '\n', { flag: 'wx', mode: 0o600 })
      return owner
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error
      const current = readLease(file)
      if (current && !pidAlive(current.pid)) {
        // Fence the exact lease that was inspected: move it aside first, then verify the moved
        // bytes. A live replacement written between read and rename is therefore never deleted —
        // it is restored (create-or-fail) or left in quarantine and reported as BUSY.
        const quarantine = file + '.stale.' + owner.token + '.' + crypto.randomBytes(4).toString('hex')
        let moved = false
        try { fs.renameSync(file, quarantine); moved = true } catch { moved = false }
        if (moved) {
          const verified = readLease(quarantine)
          if (verified && verified.token === current.token && !pidAlive(verified.pid)) {
            try { fs.rmSync(quarantine, { force: true }) } catch {}
            continue
          }
          restoreQuarantine(quarantine, file)
        }
      }
      await sleep(25)
    }
  }
  throw new Error(RELAY_ERRORS.STORE_BUSY)
}

function releaseLock(root, owner) {
  const file = lockPath(root)
  const quarantine = file + '.release.' + owner.token + '.' + crypto.randomBytes(4).toString('hex')
  try {
    const current = readLease(file)
    if (!current || current.token !== owner.token) return
    // Move first, then verify the moved token. A lock replaced between read and rename is moved
    // aside and restored without overwriting, never blindly deleted as if it belonged to us.
    fs.renameSync(file, quarantine)
    const moved = readLease(quarantine)
    if (moved && moved.token === owner.token) {
      fs.rmSync(quarantine, { force: true })
      return
    }
    restoreQuarantine(quarantine, file)
  } catch { /* no lock or unreadable: leave it alone */ }
}

export function createFakeDeliveryBackend({ id = 'fake-relay', targets = [], capabilities = {}, failMode = 'none', bridgeAllowed = true, workerAllowed = true } = {}) {
  const targetMap = new Map()
  for (const target of targets) {
    targetMap.set(target.targetId, {
      targetId: target.targetId, kind: target.kind,
      authorized: target.authorized === true, allowlisted: target.allowlisted === true,
      identityVerified: target.identityVerified === true,
      bridgeAllowed: target.bridgeAllowed !== false && bridgeAllowed,
      workerAllowed: target.workerAllowed !== false && workerAllowed,
    })
  }
  const caps = {
    formats: ['WAV'], maxDurationMs: 15 * 60 * 1000, maxBytes: 8 * 1024 * 1024,
    voiceOrFile: 'VOICE', ...capabilities,
  }
  const stats = { submitted: 0, accepted: 0, cancelled: 0, rejected: 0, unknown: 0, targetChecks: 0 }
  const deliveries = new Map()
  let releaseDeferred = null
  /** The Fake Worker's own final gate: its directory and two flags, never the upstream booleans. */
  function ownTargetGate(delivery) {
    stats.targetChecks += 1
    if (!delivery || typeof delivery.targetId !== 'string' || typeof delivery.targetKind !== 'string') {
      return { ok: false, detail: 'delivery target facts missing' }
    }
    if (delivery.backendId !== id) return { ok: false, detail: 'delivery is bound to another backend' }
    const registered = targetMap.get(delivery.targetId)
    if (!registered) return { ok: false, detail: 'target is not registered in this worker directory' }
    if (registered.kind !== delivery.targetKind) return { ok: false, detail: 'target kind drifted from the worker directory' }
    if (registered.identityVerified !== true) return { ok: false, detail: 'target identity is not verified in this worker directory' }
    if (registered.authorized !== true || registered.allowlisted !== true) {
      return { ok: false, detail: 'target is not authorized/allowlisted in this worker directory' }
    }
    if (registered.bridgeAllowed !== true || registered.workerAllowed !== true) {
      return { ok: false, detail: 'bridge/worker gate is closed in this worker directory' }
    }
    return { ok: true, target: registered }
  }
  const backend = {
    id,
    realOperationAllowed: false,
    capabilities() { return { ...caps } },
    health() { return { ok: true, state: 'FIXTURE_HEALTHY', realReady: false } },
    resolveTarget({ targetId } = {}) {
      const target = targetMap.get(targetId)
      stats.targetChecks += 1
      if (!target) return { ok: false, code: RELAY_ERRORS.TARGET_REJECTED, detail: 'unknown fixture target' }
      if (!target.authorized || !target.allowlisted || !target.identityVerified) {
        return { ok: false, code: RELAY_ERRORS.TARGET_REJECTED, detail: 'target not authorized' }
      }
      return { ok: true, value: clone(target) }
    },
    async submit({ delivery, artifact, target } = {}) {
      stats.submitted += 1
      const gate = ownTargetGate(delivery)
      if (gate.ok !== true) {
        stats.rejected += 1
        return { ok: false, preSubmit: true, code: RELAY_ERRORS.TARGET_REJECTED, detail: gate.detail }
      }
      // The caller-provided descriptor may not widen the directory decision; it may only agree.
      if (!target || target.targetId !== gate.target.targetId || target.kind !== gate.target.kind ||
          target.identityVerified !== true || target.bridgeAllowed !== true || target.workerAllowed !== true) {
        stats.rejected += 1
        return { ok: false, preSubmit: true, code: RELAY_ERRORS.TARGET_REJECTED, detail: 'caller target disagrees with the worker directory' }
      }
      if (!isObject(artifact) || !caps.formats.includes(artifact.format) || artifact.durationMs > caps.maxDurationMs || artifact.byteLength > caps.maxBytes) {
        stats.rejected += 1
        return { ok: false, preSubmit: true, code: RELAY_ERRORS.UNSUPPORTED_CAPABILITY, detail: 'format/duration/bytes unsupported' }
      }
      if (failMode === 'reject') {
        stats.rejected += 1
        return { ok: false, preSubmit: true, code: RELAY_ERRORS.BACKEND_REJECTED, detail: 'fixture rejection' }
      }
      if (failMode === 'unknown') {
        stats.unknown += 1
        return { ok: false, unknown: true, code: RELAY_ERRORS.OWNER_LOST, detail: 'fixture unknown' }
      }
      if (failMode === 'hang') {
        await new Promise(() => {})
      }
      if (failMode === 'defer') {
        await new Promise((resolve) => { releaseDeferred = resolve })
      }
      if (failMode === 'throw') throw new Error('fixture backend throw')
      const receiptId = 'fixture-receipt-' + crypto.randomBytes(8).toString('hex')
      deliveries.set(delivery.deliveryId, { state: 'QUEUED', receiptId })
      stats.accepted += 1
      return { ok: true, accepted: true, backendState: 'QUEUED', receiptId }
    },
    async status({ deliveryId } = {}) {
      const item = deliveries.get(deliveryId)
      return item ? { ok: true, value: { state: item.state, receiptId: item.receiptId } } : { ok: false, code: RELAY_ERRORS.NOT_FOUND }
    },
    async cancel({ deliveryId } = {}) {
      const item = deliveries.get(deliveryId)
      if (!item) return { ok: false, code: RELAY_ERRORS.CANCEL_TOO_LATE }
      stats.cancelled += 1
      deliveries.set(deliveryId, { state: 'CANCELLED', receiptId: item.receiptId })
      return { ok: true, confirmed: true, state: 'CANCELLED' }
    },
    releaseDeferred() {
      if (releaseDeferred) { const release = releaseDeferred; releaseDeferred = null; release() }
    },
    stats() { return { ...stats, deliveries: deliveries.size } },
  }
  return Object.freeze(backend)
}

/**
 * Re-read the persisted AudioTask/Cover authority for exactly this scope/task/artifact relation.
 * Returns `{ok:true, value:{kind, taskIdentityHash, deliveryRequested, expiresAt}}` or a `fail()`.
 * A JSON record supplied by the caller can never construct this value.
 */
async function readTrustedTaskAuthority({ sandbox, scopeId, taskId, artifactRef, rights, at }) {
  let owner = null
  try { owner = await openFixtureTaskOwner({ sandbox }) } catch { owner = null }
  if (owner && owner.ok === true) {
    let found = null
    try { found = await owner.value.get({ schemaVersion: 1, scopeId, taskId }) } catch { found = null }
    if (found && found.ok === true) {
      const task = found.value && found.value.task ? found.value.task : null
      if (!task || task.taskId !== taskId) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'task authority')
      if (found.value.ownerState !== 'SAVED' || task.state !== 'SAVED') return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'task state')
      if (task.deliveryRequested !== true) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'delivery intent')
      let status = null
      try {
        status = await owner.value.artifactStatus({ schemaVersion: 1, scopeId, taskId, now: at, rights })
      } catch { status = null }
      if (!status || status.ok !== true || !status.value || status.value.state !== 'READABLE') {
        return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'artifact authority')
      }
      if (status.value.artifactRef !== artifactRef) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'artifact authority')
      return {
        ok: true,
        value: {
          kind: 'TASK_OWNER_SAVED_V2',
          permitRequired: false,
          deliveryRequested: true,
          ownerState: 'SAVED',
          masterSha256: null,
          expiresAt: status.value.expiresAt,
          taskIdentityHash: sha256([
            'TASK_OWNER_SAVED_V2', scopeId, taskId, artifactRef, status.value.expiresAt,
            task.feature, task.taskType, task.voiceProfileId,
          ].join('|')),
        },
      }
    }
  }
  // Cover owner store (schema v3). Its SAVED record keeps `deliveryRequested:false` forever, so the
  // save itself is not a delivery permission: a versioned persisted delivery permit issued through
  // `issueDeliveryPermit` (same scope/task/MASTER/target/rights) is required before ensure accepts.
  let status = null
  try { status = await coverStatus({ sandbox, scopeId, taskId, now: at }) } catch { status = null }
  if (!status || status.ok !== true || !status.value) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'task authority')
  if (status.value.state !== 'SAVED' || !status.value.master) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'task state')
  if (status.value.master.artifactRef !== artifactRef) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'artifact authority')
  return {
    ok: true,
    value: {
      kind: 'COVER_OWNER_SAVED_V3',
      permitRequired: true,
      deliveryRequested: false,
      ownerState: 'SAVED',
      masterSha256: status.value.master.sha256,
      expiresAt: status.value.master.expiresAt,
      taskIdentityHash: sha256([
        'COVER_OWNER_SAVED_V3', scopeId, taskId, artifactRef,
        status.value.master.sha256, status.value.master.byteLength, status.value.intentHash || '',
      ].join('|')),
    },
  }
}

export async function openUnifiedRelay({ sandbox, backend, targets = [], now = () => new Date().toISOString(), maxDeliveries = 256, maxPermits = 256 } = {}) {
  const root = sandbox && typeof sandbox.root === 'string' ? sandbox.root : null
  if (!root || !isObject(backend) || typeof backend.id !== 'string' ||
      !Number.isInteger(maxDeliveries) || maxDeliveries < 1 || maxDeliveries > 4096 ||
      !Number.isInteger(maxPermits) || maxPermits < 1 || maxPermits > 4096) {
    return fail(RELAY_ERRORS.INPUT_INVALID)
  }
  const targetDirectory = new Map()
  if (!Array.isArray(targets)) return fail(RELAY_ERRORS.INPUT_INVALID, 'targets')
  for (const target of targets) {
    const normalized = validateTarget(target)
    if (!normalized) return fail(RELAY_ERRORS.INPUT_INVALID, 'target')
    targetDirectory.set(normalized.targetId, normalized)
  }
  function trustedTarget(targetId) {
    const target = targetDirectory.get(targetId)
    if (!target) return null
    if (!target.authorized || !target.allowlisted || !target.identityVerified) return null
    if (!target.bridgeAllowed || !target.workerAllowed) return null
    return clone(target)
  }
  const queueKey = path.join(root, RELAY_STORE_PREFIX)
  const ownerToken = crypto.randomBytes(16).toString('hex')
  const ownerPid = process.pid
  const ownerHost = 'fixture-host'
  let recovered = []

  function ownerIsLive(owner) {
    if (!owner || typeof owner.token !== 'string') return false
    if (LIVE_SUBMITS.has(owner.token)) return true
    if (owner.pid === ownerPid) return false
    return pidAlive(owner.pid)
  }

  function maybeRecover(store) {
    let changed = false
    for (const record of store.deliveries) {
      if (record.state === RELAY_STATES.SUBMITTING && !ownerIsLive(record.owner)) {
        record.state = RELAY_STATES.UNKNOWN
        record.error = { code: RELAY_ERRORS.OWNER_LOST, detail: 'previous submit owner is not live' }
        record.updatedAt = nowIso(now) || record.updatedAt
        record.owner = null
        recovered.push(record.deliveryId)
        changed = true
      }
    }
    return changed
  }

  function run(fn) {
    const previous = QUEUES.get(queueKey) || Promise.resolve()
    const next = previous.then(async () => {
      let owner
      try {
        owner = await acquireLock(root, { token: ownerToken, pid: ownerPid, host: ownerHost, createdAt: nowIso(now) })
      } catch (error) {
        return fail(error && error.message === RELAY_ERRORS.STORE_BUSY ? RELAY_ERRORS.STORE_BUSY : RELAY_ERRORS.STORE_INVALID)
      }
      try {
        let store
        try { store = readStore(root) } catch { return fail(RELAY_ERRORS.STORE_INVALID) }
        const baseRevision = store.revision
        const outcome = await fn(store)
        if (outcome && outcome.persist === true) {
          const nextRevision = baseRevision + 1
          // Advisory contention fence only (no write authority): the commit authority is the
          // immutable revision-file create below. A moved/expired lease can therefore delay a writer
          // but can never let it overwrite a newer commit.
          let currentRevision = 0
          try { currentRevision = latestStoreRevision(root) } catch { return fail(RELAY_ERRORS.STORE_INVALID) }
          const lease = readLease(lockPath(root))
          if (!lease || lease.token !== owner.token) return fail(RELAY_ERRORS.STORE_BUSY, 'lease lost before commit')
          if (currentRevision !== baseRevision) return fail(RELAY_ERRORS.STORE_BUSY, 'store advanced before commit')
          store.revision = baseRevision
          const committed = commitStore(root, store)
          if (!committed.ok) return committed
          if (committed.revision !== nextRevision) return fail(RELAY_ERRORS.STORE_INVALID, 'revision mismatch')
          // A live owner token is registered only once its claim commit really happened, so a failed
          // claim can never leave a phantom live token behind.
          if (typeof outcome.liveToken === 'string') LIVE_SUBMITS.set(outcome.liveToken, ownerPid)
        }
        return outcome ? outcome.value : fail(RELAY_ERRORS.INPUT_INVALID)
      } catch (error) {
        return fail(error && error.message === RELAY_ERRORS.STORE_BUSY ? RELAY_ERRORS.STORE_BUSY : RELAY_ERRORS.STORE_INVALID)
      } finally {
        releaseLock(root, owner)
      }
    })
    QUEUES.set(queueKey, next.then(() => {}, () => {}))
    return next
  }

  /** One bounded read of the real artifact bytes plus the parsed WAV facts. */
  async function readFreshArtifact({ scopeId, artifactRef, proofRef }) {
    const at = nowIso(now)
    if (at === null) return fail(RELAY_ERRORS.INPUT_INVALID, 'now')
    let library = null
    try { library = await openFixtureArtifactLibrary({ sandbox }) } catch { library = null }
    if (!library || library.ok !== true) return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE)
    let read = null
    try {
      read = await library.value.readBytes({
        schemaVersion: 1, scopeId, artifactRef, now: at,
        rights: { state: 'GRANTED', proofRef },
      })
    } catch { return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE) }
    if (!read || read.ok !== true || !read.value || !read.value.bytes || !read.value.artifact) {
      return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE)
    }
    const bytes = Buffer.from(read.value.bytes)
    let parsed
    try { parsed = samplesFromWav(bytes) } catch { return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'WAV') }
    // The read itself is asynchronous: the clock is sampled again after it so a crossing during the
    // last read cannot be hidden by the timestamp taken before the await.
    const checkedAt = nowIso(now)
    if (checkedAt === null) return fail(RELAY_ERRORS.INPUT_INVALID, 'now')
    const expiresAt = read.value.artifact.expiresAt
    if (typeof expiresAt !== 'string' || Date.parse(expiresAt) <= Date.parse(checkedAt)) {
      return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'expired')
    }
    const artifactSha256 = crypto.createHash('sha256').update(bytes).digest('hex')
    return {
      ok: true,
      value: {
        artifactSha256,
        byteLength: bytes.length,
        durationMs: Math.max(1, Math.round((parsed.frameCount / parsed.sampleRate) * 1000)),
        expiresAt,
        at,
        checkedAt,
      },
    }
  }

  const opened = await run((store) => {
    const changed = maybeRecover(store)
    return { persist: changed, value: { ok: true, recovered: recovered.slice() } }
  })
  if (!opened.ok) return opened
  const handle = {
    ok: true,
    schemaVersion: RELAY_CORE_SCHEMA_VERSION,
    backendId: backend.id,
    recovered: opened.recovered,
    ready: Promise.resolve({ ok: true, recovered: opened.recovered }),
    async issueDeliveryPermit({ permit } = {}) {
      if (!isObject(permit)) return fail(RELAY_ERRORS.INPUT_INVALID, 'permit')
      const permitKeys = ownKeysOf(permit)
      if (!permitKeys) return fail(RELAY_ERRORS.INPUT_INVALID, 'permit')
      for (const key of permitKeys) {
        if (typeof key !== 'string' || !PERMIT_KEYS.includes(key)) return fail(RELAY_ERRORS.INPUT_INVALID, 'permit')
      }
      for (const key of PERMIT_KEYS) if (!Object.prototype.hasOwnProperty.call(permit, key)) return fail(RELAY_ERRORS.INPUT_INVALID, key)
      if (permit.schemaVersion !== 1) return fail(RELAY_ERRORS.INPUT_INVALID, 'schemaVersion')
      if (typeof permit.scopeId !== 'string' || !SCOPE_ID.test(permit.scopeId)) return fail(RELAY_ERRORS.INPUT_INVALID, 'scopeId')
      if (typeof permit.taskId !== 'string' || !TASK_ID.test(permit.taskId)) return fail(RELAY_ERRORS.INPUT_INVALID, 'taskId')
      if (typeof permit.artifactRef !== 'string' || !ARTIFACT_REF.test(permit.artifactRef)) return fail(RELAY_ERRORS.INPUT_INVALID, 'artifactRef')
      const rights = validateRights(permit.rights)
      if (!rights) return fail(RELAY_ERRORS.INPUT_INVALID, 'rights')
      const target = trustedTarget(permit.targetId)
      if (!target) return fail(RELAY_ERRORS.TARGET_REJECTED, 'target directory')
      const at = nowIso(now)
      if (at === null) return fail(RELAY_ERRORS.INPUT_INVALID, 'now')
      const authority = await readTrustedTaskAuthority({
        sandbox, scopeId: permit.scopeId, taskId: permit.taskId, artifactRef: permit.artifactRef, rights, at,
      })
      if (!authority || authority.ok !== true) return authority
      // Only the frozen Cover save needs a separate source permit; the Voice path keeps its persisted
      // deliveryRequested:true intent and is deliberately not routed through this API.
      if (authority.value.kind !== 'COVER_OWNER_SAVED_V3' || authority.value.permitRequired !== true) {
        return fail(RELAY_ERRORS.INPUT_INVALID, 'authority')
      }
      const fresh = await readFreshArtifact({ scopeId: permit.scopeId, artifactRef: permit.artifactRef, proofRef: rights.proofRef })
      if (!fresh.ok) return fresh
      if (authority.value.masterSha256 && fresh.value.artifactSha256 !== authority.value.masterSha256) {
        return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'MASTER changed')
      }
      const permitKey = permitKeyOf({
        scopeId: permit.scopeId, taskId: permit.taskId, artifactRef: permit.artifactRef,
        artifactSha256: fresh.value.artifactSha256, targetId: target.targetId, targetKind: target.kind,
        proofRef: rights.proofRef,
      })
      return run((store) => {
        const existingId = store.byPermitKey[permitKey]
        if (existingId) {
          const existing = store.permits.find((item) => item.permitId === existingId)
          if (!existing) return { value: fail(RELAY_ERRORS.STORE_INVALID) }
          return { value: { ok: true, outcome: 'EXISTING', permit: publicPermit(existing) } }
        }
        if (store.permits.length >= maxPermits) return { value: fail(RELAY_ERRORS.CAPACITY, 'permits') }
        const permitId = 'permit:' + crypto.randomBytes(16).toString('hex')
        if (!PERMIT_ID.test(permitId)) return { value: fail(RELAY_ERRORS.INPUT_INVALID) }
        const record = {
          permitId,
          permitKey,
          version: 1,
          scopeId: permit.scopeId,
          taskId: permit.taskId,
          artifactRef: permit.artifactRef,
          artifactSha256: fresh.value.artifactSha256,
          targetId: target.targetId,
          targetKind: target.kind,
          rightsProofRef: rights.proofRef,
          rightsExpiresAt: fresh.value.expiresAt,
          taskIdentityHash: authority.value.taskIdentityHash,
          authorityKind: authority.value.kind,
          issuedBy: 'WHALE_RELAY_DELIVERY_PERMIT_V1',
          issuedAt: at,
        }
        store.permits.push(record)
        store.byPermitKey[permitKey] = permitId
        return { persist: true, value: { ok: true, outcome: 'ISSUED', permit: publicPermit(record) } }
      })
    },
    async ensureDelivery({ handoff } = {}) {
      if (!isObject(handoff)) return fail(RELAY_ERRORS.INPUT_INVALID, 'handoff')
      const handoffKeys = ownKeysOf(handoff)
      if (!handoffKeys) return fail(RELAY_ERRORS.INPUT_INVALID, 'handoff')
      for (const key of handoffKeys) {
        // A caller-supplied task record is not an authority; only the persisted store is.
        if (typeof key !== 'string' || !HANDOFF_KEYS.includes(key)) return fail(RELAY_ERRORS.INPUT_INVALID, key === 'taskRecord' ? 'taskRecord' : 'handoff')
      }
      for (const key of HANDOFF_REQUIRED_KEYS) if (!Object.prototype.hasOwnProperty.call(handoff, key)) return fail(RELAY_ERRORS.INPUT_INVALID, key)
      if (Object.prototype.hasOwnProperty.call(handoff, 'permitId')) {
        if (typeof handoff.permitId !== 'string' || !PERMIT_ID.test(handoff.permitId)) return fail(RELAY_ERRORS.INPUT_INVALID, 'permitId')
      }
      if (handoff.schemaVersion !== 1) return fail(RELAY_ERRORS.INPUT_INVALID, 'schemaVersion')
      if (typeof handoff.scopeId !== 'string' || !SCOPE_ID.test(handoff.scopeId)) return fail(RELAY_ERRORS.INPUT_INVALID, 'scopeId')
      if (typeof handoff.taskId !== 'string' || !TASK_ID.test(handoff.taskId)) return fail(RELAY_ERRORS.INPUT_INVALID, 'taskId')
      if (typeof handoff.artifactRef !== 'string' || !ARTIFACT_REF.test(handoff.artifactRef)) return fail(RELAY_ERRORS.INPUT_INVALID, 'artifactRef')
      if (typeof handoff.requestKey !== 'string' || !REQUEST_KEY.test(handoff.requestKey)) return fail(RELAY_ERRORS.INPUT_INVALID, 'requestKey')
      const rights = validateRights(handoff.rights)
      if (!rights) return fail(RELAY_ERRORS.INPUT_INVALID, 'rights')
      const target = trustedTarget(handoff.targetId)
      if (!target) return fail(RELAY_ERRORS.TARGET_REJECTED, 'target directory')

      const at = nowIso(now)
      if (at === null) return fail(RELAY_ERRORS.INPUT_INVALID, 'now')
      const authority = await readTrustedTaskAuthority({
        sandbox, scopeId: handoff.scopeId, taskId: handoff.taskId, artifactRef: handoff.artifactRef,
        rights, at,
      })
      if (!authority || authority.ok !== true) return authority
      const permitRequired = authority.value.permitRequired === true
      if (!permitRequired && Object.prototype.hasOwnProperty.call(handoff, 'permitId')) {
        return fail(RELAY_ERRORS.INPUT_INVALID, 'permitId')
      }
      if (permitRequired && !Object.prototype.hasOwnProperty.call(handoff, 'permitId')) {
        return fail(RELAY_ERRORS.PERMIT_REQUIRED, 'permit missing')
      }
      const fresh = await readFreshArtifact({ scopeId: handoff.scopeId, artifactRef: handoff.artifactRef, proofRef: rights.proofRef })
      if (!fresh.ok) return fresh
      const artifact = {
        artifactRef: handoff.artifactRef,
        sha256: fresh.value.artifactSha256,
        byteLength: fresh.value.byteLength,
        durationMs: fresh.value.durationMs,
        format: 'WAV',
      }
      if (!SHA256.test(artifact.sha256)) return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'artifact profile')
      if (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 1 || artifact.byteLength > 8 * 1024 * 1024) {
        return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'artifact profile')
      }
      if (authority.value.masterSha256 && artifact.sha256 !== authority.value.masterSha256) {
        return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'artifact is not the SAVED MASTER')
      }
      if (!Number.isInteger(artifact.durationMs) || artifact.durationMs < 1 || artifact.durationMs > 15 * 60 * 1000) {
        return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'artifact profile')
      }
      const expiresAt = fresh.value.expiresAt
      const permitKey = permitRequired
        ? permitKeyOf({
            scopeId: handoff.scopeId, taskId: handoff.taskId, artifactRef: artifact.artifactRef,
            artifactSha256: artifact.sha256, targetId: target.targetId, targetKind: target.kind, proofRef: rights.proofRef,
          })
        : null
      const digest = canonicalDeliveryDigest({
        kind: authority.value.kind,
        taskIdentityHash: authority.value.taskIdentityHash,
        taskId: handoff.taskId,
        artifactRef: artifact.artifactRef,
        artifactSha256: artifact.sha256,
        byteLength: artifact.byteLength,
        durationMs: artifact.durationMs,
        format: artifact.format,
        targetId: target.targetId,
        targetKind: target.kind,
        proofRef: rights.proofRef,
        expiresAt,
        permitId: permitRequired ? handoff.permitId : null,
      })
      return run((store) => {
        if (permitRequired) {
          const permitRecord = store.permits.find((item) => item.permitId === handoff.permitId)
          if (!permitRecord) return { value: fail(RELAY_ERRORS.PERMIT_REQUIRED, 'permit missing') }
          if (permitRecord.permitKey !== permitKey) return { value: fail(RELAY_ERRORS.PERMIT_REQUIRED, 'permit mismatch') }
          if (permitRecord.taskIdentityHash !== authority.value.taskIdentityHash) {
            return { value: fail(RELAY_ERRORS.PERMIT_REQUIRED, 'permit authority changed') }
          }
          if (!(Date.parse(permitRecord.rightsExpiresAt) > Date.parse(at))) {
            return { value: fail(RELAY_ERRORS.PERMIT_REQUIRED, 'permit expired') }
          }
        }
        const existing = store.byDigest[digest]
        const bound = store.byRequestKey[handoff.requestKey]
        if (bound) {
          const boundRecord = store.deliveries.find((item) => item.deliveryId === bound)
          if (!boundRecord) return { value: fail(RELAY_ERRORS.STORE_INVALID) }
          // The request key is an immutable binding: it may return its own delivery, but it can
          // never be re-pointed at another content/target digest.
          if (existing && existing === bound) {
            return { value: { ok: true, outcome: 'EXISTING', delivery: publicRecord(boundRecord) } }
          }
          return { value: fail(RELAY_ERRORS.CONFLICT, 'requestKey already has different content/target') }
        }
        if (existing) {
          const record = store.deliveries.find((item) => item.deliveryId === existing)
          if (!record) return { value: fail(RELAY_ERRORS.STORE_INVALID) }
          // A new alias for an already-issued semantic digest is allowed only while the key is
          // unbound; the binding is then immutable from here on. The alias is recorded on the
          // delivery itself so the strict store gate can prove every index entry.
          record.requestKeys.push(handoff.requestKey)
          store.byRequestKey[handoff.requestKey] = existing
          return { persist: true, value: { ok: true, outcome: 'EXISTING', delivery: publicRecord(record) } }
        }
        if (store.deliveries.length >= maxDeliveries) return { value: fail(RELAY_ERRORS.CAPACITY) }
        const deliveryId = 'delivery:' + crypto.randomBytes(16).toString('hex')
        const backendRequestId = 'wv' + crypto.randomBytes(16).toString('hex')
        const intentId = 'intent:' + crypto.randomBytes(16).toString('hex')
        if (!DELIVERY_ID.test(deliveryId) || !BACKEND_REQUEST_ID.test(backendRequestId) || !INTENT_ID.test(intentId)) {
          return { value: fail(RELAY_ERRORS.INPUT_INVALID) }
        }
        const record = {
          deliveryId, taskId: handoff.taskId, taskRecordState: 'SAVED', scopeId: handoff.scopeId,
          artifactRef: artifact.artifactRef, artifactSha256: artifact.sha256,
          byteLength: artifact.byteLength, durationMs: artifact.durationMs, format: artifact.format,
          rightsProofRef: rights.proofRef, rightsExpiresAt: expiresAt,
          targetId: target.targetId, targetKind: target.kind,
          backendId: backend.id, backendRequestId, digest, requestKey: handoff.requestKey,
          requestKeys: [handoff.requestKey],
          intentId,
          permitId: permitRequired ? handoff.permitId : null,
          intent: {
            version: 1,
            kind: authority.value.kind,
            taskIdentityHash: authority.value.taskIdentityHash,
            deliveryRequested: authority.value.deliveryRequested,
            authorizedBy: permitRequired ? 'PERSISTED_COVER_DELIVERY_PERMIT' : 'PERSISTED_TASK_DELIVERY_INTENT',
            permitId: permitRequired ? handoff.permitId : null,
            issuedAt: at,
          },
          state: RELAY_STATES.QUEUED, backendState: null, receiptId: null, error: null,
          cancel: { requested: false, confirmed: false, requestedAt: null, confirmedAt: null },
          owner: null, createdAt: at, updatedAt: at,
        }
        store.deliveries.push(record)
        store.byDigest[digest] = deliveryId
        store.byRequestKey[handoff.requestKey] = deliveryId
        return { persist: true, value: { ok: true, outcome: 'CREATED', delivery: publicRecord(record) } }
      })
    },
    async submit(deliveryId) {
      if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId)) return fail(RELAY_ERRORS.INPUT_INVALID)
      const claim = await run((store) => {
        const record = store.deliveries.find((item) => item.deliveryId === deliveryId)
        if (!record) return { value: fail(RELAY_ERRORS.NOT_FOUND) }
        if (record.state === RELAY_STATES.UNKNOWN) return { value: fail(RELAY_ERRORS.UNKNOWN_NO_RESEND) }
        if (record.state === RELAY_STATES.CANCELLED) return { value: fail(RELAY_ERRORS.CANCELLED) }
        if (record.state === RELAY_STATES.CANCEL_REQUESTED) return { value: fail(RELAY_ERRORS.CANCELLED) }
        if (record.state === RELAY_STATES.SUBMITTING) return { value: fail(RELAY_ERRORS.STORE_BUSY) }
        if (record.state === RELAY_STATES.ACCEPTED) return { value: { ok: true, outcome: 'EXISTING', delivery: publicRecord(record) } }
        if (record.backendId !== backend.id) return { value: fail(RELAY_ERRORS.BACKEND_REJECTED, 'backend is fixed for this delivery') }
        if (record.state !== RELAY_STATES.QUEUED) return { value: fail(RELAY_ERRORS.CANCEL_TOO_LATE) }
        if (!record.intent || record.intent.version !== 1 || typeof record.intent.taskIdentityHash !== 'string') {
          return { value: fail(RELAY_ERRORS.STORE_INVALID, 'delivery has no authorized issuance') }
        }
        const token = ownerToken + ':' + crypto.randomBytes(8).toString('hex')
        record.owner = { token, pid: ownerPid, host: ownerHost, at: nowIso(now) }
        record.state = RELAY_STATES.SUBMITTING
        record.updatedAt = nowIso(now)
        return { persist: true, liveToken: token, value: { ok: true, record: clone(record), token } }
      })
      if (!claim.ok) return claim
      if (claim.outcome === 'EXISTING') return claim
      const { record, token } = claim
      try {
        const fresh = await readFreshArtifact({ scopeId: record.scopeId, artifactRef: record.artifactRef, proofRef: record.rightsProofRef })
        if (!fresh.ok) return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.ARTIFACT_UNAVAILABLE, detail: 'artifact no longer readable' })
        if (fresh.value.artifactSha256 !== record.artifactSha256 || fresh.value.byteLength !== record.byteLength) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.ARTIFACT_UNAVAILABLE, detail: 'artifact changed' })
        }
        const coreTarget = trustedTarget(record.targetId)
        if (!coreTarget || coreTarget.kind !== record.targetKind) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.TARGET_REJECTED, detail: 'core target changed or revoked' })
        }
        const health = await backend.health()
        if (!health || health.ok !== true) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.BACKEND_REJECTED, detail: 'backend health unavailable' })
        }
        const caps = await backend.capabilities()
        if (!caps || !Array.isArray(caps.formats) || !caps.formats.includes(record.format) || record.durationMs > caps.maxDurationMs || record.byteLength > caps.maxBytes) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.UNSUPPORTED_CAPABILITY, detail: 'capability rejected' })
        }
        const resolved = await backend.resolveTarget({ targetId: record.targetId })
        if (!resolved || resolved.ok !== true || !resolved.value ||
            resolved.value.targetId !== record.targetId || resolved.value.kind !== record.targetKind ||
            resolved.value.identityVerified !== true || resolved.value.bridgeAllowed !== true || resolved.value.workerAllowed !== true) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.TARGET_REJECTED, detail: 'target identity/type recheck failed' })
        }
        // Final trusted facts at the accept boundary: every await above may have revoked the target,
        // replaced/deleted/expired the artifact, or re-written the Task relation. All three are
        // re-read here, immediately before the Fake Worker is asked to accept.
        const authorityNow = await readTrustedTaskAuthority({
          sandbox, scopeId: record.scopeId, taskId: record.taskId, artifactRef: record.artifactRef,
          rights: { state: 'GRANTED', proofRef: record.rightsProofRef }, at: nowIso(now),
        })
        if (!authorityNow || authorityNow.ok !== true || authorityNow.value.taskIdentityHash !== record.intent.taskIdentityHash) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.TASK_NOT_SAVED, detail: 'task authority changed before accept' })
        }
        const artifactNow = await readFreshArtifact({ scopeId: record.scopeId, artifactRef: record.artifactRef, proofRef: record.rightsProofRef })
        if (!artifactNow.ok) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.ARTIFACT_UNAVAILABLE, detail: 'artifact revoked/expired during preflight' })
        }
        if (artifactNow.value.artifactSha256 !== record.artifactSha256 || artifactNow.value.byteLength !== record.byteLength) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.ARTIFACT_UNAVAILABLE, detail: 'artifact changed during preflight' })
        }
        const targetNow = trustedTarget(record.targetId)
        if (!targetNow || targetNow.kind !== record.targetKind) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.TARGET_REJECTED, detail: 'core target revoked during preflight' })
        }
        // The accept-time clock is sampled after every await (including the last artifact read), so a
        // crossing that happened during that final read cannot be hidden by an earlier timestamp.
        const acceptAt = nowIso(now)
        if (acceptAt === null) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.INPUT_INVALID, detail: 'accept clock unavailable' })
        }
        if (!(Date.parse(record.rightsExpiresAt) > Date.parse(acceptAt))) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.ARTIFACT_UNAVAILABLE, detail: 'rights/artifact expired at accept' })
        }
        if (!(Date.parse(artifactNow.value.expiresAt) > Date.parse(acceptAt))) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.ARTIFACT_UNAVAILABLE, detail: 'artifact expired at accept' })
        }
        if (record.permitId && (!record.intent || record.intent.permitId !== record.permitId)) {
          return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: RELAY_ERRORS.PERMIT_REQUIRED, detail: 'permit binding lost' })
        }
        const submitted = await backend.submit({
          delivery: publicRecord(record),
          artifact: { artifactRef: record.artifactRef, sha256: record.artifactSha256, byteLength: record.byteLength, durationMs: record.durationMs, format: record.format },
          target: resolved.value,
        })
        if (submitted && submitted.ok === true && submitted.accepted === true) {
          return await finalize(deliveryId, token, RELAY_STATES.ACCEPTED, null, { backendState: submitted.backendState || 'QUEUED', receiptId: submitted.receiptId || null })
        }
        if (submitted && submitted.unknown === true) {
          return await finalize(deliveryId, token, RELAY_STATES.UNKNOWN, { code: RELAY_ERRORS.OWNER_LOST, detail: 'backend result unknown' })
        }
        return await finalize(deliveryId, token, RELAY_STATES.FAILED, { code: (submitted && submitted.code) || RELAY_ERRORS.BACKEND_REJECTED, detail: (submitted && submitted.detail) || 'backend rejected' })
      } catch {
        // A thrown backend call may have had a side effect; never retry or switch backend.
        return await finalize(deliveryId, token, RELAY_STATES.UNKNOWN, { code: RELAY_ERRORS.OWNER_LOST, detail: 'backend threw during submit' })
      }
    },
    async cancel(deliveryId) {
      if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId)) return fail(RELAY_ERRORS.INPUT_INVALID)
      return run((store) => {
        const record = store.deliveries.find((item) => item.deliveryId === deliveryId)
        if (!record) return { value: fail(RELAY_ERRORS.NOT_FOUND) }
        if (record.state !== RELAY_STATES.QUEUED) return { value: fail(RELAY_ERRORS.CANCEL_TOO_LATE) }
        record.state = RELAY_STATES.CANCEL_REQUESTED
        record.cancel.requested = true
        record.cancel.requestedAt = nowIso(now)
        record.updatedAt = nowIso(now)
        return { persist: true, value: { ok: true, deliveryId, cancelState: 'REQUESTED', delivery: publicRecord(record) } }
      })
    },
    async confirmCancel(deliveryId) {
      if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId)) return fail(RELAY_ERRORS.INPUT_INVALID)
      return run((store) => {
        const record = store.deliveries.find((item) => item.deliveryId === deliveryId)
        if (!record) return { value: fail(RELAY_ERRORS.NOT_FOUND) }
        if (record.state !== RELAY_STATES.CANCEL_REQUESTED) return { value: fail(RELAY_ERRORS.CANCEL_TOO_LATE) }
        record.state = RELAY_STATES.CANCELLED
        record.cancel.confirmed = true
        record.cancel.confirmedAt = nowIso(now)
        record.updatedAt = nowIso(now)
        return { persist: true, value: { ok: true, deliveryId, delivery: publicRecord(record) } }
      })
    },
    async status(deliveryId) {
      if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId)) return fail(RELAY_ERRORS.INPUT_INVALID)
      return run((store) => {
        const record = store.deliveries.find((item) => item.deliveryId === deliveryId)
        return { value: record ? { ok: true, delivery: publicRecord(record) } : fail(RELAY_ERRORS.NOT_FOUND) }
      })
    },
    async mappings() {
      return run((store) => ({
        value: {
          ok: true,
          deliveries: store.deliveries.map((record) => ({
            taskId: record.taskId, deliveryId: record.deliveryId, intentId: record.intentId || null,
            backendRequestId: record.backendRequestId, backendId: record.backendId,
          })),
        },
      }))
    },
    async stats() {
      return run((store) => ({ value: { ok: true, count: store.deliveries.length, revision: store.revision } }))
    },
  }

  /**
   * Write one terminal result. The live owner token is retired only after the terminal state was
   * durably committed: a concurrent normal open must never recover a submit that is still being
   * confirmed. A transient lock contention is retried a bounded number of times; if the commit
   * still cannot be proven, the token stays live (conservative BUSY, recovered after process exit)
   * instead of turning a possibly-accepted delivery into UNKNOWN.
   */
  async function finalize(deliveryId, token, state, error, extra = {}) {
    let result = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await run((store) => {
        const record = store.deliveries.find((item) => item.deliveryId === deliveryId)
        if (!record || !record.owner || record.owner.token !== token) return { value: fail(RELAY_ERRORS.OWNER_LOST) }
        record.owner = null
        record.state = state
        record.error = error
        if (extra.backendState) record.backendState = extra.backendState
        if (extra.receiptId) record.receiptId = extra.receiptId
        record.updatedAt = nowIso(now)
        return { persist: true, value: { ok: true, delivery: publicRecord(record) } }
      })
      if (result && result.ok === true) {
        LIVE_SUBMITS.delete(token)
        return result
      }
      if (!result || result.code !== RELAY_ERRORS.STORE_BUSY) break
      await sleep(25)
    }
    return result
  }

  return handle
}

/* Pure component projection: one user-facing 鲸递 item with the legacy component ids as aliases.
 * It does not create a second install/health store; callers pass the existing feature-manifest
 * observations and receive a view. */
export function projectUnifiedRelayComponent(observations = {}) {
  const relay = observations.whaleRelay || observations['whale-relay'] || null
  const sender = observations.voiceSender || observations['voice-sender'] || null
  const stateOf = (item) => item && typeof item.state === 'string' ? item.state : 'UNKNOWN'
  const worst = [stateOf(relay), stateOf(sender)].includes('BLOCKED') ? 'BLOCKED'
    : [stateOf(relay), stateOf(sender)].includes('UNKNOWN') ? 'UNKNOWN'
      : [stateOf(relay), stateOf(sender)].includes('MISSING') ? 'MISSING'
        : 'VERIFIED'
  return Object.freeze({
    schemaVersion: 1,
    id: 'whale-relay',
    label: '鲸递',
    description: '统一投递协调；内部包含兼容的 Windows 发送模块，WeChatAgent 仍是独立身份依赖。',
    legacyAliases: Object.freeze(['whale-relay', 'voice-sender']),
    internalModules: Object.freeze([
      Object.freeze({ id: 'relay-core', label: '鲸递协调', state: stateOf(relay) }),
      Object.freeze({ id: 'voice-sender', label: 'Windows 发送模块（兼容）', state: stateOf(sender) }),
    ]),
    state: worst,
    realReady: false,
    mockOnly: true,
    installAsOneUnit: true,
    secondInstallStore: false,
  })
}
