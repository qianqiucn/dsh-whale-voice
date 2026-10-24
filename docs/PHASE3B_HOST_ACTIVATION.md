# Phase 3B — Host Activation and GUI Integration

**Status:** Host route and trusted bridge are **INTEGRATED at transport level**; full Phase 3B is
`BLOCKED` because Core has no configured component roots and live No-Core/timeout/stale tests remain
unverified.
**Phase 3A:** `OFFLINE` (34 behavior tests pass).
**No Host reload, DSH restart or production-service restart was performed by this task.**

The DSH process was observed to have been restarted externally at 2026-10-24 05:19:43. That new
process loaded the current Host row; no restart was performed by the Agent.

---

## 1. Current evidence

| Check | Result |
|---|---|
| Git branch | `feature/phase3-core-detect` |
| Source HEAD at inspection | `5bea5c96f8286f5c9ac73e5190d122960065930d` |
| PR #3 | Open |
| PR #4 | Open; base `feature/first-run-setup-wizard` |
| DSH process start | 2026-10-24 05:19:43 (external restart; not by Agent) |
| Current DSH GUI | `http://127.0.0.1:55389` |
| `GET /whale-voice/setup/health` (no token) | **401** (route exists; auth required) |
| `GET /whale-voice/setup/status` (no token) | **401** (route exists; auth required) |
| `window.__WHALE_SETUP__` actual use | proven by real UI Core row `0.1.0 / 已连接` and real setup banner |
| UI banner | `首次设置还没有完成` (not No-Core) |
| Component manager | Core `0.1.0 / 已连接`; WeChatAgent/Sender/TTS `未配置` |
| Core component roots | not configured; `%DSH_HOME%\whale-voice\core.json` absent |
| `dsh-whale-voice` package link | Junction → this workspace |
| Profile bundle / Host row | present / active |
| `webServer` + `connection` | active |
| Host module import | `host-import-ok`; exports `apply` |
| Host load error | not found in available hub log |

The earlier 404 is resolved. The 401 responses are **normal authentication rejection**, not a missing
route. The UI uses the trusted Host bridge and displays real Core data, not a Mock fallback.

The observed Core status is:

- Core: connected, v0.1.0.
- WeChatAgent: not configured (no detection root supplied).
- Voice Sender: not configured.
- TTS: `qwen-local` known only as a provider label; not configured.
- Setup completed: false.

This is a truthful real status. It is not the final component acceptance because the Core must be
given explicit read-only roots before installed/auth_required/unknown component states can be shown
in the GUI.

## 2. What is already verified

- Real Host route exists (401 instead of 404).
- Unauthenticated requests are rejected.
- The trusted bridge is actually used by the page (real Core version/status).
- No Mock fallback is shown as real.
- The route requires the plugin token; no authentication was weakened.
- No production service was restarted or modified by the Agent.

## 3. What remains blocked

- Core has no explicit read-only roots. A Core config file would be a production config write and
  was not created without authorization.
- Consequently the GUI shows `未配置`, not the actual installed WeChatAgent/Sender states.
- Live No-Core, Core timeout, abnormal response and stale-scan behavior are covered by behavior tests
  but not exercised against the live Host because doing so would require stopping/breaking the Host
  or removing the bridge.
- The safe next step needs either an authorized read-only Core config plus a Host reload/restart, or
  explicit authorization to configure roots in another supported way.

## 4. Historical note

The earlier 404 was observed while the running DSH process held the old empty Host row. That process
was subsequently restarted externally at 05:19:43; the new process registered the Host routes. The
Agent did not perform that restart or any Host reload.

The earlier Plan A investigation found no verified supported single-plugin reload; it did not execute
an unsupported toggle or a full restart.

## 5. Remaining blocker and next authorization

The transport-level bridge is now integrated, but full Phase 3B acceptance is still blocked:

- Core has no explicit read-only component roots.
- The GUI truthfully shows `未配置` for WeChatAgent/Sender/TTS.
- To show installed/auth_required states, an authorized read-only Core configuration is required.
- Creating `%DSH_HOME%\whale-voice\core.json` would be a new configuration write and was not
  performed under the current authorization.
- After adding read-only roots, a Host reload or DSH quit/relaunch would be needed for the Host
  detector to read them, because no verified single-plugin reload is available.
- Live No-Core, timeout, abnormal-response and stale-scan GUI tests also require a controlled way to
  break/restore the bridge without touching WeChatAgent, Sender or Qwen.

### Proposed next minimal steps (awaiting authorization)

1. Authorize a read-only Whale Voice Core config containing only the component roots and Qwen URL.
2. Use the normal DSH Quit/Relaunch path (no forced process termination) so the Host reads it.
3. Reopen the GUI and verify installed/auth_required/unknown states, then run No-Core/timeout/stale
   tests with the approved test method.
4. Roll back by removing the read-only Core config and relaunching normally; no WeChatAgent, Sender,
   Qwen, WeChat, allow-list or voice switch is modified.

### Current post-reload checks

- `GET /whale-voice/setup/health` without token → **401** (route exists; auth required).
- `GET /whale-voice/setup/status` without token → **401** (route exists; auth required).
- Real GUI banner: `首次设置还没有完成`.
- Real component manager: Core `0.1.0 / 已连接`; WeChatAgent/Sender/TTS `未配置`.
- The page is using real Core data, not a Mock fallback.
- Full Phase 3B remains `BLOCKED`, not `INTEGRATED`.
