/* Whale Audio Core — FeatureDependencyManifest v1 (Plan 05-A, OFFLINE pure contract).
 *
 * Static, frozen dependency definitions for the two independent product entry points:
 * Whale Voice (voice-bubbles, TTS) and Whale Singing (singing, SVC). Each feature owns its own
 * dependency list and its own first-use acknowledgement; sharing the Core never shares the
 * onboarding flag. Nothing here installs, downloads, writes or probes a machine: the caller
 * supplies *observations*, and this module only derives a deterministic availability projection.
 *
 * Readiness rules that must never regress:
 * - this phase is always mode:"MOCK_ONLY" and realReady:false, even if every observation says
 *   VERIFIED, because no component in this contract is implemented;
 * - a delivery-only component (WeChatAgent / Whale Relay / Voice Sender) never blocks local
 *   generation, preview or saving, and never grants send permission;
 * - Whale Singing ships RVC as the standard cover path; Seed-VC stays OPTIONAL / NOT_READY and
 *   is never part of the first-release required set;
 * - first-use acknowledgement is per feature and per manifest revision, and is never persisted
 *   by this pure module.
 */

export const FEATURE_MANIFEST_SCHEMA_VERSION = 1

/** Revision marker the GUI will compare against a stored acknowledgement (Plan 09/14). */
export const FEATURE_MANIFEST_REVISION = 'plan05a.v1'

export const FEATURE_MANIFEST_ERRORS = Object.freeze({
  UNKNOWN_FEATURE: 'FEATURE_UNKNOWN_FEATURE',
  INVALID_OBSERVATION: 'MANIFEST_INVALID_OBSERVATION',
  UNKNOWN_OBSERVATION: 'MANIFEST_UNKNOWN_OBSERVATION',
  INVALID_ACKNOWLEDGEMENT: 'MANIFEST_INVALID_ACKNOWLEDGEMENT',
  INVALID_REVISION: 'MANIFEST_INVALID_REVISION',
})

export const FEATURE_IDS = Object.freeze(['voice-bubbles', 'singing'])

export const DEPENDENCY_REQUIREMENTS = Object.freeze({
  REQUIRED: 'REQUIRED',
  CONDITIONAL: 'CONDITIONAL',
  OPTIONAL: 'OPTIONAL',
  DELIVERY_ONLY: 'DELIVERY_ONLY',
})

export const DEPENDENCY_OBSERVATION_STATES = Object.freeze(['VERIFIED', 'MISSING', 'UNKNOWN', 'BLOCKED'])

/**
 * Seed-VC is a post-release candidate only. These markers live outside the dependency definition
 * because each definition is restricted to id/labelZh/purposeZh/requirement/implemented; they are
 * still machine-checked so no future UI can present Seed-VC as installed, default or "low VRAM".
 */
export const SEED_VC_STATUS = Object.freeze({
  requirementState: 'NOT_READY',
  notDefault: true,
  noAutoInstall: true,
  supportedNow: false,
  labelZh: 'Seed-VC · 后续免训练试唱（暂不支持）',
  explanationZh: '免训练不等于低显存，也不保证无显卡可用；本阶段不安装、不下载、不运行。',
})

// implemented:false means "this offline contract has no real runtime capability". Some legacy
// read-only component states already exist in the plugin, but that is not the same as the new
// Core having completed this component.
function dependency(id, labelZh, purposeZh, requirement) {
  return Object.freeze({ id, labelZh, purposeZh, requirement, implemented: false })
}

const VOICE_DEPENDENCIES = Object.freeze([
  dependency('audio-core', '音频任务与状态', '让语音气泡和唱歌共用同一套音频任务、状态和资源记录。', 'REQUIRED'),
  dependency(
    'tts-selected',
    '选择一种语音生成方式',
    '必须选定一种语音生成方式；当前演示契约尚未接入任何真实模型，云端方案还需要额外授权。',
    'REQUIRED',
  ),
  dependency('voice-profile', '选择合法音色', '从共享音色库中选择一个有使用权的音色，而不是直接指定模型文件名。', 'REQUIRED'),
  dependency('preview-save', '试听与保存', '生成后先试听，再保存到本地；保存成功不代表已经发送。', 'REQUIRED'),
  dependency('wechatagent', '微信账号与聊天授权', '只有要把语音发送到微信时，才需要微信助手提供账号身份和聊天授权。', 'DELIVERY_ONLY'),
  dependency('whale-relay', '安全投递协调', '只有要真实发送时，才需要鲸递复核目标并只提交一次。', 'DELIVERY_ONLY'),
  dependency('voice-sender', '微信语音发送组件', '只有要发送微信语音气泡时，才需要现有语音发送组件。', 'DELIVERY_ONLY'),
])

const SINGING_DEPENDENCIES = Object.freeze([
  dependency('audio-core', '音频任务与状态', '和语音气泡共用同一套音频任务、状态和资源记录。', 'REQUIRED'),
  dependency('rvc-gateway', '歌声转换后端', '真实 RVC 音色转换需要独立后端；当前未实现，也不会自动安装。', 'REQUIRED'),
  dependency('rvc-voice-model', '目标音色模型资产', '需要一个有合法使用权的 RVC 音色模型；当前没有安装任何模型。', 'REQUIRED'),
  dependency('source-rights', '歌曲或音频使用权', '只能使用用户已获授权的本地音频，不能自动下载或抓取歌曲。', 'REQUIRED'),
  dependency('separator', '人声与伴奏分离', '只有当输入不是纯人声时才需要分离；状态未知不等于该组件可用。', 'CONDITIONAL'),
  dependency('mixer-encoder', '混音与格式转换', '只有当所选输出格式需要混音或编码时才需要。', 'CONDITIONAL'),
  dependency('preview-save', '试听与保存', '翻唱完成后先试听，再保存到本地；保存成功不代表已经发送。', 'REQUIRED'),
  dependency('wechatagent', '微信账号与聊天授权', '只有要把歌曲文件发送到微信时，才需要微信账号身份和聊天授权。', 'DELIVERY_ONLY'),
  dependency('whale-relay', '安全投递协调', '只有要真实发送时，才需要鲸递复核目标并只提交一次。', 'DELIVERY_ONLY'),
  dependency('voice-sender', '微信语音发送组件', '只有要发送微信语音气泡时，才需要现有语音发送组件；整首歌曲不假设一定走语音气泡。', 'DELIVERY_ONLY'),
  dependency(
    'seed-vc',
    'Seed-VC · 后续免训练试唱（暂不支持）',
    '后续可选的免训练零样本试唱；当前 NOT_READY，不在首发必需集合，也不会自动安装。',
    'OPTIONAL',
  ),
])

const FEATURE_DEFINITIONS = new Map([
  ['voice-bubbles', Object.freeze({ labelZh: 'Whale Voice · 语音气泡', dependencies: VOICE_DEPENDENCIES })],
  ['singing', Object.freeze({ labelZh: 'Whale Singing · 唱歌', dependencies: SINGING_DEPENDENCIES })],
])

const MOCK_MODE_NOTICE_ZH = '当前是演示模式：依赖检查只用于说明将来如何检查，尚未接入真实生成或安装。'
const REVISION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

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
    return failOf([issue(FEATURE_MANIFEST_ERRORS.UNKNOWN_FEATURE, '$', 'input could not be inspected safely')])
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

// Never echo the caller's value: a malformed feature argument must not become a log or UI leak.
function unknownFeatureError() {
  return failOf([issue(FEATURE_MANIFEST_ERRORS.UNKNOWN_FEATURE, 'feature', 'unknown feature id')])
}

function definitionOf(feature) {
  if (typeof feature !== 'string') return null
  return FEATURE_DEFINITIONS.get(feature) || null
}

/**
 * List the frozen dependency definitions of one feature. Every call returns a fresh array of
 * fresh frozen copies, so callers cannot pollute later reads by mutating the result.
 * @param {'voice-bubbles'|'singing'} feature
 * @returns {{ok:true,value:Array<object>}|{ok:false,errors:Array<object>}}
 */
export function listFeatureDependencies(feature) {
  return attempt(() => {
    const definition = definitionOf(feature)
    if (!definition) return unknownFeatureError()
    return { ok: true, value: definition.dependencies.map((item) => Object.freeze({ ...item })) }
  })
}

function availabilityMessageZh(feature, buckets) {
  const chunks = []
  if (buckets.missingRequired.length > 0 || buckets.blockedRequired.length > 0) {
    chunks.push('有必需组件缺失或被阻止，请重新检查，或者换一个可用方案。')
  } else if (buckets.unknownRequired.length > 0) {
    chunks.push('部分必需组件状态未知，需要重新检查后才能判断。')
  } else {
    chunks.push('必需组件在演示数据中显示已就绪，但仍不代表真实可用。')
  }
  if (buckets.deliveryRequired.length > 0) {
    chunks.push('发送相关组件尚未就绪；这只影响以后是否发送，不影响本地生成、试听和保存。')
  }
  if (feature === 'singing') {
    chunks.push('唱歌功能首发使用 RVC 标准翻唱；免训练试唱模式暂不支持，也不会在无显卡时假装可用。')
  }
  chunks.push(MOCK_MODE_NOTICE_ZH)
  return chunks.join('')
}

/**
 * Derive the Fake availability projection from caller-supplied observations.
 *
 * The result is always MOCK_ONLY / realReady:false: no combination of Fake observations can
 * promote it to a real READY state, because `implemented` is false for every dependency in this
 * offline contract. Missing delivery-only components are reported separately and never block
 * local generation, preview or saving.
 *
 * @param {'voice-bubbles'|'singing'} feature
 * @param {Record<string,'VERIFIED'|'MISSING'|'UNKNOWN'|'BLOCKED'>} [observations]
 */
export function projectFeatureAvailability(feature, observations) {
  return attempt(() => {
    const definition = definitionOf(feature)
    if (!definition) return unknownFeatureError()
    const input = observations === undefined ? {} : observations
    if (!isPlainObject(input)) {
      return failOf([issue(FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION, 'observations', 'expected plain object')])
    }
    const knownIds = new Set(definition.dependencies.map((item) => item.id))
    const errors = []
    const observed = new Map()
    for (const key of Object.keys(input)) {
      if (!knownIds.has(key)) {
        errors.push(
          issue(FEATURE_MANIFEST_ERRORS.UNKNOWN_OBSERVATION, 'observations.' + key, 'component is not registered for this feature'),
        )
        continue
      }
      const field = readField(input, key)
      if (field.accessor) {
        errors.push(issue(FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION, 'observations.' + key, 'accessor property is not accepted'))
        continue
      }
      if (typeof field.value !== 'string' || !DEPENDENCY_OBSERVATION_STATES.includes(field.value)) {
        errors.push(issue(FEATURE_MANIFEST_ERRORS.INVALID_OBSERVATION, 'observations.' + key, 'unsupported observation state'))
        continue
      }
      observed.set(key, field.value)
    }
    if (errors.length > 0) return failOf(errors)

    const stateOf = (id) => observed.get(id) || 'UNKNOWN'
    const missingRequired = []
    const unknownRequired = []
    const blockedRequired = []
    const deliveryRequired = []
    const optionalUnavailable = []
    for (const item of definition.dependencies) {
      const state = stateOf(item.id)
      if (item.requirement === 'REQUIRED') {
        if (state === 'MISSING') missingRequired.push(item.id)
        else if (state === 'UNKNOWN') unknownRequired.push(item.id)
        else if (state === 'BLOCKED') blockedRequired.push(item.id)
      } else if (item.requirement === 'DELIVERY_ONLY') {
        // Delivery is only ever a separate, optional capability: an unverified observation or an
        // unimplemented component always lands here, never in the required-generation buckets.
        if (state !== 'VERIFIED' || !item.implemented) deliveryRequired.push(item.id)
      } else if (item.requirement === 'OPTIONAL') {
        // Seed-VC is statically NOT_READY, so a Fake VERIFIED observation must not hide that.
        if (state !== 'VERIFIED' || !item.implemented) optionalUnavailable.push(item.id)
      }
      // CONDITIONAL components are only needed for specific inputs; they are listed in the
      // manifest with their observed state but never gate readiness in this projection.
    }
    const buckets = {
      missingRequired,
      unknownRequired,
      blockedRequired,
      deliveryRequired,
      optionalUnavailable,
    }
    return {
      ok: true,
      value: Object.freeze({
        feature,
        mode: 'MOCK_ONLY',
        realReady: false,
        missingRequired: Object.freeze(missingRequired),
        unknownRequired: Object.freeze(unknownRequired),
        blockedRequired: Object.freeze(blockedRequired),
        deliveryRequired: Object.freeze(deliveryRequired),
        optionalUnavailable: Object.freeze(optionalUnavailable),
        userMessageZh: availabilityMessageZh(feature, buckets),
      }),
    }
  })
}

/**
 * Decide whether the per-feature first-use dependency dialog must be shown for a manifest
 * revision. This is a pure decision: it does not read, write or persist any acknowledgement,
 * and it cannot mark any dependency as installed.
 *
 * @param {'voice-bubbles'|'singing'} feature
 * @param {{'voice-bubbles'?:string|null,singing?:string|null}} acknowledgedByFeature
 * @param {string} manifestRevision caller-supplied non-empty revision marker
 */
export function evaluateFirstUse(feature, acknowledgedByFeature, manifestRevision) {
  return attempt(() => {
    const definition = definitionOf(feature)
    if (!definition) return unknownFeatureError()
    const errors = []
    if (!isPlainObject(acknowledgedByFeature)) {
      return failOf([
        issue(FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT, 'acknowledgedByFeature', 'expected plain object'),
      ])
    }
    for (const key of Object.keys(acknowledgedByFeature)) {
      if (!FEATURE_IDS.includes(key)) {
        errors.push(
          issue(
            FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT,
            'acknowledgedByFeature.' + key,
            'unknown feature acknowledgement key',
          ),
        )
        continue
      }
      const field = readField(acknowledgedByFeature, key)
      if (field.accessor) {
        errors.push(
          issue(
            FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT,
            'acknowledgedByFeature.' + key,
            'accessor property is not accepted',
          ),
        )
        continue
      }
      if (field.value === null) continue
      if (typeof field.value !== 'string') {
        errors.push(
          issue(FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT, 'acknowledgedByFeature.' + key, 'expected revision string or null'),
        )
        continue
      }
      if (!REVISION_PATTERN.test(field.value)) {
        errors.push(
          issue(FEATURE_MANIFEST_ERRORS.INVALID_ACKNOWLEDGEMENT, 'acknowledgedByFeature.' + key, 'invalid revision marker'),
        )
      }
    }
    if (typeof manifestRevision !== 'string' || !REVISION_PATTERN.test(manifestRevision)) {
      errors.push(issue(FEATURE_MANIFEST_ERRORS.INVALID_REVISION, 'manifestRevision', 'a safe non-empty revision marker is required'))
    }
    if (errors.length > 0) return failOf(errors)
    const acknowledgedField = readField(acknowledgedByFeature, feature)
    const acknowledged = acknowledgedField.present ? acknowledgedField.value : null
    let showDialog = true
    let reason = 'FIRST_USE'
    if (typeof acknowledged === 'string') {
      if (acknowledged === manifestRevision) {
        showDialog = false
        reason = 'ALREADY_ACKNOWLEDGED'
      } else {
        reason = 'REVISION_CHANGED'
      }
    }
    return { ok: true, value: Object.freeze({ feature, showDialog, reason, readOnly: true }) }
  })
}
