/* Whale Voice — isolated persistent task catalog (Plan 08-D-A, OFFLINE / FIXTURE_ONLY).
 *
 * A minimal, isolated catalog that persists only the initial AudioTask v1 record
 * (CREATED / BLOCKED_RIGHTS), issues owner task ids and prevents duplicate creation. It reuses
 * the existing trusted temporary sandbox capability, the existing AudioTask create/validate/
 * project functions and the existing shared Fixture input boundary. It never runs a provider or
 * the 08-C runner, never advances a task, never saves audio or creates delivery/Relay candidates.
 *
 * All filesystem access stays inside the sandbox root created by createConfigSandbox(). The
 * catalog is one fixed file with bounded bytes/entries; writes go through one shared queue per
 * capability, a temporary file, fsync, rename and a read-back verification. Rename-then-failure is
 * reported as WRITE_UNKNOWN and permanently locks further writes for that capability.
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
  let realMarker
  try {
    realMarker = fs.realpathSync(sandbox.marker)
  } catch {
    raise('SANDBOX_INVALID', '$')
  }
  if (!isInside(realRoot, realMarker)) raise('SANDBOX_INVALID', '$')
  let marker
  try {
    marker = JSON.parse(fs.readFileSync(sandbox.marker, 'utf8'))
  } catch {
    raise('SANDBOX_INVALID', '$')
  }
  if (!isPlainObject(marker) || marker.kind !== MARKER_KIND || marker.id !== sandbox.id) {
    raise('SANDBOX_INVALID', '$')
  }
  return realRoot
}

function assertTargetFile(root, target, stat) {
  if (!stat.isFile() || stat.isSymbolicLink()) raise('STORE_INVALID', '$')
  if (typeof stat.nlink === 'number' && stat.nlink > 1) raise('STORE_INVALID', '$')
  let real
  try {
    real = fs.realpathSync(target)
  } catch {
    raise('STORE_INVALID', '$')
  }
  if (!isInside(root, real)) raise('STORE_INVALID', '$')
}

function readRawTarget(state) {
  const root = checkSandbox(state)
  const target = path.join(state.sandbox.root, CATALOG_FILE)
  let stat
  try {
    stat = fs.lstatSync(target)
  } catch (error) {
    if (error && error.code === 'ENOENT') return { missing: true, bytes: null, digest: null }
    raise('SANDBOX_INVALID', '$')
  }
  assertTargetFile(root, target, stat)
  if (stat.size > MAX_BYTES) raise('RESOURCE_LIMIT', '$')
  let bytes
  try {
    bytes = fs.readFileSync(target)
  } catch {
    raise('SANDBOX_INVALID', '$')
  }
  if (bytes.length > MAX_BYTES) raise('RESOURCE_LIMIT', '$')
  return { missing: false, bytes, digest: sha256(bytes) }
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

function readCatalog(state) {
  if (state.locked) raise('CATALOG_UNKNOWN', '$')
  const raw = readRawTarget(state)
  if (raw.missing) {
    if (state.confirmedDigest !== undefined && state.confirmedDigest !== null) {
      state.locked = 'UNKNOWN'
      raise('STORE_CHANGED', '$')
    }
    if (state.confirmedDigest === undefined) state.confirmedDigest = null
    return { revision: 0, entries: [], digest: null, missing: true }
  }
  if (state.confirmedDigest !== undefined && state.confirmedDigest !== raw.digest) {
    state.locked = 'UNKNOWN'
    raise('STORE_CHANGED', '$')
  }
  const snapshot = parseSnapshot(raw.bytes)
  const parsed = validateSnapshot(snapshot)
  if (state.confirmedDigest === undefined) state.confirmedDigest = raw.digest
  return { revision: parsed.revision, entries: parsed.entries, digest: raw.digest, missing: false }
}

function cleanupOwnTemp(state, tempPath) {
  try {
    const stat = fs.lstatSync(tempPath)
    if (!stat.isFile() || stat.isSymbolicLink()) return
    if (typeof stat.nlink === 'number' && stat.nlink > 1) return
    const real = fs.realpathSync(tempPath)
    if (!isInside(state.sandbox.root, real)) return
    fs.unlinkSync(tempPath)
  } catch {
    // Best effort cleanup of this operation's own not-yet-committed temporary file.
  }
}

function writeCatalog(state, snapshot, baseDigest) {
  const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8')
  if (bytes.length > MAX_BYTES || snapshot.entries.length > MAX_ENTRIES) raise('RESOURCE_LIMIT', '$')

  const root = checkSandbox(state)
  const target = path.join(state.sandbox.root, CATALOG_FILE)

  const current = readRawTarget(state)
  const currentDigest = current.missing ? null : current.digest
  if (currentDigest !== baseDigest) {
    state.locked = 'UNKNOWN'
    raise('STORE_CHANGED', '$')
  }

  const tempName = CATALOG_FILE.replace(/\.json$/, '') + '.' + crypto.randomBytes(16).toString('hex') + '.tmp'
  const tempPath = path.join(state.sandbox.root, tempName)
  let fd = null
  let written = false
  let renameAttempted = false
  try {
    try {
      fd = fs.openSync(tempPath, 'wx', 0o600)
    } catch {
      raise('WRITE_REJECTED', '$')
    }
    try {
      const bufferOffset = 0
      fs.writeSync(fd, bytes, bufferOffset, bytes.length, 0)
      fs.fsyncSync(fd)
      fs.closeSync(fd)
      fd = null
      written = true
    } catch {
      if (fd !== null) {
        try {
          fs.closeSync(fd)
        } catch {
          // close failure does not change the pre-commit classification
        }
        fd = null
      }
      cleanupOwnTemp(state, tempPath)
      raise('WRITE_REJECTED', '$')
    }

    // Pre-commit identity and target checks (before the rename is attempted).
    const preRoot = checkSandbox(state)
    let tempStat
    try {
      tempStat = fs.lstatSync(tempPath)
    } catch {
      cleanupOwnTemp(state, tempPath)
      raise('WRITE_REJECTED', '$')
    }
    assertTargetFile(preRoot, tempPath, tempStat)
    const pre = readRawTarget(state)
    const preDigest = pre.missing ? null : pre.digest
    if (preDigest !== baseDigest) {
      cleanupOwnTemp(state, tempPath)
      state.locked = 'UNKNOWN'
      raise('STORE_CHANGED', '$')
    }

    renameAttempted = true
    try {
      fs.renameSync(tempPath, target)
    } catch {
      state.locked = 'UNKNOWN'
      raise('WRITE_UNKNOWN', '$')
    }

    // After the rename attempt, every failure is WRITE_UNKNOWN and locks the capability.
    let readBack
    try {
      const rootStat = fs.lstatSync(target)
      assertTargetFile(root, target, rootStat)
      readBack = fs.readFileSync(target)
    } catch {
      state.locked = 'UNKNOWN'
      raise('WRITE_UNKNOWN', '$')
    }
    if (!Buffer.isBuffer(readBack) || !readBack.equals(bytes)) {
      state.locked = 'UNKNOWN'
      raise('WRITE_UNKNOWN', '$')
    }
    try {
      const verified = validateSnapshot(parseSnapshot(readBack))
      if (verified.revision !== snapshot.revision) {
        state.locked = 'UNKNOWN'
        raise('WRITE_UNKNOWN', '$')
      }
    } catch (error) {
      state.locked = 'UNKNOWN'
      if (error instanceof CatalogFailure && error.key === 'WRITE_UNKNOWN') throw error
      raise('WRITE_UNKNOWN', '$')
    }

    state.confirmedDigest = sha256(bytes)
    return snapshot.revision
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // ignore close failure after a classified result
      }
    }
    if (!renameAttempted) cleanupOwnTemp(state, tempPath)
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
  if (keys.length !== 1 || keys[0] !== 'sandbox') raise('INVALID_INPUT', keys.some((key) => key !== 'sandbox') ? '<unknown-key>' : '$')
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
