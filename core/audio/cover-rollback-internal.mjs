/**
 * Cover v3 rollback — the explicit, checked way back from the same-file v3 integration (contract §15.1).
 *
 * Phase A of the migration writes the Cover v3 snapshot to the legacy catalog/owner filenames only
 * when those files did not exist. An old program fails closed on such a file, so the offline rollback
 * restores the pre-integration layout by moving that snapshot to the dedicated v3 files it originally
 * used. Legacy v1/v2 files are never rewritten, truncated or deleted; a snapshot that mixes legacy
 * entries with Cover entries is refused because moving it would silently drop legacy data.
 *
 * Pure planning (`planCoverV3Rollback`) and explicit application (`applyCoverV3Rollback`); no public
 * route, no generic path parameter and no directory scanning.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  COVER_CATALOG_FILE,
  COVER_OWNER_FILE,
  COVER_STORE_MAX_BYTES,
  COVER_STORE_SCHEMA_VERSION,
  LEGACY_CATALOG_FILE,
  LEGACY_OWNER_FILE,
} from './cover-store-internal.mjs'
import { StoreFailure, checkSandbox, isPlainObject } from './fixture-store-base-internal.mjs'

export const COVER_ROLLBACK_SCHEMA_VERSION = 1

export const COVER_ROLLBACK_CODES = Object.freeze({
  INPUT_INVALID: 'COVER_ROLLBACK_INPUT_INVALID',
  SANDBOX_INVALID: 'COVER_ROLLBACK_SANDBOX_INVALID',
  STORE_INVALID: 'COVER_ROLLBACK_STORE_INVALID',
  RESOURCE_LIMIT: 'COVER_ROLLBACK_RESOURCE_LIMIT',
  TARGET_EXISTS: 'COVER_ROLLBACK_TARGET_EXISTS',
  LEGACY_DATA: 'COVER_ROLLBACK_LEGACY_DATA',
  WRITE_REJECTED: 'COVER_ROLLBACK_WRITE_REJECTED',
})

const KINDS = Object.freeze([
  { kind: 'catalog', legacy: LEGACY_CATALOG_FILE, dedicated: COVER_CATALOG_FILE },
  { kind: 'owner', legacy: LEGACY_OWNER_FILE, dedicated: COVER_OWNER_FILE },
])

function failure(key, errorPath) {
  return Object.freeze({
    ok: false,
    errors: Object.freeze([Object.freeze({ code: COVER_ROLLBACK_CODES[key], path: errorPath || '$', reason: key.toLowerCase().replace(/_/g, ' ') })]),
  })
}

function exists(target) {
  try {
    return fs.lstatSync(target).isFile()
  } catch {
    return false
  }
}

function inspectKind(sandbox, entry) {
  const legacyPath = path.join(sandbox.root, entry.legacy)
  const dedicatedPath = path.join(sandbox.root, entry.dedicated)
  if (!exists(legacyPath)) return { state: 'ABSENT', kind: entry.kind }
  const stat = fs.lstatSync(legacyPath)
  if (!stat.isFile() || stat.isSymbolicLink()) return { state: 'INVALID' }
  if (stat.size > COVER_STORE_MAX_BYTES) return { state: 'OVERSIZE' }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
  } catch {
    return { state: 'INVALID' }
  }
  if (!isPlainObject(parsed) || parsed.schemaVersion !== COVER_STORE_SCHEMA_VERSION) {
    // A legacy v1/v2 snapshot is exactly the pre-integration state: nothing to move and nothing to touch.
    return { state: 'LEGACY', kind: entry.kind }
  }
  if (!Array.isArray(parsed.entries)) return { state: 'INVALID' }
  for (const item of parsed.entries) {
    if (!isPlainObject(item) || item.kind !== 'COVER') return { state: 'MIXED' }
  }
  if (exists(dedicatedPath)) return { state: 'TARGET_EXISTS' }
  return {
    state: 'COVER_V3',
    kind: entry.kind,
    from: entry.legacy,
    to: entry.dedicated,
    entries: parsed.entries.length,
    bytes: stat.size,
  }
}

/** Plan the rollback without writing anything. */
export function planCoverV3Rollback({ sandbox } = {}) {
  try {
    checkSandbox({ sandbox })
  } catch (error) {
    return failure(error instanceof StoreFailure && error.key === 'SANDBOX_INVALID' ? 'SANDBOX_INVALID' : 'INPUT_INVALID')
  }
  const moves = []
  const untouched = []
  for (const entry of KINDS) {
    let inspected
    try {
      inspected = inspectKind(sandbox, entry)
    } catch {
      return failure('STORE_INVALID', entry.kind)
    }
    if (inspected.state === 'INVALID' || inspected.state === 'OVERSIZE') {
      return failure(inspected.state === 'OVERSIZE' ? 'RESOURCE_LIMIT' : 'STORE_INVALID', entry.kind)
    }
    if (inspected.state === 'MIXED') return failure('LEGACY_DATA', entry.kind)
    if (inspected.state === 'TARGET_EXISTS') return failure('TARGET_EXISTS', entry.kind)
    if (inspected.state === 'COVER_V3') moves.push({ kind: inspected.kind, from: inspected.from, to: inspected.to, entries: inspected.entries, bytes: inspected.bytes })
    else if (inspected.state === 'LEGACY') untouched.push({ kind: inspected.kind, reason: 'legacy_v1_or_v2_untouched' })
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: COVER_ROLLBACK_SCHEMA_VERSION,
      moves: Object.freeze(moves.map((move) => Object.freeze(move))),
      untouched: Object.freeze(untouched.map((item) => Object.freeze(item))),
    }),
  })
}

/**
 * Apply the planned moves. A failure restores the files already moved, so the sandbox is never left
 * half-rolled-back; the returned error is the exact first failure.
 */
export function applyCoverV3Rollback({ sandbox } = {}) {
  const planned = planCoverV3Rollback({ sandbox })
  if (!planned.ok) return planned
  const done = []
  for (const move of planned.value.moves) {
    const from = path.join(sandbox.root, move.from)
    const to = path.join(sandbox.root, move.to)
    let before
    try {
      before = fs.readFileSync(from)
    } catch {
      for (const applied of done.reverse()) {
        try {
          fs.renameSync(path.join(sandbox.root, applied.to), path.join(sandbox.root, applied.from))
        } catch {}
      }
      return failure('WRITE_REJECTED', move.kind)
    }
    if (exists(to)) {
      for (const applied of done.reverse()) {
        try {
          fs.renameSync(path.join(sandbox.root, applied.to), path.join(sandbox.root, applied.from))
        } catch {}
      }
      return failure('TARGET_EXISTS', move.kind)
    }
    try {
      fs.renameSync(from, to)
    } catch {
      for (const applied of done.reverse()) {
        try {
          fs.renameSync(path.join(sandbox.root, applied.to), path.join(sandbox.root, applied.from))
        } catch {}
      }
      return failure('WRITE_REJECTED', move.kind)
    }
    let after
    try {
      after = fs.readFileSync(to)
    } catch {
      after = null
    }
    if (!after || !after.equals(before) || exists(from)) {
      for (const applied of [...done, move].reverse()) {
        try {
          fs.renameSync(path.join(sandbox.root, applied.to), path.join(sandbox.root, applied.from))
        } catch {}
      }
      return failure('WRITE_REJECTED', move.kind)
    }
    done.push(move)
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: COVER_ROLLBACK_SCHEMA_VERSION,
      applied: done.length,
      moves: Object.freeze(done.map((move) => Object.freeze({ kind: move.kind, from: move.from, to: move.to, entries: move.entries, bytes: move.bytes }))),
      untouched: planned.value.untouched,
    }),
  })
}
