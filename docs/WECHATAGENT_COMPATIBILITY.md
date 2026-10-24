# WeChatAgent Compatibility

Whale Voice does not implement WeChat connectivity itself. All WeChat message, contact, session,
identity, authorization and platform-send capability depends on the independent upstream project:

**[sourcepro5/WeChatAgent](https://github.com/sourcepro5/WeChatAgent)** — MIT-licensed upstream
project with its own third-party terms.

The target integration is a dedicated `packages/adapter-wechatagent`. A **read-only adapter** is now
implemented (manifest/version, runtime PIDs and fixed health endpoint). Event subscription,
account/group identity and send-result feedback remain planned; installation and writes are absent.

---

## 1. Version matrix

| Component | Verified baseline | Status / evidence |
|---|---|---|
| Whale Voice `dsh-whale-voice` | **0.1.0** | repository `package.json` |
| WeChatAgent local runtime | **0.3.9** | local `app/resources/project/package.json` |
| WeChatAgent upstream latest observed | **0.4.0** | upstream README on 2026-10-24; **not installed or verified locally** |
| DSH plugin SDK baseline | **0.2.0-rc.2** | supplied development baseline |
| DSH desktop shell observed | **0.2.1-rc.2** | local executable version; plugin UI loads, but SDK-level compatibility was not re-tested |
| Windows WeChat client | **4.1.10.27** | verified local client path |
| Voice Sender service | **0.1.0** | separate local prototype; not in this repository |
| Whale Voice Adapter | **read-only** | `packages/adapter-wechatagent`; install/events/send pending |

The version matrix is a **development baseline**, not a promise that adjacent versions work. Do not
change a version number to bypass a compatibility check.

## 2. Responsibility boundary

WeChatAgent owns:

- WeChat client connection and message read/receive;
- contact/group context, account/session identity;
- DSH message bridge;
- existing chat authorization/scope controls;
- existing platform send capability.

Whale Voice owns:

- DSH frontend and Core;
- TTS provider/voice management;
- voice permissions and task coordination;
- Voice Sender lifecycle/diagnostics;
- adapter isolation and compatibility policy.

Voice Sender owns final Windows-side target location, identity re-check, UI Automation, VB-CABLE
routing, native recording/sending, emergency cancel and microphone restore.

Whale Voice must **not** add a second WeChat reader, account manager, session store or independent
bot to replace any of these upstream responsibilities.

## 3. Adapter contract (read-only implemented; writes/events planned)

`packages/adapter-wechatagent` isolates version-specific behavior. Current read-only subset:

- `detect()` — installed, version, data location, runtime PID liveness;
- `health()` — fixed `/WeChatAgent/health` evidence; 401 is `auth_required`, never green;
- `compatibility` — exact 0.3.9 baseline; other versions are unknown/incompatible.

Planned (not implemented): supported events, private/group identity, send capability,
`resolveTarget()`, `submitVoiceResult()` and write/config operations. No Core/UI component may import
a WeChat-specific file layout or hard-coded internal path. Any version-specific extension must be
pinned, documented and covered by a compatibility test.

## 4. Missing or incompatible WeChatAgent

The plugin must still open when WeChatAgent is absent. This is the required UX contract:

| Area | Behavior |
|---|---|
| Plugin shell/pages | available |
| TTS provider settings | available |
| Local/cloud preview | available, subject to provider credentials |
| WeChat voice enable | unavailable |
| WeChat status | must show missing/incompatible, **never fake online** |
| Install/check CTA | present |

Exact message:

> 尚未检测到 WeChatAgent。安装并连接 WeChatAgent 后，才能让 AI 在微信中发送语音消息。

Required actions:

1. Check installation status.
2. Open the official WeChatAgent GitHub.
3. Guide installation of a compatible version.
4. Check connection status.
5. View compatibility issues.
6. Install Voice Sender.

This state is implemented in the first-run wizard; the host route must be loaded by a Host-plugin
reload or DSH process restart before real detection appears. The demo row is not a connection probe.

## 5. Upstream compatibility procedure

Before claiming a new WeChatAgent version is supported:

1. Read the upstream release notes and license/third-party notes.
2. Check interface, event field, file-layout and send-behavior changes.
3. Assess Adapter impact; update this document.
4. Add/update fake contract tests.
5. Run authorized integration tests in a non-production environment.
6. Update the supported range only after evidence exists.

Never auto-upgrade a user's WeChatAgent. Never assume a new release is compatible. Never download or
execute a third-party installer without verified provenance, permission and integrity checks.

Check releases at:
https://github.com/sourcepro5/WeChatAgent/releases

## 6. Known issues / unsupported environments

- Only read-only Adapter detection exists; events/identity/send and writes remain unimplemented.
- Token-protected health endpoints are reported as `auth_required`; tokens are not read.
- The live DSH host route requires a Host-plugin reload or DSH process restart; the current process
  predates the new Host row and returns 404. Client/page refresh is insufficient. Status is `OFFLINE`.
- WeChatAgent versions other than 0.3.9 are untested here; upstream 0.4.0 is observed only.
- Windows WeChat versions other than 4.1.10.27 are untested.
- Non-Windows real WeChat operation is unsupported.
- Locked/secure desktop and Windows foreground restrictions are not bypassed.
- Group target identity cannot be proven from display name alone; group voice remains disabled.
- The existing local voice pipeline success is external evidence, not a reproducible repository
  integration or Adapter test.
- WeChatAgent's third-party Hook/WeChat client/SnowLuma-related terms are separate from its MIT
  license; Whale Voice does not redistribute those components.

## 7. License and upstream respect

- WeChatAgent is an independent project; Whale Voice does not claim authorship.
- WeChatAgent's own `LICENSE` and third-party compliance notes must be read and respected.
- Do not bundle WeChatAgent, WeChat Hook binaries, the WeChat client or restricted third-party
  components into this repository.
- Prefer stable upstream interfaces and upstream Pull Requests over permanent private patches.
- If a patch is unavoidable, keep it version-pinned and isolated inside the Adapter; document it
  here and do not spread it into Core.
