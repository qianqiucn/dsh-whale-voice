/* Whale Voice 鈥?same-claim save transaction tests (Plan 08-E-C, OFFLINE / FIXTURE_ONLY).
 *
 * The suite drives the real public owner (`save` / `artifactStatus` / legacy `run`/`get`), the real
 * Task writer and the real Artifact pack on a real temporary sandbox. Fault representatives patch
 * the shared `node:fs` default export and act *after* the real call succeeded, so a representative
 * proves an actual commit/attempt rather than a fabricated throw.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from '../core/audio/task-catalog.mjs'
import { openFixtureTaskOwner, TASK_OWNER_ERRORS } from '../core/audio/task-owner.mjs'
import { openFixtureArtifactLibrary } from '../core/audio/artifact-library.mjs'
import {
  ARTIFACT_FILE_NAME,
  getArtifactState,
  readStoredForSave,
} from '../core/audio/fixture-artifact-store-internal.mjs'
import { getStoreState, openOwnerFile } from '../core/audio/fixture-task-store-internal.mjs'

const OWNER_FILE = 'audio-task-owner-v1.json'
const CATALOG_FILE = 'audio-task-catalog-v1.json'
const NOW = '2026-10-27T00:00:00.000Z'
const SAVE_NOW = '2026-10-27T00:00:01.000Z'
const SAVE_EXPIRES = '2026-10-28T00:00:00.000Z'
const REQUEST_KEY = 'save:fixture-demo-1'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function example() {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf('## 7.')
  assert.ok(at >= 0)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function filePath(sandbox, name) {
  return path.join(sandbox.root, name)
}

function readJson(sandbox, name) {
  return JSON.parse(fs.readFileSync(filePath(sandbox, name), 'utf8'))
}

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try {
    return await fn(sandbox)
  } finally {
    removeConfigSandbox(sandbox)
  }
}

async function birth(sandbox, ex, key) {
  const opened = await openFixtureTaskCatalog({ sandbox })
  assert.equal(opened.ok, true)
  const binding = ex.sourceInput.voiceBinding
  const draft = clone(binding.taskDraft)
  delete draft.taskId
  const reserved = await opened.value.reserve({
    schemaVersion: 1,
    scopeId: binding.expectation.scopeId,
    idempotencyKey: key,
    draft,
    observedAt: NOW,
  })
  assert.equal(reserved.ok, true, reserved.ok ? '' : reserved.errors[0].code)
  const snapshot = readJson(sandbox, CATALOG_FILE)
  const entry = snapshot.entries[snapshot.entries.length - 1]
  const input = clone(ex)
  input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
  input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
  return { scopeId: binding.expectation.scopeId, taskId: entry.record.taskId, input, record: entry.record }
}

function saveFrame(b, mutate) {
  const frame = {
    schemaVersion: 1,
    scopeId: b.scopeId,
    taskId: b.taskId,
    requestKey: REQUEST_KEY,
    now: SAVE_NOW,
    expiresAt: SAVE_EXPIRES,
    rights: { state: 'GRANTED', proofRef: 'fixture-rights:demo-1' },
    input: b.input,
  }
  if (mutate) mutate(frame)
  return frame
}

function statusFrame(b, mutate) {
  const frame = {
    schemaVersion: 1,
    scopeId: b.scopeId,
    taskId: b.taskId,
    now: SAVE_NOW,
    rights: { state: 'GRANTED', proofRef: 'fixture-rights:demo-1' },
  }
  if (mutate) mutate(frame)
  return frame
}

function expectError(result, key, errorPath) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal(result.errors[0].code, TASK_OWNER_ERRORS[key])
  if (errorPath !== undefined) assert.equal(result.errors[0].path, errorPath)
}

function eio() {
  const error = new Error('EIO')
  error.code = 'EIO'
  return error
}

/** Valid foreign owner bytes of identical length: one digit inside the first 64-hex field moves. */
function foreignOwnerBytes(sandbox) {
  const text = fs.readFileSync(filePath(sandbox, OWNER_FILE), 'utf8')
  let replaced = null
  const swapped = text.replace(/[0-9a-f]{64}/, (hash) => {
    const last = hash[hash.length - 1]
    const moved = last === '0' ? '1' : '0'
    replaced = hash.slice(0, -1) + moved
    return replaced
  })
  assert.notEqual(swapped, text)
  assert.equal(swapped.length, text.length)
  return Buffer.from(swapped, 'utf8')
}

/** Valid foreign pack bytes of identical length: one second of `createdAt` moves. */
function foreignArtifactBytes(sandbox) {
  const text = fs.readFileSync(filePath(sandbox, ARTIFACT_FILE_NAME), 'utf8')
  const replaced = text.replace(/"createdAt":"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})Z"/, (all, head, ms) => {
    const moved = ms === '000' ? '001' : '000'
    return all.replace('.' + ms + 'Z', '.' + moved + 'Z')
  })
  assert.equal(replaced.length, text.length)
  assert.notEqual(replaced, text)
  return Buffer.from(replaced, 'utf8')
}

function overwrite(sandbox, name, bytes) {
  fs.writeFileSync(filePath(sandbox, name), bytes)
}

/**
 * Patch the shared `node:fs` default export. Every hook runs after the real operation succeeded, so
 * a hook can prove the real attempt/commit and then inject its fault or its foreign bytes.
 */
function installFaults(sandbox, hooks) {
  const originals = {
    openSync: fs.openSync,
    fsyncSync: fs.fsyncSync,
    renameSync: fs.renameSync,
    lstatSync: fs.lstatSync,
  }
  const state = { ownerTemps: new Set(), artifactTemps: new Set(), ownerRenames: 0, artifactRenames: 0, ownerFsyncs: 0, artifactFsyncs: 0, ownerLstats: 0, artifactLstats: 0, hits: 0 }
  const closeSync = fs.closeSync
  fs.openSync = function patchedOpen(target, flags, mode) {
    const fd = originals.openSync(target, flags, mode)
    if (typeof target === 'string') {
      if (target.endsWith('.tmp') && target.includes('audio-task-owner-v1.')) state.ownerTemps.add(fd)
      if (target.endsWith('.tmp') && target.includes('audio-artifacts-v1.')) state.artifactTemps.add(fd)
    }
    return fd
  }
  fs.closeSync = function patchedClose(fd) {
    try {
      return closeSync(fd)
    } finally {
      state.ownerTemps.delete(fd)
      state.artifactTemps.delete(fd)
    }
  }
  fs.fsyncSync = function patchedFsync(fd) {
    originals.fsyncSync(fd)
    if (state.ownerTemps.has(fd)) {
      state.ownerFsyncs += 1
      if (typeof hooks.ownerTempFsync === 'function') hooks.ownerTempFsync(state, sandbox)
    }
    if (state.artifactTemps.has(fd)) {
      state.artifactFsyncs += 1
      if (typeof hooks.artifactTempFsync === 'function') hooks.artifactTempFsync(state, sandbox)
    }
  }
  fs.renameSync = function patchedRename(from, to) {
    originals.renameSync(from, to)
    if (typeof to === 'string' && to.endsWith(OWNER_FILE)) {
      state.ownerRenames += 1
      if (typeof hooks.ownerRename === 'function') hooks.ownerRename(state, sandbox)
    }
    if (typeof to === 'string' && to.endsWith(ARTIFACT_FILE_NAME)) {
      state.artifactRenames += 1
      if (typeof hooks.artifactRename === 'function') hooks.artifactRename(state, sandbox)
    }
  }
  fs.lstatSync = function patchedLstat(target, ...rest) {
    const stat = originals.lstatSync(target, ...rest)
    if (typeof target === 'string' && target.endsWith(OWNER_FILE) && state.ownerRenames > 0) {
      state.ownerLstats += 1
      if (state.ownerRenames === 2) state.afterFinal = (state.afterFinal || 0) + 1
      if (typeof hooks.ownerLstat === 'function') hooks.ownerLstat(state, sandbox)
    }
    if (typeof target === 'string' && target.endsWith(ARTIFACT_FILE_NAME) && state.artifactRenames > 0) {
      state.artifactLstats += 1
      if (typeof hooks.artifactLstat === 'function') hooks.artifactLstat(state, sandbox)
    }
    return stat
  }
  return {
    state,
    restore() {
      fs.openSync = originals.openSync
      fs.fsyncSync = originals.fsyncSync
      fs.renameSync = originals.renameSync
      fs.lstatSync = originals.lstatSync
      fs.closeSync = closeSync
    },
  }
}

async function saveOk(sandbox, ex, key) {
  const b = await birth(sandbox, ex, key || 'key:fixture-save')
  const owner = await openFixtureTaskOwner({ sandbox })
  assert.equal(owner.ok, true)
  const saved = await owner.value.save(saveFrame(b))
  return { b, owner: owner.value, saved }
}

/* ------------------------------------------------------------------ S01 */

test('S01 one complete same-claim save: real bytes, new STORED pack, strict SAVED FINAL, old get', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const { b, owner, saved } = await saveOk(sandbox, ex)
    assert.equal(saved.ok, true, JSON.stringify(saved))
    assert.deepEqual(Object.keys(saved.value), [
      'schemaVersion',
      'outcome',
      'revision',
      'ownerState',
      'reason',
      'task',
      'artifact',
      'userMessageZh',
      'mockOnly',
      'realOperationAllowed',
      'submitAllowed',
      'automaticRetryAllowed',
    ])
    assert.equal(saved.value.outcome, 'SAVED')
    assert.equal(saved.value.ownerState, 'SAVED')
    assert.equal(saved.value.revision, 2)
    assert.equal(saved.value.reason, null)
    assert.equal(saved.value.task.state, 'SAVED')
    assert.deepEqual(Object.keys(saved.value.artifact).sort(), ['artifactRef', 'byteLength', 'expiresAt', 'sha256'])

    const ownerDoc = JSON.parse(fs.readFileSync(filePath(sandbox, OWNER_FILE), 'utf8'))
    assert.equal(ownerDoc.schemaVersion, 2)
    assert.equal(ownerDoc.revision, 2)
    const entry = ownerDoc.entries[0]
    assert.equal(entry.phase, 'FINAL')
    assert.equal(entry.completion.kind, 'SAVED')
    assert.equal(entry.completion.reason, null)
    assert.equal(entry.record.state, 'SAVED')
    assert.equal(entry.record.outputArtifactRef, saved.value.artifact.artifactRef)

    const pack = JSON.parse(fs.readFileSync(filePath(sandbox, ARTIFACT_FILE_NAME), 'utf8'))
    assert.equal(pack.entries.length, 1)
    const stored = pack.entries[0]
    assert.equal(stored.origin, 'FIXTURE_IMPORT')
    assert.equal(stored.artifactRef, saved.value.artifact.artifactRef)
    assert.equal(stored.deletedAt, null)
    assert.equal(stored.rights.state, 'GRANTED')
    assert.equal(stored.inspection.sha256, saved.value.artifact.sha256)
    assert.equal(stored.inspection.byteLength, saved.value.artifact.byteLength)
    // the stored payload really decodes to the saved byte length
    assert.equal(Buffer.from(stored.payload, 'base64').length, stored.inspection.byteLength)

    const got = await owner.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId })
    assert.equal(got.ok, true)
    assert.equal(got.value.outcome, 'FOUND')
    assert.equal(got.value.ownerState, 'SAVED')
    const ran = await owner.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: b.input })
    assert.equal(ran.ok, true)
    assert.equal(ran.value.outcome, 'EXISTING')
    assert.equal(ran.value.ownerState, 'SAVED')

    const before = fs.readFileSync(filePath(sandbox, OWNER_FILE))
    const again = await owner.save(saveFrame(b))
    assert.equal(again.ok, true)
    assert.equal(again.value.outcome, 'EXISTING')
    assert.equal(again.value.ownerState, 'SAVED')
    assert.equal(again.value.artifact, null)
    assert.equal(fs.readFileSync(filePath(sandbox, OWNER_FILE)).equals(before), true)

    const readable = await owner.artifactStatus(statusFrame(b))
    assert.equal(readable.ok, true)
    assert.deepEqual(Object.keys(readable.value), [
      'schemaVersion',
      'state',
      'ownerState',
      'artifactRef',
      'expiresAt',
      'messageZh',
    ])
    assert.equal(readable.value.state, 'READABLE')
    assert.equal(readable.value.ownerState, 'SAVED')
    assert.equal(readable.value.artifactRef, saved.value.artifact.artifactRef)
    assert.equal(readable.value.expiresAt, SAVE_EXPIRES)

    const expired = await owner.artifactStatus(statusFrame(b, (frame) => (frame.now = SAVE_EXPIRES)))
    assert.equal(expired.ok, true)
    assert.equal(expired.value.state, 'EXPIRED')
    assert.equal(expired.value.artifactRef, saved.value.artifact.artifactRef)

    const denied = await owner.artifactStatus(statusFrame(b, (frame) => (frame.rights = { state: 'DENIED', proofRef: null })))
    assert.equal(denied.ok, true)
    assert.equal(denied.value.state, 'RIGHTS_REJECTED')
    assert.equal(denied.value.artifactRef, null)
    assert.equal(denied.value.expiresAt, null)

    const wrongProof = await owner.artifactStatus(
      statusFrame(b, (frame) => (frame.rights = { state: 'GRANTED', proofRef: 'fixture-rights:other' })),
    )
    assert.equal(wrongProof.ok, true)
    assert.equal(wrongProof.value.state, 'RIGHTS_REJECTED')
    assert.equal(wrongProof.value.artifactRef, null)
  })
})

/* ------------------------------------------------------------------ S02 */

test('S02 legal delete and library lock visibility: DELETED status, legacy history unchanged', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const { b, owner, saved } = await saveOk(sandbox, ex)
    assert.equal(saved.ok, true)
    const library = await openFixtureArtifactLibrary({ sandbox })
    assert.equal(library.ok, true)
    const deleted = await library.value.delete({
      schemaVersion: 1,
      scopeId: b.scopeId,
      artifactRef: saved.value.artifact.artifactRef,
      now: SAVE_NOW,
    })
    assert.equal(deleted.ok, true)
    assert.equal(deleted.value.outcome, 'DELETED')
    const status = await owner.artifactStatus(statusFrame(b))
    assert.equal(status.ok, true)
    assert.equal(status.value.state, 'DELETED')
    assert.equal(status.value.artifactRef, saved.value.artifact.artifactRef)
    const got = await owner.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId })
    assert.equal(got.ok, true)
    assert.equal(got.value.ownerState, 'SAVED')
    const again = await owner.save(saveFrame(b))
    assert.equal(again.ok, true)
    assert.equal(again.value.outcome, 'EXISTING')
  })
})

/* ------------------------------------------------------------------ S03 */

test('S03 refusals happen at the documented stage and never create a claim', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s03')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)

    expectError(await owner.value.save(saveFrame(b, (frame) => delete frame.requestKey)), 'SAVE_INPUT_INVALID', '$')
    expectError(await owner.value.save(saveFrame(b, (frame) => (frame.extra = 1))), 'SAVE_INPUT_INVALID', '<unknown-key>')
    expectError(await owner.value.save(saveFrame(b, (frame) => (frame.schemaVersion = 2))), 'UNSUPPORTED_VERSION', 'schemaVersion')
    expectError(await owner.value.save(saveFrame(b, (frame) => (frame.now = 'not-a-time'))), 'SAVE_INPUT_INVALID', 'now')
    expectError(
      await owner.value.save(saveFrame(b, (frame) => (frame.rights = { state: 'MAYBE', proofRef: null }))),
      'SAVE_INPUT_INVALID',
      'rights',
    )
    expectError(
      await owner.value.save(saveFrame(b, (frame) => (frame.input = { ...frame.input, schemaVersion: 2 }))),
      'UNSUPPORTED_VERSION',
      'input',
    )
    expectError(
      await owner.value.save(saveFrame(b, (frame) => (frame.rights = { state: 'DENIED', proofRef: null }))),
      'SAVE_RIGHTS_REJECTED',
      'rights',
    )
    expectError(
      await owner.value.save(saveFrame(b, (frame) => (frame.expiresAt = frame.now))),
      'SAVE_EXPIRED_REQUEST',
      'expiresAt',
    )
    expectError(
      await owner.value.save(
        saveFrame(b, (frame) => {
          frame.input.sourceInput.voiceBinding.taskDraft.voiceProfileId = 'voice:someone-else'
        }),
      ),
      'SAVE_PRECONDITION',
      '$',
    )
    // F02: a format-valid rights-state conflict is refused before any claim is written.
    expectError(
      await owner.value.save(
        saveFrame(b, (frame) => {
          frame.input.sourceInput.voiceBinding.taskDraft.rights = { state: 'DENIED' }
        }),
      ),
      'SAVE_PRECONDITION',
      '$',
    )
    assert.equal(fs.existsSync(filePath(sandbox, OWNER_FILE)), false)

    const status = await owner.value.artifactStatus(statusFrame(b))
    assert.equal(status.ok, true)
    assert.equal(status.value.state, 'MISSING')
    assert.equal(status.value.ownerState, null)
  })
})

/* ------------------------------------------------------------------ S04 */

test('S04 an existing CLAIMED is never taken over: save is SAVE_UNKNOWN, status is UNKNOWN', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s04')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)
    const file = openOwnerFile(getStoreState(sandbox))
    const current = file.read()
    const claimBytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        revision: current.revision + 1,
        entries: [
          ...current.snapshot.entries,
          {
            scopeId: b.scopeId,
            taskId: b.taskId,
            birthIdentityHash: otherBirthHash(sandbox, b.taskId),
            phase: 'CLAIMED',
            record: b.record,
            completion: null,
          },
        ],
      }),
      'utf8',
    )
    file.write(claimBytes, current.digest, current.revision + 1)

    const save = await owner.value.save(saveFrame(b))
    expectError(save, 'SAVE_UNKNOWN', '$')
    const status = await owner.value.artifactStatus(statusFrame(b))
    assert.equal(status.ok, true)
    assert.equal(status.value.state, 'UNKNOWN')
    assert.equal(status.value.ownerState, 'UNKNOWN')
    assert.equal(status.value.artifactRef, null)
    assert.equal(status.value.expiresAt, null)
  })
})

function otherBirthHash(sandbox, taskId) {
  const catalog = readJson(sandbox, CATALOG_FILE)
  const entry = catalog.entries.find((item) => item.record.taskId === taskId)
  return entry.identityHash
}

/* ------------------------------------------------------------------ S05 */

test('S05 a blocked task keeps the old FINAL path and never imports an artifact', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s05')
    const owner = await openFixtureTaskOwner({ sandbox })
    const blocked = clone(b.input)
    blocked.context = { ...blocked.context, scenario: 'BLOCKED' }
    const saved = await owner.value.save(saveFrame(b, (frame) => (frame.input = blocked)))
    if (saved.ok === true) {
      assert.equal(saved.value.artifact, null)
      assert.notEqual(saved.value.ownerState, 'SAVED')
      assert.equal(fs.existsSync(filePath(sandbox, ARTIFACT_FILE_NAME)), false)
    } else {
      // A scenario that the engine refuses outright is a fixed SAVE_UNKNOWN, never a fake save.
      assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_UNKNOWN)
      assert.equal(fs.existsSync(filePath(sandbox, ARTIFACT_FILE_NAME)), false)
    }
  })
})

/* ------------------------------------------------------------------ S06 */

test('S06 the helper reports STORED/DELETED/EXPIRED/MISSING from fresh canonical entries', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const { b, saved } = await saveOk(sandbox, ex)
    assert.equal(saved.ok, true, JSON.stringify(saved))
    const state = getArtifactState(sandbox)
    const ref = saved.value.artifact.artifactRef
    const stored = readStoredForSave(state, { scopeId: b.scopeId, artifactRef: ref, now: SAVE_NOW })
    assert.equal(stored.ok, true)
    assert.equal(stored.value.state, 'STORED')
    assert.deepEqual(Object.keys(stored.value.artifact), [
      'artifactRef',
      'identityHash',
      'byteSha256',
      'byteLength',
      'expiresAt',
      'requestKey',
      'rights',
      'inspection',
    ])
    assert.equal(stored.value.artifact.byteSha256, saved.value.artifact.sha256)
    assert.equal(stored.value.artifact.requestKey, REQUEST_KEY)
    assert.equal(Object.keys(stored.value.artifact.inspection).length, 19)

    const missing = readStoredForSave(state, {
      scopeId: b.scopeId,
      artifactRef: 'artifact:fixture-bytes-' + '0'.repeat(32),
      now: SAVE_NOW,
    })
    assert.equal(missing.ok, true)
    assert.equal(missing.value.state, 'MISSING')
    assert.equal(missing.value.artifact, null)

    const expired = readStoredForSave(state, { scopeId: b.scopeId, artifactRef: ref, now: SAVE_EXPIRES })
    assert.equal(expired.value.state, 'EXPIRED')

    const library = await openFixtureArtifactLibrary({ sandbox })
    await library.value.delete({ schemaVersion: 1, scopeId: b.scopeId, artifactRef: ref, now: SAVE_NOW })
    const deleted = readStoredForSave(state, { scopeId: b.scopeId, artifactRef: ref, now: SAVE_EXPIRES })
    assert.equal(deleted.ok, true)
    assert.equal(deleted.value.state, 'DELETED')
    assert.equal(deleted.value.artifact.inspection.sha256, saved.value.artifact.sha256)
  })
})

/* ------------------------------------------------------------------ S07 */

test('S07 the exclusive writer rejects a SAVED candidate without a valid proof and keeps the claim', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s07')
    const state = openOwnerFile(getStoreState(sandbox))
    const claim = {
      schemaVersion: 1,
      revision: 1,
      entries: [
        {
          scopeId: b.scopeId,
          taskId: b.taskId,
          birthIdentityHash: otherBirthHash(sandbox, b.taskId),
          phase: 'CLAIMED',
          record: b.record,
          completion: null,
        },
      ],
    }
    const claimBytes = Buffer.from(JSON.stringify(claim), 'utf8')
    state.write(claimBytes, null, 1)
    const claimDigest = sha256(claimBytes)
    const savedRecord = { ...clone(b.record), state: 'SAVED', outputArtifactRef: 'artifact:fixture-bytes-' + 'a'.repeat(32) }
    const candidate = {
      schemaVersion: 2,
      revision: 2,
      entries: [
        {
          scopeId: b.scopeId,
          taskId: b.taskId,
          birthIdentityHash: otherBirthHash(sandbox, b.taskId),
          phase: 'FINAL',
          record: savedRecord,
          completion: { kind: 'SAVED', reason: null },
        },
      ],
    }
    const candidateBytes = Buffer.from(JSON.stringify(candidate), 'utf8')
    let rejected = null
    try {
      state.write(candidateBytes, claimDigest, 2)
    } catch (error) {
      rejected = error
    }
    assert.ok(rejected)
    assert.equal(rejected.key, 'WRITE_REJECTED')
    const after = JSON.parse(fs.readFileSync(filePath(sandbox, OWNER_FILE), 'utf8'))
    assert.equal(after.revision, 1)
    assert.equal(after.schemaVersion, 1)
    assert.equal(after.entries[0].phase, 'CLAIMED')
  })
})

/* ------------------------------------------------------------------ S08 */

test('S08 a lock after the real claim rename is SAVE_UNKNOWN and keeps the CLAIMED tombstone', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s08')
    const owner = await openFixtureTaskOwner({ sandbox })
    const faults = installFaults(sandbox, {
      ownerRename(state) {
        if (state.ownerRenames === 1) throw eio()
      },
    })
    try {
      const saved = await owner.value.save(saveFrame(b))
      expectError(saved, 'SAVE_UNKNOWN', '$')
    } finally {
      faults.restore()
    }
    assert.equal(faults.state.ownerRenames, 1)
    const st = await owner.value.artifactStatus(statusFrame(b))
    expectError(st, 'OWNER_UNKNOWN', '$')
  })
})

/* ------------------------------------------------------------------ S09 */

test('S09 an unknown artifact rename is SAVE_ARTIFACT_UNKNOWN and locks only the artifact domain', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s09')
    const owner = await openFixtureTaskOwner({ sandbox })
    const faults = installFaults(sandbox, {
      artifactRename(state) {
        if (state.artifactRenames === 1) throw eio()
      },
    })
    try {
      const saved = await owner.value.save(saveFrame(b))
      expectError(saved, 'SAVE_ARTIFACT_UNKNOWN', '$')
    } finally {
      faults.restore()
    }
    assert.equal(faults.state.artifactRenames, 1)
    assert.equal(fs.existsSync(filePath(sandbox, ARTIFACT_FILE_NAME)), true)
    // Task is still CLAIMED with no Task lock: status reports the frozen UNKNOWN row.
    const status = await owner.value.artifactStatus(statusFrame(b))
    assert.equal(status.ok, true)
    assert.equal(status.value.state, 'UNKNOWN')
    // The library really is locked for this capability.
    const library = await openFixtureArtifactLibrary({ sandbox })
    expectLibraryError(library, 'LIBRARY_UNKNOWN')
  })
})

/* ------------------------------------------------------------------ S10 */

test('S10 an unknown FINAL rename keeps the real FINAL bytes and reports SAVE_UNKNOWN with a Task lock', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s10')
    const owner = await openFixtureTaskOwner({ sandbox })
    const faults = installFaults(sandbox, {
      ownerRename(state) {
        if (state.ownerRenames === 2) throw eio()
      },
    })
    try {
      expectError(await owner.value.save(saveFrame(b)), 'SAVE_UNKNOWN', '$')
    } finally {
      faults.restore()
    }
    assert.equal(faults.state.ownerRenames, 2)
    const doc = readJson(sandbox, OWNER_FILE)
    assert.equal(doc.schemaVersion, 2)
    assert.equal(doc.revision, 2)
    assert.equal(doc.entries[0].completion.kind, 'SAVED')
    // The shared Task capability is locked after the unknown outcome.
    expectError(await owner.value.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }), 'OWNER_UNKNOWN', '$')
  })
})

/* ------------------------------------------------------------------ S11 */

test('S11 a post-rename confirmation failure is WRITE_UNKNOWN -> SAVE_UNKNOWN with the FINAL bytes kept', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s11')
    const owner = await openFixtureTaskOwner({ sandbox })
    const faults = installFaults(sandbox, {
      ownerLstat(state) {
        if (state.ownerRenames === 2 && state.afterFinal === 1) throw eio()
      },
    })
    try {
      expectError(await owner.value.save(saveFrame(b)), 'SAVE_UNKNOWN', '$')
    } finally {
      faults.restore()
    }
    const doc = readJson(sandbox, OWNER_FILE)
    assert.equal(doc.revision, 2)
    assert.equal(doc.entries[0].completion.kind, 'SAVED')
    expectError(await owner.value.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }), 'OWNER_UNKNOWN', '$')
  })
})

/* ------------------------------------------------------------------ S12 */

test('S12 a foreign Task write between the FINAL fsync and the rename is STORE_CHANGED with a Task lock', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s12')
    const owner = await openFixtureTaskOwner({ sandbox })
    const faults = installFaults(sandbox, {
      ownerTempFsync(state, sb) {
        if (state.ownerFsyncs === 2) overwrite(sb, OWNER_FILE, foreignOwnerBytes(sb))
      },
    })
    try {
      expectError(await owner.value.save(saveFrame(b)), 'STORE_CHANGED', '$')
    } finally {
      faults.restore()
    }
    assert.equal(faults.state.ownerRenames, 1)
    expectError(await owner.value.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }), 'OWNER_UNKNOWN', '$')
  })
})

/* ------------------------------------------------------------------ S13 */

test('S13 a foreign Artifact pack write between the FINAL fsync and the rename is SAVE_ARTIFACT_REJECTED', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s13')
    const owner = await openFixtureTaskOwner({ sandbox })
    const faults = installFaults(sandbox, {
      ownerTempFsync(state, sb) {
        if (state.ownerFsyncs === 2) {  overwrite(sb, ARTIFACT_FILE_NAME, foreignArtifactBytes(sb)) }
      },
    })
    try {
      expectError(await owner.value.save(saveFrame(b)), 'SAVE_ARTIFACT_REJECTED', '$')
    } finally {
      faults.restore()
    }
    // Task stayed CLAIMED, the artifact domain is locked and the new asset is not rolled back.
    assert.equal(faults.state.ownerFsyncs, 2)
    assert.equal(faults.state.ownerRenames, 1)
    const doc = readJson(sandbox, OWNER_FILE)
    assert.equal(doc.entries[0].phase, 'CLAIMED')
    const library = await openFixtureArtifactLibrary({ sandbox })
    expectLibraryError(library, 'LIBRARY_UNKNOWN')
  })
})

/* ------------------------------------------------------------------ S14 */

test('S14 an external Task change after a successful save only affects the next fresh read', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const { b, owner, saved } = await saveOk(sandbox, ex, 'key:fixture-s14')
    assert.equal(saved.ok, true)
    overwrite(sandbox, OWNER_FILE, foreignOwnerBytes(sandbox))
    expectError(await owner.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }), 'STORE_CHANGED', '$')
    expectError(await owner.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }), 'OWNER_UNKNOWN', '$')
  })
})

/* ------------------------------------------------------------------ S15 */

test('S15 an external Artifact change after a successful save only affects the next fresh status', async () => {
  const ex = example()
  await withSandbox(async (sandbox) => {
    const { b, owner, saved } = await saveOk(sandbox, ex, 'key:fixture-s15')
    assert.equal(saved.ok, true)
    overwrite(sandbox, ARTIFACT_FILE_NAME, foreignArtifactBytes(sandbox))
    expectError(await owner.artifactStatus(statusFrame(b)), 'STORE_CHANGED', '$')
    expectError(await owner.artifactStatus(statusFrame(b)), 'SAVE_ARTIFACT_UNKNOWN', '$')
    // Legacy history is untouched by the artifact fault.
    const got = await owner.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId })
    assert.equal(got.ok, true)
    assert.equal(got.value.ownerState, 'SAVED')
  })
})

function expectLibraryError(result, key) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal(result.errors[0].code, 'ARTIFACT_LIBRARY_' + key)
}

/* ------------------------------------------------------------------ S16 */

function saveDocExamples() {
  const doc = fs.readFileSync('docs/TASK_OWNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf('### 15.1')
  assert.ok(at >= 0, '### 15.1')
  const blocks = []
  let cursor = at
  for (let index = 0; index < 4; index += 1) {
    const fence = doc.indexOf('```json', cursor)
    assert.ok(fence >= 0)
    const close = doc.indexOf('```', fence + 7)
    blocks.push(JSON.parse(doc.slice(fence + 7, close).trim()))
    cursor = close + 3
  }
  return blocks
}

test('S16 the documented save example runs as written against a real sandbox', async () => {
  const ex = example()
  const [request, expectedSave, statusRequest, expectedStatus] = saveDocExamples()
  assert.equal(Object.keys(request).length, 8)
  assert.equal(Object.keys(expectedSave).length, 12)
  assert.equal(Object.keys(statusRequest).length, 5)
  assert.equal(Object.keys(expectedStatus).length, 6)
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, ex, 'key:fixture-s16')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)
    // Only the runtime facts are bound to the real issued task: the documented request shape,
    // its fixed safety values and the original run input are used as written.
    const frame = clone(request)
    frame.taskId = b.taskId
    frame.scopeId = b.scopeId
    frame.input = b.input
    const saved = await owner.value.save(frame)
    assert.equal(saved.ok, true, JSON.stringify(saved))
    assert.deepEqual(Object.keys(saved.value), Object.keys(expectedSave))
    assert.equal(saved.value.outcome, expectedSave.outcome)
    assert.equal(saved.value.ownerState, expectedSave.ownerState)
    assert.equal(saved.value.reason, expectedSave.reason)
    assert.equal(saved.value.userMessageZh, expectedSave.userMessageZh)
    assert.deepEqual(Object.keys(saved.value.task), Object.keys(expectedSave.task))
    assert.equal(saved.value.task.userMessageZh, expectedSave.task.userMessageZh)
    assert.deepEqual(Object.keys(saved.value.artifact), Object.keys(expectedSave.artifact))
    assert.equal(saved.value.mockOnly, expectedSave.mockOnly)
    assert.equal(saved.value.realOperationAllowed, expectedSave.realOperationAllowed)
    assert.equal(saved.value.submitAllowed, expectedSave.submitAllowed)
    assert.equal(saved.value.automaticRetryAllowed, expectedSave.automaticRetryAllowed)

    const statusFrame = clone(statusRequest)
    statusFrame.taskId = b.taskId
    statusFrame.scopeId = b.scopeId
    const status = await owner.value.artifactStatus(statusFrame)
    assert.equal(status.ok, true)
    assert.deepEqual(Object.keys(status.value), Object.keys(expectedStatus))
    assert.equal(status.value.state, expectedStatus.state)
    assert.equal(status.value.messageZh, expectedStatus.messageZh)
    assert.equal(status.value.artifactRef, saved.value.artifact.artifactRef)
    assert.equal(status.value.expiresAt, saved.value.artifact.expiresAt)

    const got = await owner.value.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId })
    assert.equal(got.ok, true)
    assert.equal(got.value.outcome, 'FOUND')
    assert.equal(got.value.ownerState, 'SAVED')
  })
})