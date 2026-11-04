/* Whale Voice — provider generation → SAVED candidate (Plan 10-R1, OFFLINE / ISOLATED).
 *
 * This module is the *internal wiring candidate* between an already-audited provider (the existing
 * Qwen adapter/supervisor contract) and the existing Artifact authority. It deliberately does **not**
 * run a model, spawn a process, open a window, touch WeChat, or expose a production Host route.
 *
 * Scope of this unit (and its honest limits):
 *   - a durable, versioned **provider-generation claim ledger** in the same trusted sandbox;
 *   - the claim binds scope/task/birth, provider instance, model/backend/voice, the exact request
 *     digest and the rights proof *before* any synthesis;
 *   - duplicate / conflicting / cross-scope / unauthorized / UNKNOWN re-entry never synthesise again;
 *   - provider output is re-measured here (WAV limits, PCM16/24k/mono, duration) and stored through
 *     the existing Artifact library (`artifact:fixture-bytes-…`, same authority Cover/owner use),
 *     then re-read and hash-checked before the claim is declared SAVED;
 *   - cancel, late results, unconfirmed exit and partial saves are recorded as separate facts; a
 *     SAVE_UNKNOWN tombstone is never repaired by a second synthesis, and SAVED never implies delivery.
 *
 * Not in this unit: writing a SAVED entry into the Plan 08 owner snapshot (owner schema v1/v2 has no
 * provider entry kind) and any Host/UI route. Those stay explicitly outside until an authorized
 * owner-schema extension is designed; the claim record keeps the task birth identity hash and the
 * artifact digest so that extension can bind to it without re-synthesis.
 */

import { createHash, randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isTrustedSandbox } from '../config-sandbox.mjs'
import { inspectFixtureWavBytes } from './wav-byte-inspector.mjs'

export const PROVIDER_GENERATION_SCHEMA_VERSION = 1

export const PROVIDER_GENERATION_ERRORS = Object.freeze({
  INPUT_INVALID: 'PROVIDER_GENERATION_INPUT_INVALID',
  UNSUPPORTED_VERSION: 'PROVIDER_GENERATION_UNSUPPORTED_VERSION',
  SANDBOX_INVALID: 'PROVIDER_GENERATION_SANDBOX_INVALID',
  NOT_FOUND: 'PROVIDER_GENERATION_NOT_FOUND',
  CONFLICT: 'PROVIDER_GENERATION_CONFLICT',
  CROSS_SCOPE: 'PROVIDER_GENERATION_CROSS_SCOPE',
  RIGHTS_REJECTED: 'PROVIDER_GENERATION_RIGHTS_REJECTED',
  AUTHORITY_REJECTED: 'PROVIDER_GENERATION_AUTHORITY_REJECTED',
  RESOURCE_LIMIT: 'PROVIDER_GENERATION_RESOURCE_LIMIT',
  PROVIDER_REJECTED: 'PROVIDER_GENERATION_PROVIDER_REJECTED',
  PROVIDER_UNKNOWN: 'PROVIDER_GENERATION_UNKNOWN',
  OUTPUT_INVALID: 'PROVIDER_GENERATION_OUTPUT_INVALID',
  SAVE_UNKNOWN: 'PROVIDER_GENERATION_SAVE_UNKNOWN',
  STORE_INVALID: 'PROVIDER_GENERATION_STORE_INVALID',
  CANCEL_UNCONFIRMED: 'PROVIDER_GENERATION_CANCEL_UNCONFIRMED',
})

export const PROVIDER_GENERATION_LIMITS = Object.freeze({
  maxTextChars: 200,
  maxClaims: 64,
  maxAudioMs: 20000,
  maxBytes: 1024 * 1024,
  minAudioMs: 200,
})

const SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/
const TASK_PATTERN = /^task:fixture-[0-9a-f]{32}$/
const KEY_PATTERN = /^[A-Za-z0-9:._-]{1,64}$/
const PROOF_PATTERN = /^fixture-rights:[A-Za-z0-9:_-]{1,128}$/
const CLAIM_ID_PATTERN = /^claim:[0-9a-f]{32}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/
const WAV_LIMITS = Object.freeze({ sampleRate: 24000, channels: 1, bitsPerSample: 16 })

const CLAIM_TERMINAL = Object.freeze(new Set(['SAVED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'SAVE_UNKNOWN']))
const CLAIM_ACTIVE = Object.freeze(new Set(['CLAIMED', 'BEGINNING']))

function failure(code, detail) {
  return Object.freeze({ ok: false, code, detail })
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function keySurface(value, keys) {
  if (!isObject(value)) return 'invalid'
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length) return 'invalid'
  for (let index = 0; index < expected.length; index += 1) if (actual[index] !== expected[index]) return 'invalid'
  return 'ok'
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** Canonical JSON (sorted keys, recursive) used for digests only; never for display. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (isObject(value)) {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function claimPath(sandbox) {
  return join(sandbox.root, 'provider-generation', 'claims.json')
}

function readLedger(sandbox) {
  const path = claimPath(sandbox)
  let bytes
  try {
    bytes = readFileSync(path)
  } catch (error) {
    if (error && error.code === 'ENOENT') return { schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION, revision: 0, entries: [] }
    return null
  }
  try {
    const parsed = JSON.parse(bytes.toString('utf8'))
    if (keySurface(parsed, new Set(['schemaVersion', 'revision', 'entries'])) !== 'ok') return null
    if (parsed.schemaVersion !== PROVIDER_GENERATION_SCHEMA_VERSION) return null
    if (!Number.isInteger(parsed.revision) || parsed.revision < 0) return null
    if (!Array.isArray(parsed.entries) || parsed.entries.length > PROVIDER_GENERATION_LIMITS.maxClaims) return null
    const seen = new Set()
    for (const entry of parsed.entries) {
      if (!isObject(entry) || typeof entry.claimId !== 'string' || !CLAIM_ID_PATTERN.test(entry.claimId)) return null
      if (seen.has(entry.claimId)) return null
      seen.add(entry.claimId)
      if (typeof entry.scopeId !== 'string' || !SCOPE_PATTERN.test(entry.scopeId)) return null
      if (typeof entry.taskId !== 'string' || !TASK_PATTERN.test(entry.taskId)) return null
      if (typeof entry.taskIdentityHash !== 'string' || !HASH_PATTERN.test(entry.taskIdentityHash)) return null
      if (typeof entry.claimDigest !== 'string' || !HASH_PATTERN.test(entry.claimDigest)) return null
      if (typeof entry.state !== 'string') return null
    }
    return {
      schemaVersion: parsed.schemaVersion,
      revision: parsed.revision,
      entries: parsed.entries.map((entry) => deepFreeze(entry)),
    }
  } catch {
    return null
  }
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item)
    return Object.freeze(value)
  }
  if (isObject(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key])
    return Object.freeze(value)
  }
  return value
}

function writeLedger(sandbox, entries, baseRevision) {
  const path = claimPath(sandbox)
  mkdirSync(dirname(path), { recursive: true })
  const temp = path + '.' + randomBytes(8).toString('hex') + '.tmp'
  const body = { schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION, revision: baseRevision + 1, entries }
  const bytes = Buffer.from(JSON.stringify(body), 'utf8')
  const handle = openSync(temp, 'wx')
  try {
    let offset = 0
    while (offset < bytes.length) offset += writeSync(handle, bytes, offset, bytes.length - offset)
    fsyncSync(handle)
  } finally {
    closeSync(handle)
  }
  renameSync(temp, path)
}

function project(entry) {
  return deepFreeze({
    claimId: entry.claimId,
    scopeId: entry.scopeId,
    taskId: entry.taskId,
    state: entry.state,
    requestDigest: entry.requestDigest,
    claimDigest: entry.claimDigest,
    provider: { ...entry.provider },
    cancel: { requested: entry.cancel.requested, ack: entry.cancel.ack, unknown: entry.cancel.unknown },
    artifact: entry.artifact ? { ...entry.artifact } : null,
    jointProof: entry.jointProof ? { ...entry.jointProof } : null,
    lastError: entry.lastError,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  })
}

/* ------------------------------------- prepare ------------------------------------- */

function readPrepare(input) {
  const keys = new Set(['schemaVersion', 'scopeId', 'taskId', 'requestKey', 'rights', 'provider', 'request'])
  if (!isObject(input) || keySurface(input, keys) !== 'ok') throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'claim')
  if (input.schemaVersion !== PROVIDER_GENERATION_SCHEMA_VERSION) {
    throw failure(PROVIDER_GENERATION_ERRORS.UNSUPPORTED_VERSION, 'schemaVersion')
  }
  if (typeof input.scopeId !== 'string' || !SCOPE_PATTERN.test(input.scopeId)) throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'scopeId')
  if (typeof input.taskId !== 'string' || !TASK_PATTERN.test(input.taskId)) throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'taskId')
  if (typeof input.requestKey !== 'string' || !KEY_PATTERN.test(input.requestKey)) throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'requestKey')
  if (!isObject(input.rights) || keySurface(input.rights, new Set(['state', 'proofRef'])) !== 'ok') {
    throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'rights')
  }
  if (input.rights.state !== 'GRANTED') throw failure(PROVIDER_GENERATION_ERRORS.RIGHTS_REJECTED, 'rights.state')
  if (typeof input.rights.proofRef !== 'string' || !PROOF_PATTERN.test(input.rights.proofRef)) {
    throw failure(PROVIDER_GENERATION_ERRORS.RIGHTS_REJECTED, 'rights.proofRef')
  }
  const provider = input.provider
  if (!isObject(provider) || keySurface(provider, new Set(['providerId', 'instanceId', 'model', 'backend', 'voiceId'])) !== 'ok') {
    throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'provider')
  }
  for (const field of ['providerId', 'instanceId', 'model', 'backend', 'voiceId']) {
    if (typeof provider[field] !== 'string' || provider[field].length === 0 || provider[field].length > 128) {
      throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'provider.' + field)
    }
  }
  const request = input.request
  if (!isObject(request) || keySurface(request, new Set(['text', 'language', 'emotion', 'modality'])) !== 'ok') {
    throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'request')
  }
  if (typeof request.text !== 'string' || request.text.trim().length === 0) throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'request.text')
  if (request.text.length > PROVIDER_GENERATION_LIMITS.maxTextChars) throw failure(PROVIDER_GENERATION_ERRORS.RESOURCE_LIMIT, 'request.text')
  if (typeof request.language !== 'string' || request.language.length === 0 || request.language.length > 32) {
    throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'request.language')
  }
  if (typeof request.emotion !== 'string' || request.emotion.length > 64) throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'request.emotion')
  if (request.modality !== 'design' && request.modality !== 'clone') throw failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'request.modality')
  return {
    scopeId: input.scopeId,
    taskId: input.taskId,
    requestKey: input.requestKey,
    rights: { state: input.rights.state, proofRef: input.rights.proofRef },
    provider: {
      providerId: provider.providerId,
      instanceId: provider.instanceId,
      model: provider.model,
      backend: provider.backend,
      voiceId: provider.voiceId,
    },
    request: { text: request.text, language: request.language, emotion: request.emotion, modality: request.modality },
  }
}

/* ------------------------------------- output ------------------------------------- */

function inspectOutput({ bytes }) {
  if (!(bytes instanceof Uint8Array)) return failure(PROVIDER_GENERATION_ERRORS.OUTPUT_INVALID, 'bytes')
  if (bytes.length > PROVIDER_GENERATION_LIMITS.maxBytes) return failure(PROVIDER_GENERATION_ERRORS.RESOURCE_LIMIT, 'bytes')
  const inspected = inspectFixtureWavBytes({ schemaVersion: 1, bytes })
  if (!inspected || inspected.ok !== true) return failure(PROVIDER_GENERATION_ERRORS.OUTPUT_INVALID, 'bytes')
  const value = inspected.value
  if (value.sampleRate !== WAV_LIMITS.sampleRate) return failure(PROVIDER_GENERATION_ERRORS.OUTPUT_INVALID, 'sampleRate')
  if (value.channels !== WAV_LIMITS.channels) return failure(PROVIDER_GENERATION_ERRORS.OUTPUT_INVALID, 'channels')
  if (value.bitsPerSample !== WAV_LIMITS.bitsPerSample) return failure(PROVIDER_GENERATION_ERRORS.OUTPUT_INVALID, 'bitsPerSample')
  if (!(value.durationMs >= PROVIDER_GENERATION_LIMITS.minAudioMs && value.durationMs <= PROVIDER_GENERATION_LIMITS.maxAudioMs)) {
    return failure(PROVIDER_GENERATION_ERRORS.OUTPUT_INVALID, 'durationMs')
  }
  const owned = new Uint8Array(bytes.length)
  owned.set(bytes)
  return Object.freeze({
    ok: true,
    bytes: owned,
    sha256: value.sha256,
    byteLength: value.byteLength,
    durationMs: value.durationMs,
  })
}

/* ----------------------------------- coordinator ----------------------------------- */

/**
 * @param {object} options
 * @param {object} options.sandbox trusted sandbox (same one the task owner/artifact library use)
 * @param {object} options.artifacts the existing Artifact authority (openFixtureArtifactLibrary)
 * @param {Function} options.authority async ({scopeId, taskId}) -> {ok:true, birth:{identityHash, state}} | {ok:false}
 * @param {object} options.provider audited provider (createQwenProvider) or a test double
 * @param {Function} [options.now] ISO clock
 */
export function createProviderGenerationCoordinator(options = {}) {
  const sandbox = options.sandbox
  if (!sandbox || !isTrustedSandbox(sandbox) || typeof sandbox.root !== 'string') {
    return { ok: false, code: PROVIDER_GENERATION_ERRORS.SANDBOX_INVALID }
  }
  const artifacts = options.artifacts
  if (!artifacts || typeof artifacts.import !== 'function' || typeof artifacts.readBytes !== 'function') {
    return { ok: false, code: PROVIDER_GENERATION_ERRORS.INPUT_INVALID, detail: 'artifact authority is required' }
  }
  const authority = options.authority
  if (typeof authority !== 'function') return { ok: false, code: PROVIDER_GENERATION_ERRORS.INPUT_INVALID, detail: 'task authority is required' }
  // 132: a SAVED generation is only reported after the *original* task owner recorded the artifact;
  // the claim ledger alone is not a task save.
  const taskOwner = options.taskOwner
  if (!taskOwner || typeof taskOwner.saveArtifact !== 'function') {
    return { ok: false, code: PROVIDER_GENERATION_ERRORS.INPUT_INVALID, detail: 'task owner is required' }
  }
  const provider = options.provider
  if (!provider || typeof provider.beginSynthesis !== 'function' || typeof provider.cancel !== 'function') {
    return { ok: false, code: PROVIDER_GENERATION_ERRORS.INPUT_INVALID, detail: 'provider is required' }
  }
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  let closed = false
  const running = new Map()

  function load() {
    const ledger = readLedger(sandbox)
    if (!ledger) return null
    return ledger
  }

  function writeEntries(entries, revision) {
    try {
      writeLedger(sandbox, entries, revision)
      return { ok: true }
    } catch {
      return { ok: false, code: PROVIDER_GENERATION_ERRORS.STORE_INVALID }
    }
  }

  async function prepare(input) {
    if (closed) return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'closed')
    let parsed
    try {
      parsed = readPrepare(input)
    } catch (error) {
      if (error && error.ok === false) return error
      return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'claim')
    }
    const stamp = now()
    if (stamp === null) return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'now')
    let birth
    try {
      birth = await authority({ scopeId: parsed.scopeId, taskId: parsed.taskId })
    } catch {
      return failure(PROVIDER_GENERATION_ERRORS.AUTHORITY_REJECTED, 'authority')
    }
    if (!birth || birth.ok !== true || !isObject(birth.birth)) {
      return failure(PROVIDER_GENERATION_ERRORS.AUTHORITY_REJECTED, 'authority')
    }
    if (typeof birth.birth.identityHash !== 'string' || !HASH_PATTERN.test(birth.birth.identityHash)) {
      return failure(PROVIDER_GENERATION_ERRORS.AUTHORITY_REJECTED, 'birth.identityHash')
    }
    if (birth.birth.state !== undefined && birth.birth.state !== 'CREATED' && birth.birth.state !== 'CLAIMED') {
      return failure(PROVIDER_GENERATION_ERRORS.AUTHORITY_REJECTED, 'birth.state')
    }
    const ledger = load()
    if (!ledger) return failure(PROVIDER_GENERATION_ERRORS.STORE_INVALID, 'ledger')
    if (ledger.entries.length >= PROVIDER_GENERATION_LIMITS.maxClaims) return failure(PROVIDER_GENERATION_ERRORS.RESOURCE_LIMIT, 'claims')
    const requestDigest = sha256(canonicalJson(parsed.request))
    const claimDigest = sha256(canonicalJson({
      schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION,
      scopeId: parsed.scopeId,
      taskId: parsed.taskId,
      requestKey: parsed.requestKey,
      taskIdentityHash: birth.birth.identityHash,
      rights: parsed.rights,
      provider: parsed.provider,
      requestDigest,
    }))
    const sameTask = ledger.entries.find((entry) => entry.scopeId === parsed.scopeId && entry.taskId === parsed.taskId)
    if (sameTask) {
      if (sameTask.claimDigest === claimDigest) return Object.freeze({ ok: true, outcome: 'EXISTING', claim: project(sameTask) })
      return failure(PROVIDER_GENERATION_ERRORS.CONFLICT, 'taskId')
    }
    const otherScope = ledger.entries.find((entry) => entry.taskId === parsed.taskId)
    if (otherScope) return failure(PROVIDER_GENERATION_ERRORS.CROSS_SCOPE, 'scopeId')
    const sameKey = ledger.entries.find((entry) => entry.scopeId === parsed.scopeId && entry.requestKey === parsed.requestKey)
    if (sameKey) {
      if (sameKey.claimDigest === claimDigest) return Object.freeze({ ok: true, outcome: 'EXISTING', claim: project(sameKey) })
      return failure(PROVIDER_GENERATION_ERRORS.CONFLICT, 'requestKey')
    }
    const entry = {
      claimId: 'claim:' + randomBytes(16).toString('hex'),
      scopeId: parsed.scopeId,
      taskId: parsed.taskId,
      requestKey: parsed.requestKey,
      taskIdentityHash: birth.birth.identityHash,
      claimDigest,
      requestDigest,
      request: { ...parsed.request },
      provider: { ...parsed.provider },
      rights: { ...parsed.rights },
      state: 'CLAIMED',
      cancel: { requested: false, ack: null, unknown: false },
      artifact: null,
      jointProof: null,
      lastError: null,
      createdAt: stamp,
      updatedAt: stamp,
    }
    const written = writeEntries([...ledger.entries.map((item) => ({ ...item })), entry], ledger.revision)
    if (!written.ok) return failure(PROVIDER_GENERATION_ERRORS.STORE_INVALID, 'write')
    return Object.freeze({ ok: true, outcome: 'CREATED', claim: project(entry) })
  }

  function find(claimId) {
    const ledger = load()
    if (!ledger) return { ledger: null, entry: null }
    const entry = ledger.entries.find((item) => item.claimId === claimId)
    return { ledger, entry }
  }

  function update(claimId, mutate) {
    const { ledger } = find(claimId)
    if (!ledger) return { ok: false, code: PROVIDER_GENERATION_ERRORS.STORE_INVALID }
    const entries = ledger.entries.map((item) => ({ ...item }))
    const target = entries.find((item) => item.claimId === claimId)
    if (!target) return { ok: false, code: PROVIDER_GENERATION_ERRORS.NOT_FOUND }
    mutate(target)
    target.updatedAt = now()
    const written = writeEntries(entries, ledger.revision)
    if (!written.ok) return { ok: false, code: PROVIDER_GENERATION_ERRORS.STORE_INVALID }
    return { ok: true, entry: target }
  }

  async function submit({ claimId } = {}) {
    if (closed) return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'closed')
    if (typeof claimId !== 'string' || !CLAIM_ID_PATTERN.test(claimId)) return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'claimId')
    if (running.has(claimId)) return failure(PROVIDER_GENERATION_ERRORS.CONFLICT, 'running')
    const { entry } = find(claimId)
    if (!entry) return failure(PROVIDER_GENERATION_ERRORS.NOT_FOUND, 'claimId')
    if (CLAIM_TERMINAL.has(entry.state)) return Object.freeze({ ok: true, outcome: 'EXISTING', claim: project(entry) })
    if (entry.state !== 'CLAIMED') return failure(PROVIDER_GENERATION_ERRORS.CONFLICT, 'state')

    const begunAt = now()
    if (begunAt === null) return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'now')
    const begin = update(claimId, (target) => {
      target.state = 'BEGINNING'
      target.updatedAt = begunAt
    })
    if (!begin.ok) return begin

    let begun
    try {
      begun = await provider.beginSynthesis({
        taskId: entry.taskId,
        scopeId: entry.scopeId,
        text: entry.request.text,
        voiceId: entry.provider.voiceId,
        language: entry.request.language,
        emotion: entry.request.emotion,
        modality: entry.request.modality,
      }, { claimId })
    } catch {
      begun = { ok: false, code: PROVIDER_GENERATION_ERRORS.PROVIDER_UNKNOWN, unknown: true }
    }
    if (!begun || begun.ok !== true) {
      const unknown = begun && begun.unknown === true
      const terminal = unknown ? 'UNKNOWN' : 'FAILED'
      const settled = update(claimId, (target) => {
        target.state = terminal
        target.lastError = (begun && (begun.code || begun.detail)) || 'provider refused'
      })
      return Object.freeze({ ok: false, code: unknown ? PROVIDER_GENERATION_ERRORS.PROVIDER_UNKNOWN : PROVIDER_GENERATION_ERRORS.PROVIDER_REJECTED, claim: settled.ok ? project(settled.entry) : null })
    }

    if (closed) {
      const cancelled = typeof begun.cancel === 'function' ? await begun.cancel().catch(() => ({ ok: false })) : { ok: false }
      update(claimId, (target) => {
        if (CLAIM_TERMINAL.has(target.state)) return
        target.state = 'UNKNOWN'
        target.cancel = { requested: true, ack: cancelled && cancelled.ok === true ? 'ACKED' : 'UNCONFIRMED', unknown: !(cancelled && cancelled.ok === true) }
        target.lastError = 'closed during begin'
      })
      return failure(PROVIDER_GENERATION_ERRORS.PROVIDER_UNKNOWN, 'closed')
    }
    const run = { requestId: begun.requestId || null, cancel: typeof begun.cancel === 'function' ? begun.cancel : null }
    running.set(claimId, run)
    const pendingCancel = find(claimId).entry
    if (pendingCancel && pendingCancel.cancel.requested === true && pendingCancel.cancel.ack !== 'ACKED') {
      const acked = run.cancel ? await run.cancel().catch(() => ({ ok: false })) : { ok: false }
      const acknowledged = Boolean(acked && acked.ok === true && acked.confirmed !== false)
      update(claimId, (target) => {
        target.cancel = { requested: true, ack: acknowledged ? 'ACKED' : 'UNCONFIRMED', unknown: !acknowledged }
      })
    }
    let answered
    try {
      answered = await begun.result
    } catch {
      answered = { ok: false, unknown: true, code: PROVIDER_GENERATION_ERRORS.PROVIDER_UNKNOWN }
    } finally {
      running.delete(claimId)
    }
    if (closed) return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'closed')

    if (!answered || answered.ok !== true) {
      const contradictory = Boolean(answered && answered.cancelled === true && answered.unknown === true)
      const cancelled = Boolean(answered && answered.cancelled === true) && !contradictory
      const unknown = contradictory || (!cancelled && Boolean(answered && (answered.unknown === true || answered.terminal === 'UNKNOWN')))
      const terminal = cancelled ? 'CANCELLED' : unknown ? 'UNKNOWN' : 'FAILED'
      const settled = update(claimId, (target) => {
        if (CLAIM_TERMINAL.has(target.state)) return
        target.state = terminal
        target.lastError = (answered && (answered.code || answered.qwenCode)) || 'provider result rejected'
      })
      return Object.freeze({ ok: terminal === 'CANCELLED', outcome: terminal, claim: settled.ok ? project(settled.entry) : null })
    }

    const inspected = inspectOutput({ bytes: answered.bytes })
    if (!inspected.ok) {
      const settled = update(claimId, (target) => {
        if (CLAIM_TERMINAL.has(target.state)) return
        target.state = 'FAILED'
        target.lastError = inspected.code + ':' + (inspected.detail || 'output')
      })
      return Object.freeze({ ok: false, outcome: 'FAILED', code: inspected.code, claim: settled.ok ? project(settled.entry) : null })
    }

    const expiresAt = new Date(Date.parse(now()) + 24 * 60 * 60 * 1000).toISOString()
    let stored
    try {
      stored = await artifacts.import({
        schemaVersion: 1,
        scopeId: entry.scopeId,
        requestKey: entry.requestKey,
        bytes: inspected.bytes,
        now: now(),
        expiresAt,
        rights: { state: 'GRANTED', proofRef: entry.rights.proofRef },
      })
    } catch {
      stored = { ok: false, errors: [{ code: 'INTERNAL_FAILURE' }] }
    }
    if (!stored || stored.ok !== true) {
      const code = stored && stored.errors && stored.errors[0] ? stored.errors[0].code : 'STORE_INVALID'
      const settled = update(claimId, (target) => {
        if (CLAIM_TERMINAL.has(target.state)) return
        target.state = 'SAVE_UNKNOWN'
        target.lastError = 'artifact:' + code
      })
      return Object.freeze({ ok: false, outcome: 'SAVE_UNKNOWN', code: PROVIDER_GENERATION_ERRORS.SAVE_UNKNOWN, claim: settled.ok ? project(settled.entry) : null })
    }
    const artifact = (stored.value && stored.value.artifact) || {}
    const artifactInspection = artifact.inspection || {}
    if (artifactInspection.sha256 !== inspected.sha256 || artifactInspection.byteLength !== inspected.byteLength) {
      const settled = update(claimId, (target) => {
        if (CLAIM_TERMINAL.has(target.state)) return
        target.state = 'SAVE_UNKNOWN'
        target.lastError = 'artifact:mismatch'
      })
      return Object.freeze({ ok: false, outcome: 'SAVE_UNKNOWN', code: PROVIDER_GENERATION_ERRORS.SAVE_UNKNOWN, claim: settled.ok ? project(settled.entry) : null })
    }

    let readBack
    try {
      readBack = await artifacts.readBytes({
        schemaVersion: 1,
        scopeId: entry.scopeId,
        artifactRef: artifact.artifactRef,
        now: now(),
        rights: { state: 'GRANTED', proofRef: entry.rights.proofRef },
      })
    } catch {
      readBack = { ok: false }
    }
    const readBytes = readBack && readBack.ok === true && readBack.value ? readBack.value.bytes : null
    const readOk = readBytes instanceof Uint8Array && sha256(readBytes) === inspected.sha256
    if (!readOk) {
      const settled = update(claimId, (target) => {
        if (CLAIM_TERMINAL.has(target.state)) return
        target.state = 'SAVE_UNKNOWN'
        target.lastError = 'artifact:readback'
      })
      return Object.freeze({ ok: false, outcome: 'SAVE_UNKNOWN', code: PROVIDER_GENERATION_ERRORS.SAVE_UNKNOWN, claim: settled.ok ? project(settled.entry) : null })
    }

    // 132: the original task owner records the already-imported, readback-verified Artifact before
    // this claim becomes SAVED. A missing/failed task save is a SAVE_UNKNOWN tombstone, never a
    // SAVED claim, and never a second synthesis.
    let taskSave
    try {
      taskSave = await taskOwner.saveArtifact({
        schemaVersion: 1,
        scopeId: entry.scopeId,
        taskId: entry.taskId,
        now: now(),
        rights: { state: 'GRANTED', proofRef: entry.rights.proofRef },
        artifactRef: artifact.artifactRef,
        artifactSha256: inspected.sha256,
        artifactByteLength: inspected.byteLength,
      })
    } catch {
      taskSave = null
    }
    if (
      !taskSave ||
      taskSave.ok !== true ||
      taskSave.value.ownerState !== 'SAVED' ||
      !taskSave.value.artifact ||
      taskSave.value.artifact.artifactRef !== artifact.artifactRef
    ) {
      const code = taskSave && taskSave.errors && taskSave.errors[0] ? taskSave.errors[0].code : 'TASK_SAVE_REJECTED'
      const settled = update(claimId, (target) => {
        if (CLAIM_TERMINAL.has(target.state)) return
        target.state = 'SAVE_UNKNOWN'
        target.lastError = 'task:' + code
      })
      return Object.freeze({ ok: false, outcome: 'SAVE_UNKNOWN', code: PROVIDER_GENERATION_ERRORS.SAVE_UNKNOWN, claim: settled.ok ? project(settled.entry) : null })
    }

    const jointProof = {
      schemaVersion: PROVIDER_GENERATION_SCHEMA_VERSION,
      claimDigest: entry.claimDigest,
      requestDigest: entry.requestDigest,
      taskIdentityHash: entry.taskIdentityHash,
      provider: { ...entry.provider },
      artifactRef: artifact.artifactRef,
      artifactSha256: inspected.sha256,
      byteLength: inspected.byteLength,
      durationMs: inspected.durationMs,
      savedAt: now(),
    }
    const settled = update(claimId, (target) => {
      if (CLAIM_TERMINAL.has(target.state)) return
      target.state = 'SAVED'
      target.artifact = {
        artifactRef: artifact.artifactRef,
        sha256: inspected.sha256,
        byteLength: inspected.byteLength,
        durationMs: inspected.durationMs,
      }
      target.jointProof = jointProof
      target.lastError = null
    })
    if (!settled.ok) return failure(PROVIDER_GENERATION_ERRORS.SAVE_UNKNOWN, 'claim-write')
    return Object.freeze({ ok: true, outcome: 'SAVED', claim: project(settled.entry), task: taskSave.value })
  }

  function status(claimId) {
    const { entry } = find(claimId)
    if (!entry) return failure(PROVIDER_GENERATION_ERRORS.NOT_FOUND, 'claimId')
    return Object.freeze({ ok: true, claim: project(entry) })
  }

  async function cancel(claimId) {
    if (typeof claimId !== 'string' || !CLAIM_ID_PATTERN.test(claimId)) return failure(PROVIDER_GENERATION_ERRORS.INPUT_INVALID, 'claimId')
    const { entry } = find(claimId)
    if (!entry) return failure(PROVIDER_GENERATION_ERRORS.NOT_FOUND, 'claimId')
    if (CLAIM_TERMINAL.has(entry.state)) return Object.freeze({ ok: true, outcome: 'EXISTING', claim: project(entry) })
    const run = running.get(claimId)
    if (!run && entry.state === 'BEGINNING') {
      const stored = update(claimId, (target) => {
        target.cancel = { requested: true, ack: 'PENDING', unknown: false }
      })
      if (!stored.ok) return failure(PROVIDER_GENERATION_ERRORS.STORE_INVALID, 'cancel')
      return Object.freeze({ ok: true, outcome: 'CANCEL_PENDING', claim: project(stored.entry) })
    }
    let ack = null
    try {
      ack = run && run.requestId ? await provider.cancel(run.requestId) : { ok: false, code: null }
    } catch {
      ack = { ok: false, code: 'CANCEL_THREW' }
    }
    const acknowledged = Boolean(ack && ack.ok === true && ack.confirmed !== false)
    const settled = update(claimId, (target) => {
      target.cancel = { requested: true, ack: acknowledged ? 'ACKED' : 'UNCONFIRMED', unknown: !acknowledged }
    })
    if (!settled.ok) return failure(PROVIDER_GENERATION_ERRORS.STORE_INVALID, 'cancel')
    if (!acknowledged) {
      return Object.freeze({ ok: false, code: PROVIDER_GENERATION_ERRORS.CANCEL_UNCONFIRMED, claim: project(settled.entry) })
    }
    return Object.freeze({ ok: true, outcome: 'CANCEL_REQUESTED', claim: project(settled.entry) })
  }

  async function get(claimId) {
    const { entry } = find(claimId)
    if (!entry) return failure(PROVIDER_GENERATION_ERRORS.NOT_FOUND, 'claimId')
    if (entry.state !== 'SAVED' || !entry.artifact) return failure(PROVIDER_GENERATION_ERRORS.AUTHORITY_REJECTED, 'state')
    const read = await artifacts.readBytes({
      schemaVersion: 1,
      scopeId: entry.scopeId,
      artifactRef: entry.artifact.artifactRef,
      now: now(),
      rights: { state: 'GRANTED', proofRef: entry.rights.proofRef },
    })
    return read
  }

  async function close() {
    closed = true
    const handled = []
    const ledger = load()
    if (ledger) {
      for (const entry of ledger.entries) {
        if (!CLAIM_ACTIVE.has(entry.state)) continue
        const run = running.get(entry.claimId)
        let acked = false
        if (run && run.cancel) {
          const ack = await run.cancel().catch(() => ({ ok: false }))
          acked = Boolean(ack && ack.ok === true && ack.confirmed !== false)
        }
        const settled = update(entry.claimId, (target) => {
          if (CLAIM_TERMINAL.has(target.state)) return
          target.state = 'UNKNOWN'
          target.cancel = { requested: true, ack: acked ? 'ACKED' : 'UNCONFIRMED', unknown: !acked }
          target.lastError = 'closed while active'
        })
        if (settled.ok) handled.push(entry.claimId)
      }
    }
    return { ok: true, settled: handled }
  }

  return Object.freeze({ ok: true, prepare, submit, status, cancel, get, close })
}
