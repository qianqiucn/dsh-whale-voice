# Setup Capability Review — Phase 1

**Reviewed:** 2026-10-24
**Baseline:** `main` @ `b552ac00e7fc05a5818965d61ab90c5ec115efee`
**Task branch:** `feature/first-run-setup-wizard`

This is the Phase 1 review required by the first-run setup task. It records what actually exists in
this repository and what does not. It is not a claim that installation is implemented.

---

## 1. Current repository reality

| Area | Current reality | Classification |
|---|---|---|
| DSH frontend plugin | Seven-page client bundle, live in DSH | `MOCK` UI |
| Setup wizard UI | Four-step first-run flow added on this branch | `MOCK` / frontend only |
| Whale Voice Core | No Core source, host service or setup API in this repository | **missing** |
| WeChatAgent Adapter | Not implemented; docs only | **missing** |
| WeChatAgent | External local runtime 0.3.9; required platform dependency | external |
| Voice Sender | External separate Windows component 0.1.0; source not here | external |
| TTS providers | Mock display only; no real provider/credential API here | **missing** |
| Installer / download / verify / deploy | Not implemented | **missing** |
| Environment detection | Not implemented; no trusted detection API | **missing** |
| Setup task state machine | UI labels/contract only; no Core task persistence | **missing** |
| Secure credential storage | No Core credential API | **missing** |
| Automated browser tests | No harness | **missing** |

The repository is a **client plugin**, not a standalone Core or installer. `setup.js` renders the
wizard and reads an optional `window.__WHALE_SETUP__` bridge; it cannot inspect the OS, install
components or send WeChat messages by itself.

## 2. What the frontend can do now

- Open the wizard from the Overview banner and Advanced → 安装与组件.
- Show four steps: 连接微信助手 / 安装微信语音功能 / 选择声音 / 完成检查.
- Show missing-Core state instead of fabricated success.
- Show Demo mode explicitly; Demo never writes completion or claims real online state.
- Render WeChatAgent checks, Voice Sender checks, VB-CABLE and recovery checks.
- Show provider choices and a disabled credential/preview surface.
- Show the required missing-WeChatAgent message.
- Show installation plan and safe defaults.
- Block progression on real checks; allow demo preview only as a demo.

## 3. What it cannot do now

- Detect a real WeChatAgent installation/version/Bridge state.
- Detect a real Voice Sender installation/version/health.
- Detect or configure a real Qwen/cloud/custom TTS provider.
- Generate audio or call TTS.
- Download, verify, install, update, repair or uninstall Voice Sender.
- Install/confirm VB-CABLE or any driver.
- Persist authoritative setup completion; completion must come from Core.
- Start/stop components.
- Send a WeChat message or voice bubble.
- Authenticate a local Core API.

The current frontend correctly fails closed when Core is absent. Demo mode is a visual test only.

## 4. Missing interfaces before Phase 3+

1. **Core host bridge** exposing `window.__WHALE_SETUP__` or a loopback API with authentication.
2. **WeChatAgent Adapter** for discovery, version, Bridge health and target identity.
3. **Sender Manager / Installer** with signed/verified artifacts, plan, rollback and health checks.
4. **TTS Provider Manager** with credential storage, connection test and preview.
5. **Persistent setup task store** with task IDs, idempotency, cancellation and recovery.
6. **Diagnostics redaction** and audit logs.
7. **Authorized integration tests** on a clean Windows environment.

Until (1)–(5) exist, real installation must remain disabled. Adding shell commands to the frontend
would violate the architecture and safety rules.

## 5. Phase decisions

| Phase | Decision |
|---|---|
| Phase 1 — source/interface review | **complete** (this document) |
| Phase 2 — frontend wizard | **complete** as frontend/Mock only; see status |
| Phase 3 — read-only detection | **blocked** on Core/Adapter API |
| Phase 4 — Sender installer | **blocked** on Core Installer + packaging/signing |
| Phase 5 — TTS configuration/preview | **blocked** on Provider Manager/credentials |
| Phase 6 — clean-machine integration | **not started**; requires isolated environment and authorization |

The next safe implementation is the Core setup contract (P1/P2/P4), not a shell-based installer in
the browser.
