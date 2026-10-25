# Whale Voice — Configuration Sources (Phase 4A)

**Scope:** configuration authority and read-only discovery, plus the isolated Phase 4B-1/4B-2A
write/coordination contracts.
**Status:** Phase 4A read-only source inventory is `INTEGRATED` in the live DSH Host; Phase 4B-1 and
Phase 4B-2A are `OFFLINE` isolated implementations with no production write route.

Path variables below are logical. The Core resolves them from its configured roots:

- `%DSH_HOME%` — current DSH data directory, resolved by Core; never supplied by the browser.
- `%WECHATAGENT_ROOT%` — configured WeChatAgent root.
- `%VOICE_SENDER_ROOT%` — configured Voice Sender root.
- `%QWEN_URL%` — configured loopback Qwen URL.

No browser request can provide or override these paths.

## Source inventory

| Configuration | Authoritative source | Read method | Sensitive | Exposed to frontend | Runtime confirmation | Compatible version | Missing behavior |
|---|---|---|---|---|---|---|---|
| Core component roots / Qwen URL | `%DSH_HOME%/whale-voice/core.json` | small JSON read | No | Only logical source status; no absolute path | Host process boot | Core config v1 (legacy accepted) | roots empty → components `not_configured`, never “off” |
| DSH plugin settings | Current DSH profile | Not read as a separate voice file | No | No | N/A | DSH profile schema | `no_separate_plugin_settings`; Core config is authority |
| User voice switch, mode, group, probability, default voice | `%WECHATAGENT_ROOT%/data/workspace/state/voice-settings.json` | allow-listed fields + target count only | Yes (allowed target names) | Values + count only; no names | No supported active-version endpoint | `enabled`/`mode`/`for_group`/`auto_probability`/`default_voice` shape | `enabled:null`; do not infer false |
| WeChatAgent permissions / wake mode | `%WECHATAGENT_ROOT%/data/workspace/config/wechatagent.json` | selected `wechat.whitelist` array lengths and `wechat.wake_mode`; no names | Yes (private/group IDs) | Counts only; `detailAvailable:false` | WeChatAgent `/WeChatAgent/health` is auth-protected; no active-config read | WeChatAgent 0.3.9 | counts null; no empty-list claim |
| Voice Sender service config (port, TTS, automation) | `%VOICE_SENDER_ROOT%/service/service.config.json` | allow-listed fields only; tokenFile/script/log paths ignored | Yes (paths/token references) | Provider/voice/automation summary only; no paths/tokens | Service is not running; no active-version endpoint | Voice Sender 0.1.0 | `configAvailable:false`; health unknown |
| Voice Sender worker safety permit | `%VOICE_SENDER_ROOT%/config.json` | allow-listed voice/safety fields; no target names | Yes (allowed chats) | Separate `voice.worker` field; no names | Worker not running; no active-version endpoint | Worker config shape v1 (legacy) | `voice.worker:null`; no forced merge |
| Voice Sender target map | `%VOICE_SENDER_ROOT%/service/targets.json` | **Not read in Phase 4A** | Yes | No | N/A | N/A | `not_read_private_targets`; no count derived from it |
| Qwen runtime model/voice | `%QWEN_URL%/health` | existing read-only HTTP health | No secrets | Model/voice/health only | Yes, service-reported at read time | Existing Qwen health contract (`ok`, `model`, `voice`) | `reachable:false`; provider config separate |
| WeChatAgent health | `%WECHATAGENT_URL%/WeChatAgent/health` | existing read-only HTTP health | Credentialed but no token read | `auth_required`/health state only | 401 is not healthy | WeChatAgent 0.3.9 | `auth_required`/unknown |
| Voice Sender health | `%VOICE_SENDER_URL%/health` | existing read-only HTTP health | No token read | State/health only | 401/connection failure distinct | Voice Sender 0.1.0 | `connection_failed`/unknown |

## Authority and conflict rules

0. **Current observation (2026-10-24, read-only):** `voice-settings.json` has `enabled:false`,
   `mode:explicit`; Voice Sender worker `config.json` has `voice_enabled:true`,
   `voice_auto_mode:manual`. These are **different security layers**, not a conflicting pair:
   the Bridge false rejects a new voice task before it reaches the Sender, while the Worker true is
   only an independent final-safety permit. The snapshot therefore keeps both values separate,
   reports `voice.consistency:"not_comparable"`, and leaves the active state `null`/UNKNOWN.
1. **Bridge user setting vs Worker safety permit.** `voice-settings.json` is the Bridge's live user
   setting: `enabled`, `mode` (`explicit` only), `for_group`, `auto_probability`, `default_voice` and
   `allowed_targets`. Voice Sender `config.json` `voice_enabled` is the Worker's independent final
   safety gate; `voice_auto_mode` is automation policy (`manual|auto|disabled`), not the same enum.
   `voice.enabled` is always the Bridge value; `voice.worker` is shown separately. A Worker true
   cannot override a Bridge false. `voice.consistency` is `not_comparable` unless future code proves
   an actual same-layer conflict.
1a. **Service vs Worker automation.** `service.config.json` automation and Worker
   `voice_auto_*`/`voice_pause_when_fullscreen` are same-layer automation fields; only those are
   compared for `sender.serviceWorkerConsistency`. A mismatch there is a real `MISMATCH` warning.
2. **Saved vs active.** No supported runtime API currently returns the loaded config revision.
   `savedRevision` is a sanitized hash of allowed fields; `activeRevision` is `null` and
   `activeConfirmed` is `false`. File mtime, process existence or equal file contents are not proof
   of active configuration.
3. **Permissions.** WeChatAgent whitelist is the authority for WeChat permission counts. Only array
   lengths are returned. `detailAvailable:false` means the frontend must not show names or claim a
   target is authorized.
4. **Voice Sender allow-list.** `service.config.json` `allowedChats` is the service's final
   allow-list authority. Phase 4A returns only its count, not entries. Worker/service consistency
   is compared only for supported automation fields; unknown fields are not forced into a boolean.
5. **TTS.** Provider and voice are saved in `service.config.json`; the model returned by Qwen is a
   runtime observation. If both saved and runtime model/voice exist and differ, `tts.mismatch` is
   reported. A saved Provider does not prove the service is running or that preview works.
6. **Secret files.** Hook/audit tokens, Sender tokens, chat databases, task history, logs and target
   maps are never read for this snapshot. Paths/token fields present in a config file are ignored.
7. **Target maps.** `targets.json` and `allowed_targets` names are not returned. Only counts needed
   for the permission summary are derived; no private identity is exposed.

## Layer semantics evidence

- Bridge `voice-settings.enabled`: `qq-bridge/.../voice-outbox.js` reads the file on every call;
  `readVoiceConfig()` rejects with `settings_disabled` when `enabled !== true`, and
  `VoiceOutbox.resolveTarget()` returns `voice_disabled` before any Sender HTTP request. A false
  value therefore prevents a new voice task at the Bridge layer.
- Worker `voice_enabled`: `voice-sender.ps1` reads it as an independent `$enabled` gate and rejects
  with `REJECTED/voice_disabled` at line 268, before recording/sending. It is a final safety permit,
  not a user-facing replacement for the Bridge switch.
- `voice_auto_mode` (`manual|auto|disabled`) configures Sender UI automation. It is not the Bridge
  `mode` (`explicit`) enum. They must not be compared as one field.
- `voice_allow_group_auto` and `voice-settings.for_group` sit at different layers; the Bridge
  `for_group` blocks group targets in `resolveTarget`, while Sender's flag is an independent group
  automation guard. They are shown separately and not collapsed.



- Missing file: affected fields `null`; source `error:"missing"`.
- Invalid JSON: affected source `invalid_json`; the rest of the snapshot is still returned.
- Unsupported `schemaVersion`: source `schema_unsupported`; values are not interpreted.
- Permission denied: source `permission_denied`; values `null`.
- Service unavailable: health `unknown`/`connection_failed`; saved config remains visible but
  `activeConfirmed:false`.
- Unknown schema/field: no invented value; UI shows unknown.

## Revision

`configRevision` is an **opaque, process-local keyed fingerprint** (HMAC-SHA-256, 32 hex characters)
over a canonicalized representation of the authoritative saved configuration. It is a **saved
snapshot identifier**, not an active-config proof. `activeRevision` remains `null` until a supported
runtime configuration-version API exists.

### Coverage

The revision material includes:

- Bridge voice: `enabled`, `mode`, `triggerMode`, `forGroup`, `auto_probability`, `default_voice`,
  and the sorted allowed-target **IDs**;
- Worker safety/automation: `voice_enabled`, `voice_auto_mode`, group policy, window/chat/restore/
  fullscreen fields;
- TTS saved provider/model/voice and base-URL value;
- private/group whitelist IDs, Voice Sender allowed-chat IDs and Bridge allowed-target IDs;
- Sender service version and automation fields;
- per-source `available` / `readable` / `error` state, so a source appearing, disappearing or becoming
  invalid changes the revision by a defined rule.

The revision material excludes runtime health, PIDs, observed timestamps, durations, previews and
other transient observations. Those must never be mixed into a saved-config revision.

### Privacy

The raw names/IDs/base URL and other low-entropy values are never returned or logged. They only enter
the HMAC input inside the Host process. The HMAC key is generated per Host process and is not exposed
to the frontend. A Host restart invalidates old revisions; the frontend must re-read before a future
write rather than reusing a stale revision.

This keyed 32-hex revision is intentionally stronger than an unprotected SHA-256 of a small private
allowlist. It remains an opaque identifier; it is not a secret and must not be treated as one.

### Phase 4B write contract (production planned)

- The future write API must require `expectedRevision`.
- A stale revision must be rejected with a conflict; there is no silent overwrite.
- Checking only a target count is forbidden.
- The version check and write must live in the same Host-side serialized critical section; a
  read-check-write race across separate browser requests is not sufficient.
- The config spans multiple authoritative files; one file `rename` does **not** make the whole set
  transitively atomic. The future design must define a transaction/journal or explicitly limited
  atomicity and recovery.
- Saved success remains separate from runtime effective state.

### Phase 4B-1 isolated implementation (OFFLINE)

`core/config-sandbox.mjs` + `core/config-store.mjs` + `core/config-schema.mjs` now implement a
**single-file, sandboxed** configuration store with a trusted test-sandbox capability, strict v1
schema validation, pure v0→v1 migration, a process-local HMAC revision, `expectedRevision` conflict
detection, temp+fsync+rename atomic save, post-save verification/rollback and read/write state
separation. `core/isolated-write-server.mjs` is a test-only loopback API and is not registered by the
production DSH Host.

The isolated file is not one of the authoritative production files above. No production path,
WeChatAgent, Bridge, Sender, Qwen or `core.json` write is performed. Multi-file transaction, a
production write route, cross-process CAS and runtime apply confirmation remain future work. See
[CONFIG_WRITE_API.md](CONFIG_WRITE_API.md).

### Phase 4B-2A coordination protocol (OFFLINE)

`core/config-coordinator.mjs` adds an isolated coordination protocol over source adapters:

- `bridgeVoice` and `senderService` are the only simulated writable sources in this phase;
- `core`, `workerSafety`, `wechatPermissions`, `ttsProvider` (mapped to `senderService`) and the
  target map remain read-only or are never read;
- Bridge `voice.enabled` and Worker `voice_enabled` stay separate; the Worker final-safety permit is
  never a coordinator write target;
- plans contain field names and opaque revisions, not full configs, target IDs or tokens;
- saves are journaled and can be rolled back only when the source adapter confirms reversibility;
- runtime application requires a trusted loaded-revision confirmation; there is no PID/mtime/HTTP-200
  inference;
- only an isolated in-memory fixture adapter and Fake Runtime are implemented. No production file
  adapter or production Host route exists.

See [CONFIG_COORDINATION.md](CONFIG_COORDINATION.md) for the authority matrix, state contract,
journal/recovery model and Phase 4B-2B prerequisites.

Missing/unreadable source behavior remains: affected fields `null`; source error is preserved; the
revision changes because source state is part of the declared coverage.

## Verified write interfaces (Phase 4B-2B-1 read-only audit)

The audit in [PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md) verified the real
interfaces behind these files:

- **Bridge `voice-settings.json`** — read on every voice call; **no writer and no revision API** exist
  in the Bridge. A valid external change is hot-read; invalid JSON fails closed. Core treats it as
  read-only until the Bridge owns a write endpoint.
- **Sender `service.config.json`** — read once at service boot. Only `PUT /v1/automation/config` is a
  supported owner update (automation/hotkey, rejected while a task is active); it rewrites the whole
  file with plain `writeFileSync` and returns no revision. Whale Voice has no production write
  authorization for it. TTS/port/limit fields have no update API and are not hot-reloaded.
- **Sender Worker `config.json`** — read at each worker process start; `voice_enabled` is sampled
  once per job and is an independent final-safety permit. Never a Core write target.
- **WeChatAgent `wechatagent.json`** — console `POST /api/config` is revision-guarded (SHA-256 of the
  raw file), loopback-only and CSRF-protected; CLI `prepare` and account switching also write the
  file without a shared CAS. Readers are mixed hot/boot; `pendingApply` is a hint, not loaded
  evidence.
- **No component exposes a loaded config revision.** Field-equality observations (`/health`,
  `GET /v1/automation/config`) are not an apply proof; see the audit's confirmation matrix.

## Phase 4B-2B-2a read-only capability projection

`core/capabilities.mjs` joins this source inventory with the Phase 4B-2B-1 audit contract. It does not
add a new configuration source and does not write any file:

- versions come from the existing detector; a version different from the audited one (or unreadable)
  downgrades that component's capability to `UNKNOWN`;
- saved values remain allow-listed (`voice`, `tts`, `permissions` counts, Worker permit, sanitized
  Sender automation fields); no path, Token, whitelist name or target map is exposed;
- `sender.automation` (mode and boolean automation flags) is now included in the read-only config
  snapshot so the automation Surface can show its saved value without reading `service.config.json`
  independently;
- `readTiming`, `hotReload` and `requiresRestart` are Surface-level; Sender automation
  (`RUNTIME_API/FULL/NOT_REQUIRED`) and Sender TTS (`SERVICE_BOOT/NONE/REQUIRED`) are never collapsed;
- no component loaded revision exists, so `apply` stays unsupported/unknown and no `APPLIED` state is
  produced;
- Worker version is independent: the standalone Worker config/script has no version identifier, and
  `sender.workerVersion` remains `null`; the Sender Service `0.1.0` package version is never used as
  Worker evidence. If the Worker config declares `version`/`worker_version`, that is used only as
  Worker evidence and still remains `UNKNOWN` without an audited Worker baseline.

See [CAPABILITY_API.md](CAPABILITY_API.md).
