# Whale Voice · 小鲸鱼语音中心

Whale Voice is a native [DeepSeek Harness](https://github.com/deepseek-ai) client plugin for managing a
Qwen3-TTS / `whale-v1` / WeChat native-voice workflow in one place.

This repository currently contains the **Whale Voice frontend plugin only**. The working Windows
voice pipeline (Voice Sender, WeChatAgent, WeChat UI automation, VB-CABLE, the Qwen runtime and the
private `whale-v1` reference audio) is a separate local system and is **not included here**.

> **Current status: frontend + Mock.**
> The UI does not read or write production voice configuration, does not call Qwen, does not control
> Voice Sender, and does not send WeChat messages.

## What is implemented

- Native DSH client bundle (`dsh-whale-voice`) registered in the plugin sidebar and main slot.
- Seven views: Overview, Voice Settings, Access, Voice Studio, Emotions, Activity, Advanced.
- Dark and light appearance, glass surfaces, blue-purple accent system, responsive layouts.
- Mock services, permissions, activity history, diagnostics and demo settings.
- Accessible controls, keyboard focus states, reduced-motion handling, scoped CSS.
- Rebuildable client artifact committed for direct plugin loading.

The UI has been validated in the DSH desktop runtime, including large, medium and narrow windows,
dark and light themes, and outer frame/corner behavior. Local screenshots are intentionally excluded
from this repository because they contain the developer's private desktop and chat list.

## What is not implemented

- Real connection to the DSH Core / Voice Sender HTTP API.
- Real task queue, cancellation, device restore or permission writes.
- Real Qwen3-TTS invocation or audio preview.
- WeChat window discovery, chat navigation or emergency-stop controls in the frontend.
- Group voice UI backed by real group-identity verification.
- Cloud TTS providers or a no-GPU mode.
- One-click installer or packaged release.

Planned work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md) and the living status file
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Architecture

```text
Current repository
  DSH host
    └─ dsh-whale-voice (client.js)
         └─ seven Mock views + scoped CSS

Target architecture (not implemented here)
  DSH plugin UI
    └─ Whale Voice Core: config, routing, permissions, task state
         ├─ TTS provider registry (local Qwen, cloud providers)
         ├─ Sender plugin adapter (Windows Voice Sender)
         └─ WeChatAgent platform adapter
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries and the planned contracts.

## Installation

Requirements:

- A DSH installation that supports client plugins.
- Node.js **22.13+** for rebuilding the client bundle.

The plugin has no npm runtime dependencies and no install step.

1. Place or link this directory where your DSH profile can resolve the `dsh-whale-voice` bundle.
2. Install/enable the bundle through the DSH Plugin Manager.
3. Rebuild the client after changing frontend source:

```powershell
node build.mjs
node --check client.js
```

`client.js` is the file DSH loads; it is generated from `client.template.js`, `pages.js` and
`client.css`. The generated file is committed because it is the runtime artifact referenced by
`package.json` (`exports["./client"]`), and the DSH plugin manager does not run a build lifecycle.

The repository does not install, start or modify Voice Sender, WeChatAgent, WeChat or Qwen.

## Platform limits

- The plugin UI runs in the DSH web client and is not tied to Windows.
- The real voice pipeline requires Windows, WeChatAgent, Voice Sender and a local Qwen runtime.
  None of those are distributed in this repository.
- Real voice sending is disabled in the current project state. `voice.enabled` remains false in the
  developer environment.
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

## License

MIT. See [LICENSE](LICENSE). No third-party source, audio or image assets are bundled beyond the
original `icon.svg` in this repository.
