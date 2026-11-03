import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  CLOUD_CREDENTIAL_ERRORS,
  CLOUD_CREDENTIAL_NAMESPACE,
  openCredentialStore,
} from '../core/tts/cloud-credentials.mjs'

function fakeProtector() {
  return {
    available: true,
    async protect(value) {
      return Buffer.concat([Buffer.from('FAKE:', 'utf8'), value])
    },
    async unprotect(value) {
      const text = value.toString('utf8')
      if (!text.startsWith('FAKE:')) throw new Error('bad ciphertext')
      return Buffer.from(text.slice(5), 'utf8')
    },
  }
}

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wv-cred-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  return root
}

function fileFor(root, ref) {
  const digest = crypto.createHash('sha256').update(ref, 'utf8').digest('hex')
  return path.join(root, CLOUD_CREDENTIAL_NAMESPACE, `credential-${digest}.json`)
}

test('credential store round-trips through an injected protector and never stores plaintext', async (t) => {
  const root = await tempRoot(t)
  const store = openCredentialStore({ rootDir: root, platform: 'win32', protector: fakeProtector() })
  const ref = 'dpapi:whale-voice:azure-main'
  const secret = 'synthetic-not-a-real-key-0123456789'
  const put = await store.put(ref, secret)
  assert.equal(put.ok, true)
  const resolved = await store.resolve(ref)
  assert.equal(resolved.ok, true)
  assert.equal(resolved.secret, secret)
  const raw = await fs.readFile(fileFor(root, ref), 'utf8')
  assert.equal(raw.includes(secret), false)
  assert.equal(raw.includes(ref), true)
  assert.ok(raw.includes('ciphertext'))
  assert.equal((await store.has(ref)).present, true)
  assert.equal((await store.has('dpapi:whale-voice:missing')).present, false)
  assert.equal((await store.remove(ref)).ok, true)
  assert.equal((await store.resolve(ref)).code, CLOUD_CREDENTIAL_ERRORS.NOT_FOUND)
})

test('credential store fails closed on corruption and write failure keeps the old value', async (t) => {
  const root = await tempRoot(t)
  let failRename = false
  const store = openCredentialStore({
    rootDir: root,
    platform: 'win32',
    protector: fakeProtector(),
    hooks: {
      beforeRename() {
        if (failRename) throw new Error('injected rename failure')
      },
    },
  })
  const ref = 'dpapi:whale-voice:custom-main'
  assert.equal((await store.put(ref, 'old-synthetic-value')).ok, true)
  failRename = true
  const failed = await store.put(ref, 'new-synthetic-value')
  assert.equal(failed.ok, false)
  assert.equal(failed.code, CLOUD_CREDENTIAL_ERRORS.WRITE_FAILED)
  assert.equal((await store.resolve(ref)).secret, 'old-synthetic-value')
  failRename = false

  await fs.writeFile(fileFor(root, ref), '{"broken":true}', 'utf8')
  const corrupt = await store.resolve(ref)
  assert.equal(corrupt.ok, false)
  assert.equal(corrupt.code, CLOUD_CREDENTIAL_ERRORS.CORRUPT)
  assert.equal(JSON.stringify(corrupt).includes('old-synthetic-value'), false)

  await fs.writeFile(fileFor(root, ref), '{"schemaVersion":1,"ref":"' + ref + '","algorithm":"dpapi-current-user","ciphertext":"ZmFrZQ==","createdAt":"x","updatedAt":"y"}', 'utf8')
  const wrongCipher = await store.resolve(ref)
  assert.equal(wrongCipher.ok, false)
  assert.equal(wrongCipher.code, CLOUD_CREDENTIAL_ERRORS.CORRUPT)
})

test('credential store is explicitly unavailable off Windows and has no plaintext fallback', async (t) => {
  const root = await tempRoot(t)
  const store = openCredentialStore({ rootDir: root, platform: 'linux' })
  const status = await store.status()
  assert.equal(status.available, false)
  assert.equal(status.algorithm, null)
  const put = await store.put('dpapi:whale-voice:x', 'synthetic')
  assert.equal(put.code, CLOUD_CREDENTIAL_ERRORS.UNAVAILABLE)
  const resolve = await store.resolve('dpapi:whale-voice:x')
  assert.equal(resolve.code, CLOUD_CREDENTIAL_ERRORS.UNAVAILABLE)
  await assert.rejects(fs.readdir(path.join(root, CLOUD_CREDENTIAL_NAMESPACE)), { code: 'ENOENT' })
})

test('invalid refs and secrets are rejected before any native call', async (t) => {
  const root = await tempRoot(t)
  let calls = 0
  const store = openCredentialStore({
    rootDir: root,
    platform: 'win32',
    protector: {
      available: true,
      async protect(value) { calls += 1; return Buffer.from(value) },
      async unprotect(value) { calls += 1; return Buffer.from(value) },
    },
  })
  assert.equal((await store.put('../escape', 'value')).code, CLOUD_CREDENTIAL_ERRORS.REF_INVALID)
  assert.equal((await store.put('dpapi:whale-voice:ok', '')).code, CLOUD_CREDENTIAL_ERRORS.SECRET_INVALID)
  assert.equal((await store.put('dpapi:whale-voice:ok', 'a\u0000b')).code, CLOUD_CREDENTIAL_ERRORS.SECRET_INVALID)
  assert.equal((await store.resolve('bad ref')).code, CLOUD_CREDENTIAL_ERRORS.REF_INVALID)
  assert.equal(calls, 0)
})

test('real Windows DPAPI CurrentUser path round-trips a new synthetic fixture', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows DPAPI test is only applicable on win32')
    return
  }
  const root = await tempRoot(t)
  const store = openCredentialStore({ rootDir: root })
  const status = await store.status()
  if (!status.available) {
    t.skip('Windows DPAPI helper is unavailable in this environment')
    return
  }
  const ref = 'dpapi:whale-voice:dpapi-selftest'
  const secret = 'whale-test-synthetic-not-a-real-key'
  const put = await store.put(ref, secret)
  assert.equal(put.ok, true)
  const resolved = await store.resolve(ref)
  assert.equal(resolved.ok, true)
  assert.equal(resolved.secret, secret)
  const raw = await fs.readFile(fileFor(root, ref), 'utf8')
  assert.equal(raw.includes(secret), false)
})
