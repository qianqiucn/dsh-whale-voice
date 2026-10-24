# Phase 3 — Read-only Core and Detection

> **Historical phase record:** the status below describes the Phase 3 offline snapshot. The read-only
> Core was later integrated into the Host via PR #4; current status is in
> [PROJECT_STATUS.md](PROJECT_STATUS.md).

**Status:** read-only implementation and isolated tests pass; **OFFLINE**, not integrated into the
running DSH Host. Installation/write operations intentionally absent.
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
| Voice Sender health | `auth_required`, `healthReachable=true`, `healthy=null` | token was **not** read; no start/stop |
| Voice Sender recovery | `null` / unknown | no recovery script or device probe was run |
| Qwen local | reachable, model Qwen3-TTS-12Hz-1.7B-Base, voice `whale-v1` | `/health` = 200 |
| TTS preview | not run | no audio generation in this phase |
| Setup completion | **false** | installation/preview are not implemented |
| WeChat voice switch | **unknown** | not read or changed by detection |

The 401 responses are not treated as success. They are displayed as “需要授权”/unknown.

## 4. Automated test coverage

`node --test` covers 34 tests:

- Missing/partial components and 401 health.
- No-Core, timeout, invalid schema and rejected bridge behavior.
- Scan gate: an older request cannot become current.
- Sender installed/process/health-reachable/service-healthy separation using actual Core output.
- Null recovery/voice fields stay unknown; only explicit booleans become pass/fail.
- Qwen `ok:false`, unrelated service, missing model/voice, arrays and error objects are invalid.
- Full-request deadline, hanging body, streaming byte cap, redirect, non-JSON, 401/403/404.
- Host bridge missing connection → 503; connection rejection/replacement; dispose.
- Demo isolation, stale request guard, no-shell/no-write checks.

## 5. Unknown / unsupported

- Real Bridge/account/DSH connection state requires an authorized token or a stable read-only health
  interface; not available under the no-token rule.
- WeChat client runtime version is not independently verified (only config expectation).
- VB-CABLE, default capture device, audio recovery snapshot and Sender queue are not queried because
  the health endpoint requires authorization.
- Group identity, installation, update/repair, preview and real send remain out of scope.
- The host bridge source and fake-host test pass, but the **currently running DSH process** still
  returns 404 for `/whale-voice/setup/health`.
- `index.js` mtime is later than the running DSH process start time; the running process loaded the
  earlier empty Host row. A client/page refresh only reloads client assets and cannot install the new
  Host route. **Host-plugin reload or DSH process restart** is required; neither was performed.
- Status is therefore `OFFLINE`: implementation + isolated tests pass, real host/page integration is
  not verified. It is not `INTEGRATED`.

## 5.1 Host activation check

Read-only checks performed:

- workspace/profile link resolves to this repository (`dsh-whale-voice` junction);
- profile bundle list includes `dsh-whale-voice`;
- package exports and bundle patch resolve;
- Host row `dsh-whale-voice` is enabled/active in the plugin inventory;
- `host-import-ok` outside DSH (module parses and exports `apply`);
- `webServer` and `connection` services are active;
- no Host load error was found in the available hub log;
- running process start time predates the new `index.js`.

Minimal operation for real GUI bridge acceptance (not performed): reload the Host plugin or restart
DSH. This affects the running Host/session, not WeChatAgent, Voice Sender or WeChat. Rollback is a
normal reload of the same profile; no data/config write is planned. This requires separate user
authorization.

## 6. Safety

- No installer, download, driver change or shell command from the browser.
- HTTP routes are loopback-only, same-origin, token-protected and read-only.
- The isolated Core test server was closed after the smoke test.
- No production configuration, allow-list, audio device, history or token was modified.
