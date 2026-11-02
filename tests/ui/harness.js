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
      installPath: 'fixture-install-path',
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
      installPath: 'fixture-install-path',
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

  const capability = (() => {
    const block = (code, message) => ({ code, message, severity: 'blocked' })
    const saved = (values) => ({ state: 'AVAILABLE', values, source: 'isolated fixture' })
    const runtime = (state, summary) => ({ state, summary, observedAt, error: state === 'AVAILABLE' ? null : summary })
    const surface = (id, label, options) => ({
      id, label, risk: options.risk || 'HIGH',
      readTiming: options.readTiming, hotReload: options.hotReload, requiresRestart: options.requiresRestart,
      ownerApi: options.ownerApi,
      save: { ...options.save, enabled: false, gate: options.save.gate },
      savedRevision: options.savedRevision || { state: 'UNSUPPORTED', kind: null },
      loadedRevision: options.loadedRevision || { state: 'UNSUPPORTED', kind: null },
      apply: options.apply,
      status: {
        saved: options.savedValues ? saved(options.savedValues) : { state: 'UNAVAILABLE', values: null, source: 'isolated fixture' },
        runtime: options.runtime,
        apply: { state: 'UNKNOWN', activeRevision: null, activeConfirmed: false, reason: 'NO_LOADED_REVISION' },
        observedAt,
      },
      blockers: (options.blockers || []).map(([code, message]) => block(code, message)),
    })
    return {
      schemaVersion: 3, ok: true, mode: 'read-only', writeMode: 'READ_ONLY', observedAt,
      components: [
        { id: 'core', label: 'Whale Voice Core', state: 'AVAILABLE', status: 'AVAILABLE', version: '0.1.0', versionMatch: 'NOT_APPLICABLE', observedAt },
        { id: 'wechatagent', label: 'WeChatAgent', state: 'auth_required', status: 'DEGRADED', version: '0.3.9', versionMatch: 'AUDITED', observedAt },
        { id: 'bridge', label: 'WeChatAgent Bridge', state: 'auth_required', status: 'DEGRADED', version: '0.3.9', versionMatch: 'AUDITED', observedAt },
        { id: 'sender', label: 'Voice Sender 服务', state: 'not_running', status: 'DEGRADED', version: '0.1.0', versionMatch: 'AUDITED', observedAt },
        { id: 'worker', label: 'Voice Sender Worker', state: 'UNKNOWN', status: 'UNKNOWN', version: null, versionMatch: 'UNKNOWN', observedAt },
        { id: 'qwen', label: 'Qwen3-TTS', state: 'ok', status: 'AVAILABLE', version: null, versionMatch: 'NOT_APPLICABLE', observedAt },
      ],
      sources: [
        {
          id: 'bridgeVoice', label: 'Bridge 语音开关', authority: 'WeChatAgent Bridge', component: 'bridge', version: '0.3.9', versionMatch: 'AUDITED', risk: 'CRITICAL',
          surfaces: [surface('voiceSettings', 'Bridge 用户语音开关', {
            risk: 'CRITICAL', readTiming: 'PER_CALL', hotReload: 'FULL', requiresRestart: 'NOT_REQUIRED',
            ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
            save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED', gate: 'NO_OWNER_API' },
            apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
            savedValues: { enabled: false, mode: 'explicit', forGroup: false, defaultVoice: 'whale-v1' },
            runtime: runtime('DEGRADED', 'auth_required'),
            blockers: [['NO_OWNER_API', '组件没有受支持的写入接口；直接改 JSON 不算受支持接口。'], ['NO_LOADED_REVISION', '组件不返回已加载配置版本，无法确认保存值是否生效。'], ['READ_ONLY_PHASE', '只读阶段，不提供写入入口。']],
          })],
        },
        {
          id: 'senderService', label: 'Voice Sender 服务', authority: 'Voice Sender Service', component: 'sender', version: '0.1.0', versionMatch: 'AUDITED', risk: 'HIGH',
          surfaces: [
            surface('automation', '发送自动化设置', {
              readTiming: 'RUNTIME_API', hotReload: 'FULL', requiresRestart: 'NOT_REQUIRED',
              ownerApi: { state: 'AVAILABLE', kind: 'HTTP', scope: 'COMPONENT', endpoint: 'PUT /v1/automation/config' },
              save: { state: 'SUPPORTED', authorization: 'NOT_AUTHORIZED', gate: 'NO_WRITE_AUTHORIZATION' },
              apply: { state: 'UNSUPPORTED', reason: 'NO_LOADED_REVISION' },
              savedValues: { mode: 'manual', autoFindWindow: true, autoOpenChat: false, autoRestoreMinimized: true, pauseWhenFullscreen: true },
              runtime: runtime('DEGRADED', 'not_running'),
              blockers: [['NO_WRITE_AUTHORIZATION', '当前阶段仅只读，尚未获得生产写入授权。'], ['NO_LOADED_REVISION', '组件不返回已加载配置版本，无法确认保存值是否生效。']],
            }),
            surface('tts', 'TTS 音色与提供方', {
              readTiming: 'SERVICE_BOOT', hotReload: 'NONE', requiresRestart: 'REQUIRED',
              ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
              save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED', gate: 'NO_OWNER_API' },
              apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
              savedValues: { provider: 'qwen-local', voice: 'whale-v1', configured: true },
              runtime: runtime('DEGRADED', 'not_running'),
              blockers: [['NO_OWNER_API', '组件没有受支持的写入接口；直接改 JSON 不算受支持接口。'], ['REQUIRES_RESTART', '修改后需要重新加载或重启对应组件才能生效。']],
            }),
          ],
        },
        {
          id: 'workerSafety', label: 'Worker 安全许可', authority: 'Voice Sender Worker', component: 'worker', version: '0.1.0', versionMatch: 'AUDITED', risk: 'CRITICAL',
          surfaces: [surface('voicePermit', 'Worker 最终安全许可', {
            risk: 'CRITICAL', readTiming: 'UNKNOWN', hotReload: 'UNKNOWN', requiresRestart: 'UNKNOWN',
            ownerApi: { state: 'UNKNOWN', kind: null, scope: null, endpoint: null },
            save: { state: 'UNKNOWN', authorization: 'NOT_AUTHORIZED', gate: 'UNKNOWN' },
            apply: { state: 'UNKNOWN', reason: 'VERSION_UNKNOWN' },
            savedValues: { enabled: true, mode: 'manual', role: 'final_safety_gate' },
            runtime: runtime('UNKNOWN', 'no_worker_status_interface'),
            blockers: [['NEVER_WRITE_BY_POLICY', 'Worker 最终安全许可必须保持独立，本插件永不写入。'], ['VERSION_UNKNOWN', '无法确认 Worker 版本，能力结论保持未知。']],
          })],
        },
        {
          id: 'wechatPermissions', label: '微信权限范围', authority: 'WeChatAgent', component: 'wechatagent', version: '0.3.9', versionMatch: 'AUDITED', risk: 'CRITICAL',
          surfaces: [surface('config', '微信私聊 / 群聊权限', {
            risk: 'CRITICAL', readTiming: 'MIXED', hotReload: 'PARTIAL', requiresRestart: 'REQUIRED',
            ownerApi: { state: 'AVAILABLE', kind: 'HTTP_CONSOLE', scope: 'HUMAN_CONSOLE', endpoint: 'POST /api/config' },
            save: { state: 'SUPPORTED', authorization: 'NOT_AUTHORIZED', gate: 'HUMAN_CONSOLE_ONLY' },
            savedRevision: { state: 'SUPPORTED', kind: 'file-sha256' },
            apply: { state: 'UNSUPPORTED', reason: 'NO_LOADED_REVISION' },
            savedValues: { privateCount: 2, groupCount: 1, senderAllowedCount: 1, detailAvailable: false },
            runtime: runtime('DEGRADED', 'auth_required'),
            blockers: [['HUMAN_CONSOLE_ONLY', '只能在微信助手控制台中由人工修改，本插件不代写。'], ['NO_WRITE_AUTHORIZATION', '当前阶段仅只读，尚未获得生产写入授权。'], ['MIXED_WRITERS', '存在多个写入者且没有共享锁，自动写入可能丢失更新。']],
          })],
        },
        {
          id: 'core', label: 'Core 路径配置', authority: 'Whale Voice Core', component: 'core', version: '0.1.0', versionMatch: 'NOT_APPLICABLE', risk: 'HIGH',
          surfaces: [surface('paths', '组件根目录与 Qwen 地址', {
            readTiming: 'HOST_BOOT', hotReload: 'NONE', requiresRestart: 'REQUIRED',
            ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
            save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED', gate: 'NO_OWNER_API' },
            apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
            savedValues: { configured: true },
            runtime: runtime('AVAILABLE', 'host_read_only'),
            blockers: [['NO_OWNER_API', '组件没有受支持的写入接口。'], ['REQUIRES_RESTART', '修改后需要重启 Host。']],
          })],
        },
        {
          id: 'qwen', label: 'Qwen 运行状态', authority: 'Qwen3-TTS', component: 'qwen', version: null, versionMatch: 'NOT_APPLICABLE', risk: 'MEDIUM',
          surfaces: [surface('health', 'Qwen 健康与模型观察', {
            risk: 'MEDIUM', readTiming: 'ON_DEMAND', hotReload: 'NOT_APPLICABLE', requiresRestart: 'NOT_APPLICABLE',
            ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
            save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED', gate: 'NO_OWNER_API' },
            apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
            savedValues: { model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1' },
            runtime: runtime('AVAILABLE', 'ok'),
            blockers: [['OBSERVATION_ONLY', '只做健康观察，不构成配置写入或生效证明。']],
          })],
        },
      ],
      summary: { surfaceCount: 7, saveSupported: 2, notAuthorized: 7, writeEnabled: 0, unknown: 0 },
    }
  })()

  function bridge(mode) {
    if (mode === 'none') return undefined
    if (mode === 'invalid') {
      return {
        getStatus: async () => ({ schemaVersion: 2, completed: false }),
        getConfig: async () => ({ schemaVersion: 2 }),
        getConfigSources: async () => ({ sources: [] }),
        getConfigStatus: async () => ({ state: 'UNKNOWN' }),
        getCapabilities: async () => ({ schemaVersion: 2 }),
        getCapabilityStatus: async () => ({ schemaVersion: 2 }),
      }
    }
    if (mode === 'capability-invalid') {
      return {
        getStatus: async () => status,
        getCapabilities: async () => ({ schemaVersion: 2, ok: true, sources: [] }),
        getCapabilityStatus: async () => ({ schemaVersion: 2 }),
      }
    }
    if (mode === 'capability-missing') {
      return { getStatus: async () => status }
    }
    if (mode === 'timeout') {
      const pending = () => new Promise(() => {})
      return {
        getStatus: pending,
        getConfig: pending,
        getConfigSources: pending,
        getConfigStatus: pending,
        getCapabilities: pending,
        getCapabilityStatus: pending,
      }
    }
    if (mode === 'capability-timeout') {
      return {
        getStatus: async () => status,
        getCapabilities: () => new Promise(() => {}),
        getCapabilityStatus: () => new Promise(() => {}),
      }
    }
    if (mode === 'capability-race') {
      let calls = 0
      const stale = JSON.parse(JSON.stringify(capability))
      stale.observedAt = '2026-10-24T00:00:00.000Z'
      stale.components[0].label = 'Stale Capability'
      const fresh = JSON.parse(JSON.stringify(capability))
      fresh.observedAt = '2026-10-25T01:00:00.000Z'
      fresh.components[0].label = 'Fresh Capability'
      return {
        getStatus: async () => status,
        getCapabilities: () => {
          calls += 1
          if (calls === 1) return new Promise((resolve) => setTimeout(() => resolve(stale), 2000))
          return Promise.resolve(fresh)
        },
        getCapabilityStatus: async () => ({ schemaVersion: 3, ok: true, components: fresh.components, surfaces: [], summary: {} }),
      }
    }
    if (mode === 'capability-changed') {
      const changed = JSON.parse(JSON.stringify(capability))
      changed.sources.forEach((source) => {
        source.versionMatch = 'CHANGED'
        source.surfaces.forEach((surface) => {
          surface.readTiming = 'UNKNOWN'
          surface.hotReload = 'UNKNOWN'
          surface.requiresRestart = 'UNKNOWN'
          surface.save = { state: 'UNKNOWN', authorization: 'NOT_AUTHORIZED', enabled: false, gate: 'UNKNOWN' }
          surface.ownerApi = { state: 'UNKNOWN', kind: null, scope: null, endpoint: null }
          surface.apply = { state: 'UNKNOWN', reason: 'VERSION_NOT_AUDITED' }
          surface.blockers = [{ code: 'VERSION_NOT_AUDITED', message: '组件版本与审计版本不同，能力结论已降级为未知。', severity: 'blocked' }]
        })
      })
      changed.components.forEach((component) => { component.versionMatch = 'CHANGED' })
      return {
        getStatus: async () => status,
        getCapabilities: async () => changed,
        getCapabilityStatus: async () => ({ schemaVersion: 3, ok: true, components: changed.components, surfaces: [], summary: {} }),
      }
    }
    return {
      getStatus: async () => status,
      getConfig: async () => config,
      getConfigSources: async () => ({ sources }),
      getConfigStatus: async () => status.configStatus,
      getCapabilities: async () => capability,
      getCapabilityStatus: async () => ({ schemaVersion: 3, ok: true, components: capability.components, surfaces: [], summary: {} }),
    }
  }

  const fakeBridge = bridge(bridgeMode)
  if (fakeBridge) window.__WHALE_SETUP__ = Object.freeze(fakeBridge)

  // Plan 09 test-only adapter. It never touches production config; it records the calls the UI makes
  // and enforces the same confirmation/expiry/consumed/revision semantics as the real Coordinator.
  function createPlan09Adapter() {
    let revision = 4
    let sequence = 0
    const plans = new Map()
    const transactions = new Map()
    const calls = []
    const context = {
      workspace: 'fixture-workspace', profile: 'fixture-profile', manifestRevision: 2, capabilityRevision: 1,
      senderRevision: 4, gpuAvailable: true, cloudAuthorized: false, deliveryAuthorized: false,
    }
    const adapter = {
      calls,
      getContext() { calls.push('getContext'); return { ...context } },
      checkDependency(key) { calls.push('check:' + key); return { ready: key !== 'gpu' || context.gpuAvailable !== false } },
      bumpRevision() { revision += 1 },
      prepareChange(draft) {
        calls.push('prepareChange')
        if (!draft || draft.schemaVersion !== 1 || !draft.changes || !draft.changes.senderService) return { ok: false, error: { code: 'CONFIG_COORDINATION_SCHEMA_INVALID' } }
        const plan = { planId: 'fixture-plan-' + (++sequence), expectedRevision: revision, expiresAt: Date.now() + 60000, state: 'PREPARED', previewOnly: true, saved: false }
        plans.set(plan.planId, plan)
        return { ok: true, plan }
      },
      execute(planId, options = {}) {
        calls.push('execute')
        const plan = plans.get(planId)
        if (!plan) return { ok: false, error: { code: 'CONFIG_COORDINATION_PLAN_UNKNOWN' } }
        if (options.userConfirmed !== true || options.confirmedPlanId !== planId) return { ok: false, error: { code: 'CONFIG_COORDINATION_CONFIRMATION_REQUIRED' } }
        if (plan.consumed) return { ok: false, error: { code: 'CONFIG_COORDINATION_PLAN_CONSUMED' } }
        if (Date.now() > plan.expiresAt) return { ok: false, state: 'CONFLICT', error: { code: 'CONFIG_COORDINATION_PLAN_EXPIRED' } }
        if (plan.expectedRevision !== revision) return { ok: false, state: 'CONFLICT', error: { code: 'CONFIG_COORDINATION_CONFLICT' } }
        plan.consumed = true
        revision += 1
        const transactionId = 'fixture-tx-' + sequence
        const record = { ok: true, transactionId, state: 'SAVED', applyState: 'PENDING_APPLY', activeRevision: null, activeConfirmed: false }
        transactions.set(transactionId, record)
        return record
      },
      apply(transactionId) {
        calls.push('apply')
        const record = transactions.get(transactionId)
        if (!record) return { ok: false, state: 'UNKNOWN', error: { code: 'CONFIG_COORDINATION_UNKNOWN' } }
        return { ...record, state: 'PENDING_APPLY', applyState: 'PENDING_APPLY', activeRevision: null, activeConfirmed: false }
      },
      recover(transactionId) {
        calls.push('recover')
        const record = transactions.get(transactionId)
        return record ? { ...record, replayed: false } : { ok: false, state: 'UNKNOWN', error: { code: 'CONFIG_COORDINATION_UNKNOWN' } }
      },
    }
    window.__WHALE_PLAN09_ADAPTER_CALLS__ = calls
    return adapter
  }
  window.__WHALE_PLAN09_CONFIG__ = createPlan09Adapter()

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
