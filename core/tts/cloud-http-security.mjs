/* Whale Voice — bounded cloud HTTP target validation and transport (Plan11, offline unit).
 *
 * One shared secure path for the Azure and custom providers:
 * - HTTPS always; HTTP only an explicit numeric loopback address;
 * - no userinfo/query/fragment and no redirect following;
 * - every DNS answer must be public; the verified address is pinned into the connection lookup so
 *   a second resolution cannot rebind the socket;
 * - IPv4-mapped IPv6 and ambiguous numeric host forms are rejected;
 * - response headers/body and total time are bounded while streaming, not after buffering;
 * - abort destroys the request/response and never retries.
 *
 * Tests inject dnsLookup/requestImpl or use a local loopback HTTP fixture. No real vendor call is
 * made by this module unless its caller explicitly enables the network gate.
 */

import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

export const CLOUD_HTTP_ERRORS = Object.freeze({
  TARGET_INVALID: 'CLOUD_TARGET_INVALID',
  TARGET_SCHEME: 'CLOUD_TARGET_SCHEME',
  TARGET_CREDENTIALS: 'CLOUD_TARGET_CREDENTIALS',
  TARGET_LOOPBACK_ONLY: 'CLOUD_TARGET_LOOPBACK_ONLY',
  TARGET_PRIVATE: 'CLOUD_TARGET_PRIVATE',
  TARGET_DNS_FAILED: 'CLOUD_TARGET_DNS_FAILED',
  TARGET_DNS_EMPTY: 'CLOUD_TARGET_DNS_EMPTY',
  TARGET_AMBIGUOUS: 'CLOUD_TARGET_AMBIGUOUS',
  REDIRECT_REJECTED: 'CLOUD_REDIRECT_REJECTED',
  HTTP_STATUS: 'CLOUD_HTTP_STATUS',
  CONTENT_TYPE: 'CLOUD_CONTENT_TYPE',
  RESPONSE_TOO_LARGE: 'CLOUD_RESPONSE_TOO_LARGE',
  HEADER_LIMIT: 'CLOUD_HEADER_LIMIT',
  TIMEOUT: 'CLOUD_TIMEOUT',
  CANCELLED: 'CLOUD_CANCELLED',
  NETWORK_ERROR: 'CLOUD_NETWORK_ERROR',
  INVALID_REQUEST: 'CLOUD_INVALID_REQUEST',
})

export const CLOUD_HTTP_LIMITS = Object.freeze({
  maxResponseBytes: 8 * 1024 * 1024,
  maxHeaderBytes: 16384,
  maxHeaderCount: 64,
  maxTimeoutMs: 60000,
  minTimeoutMs: 1000,
})

const LOOPBACK_V4 = '127.0.0.1'
const LOOPBACK_V6 = '::1'
const AUDIO_MIMES = new Set(['audio/wav', 'audio/x-wav', 'audio/wave'])

function stripBrackets(hostname) {
  if (typeof hostname !== 'string') return ''
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function ipv4Octets(address) {
  if (typeof address !== 'string') return null
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const values = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    values.push(value)
  }
  return values
}

function inV4Range(octets, a, b, c, d, maskBits) {
  const value = ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]
  const base = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0
  return (value & mask) === (base & mask)
}

/** Conservative public-address policy for the custom HTTPS target. */
export function isPublicIpv4(address) {
  const octets = ipv4Octets(address)
  if (!octets) return false
  const ranges = [
    [0, 0, 0, 0, 8], [10, 0, 0, 0, 8], [100, 64, 0, 0, 10], [127, 0, 0, 0, 8],
    [169, 254, 0, 0, 16], [172, 16, 0, 0, 12], [192, 0, 0, 0, 24], [192, 0, 2, 0, 24],
    [192, 168, 0, 0, 16], [198, 18, 0, 0, 15], [198, 51, 100, 0, 24], [203, 0, 113, 0, 24],
    [224, 0, 0, 0, 4], [240, 0, 0, 0, 4],
  ]
  if (octets[0] === 255 && octets[1] === 255 && octets[2] === 255 && octets[3] === 255) return false
  return !ranges.some(([a, b, c, d, bits]) => inV4Range(octets, a, b, c, d, bits))
}

export function isPublicIpv6(address) {
  if (typeof address !== 'string') return false
  const value = address.toLowerCase()
  if (!net.isIPv6(value)) return false
  if (value === '::' || value === '::1') return false
  if (value.startsWith('::ffff:')) return false
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return false
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff')) return false
  if (value.startsWith('2001:db8')) return false
  if (value.startsWith('64:ff9b:')) return false
  if (value.startsWith('2002:')) return false
  if (value.startsWith('2001:0:')) return false
  return true
}

export function isPublicAddress(address) {
  const value = stripBrackets(address)
  const family = net.isIP(value)
  if (family === 4) return isPublicIpv4(value)
  if (family === 6) return isPublicIpv6(value)
  return false
}

export function isLoopbackAddress(address) {
  const value = stripBrackets(address)
  return value === LOOPBACK_V4 || value === LOOPBACK_V6 || /^127\./.test(value)
}

function validHostnameText(hostname) {
  return typeof hostname === 'string' &&
    hostname.length > 0 &&
    hostname.length <= 253 &&
    !/[\u0000-\u0020\u007f]/.test(hostname) &&
    !hostname.endsWith('.') &&
    !hostname.includes('%')
}

function looksAmbiguousNumericHost(hostname) {
  if (/^\d+$/.test(hostname)) return true
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && hostname.split('.').some((part) => part.length > 1 && part.startsWith('0'))) return true
  return false
}

/**
 * Validate a custom target before any request. DNS is resolved once here; callers pass the
 * returned pinned address into the transport lookup so the connect cannot resolve again.
 */
export async function validateCustomTarget(rawUrl, { dnsLookup = dns.lookup } = {}) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_INVALID }
  let url
  try { url = new URL(rawUrl) } catch { return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_INVALID } }
  if (url.username || url.password) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_CREDENTIALS }
  if (url.search || url.hash) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_CREDENTIALS }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_SCHEME }
  const hostname = stripBrackets(url.hostname).toLowerCase()
  if (!validHostnameText(hostname)) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_INVALID }
  const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_INVALID }

  if (url.protocol === 'http:') {
    if (hostname !== LOOPBACK_V4 && hostname !== LOOPBACK_V6) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_LOOPBACK_ONLY }
    return {
      ok: true,
      url: url.toString(),
      protocol: 'http:',
      hostname,
      port,
      addresses: [{ address: hostname, family: hostname === LOOPBACK_V4 ? 4 : 6 }],
      pinnedAddress: hostname,
      family: hostname === LOOPBACK_V4 ? 4 : 6,
      isLoopback: true,
    }
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_PRIVATE }
  if (looksAmbiguousNumericHost(hostname)) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_AMBIGUOUS }
  const literalFamily = net.isIP(hostname)
  if (literalFamily) {
    if (!isPublicAddress(hostname)) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_PRIVATE }
    return {
      ok: true,
      url: url.toString(),
      protocol: 'https:',
      hostname,
      port,
      addresses: [{ address: hostname, family: literalFamily }],
      pinnedAddress: hostname,
      family: literalFamily,
      isLoopback: false,
    }
  }

  let resolved
  try {
    resolved = await dnsLookup(hostname, { all: true, verbatim: true })
  } catch {
    return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_DNS_FAILED }
  }
  if (!Array.isArray(resolved) || resolved.length === 0) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_DNS_EMPTY }
  const addresses = []
  for (const item of resolved) {
    if (!item || typeof item.address !== 'string') return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_DNS_FAILED }
    const family = item.family === 4 || item.family === 6 ? item.family : net.isIP(item.address)
    if (!family) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_DNS_FAILED }
    if (!isPublicAddress(item.address)) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_PRIVATE }
    addresses.push({ address: item.address, family })
  }
  if (!addresses.every((item) => isPublicAddress(item.address))) return { ok: false, code: CLOUD_HTTP_ERRORS.TARGET_PRIVATE }
  return {
    ok: true,
    url: url.toString(),
    protocol: 'https:',
    hostname,
    port,
    addresses,
    pinnedAddress: addresses[0].address,
    family: addresses[0].family,
    isLoopback: false,
  }
}

/** A Node lookup callback bound to the already-verified address. */
export function pinnedLookup(address, family) {
  return function lookup(hostname, options, callback) {
    if (options && options.all) return callback(null, [{ address, family }])
    return callback(null, address, family)
  }
}

function errorWith(code, extra = {}) {
  return { ok: false, code, ...extra }
}

function headerBytes(rawHeaders) {
  let total = 0
  for (const value of rawHeaders) total += Buffer.byteLength(String(value), 'utf8') + 2
  return total
}

/**
 * Send one bounded request. `requestImpl` exists only for tests; production uses node:https/http.
 * A redirect is an error, not a followed response. The response body is streamed with an immediate
 * cap; an oversized or timed-out/aborted response is destroyed without retry.
 */
export function requestBuffer({
  url,
  method = 'POST',
  headers = {},
  body = Buffer.alloc(0),
  timeoutMs = 30000,
  maxResponseBytes = CLOUD_HTTP_LIMITS.maxResponseBytes,
  maxHeaderBytes = CLOUD_HTTP_LIMITS.maxHeaderBytes,
  maxHeaderCount = CLOUD_HTTP_LIMITS.maxHeaderCount,
  expectedMime = null,
  signal = null,
  lookup = null,
  requestImpl = null,
} = {}) {
  return new Promise((resolve) => {
    let parsed
    try { parsed = url instanceof URL ? url : new URL(String(url)) } catch { return resolve(errorWith(CLOUD_HTTP_ERRORS.INVALID_REQUEST)) }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return resolve(errorWith(CLOUD_HTTP_ERRORS.TARGET_SCHEME))
    if (!Number.isInteger(timeoutMs) || timeoutMs < CLOUD_HTTP_LIMITS.minTimeoutMs || timeoutMs > CLOUD_HTTP_LIMITS.maxTimeoutMs) {
      return resolve(errorWith(CLOUD_HTTP_ERRORS.INVALID_REQUEST))
    }
    if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > CLOUD_HTTP_LIMITS.maxResponseBytes) {
      return resolve(errorWith(CLOUD_HTTP_ERRORS.INVALID_REQUEST))
    }
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8')
    const requestHeaders = { ...headers }
    if (!Object.prototype.hasOwnProperty.call(requestHeaders, 'Content-Length')) requestHeaders['Content-Length'] = String(payload.length)
    const options = {
      method,
      headers: requestHeaders,
      timeout: timeoutMs,
      maxHeaderSize: maxHeaderBytes,
      agent: false,
    }
    if (lookup) options.lookup = lookup
    if (parsed.protocol === 'https:' && net.isIP(parsed.hostname) === 0) options.servername = parsed.hostname
    if (signal && signal.aborted) return resolve(errorWith(CLOUD_HTTP_ERRORS.CANCELLED, { sent: false }))
    const requestFn = requestImpl || (parsed.protocol === 'https:' ? https.request : http.request)
    let request
    try {
      request = requestFn(parsed, options)
    } catch {
      return resolve(errorWith(CLOUD_HTTP_ERRORS.INVALID_REQUEST))
    }
    let settled = false
    let timedOut = false
    let cancelled = false
    let response = null
    let timer = null
    const cleanup = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
    }
    const finish = (value) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const destroy = () => {
      try { if (response && !response.destroyed) response.destroy() } catch {}
      try { if (request && !request.destroyed) request.destroy() } catch {}
    }
    const onAbort = () => {
      cancelled = true
      finish(errorWith(CLOUD_HTTP_ERRORS.CANCELLED, { sent: true }))
      destroy()
    }
    /* The error listener must exist before any destroy path. A pre-aborted signal is handled
     * before request creation; a race after creation still reaches this listener, never an
     * unhandled ECONNRESET/socket hang up. */
    request.on('error', (error) => {
      if (cancelled) return finish(errorWith(CLOUD_HTTP_ERRORS.CANCELLED, { sent: true }))
      if (timedOut) return finish(errorWith(CLOUD_HTTP_ERRORS.TIMEOUT, { sent: true }))
      if (error && error.code === 'HPE_HEADER_OVERFLOW') return finish(errorWith(CLOUD_HTTP_ERRORS.HEADER_LIMIT, { sent: true }))
      finish(errorWith(CLOUD_HTTP_ERRORS.NETWORK_ERROR, { sent: true }))
    })
    if (signal) {
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
    timer = setTimeout(() => {
      timedOut = true
      finish(errorWith(CLOUD_HTTP_ERRORS.TIMEOUT, { sent: true }))
      destroy()
    }, timeoutMs)
    request.on('response', (res) => {
      response = res
      const status = res.statusCode || 0
      const rawHeaders = res.rawHeaders || []
      if (headerBytes(rawHeaders) > maxHeaderBytes || rawHeaders.length / 2 > maxHeaderCount) {
        finish(errorWith(CLOUD_HTTP_ERRORS.HEADER_LIMIT, { sent: true, status }))
        destroy()
        return
      }
      if (status >= 300 && status < 400) {
        finish(errorWith(CLOUD_HTTP_ERRORS.REDIRECT_REJECTED, { sent: true, status }))
        destroy()
        return
      }
      if (status < 200 || status >= 300) {
        /* Do not drain an error body: an infinite non-2xx stream would otherwise outlive the
         * timeout/abort cleanup. Finish first, then destroy the response and socket. */
        finish(errorWith(CLOUD_HTTP_ERRORS.HTTP_STATUS, { sent: true, status }))
        destroy()
        return
      }
      if (expectedMime) {
        const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
        if (!AUDIO_MIMES.has(type)) {
          finish(errorWith(CLOUD_HTTP_ERRORS.CONTENT_TYPE, { sent: true, status }))
          destroy()
          return
        }
      }
      const chunks = []
      let total = 0
      res.on('data', (chunk) => {
        if (settled) return
        total += chunk.length
        if (total > maxResponseBytes) {
          finish(errorWith(CLOUD_HTTP_ERRORS.RESPONSE_TOO_LARGE, { sent: true, status, bytes: total }))
          destroy()
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        finish({
          ok: true,
          sent: true,
          status,
          headers: { ...res.headers },
          body: Buffer.concat(chunks),
          bytes: total,
        })
      })
      res.on('aborted', () => finish(errorWith(cancelled ? CLOUD_HTTP_ERRORS.CANCELLED : CLOUD_HTTP_ERRORS.NETWORK_ERROR, { sent: true, status })))
      res.on('error', () => finish(errorWith(cancelled ? CLOUD_HTTP_ERRORS.CANCELLED : CLOUD_HTTP_ERRORS.NETWORK_ERROR, { sent: true, status })))
    })
    try {
      request.end(payload)
    } catch {
      finish(errorWith(CLOUD_HTTP_ERRORS.INVALID_REQUEST))
      destroy()
    }
  })
}
