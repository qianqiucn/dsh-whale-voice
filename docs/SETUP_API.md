# Setup API Contract (v0)

**Status:** Phase 3 read-only host bridge and Phase 4A config API are `INTEGRATED`; Phase 4B-1 adds an **isolated, test-only** single-file config store/API; Phase 4B-2B-2a adds **read-only** capability/status routes and is `INTEGRATED` after real DSH Host/GUI acceptance. The settings-draft routes (generation-storage and qwen-runtime `GET`/`PUT`/`POST …/apply`) and the generation routes listed in §0 exist and are wired. The settings-draft routes write only the isolated settings-draft files under a configured draft root; the generation routes separately write the isolated task directory and artifact store under the configured generation storage location (see §1). The 182 adoption route is the one formal production settings write: it stores an already-installed WeChatAgent root in Whale Voice's own core config only (see §0); it never touches WeChatAgent config or starts/logs in to anything. All generation/result/download and adoption evidence is `OFFLINE / ISOLATED` (Fixture worker/directories, no real model or real WeChatAgent run). Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE` tests. TTS-A adds a provider-neutral design only; the `tts` shape here remains the Qwen reference path.
**Scope:** first-run setup, read-only component status, isolated settings drafts and the isolated generation call surface; future controlled installation remains out of scope.

The browser is not allowed to run shell commands, download arbitrary URLs or write system
configuration directly. All real operations must go through Whale Voice Core.

## 0. Implemented endpoints

The DSH Host row (`index.js`) registers these same-origin, token-protected loopback endpoints:

```text
GET /whale-voice/setup/health
GET /whale-voice/setup/status
GET /whale-voice/setup/detect?component=wechatagent|sender|qwen
GET /whale-voice/setup/config
GET /whale-voice/setup/config/sources
GET /whale-voice/setup/config/status
GET /whale-voice/setup/capabilities
GET /whale-voice/setup/capabilities/status
GET  /whale-voice/setup/generation/catalog
POST /whale-voice/setup/generation
GET  /whale-voice/setup/generation/status?taskId=...
GET  /whale-voice/setup/generation/results
GET  /whale-voice/setup/generation/download?taskId=...
GET  /whale-voice/setup/generation/assembly
POST /whale-voice/setup/wechatagent/adopt
POST /whale-voice/setup/generation/delivery
GET  /whale-voice/setup/generation/delivery?taskId=...&targetId=...
GET  /whale-voice/setup/settings/generation-storage
PUT  /whale-voice/setup/settings/generation-storage
POST /whale-voice/setup/settings/generation-storage/apply
GET  /whale-voice/setup/settings/qwen-runtime
PUT  /whale-voice/setup/settings/qwen-runtime
POST /whale-voice/setup/settings/qwen-runtime/apply
```

The generation routes are the formal Host call surface for the 135 Core entry
(`core/preset-generation-app.mjs`, `OFFLINE / ISOLATED`). They use the same loopback/Origin/
connection/token guard; only `/generation` accepts `POST` (JSON `{text, voiceId, language}`), the
catalog/status/results/download/assembly routes stay GET-only, and the settings draft routes accept
only their declared `GET`/`PUT`/`POST` methods. The handler runs the generation runtime only when the
formal assembly supplies an already-opened `openPresetGenerationApp` value as
`installHostBridge(..., {generation})` — the formal plugin `apply()` does that when the serializable
config has `generation.enabled === true`; without it every generation route returns
`503 {ok:false,error:'generation_not_enabled'}` and nothing is generated. `/generation/assembly`
reports the real state (`READY` / `DISABLED` / `FAILED` with `code`/`messageZh`) and needs no
generation object. The settings draft routes write only the isolated draft/applied files under the
configured draft root (`503` without that store); a `PUT`/`POST` never writes production config.
Responses carry the Core envelope (`ok`, `taskId`, `artifactRef`, `sha256`, or an `ok:false` code);
generation results are isolated Fixture results, not real-model output. No new listener and no
authentication change.

The 182 adoption route is the one formal settings write:
`POST /whale-voice/setup/wechatagent/adopt` (JSON `{root}`). The root must be an existing supported
WeChatAgent install (`app/resources/project/package.json`); it is written only into Whale Voice's own
core config (`%DSH_HOME%/whale-voice/core.json`, field `wechatAgentRoot`), preserving unrelated
fields. The response reports the saved root, the root detection actually uses, its source
(`config` / `environment` / `none`) and the install's declared data location (`app/storage.ini`
`[Storage] dataHome=`, otherwise the documented sibling `data` fallback). `WHALE_WECHATAGENT_HOME`
keeps precedence: when it overrides the saved value the response has `applied:false` and the UI shows
both values without touching the environment. Invalid input or an unsupported install is `400` with a
Chinese `messageZh`; a config read/write failure is `500` and leaves the file untouched. The route
never writes WeChatAgent-owned config, never reads Hook tokens or consoles and never installs, starts,
logs in or authenticates. If the reply is lost (timeout, connection reset or an unreadable reply body)
the bridge answers `{ok:false,error:'adoption_unconfirmed'}`; the page shows 「结果未确认」 (neither
"saved" nor "not saved") and the existing re-detect reads the persisted adoption without re-submitting.
`/status` also carries `wechatAgent.adoption` (saved/effective/source/applied, masked paths) so the
first-run wizard and the component manager read the same facts.

The 180 delivery surface is one path with two declared methods: `POST /generation/delivery` with
`{taskId, targetId}` confirms one saved result, and `GET /generation/delivery?taskId=...&targetId=...`
is a read-only status query that never confirms or submits. Both use the same
loopback/Origin/connection/token guard and accept only the original task and the explicitly confirmed
target — never a storage path, artifact fact or rights fact. When no generation object is supplied the
route answers `503 {ok:false,error:'generation_not_enabled'}`; when the supplied application has no
delivery wiring it answers `503 {ok:false,code:'PRESET_GENERATION_DELIVERY_UNAVAILABLE'}` and never falls
back to a Fake capability. A Core refusal is `200` with `ok:false` and its code/stage/cause (HTTP 200
never means the delivery was accepted); malformed JSON is `400 invalid_body`, a missing task/target is
`400 invalid_request`, and a non-declared method is `405`. `POST` returning `outcome:"ACCEPTED"` is the
isolated Fake acceptance with a fixture receipt (`backendState:"QUEUED"`, `realOperationAllowed:false`),
not a real send; a request that ends without an answer — including a timeout that fires while the reply
body is being read (180 v1.1) — is only unconfirmed, and the persisted delivery stays queryable through
`GET`.

The host injects `window.__WHALE_SETUP__` with a per-process token kept in a closure. The route
rejects non-loopback Hosts, cross-site requests, mismatched Origin, missing/wrong
`x-whale-core-token`, a method other than the route's declared methods (generation POST only where
declared) and arbitrary component names. If the host service is absent or the bridge is not injected,
the UI remains in the No-Core state.

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
  getCapabilities(): Promise<CapabilitySnapshot>,
  getCapabilityStatus(): Promise<CapabilityStatus>,
  adoptWechatAgent({root}): Promise<AdoptionResult>,
  getGenerationCatalog(): Promise<GenerationCatalog>,
  generatePreset({text, voiceId, language}): Promise<GenerationResult>,
  getGenerationStatus(taskId): Promise<GenerationStatus>,
  getGenerationResults(): Promise<GenerationResults>,
  downloadGenerationResult(taskId): Promise<GenerationDownload>,
  getGenerationAssemblyStatus(): Promise<GenerationAssembly>,
  confirmSavedResultDelivery({taskId, targetId}): Promise<DeliveryResult>,
  getSavedResultDeliveryStatus(taskId, targetId): Promise<DeliveryResult>,
  getGenerationStorageDraft(): Promise<SettingsDraftPayload>,
  saveGenerationStorageDraft({generationStorageRoot}): Promise<SettingsDraftPayload>,
  applyGenerationStorageDraft(): Promise<SettingsDraftPayload>,
  getQwenRuntimeDraft(): Promise<RuntimeDraftPayload>,
  saveQwenRuntimeDraft({modelDirectory, pythonPath}): Promise<RuntimeDraftPayload>,
  applyQwenRuntimeDraft(): Promise<RuntimeDraftPayload>,
  detect(component): Promise<ComponentStatus>
}
```

`getCapabilities` / `getCapabilityStatus` are read-only schema-v3 projections; see
[CAPABILITY_API.md](CAPABILITY_API.md). They never expose paths, Tokens, whitelist names or target
maps and never enable a write control.

The generation methods call the 136 Host routes with the same per-process token and same-origin
rules. `generatePreset` posts `{text, voiceId, language}` to `/whale-voice/setup/generation` and
returns the Core envelope (`ok`, `taskId`, `artifactRef`, `sha256`, …); `getGenerationStatus(taskId)`
queries the returned task; `getGenerationResults()` lists the saved results of the current storage
location; `downloadGenerationResult(taskId)` returns the saved WAV bytes as a blob for the original
task; `getGenerationAssemblyStatus()` reports `READY` / `DISABLED` / `FAILED` with the real reason.
When no runtime is configured the Host answers `503 {ok:false,error:'generation_not_enabled'}`, and the
bridge returns that JSON envelope rather than throwing, so the page can show "生成未启用". The
音色中心 page uses these methods, queries the returned Task ID, and remembers that ID locally so a
reload re-queries the same saved result; the results remain `OFFLINE / ISOLATED` Fixture output, not
real-model generation.

The settings-draft methods call the draft/applied routes in §0. `saveGenerationStorageDraft` /
`saveQwenRuntimeDraft` only write the isolated draft files; `applyGenerationStorageDraft` /
`applyQwenRuntimeDraft` record the applied fact used on the next plugin open — they do not switch the
current runtime, start a Worker/model or write production config. Their payloads carry `applied` /
`appliedError` where applicable.

The frontend uses `getStatus()`; `detect()` is available for the future per-component action. If the
bridge is absent, invalid, slow or returns the wrong schema, the wizard shows a failure state and
does not claim completion. Among the configuration interfaces, the settings-draft saves above are the
only write methods that exist today; they write only the isolated draft/applied files under the
configured draft root and keep the same per-process token/same-origin guard. The generation interfaces
also write, separately from configuration: `POST /whale-voice/setup/generation` reserves a task record
in the isolated task catalog (`catalog.reserve`), imports the provider bytes into the isolated artifact
library (`artifacts.import`) and, on success, records the original task's SAVED state
(`saveArtifact`). A request that is rejected or fails may already have reserved its task record (and,
if the save step fails, an artifact), so this document does not claim that a failed generation has no
side effects. Other write methods (installation, production configuration) remain future work behind
authentication and request validation.

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

> **TTS-A note:** the `tts` object above is the current Qwen reference path, not a product default and
> not a provider-neutral contract. Provider/voice/model identity, cloud/custom providers, credential
> references and per-provider health are a TTS-B/C design; see
> [TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md). No provider request, credential entry
> or real TTS is exposed by this API in TTS-A.

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
semantics. `core/server.mjs` is an isolated test server with the same contract. `core/capabilities.mjs`
adds the read-only capability projection behind `/capabilities`; see
[CAPABILITY_API.md](CAPABILITY_API.md).

Production write methods, installation, component control, TTS credentials and preview remain absent.
Phase 3/4A therefore report `OFFLINE`/read-only evidence, not `INTEGRATED` installation or
`PRODUCTION READY`. Phase 4B-1's isolated store is also `OFFLINE`; no production configuration is
modified.

The Host route was activated in the earlier Phase 3B/4A integration after a normal DSH restart. This
Phase 4B-1 documentation/implementation task did not reload DSH, add a production write route or
restart any service.
