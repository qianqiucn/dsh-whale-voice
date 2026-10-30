# Whale Voice Roadmap

Status legend:

| Label | Meaning |
|---|---|
| `DONE` | Implemented and verified with evidence in this repository/runtime |
| `OFFLINE` | Implemented and covered by offline checks, not a real integration test |
| `MOCK` | Demonstration only; no production effect |
| `IN PROGRESS` | Actively being built |
| `PLANNED` | Not started |
| `BLOCKED` | Cannot proceed without a decision or an external dependency |

This roadmap is intentionally conservative. A roadmap item is not complete merely because a
prototype exists outside this repository.

**Platform dependency:** WeChat messaging/voice integration depends on the independent
[sourcepro5/WeChatAgent](https://github.com/sourcepro5/WeChatAgent) project. It is a required
platform layer, not an optional TTS feature. TTS providers may be swapped freely; WeChatAgent may
not be removed or replaced by a second WeChat bot in Whale Voice.

**Next development gate:** the read-only PR stack (#3–#8), Phase 4B-1 (#9), Phase R1 (#10/#11),
Phase 4B-2A (#12), the 4B-2A handoff (#13), the 4B-2B-1 audit (#14) and Phase 4B-2B-2a (#15) are
integrated into `main` with merge commits; current `main` is `bf9cf66`. Phase 4B-1 and Phase 4B-2A
remain `OFFLINE` (isolated store/coordination; test-only APIs; no production route). Phase 4B-2B-1
completed the read-only audit. Phase 4B-2B-2a is **`INTEGRATED`** after real DSH Host/GUI acceptance
(schema v3, eight-page coverage, read-only). **TTS-A** has delivered a Provider-neutral audit, pure
contract/registry/v2 migration design and isolated tests (`DESIGN`/`OFFLINE`); the next step is
**TTS-B** provider service + neutral configuration, then **TTS-C** real adapters. Plan 06-B adds an
offline Fixture provider-instance view and explicit capability negotiation on
`feature/plan06b-provider-instances` (R01–R30 + N01–N18, pure/no I/O); after the F01–F04 review
repair it is **`OFFLINE`** and merged via PR #24 at **M `ad25bc6`** (report 0013). Plan 06-C adds one
synchronous RVC Fixture dispatch (`core/audio/provider-dispatch.mjs`, T01–T26 + F01/F02) over that
negotiation and the existing RVC Fake gateway; after the F01/F02 review repair it is **`OFFLINE`** and
merged via PR #25 at **M `b9336fb`** (report 0016). Plan 06-D adds a Fixture installation/resource
admission wrapper (`core/audio/provider-readiness.mjs`, D01–D27) with three-state installation and
CPU/GPU/REMOTE admission; it is **`OFFLINE`** and merged via PR #26 at **M `a1bdcbb`** (report 0019).
A docs-only F01 adds the
D27 cross-category evidence table and reason-namespace clarification. Plan 08-A adds a strict Fixture
shared voice-asset library and explicit Provider binding resolver (`core/audio/voice-assets.mjs`,
V01–V26 / 28 tests): one `voiceProfileId` maps to per-instance TTS voice ids or RVC model ids with
three independent rights layers, revisions, availability/expiry and exact canonical/Provider reference
matching; it is **`OFFLINE`** / `FIXTURE_ONLY` / `NOT_INTEGRATED` and merged via PR #27 at
**M `df4e4b7`** (report 0022). Plan 08-B adds a strict Fixture source-Artifact library and one
resolver (`core/audio/source-artifacts.mjs`, S01–S22 / 25 tests) that reuses the 08-A binding once
and checks TTS text or RVC input-audio metadata against the same request; it is **`OFFLINE`** /
`FIXTURE_ONLY` / `NOT_INTEGRATED` and merged via PR #28 at **M `3182ca1`** (report 0024). Plan 08-C
adds one synchronous composition (`core/audio/task-fixture-runner.mjs`, C01–C20 / 20 tests) from the
source check to the 06-D gate, at most one RVC Fixture dispatch and the existing AudioTask actions;
success ends at `ARTIFACT_READY` only, with no save/delivery/send. It is **`OFFLINE`** /
`FIXTURE_ONLY` / `NOT_INTEGRATED` and merged via PR #29 at **M `b9f663c`** (report 0026). Plan 08-D-A
adds an isolated persistent task catalog (`core/audio/task-catalog.mjs`, D01–D20 + F01–F05 +
R01–R03 + S01–S03 + C03a–C03h / 45 tests) that persists only initial `CREATED`/`BLOCKED_RIGHTS`
records, issues owner ids and deduplicates by scope/key with bounded fd reads, full short-write
completion, atomic temp+fsync+rename+read-back, post-commit identity checks, close-failure phase
propagation, one close per open lease, cleanup trust-failure classification, one-shot cleanup
eligibility and `WRITE_UNKNOWN` locking; it is **`OFFLINE`** / `FIXTURE_ONLY` / `NOT_INTEGRATED`
(035–038 storage-boundary repairs included, merged via PR #30 at **M `2090943`**, report 0032) and has no
execution, delivery or cross-process recovery. Plan 08-D-C
adds a persistent owner (`core/audio/task-owner.mjs`) over one private extracted shared store
(`core/audio/fixture-task-store-internal.mjs`): one real catalog birth task is claimed atomically,
the original existing-record engine runs at most once, its immutable identity is revalidated and a
`FINAL` record with `SIMULATED`/`NO_EXECUTION` is saved; repeats only read and a confirmed claim
without a trusted FINAL is reported as owner `UNKNOWN`. Plan 08-D-C-F01 then closes the residual
gates: fresh restricted birth/association re-reads at the factory, `run`/`get` and the
after-claim/after-engine/after-FINAL checkpoints (a broken or externally changed birth file stops
the engine instead of being found by the next `get`), a thin engine adapter that requires the frozen
13-key envelope, the four fixed safety flags and **complete equality with the real
`projectAudioTask`**, the fixed first-attempt `TASK_OWNER_EXECUTION_UNKNOWN` (later reads report the
safe UNKNOWN projection), and a private store that only exposes the two fixed files (no caller
name/budget/parser, no third file). The v1.1 close-out moves the association rule into the real owner
write transaction (current read, pre-rename check of the exact bytes, post-rename confirmation), so a
legal birth change after the FINAL temp fsync and before its rename stops the commit and keeps the
confirmed CLAIMED bytes, and an association failure locks the capability for owner and catalog
handles alike. `value.task` is descriptor-guarded before comparison (no getter invocation, no
hidden/Symbol key loss). D-C owner tests 20 (C01–C08, C10, T01–T06, E01–E05); specialty 113
(112 pass + 1 platform skip); full suite **658 / 656 pass / 2 platform skips / 0 fail**;
`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, PR not merged. Plan 08-E-A adds a bounded, storage-free WAV byte inspector (`core/audio/wav-byte-inspector.mjs`): caller bytes enter through a native Uint8Array/Buffer slot check, only the view's own offset/length is copied, and the complete RIFF/WAVE container is walked inside 50 MiB / 300000 ms / 128-chunk budgets (PCM16, six sample rates, 1-2 channels) to produce a deep-frozen 19-key measurement (frames, unrounded duration, peak, full-scale count, whole-file SHA256) or one of 8 fixed codes. It performs no I/O, no playback or decoding and no Task/owner/store/ID/delivery action; The F01 close-out classifies a real detached carrier as `INVALID_BYTES` (empty bytes remain `INVALID_CONTAINER`) through a species-free probe with zero user-code calls, delivers the W06 carriers at the real native level, and adds a legal exactly-50 MiB success control plus seven inner chunk refusals. W01-W08 tests 8, full suite **666 / 664 pass / 2 platform skips / 0 fail**; `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, merged via PR #34 at **M `55675a7`**. Plan 08-E-B then adds the isolated single-pack Fixture WAV artifact library (`core/audio/artifact-library.mjs`, 4 exports, 16 fixed codes, L01-L10 / 13 tests) and its private store (`core/audio/fixture-artifact-store-internal.mjs`): a pre-queue owned copy of the real caller view, one verified re-inspection of exactly the encoded bytes, canonical STORED entries with `origin: FIXTURE_IMPORT`, library-issued `artifact:fixture-bytes-<32hex>` ids, `(scope, requestKey)` idempotency, GRANTED/expiry gates, fresh mutable readBytes copies, logical `DELETED` tombstones without payload, bounded strict reads with real re-inspection, and a single atomic temp+fsync+read-back+rename transaction whose pre-rename failures are `WRITE_REJECTED` and whose rename-attempt uncertainty keeps the real bytes and locks the artifact domain (`WRITE_UNKNOWN`/`LIBRARY_UNKNOWN`, no retry/rollback). Budgets: 1 MiB item, 4 MiB decoded total, 32 entries including tombstones, 6 MiB pack; the Task catalog/owner domain stays separate. The F01 close-out (060) then closes the remaining gates: one shared identity algorithm recomputes every STORED/DELETED `identityHash` (`STORE_INVALID`, no repair); the captured temp is re-confirmed after the last current read and before the single rename (`STORE_CHANGED` + lock, zero rename, old pack kept, foreign temp never cleaned); any extra public confirmation failure after a committed delete is `WRITE_UNKNOWN` with the shared lock and the real tombstone kept; and the L06 non-canonical control is a genuine padded-base64 case with L10 split into explicit platform-SKIP-aware `L10a`-`L10f` segments. The 061 v1.1 follow-up maps an oversize foreign temp (6 MiB+1) at that same final re-read to `STORE_CHANGED`/`$` (not `RESOURCE_LIMIT`), keeping zero rename, the old pack untouched, the foreign temp retained and every handle locked while user/official-pack budget errors stay `RESOURCE_LIMIT`. Tests 22 (local 21 pass + 1 platform skip); full suite **688 / 685 pass / 3 platform skips / 0 fail**; `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, merged into `main` via PR #35 at **M `78c3ea035e1c0a9e18d788503d9e65936022e505`** (report 0058). Plan 08-E-C adds a pure, bounded PCM16 fixture producer (`core/audio/fixture-wav-producer.mjs`, 4 exports, 7 fixed codes, C01–C08 / 8 tests): five own data fields only, budget-first (`frameCount <= floor((1048576-44)/(channels*2))`, mono 524266 / stereo 262133 exactly 1 MiB) before allocation, a standard 44-byte PCM16 header with `SILENCE` or the fixed `EDGE_SEQUENCE` cycle, exactly one real 08-E-A re-inspection behind a descriptor-only 19-key guard (`DEPENDENCY_FAILURE` fail-closed with no bytes), and a frozen `{ok,value}` with `origin: SYNTHETIC_FIXTURE` and a fresh mutable `Uint8Array`; it signs no Task/Artifact id and is never a TTS/RVC result or ownership proof. Tests 8; full suite **696 / 693 pass / 3 platform skips / 0 fail**; `OFFLINE` / `SYNTHETIC_FIXTURE` / `NOT_INTEGRATED`, new PR open and unmerged. The F01 v1.1 close-out tightens the inspector dependency to its exact fixed message (seventh C06 fault), adds passive real `Uint8Array` output-construction observation to C04 (two legal 1 MiB views that are the returned bytes, three rejects with zero construction/inspection) and a C08 `maxByteLength === ARTIFACT_LIBRARY_LIMITS.maxItemBytes` assertion; tests stay 8. Plan 08-E-D then adds a sixth internal engine export `runExistingFixtureTaskBytesOnce` inside the same flow: after the real Fake SUCCESS validation it derives one bounded producer request from the verified 44100 Hz `durationMs` (whole frames first, then the 1 MiB budget: 10/1000/11880 ms → 926/88244/1047860 bytes; 1 ms and 11890 ms refused before any producer call), calls the real 08-E-C producer once behind a native-slot guard, makes one `BEGIN_PROCESS` and returns a private `{record, result, production}` at `PROCESSING` with `outputArtifactRef=null`/`hasOutput=false` and no ATTACH/SAVED/second Task; producer faults are one `TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE` with null record/production. D01–D07 / 7 tests; suite **703 / 700 pass / 3 platform skips / 0 fail**; `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `NOT_INTEGRATED`, new PR open and unmerged. The E-D-F01 (067) repair closes the review groups in the same private flow: every bytes-entry exit is exactly `{record, result, production}` with a frozen root and `production:null` on the four legal source/readiness/TTS/dispatch blocks (legacy `record`/`result` deep-equal, legacy two-key root unchanged); the thin carrier guard now uses native internal slots only (`%TypedArray%` brand/length/byteLength/byteOffset/buffer, `ArrayBuffer` byteLength/resizable/detached, prototype identity), refusing `Int8Array`/resizable `ArrayBuffer` with one `TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE/$` and never executing own `byteLength`/`@@toStringTag` getters; the tests add full record/result equality, a legal TTS control, passive output-construction observation, accessor/conflict/invalid-record/rights/`SAVED`/`UNKNOWN` representatives and one complete executable frame in the internal doc, with tests still 7 and the suite unchanged at **703 / 700 pass / 3 platform skips / 0 fail**. E-D overall remains `IN_PROGRESS` / `REVIEW_REQUIRED` until 067 acceptance; PR #37 stays open and unmerged.
Plan 08-D-B
adds the single internal engine (`core/audio/task-fixture-engine-internal.mjs`, four exports) and a
compatibility facade; `runExistingFixtureTaskOnce({scopeId, record, input})` reuses a complete
initial record with original TaskId/scope/`observedAt` without a second create, while the full record
stays private and the old public envelope is unchanged. New D-B tests 28; full suite **638 / 636 pass / 2 platform skips / 0 fail**. The F01 v1.6 evidence close-out keeps product code read-only and separates the test-only worker entry from the injected fault, closing the three-stage legal-refusal/bad-protocol matrix, measured `depth12`/13 partition bounds, the legal cross-scope voice library, legal eight-domain identity controls, the `REMOTE` readiness policy, full-graph output isolation and the gate/dispatch vs RVC-result error split. The v1.7 patch then makes every validator wrapper delegate to the real validator first (inject only after a real `ok:true` control), separates input-delete / success-payload `delete` / `undefined` sources, and reuses the same eight protocol kinds at the existing/draft/public `final` entry, with three legal-frame worker counts. It is **`OFFLINE`** / `FIXTURE_ONLY` /
`NOT_INTEGRATED` and adds no persistent claim, cross-call idempotency, recovery, Host/GUI or real
generation. None
delivers real adapters, real byte/codec/hash verification,
save/delivery or any send path. Phase 4B-2B-2b
(Sender automation write) remains **NOT STARTED** and separate. Production config writes require
separate authorization; Voice Sender final independent safety verification remains required before
real sending. See [TTS_PROVIDER_AUDIT.md](TTS_PROVIDER_AUDIT.md),
[CAPABILITY_API.md](CAPABILITY_API.md) and
[PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md).

---

## P0 — Existing baseline, backup and safety isolation

**Goal:** Preserve the already-working frontend and separate development from the live voice chain.

**Core tasks:**
- Record the current UI baseline (screens, build output, host compatibility).
- Keep all real Voice Sender / WeChatAgent / Qwen / `whale-v1` assets outside this repository.
- Define read-only boundaries for frontend development.
- Establish Git history and a reviewable initial commit.
- Maintain an isolated Playwright UI harness for DOM/layout/Console checks; never debug the
  production DSH Electron window without separate authorization.
- Maintain [AI_CONTEXT.md](AI_CONTEXT.md) as a recovery summary and [DECISIONS.md](DECISIONS.md) as
  the architecture decision log; neither replaces code, Git state, tests or named authority docs.

**Dependencies:** DSH client plugin runtime; existing local installation; user approval for the
private GitHub repository.

**Acceptance:** The plugin still builds and loads; no production service is modified; the repository
contains no secrets, private chat data, audio, runtime state or screenshots.

**Current status:** `DONE` for the local baseline and repository initialization. The live backend is
still external and was not changed by this repository work. The isolated Playwright UI harness is
available for development (`npm run test:ui`); real DSH Electron debugging remains unsupported and
unauthorized. `AI_CONTEXT.md` and `DECISIONS.md` are maintained as cross-session memory and decision
records, explicitly subordinate to repository evidence. A lightweight Markdown encoding test guards
the documentation against the previously observed mojibake regression.

---

## P1 — Modular architecture and unified protocol

**Goal:** Define modules and a versioned protocol before adding real integrations.

**Core tasks:**
- Define `WhaleVoiceCore` boundaries: config, permissions, routing, task state.
- Define provider and sender adapter interfaces.
- Define request/response/error schemas and idempotency rules.
- Define how the frontend discovers capability and connection state.
- Add contract tests with fakes only.

**Dependencies:** P0; agreement on runtime packaging.

**Acceptance:** A document plus TypeScript/JS modules and contract tests; no production service
connection required; no secret values.

**Current status:** `PLANNED`.

---

## P2 — Core configuration, permissions and task management

**Goal:** Make one Core own configuration and task lifecycle instead of UI-only Mock state.

**Core tasks:**
- Typed configuration with schema validation and migration.
- Private/group allow-lists with explicit identity evidence.
- Task states, cancellation, retries prohibition for unknown outcomes.
- Config/status APIs and UI capability negotiation.
- Audit-safe diagnostics with redaction.

**Dependencies:** P1; DSH client connection APIs; explicit permission model.

**Acceptance:** Config round-trips, invalid config fails closed, task state transitions are tested,
and no secret or private mapping is logged.

**Current status:** Phase 4A read-only config snapshot and UI readout are `INTEGRATED` in the live DSH
Host (port 59194): 401-protected config routes, trusted bridge, eight GUI pages and refresh verified.
Saved-vs-active is separated; Bridge and Worker safety layers are distinct. Phase 4B-1 is merged and
remains **`OFFLINE`**: trusted sandbox capability, strict schema, v0→v1 migration, HMAC revision,
`expectedRevision` conflict detection, atomic save/rollback, read/write state separation and a
test-only API. Phase 4B-2A is **`OFFLINE`** and merged via PR #12: isolated source adapters, change
plan, journal/recovery, save/apply split and Fake Runtime; no production adapter. Phase 4B-2B-1 is
**AUDIT COMPLETE / `OFFLINE`**: real read timing, write interfaces, revision/apply evidence and
blockers are documented in [PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md). Phase
4B-2B-2a is **`INTEGRATED`** after real DSH Host/GUI acceptance (PR #15): schema v3 Surface-level
capability/status, Host GET routes and eight-page read-only frontend visualization. TTS-A is
**`DESIGN`/`OFFLINE`**: Provider-neutral audit, contract, registry and v2 migration proposal; no
provider is implemented. Phase R1 is **COMPLETE** (PR #10/#11). Production write, multi-file
transaction, cross-process CAS, provider adapters and runtime apply remain `PLANNED`; no production
write exists. Phase 4B-2B-2b is **NOT STARTED**. Live No-Core/timeout/invalid-schema/stale injections
remain `OFFLINE` tests.

---

## P3 — Voice Sender independent component

**Goal:** Treat the Windows Voice Sender as a separately versioned, testable component.

**Core tasks:**
- Stable local HTTP contract and health/status schema.
- Request idempotency, queue serialization, cancellation and device restore diagnostics.
- Explicit preflight states for locked screen, missing devices and foreground denial.
- Offline/fake mode with no UI automation.
- Version handshake with Core.

**Dependencies:** Existing Windows Voice Sender prototype; user authorization for any UI automation
tests.

**Acceptance:** Sender contract tests pass; no real message is sent in CI; failure/cancel states are
distinguishable.

**Current status:** `OFFLINE` prototype exists outside this repository; integration into this
repository is `PLANNED`. The current voice path is the UI Automation Sender. A WeChatAgent-native
voice backend is **UNSUPPORTED** in upstream 0.3.9; see
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md). No native prototype is authorized.

---

## P4 — WeChatAgent required adapter

**Goal:** Integrate WeChat capability through the independent
[sourcepro5/WeChatAgent](https://github.com/sourcepro5/WeChatAgent) project. Whale Voice does not
implement a second WeChat reader or bot.

**Core tasks:**
- Create `packages/adapter-wechatagent` as the only version-specific WeChat integration layer.
- Detect installation, running instance, version, Bridge/session health and effective config.
- Define supported message/event and target-identity contracts.
- Map trusted targets via stable IDs, not display names alone.
- Implement the missing/incompatible WeChatAgent UI state and disable WeChat voice until checks pass.
- Handle bridge disconnects, stale sessions and message dedupe.
- Document Windows/WeChat/DSH/WeChatAgent version constraints and upstream patch policy.

**Dependencies:** P1/P3; sourcepro5/WeChatAgent availability and stable interfaces; authorized test
environment. WeChatAgent is a **required platform dependency** for WeChat features, not an optional
plugin.

**Acceptance:** Adapter contract tests pass; an absent/incompatible WeChatAgent opens the rest of the
plugin but disables WeChat voice with the documented install message; unavailable bridge fails
closed; no fake online state; no message replay; no private fork/unsynchronized patch.

**Current status:** `OFFLINE` — read-only installation/version/process/health evidence exists in
`core/detect.mjs` and `packages/adapter-wechatagent`; isolated tests pass. Event subscription,
account/group identity, send-result feedback and the full version-pinned Adapter remain `PLANNED`.
Live host integration is not verified. Native outbound voice is absent: the 0.3.9 adapter supports
text/sticker only; see [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

---

## P5 — Whale Voice frontend real connection

**Goal:** Replace Mock data with Core APIs while retaining the current design.

**Core tasks:**
- Connection state, capability discovery and typed API client.
- Real service status, target verification and task activity.
- Permission changes with confirmation and audit feedback.
- Error states for disconnected/locked/blocked conditions.
- Keep Mock provider available for development and screenshots.

**Dependencies:** P1–P4, including the required WeChatAgent Adapter; real backend available for
authorized integration tests.

**Acceptance:** UI accurately distinguishes Mock, offline, connected, degraded and blocked states;
no optimistic claim of sent status; no direct UI automation from frontend.

**Current status:** `MOCK` frontend is done; real connection is `PLANNED`. The new `发送与安全` page
is front-end structure/disabled capability UI (`MOCK`); its Core contract is designed but not
implemented. See [SEND_SAFETY_API.md](SEND_SAFETY_API.md).

---

## P6 — Multi-engine TTS / SVC (local / cloud / custom)

**Goal:** Allow an explicitly selected local, cloud or custom TTS provider and a separate SVC task
type without silent fallback.

**Core tasks:**
- Provider registry with capability, health, version, cost/privacy and resource metadata (TTS-A
  design: `core/tts/provider-registry.mjs`; 10 TTS candidates, none implemented).
- Separate SVC engine registry/contract for Seed-VC/RVC; no SVC inference yet.
- Provider-neutral configuration with separate provider instances/models/voices/voice packs and
  protected credential references (TTS-A proposal: `core/tts/provider-config.mjs`).
- TTS-B: provider service, provider-aware status, remove Qwen-only TTS gating, neutral read-only UI.
- TTS-C: real local adapter, real cloud adapter after credentials/cost/privacy review, and custom
  HTTP adapter with endpoint validation and request limits.
- Shared voice library/audio pipeline/task system for TTS and SVC; Whale Relay Core（鲸递） owns safe
  delivery/UI Automation/dedup/target verification (target component, not implemented).
- Audio validation, timeout, cancellation and no automatic provider switch.

**Dependencies:** P1/P2; TTS-A design; user decision on providers, SVC, credentials and Relay Core.

**Acceptance:** Provider/SVC selection is explicit; missing credentials fail closed; no key is logged
or committed; Qwen offline does not make another provider unavailable; no Provider/SVC engine sends
WeChat directly.

**Current status:** TTS-A **`DESIGN`/`OFFLINE`**: audit, contract, 10 TTS candidates (incl. IndexTTS,
Google Gemini TTS, OpenAI Speech), 2 separate SVC candidates (Seed-VC/RVC), three-layer
Core/Relay/WeChatAgent design, v2 migration proposal and 16 isolated TTS/SVC tests. No candidate is
implemented; Qwen3-TTS is the current reference, `whale-v1` is the current personal voice, not a
product default. TTS-B/TTS-C are **NOT STARTED**.

---

## P7 — Installation wizard and one-click install

**Goal:** Provide a supported installation path without hand-editing DSH profiles.

**Core tasks:**
- Supported DSH plugin install flow and version checks.
- Four-step first-run wizard UI: WeChatAgent, Voice Sender, TTS, final checks.
- Six-state-safe frontend behavior: no Core, missing dependency, incompatible, installed, degraded,
  complete; demo mode must be explicit and must not write completion.
- Windows dependency checks and guided setup for external WeChatAgent, Voice Sender and Qwen;
- explicit version/compatibility gate before enabling WeChat voice;
- no unverified third-party installer download/execution.
- Upgrade/rollback and uninstall.
- Clear separation of plugin files and local runtime data.

**Dependencies:** P2–P6; release packaging and signing decisions; Core setup API.

**Acceptance:** Clean-machine install test, upgrade test, rollback test; no destructive default.
Frontend-only Phase 2 acceptance is limited to UI/navigation/state presentation and a failing-closed
no-Core state; it is not install acceptance.

**Current status:** Phase 2 wizard/component UI and Phase 3 read-only Core detection are implemented
and covered by isolated tests. Phase 3B is **INTEGRATED**: current DSH Host routes return 401, the
trusted bridge injects, Core reads the authorized `core.json`, and the real GUI shows WeChatAgent
`auth_required`, Sender offline, Qwen health valid, and unknown recovery/voice fields. Sender was not
started. PR #3–#8 are integrated into `main` with merge commits; the final PR #7 documentation union
does not revert PR #8 state. Live No-Core/timeout/invalid-schema/stale GUI tests remain `OFFLINE`, so
Phase 3B is not `VERIFIED`. Real installation, upgrade, rollback, TTS credentials and clean-machine
acceptance remain `PLANNED`; no one-click installer exists today.

---

## P8 — Group voice, emergency stop and WeChat auto-location

**Goal:** Add the highest-risk automation features only after identity and cancellation guarantees.

**Core tasks:**
- Stable real group identity mapping; no name-only matching.
- Automatic WeChat window discovery/restore/activation with explicit failure states.
- Global emergency stop and exact cancel states.
- Unified `发送与安全` page with emergency-stop, window/focus and game sections; unsupported
  capabilities remain disabled and cannot be represented as effective.
- Fullscreen/game protection and secure-desktop refusal.
- Authorized UI operation test plan before any real send.

**Dependencies:** P4/P5; Windows window-operation authorization; real group identity evidence.

**Acceptance:** Wrong-target and cancellation scenarios are proven in an authorized test; no resend
after UNKNOWN; no group is enabled without verified identity.

**Current status:** Backend prototype work exists outside this repository; frontend and repository
integration are `PLANNED`. Group voice is deliberately not enabled. The unified `发送与安全` page now
has the planned sections with unsupported controls disabled; real DSH GUI visual acceptance passed
for this `MOCK` page, but no global hotkey, window automation, game detection or cancellation backend
exists. See [SEND_SAFETY_API.md](SEND_SAFETY_API.md) and
[GUI_ACCEPTANCE_SEND_SAFETY.md](GUI_ACCEPTANCE_SEND_SAFETY.md).

---

## Native Voice Delivery Research (parallel, non-blocking)

**Status:** `RESEARCH_CANDIDATE` — not implemented, not integrated, not verified.

**Goal:** preserve the long-term possibility of native WeChat voice sending without weakening the
existing UI Automation path or creating duplicate delivery.

**Current evidence:**

- `ui-automation` — **SUPPORTED** existing Voice Sender path; historical native-bubble observation.
- `wechatagent-native` — **UNSUPPORTED** in installed 0.3.9 and public 0.4.0; text/sticker outbound only.
- `third-party-native` — **RESEARCH_CANDIDATE**:
  - WeChatPYAPI publicly documents `send_voice` (SILK, boolean), professional WeChat 4.1.12.26;
  - PadChat-SDK publicly documents `sendVoice` (SILK, `msgId`), old separate iPad-protocol service;
  - no current Windows 4.1.10.27, license, coexistence, receipt or bubble evidence.
- `auto` — **PLANNED**; no automatic cross-backend retry.

**Research rules:**

- Do not install third-party components, DLLs or services during document research.
- Do not upgrade/downgrade WeChat.
- Do not disable antivirus, Smart App Control or other security features.
- Do not bundle unlicensed DLLs or services.
- Do not treat API documentation as a working implementation.
- Do not start a native prototype until all admission gates in
  [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md) pass and the owner authorizes it.

**Priority:** the mainline remains Phase 4B → Phase 5 → Phase 6 → Phase 7. Native research may run in
parallel with source/license/API review, but its implementation is below Core configuration and
frontend usability. The existing Voice Sender is the stable default.

**Later extensions (not this round):** lightweight offline TTS installer guidance; sherpa-onnx /
Kokoro / Piper candidates; CPU/no-GPU operation; community voice packages; optional RVC; AI cover
features. These remain planned and are not coupled to native delivery.

---

## P9 — Performance, release validation and GitHub open-source readiness

**Goal:** Make the project maintainable and releasable without overstating maturity.

**Core tasks:**
- Automated unit/contract/UI checks with real coverage.
- Private repository baseline and branch/PR workflow.
- Release notes, versioning and license review.
- Performance and accessibility checks.
- Documentation and issue templates.
- Only then consider public release, with explicit owner approval.

**Dependencies:** P0–P8; CI reliability; license/asset review.

**Acceptance:** CI is meaningful; release artifact is reproducible; private data is excluded; owner
approves any visibility change or release.

**Current status:** `IN PROGRESS`: private repository initialization, documentation, build/behavior/
UI CI, Markdown encoding checks and 192 Node tests. PR #3–#15 are integrated into `main`; Phase 4B-1
is merged but remains `OFFLINE`; Phase 4B-2A coordination is merged and `OFFLINE`; Phase 4B-2B-1
capability audit is complete and `OFFLINE`; Phase 4B-2B-2a read-only capability/status projection is
`INTEGRATED` after real Host/GUI acceptance; TTS-A Provider-neutral design is `DESIGN`/`OFFLINE`;
Phase R1 is **COMPLETE**. The clean development baseline is `main` `bf9cf66` (PR #15 merge). No
release, no public visibility and no release artifact yet.

## Repository homepage readability

The Chinese homepage and isolated demo screenshots explain current capabilities and planned user
flows. The developer setup guide remains separate. This documentation work does not complete or
advance any runtime phase, installer, provider or delivery milestone.
