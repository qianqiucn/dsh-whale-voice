/* Whale Voice Core — read-only capability projection (Phase 4B-2B-2a).
 *
 * Pure projection over the existing detector/config snapshot. This module never reads a file,
 * calls a service, writes configuration or exposes private targets/tokens. Static capability
 * facts come from the Phase 4B-2B-1 audit; dynamic facts come from core/detect.mjs and
 * core/config.mjs.
 *
 * Schema v3 makes readTiming/hotReload/requiresRestart SURFACE-level: Sender automation has a
 * runtime PUT API, while Sender TTS is read at service boot and needs a reload. A source-level
 * value must never override a surface value.
 */

export const CAPABILITY_SCHEMA_VERSION = 3
export const CAPABILITY_WRITE_MODE = 'READ_ONLY'

export const AUDITED_VERSIONS = Object.freeze({
  wechatAgent: '0.3.9',
  senderService: '0.1.0',
  wechatHook: '4.1.10.27',
})

export const CAPABILITY_STATES = Object.freeze({
  ownerApi: Object.freeze(['AVAILABLE', 'UNSUPPORTED', 'UNKNOWN']),
  ownerApiKind: Object.freeze(['HTTP', 'HTTP_CONSOLE', 'FILE', 'NONE']),
  ownerApiScope: Object.freeze(['COMPONENT', 'HUMAN_CONSOLE', 'NONE']),
  revision: Object.freeze(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN']),
  save: Object.freeze(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN']),
  authorization: Object.freeze(['AUTHORIZED', 'NOT_AUTHORIZED', 'UNKNOWN']),
  apply: Object.freeze(['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN']),
  readTiming: Object.freeze(['PER_CALL', 'RUNTIME_API', 'SERVICE_BOOT', 'PER_JOB', 'HOST_BOOT', 'MIXED', 'ON_DEMAND', 'UNKNOWN']),
  hotReload: Object.freeze(['FULL', 'PARTIAL', 'NONE', 'NOT_APPLICABLE', 'UNKNOWN']),
  requiresRestart: Object.freeze(['REQUIRED', 'NOT_REQUIRED', 'NOT_APPLICABLE', 'UNKNOWN']),
  versionMatch: Object.freeze(['AUDITED', 'CHANGED', 'UNKNOWN', 'NOT_APPLICABLE']),
})

export const BLOCKER_MESSAGES = Object.freeze({
  NO_OWNER_API: '组件没有受支持的写入接口；直接改 JSON 不算受支持接口。',
  NO_WRITE_AUTHORIZATION: '当前阶段仅只读，尚未获得生产写入授权。',
  HUMAN_CONSOLE_ONLY: '只能在微信助手控制台中由人工修改，本插件不代写。',
  NO_LOADED_REVISION: '组件不返回已加载配置版本，无法确认保存值是否生效。',
  REQUIRES_RESTART: '修改后需要重新加载或重启对应组件才能生效。',
  READ_ONLY_PHASE: 'Phase 4B-2B-2a 只读展示，不提供写入入口。',
  NEVER_WRITE_BY_POLICY: 'Worker 最终安全许可必须保持独立，本插件永不写入。',
  MIXED_WRITERS: '存在多个写入者且没有共享锁，自动写入可能丢失更新。',
  OBSERVATION_ONLY: '只做健康观察，不构成配置写入或生效证明。',
  VERSION_NOT_AUDITED: '组件版本与审计版本不同，能力结论已降级为未知。',
  VERSION_UNKNOWN: '无法确认组件版本，能力结论保持未知。',
  COMPONENT_NOT_INSTALLED: '组件未安装或未配置，无法使用该能力。',
  COMPONENT_OFFLINE: '组件当前不可达或未运行，只能显示已保存配置。',
  AUTH_REQUIRED: '组件健康接口需要授权，未读取 Token，状态保持未知。',
  SAVED_CONFIG_UNAVAILABLE: '没有读到该配置项的保存值。',
  RUNTIME_UNKNOWN: '没有可信的运行时状态接口。',
})

const SURFACE_BLUEPRINTS = Object.freeze([
  {
    source: 'bridgeVoice',
    label: 'Bridge 语音开关',
    authority: 'WeChatAgent Bridge',
    component: 'bridge',
    versionFrom: 'wechatAgent',
    risk: 'CRITICAL',
    surfaces: [
      {
        surface: 'voiceSettings',
        label: 'Bridge 用户语音开关',
        risk: 'CRITICAL',
        ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
        save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'UNSUPPORTED', kind: null },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
        readTiming: 'PER_CALL',
        hotReload: 'FULL',
        requiresRestart: 'NOT_REQUIRED',
        blockers: ['NO_OWNER_API', 'NO_LOADED_REVISION', 'READ_ONLY_PHASE'],
      },
    ],
  },
  {
    source: 'senderService',
    label: 'Voice Sender 服务',
    authority: 'Voice Sender Service',
    component: 'sender',
    versionFrom: 'sender',
    risk: 'HIGH',
    surfaces: [
      {
        surface: 'automation',
        label: '发送自动化设置',
        risk: 'HIGH',
        ownerApi: { state: 'AVAILABLE', kind: 'HTTP', scope: 'COMPONENT', endpoint: 'PUT /v1/automation/config' },
        save: { state: 'SUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'UNSUPPORTED', kind: null },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_LOADED_REVISION' },
        readTiming: 'RUNTIME_API',
        hotReload: 'FULL',
        requiresRestart: 'NOT_REQUIRED',
        blockers: ['NO_WRITE_AUTHORIZATION', 'NO_LOADED_REVISION', 'READ_ONLY_PHASE'],
      },
      {
        surface: 'tts',
        label: 'TTS 音色与提供方',
        risk: 'HIGH',
        ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
        save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'UNSUPPORTED', kind: null },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
        readTiming: 'SERVICE_BOOT',
        hotReload: 'NONE',
        requiresRestart: 'REQUIRED',
        blockers: ['NO_OWNER_API', 'REQUIRES_RESTART', 'NO_LOADED_REVISION', 'READ_ONLY_PHASE'],
      },
    ],
  },
  {
    source: 'workerSafety',
    label: 'Worker 安全许可',
    authority: 'Voice Sender Worker',
    component: 'worker',
    versionFrom: 'sender',
    risk: 'CRITICAL',
    surfaces: [
      {
        surface: 'voicePermit',
        label: 'Worker 最终安全许可',
        risk: 'CRITICAL',
        policy: 'NEVER_WRITE',
        ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
        save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'UNSUPPORTED', kind: null },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
        readTiming: 'PER_JOB',
        hotReload: 'PARTIAL',
        requiresRestart: 'NOT_REQUIRED',
        blockers: ['NEVER_WRITE_BY_POLICY', 'NO_OWNER_API', 'NO_LOADED_REVISION'],
      },
    ],
  },
  {
    source: 'wechatPermissions',
    label: '微信权限范围',
    authority: 'WeChatAgent',
    component: 'wechatagent',
    versionFrom: 'wechatAgent',
    risk: 'CRITICAL',
    surfaces: [
      {
        surface: 'config',
        label: '微信私聊 / 群聊权限',
        risk: 'CRITICAL',
        ownerApi: { state: 'AVAILABLE', kind: 'HTTP_CONSOLE', scope: 'HUMAN_CONSOLE', endpoint: 'POST /api/config' },
        save: { state: 'SUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'SUPPORTED', kind: 'file-sha256' },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_LOADED_REVISION' },
        readTiming: 'MIXED',
        hotReload: 'PARTIAL',
        requiresRestart: 'REQUIRED',
        blockers: ['HUMAN_CONSOLE_ONLY', 'NO_WRITE_AUTHORIZATION', 'NO_LOADED_REVISION', 'MIXED_WRITERS', 'READ_ONLY_PHASE'],
      },
    ],
  },
  {
    source: 'core',
    label: 'Core 路径配置',
    authority: 'Whale Voice Core',
    component: 'core',
    versionFrom: null,
    risk: 'HIGH',
    surfaces: [
      {
        surface: 'paths',
        label: '组件根目录与 Qwen 地址',
        risk: 'HIGH',
        ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
        save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'UNSUPPORTED', kind: null },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
        readTiming: 'HOST_BOOT',
        hotReload: 'NONE',
        requiresRestart: 'REQUIRED',
        blockers: ['NO_OWNER_API', 'REQUIRES_RESTART'],
      },
    ],
  },
  {
    source: 'qwen',
    label: 'Qwen 运行状态',
    authority: 'Qwen3-TTS',
    component: 'qwen',
    versionFrom: null,
    risk: 'MEDIUM',
    surfaces: [
      {
        surface: 'health',
        label: 'Qwen 健康与模型观察',
        risk: 'MEDIUM',
        ownerApi: { state: 'UNSUPPORTED', kind: null, scope: null, endpoint: null },
        save: { state: 'UNSUPPORTED', authorization: 'NOT_AUTHORIZED' },
        savedRevision: { state: 'UNSUPPORTED', kind: null },
        loadedRevision: { state: 'UNSUPPORTED', kind: null },
        apply: { state: 'UNSUPPORTED', reason: 'NO_OWNER_API' },
        readTiming: 'ON_DEMAND',
        hotReload: 'NOT_APPLICABLE',
        requiresRestart: 'NOT_APPLICABLE',
        blockers: ['OBSERVATION_ONLY'],
      },
    ],
  },
])

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function unique(values) {
  return [...new Set(values)]
}

function versionMatchOf(componentId, version) {
  if (componentId === 'qwen' || componentId === 'core') return 'NOT_APPLICABLE'
  if (!version) return 'UNKNOWN'
  const expected = componentId === 'sender' || componentId === 'worker'
    ? AUDITED_VERSIONS.senderService
    : AUDITED_VERSIONS.wechatAgent
  return version === expected ? 'AUDITED' : 'CHANGED'
}

function versionFor(versionFrom, components) {
  if (!versionFrom) return null
  if (versionFrom === 'sender') return components.sender.version || null
  return components.wechatAgent.version || null
}

function guardedComponentState(value, mapped) {
  if (['ok', 'installed', 'connected', 'Available', 'available'].includes(value)) return mapped || 'AVAILABLE'
  if (['auth_required', 'not_running', 'timeout', 'connection_failed', 'degraded', 'invalid_response'].includes(value)) return mapped || 'DEGRADED'
  if (['not_installed', 'not_configured'].includes(value)) return mapped || 'UNAVAILABLE'
  return mapped || 'UNKNOWN'
}

function componentsFromDetected(detected) {
  const config = detected && typeof detected === 'object' ? detected.config : null
  const wa = detected && detected.wechatAgent && typeof detected.wechatAgent === 'object' ? detected.wechatAgent : {}
  const sender = detected && detected.sender && typeof detected.sender === 'object' ? detected.sender : {}
  const qwen = detected && detected.qwen && typeof detected.qwen === 'object' ? detected.qwen : {}
  const wechatVersion = text(wa.version) || null
  const senderVersion = text(sender.version) || (config && config.sender && text(config.sender.serviceVersion)) || null
  return {
    core: {
      id: 'core', label: 'Whale Voice Core', state: 'AVAILABLE', status: 'AVAILABLE',
      installed: true, version: '0.1.0', versionMatch: 'NOT_APPLICABLE',
      processRunning: true, health: 'ok', healthy: true, connected: true,
      observedAt: detected && detected.observedAt, error: null,
    },
    wechatAgent: {
      id: 'wechatagent', label: 'WeChatAgent', state: wa.state || 'unknown', status: guardedComponentState(wa.state),
      installed: boolOrNull(wa.installed), version: wechatVersion, versionMatch: versionMatchOf('wechatagent', wechatVersion),
      processRunning: boolOrNull(wa.processRunning), health: wa.bridge || wa.health || null,
      healthy: boolOrNull(wa.healthy), connected: boolOrNull(wa.connected),
      compatibility: wa.compatibility || null, observedAt: wa.observedAt || null, error: wa.error || null,
    },
    bridge: {
      id: 'bridge', label: 'WeChatAgent Bridge', state: wa.bridge || 'unknown', status: guardedComponentState(wa.bridge),
      installed: boolOrNull(wa.installed), version: wechatVersion, versionMatch: versionMatchOf('wechatagent', wechatVersion),
      processRunning: boolOrNull(wa.processRunning), health: wa.bridge || null,
      healthy: wa.bridge === 'ok' ? true : null, connected: wa.bridge === 'ok',
      observedAt: wa.observedAt || null, error: wa.bridge === 'ok' ? null : (wa.error || 'bridge_unavailable'),
    },
    sender: {
      id: 'sender', label: 'Voice Sender 服务', state: sender.state || 'unknown', status: guardedComponentState(sender.state),
      installed: boolOrNull(sender.installed), version: senderVersion, versionMatch: versionMatchOf('sender', senderVersion),
      processRunning: boolOrNull(sender.processRunning), health: sender.health || null,
      healthy: boolOrNull(sender.healthy), connected: sender.healthy === true,
      observedAt: sender.observedAt || null, error: sender.error || null,
    },
    worker: {
      id: 'worker', label: 'Voice Sender Worker', state: 'UNKNOWN', status: 'UNKNOWN',
      installed: null, version: senderVersion, versionMatch: versionMatchOf('worker', senderVersion),
      processRunning: null, health: 'not_observable', healthy: null, connected: null,
      observedAt: detected && detected.observedAt, error: 'not_observable',
    },
    qwen: {
      id: 'qwen', label: 'Qwen3-TTS', state: qwen.state || 'unknown', status: guardedComponentState(qwen.state),
      installed: null, version: null, versionMatch: 'NOT_APPLICABLE',
      processRunning: null, health: qwen.state || null, healthy: qwen.state === 'ok' ? true : null,
      connected: qwen.state === 'ok', model: qwen.model || null, voice: qwen.voice || null,
      observedAt: qwen.observedAt || null, error: qwen.error || null,
    },
  }
}

function blockersFor(surface, context) {
  const codes = unique([
    ...(surface.blockers || []),
    ...(context.versionMatch === 'AUDITED' || context.versionMatch === 'NOT_APPLICABLE'
      ? []
      : [context.versionMatch === 'CHANGED' ? 'VERSION_NOT_AUDITED' : 'VERSION_UNKNOWN']),
    ...(context.componentStatus === 'UNAVAILABLE' ? ['COMPONENT_NOT_INSTALLED'] : []),
    ...(context.componentStatus === 'DEGRADED' ? ['COMPONENT_OFFLINE'] : []),
    ...(context.authRequired ? ['AUTH_REQUIRED'] : []),
  ])
  return codes.map((code) => ({
    code,
    message: BLOCKER_MESSAGES[code] || code,
    severity: ['NO_WRITE_AUTHORIZATION', 'NO_OWNER_API', 'HUMAN_CONSOLE_ONLY', 'NEVER_WRITE_BY_POLICY', 'VERSION_NOT_AUDITED', 'VERSION_UNKNOWN', 'COMPONENT_NOT_INSTALLED'].includes(code)
      ? 'blocked'
      : ['COMPONENT_OFFLINE', 'AUTH_REQUIRED', 'MIXED_WRITERS', 'REQUIRES_RESTART'].includes(code) ? 'warn' : 'info',
  }))
}

function downgradeSurface(surface, versionMatch) {
  if (versionMatch === 'AUDITED' || versionMatch === 'NOT_APPLICABLE') return null
  return {
    ...surface,
    ownerApi: { ...surface.ownerApi, state: 'UNKNOWN' },
    save: { ...surface.save, state: 'UNKNOWN' },
    savedRevision: { state: 'UNKNOWN', kind: null },
    loadedRevision: { state: 'UNKNOWN', kind: null },
    apply: { state: 'UNKNOWN', reason: versionMatch === 'CHANGED' ? 'VERSION_NOT_AUDITED' : 'VERSION_UNKNOWN' },
    // Read/hot-reload/restart conclusions are version-specific: never present an audited
    // conclusion for an unaudited (or unknown) component version.
    readTiming: 'UNKNOWN',
    hotReload: 'UNKNOWN',
    requiresRestart: 'UNKNOWN',
  }
}

function savedFor(source, surface, config) {
  if (source === 'bridgeVoice' && surface === 'voiceSettings') {
    if (!config || !config.voice || config.voice.source !== 'voice-settings') {
      return { state: 'UNAVAILABLE', values: null, source: 'voice-settings.json' }
    }
    return {
      state: 'AVAILABLE',
      source: 'voice-settings.json#allow-listed',
      values: {
        enabled: config.voice.enabled,
        mode: config.voice.mode,
        forGroup: config.voice.forGroup,
        autoProbability: config.voice.autoProbability,
        defaultVoice: config.voice.defaultVoice,
      },
    }
  }
  if (source === 'senderService' && surface === 'automation') {
    const automation = config && config.sender ? config.sender.automation : null
    return automation
      ? { state: 'AVAILABLE', source: 'service.config.json#automation', values: automation }
      : { state: 'UNAVAILABLE', values: null, source: 'service.config.json#automation' }
  }
  if (source === 'senderService' && surface === 'tts') {
    if (!config || !config.tts || config.tts.provider === null && config.tts.voice === null) {
      return { state: 'UNAVAILABLE', values: null, source: 'service.config.json#tts' }
    }
    return {
      state: 'AVAILABLE',
      source: 'service.config.json#tts',
      values: { provider: config.tts.provider, model: config.tts.model, voice: config.tts.voice, configured: config.tts.configured },
    }
  }
  if (source === 'workerSafety') {
    const worker = config && config.voice ? config.voice.worker : null
    return worker
      ? { state: 'AVAILABLE', source: 'config.json#voice_enabled', values: { enabled: worker.enabled, mode: worker.mode, role: worker.role, forGroup: worker.forGroup } }
      : { state: 'UNAVAILABLE', values: null, source: 'config.json#voice_enabled' }
  }
  if (source === 'wechatPermissions') {
    const permissions = config ? config.permissions : null
    return permissions && permissions.readable
      ? { state: 'AVAILABLE', source: 'wechatagent.json#whitelist-counts', values: { privateCount: permissions.privateCount, groupCount: permissions.groupCount, senderAllowedCount: permissions.senderAllowedCount, detailAvailable: false } }
      : { state: 'UNAVAILABLE', values: null, source: 'wechatagent.json#whitelist-counts' }
  }
  if (source === 'core') {
    const sourceRows = config && Array.isArray(config.sources) ? config.sources : []
    const coreSource = sourceRows.find((row) => row.id === 'core-config')
    return coreSource && coreSource.readable
      ? { state: 'AVAILABLE', source: 'core.json', values: { configured: true } }
      : { state: 'UNKNOWN', values: null, source: 'core.json' }
  }
  if (source === 'qwen') {
    const runtime = config && config.tts ? config.tts.runtime : null
    return runtime && runtime.reachable
      ? { state: 'AVAILABLE', source: 'GET /health', values: { model: runtime.model, voice: runtime.voice, state: runtime.state } }
      : { state: 'UNKNOWN', values: null, source: 'GET /health' }
  }
  return { state: 'UNKNOWN', values: null, source: null }
}

function runtimeFor(source, surface, components) {
  if (source === 'bridgeVoice') {
    const bridge = components.bridge
    return { state: bridge.status, summary: bridge.state, observedAt: bridge.observedAt, error: bridge.error }
  }
  if (source === 'senderService') {
    const sender = components.sender
    if (surface === 'tts') {
      return {
        state: components.qwen.status === 'AVAILABLE' && sender.status === 'AVAILABLE' ? 'AVAILABLE' : sender.status,
        summary: 'Sender ' + sender.state + ' / Qwen ' + components.qwen.state,
        observedAt: sender.observedAt,
        error: sender.error || components.qwen.error || null,
      }
    }
    return { state: sender.status, summary: sender.state, observedAt: sender.observedAt, error: sender.error }
  }
  if (source === 'workerSafety') {
    return { state: 'UNKNOWN', summary: 'no_worker_status_interface', observedAt: components.worker.observedAt, error: 'not_observable' }
  }
  if (source === 'wechatPermissions') {
    return { state: components.wechatAgent.status, summary: components.wechatAgent.state, observedAt: components.wechatAgent.observedAt, error: components.wechatAgent.error }
  }
  if (source === 'core') {
    return { state: 'AVAILABLE', summary: 'host_read_only', observedAt: components.core.observedAt, error: null }
  }
  if (source === 'qwen') {
    return { state: components.qwen.status, summary: components.qwen.state, observedAt: components.qwen.observedAt, error: components.qwen.error }
  }
  return { state: 'UNKNOWN', summary: 'unknown', observedAt: null, error: 'unknown' }
}

function applyFor(source, surface, saved, runtime) {
  if (source === 'qwen' || source === 'core') {
    return { state: 'UNKNOWN', activeRevision: null, activeConfirmed: false, reason: 'OBSERVATION_ONLY' }
  }
  if (saved.state !== 'AVAILABLE') {
    return { state: 'UNKNOWN', activeRevision: null, activeConfirmed: false, reason: 'SAVED_CONFIG_UNAVAILABLE' }
  }
  if (runtime.state === 'UNAVAILABLE') {
    return { state: 'UNKNOWN', activeRevision: null, activeConfirmed: false, reason: 'COMPONENT_OFFLINE' }
  }
  return { state: 'UNKNOWN', activeRevision: null, activeConfirmed: false, reason: 'NO_LOADED_REVISION' }
}

function statusCounts(values) {
  const counts = {}
  for (const value of values) counts[value] = (counts[value] || 0) + 1
  return counts
}

function componentCounts(components) {
  const counts = { total: 0, available: 0, degraded: 0, unavailable: 0, unknown: 0 }
  for (const component of Object.values(components)) {
    counts.total += 1
    if (component.status === 'AVAILABLE') counts.available += 1
    else if (component.status === 'DEGRADED') counts.degraded += 1
    else if (component.status === 'UNAVAILABLE') counts.unavailable += 1
    else counts.unknown += 1
  }
  return counts
}

/**
 * Build the static capability contract joined with the current read-only runtime observation.
 * @param {{detected: object, now?: Function|Date}} options
 */
export function buildCapabilitySnapshot(options = {}) {
  const detected = options.detected && typeof options.detected === 'object' ? options.detected : {}
  const config = detected.config && typeof detected.config === 'object' ? detected.config : null
  const now = typeof options.now === 'function' ? options.now() : options.now instanceof Date ? options.now : new Date()
  const observedAt = (detected.observedAt && text(detected.observedAt)) || new Date(now).toISOString()
  const components = componentsFromDetected(detected)
  const sources = []
  const allBlockers = []
  const surfaces = []

  for (const blueprint of SURFACE_BLUEPRINTS) {
    const version = versionFor(blueprint.versionFrom, components)
    const versionMatch = blueprint.versionFrom ? versionMatchOf(blueprint.component, version) : 'NOT_APPLICABLE'
    const component = components[blueprint.component]
    const surfacesForSource = blueprint.surfaces.map((base) => {
      const downgraded = downgradeSurface(base, versionMatch)
      const surface = downgraded || base
      const saved = savedFor(blueprint.source, base.surface, config)
      const runtime = runtimeFor(blueprint.source, base.surface, components)
      const componentStatus = component ? component.status : 'UNKNOWN'
      const authRequired = component && component.state === 'auth_required'
      const blockers = blockersFor(surface, { versionMatch, componentStatus, authRequired })
      const apply = applyFor(blueprint.source, base.surface, saved, runtime)
      const entry = {
        id: base.surface,
        label: base.label,
        risk: base.risk,
        readTiming: surface.readTiming,
        hotReload: surface.hotReload,
        requiresRestart: surface.requiresRestart,
        ...(base.policy ? { policy: base.policy } : {}),
        ownerApi: { ...surface.ownerApi },
        save: {
          state: surface.save.state,
          authorization: surface.save.authorization,
          enabled: false,
          gate: surface.save.state === 'SUPPORTED'
            ? (surface.save.authorization === 'AUTHORIZED' ? 'PHASE_READ_ONLY' : (surface.ownerApi.scope === 'HUMAN_CONSOLE' ? 'HUMAN_CONSOLE_ONLY' : 'NO_WRITE_AUTHORIZATION'))
            : (surface.ownerApi.state === 'UNSUPPORTED' ? 'NO_OWNER_API' : 'UNKNOWN'),
        },
        savedRevision: { ...surface.savedRevision },
        loadedRevision: { ...surface.loadedRevision },
        apply: { ...surface.apply },
        status: {
          saved,
          runtime,
          apply,
          observedAt: runtime.observedAt || observedAt,
        },
        blockers,
      }
      allBlockers.push(...blockers.map((blocker) => ({ ...blocker, source: blueprint.source, surface: base.surface })))
      surfaces.push({ source: blueprint.source, surface: base.surface, blockers, saved, runtime, apply })
      return entry
    })
    sources.push({
      id: blueprint.source,
      label: blueprint.label,
      authority: blueprint.authority,
      component: blueprint.component,
      versionFrom: blueprint.versionFrom,
      version,
      versionMatch,
      risk: blueprint.risk,
      surfaces: surfacesForSource,
    })
  }

  const componentSummary = componentCounts(components)
  const surfaceEntries = sources.flatMap((source) => source.surfaces.map((surface) => ({ source, surface })))
  const saveStates = statusCounts(surfaceEntries.map(({ surface }) => surface.save.state))
  const authorizationStates = statusCounts(surfaceEntries.map(({ surface }) => surface.save.authorization))
  const applyStates = statusCounts(surfaceEntries.map(({ surface }) => surface.apply.state))
  const uniqueBlockerKeys = new Set(allBlockers.map((blocker) => blocker.source + '.' + blocker.surface + '.' + blocker.code))
  const summary = {
    writeMode: CAPABILITY_WRITE_MODE,
    surfaceCount: surfaceEntries.length,
    writeAuthorized: surfaceEntries.filter(({ surface }) => surface.save.authorization === 'AUTHORIZED').map(({ source, surface }) => source.id + '.' + surface.id),
    writeEnabled: [],
    saveSupported: surfaceEntries.filter(({ surface }) => surface.save.state === 'SUPPORTED').map(({ source, surface }) => source.id + '.' + surface.id),
    ownerApiAvailable: surfaceEntries.filter(({ surface }) => surface.ownerApi.state === 'AVAILABLE').map(({ source, surface }) => source.id + '.' + surface.id),
    loadedRevisionAvailable: surfaceEntries.filter(({ surface }) => surface.loadedRevision.state === 'SUPPORTED').map(({ source, surface }) => source.id + '.' + surface.id),
    applySupported: surfaceEntries.filter(({ surface }) => surface.apply.state === 'SUPPORTED').map(({ source, surface }) => source.id + '.' + surface.id),
    saveStates,
    authorizationStates,
    applyStates,
    components: componentSummary,
    blockerCount: uniqueBlockerKeys.size,
  }

  const uniqueBlockers = []
  const seen = new Set()
  for (const blocker of allBlockers) {
    const key = blocker.source + '.' + blocker.surface + '.' + blocker.code
    if (seen.has(key)) continue
    seen.add(key)
    uniqueBlockers.push(blocker)
  }

  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    ok: true,
    mode: 'read-only',
    writeMode: CAPABILITY_WRITE_MODE,
    observedAt,
    contract: {
      auditedAt: '2026-10-25',
      source: 'docs/PHASE4B2B1_COMPONENT_AUDIT.md',
      auditedVersions: { ...AUDITED_VERSIONS },
    },
    components: Object.values(components),
    sources,
    summary,
    blockers: uniqueBlockers,
  }
}

/** Project the runtime status portion of a capability snapshot for the status endpoint. */
export function buildCapabilityStatus(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== CAPABILITY_SCHEMA_VERSION) {
    return {
      schemaVersion: CAPABILITY_SCHEMA_VERSION,
      ok: false,
      mode: 'read-only',
      error: 'capability_invalid',
      observedAt: new Date().toISOString(),
      components: [],
      surfaces: [],
      summary: null,
    }
  }
  const surfaces = snapshot.sources.flatMap((source) => source.surfaces.map((surface) => ({
    source: source.id,
    surface: surface.id,
    label: surface.label,
    component: source.component,
    readTiming: surface.readTiming,
    hotReload: surface.hotReload,
    requiresRestart: surface.requiresRestart,
    saved: surface.status.saved,
    runtime: surface.status.runtime,
    apply: surface.status.apply,
    blockers: surface.blockers,
    observedAt: surface.status.observedAt,
  })))
  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    ok: true,
    mode: 'read-only',
    writeMode: CAPABILITY_WRITE_MODE,
    observedAt: snapshot.observedAt,
    components: snapshot.components,
    surfaces,
    summary: {
      components: snapshot.summary.components,
      surfaceCount: surfaces.length,
      blocked: surfaces.filter((surface) => surface.blockers.some((blocker) => blocker.severity === 'blocked')).length,
      observedAt: snapshot.observedAt,
    },
  }
}
