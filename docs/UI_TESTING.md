# UI Testing (development-only)

Whale Voice uses an **isolated Playwright browser harness** for frontend work. It is not part of the
end-user plugin and does not connect to the real DSH Electron window, Core, Sender, Qwen or WeChat.

## Toolchain

- **Automation runtime:** pinned `playwright@1.64.1` in `tests/ui/package.json` and
  `tests/ui/package-lock.json`; installed under `tests/ui/node_modules` (gitignored).
- **Interactive tool:** `@playwright/cli` `0.1.22` may still be used by a developer, but
  `npm run test:ui` does **not** depend on a global CLI or a CLI-internal path.
- **Browser:** isolated Playwright Chromium matching the pinned package; installed by
  `test:ui:setup` into the user Playwright cache, not this repo.
- **Test-only React/ReactDOM:** `tests/ui/package.json`; no root runtime dependency.
- Harness: `tests/ui/harness.html` + `tests/ui/harness.js`.
- Driver: `tests/ui/run.mjs` starts a loopback static server, launches headless Chromium, drives the
  actual generated `client.js`, and writes reports/screenshots to `tests/ui/.artifacts/`.

## Commands

Windows PowerShell may block `npm.ps1`; use `npm.cmd`:

```powershell
cd <repo-root>
npm.cmd run test:ui:setup   # installs pinned test deps + matching Chromium
npm.cmd run test:ui         # builds client.js, runs 10 browser checks
```

Other shells may use `npm run test:ui`. The root unit suite remains:

```powershell
node build.mjs
node --test
```

`test:ui` fails with a clear setup message if `tests/ui/node_modules` is missing; it never falls back
to a globally installed CLI.

## Continuous integration

`.github/workflows/ci.yml` has a separate `ui` job that:

1. installs locked `tests/ui` dependencies;
2. installs the matching Chromium with `--with-deps`;
3. rebuilds `client.js`;
4. runs `node tests/ui/run.mjs`;
5. fails on any required check failure;
6. uploads only the fictional-fixture screenshots/report from `tests/ui/.artifacts/`.

The job does not connect to DSH, WeChatAgent, Voice Sender or Qwen and requires no production token.

## What the UI harness checks

- Actual generated client bundle is loaded; no source-string assertions.
- Overview and primary navigation: voice settings, permissions, studio, emotions, activity, advanced.
- 10 checks total; every check has a clear PASS/FAIL name.
- Real-config readout: Bridge saved value, Worker safety permit, Provider/voice/model, permission
  counts, Sender offline, saved/active separation.
- Component-manager dialog opens/closes and includes the read-only config panel.
- Setup wizard opens/closes with an unavailable/completed fixture.
- No-Core, invalid Schema and timeout fixtures degrade without Mock success.
- Rounded/glass structure (`border-radius`, `backdrop-filter`), no horizontal overflow, logo/SVG.
- Narrow 780px viewport.
- Console errors/page errors and failed local resource requests.
- Screenshots and `report.json` under `tests/ui/.artifacts/` (gitignored).

## Safety boundaries

The harness supplies a fake `window.__WHALE_SETUP__`. It:

- does not read production `core.json`, tokens, whitelist, chat data or logs;
- does not contact real Core/DSH/Sender/Qwen/WeChat;
- does not send messages, generate audio, change voice switches, start processes or write config;
- does not reuse a personal browser profile;
- serves only loopback local files and exits the server with the test.

Do not add real credentials, private target names or desktop screenshots to harness fixtures or
committed artifacts.

## Real DSH Electron limitation

The current DSH desktop process has no supported, intentionally enabled DOM/CDP endpoint for this
harness. Native `cordis_inspect` provides slot/registration metadata only. We do **not** open a debug
port on the production instance, remove Host authentication or automate the real Electron window.
Real DSH verification remains a separate, explicitly authorized step; an isolated harness PASS is not
an `INTEGRATED` real-host proof. See
[DSH_ELECTRON_INSPECTOR_FEASIBILITY.md](DSH_ELECTRON_INSPECTOR_FEASIBILITY.md).

## When to use

Run `npm.cmd run test:ui` after any frontend source change and before committing. Use role or
accessible-name selectors; add stable `data-testid` only when a semantic selector is genuinely
unavailable and without changing the visual design.
