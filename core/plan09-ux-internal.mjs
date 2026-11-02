/* Whale Voice — Plan 09 dual-entry onboarding and offline config UX model.
 *
 * Pure, browser-safe helpers: feature catalog, per-feature/manifest wizard persistence, mode-based
 * dependency projections, draft validation/cleanup, and an explicitly isolated demo transaction
 * state machine. It never writes production configuration or credentials.
 */

export const PLAN09_MANIFEST_REVISION = 1

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

export const PLAN09_DEPENDENCY_CATALOG = Object.freeze({
  core: { label: 'Whale Voice Core', desc: '配置、任务与状态的可信来源。', required: true, shared: true },
  tts: { label: 'TTS Provider', desc: '把文字合成为音频；本地或已授权云端。', required: true, shared: true },
  rvc: { label: 'RVC 翻唱模型', desc: '标准翻唱首发模型；需要单独下载与许可确认。', required: true },
  separation: { label: '人声分离模型', desc: '唱歌时分离人声与伴奏。', required: true },
  sender: { label: '微信语音发送器', desc: '仅投递时必需；本机音频执行模块。', required: false, delivery: true, shared: true },
  wechat: { label: 'WeChatAgent 桥', desc: '仅投递到微信时必需；未接入时只能浏览与保存草稿。', required: false, delivery: true, shared: true },
  gpu: { label: '可用 GPU / 显存', desc: '本机模式下的资源检查；未知不会被当作可用。', conditional: true },
  network: { label: '云端网络与授权', desc: '云端模式必需的授权与连通性；真实调用始终禁用。', conditional: true },
  storage: { label: '磁盘空间', desc: '模型与缓存空间；未知时显示未知而不是通过。', required: false },
})

/** Stable storage key per workspace/profile, feature and manifest revision. */
export function plan09WizardKey({ workspace = 'demo-workspace', profile = 'demo-profile', feature, manifestRevision = PLAN09_MANIFEST_REVISION } = {}) {
  return `wv.plan09.wizard.v1.${workspace}.${profile}.${feature}.${manifestRevision}`
}

export function plan09ReadWizard(storage, key) {
  const empty = { introAcknowledged: false, selectedMode: null, verifiedCapabilitiesRevision: null, updatedAt: null }
  if (!storage || typeof storage.getItem !== 'function') return empty
  try {
    const raw = storage.getItem(key)
    if (!raw) return empty
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return empty
    return {
      introAcknowledged: parsed.introAcknowledged === true,
      selectedMode: PLAN09_MODES.some((mode) => mode.id === parsed.selectedMode) ? parsed.selectedMode : null,
      verifiedCapabilitiesRevision: Number.isInteger(parsed.verifiedCapabilitiesRevision) ? parsed.verifiedCapabilitiesRevision : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    }
  } catch {
    return empty
  }
}

export function plan09WriteWizard(storage, key, patch = {}) {
  if (!storage || typeof storage.setItem !== 'function') return null
  const current = plan09ReadWizard(storage, key)
  const next = {
    introAcknowledged: patch.introAcknowledged === undefined ? current.introAcknowledged : patch.introAcknowledged === true,
    selectedMode: patch.selectedMode === undefined ? current.selectedMode : (PLAN09_MODES.some((mode) => mode.id === patch.selectedMode) ? patch.selectedMode : null),
    verifiedCapabilitiesRevision: patch.verifiedCapabilitiesRevision === undefined
      ? current.verifiedCapabilitiesRevision
      : (Number.isInteger(patch.verifiedCapabilitiesRevision) ? patch.verifiedCapabilitiesRevision : null),
    updatedAt: new Date().toISOString(),
  }
  try {
    storage.setItem(key, JSON.stringify(next))
    return next
  } catch {
    return null
  }
}

/**
 * Decide whether the target-feature wizard should open. The global SetupWizard keeps priority; an
 * acknowledgement only records that the intro was read, never READY or production permission.
 */
export function plan09DeriveWizardView({ stored, capabilityRevision = null, globalSetupOpen = false, force = false } = {}) {
  const state = stored || { introAcknowledged: false, selectedMode: null, verifiedCapabilitiesRevision: null }
  const changed = capabilityRevision !== null && state.verifiedCapabilitiesRevision !== null && state.verifiedCapabilitiesRevision !== capabilityRevision
  if (globalSetupOpen) return { shouldOpen: false, deferred: true, changed, reason: 'GLOBAL_SETUP_FIRST' }
  if (force) return { shouldOpen: true, deferred: false, changed, reason: 'MANUAL_REOPEN' }
  if (!state.introAcknowledged) return { shouldOpen: true, deferred: false, changed, reason: 'FIRST_VISIT' }
  if (changed) return { shouldOpen: true, deferred: false, changed, reason: 'CAPABILITY_CHANGED' }
  return { shouldOpen: false, deferred: false, changed: false, reason: 'ACKNOWLEDGED' }
}

/** Required / optional / delivery-only / conditional groups for one feature + mode. */
export function plan09DependencyGroups(feature, mode) {
  const groups = { required: [], optional: [], deliveryOnly: [], conditional: [] }
  const add = (group, key) => {
    const item = PLAN09_DEPENDENCY_CATALOG[key]
    if (item) groups[group].push({ key, ...item })
  }
  add('required', 'core')
  add('required', 'tts')
  if (mode === 'local') add('conditional', 'gpu')
  if (mode === 'cloud') add('conditional', 'network')
  if (feature === 'singing') {
    add('required', 'rvc')
    add('required', 'separation')
  }
  add('optional', 'storage')
  add('deliveryOnly', 'sender')
  add('deliveryOnly', 'wechat')
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

const PLAN09_VOICE_ENGINES = ['local', 'cloud', 'custom']
const PLAN09_SINGING_ENGINES = ['rvc', 'svc', 'gateway']
const PLAN09_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'auto']
const PLAN09_EMOTIONS = ['neutral', 'gentle', 'happy', 'shy', 'playful', 'sad']

export function plan09DefaultVoiceDraft() {
  return { engine: 'local', provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voiceProfile: 'whale-v1', language: 'zh-CN', emotion: 'neutral', speed: 1, volume: 60, text: '晚安，今天也辛苦啦。' }
}

export function plan09DefaultSingingDraft() {
  return { engine: 'rvc', sourceAuthorized: false, voiceConsent: false, pitch: 0, vocalGainDb: 0, instrumentalGainDb: 0, separation: true, mixMode: 'WITH_INSTRUMENTAL', deliveryRequested: false, sourceRef: '', text: '一段虚构的试唱文本。' }
}

/** Switch engines and explicitly report which incompatible fields were cleared. */
export function plan09SwitchEngine(feature, draft, engine) {
  const next = { ...draft, engine }
  const cleared = []
  if (feature === 'voice-bubbles') {
    if (engine === 'cloud') {
      if (next.provider !== 'fixture-cloud') { next.provider = 'fixture-cloud'; cleared.push('provider') }
      if (next.model !== 'fixture-cloud-voice-v1') { next.model = 'fixture-cloud-voice-v1'; cleared.push('model') }
    } else if (engine === 'local') {
      if (next.provider !== 'qwen-local') { next.provider = 'qwen-local'; cleared.push('provider') }
      if (next.model !== 'Qwen3-TTS-12Hz-1.7B-Base') { next.model = 'Qwen3-TTS-12Hz-1.7B-Base'; cleared.push('model') }
    } else {
      if (next.provider !== 'custom-local') { next.provider = 'custom-local'; cleared.push('provider') }
      if (next.model !== 'custom-model') { next.model = 'custom-model'; cleared.push('model') }
    }
  } else if (engine === 'svc') {
    next.deliveryRequested = false
    cleared.push('deliveryRequested')
  }
  return { draft: next, cleared }
}

export function plan09ValidateVoiceDraft(draft, { cloudAuthorized = false } = {}) {
  const errors = []
  if (!PLAN09_VOICE_ENGINES.includes(draft.engine)) errors.push({ field: 'engine', message: '请选择本机、云端或自定义引擎。' })
  if (!draft.provider) errors.push({ field: 'provider', message: '请选择 Provider。' })
  if (!draft.model) errors.push({ field: 'model', message: '请选择模型。' })
  if (!draft.voiceProfile) errors.push({ field: 'voiceProfile', message: '请选择音色。' })
  if (!PLAN09_LANGUAGES.includes(draft.language)) errors.push({ field: 'language', message: '语言不在支持范围。' })
  if (!PLAN09_EMOTIONS.includes(draft.emotion)) errors.push({ field: 'emotion', message: '情绪不在支持范围。' })
  if (typeof draft.speed !== 'number' || draft.speed < 0.5 || draft.speed > 2) errors.push({ field: 'speed', message: '语速需在 0.5–2.0 之间。' })
  if (typeof draft.volume !== 'number' || draft.volume < 0 || draft.volume > 100) errors.push({ field: 'volume', message: '音量需在 0–100 之间。' })
  if (draft.engine === 'cloud' && !cloudAuthorized) errors.push({ field: 'engine', message: '云端 Provider 尚未授权，不能演示保存。' })
  if (!draft.text || !draft.text.trim()) errors.push({ field: 'text', message: '请填写演示文本。' })
  return { ok: errors.length === 0, errors }
}

export function plan09ValidateSingingDraft(draft, { gpuAvailable = null, deliveryAuthorized = false } = {}) {
  const errors = []
  if (!PLAN09_SINGING_ENGINES.includes(draft.engine)) errors.push({ field: 'engine', message: '请选择 RVC、SVC 或 Gateway。' })
  if (draft.engine === 'svc') errors.push({ field: 'engine', message: 'SVC 仅为后续可选，当前不发包、不承诺可用。' })
  if (!draft.sourceAuthorized) errors.push({ field: 'sourceAuthorized', message: '必须确认演示素材已获授权。' })
  if (!draft.voiceConsent) errors.push({ field: 'voiceConsent', message: '必须确认音色使用已获同意。' })
  if (!Number.isInteger(draft.pitch) || draft.pitch < -12 || draft.pitch > 12) errors.push({ field: 'pitch', message: '音高需为 −12..12 的整数。' })
  for (const key of ['vocalGainDb', 'instrumentalGainDb']) {
    if (typeof draft[key] !== 'number' || draft[key] < -12 || draft[key] > 12) errors.push({ field: key, message: '增益需在 −12..12 dB。' })
  }
  if (draft.deliveryRequested && !deliveryAuthorized) errors.push({ field: 'deliveryRequested', message: '未授权微信投递，只能保存草稿。' })
  if (gpuAvailable === false && draft.engine !== 'gateway') errors.push({ field: 'engine', message: '当前没有可用 GPU；请切换仅 CPU 或已有服务。' })
  return { ok: errors.length === 0, errors }
}

export function plan09InstallView(status) {
  const map = {
    idle: { label: '未检查', tone: 'wait', busy: false },
    checking: { label: '检查中', tone: 'wait', busy: true },
    installing: { label: '演示安装中', tone: 'busy', busy: true },
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
    UNKNOWN: '状态未知；不会当作安装成功，请重新检查。',
  }
  return map[code] || map.UNKNOWN
}

/**
 * Isolation-only demo transaction. It mirrors the observable Coordinator states but writes nothing;
 * the UI must label it as a fake. Real transaction evidence comes from the Node Coordinator test.
 */
export function createPlan09DemoTransaction({ baseRevision = 4, planTtlMs = 60_000, now = () => Date.now() } = {}) {
  let state = { phase: 'DIRTY', revision: baseRevision, planId: null, expiresAt: null, expectedRevision: null, savedRevision: null, appliedRevision: null, confirmed: false, consumed: false, lastError: null, pendingApply: false }
  const view = () => ({ ...state })
  return {
    view,
    prepare() {
      const planId = `demo-plan-${Math.random().toString(36).slice(2, 10)}`
      state = { ...state, phase: 'PREPARED', planId, expiresAt: now() + planTtlMs, expectedRevision: state.revision, confirmed: false, consumed: false, lastError: null }
      return view()
    },
    validate({ confirmedPlanId } = {}) {
      if (state.phase !== 'PREPARED') return { ok: false, view: view(), message: '当前没有待确认的计划。' }
      if (now() > state.expiresAt) { state = { ...state, phase: 'CONFLICT', lastError: 'PLAN_EXPIRED' }; return { ok: false, view: view(), message: '计划已过期，请重新准备。' } }
      if (confirmedPlanId !== state.planId) { state = { ...state, phase: 'CONFLICT', lastError: 'CONFIRM_MISMATCH' }; return { ok: false, view: view(), message: '确认 ID 不匹配，已拒绝。' } }
      state = { ...state, phase: 'VALIDATED', confirmed: true }
      return { ok: true, view: view(), message: '校验通过；仍需隔离保存。' }
    },
    save({ currentRevision } = {}) {
      if (state.phase !== 'VALIDATED' || !state.confirmed) return { ok: false, view: view(), message: '计划未校验或未确认。' }
      if (state.consumed) return { ok: false, view: view(), message: '计划已被消费。' }
      if (currentRevision !== state.expectedRevision) {
        state = { ...state, phase: 'CONFLICT', lastError: 'REVISION_CONFLICT' }
        return { ok: false, view: view(), message: 'revision 冲突：请重新读取后再试。' }
      }
      state = { ...state, phase: 'SAVED', revision: state.revision + 1, savedRevision: state.revision + 1, consumed: true, confirmed: false, pendingApply: true }
      return { ok: true, view: view(), message: '已保存到隔离演示存储；未写生产配置，也尚未生效。' }
    },
    apply({ runtimeRevision } = {}) {
      if (!state.pendingApply || state.savedRevision === null) return { ok: false, view: view(), message: '没有待生效的保存。' }
      if (runtimeRevision !== state.savedRevision) {
        state = { ...state, phase: 'UNKNOWN', lastError: 'RUNTIME_REVISION_UNKNOWN' }
        return { ok: false, view: view(), message: '运行组件未确认同一 revision；保持 UNKNOWN，不自动重试。' }
      }
      state = { ...state, phase: 'APPLIED', appliedRevision: runtimeRevision, pendingApply: false }
      return { ok: true, view: view(), message: '运行组件确认已生效。' }
    },
    unknown() {
      state = { ...state, phase: 'UNKNOWN', lastError: 'RESULT_UNKNOWN' }
      return view()
    },
  }
}

export function plan09TransactionView(tx) {
  const map = {
    DIRTY: { label: '未保存草稿', tone: 'wait', canSave: false },
    PREPARED: { label: '已准备计划', tone: 'wait', canSave: false },
    VALIDATED: { label: '已校验待确认', tone: 'busy', canSave: true },
    SAVED: { label: '已保存 · 未生效', tone: 'busy', canSave: false },
    APPLIED: { label: '已生效', tone: 'online', canSave: false },
    CONFLICT: { label: '冲突 / 已拒绝', tone: 'error', canSave: false },
    UNKNOWN: { label: '结果未知 · 只读', tone: 'error', canSave: false },
  }
  const item = map[tx.phase] || map.DIRTY
  return { ...item, phase: tx.phase, revision: tx.revision, planId: tx.planId, expectedRevision: tx.expectedRevision, lastError: tx.lastError, pendingApply: tx.pendingApply, text: `演示事务 · ${item.label} · revision ${tx.revision}` }
}
