import { execFile } from 'node:child_process'
import { resolve } from 'node:path'

import { nowIso, summarizeError } from './util.mjs'

/**
 * Read-only WeChat status probe. It invokes a PowerShell script that only enumerates UIA /
 * Win32 state (no activation, no clicks, no typing) and returns a JSON snapshot.
 */
export class WeChatProbe {
  constructor({ rootDir, config, logger, execFileImpl = execFile }) {
    this.rootDir = rootDir
    this.config = config
    this.logger = logger
    this.execFile = execFileImpl
    this.script = resolve(rootDir, config.wechat?.statusScript ?? 'wechat-status.ps1')
    this.powershell = config.wechat?.powershell ?? config.sender?.powershell ?? 'powershell.exe'
    this.processPath = config.wechat?.processPath ?? ''
    this.timeoutMs = Number(config.wechat?.statusTimeoutMs ?? 8000)
    this.cached = null
    this.cachedAt = 0
    this.inFlight = null
  }

  async probe({ force = false, maxAgeMs = 1200 } = {}) {
    if (!force && this.cached && Date.now() - this.cachedAt <= maxAgeMs) return this.cached
    if (this.inFlight) return this.inFlight
    this.inFlight = this.#run()
    try {
      const value = await this.inFlight
      this.cached = value
      this.cachedAt = Date.now()
      return value
    } finally {
      this.inFlight = null
    }
  }

  #run() {
    return new Promise((resolvePromise) => {
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.script,
      ]
      if (this.processPath) args.push('-ExpectedProcessPath', this.processPath)
      this.execFile(this.powershell, args, { timeout: this.timeoutMs, windowsHide: true, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          this.logger?.(`wechat probe failed: ${summarizeError(err)} ${String(stderr ?? '').slice(-200)}`)
          resolvePromise({ ok: false, found: false, reason: 'probe_failed', checkedAt: nowIso(), error: summarizeError(err) })
          return
        }
        try {
          const value = JSON.parse(String(stdout ?? '').trim())
          resolvePromise({ ...value, checkedAt: nowIso() })
        } catch {
          this.logger?.(`wechat probe invalid json: ${String(stdout ?? '').slice(-200)}`)
          resolvePromise({ ok: false, found: false, reason: 'probe_invalid_json', checkedAt: nowIso() })
        }
      })
    })
  }

  snapshot() {
    if (this.cached) return this.cached
    return { ok: false, found: false, reason: 'not_probed_yet', checkedAt: null }
  }
}
