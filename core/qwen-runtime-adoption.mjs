/* Whale Voice Core — adopting an existing local Qwen runtime (183).
 *
 * The user points at the model directory and Python program of a local Qwen worker that already
 * exists on this machine. Whale Voice saves those two paths only into its own core config
 * (`qwenRuntime`), and the formal generation assembly consumes them on the next plugin open. Nothing
 * is downloaded, installed, started or executed here; the worker itself remains external.
 */

import fs from 'node:fs'
import path from 'node:path'

import { coreConfigFile, ioError, readCoreObject, writeCoreObject } from './adoption-store.mjs'
import { maskPath, sameLocation } from './detect.mjs'

function pathProblem(value) {
  if (typeof value !== 'string' || value.trim() === '' || /[\0\r\n]/.test(value)) return 'missing'
  if (!path.isAbsolute(value.trim())) return 'not_absolute'
  return null
}

function savedRuntime(data) {
  const runtime = data && data.qwenRuntime && typeof data.qwenRuntime === 'object' && !Array.isArray(data.qwenRuntime)
    ? data.qwenRuntime
    : {}
  const modelDirectory = typeof runtime.modelDirectory === 'string' ? runtime.modelDirectory.trim() : ''
  const pythonPath = typeof runtime.pythonPath === 'string' ? runtime.pythonPath.trim() : ''
  if (!modelDirectory || !pythonPath) return null
  return {
    modelDirectory,
    pythonPath,
    savedAt: typeof runtime.savedAt === 'string' ? runtime.savedAt : null,
  }
}

/** The saved local-Qwen runtime (masked) and whether the file could be read at all. */
export function readLocalQwenAdoption({ env = process.env } = {}) {
  const file = coreConfigFile(env)
  const read = readCoreObject(file)
  const saved = read.ok ? savedRuntime(read.data) : null
  return {
    ok: true,
    configPath: maskPath(file),
    saved: saved
      ? { modelDirectory: maskPath(saved.modelDirectory), pythonPath: maskPath(saved.pythonPath), savedAt: saved.savedAt }
      : null,
    raw: saved,
    readError: read.ok ? null : read.error,
  }
}

/**
 * Save one existing local Qwen runtime into Whale Voice's own config. Both paths must be absolute and
 * exist (directory / file); the model files themselves are not inspected or run.
 */
export function adoptLocalQwenRuntime({ modelDirectory, pythonPath, env = process.env, now = () => new Date() } = {}) {
  for (const [value, label] of [[modelDirectory, '模型目录'], [pythonPath, 'Python 运行程序']]) {
    const problem = pathProblem(value)
    if (problem === 'missing') {
      return { ok: false, status: 400, error: 'qwen_runtime_path_invalid', messageZh: '请填写本地 Qwen ' + label + '的绝对路径。' }
    }
    if (problem === 'not_absolute') {
      return { ok: false, status: 400, error: 'qwen_runtime_path_invalid', messageZh: '请填写本地 Qwen ' + label + '的绝对路径。' }
    }
  }
  let modelStat = null
  try {
    modelStat = fs.statSync(modelDirectory.trim())
  } catch {
    return { ok: false, status: 400, error: 'qwen_runtime_model_missing', messageZh: '模型目录不存在：' + modelDirectory.trim() + '；未写入任何内容。' }
  }
  if (!modelStat.isDirectory()) {
    return { ok: false, status: 400, error: 'qwen_runtime_model_missing', messageZh: '模型目录不是文件夹：' + modelDirectory.trim() + '；未写入任何内容。' }
  }
  let pythonStat = null
  try {
    pythonStat = fs.statSync(pythonPath.trim())
  } catch {
    return { ok: false, status: 400, error: 'qwen_runtime_python_missing', messageZh: 'Python 运行程序不存在：' + pythonPath.trim() + '；未写入任何内容。' }
  }
  if (!pythonStat.isFile()) {
    return { ok: false, status: 400, error: 'qwen_runtime_python_missing', messageZh: 'Python 运行程序不是文件：' + pythonPath.trim() + '；未写入任何内容。' }
  }
  const file = coreConfigFile(env)
  const existing = readCoreObject(file)
  if (!existing.ok) return { ok: false, status: 500, error: existing.error, messageZh: existing.messageZh }
  const savedAt = (now instanceof Date ? now : new Date(now())).toISOString()
  try {
    writeCoreObject(file, {
      ...existing.data,
      qwenRuntime: {
        modelDirectory: path.resolve(modelDirectory.trim()),
        pythonPath: path.resolve(pythonPath.trim()),
        savedAt,
      },
    })
  } catch (error) {
    const code = ioError(error)
    const messageZh = code === 'core_config_permission_denied'
      ? '没有权限写入 Whale Voice 配置文件；未修改任何内容。'
      : code === 'core_config_no_space'
        ? '保存 Whale Voice 配置时磁盘空间不足；未修改任何内容。'
        : '保存 Whale Voice 配置失败；未修改任何内容。'
    return { ok: false, status: 500, error: code, messageZh }
  }
  const adoption = readLocalQwenAdoption({ env })
  return { ok: true, savedAt, adoption: adoption.saved }
}

/** Saved vs. currently-running local-Qwen paths, with the pending-restart fact (masked display). */
export function localQwenAdoptionState({ env = process.env, running = null } = {}) {
  const adoption = readLocalQwenAdoption({ env })
  const saved = adoption.raw
  const runningRaw = running && typeof running.modelDirectory === 'string' && typeof running.pythonPath === 'string'
    && running.modelDirectory !== '' && running.pythonPath !== '' ? running : null
  const pendingRestart = Boolean(saved) && (!runningRaw
    || !sameLocation(saved.modelDirectory, runningRaw.modelDirectory)
    || !sameLocation(saved.pythonPath, runningRaw.pythonPath))
  return {
    saved: adoption.saved,
    running: runningRaw
      ? { modelDirectory: maskPath(runningRaw.modelDirectory), pythonPath: maskPath(runningRaw.pythonPath) }
      : null,
    pendingRestart,
    readError: adoption.readError,
  }
}
