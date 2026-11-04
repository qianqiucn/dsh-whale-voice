/* Whale Voice Core — formal Qwen generation runtime assembly (Plan 10-R1, OFFLINE / ISOLATED).
 *
 * One trusted caller supplies the explicit runtime parameters (a trusted sandbox, the worker
 * command/root and the application scope); this module assembles the existing supervisor, the audited
 * Qwen provider, the provider's real handshake/discovery result and the same preset-generation Core
 * app object, then hands that app to the existing Host call surface. It never reads production
 * settings, downloads a model, opens a Host route, or claims real-model readiness.
 *
 * The returned handle owns exactly the supervisor/provider it created; `close()` stops that worker
 * through the existing normal shutdown path and never touches an unrelated process.
 */

import { createQwenSupervisor } from './tts/qwen-supervisor.mjs'
import { createQwenProvider } from './tts/qwen-adapter.mjs'
import { openPresetGenerationApp } from './preset-generation-app.mjs'

export const QWEN_GENERATION_RUNTIME_SCHEMA_VERSION = 1

export const QWEN_GENERATION_RUNTIME_ERRORS = Object.freeze({
  INPUT_INVALID: 'QWEN_GENERATION_RUNTIME_INPUT_INVALID',
  WORKER_NOT_STARTED: 'QWEN_GENERATION_RUNTIME_WORKER_NOT_STARTED',
  APP_REJECTED: 'QWEN_GENERATION_RUNTIME_APP_REJECTED',
  CLOSE_UNCONFIRMED: 'QWEN_GENERATION_RUNTIME_CLOSE_UNCONFIRMED',
})

const INSTANCE_PATTERN = /^[A-Za-z0-9:._-]{1,64}$/
const TEXT_LIMIT_MAX = 200

function failure(code, detail = null) {
  return detail === null ? { ok: false, code } : { ok: false, code, detail }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Assemble the formal Qwen generation runtime from explicit caller-supplied parameters.
 *
 * @param {object} options
 * @param {object} options.sandbox trusted sandbox for the Core app stores
 * @param {string} options.scopeId application scope
 * @param {string} options.rightsProofRef `fixture-rights:...` proof for the Core app
 * @param {string} options.allowedRoot worker root the supervisor may resolve the command inside
 * @param {{command:string,runtime:string,args?:string[]}} options.worker explicit worker command
 * @param {string} [options.instanceId] provider instance label recorded in the task (default `instance-1`)
 * @param {number} [options.requestTimeoutMs] provider request timeout
 * @param {number} [options.handshakeTimeoutMs] supervisor handshake timeout
 * @param {number} [options.shutdownGraceMs] supervisor shutdown grace
 * @param {number} [options.killWaitMs] supervisor kill wait
 * @param {Function} [options.now] ISO clock for the Core app
 * @returns {Promise<{ok:true,value:{app:object,provider:object,discovery:object,close:Function}}|{ok:false,code:string,detail?:string}>}
 */
export async function openQwenGenerationRuntime(options = {}) {
  if (!isPlainObject(options)) return failure(QWEN_GENERATION_RUNTIME_ERRORS.INPUT_INVALID, 'options')
  const instanceId = options.instanceId === undefined ? 'instance-1' : options.instanceId
  if (typeof instanceId !== 'string' || !INSTANCE_PATTERN.test(instanceId)) {
    return failure(QWEN_GENERATION_RUNTIME_ERRORS.INPUT_INVALID, 'instanceId')
  }

  const supervisor = createQwenSupervisor({
    allowedRoot: options.allowedRoot,
    worker: options.worker,
    handshakeTimeoutMs: options.handshakeTimeoutMs,
    shutdownGraceMs: options.shutdownGraceMs,
    killWaitMs: options.killWaitMs,
  })
  const provider = createQwenProvider({
    supervisor,
    requestTimeoutMs: options.requestTimeoutMs,
  })
  if (!provider || provider.ok !== true) {
    return failure(QWEN_GENERATION_RUNTIME_ERRORS.INPUT_INVALID, provider && provider.code ? provider.code : 'provider')
  }

  const started = await provider.start()
  if (!started || started.ok !== true) {
    await provider.shutdown().catch(() => null)
    return failure(
      QWEN_GENERATION_RUNTIME_ERRORS.WORKER_NOT_STARTED,
      started && (started.qwenCode || started.code) ? started.qwenCode || started.code : 'worker',
    )
  }

  const discovery = started.discovery
  const providerFacts = {
    providerId: started.manifest.id,
    instanceId,
    model: discovery.model,
    backend: discovery.backend,
  }
  const voices = discovery.voices.map((voice) => ({
    id: voice.id,
    label: voice.name || voice.id,
    languages: [...voice.languages],
  }))
  const textLimit = Math.min(TEXT_LIMIT_MAX, discovery.limits.maxChars)

  const opened = await openPresetGenerationApp({
    sandbox: options.sandbox,
    provider,
    scopeId: options.scopeId,
    rightsProofRef: options.rightsProofRef,
    voices,
    textLimit,
    providerFacts,
    now: options.now,
  })
  if (!opened || opened.ok !== true) {
    await provider.shutdown().catch(() => null)
    return failure(
      QWEN_GENERATION_RUNTIME_ERRORS.APP_REJECTED,
      opened && opened.detail ? opened.detail : opened && opened.code ? opened.code : 'app',
    )
  }

  let closed = false
  async function close() {
    if (closed) return { ok: true }
    closed = true
    const stopped = await provider.shutdown()
    if (stopped && stopped.ok === true) return { ok: true }
    return failure(QWEN_GENERATION_RUNTIME_ERRORS.CLOSE_UNCONFIRMED, stopped && stopped.code ? stopped.code : 'shutdown')
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: QWEN_GENERATION_RUNTIME_SCHEMA_VERSION,
      app: opened.value,
      provider: Object.freeze({ ...providerFacts }),
      discovery: Object.freeze({
        backend: discovery.backend,
        model: discovery.model,
        voices: Object.freeze(voices.map((voice) => Object.freeze({ ...voice, languages: Object.freeze([...voice.languages]) }))),
        languages: Object.freeze([...discovery.languages]),
        limits: Object.freeze({ ...discovery.limits }),
      }),
      close,
    }),
  }
}
