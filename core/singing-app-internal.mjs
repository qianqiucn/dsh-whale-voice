/* Whale Voice — thin Whale Singing application coordinator (Plan12-A / APP-OFFLINE).
 *
 * Consumes the existing Cover executor and Fixture artifact library. It never reimplements the
 * task store, writer, Artifact library, RVC gateway, Relay or delivery path. Browser input supplies
 * only a draft selection and bounded parameters; source rights, voice/model facts and dependency
 * evidence come from trusted injected catalogs/providers. A missing provider or adapter is a
 * refusal, not an automatic-ready fallback. Every result is synthetic/Fixture and realReady=false.
 */

import crypto from 'node:crypto'

import { openFixtureArtifactLibrary } from './audio/artifact-library.mjs'
import {
  COVER_EXECUTION_CODES,
  coverStatus,
  createCoverTask,
  executeCover,
  requestCoverCancel,
  resumeCoverFinal,
} from './audio/cover-executor-internal.mjs'

export const SINGING_APP_SCHEMA_VERSION = 1
export const SINGING_APP_LIMITS = Object.freeze({
  maxSources: 16,
  maxVoices: 16,
  pitchShift: Object.freeze([-12, 12]),
  gainDb: Object.freeze([-12, 12]),
  sampleRate: 44100,
  channels: 1,
  maxPreviewBytes: 4 * 1024 * 1024,
})

export const SINGING_APP_ERRORS = Object.freeze({
  INVALID: 'SINGING_APP_INVALID',
  NO_ADAPTER: 'SINGING_APP_NO_ADAPTER',
  SOURCE_UNKNOWN: 'SINGING_APP_SOURCE_UNKNOWN',
  VOICE_UNKNOWN: 'SINGING_APP_VOICE_UNKNOWN',
  PARAMETER_CONFLICT: 'SINGING_APP_PARAMETER_CONFLICT',
  NO_DEPENDENCIES: 'SINGING_APP_NO_DEPENDENCIES',
  NOT_SAVED: 'SINGING_APP_NOT_SAVED',
  PREVIEW_UNAVAILABLE: 'SINGING_APP_PREVIEW_UNAVAILABLE',
  CORE_REJECTED: 'SINGING_APP_CORE_REJECTED',
})

const PARAMETER_KEYS = new Set(['sourceRef', 'voiceProfileId', 'sourceLayout', 'mixMode', 'pitchShift', 'vocalGainDb', 'instrumentalGainDb'])
const LAYOUTS = new Set(['MIXED', 'CLEAN_VOCAL'])
const MIX_MODES = new Set(['WITH_INSTRUMENTAL', 'VOCAL_ONLY'])
const STAGE_LABELS = Object.freeze({
  NO_ATTEMPT: '待开始',
  CLAIMED: '执行中',
  SAVED: '已保存',
  CANCELLED: '已取消',
  FAILED: '失败',
  UNKNOWN: '未知',
})

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function valueOrNull(result) {
  return result && result.ok === true ? result.value : null
}

function publicStatus(status) {
  if (status && status.ok === true && status.value) status = status.value
  if (!status) return { state: 'NO_ATTEMPT', stateLabel: STAGE_LABELS.NO_ATTEMPT, stages: [], fixtureOnly: true, realReady: false }
  return {
    schemaVersion: 1,
    state: status.state,
    stateLabel: STAGE_LABELS[status.state] || '未知',
    phase: status.phase || null,
    attemptId: status.attemptId || null,
    stages: (status.stages || []).map((stage) => ({
      stage: stage.stage,
      label: stage.stage === 'SEPARATING' ? '分离' : stage.stage === 'CONVERTING' ? '转换' : stage.stage === 'MIXING' ? '混音' : stage.stage === 'VERIFYING' ? '校验' : stage.stage,
      status: stage.status,
    })),
    cancel: status.cancel || null,
    master: status.master || null,
    lastError: status.lastError || null,
    messageZh: status.messageZh || null,
    fixtureOnly: true,
    realReady: false,
  }
}

function mapCoreFailure(result) {
  const code = result && result.errors && result.errors[0] ? result.errors[0].code : null
  if (code === 'INTENT_MISMATCH' || code === 'TASK_OWNER_COVER_INTENT_MISMATCH') {
    return fail(SINGING_APP_ERRORS.PARAMETER_CONFLICT, code)
  }
  return fail(SINGING_APP_ERRORS.CORE_REJECTED, code)
}

function normalizeDraft(input) {
  if (!isObject(input)) return fail(SINGING_APP_ERRORS.INVALID)
  for (const key of Object.keys(input)) if (!PARAMETER_KEYS.has(key)) return fail(SINGING_APP_ERRORS.INVALID, key)
  if (typeof input.sourceRef !== 'string' || input.sourceRef.length === 0) return fail(SINGING_APP_ERRORS.INVALID, 'sourceRef')
  if (typeof input.voiceProfileId !== 'string' || input.voiceProfileId.length === 0) return fail(SINGING_APP_ERRORS.INVALID, 'voiceProfileId')
  if (!LAYOUTS.has(input.sourceLayout)) return fail(SINGING_APP_ERRORS.INVALID, 'sourceLayout')
  if (!MIX_MODES.has(input.mixMode)) return fail(SINGING_APP_ERRORS.INVALID, 'mixMode')
  if (input.sourceLayout === 'CLEAN_VOCAL' && input.mixMode !== 'VOCAL_ONLY') return fail(SINGING_APP_ERRORS.INVALID, 'mixMode')
  for (const [key, bounds] of [['pitchShift', SINGING_APP_LIMITS.pitchShift], ['vocalGainDb', SINGING_APP_LIMITS.gainDb], ['instrumentalGainDb', SINGING_APP_LIMITS.gainDb]]) {
    const value = input[key]
    if (!Number.isInteger(value) || value < bounds[0] || value > bounds[1]) return fail(SINGING_APP_ERRORS.INVALID, key)
  }
  return {
    ok: true,
    value: {
      sourceRef: input.sourceRef,
      voiceProfileId: input.voiceProfileId,
      sourceLayout: input.sourceLayout,
      mixMode: input.mixMode,
      pitchShift: input.pitchShift,
      vocalGainDb: input.vocalGainDb,
      instrumentalGainDb: input.instrumentalGainDb,
    },
  }
}

function normalizeSource(source) {
  if (!isObject(source)) return null
  if (typeof source.sourceRef !== 'string' || !Number.isInteger(source.sourceRevision) || source.sourceRevision < 1) return null
  if (!isObject(source.rights) || source.rights.state !== 'GRANTED' || typeof source.rights.proofRef !== 'string' || typeof source.rights.expiresAt !== 'string') return null
  return {
    sourceRef: source.sourceRef,
    sourceRevision: source.sourceRevision,
    rights: { state: 'GRANTED', proofRef: source.rights.proofRef, expiresAt: source.rights.expiresAt },
    label: typeof source.label === 'string' ? source.label.slice(0, 80) : source.sourceRef,
  }
}

function normalizeVoice(voice) {
  if (!isObject(voice)) return null
  const required = ['voiceProfileId', 'modelAssetId', 'instanceId', 'candidateId', 'modelRef']
  if (required.some((key) => typeof voice[key] !== 'string' || voice[key].length === 0)) return null
  if (!Number.isInteger(voice.profileRevision) || !Number.isInteger(voice.modelRevision) || !Number.isInteger(voice.backendRevision)) return null
  return {
    voiceProfileId: voice.voiceProfileId,
    profileRevision: voice.profileRevision,
    modelAssetId: voice.modelAssetId,
    modelRevision: voice.modelRevision,
    modelIntegrityTruth: voice.modelIntegrityTruth === 'DECLARED_FIXTURE' ? 'DECLARED_FIXTURE' : 'DECLARED_FIXTURE',
    instanceId: voice.instanceId,
    candidateId: voice.candidateId,
    modelRef: voice.modelRef,
    backendRevision: voice.backendRevision,
    label: typeof voice.label === 'string' ? voice.label.slice(0, 80) : voice.voiceProfileId,
  }
}

/** Public stage mapping used by the page/harness; never claims real playback or delivery. */
export function singingStageView(status) {
  const view = publicStatus(status)
  return { ...view, timeline: view.stages.map((stage) => `${stage.label}:${stage.status}`) }
}

/**
 * Open the thin Singing application around trusted Fixture capabilities. `sources`, `voices` and
 * `dependenciesProvider` are Core/test-owned facts, never browser input. `realReady` is always
 * false in this unit.
 */
export function openSingingApp({ sandbox, scopeId, sources, voices, dependenciesProvider = null, stageDelayMs = 0, now = () => new Date().toISOString() } = {}) {
  if (!sandbox || typeof scopeId !== 'string' || scopeId.length === 0) return fail(SINGING_APP_ERRORS.NO_ADAPTER)
  if (!Number.isInteger(stageDelayMs) || stageDelayMs < 0 || stageDelayMs > 2000) return fail(SINGING_APP_ERRORS.INVALID, 'stageDelayMs')
  const sourceList = (Array.isArray(sources) ? sources : []).map(normalizeSource).filter(Boolean).slice(0, SINGING_APP_LIMITS.maxSources)
  const voiceList = (Array.isArray(voices) ? voices : []).map(normalizeVoice).filter(Boolean).slice(0, SINGING_APP_LIMITS.maxVoices)
  if (sourceList.length === 0 || voiceList.length === 0) return fail(SINGING_APP_ERRORS.NO_ADAPTER)

  const intents = new Map()
  const executions = new Map()
  const app = {
    schemaVersion: SINGING_APP_SCHEMA_VERSION,
    scopeId,
    realReady: false,
    fixtureOnly: true,
    list() {
      return {
        ok: true,
        schemaVersion: SINGING_APP_SCHEMA_VERSION,
        fixtureOnly: true,
        realReady: false,
        sources: sourceList.map((source) => ({ sourceRef: source.sourceRef, label: source.label, expiresAt: source.rights.expiresAt })),
        voices: voiceList.map((voice) => ({ voiceProfileId: voice.voiceProfileId, label: voice.label, candidateId: voice.candidateId })),
      }
    },
    async create(draftInput) {
      const draft = normalizeDraft(draftInput)
      if (!draft.ok) return draft
      const source = sourceList.find((item) => item.sourceRef === draft.value.sourceRef)
      if (!source) return fail(SINGING_APP_ERRORS.SOURCE_UNKNOWN)
      const voice = voiceList.find((item) => item.voiceProfileId === draft.value.voiceProfileId)
      if (!voice) return fail(SINGING_APP_ERRORS.VOICE_UNKNOWN)
      const intentDraft = {
        intentVersion: 1,
        scopeId,
        sourceRef: source.sourceRef,
        sourceRevision: source.sourceRevision,
        rightsState: 'GRANTED',
        rightsProofRef: source.rights.proofRef,
        rightsExpiresAt: source.rights.expiresAt,
        voiceProfileId: voice.voiceProfileId,
        profileRevision: voice.profileRevision,
        modelAssetId: voice.modelAssetId,
        modelRevision: voice.modelRevision,
        modelIntegrityTruth: voice.modelIntegrityTruth,
        instanceId: voice.instanceId,
        candidateId: voice.candidateId,
        modelRef: voice.modelRef,
        backendRevision: voice.backendRevision,
        pitchShift: draft.value.pitchShift,
        recipe: {
          sourceLayout: draft.value.sourceLayout,
          separationPreset: draft.value.sourceLayout === 'MIXED' ? 'FIXTURE_TWO_STEM' : 'NONE',
          mixMode: draft.value.mixMode,
          vocalGainDb: draft.value.vocalGainDb,
          instrumentalGainDb: draft.value.instrumentalGainDb,
        },
        outputProfile: { format: 'WAV', codec: 'PCM_S16LE', sampleRate: SINGING_APP_LIMITS.sampleRate, channels: SINGING_APP_LIMITS.channels },
      }
      const idempotencyKey = 'singing:' + crypto.createHash('sha256').update(source.sourceRef + '|' + voice.voiceProfileId, 'utf8').digest('hex').slice(0, 40)
      const created = await createCoverTask({ sandbox, scopeId, idempotencyKey, intentDraft, observedAt: now() })
      if (!created || created.ok !== true) return mapCoreFailure(created)
      intents.set(created.value.taskId, created.value.intent)
      return {
        ok: true,
        taskId: created.value.taskId,
        outcome: created.value.outcome,
        stage: publicStatus(await coverStatus({ sandbox, scopeId, taskId: created.value.taskId, now: now() })),
      }
    },
    async run(draftInput) {
      const created = await app.create(draftInput)
      if (!created.ok) return created
      const current = await coverStatus({ sandbox, scopeId, taskId: created.taskId, now: now() })
      const currentValue = valueOrNull(current)
      if (currentValue && currentValue.state !== 'NO_ATTEMPT') return { ok: true, taskId: created.taskId, stage: publicStatus(currentValue), reused: true }
      if (!dependenciesProvider || typeof dependenciesProvider !== 'function') return fail(SINGING_APP_ERRORS.NO_DEPENDENCIES)
      const intent = intents.get(created.taskId)
      if (!intent) return fail(SINGING_APP_ERRORS.CORE_REJECTED, 'missing intent')
      let dependencies
      try {
        dependencies = await dependenciesProvider({ taskId: created.taskId, intent, now: now(), expiresAt: intent.rightsExpiresAt })
      } catch {
        dependencies = null
      }
      if (!dependencies) return fail(SINGING_APP_ERRORS.NO_DEPENDENCIES)
      const executed = await executeCover({
        sandbox, scopeId, taskId: created.taskId,
        requestKey: 'singing-exec:' + created.taskId,
        now: now(), expiresAt: intent.rightsExpiresAt,
        rights: { state: 'GRANTED', proofRef: intent.rightsProofRef },
        intent, dependencies, compute: 'LOCAL_GPU', stageDelayMs,
      })
      if (!executed || executed.ok !== true) return mapCoreFailure(executed)
      return { ok: true, taskId: created.taskId, stage: publicStatus(await coverStatus({ sandbox, scopeId, taskId: created.taskId, now: now() })), result: clone(executed.value) }
    },
    /* Start the same run without making the caller hold the long Promise; the caller can poll
     * status/cancel while the real executor continues. Repeated starts for one task are ignored. */
    async start(draftInput) {
      const created = await app.create(draftInput)
      if (!created.ok) return created
      if (executions.has(created.taskId)) {
        return { ok: true, taskId: created.taskId, stage: publicStatus(await coverStatus({ sandbox, scopeId, taskId: created.taskId, now: now() })), started: false }
      }
      const running = app.run(draftInput).catch(() => null).finally(() => executions.delete(created.taskId))
      executions.set(created.taskId, running)
      let stage = publicStatus(await coverStatus({ sandbox, scopeId, taskId: created.taskId, now: now() }))
      for (let attempt = 0; attempt < 40 && stage.state === 'NO_ATTEMPT'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25))
        stage = publicStatus(await coverStatus({ sandbox, scopeId, taskId: created.taskId, now: now() }))
      }
      return { ok: true, taskId: created.taskId, stage, started: true }
    },
    async waitFor(taskId) {
      const running = executions.get(taskId)
      return running ? running : null
    },
    async status(taskId) {
      if (typeof taskId !== 'string') return fail(SINGING_APP_ERRORS.INVALID, 'taskId')
      const result = await coverStatus({ sandbox, scopeId, taskId, now: now() })
      if (!result || result.ok !== true) return mapCoreFailure(result)
      return { ok: true, taskId, stage: publicStatus(result.value) }
    },
    async cancel(taskId) {
      if (typeof taskId !== 'string') return fail(SINGING_APP_ERRORS.INVALID, 'taskId')
      const status = await coverStatus({ sandbox, scopeId, taskId, now: now() })
      const value = valueOrNull(status)
      if (!value) return mapCoreFailure(status)
      if (value.state === 'NO_ATTEMPT' || !value.attemptId) return fail(SINGING_APP_ERRORS.INVALID, 'attemptId')
      const result = await requestCoverCancel({ sandbox, scopeId, taskId, attemptId: value.attemptId, now: now() })
      if (!result || result.ok !== true) return mapCoreFailure(result)
      return { ok: true, taskId, cancelState: result.value.cancelState || 'ACCEPTED', stage: publicStatus(await coverStatus({ sandbox, scopeId, taskId, now: now() })) }
    },
    async preview({ taskId, draft: draftInput } = {}) {
      if (typeof taskId !== 'string') return fail(SINGING_APP_ERRORS.INVALID, 'taskId')
      const normalized = normalizeDraft(draftInput)
      if (!normalized.ok) return normalized
      const source = sourceList.find((item) => item.sourceRef === normalized.value.sourceRef)
      const voice = voiceList.find((item) => item.voiceProfileId === normalized.value.voiceProfileId)
      if (!source || !voice) return fail(SINGING_APP_ERRORS.SOURCE_UNKNOWN)
      const created = await app.create(draftInput)
      if (!created.ok) return created
      if (created.taskId !== taskId) return fail(SINGING_APP_ERRORS.PARAMETER_CONFLICT)
      const intent = intents.get(taskId)
      if (!intent) return fail(SINGING_APP_ERRORS.CORE_REJECTED, 'missing intent')
      const status = await coverStatus({ sandbox, scopeId, taskId, now: now() })
      const value = valueOrNull(status)
      if (!value || value.state !== 'SAVED' || !value.master) return fail(SINGING_APP_ERRORS.NOT_SAVED)
      const library = await openFixtureArtifactLibrary({ sandbox })
      if (!library || library.ok !== true) return fail(SINGING_APP_ERRORS.PREVIEW_UNAVAILABLE)
      const read = await library.value.readBytes({
        schemaVersion: 1, scopeId, artifactRef: value.master.artifactRef, now: now(),
        rights: { state: 'GRANTED', proofRef: intent.rightsProofRef },
      })
      if (!read || read.ok !== true) return fail(SINGING_APP_ERRORS.PREVIEW_UNAVAILABLE)
      const bytes = read.value && read.value.bytes ? read.value.bytes : null
      if (!bytes || bytes.length > SINGING_APP_LIMITS.maxPreviewBytes) return fail(SINGING_APP_ERRORS.PREVIEW_UNAVAILABLE)
      return {
        ok: true, taskId,
        bytes: Buffer.from(bytes),
        byteLength: bytes.length,
        sha256: value.master.sha256,
        artifactRef: value.master.artifactRef,
        fixtureOnly: true,
        realReady: false,
      }
    },
    async resume({ taskId, attemptId, requestKey } = {}) {
      if (typeof taskId !== 'string' || typeof attemptId !== 'string' || typeof requestKey !== 'string') return fail(SINGING_APP_ERRORS.INVALID)
      const result = await resumeCoverFinal({ sandbox, scopeId, taskId, attemptId, requestKey, now: now() })
      if (!result || result.ok !== true) return mapCoreFailure(result)
      return { ok: true, taskId, stage: publicStatus(await coverStatus({ sandbox, scopeId, taskId, now: now() })), result: clone(result.value) }
    },
  }
  return { ok: true, app }
}
