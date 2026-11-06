function SettingRow({ title, desc, children, tip }) {
  return h('div', { className: 'wv-setting' },
    h('div', { className: 'wv-setting-copy' },
      h('strong', null, title, tip ? h(Tip, { text: tip }) : null),
      desc ? h('p', null, desc) : null),
    h('div', { className: 'wv-setting-control' }, children))
}

function ServiceCard({ service, onOpen }) {
  return h('article', { className: 'wv-card wv-service' },
    h('div', { className: 'wv-service-head' },
      h('div', { className: 'wv-row' },
        h('div', { className: 'wv-service-icon' }, h(Icon, { name: service.id === 'qwen' ? 'spark' : service.id === 'sender' ? 'wave' : 'chat', size: 17 })),
        h('div', null,
          h('div', { className: 'wv-row', style: { gap: 6 } },
            h('h3', { className: 'wv-service-name' }, service.name),
            h(Badge, { tone: 'demo' }, '演示')),
          h('div', { className: 'wv-muted', style: { fontSize: 10.5, marginTop: 1 } }, service.kind))),
      h(Status, { status: service.status })),
    h('p', { className: 'wv-service-desc' }, service.desc),
    h('div', { className: 'wv-service-meta' },
      h('span', { className: 'wv-muted', style: { fontSize: 10.5 } }, service.latency + ' · 只读'),
      h(Button, { variant: 'ghost', size: 'sm', onClick: () => onOpen(service) }, '详细信息', h(Icon, { name: 'chevron', size: 12 }))))
}

function ActivityMini({ activity, onOpen, last }) {
  return h('button', {
    type: 'button', onClick: () => onOpen(activity),
    className: 'wv-activity-row',
    style: { width: '100%', background: 'transparent', border: 'none', borderBottom: last ? '0' : undefined, textAlign: 'left', padding: '10px 0' },
  },
    h('div', { className: 'wv-activity-main' },
      h('div', { className: 'wv-activity-target' }, activity.target,
        h('span', { className: 'wv-muted', style: { fontWeight: 400, marginLeft: 6, fontSize: 11 } }, activity.kind === '群聊' ? '群聊' : '私聊')),
      h('div', { className: 'wv-activity-sub' }, activity.voice + ' · ' + activity.audio + (activity.error ? ' · ' + activity.error : ''))),
    h('span', { className: 'wv-activity-time wv-hide-narrow' }, activity.time),
    h('span', { className: 'wv-hide-narrow' }, h(Status, { status: activity.status })),
    h('span', { className: 'wv-activity-time' }, activity.synth),
    h('span', { className: 'wv-activity-chev' }, h(Icon, { name: 'chevron', size: 14 })))
}

function ConfigReadout({ setup }) {
  const config = setup && setup.available && setup.data ? setup.data.config : null
  const view = deriveConfigView(config)
  const sourceCount = view.sources.filter((source) => source.readable).length
  return h('section', { className: 'wv-card pad wv-config-readout', style: { marginBottom: 14 } },
    h('div', { className: 'wv-card-title' },
      h('div', null, h('h2', null, '真实配置 · 只读'),
        h('p', null, '来自 Core 的已保存值；不写入配置，也不把保存值冒充实际生效值。')),
      h('div', { className: 'wv-row' },
        h(Badge, { tone: view.available ? 'accent' : 'wait' }, view.available ? 'Core 已读取' : 'Core 未读取'),
        h(Badge, { tone: 'demo' }, '不写入'))),
    view.available ? h(React.Fragment, null,
      h('div', { className: 'wv-config-grid' },
        h('div', { className: 'wv-config-item' },
          h('span', null, '语音开关'), h('strong', null, view.voice.enabledText),
          h('small', null, view.voice.activeText + (view.voice.worker ? ' · ' + view.voice.worker.enabledText : ''))),
        h('div', { className: 'wv-config-item' },
          h('span', null, '模式 / 群聊'), h('strong', null, (view.voice.mode || '未知') + ' · ' + view.voice.forGroupText),
          h('small', null, '触发：' + (view.voice.triggerMode || '未知') + ' · 自动概率：' + view.voice.autoProbabilityText)),
        h('div', { className: 'wv-config-item' },
          h('span', null, '默认音色'), h('strong', null, view.voice.defaultVoice || '未知'),
          h('small', null, '来源：' + (view.voice.source || '未知'))),
        h('div', { className: 'wv-config-item' },
          h('span', null, 'TTS Provider'), h('strong', null, (view.tts.provider || '未知') + ' · ' + view.tts.configuredText),
          h('small', null, '已保存音色：' + (view.tts.voice || '未知') + ' · ' + view.tts.runtimeText)),
        h('div', { className: 'wv-config-item' },
          h('span', null, '服务返回'), h('strong', null, view.tts.runtimeModel || '未返回模型'),
          h('small', null, view.tts.mismatchText || '未发现配置与模型不一致')),
        h('div', { className: 'wv-config-item' },
          h('span', null, '权限数量'), h('strong', null, '私聊 ' + view.permissions.privateText + ' / 群聊 ' + view.permissions.groupText),
          h('small', null, '名单详情：' + (view.permissions.detailAvailable ? '可读取' : '未读取'))),
        h('div', { className: 'wv-config-item' },
          h('span', null, 'Voice Sender'), h('strong', null, view.sender.runningText + ' · ' + view.sender.healthText),
          h('small', null, '配置一致性：' + view.sender.consistency + ' · 恢复：' + view.sender.recoveryText)),
        h('div', { className: 'wv-config-item' },
          h('span', null, '保存 / 生效'), h('strong', null, view.application.text),
          h('small', null, 'Revision ' + (view.revision || '—') + ' · 生效未确认'))),
      h('div', { className: 'wv-config-foot' },
        h('span', null, '读取于 ' + (view.observedAt || '未知') + ' · 可读来源 ' + sourceCount + ' 个'),
        view.application.state === 'MISMATCH' ? h('span', { className: 'wv-config-warn' }, '配置来源不一致，不能合并为一个开关值。') : null))
      : h('div', { className: 'wv-notice warn' },
        h(Icon, { name: 'alert', size: 15 }),
        h('span', null, 'Core 配置尚未读取。这里不会用 Mock 配置填充真实值；请检查 Host 连接或 Core 配置。')))
}

function CapabilityBadge({ label, state, tone }) {
  return h(Badge, { tone: tone || (state === 'SUPPORTED' || state === 'AUTHORIZED' || state === 'APPLIED' || state === 'AVAILABLE' ? 'backend' : 'wait') }, label)
}

function CapabilityComponentRow({ component }) {
  const stateLabel = component.rawStateText && component.rawStateText !== component.stateText
    ? component.stateText + ' · ' + component.rawStateText
    : component.stateText
  return h('div', { className: 'wv-cap-component', 'data-testid': 'capability-component-' + component.id },
    h('div', null,
      h('strong', null, component.label),
      h('small', null, component.versionText + ' · ' + component.versionMatchText)),
    h('div', { className: 'wv-cap-component-state' },
      h(CapabilityBadge, { label: stateLabel, state: component.status, tone: component.tone === 'ok' ? 'backend' : component.tone === 'blocked' ? 'demo' : 'wait' }),
      h('small', null, component.observedAt ? '检测于 ' + component.observedText : '检测时间未知')))
}

function CapabilitySurfaceRow({ item, detailed = true }) {
  return h('article', { className: 'wv-cap-surface', 'data-testid': 'capability-surface-' + item.key },
    h('div', { className: 'wv-cap-surface-head' },
      h('div', null,
        h('strong', null, item.label),
        h('small', null, item.sourceLabel + ' · ' + item.readText + ' · ' + item.hotText + ' · ' + item.restartText)),
      h('div', { className: 'wv-cap-badges' },
        h(CapabilityBadge, { label: item.saveState === 'SUPPORTED' ? '可保存' : item.saveState === 'UNKNOWN' ? '保存未知' : '无保存接口', state: item.saveState }),
        h(CapabilityBadge, { label: item.authorization === 'AUTHORIZED' ? '已授权' : item.authorization === 'UNKNOWN' ? '授权未知' : '未授权写入', state: item.authorization }),
        h(CapabilityBadge, { label: item.applyState === 'APPLIED' ? '已生效' : item.applyState === 'UNKNOWN' ? '生效未知' : '生效未确认', state: item.applyState === 'APPLIED' ? 'APPLIED' : 'UNKNOWN' }))),
    h('p', { className: 'wv-cap-line' }, item.savedText),
    h('p', { className: 'wv-cap-line' }, item.runtimeText),
    h('p', { className: 'wv-cap-line' }, item.applyText),
    item.blockers.length ? h('div', { className: 'wv-cap-blockers' },
      item.blockers.slice(0, 2).map((blocker) => h('span', { key: blocker.code, className: 'wv-cap-blocker' }, blocker.text))) : null,
    detailed ? h('details', { className: 'wv-cap-details' },
      h('summary', null, '技术详情'),
      h('div', { className: 'wv-cap-detail-grid' },
        h('div', null, h('span', null, '组件接口'), h('strong', null, item.ownerApiText)),
        h('div', null, h('span', null, '读取时机'), h('strong', null, item.readText)),
        h('div', null, h('span', null, '热更新'), h('strong', null, item.hotText)),
        h('div', null, h('span', null, '重启要求'), h('strong', null, item.restartText)),
        h('div', null, h('span', null, '保存能力'), h('strong', null, item.saveStateText)),
        h('div', null, h('span', null, '写入授权'), h('strong', null, item.authorizationText)),
        h('div', null, h('span', null, '当前写入'), h('strong', null, item.enabled ? '已启用' : '未启用 · ' + item.gate)),
        h('div', null, h('span', null, '生效状态'), h('strong', null, item.applyText)),
        h('div', null, h('span', null, '保存值来源'), h('strong', null, item.savedText)),
        h('div', null, h('span', null, '运行状态'), h('strong', null, item.runtimeText)),
        h('div', null, h('span', null, '检测时间'), h('strong', null, item.observedAt ? String(item.observedAt).replace('T', ' ').slice(0, 19) : '未知'))),
      item.blockers.length ? h('div', { className: 'wv-cap-detail-blockers' },
        item.blockers.map((blocker) => h('div', { key: blocker.code }, h('code', null, blocker.code), h('span', null, blocker.text)))) : null) : null)
}

function CapabilityPanel({ capability, groups, title, desc, detailed = true, showComponents = false }) {
  const view = deriveCapabilityView(capability && capability.data)
  if (capability && capability.checking) {
    return h('div', { className: 'wv-notice', style: { marginBottom: 14 } },
      h(Icon, { name: 'clock', size: 15 }),
      h('span', null, '正在读取组件能力与授权状态…'))
  }
  if (!capability || !capability.available || !view.available) {
    return h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '能力数据不可用：需要 Whale Voice Core 的只读能力接口。Mock 数据不会替代真实能力。'))
  }
  const keys = Array.isArray(groups) && groups.length ? groups : ['bridge', 'senderAutomation', 'senderTts', 'worker', 'wechat', 'core', 'qwen']
  const items = keys.map((key) => view.groups[key]).filter(Boolean)
  return h('section', { className: 'wv-card pad wv-capability-panel', 'data-testid': 'capability-panel', style: { marginBottom: 14 } },
    h('div', { className: 'wv-card-title' },
      h('div', null,
        h('h2', null, title || '能力与授权 · 只读'),
        h('p', null, desc || view.headline)),
      h('div', { className: 'wv-row' },
        h(Badge, { tone: 'accent' }, '只读阶段'),
        h(Badge, { tone: 'wait' }, '未授权写入'))),
    showComponents ? h('div', { className: 'wv-cap-components' }, view.components.map((component) => h(CapabilityComponentRow, { key: component.id, component }))) : null,
    h('div', { className: 'wv-cap-surfaces' }, items.map((item) => h(CapabilitySurfaceRow, { key: item.key, item, detailed }))),
    h('div', { className: 'wv-cap-foot' },
      h('span', null, '读取于 ' + view.observedText + ' · ' + view.summary.surfaceCount + ' 个配置面'),
      view.blockedReasons.length ? h('span', { className: 'wv-cap-foot-warn' }, view.blockedReasons[0].text) : null))
}

function CapabilitySummary({ capability }) {
  const view = deriveCapabilityView(capability && capability.data)
  if (!capability || capability.checking) {
    return h('div', { className: 'wv-notice', style: { marginBottom: 14 } }, h(Icon, { name: 'clock', size: 15 }), h('span', null, '正在读取真实能力摘要…'))
  }
  if (!capability.available || !view.available) {
    return h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '能力摘要不可用：Core 未连接或能力接口未加载。不会用演示数据填充。'))
  }
  return h('section', { className: 'wv-card pad wv-cap-summary', 'data-testid': 'capability-summary', style: { marginBottom: 14 } },
    h('div', { className: 'wv-card-title' },
      h('div', null, h('h2', null, '能力与授权摘要'), h('p', null, view.headline)),
      h(Badge, { tone: 'accent' }, '只读阶段')),
    h('div', { className: 'wv-cap-chips' },
      h('span', { className: 'wv-chip' }, h('strong', null, String(view.summary.surfaceCount)), '配置面'),
      h('span', { className: 'wv-chip' }, h('strong', null, String(view.summary.saveSupported)), '支持保存'),
      h('span', { className: 'wv-chip' }, h('strong', null, String(view.summary.notAuthorized)), '未授权写入'),
      h('span', { className: 'wv-chip' }, h('strong', null, String(view.summary.writeEnabled)), '可执行写入'),
      h('span', { className: 'wv-chip' }, h('strong', null, String(view.summary.unknown)), '能力未知')),
    h('div', { className: 'wv-cap-components' }, view.components.map((component) => h(CapabilityComponentRow, { key: component.id, component }))),
    view.blockedReasons.length ? h('div', { className: 'wv-cap-blockers' },
      view.blockedReasons.slice(0, 3).map((reason) => h('span', { key: reason.code, className: 'wv-cap-blocker' }, reason.text))) : null,
    h('div', { className: 'wv-cap-foot' }, h('span', null, '检测于 ' + view.observedText)))
}

function OverviewPage({ settings, setSetting, setPage, notify, openService, openActivity, setup, capability, onSetup, onComponents }) {
  const stats = [
    { label: '服务', value: '2 / 3', sub: '演示在线 · 1 忙碌' },
    { label: '专属音色', value: '1', sub: 'whale-v1 · 已就绪' },
    { label: '今日语音', value: '12', sub: '演示任务 · 本地气泡' },
    { label: '队列', value: '0', sub: '串行队列 · 空闲' },
  ]
  return h(React.Fragment, null,
    h('section', { className: 'wv-hero' },
      h('div', { className: 'wv-hero-copy' },
        h('div', { className: 'wv-eyebrow' }, 'WHALE VOICE · 小鲸鱼语音中心'),
        h('h1', null, '小鲸鱼的声音，', h('span', null, '已经准备好了。')),
        h('p', null, 'Qwen3-TTS · whale-v1 · 私聊演示联系人。真实 Core 配置面板为只读；服务指标、联系人与任务仍为前端演示数据，不写入生产配置，也不代表真实任务状态。'),
        h('div', { className: 'wv-hero-chips' },
          h('span', { className: 'wv-chip accent' }, h('strong', null, 'whale-v1'), '专属音色'),
          h('span', { className: 'wv-chip' }, h('strong', null, '2 / 3'), '服务在线'),
          h('span', { className: 'wv-chip' }, h('strong', null, '演示联系人'), '唯一私聊目标'),
          h('span', { className: 'wv-chip' }, h('strong', null, 'Mock'), '演示数据')),
        h('div', { className: 'wv-hero-actions' },
          h(Button, { variant: 'primary', onClick: () => setPage('settings') }, h(Icon, { name: 'settings', size: 14 }), '进入语音设置'),
          h(Button, { onClick: () => setPage('studio') }, h(Icon, { name: 'wave', size: 14 }), '打开音色中心'))),
      h('div', { className: 'wv-hero-art' }, h(WhaleArt))),
    h(SetupBanner, { status: setup, onSetup, onComponents }),
    h(ConfigReadout, { setup }),
    h(CapabilitySummary, { capability }),
    h('div', { className: 'wv-grid four', style: { marginTop: 12 } },
      stats.map((s) => h('div', { key: s.label, className: 'wv-card wv-stat' },
        h('span', { className: 'wv-stat-label' }, s.label),
        h('strong', { className: 'wv-stat-value' }, s.value),
        h('span', { className: 'wv-stat-sub' }, s.sub)))),
    h('div', { style: { height: 18 } }),
    h('div', { className: 'wv-section-head' },
      h('div', null,
        h('span', { className: 'wv-section-kicker' }, 'SERVICE STATUS'),
        h('h2', null, '服务状态', h(Badge, { tone: 'demo' }, 'Mock'))),
      h('span', { className: 'wv-section-note' }, '本区域为演示指标，不请求真实服务；真实 Core 状态见上方能力摘要')),
    h('div', { className: 'wv-grid three' }, MOCK_SERVICES.map((service) => h(ServiceCard, { key: service.id, service, onOpen: openService }))),
    h('div', { style: { height: 14 } }),
    h('div', { className: 'wv-grid two' },
      h('section', { className: 'wv-card wv-voicecard' },
        h('div', { className: 'wv-voice-top' },
          h('div', null,
            h('div', { className: 'wv-row' }, h('h2', { className: 'wv-voicename' }, 'whale-v1'), h(Badge, { tone: 'accent' }, '当前音色')),
            h('p', { className: 'wv-voicesub' }, '小鲸鱼专属声音 · Qwen3-TTS 1.7B Base')),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPage('studio') }, '详情', h(Icon, { name: 'chevron', size: 12 }))),
        h(MiniWave, null),
        h('div', { className: 'wv-voice-meta' },
          h('div', { className: 'wv-metaitem' }, h('span', null, '模型'), h('strong', null, 'Qwen3-TTS 1.7B Base')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '版本'), h('strong', null, 'whale-v1 · v1.0')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '参考音频'), h('strong', null, '已锁定 · 演示')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '状态'), h('strong', null, '已就绪 · 演示'))),
        h('p', { className: 'wv-voicenote' }, '参考音频已锁定。试听与真实合成将在语音服务接入后开放；本轮不会调用 Qwen。'),
        h('div', { className: 'wv-row wv-wrap', style: { marginTop: 2 } },
          h(Button, { onClick: () => setPage('studio') }, h(Icon, { name: 'wave', size: 14 }), '进入音色中心'),
          h(Button, { variant: 'ghost', onClick: () => notify('试听需要真实语音服务接入；本轮不会调用 Qwen。', 'info') }, h(Icon, { name: 'play', size: 13 }), '试听（未接入）'))),
      h('section', { className: 'wv-card pad' },
        h('div', { className: 'wv-card-title' },
          h('div', null, h('h2', null, '快捷设置'), h('p', null, '前端演示开关，不会写入生产配置')),
          h(Badge, { tone: 'demo' }, '演示状态')),
        h('div', { className: 'wv-quick' },
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '私聊语音'), h('div', { className: 'wv-quicksub' }, '只允许白名单私聊')),
            h('div', { className: 'wv-quick-control' }, h('span', { className: 'wv-switchstate' }, settings.private_enabled ? '演示开启' : '演示关闭'), h(Toggle, { checked: settings.private_enabled, onChange: (v) => { setSetting('private_enabled', v); notify('仅修改前端演示状态。', 'info') }, label: '私聊语音' }))),
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '群聊语音'), h('div', { className: 'wv-quicksub' }, '默认关闭 · 需真实授权')),
            h('div', { className: 'wv-quick-control' }, h('span', { className: 'wv-switchstate' }, settings.group_enabled ? '演示开启' : '演示关闭'), h(Toggle, { checked: settings.group_enabled, onChange: (v) => { setSetting('group_enabled', v); notify('群聊语音仍受真实白名单约束。', 'info') }, label: '群聊语音' }))),
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '仅明确请求'), h('div', { className: 'wv-quicksub' }, '不做自动语音')),
            h('div', { className: 'wv-quick-control' }, h('span', { className: 'wv-switchstate' }, settings.explicit_only ? '演示开启' : '演示关闭'), h(Toggle, { checked: settings.explicit_only, onChange: (v) => setSetting('explicit_only', v), label: '仅明确请求' }))),
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '发送与安全'), h('div', { className: 'wv-quicksub' }, '紧急停止 · 窗口焦点 · 游戏保护')),
            h('div', { className: 'wv-quick-control' }, h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPage('safety') }, '查看', h(Icon, { name: 'chevron', size: 12 }))))),
        h('div', { className: 'wv-between wv-quick-foot', style: { marginTop: 13, paddingTop: 11, borderTop: '1px solid var(--wv-hairline)' } },
          h('div', null, h('div', { className: 'wv-small wv-muted' }, '语音生成状态'), h('div', { className: 'wv-row', style: { gap: 7, marginTop: 3 } }, h(Status, { status: 'online', label: '就绪 · 演示' }), h('span', { className: 'wv-muted', style: { fontSize: 11 } }, 'Qwen 本地引擎'))),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPage('activity') }, '查看任务', h(Icon, { name: 'chevron', size: 12 }))))),
    h('div', { style: { height: 14 } }),
    h(Card, {
      title: '最近活动', desc: '演示任务记录 · 不读取真实聊天内容',
      actions: h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPage('activity') }, '全部任务', h(Icon, { name: 'chevron', size: 12 })),
    }, h('div', { className: 'wv-activity-list' },
      MOCK_ACTIVITIES.slice(0, 4).map((a, i) => h(ActivityMini, { key: a.id, activity: a, onOpen: openActivity, last: i === 3 })))))
}

const GENERATION_DRAFT_ERRORS = {
  settings_draft_unavailable: '草稿存储未接入：当前 Host 没有提供草稿位置，前端不会假装已保存。',
  draft_root_invalid: '请填写生成数据保存位置。',
  draft_root_not_absolute: '保存位置需要使用绝对路径，例如 D:\\WhaleVoice\\generation。',
  draft_invalid: '已保存的草稿无法读取，未显示旧值。',
  draft_missing: '尚未保存草稿，请先保存再应用。',
  applied_invalid: '已应用的位置无法读取，未显示旧值。',
  runtime_model_invalid: '请填写 Qwen 模型目录。',
  runtime_model_not_absolute: 'Qwen 模型目录需要使用绝对路径。',
  runtime_python_invalid: '请填写 Python 运行程序位置。',
  runtime_python_not_absolute: 'Python 运行程序位置需要使用绝对路径。',
  runtime_draft_invalid: '已保存的运行路径草稿无法读取，未显示旧值。',
  runtime_draft_missing: '尚未保存运行路径草稿，请先保存再应用。',
  runtime_applied_invalid: '已应用的运行路径无法读取，未显示旧值。',
  invalid_body: '草稿请求无效。',
  internal_error: '草稿保存失败：Host 内部错误。',
  core_unreachable: '无法连接 Host 接口。',
}

function generationDraftError(error) {
  return GENERATION_DRAFT_ERRORS[error] || ('草稿操作失败：' + (error || '未知'))
}

/** 144/146: a real Host-side draft plus an explicit applied fact, never a frontend demo field. */
function GenerationStorageDraftCard({ notify }) {
  const host = window.__WHALE_SETUP__
  const available = Boolean(host)
  const [value, setValue] = React.useState('')
  const [savedValue, setSavedValue] = React.useState(null)
  const [applied, setApplied] = React.useState(null)
  const [loading, setLoading] = React.useState(available)
  const [busy, setBusy] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [error, setError] = React.useState(available ? '' : generationDraftError('settings_draft_unavailable'))
  const [appliedError, setAppliedError] = React.useState('')

  const applyPayload = (payload) => {
    setLoading(false)
    if (!payload || payload.ok !== true) {
      setError(generationDraftError(payload && payload.error))
      return
    }
    setAppliedError(Boolean(payload.appliedError))
    const saved = payload.draft && typeof payload.draft.generationStorageRoot === 'string'
      ? payload.draft.generationStorageRoot
      : ''
    setSavedValue(saved)
    setValue(saved)
    setApplied(payload.applied && typeof payload.applied.generationStorageRoot === 'string'
      ? { generationStorageRoot: payload.applied.generationStorageRoot }
      : null)
    setError('')
  }

  React.useEffect(() => {
    if (!available) return undefined
    let alive = true
    host.getGenerationStorageDraft().then(
      (payload) => { if (alive) applyPayload(payload) },
      () => {
        if (!alive) return
        setLoading(false)
        setError(generationDraftError('core_unreachable'))
      },
    )
    return () => { alive = false }
  }, [])

  const save = async () => {
    if (!available || busy) return
    setBusy(true)
    setError('')
    try {
      const payload = await host.saveGenerationStorageDraft({ generationStorageRoot: value })
      setBusy(false)
      if (!payload || payload.ok !== true) {
        setError(generationDraftError(payload && payload.error))
        notify('生成数据保存位置草稿未保存。', 'error')
        return
      }
      applyPayload(payload)
      const saved = payload.draft && payload.draft.generationStorageRoot
      const alreadyApplied = !!(payload.applied && payload.applied.generationStorageRoot === saved)
      notify(alreadyApplied
        ? '草稿已保存；该位置已应用，下次重开插件生效。'
        : '生成数据保存位置草稿已保存，尚未应用。', 'success')
    } catch {
      setBusy(false)
      setError(generationDraftError('core_unreachable'))
      notify('生成数据保存位置草稿未保存。', 'error')
    }
  }

  const applySaved = async () => {
    if (!available || applying || busy || loading) return
    if (!savedValue) { setError(generationDraftError('draft_missing')); return }
    if (value.trim() !== savedValue) {
      setError('请先保存当前修改，再应用已保存的位置。')
      return
    }
    setApplying(true)
    setError('')
    try {
      const payload = await host.applyGenerationStorageDraft()
      setApplying(false)
      if (!payload || payload.ok !== true) {
        setError(generationDraftError(payload && payload.error))
        notify('生成数据保存位置未应用。', 'error')
        return
      }
      applyPayload(payload)
      notify('生成数据保存位置已应用，下次重开插件生效。', 'success')
    } catch {
      setApplying(false)
      setError(generationDraftError('core_unreachable'))
      notify('生成数据保存位置未应用。', 'error')
    }
  }

  const statusText = !available
    ? '草稿存储未接入'
    : loading
      ? '正在读取草稿…'
      : savedValue
        ? '已保存草稿：' + savedValue
        : '尚未保存草稿'
  const appliedText = appliedError
    ? '已应用位置：记录损坏，无法读取'
    : applied
      ? '已应用位置：' + applied.generationStorageRoot
      : '尚未应用保存位置'
  const canApply = available && !loading && !busy && !applying && !!savedValue && value.trim() === savedValue

  return h(Card, {
    title: '生成数据保存位置',
    desc: '填写生成任务与产物的保存目录；保存后仍需明确应用，应用只决定下次打开时使用的位置，不会立即切换当前运行。',
    actions: h(Badge, { tone: 'wait' }, '配置草稿'),
  },
    h('div', { className: 'wv-settings-group' },
      h(SettingRow, {
        title: '保存位置',
        desc: '对应正式生成配置里的 storageRoot；保存后刷新或关闭重开页面仍会显示。',
        tip: '只记录位置；不创建目录、不迁移历史数据、不启动 Worker 或模型。',
      },
        h('input', {
          className: 'wv-input',
          type: 'text',
          value,
          placeholder: '例如 D:\\WhaleVoice\\generation',
          disabled: !available || busy || loading,
          onChange: (event) => { setValue(event.target.value); setError('') },
          'aria-label': '生成数据保存位置',
          'data-testid': 'generation-storage-input',
        })),
      h('div', { className: 'wv-row', style: { alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 } },
        h(Button, {
          variant: 'primary',
          onClick: () => { void save() },
          disabled: !available || busy || loading,
          'data-testid': 'generation-storage-save',
        }, busy ? '保存中…' : '保存草稿'),
        h(Button, {
          onClick: () => { void applySaved() },
          disabled: !canApply,
          title: canApply ? '应用已保存的位置；下次重开插件生效' : '需要先保存草稿，且当前输入与已保存值一致',
          'data-testid': 'generation-storage-apply',
        }, applying ? '应用中…' : '应用保存的位置'),
        h('span', { className: 'wv-muted', 'data-testid': 'generation-storage-status' }, statusText)),
      error ? h('div', { className: 'wv-notice warn', style: { marginTop: 8 }, 'data-testid': 'generation-storage-error' },
        h(Icon, { name: 'info', size: 14 }),
        h('span', null, error)) : null,
      h('div', { className: 'wv-muted', style: { marginTop: 8 }, 'data-testid': 'generation-storage-applied' }, appliedText),
      appliedError ? h('div', { className: 'wv-notice warn', style: { marginTop: 8 }, 'data-testid': 'generation-storage-applied-error' },
        h(Icon, { name: 'alert', size: 14 }),
        h('span', null, '已应用的保存位置记录损坏，无法读取；重新保存并应用即可修复。')) : null,
      h('div', { className: 'wv-muted', style: { marginTop: 8, fontSize: 11.5 } },
        '保存只写入草稿；应用只记录供下次打开使用的位置，不会立即切换当时正在运行的组件，也不会启用生成。')))
}

/** 148: a persisted Qwen runtime-path draft; saving never reads a model, executes Python or starts a Worker. */
function QwenRuntimeDraftCard({ notify }) {
  const host = window.__WHALE_SETUP__
  const available = Boolean(host)
  const [modelDirectory, setModelDirectory] = React.useState('')
  const [pythonPath, setPythonPath] = React.useState('')
  const [saved, setSaved] = React.useState(null)
  const [applied, setApplied] = React.useState(null)
  const [loading, setLoading] = React.useState(available)
  const [busy, setBusy] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [error, setError] = React.useState(available ? '' : generationDraftError('settings_draft_unavailable'))
  const [appliedError, setAppliedError] = React.useState('')

  const applyPayload = (payload) => {
    setLoading(false)
    if (!payload || payload.ok !== true) {
      setError(generationDraftError(payload && payload.error))
      return
    }
    setAppliedError(Boolean(payload.appliedError))
    const draft = payload.runtimeDraft
    if (draft && typeof draft.modelDirectory === 'string' && typeof draft.pythonPath === 'string') {
      setSaved({ modelDirectory: draft.modelDirectory, pythonPath: draft.pythonPath })
      setModelDirectory(draft.modelDirectory)
      setPythonPath(draft.pythonPath)
    } else {
      setSaved(null)
      setModelDirectory('')
      setPythonPath('')
    }
    setApplied(payload.applied && typeof payload.applied.modelDirectory === 'string'
      && typeof payload.applied.pythonPath === 'string'
      ? { modelDirectory: payload.applied.modelDirectory, pythonPath: payload.applied.pythonPath }
      : null)
    setError('')
  }

  React.useEffect(() => {
    if (!available) return undefined
    let alive = true
    host.getQwenRuntimeDraft().then(
      (payload) => { if (alive) applyPayload(payload) },
      () => {
        if (!alive) return
        setLoading(false)
        setError(generationDraftError('core_unreachable'))
      },
    )
    return () => { alive = false }
  }, [])

  const save = async () => {
    if (!available || busy) return
    setBusy(true)
    setError('')
    try {
      const payload = await host.saveQwenRuntimeDraft({ modelDirectory, pythonPath })
      setBusy(false)
      if (!payload || payload.ok !== true) {
        setError(generationDraftError(payload && payload.error))
        notify('Qwen 运行路径草稿未保存。', 'error')
        return
      }
      applyPayload(payload)
      notify('Qwen 运行路径草稿已保存，尚未应用。', 'success')
    } catch {
      setBusy(false)
      setError(generationDraftError('core_unreachable'))
      notify('Qwen 运行路径草稿未保存。', 'error')
    }
  }

  const applySaved = async () => {
    if (!available || applying || busy || loading) return
    if (!saved) { setError(generationDraftError('runtime_draft_missing')); return }
    if (modelDirectory.trim() !== saved.modelDirectory || pythonPath.trim() !== saved.pythonPath) {
      setError('请先保存当前修改，再应用已保存的运行路径。')
      return
    }
    setApplying(true)
    setError('')
    try {
      const payload = await host.applyQwenRuntimeDraft()
      setApplying(false)
      if (!payload || payload.ok !== true) {
        setError(generationDraftError(payload && payload.error))
        notify('Qwen 运行路径未应用。', 'error')
        return
      }
      applyPayload(payload)
      notify('Qwen 运行路径已应用，下次重开插件生效。', 'success')
    } catch {
      setApplying(false)
      setError(generationDraftError('core_unreachable'))
      notify('Qwen 运行路径未应用。', 'error')
    }
  }

  const statusText = !available
    ? '草稿存储未接入'
    : loading
      ? '正在读取运行路径草稿…'
      : saved
        ? '已保存草稿：' + saved.modelDirectory + ' · ' + saved.pythonPath
        : '尚未保存运行路径草稿'
  const appliedText = appliedError
    ? '已应用运行路径：记录损坏，无法读取'
    : applied
      ? '已应用运行路径：模型 ' + applied.modelDirectory + '；Python ' + applied.pythonPath
      : '尚未应用运行路径'
  const canApply = available && !loading && !busy && !applying && !!saved
    && modelDirectory.trim() === saved.modelDirectory
    && pythonPath.trim() === saved.pythonPath

  return h(Card, {
    title: 'Qwen 运行路径',
    desc: '填写本地 Qwen 模型目录与 Python 运行程序位置；保存后仍需明确应用，应用只决定下次打开时采用的位置，不会立即切换当前运行。',
    actions: h(Badge, { tone: 'wait' }, '运行路径草稿'),
  },
    h('div', { className: 'wv-settings-group' },
      h(SettingRow, {
        title: 'Qwen 模型目录',
        desc: '本地模型目录的绝对路径；仅作为草稿记录，尚未应用。',
        tip: '不会读取或加载模型文件。',
      },
        h('input', {
          className: 'wv-input',
          type: 'text',
          value: modelDirectory,
          placeholder: '例如 D:\\models\\Qwen3-TTS-12Hz-1.7B-CustomVoice',
          disabled: !available || busy || loading,
          onChange: (event) => { setModelDirectory(event.target.value); setError('') },
          'aria-label': 'Qwen 模型目录',
          'data-testid': 'qwen-runtime-model',
        })),
      h(SettingRow, {
        title: 'Python 运行程序',
        desc: 'Python 可执行文件的绝对路径；仅作为草稿记录，尚未应用。',
        tip: '不会执行 Python 程序。',
      },
        h('input', {
          className: 'wv-input',
          type: 'text',
          value: pythonPath,
          placeholder: '例如 C:\\Python311\\python.exe',
          disabled: !available || busy || loading,
          onChange: (event) => { setPythonPath(event.target.value); setError('') },
          'aria-label': 'Python 运行程序',
          'data-testid': 'qwen-runtime-python',
        })),
      h('div', { className: 'wv-row', style: { alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 } },
        h(Button, {
          variant: 'primary',
          onClick: () => { void save() },
          disabled: !available || busy || loading,
          'data-testid': 'qwen-runtime-save',
        }, busy ? '保存中…' : '保存运行路径草稿'),
        h(Button, {
          onClick: () => { void applySaved() },
          disabled: !canApply,
          title: canApply ? '应用已保存的运行路径；下次重开插件生效' : '需要先保存草稿，且当前输入与已保存值一致',
          'data-testid': 'qwen-runtime-apply',
        }, applying ? '应用中…' : '应用运行路径'),
        h('span', { className: 'wv-muted', 'data-testid': 'qwen-runtime-status' }, statusText)),
      error ? h('div', { className: 'wv-notice warn', style: { marginTop: 8 }, 'data-testid': 'qwen-runtime-error' },
        h(Icon, { name: 'info', size: 14 }),
        h('span', null, error)) : null,
      h('div', { className: 'wv-muted', style: { marginTop: 8 }, 'data-testid': 'qwen-runtime-applied' }, appliedText),
      appliedError ? h('div', { className: 'wv-notice warn', style: { marginTop: 8 }, 'data-testid': 'qwen-runtime-applied-error' },
        h(Icon, { name: 'alert', size: 14 }),
        h('span', null, '已应用的运行路径记录损坏，无法读取；重新保存并应用即可修复。')) : null,
      h('div', { className: 'wv-muted', style: { marginTop: 8, fontSize: 11.5 } },
        '保存只写入草稿；应用只记录供下次打开使用的运行路径，不会立即切换当前运行，也不会执行 Python 或读取模型。')))
}

/** 154: a damaged applied record or a failed generation assembly stays visible in the settings page. */
function GenerationRuntimeStatusCard() {
  const host = typeof window !== 'undefined' ? window.__WHALE_SETUP__ : null
  const available = Boolean(host && typeof host.getGenerationAssemblyStatus === 'function')
  const [failure, setFailure] = React.useState(null)
  const [readError, setReadError] = React.useState(false)
  React.useEffect(() => {
    if (!available) return undefined
    let alive = true
    host.getGenerationAssemblyStatus().then((payload) => {
      if (!alive) return
      if (!payload || payload.ok !== true) { setReadError(true); return }
      if (payload.state === 'FAILED') setFailure(payload)
    }, () => { if (alive) setReadError(true) })
    return () => { alive = false }
  }, [])
  if (readError) {
    return h('div', { className: 'wv-notice warn', style: { marginBottom: 14 }, 'data-testid': 'generation-assembly-read-error' },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '无法读取生成运行状态：请求失败或超时；这不代表生成正常或未启用。设置仍可修改，刷新页面可重试。'))
  }
  if (!failure) return null
  return h('div', { className: 'wv-notice warn', style: { marginBottom: 14 }, 'data-testid': 'generation-assembly-error' },
    h(Icon, { name: 'alert', size: 15 }),
    h('span', null, '生成未能启动：' + failure.messageZh))
}

function SettingsPage({ settings, setSetting, dirty, saveSettings, resetSettings, notify, setup, capability }) {
  const num = (v) => Number(v)
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / SETTINGS',
      title: '语音设置',
      description: '日常使用的安全配置。除“生成数据保存位置”草稿外，其余修改只存在于当前前端演示状态，不会写入生产 JSON 或触发真实语音。',
      actions: h(React.Fragment, null,
        dirty ? h(Badge, { tone: 'demo' }, '有未保存修改') : h(Badge, { tone: 'backend' }, '已同步演示草稿'),
        h(Button, { onClick: resetSettings, disabled: !dirty }, '恢复默认'),
        h(Button, { variant: 'primary', onClick: saveSettings, disabled: !dirty }, h(Icon, { name: 'check', size: 14 }), '保存演示')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '演示模式：开关只改变当前页面状态。真实语音开关、白名单与 Bridge 配置均不会被修改。“生成数据保存位置”只保存为草稿，不会启用生成服务。')),
    h(GenerationRuntimeStatusCard, null),
    h(GenerationStorageDraftCard, { notify }),
    h(QwenRuntimeDraftCard, { notify }),
    h(ConfigReadout, { setup }),
    h(CapabilityPanel, {
      capability,
      groups: ['bridge'],
      title: 'Bridge 用户开关 · 真实只读状态',
      desc: 'Bridge 每次语音调用都会读取该文件，但组件没有写入接口；本阶段只展示保存值与只读限制。',
    }),
    h('div', { className: 'wv-grid two' },
      h(Card, { title: '基础控制', desc: '总开关与回复方式' },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '总语音开关', desc: '关闭时所有语音请求都会降级为文字。' },
            h(Toggle, { checked: settings.enabled, onChange: (v) => setSetting('enabled', v), label: '总语音开关' })),
          h(SettingRow, { title: '私聊语音', desc: '只对私聊白名单内联系人生效。' },
            h(Toggle, { checked: settings.private_enabled, onChange: (v) => setSetting('private_enabled', v), label: '私聊语音' })),
          h(SettingRow, { title: '群聊语音', desc: '需要真实群授权、@ 与明确语音意图。' },
            h(Toggle, { checked: settings.group_enabled, onChange: (v) => setSetting('group_enabled', v), label: '群聊语音' })),
          h(SettingRow, { title: '仅明确请求时发语音', desc: '推荐开启。避免普通聊天被自动转成语音。' },
            h(Toggle, { checked: settings.explicit_only, onChange: (v) => setSetting('explicit_only', v), label: '仅明确请求' })),
          h(SettingRow, { title: '默认回复方式', desc: '文字优先，或按意图自动选择。' },
            h('select', { className: 'wv-select', value: settings.explicit_only ? 'explicit' : 'auto', onChange: (e) => setSetting('explicit_only', e.target.value === 'explicit'), 'aria-label': '默认回复方式' },
              h('option', { value: 'explicit' }, '明确语音请求'),
              h('option', { value: 'auto' }, '自动判断（演示）'))),
          h(SettingRow, { title: '允许自动语音', desc: '当前仅演示；生产建议保持关闭。' },
            h(Toggle, { checked: settings.auto, onChange: (v) => { setSetting('auto', v); if (v) setSetting('auto_probability', 35) }, label: '允许自动语音' })),
          h(SettingRow, { title: '自动语音概率', desc: '仅在“允许自动语音”开启时可调。', tip: '真实生产配置中应保持 0；这里只是前端演示。' },
            h('input', { className: 'wv-slider', type: 'range', min: 0, max: 100, step: 5, value: settings.auto_probability, disabled: !settings.auto, onChange: (e) => setSetting('auto_probability', num(e.target.value)), 'aria-label': '自动语音概率' }),
            h('span', { className: 'wv-rangeval' }, settings.auto_probability + '%')),
          h(SettingRow, { title: '默认音色', desc: '当前仅 whale-v1 可用。' },
            h('select', { className: 'wv-select', value: settings.default_voice, onChange: (e) => setSetting('default_voice', e.target.value), 'aria-label': '默认音色' },
              h('option', { value: 'whale-v1' }, 'whale-v1 · 小鲸鱼专属'),
              h('option', { value: 'whale-v2', disabled: true }, 'whale-v2 · 未来版本'),
              h('option', { value: 'custom', disabled: true }, '自定义音色 · 未接入'))))),
      h('div', { className: 'wv-stack' },
        h(Card, { title: '生成参数', desc: '合成阶段约束，不包含微信发送耗时' },
          h('div', { className: 'wv-settings-group' },
            h(SettingRow, { title: '单次最大文本长度', desc: '超过后会截断或拒绝，取决于后端策略。', tip: '只限制进入 TTS 的文本长度，不影响历史聊天。' },
              h('input', { className: 'wv-slider', type: 'range', min: 80, max: 1000, step: 20, value: settings.max_chars, onChange: (e) => setSetting('max_chars', num(e.target.value)), 'aria-label': '最大文本长度' }),
              h('span', { className: 'wv-rangeval' }, settings.max_chars + ' 字')),
            h(SettingRow, { title: '最大语音时长', desc: '录音与播放的安全上限。', tip: '超过上限时任务会失败并恢复设备，不会无限录制。' },
              h('input', { className: 'wv-slider', type: 'range', min: 5, max: 60, step: 1, value: settings.max_duration, onChange: (e) => setSetting('max_duration', num(e.target.value)), 'aria-label': '最大语音时长' }),
              h('span', { className: 'wv-rangeval' }, settings.max_duration + ' s')),
            h(SettingRow, { title: '合成超时', desc: '只限制等待 Qwen 生成音频的时间。', tip: '不是微信发送总耗时；发送阶段另有等待界面与录音超时。' },
              h('input', { className: 'wv-input', type: 'number', min: 10, max: 600, value: settings.timeout, onChange: (e) => setSetting('timeout', Math.max(10, Math.min(600, num(e.target.value) || 10))), 'aria-label': '合成超时秒数' }),
              h('span', { className: 'wv-muted', style: { fontSize: 11 } }, '秒')),
            h(SettingRow, { title: '默认语言', desc: '当前后端主要按中文参考音色工作。' },
              h('select', { className: 'wv-select', value: settings.language, onChange: (e) => setSetting('language', e.target.value), 'aria-label': '默认语言' },
                h('option', { value: 'zh-CN' }, '中文（普通话）'),
                h('option', { value: 'en-US' }, 'English（演示）'),
                h('option', { value: 'auto' }, '自动检测（未接入）'))),
            h(SettingRow, { title: '音频格式', desc: '发送前统一为微信可用的本地 WAV。' },
              h('select', { className: 'wv-select', value: settings.format, onChange: (e) => setSetting('format', e.target.value), 'aria-label': '音频格式' },
                h('option', { value: 'wav' }, 'WAV · 24kHz / mono'),
                h('option', { value: 'mp3', disabled: true }, 'MP3 · 未接入'))),
            h(SettingRow, { title: '生成队列策略', desc: '当前生产为串行，避免抢占录音设备。' },
              h('select', { className: 'wv-select', value: settings.queue, onChange: (e) => setSetting('queue', e.target.value), 'aria-label': '队列策略' },
                h('option', { value: 'serial' }, '串行 · 推荐'),
                h('option', { value: 'parallel', disabled: true }, '并行 · 未接入'))))),
        h(Card, { title: '故障降级', desc: '语音服务不可用时的统一策略', actions: h(Badge, { tone: 'demo' }, '演示设置') },
          h('div', { className: 'wv-settings-group' },
            h(SettingRow, { title: '语音服务不可用时使用文字回复', desc: '适用于 Qwen 或未来云端 TTS；不会覆盖 UNKNOWN 或已提交任务。' },
              h('select', { className: 'wv-select', value: settings.offline_behavior, onChange: (e) => setSetting('offline_behavior', e.target.value), 'aria-label': '语音失败降级策略' },
                h('option', { value: 'text' }, '改为文字'),
                h('option', { value: 'fail' }, '任务失败'),
                h('option', { value: 'queue', disabled: true }, '排队等待 · 未接入'))),
            h('div', { className: 'wv-notice', style: { marginTop: 4 } },
              h(Icon, { name: 'info', size: 15 }),
              h('span', null, '只有明确证明尚未产生外部发送副作用时，才考虑降级；UNKNOWN、录音或提交阶段不会自动改发文字。')))),
    )))
}

const SAFETY_DEFAULT_SHORTCUT = 'Ctrl + Shift + F12'

function SafetyPage({ settings, setup, capability }) {
  const coreConnected = Boolean(setup && setup.available && setup.data && setup.data.demo !== true)
  const backendLabel = coreConnected ? '等待后端 API' : 'Core 未连接'
  const backendTone = coreConnected ? 'wait' : 'demo'
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / SAFETY',
      title: '发送与安全',
      description: '统一管理紧急停止、微信窗口焦点与游戏保护。本页只展示能力状态与规划；不会注册全局热键、激活微信或操作音频设备。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: backendTone }, backendLabel),
        h(Badge, { tone: 'wait' }, '只读状态')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'lock', size: 15 }),
      h('span', null, '安全控制后端尚未接入。候选快捷键、窗口发现、自动聚焦和游戏保护不会在本轮产生真实系统行为；未知状态不会显示为安全通过。')),
    h(CapabilityPanel, {
      capability,
      groups: ['senderAutomation', 'worker'],
      title: '发送自动化与 Worker 安全许可 · 真实只读状态',
      desc: 'Sender automation 有运行时 PUT 接口但当前未授权；Worker voice_enabled 是独立最终安全许可，永不写入。',
    }),
    h('div', { className: 'wv-grid three' },
      h(Card, {
        title: '紧急停止',
        desc: '取消当前语音任务并尝试恢复设备',
        actions: h(Badge, { tone: 'wait' }, '后端未接入'),
      },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '全局紧急停止', desc: '快捷键触发取消；本轮不会注册真实键盘监听。' },
            h('div', { className: 'wv-row' }, h(Badge, { tone: 'wait' }, '未支持'), h(Button, { disabled: true }, '注册快捷键'))),
          h(SettingRow, { title: '候选快捷键', desc: '仅规划默认值；注册前必须检查系统、DSH 与其他软件冲突。' },
            h('span', { className: 'wv-mono' }, SAFETY_DEFAULT_SHORTCUT)),
          h(SettingRow, { title: '当前可取消任务', desc: '只有明确可取消阶段才能停止。' },
            h(Status, { status: 'unknown', label: '未知' })),
          h(SettingRow, { title: '最近一次停止结果', desc: '本轮没有执行真实紧急停止。' },
            h('span', { className: 'wv-muted' }, '未执行')),
          h(SettingRow, { title: '取消后的设备恢复', desc: '录音、播放和默认设备恢复状态。' },
            h(Status, { status: 'unknown', label: '未知' })),
          h(SettingRow, { title: '自定义快捷键', desc: '录制、冲突检测、注册成功/失败状态。' },
            h(Button, { variant: 'ghost', disabled: true }, '录制快捷键')),
          h('div', { className: 'wv-notice' },
            h(Icon, { name: 'info', size: 15 }),
            h('span', null, '进入录音或提交阶段后可能无法确认消息是否已经发出；必须保持 UNKNOWN，不能为了显示取消成功而改写任务历史。')))),
      h(Card, {
        title: '微信窗口管理',
        desc: '后台发现、焦点保护与目标身份验证',
        actions: h(Badge, { tone: 'wait' }, '后端未接入'),
      },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '自动发现微信窗口', desc: '发现进程或窗口不等于已授权聊天目标。' },
            h('div', { className: 'wv-row' }, h(Toggle, { checked: false, disabled: true, onChange: () => {}, label: '自动发现微信窗口' }), h(Badge, { tone: 'wait' }, '未支持'))),
          h(SettingRow, { title: '当前窗口状态', desc: '是否运行、最小化或在前台。' },
            h(Status, { status: 'unknown', label: '未知' })),
          h(SettingRow, { title: '允许自动聚焦微信窗口', desc: '游戏或其他程序占用前台时必须保持保护。' },
            h('div', { className: 'wv-row' }, h(Toggle, { checked: false, disabled: true, onChange: () => {}, label: '允许自动聚焦微信窗口' }), h(Badge, { tone: 'wait' }, '未支持'))),
          h(SettingRow, { title: '当前焦点策略', desc: '窗口切换和用户操作的保护规则。' },
            h(Status, { status: 'unknown', label: '未知' })),
          h(SettingRow, { title: '授权会话验证', desc: '发送前必须最终核验目标身份。' },
            h(Status, { status: 'unknown', label: '未验证' })),
          h(SettingRow, { title: '最近一次窗口定位结果', desc: '本轮没有自动定位或激活微信。' },
            h('span', { className: 'wv-muted' }, '未执行')),
          h('div', { className: 'wv-notice' },
            h(Icon, { name: 'target', size: 15 }),
            h('span', null, '发现微信窗口 ≠ 已验证目标聊天。不得仅凭窗口标题、昵称或模糊匹配认定目标安全。')))),
      h(Card, {
        title: '游戏模式',
        desc: '游戏运行时的任务暂停与焦点保护',
        actions: h(Badge, { tone: 'wait' }, '检测未接入'),
      },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '游戏时暂停语音任务', desc: '检测到受支持的全屏游戏时，暂停启动新的语音任务。', tip: '当前只保留演示值；真实检测与暂停策略等待后端。' },
            h('div', { className: 'wv-row' }, h(Badge, { tone: 'demo' }, '演示值'), h(Toggle, { checked: settings.game_pause, disabled: true, onChange: () => {}, label: '游戏时暂停语音任务' }))),
          h(SettingRow, { title: '游戏时不抢微信焦点', desc: '游戏运行时，不自动切换到微信窗口。', tip: '检测失败时不得自动假设可以安全抢焦点。' },
            h('div', { className: 'wv-row' }, h(Badge, { tone: 'demo' }, '演示值'), h(Toggle, { checked: settings.game_no_focus, disabled: true, onChange: () => {}, label: '游戏时不抢微信焦点' }))),
          h(SettingRow, { title: '全屏游戏保护', desc: '独占全屏、无边框全屏与普通窗口需要分别判断。' },
            h(Badge, { tone: 'wait' }, '未支持')),
          h(SettingRow, { title: '任务暂停与降级策略', desc: '已开始录音或提交的任务如何处理。' },
            h(Status, { status: 'unknown', label: '未知' })),
          h('div', { className: 'wv-notice' },
            h(Icon, { name: 'gamepad', size: 15 }),
            h('span', null, '默认只暂停新任务；已经开始录音或提交的任务不能被假定可取消，过期任务也不会自动补发。')))),
    ))
}

function MoreMenu({ contact, onCopy, onInfo }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return h('div', { className: 'wv-more-wrap', ref },
    h(IconButton, { icon: 'more', label: '更多操作', onClick: () => setOpen((v) => !v) }),
    open ? h('div', { className: 'wv-menu', role: 'menu' },
      h('button', { type: 'button', onClick: () => { setOpen(false); onCopy() } }, '复制目标 ID'),
      h('button', { type: 'button', onClick: () => { setOpen(false); onInfo() } }, '查看演示详情')) : null)
}

function PermissionsPage({ contacts, setContacts, groups, addGroup, removeGroup, notify, setup, capability }) {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState({ id: '', name: '', mention: true, explicit: true, groupCooldown: 30, memberCooldown: 60 })
  const [errors, setErrors] = React.useState({})
  const [menuInfo, setMenuInfo] = React.useState(null)

  const patchForm = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const validate = () => {
    const next = {}
    const raw = String(form.id || '').trim()
    if (!raw) next.id = '群 ID 不能为空。'
    else if (/\*/.test(raw)) next.id = '不允许使用通配符。'
    else if (/\s/.test(raw)) next.id = '群 ID 不能包含空白字符。'
    else if (!/^(group:)?[A-Za-z0-9_-]{4,40}$/.test(raw)) next.id = '格式：4–40 位字母、数字、下划线或短横线，可带 group: 前缀。'
    else if (groups.some((g) => g.id === (raw.startsWith('group:') ? raw : 'group:' + raw))) next.id = '该群已在演示草稿中，不能重复添加。'
    if (!String(form.name || '').trim()) next.name = '群名称不能为空。'
    if (form.groupCooldown < 0 || form.groupCooldown > 3600) next.groupCooldown = '群冷却需在 0–3600 秒之间。'
    if (form.memberCooldown < 0 || form.memberCooldown > 86400) next.memberCooldown = '成员冷却需在 0–86400 秒之间。'
    setErrors(next)
    return Object.keys(next).length === 0
  }
  const save = () => {
    if (!validate()) return
    const raw = String(form.id).trim()
    addGroup({
      id: raw.startsWith('group:') ? raw : 'group:' + raw,
      name: String(form.name).trim(),
      mention: form.mention,
      explicit: form.explicit,
      groupCooldown: Number(form.groupCooldown),
      memberCooldown: Number(form.memberCooldown),
      status: 'draft',
      verified: false,
    })
    setOpen(false)
    setForm({ id: '', name: '', mention: true, explicit: true, groupCooldown: 30, memberCooldown: 60 })
    setErrors({})
  }
  const toggleContact = (id, value) => {
    setContacts((list) => list.map((c) => c.id === id ? { ...c, permission: value } : c))
    notify('仅修改前端演示权限；真实白名单未变化。', 'info')
  }

  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / PERMISSIONS',
      title: '权限管理',
      description: '声音应该被交给谁，由你决定。私聊白名单与群聊授权是两套独立的安全边界。',
      actions: h(React.Fragment, null,
        h(Button, { disabled: true, title: '等待身份服务接入；本轮不新增真实联系人。' }, h(Icon, { name: 'plus', size: 14 }), '添加联系人'),
        h(Button, { variant: 'primary', onClick: () => setOpen(true) }, h(Icon, { name: 'plus', size: 14 }), '新增授权群聊')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'shield', size: 15 }),
      h('span', null, '群聊语音只有在授权群中、真实 @ 小鲸鱼且明确请求语音时才会触发。默认不提供“允许所有群聊”快捷入口。')),
    h(ConfigReadout, { setup }),
    h(CapabilityPanel, {
      capability,
      groups: ['wechat'],
      title: '微信权限范围 · 真实只读状态',
      desc: '微信权限由 WeChatAgent 控制台人工管理；本插件只读取数量，不读取也不展示名单。',
    }),
    h('div', { className: 'wv-grid two' },
      h(Card, { title: '私聊白名单', desc: '只允许明确列出的私聊目标',
        actions: h(Badge, { tone: 'demo' }, '演示名单') },
        h('div', { className: 'wv-perm-row', style: { borderBottom: '1px solid var(--wv-hairline)', color: 'var(--wv-muted)', fontSize: 10.5, paddingTop: 0, paddingBottom: 6 } },
          h('span', null, ''), h('span', null, '联系人'), h('span', null, '状态'), h('span', { className: 'wv-hide-narrow' }, '触发条件'), h('span', null, '语音'), h('span', null, '')),
        contacts.map((contact) => h('div', { className: 'wv-perm-row', key: contact.id },
          h('div', { className: 'wv-avatar' }, contact.name.slice(0, 1)),
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'wv-perm-name' }, contact.name, !contact.verified ? h('span', { className: 'wv-badge demo', style: { marginLeft: 6 } }, '演示') : null),
            h('div', { className: 'wv-perm-id' }, contact.id)),
          h('div', null, contact.verified ? h(Status, { status: 'verified' }) : h(Badge, { tone: 'demo' }, '虚构示例')),
          h('div', { className: 'wv-perm-col optional' }, h('strong', null, contact.trigger), h('span', null, contact.verified ? '已验证目标' : '不会写入白名单')),
          h(Toggle, { checked: contact.permission, onChange: (v) => toggleContact(contact.id, v), label: contact.name + ' 语音权限' }),
          h(MoreMenu, { contact, onCopy: async () => { const ok = await copyText(contact.id); notify(ok ? '已复制目标 ID。' : '复制失败：剪贴板不可用。', ok ? 'success' : 'error') }, onInfo: () => setMenuInfo(contact) }))),
        h('div', { className: 'wv-notice', style: { marginTop: 12 } },
          h(Icon, { name: 'info', size: 15 }),
          h('span', null, '演示联系人是已验证目标；其他联系人仅用于展示虚构演示项，不会写入真实白名单。'))),
      h(Card, { title: '群聊白名单', desc: '默认没有任何已授权群聊',
        actions: h(Badge, { tone: 'wait' }, groups.length + ' 个演示草稿') },
        groups.length === 0 ? h(Empty, {
          icon: 'shield',
          title: '还没有已授权群聊',
          children: '历史配置里的群 ID 不会自动显示为已授权。新增群聊只保存为前端演示草稿，必须经过真实身份核验后才可能生效。',
          action: h(Button, { variant: 'primary', size: 'sm', onClick: () => setOpen(true) }, h(Icon, { name: 'plus', size: 13 }), '新增授权群聊'),
        }) : h('div', null,
          h('div', { className: 'wv-group-row', style: { color: 'var(--wv-muted)', fontSize: 10.5, paddingTop: 0, paddingBottom: 6 } },
            h('span', null, '群聊'), h('span', null, '状态'), h('span', { className: 'wv-group-optional' }, '@ / 意图'), h('span', { className: 'wv-group-optional' }, '冷却'), h('span', null, '')),
          groups.map((g) => h('div', { className: 'wv-group-row', key: g.id },
            h('div', { style: { minWidth: 0 } }, h('div', { className: 'wv-group-name' }, g.name), h('div', { className: 'wv-group-id' }, g.id)),
            h('div', null, h(Badge, { tone: 'wait' }, '演示草稿 · 未核验')),
            h('div', { className: 'wv-checkline wv-group-optional' }, (g.mention ? '必须 @' : '不要求 @') + ' · ' + (g.explicit ? '明确意图' : '任意')),
            h('div', { className: 'wv-checkline wv-group-optional' }, g.groupCooldown + 's / ' + g.memberCooldown + 's'),
            h(IconButton, { icon: 'x', label: '移除演示草稿', onClick: () => removeGroup(g.id) })))))
    ),
    open ? h(GroupDialog, { form, errors, patchForm, onClose: () => setOpen(false), onSave: save }) : null,
    menuInfo ? h(Modal, { title: menuInfo.name, subtitle: '演示联系人详情', size: 'sm', onClose: () => setMenuInfo(null), footer: h(Button, { onClick: () => setMenuInfo(null) }, '关闭') },
      h('div', { className: 'wv-stack' },
        h('dl', { className: 'wv-kv' }, h('dt', null, '目标'), h('dd', null, menuInfo.id), h('dt', null, '核验'), h('dd', null, menuInfo.verified ? '已验证（演示快照）' : '未核验'), h('dt', null, '触发'), h('dd', null, menuInfo.trigger)),
        h('div', { className: 'wv-notice warn' }, h(Icon, { name: 'lock', size: 15 }), h('span', null, menuInfo.note)))) : null)
}

function GroupDialog({ form, errors, patchForm, onClose, onSave }) {
  return h(Modal, {
    title: '新增授权群聊', subtitle: '演示表单 · 不会核验身份或写入真实白名单', onClose,
    footer: h(React.Fragment, null,
      h(Button, { onClick: onClose }, '取消'),
      h(Button, { variant: 'primary', onClick: onSave }, h(Icon, { name: 'check', size: 14 }), '保存演示草稿')),
  },
    h('div', { className: 'wv-notice', style: { marginBottom: 14 } },
      h(Icon, { name: 'info', size: 15 }),
      h('span', null, '保存后仅加入当前前端草稿，并显示「未核验」。真实群授权必须经过后端身份与白名单校验。')),
    h('div', { className: 'wv-form-grid' },
      h('div', { className: 'wv-field full' },
        h('label', null, '群 ID ', h('span', { className: 'wv-muted' }, '（必填）')),
        h('input', { className: 'wv-input ' + (errors.id ? 'invalid' : ''), value: form.id, placeholder: '例如 group:123456789', onChange: (e) => patchForm('id', e.target.value) }),
        errors.id ? h('span', { className: 'wv-error' }, errors.id) : h('span', { className: 'wv-hint' }, '4–40 位字母、数字、下划线或短横线；不支持通配符。')),
      h('div', { className: 'wv-field full' },
        h('label', null, '群名称 ', h('span', { className: 'wv-muted' }, '（必填）')),
        h('input', { className: 'wv-input ' + (errors.name ? 'invalid' : ''), value: form.name, placeholder: '例如 产品群', onChange: (e) => patchForm('name', e.target.value) }),
        errors.name ? h('span', { className: 'wv-error' }, errors.name) : null),
      h('div', { className: 'wv-field' },
        h('label', null, '真实 @ 要求'),
        h('select', { className: 'wv-select', value: form.mention ? 'yes' : 'no', onChange: (e) => patchForm('mention', e.target.value === 'yes') },
          h('option', { value: 'yes' }, '必须 @ 小鲸鱼'),
          h('option', { value: 'no' }, '不要求 @（不推荐）'))),
      h('div', { className: 'wv-field' },
        h('label', null, '明确语音意图'),
        h('select', { className: 'wv-select', value: form.explicit ? 'yes' : 'no', onChange: (e) => patchForm('explicit', e.target.value === 'yes') },
          h('option', { value: 'yes' }, '必须明确请求语音'),
          h('option', { value: 'no' }, '任意消息（不推荐）'))),
      h('div', { className: 'wv-field' },
        h('label', null, '群冷却（秒）'),
        h('input', { className: 'wv-input ' + (errors.groupCooldown ? 'invalid' : ''), type: 'number', min: 0, max: 3600, value: form.groupCooldown, onChange: (e) => patchForm('groupCooldown', Number(e.target.value)) }),
        errors.groupCooldown ? h('span', { className: 'wv-error' }, errors.groupCooldown) : h('span', { className: 'wv-hint' }, '0–3600 秒')),
      h('div', { className: 'wv-field' },
        h('label', null, '成员冷却（秒）'),
        h('input', { className: 'wv-input ' + (errors.memberCooldown ? 'invalid' : ''), type: 'number', min: 0, max: 86400, value: form.memberCooldown, onChange: (e) => patchForm('memberCooldown', Number(e.target.value)) }),
        errors.memberCooldown ? h('span', { className: 'wv-error' }, errors.memberCooldown) : h('span', { className: 'wv-hint' }, '0–86400 秒'))))
}

const STUDIO_TASK_STORAGE_KEY = 'whale-voice:studio:last-task'
/* 156: wait for the Host's effective generation limit plus a grace so the server's own timeout
 * response can arrive; this is not another fixed limit. */
const STUDIO_GENERATION_GRACE_MS = 10000

function StudioPage({ preview, setPreview, notify, setup, capability }) {
  const patch = (key, value) => setPreview((p) => ({ ...p, [key]: value }))
  const hostBridge = window.__WHALE_SETUP__ || null
  const [catalog, setCatalog] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [downloading, setDownloading] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [genError, setGenError] = React.useState('')
  const [genEnabled, setGenEnabled] = React.useState(null)
  const [catalogError, setCatalogError] = React.useState(false)
  const [assemblyFailure, setAssemblyFailure] = React.useState('')
  const [restoreError, setRestoreError] = React.useState('')
  const [restoreMissing, setRestoreMissing] = React.useState('')
  const [savedResults, setSavedResults] = React.useState(null)
  const [resultsError, setResultsError] = React.useState('')
  const [resultsTick, setResultsTick] = React.useState(0)
  React.useEffect(() => {
    if (!hostBridge) {
      setGenEnabled(false)
      return undefined
    }
    let live = true
    hostBridge.getGenerationCatalog().then((value) => {
      if (!live) return
      if (!value || value.ok !== true) {
        const notEnabled = Boolean(value && value.error === 'generation_not_enabled')
        if (!notEnabled) {
          // Any other failure is a failed read of the capability, never a not-enabled or still-checking answer.
          setGenEnabled(null)
          setCatalogError(true)
          return
        }
        // 164: the same 503 covers a configured generation that failed to start. Until the Host says
        // which one it is the page stays in its real waiting state instead of claiming "not configured".
        setGenEnabled(null)
        setCatalogError(false)
        hostBridge.getGenerationAssemblyStatus().then((state) => {
          if (!live) return
          if (state.ok !== true) { setCatalogError(true); return }
          setAssemblyFailure(state.state === 'FAILED' ? state.messageZh : '')
          setGenEnabled(false)
        }, () => { if (live) setCatalogError(true) })
        return
      }
      setCatalogError(false)
      setAssemblyFailure('')
      setGenEnabled(true)
      setCatalog(value)
      const voices = Array.isArray(value.voices) ? value.voices : []
      const first = voices[0] || null
      if (first) {
        setPreview((current) => voices.some((voice) => voice.id === current.voice)
          ? current
          : { ...current, voice: first.id, language: first.languages && first.languages[0] ? first.languages[0] : current.language })
      }
    }).catch(() => {
      // The production bridge rejects on a network failure or timeout instead of returning an object.
      if (!live) return
      setGenEnabled(null)
      setCatalogError(true)
    })
    let storedTaskId = ''
    try { storedTaskId = window.localStorage.getItem(STUDIO_TASK_STORAGE_KEY) || '' } catch { storedTaskId = '' }
    if (storedTaskId) {
      hostBridge.getGenerationStatus(storedTaskId).then((value) => {
        if (!live) return
        if (!value || value.ok !== true) {
          // 164 v1.2: this 503 only says the generation object is absent; it must not override the
          // assembly answer that is still pending. The assembly query above decides 未启用 / 启动失败.
          if (value && value.error === 'generation_not_enabled') return
          // 163: the Host explicitly answering "this task is not in the current storage location" is a
          // definite fact, not a failed request; it must not be shown as a retryable read failure.
          if (value && value.code === 'PRESET_GENERATION_STATUS_REJECTED' && value.detail === 'not found') {
            setRestoreMissing(storedTaskId)
            return
          }
          // A rejected status read (159) or any other failure is not "no saved result": keep the known
          // task id and say that this result could not be read.
          setRestoreError(storedTaskId)
          return
        }
        setResult(value)
      }).catch(() => { if (live) setRestoreError(storedTaskId) })
    }
    return () => { live = false }
  }, [hostBridge])
  React.useEffect(() => {
    if (!hostBridge || genEnabled !== true) {
      setSavedResults(null)
      return undefined
    }
    let live = true
    hostBridge.getGenerationResults().then((value) => {
      if (!live) return
      if (!value || value.ok !== true) {
        setSavedResults(null)
        setResultsError(value && value.error === 'generation_not_enabled' ? '' : 'RESULTS_UNAVAILABLE')
        return
      }
      setResultsError('')
      setSavedResults(Array.isArray(value.results) ? value.results : [])
    }).catch(() => {
      if (!live) return
      setSavedResults(null)
      setResultsError('RESULTS_UNAVAILABLE')
    })
    return () => { live = false }
  }, [hostBridge, genEnabled, resultsTick])
  const voices = catalog && Array.isArray(catalog.voices) && catalog.voices.length
    ? catalog.voices
    : [{ id: 'whale-v1', label: 'whale-v1', languages: ['zh-CN'] }]
  const selectedVoice = voices.find((voice) => voice.id === preview.voice) || voices[0]
  const canDownload = Boolean(hostBridge)
  const canDownloadResult = canDownload && result && result.readable === true && result.taskId
  const canListResults = Boolean(hostBridge)
  const languages = genEnabled === true && selectedVoice && Array.isArray(selectedVoice.languages) ? selectedVoice.languages : ['zh-CN', 'en-US']
  const textLimit = genEnabled === true && catalog && Number.isInteger(catalog.textLimit) ? catalog.textLimit : 200
  const generationTimeoutMs = genEnabled === true && catalog && Number.isInteger(catalog.generationTimeoutMs)
    ? catalog.generationTimeoutMs + STUDIO_GENERATION_GRACE_MS
    : null
  const generate = async () => {
    if (!hostBridge || genEnabled !== true || busy) return
    const text = String(preview.text || '').trim()
    if (!text) { notify('请先输入要生成的短文本。', 'error'); return }
    if (text.length > textLimit) { notify('文本超过生成上限（' + textLimit + ' 字）。', 'error'); return }
    setBusy(true); setGenError('')
    try {
      const value = await hostBridge.generatePreset({
        text,
        voiceId: selectedVoice.id,
        language: languages.includes(preview.language) ? preview.language : languages[0],
      }, generationTimeoutMs === null ? undefined : { timeoutMs: generationTimeoutMs })
      if (!value || value.ok !== true) {
        if (value && value.error === 'generation_not_enabled') {
          setGenEnabled(false)
          notify('生成未启用：当前 Host 未配置生成运行对象。', 'error')
          return
        }
        if (value && value.error === 'generation_unconfirmed') {
          setGenError('STUDIO_GENERATION_UNCONFIRMED')
          notify('生成结果未确认：等待超过当前有效生成时限；不会自动重试。稍后刷新可在「已保存的生成结果」查看是否已保存。', 'error')
          return
        }
        const code = (value && (value.code || value.error)) || 'STUDIO_GENERATION_REJECTED'
        setGenError(code)
        notify('生成未完成：' + code, 'error')
        return
      }
      const checked = await hostBridge.getGenerationStatus(value.taskId).catch(() => null)
      setResult(checked && checked.ok === true ? checked : value)
      try { window.localStorage.setItem(STUDIO_TASK_STORAGE_KEY, value.taskId) } catch {}
      setResultsTick((x) => x + 1)
      notify('生成已由原任务保存；实际执行来源本页无法核实。', 'success')
    } catch {
      setGenError('STUDIO_GENERATION_UNAVAILABLE')
      notify('正式 Host 生成调用异常；未自动重试。', 'error')
    } finally {
      setBusy(false)
    }
  }
  const download = async () => {
    if (!canDownloadResult || downloading) return
    setDownloading(true)
    try {
      const value = await hostBridge.downloadGenerationResult(result.taskId)
      if (!value || value.ok !== true || !value.blob) {
        notify('无法下载：该任务当前没有可读取的已保存结果。', 'error')
        return
      }
      const url = URL.createObjectURL(value.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = value.fileName || 'whale-voice-result.wav'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      notify('已开始下载原任务保存的音频。', 'success')
    } catch {
      notify('下载失败：无法读取该任务已保存的结果。', 'error')
    } finally {
      setDownloading(false)
    }
  }
  const selectResult = (item) => {
    setResult(item)
    setGenError('')
  }
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / STUDIO',
      title: '音色中心',
      description: 'whale-v1 是小鲸鱼目前唯一的专属音色。生产播放与微信发送未接入；下方“预设音色生成”经正式 Host 接口提交并由原任务保存。本次实际使用的是隔离 Fixture 还是已应用的本地运行路径与模型，本页无法核实，也不代表真实模型已验证可用。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: 'demo' }, genEnabled === true ? '来源未确认' : genEnabled === false ? (assemblyFailure ? '启动失败' : '未启用') : catalogError ? '读取失败' : '检查中'),
        h(Button, { disabled: true, title: '生产播放未接入' }, h(Icon, { name: 'play', size: 14 }), '等待语音服务接入')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      catalogError
        ? h('span', { 'data-testid': 'studio-generation-catalog-error' }, '无法读取生成能力：本次请求失败或超时。这不代表未启用，页面不会生成或保存；请稍后刷新重试。')
        : assemblyFailure
          ? h('span', { 'data-testid': 'studio-generation-assembly-message' }, '生成未能启动：' + assemblyFailure)
          : h('span', null, genEnabled === true
            ? '来源未确认：本页经正式 Host 接口提交生成，结果由原任务保存。实际使用的是隔离 Fixture 还是已应用的本地运行路径与模型，本页无法核实，也不代表真实模型已验证可用；本页不播放，也不发送微信。'
            : genEnabled === false
              ? '生成未启用：当前 Host 未配置生成运行对象；页面不会生成、不会调用真实模型。'
              : '正在检查生成能力…')),
    h(ConfigReadout, { setup }),
    h(CapabilityPanel, {
      capability,
      groups: ['senderTts', 'qwen'],
      title: '音色与运行状态 · 真实只读能力',
      desc: 'TTS 配置只在 Sender 服务启动时读取，没有运行时更新接口；Qwen 只提供健康观察，不代表保存值已生效。',
    }),
    h('div', { className: 'wv-studio' },
      h('section', { className: 'wv-card wv-studio-profile' },
        h('div', { className: 'wv-studio-hero' },
          h('div', { className: 'wv-studio-title' },
            h('div', { className: 'wv-row' }, h('h2', null, 'whale-v1'), h(Badge, { tone: 'accent' }, '已有音色')),
            h('p', null, '小鲸鱼专属声音 · Qwen3-TTS 1.7B Base'),
            h('p', { style: { marginTop: 7 } }, '由参考音频克隆而来，保留小鲸鱼现有的语气与亲昵感。')),
          h(WaveBars, { count: 44, seed: 11 })),
        h('div', { className: 'wv-studio-meta' },
          h('div', { className: 'wv-metaitem' }, h('span', null, '模型'), h('strong', null, 'Qwen3-TTS 1.7B Base')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '创建方式'), h('strong', null, '参考音频克隆')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '版本'), h('strong', null, 'v1.0 · 已就绪')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '参考音频'), h('strong', null, '265 KB · 已锁定')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '语言'), h('strong', null, '中文（普通话）')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '状态'), h('strong', null, '演示 · 不合成'))),
        h('div', { style: { padding: '0 20px 18px' } },
          h('div', { className: 'wv-versions' },
            h('div', { className: 'wv-version on' }, h('div', null, h('strong', null, 'whale-v1'), h('span', null, '当前 · 小鲸鱼专属')), h(Badge, { tone: 'backend' }, '可用')),
            h('div', { className: 'wv-version' }, h('div', null, h('strong', null, 'whale-v2'), h('span', null, '未来版本 · 未训练')), h(Badge, { tone: 'wait' }, '计划中')),
            h('div', { className: 'wv-version' }, h('div', null, h('strong', null, '自定义音色'), h('span', null, '未来功能')), h(Badge, { tone: 'wait' }, '未接入'))))),
      h('section', { className: 'wv-card pad wv-preview' },
        h('div', { className: 'wv-card-title' },
          h('div', null, h('h2', null, '预设音色生成'), h('p', null, genEnabled === true ? '选择已有预设音色并输入短文本；结果由原任务保存，刷新后仍可查询。' : '通过正式 Host 接口提交短文本与已有预设音色。')),
          h(Badge, { tone: 'wait' }, genEnabled === true ? '来源未确认' : genEnabled === false ? (assemblyFailure ? '启动失败' : '未启用') : '检查中')),
        h('div', { className: 'wv-field' },
          h('label', null, '试听文本'),
          h('textarea', { className: 'wv-textarea', value: preview.text, onChange: (e) => patch('text', e.target.value), maxLength: textLimit, disabled: genEnabled !== true, 'aria-label': '试听文本' }),
          h('span', { className: 'wv-hint' }, preview.text.length + ' / ' + textLimit)),
        h('div', { className: 'wv-preview-controls' },
          h('div', { className: 'wv-field' }, h('label', null, '音色'), h('select', { className: 'wv-select', value: preview.voice, onChange: (e) => patch('voice', e.target.value), disabled: genEnabled !== true, 'aria-label': '音色' }, voices.map((voice) => h('option', { key: voice.id, value: voice.id }, voice.label === voice.id ? voice.label : voice.label + ' · ' + voice.id)))),
          h('div', { className: 'wv-field' }, h('label', null, '语言'), h('select', { className: 'wv-select', value: preview.language, onChange: (e) => patch('language', e.target.value), disabled: genEnabled !== true, 'aria-label': '语言' }, languages.map((code) => h('option', { key: code, value: code }, code === 'zh-CN' ? '中文' : code === 'en-US' ? 'English' : code)))),
          h('div', { className: 'wv-field' }, h('label', null, '情绪 ', h(Badge, { tone: 'wait' }, '生成固定中性')), h('select', { className: 'wv-select', value: preview.emotion, onChange: (e) => patch('emotion', e.target.value), disabled: true, 'aria-label': '情绪' }, EMOTIONS.map((x) => h('option', { key: x.id, value: x.id }, x.zh + ' / ' + x.en))))),
        h('div', { className: 'wv-player' },
          h('div', { className: 'wv-player-wave', 'aria-label': '示意波形，非真实音频' }, h(WaveBars, { count: 58, seed: 5 }), h('span', { className: 'playhead' })),
          h('div', { className: 'wv-player-controls' },
            h(IconButton, { icon: 'play', label: '播放（未接入）', disabled: true }),
            h('div', { className: 'wv-progress', 'aria-hidden': true }, h('i', null)),
            h('span', { className: 'wv-time' }, '0:00 / --:--'),
            h('div', { className: 'wv-volume' }, h(Icon, { name: 'volume', size: 14 }), h('input', { type: 'range', min: 0, max: 100, value: preview.volume, disabled: true, onChange: (e) => patch('volume', Number(e.target.value)), 'aria-label': '音量（未接入）' })))),
        result
          ? h('div', { className: 'wv-empty', 'data-testid': 'studio-generation-result', style: { minHeight: 96, alignItems: 'flex-start' } },
            h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'check', size: 18 })),
            h('strong', { 'data-testid': 'studio-generation-state' }, result.state === 'SAVED' ? '原任务已保存' : '原任务状态：' + result.state),
            h('p', null, '任务 ', h('code', { 'data-testid': 'studio-generation-task' }, result.taskId || '—')),
            h('p', null, '产物 ', h('code', { 'data-testid': 'studio-generation-artifact' }, result.artifactRef || '—')),
            result.byteLength ? h('p', null, '大小 ' + result.byteLength + ' bytes' + (result.sha256 ? ' · SHA-256 ' + result.sha256 : '')) : null,
            h('p', null, h(Badge, { tone: 'demo' }, '来源未确认'), ' 这是所选原任务的保存事实；下载只读取已保存的字节；实际模型来源无法核实，不代表真实模型可用。'),
            h('div', { className: 'wv-row', style: { marginTop: 8 } },
              h(Button, {
                onClick: () => { void download() },
                disabled: !canDownloadResult || downloading,
                title: canDownloadResult ? '下载该任务已保存的 WAV 原文件' : '当前没有可读取的已保存结果',
                'data-testid': 'studio-generation-download',
              }, h(Icon, { name: 'download', size: 14 }), downloading ? '下载中…' : '下载已保存音频'),
              canDownloadResult ? null : h('span', { className: 'wv-muted', 'data-testid': 'studio-generation-download-unavailable' }, '当前没有可读取的已保存结果，不能下载。')))
          : genEnabled === false
            ? (assemblyFailure
              ? h('div', { className: 'wv-empty', 'data-testid': 'studio-generation-assembly-error', style: { minHeight: 96, alignItems: 'flex-start' } },
                h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'alert', size: 18 })),
                h('strong', null, '生成未能启动'),
                h('p', null, assemblyFailure),
                h('p', { className: 'wv-muted' }, '本页不会自动修复、保存、应用或启动；修正入口以以上说明为准，正常生成仍不可用。'))
              : h('div', { className: 'wv-empty', 'data-testid': 'studio-generation-disabled', style: { minHeight: 96 } },
                h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'lock', size: 18 })),
                h('strong', null, '生成未启用'),
                h('p', null, '当前 Host 未配置生成运行对象；不会生成、不会调用真实模型。配置由部署方决定，本页不会自行启用。')))
            : restoreMissing
              ? h('div', { className: 'wv-empty', 'data-testid': 'studio-generation-restore-missing', style: { minHeight: 96, alignItems: 'flex-start' } },
                h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'alert', size: 18 })),
                h('strong', null, '当前保存位置未找到这项任务'),
                h('p', null, '任务 ', h('code', null, restoreMissing), '：当前保存位置与作用域里没有找到这条旧引用。这不代表它从未保存，也不代表其他保存位置没有；本页不会删除产物、不会搜索其他位置，也不会重新生成。'))
              : restoreError
                ? h('div', { className: 'wv-empty', 'data-testid': 'studio-generation-restore-error', style: { minHeight: 96, alignItems: 'flex-start' } },
                  h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'alert', size: 18 })),
                  h('strong', null, '无法读取上次保存的结果'),
                  h('p', null, '任务 ', h('code', null, restoreError), '：本次请求失败或超时；这不代表没有保存。刷新可重试，不会重新生成或保存。'))
                : catalogError
                  ? h('div', { className: 'wv-empty', 'data-testid': 'studio-generation-unavailable', style: { minHeight: 96 } },
                    h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'alert', size: 18 })),
                    h('strong', null, '暂时无法读取生成能力'),
                    h('p', null, '本次请求失败或超时；这不代表未启用。页面不会生成、保存或删除任何内容，请稍后刷新重试。'))
                  : h('div', { className: 'wv-empty', style: { minHeight: 96 } },
                    h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'wave', size: 18 })),
                    h('strong', null, genEnabled === null ? '正在检查生成能力…' : '还没有生成结果'),
                    h('p', null, genEnabled === null ? '正在通过正式 Host 接口读取预设音色与生成能力。' : '输入短文本并选择预设音色后点击生成；结果由原任务保存，不播放、不发送。')),
        genError
          ? h('div', { className: 'wv-notice warn', 'data-testid': 'studio-generation-error' }, h(Icon, { name: 'alert', size: 15 }), h('span', null,
            genError === 'STUDIO_GENERATION_UNCONFIRMED'
              ? '生成结果未确认：没有收到服务端结果，不能判定成功或失败；不会自动重试。稍后刷新可在「已保存的生成结果」查看。'
              : '生成失败：' + genError + '；未自动重试。'))
          : null,
        h('div', { className: 'wv-row wv-wrap' },
          h(Button, { onClick: generate, disabled: genEnabled !== true || busy || !String(preview.text || '').trim(), title: genEnabled === false ? (assemblyFailure ? '启动失败：生成不可用' : '生成未启用') : undefined }, h(Icon, { name: 'spark', size: 14 }), busy ? '生成中…' : '生成并保存'),
          h(Button, { variant: 'ghost', onClick: () => notify('本页经正式 Host 接口提交生成；实际执行来源本页无法核实，生产播放与微信发送未接入。', 'info') }, '了解限制')))),
    canListResults && genEnabled === true
      ? h('section', { className: 'wv-card pad', style: { marginTop: 14 }, 'data-testid': 'studio-generation-results' },
        h('div', { className: 'wv-card-title' },
          h('div', null,
            h('h2', null, '已保存的生成结果'),
            h('p', null, '同一当前配置保存位置内、属于当前生成范围的原任务。选择一条可查看并按原字节下载它已保存的 WAV；选择与下载不会重新生成、再次保存或修改原产物。')),
          h(Badge, { tone: 'wait' }, savedResults === null ? '读取中' : savedResults.length + ' 项')),
        resultsError
          ? h('div', { className: 'wv-notice warn', 'data-testid': 'studio-generation-results-error' }, h(Icon, { name: 'alert', size: 15 }), h('span', null, '无法读取已保存的生成结果；这不代表没有结果，请稍后重试。'))
          : savedResults === null
            ? h('div', { className: 'wv-empty', style: { minHeight: 96 }, 'data-testid': 'studio-generation-results-loading' },
              h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'wave', size: 18 })),
              h('strong', null, '正在读取已保存的生成结果…'),
              h('p', null, '通过正式 Host 接口读取同一保存位置内的原任务与产物事实。'))
            : savedResults.length === 0
              ? h('div', { className: 'wv-empty', style: { minHeight: 96 }, 'data-testid': 'studio-generation-results-empty' },
                h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'wave', size: 18 })),
                h('strong', null, '还没有已保存的生成结果'),
                h('p', null, '在当前配置的保存位置内完成一次生成后，结果会出现在这里；这里只列出本功能的生成结果，不包含其他范围或翻唱产物。'))
              : h('div', { className: 'wv-results', 'data-testid': 'studio-generation-result-list' }, savedResults.map((item) => h('button', {
                key: item.taskId,
                type: 'button',
                className: 'wv-result' + (result && result.taskId === item.taskId ? ' on' : ''),
                'data-testid': 'studio-generation-result-select',
                'data-task-id': item.taskId,
                'aria-pressed': Boolean(result && result.taskId === item.taskId),
                onClick: () => selectResult(item),
              },
                h('span', { className: 'wv-result-head' },
                  h('strong', null, item.state === 'SAVED' ? '原任务已保存' : '原任务状态：' + item.state),
                  h('span', null, item.readable === true ? '可下载原字节' : '产物当前不可读取')),
                h('code', null, item.taskId),
                h('span', null, '产物 ' + (item.artifactRef || '—') + (item.byteLength ? ' · ' + item.byteLength + ' bytes' : '') + (item.createdAt ? ' · 保存于 ' + item.createdAt : ''))))))
      : null
  )
}

function EmotionsPage({ emotion, setEmotion, notify }) {
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / EMOTION',
      title: '情绪系统',
      description: '为未来的情绪表达预留控制层。当前 Qwen3-TTS Base 的克隆音色不保证精确、可复现的情绪控制。',
      actions: h(Badge, { tone: 'wait' }, '实验性 · 等待后端支持'),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '情绪选择目前只影响前端演示状态，不会改变真实 TTS 生成，也不会修改人格卡、参考音频或 VoiceDesign。')),
    h('div', { className: 'wv-grid two', style: { alignItems: 'start' } },
      h(Card, { title: '情绪预设', desc: '选择一种希望小鲸鱼表达的语气', actions: h(Badge, { tone: 'demo' }, '演示选择') },
        h('div', { className: 'wv-emotions' }, EMOTIONS.map((e) => h('button', {
          key: e.id, type: 'button', className: 'wv-emotion', 'aria-pressed': emotion === e.id,
          onClick: () => { setEmotion(e.id); notify('已选择「' + e.zh + '」演示情绪；真实生成未改变。', 'info') },
        },
          h('span', { className: 'wv-emotion-icon' }, h(Icon, { name: e.icon, size: 16 })),
          h('strong', null, e.zh + ' / ' + e.en),
          h('span', null, e.desc),
          emotion === e.id ? h(Badge, { tone: 'accent' }, '已选择') : null)))),
      h('div', { className: 'wv-stack' },
        h(Card, { title: '情绪强度', desc: '未来可按消息调整，当前不可用' },
          h('div', { className: 'wv-setting', style: { borderBottom: 0 } },
            h('div', { className: 'wv-setting-copy' }, h('strong', null, '强度'), h('p', null, '实验性参数；真实模型暂无稳定映射。')),
            h('div', { className: 'wv-setting-control' },
              h('input', { className: 'wv-slider', type: 'range', min: 0, max: 100, value: 55, disabled: true, 'aria-label': '情绪强度（未接入）' }),
              h('span', { className: 'wv-rangeval' }, '55%'))),
          h('div', { className: 'wv-notice' }, h(Icon, { name: 'info', size: 15 }), h('span', null, '不承诺“立即生效”，等待后端提供可验证的情绪控制接口。'))),
        h(Card, { title: '自动情绪判断', desc: '从上下文推断，而不是硬编码' },
          h('div', { className: 'wv-setting' },
            h('div', { className: 'wv-setting-copy' }, h('strong', null, '自动判断'), h('p', null, '未来功能；本轮不会读取聊天内容。')),
            h('div', { className: 'wv-setting-control' }, h(Badge, { tone: 'wait' }, '未接入'), h(Toggle, { checked: false, onChange: () => {}, disabled: true, label: '自动情绪判断' }))),
          h('div', { className: 'wv-setting', style: { borderBottom: 0 } },
            h('div', { className: 'wv-setting-copy' }, h('strong', null, '与人格卡联动'), h('p', null, '不修改人格卡、记忆或 Prompt Cache。')),
            h('div', { className: 'wv-setting-control' }, h(Badge, { tone: 'wait' }, '未接入')))),
        h(Card, { title: '场景映射', desc: '按场景分配情绪', actions: h(Badge, { tone: 'wait' }, '空状态') },
          h(Empty, { icon: 'target', title: '还没有场景规则', children: '例如「晚安 → 温柔」「庆祝 → 开心」。等待后端支持后再配置。' })))))
}

function ActivityPage({ notify, openActivity }) {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [kind, setKind] = React.useState('all')
  const [tick, setTick] = React.useState(0)
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return MOCK_ACTIVITIES.filter((a) => {
      if (status !== 'all' && a.status !== status) return false
      if (kind !== 'all' && a.kind !== kind) return false
      if (!q) return true
      return (a.id + ' ' + a.target + ' ' + a.voice + ' ' + a.status + ' ' + a.error).toLowerCase().includes(q)
    })
  }, [query, status, kind, tick])
  const refresh = () => { setTick((x) => x + 1); notify('演示任务已刷新；未读取真实队列。', 'success') }
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / ACTIVITY',
      title: '任务与日志',
      description: '查看语音任务的生命周期、发送状态与错误诊断。本页全部为演示数据，不读取真实聊天内容。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: 'demo' }, 'Mock 记录'),
        h(Button, { onClick: refresh }, h(Icon, { name: 'refresh', size: 14 }), '刷新演示')),
    }),
    h('div', { className: 'wv-notice', style: { marginBottom: 14 } },
      h(Icon, { name: 'info', size: 15 }),
      h('span', null, 'SENT_LOCAL 只表示本地观察到新气泡，不等同于对方已经收到。UNKNOWN 表示结果不确定，系统不会自动重发。')),
    h('section', { className: 'wv-card', style: { overflow: 'hidden' } },
      h('div', { className: 'wv-toolbar' },
        h('div', { className: 'wv-search' }, h(Icon, { name: 'search', size: 14 }), h('input', { className: 'wv-input withicon', placeholder: '搜索目标、ID 或错误…', value: query, onChange: (e) => setQuery(e.target.value), 'aria-label': '搜索任务' })),
        h('div', { className: 'wv-filters' },
          h('select', { className: 'wv-select', value: status, onChange: (e) => setStatus(e.target.value), 'aria-label': '状态筛选', style: { width: 132 } },
            h('option', { value: 'all' }, '全部状态'),
            ['SENT_LOCAL', 'FAILED', 'UNKNOWN', 'QUEUED', 'WAITING_FOR_UI', 'REJECTED'].map((s) => h('option', { key: s, value: s }, STATUS[s] ? STATUS[s].label : s))),
          h('select', { className: 'wv-select', value: kind, onChange: (e) => setKind(e.target.value), 'aria-label': '会话类型筛选', style: { width: 112 } },
            h('option', { value: 'all' }, '全部会话'), h('option', { value: '私聊' }, '私聊'), h('option', { value: '群聊' }, '群聊')),
          h('span', { className: 'wv-muted', style: { fontSize: 11 } }, filtered.length + ' 条'))),
      filtered.length === 0 ? h('div', { style: { padding: 16 } }, h(Empty, { icon: 'search', title: '没有匹配的演示任务', children: '尝试清空搜索或切换筛选条件。' })) :
        h('div', { className: 'wv-tablewrap' }, h('table', { className: 'wv-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Request'), h('th', null, '时间'), h('th', null, '目标'), h('th', null, '类型'), h('th', null, '音色'), h('th', null, '合成'), h('th', null, '音频'), h('th', null, '状态'), h('th', null, '错误'))),
          h('tbody', null, filtered.map((a) => h('tr', {
            key: a.id, tabIndex: 0, onClick: () => openActivity(a),
            onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openActivity(a) } },
          },
            h('td', { className: 'id' }, a.id), h('td', { className: 'num' }, a.time), h('td', null, a.target), h('td', null, a.kind), h('td', null, a.voice),
            h('td', { className: 'num' }, a.synth), h('td', { className: 'num' }, a.audio), h('td', null, h(Status, { status: a.status })),
            h('td', { className: 'id' }, a.error || '—'))))))),
    h('div', { style: { height: 14 } }),
    h('div', { className: 'wv-grid two' },
      h(Card, { title: '状态说明', desc: '统一语义，而不是只靠颜色' },
        h('div', { className: 'wv-stack' },
          h('div', { className: 'wv-row' }, h(Status, { status: 'SENT_LOCAL' }), h('span', { className: 'wv-small wv-muted' }, '本地已观察气泡，不代表服务器或对方已确认接收。')),
          h('div', { className: 'wv-row' }, h(Status, { status: 'FAILED' }), h('span', { className: 'wv-small wv-muted' }, '任务失败，可查看错误详情；是否已发生副作用需看阶段。')),
          h('div', { className: 'wv-row' }, h(Status, { status: 'UNKNOWN' }), h('span', { className: 'wv-small wv-muted' }, '发送结果不确定，禁止自动补发文字或语音。')),
          h('div', { className: 'wv-row' }, h(Status, { status: 'REJECTED' }), h('span', { className: 'wv-small wv-muted' }, '白名单、权限或测试名额在入队前拒绝。')))),
      h(Card, { title: '错误诊断', desc: '演示错误码，可复制到排查记录', actions: h(Badge, { tone: 'demo' }, '只读') },
        h('div', { className: 'wv-stack' },
          ['not_foreground', 'sender_timeout', 'group_not_allowed', 'cancel_unconfirmed'].map((e) => h('div', { key: e, className: 'wv-between' },
            h('code', { className: 'wv-code' }, e),
            h(Button, { variant: 'ghost', size: 'sm', onClick: async () => { const ok = await copyText(e); notify(ok ? '已复制错误码。' : '复制失败：剪贴板不可用。', ok ? 'success' : 'error') } }, h(Icon, { name: 'copy', size: 12 }), '复制')))))))
}

function AdvancedPage({ notify, setup, capability, onSetup, onComponents }) {
  const diag = React.useMemo(() => JSON.stringify({
    plugin: 'dsh-whale-voice', version: '0.1.0', mode: 'mock',
    bridge: 'r4 (demo)', target: 'private:demo-1001', voice: 'whale-v1',
    focusGuard: 'foreground-required', configWrite: false,
  }, null, 2), [])
  const copyDiag = async () => {
    const ok = await copyText(diag)
    notify(ok ? '诊断摘要已复制。' : '复制失败：剪贴板不可用。', ok ? 'success' : 'error')
  }
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / ADVANCED',
      title: '高级设置',
      description: '只读的技术信息与诊断入口。所有真实服务控制操作均未接入，不会启动或结束现有进程。',
      actions: h(React.Fragment, null, h(Badge, { tone: 'wait' }, '只读 · 未接入'), h(Button, { onClick: copyDiag }, h(Icon, { name: 'copy', size: 14 }), '复制诊断摘要')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'lock', size: 15 }),
      h('span', null, '本页不会写入配置、不会启动 Qwen、不会结束进程。数值为演示占位，真实值需等待后端接入。')),
    h(ConfigReadout, { setup }),
    h(CapabilitySummary, { capability }),
    h(CapabilityPanel, {
      capability,
      title: '全部配置面 · 技术只读状态',
      desc: '每个 Surface 独立声明读取时机、热更新、重启要求、保存能力、授权与生效证据；未知保持未知。',
      detailed: true,
      showComponents: true,
    }),
    h('div', { className: 'wv-adv-grid' },
      h(Card, { title: '语音引擎', desc: 'Qwen3-TTS Provider', actions: h(Badge, { tone: 'demo' }, '演示占位') },
        h('dl', { className: 'wv-kv' }, ADVANCED.engine.map(([k, v], i) => h(React.Fragment, { key: i }, h('dt', null, k), h('dd', null, v))))),
      h(Card, { title: 'Voice Sender', desc: '桌面音频执行器', actions: h(Badge, { tone: 'demo' }, '演示占位') },
        h('dl', { className: 'wv-kv' }, ADVANCED.sender.map(([k, v], i) => h(React.Fragment, { key: i }, h('dt', null, k), h('dd', null, v))))),
      h(Card, { title: 'WeChatAgent', desc: 'Bridge 与配置映射', actions: h(Badge, { tone: 'demo' }, '演示占位') },
        h('dl', { className: 'wv-kv' }, ADVANCED.wechat.map(([k, v], i) => h(React.Fragment, { key: i }, h('dt', null, k), h('dd', null, v))))),
      h(Card, { title: '安装与组件', desc: '首次安装向导与组件生命周期入口', actions: h(Badge, { tone: setup && setup.available ? 'accent' : 'wait' }, setup && setup.available ? 'Core 已连接' : 'Core 未连接') },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '首次安装向导', desc: '连接微信助手、安装语音发送器、选择 TTS、完成检查' },
            h(Button, { onClick: onSetup }, '打开向导')),
          h(SettingRow, { title: '组件管理', desc: '检测 WeChatAgent、Voice Sender 与 TTS 状态' },
            h(Button, { variant: 'ghost', onClick: onComponents }, '管理组件'))),
        h('div', { className: 'wv-notice', style: { marginTop: 10 } },
          h(Icon, { name: 'lock', size: 14 }),
          h('span', null, '向导不会直接执行系统命令；安装、升级、驱动与微信操作均需要 Core 和你的单独确认。'))),
      h(Card, { title: '开发与诊断', desc: '前端版本与 Mock 说明', actions: h(Badge, { tone: 'demo' }, 'Mock') },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '前端版本', desc: 'dsh-whale-voice' }, h('span', { className: 'wv-mono' }, 'v0.1.0')),
          h(SettingRow, { title: '构建信息', desc: 'Client-only bundle · plain JS' }, h('span', { className: 'wv-mono' }, 'r1 / mock')),
          h(SettingRow, { title: '配置格式验证', desc: '等待配置管理 API 接入' }, h(Button, { disabled: true, title: '未接入' }, '验证')),
          h(SettingRow, { title: '调试日志', desc: '不会写入真实日志' }, h(Toggle, { checked: false, onChange: () => {}, disabled: true, label: '调试日志' }))),
        h('pre', { className: 'wv-diag', style: { marginTop: 12 } }, diag),
        h('div', { className: 'wv-row wv-wrap', style: { marginTop: 10 } },
          h(Button, { onClick: copyDiag }, h(Icon, { name: 'copy', size: 14 }), '复制摘要'),
          h(Button, { variant: 'ghost', onClick: () => notify('没有启动或停止任何真实服务。', 'info') }, '安全说明')))
    ))
}
