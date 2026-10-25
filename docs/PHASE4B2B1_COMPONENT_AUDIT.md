# Phase 4B-2B-1 — Real-component capability audit and safe-integration design

**Status:** `OFFLINE` — read-only audit and isolated prototype only. No production configuration write,
no production Host write route, no service start/stop/reload, no WeChat send.
**Deliverable PR:** #14 (`feature/phase4b2b1-component-audit`), open and not merged.
**Date:** 2026-10-25
**Repository baseline:** `main` at the merge of PR #13 (`e0ce035`).
**Scope:** Bridge, Voice Sender Service/Worker, WeChatAgent, Qwen observation and the existing
`core/config-coordinator.mjs`.

This document answers one question only: **which real interfaces may a future Phase 4B-2B write path
rely on, and which capabilities do not exist yet?** It deliberately does not add a second abstract
coordination protocol. The existing coordinator is adequate; the missing pieces are owner-side
interfaces and evidence.

> Paths below are logical component paths, not machine paths. Versions were read from the installed
> components on 2026-10-25 and must be re-verified before any later integration.

---

## 1. Verified component baseline

| Component | Version evidence | Runtime evidence (read-only) |
|---|---|---|
| Whale Voice repository | `main` `e0ce035` | This repository |
| WeChatAgent | `0.3.9` (`app/resources/project/package.json`) | Adapter `/status` ready on loopback; health endpoint reachable only with its own bearer token |
| WeChatAgent config schema | `version: 1` | `config/wechatagent.json`, validated by `project-config.mjs` |
| WeChat-Hook native | WeChat `4.1.10.27` required | Hook health reports `version: 4.1.10.27`; no config endpoint |
| Bridge (custom `qq-bridge`) | copied into the WeChatAgent workspace | `/status` on `127.0.0.1` adapter port; process running |
| Voice Sender Service | `0.1.0` (`service/package.json`) | Service not running during audit (no listener on its loopback port) |
| Voice Sender Worker | `config.json` schema v1 | Not running; spawned per job by the service |
| Qwen | `/health` model/voice observation | Listening on loopback; observation only, not an apply proof |

No token, Hook token, chat database, private target map, chat content or audio file was read for this
audit. Config files were inspected only for schema, read timing and writer information; private
values were redacted.

---

## 2. Capability matrix

| Source | Authority | Read timing (verified) | Supported write interface | Write atomicity | Revision / CAS | Loaded-revision evidence | 4B-2B-1 verdict |
|---|---|---|---|---|---|---|---|
| Bridge voice settings `state/voice-settings.json` | Bridge | **Every call** (`readVoiceConfig()` on each `config` access) | **None** — no writer exists in the component | Writer-dependent; no writer API | **None** | **None** | **READ-ONLY / WRITE-UNSUPPORTED** |
| Bridge runtime status | Bridge adapter | `GET /status` (loopback, no auth) | None | N/A | None | Runtime readiness only | **OBSERVATION** |
| Sender Service automation (`service.config.json` `automation`, hotkey) | Sender Service | Read once at service boot | **`PUT /v1/automation/config`** (bearer token, loopback, rejects while a task is active) | Full-file plain `writeFileSync` (**not** temp+rename) | **None** | `GET /v1/automation/config` returns the in-memory values (field equality only) | **PARTIAL WRITE / APPLY-UNCONFIRMED** |
| Sender Service TTS / port / limits | Sender Service | Read once at service boot | **None** (file edit is not a supported API; no reload) | N/A | None | `/health` returns loaded `tts.provider/baseUrl/voice` (field equality only) | **WRITE-UNSUPPORTED** |
| Sender Worker `config.json` (`voice_enabled`, device, silence, auto flags) | Sender Worker | **Every job process start** (script top level) | None | N/A | None | None | **READ-ONLY; NEVER WRITE** |
| Sender target map `service/targets.json` | Sender Service | Read once at boot | None | N/A | None | N/A | **NEVER READ OR WRITE** |
| WeChatAgent config `config/wechatagent.json` | WeChatAgent | Mixed: hot per event in the Hook adapter, per request in the reader, boot-time in derived `bridge-config.json` consumers | **Console `POST /api/config`** (loopback only, CSRF header, `body.revision` required); CLI `project-config.mjs`; account-switch writer | Console: temp+rename+backup. CLI: temp+rename. Account switch: temp+rename plus rollback | Console: SHA-256 of raw file, **only for console-vs-console** | **None**; `pendingApply` is a UI hint, not loaded evidence | **HUMAN-CONSOLE WRITE / INTEGRATION-UNSUPPORTED** |
| WeChatAgent health | Native Hook | On demand | None | N/A | None | Version/PID/account/startup state only | **OBSERVATION** |
| Core roots / Qwen URL `%DSH_HOME%/whale-voice/core.json` | Whale Voice Core | Host boot | None | N/A | None | None | **READ-ONLY** |
| Qwen `/health` | Qwen | On demand | None | N/A | None | Model/voice observation only | **OBSERVATION** |

Legend: `WRITE-UNSUPPORTED` means no component-owned write interface exists; editing the JSON file
is *not* treated as a supported interface.

---

## 3. Bridge findings

### 3.1 Read frequency and caching

`readVoiceConfig()` (`components/qq-bridge/src/core/voice-outbox.js`) reads and parses
`state/voice-settings.json` on **every** call. `VoiceOutbox#config` returns
`configOverride ?? readVoiceConfig()`, so production has no module-level cache. The Bridge intent
check reads the file per candidate message (`social-engine.js` `wantVoice()`), and `enqueue()` reads
it again for target resolution and token lookup.

Consequences:

- A valid external change is observed on the **next** voice decision; no restart is needed.
- There is no snapshot consistency inside one delivery: each read is independent. A change between
  the intent check and `resolveTarget()` can reject the task (`voice_disabled`,
  `target_not_allowed`) but cannot broaden permission.
- Invalid JSON or `enabled !== true` fails closed: the reader returns defaults with
  `configError: settings_unreadable` / `settings_disabled`, and `resolveTarget()` returns
  `voice_disabled` before any Sender HTTP request.

### 3.2 Writers and atomicity

No writer for `voice-settings.json` exists in the audited Bridge or WeChatAgent workspace. The only
atomic writer in the Bridge (`writeJsonAtomic`, temp + rename) is used for the dedupe file and the
one-shot test-session file, not for voice settings. The voice-settings file is therefore an
**unowned contract**: it can be edited by a human or by a future adapter, but the component provides
no write API, no lock and no revision.

### 3.3 Active revision and runtime confirmation

`GET /status` on the Bridge adapter port (`scripts/hook-onebot.mjs`) returns runtime readiness,
connection state, Hook version and counters. It does **not** expose voice settings, a config
revision or a loaded revision. There is no supported way to prove that the Bridge loaded a
particular saved value; the only evidence is behavioural (a subsequent voice decision) and that is
not a safe apply proof.

### 3.4 Relationship to the Worker permit

Bridge `enabled` is the user switch; Worker `voice_enabled` is an independent final-safety permit.
They are not comparable and must never be written as one value. A Bridge `false` blocks before the
Sender; a Worker `true` cannot override it; a Bridge `true` does not bypass the Worker gate.

**Verdict:** Bridge voice settings remain read-only for Core. A production write needs a
Bridge-owned endpoint (see §8.3), not a Core file write.

---

## 4. Voice Sender findings

### 4.1 Service read timing and hot update

`service/src/server.mjs` reads `service.config.json` **once at process boot** (line 22) and
`targets.json` once as well. There is no file watcher and no reload endpoint. A manual file edit is
invisible to the running service.

The one supported update path is `PUT /v1/automation/config`:

- allowed fields: `mode`, `autoFindWindow`, `autoOpenChat`, `autoRestoreMinimized`,
  `pauseWhenFullscreen`, `focusFailure`, `hotkeyAccelerator`;
- rejects with `409 active_task` while a task is queued or running;
- validates types/enums, re-checks the emergency-stop precondition for `auto`;
- updates the in-memory config, optionally re-registers the hotkey, then **rewrites the whole
  `service.config.json` with plain `writeFileSync`** (no temp+rename);
- returns the loaded automation values, but **no revision**.

The plain full-file rewrite is a concrete lost-update hazard: the running service persists its
boot-time copy plus the automation change. Any external edit to TTS/ports/limits made while the
service is running is overwritten by the next `PUT`, and is not loaded anyway.

### 4.2 Worker read timing

`voice-sender.ps1` reads `config.json` at the top of **each worker invocation** (line 48), picks
`voice_enabled` once (line 102) and rejects at line 268 before recording/sending. The worker is
spawned per job by the service, so a Worker permit change is observed by the **next** job — but an
already-running job is not re-checked and is not cancelled by that change. Emergency stop and
per-job cancellation are separate mechanisms.

The service passes its `allowedChats` to the worker as `voice_allowed_chats`; the worker intersects
it with its own `voice_allowed_chats` (both must allow). This defence-in-depth must be preserved.

### 4.3 Versions, queue and recovery

- No config-version endpoint. `/health` exposes loaded TTS/sender/automation values and runtime
  state, which permits **field-equality** checks but not revision proof.
- `PUT` is guarded against an active task, but a service restart during an active job is not safe:
  boot recovery marks in-flight jobs `UNKNOWN` and queued jobs `CANCELLED`, and never re-runs them.
- Changing `voice_enabled` while a job is in `RECORDING`/`SENDING` has no effect on that job.
- `targets.json` and `allowedChats` are the Sender's final allow-list authority and must not be
  exposed or rewritten by Core.

**Verdict:** automation is the only supported write today, and even that cannot be reported
`APPLIED` without a loaded revision. TTS/port changes require a service API extension or an
authorized restart, not a file edit.

---

## 5. WeChatAgent findings

### 5.1 Config management mechanism

`config/wechatagent.json` is schema version 1 and is validated by `project-config.mjs` (ports,
Hook loopback/version, whitelist numeric IDs, persona, wake mode, provider/model, feature policies).
The supported management paths are:

1. **Console API** (`scripts/console-server.mjs`, loopback only, default port 3210):
   - `GET /api/config` returns `{ config, revision }`, where `revision` is SHA-256 of the raw file
     plus `pendingApply` / `dshRestartRequired` from console state;
   - `POST /api/config` requires `body.revision`, rejects a stale revision with `409`, validates,
     backs up the old file, writes temp + rename with `0o600`, and marks `pendingApply` when a
     non-hot field changed;
   - CSRF token is issued by `GET /api/info` and required as `x-console-token`; Host and Origin are
     checked.
2. **CLI `project-config.mjs` / `manage.ps1 prepare`**: validates and derives
   `state/bridge-config.json`, `state/wechat-io-config.json` and the DSH Cordis patch. It writes
   temp + rename but **has no revision/CAS check**.
3. **Account switch** (`reader-account-state.mjs`): rewrites the whitelist/persona/feature chat
   mappings and restores files on failure. It has **no revision/CAS check**.

### 5.2 Read timing is mixed

- `hook-onebot.mjs` calls `reload()` before authorization checks and event handling; whitelist and
  policy changes are observed per event.
- `reader-api.py` re-reads the config per relevant request.
- Derived `bridge-config.json` / Cordis patch are consumed at DSH start; persona, ports and plugin
  settings need `prepare` plus a DSH restart.
- The native Hook health endpoint reports version/PID/account/startup state only.

So a whitelist change can be honoured by the Hook adapter immediately while another consumer still
uses boot-time state. There is **no shared revision or snapshot** across these processes.

### 5.3 Multi-process competition

At least three writers exist (console, CLI prepare, account switch). Only the console enforces
`expectedRevision`; the other two are last-writer-wins. Two console windows are safe against each
other, but a console save concurrent with `prepare` or an account switch can silently lose one
change. No file lock exists in any writer.

### 5.4 Apply confirmation

`pendingApply` is a console-side hint derived from which fields changed. It is not evidence that any
process loaded the new file. `GET /api/config` returns the **saved file** revision, not a loaded
revision. The health endpoint has no config revision. Therefore no trusted `loadedRevision` exists.

**Verdict:** Core must treat WeChatAgent permissions as read-only. Permission changes remain a human
console action, followed by the documented prepare/restart flow. Editing the JSON from Core and
assuming it applies is explicitly unsupported.

---

## 6. Core coordinator review

`core/config-coordinator.mjs` already provides the right shape for a minimal integration:

- writable sources are limited to `bridgeVoice` and `senderService`; `wechatPermissions`,
  `workerSafety`, `core`, `ttsProvider`, `targetMap` and `qwenRuntime` are read-only or never read;
- source adapter contract: `read() -> {document, revision: 32hex}`, `validateChange()`,
  `save() -> {revision, writeOutcome?}`, `rollback() -> {revision}`;
- `execute()` is hard-gated to `simulationOnly === true` — production adapters cannot run through it
  until a later phase deliberately changes that gate;
- `apply()` requires `loadedRevision === savedRevision` from a trusted runtime; a missing interface
  yields `NO_RUNTIME_CONFIRMATION` → `PENDING_APPLY`; a mismatch yields `UNKNOWN`;
- journal/recovery is metadata-only and never repeats a save or apply.

Gaps a production adapter must close:

1. **Source-specific revisions.** The coordinator needs a 32-hex opaque revision. No component
   provides one today. A file hash (truncated SHA-256) is a *saved-file* revision, not a loaded one;
   it is acceptable as `expectedRevision` only if the owner's write API is also guarded by it.
2. **Revision scope.** Phase 4A's HMAC covers allow-listed fields (good for privacy) but cannot be
   compared with a component's own revision. Adapters must declare their revision algorithm and
   scope; cross-algorithm equality must never be accepted.
3. **Confirmation semantics.** `APPLIED` requires an exact loaded revision. Field equality from
   `/health` or `GET /v1/automation/config` is weaker evidence and must stay `PENDING_APPLY`
   (optionally `SAVED_CONFIRMED_BY_FIELDS`) until the coordinator gains an explicit, separately
   named confirmation mode.
4. **Execution gate.** Phase 4B-2A's `simulationOnly` gate must remain until an explicit production
   mode is authorized; it is a safety feature, not a bug.

---

## 7. Authority, single-writer and coordination matrix

| Configuration | Authority / owner | Current writer(s) | Proposed single writer | Core role in 4B-2B | Cross-file? |
|---|---|---|---|---|---|
| `core.json` roots/URLs | Core Host | Operator (manual); Host reads at boot | Core Host operator | Read-only | No |
| Bridge `voice-settings.json` | Bridge | **None** (manual/external) | Bridge-owned write API (to be added) | Read-only; orchestrate only via owner API later | No |
| Sender `service.config.json` automation | Sender Service | Sender Service (`PUT`) | Sender Service | Use `PUT` only; never file write | No |
| Sender `service.config.json` TTS/ports | Sender Service | Sender Service (boot only) | Sender Service (needs API) | Read-only until API exists | Qwen observation, not a write |
| Sender Worker `config.json` | Sender Worker | Operator (manual) | Sender Worker | **Never write** | No |
| WeChatAgent `wechatagent.json` | WeChatAgent Console | Console (CAS), CLI prepare (no CAS), account switch (no CAS) | WeChatAgent Console | Read-only; human console action | `bridge-config.json`, Cordis patch are derived by owner |
| Sender `targets.json` | Sender Service | Operator | Sender Service | **Never read/write** | No |
| Qwen runtime | Qwen | N/A | N/A | Observation only | No |

**Which changes truly need cross-file coordination?** None of the writable sources needs an atomic
multi-file transaction:

- Bridge voice settings are one file, owned by the Bridge.
- Sender automation is one file, owned by the Sender service.
- WeChatAgent derived files are generated by its own `prepare`; Core must not participate.
- Bridge `enabled` and Worker `voice_enabled` are independent safety layers and must **not** be
  coordinated as one value.

A coordinator plan may span sources for UX and auditability, but it must report per-source save and
apply state, and a partial failure must stay `PARTIALLY_APPLIED`/`UNKNOWN`; it must never imply a
global transaction.

**Where does the single writer belong?** With the component that owns the file. Core is a
coordinator and journal owner, not a file writer. The only exception would be a deliberately
designated Core writer for the Bridge file, which requires the Bridge owner's agreement, a lock and
a restricted recovery store; it is not part of the minimal plan.

---

## 8. Windows cross-process locking / CAS

### 8.1 Why a lock alone is not the plan

An advisory file lock cannot stop a non-cooperating writer (the console, `prepare`, an account
switch, a human editor, antivirus). It only serializes cooperating adapters. The primary defence
must therefore be the owning component's API with optimistic concurrency. A lock is a secondary
measure for a file contract that has no owner API.

### 8.2 Measured Windows primitives (local probe, 2026-10-25)

| Primitive | Result |
|---|---|
| `fs.openSync(path, 'wx', 0o600)` | Creates exclusively |
| Second `wx` create while the file exists | `EEXIST` |
| `process.kill(pid, 0)` for a live process | succeeds |
| `process.kill(pid, 0)` for a dead PID | `ESRCH` |
| `fs.renameSync(temp, target)` over an existing file | succeeds (atomic replace on the same volume) |

These make a cooperative lock + CAS feasible without a native dependency. They do **not** make it
mandatory or sufficient.

### 8.3 Recommended lock/CAS scheme (only if Core must write a file)

1. Acquire `<state>/locks/<source>.lock` with `open('wx')`; write owner metadata
   `{v:1, pid, startedAt, host, token}`; hold for the read-verify-write window only.
2. On `EEXIST`, read the owner. Treat the lock as stale only when the heartbeat/age exceeds a
   conservative threshold **and** the PID is not alive; steal by renaming the stale lock to a unique
   name (one stealer wins), then create a fresh lock.
3. Under the lock: read the source, compare `expectedRevision`, recompute immediately before the
   write, write temp + best-effort `fsync`, rename, re-read and return the observed revision.
4. Release only if the token matches. Never release a lock owned by another token.
5. Keep a restricted pre-image only if the source owner provides no rollback. Store it outside the
   repository, `0o600`-equivalent ACL, size-bounded, and delete it after a confirmed transaction.

Limits to document in the adapter: advisory only; PID reuse; stale-lock takeover windows;
`EPERM`/`EACCES` from antivirus/EDR; no cross-host locking; no claim of power-loss atomicity; no
protection against a non-cooperating writer between the final re-read and the rename.

### 8.4 Rejected alternatives

- **Named mutex via a PowerShell child process**: extra process lifecycle, inheritance and failure
  modes, and no benefit over an owner API.
- **Native `LockFileEx` addon**: ABI/Node-version and supply-chain cost for a boundary that should be
  owned by the component anyway.
- **npm lockfile dependency**: not needed; adds a dependency the project does not currently carry.

---

## 9. Minimal safe integration architecture

```text
DSH UI (read-only status first)
   │  token-protected Host route
   ▼
Whale Voice Core coordination API
   ├─ capability/status projection (no secrets, no paths)
   ├─ plan / journal / per-source state (existing coordinator)
   └─ source adapters (owner APIs only)
        ├─ Bridge status adapter        GET /status (read-only)
        ├─ Sender service adapter       GET /health, GET/PUT /v1/automation/config
        ├─ WeChatAgent adapter          health only; config read allow-list
        └─ Qwen observation             GET /health
```

Principles:

1. **No direct production file writes in Phase 4B-2B-2.** Every write goes through an owner API.
2. **No `APPLIED` without an exact loaded revision.** Field equality, health, PID, mtime and equal
   bytes are not enough.
3. **Bridge and Worker remain independent.** Never write `voice_enabled`; never merge the two.
4. **WeChatAgent permissions remain human-console only.** Core does not expand them.
5. **TTS/port changes require an owner API or an authorized restart**, not a file edit.
6. **Every save is revision-guarded** where the owner supports it; otherwise the write stays
   unsupported.

### 9.1 Proposed increments

- **4B-2B-2a (read-only):** capability + status projection and an isolated frontend view. No write
  control is enabled; blocked sources show their exact blocker. This is the recommended next step.
- **4B-2B-2b (one supported write):** Sender automation through `PUT /v1/automation/config`, with
  explicit confirmation and `SAVED_CONFIRMED_BY_FIELDS` / `PENDING_APPLY` semantics. Requires a
  separate production-write authorization.
- **4B-2B-2c (after owner changes):** Bridge and Sender revision endpoints; then Bridge voice and
  TTS writes can be planned with `APPLIED` semantics.

### 9.2 Minimal owner-side changes that unlock writes

| Owner | Minimal change | Unlocks |
|---|---|---|
| Bridge | `GET /voice/config` returning a loaded revision + allow-listed values; optional `POST /voice/config` with `If-Match` | Bridge `voice-settings` write and `APPLIED` |
| Sender Service | `configRevision` in `/health` or `GET /v1/config`; optional `PUT /v1/tts/config` | TTS/voice write and `APPLIED` |
| WeChatAgent | Read-only loaded-config revision on the adapter `/status` (no permission expansion) | Better status; permissions still human-only |

None of these owner changes is authorized or implemented in Phase 4B-2B-1.

---

## 10. Phase 4B-2B-2 frontend interface proposal (isolated)

Read-only contract first; no write endpoint on the production Host in 2B-2a.

```json
GET /whale-voice/config/capabilities
{
  "schemaVersion": 1,
  "observedAt": "2026-10-25T00:00:00.000Z",
  "sources": [
    {
      "source": "senderService",
      "authority": "Voice Sender Service",
      "writable": false,
      "writeApi": "PUT /v1/automation/config",
      "readTiming": "service-boot",
      "revision": { "kind": "file-sha256", "scope": "saved", "available": true },
      "loadedConfirmation": false,
      "requiresRestart": true,
      "risk": "HIGH",
      "blockers": [{ "code": "NO_LOADED_REVISION", "message": "生效未确认" }]
    }
  ],
  "summary": { "writableNow": [], "readOnly": ["bridgeVoice", "wechatPermissions"], "blocked": ["senderService"] }
}
```

Status projection per source:

```json
{
  "source": "senderService",
  "savedRevision": "<32hex>",
  "activeRevision": null,
  "activeConfirmed": false,
  "applyState": "PENDING_APPLY",
  "evidence": { "kind": "none", "observedAt": "..." }
}
```

UI rules for 4B-2B-2:

- A write control exists only when `writable === true` **and** the owner API is implemented and
  authorized; otherwise render a disabled control with the exact blocker.
- Show `已保存，生效未确认` (`SAVED`/`PENDING_APPLY`) and `未知` (`UNKNOWN`); never show `已生效`
  without an exact loaded revision.
- Never render `null` as off/disabled/safe.
- Never show paths, tokens, target IDs, whitelist names or raw config documents.
- A plan preview may list source, field names, risk, restart requirement and blockers; it is not a
  save and not permission to enable voice.
- If a component is unreachable, show `No-Core`/unknown for that source, not a stale success.

---

## 11. Blockers and risks

| ID | Blocker / risk | Severity | Effect | Required action |
|---|---|---|---|---|
| B1 | Bridge has no write API | **Critical** | Bridge voice settings cannot be written by Core | Bridge owner endpoint; until then read-only |
| B2 | No component returns a loaded config revision | **High** | No source can honestly reach `APPLIED` | Owner revision endpoints; otherwise `PENDING_APPLY` |
| B3 | Sender TTS/port has no update API and boot-only read | **High** | TTS change requires restart or file edit (unsupported) | Sender API extension or authorized restart |
| B4 | WeChatAgent has no integration API; console is a human UI with CSRF; three writers without a shared CAS | **High** | Permission writes cannot be automated safely | Keep read-only; console flow; future prepared endpoint |
| B5 | Worker `voice_enabled` sampled once per job | **Medium** | Disabling the permit does not stop an active job | Emergency stop/cancel path; document |
| B6 | Sender `PUT` rewrites the full file with plain `writeFileSync` | **Medium** | External edits are lost; partial write on crash | Use only when service is the sole writer; prefer owner fix |
| B7 | Mixed hot/boot readers in WeChatAgent | **Medium** | Transient inconsistent authorization across processes | Owner-provided snapshot/revision; avoid mid-flight changes |
| B8 | No cross-process lock in any component | **Medium** | Console-vs-prepare lost updates | Owner API; advisory lock only if Core writes |
| B9 | Windows lock/AV behavior not validated under EDR | **Medium** | `EPERM`/stale lock | Test on the target machine before enabling writes |
| B10 | 0 human reviews on #9–#13 | **Medium** | CI green is not approval | Human review before production write |
| B11 | Phase 4B-2A `simulationOnly` gate | **Low** | Production adapters cannot execute yet | Deliberate gate; change only with authorization |

Residual safety risks:

- Turning Bridge `enabled` off after a job was queued does not cancel that job; the Worker permit is
  sampled at worker start, and only emergency stop/cancel acts mid-flight.
- A Sender service restart during an active job yields `UNKNOWN`; it must never be retried
  automatically.
- The WeChatAgent console is not running by default; a future adapter must not assume port 3210 is
  available.

---

## 12. Test evidence and acceptance status

New isolated prototype (fixture-only, no production adapters):

`test/config-capability.test.mjs` — 5 tests:

1. audited sources without a loaded-revision API stay `PENDING_APPLY`, `activeConfirmed:false`;
2. a boot-read Sender with a mismatched loaded revision is `UNKNOWN`, never `APPLIED`;
3. after a simulated restart, an exact loaded revision is `APPLIED`;
4. a revision-guarded save is compare-and-swap, not proof of apply;
5. plans and results do not echo fixture tokens or target IDs.

These fixtures model the audited interfaces; they are not production adapters and do not touch
production files.

Local verification (baseline `main` + this branch):

```text
node --test        -> 153 tests / 152 pass / 0 fail / 1 platform skip
node build.mjs     -> client.js regenerated and in sync
node --test test/docs-integrity.test.mjs -> pass
npm.cmd run test:ui -> 12/12 isolated Playwright checks
```

**Status:** Phase 4B-2B-1 is **AUDIT COMPLETE / `OFFLINE`**. No production configuration, service,
audio device or WeChat operation was touched. Phase 4B-2B-2 remains **NOT STARTED**.

---

## 13. Re-verification before 4B-2B-2

Re-read the component files named in §3–§5 and re-check:

```powershell
# read-only
Get-Content '<WECHATAGENT_ROOT>/app/resources/project/package.json'
Get-Content '<WECHATAGENT_ROOT>/data/workspace/state/voice-settings.json'   # redact values
Get-Content '<VOICE_SENDER_ROOT>/service/package.json'
Invoke-RestMethod 'http://127.0.0.1:<bridge-adapter-port>/status'
```

Then verify current PR/CI/HEAD and that no component version changed. Any version change invalidates
this matrix and requires a new audit.
