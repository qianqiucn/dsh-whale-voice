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
       └─ WeChatAgent Adapter
            └─ platform/version-specific bridge
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

**WeChatAgent:** platform adapter responsible for identity, bridge/session health and message
delivery constraints. Display names are not sufficient for group identity.

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
3. **P3/P4:** formalize Sender and WeChatAgent contracts as separate adapters.
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
| Sender → WeChat | only trusted target; identity re-checked before recording |
| Repository → GitHub | no secrets, private chat data, audio, runtime state or screenshots |
| Agent → production | high-risk operations require explicit user authorization |

---

## 5. Non-goals for the current repository

- Reimplementing the voice pipeline.
- Bundling Qwen model weights or `whale-v1` audio.
- Bundling WeChatAgent or WeChat Hook binaries.
- Providing an unaudited one-click production installer.
- Claiming group voice support before real group identity verification exists.
