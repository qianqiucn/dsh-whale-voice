/* Whale Voice Core — isolated configuration write HTTP API.
 *
 * This is a test/development-only server. It is NOT imported by the production DSH Host
 * (`index.js`) and does not register any route on the production bridge. It requires a loopback
 * socket, a loopback Host, an explicit Origin on writes, a per-server token and a bounded JSON body.
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { isLoopbackAddress, loopbackHost, sameOrigin, tokenMatches } from './request-guards.mjs'

const DEFAULT_MAX_BODY_BYTES = 64 * 1024
const DEFAULT_BODY_TIMEOUT_MS = 2000
const MAX_CONCURRENT_WRITES = 1
const TOKEN_HEADER = 'x-whale-config-token'

function send(res, status, body) {
  if (res.writableEnded) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

function errorBody(code, message, extra = {}) {
  return { ok: false, error: { code, message, ...extra } }
}

function statusForError(code) {
  if (code === 'CONFIG_CONFLICT') return 409
  if (code === 'CONFIG_MISSING') return 404
  if (code === 'CONFIG_REVISION_REQUIRED' || code === 'CONFIG_REVISION_INVALID') return 400
  if (code === 'CONFIG_VALIDATION_FAILED' || code === 'CONFIG_INVALID' || code === 'CONFIG_SCHEMA_UNSUPPORTED' || code === 'CONFIG_SCHEMA_VERSION_INVALID') return 422
  if (code === 'CONFIG_PATH_ESCAPE' || code === 'CONFIG_UNSAFE_ROOT' || code === 'CONFIG_FILENAME_INVALID') return 403
  if (code === 'CONFIG_BODY_TOO_LARGE') return 413
  if (code === 'CONFIG_BODY_TIMEOUT') return 408
  if (code === 'CONFIG_BODY_INVALID') return 400
  if (code === 'CONFIG_WRITE_BUSY') return 429
  if (code === 'CONFIG_CORRUPT' || code === 'CONFIG_TOO_LARGE') return 503
  return 500
}

function readJsonBody(req, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_BODY_BYTES
  const timeoutMs = options.timeoutMs || DEFAULT_BODY_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    let size = 0
    let settled = false
    const chunks = []
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.removeListener('data', onData)
      req.removeListener('end', onEnd)
      req.removeListener('error', onError)
      req.removeListener('aborted', onAborted)
      if (error) reject(error)
      else resolve(Buffer.concat(chunks))
    }
    const onData = (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        finish(Object.assign(new Error('body too large'), { code: 'CONFIG_BODY_TOO_LARGE' }))
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => finish(null)
    const onError = () => finish(Object.assign(new Error('body stream error'), { code: 'CONFIG_BODY_INVALID' }))
    const onAborted = () => finish(Object.assign(new Error('body aborted'), { code: 'CONFIG_BODY_INVALID' }))
    const timer = setTimeout(() => {
      finish(Object.assign(new Error('body timeout'), { code: 'CONFIG_BODY_TIMEOUT' }))
    }, timeoutMs)
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('error', onError)
    req.once('aborted', onAborted)
  })
}

export function createIsolatedWriteServer(options = {}) {
  const store = options.store
  if (!store || typeof store.readPublic !== 'function' || typeof store.write !== 'function') {
    throw new Error('an isolated config store is required')
  }
  const token = options.token || randomBytes(32).toString('hex')
  const maxBodyBytes = options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES
  const bodyTimeoutMs = options.bodyTimeoutMs || DEFAULT_BODY_TIMEOUT_MS
  let activeWrites = 0

  function guard(req, method) {
    if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) return 403
    if (!loopbackHost(req)) return 403
    if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return 403
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname !== '/config') return 404
    if (method === 'POST') {
      if (!req.headers.origin || !sameOrigin(req)) return 403
    } else if (!sameOrigin(req)) {
      return 403
    }
    if (!tokenMatches(req.headers[TOKEN_HEADER], token)) return 401
    if (req.method !== method) return 405
    return null
  }

  const server = createServer(async (req, res) => {
    try {
      const method = req.method === 'GET' ? 'GET' : req.method === 'POST' ? 'POST' : null
      if (!method) {
        send(res, 405, errorBody('CONFIG_METHOD_NOT_ALLOWED', 'only GET and POST /config are available'))
        return
      }
      const rejected = guard(req, method)
      if (rejected) {
        send(res, rejected, errorBody(rejected === 404 ? 'CONFIG_NOT_FOUND' : rejected === 401 ? 'CONFIG_UNAUTHORIZED' : 'CONFIG_FORBIDDEN', 'request rejected'))
        return
      }

      if (method === 'GET') {
        const result = store.readPublic()
        if (!result.ok) {
          send(res, result.error.code === 'CONFIG_MISSING' ? 404 : 503, errorBody(result.error.code, 'configuration is not available'))
          return
        }
        send(res, 200, { ok: true, config: result.public })
        return
      }

      if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) {
        send(res, 415, errorBody('CONFIG_UNSUPPORTED_MEDIA_TYPE', 'application/json is required'))
        return
      }
      const declaredLength = Number(req.headers['content-length'])
      if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
        req.resume()
        send(res, 413, errorBody('CONFIG_BODY_TOO_LARGE', 'request body is too large'))
        return
      }

      let raw
      try {
        raw = await readJsonBody(req, { maxBytes: maxBodyBytes, timeoutMs: bodyTimeoutMs })
      } catch (error) {
        send(res, statusForError(error && error.code), errorBody(error && error.code || 'CONFIG_BODY_INVALID', 'request body rejected'))
        return
      }
      let payload
      try {
        payload = JSON.parse(raw.toString('utf8'))
      } catch {
        send(res, 400, errorBody('CONFIG_BODY_INVALID', 'request body is not valid JSON'))
        return
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        send(res, 400, errorBody('CONFIG_REQUEST_INVALID', 'request body must be an object'))
        return
      }
      const keys = Object.keys(payload)
      if (keys.some((key) => !['expectedRevision', 'config'].includes(key))) {
        send(res, 400, errorBody('CONFIG_REQUEST_INVALID', 'only expectedRevision and config are accepted'))
        return
      }
      if (typeof payload.expectedRevision !== 'string' || !payload.config || typeof payload.config !== 'object' || Array.isArray(payload.config)) {
        send(res, 400, errorBody('CONFIG_REQUEST_INVALID', 'expectedRevision and config are required'))
        return
      }
      if (activeWrites >= MAX_CONCURRENT_WRITES) {
        send(res, 429, errorBody('CONFIG_WRITE_BUSY', 'another isolated write is in progress'))
        return
      }
      activeWrites += 1
      let result
      try {
        result = await store.write({ expectedRevision: payload.expectedRevision, config: payload.config })
      } finally {
        activeWrites -= 1
      }
      if (!result.ok) {
        send(res, statusForError(result.error.code), errorBody(result.error.code, result.error.message, result.error.errors ? { errors: result.error.errors } : {}))
        return
      }
      send(res, 200, { ok: true, state: result.state, config: result.public })
    } catch {
      send(res, 500, errorBody('CONFIG_INTERNAL', 'internal error'))
    }
  })

  return {
    token,
    maxBodyBytes,
    bodyTimeoutMs,
    server,
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => resolve(server.address()))
      })
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

export const ISOLATED_WRITE_LIMITS = Object.freeze({
  maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  bodyTimeoutMs: DEFAULT_BODY_TIMEOUT_MS,
  maxConcurrentWrites: MAX_CONCURRENT_WRITES,
})
