# Setup API Contract (v0)

**Status:** Phase 3 read-only host bridge and Phase 4A config API are `INTEGRATED`; Phase 4B-1 adds an **isolated, test-only** single-file config store/API. No production write route exists. Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE` tests.
**Scope:** first-run setup, read-only component status, and future controlled installation.

The browser is not allowed to run shell commands, download arbitrary URLs or write system
configuration directly. All real operations must go through Whale Voice Core.

## 0. Implemented read-only endpoints

The DSH Host row (`index.js`) registers these same-origin, token-protected loopback endpoints:

```text
GET /whale-voice/setup/health
GET /whale-voice/setup/status
GET /whale-voice/setup/detect?component=wechatagent|sender|qwen
GET /whale-voice/setup/config
GET /whale-voice/setup/config/sources
GET /whale-voice/setup/config/status
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
  getConfig(): Promise<ConfigSnapshot>,
  getConfigSources(): Promise<ConfigSources>,
  getConfigStatus(): Promise<ConfigStatus>,
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

### ConfigSnapshot shape (v1 read-only)

```json
{
  "schemaVersion": 1,
  "observedAt": "2026-10-24T03:49:32.528Z",
  "readMode": "read-only",
  "configRevision": "17d122c5700fdd96",
  "application": {
    "savedRevision": "17d122c5700fdd96",
    "activeRevision": null,
    "state": "UNKNOWN",
    "saved": true,
    "activeConfirmed": false
  },
  "voice": {
    "enabled": false, "mode": "explicit", "forGroup": false,
    "autoProbability": 0, "defaultVoice": "whale-v1",
    "source": "voice-settings", "consistency": "not_comparable",
    "worker": { "source": "sender-worker", "enabled": true, "mode": "manual", "role": "final_safety_gate" },
    "active": { "confirmed": false, "enabled": null, "mode": null, "source": null }
  },
  "tts": {
    "provider": "qwen-local", "model": null, "voice": "whale-v1",
    "configured": true,
    "runtime": { "reachable": true, "state": "ok", "model": "Qwen3-TTS-12Hz-1.7B-Base", "voice": "whale-v1", "preview": false },
    "mismatch": null
  },
  "permissions": { "privateCount": 2, "groupCount": 1, "senderAllowedCount": 1, "detailAvailable": false },
  "sender": { "configAvailable": true, "serviceVersion": "0.1.0", "workerVersion": null, "serviceRunning": false, "healthReachable": false, "healthy": null, "recoveryPending": null, "serviceWorkerConsistency": "match" },
  "sources": [{ "id": "voice-settings", "available": true, "readable": true, "error": null, "sensitive": true, "exposed": false }]
}
```

`application.state` is `UNKNOWN` or `MISMATCH`; it is **not** `ACTIVE` without a supported runtime
config-version interface. `recoveryPending:null` means unknown. Permission details are never
returned; `detailAvailable:false` is intentional. See
[CONFIG_SOURCES.md](CONFIG_SOURCES.md) for authority and sensitive-field rules.

The config routes accept no path, URL, component or command from the browser. `GET /config` is the
only source of these values; `sources` and `status` are projections of the same snapshot.

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

### Phase 4B-1 isolated write infrastructure

`core/config-sandbox.mjs`, `core/config-store.mjs` and `core/config-schema.mjs` implement a
single-file sandboxed configuration store with a trusted test-sandbox capability, strict schema
validation, v0→v1 migration, a process-local HMAC revision, `expectedRevision` conflict detection,
atomic save/verification and read/write state separation. `core/isolated-write-server.mjs` provides a
test-only loopback API and is **not registered** by `index.js` or `core/server.mjs`.

This does not activate any production write method in the list above. It does not write
`%DSH_HOME%/whale-voice/core.json`, WeChatAgent, Bridge, Voice Sender or Qwen configuration. See
[CONFIG_WRITE_API.md](CONFIG_WRITE_API.md) for the schema, states, limits and security rules.

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
- A supplied Origin must match the complete `http` scheme, host and port of the Host header. The DSH
  same-origin GET may omit Origin; that path still requires loopback Host, `Sec-Fetch-Site`, the
  per-process token and the DSH connection guard. Missing authentication fails closed.
- Health/config HTTP reads use bounded streaming. A response without a streaming reader is rejected
  (`body_stream_unsupported`) rather than read with unbounded `response.text()`. Content-Length is
  not trusted as the sole limit.
- Setup completion and `voice.enabled` are separate states.

## 6. Current implementation

`index.js` + `core/detect.mjs` implement the read-only host route, token-protected bridge,
WeChatAgent/Sender/Qwen detection, timeout, stale-generation marking and open-when-NotFound health
semantics. `core/server.mjs` is an isolated test server with the same contract.

Production write methods, installation, component control, TTS credentials and preview remain absent.
Phase 3/4A therefore report `OFFLINE`/read-only evidence, not `INTEGRATED` installation or
`PRODUCTION READY`. Phase 4B-1's isolated store is also `OFFLINE`; no production configuration is
modified.

The Host route was activated in the earlier Phase 3B/4A integration after a normal DSH restart. This
Phase 4B-1 documentation/implementation task did not reload DSH, add a production write route or
restart any service.
