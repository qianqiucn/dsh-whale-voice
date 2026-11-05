/* Whale Voice Core — isolated generation-settings draft store (Plan10-R1 144/146/148).
 *
 * Fixed files under a trusted sandbox capability:
 *   - `generation-settings-draft.json`   the saved generation data location (144);
 *   - `generation-settings-applied.json` the explicitly applied location (146);
 *   - `qwen-runtime-draft.json`          the Qwen model directory and Python runtime path draft (148).
 *
 * Saving a draft never enables generation, starts a worker or model, executes Python, reads a model,
 * writes the production config, or touches an already running generation object; applying only records
 * the persisted fact. Reopening a store over the same sandbox reads the same saved values.
 */

import fs from 'node:fs'
import path from 'node:path'

import { isTrustedSandbox } from './config-sandbox.mjs'

export const GENERATION_SETTINGS_DRAFT_FILE = 'generation-settings-draft.json'
export const GENERATION_SETTINGS_APPLIED_FILE = 'generation-settings-applied.json'
export const QWEN_RUNTIME_DRAFT_FILE = 'qwen-runtime-draft.json'
export const GENERATION_SETTINGS_DRAFT_SCHEMA_VERSION = 1
export const GENERATION_SETTINGS_APPLIED_SCHEMA_VERSION = 1
export const QWEN_RUNTIME_DRAFT_SCHEMA_VERSION = 1

/** Read one fixed JSON record; a missing file is `null` and unparseable/non-object content is invalid. */
function readRecord(target) {
  let text
  try {
    text = fs.readFileSync(target, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { invalid: true }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { invalid: true }
  return parsed
}

function validPath(value) {
  return typeof value === 'string' && value !== ''
}

/**
 * Open the draft/applied store over one trusted sandbox.
 *
 * @param {{sandbox: object}} options
 * @returns {{read: Function, save: Function, readApplied: Function, apply: Function,
 *   readRuntimeDraft: Function, saveRuntimeDraft: Function}}
 */
export function openGenerationSettingsDraft(options = {}) {
  const sandbox = options.sandbox
  if (!isTrustedSandbox(sandbox)) throw new Error('trusted sandbox required')
  const target = path.join(sandbox.root, GENERATION_SETTINGS_DRAFT_FILE)
  const appliedTarget = path.join(sandbox.root, GENERATION_SETTINGS_APPLIED_FILE)
  const runtimeTarget = path.join(sandbox.root, QWEN_RUNTIME_DRAFT_FILE)

  function read() {
    const parsed = readRecord(target)
    if (parsed === null) return { ok: true, draft: null, savedAt: null }
    if (
      parsed.invalid ||
      parsed.schemaVersion !== GENERATION_SETTINGS_DRAFT_SCHEMA_VERSION ||
      !validPath(parsed.generationStorageRoot) ||
      typeof parsed.savedAt !== 'string'
    ) {
      return { ok: false, error: 'draft_invalid' }
    }
    return {
      ok: true,
      draft: { generationStorageRoot: parsed.generationStorageRoot },
      savedAt: parsed.savedAt,
    }
  }

  function save({ generationStorageRoot } = {}) {
    if (typeof generationStorageRoot !== 'string' || generationStorageRoot.trim() === '') {
      return { ok: false, error: 'draft_root_invalid' }
    }
    const root = generationStorageRoot.trim()
    if (!path.isAbsolute(root)) return { ok: false, error: 'draft_root_not_absolute' }
    const savedAt = new Date().toISOString()
    fs.writeFileSync(target, JSON.stringify({
      schemaVersion: GENERATION_SETTINGS_DRAFT_SCHEMA_VERSION,
      generationStorageRoot: root,
      savedAt,
    }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    return { ok: true, draft: { generationStorageRoot: root }, savedAt }
  }

  function readApplied() {
    const parsed = readRecord(appliedTarget)
    if (parsed === null) return { ok: true, applied: null, appliedAt: null }
    if (
      parsed.invalid ||
      parsed.schemaVersion !== GENERATION_SETTINGS_APPLIED_SCHEMA_VERSION ||
      !validPath(parsed.generationStorageRoot) ||
      typeof parsed.appliedAt !== 'string'
    ) {
      return { ok: false, error: 'applied_invalid' }
    }
    return {
      ok: true,
      applied: { generationStorageRoot: parsed.generationStorageRoot },
      appliedAt: parsed.appliedAt,
    }
  }

  function apply() {
    const current = read()
    if (!current.ok) return current
    if (!current.draft) return { ok: false, error: 'draft_missing' }
    const appliedAt = new Date().toISOString()
    fs.writeFileSync(appliedTarget, JSON.stringify({
      schemaVersion: GENERATION_SETTINGS_APPLIED_SCHEMA_VERSION,
      generationStorageRoot: current.draft.generationStorageRoot,
      appliedAt,
    }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    return {
      ok: true,
      applied: { generationStorageRoot: current.draft.generationStorageRoot },
      appliedAt,
    }
  }

  function readRuntimeDraft() {
    const parsed = readRecord(runtimeTarget)
    if (parsed === null) return { ok: true, runtimeDraft: null, savedAt: null }
    if (
      parsed.invalid ||
      parsed.schemaVersion !== QWEN_RUNTIME_DRAFT_SCHEMA_VERSION ||
      !validPath(parsed.modelDirectory) ||
      !validPath(parsed.pythonPath) ||
      typeof parsed.savedAt !== 'string'
    ) {
      return { ok: false, error: 'runtime_draft_invalid' }
    }
    return {
      ok: true,
      runtimeDraft: { modelDirectory: parsed.modelDirectory, pythonPath: parsed.pythonPath },
      savedAt: parsed.savedAt,
    }
  }

  function saveRuntimeDraft({ modelDirectory, pythonPath } = {}) {
    if (typeof modelDirectory !== 'string' || modelDirectory.trim() === '') {
      return { ok: false, error: 'runtime_model_invalid' }
    }
    if (typeof pythonPath !== 'string' || pythonPath.trim() === '') {
      return { ok: false, error: 'runtime_python_invalid' }
    }
    const model = modelDirectory.trim()
    const python = pythonPath.trim()
    if (!path.isAbsolute(model)) return { ok: false, error: 'runtime_model_not_absolute' }
    if (!path.isAbsolute(python)) return { ok: false, error: 'runtime_python_not_absolute' }
    const savedAt = new Date().toISOString()
    fs.writeFileSync(runtimeTarget, JSON.stringify({
      schemaVersion: QWEN_RUNTIME_DRAFT_SCHEMA_VERSION,
      modelDirectory: model,
      pythonPath: python,
      savedAt,
    }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    return { ok: true, runtimeDraft: { modelDirectory: model, pythonPath: python }, savedAt }
  }

  return Object.freeze({ read, save, readApplied, apply, readRuntimeDraft, saveRuntimeDraft })
}
