# AGENTS.md — Whale Voice Long-Term Development Rules

This file is the operating contract for every coding agent working on Whale Voice. Read it before
changing code. **Two AI collaborators have different responsibilities:** DeepSeek is the principal
implementation/coding agent; ChatGPT is the planning and GitHub plan-coordination collaborator.
The plan-dispatch, idea-reordering, and DONE-tagging workflow in
[EXECUTION_STANDARD.md](EXECUTION_STANDARD.md) applies to ChatGPT **only**, not DeepSeek.
General engineering quality, Git safety, security and authorization rules in this AGENTS.md
still apply to both. When a user request conflicts with these safety rules, stop and ask for
explicit permission; do not silently weaken a safety boundary.

## Permanent product rule: novice-first usability (2026-10-25)

The user explicitly requires that Whale Audio Core, Whale Voice (speech bubbles), Whale Singing (covers), and Whale Relay remain easy for **non-programmers who cannot code**. Read [docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md](docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md) when implementing any user-facing feature. This is a permanent project-level UX/acceptance requirement, not a request to start new work.

- A normal, already-supported user workflow must not require manually editing JSON/env files, using the command line, installing Python/pip/npm/Git, pasting code, or understanding ports/GPU internals. If a third-party or license constraint makes manual setup unavoidable, show an honest guided explanation and safe alternative; **never silently run untrusted installers**.
- Prefer simple Chinese labels, safe defaults, visual hardware/dependency checks, clear local/CPU/cloud choices, first-use dialogs per Voice/Singing, only the minimum selected dependencies, and reusable shared assets. Model installation, driver changes, network/paid APIs, config writes, and actual WeChat sends require separate explicit authorization.
- Every future implementation task should include an appropriate **Novice First DoD**: first-time workflow, clear progress, cancellation, accessible UI, no-GPU/offline states, understandable errors and recovery actions, plus explicit distinctions between Mock/OFFLINE/INTEGRATED/VERIFIED and SAVED/APPLIED/SENT_LOCAL/UNKNOWN.
- Do not mark real user-facing capability complete based only on green code/unit tests or demo UI. Keep the existing working UI and production voice chain intact; no auto merges, service restarts, or real sending without authorization.

## 1. Startup workflow (every session)

1. Read this `AGENTS.md` before implementing a task or changing repository code.
   **ChatGPT only**, when doing plan dispatch, task drafting or GitHub plan management: also read
   [EXECUTION_STANDARD.md](EXECUTION_STANDARD.md),
   [docs/plans/CHATGPT_LONG_TERM_MEMORY.md](docs/plans/CHATGPT_LONG_TERM_MEMORY.md),
   [docs/plans/TASK_SPEC_STANDARD.md](docs/plans/TASK_SPEC_STANDARD.md),
   the plan registry and the relevant plan file. When drafting or revising a task,
   use [docs/plans/TASK_SPEC_TEMPLATE.md](docs/plans/TASK_SPEC_TEMPLATE.md).
   DeepSeek is **not** required to perform this planning/memory preflight for ordinary engineering
   work; its Git/PR safety obligations remain governed by this file.
2. Read [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) as a recovery summary, not an authority.
3. Read [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).
4. Read [docs/ROADMAP.md](docs/ROADMAP.md); read [docs/DECISIONS.md](docs/DECISIONS.md) for accepted
   architecture decisions.
5. Check Git branch, staged/untracked changes and recent commits:
   ```powershell
   git status --short --branch
   git log --oneline -5
   ```
6. Check the current task's PRs, CI, reviews and whether required backend/runtime is actually
   available. Do not infer project progress from chat history alone.
7. Verify that `docs/AI_CONTEXT.md` is not stale relative to Git/HEAD/PRs/tests. Re-read the named
   authoritative docs when it disagrees.
8. State the current task boundary and whether explicit authorization is required.
9. **DeepSeek:** implement the currently user-assigned detailed technical task; do not independently
   select, reprioritize or dispatch the next plan. **ChatGPT:** choose/maintain plan order and
   dispatch a single execution-ready specification when the user requests it.
10. If the task requires real WeChat UI/window operations, real sending, driver changes, service
    restarts or production configuration changes, stop and obtain explicit authorization first.

## 1.0.0 ChatGPT new-chat handoff (planning role only)

For any **new ChatGPT conversation** that resumes Whale Voice planning, also read
[docs/plans/NEXT_CHATGPT_HANDOFF.md](docs/plans/NEXT_CHATGPT_HANDOFF.md) and
[docs/plans/NEXT_CHATGPT_ACTION_PLAN.md](docs/plans/NEXT_CHATGPT_ACTION_PLAN.md) on the
current authorized plan branch (if they are not merged into main).
Their current PR/CI information is a snapshot; verify the latest main and open PRs before
editing or marking tasks DONE. **This extra planning-handoff requirement does not apply to
DeepSeek's ordinary engineering tasks.** No handoff is permission to auto-merge, restart,
write production configuration or send WeChat messages.

## 1.0.1 Two-AI collaboration and role ownership

| Role | Responsible for | Not required to do |
|---|---|---|
| **DeepSeek (DSH development agent)** | Implement the user-approved technical task: engineering design within scope, code changes, tests, source PRs, implementation reports and technical handoffs; preserve all safety gates in AGENTS.md. | Independently dispatch the next plan, reorder the master plan, maintain plan `SENT`/`DONE` markers or obey ChatGPT-only plan administration procedures. |
| **ChatGPT (planning / GitHub coordination AI)** | Maintain [docs/plans/README.md](docs/plans/README.md), author/send one plan at a time, adjust ordering after user ideas, verify reported completion and mark `DONE` where justified, keep plan history and coordinate related GitHub documentation/PR reviews. | Execute production code tasks, restart services, merge PRs or alter production state without the user's separate authorization. |

**Instructions to DeepSeek:** Another AI (ChatGPT) is participating in this project.
ChatGPT handles the roadmap/plan documents and their GitHub tracking. Treat a plan supplied by
the user as the requested technical specification and carry out your authorized implementation
work; report results, relevant commits, PRs and CI normally. **Do not treat the plan-registry
maintenance instructions as an extra required part of your coding tasks.** You can still use Git,
commit/push code and create engineering PRs as authorized under §2; ChatGPT's responsibility for
plan tracking does not prohibit normal developer Git work. If documentation conflicts with
actual source, tests or GitHub state, flag the discrepancy rather than silently changing the
plan manager's records.

**Instructions to ChatGPT only:** For plan selection, new ideas, sequence changes, status
tagging or plan-document PRs, first read [EXECUTION_STANDARD.md](EXECUTION_STANDARD.md),
[docs/plans/CHATGPT_LONG_TERM_MEMORY.md](docs/plans/CHATGPT_LONG_TERM_MEMORY.md),
[docs/plans/TASK_SPEC_STANDARD.md](docs/plans/TASK_SPEC_STANDARD.md) and
[docs/plans/README.md](docs/plans/README.md). **The user requires near implementation-ready
task specifications: maximize concrete instructions and leave as few product/architecture choices as
possible for DeepSeek.** Expand roadmap entries using
[docs/plans/TASK_SPEC_TEMPLATE.md](docs/plans/TASK_SPEC_TEMPLATE.md), verify actual code and PRs
before specifying changes, and give a single recommended implementation path with explicit
input/output/error contracts, file lists, ordered steps, tests and acceptance. Dispatch one
requested plan per message; record new ideas and reordering in
[docs/plans/CHANGELOG.md](docs/plans/CHANGELOG.md), updating long-term memory when a durable
user preference changes. Mark `DONE` only with adequate evidence; track PR `MERGED`
separately from task completion. Do these updates in the active chat using GitHub tools,
never imply offline background editing.

Both agents must comply with safety/authorization boundaries; neither may treat a plan
description or a CI pass as permission for production writes, service restart, real WeChat
sending, Hook/DLL execution, or an unapproved PR merge.

## 1.1 WeChatAgent dependency rule (permanent)

Whale Voice's WeChat capability is built on the independent upstream project
[sourcepro5/WeChatAgent](https://github.com/sourcepro5/WeChatAgent). It is a **required platform
dependency**, not an optional plugin and not a TTS provider.

**任何影响 Whale Voice 微信消息、会话、身份、权限或语音发送的开发任务，都必须首先检查
WeChatAgent 兼容性及 Adapter 接口。不得假定 Whale Voice 可以脱离 WeChatAgent 独立完成微信接入。**

Required checks before any such task:

1. Read [docs/WECHATAGENT_COMPATIBILITY.md](docs/WECHATAGENT_COMPATIBILITY.md).
2. Inspect the planned/current `packages/adapter-wechatagent` contract and version table.
3. Determine the installed WeChatAgent version and the compatible Windows WeChat version.
4. Check connection/Bridge health and the documented failure state.
5. Verify target identity and authorization through the Adapter, never by display name alone.
6. If the dependency is absent, keep TTS/provider settings and preview available, disable WeChat
   voice, and show the installation message. Never fabricate an online WeChat state.
7. Prefer stable public interfaces. If a version-specific internal hook is unavoidable, isolate it
   in the Adapter, pin the exact version and document it; do not spread it into Core.
8. Prefer an upstream WeChatAgent PR over a permanent private patch/fork.

Do not reimplement a second WeChat reader, account manager, session database or bot in Whale Voice.
Do not automatically upgrade a user's WeChatAgent because upstream has a new release. Do not bundle
WeChatAgent/WeChat Hook binaries or restricted third-party components. Never download or execute a
third-party installer without confirmed provenance, permission and integrity checks.

## 1.2 Core detection rule

The current `core/detect.mjs` and Host bridge are **read-only**. They may read explicitly configured
roots, small manifests, process liveness and fixed loopback health endpoints. They must never run
shell commands, download/install components, write config, read Hook/audit token files, read chat
databases or accept paths/URLs/commands from the browser.

Do not label detection success as installation completion. Do not turn `auth_required`, timeout or
unknown into a green health state. A future write/installer API needs its own threat model, explicit
user confirmation and an isolated test environment.

## 1.3 UI testing rule (development-only)

The browser UI must be checked with the isolated Playwright harness before claiming a frontend change
works:

1. Build (`node build.mjs`).
2. Run unit/behavior tests (`node --test`).
3. Run the UI checks (`npm.cmd run test:ui` on Windows; `npm run test:ui` elsewhere).
4. Inspect Console/page errors, failed local requests, component/dialog behavior, and narrow layout.
5. Fix, rebuild, and repeat until the UI checks pass.

The harness uses a fake `window.__WHALE_SETUP__`, isolated Chromium and test-only React under
`tests/ui/`; it never connects to the real DSH Electron window, Core, Sender, Qwen, WeChat or
production tokens. Prefer role/accessible-name selectors or a stable `data-testid`; do not encode
absolute screen coordinates. Screenshots and reports belong in the gitignored
`tests/ui/.artifacts/`. Playwright is a developer tool, not an end-user dependency.

## 2. Branch and change workflow

Use a branch per task:

- `feature/core-config-manager`
- `feature/provider-registry`
- `fix/voice-sender-recovery`
- `docs/update-roadmap`
- `chore/...` for repository maintenance

Workflow:

```text
branch → minimal source change → tests/checks → secret/privacy check → commit
       → push → Pull Request → review/acceptance
```

`main` represents the reviewed baseline. Do not merge an unverified risky change directly into
`main`. Do not force-push or rewrite shared history.

## 3. Development and completion rules

- Preserve working functionality; prefer the smallest safe change.
- Never delete a safety check merely to make a test pass.
- Never rewrite the whole system when a focused fix is possible.
- Stop dangerous operations when tests fail.
- Do not hardcode a developer's machine path as a portable installation path; configuration belongs
  in a documented config surface.
- Keep frontend visuals consistent with the established design unless the task explicitly changes
  design.
- Do not add npm dependencies without a concrete need and review.
- Do not fabricate test results, release history, CI status or integration success.

### Status vocabulary

Use these labels consistently:

- `PLANNED` — written plan only.
- `IN PROGRESS` — actively being implemented.
- `MOCK` — UI/demo only; no production effect.
- `OFFLINE` — implemented and covered by offline/unit checks; no real integration proof.
- `INTEGRATED` — real integration verified in an authorized environment.
- `PRODUCTION READY` — integration, failure tests, recovery and owner acceptance complete.

A screenshot or Mock screen does not justify `INTEGRATED` or `PRODUCTION READY`.

## 4. Progress maintenance

After every verifiable development task:

1. Run build/tests, inspect the Diff and scan for secrets/private data.
2. Update [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) with evidence and the next task.
3. Update the relevant status in [docs/ROADMAP.md](docs/ROADMAP.md).
4. Update technical documentation if contracts/architecture changed.
5. Update [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
6. Update [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) with current HEAD/PR/status/testing facts, marking it
   as a summary rather than an authority.
7. Update [docs/DECISIONS.md](docs/DECISIONS.md) for a material architecture decision, with reason,
   status, date and references.
8. Commit the code and docs together with a clear message; update the PR and handoff summary.

Do not mark a stage complete merely because code exists. State the exact verification performed.

## 5. Testing expectations

Run what exists before claiming success:

```powershell
node build.mjs
node --check client.js
node --check client.template.js
node --check pages.js
node --check build.mjs
node --test
```

Rules:

- A build must regenerate `client.js` from source; do not hand-edit the generated file.
- Never add a fake test whose only purpose is a green CI badge.
- If no automated test covers a change, say so explicitly.
- Real WeChat/window tests require separate authorization and must be run with no-send or one-shot
  test-session safeguards unless the user authorizes otherwise.
- After any change to the plugin, verify the running DSH page is not broken if the environment is
  available; do not restart DSH/WeChatAgent/WeChat without authorization.

## 6. Safety boundaries

Without explicit, task-specific authorization, do **not**:

- send a real WeChat message or voice bubble;
- modify production voice allow-lists or target mappings;
- replay `FAILED` or `UNKNOWN` tasks;
- redeploy WeChat Hook or reinstall WeChat;
- restart DSH, WeChatAgent, WeChat or the Voice Sender service;
- overwrite or re-encode `whale-v1` reference audio;
- install/update Windows drivers or virtual audio devices;
- delete task history, state, logs or important data;
- publish a GitHub Release;
- make the repository public;
- merge unverified high-risk changes to `main`;
- upload tokens, credentials, private chat data, runtime state or screenshots.

Agents may proceed automatically with low-risk source and documentation work that is within the
current task. High-risk operations require an explicit user decision.

## 7. Privacy and secrets

Before staging or pushing:

- Never commit `.env`, tokens, API keys, passwords, private keys or credential files.
- Never commit real WeChat contacts, group IDs, chat text, session exports or screenshots of the
  desktop.
- Never commit Qwen caches, `whale-v1` reference audio, generated WAVs or voice history.
- Never commit `runtime/`, logs, device snapshots or production state.
- Demo data must use explicit fictional placeholders.
- Inspect the staged diff itself, not only `.gitignore`.
- If a secret is found, stop; do not push and do not try to "fix" it by rewriting history without
  authorization.

## 8. Repository and GitHub workflow

- Remote: `https://github.com/qianqiucn/dsh-whale-voice` (private).
- Default branch: `main`.
- Work on a branch; open a PR for non-trivial changes.
- Do not create additional remotes or repositories without permission.
- Do not force-push or delete remote history.
- Do not change visibility to public.
- Do not create releases without explicit approval.
- CI may only run checks that actually exist in this repository. If CI cannot validate a behavior,
  report that gap rather than hiding it.

## 9. Commit discipline

- One coherent purpose per commit.
- Summarize what changed and what was verified.
- Do not claim real integration in the message unless it was actually performed.
- Keep generated `client.js` in sync with source changes.
- Run `git diff --cached --check` and a secret scan before committing.
- Use an existing legitimate Git identity; do not invent an author email.

## 10. What "continue the plan" means — role-aware

For **ChatGPT**, “继续 Whale Voice 开发计划” (or equivalent) means: read
[EXECUTION_STANDARD.md](EXECUTION_STANDARD.md) and
[docs/plans/CHATGPT_LONG_TERM_MEMORY.md](docs/plans/CHATGPT_LONG_TERM_MEMORY.md),
check latest source/Git/CI, select the next task from the ordered registry, expand it to a
[Level 2 execution-ready specification](docs/plans/TASK_SPEC_STANDARD.md),
update the plan branch/PR and send **one** complete task to the user.

For **DeepSeek**, the same message does **not** authorize independently choosing or reordering
the roadmap. DeepSeek should implement the most recently explicitly assigned detailed technical
task, using this AGENTS.md safety/engineering process (branch → minimal code → tests → privacy
scan → PR → handoff). If no concrete execution task has been assigned, request the specific
task/specification rather than silently starting the next plan or rewriting the plan registry.

Both roles must preserve the explicit authorization boundaries in §6. There is no autonomous
scheduler; no GitHub tasks execute in the background without an active request.

## 11. Stop conditions

Stop and ask before proceeding if:

- the work requires a real WeChat UI action or real send;
- the remote history diverged unexpectedly, or a force-push/rewrite would be required;
- a secret or private datum is found in the staged content;
- the only way to pass is to remove a safety check;
- the task would modify a running production service;
- licensing or asset rights are unclear;
- the requested action would make the repository public or create a release.
