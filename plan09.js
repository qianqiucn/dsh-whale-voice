/* Plan 09 — two entry pages, shared dependency wizard and Coordinator-backed config drafts.
 * All state is fake/local; the UI only talks to an injected isolated adapter and never writes
 * production configuration or credentials.
 */

const PLAN09_DEP_STORE = { states: new Map(), timers: new Map(), generations: new Map(), listeners: new Map() }

function plan09DepSubscribe(scope, listener) {
  const list = PLAN09_DEP_STORE.listeners.get(scope) || new Set()
  list.add(listener)
  PLAN09_DEP_STORE.listeners.set(scope, list)
  return () => { list.delete(listener); if (!list.size) PLAN09_DEP_STORE.listeners.delete(scope) }
}

function plan09DepNotify(scope) {
  const list = PLAN09_DEP_STORE.listeners.get(scope)
  if (list) for (const listener of [...list]) listener()
}

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

function plan09IdentityScope(context) {
  return [context.workspace, context.profile, context.manifestRevision, context.capabilityRevision].join('|')
}

const PLAN09_SHARED_DEPENDENCIES = new Set(['core', 'sender', 'wechat'])

function plan09DepScope(context, mode, engine = '', key = '') {
  const identity = plan09IdentityScope(context)
  if (PLAN09_SHARED_DEPENDENCIES.has(key)) return identity + '|shared'
  return identity + '|' + mode + '|' + engine
}

function plan09EngineScope(context, mode, engine = '') {
  return plan09IdentityScope(context) + '|' + mode + '|' + engine
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
  const touched = new Set()
  const prefix = scope + '||'
  for (const [mapKey, timer] of PLAN09_DEP_STORE.timers.entries()) {
    if (!mapKey.startsWith(prefix)) continue
    clearTimeout(timer)
    PLAN09_DEP_STORE.timers.delete(mapKey)
  }
  for (const [mapKey, current] of PLAN09_DEP_STORE.states.entries()) {
    if (!mapKey.startsWith(prefix)) continue
    PLAN09_DEP_STORE.generations.set(mapKey, (PLAN09_DEP_STORE.generations.get(mapKey) || 0) + 1)
    if (current && current.busy) PLAN09_DEP_STORE.states.set(mapKey, { ...current, status: 'cancelled', busy: false, reason: 'CANCELLED' })
    touched.add(mapKey.slice(0, mapKey.indexOf('||')))
  }
  for (const item of touched) plan09DepNotify(item)
}

function Plan09Wizard({ open, feature, mode, engine = '', setMode, context, sourceLayout = 'MIXED', deliveryRequested = false, onClose, onAcknowledge, onBrowse, notify }) {
  const [, setDepTick] = React.useState(0)
  const [failure, setFailure] = React.useState('NONE')
  const [introChecked, setIntroChecked] = React.useState(false)
  if (!open) return null
  const featureId = feature && feature.id ? feature.id : feature
  const adapter = plan09Adapter()
  const scope = plan09EngineScope(context, mode, engine)
  React.useEffect(() => plan09DepSubscribe(scope, () => setDepTick((value) => value + 1)), [scope])
  const groups = plan09DependencyGroups(featureId, mode, { sourceLayout, deliveryRequested })
  const refresh = () => setDepTick((value) => value + 1)
  const run = (key, action) => plan09DepRun(plan09DepScope(context, mode, engine, key), key, action, adapter, failure, refresh)
  const close = () => { plan09CancelDepScope(scope); onClose() }
  const browse = () => { plan09CancelDepScope(scope); onBrowse() }
  const rowFor = (dep) => {
    const depScope = plan09DepScope(context, mode, engine, dep.key)
    const state = plan09DepState(depScope, dep.key)
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

const PLAN09_TX_STORE = new Map()
const PLAN09_TX_LISTENERS = new Map()

function plan09TxSubscribe(key, listener) {
  const list = PLAN09_TX_LISTENERS.get(key) || new Set()
  list.add(listener)
  PLAN09_TX_LISTENERS.set(key, list)
  return () => { list.delete(listener); if (!list.size) PLAN09_TX_LISTENERS.delete(key) }
}

function plan09TxSet(key, next) {
  if (next) PLAN09_TX_STORE.set(key, next)
  else PLAN09_TX_STORE.delete(key)
  const list = PLAN09_TX_LISTENERS.get(key)
  if (list) for (const listener of [...list]) listener()
}

function Plan09TransactionPanel({ feature, draft, validate, context, txKey, contextSerial, onNotify }) {
  const adapter = plan09Adapter()
  const empty = () => ({ phase: 'DIRTY', result: null, plan: null, txId: null, busy: false, error: null, draftDirty: false, planStale: false, planContext: null, contextStale: false, frozen: null, draftSerial: null })
  const initial = () => PLAN09_TX_STORE.get(txKey) || empty()
  const [state, setState] = React.useState(initial)
  const lastDraft = React.useRef(JSON.stringify(draft))
  const lastContext = React.useRef(contextSerial)
  const tokenRef = React.useRef(0)
  const changes = plan09DraftToChanges(feature, draft, { senderRevision: context.senderRevision })
  const unsupported = changes.unsupported || []
  const disabled = !adapter || !changes.supported || state.busy
  const current = () => PLAN09_TX_STORE.get(txKey) || state
  const persist = (next) => { plan09TxSet(txKey, next); return next }

  React.useEffect(() => {
    lastDraft.current = JSON.stringify(draft)
    lastContext.current = contextSerial
    setState(initial())
    return plan09TxSubscribe(txKey, () => setState(initial()))
  }, [txKey])

  React.useEffect(() => {
    const serial = JSON.stringify(draft)
    if (serial === lastDraft.current) return
    lastDraft.current = serial
    const entry = current()
    if (entry.txId || entry.phase === 'UNKNOWN') {
      persist({ ...entry, draftDirty: true })
      return
    }
    persist({ ...empty(), draftDirty: true, error: 'DRAFT_CHANGED' })
  }, [draft, txKey])

  React.useEffect(() => {
    if (contextSerial === lastContext.current) return
    lastContext.current = contextSerial
    const entry = current()
    if (entry.txId) persist({ ...entry, contextStale: true })
    else if (entry.phase === 'PREPARED') persist({ ...entry, planStale: true, error: 'CONTEXT_CHANGED' })
  }, [contextSerial, txKey])

  const prepare = async () => {
    const entry = current()
    if (entry.busy) return
    if (!adapter) return onNotify('未接入配置适配器：只能查看草稿，不能保存。', 'error')
    if (entry.txId) return onNotify('已有已发出的隔离事务，请先只读查证或完成生效检查。', 'error')
    const valid = validate()
    if (!valid.ok) return onNotify('草稿未通过校验，不能准备变更。', 'error')
    const serial = JSON.stringify(draft)
    const token = tokenRef.current + 1
    tokenRef.current = token
    persist({ ...entry, busy: true, error: null })
    let result
    try {
      result = await adapter.prepareChange(changes.changes)
    } catch {
      persist({ ...current(), phase: 'FAILED', busy: false, error: 'ADAPTER_REJECTED', planStale: true })
      return
    }
    if (token !== tokenRef.current || serial !== lastDraft.current) {
      persist({ ...current(), busy: false, phase: 'DIRTY', plan: null, error: 'STALE_PREPARE' })
      return
    }
    if (!result || !result.ok || !result.plan) {
      persist({ ...current(), phase: 'FAILED', result: result || null, busy: false, error: result && result.error ? result.error.code : 'PREPARE_FAILED', planStale: true })
      return
    }
    persist({ phase: 'PREPARED', result, plan: result.plan, txId: null, busy: false, error: null, draftDirty: false, planStale: false, planContext: contextSerial, contextStale: false, frozen: { changes: changes.changes }, draftSerial: serial })
    onNotify('已准备隔离变更计划；请核对字段与 revision 后确认。', 'info')
  }

  const confirmSave = async () => {
    const entry = current()
    if (entry.busy || !adapter || !entry.plan) return
    if (entry.planStale || entry.planContext !== contextSerial || entry.draftSerial !== JSON.stringify(draft)) {
      persist({ ...entry, planStale: true, error: 'PLAN_STALE' })
      return onNotify('草稿、上下文或授权已变化，旧计划不可确认，请重新准备。', 'error')
    }
    const valid = validate()
    if (!valid.ok) {
      persist({ ...entry, planStale: true, error: 'AUTHORIZATION_CHANGED' })
      return onNotify('当前草稿/授权不再满足条件，已阻止确认。', 'error')
    }
    const planId = entry.plan.planId
    persist({ ...entry, busy: true, error: null })
    let result
    try {
      result = await adapter.execute(planId, { userConfirmed: true, confirmedPlanId: planId })
    } catch {
      persist({ ...current(), phase: 'UNKNOWN', busy: false, error: 'RESPONSE_LOST', planStale: true })
      return onNotify('未收到可信响应，不能判断是否已写入；保持 UNKNOWN，不自动重试。', 'error')
    }
    const known = result && ['CONFLICT', 'UNKNOWN', 'FAILED'].includes(result.state)
    const phase = known ? result.state : (result && result.state ? result.state : (result && result.ok ? 'SAVED' : 'FAILED'))
    persist({ ...current(), phase, result: result || null, txId: result && result.transactionId ? result.transactionId : current().txId, busy: false, error: result && result.error ? result.error.code : (phase === 'UNKNOWN' ? 'RESPONSE_LOST' : null), planStale: phase === 'UNKNOWN' || phase === 'FAILED' || phase === 'CONFLICT' })
    onNotify(phase === 'SAVED' ? '已保存到隔离设施，等待运行组件确认；SAVED 不等于 APPLIED。' : '结果 ' + phase + '；不会自动重试写入。', phase === 'SAVED' ? 'success' : 'info')
  }

  const applyCheck = async () => {
    const entry = current()
    if (entry.busy || !adapter || !entry.txId || !['SAVED', 'PENDING_APPLY'].includes(entry.phase)) return
    const transactionId = entry.txId
    persist({ ...entry, busy: true, error: null })
    let result
    try {
      result = await adapter.apply(transactionId, { userConfirmed: true })
    } catch {
      persist({ ...current(), phase: 'UNKNOWN', txId: transactionId, busy: false, error: 'APPLY_REJECTED' })
      return
    }
    const projection = plan09ProjectCoordinatorResult(result || { state: 'UNKNOWN' })
    persist({ ...current(), phase: projection.phase, result: result || current().result, txId: transactionId, busy: false, error: projection.errorCode })
    onNotify(projection.phase === 'APPLIED' ? '运行组件已确认同一 revision。' : '未取得可信运行确认，保持只读 UNKNOWN/待生效。', projection.phase === 'APPLIED' ? 'success' : 'info')
  }

  const readStatus = async () => {
    const entry = current()
    if (entry.busy || !adapter || !entry.txId) return
    const transactionId = entry.txId
    persist({ ...entry, busy: true, error: null })
    let result
    try {
      result = await (typeof adapter.recover === 'function' ? adapter.recover(transactionId) : adapter.getStatus(transactionId))
    } catch {
      persist({ ...current(), phase: 'UNKNOWN', txId: transactionId, busy: false, error: 'STATUS_UNKNOWN' })
      return
    }
    const projection = plan09ProjectCoordinatorResult(result || { state: 'UNKNOWN' })
    persist({ ...current(), phase: projection.phase, result: result || { state: 'UNKNOWN' }, txId: transactionId, busy: false, error: projection.errorCode })
    onNotify('已只读查证事务状态；不会自动重试写入。', 'info')
  }

  const reset = () => {
    plan09TxSet(txKey, null)
    setState(empty())
    onNotify('已结束此事务的界面关联；历史写入仍以隔离设施为准。', 'info')
  }

  const view = state.result ? plan09ProjectCoordinatorResult(state.result) : { phase: state.phase, label: state.phase === 'UNKNOWN' ? '结果未知 · 只读' : '未保存草稿', tone: state.phase === 'UNKNOWN' ? 'error' : 'wait', text: '尚未准备变更。' }
  const phase = state.phase
  const frozenSet = state.frozen ? state.frozen.changes : null
  const canPrepare = !disabled && !state.txId && ['DIRTY', 'CONFLICT', 'FAILED'].includes(phase)
  const canReset = phase === 'APPLIED' || (phase === 'UNKNOWN' && !state.txId)
  return h('section', { className: 'wv-card pad', 'data-testid': 'plan09-tx-panel', 'data-phase': phase, 'data-busy': state.busy ? '1' : '0', 'data-tx': state.txId || '' },
    h('div', { className: 'wv-card-title' },
      h('div', null, h('h2', null, '配置事务 · 隔离 Adapter'), h('p', null, '有效草稿 → 不可变变更预览 → 精确确认 → 隔离保存 → 状态查证；未写生产配置。')),
      h(Badge, { tone: view.tone }, view.label)),
    !adapter ? h('div', { className: 'wv-notice warn', 'data-testid': 'plan09-no-adapter' }, h(Icon, { name: 'lock', size: 14 }), h('span', null, '未接入配置适配器：本页只读草稿，不能准备或保存变更。')) : null,
    !changes.supported ? h('div', { className: 'wv-notice', 'data-testid': 'plan09-unsupported' }, h(Icon, { name: 'info', size: 14 }), h('span', null, unsupported.join(' '))) : null,
    state.txId ? h('div', { className: 'wv-notice', 'data-testid': 'plan09-tx-authority' }, h(Icon, { name: 'lock', size: 14 }), h('span', null, '已发出的隔离事务仍保留：草稿编辑不会丢弃 transactionId；只能只读查证或完成生效检查。')) : null,
    state.planStale ? h('div', { className: 'wv-notice warn', 'data-testid': 'plan09-tx-stale' }, h(Icon, { name: 'alert', size: 14 }), h('span', null, '刚计划对应的草稿/上下文已变化，旧计划不可确认；请重新准备。')) : null,
    h('div', { className: 'wv-plan09-txline' },
      h('span', null, '可应用字段：' + (changes.applied.length ? changes.applied.join('、') : '无')),
      unsupported.length ? h('span', { className: 'wv-muted' }, '草稿未应用：' + unsupported.join('、')) : null,
      h('span', null, 'revision ' + (context.senderRevision === null ? '未知' : context.senderRevision))),
    frozenSet ? h('div', { className: 'wv-plan09-frozen', 'data-testid': 'plan09-frozen-preview' },
      h('strong', null, '已冻结的变更预览'),
      h('pre', { className: 'wv-mono' }, JSON.stringify(frozenSet, null, 2))) : null,
    h('div', { className: 'wv-row wv-wrap', style: { marginTop: 10 } },
      h(Button, { onClick: prepare, disabled: !canPrepare, 'data-testid': 'plan09-prepare' }, state.busy ? '处理中…' : '预览变更'),
      h(Button, { variant: 'primary', disabled: disabled || phase !== 'PREPARED' || state.planStale, onClick: confirmSave, 'data-testid': 'plan09-confirm-save' }, '确认并隔离保存'),
      h(Button, { variant: 'ghost', disabled: disabled || !state.txId || !['SAVED', 'PENDING_APPLY'].includes(phase), onClick: applyCheck, 'data-testid': 'plan09-apply-check' }, '检查是否生效'),
      h(Button, { variant: 'ghost', disabled: disabled || !state.txId, onClick: readStatus, 'data-testid': 'plan09-read-status' }, '只读查证'),
      canReset ? h(Button, { variant: 'ghost', onClick: reset, 'data-testid': 'plan09-tx-reset' }, '结束此事务') : null),
    state.error ? h('p', { className: 'wv-plan09-error', 'data-testid': 'plan09-tx-error' }, state.error) : null,
    state.draftDirty ? h('p', { className: 'wv-muted', 'data-testid': 'plan09-tx-draft-dirty' }, '草稿已编辑，但已发出事务与只读查证入口仍保留；不会自动重试写入。') : null,
    h('p', { className: 'wv-muted', style: { margin: '8px 0 0', fontSize: 11 } }, view.text + ' · SAVED 不等于 APPLIED，更不等于 SENT。'))
}

const PLAN09_LANG_LABEL = { 'zh-CN': '中文（普通话）', 'en-US': '英语', 'ja-JP': '日语', auto: '自动识别' }
const PLAN09_EMOTION_LABEL = { neutral: '自然', gentle: '温柔', happy: '开心', shy: '害羞', playful: '俏皮', sad: '难过' }
const PLAN09_VOICE_LABELS = { 'demo-voice-a': '示例女声 A', 'demo-voice-b': '示例男声 B', 'cloud-voice-a': '云端示例音色', 'custom-voice-a': '自定义示例音色' }

function Plan09FeaturePage({ feature, setup, notify, profileKey, globalSetupOpen = false, capabilityRevision = null }) {
  const adapter = plan09Adapter()
  const context = plan09Context(adapter)
  const key = plan09WizardKey({ workspace: context.workspace, profile: context.profile, feature: feature.id, manifestRevision: context.manifestRevision })
  const stored = plan09ReadWizard(window.localStorage, key)
  const [, forceContext] = React.useState(0)
  React.useEffect(() => {
    const onChange = () => forceContext((value) => value + 1)
    window.addEventListener('plan09-context-changed', onChange)
    return () => window.removeEventListener('plan09-context-changed', onChange)
  }, [])
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
  const depScope = plan09DepScope(context, mode, draft.engine)
  React.useEffect(() => () => plan09CancelDepScope(depScope), [depScope])
  const changeMode = (nextMode) => {
    plan09CancelDepScope(depScope)
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
    plan09CancelDepScope(depScope)
    const result = plan09SwitchEngine(feature.id, draft, engine)
    const nextMode = feature.id === 'singing'
      ? (engine === 'gateway' ? (mode === 'cloud' ? 'cloud' : 'existing') : (mode === 'cloud' || mode === 'existing' ? 'local' : mode))
      : (engine === 'cloud' ? 'cloud' : engine === 'custom' ? 'existing' : 'local')
    setDraft(result.draft)
    setMode(nextMode)
    plan09WriteWizard(window.localStorage, key, { mode: nextMode })
    setPreview(null)
    setErrors([])
    if (result.cleared.length) notify('已清理不兼容字段：' + result.cleared.join('、') + '。请重新确认参数。', 'info')
  }
  React.useEffect(() => { setPreview(null) }, [context.cloudAuthorized, context.deliveryAuthorized, context.capabilityRevision, context.profile])
  const contextSerial = JSON.stringify({ workspace: context.workspace, profile: context.profile, manifest: context.manifestRevision, capability: context.capabilityRevision, cloud: context.cloudAuthorized, delivery: context.deliveryAuthorized, mode })
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
    h(Plan09TransactionPanel, { feature: feature.id, draft, validate, context, txKey: key, contextSerial, onNotify: notify }),
    wizardOpen ? h(Plan09Wizard, {
      open: true, feature, mode, setMode: changeMode, context: { ...context, introAcknowledged: wizardContext.introAcknowledged },
      engine: draft.engine,
      sourceLayout: feature.id === 'singing' ? singingDraft.sourceLayout : 'MIXED',
      deliveryRequested: feature.id === 'singing' ? singingDraft.deliveryRequested : false,
      onClose: browseWizard,
      onAcknowledge: (value) => saveWizard(value),
      onBrowse: browseWizard,
      notify,
    }) : null))
}
