/* Whale Voice Core — isolated generation-settings draft store (Plan10-R1 144/146).
 *
 * Two fixed files under a trusted sandbox capability:
 *   - `generation-settings-draft.json`  the saved draft location (144);
 *   - `generation-settings-applied.json` the explicitly applied location (146).
 *
 * Saving a draft never enables generation, starts a worker or model, writes the production config, or
 * touches an already running generation object; applying only records the persisted fact, so the
 * plugin's current runtime keeps its original location and the applied location is used when the
 * plugin is opened again. Reopening a store over the same sandbox reads the same saved values.
 */

import fs from 'node:fs'
import path from 'node:path'

import { isTrustedSandbox } from './config-sandbox.mjs'

export const GENERATION_SETTINGS_DRAFT_FILE = 'generation-settings-draft.json'
export const GENERATION_SETTINGS_APPLIED_FILE = 'generation-settings-applied.json'
export const GENERATION_SETTINGS_DRAFT_SCHEMA_VERSION = 1
export const GENERATION_SETTINGS_APPLIED_SCHEMA_VERSION = 1

function readRecord(target, invalidError) {
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
    return { invalid: invalidError }
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    typeof parsed.generationStorageRoot !== 'string' ||
    parsed.generationStorageRoot === ''
  ) {
    return { invalid: invalidError }
  }
  return parsed
}

/**
 * Open the draft/applied store over one trusted sandbox.
 *
 * @param {{sandbox: object}} options
 * @returns {{read: Function, save: Function, readApplied: Function, apply: Function}}
 */
export function openGenerationSettingsDraft(options = {}) {
  const sandbox = options.sandbox
  if (!isTrustedSandbox(sandbox)) throw new Error('trusted sandbox required')
  const target = path.join(sandbox.root, GENERATION_SETTINGS_DRAFT_FILE)
  const appliedTarget = path.join(sandbox.root, GENERATION_SETTINGS_APPLIED_FILE)

  function read() {
    const parsed = readRecord(target, 'draft_invalid')
    if (parsed === null) return { ok: true, draft: null, savedAt: null }
    if (parsed.invalid) return { ok: false, error: parsed.invalid }
    if (parsed.schemaVersion !== GENERATION_SETTINGS_DRAFT_SCHEMA_VERSION || typeof parsed.savedAt !== 'string') {
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
    const parsed = readRecord(appliedTarget, 'applied_invalid')
    if (parsed === null) return { ok: true, applied: null, appliedAt: null }
    if (parsed.invalid) return { ok: false, error: parsed.invalid }
    if (parsed.schemaVersion !== GENERATION_SETTINGS_APPLIED_SCHEMA_VERSION || typeof parsed.appliedAt !== 'string') {
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

  return Object.freeze({ read, save, readApplied, apply })
}
