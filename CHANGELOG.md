# Changelog

All notable changes to Whale Voice are recorded here. The project is pre-release; this file does
not invent earlier releases or imply production maturity.

## [Unreleased]

### Added

- Private GitHub repository baseline and long-term agent workflow documentation.
- Initial `main` commit and CI baseline (build, syntax, generated-client sync).
- Roadmap P0–P9, project status, architecture, changelog and license.
- WeChatAgent required-dependency documentation, Adapter boundary, version matrix and
  missing-dependency UX contract.
- First-run setup wizard and component-management entry (frontend/Mock only).
- Setup capability review and Core Setup API contract; no real installer or detection.
- Read-only Core/host bridge with WeChatAgent, Voice Sender and Qwen detection.
- Token/Origin/loopback protection, timeouts, stale-result handling and contract tests.
- Sender installed/process/health-reachable/service-healthy contract and tri-state unknown handling.
- Strict Qwen health validation, bounded response bodies, redirect/body-limit handling.
- Host authentication lifecycle fail-closed, connection replacement and dispose tests.
- Phase 3B Host activation review: 404 evidence, reload options and authorization gates.
- Phase 3B integrated after normal DSH restart: routes 401, trusted bridge, Core config loaded, real GUI shows WeChatAgent auth_required, Sender offline, Qwen health valid.
- Phase 3B is `INTEGRATED`, not `VERIFIED`; live No-Core/timeout/invalid-schema/stale GUI tests remain `OFFLINE`.
- Phase 4A read-only config snapshot, source inventory, sanitized revision, config API and UI readout.
- Saved/active config separation, Bridge-vs-Worker layer separation, count-only permission exposure and 52 behavior tests.
- Phase 4A live DSH GUI integration: six surfaces, component manager, refresh and 401-protected config bridge verified; `INTEGRATED`, not `VERIFIED`.
- Development-only isolated Playwright UI harness (`@playwright/cli` 0.1.22 interactive; pinned `playwright@1.64.1` automation), test-only React, CI `ui` job, screenshots/report artifacts and `npm run test:ui`.
- Unified `发送与安全` page with emergency-stop, WeChat-window/focus and game-mode sections; unsupported controls disabled and not persisted.
- Moved TTS failure fallback to Settings and Qwen auto-start to Components; removed the duplicate game-mode toggle from Overview.
- Voice delivery backend research: WeChatAgent 0.3.9/0.4.0 native voice is `UNSUPPORTED` (text/sticker only); UI Automation remains supported; WeChatPYAPI and PadChat-SDK are documented `RESEARCH_CANDIDATE`s with version/license/coexistence caveats.
- Send & Safety capability/status API contract documented; no backend implementation or real system operation.
- Real DSH GUI visual acceptance for the Send & Safety MOCK page; disabled controls and migration verified with UIA/screenshots, with Console/CSS limits documented.
- Phase 4A-H safety contract fixes: full-origin validation, bounded streaming HTTP only, explicit-only account verification, and an opaque complete-config revision covering Worker/TTS/allowlists/source state.
- AI memory/handoff docs: `docs/AI_CONTEXT.md`, `docs/DECISIONS.md`, updated startup and stage-end rules in `AGENTS.md`; summaries remain subordinate to repository and test evidence.
- Pre-merge documentation repair: corrected four corrupted docs, removed an obsolete stop condition, refreshed AI memory/status, and added a Markdown encoding regression test; no runtime code change.
- DSH Electron Inspector feasibility assessment: no supported DOM/CDP access; Level 2 remains blocked with Option C recommended.
- PR #3–#8 integrated into `main` with merge commits, preserving the reviewed commit ancestry; PR #7 final documentation union does not revert PR #8 state.
- Phase 4B-1 isolated config store: trusted sandbox capability, strict v1 schema/migration, HMAC revision, `expectedRevision` conflicts, single-file atomic save/rollback, read/write state separation and a test-only loopback API; no production write route.
- Documentation-only WeChatAgent dependency/status updates.
- `.gitignore` and a real build/syntax CI workflow.
- Privacy sanitization of demo contacts/targets to fictional placeholders.

## [0.1.0] — 2026-10-24

### Added

- Native DSH client plugin `dsh-whale-voice`.
- Seven Mock views: Overview, Voice Settings, Access, Voice Studio, Emotions, Activity, Advanced.
- Dark/light glass visual system, responsive layout, custom whale glyph and SVG icon.
- Scoped plugin CSS, accessible controls, reduced-motion behavior.
- Build pipeline from `client.template.js`, `pages.js` and `client.css` to `client.js`.
- Local visual validation across large, medium and narrow windows.

### Notes

- This is a frontend + Mock baseline. It does not connect to a real voice backend, Qwen, Voice
  Sender or WeChatAgent, and it does not send WeChat messages.
- No earlier tagged releases are claimed. The repository history begins with this baseline.
