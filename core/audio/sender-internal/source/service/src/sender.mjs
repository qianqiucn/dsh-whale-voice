import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { summarizeError } from './util.mjs'

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/

/**
 * True when `child` is a strict descendant of `parent`.
 *
 * Uses `path.relative()` instead of a string `startsWith()`: the latter also accepts
 * sibling directories whose name merely starts with the trusted root ("C:\root-evil"
 * passes a prefix check against "C:\root"). `relative()` also handles Windows
 * case-insensitivity and returns an absolute path for a different drive, which we reject.
 */
function isStrictlyInside(child, parent) {
  const rel = relative(parent, child)
  if (rel === '') return false
  if (isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../')
}

function realpathOrNull(path) {
  try {
    return realpathSync.native(path)
  } catch {
    return null
  }
}

function readPhases(progressFile) {
  const phases = new Set()
  try {
    for (const line of readFileSync(progressFile, 'utf8').split(/\r?\n/)) {
      const value = line.trim()
      if (value !== '') phases.add(value)
    }
  } catch {
    /* no progress file yet */
  }
  return phases
}

/**
 * Thin wrapper around the already-working PowerShell/C# sender.
 * The audio path is produced by the TTS adapter (never by the caller), and the child process
 * is started with an argument vector — no shell, no string concatenation, no interpolation of
 * request text into a command line.
 *
 * Failure contract (this is what the queue relies on):
 *  - FAILED  → provably nothing touched the WeChat UI (preflight) *or* the worker itself
 *              reported a rejection/failure before it ever confirmed RECORDING;
 *  - UNKNOWN → either the worker was started and its outcome is not provable, or it did reach
 *              the UI. UNKNOWN is terminal and must never be retried or text-fallbacked.
 */
export class Sender {
  constructor({ config, rootDir, logger, execFileImpl = execFile }) {
    this.config = config
    this.rootDir = rootDir
    this.logger = logger
    this.execFile = execFileImpl
    this.active = null
    this.globalCancelFile = resolve(
      this.rootDir,
      config.emergencyStop?.signalFile ?? 'service/runtime/emergency-stop.signal.json',
    )
  }

  /**
   * Ask the worker to cancel through its per-job cancel file. The worker owns the safe
   * Backspace/RAltUp/device restore sequence; the service never kills a live recording first.
   */
  requestCancel(requestId, reason = 'USER_CANCELLED') {
    if (!this.active || this.active.requestId !== requestId) {
      return { ok: false, code: 'not_active' }
    }
    const payload = { reason, at: new Date().toISOString(), source: 'queue' }
    writeFileSync(this.active.cancelFile, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true, file: this.active.cancelFile }
  }

  get fake() {
    return this.config.sender?.mode === 'fake'
  }

  /**
   * Resolve the configured worker script and prove it is a real file inside the module root.
   * The configuration file is the only source for this value; no HTTP request can supply it.
   * @returns {{ok: true, path: string} | {ok: false, code: string}}
   */
  #resolveScript() {
    const configured = String(this.config.sender?.script ?? 'voice-sender.ps1').trim()
    if (configured === '' || configured.includes('\0')) return { ok: false, code: 'script_invalid' }

    const rootLexical = resolve(this.rootDir)
    const candidate = resolve(rootLexical, configured)
    if (!isStrictlyInside(candidate, rootLexical)) return { ok: false, code: 'script_outside_root' }

    let stat
    try {
      stat = statSync(candidate)
    } catch {
      return { ok: false, code: 'script_missing' }
    }
    if (!stat.isFile()) return { ok: false, code: 'script_not_file' }

    // A junction/symlink can sit lexically inside the root while pointing elsewhere.
    const rootReal = realpathOrNull(rootLexical)
    const candidateReal = realpathOrNull(candidate)
    if (rootReal === null || candidateReal === null) return { ok: false, code: 'script_unresolvable' }
    if (!isStrictlyInside(candidateReal, rootReal)) return { ok: false, code: 'script_outside_root' }

    return { ok: true, path: candidateReal }
  }

  async send({ requestId, wav, chat, target = null, automation = null, preMs, postMs, onPhase, onStart }) {
    if (!SAFE_ID.test(requestId)) throw new Error('sender_bad_request_id')
    if (this.fake) return this.#fakeSend({ requestId, chat })

    // Preflight happens before any request file is written: a bad script path must look like
    // "we never started anything", not like a failed UI attempt.
    const script = this.#resolveScript()
    if (!script.ok) {
      this.logger?.(`sender preflight failed: ${script.code}`)
      return { status: 'FAILED', reason: `sender_preflight:${script.code}`, bubble: '', raw: null }
    }

    const runDir = join(this.rootDir, 'run')
    mkdirSync(runDir, { recursive: true })
    const requestFile = join(runDir, `svc-${requestId}.request.json`)
    const resultFile = join(runDir, `svc-${requestId}.result.json`)
    const progressFile = join(runDir, `svc-${requestId}.progress`)
    const cancelFile = join(runDir, `svc-${requestId}.cancel.json`)

    const payload = {
      wav,
      chat,
      voice_pre_silence_ms: preMs,
      voice_post_silence_ms: postMs,
      target: target ?? { kind: chat.startsWith('group:') ? 'group' : 'private', identityVerified: false },
      automation: automation ?? { mode: 'manual', autoOpenChat: false, autoRestoreMinimized: true, pauseWhenFullscreen: true },
      cancel_file: cancelFile,
      global_cancel_file: this.globalCancelFile,
      cancel_after: new Date().toISOString(),
    }
    // The service config is authoritative for the chat allow-list. Passing it to the worker
    // prevents the two config files from drifting (a stale worker whitelist rejected a real
    // send with REJECTED:chat_not_allowed even though the service allowed the target).
    if (Array.isArray(this.config.allowedChats)) payload.voice_allowed_chats = this.config.allowedChats
    writeFileSync(requestFile, JSON.stringify(payload, null, 2), 'utf8')
    // A leftover file from an earlier run of the same id must never be attributed to this one.
    for (const stale of [progressFile, resultFile, cancelFile]) {
      try {
        unlinkSync(stale)
      } catch {
        /* first run */
      }
    }
    this.active = { requestId, cancelFile }

    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script.path,
      '-Request',
      requestFile,
      '-JsonOut',
      resultFile,
      '-ProgressFile',
      progressFile,
      '-CancelFile',
      cancelFile,
      '-GlobalCancelFile',
      this.globalCancelFile,
    ]
    const timeout = this.config.sender?.timeoutMs ?? 240000

    // Progress markers are written by the worker only after it actually observes the state:
    // RECORDING (wave view seen), SENDING (release issued), then the final status.
    const observed = new Set()
    const reported = new Set()
    let seen = 0
    const timer = setInterval(() => {
      try {
        const lines = readFileSync(progressFile, 'utf8').split(/\r?\n/).filter(Boolean)
        for (let i = seen; i < lines.length; i += 1) {
          const phase = lines[i].trim()
          observed.add(phase)
          if (!reported.has(phase)) {
            reported.add(phase)
            onPhase?.(phase)
          }
        }
        seen = Math.max(seen, lines.length)
      } catch {
        /* not created yet */
      }
    }, 150)

    let started = false
    const markStarted = () => {
      if (started) return
      started = true
      onStart?.()
    }

    let run
    try {
      run = await this.#spawnWorker({ args, timeout, onStart: markStarted })
    } finally {
      clearInterval(timer)
      this.active = null
      try {
        unlinkSync(requestFile)
      } catch {
        /* best effort */
      }
    }

    for (const phase of readPhases(progressFile)) {
      observed.add(phase)
      if (!reported.has(phase)) {
        reported.add(phase)
        onPhase?.(phase)
      }
    }

    let result = null
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8'))
    } catch {
      result = null
    }

    return this.#classify({ result, phases: observed, err: run.err, started: run.started, stdout: run.stdout, stderr: run.stderr })
  }

  /**
   * Run the worker with a full life-cycle: spawn error, exit, close, timeout and stdio.
   * `execFile` (not a shell) keeps the argument vector intact; we only add the observation
   * points that tell the queue whether a process ever existed.
   */
  #spawnWorker({ args, timeout, onStart }) {
    return new Promise((resolvePromise) => {
      let settled = false
      let started = false
      const finish = (payload) => {
        if (settled) return
        settled = true
        resolvePromise({ started, ...payload })
      }

      let child
      try {
        child = this.execFile(
          this.config.sender?.powershell ?? 'powershell.exe',
          args,
          { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
          (err, stdout, stderr) => {
            finish({ err: err ?? null, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
          },
        )
      } catch (error) {
        // The child process was never created.
        finish({ err: error, spawnFailed: true, stdout: '', stderr: '' })
        return
      }

      if (child && typeof child.once === 'function') {
        // 'spawn' is the only proof that an operating-system process exists.
        child.once('spawn', () => {
          started = true
          onStart?.()
        })
      } else {
        // Test double without life-cycle events: treat the call as dispatched.
        started = true
        onStart?.()
      }
    })
  }

  #classify({ result, phases, err, started, stdout, stderr }) {
    const uiTouched =
      phases.has('RECORDING') ||
      phases.has('SENDING') ||
      (Array.isArray(result?.timeline) &&
        result.timeline.some((line) => /recording confirmed/i.test(String(line?.text ?? line))))

    // No process was ever created: provably nothing touched WeChat.
    if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) {
      return { status: 'FAILED', reason: `sender_powershell_missing:${err.code}`, bubble: '', raw: null }
    }
    if (!started) {
      const detail = summarizeError(err) || 'spawn_failed'
      this.logger?.(`sender worker never started: ${detail}`)
      return { status: 'FAILED', reason: `sender_spawn_failed:${detail}`, bubble: '', raw: null }
    }

    if (err?.killed) {
      this.logger?.(`sender worker killed after timeout (uiTouched=${String(uiTouched)})`)
      return { status: 'UNKNOWN', reason: 'sender_timeout', bubble: '', raw: null }
    }

    if (!result) {
      // The worker ran, so we cannot prove it did not reach WeChat — even if it lived 80 ms.
      this.logger?.(
        `sender result missing after start (exit=${String(err?.code ?? 'none')}, stderr=${stderr.slice(-300)})`,
      )
      return { status: 'UNKNOWN', reason: 'sender_result_missing', bubble: '', raw: null }
    }

    const rawStatus = String(result.status ?? '').toUpperCase()
    const bubble = String(result.bubble_name ?? '')
    const reason = String(result.reason ?? '')

    if (rawStatus === 'SENT_LOCAL') return { status: 'SENT_LOCAL', reason: reason || 'sent_local', bubble, raw: result }
    if (rawStatus === 'CANCELLED') {
      // A cancel that cannot prove the recording was rolled back (or leaked a bubble) is
      // conservatively UNKNOWN, never a clean CANCELLED.
      if (result.cancel_bubble_appeared === true || /cancel_unconfirmed|UNKNOWN_AFTER_SEND/i.test(reason)) {
        return { status: 'UNKNOWN', reason: `USER_CANCELLED:${reason || 'cancel_unconfirmed'}`, bubble, raw: result }
      }
      return { status: 'CANCELLED', reason: reason || 'USER_CANCELLED', bubble, raw: result }
    }
    if (rawStatus === 'UNKNOWN') return { status: 'UNKNOWN', reason: reason || 'worker_unknown', bubble, raw: result }

    if (rawStatus === 'REJECTED') {
      // Every REJECTED path in the worker runs before push-to-talk starts.
      return { status: 'FAILED', reason: `REJECTED:${reason}`, bubble, raw: result }
    }

    if (rawStatus === 'FAILED') {
      if (uiTouched) {
        // Recording/release was already observed: a failure is not proof that no bubble exists.
        return { status: 'UNKNOWN', reason: `failed_after_ui:${reason || 'worker_failed'}`, bubble, raw: result }
      }
      return { status: 'FAILED', reason: `FAILED:${reason || 'worker_failed'}`, bubble, raw: result }
    }

    // A result file with an unknown status is not a trustworthy "safe failure".
    this.logger?.(`unrecognized worker status '${rawStatus}' stdout=${stdout.slice(-200)}`)
    return { status: 'UNKNOWN', reason: `worker_result_unrecognized:${rawStatus || 'empty'}`, bubble, raw: result }
  }

  async #fakeSend({ requestId }) {
    const delay = Number(this.config.sender?.fakeDelayMs ?? 50)
    await new Promise((r) => setTimeout(r, delay))
    const mode = this.config.sender?.fakeResult ?? 'SENT_LOCAL'
    if (mode === 'SENT_LOCAL') return { status: 'SENT_LOCAL', reason: 'fake', bubble: '语音3"秒', raw: { fake: true } }
    return { status: mode, reason: 'fake', bubble: '', raw: { fake: true } }
  }
}

export { summarizeError, isStrictlyInside }
