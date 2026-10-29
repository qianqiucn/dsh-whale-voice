/* Whale Voice — isolated Fixture WAV artifact library (Plan 08-E-B, OFFLINE / FIXTURE_ONLY).
 *
 * One bounded, single-pack library over a trusted temporary sandbox capability:
 *
 *   trusted sandbox -> private owned copy of the caller bytes -> verified 08-E-A WAV inspection
 *   -> canonical STORED entry in `audio-artifacts-v1.json` -> get/readBytes under the recorded
 *   Fixture scope/rights/expiry -> logical delete with an unrecoverable DELETED tombstone.
 *
 * This module is the public surface (`ARTIFACT_LIBRARY_SCHEMA_VERSION`, frozen
 * `ARTIFACT_LIBRARY_LIMITS`, frozen `ARTIFACT_LIBRARY_ERRORS`, `openFixtureArtifactLibrary`). The
 * pack format, canonical JSON/base64 rules, packet budgets, bounded reads and the atomic
 * temp+fsync+rename+read-back transaction live in `fixture-artifact-store-internal.mjs`.
 *
 * The scope/rights contract here is a Fixture declaration inside a trusted capability. It is not
 * user authentication, not real rights verification, not a Host authorization and not a Task
 * binding: every STORED entry is `origin: FIXTURE_IMPORT`, never a Task SAVED result, never a
 * registered Fake output reference and never a real generation/send proof.
 */

import crypto from 'node:crypto'

import { isTrustedSandbox } from '../config-sandbox.mjs'
import { deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import { inspectFixtureWavBytes } from './wav-byte-inspector.mjs'
import {
  hasOwn,
  isPlainObject,
  isStoreFailure,
  raiseStore,
  sha256,
  stableStringify,
} from './fixture-task-store-internal.mjs'
import {
  ARTIFACT_MAX_DECODED_BYTES,
  ARTIFACT_MAX_ENTRIES,
  ARTIFACT_MAX_ITEM_BYTES,
  ARTIFACT_MAX_PACK_BYTES,
  ARTIFACT_ORIGIN,
  ARTIFACT_SCHEMA_VERSION,
  INSPECTION_KEYS,
  enqueueArtifact,
  getArtifactState,
  isArtifactLocked,
  lockArtifact,
  readArtifactPack,
  writeArtifactPack,
} from './fixture-artifact-store-internal.mjs'

export const ARTIFACT_LIBRARY_SCHEMA_VERSION = ARTIFACT_SCHEMA_VERSION

export const ARTIFACT_LIBRARY_LIMITS = Object.freeze({
  maxItemBytes: ARTIFACT_MAX_ITEM_BYTES,
  maxDecodedBytes: ARTIFACT_MAX_DECODED_BYTES,
  maxEntries: ARTIFACT_MAX_ENTRIES,
  maxPackBytes: ARTIFACT_MAX_PACK_BYTES,
  maxIdAttempts: 3,
})

const ERROR_KEYS = Object.freeze([
  'INVALID_INPUT',
  'UNSUPPORTED_VERSION',
  'INVALID_BYTES',
  'INVALID_WAV',
  'RESOURCE_LIMIT',
  'SANDBOX_INVALID',
  'STORE_INVALID',
  'STORE_CHANGED',
  'KEY_CONFLICT',
  'RIGHTS_REJECTED',
  'EXPIRED',
  'ID_COLLISION',
  'WRITE_REJECTED',
  'WRITE_UNKNOWN',
  'LIBRARY_UNKNOWN',
  'INTERNAL_FAILURE',
])

/** Fixed error protocol. Every value is `ARTIFACT_LIBRARY_` plus the key itself. */
export const ARTIFACT_LIBRARY_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'ARTIFACT_LIBRARY_' + key])),
)

const REASONS = Object.freeze({
  INVALID_INPUT: 'input must be exactly the documented fields',
  UNSUPPORTED_VERSION: 'unsupported schema version',
  INVALID_BYTES: 'bytes must be a real Uint8Array view',
  INVALID_WAV: 'WAV bytes are outside the supported Fixture profile',
  RESOURCE_LIMIT: 'fixture artifact budget exceeded',
  SANDBOX_INVALID: 'trusted sandbox capability is not valid',
  STORE_INVALID: 'artifact pack is not a valid canonical snapshot',
  STORE_CHANGED: 'artifact pack changed outside this library',
  KEY_CONFLICT: 'this scope and request key already store a different import identity',
  RIGHTS_REJECTED: 'fixture rights do not permit this operation',
  EXPIRED: 'the Fixture time is outside the declared expiry',
  ID_COLLISION: 'no unique artifact reference could be issued',
  WRITE_REJECTED: 'the artifact pack write was rejected before commit',
  WRITE_UNKNOWN: 'the artifact pack commit result is unknown',
  LIBRARY_UNKNOWN: 'the artifact domain is locked after an unknown outcome',
  INTERNAL_FAILURE: 'internal failure',
})

const IMPORT_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'requestKey', 'bytes', 'now', 'expiresAt', 'rights']))
const READ_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'artifactRef', 'now', 'rights']))
const DELETE_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'artifactRef', 'now']))
const RIGHTS_KEYS = Object.freeze(new Set(['state', 'proofRef']))
const REF_PATTERN = /^artifact:fixture-bytes-[0-9a-f]{32}$/
const SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const KEY_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const PROOF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/
const OUTCOMES = Object.freeze({
  STORED: 'STORED',
  EXISTING: 'EXISTING',
  FOUND: 'FOUND',
  DELETED: 'DELETED',
  ALREADY_DELETED: 'ALREADY_DELETED',
  NOT_FOUND: 'NOT_FOUND',
  EXPIRED: 'EXPIRED',
})

function failure(key, errorPath) {
  const code = ARTIFACT_LIBRARY_ERRORS[key] || ARTIFACT_LIBRARY_ERRORS.INTERNAL_FAILURE
  return deepFreezeFixtureValue({
    ok: false,
    errors: [{ code, path: errorPath, reason: REASONS[key] || REASONS.INTERNAL_FAILURE }],
  })
}

function raise(key, errorPath) {
  raiseStore(key, errorPath)
}

function toFailure(error) {
  if (isStoreFailure(error) && ARTIFACT_LIBRARY_ERRORS[error.key]) return failure(error.key, error.errorPath)
  return failure('INTERNAL_FAILURE', '$')
}

/* ----------------------------------- native bytes boundary ---------------------------------- */

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)
const TYPED_ARRAY_TAG = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get
const VIEW_BUFFER = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get
const VIEW_BYTE_LENGTH = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get
const VIEW_BYTE_OFFSET = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get
const ARRAY_BUFFER_RESIZABLE = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable').get
const ARRAY_BUFFER_MAX = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'maxByteLength').get
const ARRAY_BUFFER_DETACHED = (() => {
  const descriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'detached')
  return descriptor && typeof descriptor.get === 'function' ? descriptor.get : null
})()

function isDetachedBuffer(buffer) {
  if (ARRAY_BUFFER_DETACHED !== null) {
    try {
      return ARRAY_BUFFER_DETACHED.call(buffer) === true
    } catch {
      return true
    }
  }
  try {
    new Uint8Array(buffer, 0, 0)
    return false
  } catch {
    return true
  }
}

/**
 * The 08-E-A native-slot check, reused here before this library allocates anything: only a real
 * Uint8Array view (Buffer included) over a non-shared, non-resizable, attached ArrayBuffer whose
 * offset/length fit the backing buffer is accepted. Caller `constructor`/`@@species`/iterator and
 * shadowed `length`/`byteLength`/`buffer` are never consulted.
 */
function nativeView(value) {
  if (value === null || typeof value !== 'object') return null
  let tag
  let buffer
  let byteLength
  let byteOffset
  try {
    tag = TYPED_ARRAY_TAG.call(value)
    buffer = VIEW_BUFFER.call(value)
    byteLength = VIEW_BYTE_LENGTH.call(value)
    byteOffset = VIEW_BYTE_OFFSET.call(value)
  } catch {
    return null
  }
  if (tag !== 'Uint8Array') return null
  if (!Number.isInteger(byteLength) || byteLength < 0) return null
  if (!Number.isInteger(byteOffset) || byteOffset < 0) return null
  let bufferLength
  let resizable
  let maxLength
  try {
    bufferLength = ARRAY_BUFFER_BYTE_LENGTH.call(buffer)
    resizable = ARRAY_BUFFER_RESIZABLE.call(buffer)
    maxLength = ARRAY_BUFFER_MAX.call(buffer)
  } catch {
    return null
  }
  if (resizable === true) return null
  if (!Number.isInteger(maxLength) || maxLength !== bufferLength) return null
  if (bufferLength === 0 && isDetachedBuffer(buffer)) return null
  if (byteOffset + byteLength > bufferLength) return null
  if (byteLength > 0 && bufferLength === 0) return null
  return { buffer, byteLength, byteOffset }
}

/**
 * The one private owned copy of the caller's view, inside the library item budget. This happens
 * before the first await/queue, so a later mutation of the caller array can never change what the
 * library inspects, hashes or stores.
 */
function readOwnedBytes(value) {
  const view = nativeView(value)
  if (view === null) raise('INVALID_BYTES', 'bytes')
  if (view.byteLength > ARTIFACT_MAX_ITEM_BYTES) raise('RESOURCE_LIMIT', 'bytes')
  const owned = new Uint8Array(view.byteLength)
  if (owned.length !== view.byteLength) raise('INVALID_BYTES', 'bytes')
  Uint8Array.prototype.set.call(owned, value)
  return owned
}

/* ----------------------------------------- input readers ------------------------------------- */

function ownDataField(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return { ok: false }
  return { ok: true, value: descriptor.value }
}

function readRootFields(input, allowed) {
  if (!isPlainObject(input)) raise('INVALID_INPUT', '$')
  let keys
  try {
    keys = Reflect.ownKeys(input)
  } catch {
    raise('INVALID_INPUT', '$')
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) raise('INVALID_INPUT', '<unknown-key>')
  }
  if (keys.length !== allowed.size) raise('INVALID_INPUT', '$')
  for (const key of keys) {
    if (!ownDataField(input, key).ok) raise('INVALID_INPUT', key)
  }
  const version = ownDataField(input, 'schemaVersion')
  if (!version.ok) raise('INVALID_INPUT', '$')
  if (version.value !== ARTIFACT_LIBRARY_SCHEMA_VERSION) raise('UNSUPPORTED_VERSION', 'schemaVersion')
}

function readTextField(root, key) {
  const field = ownDataField(root, key)
  if (!field.ok || typeof field.value !== 'string') raise('INVALID_INPUT', key)
  return field.value
}

function readScopeId(root) {
  const value = readTextField(root, 'scopeId')
  if (!SCOPE_PATTERN.test(value)) raise('INVALID_INPUT', 'scopeId')
  return value
}

function readRequestKey(root) {
  const value = readTextField(root, 'requestKey')
  if (!KEY_PATTERN.test(value)) raise('INVALID_INPUT', 'requestKey')
  return value
}

function readArtifactRef(root) {
  const value = readTextField(root, 'artifactRef')
  if (!REF_PATTERN.test(value)) raise('INVALID_INPUT', 'artifactRef')
  return value
}

function readIso(root, key) {
  const value = readTextField(root, key)
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) raise('INVALID_INPUT', key)
  if (new Date(ms).toISOString() !== value) raise('INVALID_INPUT', key)
  return Object.freeze({ iso: value, ms })
}

function readRights(root) {
  const field = ownDataField(root, 'rights')
  if (!field.ok || !isPlainObject(field.value)) raise('INVALID_INPUT', 'rights')
  const value = field.value
  let keys
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    raise('INVALID_INPUT', 'rights')
  }
  if (keys.length !== RIGHTS_KEYS.size) raise('INVALID_INPUT', 'rights')
  for (const key of keys) {
    if (typeof key !== 'string' || !RIGHTS_KEYS.has(key)) raise('INVALID_INPUT', 'rights')
  }
  const stateField = ownDataField(value, 'state')
  const proofField = ownDataField(value, 'proofRef')
  if (!stateField.ok || !proofField.ok) raise('INVALID_INPUT', 'rights')
  const state = stateField.value
  if (state !== 'GRANTED' && state !== 'DENIED' && state !== 'UNKNOWN') raise('INVALID_INPUT', 'rights')
  const proofRef = proofField.value
  if (proofRef !== null) {
    if (typeof proofRef !== 'string') raise('INVALID_INPUT', 'rights')
    if (proofRef.length > 128 || !PROOF_PATTERN.test(proofRef)) raise('INVALID_INPUT', 'rights')
  }
  return Object.freeze({ state, proofRef })
}

function readImport(input) {
  readRootFields(input, IMPORT_KEYS)
  const scopeId = readScopeId(input)
  const requestKey = readRequestKey(input)
  const bytesField = ownDataField(input, 'bytes')
  if (!bytesField.ok) raise('INVALID_INPUT', 'bytes')
  const bytes = readOwnedBytes(bytesField.value)
  const now = readIso(input, 'now')
  const expiresAt = readIso(input, 'expiresAt')
  const rights = readRights(input)
  // Import admission is GRANTED-only: DENIED/UNKNOWN (or GRANTED without a real Fixture proof)
  // is refused before any read, write, id or commit happens.
  if (rights.state !== 'GRANTED' || rights.proofRef === null) raise('RIGHTS_REJECTED', 'rights')
  return Object.freeze({ scopeId, requestKey, bytes, now, expiresAt, rights })
}

function readRead(input) {
  readRootFields(input, READ_KEYS)
  const scopeId = readScopeId(input)
  const artifactRef = readArtifactRef(input)
  const now = readIso(input, 'now')
  const rights = readRights(input)
  return Object.freeze({ scopeId, artifactRef, now, rights })
}

function readDelete(input) {
  readRootFields(input, DELETE_KEYS)
  const scopeId = readScopeId(input)
  const artifactRef = readArtifactRef(input)
  const now = readIso(input, 'now')
  return Object.freeze({ scopeId, artifactRef, now })
}

function readOptions(options) {
  if (!isPlainObject(options)) raise('INVALID_INPUT', '$')
  let keys
  try {
    keys = Reflect.ownKeys(options)
  } catch {
    raise('INVALID_INPUT', '$')
  }
  if (keys.length !== 1 || keys[0] !== 'sandbox') raise('INVALID_INPUT', keys.length === 0 ? '$' : '<unknown-key>')
  const descriptor = ownDataField(options, 'sandbox')
  if (!descriptor.ok) raise('INVALID_INPUT', '$')
  if (!isTrustedSandbox(descriptor.value)) raise('SANDBOX_INVALID', '$')
  return descriptor.value
}

/* -------------------------------------- result envelopes ------------------------------------- */

function metadataOf(entry) {
  const inspection = {}
  for (const key of INSPECTION_KEYS) inspection[key] = entry.inspection[key]
  return deepFreezeFixtureValue({
    artifactRef: entry.artifactRef,
    scopeId: entry.scopeId,
    requestKey: entry.requestKey,
    origin: entry.origin,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    rights: { state: entry.rights.state, proofRef: entry.rights.proofRef },
    inspection,
  })
}

function envelope(outcome, revision, artifact) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION,
      outcome,
      revision,
      artifact,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

/**
 * A fresh frozen envelope whose `bytes` is a new mutable Uint8Array: the array is independent of
 * the pack bytes, of other calls and of the caller's input. Freezing stops at the envelope, because
 * a non-empty typed array cannot be frozen and must stay mutable by contract.
 */
function bytesEnvelope(outcome, revision, artifact, source) {
  const owned = new Uint8Array(source.length)
  Uint8Array.prototype.set.call(owned, source)
  const value = {
    schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION,
    outcome,
    revision,
    artifact,
    bytes: owned,
    mockOnly: true,
    realOperationAllowed: false,
    submitAllowed: false,
    automaticRetryAllowed: false,
  }
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

function identityHashOf(scopeId, requestKey, byteSha256, expiresAt, rights) {
  return sha256(
    Buffer.from(
      stableStringify({
        scopeId,
        requestKey,
        byteSha256,
        expiresAt,
        rights: { state: rights.state, proofRef: rights.proofRef },
      }),
      'utf8',
    ),
  )
}

function findEntry(current, scopeId, artifactRef) {
  const found = current.entries.find((item) => item.entry.artifactRef === artifactRef)
  if (!found) return null
  if (found.entry.scopeId !== scopeId) return null
  return found
}

function findImportIdentity(current, scopeId, requestKey) {
  return current.entries.find((item) => item.entry.scopeId === scopeId && item.entry.requestKey === requestKey) || null
}

function expiredAt(entry, nowMs) {
  return nowMs >= Date.parse(entry.expiresAt)
}

/* -------------------------------------- one operation --------------------------------------- */

function importOnce(state, request) {
  if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
  try {
    const current = readArtifactPack(state)
    const byteSha256 = sha256(request.bytes)
    const identityHash = identityHashOf(
      request.scopeId,
      request.requestKey,
      byteSha256,
      request.expiresAt.iso,
      request.rights,
    )
    const existing = findImportIdentity(current, request.scopeId, request.requestKey)
    if (existing) {
      if (existing.entry.identityHash !== identityHash) return failure('KEY_CONFLICT', 'requestKey')
      if (!existing.stored) return envelope(OUTCOMES.DELETED, current.revision, null)
      if (expiredAt(existing.entry, request.now.ms)) return envelope(OUTCOMES.EXPIRED, current.revision, null)
      return envelope(OUTCOMES.EXISTING, current.revision, metadataOf(existing.entry))
    }
    if (!(request.expiresAt.ms > request.now.ms)) return failure('EXPIRED', 'expiresAt')

    const inspected = inspectFixtureWavBytes({ schemaVersion: 1, bytes: request.bytes })
    if (!inspected || typeof inspected !== 'object' || typeof inspected.ok !== 'boolean') {
      raise('INTERNAL_FAILURE', '$')
    }
    if (inspected.ok === false) {
      const code = inspected.errors && inspected.errors[0] ? inspected.errors[0].code : ''
      if (code === 'WAV_BYTES_INVALID_BYTES') raise('INVALID_BYTES', 'bytes')
      if (code === 'WAV_BYTES_RESOURCE_LIMIT') raise('RESOURCE_LIMIT', 'bytes')
      if (code === 'WAV_BYTES_UNSUPPORTED_VERSION') raise('UNSUPPORTED_VERSION', 'schemaVersion')
      if (code === 'WAV_BYTES_INVALID_INPUT') raise('INVALID_INPUT', 'bytes')
      if (code === 'WAV_BYTES_INTERNAL_FAILURE') raise('INTERNAL_FAILURE', '$')
      raise('INVALID_WAV', 'bytes')
    }
    if (!isPlainObject(inspected.value)) raise('INTERNAL_FAILURE', '$')

    let decodedTotal = 0
    for (const item of current.entries) if (item.stored) decodedTotal += item.bytes.length
    if (decodedTotal + request.bytes.length > ARTIFACT_MAX_DECODED_BYTES) raise('RESOURCE_LIMIT', 'bytes')
    if (current.entries.length + 1 > ARTIFACT_MAX_ENTRIES) raise('RESOURCE_LIMIT', '$')

    const refs = new Set(current.entries.map((item) => item.entry.artifactRef))
    let artifactRef = null
    for (let attempt = 0; attempt < ARTIFACT_LIBRARY_LIMITS.maxIdAttempts; attempt += 1) {
      const candidate = 'artifact:fixture-bytes-' + crypto.randomBytes(16).toString('hex')
      if (!refs.has(candidate)) {
        artifactRef = candidate
        break
      }
    }
    if (artifactRef === null) raise('ID_COLLISION', '$')

    const entry = Object.freeze({
      artifactRef,
      scopeId: request.scopeId,
      requestKey: request.requestKey,
      identityHash,
      origin: ARTIFACT_ORIGIN,
      createdAt: request.now.iso,
      expiresAt: request.expiresAt.iso,
      rights: Object.freeze({ state: request.rights.state, proofRef: request.rights.proofRef }),
      inspection: inspected.value,
      payload: Buffer.from(request.bytes).toString('base64'),
      deletedAt: null,
    })
    const next = {
      revision: current.revision + 1,
      entries: [...current.entries.map((item) => item.entry), entry],
    }
    const written = writeArtifactPack(state, next, current.digest)
    const stored = findEntry({ entries: written.entries }, request.scopeId, artifactRef)
    if (!stored || !stored.stored) {
      lockArtifact(state)
      raise('WRITE_UNKNOWN', '$')
    }
    return envelope(OUTCOMES.STORED, written.revision, metadataOf(stored.entry))
  } catch (error) {
    return toFailure(error)
  }
}

function readOnce(state, request, withBytes) {
  if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
  try {
    const current = readArtifactPack(state)
    const found = findEntry(current, request.scopeId, request.artifactRef)
    if (!found) return envelope(OUTCOMES.NOT_FOUND, current.revision, null)
    if (!found.stored) return envelope(OUTCOMES.DELETED, current.revision, null)
    if (request.rights.state !== 'GRANTED' || request.rights.proofRef !== found.entry.rights.proofRef) {
      return failure('RIGHTS_REJECTED', 'rights')
    }
    if (expiredAt(found.entry, request.now.ms)) return envelope(OUTCOMES.EXPIRED, current.revision, null)
    const artifact = metadataOf(found.entry)
    if (withBytes) return bytesEnvelope(OUTCOMES.FOUND, current.revision, artifact, found.bytes)
    return envelope(OUTCOMES.FOUND, current.revision, artifact)
  } catch (error) {
    return toFailure(error)
  }
}

function deleteOnce(state, request) {
  if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
  try {
    const current = readArtifactPack(state)
    const found = findEntry(current, request.scopeId, request.artifactRef)
    if (!found) return envelope(OUTCOMES.NOT_FOUND, current.revision, null)
    if (!found.stored) return envelope(OUTCOMES.ALREADY_DELETED, current.revision, null)

    const tombstone = Object.freeze({
      artifactRef: found.entry.artifactRef,
      scopeId: found.entry.scopeId,
      requestKey: found.entry.requestKey,
      identityHash: found.entry.identityHash,
      origin: found.entry.origin,
      createdAt: found.entry.createdAt,
      expiresAt: found.entry.expiresAt,
      rights: found.entry.rights,
      inspection: found.entry.inspection,
      payload: null,
      deletedAt: request.now.iso,
    })
    const next = {
      revision: current.revision + 1,
      entries: current.entries.map((item) =>
        item.entry.artifactRef === found.entry.artifactRef ? tombstone : item.entry,
      ),
    }
    const written = writeArtifactPack(state, next, current.digest)
    const confirmed = findEntry({ entries: written.entries }, request.scopeId, request.artifactRef)
    if (!confirmed || confirmed.stored || confirmed.entry.payload !== null) {
      lockArtifact(state)
      raise('WRITE_UNKNOWN', '$')
    }
    const after = readArtifactPack(state)
    const visible = findEntry(after, request.scopeId, request.artifactRef)
    if (!visible || visible.stored || visible.entry.payload !== null) {
      lockArtifact(state)
      raise('WRITE_UNKNOWN', '$')
    }
    return envelope(OUTCOMES.DELETED, after.revision, null)
  } catch (error) {
    return toFailure(error)
  }
}

/* ------------------------------------------ handle ------------------------------------------ */

function createHandle(state) {
  const handle = {
    async import(input) {
      if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
      let request
      try {
        request = readImport(input)
      } catch (error) {
        return toFailure(error)
      }
      return enqueueArtifact(state, () => importOnce(state, request))
    },
    async get(input) {
      if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
      let request
      try {
        request = readRead(input)
      } catch (error) {
        return toFailure(error)
      }
      return enqueueArtifact(state, () => readOnce(state, request, false))
    },
    async readBytes(input) {
      if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
      let request
      try {
        request = readRead(input)
      } catch (error) {
        return toFailure(error)
      }
      return enqueueArtifact(state, () => readOnce(state, request, true))
    },
    async delete(input) {
      if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
      let request
      try {
        request = readDelete(input)
      } catch (error) {
        return toFailure(error)
      }
      return enqueueArtifact(state, () => deleteOnce(state, request))
    },
  }
  return Object.freeze(handle)
}

/**
 * Open one isolated Fixture artifact library over a trusted temporary sandbox capability.
 * The factory validates the current capability/pack but never creates an empty pack file.
 * @param {{sandbox: object}} options
 * @returns {Promise<{ok:true,value:{import:Function,get:Function,readBytes:Function,delete:Function}}|{ok:false,errors:Array<object>}>}
 */
export async function openFixtureArtifactLibrary(options) {
  let sandbox
  try {
    sandbox = readOptions(options)
  } catch (error) {
    return toFailure(error)
  }
  const state = getArtifactState(sandbox)
  try {
    return await enqueueArtifact(state, () => {
      if (isArtifactLocked(state)) return failure('LIBRARY_UNKNOWN', '$')
      try {
        readArtifactPack(state)
        return deepFreezeFixtureValue({ ok: true, value: createHandle(state) })
      } catch (error) {
        return toFailure(error)
      }
    })
  } catch (error) {
    return toFailure(error)
  }
}
