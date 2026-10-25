/* Whale Audio Core — CoreTask v1 pure contract (Plan 05-A, OFFLINE).
 *
 * One shared task shape for both Whale Voice (TTS) and Whale Singing (SVC). This module only
 * validates drafts, drives an in-memory Fake state machine and projects a redacted view.
 * It never performs model inference, filesystem access, network calls, child-process work,
 * clock reads, random generation or WeChat delivery. Every id and timestamp is injected by the
 * caller, so this module cannot promise global uniqueness and must not be mistaken for the
 * future persistence layer (Plan 08).
 *
 * Safety invariants:
 * - user data never throws: failures return { ok:false, errors:[{ code, path, reason }] };
 * - accepted values are fresh deep-frozen copies, so callers never share mutable state;
 * - mockOnly:true and realOperationAllowed:false are fixed and cannot be overridden by input;
 * - SAVED only means "Fake artifact saved", never config APPLIED and never Relay SENT_LOCAL;
 * - UNKNOWN is terminal: there is no automatic retry, re-send or backend switch here.
 */

export const AUDIO_TASK_SCHEMA_VERSION = 1

export const AUDIO_ERRORS = Object.freeze({
  INVALID_REQUEST: 'AUDIO_INVALID_REQUEST',
  INVALID_ID: 'AUDIO_INVALID_ID',
  UNKNOWN_FIELD: 'AUDIO_UNKNOWN_FIELD',
  TYPE_MISMATCH: 'AUDIO_TYPE_MISMATCH',
  STATE_CONFLICT: 'AUDIO_STATE_CONFLICT',
  RIGHTS_UNCONFIRMED: 'AUDIO_RIGHTS_UNCONFIRMED',
  DELIVERY_FORBIDDEN: 'AUDIO_DELIVERY_FORBIDDEN',
  ARTIFACT_REQUIRED: 'AUDIO_ARTIFACT_REQUIRED',
})

export const AUDIO_TASK_STATES = Object.freeze({
  CREATED: 'CREATED',
  BLOCKED_RIGHTS: 'BLOCKED_RIGHTS',
  PROCESSING: 'PROCESSING',
  ARTIFACT_READY: 'ARTIFACT_READY',
  SAVED: 'SAVED',
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
})

export const AUDIO_TASK_STATE_LIST = Object.freeze(Object.values(AUDIO_TASK_STATES))

export const AUDIO_TASK_FEATURES = Object.freeze({
  VOICE_BUBBLES: 'voice-bubbles',
  SINGING: 'singing',
})

export const AUDIO_TASK_TYPES = Object.freeze({ TTS: 'TTS', SVC: 'SVC' })

export const AUDIO_SOURCE_KINDS = Object.freeze({ TEXT_REF: 'TEXT_REF', AUDIO_REF: 'AUDIO_REF' })

export const AUDIO_RIGHTS_STATES = Object.freeze({
  // CONFIRMED_FIXTURE only covers the preinstalled Fake fixtures of this offline contract.
  // It is never evidence of a real user authorization for real media.
  CONFIRMED_FIXTURE: 'CONFIRMED_FIXTURE',
  UNVERIFIED: 'UNVERIFIED',
})

export const AUDIO_TASK_FAILURE_CODES = Object.freeze(['AUDIO_FAKE_FAILURE'])

const MOCK_NOTICE_ZH = '（演示状态，尚未接入真实生成）'
const MESSAGE_BASE_ZH = Object.freeze({
  CREATED: '演示任务已创建，还没有开始生成。',
  BLOCKED_RIGHTS: '还没有确认音色或素材的使用权，暂时不能开始生成。',
  PROCESSING: '演示处理中。',
  ARTIFACT_READY: '演示音频已经生成，等待保存。',
  SAVED: '已保存到演示资产库；这不代表已经发送到微信。',
  CANCEL_REQUESTED: '已收到取消请求，正在等待确认；这不证明真实处理已经停止。',
  CANCELLED: '任务已取消。',
  FAILED: '任务失败，可以重新检查或换一个方案。',
  UNKNOWN: '结果未知，需要人工确认；不会自动重发。',
})

/** Fixed Simplified-Chinese UI text per state. Never composed from user input. */
export const AUDIO_TASK_MESSAGES_ZH = Object.freeze(
  Object.fromEntries(Object.entries(MESSAGE_BASE_ZH).map(([state, text]) => [state, text + MOCK_NOTICE_ZH])),
)

const FEATURE_LIST = Object.freeze(Object.values(AUDIO_TASK_FEATURES))
const TASK_TYPE_LIST = Object.freeze(Object.values(AUDIO_TASK_TYPES))
const SOURCE_KIND_LIST = Object.freeze(Object.values(AUDIO_SOURCE_KINDS))
const RIGHTS_STATE_LIST = Object.freeze(Object.values(AUDIO_RIGHTS_STATES))

const FEATURE_TASK_TYPE = Object.freeze({
  'voice-bubbles': 'TTS',
  singing: 'SVC',
})

const EXPECTED_SOURCE_KIND = Object.freeze({
  TTS: 'TEXT_REF',
  SVC: 'AUDIO_REF',
})

const TERMINAL_STATES = Object.freeze(new Set(['SAVED', 'CANCELLED', 'FAILED', 'UNKNOWN']))

const TASK_ID_PATTERN = /^task:[A-Za-z0-9_-]{1,64}$/
const VOICE_PROFILE_PATTERN = /^voice:[A-Za-z0-9_-]{1,64}$/
const ARTIFACT_REF_PATTERN = /^artifact:[A-Za-z0-9_-]{1,64}$/
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/

const DRAFT_KEYS = Object.freeze(
  new Set(['schemaVersion', 'taskId', 'feature', 'taskType', 'source', 'voiceProfileId', 'deliveryRequested', 'rights']),
)
const SOURCE_KEYS = Object.freeze(new Set(['kind', 'ref']))
const RIGHTS_KEYS = Object.freeze(new Set(['state']))
const METADATA_KEYS = Object.freeze(new Set(['observedAt']))
const LAST_ERROR_KEYS = Object.freeze(new Set(['code']))
const CANCEL_KEYS = Object.freeze(new Set(['requested', 'confirmed']))
const DELIVERY_KEYS = Object.freeze(new Set(['state', 'deliveryId']))
const RECORD_KEYS = Object.freeze(
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

// Keys that would smuggle real delivery intent, targets or credentials into the audio task
// contract. They are rejected as unknown fields and reported with a delivery-specific reason.
const SENSITIVE_KEYS = Object.freeze(
  new Set([
    'send',
    'sendMessage',
    'sent',
    'sentToWechat',
    'delivered',
    'applied',
    'wechat',
    'wechatAgent',
    'targetChatId',
    'targetId',
    'targetName',
    'chatId',
    'groupId',
    'recipient',
    'token',
    'accessToken',
    'access_token',
    'apiKey',
    'api_key',
    'password',
    'secret',
    'authorization',
    'backend',
    'backendId',
    'senderBackend',
    'providerId',
    'params',
    'songId',
    'url',
    'path',
  ]),
)

const ACTION_FIELDS = Object.freeze({
  BEGIN_PROCESS: Object.freeze([]),
  ATTACH_FAKE_ARTIFACT: Object.freeze(['artifactRef']),
  MARK_SAVED: Object.freeze([]),
  REQUEST_CANCEL: Object.freeze([]),
  CONFIRM_CANCEL: Object.freeze([]),
  FAIL: Object.freeze(['code']),
  MARK_UNKNOWN: Object.freeze([]),
})

function issue(code, path, reason) {
  return { code, path, reason }
}

function failOf(errors) {
  return { ok: false, errors }
}

/** Run a validation body so that unexpected input shapes still return a structured error. */
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

/**
 * Read an own data property without invoking getters or inherited values. Accessor properties
 * are reported to the caller as `accessor: true` and are never executed.
 */
function readField(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor) return { present: false, accessor: false, value: undefined }
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return { present: true, accessor: true, value: undefined }
  }
  return { present: true, accessor: false, value: descriptor.value }
}

function joinPath(prefix, key) {
  return prefix ? prefix + '.' + key : key
}

function rejectUnknownKeys(object, allowed, prefix, errors) {
  for (const key of Object.keys(object)) {
    if (allowed.has(key)) continue
    const forged = SENSITIVE_KEYS.has(key)
    errors.push(
      issue(
        AUDIO_ERRORS.UNKNOWN_FIELD,
        joinPath(prefix, key),
        forged ? 'sensitive or delivery field is not allowed here' : 'unknown field is not allowed',
      ),
    )
  }
}

/**
 * Reject cyclic or repeatedly referenced object graphs. The contract only accepts JSON-shaped
 * trees; a cycle or a shared node cannot be copied deterministically, so it fails closed.
 */
function containsCycle(root) {
  const stack = [{ node: root, depth: 0 }]
  const seen = new Set()
  let budget = 64
  while (stack.length > 0) {
    const item = stack.pop()
    const node = item.node
    if (node === null || typeof node !== 'object') continue
    if (item.depth > 4) return true
    // Arrays are never part of this contract, and walking a huge array would be wasted work.
    if (Array.isArray(node)) return true
    if (seen.has(node)) return true
    seen.add(node)
    budget -= 1
    if (budget < 0) return true
    const keys = Object.keys(node)
    if (keys.length > 64) return true
    for (const key of keys) {
      const child = readField(node, key)
      stack.push({ node: child.accessor ? null : child.value, depth: item.depth + 1 })
    }
  }
  return false
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

/** Strict UTC RFC3339 check with calendar validation; no clock or timezone database is used. */
function isRfc3339Utc(value) {
  if (typeof value !== 'string') return false
  const match = TIMESTAMP_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  if (year < 1 || month < 1 || month > 12) return false
  if (hour > 23 || minute > 59 || second > 59) return false
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]
}

function readSchemaVersion(object, errors, prefix) {
  const path = joinPath(prefix, 'schemaVersion')
  const field = readField(object, 'schemaVersion')
  if (!field.present) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'required'))
    return null
  }
  if (field.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'accessor property is not accepted'))
    return null
  }
  if (!Number.isInteger(field.value)) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'expected integer 1'))
    return null
  }
  if (field.value !== AUDIO_TASK_SCHEMA_VERSION) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'unsupported schema version'))
    return null
  }
  return field.value
}

function readString(object, key, prefix, pattern, code, reason, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (!field.present) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'required'))
    return null
  }
  if (field.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'accessor property is not accepted'))
    return null
  }
  if (typeof field.value !== 'string') {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'expected string'))
    return null
  }
  if (!pattern.test(field.value)) {
    errors.push(issue(code, path, reason))
    return null
  }
  return field.value
}

function readEnum(object, key, prefix, allowed, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (!field.present) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'required'))
    return null
  }
  if (field.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'accessor property is not accepted'))
    return null
  }
  if (typeof field.value !== 'string') {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'expected string'))
    return null
  }
  if (!allowed.includes(field.value)) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'unsupported value'))
    return null
  }
  return field.value
}

function readBoolean(object, key, prefix, required, fallback, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (!field.present) {
    if (required) errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'required'))
    return fallback
  }
  if (field.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'accessor property is not accepted'))
    return fallback
  }
  if (typeof field.value !== 'boolean') {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'expected boolean'))
    return fallback
  }
  return field.value
}

function readObject(object, key, prefix, allowed, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (!field.present) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'required'))
    return null
  }
  if (field.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'accessor property is not accepted'))
    return null
  }
  if (!isPlainObject(field.value)) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'expected plain object'))
    return null
  }
  rejectUnknownKeys(field.value, allowed, path, errors)
  return field.value
}

function readTimestamp(object, key, prefix, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (!field.present) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'required'))
    return null
  }
  if (field.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, path, 'accessor property is not accepted'))
    return null
  }
  if (!isRfc3339Utc(field.value)) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, path, 'expected a UTC RFC3339 timestamp'))
    return null
  }
  return field.value
}

function readDraftShape(draft) {
  const errors = []
  if (!isPlainObject(draft)) return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, '$', 'expected a plain object')])
  if (containsCycle(draft)) {
    return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, '$', 'cyclic or repeatedly referenced input is not accepted')])
  }
  rejectUnknownKeys(draft, DRAFT_KEYS, '', errors)
  const schemaVersion = readSchemaVersion(draft, errors, '')
  const taskId = readString(draft, 'taskId', '', TASK_ID_PATTERN, AUDIO_ERRORS.INVALID_ID, 'opaque task id required', errors)
  const feature = readEnum(draft, 'feature', '', FEATURE_LIST, errors)
  const taskType = readEnum(draft, 'taskType', '', TASK_TYPE_LIST, errors)
  const voiceProfileId = readString(
    draft,
    'voiceProfileId',
    '',
    VOICE_PROFILE_PATTERN,
    AUDIO_ERRORS.INVALID_ID,
    'opaque shared voice profile reference required',
    errors,
  )
  const deliveryRequested = readBoolean(draft, 'deliveryRequested', '', false, false, errors)
  const sourceAnchor = readObject(draft, 'source', '', SOURCE_KEYS, errors)
  let source = null
  if (sourceAnchor) {
    const kind = readEnum(sourceAnchor, 'kind', 'source', SOURCE_KIND_LIST, errors)
    const ref = readString(
      sourceAnchor,
      'ref',
      'source',
      ARTIFACT_REF_PATTERN,
      AUDIO_ERRORS.INVALID_ID,
      'opaque artifact reference required',
      errors,
    )
    if (kind && ref) source = { kind, ref }
  }
  const rightsAnchor = readObject(draft, 'rights', '', RIGHTS_KEYS, errors)
  let rights = null
  if (rightsAnchor) {
    const state = readEnum(rightsAnchor, 'state', 'rights', RIGHTS_STATE_LIST, errors)
    if (state) rights = { state }
  }
  if (feature && taskType && FEATURE_TASK_TYPE[feature] !== taskType) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'taskType', 'task type does not match the selected feature'))
  }
  if (source && taskType && source.kind !== EXPECTED_SOURCE_KIND[taskType]) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'source.kind', 'source kind does not match the task type'))
  }
  if (errors.length > 0) return failOf(errors)
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion,
      taskId,
      feature,
      taskType,
      source: Object.freeze({ kind: source.kind, ref: source.ref }),
      voiceProfileId,
      deliveryRequested,
      rights: Object.freeze({ state: rights.state }),
    }),
  }
}

function freezeRecord(fields) {
  return Object.freeze({
    schemaVersion: fields.schemaVersion,
    taskId: fields.taskId,
    feature: fields.feature,
    taskType: fields.taskType,
    source: Object.freeze({ kind: fields.source.kind, ref: fields.source.ref }),
    voiceProfileId: fields.voiceProfileId,
    deliveryRequested: fields.deliveryRequested,
    rights: Object.freeze({ state: fields.rights.state }),
    state: fields.state,
    outputArtifactRef: fields.outputArtifactRef,
    cancel: Object.freeze({ requested: fields.cancel.requested, confirmed: fields.cancel.confirmed }),
    delivery: Object.freeze({ state: fields.delivery.state, deliveryId: fields.delivery.deliveryId }),
    lastError: fields.lastError ? Object.freeze({ code: fields.lastError.code }) : null,
    observedAt: fields.observedAt,
    mockOnly: true,
    realOperationAllowed: false,
  })
}

function cloneRecord(record) {
  return freezeRecord({
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    feature: record.feature,
    taskType: record.taskType,
    source: { kind: record.source.kind, ref: record.source.ref },
    voiceProfileId: record.voiceProfileId,
    deliveryRequested: record.deliveryRequested,
    rights: { state: record.rights.state },
    state: record.state,
    outputArtifactRef: record.outputArtifactRef,
    cancel: { requested: record.cancel.requested, confirmed: record.cancel.confirmed },
    delivery: { state: 'NOT_REQUESTED', deliveryId: null },
    lastError: record.lastError ? { code: record.lastError.code } : null,
    observedAt: record.observedAt,
  })
}

function withPatch(record, patch) {
  return cloneRecord({
    ...record,
    ...patch,
    source: patch.source || record.source,
    rights: patch.rights || record.rights,
    cancel: patch.cancel || record.cancel,
    lastError: Object.prototype.hasOwnProperty.call(patch, 'lastError') ? patch.lastError : record.lastError,
  })
}

/**
 * Validate and normalise an AudioTaskDraft v1.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function validateAudioTaskDraft(draft) {
  return attempt(() => readDraftShape(draft))
}

/**
 * Build the initial in-memory task record. Timestamps are injected, never generated here.
 * @param {object} draft AudioTaskDraft v1
 * @param {{observedAt:string}} metadata caller-supplied UTC RFC3339 observation time
 */
export function createAudioTaskRecord(draft, metadata) {
  return attempt(() => {
    const validated = readDraftShape(draft)
    if (!validated.ok) return validated
    const errors = []
    if (!isPlainObject(metadata)) return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, 'metadata', 'expected plain object')])
    rejectUnknownKeys(metadata, METADATA_KEYS, 'metadata', errors)
    const observedAt = readTimestamp(metadata, 'observedAt', 'metadata', errors)
    if (errors.length > 0) return failOf(errors)
    const value = validated.value
    const state =
      value.rights.state === AUDIO_RIGHTS_STATES.CONFIRMED_FIXTURE
        ? AUDIO_TASK_STATES.CREATED
        : AUDIO_TASK_STATES.BLOCKED_RIGHTS
    return {
      ok: true,
      value: freezeRecord({
        schemaVersion: value.schemaVersion,
        taskId: value.taskId,
        feature: value.feature,
        taskType: value.taskType,
        source: { kind: value.source.kind, ref: value.source.ref },
        voiceProfileId: value.voiceProfileId,
        deliveryRequested: value.deliveryRequested,
        rights: { state: value.rights.state },
        state,
        outputArtifactRef: null,
        cancel: { requested: false, confirmed: false },
        delivery: { state: 'NOT_REQUESTED', deliveryId: null },
        lastError: null,
        observedAt,
      }),
    }
  })
}

function conflict(reason) {
  return failOf([issue(AUDIO_ERRORS.STATE_CONFLICT, 'state', reason)])
}

function applyAction(record, action) {
  const state = record.state
  if (state === AUDIO_TASK_STATES.BLOCKED_RIGHTS) {
    const code =
      action.type === 'BEGIN_PROCESS' || action.type === 'ATTACH_FAKE_ARTIFACT'
        ? AUDIO_ERRORS.RIGHTS_UNCONFIRMED
        : AUDIO_ERRORS.STATE_CONFLICT
    return failOf([issue(code, 'state', 'rights are not confirmed for this task')])
  }
  if (TERMINAL_STATES.has(state)) {
    return conflict('terminal state cannot transition again')
  }
  switch (action.type) {
    case 'BEGIN_PROCESS': {
      if (state !== AUDIO_TASK_STATES.CREATED) return conflict('only CREATED tasks can begin Fake processing')
      if (record.rights.state !== AUDIO_RIGHTS_STATES.CONFIRMED_FIXTURE) {
        return failOf([issue(AUDIO_ERRORS.RIGHTS_UNCONFIRMED, 'state', 'rights are not confirmed for this task')])
      }
      return { ok: true, value: withPatch(record, { state: AUDIO_TASK_STATES.PROCESSING }) }
    }
    case 'ATTACH_FAKE_ARTIFACT': {
      if (state !== AUDIO_TASK_STATES.PROCESSING) return conflict('only PROCESSING tasks can attach a Fake artifact')
      if (record.rights.state !== AUDIO_RIGHTS_STATES.CONFIRMED_FIXTURE) {
        return failOf([issue(AUDIO_ERRORS.RIGHTS_UNCONFIRMED, 'state', 'rights are not confirmed for this task')])
      }
      return {
        ok: true,
        value: withPatch(record, {
          state: AUDIO_TASK_STATES.ARTIFACT_READY,
          outputArtifactRef: action.artifactRef,
        }),
      }
    }
    case 'MARK_SAVED': {
      if (state !== AUDIO_TASK_STATES.ARTIFACT_READY) return conflict('only ARTIFACT_READY tasks can be saved')
      if (!record.outputArtifactRef) {
        return failOf([issue(AUDIO_ERRORS.ARTIFACT_REQUIRED, 'outputArtifactRef', 'a saved task needs an output artifact')])
      }
      return { ok: true, value: withPatch(record, { state: AUDIO_TASK_STATES.SAVED }) }
    }
    case 'REQUEST_CANCEL': {
      if (
        state !== AUDIO_TASK_STATES.CREATED &&
        state !== AUDIO_TASK_STATES.PROCESSING &&
        state !== AUDIO_TASK_STATES.ARTIFACT_READY
      ) {
        return conflict('only CREATED, PROCESSING or ARTIFACT_READY tasks can request cancellation')
      }
      return {
        ok: true,
        value: withPatch(record, {
          state: AUDIO_TASK_STATES.CANCEL_REQUESTED,
          cancel: { requested: true, confirmed: false },
        }),
      }
    }
    case 'CONFIRM_CANCEL': {
      if (state !== AUDIO_TASK_STATES.CANCEL_REQUESTED) return conflict('only CANCEL_REQUESTED tasks can confirm cancellation')
      return {
        ok: true,
        value: withPatch(record, {
          state: AUDIO_TASK_STATES.CANCELLED,
          cancel: { requested: true, confirmed: true },
        }),
      }
    }
    case 'FAIL': {
      if (
        state !== AUDIO_TASK_STATES.CREATED &&
        state !== AUDIO_TASK_STATES.PROCESSING &&
        state !== AUDIO_TASK_STATES.ARTIFACT_READY &&
        state !== AUDIO_TASK_STATES.CANCEL_REQUESTED
      ) {
        return conflict('FAIL is not allowed from the current state')
      }
      return {
        ok: true,
        value: withPatch(record, { state: AUDIO_TASK_STATES.FAILED, lastError: { code: action.code } }),
      }
    }
    case 'MARK_UNKNOWN': {
      if (state !== AUDIO_TASK_STATES.PROCESSING && state !== AUDIO_TASK_STATES.CANCEL_REQUESTED) {
        return conflict('MARK_UNKNOWN is only allowed from PROCESSING or CANCEL_REQUESTED')
      }
      return { ok: true, value: withPatch(record, { state: AUDIO_TASK_STATES.UNKNOWN }) }
    }
    default:
      return failOf([issue(AUDIO_ERRORS.UNKNOWN_FIELD, 'action.type', 'unknown action type')])
  }
}

function readAction(input) {
  if (!isPlainObject(input)) return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, 'action', 'expected plain object')])
  const typeField = readField(input, 'type')
  if (!typeField.present || typeField.accessor || typeof typeField.value !== 'string') {
    return failOf([issue(AUDIO_ERRORS.TYPE_MISMATCH, 'action.type', 'action type required')])
  }
  // Own-property lookup only: action names such as "constructor" or "__proto__" must not
  // resolve through Object.prototype and confuse the action table.
  const extraFields = Object.prototype.hasOwnProperty.call(ACTION_FIELDS, typeField.value)
    ? ACTION_FIELDS[typeField.value]
    : null
  if (!extraFields) return failOf([issue(AUDIO_ERRORS.UNKNOWN_FIELD, 'action.type', 'unknown action type')])
  const errors = []
  const allowed = new Set(['type', ...extraFields])
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      errors.push(issue(AUDIO_ERRORS.UNKNOWN_FIELD, 'action.' + key, 'unknown action field'))
    }
  }
  let artifactRef = null
  let code = null
  if (typeField.value === 'ATTACH_FAKE_ARTIFACT') {
    artifactRef = readString(
      input,
      'artifactRef',
      'action',
      ARTIFACT_REF_PATTERN,
      AUDIO_ERRORS.INVALID_ID,
      'opaque artifact reference required',
      errors,
    )
  }
  if (typeField.value === 'FAIL') {
    code = readEnum(input, 'code', 'action', AUDIO_TASK_FAILURE_CODES, errors)
  }
  if (errors.length > 0) return failOf(errors)
  return { ok: true, value: { type: typeField.value, artifactRef, code } }
}

function readRecord(input) {
  if (!isPlainObject(input)) return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, '$', 'expected a plain task record')])
  if (containsCycle(input)) {
    return failOf([issue(AUDIO_ERRORS.INVALID_REQUEST, '$', 'cyclic or repeatedly referenced record is not accepted')])
  }
  const errors = []
  for (const key of Object.keys(input)) {
    if (RECORD_KEYS.has(key)) continue
    const forged = SENSITIVE_KEYS.has(key)
    errors.push(
      issue(
        forged ? AUDIO_ERRORS.DELIVERY_FORBIDDEN : AUDIO_ERRORS.UNKNOWN_FIELD,
        key,
        forged ? 'sent or delivery fields are not part of an audio task record' : 'unknown record field',
      ),
    )
  }
  const schemaVersion = readSchemaVersion(input, errors, '')
  const taskId = readString(input, 'taskId', '', TASK_ID_PATTERN, AUDIO_ERRORS.INVALID_ID, 'opaque task id required', errors)
  const feature = readEnum(input, 'feature', '', FEATURE_LIST, errors)
  const taskType = readEnum(input, 'taskType', '', TASK_TYPE_LIST, errors)
  const voiceProfileId = readString(
    input,
    'voiceProfileId',
    '',
    VOICE_PROFILE_PATTERN,
    AUDIO_ERRORS.INVALID_ID,
    'opaque shared voice profile reference required',
    errors,
  )
  const deliveryRequested = readBoolean(input, 'deliveryRequested', '', true, false, errors)
  const sourceAnchor = readObject(input, 'source', '', SOURCE_KEYS, errors)
  let source = null
  if (sourceAnchor) {
    const kind = readEnum(sourceAnchor, 'kind', 'source', SOURCE_KIND_LIST, errors)
    const ref = readString(
      sourceAnchor,
      'ref',
      'source',
      ARTIFACT_REF_PATTERN,
      AUDIO_ERRORS.INVALID_ID,
      'opaque artifact reference required',
      errors,
    )
    if (kind && ref) source = { kind, ref }
  }
  const rightsAnchor = readObject(input, 'rights', '', RIGHTS_KEYS, errors)
  let rights = null
  if (rightsAnchor) {
    const state = readEnum(rightsAnchor, 'state', 'rights', RIGHTS_STATE_LIST, errors)
    if (state) rights = { state }
  }
  const state = readEnum(input, 'state', '', AUDIO_TASK_STATE_LIST, errors)
  const observedAt = readTimestamp(input, 'observedAt', '', errors)

  const artifactField = readField(input, 'outputArtifactRef')
  let outputArtifactRef = null
  if (!artifactField.present) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, 'outputArtifactRef', 'required (null when absent)'))
  } else if (artifactField.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'outputArtifactRef', 'accessor property is not accepted'))
  } else if (artifactField.value !== null) {
    if (typeof artifactField.value !== 'string') {
      errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'outputArtifactRef', 'expected string or null'))
    } else if (!ARTIFACT_REF_PATTERN.test(artifactField.value)) {
      errors.push(issue(AUDIO_ERRORS.INVALID_ID, 'outputArtifactRef', 'opaque artifact reference required'))
    } else {
      outputArtifactRef = artifactField.value
    }
  }

  const cancelAnchor = readObject(input, 'cancel', '', CANCEL_KEYS, errors)
  let cancelRequested = false
  let cancelConfirmed = false
  if (cancelAnchor) {
    cancelRequested = readBoolean(cancelAnchor, 'requested', 'cancel', true, false, errors)
    cancelConfirmed = readBoolean(cancelAnchor, 'confirmed', 'cancel', true, false, errors)
  }

  const deliveryAnchor = readObject(input, 'delivery', '', DELIVERY_KEYS, errors)
  if (deliveryAnchor) {
    const deliveryState = readField(deliveryAnchor, 'state')
    const deliveryId = readField(deliveryAnchor, 'deliveryId')
    const clean =
      deliveryState.present &&
      !deliveryState.accessor &&
      deliveryState.value === 'NOT_REQUESTED' &&
      deliveryId.present &&
      !deliveryId.accessor &&
      deliveryId.value === null
    if (!clean) {
      errors.push(issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'delivery', 'audio task records never carry a delivery id or sent state'))
    }
  }

  const lastErrorField = readField(input, 'lastError')
  let lastError = null
  if (!lastErrorField.present) {
    errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, 'lastError', 'required (null when absent)'))
  } else if (lastErrorField.accessor) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'lastError', 'accessor property is not accepted'))
  } else if (lastErrorField.value !== null) {
    if (!isPlainObject(lastErrorField.value)) {
      errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'lastError', 'expected object or null'))
    } else {
      rejectUnknownKeys(lastErrorField.value, LAST_ERROR_KEYS, 'lastError', errors)
      const code = readEnum(lastErrorField.value, 'code', 'lastError', AUDIO_TASK_FAILURE_CODES, errors)
      if (code) lastError = { code }
    }
  }

  const mockOnly = readField(input, 'mockOnly')
  if (!mockOnly.present || mockOnly.accessor || mockOnly.value !== true) {
    errors.push(issue(AUDIO_ERRORS.DELIVERY_FORBIDDEN, 'mockOnly', 'mockOnly must stay true in this offline contract'))
  }
  const realOperationAllowed = readField(input, 'realOperationAllowed')
  if (!realOperationAllowed.present || realOperationAllowed.accessor || realOperationAllowed.value !== false) {
    errors.push(
      issue(
        AUDIO_ERRORS.DELIVERY_FORBIDDEN,
        'realOperationAllowed',
        'real operations are not allowed in this offline contract',
      ),
    )
  }

  if (feature && taskType && FEATURE_TASK_TYPE[feature] !== taskType) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'taskType', 'task type does not match the record feature'))
  }
  if (source && taskType && source.kind !== EXPECTED_SOURCE_KIND[taskType]) {
    errors.push(issue(AUDIO_ERRORS.TYPE_MISMATCH, 'source.kind', 'source kind does not match the task type'))
  }
  if (rights && state) {
    const blocked = state === AUDIO_TASK_STATES.BLOCKED_RIGHTS
    const unverified = rights.state === AUDIO_RIGHTS_STATES.UNVERIFIED
    if (unverified !== blocked) {
      errors.push(issue(AUDIO_ERRORS.RIGHTS_UNCONFIRMED, 'rights.state', 'rights state must match the BLOCKED_RIGHTS task state'))
    }
  }
  if (state) {
    const needsArtifact = state === AUDIO_TASK_STATES.ARTIFACT_READY || state === AUDIO_TASK_STATES.SAVED
    // Cancelling or failing after a Fake artifact exists legitimately keeps that artifact around;
    // only the pre-generation states must never carry one.
    const allowsArtifact =
      needsArtifact ||
      state === AUDIO_TASK_STATES.CANCEL_REQUESTED ||
      state === AUDIO_TASK_STATES.CANCELLED ||
      state === AUDIO_TASK_STATES.FAILED ||
      state === AUDIO_TASK_STATES.UNKNOWN
    if (needsArtifact && !outputArtifactRef) {
      errors.push(issue(AUDIO_ERRORS.ARTIFACT_REQUIRED, 'outputArtifactRef', 'this state needs an output artifact'))
    }
    if (!allowsArtifact && outputArtifactRef) {
      errors.push(issue(AUDIO_ERRORS.STATE_CONFLICT, 'outputArtifactRef', 'this state cannot hold an output artifact'))
    }
    if (state === AUDIO_TASK_STATES.CANCELLED && !(cancelRequested && cancelConfirmed)) {
      errors.push(issue(AUDIO_ERRORS.STATE_CONFLICT, 'cancel', 'CANCELLED requires a requested and confirmed cancellation'))
    }
    if (state === AUDIO_TASK_STATES.CANCEL_REQUESTED && !(cancelRequested && !cancelConfirmed)) {
      errors.push(issue(AUDIO_ERRORS.STATE_CONFLICT, 'cancel', 'CANCEL_REQUESTED requires requested without confirmation'))
    }
    if (cancelConfirmed && state !== AUDIO_TASK_STATES.CANCELLED) {
      errors.push(issue(AUDIO_ERRORS.STATE_CONFLICT, 'cancel.confirmed', 'only CANCELLED tasks confirm a cancellation'))
    }
    if (cancelRequested && !['CANCEL_REQUESTED', 'CANCELLED', 'FAILED', 'UNKNOWN'].includes(state)) {
      errors.push(issue(AUDIO_ERRORS.STATE_CONFLICT, 'cancel.requested', 'this state cannot hold a cancellation request'))
    }
    if (state === AUDIO_TASK_STATES.FAILED) {
      if (!lastError) errors.push(issue(AUDIO_ERRORS.INVALID_REQUEST, 'lastError', 'FAILED requires a public failure code'))
    } else if (lastError) {
      errors.push(issue(AUDIO_ERRORS.STATE_CONFLICT, 'lastError', 'only FAILED tasks carry a failure code'))
    }
  }
  if (errors.length > 0) return failOf(errors)
  return {
    ok: true,
    value: freezeRecord({
      schemaVersion,
      taskId,
      feature,
      taskType,
      source,
      voiceProfileId,
      deliveryRequested,
      rights,
      state,
      outputArtifactRef,
      cancel: { requested: cancelRequested, confirmed: cancelConfirmed },
      delivery: { state: 'NOT_REQUESTED', deliveryId: null },
      lastError,
      observedAt,
    }),
  }
}

/**
 * Apply exactly one Fake state transition. The input record is never modified and the result is
 * a fresh deep-frozen record. This function does not run a provider, cancel a process or send.
 * @param {object} record current task record
 * @param {{type:string,artifactRef?:string,code?:string}} action one of the seven allowed actions
 */
export function transitionAudioTask(record, action) {
  return attempt(() => {
    const current = readRecord(record)
    if (!current.ok) return current
    const parsed = readAction(action)
    if (!parsed.ok) return parsed
    const applied = applyAction(current.value, parsed.value)
    if (!applied.ok) return applied
    const verified = readRecord(applied.value)
    if (!verified.ok) {
      return failOf([issue(AUDIO_ERRORS.STATE_CONFLICT, '$', 'transition produced an invalid record')])
    }
    return { ok: true, value: verified.value }
  })
}

/**
 * Redacted projection for the future GUI. Only whitelisted, non-sensitive fields are exposed and
 * the Chinese message comes from a fixed table. Source refs, artifacts, rights and delivery data
 * never leave the Core through this projection.
 */
export function projectAudioTask(record) {
  return attempt(() => {
    const parsed = readRecord(record)
    if (!parsed.ok) return parsed
    const value = parsed.value
    return {
      ok: true,
      value: Object.freeze({
        schemaVersion: value.schemaVersion,
        taskId: value.taskId,
        feature: value.feature,
        taskType: value.taskType,
        state: value.state,
        voiceProfileId: value.voiceProfileId,
        hasInput: true,
        hasOutput: value.outputArtifactRef !== null,
        cancelRequested: value.cancel.requested,
        cancelConfirmed: value.cancel.confirmed,
        deliveryRequested: value.deliveryRequested,
        mockOnly: true,
        realOperationAllowed: false,
        userMessageZh: AUDIO_TASK_MESSAGES_ZH[value.state],
      }),
    }
  })
}
