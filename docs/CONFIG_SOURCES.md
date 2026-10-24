# Whale Voice — Configuration Sources (Phase 4A)

**Scope:** read-only configuration discovery. No write endpoint exists in this phase.
**Status:** `OFFLINE` until the live DSH GUI verifies the config snapshot; then Phase 4A can be
accepted as `INTEGRATED` only for the fields actually read.

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
| Voice Sender worker defaults | `%VOICE_SENDER_ROOT%/config.json` | allow-listed voice/safety fields; no target names | Yes (allowed chats) | Alternate saved values only; no names | Worker not running; no active-version endpoint | Worker config shape v1 (legacy) | alternate null; mismatch/unknown |
| Voice Sender target map | `%VOICE_SENDER_ROOT%/service/targets.json` | **Not read in Phase 4A** | Yes | No | N/A | N/A | `not_read_private_targets`; no count derived from it |
| Qwen runtime model/voice | `%QWEN_URL%/health` | existing read-only HTTP health | No secrets | Model/voice/health only | Yes, service-reported at read time | Existing Qwen health contract (`ok`, `model`, `voice`) | `reachable:false`; provider config separate |
| WeChatAgent health | `%WECHATAGENT_URL%/WeChatAgent/health` | existing read-only HTTP health | Credentialed but no token read | `auth_required`/health state only | 401 is not healthy | WeChatAgent 0.3.9 | `auth_required`/unknown |
| Voice Sender health | `%VOICE_SENDER_URL%/health` | existing read-only HTTP health | No token read | State/health only | 401/connection failure distinct | Voice Sender 0.1.0 | `connection_failed`/unknown |

## Authority and conflict rules

0. **Current observation (2026-10-24, read-only):** `voice-settings.json` has `enabled:false`,
   `mode:explicit`; Voice Sender worker `config.json` has `voice_enabled:true`,
   `voice_auto_mode:manual`. The overlapping fields therefore report `voice.consistency:"mismatch"`
   and `application.state:"MISMATCH"`. The active state is `null`/UNKNOWN because neither service
   provides a runtime config-version API. The files are **not merged** into a single boolean.

1. **User setting vs worker default.** `voice-settings.json` is the live user-facing voice setting
   used by the voice outbox path. `voice-sender/config.json` is a separate Worker default/legacy
   file. They are not merged. If overlapping fields differ, the snapshot reports
   `voice.consistency:"mismatch"` and `application.state:"MISMATCH"`.
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

## Missing / error behavior

- Missing file: affected fields `null`; source `error:"missing"`.
- Invalid JSON: affected source `invalid_json`; the rest of the snapshot is still returned.
- Unsupported `schemaVersion`: source `schema_unsupported`; values are not interpreted.
- Permission denied: source `permission_denied`; values `null`.
- Service unavailable: health `unknown`/`connection_failed`; saved config remains visible but
  `activeConfirmed:false`.
- Unknown schema/field: no invented value; UI shows unknown.

## Revision

`configRevision` is SHA-256 over a sanitized subset (no names, tokens, raw paths, logs or chat data).
It is a **saved snapshot identifier**, not an active-config proof. `activeRevision` remains `null`
until a supported runtime configuration-version API exists.
