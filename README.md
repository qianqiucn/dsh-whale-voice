# Whale Voice · 小鲸鱼语音中心

Whale Voice is a native [DeepSeek Harness](https://github.com/deepseek-ai) client plugin for managing a
Qwen3-TTS / `whale-v1` / WeChat native-voice workflow in one place.

This repository currently contains the **Whale Voice frontend plugin and a minimal read-only Core
detector**. The working Windows voice pipeline (Voice Sender, WeChatAgent, WeChat UI automation,
VB-CABLE, the Qwen runtime and the private `whale-v1` reference audio) is a separate local system and
is **not included here**.

> **Current status: Phase 3B and Phase 4A are `INTEGRATED`; remaining UI statistics/demo content is Mock.**
> The UI does not write production voice configuration, does not install or start components, does
> not send WeChat messages, and does not generate audio in this phase. The live DSH Host bridge is
> not activated in the current process.

## WeChat platform dependency

**Whale Voice 是与 WeChatAgent 集成的 DSH 语音扩展项目。微信聊天语音功能依赖
[sourcepro5/WeChatAgent](https://github.com/sourcepro5/WeChatAgent)，Whale Voice 本身不提供独立微信消息接入能力。**

- **WeChatAgent is required** for WeChat message access, contact/group context, account/session
  identity, DSH message bridging, existing chat authorization and the platform's send capability.
- **Whale Voice does not reimplement a WeChat reader, account manager or bot.** It integrates
  through a dedicated `packages/adapter-wechatagent` Adapter (planned; not in this repository yet).
- **Voice Sender is a separately installed Windows component.** It owns window/chat location,
  final identity checks, UI Automation, VB-CABLE routing, native recording/sending, emergency stop
  and microphone recovery.
- **TTS providers are independent** of the WeChat platform. Local and explicitly selected cloud
  providers can be added without changing WeChatAgent.
- **Real WeChat voice may be enabled only after** environment compatibility, authorization,
  WeChatAgent connection, target identity and Voice Sender checks pass.

If WeChatAgent is missing, the plugin must still open and allow TTS provider settings and local or
cloud preview. WeChat voice must then show:

> 尚未检测到 WeChatAgent。安装并连接 WeChatAgent 后，才能让 AI 在微信中发送语音消息。

The UI must offer: check installation, open the official WeChatAgent repository, guide installation
of a compatible version, check connection, view compatibility issues, and install Voice Sender.
It must not enable WeChat voice or display a fake “online” WeChat state. Whale Voice never downloads
or executes a third-party installer without confirmed provenance, permission and integrity checks.

See [WeChatAgent compatibility](docs/WECHATAGENT_COMPATIBILITY.md) and
[Architecture](docs/ARCHITECTURE.md).

## What is implemented

- Native DSH client bundle (`dsh-whale-voice`) registered in the plugin sidebar and main slot.
- Seven views: Overview, Voice Settings, Access, Voice Studio, Emotions, Activity, Advanced.
- First-run setup wizard UI (four steps) and a component-management entry point.
- Explicit no-Core / demo state: the wizard never fabricates installation or online success.
- Minimal read-only Core (`core/`) and DSH host bridge (`index.js`) with token-protected loopback
  routes.
- Read-only detection for WeChatAgent installation/runtime/health evidence, Voice Sender
  installation/runtime/health evidence, and local Qwen health/model/voice.
- Dark and light appearance, glass surfaces, blue-purple accent system, responsive layouts.
- Mock services, permissions, activity history, diagnostics and demo settings.
- Accessible controls, keyboard focus states, reduced-motion handling, scoped CSS.
- Rebuildable client artifact committed for direct plugin loading.

## First-run setup (read-only phase)

`setup.js` adds the first-run flow and component manager:

```text
Overview / Advanced
  → 首次安装向导
      1. 连接微信助手
      2. 安装微信语音功能
      3. 选择小鲸鱼的声音
      4. 完成检查
```

The wizard reads the trusted `window.__WHALE_SETUP__` bridge injected by the host plugin. If the
bridge is absent, the UI shows “还需要连接 Whale Voice Core” and refuses to claim completion.
“查看演示流程” is an explicitly labelled demo and does not install, download or send anything.

This is **Phase 2 UI plus Phase 3 read-only detection and Phase 4A read-only config** (Phase 3B
`INTEGRATED`, Phase 4A `INTEGRATED` as of the port-57393 DSH runtime). The config snapshot reads saved
voice/TTS/permission/sender values, exposes only counts for private permission lists, keeps active
revision unknown, and never writes. Bridge user settings and Worker safety permits are shown as
separate layers. Live No-Core/timeout/invalid-schema/stale GUI tests remain `OFFLINE`, so Phase 3B
and 4A are `INTEGRATED`, not `VERIFIED`. Real installation, configuration writes and cleanup remain
disabled and require the write API in [docs/SETUP_API.md](docs/SETUP_API.md). Phase 1 findings are in
[docs/SETUP_CAPABILITY_REVIEW.md](docs/SETUP_CAPABILITY_REVIEW.md); read-only results, configuration
authority and the host activation check are in
[docs/PHASE3_READONLY.md](docs/PHASE3_READONLY.md),
[docs/PHASE3B_HOST_ACTIVATION.md](docs/PHASE3B_HOST_ACTIVATION.md) and
[docs/CONFIG_SOURCES.md](docs/CONFIG_SOURCES.md).

The UI has been validated in the DSH desktop runtime, including large, medium and narrow windows,
dark and light themes, and outer frame/corner behavior. Local screenshots are intentionally excluded
from this repository because they contain the developer's private desktop and chat list.

## What is not implemented

- Real write/install Core API and Voice Sender control API.
- Real task queue, cancellation, device restore or permission writes.
- Real Qwen3-TTS invocation or audio preview.
- `packages/adapter-wechatagent` and a supported-event/identity adapter (read-only evidence only).
- Real setup write operations: install/update/repair, component control and task recovery.
- WeChat window discovery, chat navigation or emergency-stop controls in the frontend.
- Group voice UI backed by real group-identity verification.
- Cloud TTS providers, credentials or a no-GPU configured path.
- One-click installer or packaged release.

Planned work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md) and the living status file
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Architecture

```text
Current repository
  DSH host
    ├─ dsh-whale-voice client bundle
    │    └─ seven Mock views + setup wizard + scoped CSS
    └─ read-only Host bridge
         └─ core/detect.mjs (WeChatAgent / Sender / Qwen evidence)

Target architecture (not implemented here)
  DSH plugin UI
    └─ Whale Voice Core: config, routing, permissions, task state
         ├─ TTS provider registry (local Qwen, cloud providers)
         ├─ Sender plugin adapter (Windows Voice Sender)
         └─ WeChatAgent adapter (REQUIRED for WeChat)
              └─ sourcepro5/WeChatAgent (external platform dependency)
```

WeChatAgent is not an optional plugin in the target design. Whale Voice may choose a different TTS
provider, but it does not replace WeChatAgent's message, account, session or authorization layer.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries and the planned contracts.

## Installation

Requirements:

- A DSH installation that supports client plugins.
- Node.js **22.13+** for rebuilding the client bundle.
- For **WeChat voice only**: a compatible [WeChatAgent](https://github.com/sourcepro5/WeChatAgent)
  installation and its supported Windows WeChat environment. WeChatAgent is an external upstream
  project, not bundled here.
- For actual native sending: a separately installed Voice Sender and its Windows audio prerequisites.

The plugin frontend and TTS provider settings must remain usable without WeChatAgent. If
WeChatAgent is missing or incompatible, WeChat voice stays disabled and the UI shows the documented
installation message instead of a fake online state. The frontend wizard and **read-only Core
detection** exist; installation and write operations do not.

The plugin has no npm runtime dependencies and no install step.

1. Place or link this directory where your DSH profile can resolve the `dsh-whale-voice` bundle.
2. Install/enable the bundle through the DSH Plugin Manager.
3. Rebuild the client after changing frontend source:

```powershell
node build.mjs
node --check client.js
node --test
```

Read-only detection is configured explicitly; there is no disk-wide search. Copy
[`core/config.example.json`](core/config.example.json) to `%DSH_HOME%\whale-voice\core.json`, or set
`WHALE_WECHATAGENT_HOME`, `WHALE_VOICE_SENDER_HOME` and `WHALE_VOICE_QWEN_URL`. The Host route must be
loaded by a host-plugin reload or DSH process restart before the UI can read real results; a page
refresh alone is insufficient and no restart was performed.

`client.js` is the file DSH loads; it is generated from `client.template.js`, `pages.js`, `setup.js`
and `client.css`. The generated file is committed because it is the runtime artifact referenced by
`package.json` (`exports["./client"]`), and the DSH plugin manager does not run a build lifecycle.

The repository does not install, start or modify Voice Sender, WeChatAgent, WeChat or Qwen.

## Platform limits

- The plugin UI runs in the DSH web client and is not tied to Windows.
- TTS provider settings and preview are intended to work without WeChatAgent.
- The real WeChat voice pipeline additionally requires Windows, WeChatAgent, Voice Sender and a
  local Qwen runtime. None of those are distributed in this repository.
- WeChatAgent is the required WeChat platform dependency. Whale Voice does not provide an
  independent WeChat message reader, account manager or bot.
- Real voice sending is disabled in the current project state. The developer environment has
  `voice.enabled=false`; the read-only detector does **not** read or change this switch, so the UI
  must show it as unknown unless a future Core supplies the state.
- Group chat automation is intentionally not opened until a stable real-group identity source is
  verified.

## Local and cloud TTS

The target architecture keeps TTS providers pluggable:

- Local: Qwen3-TTS with a user-owned voice profile.
- Cloud: a provider adapter selected deliberately by the user, never an automatic silent fallback.

No cloud provider, API key or vendor credential is included in this repository.

## Development

Read [AGENTS.md](AGENTS.md) before making changes. It defines the required startup checks, branch
workflow, testing expectations, progress-file updates and safety boundaries for coding agents.

```powershell
node build.mjs
node --check client.js
```

There is currently no automated browser/DOM test suite. CI only runs checks that exist in this
repository; it does not pretend to verify the real WeChat pipeline.

## Documentation

- [Roadmap](docs/ROADMAP.md) — P0–P9 plan and current status.
- [Project status](docs/PROJECT_STATUS.md) — living, evidence-based status.
- [Architecture](docs/ARCHITECTURE.md) — current and target architecture.
- [WeChatAgent compatibility](docs/WECHATAGENT_COMPATIBILITY.md) — versions, adapter boundary,
  missing-dependency UX and upgrade rules.
- [Setup capability review](docs/SETUP_CAPABILITY_REVIEW.md) — Phase 1 capability audit.
- [Setup API contract](docs/SETUP_API.md) — Core bridge, state machine, errors and security rules.
- [Phase 3 read-only report](docs/PHASE3_READONLY.md) — detected versions, evidence and unknowns.
- [Phase 3B Host activation plan](docs/PHASE3B_HOST_ACTIVATION.md) — 404 evidence, reload options and
  authorization gates.
- [Configuration sources](docs/CONFIG_SOURCES.md) — Phase 4A authority, sensitivity and saved/active rules.
- [UI testing](docs/UI_TESTING.md) — isolated Playwright harness, commands and safety boundaries.
- [Voice delivery backends](docs/VOICE_DELIVERY_BACKENDS.md) — native-vs-UI-automation research and decision.
- [Send & Safety API](docs/SEND_SAFETY_API.md) — planned capability/status contract for the safety page.
- [Send & Safety GUI acceptance](docs/GUI_ACCEPTANCE_SEND_SAFETY.md) — real DSH visual/UIA evidence and limitations.
- [Repository inventory](docs/REPOSITORY_INVENTORY.md) — reviewed files and exclusions.
- [Agent rules](AGENTS.md) — long-term development contract.
- [Changelog](CHANGELOG.md) — recorded changes, not invented releases.
- [License](LICENSE) — MIT, matching `package.json`.

## Security and privacy

This repository intentionally excludes:

- tokens, API keys, passwords and private keys;
- the owner's WeChat contacts, group mappings, chat text or session data;
- Qwen model caches and `whale-v1` reference audio;
- generated WAV/audio files and voice sending history;
- runtime state, device snapshots and logs;
- local desktop screenshots.

The demo targets in the UI use fictional placeholders such as `private:demo-1001` and
`演示联系人`. They are not production allow-list entries.

WeChatAgent is an independent upstream project under its own license and third-party terms. Whale
Voice does not claim authorship of WeChatAgent and does not bundle its Hook, WeChat client,
binaries or restricted third-party components. See
[WECHATAGENT_COMPATIBILITY.md](docs/WECHATAGENT_COMPATIBILITY.md) for the dependency and license
boundary.

## License

MIT. See [LICENSE](LICENSE). No third-party source, audio or image assets are bundled beyond the
original `icon.svg` in this repository.
