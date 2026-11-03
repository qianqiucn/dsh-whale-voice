# Whale Relay Core · Plan 13-A / OFFLINE

**Status:** `13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-03, 108 revision).
This is the first offline owner of delivery persistence for the ADR-001 unified
`Whale Audio Core → Whale Relay Core → supported target` boundary. It consumes a *persisted* SAVED Audio
Task (or a persisted SAVED Cover MASTER), reads the real Fixture Artifact bytes through the existing
Artifact library under the same scope/rights, and resolves the target from a trusted target directory; it
does **not** trust caller-supplied task records, artifact metadata, hashes, rights booleans or target
booleans. It does **not** import or start the Windows Sender, open a socket, resolve a real chat, record
audio, play media or send to WeChat. The whole Plan13-A, 13-B, 13-C and real Plan14 remain OPEN.

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
  time must be `READABLE` with the same `artifactRef`; the persisted record must carry
  `deliveryRequested: true`. The artifact hash/byte length/duration/format still come from the actual WAV
  bytes returned by the Artifact library, never from caller metadata.
- **Cover owner store (v3):** `coverStatus()` must be `SAVED` with a MASTER whose `artifactRef` is the
  requested one. The frozen Cover record keeps `deliveryRequested:false` forever and is **never edited**.

`readTrustedTaskAuthority` returns a stable `taskIdentityHash` for the exact
`(authority kind, scope, task, artifact, expiry/MASTER hash)` relation. On success the delivery persists a
versioned issuance: `intentId: "intent:<32hex>"` plus
`intent { version: 1, kind, taskIdentityHash, deliveryRequested, authorizedBy, issuedAt }`, where
`authorizedBy` is `PERSISTED_TASK_DELIVERY_INTENT` for an AudioTask record that already carries the
persisted delivery intent, and `RELAY_ISSUED_FOR_FROZEN_COVER` for the frozen Cover record (the persisted
issuance is the versioned authorized handoff for that case).

The store is `unified-relay-v1.json` under the trusted Fixture sandbox. It holds the delivery record, the
`taskId → deliveryId → backendRequestId` mapping, canonical semantic digest (authority kind + task identity
hash + artifact hash + target + proof + expiry, **not** requestKey), artifact hash/bytes/duration/format,
rights proof/expiry, target id/kind, fixed backend, issuance and state.

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
- `ensureDelivery` persists the record before any backend call. `submit` claims the record with an owner
  token, persists `SUBMITTING` (the live token is registered only after that commit really happened, so a
  failed claim never leaves a phantom live owner), then re-reads the artifact/target.
- After `health`/`capabilities`/`resolveTarget` (all awaited), and immediately before the Fake Worker is
  asked to accept, the relay re-reads all three trusted facts again: the authority identity hash, the
  artifact bytes/hash/expiry, and the Core target. A task/artifact/target revoked, deleted or expired during
  the awaited preflight therefore produces zero backend submit.
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

## 5. Test evidence

Three offline files cover the unit (28 tests):

`test/relay-core-offline.test.mjs` (12): real SAVED task + actual Fixture library bytes, stable delivery
id/alias/intent, safe legacy request id, conflict; a caller-supplied record is never an authority; one submit
then `EXISTING`; unknown target + independent Fake Worker gate; artifact deleted between ensure and submit →
no Fake submit; `UNKNOWN` terminal/no resend/fixed backend; requested vs confirmed cancel; capacity without
eviction; concurrent handles → one submit; same-process live owner not recovered; real child-process exit →
`SUBMITTING` recovered as `UNKNOWN` and no replay; one unified component view.

`test/relay-trust-offline.test.mjs` (8, 137-TRUST-01/02): a real persisted AudioTask SAVED record and a real
persisted Cover SAVED MASTER each reach the Fake chain exactly once (with the frozen Cover record still
`deliveryRequested:false`); refusals for no store / non-SAVED / missing persisted intent / source
substitution / wrong scope; artifact deletion and exact-expiry during an awaited preflight → `FAILED` with
`submitted = 0`; the Fake Worker's own directory matrix (empty, unauthorized, unverified identity, closed
bridge/worker, wrong kind, wrong backend binding, mismatched caller id) all reject with `targetChecks > 0`;
a full Core chain with a revoked Worker directory and a handed-over resolver still fails closed; a fully
trusted directory entry still accepts.

`test/relay-persist-offline.test.mjs` (8, 137-PERSIST-01/02): an existing digest can never hijack another
content's request key and the binding stays unchanged; a fresh alias becomes immutable; a normal concurrent
open at the accept boundary does not recover the live submit (no `OWNER_LOST`); stale reclaim never deletes a
live replacement lease; a moved foreign lease is restored; a release restore never overwrites a third live
lease; a failed claim commit leaves no phantom live owner and is retryable; an unproven terminal commit keeps
the owner live as conservative busy rather than silently becoming `UNKNOWN`.

Local: **1099 tests / 1095 pass / 4 platform skips / 0 fail**, UI **72/72**, `client.js` 314,687 chars.
All tests use synthetic WAV bytes in a temporary Fixture library, temporary sandboxes and the Fake backend; no
real audio/network/device/WeChat.

## 6. Not implemented (remains OPEN)

- Real Sender service/Worker/PowerShell/C# execution, UI-automation, window target recheck and device recovery (13-B).
- Real WeChatAgent identity/permission evidence, real target directory, real send/receipt.
- Real installation/upgrade/rollback and unified installer management (Plan14).
- Real model/API/TTS/RVC, long-file/bubble capability, 12-B/C/D and production Host write route.
- Network/HTTP delivery, authentication changes, production configuration/history migration, releases.
