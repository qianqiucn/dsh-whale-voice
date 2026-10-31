# AI Context — Whale Voice

**Purpose:** compact cross-session recovery note. This is a summary, not an authority. Re-verify
against the repository, Git/GitHub, tests and the linked authoritative documents before acting.

**Last updated:** 2026-10-29

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
       -> WeChatAgent / Voice Sender status
       -> separate Voice Sender UI Automation for real voice delivery
```

See [ARCHITECTURE.md](ARCHITECTURE.md) and
[TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md).

---

## 2. Git baseline

- **Plan 08-E-E-B Step 1 (2026-10-31):** `core/audio/fixture-store-base-internal.mjs` now holds the verified shared store helpers (15 internal exports); the Task store re-exports the ten former shared bindings with the same identity and the Artifact store imports the same eight helpers from the base. Behaviour, file names, budgets, parsers and locks are unchanged; B01 covers the binding identity, both import orders and one VM fs-proxy marker fault. Save runtime/v2/proof were still unimplemented at this step (implemented offline later by 08-E-C); parent E-E and Plan 08 are `IN_PROGRESS`.
- **Current main (2026-10-30):** `M 08cf0b61acc402d619618df2ad15bce5436b0873` (merge of PR #37, Plan 08-E-D/F01; tree `7a6abf13…`). E-D/F01 is `DONE` / `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `MERGED` / `NOT_INTEGRATED`; parent Plan 08 is still `IN_PROGRESS`. The owner is still `{run,get}` with `SIMULATED`/`NO_EXECUTION` FINAL only, and the artifact library still stores `FIXTURE_IMPORT` only. **Plan 08-E-E-A** adds the candidate same-claim save-transaction contract `docs/TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md` (now **v1.1**, revised per 071 R1–R3: real revision weighting `CLAIMED=1`/`FINAL=2`, old-binary v2 `STORE_INVALID`, `audio-task-owner-v1.json`, `^task:fixture-[0-9a-f]{32}$`, store constants at `fixture-artifact-store-internal:40-46`, seven-key import, eight-key save with engine `input`, strict `SaveProof` with recomputed `artifactIdentityHash`, current-rights `artifactStatus`, single owner writer with proof parameter, Artifact-queue deletion window, catalog+owner lock matrix, gates-before-success steps) — `PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED`; it is not a runtime or code authorization, and **v1.2** (072) then calibrates the real source lines (engine 994/971/755/761/769-782, library writer 715/800-838/845/851-873 with :889 = INTERNAL_FAILURE, Task writer 803/869-885/889/895-918), makes the internal SaveProof a mandatory CLAIMED→SAVED delta rule, completes the four-method/status protocol and one consistent example set, and fixes the non-reentrant importInQueue primitive plus the base dependency closure. **v1.3** (073) then separates claim vs candidate versions, makes the 791-byte CLAIMED example reproducible (`e30bee44…`), upgrades SaveProof to two-sided operands with the 19-key inspection, restores the exact `run`/`get` EXISTING/FOUND semantics, adds the standalone `artifactStatus` schema, the full compatibility table, the module/signature DAG (`readStoredForSave`/`importInQueue`) and an 18-category failure matrix with separate claim/FINAL/artifact rename counts. **v1.4** (074) then restores the mandatory CLAIMED→SAVED delta and the strict 11+8-key `SaveProof` (with `evaluatedAt`), adds the 12-key save success value, the 6-key `artifactStatus` priority table, the 22-code/fact-mapping tables, the fixed `writeOwner(...,proof)` path, the `readStoredForSave` contract, the base re-export/edge table and nine real-fs fault representatives with attempt/success counts. **v1.5** (075) then corrects the budget provenance, adds the proof field/limit table, the general input/projection/failure protocol, the migration symbol table, FC/FS/FT/FA fact IDs, the corrected FINAL-rename count, the discovery-phase table and the per-representative evidence table with C/O1/O2/A1/OF/AF and R/E-I counts. **v1.6** (076) then fixes the fact-ID consistency: FC=CLAIMED, FS=FINAL SAVED only, no IDs on no-entry/old FINAL rows, FA layered on the existing Task fact, joint-confirmation split into Task/Artifact first errors, and §8.1/§8.2 referencing the exact discovery events. Runtime still not implemented; implementation needs a separate formal plan.
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

`openFixtureTaskOwner` returns `{run,get,save,artifactStatus}`. `save` runs one complete same-claim
attempt on the trusted Fixture sandbox: eight-key request -> fresh birth/association gate -> existing
FINAL/CLAIMED dispatch -> one CLAIMED -> one real bytes engine -> one Artifact import while holding
the Artifact queue -> `ATTACH_FAKE_ARTIFACT`/`MARK_SAVED` -> strict `SAVED` FINAL with a frozen
`SaveProof` -> joint confirmation. Public `schemaVersion` stays `1`; the owner file becomes `v2` only
when a SAVED FINAL exists. `artifactStatus` reports the frozen six fields in the fourteen-step order.
Twenty-two public error codes now exist; the eight new ones carry fixed reasons. Nothing here is
production, real generation, rights verification, delivery or Host integration.

The F01 close-out then finished the remaining offline evidence with no new capability: the
protocol/native-carrier guards for the result, production and inspection fields (complete canonical
19-field inspection, `peak 0..1`, safe `states` capture with the birth constraint, no
`@@toStringTag` guess), all local static proof rules before any store read, the known-field
accessor path, the eleven-row fs-fault matrix inside the shared VM graph, and §4.3
compatibility/concurrency (a v2 store surviving a legacy `run` append, concurrent saves, the
old-main isolation read, a legal delete queued behind a save, and both documented examples executed
as written). 085 v1.3 then added the full canonical-19 comparison against the real bytes, the static proof gate before any fresh read, the uniform eleven-row evidence with a true post-writer JOINT, legal OFFLINE/NO_EXECUTION settlements, fixed EXISTING concurrency, a delete queued inside the held Artifact window and fully inlined documented examples. Suite **754 / 751 pass / 3 platform skips / 0 fail**, owner + save specialty **71/71**;
branch `feature/plan08e-owner-save`, PR #40 open and unmerged. `OFFLINE` / `FIXTURE_ONLY` /
`NOT_INTEGRATED`; real Host/GUI, real TTS/media, delivery and production remain unverified.
