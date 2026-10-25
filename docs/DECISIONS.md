# Architectural Decisions

**Status legend:** `ACCEPTED` = current project rule; `SUPERSEDED` = replaced; `RESEARCH` = not implemented;
`REJECTED` = explicitly not chosen.

All decisions are dated **2026-10-24** unless noted. Each links to its authoritative document.

---

## ADR-001 — WeChatAgent is the required WeChat platform dependency

**Status:** `ACCEPTED`
**Decision:** Whale Voice does not implement a second WeChat reader, account manager, session store or
bot. WeChat messaging and account/session context depend on the independent
`sourcepro5/WeChatAgent` project.

**Reason:** Avoid duplicating a high-risk, version-fragile Hook/account system; keep one platform
boundary and one compatibility policy.

**Rejected alternatives:** Native replacement bot; private WeChat reader; bundled Hook fork as the
main integration.

**Related:** [WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [AGENTS.md](../AGENTS.md).

---

## ADR-002 — Voice Sender remains an independent delivery backend

**Status:** `ACCEPTED`
**Decision:** The Voice Sender is a separate Windows component responsible for final target check,
UI Automation, recording/playback, device recovery, cancellation and result reporting. It must not be
folded into the DSH frontend or Core Host process.

**Reason:** It is the historically verified native-bubble path and carries independent safety checks;
coupling it to the UI or Core would increase blast radius.

**Rejected alternatives:** Send from the browser; send from the Host Node process; move audio/UI
automation into the plugin client.

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md), [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

---

## ADR-003 — Native voice delivery remains a research candidate

**Status:** `RESEARCH`
**Decision:** Keep `third-party-native` as a `RESEARCH_CANDIDATE`. WeChatAgent 0.3.9/0.4.0 native
voice is `UNSUPPORTED`. Do not integrate WeChatPYAPI or PadChat-SDK without version, license,
coexistence, receipt and safety proof.

**Reason:** Public API names are not evidence of current WeChat compatibility or a native bubble;
third-party DLL/service and account risks are material.

**Rejected alternatives:** Treating a README `send_voice`/`sendVoice` as working support; installing a
DLL or disabling antivirus; silently upgrading WeChat; using an unlicensed service.

**Related:** [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

---

## ADR-004 — Core owns unified configuration and delivery coordination

**Status:** `ACCEPTED`
**Decision:** Whale Voice Core is the authority for configuration reading, target authorization and
task lifecycle. Delivery backends execute; they do not create independent queues or retry loops.

**Reason:** One task ID, one delivery ID and one selected backend are required to prevent duplicate
sends and preserve UNKNOWN semantics.

**Rejected alternatives:** Frontend-selected backend with no Core record; independent backend queues;
per-backend retry.

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md), [SEND_SAFETY_API.md](SEND_SAFETY_API.md).

---

## ADR-005 — Bridge switch and Worker safety permit are different layers

**Status:** `ACCEPTED`
**Decision:** `voice-settings.json.enabled` is the Bridge user switch.
`config.json.voice_enabled` is the Worker's independent final-safety permit. They are not compared
as one value; the snapshot exposes `voice.worker` separately and `voice.consistency: not_comparable`.

**Reason:** Bridge false and Worker true are expected in production. A Worker true does not override a
Bridge false. Collapsing them creates false mismatch or unsafe bypass.

**Rejected alternatives:** A single combined voice switch; treating different values as a conflict.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-006 — UNKNOWN never triggers automatic resend

**Status:** `ACCEPTED`
**Decision:** `UNKNOWN` is terminal for automatic retry. No backend switch, new delivery ID or silent
replay is allowed after a request may have produced an external send.

**Reason:** Duplicate voice messages are a safety and privacy failure; a timeout may still mean the
message was submitted.

**Rejected alternatives:** Retry on timeout; fall back to another backend; replay historical tasks
after plugin reload.

**Related:** [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md),
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## ADR-007 — Saved configuration is not runtime-effective configuration

**Status:** `ACCEPTED`
**Decision:** `savedRevision` and `application.state` describe the saved snapshot, not proof of the
running configuration. `activeRevision` remains `null` until a supported runtime-version interface
exists.

**Reason:** File mtime, process liveness or a saved value cannot prove the Bridge/Worker loaded that
value. UI must show “已保存，生效未确认/未知” rather than “已生效”.

**Rejected alternatives:** Equating a successful read or save with live effect; treating mtime as
proof.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [SETUP_API.md](SETUP_API.md).

---

## ADR-008 — UI Inspector uses isolated Playwright; real Electron debugging needs separate authorization

**Status:** `ACCEPTED`
**Decision:** Level 1 UI testing uses a pinned Playwright harness with fake setup data. The production
DSH Electron page is not attached through CDP, no debug port is opened, and any real Electron
inspection requires a separate authorized isolated instance.

**Reason:** The production DSH has no supported agent-facing DOM/CDP endpoint; weakening auth or
opening debugging would create unsafe access to private UI.

**Rejected alternatives:** Enabling CDP on production DSH; reusing the production profile; reading
production page content via unsupported means.

**Related:** [UI_TESTING.md](UI_TESTING.md),
[DSH_ELECTRON_INSPECTOR_FEASIBILITY.md](DSH_ELECTRON_INSPECTOR_FEASIBILITY.md).

---

## ADR-009 — Production changes and isolated tests are separate

**Status:** `ACCEPTED`
**Decision:** Development and tests must use isolated profiles, fake data and read-only sources.
Production configuration writes, real sends, service restarts, audio-device changes and Hook/DLL
changes require separate explicit authorization.

**Reason:** Keeps tests safe and prevents test success from being confused with production
authorization.

**Rejected alternatives:** Testing against production Host/token; modifying voice switches to make a
test pass; disabling security controls.

**Related:** [AGENTS.md](../AGENTS.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-010 — Phase 4A-H request and revision hardening

**Status:** `ACCEPTED`
**Decision:**

- Origin validation compares complete `scheme + host + port`.
- No-Origin DSH same-origin GET is accepted only with loopback/Host, Sec-Fetch-Site, token and DSH
  connection checks.
- HTTP reads reject responses without a streaming reader instead of using unbounded `text()`.
- `accountVerified` is true only for an explicit supported boolean; an account object alone is unknown.
- `configRevision` is an opaque process-keyed HMAC over the authoritative saved-config coverage:
  voice, worker, TTS, permissions/allowlists and source state.

**Reason:** These were concrete pre-merge safety/contract defects found in review; fixing them
before Phase 4B avoids carrying an unsafe revision/auth foundation into writes.

**Rejected alternatives:** Public unkeyed SHA-256 over low-entropy allowlist IDs; trusting
Content-Length; inferring account verification from a generic object; partial UI-only revision.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [SETUP_API.md](SETUP_API.md),
[WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

---

## ADR-011 — Stage handoff memory is maintained, but not authoritative

**Status:** `ACCEPTED`
**Decision:** Each stage maintains `AI_CONTEXT.md` as a concise recovery summary and `DECISIONS.md`
for architecture decisions. On conflict, repository code, Git/GitHub state, tests and the named
authoritative docs win.

**Reason:** Long-running AI sessions need fast recovery without treating stale summaries as truth.

**Rejected alternatives:** Chat history as source of truth; a single oversized status file; copying
secrets/private data into memory files.

**Related:** [AI_CONTEXT.md](AI_CONTEXT.md), [AGENTS.md](../AGENTS.md).

---

## ADR-012 — Stacked PR integration uses merge commits and sequential retargeting

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** PR #3–#8 were integrated into `main` with merge commits. Each downstream PR was
retargeted to `main` after its base merged; no squash, rebase or force-push was used. The final PR #7
documentation union preserves the newer PR #8 state.

**Reason:** Preserves reviewed commit ancestry and PR boundaries, avoids duplicate diffs, and keeps
history auditable. Squash/rebase would break the stacked ancestry or rewrite shared history.

**Rejected alternatives:** Squash-merging the stack; rebasing branches onto `main`; force-pushing
rewritten branches; deleting branches to trigger automatic retargeting.

**Related:** [PROJECT_STATUS.md](PROJECT_STATUS.md), [AI_CONTEXT.md](AI_CONTEXT.md),
[AGENTS.md](../AGENTS.md).

---

## ADR-013 — Phase 4B-1 config writes are isolated, single-file and revision-checked

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** The first write infrastructure is an isolated single-file store. It requires an opaque
trusted test-sandbox capability (not a caller-supplied path), uses strict v1 schema validation, a pure
v0→v1 migration, a process-local HMAC revision, required `expectedRevision`, temp+fsync+rename atomic
save, post-save verification/rollback and read/write state separation. A pure read reports
`UNCHANGED`; a successful write reports `SAVED`/`PENDING_APPLY`, with runtime apply still unknown. The
HTTP write API is test-only and is not registered on the production DSH Host. It does not claim
multi-file transaction or cross-process compare-and-swap safety.

**Reason:** Write behavior must be tested and audited before any production configuration is touched.
A single-file store with optimistic concurrency and explicit failure states provides a safe
foundation; a production multi-file transaction and apply interface need a separate design.

**Rejected alternatives:** Direct writes to production `core.json`/WeChatAgent/Sender files; trusting
any string named `test` or `isolated`; silent last-writer-wins; unkeyed SHA-256 over private IDs;
treating multiple file renames as one transaction; persisting the HMAC key to make revisions
permanent; registering a write route on the current Host.

**Related:** [CONFIG_WRITE_API.md](CONFIG_WRITE_API.md),
[CONFIG_SOURCES.md](CONFIG_SOURCES.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-014 — Phase 4B-2A uses isolated source adapters, a save journal and split apply states

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** The coordination prototype uses one trusted sandbox, injected source adapters, a
per-transaction journal and a two-stage save/apply state model. Only `bridgeVoice` and
`senderService` are simulated writable sources. `core`, `workerSafety`, `wechatPermissions` and the
target map are read-only or never read. The coordinator serializes mutations in one instance,
never writes a production file, never starts/stops/reloads a service and never sends a WeChat task.
Plans use unpredictable IDs bound to an immutable private snapshot; high-risk confirmation names the
exact plan; plans expire and are consumed after journal creation. `APPLIED` requires each runtime to
return a loaded revision exactly matching the saved revision; file writes, PID liveness, mtime and
HTTP 200 are not apply proof. Journals are size-bounded, strict-schema and symlink-checked on read;
same-path temp+fsync+rename is best-effort, not a Windows power-loss atomicity claim. A failed save
without a `NOT_WRITTEN` outcome remains `UNKNOWN`, even if earlier steps were rolled back. Rollback is
reported complete only when the adapter's reported revision and a subsequent read-only observed
revision both exactly equal the pre-transaction revision; otherwise the result stays `UNKNOWN`.

**Reason:** The Bridge user switch and Worker final-safety permit are independent safety layers.
Multi-file configuration cannot be made transactionally safe by pretending independent renames are
one transaction. A journal plus explicit UNKNOWN/partial states is safer than a false claim of
complete rollback. Isolated fixture adapters let the protocol be tested without touching production
configuration or private target data.

**Rejected alternatives:** Treating Bridge `voice.enabled` and Worker `voice_enabled` as one setting;
accepting arbitrary paths/URLs/commands from the frontend; writing production files from this phase;
reusing a plan ID for different values; accepting any well-formed runtime revision; inferring applied
state from process/health evidence; automatic retry of uncertain apply/send; putting tokens, full
whitelists or private recovery documents into the journal.

**Related:** [CONFIG_COORDINATION.md](CONFIG_COORDINATION.md),
[CONFIG_SOURCES.md](CONFIG_SOURCES.md), [CONFIG_WRITE_API.md](CONFIG_WRITE_API.md),
[PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-015 — Phase 4B-2B writes use owner APIs; no direct file writes and no inferred apply

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** After auditing the installed Bridge, Voice Sender and WeChatAgent, the minimal safe
integration is: (1) Core does not write component-owned configuration files directly; (2) a writable
field is exposed only through the owning component's supported API; (3) owner API presence, Core
production authorization, effective write enablement, save capability and loaded-revision
confirmation are separate facts, and a capability report must keep them separate (`save.enabled` is
derived, never inferred from an API string); (4) `APPLIED` requires an exact loaded revision from the
owner, and the absence of that interface keeps the state `PENDING_APPLY` — it does not make a
supported save unsupported; (5) file locks/CAS are a secondary measure for a file contract with no
owner API, not a substitute for one, and a successful rename is name replacement only, not a claim of
crash atomicity or power-loss durability; (6) WeChatAgent permission changes remain a human console
action, and Worker `voice_enabled` is never a Core write target; (7) Phase 4B-2B-2 starts read-only
(capability/status projection) before any write is authorized.

**Reason:** The audit found that the Bridge reads `voice-settings.json` hot but has no writer or
revision; the Sender service reads `service.config.json` at boot and supports only an automation
`PUT` that rewrites the file non-atomically; WeChatAgent has a revision-guarded console but CLI and
account-switch writers without a shared CAS, mixed hot/boot readers and no loaded-config evidence.
Direct file writes would create lost updates and false "applied" claims. Using owner APIs keeps the
single-writer boundary with the component that owns the safety layer.

**Rejected alternatives:** Core writing JSON files directly; a generic lock protocol as the primary
coordination mechanism; treating `/health`, mtime, PID or equal file bytes as apply proof; merging
Bridge `enabled` with Worker `voice_enabled`; enabling WeChatAgent permission writes from Core;
starting 4B-2B-2 with a write control before the capability/status contract exists.

**Related:** [PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md),
[CONFIG_COORDINATION.md](CONFIG_COORDINATION.md), [CONFIG_SOURCES.md](CONFIG_SOURCES.md),
[PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-016 — Capability Schema v3 is Surface-level and strictly read-only

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** Phase 4B-2B-2a projects the audited component capability as schema v3. `readTiming`,
`hotReload` and `requiresRestart` are declared **per Surface**; a source cannot override them.
Sender automation is `RUNTIME_API / FULL / NOT_REQUIRED` with `save.state: SUPPORTED` but
`authorization: NOT_AUTHORIZED`; Sender TTS is `SERVICE_BOOT / NONE / REQUIRED` with
`save.state: UNSUPPORTED`. The projection is GET-only, reuses the existing loopback/Origin/Host/
token/connection guard, exposes no paths/tokens/whitelist names/target map and never enables a write
control. A detected version different from the audited version downgrades that source's capability to
`UNKNOWN`; unknown is never treated as unsupported or safe. `APPLIED` remains unreachable without an
exact loaded revision.

**Reason:** A source-level reload value would incorrectly tell the UI that Sender TTS can be updated
like automation (or vice versa). Users need to see what supports saving, what is authorized, what is
currently enabled, and what cannot be confirmed, as separate facts.

**Rejected alternatives:** Keeping reload fields at source level; treating a supported save API as an
authorization; treating a missing loaded revision as "no save support"; rendering `null` as off/safe;
adding a write route in a read-only phase; assuming an audited capability for an unaudited version.

**Related:** [CAPABILITY_API.md](CAPABILITY_API.md),
[PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md),
[CONFIG_SOURCES.md](CONFIG_SOURCES.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).
