/* Whale Voice — isolated cloud credential storage (Plan11, offline unit).
 *
 * One application-owned namespace backed by Windows DPAPI CurrentUser. The module stores only a
 * ciphertext envelope next to an opaque credentialRef; it never accepts a plaintext path, never
 * enumerates a directory, never reads another application's secret and never falls back to
 * plaintext. Values are passed to the native protector over stdin (never command arguments) and
 * are never logged, projected or returned by the public status view.
 *
 * Non-Windows and a missing protector are explicit UNAVAILABLE results. Tests inject a protector
 * and use a new temporary root plus synthetic values; production defaults to the real DPAPI helper.
 */

import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'

export const CLOUD_CREDENTIAL_SCHEMA_VERSION = 1
export const CLOUD_CREDENTIAL_NAMESPACE = 'whale-voice-credentials-v1'
export const CLOUD_CREDENTIAL_ALGORITHM = 'dpapi-current-user'

export const CLOUD_CREDENTIAL_ERRORS = Object.freeze({
  REF_INVALID: 'CREDENTIAL_REF_INVALID',
  SECRET_INVALID: 'CREDENTIAL_SECRET_INVALID',
  UNAVAILABLE: 'CREDENTIAL_UNAVAILABLE',
  NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
  CORRUPT: 'CREDENTIAL_CORRUPT',
  READ_FAILED: 'CREDENTIAL_READ_FAILED',
  WRITE_FAILED: 'CREDENTIAL_WRITE_FAILED',
  PROTECT_FAILED: 'CREDENTIAL_DPAPI_FAILED',
  NAMESPACE_INVALID: 'CREDENTIAL_NAMESPACE_INVALID',
})

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.@/-]{1,127}$/
const ENTRY_KEYS = new Set(['schemaVersion', 'ref', 'algorithm', 'ciphertext', 'createdAt', 'updatedAt'])
const MAX_SECRET_BYTES = 16384
const MAX_CIPHERTEXT_BYTES = 65536
const DPAPI_TIMEOUT_MS = 15000
const DPAPI_MAX_OUTPUT = 131072
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

const PROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$b64 = [Console]::In.ReadToEnd()
$bytes = [Convert]::FromBase64String($b64.Trim())
$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($protected))
`

const UNPROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$b64 = [Console]::In.ReadToEnd()
$bytes = [Convert]::FromBase64String($b64.Trim())
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($plain))
`

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate an opaque credentialRef before it is used as a lookup key. */
export function credentialRefValid(ref) {
  return typeof ref === 'string' && REF_PATTERN.test(ref)
}

/** Public platform view: no path, no secret and no directory listing. */
export function credentialPlatformView({ platform = process.platform, protector = null } = {}) {
  const available = platform === 'win32' || Boolean(protector)
  return {
    ok: true,
    available,
    platform: platform === 'win32' ? 'windows' : platform,
    algorithm: available ? CLOUD_CREDENTIAL_ALGORITHM : null,
    namespace: CLOUD_CREDENTIAL_NAMESPACE,
    reason: available ? null : CLOUD_CREDENTIAL_ERRORS.UNAVAILABLE,
  }
}

function runPowerShell(script, input) {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer = null
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout = []
    let stdoutBytes = 0
    let stderrBytes = 0
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > DPAPI_MAX_OUTPUT) {
        try { child.kill() } catch {}
        finish(new Error('dpapi output limit'))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      if (stderrBytes < 8192) stderrBytes += chunk.length
    })
    child.on('error', () => finish(new Error('dpapi spawn failed')))
    child.on('close', (code) => {
      if (code !== 0) return finish(new Error('dpapi helper failed'))
      try {
        const text = Buffer.concat(stdout).toString('ascii').trim()
        if (!text || !BASE64_PATTERN.test(text)) throw new Error('dpapi output invalid')
        finish(null, Buffer.from(text, 'base64'))
      } catch {
        finish(new Error('dpapi output invalid'))
      }
    })
    timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish(new Error('dpapi timeout'))
    }, DPAPI_TIMEOUT_MS)
    try {
      child.stdin.on('error', () => {})
      child.stdin.end(input.toString('base64'))
    } catch {
      finish(new Error('dpapi stdin failed'))
    }
  })
}

/** Real Windows DPAPI CurrentUser protector. Values travel over stdin, not argv. */
export function createDpapiProtector({ platform = process.platform } = {}) {
  const available = platform === 'win32'
  return Object.freeze({
    available,
    algorithm: CLOUD_CREDENTIAL_ALGORITHM,
    async protect(value) {
      if (!available) throw new Error('dpapi unavailable')
      if (!Buffer.isBuffer(value) || value.length === 0 || value.length > MAX_SECRET_BYTES) throw new Error('invalid secret')
      const result = await runPowerShell(PROTECT_SCRIPT, value)
      if (!Buffer.isBuffer(result) || result.length === 0 || result.length > MAX_CIPHERTEXT_BYTES) throw new Error('invalid ciphertext')
      return result
    },
    async unprotect(value) {
      if (!available) throw new Error('dpapi unavailable')
      if (!Buffer.isBuffer(value) || value.length === 0 || value.length > MAX_CIPHERTEXT_BYTES) throw new Error('invalid ciphertext')
      const result = await runPowerShell(UNPROTECT_SCRIPT, value)
      if (!Buffer.isBuffer(result) || result.length === 0 || result.length > MAX_SECRET_BYTES) throw new Error('invalid secret')
      return result
    },
  })
}

function fileFor(namespaceDir, ref) {
  const digest = crypto.createHash('sha256').update(ref, 'utf8').digest('hex')
  return path.join(namespaceDir, `credential-${digest}.json`)
}

async function atomicWriteJson(target, value, hooks) {
  const directory = path.dirname(target)
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 })
  const temp = path.join(directory, `.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`)
  let handle = null
  let closed = false
  try {
    handle = await fsp.open(temp, 'wx', 0o600)
    await handle.writeFile(JSON.stringify(value) + '\n', 'utf8')
    await handle.sync()
    await handle.close()
    closed = true
    if (hooks && typeof hooks.beforeRename === 'function') await hooks.beforeRename(temp, target)
    await fsp.rename(temp, target)
    try { await fsp.chmod(target, 0o600) } catch {}
  } catch (error) {
    if (handle && !closed) { try { await handle.close() } catch {} }
    try { await fsp.unlink(temp) } catch {}
    throw error
  }
}

function parseEntry(text, ref) {
  if (typeof text !== 'string' || text.length > MAX_CIPHERTEXT_BYTES * 2) return null
  let entry
  try { entry = JSON.parse(text) } catch { return null }
  if (!isObject(entry)) return null
  for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) return null
  if (entry.schemaVersion !== CLOUD_CREDENTIAL_SCHEMA_VERSION) return null
  if (entry.ref !== ref) return null
  if (entry.algorithm !== CLOUD_CREDENTIAL_ALGORITHM) return null
  if (typeof entry.ciphertext !== 'string' || entry.ciphertext.length === 0 || !BASE64_PATTERN.test(entry.ciphertext)) return null
  if (typeof entry.createdAt !== 'string' || typeof entry.updatedAt !== 'string') return null
  const ciphertext = Buffer.from(entry.ciphertext, 'base64')
  if (ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT_BYTES) return null
  return { ...entry, ciphertextBytes: ciphertext }
}

/**
 * Open the one application-owned credential namespace below a trusted root. The caller supplies a
 * trusted application directory (never a browser/chat path); this module appends its fixed
 * namespace and only touches exact ref-derived files.
 */
export function openCredentialStore({
  rootDir,
  platform = process.platform,
  protector = null,
  now = () => new Date(),
  hooks = {},
} = {}) {
  if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) {
    return { ok: false, code: CLOUD_CREDENTIAL_ERRORS.NAMESPACE_INVALID }
  }
  const namespaceDir = path.join(rootDir, CLOUD_CREDENTIAL_NAMESPACE)
  const activeProtector = protector || (platform === 'win32' ? createDpapiProtector({ platform }) : null)
  const available = Boolean(activeProtector)
  const state = { available, platform, namespaceDir }
  const ensure = async () => {
    await fsp.mkdir(namespaceDir, { recursive: true, mode: 0o700 })
  }
  const unavailable = () => fail(CLOUD_CREDENTIAL_ERRORS.UNAVAILABLE)

  async function status() {
    return {
      ok: true,
      available,
      platform: platform === 'win32' ? 'windows' : platform,
      algorithm: available ? CLOUD_CREDENTIAL_ALGORITHM : null,
      namespace: CLOUD_CREDENTIAL_NAMESPACE,
      reason: available ? null : CLOUD_CREDENTIAL_ERRORS.UNAVAILABLE,
    }
  }

  async function has(ref) {
    if (!credentialRefValid(ref)) return fail(CLOUD_CREDENTIAL_ERRORS.REF_INVALID)
    if (!available) return unavailable()
    try {
      await ensure()
      const stat = await fsp.stat(fileFor(namespaceDir, ref))
      return { ok: true, present: stat.isFile() }
    } catch (error) {
      if (error && error.code === 'ENOENT') return { ok: true, present: false }
      return fail(CLOUD_CREDENTIAL_ERRORS.READ_FAILED)
    }
  }

  async function put(ref, secret) {
    if (!credentialRefValid(ref)) return fail(CLOUD_CREDENTIAL_ERRORS.REF_INVALID)
    if (typeof secret !== 'string' || secret.length === 0 || Buffer.byteLength(secret, 'utf8') > MAX_SECRET_BYTES || secret.includes('\u0000')) {
      return fail(CLOUD_CREDENTIAL_ERRORS.SECRET_INVALID)
    }
    if (!available) return unavailable()
    try {
      await ensure()
      const target = fileFor(namespaceDir, ref)
      let createdAt = now().toISOString()
      try {
        const existing = parseEntry(await fsp.readFile(target, 'utf8'), ref)
        if (existing && typeof existing.createdAt === 'string') createdAt = existing.createdAt
      } catch {}
      const ciphertext = await activeProtector.protect(Buffer.from(secret, 'utf8'))
      const updatedAt = now().toISOString()
      const entry = {
        schemaVersion: CLOUD_CREDENTIAL_SCHEMA_VERSION,
        ref,
        algorithm: CLOUD_CREDENTIAL_ALGORITHM,
        ciphertext: ciphertext.toString('base64'),
        createdAt,
        updatedAt,
      }
      await atomicWriteJson(target, entry, hooks)
      return { ok: true, ref, createdAt, updatedAt }
    } catch {
      return fail(CLOUD_CREDENTIAL_ERRORS.WRITE_FAILED)
    }
  }

  async function resolve(ref) {
    if (!credentialRefValid(ref)) return fail(CLOUD_CREDENTIAL_ERRORS.REF_INVALID)
    if (!available) return unavailable()
    let text
    try {
      await ensure()
      text = await fsp.readFile(fileFor(namespaceDir, ref), 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return fail(CLOUD_CREDENTIAL_ERRORS.NOT_FOUND)
      return fail(CLOUD_CREDENTIAL_ERRORS.READ_FAILED)
    }
    const entry = parseEntry(text, ref)
    if (!entry) return fail(CLOUD_CREDENTIAL_ERRORS.CORRUPT)
    try {
      const plain = await activeProtector.unprotect(entry.ciphertextBytes)
      if (!Buffer.isBuffer(plain) || plain.length === 0 || plain.length > MAX_SECRET_BYTES) return fail(CLOUD_CREDENTIAL_ERRORS.CORRUPT)
      return { ok: true, ref, secret: plain.toString('utf8') }
    } catch {
      return fail(CLOUD_CREDENTIAL_ERRORS.CORRUPT)
    }
  }

  async function remove(ref) {
    if (!credentialRefValid(ref)) return fail(CLOUD_CREDENTIAL_ERRORS.REF_INVALID)
    if (!available) return unavailable()
    try {
      await ensure()
      await fsp.unlink(fileFor(namespaceDir, ref))
      return { ok: true, ref, removed: true }
    } catch (error) {
      if (error && error.code === 'ENOENT') return fail(CLOUD_CREDENTIAL_ERRORS.NOT_FOUND)
      return fail(CLOUD_CREDENTIAL_ERRORS.WRITE_FAILED)
    }
  }

  return {
    ok: true,
    status,
    has,
    put,
    resolve,
    remove,
    platform: state.platform,
    available: state.available,
  }
}
