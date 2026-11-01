/**
 * Cover readiness — the dynamic dependency matrix for the offline Cover/TTS features.
 *
 * This is a deterministic, side-effect-free evaluator over already-observed facts. It never probes
 * the system, never marks anything real-ready and never treats stale/unknown Fixture evidence as
 * usable. The caller supplies facts gathered elsewhere (Fixture library, voice/provider manifests,
 * GPU/cloud flags, first-visit confirmation); this module only computes the minimal dependency set,
 * the ordered block reasons and the user-facing message.
 */
export const COVER_READINESS_SCHEMA_VERSION = 1

export const COVER_READINESS_REASONS = Object.freeze({
  SOURCE_MISSING: 'cover source missing',
  RIGHTS_REVOKED: 'cover rights revoked',
  RIGHTS_EXPIRED: 'cover rights expired',
  MODEL_MISSING: 'cover model missing',
  MODEL_VERSION_MISMATCH: 'cover model version mismatch',
  GPU_UNAVAILABLE: 'cover GPU unavailable',
  CLOUD_NOT_AUTHORIZED: 'cover cloud not authorized',
  PROVIDER_NOT_READY: 'cover provider not ready',
  EVIDENCE_UNKNOWN: 'cover evidence unknown',
  EVIDENCE_STALE: 'cover evidence stale',
  CONFIRMATION_REQUIRED: 'cover confirmation required',
  INPUT_INVALID: 'invalid cover readiness input',
})

export const COVER_READINESS_CODES = Object.freeze(
  Object.fromEntries(Object.entries(COVER_READINESS_REASONS).map(([key, reason]) => [key, 'COVER_READINESS_' + key])),
)

const MODES = Object.freeze(['TTS', 'SVC'])
const SOURCE_TYPES = Object.freeze(['AUDIO_REF', 'TEXT'])

function issue(key, path) {
  return { code: COVER_READINESS_CODES[key], path, reason: COVER_READINESS_REASONS[key] }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  if (new Date(ms).toISOString() !== value) return null
  return value
}

function dependency(id, kind, state, fixture) {
  return { id, kind, state, fixture: fixture === true }
}

/**
 * Compute the minimal dependency set and ordered block reasons.
 *
 * @param {object} input
 * @param {'TTS'|'SVC'} input.mode
 * @param {'AUDIO_REF'|'TEXT'} input.sourceType
 * @param {{present:boolean, rightsState:'GRANTED'|'REVOKED'|'UNKNOWN', expiresAt?:string|null}} [input.source]
 * @param {{present:boolean, revision:number, requiredRevision:number}} [input.model]
 * @param {{available:boolean}} [input.gpu]
 * @param {{authorized:boolean, providerReady:boolean}} [input.cloud]
 * @param {{observedAt:string, expiresAt:string, realReady:boolean, source:string}} [input.evidence]
 * @param {{firstVisit:boolean, confirmed:boolean}} [input.confirmation]
 * @param {string} input.now canonical ISO
 */
export function computeCoverReadiness(input) {
  const fail = (key, path) => ({ ok: false, errors: [issue(key, path)] })
  if (!isPlainObject(input)) return fail('INPUT_INVALID', '$')
  const mode = input.mode
  const sourceType = input.sourceType
  if (!MODES.includes(mode)) return fail('INPUT_INVALID', 'mode')
  if (!SOURCE_TYPES.includes(sourceType)) return fail('INPUT_INVALID', 'sourceType')
  const now = isoOrNull(input.now)
  if (now === null) return fail('INPUT_INVALID', 'now')

  const deps = []
  const blocked = []
  const push = (id, kind, state, fixture) => deps.push(dependency(id, kind, state, fixture))

  // 1. First-visit confirmation is separate from availability; an unconfirmed first visit blocks
  //    the user-facing flow but is not evidence that a component is missing.
  const confirmation = isPlainObject(input.confirmation) ? input.confirmation : { firstVisit: false, confirmed: false }
  push('confirmation', 'USER', confirmation.firstVisit && !confirmation.confirmed ? 'MISSING' : 'OK', false)
  if (confirmation.firstVisit && !confirmation.confirmed) blocked.push(issue('CONFIRMATION_REQUIRED', 'confirmation'))

  // 2. Evidence gate: unknown or stale evidence never becomes ready evidence.
  const evidence = isPlainObject(input.evidence) ? input.evidence : null
  const evidenceObserved = evidence ? isoOrNull(evidence.observedAt) : null
  const evidenceExpires = evidence ? isoOrNull(evidence.expiresAt) : null
  let evidenceState = 'UNKNOWN'
  if (evidence && evidenceObserved !== null && evidenceExpires !== null && evidence.realReady === false) {
    if (Date.parse(evidenceObserved) > Date.parse(now)) evidenceState = 'UNKNOWN'
    else evidenceState = Date.parse(evidenceExpires) > Date.parse(now) ? 'VALID_FIXTURE' : 'STALE'
  } else if (evidence && evidence.realReady !== false) {
    evidenceState = 'UNKNOWN'
  }
  push('evidence', 'FIXTURE', evidenceState === 'VALID_FIXTURE' ? 'OK' : 'UNKNOWN', true)
  if (evidenceState === 'UNKNOWN') blocked.push(issue('EVIDENCE_UNKNOWN', 'evidence'))
  else if (evidenceState === 'STALE') blocked.push(issue('EVIDENCE_STALE', 'evidence'))

  // 3. Source dependency.
  if (sourceType === 'AUDIO_REF') {
    const source = isPlainObject(input.source) ? input.source : null
    if (!source || source.present !== true) {
      push('source', 'AUDIO_REF', 'MISSING', true)
      blocked.push(issue('SOURCE_MISSING', 'source'))
    } else if (source.rightsState !== 'GRANTED') {
      push('source', 'AUDIO_REF', 'MISSING', true)
      blocked.push(issue('RIGHTS_REVOKED', 'source.rightsState'))
    } else {
      const expires = isoOrNull(source.expiresAt)
      if (expires === null || Date.parse(expires) <= Date.parse(now)) {
        push('source', 'AUDIO_REF', 'MISSING', true)
        blocked.push(issue('RIGHTS_EXPIRED', 'source.expiresAt'))
      } else {
        push('source', 'AUDIO_REF', 'OK', true)
      }
    }
  } else {
    // TEXT input depends on the TTS chain itself; the source dependency is satisfied by that chain.
    push('source', 'TEXT', mode === 'TTS' ? 'OK' : 'MISSING', false)
    if (mode !== 'TTS') blocked.push(issue('SOURCE_MISSING', 'sourceType'))
  }

  // 4. Mode dependencies (minimal set differs by mode; both features can alternate in one session).
  const gpu = isPlainObject(input.gpu) ? input.gpu : { available: false }
  const cloud = isPlainObject(input.cloud) ? input.cloud : { authorized: false, providerReady: false }
  if (mode === 'TTS') {
    push('provider', 'PROVIDER', cloud.providerReady ? 'OK' : 'MISSING', true)
    if (!cloud.providerReady) blocked.push(issue('PROVIDER_NOT_READY', 'cloud.providerReady'))
    push('cloud', 'CLOUD', cloud.authorized ? 'OK' : 'MISSING', false)
    if (!cloud.authorized) blocked.push(issue('CLOUD_NOT_AUTHORIZED', 'cloud.authorized'))
  } else {
    const model = isPlainObject(input.model) ? input.model : { present: false, revision: 0, requiredRevision: 0 }
    if (!model.present) {
      push('model', 'MODEL', 'MISSING', true)
      blocked.push(issue('MODEL_MISSING', 'model.present'))
    } else if (!Number.isInteger(model.revision) || model.revision !== model.requiredRevision) {
      push('model', 'MODEL', 'MISSING', true)
      blocked.push(issue('MODEL_VERSION_MISMATCH', 'model.revision'))
    } else {
      push('model', 'MODEL', 'OK', true)
    }
    const computeReady = gpu.available === true || (cloud.authorized === true && cloud.providerReady === true)
    push('compute', 'RUNTIME', computeReady ? 'OK' : 'MISSING', true)
    if (!computeReady) {
      blocked.push(issue('GPU_UNAVAILABLE', 'gpu.available'))
      if (cloud.authorized !== true) blocked.push(issue('CLOUD_NOT_AUTHORIZED', 'cloud.authorized'))
      else if (cloud.providerReady !== true) blocked.push(issue('PROVIDER_NOT_READY', 'cloud.providerReady'))
    }
  }

  const ready = blocked.length === 0
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: COVER_READINESS_SCHEMA_VERSION,
      mode,
      sourceType,
      ready,
      dependencies: Object.freeze(deps.map((item) => Object.freeze(item))),
      blockedBy: Object.freeze(blocked.map((item) => Object.freeze(item))),
      evidence: Object.freeze({ state: evidenceState === 'VALID_FIXTURE' ? 'VALID_FIXTURE' : evidenceState, observedAt: evidenceObserved, expiresAt: evidenceExpires }),
      confirmation: Object.freeze({ firstVisit: confirmation.firstVisit === true, confirmed: confirmation.confirmed === true }),
      fixtureEvidence: true,
      realReady: false,
      messageZh: ready ? '演示依赖已满足；这不是真实能力。' : '演示依赖尚未满足，请按提示处理。',
    }),
  }
}
