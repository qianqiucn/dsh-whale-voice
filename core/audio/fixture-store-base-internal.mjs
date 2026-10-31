/* Whale Voice — private shared Fixture store base (Plan 08-E-E-B, Step 1 of the merged contract).
 *
 * This module is the single home of the already verified, storage-agnostic helpers that the
 * catalog/owner Task store and the Artifact store both need: the neutral StoreFailure class and
 * its error helpers, pure object/hash/serialisation utilities, and the capability/marker plus
 * bounded-fd read primitives. It is internal implementation, never a public API or a generic file
 * service: there is no path, file name, budget, fs, validator or parse-callback parameter.
 *
 * The Task store re-exports the ten former shared bindings so existing consumers keep the exact
 * same binding (StoreFailure stays the only class). The Artifact store imports the same eight
 * helpers from here. This module deliberately does not import any store, owner, library, engine or
 * provider module, so it cannot create a dependency cycle.
 */

import fs from 'node:fs'
import crypto from 'node:crypto'

import { isInside, isTrustedSandbox, normalizePath } from '../config-sandbox.mjs'

const MAX_MARKER_BYTES = 4 * 1024
const READ_CHUNK = 64 * 1024
const MARKER_KIND = 'whale-voice-isolated-sandbox'

/** Internal failure carrying the neutral store key; each module maps it to its own code prefix. */
export class StoreFailure extends Error {
  constructor(key, errorPath) {
    super(key)
    this.key = key
    this.errorPath = errorPath
  }
}

export function storeReason(key) {
  return key.toLowerCase().replace(/_/g, ' ')
}

export function raiseStore(key, errorPath) {
  throw new StoreFailure(key, errorPath)
}

export function isStoreFailure(error) {
  return error instanceof StoreFailure
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function keySurface(object, allowed) {
  const keys = Reflect.ownKeys(object)
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) return 'unknown'
  }
  if (keys.length !== allowed.size) return 'count'
  return 'ok'
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map((item) => stableStringify(item)).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}'
}

/** Bounded fd read: never allocates or reads more than maxBytes+1. */
function readBoundedFd(fd, maxBytes, overflowKey) {
  const limit = maxBytes + 1
  const buffer = Buffer.allocUnsafe(READ_CHUNK)
  const chunks = []
  let total = 0
  while (total < limit) {
    const want = Math.min(buffer.length, limit - total)
    let read
    try {
      read = fs.readSync(fd, buffer, 0, want, total)
    } catch {
      raiseStore(overflowKey === 'RESOURCE_LIMIT' ? 'SANDBOX_INVALID' : overflowKey, '$')
    }
    if (!Number.isInteger(read) || read < 0 || read > want) {
      raiseStore(overflowKey === 'RESOURCE_LIMIT' ? 'SANDBOX_INVALID' : overflowKey, '$')
    }
    if (read === 0) break
    chunks.push(Buffer.from(buffer.subarray(0, read)))
    total += read
    if (total > maxBytes) raiseStore(overflowKey, '$')
  }
  return Buffer.concat(chunks, total)
}

export function sameIdentity(left, right) {
  if (!left || !right) return false
  if (!Number.isInteger(left.dev) || !Number.isInteger(left.ino)) return true
  return left.dev === right.dev && left.ino === right.ino
}

export function assertRegularStat(stat, failKey) {
  if (!stat.isFile() || stat.isSymbolicLink()) raiseStore(failKey, '$')
  if (typeof stat.nlink === 'number' && stat.nlink > 1) raiseStore(failKey, '$')
}

export function readBoundedPath(state, target, maxBytes, options) {
  const root = state.sandbox.root
  const failKey = options.failKey
  let pre
  try {
    pre = fs.lstatSync(target)
  } catch (error) {
    if (options.allowMissing && error && error.code === 'ENOENT') return { missing: true }
    raiseStore(failKey, '$')
  }
  assertRegularStat(pre, failKey)
  const real = fs.realpathSync(target)
  if (!isInside(root, real)) raiseStore(failKey, '$')

  let fd = null
  let failure = null
  let result = null
  try {
    fd = fs.openSync(target, 'r')
    const opened = fs.fstatSync(fd)
    assertRegularStat(opened, failKey)
    if (!sameIdentity(pre, opened)) raiseStore(failKey, '$')
    if (Number.isInteger(opened.size) && opened.size > maxBytes) raiseStore(options.sizeKey || failKey, '$')
    const bytes = readBoundedFd(fd, maxBytes, options.sizeKey || failKey)
    const ended = fs.fstatSync(fd)
    if (!sameIdentity(opened, ended) || ended.size !== bytes.length) raiseStore(failKey, '$')
    const after = fs.lstatSync(target)
    if (!sameIdentity(opened, after)) raiseStore(failKey, '$')
    result = {
      missing: false,
      bytes,
      digest: sha256(bytes),
      identity: { dev: opened.dev, ino: opened.ino },
    }
  } catch (error) {
    failure = error instanceof StoreFailure ? error : new StoreFailure(failKey, '$')
  }
  if (fd !== null) {
    const closing = fd
    fd = null
    try {
      fs.closeSync(closing)
    } catch {
      if (failure === null) failure = new StoreFailure(options.closeKey || failKey, '$')
    }
  }
  if (failure !== null) throw failure
  return result
}

export function checkSandbox(state) {
  const sandbox = state.sandbox
  if (!isTrustedSandbox(sandbox)) raiseStore('SANDBOX_INVALID', '$')

  let rootStat
  try {
    rootStat = fs.lstatSync(sandbox.root)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) raiseStore('SANDBOX_INVALID', '$')

  let realRoot
  try {
    realRoot = fs.realpathSync(sandbox.root)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (normalizePath(realRoot) !== normalizePath(sandbox.root)) raiseStore('SANDBOX_INVALID', '$')
  if (!isInside(sandbox.tempRoot, realRoot)) raiseStore('SANDBOX_INVALID', '$')
  if (
    Number.isInteger(sandbox.dev) &&
    Number.isInteger(sandbox.ino) &&
    (rootStat.dev !== sandbox.dev || rootStat.ino !== sandbox.ino)
  ) {
    raiseStore('SANDBOX_INVALID', '$')
  }

  let markerStat
  try {
    markerStat = fs.lstatSync(sandbox.marker)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) raiseStore('SANDBOX_INVALID', '$')
  const markerRead = readBoundedPath(state, sandbox.marker, MAX_MARKER_BYTES, {
    failKey: 'SANDBOX_INVALID',
    sizeKey: 'SANDBOX_INVALID',
    closeKey: 'SANDBOX_INVALID',
  })
  if (markerRead.missing) raiseStore('SANDBOX_INVALID', '$')
  const text = markerRead.bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(markerRead.bytes)) raiseStore('SANDBOX_INVALID', '$')
  let marker
  try {
    marker = JSON.parse(text)
  } catch {
    raiseStore('SANDBOX_INVALID', '$')
  }
  if (!isPlainObject(marker) || marker.kind !== MARKER_KIND || marker.id !== sandbox.id) {
    raiseStore('SANDBOX_INVALID', '$')
  }
  return realRoot
}

/** The original config-sandbox helpers, re-exported as the same bindings for the stores. */
export { normalizePath, isInside }
