# Repository Inventory and Commit Scope

Audit date: 2026-10-24. This file describes the original 33-file working directory and what was
selected for the initial commit. Files added by later tasks (`setup.js`, `docs/SETUP_*` and
`docs/WECHATAGENT_COMPATIBILITY.md`) are included below but were not part of that initial directory.

## Source and project files — committed

| Path | Category | Reason |
|---|---|---|
| `package.json` | manifest | DSH bundle identity, exports, engines, license |
| `index.js` | host bridge | Read-only Host route + token-protected `window.__WHALE_SETUP__` injection |
| `core/detect.mjs` | Core | Read-only WeChatAgent / Sender / Qwen detection |
| `core/server.mjs` | Core test | Loopback read-only server for isolated tests |
| `core/config.example.json` | config example | Explicit roots/URLs; no disk-wide discovery |
| `test/core.test.mjs` | test | Auth, timeout, stale, missing/partial, bridge tests |
| `test/setup-contract.test.mjs` | test | No-shell, demo isolation and completion guards |
| `client.js` | generated runtime | DSH loads this file directly; kept in sync by CI |
| `client.template.js` | source | App shell, slots, components and `WhaleGlyph` |
| `pages.js` | source | Seven view components |
| `setup.js` | source | First-run wizard and component-management UI |
| `client.css` | source | Scoped tokens, layout, glass and responsive CSS |
| `build.mjs` | build | Injects CSS/pages/setup into `client.js` |
| `cordis.patch.yml` | config | Registers the bundle row |
| `icon.svg` | original asset | Plugin icon; no third-party image |
| `locale/zh.json` | resource | Chinese plugin metadata |
| `locale/en.json` | resource | English plugin metadata |
| `README.md` | documentation | Public project overview and boundaries |
| `LICENSE` | legal | MIT, matching the existing package declaration |
| `CHANGELOG.md` | documentation | Truthful initial baseline |
| `.gitignore` | repository config | Blocks secrets, runtime, audio and screenshots |
| `AGENTS.md` | documentation | Long-term agent workflow |
| `docs/ROADMAP.md` | documentation | P0–P9 roadmap |
| `docs/PROJECT_STATUS.md` | documentation | Living evidence-based status |
| `docs/ARCHITECTURE.md` | documentation | Current vs target architecture |
| `docs/WECHATAGENT_COMPATIBILITY.md` | documentation | Required upstream dependency and version policy |
| `docs/SETUP_CAPABILITY_REVIEW.md` | documentation | Phase 1 setup capability audit |
| `docs/SETUP_API.md` | documentation | Core setup bridge/state-machine contract |
| `docs/PHASE3_READONLY.md` | documentation | Phase 3 detection evidence and unknowns |
| `docs/REPOSITORY_INVENTORY.md` | documentation | This audit |
| `.github/workflows/ci.yml` | CI | Real build/syntax/sync checks only |

## Screenshots — excluded

The following 22 local PNGs were reviewed and **excluded from Git** because they show the
developer's private desktop, private WeChat/DSH chats, account overlays and/or runtime state:

```text
screenshots/whale-corners-dark-max.png
screenshots/whale-corners-dark-medium.png
screenshots/whale-corners-dark-narrow.png
screenshots/whale-corners-fixed.png
screenshots/whale-corners-light-max.png
screenshots/whale-frame-corners.png
screenshots/whale-frame-dark-max.png
screenshots/whale-frame-dark-medium.png
screenshots/whale-frame-dark-narrow.png
screenshots/whale-frame-light-max.png
screenshots/whale-frame-scroll-bottom.png
screenshots/whale-mark-closeup.png
screenshots/whale-mark-comparison.png
screenshots/whale-mark-dark-1100.png
screenshots/whale-mark-dark-800.png
screenshots/whale-mark-dark-max.png
screenshots/whale-mark-light-max.png
screenshots/whale-overview-dark-max.png
screenshots/whale-overview-dark-medium.png
screenshots/whale-overview-dark-narrow.png
screenshots/whale-overview-light-medium.png
```

They remain local evidence; they are not project source and are not required to build the plugin.

## Not present / never committed

- `node_modules/` (no runtime dependencies in this plugin)
- `.env` or credential files
- tokens, API keys, private keys
- Voice Sender runtime, queue database, logs or device snapshots
- Qwen model cache, `whale-v1` reference audio, generated WAV/MP3
- WeChat contacts/groups, chat exports, task history

## Privacy sanitization

The Mock activity/contact data originally contained a real contact name/ID and historical-looking
task IDs. For repository safety these were replaced with fictional data:

- `private:demo-1001` / `演示联系人`
- `demo-voice-001` … `demo-voice-008`
- generic demonstration statuses/notes

The actual production Voice Sender and WeChatAgent were not modified. The frontend remains a Mock
UI; these placeholders are not production allow-list entries.

## Suggested commit set

Commit the source, manifest, assets, docs, license, `.gitignore`, CI and the generated `client.js`.
Do **not** commit `screenshots/`, runtime state, audio, credentials or local configuration.
