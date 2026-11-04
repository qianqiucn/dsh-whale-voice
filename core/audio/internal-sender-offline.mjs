/* Whale Voice — Plan 13-B internal Sender, OFFLINE / FIXTURE_ONLY (no real process, device, WeChat or network).
 *
 * This module is the Whale Relay Core's own Windows delivery module: it consumes only a trusted SAVED
 * Artifact fact + a trusted target and exposes the same backend interface the relay already owns
 * (`id/health/capabilities/resolveTarget/submit/status/cancel`). It reuses the original user-owned
 * Voice Sender algorithms/scripts from the reviewed static closure (see `sender-internal/source/` and
 * `source-manifest.json`) as *resources*, but it never imports the original HTTP server, never spawns
 * PowerShell, never opens a socket, device or WeChat window and never writes.
 *
 * 144-ABI / 144-CANCEL: the offline unit no longer invents a script ABI. Every invocation is built
 * from `INTERNAL_WORKER_ABI`, which is the *actual* parameter table of the archived worker
 * (`voice-sender.ps1 -Request <request.json> -JsonOut <result.json> -ProgressFile <p> -CancelFile <c>
 * -GlobalCancelFile <g>`, launched exactly like the reviewed service: `-NoProfile -ExecutionPolicy
 * Bypass -File <script>`). `verifyWorkerAbi()` re-derives the parameter tables and the request-field
 * usage from the archived resources at runtime, so a drift between this descriptor and the reviewed
 * source is detected statically instead of being "accepted" by a fixture. Cancellation is not a
 * script: the reviewed protocol is a per-job cancel *file* that the running worker polls, therefore
 * `cancel()` writes that signal and only the worker's own observed result can confirm it.
 *
 * 144-ONCE / 144-BINDING: validation, the immutable fact snapshot, the id claim, the conflict check
 * and the post-queue re-check all happen inside one trusted boundary; a delivery id has exactly one
 * invocation, an indeterminate result can never be re-invoked, and an existing delivery can never
 * consume another Artifact/target.
 *
 * 144-RESULT: only a provable pre-execution refusal is `preSubmit`. A missing/empty/thrown/unknown
 * worker result is *indeterminate* and never settles as "provably not sent".
 *
 * Layer model (kept from the original Sender where it maps to this offline unit):
 *   relay target/allowlist/identity gate  ->  internal module's own target directory + two gates
 *   fixed script + fixed argv             ->  `buildInternalInvocation()` ABI-bound whitelist
 *   request/cancel protocol               ->  `buildSendRequest()` + cancel-file signal
 *   queue / claim / cancel / recovery      ->  one serial in-memory queue, one invocation per delivery
 *   process execution                      ->  injected Fixture transport (never a real child process)
 *   NEVER_WRITE / UNKNOWN no-resend        ->  preserved; a result is never retried or re-bound
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const INTERNAL_SENDER_SCHEMA_VERSION = 1
export const INTERNAL_SENDER_ID = 'whale-relay-internal-sender'
export const INTERNAL_SENDER_MODE = 'FIXTURE'
export const INTERNAL_WORKER_ABI_VERSION = 1

export const INTERNAL_SENDER_ERRORS = Object.freeze({
  INPUT_INVALID: 'INTERNAL_SENDER_INPUT_INVALID',
  TARGET_REJECTED: 'INTERNAL_SENDER_TARGET_REJECTED',
  UNSUPPORTED_CAPABILITY: 'INTERNAL_SENDER_UNSUPPORTED_CAPABILITY',
  FIXTURE_REJECTED: 'INTERNAL_SENDER_FIXTURE_REJECTED',
  UNKNOWN_NO_RESEND: 'INTERNAL_SENDER_UNKNOWN_NO_RESEND',
  SCRIPT_NOT_ALLOWED: 'INTERNAL_SENDER_SCRIPT_NOT_ALLOWED',
  DELIVERY_CONFLICT: 'INTERNAL_SENDER_DELIVERY_CONFLICT',
  CANCEL_TOO_LATE: 'INTERNAL_SENDER_CANCEL_TOO_LATE',
})

/** Scripts copied from the reviewed static source closure. Only these ids exist. */
export const INTERNAL_SENDER_SCRIPTS = Object.freeze({
  SEND: 'voice-sender.ps1',
  RECOVER: 'voice-sender-recover.ps1',
  WECHAT_STATUS: 'wechat-status.ps1',
  HOTKEY: 'hotkey-host.ps1',
  DESKTOP_GUARD: 'desktop-guard.ps1',
})

/**
 * Version-bound descriptor of the reviewed worker ABI (Service 0.1.0).
 *
 * `parameters` is the real PowerShell `param()` table of each archived script, in declaration order;
 * `requestFields` is the set of request-JSON fields `voice-sender.ps1` actually reads. Both are
 * re-derived from the archived bytes by `verifyWorkerAbi()`; nothing here is invented.
 */
export const INTERNAL_WORKER_ABI = Object.freeze({
  abiVersion: INTERNAL_WORKER_ABI_VERSION,
  serviceVersion: '0.1.0',
  manifestPreflightSha256: 'a3056dea8965a85a880b0fe5c9a0752e86ce8ab94947ccb3ba77a4f07a595bf4',
  launcher: Object.freeze(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File']),
  scripts: Object.freeze({
    SEND: Object.freeze({
      relativeScript: 'voice-sender.ps1',
      parameters: Object.freeze(['Request', 'JsonOut', 'ProgressFile', 'CancelFile', 'GlobalCancelFile']),
      required: Object.freeze(['Request', 'JsonOut']),
      cancelVia: 'CANCEL_FILE',
      requestFields: Object.freeze([
        'wav', 'chat', 'voice_pre_silence_ms', 'voice_post_silence_ms', 'target', 'automation',
        'cancel_file', 'global_cancel_file', 'cancel_after', 'voice_allowed_chats',
      ]),
    }),
    RECOVER: Object.freeze({
      relativeScript: 'voice-sender-recover.ps1',
      parameters: Object.freeze(['Status', 'JsonOut']),
      required: Object.freeze([]),
    }),
    WECHAT_STATUS: Object.freeze({
      relativeScript: 'wechat-status.ps1',
      parameters: Object.freeze(['ExpectedProcessPath']),
      required: Object.freeze([]),
    }),
    HOTKEY: Object.freeze({
      relativeScript: 'hotkey-host.ps1',
      parameters: Object.freeze(['SignalFile', 'StatusFile', 'LogFile', 'Accelerator', 'SelfTest']),
      required: Object.freeze(['SignalFile', 'StatusFile']),
    }),
    DESKTOP_GUARD: Object.freeze({
      relativeScript: 'desktop-guard.ps1',
      parameters: Object.freeze(['Verbose_']),
      required: Object.freeze([]),
    }),
  }),
})

/** Worker request defaults; the caller cannot choose them (no free-form worker policy input). */
const REQUEST_DEFAULTS = Object.freeze({
  preSilenceMs: 1000,
  postSilenceMs: 1000,
  automationMode: 'manual',
})

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_ROOT = path.join(HERE, 'sender-internal', 'source')
const MANIFEST_FILE = path.join(HERE, 'sender-internal', 'source-manifest.json')
const SERVICE_ROOT = path.join(SOURCE_ROOT, 'service', 'src')
const DEFAULT_RUN_ROOT = path.join(SOURCE_ROOT, 'run')

const ARTIFACT_KEYS = Object.freeze(['artifactRef', 'sha256', 'byteLength', 'durationMs', 'format'])
const SHA256 = /^[0-9a-f]{64}$/
const ARTIFACT_REF = /^artifact:fixture-bytes-[0-9a-f]{32}$/
const DELIVERY_ID = /^delivery:[0-9a-f]{32}$/
const TARGET_ID = /^[A-Za-z0-9:_-]{1,64}$/
const CANCEL_STAGES = Object.freeze(['CANCELLED_BEFORE_UI', 'CANCELLED_CONFIRMED'])
/** Worker parameters that carry an internal temp-handle path (absolute, traversal-free only). */
const PATH_PARAMETERS = Object.freeze(['Request', 'JsonOut', 'ProgressFile', 'CancelFile', 'GlobalCancelFile', 'SignalFile', 'StatusFile', 'LogFile'])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value
  for (const key of Object.keys(value)) deepFreeze(value[key])
  return Object.freeze(value)
}

function clampInt(value, min, max, fallback) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

function isInside(child, parent) {
  const rel = path.relative(parent, child)
  if (rel === '') return true
  if (path.isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !rel.startsWith('../')
}

/** Read-only access to the reviewed source manifest (provenance; never used to execute anything). */
export function readInternalSenderManifest() {
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) } catch { return null }
  if (!isObject(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.files) || !Array.isArray(parsed.metadata)) return null
  return parsed
}

/** Resolve a whitelisted script inside the package only (no traversal, no arbitrary path). */
export function resolveInternalScript(scriptId) {
  const relative = INTERNAL_SENDER_SCRIPTS[scriptId]
  if (typeof relative !== 'string') return null
  const root = path.resolve(SOURCE_ROOT)
  const file = path.resolve(root, relative)
  if (file !== root && !file.startsWith(root + path.sep)) return null
  return fs.existsSync(file) ? file : null
}

/** Extract the real PowerShell `param()` names of an archived script (static text, never executed). */
function parseParamNames(text) {
  const match = /(^|\n)[ \t]*param[ \t]*\(/.exec(text)
  if (!match) return null
  const open = text.indexOf('(', match.index)
  let depth = 0
  let end = -1
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) { end = i; break }
    }
  }
  if (end < 0) return null
  const block = text.slice(open + 1, end)
  const names = []
  const declaration = /\[[A-Za-z_][A-Za-z0-9_\[\]]*\]\s*\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g
  let found
  while ((found = declaration.exec(block)) !== null) names.push(found[1])
  return names
}

function readTextOrNull(file) {
  try { return fs.readFileSync(file, 'utf8') } catch { return null }
}

/**
 * Static cross-check of `INTERNAL_WORKER_ABI` against the archived resources. It never runs a script:
 * it compares the declared parameter tables with the real `param()` blocks, the declared request
 * fields with the fields the worker actually reads, and the launcher/argv with the reviewed service.
 */
export function verifyWorkerAbi() {
  const scripts = []
  const mismatches = []
  for (const [scriptId, abi] of Object.entries(INTERNAL_WORKER_ABI.scripts)) {
    const file = resolveInternalScript(scriptId)
    if (!file) {
      mismatch(`script:${scriptId}`, 'the archived script is missing')
      continue
    }
    const text = readTextOrNull(file)
    const parameters = text === null ? null : parseParamNames(text)
    if (!parameters) {
      mismatch(`param:${scriptId}`, 'no param() block could be parsed')
      continue
    }
    const same = parameters.length === abi.parameters.length && parameters.every((name, index) => name === abi.parameters[index])
    if (!same) mismatch(`param:${scriptId}`, `declared ${abi.parameters.join(',')} / actual ${parameters.join(',')}`)
    scripts.push(Object.freeze({ scriptId, relativeScript: abi.relativeScript, parameters: Object.freeze(parameters), matches: same }))
  }

  const sendScript = readTextOrNull(path.join(SOURCE_ROOT, 'voice-sender.ps1')) ?? ''
  const missingRequestFields = INTERNAL_WORKER_ABI.scripts.SEND.requestFields.filter(
    (field) => !sendScript.includes("'" + field + "'") && !sendScript.includes('$req.' + field),
  )
  if (missingRequestFields.length > 0) mismatch('requestFields:SEND', missingRequestFields.join(','))

  const serviceText = readTextOrNull(path.join(SERVICE_ROOT, 'sender.mjs')) ?? ''
  const argvTokens = [...INTERNAL_WORKER_ABI.launcher, '-Request', '-JsonOut', '-ProgressFile', '-CancelFile', '-GlobalCancelFile']
  const missingArgvTokens = argvTokens.filter((token) => !serviceText.includes("'" + token + "'"))
  if (missingArgvTokens.length > 0) mismatch('argv:SEND', missingArgvTokens.join(','))

  function mismatch(scope, detail) {
    mismatches.push(Object.freeze({ scope, detail }))
  }

  return Object.freeze({
    ok: mismatches.length === 0,
    abiVersion: INTERNAL_WORKER_ABI.abiVersion,
    serviceVersion: INTERNAL_WORKER_ABI.serviceVersion,
    scripts: Object.freeze(scripts),
    requestFields: Object.freeze({
      ok: missingRequestFields.length === 0,
      checked: INTERNAL_WORKER_ABI.scripts.SEND.requestFields.length,
      missing: Object.freeze(missingRequestFields),
    }),
    argv: Object.freeze({ ok: missingArgvTokens.length === 0, checked: argvTokens.length, missing: Object.freeze(missingArgvTokens) }),
    mismatches: Object.freeze(mismatches),
  })
}

/**
 * Build one fixed invocation from the ABI table. The script id and the parameter names are closed;
 * the caller cannot pass an arbitrary command, URL, shell fragment or extra parameter. Internal
 * temp-handle parameters must be absolute, traversal-free single-line paths.
 */
export function buildInternalInvocation(scriptId, params = {}) {
  const abi = INTERNAL_WORKER_ABI.scripts[scriptId]
  if (!abi) return fail(INTERNAL_SENDER_ERRORS.SCRIPT_NOT_ALLOWED, 'scriptId')
  const script = resolveInternalScript(scriptId)
  if (!script) return fail(INTERNAL_SENDER_ERRORS.SCRIPT_NOT_ALLOWED, 'script')
  if (!isObject(params)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'params')
  for (const key of Object.keys(params)) {
    if (!abi.parameters.includes(key)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
  }
  const argv = [...INTERNAL_WORKER_ABI.launcher, script]
  for (const key of abi.parameters) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      if (abi.required.includes(key)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
      continue
    }
    const value = params[key]
    if (value === true) {
      argv.push('-' + key)
      continue
    }
    if (value === false || value === null || value === undefined) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
    if (typeof value !== 'string' && typeof value !== 'number') return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
    const text = String(value)
    if (text.length < 1 || text.length > 512 || /[\r\n\0]/.test(text)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
    if (PATH_PARAMETERS.includes(key)) {
      if (!path.isAbsolute(text) || text.split(/[\\/]/).includes('..')) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
    }
    argv.push('-' + key, text)
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: INTERNAL_SENDER_SCHEMA_VERSION,
      scriptId,
      script,
      relativeScript: abi.relativeScript,
      argv: Object.freeze(argv),
      shell: false,
      interactive: false,
      abiVersion: INTERNAL_WORKER_ABI.abiVersion,
    }),
  }
}

function validateArtifact(artifact) {
  if (!isObject(artifact)) return null
  const keys = Object.keys(artifact)
  if (keys.length !== ARTIFACT_KEYS.length) return null
  for (const key of keys) if (!ARTIFACT_KEYS.includes(key)) return null
  if (typeof artifact.artifactRef !== 'string' || !ARTIFACT_REF.test(artifact.artifactRef)) return null
  if (typeof artifact.sha256 !== 'string' || !SHA256.test(artifact.sha256)) return null
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 1 || artifact.byteLength > 8 * 1024 * 1024) return null
  if (!Number.isInteger(artifact.durationMs) || artifact.durationMs < 1 || artifact.durationMs > 15 * 60 * 1000) return null
  if (artifact.format !== 'WAV') return null
  return Object.freeze({
    artifactRef: artifact.artifactRef,
    sha256: artifact.sha256,
    byteLength: artifact.byteLength,
    durationMs: artifact.durationMs,
    format: 'WAV',
  })
}

/** Shape-only read of one internal worker-directory entry; gates are booleans, never trusted blind. */
function readWorkerTarget(target) {
  if (!isObject(target)) return null
  if (typeof target.chat !== 'string' || target.chat.length < 1 || target.chat.length > 128 || /[\r\n\0]/.test(target.chat)) return null
  // A chat label is a display identity, never a path/URL/command.
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/|~|[a-z][a-z0-9+.-]*:\/\/)/i.test(target.chat)) return null
  if (typeof target.targetId !== 'string' || !TARGET_ID.test(target.targetId)) return null
  if (target.kind !== 'PRIVATE' && target.kind !== 'GROUP') return null
  const entry = {
    targetId: target.targetId, kind: target.kind, chat: target.chat,
    identityVerified: target.identityVerified === true,
    authorized: target.authorized === true,
    allowlisted: target.allowlisted === true,
    bridgeAllowed: target.bridgeAllowed === true,
    workerAllowed: target.workerAllowed === true,
  }
  return Object.freeze(entry)
}

/** The two gates plus identity/authorization must all be provably open. */
function workerGatesOpen(entry) {
  return isObject(entry) && entry.identityVerified === true && entry.authorized === true && entry.allowlisted === true &&
    entry.bridgeAllowed === true && entry.workerAllowed === true
}

const FORBIDDEN_KEY = /(path|url|uri|command|argv|script|shell|exec|spawn|env|cwd|token|secret|password)/i

function validateDelivery(delivery) {
  if (!isObject(delivery)) return null
  // The relay record carries informational fields; none of them may smuggle a path/URL/command/env.
  for (const key of Object.keys(delivery)) if (FORBIDDEN_KEY.test(key)) return null
  if (typeof delivery.deliveryId !== 'string' || !DELIVERY_ID.test(delivery.deliveryId)) return null
  if (delivery.backendId !== INTERNAL_SENDER_ID) return null
  if (typeof delivery.targetId !== 'string' || !TARGET_ID.test(delivery.targetId)) return null
  if (delivery.targetKind !== 'PRIVATE' && delivery.targetKind !== 'GROUP') return null
  return delivery
}

/**
 * Build the real request payload + internal temp handles for one delivery.
 * The trusted owner (this module) generates every path; the caller supplies only bounded ids.
 */
export function buildSendRequest({ deliveryId, artifact, target, runRoot = DEFAULT_RUN_ROOT, now, silence } = {}) {
  if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'deliveryId')
  const checkedArtifact = validateArtifact(artifact)
  if (!checkedArtifact) return fail(INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY, 'artifact')
  const checkedTarget = readWorkerTarget(target)
  if (!checkedTarget) return fail(INTERNAL_SENDER_ERRORS.TARGET_REJECTED, 'target')
  if (!workerGatesOpen(checkedTarget)) return fail(INTERNAL_SENDER_ERRORS.TARGET_REJECTED, 'target gates')
  if (typeof runRoot !== 'string' || runRoot.length < 3 || /[\r\n\0]/.test(runRoot) || !path.isAbsolute(runRoot)) {
    return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'runRoot')
  }
  if (typeof now !== 'string' || !Number.isFinite(Date.parse(now))) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'now')
  const root = path.resolve(runRoot)
  const base = 'svc-' + deliveryId.slice('delivery:'.length)
  const makeFile = (suffix) => {
    const candidate = path.resolve(root, base + suffix)
    return isInside(candidate, root) ? candidate : null
  }
  const files = {
    request: makeFile('.request.json'),
    result: makeFile('.result.json'),
    progress: makeFile('.progress'),
    cancel: makeFile('.cancel.json'),
    wav: makeFile('.wav'),
    globalCancel: path.resolve(SOURCE_ROOT, 'service', 'runtime', 'emergency-stop.signal.json'),
  }
  if (Object.values(files).some((value) => value === null)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'runFiles')
  if (!isInside(files.globalCancel, path.resolve(SOURCE_ROOT))) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'globalCancel')
  const request = deepFreeze({
    wav: files.wav,
    chat: checkedTarget.chat,
    voice_pre_silence_ms: clampInt(silence?.preMs, 0, 10000, REQUEST_DEFAULTS.preSilenceMs),
    voice_post_silence_ms: clampInt(silence?.postMs, 0, 10000, REQUEST_DEFAULTS.postSilenceMs),
    target: { kind: checkedTarget.kind === 'GROUP' ? 'group' : 'private', identityVerified: true },
    automation: { mode: REQUEST_DEFAULTS.automationMode, autoOpenChat: false, autoRestoreMinimized: true, pauseWhenFullscreen: true },
    cancel_file: files.cancel,
    global_cancel_file: files.globalCancel,
    cancel_after: now,
    // The internal directory is the only source of the allow-list: one verified target, fail closed.
    voice_allowed_chats: [checkedTarget.chat],
  })
  return {
    ok: true,
    value: deepFreeze({ runRoot: root, files, request, artifact: checkedArtifact, target: checkedTarget }),
  }
}

/** Canonical identity of one delivery's trusted facts (id + target + backend + artifact). */
function deliveryFactKey({ deliveryId, targetId, targetKind, backendId, artifact }) {
  return crypto.createHash('sha256').update([
    'internal-sender-v1', deliveryId, backendId, targetId, targetKind,
    artifact.artifactRef, artifact.sha256, String(artifact.byteLength), String(artifact.durationMs), artifact.format,
  ].join('|'), 'utf8').digest('hex')
}

/**
 * Tri-state UI evidence from the optional progress phases/timeline. `BAD` means the evidence itself
 * is malformed, so it may not be used to prove a pre-execution refusal.
 */
function workerUiEvidence(result) {
  let touched = false
  if (result.phases !== undefined) {
    if (!Array.isArray(result.phases)) return 'BAD'
    for (const phase of result.phases) {
      if (typeof phase !== 'string') return 'BAD'
      if (phase === 'RECORDING' || phase === 'SENDING') touched = true
    }
  }
  if (result.timeline !== undefined) {
    if (!Array.isArray(result.timeline)) return 'BAD'
    for (const line of result.timeline) {
      let value = null
      if (typeof line === 'string') value = line
      else if (isObject(line) && typeof line.text === 'string') value = line.text
      else return 'BAD'
      if (/recording confirmed|right Alt (down|released)/i.test(value)) touched = true
    }
  }
  return touched ? 'YES' : 'NO'
}

/**
 * Map one real worker result to this module's result layer, using the same conservative rules the
 * reviewed service applies: only a provable pre-UI rejection is "not sent"; everything that may have
 * reached the UI is indeterminate. A recognized status name alone is not trusted: malformed or
 * contradictory key evidence (bad reason/stage/bubble/phases/timeline, or a rejection carrying UI
 * evidence) is `UNKNOWN`, never a clean cancel or a pre-submit failure.
 */
function classifyWorkerResult(result) {
  if (!isObject(result)) return { kind: 'UNKNOWN', detail: 'worker result is missing or not an object' }
  if (typeof result.status !== 'string' || result.status.length === 0) return { kind: 'UNKNOWN', detail: 'worker result has no usable status' }
  const status = result.status.toUpperCase()
  if (result.reason !== undefined && typeof result.reason !== 'string') return { kind: 'UNKNOWN', detail: 'worker result reason is malformed' }
  const reason = typeof result.reason === 'string' ? result.reason : ''
  const evidence = workerUiEvidence(result)
  if (evidence === 'BAD') return { kind: 'UNKNOWN', detail: 'worker UI evidence is malformed' }
  if (status === 'SENT_LOCAL') return { kind: 'SENT_LOCAL' }
  if (status === 'CANCELLED') {
    if (result.cancel_bubble_appeared !== undefined && typeof result.cancel_bubble_appeared !== 'boolean') {
      return { kind: 'UNKNOWN', detail: 'worker cancel bubble evidence is malformed' }
    }
    if (result.cancel_bubble_appeared === true) return { kind: 'UNKNOWN', detail: 'a cancelled recording leaked a bubble' }
    if (result.cancel_stage !== undefined && typeof result.cancel_stage !== 'string') {
      return { kind: 'UNKNOWN', detail: 'worker cancel stage is malformed' }
    }
    if (result.cancel_stage === 'UNKNOWN') return { kind: 'UNKNOWN', detail: 'worker could not confirm the cancellation' }
    if (result.cancel_stage !== undefined && !CANCEL_STAGES.includes(result.cancel_stage)) {
      return { kind: 'UNKNOWN', detail: 'worker cancel stage is unrecognized' }
    }
    if (/cancel_unconfirmed|UNKNOWN_AFTER_SEND/i.test(reason)) return { kind: 'UNKNOWN', detail: 'a cancellation could not be proven' }
    return { kind: 'CANCELLED', cancelStage: result.cancel_stage || 'CANCELLED_BEFORE_UI' }
  }
  if (status === 'REJECTED' || status === 'FAILED') {
    if (evidence === 'YES') return { kind: 'UNKNOWN', detail: 'worker reports a rejection after the UI was touched' }
    return { kind: 'PRE_SUBMIT', detail: 'worker ' + status.toLowerCase() + ' before the UI: ' + (reason || status) }
  }
  if (status === 'UNKNOWN') return { kind: 'UNKNOWN', detail: reason || 'worker reported UNKNOWN' }
  return { kind: 'UNKNOWN', detail: 'unrecognized worker status: ' + status }
}

/**
 * Test-only worker transport. The module never creates a process, socket, device or WeChat call; a
 * caller must inject this transport, which records the exact fixed invocation and returns a scripted
 * *worker result* in the real shape (`status`/`reason`/`cancel_stage`/`cancel_bubble_appeared`).
 *
 * Scripted entries (in order):
 *   { status, reason, cancel_stage, cancel_bubble_appeared, phases, timeline }  final worker result
 *   { dispatchOnly: true }        process started, terminal result only available through `query()`
 *   { missing: true }             the worker produced no result file
 *   { throwError: true }          the transport throws before returning anything
 *   { delayMs }                   delay before the scripted result (in-flight cancel window)
 *
 * `writeCancel({...})` records the real per-job cancel signal; with a dispatch-only delivery the
 * scripted `cancelResult` becomes the worker's observed outcome returned by `query()`.
 */
export function createFixtureTransport(options = {}) {
  const invocations = []
  const cancelSignals = []
  const scripted = Array.isArray(options.results) ? [...options.results] : []
  const defaultResult = options.defaultResult || { status: 'SENT_LOCAL', reason: 'bubble:fixture-internal', bubble_name: 'fixture-internal-bubble' }
  const cancelResult = options.cancelResult || { status: 'CANCELLED', reason: 'USER_CANCELLED:CANCELLED_CONFIRMED', cancel_stage: 'CANCELLED_CONFIRMED', cancel_bubble_appeared: false }
  const dispatched = new Set()
  const later = new Map()
  return Object.freeze({
    invocations,
    cancelSignals,
    enqueue(result) { scripted.push(result) },
    /** Script the terminal result a dispatch-only worker reports on a later query. */
    resolveLater(deliveryId, result) { later.set(deliveryId, result) },
    async invoke(invocation) {
      invocations.push(invocation)
      const next = scripted.length ? scripted.shift() : defaultResult
      if (Number.isFinite(next?.delayMs) && next.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, next.delayMs))
      if (next?.throwError === true) throw new Error('fixture transport failure')
      if (next?.missing === true) return null
      if (next?.dispatchOnly === true) {
        dispatched.add(invocation.deliveryId)
        return { ok: true, dispatched: true }
      }
      return next
    },
    async writeCancel(signal) {
      cancelSignals.push(signal)
      if (options.cancelThrows === true) throw new Error('fixture cancel signal failure')
      if (options.cancelRejected === true) return { ok: false, code: 'FIXTURE_CANCEL_REJECTED' }
      return { ok: true, file: signal.cancelFile }
    },
    async query({ deliveryId } = {}) {
      if (later.has(deliveryId)) return { ok: true, value: later.get(deliveryId) }
      if (dispatched.has(deliveryId)) {
        const cancelled = cancelSignals.some((signal) => signal.deliveryId === deliveryId)
        return { ok: true, value: cancelled ? cancelResult : null }
      }
      return { ok: true, value: null }
    },
  })
}

/**
 * One internal Sender backend: Artifact-only, one serial queue, one invocation per delivery,
 * NEVER_WRITE and no retry/re-bind. It exposes exactly the interface the relay already consumes.
 */
export function createInternalSenderOffline({ targets = [], transport, runRoot = DEFAULT_RUN_ROOT, now = () => new Date().toISOString(), silence } = {}) {
  if (!Array.isArray(targets) || !transport || typeof transport.invoke !== 'function') {
    throw new TypeError('internal sender needs a target list and an injected Fixture transport')
  }
  const resolvedRunRoot = path.resolve(runRoot)
  if (typeof runRoot !== 'string' || !path.isAbsolute(runRoot) || runRoot.length < 3 || /[\r\n\0]/.test(runRoot)) {
    throw new TypeError('internal sender run root must be an absolute, single-line directory')
  }
  if (path.parse(resolvedRunRoot).root === resolvedRunRoot) throw new TypeError('internal sender run root cannot be a filesystem root')
  const targetMap = new Map()
  for (const target of targets) {
    if (!isObject(target)) throw new TypeError('invalid target')
    const entry = readWorkerTarget(target)
    if (!entry) throw new TypeError('internal target needs a target id, a kind and a bounded chat label')
    targetMap.set(entry.targetId, entry)
  }
  const stats = { submitted: 0, accepted: 0, cancelled: 0, rejected: 0, unknown: 0, targetChecks: 0, invocations: 0 }
  const claims = new Map()
  let queueTail = Promise.resolve()
  const capabilities = Object.freeze({ formats: Object.freeze(['WAV']), maxDurationMs: 15 * 60 * 1000, maxBytes: 8 * 1024 * 1024, voiceOrFile: 'VOICE' })

  function reject(detail, code = INTERNAL_SENDER_ERRORS.TARGET_REJECTED) {
    stats.rejected += 1
    return { ok: false, preSubmit: true, code, detail }
  }

  function serialized(task) {
    const run = queueTail.then(task, task)
    queueTail = run.then(() => {}, () => {})
    return run
  }

  function mintReceipt() {
    return 'fixture-internal-' + crypto.randomBytes(8).toString('hex')
  }

  /** Write-once terminal outcome; resolving the terminal promise releases the execution slot. */
  function settle(claim, outcome) {
    if (claim.phase === 'SETTLED') return claim.result
    const frozen = deepFreeze({ ...outcome })
    claim.result = frozen
    claim.phase = 'SETTLED'
    if (frozen.accepted === true) stats.accepted += 1
    if (frozen.cancelled === true) stats.cancelled += 1
    if (frozen.unknown === true) stats.unknown += 1
    if (typeof claim.resolveTerminal === 'function') {
      claim.resolveTerminal(frozen)
      claim.resolveTerminal = null
    }
    return frozen
  }

  function unknownOutcome(detail, claim) {
    return {
      ok: false, unknown: true, code: INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND, detail,
      accepted: claim?.accepted != null,
      receiptId: claim?.accepted?.receiptId ?? null,
      recoveryRequired: true,
    }
  }

  function settleFromWorker(claim, result) {
    // A late or concurrent observation can never reopen, rewrite or re-flag a settled delivery.
    if (claim.phase === 'SETTLED') return claim.result
    const classified = classifyWorkerResult(result)
    if (classified.kind === 'SENT_LOCAL') {
      return settle(claim, {
        ok: true, accepted: true, sentLocal: true, backendState: 'SENT_LOCAL',
        receiptId: claim.accepted?.receiptId ?? mintReceipt(),
      })
    }
    if (classified.kind === 'CANCELLED') {
      claim.cancelConfirmed = true
      claim.cancelStage = classified.cancelStage
      return settle(claim, {
        ok: true, accepted: false, cancelled: true, cancelStage: classified.cancelStage, backendState: 'CANCELLED',
        receiptId: claim.accepted?.receiptId ?? null,
      })
    }
    if (classified.kind === 'PRE_SUBMIT') {
      stats.rejected += 1
      return settle(claim, { ok: false, preSubmit: true, code: INTERNAL_SENDER_ERRORS.FIXTURE_REJECTED, detail: classified.detail })
    }
    stats.rejected += 1
    return settle(claim, unknownOutcome(classified.detail, claim))
  }

  /** Resolve the submit promise exactly once; the caller must always receive a verdict. */
  function resolveSubmit(claim, result) {
    if (typeof claim.resolveSubmit === 'function') {
      claim.resolveSubmit(result)
      claim.resolveSubmit = null
    }
  }

  async function runClaim(claim) {
    if (claim.phase === 'SETTLED') return { result: claim.result, hold: false }
    claim.phase = 'RUNNING'
    // A cancel that arrives while the job is still queued is a pre-UI cancellation: no worker call.
    if (claim.cancelRequested) {
      claim.cancelStage = 'CANCELLED_BEFORE_UI'
      claim.cancelConfirmed = true
      return { result: settle(claim, { ok: true, accepted: false, cancelled: true, cancelStage: 'CANCELLED_BEFORE_UI', backendState: 'CANCELLED', receiptId: null }), hold: false }
    }
    const built = buildSendRequest({
      deliveryId: claim.deliveryId, artifact: claim.snapshot.artifact, target: claim.snapshot.target,
      runRoot: resolvedRunRoot, now: now(), silence,
    })
    if (!built.ok) return { result: settle(claim, { ok: false, preSubmit: true, code: built.code, detail: built.detail }), hold: false }
    const plan = buildInternalInvocation('SEND', {
      Request: built.value.files.request, JsonOut: built.value.files.result, ProgressFile: built.value.files.progress,
      CancelFile: built.value.files.cancel, GlobalCancelFile: built.value.files.globalCancel,
    })
    if (!plan.ok) return { result: settle(claim, { ok: false, preSubmit: true, code: plan.code, detail: plan.detail }), hold: false }
    claim.invocation = deepFreeze({ ...plan.value, deliveryId: claim.deliveryId, request: built.value.request, files: built.value.files })
    stats.invocations += 1
    let result
    try {
      result = await transport.invoke(claim.invocation)
    } catch {
      stats.rejected += 1
      return { result: settle(claim, unknownOutcome('worker transport threw before returning a result', claim)), hold: false }
    }
    // 145-ASYNC-TERMINAL: an observation may have settled the claim while the invoke was awaiting;
    // a late dispatch acknowledgement must not reopen it into ACCEPTED.
    if (claim.phase === 'SETTLED') return { result: claim.result, hold: false }
    if (result && result.ok === true && result.dispatched === true) {
      // The worker process started but has no terminal result yet: accepted, verdict pending, and
      // the single execution slot stays owned until that terminal observation arrives.
      const receiptId = mintReceipt()
      claim.accepted = { receiptId, backendState: 'QUEUED', sentLocal: false, at: now() }
      claim.phase = 'SUBMITTED'
      claim.submitResult = deepFreeze({ ok: true, accepted: true, backendState: 'QUEUED', receiptId, pending: true })
      return { result: claim.submitResult, hold: true }
    }
    return { result: settleFromWorker(claim, result), hold: false }
  }

  /**
   * Read the worker's later observation without inventing a result. Observation is bound to the one
   * actual invocation of this claim: a delivery that was never invoked can never consume a worker
   * result, and a verdict that arrived while awaiting is final.
   */
  async function observe(claim) {
    if (!claim || claim.phase === 'SETTLED') return
    if (!claim.invocation) return
    if (claim.phase !== 'SUBMITTED' && claim.phase !== 'RUNNING') return
    if (typeof transport.query !== 'function') return
    let observed
    try {
      observed = await transport.query({ deliveryId: claim.deliveryId })
    } catch {
      return
    }
    if (claim.phase === 'SETTLED') return
    if (!observed || observed.ok !== true || !isObject(observed.value)) return
    // A non-result object (or one without a status) is not a terminal worker verdict.
    if (typeof observed.value.status !== 'string') return
    // A late terminal worker result can settle an accepted delivery; it can never re-open it.
    settleFromWorker(claim, observed.value)
  }

  function project(claim) {
    const settled = claim.phase === 'SETTLED' ? claim.result : null
    const accepted = claim.accepted?.receiptId != null || settled?.accepted === true
    const state = settled
      ? (settled.unknown === true ? 'UNKNOWN' : settled.cancelled === true ? 'CANCELLED' : settled.sentLocal === true ? 'SENT_LOCAL' : settled.accepted === true ? 'ACCEPTED' : 'FAILED')
      : claim.cancelRequested ? 'CANCEL_REQUESTED' : claim.phase === 'SUBMITTED' ? 'ACCEPTED' : 'QUEUED'
    return Object.freeze({
      deliveryId: claim.deliveryId,
      state,
      accepted,
      sentLocal: settled?.sentLocal === true,
      receiptId: claim.accepted?.receiptId ?? settled?.receiptId ?? null,
      backendState: settled?.backendState ?? (claim.cancelRequested ? 'CANCEL_REQUESTED' : claim.phase === 'SUBMITTED' ? 'QUEUED' : null),
      cancel: Object.freeze({
        requested: claim.cancelRequested === true,
        confirmed: claim.cancelConfirmed === true,
        stage: claim.cancelStage ?? null,
      }),
      recoveryRequired: settled?.recoveryRequired === true,
      resendAllowed: false,
      realReady: false,
      fixtureOnly: true,
    })
  }

  const backend = {
    id: INTERNAL_SENDER_ID,
    mode: INTERNAL_SENDER_MODE,
    realReady: false,
    fixtureOnly: true,
    realOperationAllowed: false,
    abiVersion: INTERNAL_WORKER_ABI_VERSION,
    capabilities() { return { ...capabilities } },
    health() { return { ok: true, state: 'FIXTURE_HEALTHY', mode: INTERNAL_SENDER_MODE, realReady: false, abiVersion: INTERNAL_WORKER_ABI_VERSION } },
    abi() { return verifyWorkerAbi() },
    resolveTarget({ targetId } = {}) {
      stats.targetChecks += 1
      const target = targetMap.get(targetId)
      if (!target) return { ok: false, code: INTERNAL_SENDER_ERRORS.TARGET_REJECTED, detail: 'unknown internal target' }
      if (!workerGatesOpen(target)) return { ok: false, code: INTERNAL_SENDER_ERRORS.TARGET_REJECTED, detail: 'internal target gate is closed' }
      return { ok: true, value: { targetId: target.targetId, kind: target.kind, authorized: true, allowlisted: true, identityVerified: true, bridgeAllowed: true, workerAllowed: true } }
    },
    async submit({ delivery, artifact, target } = {}) {
      stats.submitted += 1
      const checkedDelivery = validateDelivery(delivery)
      if (!checkedDelivery) return reject('delivery shape', INTERNAL_SENDER_ERRORS.INPUT_INVALID)
      stats.targetChecks += 1
      const registered = targetMap.get(checkedDelivery.targetId)
      if (!registered) return reject('target is not registered in the internal directory')
      if (registered.kind !== checkedDelivery.targetKind) return reject('target kind drifted from the internal directory')
      if (!workerGatesOpen(registered)) return reject('identity/authorization/allowlist/bridge/worker gate is closed')
      if (!isObject(target) || target.targetId !== registered.targetId || target.kind !== registered.kind) {
        return reject('caller target disagrees with the internal directory')
      }
      const checkedArtifact = validateArtifact(artifact)
      if (!checkedArtifact) return reject('artifact is not the trusted Artifact fact', INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
      // The delivery record and the artifact fact must describe the same artifact (no A record/B bytes).
      if (Object.prototype.hasOwnProperty.call(checkedDelivery, 'artifactRef') && checkedDelivery.artifactRef !== checkedArtifact.artifactRef) {
        return reject('delivery artifact reference disagrees with the trusted fact', INTERNAL_SENDER_ERRORS.DELIVERY_CONFLICT)
      }
      if (Object.prototype.hasOwnProperty.call(checkedDelivery, 'artifactSha256') && checkedDelivery.artifactSha256 !== checkedArtifact.sha256) {
        return reject('delivery artifact hash disagrees with the trusted fact', INTERNAL_SENDER_ERRORS.DELIVERY_CONFLICT)
      }
      if (Object.prototype.hasOwnProperty.call(checkedDelivery, 'byteLength') && checkedDelivery.byteLength !== checkedArtifact.byteLength) {
        return reject('delivery byte length disagrees with the trusted fact', INTERNAL_SENDER_ERRORS.DELIVERY_CONFLICT)
      }
      if (Object.prototype.hasOwnProperty.call(checkedDelivery, 'durationMs') && checkedDelivery.durationMs !== checkedArtifact.durationMs) {
        return reject('delivery duration disagrees with the trusted fact', INTERNAL_SENDER_ERRORS.DELIVERY_CONFLICT)
      }
      if (!capabilities.formats.includes(checkedArtifact.format)) return reject('format unsupported', INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
      if (checkedArtifact.byteLength > capabilities.maxBytes || checkedArtifact.durationMs > capabilities.maxDurationMs) {
        return reject('artifact exceeds the internal capability', INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
      }
      // Immutable snapshot of every fact this delivery may consume, taken before anything is queued.
      const snapshot = deepFreeze({ artifact: checkedArtifact, target: registered })
      const factKey = deliveryFactKey({
        deliveryId: checkedDelivery.deliveryId, targetId: checkedDelivery.targetId, targetKind: checkedDelivery.targetKind,
        backendId: checkedDelivery.backendId, artifact: checkedArtifact,
      })
      // 144-ONCE: the claim is synchronous, so two submits of the same id can never both reach the queue.
      const existing = claims.get(checkedDelivery.deliveryId)
      if (existing) {
        if (existing.factKey !== factKey) {
          return reject('the delivery id is already bound to different facts', INTERNAL_SENDER_ERRORS.DELIVERY_CONFLICT)
        }
        if (existing.phase === 'SETTLED') {
          if (existing.result.unknown === true) return fail(INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND, 'deliveryId')
          return { ...existing.result, existing: true }
        }
        if (existing.submitResult) return { ...existing.submitResult, existing: true }
        return existing.promise
      }
      const claim = {
        deliveryId: checkedDelivery.deliveryId, factKey, snapshot,
        phase: 'QUEUED', cancelRequested: false, cancelRequestedAt: null, cancelConfirmed: false, cancelStage: null,
        invocation: null, accepted: null, submitResult: null, result: null,
        promise: null, resolveSubmit: null, terminal: null, resolveTerminal: null,
      }
      claim.promise = new Promise((resolve) => { claim.resolveSubmit = resolve })
      claim.terminal = new Promise((resolve) => { claim.resolveTerminal = resolve })
      claims.set(checkedDelivery.deliveryId, claim)
      // 145-PENDING-SERIAL: the one execution slot is owned until the claim is terminal, so a
      // dispatch-only Worker keeps holding it; no second delivery is invoked meanwhile.
      serialized(async () => {
        const out = await runClaim(claim)
        resolveSubmit(claim, out.result)
        if (out.hold) await claim.terminal
      }).catch(() => {
        const failed = claim.phase === 'SETTLED'
          ? claim.result
          : settle(claim, { ok: false, preSubmit: true, code: INTERNAL_SENDER_ERRORS.INPUT_INVALID, detail: 'internal queue failure' })
        resolveSubmit(claim, failed)
      })
      return claim.promise
    },
    async status({ deliveryId } = {}) {
      if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'deliveryId')
      const claim = claims.get(deliveryId)
      if (!claim) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'unknown delivery')
      await observe(claim)
      return { ok: true, value: project(claim) }
    },
    async cancel({ deliveryId } = {}) {
      if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'deliveryId')
      const claim = claims.get(deliveryId)
      if (!claim) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'unknown delivery')
      if (claim.phase === 'SETTLED') {
        return { ok: false, code: INTERNAL_SENDER_ERRORS.CANCEL_TOO_LATE, detail: claim.result.cancelled === true ? 'already cancelled' : 'delivery is terminal' }
      }
      if (claim.cancelRequested) return { ok: true, requested: true, confirmed: false, existing: true, state: 'CANCEL_REQUESTED' }
      claim.cancelRequested = true
      claim.cancelRequestedAt = now()
      if (claim.phase === 'QUEUED') {
        // No worker was started: the job is cancelled before any UI, exactly like the reviewed queue.
        claim.cancelConfirmed = true
        claim.cancelStage = 'CANCELLED_BEFORE_UI'
        settle(claim, { ok: true, accepted: false, cancelled: true, cancelStage: 'CANCELLED_BEFORE_UI', backendState: 'CANCELLED', receiptId: null })
        return { ok: true, requested: true, confirmed: true, cancelStage: 'CANCELLED_BEFORE_UI', state: 'CANCELLED' }
      }
      // A worker is running: write the real per-job cancel signal. Only its own result can confirm.
      let written
      try {
        written = await transport.writeCancel({
          deliveryId, cancelFile: claim.invocation?.files?.cancel ?? null,
          payload: { reason: 'USER_CANCELLED', at: claim.cancelRequestedAt, source: 'internal-sender' },
        })
      } catch {
        return { ok: false, requested: true, confirmed: false, state: 'CANCEL_REQUESTED', code: INTERNAL_SENDER_ERRORS.FIXTURE_REJECTED, detail: 'cancel signal could not be delivered' }
      }
      if (!written || written.ok !== true) {
        return { ok: false, requested: true, confirmed: false, state: 'CANCEL_REQUESTED', code: INTERNAL_SENDER_ERRORS.FIXTURE_REJECTED, detail: 'cancel signal was rejected' }
      }
      // The verdict may have arrived while the signal was being written: report the settled truth,
      // never a stale "requested" state and never a later flag rewrite.
      if (claim.phase === 'SETTLED') {
        return {
          ok: true, requested: true, confirmed: claim.result.cancelled === true,
          cancelStage: claim.result.cancelStage ?? null, state: project(claim).state,
        }
      }
      return { ok: true, requested: true, confirmed: false, state: 'CANCEL_REQUESTED' }
    },
    /** Static recovery descriptor: the reviewed recover tool is never executed here. */
    recover({ action = 'status' } = {}) {
      if (action !== 'status' && action !== 'restore') return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'action')
      const plan = buildInternalInvocation('RECOVER', action === 'status'
        ? { Status: true, JsonOut: path.join(resolvedRunRoot, 'recover.result.json') }
        : { JsonOut: path.join(resolvedRunRoot, 'recover.result.json') })
      if (!plan.ok) return { ok: false, code: plan.code, detail: plan.detail, executed: false }
      return { ok: true, value: { ...plan.value, action, executed: false, realReady: false, reason: 'FIXTURE_ONLY_NO_PROCESS' } }
    },
    stats() { return { ...stats, settled: claims.size } },
    /** Fixed ABI evidence for tests/diagnostics; never executed here. */
    describeScript(scriptId) {
      const abi = INTERNAL_WORKER_ABI.scripts[scriptId]
      const script = resolveInternalScript(scriptId)
      return script ? Object.freeze({ scriptId, relativeScript: INTERNAL_SENDER_SCRIPTS[scriptId], parameters: abi.parameters, exists: true }) : null
    },
  }
  return Object.freeze(backend)
}
