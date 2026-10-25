/* Whale Voice Core — isolated configuration coordination protocol (Phase 4B-2A).
 *
 * This module is orchestration-only. It never derives a production path, never writes a production
 * file, and never starts/stops a service. Source adapters own their own single-file writes; the
 * built-in adapter in tests is an in-memory fixture. A future production adapter must use the
 * owning component's supported API and the existing ConfigStore/atomic primitives.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { createConfigStore } from './config-store.mjs'
import { canonicalize } from './config-schema.mjs'
import { isInside, isTrustedSandbox } from './config-sandbox.mjs'

export const COORDINATION_SCHEMA_VERSION = 1
export const COORDINATION_JOURNAL_VERSION = 1

export const COORDINATION_STATES = Object.freeze({
  PREPARED: 'PREPARED',
  VALIDATING: 'VALIDATING',
  SAVING: 'SAVING',
  SAVED: 'SAVED',
  PENDING_APPLY: 'PENDING_APPLY',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  PARTIALLY_APPLIED: 'PARTIALLY_APPLIED',
  CONFLICT: 'CONFLICT',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
})

export const COORDINATION_LIMITS = Object.freeze({
  maxSourcesPerChange: 3,
  maxPlans: 32,
  maxExpectedRevisionLength: 32,
  maxTransactionIdLength: 64,
})

const REVISION_PATTERN = /^[a-f0-9]{32}$/
const TRANSACTION_PATTERN = /^[a-f0-9]{32}$/
const SOURCE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,31}$/
const JOURNAL_DIR = '.whale-coordination'
const ANCHOR_FILE = 'coordination-anchor.json'
const WRITABLE_SOURCES = new Set(['bridgeVoice', 'senderService'])
const READ_ONLY_SOURCES = new Set(['core', 'workerSafety', 'wechatPermissions', 'ttsProvider', 'targetMap', 'qwenRuntime'])

const SOURCE_DEFINITIONS = Object.freeze({
  core: Object.freeze({
    id: 'core',
    order: 0,
    authority: 'Whale Voice Core',
    location: '%DSH_HOME%/whale-voice/core.json',
    writable: false,
    sensitive: false,
    risk: 'HIGH',
    hotReload: false,
    requiresReload: true,
    runtimeConfirmation: false,
    multiFile: false,
    recovery: 'atomic-single-file (future adapter)',
    externalSideEffects: ['host reload may be required'],
    rationale: 'Core roots and Qwen URL are path/URL-like; Phase 4B-2A does not accept paths or URLs from a client.',
  }),
  bridgeVoice: Object.freeze({
    id: 'bridgeVoice',
    order: 1,
    authority: 'Bridge user voice settings',
    location: '%WECHATAGENT_ROOT%/data/workspace/state/voice-settings.json',
    writable: true,
    sensitive: true,
    risk: 'CRITICAL',
    hotReload: true,
    requiresReload: false,
    runtimeConfirmation: false,
    multiFile: false,
    recovery: 'atomic-single-file',
    externalSideEffects: ['may enable a voice path at the Bridge'],
    rationale: 'Bridge enabled=false rejects before Sender. This is a user setting, not the Worker final-safety permit.',
  }),
  senderService: Object.freeze({
    id: 'senderService',
    order: 2,
    authority: 'Voice Sender Service',
    location: '%VOICE_SENDER_ROOT%/service/service.config.json',
    writable: true,
    sensitive: true,
    risk: 'HIGH',
    hotReload: false,
    requiresReload: true,
    runtimeConfirmation: false,
    multiFile: true,
    recovery: 'component-owned atomic/reload path (future adapter)',
    externalSideEffects: ['may change TTS provider/voice', 'may require service reload'],
    rationale: 'TTS provider/voice/automation are saved in the Sender service config. Paths, tokens and allowedChats are not accepted.',
  }),
  workerSafety: Object.freeze({
    id: 'workerSafety',
    order: 3,
    authority: 'Voice Sender Worker',
    location: '%VOICE_SENDER_ROOT%/config.json',
    writable: false,
    sensitive: true,
    risk: 'CRITICAL',
    hotReload: true,
    requiresReload: false,
    runtimeConfirmation: false,
    multiFile: false,
    recovery: 'not writable in this phase',
    externalSideEffects: ['final safety permit must never be bypassed'],
    finalSafetyGate: true,
    rationale: 'voice_enabled is the Worker independent final-safety gate. It is separate from Bridge voice.enabled and is not a coordinator write target.',
  }),
  wechatPermissions: Object.freeze({
    id: 'wechatPermissions',
    order: 4,
    authority: 'WeChatAgent',
    location: '%WECHATAGENT_ROOT%/data/workspace/config/wechatagent.json',
    writable: false,
    sensitive: true,
    risk: 'CRITICAL',
    hotReload: false,
    requiresReload: true,
    runtimeConfirmation: false,
    multiFile: false,
    recovery: 'not writable in this phase',
    externalSideEffects: ['must not expand private/group permissions automatically'],
    rationale: 'Whitelist entries and target identity are private and are not accepted or exposed in this phase.',
  }),
  ttsProvider: Object.freeze({
    id: 'ttsProvider',
    order: 5,
    authority: 'Provider configuration layer',
    location: '%VOICE_SENDER_ROOT%/service/service.config.json + Qwen /health',
    writable: false,
    sensitive: false,
    risk: 'HIGH',
    hotReload: false,
    requiresReload: true,
    runtimeConfirmation: 'Qwen health observation only; not a config-version proof',
    multiFile: true,
    recovery: 'through senderService only',
    externalSideEffects: ['model/voice mismatch if service/runtime diverge'],
    coordinatorSource: 'senderService',
    rationale: 'TTS provider/voice are managed through senderService; Qwen health is observational and cannot prove the saved config was applied.',
  }),
  targetMap: Object.freeze({
    id: 'targetMap',
    order: 6,
    authority: 'Voice Sender',
    location: '%VOICE_SENDER_ROOT%/service/targets.json',
    writable: false,
    sensitive: true,
    risk: 'CRITICAL',
    hotReload: false,
    requiresReload: false,
    runtimeConfirmation: false,
    multiFile: false,
    recovery: 'never read or written in this phase',
    externalSideEffects: ['private target identity must not be expanded'],
    rationale: 'Never read, never returned, never written by the coordinator.',
  }),
  qwenRuntime: Object.freeze({
    id: 'qwenRuntime',
    order: 7,
    authority: 'Qwen runtime observation',
    location: '%QWEN_URL%/health',
    writable: false,
    sensitive: false,
    risk: 'MEDIUM',
    hotReload: true,
    requiresReload: false,
    runtimeConfirmation: 'health observation only; not saved config apply proof',
    multiFile: false,
    recovery: 'not applicable',
    externalSideEffects: [],
    rationale: 'A 200/health/model response is an observation, not proof that the Bridge or Worker loaded the saved config.',
  }),
})

const FIELD_RULES = Object.freeze({
  bridgeVoice: Object.freeze({
    enabled: 'boolean',
    mode: 'mode',
    forGroup: 'boolean',
    autoProbability: 'probability',
    defaultVoice: 'text',
  }),
  senderService: Object.freeze({
    'tts.provider': 'provider',
    'tts.model': 'nullableText',
    'tts.voice': 'text',
    automation: 'automation',
  }),
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString()
  if (typeof now === 'function') return new Date(now()).toISOString()
  return new Date().toISOString()
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function planIdFor(entries) {
  return digest({
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    sources: entries.map((entry) => ({
      source: entry.source,
      expectedRevision: entry.expectedRevision,
      currentRevision: entry.currentRevision,
      fields: entry.fields,
    })),
  }).slice(0, 32)
}

function publicSourceDefinition(definition) {
  return {
    id: definition.id,
    authority: definition.authority,
    location: definition.location,
    writable: definition.writable,
    sensitive: definition.sensitive === true,
    risk: definition.risk,
    hotReload: definition.hotReload === true,
    requiresReload: definition.requiresReload === true,
    runtimeConfirmation: definition.runtimeConfirmation,
    multiFile: definition.multiFile === true,
    recovery: definition.recovery,
    finalSafetyGate: definition.finalSafetyGate === true,
    externalSideEffects: [...(definition.externalSideEffects || [])],
    coordinatorSource: definition.coordinatorSource || definition.id,
    rationale: definition.rationale,
  }
}

function sanitizeIssues(issues) {
  if (!Array.isArray(issues)) return []
  return issues.slice(0, 20).map((issue) => ({
    code: typeof issue?.code === 'string' ? issue.code : 'INVALID',
    path: typeof issue?.path === 'string' ? issue.path : '$',
    reason: typeof issue?.reason === 'string' ? issue.reason : 'invalid',
  }))
}

function invalid(code, state, message, extra = {}) {
  return {
    ok: false,
    state,
    error: { code, message, ...extra },
  }
}

function journalPublic(record) {
  return {
    transactionId: record.transactionId,
    planId: record.planId,
    phase: record.phase,
    committed: record.committed === true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    requiresUserConfirmation: record.requiresUserConfirmation === true,
    errorCode: record.errorCode || null,
    steps: (record.steps || []).map((step) => ({
      source: step.source,
      status: step.status,
      expectedRevision: step.expectedRevision,
      savedRevision: step.savedRevision || null,
      applyStatus: step.applyStatus || 'NOT_REQUESTED',
      activeRevision: step.activeRevision || null,
      errorCode: step.errorCode || null,
    })),
  }
}

export function getConfigAuthorityMatrix() {
  return Object.values(SOURCE_DEFINITIONS)
    .sort((a, b) => a.order - b.order)
    .map(publicSourceDefinition)
}

export class ConfigCoordinatorError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ConfigCoordinatorError'
    this.code = code
    this.details = details
  }
}

export class ConfigCoordinator {
  constructor(options = {}) {
    if (!isTrustedSandbox(options.sandbox)) {
      throw new ConfigCoordinatorError('CONFIG_COORDINATION_SANDBOX_REQUIRED', 'a trusted isolated sandbox capability is required')
    }
    this.sandbox = options.sandbox
    this.fs = options.fsImpl || fs
    this.now = options.now || (() => new Date())
    this.sources = options.sources || {}
    this.runtime = options.runtime || {}
    this._queue = Promise.resolve()
    this._plans = new Map()
    this._plansLimit = options.maxPlans || COORDINATION_LIMITS.maxPlans
    this.journalDir = path.join(this.sandbox.root, JOURNAL_DIR)
    // Reuse ConfigStore's reviewed sandbox/marker/root checks; the anchor is never written.
    this._guard = createConfigStore({ sandbox: this.sandbox, fileName: ANCHOR_FILE })
    if (Object.keys(this.sources).length === 0) {
      throw new ConfigCoordinatorError('CONFIG_COORDINATION_SOURCE_REQUIRED', 'at least one source adapter is required')
    }
    for (const [id, adapter] of Object.entries(this.sources)) {
      if (!SOURCE_ID_PATTERN.test(id) || !SOURCE_DEFINITIONS[id]) {
        throw new ConfigCoordinatorError('CONFIG_COORDINATION_SOURCE_UNKNOWN', 'source adapter id is not registered')
      }
      if (id === 'targetMap') {
        throw new ConfigCoordinatorError('CONFIG_COORDINATION_SOURCE_FORBIDDEN', 'targetMap must never be read or adapted')
      }
      if (!adapter || typeof adapter.read !== 'function' || typeof adapter.validateChange !== 'function' || typeof adapter.save !== 'function') {
        throw new ConfigCoordinatorError('CONFIG_COORDINATION_ADAPTER_INVALID', 'source adapter is incomplete')
      }
    }
  }

  _runExclusive(work) {
    const run = this._queue.then(work, work)
    this._queue = run.then(() => undefined, () => undefined)
    return run
  }

  _assertSandbox() {
    try {
      this._guard = createConfigStore({ sandbox: this.sandbox, fileName: ANCHOR_FILE })
    } catch (error) {
      throw new ConfigCoordinatorError('CONFIG_COORDINATION_SANDBOX_INVALID', 'trusted sandbox is no longer valid')
    }
  }

  async _readSource(id) {
    const adapter = this.sources[id]
    if (!adapter) {
      return { ok: false, error: { code: 'CONFIG_COORDINATION_ADAPTER_MISSING', source: id } }
    }
    let result
    try {
      result = await adapter.read()
    } catch {
      return { ok: false, error: { code: 'CONFIG_COORDINATION_SOURCE_UNAVAILABLE', source: id } }
    }
    if (!result || result.ok !== true || !result.document || !REVISION_PATTERN.test(String(result.revision || ''))) {
      return { ok: false, error: { code: 'CONFIG_COORDINATION_SOURCE_INVALID', source: id } }
    }
    return { ok: true, document: result.document, revision: String(result.revision) }
  }

  async _prepareSource(id, change) {
    const definition = SOURCE_DEFINITIONS[id]
    if (!definition) return { ok: false, error: { code: 'CONFIG_COORDINATION_SOURCE_UNKNOWN', source: id } }
    if (!definition.writable) return { ok: false, error: { code: 'CONFIG_COORDINATION_SOURCE_READ_ONLY', source: id } }
    const snapshot = await this._readSource(id)
    if (!snapshot.ok) return snapshot
    if (snapshot.revision !== change.expectedRevision) {
      return {
        ok: false,
        conflict: true,
        error: {
          code: 'CONFIG_COORDINATION_CONFLICT',
          source: id,
          expectedRevision: change.expectedRevision,
          currentRevision: snapshot.revision,
        },
      }
    }
    const adapter = this.sources[id]
    let result
    try {
      result = await adapter.validateChange(snapshot.document, change.set)
    } catch {
      return { ok: false, error: { code: 'CONFIG_COORDINATION_SCHEMA_INVALID', source: id, issues: [] } }
    }
    if (!result || result.ok !== true || !result.document) {
      return {
        ok: false,
        error: {
          code: 'CONFIG_COORDINATION_SCHEMA_INVALID',
          source: id,
          issues: sanitizeIssues(result?.errors),
        },
      }
    }
    const fields = Array.isArray(result.changes) ? result.changes.map((item) => String(item.path || item)).filter(Boolean) : []
    if (fields.length === 0) return { ok: true, unchanged: true, document: snapshot.document, revision: snapshot.revision }
    return {
      ok: true,
      unchanged: false,
      source: id,
      definition,
      adapter,
      expectedRevision: change.expectedRevision,
      currentRevision: snapshot.revision,
      document: result.document,
      previousDocument: snapshot.document,
      fields,
      simulatedOnly: adapter.simulatedOnly === true,
      supportsRuntimeConfirmation: adapter.supportsRuntimeConfirmation === true,
    }
  }

  _validateDraft(draft) {
    if (!isObject(draft)) {
      return invalid('CONFIG_COORDINATION_DRAFT_INVALID', COORDINATION_STATES.FAILED, 'draft must be an object')
    }
    for (const key of Object.keys(draft)) {
      if (!['schemaVersion', 'changes'].includes(key)) {
        return invalid('CONFIG_COORDINATION_UNKNOWN_FIELD', COORDINATION_STATES.FAILED, 'unknown draft field', { field: key })
      }
    }
    if (draft.schemaVersion !== COORDINATION_SCHEMA_VERSION) {
      return invalid('CONFIG_COORDINATION_SCHEMA_UNSUPPORTED', COORDINATION_STATES.FAILED, 'unsupported coordination schema version')
    }
    if (!isObject(draft.changes)) {
      return invalid('CONFIG_COORDINATION_DRAFT_INVALID', COORDINATION_STATES.FAILED, 'changes must be an object')
    }
    const entries = Object.entries(draft.changes)
    if (entries.length > COORDINATION_LIMITS.maxSourcesPerChange) {
      return invalid('CONFIG_COORDINATION_TOO_MANY_SOURCES', COORDINATION_STATES.FAILED, 'too many sources in one change')
    }
    for (const [id, change] of entries) {
      if (!SOURCE_DEFINITIONS[id]) {
        return invalid('CONFIG_COORDINATION_SOURCE_UNKNOWN', COORDINATION_STATES.FAILED, 'unknown source', { source: id })
      }
      if (!isObject(change)) {
        return invalid('CONFIG_COORDINATION_DRAFT_INVALID', COORDINATION_STATES.FAILED, 'source change must be an object', { source: id })
      }
      for (const key of Object.keys(change)) {
        if (!['expectedRevision', 'set'].includes(key)) {
          return invalid('CONFIG_COORDINATION_UNKNOWN_FIELD', COORDINATION_STATES.FAILED, 'unknown source change field', { source: id, field: key })
        }
      }
      if (typeof change.expectedRevision !== 'string' || !REVISION_PATTERN.test(change.expectedRevision)) {
        return invalid('CONFIG_COORDINATION_REVISION_INVALID', COORDINATION_STATES.FAILED, 'expectedRevision must be 32 lowercase hex characters', { source: id })
      }
      if (!isObject(change.set)) {
        return invalid('CONFIG_COORDINATION_DRAFT_INVALID', COORDINATION_STATES.FAILED, 'set must be an object', { source: id })
      }
    }
    return { ok: true, entries }
  }

  async prepareChange(draft) {
    return this._runExclusive(async () => {
      const validated = this._validateDraft(draft)
      if (!validated.ok) return validated
      const prepared = []
      for (const [id, change] of validated.entries) {
        const definition = SOURCE_DEFINITIONS[id]
        if (!definition.writable || !WRITABLE_SOURCES.has(id)) {
          return invalid('CONFIG_COORDINATION_SOURCE_READ_ONLY', COORDINATION_STATES.FAILED, 'source is read-only in Phase 4B-2A', { source: id })
        }
        const result = await this._prepareSource(id, change)
        if (!result.ok) {
          if (result.conflict) {
            return invalid('CONFIG_COORDINATION_CONFLICT', COORDINATION_STATES.CONFLICT, 'source revision changed', result.error)
          }
          return invalid(result.error.code, COORDINATION_STATES.FAILED, 'source validation failed', result.error)
        }
        if (!result.unchanged) prepared.push(result)
      }

      if (prepared.length === 0) {
        return {
          ok: true,
          state: COORDINATION_STATES.PREPARED,
          noChanges: true,
          previewOnly: true,
          saved: false,
          applyState: 'NOT_APPLIED',
          activeRevision: null,
          activeConfirmed: false,
          sources: [],
          note: 'No changes. A preview is not a save and does not enable voice sending.',
        }
      }

      const planId = planIdFor(prepared)
      const riskOrder = { MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
      const riskLevel = prepared.reduce((highest, item) => (
        (riskOrder[item.definition.risk] || 0) > (riskOrder[highest] || 0) ? item.definition.risk : highest
      ), 'MEDIUM')
      const requiresUserConfirmation = prepared.some((item) => item.definition.risk === 'HIGH' || item.definition.risk === 'CRITICAL')
      const runtimeConfirmation = prepared.every((item) => item.supportsRuntimeConfirmation)
      const simulationOnly = prepared.every((item) => item.simulatedOnly)
      const sources = prepared.map((item) => ({
        source: item.source,
        authority: item.definition.authority,
        location: item.definition.location,
        risk: item.definition.risk,
        writable: true,
        fields: [...item.fields],
        expectedRevision: item.expectedRevision,
        currentRevision: item.currentRevision,
        requiresReload: item.definition.requiresReload,
        hotReload: item.definition.hotReload,
        runtimeConfirmation: item.supportsRuntimeConfirmation,
        multiFile: item.definition.multiFile,
        dependencies: item.source === 'bridgeVoice' ? ['workerSafety'] : ['qwenRuntime'],
        simulatedOnly: item.simulatedOnly,
        externalSideEffects: [...item.definition.externalSideEffects],
      }))
      const plan = {
        planId,
        state: COORDINATION_STATES.PREPARED,
        schemaVersion: COORDINATION_SCHEMA_VERSION,
        previewOnly: true,
        saved: false,
        applyState: 'NOT_APPLIED',
        activeRevision: null,
        activeConfirmed: false,
        riskLevel,
        requiresUserConfirmation,
        runtimeConfirmation,
        simulationOnly,
        canExecute: simulationOnly,
        sources,
        note: 'Preview is not a save, not runtime application and not permission to enable voice sending.',
      }
      this._plans.set(planId, { plan, prepared, createdAt: nowIso(this.now) })
      while (this._plans.size > this._plansLimit) {
        this._plans.delete(this._plans.keys().next().value)
      }
      return { ok: true, plan }
    })
  }

  async validatePlan(planId) {
    const entry = this._plans.get(planId)
    if (!entry) return invalid('CONFIG_COORDINATION_PLAN_UNKNOWN', COORDINATION_STATES.FAILED, 'plan is unknown or expired')
    for (const item of entry.prepared) {
      const snapshot = await this._readSource(item.source)
      if (!snapshot.ok) return invalid('CONFIG_COORDINATION_SOURCE_UNAVAILABLE', COORDINATION_STATES.UNKNOWN, 'source is unavailable', { source: item.source })
      if (snapshot.revision !== item.expectedRevision) {
        return invalid('CONFIG_COORDINATION_CONFLICT', COORDINATION_STATES.CONFLICT, 'source revision changed', {
          source: item.source,
          expectedRevision: item.expectedRevision,
          currentRevision: snapshot.revision,
        })
      }
    }
    return { ok: true, planId, valid: true, state: COORDINATION_STATES.PREPARED }
  }

  _journalPath(transactionId) {
    if (typeof transactionId !== 'string' || !TRANSACTION_PATTERN.test(transactionId)) {
      throw new ConfigCoordinatorError('CONFIG_COORDINATION_TRANSACTION_INVALID', 'invalid transaction id')
    }
    return path.join(this.journalDir, transactionId + '.json')
  }

  _writeJournal(record) {
    this._assertSandbox()
    this.fs.mkdirSync(this.journalDir, { recursive: true, mode: 0o700 })
    let journalStat
    let journalReal
    try {
      journalStat = this.fs.lstatSync(this.journalDir)
      journalReal = this.fs.realpathSync(this.journalDir)
    } catch {
      throw new ConfigCoordinatorError('CONFIG_COORDINATION_JOURNAL_FAILED', 'journal directory is unavailable')
    }
    if (journalStat.isSymbolicLink() || !journalStat.isDirectory() || !isInside(this.sandbox.root, journalReal)) {
      throw new ConfigCoordinatorError('CONFIG_COORDINATION_JOURNAL_FAILED', 'journal directory escaped the sandbox')
    }
    record.updatedAt = nowIso(this.now)
    record.version = (record.version || 0) + 1
    const target = this._journalPath(record.transactionId)
    const temp = target + '.' + randomBytes(8).toString('hex') + '.tmp'
    try {
      this.fs.writeFileSync(temp, JSON.stringify(record), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      this.fs.renameSync(temp, target)
    } catch {
      try { this.fs.rmSync(temp, { force: true }) } catch { /* best effort */ }
      throw new ConfigCoordinatorError('CONFIG_COORDINATION_JOURNAL_FAILED', 'journal write failed')
    }
    return record
  }

  _readJournal(transactionId) {
    const file = this._journalPath(transactionId)
    let record
    try {
      record = JSON.parse(this.fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
    if (!record || record.transactionId !== transactionId || record.journalVersion !== COORDINATION_JOURNAL_VERSION) return null
    return record
  }

  _failureResult(record, code, message, extra = {}) {
    return {
      ok: false,
      state: record.phase === COORDINATION_STATES.UNKNOWN ? COORDINATION_STATES.UNKNOWN : COORDINATION_STATES.FAILED,
      saveState: record.phase,
      applyState: 'NOT_APPLIED',
      activeRevision: null,
      activeConfirmed: false,
      transactionId: record.transactionId,
      planId: record.planId,
      error: { code, message, ...extra },
      steps: journalPublic(record).steps,
    }
  }

  async _rollback(record, saved, transactionId) {
    let allConfirmed = true
    if (saved.length === 0) return true
    for (const item of [...saved].reverse()) {
      let result
      try {
        result = await item.adapter.rollback({
          transactionId,
          toRevision: item.previousRevision,
          toDocument: item.previousDocument,
        })
      } catch {
        result = { ok: false }
      }
      const step = record.steps.find((candidate) => candidate.source === item.source)
      if (result && result.ok === true) {
        if (step) step.status = 'ROLLED_BACK'
      } else {
        allConfirmed = false
        if (step) step.errorCode = 'CONFIG_COORDINATION_ROLLBACK_FAILED'
      }
    }
    return allConfirmed
  }

  async execute(planId, options = {}) {
    return this._runExclusive(async () => {
      const entry = this._plans.get(planId)
      if (!entry) return invalid('CONFIG_COORDINATION_PLAN_UNKNOWN', COORDINATION_STATES.FAILED, 'plan is unknown or expired')
      if (entry.plan.requiresUserConfirmation && options.userConfirmed !== true) {
        return invalid('CONFIG_COORDINATION_CONFIRMATION_REQUIRED', COORDINATION_STATES.PREPARED, 'explicit user confirmation is required')
      }
      if (entry.plan.simulationOnly !== true) {
        return invalid('CONFIG_COORDINATION_SIMULATION_ONLY', COORDINATION_STATES.FAILED, 'production execution is not implemented in Phase 4B-2A')
      }
      for (const item of entry.prepared) {
        const snapshot = await this._readSource(item.source)
        if (!snapshot.ok) return invalid('CONFIG_COORDINATION_SOURCE_UNAVAILABLE', COORDINATION_STATES.UNKNOWN, 'source is unavailable', { source: item.source })
        if (snapshot.revision !== item.expectedRevision) {
          return invalid('CONFIG_COORDINATION_CONFLICT', COORDINATION_STATES.CONFLICT, 'source revision changed', {
            source: item.source,
            expectedRevision: item.expectedRevision,
            currentRevision: snapshot.revision,
          })
        }
      }

      const transactionId = randomBytes(16).toString('hex')
      const createdAt = nowIso(this.now)
      const record = {
        journalVersion: COORDINATION_JOURNAL_VERSION,
        transactionId,
        planId,
        phase: COORDINATION_STATES.SAVING,
        committed: false,
        requiresUserConfirmation: entry.plan.requiresUserConfirmation,
        createdAt,
        updatedAt: createdAt,
        version: 0,
        errorCode: null,
        steps: entry.prepared.map((item) => ({
          source: item.source,
          status: 'PENDING',
          expectedRevision: item.expectedRevision,
          savedRevision: null,
          applyStatus: 'NOT_REQUESTED',
          activeRevision: null,
          errorCode: null,
        })),
      }
      try {
        this._writeJournal(record)
      } catch {
        return invalid('CONFIG_COORDINATION_JOURNAL_FAILED', COORDINATION_STATES.FAILED, 'journal could not be created; no source was written')
      }

      const saved = []
      try {
        for (const item of entry.prepared) {
          const step = record.steps.find((candidate) => candidate.source === item.source)
          step.status = 'SAVING'
          this._writeJournal(record)
          let result
          try {
            result = await item.adapter.save({
              document: item.document,
              expectedRevision: item.expectedRevision,
              transactionId,
            })
          } catch {
            result = { ok: false }
          }
          if (!result || result.ok !== true) {
            step.status = 'FAILED'
            step.errorCode = 'CONFIG_COORDINATION_SAVE_FAILED'
            record.phase = COORDINATION_STATES.FAILED
            record.errorCode = 'CONFIG_COORDINATION_SAVE_FAILED'
            this._writeJournal(record)
            const rolledBack = await this._rollback(record, saved, transactionId)
            record.phase = rolledBack ? COORDINATION_STATES.FAILED : COORDINATION_STATES.UNKNOWN
            record.committed = false
            this._writeJournal(record)
            return this._failureResult(record, 'CONFIG_COORDINATION_SAVE_FAILED', 'a source save failed', {
              rolledBack,
              source: item.source,
            })
          }
          step.status = 'SAVED'
          step.savedRevision = result.revision
          saved.push({
            source: item.source,
            adapter: item.adapter,
            previousRevision: item.currentRevision,
            previousDocument: item.previousDocument,
          })
          this._writeJournal(record)
        }

        record.phase = COORDINATION_STATES.SAVED
        record.committed = true
        this._writeJournal(record)
        return {
          ok: true,
          state: COORDINATION_STATES.SAVED,
          saveState: COORDINATION_STATES.SAVED,
          applyState: COORDINATION_STATES.PENDING_APPLY,
          activeRevision: null,
          activeConfirmed: false,
          transactionId,
          planId,
          version: record.version,
          steps: journalPublic(record).steps,
          note: 'Saved files are not proof of runtime application. Call apply only with trusted runtime confirmation.',
        }
      } catch (error) {
        if (error instanceof ConfigCoordinatorError && error.code === 'CONFIG_COORDINATION_JOURNAL_FAILED') {
          record.phase = COORDINATION_STATES.UNKNOWN
          record.errorCode = 'CONFIG_COORDINATION_JOURNAL_FAILED'
          // Do not retry the journal after a write failure: the on-disk record is deliberately left
          // non-terminal so recovery reports UNKNOWN instead of inventing a committed state.
          return this._failureResult(record, 'CONFIG_COORDINATION_JOURNAL_FAILED', 'journal update failed; state is UNKNOWN', { rolledBack: false })
        }
        record.phase = COORDINATION_STATES.UNKNOWN
        record.errorCode = 'CONFIG_COORDINATION_INTERNAL'
        try { this._writeJournal(record) } catch { /* keep in-memory UNKNOWN */ }
        return this._failureResult(record, 'CONFIG_COORDINATION_INTERNAL', 'coordination failed', { rolledBack: false })
      }
    })
  }

  async apply(transactionId, options = {}) {
    return this._runExclusive(async () => {
      const record = this._readJournal(transactionId)
      if (!record) return invalid('CONFIG_COORDINATION_TRANSACTION_UNKNOWN', COORDINATION_STATES.UNKNOWN, 'transaction journal is missing or corrupt')
      if (options.observedVersion !== undefined && Number(options.observedVersion) !== record.version) {
        return invalid('CONFIG_COORDINATION_STALE_RESULT', COORDINATION_STATES.CONFLICT, 'stale result cannot overwrite the current state', {
          currentVersion: record.version,
        })
      }
      if ([COORDINATION_STATES.APPLIED, COORDINATION_STATES.PARTIALLY_APPLIED, COORDINATION_STATES.FAILED, COORDINATION_STATES.UNKNOWN].includes(record.phase)) {
        return {
          ok: true,
          state: record.phase,
          saveState: record.committed ? COORDINATION_STATES.SAVED : record.phase,
          applyState: record.phase,
          activeRevision: null,
          activeConfirmed: record.phase === COORDINATION_STATES.APPLIED,
          transactionId,
          version: record.version,
          steps: journalPublic(record).steps,
          replayed: false,
        }
      }
      if (record.phase !== COORDINATION_STATES.SAVED || record.committed !== true) {
        return invalid('CONFIG_COORDINATION_NOT_SAVED', COORDINATION_STATES.CONFLICT, 'transaction is not in a saved state')
      }
      if (record.requiresUserConfirmation && options.userConfirmed !== true) {
        return invalid('CONFIG_COORDINATION_CONFIRMATION_REQUIRED', COORDINATION_STATES.PENDING_APPLY, 'explicit user confirmation is required for apply')
      }
      record.phase = COORDINATION_STATES.APPLYING
      this._writeJournal(record)
      const confirmed = []
      const rejected = []
      const unknown = []
      const noInterface = []
      for (const step of record.steps) {
        const item = this._plans.get(record.planId)?.prepared.find((candidate) => candidate.source === step.source)
        if (!item || item.supportsRuntimeConfirmation !== true) {
          step.applyStatus = 'NO_RUNTIME_CONFIRMATION'
          noInterface.push(step.source)
          this._writeJournal(record)
          continue
        }
        const runtime = this.runtime[step.source]
        if (!runtime || typeof runtime.apply !== 'function') {
          step.applyStatus = 'NO_RUNTIME_CONFIRMATION'
          noInterface.push(step.source)
          this._writeJournal(record)
          continue
        }
        let result
        try {
          result = await runtime.apply({
            source: step.source,
            savedRevision: step.savedRevision,
            transactionId,
          })
        } catch {
          result = { ok: false, code: 'RUNTIME_UNKNOWN' }
        }
        if (result && result.ok === true && REVISION_PATTERN.test(String(result.activeRevision || ''))) {
          step.applyStatus = 'APPLIED'
          step.activeRevision = String(result.activeRevision)
          confirmed.push(step.source)
        } else if (result && result.ok === false && result.code === 'RUNTIME_REJECTED') {
          step.applyStatus = 'REJECTED'
          rejected.push(step.source)
        } else {
          step.applyStatus = 'UNKNOWN'
          unknown.push(step.source)
        }
        this._writeJournal(record)
      }

      if (confirmed.length === record.steps.length && record.steps.length > 0) {
        record.phase = COORDINATION_STATES.APPLIED
      } else if (confirmed.length > 0) {
        record.phase = COORDINATION_STATES.PARTIALLY_APPLIED
        record.errorCode = 'CONFIG_COORDINATION_PARTIAL_APPLY'
      } else if (noInterface.length === record.steps.length) {
        record.phase = COORDINATION_STATES.PENDING_APPLY
      } else if (unknown.length > 0) {
        record.phase = COORDINATION_STATES.UNKNOWN
      } else {
        record.phase = COORDINATION_STATES.FAILED
        record.errorCode = 'CONFIG_COORDINATION_APPLY_REJECTED'
      }
      this._writeJournal(record)
      return {
        ok: record.phase === COORDINATION_STATES.APPLIED,
        state: record.phase,
        saveState: COORDINATION_STATES.SAVED,
        applyState: record.phase,
        activeRevision: record.phase === COORDINATION_STATES.APPLIED && record.steps.length === 1
          ? record.steps[0].activeRevision
          : null,
        activeConfirmed: record.phase === COORDINATION_STATES.APPLIED,
        transactionId,
        version: record.version,
        confirmed,
        rejected,
        unknown,
        noInterface,
        steps: journalPublic(record).steps,
        note: record.phase === COORDINATION_STATES.APPLIED
          ? 'All configured components reported a trusted loaded revision. This does not imply a voice task was sent.'
          : 'Saved state is not the same as applied state; no automatic retry was performed.',
      }
    })
  }

  async recover(transactionId) {
    const record = this._readJournal(transactionId)
    if (!record) return invalid('CONFIG_COORDINATION_TRANSACTION_UNKNOWN', COORDINATION_STATES.UNKNOWN, 'transaction journal is missing or corrupt')
    let state = record.phase
    if (record.phase === COORDINATION_STATES.SAVING || record.phase === COORDINATION_STATES.APPLYING) {
      state = COORDINATION_STATES.UNKNOWN
    } else if (record.phase === COORDINATION_STATES.SAVED) {
      state = COORDINATION_STATES.PENDING_APPLY
    }
    return {
      ok: true,
      state,
      phase: record.phase,
      committed: record.committed === true,
      recoveryRequired: [COORDINATION_STATES.SAVING, COORDINATION_STATES.APPLYING].includes(record.phase),
      transactionId,
      version: record.version,
      steps: journalPublic(record).steps,
      replayed: false,
      note: 'Recovery is read-only. A non-terminal journal is UNKNOWN and no source/apply write is repeated.',
    }
  }

  async getStatus(transactionId, options = {}) {
    const record = this._readJournal(transactionId)
    if (!record) return invalid('CONFIG_COORDINATION_TRANSACTION_UNKNOWN', COORDINATION_STATES.UNKNOWN, 'transaction journal is missing or corrupt')
    if (options.observedVersion !== undefined && Number(options.observedVersion) < record.version) {
      return {
        ok: true,
        stale: true,
        ignored: true,
        state: record.phase,
        currentVersion: record.version,
        note: 'Stale observer result was ignored; current state is unchanged.',
      }
    }
    return {
      ok: true,
      stale: false,
      state: record.phase,
      version: record.version,
      transaction: journalPublic(record),
    }
  }

  async getBaseline() {
    return this._runExclusive(async () => {
      const sources = []
      for (const definition of Object.values(SOURCE_DEFINITIONS).sort((a, b) => a.order - b.order)) {
        if (definition.id === 'targetMap' || definition.id === 'wechatPermissions') {
          sources.push({
            id: definition.id,
            authority: definition.authority,
            writable: false,
            available: null,
            readOnly: true,
            settings: null,
            errorCode: 'CONFIG_COORDINATION_NOT_READ_BY_DESIGN',
            note: 'Private target/permission content is not read by the coordinator.',
          })
          continue
        }
        if (!this.sources[definition.id]) {
          sources.push({
            id: definition.id,
            authority: definition.authority,
            writable: definition.writable,
            available: false,
            readOnly: !definition.writable,
            errorCode: 'CONFIG_COORDINATION_ADAPTER_MISSING',
          })
          continue
        }
        const snapshot = await this._readSource(definition.id)
        if (!snapshot.ok) {
          sources.push({
            id: definition.id,
            authority: definition.authority,
            writable: definition.writable,
            available: false,
            readOnly: !definition.writable,
            errorCode: snapshot.error.code,
          })
          continue
        }
        const adapter = this.sources[definition.id]
        const settings = typeof adapter.publicSettings === 'function' ? adapter.publicSettings(snapshot.document) : null
        sources.push({
          id: definition.id,
          authority: definition.authority,
          writable: definition.writable,
          available: true,
          readOnly: !definition.writable,
          revision: snapshot.revision,
          settings,
          runtimeConfirmation: definition.runtimeConfirmation,
        })
      }
      return {
        ok: true,
        state: COORDINATION_STATES.PREPARED,
        sources,
        note: 'Baseline contains only allow-listed display fields; no target IDs, tokens or absolute paths.',
      }
    })
  }
}

export function createConfigCoordinator(options = {}) {
  return new ConfigCoordinator(options)
}
