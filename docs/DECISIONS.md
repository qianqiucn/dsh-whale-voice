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

**Decision:** `core/audio/relay-core-offline.mjs` is the only writer of delivery records. It validates the actual
SAVED Audio Task record, reads the real Fixture Artifact bytes through the existing library under the supplied
scope/rights proof, computes the artifact hash/bytes/duration/format itself, and resolves the target from a trusted
Core target directory. It mints one persistent `delivery:<32hex>` plus a separate `[A-Za-z0-9_-]{8,64}` backend
request id; it stores `taskId → deliveryId → backendRequestId`, rights proof/expiry, target and fixed backend. A
semantic digest (task/artifact hash/target/proof/expiry, **not** requestKey) returns `EXISTING` for the same
request and rejects a same-`requestKey` content/target conflict; a changed requestKey is only an alias. The store
is atomic (temp+fsync+rename) under a token-owned lock with token-quarantine release, has bounded capacity, persists
`SUBMITTING` before submit, protects a same-process/global live owner from another normal open, and recovers a real
dead child-process owner to `UNKNOWN`; `UNKNOWN` is terminal and never retried. Submit re-reads the artifact and
target before any Fake call. Cancel is requested first and only `confirmCancel` becomes `CANCELLED`. Normal handles
have no reset API, so tombstones cannot be cleared.

The only accepted backend for this unit is `createFakeDeliveryBackend`, which has its own target directory and
rechecks target identity/type/authorization and the Bridge/Worker two-gate, then records only simulated `QUEUED`
receipts. Sender is not imported, no production config/token/port/process/network/device/WeChat is touched.
`projectUnifiedRelayComponent` is one product view with legacy `whale-relay`/`voice-sender` aliases and no second
install store; WeChatAgent remains independent.

**Reason:** ADR-001 requires `SAVED ≠ SENT` and one delivery owner; the previous Fake Relay was an in-memory Map
without durable delivery id or restart protection. A single persistent store plus a Fake backend is the minimum
offline proof without copying Sender or claiming real send.

**Rejected alternatives:** A second global task/ID authority; using colon task ids as Sender request ids or
truncating them; a second install/health store; retrying `UNKNOWN`, switching backend or synthesizing text; importing
Sender's server top-level into the Fake adapter; treating `ACCEPTED`/HTTP 200 as `SENT_LOCAL`.

**Related:** [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

## ADR-025 — Relay delivery authority is a persisted SAVED relation plus a versioned issuance, not caller JSON

**Status:** accepted (`13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03).
**Related:** ADR-001, ADR-024, [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md).

**Decision:** `ensureDelivery` accepts only a *reference* handoff
(`{schemaVersion, scopeId, taskId, artifactRef, targetId, requestKey, rights}`); any unknown key — most importantly a
caller-supplied `taskRecord` — is refused. For that reference the relay re-reads the persisted authority itself: the
AudioTask owner store (v2 `get` + `artifactStatus` at the current time, requiring `SAVED`, `READABLE`, the same
`outputArtifactRef` and the persisted `deliveryRequested === true`) or, when the Cover v3 owner store is present, the
Cover status (`SAVED` + MASTER `artifactRef`). A successful delivery persists a versioned issuance (`intentId:
intent:<32hex>` plus `intent{version, kind, taskIdentityHash, deliveryRequested, authorizedBy, issuedAt}`). The frozen
Cover record keeps `deliveryRequested:false` and is never edited: for it the persisted issuance
(`RELAY_ISSUED_FOR_FROZEN_COVER`) is the authorized handoff, while a legacy Task record must already carry the
persisted delivery intent (`PERSISTED_TASK_DELIVERY_INTENT`). A `requestKey` is an immutable binding checked before
any digest reuse: a bound key can never be re-pointed at another content/target digest, and an unbound key may only
register an alias for the digest it first resolves to. Right before the Fake Worker is asked to accept (after the
health/capabilities/resolve awaits), the relay re-reads the authority identity hash, the artifact bytes/hash/expiry and
the Core target, so a revocation/expiry during preflight produces zero backend submit. The Fake Worker's own `submit`
resolves the target from its own directory by the *persisted* delivery target id/kind and backend id and never treats
the upstream booleans or a handed-over resolver result as authorization.

**Reason:** the 0138 review proved that a JSON `SAVED` record (or a flipped copy of a real one) was accepted as the
task authority, that expiry/deletion during an awaited preflight still reached the Fake Worker, and that the Fake
Worker only checked the three upstream booleans. Keeping the persisted relation as the single authority (with the
issuance as the only way to bind a frozen Cover record) closes those paths without rewriting the frozen AudioTask or
Cover schemas.

**Rejected alternatives:** trusting a caller-provided record or `deliveryRequested` copy; editing the frozen Cover
record; a second task/id authority; treating an upstream resolver/three booleans as the Worker's authorization; an
opaque "session" token that is not persisted; relaxing to Best-Effort busy/unknown instead of failing closed.

**Related:** [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

## ADR-026 — A Cover delivery needs a separate persisted source permit; store and lease authority fail closed

**Status:** accepted (`13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03).
**Related:** ADR-001, ADR-024, ADR-025, [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md).

**Decision:** A persisted SAVED Cover MASTER is a save, not a delivery permission. The frozen v3 Cover record
keeps `deliveryRequested:false` forever and is never edited, so a Cover delivery requires a **separate,
versioned, persisted source permit** created through `issueDeliveryPermit({permit})` with
`{schemaVersion, scopeId, taskId, artifactRef, targetId, rights}`: the permit is checked against the persisted
Cover authority (SAVED + MASTER ref/hash), the real artifact bytes and the trusted target directory, is bound
to the same scope/task/MASTER/target/kind/rights proof, is idempotent per relation and immutable afterwards.
`ensureDelivery` for a Cover task requires the `permitId` and asserts the permit key, `taskIdentityHash` and
expiry; a missing/fabricated/mismatched/expired permit is `RELAY_CORE_PERMIT_REQUIRED` with no delivery. A
Voice task keeps its persisted `deliveryRequested:true` intent and is refused a permit. The delivery issuance
records `authorizedBy: PERSISTED_COVER_DELIVERY_PERMIT` plus the `permitId`.

Two persistence fences are mandatory: (1) the store is accepted only when records, digest/request-key indexes
and permits are mutually consistent, so a corrupt/partial index is `STORE_INVALID` and is never repaired,
re-minted or treated as a fresh store; (2) a writer may commit only after re-reading the canonical lease (its
own token) and the store revision it started from, so a writer whose live lease was moved aside — the window
in which a third process legitimally takes the empty canonical lock name — fails closed with `STORE_BUSY`
instead of overwriting a newer successful state with an old snapshot.

**Reason:** the 0139 review proved that the relay minted its own `RELAY_ISSUED_FOR_FROZEN_COVER` authorization
from a SAVED Cover record (no source authorization), that a clock crossing inside the final awaited artifact
read still reached the Fake accept, that a moved live lease let a stale writer overwrite a newer cancel, and
that a corrupt index could re-mint an already accepted delivery. Each is a permission, duplicate-acceptance or
data-loss risk; each is now closed by an explicit persisted source authority or a fail-closed fence.

**Rejected alternatives:** treating a SAVED MASTER or `deliveryRequested` as a delivery permission; a
self-signed in-`ensureDelivery` cover flag; editing the frozen Cover record; repairing/分空 indexes or
replaying a corrupt store; locking only by file presence without a commit-time lease/revision check; treating
a stolen-lease write as success.

**Related:** [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

## ADR-027 — A revision reservation is the commit authority; the delivery digest is recomputed from facts

**Status:** accepted (`13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03).
**Related:** ADR-001, ADR-024, ADR-025, ADR-026, [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md).

**Decision:** The advisory lease is not the write authority. Before publishing revision `N+1` a writer must
reserve `unified-relay-v1.json.commit-<N+1>`: the guard is prepared as a complete file and published with an
atomic hard link (create-or-fail; `COPYFILE_EXCL` only as a fallback), so it is never observed empty. The
reservation is taken before the final `rename` and held until the store rename really happened, and it is
not transferable: a third process that legally acquires the canonical lock after a stale reclaim moved the
live lease still cannot reserve the same revision and fails closed with `STORE_BUSY`. The writer also
re-checks its lease token and starting revision after reserving. Guards for already published revisions are
cleaned best-effort; a dead guard owner is fenced by move-then-verify before removal, and an unreadable guard
is conservative `STORE_BUSY`.

The delivery digest is a *verified function of persisted facts*, not a stored string: creation and store
validation both call `canonicalDeliveryDigest` over the authority kind, task identity hash, task/artifact
refs, artifact hash/bytes/duration/format, target id/kind, rights proof/expiry and permit. A record whose
digest or index was edited without the facts (or vice versa) makes the whole store `STORE_INVALID`, so it can
never be used to re-accept an already accepted request under a new alias.

**Reason:** the 0140 review proved that a pause between the lease/revision check and the final rename let a
stale reclaim move the live lease, a third process commit, and the paused writer overwrite it with an old
snapshot; and that editing only the digest (and its index) kept the store valid while the same request was
accepted a second time. Both are data-loss/duplicate-acceptance risks. A check followed by another window is
not a proof of exclusion; the reservation is an exclusive claim held across the publish, and the digest is
recomputed from the record it is supposed to describe.

**Rejected alternatives:** another pre-rename read check (moves the window instead of closing it); treating
guard file age/mtime as staleness (could delete a live reservation); repairing/recomputing a damaged store;
re-minting ids or replaying; trusting the stored digest/index strings.

**Related:** [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

## ADR-028 — The store is an immutable revision log; the create-or-fail revision file is the commit

**Status:** accepted (`13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03). Supersedes ADR-027.
**Related:** ADR-001, ADR-024, ADR-025, ADR-026, [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md).

**Decision:** The delivery store is an append-only log of immutable revision files
`unified-relay-v1.r<N>.json`. A commit is the atomic create-or-fail publication of exactly the next revision
file: the complete new state is written and fsynced to a private temp file, then published with a hard link
(exclusive copy only on filesystems that cannot hard-link). The create *is* the commit; there is no fixed
"current store" name that is renamed, replaced, reclaimed or deleted, and no post-create step. A writer whose
advisory lease was moved aside by a stale reclaim can therefore never overwrite a newer commit: it either
creates a revision nobody else took, or the create fails and it reports `STORE_BUSY` — two writers can never
publish the same revision. Readers take the highest validated revision; a corrupt higher revision fails
closed instead of falling back to older data. Old revisions are pruned best-effort (newest four kept) and can
never be a writer's base again, so pruning cannot create an empty-current window. Private temp files are never
authoritative and only a provably dead owner's temp is removed. The advisory lease and a latest-revision
re-check are kept only as contention hints, never as write authority.

**Reason:** the 0141 review showed that the revision guard of ADR-027 was itself a movable/deletable
same-name file: a dead-guard reclaim could move a live replacement, a released path could be reused by a new
guard, and the holder's exclusivity during the final rename was therefore not proven. Replacing the guard with
an immutable log makes the exclusivity structural (the name is the committed data) instead of a lock
lifecycle, without adding another reclaimable lock or moving the window.

**Rejected alternatives:** another reclaimable reservation/lock; verifying and re-verifying the guard around
the rename (still a window); pid/mtime-based guard stealing; repairing or falling back from a corrupt highest
revision; migrating the unmerged previous store format.

**Related:** [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

## ADR-029 — Pruned revision numbers stay occupied; a failed enumeration is never an empty store

**Status:** accepted (`13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-03). Extends ADR-028.
**Related:** ADR-001, ADR-024, ADR-025, ADR-026, ADR-028, [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md).

**Decision:** Retention never frees a revision number. The newest four payloads are kept; older revision
files are replaced in place by a small immutable tombstone (`{pruned:true,revision:N}`) with the same name,
so a late writer whose base is older can never re-create an already published revision and report a success
that readers would ignore. The payload stays bounded (one tiny tombstone per revision) and no stale snapshot
is re-authorised. Retention failures are best-effort and never touch the highest revision.

Directory enumeration is a three-way fact, not a boolean: *confirmed empty* (successful enumeration, no
revision files), *has revisions*, or *cannot enumerate*. `readdir` errors are propagated; the read, the
commit-time version check and any cleanup that needs the list fail closed with `STORE_INVALID` instead of
treating the store as new (which previously allowed a low revision to be rebuilt and a `CREATED` success to be
returned for a record that was not in the highest authority). A highest revision that is a tombstone is
refused as corrupt.

**Reason:** the 0142 review proved two success-consistency failures of the new revision store: pruning r3
freed the name so a paused writer's stale snapshot could be re-published as r3 and return success while
readers stayed at r9 (lost successful cancel); and two `readdir` EIO made an existing store look empty, so a
`CREATED` r1 was returned for a record absent from r6. Both are repaired by making revision numbers
non-reusable and by treating enumeration failure as an unknown store.

**Rejected alternatives:** another pre-link read sample (moves the window); deleting tombstones or pruning by
age; rebuilding a lower revision on enumeration failure; returning a fake new store or `CREATED` when the
store cannot be enumerated; repairing a corrupt highest revision by falling back.

**Related:** [UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

## ADR-030 — The internal Windows Sender is an Artifact-only delivery module over reviewed resources

**Status:** accepted (`13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-04).
**Related:** ADR-001, ADR-024–ADR-029, [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md),
[UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md).

**Decision:** Whale Relay Core owns one internal Windows delivery module
(`core/audio/internal-sender-offline.mjs`) with the relay's backend interface. It consumes only the
trusted SAVED Artifact fact + trusted target, rejects any path/URL/command/script/env/token-shaped
input, resolves the target from its own directory and rechecks identity/authorization/allowlist and
the Bridge/Worker gates, builds a fixed whitelisted invocation (script id + fixed parameter order +
bounded single-line scalars, `shell:false`, contained script path), serializes through one in-memory
queue and invokes an **injected Fixture transport** exactly once per delivery. It never imports the
original HTTP server, never spawns, opens a socket/device/WeChat window or writes, and preserves
NEVER_WRITE plus terminal `UNKNOWN` (no resend/backend switch/id change/text fallback).

The original user-owned Voice Sender source closure (26 files + 2 metadata, reviewed preflight
SHA256 `a3056dea…`) is carried as resources with a manifest of relative paths, original hashes and
stored hashes; no developer absolute path, token, chat, binary/model/audio/cache, runtime state or
production config is included, and no third-party license is inferred.

**Reason:** ADR-001 and the Plan13 queue require the Sender to become the relay's internal module
without copying a second window-sending implementation, and the original source is the only reviewed
algorithm/secure-check asset. A resource-only, Artifact-only, injected-transport unit proves the
integration boundary offline while keeping real process/device/WeChat operation out of scope.

**Rejected alternatives:** a second window/recording implementation; importing the original HTTP
server or spawning PowerShell in tests; accepting file paths/URLs/commands from the request; a second
generation registry or queue; retrying/re-binding `UNKNOWN`; inferring a license for third-party
components.

**Related:** [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-031 — The internal Sender speaks the archived Worker's real ABI and cancels through its cancel file

**Status:** accepted (`13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-04, 114 revision).
Extends ADR-030.
**Related:** ADR-001, ADR-024–ADR-030, [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md),
[UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md).

**Decision:** the internal Sender never invents an execution protocol.

1. **ABI.** Every invocation is built from a version-bound descriptor of the *actual* archived Worker:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File voice-sender.ps1 -Request <json> -JsonOut
   <json> -ProgressFile <p> -CancelFile <c> -GlobalCancelFile <g>`, with the request JSON carrying
   exactly the fields `voice-sender.ps1` reads. `verifyWorkerAbi()` re-derives each `param()` table,
   the request-field usage and the reviewed `service/src/sender.mjs` argv from the archived bytes and
   reports mismatches; a Fixture can therefore never "accept" an argv the Worker would reject. The
   previously invented `cancel-test.ps1`/`preflight-wechat.ps1` ids do not exist and are refused.
2. **Cancel.** Cancellation is the reviewed per-job cancel *file*, not a script result: `cancel()`
   writes the signal and reports requested → confirmed (the Worker's own `CANCELLED` with
   `CANCELLED_BEFORE_UI`/`CANCELLED_CONFIRMED`) or unconfirmed (`UNKNOWN`); a queued job is a pre-UI
   cancellation with zero Worker call; a terminal delivery is `CANCEL_TOO_LATE`. An accepted fact and
   its receipt are never erased by a later cancel.
3. **Single execution.** Validation, the immutable fact snapshot, the id claim, the conflict check and
   the post-queue re-check live in one trusted boundary: one delivery id = at most one invocation, the
   same id with different artifact/target is `DELIVERY_CONFLICT`, and an indeterminate result is
   terminal (no second invoke).
4. **Result layering.** Only a provable pre-UI `REJECTED`/`FAILED` is a pre-submit failure; a missing,
   empty, corrupt or thrown Worker result is indeterminate `UNKNOWN` with `recoveryRequired`.
5. **Legacy text.** A callable offline facade sends legacy text through the *same* generation owner →
   the *same* persisted SAVED Artifact → the *same* persistent relay entry → the *same* backend; the
   request identity is deterministic, so a replay is `EXISTING` everywhere and a failed/cancelled/
   unknown delivery is never regenerated or resent. No second cache, queue, timer or generation
   registry is introduced.

**Reason:** the 0144 review proved the first revision was self-consistent but not Worker-compatible
(SEND argv absent from the real parameter table, CANCEL/PREFLIGHT pointing at unpackaged files, a
second invocation after the first `UNKNOWN`, an Artifact/target re-bind while queued, and post-invoke
empty results reported as "provably not sent"). A static ABI cross-check plus the real cancel-file
protocol and one write-once claim keep the offline unit honest without executing PowerShell/C#.

**Rejected alternatives:** inventing a parallel argv/request schema; simulating cancellation inside
`submit`; a global id owner or a second business queue; treating a missing/thrown result as
`preSubmit`; a legacy-text cache or generation registry; running the archived scripts offline.

**Related:** [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-032 — One observed verdict is final, and the execution slot covers the Worker holding period

**Status:** accepted (`13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-04, 115 revision).
Extends ADR-031.
**Related:** ADR-001, ADR-024–ADR-031, [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md).

**Decision:**

1. **Terminal monotonicity.** A worker verdict observed through `query()` while `transport.invoke` is
   still awaiting is final. A late dispatch acknowledgement can never reopen it into `ACCEPTED`, and
   a settled delivery's state, cancel flags and receipt are write-once: later/concurrent observations
   cannot rewrite them.
2. **Observation belongs to the invocation.** Only a delivery that actually invoked may consume a
   worker result; a still-queued delivery stays `QUEUED` and never "inherits" an old result.
3. **The execution slot covers the holding period.** The single serial slot stays owned until the
   claim's terminal observation (a dispatch-only Worker holds it), not merely until the acceptance
   callback. A terminal worker result is what releases it; `UNKNOWN` is such a terminal result, not a
   proof that the device was freed. No second business queue or global id owner is introduced.
4. **Bad evidence is indeterminate.** A recognized status name is not a trusted result: malformed or
   contradictory key evidence (`cancel_stage:'UNKNOWN'`, bad bubble/reason/stage/phases/timeline, a
   rejection carrying UI evidence) is `UNKNOWN`; only a well-formed pre-UI refusal is `preSubmit`.
5. **Stable legacy identity.** The legacy text facade keys its request identity on
   `(scope, legacyRequestId)`: changed text reuses the original Task/Artifact/delivery result, changed
   target is refused by the relay's immutable request-key binding. No payload-hash fork, no second
   generation registry.

**Reason:** the 0145 review replayed concrete counterexamples: a settled `UNKNOWN` was reopened to
`ACCEPTED` by a late dispatch acknowledgement, concurrent observations mutated `cancel.confirmed`
after a terminal state, a queued delivery consumed a pre-set worker result, a second Worker started
while the first only had a dispatch acknowledgement, `CANCELLED` with an `UNKNOWN` stage was reported
as a confirmed cancel, and a changed legacy payload minted a second task/artifact/delivery that
bypassed the original `UNKNOWN`.

**Rejected alternatives:** keeping the slot until acceptance only; polling timers/background loops;
treating an unknown cancel stage as a confirmed cancel; deriving legacy identity from the payload;
adding a second id owner or business queue.

**Related:** [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-033 — The logical verdict and the execution lease are separate facts

**Status:** accepted (`13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-04, 116 revision).
Extends ADR-032.
**Related:** ADR-001, ADR-024–ADR-032, [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md).

**Decision:**

1. **Verdict ≠ resources.** `settle()` fixes the delivery verdict (write-once, monotonic, answers the
   submit promise) but does not by itself free the one serial execution slot. The slot is released
   only by trusted exit/recovery evidence:
   - an invoke-returned trustworthy terminal (pre-UI refusal; `SENT_LOCAL`; legal `CANCELLED`) is the
     offline model of the worker process ending, and a send/rollback additionally requires the result
     not to report `restore_ok:false`;
   - a later `query()` observation is logical only; it releases the slot only when the transport
     reports `released:true` (trusted exit + device recovery). Exit with no usable result settles
     `UNKNOWN` and then releases.
2. **Uncertain occupancy.** `UNKNOWN`, unconfirmed cancels, missing/empty/bad results, thrown
   transports and failed restores keep the slot (`occupancy:'HELD'`); the delivery stays terminal and
   refuses the same id. The static `recover()` descriptor is never exit evidence.
3. **Exception classification by boundary.** Before `claim.invocation` is set, a failure is a
   deterministic pre-invoke rejection (`preSubmit`, slot released). After the invocation — including
   the acceptance-time clock sample — it is `UNKNOWN` with the uncertain lease preserved.
4. **Evidence consistency.** A `CANCELLED` claiming `CANCELLED_BEFORE_UI` (or none) while carrying
   `RECORDING`/`SENDING`/release evidence is `UNKNOWN`; a legal `CANCELLED_CONFIRMED` may carry
   recording evidence.

**Reason:** the 0146 review proved `settle()` released the slot on every terminal, so a query-observed
`UNKNOWN`, an unconfirmed cancel, an empty/thrown invoke result or the acceptance-clock exception let
the next delivery start with no exit/recovery proof; and a self-contradictory pre-UI cancel was still
confirmed.

**Rejected alternatives:** treating any terminal as release; auto-releasing on a timeout; a boolean
self-report as exit proof; a second queue/ID owner/retry path; treating a `BEFORE_UI` claim as proof
despite UI evidence.

**Related:** [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).
---

## ADR-034 — Recovery evidence is tri-state, and a late exit releases the lease without rewriting the verdict

**Status:** accepted (`13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`, 2026-11-04, 117 revision).
Extends ADR-033.
**Related:** ADR-001, ADR-024–ADR-033, [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md).

**Decision:**

1. **A pre-UI verdict is not a recovery proof.** The archived worker may switch the capture device and
   then fail before recording (`voice-sender.ps1` ~416–439, `finally` ~641–668). A `FAILED`/`REJECTED`
   verdict therefore keeps its "not recorded/sent" meaning but does not release the execution slot on
   its own; the unrestored resource is held until trusted exit/recovery evidence.
2. **Tri-state recovery.** `restoreState()` accepts `restore_ok:true` as verified and an omitted field
   as the established Fixture-compatible positive; `false` and every other provided non-boolean value
   (`'false'`, `null`, `0`, `1`, `''`, arrays, objects) are failed/unknown and conservatively hold the
   slot. Omission is never used to assert *real* device recovery.
3. **Late exit.** After a verdict is fixed, a late invoke answer is inspected independently: a
   contract-recognised clean result with compatible recovery evidence releases the lease, while the
   verdict, cancel flags and receipt stay write-once — no reopen, no second invocation of the same id,
   no extra queue. Bad/missing/recovery-failed late results keep holding; concurrent releases are
   idempotent and one delivery's release evidence never frees another delivery.

**Reason:** the 0147 review showed a pre-UI `FAILED` with `restore_ok:false` released the slot and
started the next worker, `restore_ok` bad types (`'false'`, null, 0, 1, empty string, arrays, objects)
were accepted by `!== false`, and a late clean exit after a query verdict was dropped by the
`SETTLED` guard, leaving a reachable queue stuck until a manual release.

**Rejected alternatives:** treating any pre-UI verdict as resource release; treating omission/bad
types as proven recovery; letting a late exit rewrite the verdict; a synthetic release API or a second
queue.

**Related:** [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).
---

## ADR-035 — Native voice admission stays closed; inbound SILK/transcription is not an outbound capability

**Status:** accepted (`13-C / RESEARCH_CANDIDATE` / `NOT_INTEGRATED`, 2026-11-04, 118-B).
**Related:** ADR-001, ADR-024–ADR-034, [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

**Decision:** the native-voice research was refreshed against public first-party evidence on
2026-11-04 and the admission conclusion is unchanged:

- WeChatPYAPI (`master` @ `05060fa`, `version.txt` V-9.2.1) publishes `send_voice` (SILK absolute path,
  ms, boolean) but has **no LICENSE**, still asks users to disable antivirus, and documents only
  Windows WeChat 3.6.0.18 / 4.1.12.26;
- PadChat-SDK (`master` @ `f1dd594`, 2024 code) publishes `sendVoice` (SILK base64, ms, `msgId`
  examples); its `package.json` v0.6.1 declares **ISC** (no separate LICENSE/notice file), but it
  depends on a separate Windows iPad-protocol login service whose authorization is unpublished — the
  full path’s license gate is therefore UNKNOWN, not “no license”;
- WeChatAgent 0.4.2 (`main` @ `38c1060`) has **no outbound voice API**; its `silk-wasm` codec and
  optional speech-recognition plugin are inbound/transcription features. Its root MIT covers the
  project’s own code only; `docs/WECHAT_HOOK.md` requires separately licensed third-party Hook source
  and a matching client build for the complete native path, so that path’s license/component gates are
  UNKNOWN, not PASS.

All 12 existing admission gates are scored PASS/FAIL/UNKNOWN per candidate; none is
`PROTOTYPE_READY`. The original plan's “two community developers”, `wechat_voice_say` and
`wechat_sing` remain UNKNOWN (no precise first-party source). Native/auto stay
unselectable/unsubmittable; no runner, production route, second queue or retry path is created; no
DLL/Hook/SDK is downloaded or executed.

**Reason:** the 2026-10-24 snapshot is stale in places (WeChatPYAPI moved to V-9.2.1; WeChatAgent is at
0.4.2 with inbound SILK), and an unscored “looks like a voice API” claim must not become an enabled
backend. A message ID, `True`, `status:0` or HTTP 200 is not a native-bubble receipt.

**Rejected alternatives:** treating an API name or `msgId` as admission; bundling an unlicensed
DLL/service; disabling antivirus; re-labeling inbound `record`/SILK/transcription as outbound voice;
starting a prototype without license, coexistence and receipt evidence.

**Related:** [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).
---

## ADR-036 — Provider generation is claim-first and isolated; a SAVED candidate is not an owner SAVED entry

**Status:** proposed / accepted for the OFFLINE unit (`IN PROGRESS`, 2026-11-04, 120-B).
**Related:** ADR-001, ADR-024–ADR-035, [PROVIDER_GENERATION_OFFLINE.md](PROVIDER_GENERATION_OFFLINE.md).

**Decision:** the first provider → SAVED wiring unit is a separate, versioned coordinator
(`core/audio/provider-generation-offline.mjs`) rather than an in-place extension of the Plan 08 owner
snapshot:

1. the claim is persisted **before** any synthesis and binds scope/task/birth, provider instance,
   model/backend/voice, the exact request digest and the rights proof; duplicate, conflicting,
   cross-scope, unauthorized and `UNKNOWN` re-entry never synthesise again;
2. provider output is re-measured by the coordinator (WAV PCM16/24 kHz/mono, 200–20000 ms, ≤1 MiB)
   and stored through the existing Artifact library, then re-read and SHA256-compared before `SAVED`;
3. cancel, late result, unconfirmed exit, failed artifact write and readback mismatch are separate
   facts; a `SAVE_UNKNOWN` tombstone is never repaired by a second synthesis; `SAVED` never implies
   delivery;
4. **the Plan 08 owner SAVED entry is still missing (121 status: not completed).** The owner’s SAVED
   write is a strict `SaveProof` transaction validated against the artifact store, and the existing
   artifact library labels every entry with a fixed fixture origin. A provider entry therefore needs
   **coordinated schema changes in two stores** (artifact origin/version plus an owner v3 entry and
   proof keys) with full regression of the owner invariants — a separate, reviewed unit. This is
   recorded as a concrete gap, not as a silent extension of the plan.

**Reason:** the owner snapshot is a strict, security-critical on-disk contract; bolting a provider
entry into it in the same unit as the first provider wiring would mix two independent risk domains
(provider output handling vs. owner invariant changes). A separate coordinator delivers the isolated,
testable pipeline now while keeping the owner contract untouched.

**Rejected alternatives:** writing provider bytes through the fixture engine (would mislabel fixture
authorization as real), a second task/artifact store, and an untested owner-schema change.

**Related:** [PROVIDER_GENERATION_OFFLINE.md](PROVIDER_GENERATION_OFFLINE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).