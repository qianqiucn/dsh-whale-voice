# Provider Generation → SAVED Candidate (Plan 10-R1, OFFLINE / ISOLATED)

**Status:** `IN PROGRESS` / `OFFLINE` — internal wiring candidate only. No model was loaded, no real
inference ran, no WeChat/device/window was touched, no production Host route was added, and nothing is
merged. `SAVED` means "the isolated coordinator stored provider bytes in the existing Artifact
library **and** the original task owner recorded that Artifact as the task's SAVED result (132)", not
that a user can click real generation, not that a Sender can deliver it, and not that a real model
ran. 133 additionally verifies the **real** `createQwenProvider` public interface against the existing
Fixture worker (a local Node child process, no model).

## 1. What this unit actually is

`core/audio/provider-generation-offline.mjs` is a claim-first coordinator between an already-audited
provider contract (the existing Qwen adapter/supervisor API), the existing Artifact authority
(`openFixtureArtifactLibrary`, `artifact:fixture-bytes-…`) and the existing Task owner
(`openFixtureTaskOwner`). It deliberately does not add a Host/UI route.

Pipeline:

```
prepare(scope, task, requestKey, rights, provider, request)
  → durable claim (claim ledger v1, same trusted sandbox)
  → submit(claimId) → provider.beginSynthesis({text,voiceId,language,emotion}, {claimId,taskId})
  → re-measure bytes here (WAV: PCM16 / 24 kHz / mono / 200–20000 ms / ≤1 MiB)
  → artifacts.import(same Artifact authority)
  → artifacts.readBytes readback + SHA256 equality
  → taskOwner.saveArtifact(...)  → original task CREATED → PROCESSING → ARTIFACT_READY → SAVED
  → claim SAVED (+ jointProof: claim/request digest, task birth hash, provider binding, artifact ref/hash/length/duration)
```

A failed original-task save leaves a `SAVE_UNKNOWN` tombstone on the claim (no SAVED claim, no second
synthesis, the already-imported Artifact stays as it is).

### Application entry (135)

`core/preset-generation-app.mjs` is the formal Core entry for this chain:
`openPresetGenerationApp({sandbox, provider, scopeId, rightsProofRef, voices[, textLimit][, now]})`
returns `{catalog, generate, status}`.

- `generate({text, voiceId, language})` reserves a real Task birth in the existing catalog, runs the
  coordinator (133) once against the caller-provided audited provider, and lets the original task
  owner record SAVED (132). It returns the real Task id plus the Artifact ref / sha / bytes / duration.
- `status(taskId)` re-reads the original task and Artifact stores (owner `get` + `artifactStatus`, then
  the library `readBytes`), so a reopened entry returns the same saved Artifact facts.
- The entry does not import the UI test bridge or the Fixture worker: the caller injects the trusted
  sandbox and an already started `createQwenProvider`. The test-only
  `tests/ui/host-generation-assembly.mjs` now only supplies that controlled execution object, the
  sandbox and the isolated Host assembly, and delegates the business flow to this Core entry.

### Host call surface (136) and page wiring (137)

`index.js` (`installHostBridge`) registers three routes on the existing loopback/Origin/connection/
token bridge:

- `GET /whale-voice/setup/generation/catalog`
- `POST /whale-voice/setup/generation` (JSON `{text, voiceId, language}`)
- `GET /whale-voice/setup/generation/status?taskId=...`

Only `/generation` accepts POST; the other routes keep their declared methods, and the existing
token/Origin/connection gate is unchanged. The handler calls the injected `options.generation` Core
entry (an already-opened `openPresetGenerationApp` value). The production `apply()` passes no runtime,
so every generation route returns `503 {ok:false,error:'generation_not_enabled'}` and nothing is
generated. No new listener, no authentication change; responses are the Core envelope and remain
Fixture/isolated only.

The production client bridge script (`index.js` `bridgeScript`) exposes
`getGenerationCatalog()`, `generatePreset({text, voiceId, language})` and
`getGenerationStatus(taskId)` next to the existing setup methods, with the same per-process token and
same-origin rules. 137 wires the existing Chinese 音色中心 page to those methods instead of a
page-specific test adapter: it loads the preset voices from the catalog route, submits the short text,
queries the returned Task ID through the status route, remembers that Task ID locally so a reload
re-queries the same saved result, and shows "生成未启用" (not a success state) whenever the routes
answer `generation_not_enabled`.

### Serialized segment switch at boundaries (157)

Only the storage-segment switch is serialized. Before, two requests arriving together at a segment
boundary both opened the next `segments/NNNN` store, so the same directory was opened twice and the
current session could fall into `TASK_OWNER_STORE_CHANGED` / `TASK_OWNER_OWNER_UNKNOWN`; only reopening
the plugin cleared it (the saved data itself was not lost). The application entry now serializes just
`ensureCurrentSegment`: the second request shares the just-created segment instead of rotating again,
while both accepted requests still run their own provider request. A provider that cannot run two
syntheses at once rejects the extra request honestly with its existing error, and an accepted request is
never delayed by a hidden queue outside the 156 client wait. Requests still return their own real SAVED
or failure result, nothing is retried or duplicated, and `status` / `results` / `download` keep working
for old and new results in the same session without reopening.

### Generation wait follows the effective limit (156)

The 音色中心 page waits for the Host's effective generation limit instead of the fixed 15 s. The Core
catalog publishes `generationTimeoutMs`: the same effective per-request limit the audited Qwen adapter
enforces (the requested timeout clamped by the worker-advertised `limits.timeoutMs`; the Qwen default
120 s is not a hard cap). The production client bridge's generation helper takes a per-request timeout
(other generation routes keep their 15 s) and `generatePreset` waits for the catalog limit plus a 10 s
grace, so the server's own honest timeout response can arrive first. A client-side abort returns
`{ok:false,error:'generation_unconfirmed'}` instead of claiming success or a background failure. The
Studio page keeps the 生成中 state while the server is inside its limit; if the wait really ends without
a response it shows 「生成结果未确认」 (no auto retry; the result may still appear in 已保存的生成结果),
while an explicit backend failure shows the returned code and is never treated as SAVED.

### Persistent generation storage (155)

Generation keeps saving past the old fixed budgets and saved results stay retrievable. The
application entry now uses segmented storage: the given storage root stays the first segment (so
pre-fix results keep their location and task ids), and when the current segment approaches the
unchanged per-file store limits (24 tasks / 3 MiB audio, below the 32-entry and 4 MiB budgets) a new
`segments/NNNN` store is opened for new saves. `status`, `results` and `download` search every segment,
nothing is deleted or replaced, and a reopen over the same location lists the old and the new results.
The read-only catalog `count` and the `listSaved.entryCount` give the entry usage used for the
rotation decision. Saved Provider generation artifacts (`PROVIDER_GENERATION_FIXTURE` origin) ignore
the recorded 24 h expiration in the artifact library and in the owner artifact-status read, so
pre-fix records whose 24 h already passed are readable again; other artifact origins keep their
rights-expiry contract. A real write failure is still reported as failure (never `SAVED`) and leaves
earlier saved results downloadable.

### Original-task result download (150)

The Core generation entry gains `download(taskId)`: it reads the owner-confirmed saved artifact of that
original task and returns the stored WAV bytes plus the original artifact ref/origin/SHA-256 and a fixed
file name; it never creates a task, re-synthesises, mutates the saved artifact or triggers playback or
delivery. `installHostBridge` adds `GET /whale-voice/setup/generation/download?taskId=…` (503
`generation_not_enabled` without a runtime, 404 for unknown or unreadable tasks, `audio/wav` +
`content-disposition: attachment`), and the client bridge adds `downloadGenerationResult`. The 音色中心
page shows a 下载已保存音频 action when the current task has a readable saved result and builds a local
blob download. Refreshing the page and restoring the same saved task still downloads the same bytes, and
the generation request count does not change (no re-synthesis).

### Saved-result selection (151)

The 音色中心 page lists the already-saved generation results of the same current storage location, so a
second generation no longer hides the first one. The task owner gains a read-only
`listSaved({schemaVersion, scopeId})`: it re-reads the same owner file through the existing fresh
birth/owner association gates and returns only that scope's `FINAL SAVED` entries (original task id,
feature/task type, state, artifact ref, provider/voice projection); it creates, changes or retries
nothing and does not open the artifact library. The Core generation entry adds `results()`: it keeps
only the current generation range (`feature: provider-generation`, `taskType: PROVIDER_TTS`), reads each
stored artifact's metadata through the existing library `get`, and returns the original task id, SAVED
state, artifact ref, readable flag, SHA-256, byte length, origin and created-at; an empty scope is an
honest empty list. `installHostBridge` adds `GET /whale-voice/setup/generation/results` (503
`generation_not_enabled` without a runtime) and the client bridge adds `getGenerationResults`. The
Studio page shows a 已保存的生成结果 card: 暂无结果 when the scope has no saved generation, otherwise each
entry shows its original task/artifact facts, and selecting one reuses the 150 download action to read
that result's already-saved WAV bytes. Selecting or downloading never generates, saves or mutates
anything; a refresh and a same-config reopen list the same entries and return the same bytes.

### Saved-result list reads one pack per segment (158)

The saved-result list no longer re-reads the whole artifact pack for every listed entry. `results()`
groups the saved results by segment and asks the library once per segment for their metadata, so
opening the list reads and re-inspects each segment's `audio-artifacts-v1.json` a single time instead
of once per result. The list keeps the same entries, order, task ids, readable flag, SHA-256, byte
length, origin and created-at, and still shows an entry whose artifact is missing, deleted or expired
as not readable instead of hiding it or failing the whole list; a real read failure is still reported
through the existing `PRESET_GENERATION_RESULTS_REJECTED` exit. The library gains a read-only
`getMany({schemaVersion, scopeId, artifactRefs, now, rights})` that returns the same per-reference
outcomes as `get` (NOT_FOUND / DELETED / EXPIRED / FOUND plus metadata) from one pack read. Nothing is
created, changed or deleted, and no generation is triggered. Measured on the same isolated stores:
24 saved results 435–444 ms → 22–23 ms, 96 saved results (4 segments) 1.75–2.09 s → 83–84 ms; the
numbers are this machine's measurements, not a product promise.

### Saved-result status reports a failed read (159)

One saved result's status no longer turns a failed byte read into a successful readable result.
`status(taskId)` asks the task owner whether the saved artifact is available and then reads its bytes;
when that read failed, the query used to answer `ok:true, readable:true` and only fill `sha256` /
`byteLength` with `null`, so a damaged or unreadable file looked fine until the user pressed download.
It now returns `PRESET_GENERATION_STATUS_REJECTED` with detail `read rejected`, which is the same
honest failure `download()` already returned for that read; a successful query still reports the
complete artifact facts (SHA-256, byte length, origin) plus the original task's provider/voice/input
projection. The failed read creates, changes, deletes, regenerates and re-sends nothing: the artifact
pack bytes and the saved task entries stay identical, and reopening the same location reports the
original result with its full facts and returns its bytes again. Only the byte read is involved;
pre-existing rejections from the earlier availability check (missing, deleted, expired rows) and the
24 h expiration already handled by 155 keep their existing exits.

### Recoverable applied settings (154)

A wrong or damaged applied generation setting no longer keeps the plugin from opening. `apply()` now
treats three real failures as visible facts instead of rejecting the plugin: an applied storage
location that cannot be opened, an applied Qwen runtime program that cannot start the runtime, and a
truncated `generation-settings-applied.json` / `qwen-runtime-applied.json`. In those states the Host
installs without a generation object but with the settings draft store, so the 语音设置 page still
opens; `GET /whale-voice/setup/generation/assembly` returns `{state:'READY'|'DISABLED'|'FAILED',
code,messageZh}` (the client bridge adds `getGenerationAssemblyStatus`) and generation routes stay
`503 generation_not_enabled` until the user repairs the values. The two settings cards tolerate a
damaged applied record: the GET/PUT responses return `appliedError` instead of 500, the card labels
the applied fact as 「已应用…记录损坏，无法读取」 and the normal 保存草稿 + 应用 actions rewrite the
record. If that status request itself fails (HTTP error, rejection or timeout), the settings page
says it cannot read the generation state — never silently nothing and never "normal"/"not enabled" —
and the settings entry remains usable. When the same isolated config is opened again, the corrected
storage location and runtime paths are adopted, the Fixture generation and original-task save work
again, and a damaged record with generation disabled keeps the settings page usable without starting
anything.

### Applied Qwen runtime paths (149)

The saved runtime paths can be explicitly applied: the settings store also keeps
`qwen-runtime-applied.json` (`schemaVersion:1`, `modelDirectory`, `pythonPath`, `appliedAt`),
`installHostBridge` adds `POST /whale-voice/setup/settings/qwen-runtime/apply` (400
`runtime_draft_missing` when nothing is saved) and the GET/PUT responses carry `applied`/`appliedAt`.
The settings page's 应用运行路径 button records the fact and says "Qwen 运行路径已应用，下次重开插件生效";
the card shows the persisted fact "已应用运行路径：…" while the operation note keeps saying that
applying does not switch the current runtime. Saving alone changes nothing and applying executes
nothing. On the next formal `apply(ctx, config)` with the same serialized config the applied Python
program replaces `worker.runtime` and the applied model directory replaces the worker's `--model-dir`
argument (appended when absent); the trust root and the generation enablement still come from the
config, so disabled generation starts no Worker/model.

### Qwen runtime-path settings draft (148)

The Chinese 语音设置 page records the Qwen model directory and the Python runtime program as an isolated
draft: the settings store keeps `qwen-runtime-draft.json` (`schemaVersion:1`, `modelDirectory`,
`pythonPath`, `savedAt`), `installHostBridge` exposes `GET/PUT /whale-voice/setup/settings/qwen-runtime`
(503 `settings_draft_unavailable` without a store; 400 `runtime_model_invalid` /
`runtime_python_invalid` / `runtime_model_not_absolute` / `runtime_python_not_absolute`), and the client
bridge adds `getQwenRuntimeDraft`/`saveQwenRuntimeDraft`. Saving the draft never reads or loads a model,
executes Python, starts a Worker or generation, changes a running generation object or applies the
paths as runtime configuration; the page says "Qwen 运行路径草稿已保存，尚未应用". Reopening the same
config reads the same values back, and generation stays `503 generation_not_enabled`.

### Applied generation storage location (146)

The saved draft can be explicitly applied: the draft store also keeps a fixed
`generation-settings-applied.json` (`schemaVersion:1`, `generationStorageRoot`, `appliedAt`),
`installHostBridge` adds `POST /whale-voice/setup/settings/generation-storage/apply` (400
`draft_missing` when nothing is saved) and the GET/PUT responses carry `applied`/`appliedAt`. The
settings page's 应用保存的位置 button applies the saved draft and says "已应用，下次重开插件生效"; the
card shows the persisted fact as "已应用位置：…" (147), while the operation explanation separately says
that applying only decides the next open and does not switch the running component. Saving alone
changes nothing. The normal plugin dispose keeps the current runtime's location and lifecycle; the
next formal `apply(ctx, config)` with the same serialized config reads the applied fact and opens the
generation storage at that location (no migration, no deletion of the old location's results, and no
Worker/model when generation is disabled). Applying only records the fact: it does not create the
location, switch the current service or write the production config.

### Formal plugin draft-storage wiring (145)

The formal plugin entry opens the draft store from serializable config: `apply(ctx, config)` reads
`config.settings.draftRoot` (an absolute location), opens that trusted persistent storage itself
(never a caller-injected store) with the same `openConfigStorage` capability, and passes the 144 draft
store to the same Host surface. The draft is independent from `config.generation`: it saves and reads
while generation stays disabled, a normal dispose keeps the location and its file, and the same
serialized config and location reopened through the formal entry reads the same value back (still
"草稿已保存，尚未应用"). Without `settings.draftRoot` the draft route keeps answering
`503 settings_draft_unavailable`. Nothing is applied: no Worker/model starts, the draft does not
switch the generation data directory and no historical data is migrated.

### Generation storage settings draft (144)

The Chinese 语音设置 page records the intended generation data storage location as an isolated
*draft*: `core/settings-draft.mjs` keeps one fixed `generation-settings-draft.json` (`schemaVersion:1`,
`generationStorageRoot`, `savedAt`) under a trusted sandbox, and `installHostBridge` exposes
`GET/PUT /whale-voice/setup/settings/generation-storage` (503 `settings_draft_unavailable` when the
Host supplies no draft store, 400 `draft_root_invalid`/`draft_root_not_absolute` for an empty or
relative location; the existing loopback/token/connection gate is unchanged). The production client
bridge adds `getGenerationStorageDraft`/`saveGenerationStorageDraft`; the settings card shows the
saved draft, saves through the Host route and re-reads the same value after a page reload. Success
means only "草稿已保存，尚未应用": saving never enables generation, starts a Worker or model, writes the
production config, touches a running generation object or migrates data. The formal plugin now
supplies this draft store from `config.settings.draftRoot` (145); without that config the route stays
unavailable.

### Generation-data storage across plugin reopen (143)

`config.generation.storageRoot` names one explicit, absolute storage location for the generation
Task/Artifact stores. When present, the Host opens that location through the persistent trusted
capability (`core/config-sandbox.mjs` `openConfigStorage`, same marker contract the stores already
validate, stored marker id reused because the Artifact pack is bound to it) instead of a fresh
temporary sandbox. Disposing the plugin still disposes the routes and closes the runtime/worker it
created but keeps the location's marker and the three store files; assembling the plugin again with
the same location and config answers the original Task ID on the status route with the same Artifact,
SHA-256 and `PROVIDER_GENERATION_FIXTURE` origin, and the store files stay byte-identical — the second
assembly only queries and never re-synthesises. Nothing is migrated and no production store is read;
a location that is missing, not a directory or carries an invalid marker is refused, and without
`storageRoot` the 142 temporary-sandbox behaviour (ephemeral, removed on dispose) is unchanged.

### Plugin runtime-config assembly (142)

The formal plugin entry `apply(ctx, config)` accepts a serializable config:
`{ generation: { enabled: true, scopeId, rightsProofRef, allowedRoot, worker: { command, runtime,
args }, instanceId?, requestTimeoutMs?, handshakeTimeoutMs?, shutdownGraceMs?, killWaitMs? } }`.
Nothing here accepts a sandbox or an already-open app: the Host creates its own temporary isolated
sandbox, calls `openQwenGenerationRuntime`, and passes that same Core app to the existing Host
surface. Without `generation.enabled === true` the plugin installs the read-only Host surface and the
generation routes keep answering `503 generation_not_enabled` without starting a worker. Disposing
the plugin scope disposes the Host routes, closes the runtime it created and removes that temporary
sandbox. The temporary sandbox is not a production persistence root and the worker output remains
simulated.

### Formal Qwen runtime assembly (140)

`core/qwen-generation-runtime.mjs` exposes `openQwenGenerationRuntime({ sandbox, scopeId,
rightsProofRef, allowedRoot, worker, instanceId?, requestTimeoutMs?, handshakeTimeoutMs?,
shutdownGraceMs?, killWaitMs?, now? })`. It creates the existing supervisor and audited Qwen
provider, starts them, and builds the same Core application object from the worker's real handshake/
discovery result: the preset voices, languages and text limit come from discovery, and the task's
provider facts are the discovered manifest/provider identity (`providerId` from the manifest, `model`
and `backend` from discovery; `instanceId` is the caller-supplied runtime label) instead of the
fixed example. It returns `{ app, provider, discovery, close }`; `close()` stops exactly the worker
this runtime created through the existing normal shutdown path, and a second close is a no-op. The
isolated Host test and the UI Host assembly now use this one entry instead of hand-assembling
supervisor/provider/app; production `apply()` still receives no generation runtime, so the installed
Host remains not enabled.

### Formal Provider task (139)

The Core entry now issues a v2 Provider generation task through the same catalog:
`feature: provider-generation`, `taskType: PROVIDER_TTS`, `provider {providerId, instanceId, model,
backend}`, `voice {kind:'PRESET', voiceId}`, `input {kind:'TEXT', text}` plus the Fixture
rights/execution context (`CONFIRMED_FIXTURE`, `mockOnly:true`, `delivery: NOT_REQUESTED`). The
existing coordinator claim, original owner save path and the same artifact library consume it
unchanged: the birth task is transitioned to SAVED, the artifact keeps
`PROVIDER_GENERATION_FIXTURE`, and `status` returns the same provider/voice/input facts after reopen.
v1 Fixture/Cover tasks and their imports keep their exact v1 shape; this does not enable real
generation, real model readiness or delivery.

### Provider generation origin (138)

The provider result is imported into the same Artifact library with
`origin: PROVIDER_GENERATION_FIXTURE`, not `FIXTURE_IMPORT`. The library accepts exactly the two
origins (`FIXTURE_IMPORT` remains the default for ordinary Fixture/Cover imports) and the Artifact
pack parser preserves and validates the recorded origin. The Core `generate` and `status` results
carry that `origin` read from the stored Artifact, so the original task, its Artifact and the source
stay consistent after reopen; the Host envelope carries the same field. This is a source category
only: the results remain `fixtureOnly` / `realReady:false` and never claim a real-model run.

## 2. Contract (v1, fail-closed)

- `PROVIDER_GENERATION_SCHEMA_VERSION = 1`; any other `schemaVersion` → `UNSUPPORTED_VERSION`.
- Strict key surfaces on claim/request/rights/provider; unknown keys or types are rejected.
- `rights.state` must be `GRANTED` with a `fixture-rights:…` proof; anything else is refused **before**
  the provider is called.
- The task must be confirmed by the injected authority (`{identityHash, state}`); a task already in
  `SAVED` (or any non-initial state) is refused.
- One claim per `(scopeId, taskId)` and one per `(scopeId, requestKey)`:
  - identical claim material → `EXISTING` (no synthesis);
  - changed request/provider/rights → `CONFLICT`;
  - the same `taskId` under another scope → `CROSS_SCOPE`.
- After a terminal state (`SAVED`, `FAILED`, `CANCELLED`, `UNKNOWN`, `SAVE_UNKNOWN`) `submit()` only
  returns `EXISTING`; a failed or unknown generation is **never** resynthesised to repair a save.
- Cancel records `requested` / `ack` / `unknown` as separate facts; a late result may still win the
  race and produce `SAVED`, but it never re-binds a different claim or reopens a terminal one.
- **121 lifecycle:** a cancel that arrives while `beginSynthesis` is still pending is recorded
  `PENDING` and applied to the handle once it appears; `close()` settles owned active claims as
  `UNKNOWN` (attempting a bounded cancel for the owned handle) instead of leaving them `BEGINNING`;
  an ACK with `confirmed:false` is not a confirmation; a contradictory `cancelled+unknown` result is
  `UNKNOWN`, not `CANCELLED`.
- A failed artifact write or a readback mismatch leaves a `SAVE_UNKNOWN` tombstone with no artifact.
- **132 original-task save:** `taskOwner` is a required dependency. After the readback, the coordinator
  calls `taskOwner.saveArtifact({scopeId, taskId, now, rights, artifactRef, artifactSha256,
  artifactByteLength})`; only when that write returns `ownerState:'SAVED'` for the same `artifactRef`
  does the claim become `SAVED` (the result exposes that owner value as `task`). The owner write is
  the same `CLAIMED → FINAL SAVED` transaction with the mandatory `SaveProof`; the task record itself
  moves `CREATED → PROCESSING → ARTIFACT_READY → SAVED`. No owner/artifact schema change was needed:
  the v2 SAVED entry and its proof bind Artifact facts, not the fixture engine that produced them.
- **133 public provider interface:** `request.modality` accepts `preset` (the existing Qwen
  CustomVoice preset path); `clone`/`design` stay accepted by the claim contract but are not wired in
  this task. The coordinator calls the audited provider's real public `beginSynthesis(request,
  context)` with exactly `{text, voiceId, language, emotion}`, and passes the Task id as context
  (`{claimId, taskId}`) — the provider derives the preset modality from `voiceId` and rejects
  unknown request keys. The first concrete wiring is `createQwenProvider` + the existing Fixture
  worker (a local child process; no model, no network).
- `SAVED` never implies delivery, never allocates a `deliveryId`, and never touches the relay.

## 3. Explicit limits / not done (136 status)

1. **Original-task SAVED (132: completed).** `taskOwner.saveArtifact` records the already-imported
   provider Artifact on the birth task; reopen reads the same `SAVED`/`READABLE` artifact from the
   persisted owner and library stores. It does not synthesize and does not create a second task or
   asset store.
2. **Catalog/owner authority is injected** (and the owner handle is required). The unit tests use a
   real catalog birth/owner store with a deterministic injected authority; the existing owner tests
   remain the authority for catalog issuance and owner invariants.
3. **Provider is injected** and 135's Core entry receives an already started audited provider; 133
   wires the real `createQwenProvider` public interface to the existing Fixture worker
   (`test-fixtures/fake-qwen-worker.mjs`, a Node child process). No model, GPU, real inference,
   network or cloud path is started; clone and VoiceDesign remain unwired.
4. **No enabled generation in the installed Host.** The formal routes (136) and the client bridge
   methods exist, but the production assembly supplies no generation runtime, so the 音色中心 page
   honestly shows `生成未启用` (`503 generation_not_enabled`) and nothing is generated. The flow only
   runs in the isolated Host harness below. No production write, no real model and no UI claim of real
   readiness.
5. The `expiresAt` window (24 h) is used only for the Artifact library entry, not a delivery/TTL policy.

## 4. Tests

`test/provider-generation-offline.test.mjs` (12 tests, synthetic WAV in a temporary sandbox):

- prepare → submit → SAVED artifact, joint proof, original task SAVED, double-submit no resynthesis;
- 132: the provider result is saved by the original task and survives a full reopen (the same test
  fails on the baseline as `TASK_OWNER_NOT_FOUND` when the task owner write is missing);
- unsupported version, denied rights, duplicate/conflict/cross-scope, over-long text, refused authority;
- invalid or over-limit provider output (sample rate, channels, duration) → FAILED with no artifact;
- cancel ACK + late result → CANCELLED; unknown result → UNKNOWN and no resynthesis;
- failed artifact write → `SAVE_UNKNOWN` tombstone, no resynthesis;
- readback mismatch → `SAVE_UNKNOWN` tombstone;
- closed coordinator rejects new claims.

`test/qwen-generation-wiring.test.mjs` (1 test, real `createQwenProvider` + existing Fixture worker):

- 133: a legal CustomVoice preset request (`modality:'preset'`, `voiceId:'demo-voice-a'`) is accepted,
  synthesises once through the real public `beginSynthesis`, the bytes match the Fixture worker's
  deterministic output, the original task is SAVED, and a reopen reads the same artifact. On the
  baseline the same test fails as `PROVIDER_GENERATION_INPUT_INVALID` / `request.modality`.

`tests/ui` Studio page harness (137, test-only isolated Host assembly; the production Host keeps
generation disabled):

- the existing Chinese 音色中心 page uses the production bridge contract
  (`window.__WHALE_SETUP__.getGenerationCatalog/generatePreset/getGenerationStatus`) served by
  `tests/ui/host-generation-assembly.mjs`, which runs the real 136 Host routes over the 140 formal
  runtime assembly (real supervisor/provider/discovery, 135 Core entry and the Fixture worker); the
  page loads the discovered preset voices, submits a short text, queries the returned Task ID through
  the status route, shows the original task `SAVED`, and after a browser reload queries the same saved
  result by its locally remembered Task ID; a second run mints a different task id. With the Host
  runtime absent the page shows `生成未启用` and never a success state. UI suite **74/74**.
- `test/core.test.mjs` also executes the production bridge script in a VM: `generatePreset` posts to
  the formal route with the per-process token, `getGenerationStatus` queries by Task ID, and a 503
  answer is returned as the `generation_not_enabled` envelope instead of throwing.

`test/preset-generation-app.test.mjs` (1 test, real `createQwenProvider` + existing Fixture worker):

- 135: the Core entry generates once from a preset voice, `status` reads the same saved Artifact facts
  from the original task, a second generation mints a different task, a reopened Core entry reads the
  first saved result again, and the Core source is asserted to have no test-bridge / Fixture-worker
  imports.
- 138: the saved generation records `origin: PROVIDER_GENERATION_FIXTURE` (on `generate` and `status`,
  and again after reopen), an ordinary Fixture import still records `FIXTURE_IMPORT`, and an unknown
  origin is rejected at `origin` before any write. On the baseline the first origin assertion fails as
  `undefined` because the provider result was only expressible as `FIXTURE_IMPORT`.
- 139: the issued task is `schemaVersion: 2` with `feature: provider-generation` and carries the
  Provider, preset voice, submitted text and Fixture rights (asserted on the persisted catalog record),
  and `generate`/`status`/reopened status return the same provider/voice/input facts. On the baseline
  the same test fails as `provider: undefined` because the birth task was a v1 Fixture task.

`test/host-generation.test.mjs` (1 test, formal runtime assembly + isolated Host scope/Connection):

- 136: the formal Host scope registers the generation catalog/status/generation routes; the catalog is
  read over the route, a POST submits a preset request through the Core entry and returns the real
  saved Task/Artifact facts, the status route queries the same task and Artifact, the existing
  token/Origin/connection gate still applies (401 for a wrong token, 405 for a wrong method), a second
  formal runtime assembly over the same sandbox queries the same saved result after the first Host is
  disposed, each assembly closes only its own worker, and a Host without a configured runtime answers
  `503 generation_not_enabled`.

`test/qwen-generation-runtime.test.mjs` (1 test, real supervisor/provider + existing Fixture worker):

- 140: the formal runtime assembles the worker discovery result (preset voices `示例音色 A/B`, model,
  backend, limits) into the same Core app, records exactly those provider facts in the persisted v2
  task, generates once to `SAVED` (`PROVIDER_GENERATION_FIXTURE`), queries it by Task ID, and `close()`
  stops the worker it created (a second close is a no-op; generation afterwards is refused).

`test/plugin-generation-config.test.mjs` (2 tests, formal plugin entry + real runtime + Fixture worker):

- 142: a JSON-serialized `generation` config passed to `apply(ctx, config)` makes the Host obtain its
  own temporary sandbox, assemble the existing runtime and expose the three generation routes; the
  catalog/`generate`/`status` calls then return the discovered voices, a `SAVED` task and the same
  saved result; disposing the plugin routes closes the runtime and removes the sandbox. Without the
  config (or with `enabled:false`) the routes answer `503 generation_not_enabled` and no runtime
  sandbox is created.

`test/plugin-generation-storage.test.mjs` (1 test, formal plugin entry + real runtime + Fixture worker):

- 143: a JSON-serialized config with `storageRoot` under a fresh test temporary parent makes the
  formal `apply` write one `SAVED` task at that explicit location; disposing keeps the marker and all
  three store files byte-identical; a second `apply` over the same location and config queries the
  original Task ID through the status route and returns the same Artifact, SHA-256 and origin, with
  every store file still byte-identical (the reopen only reads; it never re-synthesises). On the
  baseline the configured location is never created because the config surface had no storage
  location.

`test/settings-draft.test.mjs` (2 tests):

- 144 store: an empty read, save → a reopened store over the same sandbox reads the same draft, the
  on-disk shape is the fixed three-key record, and empty/relative/non-string locations are rejected
  without changing the saved draft.
- 144 Host route: save/re-read on the same storage context, a new Host assembly over the same sandbox
  serves the same saved value, 400 for invalid input, 401 for a wrong token, 503
  `settings_draft_unavailable` without a draft store, and the generation routes still answer
  `503 generation_not_enabled` (the draft flow starts no generation service/Worker/model).
- `tests/ui` settings page: the real Host draft route is called from the page; saving a location shows
  "草稿已保存，尚未应用", and a page reload reads the same saved value back (UI **75/75**).

`test/plugin-settings-draft.test.mjs` (2 tests, formal plugin entry through `apply(ctx, config)`):

- 145 wiring: a JSON-serialized `{ settings: { draftRoot } }` config makes the formal `apply` open the
  configured trusted storage itself; the Host draft route saves one location, a normal dispose keeps
  the marker and file, and the same serialized config reopened through the formal entry reads the same
  value back. Generation stays explicitly off (`503 generation_not_enabled`) throughout.
- 145 no config: `undefined`, `{}`, `{ settings: {} }` and a `generation`-only config all leave the
  draft route at `503 settings_draft_unavailable`.

`test/plugin-generation-applied-storage.test.mjs` (2 tests, formal plugin entry + existing Fixture Worker):

- 146 applied location: with locations A and B under a fresh test temporary parent and the serialized
  config naming A, a generation saves in A; saving the draft B (without applying) and applying B both
  leave the current runtime writing to A; a normal dispose keeps A and the applied fact; the same
  serialized config reopened through the formal entry reads the applied fact and the next simulated
  generation is saved in B, while A's catalog bytes and history stay untouched (no migration).
- 146 disabled generation: a draft-only config saves and applies a location while generation stays
  `503 generation_not_enabled`; applying creates no location and reopening the same config reads the
  applied fact back without starting a Worker/model.
- `tests/ui` settings page: save → 应用保存的位置 → "已应用，下次重开插件生效" → reload reads the saved
  draft and the applied fact back; 147 asserts the applied status is exactly "已应用位置：…" after the
  reload (the old "下次重开插件生效；当前运行仍用原位置" wording fails that check), while the separate
  operation explanation still says applying does not switch the running component.

`test/qwen-runtime-draft.test.mjs` (3 tests):

- 148 store: an empty read, save → a reopened store over the same sandbox reads the same model/Python
  paths, the on-disk shape is the fixed four-key record, and empty/relative values are rejected without
  changing the saved draft.
- 148 formal plugin: a serialized `{ settings: { draftRoot } }` config saves both paths through the Host
  route, a normal dispose keeps the file, and the same config reopened through the formal entry reads
  the same values back while generation stays `503 generation_not_enabled` (nothing is applied).
- 148 no store: the route stays `503 settings_draft_unavailable`.
- `tests/ui` settings page: fill both paths → 保存运行路径草稿 → "Qwen 运行路径草稿已保存，尚未应用" →
  reload reads both values back (UI **76/76**).

`test/plugin-qwen-runtime-applied.test.mjs` (2 tests):

- 149 adoption: a draft-only config saves the runtime paths; reopening with a generation config whose
  old Python path does not exist still fails (save-only does not change the assembly source); after an
  explicit apply, the same config assembles the existing Fixture Worker with the applied Python program
  and the applied `--model-dir` (the worker records its received argv in the test), and one simulated
  generation is SAVED under the existing owner/artifact save.
- 149 disabled generation: saving and applying the paths with generation disabled stays
  `503 generation_not_enabled`, creates no Worker, and the applied fact survives a reopen.
- `tests/ui` settings page: save → 应用运行路径 → "Qwen 运行路径已应用，下次重开插件生效" → reload shows
  the persisted "已应用运行路径：…" fact and both saved paths (UI **76/76**).

`test/generation-results.test.mjs` (3 tests, existing Fixture Worker):

- 151 Core list: an empty scope lists nothing; two generations are both listed with their original
  task/artifact/SHA-256/byte length/origin/created-at, each downloads its own saved bytes, no task is
  added, and the same isolated config reopened lists the same two results and returns the same bytes.
- 151 Host route: `GET /whale-voice/setup/generation/results` returns the two saved results as JSON
  without adding a task, 401 for a wrong token, and 503 `generation_not_enabled` without a runtime.
- 151 scope: the owner's read-only saved-result list returns the app scope's entry and stays empty for
  another scope.
- `tests/ui` Studio page: an empty saved-result list first, then two generations appear as two
  selectable entries; selecting each one and using 下载已保存音频 downloads that result's own bytes;
  after a page reload both entries are still selectable and the first result's bytes still match; the
  generation-request count stays 2 (UI **76/76**).

`test/generation-download.test.mjs` (2 tests, existing Fixture Worker):

- 150 Core download: a saved generation downloads the same bytes (SHA-256 and byte length match the saved
  result), the original artifact ref/origin are kept, a second download returns identical bytes and adds
  no task, and an unknown task is rejected with `PRESET_GENERATION_DOWNLOAD_REJECTED`.
- 150 Host route: `GET /whale-voice/setup/generation/download?taskId=…` returns 200 `audio/wav` with an
  attachment file name and the saved bytes, 404 for an unknown task, 401 for a wrong token, and 503
  `generation_not_enabled` without a runtime.
- `tests/ui` Studio page: generate → 下载已保存音频 → downloaded file matches the displayed SHA-256/size;
  a second saved task, a page reload and a second download of the restored task return the same saved
  bytes and the generation-request count stays unchanged (UI **76/76**).

`test/plugin-applied-settings-recovery.test.mjs` (4 tests, existing Fixture Worker):

- 154 applied runtime: a saved-then-applied runtime program that does not exist makes the reopened
  plugin install the settings entry, report `FAILED/runtime_unavailable` on the assembly route and keep
  generation `503`; saving and applying a working program through the page routes, then reopening the
  same config, reaches `READY` and saves a new original task.
- 154 applied storage: a saved-then-applied storage sub-directory under a plain file reports
  `FAILED/storage_unavailable` with the unusable location in the message; correcting it through the
  page routes and reopening saves the Fixture generation in the corrected location.
- 154 damaged storage record: a truncated `generation-settings-applied.json` reports
  `FAILED/applied_storage_invalid`, the settings GET still answers 200 with `appliedError` and the saved
  draft, and saving + applying repairs the record; the reopened config reaches `READY`.
- 154 damaged runtime record with generation off: a truncated `qwen-runtime-applied.json` keeps the
  plugin and settings page open (`DISABLED`, generation still `503`), the GET returns `appliedError`,
  saving + applying repairs it, and a reopen still starts no generation.
- `tests/ui` settings page: the assembly failure reason is visible (`FAILED` state), a rejected status
  request shows 「无法读取生成运行状态…不代表生成正常或未启用」 with the settings entry still usable, and
  both damaged applied records are repaired through the normal save + apply actions (UI **80/80**).

`test/plan10-r1-persistent-generation.test.mjs` (2 tests, existing Fixture Worker):

- 155 continuous use: 66 consecutive generations in one explicit persistent location keep returning
  SAVED, crossing the old 32/64-record and cumulative 4 MiB budgets; the first, middle and last
  results download with their stored bytes; a reopen two days later lists all 66 results and still
  downloads and reports the old ones as readable (the recorded 24 h expiration is not a retention
  limit for saved generation artifacts), and nothing is re-generated.
- 155 write failure: after one saved result, the next catalog write is made to fail on the real
  isolated storage (read-only target on Windows, read-only storage root elsewhere); the generation
  returns failure instead of SAVED, and after restoring the permission and reopening the earlier
  result is still listed and downloads its original bytes.

`test/plugin-generation-wait.test.mjs` (4 tests, existing Fixture Worker; the production client bridge
script runs over real Host routes):

- 156 slow success: a 16 s Fixture synthesis inside a 30 s effective limit returns SAVED through the
  production bridge `generatePreset` after more than 15 s, the catalog publishes `generationTimeoutMs`,
  and exactly one saved result/task exists.
- 156 backend timeout: a 1 s effective limit with a slower synthesis returns an explicit failure payload
  (never SAVED) and no saved result is listed.
- 156 client abort: a request aborted by the client's own wait returns
  `{ok:false,error:'generation_unconfirmed'}`, not success or a chosen failure.

- 157 v1.1 paired slow requests: with a 20 s effective limit and a 16 s synthesis, two simultaneous
  requests through the production bridge finish inside the client's 30 s wait; neither returns
  `generation_unconfirmed`, any success is SAVED, a provider that cannot run both rejects the extra
  request honestly, and the saved-result list matches the successes. The previous whole-generate queue
  fails this check at 30 s.

`test/plan10-r1-concurrent-generation.test.mjs` (1 test, existing Fixture Worker):

- 157 boundary concurrency: after 24 saved results, two simultaneous generations at the segment
  boundary return real results (SAVED or an honest failure), the same-session `results()` lists the old
  and new tasks, an old result downloads its original bytes, and a later normal generation still
  succeeds; exactly one new segment exists. The previous revision fails this `results()` call with the
  owner store error.

Full suite after this unit: **1191 tests / 1187 pass / 4 platform skips / 0 fail**; UI **80/80**; build
`client.js` unchanged (374,229 bytes; 157 touches Core generation only).

## 5. What a real trial would still need (not executed, not authorized)

- A trusted provider configuration surface (model path/identity, interpreter, GPU use) and a separate
  runtime permission for `start/health` and synthesis.
- Fixed short text, 1–3 requests, a bounded timeout, an isolated temp root and a snapshot budget.
- No CPU/cloud fallback claim: the Qwen manifest requires GPU and the product does not support CPU
  fallback.
