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
