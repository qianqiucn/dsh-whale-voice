/* Whale Voice — Plan 08-E-B isolated Fixture WAV artifact library behavior tests.
 *
 * L01-L10 cover the real single-pack store: owned-byte import, canonical pack bytes, idempotent
 * identity, scope/rights/expiry gates, verified logical delete, bad packs, budgets, pre-commit
 * faults, post-rename unknown outcomes and capability boundaries. Faults are injected at the real
 * fs call site with in-process wrappers around `node:fs` (the modules import the same default
 * object), then restored; no product fs/parser/filename/callback hook is added and no real media,
 * Task, owner, network, clock or device access occurs.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import {
  ARTIFACT_LIBRARY_ERRORS,
  ARTIFACT_LIBRARY_LIMITS,
  ARTIFACT_LIBRARY_SCHEMA_VERSION,
  openFixtureArtifactLibrary,
} from '../core/audio/artifact-library.mjs'
import { inspectFixtureWavBytes } from '../core/audio/wav-byte-inspector.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'

const PACK = 'audio-artifacts-v1.json'
const MARKER = '.whale-voice-sandbox.json'
const NOW = '2026-10-29T00:00:00.000Z'
const LATER = '2026-10-29T00:10:00.000Z'
const EXPIRES = '2026-10-29T01:00:00.000Z'
const AFTER_EXPIRY = '2026-10-29T02:00:00.000Z'
const PROOF = 'fixture-rights:proof-1'
const BASE = fileURLToPath(new URL('..', import.meta.url))

/* --------------------------------------------- fixtures ------------------------------------- */

function wavBytes(frames = 16, rate = 16000, channels = 1) {
  const dataBytes = frames * channels * 2
  const bytes = Buffer.alloc(44 + dataBytes)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + dataBytes, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(channels, 22)
  bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * channels * 2, 28)
  bytes.writeUInt16LE(channels * 2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(dataBytes, 40)
  for (let index = 0; index < frames * channels; index += 1) {
    const sample = ((index * 97) % 2000) - 1000
    bytes.writeInt16LE(sample, 44 + index * 2)
  }
  return bytes
}

/** A legal exactly-1 MiB PCM16 WAV (44 + 1,048,532 bytes). */
function maxItemWav() {
  return wavBytes((ARTIFACT_LIBRARY_LIMITS.maxItemBytes - 44) / 2)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function packPath(sandbox) {
  return path.join(sandbox.root, PACK)
}

function filesIn(sandbox) {
  return fs.readdirSync(sandbox.root).sort()
}

function readPackBytes(sandbox) {
  return fs.readFileSync(packPath(sandbox))
}

function readPack(sandbox) {
  return JSON.parse(readPackBytes(sandbox).toString('utf8'))
}

function tempFiles(sandbox) {
  return filesIn(sandbox).filter((name) => name.endsWith('.tmp'))
}

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try {
    return await fn(sandbox)
  } finally {
    removeConfigSandbox(sandbox)
  }
}

async function open(sandbox) {
  const opened = await openFixtureArtifactLibrary({ sandbox })
  assert.equal(opened.ok, true, JSON.stringify(opened))
  return opened.value
}

function importRequest(overrides = {}) {
  return {
    schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION,
    scopeId: 'scope:fixture-a',
    requestKey: 'key:fixture-one',
    bytes: wavBytes(),
    now: NOW,
    expiresAt: EXPIRES,
    rights: { state: 'GRANTED', proofRef: PROOF },
    ...overrides,
  }
}

function readRequest(artifactRef, overrides = {}) {
  return {
    schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION,
    scopeId: 'scope:fixture-a',
    artifactRef,
    now: LATER,
    rights: { state: 'GRANTED', proofRef: PROOF },
    ...overrides,
  }
}

function deleteRequest(artifactRef, overrides = {}) {
  return {
    schemaVersion: ARTIFACT_LIBRARY_SCHEMA_VERSION,
    scopeId: 'scope:fixture-a',
    artifactRef,
    now: LATER,
    ...overrides,
  }
}

function expectError(result, key, errorPath) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal(result.errors.length, 1)
  const error = result.errors[0]
  assert.deepEqual(Object.keys(error).sort(), ['code', 'path', 'reason'])
  assert.equal(error.code, ARTIFACT_LIBRARY_ERRORS[key], JSON.stringify(result))
  assert.equal(typeof error.path, 'string')
  if (errorPath !== undefined) assert.equal(error.path, errorPath)
  assert.equal(Object.isFrozen(result), true)
  return error
}

function expectSuccess(result) {
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.value), true)
  return result.value
}

function expectOutcome(result, outcome) {
  const value = expectSuccess(result)
  assert.equal(value.outcome, outcome)
  assert.equal(value.mockOnly, true)
  assert.equal(value.realOperationAllowed, false)
  assert.equal(value.submitAllowed, false)
  assert.equal(value.automaticRetryAllowed, false)
  return value
}

/* ------------------------------------- manual pack construction ------------------------------ */

function storedEntry({
  artifactRef = 'artifact:fixture-bytes-' + '0'.repeat(32),
  scopeId = 'scope:fixture-a',
  requestKey = 'key:fixture-one',
  bytes = wavBytes(),
  createdAt = NOW,
  expiresAt = EXPIRES,
  proofRef = PROOF,
} = {}) {
  const inspected = inspectFixtureWavBytes({ schemaVersion: 1, bytes })
  assert.equal(inspected.ok, true)
  return {
    artifactRef,
    scopeId,
    requestKey,
    identityHash: sha256(Buffer.from(scopeId + '\u0000' + requestKey + '\u0000' + sha256(bytes))),
    origin: 'FIXTURE_IMPORT',
    createdAt,
    expiresAt,
    rights: { state: 'GRANTED', proofRef },
    inspection: inspected.value,
    payload: Buffer.from(bytes).toString('base64'),
    deletedAt: null,
  }
}

function patchFs(overrides) {
  const saved = new Map()
  for (const [key, factory] of Object.entries(overrides)) {
    saved.set(key, fs[key])
    fs[key] = factory(fs[key])
  }
  return () => {
    for (const [key, original] of saved) fs[key] = original
  }
}

function injectedError() {
  const error = new Error('injected fs fault')
  error.code = 'EIO'
  return error
}

/* ============================================= L01 ========================================== */

test('L01 real import/get/readBytes/reopen: one canonical pack, owned bytes, no Task binding', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    assert.deepEqual(Object.keys(library).sort(), ['delete', 'get', 'import', 'readBytes'])
    for (const name of Object.keys(library)) {
      assert.equal(typeof library[name], 'function')
      assert.equal(library[name].constructor.name, 'AsyncFunction', name + ' must be async')
    }
    assert.deepEqual(filesIn(sandbox), [MARKER], 'the factory must not create an empty pack')

    const bytes = wavBytes(64)
    const expected = inspectFixtureWavBytes({ schemaVersion: 1, bytes }).value
    const imported = expectOutcome(await library.import(importRequest({ bytes })), 'STORED')
    assert.equal(imported.revision, 1)
    assert.equal(imported.schemaVersion, ARTIFACT_LIBRARY_SCHEMA_VERSION)
    assert.match(imported.artifact.artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    assert.equal(imported.artifact.scopeId, 'scope:fixture-a')
    assert.equal(imported.artifact.requestKey, 'key:fixture-one')
    assert.equal(imported.artifact.origin, 'FIXTURE_IMPORT')
    assert.equal(imported.artifact.createdAt, NOW)
    assert.equal(imported.artifact.expiresAt, EXPIRES)
    assert.deepEqual(imported.artifact.rights, { state: 'GRANTED', proofRef: PROOF })
    assert.deepEqual(imported.artifact.inspection, expected)
    assert.equal(Object.keys(imported.artifact.inspection).length, 19)
    for (const frozen of [imported.artifact, imported.artifact.rights, imported.artifact.inspection]) {
      assert.equal(Object.isFrozen(frozen), true)
    }
    const envelopeJson = JSON.stringify(imported)
    assert.equal(envelopeJson.includes('taskId'), false)
    assert.equal(envelopeJson.includes('deliveryId'), false)
    assert.equal(envelopeJson.includes(sandbox.id), false, 'the cap id must never be returned')
    assert.equal(envelopeJson.includes(sandbox.root), false)
    assert.equal(envelopeJson.includes('base64'), false)

    const raw = readPack(sandbox)
    assert.deepEqual(Object.keys(raw), ['schemaVersion', 'sandboxId', 'revision', 'entries'])
    assert.equal(raw.schemaVersion, 1)
    assert.equal(raw.sandboxId, sandbox.id)
    assert.equal(raw.revision, 1)
    assert.equal(raw.entries.length, 1)
    assert.deepEqual(Object.keys(raw.entries[0]), [
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
    ])
    assert.equal(raw.entries[0].origin, 'FIXTURE_IMPORT')
    assert.equal(raw.entries[0].payload, Buffer.from(bytes).toString('base64'))
    assert.equal(raw.entries[0].deletedAt, null)
    assert.equal(raw.entries[0].inspection.sha256, expected.sha256)
    assert.deepEqual(filesIn(sandbox), [MARKER, PACK])

    const artifactRef = imported.artifact.artifactRef
    const found = expectOutcome(await library.get(readRequest(artifactRef)), 'FOUND')
    assert.deepEqual(found.artifact.inspection, expected)
    assert.equal(found.artifact.artifactRef, artifactRef)

    const read = await library.readBytes(readRequest(artifactRef))
    assert.equal(read.ok, true)
    const readValue = read.value
    assert.equal(readValue.outcome, 'FOUND')
    assert.equal(readValue.bytes.length, bytes.length)
    assert.equal(Buffer.compare(Buffer.from(readValue.bytes), bytes), 0)
    assert.equal(Object.isFrozen(readValue), true)
    assert.equal(Object.isFrozen(readValue.artifact), true)
    assert.equal(Object.isFrozen(readValue.bytes), false, 'returned bytes stay mutable')

    // Independently owned copies: changing the returned array or the original input changes neither
    // the pack nor a later read.
    readValue.bytes[0] = 0
    bytes[0] = 0
    const readAgain = await library.readBytes(readRequest(artifactRef))
    assert.equal(readAgain.ok, true)
    assert.equal(readAgain.value.bytes[0], 0x52)
    assert.equal(Buffer.compare(Buffer.from(readAgain.value.bytes), Buffer.from(readPack(sandbox).entries[0].payload, 'base64')), 0)

    const reopened = await open(sandbox)
    const afterReopen = expectOutcome(await reopened.get(readRequest(artifactRef)), 'FOUND')
    assert.deepEqual(afterReopen.artifact.inspection, expected)

    // A different valid WAV with a different key is a second independent asset.
    const second = expectOutcome(
      await reopened.import(importRequest({ requestKey: 'key:fixture-two', bytes: wavBytes(8), now: LATER })),
      'STORED',
    )
    assert.equal(second.revision, 2)
    assert.notEqual(second.artifact.artifactRef, artifactRef)
    assert.deepEqual(filesIn(sandbox), [MARKER, PACK], 'still exactly one pack file')
  })
})

test('L01 invalid WAV and invalid requests never write: INVALID_WAV / INVALID_BYTES / INVALID_INPUT', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const bad = Buffer.from(wavBytes(8))
    bad.write('NOPE', 0)
    expectError(await library.import(importRequest({ bytes: bad })), 'INVALID_WAV', 'bytes')
    assert.deepEqual(filesIn(sandbox), [MARKER])

    expectError(await library.import(importRequest({ bytes: [1, 2, 3] })), 'INVALID_BYTES', 'bytes')
    expectError(await library.import(importRequest({ bytes: 'RIFF' })), 'INVALID_BYTES', 'bytes')
    expectError(await library.import(importRequest({ schemaVersion: 2 })), 'UNSUPPORTED_VERSION', 'schemaVersion')
    expectError(await library.import(importRequest({ extra: true })), 'INVALID_INPUT', '<unknown-key>')
    expectError(await library.import({ ...importRequest(), [Symbol('x')]: 1 }), 'INVALID_INPUT', '<unknown-key>')
    const withGetter = importRequest()
    Object.defineProperty(withGetter, 'now', { enumerable: true, get() { throw new Error('getter ran') } })
    expectError(await library.import(withGetter), 'INVALID_INPUT', 'now')
    expectError(await library.import(importRequest({ scopeId: 'scope:bad space' })), 'INVALID_INPUT', 'scopeId')
    expectError(await library.import(importRequest({ now: '2026-10-29T00:00:00Z' })), 'INVALID_INPUT', 'now')
    expectError(
      await library.import(importRequest({ rights: { state: 'GRANTED', proofRef: null } })),
      'RIGHTS_REJECTED',
      'rights',
    )
    expectError(
      await library.import(importRequest({ rights: { state: 'GRANTED', proofRef: 'fixture-rights:' + 'x'.repeat(200) } })),
      'INVALID_INPUT',
      'rights',
    )
    expectError(await library.import(importRequest({ expiresAt: NOW })), 'EXPIRED', 'expiresAt')
    assert.deepEqual(filesIn(sandbox), [MARKER], 'no failed request may create a pack')
    const opened = await open(sandbox)
    expectOutcome(await opened.get(readRequest('artifact:fixture-bytes-' + '0'.repeat(32))), 'NOT_FOUND')
    expectError(
      await opened.get(readRequest('artifact:fixture-bytes-' + '0'.repeat(32), { scopeId: 'bad scope' })),
      'INVALID_INPUT',
      'scopeId',
    )
    expectError(await opened.get(readRequest('artifact:fixture-bytes-ZZZ')), 'INVALID_INPUT', 'artifactRef')
    expectError(
      await opened.delete({ ...deleteRequest('artifact:fixture-bytes-' + '0'.repeat(32)), rights: {} }),
      'INVALID_INPUT',
      '<unknown-key>',
    )
  })
})

/* ============================================= L02 ========================================== */

test('L02 identity and idempotency: EXISTING, KEY_CONFLICT, concurrent single write, independent ids', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const bytes = wavBytes(32)
    const first = expectOutcome(await library.import(importRequest({ bytes })), 'STORED')
    const packAfterFirst = readPackBytes(sandbox)
    const ref = first.artifact.artifactRef

    const replay = expectOutcome(
      await library.import(importRequest({ bytes, now: '2026-10-29T00:20:00.000Z' })),
      'EXISTING',
    )
    assert.equal(replay.revision, 1)
    assert.equal(replay.artifact.artifactRef, ref)
    assert.equal(replay.artifact.createdAt, NOW, 'a retry must not rewrite the birth time')
    assert.equal(Buffer.compare(readPackBytes(sandbox), packAfterFirst), 0, 'a retry must not write')

    expectError(await library.import(importRequest({ bytes: wavBytes(16) })), 'KEY_CONFLICT', 'requestKey')
    expectError(
      await library.import(importRequest({ bytes, expiresAt: '2026-10-29T03:00:00.000Z' })),
      'KEY_CONFLICT',
      'requestKey',
    )
    expectError(
      await library.import(importRequest({ bytes, rights: { state: 'GRANTED', proofRef: 'fixture-rights:other' } })),
      'KEY_CONFLICT',
      'requestKey',
    )
    assert.equal(Buffer.compare(readPackBytes(sandbox), packAfterFirst), 0)

    // Two existing handles on the same capability race the same key: the serial queue allows one
    // real commit and the other observes EXISTING with the same id.
    const secondHandle = await open(sandbox)
    const raceBytes = wavBytes(24)
    const [left, right] = await Promise.all([
      library.import(importRequest({ requestKey: 'key:fixture-race', bytes: raceBytes })),
      secondHandle.import(importRequest({ requestKey: 'key:fixture-race', bytes: raceBytes })),
    ])
    assert.equal(left.ok, true)
    assert.equal(right.ok, true)
    assert.deepEqual([left.value.outcome, right.value.outcome].sort(), ['EXISTING', 'STORED'])
    assert.equal(left.value.artifact.artifactRef, right.value.artifact.artifactRef)
    assert.equal(left.value.revision, right.value.revision)
    assert.equal(readPack(sandbox).revision, 2)
    assert.equal(readPack(sandbox).entries.length, 2)

    // Same bytes under another scope/key are another asset with its own id.
    const otherScope = expectOutcome(
      await library.import(importRequest({ scopeId: 'scope:fixture-b', requestKey: 'key:fixture-one-b', bytes })),
      'STORED',
    )
    const otherKey = expectOutcome(
      await library.import(importRequest({ requestKey: 'key:fixture-one-c', bytes })),
      'STORED',
    )
    assert.equal(otherScope.revision, 3)
    assert.equal(otherKey.revision, 4)
    for (const entry of [otherScope, otherKey]) {
      assert.notEqual(entry.artifact.artifactRef, ref)
    }
    const refs = readPack(sandbox).entries.map((entry) => entry.artifactRef)
    assert.equal(new Set(refs).size, refs.length)

    // Bounded id-collision control: an entry already holds the one id the random source can issue,
    // so a second key must fail after three attempts with ID_COLLISION and no write. Restoring the
    // real random source allows the same request.
    const realRandomBytes = crypto.randomBytes
    const forced = Buffer.alloc(16, 7)
    const forcedRef = 'artifact:fixture-bytes-' + '07'.repeat(16)
    crypto.randomBytes = (size) => {
      if (size === 16) return Buffer.from(forced)
      return realRandomBytes.call(crypto, size)
    }
    try {
      const forcedImport = expectOutcome(
        await library.import(importRequest({ requestKey: 'key:fixture-forced-id', bytes: wavBytes(10) })),
        'STORED',
      )
      assert.equal(forcedImport.artifact.artifactRef, forcedRef)
      const beforeCollision = readPackBytes(sandbox)
      expectError(
        await library.import(importRequest({ requestKey: 'key:fixture-collision', bytes: wavBytes(12) })),
        'ID_COLLISION',
        '$',
      )
      assert.equal(Buffer.compare(readPackBytes(sandbox), beforeCollision), 0, 'ID_COLLISION must not write')
    } finally {
      crypto.randomBytes = realRandomBytes
    }
    const afterRestore = expectOutcome(
      await library.import(importRequest({ requestKey: 'key:fixture-collision', bytes: wavBytes(12) })),
      'STORED',
    )
    assert.match(afterRestore.artifact.artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    assert.notEqual(afterRestore.artifact.artifactRef, forcedRef)
  })
})

/* ============================================= L03 ========================================== */

test('L03 pre-queue owned snapshot: caller mutation, Buffer views and shadowed native properties', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)

    const original = wavBytes(40)
    const expectedHash = sha256(original)
    const rights = { state: 'GRANTED', proofRef: PROOF }
    const bytes = Buffer.from(original)
    const pending = library.import(importRequest({ bytes, rights }))
    // The import copied and validated synchronously before its first await/queue.
    bytes.fill(0)
    rights.proofRef = 'fixture-rights:mutated'
    const imported = expectOutcome(await pending, 'STORED')
    assert.equal(imported.artifact.inspection.sha256, expectedHash)
    assert.deepEqual(imported.artifact.rights, { state: 'GRANTED', proofRef: PROOF })
    assert.equal(Buffer.compare(Buffer.from(readPack(sandbox).entries[0].payload, 'base64'), original), 0)

    // A real Uint8Array subarray view (byteOffset > 0) is copied at its exact view range only.
    const inner = wavBytes(20)
    const padded = new Uint8Array(7 + inner.length)
    padded.set([1, 2, 3, 4, 5, 6, 7], 0)
    padded.set(inner, 7)
    const view = padded.subarray(7)
    assert.equal(view.byteOffset, 7)
    const fromView = expectOutcome(
      await library.import(importRequest({ requestKey: 'key:fixture-view', bytes: view })),
      'STORED',
    )
    assert.equal(fromView.artifact.inspection.sha256, sha256(view))
    assert.equal(readPack(sandbox).entries.length, 2)

    // Shadowed instance properties, constructor/species/iterator and throwing methods are never
    // consulted: the native-slot check and the intrinsic copy read internal slots only.
    let calls = 0
    const trapped = new Uint8Array(wavBytes(16))
    for (const key of ['constructor', 'byteLength', 'buffer', 'byteOffset', 'length']) {
      Object.defineProperty(trapped, key, {
        configurable: true,
        enumerable: false,
        get() {
          calls += 1
          throw new Error('shadowed ' + key + ' ran')
        },
      })
    }
    for (const key of ['slice', 'subarray', 'set']) {
      Object.defineProperty(trapped, key, {
        configurable: true,
        enumerable: false,
        value() {
          calls += 1
          throw new Error('shadowed ' + key + ' ran')
        },
      })
    }
    Object.defineProperty(trapped, Symbol.iterator, {
      configurable: true,
      enumerable: false,
      value() {
        calls += 1
        throw new Error('iterator ran')
      },
    })
    Object.defineProperty(trapped, Symbol.species, {
      configurable: true,
      enumerable: false,
      get() {
        calls += 1
        throw new Error('species ran')
      },
    })
    const trappedImport = expectOutcome(
      await library.import(importRequest({ requestKey: 'key:fixture-trapped', bytes: trapped })),
      'STORED',
    )
    assert.equal(calls, 0, 'no user property/method may run')
    assert.equal(
      trappedImport.artifact.inspection.sha256,
      inspectFixtureWavBytes({ schemaVersion: 1, bytes: wavBytes(16) }).value.sha256,
    )

    // Invalid native carriers are refused before any inspection.
    const detached = new Uint8Array(new ArrayBuffer(64))
    structuredClone(detached.buffer, { transfer: [detached.buffer] })
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-detached', bytes: detached })),
      'INVALID_BYTES',
      'bytes',
    )
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-proxy', bytes: new Proxy(new Uint8Array(wavBytes(8)), {}) })),
      'INVALID_BYTES',
      'bytes',
    )
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-u16', bytes: new Uint16Array(wavBytes(8)) })),
      'INVALID_BYTES',
      'bytes',
    )
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-shared', bytes: new Uint8Array(new SharedArrayBuffer(64)) })),
      'INVALID_BYTES',
      'bytes',
    )

    // A returned byte array is a fresh independent mutable copy: changing it changes nothing else.
    const target = readPack(sandbox).entries.find((entry) => entry.requestKey === 'key:fixture-view')
    const ref = target.artifactRef
    const read = await library.readBytes(readRequest(ref))
    assert.equal(read.ok, true)
    const before = Buffer.from(read.value.bytes)
    read.value.bytes.fill(255)
    const again = await library.readBytes(readRequest(ref))
    assert.equal(again.ok, true)
    assert.equal(Buffer.compare(Buffer.from(again.value.bytes), before), 0)
    const meta = expectOutcome(await library.get(readRequest(ref)), 'FOUND')
    assert.equal(meta.artifact.inspection.sha256, sha256(view))
  })
})

/* ============================================= L04 ========================================== */

test('L04 scope/rights/expiry: cross-scope NOT_FOUND, RIGHTS_REJECTED, EXPIRED without payload', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const imported = expectOutcome(await library.import(importRequest({ bytes: wavBytes(16) })), 'STORED')
    const ref = imported.artifact.artifactRef

    // Another scope cannot even learn that the artifact exists.
    for (const operation of ['get', 'readBytes', 'delete']) {
      const result = await library[operation](
        operation === 'delete'
          ? deleteRequest(ref, { scopeId: 'scope:fixture-b' })
          : readRequest(ref, { scopeId: 'scope:fixture-b' }),
      )
      if (operation === 'delete') expectOutcome(result, 'NOT_FOUND')
      else {
        const value = expectOutcome(result, 'NOT_FOUND')
        assert.equal(value.artifact, null)
        assert.equal('bytes' in value, false)
      }
    }

    for (const rights of [
      { state: 'DENIED', proofRef: PROOF },
      { state: 'UNKNOWN', proofRef: PROOF },
      { state: 'GRANTED', proofRef: 'fixture-rights:other' },
      { state: 'DENIED', proofRef: null },
    ]) {
      expectError(await library.get(readRequest(ref, { rights })), 'RIGHTS_REJECTED', 'rights')
      expectError(await library.readBytes(readRequest(ref, { rights })), 'RIGHTS_REJECTED', 'rights')
    }

    // Expiry is exclusive at the declared UTC instant; no metadata/bytes are returned.
    const atExpiry = await library.get(readRequest(ref, { now: EXPIRES }))
    const expired = expectOutcome(atExpiry, 'EXPIRED')
    assert.equal(expired.artifact, null)
    const expiredRead = await library.readBytes(readRequest(ref, { now: AFTER_EXPIRY }))
    const expiredValue = expectOutcome(expiredRead, 'EXPIRED')
    assert.equal(expiredValue.artifact, null)
    assert.equal('bytes' in expiredValue, false)

    // The replay of the same identity after expiry reports EXPIRED and never renews the entry.
    const before = readPackBytes(sandbox)
    const replay = expectOutcome(
      await library.import(importRequest({ bytes: wavBytes(16), now: AFTER_EXPIRY })),
      'EXPIRED',
    )
    assert.equal(replay.revision, 1)
    assert.equal(Buffer.compare(readPackBytes(sandbox), before), 0, 'an expired replay must not rewrite')
    assert.equal(readPack(sandbox).entries[0].expiresAt, EXPIRES)

    // Expired/revoked entries can still be cleaned by the same scope (without rights proof).
    const deleted = expectOutcome(await library.delete(deleteRequest(ref, { now: AFTER_EXPIRY })), 'DELETED')
    assert.equal(deleted.revision, 2)
    assert.equal(deleted.artifact, null)
  })
})

test('L04 import admission: DENIED/UNKNOWN and GRANTED without a proof are refused before writing', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    for (const rights of [
      { state: 'DENIED', proofRef: PROOF },
      { state: 'UNKNOWN', proofRef: null },
      { state: 'GRANTED', proofRef: null },
    ]) {
      expectError(await library.import(importRequest({ rights })), 'RIGHTS_REJECTED', 'rights')
    }
    assert.deepEqual(filesIn(sandbox), [MARKER])
    const ok = expectOutcome(await library.import(importRequest()), 'STORED')
    assert.equal(ok.revision, 1)
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-x', rights: { state: 'DENIED', proofRef: null } })),
      'RIGHTS_REJECTED',
      'rights',
    )
    assert.equal(readPack(sandbox).revision, 1)
  })
})

/* ============================================= L05 ========================================== */

test('L05 verified logical delete: tombstone without payload, no revival, stale pack locked out', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const bytesA = wavBytes(16)
    const bytesB = wavBytes(32)
    const artifactA = expectOutcome(
      await library.import(importRequest({ requestKey: 'key:fixture-a', bytes: bytesA })),
      'STORED',
    )
    const artifactB = expectOutcome(
      await library.import(importRequest({ requestKey: 'key:fixture-b', bytes: bytesB })),
      'STORED',
    )
    const refA = artifactA.artifact.artifactRef
    const refB = artifactB.artifact.artifactRef
    const beforeDelete = readPackBytes(sandbox)
    const earlierRead = await library.readBytes(readRequest(refA))
    const earlierCopy = Buffer.from(earlierRead.value.bytes)

    const deleted = expectOutcome(await library.delete(deleteRequest(refA, { now: '2026-10-29T00:20:00.000Z' })), 'DELETED')
    assert.equal(deleted.revision, 3, '1 STORED + 1 STORED replaced by 1 DELETED (weight 2) = 3')
    assert.equal(deleted.artifact, null)

    const raw = readPack(sandbox)
    const tombstone = raw.entries.find((entry) => entry.artifactRef === refA)
    assert.ok(tombstone)
    assert.equal(tombstone.payload, null, 'the tombstone must not keep its bytes')
    assert.equal(tombstone.deletedAt, '2026-10-29T00:20:00.000Z')
    assert.equal(tombstone.artifactRef, refA)
    assert.equal(typeof tombstone.identityHash, 'string')
    assert.equal(tombstone.identityHash.length, 64)
    assert.equal(tombstone.rights.state, 'GRANTED')
    const packText = readPackBytes(sandbox).toString('utf8')
    assert.equal(packText.includes(Buffer.from(bytesA).toString('base64')), false, 'deleted bytes are gone from the pack')

    const gone = expectOutcome(await library.get(readRequest(refA)), 'DELETED')
    assert.equal(gone.artifact, null)
    assert.equal('bytes' in gone, false)
    const goneRead = await library.readBytes(readRequest(refA))
    assert.equal('bytes' in goneRead.value, false)

    const packAfterDelete = readPackBytes(sandbox)
    const repeat = expectOutcome(await library.delete(deleteRequest(refA)), 'ALREADY_DELETED')
    assert.equal(repeat.revision, 3)
    assert.equal(Buffer.compare(readPackBytes(sandbox), packAfterDelete), 0, 'a repeated delete must not write')

    // A matching replay cannot revive the key; a different identity is an explicit conflict.
    expectOutcome(await library.import(importRequest({ requestKey: 'key:fixture-a', bytes: bytesA })), 'DELETED')
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-a', bytes: bytesB })),
      'KEY_CONFLICT',
      'requestKey',
    )
    assert.equal(readPack(sandbox).revision, 3)

    // The other asset and a previously returned copy are unaffected.
    const other = expectOutcome(await library.get(readRequest(refB)), 'FOUND')
    assert.equal(other.artifact.requestKey, 'key:fixture-b')
    const otherRead = await library.readBytes(readRequest(refB))
    assert.equal(Buffer.compare(Buffer.from(otherRead.value.bytes), bytesB), 0)
    assert.equal(Buffer.compare(earlierCopy, bytesA), 0)

    // An external restore of the old (pre-delete) pack is detected by the confirmed digest and
    // locks the artifact domain; the visible bytes are neither adopted nor deleted.
    fs.writeFileSync(packPath(sandbox), beforeDelete)
    expectError(await library.get(readRequest(refB)), 'STORE_CHANGED', '$')
    const lockedRead = await library.get(readRequest(refB))
    expectError(lockedRead, 'LIBRARY_UNKNOWN', '$')
    const reopened = await openFixtureArtifactLibrary({ sandbox })
    expectError(reopened, 'LIBRARY_UNKNOWN', '$')
    assert.equal(Buffer.compare(readPackBytes(sandbox), beforeDelete), 0, 'the external bytes stay untouched')
  })
})

/* ============================================= L06 ========================================== */

test('L06 invalid packs are refused without repair; confirmed corruption locks every handle', async () => {
  await withSandbox(async (sandbox) => {
    const valid = storedEntry()
    const pretty = JSON.stringify({ schemaVersion: 1, sandboxId: sandbox.id, revision: 1, entries: [valid] }, null, 2)
    fs.writeFileSync(packPath(sandbox), pretty)
    const prettyOpened = await openFixtureArtifactLibrary({ sandbox })
    expectError(prettyOpened, 'STORE_INVALID', '$')
    assert.equal(fs.readFileSync(packPath(sandbox), 'utf8'), pretty, 'a bad pack is never repaired')
  })

  const cases = [
    {
      name: 'non-canonical base64',
      mutate: (entry) => { entry.payload = entry.payload.slice(0, -2) + 'A=' },
    },
    {
      name: 'payload/hash mismatch',
      mutate: (entry) => { entry.payload = Buffer.from(wavBytes(8)).toString('base64') },
    },
    {
      name: 'tombstone with payload',
      mutate: (entry) => { entry.payload = null; entry.deletedAt = null },
    },
    {
      name: 'stored entry with non-GRANTED rights',
      mutate: (entry) => { entry.rights = { state: 'DENIED', proofRef: 'fixture-rights:denied' } },
    },
    {
      name: 'stored entry with GRANTED but null proof',
      mutate: (entry) => { entry.rights = { state: 'GRANTED', proofRef: null } },
    },
    {
      name: 'payload entry with deletedAt',
      mutate: (entry) => { entry.deletedAt = entry.createdAt },
    },
    {
      name: 'unknown entry key',
      mutate: (entry) => { entry.hidden = 1 },
    },
    {
      name: 'wrong sandbox id',
      mutate: (entry, snapshot) => { snapshot.sandboxId = 'f'.repeat(64); void entry },
    },
    {
      name: 'revision mismatch',
      mutate: (entry, snapshot) => { snapshot.revision = 9; void entry },
    },
  ]
  for (const scenario of cases) {
    await withSandbox(async (inner) => {
      const entry = storedEntry()
      const snapshot = { schemaVersion: 1, sandboxId: inner.id, revision: 1, entries: [entry] }
      scenario.mutate(entry, snapshot)
      fs.writeFileSync(packPath(inner), JSON.stringify(snapshot))
      const opened = await openFixtureArtifactLibrary({ sandbox: inner })
      assert.equal(opened.ok, false, scenario.name)
      assert.equal(opened.errors[0].code, ARTIFACT_LIBRARY_ERRORS.STORE_INVALID, scenario.name + ': ' + JSON.stringify(opened))
      assert.equal(JSON.stringify(opened).includes(inner.id), false)
    })
  }

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const imported = expectOutcome(await library.import(importRequest()), 'STORED')
    const ref = imported.artifact.artifactRef
    const goodBytes = readPackBytes(sandbox)
    fs.writeFileSync(packPath(sandbox), '{bad')
    expectError(await library.get(readRequest(ref)), 'STORE_INVALID', '$')
    expectError(await library.get(readRequest(ref)), 'LIBRARY_UNKNOWN', '$')
    expectError(await library.import(importRequest({ requestKey: 'key:fixture-late' })), 'LIBRARY_UNKNOWN', '$')
    const reopened = await openFixtureArtifactLibrary({ sandbox })
    expectError(reopened, 'LIBRARY_UNKNOWN', '$')
    assert.equal(fs.readFileSync(packPath(sandbox), 'utf8'), '{bad', 'the corrupt pack is kept as found')
    assert.notEqual(Buffer.compare(readPackBytes(sandbox), goodBytes), 0)

    // A legal-looking external rewrite (same Schema, different bytes) is STORE_CHANGED and locked.
    await withSandbox(async (other) => {
      const otherLibrary = await open(other)
      const otherImport = expectOutcome(await otherLibrary.import(importRequest()), 'STORED')
      const pack = readPack(other)
      pack.entries[0].createdAt = '2026-10-29T00:00:01.000Z'
      fs.writeFileSync(packPath(other), JSON.stringify(pack))
      expectError(await otherLibrary.get(readRequest(otherImport.artifact.artifactRef)), 'STORE_CHANGED', '$')
      expectError(await otherLibrary.delete(deleteRequest(otherImport.artifact.artifactRef)), 'LIBRARY_UNKNOWN', '$')
      const fresh = await openFixtureArtifactLibrary({ sandbox: other })
      expectError(fresh, 'LIBRARY_UNKNOWN', '$')
    })
  })
})

/* ============================================= L07 ========================================== */

test('L07 fixed budgets: 1 MiB item, 4 MiB decoded total, 32 entries with tombstones, bounded pack read', async () => {
  assert.equal(ARTIFACT_LIBRARY_LIMITS.maxItemBytes, 1048576)
  assert.equal(ARTIFACT_LIBRARY_LIMITS.maxDecodedBytes, 4194304)
  assert.equal(ARTIFACT_LIBRARY_LIMITS.maxEntries, 32)
  assert.equal(ARTIFACT_LIBRARY_LIMITS.maxPackBytes, 6291456)
  assert.equal(Object.isFrozen(ARTIFACT_LIBRARY_LIMITS), true)

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const exact = maxItemWav()
    assert.equal(exact.length, ARTIFACT_LIBRARY_LIMITS.maxItemBytes)
    const stored = expectOutcome(await library.import(importRequest({ bytes: exact })), 'STORED')
    assert.equal(stored.artifact.inspection.byteLength, exact.length)
    const over = Buffer.alloc(ARTIFACT_LIBRARY_LIMITS.maxItemBytes + 1)
    const beforeOver = readPackBytes(sandbox)
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-over', bytes: over })),
      'RESOURCE_LIMIT',
      'bytes',
    )
    assert.equal(Buffer.compare(readPackBytes(sandbox), beforeOver), 0, 'an over-budget item must not write')
  })

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    for (let index = 0; index < 4; index += 1) {
      const stored = expectOutcome(
        await library.import(importRequest({ requestKey: 'key:fixture-max-' + index, bytes: maxItemWav() })),
        'STORED',
      )
      assert.equal(stored.revision, index + 1)
    }
    const before = readPackBytes(sandbox)
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-over-total', bytes: wavBytes(8) })),
      'RESOURCE_LIMIT',
      'bytes',
    )
    assert.equal(Buffer.compare(readPackBytes(sandbox), before), 0, 'the 4 MiB total must not be exceeded')
    assert.equal(readPack(sandbox).revision, 4)
  })

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    for (let index = 0; index < ARTIFACT_LIBRARY_LIMITS.maxEntries; index += 1) {
      expectOutcome(
        await library.import(importRequest({ requestKey: 'key:fixture-entry-' + index, bytes: wavBytes(2) })),
        'STORED',
      )
    }
    assert.equal(readPack(sandbox).entries.length, 32)
    const before = readPackBytes(sandbox)
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-entry-over', bytes: wavBytes(2) })),
      'RESOURCE_LIMIT',
      '$',
    )
    assert.equal(Buffer.compare(readPackBytes(sandbox), before), 0)

    const victim = readPack(sandbox).entries[0].artifactRef
    const deleted = expectOutcome(await library.delete(deleteRequest(victim)), 'DELETED')
    assert.equal(deleted.revision, 33)
    assert.equal(readPack(sandbox).entries.length, 32, 'a tombstone still counts toward the entry budget')
    expectError(
      await library.import(importRequest({ requestKey: 'key:fixture-entry-over', bytes: wavBytes(2) })),
      'RESOURCE_LIMIT',
      '$',
    )
    assert.equal(readPack(sandbox).revision, 33)
  })

  await withSandbox(async (sandbox) => {
    fs.writeFileSync(packPath(sandbox), Buffer.alloc(ARTIFACT_LIBRARY_LIMITS.maxPackBytes + 1, 120))
    const opened = await openFixtureArtifactLibrary({ sandbox })
    expectError(opened, 'RESOURCE_LIMIT', '$')
    assert.equal(fs.statSync(packPath(sandbox)).size, ARTIFACT_LIBRARY_LIMITS.maxPackBytes + 1)
  })
})

/* ============================================= L08 ========================================== */

test('L08 pre-commit failures: short-write completion, write/fsync/close rejection, no rename, one close', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    expectOutcome(await library.import(importRequest({ bytes: wavBytes(8) })), 'STORED')
    const baseline = readPackBytes(sandbox)

    // Short writes are completed by the loop: a 7-byte cap still produces the whole canonical pack.
    let shortWrites = 0
    let tempFd = null
    let restore = patchFs({
      openSync: (original) => function patchedOpen(target, flags, ...rest) {
        const fd = original.call(fs, target, flags, ...rest)
        if (String(target).endsWith('.tmp')) tempFd = fd
        return fd
      },
      writeSync: (original) => function patchedWrite(fd, buffer, offset, length, position) {
        if (fd === tempFd) {
          shortWrites += 1
          return original.call(fs, fd, buffer, offset, Math.min(7, length), position)
        }
        return original.apply(fs, arguments)
      },
    })
    try {
      const stored = expectOutcome(
        await library.import(importRequest({ requestKey: 'key:fixture-short', bytes: wavBytes(12) })),
        'STORED',
      )
      assert.ok(shortWrites > 1, 'the documented short-write loop must run more than once')
      assert.equal(stored.revision, 2)
      assert.equal(readPack(sandbox).revision, 2)
    } finally {
      restore()
    }
    const afterShort = readPackBytes(sandbox)

    // A real write error is WRITE_REJECTED: old bytes untouched, zero rename, own temp cleaned.
    let renames = 0
    tempFd = null
    restore = patchFs({
      openSync: (original) => function patchedOpen(target, flags, ...rest) {
        const fd = original.call(fs, target, flags, ...rest)
        if (String(target).endsWith('.tmp')) tempFd = fd
        return fd
      },
      writeSync: (original) => function patchedWrite(fd, buffer, offset, length, position) {
        if (fd === tempFd) throw injectedError()
        return original.apply(fs, arguments)
      },
      renameSync: (original) => function patchedRename(...args) {
        renames += 1
        return original.apply(fs, args)
      },
    })
    try {
      expectError(
        await library.import(importRequest({ requestKey: 'key:fixture-write-fail', bytes: wavBytes(12) })),
        'WRITE_REJECTED',
        '$',
      )
    } finally {
      restore()
    }
    assert.equal(renames, 0)
    assert.deepEqual(tempFiles(sandbox), [], 'the own temp must be cleaned once')
    assert.equal(Buffer.compare(readPackBytes(sandbox), afterShort), 0)

    // fsync failure is also pre-commit WRITE_REJECTED with no rename and no temp left.
    renames = 0
    tempFd = null
    restore = patchFs({
      openSync: (original) => function patchedOpen(target, flags, ...rest) {
        const fd = original.call(fs, target, flags, ...rest)
        if (String(target).endsWith('.tmp')) tempFd = fd
        return fd
      },
      fsyncSync: (original) => function patchedFsync(fd) {
        if (fd === tempFd) throw injectedError()
        return original.apply(fs, arguments)
      },
      renameSync: (original) => function patchedRename(...args) {
        renames += 1
        return original.apply(fs, args)
      },
    })
    try {
      expectError(
        await library.import(importRequest({ requestKey: 'key:fixture-fsync-fail', bytes: wavBytes(12) })),
        'WRITE_REJECTED',
        '$',
      )
    } finally {
      restore()
    }
    assert.equal(renames, 0)
    assert.deepEqual(tempFiles(sandbox), [])
    assert.equal(Buffer.compare(readPackBytes(sandbox), afterShort), 0)

    // A close failure is not retried: the temp lease is closed at most once and the old pack stays.
    renames = 0
    tempFd = null
    const closeCalls = new Map()
    let closeThrew = false
    restore = patchFs({
      openSync: (original) => function patchedOpen(target, flags, ...rest) {
        const fd = original.call(fs, target, flags, ...rest)
        if (String(target).endsWith('.tmp')) {
          tempFd = fd
          closeCalls.set(fd, 0)
        }
        return fd
      },
      closeSync: (original) => function patchedClose(fd) {
        closeCalls.set(fd, (closeCalls.get(fd) || 0) + 1)
        if (fd === tempFd && !closeThrew) {
          closeThrew = true
          throw injectedError()
        }
        return original.apply(fs, arguments)
      },
      renameSync: (original) => function patchedRename(...args) {
        renames += 1
        return original.apply(fs, args)
      },
    })
    try {
      expectError(
        await library.import(importRequest({ requestKey: 'key:fixture-close-fail', bytes: wavBytes(12) })),
        'WRITE_REJECTED',
        '$',
      )
    } finally {
      restore()
    }
    assert.equal(closeThrew, true)
    assert.equal(closeCalls.get(tempFd), 1, 'a throwing close must not be retried')
    assert.equal(renames, 0)
    assert.equal(Buffer.compare(readPackBytes(sandbox), afterShort), 0)
    assert.equal(readPack(sandbox).revision, 2)
  })
})

/* ============================================= L09 ========================================== */

test('L09 post-rename unknown: import and delete keep the real bytes, lock every handle, never retry', async () => {
  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    expectOutcome(await library.import(importRequest({ bytes: wavBytes(8) })), 'STORED')
    const baseline = readPackBytes(sandbox)
    let renames = 0
    let restore = patchFs({
      renameSync: (original) => function patchedRename(from, to) {
        const result = original.call(fs, from, to)
        if (String(to).endsWith(PACK)) {
          renames += 1
          throw injectedError()
        }
        return result
      },
    })
    try {
      expectError(
        await library.import(importRequest({ requestKey: 'key:fixture-unknown-import', bytes: wavBytes(12) })),
        'WRITE_UNKNOWN',
        '$',
      )
    } finally {
      restore()
    }
    assert.equal(renames, 1, 'exactly one real rename attempt')
    const committed = readPack(sandbox)
    assert.equal(committed.revision, 2)
    assert.equal(committed.entries.length, 2, 'the real committed STORED entry is kept and not rolled back')
    const committedBytes = readPackBytes(sandbox)
    assert.notEqual(Buffer.compare(committedBytes, baseline), 0)

    expectError(await library.get(readRequest(committed.entries[1].artifactRef)), 'LIBRARY_UNKNOWN', '$')
    expectError(await library.delete(deleteRequest(committed.entries[0].artifactRef)), 'LIBRARY_UNKNOWN', '$')
    const reopened = await openFixtureArtifactLibrary({ sandbox })
    expectError(reopened, 'LIBRARY_UNKNOWN', '$')
    assert.equal(Buffer.compare(readPackBytes(sandbox), committedBytes), 0, 'no retry or rewrite after UNKNOWN')
  })

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const imported = expectOutcome(await library.import(importRequest({ bytes: wavBytes(16) })), 'STORED')
    const ref = imported.artifact.artifactRef
    const other = expectOutcome(
      await library.import(importRequest({ requestKey: 'key:fixture-other', bytes: wavBytes(8) })),
      'STORED',
    )
    assert.equal(other.revision, 2)
    let renames = 0
    const restore = patchFs({
      renameSync: (original) => function patchedRename(from, to) {
        const result = original.call(fs, from, to)
        if (String(to).endsWith(PACK)) {
          renames += 1
          throw injectedError()
        }
        return result
      },
    })
    try {
      expectError(await library.delete(deleteRequest(ref)), 'WRITE_UNKNOWN', '$')
    } finally {
      restore()
    }
    assert.equal(renames, 1)
    const raw = readPack(sandbox)
    const tombstone = raw.entries.find((entry) => entry.artifactRef === ref)
    assert.equal(tombstone.payload, null, 'the real committed delete is kept on disk')
    assert.equal(raw.revision, 3)
    expectError(await library.get(readRequest(other.artifact.artifactRef)), 'LIBRARY_UNKNOWN', '$')
    const reopened = await openFixtureArtifactLibrary({ sandbox })
    expectError(reopened, 'LIBRARY_UNKNOWN', '$')
  })
})

/* ============================================= L10 ========================================== */

test('L10 capability boundaries: fake caps, marker/root loss, links, cleanup trust, Task domain separation', async () => {
  // Options are exactly one own enumerable data field `sandbox`; only a registered cap is accepted.
  const plain = { sandbox: { root: 'C:\\tmp', id: 'x' } }
  expectError(await openFixtureArtifactLibrary(plain), 'SANDBOX_INVALID', '$')
  expectError(await openFixtureArtifactLibrary(), 'INVALID_INPUT', '$')
  expectError(await openFixtureArtifactLibrary({}), 'INVALID_INPUT', '$')
  await withSandbox(async (sandbox) => {
    expectError(await openFixtureArtifactLibrary({ sandbox, extra: 1 }), 'INVALID_INPUT', '<unknown-key>')
    const withGetter = {}
    Object.defineProperty(withGetter, 'sandbox', { enumerable: true, get() { throw new Error('getter ran') } })
    expectError(await openFixtureArtifactLibrary(withGetter), 'INVALID_INPUT', '$')
  })

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const imported = expectOutcome(await library.import(importRequest()), 'STORED')
    const ref = imported.artifact.artifactRef

    // A missing marker makes the capability untrusted; the pack is never repaired or rewritten.
    const markerPath = path.join(sandbox.root, MARKER)
    const markerBytes = fs.readFileSync(markerPath)
    fs.rmSync(markerPath)
    expectError(await library.get(readRequest(ref)), 'SANDBOX_INVALID', '$')
    const reopened = await openFixtureArtifactLibrary({ sandbox })
    expectError(reopened, 'SANDBOX_INVALID', '$')
    assert.equal(fs.existsSync(packPath(sandbox)), true)
    fs.writeFileSync(markerPath, markerBytes)
    // Only the capability check failed, so the artifact bytes were never touched.
    const recovered = await open(sandbox)
    expectOutcome(await recovered.get(readRequest(ref)), 'FOUND')
  })

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    expectOutcome(await library.import(importRequest()), 'STORED')
    const original = readPackBytes(sandbox)
    fs.rmSync(packPath(sandbox))
    fs.writeFileSync(packPath(sandbox), original)
    // A hard link (nlink > 1) is not accepted as the official pack.
    const linkPath = path.join(sandbox.root, 'pack-link.json')
    fs.linkSync(packPath(sandbox), linkPath)
    try {
      expectError(await library.get(readRequest('artifact:fixture-bytes-' + '0'.repeat(32))), 'STORE_INVALID', '$')
    } finally {
      fs.rmSync(linkPath, { force: true })
    }
    assert.equal(fs.readFileSync(packPath(sandbox)).length, original.length)
  })

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    expectOutcome(await library.import(importRequest()), 'STORED')
    const baseline = readPackBytes(sandbox)
    // Symlinks may require privileges on Windows: skip honestly when the platform refuses.
    const outside = path.join(sandbox.root, 'outside.json')
    fs.writeFileSync(outside, baseline)
    const linkPack = packPath(sandbox)
    fs.rmSync(linkPack)
    let linked = false
    try {
      fs.symlinkSync(outside, linkPack)
      linked = true
    } catch {
      fs.writeFileSync(linkPack, baseline)
    }
    if (linked) {
      expectError(await library.get(readRequest('artifact:fixture-bytes-' + '0'.repeat(32))), 'STORE_INVALID', '$')
    }
    fs.rmSync(linkPack, { force: true })
    fs.writeFileSync(linkPack, baseline)
  })

  await withSandbox(async (sandbox) => {
    const library = await open(sandbox)
    const kept = expectOutcome(await library.import(importRequest({ bytes: wavBytes(8) })), 'STORED')
    const keptRef = kept.artifact.artifactRef
    const baseline = readPackBytes(sandbox)
    // During the temp fsync the marker disappears: the write is rejected, cleanup eligibility is
    // permanently blocked, and the transaction's own temp file is left in place.
    let tempFd = null
    let faulted = false
    const restore = patchFs({
      openSync: (original) => function patchedOpen(target, flags, ...rest) {
        const fd = original.call(fs, target, flags, ...rest)
        if (String(target).endsWith('.tmp')) tempFd = fd
        return fd
      },
      fsyncSync: (original) => function patchedFsync(fd) {
        const result = original.apply(fs, arguments)
        if (fd === tempFd && !faulted) {
          faulted = true
          fs.rmSync(path.join(sandbox.root, MARKER))
          throw injectedError()
        }
        return result
      },
    })
    try {
      expectError(
        await library.import(importRequest({ requestKey: 'key:fixture-cleanup-fail', bytes: wavBytes(12) })),
        'SANDBOX_INVALID',
        '$',
      )
    } finally {
      restore()
    }
    assert.equal(tempFiles(sandbox).length, 1, 'a blocked cleanup must not delete anything')
    assert.equal(Buffer.compare(readPackBytes(sandbox), baseline), 0, 'the old pack is unchanged')
    fs.writeFileSync(path.join(sandbox.root, MARKER), JSON.stringify({
      kind: 'whale-voice-isolated-sandbox',
      id: sandbox.id,
      createdAt: NOW,
      pid: process.pid,
    }))
    const afterRestore = await open(sandbox)
    expectOutcome(await afterRestore.get(readRequest(keptRef)), 'FOUND')
  })

  await withSandbox(async (sandbox) => {
    // Artifact faults must not lock or rewrite the separate Task catalog/owner domain.
    const catalog = await openFixtureTaskCatalog({ sandbox })
    assert.equal(catalog.ok, true, JSON.stringify(catalog))
    const doc = fs.readFileSync(path.join(BASE, 'docs/TASK_FIXTURE_RUNNER_OFFLINE.md'), 'utf8')
    const at = doc.indexOf('## 7.')
    const fence = doc.indexOf('```json', at)
    const close = doc.indexOf('```', fence + 7)
    const example = JSON.parse(doc.slice(fence + 7, close).trim())
    const binding = example.sourceInput.voiceBinding
    const draft = JSON.parse(JSON.stringify(binding.taskDraft))
    delete draft.taskId
    const reserved = await catalog.value.reserve({
      schemaVersion: 1,
      scopeId: binding.expectation.scopeId,
      idempotencyKey: 'key:fixture-artifact-domain',
      draft,
      observedAt: '2026-10-29T00:00:00.000Z',
    })
    assert.equal(reserved.ok, true, JSON.stringify(reserved))
    const taskId = reserved.value.task.taskId
    const catalogBytes = fs.readFileSync(path.join(sandbox.root, 'audio-task-catalog-v1.json'))

    const library = await open(sandbox)
    const imported = expectOutcome(await library.import(importRequest()), 'STORED')
    fs.writeFileSync(packPath(sandbox), '{broken artifact pack')
    expectError(await library.get(readRequest(imported.artifact.artifactRef)), 'STORE_INVALID', '$')
    expectError(await library.get(readRequest(imported.artifact.artifactRef)), 'LIBRARY_UNKNOWN', '$')

    const catalogAfter = await openFixtureTaskCatalog({ sandbox })
    assert.equal(catalogAfter.ok, true, 'the Task catalog factory stays usable after an artifact lock')
    const fetched = await catalogAfter.value.get({
      schemaVersion: 1,
      scopeId: binding.expectation.scopeId,
      taskId,
    })
    assert.equal(fetched.ok, true, JSON.stringify(fetched))
    assert.equal(fetched.value.task.taskId, taskId)
    const secondDraft = JSON.parse(JSON.stringify(draft))
    const reservedAgain = await catalogAfter.value.reserve({
      schemaVersion: 1,
      scopeId: binding.expectation.scopeId,
      idempotencyKey: 'key:fixture-artifact-domain-2',
      draft: secondDraft,
      observedAt: '2026-10-29T00:00:00.000Z',
    })
    assert.equal(reservedAgain.ok, true, 'the Task domain still writes after the artifact domain locked')
    const catalogAfterBytes = fs.readFileSync(path.join(sandbox.root, 'audio-task-catalog-v1.json'))
    assert.notEqual(Buffer.compare(catalogAfterBytes, catalogBytes), 0)
    // The task files exist independently and the artifact pack was never repaired.
    assert.deepEqual(filesIn(sandbox).filter((name) => name.startsWith('audio-')).sort(), [
      'audio-artifacts-v1.json',
      'audio-task-catalog-v1.json',
    ])
    assert.equal(fs.readFileSync(packPath(sandbox), 'utf8'), '{broken artifact pack')
  })
})

/* ============================================= docs example ================================= */

test('L11 the documented example runs as written and reports only safe Fixture facts', async () => {
  const doc = fs.readFileSync(path.join(BASE, 'docs/ARTIFACT_LIBRARY_OFFLINE.md'), 'utf8')
  const heading = '## 6. 可原样执行的示例'
  const at = doc.indexOf(heading)
  assert.notEqual(at, -1, 'the documented executable example section must exist')
  const fence = doc.indexOf('```js', at)
  assert.notEqual(fence, -1)
  const close = doc.indexOf('```', fence + 5)
  const script = doc.slice(fence + 5, close).trim()
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: BASE,
    encoding: 'utf8',
    timeout: 120000,
  })
  assert.equal(run.status, 0, String(run.stderr))
  const summary = JSON.parse(run.stdout.trim().split(/\r?\n/).pop())
  assert.equal(summary.outcome, 'STORED')
  assert.equal(summary.found, 'FOUND')
  assert.equal(summary.bytesMatch, true)
  assert.equal(summary.deleted, 'DELETED')
  assert.equal(summary.afterDelete, 'DELETED')
  assert.equal(summary.mockOnly, true)
  assert.equal(summary.realOperationAllowed, false)
  assert.match(script, /openFixtureArtifactLibrary/)
})
