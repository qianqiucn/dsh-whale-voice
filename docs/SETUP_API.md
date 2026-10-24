# Setup API Contract (v0)

**Status:** design + frontend integration point; **Core and write operations are not implemented**.
**Scope:** first-run setup, read-only component status, and future controlled installation.

The browser is not allowed to run shell commands, download arbitrary URLs or write system
configuration directly. All real operations must go through Whale Voice Core.

---

## 1. Frontend bridge

The current client discovers an optional host bridge:

```js
window.__WHALE_SETUP__ = {
  getStatus(): Promise<SetupStatus>
}
```

The frontend only calls `getStatus()`. If the bridge is absent, the wizard shows
`core_not_connected` and does not claim completion. A future Core may add the write methods below
behind authentication and request validation.

### SetupStatus shape (v0)

```json
{
  "schemaVersion": 1,
  "completed": false,
  "core": { "version": "0.1.0", "mode": "real" },
  "environment": {
    "windows": true, "architecture": "x64",
    "powershell": true, "dotnet": true, "node": true
  },
  "wechatAgent": {
    "state": "connected",
    "installed": true, "version": "0.3.9", "wechatVersion": "4.1.10.27",
    "processRunning": true, "connected": true, "accountVerified": true,
    "reader": "ok", "bridge": "ok", "dsh": "ok",
    "compatibility": "compatible"
  },
  "sender": {
    "state": "installed", "installed": true, "version": "0.1.0",
    "health": "healthy", "powershell": true, "dotnet": true, "node": true,
    "vbCable": true, "capture": "VB-Audio Virtual Cable",
    "queue": 0, "recoveryPending": false
  },
  "tts": {
    "configured": false, "provider": null,
    "available": ["qwen-local", "cloud", "custom"],
    "preview": { "ok": false, "reason": "not_configured" }
  },
  "setup": { "taskId": null, "state": "NOT_INSTALLED", "progress": 0 },
  "diagnostic": { "canSend": false, "pendingRecovery": false }
}
```

`completed` is authoritative only when produced by Core from real checks. It must never be derived
only from a browser flag, LocalStorage, file existence, or a Mock screen.

## 2. Component states

| State | Meaning |
|---|---|
| `NOT_INSTALLED` | no compatible installation found |
| `DETECTING` | read-only detection running |
| `READY_TO_INSTALL` | preflight passed; no task started |
| `DOWNLOADING` | trusted artifact fetch in progress |
| `VERIFYING` | integrity/signature verification |
| `INSTALLING` | deployment in progress |
| `CONFIGURING` | safe defaults and Core/Adapter wiring |
| `VALIDATING` | health/dependency/functional validation |
| `INSTALLED` | installed and validated; **not** the same as voice enabled |
| `NEEDS_REPAIR` | installation exists but validation failed |
| `FAILED` | terminal failure; no automatic retry |
| `CANCELLED` | user cancellation; restore/cleanup must be reported |

A component can be `INSTALLED` while WeChat voice is still disabled. `voice.enabled` remains `false`
until a separate explicit authorization/target flow.

## 3. Future write methods

```text
detect({ component }) -> { requestId, status }
createInstallPlan({ component, version? }) -> { planId, steps[], source, requiresConfirmation }
startInstall({ planId, confirmationToken }) -> { taskId, state }
getTask({ taskId }) -> { state, progress, logsRedacted[], recoverable, errorCode }
cancelTask({ taskId }) -> { accepted, state }
repair({ component, confirmationToken }) -> { taskId }
update({ component, version, confirmationToken }) -> { taskId }
uninstall({ component, confirmationToken }) -> { taskId }
```

Every write requires:

- authentication and origin checks (loopback-only by default);
- a unique task/request ID and idempotency key;
- one active install task at a time;
- explicit user confirmation before write/elevation;
- no arbitrary URL, command, path or script from the request;
- trusted artifact allow-list + checksum/signature verification;
- timeout, cancel, rollback and cleanup reporting;
- redacted logs that never contain credentials, chat content or private paths beyond safe labels.

## 4. Error codes

`core_not_connected`, `core_invalid_response`, `unsupported_platform`, `unsupported_version`,
`wechatagent_missing`, `wechatagent_incompatible`, `bridge_unavailable`,
`sender_missing`, `sender_unhealthy`, `vb_cable_missing`, `tts_not_configured`,
`tts_auth_failed`, `audio_format_invalid`, `permission_denied`, `conflict`,
`task_timeout`, `cancelled`, `rollback_failed`.

Errors must not include secrets or raw private chat data.

## 5. Security rules

- No shell execution from the browser.
- No installation from an arbitrary user-supplied URL.
- No silent elevation; show the exact operation, target directory and rollback plan first.
- No automatic WeChatAgent upgrade.
- No driver removal/installation without separate confirmation.
- No real WeChat send as part of setup or diagnostics.
- No API key in LocalStorage, logs, diagnostics or Git.
- The local API is not a general-purpose web endpoint; enforce authentication and origin checks.
- Setup completion and `voice.enabled` are separate states.

## 6. Current implementation

The frontend calls only `getStatus`; the write methods do not exist yet. Phase 2 therefore reports
`MOCK`/frontend completion, not `INTEGRATED` or `PRODUCTION READY`.
