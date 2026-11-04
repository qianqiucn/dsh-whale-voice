import { nowIso, sleep, summarizeError, HttpError } from './util.mjs'

export const STATES = Object.freeze({
  QUEUED: 'QUEUED',
  SYNTHESIZING: 'SYNTHESIZING',
  READY: 'READY',
  WAITING_FOR_UI: 'WAITING_FOR_UI',
  RECORDING: 'RECORDING',
  SENDING: 'SENDING',
  SENT_LOCAL: 'SENT_LOCAL',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  CANCELLED: 'CANCELLED',
})

const TERMINAL = new Set([STATES.SENT_LOCAL, STATES.FAILED, STATES.UNKNOWN, STATES.CANCELLED])
const IN_FLIGHT = new Set([STATES.SENDING, STATES.RECORDING, STATES.WAITING_FOR_UI])

function withTimeout(promise, ms, code) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Serial queue for WeChat UI automation.
 *
 * Invariants:
 *  - exactly one job touches the WeChat window at a time (the PowerShell worker additionally
 *    holds a named mutex, so an external script cannot interleave);
 *  - a request id is processed at most once, ever (duplicate → returns the stored job);
 *  - SENDING/RECORDING/WAITING_FOR_UI jobs are never resumed after a restart — they become
 *    UNKNOWN, because we cannot prove whether the bubble was sent;
 *  - a send timeout never triggers a retry and never re-runs TTS.
 */
export class VoiceQueue {
  constructor({ store, tts, sender, config, logger, probeDesktop = null }) {
    this.store = store
    this.tts = tts
    this.sender = sender
    this.config = config
    this.logger = logger
    this.probeDesktop = probeDesktop
    this.running = false
    this.stopping = false
    this.current = null
    this.emergency = { engaged: false, at: null, source: '', reason: '', requestId: null }
    this.lastCancelAt = null
  }

  recoverOnBoot() {
    let changed = 0
    for (const job of this.store.list()) {
      if (TERMINAL.has(job.state)) continue
      if (IN_FLIGHT.has(job.state)) {
        this.#transition(job, STATES.UNKNOWN, 'service_restart_in_flight')
      } else {
        this.#transition(job, STATES.CANCELLED, 'service_restart_not_started')
      }
      changed += 1
    }
    if (changed > 0) this.store.save()
    return changed
  }

  enqueue(input) {
    if (this.emergency.engaged) {
      throw new HttpError(423, 'emergency_stop_active', 'emergency_stop_active')
    }
    const existing = this.store.get(input.requestId)
    if (existing) return { duplicate: true, job: existing }

    if (this.store.countActive() >= (this.config.maxQueue ?? 8)) {
      throw new HttpError(429, 'queue_full', 'queue_full')
    }

    const job = {
      requestId: input.requestId,
      state: STATES.QUEUED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      trustedSessionId: input.trustedSessionId,
      trustedTargetId: input.trustedTargetId,
      chat: input.chat,
      target: input.target ?? null,
      automation: input.automation ?? null,
      text: input.text,
      voice: input.voice,
      emotion: input.emotion ?? 'neutral',
      media: null,
      result: null,
      error: null,
      warnings: [],
      timeline: [{ at: nowIso(), state: STATES.QUEUED, note: 'accepted' }],
    }
    this.store.upsert(job)
    this.store.save()
    void this.kick()
    return { duplicate: false, job }
  }

  cancel(requestId) {
    const job = this.store.get(requestId)
    if (!job) return { ok: false, code: 'not_found' }
    if (TERMINAL.has(job.state) || job.state === STATES.CANCELLED) return { ok: true, state: job.state, note: 'already_terminal' }
    this.lastCancelAt = nowIso()
    if (job.state === STATES.QUEUED || job.state === STATES.SYNTHESIZING || job.state === STATES.READY) {
      job.cancelRequested = true
      this.#transition(job, STATES.CANCELLED, 'USER_CANCELLED:CANCELLED_BEFORE_UI')
      this.store.save()
      return { ok: true, state: job.state, cancel_requested: true, stage: 'CANCELLED_BEFORE_UI' }
    }
    // WAITING_FOR_UI / RECORDING / SENDING: only the worker can safely release right Alt or
    // press Backspace. Ask it through the per-job cancel file; never mark CANCELLED here.
    job.cancelRequested = true
    const requested = this.sender.requestCancel?.(requestId, 'USER_CANCELLED')
    this.store.save()
    return {
      ok: true,
      state: job.state,
      cancel_requested: true,
      worker_signal: requested?.ok === true,
      stage: job.state === STATES.SENDING ? 'UNKNOWN_AFTER_SEND' : 'CANCEL_REQUESTED',
    }
  }

  /**
   * Global emergency stop. One latch blocks every new task until an explicit reset; queued
   * jobs are cancelled before UI, and an active worker receives a cancel file. We never mark
   * RECORDING/SENDING as CANCELLED here: only the worker's observed result can do that.
   */
  emergencyStop({ source = 'hotkey', reason = 'USER_CANCELLED' } = {}) {
    this.lastCancelAt = nowIso()
    this.emergency = {
      engaged: true,
      at: nowIso(),
      source,
      reason,
      requestId: this.current?.requestId ?? null,
    }
    let queuedCancelled = 0
    let activeSignalled = false
    for (const job of this.store.list()) {
      if (TERMINAL.has(job.state) || job.state === STATES.CANCELLED) continue
      if (job.state === STATES.QUEUED || job.state === STATES.SYNTHESIZING || job.state === STATES.READY) {
        job.cancelRequested = true
        this.#transition(job, STATES.CANCELLED, 'USER_CANCELLED:CANCELLED_BEFORE_UI')
        queuedCancelled += 1
        continue
      }
      if (job.state === STATES.WAITING_FOR_UI || job.state === STATES.RECORDING || job.state === STATES.SENDING) {
        job.cancelRequested = true
        const requested = this.sender.requestCancel?.(job.requestId, 'USER_CANCELLED')
        if (requested?.ok) activeSignalled = true
        this.#transition(job, job.state, 'USER_CANCELLED:cancel_requested', null)
      }
    }
    this.store.save()
    this.logger?.(`emergency stop source=${source} queued=${queuedCancelled} activeSignalled=${String(activeSignalled)}`)
    return { ok: true, emergency: this.emergency, queuedCancelled, activeSignalled }
  }

  resetEmergency() {
    if (this.current && !TERMINAL.has(this.current.state)) {
      return { ok: false, code: 'active_task', state: this.current.state }
    }
    this.emergency = { engaged: false, at: null, source: '', reason: '', requestId: null }
    this.logger?.('emergency stop latch reset by API')
    return { ok: true }
  }

  async stop() {
    this.stopping = true
    let cancelled = 0
    for (const job of this.store.list()) {
      if (job.state === STATES.QUEUED) {
        this.#transition(job, STATES.CANCELLED, 'service_shutdown')
        cancelled += 1
      }
    }
    if (cancelled > 0) this.store.save()
    return cancelled
  }

  async kick() {
    if (this.running || this.stopping) return
    this.running = true
    try {
      for (;;) {
        if (this.stopping) break
        const next = this.store
          .list()
          .filter((j) => j.state === STATES.QUEUED)
          .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0]
        if (!next) break
        await this.#process(next)
      }
    } finally {
      this.running = false
      this.current = null
    }
  }

  async #process(job) {
    this.current = job
    if (this.emergency.engaged) {
      this.#transition(job, STATES.CANCELLED, 'USER_CANCELLED:CANCELLED_BEFORE_UI')
      this.store.save()
      this.current = null
      return
    }
    job.attempts = (job.attempts ?? 0) + 1
    const jobTimeout = this.config.jobTimeoutMs ?? 240000
    // Only a real worker process may move the job into WAITING_FOR_UI. A preflight rejection
    // (missing script, escaped path, missing powershell) must not look like a UI attempt.
    let workerStarted = false

    try {
      this.#transition(job, STATES.SYNTHESIZING, 'tts_start')
      this.store.save()

      const media = await withTimeout(
        this.tts.synthesize({ text: job.text, voice: job.voice, emotion: job.emotion }),
        jobTimeout,
        'tts_timeout',
      )
      job.media = media
      if (this.emergency.engaged || job.cancelRequested) {
        this.#transition(job, STATES.CANCELLED, 'USER_CANCELLED:CANCELLED_BEFORE_UI')
        this.store.save()
        return
      }
      this.#transition(job, STATES.READY, media.cached ? 'tts_cache_hit' : 'tts_ok')
      this.store.save()

      if (this.emergency.engaged || job.cancelRequested) {
        this.#transition(job, STATES.CANCELLED, 'USER_CANCELLED:CANCELLED_BEFORE_UI')
        this.store.save()
        return
      }

      if (this.stopping) {
        this.#transition(job, STATES.CANCELLED, 'service_shutdown_before_ui')
        this.store.save()
        return
      }

      // Fail-closed desktop gate: never touch the WeChat window when the session is locked,
      // disconnected or otherwise non-interactive.
      if (this.probeDesktop) {
        const desk = await this.probeDesktop()
        job.desktop = desk
        if (!desk?.ok) {
          this.#transition(job, STATES.FAILED, `desktop_not_interactive:${desk?.reason ?? 'unknown'}`, desk?.reason ?? 'desktop_not_interactive')
          this.store.save()
          return
        }
      }
      if (this.emergency.engaged || job.cancelRequested) {
        this.#transition(job, STATES.CANCELLED, 'USER_CANCELLED:CANCELLED_BEFORE_UI')
        this.store.save()
        return
      }

      // WAITING_FOR_UI is an observed fact, not an intention: set it only after the worker
      // process has actually been created.
      const markStarted = () => {
        workerStarted = true
        if (job.state === STATES.READY) {
          this.#transition(job, STATES.WAITING_FOR_UI, 'sender_process_started')
          this.store.save()
        }
      }

      const result = await withTimeout(
        this.sender.send({
          requestId: job.requestId,
          wav: media.wav,
          chat: job.chat,
          target: job.target,
          automation: job.automation,
          preMs: this.config.sender?.preSilenceMs ?? 1000,
          postMs: this.config.sender?.postSilenceMs ?? 1000,
          onStart: markStarted,
          onPhase: (phase) => {
            // Only observed facts move the state machine forward.
            if (phase === 'RECORDING' && (job.state === STATES.WAITING_FOR_UI || job.state === STATES.READY)) {
              // A worker that observed RECORDING necessarily started; record both facts in order.
              if (job.state === STATES.READY) {
                this.#transition(job, STATES.WAITING_FOR_UI, 'sender_start_observed')
              }
              this.#transition(job, STATES.RECORDING, 'recording_ui_observed')
              this.store.save()
            } else if (phase === 'SENDING' && (job.state === STATES.RECORDING || job.state === STATES.WAITING_FOR_UI)) {
              this.#transition(job, STATES.SENDING, 'release_issued')
              this.store.save()
            } else if (phase === 'NAVIGATING' || phase === 'TARGET_VERIFIED' || phase === 'RESTORING') {
              job.uiPhase = phase
              this.store.save()
            }
          },
        }),
        // Backstop only: the sender's own execFile timeout is authoritative and kills the
        // child. Leave headroom so the queue never abandons a live worker it cannot kill.
        (this.config.sender?.timeoutMs ?? 240000) + 10000,
        'sender_timeout',
      )

      job.result = result
      const raw = result.raw ?? null
      if (raw && raw.restore_ok === false) {
        job.warnings = [...(job.warnings ?? []), 'device_restore_failed']
        if (raw.restore_error) job.warnings.push(`device_restore_error:${String(raw.restore_error).slice(0, 160)}`)
        this.logger?.(`device restore failed for ${job.requestId}`)
      }
      if (raw && raw.cancel_bubble_appeared === true) {
        job.warnings = [...(job.warnings ?? []), 'cancel_bubble_appeared']
      }
      if (raw && raw.cancel_stage) job.cancelStage = String(raw.cancel_stage)
      if (result.status === STATES.SENT_LOCAL) this.#transition(job, STATES.SENT_LOCAL, result.bubble || 'bubble_detected')
      else if (result.status === STATES.CANCELLED) this.#transition(job, STATES.CANCELLED, result.reason || 'USER_CANCELLED')
      else if (result.status === STATES.UNKNOWN) this.#transition(job, STATES.UNKNOWN, result.reason || 'worker_unknown')
      else this.#transition(job, STATES.FAILED, result.reason || 'worker_failed', summarizeError(result.reason))
    } catch (err) {
      const code = err?.message ?? 'unknown'
      // Any failure after a worker process existed (or after the UI phase started) may have
      // produced a bubble → UNKNOWN, never retried. Only a provably-prepflight failure is FAILED.
      const startedUi =
        workerStarted ||
        job.state === STATES.WAITING_FOR_UI ||
        job.state === STATES.SENDING ||
        job.state === STATES.RECORDING
      if (startedUi) this.#transition(job, STATES.UNKNOWN, `error_after_ui:${code}`, code)
      else this.#transition(job, STATES.FAILED, code, code)
    } finally {
      this.store.save()
      this.current = null
    }
  }

  #transition(job, state, note, error = null) {
    job.state = state
    job.updatedAt = nowIso()
    job.timeline = Array.isArray(job.timeline) ? job.timeline : []
    job.timeline.push({ at: job.updatedAt, state, note: String(note ?? '').slice(0, 300) })
    if (job.timeline.length > 40) job.timeline = job.timeline.slice(-40)
    if (error) job.error = String(error).slice(0, 500)
  }

  snapshot() {
    return {
      running: this.running,
      stopping: this.stopping,
      current: this.current?.requestId ?? null,
      currentState: this.current?.state ?? null,
      currentPhase: this.current?.uiPhase ?? null,
      active: this.store.countActive(),
      emergency: this.emergency,
      lastCancelAt: this.lastCancelAt,
      jobs: this.store
        .list()
        .slice(-20)
        .map((j) => ({ requestId: j.requestId, state: j.state, chat: j.chat, updatedAt: j.updatedAt })),
    }
  }
}

export { TERMINAL, IN_FLIGHT, sleep }
