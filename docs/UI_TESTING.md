# UI Testing (development-only)

Whale Voice uses an **isolated Playwright browser harness** for frontend work. It is not part of the
end-user plugin and does not connect to the real DSH Electron window, Core, Sender, Qwen or WeChat.

## Toolchain

- Official CLI: `@playwright/cli` (installed globally during setup; verified `0.1.22`).
- Browser: isolated Playwright Chromium (downloaded under the user's Playwright cache, not this repo).
- Test-only React/ReactDOM: `tests/ui/package.json`; install with `npm.cmd run test:ui:setup`.
- Harness: `tests/ui/harness.html` + `tests/ui/harness.js`.
- Driver: `tests/ui/run.mjs` starts a loopback static server, launches headless Chromium, drives the
  actual generated `client.js`, and writes reports/screenshots to `tests/ui/.artifacts/`.

## Commands

Windows PowerShell may block `npm.ps1`; use `npm.cmd`:

```powershell
cd <repo-root>
npm.cmd run test:ui:setup   # once, creates tests/ui/node_modules (gitignored)
npm.cmd run test:ui         # builds client.js, runs browser checks
```

Other shells may use `npm run test:ui`. The root unit suite remains:

```powershell
node build.mjs
node --test
```

## What the UI harness checks

- Actual generated client bundle is loaded; no source-string assertions.
- Overview and primary navigation: voice settings, permissions, studio, advanced.
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

The current DSH desktop process has no supported, intentionally enabled CDP endpoint for this
harness. We do **not** open debugging on the production instance, remove Host authentication or
automate the real Electron window. Real DSH verification remains a separate, explicitly authorized
step; an isolated harness PASS is not an `INTEGRATED` real-host proof.

## When to use

Run `npm.cmd run test:ui` after any frontend source change and before committing. Use role or
accessible-name selectors; add stable `data-testid` only when a semantic selector is genuinely
unavailable and without changing the visual design.
