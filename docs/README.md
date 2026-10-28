# Whale Voice 文档导航

[返回项目首页](../README.md) · [开发与体验说明 / Development guide](DEVELOPMENT.md) · [展示素材来源](assets/README.md)

普通读者可以从项目首页查看界面、当前能力与开发方向。下面是面向开发和验收的接口、架构及历史材料。

This index separates the **current authority** from **historical phase records**. Historical documents
are kept for evidence and decision history; they are not a statement of current implementation.

## Current authority and contracts

Read these first when resuming work:

1. [AGENTS.md](../AGENTS.md) — long-term development and safety rules.
2. [PROJECT_STATUS.md](PROJECT_STATUS.md) — living status, evidence and blockers.
3. [AI_CONTEXT.md](AI_CONTEXT.md) — compact recovery summary; never an authority over code or Git.
4. [ROADMAP.md](ROADMAP.md) — phase goals, dependencies and current gate.
5. [DECISIONS.md](DECISIONS.md) — accepted architecture decisions.
6. [ARCHITECTURE.md](ARCHITECTURE.md) — current and target boundaries.
7. [CONFIG_SOURCES.md](CONFIG_SOURCES.md) — authoritative/read-only config sources and precedence.
8. [CAPABILITY_API.md](CAPABILITY_API.md) — Phase 4B-2B-2a capability/status projection (`INTEGRATED`, read-only).
9. [TTS_PROVIDER_AUDIT.md](TTS_PROVIDER_AUDIT.md) — TTS-A Qwen hardcode audit and Provider-neutral priorities.
10. [TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md) — Provider interface, registry, v2 config/migration and TTS-B/C plan (design only).
11. [CONFIG_WRITE_API.md](CONFIG_WRITE_API.md) — Phase 4B-1 isolated write contract, status `OFFLINE`.
12. [CONFIG_COORDINATION.md](CONFIG_COORDINATION.md) — Phase 4B-2A authority matrix, plan/journal and apply states, status `OFFLINE`.
13. [SETUP_API.md](SETUP_API.md) — read-only setup/status/detect/config contract.
14. [UI_TESTING.md](UI_TESTING.md) — isolated Playwright harness and commands.
15. [WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md) — required upstream compatibility.
16. [REPOSITORY_INVENTORY.md](REPOSITORY_INVENTORY.md) — historical initial-commit inventory; see the
    banner in that file.

Current code, tests, Git/GitHub state and named contracts take precedence over every summary.

## Historical and phase-specific records

These are retained as evidence. Their status lines describe the moment they were written:

- [PHASE3_READONLY.md](PHASE3_READONLY.md) — Phase 3 read-only detection snapshot.
- [PHASE3B_HOST_ACTIVATION.md](PHASE3B_HOST_ACTIVATION.md) — Phase 3B Host activation record.
- [SETUP_CAPABILITY_REVIEW.md](SETUP_CAPABILITY_REVIEW.md) — Phase 1 capability review.
- [GUI_ACCEPTANCE_SEND_SAFETY.md](GUI_ACCEPTANCE_SEND_SAFETY.md) — Send & Safety visual acceptance.
- [DSH_ELECTRON_INSPECTOR_FEASIBILITY.md](DSH_ELECTRON_INSPECTOR_FEASIBILITY.md) — Inspector research.
- [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md) — native voice candidates; none authorized.
- [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md) — backend research and boundaries.
- [SEND_SAFETY_API.md](SEND_SAFETY_API.md) — planned Send & Safety contract, not a production API.

## Taxonomies

- **Current implementation:** `core/`, `index.js`, `client.js`, `client.template.js`, `pages.js`,
  `setup.js`, `packages/adapter-wechatagent/`.
- **TTS-A design-only:** `core/tts/` pure Provider contract, candidate registry and v2 migration
  proposal; `core/svc/` separate SVC contract/registry (Seed-VC/RVC candidates). Not injected into
  `client.js`, not a Host route and not connected to any provider.
- **Current tests:** `test/` (Node behavior/contract tests) and `tests/ui/` (isolated Playwright).
- **Generated artifact:** `client.js` is rebuilt from `client.template.js`, `pages.js`, `setup.js` and
  `client.css`; do not hand-edit it.
- **Excluded assets:** real WeChatAgent, Voice Sender, Qwen runtime, `whale-v1` audio, model caches,
  private desktop screenshots and runtime state are intentionally outside this repository.
  Reviewed fictional UI previews are documented in [assets/README.md](assets/README.md).
