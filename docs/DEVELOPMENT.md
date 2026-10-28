# Development and preview guide

This guide is for developers and testers. The [project homepage](../README.md) is the starting point
for readers who want a plain-language overview.

Whale Voice is under active development. The repository includes a DSH frontend, a read-only Host
bridge and detector, isolated configuration foundations, and offline audio/provider/asset/task
modules. Real TTS synthesis, RVC inference, audio preview/save, the unified Relay component, and
WeChat delivery are not connected as a complete product workflow. There is no verified one-click
installer for ordinary users.

## Before working on the project

Read [AGENTS.md](../AGENTS.md), [Project status](PROJECT_STATUS.md), [Roadmap](ROADMAP.md),
[Architecture decisions](DECISIONS.md), and the relevant source and tests. Status documents retain
some historical snapshots: current code, exact Git revisions, PRs and their checks take precedence.
Keep task acceptance, merge status, real integration and user readiness separate.

Do not use a developer's installed models, personal voice, configuration or runtime state as portable
product defaults. The existing external Windows sending system is not distributed by this repository.

## Requirements

- A DSH environment that supports the project's client and Host plugin interfaces.
- Node.js **22.13 or newer** for building and running the project checks.
- Existing optional UI-test dependencies for the isolated Playwright harness.
- A compatible WeChatAgent and separately configured Windows sending environment only when an
  explicitly authorized task actually requires real WeChat integration.

The plugin has no npm runtime dependency installation step. UI-test dependencies are separate
development tools. Installing browsers or other components is an explicit environment operation,
not something the README preview or test run should silently perform.

## Load a development build

1. Make the checkout available to a compatible DSH profile as the `dsh-whale-voice` bundle.
2. Enable the bundle through the DSH Plugin Manager in an authorized development environment.
3. Build the committed client bundle when frontend source changes.

```powershell
node build.mjs
node --check client.js
node --test
```

`client.js` is generated from `client.template.js`, `pages.js`, `setup.js` and `client.css`. Do not
hand-edit the generated file. DSH loads the committed bundle through the package exports; the
Plugin Manager does not run a build lifecycle for this checkout.

Enabling the frontend is not evidence that the Host bridge or a provider is connected. A missing
trusted bridge must show the no-Core state. Host activation may require a separately authorized
reload or restart; refreshing the page is not a substitute.

## Read-only detection configuration

The detector uses explicitly configured locations and fixed supported loopback health endpoints.
It does not search the whole computer or install/start components.

For a development environment, use [core/config.example.json](../core/config.example.json) and the
existing setup/config contracts. The documented configuration surface supports a `core.json` under
the DSH home directory and the `WHALE_WECHATAGENT_HOME`, `WHALE_VOICE_SENDER_HOME`, and
`WHALE_VOICE_QWEN_URL` overrides. Verify the actual configuration precedence and path in
[Configuration sources](CONFIG_SOURCES.md) and the current implementation before changing anything.
Do not copy production settings, tokens or target mappings into test fixtures.

Read-only detection can expose installation/version/process/health evidence. A reachable endpoint,
HTTP 401 or an existing file is not proof of a healthy component, a verified account, or permission
to send. Unknown information must remain unknown.

The production Host has no configuration write/apply route. The single-file store and coordination
modules are isolated foundations; their presence does not authorize changes to WeChatAgent,
Sender, Worker, providers or production configuration. Saved and applied are distinct states.

## Checks

Use the checks appropriate to the files being changed. The existing baseline includes:

```powershell
node build.mjs
node --check client.js
node --check client.template.js
node --check pages.js
node --check setup.js
node --check build.mjs
node --test
npm.cmd run test:ui
```

On other supported development shells, use `npm run test:ui`. If an environment prerequisite is
missing, report it instead of installing it without approval or claiming the check passed.

The [isolated UI harness](UI_TESTING.md) uses fictional fixtures and never connects to the real DSH
Electron session, WeChat, Sender, Qwen, production tokens or audio devices. Test output belongs in
the ignored `tests/ui/.artifacts/` directory. A passing harness does not prove real integration.

For documentation-only work, verify Markdown links, asset rendering, layout, factual claims,
encoding and privacy. Runtime tests are not a substitute for checking the actual README rendering.
Existing CI may run the project checks automatically for the documentation PR.

## Architecture and product boundaries

The target product separates **Whale Audio Core** (generation, voices, models, audio and tasks)
from **Whale Relay Core** (one controlled delivery). The agreed target folds the existing Sender's
Windows execution capability into Relay as an internal module with unified installation and
management. This target is not yet implemented; process isolation and final Worker checks remain
necessary.

WeChatAgent remains an independent platform dependency for WeChat account/session identity and
authorization. The current project adapter provides read-only evidence; it does not implement the
full event, identity, tool registration or send integration. A generic OneBot audio concept does not
prove that a particular adapter implements native voice sending.

Core tasks and delivery requests must retain their authoritative ID association. An enqueued
request, a saved artifact, a local UI send observation and a trusted server receipt are different
results. `UNKNOWN` must not trigger an automatic resend or backend switch.

No real WeChat UI action, send, device operation, installation, restart, production write or paid
provider call is part of opening the preview or running isolated documentation checks.

## Where to read next

- [Documentation index](README.md)
- [Project status](PROJECT_STATUS.md) and [Roadmap](ROADMAP.md)
- [Current and target architecture](ARCHITECTURE.md)
- [Setup API](SETUP_API.md), [Configuration sources](CONFIG_SOURCES.md),
  [Capability/status API](CAPABILITY_API.md)
- [WeChatAgent compatibility](WECHATAGENT_COMPATIBILITY.md)
- [TTS provider architecture](TTS_PROVIDER_ARCHITECTURE.md)
- [Audio Core contract](WHALE_AUDIO_CORE_CONTRACT.md) and [Provider instances](PROVIDER_INSTANCES_OFFLINE.md)
- [UI testing](UI_TESTING.md) and [README preview asset provenance](assets/README.md)

The repository's MIT license does not grant rights to third-party models, voices, media, Hook
binaries or the WeChat client. Keep credentials, personal audio, chats, contacts, screenshots of
private applications, caches and runtime state out of Git.
