# Whale Voice Documentation Index

This index separates the **current authority** from **historical phase records**. Historical documents
are kept for evidence and decision history; they are not a statement of current implementation.

## Mandatory execution standard

- [EXECUTION_STANDARD.md](../EXECUTION_STANDARD.md) — **read first for every Git/GitHub task**, including PR review, writing plans, tracking ideas, and marking work complete.
- [AGENTS.md](../AGENTS.md) — agent startup rules enforce that preflight.

## Execution plans (new)

- [plans/README.md](plans/README.md) — **Whale Voice / Whale Relay execution plan registry**, ordered task dispatch, status markers and change rules.
- [plans/CHANGELOG.md](plans/CHANGELOG.md) — dated plan reordering and completion history.
- [plans/01-gui-coverage-closeout.md](plans/01-gui-coverage-closeout.md) — first task, already sent; subsequent plans are linked from the registry.

The plans are forward-looking, not proof that features are implemented. Read the current Git/PR and acceptance evidence first.

## Current authority and contracts

Read these first when resuming work:

1. [AGENTS.md](../AGENTS.md) — long-term development and safety rules.
2. [PROJECT_STATUS.md](PROJECT_STATUS.md) — living status, evidence and blockers.
3. [AI_CONTEXT.md](AI_CONTEXT.md) — compact recovery summary; never an authority over code or Git.
4. [ROADMAP.md](ROADMAP.md) — phase goals, dependencies and current gate.
5. [DECISIONS.md](DECISIONS.md) — accepted architecture decisions.
6. [ARCHITECTURE.md](ARCHITECTURE.md) — current and target boundaries.
7. [CONFIG_SOURCES.md](CONFIG_SOURCES.md) — authoritative/read-only config sources and precedence.
8. [CONFIG_WRITE_API.md](CONFIG_WRITE_API.md) — Phase 4B-1 isolated write contract, status `OFFLINE`.
9. [CONFIG_COORDINATION.md](CONFIG_COORDINATION.md) — Phase 4B-2A authority matrix, plan/journal and apply states, status `OFFLINE`.
10. [SETUP_API.md](SETUP_API.md) — read-only setup/status/detect/config contract.
11. [UI_TESTING.md](UI_TESTING.md) — isolated Playwright harness and commands.
12. [WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md) — required upstream compatibility.
13. [REPOSITORY_INVENTORY.md](REPOSITORY_INVENTORY.md) — historical initial-commit inventory; see the
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
- **Current tests:** `test/` (Node behavior/contract tests) and `tests/ui/` (isolated Playwright).
- **Generated artifact:** `client.js` is rebuilt from `client.template.js`, `pages.js`, `setup.js` and
  `client.css`; do not hand-edit it.
- **Excluded assets:** real WeChatAgent, Voice Sender, Qwen runtime, `whale-v1` audio, model caches,
  screenshots and runtime state are intentionally outside this repository.
