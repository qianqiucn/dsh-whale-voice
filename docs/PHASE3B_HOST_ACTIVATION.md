# Phase 3B — Host Activation Plan (Read-only Review)

**Status:** `BLOCKED` pending explicit authorization for a Host reload or DSH restart.
**Phase 3A:** `OFFLINE` (34 behavior tests pass).
**No Host reload, DSH restart or production-service restart was performed.**

---

## 1. Current evidence

| Check | Result |
|---|---|
| Git branch | `feature/phase3-core-detect` |
| HEAD | `832fc24ab2133dfebcfe455112d26d804e2540c3` |
| PR #3 | Open |
| PR #4 | Open; base `feature/first-run-setup-wizard` |
| Current Host route | `GET /whale-voice/setup/health` → **404** |
| `dsh-whale-voice` package link | Junction → this workspace |
| Profile bundle list | includes `dsh-whale-voice` |
| Host row inventory | `include:dsh-whale-voice`, `enabled`, `fiberPhase=active` |
| Host Config entry | `status: absent` (plugin has no Config schema; not itself a route error) |
| `webServer` service | active |
| `connection` service | active |
| Host module import | `host-import-ok`; exports `apply` |
| Host load error in available hub log | not found |
| DSH process start | 2026-10-23 22:56:32 |
| Current `index.js` mtime | 2026-10-24 04:55:33 |
| Current client bundle | rebuilt, 171720 bytes |
| Host loaded module version | **unknown** (live module instance not exposed through Inspector) |
| Source HEAD | `832fc24ab2133dfebcfe455112d26d804e2540c3` |

The running process predates the current Host source. This is strong evidence for a stale Host
row, but **not a complete proof of the final root cause**: the live Host module instance cannot be
read directly through the available Inspector API. The 404 proves the route is not registered;
it does not by itself prove whether the cause is stale code, an apply failure or a registration
failure.

## 2. What is already ruled out

- The workspace/profile link target is correct.
- The package is listed in the profile bundles and its Host row is active.
- `package.json` exports `./index.js`; the bundle patch path is present.
- The Host module parses and exports `apply` outside DSH.
- `webServer` and `connection` services are active.
- No Host load error was found in the available hub log.
- A 404 here is **not** an authentication rejection (401/403) and not evidence that the token
  check failed; it means no matching named route answered.

## 3. What remains unknown

- Which exact Host module instance the running DSH process holds.
- Whether a host-plugin reload is supported as a one-click/plugin-manager operation, or whether the
  only reliable path is a DSH process restart.
- Whether `hmr.reconcileProfile()` can be invoked through a supported administrative surface without
  restarting the whole process.
- Whether the page currently has an injected `window.__WHALE_SETUP__` at all (the UI remains
  No-Core; route 404 is consistent with injection being absent, but not proof of the injection
  state).

## 4. Reload options

### Option A — targeted Host/plugin reload (preferred if supported)

Use the DSH plugin manager to **disable and re-enable only `dsh-whale-voice`**, or use the Host HMR
`reconcileProfile(['include:dsh-whale-voice'])` path through a trusted DSH administrative action.

- Scope: one Host row and its linked workspace code.
- Expected effect: stop/restart that row; route/bridge should be registered from the current
  `index.js`.
- Likely DSH session impact: brief plugin unload/reload; other plugins should remain.
- WeChatAgent, Voice Sender, Qwen: **not started, stopped or modified by this plan**.
- Config writes: none.
- Rollback: re-enable the same row or reload again; the previous code remains in Git.
- Caveat: the exact single-plugin reload affordance has **not been verified** in this DSH build.
  Do not assume a page refresh performs it.

### Option B — DSH process restart (fallback, broader impact)

Close and relaunch DSH using its supported exit/launch path.

- Scope: whole DSH Host process and all Host rows/client session.
- Likely impact: current DSH UI session and remote session reconnect; in-flight DSH operations may
  be interrupted.
- WeChatAgent, Voice Sender and Qwen are separate processes and are not intentionally restarted.
- Config writes: none planned.
- Rollback: normal DSH restart; no repository/data deletion.
- Must not use uninstrumented process termination.

### Option C — client/page refresh (not sufficient)

Refreshes client assets only. It cannot install a new Host row or register a Host route. It is not an
acceptable fix for the 404.

## 5. Candidate commands / APIs (do not execute without authorization)

The DSH Host exposes an HMR service with:

```text
hmr.reconcileProfile(requiredIds?: string[]): Promise<ProfileReconciliation>
```

This is a Host service API, not a shell command. Its documented behavior is to recompose the profile
and replace running plugins whose loaded files changed. The Whale Voice Host entry is
`include:dsh-whale-voice`. This is the closest targeted reload primitive found; it is **not exposed
to this Agent as an invocation tool**, and invoking it needs a trusted DSH administrative path.

The Plugin Manager inventory exposes the Host entry:

```text
entryId: include:dsh-whale-voice
moduleName: dsh-whale-voice
fiberPhase: active
```

A supported Plugin Manager disable/enable of only this entry is the least invasive UI-level
candidate. Whether a particular DSH build implements that as a code reload or only a state toggle
must be verified during the authorized window.

The fallback is a normal DSH application **Quit/Exit** and relaunch. Do not use Task Manager,
`Stop-Process`, `taskkill`, or any uninstrumented termination.

## 6. Authorization gates

Before executing either option, require explicit user approval for:

1. The exact operation (single Host reload or DSH restart).
2. Expected DSH session interruption and consent to it.
3. Confirmation that WeChatAgent, Voice Sender, Qwen and WeChat must remain untouched.
4. Confirmation of no production config writes and the rollback path.

## 7. Post-reload acceptance (only after authorization)

1. `/whale-voice/setup/health` responds according to route/auth state.
2. `/whale-voice/setup/status` returns the Core status schema.
3. Unauthenticated request is rejected (401/403), not silently accepted.
4. A legitimate same-origin DSH request reaches Core.
5. Missing connection fails closed (503).
6. Connection rejection/replacement/dispose behavior is rechecked.
7. `window.__WHALE_SETUP__` is injected by the Host, not defined by the client.
8. The UI shows real component status, not Mock fallback.
9. No-Core, timeout, invalid response and stale scan behavior are rechecked in the real GUI.

Until all of the above are verified, Phase 3B remains `BLOCKED`, not `INTEGRATED`.
