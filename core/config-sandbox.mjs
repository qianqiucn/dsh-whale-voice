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
      kind: 'whale-voice-isolated-sandbox',
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

export const SANDBOX_MARKER_NAME = MARKER_NAME
