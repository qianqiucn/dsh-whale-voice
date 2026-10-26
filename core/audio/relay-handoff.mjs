/* Whale Audio Core — RelayHandoffCandidate v1 (Plan 05-A / F01, OFFLINE pure contract).
 *
 * A deliberately inert boundary sentinel between the Audio Core and the future Whale Relay Core.
 * It only describes a *proposal* that a saved Fake artifact might be reviewed for delivery. It
 * never resolves a target, never holds a chat id, token or backend, never queues work and never
 * sends anything. There is no HTTP client, timer, retry or persistence in this module.
 *
 * F01-01: this boundary no longer maintains a partial copy of the record schema. It delegates the
 * whole structure to `validateAudioTaskRecord()` from task-contract.mjs and then applies only the
 * candidate-specific rules (state, delivery intent, delivery id). A missing, forged or
 * inconsistent record therefore cannot reach the candidate stage by omission.
 *
 * Hard invariants of every candidate:
 * - stage is PROPOSED_NOT_AUTHORIZED;
 * - mockOnly:true, submitAllowed:false, targetVerified:false, authorizationVerified:false,
 *   backendSelected:false;
 * - the caller injects both taskId and deliveryId; this module cannot mint ids and cannot prove
 *   global uniqueness or delivery idempotency from one record (that is Plan 13-A's persistence
 *   layer, explicitly out of scope here).
 */

import { AUDIO_ERRORS, validateAudioTaskRecord } from './task-contract.mjs'

export const RELAY_CANDIDATE_SCHEMA_VERSION = 1

/** The only stage this offline contract can produce. A real submission stage does not exist. */
export const RELAY_CANDIDATE_STAGE = 'PROPOSED_NOT_AUTHORIZED'

const DELIVERY_ID_PATTERN = /^delivery:[A-Za-z0-9_-]{1,64}$/

// States from which no delivery proposal may ever be derived.
const UNSAFE_STATES = Object.freeze(new Set(['BLOCKED_RIGHTS', 'CANCEL_REQUESTED', 'CANCELLED', 'FAILED', 'UNKNOWN']))

function issue(code, path, reason) {
  return { code, path, reason }
}

function failOf(errors) {
  return { ok: false, errors }
}

function attempt(run) {
  try {
    return run()
  } catch {
    return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, '$', 'input could not be inspected safely')])
  }
}

/**
 * Build an explicitly non-submittable Relay handoff candidate for a saved Fake artifact.
 *
 * This is an offline review artifact only: it is not a Relay request, not a WeChatAgent payload,
 * not a Voice Sender command and not a queue entry. A future Plan 13-A must re-verify the target,
 * own the single-submission backend lock and provide persistent uniqueness/idempotency; none of
 * that is claimed or performed here.
 *
 * @param {object} taskRecord Audio Core task record, expected in state SAVED
 * @param {string} deliveryId caller-injected `delivery:` id (never generated here)
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function buildRelayHandoffCandidate(taskRecord, deliveryId) {
  return attempt(() => {
    // 1-3. One authoritative structural validation. Its safe error envelope is returned as-is and
    // only the normalised copy is used afterwards, never the caller's original object.
    const validation = validateAudioTaskRecord(taskRecord)
    if (!validation.ok) return validation
    const record = validation.value

    // 4. Cancelled, failed, unknown and rights-blocked records can never reach Relay.
    if (UNSAFE_STATES.has(record.state)) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'state', 'this task state can never be handed to Relay')])
    }

    // 5. Only a saved Fake artifact may be proposed for delivery.
    if (record.state !== 'SAVED') {
      return failOf([issue(AUDIO_ERRORS.STATE_CONFLICT, 'state', 'only a saved Fake artifact can be proposed for delivery')])
    }

    // 6. The user must have expressed a delivery intent candidate; this is still not authorization.
    if (record.deliveryRequested !== true) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'deliveryRequested', 'no delivery intent was recorded')])
    }

    // The validator already guarantees this for SAVED records; keep the candidate invariant explicit.
    const artifactRef = record.outputArtifactRef
    if (typeof artifactRef !== 'string') {
      return failOf([issue(AUDIO_ERRORS.ARTIFACT_REQUIRED, 'outputArtifactRef', 'a saved task needs an output artifact')])
    }

    // 7. Both ids are injected by the caller. This module mints nothing.
    if (typeof deliveryId !== 'string' || !DELIVERY_ID_PATTERN.test(deliveryId)) {
      return failOf([issue(AUDIO_ERRORS.INVALID_ID, 'deliveryId', 'opaque delivery id required')])
    }
    if (deliveryId === record.taskId) {
      return failOf([issue(AUDIO_ERRORS.INVALID_ID, 'deliveryId', 'delivery id must differ from the task id')])
    }

    // 8. Fixed ten-field, deeply frozen candidate.
    return {
      ok: true,
      value: Object.freeze({
        schemaVersion: RELAY_CANDIDATE_SCHEMA_VERSION,
        taskId: record.taskId,
        deliveryId,
        artifactRef,
        stage: RELAY_CANDIDATE_STAGE,
        mockOnly: true,
        submitAllowed: false,
        targetVerified: false,
        authorizationVerified: false,
        backendSelected: false,
      }),
    }
  })
}
