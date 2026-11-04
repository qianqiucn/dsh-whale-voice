/* Whale Voice — Plan 13-B legacy text compatibility facade, OFFLINE / FIXTURE_ONLY.
 *
 * 144-LEGACY: the legacy callers of the original service hand it *text*; the reviewed service
 * synthesized the text itself and then enqueued a send. This facade models only the offline
 * compatibility path, never a second generation chain:
 *
 *   legacy text request
 *     -> the same Whale Audio generation owner (`openFixtureTaskOwner().save`, AudioTask v2)
 *     -> the same persisted SAVED Artifact fact
 *     -> the same persistent Whale Relay entry (`relay.ensureDelivery`)
 *     -> the same relay queue/backend (`relay.submit`)
 *
 * It has no cache, no retry loop, no second synthesis and no generation registry of its own: the
 * request identity is derived deterministically from (scope, target, legacy request id, text), and
 * every dedupe is performed by the *already existing* persisted owners (catalog reserve, owner save,
 * relay request key). A replayed request therefore returns EXISTING everywhere and can never
 * generate, save or send twice; a failed/cancelled/UNKNOWN delivery is never regenerated or resent.
 *
 * The bytes are Fixture bytes produced by the existing offline generation owner. Real text-to-speech
 * synthesis, the real worker, the real WeChat identity and the real DoH remain OPEN.
 */

import crypto from 'node:crypto'

import { openFixtureTaskCatalog } from './task-catalog.mjs'
import { openFixtureTaskOwner } from './task-owner.mjs'

export const LEGACY_TEXT_DELIVERY_SCHEMA_VERSION = 1

export const LEGACY_TEXT_DELIVERY_ERRORS = Object.freeze({
  INPUT_INVALID: 'LEGACY_TEXT_INPUT_INVALID',
  GENERATION_REJECTED: 'LEGACY_TEXT_GENERATION_REJECTED',
  RELAY_REJECTED: 'LEGACY_TEXT_RELAY_REJECTED',
  UNKNOWN_NO_RESEND: 'LEGACY_TEXT_UNKNOWN_NO_RESEND',
})

const SCOPE = /^[A-Za-z0-9:_-]{1,64}$/
const TARGET_ID = /^[A-Za-z0-9:_-]{1,64}$/
const REQUEST_ID = /^[A-Za-z0-9:_-]{1,64}$/
const ISO = /^\d{4}-\d{2}-\d{2}T/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Offline legacy text -> generation owner -> SAVED Artifact -> relay facade.
 *
 * @param {{ sandbox: string, relay: object, textLimit?: number }} options
 */
export function createLegacyTextDeliveryFacade({ sandbox, relay, textLimit = 2000 } = {}) {
  if (!sandbox || (typeof sandbox !== 'object' && typeof sandbox !== 'string')) throw new TypeError('legacy text facade needs the existing Fixture sandbox')
  if (!relay || typeof relay.ensureDelivery !== 'function' || typeof relay.submit !== 'function') {
    throw new TypeError('legacy text facade needs the existing relay handle')
  }
  const stats = { requests: 0, generations: 0, saveReplays: 0, deliveryReuses: 0, submitted: 0, rejected: 0 }

  function reject(code, detail) {
    stats.rejected += 1
    return fail(code, detail)
  }

  return Object.freeze({
    /**
     * `savedInput` is the exact input the existing generation owner already receives from the
     * documented Fixture runner example; this facade only binds the task identity and the delivery
     * intent, it never invents provider/model facts.
     */
    async deliver(request = {}) {
      stats.requests += 1
      const { legacyRequestId, text, scopeId, targetId, savedInput, expiresAt, now, proofRef = 'fixture-rights:legacy-text' } = request
      if (typeof legacyRequestId !== 'string' || !REQUEST_ID.test(legacyRequestId)) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'legacyRequestId')
      if (typeof scopeId !== 'string' || !SCOPE.test(scopeId)) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'scopeId')
      if (typeof targetId !== 'string' || !TARGET_ID.test(targetId)) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'targetId')
      if (typeof expiresAt !== 'string' || !ISO.test(expiresAt) || !Number.isFinite(Date.parse(expiresAt))) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'expiresAt')
      if (typeof now !== 'string' || !ISO.test(now) || !Number.isFinite(Date.parse(now))) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'now')
      if (typeof proofRef !== 'string' || proofRef.length === 0 || proofRef.length > 128) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'proofRef')
      // Legacy text is a bounded single request; control characters and empty text never reach TTS.
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > textLimit) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'text')
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'text')
      if (!isObject(savedInput) || !isObject(savedInput.sourceInput) || !isObject(savedInput.sourceInput.voiceBinding) || !isObject(savedInput.sourceInput.voiceBinding.taskDraft)) {
        return reject(LEGACY_TEXT_DELIVERY_ERRORS.INPUT_INVALID, 'savedInput')
      }

      // One deterministic request identity: the same legacy request/text/target can only ever map to
      // one generation task, one save and one relay delivery.
      const digest = sha256(['legacy-text-v1', scopeId, targetId, legacyRequestId, text].join('|'))
      const idempotencyKey = 'key:fixture-legacy-' + digest.slice(0, 32)
      const saveRequestKey = 'save:legacy-' + digest.slice(0, 32)
      const relayRequestKey = 'legacy-relay-' + digest.slice(0, 32)

      const draft = cloneJson(savedInput.sourceInput.voiceBinding.taskDraft)
      delete draft.taskId
      draft.deliveryRequested = true
      const catalog = await openFixtureTaskCatalog({ sandbox })
      if (!catalog.ok) return reject(LEGACY_TEXT_DELIVERY_ERRORS.GENERATION_REJECTED, 'task catalog unavailable')
      const reserved = await catalog.value.reserve({ schemaVersion: 1, scopeId, idempotencyKey, draft, observedAt: now })
      if (!reserved.ok) return reject(LEGACY_TEXT_DELIVERY_ERRORS.GENERATION_REJECTED, 'task reservation rejected')
      const taskId = reserved.value.task.taskId

      const input = cloneJson(savedInput)
      input.sourceInput.voiceBinding.taskDraft.taskId = taskId
      input.sourceInput.voiceBinding.taskDraft.deliveryRequested = true
      const owner = await openFixtureTaskOwner({ sandbox })
      if (!owner.ok) return reject(LEGACY_TEXT_DELIVERY_ERRORS.GENERATION_REJECTED, 'generation owner unavailable')
      const saved = await owner.value.save({
        schemaVersion: 1, scopeId, taskId, requestKey: saveRequestKey, now, expiresAt,
        rights: { state: 'GRANTED', proofRef }, input,
      })
      if (!saved.ok || !isObject(saved.value)) {
        const code = Array.isArray(saved.errors) && saved.errors.length > 0 && saved.errors[0] && typeof saved.errors[0].code === 'string'
          ? saved.errors[0].code
          : 'unknown'
        return reject(LEGACY_TEXT_DELIVERY_ERRORS.GENERATION_REJECTED, 'generation owner rejected the save: ' + code)
      }
      // A replay answers EXISTING without repeating the artifact envelope: the persisted artifact
      // relation is read back from the same owner instead of generating or inventing a new one.
      let artifactRef = isObject(saved.value.artifact) && typeof saved.value.artifact.artifactRef === 'string'
        ? saved.value.artifact.artifactRef
        : null
      if (artifactRef === null) {
        const artifactStatus = await owner.value.artifactStatus({
          schemaVersion: 1, scopeId, taskId, now, rights: { state: 'GRANTED', proofRef },
        })
        if (artifactStatus.ok && isObject(artifactStatus.value) && typeof artifactStatus.value.artifactRef === 'string') {
          artifactRef = artifactStatus.value.artifactRef
        }
      }
      if (artifactRef === null) return reject(LEGACY_TEXT_DELIVERY_ERRORS.GENERATION_REJECTED, 'no persisted SAVED artifact')
      if (saved.value.outcome === 'EXISTING') stats.saveReplays += 1
      else stats.generations += 1
      const generation = saved.value.outcome === 'EXISTING' ? 'EXISTING' : 'CREATED'

      const ensured = await relay.ensureDelivery({
        handoff: {
          schemaVersion: 1, scopeId, taskId, artifactRef, targetId, requestKey: relayRequestKey,
          rights: { state: 'GRANTED', proofRef },
        },
      })
      if (!ensured.ok) return reject(LEGACY_TEXT_DELIVERY_ERRORS.RELAY_REJECTED, ensured.code ? String(ensured.code) : 'relay rejected the delivery')
      if (ensured.outcome === 'EXISTING') stats.deliveryReuses += 1
      const deliveryId = ensured.delivery.deliveryId

      const submitted = await relay.submit(deliveryId)
      const delivery = submitted && submitted.delivery ? submitted.delivery : null
      const state = delivery ? delivery.state : null
      const base = {
        stage: 'DELIVERY',
        schemaVersion: LEGACY_TEXT_DELIVERY_SCHEMA_VERSION,
        taskId,
        artifactRef,
        deliveryId,
        generation,
        deliveryOutcome: ensured.outcome,
        mockOnly: true,
        realOperationAllowed: false,
      }
      if (state === 'UNKNOWN' || submitted.code === 'RELAY_CORE_UNKNOWN_NO_RESEND') {
        // Indeterminate: the artifact/delivery stay as they are; nothing is regenerated or resent.
        return {
          ...base,
          ok: false,
          state: 'UNKNOWN',
          code: LEGACY_TEXT_DELIVERY_ERRORS.UNKNOWN_NO_RESEND,
          detail: 'the delivery is indeterminate; it is never regenerated or resent',
        }
      }
      if (state === 'CANCELLED' || state === 'CANCEL_REQUESTED' || submitted.code === 'RELAY_CORE_CANCELLED') {
        // A cancelled request keeps its generation/artifact but is never resent.
        return { ...base, ok: false, state: 'CANCELLED', code: LEGACY_TEXT_DELIVERY_ERRORS.RELAY_REJECTED, detail: 'the delivery was cancelled; it is never regenerated or resent' }
      }
      if (submitted.ok === true && state === 'ACCEPTED') {
        stats.submitted += 1
        return { ...base, ok: true, state }
      }
      return reject(LEGACY_TEXT_DELIVERY_ERRORS.RELAY_REJECTED, submitted.code ? String(submitted.code) : 'relay submit rejected')
    },
    /** Test evidence only: no queue, no cache, no registry is kept here. */
    stats() { return { ...stats } },
  })
}
