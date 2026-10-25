# Project Status

**Project:** Whale Voice / `dsh-whale-voice`
**Version:** 0.1.0
**Repository:** https://github.com/qianqiucn/dsh-whale-voice (private)
**Updated:** 2026-10-25
**Current stage:** P0/P9 baseline complete; P7 Phase 2 UI complete; Phase 3A `OFFLINE`; Phase 3B `INTEGRATED`; **Phase 4A read-only config `INTEGRATED`** (real Host + bridge + eight-page GUI readout), not `VERIFIED`; `发送与安全` frontend is `MOCK`/disabled with **real DSH GUI visual acceptance PASS**; native voice research is `RESEARCH_CANDIDATE` (WeChatAgent native `UNSUPPORTED`); Phase 4A-H safety contracts fixed; **PR #3–#15 integrated into `main` with merge commits**; **Phase 4B-1 isolated config write is merged and `OFFLINE`**; **Phase 4B-2A coordination protocol is merged and `OFFLINE`**; **Phase 4B-2B-1 audit is `AUDIT COMPLETE` / `OFFLINE`**; **Phase 4B-2B-2a read-only capability/status projection is `INTEGRATED`** (real Host/GUI, full eight-page coverage; no write route); **Phase R1 `COMPLETE`**; **TTS-A Provider-neutral audit + pure contracts are `DESIGN`/`OFFLINE`** (no provider connected); **Phase 4B-2B-2b NOT STARTED**
**Latest associated commit:** `main` `bf9cf66807e12d0b25872a0fa3869962dde04818` (merge of PR #15); pre-integration backup tag `pre-pr3-8-integration` points to `b552ac0`
**Latest PR:** [#16 — feat(tts): Phase TTS-A provider-neutral audit and contracts](https://github.com/qianqiucn/dsh-whale-voice/pull/16) — **OPEN**, not merged. Latest merged PR: #15 (Phase 4B-2B-2a).
**Acceptance caveat:** Node/UI checks are offline/contract evidence unless explicitly marked real Host/GUI acceptance. Phase 4B-1/4B-2A/4B-2B-1 remain `OFFLINE`; Phase 4B-2B-2a is `INTEGRATED` after the authorized DSH Host/GUI acceptance. TTS-A adds no production provider, credential store, write route or audio path.
**PR #16 pre-merge checkpoint (Plan 03-A):** engineering HEAD `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773`; PR **OPEN, not merged**; CI run `40163881122` build+ui **SUCCESS**; `node --test` **197 tests / 196 pass / 1 platform skip**; `npm.cmd run test:ui` **24/24**; F01–F05 and N01–N05 complete. TTS-A remains **`DESIGN`/`OFFLINE`**. The earlier 192/191/1 snapshot is a **historical pre-F01–F05 checkpoint**, retained below. GitHub records **0 reviews**; CI is not human approval. Merge requires separate, explicit user authorization.
**Phase 4B-1 branch:** `feature/phase4b-isolated-config-write` — isolated config store, schema, tests and docs; **merged via PR #9**, not deleted.
**Phase 4B-2A branch:** `feature/phase4b-config-coordination` — isolated coordinator/protocol; **merged via PR #12**, not deleted.
**Phase 4B-2B-1 branch:** `feature/phase4b2b1-component-audit` — read-only audit + fixture-only capability tests; **merged via PR #14**, not deleted.
**Phase 4B-2B-2a branch:** `feature/phase4b2b2a-capability-status` — schema v3 capability projection, Host GET routes and frontend read-only visualization; **merged via PR #15**, not deleted.
**TTS-A branch:** `feature/tts-provider-neutral-contract` — provider-neutral audit, contract, registry, v2 migration design and isolated tests; pure/design only; **PR #16 open**, not merged.
**Integrated PRs:** #3 → #4 → #5 → #6 → #8 → #7 → #9 → #10 → #11 → #12 → #13 → #14 → #15, all merged with merge commits; #15 delivered Phase 4B-2B-2a read-only capability/status projection.

---

## Current scope

This repository contains the **DSH frontend plugin, a read-only Core detector, the Phase 4B-1
isolated config store and TTS-A Provider-neutral contracts**. It does not contain:

- a real local/cloud/custom TTS provider adapter, credential store or provider request path;
- Voice Sender Windows service (or its installer);
- WeChatAgent, WeChat Hook/Bridge;
- a Qwen3-TTS runtime, model weights or `whale-v1` reference audio (Qwen is only a reference path);
- a production configuration write/apply service;
- real voice task database, logs, device snapshots or chat history.

The existing production voice chain is external and must not be changed by documentation or
frontend work in this repository.

## WeChatAgent platform baseline

**WeChatAgent is the required WeChat platform dependency** for message access, contact/group
context, account/session identity, DSH bridging and the existing send capability. Whale Voice must
not be described as an independent WeChat bot.

| Component | Baseline | Verification |
|---|---|---|
| Whale Voice | 0.1.0 | this repository |
| WeChatAgent | 0.3.9 | verified locally from `app/resources/project/package.json` |
| WeChatAgent upstream latest observed | 0.4.0 | GitHub README, not installed/verified here |
| DSH plugin SDK | 0.2.0-rc.2 | supplied development baseline |
| DSH shell observed | 0.2.1-rc.2 | local executable version; formal SDK compatibility not re-tested |
| Windows WeChat | 4.1.10.27 | verified local client path |
| Voice Sender | 0.1.0 | external local prototype; not in this repository |
| WeChatAgent Adapter | read-only detection only | install/event/identity/send adapter remains planned |

The existing private voice pipeline (outside this repository) previously completed a native voice
bubble in the configured private chat; that evidence does not constitute an Adapter test or a
reproducible repository integration. See
[WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

The current UI is **Mock by default** and can display real read-only Core results when the host bridge
is active. A demo or a successful detection is not installation completion. Phase 3B/4A activation was
previously completed after a normal DSH restart; this documentation-repair task performed no DSH
reload or restart. A running DSH will only pick up new Host code after a separately authorized reload.

## Completed

- [x] Eight-page native DSH client plugin: Overview, Voice Settings, Access, Send & Safety,
      Voice Studio, Emotions, Activity, Advanced.
- [x] Dark/light visual system, glass surfaces, responsive layouts and outer frame polish.
- [x] Mock provider for services, permissions, tasks, diagnostics and settings.
- [x] Original `icon.svg` and localized plugin metadata.
- [x] Rebuild pipeline (`build.mjs` → `client.js`) and source syntax checks.
- [x] Live DSH slot verification and visual validation in large/medium/narrow windows.
- [x] Privacy sanitization of demo data (real target names/IDs replaced by fictional placeholders).
- [x] Repository documentation baseline: README, Roadmap P0–P9, Architecture, Agent rules,
      Changelog, License and .gitignore.
- [x] Local screenshot evidence reviewed and intentionally excluded from Git.
- [x] First private-repository commit and `main` push completed.
- [x] WeChatAgent dependency documentation merged to `main` via PR #1.
- [x] P7 Phase 2 frontend: first-run four-step wizard and component-management entry point.
- [x] Explicit no-Core and demo states; no fabricated completion/online state.
- [x] P7 Phase 3: minimal read-only Core, token-protected host bridge, real component detection.
      Phase 3A remains `OFFLINE`; Phase 3B later integrated live.
- [x] P7 Phase 3 live integration: user restarted DSH; routes return 401; no Host reload was used.
- [x] Contract tests for no-Core, missing/partial components, 401, timeout, stale results, auth and
      demo isolation; 52 behavior tests pass; local read-only smoke recorded in
      `docs/PHASE3_READONLY.md`.
- [x] Phase 3B read-only Host activation review and minimal-reload options documented in
      [PHASE3B_HOST_ACTIVATION.md](PHASE3B_HOST_ACTIVATION.md); no reload/restart performed by Agent.
- [x] Phase 3B real GUI acceptance: Core read `%DSH_HOME%\whale-voice\core.json`, WeChatAgent
      0.3.9/auth_required, Sender 0.1.0 offline, Qwen health valid, recovery/voice unknown,
      completion false. Status `INTEGRATED`, not `VERIFIED`.
- [x] Phase 4A read-only config snapshot: voice, TTS, permissions counts, sender config, saved/active
      separation, source inventory and sanitized revision; config and sources endpoints added.
- [x] Phase 4A real frontend readout in overview/settings/permissions/studio/advanced and component
      manager; Bridge/Worker layers separated; Mock remains labelled; no write controls enabled.
- [x] Phase 4A live GUI acceptance after normal DSH restart: current Host, 401-protected config
      routes, real `window.__WHALE_SETUP__` readout, component manager, and refresh all verified.
      Status `INTEGRATED`; live No-Core/timeout/invalid-schema/stale remain `OFFLINE` tests.
- [x] Development-only UI inspector: interactive `@playwright/cli` `0.1.22`; automation uses pinned
      `playwright@1.64.1` under `tests/ui`, isolated harness with fake bridge, 12/12 checks, CI `ui`
      job, Console/request/layout/narrow/dialog checks; see `docs/UI_TESTING.md`. This does not attach
      to the production DSH Electron window or use production data.
- [x] DSH Electron Inspector feasibility: native Inspector is slot/service metadata only; no supported
      DOM/accessibility/CSS/Console/CDP API. Level 2 remains `BLOCKED`; Option C recommended. No debug
      port, production profile attachment or production page read. See
      [DSH_ELECTRON_INSPECTOR_FEASIBILITY.md](DSH_ELECTRON_INSPECTOR_FEASIBILITY.md).
- [x] Voice delivery backend research: WeChatAgent 0.3.9 and public 0.4.0 adapters have text/sticker
      only; WeChatAgent native voice is `UNSUPPORTED`. UI Automation remains the supported backend.
      Third-party native APIs (WeChatPYAPI, PadChat-SDK) are **RESEARCH_CANDIDATE** only; no install,
      send, DLL, Hook, version or production config change. See
      [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md) and
      [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md).
- [x] Send & Safety frontend: new independent page for emergency stop, window/focus and game mode;
      unsupported controls disabled; failure fallback moved to Settings; Qwen auto-start moved to
      Components; UI tests cover Core-unavailable, disabled states, moved settings and narrow layout.
- [x] Send & Safety real DSH GUI acceptance: actual renderer shows the new page; UIA confirms
      disabled shortcut, discovery, focus and game switches; no duplicate settings; visual/resize
      checks pass. Console/CSS DOM remains unreadable without unsupported debugging. See
      [GUI_ACCEPTANCE_SEND_SAFETY.md](GUI_ACCEPTANCE_SEND_SAFETY.md).
- [x] Phase 4A-H pre-merge safety: full scheme/host/port Origin check shared by Host and Core,
      bounded streaming-only HTTP bodies, explicit-only `accountVerified`, and an opaque
      process-keyed full-config revision covering Worker/TTS/allowlist/source changes. 64 behavior
      tests and 12 UI checks pass; PR #4–#8 branches synchronized without force push.
- [x] AI memory and handoff: `docs/AI_CONTEXT.md` summary, `docs/DECISIONS.md` decision log, startup
      and stage-end rules in `AGENTS.md`; all memory docs are explicitly subordinate to code,
      Git/GitHub state, tests and the named authoritative documents.
- [x] Pre-merge documentation quality repair on PR #8: repaired four corrupted docs, normalized UTF-8,
      replaced the obsolete "remote repository is no longer empty" stop condition, refreshed stale
      memory/status facts, and added a lightweight Markdown encoding regression test. No runtime code
      change.
- [x] PR #3–#8 integration: merge commits for #3 (`7b66dca`), #4 (`91929fd`), #5 (`9688ff8`),
      #6 (`95a3528`), #8 (`5c4bc56`), and the final #7 documentation merge; main CI build+ui green;
      65 Node tests and 12 UI checks on the final tree. No runtime code or production change in the
      documentation union.
- [x] Phase 4B-1 isolated config write infrastructure: `core/config-sandbox.mjs`,
      `core/config-schema.mjs`, `core/config-store.mjs` and a test-only `core/isolated-write-server.mjs`;
      trusted sandbox capability, strict v1 schema, pure v0→v1 migration, HMAC revision,
      `expectedRevision` conflicts, single-file atomic save/verify/rollback, sanitized public
      projection, read/write state separation and 33 behavior tests. No production write route or
      production configuration change.
- [x] PR #9 merged into `main` as `97e96b5` with a Merge Commit after explicit authorization; branch
      retained, CI build+ui SUCCESS, 98 Node / 12 UI checks green. Phase 4B-1 status remains
      `OFFLINE`; no production write route.
- [x] Phase R1 repository audit **COMPLETE**: PR #10 merged into `main` as `70c0756`; docs/status
      reconciliation, historical-doc marking, `.gitignore` hardening and CI artifact upload repair;
      no runtime code change. 98 Node / 12 UI checks remain offline/contract evidence, not
      production write acceptance.
- [x] PR #11 merged into `main` as `8abf031`; R1 final status baseline synchronized. R1 is complete.
- [x] PR #12 merged into `main` as `a7a3056`; Phase 4B-2A coordination protocol landed with Plan ID,
  runtime revision, journal and rollback-confirmation hardening. Branch retained.
- [x] PR #13 merged into `main` as `e0ce035`; Phase 4B-2A handoff documents synchronized; docs-only,
  branch retained, no runtime code or production change.
- [x] Phase 4B-2A coordination protocol **OFFLINE**: `core/config-coordinator.mjs`, isolated
      in-memory source adapters, journal/recovery, save/apply state separation, Fake Runtime and 49
      coordination tests. No production adapter, Host write route, service reload or WeChat send.
- [x] Phase 4B-2B-1 real-component capability audit **OFFLINE**: verified Bridge per-call hot-read
      with no write/revision API; Sender boot-time read plus automation-only `PUT` (owner API exists,
      but **no Core write authorization**; plain full-file write, no revision); WeChatAgent console
      revision vs CLI/account-switch writers and mixed hot/boot readers; no loaded-revision interface
      anywhere. Documents the authority/single-writer matrix, capability schema (owner API vs
      authorization vs enablement vs save vs apply), Windows lock/CAS scheme (name replacement, not
      proven atomicity), minimal owner-API architecture and Phase 4B-2B-2 interface. See
      [PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md). Adds 12 fixture-only tests
      (5 capability + 7 schema); no production write, service operation or audio change.
- [x] Phase 4B-2B-2a read-only capability/status projection **INTEGRATED**: schema v3 moves
      `readTiming`/`hotReload`/`requiresRestart` to each Surface; `core/capabilities.mjs` joins the
      audited contract with `core/detect.mjs` + `core/config.mjs`; `core/capability-view.mjs` derives
      natural-language UI states; Host/Core gain GET `/capabilities` and `/capabilities/status` with
      the existing token/origin/loopback/connection guard. Real DSH Host/GUI acceptance covered all
      eight navigation pages; Worker version is independent and `NEVER_WRITE` is preserved; no
      `APPLIED` without a loaded revision. Merged via PR #15 (`bf9cf66`). See
      [CAPABILITY_API.md](CAPABILITY_API.md). 192 Node / 24 UI checks on the integrated baseline
      (**historical pre-F01–F05 snapshot**).
- [x] TTS-A Plan 02 / F01–F05 contract hardening **DESIGN/OFFLINE**: Provider Manifest, TTS request and
      synthesis result top-level allowlists; SVC request allowlist and sanitized return; required cloud
      credentials cannot become `AVAILABLE` from `unknown`. N01–N05 negative regressions added.
      Engineering HEAD `3ad32bc`, PR #16 open, CI run `40163881122` build+ui SUCCESS, Node 197
      (196 pass/1 skip), UI 24/24. No production/provider/SVC/Relay effect.
- [x] TTS-A Provider-neutral audit and pure contracts **DESIGN/OFFLINE**: `docs/TTS_PROVIDER_AUDIT.md`
      inventories Qwen hardcodes by Qwen-specific / current-selection / generic category;
      `docs/TTS_PROVIDER_ARCHITECTURE.md` defines the provider interface, 10 TTS candidates, separate
      SVC candidates, three-layer Core/Relay/WeChatAgent responsibilities, v2 config/migration
      proposal, GUI plan and TTS-B/C split. `core/tts/provider-contract.mjs`,
      `provider-registry.mjs` and `provider-config.mjs` are pure and isolated; `core/svc/` adds the
      separate SVC contract/registry (Seed-VC, RVC). No I/O, no Host route, no production config, no
      provider network call, no credentials. All candidates are `NOT_IMPLEMENTED`; `whale-v1` is
      preserved only as the current personal voice. 12 TTS + 4 SVC isolated tests added; no runtime or
      UI wiring, no real TTS/SVC.
- [x] GitHub CI baseline passed on the initial commit: build, syntax checks and generated-client
      sync.

## In progress

- [ ] TTS-B Provider service and neutral configuration (next implementation step; no production
      provider or write yet).
- [ ] No active production implementation. Phase 4B-1, 4B-2A, 4B-2B-1 and TTS-A are `OFFLINE`;
      Phase 4B-2B-2b (write) is **NOT STARTED**.

## Next highest-priority task

**Next gate: explicit user decision on merging PR #16 (Plan 03-B).** Plan 03-A has prepared the
pre-merge audit package and status checkpoint; PR #16 remains **OPEN**. Do not merge, squash/rebase,
delete the branch or change `main` without a new explicit authorization for this exact PR/HEAD.
After a future authorized merge, the next implementation step is **TTS-B — Provider service and neutral
configuration**: provider-aware observations and TTS gating, v2 migration for `qwen-local`, neutral
read-only GUI provider/voice selection and isolated tests. It must not connect a real provider, store
cloud credentials, start Qwen, write production configuration, restart services or send WeChat.
Phase 4B-2B-2b remains a separate future task and is not started.

## Pending

- [ ] P1: module boundaries and unified protocol.
- [ ] P2: Core configuration, permissions and task state.
- [ ] P3: versioned Voice Sender component contract.
- [ ] P4: required `packages/adapter-wechatagent` contract, version/connection checks and
      missing-WeChatAgent UI state.
- [ ] P5: real frontend connection replacing Mock data.
- [ ] P6: TTS-B provider service + neutral configuration; TTS-C real local/cloud/custom adapters,
      protected credentials, cost/privacy gates and audio pipeline integration (no provider yet).
- [ ] P7: installation wizard backend, real detection, install/update/repair/rollback and clean-machine
      acceptance.
- [ ] P8: verified group identity, emergency stop and WeChat auto-location integration.
- [ ] Native Voice Delivery Research: continue source/license/API review; no prototype until all gates pass and owner authorizes.
- [ ] P9: meaningful expanded CI, release validation and any visibility decision.

## Current technical blockers

1. The real backend services are external and not represented by source in this repository.
2. The WeChatAgent Adapter currently provides read-only evidence only; event/identity/send contracts
   remain unimplemented.
3. A production Core write/apply API does not exist; Phase 4B-1 provides only an isolated single-file
   store, Phase 4B-2A an isolated coordination protocol with fixture adapters, and Phase 4B-2B-1 a
   read-only audit. Real source adapters, owner-side write/revision APIs, cross-process coordination
   and trusted apply confirmation remain future (4B-2B-2+) work. Installation, upgrade, repair,
   credential operations and production configuration writes remain blocked.
4. A token-protected WeChatAgent/Sender health endpoint cannot be verified without reading their
   tokens; those states are deliberately `auth_required`/unknown.
5. An isolated Playwright harness exists; live real-DSH Electron DOM/CSS/Console and No-Core/timeout
   GUI injections remain `OFFLINE` or separately authorized.
6. Real WeChat UI/window tests require separate explicit authorization.
7. Group identity cannot be proven from display name alone, so group voice is not enabled.
8. Phase 3B is live: routes return 401, Core reads the authorized config, and the real GUI shows
   WeChatAgent `auth_required`, Sender offline, Qwen health valid. Sender is not running; it was not
   started. Live No-Core/timeout/invalid-schema/stale GUI tests were not performed and remain
   `OFFLINE` behavior tests; this is why Phase 3B is `INTEGRATED`, not `VERIFIED`.
9. Phase 4A is `INTEGRATED`: current Host (port 59194) serves the config routes, the trusted bridge
   reads real config, eight GUI surfaces were inspected, Bridge/Worker layers are separate, and no
   write API exists. Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE`.
10. Phase 4B-2B-1 found that the Sender automation `PUT` is the only owner-side write API, but
    Whale Voice has **no production write authorization** for it; the Bridge has no write API,
    Sender TTS/port has no update API, and no component exposes a loaded config revision. The save
    capability and the apply confirmation are separate: `APPLIED` is unreachable today and
    production writes remain blocked.
11. WeChatAgent has three config writers (console CAS, CLI prepare, account switch) with no shared
    lock, and mixed hot/boot readers; Core must not write its config. See the capability audit.
12. Phase 4B-2B-2a is `INTEGRATED`: real DSH Host PID `23200`/port `59194`, trusted bridge-read
    schema v3, eight-page GUI acceptance including Emotions and Activity, and Worker/Service version
    separation were verified. It is not `VERIFIED` because destructive No-Core/timeout/invalid-schema
    injections and Console/Network reading were not performed. TTS-A adds only pure contracts and
    isolated tests; no real provider exists and no production TTS is connected.

## Verification evidence

| Check | Result |
|---|---|
| `node build.mjs` | passed; regenerated `client.js` |
| `node --check client.js` | passed |
| `node --check client.template.js` | passed |
| `node --check pages.js` | passed |
| `node --check setup.js` | passed |
| `node --check build.mjs` | passed |
| DSH slot registration | verified earlier in the live runtime |
| Setup wizard UI smoke | live step 1–4 with real Core data; no-Core/timeout/stale remain automated only |
| Visual validation | large/medium/narrow, dark/light screenshots reviewed locally |
| `node --test` | 192 tests: 191 pass, 1 platform skip — **historical pre-F01–F05 snapshot**; current PR #16 checkpoint is 197/196 below |
| `node --test` (PR #16 current) | 197 tests: 196 pass, 1 platform skip; 5 new N01–N05 negative regressions; build output `client.js` 217349 bytes |
| Markdown encoding check | passed: tracked Markdown is UTF-8 with no PUA, U+FFFD or known mojibake sequences; failures report `file:line` |
| Secret/privacy scan | passed: no tokens, keys, private chat IDs, contacts, audio or screenshots in tracked files/history |
| Config store schema | v1 strict validation, v0→v1 idempotent migration, unknown fields rejected, required safety fields have no defaults |
| Config store sandbox | trusted capability under OS temp; forged/ordinary/production/WeChatAgent/Sender roots rejected; marker/realpath checks; no target writes on rejection |
| Config store revision | HMAC-SHA-256 process key; 32-hex opaque revision; expectedRevision conflict returns `CONFIG_CONFLICT`; restart invalidates |
| Config store atomicity | temp+fsync+rename, post-save verification and rollback; Windows lock/replace failures preserved original; no multi-file transaction claim |
| Read/write state | read GET `UNCHANGED`; write `SAVED` + `PENDING_APPLY`; no-op `UNCHANGED`; `activeRevision:null`, `activeConfirmed:false`, `activeState:UNKNOWN` |
| Isolated write API | test-only loopback server; token+Origin, JSON, 64 KiB body cap, 2 s timeout, one active write, sanitized response; not imported by production Host |
| Real read-only detection | WeChatAgent 0.3.9 auth_required; Sender 0.1.0 connection_failed/processRunning=false/healthy=null; Qwen 200 provider saved/configured=true, preview=false; completed=false; voiceEnabled=unknown |
| Config snapshot | Bridge voice false; Worker safety permit true (separate layers, not MISMATCH); TTS qwen-local/whale-v1 saved; permissions 2 private/1 group, details false; sender config 0.1.0 offline; active revision null |
| WeChatAgent Adapter | read-only evidence implemented; event/identity adapter remains planned |
| Missing-WeChatAgent state | wizard/UI implemented; live Host bridge active and Core config loaded |
| Core setup API | read-only status/detect/config routes are live (401 without token); Phase 4B-2B-2a adds read-only `/capabilities` and `/capabilities/status` in source; Phase 4B-1 adds an isolated test-only write store/API; no production write/apply route |
| Phase 4B-1 isolated write | merged via PR #9 (`97e96b5`); `OFFLINE`; trusted sandbox capability, strict v1 schema, v0 migration, HMAC revision, expectedRevision conflict, single-file atomic save/rollback, read/write state separation; no WeChatAgent/Sender/Qwen/core.json write |
| Phase 4B-2A coordination | `OFFLINE`; isolated in-memory source adapters, change plan, journal/recovery, save/apply split and Fake Runtime; no production adapter/route/reload/send |
| Phase 4B-2A test suite | 49 behavior tests: plan/schema/revision/concurrency, partial save/rollback, journal failure/recovery, PENDING/APPLIED/PARTIAL/UNKNOWN, sensitive output, Worker/permission and Host isolation |
| Phase 4B-2B-1 capability audit | read-only; verified Bridge per-call hot-read/no writer/no revision; Sender boot-read + automation owner PUT (no Core write authorization, plain full-file write, no revision); WeChatAgent console revision vs CLI/account-switch writers, mixed hot/boot readers, no loaded revision; owner API / authorization / enablement / save / apply kept separate; see [PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md) |
| Phase 4B-2B-1 capability tests | 5 fixture-only tests: no loaded revision → PENDING_APPLY; mismatch → UNKNOWN; exact revision after restart → APPLIED; revision-guarded save is CAS; no secret/target echo |
| Phase 4B-2B-1 schema tests | 7 fixture-only tests: Sender automation save supported but unauthorized; Sender TTS unsupported; read timing vs hot reload vs human console; UNKNOWN≠null/UNSUPPORTED/NOT_AUTHORIZED; null status rejected; writeEnabled derivation; summary separation |
| Phase 4B-2B-2a capability projection | `core/capabilities.mjs` v3: surface-level readTiming/hotReload/requiresRestart; automation RUNTIME_API/FULL/NOT_REQUIRED vs TTS SERVICE_BOOT/NONE/REQUIRED; version gating CHANGED/UNKNOWN downgrades to unknown; no I/O |
| Phase 4B-2B-2a Worker version | Worker has no independent version identifier; Sender Service 0.1.0 is never used as Worker evidence. Worker is `UNKNOWN`, reload fields `UNKNOWN`, `NEVER_WRITE` retained, writes disabled; Sender automation/TTS remain governed by the Service version |
| Phase 4B-2B-2a Host API | GET `/whale-voice/setup/capabilities` and `/capabilities/status`; existing token/origin/loopback/connection guard; 401/405/cross-site tests; no write route |
| Phase 4B-2B-2a UI | Overview capability summary; Bridge/TTS/automation/Worker/WeChat surfaces on Settings/Studio/Safety/Permissions; Components dialog blockers; Advanced technical details; no enabled write control |
| Windows lock probe (local) | `fs.open(...,'wx')` exclusive create, `EEXIST` on second create, `process.kill(pid,0)` live/`ESRCH`, `rename` replaces the name only; no atomicity or power-loss durability claim; advisory only, no production file touched |
| Live DSH host bridge | current port 59194 (Host PID 23200, main window 30644); Host routes 401; trusted bridge injects; eight GUI pages show real config; Phase 4B-2B-2a accepted |
| TTS-A provider contract | pure `core/tts/provider-contract.mjs`: manifest/version/status/request/result validation; no I/O, no network, no WeChat delivery; cloud/local fake-provider behavior tested |
| TTS-A registry | all ten TTS candidates (`qwen3-tts`, piper, kokoro, sherpa-onnx, indextts, azure-speech, elevenlabs, google-gemini-tts, openai-speech, custom-http) are `NOT_IMPLEMENTED`, `selectable:false`, no default; two SVC candidates (`seed-vc`, `rvc`) are in a separate registry; no provider/engine is connected |
| TTS-A SVC boundary | `core/svc/svc-contract.mjs` accepts an opaque source-audio artifact + shared target voice + conversion parameters and returns `PENDING_ROUTER`; `core/svc/svc-registry.mjs` keeps Seed-VC/RVC out of the TTS registry; no real conversion or model/consent workflow |
| TTS-A config migration | v2 proposal separates provider instances/models/voices/voice packs; qwen-local v1 preserved; cloud/custom legacy requires explicit selection; secrets/unsafe URLs/provider-voice mismatches rejected; no file write |
| TTS-A tests | 21 isolated tests: 16 TTS (local/cloud status, Qwen-offline independence, unsupported voice/language/emotion/streaming, missing credentials, timeout/error, unknown version, migration/idempotency, hidden-field rejection, Mock/real isolation, no-provider-send) and 5 SVC (request/result boundary, allowlist/sanitization, separate registry, no delivery/I/O) |
| PR #16 Plan 03-A checkpoint | engineering HEAD `3ad32bc`; PR **OPEN, not merged**; 22 files +2452/−173; CI run `40163881122` build+ui **SUCCESS**; Node 197 (196 pass/1 skip); UI 24/24; 0 GitHub reviews; F01–F05/N01–N05 complete; TTS-A `DESIGN`/`OFFLINE`; merge awaits explicit user authorization |
| Phase 4A config read | `INTEGRATED`; 64 tests/build pass; Bridge/Worker semantic warning gone; component manager and refresh verified |
| Real GUI exceptions | live No-Core/timeout/invalid-schema/stale not injected; remain `OFFLINE` |
| `npm.cmd run test:ui` | 24/24 isolated Playwright checks: real-config readout, capability summary/surfaces, Sender automation vs TTS reload, components dialog, invalid/missing/timeout capability, stale refresh race, Mock/real labels, No-Core/invalid/timeout, wizard, dialogs, glass/rounded, 780px, Console/requests |
| GitHub Actions `ui` job | installs locked `playwright@1.64.1` + Chromium, runs the harness and fails on any check error |
| UI harness artifacts | `tests/ui/.artifacts/` (gitignored); screenshots and report.json |
| DSH Electron Inspector | native Inspector is slot/service metadata only; no DOM/a11y/CSS/Console/CDP; Level 2 `BLOCKED`; no debug port or production page read |
| Voice delivery backends | UI Automation `SUPPORTED`; WeChatAgent 0.3.9/0.4.0 native voice `UNSUPPORTED`; third-party native `RESEARCH_CANDIDATE`; no prototype |
| Send & Safety UI | `MOCK`/disabled safety controls; moved game mode, failure fallback and Qwen auto-start; 12/12 isolated UI checks |
| Native voice research | WeChatPYAPI (SILK/bool, 4.1.12.26) and PadChat-SDK (SILK/msgId, separate iPad service) reviewed; both fail current-version/license/coexistence gates; no send |
| Send & Safety real DSH GUI | PASS visual/UIA read-only: new nav/page loaded, disabled shortcut/window/game controls, no duplicate settings; Console/CSS DOM unreadable without CDP |
| Phase 3B activation | `INTEGRATED` live; not `VERIFIED` because live No-Core/timeout/stale GUI tests remain `OFFLINE` |
| Real installation / upgrade / rollback | not performed |
| GitHub CI (initial commit) | passed: build, syntax checks, generated-client sync |
| PR #1 WeChatAgent docs | merged to `main`; CI passed |
| PR #3–#11 integration | merged with merge commits; `main` contains all heads; main CI build+ui SUCCESS |
| PR #3 setup wizard | merged; merge commit `7b66dca`; CI passed |
| PR #4 read-only Core | merged; merge commit `91929fd`; shared Origin guard, bounded HTTP and explicit account verification |
| PR #5 Phase 4A config | merged; merge commit `9688ff8`; full-config HMAC revision |
| PR #6 UI inspector | merged; merge commit `95a3528`; isolated UI harness + CI `ui` job |
| PR #7 Electron feasibility | merged; Inspector research + docs union |
| PR #8 Send & Safety / delivery research | merged; merge commit `5c4bc56`; 65 tests + 12 UI checks |
| PR #9 Phase 4B-1 isolated config write | merged as `97e96b5`; explicit merge authorization; CI build+ui SUCCESS; 98 tests + 12 UI checks; branch retained |
| PR #10 Phase R1 audit | merged as `70c0756`; CI build+ui SUCCESS; UI artifacts uploaded; 98 tests + 12 UI checks are offline/contract evidence, not production write acceptance |
| PR #11 R1 final status | merged as `8abf031`; CI build+ui SUCCESS; status docs synchronized |
| PR #12 Phase 4B-2A coordination | merged as `a7a3056`; CI build+ui SUCCESS; Plan ID/runtime revision/journal/rollback hardening; no production write |
| Real WeChat send in this repository | not performed and not part of this repository |

## Update rule

This file must be updated whenever a verified development task is completed. Status labels must be
specific; never mark a feature "working" based only on a Mock screen or an unexecuted plan.
