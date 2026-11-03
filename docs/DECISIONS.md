# Architectural Decisions

**Status legend:** `ACCEPTED` = current project rule; `SUPERSEDED` = replaced; `RESEARCH` = not implemented;
`REJECTED` = explicitly not chosen.

All decisions are dated **2026-10-24** unless noted. Each links to its authoritative document.

---

## ADR-001 — WeChatAgent is the required WeChat platform dependency

**Status:** `ACCEPTED`
**Decision:** Whale Voice does not implement a second WeChat reader, account manager, session store or
bot. WeChat messaging and account/session context depend on the independent
`sourcepro5/WeChatAgent` project.

**Reason:** Avoid duplicating a high-risk, version-fragile Hook/account system; keep one platform
boundary and one compatibility policy.

**Rejected alternatives:** Native replacement bot; private WeChat reader; bundled Hook fork as the
main integration.

**Related:** [WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [AGENTS.md](../AGENTS.md).

---

## ADR-002 — Voice Sender remains an independent delivery backend

**Status:** `ACCEPTED`
**Decision:** The Voice Sender is a separate Windows component responsible for final target check,
UI Automation, recording/playback, device recovery, cancellation and result reporting. It must not be
folded into the DSH frontend or Core Host process.

**Reason:** It is the historically verified native-bubble path and carries independent safety checks;
coupling it to the UI or Core would increase blast radius.

**Rejected alternatives:** Send from the browser; send from the Host Node process; move audio/UI
automation into the plugin client.

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md), [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

---

## ADR-003 — Native voice delivery remains a research candidate

**Status:** `RESEARCH`
**Decision:** Keep `third-party-native` as a `RESEARCH_CANDIDATE`. WeChatAgent 0.3.9/0.4.0 native
voice is `UNSUPPORTED`. Do not integrate WeChatPYAPI or PadChat-SDK without version, license,
coexistence, receipt and safety proof.

**Reason:** Public API names are not evidence of current WeChat compatibility or a native bubble;
third-party DLL/service and account risks are material.

**Rejected alternatives:** Treating a README `send_voice`/`sendVoice` as working support; installing a
DLL or disabling antivirus; silently upgrading WeChat; using an unlicensed service.

**Related:** [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

---

## ADR-004 — Core owns unified configuration and delivery coordination

**Status:** `ACCEPTED`
**Decision:** Whale Voice Core is the authority for configuration reading, target authorization and
task lifecycle. Delivery backends execute; they do not create independent queues or retry loops.

**Reason:** One task ID, one delivery ID and one selected backend are required to prevent duplicate
sends and preserve UNKNOWN semantics.

**Rejected alternatives:** Frontend-selected backend with no Core record; independent backend queues;
per-backend retry.

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md), [SEND_SAFETY_API.md](SEND_SAFETY_API.md).

---

## ADR-005 — Bridge switch and Worker safety permit are different layers

**Status:** `ACCEPTED`
**Decision:** `voice-settings.json.enabled` is the Bridge user switch.
`config.json.voice_enabled` is the Worker's independent final-safety permit. They are not compared
as one value; the snapshot exposes `voice.worker` separately and `voice.consistency: not_comparable`.

**Reason:** Bridge false and Worker true are expected in production. A Worker true does not override a
Bridge false. Collapsing them creates false mismatch or unsafe bypass.

**Rejected alternatives:** A single combined voice switch; treating different values as a conflict.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-006 — UNKNOWN never triggers automatic resend

**Status:** `ACCEPTED`
**Decision:** `UNKNOWN` is terminal for automatic retry. No backend switch, new delivery ID or silent
replay is allowed after a request may have produced an external send.

**Reason:** Duplicate voice messages are a safety and privacy failure; a timeout may still mean the
message was submitted.

**Rejected alternatives:** Retry on timeout; fall back to another backend; replay historical tasks
after plugin reload.

**Related:** [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md),
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## ADR-007 — Saved configuration is not runtime-effective configuration

**Status:** `ACCEPTED`
**Decision:** `savedRevision` and `application.state` describe the saved snapshot, not proof of the
running configuration. `activeRevision` remains `null` until a supported runtime-version interface
exists.

**Reason:** File mtime, process liveness or a saved value cannot prove the Bridge/Worker loaded that
value. UI must show “已保存，生效未确认/未知” rather than “已生效”.

**Rejected alternatives:** Equating a successful read or save with live effect; treating mtime as
proof.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [SETUP_API.md](SETUP_API.md).

---

## ADR-008 — UI Inspector uses isolated Playwright; real Electron debugging needs separate authorization

**Status:** `ACCEPTED`
**Decision:** Level 1 UI testing uses a pinned Playwright harness with fake setup data. The production
DSH Electron page is not attached through CDP, no debug port is opened, and any real Electron
inspection requires a separate authorized isolated instance.

**Reason:** The production DSH has no supported agent-facing DOM/CDP endpoint; weakening auth or
opening debugging would create unsafe access to private UI.

**Rejected alternatives:** Enabling CDP on production DSH; reusing the production profile; reading
production page content via unsupported means.

**Related:** [UI_TESTING.md](UI_TESTING.md),
[DSH_ELECTRON_INSPECTOR_FEASIBILITY.md](DSH_ELECTRON_INSPECTOR_FEASIBILITY.md).

---

## ADR-009 — Production changes and isolated tests are separate

**Status:** `ACCEPTED`
**Decision:** Development and tests must use isolated profiles, fake data and read-only sources.
Production configuration writes, real sends, service restarts, audio-device changes and Hook/DLL
changes require separate explicit authorization.

**Reason:** Keeps tests safe and prevents test success from being confused with production
authorization.

**Rejected alternatives:** Testing against production Host/token; modifying voice switches to make a
test pass; disabling security controls.

**Related:** [AGENTS.md](../AGENTS.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-010 — Phase 4A-H request and revision hardening

**Status:** `ACCEPTED`
**Decision:**

- Origin validation compares complete `scheme + host + port`.
- No-Origin DSH same-origin GET is accepted only with loopback/Host, Sec-Fetch-Site, token and DSH
  connection checks.
- HTTP reads reject responses without a streaming reader instead of using unbounded `text()`.
- `accountVerified` is true only for an explicit supported boolean; an account object alone is unknown.
- `configRevision` is an opaque process-keyed HMAC over the authoritative saved-config coverage:
  voice, worker, TTS, permissions/allowlists and source state.

**Reason:** These were concrete pre-merge safety/contract defects found in review; fixing them
before Phase 4B avoids carrying an unsafe revision/auth foundation into writes.

**Rejected alternatives:** Public unkeyed SHA-256 over low-entropy allowlist IDs; trusting
Content-Length; inferring account verification from a generic object; partial UI-only revision.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [SETUP_API.md](SETUP_API.md),
[WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

---

## ADR-011 — Stage handoff memory is maintained, but not authoritative

**Status:** `ACCEPTED`
**Decision:** Each stage maintains `AI_CONTEXT.md` as a concise recovery summary and `DECISIONS.md`
for architecture decisions. On conflict, repository code, Git/GitHub state, tests and the named
authoritative docs win.

**Reason:** Long-running AI sessions need fast recovery without treating stale summaries as truth.

**Rejected alternatives:** Chat history as source of truth; a single oversized status file; copying
secrets/private data into memory files.

**Related:** [AI_CONTEXT.md](AI_CONTEXT.md), [AGENTS.md](../AGENTS.md).

---

## ADR-012 — Stacked PR integration uses merge commits and sequential retargeting

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** PR #3–#8 were integrated into `main` with merge commits. Each downstream PR was
retargeted to `main` after its base merged; no squash, rebase or force-push was used. The final PR #7
documentation union preserves the newer PR #8 state.

**Reason:** Preserves reviewed commit ancestry and PR boundaries, avoids duplicate diffs, and keeps
history auditable. Squash/rebase would break the stacked ancestry or rewrite shared history.

**Rejected alternatives:** Squash-merging the stack; rebasing branches onto `main`; force-pushing
rewritten branches; deleting branches to trigger automatic retargeting.

**Related:** [PROJECT_STATUS.md](PROJECT_STATUS.md), [AI_CONTEXT.md](AI_CONTEXT.md),
[AGENTS.md](../AGENTS.md).

---

## ADR-013 — Phase 4B-1 config writes are isolated, single-file and revision-checked

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** The first write infrastructure is an isolated single-file store. It requires an opaque
trusted test-sandbox capability (not a caller-supplied path), uses strict v1 schema validation, a pure
v0→v1 migration, a process-local HMAC revision, required `expectedRevision`, temp+fsync+rename atomic
save, post-save verification/rollback and read/write state separation. A pure read reports
`UNCHANGED`; a successful write reports `SAVED`/`PENDING_APPLY`, with runtime apply still unknown. The
HTTP write API is test-only and is not registered on the production DSH Host. It does not claim
multi-file transaction or cross-process compare-and-swap safety.

**Reason:** Write behavior must be tested and audited before any production configuration is touched.
A single-file store with optimistic concurrency and explicit failure states provides a safe
foundation; a production multi-file transaction and apply interface need a separate design.

**Rejected alternatives:** Direct writes to production `core.json`/WeChatAgent/Sender files; trusting
any string named `test` or `isolated`; silent last-writer-wins; unkeyed SHA-256 over private IDs;
treating multiple file renames as one transaction; persisting the HMAC key to make revisions
permanent; registering a write route on the current Host.

**Related:** [CONFIG_WRITE_API.md](CONFIG_WRITE_API.md),
[CONFIG_SOURCES.md](CONFIG_SOURCES.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-014 — Phase 4B-2A uses isolated source adapters, a save journal and split apply states

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** The coordination prototype uses one trusted sandbox, injected source adapters, a
per-transaction journal and a two-stage save/apply state model. Only `bridgeVoice` and
`senderService` are simulated writable sources. `core`, `workerSafety`, `wechatPermissions` and the
target map are read-only or never read. The coordinator serializes mutations in one instance,
never writes a production file, never starts/stops/reloads a service and never sends a WeChat task.
Plans use unpredictable IDs bound to an immutable private snapshot; high-risk confirmation names the
exact plan; plans expire and are consumed after journal creation. `APPLIED` requires each runtime to
return a loaded revision exactly matching the saved revision; file writes, PID liveness, mtime and
HTTP 200 are not apply proof. Journals are size-bounded, strict-schema and symlink-checked on read;
same-path temp+fsync+rename is best-effort, not a Windows power-loss atomicity claim. A failed save
without a `NOT_WRITTEN` outcome remains `UNKNOWN`, even if earlier steps were rolled back. Rollback is
reported complete only when the adapter's reported revision and a subsequent read-only observed
revision both exactly equal the pre-transaction revision; otherwise the result stays `UNKNOWN`.

**Reason:** The Bridge user switch and Worker final-safety permit are independent safety layers.
Multi-file configuration cannot be made transactionally safe by pretending independent renames are
one transaction. A journal plus explicit UNKNOWN/partial states is safer than a false claim of
complete rollback. Isolated fixture adapters let the protocol be tested without touching production
configuration or private target data.

**Rejected alternatives:** Treating Bridge `voice.enabled` and Worker `voice_enabled` as one setting;
accepting arbitrary paths/URLs/commands from the frontend; writing production files from this phase;
reusing a plan ID for different values; accepting any well-formed runtime revision; inferring applied
state from process/health evidence; automatic retry of uncertain apply/send; putting tokens, full
whitelists or private recovery documents into the journal.

**Related:** [CONFIG_COORDINATION.md](CONFIG_COORDINATION.md),
[CONFIG_SOURCES.md](CONFIG_SOURCES.md), [CONFIG_WRITE_API.md](CONFIG_WRITE_API.md),
[PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-015 — Phase 4B-2B writes use owner APIs; no direct file writes and no inferred apply

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** After auditing the installed Bridge, Voice Sender and WeChatAgent, the minimal safe
integration is: (1) Core does not write component-owned configuration files directly; (2) a writable
field is exposed only through the owning component's supported API; (3) owner API presence, Core
production authorization, effective write enablement, save capability and loaded-revision
confirmation are separate facts, and a capability report must keep them separate (`save.enabled` is
derived, never inferred from an API string); (4) `APPLIED` requires an exact loaded revision from the
owner, and the absence of that interface keeps the state `PENDING_APPLY` — it does not make a
supported save unsupported; (5) file locks/CAS are a secondary measure for a file contract with no
owner API, not a substitute for one, and a successful rename is name replacement only, not a claim of
crash atomicity or power-loss durability; (6) WeChatAgent permission changes remain a human console
action, and Worker `voice_enabled` is never a Core write target; (7) Phase 4B-2B-2 starts read-only
(capability/status projection) before any write is authorized.

**Reason:** The audit found that the Bridge reads `voice-settings.json` hot but has no writer or
revision; the Sender service reads `service.config.json` at boot and supports only an automation
`PUT` that rewrites the file non-atomically; WeChatAgent has a revision-guarded console but CLI and
account-switch writers without a shared CAS, mixed hot/boot readers and no loaded-config evidence.
Direct file writes would create lost updates and false "applied" claims. Using owner APIs keeps the
single-writer boundary with the component that owns the safety layer.

**Rejected alternatives:** Core writing JSON files directly; a generic lock protocol as the primary
coordination mechanism; treating `/health`, mtime, PID or equal file bytes as apply proof; merging
Bridge `enabled` with Worker `voice_enabled`; enabling WeChatAgent permission writes from Core;
starting 4B-2B-2 with a write control before the capability/status contract exists.

**Related:** [PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md),
[CONFIG_COORDINATION.md](CONFIG_COORDINATION.md), [CONFIG_SOURCES.md](CONFIG_SOURCES.md),
[PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-016 — Capability Schema v3 is Surface-level and strictly read-only

**Status:** `ACCEPTED`
**Date:** 2026-10-25
**Decision:** Phase 4B-2B-2a projects the audited component capability as schema v3. `readTiming`,
`hotReload` and `requiresRestart` are declared **per Surface**; a source cannot override them.
Sender automation is `RUNTIME_API / FULL / NOT_REQUIRED` with `save.state: SUPPORTED` but
`authorization: NOT_AUTHORIZED`; Sender TTS is `SERVICE_BOOT / NONE / REQUIRED` with
`save.state: UNSUPPORTED`. The projection is GET-only, reuses the existing loopback/Origin/Host/
token/connection guard, exposes no paths/tokens/whitelist names/target map and never enables a write
control. A detected version different from the audited version (or an unreadable version) downgrades
that source's capability **and its `readTiming`/`hotReload`/`requiresRestart` conclusions** to
`UNKNOWN`; unverified reload behavior is never shown. Unknown is never treated as unsupported, safe
or writable, and Worker `NEVER_WRITE` is preserved. **The standalone Worker has no independent
version; the Sender Service version must never be used as Worker evidence.** Without an audited
Worker version the Worker Surface stays `UNKNOWN`, while Sender automation/TTS remain governed by
the Sender Service version. `APPLIED` remains unreachable without an exact loaded revision.

**Reason:** A source-level reload value would incorrectly tell the UI that Sender TTS can be updated
like automation (or vice versa). Users need to see what supports saving, what is authorized, what is
currently enabled, and what cannot be confirmed, as separate facts.

**Rejected alternatives:** Keeping reload fields at source level; treating a supported save API as an
authorization; treating a missing loaded revision as "no save support"; rendering `null` as off/safe;
adding a write route in a read-only phase; assuming an audited capability for an unaudited version.

**Related:** [CAPABILITY_API.md](CAPABILITY_API.md),
[PHASE4B2B1_COMPONENT_AUDIT.md](PHASE4B2B1_COMPONENT_AUDIT.md),
[CONFIG_SOURCES.md](CONFIG_SOURCES.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-017 — TTS is Provider-neutral; Qwen and `whale-v1` are references, not defaults

**Status:** `ACCEPTED` (design only; no provider implemented)
**Date:** 2026-10-25
**Decision:** Whale Voice is a multi-engine voice plugin. TTS providers are declared through a
provider-neutral contract with kind (`LOCAL`/`CLOUD`/`CUSTOM`), capabilities, health, voices,
languages, clone/emotion/streaming declarations, audio formats, limits, retry/cancel behavior,
credential reference, network/privacy/cost/resource metadata and an opaque protocol version. Provider
results contain an audio artifact and `delivery: PENDING_ROUTER`; providers never send WeChat. The
registry contains candidate IDs only; all are `NOT_IMPLEMENTED` and `selectable:false` in TTS-A.
Qwen3-TTS is the current reference implementation; `whale-v1` is the current developer's personal
voice. Neither is a new-user or product default. Existing `qwen-local` config is preserved by a pure
v2 migration proposal; cloud/custom legacy values require explicit selection and are never guessed
into Qwen. Provider switches must reject incompatible voices. Credentials are references to protected
storage, never values in config, URLs, frontend state or logs. This ADR does not authorize a real
provider, provider request, credential store, Host route or production config write.

**Reason:** The previous implementation coupled TTS health, configuration and UI defaults to
`qwen-local`/Qwen runtime. That would make a cloud or custom provider unavailable whenever local Qwen
was offline, and would incorrectly present a personal voice as the product default.

**Rejected alternatives:** Treating Qwen as the only provider; making `whale-v1` the global default;
requiring `baseUrl` for every provider; silently falling back between local and cloud; mapping legacy
`cloud`/`custom` to Qwen; storing API keys in config/URL/LocalStorage; allowing a provider to call
WeChat or Voice Sender; declaring candidates implemented without an adapter and audit.

**Related:** [TTS_PROVIDER_AUDIT.md](TTS_PROVIDER_AUDIT.md),
[TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-018 — Qwen local provider runs as a lazy official-SDK worker with generation-scoped lifecycle

**Status:** `ACCEPTED`
**Date:** 2026-11-02
**Decision:** The Qwen3-TTS local provider is implemented as an explicitly configured child process
(`workers/qwen3_tts_worker.py`) that speaks a narrow versioned NDJSON protocol to
`core/tts/qwen-supervisor.mjs`. The worker imports the audited `qwen-tts` package and loads a model
only on a real synthesis; `hello`/`health`/`discover` are static and must not load torch or weights.
The model directory and clone references must be existing local paths inside an explicit allowed
root, and `from_pretrained` is always called with `local_files_only=True` and
`trust_remote_code=False`. Each supervisor start owns one generation (stdio, pending map, exit
handle, temporary directory); an `error` event is not an exit, an unconfirmed exit is reported as a
failure instead of a green `ok`, failed temp cleanup stays owned and retryable, and no new synthesis
is accepted while an operation has no confirmed terminal answer or while shutting down.

**Reason:** The audited upstream is a Python package whose default loading path can download weights
and whose reference-audio helper accepts paths, URLs and base64. A separate worker keeps that code
out of the Core host, makes local-only loading auditable, and lets a broken or hostile worker be
terminated without crashing the host. Per-generation ownership prevents a late event from an old
process from releasing or killing a new one. Protocol depth/node bounds are required because the
2 MiB line cap alone did not stop a small deeply nested JSON payload from exhausting the host stack.

The 095 repair tightens the same boundary at actual use: trusted local resources (model directory,
configuration digest, clone reference) are re-audited immediately before each SDK call and the
reference inode is held for the generation, so a post-health junction, deletion or replacement is
refused rather than passed to the SDK. The worker sets offline environment variables and installs an
in-process network guard before importing the official package, covering the nested
AutoConfig/AutoModel/AutoProcessor chain; a missing directly imported dependency fails closed at
hello/health without loading a model. Cancellation is split into request, trusted acknowledgement,
actual stop and final result, and an operation is released only by a terminal message correlated
through its issued message id, claimed request id and generation. A start/stop race keeps admission
closed instead of re-opening it after the handshake.

The 0122 residual repair makes the SDK consume the verified content instead of a re-openable path:
the reference bytes are read through the audited fd, checked against a startup SHA256 and passed as a
`data:audio` value. The model sub-resource tree is walked for junction/symlink escapes, configuration
and tree are re-audited after loading before generation, runtime dependency loss is reflected by
health until recovery, only a complete terminal (state plus exact request/model/backend/voice
identity) releases an operation, invalid late messages keep the recovery correlation, and a start
failure is scoped to its own generation.

The 0123 residual repair makes the actual loader consume a stable private snapshot: every regular
file is copied with a SHA256 baseline, and the original tree/config are re-audited after loading. The
model candidate is committed to the process cache only after validation; load-time cancellation,
audit failure or an exception discards the candidate and snapshot, while a normally completed valid
cache survives ordinary cancellation. A runtime dependency that is resolvable but raises ImportError
stays degraded until a successful import, instead of being cleared by a mere path check.

The 0124 residual repair removes hardlinks entirely (full copy within an 8 GiB budget, fail closed
above it), so a same-size source rewrite with restored mtime cannot alter SDK-consumed content.
Snapshots live in the supervisor-owned worker temporary directory and are tracked from creation; the
worker cleans them on shutdown/EOF, a denied cleanup keeps a retryable `snapshotCleanupPending` fact
with host temp cleanup as the final owner, and only exact worker-created directories are removed. A
later missing-package request cannot downgrade a known ImportError to `missing`.

The 0125 residual repair shares the snapshot copy budget across files and deducts it before each
chunk write, so a cumulative overrun fails at the write boundary instead of after an extra file. It
registers the active snapshot parent under a lock before any child mkdir/copy, and health cleanup
skips and retains active/build-in-progress registrations instead of clearing the ownership set, so a
health check during loading cannot orphan a snapshot that cancel or a load failure later leaves
behind.

**Rejected alternatives:** Importing `qwen_tts`/torch inside Core; trusting a worker-declared model
name without an audited model identity and a matching local `config.json`; passing reference audio
paths, URLs or base64 through the protocol; accepting `ok` from any response type; treating a kill
request, an `error` event or a delete call as proof of exit; reporting `stop()` as success before the
process really exited; using unbounded recursive validation.

**Related:** [TTS_QWEN_PROVIDER.md](TTS_QWEN_PROVIDER.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[PROJECT_STATUS.md](PROJECT_STATUS.md), [ROADMAP.md](ROADMAP.md).

## ADR-019 — IndexTTS-2.5 is a separate clone/emotion-only lazy worker with a fixed non-Apache licence

**Status:** accepted (offline candidate, 2026-11-03). **Supersedes:** nothing. **Related:** ADR-017,
ADR-018, [INDEX_TTS_PROVIDER.md](INDEX_TTS_PROVIDER.md).

**Decision:** IndexTTS-2.5 is implemented as its own local provider unit
(`core/tts/index-tts-{contract,worker-protocol,supervisor,adapter}.mjs` +
`workers/index_tts_worker.py`), not as a Qwen variant or a shared public request extension. It fixes
the upstream code `index-tts/index-tts@d9e41aac89fd00b3d71497fddb287b7f24613712`, model
`IndexTeam/IndexTTS-2.5@c39ce5ba981572cb187443877ff559dfb246ce63`, package `indextts==2.0.0` and
interface `infer_v2_5.IndexTTS2`; both the package metadata and the local `config.yaml version: 2.5`
must agree. Only clone + emotion is exposed: preset voices and VoiceDesign are rejected, the fixed
8-float emotion order/modes come from the model card, and text emotion requires the audited
QwenEmotion auxiliary directory and `use_qwen_emo=True`. The worker loads the model only on a real
synthesis, after a byte-for-byte private snapshot, offline environment and in-process network guard;
it requires auxiliary models to already exist locally so the upstream download helper is never
entered, copies audited reference bytes to stable files, and validates 22050 Hz mono PCM16 output.
The result is non-persisted (`PENDING_ROUTER`), and the provider creates no Task/Artifact/delivery.
The fixed licence is the bilibili model-use agreement (not Apache-2.0; MAU/revenue commercial
thresholds); dependency/tokenizer/private-reference rights stay UNKNOWN.

**Reason:** IndexTTS has a different SDK, model identity, output format, language set, emotion
semantics and licence from Qwen. Reusing Qwen's public payload or model identity would blur those
differences and could smuggle arbitrary emotion/paths into the public TTS contract. A separate,
narrow worker keeps the official loader out of Core, makes the local-only resource boundary
auditable, and lets the two providers have independent PRs, licences and acceptance gates.

**Rejected alternatives:** Treating `indextts==2.0.0` as proof of the 2.5 interface; copying Qwen's
24 kHz/1 MiB/voice-preset assumptions; exposing `use_emo_text` or an 8-float vector as ordinary public
request fields; passing reference/model paths directly to the SDK; letting `ensure_models_available`
download auxiliary models; labelling the bilibili licence as Apache-2.0 or unrestricted; merging this
candidate without real weights/GPU/Host/Artifact acceptance.

**Related:** [INDEX_TTS_PROVIDER.md](INDEX_TTS_PROVIDER.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md).

## ADR-020 — Kokoro-82M is a separate preset-only CPU worker; Apache code/model does not cover voices/G2P

**Status:** accepted (offline candidate, 2026-11-03). **Related:** ADR-017, ADR-019,
[KOKORO_PROVIDER.md](KOKORO_PROVIDER.md).

**Decision:** Kokoro-82M is implemented as its own preset-only local provider unit, not a Qwen/Index
variant. It fixes `hexgrad/kokoro@dfb907a0…`, `kokoro 0.9.4`, `hexgrad/Kokoro-82M@f3ff3571…` v1.0 and
24 kHz output. The worker loads only on synthesis, after a byte-for-byte private snapshot, stable
copies of trusted local voice `.pt` files, local config/weights/voice/G2P preconditions, offline
environment and the in-process network guard. Construction is `KModel(config=…, model=…,
disable_complex=True).to("cpu")` plus `KPipeline(lang_code, model=model, device="cpu")`; no voice
name is allowed to reach `hf_hub_download`. Only preset voices/languages from the trusted index are
exposed; clone, voice-design and emotion are rejected. Output is 24 kHz mono PCM16, split chunks are
joined with a bounded silence, and the result is non-persisted. The Apache-2.0 code/model statement is
not extended to dependencies, voice tensors or Misaki/espeak G2P/dictionaries; those remain UNKNOWN.

**Reason:** Kokoro has different SDK, output rate, CPU path, preset-only capability and G2P/resource
licensing from Qwen/Index. Reusing their payloads or clone/emotion fields would blur those facts.

**Rejected alternatives:** Passing a voice name to the default HF lookup; treating Apache-2.0 model
metadata as covering voices/G2P; exposing clone/emotion because another provider has it; loading the
model at health/discover; accepting a non-24 kHz or empty output.

**Related:** [KOKORO_PROVIDER.md](KOKORO_PROVIDER.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md).

## ADR-021 — Cloud/custom TTS is gated by an application-owned credential namespace, explicit consent and a durable character-cost ledger

**Status:** accepted (offline candidate, 2026-11-03). **Related:** ADR-017, [CLOUD_PROVIDERS.md](CLOUD_PROVIDERS.md).

**Decision:** The first cloud/custom unit uses a dedicated credential store, not provider config or
environment variables. Only a `credentialRef` is stored in configuration; the secret is protected
with Windows DPAPI CurrentUser in the fixed `whale-voice-credentials-v1` namespace below a trusted
application root, written atomically, looked up by exact ref and never returned in public
projection, logs or Git. Non-Windows or a missing protector is explicitly `UNAVAILABLE`; there is no
plaintext fallback. DPAPI protects against other Windows users, not every same-user process.

A request needs all of: a trusted configured target, explicit text-upload consent, a resolved
credential and a known cost mode/bound. One ledger file is the atomic authority; every write uses a
token-owned short file lock plus an optimistic revision check, and the slow temp-file write happens
outside the lock. A lock is never removed merely because its mtime is old; release only deletes its
own token, so two handles on the same root cannot spend the same budget, delete each other's lock or
overwrite a committed record (a revision conflict retries). Each reservation carries an execution
owner; a normal open of another handle protects a live owner's `PENDING`, while a closed/dead owner
(including a real child-process crash) is recovered to `UNKNOWN`. Paid execution uses an integer
character price and a durable reserve-before-send ledger; a same-requestId `PENDING` duplicate is
refused before transport; success commits, pre-send failure releases, post-send timeout/unknown
keeps the reservation as `UNKNOWN`, and completed/UNKNOWN dedup is bounded but never truncated into
a new request (capacity fails closed). Custom HTTP must be explicit `unknown` (zero request),
confirmed `free` (same ledger with call/text limits) or paid (known price/hard budget); the old
`FREE_OR_UNKNOWN` behavior is removed. Azure is paid-only and must use a `paid` ledger with a
positive integer price in both health and synthesis; free/unknown/zero-price ledgers make zero
transport. Unknown prices, missing limits, corrupt ledgers and exhausted budgets fail closed. No
silent free retry or paid downgrade exists.

Cancellation is checked before request construction and around credential/DNS/cost awaits. The
request error listener is installed before any destroy, non-2xx bodies are destroyed instead of
drained, and a cancel during cost commit does not return success audio; a sent charge is committed or
kept as UNKNOWN, never released as unsent.

Azure Speech is limited to one synchronous REST shape, fixed regions and preset zh-CN/en-US neural
voices, escaped plain text (no caller SSML), 24 kHz mono PCM16 and a required key header. Custom HTTP
is one fixed `whale-voice-custom-tts` v1 JSON→WAV protocol with HTTPS (or explicit numeric-loopback
HTTP), predefined bearer/x-api-key auth, public-DNS pinning, no redirects and bounded streamed
response. Both return `persisted:false` and `PENDING_ROUTER`; no Task, Artifact, delivery or WeChat
send is created. A Fake/injected success cannot set `AVAILABLE`; only a real live response can.

**Reason:** Text upload, secret handling and per-character billing are three separate risks. Storing
a key in config, treating localhost as trust, falling back to plaintext, or inventing a zero price
would each be a security or cost failure. A separate adapter boundary also prevents the browser or a
chat message from becoming an arbitrary proxy.

**Rejected alternatives:** API keys in JSON/LocalStorage/logs/URL/argv; a generic secret scanner or
DPAPI for all users; plaintext file fallback; default-on network; consent inferred from an enabled
provider; unknown or zero price treated as free; automatic retry after timeout; following redirects;
DNS re-resolution at connect time; arbitrary custom headers/SSML/templates; creating a Task/Artifact
from the provider; claiming INTEGRATED from Fake tests.

**Related:** [CLOUD_PROVIDERS.md](CLOUD_PROVIDERS.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[TTS_PROVIDER_ARCHITECTURE.md](TTS_PROVIDER_ARCHITECTURE.md).

## ADR-022 — Whale Singing application is a thin adapter over the existing Cover single-claim/MASTER path

**Status:** accepted (`12-A/APP-OFFLINE` / `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03).
**Related:** ADR-017, [SINGING_APP_OFFLINE.md](SINGING_APP_OFFLINE.md), [ARCHITECTURE.md](ARCHITECTURE.md).

**Decision:** The first Singing application unit is a thin coordinator, not a second Core. It consumes the
existing `createCoverTask` / `executeCover` / `coverStatus` / `requestCoverCancel` / `resumeCoverFinal` and the
existing Fixture Artifact library. Source/voice rights, model facts and dependency evidence come from trusted
injected catalogs/providers; the browser only selects a trusted source/voice and bounded pitch/layout/mix
parameters. One idempotency key is derived from source + voice: same parameters return `EXISTING`, changed
parameters conflict, and an existing `CLAIMED/SAVED/CANCELLED/FAILED/UNKNOWN` is never silently re-executed.
Preview reads only a saved MASTER through the library's scope/ref/rights/expiry gate. The page panel appears only
with an explicitly injected `window.__WHALE_SINGING_APP__`; production Host remains read-only and shows
“未接入”. Results are Fixture-only, `persisted:false` and `realReady=false`; no Relay/WeChat send is created.

**Reason:** The existing Cover executor already owns the single Task claim, dependency gate, synthetic stage
state, unique MASTER import and terminal/cancel semantics. Rebuilding any of those in the page would create a
second task/delivery truth and a browser-controlled rights path. The adapter/harness split lets the UI be tested
without turning a production read-only Host into an unauthenticated write surface.

**Rejected alternatives:** A second singing Task/Artifact store; page-computed rights/ready/hash; treating a
Fixture save as a real cover or `SENT`; auto-starting or retrying when status is `UNKNOWN`; adding a production
Host write route or real audio/device playback in this unit; implementing 13-A/12-B/C/D to make the panel appear
complete.

**Related:** [SINGING_APP_OFFLINE.md](SINGING_APP_OFFLINE.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[PLAN09_ONBOARDING_UX.md](PLAN09_ONBOARDING_UX.md).

## ADR-023 — The Singing page is proven through a test-only HTTP bridge to real Core, not a fixed fake adapter

**Status:** accepted (`12-A/APP-OFFLINE` / `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03).
**Related:** ADR-022, [SINGING_APP_OFFLINE.md](SINGING_APP_OFFLINE.md).

**Decision:** The isolated UI harness injects a browser fetch adapter (`window.__WHALE_SINGING_APP__`) whose
endpoints are served by `tests/ui/singing-bridge.mjs`. The bridge owns a temporary sandbox, imports real synthetic
WAVs into the Fixture Artifact library, and calls the actual `openSingingApp`/`createCoverTask`/`executeCover`/
`coverStatus`/`requestCoverCancel`/`preview` path. It exposes only metadata derived from actual Core results
(state, MASTER count/hash/length, preview bytes/hash); there are no fixed task ids, stage labels or hashes in the
browser adapter. The bridge is test-only and never registered by `index.js`.

To make cancel observable, `executeCover` accepts an optional test/harness `stageDelayMs` (0–2000, default 0) and
the app exposes `start()` so the long Promise is not held by the page; a `CLAIMED` task can be queried/canceled
while running, and a task-ref guard ignores late responses from a switched-away task. Production callers omit the
delay (0), and cancel still goes through the existing fence/requested/confirmed semantics.

105 tightens the browser identity rule: a monotonic selection generation plus a per-operation busy token covers
create/execute/status/cancel/preview and auto-poll **success, rejection, exception and finally**. A stale response
cannot set task id, stage, preview, error or clear a newer busy state; A→B→A also gets a new generation. The bridge
stores an immutable `taskId → {draft,sourceRef,voiceProfileId}` map and executes/previews only from that record;
a global `lastDraft`/`lastTaskId` is never enough to grant old A execution rights under B.

**Reason:** Fixed fake returns only show the UI can render; they cannot prove the page reaches the real single-claim
executor, saves one MASTER or reads actual stored bytes. A real temporary bridge is the minimum evidence for R01,
while keeping the production Host read-only. A controlled pause is preferable to weakening Core assertions or
sleeping for an arbitrary duration.

**Rejected alternatives:** Fixed task/stage/hash stubs in `harness.js`; a production HTTP write route; mocking
`coverStatus`/`requestCoverCancel`; removing cancellation assertions to avoid timing flakiness; disabling the
task-ref guard and letting a late result overwrite the current task.

**Related:** [SINGING_APP_OFFLINE.md](SINGING_APP_OFFLINE.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[PLAN09_ONBOARDING_UX.md](PLAN09_ONBOARDING_UX.md).

## ADR-024 — One persistent delivery owner in Whale Relay Core, one Fake backend for 13-A

**Status:** accepted (`13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03).
**Related:** ADR-001, [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [ARCHITECTURE.md](ARCHITECTURE.md).

**Decision:** `core/audio/relay-core-offline.mjs` is the only writer of delivery records. It references the Whale
Audio Core `taskId`/SAVED artifact and mints one persistent `delivery:<32hex>` plus a separate
`[A-Za-z0-9_-]{8,64}` backend request id; it stores `taskId → deliveryId → backendRequestId`, artifact
hash/bytes/duration/format, rights expiry, target and fixed backend. A canonical digest returns `EXISTING` for the
same semantic request and rejects a same-`requestKey` content/target conflict. The store is atomic
(temp+fsync+rename) under a token-owned lock, has bounded capacity, persists `SUBMITTING` before submit, and
recovers a real dead child-process owner to `UNKNOWN`; `UNKNOWN` is terminal and never retried. Cancel is requested
first and only `confirmCancel` becomes `CANCELLED`.

The only accepted backend for this unit is `createFakeDeliveryBackend`, which rechecks target authorization/identity
and the Bridge/Worker two-gate and records only simulated `QUEUED` receipts. Sender is not imported, no production
config/token/port/process/network/device/WeChat is touched. `projectUnifiedRelayComponent` is one product view with
legacy `whale-relay`/`voice-sender` aliases and no second install store; WeChatAgent remains independent.

**Reason:** ADR-001 requires `SAVED ≠ SENT` and one delivery owner; the previous Fake Relay was an in-memory Map
without durable delivery id or restart protection. A single persistent store plus a Fake backend is the minimum
offline proof without copying Sender or claiming real send.

**Rejected alternatives:** A second global task/ID authority; using colon task ids as Sender request ids or
truncating them; a second install/health store; retrying `UNKNOWN`, switching backend or synthesizing text; importing
Sender's server top-level into the Fake adapter; treating `ACCEPTED`/HTTP 200 as `SENT_LOCAL`.

**Related:** [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).
