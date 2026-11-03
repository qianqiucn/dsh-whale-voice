/* Whale Voice — Plan 13-B internal Sender, OFFLINE / FIXTURE_ONLY (no real process, device, WeChat or network).
 *
 * This module is the Whale Relay Core's own Windows delivery module: it consumes only a trusted SAVED
 * Artifact fact + a trusted target and exposes the same backend interface the relay already owns
 * (`id/health/capabilities/resolveTarget/submit/status/cancel`). It reuses the original user-owned
 * Voice Sender algorithms/scripts from the reviewed static closure (see `sender-internal/source/` and
 * `source-manifest.json`) as *resources*, but it never imports the original HTTP server, never spawns
 * PowerShell, never opens a socket, device or WeChat window and never writes.
 *
 * Layer model (kept from the original Sender where it maps to this offline unit):
 *   relay target/allowlist/identity gate  ->  internal module's own target directory + two gates
 *   fixed script + fixed argv             ->  `buildInternalInvocation()` whitelist (no arbitrary command)
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

export const INTERNAL_SENDER_ERRORS = Object.freeze({
  INPUT_INVALID: 'INTERNAL_SENDER_INPUT_INVALID',
  TARGET_REJECTED: 'INTERNAL_SENDER_TARGET_REJECTED',
  UNSUPPORTED_CAPABILITY: 'INTERNAL_SENDER_UNSUPPORTED_CAPABILITY',
  FIXTURE_REJECTED: 'INTERNAL_SENDER_FIXTURE_REJECTED',
  UNKNOWN_NO_RESEND: 'INTERNAL_SENDER_UNKNOWN_NO_RESEND',
  SCRIPT_NOT_ALLOWED: 'INTERNAL_SENDER_SCRIPT_NOT_ALLOWED',
})

/** Scripts copied from the reviewed static source closure. Only these ids exist. */
export const INTERNAL_SENDER_SCRIPTS = Object.freeze({
  SEND: 'voice-sender.ps1',
  RECOVER: 'voice-sender-recover.ps1',
  CANCEL: 'cancel-test.ps1',
  PREFLIGHT: 'preflight-wechat.ps1',
  WECHAT_STATUS: 'wechat-status.ps1',
  HOTKEY: 'hotkey-host.ps1',
  DESKTOP_GUARD: 'desktop-guard.ps1',
})

/** Fixed parameter order per script; nothing else may be passed to a script. */
const SCRIPT_PARAMS = Object.freeze({
  SEND: Object.freeze(['deliveryId', 'artifactRef', 'artifactSha256', 'byteLength', 'durationMs', 'targetId', 'targetKind']),
  RECOVER: Object.freeze(['deliveryId']),
  CANCEL: Object.freeze(['deliveryId']),
  PREFLIGHT: Object.freeze(['targetId']),
  WECHAT_STATUS: Object.freeze([]),
  HOTKEY: Object.freeze([]),
  DESKTOP_GUARD: Object.freeze([]),
})

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_ROOT = path.join(HERE, 'sender-internal', 'source')
const MANIFEST_FILE = path.join(HERE, 'sender-internal', 'source-manifest.json')

const ARTIFACT_KEYS = Object.freeze(['artifactRef', 'sha256', 'byteLength', 'durationMs', 'format'])
const SHA256 = /^[0-9a-f]{64}$/
const ARTIFACT_REF = /^artifact:fixture-bytes-[0-9a-f]{32}$/
const DELIVERY_ID = /^delivery:[0-9a-f]{32}$/
const TARGET_ID = /^[A-Za-z0-9:_-]{1,64}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, detail = null) {
  return detail ? { ok: false, code, detail } : { ok: false, code }
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

/**
 * Build one fixed invocation. The script id and the parameter set are closed; the caller cannot pass an
 * arbitrary path, command, URL or shell fragment. Values are single-line scalars with a bounded length.
 */
export function buildInternalInvocation(scriptId, params = {}) {
  const allowed = SCRIPT_PARAMS[scriptId]
  if (!allowed) return fail(INTERNAL_SENDER_ERRORS.SCRIPT_NOT_ALLOWED, 'scriptId')
  const script = resolveInternalScript(scriptId)
  if (!script) return fail(INTERNAL_SENDER_ERRORS.SCRIPT_NOT_ALLOWED, 'script')
  if (!isObject(params)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, 'params')
  for (const key of Object.keys(params)) {
    if (!allowed.includes(key)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
  }
  const argv = []
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue
    const value = params[key]
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
    }
    const text = String(value)
    if (text.length < 1 || text.length > 200 || /[\r\n\0]/.test(text)) return fail(INTERNAL_SENDER_ERRORS.INPUT_INVALID, key)
    argv.push('-' + key, text)
  }
  return {
    ok: true,
    value: Object.freeze({
      scriptId,
      script,
      relativeScript: INTERNAL_SENDER_SCRIPTS[scriptId],
      argv: Object.freeze(argv),
      shell: false,
      interactive: false,
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
 * Test-only transport. The module never creates a process, socket, device or WeChat call; a caller must
 * inject this transport, which records the exact fixed invocation and returns a scripted result.
 */
export function createFixtureTransport(options = {}) {
  const invocations = []
  const scripted = Array.isArray(options.results) ? [...options.results] : []
  const defaultResult = options.defaultResult || { ok: true, accepted: true, backendState: 'QUEUED', receiptId: 'fixture-internal-receipt' }
  return Object.freeze({
    invocations,
    enqueue(result) { scripted.push(result) },
    async invoke(invocation) {
      invocations.push(invocation)
      const next = scripted.length ? scripted.shift() : defaultResult
      return next
    },
  })
}

/**
 * One internal Sender backend: Artifact-only, one serial queue, one invocation per delivery,
 * NEVER_WRITE and no retry/re-bind. It exposes exactly the interface the relay already consumes.
 */
export function createInternalSenderOffline({ targets = [], transport } = {}) {
  if (!Array.isArray(targets) || !transport || typeof transport.invoke !== 'function') {
    throw new TypeError('internal sender needs a target list and an injected Fixture transport')
  }
  const targetMap = new Map()
  for (const target of targets) {
    if (!isObject(target)) throw new TypeError('invalid target')
    targetMap.set(target.targetId, {
      targetId: target.targetId,
      kind: target.kind,
      authorized: target.authorized === true,
      allowlisted: target.allowlisted === true,
      identityVerified: target.identityVerified === true,
      bridgeAllowed: target.bridgeAllowed === true,
      workerAllowed: target.workerAllowed === true,
    })
  }
  const stats = { submitted: 0, accepted: 0, cancelled: 0, rejected: 0, targetChecks: 0, invocations: 0 }
  const settled = new Map()
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

  async function submit({ delivery, artifact, target } = {}) {
    stats.submitted += 1
    const checkedDelivery = validateDelivery(delivery)
    if (!checkedDelivery) return reject('delivery shape', INTERNAL_SENDER_ERRORS.INPUT_INVALID)
    stats.targetChecks += 1
    const registered = targetMap.get(checkedDelivery.targetId)
    if (!registered) return reject('target is not registered in the internal directory')
    if (registered.kind !== checkedDelivery.targetKind) return reject('target kind drifted from the internal directory')
    if (registered.identityVerified !== true) return reject('target identity is not verified in the internal directory')
    if (registered.authorized !== true || registered.allowlisted !== true) return reject('target is not authorized/allowlisted in the internal directory')
    if (registered.bridgeAllowed !== true || registered.workerAllowed !== true) return reject('bridge/worker gate is closed in the internal directory')
    if (!target || target.targetId !== registered.targetId || target.kind !== registered.kind) return reject('caller target disagrees with the internal directory')
    const checkedArtifact = validateArtifact(artifact)
    if (!checkedArtifact) return reject('artifact is not the trusted Artifact fact', INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
    if (!capabilities.formats.includes(checkedArtifact.format)) return reject('format unsupported', INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
    if (checkedArtifact.byteLength > capabilities.maxBytes || checkedArtifact.durationMs > capabilities.maxDurationMs) {
      return reject('artifact exceeds the internal capability', INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
    }
    const existing = settled.get(checkedDelivery.deliveryId)
    if (existing) return existing.unknown ? fail(INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND, 'deliveryId') : { ...existing, existing: true }

    return serialized(async () => {
      const plan = buildInternalInvocation('SEND', {
        deliveryId: checkedDelivery.deliveryId,
        artifactRef: checkedArtifact.artifactRef,
        artifactSha256: checkedArtifact.sha256,
        byteLength: checkedArtifact.byteLength,
        durationMs: checkedArtifact.durationMs,
        targetId: registered.targetId,
        targetKind: registered.kind,
      })
      if (!plan.ok) {
        stats.rejected += 1
        return { ok: false, preSubmit: true, code: plan.code, detail: plan.detail }
      }
      stats.invocations += 1
      let result
      try {
        result = await transport.invoke(plan.value)
      } catch {
        const unknown = { ok: false, unknown: true, code: INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND, detail: 'transport threw' }
        settled.set(checkedDelivery.deliveryId, unknown)
        return unknown
      }
      if (result && result.ok === true && result.accepted === true) {
        const accepted = { ok: true, accepted: true, backendState: result.backendState || 'QUEUED', receiptId: result.receiptId || ('fixture-internal-' + crypto.randomBytes(8).toString('hex')) }
        settled.set(checkedDelivery.deliveryId, accepted)
        stats.accepted += 1
        return accepted
      }
      if (result && result.ok === true && result.cancelled === true) {
        const cancelled = { ok: true, accepted: false, cancelled: true, backendState: 'CANCELLED', receiptId: null }
        settled.set(checkedDelivery.deliveryId, cancelled)
        stats.cancelled += 1
        return cancelled
      }
      if (result && result.unknown === true) {
        const unknown = { ok: false, unknown: true, code: INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND, detail: 'transport result unknown' }
        settled.set(checkedDelivery.deliveryId, unknown)
        return unknown
      }
      stats.rejected += 1
      return { ok: false, preSubmit: true, code: INTERNAL_SENDER_ERRORS.FIXTURE_REJECTED, detail: (result && result.detail) || 'fixture rejected' }
    })
  }

  const backend = {
    id: INTERNAL_SENDER_ID,
    mode: INTERNAL_SENDER_MODE,
    realReady: false,
    fixtureOnly: true,
    realOperationAllowed: false,
    capabilities() { return { ...capabilities } },
    health() { return { ok: true, state: 'FIXTURE_HEALTHY', mode: INTERNAL_SENDER_MODE, realReady: false } },
    resolveTarget({ targetId } = {}) {
      stats.targetChecks += 1
      const target = targetMap.get(targetId)
      if (!target) return { ok: false, code: INTERNAL_SENDER_ERRORS.TARGET_REJECTED, detail: 'unknown internal target' }
      if (!target.authorized || !target.allowlisted || !target.identityVerified) {
        return { ok: false, code: INTERNAL_SENDER_ERRORS.TARGET_REJECTED, detail: 'target not authorized' }
      }
      if (!target.bridgeAllowed || !target.workerAllowed) {
        return { ok: false, code: INTERNAL_SENDER_ERRORS.TARGET_REJECTED, detail: 'bridge/worker gate closed' }
      }
      return { ok: true, value: { ...target } }
    },
    submit,
    async status({ deliveryId } = {}) {
      const settledResult = settled.get(deliveryId)
      if (settledResult) {
        return { ok: true, value: Object.freeze({ deliveryId, state: settledResult.unknown ? 'UNKNOWN' : (settledResult.cancelled ? 'CANCELLED' : 'ACCEPTED'), receiptId: settledResult.receiptId || null, realReady: false }) }
      }
      if (typeof transport.status === 'function') return transport.status({ deliveryId })
      return { ok: false, code: INTERNAL_SENDER_ERRORS.INPUT_INVALID, detail: 'unknown delivery' }
    },
    async cancel({ deliveryId } = {}) {
      const existing = settled.get(deliveryId)
      if (existing && existing.unknown) return { ok: false, code: INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND }
      return serialized(async () => {
        const plan = buildInternalInvocation('CANCEL', { deliveryId })
        if (!plan.ok) return { ok: false, code: plan.code, detail: plan.detail }
        stats.invocations += 1
        const result = await transport.invoke(plan.value)
        if (result && result.ok === true && result.cancelled === true) {
          const cancelled = { ok: true, accepted: false, cancelled: true, receiptId: null }
          settled.set(deliveryId, cancelled)
          stats.cancelled += 1
          return { ok: true, confirmed: true, state: 'CANCELLED' }
        }
        if (result && result.unknown === true) {
          settled.set(deliveryId, { ok: false, unknown: true, code: INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND })
          return { ok: false, unknown: true, code: INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND }
        }
        return { ok: false, code: INTERNAL_SENDER_ERRORS.FIXTURE_REJECTED, detail: (result && result.detail) || 'cancel rejected' }
      })
    },
    stats() { return { ...stats, settled: settled.size } },
    /** Fixed-invocation evidence for tests/diagnostics; never executed here. */
    describeScript(scriptId) {
      const script = resolveInternalScript(scriptId)
      return script ? Object.freeze({ scriptId, relativeScript: INTERNAL_SENDER_SCRIPTS[scriptId], exists: true }) : null
    },
  }
  return Object.freeze(backend)
}
