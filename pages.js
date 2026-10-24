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

function OverviewPage({ settings, setSetting, setPage, notify, openService, openActivity, setup, onSetup, onComponents }) {
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
        h('p', null, 'Qwen3-TTS · whale-v1 · 私聊演示联系人。当前是前端演示环境，服务状态与参数均为 Mock，不写入生产配置。'),
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
      h('span', { className: 'wv-section-note' }, '只读演示，不请求真实服务')),
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

function SettingsPage({ settings, setSetting, dirty, saveSettings, resetSettings, notify, setup }) {
  const num = (v) => Number(v)
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / SETTINGS',
      title: '语音设置',
      description: '日常使用的安全配置。所有修改只存在于当前前端演示状态，不会写入生产 JSON 或触发真实语音。',
      actions: h(React.Fragment, null,
        dirty ? h(Badge, { tone: 'demo' }, '有未保存修改') : h(Badge, { tone: 'backend' }, '已同步演示草稿'),
        h(Button, { onClick: resetSettings, disabled: !dirty }, '恢复默认'),
        h(Button, { variant: 'primary', onClick: saveSettings, disabled: !dirty }, h(Icon, { name: 'check', size: 14 }), '保存演示')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '演示模式：开关只改变当前页面状态。真实语音开关、白名单与 Bridge 配置均不会被修改。')),
    h(ConfigReadout, { setup }),
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

function SafetyPage({ settings, setup }) {
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

function PermissionsPage({ contacts, setContacts, groups, addGroup, removeGroup, notify, setup }) {
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

function StudioPage({ preview, setPreview, notify, setup }) {
  const patch = (key, value) => setPreview((p) => ({ ...p, [key]: value }))
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / STUDIO',
      title: '音色中心',
      description: 'whale-v1 是小鲸鱼目前唯一的专属音色。试听面板为前端演示，不调用真实 Qwen API。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: 'demo' }, '试听未接入'),
        h(Button, { disabled: true, title: '等待语音服务接入' }, h(Icon, { name: 'play', size: 14 }), '等待语音服务接入')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '本轮不合成真实音频。生成与播放按钮保持禁用；下方波形为示意，不代表真实音频。')),
    h(ConfigReadout, { setup }),
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
          h('div', null, h('h2', null, '试听面板'), h('p', null, '演示文本与参数不会发送到 Qwen')),
          h(Badge, { tone: 'wait' }, 'Mock')),
        h('div', { className: 'wv-field' },
          h('label', null, '试听文本'),
          h('textarea', { className: 'wv-textarea', value: preview.text, onChange: (e) => patch('text', e.target.value), maxLength: 300, 'aria-label': '试听文本' }),
          h('span', { className: 'wv-hint' }, preview.text.length + ' / 300')),
        h('div', { className: 'wv-preview-controls' },
          h('div', { className: 'wv-field' }, h('label', null, '音色'), h('select', { className: 'wv-select', value: preview.voice, onChange: (e) => patch('voice', e.target.value) }, h('option', { value: 'whale-v1' }, 'whale-v1'))),
          h('div', { className: 'wv-field' }, h('label', null, '语言'), h('select', { className: 'wv-select', value: preview.language, onChange: (e) => patch('language', e.target.value) }, h('option', { value: 'zh-CN' }, '中文'), h('option', { value: 'en-US' }, 'English'))),
          h('div', { className: 'wv-field' }, h('label', null, '情绪 ', h(Badge, { tone: 'wait' }, '实验性')), h('select', { className: 'wv-select', value: preview.emotion, onChange: (e) => patch('emotion', e.target.value) }, EMOTIONS.map((x) => h('option', { key: x.id, value: x.id }, x.zh + ' / ' + x.en))))),
        h('div', { className: 'wv-player' },
          h('div', { className: 'wv-player-wave', 'aria-label': '示意波形，非真实音频' }, h(WaveBars, { count: 58, seed: 5 }), h('span', { className: 'playhead' })),
          h('div', { className: 'wv-player-controls' },
            h(IconButton, { icon: 'play', label: '播放（未接入）', disabled: true }),
            h('div', { className: 'wv-progress', 'aria-hidden': true }, h('i', null)),
            h('span', { className: 'wv-time' }, '0:00 / --:--'),
            h('div', { className: 'wv-volume' }, h(Icon, { name: 'volume', size: 14 }), h('input', { type: 'range', min: 0, max: 100, value: preview.volume, disabled: true, onChange: (e) => patch('volume', Number(e.target.value)), 'aria-label': '音量（未接入）' })))),
        h('div', { className: 'wv-empty', style: { minHeight: 96 } },
          h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'wave', size: 18 })),
          h('strong', null, '还没有可播放的试听音频'),
          h('p', null, '本轮不调用 Qwen，也不伪造试听成功。等待语音服务接入后，这里会显示真实音频与进度。')),
        h('div', { className: 'wv-row wv-wrap' },
          h(Button, { disabled: true, title: '等待语音服务接入' }, h(Icon, { name: 'spark', size: 14 }), '生成试听 · 等待语音服务接入'),
          h(Button, { variant: 'ghost', onClick: () => notify('试听不会在本轮调用真实 Qwen。', 'info') }, '了解限制')))
    ))
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

function AdvancedPage({ notify, setup, onSetup, onComponents }) {
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
