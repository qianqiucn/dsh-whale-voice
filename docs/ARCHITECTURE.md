# Whale Voice Architecture

This document separates the **current repository** from the **target system**. Do not read the
target diagram as implemented functionality.

---

## 1. Current architecture (implemented in this repository)

```text
DSH host
  ├─ sidebar.panellist slot
  │    └─ whale-voice icon
  ├─ main slot (key: whale-voice)
  │    └─ client.js
  │         ├─ client.template.js  app shell, slots, components, WhaleGlyph
  │         ├─ pages.js            eight view components
  │         ├─ setup.js            first-run wizard / component manager
  │         └─ client.css          scoped visual system
  └─ Host row (`index.js`)
       ├─ read-only loopback route /whale-voice/setup/*
       ├─ token-protected window.__WHALE_SETUP__ bridge
       └─ core/detect.mjs
            ├─ packages/adapter-wechatagent (read-only manifest/version/runtime/health evidence)
            ├─ Voice Sender manifest/runtime/health evidence
            └─ Qwen /health model+voice evidence (current reference provider only)
```

Properties:

- The client bundle is UI-only; the Host row exposes a **read-only** Core bridge and detector.
- No npm runtime dependencies.
- The Host route reads only explicitly configured roots, small manifests, process liveness and fixed
  loopback health endpoints. It does not read Hook/audit tokens, chat databases or arbitrary paths.
- Phase 4B-1 adds a sandboxed single-file config store and test-only HTTP API. It is not registered on
  the production Host and does not write production configuration; see
  [CONFIG_WRITE_API.md](CONFIG_WRITE_API.md).
- Phase 4B-2A adds `core/config-coordinator.mjs`, an **isolated** multi-source coordination protocol
  over injected source adapters and a trusted test sandbox. Plans/journal/recovery are tested with
  in-memory fixture adapters and a Fake Runtime; no production adapter, Host route or service reload
  exists. See [CONFIG_COORDINATION.md](CONFIG_COORDINATION.md).
- Phase 4B-2B-1 is a **read-only capability audit** of the real Bridge, Sender and WeChatAgent
  interfaces (read timing, write APIs, revision/apply evidence). It adds no production adapter and
  no write route; it defines the minimal owner-API integration plan. See
  [PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md).
- Phase 4B-2B-2a adds `core/capabilities.mjs` (schema v3, Surface-level read/hot-reload/restart
  semantics), `core/capability-view.mjs` (pure UI projection), two read-only Host routes
  (`/whale-voice/setup/capabilities` and `/capabilities/status`) and frontend status panels. No
  write route or component control is added. See [CAPABILITY_API.md](CAPABILITY_API.md).
- No component start/stop, installation, update, driver change, WeChat send or audio generation.
- Styles are plugin-scoped and use DSH theme tokens where appropriate.
- The UI explicitly labels demonstration data as Mock.
- The first-run setup wizard reads only the token-protected
  `window.__WHALE_SETUP__.getStatus()` bridge; see [SETUP_API.md](SETUP_API.md).
- The host route and bridge require a page/DSH reload to activate after a host-plugin change. No DSH
  or production service restart is performed by this repository.

### Build boundary

```text
client.css ──────────┐
pages.js ────────────┼─ build.mjs ─→ client.js ─→ DSH web client
setup.js ────────────┤
client.template.js ──┘

index.js ─→ core/detect.mjs ─→ core/server.mjs (isolated tests only)
core/config-schema.mjs + core/config-store.mjs (isolated single-file store; no production Host route)
core/isolated-write-server.mjs (test-only write API; not imported by index.js)
core/config-coordinator.mjs (isolated multi-source plan/journal/recovery; fixture adapters only)
docs/PHASE4B2B1_COMPONENT_AUDIT.md (read-only component capability audit; no code path)
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
  ├─ TTS/SVC task state and routing
  ├─ capability + connection state
  ├─ unified voice library + audio artifact management
  ├─ TTS Provider Registry (10 candidates; all DESIGN_ONLY, none implemented)
  │    ├─ Qwen3-TTS reference
  │    ├─ local Piper / Kokoro / sherpa-onnx / IndexTTS candidates
  │    ├─ cloud Azure / ElevenLabs / Gemini / OpenAI candidates
  │    └─ custom HTTP candidate
  ├─ SVC Engine Registry (Seed-VC / RVC candidates; separate from TTS)
  └─ redacted diagnostics

Whale Relay Core（鲸递）— target component, not implemented
  ├─ safe delivery + deduplication + target verification
  ├─ UI Automation adapter (current Voice Sender path is the existing execution backend)
  ├─ optional future Native Hook
  └─ delivery status

WeChatAgent Adapter (REQUIRED for WeChat)
  └─ sourcepro5/WeChatAgent (access, account/session identity, existing authorization)
```

### Responsibilities

**Frontend:** presentation, permission confirmation, task visibility, diagnostics and capability
negotiation. It must never send keyboard/mouse input or mutate worker-internal state directly.

**Core:** one source of truth for TTS/SVC task lifecycle, cancellation, provider management, the
unified voice library and audio artifact management. All sensitive decisions belong here, not in the
UI.

**TTS providers:** pluggable local/cloud/custom implementations with explicit selection. The
provider contract, registry, v2 config proposal and migration tests are in TTS-A
(`core/tts/`, [TTS provider architecture](TTS_PROVIDER_ARCHITECTURE.md)). Ten TTS candidates are
listed; none is implemented or selectable. There is no silent fallback, no credential leakage and no
committed API key. Qwen3-TTS is the current reference implementation, not a global default.

**Qwen local worker (10-A candidate, OFFLINE):** the Qwen3-TTS provider is a separate explicitly
configured child process (`workers/qwen3_tts_worker.py`) behind a narrow versioned NDJSON protocol and
`core/tts/qwen-supervisor.mjs`. Core never imports `qwen_tts`/torch itself. The worker loads the
audited package and local model only on a real synthesis, with `local_files_only=True`; it sets
offline environment variables and installs an in-process network guard before the import so the
nested loader chain cannot download, and it re-audits the model directory, configuration digest and
trusted clone reference immediately before each SDK call (realpath inside the allowed root,
existence, size, dev/ino, held fd) instead of trusting a startup stat. Clone reference bytes are
read through the audited fd, checked against a SHA256 baseline and handed to the SDK as a
`data:audio` value. The actual model load runs against a private audited snapshot: every regular file
is copied with a SHA256 baseline (no hardlinks; an 8 GiB copy budget is shared across files and
deducted before each chunk write, so a cumulative overrun fails at the write boundary), and the
original tree/config are re-audited after loading. A model directory swapped for an out-of-root
junction during loading therefore cannot feed the SDK an outside config, and a same-size source
rewrite cannot change the copied content. Snapshots live in the supervisor-owned worker temporary
directory; the active parent is registered under a lock before any child mkdir/copy, and health
cleanup skips and retains active/build-in-progress registrations. The worker cleans them on
shutdown/EOF, a denied cleanup keeps a retryable `snapshotCleanupPending` fact with host temp cleanup
as the final owner. The
candidate model is committed to the cache only after validation; load-time cancellation, audit failure
or an exception discards it so the next request reloads, while a normally completed valid cache
survives ordinary cancellation. Runtime dependency health distinguishes a missing module from a
resolvable module whose import raises ImportError, which stays degraded until a successful import and
is not downgraded by a later missing-path request. Each
supervisor start owns one process generation with an operation table; an `error` event is not an
exit, an unconfirmed exit is a failure, failed temp cleanup stays owned/retryable, and occupancy is
released only by a complete terminal message correlated through its issued message id, request id and
exact model/backend/voice identity; invalid late messages keep the recovery correlation, and a start
failure is scoped to its own generation.
The provider result is non-persisted (`PENDING_ROUTER`) and the provider never creates a Task or sends
WeChat. Real model/Host/Artifact integration remains OPEN; see
[TTS_QWEN_PROVIDER.md](TTS_QWEN_PROVIDER.md) and [ADR-018](DECISIONS.md).

**IndexTTS-2.5 local worker (10-B candidate, OFFLINE):** the IndexTTS provider mirrors the local
worker boundary with its own `core/tts/index-tts-{contract,worker-protocol,supervisor,adapter}.mjs`
and `workers/index_tts_worker.py`. The fixed `indextts` package is still version 2.0.0 while the
target model/interface is IndexTTS-2.5 (`infer_v2_5.IndexTTS2`); the worker therefore checks both the
package metadata and `config.yaml version: 2.5`, and never treats a package/name match as a 2.5 proof.
IndexTTS is clone/emotion-only: preset voices and VoiceDesign are rejected, the eight-float emotion
vector order and fixed modes come from the model card, and text emotion is unavailable unless the
QwenEmotion auxiliary directory exists and the candidate is constructed with `use_qwen_emo=True`.
The worker snapshots every model file byte-for-byte under the supervisor temp directory (no
hardlinks, shared 8 GiB budget enforced before each chunk write), copies audited reference bytes into
stable private files instead of passing re-openable source paths, requires already-local auxiliary
models so the upstream `ensure_models_available` download path is never entered, and installs the
offline environment plus in-process socket/urllib guard before importing the SDK. Output is validated
as 22050 Hz mono PCM16 WAV, not Qwen's 24 kHz format. The provider result is non-persisted and the
provider never creates a Task, Artifact or delivery. The fixed licence is the bilibili model-use
agreement (with MAU/revenue commercial thresholds), **not Apache-2.0**; dependencies/tokenizer/
private reference rights remain UNKNOWN. Real weights/GPU/Chinese quality/Host/Artifact remain OPEN;
see [INDEX_TTS_PROVIDER.md](INDEX_TTS_PROVIDER.md) and [ADR-019](DECISIONS.md).

**SVC engines:** a separate future task type (Seed-VC/RVC candidates) that converts existing
speech/singing audio instead of text. It shares the voice library, audio pipeline and task system, but
is not in the TTS Provider Registry and is not implemented. See `core/svc/`.

**Whale Relay Core（鲸递）:** target delivery layer for safe delivery, UI Automation adapter, optional
future Native Hook, delivery status, deduplication and target verification. It is **not implemented**
in this repository; the existing Voice Sender UI Automation path remains the current execution backend.
Relay is the only future layer allowed to hand audio to WeChat-facing delivery.

**Voice Sender:** independent Windows component for audio device handling, UI automation and native
voice bubbles. It must expose a versioned contract and retain its own safety checks.

**WeChatAgent adapter:** required bridge to the independent sourcepro5/WeChatAgent platform. It
owns version/compatibility discovery, connection health, target identity evidence, account/session
identity, existing authorization and result feedback. It is not an optional TTS feature and must not
be replaced by a second WeChat bot inside Whale Voice. Display names are not sufficient for group
identity. WeChatPYAPI or PadChat-SDK are **not** WeChatAgent extensions and are not architectural
dependencies; they remain external research candidates only.

**Delivery boundary:** no TTS provider or SVC engine may send WeChat messages, mutate a target or
write a Worker permit. Their result is an audio artifact with `PENDING_ROUTER`; Relay/Core owns
subsequent delivery decisions.

### Planned protocol principles

- Request IDs are idempotency keys.
- Exactly one UI task may own the sender at a time.
- `UNKNOWN` is terminal; it is never retried automatically.
- Target identity must be resolved from trusted configuration plus evidence, never model text.
- Configuration and credentials are owned by Core, never by page components.
- TTS/SVC engines return artifacts only; no Provider or SVC engine may send WeChat directly.
- Relay/Core is the only delivery decision layer; deduplication and target verification happen there.
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

**Kokoro-82M local worker (10-C candidate, OFFLINE):** the preset-only Kokoro provider uses
`core/tts/kokoro-{contract,worker-protocol,supervisor,adapter}.mjs` and
`workers/kokoro_worker.py`. It fixes `hexgrad/kokoro@dfb907a0…`, `kokoro 0.9.4` and
`hexgrad/Kokoro-82M@f3ff3571…` v1.0; code/model are Apache-2.0 while dependencies, voice tensors and
Misaki/espeak G2P/dictionaries remain separately UNKNOWN. The worker is static at hello/health/
discover and only imports `kokoro` for a real synthesis. It snapshots the small model directory
byte-for-byte, copies trusted local voice `.pt` files to stable private paths, requires local
config/weights/voices/G2P resources, installs offline env plus the in-process network guard, and
uses `KModel(config=…, model=…, disable_complex=True).to("cpu")` with
`KPipeline(lang_code, model=model, device="cpu")`. Output is validated as 24 kHz mono PCM16 and
multiple chunks are joined with a fixed short silence. Clone/voice-design/emotion are not exposed;
the result is non-persisted and no Task/Artifact/delivery is created. See
[KOKORO_PROVIDER.md](KOKORO_PROVIDER.md) and [ADR-020](DECISIONS.md).

### Plan 11 cloud/custom boundary (offline)

Plan 11 adds a separate credential/cost/network boundary above the provider-neutral contracts:

```text
Core configuration + consent + cost budget + credentialRef
        -> cloud-credentials.mjs (DPAPI CurrentUser, exact ref, atomic ciphertext)
        -> cloud-cost.mjs (integer character budget; reserve/commit/UNKNOWN)
        -> cloud-http-security.mjs (HTTPS/numeric loopback, pinned DNS, no redirect, bounded stream)
        -> azure-speech-adapter.mjs | custom-http-adapter.mjs
        -> cloud-provider-pipeline.mjs (non-persisted PENDING_ROUTER result, Chinese projection)
```

The adapters return `persisted:false`; they never create a Task, Artifact, delivery or WeChat send
path. The browser never receives the key/credentialRef/endpoint, and no Host route is registered in
this unit. Network is disabled by default; an explicit trusted target, text-upload consent, resolved
credential and known cost bound are all required before a request. A Fake/injected success is not
`AVAILABLE`; only a real live response can set the verified state. See
[CLOUD_PROVIDERS.md](CLOUD_PROVIDERS.md) and [ADR-021](DECISIONS.md).
