/* Whale Voice — Plan 09 dual-entry onboarding and offline config UX model.
 *
 * Pure, browser-safe helpers: feature catalog, per-feature/manifest wizard persistence, mode-based
 * dependency projections, draft validation/cleanup, and the mapping from drafts to the Coordinator
 * change protocol. It never writes production configuration or credentials and contains no toy
 * transaction engine: the UI must call an injected isolated adapter.
 */

export const PLAN09_MANIFEST_REVISION = 2

export const PLAN09_FEATURES = Object.freeze([
  { id: 'voice-bubbles', label: '语音气泡', en: 'Voice Bubbles', icon: 'wave', hint: '把文字变成私聊语音气泡' },
  { id: 'singing', label: '唱歌', en: 'Singing', icon: 'spark', hint: '离线翻唱与歌声演示' },
])

export const PLAN09_MODES = Object.freeze([
  { id: 'local', label: '本机 GPU', desc: '全部在本机运行，需要可用的显卡与模型文件。', gpu: true, cloud: false },
  { id: 'cpu', label: '仅 CPU', desc: '不依赖显卡，速度较慢；真实唱歌质量未验证。', gpu: false, cloud: false },
  { id: 'cloud', label: '云端服务', desc: '使用已授权的云端 Provider；费用与文本传输需单独确认。', gpu: false, cloud: true },
  { id: 'existing', label: '已有服务', desc: '复用本机已经安装并通过检查的服务。', gpu: false, cloud: false },
])

export const PLAN09_PROVIDERS = Object.freeze([
  { id: 'qwen-local', label: '本机 Qwen 服务', kind: 'local', models: ['Qwen3-TTS-12Hz-1.7B-Base'], voices: ['demo-voice-a', 'demo-voice-b'] },
  { id: 'fixture-cloud', label: '隔离云端 Fixture', kind: 'cloud', models: ['fixture-cloud-voice-v1'], voices: ['cloud-voice-a'] },
  { id: 'custom-local', label: '自定义本机服务', kind: 'custom', models: ['custom-model'], voices: ['custom-voice-a'] },
])

export const PLAN09_SINGING_VOICES = Object.freeze([
  { id: 'fixture-rvc-female', label: 'RVC 示例女声（虚构）' },
  { id: 'fixture-rvc-male', label: 'RVC 示例男声（虚构）' },
  { id: 'fixture-gateway', label: '已有服务音色（Gateway）' },
])

export const PLAN09_DEPENDENCY_CATALOG = Object.freeze({
  core: { label: '鲸音 Core', desc: '配置、任务与状态的可信来源；仅投递不改变它是宿主入口。', required: true, shared: true, license: '随应用', size: '—' },
  tts: { label: 'TTS Provider', desc: '把文字合成为音频；本地服务或已授权云端。', required: true, shared: true, license: '按 Provider', size: '按模型' },
  cloud: { label: '云端授权与网络', desc: '需要明确授权、连通性与费用确认；真实调用始终禁用。', conditional: true, license: '用户授权', size: '按量计费' },
  rvc: { label: 'RVC 翻唱模型（首发）', desc: '标准翻唱模型；需单独确认来源与许可，不承诺低资源。', required: true, license: '需确认', size: '未知' },
  separation: { label: '人声分离模型', desc: '混合素材需要分离人声与伴奏；干净人声可跳过。', conditional: true, license: '需确认', size: '未知' },
  gateway: { label: '已有服务 Gateway', desc: '复用已安装服务；能力与版本必须由检查确认。', conditional: true, license: '随服务', size: '—' },
  sender: { label: '鲸递（统一投递）', desc: '仅投递时必需；一个鲸递安装/管理项，内部包含兼容的 Windows 发送模块，WeChatAgent 仍是独立身份依赖。', delivery: true, shared: true, license: '随应用', size: '—' },
  wechat: { label: 'WeChatAgent 桥', desc: '仅投递到微信时必需；未接入时只能浏览与保存草稿。', delivery: true, shared: true, license: '上游许可', size: '—' },
  gpu: { label: '可用 GPU / 显存', desc: '本机模式下的资源检查；未知不会被当作可用。', conditional: true, license: '—', size: '按模型' },
  storage: { label: '磁盘空间', desc: '模型与缓存空间；未知时显示未知而不是通过。', optional: true, license: '—', size: '未知' },
})

/** Stable storage key per workspace/profile, feature and manifest revision. */
export function plan09WizardKey({ workspace = 'demo-workspace', profile = 'demo-profile', feature, manifestRevision = PLAN09_MANIFEST_REVISION } = {}) {
  return `wv.plan09.wizard.v2.${workspace}.${profile}.${feature}.${manifestRevision}`
}

const EMPTY_WIZARD = Object.freeze({
  introAcknowledged: false,
  selectedMode: null,
  mode: null,
  browseDismissedRevision: null,
  capabilityRevisionSeen: null,
  updatedAt: null,
})

export function plan09ReadWizard(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return { ...EMPTY_WIZARD }
  try {
    const raw = storage.getItem(key)
    if (!raw) return { ...EMPTY_WIZARD }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_WIZARD }
    const mode = PLAN09_MODES.some((item) => item.id === parsed.selectedMode) ? parsed.selectedMode : null
    return {
      introAcknowledged: parsed.introAcknowledged === true,
      selectedMode: mode,
      mode,
      browseDismissedRevision: Number.isInteger(parsed.browseDismissedRevision) ? parsed.browseDismissedRevision : null,
      capabilityRevisionSeen: Number.isInteger(parsed.capabilityRevisionSeen) ? parsed.capabilityRevisionSeen : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    }
  } catch {
    return { ...EMPTY_WIZARD }
  }
}

/** `mode` and `selectedMode` are both accepted so callers cannot silently lose the choice. */
export function plan09WriteWizard(storage, key, patch = {}) {
  if (!storage || typeof storage.setItem !== 'function') return null
  const current = plan09ReadWizard(storage, key)
  const requestedMode = patch.selectedMode === undefined ? patch.mode : patch.selectedMode
  const next = {
    introAcknowledged: patch.introAcknowledged === undefined ? current.introAcknowledged : patch.introAcknowledged === true,
    selectedMode: requestedMode === undefined ? current.selectedMode : (PLAN09_MODES.some((item) => item.id === requestedMode) ? requestedMode : null),
    browseDismissedRevision: patch.browseDismissedRevision === undefined ? current.browseDismissedRevision : (Number.isInteger(patch.browseDismissedRevision) ? patch.browseDismissedRevision : null),
    capabilityRevisionSeen: patch.capabilityRevisionSeen === undefined ? current.capabilityRevisionSeen : (Number.isInteger(patch.capabilityRevisionSeen) ? patch.capabilityRevisionSeen : null),
    updatedAt: new Date().toISOString(),
  }
  next.mode = next.selectedMode
  try {
    storage.setItem(key, JSON.stringify(next))
    return next
  } catch {
    return null
  }
}

/**
 * Global Setup keeps priority. Browse-only dismisses only the current manifest revision; an
 * acknowledgement is "read", never READY. A changed capability revision reopens with a reminder.
 */
export function plan09DeriveWizardView({ stored, capabilityRevision = null, manifestRevision = PLAN09_MANIFEST_REVISION, globalSetupOpen = false, force = false } = {}) {
  const state = stored || EMPTY_WIZARD
  const changed = capabilityRevision !== null && state.capabilityRevisionSeen !== null && state.capabilityRevisionSeen !== capabilityRevision
  if (globalSetupOpen) return { shouldOpen: false, deferred: true, changed, reminder: false, reason: 'GLOBAL_SETUP_FIRST' }
  if (force) return { shouldOpen: true, deferred: false, changed, reminder: false, reason: 'MANUAL_REOPEN' }
  if (changed) return { shouldOpen: false, deferred: false, changed, reminder: true, reason: 'CAPABILITY_CHANGED' }
  if (!state.introAcknowledged) {
    if (state.browseDismissedRevision === manifestRevision) return { shouldOpen: false, deferred: false, changed, reminder: false, reason: 'BROWSED_THIS_REVISION' }
    return { shouldOpen: true, deferred: false, changed, reminder: false, reason: 'FIRST_VISIT' }
  }
  return { shouldOpen: false, deferred: false, changed: false, reminder: false, reason: 'ACKNOWLEDGED' }
}

/**
 * Minimal dependency projection. It follows the selected mode and source layout instead of forcing
 * local models for cloud/existing modes. Delivery dependencies never block browsing or drafts.
 */
export function plan09DependencyGroups(feature, mode, options = {}) {
  const { sourceLayout = 'MIXED', deliveryRequested = false } = options
  const groups = { required: [], optional: [], deliveryOnly: [], conditional: [] }
  const add = (group, key) => {
    const item = PLAN09_DEPENDENCY_CATALOG[key]
    if (item && !groups[group].some((entry) => entry.key === key)) groups[group].push({ key, ...item })
  }
  add('required', 'core')
  if (feature === 'voice-bubbles') add('required', 'tts')
  if (feature === 'singing') {
    if (mode === 'cloud' || mode === 'existing') {
      add('conditional', mode === 'cloud' ? 'cloud' : 'gateway')
    } else {
      add('required', 'rvc')
      if (sourceLayout === 'MIXED') add('required', 'separation')
    }
  }
  if (mode === 'local') add('conditional', 'gpu')
  if (mode === 'cloud') add('conditional', 'cloud')
  add('optional', 'storage')
  if (deliveryRequested) {
    add('deliveryOnly', 'sender')
    add('deliveryOnly', 'wechat')
  }
  return groups
}

export function plan09DependencySummary(groups) {
  const count = (group) => (groups[group] || []).length
  return {
    required: count('required'),
    optional: count('optional'),
    deliveryOnly: count('deliveryOnly'),
    conditional: count('conditional'),
    text: `必需 ${count('required')} 项 · 可选 ${count('optional')} 项 · 仅投递 ${count('deliveryOnly')} 项 · 条件 ${count('conditional')} 项`,
  }
}

/** Workspace/profile/manifest/capability identity shared by dependency evidence and transactions. */
export function plan09IdentityScope(context) {
  const state = context || {}
  return [state.workspace, state.profile, state.manifestRevision, state.capabilityRevision].join('|')
}

/** Mode/engine scope for model- and hardware-specific dependency evidence. */
export function plan09EngineScope(context, mode, engine) {
  return plan09IdentityScope(context) + '|' + (mode || '') + '|' + (engine || '')
}

/**
 * Evidence scope for one dependency row. Dependencies the catalog marks `shared` belong to the host
 * identity itself (the same Core/TTS/delivery components serve every feature and mode), so switching
 * page or engine reuses them instead of splitting one component into separate evidence. Feature/model
 * dependencies stay scoped by mode and engine.
 */
export function plan09DependencyScope(context, mode, engine, key) {
  const item = PLAN09_DEPENDENCY_CATALOG[key]
  if (item && item.shared === true) return plan09IdentityScope(context) + '|shared'
  return plan09EngineScope(context, mode, engine)
}

/**
 * Transaction authority key. One undecided write belongs to one configuration source
 * (workspace/profile/feature), so switching only the manifest/wizard revision must not produce a
 * fresh apparently-clean transaction while the old one is still unresolved.
 */
export function plan09TransactionKey(context, feature) {
  const state = context || {}
  return `wv.plan09.tx.v2.${state.workspace}.${state.profile}.${feature}`
}

export function plan09DefaultVoiceDraft() {
  return { engine: 'local', provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voiceProfile: 'demo-voice-a', language: 'zh-CN', emotion: 'neutral', speed: 1, volume: 60, text: '晚安，今天也辛苦啦。' }
}

export function plan09DefaultSingingDraft() {
  return { engine: 'rvc', provider: 'qwen-local', voiceProfile: 'fixture-rvc-female', sourceAuthorized: false, voiceConsent: false, pitch: 0, vocalGainDb: 0, instrumentalGainDb: 0, sourceLayout: 'MIXED', mixMode: 'WITH_INSTRUMENTAL', deliveryRequested: false, sourceRef: '', text: '一段虚构的试唱文本。' }
}

/** Switch engines/providers and report every incompatible field that was cleared. */
export function plan09SwitchEngine(feature, draft, engine) {
  const next = { ...draft, engine }
  const cleared = []
  if (feature === 'voice-bubbles') {
    const provider = PLAN09_PROVIDERS.find((item) => item.kind === engine) || PLAN09_PROVIDERS[0]
    if (next.provider !== provider.id) { next.provider = provider.id; cleared.push('provider') }
    if (!provider.models.includes(next.model)) { next.model = provider.models[0]; cleared.push('model') }
    if (!provider.voices.includes(next.voiceProfile)) { next.voiceProfile = provider.voices[0]; cleared.push('voiceProfile') }
    if (engine === 'cloud') {
      next.language = 'zh-CN'
      next.emotion = 'neutral'
      cleared.push('language', 'emotion')
    }
  } else if (engine === 'svc') {
    next.deliveryRequested = false
    cleared.push('deliveryRequested')
  }
  return { draft: next, cleared }
}

export function plan09SwitchMode(feature, mode, draft) {
  const next = { ...draft }
  const cleared = []
  if (feature === 'voice-bubbles') {
    const target = mode === 'cloud' ? 'cloud' : mode === 'existing' ? 'custom' : 'local'
    if (next.engine !== target) {
      const switched = plan09SwitchEngine(feature, next, target)
      return switched
    }
    if (mode === 'cloud' && next.engine !== 'cloud') { next.engine = 'cloud'; cleared.push('engine') }
  } else {
    if ((mode === 'cloud' || mode === 'existing') && next.engine !== 'gateway') { next.engine = 'gateway'; cleared.push('engine') }
    if ((mode === 'local' || mode === 'cpu') && next.engine === 'gateway') { next.engine = 'rvc'; cleared.push('engine') }
    if ((mode === 'cloud' || mode === 'existing') && next.voiceProfile !== 'fixture-gateway') { next.voiceProfile = 'fixture-gateway'; cleared.push('voiceProfile') }
    if ((mode === 'local' || mode === 'cpu') && next.voiceProfile === 'fixture-gateway') { next.voiceProfile = 'fixture-rvc-female'; cleared.push('voiceProfile') }
  }
  return { draft: next, cleared }
}

const PLAN09_VOICE_ENGINES = ['local', 'cloud', 'custom']
const PLAN09_SINGING_ENGINES = ['rvc', 'svc', 'gateway']
/**
 * Catalog IDs are UX IDs; the Coordinator's existing `tts.provider` enum is
 * `qwen-local | cloud | custom`. This is the explicit adapter between the two — it never adds a
 * provider to the writer whitelist. An unmapped catalog ID stays draft-only.
 */
export const PLAN09_PROVIDER_PROTOCOL = Object.freeze({
  'qwen-local': 'qwen-local',
  'fixture-cloud': 'cloud',
  'custom-local': 'custom',
})
const PLAN09_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'auto']
const PLAN09_EMOTIONS = ['neutral', 'gentle', 'happy', 'shy', 'playful', 'sad']

export function plan09ValidateVoiceDraft(draft, { cloudAuthorized = false, mode = null } = {}) {
  const errors = []
  if (!PLAN09_VOICE_ENGINES.includes(draft.engine)) errors.push({ field: 'engine', message: '请选择本机、云端或自定义引擎。' })
  const provider = PLAN09_PROVIDERS.find((item) => item.id === draft.provider)
  if (!provider) errors.push({ field: 'provider', message: '请选择已支持的服务方案。' })
  if (provider && provider.kind !== draft.engine) errors.push({ field: 'provider', message: '服务方案与引擎不一致，请重新选择。' })
  if (!provider || !provider.models.includes(draft.model)) errors.push({ field: 'model', message: '模型与所选服务不匹配。' })
  if (!provider || !provider.voices.includes(draft.voiceProfile)) errors.push({ field: 'voiceProfile', message: '音色与所选服务不匹配，请重新选择。' })
  if (!PLAN09_LANGUAGES.includes(draft.language)) errors.push({ field: 'language', message: '语言不在支持范围。' })
  if (!PLAN09_EMOTIONS.includes(draft.emotion)) errors.push({ field: 'emotion', message: '情绪不在支持范围。' })
  if (!Number.isFinite(draft.speed) || draft.speed < 0.5 || draft.speed > 2) errors.push({ field: 'speed', message: '语速需为 0.5–2.0 的数字。' })
  if (!Number.isFinite(draft.volume) || draft.volume < 0 || draft.volume > 100) errors.push({ field: 'volume', message: '音量需为 0–100 的数字。' })
  if ((draft.engine === 'cloud' || mode === 'cloud') && !cloudAuthorized) errors.push({ field: 'engine', message: '云端 Provider 尚未授权，不能预览或保存。' })
  if (mode === 'existing' && draft.engine !== 'custom') errors.push({ field: 'engine', message: '已有服务模式需要自定义/已有服务方案。' })
  if ((mode === 'local' || mode === 'cpu') && draft.engine !== 'local') errors.push({ field: 'engine', message: '本机/仅 CPU 模式不能使用云端引擎。' })
  if (!draft.text || !draft.text.trim()) errors.push({ field: 'text', message: '请填写演示文本。' })
  return { ok: errors.length === 0, errors }
}

const PLAN09_SINGING_VOICE_ENGINE = Object.freeze({ 'fixture-rvc-female': 'rvc', 'fixture-rvc-male': 'rvc', 'fixture-gateway': 'gateway' })

export function plan09ValidateSingingDraft(draft, { gpuAvailable = null, cloudAuthorized = false, deliveryAuthorized = false, mode = 'local' } = {}) {
  const errors = []
  if (!PLAN09_SINGING_ENGINES.includes(draft.engine)) errors.push({ field: 'engine', message: '请选择 RVC、SVC 或 Gateway。' })
  if (draft.engine === 'svc') errors.push({ field: 'engine', message: 'SVC 仅为后续可选，当前不发包、不承诺可用。' })
  if (mode === 'cloud' && draft.engine !== 'gateway') errors.push({ field: 'engine', message: '云端模式需要 Gateway/已有服务，不能使用本机 RVC。' })
  if (mode === 'cloud' && !cloudAuthorized) errors.push({ field: 'engine', message: '云端服务尚未授权，不能预览或保存。' })
  if (mode === 'existing' && draft.engine !== 'gateway') errors.push({ field: 'engine', message: '已有服务模式需要 Gateway。' })
  if ((mode === 'local' || mode === 'cpu') && draft.engine !== 'rvc') errors.push({ field: 'engine', message: '本机/仅 CPU 模式需要 RVC。' })
  if (!PLAN09_SINGING_VOICES.some((voice) => voice.id === draft.voiceProfile)) errors.push({ field: 'voiceProfile', message: '请选择音色方案。' })
  else if (PLAN09_SINGING_VOICE_ENGINE[draft.voiceProfile] !== draft.engine) errors.push({ field: 'voiceProfile', message: '音色与所选方案不匹配，请重新选择。' })
  if (!draft.sourceAuthorized) errors.push({ field: 'sourceAuthorized', message: '必须确认演示素材已获授权。' })
  if (!draft.voiceConsent) errors.push({ field: 'voiceConsent', message: '必须确认音色使用已获同意。' })
  if (!/^fixture:\/\/[a-z0-9-]+$/.test(draft.sourceRef || '')) errors.push({ field: 'sourceRef', message: '请使用虚构引用，例如 fixture://demo-song-01。' })
  if (!Number.isInteger(draft.pitch) || draft.pitch < -12 || draft.pitch > 12) errors.push({ field: 'pitch', message: '音高需为 −12..12 的整数。' })
  for (const key of ['vocalGainDb', 'instrumentalGainDb']) {
    if (!Number.isFinite(draft[key]) || draft[key] < -12 || draft[key] > 12) errors.push({ field: key, message: '增益需为 −12..12 dB 的数字。' })
  }
  if (!['MIXED', 'CLEAN_VOCAL'].includes(draft.sourceLayout)) errors.push({ field: 'sourceLayout', message: '请选择素材类型。' })
  if (!['WITH_INSTRUMENTAL', 'VOCAL_ONLY'].includes(draft.mixMode)) errors.push({ field: 'mixMode', message: '请选择混音方式。' })
  if (draft.deliveryRequested && !deliveryAuthorized) errors.push({ field: 'deliveryRequested', message: '未授权微信投递，只能保存草稿。' })
  if (gpuAvailable === false && mode === 'local') errors.push({ field: 'mode', message: '当前没有可用 GPU；请切换仅 CPU、云端或已有服务。' })
  return { ok: errors.length === 0, errors }
}

/**
 * Map an effective draft onto the Coordinator's existing writable fields. Unsupported fields stay
 * local draft state and are reported as such; they must not be replaced with unrelated writes.
 */
export function plan09DraftToChanges(feature, draft, { senderRevision } = {}) {
  if (feature !== 'voice-bubbles') {
    return {
      supported: false,
      changes: null,
      applied: [],
      unsupported: ['唱歌草稿没有对应的 Coordinator 可写字段；本页只保存草稿，不写配置。'],
    }
  }
  const protocolProvider = Object.prototype.hasOwnProperty.call(PLAN09_PROVIDER_PROTOCOL, draft.provider)
    ? PLAN09_PROVIDER_PROTOCOL[draft.provider]
    : null
  if (!protocolProvider) {
    return {
      supported: false,
      changes: null,
      applied: [],
      unsupported: ['当前服务方案没有可用的真实协议映射，只能浏览草稿；不会把未知值写进配置。'],
    }
  }
  const unsupported = []
  if (draft.language !== 'zh-CN') unsupported.push('语言')
  if (draft.emotion !== 'neutral') unsupported.push('情绪')
  if (draft.speed !== 1) unsupported.push('语速')
  if (draft.volume !== 60) unsupported.push('音量')
  if (draft.engine === 'cloud') unsupported.push('云端真实调用（仅演示授权）')
  return {
    supported: true,
    changes: {
      schemaVersion: 1,
      changes: {
        senderService: {
          expectedRevision: senderRevision,
          set: {
            tts: { provider: protocolProvider, model: draft.model, voice: draft.voiceProfile },
          },
        },
      },
    },
    protocolProvider,
    applied: ['Provider', '模型', '音色'],
    unsupported,
  }
}

const PLAN09_RESULT_STATES = ['PREPARED', 'SAVED', 'PENDING_APPLY', 'APPLIED', 'PARTIALLY_APPLIED', 'CONFLICT', 'UNKNOWN', 'FAILED']

/**
 * Classify an operation result by the Coordinator's own `state`. `ok` alone is not a transaction
 * state: an empty/null response, `{ok:true}` without a state, or any unrecognised shape means the
 * outcome of an already-sent operation is unknown — never saved and never "failed with no write".
 * A `PREPARED` answer to an execute/apply call means the operation was refused before writing.
 */
export function plan09ClassifyCoordinatorResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { recognized: false, phase: 'UNKNOWN', transactionId: null, errorCode: 'EMPTY_RESPONSE', result: null }
  }
  const transactionId = typeof result.transactionId === 'string' && result.transactionId ? result.transactionId : null
  const errorCode = result.error && typeof result.error.code === 'string' ? result.error.code : null
  const state = typeof result.state === 'string' && PLAN09_RESULT_STATES.includes(result.state) ? result.state : null
  if (!state) return { recognized: false, phase: 'UNKNOWN', transactionId, errorCode: errorCode || 'NO_TRUSTED_STATE', result }
  if (state === 'PREPARED') return { recognized: true, phase: 'FAILED', transactionId, errorCode: errorCode || 'NOT_EXECUTED', result }
  return { recognized: true, phase: state, transactionId, errorCode, result }
}

/** Project a Coordinator result into the labels the UI may truthfully show. */
export function plan09ProjectCoordinatorResult(result) {
  if (!result || typeof result !== 'object') return { phase: 'UNKNOWN', label: '结果未知 · 只读', tone: 'error', canApply: false, text: '未收到可信事务结果。' }
  const classified = plan09ClassifyCoordinatorResult(result)
  const state = classified.phase
  const map = {
    PREPARED: ['已准备计划', 'wait', false],
    SAVED: ['已保存 · 待生效', 'busy', true],
    PENDING_APPLY: ['已保存 · 待生效', 'busy', true],
    APPLIED: ['已生效', 'online', false],
    PARTIALLY_APPLIED: ['部分生效 · 非 APPLIED', 'busy', false],
    CONFLICT: ['冲突 / 已拒绝', 'error', false],
    UNKNOWN: ['结果未知 · 只读', 'error', false],
    FAILED: ['失败', 'error', false],
  }
  const [label, tone, canApply] = map[state] || ['结果未知 · 只读', 'error', false]
  const steps = Array.isArray(result.steps) ? result.steps.map((step) => ({
    source: step.source || null,
    status: step.status || null,
    savedRevision: step.savedRevision || null,
    applyStatus: step.applyStatus || null,
    activeRevision: step.activeRevision === undefined ? null : step.activeRevision,
  })) : []
  return {
    phase: state,
    label,
    tone,
    canApply,
    transactionId: classified.transactionId,
    planId: result.plan ? result.plan.planId : null,
    expectedRevision: result.plan ? result.plan.expectedRevision : null,
    activeRevision: result.activeRevision === undefined ? null : result.activeRevision,
    activeConfirmed: result.activeConfirmed === true,
    steps,
    confirmed: Array.isArray(result.confirmed) ? result.confirmed : [],
    mismatch: Array.isArray(result.mismatch) ? result.mismatch : [],
    rejected: Array.isArray(result.rejected) ? result.rejected : [],
    errorCode: classified.errorCode,
    text: `事务 ${state} · ${result.applyState || '未生效'}`,
  }
}

/**
 * Transaction authority for the panel. One plain entry per workspace/profile/feature identity:
 * the prepared snapshot, the operations already sent, the unresolved/unknown outcome and the
 * determined terminal state live here instead of inside one component instance. Events are pure
 * reducers so cross-page, late-response and lost-response behavior is testable without a browser.
 */
const PLAN09_TX_PREPARE_PHASES = ['DIRTY', 'CONFLICT', 'FAILED', 'APPLIED']
const PLAN09_TX_RESETTABLE_PHASES = ['SAVED', 'PENDING_APPLY', 'APPLIED', 'PARTIALLY_APPLIED']

export function plan09TransactionInitial() {
  return {
    phase: 'DIRTY',
    busy: false,
    inFlight: null,
    plan: null,
    result: null,
    txId: null,
    error: null,
    planStale: false,
    contextStale: false,
    draftDirty: false,
    outcomeUnknown: false,
    frozenChanges: null,
    frozenSerial: null,
    contextSerial: null,
    history: [],
    opSeq: 0,
    inFlightSeq: 0,
    draftVersion: 0,
    inFlightContext: null,
    noWriteConfirmed: false,
  }
}

function plan09TransactionStartNext(current, event) {
  const at = event && typeof event.at === 'string' ? event.at : null
  const history = current.txId || current.phase === 'APPLIED'
    ? [{ phase: current.phase, txId: current.txId, error: current.error, at }, ...(current.history || [])].slice(0, 5)
    : current.history || []
  const seq = (current.opSeq || 0) + 1
  return {
    ...plan09TransactionInitial(),
    history,
    draftVersion: current.draftVersion || 0,
    opSeq: seq,
    inFlightSeq: seq,
  }
}

/**
 * Trusted "nothing was written" evidence. The Coordinator only reports `FAILED` for an execute when
 * the adapter declared `writeOutcome: NOT_WRITTEN` and every already-saved step was rolled back;
 * recovery repeats `FAILED`/`committed:false`. Everything else (unknown write outcome, missing state,
 * in-flight journal) is `UNKNOWN` and stays latched.
 */
export function plan09NoWriteConfirmed(result) {
  if (!result || typeof result !== 'object') return false
  if (result.state !== 'FAILED') return false
  const error = result.error && typeof result.error === 'object' ? result.error : null
  if (error && (error.rolledBack === true || error.writeOutcome === 'NOT_WRITTEN')) return true
  return result.committed === false && result.recoveryRequired === false
}

/**
 * Finish an already-sent operation. The Coordinator's own `state` is authoritative; an empty or
 * incomplete answer is an unknown outcome (no invented success, no invented pre-write failure).
 */
function plan09TransactionFinish(current, result) {
  const classified = plan09ClassifyCoordinatorResult(result)
  const txId = classified.transactionId || current.txId || null
  return {
    ...current,
    busy: false,
    inFlight: null,
    phase: classified.phase,
    plan: null,
    result: classified.result,
    txId,
    error: classified.errorCode,
    planStale: false,
    contextStale: false,
    outcomeUnknown: classified.phase === 'UNKNOWN' && !txId,
    noWriteConfirmed: classified.phase === 'FAILED' && plan09NoWriteConfirmed(result),
  }
}

export function plan09ReduceTransaction(entry, event = {}) {
  const current = { ...plan09TransactionInitial(), ...(entry || {}) }
  switch (event.type) {
    case 'DRAFT_EDITED': {
      const draftVersion = (current.draftVersion || 0) + 1
      const next = { ...current, draftDirty: true, draftVersion }
      if (current.busy) return next
      if (current.phase === 'APPLIED') return { ...plan09TransactionStartNext(current, event), draftDirty: true, draftVersion }
      if (current.txId || current.outcomeUnknown || current.phase === 'UNKNOWN') return next
      return {
        ...next,
        phase: 'DIRTY',
        error: null,
        plan: null,
        result: null,
        planStale: false,
        frozenChanges: null,
        frozenSerial: null,
        contextSerial: null,
      }
    }
    case 'START_NEXT_CYCLE':
    case 'RESET': {
      if (current.busy) return current
      if (!plan09CanReset(current)) return current
      return plan09TransactionStartNext(current, event)
    }
    case 'PREPARE_START': {
      if (current.busy) return current
      const seq = (current.opSeq || 0) + 1
      return {
        ...current,
        busy: true,
        inFlight: 'prepare',
        opSeq: seq,
        inFlightSeq: seq,
        inFlightContext: typeof event.contextSerial === 'string' ? event.contextSerial : null,
        error: null,
      }
    }
    case 'PREPARE_DONE': {
      if (event.seq !== current.inFlightSeq) return current
      const result = event.result || null
      if (event.stale === true) {
        return {
          ...current,
          busy: false,
          inFlight: null,
          phase: 'DIRTY',
          plan: null,
          result: null,
          txId: null,
          error: 'STALE_PREPARE',
          draftDirty: true,
          planStale: false,
          frozenChanges: null,
          frozenSerial: null,
          contextSerial: null,
        }
      }
      if (!result || result.ok !== true || !result.plan || typeof result.plan.planId !== 'string') {
        return {
          ...current,
          busy: false,
          inFlight: null,
          phase: 'FAILED',
          plan: null,
          result: result || null,
          txId: null,
          error: result && result.error && result.error.code ? result.error.code : 'PREPARE_FAILED',
          draftDirty: false,
          planStale: false,
          frozenChanges: null,
          frozenSerial: null,
          contextSerial: null,
        }
      }
      const preparedContext = typeof event.contextSerial === 'string' ? event.contextSerial : null
      const contextChanged = typeof current.inFlightContext === 'string' && preparedContext !== null && current.inFlightContext !== preparedContext
      return {
        ...current,
        busy: false,
        inFlight: null,
        phase: 'PREPARED',
        plan: result.plan,
        result,
        txId: null,
        error: contextChanged ? 'CONTEXT_CHANGED' : null,
        draftDirty: false,
        planStale: contextChanged,
        contextStale: contextChanged,
        frozenChanges: event.frozenChanges || null,
        frozenSerial: typeof event.frozenSerial === 'string' ? event.frozenSerial : null,
        contextSerial: preparedContext,
      }
    }
    case 'PREPARE_LOST': {
      if (event.seq !== current.inFlightSeq) return current
      return {
        ...current,
        busy: false,
        inFlight: null,
        phase: 'FAILED',
        plan: null,
        result: null,
        txId: null,
        error: typeof event.error === 'string' ? event.error : 'PREPARE_REJECTED',
        frozenChanges: null,
        frozenSerial: null,
        contextSerial: null,
      }
    }
    case 'CONTEXT_CHANGED': {
      const next = { ...current, contextStale: true }
      if (current.plan && !current.busy) return { ...next, planStale: true, error: 'CONTEXT_CHANGED' }
      return next
    }
    case 'PLAN_CONTENT_CHANGED':
      return { ...current, planStale: true, error: 'PLAN_CONTENT_CHANGED' }
    case 'AUTHORIZATION_CHANGED':
      return { ...current, planStale: true, error: 'AUTHORIZATION_CHANGED' }
    case 'EXECUTE_START': {
      if (current.busy) return current
      const seq = (current.opSeq || 0) + 1
      return { ...current, busy: true, inFlight: 'execute', opSeq: seq, inFlightSeq: seq, error: null }
    }
    case 'EXECUTE_DONE': {
      if (event.seq !== current.inFlightSeq) return current
      return plan09TransactionFinish(current, event.result)
    }
    case 'EXECUTE_LOST': {
      if (event.seq !== current.inFlightSeq) return current
      return {
        ...current,
        busy: false,
        inFlight: null,
        phase: 'UNKNOWN',
        plan: null,
        result: null,
        txId: null,
        error: 'RESPONSE_LOST',
        planStale: false,
        outcomeUnknown: true,
      }
    }
    case 'APPLY_START': {
      if (current.busy) return current
      const seq = (current.opSeq || 0) + 1
      return { ...current, busy: true, inFlight: 'apply', opSeq: seq, inFlightSeq: seq, error: null }
    }
    case 'APPLY_DONE': {
      if (event.seq !== current.inFlightSeq) return current
      return plan09TransactionFinish(current, event.result)
    }
    case 'APPLY_LOST': {
      if (event.seq !== current.inFlightSeq) return current
      return { ...current, busy: false, inFlight: null, phase: 'UNKNOWN', error: 'APPLY_REJECTED', plan: null }
    }
    case 'STATUS_START': {
      if (current.busy) return current
      const seq = (current.opSeq || 0) + 1
      return { ...current, busy: true, inFlight: 'status', opSeq: seq, inFlightSeq: seq, error: null }
    }
    case 'STATUS_DONE': {
      if (event.seq !== current.inFlightSeq) return current
      return plan09TransactionFinish(current, event.result)
    }
    case 'STATUS_LOST': {
      if (event.seq !== current.inFlightSeq) return current
      return { ...current, busy: false, inFlight: null, phase: 'UNKNOWN', error: 'STATUS_UNKNOWN', plan: null }
    }
    default:
      return current
  }
}

/** Buttons follow the shared authority, not a component-local busy flag. */
export function plan09CanPrepare(entry, { currentSerial = null } = {}) {
  const current = entry || plan09TransactionInitial()
  if (current.busy || current.txId || current.outcomeUnknown === true) return false
  if (PLAN09_TX_PREPARE_PHASES.includes(current.phase)) return true
  if (current.phase === 'PREPARED') {
    if (current.planStale === true) return true
    return typeof current.frozenSerial === 'string' && current.frozenSerial !== currentSerial
  }
  return false
}

export function plan09CanConfirm(entry, { currentSerial = null, contextSerial = null } = {}) {
  const current = entry || plan09TransactionInitial()
  if (current.busy || !current.plan || current.phase !== 'PREPARED' || current.planStale) return false
  if (typeof current.frozenSerial === 'string' && current.frozenSerial !== currentSerial) return false
  if (typeof current.contextSerial === 'string' && current.contextSerial !== contextSerial) return false
  return true
}

export function plan09CanApply(entry) {
  const current = entry || plan09TransactionInitial()
  return !current.busy && Boolean(current.txId) && ['SAVED', 'PENDING_APPLY'].includes(current.phase) && current.outcomeUnknown !== true
}

export function plan09CanReadStatus(entry) {
  const current = entry || plan09TransactionInitial()
  return !current.busy && Boolean(current.txId)
}

/**
 * Only a determined outcome may end a transaction and start a new draft. UNKNOWN (with or without a
 * transaction ID) is unresolved: it stays latched until a trusted status check decides it. A
 * Coordinator `FAILED` is determined — and when it also carries trusted no-write/rollback evidence
 * the UI may say so — but ending the association never replays the consumed plan.
 */
export function plan09CanReset(entry) {
  const current = entry || plan09TransactionInitial()
  if (current.busy || current.outcomeUnknown === true) return false
  if (PLAN09_TX_RESETTABLE_PHASES.includes(current.phase)) return true
  if (current.phase !== 'FAILED') return false
  if (current.noWriteConfirmed === true) return true
  return Boolean(current.result) && current.result.state === 'FAILED'
}

/** Display projection for the panel: the entry phase decides, never `ok` or a stale result. */
export function plan09TransactionView(entry) {
  const current = { ...plan09TransactionInitial(), ...(entry || {}) }
  if (current.outcomeUnknown === true && !current.txId) {
    return { phase: 'UNKNOWN', label: '结果未知 · 未收到响应', tone: 'error', text: '未收到保存响应：写入可能已经发生；没有可信结果，不能当作失败，也不能重置或自动重试。' }
  }
  const map = {
    DIRTY: ['未保存草稿', 'wait'],
    FAILED: ['失败', 'error'],
    CONFLICT: ['冲突', 'error'],
    PREPARED: ['已准备计划', 'wait'],
    SAVED: ['已保存 · 待生效', 'busy'],
    PENDING_APPLY: ['已保存 · 待生效', 'busy'],
    APPLIED: ['已生效', 'online'],
    PARTIALLY_APPLIED: ['部分生效 · 非 APPLIED', 'busy'],
    UNKNOWN: ['结果未知 · 只读', 'error'],
  }
  const [label, tone] = map[current.phase] || ['未保存草稿', 'wait']
  let text = '事务 ' + current.phase + ' · 尚未取得生效确认。'
  if (current.phase === 'UNKNOWN') text = '事务结果未知 · 只读：取得可信状态前不能结束或开始新的写入。'
  else if (current.phase === 'FAILED' && current.noWriteConfirmed === true) text = '已取得可信“未写入/已回滚”结论：结束关联后可准备下一份草稿，旧计划不会重放。'
  else if (current.phase === 'FAILED') text = '已确定失败；结束关联后可准备下一份草稿，旧计划不会重放。'
  else if (current.phase === 'PREPARED' && current.planStale === true) text = '准备期间上下文/授权已变化：旧计划不可确认，可直接重新准备。'
  return { phase: current.phase, label, tone, text }
}

export function plan09InstallView(status) {
  const map = {
    idle: { label: '未检查', tone: 'wait', busy: false },
    checking: { label: '检查中', tone: 'wait', busy: true },
    unavailable: { label: '不可用', tone: 'error', busy: false },
    installing: { label: '演示安装中', tone: 'busy', busy: true },
    installed: { label: '已安装 · 待验证', tone: 'wait', busy: false },
    ready: { label: '演示就绪', tone: 'demo', busy: false },
    blocked: { label: '阻塞', tone: 'error', busy: false },
    cancelled: { label: '已取消', tone: 'wait', busy: false },
    failed: { label: '演示失败', tone: 'error', busy: false },
  }
  return map[status] || map.idle
}

export function plan09InstallFailureReason(code) {
  const map = {
    NO_GPU: '没有检测到可用 GPU；可以切换 CPU 或云端，或稍后重试。',
    OFFLINE: '网络不可用；演示不会发起真实下载，请恢复网络后重新检查。',
    NO_SPACE: '磁盘空间不足；请清理空间或更换安装位置后重试。',
    LICENSE_MISSING: '模型许可未确认；请阅读来源与许可并取得授权。',
    NO_ADAPTER: '未接入隔离适配器，不能执行依赖检查。',
    UNKNOWN: '状态未知；不会当作安装成功，请重新检查。',
  }
  return map[code] || map.UNKNOWN
}