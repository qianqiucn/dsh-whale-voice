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
audit. Config files were inspected for schema, read timing and writer information; no private values
are reproduced in this document.

---

## 2. Capability matrix

Each row separates **owner API presence**, **Core production write authorization**, **effective write
enablement**, **save capability**, **saved revision**, **loaded revision**, **read timing** and
**hot reload**. A missing loaded revision limits `apply`; it does not erase a save capability.

| Surface | Owner API | Core write auth | Write enabled now | Save capability | Saved revision | Loaded revision | Read timing / hot reload | 4B-2B-1 verdict |
|---|---|---|---|---|---|---|---|---|
| Bridge voice settings `state/voice-settings.json` | **None** | `NOT_AUTHORIZED` | no | `UNSUPPORTED` | none | none | per call / full | **READ-ONLY** |
| Bridge runtime status | `GET /status` (loopback, no auth) | `NOT_AUTHORIZED` | no | `UNSUPPORTED` | none | runtime readiness only | on demand / n/a | **OBSERVATION** |
| Sender Service **automation** (`service.config.json` `automation`, hotkey) | **`PUT /v1/automation/config`** (bearer token, loopback, rejects while a task is active) | **`NOT_AUTHORIZED`** | no | **`SUPPORTED`** | none (no `expectedRevision`) | none; `GET /v1/automation/config` returns loaded values only | service boot / none | **OWNER-WRITABLE, NOT AUTHORIZED, APPLY UNCONFIRMED** |
| Sender Service **TTS / port / limits** | **None** (no update API; boot-only read) | `NOT_AUTHORIZED` | no | **`UNSUPPORTED`** | none | `/health` returns loaded values, not a revision | service boot / none | **WRITE-UNSUPPORTED** |
| Sender Worker `config.json` (`voice_enabled`, device, silence, auto flags) | None | `NOT_AUTHORIZED` | no | `UNSUPPORTED` | none | none | per job / partial (next job only) | **READ-ONLY; NEVER WRITE** |
| Sender target map `service/targets.json` | None | `NOT_AUTHORIZED` | no | `UNSUPPORTED` | none | n/a | service boot | **NEVER READ OR WRITE** |
| WeChatAgent config `config/wechatagent.json` | **Console `POST /api/config`** (loopback, CSRF, `body.revision`) plus CLI/account-switch writers | `NOT_AUTHORIZED` | no | **`SUPPORTED` via HUMAN_CONSOLE** | console-only SHA-256 of the raw file | **none**; `pendingApply` is a hint | mixed / partial | **HUMAN-CONSOLE ONLY** |
| WeChatAgent health | None | `NOT_AUTHORIZED` | no | `UNSUPPORTED` | none | version/PID/account/startup only | on demand | **OBSERVATION** |
| Core roots / Qwen URL `%DSH_HOME%/whale-voice/core.json` | None | `NOT_AUTHORIZED` | no | `UNSUPPORTED` | none | none | Host boot / none | **READ-ONLY** |
| Qwen `/health` | None | `NOT_AUTHORIZED` | no | `UNSUPPORTED` | none | model/voice observation only | on demand | **OBSERVATION** |

Legend:

- **Save capability** = the owning component has an interface that can persist this surface. It is
  independent of Whale Voice authorization and of loaded-revision evidence.
- **Core write auth** = whether Whale Voice currently holds explicit production write authorization.
  No surface does; the Phase 4B-2B-2a contract is read-only.
- **Write enabled now** = derived from owner API + save capability + authorization + component scope +
  current write mode. It is not a synonym for "an API string exists".
- **Write replacement** is described per finding below. A temp+rename name replacement is not a claim
  of crash atomicity or power-loss durability.
- Editing a JSON file is **not** a supported interface, even when the component hot-reads that file.

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

### 3.2 Writers and replacement

No writer for `voice-settings.json` exists in the audited Bridge or WeChatAgent workspace. The only
temp+rename writer in the Bridge (`writeJsonAtomic`, temp + rename) is used for the dedupe file and
the one-shot test-session file, not for voice settings. That helper replaces the target name; it is
not evidence of crash atomicity or power-loss durability. The voice-settings file is therefore an
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

The one owner-side update path is `PUT /v1/automation/config`:

- allowed fields: `mode`, `autoFindWindow`, `autoOpenChat`, `autoRestoreMinimized`,
  `pauseWhenFullscreen`, `focusFailure`, `hotkeyAccelerator`;
- rejects with `409 active_task` while a task is queued or running;
- validates types/enums, re-checks the emergency-stop precondition for `auto`;
- updates the in-memory config, optionally re-registers the hotkey, then **rewrites the whole
  `service.config.json` with plain `writeFileSync`** (no temp+rename);
- returns the loaded automation values, but **no revision**.

The API exists at the owner. **Whale Voice holds no production write authorization for it**, and no
Core Host route is registered; those are separate facts from API availability.

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

**Verdict:** automation is the **only owner-side write API**. It is save-capable
(`save.state: SUPPORTED`), but Whale Voice is **not authorized** to write it and no Host write route
exists, so `save.enabled` is false. TTS/port fields have **no owner API**; editing the file is not a
supported interface, and changing them requires an owner API extension or an authorized restart. The
missing loaded revision keeps automation at `PENDING_APPLY`; it does **not** make the save
unsupported.

---

## 5. WeChatAgent findings

### 5.1 Config management mechanism

`config/wechatagent.json` is schema version 1 and is validated by `project-config.mjs` (ports,
Hook loopback/version, whitelist numeric IDs, persona, wake mode, provider/model, feature policies).
The supported management paths are:

1. **Console API** (`scripts/console-server.mjs`, loopback only, default port 3210; a **human**
   console, not a Core integration API):
   - `GET /api/config` returns `{ config, revision }`, where `revision` is SHA-256 of the raw file
     plus `pendingApply` / `dshRestartRequired` from console state;
   - `POST /api/config` requires `body.revision`, rejects a stale revision with `409`, validates,
     backs up the old file, writes temp + rename with `0o600` (name replacement; no atomicity or
     durability guarantee is claimed), and marks `pendingApply` when a non-hot field changed;
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
| `fs.renameSync(temp, target)` over an existing file | Replaces the target name in this probe |

The probe shows primitive availability and name replacement only. It does **not** establish NTFS
crash atomicity, power-loss durability, or behaviour under antivirus/filter drivers. Those require
dedicated validation; this audit makes no such claim. The primitives make a cooperative lock + CAS
feasible without a native dependency; they do **not** make a lock mandatory, sufficient or durable.

### 8.3 Recommended lock/CAS scheme (only if Core must write a file)

1. Acquire `<state>/locks/<source>.lock` with `open('wx')`; write owner metadata
   `{v:1, pid, startedAt, host, token}`; hold for the read-verify-write window only.
2. On `EEXIST`, read the owner. Treat the lock as stale only when the heartbeat/age exceeds a
   conservative threshold **and** the PID is not alive; steal by renaming the stale lock to a unique
   name (one stealer wins), then create a fresh lock.
3. Under the lock: read the source, compare `expectedRevision`, recompute immediately before the
   write, write temp + best-effort `fsync`, replace the target name, re-read and return the observed
   revision. The replacement is best-effort; do not present it as crash-atomic.
4. Release only if the token matches. Never release a lock owned by another token.
5. Keep a restricted pre-image only if the source owner provides no rollback. Store it outside the
   repository, `0o600`-equivalent ACL, size-bounded, and delete it after a confirmed transaction.

Limits to document in the adapter: advisory only; PID reuse; stale-lock takeover windows;
`EPERM`/`EACCES` from antivirus/EDR; no cross-host locking; no claim that rename is atomic on every
Windows filesystem or filter driver; no claim of power-loss durability; no protection against a
non-cooperating writer between the final re-read and the replacement.

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
6. **Owner API presence, Core authorization and effective enablement are three separate facts.**
   `save.enabled` requires an available component-scoped API, a supported save capability, explicit
   authorization and an authorized write mode. No UI may infer writability from an API string.
7. **Save capability is not apply confirmation.** A missing loaded revision keeps `apply` at
   `UNSUPPORTED`/`PENDING_APPLY`; it does not erase a supported save or hide an existing owner API.
8. **Read timing is not hot reload.** Boot-time read, per-call read and per-job read are distinct;
   only the last two can observe a change without a restart, and a per-job Worker permit does not
   affect an already-running job.

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

### 10.1 Capability projection

Each **surface** is projected separately, so an available owner API is never mistaken for a Core
authorization, a save capability or apply confirmation. Sender automation and Sender TTS are two
different surfaces.

```json
GET /whale-voice/config/capabilities
{
  "schemaVersion": 2,
  "writeMode": "READ_ONLY",
  "observedAt": "2026-10-25T00:00:00.000Z",
  "sources": [
    {
      "source": "senderService",
      "authority": "Voice Sender Service",
      "readTiming": "SERVICE_BOOT",
      "hotReload": "NONE",
      "requiresRestart": "REQUIRED",
      "risk": "HIGH",
      "surfaces": [
        {
          "surface": "automation",
          "ownerApi": {
            "state": "AVAILABLE",
            "kind": "HTTP",
            "scope": "COMPONENT",
            "endpoint": "PUT /v1/automation/config"
          },
          "savedRevision": { "state": "UNSUPPORTED", "kind": null },
          "loadedRevision": { "state": "UNSUPPORTED", "kind": null },
          "save": {
            "state": "SUPPORTED",
            "authorization": "NOT_AUTHORIZED",
            "enabled": false,
            "gate": "NO_WRITE_AUTHORIZATION"
          },
          "apply": { "state": "UNSUPPORTED", "reason": "NO_LOADED_REVISION" },
          "blockers": ["NO_WRITE_AUTHORIZATION", "NO_LOADED_REVISION"]
        },
        {
          "surface": "tts",
          "ownerApi": { "state": "UNSUPPORTED", "kind": null, "scope": null, "endpoint": null },
          "savedRevision": { "state": "UNSUPPORTED", "kind": null },
          "loadedRevision": { "state": "UNSUPPORTED", "kind": null },
          "save": {
            "state": "UNSUPPORTED",
            "authorization": "NOT_AUTHORIZED",
            "enabled": false,
            "gate": "NO_OWNER_API"
          },
          "apply": { "state": "UNSUPPORTED", "reason": "NO_OWNER_API" },
          "blockers": ["NO_OWNER_API", "REQUIRES_RESTART", "NO_LOADED_REVISION"]
        }
      ]
    },
    {
      "source": "wechatPermissions",
      "authority": "WeChatAgent Console",
      "readTiming": "MIXED",
      "hotReload": "PARTIAL",
      "requiresRestart": "REQUIRED",
      "risk": "CRITICAL",
      "surfaces": [
        {
          "surface": "config",
          "ownerApi": {
            "state": "AVAILABLE",
            "kind": "HTTP_CONSOLE",
            "scope": "HUMAN_CONSOLE",
            "endpoint": "POST /api/config"
          },
          "savedRevision": { "state": "SUPPORTED", "kind": "file-sha256" },
          "loadedRevision": { "state": "UNSUPPORTED", "kind": null },
          "save": {
            "state": "SUPPORTED",
            "authorization": "NOT_AUTHORIZED",
            "enabled": false,
            "gate": "HUMAN_CONSOLE_ONLY"
          },
          "apply": { "state": "UNSUPPORTED", "reason": "NO_LOADED_REVISION" },
          "blockers": ["HUMAN_CONSOLE_ONLY", "NO_WRITE_AUTHORIZATION", "NO_LOADED_REVISION", "MIXED_WRITERS"]
        }
      ]
    }
  ],
  "summary": {
    "ownerApiAvailable": ["senderService.automation", "wechatPermissions.config"],
    "saveSupported": ["senderService.automation", "wechatPermissions.config"],
    "writeAuthorized": [],
    "writeEnabled": [],
    "loadedRevisionAvailable": [],
    "applySupported": []
  }
}
```

### 10.2 State vocabulary

| Field | Values | Meaning |
|---|---|---|
| `writeMode` | `READ_ONLY` \| `AUTHORIZED_WRITE` | Phase-level gate for every surface. 2B-2a is `READ_ONLY`. |
| `ownerApi.state` | `AVAILABLE` \| `UNSUPPORTED` \| `UNKNOWN` | Does the owning component expose an interface? |
| `ownerApi.kind` | `HTTP` \| `HTTP_CONSOLE` \| `FILE` \| `NONE` \| `null` | Interface family; `null` only when no API is available. |
| `ownerApi.scope` | `COMPONENT` \| `HUMAN_CONSOLE` \| `NONE` \| `null` | `HUMAN_CONSOLE` is not a Core integration API. |
| `savedRevision.state` | `SUPPORTED` \| `UNSUPPORTED` \| `UNKNOWN` | Owner accepts/returns a revision for a save (e.g. `expectedRevision`). |
| `loadedRevision.state` | `SUPPORTED` \| `UNSUPPORTED` \| `UNKNOWN` | Owner can report the revision actually loaded at runtime. |
| `save.state` | `SUPPORTED` \| `UNSUPPORTED` \| `UNKNOWN` | Can the owner persist this surface? Does **not** include Core permission. |
| `save.authorization` | `AUTHORIZED` \| `NOT_AUTHORIZED` \| `UNKNOWN` | Core's production write permission. |
| `save.enabled` | `true` \| `false` | Derived: `ownerApi=AVAILABLE` **and** `scope=COMPONENT` **and** `save.state=SUPPORTED` **and** `authorization=AUTHORIZED` **and** `writeMode=AUTHORIZED_WRITE`. |
| `save.gate` | `NONE` \| `NO_OWNER_API` \| `NO_SAVE_API` \| `NO_WRITE_AUTHORIZATION` \| `HUMAN_CONSOLE_ONLY` \| `PHASE_READ_ONLY` \| `UNKNOWN` | First reason the write is not enabled. |
| `apply.state` | `SUPPORTED` \| `UNSUPPORTED` \| `UNKNOWN` | Can the owner confirm the loaded revision? `SUPPORTED` requires `loadedRevision=SUPPORTED`. |
| `apply.reason` | `NO_OWNER_API` \| `NO_LOADED_REVISION` \| `null` | Why apply confirmation is unavailable. |
| `readTiming` | `PER_CALL` \| `SERVICE_BOOT` \| `PER_JOB` \| `HOST_BOOT` \| `MIXED` \| `ON_DEMAND` \| `UNKNOWN` | When the component reads its configuration. |
| `hotReload` | `FULL` \| `PARTIAL` \| `NONE` \| `NOT_APPLICABLE` \| `UNKNOWN` | Whether a saved change is observed without restart. |
| `requiresRestart` | `REQUIRED` \| `NOT_REQUIRED` \| `NOT_APPLICABLE` \| `UNKNOWN` | Restart requirement for the change to take effect. |

Rules:

1. **`null` is never a capability state.** It is allowed only for `ownerApi.kind`,
   `ownerApi.endpoint`, `savedRevision.kind`, `loadedRevision.kind` and `apply.reason`, where it means
   "no value applies" (for example, no revision kind when the revision is unsupported). An unobserved
   capability is `UNKNOWN`, not `null`. A `SUPPORTED` revision must name its `kind`.
2. `UNSUPPORTED` means the interface does not exist. `NOT_AUTHORIZED` means an interface may exist
   but Whale Voice has no permission. `UNKNOWN` means it could not be determined. They are not
   interchangeable.
3. `save.state` is independent of `loadedRevision.state` and `apply.state`. Sender automation is
   `save.state:SUPPORTED` with `loadedRevision:UNSUPPORTED`; the save remains supported, while apply
   stays `PENDING_APPLY`.
4. `save.enabled` is always derived. It cannot be set true by an API string, a plan preview or the
   frontend; authorization and write mode are mandatory.
5. `readTiming` and `hotReload` are separate. `SERVICE_BOOT` + `NONE` means a saved file is not
   re-read; `PER_CALL` + `FULL` means the next call sees it; `PER_JOB` + `PARTIAL` means only the next
   job sees it and the active job does not.
6. `requiresRestart:UNKNOWN` is not `NOT_REQUIRED`. `ownerApi.state:UNKNOWN` is not `UNSUPPORTED`.

### 10.3 Status projection (saved vs applied)

```json
{
  "source": "senderService",
  "surface": "automation",
  "savedRevision": "<32hex-or-null>",
  "saveState": "SAVED",
  "activeRevision": null,
  "activeConfirmed": false,
  "applyState": "PENDING_APPLY",
  "applyReason": "NO_LOADED_REVISION",
  "observedAt": "2026-10-25T00:00:00.000Z"
}
```

- `savedRevision` / `saveState` describe the save side only. `savedRevision` may be a Core-computed
  opaque fingerprint even when the owner does not accept an `expectedRevision`; the capability's
  `savedRevision.state` says whether the owner itself supports a revision.
- `activeRevision:null` means no loaded revision was observed. It is not "unsupported", "off" or
  "applied".
- `applyState` carries the reason: `PENDING_APPLY` when no loaded-revision interface exists,
  `UNKNOWN` on a mismatch or observation failure, `APPLIED` only for an exact loaded revision.
- A save failure does not change `activeRevision`; a loaded mismatch never rewrites `saveState`.

### 10.4 UI rules for 4B-2B-2

- A write control is enabled only when `save.enabled === true`. `ownerApi.state === "AVAILABLE"` or a
  non-null `endpoint` alone is **not** sufficient; show the exact `save.gate`/blocker on a disabled
  control.
- Show `已保存，生效未确认` (`SAVED`/`PENDING_APPLY`) and `未知` (`UNKNOWN`); never show `已生效`
  without an exact loaded revision.
- Never render `null` as off/disabled/safe; render `UNKNOWN` where the state is unknown.
- Never show paths, tokens, target IDs, whitelist names or raw config documents.
- A plan preview may list source, surface, field names, risk, restart requirement and blockers; it
  is not a save and not permission to enable voice.
- If a component is unreachable, show `No-Core`/unknown for that source, not a stale success.

---

## 11. Blockers and risks

| ID | Blocker / risk | Severity | Effect | Required action |
|---|---|---|---|---|
| B1 | Bridge has no write API | **Critical** | Bridge voice settings cannot be written by Core | Bridge owner endpoint; until then read-only |
| B2 | No component returns a loaded config revision | **High** | No source can honestly reach `APPLIED`; save may still be supported | Owner revision endpoints; otherwise `PENDING_APPLY` |
| B3 | Sender TTS/port has no update API and boot-only read | **High** | TTS change requires restart or file edit (unsupported) | Sender API extension or authorized restart |
| B4 | WeChatAgent has no integration API; console is a human UI with CSRF; three writers without a shared CAS | **High** | Permission writes cannot be automated safely | Keep read-only; console flow; future prepared endpoint |
| B5 | Worker `voice_enabled` sampled once per job | **Medium** | Disabling the permit does not stop an active job | Emergency stop/cancel path; document |
| B6 | Sender `PUT` rewrites the full file with plain `writeFileSync` | **Medium** | External edits are lost; partial write on crash | Use only when service is the sole writer; prefer owner fix |
| B7 | Mixed hot/boot readers in WeChatAgent | **Medium** | Transient inconsistent authorization across processes | Owner-provided snapshot/revision; avoid mid-flight changes |
| B8 | No cross-process lock in any component | **Medium** | Console-vs-prepare lost updates | Owner API; advisory lock only if Core writes |
| B9 | Windows lock/AV behavior not validated under EDR | **Medium** | `EPERM`/stale lock; rename atomicity/durability unproven | Test on the target machine before enabling writes |
| B10 | 0 human reviews on #9–#14 | **Medium** | CI green is not approval | Human review before production write |
| B11 | Phase 4B-2A `simulationOnly` gate | **Low** | Production adapters cannot execute yet | Deliberate gate; change only with authorization |
| B12 | No production write authorization for any surface | **High** | Even a save-capable API cannot be enabled; `save.enabled` stays false | Separate production-write authorization and Host route |

Residual safety risks:

- Turning Bridge `enabled` off after a job was queued does not cancel that job; the Worker permit is
  sampled at worker start, and only emergency stop/cancel acts mid-flight.
- A Sender service restart during an active job yields `UNKNOWN`; it must never be retried
  automatically.
- The WeChatAgent console is not running by default; a future adapter must not assume port 3210 is
  available.

---

## 12. Test evidence and acceptance status

New isolated prototypes (fixture-only, no production adapters):

`test/config-capability.test.mjs` — 5 tests:

1. audited sources without a loaded-revision API stay `PENDING_APPLY`, `activeConfirmed:false`;
2. a boot-read Sender with a mismatched loaded revision is `UNKNOWN`, never `APPLIED`;
3. after a simulated restart, an exact loaded revision is `APPLIED`;
4. a revision-guarded save is compare-and-swap, not proof of apply;
5. plans and results do not echo fixture tokens or target IDs.

`test/config-capability-schema.test.mjs` + `test/helpers/config-capability-schema.mjs` — 7 tests
that enforce the §10 contract:

1. Sender automation: owner API exists, Core is `NOT_AUTHORIZED`, save stays `SUPPORTED`;
2. Sender TTS: no owner API is `UNSUPPORTED`, not `NOT_AUTHORIZED` and not `UNKNOWN`;
3. Bridge and WeChatAgent: read timing, hot reload and human-console scope are distinct;
4. `UNKNOWN` is not `null`, `UNSUPPORTED` or `NOT_AUTHORIZED`;
5. a `null` status, a missing owner-API detail and a `null` restart flag are rejected;
6. `writeEnabled` requires owner API + save capability + authorization + component scope + write
   mode; a read-only phase disables even an authorized save;
7. the summary keeps save, authorization and apply capability separate.

These fixtures model the audited interfaces; they are not production adapters and do not touch
production files.

Local verification (baseline `main` + this branch):

```text
node --test        -> 161 tests / 160 pass / 0 fail / 1 platform skip
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
