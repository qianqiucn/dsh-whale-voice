import { mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

export function readJsonFile(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

export function appendLog(path, line) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    /* logging must never break the request path */
  }
}

export function nowIso() {
  return new Date().toISOString()
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** True when `child` resolves inside `parent` (guards against traversal). */
export function isInside(child, parent) {
  const c = resolve(child)
  const p = resolve(parent)
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep)
}

export function assert(cond, message) {
  if (!cond) throw new HttpError(400, message)
}

export class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message)
    this.status = status
    this.code = code || message
  }
}

export function summarizeError(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  const msg = err.message ?? String(err)
  return msg.length > 500 ? `${msg.slice(0, 500)}…` : msg
}

export function exists(path) {
  return existsSync(path)
}
