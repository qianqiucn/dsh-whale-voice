# AI Context — Whale Voice

**Purpose:** compact cross-session recovery note. This is a summary, not an authority. Re-verify
against the repository, Git/GitHub, tests and the linked authoritative documents before acting.

**Last updated:** 2026-10-27

---

## 1. Project and repository

- **Project:** Whale Voice / 小鲸鱼语音中心 — multi-engine TTS plugin; Qwen3-TTS/`whale-v1` are the
  current reference/personal path, not product defaults.
- **Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
- **Plugin ID:** `dsh-whale-voice`
- **Runtime:** DSH client plugin + DSH Host row
- **Stack:** plain JavaScript browser UI, Node.js Host bridge, no root runtime dependencies
- **Target OS:** Windows first

Architecture in one line:

```text
DSH UI -> Host read-only bridge -> Core detector/config read
       -> provider-neutral TTS registry (design-only) + current Qwen reference
       -> WeChatAgent / Voice Sender status
       -> separate Voice Sender UI Automation for real voice delivery
```

See [ARCHITECTURE.md](ARCHITECTURE.md) and
[TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md).

---

## 2. Git baseline

- **Plan 08-D-A branch:** `feature/plan08d-task-catalog` adds `core/audio/task-catalog.mjs` — an
  isolated persistent catalog over the trusted temporary sandbox that stores only initial
  `CREATED`/`BLOCKED_RIGHTS` records, issues owner `task:fixture-<32hex>` ids and prevents duplicate
  creation by `(scopeId, idempotencyKey)` (three exports, 15 fixed codes, D01–D20 + F01–F05 +
  R01–R03 / 35 tests, 34 pass + 1 platform skip). One fixed bounded file, per-capability queue,
  bounded fd reads, full short-write completion, atomic temp+fsync+rename+read-back, post-commit
  identity checks, close-failure phase propagation, temporary-file ownership behind a full trust
  gate, corruption-before-change priority and `WRITE_UNKNOWN` locking; the 035 F01–F05 and 036
  R01–R03 storage-boundary repairs are included, pending re-review. No execution, save, delivery
  or cross-process recovery. `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`. Full suite
  **600 / 598 pass / 2 platform skips / 0 fail**, UI **24/24**.
- **Plan 08-C branch:** `feature/plan08c-task-fixture-runner` adds `core/audio/task-fixture-runner.mjs`
  — one synchronous composition of the 08-B source check, the 06-D pure readiness gate, at most one
  existing RVC Fixture dispatch and the existing AudioTask v1 create/transition/validate/project
  actions (three pure exports, 14 fixed codes, C01–C20 / 20 tests). Success ends at the existing
  `ARTIFACT_READY` with a Fake reference only; TTS stays an explicit unsupported block; no bytes,
  save, Relay, queue, GUI or Host route. `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; merged via
  PR #29 at **M `b9f663c`** (report 0026). Full suite **565 / 564 pass / 1 platform skip / 0 fail**,
  UI **24/24**.
- **Plan 08-B branch:** `feature/plan08b-source-artifacts` adds `core/audio/source-artifacts.mjs` — a
  strict Fixture source-Artifact library plus one resolver that reuses the 08-A voice binding exactly
  once and compares TTS text (code-unit strict) or RVC input-audio metadata (four fields) with the same
  request (four pure exports, 18 fixed codes, S01–S22 / 25 tests). `OFFLINE` / `FIXTURE_ONLY` /
  `NOT_INTEGRATED`; merged via PR #28 at **M `3182ca1`** (report 0024); no bytes/codec/hash/peak,
  dispatch, task transition, queue, GUI or Host route. Full suite **545 / 544 pass / 1 platform skip /
  0 fail**, UI **24/24**.
- **Plan 08-A branch:** `feature/plan08a-voice-assets` adds `core/audio/voice-assets.mjs` — a strict
  Fixture shared-voice-asset library plus an explicit Provider binding resolver over the existing
  AudioTaskDraft v1 and 06-B negotiation (four pure exports, 27 fixed codes, V01–V26 / 28 tests).
  `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; merged via PR #27 at **M `df4e4b7`** (report 0022);
  no dispatch, task advance, Artifact, TTS text linking, queue, GUI or Host route. Full suite
  **520 / 519 pass / 1 platform skip / 0 fail**, UI **24/24**.
- **Plan 06-D branch:** `feature/plan06d-provider-readiness` adds
  `core/audio/provider-readiness.mjs` — a Fixture installation/resource admission wrapper over the
  06-B negotiation and 06-C dispatch (PRESENT/ABSENT/UNKNOWN, CPU/GPU/REMOTE, optional single existing
  RVC dispatch) with D01–D27. Plan06-D-F01 adds the D27 cross-category evidence table and controlled
  reason-namespace clarification (docs-only). `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; full suite
  **492 / 491 pass / 1 platform skip / 0 fail**, UI **24/24**. PR #26 merged at **M `a1bdcbb`**
  (report 0019); no real installer, hardware probe, TTS synthesizer, queue or 08 mapping.
- **Plan 06-C branch:** `feature/plan06c-rvc-fake-dispatch` adds `core/audio/provider-dispatch.mjs`
  (one synchronous RVC Fixture dispatch over 06-B negotiation + existing RVC Fake gateway + existing
  result validator) and `core/audio/fixture-input-boundary.mjs` (shared internal copy/freeze helper),
  with T01–T26 + F01/F02. After the F01/F02 review repair (complete-envelope freeze, null-prototype
  copy): `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; full suite
  **465 / 464 pass / 1 platform skip / 0 fail**, UI **24/24**. PR #25 merged at **M `b9336fb`**
  (report 0016); TTS dispatch, 08 mapping, real provider/model/audio/task/send remain unimplemented.
- **Plan 06-B branch:** `feature/plan06b-provider-instances` adds `core/audio/provider-instances.mjs`
  (Fixture provider-instance view + explicit capability negotiation) and R01–R30 + N01–N18. After the
  Plan06-B-F01 review repair: `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; full suite
  **431 / 430 pass / 1 platform skip / 0 fail**, UI **24/24**. PR #24 merged at **M `ad25bc6`**
  (report 0013); no real provider, adapter, model, synthesis, scheduling or send capability.
  The older TTS-A bullets below are historical.
- **main HEAD:** `b9f663c9e732e319a0920a3e02737400ee4cf0f2` (merge of PR #29); verify live with
  `git rev-parse origin/main`. The earlier `3182ca1` was the PR #28 baseline, `df4e4b7` the PR #27
  baseline, `a1bdcbb` the PR #26 baseline, `b9336fb` the PR #25 baseline and `bf9cf66` the PR #15
  baseline; the older `pre-pr3-8-integration` backup tag is `b552ac0`.
- **Current development branch:** `feature/tts-provider-neutral-contract` (TTS-A audit + pure
  provider contract/registry/v2 migration design + isolated tests), branched from `main` at
  `bf9cf66`. TTS-A is design/`OFFLINE`; no real provider, Host route, credential store or production
  config change. **PR #16 open**, not merged; **0 GitHub reviews** recorded. Engineering HEAD is
  `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773` (Plan 02 F01–F05); a later documentation-sync commit is
  recorded separately in the PR history.
- **Current local HEAD:** verify live with `git rev-parse HEAD`; TTS-A adds `core/tts/*` and
  `core/svc/*` pure modules, tests and docs, but no runtime/provider wiring.
- **Worktree:** clean at the TTS-A Plan 03-A pre-merge checkpoint
- **Remote:** `https://github.com/qianqiucn/dsh-whale-voice.git`

PRs #1/#2 and feature/docs PRs #3–#15 are merged. Phase 4B-1 and 4B-2A are merged but remain
`OFFLINE`; Phase 4B-2B-1 is `AUDIT COMPLETE` / `OFFLINE`; Phase 4B-2B-2a is `INTEGRATED` after real
Host/GUI acceptance (full eight-page coverage, not `VERIFIED` for destructive edge cases); Phase R1
is **COMPLETE**. TTS-A is `DESIGN`/`OFFLINE` with all provider candidates `NOT_IMPLEMENTED`. No
production write route or real TTS provider exists.

**PR #16 pre-merge checkpoint (Plan 03-A):** engineering HEAD `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773`;
CI run `40163881122` build+ui **SUCCESS**; Node **197** (196 pass, 1 platform skip); UI **24/24**;
F01–F05/N01–N05 complete. The earlier 192/191/1 count is a **historical pre-F01–F05 snapshot**. PR is
**OPEN, not merged**; CI is not human approval. Merge requires separate explicit user authorization.

**PR #16 pre-merge repair (Plan 03-A-F01, 2026-10-26):** SVC input boundary hardened (fixed-layer
descriptor checks, no getter/Symbol/hidden bypass, strict result/delivery allowlists, redacted
`<unknown-key>` paths, canonical UTC `createdAt`, fresh output objects). SVC tests **29/29** (original
5 + R01–R24); full `node --test` **221 / 220 pass / 1 platform skip**; TTS provider **16/16**; UI
**24/24**; `node build.mjs` passes and `client.js` is unchanged. PR #16 remains **OPEN, not merged**;
merge recommendation is **`BLOCKED_PENDING_SVC_FIX`** until the repair HEAD is reviewed and its own
build/ui CI is verified. No provider, SVC runtime, model, download, send or WeChat capability was
added; the 197/196/1 numbers remain the historical checkpoint for the earlier HEAD.

---

## 3. Merged PR chain

```text
main
  └─ #3 → #4 → #5 → #6 → #8 → #7 → #9 Phase 4B-1 → #10 R1 audit → #11 R1 status → #12 4B-2A → #13 4B-2A handoff → #14 4B-2B-1 audit
```

| PR | Merge commit | Result |
|---|---|---|
| #3 | `7b66dca` | merged; setup wizard |
| #4 | `91929fd` | merged; read-only Core / Host bridge |
| #5 | `9688ff8` | merged; Phase 4A config read |
| #6 | `95a3528` | merged; isolated UI harness + CI `ui` |
| #8 | `5c4bc56` | merged; Send & Safety + research + docs repair |
| #7 | final documentation merge | merged; Inspector research + docs union |
| #9 | `97e96b5` | merged; Phase 4B-1 isolated config write foundation |
| #10 | `70c0756` | merged; Phase R1 docs/status reconciliation and non-runtime hygiene |
| #11 | `8abf031` | merged; R1 final status baseline |
| #12 | `a7a3056` | merged; Phase 4B-2A isolated coordination protocol |
| #13 | `e0ce035` | merged; Phase 4B-2A handoff baseline (docs only) |
| #14 | `9318686` | merged; Phase 4B-2B-1 capability audit + schema v2 fixtures |

The Phase 3/4 stack (#3–#8) was integrated in order. Phase 4B-1 (#9), R1 (#10/#11), Phase 4B-2A
(#12), the 4B-2A handoff (#13) and the 4B-2B-1 audit (#14) were merged with Merge Commits after
explicit authorization. **0 human reviews** were recorded for #9–#14 on GitHub at merge time; CI
green is not approval.

Phase 4B-1 consists of `core/config-sandbox.mjs`, `core/config-schema.mjs`, `core/config-store.mjs`,
`core/isolated-write-server.mjs` and `test/config-store.test.mjs`. Phase 4B-2A adds
`core/config-coordinator.mjs` and isolated fixture tests. Both are merged but remain `OFFLINE`; no
production write route exists.

---

## 4. Completed stages and acceptance levels

| Area | Status |
|---|---|
| Phase 3B real DSH Host | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A read-only config | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A-H safety contract fixes | Merged in #4/#5/#8; current 98-test suite includes these contracts |
| Isolated Playwright UI Inspector | Merged in #6/#7/#8; 12/12 UI checks |
| Send & Safety frontend | `MOCK` / disabled backend controls; real DSH GUI visual acceptance PASS |
| Native voice delivery | `RESEARCH_CANDIDATE`; WeChatAgent native = `UNSUPPORTED` |
| Phase 4B-1 isolated config write | **Merged into `main`; `OFFLINE`** — single-file store + test-only API; no production write |
| Phase R1 repository audit | **COMPLETE** — PR #10/#11 merged; docs/status and non-runtime hygiene |
| Phase 4B-2A coordination protocol | **Merged into `main`; `OFFLINE`** — isolated source adapters, journal/recovery, save/apply split, Fake Runtime; no production write |
| Phase 4B-2B-1 component capability audit | **`AUDIT COMPLETE` / `OFFLINE`** — real read timing, write interfaces, revision/apply evidence and blockers; no production write |
| Phase 4B-2B-2a capability/status projection | **`INTEGRATED`** — real DSH Host/GUI, schema v3, eight-page coverage; read-only, no write route; not `VERIFIED` for destructive edge cases |
| Phase 4B-2B-2b Sender automation write | **NOT STARTED** |
| TTS-A Provider-neutral audit/contracts | **`DESIGN` / `OFFLINE`** — audit + pure contract/registry/v2 migration + isolated TTS/SVC tests; 10 TTS candidates and 2 separate SVC candidates, all `NOT_IMPLEMENTED`, no Host wiring |

Real GUI evidence exists for the Send & Safety page; it does **not** mean the Windows safety backend
exists.

---

## 5. Current task

This task is **TTS-A: Provider-neutral audit and architecture design**.

Scope:

- audit Qwen hardcodes in the detector/config/capabilities/coordinator/UI into Qwen-specific,
  current-selection and generic-TTS categories ([TTS_PROVIDER_AUDIT.md](TTS_PROVIDER_AUDIT.md));
- define a provider-neutral interface, 10 TTS candidates (including IndexTTS, Gemini TTS and OpenAI
  Speech), a separate SVC candidate registry (Seed-VC/RVC), unified synthesis result and delivery
  boundary, and three-layer Core/Relay/WeChatAgent responsibilities;
- add pure `core/tts/provider-contract.mjs`, `provider-registry.mjs`, `provider-config.mjs` and
  `core/svc/svc-contract.mjs`/`svc-registry.mjs`; no I/O, no provider network, no Host route, no
  production config;
- add isolated tests for local/cloud fake status, Qwen-offline independence, unsupported
  voice/emotion, missing credentials, timeout/error, unknown version, migration, Mock/real isolation
  and the no-WeChat-send result boundary.

TTS-A does **not** implement a real provider or GUI provider switcher. TTS-B is the next
implementation step; TTS-C is real adapters/credentials. Phase 4B-2B-2b remains separate and NOT
STARTED.

---

## 6. Unresolved issues

1. **0 human reviews** were recorded for PR #9–#14 on GitHub at merge time; CI green does not equal
   approval.
2. Phase 4B-2A is a merged but `OFFLINE` protocol prototype using in-memory fixture adapters and Fake
   Runtime. Production source adapters, real runtime confirmation, cross-process CAS and production
   apply are **NOT STARTED**.
3. Phase 4B-2B-1 found **no supported write interface** for the Bridge and no loaded-revision API in
   any component; Sender supports automation `PUT` only, WeChatAgent has a human console with three
   unshared writers. `APPLIED` is unreachable today; production writes remain blocked.
4. Phase 4B-2B-2a is `INTEGRATED` after real DSH Host/GUI acceptance; destructive No-Core/timeout/
   invalid-schema injections and Console/Network reading remain unverified. It is not `VERIFIED`.
5. Phase 4B-2B-2b (Sender automation write) is **NOT STARTED** and needs separate authorization.
6. TTS-A provides design-only provider contracts. No real local/cloud/custom adapter, credential
   store, provider request, provider switcher or production TTS integration exists.
7. Safety backends (hotkey, cancel/recovery, window discovery/focus, game detection) are not
   implemented.
8. Native voice delivery candidates remain unintegrated and unverified.
9. Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE` tests.
10. Real DSH Electron DOM/CSS/Console cannot be read without separate authorized debugging; current
    GUI acceptance used UIA + screenshots.

---

## 7. Verified component capabilities

- Real DSH Host route and token-protected `window.__WHALE_SETUP__` bridge.
- Read-only config snapshot:
  - Bridge voice enabled/mode/trigger/group/probability/default voice
  - Worker final-safety permit as a separate layer
  - TTS provider, saved voice/model, runtime model/voice
  - Permission **counts only** (no names)
  - Sender offline/health/unknown separation
  - Saved vs active state separation
- Full-origin (`scheme + host + port`) request guard shared by Host and isolated Core server.
- Bounded streamed health/config reads; no unbounded fallback body read.
- Explicit-only `accountVerified`; account object alone stays unknown.
- Opaque process-keyed config revision covering voice/worker/TTS/permission/source fields.
- Phase 4B-1 isolated store: trusted sandbox capability, strict v1 schema, pure v0→v1 migration,
  HMAC revision, `expectedRevision` conflict detection, single-file atomic save/verify/rollback,
  sanitized public projection, read/write state separation and a test-only loopback API. No production
  write route.
- Phase 4B-2A coordination protocol: isolated plan/journal/recovery over fixture source adapters,
  Bridge/Worker separation, `SAVED`/`PENDING_APPLY` vs `APPLIED`, exact saved/runtime revision match,
  and rollback confirmation by reported revision plus read-back observation. No production adapter.
- Phase 4B-2B-1 audit: Bridge hot-reads `voice-settings.json` per call with no writer or revision;
  Sender reads config at boot, supports automation `PUT` only (plain full-file write, no revision;
  owner API exists but Core has **no production write authorization**); WeChatAgent console has a
  SHA-256 saved-file revision but CLI/account-switch writers lack a shared CAS; no component exposes
  a loaded revision. Owner API, authorization, save capability and apply confirmation are separate
  (`save.enabled` is derived); no source can reach `APPLIED` today.
- Phase 4B-2B-2a projection: schema v3 with surface-level `readTiming`/`hotReload`/`requiresRestart`
  (automation `RUNTIME_API/FULL/NOT_REQUIRED` vs TTS `SERVICE_BOOT/NONE/REQUIRED`); Host GET
  `/capabilities` and `/capabilities/status`; static audited contract + detector/config observation;
  version mismatch/unknown downgrades reload fields and capability to `UNKNOWN`; **Worker version is
  independent — no Worker version identifier means `UNKNOWN`, and the Sender Service version is never
  used as Worker evidence**; Worker keeps `NEVER_WRITE` and writes disabled while Sender
  automation/TTS stay governed by the Service version. Read-only only.
- Isolated Playwright harness with fake setup bridge; no production DSH/WeChat connection.
- **Historical pre-F01–F05 snapshot:** 192 Node tests (191 pass, 1 platform skip; including 49
  coordination, 5 capability, 7 capability-schema, 9 capability projection, 10
  capability-reader/validation, 12 TTS provider and 4 SVC contract/registry tests) and 24 UI checks.
- **Current PR #16 Plan 02/03-A checkpoint:** 197 Node tests (196 pass, 1 platform skip; 16 TTS +
  5 SVC tests after N01–N05) and 24 UI checks. These remain offline/contract evidence, not real
  production write/apply or real provider/SVC acceptance.

---

## 8. Mock / not implemented

Do not present these as working:

- global emergency-stop hotkey or listener;
- real task cancel/device recovery;
- WeChat window discovery, auto-focus or target identity validation;
- fullscreen/game detection and pause policy;
- automatic Qwen startup;
- native voice delivery (`wechatagent-native` or `third-party-native`);
- production configuration write/apply API (Phase 4B-1/4B-2A are isolated only; 4B-2B-1/2a added no
  write path or write control);
- owner-side config write/revision APIs for Bridge, Sender TTS and WeChatAgent;
- production source adapters, real multi-file journal durability and cross-process CAS;
- actual TTS preview/cloud provider;
- real group voice;
- production installer/update/rollback.

---

## 9. Critical safety boundaries

- No production configuration writes without a separate explicit authorization.
- After the 4B-2B-1 audit: do **not** write component-owned configuration files directly. Use the
  owner's supported API; keep Bridge and WeChatAgent read-only until those APIs exist; never treat
  `/health`, mtime, PID or equal file bytes as apply proof. An available owner API is not a write
  authorization; `save.enabled` requires both plus a supported save and an authorized write mode.
- The 4B-2B-2a capability routes are GET-only projections. They reuse the existing loopback, Origin,
  Host, token and `connection` guard and must never gain a write branch, arbitrary path/URL/query or
  private target data.
- Phase 4B-1 store/API must remain isolated: only a trusted sandbox capability may be used; never
  point it at production directories or register its write route on the Host without separate
  authorization. No silent overwrite; use `expectedRevision`. Do not claim a multi-file transaction
  from separate single-file renames.
- Never modify `voice.enabled`, Worker safety permit, whitelist, target maps or audio devices as part
  of development/tests.
- No real WeChat text/voice send without explicit authorization and the existing safety gates.
- `UNKNOWN` is terminal for automatic resend.
- Never automatically switch native/UI Automation backends after a possible send.
- Never weaken Host authentication, Origin checks, token checks, loopback constraints or
  `Sec-Fetch-Site` handling to make tests pass.
- Never read Hook/audit tokens, chat databases, private target maps or credentials.
- No DSH/WeChatAgent/WeChat/Sender/Qwen restart without authorization.
- No global hotkey, focus takeover or driver/audio-device change from this repository.
- UI Inspector must use isolated Playwright; production Electron debugging requires separate
  authorization.
- No PR auto-merge.

---

## 10. Tests and recent results

Commands:

```powershell
node build.mjs
node --test
npm.cmd run test:ui
```

Phase 4B-2B-2a result (historical pre-F01–F05):

```text
build: PASS, client.js regenerated (in sync)
node --test: 191/192 PASS (1 platform skip; includes 49 coordination, 5 capability, 7 schema, 9 projection, 10 reader/validation, 12 TTS provider and 4 SVC tests)
UI: 24/24 PASS
```

Current PR #16 checkpoint (Plan 02/03-A):

```text
build: PASS, client.js 217349 bytes (in sync)
node --test: 196/197 PASS (1 platform skip; includes 16 TTS and 5 SVC tests)
UI: 24/24 PASS
CI: run 40163881122 build+ui SUCCESS at engineering HEAD 3ad32bc
```

These are offline/contract tests. They do not prove a production Bridge/Worker apply, real WeChat
send, real provider/SVC, or production configuration-write acceptance.

CI:

- PR #9 head `f54538c`: build + ui SUCCESS (run `40143287505`);
- PR #10 head `c1e35de`: build + ui SUCCESS (run `40144453337`);
- PR #11 head `5b98152`: build + ui SUCCESS (run `40145543671`);
- PR #12 head `c99e0c4`: build + ui SUCCESS (run `40148228220`);
- `main` at `70c0756` after PR #10: build + ui SUCCESS (run `40144888398`);
- `main` at `8abf031` after PR #11: build + ui SUCCESS (run `40145762507`);
- `main` at `a7a3056` after PR #12: build + ui SUCCESS (run `40148540641`);
- PR #13 head `14cee64`: build + ui SUCCESS (run `40148775008`);
- `main` at `e0ce035` after PR #13: build + ui SUCCESS (run `40149074319`);
- PR #14 head `b6f86bf`: build + ui SUCCESS (run `40150989182`);
- `main` at `9318686` after PR #14: build + ui SUCCESS (run `40151464926`);
- PR #15 head `972ad8d`: build + ui SUCCESS (run `40154441917`);
- `main` at `bf9cf66` after PR #15: build + ui SUCCESS (run `40154748343`).
- PR #16 engineering head `3ad32bc`: build + ui SUCCESS (run `40163881122`); the later docs-sync HEAD
  must be checked separately and is the only valid CI for that commit.
- TTS-A PR #16 remains **OPEN, not merged**; do not merge automatically.

---

## 11. Next priority

1. **PR #16 merge decision (Plan 03-B):** wait for explicit user authorization for this exact PR and
   HEAD; re-verify main/base/HEAD/CI/reviews before any Merge Commit. Current task stops before merge.
2. TTS-B: implement Provider service and neutral configuration on top of the TTS-A contract;
   provider-aware status, v2 migration and neutral read-only UI, with isolated tests. No real
   provider/credentials/production write. Then TTS-C real local/cloud/custom adapters after separate
   security review.
3. Phase 4B-2B-2b: Sender automation write via the audited `PUT /v1/automation/config` only, after a
   separate production-write authorization; keep `save.enabled=false` until then and never claim
   `APPLIED` without a loaded revision. Bridge/TTS writes require owner revision endpoints first.
   It is **NOT STARTED**.
4. Keep Native Voice Delivery Research as a parallel `RESEARCH_CANDIDATE`; do not implement native
   send until all admission gates and owner authorization are met.
5. Start new development branches from the integrated `main`; do not reuse merged PR branches as a
   baseline.

---

## 12. Re-verify before continuing

Do not trust this summary alone. Verify:

- current branch, HEAD, remote, worktree;
- actual PR bases/heads, CI, reviews and mergeability;
- current project status/roadmap/architecture;
- current behavior tests and UI tests;
- whether AI_CONTEXT has become stale relative to Git and code;
- no uncommitted user changes or secrets;
- production DSH/WeChat/Sender/Qwen state if the task touches runtime behavior.

---

## 13. Last update

**2026-10-25**, after TTS-A Plan 03-A: `main` is `bf9cf66` (PR #15 merge); Phase R1 is **COMPLETE**,
Phase 4B-1 and 4B-2A are merged but `OFFLINE`, Phase 4B-2B-1 is **AUDIT COMPLETE / `OFFLINE`**, Phase
4B-2B-2a is **`INTEGRATED`** after real Host/GUI acceptance (full eight-page coverage; not
`VERIFIED` for destructive edge cases), Phase 3B/4A remain `INTEGRATED`, TTS-A is **`DESIGN` /
`OFFLINE`** (pure provider contract/registry/SVC/v2 migration; no provider wired), and Phase
4B-2B-2b is **NOT STARTED**. PR #16 is **OPEN, not merged**, at engineering HEAD `3ad32bc` then a
docs-sync commit; CI `40163881122` passed. Current checkpoint: **197 Node (196 pass, 1 skip) / 24 UI
checks**, offline/contract evidence only. Merge awaits explicit user authorization; no production
configuration or runtime behavior change.
