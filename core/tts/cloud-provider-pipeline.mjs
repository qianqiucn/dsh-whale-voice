/* Whale Voice — neutral cloud provider pipeline (Plan11, offline unit).
 *
 * The Azure and custom adapters expose the same small surface (health/synthesize/capabilities/
 * manifest/publicProjection). This module composes that surface without creating a Task, Artifact,
 * delivery route or database row: a successful fixture run is a non-persisted neutral provider
 * result that still says the shared router owns delivery. It also produces a public, secret-free
 * projection for Chinese UI/status use.
 */

import { PROVIDER_ERRORS } from './provider-contract.mjs'

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

const SECRET_KEYS = new Set(['secret', 'credentialRef', 'apiKey', 'api_key', 'authorization', 'token', 'accessToken', 'password'])

function sanitize(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return null
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen))
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) continue
    output[key] = sanitize(child, seen)
  }
  return output
}

/**
 * Run one complete fixture synthesis through an adapter. The adapter must already have passed its
 * own consent/cost/network gates; this layer only enforces the neutral result boundary.
 */
export async function runCloudSynthesisFixture({ adapter, request, context = {} } = {}) {
  if (!adapter || typeof adapter.synthesize !== 'function' || typeof adapter.health !== 'function') {
    return fail(PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
  }
  const health = await adapter.health()
  if (!health || health.ok !== true) return fail(PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
  const result = await adapter.synthesize(request, context)
  if (!result || result.ok !== true) return result || fail(PROVIDER_ERRORS.PROVIDER_ERROR)
  if (result.persisted !== false) return fail(PROVIDER_ERRORS.INVALID_RESPONSE, 'provider fixture result must be non-persisted')
  if (!result.result || !result.result.delivery || result.result.delivery.state !== 'PENDING_ROUTER') {
    return fail(PROVIDER_ERRORS.DELIVERY_NOT_PROVIDER)
  }
  if (!Buffer.isBuffer(result.bytes) || result.bytes.length === 0 || !result.inspection || typeof result.inspection.sampleRate !== 'number') {
    return fail(PROVIDER_ERRORS.INVALID_RESPONSE)
  }
  return {
    ok: true,
    providerId: result.providerId,
    requestId: result.requestId,
    neutralResult: result.result,
    bytes: result.bytes,
    inspection: result.inspection,
    persisted: false,
    taskCreated: false,
    artifactCreated: false,
    delivery: { state: 'PENDING_ROUTER' },
  }
}

/** Public Chinese-facing view; strips credential-like keys and fails closed without a projection. */
export function cloudProviderPublicView(adapter) {
  if (!adapter || typeof adapter.publicProjection !== 'function') return fail(PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
  const view = adapter.publicProjection()
  if (!view || typeof view !== 'object') return fail(PROVIDER_ERRORS.PROVIDER_NOT_AVAILABLE)
  return { ok: true, view: sanitize(view) }
}

/** Small comparison table for provider selection UI without any connection. */
export function cloudProviderComparison(adapters = []) {
  const rows = []
  for (const adapter of Array.isArray(adapters) ? adapters : []) {
    if (!adapter || typeof adapter.publicProjection !== 'function') continue
    const view = adapter.publicProjection()
    if (!view) continue
    rows.push({
      providerId: view.providerId,
      name: view.name,
      kind: view.kind,
      state: view.state,
      stateLabel: view.stateLabel,
      languages: view.capabilities ? view.capabilities.languages : [],
      voiceCount: view.capabilities ? view.capabilities.voices.length : 0,
      clone: false,
      emotion: false,
      streaming: false,
      networkGate: view.gates ? view.gates.networkLabel : '网络未启用',
      uploadGate: view.gates ? view.gates.uploadLabel : '未确认文字上传',
      credentialGate: view.gates ? view.gates.credentialLabel : '凭据缺失',
      costGate: view.gates ? view.gates.costLabel : '费用未知',
    })
  }
  return { ok: true, rows }
}
