# Setup API Contract (v0)

**Status:** Phase 3 read-only host bridge and Core detector implemented (`OFFLINE`); **write operations are not implemented**.
**Scope:** first-run setup, read-only component status, and future controlled installation.

The browser is not allowed to run shell commands, download arbitrary URLs or write system
configuration directly. All real operations must go through Whale Voice Core.

## 0. Implemented read-only endpoints

The DSH Host row (`index.js`) registers these same-origin, token-protected loopback endpoints:

```text
GET /whale-voice/setup/health
GET /whale-voice/setup/status
GET /whale-voice/setup/detect?component=wechatagent|sender|qwen
```

The host injects `window.__WHALE_SETUP__` with a per-process token kept in a closure. The route
rejects non-loopback Hosts, cross-site requests, mismatched Origin, missing/wrong
`x-whale-core-token`, non-GET methods and arbitrary component names. If the host service is absent
or the bridge is not injected, the UI remains in the No-Core state.

Configuration comes only from the Core config file or environment:

```text
%DSH_HOME%\whale-voice\core.json
  wechatAgentRoot, voiceSenderRoot, qwenUrl

WHALE_WECHATAGENT_HOME
WHALE_VOICE_SENDER_HOME
WHALE_VOICE_QWEN_URL
```

There is no disk-wide search and no path/URL supplied by the browser.

---

## 1. Frontend bridge

The current client reads the trusted host bridge:

```js
window.__WHALE_SETUP__ = {
  getStatus(): Promise<SetupStatus>,
  detect(component): Promise<ComponentStatus>
}
```

The frontend uses `getStatus()`; `detect()` is available for the future per-component action. If the
bridge is absent, invalid, slow or returns the wrong schema, the wizard shows a failure state and
does not claim completion. Write methods remain future work behind authentication and request
validation.

### SetupStatus shape (v0)

```json
{
  "schemaVersion": 1,
  "completed": false,
  "completedReason": "installation_and_preview_not_implemented",
  "core": { "version": "0.1.0", "mode": "read-only" },
  "voiceEnabled": null,
  "voiceStateSource": "not_read",
  "environment": { "windows": true, "architecture": "x64", "node": "v22.x" },
  "wechatAgent": {
    "state": "auth_required",
    "installed": true, "version": "0.3.9", "installPath": "D:\\...",
    "wechatVersion": "4.1.10.27", "wechatVersionSource": "config_expected",
    "wechatVersionVerified": false,
    "processRunning": true, "connected": false, "accountVerified": null,
    "reader": "running", "bridge": "auth_required", "dsh": "unknown",
    "compatibility": "compatible",
    "observedAt": "2026-10-24T02:34:21.749Z", "durationMs": 12,
    "evidence": "package.json v0.3.9 + runtime pids=3 + GET /WeChatAgent/health -> 401"
  },
  "sender": {
    "state": "auth_required", "installed": true, "version": "0.1.0",
    "health": "auth_required", "healthState": "auth_required", "healthStatus": 401,
    "healthReachable": true, "healthy": null,
    "processRunning": true, "powershell": null, "dotnet": null, "node": null,
    "vbCable": null, "capture": null, "queue": null, "recoveryPending": null,
    "observedAt": "2026-10-24T02:34:21.772Z", "durationMs": 8,
    "evidence": "service/package.json v0.1.0 + pid alive + GET /health -> 401"
  },
  "tts": {
    "configured": false, "provider": "qwen-local",
    "available": ["qwen-local"], "model": "Qwen3-TTS-12Hz-1.7B-Base", "voice": "whale-v1",
    "preview": { "ok": false, "reason": "not_run_in_readonly_phase" },
    "state": "ok", "observedAt": "2026-10-24T02:34:21.782Z"
  },
  "observedAt": "2026-10-24T02:34:21.782Z",
  "durationMs": 34,
  "evidence": "WeChatAgent 401 + Voice Sender 401 + Qwen 200"
}
```

Health endpoints requiring a token are reported as `auth_required`; Whale Voice does **not** read
Hook/Sender token files to turn that into a green status. `connected` is true only for a validated,
ready health response. Version strings marked `config_expected` are not runtime proof.

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

A component can be `INSTALLED` while WeChat voice is disabled. The read-only phase does not read or
write the `voice.enabled` switch; it reports `voiceEnabled: null` when unknown. A future Core must
expose the effective state separately, and enabling voice remains a separate authorization flow.

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

`index.js` + `core/detect.mjs` implement the read-only host route, token-protected bridge,
WeChatAgent/Sender/Qwen detection, timeout, stale-generation marking and open-when-NotFound health
semantics. `core/server.mjs` is an isolated test server with the same contract.

Write methods, installation, component control, TTS credentials and preview remain absent. Phase 3
therefore reports `OFFLINE`/read-only evidence, not `INTEGRATED` installation or `PRODUCTION READY`.

The host route is implemented in source but the running DSH process must reload the Host plugin or
restart to activate the new row. The current process predates `index.js` and returns 404; a
client/page refresh is not sufficient. No host reload or DSH restart was performed.
