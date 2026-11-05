/* Whale Voice Core — trusted isolated sandbox capability.
 *
 * A write store must not trust an arbitrary path string. Test/development entry points call
 * `createConfigSandbox()` to obtain an opaque, registered capability for a fresh directory under
 * the OS temporary root. `createConfigStore()` accepts only that capability, not a caller-supplied
 * path.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const TRUSTED = new WeakSet()
const MARKER_NAME = '.whale-voice-sandbox.json'
const MARKER_KIND = 'whale-voice-isolated-sandbox'
const MARKER_ID_PATTERN = /^[0-9a-f]{64}$/
const DEFAULT_PREFIX = 'whale-voice-sandbox-'
const PREFIX_PATTERN = /^[A-Za-z0-9._-]{1,32}$/

export function normalizePath(value) {
  const resolved = path.resolve(String(value || ''))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function isInside(parent, child) {
  const relative = path.relative(normalizePath(parent), normalizePath(child))
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

export function isTrustedSandbox(value) {
  return value !== null && typeof value === 'object' && TRUSTED.has(value)
}

export function createConfigSandbox(options = {}) {
  const prefix = typeof options.prefix === 'string' && PREFIX_PATTERN.test(options.prefix)
    ? options.prefix
    : DEFAULT_PREFIX
  const tempRoot = fs.realpathSync(os.tmpdir())
  const root = fs.mkdtempSync(path.join(tempRoot, prefix))
  const realRoot = fs.realpathSync(root)
  if (!isInside(tempRoot, realRoot)) {
    fs.rmSync(root, { recursive: true, force: true })
    throw new Error('sandbox root escaped the OS temporary root')
  }

  const id = randomBytes(32).toString('hex')
  const markerPath = path.join(realRoot, MARKER_NAME)
  try {
    fs.writeFileSync(markerPath, JSON.stringify({
      kind: MARKER_KIND,
      id,
      createdAt: new Date().toISOString(),
      pid: process.pid,
    }), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true })
    throw error
  }

  const stat = fs.lstatSync(realRoot)
  const sandbox = Object.freeze({
    root: realRoot,
    tempRoot,
    marker: markerPath,
    markerName: MARKER_NAME,
    id,
    dev: stat.dev,
    ino: stat.ino,
  })
  TRUSTED.add(sandbox)
  return sandbox
}

export function removeConfigSandbox(sandbox) {
  if (!isTrustedSandbox(sandbox)) throw new Error('untrusted sandbox')
  fs.rmSync(sandbox.root, { recursive: true, force: true })
}

/**
 * Open one explicit, persistent generation-data storage location.
 *
 * Unlike `createConfigSandbox()` this is not a fresh directory under the OS temporary root and Whale
 * Voice never removes it: the Host names the location in its runtime config, and opening the same
 * location again opens the same Task/Artifact store. The capability keeps the existing trusted-root
 * shape the stores already validate, with this location as its own boundary; the stored marker id is
 * reused because a stored Artifact pack is bound to it.
 */
export function openConfigStorage(options = {}) {
  const requested = options && typeof options === 'object' && !Array.isArray(options) ? options.root : null
  if (typeof requested !== 'string' || requested.trim() === '') throw new Error('storage root must be a non-empty path')
  if (!path.isAbsolute(requested)) throw new Error('storage root must be absolute')
  fs.mkdirSync(requested, { recursive: true })
  const realRoot = fs.realpathSync(requested)
  const rootStat = fs.lstatSync(realRoot)
  if (!rootStat.isDirectory()) throw new Error('storage root is not a directory')

  const markerPath = path.join(realRoot, MARKER_NAME)
  let markerStat = null
  try {
    markerStat = fs.lstatSync(markerPath)
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
  }

  let id
  if (markerStat !== null) {
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) throw new Error('storage marker is not a regular file')
    let marker
    try {
      marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    } catch {
      throw new Error('storage marker is invalid')
    }
    if (
      !marker ||
      typeof marker !== 'object' ||
      marker.kind !== MARKER_KIND ||
      typeof marker.id !== 'string' ||
      !MARKER_ID_PATTERN.test(marker.id)
    ) {
      throw new Error('storage marker is invalid')
    }
    id = marker.id
  } else {
    id = randomBytes(32).toString('hex')
    fs.writeFileSync(markerPath, JSON.stringify({
      kind: MARKER_KIND,
      id,
      createdAt: new Date().toISOString(),
      pid: process.pid,
    }), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  }

  const storage = Object.freeze({
    root: realRoot,
    tempRoot: realRoot,
    marker: markerPath,
    markerName: MARKER_NAME,
    id,
    dev: rootStat.dev,
    ino: rootStat.ino,
  })
  TRUSTED.add(storage)
  return storage
}

export const SANDBOX_MARKER_NAME = MARKER_NAME
