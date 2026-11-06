# Whale Relay Core · Plan 13-A / OFFLINE

**Status:** `13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-07, 180 revision).
This is the first offline owner of delivery persistence for the ADR-001 unified
`Whale Audio Core → Whale Relay Core → supported target` boundary. It consumes a *persisted* SAVED Audio
Task (or a persisted SAVED Cover MASTER, or a saved Provider generation result in its real storage
segment), reads the real Fixture Artifact bytes through the existing Artifact library under the same
scope/rights, and resolves the target from a trusted target directory; it does **not** trust
caller-supplied task records, artifact metadata, hashes, rights booleans or target booleans. It does
**not** import or start the Windows Sender, open a socket, resolve a real chat, record audio, play media
or send to WeChat. The whole Plan13-A, 13-B, 13-C and real Plan14 remain OPEN.

Related: ADR-001 (local architecture record, versioned outside this repository), ADR-024/ADR-025
([DECISIONS.md](DECISIONS.md)), [ARCHITECTURE.md](ARCHITECTURE.md),
[WHALE_AUDIO_CORE_CONTRACT.md](WHALE_AUDIO_CORE_CONTRACT.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

## 1. Ownership, authority and the handoff

| Object | Owner in this unit | Notes |
|---|---|---|
| taskId / SAVED state / MASTER ref / bytes / rights | Whale Audio Core (AudioTask owner v2 store, Cover owner v3 store) | Relay only references them; it never creates a second task or edits the frozen record |
| delivery authority (issuance) | `core/audio/relay-core-offline.mjs` persistent store | one versioned `intentId` per delivery |
| deliveryId | same store | minted once, stable for the same semantic request; conflicts reject |
| backendRequestId / legacy request id | same store, derived from random bytes, `[A-Za-z0-9_-]{8,64}` | never a second global task id, never a colon id, never a truncation collision |
| backend selection | pinned at `ensureDelivery` | submit cannot switch backend or ID |
| target identity/authorization | Core trusted target directory + Fake Worker's own directory | browser/model cannot self-report it |

`ensureDelivery({ handoff })` accepts only a reference envelope:

```json
{ "schemaVersion": 1, "scopeId": "scope:fixture-…", "taskId": "task:fixture-<32hex>",
  "artifactRef": "artifact:fixture-bytes-<32hex>", "targetId": "fixture-private-a",
  "requestKey": "relay-request-a", "rights": { "state": "GRANTED", "proofRef": "fixture-rights:…" } }
```

Every other key is refused; a caller-supplied `taskRecord` is refused with `detail: "taskRecord"`. For that
reference the relay re-reads the persisted SAVED relation itself:

- **AudioTask owner store (v2):** `get()` must report owner state `SAVED`; `artifactStatus()` at the current
  time must be `READABLE` with the same `artifactRef`. The artifact hash/byte length/duration/format still
  come from the actual WAV bytes returned by the Artifact library, never from caller metadata. A task whose
  persisted record carries `deliveryRequested: true` (Voice) is delivered directly; the saved
  `provider-generation` / `PROVIDER_TTS` task never carries that intent (the task contract refuses it) and
  needs the confirmation permit below.
- **Cover owner store (v3):** `coverStatus()` must be `SAVED` with a MASTER whose `artifactRef` (and
  `sha256`) is the requested one. The frozen Cover record keeps `deliveryRequested:false` forever and is
  **never edited**; a SAVED MASTER is a save, not a delivery permission.

**Cover source permit (109).** The frozen Cover record cannot carry the user's delivery intent, so a Cover
delivery additionally requires a *separate, versioned, persisted source permit* issued through
`issueDeliveryPermit({permit})` with `{schemaVersion, scopeId, taskId, artifactRef, targetId, rights}`. The
permit is bound to the same scope/task/MASTER (`artifactSha256`)/target/kind/rights proof, is idempotent per
relation (`ISSUED`/`EXISTING`, immutable afterwards), and is stored as
`{permitId:"permit:<32hex>", permitKey, version:1, ..., authorityKind:"COVER_OWNER_SAVED_V3", issuedBy,
issuedAt}` with a bounded permit capacity. `ensureDelivery` for a Cover task **requires** `permitId`; without
it (or with a fabricated/mismatched/expired one) the result is `RELAY_CORE_PERMIT_REQUIRED` and no delivery
is created. The delivery's issuance records `authorizedBy:"PERSISTED_COVER_DELIVERY_PERMIT"` and the
`permitId`; a Voice task keeps its persisted `deliveryRequested:true` intent
(`PERSISTED_TASK_DELIVERY_INTENT`) and must not carry a permit (`permitId` is refused).

**Provider confirmation permit (177).** A saved Provider generation result is a save, not a delivery
permission: the provider task contract refuses `deliveryRequested:true`, so `readTrustedTaskAuthority`
reports the persisted source as `PROVIDER_OWNER_SAVED_V2` with `permitRequired:true`, and only for the saved
`provider-generation` / `PROVIDER_TTS` pair — every other saved task without the persisted intent (for
example a Voice task saved `deliveryRequested:false`) stays non-deliverable. The same
`issueDeliveryPermit({permit})` boundary persists the confirmation bound to the same
scope/task/artifact/target/rights (idempotent `ISSUED`/`EXISTING`, bounded capacity,
`authorityKind:"PROVIDER_OWNER_SAVED_V2"`); `ensureDelivery` for it requires `permitId`, checks the permit
key, task identity and expiry, keeps the original taskId and the deliveryId/issuance/state model, and
records `authorizedBy:"PERSISTED_PROVIDER_DELIVERY_PERMIT"`. The frozen saved record is never edited. A
retained `PROVIDER_GENERATION_FIXTURE` artifact is not refused by its recorded 24 h value at issue, ensure
or accept (155 already retains those bytes), so a still-readable result older than that value can still be
confirmed and delivered; Fixture-import and Cover sources keep their exact expiry boundary.

**Cross-segment source location (178).** The generation application rotates its saves into
`segments/NNNN` stores, so the relay cannot open every task from the owner sandbox alone. The assembly
injects one trusted `locateTask({scopeId, taskId})` (the generation entry owns it); for each operation the
relay asks it which already-opened segment holds the original task and re-reads that segment's persisted
task owner / Artifact library under the same scope/rights. The locator is never a handoff field and the
caller never names a path or another segment: a task it cannot place keeps the owner sandbox, where the
same persisted read fails it as `TASK_NOT_SAVED` instead of swapping in another result. The relay store
stays at its own sandbox, so base and rotated results share one owner, one `deliveryId`/permit space and
one capacity count; no second queue or store exists inside a segment.

**Application entry (179).** `openPresetGenerationApp({..., delivery:{backend, targets}})` composes this
owner behind one application call: `confirmDelivery({taskId, targetId})` and
`deliveryStatus({taskId, targetId})`. The caller names only the original result and the explicitly
confirmed target; the entry reads the saved artifact ref itself and the assembly supplies the rights
proof and the trusted target directory/Fake backend. A deterministic request key
(`saved-delivery:<taskId>:<targetId>`) plus the persisted permit make repeat calls and reopened entries
reuse the one delivery (no second Fake request); the relay store stays the single one across base and
rotated segments. The entry returns `outcome:"ACCEPTED"` (state `ACCEPTED`, backend `QUEUED`, fixture
receipt) only for a Fake-accepted delivery; refusals are `DELIVERY_REFUSED` with a stage/cause, a
persisted non-accepted state is `DELIVERY_NOT_ACCEPTED` with the exact state, and an unconfirmed relation
is `DELIVERY_NOT_FOUND`. The status read-back is the relay's read-only
`deliveryFor({scopeId, taskId, targetId})` over the record's own scope (179 v1.1), so another
scope/proof cannot receive that record even when its taskId/targetId are known, while a same-scope record
stays readable after the saved result is deleted. Without the `delivery` wiring both methods answer
`DELIVERY_UNAVAILABLE` and generation/save/download are unchanged. No Host route or page uses this entry
yet.

**Trusted Host surface (180).** `installHostBridge` exposes the entry on the existing
loopback/Origin/connection/token guard: `POST /whale-voice/setup/generation/delivery` with
`{taskId, targetId}`, and a read-only `GET .../delivery?taskId=...&targetId=...`. Without an application
object the route answers `503 generation_not_enabled`; with an application without delivery wiring it
answers `503 PRESET_GENERATION_DELIVERY_UNAVAILABLE` and never falls back to a Fake capability. A Core
refusal is `200` + `ok:false` with its code/stage/cause, so HTTP success never means acceptance; malformed
requests are `400` and a non-declared method is `405`. The injected bridge adds the two calls and maps a
client abort to `{ok:false,error:'delivery_unconfirmed'}`; the persisted record is queried afterwards and
is never resent. No page button, target picker, real Host or real backend is involved.

`readTrustedTaskAuthority` returns a stable `taskIdentityHash` for the exact
`(authority kind, scope, task, artifact, expiry/MASTER hash)` relation. On success the delivery persists a
versioned issuance: `intentId: "intent:<32hex>"` plus
`intent { version: 1, kind, taskIdentityHash, deliveryRequested, authorizedBy, permitId, issuedAt }`.

The store is an append-only sequence of immutable revision files, `unified-relay-v1.r<N>.json`, under the
trusted Fixture sandbox. Each revision file holds the delivery records (with their `requestKeys` aliases),
the `taskId → deliveryId → backendRequestId` mapping, canonical semantic digest (authority kind + task
identity hash + artifact hash/target/proof/expiry/bytes/duration/format/permit, **not** requestKey), artifact
hash/bytes/duration/format, rights proof/expiry, target id/kind, fixed backend, issuance and state. Readers
take the highest validated revision; no fixed "current store" name exists.

A same semantic digest returns `EXISTING`; a changed requestKey is only an alias while unbound. A
`requestKey` is an **immutable binding** checked before any digest reuse: once bound it can never be
re-pointed at another content/target digest (`CONFLICT`), and an unbound key may only register the digest it
first resolves to. Capacity fails closed. Normal handles have no `reset` API, so tombstones cannot be cleared.

## 2. Single writer, submit and recovery

- One in-process queue plus a token-owned `unified-relay-v1.lock` (owner token/pid/host) serializes writes;
  a foreign live lock returns `STORE_BUSY`.
- Every lock path is fenced by “move aside, then verify the moved bytes”. A stale reclaim renames the lease
  to a private quarantine, re-reads it, and only deletes the exact stale lease it proved dead; a live
  replacement is restored with a create-or-fail link/copy (never overwritten) or left in quarantine and
  reported busy. A release moves its own lease aside, verifies it, and restores a moved foreign lease
  without overwriting a third live lease.
- The lock is advisory only and is not the write authority. A commit is the atomic creation of exactly the
  next immutable revision file: the complete new state is written and fsynced to a private temp file, then
  published with a create-or-fail hard link to `unified-relay-v1.r<revision+1>.json` (an exclusive copy is
  used only on filesystems that cannot hard-link). The create **is** the commit — there is no fixed name that
  is renamed, replaced, reclaimed or deleted, and no post-create step that could fail. A writer whose live
  lease was moved aside by a stale reclaim can therefore never overwrite a newer commit: it either creates a
  revision nobody else took, or the create fails and it reports `STORE_BUSY` (both writers can never publish
  the same revision). The advisory lease and a latest-revision re-check are kept only as contention hints.
  Old revisions are pruned without freeing their numbers: the newest four payloads are kept and older files
  are replaced by a small immutable tombstone at the same name, so a late writer whose base is older can
  never re-create an already published revision and report a success readers would ignore (the name stays
  occupied) while the payload stays bounded. Directory enumeration cannot masquerade as "no store": a
  successful enumeration with no revision files is confirmed-empty, whereas a `readdir` error is propagated
  and every read/commit/cleanup path fails closed with `STORE_INVALID` instead of rebuilding a low revision
  or returning a fake new store/record success; a highest revision that is a tombstone is refused too.
  Private temp files are never authoritative and only a provably dead owner's temp is removed. Crash/dead-owner
  recovery of in-flight deliveries (`SUBMITTING` → `UNKNOWN` on reopen) is unchanged and independent of the
  commit path.
- `ensureDelivery` persists the record before any backend call. `submit` claims the record with an owner
  token, persists `SUBMITTING` (the live token is registered only after that commit really happened, so a
  failed claim never leaves a phantom live owner), then re-reads the artifact/target.
- After `health`/`capabilities`/`resolveTarget` (all awaited), and immediately before the Fake Worker is
  asked to accept, the relay re-reads all three trusted facts again: the authority identity hash, the
  artifact bytes/hash/expiry, and the Core target. A task/artifact/target revoked, deleted or expired during
  the awaited preflight therefore produces zero backend submit.
- The accept boundary then samples the trusted clock *again* after the last awaited artifact read and
  requires `rightsExpiresAt`/`expiresAt` to still be in the future. A clock crossing that happens inside the
  final read (the reported residual window) therefore also produces zero backend submit; a normal,
  unexpired chain stays usable. The retained Provider source (177) is the one documented exception: its
  recorded 24 h value is a retention value, not a delivery deadline, so it is not used as an accept limit;
  a deleted artifact, a revoked rights proof or a revoked target still fails before the Fake accept.
- A successful Fake acceptance becomes `ACCEPTED` (not `SENT_LOCAL`); duplicate submit returns `EXISTING`.
- A backend throw/unknown after submit becomes `UNKNOWN`; a later submit returns `UNKNOWN_NO_RESEND`.
  No automatic retry, backend switch, id switch or text fallback.
- A real child process that exits while `SUBMITTING` is recovered on reopen as `UNKNOWN`; the parent does not
  treat another live process/token as dead. This is tested with a real child process.
- The live owner token is retired only after the terminal state was durably committed. A concurrent normal
  open at the accept boundary therefore never recovers a still-confirming submit; a transient lock contention
  on finalize is retried a bounded number of times, and an unproven terminal commit keeps the owner live
  (conservative `BUSY`, recovered after process exit) instead of turning a possibly accepted delivery into
  `UNKNOWN`.
- Cancellation is two-step: `cancel` sets `CANCEL_REQUESTED`; only `confirmCancel` becomes `CANCELLED`.
  `ACCEPTED`/requested is not displayed as stopped. `ACCEPTED`, `UNKNOWN` and `CANCELLED` are terminal for replay.
- Capacity is bounded; old/tombstone delivery records are never evicted or resurrected by reopening.

## 3. Fake backend gates

`createFakeDeliveryBackend({ targets, capabilities, failMode, bridgeAllowed, workerAllowed })` is the only backend.

- capabilities: WAV, ≤ 8 MiB, ≤ 15 min, `VOICE`; long/unrepresentable formats return `UNSUPPORTED_CAPABILITY`.
- `health` is a Fixture health, never a real WeChat/Sender proof.
- `resolveTarget` uses the backend's **own** trusted target directory and rechecks existence, authorization,
  allowlist and verified identity; the relay separately requires the returned target id/kind to match the stored
  target and the Core directory's current authorization.
- `submit` is an **independent final gate**: it looks the persisted `delivery.targetId` up in its own
  directory, requires the same `kind`, its own `identityVerified`/`authorized`/`allowlisted` flags and the
  Bridge/Worker two-gate, and requires the delivery to be bound to this backend id. The three upstream
  booleans and a handed-over (possibly faulty) resolver result cannot grant anything; the caller descriptor
  may only agree with the directory. Only then does it record a simulated `QUEUED` + fixture receipt. No
  network, child process, audio device or WeChat API.
- `status`/`cancel` are in-memory Fixture operations; `stats` is test evidence only.
- The module does not import `service/src/server.mjs`, create tokens, read production config or listen on a port.

## 4. Unified product view

`projectUnifiedRelayComponent()` projects one user-facing `whale-relay` item:

- `legacyAliases: ['whale-relay', 'voice-sender']`;
- internal modules: `relay-core` and `voice-sender` (compatibility execution module);
- `installAsOneUnit: true`, `secondInstallStore: false`, `realReady: false`, `mockOnly: true`;
- state is the worst of the observed modules (`BLOCKED` / `UNKNOWN` / `MISSING` / `VERIFIED`).

This is a read-only projection, not a second installation/health store. The existing feature-manifest buckets and
legacy IDs remain valid; the Plan09 wizard already presents one "鲸递（统一投递）" delivery item and
`voice-sender`/`whale-relay` remain internal aliases. WeChatAgent remains an independent identity dependency.

## 5. Store consistency and test evidence

The store is accepted only when its persisted records, the digest/request-key indexes and the delivery
permits are mutually consistent (every record indexed both ways, every index entry pointing at a matching
record, unique ids/digests/permit keys, legal terminal/owner relations, `ACCEPTED` with receipt, `SUBMITTING`
with owner). The delivery digest is not trusted as a string: validation recomputes it with the same
`canonicalDeliveryDigest` used at creation from the persisted semantic facts (authority kind, task identity
hash, task/artifact refs, artifact hash/bytes/duration/format, target id/kind, rights proof/expiry, permit),
so a record whose digest/index was edited without the facts (or vice versa) is not a trustworthy store. Any
missing, extra, duplicated or mismatched entry is treated as a corrupt store: `openUnifiedRelay` fails with
`STORE_INVALID`, the file is never repaired, re-minted or treated as a fresh store, and no second delivery
can be created for an already accepted request.

Six offline relay files, the delivery application entry file and the Host delivery surface file cover the
unit (61 tests), and the internal Windows delivery module (13-B, 144 revision) is covered by its own two
offline files (`test/internal-sender-offline.test.mjs` 29 + `test/legacy-text-delivery-offline.test.mjs` 8)
documented in [INTERNAL_SENDER_OFFLINE.md](INTERNAL_SENDER_OFFLINE.md); the legacy text facade uses this
same persistent relay entry, never a second queue or generation registry.

`test/relay-core-offline.test.mjs` (12): real SAVED task + actual Fixture library bytes, stable delivery
id/alias/intent, safe legacy request id, conflict; a caller-supplied record is never an authority; one submit
then `EXISTING`; unknown target + independent Fake Worker gate; artifact deleted between ensure and submit →
no Fake submit; `UNKNOWN` terminal/no resend/fixed backend; requested vs confirmed cancel; capacity without
eviction; concurrent handles → one submit; same-process live owner not recovered; real child-process exit →
`SUBMITTING` recovered as `UNKNOWN` and no replay; one unified component view.

`test/relay-trust-offline.test.mjs` (9, 137-TRUST-01/02): a real persisted AudioTask SAVED record reaches the
Fake chain exactly once; a real persisted Cover SAVED MASTER is refused without a source permit
(`PERMIT_REQUIRED`, fabricated permit refused), then reaches the Fake chain exactly once after
`issueDeliveryPermit` (the frozen Cover record still says `deliveryRequested:false`; wrong target reusing a
permit is refused); refusals for no store / non-SAVED / missing persisted intent / source substitution /
wrong scope; artifact deletion and exact-expiry during an awaited preflight → `FAILED` with `submitted = 0`;
a clock crossing queued inside the *final* awaited artifact read is caught by the accept-boundary re-sample →
`FAILED`/`submitted = 0`; the Fake Worker's own directory matrix (empty, unauthorized, unverified identity,
closed bridge/worker, wrong kind, wrong backend binding, mismatched caller id) all reject with
`targetChecks > 0`; a full Core chain with a revoked Worker directory and a handed-over resolver still fails
closed; a fully trusted directory entry still accepts.

`test/relay-provider-confirm-offline.test.mjs` (7, 177): every positive case starts from a real saved
Provider generation result written by the existing generation/save chain in a temporary sandbox. It covers:
the saved result alone is not a delivery permission (`PERMIT_REQUIRED`, the frozen record still says
`deliveryRequested:false`, no store file written); `issueDeliveryPermit` → `ISSUED`/`EXISTING` → one
`CREATED` delivery whose taskId/artifactRef are the original ones, `QUEUED` before submit, then `ACCEPTED`
with a Fake receipt, the stored `PERSISTED_PROVIDER_DELIVERY_PERMIT`, no second task and no second backend
request for a duplicate submit, a request-key alias or a reopened store; a confirmation bound to its own
task/target/rights (another task, another target, a revoked target and a revoked rights proof all refused);
a caller-supplied record refused and a deleted saved result reported as `TASK_NOT_SAVED`; a still-readable
result older than the recorded 24 h value confirmed and accepted while a Fixture-import artifact beyond its
own expiry is refused; bounded permit and delivery capacity failing closed without a phantom record; and an
unknown backend result staying `UNKNOWN` with `UNKNOWN_NO_RESEND` on retry.

`test/relay-cross-segment-source.test.mjs` (4, 178): real base and rotated `segments/0001` results are
built by the existing generation/save chain (24 base + 2 rotated saves), then: a base and a rotated result
both reach the same relay owner once (two deliveries/permits in one store, the segment holds no relay
store); a reopened application and relay still locate the old-segment task, return `EXISTING` for the same
confirmation, delivery and submit, and never resubmit; a deleted segment artifact and a missing task fail
as `TASK_NOT_SAVED` while a still-readable retained segment result older than its recorded 24 h value is
accepted; and permit/delivery capacity is one count across segments.

`test/saved-result-delivery-app.test.mjs` (8, 179): the generation application's delivery entry. Without
the `delivery` wiring generation/save/status/download keep working and both delivery methods answer
`DELIVERY_UNAVAILABLE`; one confirmation reaches `ACCEPTED` once with a fixture receipt, a repeat call and
a reopened entry reuse the same deliveryId and never ask the Fake backend twice, and `deliveryStatus`
reads the persisted state back; an unconfirmed relation is `DELIVERY_NOT_FOUND` while a missing task, a
deleted source and an unauthorized target fail explicitly; an unknown backend result stays
`DELIVERY_NOT_ACCEPTED`/`UNKNOWN` and is never resent; base and rotated segment results (including a
retained one) are confirmed through the one entry; confirmation and delivery capacity refusals keep their
stage/cause. The two v1.1 tests bind the status read-back to the entry's scope: another scope/proof with
the same taskId/target gets `DELIVERY_NOT_FOUND` and never the record's artifactRef/permitId/receipt
(the previous revision returned it), and a same-scope record stays readable after the saved result is
deleted without a resubmit.

`test/host-delivery.test.mjs` (7, 180): the same entry through the trusted Host connection. A POST on the
existing token/loopback/Origin/connection guard confirms one saved result and a GET reads the same
delivery back (also after a reopened application), while a repeat POST reuses the deliveryId and the Fake
backend sees one request; missing/wrong token, a non-declared method, malformed JSON and missing fields
are `401`/`405`/`400` and create no confirmation or store file; no generation object answers
`generation_not_enabled`, an application without delivery wiring answers
`DELIVERY_UNAVAILABLE` and generation/status still work; Core refusals keep their code/stage/cause with
`200` + `ok:false` (HTTP 200 never means accepted) and a scope-B Host cannot read scope-A's record; a
confirm left without an answer is not success and the persisted state is queryable afterwards; the
injected bridge calls both routes with its token and maps an abort to `delivery_unconfirmed`.

`test/relay-persist-offline.test.mjs` (12, 137-PERSIST-01/02 plus the retention/enumeration close-out): an existing digest can never hijack another
content's request key and the binding stays unchanged; a fresh alias becomes immutable; a normal concurrent
open at the accept boundary does not recover the live submit (no `OWNER_LOST`); stale reclaim never deletes a
live replacement lease; a moved foreign lease is restored; a release restore never overwrites a third live
lease; a failed claim commit leaves no phantom live owner and is retryable; an unproven terminal commit keeps
the owner live as conservative busy rather than silently becoming `UNKNOWN`; a commit can never overwrite an
already published revision (create-or-fail collision with a competing valid snapshot → `STORE_BUSY`, the
competitor's state survives); a pruned revision number stays occupied by an immutable tombstone and a replayed
historical snapshot cannot recreate it; injected `readdir` EIO on the read or on the commit-time version check
is `STORE_INVALID` with no new revision and no fake empty store, and a later normal request still works;
corrupt/inconsistent stores (missing digest
index, missing key index, both, dangling entry, duplicate record, illegal terminal relation) are refused with
`STORE_INVALID` without being rewritten and without a second acceptance.

`test/relay-lease-race.test.mjs` (2) replays both reported real three-process interleavings with the immutable
revision commit: a live writer A reads the store and pauses before its commit, a stale reclaim moves A's live
lease aside, C legally acquires the empty canonical name and commits a normal cancel, then A tries to publish
its old snapshot. A's immutable create of the already published revision fails closed with `STORE_BUSY` and
writes nothing; C's successful cancellation survives (`CANCEL_REQUESTED`), so no successful result is lost.
The after-fence variant pauses A after the temp revision file was written/fsynced and immediately before the
publish (the window the 0140/0141 review named): C publishes first, A's old snapshot cannot overwrite it.
`test/support/relay-lease-worker.mjs` is the process worker; the interleavings are arranged with real child
processes and file markers, never by editing a relay record.

Local: **1227 tests / 1223 pass / 4 platform skips / 0 fail**, UI **89/89**, `client.js` 383,622 chars
(build unchanged by this Core/Host-only revision).
All tests use synthetic WAV bytes in a temporary Fixture library, temporary sandboxes and the Fake backend; no
real audio/network/device/WeChat.

## 6. Not implemented (remains OPEN)

- Real Sender service/Worker/PowerShell/C# execution, UI-automation, window target recheck and device recovery (13-B).
- Real WeChatAgent identity/permission evidence, real target directory, real send/receipt.
- Real installation/upgrade/rollback and unified installer management (Plan14).
- Real model/API/TTS/RVC, long-file/bubble capability, 12-B/C/D and production Host write route.
- Network/HTTP delivery, authentication changes, production configuration/history migration, releases.
