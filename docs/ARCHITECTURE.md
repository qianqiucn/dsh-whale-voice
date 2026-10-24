# Whale Voice Architecture

This document separates the **current repository** from the **target system**. Do not read the
target diagram as implemented functionality.

---

## 1. Current architecture (implemented in this repository)

```text
DSH host
  ├─ sidebar.panellist slot
  │    └─ whale-voice icon
  └─ main slot (key: whale-voice)
       └─ client.js
            ├─ client.template.js  app shell, slots, components, WhaleGlyph
            ├─ pages.js            seven view components
            └─ client.css          scoped visual system
                 └─ Mock data only
```

Properties:

- Client-only bundle; `index.js` provides an empty Host row so the bundle has a normal inventory
  entry.
- No npm runtime dependencies.
- No HTTP calls, no filesystem access, no service control.
- No voice sending, WeChat access, TTS calls or credential access.
- Styles are plugin-scoped and use DSH theme tokens where appropriate.
- The UI explicitly labels demonstration data as Mock.

### Build boundary

```text
client.css ──┐
pages.js ────┼─ build.mjs ─→ client.js ─→ DSH web client
client.template.js ─┘
```

`client.js` is committed because it is the runtime artifact referenced by the DSH bundle, and the
plugin manager does not run a build lifecycle. Source remains authoritative.

### Outside this repository

The following are real, separately deployed systems and are **not included**:

- Voice Sender (Windows/PowerShell/C# audio and UI automation);
- WeChatAgent / WeChat Hook / Bridge;
- Qwen3-TTS runtime and local model files;
- `whale-v1` private reference audio and profile;
- Windows virtual audio device configuration;
- production allow-lists, runtime state and logs.

This repository must not imply that cloning it installs a working voice pipeline.

### WeChatAgent dependency boundary

Whale Voice's WeChat capability is built on
[**sourcepro5/WeChatAgent**](https://github.com/sourcepro5/WeChatAgent), an independent upstream
project. WeChatAgent is the required platform layer for:

- WeChat client connection;
- message read/receive and DSH message bridging;
- contact/group context and account/session identity;
- existing chat authorization and scope control;
- the platform's existing send capability.

Whale Voice must **not** implement a second full WeChat reader, account manager or standalone bot.
The planned `packages/adapter-wechatagent` module is an isolation layer around the supported
WeChatAgent interfaces, not a replacement for them. Interface/version assumptions belong in the
adapter, never hard-coded throughout Core.

The adapter must eventually expose:

- installation/compatibility detection;
- running-instance and version discovery;
- Bridge/session health;
- supported message/event subscriptions;
- private/group target identity evidence;
- voice-result feedback to the bridge;
- effective-config verification and version/connection error states.

If WeChatAgent is absent or incompatible, the plugin still opens and TTS provider settings/preview
remain available, but WeChat voice must show the installation message and stay disabled. The UI must
not display a fabricated online WeChat state.

Upstream patches are a last resort: use documented/stable interfaces first, isolate any internal
compatibility code by exact version, and prefer an upstream contribution over a permanent private
fork. WeChatAgent's MIT license and its separate third-party terms must be respected; its Hook,
WeChat client, binaries and restricted third-party components are not bundled here.

See [WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

---

## 2. Target architecture (planned)

```text
DSH Plugin UI
  │  visual management only
  ▼
Whale Voice Core
  ├─ configuration + schema validation
  ├─ permissions / trusted target registry
  ├─ task state and routing
  ├─ capability + connection state
  └─ redacted diagnostics
       ├─ TTS Provider Registry
       │    ├─ local Qwen3-TTS adapter
       │    └─ explicit cloud provider adapter(s)
       ├─ Sender Plugin Adapter
       │    └─ Windows Voice Sender
       └─ WeChatAgent Adapter (REQUIRED for WeChat)
            └─ sourcepro5/WeChatAgent (external platform)
```

### Responsibilities

**Frontend:** presentation, permission confirmation, task visibility, diagnostics and capability
negotiation. It must never send keyboard/mouse input or mutate worker-internal state directly.

**Core:** one source of truth for configuration, target authorization, task lifecycle, cancellation
and provider/sender selection. All sensitive decisions belong here, not in the UI.

**TTS providers:** pluggable local/cloud implementations with explicit selection. No silent
fallback, no credential leakage, no committed API keys.

**Voice Sender:** independent Windows component for audio device handling, UI automation and native
voice bubbles. It must expose a versioned contract and retain its own safety checks.

**WeChatAgent adapter:** required bridge to the independent sourcepro5/WeChatAgent platform. It
owns version/compatibility discovery, connection health, target identity evidence and result
feedback. It is not an optional TTS feature and must not be replaced by a second WeChat bot inside
Whale Voice. Display names are not sufficient for group identity.

### Planned protocol principles

- Request IDs are idempotency keys.
- Exactly one UI task may own the sender at a time.
- `UNKNOWN` is terminal; it is never retried automatically.
- Target identity must be resolved from trusted configuration plus evidence, never model text.
- Configuration and credentials are owned by Core, never by page components.
- The frontend distinguishes `MOCK`, `OFFLINE`, `CONNECTED`, `DEGRADED` and `BLOCKED`.
- A cancel/stop path must be explicit and testable before real automatic sending is enabled.
- Windows secure-desktop, session and foreground limitations are surfaced, not bypassed.

---

## 3. Migration strategy

1. **P1:** define protocols, fake providers and module boundaries.
2. **P2:** move configuration/permissions/task ownership into Core.
3. **P3/P4:** formalize Sender and WeChatAgent contracts as separate adapters; create
   `packages/adapter-wechatagent` and version/compatibility checks.
4. **P5:** connect the existing UI, keeping Mock as a selectable development provider.
5. **P6–P8:** add providers and high-risk automation only after contract and cancellation tests.
6. **P9:** release/CI/public-visibility decisions with explicit owner approval.

No step in this migration permits bypassing the existing production safety boundaries.

---

## 4. Trust boundaries

| Boundary | Rule |
|---|---|
| UI → Core | authenticated, typed API; no direct worker-state mutation |
| Core → Provider | explicit selection; no silent fallback |
| Core → Sender | requested target verified before device/UI mutation |
| Core → WeChatAgent Adapter | version/compatibility and connection evidence before WeChat voice |
| Sender → WeChat | only trusted target; identity re-checked before recording |
| Repository → GitHub | no secrets, private chat data, audio, runtime state or screenshots |
| Agent → production | high-risk operations require explicit user authorization |

---

## 5. Non-goals for the current repository

- Reimplementing the voice pipeline.
- Bundling Qwen model weights or `whale-v1` audio.
- Bundling WeChatAgent or WeChat Hook binaries.
- Maintaining an unsynchronized private full fork of WeChatAgent.
- Providing an unaudited one-click production installer.
- Claiming group voice support before real group identity verification exists.
