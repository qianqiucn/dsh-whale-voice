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
  `tests/ui/host-generation-assembly.mjs`, which runs the real 136 Host routes, the 135 Core entry, the
  real `createQwenProvider` and the Fixture worker; the page loads the preset voices, submits a short
  text, queries the returned Task ID through the status route, shows the original task `SAVED`, and
  after a browser reload queries the same saved result by its locally remembered Task ID; a second run
  mints a different task id. With the Host runtime absent the page shows `生成未启用` and never a
  success state. UI suite **74/74**.
- `test/core.test.mjs` also executes the production bridge script in a VM: `generatePreset` posts to
  the formal route with the per-process token, `getGenerationStatus` queries by Task ID, and a 503
  answer is returned as the `generation_not_enabled` envelope instead of throwing.

`test/preset-generation-app.test.mjs` (1 test, real `createQwenProvider` + existing Fixture worker):

- 135: the Core entry generates once from a preset voice, `status` reads the same saved Artifact facts
  from the original task, a second generation mints a different task, a reopened Core entry reads the
  first saved result again, and the Core source is asserted to have no test-bridge / Fixture-worker
  imports.

`test/host-generation.test.mjs` (1 test, isolated Host scope/Connection assembly + real Core entry):

- 136: the formal Host scope registers the generation catalog/status/generation routes; the catalog is
  read over the route, a POST submits a preset request through the Core entry and returns the real
  saved Task/Artifact facts, the status route queries the same task and Artifact, the existing
  token/Origin/connection gate still applies (401 for a wrong token, 405 for a wrong method), a new
  Host + Core assembly over the same sandbox queries the same saved result after the first one is
  disposed, and a Host without a configured runtime answers `503 generation_not_enabled`.

Full suite after this unit: **1160 tests / 1156 pass / 4 platform skips / 0 fail**; UI **74/74**; build
`client.js` **320,456 bytes** (the 137 page wiring is the bundle change).

## 5. What a real trial would still need (not executed, not authorized)

- A trusted provider configuration surface (model path/identity, interpreter, GPU use) and a separate
  runtime permission for `start/health` and synthesis.
- Fixed short text, 1–3 requests, a bounded timeout, an isolated temp root and a snapshot budget.
- No CPU/cloud fallback claim: the Qwen manifest requires GPU and the product does not support CPU
  fallback.
