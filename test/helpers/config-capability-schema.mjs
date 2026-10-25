/* Test-only capability-schema projection for the Phase 4B-2B-1 audit.
 *
 * This module is not a production adapter. It exists so the capability contract in
 * `docs/PHASE4B2B1_COMPONENT_AUDIT.md` has executable invariants:
 *   - owner API presence, Core write authorization and effective write enablement are separate;
 *   - save capability is separate from loaded-revision / apply confirmation;
 *   - boot-time read and hot reload are separate;
 *   - `null`, UNSUPPORTED, NOT_AUTHORIZED and UNKNOWN are not interchangeable.
 */

export const CAPABILITY_SCHEMA_VERSION = 2

export const CAPABILITY_STATES = Object.freeze({
  writeMode: Object.freeze(['READ_ONLY', 'AUTHORIZED_WRITE']),
  ownerApi: Object.freeze(['AVAILABLE', 'UNSUPPORTED', 'UNKNOWN']),
  ownerApiKind: Object.freeze(['HTTP', 'HTTP_CONSOLE', 'FILE', 'NONE']),
  ownerApiScope: Object.freeze(['COMPONENT', 'HUMAN_CONSOLE', 'NONE']),
  revision: Object.freeze(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN']),
  save: Object.freeze(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN']),
  authorization: Object.freeze(['AUTHORIZED', 'NOT_AUTHORIZED', 'UNKNOWN']),
  apply: Object.freeze(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN']),
  gate: Object.freeze([
    'NONE',
    'NO_OWNER_API',
    'NO_SAVE_API',
    'NO_WRITE_AUTHORIZATION',
    'HUMAN_CONSOLE_ONLY',
    'PHASE_READ_ONLY',
    'UNKNOWN',
  ]),
  readTiming: Object.freeze(['PER_CALL', 'SERVICE_BOOT', 'PER_JOB', 'HOST_BOOT', 'MIXED', 'ON_DEMAND', 'UNKNOWN']),
  hotReload: Object.freeze(['FULL', 'PARTIAL', 'NONE', 'NOT_APPLICABLE', 'UNKNOWN']),
  requiresRestart: Object.freeze(['REQUIRED', 'NOT_REQUIRED', 'NOT_APPLICABLE', 'UNKNOWN']),
  risk: Object.freeze(['MEDIUM', 'HIGH', 'CRITICAL']),
})

function fail(message) {
  throw new TypeError('CAPABILITY_SCHEMA_INVALID: ' + message)
}

function enumValue(value, name, { allowNull = false } = {}) {
  if (value === null && allowNull) return null
  if (!CAPABILITY_STATES[name].includes(value)) {
    fail(`${name} must be one of ${CAPABILITY_STATES[name].join('|')}${allowNull ? '|null' : ''}, got ${JSON.stringify(value)}`)
  }
  return value
}

function objectValue(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`)
  return value
}

function stringOrNull(value, name) {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value !== 'string' || value.length > 200) fail(`${name} must be a short string or null`)
  return value
}

function revise(value, name) {
  const input = objectValue(value, name)
  const state = enumValue(input.state, 'revision')
  const kind = stringOrNull(input.kind, name + '.kind')
  if (state === 'SUPPORTED' && !kind) fail(name + '.kind is required when the revision is SUPPORTED')
  return { state, kind }
}

function computeGate({ ownerApi, saveState, authorization, scope, writeMode }) {
  if (ownerApi === 'UNKNOWN' || saveState === 'UNKNOWN' || authorization === 'UNKNOWN') return 'UNKNOWN'
  if (ownerApi !== 'AVAILABLE') return 'NO_OWNER_API'
  if (scope === 'HUMAN_CONSOLE') return 'HUMAN_CONSOLE_ONLY'
  if (saveState !== 'SUPPORTED') return 'NO_SAVE_API'
  if (authorization !== 'AUTHORIZED') return 'NO_WRITE_AUTHORIZATION'
  if (writeMode !== 'AUTHORIZED_WRITE') return 'PHASE_READ_ONLY'
  return 'NONE'
}

function normalizeSurface(input, writeMode) {
  const surface = objectValue(input, 'surface')
  if (typeof surface.surface !== 'string' || !/^[A-Za-z][A-Za-z0-9]{1,31}$/.test(surface.surface)) {
    fail('surface.surface must be a short identifier')
  }

  const ownerApi = objectValue(surface.ownerApi, 'ownerApi')
  const ownerApiState = enumValue(ownerApi.state, 'ownerApi')
  const kind = ownerApiState === 'AVAILABLE'
    ? enumValue(ownerApi.kind, 'ownerApiKind')
    : enumValue(ownerApi.kind ?? null, 'ownerApiKind', { allowNull: true })
  const scope = ownerApiState === 'AVAILABLE'
    ? enumValue(ownerApi.scope, 'ownerApiScope')
    : enumValue(ownerApi.scope ?? null, 'ownerApiScope', { allowNull: true })
  if (ownerApiState === 'AVAILABLE' && !kind) fail('ownerApi.kind is required when the owner API is AVAILABLE')
  if (ownerApiState === 'AVAILABLE' && !scope) fail('ownerApi.scope is required when the owner API is AVAILABLE')

  const savedRevision = revise(surface.savedRevision, 'savedRevision')
  const loadedRevision = revise(surface.loadedRevision, 'loadedRevision')

  const save = objectValue(surface.save, 'save')
  const saveState = enumValue(save.state, 'save')
  const authorization = enumValue(save.authorization, 'authorization')
  const enabled = ownerApiState === 'AVAILABLE' &&
    scope === 'COMPONENT' &&
    saveState === 'SUPPORTED' &&
    authorization === 'AUTHORIZED' &&
    writeMode === 'AUTHORIZED_WRITE'
  if (save.enabled !== undefined && save.enabled !== enabled) fail('save.enabled must be derived, not supplied inconsistently')
  const gate = computeGate({ ownerApi: ownerApiState, saveState, authorization, scope, writeMode })
  if (save.gate !== undefined && save.gate !== gate) fail('save.gate must be derived, not supplied inconsistently')

  const apply = objectValue(surface.apply, 'apply')
  const applyState = enumValue(apply.state, 'apply')
  if (applyState === 'SUPPORTED' && loadedRevision.state !== 'SUPPORTED') {
    fail('apply.SUPPORTED requires loadedRevision.SUPPORTED')
  }
  const applyReason = stringOrNull(apply.reason, 'apply.reason')

  const blockers = surface.blockers === undefined ? [] : surface.blockers
  if (!Array.isArray(blockers) || blockers.some((code) => typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(code))) {
    fail('blockers must be an array of uppercase codes')
  }

  return Object.freeze({
    surface: surface.surface,
    ownerApi: Object.freeze({
      state: ownerApiState,
      kind: kind ?? null,
      scope: scope ?? null,
      endpoint: stringOrNull(ownerApi.endpoint, 'ownerApi.endpoint'),
    }),
    savedRevision: Object.freeze(savedRevision),
    loadedRevision: Object.freeze(loadedRevision),
    save: Object.freeze({ state: saveState, authorization, enabled, gate }),
    apply: Object.freeze({ state: applyState, reason: applyReason }),
    blockers: Object.freeze([...blockers]),
  })
}

function normalizeSource(input, writeMode) {
  const source = objectValue(input, 'source')
  if (typeof source.source !== 'string' || !/^[A-Za-z][A-Za-z0-9]{1,31}$/.test(source.source)) {
    fail('source.source must be a short identifier')
  }
  if (typeof source.authority !== 'string' || source.authority.length > 120) fail('source.authority is required')
  const readTiming = enumValue(source.readTiming, 'readTiming')
  const hotReload = enumValue(source.hotReload, 'hotReload')
  const requiresRestart = enumValue(source.requiresRestart, 'requiresRestart')
  const risk = enumValue(source.risk, 'risk')
  if (!Array.isArray(source.surfaces) || source.surfaces.length === 0) fail('source.surfaces must be non-empty')
  const surfaces = source.surfaces.map((item) => normalizeSurface(item, writeMode))
  const names = new Set(surfaces.map((item) => item.surface))
  if (names.size !== surfaces.length) fail('surface names must be unique within a source')
  return Object.freeze({
    source: source.source,
    authority: source.authority,
    readTiming,
    hotReload,
    requiresRestart,
    risk,
    surfaces: Object.freeze(surfaces),
  })
}

/**
 * Build a capability report. Write enablement is derived from the owner API, save capability,
 * Core authorization, API scope and the global write mode; it can never be set by the caller.
 */
export function createCapabilityReport({ writeMode = 'READ_ONLY', observedAt, sources = [] } = {}) {
  const mode = enumValue(writeMode, 'writeMode')
  if (!Array.isArray(sources) || sources.length === 0) fail('sources must be non-empty')
  const normalized = sources.map((source) => normalizeSource(source, mode))
  const ids = normalized.flatMap((source) => source.surfaces.map((surface) => `${source.source}.${surface.surface}`))
  if (new Set(ids).size !== ids.length) fail('source.surface ids must be unique')
  const surfaceEntries = normalized.flatMap((source) => source.surfaces.map((surface) => ({ source, surface })))
  const pick = (predicate) => surfaceEntries
    .filter(({ source, surface }) => predicate(source, surface))
    .map(({ source, surface }) => `${source.source}.${surface.surface}`)
  return Object.freeze({
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    writeMode: mode,
    observedAt: observedAt ?? new Date().toISOString(),
    sources: Object.freeze(normalized),
    summary: Object.freeze({
      ownerApiAvailable: pick((source, surface) => surface.ownerApi.state === 'AVAILABLE'),
      saveSupported: pick((source, surface) => surface.save.state === 'SUPPORTED'),
      writeAuthorized: pick((source, surface) => surface.save.state === 'SUPPORTED' && surface.save.authorization === 'AUTHORIZED'),
      writeEnabled: pick((source, surface) => surface.save.enabled === true),
      loadedRevisionAvailable: pick((source, surface) => surface.loadedRevision.state === 'SUPPORTED'),
      applySupported: pick((source, surface) => surface.apply.state === 'SUPPORTED'),
    }),
  })
}
