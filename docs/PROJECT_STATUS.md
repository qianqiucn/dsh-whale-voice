# Project Status

**Project:** Whale Voice / `dsh-whale-voice`
**Version:** 0.1.0
**Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
**Updated:** 2026-10-24
**Current stage:** P0/P9 baseline complete; P7 Phase 2 UI complete; Phase 3A `OFFLINE`; Phase 3B `INTEGRATED`; **Phase 4A read-only config `INTEGRATED`** (real Host + bridge + six-page GUI readout), not `VERIFIED`; `发送与安全` frontend is `MOCK`/disabled with **real DSH GUI visual acceptance PASS**; native voice research is `RESEARCH_CANDIDATE` (WeChatAgent native `UNSUPPORTED`); Phase 4B not started
**Latest associated commit:** `06ef6c192f994d6bf3f586a571d1f4498a42f0b4` — `docs: expand native voice delivery research`
**Latest PR:** [#8 — feat: unified send & safety page and delivery research](https://github.com/qianqiucn/dsh-whale-voice/pull/8) — **open, stacked on PR #6**
**PR #6:** [#6 — chore: isolated Playwright UI inspector](https://github.com/qianqiucn/dsh-whale-voice/pull/6) — **open, stacked on PR #5**
**PR #5:** [#5 — feat: phase 4A read-only unified config](https://github.com/qianqiucn/dsh-whale-voice/pull/5) — **open, stacked on PR #4**
**PR #4:** [#4 — read-only core and trusted bridge](https://github.com/qianqiucn/dsh-whale-voice/pull/4) — **open, depends on PR #3**
**PR #3:** [#3 — first-run setup wizard](https://github.com/qianqiucn/dsh-whale-voice/pull/3) — **open; merge first**

---

## Current scope

This repository contains the **DSH frontend plugin plus a minimal read-only Core detector**. It does
not contain:

- Voice Sender Windows service (or its installer);
- WeChatAgent, WeChat Hook/Bridge;
- Qwen3-TTS runtime or `whale-v1` reference audio;
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
is active. A demo or a successful detection is not installation completion. The live DSH process
must be reloaded to load the new Host row; no DSH restart was performed.

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
- [x] GitHub CI baseline passed on the initial commit: build, syntax checks and generated-client
      sync.

## In progress

- [ ] Review PR #3 (first-run setup wizard frontend/Mock).
- [ ] Review dependent Phase 3 PR (read-only Core); merge after PR #3.
- [ ] Phase 4B config write/schema/migration (not started; requires a separate authorization).
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
3. The Core write/installer API does not exist, so installation, upgrade, repair and credential
   operations remain blocked.
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
| `node --test` | 52 tests passed: config sources/safety, sender contract, tri-state unknown, Qwen negatives, HTTP body/timeouts, host lifecycle, status loader, demo, stale |
| Real read-only detection | WeChatAgent 0.3.9 auth_required; Sender 0.1.0 connection_failed/processRunning=false/healthy=null; Qwen 200 provider saved/configured=true, preview=false; completed=false; voiceEnabled=unknown |
| Config snapshot | Bridge voice false; Worker safety permit true (separate layers, not MISMATCH); TTS qwen-local/whale-v1 saved; permissions 2 private/1 group, details false; sender config 0.1.0 offline; active revision null |
| WeChatAgent Adapter | read-only evidence implemented; event/identity adapter remains planned |
| Missing-WeChatAgent state | wizard/UI implemented; live Host bridge active and Core config loaded |
| Core setup API | status/detect and config routes are live (401 without token); trusted bridge reads real config; write/installer API absent |
| Live DSH host bridge | current port 57393; Host routes 401; trusted bridge injects; six GUI surfaces show real config |
| Phase 4A config read | `INTEGRATED`; 52 tests/build pass; Bridge/Worker semantic warning gone; component manager and refresh verified |
| Real GUI exceptions | live No-Core/timeout/invalid-schema/stale not injected; remain `OFFLINE` |
| `npm.cmd run test:ui` | 12/12 isolated Playwright checks: real-config readout, navigation including Send & Safety, wizard, No-Core/invalid/timeout, dialogs, glass/rounded, 780px, Console/requests |
| GitHub Actions `ui` job | installs locked `playwright@1.64.1` + Chromium, runs the harness and fails on any check error |
| UI harness artifacts | `tests/ui/.artifacts/` (gitignored); screenshots and report.json |
| Voice delivery backends | UI Automation `SUPPORTED`; WeChatAgent 0.3.9/0.4.0 native voice `UNSUPPORTED`; third-party native `RESEARCH_CANDIDATE`; no prototype |
| Send & Safety UI | `MOCK`/disabled safety controls; moved game mode, failure fallback and Qwen auto-start; 12/12 isolated UI checks |
| Native voice research | WeChatPYAPI (SILK/bool, 4.1.12.26) and PadChat-SDK (SILK/msgId, separate iPad service) reviewed; both fail current-version/license/coexistence gates; no send |
| Send & Safety real DSH GUI | PASS visual/UIA read-only: new nav/page loaded, disabled shortcut/window/game controls, no duplicate settings; Console/CSS DOM unreadable without CDP |
| Phase 3B activation | `INTEGRATED` live; not `VERIFIED` because live No-Core/timeout/stale GUI tests remain `OFFLINE` |
| Real installation / upgrade / rollback | not performed |
| GitHub CI (initial commit) | passed: build, syntax checks, generated-client sync |
| PR #1 WeChatAgent docs | merged to `main`; CI passed |
| PR #3 setup wizard | open; CI passed; not merged |
| PR #4 read-only Core | open; CI passed; depends on PR #3 |
| PR #5 Phase 4A config | open; CI SUCCESS `40083281589`; stacked on PR #4; live Phase 4A `INTEGRATED`; not merged |
| PR #6 UI inspector | open; CI SUCCESS `40128127566` (build + ui jobs); stacked on PR #5; 10/10 isolated UI checks; not merged |
| PR #8 Send & Safety / delivery research | open; stacked on PR #6; 52 unit + 12 UI checks; docs only for native backend; not merged |
| Real WeChat send in this repository | not performed and not part of this repository |

## Next highest-priority task

**Next: Phase 4B — controlled configuration write/schema/migration** (not started). It requires a
separate task and production-write authorization; it must include schema versioning, conflict
handling, atomic save, saved-vs-effective distinction and rollback. Do not start with an installer
or a full event/identity Adapter. Voice Sender's final independent safety verification remains
mandatory before real sending.

## Update rule

This file must be updated whenever a verified development task is completed. Status labels must be
specific; never mark a feature "working" based only on a Mock screen or an unexecuted plan.
