# AGENTS.md — Whale Voice Long-Term Development Rules

This file is the operating contract for every coding agent working on Whale Voice. Read it before
changing code. **For EVERY Git/GitHub interaction or repository-status report, FIRST read
[EXECUTION_STANDARD.md](EXECUTION_STANDARD.md) and this file, before changing anything.**
When a user request conflicts with these rules, stop and ask for explicit permission;
do not silently weaken a safety boundary.

## 1. Startup workflow (every session)

1. **Mandatory Git preflight:** read [EXECUTION_STANDARD.md](EXECUTION_STANDARD.md), then this
   `AGENTS.md`. Do this at the start of every new repository task/session, including read-only
   PR reviews and follow-up conversations. If the standard is not on main yet, inspect its active
   plan branch and explicitly state that it is pending merge.
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
9. Select the highest-priority task that is safe to execute.
10. If the task requires real WeChat UI/window operations, real sending, driver changes, service
    restarts or production configuration changes, stop and obtain explicit authorization first.

## 1.0.1 Ordered execution-plan registry

Follow [EXECUTION_STANDARD.md](EXECUTION_STANDARD.md) as the first-read GitHub execution
checklist. Its steps govern one-plan-per-message dispatch, idea-driven reordering, evidence-based
DONE marking, independent PR merge tracking, safety and progress reporting.

Before proposing the next Whale Voice task, read [docs/plans/README.md](docs/plans/README.md)
and the linked plan file; reconcile it with current Git/PR/CI and code evidence. The registry is
a roadmap for work, not evidence of implementation or production authorization.

- Dispatch one plan per user request. Mark it `SENT` only after the plan has actually been shared.
- When the user proposes an idea, update the relevant plan(s), dependencies and ordered registry;
  record reorder reasons in [docs/plans/CHANGELOG.md](docs/plans/CHANGELOG.md).
- When a user provides a completion report, verify what is reasonably verifiable before marking
  a plan `DONE`; record evidence, and track PR `MERGED` separately from task completion and
  `INTEGRATED` separately from `VERIFIED`.
- Plan changes belong on an independent branch/PR by default. Do not assume authorization to
  merge, restart services, write production configuration or send WeChat messages.
- These updates occur only during an active, tool-equipped chat request; no autonomous background
  edits are implied. If repo access fails, say so rather than claiming a saved update.

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

## 10. What "continue the plan" means

When the user says **“继续 Whale Voice 开发计划”** (or equivalent), an agent should:

1. Read the current GitHub `main` state.
2. Read `AGENTS.md`, roadmap and project status.
3. Choose the next safe, highest-priority task.
4. Create a task branch.
5. Implement a minimal change.
6. Run the available checks.
7. Update status/roadmap/changelog.
8. Commit and push when authorized.
9. Open a PR when appropriate.
10. Report exact results and remaining risks.

There is no autonomous scheduler in this repository. Do not claim GitHub is developing itself or that
a roadmap automatically executes. The next cycle is triggered by the user's instruction.

## 11. Stop conditions

Stop and ask before proceeding if:

- the work requires a real WeChat UI action or real send;
- the remote history diverged unexpectedly, or a force-push/rewrite would be required;
- a secret or private datum is found in the staged content;
- the only way to pass is to remove a safety check;
- the task would modify a running production service;
- licensing or asset rights are unclear;
- the requested action would make the repository public or create a release.
