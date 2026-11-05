import { randomBytes } from 'node:crypto'
import { createDetector, components } from './core/detect.mjs'
import { buildCapabilitySnapshot, buildCapabilityStatus } from './core/capabilities.mjs'
import { createConfigSandbox, openConfigStorage, removeConfigSandbox } from './core/config-sandbox.mjs'
import { openQwenGenerationRuntime } from './core/qwen-generation-runtime.mjs'
import { openGenerationSettingsDraft } from './core/settings-draft.mjs'
import { isLoopbackAddress, loopbackHost, sameOrigin, tokenMatches } from './core/request-guards.mjs'

const PREFIX = '/whale-voice/setup'
const MAX_BODY_BYTES = 64 * 1024

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        if (typeof req.destroy === 'function') req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

export function bridgeScript(token) {
  return `(() => {
  const coreToken = ${JSON.stringify(token)};
  const prefix = '/whale-voice/setup';
  async function call(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(prefix + path, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'application/json', 'x-whale-core-token': coreToken },
      });
      if (!response.ok) throw new Error('core_http_' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  const allowed = new Set(['wechatagent', 'sender', 'qwen']);
  async function generation(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const init = {
      method: options && options.method ? options.method : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json', 'x-whale-core-token': coreToken },
    };
    if (options && typeof options.body === 'string') {
      init.body = options.body;
      init.headers['content-type'] = 'application/json';
    }
    try {
      const response = await fetch(prefix + path, init);
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (payload && typeof payload === 'object') return payload;
      return { ok: false, error: 'core_http_' + response.status };
    } finally {
      clearTimeout(timer);
    }
  }
  window.__WHALE_SETUP__ = Object.freeze({
    version: '1',
    getStatus: () => call('/status'),
    getConfig: () => call('/config'),
    getConfigSources: () => call('/config/sources'),
    getConfigStatus: () => call('/config/status'),
    getCapabilities: () => call('/capabilities'),
    getCapabilityStatus: () => call('/capabilities/status'),
    getGenerationCatalog: () => generation('/generation/catalog'),
    generatePreset: (request) => generation('/generation', { method: 'POST', body: JSON.stringify(request || {}) }),
    getGenerationStatus: (taskId) => generation('/generation/status?taskId=' + encodeURIComponent(String(taskId || ''))),
    getGenerationResults: () => generation('/generation/results'),
    downloadGenerationResult: async (taskId) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(prefix + '/generation/download?taskId=' + encodeURIComponent(String(taskId || '')), {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'manual',
          signal: controller.signal,
          headers: { accept: 'audio/wav', 'x-whale-core-token': coreToken },
        });
        if (!response.ok) {
          let payload = null;
          try { payload = await response.json(); } catch { payload = null; }
          return payload && typeof payload === 'object' ? payload : { ok: false, error: 'core_http_' + response.status };
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const match = /filename="([^"]+)"/.exec(disposition);
        return { ok: true, blob, fileName: match ? match[1] : 'whale-voice-result.wav' };
      } catch {
        return { ok: false, error: 'core_unreachable' };
      } finally {
        clearTimeout(timer);
      }
    },
    getGenerationStorageDraft: () => generation('/settings/generation-storage'),
    saveGenerationStorageDraft: (request) => generation('/settings/generation-storage', { method: 'PUT', body: JSON.stringify(request || {}) }),
    applyGenerationStorageDraft: () => generation('/settings/generation-storage/apply', { method: 'POST', body: '{}' }),
    getQwenRuntimeDraft: () => generation('/settings/qwen-runtime'),
    saveQwenRuntimeDraft: (request) => generation('/settings/qwen-runtime', { method: 'PUT', body: JSON.stringify(request || {}) }),
    applyQwenRuntimeDraft: () => generation('/settings/qwen-runtime/apply', { method: 'POST', body: '{}' }),
    detect: (component) => {
      const value = String(component || '');
      if (!allowed.has(value)) return Promise.reject(new Error('unsupported_component'));
      return call('/detect?component=' + encodeURIComponent(value));
    },
  });
})();`
}

function makeGuard(scope, methods = ['GET']) {
  function currentConnection() {
    try { return typeof scope.get === 'function' ? scope.get('connection') : null } catch { return null }
  }
  return function guard(req) {
    if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) return 403
    if (!loopbackHost(req)) return 403
    if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return 403
    if (!sameOrigin(req)) return 403
    if (!methods.includes(String(req.method || '').toUpperCase())) return 405
    const connection = currentConnection()
    if (!connection || typeof connection.requestRejection !== 'function') return 503
    try {
      const code = connection.requestRejection(req)
      if (code !== undefined && code !== null && code !== false) return typeof code === 'number' ? code : 403
    } catch {
      return 403
    }
    return null
  }
}

export function installHostBridge(scope, options = {}) {
  const token = options.token || randomBytes(32).toString('hex')
  const detector = options.detector || createDetector({ env: options.env || process.env, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs })
  const generation = options.generation || null
  const settingsDraft = options.settingsDraft || null
  const guard = makeGuard(scope)
  const disposers = []

  function route(pathname, handler, methods = ['GET']) {
    const guard = makeGuard(scope, methods)
    const dispose = scope.webServer.register({
      kind: 'exact',
      path: pathname,
      handler: async (req, res) => {
        const rejected = guard(req)
        if (rejected) return send(res, rejected, { ok: false, error: rejected === 405 ? 'method_not_allowed' : 'forbidden' })
        if (!tokenMatches(req.headers['x-whale-core-token'], token)) return send(res, 401, { ok: false, error: 'unauthorized' })
        try {
          return await handler(req, res)
        } catch {
          return send(res, 500, { ok: false, error: 'internal_error' })
        }
      },
    })
    if (typeof dispose === 'function') disposers.push(dispose)
  }

  route(PREFIX + '/health', (req, res) => send(res, 200, { ok: true, service: 'whale-voice-core', mode: 'read-only', schemaVersion: 1 }))
  route(PREFIX + '/status', async (req, res) => send(res, 200, await detector.detectAll()))
  route(PREFIX + '/config', async (req, res) => send(res, 200, await detector.getConfigSnapshot()))
  route(PREFIX + '/config/sources', async (req, res) => send(res, 200, await detector.getConfigSources()))
  route(PREFIX + '/config/status', async (req, res) => send(res, 200, await detector.getConfigStatus()))
  route(PREFIX + '/capabilities', async (req, res) => {
    const detected = await detector.detectAll()
    return send(res, 200, buildCapabilitySnapshot({ detected }))
  })
  route(PREFIX + '/capabilities/status', async (req, res) => {
    const detected = await detector.detectAll()
    return send(res, 200, buildCapabilityStatus(buildCapabilitySnapshot({ detected })))
  })
  route(PREFIX + '/detect', async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const component = url.searchParams.get('component') || ''
    if (!components.includes(component)) return send(res, 400, { ok: false, error: 'unsupported_component' })
    return send(res, 200, await detector.detectComponent(component))
  })

  // 144/146: the Chinese settings page records the generation data storage location as an isolated
  // settings draft and can explicitly apply the saved draft. `options.settingsDraft` is a store over a
  // trusted storage context supplied by the Host; without it the routes explicitly report that the
  // draft store is unavailable. Saving or applying a draft never enables generation, starts a worker
  // or touches a running generation object; the applied fact is read when the plugin opens again.
  function settingsDraftEnvelope() {
    const draft = settingsDraft.read()
    if (draft.ok !== true) return { status: 500, body: draft }
    const applied = settingsDraft.readApplied()
    if (applied.ok !== true) return { status: 500, body: applied }
    return {
      status: 200,
      body: {
        ok: true,
        draft: draft.draft,
        savedAt: draft.savedAt,
        applied: applied.applied,
        appliedAt: applied.appliedAt,
      },
    }
  }

  route(PREFIX + '/settings/generation-storage', async (req, res) => {
    if (!settingsDraft) return send(res, 503, { ok: false, error: 'settings_draft_unavailable' })
    if (String(req.method || '').toUpperCase() === 'PUT') {
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        return send(res, 400, { ok: false, error: 'invalid_body' })
      }
      const result = settingsDraft.save({ generationStorageRoot: body && body.generationStorageRoot })
      if (result.ok !== true) return send(res, 400, result)
      const envelope = settingsDraftEnvelope()
      return send(res, envelope.status, envelope.body)
    }
    const envelope = settingsDraftEnvelope()
    return send(res, envelope.status, envelope.body)
  }, ['GET', 'PUT'])

  route(PREFIX + '/settings/generation-storage/apply', async (req, res) => {
    if (!settingsDraft) return send(res, 503, { ok: false, error: 'settings_draft_unavailable' })
    const result = settingsDraft.apply()
    if (result.ok !== true) return send(res, result.error === 'draft_missing' ? 400 : 500, result)
    const envelope = settingsDraftEnvelope()
    return send(res, envelope.status, envelope.body)
  }, ['POST'])

  // 148/149: the Chinese settings page records the Qwen model directory and Python runtime path as an
  // isolated draft and can explicitly apply the saved paths. Saving or applying them never reads a
  // model, executes Python, starts a Worker or generation, or changes a running generation object; the
  // applied fact is used when the plugin opens again.
  function runtimeDraftEnvelope() {
    const draft = settingsDraft.readRuntimeDraft()
    if (draft.ok !== true) return { status: 500, body: draft }
    const applied = settingsDraft.readAppliedRuntime()
    if (applied.ok !== true) return { status: 500, body: applied }
    return {
      status: 200,
      body: {
        ok: true,
        runtimeDraft: draft.runtimeDraft,
        savedAt: draft.savedAt,
        applied: applied.applied,
        appliedAt: applied.appliedAt,
      },
    }
  }

  route(PREFIX + '/settings/qwen-runtime', async (req, res) => {
    if (!settingsDraft) return send(res, 503, { ok: false, error: 'settings_draft_unavailable' })
    if (String(req.method || '').toUpperCase() === 'PUT') {
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        return send(res, 400, { ok: false, error: 'invalid_body' })
      }
      const result = settingsDraft.saveRuntimeDraft({
        modelDirectory: body && body.modelDirectory,
        pythonPath: body && body.pythonPath,
      })
      if (result.ok !== true) return send(res, 400, result)
      const envelope = runtimeDraftEnvelope()
      return send(res, envelope.status, envelope.body)
    }
    const envelope = runtimeDraftEnvelope()
    return send(res, envelope.status, envelope.body)
  }, ['GET', 'PUT'])

  route(PREFIX + '/settings/qwen-runtime/apply', async (req, res) => {
    if (!settingsDraft) return send(res, 503, { ok: false, error: 'settings_draft_unavailable' })
    const result = settingsDraft.applyRuntime()
    if (result.ok !== true) return send(res, result.error === 'runtime_draft_missing' ? 400 : 500, result)
    const envelope = runtimeDraftEnvelope()
    return send(res, envelope.status, envelope.body)
  }, ['POST'])

  // 136: formal Host call surface for the preset generation Core entry. `options.generation` is an
  // already-opened `openPresetGenerationApp` value supplied by the isolated Host assembly; without it
  // every generation route explicitly reports that it is not enabled and nothing is generated.
  route(PREFIX + '/generation/catalog', async (req, res) => {
    if (!generation) return send(res, 503, { ok: false, error: 'generation_not_enabled' })
    return send(res, 200, generation.catalog())
  })
  route(PREFIX + '/generation', async (req, res) => {
    if (!generation) return send(res, 503, { ok: false, error: 'generation_not_enabled' })
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(res, 400, { ok: false, error: 'invalid_body' })
    }
    const result = await generation.generate({ text: body.text, voiceId: body.voiceId, language: body.language })
    return send(res, 200, result)
  }, ['POST'])
  route(PREFIX + '/generation/status', async (req, res) => {
    if (!generation) return send(res, 503, { ok: false, error: 'generation_not_enabled' })
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const result = await generation.status(url.searchParams.get('taskId') || '')
    return send(res, 200, result)
  })
  // 151: the saved generation results of the current scope. Read-only: it lists the already-stored
  // owner facts and their saved artifacts, and creates/regenerates nothing.
  route(PREFIX + '/generation/results', async (req, res) => {
    if (!generation) return send(res, 503, { ok: false, error: 'generation_not_enabled' })
    const result = await generation.results()
    return send(res, 200, result)
  })
  // 150: download the already-saved WAV bytes of one original task. The route only reads the stored
  // artifact; it never creates a task, re-synthesises, mutates the saved result or plays/delivers it.
  route(PREFIX + '/generation/download', async (req, res) => {
    if (!generation) return send(res, 503, { ok: false, error: 'generation_not_enabled' })
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const result = await generation.download(url.searchParams.get('taskId') || '')
    if (!result || result.ok !== true) return send(res, 404, result)
    const bytes = Buffer.from(result.bytes)
    res.writeHead(200, {
      'content-type': 'audio/wav',
      'content-length': bytes.length,
      'content-disposition': 'attachment; filename="' + result.fileName + '"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(bytes)
  })

  const script = bridgeScript(token)
  const offInject = typeof scope.on === 'function' ? scope.on('webserver/index-inject', (table) => {
    try {
      if (!Array.isArray(table)) return
      if (table.some((row) => row && row.kind === 'script' && String(row.text || '').includes('__WHALE_SETUP__'))) return
      table.push({ kind: 'script', placement: 'body', text: script })
    } catch {}
  }) : null
  if (typeof offInject === 'function') disposers.push(offInject)

  let tap = null
  try {
    if (scope.webServer && typeof scope.webServer.tapIndex === 'function') {
      tap = scope.webServer.tapIndex((html) => String(html || '').includes('__WHALE_SETUP__')
        ? html
        : String(html || '').replace('</body>', `<script data-whale-voice-setup>${script}</script></body>`))
    }
  } catch {}
  if (typeof tap === 'function') disposers.push(tap)

  return {
    token,
    detector,
    scripts: script,
    dispose() {
      for (const dispose of disposers.splice(0)) {
        try { dispose() } catch {}
      }
    },
  }
}

/**
 * 142: the serializable runtime config surface. Only plain JSON values are read; no sandbox or app
 * object is accepted. `enabled` must be exactly true, otherwise generation stays explicitly off.
 */
function generationSettings(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null
  const generation = config.generation
  if (!generation || typeof generation !== 'object' || Array.isArray(generation)) return null
  if (generation.enabled !== true) return null
  return {
    scopeId: generation.scopeId,
    rightsProofRef: generation.rightsProofRef,
    allowedRoot: generation.allowedRoot,
    storageRoot: generation.storageRoot,
    worker: generation.worker,
    instanceId: generation.instanceId,
    requestTimeoutMs: generation.requestTimeoutMs,
    handshakeTimeoutMs: generation.handshakeTimeoutMs,
    shutdownGraceMs: generation.shutdownGraceMs,
    killWaitMs: generation.killWaitMs,
  }
}

/**
 * 145: the serializable config may name one explicit settings-draft location. Only a plain value is
 * read here; the trusted storage context is opened by the plugin itself, never injected by a caller.
 * The draft is independent from `generation`: it works while generation stays disabled.
 */
function settingsDraftRoot(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return undefined
  const settings = config.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return undefined
  return settings.draftRoot
}

/**
 * 149: the applied Qwen runtime paths replace the corresponding runtime parameters when the plugin
 * opens: the Python program becomes the worker runtime and the model directory replaces the worker's
 * `--model-dir` argument (appended when absent). The trust root and the enablement decision still come
 * from the serializable config; nothing is executed or read here.
 */
function withAppliedRuntime(settings, applied) {
  const worker = settings.worker && typeof settings.worker === 'object' && !Array.isArray(settings.worker)
    ? settings.worker
    : {}
  const args = Array.isArray(worker.args) ? [...worker.args] : []
  const index = args.lastIndexOf('--model-dir')
  if (index >= 0 && index + 1 < args.length) args[index + 1] = applied.modelDirectory
  else args.push('--model-dir', applied.modelDirectory)
  return { ...settings, worker: { ...worker, runtime: applied.pythonPath, args } }
}

/**
 * 142: the Host obtains its own isolated storage context, calls the existing Qwen runtime factory and
 * hands that same Core generation object to the existing Host surface. The worker belongs to this
 * assembly and is closed on dispose. 143: when the serializable config names a `storageRoot`, that
 * explicit location is the storage context instead of a temporary sandbox and is kept on dispose, so
 * a later assembly over the same location reads the same saved tasks and artifacts. 145: the Host
 * also receives the settings draft store opened from the serializable config.
 */
async function assembleGenerationHost(scope, settings, settingsDraft) {
  const { storageRoot, ...runtimeSettings } = settings
  const temporary = storageRoot === undefined
  const sandbox = temporary
    ? createConfigSandbox({ prefix: 'whale-voice-qwen-runtime-' })
    : openConfigStorage({ root: storageRoot })
  const opened = await openQwenGenerationRuntime({ sandbox, ...runtimeSettings })
  if (!opened.ok) {
    if (temporary) removeConfigSandbox(sandbox)
    throw new Error('whale-voice generation runtime: ' + (opened.code || 'ASSEMBLY_FAILED'))
  }
  const runtime = opened.value
  const host = installHostBridge(scope, { env: process.env, generation: runtime.app, settingsDraft })
  if (typeof scope.effect === 'function') {
    scope.effect(() => () => {
      host.dispose()
      const closed = runtime.close()
      return temporary ? closed.finally(() => removeConfigSandbox(sandbox)) : closed
    })
  }
}

export function apply(ctx, config = undefined) {
  const settings = generationSettings(config)
  const draftRoot = settingsDraftRoot(config)
  return new Promise((resolve) => {
    ctx.inject(['webServer', 'connection'], (scope) => {
      const settingsDraft = draftRoot === undefined
        ? null
        : openGenerationSettingsDraft({ sandbox: openConfigStorage({ root: draftRoot }) })
      // 146/149: the applied location and runtime paths (if any) are used when the plugin opens; the
      // current runtime keeps whatever it was assembled with until this plugin is closed and opened again.
      const applied = settingsDraft === null ? null : settingsDraft.readApplied()
      if (applied !== null && applied.ok !== true) throw new Error('whale-voice settings draft: ' + applied.error)
      const appliedRuntime = settingsDraft === null ? null : settingsDraft.readAppliedRuntime()
      if (appliedRuntime !== null && appliedRuntime.ok !== true) {
        throw new Error('whale-voice settings draft: ' + appliedRuntime.error)
      }
      let effective = settings
      if (effective !== null && applied !== null && applied.applied) {
        effective = { ...effective, storageRoot: applied.applied.generationStorageRoot }
      }
      if (effective !== null && appliedRuntime !== null && appliedRuntime.applied) {
        effective = withAppliedRuntime(effective, appliedRuntime.applied)
      }
      if (!effective) {
        const host = installHostBridge(scope, { env: process.env, settingsDraft })
        if (typeof scope.effect === 'function') scope.effect(() => () => host.dispose())
        resolve()
        return
      }
      resolve(assembleGenerationHost(scope, effective, settingsDraft))
    })
  })
}
