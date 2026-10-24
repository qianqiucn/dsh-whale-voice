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

**Next development gate:** the read-only PR stack (#3–#8) is integrated into `main` with merge
commits. The next gate is Core unified configuration management — read, schema validation,
version-conflict detection, atomic save, saved-versus-effective separation, and controlled writes only
in an isolated configuration. This precedes any installer or full event/identity Adapter work.
Production config writes require separate authorization; Voice Sender final independent safety
verification remains required before real sending.

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
Host (port 57393): 401-protected config routes, trusted bridge, six GUI surfaces and refresh verified.
Saved-vs-active is separated; Bridge and Worker safety layers are distinct. Write APIs, migration and
permission-detail management remain `PLANNED`; no production write exists. Live No-Core/timeout/
invalid-schema/stale injections remain `OFFLINE` tests.

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

## P6 — Cloud TTS and GPU-free mode

**Goal:** Allow an explicitly configured cloud provider without silent fallback.

**Core tasks:**
- Provider registry with capability and cost/privacy metadata.
- User-selected provider and credential storage outside the repository.
- Audio validation, timeout and cancellation behavior.
- Clear local/cloud disclosure and no automatic provider switch.

**Dependencies:** P1/P2; user decision on providers and credentials policy.

**Acceptance:** Provider selection is explicit; missing credentials fail closed; no key is logged or
committed.

**Current status:** `PLANNED`.

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
UI CI and Markdown encoding checks. PR #3–#8 are integrated into `main`; the clean development
baseline is the post-integration `main`. No release, no public visibility and no release artifact yet.
