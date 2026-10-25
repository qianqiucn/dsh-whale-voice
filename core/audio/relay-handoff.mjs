/* Whale Audio Core — RelayHandoffCandidate v1 (Plan 05-A, OFFLINE pure contract).
 *
 * A deliberately inert boundary sentinel between the Audio Core and the future Whale Relay Core.
 * It only describes a *proposal* that a saved Fake artifact might be reviewed for delivery. It
 * never resolves a target, never holds a chat id, token or backend, never queues work and never
 * sends anything. There is no HTTP client, timer, retry or persistence in this module.
 *
 * Hard invariants of every candidate:
 * - stage is PROPOSED_NOT_AUTHORIZED;
 * - mockOnly:true, submitAllowed:false, targetVerified:false, authorizationVerified:false,
 *   backendSelected:false;
 * - the caller injects both taskId and deliveryId; this module cannot mint ids and cannot prove
 *   global uniqueness or delivery idempotency from one record (that is Plan 13-A's persistence
 *   layer, explicitly out of scope here).
 */

import { AUDIO_ERRORS } from './task-contract.mjs'

export const RELAY_CANDIDATE_SCHEMA_VERSION = 1

/** The only stage this offline contract can produce. A real submission stage does not exist. */
export const RELAY_CANDIDATE_STAGE = 'PROPOSED_NOT_AUTHORIZED'

const TASK_ID_PATTERN = /^task:[A-Za-z0-9_-]{1,64}$/
const DELIVERY_ID_PATTERN = /^delivery:[A-Za-z0-9_-]{1,64}$/
const ARTIFACT_REF_PATTERN = /^artifact:[A-Za-z0-9_-]{1,64}$/

const TASK_STATES = Object.freeze([
  'CREATED',
  'BLOCKED_RIGHTS',
  'PROCESSING',
  'ARTIFACT_READY',
  'SAVED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'FAILED',
  'UNKNOWN',
])

// States from which no delivery proposal may ever be derived.
const UNSAFE_STATES = Object.freeze(new Set(['BLOCKED_RIGHTS', 'CANCEL_REQUESTED', 'CANCELLED', 'FAILED', 'UNKNOWN']))

// Same record surface as task-contract v1. Relay re-checks it locally instead of trusting the
// producer, so a forged or newer field cannot silently cross the delivery boundary.
const ALLOWED_RECORD_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'taskId',
    'feature',
    'taskType',
    'source',
    'voiceProfileId',
    'deliveryRequested',
    'rights',
    'state',
    'outputArtifactRef',
    'cancel',
    'delivery',
    'lastError',
    'observedAt',
    'mockOnly',
    'realOperationAllowed',
  ]),
)

const DELIVERY_SHAPED_KEYS = Object.freeze(
  new Set([
    'send',
    'sendMessage',
    'sent',
    'sentToWechat',
    'delivered',
    'applied',
    'wechat',
    'targetChatId',
    'targetId',
    'targetName',
    'chatId',
    'groupId',
    'recipient',
    'token',
    'accessToken',
    'apiKey',
    'password',
    'secret',
    'authorization',
    'backend',
    'backendId',
    'providerId',
    'params',
    'url',
    'path',
  ]),
)

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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function readField(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor) return { present: false, accessor: false, value: undefined }
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return { present: true, accessor: true, value: undefined }
  }
  return { present: true, accessor: false, value: descriptor.value }
}

function readBooleanField(object, key) {
  const field = readField(object, key)
  if (!field.present || field.accessor || typeof field.value !== 'boolean') return null
  return field.value
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
    if (!isPlainObject(taskRecord)) {
      return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, 'taskRecord', 'expected a plain task record')])
    }

    // 1. Reject a forged or unknown record surface before reading any semantic field.
    for (const key of Object.keys(taskRecord)) {
      if (ALLOWED_RECORD_KEYS.has(key)) continue
      const deliveryShaped = DELIVERY_SHAPED_KEYS.has(key)
      return failOf([
        issue(
          deliveryShaped ? AUDIO_ERRORS.DELIVERY_FORBIDDEN : AUDIO_ERRORS.UNKNOWN_FIELD,
          key,
          deliveryShaped
            ? 'delivery fields are not part of an audio task record'
            : 'unknown record field',
        ),
      ])
    }

    // 2. The offline contract can never claim a real operation, and an unknown task schema must
    // not cross the delivery boundary even if it happens to reuse the same field names.
    if (readField(taskRecord, 'schemaVersion').value !== 1) {
      return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, 'schemaVersion', 'unsupported task schema version')])
    }
    if (readField(taskRecord, 'mockOnly').value !== true) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'mockOnly', 'mockOnly must stay true')])
    }
    if (readField(taskRecord, 'realOperationAllowed').value !== false) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'realOperationAllowed', 'real operations are not allowed')])
    }

    // 3. An audio task record must never already carry a delivery identity or sent state.
    const delivery = readField(taskRecord, 'delivery')
    const deliveryValue = delivery.value
    const deliveryClean =
      delivery.present &&
      !delivery.accessor &&
      isPlainObject(deliveryValue) &&
      readField(deliveryValue, 'state').value === 'NOT_REQUESTED' &&
      readField(deliveryValue, 'deliveryId').value === null
    if (!deliveryClean) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'delivery', 'task record must not hold a delivery id or sent state')])
    }

    // 4. A cancellation request or confirmation can never be handed to Relay.
    const cancel = readField(taskRecord, 'cancel')
    const cancelValue = cancel.value
    const cancelClean =
      cancel.present &&
      !cancel.accessor &&
      isPlainObject(cancelValue) &&
      readBooleanField(cancelValue, 'requested') === false &&
      readBooleanField(cancelValue, 'confirmed') === false
    if (!cancelClean) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'cancel', 'cancelled tasks can never become delivery candidates')])
    }

    // 5. Only the preinstalled Fake fixture rights are acceptable; real rights belong to Plan 12/13.
    const rights = readField(taskRecord, 'rights')
    const rightsValue = rights.value
    if (!rights.present || rights.accessor || !isPlainObject(rightsValue) || readField(rightsValue, 'state').value !== 'CONFIRMED_FIXTURE') {
      return failOf([issue(AUDIO_ERRORS.RIGHTS_UNCONFIRMED, 'rights.state', 'fixture rights are required for a Fake candidate')])
    }

    // 6. Classify the task state.
    const stateField = readField(taskRecord, 'state')
    if (!stateField.present || stateField.accessor || typeof stateField.value !== 'string') {
      return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, 'state', 'task state is required')])
    }
    const state = stateField.value
    if (!TASK_STATES.includes(state)) {
      return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, 'state', 'unknown task state')])
    }
    if (UNSAFE_STATES.has(state)) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'state', 'this task state can never be handed to Relay')])
    }
    if (state !== 'SAVED') {
      return failOf([issue(AUDIO_ERRORS.STATE_CONFLICT, 'state', 'only a saved Fake artifact can be proposed for delivery')])
    }

    // 7. A saved candidate needs a real opaque output artifact reference.
    const artifactField = readField(taskRecord, 'outputArtifactRef')
    if (!artifactField.present || artifactField.accessor || artifactField.value === null) {
      return failOf([issue(AUDIO_ERRORS.ARTIFACT_REQUIRED, 'outputArtifactRef', 'a saved task needs an output artifact')])
    }
    if (typeof artifactField.value !== 'string' || !ARTIFACT_REF_PATTERN.test(artifactField.value)) {
      return failOf([issue(AUDIO_ERRORS.INVALID_ID, 'outputArtifactRef', 'opaque artifact reference required')])
    }
    const artifactRef = artifactField.value

    // 8. The user must have expressed a delivery intent candidate; this is still not authorization.
    if (readField(taskRecord, 'deliveryRequested').value !== true) {
      return failOf([issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'deliveryRequested', 'no delivery intent was recorded')])
    }

    // 9. Both ids are injected by the caller. This module mints nothing.
    const taskIdField = readField(taskRecord, 'taskId')
    if (!taskIdField.present || taskIdField.accessor || typeof taskIdField.value !== 'string' || !TASK_ID_PATTERN.test(taskIdField.value)) {
      return failOf([issue(AUDIO_ERRORS.INVALID_ID, 'taskId', 'opaque task id required')])
    }
    const taskId = taskIdField.value
    if (typeof deliveryId !== 'string' || !DELIVERY_ID_PATTERN.test(deliveryId)) {
      return failOf([issue(AUDIO_ERRORS.INVALID_ID, 'deliveryId', 'opaque delivery id required')])
    }
    if (deliveryId === taskId) {
      return failOf([issue(AUDIO_ERRORS.INVALID_ID, 'deliveryId', 'delivery id must differ from the task id')])
    }

    return {
      ok: true,
      value: Object.freeze({
        schemaVersion: RELAY_CANDIDATE_SCHEMA_VERSION,
        taskId,
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
