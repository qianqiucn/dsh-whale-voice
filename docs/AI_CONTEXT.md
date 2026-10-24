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

- **main HEAD:** verify live with `git rev-parse origin/main`; the PR #3–#8 integration baseline is
  `16c858b`; `pre-pr3-8-integration` at `b552ac0` is the older backup tag.
- **Current development branch:** `feature/phase4b-isolated-config-write` (Phase 4B-1).
- **Current local HEAD:** verify live with `git rev-parse HEAD`; this memory does not pin the Phase
  4B-1 commit SHA.
- **Worktree:** clean
- **Remote:** `https://github.com/qianqiucn/dsh-whale-voice.git`

PRs #1/#2 and feature PRs #3–#8 are merged. Phase 4B-1 is a separate, unmerged branch; its isolated
write infrastructure is `OFFLINE` and has no production route.

---

## 3. Merged PR chain

```text
main
  └─ #3 first-run setup wizard
       └─ #4 read-only Core / Host bridge
            └─ #5 Phase 4A config read
                 └─ #6 isolated Playwright UI inspector
                      ├─ #7 DSH Electron inspector feasibility (docs)
                      └─ #8 Send & Safety + delivery research
```

| PR | Merge commit | Result |
|---|---|---|
| #3 | `7b66dca` | merged; setup wizard |
| #4 | `91929fd` | merged; read-only Core / Host bridge |
| #5 | `9688ff8` | merged; Phase 4A config read |
| #6 | `95a3528` | merged; isolated UI harness + CI `ui` |
| #8 | `5c4bc56` | merged; Send & Safety + research + docs repair |
| #7 | final documentation merge | merged last; Inspector research + docs union |

All six PRs were merged with merge commits and retargeted to `main` in order. There were
**0 prior human reviews** at integration time; CI green is not approval.

Phase 4B-1 is on `feature/phase4b-isolated-config-write`: isolated single-file config store, schema,
migration, revision/conflict handling, atomic save/rollback and a test-only API. It is not merged and
has no production write route.

---

## 4. Completed stages and acceptance levels

| Area | Status |
|---|---|
| Phase 3B real DSH Host | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A read-only config | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A-H safety contract fixes | Merged in #4/#5/#8; 64 behavior tests pass |
| Isolated Playwright UI Inspector | Merged in #6/#7/#8; 12/12 UI checks |
| Send & Safety frontend | `MOCK` / disabled backend controls; real DSH GUI visual acceptance PASS |
| Native voice delivery | `RESEARCH_CANDIDATE`; WeChatAgent native = `UNSUPPORTED` |
| Phase 4B-1 isolated config write | **`OFFLINE`** — single-file store + test-only API; no production write |
| Phase 4B-2 production write/apply | **Not started** |

Real GUI evidence exists for the Send & Safety page; it does **not** mean the Windows safety backend
exists.

---

## 5. Current task

This task implemented Phase 4B-1 isolated configuration writes:

- opaque trusted sandbox capability under the OS temporary root; ordinary/forged/production paths rejected;
- strict v1 schema and pure v0→v1 migration;
- process-local HMAC revision and `expectedRevision` conflict detection;
- single-file temp+fsync+rename save with post-save verification/rollback;
- pure read returns `UNCHANGED`; successful write returns `SAVED`/`PENDING_APPLY`;
- sanitized public projection with `activeRevision:null` / `activeConfirmed:false` / `activeState:UNKNOWN`;
- test-only loopback write API, not registered on the production Host;
- 33 new behavior tests; 98 Node tests total.

No production configuration, service restart, DSH reload or real send was involved.

---

## 6. Unresolved issues

1. **0 prior human reviews** at integration time; CI green does not equal approval.
2. Phase 4B-2 production write/apply, multi-file transaction and cross-process CAS are not
   implemented.
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
- Isolated Playwright harness with fake setup bridge; no production DSH/WeChat connection.
- 98 Node tests (65 prior + 33 Phase 4B-1) and 12 UI checks pass on the Phase 4B-1 branch.

---

## 8. Mock / not implemented

Do not present these as working:

- global emergency-stop hotkey or listener;
- real task cancel/device recovery;
- WeChat window discovery, auto-focus or target identity validation;
- fullscreen/game detection and pause policy;
- automatic Qwen startup;
- native voice delivery (`wechatagent-native` or `third-party-native`);
- production configuration write/apply API (Phase 4B-1 has an isolated single-file store only);
- multi-file transaction/partial-success recovery and cross-process CAS;
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

Phase 4B-1 result:

```text
build: PASS, client.js 186092 bytes
node --test: 98/98 PASS (65 prior tests + 33 Phase 4B-1 store/API tests)
UI: 12/12 PASS
```

CI:

- PR #3–#8: each merged after its CI reached SUCCESS;
- `main` at `16c858b`: build + ui SUCCESS;
- Phase 4B-1 branch: CI to be verified after push; no merge in this task.

---

## 11. Next priority

1. Phase 4B-2: controlled production write/apply API, multi-file transaction/journal, cross-process
   locking/CAS and trusted runtime-effect confirmation. It requires a separate task and authorization;
   production writes still require separate authorization.
2. Keep Native Voice Delivery Research as a parallel `RESEARCH_CANDIDATE`; do not implement native
   send until all admission gates and owner authorization are met.
3. Start new development branches from the integrated `main`; do not reuse the merged stacked
   branches or the Phase 4B-1 branch as the baseline after it is reviewed.

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

**2026-10-25**, after Phase 4B-1 isolated config write: strict schema/migration, HMAC revision,
atomic single-file save/rollback, test-only API, 98 Node tests and 12 UI checks. No production
configuration or runtime behavior change.
