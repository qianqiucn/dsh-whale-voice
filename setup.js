/* Whale Voice first-run setup UI and component manager.
 *
 * This module is injected after pages.js by build.mjs. It contains browser UI only.
 * There is no shell, no installer execution and no arbitrary URL fetching here.
 * Real setup operations must be exposed by the future Whale Voice Core through
 * window.__WHALE_SETUP__; the adapter contract is documented in docs/SETUP_API.md.
 */

const SETUP_STEPS = [
  { id: 'wechat', label: '连接微信助手', short: '微信助手', icon: 'chat' },
  { id: 'sender', label: '安装微信语音功能', short: '语音功能', icon: 'wave' },
  { id: 'tts', label: '选择小鲸鱼的声音', short: '声音', icon: 'spark' },
  { id: 'finish', label: '完成检查', short: '检查', icon: 'check' },
]

const SETUP_STATE_LABELS = {
  NOT_INSTALLED: '未安装',
  DETECTING: '检测中',
  READY_TO_INSTALL: '可以安装',
  DOWNLOADING: '获取安装包',
  VERIFYING: '验证完整性',
  INSTALLING: '安装中',
  CONFIGURING: '配置中',
  VALIDATING: '验证中',
  INSTALLED: '已安装',
  NEEDS_REPAIR: '需要修复',
  FAILED: '安装失败',
  CANCELLED: '已取消',
  connected: '已连接',
  connecting: '连接中',
  not_installed: '未安装',
  not_running: '未启动',
  incompatible: '版本不兼容',
  error: '连接异常',
  healthy: '运行正常',
  installed: '已安装',
  compatible: '兼容',
}

const MOCK_SETUP = {
  demo: true,
  completed: false,
  core: { version: '0.1.0-demo', mode: 'demo' },
  environment: { windows: true, architecture: 'x64', node: '22.x', powershell: true, dotnet: true },
  wechatAgent: {
    state: 'connected', installed: true, version: '0.3.9 (demo)', processRunning: true,
    connected: true, accountVerified: true, reader: 'ok', bridge: 'ok', dsh: 'ok',
    compatibility: 'compatible', wechatVersion: '4.1.10.27 (demo)',
  },
  sender: {
    state: 'installed', installed: true, version: '0.1.0 (demo)', health: 'healthy',
    powershell: true, dotnet: true, node: true, vbCable: true, capture: 'VB-Audio Virtual Cable',
    queue: 0, recoveryPending: false,
  },
  tts: { configured: false, provider: null, available: ['qwen-local', 'cloud', 'custom'], preview: { ok: false, reason: 'not_configured' } },
  diagnostic: { canSend: false, pendingRecovery: false },
}

function readSetupStatus() {
  const bridge = typeof window !== 'undefined' ? window.__WHALE_SETUP__ : null
  if (!bridge || typeof bridge.getStatus !== 'function') {
    return Promise.resolve({
      checking: false,
      available: false,
      reason: 'core_not_connected',
      data: null,
      checkedAt: new Date().toISOString(),
    })
  }
  return Promise.resolve(bridge.getStatus()).then((data) => {
    if (!data || typeof data !== 'object') {
      return { checking: false, available: false, reason: 'core_invalid_response', data: null, checkedAt: new Date().toISOString() }
    }
    return { checking: false, available: true, reason: '', data, checkedAt: new Date().toISOString() }
  }).catch((error) => ({
    checking: false,
    available: false,
    reason: 'core_error:' + String(error && error.message ? error.message : error).slice(0, 120),
    data: null,
    checkedAt: new Date().toISOString(),
  }))
}

function setupStateLabel(state) {
  return SETUP_STATE_LABELS[state] || (state ? String(state) : '状态未知')
}

function setupStateTone(state) {
  if (state === 'connected' || state === 'installed' || state === 'INSTALLED' || state === 'compatible' || state === 'healthy' || state === 'ok') return 'online'
  if (state === 'connecting' || state === 'DETECTING' || state === 'DOWNLOADING' || state === 'VERIFYING' || state === 'INSTALLING' || state === 'CONFIGURING' || state === 'VALIDATING') return 'starting'
  if (state === 'not_installed' || state === 'not_running' || state === 'NOT_INSTALLED') return 'offline'
  if (state === 'incompatible' || state === 'FAILED' || state === 'NEEDS_REPAIR' || state === 'error') return 'error'
  return 'unknown'
}

function setupBool(value, yes = '就绪', no = '未就绪') {
  return value ? yes : no
}

function SetupMark({ ok, label, value }) {
  return h('div', { className: 'wv-setup-check' },
    h('span', { className: 'wv-setup-check-icon ' + (ok ? 'ok' : 'wait') }, h(Icon, { name: ok ? 'check' : 'alert', size: 13 })),
    h('span', { className: 'wv-setup-check-label' }, label),
    h('span', { className: 'wv-setup-check-value' }, value))
}

function SetupStatusPill({ state, demo }) {
  return h('span', { className: 'wv-setup-pill ' + (demo ? 'demo' : setupStateTone(state)) },
    demo ? '演示' : setupStateLabel(state))
}

function SetupBlocked({ status, onRefresh, onDemo, onNotify }) {
  const unavailable = status.reason === 'core_not_connected'
  return h('div', { className: 'wv-setup-blocked' },
    h('div', { className: 'wv-setup-blocked-icon' }, h(Icon, { name: 'lock', size: 22 })),
    h('h3', null, unavailable ? '还需要连接 Whale Voice Core' : 'Core 检测暂时不可用'),
    h('p', null, unavailable
      ? '真实安装状态必须由 Core 保存并检测。当前前端不会用 LocalStorage 或 Mock 数据冒充安装完成。'
      : 'Core 返回了不可用状态，请检查本地服务或稍后重试。'),
    h('div', { className: 'wv-row wv-wrap' },
      h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), status.checking ? '检测中' : '重新检测'),
      h(Button, { variant: 'ghost', onClick: onDemo }, '查看演示流程'),
      h(Button, { variant: 'ghost', onClick: () => onNotify('安装 API 尚未接入 Core；不会执行任何系统命令。', 'info') }, '接口说明')))
}

function SetupStepNav({ step, setStep, maxStep = 3 }) {
  return h('div', { className: 'wv-setup-steps', role: 'tablist', 'aria-label': '安装步骤' },
    SETUP_STEPS.map((s, i) => h('button', {
      key: s.id, type: 'button', role: 'tab', 'aria-selected': step === i,
      className: 'wv-setup-step' + (step === i ? ' active' : '') + (i < step ? ' done' : ''),
      onClick: () => { if (i <= maxStep) setStep(i) },
      disabled: i > maxStep,
    },
      h('span', { className: 'wv-setup-step-num' }, i < step ? h(Icon, { name: 'check', size: 12 }) : i + 1),
      h('span', { className: 'wv-setup-step-copy' },
        h('strong', null, s.short),
        h('small', null, s.label)))))
}

function SetupWeChatStep({ data, demo, status, onRefresh, onNotify }) {
  const wa = data && data.wechatAgent
  const connected = Boolean(wa && wa.connected)
  const missing = Boolean(wa && (wa.state === 'not_installed' || wa.installed === false))
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' }, h(Icon, { name: 'chat', size: 22 })),
      h('div', null,
        h('h3', null, '连接微信助手'),
        h('p', null, 'WeChatAgent 帮助小鲸鱼连接微信，接收和回复消息。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 非真实状态') : null)),
    !data ? h(SetupBlocked, { status, onRefresh, onDemo: () => {}, onNotify }) : h(React.Fragment, null,
      h('div', { className: 'wv-setup-statusline' },
        h('span', { className: 'wv-setup-statuslabel' }, 'WeChatAgent'),
        h(SetupStatusPill, { state: wa && wa.state, demo }),
        h('span', { className: 'wv-muted' }, wa && wa.version ? 'v' + wa.version : '版本未知')),
      h('div', { className: 'wv-setup-checks' },
        h(SetupMark, { ok: Boolean(wa && wa.installed), label: '程序安装', value: setupBool(wa && wa.installed) }),
        h(SetupMark, { ok: Boolean(wa && wa.processRunning), label: '进程运行', value: setupBool(wa && wa.processRunning) }),
        h(SetupMark, { ok: Boolean(wa && wa.accountVerified), label: '账号验证', value: setupBool(wa && wa.accountVerified) }),
        h(SetupMark, { ok: Boolean(wa && wa.connected), label: '微信连接', value: setupBool(wa && wa.connected) }),
        h(SetupMark, { ok: Boolean(wa && wa.reader === 'ok'), label: 'Reader', value: setupBool(wa && wa.reader === 'ok') }),
        h(SetupMark, { ok: Boolean(wa && wa.bridge === 'ok'), label: 'Bridge', value: setupBool(wa && wa.bridge === 'ok') }),
        h(SetupMark, { ok: Boolean(wa && wa.dsh === 'ok'), label: 'DSH 连接', value: setupBool(wa && wa.dsh === 'ok') }),
        h(SetupMark, { ok: Boolean(wa && wa.compatibility === 'compatible'), label: '接口兼容性', value: setupBool(wa && wa.compatibility === 'compatible') })),
      missing ? h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'alert', size: 16 }),
        h('div', null,
          h('strong', null, '尚未检测到 WeChatAgent'),
          h('p', null, '安装并连接 WeChatAgent 后，才能让 AI 在微信中发送语音消息。'),
          h('p', { className: 'wv-muted' }, '微信登录、数据库授权和 Hook 流程由 WeChatAgent 自己完成；Whale Voice 不会重新实现这些步骤。'))) : null,
      !connected && !missing ? h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'info', size: 16 }),
        h('div', null, h('strong', null, '微信助手还没有连接'), h('p', null, '请打开 WeChatAgent 完成登录和连接，然后重新检测。'))) : null,
      connected ? h('div', { className: 'wv-setup-callout ok' },
        h(Icon, { name: 'check', size: 16 }),
        h('div', null, h('strong', null, '微信助手已连接'), h('p', null, demo ? '这是演示状态，不代表真实 WeChatAgent 已连接。' : '当前满足前端可见的连接条件；真实语音仍需单独授权。'))) : null,
      h('div', { className: 'wv-setup-actions' },
        h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), status.checking ? '检测中' : '重新检测'),
        h(Button, { variant: 'ghost', onClick: () => window.open('https://github.com/sourcepro5/WeChatAgent', '_blank', 'noopener,noreferrer') }, h(Icon, { name: 'external', size: 14 }), '打开官方 GitHub'),
        h(Button, { variant: 'ghost', onClick: () => onNotify('兼容性基线见 docs/WECHATAGENT_COMPATIBILITY.md；当前未执行真实连接测试。', 'info') }, '查看兼容性'))))
}

function SetupSenderStep({ data, demo, status, onRefresh, onNotify }) {
  const sender = data && data.sender
  const installed = Boolean(sender && sender.installed)
  const healthy = Boolean(sender && sender.health === 'healthy')
  const env = data && data.environment
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' }, h(Icon, { name: 'wave', size: 22 })),
      h('div', null,
        h('h3', null, '安装微信语音功能'),
        h('p', null, '让小鲸鱼可以在微信中发送真正的语音消息。'),
        h('p', { className: 'wv-muted' }, '技术名称：Voice Sender。它是独立安装的 Windows 组件，不会并入 Whale Voice Core。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 不执行安装') : null)),
    !data ? h('div', { className: 'wv-setup-callout warn' }, h(Icon, { name: 'lock', size: 16 }), h('div', null, h('strong', null, '安装能力尚未接入'), h('p', null, '真实安装需要 Whale Voice Core 的 Installer API。本页面不会下载或执行任何安装脚本。'))) : h(React.Fragment, null,
      h('div', { className: 'wv-setup-checks two' },
        h(SetupMark, { ok: Boolean(env && env.windows), label: 'Windows', value: env && env.architecture ? env.architecture : '未检测' }),
        h(SetupMark, { ok: Boolean(env && env.powershell), label: 'PowerShell', value: setupBool(env && env.powershell) }),
        h(SetupMark, { ok: Boolean(env && env.dotnet), label: 'C# / .NET', value: setupBool(env && env.dotnet) }),
        h(SetupMark, { ok: Boolean(env && env.node), label: 'Node 运行时', value: setupBool(env && env.node) }),
        h(SetupMark, { ok: Boolean(sender && sender.vbCable), label: 'VB-CABLE', value: setupBool(sender && sender.vbCable) }),
        h(SetupMark, { ok: Boolean(sender && sender.capture), label: '默认录音设备', value: sender && sender.capture ? sender.capture : '未检测' }),
        h(SetupMark, { ok: Boolean(sender && !sender.recoveryPending), label: '音频恢复快照', value: sender && sender.recoveryPending ? '待恢复' : '无待恢复' }),
        h(SetupMark, { ok: Boolean(sender && sender.queue === 0), label: '任务队列', value: sender && Number(sender.queue) > 0 ? String(sender.queue) + ' 个任务' : '空闲' })),
      installed ? h('div', { className: 'wv-setup-callout ok' },
        h(Icon, { name: 'check', size: 16 }),
        h('div', null, h('strong', null, '检测到已安装的微信语音发送器'),
          h('p', null, '默认复用现有安装，不覆盖、不重复安装。版本：' + (sender.version || '未知') + '；健康：' + (sender.health || '未知') + '。'),
          demo ? h('p', { className: 'wv-muted' }, '演示状态；真实升级/修复需要单独授权。') : null)) : h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'alert', size: 16 }),
        h('div', null, h('strong', null, '还没有安装微信语音发送器'),
          h('p', null, '安装器 API 尚未接入 Core。当前不会下载、校验或执行任何安装包，也不会安装系统驱动。'))),
      sender && !sender.vbCable ? h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'volume', size: 16 }),
        h('div', null, h('strong', null, '还需要一个音频组件'),
          h('p', null, '才能让 AI 的声音进入微信录音。请按官方来源安装 VB-CABLE；安装驱动前必须由你确认。'))) : null,
      h('div', { className: 'wv-setup-plan' },
        h('div', { className: 'wv-setup-plan-head' }, h('strong', null, '安装计划预览'), h(Badge, { tone: 'wait' }, '未执行')),
        h('ol', null,
          h('li', null, '环境预检与版本检查'),
          h('li', null, '读取可信发布包并校验完整性'),
          h('li', null, '部署到临时目录，验证运行依赖'),
          h('li', null, '写入安全默认配置，连接 Core / WeChatAgent'),
          h('li', null, '健康检查与无真实发送的诊断'),
          h('li', null, '失败回滚，不覆盖现有配置'))),
      h('div', { className: 'wv-setup-actions' },
        h(Button, { variant: 'primary', disabled: true, title: '需要 Core Installer API；本阶段未实现' }, h(Icon, { name: 'lock', size: 14 }), installed ? '复用现有安装' : '一键安装微信语音功能'),
        h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), '重新检测'),
        h(Button, { variant: 'ghost', onClick: () => onNotify('组件管理将统一处理启动/停止/升级/修复/卸载；当前尚未接入 Core。', 'info') }, '组件管理'))))
}

function SetupProviderCard({ id, title, subtitle, state, selected, onSelect, demo, children }) {
  const stateLabel = state === 'soon' ? '即将支持' : demo ? '演示' : state === 'ready' ? '可用' : '待配置'
  return h('button', {
    type: 'button', disabled: state === 'soon',
    className: 'wv-provider-card' + (selected ? ' selected' : '') + (state === 'soon' ? ' disabled' : ''),
    onClick: () => { if (state !== 'soon') onSelect(id) },
    'aria-pressed': selected,
  },
    h('div', { className: 'wv-provider-head' },
      h('strong', null, title),
      h('span', { className: 'wv-provider-state' }, stateLabel)),
    h('p', null, subtitle),
    children || null)
}

function SetupTtsStep({ data, demo, onRefresh, onNotify }) {
  const tts = data && data.tts
  const [provider, setProvider] = React.useState((tts && tts.provider) || 'local')
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' }, h(Icon, { name: 'spark', size: 22 })),
      h('div', null,
        h('h3', null, '选择小鲸鱼的声音'),
        h('p', null, '没有独立显卡也可以选择云端语音。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 不调用真实 TTS') : null)),
    h('div', { className: 'wv-provider-grid' },
      h(SetupProviderCard, { id: 'cloud', title: '云端 TTS', subtitle: '无需 CUDA 或本地大模型；需要 Provider 凭据。', state: 'soon', selected: provider === 'cloud', onSelect: setProvider, demo },
        h('span', { className: 'wv-provider-meta' }, '费用与文本上传第三方需确认')),
      h(SetupProviderCard, { id: 'local', title: '本地 Qwen', subtitle: '使用现有本地 Qwen3-TTS Provider；不强制普通用户下载模型。', state: tts && tts.available && tts.available.includes('qwen-local') ? 'ready' : 'wait', selected: provider === 'local', onSelect: setProvider, demo },
        h('span', { className: 'wv-provider-meta' }, tts && tts.provider === 'qwen-local' ? '已检测到本地 Provider' : '需本机 Qwen 服务')),
      h(SetupProviderCard, { id: 'custom', title: '自定义 TTS API', subtitle: '连接你已有的兼容语音服务，必须通过真实音频格式验证。', state: 'soon', selected: provider === 'custom', onSelect: setProvider, demo },
        h('span', { className: 'wv-provider-meta' }, '仅声明协议，不假设任意 OpenAI 地址可用'))),
    h('div', { className: 'wv-setup-credentials' },
      h('div', { className: 'wv-setup-field' },
        h('label', null, 'API Key'),
        h('input', { className: 'wv-input', disabled: true, placeholder: '由 Core 凭据管理；前端不保存、不输出', type: 'password', 'aria-label': 'API Key（未接入）' })),
      h('div', { className: 'wv-setup-field' },
        h('label', null, 'API 地址'),
        h('input', { className: 'wv-input', disabled: true, placeholder: 'Provider 配置接入后可用', 'aria-label': 'API 地址（未接入）' }))),
    h('div', { className: 'wv-setup-callout warn' },
      h(Icon, { name: 'lock', size: 16 }),
      h('div', null, h('strong', null, '密钥与试听尚未接入'),
        h('p', null, 'API Key 必须由后端安全凭据保存，不能写入 LocalStorage、日志或 GitHub。真实 Provider 未实现前，前端不会伪装试听成功。'))),
    h('div', { className: 'wv-setup-actions' },
      h(Button, { disabled: true, title: 'Provider Core 未接入' }, h(Icon, { name: 'play', size: 14 }), '生成试听'),
      h(Button, { variant: 'ghost', onClick: onRefresh }, h(Icon, { name: 'refresh', size: 14 }), '重新检测'),
      h(Button, { variant: 'ghost', onClick: () => onNotify('试听只调用 TTS，不调用 WeChatAgent 或 Voice Sender；当前未实现。', 'info') }, '试听说明')))
}

function SetupFinishStep({ data, demo, onClose, onGoPermissions, onNotify }) {
  const checks = data ? [
    { ok: Boolean(data.wechatAgent && data.wechatAgent.connected), label: 'WeChatAgent 已连接' },
    { ok: Boolean(data.sender && data.sender.installed && data.sender.health === 'healthy'), label: '微信语音发送器已安装并运行正常' },
    { ok: Boolean(data.tts && data.tts.configured), label: 'TTS Provider 已配置' },
    { ok: Boolean(data.tts && data.tts.preview && data.tts.preview.ok), label: '试听通过' },
    { ok: Boolean(data.wechatAgent && data.wechatAgent.compatibility === 'compatible'), label: '组件兼容' },
    { ok: !(data.sender && data.sender.recoveryPending), label: '没有待恢复音频设备状态' },
  ] : []
  const complete = Boolean(data && data.completed && !demo && checks.every((c) => c.ok))
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' + (complete ? ' ok' : '') }, h(Icon, { name: complete ? 'check' : 'alert', size: 22 })),
      h('div', null,
        h('h3', null, complete ? '小鲸鱼准备好了' : '还有一些步骤需要完成'),
        h('p', null, complete ? '所有真实检查通过。完成后仍需单独授权聊天目标和打开语音开关。' : '下面是当前检查结果；完成安装不等于自动开启微信语音。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 不构成安装完成') : null)),
    h('div', { className: 'wv-setup-checks' },
      checks.length ? checks.map((c) => h(SetupMark, { key: c.label, ok: c.ok, label: c.label, value: c.ok ? '通过' : '未通过' })) : h(SetupMark, { ok: false, label: 'Core 未连接', value: '无法检查' })),
    h('div', { className: 'wv-setup-callout ' + (complete ? 'ok' : 'warn') },
      h(Icon, { name: complete ? 'shield' : 'lock', size: 16 }),
      h('div', null, h('strong', null, complete ? '安全默认值仍然生效' : '安装成功不等于微信语音已开启'),
        h('p', null, 'voice.enabled=false；不新增私聊授权；群聊语音关闭；不自动发送消息；不重放历史任务。聊天权限与语音开关需要你单独确认。'))),
    h('div', { className: 'wv-setup-actions' },
      h(Button, { variant: 'primary', onClick: onClose }, complete ? '进入 Whale Voice' : '稍后继续'),
      h(Button, { onClick: onGoPermissions }, '设置聊天权限'),
      h(Button, { variant: 'ghost', onClick: () => onNotify('诊断报告 API 尚未接入 Core；不会输出密钥或聊天内容。', 'info') }, '查看诊断报告')))
}

function SetupWizard({ open, status, onClose, onRefresh, onNotify, onGoPermissions }) {
  const [step, setStep] = React.useState(() => {
    try { return Math.max(0, Math.min(3, Number(sessionStorage.getItem('wv.setup.step')) || 0)) } catch { return 0 }
  })
  const [demo, setDemo] = React.useState(false)
  const data = demo ? MOCK_SETUP : (status && status.available ? status.data : null)
  const go = (next) => {
    setStep(next)
    try { sessionStorage.setItem('wv.setup.step', String(next)) } catch {}
  }
  if (!open) return null
  const nextEnabled = (() => {
    if (!data) return false
    if (demo) return true
    if (step === 0) return Boolean(data.wechatAgent && data.wechatAgent.connected)
    if (step === 1) return Boolean(data.sender && data.sender.installed && data.sender.health === 'healthy')
    if (step === 2) return Boolean(data.tts && data.tts.configured)
    return Boolean(data.completed)
  })()
  const footer = h(React.Fragment, null,
    h('span', { className: 'wv-setup-footnote' }, demo ? '演示模式：不执行真实安装、下载或微信操作' : '真实状态由 Whale Voice Core 提供'),
    h('span', { className: 'wv-spacer' }),
    step < 3 ? h(Button, { variant: 'ghost', onClick: onClose }, '稍后继续') : null,
    step > 0 ? h(Button, { onClick: () => go(step - 1) }, '上一步') : null,
    step < 3
      ? h(Button, { variant: 'primary', disabled: !nextEnabled, title: nextEnabled ? '' : '当前步骤的真实检查尚未通过', onClick: () => go(step + 1) }, '下一步')
      : h(Button, { variant: 'primary', onClick: onClose }, '关闭'))
  return h(Modal, {
    title: '首次安装向导', subtitle: demo ? '演示流程 · 不代表真实安装' : '连接微信 → 安装语音组件 → 选择 TTS → 完成诊断',
    size: 'lg', onClose, footer,
  },
    h(SetupStepNav, { step, setStep: go, maxStep: data ? 3 : 0 }),
    !data ? h(SetupBlocked, {
      status, onRefresh, onDemo: () => setDemo(true), onNotify,
    }) : null,
    data && step === 0 ? h(SetupWeChatStep, { data, demo, status, onRefresh, onNotify }) : null,
    data && step === 1 ? h(SetupSenderStep, { data, demo, status, onRefresh, onNotify }) : null,
    data && step === 2 ? h(SetupTtsStep, { data, demo, onRefresh, onNotify }) : null,
    data && step === 3 ? h(SetupFinishStep, { data, demo, onClose, onGoPermissions, onNotify }) : null,
    data && demo ? h('div', { className: 'wv-setup-demo-strip' }, h(Icon, { name: 'info', size: 13 }), h('span', null, '当前为演示数据，不会读取真实环境、安装组件或调用微信 / TTS。')) : null)
}

function ComponentsDialog({ open, status, onClose, onRefresh, onSetup, onAdvanced, onNotify }) {
  if (!open) return null
  const data = status && status.available ? status.data : null
  const rows = [
    { name: 'Whale Voice Core', desc: '安装状态、任务与 API 协调', state: data ? 'connected' : 'not_installed', detail: data && data.core ? data.core.version : '未连接' },
    { name: 'WeChatAgent', desc: '微信平台必需依赖', state: data && data.wechatAgent ? data.wechatAgent.state : 'not_installed', detail: data && data.wechatAgent ? data.wechatAgent.version : '未检测' },
    { name: '微信语音发送器', desc: '独立 Voice Sender 组件', state: data && data.sender ? data.sender.state : 'not_installed', detail: data && data.sender ? data.sender.version : '未检测' },
    { name: 'TTS Provider', desc: '本地 / 云端 / 自定义', state: data && data.tts && data.tts.configured ? 'installed' : 'not_installed', detail: data && data.tts && data.tts.provider ? data.tts.provider : '未配置' },
  ]
  return h(Modal, {
    title: '组件管理', subtitle: '查看安装状态、重新检测或回到安装向导。不会直接执行系统命令。', size: 'lg', onClose,
    footer: h(React.Fragment, null,
      h(Button, { variant: 'ghost', onClick: onAdvanced }, '高级设置'),
      h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), '重新检测'),
      h(Button, { variant: 'primary', onClick: onSetup }, '打开安装向导')),
  },
    !data ? h('div', { className: 'wv-setup-callout warn' }, h(Icon, { name: 'lock', size: 16 }), h('div', null, h('strong', null, 'Whale Voice Core 未连接'), h('p', null, '无法读取真实组件状态。当前不会把 Mock 显示成在线。'))) : null,
    h('div', { className: 'wv-component-list' }, rows.map((r) => h('div', { className: 'wv-component-row', key: r.name },
      h('div', { className: 'wv-component-main' }, h('strong', null, r.name), h('p', null, r.desc)),
      h('span', { className: 'wv-component-detail' }, r.detail),
      h(SetupStatusPill, { state: r.state, demo: Boolean(data && data.demo) })))),
    h('div', { className: 'wv-setup-callout' }, h(Icon, { name: 'info', size: 16 }), h('div', null, h('strong', null, '组件控制尚未开放'), h('p', null, '启动、停止、升级、修复、卸载必须通过 Core 的受控 API；本轮前端只展示状态和安装入口。'))) )
}

function SetupBanner({ status, onSetup, onComponents }) {
  if (status && status.checking) return null
  const data = status && status.available ? status.data : null
  const complete = Boolean(data && data.completed)
  const unavailable = !status || !status.available
  return h('section', { className: 'wv-setup-banner' },
    h('div', { className: 'wv-setup-banner-icon' }, h(Icon, { name: unavailable ? 'lock' : complete ? 'check' : 'spark', size: 18 })),
    h('div', { className: 'wv-setup-banner-copy' },
      h('strong', null, unavailable ? '安装向导等待 Whale Voice Core' : complete ? '组件已就绪' : '首次设置还没有完成'),
      h('p', null, unavailable
        ? '不会用 LocalStorage 或 Mock 数据冒充安装成功。可以查看流程，真实检测和安装需要 Core。'
        : complete
          ? '组件状态来自 Core 检查；微信语音仍需单独授权目标并开启。'
          : '完成微信助手、微信语音发送器和 TTS 选择后，再进行真实诊断。')),
    h('div', { className: 'wv-setup-banner-actions' },
      h(Button, { variant: 'ghost', onClick: onComponents }, '组件管理'),
      h(Button, { variant: 'primary', onClick: onSetup }, unavailable ? '查看安装流程' : complete ? '重新打开向导' : '继续安装')))
}
