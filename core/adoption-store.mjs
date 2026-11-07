/* Whale Voice Core — shared formal adoption storage (Plan 14).
 *
 * Both user adoptions (an existing WeChatAgent install, an existing local Qwen runtime) write only
 * Whale Voice's own core config file, preserving unrelated fields with an atomic replace. Nothing
 * here installs, starts, logs in or touches the adopted component's own configuration.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export function coreConfigFile(env = process.env) {
  const dshHome = env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'whale-voice', 'core.json')
}

export function ioError(error) {
  const code = error && error.code
  if (code === 'EACCES' || code === 'EPERM') return 'core_config_permission_denied'
  if (code === 'ENOSPC') return 'core_config_no_space'
  return 'core_config_save_failed'
}

export function readCoreObject(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: true, data: {} }
    if (error && (error.code === 'EACCES' || error.code === 'EPERM')) {
      return { ok: false, error: 'core_config_permission_denied', messageZh: '没有权限读取 Whale Voice 配置文件；未写入任何内容。' }
    }
    return { ok: false, error: 'core_config_read_failed', messageZh: '读取 Whale Voice 配置文件失败；未写入任何内容。' }
  }
  let data
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return { ok: false, error: 'core_config_invalid', messageZh: 'Whale Voice 配置文件不是有效的 JSON；未写入任何内容。请先修复或备份该文件。' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'core_config_invalid', messageZh: 'Whale Voice 配置文件内容无效；未写入任何内容。请先修复或备份该文件。' }
  }
  return { ok: true, data }
}

export function writeCoreObject(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
  const handle = fs.openSync(temp, 'wx', 0o600)
  try {
    fs.writeFileSync(handle, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fs.fsyncSync(handle)
  } finally {
    fs.closeSync(handle)
  }
  try {
    fs.renameSync(temp, file)
  } catch (error) {
    try { fs.rmSync(temp, { force: true }) } catch {}
    throw error
  }
}
