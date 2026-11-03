import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { appendLog, HttpError, nowIso, readJsonFile, summarizeError, writeJsonAtomic } from './util.mjs'
import { validateRequest } from './validate.mjs'
import { Store } from './store.mjs'
import { TtsAdapter } from './tts.mjs'
import { Sender } from './sender.mjs'
import { VoiceQueue, STATES } from './queue.mjs'
import { createDesktopProbe } from './desktop.mjs'
import { HotkeyService } from './hotkey.mjs'
import { WeChatProbe } from './wechat.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, '..')
const moduleRoot = resolve(serviceRoot, '..')

const config = readJsonFile(join(serviceRoot, 'service.config.json'), null)
if (!config) {
  console.error('service.config.json missing')
  process.exit(1)
}
config.__targets = readJsonFile(join(serviceRoot, config.targetsFile ?? 'targets.json'), { targets: [] })

if (process.env.VOICE_SERVICE_FAKE === '1') {
  config.sender = { ...(config.sender ?? {}), mode: 'fake' }
  config.dsTts = { ...(config.dsTts ?? {}), fake: true }
  config.tts = { ...(config.tts ?? {}), fake: true }
}
if (process.env.VOICE_AUTOMATION_MODE && ['manual', 'auto', 'disabled'].includes(process.env.VOICE_AUTOMATION_MODE)) {
  config.automation = { ...(config.automation ?? {}), mode: process.env.VOICE_AUTOMATION_MODE }
}
if (process.env.VOICE_EMERGENCY_ENABLED === '0') {
  config.emergencyStop = { ...(config.emergencyStop ?? {}), enabled: false }
}

const runtimeDir = join(serviceRoot, 'runtime')
mkdirSync(runtimeDir, { recursive: true })
const logFile = join(serviceRoot, config.logFile ?? 'runtime/service.log')
const stateFile = process.env.VOICE_SERVICE_STATE
  ? resolve(process.env.VOICE_SERVICE_STATE)
  : join(serviceRoot, config.stateFile ?? 'runtime/state.json')
const tokenFile = join(serviceRoot, config.tokenFile ?? 'runtime/service.token')
const port = Number(process.env.VOICE_SERVICE_PORT ?? config.port ?? 43371)

function loadOrCreateToken() {
  if (existsSync(tokenFile)) {
    const t = readFileSync(tokenFile, 'utf8').trim()
    if (t.length >= 32) return t
  }
  const t = randomBytes(32).toString('hex')
  writeFileSync(tokenFile, `${t}\n`, 'utf8')
  return t
}

const token = process.env.VOICE_SERVICE_TOKEN?.trim() || loadOrCreateToken()
const tokenBuf = Buffer.from(token)

function log(line) {
  appendLog(logFile, line)
}

function authorized(req) {
  const header = req.headers.authorization ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m) return false
  const given = Buffer.from(m[1].trim())
  if (given.length !== tokenBuf.length) return false
  return timingSafeEqual(given, tokenBuf)
}

function isLoopback(req) {
  const addr = req.socket.remoteAddress ?? ''
  const okAddr = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
  if (!okAddr) return false
  const host = String(req.headers.host ?? '')
  const hostName = host.split(':')[0]
  return hostName === '127.0.0.1' || hostName === 'localhost' || hostName === '[::1]'
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(payload)
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, 'body_too_large', 'body_too_large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'body_invalid_json', 'body_invalid_json')
  }
}

const store = new Store(stateFile).load()
const tts = new TtsAdapter({ config, cacheDir: join(serviceRoot, config.tts?.cacheDir ?? 'runtime/tts-cache') })
log(`tts provider=${tts.provider} baseUrl=${tts.baseUrl} voice=${tts.voice} fake=${String(tts.fake)}`)
const sender = new Sender({ config, rootDir: moduleRoot, logger: log })
const desktopProbeEnabled = config.desktop?.enabled !== false
const probeDesktop = createDesktopProbe({
  scriptPath: resolve(moduleRoot, config.desktop?.script ?? 'desktop-guard.ps1'),
  powershell: config.desktop?.powershell ?? 'powershell.exe',
  timeoutMs: config.desktop?.timeoutMs ?? 8000,
})
let lastDesktop = null
async function checkDesktop() {
  if (!desktopProbeEnabled) return { ok: true, reason: 'disabled', checkedAt: nowIso() }
  const result = await probeDesktop()
  lastDesktop = result
  return result
}
const queue = new VoiceQueue({
  store,
  tts,
  sender,
  config,
  logger: log,
  probeDesktop: desktopProbeEnabled ? checkDesktop : null,
})
const wechatProbe = new WeChatProbe({ rootDir: moduleRoot, config, logger: log })
const hotkey = new HotkeyService({
  rootDir: moduleRoot,
  config,
  logger: log,
  onTrigger: (signal) => queue.emergencyStop({
    source: signal?.source ?? 'hotkey',
    reason: 'USER_CANCELLED',
  }),
})

const recovered = queue.recoverOnBoot()
log(`service boot: recovered=${recovered} state=${stateFile}`)
if (process.env.VOICE_DISABLE_HOTKEY !== '1') {
  const hotkeyStatus = await hotkey.start()
  log(`hotkey boot: available=${String(hotkeyStatus.available)} registered=${String(hotkeyStatus.registered)} error=${hotkeyStatus.error}`)
}

function runRecoverScript() {
  const script = resolve(moduleRoot, 'voice-sender-recover.ps1')
  return new Promise((resolvePromise) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { timeout: 60000, windowsHide: true }, (err, stdout) => {
      resolvePromise({ ok: !err, output: String(stdout ?? '').trim().slice(0, 4000), error: err ? summarizeError(err) : null })
    })
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  try {
    if (!isLoopback(req)) throw new HttpError(403, 'not_loopback', 'not_loopback')
    if (!authorized(req)) throw new HttpError(401, 'unauthorized', 'unauthorized')

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'voice-sender',
        version: '0.1.0',
        now: nowIso(),
        queue: queue.snapshot(),
        tts: { provider: tts.provider, baseUrl: tts.baseUrl, voice: tts.voice, fake: tts.fake },
        sender: { mode: sender.fake ? 'fake' : 'real', preMs: config.sender?.preSilenceMs ?? 1000, postMs: config.sender?.postSilenceMs ?? 1000 },
        automation: {
          mode: config.automation?.mode ?? 'manual',
          autoFindWindow: config.automation?.autoFindWindow !== false,
          autoOpenChat: config.automation?.autoOpenChat === true,
          autoRestoreMinimized: config.automation?.autoRestoreMinimized !== false,
          pauseWhenFullscreen: config.automation?.pauseWhenFullscreen !== false,
        },
        hotkey: hotkey.status,
        emergency: queue.emergency,
        wechat: wechatProbe.snapshot(),
        desktop: lastDesktop ?? { checkedAt: null, ok: null, reason: 'not_probed_yet' },
        targets: (config.__targets?.targets ?? []).filter((t) => t.enabled).map((t) => ({ id: t.trustedTargetId, uiName: t.uiName })),
      })
    }

    if (req.method === 'POST' && url.pathname === '/v1/messages') {
      const body = await readBody(req)
      const input = validateRequest(body, config)
      if (queue.emergency.engaged) {
        throw new HttpError(423, 'emergency_stop_active', 'emergency_stop_active')
      }
      if (
        input.automation.mode === 'auto' &&
        config.emergencyStop?.requireForAutoSend !== false &&
        !hotkey.status.available
      ) {
        throw new HttpError(503, 'emergency_stop_unavailable', 'emergency_stop_unavailable')
      }
      const desk = await checkDesktop()
      if (!desk.ok) {
        log(`desktop gate rejected ${input.requestId}: ${desk.reason}`)
        throw new HttpError(503, `desktop_not_interactive:${desk.reason}`, 'desktop_not_interactive')
      }
      const { duplicate, job } = queue.enqueue(input)
      log(`enqueue ${input.requestId} chat=${input.chat} duplicate=${duplicate}`)
      return sendJson(res, duplicate ? 200 : 202, {
        ok: true,
        duplicate,
        requestId: job.requestId,
        state: job.state,
        chat: job.chat,
      })
    }

    if (req.method === 'GET' && url.pathname === '/v1/messages') {
      const jobs = store.list().slice(-50).map(publicJob)
      return sendJson(res, 200, { ok: true, jobs })
    }

    const m = /^\/v1\/messages\/([A-Za-z0-9_-]{8,64})(\/cancel)?$/.exec(url.pathname)
    if (m) {
      const job = store.get(m[1])
      if (!job) throw new HttpError(404, 'not_found', 'not_found')
      if (m[2] && req.method === 'POST') {
        const result = queue.cancel(m[1])
        log(`cancel ${m[1]} -> ${JSON.stringify(result)}`)
        return sendJson(res, result.ok ? 200 : 409, { ok: result.ok, ...result, state: store.get(m[1])?.state })
      }
      if (req.method === 'GET') return sendJson(res, 200, { ok: true, job: publicJob(job) })
    }

    if (req.method === 'POST' && url.pathname === '/v1/emergency-stop') {
      const result = await hotkey.manualTrigger('USER_CANCELLED')
      return sendJson(res, 200, { ok: true, ...result, states: queue.snapshot() })
    }

    if (req.method === 'POST' && url.pathname === '/v1/emergency-stop/reset') {
      const result = queue.resetEmergency()
      return sendJson(res, result.ok ? 200 : 409, { ...result, emergency: queue.emergency })
    }

    if (req.method === 'GET' && url.pathname === '/v1/automation/status') {
      const window = await wechatProbe.probe({ maxAgeMs: 1000 })
      const title = String(window?.title ?? '')
      const targetRows = (config.__targets?.targets ?? []).filter((t) => t.enabled)
      const currentTarget = targetRows.find((t) => t.uiName === title) ?? null
      const hot = hotkey.status
      const canSend = !queue.emergency.engaged &&
        !(config.automation?.mode === 'auto' && config.emergencyStop?.requireForAutoSend !== false && !hot.available)
      return sendJson(res, 200, {
        ok: true,
        now: nowIso(),
        mode: config.automation?.mode ?? 'manual',
        automation: {
          autoFindWindow: config.automation?.autoFindWindow !== false,
          autoOpenChat: config.automation?.autoOpenChat === true,
          autoRestoreMinimized: config.automation?.autoRestoreMinimized !== false,
          pauseWhenFullscreen: config.automation?.pauseWhenFullscreen !== false,
          focusFailure: config.automation?.focusFailure ?? 'text_fallback',
        },
        hotkey: hot,
        lastCancelAt: queue.lastCancelAt ?? hot.lastCancelAt,
        emergency: queue.emergency,
        queue: queue.snapshot(),
        wechat: {
          windowFound: Boolean(window?.found),
          foreground: Boolean(window?.foreground),
          minimized: Boolean(window?.minimized),
          title,
          currentTarget: currentTarget ? { trustedTargetId: currentTarget.trustedTargetId, kind: currentTarget.kind ?? 'private', uiName: currentTarget.uiName } : null,
          targetVerified: Boolean(currentTarget && currentTarget.kind !== 'group' && window?.found && Number(window?.targetSession) === 1),
          fullscreen: window?.fullscreen ?? null,
          reason: window?.reason ?? '',
          checkedAt: window?.checkedAt ?? null,
        },
        recording: queue.current?.state === STATES.RECORDING,
        navigating: queue.current?.uiPhase === 'NAVIGATING',
        restoring: queue.current?.uiPhase === 'RESTORING' || Boolean(queue.current?.warnings?.includes('device_restore_failed')),
        canSend,
      })
    }

    if (req.method === 'PUT' && url.pathname === '/v1/automation/config') {
      if (queue.current && !['SENT_LOCAL', 'FAILED', 'UNKNOWN', 'CANCELLED'].includes(queue.current.state)) {
        throw new HttpError(409, 'active_task', 'active_task')
      }
      const body = await readBody(req)
      const allowed = new Set(['mode', 'autoFindWindow', 'autoOpenChat', 'autoRestoreMinimized', 'pauseWhenFullscreen', 'focusFailure', 'hotkeyAccelerator'])
      for (const key of Object.keys(body)) {
        if (!allowed.has(key)) throw new HttpError(400, `field_not_allowed:${key}`, 'field_not_allowed')
      }
      if (body.mode !== undefined && !['manual', 'auto', 'disabled'].includes(body.mode)) {
        throw new HttpError(400, 'mode_invalid', 'mode_invalid')
      }
      for (const key of ['autoFindWindow', 'autoOpenChat', 'autoRestoreMinimized', 'pauseWhenFullscreen']) {
        if (body[key] !== undefined && typeof body[key] !== 'boolean') throw new HttpError(400, `${key}_invalid`, `${key}_invalid`)
      }
      if (body.focusFailure !== undefined && !['text_fallback', 'no_send'].includes(body.focusFailure)) {
        throw new HttpError(400, 'focus_failure_invalid', 'focus_failure_invalid')
      }
      let accelerator = body.hotkeyAccelerator
      if (accelerator !== undefined && (typeof accelerator !== 'string' || !/^(Ctrl|Control|Shift|Alt|Win)(\+(Ctrl|Control|Shift|Alt|Win))*\+F([1-9]|1[0-9]|2[0-4])$/.test(accelerator))) {
        throw new HttpError(400, 'hotkey_accelerator_invalid', 'hotkey_accelerator_invalid')
      }
      const nextMode = body.mode ?? config.automation?.mode ?? 'manual'
      if (nextMode === 'auto' && config.emergencyStop?.requireForAutoSend !== false && !hotkey.status.available) {
        throw new HttpError(409, 'emergency_stop_unavailable', 'emergency_stop_unavailable')
      }

      config.automation = {
        ...(config.automation ?? {}),
        mode: nextMode,
        autoFindWindow: body.autoFindWindow ?? config.automation?.autoFindWindow !== false,
        autoOpenChat: body.autoOpenChat ?? config.automation?.autoOpenChat === true,
        autoRestoreMinimized: body.autoRestoreMinimized ?? config.automation?.autoRestoreMinimized !== false,
        pauseWhenFullscreen: body.pauseWhenFullscreen ?? config.automation?.pauseWhenFullscreen !== false,
        focusFailure: body.focusFailure ?? config.automation?.focusFailure ?? 'text_fallback',
      }
      let hotkeyRestarted = false
      if (accelerator && accelerator !== config.emergencyStop?.accelerator) {
        config.emergencyStop = { ...(config.emergencyStop ?? {}), accelerator }
        hotkey.accelerator = accelerator
        await hotkey.stop()
        await hotkey.start()
        hotkeyRestarted = true
      }
      const persisted = { ...config }
      delete persisted.__targets
      writeFileSync(join(serviceRoot, 'service.config.json'), JSON.stringify(persisted, null, 2) + '\n', 'utf8')
      log(`automation config updated mode=${config.automation.mode} hotkey=${hotkey.accelerator} restarted=${String(hotkeyRestarted)}`)
      return sendJson(res, 200, {
        ok: true,
        config: {
          mode: config.automation.mode,
          autoFindWindow: config.automation.autoFindWindow !== false,
          autoOpenChat: config.automation.autoOpenChat === true,
          autoRestoreMinimized: config.automation.autoRestoreMinimized !== false,
          pauseWhenFullscreen: config.automation.pauseWhenFullscreen !== false,
          focusFailure: config.automation.focusFailure ?? 'text_fallback',
          hotkey: { accelerator: hotkey.accelerator, available: hotkey.status.available, registered: hotkey.status.registered, error: hotkey.status.error },
        },
      })
    }

    if (req.method === 'GET' && url.pathname === '/v1/automation/config') {
      return sendJson(res, 200, {
        ok: true,
        mode: config.automation?.mode ?? 'manual',
        autoFindWindow: config.automation?.autoFindWindow !== false,
        autoOpenChat: config.automation?.autoOpenChat === true,
        autoRestoreMinimized: config.automation?.autoRestoreMinimized !== false,
        pauseWhenFullscreen: config.automation?.pauseWhenFullscreen !== false,
        focusFailure: config.automation?.focusFailure ?? 'text_fallback',
        hotkey: {
          accelerator: hotkey.accelerator,
          registered: hotkey.status.registered,
          available: hotkey.status.available,
          error: hotkey.status.error,
        },
        emergencyStop: { requireForAutoSend: config.emergencyStop?.requireForAutoSend !== false },
      })
    }

    if (req.method === 'POST' && url.pathname === '/v1/maintenance/restore-devices') {
      const result = await runRecoverScript()
      log(`restore-devices ok=${result.ok} ${result.error ?? ''}`)
      return sendJson(res, result.ok ? 200 : 500, result)
    }

    if (req.method === 'POST' && url.pathname === '/v1/shutdown') {
      sendJson(res, 200, { ok: true, stopping: true })
      void shutdown('api_request')
      return
    }

    throw new HttpError(404, 'route_not_found', 'route_not_found')
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    if (status >= 500) log(`error ${req.method} ${url.pathname}: ${summarizeError(err)}`)
    return sendJson(res, status, { ok: false, error: { code: err.code ?? 'internal', message: summarizeError(err) } })
  }
})

function publicJob(job) {
  return {
    requestId: job.requestId,
    state: job.state,
    chat: job.chat,
    voice: job.voice,
    emotion: job.emotion ?? 'neutral',
    text: job.text.length > 80 ? `${job.text.slice(0, 80)}…` : job.text,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    media: job.media ? { seconds: job.media.seconds, bytes: job.media.bytes, cached: job.media.cached, ms: job.media.ms } : null,
    result: job.result ? { status: job.result.status, bubble: job.result.bubble, reason: job.result.reason } : null,
    cancelStage: job.cancelStage ?? null,
    uiPhase: job.uiPhase ?? null,
    error: job.error ?? null,
    warnings: job.warnings ?? [],
    timeline: job.timeline ?? [],
  }
}

let shuttingDown = false
async function shutdown(reason) {
  if (shuttingDown) return
  shuttingDown = true
  log(`shutdown requested: ${reason}`)
  const cancelled = await queue.stop()
  await hotkey.stop()
  log(`shutdown: cancelled ${cancelled} queued job(s)`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

server.listen(port, config.host ?? '127.0.0.1', () => {
  const addr = server.address()
  writeJsonAtomic(join(runtimeDir, 'service.json'), {
    pid: process.pid,
    host: addr.address,
    port: addr.port,
    startedAt: nowIso(),
    fake: Boolean(config.dsTts?.fake),
    tokenFile,
  })
  log(`listening on ${addr.address}:${addr.port} fake=${Boolean(config.dsTts?.fake)}`)
  console.log(`voice-sender service listening on http://${addr.address}:${addr.port} (token: ${tokenFile})`)
})

export { server, queue, store, config, STATES }
