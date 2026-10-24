/* Pure setup-view derivation shared by the browser wizard and behavior tests.
 *
 * IMPORTANT: null/undefined means unknown. Only an explicit boolean true/false becomes pass/fail.
 * A 401 health response is "reachable but not healthy", never "healthy".
 */

function stateOf(value) {
  return value === true ? 'pass' : value === false ? 'fail' : 'unknown'
}

function combine(values) {
  if (values.some((v) => v === false)) return 'fail'
  if (values.length > 0 && values.every((v) => v === true)) return 'pass'
  return 'unknown'
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null
}

export function deriveSetupView(status) {
  const data = status && typeof status === 'object' ? status : {}
  const wa = data.wechatAgent && typeof data.wechatAgent === 'object' ? data.wechatAgent : {}
  const sender = data.sender && typeof data.sender === 'object' ? data.sender : {}
  const tts = data.tts && typeof data.tts === 'object' ? data.tts : {}
  const preview = tts.preview && typeof tts.preview === 'object' ? tts.preview : {}

  const installed = boolOrNull(sender.installed)
  const processRunning = boolOrNull(sender.processRunning)
  const healthReachable = sender.healthReachable === true
    || (typeof sender.healthStatus === 'number' && sender.healthStatus > 0)
    || sender.health === 'ok'
  const healthy = boolOrNull(sender.healthy)
  const recoveryKnown = boolOrNull(sender.recoveryPending)
  const voiceKnown = boolOrNull(data.voiceEnabled)
  const recoveryState = recoveryKnown === false ? 'pass' : recoveryKnown === true ? 'fail' : 'unknown'
  const voiceState = typeof voiceKnown === 'boolean' ? 'pass' : 'unknown'

  const senderReady = combine([installed, processRunning, healthReachable, healthy])
  const wechatConnected = boolOrNull(wa.connected)
  const compatibility = wa.compatibility === 'compatible'
    ? 'pass'
    : wa.compatibility === 'incompatible'
      ? 'fail'
      : 'unknown'

  const checks = [
    { id: 'wechat', label: 'WeChatAgent 已连接', state: stateOf(wechatConnected) },
    { id: 'sender', label: '微信语音发送器已安装、进程存在、健康检查通过', state: senderReady },
    { id: 'tts', label: 'TTS Provider 已配置', state: stateOf(boolOrNull(tts.configured)) },
    { id: 'preview', label: '试听通过', state: stateOf(boolOrNull(preview.ok)) },
    { id: 'compatibility', label: '组件兼容', state: compatibility },
    { id: 'recovery', label: '没有待恢复音频设备状态', state: recoveryState },
    { id: 'voice-switch', label: '微信语音开关状态已确认', state: voiceState },
  ]
  const complete = data.completed === true
    && data.demo !== true
    && checks.every((check) => check.state === 'pass')

  const components = [
    {
      id: 'core', name: 'Whale Voice Core', desc: '安装状态、任务与 API 协调',
      state: 'connected', detail: data.core && data.core.version ? data.core.version : '已连接',
    },
    {
      id: 'wechatagent', name: 'WeChatAgent', desc: '微信平台必需依赖',
      state: wa.state || 'unknown', detail: wa.version || '未检测',
    },
    {
      id: 'sender', name: '微信语音发送器', desc: '独立 Voice Sender 组件',
      state: sender.state || 'unknown', detail: sender.version || '未检测',
      installed: installed === true, processRunning: processRunning === true,
      healthReachable, healthy,
    },
    {
      id: 'tts', name: 'TTS Provider', desc: '本地 / 云端 / 自定义',
      state: tts.configured === true ? 'installed' : (tts.state === 'ok' ? 'not_configured' : (tts.state || 'not_installed')),
      detail: tts.provider ? (tts.provider + (tts.configured === true ? '' : ' · 未配置')) : '未配置',
    },
  ]

  return {
    demo: data.demo === true,
    completed: data.completed === true,
    complete,
    checks,
    unknownChecks: checks.filter((check) => check.state === 'unknown').map((check) => check.id),
    failedChecks: checks.filter((check) => check.state === 'fail').map((check) => check.id),
    advance: {
      wechat: wechatConnected === true,
      sender: senderReady === 'pass',
      tts: tts.configured === true,
      finish: complete,
    },
    wechat: {
      installed: boolOrNull(wa.installed),
      processRunning: boolOrNull(wa.processRunning),
      connected: wechatConnected,
      connectedState: stateOf(wechatConnected),
      accountVerified: stateOf(boolOrNull(wa.accountVerified)),
      reader: wa.reader || 'unknown',
      bridge: wa.bridge || 'unknown',
      dsh: wa.dsh || 'unknown',
      compatibility,
      version: wa.version || null,
      wechatVersion: wa.wechatVersion || null,
      wechatVersionVerified: wa.wechatVersionVerified === true,
      observedAt: wa.observedAt || null,
      evidence: wa.evidence || null,
    },
    sender: {
      installed: installed === true,
      installedState: stateOf(installed),
      processRunning: processRunning === true,
      processState: stateOf(processRunning),
      healthReachable,
      healthReachableState: stateOf(healthReachable),
      healthy: healthy === true,
      healthyState: stateOf(healthy),
      healthState: sender.healthState || sender.health || 'unknown',
      healthStatus: sender.healthStatus == null ? null : sender.healthStatus,
      ready: senderReady,
      readyState: senderReady,
      recoveryPending: recoveryKnown,
      recoveryState,
      version: sender.version || null,
      observedAt: sender.observedAt || null,
      evidence: sender.evidence || null,
    },
    tts: {
      configured: tts.configured === true,
      configuredState: stateOf(boolOrNull(tts.configured)),
      provider: tts.provider || null,
      state: tts.state || 'unknown',
      model: tts.model || null,
      voice: tts.voice || null,
      previewOk: preview.ok === true,
      previewState: stateOf(boolOrNull(preview.ok)),
      observedAt: tts.observedAt || null,
      evidence: tts.evidence || null,
    },
    voice: {
      enabled: voiceKnown,
      state: voiceState,
      source: data.voiceStateSource || 'not_read',
    },
    components,
  }
}
