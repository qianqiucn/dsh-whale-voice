# Whale Relay Core · Plan 13-A / OFFLINE

**Status:** `13-A/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-03).
This is the first offline owner of delivery persistence for the ADR-001 unified
`Whale Audio Core → Whale Relay Core → supported target` boundary. It consumes a trusted, already SAVED
Fixture Artifact and a trusted target descriptor; it does **not** import or start the Windows Sender,
open a socket, resolve a real chat, record audio, play media or send to WeChat. The whole Plan13-A,
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
| target identity/authorization | trusted target descriptor + Fake backend recheck | browser/model cannot self-report it |

The store is `unified-relay-v1.json` under the trusted Fixture sandbox. It holds the delivery record,
the `taskId → deliveryId → backendRequestId`, canonical request digest, artifact hash/bytes/duration/format,
rights expiry, target id/kind, fixed backend and state. A same digest returns `EXISTING` with the original
delivery id; a same `requestKey` with different content/target returns `CONFLICT`; capacity fails closed.

## 2. Single writer, submit and recovery

- One in-process queue plus a token-owned `unified-relay-v1.lock` (owner token/pid/host) serializes writes;
  a foreign live lock returns `STORE_BUSY`, release only removes its own token.
- `ensureDelivery` persists the record before any backend call. `submit` claims the record with an owner token,
  persists `SUBMITTING`, then calls the fixed backend. Concurrent handles cannot submit twice.
- A successful Fake acceptance becomes `ACCEPTED` (not `SENT_LOCAL`); duplicate submit returns `EXISTING`.
- A backend throw/unknown after submit becomes `UNKNOWN`; a later submit returns `UNKNOWN_NO_RESEND`.
  No automatic retry, backend switch, id switch or text fallback.
- A real child process that exits while `SUBMITTING` is recovered on reopen as `UNKNOWN`; the child's
  `LIVE_OWNERS`/PID evidence prevents treating a live owner as dead. This is tested with a real child process.
- Cancellation is two-step: `cancel` sets `CANCEL_REQUESTED`; only `confirmCancel` becomes `CANCELLED`.
  `ACCEPTED`/requested is not displayed as stopped. `ACCEPTED`, `UNKNOWN` and `CANCELLED` are terminal for replay.
- Capacity is bounded; old/tombstone delivery records are never evicted or resurrected by reopening.

## 3. Fake backend gates

`createFakeDeliveryBackend({ targets, capabilities, failMode, bridgeAllowed, workerAllowed })` is the only backend.

- capabilities: WAV, ≤ 8 MiB, ≤ 15 min, `VOICE`; long/unrepresentable formats return `UNSUPPORTED_CAPABILITY`.
- `health` is a Fixture health, never a real WeChat/Sender proof.
- `resolveTarget` rechecks target existence, authorization, allowlist and verified identity.
- `submit` rechecks the same target, `bridgeAllowed && workerAllowed && identityVerified` (two gates),
  then records only a simulated `QUEUED` + fixture receipt. No network, child process, audio device or WeChat API.
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

`test/relay-core-offline.test.mjs` (9 tests):

- persistent/stable delivery id, mapping to a safe legacy request id, content conflict;
- one submit then `EXISTING`, no duplicate backend call;
- target/rights/capability failure before acceptance;
- `UNKNOWN` terminal/no resend/fixed backend;
- requested vs confirmed cancel;
- capacity without eviction;
- concurrent handles → one submit;
- real child-process exit → `SUBMITTING` recovered as `UNKNOWN` and no replay;
- one unified component view with aliases and no second store.

Local: **1079 tests / 1075 pass / 4 platform skips / 0 fail**, UI **69/69**, `client.js` 308,455 chars.
All tests use synthetic WAV metadata, temporary sandboxes and the Fake backend; no real audio/network/device/WeChat.

## 6. Not implemented (remains OPEN)

- Real Sender service/Worker/PowerShell/C# execution, UI-automation, window target recheck and device recovery (13-B).
- Real WeChatAgent identity/permission evidence, real target directory, real send/receipt.
- Real installation/upgrade/rollback and unified installer management (Plan14).
- Real model/API/TTS/RVC, long-file/bubble capability, 12-B/C/D and production Host write route.
- Network/HTTP delivery, authentication changes, production configuration/history migration, releases.
