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
  core: { label: '鲸音 Core / 鲸递 Core', desc: '配置、任务与状态的可信来源；内部兼容 ID 保持 core。', required: true, shared: true, license: '随应用', size: '—' },
  tts: { label: 'TTS Provider', desc: '把文字合成为音频；本地服务或已授权云端。', required: true, shared: true, license: '按 Provider', size: '按模型' },
  cloud: { label: '云端授权与网络', desc: '需要明确授权、连通性与费用确认；真实调用始终禁用。', conditional: true, license: '用户授权', size: '按量计费' },
  rvc: { label: 'RVC 翻唱模型（首发）', desc: '标准翻唱模型；需单独确认来源与许可，不承诺低资源。', required: true, license: '需确认', size: '未知' },
  separation: { label: '人声分离模型', desc: '混合素材需要分离人声与伴奏；干净人声可跳过。', conditional: true, license: '需确认', size: '未知' },
  gateway: { label: '已有服务 Gateway', desc: '复用已安装服务；能力与版本必须由检查确认。', conditional: true, license: '随服务', size: '—' },
  sender: { label: '鲸递发送模块', desc: '仅投递时必需；Sender 是鲸递内部兼容执行模块，本计划不迁移。', delivery: true, shared: true, license: '随应用', size: '—' },
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
export function plan09DeriveWizardView({ stored, capabilityRevision = null, globalSetupOpen = false, force = false } = {}) {
  const state = stored || EMPTY_WIZARD
  const changed = capabilityRevision !== null && state.capabilityRevisionSeen !== null && state.capabilityRevisionSeen !== capabilityRevision
  if (globalSetupOpen) return { shouldOpen: false, deferred: true, changed, reason: 'GLOBAL_SETUP_FIRST' }
  if (force) return { shouldOpen: true, deferred: false, changed, reason: 'MANUAL_REOPEN' }
  if (changed) return { shouldOpen: true, deferred: false, changed, reason: 'CAPABILITY_CHANGED' }
  if (!state.introAcknowledged) {
    if (state.browseDismissedRevision === PLAN09_MANIFEST_REVISION) return { shouldOpen: false, deferred: false, changed, reason: 'BROWSED_THIS_REVISION' }
    return { shouldOpen: true, deferred: false, changed, reason: 'FIRST_VISIT' }
  }
  return { shouldOpen: false, deferred: false, changed: false, reason: 'ACKNOWLEDGED' }
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
    add('required', 'rvc')
    if (mode === 'cloud' || mode === 'existing') {
      add('conditional', mode === 'cloud' ? 'cloud' : 'gateway')
    } else if (sourceLayout === 'MIXED') {
      add('required', 'separation')
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
  if (feature === 'singing') {
    if (mode === 'cloud' && next.engine === 'rvc') { next.engine = 'gateway'; cleared.push('engine') }
    if (mode === 'local' && next.engine === 'gateway') { next.engine = 'rvc'; cleared.push('engine') }
    if (mode === 'cloud' && next.voiceProfile !== 'fixture-gateway') { next.voiceProfile = 'fixture-gateway'; cleared.push('voiceProfile') }
  }
  return { draft: next, cleared }
}

const PLAN09_VOICE_ENGINES = ['local', 'cloud', 'custom']
const PLAN09_SINGING_ENGINES = ['rvc', 'svc', 'gateway']
const PLAN09_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'auto']
const PLAN09_EMOTIONS = ['neutral', 'gentle', 'happy', 'shy', 'playful', 'sad']

export function plan09ValidateVoiceDraft(draft, { cloudAuthorized = false } = {}) {
  const errors = []
  if (!PLAN09_VOICE_ENGINES.includes(draft.engine)) errors.push({ field: 'engine', message: '请选择本机、云端或自定义引擎。' })
  const provider = PLAN09_PROVIDERS.find((item) => item.id === draft.provider)
  if (!provider) errors.push({ field: 'provider', message: '请选择已支持的服务方案。' })
  if (!provider || !provider.models.includes(draft.model)) errors.push({ field: 'model', message: '模型与所选服务不匹配。' })
  if (!provider || !provider.voices.includes(draft.voiceProfile)) errors.push({ field: 'voiceProfile', message: '音色与所选服务不匹配，请重新选择。' })
  if (!PLAN09_LANGUAGES.includes(draft.language)) errors.push({ field: 'language', message: '语言不在支持范围。' })
  if (!PLAN09_EMOTIONS.includes(draft.emotion)) errors.push({ field: 'emotion', message: '情绪不在支持范围。' })
  if (!Number.isFinite(draft.speed) || draft.speed < 0.5 || draft.speed > 2) errors.push({ field: 'speed', message: '语速需为 0.5–2.0 的数字。' })
  if (!Number.isFinite(draft.volume) || draft.volume < 0 || draft.volume > 100) errors.push({ field: 'volume', message: '音量需为 0–100 的数字。' })
  if (draft.engine === 'cloud' && !cloudAuthorized) errors.push({ field: 'engine', message: '云端 Provider 尚未授权，不能预览或保存。' })
  if (!draft.text || !draft.text.trim()) errors.push({ field: 'text', message: '请填写演示文本。' })
  return { ok: errors.length === 0, errors }
}

export function plan09ValidateSingingDraft(draft, { gpuAvailable = null, deliveryAuthorized = false, mode = 'local' } = {}) {
  const errors = []
  if (!PLAN09_SINGING_ENGINES.includes(draft.engine)) errors.push({ field: 'engine', message: '请选择 RVC、SVC 或 Gateway。' })
  if (draft.engine === 'svc') errors.push({ field: 'engine', message: 'SVC 仅为后续可选，当前不发包、不承诺可用。' })
  if (mode === 'cloud' && draft.engine !== 'gateway') errors.push({ field: 'engine', message: '云端模式需要 Gateway/已有服务，不能使用本机 RVC。' })
  if (!PLAN09_SINGING_VOICES.some((voice) => voice.id === draft.voiceProfile)) errors.push({ field: 'voiceProfile', message: '请选择音色方案。' })
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
            tts: { provider: draft.provider, model: draft.model, voice: draft.voiceProfile },
          },
        },
      },
    },
    applied: ['Provider', '模型', '音色'],
    unsupported,
  }
}

/** Project a Coordinator result into the labels the UI may truthfully show. */
export function plan09ProjectCoordinatorResult(result) {
  if (!result || typeof result !== 'object') return { phase: 'UNKNOWN', label: '结果未知 · 只读', tone: 'error', canApply: false, text: '未收到可信事务结果。' }
  const state = result.state || (result.ok ? 'PREPARED' : 'FAILED')
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
  const [label, tone, canApply] = map[state] || ['未识别状态', 'wait', false]
  return {
    phase: state,
    label,
    tone,
    canApply,
    transactionId: result.transactionId || null,
    planId: result.plan ? result.plan.planId : null,
    expectedRevision: result.plan ? result.plan.expectedRevision : null,
    activeRevision: Number.isInteger(result.activeRevision) ? result.activeRevision : null,
    errorCode: result.error && result.error.code ? result.error.code : null,
    text: `事务 ${state} · ${result.applyState || '未生效'}`,
  }
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