/* Whale Voice — pure capability/status view derivation (Phase 4B-2B-2a).
 *
 * Shared by the injected browser bundle and Node behavior tests. It contains no I/O, no shell and
 * no secret handling: it only maps a validated capability snapshot to user-facing labels, states
 * and blocker text. Unknown values stay unknown; nothing is inferred as "off" or "safe".
 */

const STATE_ZH = Object.freeze({
  AVAILABLE: '可用',
  DEGRADED: '降级',
  UNAVAILABLE: '不可用',
  UNKNOWN: '未知',
  SUPPORTED: '支持',
  UNSUPPORTED: '不支持',
  NOT_AUTHORIZED: '未授权',
  AUTHORIZED: '已授权',
  SAVED: '已保存',
  PENDING_APPLY: '已保存，生效未确认',
  APPLIED: '已生效',
  CONFLICT: '冲突',
  FAILED: '失败',
  READ_ONLY: '只读',
  ok: '正常',
  installed: '已安装',
  connected: '已连接',
  running: '运行中',
  healthy: '运行正常',
  auth_required: '需要授权',
  not_running: '未运行',
  connection_failed: '连接失败',
  timeout: '检测超时',
  not_installed: '未安装',
  not_configured: '未配置',
  incompatible: '版本不兼容',
  invalid_response: '响应无效',
  unsupported: '不支持',
  unknown: '未知',
  no_worker_status_interface: 'Worker 无独立状态接口',
  host_read_only: 'Host 只读接口在线',
  not_observable: '无法直接观察',
})

const READ_TEXT = Object.freeze({
  PER_CALL: '每次调用读取',
  RUNTIME_API: '运行时通过受支持接口更新',
  SERVICE_BOOT: '服务启动时读取',
  PER_JOB: '每个任务启动时读取',
  HOST_BOOT: 'Host 启动时读取',
  MIXED: '不同进程读取时机不同',
  ON_DEMAND: '按需观察',
  UNKNOWN: '读取时机未知',
})

const HOT_TEXT = Object.freeze({
  FULL: '无需重启即可看到更新',
  PARTIAL: '部分路径可热更新，另一些需要重启',
  NONE: '不会热更新',
  NOT_APPLICABLE: '不适用',
  UNKNOWN: '是否热更新未知',
})

const RESTART_TEXT = Object.freeze({
  REQUIRED: '需要重启或重新加载',
  NOT_REQUIRED: '无需重启',
  NOT_APPLICABLE: '不适用',
  UNKNOWN: '是否需要重启未知',
})

const VERSION_TEXT = Object.freeze({
  AUDITED: '已审计版本',
  CHANGED: '版本与审计不同，能力已降级',
  UNKNOWN: '版本未知',
  NOT_APPLICABLE: '不适用',
})

const TONE = Object.freeze({
  ok: 'ok',
  warn: 'warn',
  blocked: 'blocked',
  unknown: 'unknown',
})

export function capabilityStateText(state) {
  return STATE_ZH[state] || (state ? String(state) : '未知')
}

export function capabilityTone(state) {
  if (state === 'AVAILABLE' || state === 'SUPPORTED' || state === 'AUTHORIZED' || state === 'APPLIED' || state === 'SAVED') return TONE.ok
  if (state === 'UNSUPPORTED' || state === 'NOT_AUTHORIZED' || state === 'UNAVAILABLE' || state === 'FAILED' || state === 'CONFLICT') return TONE.blocked
  if (state === 'DEGRADED' || state === 'PENDING_APPLY') return TONE.warn
  return TONE.unknown
}

export function formatObservedAt(value) {
  if (!value) return '未知'
  return String(value).replace('T', ' ').replace(/\.\d+Z$/, 'Z').slice(0, 19)
}

function valueText(value) {
  if (value === true) return '开启'
  if (value === false) return '关闭'
  if (value === null || value === undefined) return '未知'
  return String(value)
}

function savedText(source, surface, saved) {
  if (!saved || saved.state !== 'AVAILABLE' || !saved.values) return '保存值未读取'
  const values = saved.values
  if (source === 'bridgeVoice') return 'Bridge 保存值：' + valueText(values.enabled)
  if (source === 'senderService' && surface === 'automation') {
    return '自动化：' + (values.mode || '未知') + ' · 自动发现窗口 ' + valueText(values.autoFindWindow)
  }
  if (source === 'senderService' && surface === 'tts') {
    return 'Provider ' + (values.provider || '未知') + ' · 音色 ' + (values.voice || '未知')
  }
  if (source === 'workerSafety') return 'Worker 最终安全许可：' + valueText(values.enabled) + '（独立安全层）'
  if (source === 'wechatPermissions') {
    return '已保存范围：私聊 ' + (values.privateCount ?? '未知') + ' / 群聊 ' + (values.groupCount ?? '未知') + '（不返回名单）'
  }
  if (source === 'core') return '组件路径已配置：' + valueText(values.configured)
  if (source === 'qwen') return '模型 ' + (values.model || '未知') + ' · 音色 ' + (values.voice || '未知')
  return '保存值已读取'
}

function runtimeText(runtime) {
  if (!runtime) return '运行时状态未知'
  const summary = runtime.summary && runtime.summary !== runtime.state ? capabilityStateText(runtime.summary) : ''
  return capabilityStateText(runtime.state) + (summary && summary !== '未知' ? ' · ' + summary : '')
}

function applyText(apply, capabilityApply) {
  if (capabilityApply && capabilityApply.state === 'SUPPORTED') {
    if (apply && apply.state === 'APPLIED') return '已生效（有 loaded revision 证据）'
    if (apply && apply.state === 'PENDING_APPLY') return '已保存，生效未确认'
    return '生效状态：' + capabilityStateText(apply && apply.state) + (apply && apply.reason ? ' · ' + apply.reason : '')
  }
  return '生效无法确认：组件没有 loaded revision 接口'
}

function surfaceItem(source, surface, key) {
  const status = surface.status && typeof surface.status === 'object' ? surface.status : {}
  const blockers = Array.isArray(surface.blockers) ? surface.blockers : []
  const blocked = blockers.some((blocker) => blocker.severity === 'blocked')
  const capabilityToneValue = blocked ? TONE.blocked
    : surface.save.state === 'SUPPORTED' ? TONE.ok
      : surface.save.state === 'UNKNOWN' ? TONE.unknown : TONE.warn
  return {
    key,
    source: source.id,
    sourceLabel: source.label,
    surface: surface.id,
    label: surface.label,
    risk: surface.risk,
    readTiming: surface.readTiming,
    hotReload: surface.hotReload,
    requiresRestart: surface.requiresRestart,
    readText: READ_TEXT[surface.readTiming] || READ_TEXT.UNKNOWN,
    hotText: HOT_TEXT[surface.hotReload] || HOT_TEXT.UNKNOWN,
    restartText: RESTART_TEXT[surface.requiresRestart] || RESTART_TEXT.UNKNOWN,
    ownerApiText: surface.ownerApi && surface.ownerApi.state === 'AVAILABLE'
      ? '组件接口存在（' + (surface.ownerApi.endpoint || surface.ownerApi.kind || '未知') + '）'
      : surface.ownerApi && surface.ownerApi.state === 'UNKNOWN' ? '组件接口未知' : '组件无写入接口',
    ownerApiState: surface.ownerApi ? surface.ownerApi.state : 'UNKNOWN',
    saveState: surface.save.state,
    authorization: surface.save.authorization,
    saveStateText: '保存能力：' + capabilityStateText(surface.save.state),
    authorizationText: '写入授权：' + capabilityStateText(surface.save.authorization),
    enabled: surface.save.enabled === true,
    gate: surface.save.gate || 'UNKNOWN',
    savedText: savedText(source.id, surface.id, status.saved),
    savedState: status.saved && status.saved.state ? status.saved.state : 'UNKNOWN',
    runtimeText: runtimeText(status.runtime),
    runtimeState: status.runtime && status.runtime.state ? status.runtime.state : 'UNKNOWN',
    applyText: applyText(status.apply, surface.apply),
    applyState: status.apply && status.apply.state ? status.apply.state : 'UNKNOWN',
    applyCapability: surface.apply ? surface.apply.state : 'UNKNOWN',
    activeConfirmed: Boolean(status.apply && status.apply.activeConfirmed),
    blockers: blockers.map((blocker) => ({
      code: blocker.code,
      text: blocker.message || blocker.code,
      severity: blocker.severity || 'info',
    })),
    tone: capabilityToneValue,
    observedAt: status.observedAt || source.observedAt || null,
  }
}

function componentItem(component) {
  return {
    id: component.id,
    label: component.label,
    state: component.state,
    stateText: capabilityStateText(component.status),
    rawStateText: capabilityStateText(component.state),
    tone: capabilityTone(component.status),
    version: component.version || null,
    versionText: component.version ? 'v' + component.version : '版本未知',
    versionMatch: component.versionMatch || 'UNKNOWN',
    versionMatchText: VERSION_TEXT[component.versionMatch] || VERSION_TEXT.UNKNOWN,
    observedAt: component.observedAt || null,
    observedText: formatObservedAt(component.observedAt),
  }
}

/**
 * @param {object} snapshot validated capability snapshot (schemaVersion 3)
 * @returns {object} view model used by pages and tests
 */
export function deriveCapabilityView(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 3 || snapshot.ok !== true || !Array.isArray(snapshot.sources)) {
    return {
      available: false,
      reason: 'capability_invalid',
      headline: '能力数据不可用：需要 Whale Voice Core 的只读能力接口。',
      summary: null,
      components: [],
      surfaces: [],
      groups: {},
      blockedReasons: [],
    }
  }
  const sources = snapshot.sources.filter((source) => source && Array.isArray(source.surfaces))
  const surfaces = sources.flatMap((source) => source.surfaces.map((surface) => surfaceItem(source, surface, source.id + '.' + surface.id)))
  const byKey = new Map(surfaces.map((item) => [item.key, item]))
  const components = Array.isArray(snapshot.components) ? snapshot.components.map(componentItem) : []
  const saveSupported = surfaces.filter((surface) => surface.saveState === 'SUPPORTED')
  const notAuthorized = surfaces.filter((surface) => surface.authorization === 'NOT_AUTHORIZED')
  const unknown = surfaces.filter((surface) => surface.saveState === 'UNKNOWN' || surface.tone === TONE.unknown)
  const blockedReasons = []
  const seenBlockers = new Set()
  for (const surface of surfaces) {
    for (const blocker of surface.blockers) {
      if (blocker.severity !== 'blocked' || seenBlockers.has(blocker.code)) continue
      seenBlockers.add(blocker.code)
      blockedReasons.push({ code: blocker.code, text: blocker.text, source: surface.sourceLabel, surface: surface.label })
    }
  }
  const componentSummary = components.reduce((acc, component) => {
    acc[component.tone] = (acc[component.tone] || 0) + 1
    return acc
  }, {})
  const summary = {
    surfaceCount: surfaces.length,
    saveSupported: saveSupported.length,
    notAuthorized: notAuthorized.length,
    unknown: unknown.length,
    writeEnabled: surfaces.filter((surface) => surface.enabled).length,
    activeConfirmed: surfaces.filter((surface) => surface.activeConfirmed).length,
    componentSummary,
    blockedReasonCount: blockedReasons.length,
  }
  const groups = {
    bridge: byKey.get('bridgeVoice.voiceSettings') || null,
    senderAutomation: byKey.get('senderService.automation') || null,
    senderTts: byKey.get('senderService.tts') || null,
    worker: byKey.get('workerSafety.voicePermit') || null,
    wechat: byKey.get('wechatPermissions.config') || null,
    core: byKey.get('core.paths') || null,
    qwen: byKey.get('qwen.health') || null,
  }
  return {
    available: true,
    schemaVersion: snapshot.schemaVersion,
    writeMode: snapshot.writeMode || 'READ_ONLY',
    observedAt: snapshot.observedAt || null,
    observedText: formatObservedAt(snapshot.observedAt),
    headline: '只读阶段：可读取 ' + summary.surfaceCount + ' 个配置面，' + summary.saveSupported + ' 个支持保存，'
      + summary.notAuthorized + ' 个未授权写入，' + summary.writeEnabled + ' 个可执行写入。',
    summary,
    components,
    surfaces,
    groups,
    blockedReasons,
  }
}
