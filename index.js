import { randomBytes } from 'node:crypto'
import { createDetector, components } from './core/detect.mjs'
import { buildCapabilitySnapshot, buildCapabilityStatus } from './core/capabilities.mjs'
import { isLoopbackAddress, loopbackHost, sameOrigin, tokenMatches } from './core/request-guards.mjs'

const PREFIX = '/whale-voice/setup'

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

export function bridgeScript(token) {
  return `(() => {
  const coreToken = ${JSON.stringify(token)};
  const prefix = '/whale-voice/setup';
  async function call(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(prefix + path, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'application/json', 'x-whale-core-token': coreToken },
      });
      if (!response.ok) throw new Error('core_http_' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  const allowed = new Set(['wechatagent', 'sender', 'qwen']);
  window.__WHALE_SETUP__ = Object.freeze({
    version: '1',
    getStatus: () => call('/status'),
    getConfig: () => call('/config'),
    getConfigSources: () => call('/config/sources'),
    getConfigStatus: () => call('/config/status'),
    getCapabilities: () => call('/capabilities'),
    getCapabilityStatus: () => call('/capabilities/status'),
    detect: (component) => {
      const value = String(component || '');
      if (!allowed.has(value)) return Promise.reject(new Error('unsupported_component'));
      return call('/detect?component=' + encodeURIComponent(value));
    },
  });
})();`
}

function makeGuard(scope) {
  function currentConnection() {
    try { return typeof scope.get === 'function' ? scope.get('connection') : null } catch { return null }
  }
  return function guard(req) {
    if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) return 403
    if (!loopbackHost(req)) return 403
    if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return 403
    if (!sameOrigin(req)) return 403
    if (req.method !== 'GET') return 405
    const connection = currentConnection()
    if (!connection || typeof connection.requestRejection !== 'function') return 503
    try {
      const code = connection.requestRejection(req)
      if (code !== undefined && code !== null && code !== false) return typeof code === 'number' ? code : 403
    } catch {
      return 403
    }
    return null
  }
}

export function installHostBridge(scope, options = {}) {
  const token = options.token || randomBytes(32).toString('hex')
  const detector = options.detector || createDetector({ env: options.env || process.env, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs })
  const guard = makeGuard(scope)
  const disposers = []

  function route(pathname, handler) {
    const dispose = scope.webServer.register({
      kind: 'exact',
      path: pathname,
      handler: async (req, res) => {
        const rejected = guard(req)
        if (rejected) return send(res, rejected, { ok: false, error: rejected === 405 ? 'read_only' : 'forbidden' })
        if (!tokenMatches(req.headers['x-whale-core-token'], token)) return send(res, 401, { ok: false, error: 'unauthorized' })
        try {
          return await handler(req, res)
        } catch {
          return send(res, 500, { ok: false, error: 'internal_error' })
        }
      },
    })
    if (typeof dispose === 'function') disposers.push(dispose)
  }

  route(PREFIX + '/health', (req, res) => send(res, 200, { ok: true, service: 'whale-voice-core', mode: 'read-only', schemaVersion: 1 }))
  route(PREFIX + '/status', async (req, res) => send(res, 200, await detector.detectAll()))
  route(PREFIX + '/config', async (req, res) => send(res, 200, await detector.getConfigSnapshot()))
  route(PREFIX + '/config/sources', async (req, res) => send(res, 200, await detector.getConfigSources()))
  route(PREFIX + '/config/status', async (req, res) => send(res, 200, await detector.getConfigStatus()))
  route(PREFIX + '/capabilities', async (req, res) => {
    const detected = await detector.detectAll()
    return send(res, 200, buildCapabilitySnapshot({ detected }))
  })
  route(PREFIX + '/capabilities/status', async (req, res) => {
    const detected = await detector.detectAll()
    return send(res, 200, buildCapabilityStatus(buildCapabilitySnapshot({ detected })))
  })
  route(PREFIX + '/detect', async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const component = url.searchParams.get('component') || ''
    if (!components.includes(component)) return send(res, 400, { ok: false, error: 'unsupported_component' })
    return send(res, 200, await detector.detectComponent(component))
  })

  const script = bridgeScript(token)
  const offInject = typeof scope.on === 'function' ? scope.on('webserver/index-inject', (table) => {
    try {
      if (!Array.isArray(table)) return
      if (table.some((row) => row && row.kind === 'script' && String(row.text || '').includes('__WHALE_SETUP__'))) return
      table.push({ kind: 'script', placement: 'body', text: script })
    } catch {}
  }) : null
  if (typeof offInject === 'function') disposers.push(offInject)

  let tap = null
  try {
    if (scope.webServer && typeof scope.webServer.tapIndex === 'function') {
      tap = scope.webServer.tapIndex((html) => String(html || '').includes('__WHALE_SETUP__')
        ? html
        : String(html || '').replace('</body>', `<script data-whale-voice-setup>${script}</script></body>`))
    }
  } catch {}
  if (typeof tap === 'function') disposers.push(tap)

  return {
    token,
    detector,
    scripts: script,
    dispose() {
      for (const dispose of disposers.splice(0)) {
        try { dispose() } catch {}
      }
    },
  }
}

export function apply(ctx) {
  ctx.inject(['webServer', 'connection'], (scope) => {
    const host = installHostBridge(scope, { env: process.env })
    if (typeof scope.effect === 'function') scope.effect(() => () => host.dispose())
  })
}
