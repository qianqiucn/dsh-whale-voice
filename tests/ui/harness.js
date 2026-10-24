/* Isolated Whale Voice browser harness.
 *
 * It loads the generated client bundle, a fake __ModuleLoader__, React UMD and a
 * deterministic fake Host bridge. It never contacts DSH, Core, Sender, Qwen or WeChat.
 */
(function () {
  const params = new URLSearchParams(location.search)
  const bridgeMode = params.get('bridge') || 'normal'
  const wizardMode = params.get('wizard') === '1'
  const observedAt = '2026-10-24T21:45:00.000Z'
  const revision = 'harness-config-revision'

  const sources = [
    { id: 'core-config', label: 'Core 路径配置', available: true, readable: true, error: null, sensitive: false, exposed: true },
    { id: 'wechatagent-config', label: 'WeChatAgent 平台配置', available: true, readable: true, error: null, sensitive: true, exposed: false },
    { id: 'voice-settings', label: '语音用户设置', available: true, readable: true, error: null, sensitive: true, exposed: false },
    { id: 'sender-service', label: 'Voice Sender 服务配置', available: true, readable: true, error: null, sensitive: true, exposed: false },
    { id: 'sender-worker', label: 'Voice Sender Worker 安全许可', available: true, readable: true, error: null, sensitive: true, exposed: false },
    { id: 'sender-targets', label: '目标映射', available: false, readable: false, error: 'not_read_private_targets', sensitive: true, exposed: false },
    { id: 'qwen-health', label: 'Qwen 健康接口', available: true, readable: true, error: null, sensitive: false, exposed: true },
  ]

  const config = {
    schemaVersion: 1,
    observedAt,
    readMode: 'read-only',
    configRevision: revision,
    application: {
      savedRevision: revision,
      activeRevision: null,
      state: 'UNKNOWN',
      saved: true,
      activeConfirmed: false,
      note: '保存值不等于实际生效值。',
    },
    voice: {
      enabled: false,
      mode: 'explicit',
      triggerMode: 'mention',
      forGroup: false,
      autoProbability: 0,
      defaultVoice: 'whale-v1',
      source: 'voice-settings',
      worker: {
        source: 'sender-worker',
        enabled: true,
        mode: 'manual',
        forGroup: false,
        role: 'final_safety_gate',
        note: '独立安全许可，不是 Bridge 用户开关。',
      },
      semantics: 'bridge_user_setting_vs_worker_safety',
      consistency: 'not_comparable',
      active: { confirmed: false, enabled: null, mode: null, source: null },
    },
    tts: {
      provider: 'qwen-local',
      model: null,
      voice: 'whale-v1',
      baseUrlConfigured: true,
      configured: true,
      source: 'sender-service.tts',
      runtime: {
        reachable: true,
        state: 'ok',
        model: 'Qwen3-TTS-12Hz-1.7B-Base',
        voice: 'whale-v1',
        preview: false,
      },
      mismatch: null,
    },
    permissions: {
      privateCount: 2,
      groupCount: 1,
      senderAllowedCount: 1,
      voiceSettingsAllowedCount: 1,
      detailAvailable: false,
      readable: true,
      source: 'wechatagent-config.wechat.whitelist',
      note: '只返回数量；不读取或返回联系人/群聊名称。',
    },
    sender: {
      configAvailable: true,
      serviceVersion: '0.1.0',
      workerVersion: null,
      serviceRunning: false,
      configProcessMismatch: true,
      healthReachable: false,
      healthy: null,
      recoveryPending: null,
      serviceWorkerConsistency: 'match',
      allowListSource: 'service.config.json allowedChats',
    },
    sourceErrors: [{ id: 'sender-targets', error: 'not_read_private_targets' }],
    sources,
  }

  const status = {
    schemaVersion: 1,
    completed: !wizardMode,
    completedReason: 'installation_and_preview_not_implemented',
    core: { version: '0.1.0', mode: 'read-only' },
    environment: { windows: true, architecture: 'x64', node: 'v24' },
    voiceEnabled: null,
    voiceStateSource: 'not_read_active_only',
    wechatAgent: {
      state: 'auth_required',
      installed: true,
      version: '0.3.9',
      installPath: 'D:\\Fixture\\WechatAgent',
      processRunning: true,
      connected: false,
      accountVerified: null,
      reader: 'running',
      bridge: 'auth_required',
      dsh: 'unknown',
      compatibility: 'compatible',
      wechatVersion: '4.1.10.27',
      wechatVersionSource: 'config_expected',
      wechatVersionVerified: false,
      observedAt,
      durationMs: 12,
      evidence: 'fixture package v0.3.9 + 3 runtime pids + GET /WeChatAgent/health -> 401',
    },
    sender: {
      state: 'connection_failed',
      installed: true,
      version: '0.1.0',
      installPath: 'D:\\Fixture\\voice-sender',
      processRunning: false,
      health: 'connection_failed',
      healthState: 'connection_failed',
      healthStatus: null,
      healthReachable: false,
      healthy: null,
      recoveryPending: null,
      observedAt,
      durationMs: 5,
      evidence: 'fixture service v0.1.0 + pid dead + GET /health -> connection_failed',
    },
    tts: {
      configured: true,
      savedProvider: 'qwen-local',
      savedVoice: 'whale-v1',
      savedConfigured: true,
      provider: 'qwen-local',
      available: ['qwen-local'],
      model: 'Qwen3-TTS-12Hz-1.7B-Base',
      voice: 'whale-v1',
      preview: { ok: false, reason: 'not_run_in_readonly_phase' },
      state: 'ok',
      observedAt,
      evidence: 'fixture GET /health -> 200',
    },
    config,
    configStatus: {
      schemaVersion: 1,
      observedAt,
      configRevision: revision,
      application: config.application,
      voice: config.voice,
      tts: config.tts,
      permissions: config.permissions,
      sender: config.sender,
      sources: config.sources,
    },
    observedAt,
    durationMs: 20,
    evidence: 'isolated harness fixture',
  }

  function bridge(mode) {
    if (mode === 'none') return undefined
    if (mode === 'invalid') {
      return {
        getStatus: async () => ({ schemaVersion: 2, completed: false }),
        getConfig: async () => ({ schemaVersion: 2 }),
        getConfigSources: async () => ({ sources: [] }),
        getConfigStatus: async () => ({ state: 'UNKNOWN' }),
      }
    }
    if (mode === 'timeout') {
      return {
        getStatus: () => new Promise(() => {}),
        getConfig: () => new Promise(() => {}),
        getConfigSources: () => new Promise(() => {}),
        getConfigStatus: () => new Promise(() => {}),
      }
    }
    return {
      getStatus: async () => status,
      getConfig: async () => config,
      getConfigSources: async () => ({ sources }),
      getConfigStatus: async () => status.configStatus,
    }
  }

  const fakeBridge = bridge(bridgeMode)
  if (fakeBridge) window.__WHALE_SETUP__ = Object.freeze(fakeBridge)

  const spec = window.__WHALE_VOICE_SPEC__
  if (!spec || typeof spec.factory !== 'function') {
    document.getElementById('wv-harness-root').textContent = 'harness module missing'
    return
  }
  const React = window.React
  const ReactDOM = window.ReactDOM
  if (!React || !ReactDOM) {
    document.getElementById('wv-harness-root').textContent = 'react missing'
    return
  }

  const require = (name) => {
    if (name === 'react') return React
    if (name === 'styles') throw new Error('styles unavailable in harness')
    throw new Error('unsupported require: ' + name)
  }

  try {
    const module = spec.factory(require)
    const rootNode = document.getElementById('wv-harness-root')
    const slots = {
      inject(name, setup) { setup() },
      register(def, component) {
        if (!def || def.name !== 'main') return
        const root = ReactDOM.createRoot(rootNode)
        root.render(React.createElement(component))
      },
    }
    const ctx = {
      get(name) {
        if (name === 'slots') return slots
        return undefined
      },
      effect(fn) {
        try { fn() } catch {}
      },
    }
    module.apply(ctx)
    window.__WHALE_HARNESS_READY__ = true
  } catch (error) {
    console.error('harness apply failed', error)
    document.getElementById('wv-harness-root').textContent = 'harness render failed'
  }
})();
