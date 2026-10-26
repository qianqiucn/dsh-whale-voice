/* Whale Voice SVC — original RVC Fake Gateway protocol (Plan 07-B, OFFLINE).
 *
 * This is an original, dependency-free demonstration protocol for the future singing pipeline. It
 * models a model catalogue, a fixture audio request, seven deterministic simulation outcomes and a
 * strict result contract. It is deliberately inert:
 * - it does not contact any server, open a socket, read a file, start a process or run inference;
 * - it has no clock, randomness, timers, persistence or module-level mutable business state;
 * - every identifier is a fictional fixture and every response stays on the demonstration path;
 * - `submitAllowed` is always false and nothing here can deliver audio or touch WeChat.
 *
 * The fixed `gateway:fixture-rvc` endpoint is a label, not a network address or an allow-list.
 * Real transport, authentication, asset resolution and provider adapters belong to later plans.
 */

export const RVC_FAKE_GATEWAY_SCHEMA_VERSION = 1

export const RVC_FAKE_ERRORS = Object.freeze({
  INVALID_REQUEST: 'RVC_FAKE_INVALID_REQUEST',
  UNKNOWN_FIELD: 'RVC_FAKE_UNKNOWN_FIELD',
  TYPE_MISMATCH: 'RVC_FAKE_TYPE_MISMATCH',
  UNSUPPORTED_VERSION: 'RVC_FAKE_UNSUPPORTED_VERSION',
  MODEL_NOT_AVAILABLE: 'RVC_FAKE_MODEL_NOT_AVAILABLE',
  UNSUPPORTED_FORMAT: 'RVC_FAKE_UNSUPPORTED_FORMAT',
  RIGHTS_UNCONFIRMED: 'RVC_FAKE_RIGHTS_UNCONFIRMED',
  RESOURCE_LIMIT: 'RVC_FAKE_RESOURCE_LIMIT',
  INVALID_CONTEXT: 'RVC_FAKE_INVALID_CONTEXT',
  INVALID_RESULT: 'RVC_FAKE_INVALID_RESULT',
  OFFLINE: 'RVC_FAKE_OFFLINE',
  TIMEOUT: 'RVC_FAKE_TIMEOUT',
  CANCEL_PENDING: 'RVC_FAKE_CANCEL_PENDING',
  CANCELLED: 'RVC_FAKE_CANCELLED',
  UNKNOWN: 'RVC_FAKE_UNKNOWN',
})

export const RVC_FAKE_SCENARIOS = Object.freeze([
  'SUCCESS',
  'OFFLINE',
  'MODEL_MISSING',
  'TIMEOUT',
  'CANCEL_REQUESTED',
  'CANCEL_CONFIRMED',
  'UNKNOWN',
])

export const RVC_FAKE_LIMITS = Object.freeze({
  maxDurationMs: 300000,
  maxByteLength: 52428800,
  inputSampleRates: Object.freeze([16000, 22050, 24000, 32000, 44100, 48000]),
  inputChannels: 1,
  outputSampleRate: 44100,
})

const MODEL_FIXTURE_A = 'rvc-model:fixture-a'
const MODEL_FIXTURE_B = 'rvc-model:fixture-b'
const ENDPOINT_FIXTURE = 'gateway:fixture-rvc'
const OUTPUT_FORMAT_WAV = 'audio/wav'
const RIGHTS_FIXTURE = 'CONFIRMED_FIXTURE'
const ENGINE_FAKE = 'RVC_FAKE'
const REQUEST_ID_PREFIX = 'request:fixture-'
const OUTPUT_REF_PREFIX = 'artifact:fixture-output-'

const SOURCE_REF_PATTERN = /^artifact:fixture-[A-Za-z0-9_-]{1,48}$/
const REQUEST_ID_PATTERN = /^request:fixture-[A-Za-z0-9_-]{1,32}$/
const OUTPUT_REF_PATTERN = /^artifact:fixture-output-[A-Za-z0-9_-]{1,32}$/

const MAX_LAYER_FIELDS = 32
const UNKNOWN_KEY_PLACEHOLDER = '<unknown-key>'

const REQUEST_KEYS = Object.freeze(
  new Set(['schemaVersion', 'sourceAudioRef', 'targetModelId', 'pitchShift', 'outputFormat', 'inputAudio', 'rights']),
)
const AUDIO_KEYS = Object.freeze(new Set(['durationMs', 'byteLength', 'sampleRate', 'channels']))
const RIGHTS_KEYS = Object.freeze(new Set(['state']))
const CONTEXT_KEYS = Object.freeze(new Set(['requestId', 'endpointId', 'scenario']))
const RESULT_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'requestId',
    'engine',
    'targetModelId',
    'status',
    'code',
    'artifactRef',
    'mime',
    'sampleRate',
    'durationMs',
    'cancel',
    'delivery',
    'mockOnly',
    'realOperationAllowed',
    'automaticRetryAllowed',
  ]),
)
const CANCEL_KEYS = Object.freeze(new Set(['requested', 'confirmed']))
const DELIVERY_KEYS = Object.freeze(new Set(['state', 'submitAllowed']))

const MODEL_IDS = Object.freeze([MODEL_FIXTURE_A, MODEL_FIXTURE_B])
const RESULT_STATUSES = Object.freeze([
  'SUCCEEDED_FAKE',
  'OFFLINE',
  'MODEL_NOT_AVAILABLE',
  'TIMEOUT',
  'CANCEL_REQUESTED',
  'CANCELLED_FAKE',
  'UNKNOWN',
])
const ERROR_CODES = Object.freeze(Object.values(RVC_FAKE_ERRORS))

function issue(code, path, reason) {
  return { code, path, reason }
}

function failOf(errors) {
  return { ok: false, errors }
}

function fail(code, path, reason) {
  return failOf([issue(code, path, reason)])
}

function attempt(run) {
  try {
    return run()
  } catch {
    return fail(RVC_FAKE_ERRORS.INVALID_REQUEST, '$', 'input could not be inspected safely')
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

function joinPath(prefix, key) {
  return prefix === '' ? key : prefix + '.' + key
}

/**
 * One own-property policy for every object layer: string keys only, enumerable data properties
 * only, no Symbol keys, no hidden fields, no accessors (never executed) and a fixed field budget.
 * Unknown keys are reported with a placeholder, never with the caller's key text.
 * @returns {boolean} true when every own property is acceptable
 */
function checkLayer(object, allowed, prefix, domainCode, errors) {
  const keys = Reflect.ownKeys(object)
  if (keys.length > MAX_LAYER_FIELDS) {
    errors.push(issue(domainCode, prefix === '' ? '$' : prefix, 'invalid object structure'))
    return false
  }
  let clean = true
  for (const key of keys) {
    if (typeof key === 'symbol' || !allowed.has(key)) {
      errors.push(
        issue(RVC_FAKE_ERRORS.UNKNOWN_FIELD, joinPath(prefix, UNKNOWN_KEY_PLACEHOLDER), 'unknown field is not allowed'),
      )
      clean = false
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    const dataProperty = descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    if (!dataProperty || descriptor.enumerable !== true) {
      errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, joinPath(prefix, key), 'invalid field type or property'))
      clean = false
    }
  }
  return clean
}

function readString(object, key, prefix, domainCode, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (field.accessor) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  if (!field.present || field.value === undefined) {
    errors.push(issue(domainCode, path, 'required'))
    return null
  }
  if (typeof field.value !== 'string') {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  return field.value
}

function readInteger(object, key, prefix, domainCode, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (field.accessor) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  if (!field.present || field.value === undefined) {
    errors.push(issue(domainCode, path, 'required'))
    return null
  }
  if (typeof field.value !== 'number' || !Number.isFinite(field.value) || !Number.isInteger(field.value)) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  return field.value
}

function readObject(object, key, prefix, domainCode, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (field.accessor) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  if (!field.present || field.value === undefined) {
    errors.push(issue(domainCode, path, 'required'))
    return null
  }
  if (!isPlainObject(field.value)) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  return field.value
}

function readBoolean(object, key, prefix, domainCode, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (field.accessor) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  if (!field.present || field.value === undefined) {
    errors.push(issue(domainCode, path, 'required'))
    return null
  }
  if (typeof field.value !== 'boolean') {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  return field.value
}

function freezeModel(modelId, labelZh, simulatedAvailable) {
  return Object.freeze({
    modelId,
    labelZh,
    engine: ENGINE_FAKE,
    simulatedAvailable,
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    mockOnly: true,
    realOperationAllowed: false,
  })
}

/** List the two fictional demonstration models. Every call returns a fresh frozen copy. */
export function listRvcFakeModels() {
  return attempt(() => ({
    ok: true,
    value: Object.freeze([
      freezeModel(MODEL_FIXTURE_A, '演示音色A（非真实模型）', true),
      freezeModel(MODEL_FIXTURE_B, '演示音色B（模拟未就绪）', false),
    ]),
  }))
}

function readRequest(input) {
  if (!isPlainObject(input)) {
    return fail(RVC_FAKE_ERRORS.INVALID_REQUEST, '$', 'invalid object structure')
  }
  const errors = []
  if (!checkLayer(input, REQUEST_KEYS, '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)) {
    return failOf(errors)
  }
  const schemaVersion = readInteger(input, 'schemaVersion', '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
  const sourceAudioRef = readString(input, 'sourceAudioRef', '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
  const targetModelId = readString(input, 'targetModelId', '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
  const pitchShift = readInteger(input, 'pitchShift', '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
  const outputFormat = readString(input, 'outputFormat', '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)

  const audioAnchor = readObject(input, 'inputAudio', '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
  let inputAudio = null
  if (audioAnchor) {
    if (checkLayer(audioAnchor, AUDIO_KEYS, 'inputAudio', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)) {
      const durationMs = readInteger(audioAnchor, 'durationMs', 'inputAudio', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
      const byteLength = readInteger(audioAnchor, 'byteLength', 'inputAudio', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
      const sampleRate = readInteger(audioAnchor, 'sampleRate', 'inputAudio', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
      const channels = readInteger(audioAnchor, 'channels', 'inputAudio', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
      if (durationMs !== null && byteLength !== null && sampleRate !== null && channels !== null) {
        inputAudio = { durationMs, byteLength, sampleRate, channels }
      }
    }
  }

  const rightsAnchor = readObject(input, 'rights', '', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
  let rights = null
  if (rightsAnchor) {
    if (checkLayer(rightsAnchor, RIGHTS_KEYS, 'rights', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)) {
      const state = readString(rightsAnchor, 'state', 'rights', RVC_FAKE_ERRORS.INVALID_REQUEST, errors)
      if (state !== null) rights = { state }
    }
  }

  if (errors.length > 0) return failOf(errors)

  if (schemaVersion !== RVC_FAKE_GATEWAY_SCHEMA_VERSION) {
    return fail(RVC_FAKE_ERRORS.UNSUPPORTED_VERSION, 'schemaVersion', 'unsupported schema version')
  }
  if (!SOURCE_REF_PATTERN.test(sourceAudioRef)) {
    return fail(RVC_FAKE_ERRORS.INVALID_REQUEST, 'sourceAudioRef', 'fixture reference required')
  }
  if (!MODEL_IDS.includes(targetModelId)) {
    return fail(RVC_FAKE_ERRORS.MODEL_NOT_AVAILABLE, 'targetModelId', 'fixture model not registered')
  }
  if (pitchShift < -12 || pitchShift > 12) {
    return fail(RVC_FAKE_ERRORS.RESOURCE_LIMIT, 'pitchShift', 'outside fixture protocol limits')
  }
  if (outputFormat !== OUTPUT_FORMAT_WAV) {
    return fail(RVC_FAKE_ERRORS.UNSUPPORTED_FORMAT, 'outputFormat', 'only fixture audio/wav is supported')
  }
  if (inputAudio.durationMs < 1 || inputAudio.durationMs > RVC_FAKE_LIMITS.maxDurationMs) {
    return fail(RVC_FAKE_ERRORS.RESOURCE_LIMIT, 'inputAudio.durationMs', 'outside fixture protocol limits')
  }
  if (inputAudio.byteLength < 1 || inputAudio.byteLength > RVC_FAKE_LIMITS.maxByteLength) {
    return fail(RVC_FAKE_ERRORS.RESOURCE_LIMIT, 'inputAudio.byteLength', 'outside fixture protocol limits')
  }
  if (!RVC_FAKE_LIMITS.inputSampleRates.includes(inputAudio.sampleRate)) {
    return fail(RVC_FAKE_ERRORS.RESOURCE_LIMIT, 'inputAudio.sampleRate', 'outside fixture protocol limits')
  }
  if (inputAudio.channels !== RVC_FAKE_LIMITS.inputChannels) {
    return fail(RVC_FAKE_ERRORS.RESOURCE_LIMIT, 'inputAudio.channels', 'outside fixture protocol limits')
  }
  if (rights.state !== RIGHTS_FIXTURE) {
    return fail(RVC_FAKE_ERRORS.RIGHTS_UNCONFIRMED, 'rights.state', 'fixture rights required')
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion,
      sourceAudioRef,
      targetModelId,
      pitchShift,
      outputFormat,
      inputAudio: Object.freeze({ ...inputAudio }),
      rights: Object.freeze({ ...rights }),
    }),
  }
}

function readContext(input) {
  if (!isPlainObject(input)) {
    return fail(RVC_FAKE_ERRORS.INVALID_CONTEXT, '$', 'invalid object structure')
  }
  const errors = []
  if (!checkLayer(input, CONTEXT_KEYS, '', RVC_FAKE_ERRORS.INVALID_CONTEXT, errors)) {
    return failOf(errors)
  }
  const requestId = readString(input, 'requestId', '', RVC_FAKE_ERRORS.INVALID_CONTEXT, errors)
  const endpointId = readString(input, 'endpointId', '', RVC_FAKE_ERRORS.INVALID_CONTEXT, errors)
  const scenario = readString(input, 'scenario', '', RVC_FAKE_ERRORS.INVALID_CONTEXT, errors)
  if (errors.length > 0) return failOf(errors)
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return fail(RVC_FAKE_ERRORS.INVALID_CONTEXT, 'requestId', 'fixture reference required')
  }
  if (endpointId !== ENDPOINT_FIXTURE) {
    return fail(RVC_FAKE_ERRORS.INVALID_CONTEXT, 'endpointId', 'unsupported fixture context')
  }
  if (!RVC_FAKE_SCENARIOS.includes(scenario)) {
    return fail(RVC_FAKE_ERRORS.INVALID_CONTEXT, 'scenario', 'unsupported fixture context')
  }
  return { ok: true, value: Object.freeze({ requestId, endpointId, scenario }) }
}

function freezeResult(fields) {
  return Object.freeze({
    schemaVersion: RVC_FAKE_GATEWAY_SCHEMA_VERSION,
    requestId: fields.requestId,
    engine: ENGINE_FAKE,
    targetModelId: fields.targetModelId,
    status: fields.status,
    code: fields.code,
    artifactRef: fields.artifactRef,
    mime: fields.mime,
    sampleRate: fields.sampleRate,
    durationMs: fields.durationMs,
    cancel: Object.freeze({ requested: fields.cancel.requested, confirmed: fields.cancel.confirmed }),
    delivery: Object.freeze({ state: 'NOT_REQUESTED', submitAllowed: false }),
    mockOnly: true,
    realOperationAllowed: false,
    automaticRetryAllowed: false,
  })
}

const SCENARIO_OUTCOMES = Object.freeze({
  OFFLINE: Object.freeze({ status: 'OFFLINE', code: 'RVC_FAKE_OFFLINE' }),
  MODEL_MISSING: Object.freeze({ status: 'MODEL_NOT_AVAILABLE', code: 'RVC_FAKE_MODEL_NOT_AVAILABLE' }),
  TIMEOUT: Object.freeze({ status: 'TIMEOUT', code: 'RVC_FAKE_TIMEOUT' }),
  CANCEL_REQUESTED: Object.freeze({
    status: 'CANCEL_REQUESTED',
    code: 'RVC_FAKE_CANCEL_PENDING',
    cancel: Object.freeze({ requested: true, confirmed: false }),
  }),
  CANCEL_CONFIRMED: Object.freeze({
    status: 'CANCELLED_FAKE',
    code: 'RVC_FAKE_CANCELLED',
    cancel: Object.freeze({ requested: true, confirmed: true }),
  }),
  UNKNOWN: Object.freeze({ status: 'UNKNOWN', code: 'RVC_FAKE_UNKNOWN' }),
})

/** Build the single canonical demonstration result for one validated request and context. */
function buildResult(requestValue, contextValue) {
  const base = {
    requestId: contextValue.requestId,
    targetModelId: requestValue.targetModelId,
    status: null,
    code: null,
    artifactRef: null,
    mime: null,
    sampleRate: null,
    durationMs: null,
    cancel: { requested: false, confirmed: false },
  }

  if (requestValue.targetModelId === MODEL_FIXTURE_B) {
    return freezeResult({
      ...base,
      status: 'MODEL_NOT_AVAILABLE',
      code: RVC_FAKE_ERRORS.MODEL_NOT_AVAILABLE,
    })
  }

  if (contextValue.scenario === 'SUCCESS') {
    return freezeResult({
      ...base,
      status: 'SUCCEEDED_FAKE',
      artifactRef: OUTPUT_REF_PREFIX + contextValue.requestId.slice(REQUEST_ID_PREFIX.length),
      mime: OUTPUT_FORMAT_WAV,
      sampleRate: RVC_FAKE_LIMITS.outputSampleRate,
      durationMs: requestValue.inputAudio.durationMs,
    })
  }

  const outcome = SCENARIO_OUTCOMES[contextValue.scenario]
  return freezeResult({
    ...base,
    status: outcome.status,
    code: outcome.code,
    cancel: outcome.cancel || base.cancel,
  })
}

/**
 * Validate a fixture request. This only checks the demonstration protocol shape; it never resolves
 * a real media asset, model file or user authorization.
 */
export function validateRvcFakeRequest(request) {
  return attempt(() => readRequest(request))
}

/**
 * Simulate one deterministic gateway outcome. A valid protocol response (including OFFLINE,
 * TIMEOUT or UNKNOWN) is an `ok:true` demonstration result, not proof that audio was produced.
 */
export function simulateRvcFakeConversion(request, context) {
  return attempt(() => {
    const parsedRequest = readRequest(request)
    if (!parsedRequest.ok) return parsedRequest
    const parsedContext = readContext(context)
    if (!parsedContext.ok) return parsedContext
    return { ok: true, value: buildResult(parsedRequest.value, parsedContext.value) }
  })
}

function readResult(input) {
  if (!isPlainObject(input)) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, '$', 'invalid object structure')
  }
  const errors = []
  if (!checkLayer(input, RESULT_KEYS, '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)) {
    return failOf(errors)
  }

  const schemaVersion = readInteger(input, 'schemaVersion', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  const requestId = readString(input, 'requestId', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  const engine = readString(input, 'engine', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  const targetModelId = readString(input, 'targetModelId', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  const status = readString(input, 'status', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  const artifactRef = readNullableString(input, 'artifactRef', '', errors)
  const mime = readNullableString(input, 'mime', '', errors)
  const sampleRate = readNullableInteger(input, 'sampleRate', '', errors)
  const durationMs = readNullableInteger(input, 'durationMs', '', errors)

  const codeField = readField(input, 'code')
  let code = null
  if (!codeField.present || codeField.value === undefined) {
    errors.push(issue(RVC_FAKE_ERRORS.INVALID_RESULT, 'code', 'required'))
  } else if (codeField.accessor || (codeField.value !== null && typeof codeField.value !== 'string')) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, 'code', 'invalid field type or property'))
  } else {
    code = codeField.value
  }

  const cancelAnchor = readObject(input, 'cancel', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  let cancel = null
  if (cancelAnchor && checkLayer(cancelAnchor, CANCEL_KEYS, 'cancel', RVC_FAKE_ERRORS.INVALID_RESULT, errors)) {
    const requested = readBoolean(cancelAnchor, 'requested', 'cancel', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
    const confirmed = readBoolean(cancelAnchor, 'confirmed', 'cancel', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
    if (requested !== null && confirmed !== null) cancel = { requested, confirmed }
  }

  const deliveryAnchor = readObject(input, 'delivery', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  let delivery = null
  if (deliveryAnchor && checkLayer(deliveryAnchor, DELIVERY_KEYS, 'delivery', RVC_FAKE_ERRORS.INVALID_RESULT, errors)) {
    const state = readString(deliveryAnchor, 'state', 'delivery', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
    const submitAllowed = readBoolean(deliveryAnchor, 'submitAllowed', 'delivery', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
    if (state !== null && submitAllowed !== null) delivery = { state, submitAllowed }
  }

  const mockOnly = readBoolean(input, 'mockOnly', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  const realOperationAllowed = readBoolean(input, 'realOperationAllowed', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)
  const automaticRetryAllowed = readBoolean(input, 'automaticRetryAllowed', '', RVC_FAKE_ERRORS.INVALID_RESULT, errors)

  if (errors.length > 0) return failOf(errors)

  if (schemaVersion !== RVC_FAKE_GATEWAY_SCHEMA_VERSION) {
    return fail(RVC_FAKE_ERRORS.UNSUPPORTED_VERSION, 'schemaVersion', 'unsupported schema version')
  }
  if (engine !== ENGINE_FAKE) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }
  if (!RESULT_STATUSES.includes(status)) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }
  if (!MODEL_IDS.includes(targetModelId)) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }
  if (code !== null && !ERROR_CODES.includes(code)) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }
  if (artifactRef !== null && !OUTPUT_REF_PATTERN.test(artifactRef)) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }
  if (mockOnly !== true || realOperationAllowed !== false || automaticRetryAllowed !== false) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }
  if (delivery.state !== 'NOT_REQUESTED' || delivery.submitAllowed !== false) {
    return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion,
      requestId,
      engine,
      targetModelId,
      status,
      code,
      artifactRef,
      mime,
      sampleRate,
      durationMs,
      cancel: Object.freeze({ ...cancel }),
      delivery: Object.freeze({ ...delivery }),
      mockOnly,
      realOperationAllowed,
      automaticRetryAllowed,
    }),
  }
}

function readNullableString(object, key, prefix, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (field.accessor) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  if (!field.present || field.value === undefined) {
    errors.push(issue(RVC_FAKE_ERRORS.INVALID_RESULT, path, 'required'))
    return null
  }
  if (field.value === null) return null
  if (typeof field.value !== 'string') {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  return field.value
}

function readNullableInteger(object, key, prefix, errors) {
  const path = joinPath(prefix, key)
  const field = readField(object, key)
  if (field.accessor) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  if (!field.present || field.value === undefined) {
    errors.push(issue(RVC_FAKE_ERRORS.INVALID_RESULT, path, 'required'))
    return null
  }
  if (field.value === null) return null
  if (typeof field.value !== 'number' || !Number.isFinite(field.value) || !Number.isInteger(field.value)) {
    errors.push(issue(RVC_FAKE_ERRORS.TYPE_MISMATCH, path, 'invalid field type or property'))
    return null
  }
  return field.value
}

function matchesExpected(result, expected) {
  if (result.schemaVersion !== expected.schemaVersion) return false
  if (result.requestId !== expected.requestId) return false
  if (result.engine !== expected.engine) return false
  if (result.targetModelId !== expected.targetModelId) return false
  if (result.status !== expected.status) return false
  if (result.code !== expected.code) return false
  if (result.artifactRef !== expected.artifactRef) return false
  if (result.mime !== expected.mime) return false
  if (result.sampleRate !== expected.sampleRate) return false
  if (result.durationMs !== expected.durationMs) return false
  if (result.cancel.requested !== expected.cancel.requested) return false
  if (result.cancel.confirmed !== expected.cancel.confirmed) return false
  if (result.delivery.state !== expected.delivery.state) return false
  if (result.delivery.submitAllowed !== expected.delivery.submitAllowed) return false
  if (result.mockOnly !== expected.mockOnly) return false
  if (result.realOperationAllowed !== expected.realOperationAllowed) return false
  if (result.automaticRetryAllowed !== expected.automaticRetryAllowed) return false
  return true
}

/**
 * Validate a result against the one authoritative demonstration outcome for the supplied request
 * and context. It reuses the same builder as the simulator and never calls the simulator itself.
 */
export function validateRvcFakeResult(result, request, context) {
  return attempt(() => {
    const parsedRequest = readRequest(request)
    if (!parsedRequest.ok) return parsedRequest
    const parsedContext = readContext(context)
    if (!parsedContext.ok) return parsedContext

    const expected = buildResult(parsedRequest.value, parsedContext.value)
    const parsedResult = readResult(result)
    if (!parsedResult.ok) return parsedResult
    if (!matchesExpected(parsedResult.value, expected)) {
      return fail(RVC_FAKE_ERRORS.INVALID_RESULT, 'result', 'inconsistent fixture result')
    }
    return { ok: true, value: parsedResult.value }
  })
}
