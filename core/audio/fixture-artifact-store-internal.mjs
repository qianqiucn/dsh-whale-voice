/* Whale Voice — private single-pack Fixture artifact store (Plan 08-E-B internal helper).
 *
 * One fixed file, one fixed Schema, one fixed set of budgets, all bound to this module: callers
 * cannot pass a file name, path, budget, parser, fs adapter or error callback. The module owns
 *
 *   - the only pack file `audio-artifacts-v1.json` plus its own exclusively-created random temp,
 *   - strict UTF-8/JSON/canonical round-trip reading of the pack and of the canonical base64
 *     payloads, re-inspected with the verified 08-E-A WAV inspector,
 *   - the per-capability serial queue, the confirmed pack digest and the one shared unknown lock,
 *     held in this module's own WeakMap (never the Task catalog/owner domain),
 *   - bounded fd reads, short-write completion, fsync, one close per lease: temp read-back,
 *     a single rename attempt, post-rename identity/bytes/Schema confirmation and one-shot
 *     cleanup of this transaction's own temp only.
 *
 * The verified capability/root/marker validation (`checkSandbox`), the neutral store failure type,
 * the SHA256/stable-stringify helpers and the capability predicates come from the existing
 * 08-D-C internal module; this module adds no third file to that store and shares no queue, digest
 * or lock state with it.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { isInside, isTrustedSandbox } from '../config-sandbox.mjs'
import { deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { inspectFixtureWavBytes, WAV_BYTE_LIMITS } from './wav-byte-inspector.mjs'
import {
  StoreFailure,
  checkSandbox,
  isPlainObject,
  isStoreFailure,
  keySurface,
  raiseStore,
  sha256,
  stableStringify,
} from './fixture-task-store-internal.mjs'

/** The only pack this module can ever address. */
export const ARTIFACT_FILE_NAME = 'audio-artifacts-v1.json'
export const ARTIFACT_SCHEMA_VERSION = 1
export const ARTIFACT_ORIGIN = 'FIXTURE_IMPORT'
export const ARTIFACT_MAX_PACK_BYTES = 6291456
export const ARTIFACT_MAX_ENTRIES = 32
export const ARTIFACT_MAX_ITEM_BYTES = 1048576
export const ARTIFACT_MAX_DECODED_BYTES = 4194304

const READ_CHUNK = 64 * 1024
const REF_PATTERN = /^artifact:fixture-bytes-[0-9a-f]{32}$/
const SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const KEY_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/
const PROOF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const STATES = new WeakMap()

const PACK_KEYS = Object.freeze(new Set(['schemaVersion', 'sandboxId', 'revision', 'entries']))
const ENTRY_KEYS = Object.freeze(
  new Set([
    'artifactRef',
    'scopeId',
    'requestKey',
    'identityHash',
    'origin',
    'createdAt',
    'expiresAt',
    'rights',
    'inspection',
    'payload',
    'deletedAt',
  ]),
)
const RIGHTS_KEYS = Object.freeze(new Set(['state', 'proofRef']))
/** The 19 fixed fields of the verified 08-E-A inspection projection, in their original order. */
export const INSPECTION_KEYS = Object.freeze([
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
const INSPECTION_KEY_SET = Object.freeze(new Set(INSPECTION_KEYS))

/* ------------------------------- private state: queue / digest / lock ------------------------- */

/**
 * One artifact state per trusted capability. It is deliberately separate from the Task store
 * state: an artifact fault locks only this domain and never writes/repairs Task files.
 */
export function getArtifactState(sandbox) {
  let state = STATES.get(sandbox)
  if (!state) {
    state = {
      sandbox,
      tail: Promise.resolve(),
      locked: false,
      digest: undefined,
    }
    STATES.set(sandbox, state)
  }
  return state
}

export function enqueueArtifact(state, run) {
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

export function lockArtifact(state) {
  state.locked = true
}

export function isArtifactLocked(state) {
  return state.locked === true
}

/* ---------------------------------------- bounded file IO ----------------------------------- */

function sameIdentity(left, right) {
  if (!left || !right) return false
  if (!Number.isInteger(left.dev) || !Number.isInteger(left.ino)) return true
  return left.dev === right.dev && left.ino === right.ino
}

function assertRegularStat(stat, failKey) {
  if (!stat.isFile() || stat.isSymbolicLink()) raiseStore(failKey, '$')
  if (typeof stat.nlink === 'number' && stat.nlink > 1) raiseStore(failKey, '$')
}

/** Bounded fd read: never allocates or reads more than maxBytes+1. */
function readBoundedFd(fd, maxBytes, failKey, sizeKey) {
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
      raiseStore(failKey, '$')
    }
    if (!Number.isInteger(read) || read < 0 || read > want) raiseStore(failKey, '$')
    if (read === 0) break
    chunks.push(Buffer.from(buffer.subarray(0, read)))
    total += read
    if (total > maxBytes) raiseStore(sizeKey, '$')
  }
  return Buffer.concat(chunks, total)
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
  let real
  try {
    real = fs.realpathSync(target)
  } catch {
    raiseStore(failKey, '$')
  }
  if (!isInside(root, real)) raiseStore(failKey, '$')

  let fd = null
  let failure = null
  let result = null
  try {
    try {
      fd = fs.openSync(target, 'r')
    } catch {
      raiseStore(failKey, '$')
    }
    const opened = fs.fstatSync(fd)
    assertRegularStat(opened, failKey)
    if (!sameIdentity(pre, opened)) raiseStore(failKey, '$')
    if (Number.isInteger(opened.size) && opened.size > maxBytes) raiseStore(options.sizeKey || failKey, '$')
    const bytes = readBoundedFd(fd, maxBytes, failKey, options.sizeKey || failKey)
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
    failure = isStoreFailure(error) ? error : new StoreFailure(failKey, '$')
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

/* ------------------------------------------- pack Schema ------------------------------------- */

function canonicalIso(value) {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  const iso = new Date(ms).toISOString()
  return iso === value ? ms : null
}

function validateRightsShape(value) {
  if (!isPlainObject(value) || keySurface(value, RIGHTS_KEYS) !== 'ok') return null
  const state = value.state
  if (state !== 'GRANTED' && state !== 'DENIED' && state !== 'UNKNOWN') return null
  const proofRef = value.proofRef
  if (proofRef !== null && (typeof proofRef !== 'string' || !PROOF_PATTERN.test(proofRef))) return null
  if (state === 'GRANTED' && (typeof proofRef !== 'string' || !PROOF_PATTERN.test(proofRef))) return null
  return Object.freeze({ state, proofRef })
}

function inspectionShape(value) {
  if (!isPlainObject(value) || keySurface(value, INSPECTION_KEY_SET) !== 'ok') return null
  if (value.schemaVersion !== 1) return null
  if (value.format !== 'WAV' || value.codec !== 'PCM_S16LE') return null
  if (value.bitsPerSample !== 16) return null
  if (!WAV_BYTE_LIMITS.sampleRates.includes(value.sampleRate)) return null
  if (value.channels !== 1 && value.channels !== 2) return null
  if (!Number.isInteger(value.byteLength) || value.byteLength < 44) return null
  if (!Number.isInteger(value.dataByteLength) || value.dataByteLength < 2) return null
  if (!Number.isInteger(value.frameCount) || value.frameCount < 1) return null
  if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs <= 0) {
    return null
  }
  if (typeof value.peak !== 'number' || !Number.isFinite(value.peak) || value.peak < 0 || value.peak > 1) return null
  const samples = value.frameCount * value.channels
  if (!Number.isInteger(value.fullScaleSampleCount) || value.fullScaleSampleCount < 0) return null
  if (value.fullScaleSampleCount > samples) return null
  if (typeof value.sha256 !== 'string' || !HASH_PATTERN.test(value.sha256)) return null
  if (value.validationState !== 'FIXTURE_WAV_CHECKED') return null
  if (value.mockOnly !== true || value.realOperationAllowed !== false) return null
  if (value.submitAllowed !== false || value.automaticRetryAllowed !== false) return null
  if (typeof value.messageZh !== 'string' || value.messageZh.length < 1 || value.messageZh.length > 256) return null
  if (value.dataByteLength % (value.channels * 2) !== 0) return null
  if (value.frameCount !== value.dataByteLength / (value.channels * 2)) return null
  if (value.durationMs !== (value.frameCount * 1000) / value.sampleRate) return null
  if (value.byteLength < value.dataByteLength + 44) return null
  const ordered = {}
  for (const key of INSPECTION_KEYS) ordered[key] = value[key]
  return deepFreezeFixtureValue(ordered)
}

/** Decode strict canonical base64 inside the per-item budget before any inspection. */
function decodePayload(encoded) {
  if (typeof encoded !== 'string' || !BASE64_PATTERN.test(encoded)) raiseStore('STORE_INVALID', '$')
  const maxEncoded = Math.ceil(ARTIFACT_MAX_ITEM_BYTES / 3) * 4 + 4
  if (encoded.length > maxEncoded) raiseStore('RESOURCE_LIMIT', '$')
  let bytes
  try {
    bytes = Buffer.from(encoded, 'base64')
  } catch {
    raiseStore('STORE_INVALID', '$')
  }
  if (bytes.toString('base64') !== encoded) raiseStore('STORE_INVALID', '$')
  if (bytes.length > ARTIFACT_MAX_ITEM_BYTES) raiseStore('RESOURCE_LIMIT', '$')
  return bytes
}

function parseEntry(raw) {
  if (!isPlainObject(raw) || keySurface(raw, ENTRY_KEYS) !== 'ok') raiseStore('STORE_INVALID', '$')
  const artifactRef = raw.artifactRef
  if (typeof artifactRef !== 'string' || !REF_PATTERN.test(artifactRef)) raiseStore('STORE_INVALID', '$')
  const scopeId = raw.scopeId
  if (typeof scopeId !== 'string' || !SCOPE_PATTERN.test(scopeId)) raiseStore('STORE_INVALID', '$')
  const requestKey = raw.requestKey
  if (typeof requestKey !== 'string' || !KEY_PATTERN.test(requestKey)) raiseStore('STORE_INVALID', '$')
  const identityHash = raw.identityHash
  if (typeof identityHash !== 'string' || !HASH_PATTERN.test(identityHash)) raiseStore('STORE_INVALID', '$')
  if (raw.origin !== ARTIFACT_ORIGIN) raiseStore('STORE_INVALID', '$')
  const createdMs = canonicalIso(raw.createdAt)
  const expiresMs = canonicalIso(raw.expiresAt)
  if (createdMs === null || expiresMs === null) raiseStore('STORE_INVALID', '$')
  if (!(expiresMs > createdMs)) raiseStore('STORE_INVALID', '$')
  const rights = validateRightsShape(raw.rights)
  if (rights === null) raiseStore('STORE_INVALID', '$')
  // A stored entry must record a real GRANTED Fixture proof: a DENIED/UNKNOWN rights row on disk is
  // a store corruption, not something a later caller GRANTED could activate.
  if (rights.state !== 'GRANTED') raiseStore('STORE_INVALID', '$')
  const inspection = inspectionShape(raw.inspection)
  if (inspection === null) raiseStore('STORE_INVALID', '$')

  if (raw.payload === null) {
    if (canonicalIso(raw.deletedAt) === null) raiseStore('STORE_INVALID', '$')
    return {
      entry: Object.freeze({
        artifactRef,
        scopeId,
        requestKey,
        identityHash,
        origin: ARTIFACT_ORIGIN,
        createdAt: raw.createdAt,
        expiresAt: raw.expiresAt,
        rights,
        inspection,
        payload: null,
        deletedAt: raw.deletedAt,
      }),
      stored: false,
      bytes: null,
    }
  }
  if (raw.deletedAt !== null) raiseStore('STORE_INVALID', '$')
  const bytes = decodePayload(raw.payload)
  const inspected = inspectFixtureWavBytes({ schemaVersion: 1, bytes })
  if (!inspected || typeof inspected !== 'object' || inspected.ok !== true) raiseStore('STORE_INVALID', '$')
  if (stableStringify(inspected.value) !== stableStringify(inspection)) raiseStore('STORE_INVALID', '$')
  return {
    entry: Object.freeze({
      artifactRef,
      scopeId,
      requestKey,
      identityHash,
      origin: ARTIFACT_ORIGIN,
      createdAt: raw.createdAt,
      expiresAt: raw.expiresAt,
      rights,
      inspection,
      payload: raw.payload,
      deletedAt: null,
    }),
    stored: true,
    bytes,
  }
}

/**
 * Strict pack read: real UTF-8, canonical JSON round-trip (no extra whitespace, duplicate keys,
 * key reordering or non-canonical escapes), exact Schema, canonical base64 and a real 08-E-A
 * re-inspection of every stored payload. Returns the on-disk revision/entries/digest.
 */
export function parseArtifactPack(bytes, sandboxId) {
  if (!Buffer.isBuffer(bytes)) raiseStore('INTERNAL_FAILURE', '$')
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) raiseStore('STORE_INVALID', '$')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    raiseStore('STORE_INVALID', '$')
  }
  if (JSON.stringify(parsed) !== text) raiseStore('STORE_INVALID', '$')
  if (!isPlainObject(parsed) || keySurface(parsed, PACK_KEYS) !== 'ok') raiseStore('STORE_INVALID', '$')
  if (parsed.schemaVersion !== ARTIFACT_SCHEMA_VERSION) raiseStore('STORE_INVALID', '$')
  if (typeof parsed.sandboxId !== 'string' || parsed.sandboxId !== sandboxId) raiseStore('STORE_INVALID', '$')
  if (!Array.isArray(parsed.entries)) raiseStore('STORE_INVALID', '$')
  if (parsed.entries.length > ARTIFACT_MAX_ENTRIES) raiseStore('RESOURCE_LIMIT', '$')
  if (!Number.isInteger(parsed.revision) || parsed.revision < 0) raiseStore('STORE_INVALID', '$')

  const refs = new Set()
  const keys = new Set()
  let weight = 0
  let decodedTotal = 0
  const entries = []
  for (const raw of parsed.entries) {
    const parsedEntry = parseEntry(raw)
    const entry = parsedEntry.entry
    if (refs.has(entry.artifactRef)) raiseStore('STORE_INVALID', '$')
    refs.add(entry.artifactRef)
    const pair = entry.scopeId + '\u0000' + entry.requestKey
    if (keys.has(pair)) raiseStore('STORE_INVALID', '$')
    keys.add(pair)
    if (parsedEntry.stored) {
      weight += 1
      decodedTotal += parsedEntry.bytes.length
      if (decodedTotal > ARTIFACT_MAX_DECODED_BYTES) raiseStore('RESOURCE_LIMIT', '$')
    } else {
      weight += 2
    }
    entries.push(Object.freeze({ entry, stored: parsedEntry.stored, bytes: parsedEntry.bytes }))
  }
  if (parsed.revision !== weight) raiseStore('STORE_INVALID', '$')
  return {
    revision: parsed.revision,
    entries: Object.freeze(entries),
    decodedTotal,
  }
}

function canonicalOrderedInspection(inspection) {
  const ordered = {}
  for (const key of INSPECTION_KEYS) ordered[key] = inspection[key]
  return ordered
}

/** Canonical on-disk entry built from a trusted in-memory entry; unknown fields are never copied. */
function canonicalEntry(entry) {
  if (!isPlainObject(entry)) raiseStore('INTERNAL_FAILURE', '$')
  return {
    artifactRef: entry.artifactRef,
    scopeId: entry.scopeId,
    requestKey: entry.requestKey,
    identityHash: entry.identityHash,
    origin: ARTIFACT_ORIGIN,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    rights: { state: entry.rights.state, proofRef: entry.rights.proofRef },
    inspection: canonicalOrderedInspection(entry.inspection),
    payload: entry.payload,
    deletedAt: entry.deletedAt,
  }
}

function projectEntries(parsedEntries) {
  return parsedEntries.map((item) => canonicalEntry(item.entry))
}

/* ----------------------------------------- pack read/write ---------------------------------- */

function packPath(state) {
  return path.join(state.sandbox.root, ARTIFACT_FILE_NAME)
}

function finishRead(state, identity) {
  try {
    checkSandbox(state)
    if (identity) {
      const stat = fs.lstatSync(packPath(state))
      if (!stat.isFile() || stat.isSymbolicLink() || !sameIdentity(stat, identity)) throw new Error('identity')
    } else {
      try {
        fs.lstatSync(packPath(state))
        throw new Error('appeared')
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }
    }
  } catch {
    lockArtifact(state)
    raiseStore('STORE_CHANGED', '$')
  }
}

function readRaw(state, allowMissing) {
  checkSandbox(state)
  return readBoundedPath(state, packPath(state), ARTIFACT_MAX_PACK_BYTES, {
    failKey: 'STORE_INVALID',
    sizeKey: 'RESOURCE_LIMIT',
    closeKey: 'SANDBOX_INVALID',
    allowMissing,
  })
}

function parseOrRaise(state, bytes) {
  return parseArtifactPack(bytes, state.sandbox.id)
}

function isKey(error, key) {
  return error !== null && typeof error === 'object' && error.key === key
}

/**
 * Read the current official pack with the shared confirmed-digest rule. A pack that disappears,
 * changes externally or turns invalid after confirmation is rejected and locks this artifact
 * domain; the now-visible bytes are never adopted, repaired or reconstructed.
 */
export function readArtifactPack(state) {
  if (state.locked) raiseStore('LIBRARY_UNKNOWN', '$')
  let raw
  try {
    raw = readRaw(state, true)
  } catch (error) {
    if (state.digest !== undefined && (isKey(error, 'STORE_INVALID') || isKey(error, 'RESOURCE_LIMIT'))) {
      lockArtifact(state)
    }
    throw error
  }

  if (raw.missing) {
    if (state.digest === undefined) state.digest = null
    if (state.digest !== null) {
      lockArtifact(state)
      raiseStore('STORE_CHANGED', '$')
    }
    finishRead(state, null)
    return { missing: true, revision: 0, entries: [], digest: null }
  }

  let parsed = null
  let parseError = null
  try {
    parsed = parseOrRaise(state, raw.bytes)
  } catch (error) {
    parseError = error
  }

  if (state.digest === undefined) {
    if (parseError) throw parseError
    state.digest = raw.digest
    finishRead(state, raw.identity)
    return { missing: false, revision: parsed.revision, entries: parsed.entries, digest: raw.digest }
  }
  if (state.digest === raw.digest) {
    if (parseError) {
      lockArtifact(state)
      throw parseError
    }
    finishRead(state, raw.identity)
    return { missing: false, revision: parsed.revision, entries: parsed.entries, digest: raw.digest }
  }

  lockArtifact(state)
  if (parseError) throw parseError
  raiseStore('STORE_CHANGED', '$')
}

/** Read the current pack for a write transaction; it must match the digest the caller saw. */
function readVerified(state, baseDigest) {
  const raw = readRaw(state, true)
  if (raw.missing) {
    if (baseDigest !== null) {
      lockArtifact(state)
      raiseStore('STORE_CHANGED', '$')
    }
    return { missing: true, revision: 0, entries: [], digest: null }
  }
  let parsed
  try {
    parsed = parseOrRaise(state, raw.bytes)
  } catch (error) {
    lockArtifact(state)
    throw error
  }
  if (raw.digest !== baseDigest) {
    lockArtifact(state)
    raiseStore('STORE_CHANGED', '$')
  }
  return { missing: false, revision: parsed.revision, entries: parsed.entries, digest: raw.digest }
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
 * Replace the official pack atomically with one canonical snapshot.
 *
 * `next` is `{revision, entries}` where each entry is a trusted in-memory record. The bytes are
 * canonicalized here (sandboxId injected from the capability), self-validated, written to an
 * exclusively created temp, fsynced, closed once, read back, re-verified against the current
 * digest and the capability, renamed exactly once, then confirmed again. A failure before the
 * rename leaves the old bytes untouched (`WRITE_REJECTED`); a failure once the rename was
 * attempted is `WRITE_UNKNOWN` with the shared lock and the actual bytes kept as they are.
 */
export function writeArtifactPack(state, next, baseDigest) {
  if (state.locked) raiseStore('LIBRARY_UNKNOWN', '$')
  if (!isPlainObject(next) || !Number.isInteger(next.revision) || !Array.isArray(next.entries)) {
    raiseStore('INTERNAL_FAILURE', '$')
  }
  const snapshot = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    sandboxId: state.sandbox.id,
    revision: next.revision,
    entries: next.entries.map(canonicalEntry),
  }
  const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8')
  if (bytes.length > ARTIFACT_MAX_PACK_BYTES) raiseStore('RESOURCE_LIMIT', '$')

  checkSandbox(state)
  let selfValidated
  try {
    selfValidated = parseArtifactPack(bytes, state.sandbox.id)
  } catch (error) {
    if (isStoreFailure(error) && (error.key === 'STORE_INVALID' || error.key === 'RESOURCE_LIMIT')) throw error
    raiseStore('INTERNAL_FAILURE', '$')
  }
  if (selfValidated.revision !== next.revision) raiseStore('INTERNAL_FAILURE', '$')
  if (stableStringify(projectEntries(selfValidated.entries)) !== stableStringify(snapshot.entries)) {
    raiseStore('INTERNAL_FAILURE', '$')
  }

  const root = state.sandbox.root
  const target = packPath(state)
  readVerified(state, baseDigest)

  const tempName = ARTIFACT_FILE_NAME.replace(/\.json$/, '') + '.' + crypto.randomBytes(16).toString('hex') + '.tmp'
  const tempPath = path.join(root, tempName)
  let fd = null
  let tempIdentity = null
  let renameAttempted = false
  let cleanupAttempted = false
  let lastCleanupStatus = null
  const attemptCleanup = () => {
    if (cleanupAttempted) return lastCleanupStatus
    cleanupAttempted = true
    if (tempIdentity === null) {
      lastCleanupStatus = 'not-owned'
      return lastCleanupStatus
    }
    lastCleanupStatus = cleanupOwnTemp(state, tempPath, tempIdentity)
    return lastCleanupStatus
  }
  const blockCleanup = () => {
    cleanupAttempted = true
    lastCleanupStatus = 'blocked'
  }
  try {
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
        if (cleanupStatus === 'blocked' && (!isStoreFailure(error) || isKey(error, 'WRITE_REJECTED'))) {
          raiseStore('SANDBOX_INVALID', '$')
        }
        if (isStoreFailure(error)) throw error
        raiseStore('WRITE_REJECTED', '$')
      }

      let tempRead
      try {
        tempRead = readBoundedPath(state, tempPath, ARTIFACT_MAX_PACK_BYTES, {
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
        if (cleanupStatus === 'blocked' && isKey(error, 'WRITE_REJECTED')) {
          raiseStore('SANDBOX_INVALID', '$')
        }
        if (isKey(error, 'WRITE_REJECTED')) throw error
        lockArtifact(state)
        raiseStore('STORE_CHANGED', '$')
      }
      if (
        !sameIdentity(tempRead.identity, tempIdentity) ||
        tempRead.bytes.length !== bytes.length ||
        !tempRead.bytes.equals(bytes)
      ) {
        blockCleanup()
        lockArtifact(state)
        raiseStore('STORE_CHANGED', '$')
      }

      try {
        readVerified(state, baseDigest)
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

      renameAttempted = true
      try {
        fs.renameSync(tempPath, target)
      } catch {
        lockArtifact(state)
        raiseStore('WRITE_UNKNOWN', '$')
      }

      try {
        checkSandbox(state)
        const targetStat = fs.lstatSync(target)
        assertRegularStat(targetStat, 'STORE_INVALID')
        if (!sameIdentity(targetStat, tempIdentity)) raiseStore('STORE_INVALID', '$')
        const readBack = readBoundedPath(state, target, ARTIFACT_MAX_PACK_BYTES, {
          failKey: 'STORE_INVALID',
          sizeKey: 'RESOURCE_LIMIT',
        })
        if (readBack.missing || !sameIdentity(readBack.identity, tempIdentity)) raiseStore('STORE_INVALID', '$')
        if (!readBack.bytes.equals(bytes)) raiseStore('STORE_INVALID', '$')
        const verified = parseOrRaise(state, readBack.bytes)
        if (verified.revision !== next.revision) raiseStore('STORE_INVALID', '$')
        checkSandbox(state)
        state.digest = sha256(bytes)
        return {
          revision: verified.revision,
          entries: verified.entries,
          digest: state.digest,
        }
      } catch {
        lockArtifact(state)
        raiseStore('WRITE_UNKNOWN', '$')
      }
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd)
        } catch {
          // ignore close failure after a classified result
        }
        fd = null
      }
      if (!renameAttempted) attemptCleanup()
    }
  } catch (error) {
    // Preserve a StoreFailure verbatim; anything else is an internal failure of this module.
    if (isStoreFailure(error)) throw error
    raiseStore('INTERNAL_FAILURE', '$')
  }
}
