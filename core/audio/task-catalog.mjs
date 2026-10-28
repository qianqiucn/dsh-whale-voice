/* Whale Voice — isolated persistent task catalog (Plan 08-D-A, OFFLINE / FIXTURE_ONLY).
 *
 * A minimal, isolated catalog that persists only the initial AudioTask v1 record
 * (CREATED / BLOCKED_RIGHTS), issues owner task ids and prevents duplicate creation. It reuses
 * the existing trusted temporary sandbox capability, the existing AudioTask create/validate/
 * project functions and the existing shared Fixture input boundary. It never runs a provider or
 * the 08-C runner, never advances a task, never saves audio or creates delivery/Relay candidates.
 *
 * All filesystem access stays inside the sandbox root created by createConfigSandbox(). Every
 * read goes through a bounded file-descriptor read (catalog 128 KiB+1, marker 4 KiB+1), every
 * transaction re-checks the capability/root/marker identity, writes are fully written before a
 * rename is attempted, and rename-then-failure is WRITE_UNKNOWN with a permanent shared lock.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { isInside, isTrustedSandbox, normalizePath } from '../config-sandbox.mjs'
import {
  createAudioTaskRecord,
  projectAudioTask,
  validateAudioTaskRecord,
} from './task-contract.mjs'

export const TASK_CATALOG_SCHEMA_VERSION = 1

const ERROR_KEYS = Object.freeze([
  'INVALID_INPUT',
  'RESOURCE_LIMIT',
  'UNSUPPORTED_VERSION',
  'SANDBOX_INVALID',
  'DRAFT_REJECTED',
  'STORE_INVALID',
  'STORE_CHANGED',
  'IDEMPOTENCY_CONFLICT',
  'ID_COLLISION',
  'NOT_FOUND',
  'WRITE_REJECTED',
  'WRITE_UNKNOWN',
  'CATALOG_UNKNOWN',
  'DEPENDENCY_FAILURE',
  'INTERNAL_FAILURE',
])

/** Fixed error protocol. Every value is `TASK_CATALOG_` plus the key itself. */
export const TASK_CATALOG_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'TASK_CATALOG_' + key])),
)

const CATALOG_FILE = 'audio-task-catalog-v1.json'
const MAX_ENTRIES = 32
const MAX_BYTES = 128 * 1024
const MAX_MARKER_BYTES = 4 * 1024
const READ_CHUNK = 64 * 1024
const SCOPE_PATTERN = /^scope:fixture-[A-Za-z0-9_-]{1,32}$/
const KEY_PATTERN = /^key:fixture-[A-Za-z0-9_-]{1,48}$/
const TASK_ID_PATTERN = /^task:fixture-[0-9a-f]{32}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/
const PLACEHOLDER_TASK_ID = 'task:fixture-catalog-validation'

const RESERVE_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'idempotencyKey', 'draft', 'observedAt']))
const GET_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId']))
const DRAFT_KEYS = Object.freeze(
  new Set(['schemaVersion', 'feature', 'taskType', 'source', 'voiceProfileId', 'deliveryRequested', 'rights']),
)
const SNAPSHOT_KEYS = Object.freeze(new Set(['schemaVersion', 'revision', 'entries']))
const ENTRY_KEYS = Object.freeze(new Set(['scopeId', 'idempotencyKey', 'identityHash', 'record']))

const INITIAL_STATES = Object.freeze(new Set(['CREATED', 'BLOCKED_RIGHTS']))
const MARKER_KIND = 'whale-voice-isolated-sandbox'

const STATES = new WeakMap()

class CatalogFailure extends Error {
  constructor(key, errorPath) {
    super(key)
    this.key = key
    this.errorPath = errorPath
  }
}

function reasonOf(key) {
  return key.toLowerCase().replace(/_/g, ' ')
}

function failure(key, errorPath) {
  return deepFreezeFixtureValue({
    ok: false,
    errors: [{ code: TASK_CATALOG_ERRORS[key], path: errorPath, reason: reasonOf(key) }],
  })
}

function raise(key, errorPath) {
  throw new CatalogFailure(key, errorPath)
}

function toFailure(error) {
  if (error instanceof CatalogFailure) return failure(error.key, error.errorPath)
  return failure('INTERNAL_FAILURE', '$')
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function keySurface(object, allowed) {
  const keys = Reflect.ownKeys(object)
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) return 'unknown'
  }
  if (keys.length !== allowed.size) return 'count'
  return 'ok'
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map((item) => stableStringify(item)).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}'
}

function identityOf(record) {
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

function identityHashOf(record) {
  return sha256(Buffer.from(JSON.stringify(identityOf(record)), 'utf8'))
}

function getState(sandbox) {
  let state = STATES.get(sandbox)
  if (!state) {
    state = {
      sandbox,
      tail: Promise.resolve(),
      confirmedDigest: undefined,
      locked: null,
    }
    STATES.set(sandbox, state)
  }
  return state
}

function enqueue(state, run) {
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

function lockUnknown(state) {
  state.locked = 'UNKNOWN'
}

/** Bounded fd read: never allocates or reads more than maxBytes+1. */
function readBoundedFd(fd, maxBytes, overflowKey) {
  const limit = maxBytes + 1
  const buffer = Buffer.allocUnsafe(READ_CHUNK)
  const chunks = []
  let total = 0
  while (total < limit) {
    const want = Math.min(buffer.length, limit - total)
    let read
    try {
      read = fs.readSync(fd, buffer, 0, want, total)
    } catch {
      raise(overflowKey === 'RESOURCE_LIMIT' ? 'SANDBOX_INVALID' : overflowKey, '$')
    }
    if (!Number.isInteger(read) || read < 0 || read > want) {
      raise(overflowKey === 'RESOURCE_LIMIT' ? 'SANDBOX_INVALID' : overflowKey, '$')
    }
    if (read === 0) break
    chunks.push(Buffer.from(buffer.subarray(0, read)))
    total += read
    if (total > maxBytes) raise(overflowKey, '$')
  }
  return Buffer.concat(chunks, total)
}

function sameIdentity(left, right) {
  if (!left || !right) return false
  if (!Number.isInteger(left.dev) || !Number.isInteger(left.ino)) return true
  return left.dev === right.dev && left.ino === right.ino
}

function assertRegularStat(stat, failKey) {
  if (!stat.isFile() || stat.isSymbolicLink()) raise(failKey, '$')
  if (typeof stat.nlink === 'number' && stat.nlink > 1) raise(failKey, '$')
}

function readBoundedPath(state, target, maxBytes, options) {
  const root = state.sandbox.root
  const failKey = options.failKey
  let pre
  try {
    pre = fs.lstatSync(target)
  } catch (error) {
    if (options.allowMissing && error && error.code === 'ENOENT') return { missing: true }
    raise(failKey, '$')
  }
  assertRegularStat(pre, failKey)
  const real = fs.realpathSync(target)
  if (!isInside(root, real)) raise(failKey, '$')

  let fd = null
  let failure = null
  let result = null
  try {
    fd = fs.openSync(target, 'r')
    const opened = fs.fstatSync(fd)
    assertRegularStat(opened, failKey)
    if (!sameIdentity(pre, opened)) raise(failKey, '$')
    if (Number.isInteger(opened.size) && opened.size > maxBytes) raise(options.sizeKey || failKey, '$')
    const bytes = readBoundedFd(fd, maxBytes, options.sizeKey || failKey)
    const ended = fs.fstatSync(fd)
    if (!sameIdentity(opened, ended) || ended.size !== bytes.length) raise(failKey, '$')
    const after = fs.lstatSync(target)
    if (!sameIdentity(opened, after)) raise(failKey, '$')
    result = {
      missing: false,
      bytes,
      digest: sha256(bytes),
      identity: { dev: opened.dev, ino: opened.ino },
    }
  } catch (error) {
    failure = error instanceof CatalogFailure ? error : new CatalogFailure(failKey, '$')
  }
  if (fd !== null) {
    const closing = fd
    fd = null
    try {
      fs.closeSync(closing)
    } catch {
      if (failure === null) failure = new CatalogFailure(options.closeKey || failKey, '$')
    }
  }
  if (failure !== null) throw failure
  return result
}

function checkSandbox(state) {
  const sandbox = state.sandbox
  if (!isTrustedSandbox(sandbox)) raise('SANDBOX_INVALID', '$')

  let rootStat
  try {
    rootStat = fs.lstatSync(sandbox.root)
  } catch {
    raise('SANDBOX_INVALID', '$')
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) raise('SANDBOX_INVALID', '$')

  let realRoot
  try {
    realRoot = fs.realpathSync(sandbox.root)
  } catch {
    raise('SANDBOX_INVALID', '$')
  }
  if (normalizePath(realRoot) !== normalizePath(sandbox.root)) raise('SANDBOX_INVALID', '$')
  if (!isInside(sandbox.tempRoot, realRoot)) raise('SANDBOX_INVALID', '$')
  if (
    Number.isInteger(sandbox.dev) &&
    Number.isInteger(sandbox.ino) &&
    (rootStat.dev !== sandbox.dev || rootStat.ino !== sandbox.ino)
  ) {
    raise('SANDBOX_INVALID', '$')
  }

  let markerStat
  try {
    markerStat = fs.lstatSync(sandbox.marker)
  } catch {
    raise('SANDBOX_INVALID', '$')
  }
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) raise('SANDBOX_INVALID', '$')
  const markerRead = readBoundedPath(state, sandbox.marker, MAX_MARKER_BYTES, {
    failKey: 'SANDBOX_INVALID',
    sizeKey: 'SANDBOX_INVALID',
    closeKey: 'SANDBOX_INVALID',
  })
  if (markerRead.missing) raise('SANDBOX_INVALID', '$')
  const text = markerRead.bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(markerRead.bytes)) raise('SANDBOX_INVALID', '$')
  let marker
  try {
    marker = JSON.parse(text)
  } catch {
    raise('SANDBOX_INVALID', '$')
  }
  if (!isPlainObject(marker) || marker.kind !== MARKER_KIND || marker.id !== sandbox.id) {
    raise('SANDBOX_INVALID', '$')
  }
  return realRoot
}

function parseSnapshot(bytes) {
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) raise('STORE_INVALID', '$')
  let snapshot
  try {
    snapshot = JSON.parse(text)
  } catch {
    raise('STORE_INVALID', '$')
  }
  return snapshot
}

function canonicalRecord(record) {
  let validated
  try {
    validated = validateAudioTaskRecord(record)
  } catch {
    raise('STORE_INVALID', '$')
  }
  if (!validated || typeof validated !== 'object' || typeof validated.ok !== 'boolean') {
    raise('STORE_INVALID', '$')
  }
  if (validated.ok === false) raise('STORE_INVALID', '$')
  const value = validated.value
  if (!isPlainObject(value)) raise('STORE_INVALID', '$')
  if (!TASK_ID_PATTERN.test(value.taskId)) raise('STORE_INVALID', '$')
  if (!INITIAL_STATES.has(value.state)) raise('STORE_INVALID', '$')
  if (value.outputArtifactRef !== null) raise('STORE_INVALID', '$')
  if (!isPlainObject(value.cancel) || value.cancel.requested !== false || value.cancel.confirmed !== false) {
    raise('STORE_INVALID', '$')
  }
  if (
    !isPlainObject(value.delivery) ||
    value.delivery.state !== 'NOT_REQUESTED' ||
    value.delivery.deliveryId !== null
  ) {
    raise('STORE_INVALID', '$')
  }
  if (value.lastError !== null) raise('STORE_INVALID', '$')
  if (value.mockOnly !== true || value.realOperationAllowed !== false) raise('STORE_INVALID', '$')

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
    raise('STORE_INVALID', '$')
  }
  if (!recreated || recreated.ok !== true) raise('STORE_INVALID', '$')
  if (stableStringify(recreated.value) !== stableStringify(record)) raise('STORE_INVALID', '$')
  return recreated.value
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) raise('STORE_INVALID', '$')
  if (keySurface(snapshot, SNAPSHOT_KEYS) !== 'ok') raise('STORE_INVALID', '$')
  if (snapshot.schemaVersion !== TASK_CATALOG_SCHEMA_VERSION) raise('STORE_INVALID', '$')
  if (!Array.isArray(snapshot.entries)) raise('STORE_INVALID', '$')
  if (snapshot.entries.length > MAX_ENTRIES) raise('RESOURCE_LIMIT', '$')
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) raise('STORE_INVALID', '$')
  if (snapshot.revision !== snapshot.entries.length) raise('STORE_INVALID', '$')

  const taskIds = new Set()
  const pairKeys = new Set()
  const entries = []
  for (const entry of snapshot.entries) {
    if (!isPlainObject(entry) || keySurface(entry, ENTRY_KEYS) !== 'ok') raise('STORE_INVALID', '$')
    if (typeof entry.scopeId !== 'string' || !SCOPE_PATTERN.test(entry.scopeId)) raise('STORE_INVALID', '$')
    if (typeof entry.idempotencyKey !== 'string' || !KEY_PATTERN.test(entry.idempotencyKey)) {
      raise('STORE_INVALID', '$')
    }
    if (typeof entry.identityHash !== 'string' || !HASH_PATTERN.test(entry.identityHash)) {
      raise('STORE_INVALID', '$')
    }
    const record = canonicalRecord(entry.record)
    if (taskIds.has(record.taskId)) raise('STORE_INVALID', '$')
    taskIds.add(record.taskId)
    const pair = entry.scopeId + '\u0000' + entry.idempotencyKey
    if (pairKeys.has(pair)) raise('STORE_INVALID', '$')
    pairKeys.add(pair)
    if (identityHashOf(record) !== entry.identityHash) raise('STORE_INVALID', '$')
    entries.push({
      scopeId: entry.scopeId,
      idempotencyKey: entry.idempotencyKey,
      identityHash: entry.identityHash,
      record,
    })
  }
  return { revision: snapshot.revision, entries }
}

function readCatalogFile(state) {
  checkSandbox(state)
  const target = path.join(state.sandbox.root, CATALOG_FILE)
  return readBoundedPath(state, target, MAX_BYTES, {
    failKey: 'STORE_INVALID',
    sizeKey: 'RESOURCE_LIMIT',
    closeKey: 'SANDBOX_INVALID',
    allowMissing: true,
  })
}

/** Transaction-end identity check for read paths. Failure locks the capability as UNKNOWN. */
function finishRead(state, identity) {
  try {
    checkSandbox(state)
    const target = path.join(state.sandbox.root, CATALOG_FILE)
    if (identity) {
      const stat = fs.lstatSync(target)
      if (!stat.isFile() || stat.isSymbolicLink() || !sameIdentity(stat, identity)) throw new Error('identity')
    } else {
      try {
        fs.lstatSync(target)
        throw new Error('appeared')
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }
    }
  } catch {
    lockUnknown(state)
    raise('WRITE_UNKNOWN', '$')
  }
}

function readCatalog(state) {
  if (state.locked) raise('CATALOG_UNKNOWN', '$')
  let raw
  try {
    raw = readCatalogFile(state)
  } catch (error) {
    if (
      state.confirmedDigest !== undefined &&
      error instanceof CatalogFailure &&
      (error.key === 'STORE_INVALID' || error.key === 'RESOURCE_LIMIT')
    ) {
      lockUnknown(state)
    }
    throw error
  }

  if (raw.missing) {
    if (state.confirmedDigest === undefined) state.confirmedDigest = null
    if (state.confirmedDigest !== null) {
      lockUnknown(state)
      raise('STORE_CHANGED', '$')
    }
    finishRead(state, null)
    return { revision: 0, entries: [], digest: null, missing: true }
  }

  let parsed = null
  let parseError = null
  try {
    parsed = validateSnapshot(parseSnapshot(raw.bytes))
  } catch (error) {
    parseError = error
  }

  if (state.confirmedDigest === undefined) {
    if (parseError) throw parseError
    state.confirmedDigest = raw.digest
    finishRead(state, raw.identity)
    return { revision: parsed.revision, entries: parsed.entries, digest: raw.digest, missing: false }
  }

  if (state.confirmedDigest === raw.digest) {
    if (parseError) throw parseError
    finishRead(state, raw.identity)
    return { revision: parsed.revision, entries: parsed.entries, digest: raw.digest, missing: false }
  }

  // External content change: corrupt/limit errors keep their specific classification,
  // a legal but different snapshot is STORE_CHANGED. Both stop further writes.
  lockUnknown(state)
  if (parseError) throw parseError
  raise('STORE_CHANGED', '$')
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

/** Full validation re-read used by the write path (current and pre-commit). */
function readVerifiedCatalog(state, baseDigest) {
  let raw
  try {
    raw = readCatalogFile(state)
  } catch (error) {
    if (error instanceof CatalogFailure && (error.key === 'STORE_INVALID' || error.key === 'RESOURCE_LIMIT')) {
      lockUnknown(state)
    }
    throw error
  }
  if (raw.missing) {
    if (baseDigest !== null) {
      lockUnknown(state)
      raise('STORE_CHANGED', '$')
    }
    return { missing: true, revision: 0, entries: [], digest: null }
  }
  let parsed
  try {
    parsed = validateSnapshot(parseSnapshot(raw.bytes))
  } catch (error) {
    lockUnknown(state)
    throw error
  }
  if (raw.digest !== baseDigest) {
    lockUnknown(state)
    raise('STORE_CHANGED', '$')
  }
  return { missing: false, revision: parsed.revision, entries: parsed.entries, digest: raw.digest }
}

function writeCatalog(state, snapshot, baseDigest) {
  const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8')
  if (bytes.length > MAX_BYTES || snapshot.entries.length > MAX_ENTRIES) raise('RESOURCE_LIMIT', '$')

  checkSandbox(state)
  const root = state.sandbox.root
  const target = path.join(root, CATALOG_FILE)

  readVerifiedCatalog(state, baseDigest)

  const tempName = CATALOG_FILE.replace(/\.json$/, '') + '.' + crypto.randomBytes(16).toString('hex') + '.tmp'
  const tempPath = path.join(root, tempName)
  let fd = null
  let tempIdentity = null
  let renameAttempted = false
  let cleanupBlocked = false
  const attemptCleanup = () => {
    if (cleanupBlocked || tempIdentity === null) return
    const status = cleanupOwnTemp(state, tempPath, tempIdentity)
    if (status !== 'unlinked') cleanupBlocked = true
  }
  try {
    try {
      fd = fs.openSync(tempPath, 'wx', 0o600)
    } catch {
      raise('WRITE_REJECTED', '$')
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
          raise('WRITE_REJECTED', '$')
        }
        if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
          raise('WRITE_REJECTED', '$')
        }
        offset += written
      }
      fs.fsyncSync(fd)
      // The write lease is revoked before the only close attempt: a close that throws
      // (after possibly releasing the descriptor) must never be retried in the catch/finally.
      const closing = fd
      fd = null
      try {
        fs.closeSync(closing)
      } catch {
        raise('WRITE_REJECTED', '$')
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
      // A lost sandbox/marker takes precedence and forbids automatic cleanup.
      try {
        checkSandbox(state)
      } catch (sandboxError) {
        cleanupBlocked = true
        throw sandboxError
      }
      attemptCleanup()
      if (error instanceof CatalogFailure) throw error
      raise('WRITE_REJECTED', '$')
    }

    // Full content/identity check of the temporary file before any commit attempt.
    let tempRead
    try {
      tempRead = readBoundedPath(state, tempPath, MAX_BYTES, {
        failKey: 'STORE_INVALID',
        sizeKey: 'RESOURCE_LIMIT',
        closeKey: 'WRITE_REJECTED',
      })
    } catch (error) {
      try {
        checkSandbox(state)
      } catch (sandboxError) {
        cleanupBlocked = true
        throw sandboxError
      }
      attemptCleanup()
      if (error instanceof CatalogFailure && error.key === 'WRITE_REJECTED') throw error
      lockUnknown(state)
      raise('STORE_CHANGED', '$')
    }
    if (!sameIdentity(tempRead.identity, tempIdentity) || tempRead.bytes.length !== bytes.length || !tempRead.bytes.equals(bytes)) {
      // The path no longer names this operation's file: never commit or delete it.
      cleanupBlocked = true
      lockUnknown(state)
      raise('STORE_CHANGED', '$')
    }

    let pre
    try {
      pre = readVerifiedCatalog(state, baseDigest)
    } catch (error) {
      try {
        checkSandbox(state)
        attemptCleanup()
      } catch {
        cleanupBlocked = true
      }
      throw error
    }

    renameAttempted = true
    try {
      fs.renameSync(tempPath, target)
    } catch {
      lockUnknown(state)
      raise('WRITE_UNKNOWN', '$')
    }

    // After the rename attempt every failure is WRITE_UNKNOWN and locks the capability.
    try {
      checkSandbox(state)
      const targetStat = fs.lstatSync(target)
      assertRegularStat(targetStat, 'STORE_INVALID')
      if (!sameIdentity(targetStat, tempIdentity)) raise('STORE_INVALID', '$')
      const readBack = readBoundedPath(state, target, MAX_BYTES, {
        failKey: 'STORE_INVALID',
        sizeKey: 'RESOURCE_LIMIT',
      })
      if (readBack.missing || !sameIdentity(readBack.identity, tempIdentity)) raise('STORE_INVALID', '$')
      if (!readBack.bytes.equals(bytes)) raise('STORE_INVALID', '$')
      const verified = validateSnapshot(parseSnapshot(readBack.bytes))
      if (verified.revision !== snapshot.revision) raise('STORE_INVALID', '$')
      checkSandbox(state)
      state.confirmedDigest = sha256(bytes)
      return snapshot.revision
    } catch {
      lockUnknown(state)
      raise('WRITE_UNKNOWN', '$')
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

function successValue(outcome, revision, task) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: TASK_CATALOG_SCHEMA_VERSION,
      outcome,
      revision,
      task,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

function projectOrFail(record) {
  let projected
  try {
    projected = projectAudioTask(record)
  } catch {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (!projected || typeof projected !== 'object' || typeof projected.ok !== 'boolean') {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (projected.ok === false) raise('DEPENDENCY_FAILURE', '$')
  if (!isPlainObject(projected.value)) raise('DEPENDENCY_FAILURE', '$')
  return projected.value
}

function readRootInput(input, allowed) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) raise(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) raise('INVALID_INPUT', '$')
  const surface = keySurface(payload, allowed)
  if (surface === 'unknown') raise('INVALID_INPUT', '<unknown-key>')
  if (surface !== 'ok') raise('INVALID_INPUT', '$')
  if (payload.schemaVersion !== TASK_CATALOG_SCHEMA_VERSION) raise('UNSUPPORTED_VERSION', 'schemaVersion')
  return payload
}

function readDraft(payload) {
  if (!isPlainObject(payload)) raise('INVALID_INPUT', 'draft')
  for (const key of Reflect.ownKeys(payload)) {
    if (typeof key !== 'string' || !DRAFT_KEYS.has(key)) raise('INVALID_INPUT', 'draft')
  }
  for (const key of ['schemaVersion', 'feature', 'taskType', 'source', 'voiceProfileId', 'rights']) {
    if (!hasOwn(payload, key)) raise('INVALID_INPUT', 'draft')
  }
  const deliveryRequested = hasOwn(payload, 'deliveryRequested') ? payload.deliveryRequested : false
  return {
    schemaVersion: payload.schemaVersion,
    taskId: PLACEHOLDER_TASK_ID,
    feature: payload.feature,
    taskType: payload.taskType,
    source: payload.source,
    voiceProfileId: payload.voiceProfileId,
    deliveryRequested,
    rights: payload.rights,
  }
}

function draftFromRecord(record, taskId) {
  return {
    schemaVersion: record.schemaVersion,
    taskId,
    feature: record.feature,
    taskType: record.taskType,
    source: { kind: record.source.kind, ref: record.source.ref },
    voiceProfileId: record.voiceProfileId,
    deliveryRequested: record.deliveryRequested,
    rights: { state: record.rights.state },
  }
}

function createInitialRecord(draft, observedAt) {
  let created
  try {
    created = createAudioTaskRecord(draft, { observedAt })
  } catch {
    raise('DRAFT_REJECTED', 'draft')
  }
  if (!created || typeof created !== 'object' || typeof created.ok !== 'boolean') {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (created.ok === false) raise('DRAFT_REJECTED', 'draft')
  let validated
  try {
    validated = validateAudioTaskRecord(created.value)
  } catch {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (!validated || validated.ok !== true) raise('DRAFT_REJECTED', 'draft')
  if (!INITIAL_STATES.has(validated.value.state)) raise('DRAFT_REJECTED', 'draft')
  return validated.value
}

async function reserveOnce(state, input) {
  if (state.locked) return failure('CATALOG_UNKNOWN', '$')
  try {
    const payload = readRootInput(input, RESERVE_KEYS)
    if (typeof payload.scopeId !== 'string' || !SCOPE_PATTERN.test(payload.scopeId)) {
      raise('INVALID_INPUT', 'scopeId')
    }
    if (typeof payload.idempotencyKey !== 'string' || !KEY_PATTERN.test(payload.idempotencyKey)) {
      raise('INVALID_INPUT', 'idempotencyKey')
    }
    const draft = readDraft(payload.draft)
    const canonical = createInitialRecord(draft, payload.observedAt)
    const identityHash = identityHashOf(canonical)

    const catalog = readCatalog(state)
    const existing = catalog.entries.find(
      (entry) => entry.scopeId === payload.scopeId && entry.idempotencyKey === payload.idempotencyKey,
    )
    if (existing) {
      if (existing.identityHash !== identityHash) raise('IDEMPOTENCY_CONFLICT', '$')
      return successValue('EXISTING', catalog.revision, projectOrFail(existing.record))
    }

    let taskId = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = 'task:fixture-' + crypto.randomBytes(16).toString('hex')
      if (!catalog.entries.some((entry) => entry.record.taskId === candidate)) {
        taskId = candidate
        break
      }
    }
    if (taskId === null) raise('ID_COLLISION', '$')

    const finalDraft = draftFromRecord(canonical, taskId)
    const finalRecord = createInitialRecord(finalDraft, payload.observedAt)
    if (!INITIAL_STATES.has(finalRecord.state)) raise('DEPENDENCY_FAILURE', '$')
    if (identityHashOf(finalRecord) !== identityHash) raise('DEPENDENCY_FAILURE', '$')

    const entry = {
      scopeId: payload.scopeId,
      idempotencyKey: payload.idempotencyKey,
      identityHash,
      record: finalRecord,
    }
    const nextSnapshot = {
      schemaVersion: TASK_CATALOG_SCHEMA_VERSION,
      revision: catalog.revision + 1,
      entries: [...catalog.entries, entry],
    }
    const revision = writeCatalog(state, nextSnapshot, catalog.digest)
    return successValue('CREATED', revision, projectOrFail(finalRecord))
  } catch (error) {
    return toFailure(error)
  }
}

async function getOnce(state, input) {
  if (state.locked) return failure('CATALOG_UNKNOWN', '$')
  try {
    const payload = readRootInput(input, GET_KEYS)
    if (typeof payload.scopeId !== 'string' || !SCOPE_PATTERN.test(payload.scopeId)) {
      raise('INVALID_INPUT', 'scopeId')
    }
    if (typeof payload.taskId !== 'string' || !TASK_ID_PATTERN.test(payload.taskId)) {
      raise('INVALID_INPUT', 'taskId')
    }
    const catalog = readCatalog(state)
    const entry = catalog.entries.find(
      (item) => item.scopeId === payload.scopeId && item.record.taskId === payload.taskId,
    )
    if (!entry) raise('NOT_FOUND', '$')
    return successValue('FOUND', catalog.revision, projectOrFail(entry.record))
  } catch (error) {
    return toFailure(error)
  }
}

function readSandboxOption(options) {
  if (!isPlainObject(options)) raise('INVALID_INPUT', '$')
  const keys = Reflect.ownKeys(options)
  if (keys.length !== 1 || keys[0] !== 'sandbox') {
    raise('INVALID_INPUT', keys.length === 0 ? '$' : '<unknown-key>')
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, 'sandbox')
  if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
    raise('INVALID_INPUT', '$')
  }
  if (!isTrustedSandbox(descriptor.value)) raise('SANDBOX_INVALID', '$')
  return descriptor.value
}

/**
 * Open one isolated persistent task catalog over a trusted temporary sandbox capability.
 * @param {{sandbox: object}} options
 * @returns {Promise<{ok:true,value:{reserve:Function,get:Function}}|{ok:false,errors:Array<object>}>}
 */
export async function openFixtureTaskCatalog(options) {
  let sandbox
  try {
    sandbox = readSandboxOption(options)
  } catch (error) {
    return toFailure(error)
  }
  const state = getState(sandbox)
  try {
    return await enqueue(state, async () => {
      try {
        if (state.locked) return failure('CATALOG_UNKNOWN', '$')
        checkSandbox(state)
        readCatalog(state)
        const handle = Object.freeze({
          reserve: (input) => enqueue(state, () => reserveOnce(state, input)),
          get: (input) => enqueue(state, () => getOnce(state, input)),
        })
        return deepFreezeFixtureValue({ ok: true, value: handle })
      } catch (error) {
        return toFailure(error)
      }
    })
  } catch (error) {
    return toFailure(error)
  }
}
