# Capability / Status API (Phase 4B-2B-2a)

**Status:** `OFFLINE` — read-only source, Host route and isolated UI are implemented and tested; the
running DSH Host has **not** been reloaded/restarted, so live Electron GUI integration remains
pending a separately authorized reload. No production write route exists.

**Scope:** expose the audited component capabilities and the current read-only runtime observation to
the Whale Voice frontend. This is a projection only: it does not read private targets, tokens or chat
content, and it cannot write configuration.

---

## 1. Endpoints

Registered by the DSH Host row (`index.js`), same-origin and token-protected like the existing setup
routes:

```text
GET /whale-voice/setup/capabilities
GET /whale-voice/setup/capabilities/status
```

The isolated test server (`core/server.mjs`) exposes the same contract at:

```text
GET /setup/capabilities
GET /setup/capabilities/status
```

Both routes are registered with the existing guard: loopback socket + loopback Host + same-origin
(or DSH same-origin GET) + per-process token + DSH `connection` check. Non-GET methods return 405;
missing/wrong token 401; cross-site/cross-origin 403. No path, file name, URL, component, query or
command is accepted from the browser. Neither route imports `isolated-write-server.mjs` or any
ConfigStore write path.

The injected bridge gains two read-only methods:

```js
window.__WHALE_SETUP__ = {
  // ...existing getStatus/getConfig/getConfigSources/getConfigStatus/detect...
  getCapabilities(): Promise<CapabilitySnapshot>,
  getCapabilityStatus(): Promise<CapabilityStatus>
}
```

---

## 2. Capability Snapshot (schema v3)

`GET /capabilities` returns the **static audited contract** joined with the current read-only
detection/config observation. `readTiming`, `hotReload` and `requiresRestart` are **surface-level**
fields; a source never overrides them.

```json
{
  "schemaVersion": 3,
  "ok": true,
  "mode": "read-only",
  "writeMode": "READ_ONLY",
  "observedAt": "2026-10-25T00:00:00.000Z",
  "contract": {
    "auditedAt": "2026-10-25",
    "source": "docs/PHASE4B2B1_COMPONENT_AUDIT.md",
    "auditedVersions": { "wechatAgent": "0.3.9", "senderService": "0.1.0", "wechatHook": "4.1.10.27" }
  },
  "components": [
    {
      "id": "wechatagent",
      "label": "WeChatAgent",
      "state": "auth_required",
      "status": "DEGRADED",
      "installed": true,
      "version": "0.3.9",
      "versionMatch": "AUDITED",
      "processRunning": true,
      "health": "auth_required",
      "healthy": null,
      "connected": false,
      "observedAt": "2026-10-25T00:00:00.000Z",
      "error": "auth_required"
    }
  ],
  "sources": [
    {
      "id": "senderService",
      "label": "Voice Sender 服务",
      "authority": "Voice Sender Service",
      "component": "sender",
      "version": "0.1.0",
      "versionMatch": "AUDITED",
      "risk": "HIGH",
      "surfaces": [
        {
          "id": "automation",
          "label": "发送自动化设置",
          "risk": "HIGH",
          "readTiming": "RUNTIME_API",
          "hotReload": "FULL",
          "requiresRestart": "NOT_REQUIRED",
          "ownerApi": {
            "state": "AVAILABLE",
            "kind": "HTTP",
            "scope": "COMPONENT",
            "endpoint": "PUT /v1/automation/config"
          },
          "save": {
            "state": "SUPPORTED",
            "authorization": "NOT_AUTHORIZED",
            "enabled": false,
            "gate": "NO_WRITE_AUTHORIZATION"
          },
          "savedRevision": { "state": "UNSUPPORTED", "kind": null },
          "loadedRevision": { "state": "UNSUPPORTED", "kind": null },
          "apply": { "state": "UNSUPPORTED", "reason": "NO_LOADED_REVISION" },
          "status": {
            "saved": {
              "state": "AVAILABLE",
              "source": "service.config.json#automation",
              "values": { "mode": "manual", "autoFindWindow": true }
            },
            "runtime": { "state": "DEGRADED", "summary": "not_running", "observedAt": "..." },
            "apply": { "state": "UNKNOWN", "activeRevision": null, "activeConfirmed": false, "reason": "NO_LOADED_REVISION" },
            "observedAt": "..."
          },
          "blockers": [
            { "code": "NO_WRITE_AUTHORIZATION", "message": "当前阶段仅只读，尚未获得生产写入授权。", "severity": "blocked" }
          ]
        },
        {
          "id": "tts",
          "label": "TTS 音色与提供方",
          "readTiming": "SERVICE_BOOT",
          "hotReload": "NONE",
          "requiresRestart": "REQUIRED",
          "ownerApi": { "state": "UNSUPPORTED", "kind": null, "scope": null, "endpoint": null },
          "save": { "state": "UNSUPPORTED", "authorization": "NOT_AUTHORIZED", "enabled": false, "gate": "NO_OWNER_API" },
          "apply": { "state": "UNSUPPORTED", "reason": "NO_OWNER_API" },
          "blockers": [
            { "code": "NO_OWNER_API", "message": "组件没有受支持的写入接口；直接改 JSON 不算受支持接口。", "severity": "blocked" },
            { "code": "REQUIRES_RESTART", "message": "修改后需要重新加载或重启对应组件才能生效。", "severity": "warn" }
          ]
        }
      ]
    }
  ],
  "summary": {
    "writeMode": "READ_ONLY",
    "surfaceCount": 7,
    "writeAuthorized": [],
    "writeEnabled": [],
    "saveSupported": ["senderService.automation", "wechatPermissions.config"],
    "ownerApiAvailable": ["senderService.automation", "wechatPermissions.config"],
    "loadedRevisionAvailable": [],
    "applySupported": [],
    "saveStates": { "SUPPORTED": 2, "UNSUPPORTED": 5 },
    "authorizationStates": { "NOT_AUTHORIZED": 7 },
    "applyStates": { "UNSUPPORTED": 7 },
    "components": { "total": 6, "available": 2, "degraded": 3, "unavailable": 0, "unknown": 1 },
    "blockerCount": 18
  },
  "blockers": [
    { "code": "NO_WRITE_AUTHORIZATION", "source": "senderService", "surface": "automation", "message": "...", "severity": "blocked" }
  ]
}
```

The example is abbreviated; arrays contain every source/surface. No raw config document, path,
token or target name is included.

### 2.1 Sources and surfaces

| Source | Surfaces | Notes |
|---|---|---|
| `bridgeVoice` | `voiceSettings` | per-call read, full hot reload, no owner write API |
| `senderService` | `automation`, `tts` | automation has a runtime PUT; TTS is service-boot read and needs reload |
| `workerSafety` | `voicePermit` | Worker final-safety permit; `policy: NEVER_WRITE` |
| `wechatPermissions` | `config` | human console only; counts only, never names |
| `core` | `paths` | Host-boot read; no write API |
| `qwen` | `health` | health/model observation only |

---

## 3. Runtime Status Snapshot

`GET /capabilities/status` returns the current observation without repeating the full static
contract:

```json
{
  "schemaVersion": 3,
  "ok": true,
  "mode": "read-only",
  "writeMode": "READ_ONLY",
  "observedAt": "...",
  "components": [],
  "surfaces": [
    {
      "source": "senderService",
      "surface": "automation",
      "label": "发送自动化设置",
      "component": "sender",
      "readTiming": "RUNTIME_API",
      "hotReload": "FULL",
      "requiresRestart": "NOT_REQUIRED",
      "saved": { "state": "AVAILABLE", "values": {}, "source": "..." },
      "runtime": { "state": "DEGRADED", "summary": "not_running", "observedAt": "..." },
      "apply": { "state": "UNKNOWN", "activeRevision": null, "activeConfirmed": false, "reason": "NO_LOADED_REVISION" },
      "blockers": [],
      "observedAt": "..."
    }
  ],
  "summary": { "components": {}, "surfaceCount": 7, "blocked": 6, "observedAt": "..." }
}
```

`apply.state` is `UNKNOWN` because no save transaction and no loaded revision exist. It is **not**
`APPLIED`; no component returns a loaded revision. `activeConfirmed` is always false in this phase.

---

## 4. State vocabulary

| Field | Values | Meaning |
|---|---|---|
| `ownerApi.state` | `AVAILABLE` / `UNSUPPORTED` / `UNKNOWN` | Does the owner expose an interface? |
| `save.state` | `SUPPORTED` / `UNSUPPORTED` / `UNKNOWN` | Can the owner persist? Independent of authorization. |
| `save.authorization` | `AUTHORIZED` / `NOT_AUTHORIZED` / `UNKNOWN` | Core production write permission. |
| `save.enabled` | boolean | Derived: available component-scoped API + supported save + authorized + `writeMode=AUTHORIZED_WRITE`. Always false in this phase. |
| `savedRevision.state` | `SUPPORTED` / `UNSUPPORTED` / `UNKNOWN` | Owner accepts/returns a save-time revision. |
| `loadedRevision.state` | `SUPPORTED` / `UNSUPPORTED` / `UNKNOWN` | Owner can report the revision actually loaded. |
| `apply.state` | `SUPPORTED` / `UNSUPPORTED` / `UNKNOWN` | Can loaded revision be confirmed? |
| `apply.reason` | `NO_OWNER_API` / `NO_LOADED_REVISION` / `VERSION_NOT_AUDITED` / `VERSION_UNKNOWN` / `null` | Why capability-level apply confirmation is unavailable. |
| `status.apply.state` | `APPLIED` / `PENDING_APPLY` / `CONFLICT` / `FAILED` / `UNKNOWN` | Per-snapshot application state; `APPLIED` requires exact loaded revision. |
| `readTiming` | `PER_CALL` / `RUNTIME_API` / `SERVICE_BOOT` / `PER_JOB` / `HOST_BOOT` / `MIXED` / `ON_DEMAND` / `UNKNOWN` | When this surface is read/updated. |
| `hotReload` | `FULL` / `PARTIAL` / `NONE` / `NOT_APPLICABLE` / `UNKNOWN` | Whether a change is observed without restart. |
| `requiresRestart` | `REQUIRED` / `NOT_REQUIRED` / `NOT_APPLICABLE` / `UNKNOWN` | Restart requirement for this surface. |
| `versionMatch` | `AUDITED` / `CHANGED` / `UNKNOWN` / `NOT_APPLICABLE` | Whether the detected version matches the audit. |

Rules:

1. `null` is allowed only for optional detail (`kind`, `endpoint`, `apply.reason`); unknown states
   are `UNKNOWN`.
2. `UNSUPPORTED` (no interface), `NOT_AUTHORIZED` (interface exists, no permission) and `UNKNOWN`
   (not observed) are distinct.
3. Sender automation is `readTiming: RUNTIME_API`, `hotReload: FULL`, `requiresRestart:
   NOT_REQUIRED`; Sender TTS is `SERVICE_BOOT`, `NONE`, `REQUIRED`. They must never share one value.
4. A missing `loadedRevision` keeps `apply` unsupported/unknown; it does not erase a supported save.
5. `save.enabled` cannot be true without explicit authorization and `writeMode=AUTHORIZED_WRITE`.
6. No PID, mtime, HTTP 200, health success or equal bytes is apply proof.

---

## 5. Version gating

Static capability facts are valid only for the audited versions:

```text
WeChatAgent 0.3.9 / Hook 4.1.10.27 / Voice Sender Service 0.1.0
```

- Matching version → `versionMatch: AUDITED`, audited capability retained.
- Different version → `versionMatch: CHANGED`; the source's surfaces downgrade
  `ownerApi`/`save`/`savedRevision`/`loadedRevision`/`apply` to `UNKNOWN` and add
  `VERSION_NOT_AUDITED`. The old conclusion is not applied blindly.
- Version unreadable → `versionMatch: UNKNOWN`, same downgrade with `VERSION_UNKNOWN`.
- Qwen/Core → `NOT_APPLICABLE`.

Component health/version is read from the existing read-only detector. A missing component yields
`COMPONENT_NOT_INSTALLED`; an unreachable/auth-protected component yields `COMPONENT_OFFLINE` /
`AUTH_REQUIRED` while the static capability row may remain visible.

---

## 6. Data sources

| Data | Source | Nature |
|---|---|---|
| Component versions/state | `core/detect.mjs` + `packages/adapter-wechatagent` | dynamic read-only observation |
| Saved Bridge/Worker/TTS/permission values | `core/config.mjs` allow-listed snapshot | dynamic read-only observation |
| Static interfaces/versions | `docs/PHASE4B2B1_COMPONENT_AUDIT.md` | audited contract |
| Qwen model/voice | existing `/health` | observation only |

`core/capabilities.mjs` is a pure projection: no filesystem, HTTP, shell, process or write access.
`core/capability-view.mjs` is a pure browser/test view helper; it is injected by `build.mjs` and has
no I/O.

Privacy: permission counts only; no whitelist names/IDs, no target map, no Token, no Hook token, no
absolute install path in the capability response. Install paths remain masked/omitted as in the
existing setup status.

---

## 7. Frontend integration

`core/setup-status.mjs` adds `readBridgeCapabilitySnapshot` / `readSetupCapabilities`, validating
schema v3 and failing closed on timeout/invalid/older schema. The app fetches status and capability
in parallel under the existing scan gate, so an older response cannot overwrite a newer one.

Pages consume `deriveCapabilityView`:

- **Overview:** capability summary (source/surface counts, support vs authorization vs enablement,
  component states, blockers).
- **Voice settings:** Bridge surface saved value and read-only limits.
- **Studio:** Sender TTS surface and Qwen observation; boot-read/no-hot-reload semantics.
- **Send & Safety:** Sender automation (runtime PUT, unauthorized) and Worker permit
  (`NEVER_WRITE`).
- **Components:** capability, blockers, version match and detection time.
- **Advanced:** all surfaces with an expandable technical detail.

No page renders a write control. `UNKNOWN` is never styled as off/safe/healthy. The existing demo
controls remain explicitly labelled and disabled.

---

## 8. Degradation

- Core absent → `core_not_connected`, capability UI shows “能力摘要不可用”, never Mock capability.
- Timeout → `core_timeout` after 5 s; no late response is accepted.
- Invalid/older schema → `core_invalid_response`; no partial rendering as real capability.
- Component offline/auth → saved values remain visible; runtime and apply stay degraded/unknown.
- Version changed → capability downgraded to `UNKNOWN`; no old verdict is applied.

---

## 9. Tests

Behavior coverage added in this phase:

- `test/capability.test.mjs`: schema v3, surface-level reload semantics, automation vs TTS, version
  gating, static/dynamic separation, privacy, view derivation, no I/O.
- `test/setup-status.test.mjs`: schema v3 validation, timeout, older schema rejection.
- `test/core.test.mjs`: Core/Host routes, 401/405/cross-site, capability schema, bridge methods.
- `tests/ui/run.mjs`: summary, settings/studio/safety surface semantics, components dialog,
  invalid/missing/timeout capability, 780 px layout, Console/requests, no secrets.

Local result: `node --test` **171 tests / 170 pass / 1 platform skip**; UI **19/19**; build and
Markdown integrity pass. This is OFFLINE/contract evidence; the live DSH Electron Host has not been
reloaded for this phase.
