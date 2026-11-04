import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { nowIso, summarizeError } from './util.mjs'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

/**
 * Owns the separate RegisterHotKey host process.
 *
 * Contract:
 *  - one host per service; start() first stops a stale host recorded in status.json;
 *  - registration failure is reported, never silently upgraded to "available";
 *  - the host writes a signal file; this class turns a *new* signal into onTrigger();
 *  - the host is spawned/killed independently of a voice worker, so a stuck worker cannot
 *    prevent Ctrl+Shift+F12 from being received;
 *  - stop() unregisters (or lets the OS unregister when the process exits).
 */
export class HotkeyService {
  constructor({ rootDir, config, logger, onTrigger, spawnImpl = nodeSpawn }) {
    this.rootDir = rootDir
    this.config = config
    this.logger = logger
    this.onTrigger = onTrigger
    this.spawn = spawnImpl
    this.child = null
    this.timer = null
    this.lastSignal = null
    this.lastCancelAt = null
    this.startedAt = null
    this.hostRunning = false
    this._starting = null
    const es = config.emergencyStop ?? {}
    this.enabled = es.enabled !== false
    this.accelerator = String(es.accelerator ?? 'Ctrl+Shift+F12')
    this.signalFile = resolve(this.rootDir, es.signalFile ?? 'service/runtime/emergency-stop.signal.json')
    this.statusFile = resolve(this.rootDir, es.statusFile ?? 'service/runtime/hotkey.json')
    this.logFile = resolve(this.rootDir, es.logFile ?? 'service/runtime/hotkey.log')
    this.script = resolve(this.rootDir, es.script ?? 'hotkey-host.ps1')
    this.powershell = es.powershell ?? config.sender?.powershell ?? 'powershell.exe'
    this.startTimeoutMs = Number(es.startTimeoutMs ?? 4000)
  }

  get status() {
    const status = readJson(this.statusFile) ?? {}
    return {
      enabled: this.enabled,
      available: Boolean(this.enabled && this.hostRunning && status.registered === true && !status.error),
      registered: status.registered === true,
      accelerator: this.accelerator,
      pid: status.pid ?? this.child?.pid ?? null,
      hostRunning: this.hostRunning,
      lastTriggeredAt: status.lastTriggeredAt ?? null,
      lastCancelAt: this.lastCancelAt,
      error: status.error ?? '',
      startedAt: this.startedAt,
    }
  }

  async start() {
    if (this._starting) return this._starting
    this._starting = this.#start()
    try {
      return await this._starting
    } finally {
      this._starting = null
    }
  }

  async #start() {
    if (!this.enabled) {
      this.logger?.('hotkey disabled by config')
      return this.status
    }
    if (this.hostRunning) return this.status
    mkdirSync(dirname(this.signalFile), { recursive: true })
    mkdirSync(dirname(this.statusFile), { recursive: true })
    this.#stopStaleHost()
    // A stale status file must never make a failed/new registration look available.
    try {
      unlinkSync(this.statusFile)
    } catch {
      /* no stale status */
    }

    this.lastSignal = this.#readSignal()
    this.startedAt = nowIso()

    let child
    try {
      child = this.spawn(this.powershell, [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.script,
        '-SignalFile',
        this.signalFile,
        '-StatusFile',
        this.statusFile,
        '-LogFile',
        this.logFile,
        '-Accelerator',
        this.accelerator,
      ], {
        cwd: this.rootDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      this.logger?.(`hotkey spawn failed: ${summarizeError(error)}`)
      return this.status
    }
    this.child = child
    this.hostRunning = true
    let stderr = ''
    child.stderr?.on?.('data', (chunk) => {
      stderr = (stderr + String(chunk)).slice(-800)
    })
    child.once?.('error', (error) => {
      this.hostRunning = false
      this.logger?.(`hotkey host error: ${summarizeError(error)}`)
    })
    child.once?.('exit', (code, signal) => {
      this.hostRunning = false
      this.logger?.(`hotkey host exited code=${String(code)} signal=${String(signal)} stderr=${stderr.slice(-300)}`)
    })

    const deadline = Date.now() + this.startTimeoutMs
    while (Date.now() < deadline) {
      const status = readJson(this.statusFile)
      if (status && status.registered === true) {
        this.logger?.(`hotkey registered ${this.accelerator} pid=${String(status.pid ?? child.pid)}`)
        this.#startWatcher()
        return this.status
      }
      if (child.exitCode !== null && child.exitCode !== undefined) break
      await sleep(80)
    }
    const status = readJson(this.statusFile)
    this.logger?.(`hotkey registration unavailable: ${status?.error ?? 'no_status'} stderr=${stderr.slice(-200)}`)
    this.#startWatcher()
    return this.status
  }

  #startWatcher() {
    if (this.timer) return
    this.timer = setInterval(() => {
      try {
        const signal = this.#readSignal()
        if (!signal) return
        if (this.lastSignal && this.#sameSignal(signal, this.lastSignal)) return
        this.lastSignal = signal
        this.lastCancelAt = nowIso()
        this.logger?.(`hotkey trigger seq=${String(signal.seq ?? '')} at=${String(signal.at ?? '')}`)
        void Promise.resolve(this.onTrigger?.(signal)).catch((error) => {
          this.logger?.(`hotkey trigger handler failed: ${summarizeError(error)}`)
        })
      } catch (error) {
        this.logger?.(`hotkey watcher error: ${summarizeError(error)}`)
      }
    }, 120)
    this.timer.unref?.()
  }

  #readSignal() {
    if (!existsSync(this.signalFile)) return null
    const value = readJson(this.signalFile)
    if (!value || typeof value !== 'object') return null
    return value
  }

  #sameSignal(a, b) {
    if (a.seq !== undefined && b.seq !== undefined) return Number(a.seq) === Number(b.seq)
    return String(a.at ?? '') === String(b.at ?? '')
  }

  #stopStaleHost() {
    if (!existsSync(this.statusFile)) return
    const old = readJson(this.statusFile)
    const pid = Number(old?.pid)
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return
    try {
      process.kill(pid)
      this.logger?.(`stopped stale hotkey host pid=${pid}`)
    } catch {
      /* not running */
    }
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.child) {
      try {
        this.child.kill()
      } catch {
        /* already gone */
      }
      this.child = null
    }
    this.hostRunning = false
    // Let the host's finally block write registered=false; if it was force-killed, the status
    // may still say registered=true, so expose hostRunning=false and available=false. Also
    // rewrite a stale status so a later service boot cannot mistake it for a live binding.
    try {
      const old = readJson(this.statusFile)
      if (old) writeFileSync(this.statusFile, JSON.stringify({ ...old, registered: false, error: old.error || 'host_stopped' }, null, 2), 'utf8')
    } catch {
      /* best effort */
    }
  }

  /**
   * Force a stop as if the user pressed the hotkey. This is the same path used by the
   * front-end's manual stop button; it does not pretend the hotkey is registered.
   */
  manualTrigger(reason = 'USER_CANCELLED') {
    this.lastCancelAt = nowIso()
    return this.onTrigger?.({ source: 'api', reason, at: this.lastCancelAt, seq: Number(this.lastSignal?.seq ?? 0) + 1 })
  }
}

export { readJson, sleep }
