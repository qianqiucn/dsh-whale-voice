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
import { isInside, isTrustedSandbox, normalizePath } from '../config-sandbox.mjs'
import { createAudioTaskRecord, validateAudioTaskRecord } from './task-contract.mjs'
import { TASK_FIXTURE_ERRORS } from './task-fixture-engine-internal.mjs'
import { PROVIDER_DISPATCH_ERRORS } from './provider-dispatch.mjs'

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

const MAX_MARKER_BYTES = 4 * 1024
const READ_CHUNK = 64 * 1024
const SCOPE_PATTERN = /^scope:fixture-[A-Za-z0-9_-]{1,32}$/
const KEY_PATTERN = /^key:fixture-[A-Za-z0-9_-]{1,48}$/
const TASK_ID_PATTERN = /^task:fixture-[0-9a-f]{32}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/
const MARKER_KIND = 'whale-voice-isolated-sandbox'
const SNAPSHOT_KEYS = Object.freeze(new Set(['schemaVersion', 'revision', 'entries']))
const CATALOG_ENTRY_KEYS = Object.freeze(new Set(['scopeId', 'idempotencyKey', 'identityHash', 'record']))
const CATALOG_SCHEMA_VERSION = 1
const INITIAL_STATES = Object.freeze(new Set(['CREATED', 'BLOCKED_RIGHTS']))
const OWNER_SNAPSHOT_KEYS = Object.freeze(new Set(['schemaVersion', 'revision', 'entries']))
const OWNER_ENTRY_KEYS = Object.freeze(new Set(['scopeId', 'taskId', 'birthIdentityHash', 'phase', 'record', 'completion']))
const OWNER_COMPLETION_KEYS = Object.freeze(new Set(['kind', 'reason']))
const OWNER_SNAPSHOT_SCHEMA_VERSION = 1
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

/** Internal failure carrying the neutral store key; each module maps it to its own code prefix. */
export class StoreFailure extends Error {
  constructor(key, errorPath) {
    super(key)
    this.key = key
    this.errorPath = errorPath
  }
}

export function storeReason(key) {
  return key.toLowerCase().replace(/_/g, ' ')
}

export function raiseStore(key, errorPath) {
  throw new StoreFailure(key, errorPath)
}

export function isStoreFailure(error) {
  return error instanceof StoreFailure
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function keySurface(object, allowed) {
  const keys = Reflect.ownKeys(object)
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) return 'unknown'
  }
  if (keys.length !== allowed.size) return 'count'
  return 'ok'
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map((item) => stableStringify(item)).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}'
}

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
      raiseStore(overflowKey === 'RESOURCE_LIMIT' ? 'SANDBOX_INVALID' : overflowKey, '$')
    }
    if (!Number.isInteger(read) || read < 0 || read > want) {
      raiseStore(overflowKey === 'RESOURCE_LIMIT' ? 'SANDBOX_INVALID' : overflowKey, '$')
    }
    if (read === 0) break
    chunks.push(Buffer.from(buffer.subarray(0, read)))
    total += read
    if (total > maxBytes) raiseStore(overflowKey, '$')
  }
  return Buffer.concat(chunks, total)
}

function sameIdentity(left, right) {
  if (!left || !right) return false
  if (!Number.isInteger(left.dev) || !Number.isInteger(left.ino)) return true
  return left.dev === right.dev && left.ino === right.ino
}

function assertRegularStat(stat, failKey) {
  if (!stat.isFile() || stat.isSymbolicLink()) raiseStore(failKey, '$')
  if (typeof stat.nlink === 'number' && stat.nlink > 1) raiseStore(failKey, '$')
}

function readBoundedPath(state, target, maxBytes, options) {
  const root = state.sandbox.root
  const failKey = options.failKey
  let pre
  try {
    pre = fs.lstatSync(target)
  } catch (error) {
    if (options.allowMissing && error && error.code === 'ENOENT') return { missing: true }
    raiseStore(failKey, '$')
  }
  assertRegularStat(pre, failKey)
  const real = fs.realpathSync(target)
  if (!isInside(root, real)) raiseStore(failKey, '$')

  let fd = null
  let failure = null
  let result = null
  try {
    fd = fs.openSync(target, 'r')
    const opened = fs.fstatSync(fd)
    assertRegularStat(opened, failKey)
    if (!sameIdentity(pre, opened)) raiseStore(failKey, '$')
    if (Number.isInteger(opened.size) && opened.size > maxBytes) raiseStore(options.sizeKey || failKey, '$')
    const bytes = readBoundedFd(fd, maxBytes, options.sizeKey || failKey)
    const ended = fs.fstatSync(fd)
    if (!sameIdentity(opened, ended) || ended.size !== bytes.length) raiseStore(failKey, '$')
    const after = fs.lstatSync(target)
    if (!sameIdentity(opened, after)) raiseStore(failKey, '$')
    result = {
      missing: false,
      bytes,
      digest: sha256(bytes),
      identity: { dev: opened.dev, ino: opened.ino },
    }
  } catch (error) {
    failure = error instanceof StoreFailure ? error : new StoreFailure(failKey, '$')
  }
  if (fd !== null) {
    const closing = fd
    fd = null
    try {
      fs.closeSync(closing)
    } catch {
      if (failure === null) failure = new StoreFailure(options.closeKey || failKey, '$')
    }
  }
  if (failure !== null) throw failure
  return result
}

export function checkSandbox(state) {
  const sandbox = state.sandbox
  if (!isTrustedSandbox(sandbox)) raiseStore('SANDBOX_INVALID', '$')

  let rootStat
  try {
    rootStat = fs.lstatSync(sandbox.root)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) raiseStore('SANDBOX_INVALID', '$')

  let realRoot
  try {
    realRoot = fs.realpathSync(sandbox.root)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (normalizePath(realRoot) !== normalizePath(sandbox.root)) raiseStore('SANDBOX_INVALID', '$')
  if (!isInside(sandbox.tempRoot, realRoot)) raiseStore('SANDBOX_INVALID', '$')
  if (
    Number.isInteger(sandbox.dev) &&
    Number.isInteger(sandbox.ino) &&
    (rootStat.dev !== sandbox.dev || rootStat.ino !== sandbox.ino)
  ) {
    raiseStore('SANDBOX_INVALID', '$')
  }

  let markerStat
  try {
    markerStat = fs.lstatSync(sandbox.marker)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) raiseStore('SANDBOX_INVALID', '$')
  const markerRead = readBoundedPath(state, sandbox.marker, MAX_MARKER_BYTES, {
    failKey: 'SANDBOX_INVALID',
    sizeKey: 'SANDBOX_INVALID',
    closeKey: 'SANDBOX_INVALID',
  })
  if (markerRead.missing) raiseStore('SANDBOX_INVALID', '$')
  const text = markerRead.bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(markerRead.bytes)) raiseStore('SANDBOX_INVALID', '$')
  let marker
  try {
    marker = JSON.parse(text)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (!isPlainObject(marker) || marker.kind !== MARKER_KIND || marker.id !== sandbox.id) {
    raiseStore('SANDBOX_INVALID', '$')
  }
  return realRoot
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
  if (snapshot.schemaVersion !== OWNER_SNAPSHOT_SCHEMA_VERSION) raiseStore('STORE_INVALID', '$')
  if (!Array.isArray(snapshot.entries)) raiseStore('STORE_INVALID', '$')
  if (snapshot.entries.length > MAX_OWNER_ENTRIES) raiseStore('RESOURCE_LIMIT', '$')
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) raiseStore('STORE_INVALID', '$')

  const seen = new Set()
  let weight = 0
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
  return { revision: snapshot.revision, entries }
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
      return { revision: 0, entries: [], digest: null, missing: true, snapshot: { revision: 0, entries: [] } }
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
      return { revision: parsed.revision, entries: parsed.entries, digest: raw.digest, missing: false, snapshot: parsed }
    }

    if (file.confirmedDigest === raw.digest) {
      if (parseError) throw parseError
      finishRead(raw.identity)
      return { revision: parsed.revision, entries: parsed.entries, digest: raw.digest, missing: false, snapshot: parsed }
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
      return { missing: true, revision: 0, entries: [], digest: null, snapshot: { revision: 0, entries: [] } }
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
    return { missing: false, revision: parsed.revision, entries: parsed.entries, digest: raw.digest, snapshot: parsed }
  }

  const associationsGate = (snapshot) => {
    if (spec.associations === true) verifyOwnerAssociations(state, snapshot)
  }

  function write(bytes, baseDigest, expectedRevision) {
    if (bytes.length > spec.maxBytes) raiseStore('RESOURCE_LIMIT', '$')

    checkSandbox(state)
    const root = state.sandbox.root
    const fileTarget = target()

    const current = readVerified(baseDigest)
    associationsGate(current.snapshot)

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

      // Pre-rename association gate: the exact bytes about to be committed are parsed and the
      // latest birth registry is read again. A birth change between the temp fsync and the rename
      // stops the commit here, so the confirmed CLAIMED bytes stay on disk.
      associationsGate(spec.parse(bytes))

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
        associationsGate(verified)
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
