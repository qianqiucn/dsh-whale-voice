/* Minimal loopback Core for read-only setup detection.
 *
 * This is intentionally not an installer. It exposes only:
 *   GET /health
 *   GET /setup/status
 *   GET /setup/detect?component=wechatagent|sender|qwen
 *
 * The server is suitable for isolated tests and for the DSH host route. It refuses non-loopback
 * clients, cross-site requests, missing/wrong bearer tokens, writes and arbitrary component names.
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { createDetector, components } from './detect.mjs'
import { isLoopbackAddress, loopbackHost, sameOrigin, tokenMatches } from './request-guards.mjs'

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

export function createCoreServer(options = {}) {
  const token = options.token || randomBytes(32).toString('hex')
  const detector = options.detector || createDetector({
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  })
  const server = createServer(async (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) return send(res, 403, { ok: false, error: 'not_loopback' })
      if (!loopbackHost(req)) return send(res, 403, { ok: false, error: 'host_not_loopback' })
      if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return send(res, 403, { ok: false, error: 'cross_site' })
      if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'origin_mismatch' })
      if (!tokenMatches(req.headers['x-whale-core-token'], token)) return send(res, 401, { ok: false, error: 'unauthorized' })
      if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'read_only' })

      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname === '/health') {
        return send(res, 200, { ok: true, service: 'whale-voice-core', mode: 'read-only', schemaVersion: 1 })
      }
      if (url.pathname === '/setup/status') {
        return send(res, 200, await detector.detectAll())
      }
      if (url.pathname === '/setup/detect') {
        const component = url.searchParams.get('component') || ''
        if (!components.includes(component)) return send(res, 400, { ok: false, error: 'unsupported_component' })
        return send(res, 200, await detector.detectComponent(component))
      }
      return send(res, 404, { ok: false, error: 'not_found' })
    } catch (error) {
      return send(res, 500, { ok: false, error: 'internal_error' })
    }
  })
  return {
    token,
    server,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => resolve(server.address()))
      })
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

if (import.meta.url === new URL(process.argv[1] || '', 'file:').href) {
  const port = Number(process.env.WHALE_CORE_PORT || 0)
  const core = createCoreServer({ env: process.env, token: process.env.WHALE_CORE_TOKEN || undefined })
  core.listen(port).then((address) => {
    process.stdout.write(JSON.stringify({ ok: true, service: 'whale-voice-core', port: address.port, mode: 'read-only' }) + '\n')
  }).catch((error) => {
    process.stderr.write(JSON.stringify({ ok: false, error: String(error && error.message || error) }) + '\n')
    process.exitCode = 1
  })
}
