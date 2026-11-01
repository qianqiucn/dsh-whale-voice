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

/** One serialised cover-store state per trusted sandbox capability. */
/** Resolve which file carries the Cover v3 snapshot: legacy filename when free/v3, dedicated as fallback. */
export function resolveCoverFile(state, kind) {
  const legacyName = kind === 'owner' ? LEGACY_OWNER_FILE : LEGACY_CATALOG_FILE
  const dedicatedName = kind === 'owner' ? COVER_OWNER_FILE : COVER_CATALOG_FILE
  const legacyPath = path.join(state.sandbox.root, legacyName)
  const dedicatedPath = path.join(state.sandbox.root, dedicatedName)
  const exists = (target) => {
    try {
      return fs.lstatSync(target).isFile()
    } catch {
      return false
    }
  }
  if (exists(legacyPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
      if (parsed && parsed.schemaVersion === COVER_STORE_SCHEMA_VERSION) return legacyName
    } catch {
      // fall through to the dedicated file
    }
    return dedicatedName
  }
  if (exists(dedicatedPath)) return dedicatedName
  return legacyName
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
    if (!isPlainObject(entry) || typeof entry.scopeId !== 'string' || typeof entry.idempotencyKey !== 'string') {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
    if (entry.kind === 'COVER') {
      const keys = Object.keys(entry).sort().join(',')
      if (keys !== 'createdAt,entryVersion,idempotencyKey,identityHash,intent,intentHash,kind,record,scopeId') {
        raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
      }
      if (!isPlainObject(entry.intent) || !isPlainObject(entry.record)) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
      if (identityHashOf(entry.record) !== entry.identityHash) {
        raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
      }
    } else if (entry.kind !== undefined) {
      raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    }
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
    if (entry.phase !== 'CLAIMED' && entry.phase !== 'FINAL') raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
    if (entry.kind === 'COVER') {
      if (!isPlainObject(entry.intent) || !isPlainObject(entry.record) || !isPlainObject(entry.attempt)) {
        raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
      }
    } else {
      // Mixed legacy entry (6 keys): scopeId/taskId/birthIdentityHash/phase/record/completion.
      const keys = Object.keys(entry).sort().join(',')
      if (keys !== 'birthIdentityHash,completion,phase,record,scopeId,taskId') raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
      if (!isPlainObject(entry.record)) raise(COVER_STORE_CODES.STORE_INVALID, 'entries')
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
export function writeCoverSnapshot(state, name, candidate, options) {
  const mode = options && options.mode === 'same' ? 'same' : 'increment'
  const baseDigest = options ? options.baseDigest : undefined
  const current = name.includes('catalog') ? readCoverCatalog(state) : readCoverOwner(state)
  const currentDigest = current.digest
  if (baseDigest !== currentDigest) {
    raise(COVER_STORE_CODES.STORE_CHANGED, '$')
  }
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
