/* Plan 09 — two entry pages, first-use dependency wizard and isolated config drafts.
 * All state is fake/local; nothing here writes production configuration or credentials.
 */

function Plan09Wizard({ open, feature, mode, setMode, stored, onClose, onAcknowledge }) {
  const [install, setInstall] = React.useState({})
  const [failure, setFailure] = React.useState('NONE')
  const [introChecked, setIntroChecked] = React.useState(false)
  if (!open) return null
  const featureId = feature && feature.id ? feature.id : feature
  const groups = plan09DependencyGroups(featureId, mode)
  const setOne = (key, value) => setInstall((current) => ({ ...current, [key]: value }))
  const run = (key, action) => {
    const current = install[key] || {}
    if (action === 'cancel') {
      setOne(key, { ...current, status: 'cancelled', busy: false })
      return
    }
    if (action === 'retry') {
      setOne(key, { ...current, status: 'idle', reason: null, busy: false })
      return
    }
    if (action === 'check') {
      setOne(key, { ...current, status: 'checking', busy: true })
      setTimeout(() => setOne(key, { status: 'ready', busy: false, demo: true }), 220)
      return
    }
    if (action === 'install') {
      setOne(key, { ...current, status: 'installing', busy: true })
      setTimeout(() => {
        if (failure === 'NONE') setOne(key, { status: 'ready', busy: false, demo: true })
        else setOne(key, { status: 'blocked', busy: false, reason: failure })
      }, 320)
    }
  }
  const rowFor = (dep) => {
    const state = install[dep.key] || { status: 'idle' }
    const view = plan09InstallView(state.status)
    const buttons = [
      h(Badge, { key: 'badge', tone: view.tone }, view.label),
      h(Button, { key: 'check', size: 'sm', variant: 'ghost', disabled: state.busy, onClick: () => run(dep.key, 'check'), 'data-testid': 'plan09-check-' + dep.key }, '演示检查'),
      h(Button, { key: 'install', size: 'sm', disabled: state.busy, onClick: () => run(dep.key, 'install'), 'data-testid': 'plan09-install-' + dep.key }, '演示安装'),
    ]
    if (state.busy) buttons.push(h(Button, { key: 'cancel', size: 'sm', variant: 'ghost', onClick: () => run(dep.key, 'cancel'), 'data-testid': 'plan09-cancel-' + dep.key }, '取消'))
    if (state.status === 'blocked' || state.status === 'failed') {
      buttons.push(h(Button, { key: 'retry', size: 'sm', variant: 'ghost', onClick: () => run(dep.key, 'retry'), 'data-testid': 'plan09-retry-' + dep.key }, '重试'))
    }
    return h('div', { key: dep.key, className: 'wv-plan09-dep', 'data-testid': 'plan09-dep-' + dep.key, 'data-state': state.status },
      h('div', null,
        h('strong', null, dep.label),
        h('p', null, dep.desc),
        state.status === 'blocked' ? h('p', { className: 'wv-plan09-error', 'data-testid': 'plan09-dep-reason-' + dep.key }, plan09InstallFailureReason(state.reason)) : null),
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
    h(Button, { variant: 'ghost', onClick: onClose, 'data-testid': 'plan09-wizard-browse' }, '仅浏览'),
    h(Button, {
      variant: 'primary', disabled: !introChecked, 'data-testid': 'plan09-wizard-acknowledge',
      onClick: () => onAcknowledge({ mode, introAcknowledged: true }),
    }, '知道啦，进入演示'))
  return h(Modal, {
    title: feature.label + ' · 首次依赖向导',
    subtitle: '先看依赖，再决定本机、CPU、云端或已有服务；确认只代表读过说明，不代表已就绪。',
    size: 'lg', onClose, footer,
  },
    h('div', { className: 'wv-plan09-intro', 'data-testid': 'plan09-wizard' },
      h('div', { className: 'wv-plan09-intro-icon' }, h(Icon, { name: feature.icon, size: 20 })),
      h('div', null,
        h('strong', null, feature.id === 'singing' ? '唱歌需要独立的人声分离与翻唱模型' : '语音气泡需要 TTS 和微信投递组件'),
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
    h('p', { className: 'wv-muted', style: { margin: '8px 0 0', fontSize: 11 } }, '当前记录：' + (stored && stored.introAcknowledged ? '已确认过本版本说明' : '本版本尚未确认') + ' · manifest r' + PLAN09_MANIFEST_REVISION))
}

function Plan09DraftField({ label, children, hint }) {
  return h('div', { className: 'wv-field' }, h('label', null, label), children, hint ? h('small', { className: 'wv-muted' }, hint) : null)
}

function Plan09TransactionPanel({ feature, onNotify }) {
  const txRef = React.useRef(null)
  if (!txRef.current) txRef.current = createPlan09DemoTransaction()
  const [view, setView] = React.useState(() => plan09TransactionView(txRef.current.view()))
  const [revisionMismatch, setRevisionMismatch] = React.useState(false)
  const [runtimeConfirmed, setRuntimeConfirmed] = React.useState(false)
  const refresh = (next) => { setView(plan09TransactionView(next)); return next }
  const prepare = () => { refresh(txRef.current.prepare()); onNotify('已准备演示变更计划；请核对后确认。', 'info') }
  const confirm = () => {
    const validated = txRef.current.validate({ confirmedPlanId: txRef.current.view().planId })
    if (!validated.ok) { refresh(validated.view); onNotify(validated.message, 'error'); return }
    const saved = txRef.current.save({ currentRevision: revisionMismatch ? txRef.current.view().expectedRevision + 1 : txRef.current.view().expectedRevision })
    refresh(saved.view)
    onNotify(saved.message, saved.ok ? 'success' : 'error')
  }
  const apply = () => {
    const result = txRef.current.apply({ runtimeRevision: runtimeConfirmed ? txRef.current.view().savedRevision : null })
    refresh(result.view)
    onNotify(result.message, result.ok ? 'success' : 'error')
  }
  return h('section', { className: 'wv-card pad', 'data-testid': 'plan09-tx-panel', 'data-phase': view.phase },
    h('div', { className: 'wv-card-title' },
      h('div', null, h('h2', null, '配置事务 · 隔离演示'), h('p', null, 'DIRTY → 预览计划 → 精确确认 → 隔离保存 → 待生效；未写生产配置。')),
      h(Badge, { tone: view.tone }, view.label)),
    h('div', { className: 'wv-plan09-txline' },
      h('span', null, `revision ${view.revision}`),
      view.planId ? h('span', { className: 'wv-mono' }, view.planId) : null,
      view.lastError ? h('span', { className: 'wv-plan09-error', 'data-testid': 'plan09-tx-error' }, view.lastError) : null),
    h('div', { className: 'wv-row wv-wrap', style: { marginTop: 10 } },
      h(Button, { onClick: prepare, 'data-testid': 'plan09-prepare' }, '预览变更'),
      h(Button, { variant: 'primary', disabled: view.phase !== 'PREPARED', onClick: confirm, 'data-testid': 'plan09-confirm-save' }, '确认并隔离保存'),
      h(Button, { variant: 'ghost', disabled: !view.pendingApply, onClick: apply, 'data-testid': 'plan09-apply-check' }, '检查是否生效'),
      h(Button, { variant: 'ghost', onClick: () => { refresh(txRef.current.unknown()); onNotify('已模拟结果未知：只读查证，不自动重试写入。', 'error') }, 'data-testid': 'plan09-unknown' }, '模拟未知')),
    h('div', { className: 'wv-plan09-toggles' },
      h('label', { className: 'wv-plan09-check' }, h('input', { type: 'checkbox', checked: revisionMismatch, 'data-testid': 'plan09-revision-mismatch', onChange: (e) => setRevisionMismatch(e.target.checked) }), h('span', null, '模拟 revision 冲突')),
      h('label', { className: 'wv-plan09-check' }, h('input', { type: 'checkbox', checked: runtimeConfirmed, 'data-testid': 'plan09-runtime-confirmed', onChange: (e) => setRuntimeConfirmed(e.target.checked) }), h('span', null, '运行组件已确认同一 revision'))),
    h('p', { className: 'wv-muted', style: { margin: '8px 0 0', fontSize: 11 } }, view.text + ' · SAVED 不等于 APPLIED，更不等于 SENT。'))
}

function Plan09FeaturePage({ feature, setup, notify, profileKey, globalSetupOpen = false, capabilityRevision = null }) {
  const key = plan09WizardKey({ workspace: 'demo-workspace', profile: profileKey, feature: feature.id })
  const stored = plan09ReadWizard(window.localStorage, key)
  const [mode, setMode] = React.useState(stored.selectedMode || 'local')
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [errors, setErrors] = React.useState([])
  const [preview, setPreview] = React.useState(null)
  const [voiceDraft, setVoiceDraft] = React.useState(plan09DefaultVoiceDraft)
  const [singingDraft, setSingingDraft] = React.useState(plan09DefaultSingingDraft)
  React.useEffect(() => {
    const view = plan09DeriveWizardView({
      stored: plan09ReadWizard(window.localStorage, key),
      capabilityRevision,
      globalSetupOpen,
    })
    if (view.shouldOpen) setWizardOpen(true)
  }, [key, globalSetupOpen, capabilityRevision])
  const draft = feature.id === 'singing' ? singingDraft : voiceDraft
  const setDraft = feature.id === 'singing' ? setSingingDraft : setVoiceDraft
  const patch = (part) => setDraft((current) => ({ ...current, ...part }))
  const saveWizard = (patchValue) => {
    plan09WriteWizard(window.localStorage, key, { ...patchValue, verifiedCapabilitiesRevision: capabilityRevision })
    setWizardOpen(false)
    notify('已记录本功能的首次说明确认；这不是安装成功，也不代表能力 READY。', 'info')
  }
  const validate = () => {
    const result = feature.id === 'singing'
      ? plan09ValidateSingingDraft(singingDraft, { gpuAvailable: null, deliveryAuthorized: false })
      : plan09ValidateVoiceDraft(voiceDraft, { cloudAuthorized: false })
    setErrors(result.errors)
    return result.ok
  }
  const previewDraft = () => {
    if (!validate()) { notify('草稿还有未完成项，请先处理红色提示。', 'error'); return }
    setPreview(feature.id === 'singing'
      ? `唱歌 · ${singingDraft.engine.toUpperCase()} · 音高 ${singingDraft.pitch} · 人声 ${singingDraft.vocalGainDb} dB / 伴奏 ${singingDraft.instrumentalGainDb} dB`
      : `语音气泡 · ${voiceDraft.engine} · ${voiceDraft.provider} / ${voiceDraft.model} · ${voiceDraft.voiceProfile} · ${voiceDraft.language} · ${voiceDraft.emotion}`)
    notify('已生成演示预览；没有合成或播放真实音频。', 'info')
  }
  const switchEngine = (engine) => {
    const result = plan09SwitchEngine(feature.id, draft, engine)
    setDraft(result.draft)
    setErrors([])
    if (result.cleared.length) notify('已清理不兼容字段：' + result.cleared.join('、') + '。请重新确认参数。', 'info')
  }
  return h('div', { 'data-testid': `page-${feature.id}` },
    h(PageHead, {
      eyebrow: feature.en, title: feature.label, description: feature.hint + '。本轮仅提供离线 Fake 界面与草稿，真实引擎尚未接入。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: 'demo' }, '演示 · 未接入'),
        h(Button, { variant: 'ghost', onClick: () => setWizardOpen(true), 'data-testid': 'plan09-reopen' }, '依赖向导')),
    }),
    h('div', { className: 'wv-notice', style: { marginBottom: 14 } },
      h(Icon, { name: 'info', size: 15 }),
      h('span', null, '当前入口是独立页面，但共享同一份音色、Provider、依赖与任务展示来源；不会创建第二套账号或凭据。')),
    h('section', { className: 'wv-card pad', style: { marginBottom: 14 }, 'data-testid': 'plan09-mode-summary' },
      h('div', { className: 'wv-card-title' },
        h('div', null, h('h2', null, '运行模式与依赖'), h('p', null, '按模式显示必需、可选、仅投递与条件依赖；缺另一功能或微信依赖不阻断浏览与草稿。')),
        h(Badge, { tone: 'wait' }, PLAN09_MODES.find((m) => m.id === mode)?.label || '本机')),
      h('div', { className: 'wv-row wv-wrap' },
        PLAN09_MODES.map((item) => h(Button, {
          key: item.id, size: 'sm', variant: mode === item.id ? 'primary' : 'ghost', 'data-testid': `plan09-page-mode-${item.id}`,
          onClick: () => { setMode(item.id); plan09WriteWizard(window.localStorage, key, { selectedMode: item.id }) },
        }, item.label))),
      h('p', { className: 'wv-muted', style: { margin: '8px 0 0' } }, plan09DependencySummary(plan09DependencyGroups(feature.id, mode)).text + '。共享已验证项不会重复模拟安装。')),
    h('div', { className: 'wv-grid two', style: { marginBottom: 14 } },
      h('section', { className: 'wv-card pad' },
        h('div', { className: 'wv-card-title' }, h('div', null, h('h2', null, '配置草稿'), h('p', null, '切换引擎会清理不兼容参数；云端授权与投递权限照实显示。'))),
        h('div', { className: 'wv-plan09-form' },
          h(Plan09DraftField, { label: '引擎 / 模式' },
            h('select', {
              className: 'wv-select', value: draft.engine, 'data-testid': 'plan09-draft-engine',
              onChange: (event) => switchEngine(event.target.value),
            }, (feature.id === 'singing' ? [['rvc', 'RVC 标准翻唱（首发）'], ['gateway', '已有服务 Gateway'], ['svc', 'SVC（后续可选，不安装）']] : [['local', '本机 TTS'], ['cloud', '云端 Provider'], ['custom', '自定义本机服务']]).map(([value, label]) => h('option', { key: value, value }, label)))),
          feature.id === 'singing' ? h(React.Fragment, null,
            h(Plan09DraftField, { label: '演示素材引用', hint: '只接受虚构引用；不会读取、上传或抓取真实素材。' },
              h('input', { className: 'wv-input', value: singingDraft.sourceRef, placeholder: 'fixture://demo-song-01', 'data-testid': 'plan09-draft-source', onChange: (e) => patch({ sourceRef: e.target.value }) })),
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
            h(Plan09DraftField, { label: 'Provider' },
              h('input', { className: 'wv-input', value: voiceDraft.provider, 'data-testid': 'plan09-draft-provider', onChange: (e) => patch({ provider: e.target.value }) })),
            h(Plan09DraftField, { label: '模型' },
              h('input', { className: 'wv-input', value: voiceDraft.model, 'data-testid': 'plan09-draft-model', onChange: (e) => patch({ model: e.target.value }) })),
            h(Plan09DraftField, { label: '音色 Profile' },
              h('input', { className: 'wv-input', value: voiceDraft.voiceProfile, 'data-testid': 'plan09-draft-voice', onChange: (e) => patch({ voiceProfile: e.target.value }) })),
            h('div', { className: 'wv-grid two' },
              h(Plan09DraftField, { label: '语言' }, h('select', { className: 'wv-select', value: voiceDraft.language, 'data-testid': 'plan09-draft-language', onChange: (e) => patch({ language: e.target.value }) }, PLAN09_LANGUAGES.map((v) => h('option', { key: v, value: v }, v)))),
              h(Plan09DraftField, { label: '情绪' }, h('select', { className: 'wv-select', value: voiceDraft.emotion, 'data-testid': 'plan09-draft-emotion', onChange: (e) => patch({ emotion: e.target.value }) }, PLAN09_EMOTIONS.map((v) => h('option', { key: v, value: v }, v))))),
            h(Plan09DraftField, { label: `语速 ${Number(voiceDraft.speed).toFixed(1)}×` },
              h('input', { className: 'wv-input', type: 'range', min: 0.5, max: 2, step: 0.1, value: voiceDraft.speed, 'data-testid': 'plan09-draft-speed', onChange: (e) => patch({ speed: Number(e.target.value) }) })),
            h(Plan09DraftField, { label: `音量 ${voiceDraft.volume}%` },
              h('input', { className: 'wv-input', type: 'range', min: 0, max: 100, step: 1, value: voiceDraft.volume, 'data-testid': 'plan09-draft-volume', onChange: (e) => patch({ volume: Number(e.target.value) }) }))),
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
          h(SettingRow, { title: '微信投递', desc: '需要 WeChatAgent 与发送器；未授权时禁用演示发送。' }, h(Badge, { tone: 'wait' }, '未授权')),
          h(SettingRow, { title: '云端费用与文本', desc: '云端模式会把文本发送到 Provider；真实调用始终禁用。' }, h(Badge, { tone: 'demo' }, '仅说明')),
          h(SettingRow, { title: '真实音频', desc: '不接收、不存储、不输出真实音频或密钥。' }, h(Badge, { tone: 'demo' }, 'Fake')),
          h(SettingRow, { title: '首次说明', desc: '确认只记录读过说明，不等于 READY。' }, h('span', { className: 'wv-muted', 'data-testid': 'plan09-ack-state' }, stored.introAcknowledged ? '本版本已确认' : '未确认')))),
    h(Plan09TransactionPanel, { feature: feature.id, onNotify: notify }),
    wizardOpen ? h(Plan09Wizard, {
      open: true, feature, mode, setMode, stored,
      onClose: () => setWizardOpen(false),
      onAcknowledge: (value) => saveWizard(value),
      notify,
    }) : null))
}
