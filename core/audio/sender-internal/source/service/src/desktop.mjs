import { execFile } from 'node:child_process'

/**
 * Probes the Windows interactive desktop / session state by running `desktop-guard.ps1`
 * (which calls the SessionGuard C# helper).
 *
 * Fail-closed: any spawn failure, timeout, non-zero exit or unparsable output is reported as
 * `ok:false`, and callers must refuse to start a UI task in that case.
 */
export function createDesktopProbe({ scriptPath, execFileImpl = execFile, timeoutMs = 8000, powershell = 'powershell.exe' }) {
  return function probe() {
    return new Promise((resolve) => {
      const done = (value) => resolve({ checkedAt: new Date().toISOString(), ...value })
      try {
        execFileImpl(
          powershell,
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
          { timeout: timeoutMs, windowsHide: true },
          (err, stdout) => {
            if (err) return done({ ok: false, reason: `probe_exec_failed:${err.killed ? 'timeout' : err.code ?? 'error'}`, raw: '' })
            const lines = String(stdout ?? '')
              .trim()
              .split(/\r?\n/)
              .filter(Boolean)
            try {
              const parsed = JSON.parse(lines[lines.length - 1] ?? '{}')
              return done({
                ok: parsed.ok === true,
                reason: parsed.reason ?? '',
                raw: parsed.raw ?? '',
                session: parsed.session ?? '',
                desktop: parsed.desktop ?? '',
                state: parsed.state ?? '',
                checkedAt: parsed.checkedAt ?? new Date().toISOString(),
              })
            } catch {
              return done({ ok: false, reason: 'probe_parse_failed', raw: lines.join(' ') })
            }
          },
        )
      } catch (err) {
        return done({ ok: false, reason: `probe_spawn_failed:${err?.message ?? 'unknown'}`, raw: '' })
      }
    })
  }
}
