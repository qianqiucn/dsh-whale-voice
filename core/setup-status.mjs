/* Pure browser-side setup status reader and scan gate.
 *
 * This module is injected into client.js by build.mjs and imported directly by tests.
 * It contains no shell, installer or component operation.
 */

export function createSetupScanGate() {
  let sequence = 0
  return {
    begin() { return ++sequence },
    isCurrent(id) { return id === sequence },
    get current() { return sequence },
  }
}

const CAPABILITY_OWNER_STATES = new Set(['AVAILABLE', 'UNSUPPORTED', 'UNKNOWN'])
const CAPABILITY_SAVE_STATES = new Set(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN'])
const CAPABILITY_AUTHORIZATION_STATES = new Set(['AUTHORIZED', 'NOT_AUTHORIZED', 'UNKNOWN'])
const CAPABILITY_APPLY_STATES = new Set(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN'])
const CAPABILITY_COMPONENT_STATES = new Set(['AVAILABLE', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN'])
const CAPABILITY_VERSION_MATCH = new Set(['AUDITED', 'CHANGED', 'UNKNOWN', 'NOT_APPLICABLE'])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidRevision(value) {
  return isObject(value) && typeof value.state === 'string' && (value.kind === null || typeof value.kind === 'string')
}

function isValidStatusBlock(value) {
  return isObject(value) && typeof value.state === 'string'
}

function isValidSurface(surface) {
  if (!isObject(surface)) return false
  if (typeof surface.id !== 'string' || typeof surface.label !== 'string') return false
  if (!isValidRevision(surface.savedRevision) || !isValidRevision(surface.loadedRevision)) return false
  if (!isObject(surface.ownerApi) || !CAPABILITY_OWNER_STATES.has(surface.ownerApi.state)) return false
  if (!isObject(surface.save) || !CAPABILITY_SAVE_STATES.has(surface.save.state)) return false
  if (!CAPABILITY_AUTHORIZATION_STATES.has(surface.save.authorization)) return false
  if (!isObject(surface.apply) || !CAPABILITY_APPLY_STATES.has(surface.apply.state)) return false
  if (typeof surface.readTiming !== 'string' || typeof surface.hotReload !== 'string' || typeof surface.requiresRestart !== 'string') return false
  if (!isObject(surface.status)) return false
  if (!isValidStatusBlock(surface.status.saved) || !isValidStatusBlock(surface.status.runtime) || !isValidStatusBlock(surface.status.apply)) return false
  if (surface.status.saved.values !== null && surface.status.saved.values !== undefined && !isObject(surface.status.saved.values)) return false
  if (typeof surface.status.apply.activeConfirmed !== 'boolean') return false
  if (!Array.isArray(surface.blockers)) return false
  return surface.blockers.every((blocker) => isObject(blocker) && typeof blocker.code === 'string')
}

function isValidSource(source) {
  return isObject(source) &&
    typeof source.id === 'string' &&
    Array.isArray(source.surfaces) &&
    source.surfaces.length > 0 &&
    source.surfaces.every(isValidSurface)
}

function isValidComponent(component) {
  return isObject(component) &&
    typeof component.id === 'string' &&
    typeof component.label === 'string' &&
    CAPABILITY_COMPONENT_STATES.has(component.status) &&
    CAPABILITY_VERSION_MATCH.has(component.versionMatch)
}

/**
 * Strict schema-v3 validation for the capability payload. A malformed payload must become
 * `core_invalid_response` and never reach the view as a partially trusted snapshot.
 */
export function isValidCapabilitySnapshot(data) {
  if (!isObject(data)) return false
  if (data.schemaVersion !== 3 || data.ok !== true || data.writeMode !== 'READ_ONLY') return false
  if (!Array.isArray(data.sources) || data.sources.length === 0) return false
  if (!data.sources.every(isValidSource)) return false
  if (!Array.isArray(data.components) || data.components.length === 0) return false
  if (!data.components.every(isValidComponent)) return false
  if (!isObject(data.summary)) return false
  return true
}

export function isValidCapabilityStatus(data) {
  if (!isObject(data)) return false
  if (data.schemaVersion !== 3 || data.ok !== true || data.writeMode !== 'READ_ONLY') return false
  if (!Array.isArray(data.components) || data.components.length === 0) return false
  if (!data.components.every(isValidComponent)) return false
  if (!Array.isArray(data.surfaces)) return false
  for (const surface of data.surfaces) {
    if (!isObject(surface) || typeof surface.source !== 'string' || typeof surface.surface !== 'string') return false
    if (!isValidStatusBlock(surface.saved) || !isValidStatusBlock(surface.runtime) || !isValidStatusBlock(surface.apply)) return false
    if (!Array.isArray(surface.blockers)) return false
  }
  return isObject(data.summary)
}

export function readBridgeSetupStatus(bridge, options = {}) {
  const timeoutMs = options.timeoutMs || 5000
  const now = options.now || (() => new Date().toISOString())
  if (!bridge || typeof bridge.getStatus !== 'function') {
    return Promise.resolve({
      checking: false, available: false, reason: 'core_not_connected', data: null, checkedAt: now(),
    })
  }

  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({
      checking: false, available: false, reason: 'core_timeout', data: null, checkedAt: now(),
    }), timeoutMs)
  })

  const request = Promise.resolve()
    .then(() => bridge.getStatus())
    .then((data) => {
      if (!data || typeof data !== 'object' || data.schemaVersion !== 1 || typeof data.completed !== 'boolean') {
        return { checking: false, available: false, reason: 'core_invalid_response', data: null, checkedAt: now() }
      }
      return { checking: false, available: true, reason: '', data, checkedAt: now() }
    })
    .catch((error) => ({
      checking: false,
      available: false,
      reason: 'core_error:' + String(error && error.message ? error.message : error).slice(0, 120),
      data: null,
      checkedAt: now(),
    }))

  const raced = Promise.race([request, timeout])
  raced.finally(() => clearTimeout(timer))
  return raced
}

function readBridgePayload(bridge, method, options, validate) {
  const timeoutMs = options.timeoutMs || 5000
  const now = options.now || (() => new Date().toISOString())
  if (!bridge || typeof bridge[method] !== 'function') {
    return Promise.resolve({
      checking: false, available: false, reason: 'core_not_connected', data: null, checkedAt: now(),
    })
  }
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({
      checking: false, available: false, reason: 'core_timeout', data: null, checkedAt: now(),
    }), timeoutMs)
  })
  const request = Promise.resolve()
    .then(() => bridge[method]())
    .then((data) => {
      if (!data || typeof data !== 'object' || !validate(data)) {
        return { checking: false, available: false, reason: 'core_invalid_response', data: null, checkedAt: now() }
      }
      return { checking: false, available: true, reason: '', data, checkedAt: now() }
    })
    .catch((error) => ({
      checking: false,
      available: false,
      reason: 'core_error:' + String(error && error.message ? error.message : error).slice(0, 120),
      data: null,
      checkedAt: now(),
    }))
  const raced = Promise.race([request, timeout])
  raced.finally(() => clearTimeout(timer))
  return raced
}

export function readBridgeCapabilitySnapshot(bridge, options = {}) {
  return readBridgePayload(bridge, 'getCapabilities', options, isValidCapabilitySnapshot)
}

export function readBridgeCapabilityStatus(bridge, options = {}) {
  return readBridgePayload(bridge, 'getCapabilityStatus', options, isValidCapabilityStatus)
}

export function readSetupCapabilities() {
  const bridge = typeof window !== 'undefined' ? window.__WHALE_SETUP__ : null
  return readBridgeCapabilitySnapshot(bridge, { timeoutMs: 5000 })
}
