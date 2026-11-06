# AI Context — Whale Voice

**Purpose:** compact cross-session recovery note. This is a summary, not an authority. Re-verify
against the repository, Git/GitHub, tests and the linked authoritative documents before acting.

**Last updated:** 2026-11-04

---

## 1. Project and repository

- **Project:** Whale Voice / 小鲸鱼语音中心 — multi-engine TTS plugin; Qwen3-TTS/`whale-v1` are the
  current reference/personal path, not product defaults.
- **Repository:** https://github.com/qianqiucn/dsh-whale-voice (public; corrected 2026-10-29 after re-checking GitHub metadata — earlier "private" wording was inaccurate)
- **Plugin ID:** `dsh-whale-voice`
- **Runtime:** DSH client plugin + DSH Host row
- **Stack:** plain JavaScript browser UI, Node.js Host bridge, no root runtime dependencies
- **Target OS:** Windows first

Architecture in one line:

```text
DSH UI -> Host read-only bridge -> Core detector/config read
       -> provider-neutral TTS registry (design-only) + current Qwen reference
       -> Whale Audio Core generation -> persisted SAVED Artifact
       -> Whale Relay Core (persistent delivery owner) -> internal Windows Sender module (13-B, offline unit)
       -> WeChatAgent identity dependency + separate Voice Sender UI Automation for real voice delivery
```

See [ARCHITECTURE.md](ARCHITECTURE.md) and
[TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md).

---

## 2. Git baseline

- **Plan 08-E-E-B Step 1 (2026-10-31):** `core/audio/fixture-store-base-internal.mjs` now holds the verified shared store helpers (15 internal exports); the Task store re-exports the ten former shared bindings with the same identity and the Artifact store imports the same eight helpers from the base. Behaviour, file names, budgets, parsers and locks are unchanged; B01 covers the binding identity, both import orders and one VM fs-proxy marker fault. Save runtime/v2/proof were still unimplemented at this step (implemented offline later by 08-E-C); parent E-E and Plan 08 are `IN_PROGRESS`.
- **Plan 10-R1 · 164 (2026-11-05, branch `fix/assembly-failure-guidance`, not merged; v1.1 correction):** a failed generation start names the real reason and the repair entry that exists. The Host keeps the lower layer's `sandbox` detail and describes a storage open/read failure only within that known scope (「生成数据保存位置无法读取（保存位置或其内的存储入口无法打开或读取）」; a plain `segments` entry alone also triggers it, so no damaged/truncated-record claim), never as a Qwen runtime-path error; the Qwen-path wording stays only for a real worker-start failure. Guidance ends with the usable entry: 设置页保存/应用 with a draft store, otherwise 部署配置 with an explicit note that this page cannot save or apply. The 音色中心 page keeps its real waiting state while the assembly query is pending, then FAILED shows 「生成未能启动」 plus the same `messageZh` as the settings page (never 「未配置」), DISABLED still shows 生成未启用, READY unchanged, unreadable state keeps the F06 unknown message. v1.1 also removes the newly added no-trigger internal checks (bridge method existence, reason/detail second defaults, test-setter type fallback), and v1.2 makes a restored task's `generation_not_enabled` status answer leave the pending assembly decision to the assembly query instead of setting 未启用 early. Nothing is auto-fixed/saved/applied/started/deleted. Tests: node uses a plain `segments` entry (scoped message, no record/Qwen claim) and checks no-draft guidance; isolated UI holds the assembly response to prove the pending page makes no claim (fresh page and restored task with a 503 status), then checks a real FAILED assembly on both pages and the disabled path. Unit suite 1199/1195 pass/4 skips/0 fail; UI 86/86; `client.js` rebuilt (379,289). Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 163 (2026-11-05, branch `fix/restore-not-found-message`, not merged):** a saved task absent from the current storage location is no longer shown as a failed request. With a previous task id still in the browser and the Host's current location/scope answering `PRESET_GENERATION_STATUS_REJECTED` / detail `not found`, the page used to show the F06 read-failure text and keep asking to retry. It now says 「当前保存位置未找到这项任务」 with the known task id — the current location and scope lack that reference, which is not a claim it was never saved or that other locations lack it — and deletes, searches and regenerates nothing; a refresh repeats the same definite fact. Request rejection/timeout and 159's `read rejected` stay read failures (not not-found). Normal restore/download/selection/list, waiting/true-not-enabled and the 162 source wording are unchanged. Tests: isolated UI checks the not-found wording on first load and after refresh with no failure/retry wording and no fake download, and keeps both failed-read forms distinct. Unit suite 1197/1193 pass/4 skips/0 fail; UI 84/84; `client.js` rebuilt (377,759). Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 162 (2026-11-05, branch `fix/honest-generation-source`, not merged):** the 音色中心 generation page no longer claims Fixture for sure. The old copy said unconditionally 「隔离模拟…不加载真实模型、不联网」, while the Host assembly may adopt applied runtime paths/model directories; the page now says 来源未确认 — submitted through the formal Host interface and saved on the original task, but whether this run used the isolated Fixture or an applied local runtime path/model cannot be verified here, it never claims a real model is verified, and this page neither plays audio nor sends WeChat. The run notice, generate button/toast, failure notice and selected saved-result explanation use the same wording; saved facts, download, selection, reopen and the F06 failure/waiting/not-enabled displays are unchanged. `fixtureOnly`/`realReady`, artifact origin and the expiry contract were not changed. Tests: the existing Studio UI check asserts the unconfirmed-source wording and the absence of the old absolute claims; full Studio flow keeps passing. Unit suite 1197/1193 pass/4 skips/0 fail; UI 83/83; `client.js` rebuilt (376,628). Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 161 (2026-11-05, branch `fix/explicit-language-rejected`, not merged):** an explicitly submitted language the voice does not support is rejected instead of silently replaced. `generate()` used to fall back to the voice's first language for any value outside its list (an `en-US` request on a zh-CN-only voice produced a zh-CN SAVED result); it now returns `PRESET_GENERATION_LANGUAGE_REJECTED` / detail `language` before any task, claim or artifact is created, while a request that submits no language (Host passes absent `language` as `undefined`) keeps the original default and a supported explicit value stays as submitted (`en-US` unchanged on a zh-CN+en-US voice). Normal generation, saving, status, listing and download keep working; no language support, voice discovery, model/Worker protocol or UI language options were added or changed. Tests: Core rejection creates no task and leaves existing results unchanged, omitted → `zh-CN`, supported `en-US` stays `en-US`; Host POST body rejected / omitted default / supported value, with an empty result list after the rejection. Unit suite 1197/1193 pass/4 skips/0 fail; UI 83/83; `client.js` unchanged. Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 160 (2026-11-05, branch `fix/generation-read-failure-message`, not merged):** the 音色中心 no longer mislabels a failed capability or saved-result read as 未启用, an endless 检查中 or an empty result. Pending keeps the real waiting state; a rejected request (network/timeout) or a server failure object shows 「无法读取生成能力…这不代表未启用」 with a 读取失败 badge; restoring the last saved task keeps the known task id and says 「无法读取上次保存的结果…这不代表没有保存」 for a rejected or failed status read (including 159's rejection) instead of the empty 还没有生成结果 state or a fake download. Nothing is generated, saved or deleted; normal reads, true not-enabled and the original download paths are unchanged. The formal client's two failure forms are pinned against the production bridge script (resolved `core_http_500` object and rejected promise); the isolated UI harness covers both forms, the pending state and normal/not-enabled. Unit suite 1195/1191 pass/4 skips/0 fail; UI 83/83; `client.js` 376,399 bytes. Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 159 (2026-11-05, branch `fix/status-read-failure-honest`, not merged):** one saved result's status no longer reports a failed byte read as a successful readable result. `status(taskId)` checks the owner availability first and then reads the bytes; a failed read used to answer `ok:true, readable:true` with `sha256`/`byteLength` `null` (a damaged or unreadable file looked fine until download). It now returns `PRESET_GENERATION_STATUS_REJECTED` / `read rejected`, the same honest failure `download()` already returned, while a successful query still reports SHA-256/byte length/origin. The failed read rewrites, deletes, regenerates and re-sends nothing (pack and task entries stay byte-identical); reopening the same location reports and downloads the original result again. Tests: an injected `EIO` on the pack read after the successful availability check reproduces the old false success and now fails honestly; pack/entries unchanged; reopen status + download have the original bytes. Unit suite 1194/1190 pass/4 skips/0 fail; UI 80/80; `client.js` unchanged (374,229). Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 158 (2026-11-05, branch `fix/saved-results-list-fast`, not merged):** the saved-result list no longer re-reads the whole artifact pack per listed result. `results()` asks the artifact library once per storage segment for that segment's saved-result metadata, so each `audio-artifacts-v1.json` is read and re-inspected once per list instead of once per entry; the list keeps the same entries/order/task ids/SAVED state/readable flag/SHA-256/byte length/origin/created-at, missing/deleted/expired artifacts stay listed as not readable, and a real read failure still returns `PRESET_GENERATION_RESULTS_REJECTED`. The library gains read-only `getMany({schemaVersion, scopeId, artifactRefs, now, rights})` with the same per-reference outcomes as `get` from one pack read. Nothing is created/changed/deleted and no generation runs. Measured on the same isolated stores: 24 results 435–444 ms → 22–23 ms, 96 results (4 segments) 1.75–2.09 s → 83–84 ms (this machine). Tests: 25 saved results across two segments list correctly while each segment pack is opened exactly once (previous revision: once per result); `getMany` FOUND/DELETED/NOT_FOUND/EXPIRED in request order plus the scope/rights gates. Unit suite 1193/1189 pass/4 skips/0 fail; UI 80/80; `client.js` unchanged (374,229). Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 157 (2026-11-05, branch `fix/concurrent-segment-rotation`, not merged; v1.1 correction):** two simultaneous generations at a segment boundary no longer break the saved-result list, without hidden queue time. Only the segment switch is serialized: the second request shares the just-created segment instead of opening the same `segments/NNNN` store twice, while both accepted requests run their own provider request; the session no longer falls into `TASK_OWNER_STORE_CHANGED`/`TASK_OWNER_OWNER_UNKNOWN` after the boundary. A provider that cannot run two syntheses rejects the extra request honestly; an accepted request is not cut off by queue time outside the 156 client wait; no retry/duplicate; saved results stay listable/queryable/downloadable without reopening. Tests: 24 saved results + two simultaneous boundary generations, then same-session results/old download/new generation usable; with a 20 s effective limit and 16 s synthesis, two simultaneous production-bridge requests finish inside the 30 s client wait (one SAVED, the other real result/honest rejection, never `generation_unconfirmed`) — the previous whole-generate queue fails at 30 s. Unit suite 1191/1187 pass/4 skips/0 fail; UI 80/80; `client.js` unchanged (374,229). Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 156 (2026-11-05, branch `fix/generation-wait-limit`, not merged):** the 音色中心 generation wait follows the effective Host limit instead of the fixed 15 s. The Core catalog publishes `generationTimeoutMs` (the effective per-request limit the audited Qwen adapter enforces: requested timeout clamped by the worker's `limits.timeoutMs`; the Qwen default 120 s is not a cap). The production client bridge's generation helper accepts a per-request timeout (other routes keep 15 s) and `generatePreset` waits for the catalog limit plus a 10 s grace; a client abort returns `generation_unconfirmed` instead of success/failure. The Studio page passes that limit, keeps 生成中 inside the limit, and shows 「生成结果未确认」 (no auto retry; result may appear in 已保存的生成结果) when the wait really ends; explicit backend failures still show the code and never SAVED. Tests use the production bridge script over real Host routes + Fixture Worker: a 16 s generation inside a 30 s limit returns SAVED after >15 s with exactly one task; a 1 s backend limit returns failure with no saved result; a client abort returns unconfirmed. Unit suite 1189/1185 pass/4 skips/0 fail; UI 80/80 (Studio check asserts the wait limit); `client.js` 374,229 bytes. Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 155 (2026-11-05, branch `fix/persistent-generation-storage`, not merged):** generation keeps saving past the old fixed budgets and saved results stay retrievable. `openPresetGenerationApp` uses segmented storage: the given storage root keeps the original results and, when the current segment approaches the unchanged per-file limits (24 tasks / 3 MiB audio, below 32 entries / 4 MiB), new saves continue in `segments/NNNN`; `status`/`results`/`download` search every segment, nothing is deleted and old results keep their task association across reopen. Saved Provider generation artifacts (`PROVIDER_GENERATION_FIXTURE`) ignore the recorded 24 h expiration in the library and owner status reads, so pre-fix expired records are readable again; other origins keep their expiry. Catalog `count` and `listSaved.entryCount` support capacity measurement; a real write failure still returns failure (not SAVED) and keeps earlier results. Tests: 66 consecutive saves crossing the old 32/64-record and 4 MiB budgets, first/middle/last download, two-day-later reopen; read-only write failure stays honest. Unit suite 1186/1182 pass/4 skips/0 fail; UI 80/80; `client.js` unchanged (373,182). Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 154 (2026-11-05, branch `fix/applied-settings-recoverable`, not merged):** a wrong or damaged applied generation setting no longer prevents the plugin from opening. `apply()` previously threw when an applied storage location could not be opened, the applied Qwen runtime could not start, or `generation-settings-applied.json` / `qwen-runtime-applied.json` was truncated; now those real failures install the read-only Host + settings draft store and expose the reason through `GET /whale-voice/setup/generation/assembly` (`{state:'READY'|'DISABLED'|'FAILED',code,messageZh}`; bridge `getGenerationAssemblyStatus`), with generation explicitly 503 until repaired. The settings cards tolerate a damaged applied record (GET/PUT return `appliedError`, not 500) and 保存草稿 + 应用 rewrites it; reopening the same isolated config uses the corrected storage/runtime values and Fixture generation + original-task save work again. Generation-off + damaged record keeps the page usable and starts nothing; if the status request itself fails, the page shows that the generation state cannot be read (not silently nothing) with the settings entry still usable; UI shows the failure reason and repairs both records. Unit suite 1184/1180 pass/4 skips/0 fail; UI 80/80; `client.js` 373,182 bytes. Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 151 (2026-11-05, branch `feature/plan10-r1-generation-results`, not merged):** the 音色中心 page lists the saved generation results of the same current storage location and can select either one back. The task owner gains a read-only `listSaved({schemaVersion, scopeId})` over the same owner file (only that scope's `FINAL SAVED` entries; the fresh association gates still run; nothing is created/changed/retried). The Core entry gains `results()`: it keeps only the current range (`provider-generation` / `PROVIDER_TTS`) and returns each original task's id/SAVED state/artifact ref/readable flag plus the stored artifact's SHA-256/byte length/origin/created-at via the existing library `get`; an empty scope returns an empty list. `installHostBridge` adds `GET /whale-voice/setup/generation/results` (503 without a runtime) and the bridge adds `getGenerationResults`. The Studio page gets a 已保存的生成结果 card (暂无结果 when empty); selecting an entry reuses the existing 下载已保存音频 action and never generates/saves/mutates. Tests: Core list + two downloads + reopen; Host route JSON/401/503; scope isolation; UI empty → two generations → select both → reload → both selectable, generation count 2. Unit suite 1180/1176 pass/4 skips/0 fail; UI 76/76; `client.js` 369,603 bytes. Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 150 (2026-11-05, branch `feature/plan10-r1-generation-download`, not merged):** the 音色中心 page downloads the already-saved WAV of the current original task. The Core entry gains `download(taskId)` (reads the owner-confirmed saved artifact and returns its stored bytes plus the original ref/origin/SHA-256 and a fixed file name; never creates a task or re-synthesises); `installHostBridge` adds `GET /whale-voice/setup/generation/download` (503 without a runtime, 404 unknown/unreadable, `audio/wav` attachment) and the bridge adds `downloadGenerationResult`. The Studio result block gets 下载已保存音频; bytes match the saved SHA-256/size, and reload + same-task download returns the same bytes without another generation call. Tests: Core bytes/sha/ref/no new task; Host headers/bytes/404/401/503; UI generate→download→reload→download with generation count unchanged. Unit suite 1177/1173 pass/4 skips/0 fail; UI 76/76; `client.js` 364,291. Real enablement/playback/delivery remain open.
- **Plan 10-R1 · 149 (2026-11-05, branch `feature/plan10-r1-qwen-runtime-applied`, not merged):** the saved Qwen runtime paths can be explicitly applied and are adopted on the next plugin open. The settings store also keeps `qwen-runtime-applied.json`; `installHostBridge` adds `POST /whale-voice/setup/settings/qwen-runtime/apply` and responses carry `applied`/`appliedAt`; the settings page's 应用运行路径 button records the fact ("Qwen 运行路径已应用，下次重开插件生效"). Saving alone changes nothing. On the next formal `apply` with the same serialized config the applied Python program replaces `worker.runtime` and the applied model directory replaces the worker's `--model-dir`; enablement/trust still come from the config. Tests: save-only fails on the old invalid runtime; after apply the Fixture Worker runs with the applied paths (argv record) and a simulated generation is SAVED; disabled generation stays 503. Unit suite 1175/1171 pass/4 skips/0 fail; UI 76/76; `client.js` 362,351. Real enablement/deploy remain open.
- **Plan 10-R1 · 148 (2026-11-05, branch `feature/plan10-r1-qwen-runtime-draft`, not merged):** the 语音设置 page saves the Qwen runtime paths as an isolated draft. The settings store also keeps `qwen-runtime-draft.json` (`schemaVersion:1`, `modelDirectory`, `pythonPath`, `savedAt`); `installHostBridge` adds `GET/PUT /whale-voice/setup/settings/qwen-runtime` (503 without a store, 400 for empty/relative paths) and the client bridge adds get/save methods. The “Qwen 运行路径” card saves the model directory and Python runtime program and says "Qwen 运行路径草稿已保存，尚未应用"; saving never reads a model, executes Python, starts a Worker/generation or applies the paths. Reopening the same config reads the same values back; generation stays 503. Tests: store reopen/invalid input, Host save/re-read/reopen/no-store, formal plugin save→dispose→re-apply, isolated UI save→reload. Unit suite 1173/1169 pass/4 skips/0 fail; UI 76/76; `client.js` 359,889. Real enablement/deploy remain open.
- **Plan 10-R1 · 147 (2026-11-05, branch `feature/plan10-r1-generation-storage-apply`, same PR #74, not merged):** the settings card's applied-location status is the persisted fact "已应用位置：…"; it no longer claims after a normal reopen that the current runtime still uses the old location or still waits for the next open. The operation explanation stays separate ("应用只决定下次打开时使用的位置，不会立即切换当前运行"). The isolated UI check asserts the exact text after a page reload; the old wording fails it. No runtime probe or backend change. Unit suite 1170/1166 pass/4 skips/0 fail; UI 75/75; `client.js` 354,318.
- **Plan 10-R1 · 146 (2026-11-05, branch `feature/plan10-r1-generation-storage-apply`, not merged):** the saved generation storage location can be explicitly applied and takes effect on the next plugin open. The settings store also keeps `generation-settings-applied.json`; `installHostBridge` adds `POST /whale-voice/setup/settings/generation-storage/apply` and GET/PUT responses carry the applied fact; the settings page gets an 应用保存的位置 button ("已应用，下次重开插件生效"). Saving alone moves nothing; the current runtime keeps its location/lifecycle and old results stay. On the next formal `apply` with the same serialized config the plugin reads the applied fact and opens the generation storage there; no migration, and with generation disabled no Worker/model starts. Tests: A/B temp locations + Fixture Worker (save B → still A; apply B → still A; dispose; reopen → new generation in B, A byte-identical); disabled-generation apply stays 503. Unit suite 1170/1166 pass/4 skips/0 fail; UI 75/75; `client.js` 354,353. Real enablement/deploy remain open.
- **Plan 10-R1 · 145 (2026-11-04, branch `feature/plan10-r1-generation-storage-draft-wiring`, not merged):** the formal plugin entry opens the 144 draft store from serializable config. `apply(ctx, config)` reads `config.settings.draftRoot`, opens the trusted persistent storage itself (no caller-injected store) and passes the draft store to the same Host surface; without that config the draft route stays 503. The draft works while generation stays disabled: save → normal dispose keeps the file → the same config/location reopened through the formal entry reads the same value, still "草稿已保存，尚未应用"; no Worker/model starts. Tests: serialized config → formal apply → save → dispose → re-apply → same value (generation still 503); no config → 503. Unit suite 1168/1164 pass/4 skips/0 fail; UI 75/75; `client.js` unchanged (351,806). The draft is not applied; real enablement/deploy remain open.
- **Plan 10-R1 · 144 (2026-11-04, branch `feature/plan10-r1-generation-storage-draft`, not merged):** the 语音设置 page records the generation data storage location as a real isolated settings draft. `core/settings-draft.mjs` stores one fixed `generation-settings-draft.json` (`schemaVersion:1`, `generationStorageRoot`, `savedAt`) under a trusted sandbox; `installHostBridge` adds `GET/PUT /whale-voice/setup/settings/generation-storage` (503 without a store, 400 for empty/relative paths) and the client bridge adds `getGenerationStorageDraft`/`saveGenerationStorageDraft`. The page saves through the Host route, re-reads the same value after a page reload, and says "草稿已保存，尚未应用"; no generation service/Worker/model starts and no production config is written. Tests: store reopen/invalid input, Host save/re-read/reopen/no-store, isolated UI save→reload. Unit suite 1166/1162 pass/4 skips/0 fail; UI 75/75; `client.js` 351,806. Production apply still supplies no draft store; real enablement/deploy remain open.
- **Plan 10-R1 · 143 (2026-11-04, branch `feature/plan10-r1-generation-storage`, not merged):** generation data survives a plugin reopen at an explicit storage location. A serializable `config.generation.storageRoot` (absolute path) makes the formal `apply` open that location through the persistent trusted `openConfigStorage` capability (`core/config-sandbox.mjs`) instead of a fresh temporary sandbox; dispose still disposes the routes and closes the runtime/worker but keeps the location's marker and Task/Artifact store files, and a second `apply` over the same location/config answers the original Task ID with the same Artifact/SHA-256/`PROVIDER_GENERATION_FIXTURE` origin while the store files stay byte-identical (query only, no re-synthesis). Without `storageRoot` the 142 temporary-sandbox behaviour is unchanged. Test: fresh test temporary parent → generate → dispose → re-apply → status. Unit suite 1164/1160 pass/4 skips/0 fail; UI 74/74; `client.js` unchanged (320,456). No historical migration, no production store, no real model/playback/delivery; the installed Host remains not enabled.
- **Plan 10-R1 · 142 (2026-11-04, branch `feature/plan10-r1-plugin-runtime-config`, not merged):** the formal plugin entry assembles the generation service from serializable runtime config. `apply(ctx, config)` reads only JSON values from `config.generation` (`enabled`, `scopeId`, `rightsProofRef`, `allowedRoot`, `worker`, `instanceId`, timeouts); the Host creates its own temporary isolated sandbox, calls `openQwenGenerationRuntime` and passes the same Core app to the existing Host surface. Without `enabled:true` nothing starts and the routes stay `503 generation_not_enabled`; disposal disposes the routes, closes the runtime and removes the sandbox. Tests cover JSON round-trip config → catalog/generate/status → same saved result → dispose (worker closed, sandbox removed) and the no-config/`enabled:false` 503 path. Unit suite 1163/1159 pass/4 skips/0 fail; UI 74/74; `client.js` unchanged (320,456). Temporary sandbox is not production persistence; no real model/playback/delivery.
- **Plan 10-R1 · 140 (2026-11-04, branch `feature/plan10-r1-qwen-runtime-assembly`, not merged):** formal Qwen generation runtime assembly. `core/qwen-generation-runtime.mjs` `openQwenGenerationRuntime({sandbox, scopeId, rightsProofRef, allowedRoot, worker, instanceId?, …})` creates the existing supervisor/provider, starts them, builds the same Core app from the real handshake/discovery (preset voices, languages, text limit, model/backend/provider identity; `instanceId` is the caller label), and returns `{app, provider, discovery, close}`; `close()` stops only the worker it created (second close no-op). `openPresetGenerationApp` accepts the provider facts (documented example remains the direct-call default). The isolated Host test and UI Host assembly use this one entry; the Host catalog shows discovered voices/limit and the persisted v2 task carries exactly the runtime facts. New test covers discovery → catalog → generate/status → persisted facts → close. Unit suite 1161/1157 pass/4 skips/0 fail; UI 74/74; `client.js` unchanged (320,456). Production `apply()` still passes no runtime.
- **Plan 10-R1 · 139 (2026-11-04, branch `feature/plan10-r1-provider-task-issuance`, not merged):** formal Provider task issuance and save. `task-contract.mjs` adds `AudioTaskDraft v2` / record v2 (`schemaVersion: 2`, `feature: provider-generation`, `taskType: PROVIDER_TTS`) with `provider {providerId, instanceId, model, backend}`, preset `voice`, submitted text `input {kind:'TEXT', text}` and the Fixture rights/execution context; v1 Fixture/Cover shapes, identities and projections are unchanged (v1 still rejects `providerId`). The catalog/owner/artifact stores and the existing transition/save chain accept v2 (version-aware draft copy, identity, immutable comparison, initial-record re-creation), so the same coordinator, original owner save and same artifact library consume it; `generate`/`status` expose the provider/voice/input facts and a reopen is consistent. The Core test asserts the persisted v2 catalog record and the issue → generate → SAVED (`PROVIDER_GENERATION_FIXTURE`) → status → reopen chain; the baseline fails as `provider: undefined`. Unit suite 1160/1156 pass/4 skips/0 fail; UI 74/74; `client.js` unchanged (320,456). Real model/playback/delivery remain open.
- **Plan 10-R1 · 138 (2026-11-04, branch `feature/plan10-r1-provider-generation-origin`, not merged):** Provider generation results record their own source. The Artifact library accepts two origins — `FIXTURE_IMPORT` (default; ordinary Fixture/Cover imports unchanged) and `PROVIDER_GENERATION_FIXTURE` (optional eighth `origin` import key); the pack parser preserves/validates them and an unknown origin is rejected before any write. The coordinator imports its output with `PROVIDER_GENERATION_FIXTURE`, and the Core `generate`/`status` results (and the Host envelope) carry the stored Artifact's `origin` after reopen. The test covers generate/status/reopen origin, the unchanged Fixture origin and unknown-origin rejection; the baseline fails with `origin: undefined`. Unit suite 1160/1156 pass/4 skips/0 fail; UI 74/74; `client.js` unchanged (320,456). Real model/playback/delivery remain open.
- **Plan 10-R1 · 137 (2026-11-04, branch `feature/plan10-r1-studio-host-wiring`, not merged):** the 音色中心 page calls the formal Host generation interface. The production client bridge (`index.js` `bridgeScript`) gains `getGenerationCatalog`/`generatePreset`/`getGenerationStatus` on the existing token/same-origin mechanism and returns the Host JSON envelope (the `503 generation_not_enabled` body instead of throwing). `StudioPage` loads the preset voices, submits the short text, queries the returned Task ID through the status route, remembers the ID locally so a reload re-queries the same saved result, and shows `生成未启用` when no runtime is configured; the page no longer uses a page-specific test adapter. The isolated harness `tests/ui/host-generation-assembly.mjs` serves the real 136 Host routes + 135 Core + real `createQwenProvider` + Fixture worker. Unit suite 1160/1156 pass/4 skips/0 fail; UI 74/74; `client.js` 320,456 bytes. Real model/playback/delivery remain open and the installed Host cannot generate.
- **Plan 10-R1 · 136 (2026-11-04, branch `feature/plan10-r1-host-generation-entry`, not merged):** the formal Host interface calls the 135 Core generation entry. `index.js` (`installHostBridge`) adds `GET /whale-voice/setup/generation/catalog`, `POST /whale-voice/setup/generation` and `GET /whale-voice/setup/generation/status?taskId=…` on the existing loopback/Origin/connection/token bridge (only `/generation` accepts POST); the handler calls an injected `options.generation` Core entry. The production `apply()` passes no runtime, so the routes are inert (`503 generation_not_enabled`) and the installed host cannot generate. The isolated Host test submits a preset request, queries the same task/Artifact, and reopens a new Host + Core assembly over the same sandbox for the same saved result; unit suite 1159/1155 pass/4 skips/0 fail; UI 73/73; `client.js` unchanged. Real model/playback/delivery remain open.
- **Plan 10-R1 · 135 (2026-11-04, branch `feature/plan10-r1-core-generation-entry`, not merged):** the formal Core gets the application-facing preset generation entry. `core/preset-generation-app.mjs` exposes `openPresetGenerationApp({sandbox, provider, scopeId, rightsProofRef, voices})` → `{catalog, generate, status}`: `generate` reserves a real catalog birth, runs the 133 coordinator once against the injected already-started `createQwenProvider` and lets 132 save on the original task; `status(taskId)` re-reads the original task/Artifact stores. The test-only UI bridge now only supplies the controlled execution object/sandbox/HTTP surface and delegates to this Core entry (no test-bridge or Fixture-worker imports in Core; no Host route). Unit suite 1158/1154 pass/4 skips/0 fail; UI 73/73; `client.js` unchanged. Real model/playback/delivery remain open.
- **Plan 10-R1 · 134 (2026-11-04, branch `feature/plan10-r1-studio-preset-ui`, not merged):** the existing Chinese 音色中心 page entry is wired to the isolated 133/132 chain. `StudioPage`'s text/预设音色/生成并保存 controls use the harness-injected `window.__WHALE_STUDIO_GENERATION__` adapter (`tests/ui/studio-generation-bridge.mjs`), which runs the real `createQwenProvider` + existing Fixture worker and the original-task save on a temporary sandbox; the page shows `原任务已保存` with the actual task/artifact facts, reload reads the same artifact back, and a second run mints a different task id. The page labels it `隔离模拟` and says production generation is not connected; without the adapter the button stays disabled and the production Host gains no route. UI 73/73; unit suite unchanged 1157/1153/4/0; `client.js` 318,823 bytes. Real model/inference, clone/VoiceDesign, playback and delivery remain open.
- **Plan 10-R1 · 133 (2026-11-04, branch `feature/plan10-r1-qwen-preset-wiring`, not merged):** the existing Qwen CustomVoice preset path is wired to the real public provider interface. `createProviderGenerationCoordinator` accepts `request.modality:'preset'` and calls `createQwenProvider`'s real `beginSynthesis({text, voiceId, language, emotion}, {claimId, taskId})` — the Task id is context, the provider derives the preset modality from `voiceId`, and claim-only request keys are no longer sent. A new isolated test drives the real adapter over the existing Fixture worker (local Node child process, no model) once, checks the deterministic WAV SHA, saves it through 132 on the original task, and reopens the same artifact; the same test fails on the baseline as `PROVIDER_GENERATION_INPUT_INVALID`/`request.modality`. Full suite 1157/1153 pass/4 platform skips/0 fail; build unchanged. Clone/VoiceDesign, real inference, Host/UI and delivery remain open.
- **Plan 10-R1 · 132 (2026-11-04, branch `feature/plan10-r1-task-saved-binding`, not merged):** the original task now formally saves the provider result. `core/audio/task-owner.mjs` adds `saveArtifact({schemaVersion, scopeId, taskId, now, rights, artifactRef, artifactSha256, artifactByteLength})`, which runs the existing `CLAIMED → FINAL SAVED` transaction and mandatory `SaveProof` over an already-imported Artifact and moves the task record `CREATED → PROCESSING → ARTIFACT_READY → SAVED`; `core/audio/provider-generation-offline.mjs` now requires the owner handle and only reports `SAVED` after that write (`task.ownerState:'SAVED'`, same `artifactRef`). No owner/artifact schema change, no second task/asset library, no real model/process/Host/UI/delivery. The isolated `132` test fails on the baseline as `TASK_OWNER_NOT_FOUND` and passes after; reopen reads the same `READABLE` artifact/SHA. Provider unit 12/12; full suite 1156/1152 pass/4 platform skips/0 fail; build unchanged.
- **Current baseline (2026-11-04):** `main` = `135c0256023926815bfe0aa01280c13e9747ec7c` (merge of PR #51 on 2026-11-04; Plan 13-B internal Sender is merged and stays OFFLINE/FIXTURE_ONLY/NOT_INTEGRATED; first-attempt main CI failed only on the pre-existing flaky `121-R03` and attempt 2 passed). **Plan 13-B (117 revision)** was merged via **PR #51** (merge commit M above): the internal Windows delivery module maps trusted Artifact/target facts onto the *real* archived Worker ABI (`voice-sender.ps1 -Request/-JsonOut/-ProgressFile/-CancelFile/-GlobalCancelFile`, launcher `-NoProfile -ExecutionPolicy Bypass -File`), statically re-derived by `verifyWorkerAbi()` from the archived `param()` blocks/request reads/reviewed `sender.mjs`; the invented `cancel-test.ps1`/`preflight-wechat.ps1` ids are removed and cancellation goes exclusively through the reviewed per-job cancel file (requested → confirmed/unconfirmed); one delivery id is invoked exactly once under an immutable frozen fact snapshot with `DELIVERY_CONFLICT` on differing facts; missing/empty/broken/thrown worker results are indeterminate `UNKNOWN`, never a fake `preSubmit`; and `core/audio/legacy-text-delivery-offline.mjs` is the callable legacy text facade through the same generation owner → SAVED Artifact → same relay entry → same backend with no replay generation/send and no second cache/retry/registry. The 115 close-out makes the observed terminal verdict final (a late dispatch acknowledgement cannot reopen `ACCEPTED`; settled state/flags/receipt are never rewritten), binds observation to a real invocation (a queued delivery stays `QUEUED`), keeps the single execution slot owned for the whole Worker holding period, classifies malformed/contradictory evidence as `UNKNOWN` (only well-formed pre-UI refusals are `preSubmit`), and stabilises the legacy request identity on `(scope, legacyRequestId)` (changed text reuses the original result; changed target is refused by the immutable relay binding). The local bridge floating panel also received strict snapshot validation, current-vs-history projection, ordered responses and separate temporary/persistent confirmation copy. The 116 close-out separates the logical verdict from the execution lease: `UNKNOWN`, an unconfirmed cancel, a missing/empty/bad invoke result, a thrown transport and a failed device restore keep the single execution slot (`occupancy:'HELD'`) until trusted exit/recovery evidence; exceptions after the invoke boundary are `UNKNOWN` (pre-invoke ones stay `preSubmit`); a `CANCELLED_BEFORE_UI` claim contradicting `RECORDING`/`SENDING` evidence is `UNKNOWN`. The 117 close-out finishes the lease-evidence edges: pre-UI refusals no longer skip the device-recovery check, `restore_ok` is tri-state (`true`/omitted compatible, `false`/bad non-boolean held) while verdicts/receipts survive, and a late clean invoke after an observed verdict releases the slot without rewriting it. Plan 13-C native-candidate research was refreshed on 2026-11-04 (branch `docs/plan13c-native-admission-20261104`, new PR not merged): WeChatPYAPI (`05060fa`, V-9.2.1, no LICENSE, `send_voice` SILK/ms/boolean, antivirus instruction), PadChat-SDK (`f1dd594`, 2024, `package.json` v0.6.1 declares ISC but external service authorization is unknown, separate iPad-protocol service, `sendVoice` SILK base64/ms, `msgId` examples) and WeChatAgent 0.4.2 (`38c1060`, root MIT + notices for its own code, `docs/WECHAT_HOOK.md` requires separately licensed Hook/client for the complete native path, outbound text/sticker only; inbound SILK codec) were scored against the 12 admission gates — none is PROTOTYPE_READY, the original community names remain UNKNOWN, Native/auto stay unselectable. Plan 10-R1 provider generation → SAVED candidate is on `feature/plan10-r1-provider-generation` (new PR, not merged): `core/audio/provider-generation-offline.mjs` is a claim-first, versioned, fail-closed coordinator between the audited provider contract and the existing Artifact library (durable claim, duplicate/conflict/cross-scope/rights rules, cancel/UNKNOWN/late-result facts, byte re-measurement, artifact import + readback, `SAVE_UNKNOWN` tombstone without resynthesis). The Plan 08 owner SAVED entry (owner schema v3) and UI/Host wiring are NOT done. Tests: internal 29 + legacy 8 + provider-generation 8, bridge panel 16; full suite **1152 / 1148 pass / 4 platform skips / 0 fail**, build unchanged (`client.js` 314,687 chars). Still `13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; real Worker/process/device/WeChat and real TTS remain OPEN. Historical Plan 10/11 detail continues in this bullet: Plan 10's Qwen/IndexTTS/Kokoro offline candidates are merged but remain `OFFLINE` / `NOT_INTEGRATED`; real models/CPU-GPU/Chinese quality/Host/Task/Artifact remain OPEN. Plan 11's cloud/custom offline unit is on `feature/plan11-cloud-custom-providers`, independent PR #48 pending and not merged; it adds DPAPI credential storage, one atomic character-cost/free-request ledger, Azure Speech and fixed custom HTTP adapters with no real API/Host route. The 131-R01/R02/R03 close-out adds same-ID pre-transport refusal, shared-root atomic authority, bounded dedup that fails closed, explicit custom unknown/free/paid modes, and pre-cancel/non-2xx/commit-cancel cleanup. The 102 close-out adds token-owned locks that are never stolen by age, optimistic revision/retry with slow temp I/O outside the lock, live-owner PENDING protection and dead-owner UNKNOWN recovery, and paid-ledger/positive-price enforcement for Azure (free/unknown/zero-price ledgers make zero transport). Tests: 53 Plan11 offline tests; full suite 1063/1059 pass/4 platform skips/0 fail. See [CLOUD_PROVIDERS.md](CLOUD_PROVIDERS.md) and ADR-021.

Plan 12-A/APP-OFFLINE (2026-11-03): a thin Whale Singing coordinator (`core/singing-app-internal.mjs`) and a FIXTURE/OFFLINE Singing panel over the existing Cover executor/Artifact library. It is on `feature/plan12-singing-app-offline` from merged Plan11 M `16bf263e…`; PR #49 open, not merged. It uses trusted catalogs/dependencies only, one idempotency key per source/voice, same-task reconnect, bounded MASTER preview and explicit missing-adapter/realReady=false states; no real RVC/TTS/API, 13-A, 12-B/C/D, device playback or production Host write. 104 adds `start()` so status/cancel remain available while `CLAIMED`, a test/harness-only `stageDelayMs` controlled slow run, a task-ref guard for late responses, and a test-only HTTP bridge (`tests/ui/singing-bridge.mjs`) whose browser fetch adapter calls the actual `openSingingApp`/Cover executor/Fixture library; no fixed task/stage/hash returns. 105 adds a monotonic selection generation/per-operation token for create/execute/status/cancel/preview and poll success/rejection/exception/finally, plus an immutable bridge `taskId → task intent` map, so a delayed A create/rejection after selecting B cannot rebind A or give A execution rights under B. Tests: 7 new Core app tests, UI 69/69, full suite 1070/1066 pass/4 platform skips/0 fail; `client.js` 308,426 chars. See [SINGING_APP_OFFLINE.md](SINGING_APP_OFFLINE.md), ADR-022/ADR-023. Entire Plan12-A/Plan12 remains OPEN.

Plan 13-A / Unified Relay OFFLINE (2026-11-03): `core/audio/relay-core-offline.mjs` is the first persistent delivery owner after ADR-001. It consumes a *persisted* SAVED Audio Task / Cover MASTER + actual Fixture Artifact bytes read through the existing library (scope/rights/proof) + trusted target directory; computes the artifact hash/bytes/duration/format itself, mints persistent `delivery:<32hex>` and safe backend request id, maps task/delivery/backend id, uses a semantic digest (requestKey is only an alias), pins one Fake backend, uses an atomic token-locked store with token-quarantine release and global live-owner protection, requests/confirms cancel separately, re-reads artifact/target before submit, and recovers a real child-process `SUBMITTING` owner as `UNKNOWN` with no replay. 108 revision (after the 0138 review): the handoff is reference-only (a caller `taskRecord` is refused), the relay re-reads the persisted AudioTask owner v2 / Cover owner v3 authority, persists a versioned issuance (`PERSISTED_TASK_DELIVERY_INTENT` or `RELAY_ISSUED_FOR_FROZEN_COVER`), makes `requestKey` an immutable binding checked before any digest alias, re-reads authority identity/artifact/target after all awaits immediately before the Fake accept, retires the live owner only after the terminal commit, and fences every lock path by move-then-verify + create-or-fail restore. `createFakeDeliveryBackend` has capabilities/health/resolveTarget/submit/status/cancel with its own target directory and an independent submit gate (persisted delivery id/kind/backend id + its own identity/authorization/allowlist/bridge/worker), plus WAV/8MiB/15min limits; no Sender import/network/device/WeChat. `projectUnifiedRelayComponent` projects one 鲸递 item with `whale-relay`/`voice-sender` aliases and no second store. The dependency wizard and every shared dialog now mount in a plugin-owned root overlay layer inside `.wv-root` (outside `.wv-scroll`/`.wv-page`), are container-sized with an independently scrolling body, reflow from the real plugin width and keep an opaque fallback surface. Branch `feature/plan13-unified-relay-offline` from M=`42b96ce…`; PR #50 open, not merged. 109 revision (0139 review): a SAVED Cover MASTER is not a delivery permission — `issueDeliveryPermit` persists a versioned immutable source permit (scope/task/MASTER/target/rights) and a Cover `ensureDelivery` without a valid `permitId` is `PERMIT_REQUIRED`; the accept boundary re-samples the clock after the final awaited read; each commit re-reads its canonical lease token and starting store revision (stolen lease/old snapshot → `STORE_BUSY`, no write); the store gate refuses inconsistent records/indexes/permits with `STORE_INVALID` (no repair/re-mint). A real three-process lease race is replayed as a test. 110 revision (0140 review): the delivery digest is recomputed by `canonicalDeliveryDigest` from the persisted facts at creation and validation (a digest/index edited without the facts is `STORE_INVALID`, never re-accepted). 111 revision (0141 review): the store is an append-only log of immutable revision files `unified-relay-v1.r<N>.json`; a commit is the create-or-fail publication of the next revision after a fully written/fsynced temp, so there is no fixed current-store name to rename/reclaim/release and a writer whose advisory lease was moved aside can never overwrite a newer commit (it fails closed). 112 revision (0142 review): retention keeps every revision number occupied with immutable tombstones (a stale snapshot cannot be re-published as an old number) and directory enumeration failures are propagated as `STORE_INVALID` instead of looking like an empty store; dead-owner recovery is unchanged. 2026-11-04 merge: PR #50 merged with one standard Merge Commit M=`4b45ebd` (parents G=`42b96ce`/H=`f368855`, tree `10d3b97`, new main CI `41738183306` success) and the 13-B internal Windows Sender offline unit (`core/audio/internal-sender-offline.mjs` + reviewed resource closure) was started on `feature/plan13b-internal-sender-offline` (new PR, not merged): Artifact-only, own target gates, fixed whitelisted script/argv, one serial queue, injected Fixture transport, NEVER_WRITE/terminal UNKNOWN. Tests: 35 relay + 7 internal-sender tests, full suite 1114/1110 pass/4 platform skips/0 fail, UI 72/72, `client.js` 314,687 chars. See [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), ADR-024/ADR-025/ADR-026. 13-B/C, real WeChat/Sender, Plan14 and all real Plan12/13 DoD remain OPEN. The bullets below dated 2026-10-30/earlier are historical snapshots, not current main.
- **Historical main (2026-10-30):** `M 08cf0b61acc402d619618df2ad15bce5436b0873` (merge of PR #37, Plan 08-E-D/F01; tree `7a6abf13…`). E-D/F01 is `DONE` / `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `MERGED` / `NOT_INTEGRATED`; parent Plan 08 is still `IN_PROGRESS`. The owner is still `{run,get}` with `SIMULATED`/`NO_EXECUTION` FINAL only, and the artifact library still stores `FIXTURE_IMPORT` only. **Plan 08-E-E-A** adds the candidate same-claim save-transaction contract `docs/TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md` (now **v1.1**, revised per 071 R1–R3: real revision weighting `CLAIMED=1`/`FINAL=2`, old-binary v2 `STORE_INVALID`, `audio-task-owner-v1.json`, `^task:fixture-[0-9a-f]{32}$`, store constants at `fixture-artifact-store-internal:40-46`, seven-key import, eight-key save with engine `input`, strict `SaveProof` with recomputed `artifactIdentityHash`, current-rights `artifactStatus`, single owner writer with proof parameter, Artifact-queue deletion window, catalog+owner lock matrix, gates-before-success steps) — `PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED`; it is not a runtime or code authorization, and **v1.2** (072) then calibrates the real source lines (engine 994/971/755/761/769-782, library writer 715/800-838/845/851-873 with :889 = INTERNAL_FAILURE, Task writer 803/869-885/889/895-918), makes the internal SaveProof a mandatory CLAIMED→SAVED delta rule, completes the four-method/status protocol and one consistent example set, and fixes the non-reentrant importInQueue primitive plus the base dependency closure. **v1.3** (073) then separates claim vs candidate versions, makes the 791-byte CLAIMED example reproducible (`e30bee44…`), upgrades SaveProof to two-sided operands with the 19-key inspection, restores the exact `run`/`get` EXISTING/FOUND semantics, adds the standalone `artifactStatus` schema, the full compatibility table, the module/signature DAG (`readStoredForSave`/`importInQueue`) and an 18-category failure matrix with separate claim/FINAL/artifact rename counts. **v1.4** (074) then restores the mandatory CLAIMED→SAVED delta and the strict 11+8-key `SaveProof` (with `evaluatedAt`), adds the 12-key save success value, the 6-key `artifactStatus` priority table, the 22-code/fact-mapping tables, the fixed `writeOwner(...,proof)` path, the `readStoredForSave` contract, the base re-export/edge table and nine real-fs fault representatives with attempt/success counts. **v1.5** (075) then corrects the budget provenance, adds the proof field/limit table, the general input/projection/failure protocol, the migration symbol table, FC/FS/FT/FA fact IDs, the corrected FINAL-rename count, the discovery-phase table and the per-representative evidence table with C/O1/O2/A1/OF/AF and R/E-I counts. **v1.6** (076) then fixes the fact-ID consistency: FC=CLAIMED, FS=FINAL SAVED only, no IDs on no-entry/old FINAL rows, FA layered on the existing Task fact, joint-confirmation split into Task/Artifact first errors, and §8.1/§8.2 referencing the exact discovery events. Runtime still not implemented; implementation needs a separate formal plan.
- **Plan 08-E-D branch:** `feature/plan08e-task-bytes` extends the single internal engine (`core/audio/task-fixture-engine-internal.mjs`) with a sixth export `runExistingFixtureTaskBytesOnce(frame)` plus frozen `TASK_FIXTURE_BYTES_ERRORS` (UNREPRESENTABLE_DURATION / RESOURCE_LIMIT / DEPENDENCY_FAILURE; D01–D07 / 7 tests). In the same accepted flow, after the real Fake SUCCESS validation and before the old ATTACH, it derives one bounded producer request from the verified 44100 Hz `durationMs` (integer frames first, then the 1 MiB budget: 10/1000/11880 ms → 926/88244/1047860 bytes; 1 ms and 11890 ms are refused before any producer call), calls the real 08-E-C producer once behind a native-slot 9+19-key guard, then performs one `BEGIN_PROCESS` and returns a frozen private `{record, result, production}` — `PROCESSING`, `outputArtifactRef=null`, `hasOutput=false`, SIMULATED envelope with fixed message, production = the producer's own value. No ATTACH/SAVED/second Task; producer failures are one DEPENDENCY_FAILURE with null record/production; legacy paths and non-SUCCESS results are unchanged with zero producer calls. Tests 7; suite **703 / 700 pass / 3 platform skips / 0 fail**; build unchanged. `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `NOT_INTEGRATED`, new PR open and unmerged; the owner/save transaction is intentionally not implemented. **E-D-F01 (067)** then closes the three review groups inside the same private flow: R1 makes every bytes-entry exit exactly `{record, result, production}` with a frozen root, so the four legal source/readiness/TTS/dispatch blocks return `production:null` (previously a two-key root with `production` `undefined`) while `record`/`result` stay byte-for-byte equal to the legacy entry and the legacy two-key root stays unchanged; R2 switches the thin carrier guard to native internal slots only (`%TypedArray%` `@@toStringTag`/`length`/`byteLength`/`byteOffset`/`buffer`, `ArrayBuffer` `byteLength`/`resizable`/`detached`, prototype identity), so `Int8Array` and resizable `ArrayBuffer` are one `TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE/$` with `transition=0` and an own `byteLength`/`@@toStringTag` getter is never executed (0 calls, accepted because the native slots still prove a complete legal carrier); R3 deep-compares the full record and result, adds a legal TTS control, passive construction observation (0 engine views, 1 producer output + 1 inspector copy, 0 on refusals), accessor/conflict/invalid-record/rights/`SAVED`/`UNKNOWN` representatives and one complete executable frame in the internal doc that the test runs verbatim. Tests stay 7; suite **703 / 700 pass / 3 platform skips / 0 fail**; still `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `NOT_INTEGRATED`, PR #37 open and unmerged; E-D overall remains `IN_PROGRESS` until the 067 review accepts the new head. **E-D-F01 v1.1 (068)** then closes the remaining in-repo automatic evidence with product code unchanged: the three post-bytes rejections are actually executed and each wrapper performs its single real delegation first (fault hits 1, per-stage `real*`/`realOk` counts, `source/gate/dispatch/RVC/producer` each 1, `create=0`, `actions=['BEGIN_PROCESS']`, original record strictly `null`, `production` strictly `null`, original `TASK_FIXTURE_TASK_TRANSITION_REJECTED/$`); D04's nine existing cases pin the three-key frozen root, `production:null`, the fixed `phase`/`reason` and absolute counts, and the worker records raw `hasOwn(record)`/`record === null` before normalisation; the own `byteLength`/`@@toStringTag` getters now target the produced ArrayBuffer carrier (0 calls, `PROCESSING`/`transition=1`, same carrier, no copy). Tests stay 7; suite **703 / 700 / 3 platform skips / 0 fail**; still `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `NOT_INTEGRATED`, PR #37 open and unmerged, F01 awaiting 068 acceptance.
- **Plan 08-E-C branch:** `feature/plan08e-fixture-wav-producer` adds `core/audio/fixture-wav-producer.mjs` (4 exports: `FIXTURE_WAV_PRODUCER_SCHEMA_VERSION`, frozen `FIXTURE_WAV_PRODUCER_LIMITS`, frozen `FIXTURE_WAV_PRODUCER_ERRORS`, `produceFixtureWav`; 7 fixed codes; C01–C08 / 8 tests). One synchronous pure call builds a real 44-byte-header PCM16 WAV from exactly five own enumerable data fields, budget-first (`frameCount <= floor((1048576-44)/(channels*2))`: mono 524266 / stereo 262133 exactly 1 MiB) before allocation, with `SILENCE` and the fixed `EDGE_SEQUENCE` `[-32768,-16384,0,16384,32767]` interleaved across the sample index. The finished bytes are re-checked once by the real 08-E-A inspector behind a descriptor-only 19-key guard; any protocol/measurement failure is `DEPENDENCY_FAILURE` with no bytes and no retry. Success returns frozen `{ok,value}` with `origin: SYNTHETIC_FIXTURE`, a fresh mutable `Uint8Array`, the deep-frozen inspection and four fixed safety flags — no Task/Artifact/delivery id, no Task read/write, never a TTS/RVC result or ownership proof. Tests 8; full suite **696 / 693 pass / 3 platform skips / 0 fail**; build unchanged (`client.js` identical). `OFFLINE` / `SYNTHETIC_FIXTURE` / `NOT_INTEGRATED`, new PR open and unmerged. The F01 v1.1 close-out makes the 08-E-A inspector message comparison strict (exact fixed Chinese text, not merely non-empty) with a seventh C06 fault, records real output `Uint8Array` construction passively in C04 (two legal 1 MiB views identical to the returned `bytes`, three rejects with zero output/inspection, the inspector's internal copy counted separately and worker state restored in `finally`), and adds the C08 `maxByteLength === ARTIFACT_LIBRARY_LIMITS.maxItemBytes` alignment assertion; tests stay 8, full suite stays 696/693/3.
- **Plan 08-E-B branch:** `feature/plan08e-artifact-library` adds `core/audio/artifact-library.mjs` (4 exports: `ARTIFACT_LIBRARY_SCHEMA_VERSION`, frozen `ARTIFACT_LIBRARY_LIMITS`, frozen `ARTIFACT_LIBRARY_ERRORS` with 16 codes, `openFixtureArtifactLibrary`) and the private `core/audio/fixture-artifact-store-internal.mjs`. One isolated single-pack library (`audio-artifacts-v1.json`) over a trusted capability: a synchronous pre-queue owned copy of a real `Uint8Array`/`Buffer` view, one 08-E-A re-inspection of the exact bytes that get encoded, a canonical STORED entry with `origin: FIXTURE_IMPORT`, scope/rights/expiry gates, `(scope, requestKey)` idempotency (`EXISTING`/`KEY_CONFLICT`, birth time never rewritten), `artifact:fixture-bytes-<32hex>` ids with a 3-attempt collision bound, independent mutable `readBytes` copies, `DELETED` tombstones without payload, a shared confirmed digest and one UNKNOWN lock. The pack is replaced atomically (current digest → wx temp → short-write completion → fsync → one close → temp read-back → single rename → identity/bytes/Schema/revision read-back) with one-shot cleanup of its own temp: pre-rename failures are `WRITE_REJECTED`, rename-attempt/commit uncertainty is `WRITE_UNKNOWN` with the actual bytes kept and every handle locked. Budgets: 1 MiB per item, 4 MiB total decoded bytes, 32 entries including tombstones, 6 MiB pack. The F01 close-out (060) shares **one** identity algorithm between import and the pack parser, so every STORED/DELETED entry's `identityHash` is recomputed from its own fields (`STORE_INVALID`, no repair); it re-confirms the captured temp (trusted path/identity/nlink/full bytes) after the last current read and immediately before the single rename (`STORE_CHANGED` + lock, zero rename, old pack kept, foreign temp never cleaned); and it makes any extra public confirmation failure after a committed delete `WRITE_UNKNOWN` with the shared lock and the real tombstone kept. The 061 v1.1 follow-up keeps that final-temp re-read inside the same classification: an oversize foreign temp (6 MiB+1) at that exact window is `STORE_CHANGED`/`$`, not `RESOURCE_LIMIT`, with zero rename, the old pack unchanged, the foreign temp retained byte-for-byte and every handle locked; user/item/total/official-pack budget errors keep `RESOURCE_LIMIT`. L01-L11 groups / 22 tests (local 21 pass + 1 platform skip + 0 fail; skips are explicit platform limits); full suite **688 / 685 pass / 3 platform skips / 0 fail**; build unchanged (`client.js` identical). `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; same PR #35, merged into `main` at **M `78c3ea035e1c0a9e18d788503d9e65936022e505`** (report 0058), branch `feature/plan08e-artifact-library` kept at H2 `0dc7af9`. No Task save/ownership, delivery, Host/GUI, cross-process lock, real media or physical erase.
- **Plan 08-E-A branch:** `feature/plan08e-wav-bytes` adds `core/audio/wav-byte-inspector.mjs` (4 exports: `WAV_BYTES_SCHEMA_VERSION`, frozen `WAV_BYTE_LIMITS`, frozen `WAV_BYTE_ERRORS`, `inspectFixtureWavBytes`). One synchronous storage-free inspector: native-slot Uint8Array/Buffer brand check (Proxy/forged/detached/resizable/SharedArrayBuffer/DataView/other typed arrays rejected), owned copy of the view's exact offset/length, complete RIFF/WAVE walk inside 50 MiB / 300000 ms / 128-chunk budgets with six sample rates and 1-2 channels, PCM16 only, and a deep-frozen 19-key measurement (`frameCount`, unrounded `durationMs`, `peak`, `fullScaleSampleCount`, whole-file SHA256) or one of 8 fixed `WAV_BYTES_` codes. F01 then classifies a genuinely detached backing buffer as `WAV_BYTES_INVALID_BYTES`/`bytes` (empty `Uint8Array` stays `INVALID_CONTAINER`) through a species-free probe (`ArrayBuffer.prototype.detached`, else an intrinsic zero-range view) that never reads the caller constructor/`@@species`, passes the W06 carriers at the real native level, adds a legal exactly-50 MiB success control and seven inner chunk-representative refusals. New W01-W08 tests 8; full suite **666 / 664 pass / 2 platform skips / 0 fail**. `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; merged via PR #34 at **M `55675a7`**.
- **Plan 08-D-C branch:** `feature/plan08d-task-owner` adds `core/audio/fixture-task-store-internal.mjs` (one private shared store: catalog file + owner file, per-capability serial queue and shared unknown lock, per-file confirmed digests) and `core/audio/task-owner.mjs` (`TASK_OWNER_SCHEMA_VERSION`, frozen `TASK_OWNER_ERRORS` with 14 codes, `openFixtureTaskOwner({sandbox})` -> frozen `{run, get}`). One accepted attempt per catalog birth task: atomic `CLAIMED` snapshot of the real birth record, one existing-record engine call, validated immutable identity, `FINAL` snapshot with `SIMULATED`/`NO_EXECUTION` completion and revision weights 1/2; repeats/reopen only read, confirmed-claim tombstones report owner `UNKNOWN`, corrupt/externally changed stores are rejected without repair. The F01 close-out adds fresh restricted birth/association re-reads at the factory, `run`/`get` and the after-claim/after-engine/after-FINAL checkpoints, the thin engine guard requiring the frozen 13-key value plus complete `projectAudioTask` equality, the fixed first-attempt `TASK_OWNER_EXECUTION_UNKNOWN` (later reads keep the safe UNKNOWN projection, engine 0), and a store that binds only its two fixed files (no caller name/budget/parser, illegal domain rejected before any I/O). The v1.1 close-out adds the owner write transaction's own current/pre/post association re-reads (a legal birth change after the FINAL temp fsync and before its rename stops the commit and keeps the confirmed CLAIMED bytes with the real source and the shared lock), an association failure that now locks the capability for owner **and** catalog handles (a legitimate `NOT_FOUND` still locks nothing), and a data-descriptor guard on `value.task` so a `state` getter is never called and hidden/Symbol keys are rejected before the comparison with the real `projectAudioTask` result. D-C owner tests 20 (C01–C08, C10, T01–T06, E01–E05); specialty 113 (112 pass + 1 platform skip); full suite **658 / 656 pass / 2 platform skips / 0 fail**, UI **24/24** (same UI tree; CI re-runs it). `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; PR #33 open, not merged.
- **Plan 08-D-B branch:** `feature/plan08d-record-reuse` adds the single internal engine
  `core/audio/task-fixture-engine-internal.mjs` (four exports) and turns `task-fixture-runner.mjs`
  into a compatibility facade. `runExistingFixtureTaskOnce({scopeId, record, input})` reuses a
  complete initial `CREATED`/`BLOCKED_RIGHTS` record with its original TaskId/scope/`observedAt`;
  it never calls create, never reconstructs a record from the projection and never persists a
  claim. Internal `{record, result}` keeps the full record private; the public 13-key envelope and
  three legacy exports are unchanged. The F01 v1.6 evidence close-out keeps product code read-only
  and splits the test-only worker **entry** (existing / internal draft / actual public) from the
  injected **fault**, deriving the `final` record-validator call index from the real entry; it adds
  the three-stage legal-refusal vs bad-protocol matrix, measured `depth12`/13 partition bounds, the
  legal cross-scope voice library (`VOICE_ASSET_PROFILE_UNAVAILABLE`), legal eight-domain identity
  controls, the `REMOTE` readiness policy, full-graph output isolation and the gate/dispatch vs
  RVC-result error split. The v1.7 patch makes every validator wrapper delegate to the real validator
  with the original arguments first and only inject after a real `ok:true` control, separates input
  delete / success-payload delete / `undefined` as three sources, drives the same eight protocol
  kinds through the existing/draft/public `final` entry, and adds worker counts for three existing
  legal frames plus `REMOTE` negative, owner value-budget and per-object record frozen-state
  assertions. D-B tests 28; full suite **638 / 636 pass / 2 platform skips / 0 fail**,
  UI **24/24** (same UI tree; CI re-runs it on the new head). `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; PR #32 still OPEN, no cross-call idempotency,
  recovery, Host/GUI or real generation.
- **Plan 08-D-A branch:** `feature/plan08d-task-catalog` adds `core/audio/task-catalog.mjs` — an
  isolated persistent catalog over the trusted temporary sandbox that stores only initial
  `CREATED`/`BLOCKED_RIGHTS` records, issues owner `task:fixture-<32hex>` ids and prevents duplicate
  creation by `(scopeId, idempotencyKey)` (three exports, 15 fixed codes, D01–D20 + F01–F05 +
  R01–R03 + S01–S03 + C03a–C03h / 45 tests, 44 pass + 1 platform skip). One fixed bounded file,
  per-capability queue, bounded fd reads, full short-write completion, atomic
  temp+fsync+rename+read-back, post-commit identity checks, close-failure phase propagation, one
  close per open lease, cleanup trust-failure classification, one-shot cleanup eligibility,
  temporary-file ownership behind a full trust gate, corruption-before-change priority and
  `WRITE_UNKNOWN` locking; the 035–038 storage-boundary repairs are included, pending re-review.
  No execution, save, delivery or cross-process recovery. `OFFLINE` / `FIXTURE_ONLY` /
  `NOT_INTEGRATED`. Full suite **610 / 608 pass / 2 platform skips / 0 fail**, UI **24/24**.
- **Plan 08-C branch:** `feature/plan08c-task-fixture-runner` adds `core/audio/task-fixture-runner.mjs`
  — one synchronous composition of the 08-B source check, the 06-D pure readiness gate, at most one
  existing RVC Fixture dispatch and the existing AudioTask v1 create/transition/validate/project
  actions (three pure exports, 14 fixed codes, C01–C20 / 20 tests). Success ends at the existing
  `ARTIFACT_READY` with a Fake reference only; TTS stays an explicit unsupported block; no bytes,
  save, Relay, queue, GUI or Host route. `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; merged via
  PR #29 at **M `b9f663c`** (report 0026). Full suite **565 / 564 pass / 1 platform skip / 0 fail**,
  UI **24/24**.
- **Plan 08-B branch:** `feature/plan08b-source-artifacts` adds `core/audio/source-artifacts.mjs` — a
  strict Fixture source-Artifact library plus one resolver that reuses the 08-A voice binding exactly
  once and compares TTS text (code-unit strict) or RVC input-audio metadata (four fields) with the same
  request (four pure exports, 18 fixed codes, S01–S22 / 25 tests). `OFFLINE` / `FIXTURE_ONLY` /
  `NOT_INTEGRATED`; merged via PR #28 at **M `3182ca1`** (report 0024); no bytes/codec/hash/peak,
  dispatch, task transition, queue, GUI or Host route. Full suite **545 / 544 pass / 1 platform skip /
  0 fail**, UI **24/24**.
- **Plan 08-A branch:** `feature/plan08a-voice-assets` adds `core/audio/voice-assets.mjs` — a strict
  Fixture shared-voice-asset library plus an explicit Provider binding resolver over the existing
  AudioTaskDraft v1 and 06-B negotiation (four pure exports, 27 fixed codes, V01–V26 / 28 tests).
  `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; merged via PR #27 at **M `df4e4b7`** (report 0022);
  no dispatch, task advance, Artifact, TTS text linking, queue, GUI or Host route. Full suite
  **520 / 519 pass / 1 platform skip / 0 fail**, UI **24/24**.
- **Plan 06-D branch:** `feature/plan06d-provider-readiness` adds
  `core/audio/provider-readiness.mjs` — a Fixture installation/resource admission wrapper over the
  06-B negotiation and 06-C dispatch (PRESENT/ABSENT/UNKNOWN, CPU/GPU/REMOTE, optional single existing
  RVC dispatch) with D01–D27. Plan06-D-F01 adds the D27 cross-category evidence table and controlled
  reason-namespace clarification (docs-only). `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; full suite
  **492 / 491 pass / 1 platform skip / 0 fail**, UI **24/24**. PR #26 merged at **M `a1bdcbb`**
  (report 0019); no real installer, hardware probe, TTS synthesizer, queue or 08 mapping.
- **Plan 06-C branch:** `feature/plan06c-rvc-fake-dispatch` adds `core/audio/provider-dispatch.mjs`
  (one synchronous RVC Fixture dispatch over 06-B negotiation + existing RVC Fake gateway + existing
  result validator) and `core/audio/fixture-input-boundary.mjs` (shared internal copy/freeze helper),
  with T01–T26 + F01/F02. After the F01/F02 review repair (complete-envelope freeze, null-prototype
  copy): `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; full suite
  **465 / 464 pass / 1 platform skip / 0 fail**, UI **24/24**. PR #25 merged at **M `b9336fb`**
  (report 0016); TTS dispatch, 08 mapping, real provider/model/audio/task/send remain unimplemented.
- **Plan 06-B branch:** `feature/plan06b-provider-instances` adds `core/audio/provider-instances.mjs`
  (Fixture provider-instance view + explicit capability negotiation) and R01–R30 + N01–N18. After the
  Plan06-B-F01 review repair: `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`; full suite
  **431 / 430 pass / 1 platform skip / 0 fail**, UI **24/24**. PR #24 merged at **M `ad25bc6`**
  (report 0013); no real provider, adapter, model, synthesis, scheduling or send capability.
  The older TTS-A bullets below are historical.
- **main HEAD:** `20909433f7d530e98fe06e7832da4b21561196d4` (merge of PR #30, Plan08-D-A); verify
  live with `git rev-parse origin/main`. The earlier `f09115f` was the PR #31 baseline, `b9f663c`
  the PR #29 baseline, `3182ca1` the PR #28 baseline, `df4e4b7` the PR #27 baseline and `bf9cf66`
  the PR #15 baseline; the older `pre-pr3-8-integration` backup tag is `b552ac0`.
- **Current development branch:** `feature/tts-provider-neutral-contract` (TTS-A audit + pure
  provider contract/registry/v2 migration design + isolated tests), branched from `main` at
  `bf9cf66`. TTS-A is design/`OFFLINE`; no real provider, Host route, credential store or production
  config change. **PR #16 open**, not merged; **0 GitHub reviews** recorded. Engineering HEAD is
  `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773` (Plan 02 F01–F05); a later documentation-sync commit is
  recorded separately in the PR history.
- **Current local HEAD:** verify live with `git rev-parse HEAD`; TTS-A adds `core/tts/*` and
  `core/svc/*` pure modules, tests and docs, but no runtime/provider wiring.
- **Worktree:** clean at the TTS-A Plan 03-A pre-merge checkpoint
- **Remote:** `https://github.com/qianqiucn/dsh-whale-voice.git`

PRs #1/#2 and feature/docs PRs #3–#15 are merged. Phase 4B-1 and 4B-2A are merged but remain
`OFFLINE`; Phase 4B-2B-1 is `AUDIT COMPLETE` / `OFFLINE`; Phase 4B-2B-2a is `INTEGRATED` after real
Host/GUI acceptance (full eight-page coverage, not `VERIFIED` for destructive edge cases); Phase R1
is **COMPLETE**. TTS-A is `DESIGN`/`OFFLINE` with all provider candidates `NOT_IMPLEMENTED`. No
production write route or real TTS provider exists.

**PR #16 pre-merge checkpoint (Plan 03-A):** engineering HEAD `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773`;
CI run `40163881122` build+ui **SUCCESS**; Node **197** (196 pass, 1 platform skip); UI **24/24**;
F01–F05/N01–N05 complete. The earlier 192/191/1 count is a **historical pre-F01–F05 snapshot**. PR is
**OPEN, not merged**; CI is not human approval. Merge requires separate explicit user authorization.

**PR #16 pre-merge repair (Plan 03-A-F01, 2026-10-26):** SVC input boundary hardened (fixed-layer
descriptor checks, no getter/Symbol/hidden bypass, strict result/delivery allowlists, redacted
`<unknown-key>` paths, canonical UTC `createdAt`, fresh output objects). SVC tests **29/29** (original
5 + R01–R24); full `node --test` **221 / 220 pass / 1 platform skip**; TTS provider **16/16**; UI
**24/24**; `node build.mjs` passes and `client.js` is unchanged. PR #16 remains **OPEN, not merged**;
merge recommendation is **`BLOCKED_PENDING_SVC_FIX`** until the repair HEAD is reviewed and its own
build/ui CI is verified. No provider, SVC runtime, model, download, send or WeChat capability was
added; the 197/196/1 numbers remain the historical checkpoint for the earlier HEAD.

---

## 3. Merged PR chain

```text
main
  └─ #3 → #4 → #5 → #6 → #8 → #7 → #9 Phase 4B-1 → #10 R1 audit → #11 R1 status → #12 4B-2A → #13 4B-2A handoff → #14 4B-2B-1 audit
```

| PR | Merge commit | Result |
|---|---|---|
| #3 | `7b66dca` | merged; setup wizard |
| #4 | `91929fd` | merged; read-only Core / Host bridge |
| #5 | `9688ff8` | merged; Phase 4A config read |
| #6 | `95a3528` | merged; isolated UI harness + CI `ui` |
| #8 | `5c4bc56` | merged; Send & Safety + research + docs repair |
| #7 | final documentation merge | merged; Inspector research + docs union |
| #9 | `97e96b5` | merged; Phase 4B-1 isolated config write foundation |
| #10 | `70c0756` | merged; Phase R1 docs/status reconciliation and non-runtime hygiene |
| #11 | `8abf031` | merged; R1 final status baseline |
| #12 | `a7a3056` | merged; Phase 4B-2A isolated coordination protocol |
| #13 | `e0ce035` | merged; Phase 4B-2A handoff baseline (docs only) |
| #14 | `9318686` | merged; Phase 4B-2B-1 capability audit + schema v2 fixtures |

The Phase 3/4 stack (#3–#8) was integrated in order. Phase 4B-1 (#9), R1 (#10/#11), Phase 4B-2A
(#12), the 4B-2A handoff (#13) and the 4B-2B-1 audit (#14) were merged with Merge Commits after
explicit authorization. **0 human reviews** were recorded for #9–#14 on GitHub at merge time; CI
green is not approval.

Phase 4B-1 consists of `core/config-sandbox.mjs`, `core/config-schema.mjs`, `core/config-store.mjs`,
`core/isolated-write-server.mjs` and `test/config-store.test.mjs`. Phase 4B-2A adds
`core/config-coordinator.mjs` and isolated fixture tests. Both are merged but remain `OFFLINE`; no
production write route exists.

---

## 4. Completed stages and acceptance levels

| Area | Status |
|---|---|
| Phase 3B real DSH Host | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A read-only config | **INTEGRATED** (not `VERIFIED`) |
| Phase 4A-H safety contract fixes | Merged in #4/#5/#8; current 98-test suite includes these contracts |
| Isolated Playwright UI Inspector | Merged in #6/#7/#8; 12/12 UI checks |
| Send & Safety frontend | `MOCK` / disabled backend controls; real DSH GUI visual acceptance PASS |
| Native voice delivery | `RESEARCH_CANDIDATE`; WeChatAgent native = `UNSUPPORTED` |
| Phase 4B-1 isolated config write | **Merged into `main`; `OFFLINE`** — single-file store + test-only API; no production write |
| Phase R1 repository audit | **COMPLETE** — PR #10/#11 merged; docs/status and non-runtime hygiene |
| Phase 4B-2A coordination protocol | **Merged into `main`; `OFFLINE`** — isolated source adapters, journal/recovery, save/apply split, Fake Runtime; no production write |
| Phase 4B-2B-1 component capability audit | **`AUDIT COMPLETE` / `OFFLINE`** — real read timing, write interfaces, revision/apply evidence and blockers; no production write |
| Phase 4B-2B-2a capability/status projection | **`INTEGRATED`** — real DSH Host/GUI, schema v3, eight-page coverage; read-only, no write route; not `VERIFIED` for destructive edge cases |
| Phase 4B-2B-2b Sender automation write | **NOT STARTED** |
| TTS-A Provider-neutral audit/contracts | **`DESIGN` / `OFFLINE`** — audit + pure contract/registry/v2 migration + isolated TTS/SVC tests; 10 TTS candidates and 2 separate SVC candidates, all `NOT_IMPLEMENTED`, no Host wiring |

Real GUI evidence exists for the Send & Safety page; it does **not** mean the Windows safety backend
exists.

---

## 5. Current task

This task is **TTS-A: Provider-neutral audit and architecture design**.

Scope:

- audit Qwen hardcodes in the detector/config/capabilities/coordinator/UI into Qwen-specific,
  current-selection and generic-TTS categories ([TTS_PROVIDER_AUDIT.md](TTS_PROVIDER_AUDIT.md));
- define a provider-neutral interface, 10 TTS candidates (including IndexTTS, Gemini TTS and OpenAI
  Speech), a separate SVC candidate registry (Seed-VC/RVC), unified synthesis result and delivery
  boundary, and three-layer Core/Relay/WeChatAgent responsibilities;
- add pure `core/tts/provider-contract.mjs`, `provider-registry.mjs`, `provider-config.mjs` and
  `core/svc/svc-contract.mjs`/`svc-registry.mjs`; no I/O, no provider network, no Host route, no
  production config;
- add isolated tests for local/cloud fake status, Qwen-offline independence, unsupported
  voice/emotion, missing credentials, timeout/error, unknown version, migration, Mock/real isolation
  and the no-WeChat-send result boundary.

TTS-A does **not** implement a real provider or GUI provider switcher. TTS-B is the next
implementation step; TTS-C is real adapters/credentials. Phase 4B-2B-2b remains separate and NOT
STARTED.

---

## 6. Unresolved issues

1. **0 human reviews** were recorded for PR #9–#14 on GitHub at merge time; CI green does not equal
   approval.
2. Phase 4B-2A is a merged but `OFFLINE` protocol prototype using in-memory fixture adapters and Fake
   Runtime. Production source adapters, real runtime confirmation, cross-process CAS and production
   apply are **NOT STARTED**.
3. Phase 4B-2B-1 found **no supported write interface** for the Bridge and no loaded-revision API in
   any component; Sender supports automation `PUT` only, WeChatAgent has a human console with three
   unshared writers. `APPLIED` is unreachable today; production writes remain blocked.
4. Phase 4B-2B-2a is `INTEGRATED` after real DSH Host/GUI acceptance; destructive No-Core/timeout/
   invalid-schema injections and Console/Network reading remain unverified. It is not `VERIFIED`.
5. Phase 4B-2B-2b (Sender automation write) is **NOT STARTED** and needs separate authorization.
6. TTS-A provides design-only provider contracts. No real local/cloud/custom adapter, credential
   store, provider request, provider switcher or production TTS integration exists.
7. Safety backends (hotkey, cancel/recovery, window discovery/focus, game detection) are not
   implemented.
8. Native voice delivery candidates remain unintegrated and unverified.
9. Live No-Core/timeout/invalid-schema/stale GUI injections remain `OFFLINE` tests.
10. Real DSH Electron DOM/CSS/Console cannot be read without separate authorized debugging; current
    GUI acceptance used UIA + screenshots.

---

## 7. Verified component capabilities

- Real DSH Host route and token-protected `window.__WHALE_SETUP__` bridge.
- Read-only config snapshot:
  - Bridge voice enabled/mode/trigger/group/probability/default voice
  - Worker final-safety permit as a separate layer
  - TTS provider, saved voice/model, runtime model/voice
  - Permission **counts only** (no names)
  - Sender offline/health/unknown separation
  - Saved vs active state separation
- Full-origin (`scheme + host + port`) request guard shared by Host and isolated Core server.
- Bounded streamed health/config reads; no unbounded fallback body read.
- Explicit-only `accountVerified`; account object alone stays unknown.
- Opaque process-keyed config revision covering voice/worker/TTS/permission/source fields.
- Phase 4B-1 isolated store: trusted sandbox capability, strict v1 schema, pure v0→v1 migration,
  HMAC revision, `expectedRevision` conflict detection, single-file atomic save/verify/rollback,
  sanitized public projection, read/write state separation and a test-only loopback API. No production
  write route.
- Phase 4B-2A coordination protocol: isolated plan/journal/recovery over fixture source adapters,
  Bridge/Worker separation, `SAVED`/`PENDING_APPLY` vs `APPLIED`, exact saved/runtime revision match,
  and rollback confirmation by reported revision plus read-back observation. No production adapter.
- Phase 4B-2B-1 audit: Bridge hot-reads `voice-settings.json` per call with no writer or revision;
  Sender reads config at boot, supports automation `PUT` only (plain full-file write, no revision;
  owner API exists but Core has **no production write authorization**); WeChatAgent console has a
  SHA-256 saved-file revision but CLI/account-switch writers lack a shared CAS; no component exposes
  a loaded revision. Owner API, authorization, save capability and apply confirmation are separate
  (`save.enabled` is derived); no source can reach `APPLIED` today.
- Phase 4B-2B-2a projection: schema v3 with surface-level `readTiming`/`hotReload`/`requiresRestart`
  (automation `RUNTIME_API/FULL/NOT_REQUIRED` vs TTS `SERVICE_BOOT/NONE/REQUIRED`); Host GET
  `/capabilities` and `/capabilities/status`; static audited contract + detector/config observation;
  version mismatch/unknown downgrades reload fields and capability to `UNKNOWN`; **Worker version is
  independent — no Worker version identifier means `UNKNOWN`, and the Sender Service version is never
  used as Worker evidence**; Worker keeps `NEVER_WRITE` and writes disabled while Sender
  automation/TTS stay governed by the Service version. Read-only only.
- Isolated Playwright harness with fake setup bridge; no production DSH/WeChat connection.
- **Historical pre-F01–F05 snapshot:** 192 Node tests (191 pass, 1 platform skip; including 49
  coordination, 5 capability, 7 capability-schema, 9 capability projection, 10
  capability-reader/validation, 12 TTS provider and 4 SVC contract/registry tests) and 24 UI checks.
- **Current PR #16 Plan 02/03-A checkpoint:** 197 Node tests (196 pass, 1 platform skip; 16 TTS +
  5 SVC tests after N01–N05) and 24 UI checks. These remain offline/contract evidence, not real
  production write/apply or real provider/SVC acceptance.

---

## 8. Mock / not implemented

Do not present these as working:

- global emergency-stop hotkey or listener;
- real task cancel/device recovery;
- WeChat window discovery, auto-focus or target identity validation;
- fullscreen/game detection and pause policy;
- automatic Qwen startup;
- native voice delivery (`wechatagent-native` or `third-party-native`);
- production configuration write/apply API (Phase 4B-1/4B-2A are isolated only; 4B-2B-1/2a added no
  write path or write control);
- owner-side config write/revision APIs for Bridge, Sender TTS and WeChatAgent;
- production source adapters, real multi-file journal durability and cross-process CAS;
- actual TTS preview/cloud provider;
- real group voice;
- production installer/update/rollback.

---

## 9. Critical safety boundaries

- No production configuration writes without a separate explicit authorization.
- After the 4B-2B-1 audit: do **not** write component-owned configuration files directly. Use the
  owner's supported API; keep Bridge and WeChatAgent read-only until those APIs exist; never treat
  `/health`, mtime, PID or equal file bytes as apply proof. An available owner API is not a write
  authorization; `save.enabled` requires both plus a supported save and an authorized write mode.
- The 4B-2B-2a capability routes are GET-only projections. They reuse the existing loopback, Origin,
  Host, token and `connection` guard and must never gain a write branch, arbitrary path/URL/query or
  private target data.
- Phase 4B-1 store/API must remain isolated: only a trusted sandbox capability may be used; never
  point it at production directories or register its write route on the Host without separate
  authorization. No silent overwrite; use `expectedRevision`. Do not claim a multi-file transaction
  from separate single-file renames.
- Never modify `voice.enabled`, Worker safety permit, whitelist, target maps or audio devices as part
  of development/tests.
- No real WeChat text/voice send without explicit authorization and the existing safety gates.
- `UNKNOWN` is terminal for automatic resend.
- Never automatically switch native/UI Automation backends after a possible send.
- Never weaken Host authentication, Origin checks, token checks, loopback constraints or
  `Sec-Fetch-Site` handling to make tests pass.
- Never read Hook/audit tokens, chat databases, private target maps or credentials.
- No DSH/WeChatAgent/WeChat/Sender/Qwen restart without authorization.
- No global hotkey, focus takeover or driver/audio-device change from this repository.
- UI Inspector must use isolated Playwright; production Electron debugging requires separate
  authorization.
- No PR auto-merge.

---

## 10. Tests and recent results

Latest full local run (2026-11-03, Plan13-A 108 revision):

```text
build: PASS, client.js 314,687 chars
node --test: 1114 tests / 1110 pass / 4 platform skips / 0 fail
node tests/ui/run.mjs: 72/72 PASS
```

Commands:

```powershell
node build.mjs
node --test
npm.cmd run test:ui
```

Phase 4B-2B-2a result (historical pre-F01–F05):

```text
build: PASS, client.js regenerated (in sync)
node --test: 191/192 PASS (1 platform skip; includes 49 coordination, 5 capability, 7 schema, 9 projection, 10 reader/validation, 12 TTS provider and 4 SVC tests)
UI: 24/24 PASS
```

Current PR #16 checkpoint (Plan 02/03-A):

```text
build: PASS, client.js 217349 bytes (in sync)
node --test: 196/197 PASS (1 platform skip; includes 16 TTS and 5 SVC tests)
UI: 24/24 PASS
CI: run 40163881122 build+ui SUCCESS at engineering HEAD 3ad32bc
```

These are offline/contract tests. They do not prove a production Bridge/Worker apply, real WeChat
send, real provider/SVC, or production configuration-write acceptance.

CI:

- PR #9 head `f54538c`: build + ui SUCCESS (run `40143287505`);
- PR #10 head `c1e35de`: build + ui SUCCESS (run `40144453337`);
- PR #11 head `5b98152`: build + ui SUCCESS (run `40145543671`);
- PR #12 head `c99e0c4`: build + ui SUCCESS (run `40148228220`);
- `main` at `70c0756` after PR #10: build + ui SUCCESS (run `40144888398`);
- `main` at `8abf031` after PR #11: build + ui SUCCESS (run `40145762507`);
- `main` at `a7a3056` after PR #12: build + ui SUCCESS (run `40148540641`);
- PR #13 head `14cee64`: build + ui SUCCESS (run `40148775008`);
- `main` at `e0ce035` after PR #13: build + ui SUCCESS (run `40149074319`);
- PR #14 head `b6f86bf`: build + ui SUCCESS (run `40150989182`);
- `main` at `9318686` after PR #14: build + ui SUCCESS (run `40151464926`);
- PR #15 head `972ad8d`: build + ui SUCCESS (run `40154441917`);
- `main` at `bf9cf66` after PR #15: build + ui SUCCESS (run `40154748343`).
- PR #16 engineering head `3ad32bc`: build + ui SUCCESS (run `40163881122`); the later docs-sync HEAD
  must be checked separately and is the only valid CI for that commit.
- TTS-A PR #16 remains **OPEN, not merged**; do not merge automatically.

---

## 11. Next priority

1. **PR #16 merge decision (Plan 03-B):** wait for explicit user authorization for this exact PR and
   HEAD; re-verify main/base/HEAD/CI/reviews before any Merge Commit. Current task stops before merge.
2. TTS-B: implement Provider service and neutral configuration on top of the TTS-A contract;
   provider-aware status, v2 migration and neutral read-only UI, with isolated tests. No real
   provider/credentials/production write. Then TTS-C real local/cloud/custom adapters after separate
   security review.
3. Phase 4B-2B-2b: Sender automation write via the audited `PUT /v1/automation/config` only, after a
   separate production-write authorization; keep `save.enabled=false` until then and never claim
   `APPLIED` without a loaded revision. Bridge/TTS writes require owner revision endpoints first.
   It is **NOT STARTED**.
4. Keep Native Voice Delivery Research as a parallel `RESEARCH_CANDIDATE`; do not implement native
   send until all admission gates and owner authorization are met.
5. Start new development branches from the integrated `main`; do not reuse merged PR branches as a
   baseline.

---

## 12. Re-verify before continuing

Do not trust this summary alone. Verify:

- current branch, HEAD, remote, worktree;
- actual PR bases/heads, CI, reviews and mergeability;
- current project status/roadmap/architecture;
- current behavior tests and UI tests;
- whether AI_CONTEXT has become stale relative to Git and code;
- no uncommitted user changes or secrets;
- production DSH/WeChat/Sender/Qwen state if the task touches runtime behavior.

---

## 13. Last update

**2026-10-25**, after TTS-A Plan 03-A: `main` is `bf9cf66` (PR #15 merge); Phase R1 is **COMPLETE**,
Phase 4B-1 and 4B-2A are merged but `OFFLINE`, Phase 4B-2B-1 is **AUDIT COMPLETE / `OFFLINE`**, Phase
4B-2B-2a is **`INTEGRATED`** after real Host/GUI acceptance (full eight-page coverage; not
`VERIFIED` for destructive edge cases), Phase 3B/4A remain `INTEGRATED`, TTS-A is **`DESIGN` /
`OFFLINE`** (pure provider contract/registry/SVC/v2 migration; no provider wired), and Phase
4B-2B-2b is **NOT STARTED**. PR #16 is **OPEN, not merged**, at engineering HEAD `3ad32bc` then a
docs-sync commit; CI `40163881122` passed. Current checkpoint: **197 Node (196 pass, 1 skip) / 24 UI
checks**, offline/contract evidence only. Merge awaits explicit user authorization; no production
configuration or runtime behavior change.

## Repository homepage presentation

The root README is a Chinese, newcomer-oriented overview with explicitly labelled isolated demo
previews and separate current/target capabilities. Developer setup and checks are in
`docs/DEVELOPMENT.md`; screenshot provenance is in `docs/assets/README.md`. Documentation and
visual assets only; no runtime capability or integration status changes.

## 08-E-C same-claim save (offline implementation, PR pending)

`openFixtureTaskOwner` returns `{run,get,save,saveArtifact,artifactStatus}`. `save` runs one complete same-claim
attempt on the trusted Fixture sandbox: eight-key request -> fresh birth/association gate -> existing
FINAL/CLAIMED dispatch -> one CLAIMED -> one real bytes engine -> one Artifact import while holding
the Artifact queue -> `ATTACH_FAKE_ARTIFACT`/`MARK_SAVED` -> strict `SAVED` FINAL with a frozen
`SaveProof` -> joint confirmation. `saveArtifact` (132) uses the same transaction and proof but skips
the engine: it records an Artifact the provider already imported (no second synthesis), so the
original task becomes `SAVED` with that artifact. Public `schemaVersion` stays `1`; the owner file
becomes `v2` only when a SAVED FINAL exists. `artifactStatus` reports the frozen six fields in the
fourteen-step order.
Twenty-two public error codes now exist; the eight new ones carry fixed reasons. Nothing here is
production, real generation, rights verification, delivery or Host integration.

The F01 close-out then finished the remaining offline evidence with no new capability: the
protocol/native-carrier guards for the result, production and inspection fields (complete canonical
19-field inspection, `peak 0..1`, safe `states` capture with the birth constraint, no
`@@toStringTag` guess), all local static proof rules before any store read, the known-field
accessor path, the eleven-row fs-fault matrix inside the shared VM graph, and §4.3
compatibility/concurrency (a v2 store surviving a legacy `run` append, concurrent saves, the
old-main isolation read, a legal delete queued behind a save, and both documented examples executed
as written). 085 v1.3 then added the full canonical-19 comparison against the real bytes, the static proof gate before any fresh read, the uniform eleven-row evidence with a true post-writer JOINT, legal OFFLINE/NO_EXECUTION settlements, fixed EXISTING concurrency, a delete queued inside the held Artifact window and fully inlined documented examples. Suite **755 / 752 pass / 3 platform skips / 0 fail**, owner + save specialty **72/72**;
branch `feature/plan08e-owner-save`, PR #40 open and unmerged. `OFFLINE` / `FIXTURE_ONLY` /
`NOT_INTEGRATED`; real Host/GUI, real TTS/media, delivery and production remain unverified.
## 08-F-A pure Fixture cover stage planner (offline planning only, PR pending)

`core/audio/cover-plan.mjs` (4 exports: `COVER_PLAN_SCHEMA_VERSION`, frozen `COVER_PLAN_LIMITS`,
frozen `COVER_PLAN_CODES` with 14 fixed keys, synchronous `planFixtureCover`) validates one complete
Fixture `sourceInput` through the original `resolveFixtureTaskSource` exactly once plus a strict
four-key recipe and a three-key Fixture capability declaration, and returns a deeply frozen 15-key
planning value: `PLANNED` or `BLOCKED`, an 11-key association, a 5-key recipe (with the resolver's
accepted `pitchShift`), a symbolic 3- or 4-stage graph, `outputSlot: VERIFIED_MASTER`,
`taskAuthority: UNVERIFIED`, `outputArtifactRef: null` and the fixed safety flags. Routing keeps the
planned priority (safe copy -> root/recipe/capabilities -> one source call -> common facts ->
SVC-only association -> instrumental/separator/mixer) and `SOURCE_BLOCKED` wins over every later
business route. Tests 19; suite **774 / 771 pass / 3 platform skips / 0 fail**. Documentation
(`docs/COVER_PLAN_OFFLINE.md`) carries the full API, all OPEN future responsibilities and two
complete positive roots plus one complete negative root that the tests run verbatim. No Task is
created or executed, no audio is generated or saved and the module has no I/O, clock or random
side effect. `OFFLINE` / `FIXTURE_ONLY` / `PLAN_ONLY` / `NOT_INTEGRATED`; parent Plan 08 is still
`IN_PROGRESS`.
## 08-F-B Cover execution / StageArtifact contract candidate (documentation only)

`docs/COVER_TASK_EXECUTION_CONTRACT.md` (new) is a **CONTRACT_CANDIDATE / PLANNED_RUNTIME /
NOT_IMPLEMENTED** design: one atomic Cover intent bound in the live catalog (private snapshot v3
with typed legacy/Cover entries, same single TaskId), a 25-key canonical Intent with five
recomputed SHA-256 variants, the single-owner `executeCover` / `coverStatus` / `requestCoverCancel`
API, a 14-key owner v3 Cover entry, the 7-key `coverAttachment` branch of the only writer, trusted
STORED SOURCE bytes plus a stable source identity, the derived VOCAL adapter, the 24-key
StageArtifact manifest with exact old-shape mapping, deterministic three-graph Fake byte algorithms
with computed WAV vectors, queue/checkpoint/recovery and cooperative cancel rules, the logical lease
and cleanup/cache boundary, exact peak/admission budgets, the old/new program × version matrix, 21
`TASK_OWNER_COVER_` codes plus 3 catalog codes and a 15-row state/failure matrix. No runtime, planner,
validator, tests or media work is added; the frozen save contract v1.6 is untouched and parent Plan
08 remains IN_PROGRESS.

### 092-R01..R06 revision (still NOT_IMPLEMENTED)

The contract candidate now fixes the six review groups: public `reserveCover` (schema 1) with a
19-key intentDraft and measured sourceEntry, one no-second-ID duplicate sequence, a 25-key legal
intent with recomputed canonical vectors; library `GRANTED` rights mapping and a physical
`artifact:fixture-bytes-*` binding; a field-by-field adapter to the existing 7-key RVC Fake gateway
(mono only); owner v3 Cover entry 14 keys / attempt 8 / checkpoints 5 / manifest 6 slots typed; the
exact M revision sequence and delta-only `coverAttachment`; per-zone cancel answers with a `now`
clock; crash/reopen and requestKey dedup; and the real entry-length budget (1,399,070 B,
P <= 4,892,386 B) with a 20 MiB exact import peak. No runtime, code, tests or media work is added.

### 0093 revision

Birth is internal-only (caller cannot forge source facts); four owner methods share the ok/errors
envelope; the canonical Intent is 1,140 B with recomputed vectors; the gateway adapter matches the
real M patterns and metadata is not bytes; `checkpoint[4].importReceipt` plus `resumeCoverFinal`
provide the only physical ref for recovery; FINAL holds Artifact through import/write/JOINT; cancel
yields with `setImmediate`; and the budget uses the full candidate pack, real owner bytes and a
32 MiB explicit-Buffer peak. Still NOT_IMPLEMENTED.

### 0094 revision

The catalog v3 birth example is restored (9-key entry / 16-key Task record / non-empty expiry and
consistent hashes); method tables separate supported v3 from unknown versions and include all four
Cover methods; resume returns EXISTING for a SAVED reopen; the source read names the real
`readStoredForSave`/`readBytes` calls and their distinct private-proof/public-metadata facts; and
the temporary Buffer budget is a four-row per-stage table (max 34,668,544 B) under 64 MiB while the
old persistent limits stay unchanged. Still NOT_IMPLEMENTED.

### Cover offline implementation (IN PROGRESS, OFFLINE)

The implementation branch adds four Cover modules and 23 tests: canonical Intent, deterministic
three-graph synthetic bytes, a dedicated Cover v3 store, and an executor with birth, single claim,
checkpoints, one MASTER import, FINAL attachment, status, a busy-run cancel fence and
resumeCoverFinal. As-built the Cover snapshots live in dedicated v3 files; merging v3 into the legacy
catalog/owner files, dynamic dependencies, the parent Fake E2E and full cancel ack/cleanup evidence
remain open. Contract errata were repaired on the same branch.

### Cover dynamic dependencies and relay boundary

`cover-readiness-internal.mjs` gives the TTS/SVC × AUDIO_REF/TEXT minimal dependency matrix with
ordered block reasons, first-visit confirmation kept separate, stale/unknown evidence rejected and
`realReady:false`. `cover-fake-relay-internal.mjs` is test-only: it accepts the inert
PROPOSED_NOT_AUTHORIZED candidate only, deduplicates SENT and refuses to resend UNKNOWN. Executor
tests now also cover busy-cancel evidence and receipt-based resume with zero second import. Still
open: v3 integration into the legacy catalog/owner files and the legacy parent-chain E2E.

### Parent-chain E2E and as-built status

A real legacy catalog reserve + Fixture library + Cover run + handoff test now proves the single
Task id path, the SAVED stop at the delivery boundary, the Fake Relay dedup/UNKNOWN rules and that
the legacy owner store does not silently execute a Cover task. Contract §15 records the as-built
matrix; the same-file v3 integration and the legacy owner run/save engine E2E remain open.

### Same-file v3, cancellation and rollback (090 close-out)

This section supersedes the "remain open" notes above. `resolveCoverFile` now selects the snapshot
file per contract §15.1: a fresh sandbox writes v3 to `audio-task-catalog-v1.json` /
`audio-task-owner-v1.json`; an existing v3 file there is used in place; an existing v1/v2 snapshot
forces the dedicated `audio-cover-*-v3.json` files. The v3 readers accept legacy 6-key (owner) and
4-key (catalog) entries and preserve them byte-for-byte, and the old owner fails closed on a v3 file.
`test/cover-legacy-owner-chain.test.mjs` is the missing legacy parent E2E: real catalog reserve, real
legacy owner run (ARTIFACT_READY / SIMULATED) and save (SAVED), then a Cover birth/execute on the same
Fixture source reaching SAVED, with both legacy files byte-identical and one artifact pack holding
the source plus two MASTERs.

Cancellation follows §8.1: `cover-stage-bytes-internal.mjs` exposes chunked cooperative stages with a
synchronous fence read every 4,096 frames and a real macrotask yield at least every 65,536 frames;
`cover-executor-internal.mjs` persists `acknowledgedAt` before stopping, writes FINAL CANCELLED with
`confirmedAt`, releases the lease, keeps a cancel-during-import MASTER stored without a FINAL SAVED,
and exposes the cleaned temp summaries through status. `test/cover-cancel-evidence.test.mjs` proves
all five facts, including an acknowledged-but-not-confirmed owner snapshot captured at the atomic
rename before the final write.

`core/audio/cover-rollback-internal.mjs` is the explicit checked rollback: it moves a Cover v3
snapshot from the legacy filenames back to the dedicated files byte-for-byte and refuses mixed legacy
data, an existing target or an unreadable file without changing anything. Full suite 831/828 pass/3
platform skips/0 fail; build unchanged. Branch `feature/plan08-cover-execution`, PR #43 open and
unmerged. Status **OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**; parent Plan 08 is not complete.

### 104-R01..R06 review close-out

The executor re-reads birth/Intent/current entry inside the single-writer queue, so concurrent
same-key and different-key calls claim once and FAILED/CANCELLED terminals never rerun
(`test/cover-concurrency.test.mjs`). `resumeCoverFinal` checks the exact attempt/request identity,
returns the real SAVED/CANCELLED/FAILED terminal and only continues a claim with a persisted
checkpoint[4] receipt plus a rebuilt attachment lineage
(`test/cover-recovery.test.mjs`, real checkpoint[4] bytes restored after a normal run). The save
transaction persists checkpoint[4] with the library import key, holds the Artifact queue across
import → fresh proof → FINAL → post-commit confirmation, locks on an uncertain FINAL rename and
resumes with zero second import. The store probes legacy files with lstat/size/bounded read, falls
back only for valid known v1/v2 and deeply validates v3 entries on read and write
(`test/cover-store-hardening.test.mjs`). `cover-lease-internal.mjs` provides one exclusive local-GPU
lease per sandbox (CPU/cloud `gpu:'NONE'`); the executor acquires before claim and releases in
`finally`. Readiness now rejects future evidence and authorized-but-not-ready SVC clouds, gates the
actual run, and an optional `dependencies` bundle validates the real voice binding and provider
readiness against the Intent (`test/cover-lease.test.mjs`, `cover-dependencies.test.mjs`). The
legacy parent test drives its persisted SAVED record into handoff and the Fake Relay
(SENT/EXISTING/UNKNOWN) and keeps the real Cover record delivery-free. Full suite 856/852 pass/4
platform skips/0 fail; build unchanged. Still **OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**; the
attachment remains a derived proof (owner v3 entry is 14 keys), real Provider/GPU/media/WeChat/
install paths remain unimplemented and unauthorized, PR #43 is unmerged and parent Plan 08 is not
complete.

### v1.77 A/B/C close-out

`validateCoverLineage` now proves the whole chain before a derived attachment is accepted: Intent
source hash/length/identity, all manifest parent links, MASTER inspection, rights/expiry and the
`import:cover-master:<attempt-suffix>` receipt; FINAL additionally rechecks the fresh proof's
requestKey/expiry/inspection/rights. `writeCoverSnapshot` is delta-only: CLAIMED→CLAIMED may append
checkpoints/fill null manifests but not change identity/record, CLAIMED→FINAL is allowed, FINAL and
historical/catalog rewrites are rejected. UNKNOWN outcomes retain the shared GPU lease (in-memory
busy and disk `releasedAt:null`); only SAVED/CANCELLED/FAILED release it. `executeCover` supports
`compute:'CPU_CLOUD'` with `gpu:'NONE'`, `gpu.available=false` and mandatory cloud authorization +
provider readiness, plus cross-mode conflict/progress evidence. Dependency facts are mandatory:
omitting them is a hard `DEPENDENCY_FAILURE`; the real voice binding/provider/model/evidence/
confirmation/cloud bundle must validate before any claim, and model revision, asset revision,
provider removal, shared invalidation and future evidence all block. All successful-execution tests
inject the real bundle through `test/support/cover-run.mjs`. Full suite 868/864 pass/4 platform
skips/0 fail; build unchanged. Still **OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**; the attachment
remains derived, real Provider/GPU/media/WeChat/install paths remain unimplemented and unauthorized,
PR #43 is unmerged and parent Plan 08 is not complete.

### v1.78 A/B1/B2 close-out

`validateCoverLineage` requires the exact 19-key MASTER inspection and the 4-key PASSED
verification; `finalizeCoverSaved` compares every fresh library inspection field (peak,
fullScaleSampleCount, durationMs, validationState, …) with the checkpoint[4] snapshot, so a mutated
peak cannot become SAVED. Lease release is unified: the finally block releases only when the owner
file confirms this attempt's FINAL SAVED/CANCELLED/FAILED; claim-write, checkpoint-write,
cancel-FINAL and terminal-FINAL failures retain the claim and GPU lease with `releasedAt:null`.
The long separate/convert/mix work runs outside the shared cover write queue: claim, checkpoint
writes and the FINAL transaction use short critical sections, checkpoint writes merge disk cancel
fields, and a real long GPU run no longer blocks a CPU/cloud execution (order B→A) while a second
GPU execution gets `RESOURCE_LIMIT`. Full suite 874/870 pass/4 platform skips (including the 2
`test/support` helper files as empty entries); build unchanged. Still OFFLINE / FIXTURE_ONLY /
NOT_INTEGRATED; PR #43 is unmerged and parent Plan 08 is not complete.

### v1.79 normal-cancel release fix

Every `cancelNow(...)` return in `executeCover` is now `return await`, so the try/finally runs after
the async cancel queue has written FINAL CANCELLED; the finally then sees the terminal entry and
releases. Previously a normal cancellation left `isCoverGpuBusy=true` and blocked later GPU tasks
even though the disk entry was FINAL. CPU/cloud cancellation also returns its lease count to zero,
and a failed cancel FINAL write still retains claim + lease. 2 regression tests; full suite 876/872
pass/4 platform skips.

### v1.80 lifecycle unification

`resumeCoverFinal` re-checks identity/phase inside the short queue, returns the real FINAL result and
releases the exact attempt lease by `leaseId`; a real interrupted receipt resumes to SAVED, the next
task can run, and a concurrent resume returns EXISTING instead of EXECUTION_UNKNOWN. Accepted
`cancel.requested`/fence is honored by `finalizeCoverSaved` and resume completes the cancellation
while keeping a STORED MASTER. A failed owner/Artifact post-FINAL JOINT confirmation locks both
domains, so status/retry/resume stay UNKNOWN and the lease is retained. Cancellation-observation
read errors are mapped through `stopIfCancelled` and a top-level error boundary to the fixed envelope
instead of rejecting. 6 lifecycle tests; full suite 882/878 pass/4 platform skips.

### Plan 09 offline onboarding UX (branch feature/plan09-config-ux)

Plan 08 is offline-closed and PR #43 was merged as `a9d3ce9` (tree `6a4cf00f`); this work starts from
that main. Two independent entries (`voice-bubbles`, `singing`) share the existing sources. A
first-use wizard persists per workspace/profile/feature/manifest revision, defers to global Setup,
never stacks, supports browse-only demo and capability-change reminders, and treats acknowledgement
as "read", never READY. Dependencies are grouped by mode (local/CPU/cloud/existing) with a labelled
fake installer (check/install/cancel/failure/retry; no downloads). Multi-engine drafts cover voice
and singing (rights/consent, pitch −12..12, gains, delivery) with engine cleanup, preview and an
isolated DIRTY→PREPARED→VALIDATED→SAVED/PENDING_APPLY/UNKNOWN/CONFLICT panel. Real Coordinator
semantics are verified with Fake sources in `test/plan09-ux.test.mjs`. Full suite 888/884 pass/4
platform skips; UI 30/30; still OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED.

### Plan 09 0111 review fixes (R01–R06)

The config panel now calls an injected isolated adapter (`getContext/checkDependency/prepareChange/
execute/apply/recover`) instead of a local toy state machine; effective voice drafts map only to the
existing `senderService.tts.provider/model/voice` fields, unsupported fields are shown as draft-only,
and singing stays read-only. No adapter means read-only. Wizard mode is persisted correctly, browse
dismissal is per revision, and workspace/profile/feature/manifest plus capability revision are
context-driven. Dependencies follow mode and source layout; install and capability verification are
separate, cancellation invalidates late callbacks, and ready items are shared across pages. Drafts
use the shared provider/voice catalog, Chinese novice options, `fixture://` source validation, finite
numeric checks and mode/engine consistency. 6 unit tests drive the real Coordinator through the same
adapter contract; 6 UI checks cover the adapter calls and negative flows. Full suite 888/884 pass/4
platform skips; UI 30/30; build 266,702 bytes.

### Plan 09 0112 review fixes (A/B/C)

The config panel now awaits every adapter call with busy/error/late-token handling, freezes the
preview at prepare time and keeps UNKNOWN read-only (recover/getStatus only; no apply). Projection
preserves opaque revisions and per-source/partial states. Dependency evidence is scoped by
workspace/profile/manifest/capability/mode, cancel/close invalidates that scope, and browse dismissal
uses the current manifest; a capability change shows a reminder instead of auto-opening. Wizard and
page share the actual source layout/delivery choice; singing cloud/existing no longer requires local
RVC/separation, and 鲸音 Core is separate from the 鲸递 delivery module. Voice mode changes sync
engine/provider, cloud authorization and provider-kind/voice bindings are validated, and any draft
change invalidates preview/plan. UI 32/32 includes a browser→exposeFunction→real isolated Coordinator
save chain; full suite 888/884 pass/4 platform skips; build 273,806 bytes.

### Plan 09 0113 review fixes

Dispatched execute/apply and known transaction IDs survive draft edits and page switches; UNKNOWN remains read-only and recover keeps the ID. Adapter null/throw responses clear busy with authoritative phases; prepared plans are blocked when context/authorization changes. Dependency checks are cancelled when the mode/scope exits or the page unmounts, and voice engine changes sync the mode while singing existing keeps gateway. UI 38/38 includes lifecycle/exception tests plus the real isolated Coordinator chain; full suite 888/884 pass/4 platform skips; build 279,373 bytes.

### Plan 09 0114 review fixes

Transactions now live in a shared store keyed by workspace/profile/feature/manifest with cross-page in-flight authority, global busy mutex, draft/context-bound plans, legitimate UNKNOWN/PARTIALLY_APPLIED handling, response-loss UNKNOWN and an explicit reset after APPLIED. Dependencies use real shared identities (Core/Sender/WeChat) versus mode/engine-scoped models, with store-backed cancellation display. UI provider IDs map to the existing `tts.provider` enum and cloud/existing modes are verified through the real isolated Coordinator. Authorization/context changes clear previews. UI 45/45; full suite 888/884 pass/4 platform skips; build 290,994 bytes.

### Plan 09 0115 review fixes

The panel runs the shared `plan09ReduceTransaction` entry and transactions are keyed by workspace/profile/feature, so a manifest-only switch cannot clear an unresolved UNKNOWN. Empty/lost/ok-only operation responses are UNKNOWN and cannot be reset or re-prepared; `state:PREPARED` is a no-write rejection; only determined SAVED/PENDING_APPLY/APPLIED/PARTIALLY_APPLIED results can be ended (history kept). Operation sequences stop late prepare/execute/apply/status answers from overwriting a newer operation or releasing an in-flight mutex; a frozen plan whose draft changed across pages shows a mismatch notice and can be re-prepared directly. Shared pending dependency checks are cancelled by the owning page on wizard exit/mode switch/unmount/page switch while completed shared evidence is reused; every write notifies the identity's current observer; the browser code uses the single core scope helpers. 8 new reducer/classification unit tests (14 in the Plan 09 file); UI 53/53 including real isolated Coordinator loss/empty responses; full suite 896/892 pass/4 platform skips; build 296,236 bytes. OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #44 unmerged.

### Plan 09 0116 review residuals

A Coordinator `FAILED` with trusted no-write evidence (`writeOutcome: NOT_WRITTEN` + rolled-back steps, or recovery `FAILED`/`committed:false`/`recoveryRequired:false`) can end its association and prepare the next draft without replaying the consumed plan; plain failures are not labelled never-written and UNKNOWN stays latched. A prepare that returns after a context/authorization change is marked stale with confirm blocked and a direct re-prepare path, and dependency identity changes cancel the previous identity's pending checks through the old snapshot so a late response cannot become ready after returning. 2 new reducer tests (16 in the Plan 09 file); UI 58/58 including a real Coordinator not-written failure; full suite 898/894 pass/4 platform skips; build 299,314 bytes. OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #44 unmerged.

### Plan 09 0117 review residual

A prepare that completes after its page was unmounted compares against the live context serial kept per transaction key (not the unmounted component's closure), and a late plan is re-checked against the current context when it appears, so the stale notice, blocked confirm and direct re-prepare path work across pages while same-context completion still confirms. The no-write note is now shown only for a `FAILED` result and disappears when a status check turns UNKNOWN; `FAILED` distinguishes definite no-write/rollback from an apply rejection after a committed save. UI 63/63; full suite 898/894 pass/4 platform skips; build 299,972 JS characters / client.js 324,799 UTF-8 bytes. OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED; PR #44 unmerged.

### Plan 10 10-A Qwen provider candidate

Branch `feature/plan10-qwen-provider` from merged main `f63edc6`. Adds `core/tts/qwen-contract.mjs` (fixed upstream/licence metadata, five audited 12 Hz model identities bound to backends, separate custom-voice/base-clone/voice-design modalities, limits, static tokenizer/dependency UNKNOWN inventory, manifest builder), `workers/qwen3_tts_worker.py` (official-SDK worker: static hello/health/discover load nothing; only synthesis imports `qwen_tts` and calls `Qwen3TTSModel.from_pretrained(<local dir>, local_files_only=True, trust_remote_code=False)`; documented `generate_custom_voice`/`generate_voice_clone` mapping; trusted local binding index; one synthesis at a time; cancel ack separate from stop), `qwen-worker-protocol.mjs` (versioned NDJSON, whitelists, path/secret rejection, 2 MiB cap, bounded depth/node parsing, terminal result states, expected response types), `qwen-supervisor.mjs` (explicit command inside allowed root, optional runtime, shell:false, minimal env, bounded IO, finite timeouts, no retry, per-generation ownership, error≠exit, confirmed exit before release, retained/retryable cleanup, admission closed during stop) and `qwen-adapter.mjs` (exact `qwen-tts` identity, audited model/backend/protocol/version intersection, worker limit cap, discovery that refuses missing declarations, caller-request gate preserved, backend/registered-clone identity binding, four-field output identity before bytes, UNKNOWN/CANCELLED terminals, real cancel handle, unresolved-operation admission control, optional existing Task authority confirmation, WAV-inspector output validation, persisted:false). The 0122 residual repair keeps a SHA256 baseline per trusted clone reference, hands the exact audited bytes to the SDK as a `data:audio` value (so a post-audit path change cannot feed different content), audits the model sub-resource tree for junction/symlink escapes, re-audits config/tree after loading before generation, and reports a runtime-disappeared direct dependency through `health` as degraded until restored. The supervisor releases occupancy only on a complete terminal (state plus exact requestId/model/backend/voiceId), keeps generic/missing/null/wrong-identity results UNRESOLVED, preserves the issued-message-id correlation after invalid late messages, and scopes a start failure to its own generation so it cannot stop a new one. The 0123 repair loads through a private audited snapshot (every regular file copied with SHA256 baselines, no hardlinks, in the supervisor-owned temporary directory), commits the model cache only after validation and discards it on load-time cancellation, audit failure or exception, and keeps a resolvable-but-ImportError dependency degraded until one successful import. The 0124 repair removes hardlinks entirely (full copy within an 8 GiB budget), tracks snapshot directories from creation, cleans them on shutdown/EOF with a retryable snapshotCleanupPending fact and host temp cleanup, and prevents a later missing request from downgrading a known ImportError. The 0125 repair shares the remaining copy budget across files before each chunk write and retains active/build-in-progress snapshot ownership in health cleanup, so cross-file overruns and health-during-load cancel/failure leave no orphan. 68 Qwen tests (25 Node behaviour + 27 official-worker with injected Fake SDK + 16 focused 095 repair tests) pass; full suite 966/962 pass/4 platform skips/0 fail with default discovery; UI 63/63; client.js unchanged; docs/TTS_QWEN_PROVIDER.md records licences, loading boundary and OPEN items. Real model/Host/main Task/Artifact integration remains OPEN; no install/download/network/private material. PR #45 unmerged.

### Plan 10 10-B IndexTTS-2.5 offline candidate (2026-11-03)

Branch `feature/plan10-indextts-provider` from exact main `M=fb3a669` (PR #45 merged; 10-A Qwen on main). Adds `core/tts/index-tts-contract.mjs` (fixed `index-tts@d9e41aac…`, model `IndexTeam/IndexTTS-2.5@c39ce5ba…`, package `indextts 2.0.0` still exposing `infer_v2_5.IndexTTS2`, bilibili model-use licence with MAU/revenue commercial thresholds, non-Apache; dependency/tokenizer/private-material licences UNKNOWN), `index-tts-worker-protocol.mjs`, `index-tts-supervisor.mjs`, `index-tts-adapter.mjs` and `workers/index_tts_worker.py`. The provider is clone/emotion-only: trusted clone bindings, 8-float emotion modes/vectors, optional emotion reference, text emotion only when the QwenEmotion directory exists and `use_qwen_emo=True`, five languages, 22.05 kHz mono PCM16 output. The worker loads nothing at hello/health/discover, and on synthesis uses a byte-for-byte model snapshot with a shared 8 GiB budget (no hardlinks), required local auxiliary/tokenizer resources (so the upstream download helper is not entered), offline env + in-process network guard, stable audited reference copies and exact four-field output identity. Index tests 29/29; full suite 995/991 pass/4 platform skips/0 fail; UI 63/63; `client.js` unchanged. Independent PR #46 pending review, not merged. Still OFFLINE/FIXTURE_ONLY/NOT_INTEGRATED; real weights/GPU/Chinese quality/Host/main Task/Artifact and reference rights remain OPEN.

### Plan 10 10-C Kokoro-82M offline candidate (2026-11-03)

Branch `feature/plan10-kokoro-provider` from exact main `M=fb3a669`. Adds `core/tts/kokoro-contract.mjs` (fixed `hexgrad/kokoro@dfb907a0…`, `kokoro 0.9.4`, `hexgrad/Kokoro-82M@f3ff3571…` v1.0, Apache-2.0 code/model only, dependencies/voices/G2P UNKNOWN, preset-only capability matrix), `kokoro-worker-protocol.mjs`, `kokoro-supervisor.mjs`, `kokoro-adapter.mjs` and `workers/kokoro_worker.py`. The worker is static at hello/health/discover, imports Kokoro only on synthesis, snapshots the model byte-for-byte, copies trusted local voice `.pt` files to stable private paths, requires local config/weights/voices/G2P, installs offline env/network guard, uses `KModel(...).to("cpu")` + `KPipeline(..., device="cpu")`, joins split chunks with a fixed short silence and validates 24 kHz mono PCM16. Clone/voice-design/emotion are rejected; results are non-persisted. Kokoro 15/15 tests; full suite 1010/1006 pass/4 platform skips/0 fail; UI 63/63; `client.js` unchanged. Independent PR #47 pending review, not merged; real CPU audio/Host/main Task/Artifact and voice/G2P rights remain OPEN. Still OFFLINE/FIXTURE_ONLY/NOT_INTEGRATED.
