# AI Context — Whale Voice

**Purpose:** compact cross-session recovery note. This is a summary, not an authority. Re-verify
against the repository, Git/GitHub, tests and the linked authoritative documents before acting.

**Last updated:** 2026-10-25

---

## 1. Project and repository

- **Project:** Whale Voice / 小鲸鱼语音中心
- **Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
- **Plugin ID:** `dsh-whale-voice`
- **Runtime:** DSH client plugin + DSH Host row
- **Stack:** plain JavaScript browser UI, Node.js Host bridge, no root runtime dependencies
- **Target OS:** Windows first

Architecture in one line:

```text
DSH UI -> Host read-only bridge -> Core detector/config read
       -> WeChatAgent / Voice Sender / Qwen status
       -> separate Voice Sender UI Automation for real voice delivery
```

See [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 2. Git baseline

- **main HEAD:** `9318686141942427cf54dc6daf404fe611869228` (merge of PR #14); verify live with
  `git rev-parse origin/main`. The PR #3–#8 integration baseline is `16c858b`; the older
  `pre-pr3-8-integration` backup tag is `b552ac0`.
- **Current development branch:** `feature/phase4b2b2a-capability-status` (read-only capability/status
  projection), branched from `main` at `9318686`; **PR #15 open**, not merged.
- **Current local HEAD:** verify live with `git rev-parse HEAD`; the branch changes Core API, frontend
  and tests, but adds no write route.
- **Worktree:** clean at the Phase 4B-2B-2a baseline
- **Remote:** `https://github.com/qianqiucn/dsh-whale-voice.git`

PRs #1/#2 and feature/docs PRs #3–#14 are merged. Phase 4B-1 and 4B-2A are merged but remain
`OFFLINE`; Phase 4B-2B-1 is `AUDIT COMPLETE` / `OFFLINE`; Phase 4B-2B-2a is `OFFLINE` (schema v3,
Host GET routes, isolated UI); Phase R1 is **COMPLETE**. No production write route exists.

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
| Phase 4B-2B-2a capability/status projection | **`OFFLINE`** — schema v3 surface-level capability projection, Host GET routes and isolated frontend visualization; no write route |
| Phase 4B-2B-2b Sender automation write | **NOT STARTED** |

Real GUI evidence exists for the Send & Safety page; it does **not** mean the Windows safety backend
exists.

---

## 5. Current task

This task is **Phase 4B-2B-2a: read-only capability/status integration and frontend visualization**.

Scope:

- schema v3: `readTiming`, `hotReload`, `requiresRestart` are per **Surface** (Sender automation vs
  TTS must not share a reload value);
- `core/capabilities.mjs` projects audited static capability + detector/config dynamic observation;
  `core/capability-view.mjs` derives browser-facing states;
- Host/Core add GET `/capabilities` and `/capabilities/status` behind the existing guard; no write
  route;
- Overview, Voice Settings, Permissions, Studio, Send & Safety, Components and Advanced show real
  support/authorization/apply limits;
- isolated Playwright covers capability states, offline/invalid/timeout, stale protection and 780 px;
- no production write, service restart, audio operation or WeChat send; do not auto-merge the PR.

The API contract is [CAPABILITY_API.md](CAPABILITY_API.md).

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
4. Phase 4B-2B-2a code/API/UI are implemented but the running DSH Host has not been reloaded; live
   Electron GUI integration is pending separate authorization. Isolated Playwright passing is not
   real Host acceptance.
5. Phase 4B-2B-2b (Sender automation write) is **NOT STARTED** and needs separate authorization.
6. Safety backends (hotkey, cancel/recovery, window discovery/focus, game detection) are not
   implemented.
7. Native voice delivery candidates remain unintegrated and unverified.
8. Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE` tests.
9. Real DSH Electron DOM/CSS/Console cannot be read without separate authorized debugging; current
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
  version mismatch/unknown downgrades capability to `UNKNOWN`; frontend shows support, authorization,
  saved value, runtime and apply limits separately. Read-only only.
- Isolated Playwright harness with fake setup bridge; no production DSH/WeChat connection.
- 174 Node tests (173 pass, 1 platform skip; including 49 coordination, 5 capability, 7
  capability-schema, 8 capability projection and 10 capability-reader/validation tests) and 23 UI
  checks pass. These are offline/contract evidence, not real production write/apply acceptance.

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

Phase 4B-2B-2a result:

```text
build: PASS, client.js regenerated (in sync)
node --test: 173/174 PASS (1 platform skip; includes 49 coordination, 5 capability, 7 schema, 8 projection and 10 reader/validation tests)
UI: 23/23 PASS
```

These are offline/contract tests. They do not prove a production Bridge/Worker apply, real WeChat
send or production configuration-write acceptance.

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
- Phase 4B-2B-2a PR #15: CI is reported from its actual PR run; do not merge.

---

## 11. Next priority

1. Phase 4B-2B-2b: Sender automation write via the audited `PUT /v1/automation/config` only, after a
   separate production-write authorization; keep `save.enabled=false` until then and never claim
   `APPLIED` without a loaded revision. Bridge/TTS writes require owner revision endpoints first.
   It is **NOT STARTED**.
2. Optionally obtain authorization for a normal DSH reload to verify the new `/capabilities` routes
   in the real Electron GUI; isolated Playwright passing is not Host acceptance.
3. Keep Native Voice Delivery Research as a parallel `RESEARCH_CANDIDATE`; do not implement native
   send until all admission gates and owner authorization are met.
4. Start new development branches from the integrated `main`; do not reuse merged PR branches as a
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

**2026-10-25**, after Phase 4B-2B-2a: `main` is `9318686` (PR #14 merge); Phase R1 is **COMPLETE**,
Phase 4B-1 and 4B-2A are merged but `OFFLINE`, Phase 4B-2B-1 is **AUDIT COMPLETE / `OFFLINE`**,
Phase 4B-2B-2a is **`OFFLINE`** (schema v3 capability/status routes + isolated UI; live Host reload
pending), Phase 3B/4A remain `INTEGRATED`, and Phase 4B-2B-2b is **NOT STARTED**. 174 Node (173 pass,
1 skip) / 23 UI checks are offline evidence, not production write/apply acceptance. No production
configuration or runtime behavior change.
