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
`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, PR not merged. Plan 08-E-A adds a bounded, storage-free WAV byte inspector (`core/audio/wav-byte-inspector.mjs`): caller bytes enter through a native Uint8Array/Buffer slot check, only the view's own offset/length is copied, and the complete RIFF/WAVE container is walked inside 50 MiB / 300000 ms / 128-chunk budgets (PCM16, six sample rates, 1-2 channels) to produce a deep-frozen 19-key measurement (frames, unrounded duration, peak, full-scale count, whole-file SHA256) or one of 8 fixed codes. It performs no I/O, no playback or decoding and no Task/owner/store/ID/delivery action; The F01 close-out classifies a real detached carrier as `INVALID_BYTES` (empty bytes remain `INVALID_CONTAINER`) through a species-free probe with zero user-code calls, delivers the W06 carriers at the real native level, and adds a legal exactly-50 MiB success control plus seven inner chunk refusals. W01-W08 tests 8, full suite **666 / 664 pass / 2 platform skips / 0 fail**; `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, merged via PR #34 at **M `55675a7`**. Plan 08-E-B then adds the isolated single-pack Fixture WAV artifact library (`core/audio/artifact-library.mjs`, 4 exports, 16 fixed codes, L01-L10 / 13 tests) and its private store (`core/audio/fixture-artifact-store-internal.mjs`): a pre-queue owned copy of the real caller view, one verified re-inspection of exactly the encoded bytes, canonical STORED entries with `origin: FIXTURE_IMPORT`, library-issued `artifact:fixture-bytes-<32hex>` ids, `(scope, requestKey)` idempotency, GRANTED/expiry gates, fresh mutable readBytes copies, logical `DELETED` tombstones without payload, bounded strict reads with real re-inspection, and a single atomic temp+fsync+read-back+rename transaction whose pre-rename failures are `WRITE_REJECTED` and whose rename-attempt uncertainty keeps the real bytes and locks the artifact domain (`WRITE_UNKNOWN`/`LIBRARY_UNKNOWN`, no retry/rollback). Budgets: 1 MiB item, 4 MiB decoded total, 32 entries including tombstones, 6 MiB pack; the Task catalog/owner domain stays separate. The F01 close-out (060) then closes the remaining gates: one shared identity algorithm recomputes every STORED/DELETED `identityHash` (`STORE_INVALID`, no repair); the captured temp is re-confirmed after the last current read and before the single rename (`STORE_CHANGED` + lock, zero rename, old pack kept, foreign temp never cleaned); any extra public confirmation failure after a committed delete is `WRITE_UNKNOWN` with the shared lock and the real tombstone kept; and the L06 non-canonical control is a genuine padded-base64 case with L10 split into explicit platform-SKIP-aware `L10a`-`L10f` segments. The 061 v1.1 follow-up maps an oversize foreign temp (6 MiB+1) at that same final re-read to `STORE_CHANGED`/`$` (not `RESOURCE_LIMIT`), keeping zero rename, the old pack untouched, the foreign temp retained and every handle locked while user/official-pack budget errors stay `RESOURCE_LIMIT`. Tests 22 (local 21 pass + 1 platform skip); full suite **688 / 685 pass / 3 platform skips / 0 fail**; `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, merged into `main` via PR #35 at **M `78c3ea035e1c0a9e18d788503d9e65936022e505`** (report 0058). Plan 08-E-C adds a pure, bounded PCM16 fixture producer (`core/audio/fixture-wav-producer.mjs`, 4 exports, 7 fixed codes, C01–C08 / 8 tests): five own data fields only, budget-first (`frameCount <= floor((1048576-44)/(channels*2))`, mono 524266 / stereo 262133 exactly 1 MiB) before allocation, a standard 44-byte PCM16 header with `SILENCE` or the fixed `EDGE_SEQUENCE` cycle, exactly one real 08-E-A re-inspection behind a descriptor-only 19-key guard (`DEPENDENCY_FAILURE` fail-closed with no bytes), and a frozen `{ok,value}` with `origin: SYNTHETIC_FIXTURE` and a fresh mutable `Uint8Array`; it signs no Task/Artifact id and is never a TTS/RVC result or ownership proof. Tests 8; full suite **696 / 693 pass / 3 platform skips / 0 fail**; `OFFLINE` / `SYNTHETIC_FIXTURE` / `NOT_INTEGRATED`, new PR open and unmerged. The F01 v1.1 close-out tightens the inspector dependency to its exact fixed message (seventh C06 fault), adds passive real `Uint8Array` output-construction observation to C04 (two legal 1 MiB views that are the returned bytes, three rejects with zero construction/inspection) and a C08 `maxByteLength === ARTIFACT_LIBRARY_LIMITS.maxItemBytes` assertion; tests stay 8. Plan 08-E-D then adds a sixth internal engine export `runExistingFixtureTaskBytesOnce` inside the same flow: after the real Fake SUCCESS validation it derives one bounded producer request from the verified 44100 Hz `durationMs` (whole frames first, then the 1 MiB budget: 10/1000/11880 ms → 926/88244/1047860 bytes; 1 ms and 11890 ms refused before any producer call), calls the real 08-E-C producer once behind a native-slot guard, makes one `BEGIN_PROCESS` and returns a private `{record, result, production}` at `PROCESSING` with `outputArtifactRef=null`/`hasOutput=false` and no ATTACH/SAVED/second Task; producer faults are one `TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE` with null record/production. D01–D07 / 7 tests; suite **703 / 700 pass / 3 platform skips / 0 fail**; `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `NOT_INTEGRATED`, new PR open and unmerged. The E-D-F01 (067) repair closes the review groups in the same private flow: every bytes-entry exit is exactly `{record, result, production}` with a frozen root and `production:null` on the four legal source/readiness/TTS/dispatch blocks (legacy `record`/`result` deep-equal, legacy two-key root unchanged); the thin carrier guard now uses native internal slots only (`%TypedArray%` brand/length/byteLength/byteOffset/buffer, `ArrayBuffer` byteLength/resizable/detached, prototype identity), refusing `Int8Array`/resizable `ArrayBuffer` with one `TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE/$` and never executing own `byteLength`/`@@toStringTag` getters; the tests add full record/result equality, a legal TTS control, passive output-construction observation, accessor/conflict/invalid-record/rights/`SAVED`/`UNKNOWN` representatives and one complete executable frame in the internal doc, with tests still 7 and the suite unchanged at **703 / 700 pass / 3 platform skips / 0 fail**. E-D overall remains `IN_PROGRESS` / `REVIEW_REQUIRED` until 067 acceptance; PR #37 stays open and unmerged. The E-D-F01 v1.1 (068) pass then closes the remaining in-repo evidence with product code unchanged: the three post-bytes rejections are actually executed after one real per-stage delegation each (fault hits 1, original record strictly `null`, `production` strictly `null`, legacy `TASK_FIXTURE_TASK_TRANSITION_REJECTED/$`); D04's nine cases pin the three-key frozen root/`production:null`/fixed phase+reason/absolute counts plus raw `hasOwn(record)`/`record === null` before normalisation; and the own `byteLength`/`@@toStringTag` getters now target the produced ArrayBuffer carrier (0 calls, `PROCESSING`, same carrier, no copy). Tests stay 7, suite **703 / 700 / 3 platform skips / 0 fail**. E-D/F01 was then merged via PR #37 at **M `08cf0b61`** (report 0065), so E-D/F01 is `MERGED` / `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `NOT_INTEGRATED`. Plan 08-E-E-A adds the candidate same-claim save-transaction contract [docs/TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md](TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md) — **v1.6** after 071–076 R1–R3 (`PLANNED` / `DESIGN_REVIEW_REQUIRED`, docs only, runtime not implemented, no code authorization). Plan 08-E-E-B Step 1 then extracts the shared store base (`fixture-store-base-internal.mjs`) with the same ten Task-store re-export bindings and eight Artifact-store imports; behaviour unchanged, save runtime still not implemented.
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

### Plan 08-E-E-C — same-claim save transaction (OFFLINE, PR pending)

The frozen save contract's Step 2-4 are implemented offline as one unit: fresh library helper, v2
owner snapshot with a mandatory `SaveProof` inside the only writer, non-reentrant `importInQueue`,
and public `save`/`artifactStatus`. The F01 close-out completes the remaining offline evidence: the
three protocol/native-carrier guards, the eleven-row fs-fault matrix in one shared VM graph and the
§4.3 compatibility/concurrency rows. The 085 v1.3 close-out adds the full canonical inspection
comparison, the static proof pre-read gate, the uniform eleven-row evidence with a true post-writer
JOINT, legal non-SUCCESS settlements, fixed EXISTING concurrency, held-window delete queueing and
complete documented examples; local suite **755/752/3 platform skips/0 fail**, owner + save
specialty 72/72. Not verified: real Host/GUI, real TTS/media, delivery or any production capability;
this does not complete Cover orchestration, resource or cancellation work, dynamic-dependency
evidence or the parent Fake E2E.
### Plan 08-F-A — pure Fixture cover stage planner (OFFLINE / PLAN_ONLY, PR pending)

`core/audio/cover-plan.mjs` adds one synchronous, side-effect-free planner: the original source
resolver is called exactly once, a strict recipe and Fixture capability declaration are validated,
and the result is a frozen 15-key planning value with an 11-key association, a 5-key recipe and a
symbolic 3- or 4-stage graph. It explicitly does not create or execute a Task, separate/convert/mix/
verify/save audio, or touch storage, network, clock or randomness. Documented in
`docs/COVER_PLAN_OFFLINE.md` with the full OPEN compatibility boundary and three complete runnable
examples. Local suite **774/771/3 platform skips/0 fail**. This does not complete Cover execution,
resource/cancellation work, dynamic-dependency evidence, the parent Fake E2E or any real capability;
parent Plan 08 stays IN_PROGRESS.
### Plan 08-F-B — Cover execution / StageArtifact contract candidate (docs only, PR pending)

A complete implementable design for one atomic Cover intent birth and a single-claim execution that
ends in exactly one MASTER save: canonical Intent with hash vectors, typed catalog v3 / owner v3
entries, one execute/status/cancel API on the same owner, a `coverAttachment` writer branch,
trusted STORED SOURCE bytes and derived lineage, the StageArtifact manifest, deterministic Fake byte
algorithms with vectors, queue/checkpoint/recovery/cancel/lease/budget rules, version compatibility
and error priorities. Everything is `NOT_IMPLEMENTED`; no runtime, tests or media work is added and
the frozen save contract v1.6 is untouched. This does not complete Cover execution, resources/
cancellation, dynamic evidence, the parent Fake E2E or any real capability.
The 08-F-B contract candidate was revised after review (`092-R01..R06`): it now has a single public
birth protocol and duplicate sequence, a legal canonical Intent (25 keys) with recomputed vectors,
library-rights/physical-source mapping, a field-level adapter to the existing RVC Fake gateway,
typed owner/StageArtifact shapes, the exact M revision/attachment/cancel/crash rules and exact
capacity/peak budgets. It is still NOT_IMPLEMENTED and does not change the Cover execution,
resources/cancellation, dynamic evidence, parent Fake E2E or real-capability status.
The 08-F-B contract candidate was revised for the `0093` incremental review: internal-only birth,
one envelope, real gateway field constraints, `importReceipt`/`resumeCoverFinal`, the Artifact-held
FINAL critical section, a real macrotask cancel yield, and full-pack/32 MiB budgets. It is still
NOT_IMPLEMENTED and does not change Cover execution, resources/cancellation, dynamic evidence, the
parent Fake E2E or any real capability.
The 08-F-B contract candidate was revised for the `0094` review: restored catalog birth example,
synced method/version tables, resume EXISTING, real read-source calls with private-proof/public-
metadata provenance, and a per-stage explicit-Buffer peak table under 64 MiB. It is still
NOT_IMPLEMENTED and changes no runtime, test or capability status.
Plan 08 Cover offline execution started after the contract merge: Intent, synthetic stage bytes,
dedicated Cover v3 store and a single-claim executor are implemented and tested offline. The
remaining 090 units (v3 into the legacy files, dynamic dependencies, parent Fake E2E, complete
cancel/cleanup evidence) are OPEN; no real model, media, device or WeChat capability changed.
Cover dynamic dependencies and the test-only relay boundary are implemented (OFFLINE). The remaining
090 units are legacy v3 store integration and the legacy parent-chain E2E; no real capability changed.
Parent-chain E2E (legacy catalog + Fixture library + Cover + handoff) is implemented and tested
offline; same-file v3 integration and the legacy owner run/save engine E2E remain OPEN.
Same-file v3 integration is now implemented in three phases: a fresh sandbox writes the v3 snapshot
to the legacy filenames, an existing v3 file there is read/written in place, and an existing v1/v2
snapshot forces the dedicated v3 files; legacy entries inside a v3 owner/catalog file are preserved.
The legacy owner run/save engine chain is covered by a real same-source E2E (`cover-legacy-owner-chain`
test: legacy run reaches ARTIFACT_READY/SIMULATED, legacy save reaches SAVED, both legacy files stay
byte-identical through a later Cover SAVED). Cancellation has the contract cooperation points (a
4,096-frame synchronous fence and a real macrotask yield at least every 65,536 frames) with separate
persisted request/ack/stop/release/cleanup evidence, and the explicit
`planCoverV3Rollback`/`applyCoverV3Rollback` path moves a v3 snapshot back to the dedicated files while
refusing mixed legacy data, an existing target or an unreadable file. Full suite 831/828 pass/3
platform skips/0 fail. Still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED: no real separation, RVC,
mixing, GPU, audio device, WeChat or installation path changed, and parent Plan 08 is not complete.
The v1.76 review (104-R01..R06) is addressed on the same branch: queue-internal single-claim recheck
with terminal no-rerun; resume identity/real-terminal/receipt/proof validation with a real
checkpoint[4] crash state and zero second import; durable checkpoint[4] plus an Artifact-queue
critical section around import → FINAL → post-commit confirmation and an uncertain-write lock; safe
legacy-file probing with deep v3 read/write validation; one exclusive local-GPU lease per sandbox
(CPU/cloud `gpu:'NONE'`), readiness fixes for future evidence and authorized-but-not-ready SVC
clouds, an execution readiness gate and an optional real voice-binding/provider dependency bundle;
and a parent Fake chain driven by the persisted legacy SAVED record into handoff/Fake Relay
(SENT/EXISTING/UNKNOWN) with the Cover record staying delivery-free. Full suite 856/852 pass/4
platform skips/0 fail. Status remains OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #43 is unmerged and
parent Plan 08 is not complete.
The v1.77 A/B/C review is addressed on the same branch: full lineage/Intent/receipt/fresh-proof
validation before SAVED and a delta-only writer (receipt-key, SOURCE-hash, historical-checkpoint and
FINAL-rewrite mutations all rejected); UNKNOWN outcomes retain the shared GPU lease while only
SAVED/CANCELLED/FAILED release it; `executeCover` gained a real `CPU_CLOUD` compute mode
(`gpu:'NONE'`, mandatory cloud facts) with cross-mode conflict/progress evidence; dependency facts
are mandatory and validate the real voice binding/provider/model/evidence/cloud bundle before any
claim (omission, model/asset revision, provider removal, shared invalidation and future evidence all
block). Full suite 868/864 pass/4 platform skips/0 fail. Still OFFLINE / FIXTURE_ONLY /
NOT_INTEGRATED; the attachment remains derived, real Provider/GPU/media/WeChat/install paths stay
unimplemented and unauthorized, PR #43 is unmerged and parent Plan 08 is not complete.
The v1.78 review (A/B1/B2) is addressed on the same branch: full MASTER inspection and PASSED
verification are validated and the fresh library inspection is compared field-by-field; lease
release is unified on a confirmed FINAL, so claim/checkpoint/cancel/terminal write failures keep the
claim and the GPU lease; and the long separate/convert/mix work runs outside the shared cover write
queue, with short claim/checkpoint/FINAL critical sections and a real long-GPU-run test where a CPU
execution completes first (B→A) while a second GPU execution is refused. Full suite 874/870 pass/4
platform skips (including the 2 `test/support` helper files as empty entries). Status remains
OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #43 is unmerged and parent Plan 08 is not complete.
The v1.79 regression is fixed: every `cancelNow(...)` return is awaited before the try/finally, so a
normal CANCELLED releases the GPU lease and CPU/cloud lease count returns to zero, while a failed
cancel FINAL write still retains claim + lease. Full suite 876/872 pass/4 platform skips. Status
remains OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #43 is unmerged and parent Plan 08 is not
complete.
The v1.80 lifecycle review (R01–R04) is addressed: resume re-checks identity/phase inside the queue,
settles the exact attempt lease, a real interrupted receipt resumes and lets the next task run, a
concurrent resume returns EXISTING, accepted cancels are not bypassed by resume, unconfirmed
owner/Artifact JOINTs lock both domains and stay UNKNOWN with the lease retained, and cancellation
observation errors map to the fixed envelope. Full suite 882/878 pass/4 platform skips. Status
remains OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #43 is unmerged and parent Plan 08 is not
complete.

### Plan 08 closure and Plan 09 UX (2026-11-02)

Correction: PR #43 is merged into main as `a9d3ce9` (parents `2c0cb94`/`9d8eaf8`, tree `6a4cf00f`);
Plan 08 offline/Fake scope is DONE and remains NOT_INTEGRATED. Plan 09 is implemented on
`feature/plan09-config-ux`: two entries (`voice-bubbles`, `singing`), first-use wizard with
workspace/profile/feature/manifest persistence and global Setup priority, mode-based dependency groups
with a labelled fake installer, multi-engine voice/singing drafts, and an isolated demo transaction
panel. Full suite 888/884 pass/4 platform skips; UI 30/30. Still OFFLINE / FIXTURE_ONLY /
NOT_INTEGRATED; real install/Provider/GPU/media/WeChat/send are later stages.

### Plan 09 0111 review fixes

Plan 09 now uses a real adapter contract and maps only supported voice fields to the existing
Coordinator, reporting other fields as draft-only; singing is read-only. Dependencies are mode/source
aware, the fake installer is shared/cancellable with install and verification separated, and wizard
persistence is context/revision aware. Full suite 888/884 pass/4 platform skips; UI 30/30. Still
OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #44 remains unmerged.

0112 review (A/B/C): async adapter transaction with frozen preview/UNKNOWN read-only, scoped dependency
evidence with invalidation, mode-aware draft/authorization consistency, and a real isolated Coordinator
browser chain. UI 32/32; full suite 888/884 pass/4 platform skips. Still OFFLINE / FIXTURE_ONLY /
NOT_INTEGRATED.

0113 review fixes: transaction authority for dispatched writes/UNKNOWN, exception/null busy handling, context-change plan blocking, scoped mode/unmount dependency cancellation, and mode/engine consistency. UI 38/38; full suite 888/884 pass/4 platform skips. Still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED.

0114 review fixes: cross-page transaction authority, response-loss/legitimate UNKNOWN handling, shared dependency identity and cancellation display, provider protocol mapping for cloud/existing, and authorization-driven preview invalidation. UI 45/45; full suite 888/884 pass/4 platform skips. Still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED.

0115 review fixes: the panel runs the shared transaction reducer with a workspace/profile/feature transaction key (a manifest switch cannot clear an unresolved UNKNOWN), empty/lost/ok-only responses stay UNKNOWN and cannot be reset or re-prepared, only determined results end a transaction, operation sequences keep late answers from overwriting newer work or releasing an in-flight mutex, a changed frozen plan can be re-prepared, and shared pending dependency checks are cancelled by the owning page while every write notifies the current observer. UI 53/53; full suite 896/892 pass/4 platform skips. Still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED.

0116 review residuals: a trusted not-written/rolled-back failure can end its association and prepare a new draft without replaying the consumed plan (plain failures are not labelled never-written; UNKNOWN stays latched), a prepare returning after a context change is marked stale with a direct re-prepare path, and dependency identity changes cancel the old identity's pending checks so late responses cannot become ready after returning. UI 58/58; full suite 898/894 pass/4 platform skips. Still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED.

0117 review residual: a prepare that completes after its page was unmounted compares against the live context serial for the transaction key (and a late plan is re-checked when it appears), so the stale notice, blocked confirm and direct re-prepare path hold across pages while same-context completion still confirms; the no-write note is shown only for FAILED and disappears after an UNKNOWN status. UI 63/63; full suite 898/894 pass/4 platform skips. Still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED.

### Plan 10 10-A Qwen provider candidate (2026-11-02)

Plan 09 is merged (`f63edc6`); the first local-provider unit starts from that main on `feature/plan10-qwen-provider`. It delivers fixed Qwen3-TTS upstream/licence metadata, five audited model identities bound to backends, a static tokenizer/dependency UNKNOWN inventory, a provider-neutral manifest, an official-SDK lazy worker (`workers/qwen3_tts_worker.py`) with local-only model/reference resolution, a narrow versioned worker protocol with bounded parsing and response-type matching, a controlled supervisor (explicit command, no shell/env inheritance, bounded IO, finite timeouts, no retry, per-generation ownership, error≠exit, confirmed exit before release, retryable temp cleanup, no new work during stop) and an adapter that rejects unrelated/unverified services, keeps preset/clone/design modalities apart, enforces backend and registered-clone identity, preserves the caller request gate, checks the four output identity fields before handoff, keeps UNKNOWN/CANCELLED terminals, exposes a real cancel handle, blocks overlapping work after an unresolved operation, optionally confirms an authority-issued `taskId` and returns a non-persisted pending-router result. The 121-R01–R05 repair adds actual-use resource re-audit (model/config/clone reference realpath, existence, size, dev/ino and held fd) with junction/symlink rejection, offline env plus an in-process network guard for the whole nested load chain, hello/health dependency health without model load, binding capability intersection (voice languages, audio duration, effective timeout), cancel request/ack/stop/result separation with pre-load and load-time cancellation, and occupancy released only by a fully correlated terminal; the start handshake no longer re-opens admission after a stop intent. The 0122 residual repair hands the exact audited reference bytes to the SDK as a `data:audio` value, audits the model sub-resource tree for junction/symlink escapes, re-audits config/tree after loading before generation, reports runtime-disappeared dependencies through `health` until restored, releases occupancy only on a complete terminal (state plus exact requestId/model/backend/voiceId), preserves the issued-message-id correlation after invalid late messages, and scopes a start failure to its own generation. The 0123 repair loads through a private audited snapshot (every regular file copied with SHA256 baselines, no hardlinks, in the supervisor-owned temporary directory), commits the model cache only after validation and discards it on load-time cancel/audit failure/exception, and keeps a resolvable-but-ImportError dependency degraded until a successful import. The 0124 repair removes hardlinks entirely (full copy within an 8 GiB budget), tracks snapshot directories from creation, cleans them on shutdown/EOF with a retryable snapshotCleanupPending fact and host temp cleanup, and prevents a later missing request from downgrading a known ImportError. The 0125 repair shares the remaining copy budget across files before each chunk write and retains active/build-in-progress snapshot ownership in health cleanup, so cross-file overruns and health-during-load cancel/failure leave no orphan. 68 Qwen tests pass (25 Node behaviour + 27 official-worker with injected Fake SDK + 16 focused 095 repair); full suite 966/962 pass/4 platform skips/0 fail; UI 63/63. Real model, Host, main Task, real Artifact handoff, VoiceDesign and clone reference rights remain OPEN; 10-B/10-C wait for a fixed baseline after this unit is accepted. Still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #45 unmerged.

### Plan 10 10-B IndexTTS-2.5 provider candidate (2026-11-03)

The second local-provider unit starts from exact main `M=fb3a669` on `feature/plan10-indextts-provider` as an independent PR. It fixes `index-tts/index-tts@d9e41aac…` and `IndexTeam/IndexTTS-2.5@c39ce5ba…`, records that package `indextts 2.0.0` still exposes the 2.5 interface via `infer_v2_5.IndexTTS2`, and keeps the **bilibili model-use licence** (not Apache; MAU/revenue commercial thresholds) distinct from dependency/tokenizer/private-material rights, which remain UNKNOWN. The clone/emotion-only provider has a narrow versioned NDJSON protocol, a generation-scoped supervisor, an adapter with trusted clone/emotion bindings, five languages, fixed 8-float emotion modes and 22.05 kHz output validation, and a lazy official-SDK worker. The worker starts without importing/loading the SDK; only synthesis imports `indextts`, builds a byte-for-byte private model snapshot under the supervisor temp directory (shared 8 GiB budget, no hardlinks), requires all main/auxiliary/tokenizer resources to exist locally so the upstream `ensure_models_available` download path is not entered, installs offline environment plus an in-process network guard, copies audited reference/normalized audio bytes to stable private files, and returns a non-persisted result with exact request/model/backend/voice identity. Index tests 29/29 (7 contract, 5 adapter/supervisor, 17 official Fake SDK) and the full suite 995/991 pass/4 platform skips/0 fail; UI 63/63; `client.js` unchanged. Still `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; real weights/GPU/Chinese quality/Host/main Task/Artifact and reference rights remain OPEN; independent PR #46 pending review and not merged.

### Plan 10 10-C Kokoro-82M provider candidate (2026-11-03)

The third local-provider unit starts from exact main `M=fb3a669` on `feature/plan10-kokoro-provider` as an independent PR. It fixes `hexgrad/kokoro@dfb907a0…`, package `kokoro 0.9.4` and `hexgrad/Kokoro-82M@f3ff3571…` v1.0. Code and model are marked Apache-2.0, while dependencies, voice tensors and Misaki/espeak G2P/dictionaries are separately UNKNOWN. The provider is preset-only: nine official language codes, voice index intersection, no clone/VoiceDesign/emotion, 24 kHz mono PCM16, CPU path. The lazy official worker loads only on synthesis, after a byte-for-byte private model snapshot, stable audited voice `.pt` copies, local config/weights/voice/G2P preconditions, offline environment and the in-process network guard; no voice name reaches the HF download helper. Output identity is exact and results are non-persisted. Kokoro tests 15/15 (6 contract/adapter/protocol + 9 official Fake SDK); full suite 1010/1006 pass/4 platform skips/0 fail; UI 63/63; `client.js` unchanged. Still OFFLINE/FIXTURE_ONLY/NOT_INTEGRATED; real weights/CPU audio quality/Host/main Task/Artifact and voice/G2P rights remain OPEN; PR #47 was subsequently merged as M `b64b0e2`.

### Plan 11 cloud/custom offline unit (2026-11-03)

Starts from exact `G=b64b0e2` on `feature/plan11-cloud-custom-providers`; independent PR **#48**, not merged.

This unit adds the first cloud/custom implementations as pure offline candidates: an application-owned Windows DPAPI CurrentUser credential namespace with atomic ciphertext files and no plaintext fallback; one atomic character-price/explicit-free cost ledger authority with reserve-before-send, same-ID PENDING refusal, post-send UNKNOWN, live-owner PENDING protection, dead-owner UNKNOWN recovery, bounded dedup that fails closed and token-owned/optimistic-revision locking; a shared bounded HTTP security layer (HTTPS or numeric-loopback HTTP, public DNS pinning, no redirects, streamed body caps, pre-cancel before construction, prompt non-2xx destruction, timeout/abort); a narrow Azure Speech preset zh-CN/en-US adapter with escaped plain-text SSML, required key header, paid-ledger/positive-price validation and 24 kHz mono PCM16 validation; a fixed `whale-voice-custom-tts` v1 JSON→WAV adapter with predefined bearer/x-api-key auth, target pinning and explicit unknown/free/paid cost modes; and a neutral non-persisted pipeline/projection. No Task, Artifact, delivery, production Host route, real credential input, real vendor request or paid execution is added. Design: [CLOUD_PROVIDERS.md](CLOUD_PROVIDERS.md), [ADR-021](DECISIONS.md). Evidence: 53 Plan11 offline tests, full suite 1063/1059 pass/4 platform skips/0 fail, UI 63/63, `client.js` unchanged. Still OFFLINE/FIXTURE_ONLY/NOT_INTEGRATED; real accounts/prices/retention/quality and Host/Task/Artifact integration remain OPEN.

131-R01/R02/R03 close-out: same-ID concurrent/restart requests now enter transport at most once; two ledger handles on one root share the atomic authority; full dedup capacity fails closed without losing an UNKNOWN id; custom unknown cost makes zero requests while free uses the same durable call/text-limited ledger and paid requires a known price/budget; pre-cancel, credential/DNS awaits, non-2xx infinite bodies and commit-during-cancel no longer leave an unhandled connection or return success audio after cancellation.

131-R01-LOCK/RECOVERY + R02-AZURE close-out: token-owned locks are not stolen by age and only the owner deletes them; slow temp I/O is outside the lock and a revision conflict retries instead of overwriting a committed record; live-owner PENDING is preserved while a dead/closed owner (including a real child-process crash) is recovered to UNKNOWN; Azure requires a paid ledger with a positive price in both health and synthesis and rejects free/unknown/zero-price ledgers with zero transport. Custom's explicit free path is unchanged.

### Plan 12-A / APP-OFFLINE singing application (2026-11-03)

Starts from the merged Plan11 M=`16bf263` on `feature/plan12-singing-app-offline`; PR #49 open, not merged. The 0134 review requested R01 real fixture wiring/R02 query-cancel and the 0135 review requested 135-R01 delayed-create task identity; all are fixed on the same branch.

A thin application layer over the existing Cover executor and Fixture Artifact library: trusted source/voice catalogs, one idempotency key per source/voice, existing create/execute/status/cancel/resume, same-task reconnect, bounded MASTER preview, Chinese stage projection and `SAVED ≠ SENT`. `start()` keeps the long execution in the background so status/cancel remain available while `CLAIMED`; a test/harness-only `stageDelayMs` provides a controlled slow run. The Singing page panel only appears with an explicitly injected `window.__WHALE_SINGING_APP__` adapter; the UI harness fetch adapter calls a test-only HTTP bridge that runs the actual `openSingingApp`/Cover executor/Fixture library in a temp sandbox and returns real MASTER bytes/hash. 105 adds a monotonic selection generation/per-operation token for every async exit and an immutable bridge `taskId → task intent` map, so a delayed A create cannot rebind after selecting B or give A execution rights under B. Production Host remains read-only and shows “未接入”. No real RVC/TTS/API, 13-A delivery, 12-B/C/D, device playback, private audio, network or production write route is added. Design: [SINGING_APP_OFFLINE.md](SINGING_APP_OFFLINE.md), ADR-022/ADR-023.

Evidence: 7 new Core app tests, UI harness 69/69 (real bridge create→execute→SAVED→preview, cancel during slow run with zero MASTER, delayed A create/rejection not rebinding after B, switched-task late-response guard, missing-adapter fail-closed), full suite 1070/1066 pass/4 platform skips/0 fail, `client.js` 308,426 chars regenerated. Status `12-A/APP-OFFLINE` / `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; entire Plan12-A and all real dependencies remain OPEN.

### Plan 13-A / Unified Relay OFFLINE (2026-11-03)

Branch `feature/plan13-unified-relay-offline` from merged Plan12 M=`42b96ce`; independent PR pending, not merged. First offline delivery-persistence owner after ADR-001: a *persisted* SAVED Audio Task (or persisted Cover MASTER) + actual Fixture Artifact bytes read through the existing library under scope/rights + trusted target directory; computed hash/bytes/duration/format; persistent `delivery:<32hex>`, safe legacy backend request id, `taskId → deliveryId → backendRequestId` mapping, semantic digest/conflict, fixed backend, atomic store with token lock, token-quarantine release, global live-owner protection, capacity fail-closed and child-process `SUBMITTING → UNKNOWN` recovery with no replay. `UNKNOWN`/requested/confirmed cancel are separate terminal states; submit re-reads the artifact and target before any Fake call.

108 revision (0138 review + wizard screenshots): the handoff is reference-only (`schemaVersion/scopeId/taskId/artifactRef/targetId/requestKey/rights`) and a caller-supplied `taskRecord` is refused. The relay re-reads the persisted AudioTask owner v2 (`SAVED` + `artifactStatus READABLE` + persisted `deliveryRequested:true`) or the Cover owner v3 (`coverStatus SAVED` + MASTER ref), persists a versioned `intentId`/issuance (`PERSISTED_TASK_DELIVERY_INTENT` or `RELAY_ISSUED_FOR_FROZEN_COVER`, never editing the frozen Cover record), checks the `requestKey` binding before any digest alias (immutable once bound), re-reads authority identity/artifact/target after all awaits immediately before the Fake accept (revoked/deleted/expired → zero submit), retires the live owner only after the terminal commit, and fences every lock path by move-then-verify + create-or-fail restore. The Fake Worker's `submit` now resolves the target from its own directory by the persisted delivery id/kind/backend id and its own four flags; upstream booleans or a handed-over resolver cannot grant it. Frontend: the dependency wizard is mounted in a plugin-owned root overlay layer (inside `.wv-root`, outside `.wv-scroll`/`.wv-page`), container-sized, independently scrolling, narrow-reflowed from the real plugin width, focus/Escape/return preserved, with local theme-token fallbacks and an opaque fallback surface.

The only backend is `createFakeDeliveryBackend`: capabilities/health/resolveTarget/submit/status/cancel with its own target directory, target identity/type + `bridgeAllowed && workerAllowed && identityVerified` two-gate, WAV/8MiB/15min gates and simulated `QUEUED` receipts; no real Sender import/network/device/WeChat. `projectUnifiedRelayComponent` projects one user-facing 鲸递 component with legacy aliases `whale-relay`/`voice-sender`, one install unit and no second store; Plan09 already shows one 鲸递 delivery item and WeChatAgent remains independent. No real install/start/send.

109 revision (0139 review): a SAVED Cover MASTER is not a delivery permission — `issueDeliveryPermit` persists a versioned, immutable source permit bound to scope/task/MASTER/target/rights, and a Cover `ensureDelivery` without a valid permit is `PERMIT_REQUIRED`; the accept boundary re-samples the clock after the final awaited artifact read; every commit re-reads its canonical lease token and the store revision it started from (a stolen lease/old snapshot fails closed with `STORE_BUSY`); and the store is accepted only when records, digest/request-key indexes (aliases included) and permits are mutually consistent, so a corrupt index is `STORE_INVALID` and can never re-accept an already accepted request. The real three-process lease race is replayed as a test: A pauses before commit, its live lease is moved aside, C legally commits a cancel, A fails closed — C's result survives.

110 revision (0140 review): the advisory lease is not the write authority — a commit reserves
`unified-relay-v1.json.commit-<revision+1>` through an atomic hard link, holds it across the final rename, and
re-checks its lease/revision after reserving, so a writer whose live lease was moved aside cannot lose the
revision to a third process (the after-fence three-process interleaving now fails closed on the intruder). The
delivery digest is recomputed with one `canonicalDeliveryDigest` from the persisted facts at creation and at
store validation, so a digest/index edited without the facts is `STORE_INVALID` and can never re-accept an
already accepted request under a new alias.

111 revision (0141 review): the store is an append-only log of immutable revision files
(`unified-relay-v1.r<N>.json`); a commit is the create-or-fail publication of the next revision file after a
fully written/fsynced temp, so there is no fixed current-store name to rename/reclaim/release and a writer whose
advisory lease was moved aside can never overwrite a newer commit (it fails closed). Readers take the highest
validated revision; pruning is bounded to the newest four and can never be a writer's base; dead-owner delivery
recovery is unchanged. The two real three-process interleavings now run against the immutable publish.

112 revision (0142 review): retention keeps revision numbers occupied with immutable tombstones (a late
writer's stale snapshot can no longer be re-published as an old number and return a success readers would
ignore) and directory enumeration failures are propagated as `STORE_INVALID` instead of masquerading as an
empty store (no low-revision rebuild, no fake `CREATED`). The 0142 counterexamples are replayed at their
native boundaries and fail closed; healthy new stores, corrupt-highest refusal, no-overwrite, UNKNOWN/no-resend
and recovery stay green.

Evidence: 35 relay tests in 4 files (12 core + 9 TRUST + 12 PERSIST + 2 real three-process races), full suite 1107/1103 pass/4 platform skips/0 fail, UI 72/72 (unchanged product UI), `client.js` 314,687 chars. Status `13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; 13-B/C, real WeChat/Sender identity/send, Plan14 and all real Plan12/13 DoD remain OPEN.

177 task (2026-11-06): a saved Provider generation result becomes a deliverable source only through the existing
`issueDeliveryPermit({permit})` confirmation. `readTrustedTaskAuthority` reports `PROVIDER_OWNER_SAVED_V2`
(`permitRequired:true`) for the saved `provider-generation`/`PROVIDER_TTS` task, whose record keeps
`deliveryRequested:false`; every other saved task without the persisted intent stays non-deliverable. The permit is
bound to scope/task/artifact/target/rights (idempotent, bounded) and `ensureDelivery` requires the `permitId`, keeps the
original taskId and the deliveryId/`QUEUED`→`ACCEPTED`/receipt model, and records
`authorizedBy:PERSISTED_PROVIDER_DELIVERY_PERMIT`. A still-readable retained Provider result older than its recorded
24 h value is confirmed and accepted (that value is retention, not a delivery deadline), while Fixture/Cover expiry is
unchanged. Unconfirmed / other task/target / unauthorized or revoked target / revoked rights / missing result fail with
zero Fake submit; repeats and a reopened store reuse the single delivery; capacity fails closed and an unknown backend
result stays `UNKNOWN`. Evidence: 7 new tests (`relay-provider-confirm-offline`, real Provider generation/save chain),
relay files 5/42; full suite 1208/1204 pass/4 platform skips/0 fail; UI 89/89; `client.js` unchanged. Still
`13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; no page/Host route and no real Sender/WeChat/model/device.

178 task (2026-11-06): a saved Provider result is delivered from the storage segment that actually holds it.
`openPresetGenerationApp` exposes `locateTask({scopeId, taskId})` (the segment it already opened for that
task); `openUnifiedRelay` takes it as an assembly-time dependency — never a handoff field — and each
operation re-reads that segment's persisted task/artifact. The relay keeps one store/`deliveryId`/permit
space and one capacity count across the base and rotated segments; a segment holds no relay store. A task
the locator cannot place stays on the owner sandbox and fails as `TASK_NOT_SAVED` instead of being replaced
by another result. Reopened app/relay reuse the existing relation and never resubmit; retained results past
the recorded 24 h stay usable; missing/deleted/revoked sources fail honestly. Evidence: 4 new tests
(`relay-cross-segment-source`, real base + `segments/0001` saves), relay files 6/46; full suite
1212/1208 pass/4 platform skips/0 fail; UI 89/89; `client.js` unchanged. Still `13-A/OFFLINE` /
`FIXTURE_ONLY` / `NOT_INTEGRATED`; no page/Host route and no real Sender/WeChat/model/device.

179 task (2026-11-06): one Core application entry confirms a saved result and reports its offline delivery.
`openPresetGenerationApp({..., delivery})` optionally takes the trusted target directory + Fake backend and
exposes `confirmDelivery({taskId, targetId})` / `deliveryStatus({taskId, targetId})`; the caller names only
the original task and the confirmed target, the app reads the saved artifact ref itself and the assembly
supplies the rights proof. A deterministic `saved-delivery:<taskId>:<targetId>` request key plus the
persisted permit reuse the one delivery across repeats and reopened entries (one Fake request, one relay
owner across base/rotated segments). `outcome:"ACCEPTED"` is returned only for a Fake-accepted delivery;
refusals are `DELIVERY_REFUSED` with stage/cause, persisted FAILED/UNKNOWN/QUEUED/CANCELLED is
`DELIVERY_NOT_ACCEPTED`, an unconfirmed relation is `DELIVERY_NOT_FOUND`, and without the wiring both
methods answer `DELIVERY_UNAVAILABLE` while generation/save/download are unchanged. Evidence: 6 new tests
(`saved-result-delivery-app`); full suite 1218/1214 pass/4 platform skips/0 fail; UI 89/89; `client.js`
unchanged. Still `13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; no page/Host route and no real
Sender/WeChat/model/device.

179 v1.1 (2026-11-06): the delivery status read-back is scope-bound. `deliveryStatus` now uses the relay's
read-only `deliveryFor({scopeId, taskId, targetId})` over the persisted record's own scope instead of
scanning the shared store, so another scope/proof gets `DELIVERY_NOT_FOUND` even with the same
taskId/target and never receives its artifactRef/permitId/receipt. A same-scope record stays readable
after the saved result is deleted and its state is not rewritten; the rest of 179 is unchanged. Evidence:
2 new regression tests (cross-scope leak reproduced on the previous revision; same-scope deleted-result
read); delivery entry 8 tests; full suite 1220/1216 pass/4 platform skips/0 fail; UI 89/89; `client.js`
unchanged. Still `13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`.

### Plan 13-B / Internal Windows Sender — OFFLINE, merged to main (2026-11-04, 114–117 revisions; 118-A merge)

From the verified Plan13-A merge `M=4b45ebd` on branch `feature/plan13b-internal-sender-offline`
(PR #51, not merged). The relay's own Windows delivery module is an Artifact-only backend over the
reviewed user-owned Voice Sender source closure: own target directory + identity/authorization/
allowlist/Bridge/Worker gates, one serial queue with one invocation per delivery, injected Fixture
transport (no process/socket/device/WeChat/write), NEVER_WRITE and terminal UNKNOWN.
The 26 sourced files + 2 metadata are carried as resources with a manifest of relative paths and
original/stored SHA256; no developer path, token, chat, binary/model/audio/cache, runtime state or
production config is included, and no third-party license is inferred.

The 114 revision replaces the invented invocation with the **real archived Worker ABI** (`-Request`,
`-JsonOut`, `-ProgressFile`, `-CancelFile`, `-GlobalCancelFile` under `-NoProfile -ExecutionPolicy
Bypass -File`), re-derived statically by `verifyWorkerAbi()`; cancellation is the reviewed per-job
cancel file (requested → confirmed/unconfirmed, accepted receipt preserved) instead of a script result;
one delivery id executes exactly once over an immutable fact snapshot (`DELIVERY_CONFLICT` on differing
facts); missing/empty/corrupt/thrown results are indeterminate `UNKNOWN`; and the callable legacy text
facade (`core/audio/legacy-text-delivery-offline.mjs`) goes through the same generation owner → SAVED
Artifact → same relay entry → same backend with no replay generation/send and no second cache, queue,
timer or generation registry.

The **115 revision** closes the reviewed terminal/observation gaps: a verdict observed while `invoke`
is awaiting is final (a late dispatch acknowledgement cannot reopen `ACCEPTED`); a settled verdict can
never be rewritten or have its cancel flags/receipt changed by later or concurrent observations;
observation binds to a real invocation (a still-queued delivery cannot consume a worker result); the
one execution slot covers the whole Worker holding period (dispatch-only holds it until a terminal
observation); malformed or contradictory evidence (`cancel_stage:'UNKNOWN'`, bad bubble/reason/phases/
timeline, a rejection carrying UI evidence) is `UNKNOWN`, and only a well-formed pre-UI refusal is
`preSubmit`; and the legacy request identity is `(scope, legacyRequestId)` so a changed text reuses the
original result and a changed target is refused by the relay's immutable request-key binding.

The **116 revision** separates the logical delivery verdict from the execution lease: an `UNKNOWN`, an
unconfirmed cancel, a missing/empty/bad invoke result, a thrown transport or a failed device restore
keeps the single execution slot (`occupancy:'HELD'`) until trusted exit/recovery evidence (an
invoke-returned clean terminal, or a transport `released:true` observation); the static `recover()`
descriptor is not such evidence. Exceptions are classified by the invoke boundary (pre-invoke refusal
= `preSubmit`; anything after = `UNKNOWN` with uncertain lease), and a `CANCELLED_BEFORE_UI` claim that
contradicts `RECORDING`/`SENDING` evidence becomes `UNKNOWN` instead of a confirmed cancel.

The **117 revision** closes the lease-evidence edges: a pre-UI refusal no longer short-circuits the
device-recovery check (the archived worker may switch devices before failing), `restore_ok` is
tri-state (`true` verified, omitted = Fixture-compatible positive, `false`/any other non-boolean =
held), and a late clean invoke answer after an observed verdict releases the slot without rewriting
the verdict, flags or receipt.

Evidence: 29 internal-sender + 8 legacy-text tests, full suite 1144/1140 pass/4 platform skips/0 fail,
UI 72/72 (unchanged product UI), `client.js` 314,687 chars; real process/device/WeChat/window = UNKNOWN.
Open: the real 13-B runtime (materialise the closure, spawn/observe the Worker, real cancel confirmation,
device recovery), real TTS synthesis for the legacy text path, and 13-C/Plan14.

**118-A merge (2026-11-04):** PR #51 was merged with exactly one standard Merge Commit
`M=135c0256023926815bfe0aa01280c13e9747ec7c` (double parents first `G=4b45ebd`, second `H=4fb8af7`;
tree `M`=`H`=`T=8e73ae22`; full first-parent diff byte-identical to `G..H`, 41 files `+8588/−17`);
remote `main`=M and the source branch stays at H. Main CI `41775387252`: the first attempt's build
failed only on the pre-existing flaky `121-R03` Qwen test (file untouched by this merge) and attempt 2
build+ui succeeded. 13-B stays `OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED`.

### Plan 10-R1 / Provider generation → SAVED candidate (2026-11-04, 120-B)

Branch `feature/plan10-r1-provider-generation`, new PR (not merged). `core/audio/provider-generation-offline.mjs`
wires an audited provider contract to the existing Artifact library behind a versioned, claim-first
coordinator: durable claim, fail-closed duplicate/conflict/cross-scope/rights rules, cancel/UNKNOWN/late
result handling, byte re-measurement, artifact import + readback, and a `SAVE_UNKNOWN` tombstone that never
resynthesises. 8 new tests; full suite 1152/1148/4/0; no model/process/WeChat/Host route. The Plan 08 owner
SAVED entry (owner schema v3) and UI/Host wiring remain open; the claim keeps the task birth hash for that
future binding. **Later update (2026-11-06):** 132 completed the original-task SAVED entry on the existing
owner v2 with SaveProof — the previously suggested owner schema v3 was not needed (ADR-036) — and 136/137
added the Host routes and page wiring; the "remain open" wording above records the state on 2026-11-04, not
current work.

### Plan 13-C / Native voice static admission research (2026-11-04, 118-B)

Branch `docs/plan13c-native-admission-20261104` from M, new research PR (not merged). The public
first-party evidence for WeChatPYAPI, PadChat-SDK and WeChatAgent(0.4.2) was refreshed on 2026-11-04
against the 2026-10-24 snapshot, pinned to head commits, and scored against the existing 12 admission
gates (PASS/FAIL/UNKNOWN per candidate). None is `PROTOTYPE_READY`: WeChatPYAPI has no LICENSE and
still requires disabling antivirus; PadChat-SDK is a 2024 iPad-protocol service whose SDK
`package.json` declares ISC but whose external service authorization is unknown; WeChatAgent 0.4.2 has
no outbound voice API (inbound `record`/`silk-wasm`/speech-recognition are receive-side) and its root
MIT does not cover the complete third-party Hook/client path required for native voice. The original “two community developers”/`wechat_voice_say`/`wechat_sing` remain
UNKNOWN (no precise first-party source). Native/auto stay unselectable; no DLL/Hook/SDK was downloaded
or run; no runner, production route or second queue was created.
