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
