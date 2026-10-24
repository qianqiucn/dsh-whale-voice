/* Shared bounded JSON GET for Core/adapter detection.
 *
 * The deadline covers fetching, body streaming and JSON parsing. The body is read incrementally and
 * cancelled as soon as a byte cap or deadline is exceeded. No redirects, no retries, no writes.
 */

const DEFAULT_TIMEOUT_MS = 1500
const DEFAULT_MAX_BYTES = 16 * 1024

function timeoutResult() {
  return { state: 'timeout', status: null, body: null, error: 'timeout' }
}

async function cancelResponse(response) {
  try {
    if (response && response.body && typeof response.body.cancel === 'function') await response.body.cancel()
  } catch {}
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

export async function fetchJson(fetchImpl, url, options = {}) {
  if (!fetchImpl) return { state: 'unsupported', status: null, body: null, error: 'fetch_unavailable' }
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES
  const controller = new AbortController()
  let response = null
  let timer
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      try { controller.abort() } catch {}
      resolve({ __timeout: true })
    }, timeoutMs)
  })

  async function readBody() {
    if (!response.body || typeof response.body.getReader !== 'function') {
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > maxBytes) return { state: 'oversize', status: response.status, body: null, error: 'body_too_large' }
      const parsed = parseJson(text)
      if (!parsed.ok) return { state: 'invalid_json', status: response.status, body: null, error: 'invalid_json' }
      return { state: 'ok', status: response.status, body: parsed.value, error: null }
    }
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        const value = part.value
        if (!value) continue
        total += value.byteLength
        if (total > maxBytes) {
          try { await reader.cancel('body_too_large') } catch {}
          try { controller.abort() } catch {}
          return { state: 'oversize', status: response.status, body: null, error: 'body_too_large' }
        }
        chunks.push(value)
      }
    } finally {
      try { reader.releaseLock() } catch {}
    }
    let text = ''
    try {
      text = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))))
    } catch {
      return { state: 'invalid_json', status: response.status, body: null, error: 'invalid_encoding' }
    }
    const parsed = parseJson(text)
    if (!parsed.ok) return { state: 'invalid_json', status: response.status, body: null, error: 'invalid_json' }
    return { state: 'ok', status: response.status, body: parsed.value, error: null }
  }

  async function request() {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (response.status === 401 || response.status === 403) {
      await cancelResponse(response)
      return { state: 'auth_required', status: response.status, body: null, error: 'auth_required' }
    }
    if (response.status === 404) {
      await cancelResponse(response)
      return { state: 'unsupported', status: 404, body: null, error: 'endpoint_not_found' }
    }
    if (response.status >= 300 && response.status < 400) {
      await cancelResponse(response)
      return { state: 'redirect', status: response.status, body: null, error: 'redirect_not_followed' }
    }
    if (!response.ok) {
      await cancelResponse(response)
      return { state: 'connection_failed', status: response.status, body: null, error: 'http_' + response.status }
    }
    return readBody()
  }

  try {
    const raced = await Promise.race([request(), deadline])
    if (raced && raced.__timeout) {
      try { controller.abort() } catch {}
      await cancelResponse(response)
      return timeoutResult()
    }
    return raced
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')
    return { state: aborted ? 'timeout' : 'connection_failed', status: null, body: null, error: aborted ? 'timeout' : String(error && error.code || error && error.name || error).slice(0, 80) }
  } finally {
    clearTimeout(timer)
    try { controller.abort() } catch {}
  }
}

export const HTTP_LIMITS = Object.freeze({ DEFAULT_TIMEOUT_MS, DEFAULT_MAX_BYTES })
