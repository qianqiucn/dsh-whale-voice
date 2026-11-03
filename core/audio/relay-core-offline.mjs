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
export const RELAY_STORE_FILE = 'unified-relay-v1.json'
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
  UNSUPPORTED_CAPABILITY: 'RELAY_CORE_UNSUPPORTED_CAPABILITY',
  UNKNOWN_NO_RESEND: 'RELAY_CORE_UNKNOWN_NO_RESEND',
  CANCELLED: 'RELAY_CORE_CANCELLED',
  CANCEL_TOO_LATE: 'RELAY_CORE_CANCEL_TOO_LATE',
  BACKEND_REJECTED: 'RELAY_CORE_BACKEND_REJECTED',
  OWNER_LOST: 'RELAY_CORE_OWNER_LOST',
})

const DELIVERY_ID = /^delivery:[0-9a-f]{32}$/
const INTENT_ID = /^intent:[0-9a-f]{32}$/
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
const HANDOFF_KEYS = Object.freeze(['schemaVersion', 'scopeId', 'taskId', 'artifactRef', 'targetId', 'requestKey', 'rights'])
const RIGHTS_KEYS = Object.freeze(['state', 'proofRef'])

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
  return { schemaVersion: RELAY_CORE_SCHEMA_VERSION, revision: 0, deliveries: [], byDigest: {}, byRequestKey: {} }
}

function readStore(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyStore()
    throw error
  }
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error('corrupt') }
  if (!isObject(parsed) || parsed.schemaVersion !== RELAY_CORE_SCHEMA_VERSION || !Array.isArray(parsed.deliveries) || !isObject(parsed.byDigest)) throw new Error('corrupt')
  if (!isObject(parsed.byRequestKey)) parsed.byRequestKey = {}
  return parsed
}

function atomicWrite(file, value) {
  const temp = file + '.' + process.pid + '.' + crypto.randomBytes(8).toString('hex') + '.tmp'
  const handle = fs.openSync(temp, 'wx', 0o600)
  try {
    fs.writeFileSync(handle, JSON.stringify(value) + '\n', 'utf8')
    fs.fsyncSync(handle)
  } finally {
    fs.closeSync(handle)
  }
  fs.renameSync(temp, file)
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
          deliveryRequested: true,
          ownerState: 'SAVED',
          expiresAt: status.value.expiresAt,
          taskIdentityHash: sha256([
            'TASK_OWNER_SAVED_V2', scopeId, taskId, artifactRef, status.value.expiresAt,
            task.feature, task.taskType, task.voiceProfileId,
          ].join('|')),
        },
      }
    }
  }
  // Cover owner store (schema v3). Its SAVED record keeps `deliveryRequested:false` forever; the
  // relay issuance persisted by ensureDelivery is the versioned authorized handoff for this case.
  let status = null
  try { status = await coverStatus({ sandbox, scopeId, taskId, now: at }) } catch { status = null }
  if (!status || status.ok !== true || !status.value) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'task authority')
  if (status.value.state !== 'SAVED' || !status.value.master) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'task state')
  if (status.value.master.artifactRef !== artifactRef) return fail(RELAY_ERRORS.TASK_NOT_SAVED, 'artifact authority')
  return {
    ok: true,
    value: {
      kind: 'COVER_OWNER_SAVED_V3',
      deliveryRequested: false,
      ownerState: 'SAVED',
      expiresAt: status.value.master.expiresAt,
      taskIdentityHash: sha256([
        'COVER_OWNER_SAVED_V3', scopeId, taskId, artifactRef,
        status.value.master.sha256, status.value.master.byteLength, status.value.intentHash || '',
      ].join('|')),
    },
  }
}

export async function openUnifiedRelay({ sandbox, backend, targets = [], now = () => new Date().toISOString(), maxDeliveries = 256 } = {}) {
  const root = sandbox && typeof sandbox.root === 'string' ? sandbox.root : null
  if (!root || !isObject(backend) || typeof backend.id !== 'string' || !Number.isInteger(maxDeliveries) || maxDeliveries < 1 || maxDeliveries > 4096) {
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
  const storeFile = path.join(root, RELAY_STORE_FILE)
  const ownerToken = crypto.randomBytes(16).toString('hex')
  const ownerPid = process.pid
  const ownerHost = 'fixture-host'
  const queueKey = storeFile
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
        try { store = readStore(storeFile) } catch { return fail(RELAY_ERRORS.STORE_INVALID) }
        const outcome = await fn(store)
        if (outcome && outcome.persist === true) {
          if (!Number.isInteger(store.revision)) store.revision = 0
          store.revision += 1
          atomicWrite(storeFile, store)
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
    const expiresAt = read.value.artifact.expiresAt
    if (typeof expiresAt !== 'string' || Date.parse(expiresAt) <= Date.parse(at)) {
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
    async ensureDelivery({ handoff } = {}) {
      if (!isObject(handoff)) return fail(RELAY_ERRORS.INPUT_INVALID, 'handoff')
      const handoffKeys = ownKeysOf(handoff)
      if (!handoffKeys) return fail(RELAY_ERRORS.INPUT_INVALID, 'handoff')
      for (const key of handoffKeys) {
        // A caller-supplied task record is not an authority; only the persisted store is.
        if (typeof key !== 'string' || !HANDOFF_KEYS.includes(key)) return fail(RELAY_ERRORS.INPUT_INVALID, key === 'taskRecord' ? 'taskRecord' : 'handoff')
      }
      for (const key of HANDOFF_KEYS) if (!Object.prototype.hasOwnProperty.call(handoff, key)) return fail(RELAY_ERRORS.INPUT_INVALID, key)
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
      if (!Number.isInteger(artifact.durationMs) || artifact.durationMs < 1 || artifact.durationMs > 15 * 60 * 1000) {
        return fail(RELAY_ERRORS.ARTIFACT_UNAVAILABLE, 'artifact profile')
      }
      const expiresAt = fresh.value.expiresAt
      const digest = sha256([
        'relay-v2', authority.value.kind, authority.value.taskIdentityHash,
        handoff.taskId, artifact.artifactRef, artifact.sha256, target.targetId, target.kind,
        rights.proofRef, expiresAt,
      ].join('|'))
      return run((store) => {
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
          // unbound; the binding is then immutable from here on.
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
          intentId,
          intent: {
            version: 1,
            kind: authority.value.kind,
            taskIdentityHash: authority.value.taskIdentityHash,
            deliveryRequested: authority.value.deliveryRequested,
            authorizedBy: authority.value.kind === 'COVER_OWNER_SAVED_V3'
              ? 'RELAY_ISSUED_FOR_FROZEN_COVER'
              : 'PERSISTED_TASK_DELIVERY_INTENT',
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
