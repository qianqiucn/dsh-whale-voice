# AI Context — Whale Voice

**Purpose:** compact cross-session recovery note. This is a summary, not an authority. Re-verify
against the repository, Git/GitHub, tests and the linked authoritative documents before acting.

**Last updated:** 2026-10-24

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

- **main HEAD:** `b552ac00e7fc05a5818965d61ab90c5ec115efee`
- **Current development branch:** `feature/send-safety-page`
- **Current local HEAD:** `696378c62559667e5e9fba7ecc0177b1ad25ea6a`
- **Worktree:** clean
- **Remote:** `https://github.com/qianqiucn/dsh-whale-voice.git`

No PR has been merged. `main` remains the old docs baseline.

---

## 3. Open PRs and dependency chain

```text
main
  └─ #3 first-run setup wizard
       └─ #4 read-only Core / Host bridge
            └─ #5 Phase 4A config read
                 └─ #6 isolated Playwright UI inspector
                      ├─ #7 DSH Electron inspector feasibility (docs)
                      └─ #8 Send & Safety + delivery research
```

| PR | Base | Head | Head SHA | CI |
|---|---|---|---|---|
| #3 | main | `feature/first-run-setup-wizard` | `8dc05708` | build SUCCESS |
| #4 | #3 | `feature/phase3-core-detect` | `347acf31` | build SUCCESS |
| #5 | #4 | `feature/phase4a-config-read` | `a4475071` | build SUCCESS |
| #6 | #5 | `chore/ui-inspector-playwright` | `f576f61a` | build + ui SUCCESS |
| #7 | #6 | `docs/dsh-electron-inspector-feasibility` | `d7e89097` | build + ui SUCCESS |
| #8 | #6 | `feature/send-safety-page` | `696378c6` | build + ui SUCCESS |

All PRs are currently Open, `mergeable=clean`, with **0 reviews / 0 review comments**.
PR #7 and #8 are parallel; neither is an ancestor of the other.

---

## 4. Completed stages and acceptance levels

| Area | Status |
|---|---|
| Phase 3B real DSH Host | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A read-only config | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A-H safety contract fixes | Implemented and locally tested; awaiting review/merge |
| Isolated Playwright UI Inspector | Implemented; 12/12 UI checks on PR #8; CI passing |
| Send & Safety frontend | `MOCK` / disabled backend controls; real DSH GUI visual acceptance PASS |
| Native voice delivery | `RESEARCH_CANDIDATE`; WeChatAgent native = `UNSUPPORTED` |
| Phase 4B | **Not started** |

Real GUI evidence exists for the Send & Safety page; it does **not** mean the Windows safety backend
exists.

---

## 5. Current task

This task: add/maintain long-term AI memory:

- `docs/AI_CONTEXT.md` (this file)
- `docs/DECISIONS.md`
- startup/stage-end rules in `AGENTS.md`
- status/roadmap links

No production behavior change.

---

## 6. Unresolved issues

1. **PRs #3–#8 are unmerged**; main does not contain Phase 3B/4A/UI/Safety work.
2. **0 human reviews**; CI green does not equal approval.
3. Downstream PR bases are still stacked; they must be retargeted after each merge.
4. **PR #7 / #8 docs overlap** in `CHANGELOG.md`, `README.md`, `docs/PROJECT_STATUS.md`; final
   merge order should be #8 then #7 with manual doc union.
5. Phase 4B config-write API is not implemented.
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

Recent current-branch result:

```text
build: PASS, client.js 186092 bytes
node --test: 64/64 PASS
UI: 12/12 PASS
```

CI:

- PR #4: build SUCCESS
- PR #5: build SUCCESS
- PR #6: build + ui SUCCESS
- PR #7: build + ui SUCCESS
- PR #8: build + ui SUCCESS

---

## 11. Next priority

1. Human review and merge of #3 → #4 → #5 → #6 → #8 → #7 with base retargeting and manual doc
   conflict resolution.
2. Then Phase 4B-1: isolated configuration write infrastructure
   (schema, revision/optimistic concurrency, atomic save/recovery, saved-vs-effective, rollback,
   secrets scan, isolated tests). Production write still needs separate authorization.
3. Keep Native Voice Delivery Research as a parallel `RESEARCH_CANDIDATE`; do not implement native
   send until all admission gates and owner authorization are met.

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

**2026-10-24**, after Phase 4A-H fixes and PR #4–#8 synchronization.
