# Project Status

**Project:** Whale Voice / `dsh-whale-voice`
**Version:** 0.1.0
**Repository:** https://github.com/qianqiucn/dsh-whale-voice (public; corrected 2026-10-29 after re-checking GitHub metadata — earlier "private" wording was inaccurate)
**Updated:** 2026-10-30
**Current main:** `08cf0b61acc402d619618df2ad15bce5436b0873` (merge of PR #37, Plan 08-E-D/F01). E-D/F01 is `DONE` / `OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `MERGED` / `NOT_INTEGRATED`; any older “awaiting 067/068” wording below is historical.
**Plan 08-E-E-B Step 1:** shared store base extracted (`fixture-store-base-internal.mjs`), Task store re-exports the same ten bindings, Artifact store imports the same eight helpers; old behaviour and files unchanged, B01 green, save runtime still `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`.
**Plan 08-E-E-A:** candidate same-claim save-transaction contract at [TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md](TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md) — **v1.6** after the 071–076 R1–R3 review (`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED`); owner still only `run`/`get`, library still `FIXTURE_IMPORT` only, no task save exists.
**Current stage:** P0/P9 baseline complete; P7 Phase 2 UI complete; Phase 3A `OFFLINE`; Phase 3B `INTEGRATED`; **Phase 4A read-only config `INTEGRATED`** (real Host + bridge + eight-page GUI readout), not `VERIFIED`; `发送与安全` frontend is `MOCK`/disabled with **real DSH GUI visual acceptance PASS**; native voice research is `RESEARCH_CANDIDATE` (WeChatAgent native `UNSUPPORTED`); Phase 4A-H safety contracts fixed; **PR #3–#15 integrated into `main` with merge commits**; **Phase 4B-1 isolated config write is merged and `OFFLINE`**; **Phase 4B-2A coordination protocol is merged and `OFFLINE`**; **Phase 4B-2B-1 audit is `AUDIT COMPLETE` / `OFFLINE`**; **Phase 4B-2B-2a read-only capability/status projection is `INTEGRATED`** (real Host/GUI, full eight-page coverage; no write route); **Phase R1 `COMPLETE`**; **TTS-A Provider-neutral audit + pure contracts are `DESIGN`/`OFFLINE`** (no provider connected); **Phase 4B-2B-2b NOT STARTED**; **Plan 08-A shared voice-asset binding is `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; **Plan 08-B Fixture source association is `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; **Plan 08-C task fixture runner is `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; **Plan 08-D-A isolated task catalog is `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` and merged via PR #30**; **Plan 08-D-B existing-record internal reuse is `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` and merged via PR #32**; **Plan 08-D-C persistent owner and Plan 08-E-A WAV byte inspector are `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` and merged via PR #33/#34**; **Plan 08-E-B isolated WAV artifact library is `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` and merged via PR #35 at `main` M `78c3ea0`** (report 0058); **Plan 08-E-C restricted PCM16 fixture producer is `OFFLINE` / `SYNTHETIC_FIXTURE` / `NOT_INTEGRATED` (new branch, PR open, not merged)**
**Latest associated commit:** `main` `55675a79068ab1f731c54f8992c2d4367e6577a2` (merge of PR #34, Plan08-E-A); earlier baselines include `e7fc5f4` (PR #33 merge), `dd536f7` (PR #32 merge), `2090943` (PR #30 merge) and `bf9cf66807e12d0b25872a0fa3869962dde04818` (PR #15 baseline); pre-integration backup tag `pre-pr3-8-integration` points to `b552ac0`
**Latest merged PR:** [#34 — feat(audio): add bounded WAV byte inspector](https://github.com/qianqiucn/dsh-whale-voice/pull/34) — merged, merge commit `55675a7` (report 0054). The older PR #33/#32/#30/#29 lines below are historical snapshots.
**Acceptance caveat:** Node/UI checks are offline/contract evidence unless explicitly marked real Host/GUI acceptance. Phase 4B-1/4B-2A/4B-2B-1 remain `OFFLINE`; Phase 4B-2B-2a is `INTEGRATED` after the authorized DSH Host/GUI acceptance. TTS-A adds no production provider, credential store, write route or audio path.
**PR #16 pre-merge checkpoint (Plan 03-A):** engineering HEAD `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773`; PR **OPEN, not merged**; CI run `40163881122` build+ui **SUCCESS**; `node --test` **197 tests / 196 pass / 1 platform skip**; `npm.cmd run test:ui` **24/24**; F01–F05 and N01–N05 complete. TTS-A remains **`DESIGN`/`OFFLINE`**. The earlier 192/191/1 snapshot is a **historical pre-F01–F05 checkpoint**, retained below. GitHub records **0 reviews**; CI is not human approval. Merge requires separate, explicit user authorization.
**PR #16 pre-merge repair (Plan 03-A-F01, 2026-10-26):** SVC input boundary hardened in `core/svc/svc-contract.mjs`: fixed-layer descriptor validation (plain objects only, enumerable string-keyed data properties, ≤32 own keys, no getter/setter/Symbol/hidden bypass, zero getter invocations), strict result-root and `delivery` allowlists with redacted `<unknown-key>` paths, canonical UTC `createdAt` (absent/`undefined`/`null` → `null`), and freshly built output objects with no input or cross-call sharing. `test/svc-contract.test.mjs` keeps the original 5 security-intent tests and adds R01–R24 (29 SVC tests total). Current local evidence: `node --test` **221 tests / 220 pass / 1 platform skip**; TTS provider **16/16**; UI **24/24**; `node build.mjs` passes with **no `client.js` change**. PR **#16 remains `OPEN`, not merged**; the merge recommendation stays **`BLOCKED_PENDING_SVC_FIX`** until the repair HEAD is reviewed and its own build/ui CI is verified. TTS-A remains **`DESIGN`/`OFFLINE`**; this repair adds no provider, SVC runtime, model, model download, send or WeChat capability. The earlier 197/196/1 checkpoint remains historical and is not superseded as evidence for the old HEAD.
**Plan 06-B branch:** `feature/plan06b-provider-instances` — offline Fixture provider-instance view and explicit capability negotiation (`core/audio/provider-instances.mjs`, R01–R30 + N01–N18, pure/no I/O); after the Plan06-B-F01 review repair, new tests **48/48**, full suite **431 / 430 pass / 1 platform skip / 0 fail**, UI **24/24**, build with no `client.js` change. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #24 at **M `ad25bc6`** (report 0013). It adds no real provider, adapter, model, credential read, synthesis, task scheduling, Artifact or send capability. Older `#16 OPEN` / `bf9cf66` lines above are historical pre-merge snapshots.
**Plan 06-C branch:** `feature/plan06c-rvc-fake-dispatch` — one synchronous RVC Fixture dispatch (`core/audio/provider-dispatch.mjs`) over the accepted 06-B negotiation, the existing RVC Fake gateway and its existing result validator, plus the shared `core/audio/fixture-input-boundary.mjs` extraction. New tests **34/34** (T01–T26 + F01/F02); full suite **465 / 464 pass / 1 platform skip / 0 fail**, UI **24/24**, build with no `client.js` change. The F01/F02 review repair freezes every success/error envelope and restores null-prototype copying. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #25 at **M `b9336fb`** (report 0016). TTS dispatch, 08 mapping, real Provider/model/audio/task/Artifact/Relay/send remain unimplemented.
**Plan 06-D branch:** `feature/plan06d-provider-readiness` — Fixture installation/resource admission wrapper (`core/audio/provider-readiness.mjs`) over the 06-B negotiation and 06-C dispatch; installation PRESENT/ABSENT/UNKNOWN, CPU/GPU/REMOTE admission, explicit observation table, optional single existing RVC dispatch. New tests **27/27** (D01–D27); full suite **492 / 491 pass / 1 platform skip / 0 fail**, UI **24/24**, build with no `client.js` change. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #26 at **M `a1bdcbb`** (report 0019). Plan06-D-F01 adds the D27 cross-category evidence table and `TEXT_UPLOAD_NOT_CONFIRMED` namespace clarification as docs-only changes; core/test blobs are unchanged. No real install/hardware probe/TTS synthesizer/queue/08 mapping.
**Plan 08-A branch:** `feature/plan08a-voice-assets` — strict Fixture `FixtureVoiceAssetLibrary v1` and an explicit Provider binding resolver (`core/audio/voice-assets.mjs`, four pure exports, 27 fixed error codes, V01–V26 / 28 tests): one shared `voiceProfileId` maps to per-instance TTS voice ids or RVC model ids, with independent task/profile/asset rights, revisions, availability/expiry and exact canonical candidate plus Provider voice/model reference matching. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #27 at **M `df4e4b7`** (report 0022); no dispatcher, task advance, Artifact, TTS text↔Artifact linking, queue, GUI or Host route. Full suite **520 / 519 pass / 1 platform skip / 0 fail**, UI **24/24**.
**Plan 08-B branch:** `feature/plan08b-source-artifacts` — strict Fixture `FixtureSourceLibrary v1` and a resolver (`core/audio/source-artifacts.mjs`, four pure exports, 18 fixed error codes, S01–S22 / 25 tests): reuses the 08-A voice binding exactly once, resolves the task source by ref+scope, checks source revision/rights/availability/expiry, then compares TTS text by strict code-unit equality or SVC input-audio metadata (durationMs/byteLength/sampleRate/channels) with the same request. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #28 at **M `3182ca1`** (report 0024); no bytes/codec/hash/peak, dispatcher, task advance, queue, GUI or Host route. Full suite **545 / 544 pass / 1 platform skip / 0 fail**, UI **24/24**.
**Plan 08-C branch:** `feature/plan08c-task-fixture-runner` — one synchronous composition (`core/audio/task-fixture-runner.mjs`, three pure exports, 14 fixed codes, C01–C20 / 20 tests) of the 08-B source check, 06-D pure readiness gate, at most one existing RVC Fixture dispatch and the existing AudioTask v1 create/transition/validate/project actions; success ends at the existing `ARTIFACT_READY` with a Fake reference only and never `MARK_SAVED`/Relay/send. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #29 at **M `b9f663c`** (report 0026); full suite **565 / 564 pass / 1 platform skip / 0 fail**, UI **24/24**.
**Plan 08-D-A branch:** `feature/plan08d-task-catalog` — an isolated persistent catalog (`core/audio/task-catalog.mjs`, three exports, 15 fixed codes, D01–D20 + F01–F05 + R01–R03 + S01–S03 + C03a–C03h / 45 tests, 44 pass + 1 platform skip) over the trusted temporary sandbox: stores only initial `CREATED`/`BLOCKED_RIGHTS` records, issues owner `task:fixture-<32hex>` ids, deduplicates by `(scopeId, idempotencyKey)`, uses one fixed bounded file, a per-capability queue, bounded fd reads, full short-write completion, atomic temp+fsync+rename+read-back, post-commit identity checks, close-failure phase propagation, one close per open lease, cleanup trust-failure classification, one-shot cleanup eligibility and corruption-before-change priority. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #30 at **M `2090943`** (report 0032); no execution, save, delivery, cross-process recovery or production storage. Full suite (at D-B branch) **623 / 621 pass / 2 platform skips / 0 fail**, UI **24/24**.
**Plan 08-E-A branch:** `feature/plan08e-wav-bytes` - a bounded, storage-free WAV byte inspector (`core/audio/wav-byte-inspector.mjs`, 4 exports, 8 fixed codes, W01-W08 / 8 tests) that consumes caller bytes through a native Uint8Array/Buffer slot check, copies only the view's own offset/length, walks the complete RIFF/WAVE container inside 50 MiB / 300000 ms / 128-chunk budgets (PCM16, six sample rates, 1-2 channels) and returns a deep-frozen 19-key measurement (frames, unrounded duration, peak, full-scale count, whole-file SHA256) or one fixed error. It has no file/network/process/clock/random/playback/decoder access and no Task/owner/store/ID/delivery interaction; the result is internal inspection metadata, not a registered Artifact or a rights/generation/save/send proof. The F01 close-out fixes the detached-carrier classification (`INVALID_BYTES`/`bytes`; empty bytes stay `INVALID_CONTAINER`) with a species-free probe that never reads the caller constructor/`@@species`, passes the W06 carriers at the real native level, adds a legal exactly-50 MiB success control and seven inner chunk-representative refusals. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; merged via PR #34 at **M `55675a7`**; full suite **666 / 664 pass / 2 platform skips / 0 fail**, build unchanged.
**Plan 08-E-B branch:** `feature/plan08e-artifact-library` — an isolated single-pack Fixture WAV artifact library (`core/audio/artifact-library.mjs`, 4 exports, 16 fixed codes, L01–L10 / 22 tests) over the trusted temporary sandbox, plus the private `core/audio/fixture-artifact-store-internal.mjs`. `openFixtureArtifactLibrary({sandbox})` returns a frozen handle with four async methods `import`/`get`/`readBytes`/`delete`: a synchronous pre-queue owned copy of the caller's real `Uint8Array`/`Buffer` view, one verified 08-E-A inspection of exactly the bytes that are encoded, a canonical STORED entry with `origin: FIXTURE_IMPORT` and a library-issued `artifact:fixture-bytes-<32hex>` id (3-attempt collision bound), `(scopeId, requestKey)` idempotency (`EXISTING`/`KEY_CONFLICT`, `createdAt` never rewritten), scope/rights/expiry gates (GRANTED-only import and read proof match), fresh mutable independent `readBytes` copies, and `DELETED` tombstones with `payload:null` that never revive. The pack (`audio-artifacts-v1.json`) is read through a bounded strict-UTF-8/canonical-JSON/canonical-base64 parser that re-inspects every stored payload with the real inspector, and written through a single atomic temp+fsync+one-close+read-back+single-rename transaction with one-shot cleanup of its own temp: pre-rename failures are `WRITE_REJECTED` with the old bytes unchanged, any rename-attempt/commit uncertainty is `WRITE_UNKNOWN` with the actual pack kept and every existing/new handle returning `LIBRARY_UNKNOWN` (no rollback/retry/recovery/reset API). Budgets are 1 MiB per item, 4 MiB total stored decoded bytes, 32 entries including tombstones and 6 MiB for the pack. The artifact domain has its own queue, confirmed digest and lock and never modifies the Task catalog/owner files. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; same branch and PR #35, new HEAD, not merged. The F01 close-out (060) closes the four remaining gates: **R1** one shared identity algorithm recomputes and checks every STORED/DELETED `identityHash` (`STORE_INVALID`, no repair); **R2** the captured temp is re-confirmed (trusted path/identity/nlink/full bytes) after the last current read and immediately before the single rename (`STORE_CHANGED` + lock, zero rename, old pack kept, foreign temp never cleaned); **R3** any extra public confirmation failure after a committed delete is `WRITE_UNKNOWN` with the shared lock and the real tombstone kept (no rollback/retry, all handles `LIBRARY_UNKNOWN`); **R4** the L06 control is a genuine padded-base64 case (same legal 76 bytes, non-canonical re-encoding, `STORE_INVALID` no repair) and L10 is split into independent `L10a`–`L10f` with explicit platform SKIP reasons for hard-link/symlink while marker/cleanup/Task segments still run. The 061 v1.1 follow-up then closes the one remaining classification: the final temp re-read in that same window reports an oversize foreign temp (6 MiB+1) as `STORE_CHANGED`/`$` (not `RESOURCE_LIMIT`), with zero rename, old pack unchanged, the foreign temp retained byte-for-byte and both old handles plus a new factory `LIBRARY_UNKNOWN`; user/item/total/official-pack budget errors keep `RESOURCE_LIMIT`. Tests 22 (local 21 pass + 1 platform skip + 0 fail); full suite **688 / 685 pass / 3 platform skips / 0 fail**; build unchanged (`client.js` identical); no Task save/ownership, delivery, Host/GUI, cross-process lock, real media or physical erase. PR #35 merged this work into `main` at **M `78c3ea035e1c0a9e18d788503d9e65936022e505`** (report 0058); the source branch stays at H2 `0dc7af9`.

**Plan 08-E-C branch:** `feature/plan08e-fixture-wav-producer` — a pure, bounded PCM16 test-signal producer (`core/audio/fixture-wav-producer.mjs`, 4 exports, 7 fixed codes, C01–C08 / 8 tests): `produceFixtureWav({schemaVersion, sampleRate, channels, frameCount, pattern})` accepts exactly five own enumerable data fields (plain or null-prototype root, no getter/Symbol/hidden key), validates in a fixed order, and checks `frameCount <= floor((1048576-44)/(channels*2))` before any allocation (mono 524266 / stereo 262133 frames are exactly 1 MiB). It writes a standard 44-byte RIFF/WAVE PCM16 header and interleaved samples (`SILENCE` all zero; `EDGE_SEQUENCE` the fixed five-sample cycle), then calls the real 08-E-A `inspectFixtureWavBytes` exactly once behind a descriptor-only thin guard over the original success envelope and all 19 measurement keys; any throw/`ok:false`/`null`/missing/mismatching field is a single `DEPENDENCY_FAILURE` with no bytes and no retry. Success returns a frozen `{ok,value}` with `origin: SYNTHETIC_FIXTURE`, a fresh mutable `Uint8Array` (own backing store), the deep-frozen inspection and four fixed safety flags; the module signs no Task/Artifact/delivery id, reads/writes no Task state and is not a TTS/RVC result, rights proof or ownership. C01–C08 cover six sample rates × both patterns × mono/stereo byte-exact construction, three independent literal vectors, the structure/first-error matrix with zero getter invocations, the 1 MiB boundary and over-budget rejection without allocation or inspection, memory isolation, six injected inspector failures through a test-only module-link wrapper, and a real isolated 08-E-B import/get/readBytes/delete chain that keeps `origin: FIXTURE_IMPORT` and a library-signed id. Tests 8; full suite **696 / 693 pass / 3 platform skips / 0 fail**; build unchanged. Status **`OFFLINE` / `SYNTHETIC_FIXTURE` / `NOT_INTEGRATED`**, new PR open and unmerged; no Task save/ownership, delivery, Host/GUI, cross-process recovery or real user path. The F01 v1.1 close-out makes the inspector message comparison strict (the exact fixed Chinese text, so any other non-empty message is `DEPENDENCY_FAILURE` with no bytes), adds that seventh C06 fault, observes real output `Uint8Array` construction in C04 (two legal 1 MiB views that are the returned `bytes`, three rejects with zero output and zero inspection, internal inspector copy counted separately, worker state restored), and asserts C08 `maxByteLength === ARTIFACT_LIBRARY_LIMITS.maxItemBytes`; tests stay 8, full suite **696 / 693 pass / 3 platform skips / 0 fail**. Report 0059 was accepted as PARTIAL and this F01 is the close-out; the E-C status above is not a claim beyond offline evidence.

**Plan 08-E-D branch:** `feature/plan08e-task-bytes` — bounded byte preparation inside the single internal task engine (`core/audio/task-fixture-engine-internal.mjs`, sixth export `runExistingFixtureTaskBytesOnce`, frozen `TASK_FIXTURE_BYTES_ERRORS`, D01–D07 / 7 tests): after the same real Fake SUCCESS validation and before the legacy `ATTACH_FAKE_ARTIFACT`, it derives one request from the verified 44100 Hz integer `durationMs` (whole frames checked before the 1 MiB budget: 10 / 1000 / 11880 ms → 926 / 88244 / 1047860 bytes; 1 ms is `UNREPRESENTABLE_DURATION` and 11890 ms is `RESOURCE_LIMIT`, both before any producer call), calls the real 08-E-C producer exactly once behind a descriptor-only native-slot guard, then performs one `BEGIN_PROCESS` and returns a frozen private `{record, result, production}` with `PROCESSING`, `outputArtifactRef=null`, `hasOutput=false`, the unchanged 13-key SIMULATED envelope and the producer's own value. It never ATTACHes the Fake ref, never marks SAVED and never creates a second Task; producer faults are a single `TASK_FIXTURE_BYTES_DEPENDENCY_FAILURE` with null `record`/`production`, while legacy paths and non-SUCCESS/blocked results are unchanged with zero producer calls. Tests 7; full suite **703 / 700 pass / 3 platform skips / 0 fail**; build unchanged. Status **`OFFLINE` / `SYNTHETIC_FIXTURE` / `INTERNAL_BYTES_ONLY` / `NOT_INTEGRATED`**, new PR open and unmerged; the owner/save transaction is deliberately not implemented. **E-D-F01 (067)** closes the review groups in the same private flow: every bytes-entry exit is now exactly `{record, result, production}` with a frozen root and `production:null` on the four legal blocks (legacy `record`/`result` deep-equal, legacy two-key root unchanged); the carrier guard now reads native internal slots only, refuses `Int8Array`/resizable `ArrayBuffer` with the new dependency code and never runs own `byteLength`/`@@toStringTag` getters; D03–D07 add full record/result equality, a legal TTS control, passive construction observation, extra precheck representatives, `SAVED`/`UNKNOWN` legality proofs and one complete executable doc frame. Tests stay 7; suite **703 / 700 pass / 3 platform skips / 0 fail**; E-D overall is `IN_PROGRESS` / `REVIEW_REQUIRED` until 067 acceptance, PR #37 open and unmerged. **E-D-F01 v1.1 (068)** closes the remaining in-repo automatic evidence with product code unchanged: E1 actually executes the three post-bytes rejections after one real per-stage delegation each (fault hits 1, legacy `TASK_FIXTURE_TASK_TRANSITION_REJECTED/$`, original record strictly `null`, `production` strictly `null`); E2 pins D04's nine cases to the three-key frozen root, `production:null`, fixed `phase`/`reason` and absolute counts while recording raw `hasOwn(record)`/`record === null` before normalisation; E3 moves the own `byteLength`/`@@toStringTag` getter reps onto the produced ArrayBuffer carrier (0 calls, `PROCESSING`, same carrier). Tests stay 7; suite **703 / 700 pass / 3 platform skips / 0 fail**; PR #37 still open, 3 commits, unmerged.
**Plan 08-D-C branch:** `feature/plan08d-task-owner` — the verified catalog storage machinery is extracted into `core/audio/fixture-task-store-internal.mjs` (one implementation shared by the catalog and the new owner; one serial queue and one shared unknown lock per trusted capability, per-file confirmed digests) and `core/audio/task-owner.mjs` adds one accepted attempt per catalog birth task: atomic `CLAIMED`, one existing-record engine call, immutable-identity revalidation, `FINAL` with `SIMULATED`/`NO_EXECUTION` and revision weights 1/2, read-only repeats/reopen, confirmed-claim tombstones reported as owner `UNKNOWN`, corruption rejected without repair. The F01 close-out adds fresh restricted birth/association reads at the factory, `run`/`get` and the after-claim / after-engine / after-FINAL checkpoints (a broken or legally changed birth file stops the engine with 0 calls instead of surfacing on the next `get`; a failure after the real FINAL rename keeps the actual bytes and the shared lock and is never reported as `RECORDED`), a thin engine adapter requiring the frozen 13-key envelope, the four fixed safety flags and **complete structural equality with the real `projectAudioTask(record)`**, the fixed first-attempt `TASK_OWNER_EXECUTION_UNKNOWN` with later safe UNKNOWN projections and no new outcome/state/code/reset/retry API, and a private store that exposes only its two fixed files (module-constant name/budget/error domain/Schema; a caller-supplied name or parser is rejected before any I/O). D-C owner tests 20 (C01–C08, C10, T01–T06, E01–E05); specialty 113 (112 pass + 1 platform skip); full suite **658 / 656 pass / 2 platform skips / 0 fail**; build unchanged (`client.js` identical). Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; no delivery id, Host/GUI, cross-process recovery or real generation; PR #33 open and unmerged. Reports 0046/0047 were reviewed as PARTIAL; the 052 evidence is in report 0048.
**Plan 08-D-B branch:** `feature/plan08d-record-reuse` — the single internal engine `core/audio/task-fixture-engine-internal.mjs` (four exports) and the `task-fixture-runner.mjs` compatibility facade; `runExistingFixtureTaskOnce({scopeId, record, input})` reuses a complete initial `CREATED`/`BLOCKED_RIGHTS` record with original TaskId/scope/`observedAt`, never creates a second Task, never reconstructs from the projection and never persists a claim. The full record stays in the private `{record, result}`; the old three exports/14 codes/4-key input/13-key value are unchanged. The F01 v1.6 evidence close-out keeps product code read-only and separates the test-only worker **entry** (existing / internal draft / actual public) from the injected **fault**, deriving the `final` record-validator call index from the real entry; it adds the three-stage legal-refusal vs bad-protocol matrix, measured partition depths (`depth12` accepted, 13 rejected, owner `{scopeId,record}` 13 rejected), the legal cross-scope voice library (`VOICE_ASSET_PROFILE_UNAVAILABLE`), legal eight-domain identity controls, the `REMOTE` readiness policy, full-graph output isolation (all objects frozen, zero overlap with the actual input, repeat runs disjoint) and gate/dispatch vs RVC-result association stages. The v1.7 patch (still read-only product) makes every validator wrapper delegate to the real validator with the original arguments before injecting, separates input-delete legal refusal from a real success-payload `delete` and from `undefined` type controls, drives the same eight protocol kinds through the existing/draft/public `final` entry, and adds worker counts for three existing legal frames plus a `REMOTE` negative control, an owner value-budget control and per-object record frozen-state comparison. New D-B tests 28; full suite **638 / 636 pass / 2 platform skips / 0 fail**; build unchanged (`client.js` regenerates identically); UI **24/24** reused from the same-UI-tree baseline and re-run by CI on the new head. Status **`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`**; no cross-call idempotency, recovery, Host/GUI or real generation. PR #32 stays **OPEN**, not merged.
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

## Repository homepage documentation

The README now presents the project in plain Chinese with reviewed fictional UI previews, a
current-capability table and a clearly marked target Audio/Relay architecture. Development setup
and checks live in `docs/DEVELOPMENT.md`. This presentation change adds no provider, audio,
installation, configuration-write, task-execution or delivery capability. The preview images are
isolated demo captures, not real integration evidence.

### 08-E-C same-claim save — OFFLINE / FIXTURE_ONLY / PR pending

Implemented: `save`/`artifactStatus` on the isolated owner, owner snapshot v1/v2 with `SAVED`,
mandatory delta proof inside the only writer with pre/post gates, `readStoredForSave` and
`importInQueue`, plus `test/task-owner-save.test.mjs`. The 08-E-C-F01 close-out then completed the
remaining evidence offline: the K01 (complete canonical 19-field inspection, `peak 0..1`, safe
`states` capture with the birth constraint, no `@@toStringTag` guess), K02 (all local static proof
rules verified before any store read) and K03 (known-field accessor path) guards, the eleven-row
fs-fault matrix in one shared VM graph, and §4.3 compatibility/concurrency (a v2 store surviving a
legacy `run` append, concurrent saves, the old-main isolation read, a legal delete queued behind a
save, and both documented examples executed as written). 085 v1.3 then closed the remaining offline gaps: the complete canonical 19-field inspection is
compared against the real bytes (a numeric message or a byte-contradicting peak is refused), the
whole locally decidable SaveProof (including the fullScale negative bound) is rejected before the
first fresh store read, the eleven-row matrix reports uniform claim/FINAL/Artifact attempts and
successes plus engine/import counts, three-file digests, the per-row hit/phase/first-error/paired,
the pre-fault second-owner/catalog/library handles re-checked after the fault, the control get/status/repeat facts and the old/new handle two-domain locks with the one-shot JOINT armed only after the real
writer returned, legal OFFLINE
and source-blocked NO_EXECUTION settlements are recorded as fixed FINALs, ordinary concurrency is a
fixed `SAVED` + `EXISTING`, a delete issued inside the held Artifact window provably waits for
the save's JOINT, and both documented examples carry a complete input and bind only the issued ids.
Final local evidence: `node --test`
**755 tests, 752 pass, 3 platform skips (symlink EPERM), 0 fail**; owner + save specialty
**72/72**; `node build.mjs` regenerates `client.js` with no diff. Not verified: real Host/GUI
integration, real TTS/media, delivery and any production capability. Parent Plan 08-E-E and Plan 08
remain IN_PROGRESS.

### 08-E-C 续修（VM 11 行证据）
共享 VM 图 + 真实 after-call 注入已覆盖契约 §10 的十一行代表（含第 3 行公开流程坏 proof 与第 9 行 JOINT Artifact），每行记录 engine/import 与实际 rename 计数；worker 从 `-e` 改为临时文件执行，避免 Windows 命令行长度上限。收口后全量 742/739/3 平台 skip，owner+save 专项 59/59；仍未合并，Host/GUI、真实 TTS/media 与投递均未验证。
### 08-F-A pure Fixture cover stage planner — OFFLINE / PLAN_ONLY / PR pending

Implemented: `core/audio/cover-plan.mjs` (4 exports: schema constant, frozen five-key limits, frozen
14-key codes, synchronous `planFixtureCover`) validates a complete Fixture `sourceInput` through the
original `resolveFixtureTaskSource` exactly once plus a strict four-key recipe and three-key Fixture
capability declaration, and returns a deeply frozen 15-key planning value (`PLANNED`/`BLOCKED`,
11-key association, 5-key recipe including the accepted `pitchShift`, a symbolic 3- or 4-stage graph,
`outputSlot: VERIFIED_MASTER`, `taskAuthority: UNVERIFIED`, `outputArtifactRef: null`, fixed safety
flags). Behaviour covered: protocol/priority order (safe copy -> root/recipe/capabilities -> one real
source call -> common facts -> SVC-only association -> instrumental/separator/mixer), SOURCE_BLOCKED
precedence, legal TTS rejection, the three legal stage graphs, gain/pitch boundaries, bad dependency
protocols through a real-resolver VM facade, and two complete documented positive roots plus one
complete negative root parsed verbatim from `docs/COVER_PLAN_OFFLINE.md`. Local evidence: cover-plan
tests 19/19 and `node --test` **774 tests, 771 pass, 3 platform skips (symlink EPERM), 0 fail**;
`node build.mjs` regenerates `client.js` with no diff. The planner has no engine, producer, import,
save, store, file, network, process, clock or random call; no Task is created or executed and no
audio is generated or saved. Not implemented / not verified: real Cover execution and StageArtifact
lifecycle, resources/cancellation, dynamic evidence, the parent Fake Model/Audio/Relay E2E, real
Host/GUI or any production capability. Parent Plan 08 remains IN_PROGRESS.
### 08-F-B Cover execution / StageArtifact contract — CONTRACT_CANDIDATE / NOT_IMPLEMENTED / PR pending

Documentation only: `docs/COVER_TASK_EXECUTION_CONTRACT.md` (new) freezes the complete design for
one atomic Cover birth intent on the existing catalog (private snapshot v3 typed entries), the
25-key canonical Intent with recomputed SHA-256 vectors, the single-owner execute/status/cancel API,
the owner v3 Cover entry and the 7-key `coverAttachment` writer branch, trusted STORED SOURCE bytes
with a stable source identity, the derived VOCAL adapter, the 24-key StageArtifact manifest and
old-shape mapping, the three deterministic Fake byte graphs with computed vectors, queue/checkpoint/
recovery/cancel/lease/cleanup/cache rules, exact peak/admission budgets, the old/new program ×
version matrix, new Cover error codes with fixed priority, and a state/failure matrix. All new APIs,
entities and flows are explicitly `NOT_IMPLEMENTED`; the frozen v1.6 save contract and all product
code/tests remain untouched (7 files in M's F-A unit and the rest of the tree unchanged). This unit
adds no runtime capability and does not close P08-07, Cover execution, resources/cancellation,
dynamic evidence or the parent Fake E2E; parent Plan 08 stays IN_PROGRESS.
The contract candidate received a full revision (`092-R01..R06`): public `reserveCover` with a
19-key draft + measured source entry, 25-key legal intent and recomputed vectors, library rights
mapping and physical source refs, field-level RVC gateway adapter (mono), typed owner v3/manifest
shapes, exact revision/attachment/crash/cancel semantics and exact capacity/peak budgets. The
document remains CONTRACT_CANDIDATE / NOT_IMPLEMENTED; no product code, tests, contracts or media
were changed in this revision, and parent P08/Plan 08 stays IN_PROGRESS.
The contract candidate was revised for the `0093` incremental review: internal-only birth, unified
envelope with complete examples, 1,140 B canonical Intent, real gateway patterns with metadata-only
returns, `importReceipt` + `resumeCoverFinal`, Artifact held through the FINAL critical section,
macrotask cancel yield, full-pack admission and a 32 MiB explicit-Buffer peak. It remains
CONTRACT_CANDIDATE / NOT_IMPLEMENTED; no code, tests, contracts or media changed and P08 stays OPEN.
The contract candidate was revised for the `0094` review: restored catalog birth shape and example,
synced method/version tables (supported v3 vs unknown), resume EXISTING, corrected real
read-source calls and field provenance, and a four-row explicit-Buffer peak table under a 64 MiB
temporary budget. It remains CONTRACT_CANDIDATE / NOT_IMPLEMENTED; no code, tests, contracts or
media changed and P08 stays OPEN.
Cover offline execution is now IN PROGRESS / OFFLINE on `feature/plan08-cover-execution` (from the
merged contract M): canonical Intent + three-graph synthetic bytes + dedicated Cover v3 store +
executor (birth/claim/checkpoints/one MASTER import/FINAL/status/busy cancel/resume) with 23 tests
(797/794/3 full suite). The legacy catalog/owner files are untouched and Cover uses dedicated v3
files; v3-into-legacy integration, dynamic dependencies, the parent Fake E2E and complete
cancel/cleanup evidence remain open. This is not an integrated or real capability.
Cover readiness and the test-only Fake Relay boundary are now implemented and tested (811/808/3
skip): dynamic TTS/SVC dependencies with fixture-only evidence, dedup/UNKNOWN-no-resend relay
behaviour, busy-cancel evidence and receipt-based resume without a second import. The remaining 090
gaps are v3 typed-entry integration into the legacy catalog/owner files and the legacy parent-chain
E2E; the implementation is still OFFLINE and not integrated.
Parent-chain E2E is now covered offline (legacy catalog + Fixture library + Cover + handoff; Fake
Relay dedup/UNKNOWN). Full suite 816/813/3 skip. Still OFFLINE/NOT_INTEGRATED: same-file v3
integration into the legacy catalog/owner files and the legacy owner run/save engine E2E remain open.
The same-file v3 integration is now implemented (phase A read/write selection with the dedicated-file
fallback for existing v1/v2, phase B mixed legacy+Cover entries, phase C old-owner fail-closed), the
legacy owner run/save engine chain is covered by a real same-source E2E
(`test/cover-legacy-owner-chain.test.mjs`), cancellation now has frame-level cooperation (4,096-frame
fence, 65,536-frame macrotask yield) plus separate persisted request/ack/stop/release/cleanup
evidence (`test/cover-cancel-evidence.test.mjs`), and `core/audio/cover-rollback-internal.mjs` provides
the explicit checked rollback (`test/cover-rollback.test.mjs`). Contract §15/§15.1–§15.3 record the
as-built state. Full suite 831/828 pass/3 platform skips/0 fail; build unchanged. Branch
`feature/plan08-cover-execution`, PR #43 open and unmerged; status stays OFFLINE / FIXTURE_ONLY /
NOT_INTEGRATED and parent Plan 08 is not complete.
The v1.76 review (104-R01..R06) is now addressed offline on the same branch: the executor re-checks
the current entry inside the single-writer queue (concurrent same/different keys claim once; terminal
FAILED/CANCELLED never rerun, `test/cover-concurrency.test.mjs`); `resumeCoverFinal` requires the
exact attempt/request identity, returns the real terminal and only continues a claim with a
persisted checkpoint[4] receipt plus rebuilt attachment lineage (`test/cover-recovery.test.mjs`,
including a real checkpoint[4] state and zero second import); the save transaction persists
checkpoint[4] with the library import key and holds the Artifact queue across import → fresh proof →
FINAL → post-commit confirmation, with an uncertain FINAL rename locking the store; the store probes
legacy files safely and validates v3 entries on read/write (`test/cover-store-hardening.test.mjs`);
`cover-lease-internal.mjs` gives one exclusive local-GPU lease per sandbox (CPU/cloud `gpu:'NONE'`),
readiness rejects future evidence and authorized-but-not-ready SVC clouds, and an optional
`dependencies` bundle validates the real voice binding/provider readiness against the Intent
(`test/cover-lease.test.mjs`, `cover-dependencies.test.mjs`); the legacy parent test now drives its
persisted SAVED record into handoff/Fake Relay (SENT/EXISTING/UNKNOWN) and keeps the real Cover
record delivery-free. Full suite 856/852 pass/4 platform skips/0 fail; build unchanged. Contract
§15.4 records the as-built matrix and the remaining OPEN boundaries. PR #43 remains open/unmerged;
status stays OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED.