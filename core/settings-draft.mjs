/* Whale Voice Core — isolated generation-settings draft store (Plan10-R1 144).
 *
 * One fixed draft file under a trusted sandbox capability. The draft records the user-facing
 * "generation data storage location" only: saving it never enables generation, starts a worker or
 * model, writes the production config, or touches an already running generation object. Reopening a
 * store over the same sandbox reads the same saved value.
 */

import fs from 'node:fs'
import path from 'node:path'

import { isTrustedSandbox } from './config-sandbox.mjs'

export const GENERATION_SETTINGS_DRAFT_FILE = 'generation-settings-draft.json'
export const GENERATION_SETTINGS_DRAFT_SCHEMA_VERSION = 1

/**
 * Open the draft store over one trusted sandbox.
 *
 * @param {{sandbox: object}} options
 * @returns {{read: Function, save: Function}}
 */
export function openGenerationSettingsDraft(options = {}) {
  const sandbox = options.sandbox
  if (!isTrustedSandbox(sandbox)) throw new Error('trusted sandbox required')
  const target = path.join(sandbox.root, GENERATION_SETTINGS_DRAFT_FILE)

  function read() {
    let text
    try {
      text = fs.readFileSync(target, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return { ok: true, draft: null, savedAt: null }
      throw error
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return { ok: false, error: 'draft_invalid' }
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      parsed.schemaVersion !== GENERATION_SETTINGS_DRAFT_SCHEMA_VERSION ||
      typeof parsed.generationStorageRoot !== 'string' ||
      parsed.generationStorageRoot === '' ||
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

  return Object.freeze({ read, save })
}
