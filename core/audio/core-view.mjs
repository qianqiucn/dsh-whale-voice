/* Whale Audio Core — composed read-only view (Plan 05-B, OFFLINE / PURE-COMPOSITION).
 *
 * One deterministic composition of three already-accepted read-only capabilities: the redacted
 * audio task projection, the per-feature dependency manifest, and the per-feature first-use
 * decision. The two future pages should consume this single view instead of interpreting state
 * on their own, so a feature cannot quietly borrow the other feature's readiness or onboarding.
 *
 * What this module deliberately does not do:
 * - it never creates, advances or persists a task, and never builds a delivery candidate;
 * - it never installs, downloads, probes a machine, reads a file, opens a socket or uses a clock;
 * - it never allocates ids, stores an acknowledgement, or grants any real capability.
 * Every action flag in the output is permanently false; this is a demonstration view only.
 */

import { projectAudioTask, validateAudioTaskRecord } from './task-contract.mjs'
import {
  FEATURE_IDS,
  evaluateFirstUse,
  listFeatureDependencies,
  projectFeatureAvailability,
} from './feature-manifest.mjs'

export const AUDIO_CORE_VIEW_SCHEMA_VERSION = 1

export const AUDIO_CORE_VIEW_ERRORS = Object.freeze({
  INVALID_REQUEST: 'CORE_VIEW_INVALID_REQUEST',
  UNKNOWN_FIELD: 'CORE_VIEW_UNKNOWN_FIELD',
  TYPE_MISMATCH: 'CORE_VIEW_TYPE_MISMATCH',
  SCHEMA_UNSUPPORTED: 'CORE_VIEW_SCHEMA_UNSUPPORTED',
  FEATURE_MISMATCH: 'CORE_VIEW_FEATURE_MISMATCH',
  TASK_INVALID: 'CORE_VIEW_TASK_INVALID',
  MANIFEST_INVALID: 'CORE_VIEW_MANIFEST_INVALID',
})

const INPUT_KEYS = Object.freeze(
  new Set([
    'schemaVersion',
    'activeFeature',
    'taskRecord',
    'observationsByFeature',
    'acknowledgedByFeature',
    'manifestRevision',
  ]),
)
const REQUIRED_INPUT_KEYS = Object.freeze([...INPUT_KEYS])
const MAX_LAYER_FIELDS = 32
const UNKNOWN_KEY_PLACEHOLDER = '<unknown-key>'
const USER_MESSAGE_ZH = '当前为演示只读视图，尚未接入真实生成、安装、试听、保存或发送。'

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
    return fail(AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, '$', 'input could not be validated safely')
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
  return prefix ? prefix + '.' + key : key
}

/**
 * Enforce the F01 own-property policy on one newly introduced object layer: string keys only,
 * enumerable data properties only, no Symbol keys, no hidden fields, no accessors (never read),
 * and a hard field-count cap. Unknown keys are reported with a fixed placeholder, never named.
 * @returns {boolean} true when every own property is acceptable
 */
function checkLayer(object, allowed, prefix, errors) {
  const keys = Reflect.ownKeys(object)
  if (keys.length > MAX_LAYER_FIELDS) {
    errors.push(issue(AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, prefix === '' ? '$' : prefix, 'too many fields'))
    return false
  }
  let clean = true
  for (const key of keys) {
    if (typeof key === 'symbol' || !allowed.has(key)) {
      errors.push(
        issue(
          AUDIO_CORE_VIEW_ERRORS.UNKNOWN_FIELD,
          joinPath(prefix, UNKNOWN_KEY_PLACEHOLDER),
          'unknown field is not allowed',
        ),
      )
      clean = false
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    const dataProperty =
      descriptor !== undefined &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      descriptor.enumerable === true
    if (!dataProperty) {
      errors.push(
        issue(
          AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH,
          joinPath(prefix, key),
          'expected enumerable data property of the documented type',
        ),
      )
      clean = false
    }
  }
  return clean
}

/**
 * Validate the six-field view input and both new object layers. Returns either a safe error
 * envelope or the normalised input used by the composition step.
 */
function inspectInput(input) {
  if (!isPlainObject(input)) {
    return fail(AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, '$', 'input could not be validated safely')
  }
  const errors = []
  if (!checkLayer(input, INPUT_KEYS, '', errors)) return failOf(errors)
  for (const key of REQUIRED_INPUT_KEYS) {
    if (!readField(input, key).present) errors.push(issue(AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, key, 'required'))
  }
  if (errors.length > 0) return failOf(errors)

  const schemaField = readField(input, 'schemaVersion')
  if (!Number.isInteger(schemaField.value)) {
    return fail(AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH, 'schemaVersion', 'expected integer schema version')
  }
  if (schemaField.value !== AUDIO_CORE_VIEW_SCHEMA_VERSION) {
    return fail(AUDIO_CORE_VIEW_ERRORS.SCHEMA_UNSUPPORTED, 'schemaVersion', 'unsupported schema version')
  }

  const activeField = readField(input, 'activeFeature')
  if (typeof activeField.value !== 'string') {
    return fail(
      AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH,
      'activeFeature',
      'expected enumerable data property of the documented type',
    )
  }
  if (!FEATURE_IDS.includes(activeField.value)) {
    return fail(AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, 'activeFeature', 'unknown feature')
  }

  const taskField = readField(input, 'taskRecord')
  if (taskField.value !== null && !isPlainObject(taskField.value)) {
    return fail(
      AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH,
      'taskRecord',
      'expected enumerable data property of the documented type',
    )
  }

  const observationsField = readField(input, 'observationsByFeature')
  if (!isPlainObject(observationsField.value)) {
    return fail(
      AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH,
      'observationsByFeature',
      'expected enumerable data property of the documented type',
    )
  }

  const revisionField = readField(input, 'manifestRevision')
  if (typeof revisionField.value !== 'string') {
    return fail(
      AUDIO_CORE_VIEW_ERRORS.TYPE_MISMATCH,
      'manifestRevision',
      'expected enumerable data property of the documented type',
    )
  }

  const observationErrors = []
  const allowedFeatures = new Set(FEATURE_IDS)
  if (!checkLayer(observationsField.value, allowedFeatures, 'observationsByFeature', observationErrors)) {
    return failOf(observationErrors)
  }
  for (const feature of FEATURE_IDS) {
    if (!readField(observationsField.value, feature).present) {
      observationErrors.push(
        issue(AUDIO_CORE_VIEW_ERRORS.INVALID_REQUEST, 'observationsByFeature.' + feature, 'required'),
      )
    }
  }
  if (observationErrors.length > 0) return failOf(observationErrors)

  return {
    ok: true,
    value: {
      schemaVersion: schemaField.value,
      activeFeature: activeField.value,
      taskRecord: taskField.value,
      observationsByFeature: observationsField.value,
      acknowledgedByFeature: readField(input, 'acknowledgedByFeature').value,
      manifestRevision: revisionField.value,
    },
  }
}

/**
 * Build both feature blocks in the fixed Voice → Singing order. Any failure in either feature
 * fails the whole view: a non-active feature is never silently skipped.
 */
function buildFeatures(state) {
  const features = {}
  for (const feature of FEATURE_IDS) {
    // Attribution first: a malformed revision must surface as a revision error, not as an
    // acknowledgement error, so probe with an empty acknowledgement before using the real one.
    const revisionProbe = evaluateFirstUse(feature, {}, state.manifestRevision)
    if (!revisionProbe.ok) {
      return fail(AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID, 'manifestRevision', 'manifest revision could not be validated')
    }
    const dependencies = listFeatureDependencies(feature)
    if (!dependencies.ok) {
      return fail(AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID, 'features.' + feature, 'feature dependencies could not be validated')
    }
    const observations = readField(state.observationsByFeature, feature).value
    const availability = projectFeatureAvailability(feature, observations)
    if (!availability.ok) {
      return fail(
        AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID,
        'observationsByFeature.' + feature,
        'feature observations could not be validated',
      )
    }
    const firstUse = evaluateFirstUse(feature, state.acknowledgedByFeature, state.manifestRevision)
    if (!firstUse.ok) {
      return fail(AUDIO_CORE_VIEW_ERRORS.MANIFEST_INVALID, 'acknowledgedByFeature', 'first-use decision could not be validated')
    }
    features[feature] = {
      dependencies: dependencies.value,
      availability: availability.value,
      firstUse: firstUse.value,
    }
  }
  return { ok: true, value: features }
}

/** Recursively freeze a freshly built view so callers cannot mutate shared state. */
function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      deepFreeze(descriptor.value, seen)
    }
  }
  return value
}

/**
 * Compose the single read-only Core view consumed by both future pages.
 *
 * @param {object} input six-field view request
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function projectAudioCoreView(input) {
  return attempt(() => {
    const inspected = inspectInput(input)
    if (!inspected.ok) return inspected
    const state = inspected.value

    const featuresResult = buildFeatures(state)
    if (!featuresResult.ok) return featuresResult
    const features = featuresResult.value

    let task = null
    if (state.taskRecord !== null) {
      const validated = validateAudioTaskRecord(state.taskRecord)
      if (!validated.ok) {
        return fail(AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'task record could not be validated')
      }
      if (validated.value.feature !== state.activeFeature) {
        return fail(
          AUDIO_CORE_VIEW_ERRORS.FEATURE_MISMATCH,
          'taskRecord.feature',
          'task does not belong to the active feature',
        )
      }
      const projection = projectAudioTask(validated.value)
      if (!projection.ok) {
        return fail(AUDIO_CORE_VIEW_ERRORS.TASK_INVALID, 'taskRecord', 'task record could not be validated')
      }
      task = projection.value
    }

    return {
      ok: true,
      value: deepFreeze({
        schemaVersion: AUDIO_CORE_VIEW_SCHEMA_VERSION,
        mode: 'MOCK_ONLY',
        activeFeature: state.activeFeature,
        features: {
          'voice-bubbles': features['voice-bubbles'],
          singing: features.singing,
        },
        task,
        actions: {
          canGenerate: false,
          canInstall: false,
          canPreview: false,
          canSave: false,
          canSend: false,
          canRequestCancel: false,
        },
        mockOnly: true,
        realOperationAllowed: false,
        userMessageZh: USER_MESSAGE_ZH,
      }),
    }
  })
}
