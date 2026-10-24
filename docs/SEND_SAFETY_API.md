# Send & Safety — planned Core contract

**Status:** design only. No endpoint in this document is implemented or authorized for production.

The new `发送与安全` page must stay read-only until a trusted Host route and a real Windows-side
capability exist. This document defines the contract to implement before any switch becomes active.

---

## 1. Capability model

Every feature exposes at least:

```ts
type CapabilityState =
  | 'supported'    // backend declares the capability
  | 'unsupported'  // backend explicitly does not implement it
  | 'unavailable'  // Core/component is not connected
  | 'unknown'      // no trustworthy observation

type ApplyState =
  | 'disabled'
  | 'enabled'
  | 'pending'      // saved/requested, not yet confirmed effective
  | 'error'
  | 'unknown'

type DeliveryBackendState =
  | 'supported'
  | 'unsupported'
  | 'research_candidate'
  | 'prototype_ready'
  | 'integrated'
  | 'verified'
```

`research_candidate` is a planning state, not an available option. `supported` does not mean the
backend is currently running or that a native bubble has been observed.

These are separate:

- **supported** does not mean **enabled**;
- **enabled** does not mean **effective**;
- **window found** does not mean **target verified**;
- **shortcut configured** does not mean **registered**;
- **game detection failed** does not mean **safe to steal focus**.

The UI must show the distinction and must never turn `unknown`/`null` into “off” or “safe”.

---

## 2. Read-only endpoints (planned)

### `GET /whale-voice/safety/capabilities`

```json
{
  "schemaVersion": 1,
  "observedAt": "ISO-8601",
  "core": { "state": "connected|unavailable", "version": "0.1.0" },
  "delivery": {
    "selected": "ui-automation",
    "autoSelect": "unsupported",
    "backends": [
      {
        "id": "ui-automation",
        "state": "supported",
        "wechatVersions": ["4.1.10.27"],
        "audioFormats": ["wav"],
        "requiresForeground": true,
        "requiresAudioDriver": true,
        "receipt": "local-bubble",
        "reason": "existing Voice Sender path"
      },
      {
        "id": "wechatagent-native",
        "state": "unsupported",
        "wechatVersions": [],
        "audioFormats": [],
        "receipt": "none",
        "reason": "no SendVoice in 0.3.9/0.4.0 adapter"
      },
      {
        "id": "third-party-native",
        "state": "research_candidate",
        "wechatVersions": [],
        "audioFormats": ["silk-documented-unverified"],
        "receipt": "unknown",
        "reason": "version, license, coexistence and bubble receipt unverified"
      }
    ]
  },
  "emergencyStop": {
    "state": "supported|unsupported|unavailable|unknown",
    "shortcut": { "state": "registered|unregistered|conflict|unknown", "value": "Ctrl+Shift+F12" },
    "cancellableTaskCount": null,
    "lastResult": null,
    "recoveryState": "unknown",
    "reason": "backend_contract_not_implemented"
  },
  "window": {
    "state": "supported|unsupported|unavailable|unknown",
    "discovery": "unknown",
    "focusPolicy": "unknown",
    "targetVerified": false,
    "reason": "window_automation_not_connected"
  },
  "game": {
    "state": "supported|unsupported|unavailable|unknown",
    "detection": "unknown",
    "pauseNewTasks": null,
    "protectFocus": null,
    "reason": "game_detection_not_connected"
  },
  "sender": {
    "state": "online|offline|unknown",
    "healthy": null,
    "recoveryPending": null
  }
}
```

Rules:

- `null` is unknown, never false/safe.
- Do not expose target names, tokens, chat IDs or window titles from this endpoint.
- A capability can be `supported` while its runtime status is `unknown`.

### `GET /whale-voice/safety/status`

Current runtime observation for the page:

```json
{
  "schemaVersion": 1,
  "observedAt": "ISO-8601",
  "shortcut": { "registered": null, "conflict": null, "reason": "not_registered" },
  "cancellableTaskCount": null,
  "lastStop": { "state": "UNKNOWN", "at": null, "taskId": null },
  "recovery": { "pending": null, "state": "unknown" },
  "window": { "found": null, "foreground": null, "minimized": null },
  "focus": { "policy": "unknown", "targetVerified": null },
  "game": { "detected": null, "fullscreen": null, "mode": "unknown" },
  "sender": { "state": "unknown", "healthy": null }
}
```

No current route exists; the page shows the unsupported/unknown state until it does.

---

## 3. Future write endpoints (not implemented)

### `POST /whale-voice/safety/cancel`

Requires trusted Host authentication, CSRF/origin checks and a one-shot task ID.

```json
{ "taskId": "opaque", "confirm": true }
```

Result states:

- `CANCELLED` — proven no external send side effect;
- `TOO_LATE` — already recording/submitted/possibly sent;
- `UNCONFIRMED` — outcome unknown; do not retry;
- `UNSUPPORTED` / `UNAVAILABLE`.

This endpoint must not rewrite a historical `SENT_LOCAL`/`UNKNOWN` result into `CANCELLED`.

### `PUT /whale-voice/safety/shortcut`

Future registration request. It must return:

- requested shortcut;
- conflict check (system/DSH/other instance);
- registration state;
- effective-at/observed-at;
- rollback/unregister result.

### `PUT /whale-voice/safety/policy`

Future window/focus/game policy. Must be versioned, schema-validated, atomically saved and
separated into saved/effective state. It cannot enable a capability that is `unsupported`.

No endpoint may accept arbitrary commands, paths, window titles or target names.

---

## 4. UI binding

| Page section | Current binding | Future binding |
|---|---|---|
| Delivery method | not implemented; UI Automation is the only real path | selected backend + per-backend capability/version/receipt |
| Emergency stop | disabled controls, `unknown` status | capabilities + status + cancel |
| Shortcut | candidate text only | capability + registration result |
| Window discovery | disabled, `unknown` | status/capabilities |
| Auto focus | disabled, `unknown` | policy + effective state |
| Target verification | `未验证` | target verification result |
| Game pause/protection | disabled demo values | game detection + policy |
| Component Qwen auto-start | disabled in Components dialog | Core lifecycle API |
| Failure fallback | settings select (demo) | TTS/degradation contract |

Until the contract exists, all executable safety controls are disabled and no write occurs.

---

## 5. Safety invariants

1. One task record, one delivery ID, one active backend.
2. `UNKNOWN` is terminal for automatic resend.
3. Recording/submission stages cannot be assumed cancellable.
4. Window discovery is not target validation.
5. Game detection failure cannot imply safe focus takeover.
6. Unknown capability cannot be rendered as available.
7. No global hotkey registration, focus takeover, device reset or process start is triggered by a UI
   demonstration.
8. Existing Voice Sender allow-list, final identity, recovery and anti-replay mechanisms remain in
   force.
9. A task locks one backend before the first external submission; changing backend never creates a
   second delivery ID.
10. `third-party-native` remains `research_candidate` and cannot be selected or rendered as usable.
11. No automatic cross-backend fallback after timeout, submission, receipt or `UNKNOWN`.
