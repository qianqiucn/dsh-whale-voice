/**
 * Test-only Fake Relay — a closed boundary that models the future delivery handoff without any
 * network, target, token or real send. It accepts only the inert PROPOSED_NOT_AUTHORIZED candidate
 * produced by relay-handoff, records per-delivery outcomes, deduplicates an already-sent delivery
 * and refuses to resend an UNKNOWN one.
 *
 * This module exists only for offline tests. It is not a delivery service, does not persist
 * anything, never selects a backend and never touches WeChat.
 */
export const FAKE_RELAY_SCHEMA_VERSION = 1

export const FAKE_RELAY_CODES = Object.freeze({
  INPUT_INVALID: 'FAKE_RELAY_INPUT_INVALID',
  UNKNOWN_NO_RESEND: 'FAKE_RELAY_UNKNOWN_NO_RESEND',
  NOT_A_CANDIDATE: 'FAKE_RELAY_NOT_A_CANDIDATE',
})

export function createFakeRelay() {
  const deliveries = new Map()
  const counters = { submitted: 0, sent: 0, duplicates: 0, rejected: 0 }

  function fail(code, path, reason) {
    counters.rejected += 1
    return { ok: false, errors: [{ code, path, reason }] }
  }

  return Object.freeze({
    submit(candidate) {
      counters.submitted += 1
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        candidate.schemaVersion !== 1 ||
        candidate.stage !== 'PROPOSED_NOT_AUTHORIZED' ||
        typeof candidate.taskId !== 'string' ||
        typeof candidate.deliveryId !== 'string' ||
        typeof candidate.artifactRef !== 'string' ||
        candidate.submitAllowed !== false
      ) {
        return fail(FAKE_RELAY_CODES.NOT_A_CANDIDATE, '$', 'not an inert relay candidate')
      }
      const existing = deliveries.get(candidate.deliveryId)
      if (existing) {
        if (existing.state === 'UNKNOWN') {
          return fail(FAKE_RELAY_CODES.UNKNOWN_NO_RESEND, 'deliveryId', 'an unknown delivery is never resent')
        }
        counters.duplicates += 1
        return { ok: true, value: { outcome: 'EXISTING', deliveryId: candidate.deliveryId } }
      }
      deliveries.set(candidate.deliveryId, { taskId: candidate.taskId, artifactRef: candidate.artifactRef, state: 'SENT' })
      counters.sent += 1
      return { ok: true, value: { outcome: 'SENT', deliveryId: candidate.deliveryId } }
    },
    getStatus(deliveryId) {
      const item = deliveries.get(deliveryId)
      return item ? { ok: true, value: { deliveryId, taskId: item.taskId, state: item.state } } : { ok: false, errors: [{ code: FAKE_RELAY_CODES.INPUT_INVALID, path: 'deliveryId', reason: 'unknown delivery' }] }
    },
    simulateUnknown(deliveryId) {
      const item = deliveries.get(deliveryId)
      if (!item) return false
      item.state = 'UNKNOWN'
      return true
    },
    stats() {
      return { ...counters, deliveries: deliveries.size }
    },
    reset() {
      deliveries.clear()
      counters.submitted = 0
      counters.sent = 0
      counters.duplicates = 0
      counters.rejected = 0
    },
  })
}
