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

- **main HEAD:** `8abf0313d506b5715e538346f1f5c1cd9c8a85a9` (merge of PR #11); verify live with
  `git rev-parse origin/main`. The PR #3–#8 integration baseline is `16c858b`; the older
  `pre-pr3-8-integration` backup tag is `b552ac0`.
- **Current development branch:** `feature/phase4b-config-coordination` (Phase 4B-2A), branched from
  `main` at `8abf031`.
- **Current local HEAD:** verify live with `git rev-parse HEAD`; the Phase 4B-2A branch is an isolated
  protocol/prototype PR and has not modified production configuration.
- **Worktree:** clean at the Phase 4B-2A baseline
- **Remote:** `https://github.com/qianqiucn/dsh-whale-voice.git`

PRs #1/#2 and feature/docs PRs #3–#11 are merged. Phase 4B-1 and 4B-2A are `OFFLINE`; Phase R1 is
**COMPLETE**. No production write route exists.

---

## 3. Merged PR chain

```text
main
  └─ #3 → #4 → #5 → #6 → #8 → #7 → #9 Phase 4B-1 → #10 R1 audit → #11 R1 status
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

The Phase 3/4 stack (#3–#8) was integrated in order. Phase 4B-1 (#9), R1 (#10) and the R1 status
baseline (#11) were merged with Merge Commits after explicit authorization. **0 human reviews** were
recorded for #9–#11 at merge time; CI green is not approval.

Phase 4B-1 consists of `core/config-sandbox.mjs`, `core/config-schema.mjs`, `core/config-store.mjs`,
`core/isolated-write-server.mjs` and `test/config-store.test.mjs`. Phase 4B-2A adds
`core/config-coordinator.mjs` and isolated fixture tests. Both remain `OFFLINE`; no production write
route exists.

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
| Phase 4B-2A coordination protocol | **`OFFLINE`** — isolated source adapters, journal/recovery, save/apply split, Fake Runtime; no production write |
| Phase 4B-2B production adapters/apply | **NOT STARTED** |

Real GUI evidence exists for the Send & Safety page; it does **not** mean the Windows safety backend
exists.

---

## 5. Current task

This task implements **Phase 4B-2A: isolated unified configuration coordination**.

Scope:

- define the authority matrix for Core, Bridge, WeChatAgent, Sender Service, Worker safety and TTS;
- add `core/config-coordinator.mjs` for plan/validate/execute/apply/recover over injected source
  adapters and a trusted test sandbox;
- keep Bridge `voice.enabled` and Worker `voice_enabled` as separate safety layers;
- add a journal, partial-save/rollback handling and explicit UNKNOWN/PARTIALLY_APPLIED states;
- use only in-memory fixture adapters and Fake Runtime for tests;
- no production file, Host route, service restart/reload, audio operation or WeChat send;
- update architecture/config/status/roadmap/memory and add Phase 4B-2A tests.

No production configuration, service restart, DSH reload or real send is involved.

---

## 6. Unresolved issues

1. **0 human reviews** were recorded for PR #9, PR #10 and PR #11 at merge time; CI green does not equal approval.
2. Phase 4B-2A is an `OFFLINE` protocol prototype using in-memory fixture adapters and Fake Runtime.
   Production source adapters, real runtime confirmation, cross-process CAS and production apply are
   **NOT STARTED** (Phase 4B-2B).
3. Safety backends (hotkey, cancel/recovery, window discovery/focus, game detection) are not
   implemented.
4. Native voice delivery candidates remain unintegrated and unverified.
5. Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE` tests.
6. Real DSH Electron DOM/CSS/Console cannot be read without separate authorized debugging; current
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
  Bridge/Worker separation, `SAVED`/`PENDING_APPLY` vs `APPLIED`, and Fake Runtime confirmation. No
  production adapter or route.
- Isolated Playwright harness with fake setup bridge; no production DSH/WeChat connection.
- 131 Node tests (including 32 Phase 4B-2A coordination tests) and 12 UI checks pass on the
  Phase 4B-2A branch. These are offline/contract evidence, not real production write/apply acceptance.

---

## 8. Mock / not implemented

Do not present these as working:

- global emergency-stop hotkey or listener;
- real task cancel/device recovery;
- WeChat window discovery, auto-focus or target identity validation;
- fullscreen/game detection and pause policy;
- automatic Qwen startup;
- native voice delivery (`wechatagent-native` or `third-party-native`);
- production configuration write/apply API (Phase 4B-1/4B-2A are isolated only);
- production source adapters, real multi-file journal durability and cross-process CAS;
- actual TTS preview/cloud provider;
- real group voice;
- production installer/update/rollback.

---

## 9. Critical safety boundaries

- No production configuration writes without a separate explicit authorization.
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

Phase 4B-2A result:

```text
build: PASS, client.js 186092 bytes
node --test: 131/131 PASS (including 32 Phase 4B-2A coordination tests)
UI: 12/12 PASS
```

These are offline/contract tests. They do not prove a production Bridge/Worker apply, real WeChat
send or production configuration-write acceptance.

CI:

- PR #9 head `f54538c`: build + ui SUCCESS (run `40143287505`);
- PR #10 head `c1e35de`: build + ui SUCCESS (run `40144453337`);
- PR #11 head `5b98152`: build + ui SUCCESS (run `40145543671`);
- `main` at `70c0756` after PR #10: build + ui SUCCESS (run `40144888398`);
- `main` at `8abf031` after PR #11: build + ui SUCCESS (run `40145762507`);
- Phase 4B-2A branch: CI is reported from its actual PR run.

---

## 11. Next priority

1. Phase 4B-2B: production source adapters, trusted loaded-revision confirmation, cross-process
   locking/CAS or a single-writer boundary, restricted recovery storage, Windows validation and
   production write/apply authorization. It is **NOT STARTED** and requires a separate task and
   authorization; production writes still require separate authorization.
2. Keep Native Voice Delivery Research as a parallel `RESEARCH_CANDIDATE`; do not implement native
   send until all admission gates and owner authorization are met.
3. Start new development branches from the integrated `main`; do not reuse merged PR branches as a
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

**2026-10-25**, after Phase 4B-2A: `main` is `8abf031` (PR #11 merge); Phase R1 is **COMPLETE**,
Phase 4B-1 and 4B-2A are `OFFLINE`, Phase 3B/4A remain `INTEGRATED`, and Phase 4B-2B is
**NOT STARTED**. 131 Node / 12 UI checks are offline evidence, not production write/apply
acceptance. No production configuration or runtime behavior change.
