# Project Status

**Project:** Whale Voice / `dsh-whale-voice`
**Version:** 0.1.0
**Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
**Updated:** 2026-10-24
**Current stage:** P0 baseline complete; P9 repository initialization in progress
**Latest associated commit:** `chore: initialize Whale Voice repository` (initial baseline)

---

## Current scope

This repository contains the **DSH frontend plugin and Mock UI** only. It does not contain:

- Voice Sender Windows service;
- WeChatAgent, WeChat Hook/Bridge;
- Qwen3-TTS runtime or `whale-v1` reference audio;
- real voice task database, logs, device snapshots or chat history.

The existing production voice chain is external and must not be changed by documentation or
frontend work in this repository.

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

## In progress

- [ ] First commit/push to the private GitHub repository.
- [ ] Confirm the remote `main` branch and default-branch behavior.
- [ ] Decide whether additional CI checks are useful beyond the current build/syntax checks.

## Pending

- [ ] P1: module boundaries and unified protocol.
- [ ] P2: Core configuration, permissions and task state.
- [ ] P3: versioned Voice Sender component contract.
- [ ] P4: WeChatAgent adapter contract.
- [ ] P5: real frontend connection replacing Mock data.
- [ ] P6: explicit cloud TTS provider and GPU-free mode.
- [ ] P7: installation wizard and one-click install.
- [ ] P8: verified group identity, emergency stop and WeChat auto-location integration.
- [ ] P9: meaningful CI, release validation and any visibility decision.

## Current technical blockers

1. The real backend services are external and not represented by source in this repository.
2. No automated browser/DOM test harness exists yet; current checks are build + syntax only.
3. Real WeChat UI/window tests require separate explicit authorization.
4. Group identity cannot be proven from the current UI by display name alone, so group voice is not
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
| Real WeChat send in this repository | not performed and not part of this repository |

## Next highest-priority task

**P1: define the Core/provider/sender protocol and module boundaries**, with a written contract and
fake-only tests. Do not start with service control or real UI automation.

## Update rule

This file must be updated whenever a verified development task is completed. Status labels must be
specific; never mark a feature "working" based only on a Mock screen or an unexecuted plan.
