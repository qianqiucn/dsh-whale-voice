# Phase 3B — Host Activation and GUI Integration

**Status:** Phase 3B is **INTEGRATED** (real DSH Host + trusted bridge + real GUI component data).
It is **not VERIFIED**: Sender is offline, WeChatAgent health is `auth_required`, TTS is not configured,
and live No-Core/timeout/stale GUI tests were not performed.
**Phase 3A:** `OFFLINE` (34 behavior tests pass).
**No Host reload, DSH restart or production-service restart was performed by this task.**

The user performed the normal DSH restart. The current process started at 2026-10-24 05:36:38 and
loaded the current Host row; the Agent re-discovered the new port and did not reuse the old PID/port.

---

## 1. Current evidence

| Check | Result |
|---|---|
| Git branch | `feature/phase3-core-detect` |
| Source HEAD at inspection | `2b4c6eb9db6305b68e7e795a4a45db7450d15c18` |
| PR #3 | Open |
| PR #4 | Open; base `feature/first-run-setup-wizard` |
| DSH process start | 2026-10-24 05:36:38 (normal user restart) |
| Current DSH GUI | `http://127.0.0.1:53832` |
| `GET /whale-voice/setup/health` (no token) | **401** (route exists; auth required) |
| `GET /whale-voice/setup/status` (no token) | **401** (route exists; auth required) |
| `window.__WHALE_SETUP__` actual use | proven by real wizard data: WeChatAgent 0.3.9, 3 runtime PIDs, health 401, Sender 0.1.0 offline |
| Core config | `%DSH_HOME%\whale-voice\core.json` (read by current Host) |
| UI setup banner | `首次设置还没有完成` (real Core, not No-Core) |
| Detection timestamp | `2026-10-24T03:40:45Z` shown in the real wizard |
| WeChatAgent | v0.3.9 installed; 3 runtime PIDs; `/WeChatAgent/health` → 401 |
| Voice Sender | v0.1.0 installed; runtime PID 35592 gone; `/health` connection failed |
| Qwen | `/health` 200; model/voice valid; provider `configured:false` |
| Setup completed | **false** |
| `voiceEnabled` / recovery | **unknown** |

The earlier 404 is resolved. The 401 responses are **normal authentication rejection**, not a missing
route. The real wizard uses the trusted Host bridge and displays the actual Core data; the overview
page remains explicitly marked `演示数据`/`Mock`, and no Mock value is presented as a detection result.

Observed real component state:

- WeChatAgent 0.3.9 installed; process running; compatibility `compatible`; health 401 →
  `auth_required`; account/connection unknown or failed, never healthy.
- Voice Sender 0.1.0 installed; **not running**; health endpoint unreachable; `healthy:null`;
  `recoveryPending:null`.
- Qwen health valid; model `Qwen3-TTS-12Hz-1.7B-Base`; voice `whale-v1`; provider not configured;
  preview not generated.
- Finish page remains incomplete and explicitly says installation success is not WeChat voice enablement.

## 2. What is verified

- Current Host route exists (401 instead of 404).
- Unauthenticated requests are rejected.
- The trusted bridge is actually used by the page.
- Core reads the minimal read-only config and reports actual components.
- WeChatAgent 401 is shown as authentication required, not healthy.
- Sender offline is shown as offline; it was not started or repaired.
- Qwen service health is separated from Provider configuration.
- Unknown recovery/voice fields remain unknown; completion stays false.
- No Mock is presented as a real setup result.
- No production service, allow-list, audio device, voice or chat setting was modified.

## 3. Explicitly retained exceptions

- Live GUI No-Core, Core timeout, invalid schema and stale-scan behavior were not exercised because
  that would require breaking/restoring the live Host connection; they remain covered by automated
  behavior tests only (`OFFLINE`, not GUI-verified).
- Sender is offline in the live environment; its 401 health state was not observed because no
  service is listening. The UI correctly displays the offline/connection-failed state.
- TTS audio preview was not generated; Provider configuration remains false.
- WeChatAgent is not connected; its account verification/connection remain unknown or failed.

## 4. Historical note

The earlier 404 was observed while the running DSH process held the old empty Host row. The user
subsequently performed a normal DSH restart; the current process (05:36:38) registered the Host
routes. The Agent did not perform that restart or any Host reload.

The earlier Plan A investigation found no verified supported single-plugin reload; it did not execute
an unsupported toggle or a full restart.

## 5. Current result and next stage

Phase 3B is `INTEGRATED`:

- Current DSH Host loaded the current plugin and registered the routes.
- Unauthenticated requests return 401.
- The trusted bridge reads Core.
- Core read `%DSH_HOME%\whale-voice\core.json`.
- The real wizard shows actual WeChatAgent/Sender/Qwen status and detection timestamp/source.
- The finish page remains incomplete; unknown recovery/voice fields stay unknown.
- No Mock is presented as a real setup result.
- No production service, allow-list, audio device, voice or chat setting was modified.

The following are explicitly not `VERIFIED` in the live GUI:
No-Core, Core timeout, invalid-schema and stale-scan behavior. They remain covered by `OFFLINE`
behavior tests only.

Phase 4A is not started. It requires a separate task instruction; this report stops after accepting
Phase 3B.

### Current post-reload checks

- `GET /whale-voice/setup/health` without token → **401** (route exists; auth required).
- `GET /whale-voice/setup/status` without token → **401** (route exists; auth required).
- Real wizard: WeChatAgent `0.3.9`, health `401` → `auth_required`; Sender `0.1.0`, offline;
  Qwen health valid, provider not configured.
- Detection timestamp/source shown: `2026-10-24T03:40:45Z`.
- Setup completion: **false**; `voiceEnabled`/recovery: **unknown**.
