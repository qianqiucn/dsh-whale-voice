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

- **main HEAD:** verify live with `git rev-parse origin/main`; the pre-integration baseline is tag
  `pre-pr3-8-integration` at `b552ac0` (historical backup, not current).
- **Current development baseline:** `main` after PR #3–#8 integration.
- **Current local HEAD:** verify live with `git rev-parse HEAD`; this memory does not pin an
  integration SHA.
- **Worktree:** clean
- **Remote:** `https://github.com/qianqiucn/dsh-whale-voice.git`

PRs #1/#2 and feature PRs #3–#8 are merged. `main` now contains the Phase 3B/4A/UI/Safety work.

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
| Phase 4B | **Not started** |

Real GUI evidence exists for the Send & Safety page; it does **not** mean the Windows safety backend
exists.

---

## 5. Current task

This task completed the PR #3–#8 GitHub integration:

- merged #3 → #4 → #5 → #6 → #8 → #7 with merge commits and base retargeting;
- resolved the PR #7 documentation union in favour of #8's newer state;
- verified the final `main` with build, 65 Node tests and 12 UI checks.

No runtime code, production configuration, service restart or real send was involved.

---

## 6. Unresolved issues

1. **0 prior human reviews** at integration time; CI green does not equal approval.
2. Phase 4B configuration-write API is not implemented.
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
- Isolated Playwright harness with fake setup bridge; no production DSH/WeChat connection.
- 64 behavior tests and 12 UI checks pass on the current PR #8 branch.

---

## 8. Mock / not implemented

Do not present these as working:

- global emergency-stop hotkey or listener;
- real task cancel/device recovery;
- WeChat window discovery, auto-focus or target identity validation;
- fullscreen/game detection and pause policy;
- automatic Qwen startup;
- native voice delivery (`wechatagent-native` or `third-party-native`);
- actual configuration write API;
- actual TTS preview/cloud provider;
- real group voice;
- production installer/update/rollback.

---

## 9. Critical safety boundaries

- No production configuration writes without a separate explicit authorization.
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

Final integration result:

```text
build: PASS, client.js 186092 bytes
node --test: 65/65 PASS (64 existing behavior tests + 1 docs-integrity test)
UI: 12/12 PASS
```

CI:

- PR #3–#8: each merged after its CI reached SUCCESS;
- `main`: build + ui SUCCESS after every merge;
- final `main`: build + ui SUCCESS.

---

## 11. Next priority

1. Phase 4B-1: isolated configuration write infrastructure
   (schema, revision/optimistic concurrency, atomic save/recovery, saved-vs-effective, rollback,
   secrets scan, isolated tests). It requires a separate task and authorization; production write
   still needs separate authorization.
2. Keep Native Voice Delivery Research as a parallel `RESEARCH_CANDIDATE`; do not implement native
   send until all admission gates and owner authorization are met.
3. Start new development branches from the integrated `main`; do not reuse the merged stacked
   branches as the baseline.

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

**2026-10-25**, after merging PR #3–#8 into `main` with merge commits, resolving the PR #7
documentation union, and verifying the final tree with 65 Node tests and 12 UI checks. No runtime
code or production behavior change.
