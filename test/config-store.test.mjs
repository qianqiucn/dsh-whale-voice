import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { test, after } from 'node:test'

import { createConfigStore, ConfigStoreError } from '../core/config-store.mjs'
import { createIsolatedWriteServer } from '../core/isolated-write-server.mjs'
import { migrateConfig, validateConfig, canonicalize } from '../core/config-schema.mjs'

const roots = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

function validConfig(overrides = {}) {
  const base = {
    schemaVersion: 1,
    voice: { enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0, defaultVoice: 'whale-v1' },
    tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' },
    permissions: { private: ['wechat:private:fixture-a'], groups: [] },
  }
  return {
    ...base,
    ...overrides,
    voice: { ...base.voice, ...(overrides.voice || {}) },
    tts: { ...base.tts, ...(overrides.tts || {}) },
    permissions: { ...base.permissions, ...(overrides.permissions || {}) },
  }
}

function legacyConfig() {
  return {
    schemaVersion: 0,
    enabled: false,
    mode: 'explicit',
    for_group: false,
    auto_probability: 0,
    default_voice: 'whale-v1',
    tts: { provider: 'qwen-local', model: null, voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' },
    permissions: { private: ['wechat:private:fixture-a'], groups: [] },
  }
}

async function fixture(options = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'whale-config-store-'))
  roots.push(base)
  const root = path.join(base, 'isolated')
  await mkdir(root)
  const env = { DSH_HOME: path.join(base, '.dsh') }
  const target = path.join(root, 'config.json')
  if (options.raw !== undefined) await writeFile(target, options.raw, 'utf8')
  else if (options.config !== null) await writeFile(target, JSON.stringify(options.config || validConfig()), 'utf8')
  const store = createConfigStore({ root, env, revisionKey: options.revisionKey, fsImpl: options.fsImpl, fileName: options.fileName })
  return { base, root, env, target, store }
}

function fsProxy(overrides) {
  return new Proxy(fs, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(overrides, property)) return overrides[property]
      const value = target[property]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function eperm() {
  const error = new Error('operation not permitted')
  error.code = 'EPERM'
  return error
}

function eio() {
  const error = new Error('i/o failure')
  error.code = 'EIO'
  return error
}

test('isolated v1 config reads with an opaque revision and a sanitized public view', async () => {
  const { store } = await fixture()
  const result = store.read()
  assert.equal(result.ok, true)
  assert.match(result.revision, /^[a-f0-9]{32}$/)
  assert.equal(result.config.permissions.private[0], 'wechat:private:fixture-a')
  const publicView = store.readPublic()
  assert.equal(publicView.ok, true)
  assert.equal(publicView.public.permissions.privateCount, 1)
  assert.equal(publicView.public.permissions.groupCount, 0)
  assert.equal(publicView.public.permissions.detailAvailable, false)
  assert.equal(publicView.public.application.activeRevision, null)
  assert.equal(publicView.public.application.activeConfirmed, false)
  assert.equal(publicView.public.application.activeState, 'UNKNOWN')
  assert.equal(publicView.public.application.state, 'PENDING_APPLY')
  assert.equal(JSON.stringify(publicView.public).includes('wechat:private:fixture-a'), false)
  assert.equal(JSON.stringify(publicView.public).includes('127.0.0.1:8765'), false)
})

test('valid write persists the full config and reports SAVED but PENDING_APPLY', async () => {
  const { store, target } = await fixture()
  const before = store.read()
  const next = validConfig({ voice: { enabled: true, defaultVoice: 'whale-v1' } })
  const result = await store.write({ expectedRevision: before.revision, config: next })
  assert.equal(result.ok, true)
  assert.equal(result.state, 'SAVED')
  assert.equal(result.changed, true)
  assert.notEqual(result.revision, before.revision)
  assert.equal(result.public.application.state, 'PENDING_APPLY')
  assert.equal(result.public.application.activeRevision, null)
  assert.equal(result.public.application.activeConfirmed, false)
  assert.equal(result.public.voice.enabled, true)
  const disk = JSON.parse(await readFile(target, 'utf8'))
  assert.equal(disk.voice.enabled, true)
  assert.equal(disk.schemaVersion, 1)
  assert.equal(store.read().revision, result.revision)
})

test('writing identical content returns UNCHANGED without replacing the file', async () => {
  const { store, target } = await fixture()
  const before = store.read()
  const mtime = (await stat(target)).mtimeMs
  const result = await store.write({ expectedRevision: before.revision, config: before.config })
  assert.equal(result.ok, true)
  assert.equal(result.state, 'UNCHANGED')
  assert.equal(result.changed, false)
  assert.equal((await stat(target)).mtimeMs, mtime)
})

test('schema type errors fail before touching the file', async () => {
  const { store, target } = await fixture()
  const before = store.read()
  const rawBefore = await readFile(target, 'utf8')
  const invalid = validConfig({ voice: { enabled: 'false' } })
  const result = await store.write({ expectedRevision: before.revision, config: invalid })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_VALIDATION_FAILED')
  assert.ok(result.error.errors.some((item) => item.code === 'CONFIG_TYPE_INVALID' && item.path === 'voice.enabled'))
  assert.equal(await readFile(target, 'utf8'), rawBefore)
})

test('unknown fields are rejected, not silently dropped', async () => {
  const { store } = await fixture()
  const before = store.read()
  const result = await store.write({ expectedRevision: before.revision, config: validConfig({ voice: { extra: true } }) })
  assert.equal(result.ok, false)
  assert.ok(result.error.errors.some((item) => item.code === 'CONFIG_UNKNOWN_FIELD' && item.path === 'voice.extra'))
})

test('unsupported schema versions fail closed on read and write', async () => {
  const { store, target } = await fixture()
  const before = store.read()
  const result = await store.write({ expectedRevision: before.revision, config: validConfig({ schemaVersion: 2 }) })
  assert.equal(result.ok, false)
  assert.ok(result.error.errors.some((item) => item.code === 'CONFIG_SCHEMA_UNSUPPORTED'))
  await writeFile(target, JSON.stringify(validConfig({ schemaVersion: 2 })), 'utf8')
  const read = store.read()
  assert.equal(read.ok, false)
  assert.equal(read.error.code, 'CONFIG_SCHEMA_UNSUPPORTED')
})

test('v0 migration is pure, idempotent, and persists as v1 only on write', async () => {
  const { store, target } = await fixture({ config: legacyConfig() })
  const rawBefore = await readFile(target, 'utf8')
  const read = store.read()
  assert.equal(read.ok, true)
  assert.equal(read.migrated, true)
  assert.equal(read.fromSchemaVersion, 0)
  assert.equal(read.config.schemaVersion, 1)
  assert.equal(read.config.voice.forGroup, false)
  assert.equal(JSON.parse(rawBefore).schemaVersion, 0)
  assert.deepEqual(migrateConfig(read.config).config, read.config)

  const write = await store.write({ expectedRevision: read.revision, config: read.config })
  assert.equal(write.ok, true)
  assert.equal(write.state, 'SAVED')
  assert.equal(JSON.parse(await readFile(target, 'utf8')).schemaVersion, 1)
  const second = await store.write({ expectedRevision: write.revision, config: read.config })
  assert.equal(second.state, 'UNCHANGED')
})

test('migrateConfig is idempotent and rejects unknown legacy fields', () => {
  const migrated = migrateConfig(legacyConfig())
  assert.equal(migrated.ok, true)
  assert.equal(migrated.migrated, true)
  const twice = migrateConfig(migrated.config)
  assert.equal(twice.ok, true)
  assert.equal(twice.migrated, false)
  assert.deepEqual(twice.config, migrated.config)
  const bad = migrateConfig({ ...legacyConfig(), extra: true })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.some((item) => item.code === 'CONFIG_UNKNOWN_FIELD'))
})

test('schema validation covers enums, ranges, required fields and duplicate IDs', () => {
  const mode = validateConfig(validConfig({ voice: { mode: 'auto' } }))
  assert.equal(mode.ok, false)
  assert.ok(mode.errors.some((item) => item.code === 'CONFIG_ENUM_INVALID'))
  const range = validateConfig(validConfig({ voice: { autoProbability: 101 } }))
  assert.equal(range.ok, false)
  assert.ok(range.errors.some((item) => item.code === 'CONFIG_RANGE_INVALID'))
  const missing = validConfig()
  delete missing.voice.enabled
  const missingResult = validateConfig(missing)
  assert.equal(missingResult.ok, false)
  assert.ok(missingResult.errors.some((item) => item.code === 'CONFIG_REQUIRED_MISSING' && item.path === 'voice.enabled'))
  const duplicate = validateConfig(validConfig({ permissions: { private: ['duplicate', 'duplicate'] } }))
  assert.equal(duplicate.ok, false)
  assert.ok(duplicate.errors.some((item) => item.code === 'CONFIG_DUPLICATE_ID'))
  const optional = validConfig()
  delete optional.tts.model
  delete optional.tts.baseUrl
  const optionalResult = validateConfig(optional)
  assert.equal(optionalResult.ok, true)
  assert.equal(optionalResult.config.tts.model, null)
  assert.equal(optionalResult.config.tts.baseUrl, null)
})

test('revision mismatch returns CONFIG_CONFLICT and leaves the newer file untouched', async () => {
  const { store, target } = await fixture()
  const before = store.read()
  const newer = validConfig({ voice: { enabled: true } })
  await writeFile(target, JSON.stringify(newer), 'utf8')
  const result = await store.write({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: false } }) })
  assert.equal(result.ok, false)
  assert.equal(result.state, 'CONFLICT')
  assert.equal(result.error.code, 'CONFIG_CONFLICT')
  assert.equal(JSON.parse(await readFile(target, 'utf8')).voice.enabled, true)
})

test('revision format and expectedRevision are required', async () => {
  const { store } = await fixture()
  assert.equal((await store.write({ config: validConfig() })).error.code, 'CONFIG_REVISION_REQUIRED')
  assert.equal((await store.write({ expectedRevision: 'not-a-revision', config: validConfig() })).error.code, 'CONFIG_REVISION_INVALID')
})

test('two concurrent writes with the same revision produce one SAVED and one CONFLICT', async () => {
  const { store } = await fixture()
  const before = store.read()
  const a = validConfig({ voice: { enabled: true } })
  const b = validConfig({ voice: { enabled: false, defaultVoice: 'other-voice' } })
  const [first, second] = await Promise.all([
    store.write({ expectedRevision: before.revision, config: a }),
    store.write({ expectedRevision: before.revision, config: b }),
  ])
  const states = [first.state, second.state].sort()
  assert.deepEqual(states, ['CONFLICT', 'SAVED'])
  assert.equal(store.read().ok, true)
  assert.equal(store.cleanupTempFiles(), 0)
})

test('a process restart invalidates the old revision', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'whale-config-restart-'))
  roots.push(base)
  const root = path.join(base, 'isolated')
  await mkdir(root)
  const env = { DSH_HOME: path.join(base, '.dsh') }
  await writeFile(path.join(root, 'config.json'), JSON.stringify(validConfig()), 'utf8')
  const first = createConfigStore({ root, env, revisionKey: randomBytes(32) })
  const old = first.read()
  const second = createConfigStore({ root, env, revisionKey: randomBytes(32) })
  const fresh = second.read()
  assert.notEqual(fresh.revision, old.revision)
  const result = await second.write({ expectedRevision: old.revision, config: validConfig({ voice: { enabled: true } }) })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_CONFLICT')
})

test('an external file modification is detected before save', async () => {
  const { store, target } = await fixture()
  const before = store.read()
  await writeFile(target, JSON.stringify(validConfig({ voice: { enabled: true, defaultVoice: 'external' } })), 'utf8')
  const result = await store.write({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: false } }) })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_CONFLICT')
  assert.equal(JSON.parse(await readFile(target, 'utf8')).voice.defaultVoice, 'external')
})

test('missing and corrupt files fail closed', async () => {
  const missing = await fixture({ config: null })
  const missingRead = missing.store.read()
  assert.equal(missingRead.ok, false)
  assert.equal(missingRead.error.code, 'CONFIG_MISSING')
  assert.equal(missingRead.state, 'UNKNOWN')

  const corrupt = await fixture({ raw: '{broken' })
  const corruptRead = corrupt.store.read()
  assert.equal(corruptRead.ok, false)
  assert.equal(corruptRead.error.code, 'CONFIG_CORRUPT')
  const result = await corrupt.store.write({ expectedRevision: 'a'.repeat(32), config: validConfig() })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_CORRUPT')
})

test('production configuration directory is not a valid isolated root', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'whale-config-prod-'))
  roots.push(base)
  const dshHome = path.join(base, '.dsh')
  const root = path.join(dshHome, 'whale-voice')
  await mkdir(root, { recursive: true })
  assert.throws(
    () => createConfigStore({ root, env: { DSH_HOME: dshHome } }),
    (error) => error instanceof ConfigStoreError && error.code === 'CONFIG_UNSAFE_ROOT'
  )
})

test('filename traversal and symlink/junction roots are rejected', async () => {
  const { root, env } = await fixture()
  assert.throws(
    () => createConfigStore({ root, env, fileName: '../escape.json' }),
    (error) => error instanceof ConfigStoreError && error.code === 'CONFIG_FILENAME_INVALID'
  )

  const base = await mkdtemp(path.join(tmpdir(), 'whale-config-link-'))
  roots.push(base)
  const outside = path.join(base, 'outside')
  const link = path.join(base, 'linked-root')
  await mkdir(outside)
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(
    () => createConfigStore({ root: link, env: { DSH_HOME: path.join(base, '.dsh') } }),
    (error) => error instanceof ConfigStoreError && error.code === 'CONFIG_UNSAFE_ROOT'
  )
})

test('temporary write failures leave the old valid file and clean the temp file', async () => {
  const { store } = await fixture()
  const before = store.read()
  const rawBefore = await readFile(path.join(store.root, 'config.json'), 'utf8')
  const fsImpl = fsProxy({
    openSync(file, ...args) {
      if (String(file).includes('.tmp')) throw eperm()
      return fs.openSync(file, ...args)
    },
  })
  const failing = createConfigStore({ root: store.root, env: store.env, fsImpl })
  const result = await failing.write({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: true } }) })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_PERMISSION_DENIED')
  assert.equal(await readFile(path.join(store.root, 'config.json'), 'utf8'), rawBefore)
  assert.equal(failing.cleanupTempFiles(), 0)
})

test('partial temporary writes and fsync failures do not replace the valid file', async () => {
  const { store } = await fixture()
  const before = store.read()
  const target = path.join(store.root, 'config.json')
  const rawBefore = await readFile(target, 'utf8')

  const partialFs = fsProxy({
    writeSync(fd, buffer, offset, length, position) {
      fs.writeSync(fd, buffer, offset, Math.min(4, length), position)
      const error = new Error('short write')
      error.code = 'EIO'
      throw error
    },
  })
  const partial = createConfigStore({ root: store.root, env: store.env, fsImpl: partialFs })
  const partialResult = await partial.write({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: true } }) })
  assert.equal(partialResult.ok, false)
  assert.equal(await readFile(target, 'utf8'), rawBefore)

  const fsyncFs = fsProxy({
    fsyncSync(fd) {
      throw Object.assign(new Error('fsync failed'), { code: 'EIO' })
    },
  })
  const fsyncStore = createConfigStore({ root: store.root, env: store.env, fsImpl: fsyncFs })
  const fsyncResult = await fsyncStore.write({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: true } }) })
  assert.equal(fsyncResult.ok, false)
  assert.equal(await readFile(target, 'utf8'), rawBefore)
})

test('atomic replace failure preserves the original file', async () => {
  const { store } = await fixture()
  const before = store.read()
  const target = path.join(store.root, 'config.json')
  const rawBefore = await readFile(target, 'utf8')
  const fsImpl = fsProxy({
    renameSync() {
      throw eio()
    },
  })
  const failing = createConfigStore({ root: store.root, env: store.env, fsImpl })
  const result = await failing.write({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: true } }) })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_REPLACE_FAILED')
  assert.equal(await readFile(target, 'utf8'), rawBefore)
  assert.equal(failing.cleanupTempFiles(), 0)
})

test('post-save verification failure rolls back to the previous valid content', async () => {
  const { store } = await fixture()
  const before = store.read()
  const target = path.join(store.root, 'config.json')
  const rawBefore = await readFile(target, 'utf8')
  let renamed = false
  let injected = false
  const fsImpl = fsProxy({
    renameSync(from, to) {
      fs.renameSync(from, to)
      renamed = true
    },
    readFileSync(file, ...args) {
      if (renamed && !injected) {
        injected = true
        throw Object.assign(new Error('verification read failed'), { code: 'EIO' })
      }
      return fs.readFileSync(file, ...args)
    },
  })
  const failing = createConfigStore({ root: store.root, env: store.env, fsImpl })
  const result = await failing.write({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: true } }) })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_VERIFY_FAILED')
  assert.equal(result.error.rolledBack, true)
  assert.equal(await readFile(target, 'utf8'), rawBefore)
})

test('read permission failure is explicit and does not invent state', async () => {
  const { store } = await fixture()
  const fsImpl = fsProxy({
    readFileSync() {
      throw eperm()
    },
  })
  const failing = createConfigStore({ root: store.root, env: store.env, fsImpl })
  const result = failing.read()
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CONFIG_PERMISSION_DENIED')
  assert.equal(result.config, undefined)
})

test('orphan temp files are ignored by reads and can be cleaned without touching real files', async () => {
  const { store, root } = await fixture()
  const orphan = path.join(root, '.config.json.0123456789abcdef.tmp')
  const keep = path.join(root, 'not-a-temp.txt')
  await writeFile(orphan, '{"stale":true}', 'utf8')
  await writeFile(keep, 'keep', 'utf8')
  assert.equal(store.read().ok, true)
  assert.equal(store.cleanupTempFiles(), 1)
  assert.equal(fs.existsSync(orphan), false)
  assert.equal(await readFile(keep, 'utf8'), 'keep')
})

async function startApi(store, options = {}) {
  const service = createIsolatedWriteServer({ store, ...options })
  const address = await service.listen(0)
  assert.equal(address.address, '127.0.0.1')
  const base = 'http://127.0.0.1:' + address.port
  return { service, base, token: service.token }
}

test('isolated HTTP API rejects missing auth and bad origin', async () => {
  const { store } = await fixture()
  const api = await startApi(store)
  try {
    let response = await fetch(api.base + '/config', { headers: { origin: api.base } })
    assert.equal(response.status, 401)
    response = await fetch(api.base + '/config', { headers: { origin: 'http://127.0.0.1:1', 'x-whale-config-token': api.token } })
    assert.equal(response.status, 403)
    response = await fetch(api.base + '/config', { method: 'POST', headers: { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token }, body: '{}' })
    assert.equal(response.status, 400)
    response = await fetch(api.base + '/config', { method: 'POST', headers: { 'content-type': 'application/json', 'x-whale-config-token': api.token }, body: '{}' })
    assert.equal(response.status, 403)
  } finally {
    await api.service.close()
  }
})

test('isolated HTTP API reads, writes and never returns IDs or tokens', async () => {
  const { store } = await fixture()
  const api = await startApi(store)
  try {
    const before = store.read()
    let response = await fetch(api.base + '/config', { headers: { origin: api.base, 'x-whale-config-token': api.token } })
    assert.equal(response.status, 200)
    const readBody = await response.json()
    assert.equal(readBody.config.permissions.privateCount, 1)
    assert.equal(JSON.stringify(readBody).includes('wechat:private:fixture-a'), false)
    assert.equal(JSON.stringify(readBody).includes(api.token), false)

    response = await fetch(api.base + '/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token },
      body: JSON.stringify({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: true } }) }),
    })
    assert.equal(response.status, 200)
    const writeBody = await response.json()
    assert.equal(writeBody.state, 'SAVED')
    assert.equal(writeBody.config.application.activeRevision, null)
    assert.equal(writeBody.config.application.activeConfirmed, false)
    assert.equal(writeBody.config.permissions.privateCount, 1)
    assert.equal(JSON.stringify(writeBody).includes('wechat:private:fixture-a'), false)
  } finally {
    await api.service.close()
  }
})

test('isolated HTTP API enforces JSON, body limits, schema errors and conflicts', async () => {
  const { store } = await fixture()
  const api = await startApi(store)
  try {
    let response = await fetch(api.base + '/config', { method: 'POST', headers: { 'content-type': 'text/plain', origin: api.base, 'x-whale-config-token': api.token }, body: '{}' })
    assert.equal(response.status, 415)

    response = await fetch(api.base + '/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token },
      body: JSON.stringify({ expectedRevision: 'a'.repeat(32), config: validConfig({ voice: { enabled: 'yes' } }) }),
    })
    assert.equal(response.status, 422)

    const before = store.read()
    response = await fetch(api.base + '/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token },
      body: JSON.stringify({ expectedRevision: 'b'.repeat(32), config: validConfig() }),
    })
    assert.equal(response.status, 409)
    assert.equal((await response.json()).error.code, 'CONFIG_CONFLICT')

    response = await fetch(api.base + '/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token },
      body: JSON.stringify({ expectedRevision: before.revision, config: validConfig(), path: '../escape' }),
    })
    assert.equal(response.status, 400)

    response = await fetch(api.base + '/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token },
      body: JSON.stringify({ expectedRevision: before.revision, config: validConfig() }) + ' '.repeat(70 * 1024),
    })
    assert.equal(response.status, 413)
  } finally {
    await api.service.close()
  }
})

test('isolated HTTP API rejects concurrent writes with 429', async () => {
  const { store } = await fixture()
  const before = store.read()
  const slowStore = {
    readPublic: store.readPublic.bind(store),
    async write(args) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      return store.write(args)
    },
  }
  const api = await startApi(slowStore)
  try {
    const headers = { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token }
    const body = JSON.stringify({ expectedRevision: before.revision, config: validConfig({ voice: { enabled: true } }) })
    const first = fetch(api.base + '/config', { method: 'POST', headers, body })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const second = await fetch(api.base + '/config', { method: 'POST', headers, body })
    assert.equal(second.status, 429)
    assert.equal((await first).status, 200)
  } finally {
    await api.service.close()
  }
})

test('isolated HTTP API rejects malformed JSON, wrong methods and stalled bodies', async () => {
  const { store } = await fixture()
  const api = await startApi(store, { bodyTimeoutMs: 80 })
  try {
    let response = await fetch(api.base + '/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: api.base, 'x-whale-config-token': api.token },
      body: '{oops',
    })
    assert.equal(response.status, 400)

    response = await fetch(api.base + '/config', {
      method: 'DELETE',
      headers: { origin: api.base, 'x-whale-config-token': api.token },
    })
    assert.equal(response.status, 405)

    const status = await new Promise((resolve, reject) => {
      const request = http.request(api.base + '/config', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: api.base,
          'x-whale-config-token': api.token,
          'content-length': '100',
        },
      }, (incoming) => {
        incoming.resume()
        resolve(incoming.statusCode)
      })
      request.on('error', reject)
      request.write('{')
      setTimeout(() => { try { request.destroy() } catch {} }, 500)
    })
    assert.equal(status, 408)
  } finally {
    await api.service.close()
  }
})

test('production host remains read-only and does not import the isolated write API', async () => {
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8')
  assert.equal(source.includes('isolated-write-server'), false)
  assert.equal(source.includes('config-store'), false)
})

test('canonicalization is stable for object key order', () => {
  const a = canonicalize({ b: 1, a: { d: 2, c: 3 } })
  const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 })
  assert.deepEqual(a, b)
})
