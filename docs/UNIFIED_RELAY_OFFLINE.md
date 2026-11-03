# Whale Relay Core · Plan 13-A / OFFLINE

**Status:** `13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-03).
This is the first offline owner of delivery persistence for the ADR-001 unified
`Whale Audio Core → Whale Relay Core → supported target` boundary. It consumes the existing SAVED Audio
Task record, reads the real Fixture Artifact bytes through the existing Artifact library under the same scope/
rights, and resolves the target from a trusted target directory; it does **not** trust caller-supplied
artifact metadata, hashes, rights booleans or target booleans. It does **not** import or start the Windows
Sender, open a socket, resolve a real chat, record audio, play media or send to WeChat. The whole Plan13-A,
13-B, 13-C and real Plan14 remain OPEN.

Related: ADR-001 (local architecture record, versioned outside this repository), [ADR-024](DECISIONS.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [WHALE_AUDIO_CORE_CONTRACT.md](WHALE_AUDIO_CORE_CONTRACT.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

## 1. Ownership and IDs

| Object | Owner in this unit | Notes |
|---|---|---|
| taskId / saved Artifact / bytes / rights | Whale Audio Core | Relay references them; it never creates a second generation task |
| deliveryId | `core/audio/relay-core-offline.mjs` persistent store | minted once, stable for the same semantic request; conflicts reject |
| backendRequestId / legacy request id | same store, derived from random bytes, `[A-Za-z0-9_-]{8,64}` | never a second global task id, never a colon id, never a truncation collision |
| backend selection | pinned at `ensureDelivery` | submit cannot switch backend or ID |
| target identity/authorization | Core trusted target directory + Fake Worker's own directory | browser/model cannot self-report it |

`ensureDelivery({ handoff })` requires a validated `SAVED` Audio Task record whose `outputArtifactRef`
matches the requested ref, a real `readBytes` of the Fixture library under the supplied scope/rights proof,
and a target id resolved from the relay's trusted target directory. The Artifact hash, byte length, duration
and format are computed from the actual returned WAV bytes; no caller metadata is trusted.

The store is `unified-relay-v1.json` under the trusted Fixture sandbox. It holds the delivery record,
the `taskId → deliveryId → backendRequestId`, canonical semantic digest (task/artifact hash/target/proof/expiry,
**not** requestKey), artifact hash/bytes/duration/format, rights proof/expiry, target id/kind, fixed backend and
state. A same semantic digest returns `EXISTING` with the original delivery id even if `requestKey` changes; a
same `requestKey` with different content/target returns `CONFLICT`; capacity fails closed. Normal handles have no
`reset` API, so tombstones cannot be cleared from the product API.

## 2. Single writer, submit and recovery

- One in-process queue plus a token-owned `unified-relay-v1.lock` (owner token/pid/host) serializes writes;
  a foreign live lock returns `STORE_BUSY`. Release moves the lock to a per-token quarantine and verifies the
  moved token before deleting; a lock replaced by another live lease is restored, not blindly deleted.
- `ensureDelivery` persists the record before any backend call. `submit` claims the record with an owner token,
  persists `SUBMITTING`, does a fresh library read/hash/target recheck, then calls the fixed backend. Concurrent
  handles cannot submit twice; a same-process live owner is not recovered by another normal open.
- A successful Fake acceptance becomes `ACCEPTED` (not `SENT_LOCAL`); duplicate submit returns `EXISTING`.
- A backend throw/unknown after submit becomes `UNKNOWN`; a later submit returns `UNKNOWN_NO_RESEND`.
  No automatic retry, backend switch, id switch or text fallback.
- A real child process that exits while `SUBMITTING` is recovered on reopen as `UNKNOWN`; the parent does not
  treat another live process/token as dead. This is tested with a real child process.
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
- `submit` rechecks `bridgeAllowed && workerAllowed && identityVerified` (two gates), then records only a
  simulated `QUEUED` + fixture receipt. No network, child process, audio device or WeChat API.
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

`test/relay-core-offline.test.mjs` (12 tests):

- real SAVED task + actual Fixture library bytes, stable delivery id/alias, safe legacy request id, conflict;
- one submit then `EXISTING`, no duplicate backend call;
- unknown target / independent Fake Worker gate, forged task/artifact relation;
- artifact deleted between ensure and submit → no Fake submit;
- `UNKNOWN` terminal/no resend/fixed backend and no re-sign across a new requestKey;
- requested vs confirmed cancel;
- capacity without eviction;
- concurrent handles → one submit; same-process live owner not recovered;
- real child-process exit → `SUBMITTING` recovered as `UNKNOWN` and no replay;
- one unified component view with aliases and no second store.

Local: **1082 tests / 1078 pass / 4 platform skips / 0 fail**, UI **69/69**, `client.js` 308,455 chars.
All tests use synthetic WAV bytes in a temporary Fixture library, temporary sandboxes and the Fake backend; no
real audio/network/device/WeChat.

## 6. Not implemented (remains OPEN)

- Real Sender service/Worker/PowerShell/C# execution, UI-automation, window target recheck and device recovery (13-B).
- Real WeChatAgent identity/permission evidence, real target directory, real send/receipt.
- Real installation/upgrade/rollback and unified installer management (Plan14).
- Real model/API/TTS/RVC, long-file/bubble capability, 12-B/C/D and production Host write route.
- Network/HTTP delivery, authentication changes, production configuration/history migration, releases.
