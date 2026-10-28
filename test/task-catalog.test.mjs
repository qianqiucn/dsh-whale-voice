import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import {
  TASK_CATALOG_ERRORS,
  TASK_CATALOG_SCHEMA_VERSION,
  openFixtureTaskCatalog,
} from '../core/audio/task-catalog.mjs'
import { createAudioTaskRecord, transitionAudioTask } from '../core/audio/task-contract.mjs'

const ERR = TASK_CATALOG_ERRORS
const SCOPE = 'scope:fixture-catalog'
const OTHER_SCOPE = 'scope:fixture-other'
const KEY = 'key:fixture-1'
const NOW = '2026-10-27T00:00:00.000Z'
const CATALOG_FILE = 'audio-task-catalog-v1.json'
const OWNER_ID = /^task:fixture-[0-9a-f]{32}$/

function ttsDraft(overrides = {}) {
  return {
    schemaVersion: 1,
    feature: 'voice-bubbles',
    taskType: 'TTS',
    source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-1' },
    voiceProfileId: 'voice:demo-hero',
    deliveryRequested: false,
    rights: { state: 'CONFIRMED_FIXTURE' },
    ...overrides,
  }
}

function svcDraft(overrides = {}) {
  return {
    schemaVersion: 1,
    feature: 'singing',
    taskType: 'SVC',
    source: { kind: 'AUDIO_REF', ref: 'artifact:fixture-source-1' },
    voiceProfileId: 'voice:demo-hero',
    deliveryRequested: false,
    rights: { state: 'UNVERIFIED' },
    ...overrides,
  }
}

function reserveInput(overrides = {}) {
  return {
    schemaVersion: 1,
    scopeId: SCOPE,
    idempotencyKey: KEY,
    draft: ttsDraft(),
    observedAt: NOW,
    ...overrides,
  }
}

function getInput(overrides = {}) {
  return { schemaVersion: 1, scopeId: SCOPE, taskId: 'task:fixture-00000000000000000000000000000000', ...overrides }
}

function catalogPath(sandbox) {
  return path.join(sandbox.root, CATALOG_FILE)
}

function readSnapshot(sandbox) {
  return JSON.parse(fs.readFileSync(catalogPath(sandbox), 'utf8'))
}

function writeSnapshot(sandbox, snapshot) {
  fs.writeFileSync(catalogPath(sandbox), JSON.stringify(snapshot), 'utf8')
}

function identityHashOf(record) {
  const identity = {
    schemaVersion: record.schemaVersion,
    feature: record.feature,
    taskType: record.taskType,
    source: { kind: record.source.kind, ref: record.source.ref },
    voiceProfileId: record.voiceProfileId,
    deliveryRequested: record.deliveryRequested,
    rights: { state: record.rights.state },
  }
  return crypto.createHash('sha256').update(JSON.stringify(identity), 'utf8').digest('hex')
}

function makeRecord(draft, taskId, observedAt = NOW) {
  const created = createAudioTaskRecord({ ...draft, taskId }, { observedAt })
  assert.equal(created.ok, true)
  return created.value
}

function makeEntry(record, scopeId = SCOPE, key = KEY) {
  return { scopeId, idempotencyKey: key, identityHash: identityHashOf(record), record }
}

function snapshotOf(entries) {
  return { schemaVersion: 1, revision: entries.length, entries }
}

function expectError(result, key, errorPath) {
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].code, ERR[key], 'error code')
  assert.equal(result.errors[0].path, errorPath)
  return result
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  assert.equal(Object.isFrozen(value), true)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    assert.ok(descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value'))
    assertDeepFrozen(descriptor.value, seen)
  }
}

async function withSandbox(run) {
  const sandbox = createConfigSandbox()
  try {
    return await run(sandbox)
  } finally {
    try {
      removeConfigSandbox(sandbox)
    } catch {
      // the test may have removed or replaced the sandbox root intentionally
    }
  }
}

async function withCatalog(run) {
  return withSandbox(async (sandbox) => {
    const opened = await openFixtureTaskCatalog({ sandbox })
    assert.equal(opened.ok, true, JSON.stringify(opened.errors))
    return run(sandbox, opened.value)
  })
}

function restoreFunctions(pairs) {
  for (const [target, key, original] of pairs) target[key] = original
}

// ---------------------------------------------------------------------------------------------
// D01–D06: creation, idempotency, concurrency and reopening.
// ---------------------------------------------------------------------------------------------

test('D01 an empty catalog creates one real initial record and get returns its projection', async () => {
  await withCatalog(async (sandbox, handle) => {
    assert.equal(fs.existsSync(catalogPath(sandbox)), false)
    expectError(await handle.get(getInput()), 'NOT_FOUND', '$')
    assert.equal(fs.existsSync(catalogPath(sandbox)), false)

    const created = await handle.reserve(reserveInput())
    assert.equal(created.ok, true, JSON.stringify(created.errors))
    assert.deepEqual(Object.keys(created.value), [
      'schemaVersion', 'outcome', 'revision', 'task',
      'mockOnly', 'realOperationAllowed', 'submitAllowed', 'automaticRetryAllowed',
    ])
    assert.equal(created.value.outcome, 'CREATED')
    assert.equal(created.value.revision, 1)
    assert.match(created.value.task.taskId, OWNER_ID)
    assert.equal(created.value.task.state, 'CREATED')
    assert.equal(created.value.task.deliveryRequested, false)

    const snapshot = readSnapshot(sandbox)
    assert.equal(snapshot.schemaVersion, 1)
    assert.equal(snapshot.revision, 1)
    assert.equal(snapshot.entries.length, 1)
    assert.equal(snapshot.entries[0].identityHash, identityHashOf(snapshot.entries[0].record))
    assert.equal(Object.keys(snapshot.entries[0].record).length, 16)
    assert.equal(snapshot.entries[0].record.taskId, created.value.task.taskId)

    const found = await handle.get(getInput({ taskId: created.value.task.taskId }))
    assert.equal(found.ok, true)
    assert.equal(found.value.outcome, 'FOUND')
    assert.deepEqual(found.value.task, created.value.task)
    assertDeepFrozen(found)
  })
})

test('D02 SVC with unconfirmed rights is stored as BLOCKED_RIGHTS without execution', async () => {
  await withCatalog(async (sandbox, handle) => {
    const created = await handle.reserve(reserveInput({ draft: svcDraft(), idempotencyKey: 'key:fixture-svc' }))
    assert.equal(created.ok, true, JSON.stringify(created.errors))
    assert.equal(created.value.task.state, 'BLOCKED_RIGHTS')
    assert.equal(created.value.task.deliveryRequested, false)
    const snapshot = readSnapshot(sandbox)
    assert.equal(snapshot.entries[0].record.state, 'BLOCKED_RIGHTS')
    assert.equal(snapshot.entries[0].record.outputArtifactRef, null)
    assert.equal(snapshot.entries[0].record.delivery.state, 'NOT_REQUESTED')
    const found = await handle.get(getInput({ taskId: created.value.task.taskId }))
    assert.equal(found.value.task.state, 'BLOCKED_RIGHTS')
  })
})

test('D03 equal retries return EXISTING with the same id and unchanged bytes', async () => {
  await withCatalog(async (sandbox, handle) => {
    const first = await handle.reserve(reserveInput())
    assert.equal(first.ok, true)
    const bytes = fs.readFileSync(catalogPath(sandbox))
    const originalObservedAt = readSnapshot(sandbox).entries[0].record.observedAt

    const reordered = {
      observedAt: NOW,
      idempotencyKey: KEY,
      scopeId: SCOPE,
      draft: {
        rights: { state: 'CONFIRMED_FIXTURE' },
        voiceProfileId: 'voice:demo-hero',
        source: { ref: 'artifact:fixture-text-1', kind: 'TEXT_REF' },
        taskType: 'TTS',
        feature: 'voice-bubbles',
        schemaVersion: 1,
      },
      schemaVersion: 1,
    }
    const retry = await handle.reserve(reordered)
    assert.equal(retry.ok, true)
    assert.equal(retry.value.outcome, 'EXISTING')
    assert.equal(retry.value.task.taskId, first.value.task.taskId)
    assert.equal(retry.value.revision, 1)
    assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(bytes))
    assert.equal(readSnapshot(sandbox).entries[0].record.observedAt, originalObservedAt)

    const later = await handle.reserve(reserveInput({ observedAt: '2026-10-28T00:00:00.000Z' }))
    assert.equal(later.value.outcome, 'EXISTING')
    assert.equal(readSnapshot(sandbox).entries[0].record.observedAt, originalObservedAt)
  })
})

test('D04 content conflicts, distinct keys, scope isolation and cross-scope get', async () => {
  await withCatalog(async (sandbox, handle) => {
    const first = await handle.reserve(reserveInput())
    assert.equal(first.value.outcome, 'CREATED')
    const bytes = fs.readFileSync(catalogPath(sandbox))

    const conflict = await handle.reserve(
      reserveInput({ draft: ttsDraft({ source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-2' } }) }),
    )
    expectError(conflict, 'IDEMPOTENCY_CONFLICT', '$')
    assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(bytes))

    const otherKey = await handle.reserve(reserveInput({ idempotencyKey: 'key:fixture-2' }))
    assert.equal(otherKey.value.outcome, 'CREATED')
    assert.notEqual(otherKey.value.task.taskId, first.value.task.taskId)
    assert.equal(otherKey.value.revision, 2)

    const otherScope = await handle.reserve(reserveInput({ scopeId: OTHER_SCOPE }))
    assert.equal(otherScope.value.outcome, 'CREATED')
    assert.notEqual(otherScope.value.task.taskId, first.value.task.taskId)
    assert.equal(otherScope.value.revision, 3)

    expectError(await handle.get(getInput({ scopeId: OTHER_SCOPE, taskId: first.value.task.taskId })), 'NOT_FOUND', '$')
    const found = await handle.get(getInput({ taskId: first.value.task.taskId }))
    assert.equal(found.value.outcome, 'FOUND')
  })
})

test('D05 one shared queue keeps concurrent same-key and different-key requests correct', async () => {
  await withCatalog(async (sandbox, handleA) => {
    const opened = await openFixtureTaskCatalog({ sandbox })
    assert.equal(opened.ok, true)
    const handleB = opened.value

    const [a, b] = await Promise.all([handleA.reserve(reserveInput()), handleB.reserve(reserveInput())])
    assert.equal(a.ok, true)
    assert.equal(b.ok, true)
    assert.deepEqual([a.value.outcome, b.value.outcome].sort(), ['CREATED', 'EXISTING'])
    assert.equal(a.value.task.taskId, b.value.task.taskId)
    assert.equal(readSnapshot(sandbox).entries.length, 1)

    const keys = ['key:fixture-a', 'key:fixture-b', 'key:fixture-c', 'key:fixture-d']
    const results = await Promise.all(keys.map((key) => handleA.reserve(reserveInput({ idempotencyKey: key }))))
    for (const result of results) assert.equal(result.ok, true)
    assert.equal(results.filter((item) => item.value.outcome === 'CREATED').length, 4)
    const snapshot = readSnapshot(sandbox)
    assert.equal(snapshot.entries.length, 5)
    assert.equal(snapshot.revision, 5)
    assert.equal(new Set(snapshot.entries.map((entry) => entry.record.taskId)).size, 5)
  })
})

test('D06 reopening with the original cap reads disk; a JSON clone or new process is rejected', async () => {
  await withSandbox(async (sandbox) => {
    const first = await openFixtureTaskCatalog({ sandbox })
    const created = await first.value.reserve(reserveInput())
    assert.equal(created.ok, true)

    const reopened = await openFixtureTaskCatalog({ sandbox })
    assert.equal(reopened.ok, true)
    const retry = await reopened.value.reserve(reserveInput())
    assert.equal(retry.value.outcome, 'EXISTING')
    assert.equal(retry.value.task.taskId, created.value.task.taskId)

    const cloned = JSON.parse(JSON.stringify(sandbox))
    expectError(await openFixtureTaskCatalog({ sandbox: cloned }), 'SANDBOX_INVALID', '$')

    const moduleUrl = pathToFileURL(path.resolve('core/audio/task-catalog.mjs')).href
    const script = [
      `import { openFixtureTaskCatalog } from ${JSON.stringify(moduleUrl)}`,
      'const cap = JSON.parse(process.env.SANDBOX_JSON)',
      'const r = await openFixtureTaskCatalog({ sandbox: cap })',
      'process.stdout.write(JSON.stringify({ ok: r.ok, code: r.ok ? null : r.errors[0].code }))',
    ].join('\n')
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, SANDBOX_JSON: JSON.stringify(sandbox) },
    })
    assert.deepEqual(JSON.parse(output), { ok: false, code: ERR.SANDBOX_INVALID })
  })
})

// ---------------------------------------------------------------------------------------------
// D07–D11: stored schema, boundaries, collision and tampering.
// ---------------------------------------------------------------------------------------------

test('D07 stored records reject foreign/placeholder ids, advanced states, duplicates and bad hashes', async () => {
  const variants = [
    () => {
      const record = makeRecord(ttsDraft(), 'task:foreign')
      return snapshotOf([makeEntry(record)])
    },
    () => {
      const record = makeRecord(ttsDraft(), 'task:fixture-catalog-validation')
      return snapshotOf([makeEntry(record)])
    },
    () => {
      const record = makeRecord(ttsDraft(), 'task:fixture-' + 'a'.repeat(32))
      const advanced = transitionAudioTask(record, { type: 'BEGIN_PROCESS' })
      assert.equal(advanced.ok, true)
      return snapshotOf([makeEntry(advanced.value)])
    },
    () => {
      const recordA = makeRecord(ttsDraft(), 'task:fixture-' + 'b'.repeat(32))
      const recordB = makeRecord(ttsDraft(), 'task:fixture-' + 'c'.repeat(32))
      return snapshotOf([makeEntry(recordA), makeEntry(recordB)])
    },
    () => {
      const recordA = makeRecord(ttsDraft(), 'task:fixture-' + 'd'.repeat(32))
      return snapshotOf([
        makeEntry(recordA, SCOPE, KEY),
        makeEntry(recordA, OTHER_SCOPE, 'key:fixture-2'),
      ])
    },
    () => {
      const record = makeRecord(ttsDraft(), 'task:fixture-' + 'e'.repeat(32))
      const entry = makeEntry(record)
      entry.identityHash = 'f'.repeat(64)
      return snapshotOf([entry])
    },
    () => {
      const record = makeRecord(ttsDraft(), 'task:fixture-' + 'f'.repeat(32))
      const entry = makeEntry(record)
      entry.extra = true
      return snapshotOf([entry])
    },
    () => {
      const record = makeRecord(ttsDraft(), 'task:fixture-' + '1'.repeat(32))
      const snapshot = snapshotOf([makeEntry(record)])
      snapshot.schemaVersion = 2
      return snapshot
    },
  ]

  for (const makeSnapshot of variants) {
    await withSandbox(async (sandbox) => {
      writeSnapshot(sandbox, makeSnapshot())
      const opened = await openFixtureTaskCatalog({ sandbox })
      expectError(opened, 'STORE_INVALID', '$')
    })
  }
})

test('D08 the 32-entry, 128KiB and encoding boundaries are enforced', async () => {
  await withCatalog(async (sandbox, handle) => {
    for (let index = 0; index < 32; index += 1) {
      const result = await handle.reserve(reserveInput({ idempotencyKey: 'key:fixture-' + index }))
      assert.equal(result.ok, true, String(index))
    }
    const snapshot = readSnapshot(sandbox)
    assert.equal(snapshot.entries.length, 32)
    const bytes = fs.readFileSync(catalogPath(sandbox))
    const overflow = await handle.reserve(reserveInput({ idempotencyKey: 'key:fixture-overflow' }))
    expectError(overflow, 'RESOURCE_LIMIT', '$')
    assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(bytes))
  })

  await withSandbox(async (sandbox) => {
    fs.writeFileSync(catalogPath(sandbox), Buffer.alloc(128 * 1024 + 1, 0x20))
    expectError(await openFixtureTaskCatalog({ sandbox }), 'RESOURCE_LIMIT', '$')
  })

  for (const content of [Buffer.alloc(0), Buffer.from([0xff, 0xfe]), Buffer.from('{not json', 'utf8')]) {
    await withSandbox(async (sandbox) => {
      fs.writeFileSync(catalogPath(sandbox), content)
      expectError(await openFixtureTaskCatalog({ sandbox }), 'STORE_INVALID', '$')
    })
  }
})

test('D09 an injected random id collision never overwrites and different scopes share the check', async () => {
  await withSandbox(async (sandbox) => {
    const realRandomBytes = crypto.randomBytes
    const fixed = Buffer.alloc(16, 7)
    try {
      crypto.randomBytes = () => fixed
      const opened = await openFixtureTaskCatalog({ sandbox })
      const first = await opened.value.reserve(reserveInput())
      assert.equal(first.ok, true)
      assert.equal(first.value.outcome, 'CREATED')
      const bytes = fs.readFileSync(catalogPath(sandbox))

      const collision = await opened.value.reserve(reserveInput({ idempotencyKey: 'key:fixture-collision' }))
      expectError(collision, 'ID_COLLISION', '$')
      assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(bytes))
      assert.equal(readSnapshot(sandbox).entries.length, 1)

      const crossScope = await opened.value.reserve(
        reserveInput({ scopeId: OTHER_SCOPE, idempotencyKey: 'key:fixture-cross-scope' }),
      )
      expectError(crossScope, 'ID_COLLISION', '$')
      assert.equal(readSnapshot(sandbox).entries.length, 1)
    } finally {
      crypto.randomBytes = realRandomBytes
    }
  })
})

test('D10 sandbox root, marker and linked/directory targets are rejected', async () => {
  await withSandbox(async (sandbox) => {
    const opened = await openFixtureTaskCatalog({ sandbox })
    assert.equal(opened.ok, true)
    fs.rmSync(sandbox.root, { recursive: true, force: true })
    expectError(await opened.value.reserve(reserveInput()), 'SANDBOX_INVALID', '$')
  })

  await withSandbox(async (sandbox) => {
    fs.unlinkSync(sandbox.marker)
    expectError(await openFixtureTaskCatalog({ sandbox }), 'SANDBOX_INVALID', '$')
  })

  await withSandbox(async (sandbox) => {
    fs.writeFileSync(sandbox.marker, JSON.stringify({ kind: 'whale-voice-isolated-sandbox', id: 'other' }))
    expectError(await openFixtureTaskCatalog({ sandbox }), 'SANDBOX_INVALID', '$')
  })

  await withSandbox(async (sandbox) => {
    fs.mkdirSync(catalogPath(sandbox))
    expectError(await openFixtureTaskCatalog({ sandbox }), 'STORE_INVALID', '$')
  })

  await withSandbox(async (sandbox) => {
    const decoy = path.join(sandbox.root, 'decoy.json')
    fs.writeFileSync(decoy, '{}')
    try {
      fs.symlinkSync(decoy, catalogPath(sandbox), 'file')
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP') return
      throw error
    }
    expectError(await openFixtureTaskCatalog({ sandbox }), 'STORE_INVALID', '$')
  })

  await withSandbox(async (sandbox) => {
    const decoy = path.join(sandbox.root, 'hardlink-source.json')
    fs.writeFileSync(decoy, '{}')
    try {
      fs.linkSync(decoy, catalogPath(sandbox))
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP') return
      throw error
    }
    expectError(await openFixtureTaskCatalog({ sandbox }), 'STORE_INVALID', '$')
  })
})

test('D11 an external valid rewrite is STORE_CHANGED, locks the capability and is not repaired', async () => {
  await withSandbox(async (sandbox) => {
    const opened = await openFixtureTaskCatalog({ sandbox })
    const first = await opened.value.reserve(reserveInput())
    assert.equal(first.ok, true)

    const record = makeRecord(ttsDraft({ source: { kind: 'TEXT_REF', ref: 'artifact:fixture-text-9' } }), 'task:fixture-' + '9'.repeat(32))
    const externalSnapshot = snapshotOf([
      makeEntry(readSnapshot(sandbox).entries[0].record, SCOPE, KEY),
      makeEntry(record, SCOPE, 'key:fixture-external'),
    ])
    writeSnapshot(sandbox, externalSnapshot)
    const externalBytes = fs.readFileSync(catalogPath(sandbox))

    expectError(await opened.value.get(getInput({ taskId: first.value.task.taskId })), 'STORE_CHANGED', '$')
    expectError(await opened.value.reserve(reserveInput({ idempotencyKey: 'key:fixture-after' })), 'CATALOG_UNKNOWN', '$')

    const reopened = await openFixtureTaskCatalog({ sandbox })
    expectError(reopened, 'CATALOG_UNKNOWN', '$')
    assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(externalBytes))
  })
})

// ---------------------------------------------------------------------------------------------
// D12–D13: real write ordering and injected filesystem failures.
// ---------------------------------------------------------------------------------------------

test('D12 temporary write/fsync failures are WRITE_REJECTED without losing the original file', async () => {
  await withCatalog(async (sandbox, handle) => {
    const first = await handle.reserve(reserveInput())
    assert.equal(first.ok, true)
    const bytes = fs.readFileSync(catalogPath(sandbox))

    const realWriteSync = fs.writeSync
    try {
      fs.writeSync = () => {
        throw new Error('injected-write-failure')
      }
      expectError(
        await handle.reserve(reserveInput({ idempotencyKey: 'key:fixture-write-fail' })),
        'WRITE_REJECTED',
        '$',
      )
    } finally {
      fs.writeSync = realWriteSync
    }
    assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(bytes))
    const retry = await handle.reserve(reserveInput({ idempotencyKey: 'key:fixture-write-fail' }))
    assert.equal(retry.ok, true)
    assert.equal(retry.value.outcome, 'CREATED')

    const realFsync = fs.fsyncSync
    try {
      fs.fsyncSync = () => {
        throw new Error('injected-fsync-failure')
      }
      expectError(
        await handle.reserve(reserveInput({ idempotencyKey: 'key:fixture-fsync-fail' })),
        'WRITE_REJECTED',
        '$',
      )
    } finally {
      fs.fsyncSync = realFsync
    }
  })
})

test('D12b the confirmed order is temp write, fsync, close, rename then read-back', async () => {
  await withCatalog(async (sandbox, handle) => {
    const log = []
    const realOpen = fs.openSync
    const realWrite = fs.writeSync
    const realFsync = fs.fsyncSync
    const realClose = fs.closeSync
    const realRename = fs.renameSync
    const realRead = fs.readFileSync
    const realSha = crypto.createHash

    try {
      fs.openSync = (...args) => {
        if (String(args[0]).endsWith('.tmp')) log.push('open-temp')
        return realOpen(...args)
      }
      fs.writeSync = (...args) => {
        log.push('write')
        return realWrite(...args)
      }
      fs.fsyncSync = (...args) => {
        log.push('fsync')
        return realFsync(...args)
      }
      fs.closeSync = (...args) => {
        log.push('close')
        return realClose(...args)
      }
      fs.renameSync = (...args) => {
        log.push('rename')
        return realRename(...args)
      }
      fs.readFileSync = (...args) => {
        if (String(args[0]).endsWith(CATALOG_FILE)) log.push('read-catalog')
        return realRead(...args)
      }
      crypto.createHash = realSha
      const result = await handle.reserve(reserveInput())
      assert.equal(result.ok, true)
    } finally {
      restoreFunctions([
        [fs, 'openSync', realOpen],
        [fs, 'writeSync', realWrite],
        [fs, 'fsyncSync', realFsync],
        [fs, 'closeSync', realClose],
        [fs, 'renameSync', realRename],
        [fs, 'readFileSync', realRead],
      ])
    }

    const writeIndex = log.indexOf('write')
    const fsyncIndex = log.indexOf('fsync')
    const closeIndex = log.indexOf('close')
    const renameIndex = log.indexOf('rename')
    const readAfterRename = log.indexOf('read-catalog', renameIndex + 1)
    assert.ok(writeIndex >= 0 && fsyncIndex > writeIndex && closeIndex > fsyncIndex && renameIndex > closeIndex)
    assert.ok(readAfterRename > renameIndex)
  })
})

test('D13 a failed rename or failed read-back is WRITE_UNKNOWN and locks every handle', async () => {
  for (const mode of ['rename-throw', 'read-back-corrupt']) {
    await withSandbox(async (sandbox) => {
      const opened = await openFixtureTaskCatalog({ sandbox })
      const first = await opened.value.reserve(reserveInput())
      assert.equal(first.ok, true)
      const bytes = fs.readFileSync(catalogPath(sandbox))

      const realRename = fs.renameSync
      const realRead = fs.readFileSync
      let armed = false
      let corrupt = false
      try {
        if (mode === 'rename-throw') {
          fs.renameSync = () => {
            throw new Error('injected-rename-failure')
          }
        } else {
          fs.renameSync = (...args) => {
            const result = realRename(...args)
            armed = true
            return result
          }
          fs.readFileSync = (...args) => {
            if (armed && !corrupt && String(args[0]).endsWith(CATALOG_FILE)) {
              corrupt = true
              return Buffer.from('{"schemaVersion":1,"revision":1,"entries":[]}', 'utf8')
            }
            return realRead(...args)
          }
        }
        expectError(
          await opened.value.reserve(reserveInput({ idempotencyKey: 'key:fixture-unknown' })),
          'WRITE_UNKNOWN',
          '$',
        )
        expectError(
          await opened.value.reserve(reserveInput({ idempotencyKey: 'key:fixture-unknown-2' })),
          'CATALOG_UNKNOWN',
          '$',
        )
        expectError(await opened.value.get(getInput({ taskId: first.value.task.taskId })), 'CATALOG_UNKNOWN', '$')
      } finally {
        fs.renameSync = realRename
        fs.readFileSync = realRead
      }

      const reopened = await openFixtureTaskCatalog({ sandbox })
      expectError(reopened, 'CATALOG_UNKNOWN', '$')
      if (mode === 'rename-throw') assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(bytes))
    })
  }
})

// ---------------------------------------------------------------------------------------------
// D14–D18: hostile input, values, static surface and documentation.
// ---------------------------------------------------------------------------------------------

test('D14 getters, Symbols, hidden keys, custom prototypes and Proxy traps fail closed', async () => {
  await withCatalog(async (sandbox, handle) => {
    let reads = 0
    const accessor = reserveInput()
    Object.defineProperty(accessor, 'scopeId', {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1
        return SCOPE
      },
    })
    expectError(await handle.reserve(accessor), 'INVALID_INPUT', '$')
    assert.equal(reads, 0)

    const symbolInput = reserveInput()
    symbolInput[Symbol('secret')] = true
    expectError(await handle.reserve(symbolInput), 'INVALID_INPUT', '$')

    const hidden = reserveInput()
    Object.defineProperty(hidden, 'hiddenKey', { value: 1, enumerable: false })
    expectError(await handle.reserve(hidden), 'INVALID_INPUT', '$')

    const custom = Object.create({ inherited: 1 })
    Object.assign(custom, reserveInput())
    expectError(await handle.reserve(custom), 'INVALID_INPUT', '$')

    const marker = 'PRIVATE_MARKER_D14'
    const proxy = new Proxy({}, {
      ownKeys() {
        throw new Error(marker)
      },
    })
    const proxied = expectError(await handle.reserve(proxy), 'INVALID_INPUT', '$')
    assert.equal(JSON.stringify(proxied).includes(marker), false)
    assert.equal(JSON.stringify(proxied).includes('stack'), false)

    const cyclic = reserveInput()
    cyclic.self = cyclic
    expectError(await handle.reserve(cyclic), 'INVALID_INPUT', '$')

    const extra = reserveInput()
    extra.extra = 1
    expectError(await handle.reserve(extra), 'INVALID_INPUT', '<unknown-key>')

    let optionReads = 0
    const options = {}
    Object.defineProperty(options, 'sandbox', {
      enumerable: true,
      configurable: true,
      get() {
        optionReads += 1
        return sandbox
      },
    })
    expectError(await openFixtureTaskCatalog(options), 'INVALID_INPUT', '$')
    assert.equal(optionReads, 0)
  })
})

test('D15 null-prototype and frozen inputs work; results are fresh/frozen and do not leak', async () => {
  await withCatalog(async (sandbox, handle) => {
    const input = Object.assign(Object.create(null), reserveInput())
    const created = await handle.reserve(input)
    assert.equal(created.ok, true)
    assertDeepFrozen(created)
    assert.equal(Object.isFrozen(input), false)

    const bytes = fs.readFileSync(catalogPath(sandbox))
    assert.throws(() => {
      created.value.task.state = 'SAVED'
    })
    assert.ok(fs.readFileSync(catalogPath(sandbox)).equals(bytes))
    const found = await handle.get(getInput({ taskId: created.value.task.taskId }))
    assert.equal(found.value.task.state, 'CREATED')

    const frozen = Object.freeze(reserveInput({ idempotencyKey: 'key:fixture-frozen' }))
    const second = await handle.reserve(frozen)
    assert.equal(second.ok, true)
    assertDeepFrozen(second)
  })
})

test('D16 public surface, fixed codes and privacy of the JSON envelope', async () => {
  assert.equal(TASK_CATALOG_SCHEMA_VERSION, 1)
  const moduleKeys = Object.keys(await import('../core/audio/task-catalog.mjs')).sort()
  assert.deepEqual(moduleKeys, ['TASK_CATALOG_ERRORS', 'TASK_CATALOG_SCHEMA_VERSION', 'openFixtureTaskCatalog'])
  const codeKeys = Object.keys(TASK_CATALOG_ERRORS)
  assert.equal(codeKeys.length, 15)
  for (const key of codeKeys) assert.equal(TASK_CATALOG_ERRORS[key], 'TASK_CATALOG_' + key)

  await withCatalog(async (sandbox, handle) => {
    assert.deepEqual(Object.keys(handle).sort(), ['get', 'reserve'])
    const created = await handle.reserve(reserveInput())
    assert.equal(created.ok, true)
    assert.deepEqual(Object.keys(created.value), [
      'schemaVersion', 'outcome', 'revision', 'task',
      'mockOnly', 'realOperationAllowed', 'submitAllowed', 'automaticRetryAllowed',
    ])
    const encoded = JSON.stringify(created)
    assert.equal(encoded.includes(SCOPE), false)
    assert.equal(encoded.includes(KEY), false)
    assert.equal(encoded.includes('identityHash'), false)
    assert.equal(encoded.includes(sandbox.root), false)
    assert.equal(encoded.includes('"record"'), false)
    assert.equal(encoded.includes('artifact:fixture-text-1'), false)

    const error = await handle.get(getInput({ taskId: 'task:fixture-00000000000000000000000000000000' }))
    assert.deepEqual(Object.keys(error), ['ok', 'errors'])
    assert.deepEqual(Object.keys(error.errors[0]).sort(), ['code', 'path', 'reason'])
  })
})

test('D17 observedAt is validated before idempotency; taskId in draft is rejected', async () => {
  await withCatalog(async (sandbox, handle) => {
    const created = await handle.reserve(reserveInput())
    assert.equal(created.ok, true)
    expectError(
      await handle.reserve(reserveInput({ observedAt: '2026-13-01T00:00:00.000Z' })),
      'DRAFT_REJECTED',
      'draft',
    )
    const later = await handle.reserve(reserveInput({ observedAt: '2026-10-28T00:00:00.000Z' }))
    assert.equal(later.value.outcome, 'EXISTING')
    assert.equal(readSnapshot(sandbox).entries[0].record.observedAt, NOW)

    expectError(
      await handle.reserve(reserveInput({ draft: ttsDraft({ taskId: 'task:fixture-abc' }) })),
      'INVALID_INPUT',
      'draft',
    )
  })
})

test('D18 the module only imports the old create/validate/project Task functions', async () => {
  const source = fs.readFileSync(path.resolve('core/audio/task-catalog.mjs'), 'utf8')
  assert.match(source, /createAudioTaskRecord/)
  assert.match(source, /validateAudioTaskRecord/)
  assert.match(source, /projectAudioTask/)
  assert.doesNotMatch(source, /transitionAudioTask\s*\(|runFixtureAudioTaskOnce\s*\(|dispatchRvcFakeOnce\s*\(|negotiateReadyFixtureProvider\s*\(/)
  assert.doesNotMatch(source, /node:http|node:https|child_process|\bfetch\s*\(|\bspawn\s*\(/)
  assert.match(source, /import fs from 'node:fs'/)
  assert.match(source, /import crypto from 'node:crypto'/)
})

function extractReserveExample(doc, heading) {
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, 'heading missing: ' + heading)
  const rest = doc.slice(at)
  const fence = rest.indexOf('```json')
  const close = rest.indexOf('```', fence + 7)
  assert.ok(fence >= 0 && close > fence)
  return JSON.parse(rest.slice(fence + 7, close).trim())
}

test('D19 both documentation JSON examples run as written against a real temporary catalog', async () => {
  const doc = fs.readFileSync(path.resolve('docs/TASK_CATALOG_OFFLINE.md'), 'utf8')
  const tts = extractReserveExample(doc, '## 7. TTS创建示例')
  const svc = extractReserveExample(doc, '## 8. SVC权利阻断示例')

  for (const example of [tts, svc]) {
    assert.deepEqual(Object.keys(example).sort(), ['draft', 'idempotencyKey', 'observedAt', 'schemaVersion', 'scopeId'])
    assert.equal(example.scopeId, tts.scopeId)
  }
  assert.notEqual(svc.idempotencyKey, tts.idempotencyKey)
  assert.equal(svc.draft.rights.state, 'UNVERIFIED')

  await withCatalog(async (sandbox, handle) => {
    const ttsResult = await handle.reserve(tts)
    assert.equal(ttsResult.ok, true)
    assert.equal(ttsResult.value.outcome, 'CREATED')
    assert.equal(ttsResult.value.task.state, 'CREATED')

    const svcResult = await handle.reserve(svc)
    assert.equal(svcResult.ok, true)
    assert.equal(svcResult.value.outcome, 'CREATED')
    assert.equal(svcResult.value.task.state, 'BLOCKED_RIGHTS')

    const existing = await handle.reserve(tts)
    assert.equal(existing.value.outcome, 'EXISTING')
    assert.equal(existing.value.task.taskId, ttsResult.value.task.taskId)

    const conflict = JSON.parse(JSON.stringify(tts))
    conflict.draft.source.ref = 'artifact:fixture-text-2'
    expectError(await handle.reserve(conflict), 'IDEMPOTENCY_CONFLICT', '$')

    const crossScope = await handle.get({
      schemaVersion: 1,
      scopeId: OTHER_SCOPE,
      taskId: ttsResult.value.task.taskId,
    })
    expectError(crossScope, 'NOT_FOUND', '$')
  })
})

test('D20 the documentation keeps the storyboard, three recoveries and real limits', () => {
  const doc = fs.readFileSync(path.resolve('docs/TASK_CATALOG_OFFLINE.md'), 'utf8')
  for (const marker of ['OFFLINE', 'FIXTURE_ONLY', 'NOT_INTEGRATED', '演示任务记录已保存', '等待确认素材权利', '不会自动重新创建', '跨进程']) {
    assert.equal(doc.includes(marker), true, marker)
  }
  for (const recovery of ['原阻断任务不自动重开', '系统不自动换键', '系统不会自动重新创建']) {
    assert.equal(doc.includes(recovery), true, recovery)
  }
  assert.equal(doc.includes('没有真实生成按钮'), true)
})
