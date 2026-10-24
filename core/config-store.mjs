/* Whale Voice Core — isolated single-file configuration store.
 *
 * This store is intentionally separate from the read-only detector in `config.mjs` and is never
 * registered on the production DSH Host. It writes only one fixed file inside an explicitly supplied
 * isolated root. It does not follow paths, URLs or commands from an HTTP request.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'
import { isInside, isTrustedSandbox, normalizePath } from './config-sandbox.mjs'
import {
  CONFIG_SCHEMA_VERSION,
  CONFIG_STATES,
  canonicalize,
  migrateConfig,
  toPublicConfig,
  validateConfig,
} from './config-schema.mjs'

const DEFAULT_FILE_NAME = 'config.json'
const DEFAULT_MAX_BYTES = 512 * 1024
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const REVISION_PATTERN = /^[a-f0-9]{32}$/
const REVISION_KEY = randomBytes(32)
const TEMP_PATTERN = /^\.[A-Za-z0-9._-]+\.[a-f0-9]{16}\.tmp$/
const DOMAIN = 'whale-voice-isolated-config-v1'

export class ConfigStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ConfigStoreError'
    this.code = code
    this.details = details
  }
}

function errorResult(code, state, message, extra = {}) {
  return {
    ok: false,
    state,
    error: { code, message, ...extra },
  }
}

function collectForbiddenRoots(envs) {
  const roots = new Set()
  for (const env of envs) {
    if (!env) continue
    const dshHome = env.DSH_HOME
      ? path.resolve(String(env.DSH_HOME))
      : path.resolve(os.homedir(), '.dsh')
    roots.add(path.resolve(dshHome, 'whale-voice'))
    if (env.WHALE_WECHATAGENT_HOME) roots.add(path.resolve(String(env.WHALE_WECHATAGENT_HOME)))
    if (env.WHALE_VOICE_SENDER_HOME) roots.add(path.resolve(String(env.WHALE_VOICE_SENDER_HOME)))
  }
  return [...roots]
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mapFsError(error) {
  const code = error && error.code
  if (code === 'EACCES' || code === 'EPERM') return 'CONFIG_PERMISSION_DENIED'
  if (code === 'ENOENT') return 'CONFIG_MISSING'
  if (code === 'ENOSPC') return 'CONFIG_NO_SPACE'
  return 'CONFIG_SAVE_FAILED'
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString()
  if (typeof now === 'function') return new Date(now()).toISOString()
  return new Date().toISOString()
}

export function createConfigStore(options = {}) {
  return new ConfigStore(options)
}

export class ConfigStore {
  constructor(options = {}) {
    if (options.fileName !== undefined && (typeof options.fileName !== 'string' || !FILE_NAME_PATTERN.test(options.fileName))) {
      throw new ConfigStoreError('CONFIG_FILENAME_INVALID', 'invalid fixed configuration file name')
    }
    if (options.revisionKey !== undefined && (!Buffer.isBuffer(options.revisionKey) || options.revisionKey.length < 16)) {
      throw new ConfigStoreError('CONFIG_REVISION_KEY_INVALID', 'revision key must be a Buffer of at least 16 bytes')
    }

    this.fs = options.fsImpl || fs
    this.env = options.env || process.env
    this.now = options.now || (() => new Date())
    this.maxBytes = options.maxBytes || DEFAULT_MAX_BYTES
    this.fileName = options.fileName || DEFAULT_FILE_NAME
    this.revisionKey = options.revisionKey || REVISION_KEY
    this._queue = Promise.resolve()
    this.forbiddenRoots = collectForbiddenRoots([process.env, options.env])
    this.sandbox = options.sandbox

    if (!this.sandbox) {
      if (options.root && typeof options.root === 'string') {
        this._rejectUntrustedRoot(options.root)
      }
      throw new ConfigStoreError('CONFIG_SANDBOX_REQUIRED', 'an approved isolated sandbox capability is required')
    }
    if (!isTrustedSandbox(this.sandbox)) {
      throw new ConfigStoreError('CONFIG_SANDBOX_REQUIRED', 'sandbox capability is not trusted')
    }
    if (options.root !== undefined) {
      throw new ConfigStoreError('CONFIG_SANDBOX_CONFLICT', 'do not supply root together with a trusted sandbox')
    }

    this.root = this.sandbox.root
    this.target = path.join(this.root, this.fileName)
    if (path.dirname(this.target) !== this.root) {
      throw new ConfigStoreError('CONFIG_FILENAME_INVALID', 'configuration file must be directly inside the isolated root')
    }
    this._assertSandbox()
    this._assertTargetSafe()
  }

  _rejectUntrustedRoot(root) {
    let stat
    try {
      stat = this.fs.lstatSync(path.resolve(root))
    } catch {
      throw new ConfigStoreError('CONFIG_UNSAFE_ROOT', 'untrusted root must not be used')
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new ConfigStoreError('CONFIG_UNSAFE_ROOT', 'untrusted root must not be a symlink or junction')
    }
    let realRoot
    try {
      realRoot = this.fs.realpathSync(path.resolve(root))
    } catch {
      throw new ConfigStoreError('CONFIG_UNSAFE_ROOT', 'untrusted root could not be resolved')
    }
    if (this._overlapsForbidden(realRoot)) {
      throw new ConfigStoreError('CONFIG_UNSAFE_ROOT', 'production or dependency directory is not an isolated write target')
    }
  }

  _overlapsForbidden(candidate) {
    for (const root of this.forbiddenRoots) {
      if (isInside(candidate, root) || isInside(root, candidate)) return true
    }
    return false
  }

  _assertSandbox() {
    if (!isTrustedSandbox(this.sandbox)) {
      throw new ConfigStoreError('CONFIG_SANDBOX_REQUIRED', 'sandbox capability is not trusted')
    }
    const sandbox = this.sandbox
    let stat
    try {
      stat = this.fs.lstatSync(sandbox.root)
    } catch {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox root is not available')
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox root must not be a symlink or junction')
    }
    let realRoot
    try {
      realRoot = this.fs.realpathSync(sandbox.root)
    } catch {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox root could not be resolved')
    }
    if (normalizePath(realRoot) !== normalizePath(sandbox.root)) {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox root was redirected')
    }
    if (!isInside(sandbox.tempRoot, sandbox.root)) {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox root is outside the temporary root')
    }
    if (sandbox.ino && stat.ino && stat.ino !== sandbox.ino) {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox root identity changed')
    }
    let markerStat
    try {
      markerStat = this.fs.lstatSync(sandbox.marker)
    } catch {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox marker is missing')
    }
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox marker must be a regular file')
    }
    let realMarker
    try {
      realMarker = this.fs.realpathSync(sandbox.marker)
    } catch {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox marker could not be resolved')
    }
    if (!isInside(sandbox.root, realMarker)) {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox marker escapes the root')
    }
    let marker
    try {
      marker = JSON.parse(this.fs.readFileSync(sandbox.marker, 'utf8'))
    } catch {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox marker is not valid JSON')
    }
    if (!marker || marker.kind !== 'whale-voice-isolated-sandbox' || marker.id !== sandbox.id) {
      throw new ConfigStoreError('CONFIG_SANDBOX_INVALID', 'sandbox marker does not match the capability')
    }
    if (this._overlapsForbidden(sandbox.root)) {
      throw new ConfigStoreError('CONFIG_UNSAFE_ROOT', 'sandbox overlaps a production or dependency directory')
    }
  }

  _assertTargetSafe() {
    this._assertSandbox()
    let stat
    try {
      stat = this.fs.lstatSync(this.target)
    } catch (error) {
      if (error && error.code === 'ENOENT') return
      throw new ConfigStoreError(mapFsError(error), 'cannot inspect isolated configuration file')
    }
    if (stat.isSymbolicLink()) {
      throw new ConfigStoreError('CONFIG_PATH_ESCAPE', 'configuration file must not be a symlink or junction')
    }
    if (!stat.isFile()) {
      throw new ConfigStoreError('CONFIG_PATH_ESCAPE', 'configuration target is not a regular file')
    }
    let realTarget
    try {
      realTarget = this.fs.realpathSync(this.target)
    } catch {
      throw new ConfigStoreError('CONFIG_PATH_ESCAPE', 'cannot resolve configuration target')
    }
    if (!isInside(this.root, realTarget)) {
      throw new ConfigStoreError('CONFIG_PATH_ESCAPE', 'configuration target escapes the isolated root')
    }
  }

  _snapshot() {
    this._assertTargetSafe()
    let stat
    try {
      stat = this.fs.lstatSync(this.target)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new ConfigStoreError('CONFIG_MISSING', 'isolated configuration file does not exist')
      }
      throw new ConfigStoreError(mapFsError(error), 'cannot inspect isolated configuration file')
    }
    if (!stat.isFile()) throw new ConfigStoreError('CONFIG_CORRUPT', 'configuration target is not a regular file')
    if (stat.size > this.maxBytes) throw new ConfigStoreError('CONFIG_TOO_LARGE', 'configuration file is too large')

    let raw
    try {
      raw = this.fs.readFileSync(this.target)
    } catch (error) {
      throw new ConfigStoreError(mapFsError(error), 'cannot read isolated configuration file')
    }
    if (raw.length > this.maxBytes) throw new ConfigStoreError('CONFIG_TOO_LARGE', 'configuration file is too large')
    let parsed
    try {
      parsed = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
    } catch {
      throw new ConfigStoreError('CONFIG_CORRUPT', 'configuration file is not valid JSON')
    }
    const migration = migrateConfig(parsed)
    if (!migration.ok) {
      const code = migration.errors.some((item) => item.code === 'CONFIG_SCHEMA_UNSUPPORTED')
        ? 'CONFIG_SCHEMA_UNSUPPORTED'
        : 'CONFIG_INVALID'
      throw new ConfigStoreError(code, 'configuration failed schema or migration validation', { errors: migration.errors })
    }
    return {
      raw,
      config: migration.config,
      migrated: migration.migrated === true,
      fromSchemaVersion: migration.fromSchemaVersion,
      revision: this._revision(migration.config),
      bytes: raw.length,
    }
  }

  _revision(config) {
    const material = JSON.stringify(canonicalize({ schemaVersion: CONFIG_SCHEMA_VERSION, config }))
    return createHmac('sha256', this.revisionKey)
      .update(DOMAIN + '\0')
      .update(material)
      .digest('hex')
      .slice(0, 32)
  }

  read() {
    try {
      const snapshot = this._snapshot()
      return {
        ok: true,
        state: CONFIG_STATES.UNCHANGED,
        config: snapshot.config,
        revision: snapshot.revision,
        schemaVersion: CONFIG_SCHEMA_VERSION,
        migrated: snapshot.migrated,
        fromSchemaVersion: snapshot.fromSchemaVersion,
        observedAt: nowIso(this.now),
        bytes: snapshot.bytes,
      }
    } catch (error) {
      if (error instanceof ConfigStoreError) {
        const state = error.code === 'CONFIG_MISSING' ? CONFIG_STATES.UNKNOWN : CONFIG_STATES.FAILED
        return errorResult(error.code, state, error.message, error.details)
      }
      return errorResult('CONFIG_READ_FAILED', CONFIG_STATES.FAILED, 'configuration could not be read')
    }
  }

  readPublic() {
    const result = this.read()
    if (!result.ok) return result
    return {
      ok: true,
      state: result.state,
      public: toPublicConfig(result.config, {
        revision: result.revision,
        state: result.state,
        observedAt: result.observedAt,
        migrated: result.migrated,
        fromSchemaVersion: result.fromSchemaVersion,
      }),
    }
  }

  write({ expectedRevision, config } = {}) {
    if (typeof expectedRevision !== 'string' || expectedRevision.length === 0) {
      return errorResult('CONFIG_REVISION_REQUIRED', CONFIG_STATES.FAILED, 'expectedRevision is required')
    }
    if (!REVISION_PATTERN.test(expectedRevision)) {
      return errorResult('CONFIG_REVISION_INVALID', CONFIG_STATES.FAILED, 'expectedRevision must be an opaque 32-hex revision')
    }
    const validation = validateConfig(config)
    if (!validation.ok) {
      return errorResult('CONFIG_VALIDATION_FAILED', CONFIG_STATES.FAILED, 'configuration failed schema validation', { errors: validation.errors })
    }

    return this._withLock(async () => {
      let before
      try {
        before = this._snapshot()
      } catch (error) {
        if (error instanceof ConfigStoreError) {
          return errorResult(error.code, CONFIG_STATES.FAILED, error.message, error.details)
        }
        return errorResult('CONFIG_READ_FAILED', CONFIG_STATES.FAILED, 'configuration could not be read')
      }
      if (before.revision !== expectedRevision) {
        return errorResult('CONFIG_CONFLICT', CONFIG_STATES.CONFLICT, 'expectedRevision does not match the current saved configuration')
      }

      const nextRevision = this._revision(validation.config)
      if (nextRevision === before.revision && !before.migrated) {
        let unchangedCheck
        try {
          unchangedCheck = this._snapshot()
        } catch (error) {
          if (error instanceof ConfigStoreError) {
            return errorResult(error.code, CONFIG_STATES.FAILED, error.message, error.details)
          }
          return errorResult('CONFIG_READ_FAILED', CONFIG_STATES.FAILED, 'configuration could not be re-read')
        }
        if (unchangedCheck.revision !== before.revision) {
          return errorResult('CONFIG_CONFLICT', CONFIG_STATES.CONFLICT, 'configuration changed before the no-op check')
        }
        return {
          ok: true,
          state: CONFIG_STATES.UNCHANGED,
          changed: false,
          previousRevision: before.revision,
          revision: nextRevision,
          savedAt: null,
          public: toPublicConfig(validation.config, {
            revision: nextRevision,
            state: CONFIG_STATES.UNCHANGED,
            observedAt: nowIso(this.now),
            migrated: false,
            fromSchemaVersion: CONFIG_SCHEMA_VERSION,
          }),
        }
      }

      // Re-read after validation and immediately before writing. This narrows the external-writer
      // race but cannot provide cross-process compare-and-swap; see CONFIG_WRITE_API.md.
      let current
      try {
        current = this._snapshot()
      } catch (error) {
        if (error instanceof ConfigStoreError) {
          return errorResult(error.code, CONFIG_STATES.FAILED, error.message, error.details)
        }
        return errorResult('CONFIG_READ_FAILED', CONFIG_STATES.FAILED, 'configuration could not be read')
      }
      if (current.revision !== before.revision) {
        return errorResult('CONFIG_CONFLICT', CONFIG_STATES.CONFLICT, 'configuration changed while preparing the write')
      }

      const serialized = Buffer.from(JSON.stringify(validation.config, null, 2) + '\n', 'utf8')
      const tempPath = path.join(this.root, '.' + this.fileName + '.' + randomBytes(8).toString('hex') + '.tmp')
      let renameAttempted = false
      try {
        this._writeTemp(tempPath, serialized)

        // Final optimistic check: a cooperating writer must have used the same revision, and an
        // external writer that changed the file is detected here. A non-cooperating writer can still
        // race the rename; that limitation is documented and tested as such.
        let finalCheck
        try {
          finalCheck = this._snapshot()
        } catch (error) {
          this._cleanupTemp(tempPath)
          if (error instanceof ConfigStoreError) {
            return errorResult(error.code, CONFIG_STATES.FAILED, error.message, error.details)
          }
          return errorResult('CONFIG_READ_FAILED', CONFIG_STATES.FAILED, 'configuration could not be re-read')
        }
        if (finalCheck.revision !== before.revision) {
          this._cleanupTemp(tempPath)
          return errorResult('CONFIG_CONFLICT', CONFIG_STATES.CONFLICT, 'configuration changed before commit')
        }

        this._assertTargetSafe()
        try {
          this.fs.renameSync(tempPath, this.target)
          renameAttempted = true
        } catch (error) {
          this._cleanupTemp(tempPath)
          const code = error && (error.code === 'EACCES' || error.code === 'EPERM')
            ? 'CONFIG_PERMISSION_DENIED'
            : 'CONFIG_REPLACE_FAILED'
          return errorResult(code, CONFIG_STATES.FAILED, 'atomic replace could not be completed')
        }
        this._syncDirectory()

        let verified
        try {
          verified = this._snapshot()
        } catch {
          verified = null
        }
        if (!verified || verified.revision !== nextRevision) {
          const rolledBack = this._rollback(before.raw, before.revision)
          return errorResult(
            rolledBack ? 'CONFIG_VERIFY_FAILED' : 'CONFIG_ROLLBACK_FAILED',
            CONFIG_STATES.FAILED,
            rolledBack
              ? 'saved configuration failed verification and the previous content was restored'
              : 'saved configuration failed verification and rollback could not be confirmed',
            { rolledBack }
          )
        }

        return {
          ok: true,
          state: CONFIG_STATES.SAVED,
          changed: true,
          previousRevision: before.revision,
          revision: nextRevision,
          savedAt: nowIso(this.now),
          public: toPublicConfig(validation.config, {
            revision: nextRevision,
            state: CONFIG_STATES.SAVED,
            observedAt: nowIso(this.now),
            migrated: false,
            fromSchemaVersion: CONFIG_SCHEMA_VERSION,
          }),
        }
      } catch (error) {
        this._cleanupTemp(tempPath)
        if (renameAttempted) {
          const rolledBack = this._rollback(before.raw, before.revision)
          return errorResult(
            rolledBack ? 'CONFIG_VERIFY_FAILED' : 'CONFIG_ROLLBACK_FAILED',
            CONFIG_STATES.FAILED,
            rolledBack ? 'write failed after replacement and the previous content was restored' : 'write failed after replacement and rollback could not be confirmed',
            { rolledBack }
          )
        }
        if (error instanceof ConfigStoreError) {
          return errorResult(error.code, CONFIG_STATES.FAILED, error.message, error.details)
        }
        return errorResult(mapFsError(error), CONFIG_STATES.FAILED, 'configuration could not be saved')
      } finally {
        this._cleanupTemp(tempPath)
      }
    })
  }

  _writeTemp(tempPath, raw) {
    let fd = null
    try {
      fd = this.fs.openSync(tempPath, 'wx', 0o600)
      const written = this.fs.writeSync(fd, raw, 0, raw.length, 0)
      if (written !== raw.length) throw new ConfigStoreError('CONFIG_SAVE_FAILED', 'temporary configuration write was incomplete')
      this.fs.fsyncSync(fd)
    } catch (error) {
      if (error instanceof ConfigStoreError) throw error
      throw new ConfigStoreError(mapFsError(error), 'temporary configuration write failed')
    } finally {
      if (fd !== null) {
        try { this.fs.closeSync(fd) } catch {}
      }
    }
  }

  _cleanupTemp(tempPath) {
    try {
      this.fs.unlinkSync(tempPath)
    } catch {}
  }

  _syncDirectory() {
    let fd = null
    try {
      fd = this.fs.openSync(this.root, 'r')
      this.fs.fsyncSync(fd)
    } catch {
      // Directory fsync is not portable on Windows. File data was already fsynced; a failed
      // directory sync does not make the rename unsafe.
    } finally {
      if (fd !== null) {
        try { this.fs.closeSync(fd) } catch {}
      }
    }
  }

  _rollback(previousRaw, expectedRevision) {
    const tempPath = path.join(this.root, '.' + this.fileName + '.' + randomBytes(8).toString('hex') + '.tmp')
    try {
      this._writeTemp(tempPath, previousRaw)
      this._assertTargetSafe()
      this.fs.renameSync(tempPath, this.target)
      this._syncDirectory()
      const check = this._snapshot()
      return check.revision === expectedRevision
    } catch {
      this._cleanupTemp(tempPath)
      return false
    }
  }

  cleanupTempFiles() {
    let removed = 0
    let names
    try {
      names = this.fs.readdirSync(this.root, { withFileTypes: true })
    } catch {
      return removed
    }
    const pattern = new RegExp('^\\.' + escapeRegExp(this.fileName) + '\\.[a-f0-9]{16}\\.tmp$')
    for (const entry of names) {
      if (!entry.isFile() || !pattern.test(entry.name) || !TEMP_PATTERN.test(entry.name)) continue
      try {
        this.fs.unlinkSync(path.join(this.root, entry.name))
        removed += 1
      } catch {}
    }
    return removed
  }

  _withLock(fn) {
    const run = this._queue.then(fn, fn)
    this._queue = run.then(() => {}, () => {})
    return run
  }
}
