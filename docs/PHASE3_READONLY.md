# Phase 3 — Read-only Core and Detection

**Status:** read-only detection implemented; installation/write operations intentionally absent.
**Branch:** `feature/phase3-core-detect` (depends on the first-run setup PR).
**Production mutation:** none. No service was started, stopped, restarted or installed.

---

## 1. What was implemented

- `core/detect.mjs`: bounded, read-only detectors for Voice Sender and local Qwen.
- `packages/adapter-wechatagent/index.mjs`: read-only WeChatAgent adapter (manifest/version,
  runtime PIDs, fixed health endpoint).
- `core/server.mjs`: isolated loopback Core test server with token/Origin/Host checks.
- `index.js`: DSH Host row with token-protected `/whale-voice/setup/*` routes and a
  `window.__WHALE_SETUP__` bridge injection.
- `core/config.example.json`: explicit root/URL configuration; no disk-wide scanning.
- `test/core.test.mjs`: HTTP, auth, missing/partial, timeout, 401 and stale-result tests.
- `test/setup-contract.test.mjs`: demo/isolation/no-shell and completion-guard tests.

The client calls only `getStatus()` and `detect(component)`; it cannot pass paths, URLs or commands.

## 2. Read scope

Only explicit configuration is used:

```text
%DSH_HOME%\whale-voice\core.json
  wechatAgentRoot, voiceSenderRoot, qwenUrl
```

or the corresponding environment variables. The detectors read:

- WeChatAgent: `app/resources/project/package.json` version; selected `hook.baseUrl` /
  `expectedVersion`; `state/runtime.json` PIDs; fixed `/WeChatAgent/health`.
- Voice Sender: `service/package.json`, selected port, `runtime/service.json` PID; fixed `/health`.
- Qwen: fixed `/health` only (model/voice metadata).

They do **not** read:

- Hook/audit token files;
- chat databases or chat content;
- target/whitelist files;
- logs containing messages;
- arbitrary paths or URLs from the browser.

Paths are reported only as installation locations; evidence strings contain fixed relative manifest
names, PID liveness and HTTP status, not secrets.

## 3. Local read-only result (2026-10-24)

This was run with an isolated in-process Core on an ephemeral loopback port; the listener was closed
after the request.

| Component | Result | Evidence |
|---|---|---|
| WeChatAgent | installed, v0.3.9, runtime PIDs alive, **not connected** | package + runtime + `/WeChatAgent/health` = 401 |
| WeChatAgent Bridge | `auth_required` | token was **not** read, so health could not be verified |
| WeChatAgent WeChat client | 4.1.10.27 from config | **config expectation, not verified** |
| Voice Sender | installed, v0.1.0, PID alive, health unknown | `/health` = 401 |
| Voice Sender health | `auth_required`, `healthy=null` | token was **not** read; no start/stop |
| Qwen local | reachable, model Qwen3-TTS-12Hz-1.7B-Base, voice `whale-v1` | `/health` = 200 |
| TTS preview | not run | no audio generation in this phase |
| Setup completion | **false** | installation/preview are not implemented |
| WeChat voice switch | **unknown** | not read or changed by detection |

The 401 responses are not treated as success. They are displayed as “需要授权”/unknown.

## 4. Automated test coverage

`node --test` covers 15 tests:

- No configured roots → fail closed, completed false.
- Empty roots → not installed, not online.
- 401 → `auth_required`, not connected/healthy.
- Version mismatch → incompatible/unknown.
- Timeout even for a fetch implementation that ignores abort.
- Qwen health metadata accepted, preview still false.
- Concurrent detection → old result marked `stale`.
- Core server: missing token 401, arbitrary component 400, POST 405, cross-site 403.
- Host bridge: injected token-protected route and denial without token.
- Setup UI: no shell/fetch execution, demo cannot be authoritative, stale guard, safety copy.

## 5. Unknown / unsupported

- Real Bridge/account/DSH connection state requires an authorized token or a stable read-only health
  interface; not available under the no-token rule.
- WeChat client runtime version is not independently verified (only config expectation).
- VB-CABLE, default capture device, audio recovery snapshot and Sender queue are not queried because
  the health endpoint requires authorization.
- Group identity, installation, update/repair, preview and real send remain out of scope.
- The host bridge source and fake-host test pass, but the **currently running DSH process** still
  returns 404 for `/whale-voice/setup/health` until a DSH/page reload loads the new Host row. No DSH
  restart was performed.

## 6. Safety

- No installer, download, driver change or shell command from the browser.
- HTTP routes are loopback-only, same-origin, token-protected and read-only.
- The isolated Core test server was closed after the smoke test.
- No production configuration, allow-list, audio device, history or token was modified.
