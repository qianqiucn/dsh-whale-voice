/* Shared loopback/origin/token guards for the Host bridge and isolated Core server.
 *
 * The DSH client bridge uses a same-origin GET. Browser requests that omit Origin are therefore
 * accepted only after loopback, Host, Sec-Fetch-Site, plugin token and DSH connection checks. Any
 * supplied Origin must match the full http scheme, host and port of the Host header.
 */

import { timingSafeEqual } from 'node:crypto'

export function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function loopbackHost(req) {
  try {
    const host = new URL('http://' + String(req.headers.host || ''))
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host.hostname)
  } catch {
    return false
  }
}

export function sameOrigin(req) {
  const origin = req.headers.origin
  // Same-origin GET from the DSH page may omit Origin. The remaining guards (loopback Host,
  // Sec-Fetch-Site, per-process token, DSH connection) still apply.
  if (!origin) return true
  try {
    const expected = new URL('http://' + String(req.headers.host || ''))
    return new URL(String(origin)).origin === expected.origin
  } catch {
    return false
  }
}

export function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
