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
  const senderState = sender.state || 'unknown'
  const installedState = installed === true
    ? 'pass'
    : installed === false
      ? (senderState === 'not_configured' ? 'unknown' : 'fail')
      : 'unknown'
  const processState = processRunning === true
    ? 'pass'
    : processRunning === false
      ? (senderState === 'not_configured' ? 'unknown' : 'fail')
      : 'unknown'
  let healthReachable = null
  if (sender.healthReachable === true || (typeof sender.healthStatus === 'number' && sender.healthStatus > 0) || sender.health === 'ok') {
    healthReachable = true
  } else if (!(senderState === 'not_configured' || senderState === 'not_installed' || sender.health == null)) {
    healthReachable = false
  }
  const healthy = boolOrNull(sender.healthy)
  const recoveryKnown = boolOrNull(sender.recoveryPending)
  const voiceKnown = boolOrNull(data.voiceEnabled)
  const recoveryState = recoveryKnown === false ? 'pass' : recoveryKnown === true ? 'fail' : 'unknown'
  const voiceState = typeof voiceKnown === 'boolean' ? 'pass' : 'unknown'

  const senderReady = combine([
    senderState === 'not_configured' ? null : installed,
    senderState === 'not_configured' ? null : processRunning,
    healthReachable,
    healthy,
  ])
  const wechatConnected = wa.state === 'not_configured'
    ? null
    : boolOrNull(wa.connected)
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
      installed: wa.state === 'not_configured' ? null : boolOrNull(wa.installed),
      installedState: wa.state === 'not_configured' ? 'unknown' : stateOf(boolOrNull(wa.installed)),
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
      installedState,
      processRunning: processRunning === true,
      processState,
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

function configBoolText(value, yes, no) {
  return value === true ? yes : value === false ? no : '未知'
}

function configApplicationText(state) {
  if (state === 'MISMATCH') return '配置不一致'
  if (state === 'SAVED') return '已保存，生效未确认'
  if (state === 'ACTIVE') return '已生效'
  if (state === 'PENDING_RELOAD') return '待重载生效'
  return '生效状态未知'
}

export function deriveConfigView(config) {
  const c = config && typeof config === 'object' && config.schemaVersion === 1 && config.demo !== true ? config : null
  if (!c) {
    return {
      available: false,
      demo: false,
      observedAt: null,
      revision: null,
      application: { state: 'UNKNOWN', text: '配置未读取', saved: false, activeConfirmed: false },
      voice: { enabled: null, enabledText: '未知', activeText: '实际生效：未确认', mode: null, forGroupText: '未知', autoProbabilityText: '未知', defaultVoice: null, source: null, consistency: 'unknown', alternate: null },
      tts: { provider: null, model: null, voice: null, configured: null, configuredText: '未知', runtimeText: '服务状态未知', mismatchText: null },
      permissions: { privateCount: null, groupCount: null, detailAvailable: false, privateText: '未知', groupText: '未知', note: '未读取名单' },
      sender: { configAvailable: null, serviceVersion: null, workerVersion: null, runningText: '未知', healthText: '未知', consistency: 'unknown', recoveryText: '未知' },
      sources: [],
    }
  }
  const app = c.application && typeof c.application === 'object' ? c.application : {}
  const voice = c.voice && typeof c.voice === 'object' ? c.voice : {}
  const tts = c.tts && typeof c.tts === 'object' ? c.tts : {}
  const runtime = tts.runtime && typeof tts.runtime === 'object' ? tts.runtime : {}
  const permissions = c.permissions && typeof c.permissions === 'object' ? c.permissions : {}
  const sender = c.sender && typeof c.sender === 'object' ? c.sender : {}
  const alternate = voice.alternate && typeof voice.alternate === 'object' ? voice.alternate : null
  return {
    available: true,
    demo: c.demo === true,
    observedAt: c.observedAt || null,
    revision: c.configRevision || null,
    application: {
      state: app.state || 'UNKNOWN',
      text: configApplicationText(app.state),
      saved: app.saved === true,
      savedRevision: app.savedRevision || null,
      activeRevision: app.activeRevision || null,
      activeConfirmed: app.activeConfirmed === true,
      note: app.note || '保存值不等于实际生效值。',
    },
    voice: {
      enabled: typeof voice.enabled === 'boolean' ? voice.enabled : null,
      enabledText: configBoolText(voice.enabled, '已保存：开启', '已保存：关闭'),
      activeText: '实际生效：未确认',
      mode: typeof voice.mode === 'string' ? voice.mode : null,
      triggerMode: typeof voice.triggerMode === 'string' ? voice.triggerMode : null,
      forGroupText: configBoolText(voice.forGroup, '已保存：允许群聊自动', '已保存：不允许群聊自动'),
      autoProbabilityText: typeof voice.autoProbability === 'number' ? '已保存：' + voice.autoProbability + '%' : '未知',
      defaultVoice: voice.defaultVoice || null,
      source: voice.source || null,
      consistency: voice.consistency || 'unknown',
      alternate: alternate ? {
        source: alternate.source || null,
        enabledText: configBoolText(alternate.enabled, 'Worker：开启', 'Worker：关闭'),
        mode: alternate.mode || null,
        forGroup: typeof alternate.forGroup === 'boolean' ? alternate.forGroup : null,
      } : null,
    },
    tts: {
      provider: tts.provider || null,
      model: tts.model || null,
      voice: tts.voice || null,
      configured: typeof tts.configured === 'boolean' ? tts.configured : null,
      configuredText: configBoolText(tts.configured, '已保存 Provider', '未配置 Provider'),
      runtimeState: runtime.state || 'unknown',
      runtimeModel: runtime.model || null,
      runtimeVoice: runtime.voice || null,
      runtimeText: runtime.reachable === true ? '服务可达' : '服务不可达或未知',
      mismatch: tts.mismatch || null,
      mismatchText: tts.mismatch ? '配置与服务返回不一致：' + tts.mismatch : null,
      previewOk: runtime.preview === true,
    },
    permissions: {
      privateCount: Number.isFinite(permissions.privateCount) ? permissions.privateCount : null,
      groupCount: Number.isFinite(permissions.groupCount) ? permissions.groupCount : null,
      senderAllowedCount: Number.isFinite(permissions.senderAllowedCount) ? permissions.senderAllowedCount : null,
      detailAvailable: permissions.detailAvailable === true,
      privateText: Number.isFinite(permissions.privateCount) ? String(permissions.privateCount) : '未知',
      groupText: Number.isFinite(permissions.groupCount) ? String(permissions.groupCount) : '未知',
      note: permissions.note || '仅返回数量，不返回联系人/群聊名称。',
    },
    sender: {
      configAvailable: typeof sender.configAvailable === 'boolean' ? sender.configAvailable : null,
      serviceVersion: sender.serviceVersion || null,
      workerVersion: sender.workerVersion || null,
      runningText: configBoolText(sender.serviceRunning, '运行中', '未运行'),
      healthText: configBoolText(sender.healthReachable, '健康接口可达', '健康接口不可达/未知'),
      healthy: typeof sender.healthy === 'boolean' ? sender.healthy : null,
      consistency: sender.serviceWorkerConsistency || 'unknown',
      recoveryText: sender.recoveryPending === true ? '存在待恢复' : sender.recoveryPending === false ? '未发现' : '未知',
      allowListSource: sender.allowListSource || null,
    },
    sources: Array.isArray(c.sources) ? c.sources : [],
  }
}
