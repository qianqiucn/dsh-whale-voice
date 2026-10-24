# Project Status

**Project:** Whale Voice / `dsh-whale-voice`
**Version:** 0.1.0
**Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
**Updated:** 2026-10-24
**Current stage:** P0/P9 baseline complete; P7 Phase 2 UI complete; Phase 3 read-only **OFFLINE**; live host integration pending
**Latest associated commit:** `ba4bef55721145bc6b9b2a19975a17efb0da8d38` — `refactor: isolate wechatagent read-only adapter`
**Latest PR:** [#4 — feat: phase 3 read-only core and trusted bridge](https://github.com/qianqiucn/dsh-whale-voice/pull/4) — **open, depends on PR #3**
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
      Classified `OFFLINE`: isolated tests pass; live DSH Host integration is not verified.
- [ ] P7 Phase 3 live integration: Host route 404 until host reload/DSH restart; no restart performed.
- [x] Contract tests for no-Core, missing/partial components, 401, timeout, stale results, auth and
      demo isolation; local read-only smoke recorded in `docs/PHASE3_READONLY.md`.
- [x] GitHub CI baseline passed on the initial commit: build, syntax checks and generated-client
      sync.

## In progress

- [ ] Review PR #3 (first-run setup wizard frontend/Mock).
- [ ] Review dependent Phase 3 PR (read-only Core); merge after PR #3.
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
8. The running DSH process predates the new `index.js`; the Host route returns 404. Client/page refresh
   cannot load a new Host row. Host-plugin reload or DSH process restart requires separate
   authorization; neither was performed.

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
| Setup wizard UI smoke | no-Core state, demo step 1–4, component-manager entry reviewed in live DSH |
| Visual validation | large/medium/narrow, dark/light screenshots reviewed locally |
| `node --test` | 28 tests passed: sender contract, tri-state unknown, Qwen negatives, HTTP body/timeouts, host lifecycle, demo, stale |
| Real read-only detection | WeChatAgent 0.3.9 auth_required; Sender 0.1.0 auth_required/healthReachable=true/healthy=null; Qwen 200; completed=false; voiceEnabled=unknown |
| WeChatAgent Adapter | read-only evidence implemented; event/identity adapter remains planned |
| Missing-WeChatAgent state | wizard/UI implemented; real detection requires host reload |
| Core setup API | read-only host route implemented; write/installer API absent |
| Live DSH host bridge | source + fake-host test pass; actual DSH returns 404 because the Host process predates the new `index.js` |
| Real installation / upgrade / rollback | not performed |
| GitHub CI (initial commit) | passed: build, syntax checks, generated-client sync |
| PR #1 WeChatAgent docs | merged to `main`; CI passed |
| PR #3 setup wizard | open; CI passed; not merged |
| PR #4 read-only Core | open; CI passed; depends on PR #3 |
| Real WeChat send in this repository | not performed and not part of this repository |

## Next highest-priority task

**Next: Core unified configuration management** — read, schema validation, version-conflict
detection, atomic save, explicit separation of "saved" vs "effective", and controlled writes only in
an isolated configuration. Production config writes require separate authorization. Host activation
(live bridge) remains a prerequisite for GUI integration and requires host reload/DSH restart
authorization. Do not start with an installer or a full event/identity Adapter. Voice Sender's final
independent safety verification remains mandatory before real sending.

## Update rule

This file must be updated whenever a verified development task is completed. Status labels must be
specific; never mark a feature "working" based only on a Mock screen or an unexecuted plan.
