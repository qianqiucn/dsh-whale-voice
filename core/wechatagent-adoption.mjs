/* Whale Voice Core — adopting an existing WeChatAgent installation (182).
 *
 * The user picks an already-installed WeChatAgent root. Whale Voice writes that location only into
 * its own formal config file (`%DSH_HOME%/whale-voice/core.json`, the same file `readCoreConfig`
 * reads) and never into the WeChatAgent install's private config. Nothing is installed, started,
 * logged in or authenticated here; the environment variable WHALE_WECHATAGENT_HOME keeps its
 * precedence and is never modified.
 */

import path from 'node:path'

import { inspectWeChatAgentRoot } from '../packages/adapter-wechatagent/index.mjs'
import { coreConfigFile, ioError, readCoreObject, writeCoreObject } from './adoption-store.mjs'
import { maskPath, sameLocation } from './detect.mjs'

function sourceLabelOf(source) {
  return source === 'environment'
    ? '环境变量 WHALE_WECHATAGENT_HOME'
    : source === 'config' ? 'Whale Voice 配置文件 core.json' : '未配置'
}

/** The saved location, the location detection actually uses, and why (paths masked). */
export function readAdoption({ env = process.env } = {}) {
  const file = coreConfigFile(env)
  const read = readCoreObject(file)
  const savedRoot = read.ok && typeof read.data.wechatAgentRoot === 'string' ? read.data.wechatAgentRoot.trim() : ''
  const envRoot = String(env.WHALE_WECHATAGENT_HOME || '').trim()
  const effectiveRoot = envRoot || savedRoot
  const source = envRoot ? 'environment' : savedRoot ? 'config' : 'none'
  return {
    ok: true,
    configPath: maskPath(file),
    savedRoot: savedRoot ? maskPath(savedRoot) : '',
    effectiveRoot: effectiveRoot ? maskPath(effectiveRoot) : '',
    source,
    sourceLabel: sourceLabelOf(source),
    applied: Boolean(savedRoot) && sameLocation(savedRoot, effectiveRoot),
    readError: read.ok ? null : read.error,
  }
}

/**
 * Save one installed WeChatAgent root into Whale Voice's own config. The directory must be a
 * supported install (`app/resources/project/package.json`); the install's own data location is read
 * from its `app/storage.ini` declaration and is reported back, never rewritten.
 */
export function adoptWeChatAgentRoot({ root, env = process.env, now = () => new Date() } = {}) {
  if (typeof root !== 'string' || root.trim() === '' || /[\0\r\n]/.test(root)) {
    return { ok: false, status: 400, error: 'wechatagent_path_invalid', messageZh: '请选择 WeChatAgent 安装根目录（包含 app 与 data 的目录）。' }
  }
  const value = root.trim()
  if (!path.isAbsolute(value)) {
    return { ok: false, status: 400, error: 'wechatagent_path_invalid', messageZh: '请填写安装位置的绝对路径。' }
  }
  const inspected = inspectWeChatAgentRoot(value)
  if (!inspected.ok) {
    return {
      ok: false, status: 400, error: 'wechatagent_install_invalid',
      messageZh: '选择的目录不是受支持的 WeChatAgent 安装（缺少 app/resources/project/package.json）。',
    }
  }
  const file = coreConfigFile(env)
  const existing = readCoreObject(file)
  if (!existing.ok) return { ok: false, status: 500, error: existing.error, messageZh: existing.messageZh }
  try {
    writeCoreObject(file, { ...existing.data, wechatAgentRoot: inspected.root })
  } catch (error) {
    const code = ioError(error)
    const messageZh = code === 'core_config_permission_denied'
      ? '没有权限写入 Whale Voice 配置文件；未修改任何内容。'
      : code === 'core_config_no_space'
        ? '保存 Whale Voice 配置时磁盘空间不足；未修改任何内容。'
        : '保存 Whale Voice 配置失败；未修改任何内容。'
    return { ok: false, status: 500, error: code, messageZh }
  }
  const adoption = readAdoption({ env })
  return {
    ok: true,
    savedAt: (now instanceof Date ? now : new Date(now())).toISOString(),
    adoption: {
      ...adoption,
      install: {
        version: inspected.version,
        dataPath: maskPath(inspected.dataHome),
        dataSource: inspected.dataSource,
      },
    },
  }
}
