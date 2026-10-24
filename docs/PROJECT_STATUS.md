# Project Status

**Project:** Whale Voice / `dsh-whale-voice`
**Version:** 0.1.0
**Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
**Updated:** 2026-10-24
**Current stage:** P0 baseline complete; P9 private repository and CI baseline complete
**Latest associated commit:** `a054613e10dfef4638976cefd5ea67ba412f4154` — `docs: document WeChatAgent dependency and compatibility`
**Latest PR:** [#1 — docs: establish WeChatAgent required dependency](https://github.com/qianqiucn/dsh-whale-voice/pull/1)

---

## Current scope

This repository contains the **DSH frontend plugin and Mock UI** only. It does not contain:

- Voice Sender Windows service;
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
| WeChatAgent Adapter | not implemented | `packages/adapter-wechatagent` is planned |

The existing private voice pipeline (outside this repository) previously completed a native voice
bubble in the configured private chat; that evidence does not constitute an Adapter test or a
reproducible repository integration. See
[WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

The current UI is **Mock only**. Its demo WeChatAgent status is not a real connection check and must
not be treated as an online status. The required missing/incompatible state and version checks are
not implemented yet.

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
- [x] GitHub CI baseline passed on the initial commit: build, syntax checks and generated-client
      sync.

## In progress

- [ ] Review/merge PR #1 (WeChatAgent dependency documentation).
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
- [ ] P7: installation wizard and one-click install.
- [ ] P8: verified group identity, emergency stop and WeChat auto-location integration.
- [ ] P9: meaningful expanded CI, release validation and any visibility decision.

## Current technical blockers

1. The real backend services are external and not represented by source in this repository.
2. The WeChatAgent Adapter is not implemented; the frontend cannot detect a missing installation or
   prove a real Bridge/version connection.
3. No automated browser/DOM test harness exists yet; current checks are build + syntax only.
4. Real WeChat UI/window tests require separate explicit authorization.
5. Group identity cannot be proven from the current UI by display name alone, so group voice is not
   enabled.

## Verification evidence

| Check | Result |
|---|---|
| `node build.mjs` | passed; regenerated `client.js` |
| `node --check client.js` | passed |
| `node --check client.template.js` | passed |
| `node --check pages.js` | passed |
| `node --check build.mjs` | passed |
| DSH slot registration | verified earlier in the live runtime |
| Visual validation | large/medium/narrow, dark/light screenshots reviewed locally |
| Automated test suite | none in this repository yet |
| WeChatAgent Adapter | not implemented; documented dependency only |
| Missing-WeChatAgent UI state | documented requirement; not implemented |
| GitHub CI (initial commit) | passed: build, syntax checks, generated-client sync |
| Real WeChat send in this repository | not performed and not part of this repository |

## Next highest-priority task

**P1: define the Core/provider/sender protocol and module boundaries**, with a written contract and
fake-only tests. Do not start with service control or real UI automation.

## Update rule

This file must be updated whenever a verified development task is completed. Status labels must be
specific; never mark a feature "working" based only on a Mock screen or an unexecuted plan.
