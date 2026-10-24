# Project Status

**Project:** Whale Voice / `dsh-whale-voice`
**Version:** 0.1.0
**Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
**Updated:** 2026-10-25
**Current stage:** P0/P9 baseline complete; P7 Phase 2 UI complete; Phase 3A `OFFLINE`; Phase 3B `INTEGRATED`; **Phase 4A read-only config `INTEGRATED`** (real Host + bridge + six-page GUI readout), not `VERIFIED`; `发送与安全` frontend is `MOCK`/disabled with **real DSH GUI visual acceptance PASS**; native voice research is `RESEARCH_CANDIDATE` (WeChatAgent native `UNSUPPORTED`); Phase 4A-H safety contracts fixed; **PR #3–#8 integrated into `main` with merge commits**; **Phase 4B-1 isolated config write is `OFFLINE`** (single-file store + test-only API; no production route); docs encoding repaired; 98 Node + 12 UI checks green; Phase 4B-2 not started
**Latest associated commit:** see current `feature/phase4b-isolated-config-write` HEAD; `main` integration baseline is `16c858b`; pre-integration backup tag `pre-pr3-8-integration` points to `b552ac0`
**Latest PR:** [#7 — docs: DSH Electron inspector feasibility](https://github.com/qianqiucn/dsh-whale-voice/pull/7) — **merged as the final documentation integration**
**Phase 4B-1 branch:** `feature/phase4b-isolated-config-write` — isolated config store, schema, tests and docs; PR opened for review, not merged.
**Integrated PRs:** #3 → #4 → #5 → #6 → #8 → #7, all merged with merge commits; #7 resolved the `CHANGELOG.md` / `README.md` / `PROJECT_STATUS.md` union without reverting #8 state.

---

## Current scope

This repository contains the **DSH frontend plugin, a read-only Core detector and the Phase 4B-1
isolated config store**. It does not contain:

- Voice Sender Windows service (or its installer);
- WeChatAgent, WeChat Hook/Bridge;
- Qwen3-TTS runtime or `whale-v1` reference audio;
- a production configuration write/apply service;
- real voice task database, logs, device snapshots or chat history.

The existing production voice chain is external and must not be changed by documentation or
frontend work in this repository.

## WeChatAgent platform baseline

**WeChatAgent is the required WeChat platform dependency** for message access, contact/group
context, account/session identity, DSH bridging and the existing send capability. Whale Voice must
not be described as an independent WeChat bot.

| Component | Baseline | Verification |
|---|---|---|
| Whale Voice | 0.1.0 | this repository |
| WeChatAgent | 0.3.9 | verified locally from `app/resources/project/package.json` |
| WeChatAgent upstream latest observed | 0.4.0 | GitHub README, not installed/verified here |
| DSH plugin SDK | 0.2.0-rc.2 | supplied development baseline |
| DSH shell observed | 0.2.1-rc.2 | local executable version; formal SDK compatibility not re-tested |
| Windows WeChat | 4.1.10.27 | verified local client path |
| Voice Sender | 0.1.0 | external local prototype; not in this repository |
| WeChatAgent Adapter | read-only detection only | install/event/identity/send adapter remains planned |

The existing private voice pipeline (outside this repository) previously completed a native voice
bubble in the configured private chat; that evidence does not constitute an Adapter test or a
reproducible repository integration. See
[WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

The current UI is **Mock by default** and can display real read-only Core results when the host bridge
is active. A demo or a successful detection is not installation completion. Phase 3B/4A activation was
previously completed after a normal DSH restart; this documentation-repair task performed no DSH
reload or restart. A running DSH will only pick up new Host code after a separately authorized reload.

## Completed

- [x] Seven-page native DSH client plugin: Overview, Voice Settings, Access, Voice Studio,
      Emotions, Activity, Advanced.
- [x] Dark/light visual system, glass surfaces, responsive layouts and outer frame polish.
- [x] Mock provider for services, permissions, tasks, diagnostics and settings.
- [x] Original `icon.svg` and localized plugin metadata.
- [x] Rebuild pipeline (`build.mjs` → `client.js`) and source syntax checks.
- [x] Live DSH slot verification and visual validation in large/medium/narrow windows.
- [x] Privacy sanitization of demo data (real target names/IDs replaced by fictional placeholders).
- [x] Repository documentation baseline: README, Roadmap P0–P9, Architecture, Agent rules,
      Changelog, License and .gitignore.
- [x] Local screenshot evidence reviewed and intentionally excluded from Git.
- [x] First private-repository commit and `main` push completed.
- [x] WeChatAgent dependency documentation merged to `main` via PR #1.
- [x] P7 Phase 2 frontend: first-run four-step wizard and component-management entry point.
- [x] Explicit no-Core and demo states; no fabricated completion/online state.
- [x] P7 Phase 3: minimal read-only Core, token-protected host bridge, real component detection.
      Phase 3A remains `OFFLINE`; Phase 3B later integrated live.
- [x] P7 Phase 3 live integration: user restarted DSH; routes return 401; no Host reload was used.
- [x] Contract tests for no-Core, missing/partial components, 401, timeout, stale results, auth and
      demo isolation; 52 behavior tests pass; local read-only smoke recorded in
      `docs/PHASE3_READONLY.md`.
- [x] Phase 3B read-only Host activation review and minimal-reload options documented in
      [PHASE3B_HOST_ACTIVATION.md](PHASE3B_HOST_ACTIVATION.md); no reload/restart performed by Agent.
- [x] Phase 3B real GUI acceptance: Core read `%DSH_HOME%\whale-voice\core.json`, WeChatAgent
      0.3.9/auth_required, Sender 0.1.0 offline, Qwen health valid, recovery/voice unknown,
      completion false. Status `INTEGRATED`, not `VERIFIED`.
- [x] Phase 4A read-only config snapshot: voice, TTS, permissions counts, sender config, saved/active
      separation, source inventory and sanitized revision; config and sources endpoints added.
- [x] Phase 4A real frontend readout in overview/settings/permissions/studio/advanced and component
      manager; Bridge/Worker layers separated; Mock remains labelled; no write controls enabled.
- [x] Phase 4A live GUI acceptance after normal DSH restart: current Host, 401-protected config
      routes, real `window.__WHALE_SETUP__` readout, component manager, and refresh all verified.
      Status `INTEGRATED`; live No-Core/timeout/invalid-schema/stale remain `OFFLINE` tests.
- [x] Development-only UI inspector: interactive `@playwright/cli` `0.1.22`; automation uses pinned
      `playwright@1.64.1` under `tests/ui`, isolated harness with fake bridge, 12/12 checks, CI `ui`
      job, Console/request/layout/narrow/dialog checks; see `docs/UI_TESTING.md`. This does not attach
      to the production DSH Electron window or use production data.
- [x] DSH Electron Inspector feasibility: native Inspector is slot/service metadata only; no supported
      DOM/accessibility/CSS/Console/CDP API. Level 2 remains `BLOCKED`; Option C recommended. No debug
      port, production profile attachment or production page read. See
      [DSH_ELECTRON_INSPECTOR_FEASIBILITY.md](DSH_ELECTRON_INSPECTOR_FEASIBILITY.md).
- [x] Voice delivery backend research: WeChatAgent 0.3.9 and public 0.4.0 adapters have text/sticker
      only; WeChatAgent native voice is `UNSUPPORTED`. UI Automation remains the supported backend.
      Third-party native APIs (WeChatPYAPI, PadChat-SDK) are **RESEARCH_CANDIDATE** only; no install,
      send, DLL, Hook, version or production config change. See
      [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md) and
      [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md).
- [x] Send & Safety frontend: new independent page for emergency stop, window/focus and game mode;
      unsupported controls disabled; failure fallback moved to Settings; Qwen auto-start moved to
      Components; UI tests cover Core-unavailable, disabled states, moved settings and narrow layout.
- [x] Send & Safety real DSH GUI acceptance: actual renderer shows the new page; UIA confirms
      disabled shortcut, discovery, focus and game switches; no duplicate settings; visual/resize
      checks pass. Console/CSS DOM remains unreadable without unsupported debugging. See
      [GUI_ACCEPTANCE_SEND_SAFETY.md](GUI_ACCEPTANCE_SEND_SAFETY.md).
- [x] Phase 4A-H pre-merge safety: full scheme/host/port Origin check shared by Host and Core,
      bounded streaming-only HTTP bodies, explicit-only `accountVerified`, and an opaque
      process-keyed full-config revision covering Worker/TTS/allowlist/source changes. 64 behavior
      tests and 12 UI checks pass; PR #4–#8 branches synchronized without force push.
- [x] AI memory and handoff: `docs/AI_CONTEXT.md` summary, `docs/DECISIONS.md` decision log, startup
      and stage-end rules in `AGENTS.md`; all memory docs are explicitly subordinate to code,
      Git/GitHub state, tests and the named authoritative documents.
- [x] Pre-merge documentation quality repair on PR #8: repaired four corrupted docs, normalized UTF-8,
      replaced the obsolete "remote repository is no longer empty" stop condition, refreshed stale
      memory/status facts, and added a lightweight Markdown encoding regression test. No runtime code
      change.
- [x] PR #3–#8 integration: merge commits for #3 (`7b66dca`), #4 (`91929fd`), #5 (`9688ff8`),
      #6 (`95a3528`), #8 (`5c4bc56`), and the final #7 documentation merge; main CI build+ui green;
      65 Node tests and 12 UI checks on the final tree. No runtime code or production change in the
      documentation union.
- [x] Phase 4B-1 isolated config write infrastructure: `core/config-sandbox.mjs`,
      `core/config-schema.mjs`, `core/config-store.mjs` and a test-only `core/isolated-write-server.mjs`;
      trusted sandbox capability, strict v1 schema, pure v0→v1 migration, HMAC revision,
      `expectedRevision` conflicts, single-file atomic save/verify/rollback, sanitized public
      projection, read/write state separation and 33 behavior tests. No production write route or
      production configuration change.
- [x] GitHub CI baseline passed on the initial commit: build, syntax checks and generated-client
      sync.

## In progress

- [ ] Phase 4B-2: controlled production write/apply API, multi-file transaction/journal, cross-process
      locking/CAS and runtime effect confirmation (not started; requires a separate authorization).
- [ ] Keep the post-integration `main` as the clean development baseline; new work must branch from it.
- [ ] P1: module boundaries, provider/sender protocol and fake-only contract tests.
- [ ] Establish PR-first feature workflow for all non-trivial changes.
- [ ] Decide whether additional CI coverage is useful beyond build/syntax/sync.

## Pending

- [ ] P1: module boundaries and unified protocol.
- [ ] P2: Core configuration, permissions and task state.
- [ ] P3: versioned Voice Sender component contract.
- [ ] P4: required `packages/adapter-wechatagent` contract, version/connection checks and
      missing-WeChatAgent UI state.
- [ ] P5: real frontend connection replacing Mock data.
- [ ] P6: explicit cloud TTS provider and GPU-free mode.
- [ ] P7: installation wizard backend, real detection, install/update/repair/rollback and clean-machine
      acceptance.
- [ ] P8: verified group identity, emergency stop and WeChat auto-location integration.
- [ ] Native Voice Delivery Research: continue source/license/API review; no prototype until all gates pass and owner authorizes.
- [ ] P9: meaningful expanded CI, release validation and any visibility decision.

## Current technical blockers

1. The real backend services are external and not represented by source in this repository.
2. The WeChatAgent Adapter currently provides read-only evidence only; event/identity/send contracts
   remain unimplemented.
3. A production Core write/apply API does not exist; Phase 4B-1 provides only an isolated single-file
   store. Installation, upgrade, repair, credential operations and production configuration writes
   remain blocked.
4. A token-protected WeChatAgent/Sender health endpoint cannot be verified without reading their
   tokens; those states are deliberately `auth_required`/unknown.
5. No automated browser/DOM test harness exists yet; Core and static UI contract tests exist.
6. Real WeChat UI/window tests require separate explicit authorization.
7. Group identity cannot be proven from display name alone, so group voice is not enabled.
8. Phase 3B is live: routes return 401, Core reads the authorized config, and the real GUI shows
   WeChatAgent `auth_required`, Sender offline, Qwen health valid. Sender is not running; it was not
   started. Live No-Core/timeout/invalid-schema/stale GUI tests were not performed and remain
   `OFFLINE` behavior tests; this is why Phase 3B is `INTEGRATED`, not `VERIFIED`.
9. Phase 4A is `INTEGRATED`: current Host (port 57393) serves the config routes, the trusted bridge
   reads real config, six GUI surfaces were inspected, Bridge/Worker layers are separate, and no
   write API exists. Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE`.

## Verification evidence

| Check | Result |
|---|---|
| `node build.mjs` | passed; regenerated `client.js` |
| `node --check client.js` | passed |
| `node --check client.template.js` | passed |
| `node --check pages.js` | passed |
| `node --check setup.js` | passed |
| `node --check build.mjs` | passed |
| DSH slot registration | verified earlier in the live runtime |
| Setup wizard UI smoke | live step 1–4 with real Core data; no-Core/timeout/stale remain automated only |
| Visual validation | large/medium/narrow, dark/light screenshots reviewed locally |
| `node --test` | 98 tests passed: 65 existing tests + 33 Phase 4B-1 config-store/API tests; original 65/65 remain passing |
| Markdown encoding check | passed: tracked Markdown is UTF-8 with no PUA, U+FFFD or known mojibake sequences; failures report `file:line` |
| Secret/privacy scan | passed: no tokens, keys, private chat IDs, contacts, audio or screenshots in tracked files/history |
| Config store schema | v1 strict validation, v0→v1 idempotent migration, unknown fields rejected, required safety fields have no defaults |
| Config store sandbox | trusted capability under OS temp; forged/ordinary/production/WeChatAgent/Sender roots rejected; marker/realpath checks; no target writes on rejection |
| Config store revision | HMAC-SHA-256 process key; 32-hex opaque revision; expectedRevision conflict returns `CONFIG_CONFLICT`; restart invalidates |
| Config store atomicity | temp+fsync+rename, post-save verification and rollback; Windows lock/replace failures preserved original; no multi-file transaction claim |
| Read/write state | read GET `UNCHANGED`; write `SAVED` + `PENDING_APPLY`; no-op `UNCHANGED`; `activeRevision:null`, `activeConfirmed:false`, `activeState:UNKNOWN` |
| Isolated write API | test-only loopback server; token+Origin, JSON, 64 KiB body cap, 2 s timeout, one active write, sanitized response; not imported by production Host |
| Real read-only detection | WeChatAgent 0.3.9 auth_required; Sender 0.1.0 connection_failed/processRunning=false/healthy=null; Qwen 200 provider saved/configured=true, preview=false; completed=false; voiceEnabled=unknown |
| Config snapshot | Bridge voice false; Worker safety permit true (separate layers, not MISMATCH); TTS qwen-local/whale-v1 saved; permissions 2 private/1 group, details false; sender config 0.1.0 offline; active revision null |
| WeChatAgent Adapter | read-only evidence implemented; event/identity adapter remains planned |
| Missing-WeChatAgent state | wizard/UI implemented; live Host bridge active and Core config loaded |
| Core setup API | read-only status/detect/config routes are live (401 without token); Phase 4B-1 adds an isolated test-only write store/API; no production write/apply route |
| Phase 4B-1 isolated write | `OFFLINE`; trusted sandbox capability, strict v1 schema, v0 migration, HMAC revision, expectedRevision conflict, single-file atomic save/rollback, read/write state separation; no WeChatAgent/Sender/Qwen/core.json write |
| Live DSH host bridge | current port 57393; Host routes 401; trusted bridge injects; six GUI surfaces show real config |
| Phase 4A config read | `INTEGRATED`; 64 tests/build pass; Bridge/Worker semantic warning gone; component manager and refresh verified |
| Real GUI exceptions | live No-Core/timeout/invalid-schema/stale not injected; remain `OFFLINE` |
| `npm.cmd run test:ui` | 12/12 isolated Playwright checks: real-config readout, navigation including Send & Safety, wizard, No-Core/invalid/timeout, dialogs, glass/rounded, 780px, Console/requests |
| GitHub Actions `ui` job | installs locked `playwright@1.64.1` + Chromium, runs the harness and fails on any check error |
| UI harness artifacts | `tests/ui/.artifacts/` (gitignored); screenshots and report.json |
| DSH Electron Inspector | native Inspector is slot/service metadata only; no DOM/a11y/CSS/Console/CDP; Level 2 `BLOCKED`; no debug port or production page read |
| Voice delivery backends | UI Automation `SUPPORTED`; WeChatAgent 0.3.9/0.4.0 native voice `UNSUPPORTED`; third-party native `RESEARCH_CANDIDATE`; no prototype |
| Send & Safety UI | `MOCK`/disabled safety controls; moved game mode, failure fallback and Qwen auto-start; 12/12 isolated UI checks |
| Native voice research | WeChatPYAPI (SILK/bool, 4.1.12.26) and PadChat-SDK (SILK/msgId, separate iPad service) reviewed; both fail current-version/license/coexistence gates; no send |
| Send & Safety real DSH GUI | PASS visual/UIA read-only: new nav/page loaded, disabled shortcut/window/game controls, no duplicate settings; Console/CSS DOM unreadable without CDP |
| Phase 3B activation | `INTEGRATED` live; not `VERIFIED` because live No-Core/timeout/stale GUI tests remain `OFFLINE` |
| Real installation / upgrade / rollback | not performed |
| GitHub CI (initial commit) | passed: build, syntax checks, generated-client sync |
| PR #1 WeChatAgent docs | merged to `main`; CI passed |
| PR #3–#8 integration | merged with merge commits; `main` contains all six heads; main CI build+ui SUCCESS |
| PR #3 setup wizard | merged; merge commit `7b66dca`; CI passed |
| PR #4 read-only Core | merged; merge commit `91929fd`; shared Origin guard, bounded HTTP and explicit account verification |
| PR #5 Phase 4A config | merged; merge commit `9688ff8`; full-config HMAC revision |
| PR #6 UI inspector | merged; merge commit `95a3528`; isolated UI harness + CI `ui` job |
| PR #7 Electron feasibility | merged as the final documentation integration; Inspector research + docs union |
| PR #8 Send & Safety / delivery research | merged; merge commit `5c4bc56`; 65 tests + 12 UI checks |
| Real WeChat send in this repository | not performed and not part of this repository |

## Next highest-priority task

**Next: Phase 4B-2 — controlled production write/apply** (not started; requires a separate
authorization). It must build on the isolated store with a production Host write route, multi-file
transaction/journal and partial-success recovery, cross-process locking/CAS or a single-writer
boundary, and trusted runtime-effect confirmation. Do not write production configuration, restart
services or send real messages before that authorization. Voice Sender's final independent safety
verification remains mandatory before real sending.

## Update rule

This file must be updated whenever a verified development task is completed. Status labels must be
specific; never mark a feature "working" based only on a Mock screen or an unexecuted plan.
