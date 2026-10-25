/* Whale Voice Core — read-only unified configuration snapshot.
 *
 * This module reads only an explicit allow-list of small JSON config files plus the runtime fields
 * supplied by the detector. It never writes, executes commands, reads tokens/databases/logs or
 * exposes raw private target lists.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'

export const CONFIG_SCHEMA_VERSION = 1
const MAX_JSON_BYTES = 512 * 1024
// Process-local HMAC key: the revision remains opaque and stable for the lifetime of this Host.
// A restart invalidates old revisions, which is correct: the frontend must re-read before writing.
const REVISION_KEY = randomBytes(32)

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function bool(value) {
  return typeof value === 'boolean' ? value : null
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function countArray(value) {
  return Array.isArray(value) ? value.length : null
}

function countKeys(value) {
  const object = asObject(value)
  return object ? Object.keys(object).length : null
}

function sortedList(value) {
  if (!Array.isArray(value)) return value == null ? null : canonicalize(value)
  return value
    .map((item) => JSON.stringify(canonicalize(item)))
    .sort()
    .map((item) => JSON.parse(item))
}

function readJsonFile(file) {
  if (!file) return { ok: false, error: 'not_configured', data: null }
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile()) return { ok: false, error: 'not_a_file', data: null }
    if (stat.size > MAX_JSON_BYTES) return { ok: false, error: 'too_large', data: null }
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (data && typeof data === 'object' && data.schemaVersion !== undefined && data.schemaVersion !== CONFIG_SCHEMA_VERSION) {
      return { ok: false, error: 'schema_unsupported', data: null }
    }
    return { ok: true, error: null, data }
  } catch (error) {
    const code = error && error.code
    if (code === 'ENOENT') return { ok: false, error: 'missing', data: null }
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, error: 'permission_denied', data: null }
    return { ok: false, error: 'invalid_json', data: null }
  }
}

function compareFields(left, right, fields) {
  if (!left || !right) return 'unknown'
  let compared = 0
  for (const field of fields) {
    const a = left[field]
    const b = right[field]
    if (a === null || a === undefined || b === null || b === undefined) continue
    compared += 1
    if (a !== b) return 'mismatch'
  }
  return compared > 0 ? 'match' : 'unknown'
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key])
    return result
  }
  return value === undefined ? null : value
}

function revisionFingerprint(value) {
  return createHmac('sha256', REVISION_KEY)
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
    .slice(0, 32)
}

function source(id, label, location, result, options = {}) {
  return {
    id,
    label,
    location,
    kind: options.kind || 'file',
    available: result.ok === true,
    readable: result.ok === true,
    error: result.ok ? null : result.error,
    sensitive: options.sensitive === true,
    exposed: options.exposed === true,
    version: options.version || null,
  }
}

/**
 * @param {object} options
 * @param {object} options.config  resolved Core paths (dshHome, configPath, roots)
 * @param {object} [options.runtime] detector output for sender/tts/wechatAgent
 * @param {Function|Date} [options.now]
 */
export function readConfigSnapshot(options = {}) {
  const config = asObject(options.config) || {}
  const runtime = asObject(options.runtime) || {}
  const observedAt = options.now instanceof Date
    ? options.now.toISOString()
    : typeof options.now === 'function'
      ? new Date(options.now()).toISOString()
      : new Date().toISOString()
  const sourceRows = []

  const coreResult = readJsonFile(config.configPath)
  sourceRows.push(source('core-config', 'Whale Voice Core 路径配置', '%DSH_HOME%/whale-voice/core.json', coreResult, { sensitive: false, exposed: true }))

  const waRoot = text(config.wechatAgentRoot)
  const waConfigPath = waRoot ? path.join(waRoot, 'data', 'workspace', 'config', 'wechatagent.json') : null
  const voiceSettingsPath = waRoot ? path.join(waRoot, 'data', 'workspace', 'state', 'voice-settings.json') : null
  const waResult = readJsonFile(waConfigPath)
  const voiceSettingsResult = readJsonFile(voiceSettingsPath)
  sourceRows.push(source('wechatagent-config', 'WeChatAgent 平台配置', '%WECHATAGENT_ROOT%/data/workspace/config/wechatagent.json', waResult, { sensitive: true, exposed: false }))
  sourceRows.push(source('voice-settings', '语音用户设置', '%WECHATAGENT_ROOT%/data/workspace/state/voice-settings.json', voiceSettingsResult, { sensitive: true, exposed: false }))

  const senderRoot = text(config.senderRoot)
  const serviceConfigPath = senderRoot ? path.join(senderRoot, 'service', 'service.config.json') : null
  const servicePackagePath = senderRoot ? path.join(senderRoot, 'service', 'package.json') : null
  const workerConfigPath = senderRoot ? path.join(senderRoot, 'config.json') : null
  const serviceResult = readJsonFile(serviceConfigPath)
  const servicePackage = readJsonFile(servicePackagePath)
  const workerResult = readJsonFile(workerConfigPath)
  sourceRows.push(source('sender-service', 'Voice Sender 服务配置', '%VOICE_SENDER_ROOT%/service/service.config.json', serviceResult, { sensitive: true, exposed: false }))
  sourceRows.push(source('sender-worker', 'Voice Sender Worker 配置', '%VOICE_SENDER_ROOT%/config.json', workerResult, { sensitive: true, exposed: false }))
  sourceRows.push({
    id: 'sender-targets',
    label: 'Voice Sender 目标映射',
    location: '%VOICE_SENDER_ROOT%/service/targets.json',
    kind: 'file',
    available: false,
    readable: false,
    error: 'not_read_private_targets',
    sensitive: true,
    exposed: false,
    version: null,
  })
  sourceRows.push({
    id: 'dsh-plugin-settings',
    label: 'DSH 插件设置',
    location: '当前 profile（无独立语音设置文件）',
    kind: 'runtime',
    available: false,
    readable: false,
    error: 'no_separate_plugin_settings',
    sensitive: false,
    exposed: false,
    version: null,
  })
  sourceRows.push({
    id: 'qwen-health',
    label: 'Qwen 健康接口',
    location: '%QWEN_URL%/health',
    kind: 'runtime',
    available: runtime.tts && runtime.tts.state === 'ok',
    readable: runtime.tts && runtime.tts.state === 'ok',
    error: null,
    sensitive: false,
    exposed: true,
    version: null,
  })

  const wa = asObject(waResult.data) || {}
  const waWechat = asObject(wa.wechat) || {}
  const whitelist = asObject(waWechat.whitelist) || {}
  const voiceSettings = asObject(voiceSettingsResult.data) || {}
  const worker = asObject(workerResult.data) || {}
  const service = asObject(serviceResult.data) || {}
  const serviceTts = asObject(service.tts) || {}
  const automation = asObject(service.automation) || {}
  const workerVoice = {
    enabled: bool(worker.voice_enabled),
    mode: text(worker.voice_auto_mode),
    forGroup: bool(worker.voice_allow_group_auto),
    autoFindWindow: bool(worker.voice_auto_find_window),
    autoOpenChat: bool(worker.voice_auto_open_chat),
    autoRestoreMinimized: bool(worker.voice_auto_restore_minimized),
    pauseWhenFullscreen: bool(worker.voice_pause_when_fullscreen),
  }
  const savedVoice = {
    enabled: bool(voiceSettings.enabled),
    mode: text(voiceSettings.mode),
    forGroup: bool(voiceSettings.for_group),
    autoProbability: number(voiceSettings.auto_probability),
    defaultVoice: text(voiceSettings.default_voice),
    allowedTargetCount: countKeys(voiceSettings.allowed_targets),
  }
  const voicePrimaryAvailable = voiceSettingsResult.ok
  const voice = {
    enabled: voicePrimaryAvailable ? savedVoice.enabled : null,
    mode: voicePrimaryAvailable ? savedVoice.mode : null,
    triggerMode: text(waWechat.wake_mode),
    forGroup: voicePrimaryAvailable ? savedVoice.forGroup : null,
    autoProbability: voicePrimaryAvailable ? savedVoice.autoProbability : null,
    defaultVoice: savedVoice.defaultVoice || text(serviceTts.voiceId),
    source: voicePrimaryAvailable ? 'voice-settings' : null,
    worker: workerResult.ok ? {
      source: 'sender-worker',
      enabled: workerVoice.enabled,
      mode: workerVoice.mode,
      forGroup: workerVoice.forGroup,
      role: 'final_safety_gate',
      note: 'Worker voice_enabled 是独立安全许可，不是 Bridge 用户开关；不会覆盖 Bridge 的 false。',
    } : null,
    semantics: 'bridge_user_setting_vs_worker_safety',
    consistency: 'not_comparable',
    active: {
      confirmed: false,
      enabled: null,
      mode: null,
      source: null,
      reason: 'no_runtime_config_interface',
    },
  }

  const senderRuntime = asObject(runtime.sender) || {}
  // The Worker is a standalone PowerShell script. If its own config ever declares a version,
  // use that; never substitute the Sender Service package version.
  const workerVersionField = text(worker.version) ? 'version' : (text(worker.worker_version) ? 'worker_version' : null)
  const workerVersion = workerVersionField ? text(worker[workerVersionField]) : null
  const sender = {
    configAvailable: serviceResult.ok || workerResult.ok,
    serviceVersion: servicePackage.ok && text(servicePackage.data.version) ? text(servicePackage.data.version) : null,
    workerVersion,
    workerVersionSource: workerVersionField ? 'config.json#' + workerVersionField : null,
    workerVersionNote: workerVersion ? 'worker_declared_version' : 'no_independent_worker_version_identifier',
    serviceRunning: senderRuntime.processRunning === true,
    configProcessMismatch: senderRuntime.processRunning === false && (serviceResult.ok || workerResult.ok) ? true : null,
    healthReachable: senderRuntime.healthReachable === true,
    healthy: bool(senderRuntime.healthy),
    recoveryPending: null,
    serviceWorkerConsistency: compareFields(automation, workerVoice, [
      'mode', 'autoFindWindow', 'autoOpenChat', 'autoRestoreMinimized', 'pauseWhenFullscreen',
    ]),
    allowListSource: 'service.config.json allowedChats',
    automation: serviceResult.ok ? {
      mode: text(automation.mode),
      autoFindWindow: bool(automation.autoFindWindow),
      autoOpenChat: bool(automation.autoOpenChat),
      autoRestoreMinimized: bool(automation.autoRestoreMinimized),
      pauseWhenFullscreen: bool(automation.pauseWhenFullscreen),
      focusFailure: text(automation.focusFailure),
      source: 'service.config.json#automation',
    } : null,
  }

  const permissions = {
    privateCount: countArray(whitelist.private),
    groupCount: countArray(whitelist.groups),
    senderAllowedCount: countArray(service.allowedChats),
    voiceSettingsAllowedCount: countKeys(voiceSettings.allowed_targets),
    detailAvailable: false,
    readable: waResult.ok,
    source: 'wechatagent-config.wechat.whitelist',
    note: '只返回数量；不读取或返回联系人/群聊名称。',
  }

  const tts = {
    provider: text(serviceTts.provider),
    model: text(serviceTts.model),
    voice: text(serviceTts.voiceId),
    baseUrlConfigured: Boolean(text(serviceTts.baseUrl)),
    configured: Boolean(text(serviceTts.provider) && text(serviceTts.voiceId) && text(serviceTts.baseUrl)),
    source: 'sender-service.tts',
    runtime: {
      reachable: runtime.tts && runtime.tts.state === 'ok',
      state: runtime.tts && runtime.tts.state ? runtime.tts.state : 'unknown',
      model: runtime.tts && text(runtime.tts.model) ? text(runtime.tts.model) : null,
      voice: runtime.tts && text(runtime.tts.voice) ? text(runtime.tts.voice) : null,
      preview: false,
    },
    mismatch: null,
  }
  if (tts.model && tts.runtime.model && tts.model !== tts.runtime.model) tts.mismatch = 'model'
  if (tts.voice && tts.runtime.voice && tts.voice !== tts.runtime.voice) tts.mismatch = tts.mismatch ? tts.mismatch + '+voice' : 'voice'

  const revisionMaterial = {
    voice: {
      enabled: savedVoice.enabled,
      mode: savedVoice.mode,
      triggerMode: text(waWechat.wake_mode),
      forGroup: savedVoice.forGroup,
      autoProbability: savedVoice.autoProbability,
      defaultVoice: savedVoice.defaultVoice || text(serviceTts.voiceId),
      allowedTargetIds: Object.keys(asObject(voiceSettings.allowed_targets) || {}).sort(),
      worker: workerResult.ok ? {
        enabled: workerVoice.enabled,
        mode: workerVoice.mode,
        forGroup: workerVoice.forGroup,
        autoFindWindow: workerVoice.autoFindWindow,
        autoOpenChat: workerVoice.autoOpenChat,
        autoRestoreMinimized: workerVoice.autoRestoreMinimized,
        pauseWhenFullscreen: workerVoice.pauseWhenFullscreen,
      } : null,
    },
    tts: {
      provider: text(serviceTts.provider),
      model: text(serviceTts.model),
      voice: text(serviceTts.voiceId),
      baseUrl: text(serviceTts.baseUrl),
      configured: Boolean(text(serviceTts.provider) && text(serviceTts.voiceId) && text(serviceTts.baseUrl)),
    },
    permissions: {
      privateIds: sortedList(waWechat.whitelist && waWechat.whitelist.private),
      groupIds: sortedList(waWechat.whitelist && waWechat.whitelist.groups),
      senderAllowedIds: sortedList(service.allowedChats),
      voiceSettingsAllowedIds: Object.keys(asObject(voiceSettings.allowed_targets) || {}).sort(),
    },
    sender: {
      serviceVersion: servicePackage.ok && text(servicePackage.data.version) ? text(servicePackage.data.version) : null,
      automation: canonicalize(automation),
    },
    sources: sourceRows.map((row) => ({
      id: row.id,
      available: row.available,
      readable: row.readable,
      error: row.error,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  }
  const savedRevision = revisionFingerprint(revisionMaterial)
  const hasReadableSource = coreResult.ok || waResult.ok || voiceSettingsResult.ok || serviceResult.ok || workerResult.ok
  const applicationState = sender.serviceWorkerConsistency === 'mismatch' ? 'MISMATCH' : 'UNKNOWN'

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    observedAt,
    readMode: 'read-only',
    configRevision: savedRevision,
    application: {
      savedRevision,
      activeRevision: null,
      state: applicationState,
      saved: hasReadableSource,
      activeConfirmed: false,
      revisionScope: ['voice', 'tts', 'permissions', 'sender', 'sources'],
      note: '未提供受支持的运行时配置版本接口；保存值不等于已生效。',
    },
    voice,
    tts,
    permissions,
    sender,
    sourceErrors: sourceRows.filter((row) => row.error).map((row) => ({ id: row.id, error: row.error })),
    sources: sourceRows,
  }
}

export function configStatusFromSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return { schemaVersion: CONFIG_SCHEMA_VERSION, available: false, state: 'UNKNOWN' }
  }
  return {
    schemaVersion: snapshot.schemaVersion,
    observedAt: snapshot.observedAt,
    configRevision: snapshot.configRevision,
    application: snapshot.application,
    voice: {
      enabled: snapshot.voice.enabled,
      mode: snapshot.voice.mode,
      triggerMode: snapshot.voice.triggerMode,
      forGroup: snapshot.voice.forGroup,
      autoProbability: snapshot.voice.autoProbability,
      defaultVoice: snapshot.voice.defaultVoice,
      worker: snapshot.voice.worker,
      semantics: snapshot.voice.semantics,
      consistency: snapshot.voice.consistency,
      activeConfirmed: snapshot.voice.active.confirmed,
    },
    tts: snapshot.tts,
    permissions: snapshot.permissions,
    sender: snapshot.sender,
    sources: snapshot.sources.map(({ id, available, readable, error, sensitive, exposed }) => ({ id, available, readable, error, sensitive, exposed })),
  }
}
