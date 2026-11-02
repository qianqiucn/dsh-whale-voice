/* Plan 09 — two entry pages, shared dependency wizard and Coordinator-backed config drafts.
 * All state is fake/local; the UI only talks to an injected isolated adapter and never writes
 * production configuration or credentials.
 */

const PLAN09_DEP_STORE = { states: new Map(), timers: new Map(), generations: new Map(), failures: {} }

function plan09Adapter() {
  try {
    const adapter = window.__WHALE_PLAN09_CONFIG__
    return adapter && typeof adapter.prepareChange === 'function' ? adapter : null
  } catch {
    return null
  }
}

function plan09Context(adapter) {
  const fallback = {
    workspace: 'demo-workspace', profile: 'demo-profile', manifestRevision: PLAN09_MANIFEST_REVISION,
    capabilityRevision: null, gpuAvailable: null, cloudAuthorized: false, deliveryAuthorized: false, senderRevision: null,
  }
  if (!adapter || typeof adapter.getContext !== 'function') return fallback
  try {
    const context = adapter.getContext() || {}
    return { ...fallback, ...context, manifestRevision: context.manifestRevision || PLAN09_MANIFEST_REVISION }
  } catch {
    return fallback
  }
}

function plan09DepScope(context, mode) {
  return [context.workspace, context.profile, context.manifestRevision, context.capabilityRevision, mode].join('|')
}

function plan09DepMapKey(scope, key) {
  return scope + '||' + key
}

function plan09DepState(scope, key) {
  return PLAN09_DEP_STORE.states.get(plan09DepMapKey(scope, key)) || { status: 'idle' }
}

function plan09DepSet(scope, key, value) {
  PLAN09_DEP_STORE.states.set(plan09DepMapKey(scope, key), value)
}

function plan09DepClearTimer(scope, key) {
  const mapKey = plan09DepMapKey(scope, key)
  const timer = PLAN09_DEP_STORE.timers.get(mapKey)
  if (timer) clearTimeout(timer)
  PLAN09_DEP_STORE.timers.delete(mapKey)
}

function plan09DepRun(scope, key, action, adapter, failure, onUpdate) {
  const mapKey = plan09DepMapKey(scope, key)
  const generation = (PLAN09_DEP_STORE.generations.get(mapKey) || 0) + 1
  PLAN09_DEP_STORE.generations.set(mapKey, generation)
  plan09DepClearTimer(scope, key)
  const current = plan09DepState(scope, key)
  if (action === 'cancel') {
    plan09DepSet(scope, key, { ...current, status: 'cancelled', busy: false, reason: 'CANCELLED' })
    onUpdate()
    return
  }
  if (action === 'retry') {
    plan09DepSet(scope, key, { status: 'idle' })
    onUpdate()
    return
  }
  if (action === 'check' || action === 'verify') {
    plan09DepSet(scope, key, { ...current, status: 'checking', busy: true })
    onUpdate()
    const timer = setTimeout(() => {
      if (PLAN09_DEP_STORE.generations.get(mapKey) !== generation) return
      let result = { ready: false, reason: 'NO_ADAPTER' }
      try { result = adapter.checkDependency(key, { scope }) || result } catch { result = { ready: false, reason: 'CHECK_FAILED' } }
      Promise.resolve(result).then((resolved) => {
        if (PLAN09_DEP_STORE.generations.get(mapKey) !== generation) return
        const value = resolved || { ready: false, reason: 'UNKNOWN' }
        plan09DepSet(scope, key, value.ready
          ? { status: 'ready', busy: false, demo: true, checkedAt: new Date().toISOString() }
          : { status: 'unavailable', busy: false, reason: value.reason || 'UNKNOWN' })
        onUpdate()
      }, () => {
        if (PLAN09_DEP_STORE.generations.get(mapKey) !== generation) return
        plan09DepSet(scope, key, { status: 'unavailable', busy: false, reason: 'CHECK_FAILED' })
        onUpdate()
      })
    }, 180)
    PLAN09_DEP_STORE.timers.set(mapKey, timer)
    return
  }
  if (action === 'install') {
    plan09DepSet(scope, key, { ...current, status: 'installing', busy: true })
    onUpdate()
    const timer = setTimeout(() => {
      if (PLAN09_DEP_STORE.generations.get(mapKey) !== generation) return
      if (failure && failure !== 'NONE') plan09DepSet(scope, key, { status: 'blocked', busy: false, reason: failure })
      else plan09DepSet(scope, key, { status: 'installed', busy: false, demo: true, checkedAt: null })
      onUpdate()
    }, 260)
    PLAN09_DEP_STORE.timers.set(mapKey, timer)
  }
}

function plan09CancelDepScope(scope) {
  for (const [mapKey, timer] of PLAN09_DEP_STORE.timers.entries()) {
    if (!mapKey.startsWith(scope + '||')) continue
    clearTimeout(timer)
    PLAN09_DEP_STORE.timers.delete(mapKey)
    const key = mapKey.slice(scope.length + 2)
    PLAN09_DEP_STORE.generations.set(mapKey, (PLAN09_DEP_STORE.generations.get(mapKey) || 0) + 1)
    const current = PLAN09_DEP_STORE.states.get(mapKey)
    if (current && current.busy) PLAN09_DEP_STORE.states.set(mapKey, { ...current, status: 'cancelled', busy: false, reason: 'CANCELLED' })
  }
}

function Plan09Wizard({ open, feature, mode, setMode, context, sourceLayout = 'MIXED', deliveryRequested = false, onClose, onAcknowledge, onBrowse, notify }) {
  const [install, setInstall] = React.useState({})
  const [failure, setFailure] = React.useState('NONE')
  const [introChecked, setIntroChecked] = React.useState(false)
  if (!open) return null
  const featureId = feature && feature.id ? feature.id : feature
  const adapter = plan09Adapter()
  const scope = plan09DepScope(context, mode)
  const groups = plan09DependencyGroups(featureId, mode, { sourceLayout, deliveryRequested })
  const refresh = () => setInstall(Object.fromEntries([...PLAN09_DEP_STORE.states.entries()]))
  const run = (key, action) => plan09DepRun(scope, key, action, adapter, failure, refresh)
  const close = () => { plan09CancelDepScope(scope); onClose() }
  const browse = () => { plan09CancelDepScope(scope); onBrowse() }
  const rowFor = (dep) => {
    const state = install[plan09DepMapKey(scope, dep.key)] || plan09DepState(scope, dep.key)
    const view = plan09InstallView(state.status)
    const buttons = [
      h(Badge, { key: 'badge', tone: view.tone }, view.label),
      h(Button, { key: 'check', size: 'sm', variant: 'ghost', disabled: state.busy, onClick: () => run(dep.key, 'check'), 'data-testid': 'plan09-check-' + dep.key }, '演示检查'),
    ]
    if (state.status !== 'ready') {
      buttons.push(h(Button, { key: 'install', size: 'sm', disabled: state.busy || !adapter, title: adapter ? '' : '未接入配置适配器', onClick: () => run(dep.key, 'install'), 'data-testid': 'plan09-install-' + dep.key }, '演示安装'))
    }
    if (state.status === 'installed') {
      buttons.push(h(Button, { key: 'verify', size: 'sm', onClick: () => run(dep.key, 'verify'), 'data-testid': 'plan09-verify-' + dep.key }, '验证能力'))
    }
    if (state.busy) buttons.push(h(Button, { key: 'cancel', size: 'sm', variant: 'ghost', onClick: () => run(dep.key, 'cancel'), 'data-testid': 'plan09-cancel-' + dep.key }, '取消'))
    if (state.status === 'blocked' || state.status === 'failed' || state.status === 'unavailable') {
      buttons.push(h(Button, { key: 'retry', size: 'sm', variant: 'ghost', onClick: () => run(dep.key, 'retry'), 'data-testid': 'plan09-retry-' + dep.key }, '重试'))
    }
    return h('div', { key: dep.key, className: 'wv-plan09-dep', 'data-testid': 'plan09-dep-' + dep.key, 'data-state': state.status },
      h('div', null,
        h('strong', null, dep.label),
        h('p', null, dep.desc),
        h('p', { className: 'wv-muted' }, '来源/许可：' + (dep.license || '未知') + ' · 体积：' + (dep.size || '未知')),
        state.status === 'blocked' || state.status === 'unavailable' ? h('p', { className: 'wv-plan09-error', 'data-testid': 'plan09-dep-reason-' + dep.key }, plan09InstallFailureReason(state.reason)) : null),
      h('div', { className: 'wv-row' }, buttons))
  }
  const groupSection = (key, title) => {
    if (!groups[key].length) return null
    return h('section', { key, className: 'wv-plan09-group' },
      h('h3', null, title, h('span', { className: 'wv-muted' }, ' · ' + groups[key].length)),
      groups[key].map(rowFor))
  }
  const footer = h(React.Fragment, null,
    h('span', { className: 'wv-setup-footnote' }, '演示向导 · 不下载、不安装、不写生产配置'),
    h('span', { className: 'wv-spacer' }),
    h(Button, { variant: 'ghost', onClick: browse, 'data-testid': 'plan09-wizard-browse' }, '仅浏览'),
    h(Button, {
      variant: 'primary', disabled: !introChecked, 'data-testid': 'plan09-wizard-acknowledge',
      onClick: () => { plan09CancelDepScope(scope); onAcknowledge({ mode, introAcknowledged: true }) },
    }, '知道啦，进入演示'))
  return h(Modal, {
    title: feature.label + ' · 首次依赖向导',
    subtitle: '先看依赖，再决定本机、CPU、云端或已有服务；确认只代表读过说明，不代表已就绪。',
    size: 'lg', onClose: close, footer,
  },
    h('div', { className: 'wv-plan09-intro', 'data-testid': 'plan09-wizard' },
      h('div', { className: 'wv-plan09-intro-icon' }, h(Icon, { name: feature.icon, size: 20 })),
      h('div', null,
        h('strong', null, featureId === 'singing' ? '唱歌需要 RVC 与必要的人声分离' : '语音气泡需要 TTS 和微信投递组件'),
        h('p', null, feature.hint + '。所有依赖检查、安装进度与失败恢复都是隔离演示，不会下载文件或启动真实服务。'),
        h('p', { className: 'wv-muted' }, '音色、Provider 与依赖共用同一份来源；这里不会创建第二套账号或凭据。'))),
    h('div', { className: 'wv-plan09-modes', role: 'group', 'aria-label': '运行模式' },
      PLAN09_MODES.map((item) => h('button', {
        key: item.id, type: 'button', 'data-testid': 'plan09-mode-' + item.id,
        className: 'wv-plan09-mode' + (mode === item.id ? ' active' : ''),
        onClick: () => setMode(item.id),
      },
        h('strong', null, item.label),
        h('span', null, item.desc)))),
    h('div', { className: 'wv-plan09-groups' },
      groupSection('required', '必需依赖'),
      groupSection('conditional', '按模式条件'),
      groupSection('optional', '可选'),
      groupSection('deliveryOnly', '仅投递时必需')),
    h('div', { className: 'wv-plan09-failure' },
      h('span', null, '演示失败原因：'),
      h('select', {
        className: 'wv-select', value: failure, 'data-testid': 'plan09-failure-select',
        onChange: (event) => setFailure(event.target.value),
      },
        [['NONE', '不注入失败'], ['NO_GPU', '没有 GPU'], ['OFFLINE', '断网'], ['NO_SPACE', '磁盘空间不足'], ['LICENSE_MISSING', '许可缺失'], ['UNKNOWN', '状态未知']].map(([value, label]) => h('option', { key: value, value }, label)))),
    h('label', { className: 'wv-plan09-check' },
      h('input', { type: 'checkbox', checked: introChecked, 'data-testid': 'plan09-intro-check', onChange: (event) => setIntroChecked(event.target.checked) }),
      h('span', null, '我已了解这是隔离演示；确认不会把组件标成真实安装成功，也不会提升生产权限。')),
    h('p', { className: 'wv-muted', style: { margin: '8px 0 0', fontSize: 11 } }, '当前记录：' + (context.introAcknowledged ? '已确认过本版本说明' : '本版本尚未确认') + ' · manifest r' + context.manifestRevision))
}

function Plan09DraftField({ label, children, hint }) {
  return h('div', { className: 'wv-field' }, h('label', null, label), children, hint ? h('small', { className: 'wv-muted' }, hint) : null)
}

function Plan09TransactionPanel({ feature, draft, validate, context, onNotify }) {
  const adapter = plan09Adapter()
  const [state, setState] = React.useState({ phase: 'DIRTY', result: null, plan: null, busy: false, error: null })
  const lastDraft = React.useRef(null)
  const tokenRef = React.useRef(0)
  const [frozen, setFrozen] = React.useState(null)
  React.useEffect(() => {
    const serial = JSON.stringify(draft)
    if (lastDraft.current !== null && lastDraft.current !== serial) {
      tokenRef.current += 1
      setFrozen(null)
      setState({ phase: 'DIRTY', result: null, plan: null, busy: false, error: 'DRAFT_CHANGED' })
    }
    lastDraft.current = serial
  }, [draft])
  const changes = plan09DraftToChanges(feature, draft, { senderRevision: context.senderRevision })
  const unsupported = changes.unsupported || []
  const disabled = !adapter || !changes.supported || state.busy
  const runAdapter = async (fn, code) => {
    const token = tokenRef.current + 1
    tokenRef.current = token
    setState((current) => ({ ...current, busy: true, error: null }))
    try {
      const result = await fn()
      if (token !== tokenRef.current) return null
      return result
    } catch {
      if (token !== tokenRef.current) return null
      setState((current) => ({ ...current, phase: 'FAILED', busy: false, error: code }))
      return undefined
    }
  }
  const prepare = async () => {
    if (!adapter) return onNotify('未接入配置适配器：只能查看草稿，不能保存。', 'error')
    const valid = validate()
    if (!valid.ok) return onNotify('草稿未通过校验，不能准备变更。', 'error')
    const planned = changes
    const result = await runAdapter(() => adapter.prepareChange(planned.changes), 'ADAPTER_REJECTED')
    if (result === null) return
    if (!result || !result.ok || !result.plan) {
      setState({ phase: 'FAILED', result: result || null, plan: null, busy: false, error: result && result.error ? result.error.code : 'PREPARE_FAILED' })
      return onNotify('准备变更失败：' + (result && result.error ? result.error.code : '未知错误'), 'error')
    }
    setFrozen(planned)
    setState({ phase: 'PREPARED', result, plan: result.plan, busy: false, error: null })
    onNotify('已准备隔离变更计划；请核对字段与 revision 后确认。', 'info')
  }
  const confirmSave = async () => {
    if (!adapter || !state.plan || state.phase === 'UNKNOWN') return
    const planId = state.plan.planId
    const result = await runAdapter(() => adapter.execute(planId, { userConfirmed: true, confirmedPlanId: planId }), 'ADAPTER_REJECTED')
    if (result === null) return
    if (!result || !result.ok) {
      const phase = result && result.state === 'CONFLICT' ? 'CONFLICT' : 'FAILED'
      setState({ phase, result: result || null, plan: state.plan, busy: false, error: result && result.error ? result.error.code : 'SAVE_FAILED' })
      return onNotify('保存未完成：' + (result && result.error ? result.error.code : '未知错误'), 'error')
    }
    setState({ phase: 'SAVED', result, plan: state.plan, busy: false, error: null })
    onNotify(result.applyState === 'PENDING_APPLY' ? '已保存到隔离设施，等待运行组件确认；SAVED 不等于 APPLIED。' : '已保存到隔离设施。', 'success')
  }
  const applyCheck = async () => {
    if (!adapter || !state.result || !state.result.transactionId || state.phase === 'UNKNOWN') return
    const transactionId = state.result.transactionId
    const result = await runAdapter(() => adapter.apply(transactionId, { userConfirmed: true }), 'APPLY_UNKNOWN')
    if (result === null) return
    const phase = result && result.ok ? (result.state === 'APPLIED' ? 'APPLIED' : 'PENDING_APPLY') : 'UNKNOWN'
    setState({ phase, result: result || null, plan: state.plan, busy: false, error: result && result.error ? result.error.code : null })
    onNotify(phase === 'APPLIED' ? '运行组件已确认同一 revision。' : '未取得可信运行确认，保持只读 UNKNOWN/待生效。', phase === 'APPLIED' ? 'success' : 'info')
  }
  const readStatus = async () => {
    if (!adapter || !state.result || !state.result.transactionId) return
    const transactionId = state.result.transactionId
    const result = await runAdapter(() => (typeof adapter.recover === 'function' ? adapter.recover(transactionId) : adapter.getStatus(transactionId)), 'STATUS_UNKNOWN')
    if (result === null) return
    const projection = plan09ProjectCoordinatorResult(result || { state: 'UNKNOWN' })
    setState((current) => ({ ...current, phase: projection.phase, result: result || { state: 'UNKNOWN' }, busy: false }))
    onNotify('已只读查证事务状态；不会自动重试写入。', 'info')
  }
  const view = state.result ? plan09ProjectCoordinatorResult(state.result) : { phase: 'DIRTY', label: '未保存草稿', tone: 'wait', text: '尚未准备变更。' }
  const phase = state.phase === 'PREPARED' ? 'PREPARED' : view.phase
  const frozenSet = frozen && frozen.changes ? frozen.changes : null
  const canPrepare = !disabled && ['DIRTY', 'CONFLICT', 'FAILED'].includes(phase)
  return h('section', { className: 'wv-card pad', 'data-testid': 'plan09-tx-panel', 'data-phase': phase, 'data-busy': state.busy ? '1' : '0', 'data-tx': state.result && state.result.transactionId ? state.result.transactionId : '' },
    h('div', { className: 'wv-card-title' },
      h('div', null, h('h2', null, '配置事务 · 隔离 Adapter'), h('p', null, '有效草稿 → 不可变变更预览 → 精确确认 → 隔离保存 → 状态查证；未写生产配置。')),
      h(Badge, { tone: view.tone }, view.label)),
    !adapter ? h('div', { className: 'wv-notice warn', 'data-testid': 'plan09-no-adapter' }, h(Icon, { name: 'lock', size: 14 }), h('span', null, '未接入配置适配器：本页只读草稿，不能准备或保存变更。')) : null,
    !changes.supported ? h('div', { className: 'wv-notice', 'data-testid': 'plan09-unsupported' }, h(Icon, { name: 'info', size: 14 }), h('span', null, unsupported.join(' '))) : null,
    h('div', { className: 'wv-plan09-txline' },
      h('span', null, '可应用字段：' + (changes.applied.length ? changes.applied.join('、') : '无')),
      unsupported.length ? h('span', { className: 'wv-muted' }, '草稿未应用：' + unsupported.join('、')) : null,
      h('span', null, 'revision ' + (context.senderRevision === null ? '未知' : context.senderRevision))),
    frozenSet ? h('div', { className: 'wv-plan09-frozen', 'data-testid': 'plan09-frozen-preview' },
      h('strong', null, '已冻结的变更预览'),
      h('pre', { className: 'wv-mono' }, JSON.stringify(frozenSet, null, 2))) : null,
    h('div', { className: 'wv-row wv-wrap', style: { marginTop: 10 } },
      h(Button, { onClick: prepare, disabled: !canPrepare, 'data-testid': 'plan09-prepare' }, state.busy ? '处理中…' : '预览变更'),
      h(Button, { variant: 'primary', disabled: disabled || phase !== 'PREPARED', onClick: confirmSave, 'data-testid': 'plan09-confirm-save' }, '确认并隔离保存'),
      h(Button, { variant: 'ghost', disabled: !state.result || !state.result.transactionId || !['SAVED', 'PENDING_APPLY'].includes(phase), onClick: applyCheck, 'data-testid': 'plan09-apply-check' }, '检查是否生效'),
      h(Button, { variant: 'ghost', disabled: !state.result || !state.result.transactionId, onClick: readStatus, 'data-testid': 'plan09-read-status' }, '只读查证')),
    state.error ? h('p', { className: 'wv-plan09-error', 'data-testid': 'plan09-tx-error' }, state.error) : null,
    h('p', { className: 'wv-muted', style: { margin: '8px 0 0', fontSize: 11 } }, view.text + ' · SAVED 不等于 APPLIED，更不等于 SENT；编辑草稿会作废旧计划。'))
}

const PLAN09_LANG_LABEL = { 'zh-CN': '中文（普通话）', 'en-US': '英语', 'ja-JP': '日语', auto: '自动识别' }
const PLAN09_EMOTION_LABEL = { neutral: '自然', gentle: '温柔', happy: '开心', shy: '害羞', playful: '俏皮', sad: '难过' }
const PLAN09_VOICE_LABELS = { 'demo-voice-a': '示例女声 A', 'demo-voice-b': '示例男声 B', 'cloud-voice-a': '云端示例音色', 'custom-voice-a': '自定义示例音色' }

function Plan09FeaturePage({ feature, setup, notify, profileKey, globalSetupOpen = false, capabilityRevision = null }) {
  const adapter = plan09Adapter()
  const context = plan09Context(adapter)
  const key = plan09WizardKey({ workspace: context.workspace, profile: context.profile, feature: feature.id, manifestRevision: context.manifestRevision })
  const stored = plan09ReadWizard(window.localStorage, key)
  const [mode, setMode] = React.useState(stored.selectedMode || 'local')
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [wizardContext, setWizardContext] = React.useState(stored)
  const [reminder, setReminder] = React.useState(false)
  const [errors, setErrors] = React.useState([])
  const [preview, setPreview] = React.useState(null)
  const [voiceDraft, setVoiceDraft] = React.useState(plan09DefaultVoiceDraft)
  const [singingDraft, setSingingDraft] = React.useState(plan09DefaultSingingDraft)
  React.useEffect(() => {
    const current = plan09ReadWizard(window.localStorage, key)
    const view = plan09DeriveWizardView({
      stored: current,
      capabilityRevision: capabilityRevision === null ? context.capabilityRevision : capabilityRevision,
      manifestRevision: context.manifestRevision,
      globalSetupOpen,
    })
    setReminder(view.reminder)
    if (view.shouldOpen) { setWizardContext(current); setWizardOpen(true) }
  }, [key, globalSetupOpen, capabilityRevision, context.capabilityRevision, context.manifestRevision])
  React.useEffect(() => {
    if (!stored.selectedMode) return
    const switched = plan09SwitchMode(feature.id, stored.selectedMode, feature.id === 'singing' ? plan09DefaultSingingDraft() : plan09DefaultVoiceDraft())
    setDraft(switched.draft)
    setMode(stored.selectedMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const draft = feature.id === 'singing' ? singingDraft : voiceDraft
  const setDraft = feature.id === 'singing' ? setSingingDraft : setVoiceDraft
  const patch = (part) => { setPreview(null); setErrors([]); setDraft((current) => ({ ...current, ...part })) }
  const saveWizard = (patchValue) => {
    const next = plan09WriteWizard(window.localStorage, key, {
      mode: patchValue.mode,
      introAcknowledged: true,
      capabilityRevisionSeen: context.capabilityRevision,
      browseDismissedRevision: null,
    })
    setWizardContext(next || stored)
    setWizardOpen(false)
    notify('已记录本功能的首次说明确认；这不是安装成功，也不代表能力 READY。', 'info')
  }
  const browseWizard = () => {
    const next = plan09WriteWizard(window.localStorage, key, { browseDismissedRevision: context.manifestRevision, mode })
    setWizardContext(next || stored)
    setWizardOpen(false)
  }
  const changeMode = (nextMode) => {
    const switched = plan09SwitchMode(feature.id, nextMode, draft)
    setDraft(switched.draft)
    setMode(nextMode)
    setPreview(null)
    plan09WriteWizard(window.localStorage, key, { mode: nextMode })
    setErrors([])
    if (switched.cleared.length) notify('已切换模式并清理不兼容字段：' + switched.cleared.join('、'), 'info')
  }
  const validate = () => {
    const result = feature.id === 'singing'
      ? plan09ValidateSingingDraft(singingDraft, { gpuAvailable: context.gpuAvailable, cloudAuthorized: context.cloudAuthorized, deliveryAuthorized: context.deliveryAuthorized, mode })
      : plan09ValidateVoiceDraft(voiceDraft, { cloudAuthorized: context.cloudAuthorized, mode })
    setErrors(result.errors)
    return result
  }
  const previewDraft = () => {
    const result = validate()
    if (!result.ok) { setPreview(null); notify('草稿还有未完成项，请先处理红色提示。', 'error'); return }
    setPreview(feature.id === 'singing'
      ? `唱歌 · ${singingDraft.engine.toUpperCase()} · ${PLAN09_SINGING_VOICES.find((voice) => voice.id === singingDraft.voiceProfile)?.label || singingDraft.voiceProfile} · 音高 ${singingDraft.pitch} · ${singingDraft.sourceLayout}`
      : `语音气泡 · ${PLAN09_MODES.find((m) => m.id === mode)?.label || mode} · ${PLAN09_PROVIDERS.find((p) => p.id === voiceDraft.provider)?.label || voiceDraft.provider} · ${PLAN09_VOICE_LABELS[voiceDraft.voiceProfile] || voiceDraft.voiceProfile}`)
    notify('已生成演示预览；没有合成或播放真实音频。', 'info')
  }
  const switchEngine = (engine) => {
    const result = plan09SwitchEngine(feature.id, draft, engine)
    setDraft(result.draft)
    setPreview(null)
    setErrors([])
    if (result.cleared.length) notify('已清理不兼容字段：' + result.cleared.join('、') + '。请重新确认参数。', 'info')
  }
  const groups = plan09DependencyGroups(feature.id, mode, {
    sourceLayout: feature.id === 'singing' ? singingDraft.sourceLayout : 'MIXED',
    deliveryRequested: feature.id === 'singing' ? singingDraft.deliveryRequested : false,
  })
  return h('div', { 'data-testid': `page-${feature.id}` },
    h(PageHead, {
      eyebrow: feature.en, title: feature.label, description: feature.hint + '。本轮仅提供离线 Fake 界面与草稿，真实引擎尚未接入。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: 'demo' }, '演示 · 未接入'),
        h(Button, { variant: 'ghost', onClick: () => { setWizardContext(plan09ReadWizard(window.localStorage, key)); setWizardOpen(true) }, 'data-testid': 'plan09-reopen' }, '依赖向导')),
    }),
    h('div', { className: 'wv-notice', style: { marginBottom: 14 } },
      h(Icon, { name: 'info', size: 15 }),
      h('span', null, '当前入口是独立页面，但共享同一份音色、Provider、依赖与任务展示来源；不会创建第二套账号或凭据。')),
    reminder ? h('div', { className: 'wv-notice warn', style: { marginBottom: 14 }, 'data-testid': 'plan09-reminder' },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '能力或版本已有更新；请重新打开依赖向导核对，已确认的说明不会被当作新的能力验证。'),
      h(Button, { size: 'sm', variant: 'ghost', onClick: () => { setWizardContext(plan09ReadWizard(window.localStorage, key)); setWizardOpen(true) }, 'data-testid': 'plan09-reminder-open' }, '重新检查')) : null,
    h('section', { className: 'wv-card pad', style: { marginBottom: 14 }, 'data-testid': 'plan09-mode-summary' },
      h('div', { className: 'wv-card-title' },
        h('div', null, h('h2', null, '运行模式与依赖'), h('p', null, '按模式与素材类型显示必需、可选、仅投递与条件依赖；缺投递依赖不阻断草稿。')),
        h(Badge, { tone: 'wait' }, PLAN09_MODES.find((m) => m.id === mode)?.label || '本机')),
      h('div', { className: 'wv-row wv-wrap' },
        PLAN09_MODES.map((item) => h(Button, {
          key: item.id, size: 'sm', variant: mode === item.id ? 'primary' : 'ghost', 'data-testid': 'plan09-page-mode-' + item.id,
          onClick: () => changeMode(item.id),
        }, item.label))),
      h('p', { className: 'wv-muted', style: { margin: '8px 0 0' } }, plan09DependencySummary(groups).text + '。共享已验证项不会重复模拟安装。')),
    h('div', { className: 'wv-grid two', style: { marginBottom: 14 } },
      h('section', { className: 'wv-card pad' },
        h('div', { className: 'wv-card-title' }, h('div', null, h('h2', null, '配置草稿'), h('p', null, '新手用中文方案；高级自定义折叠。切换引擎/模式会清理不兼容字段。'))),
        h('div', { className: 'wv-plan09-form' },
          h(Plan09DraftField, { label: '方案' },
            h('select', {
              className: 'wv-select', value: draft.engine, 'data-testid': 'plan09-draft-engine',
              onChange: (event) => switchEngine(event.target.value),
            }, (feature.id === 'singing' ? [['rvc', 'RVC 标准翻唱（首发）'], ['gateway', '已有服务 Gateway'], ['svc', 'SVC（后续可选，不安装）']] : [['local', '本机 Qwen 服务'], ['cloud', '隔离云端 Fixture'], ['custom', '自定义本机服务']]).map(([value, label]) => h('option', { key: value, value }, label)))),
          feature.id === 'singing' ? h(React.Fragment, null,
            h(Plan09DraftField, { label: '音色方案' },
              h('select', { className: 'wv-select', value: singingDraft.voiceProfile, 'data-testid': 'plan09-singing-voice', onChange: (e) => patch({ voiceProfile: e.target.value }) }, PLAN09_SINGING_VOICES.map((voice) => h('option', { key: voice.id, value: voice.id }, voice.label)))),
            h(Plan09DraftField, { label: '虚构素材引用', hint: '只接受 fixture:// 虚构引用；不会读取、上传或抓取真实素材。' },
              h('input', { className: 'wv-input', value: singingDraft.sourceRef, placeholder: 'fixture://demo-song-01', 'data-testid': 'plan09-draft-source', onChange: (e) => patch({ sourceRef: e.target.value }) })),
            h('div', { className: 'wv-grid two' },
              h(Plan09DraftField, { label: '素材类型' }, h('select', { className: 'wv-select', value: singingDraft.sourceLayout, 'data-testid': 'plan09-source-layout', onChange: (e) => patch({ sourceLayout: e.target.value }) }, h('option', { value: 'MIXED' }, '混合素材（需分离）'), h('option', { value: 'CLEAN_VOCAL' }, '干净人声（可跳过分离）'))),
              h(Plan09DraftField, { label: '混音方式' }, h('select', { className: 'wv-select', value: singingDraft.mixMode, 'data-testid': 'plan09-mix-mode', onChange: (e) => patch({ mixMode: e.target.value }) }, h('option', { value: 'WITH_INSTRUMENTAL' }, '人声 + 伴奏'), h('option', { value: 'VOCAL_ONLY' }, '仅人声')))),
            h('div', { className: 'wv-plan09-checks' },
              h('label', { className: 'wv-plan09-check' }, h('input', { type: 'checkbox', checked: singingDraft.sourceAuthorized, 'data-testid': 'plan09-source-authorized', onChange: (e) => patch({ sourceAuthorized: e.target.checked }) }), h('span', null, '我确认演示素材已获授权')),
              h('label', { className: 'wv-plan09-check' }, h('input', { type: 'checkbox', checked: singingDraft.voiceConsent, 'data-testid': 'plan09-voice-consent', onChange: (e) => patch({ voiceConsent: e.target.checked }) }), h('span', null, '我确认音色使用已获同意'))),
            h(Plan09DraftField, { label: `音高 ${singingDraft.pitch > 0 ? '+' : ''}${singingDraft.pitch}（−12..12）` },
              h('input', { className: 'wv-input', type: 'range', min: -12, max: 12, step: 1, value: singingDraft.pitch, 'data-testid': 'plan09-pitch', onChange: (e) => patch({ pitch: Number(e.target.value) }) })),
            h(Plan09DraftField, { label: '人声增益 dB' },
              h('input', { className: 'wv-input', type: 'number', min: -12, max: 12, value: singingDraft.vocalGainDb, 'data-testid': 'plan09-vocal-gain', onChange: (e) => patch({ vocalGainDb: Number(e.target.value) }) })),
            h(Plan09DraftField, { label: '伴奏增益 dB' },
              h('input', { className: 'wv-input', type: 'number', min: -12, max: 12, value: singingDraft.instrumentalGainDb, 'data-testid': 'plan09-instrumental-gain', onChange: (e) => patch({ instrumentalGainDb: Number(e.target.value) }) })),
            h('label', { className: 'wv-plan09-check' }, h('input', { type: 'checkbox', checked: singingDraft.deliveryRequested, 'data-testid': 'plan09-delivery', onChange: (e) => patch({ deliveryRequested: e.target.checked }) }), h('span', null, '保存后申请投递到微信（未授权时仅保存草稿）')))
          : h(React.Fragment, null,
            h(Plan09DraftField, { label: '音色' },
              h('select', { className: 'wv-select', value: voiceDraft.voiceProfile, 'data-testid': 'plan09-draft-voice', onChange: (e) => patch({ voiceProfile: e.target.value }) }, (PLAN09_PROVIDERS.find((p) => p.id === voiceDraft.provider)?.voices || []).map((voice) => h('option', { key: voice, value: voice }, PLAN09_VOICE_LABELS[voice] || voice))),
            h('div', { className: 'wv-grid two' },
              h(Plan09DraftField, { label: '语言' }, h('select', { className: 'wv-select', value: voiceDraft.language, 'data-testid': 'plan09-draft-language', onChange: (e) => patch({ language: e.target.value }) }, PLAN09_LANGUAGES.map((v) => h('option', { key: v, value: v }, PLAN09_LANG_LABEL[v] || v)))),
              h(Plan09DraftField, { label: '情绪' }, h('select', { className: 'wv-select', value: voiceDraft.emotion, 'data-testid': 'plan09-draft-emotion', onChange: (e) => patch({ emotion: e.target.value }) }, PLAN09_EMOTIONS.map((v) => h('option', { key: v, value: v }, PLAN09_EMOTION_LABEL[v] || v))))),
            h(Plan09DraftField, { label: `语速 ${Number(voiceDraft.speed).toFixed(1)}×` },
              h('input', { className: 'wv-input', type: 'range', min: 0.5, max: 2, step: 0.1, value: voiceDraft.speed, 'data-testid': 'plan09-draft-speed', onChange: (e) => patch({ speed: Number(e.target.value) }) })),
            h(Plan09DraftField, { label: `音量 ${voiceDraft.volume}%` },
              h('input', { className: 'wv-input', type: 'range', min: 0, max: 100, step: 1, value: voiceDraft.volume, 'data-testid': 'plan09-draft-volume', onChange: (e) => patch({ volume: Number(e.target.value) }) })),
            h('details', { className: 'wv-plan09-advanced' },
              h('summary', null, '高级自定义（默认折叠）'),
              h(Plan09DraftField, { label: 'Provider' },
                h('input', { className: 'wv-input', value: voiceDraft.provider, 'data-testid': 'plan09-draft-provider', onChange: (e) => patch({ provider: e.target.value }) })),
              h(Plan09DraftField, { label: '模型' },
                h('input', { className: 'wv-input', value: voiceDraft.model, 'data-testid': 'plan09-draft-model', onChange: (e) => patch({ model: e.target.value }) }))))),
          h(Plan09DraftField, { label: '演示文本 / 试唱文本' },
            h('textarea', { className: 'wv-textarea', rows: 3, value: draft.text, 'data-testid': 'plan09-draft-text', onChange: (e) => patch({ text: e.target.value }) })),
          errors.length ? h('div', { className: 'wv-plan09-errors', 'data-testid': 'plan09-errors' }, errors.map((error) => h('p', { key: error.field + error.message }, '· ' + error.message))) : null,
          h('div', { className: 'wv-row wv-wrap', style: { marginTop: 8 } },
            h(Button, { onClick: previewDraft, 'data-testid': 'plan09-preview' }, '生成演示预览'),
            h(Button, { variant: 'ghost', onClick: () => { setErrors([]); notify('已重置提示；草稿参数保留。', 'info') }, 'data-testid': 'plan09-clear-errors' }, '清除提示'))),
        preview ? h('div', { className: 'wv-plan09-preview', 'data-testid': 'plan09-preview-result' }, h(Icon, { name: 'check', size: 14 }), h('span', null, preview + '。未合成、未播放、未发送。')) : null),
      h('section', { className: 'wv-card pad' },
        h('div', { className: 'wv-card-title' }, h('div', null, h('h2', null, '投递权限与能力边界'), h('p', null, 'SAVED ≠ APPLIED ≠ SENT；未授权时只能保存草稿。'))),
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '微信投递', desc: '需要 WeChatAgent 与鲸递发送模块；未授权时禁用演示发送。' }, h(Badge, { tone: 'wait' }, '未授权')),
          h(SettingRow, { title: '云端费用与文本', desc: '云端模式会把文本发送到 Provider；真实调用始终禁用。' }, h(Badge, { tone: 'demo' }, '仅说明')),
          h(SettingRow, { title: '真实音频', desc: '不接收、不存储、不输出真实音频或密钥。' }, h(Badge, { tone: 'demo' }, 'Fake')),
          h(SettingRow, { title: '首次说明', desc: '确认只记录读过说明，不等于 READY。' }, h('span', { className: 'wv-muted', 'data-testid': 'plan09-ack-state' }, stored.introAcknowledged ? '本版本已确认' : '未确认')))),
    h(Plan09TransactionPanel, { feature: feature.id, draft, validate, context, onNotify: notify }),
    wizardOpen ? h(Plan09Wizard, {
      open: true, feature, mode, setMode: changeMode, context: { ...context, introAcknowledged: wizardContext.introAcknowledged },
      sourceLayout: feature.id === 'singing' ? singingDraft.sourceLayout : 'MIXED',
      deliveryRequested: feature.id === 'singing' ? singingDraft.deliveryRequested : false,
      onClose: browseWizard,
      onAcknowledge: (value) => saveWizard(value),
      onBrowse: browseWizard,
      notify,
    }) : null))
}
