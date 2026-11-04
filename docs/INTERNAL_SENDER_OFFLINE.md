# Internal Windows Sender · Plan 13-B / OFFLINE

**Status:** `13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-04, 144 revision).
This is the Whale Relay Core's own internal Windows delivery module, packaged as an offline unit. It
consumes only a trusted SAVED Artifact fact plus a trusted target and exposes exactly the backend
interface the relay already owns. It does **not** run the original PowerShell/C# sender, does not
spawn a process, does not open a socket, device or WeChat window and never writes. The whole Plan13-B
and the real Plan12/13 DoD remain OPEN.

Related: ADR-001, ADR-024–ADR-031 ([DECISIONS.md](DECISIONS.md)),
[UNIFIED_RELAY_OFFLINE.md](UNIFIED_RELAY_OFFLINE.md), [WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

## 1. Source closure and provenance

The package carries the reviewed static source closure of the original user-owned Voice Sender
(Service 0.1.0) as **resources** under `core/audio/sender-internal/source/`:

- 26 source files (202,655 source bytes) plus `service/package.json` and `service/README.md`;
- the local preflight manifest (`13b-source-preflight.json`, 15,572 B, SHA256
  `a3056dea8965a85a880b0fe5c9a0752e86ce8ab94947ccb3ba77a4f07a595bf4`) lists each relative path, byte
  count, SHA256 and the user-confirmed reuse basis;
- `core/audio/sender-internal/source-manifest.json` records the same relative paths, the original
  source hash and the stored (LF-normalised) hash for every file. It never records a developer
  absolute path, token, chat, binary, model, audio, cache, runtime state or production config;
- no file in the closure imports a non-Node package; the original HTTP server is carried as a
  resource only and is never imported by the module.

The user confirmed the public reuse right for this own source. No third-party license is inferred:
the source has no explicit copyright/license marker, and that fact is recorded rather than guessed.

## 2. Layers and the reviewed Worker ABI (144-ABI / 144-CANCEL)

| Layer | Offline unit |
|---|---|
| Relay target/allowlist/identity gate | the module's own target directory + the Bridge/Worker two gates |
| Fixed script + fixed argv | `INTERNAL_WORKER_ABI` + `buildInternalInvocation()`; no arbitrary path/URL/command |
| Request / cancel protocol | `buildSendRequest()` (real request JSON) + the per-job cancel-file signal |
| Queue / claim / cancel / recovery | one serial in-memory queue, one invocation per delivery |
| Process execution | injected Fixture transport (never a real child process) |
| NEVER_WRITE / UNKNOWN no-resend | preserved; no retry, re-bind or text fallback |

`INTERNAL_WORKER_ABI` is a version-bound descriptor of the **actual** archived worker:

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File voice-sender.ps1
    -Request <request.json> -JsonOut <result.json>
    -ProgressFile <progress> -CancelFile <cancel.json> -GlobalCancelFile <global-cancel>
```

- `voice-sender.ps1` declares exactly `Request`, `JsonOut`, `ProgressFile`, `CancelFile`,
  `GlobalCancelFile` (both request/result files mandatory); the launcher matches the reviewed
  `service/src/sender.mjs` argument vector;
- the request JSON carries exactly the fields the worker reads: `wav`, `chat`,
  `voice_pre_silence_ms`, `voice_post_silence_ms`, `target{kind,identityVerified}`, `automation`,
  `cancel_file`, `global_cancel_file`, `cancel_after`, `voice_allowed_chats`;
- **cancellation is not a script.** The reviewed protocol is the per-job cancel *file* the running
  worker polls (`Get-CancelOutcome`); the unit writes that signal and can never mark a delivery
  cancelled on its own;
- `voice-sender-recover.ps1` (`-Status`, `-JsonOut`), `wechat-status.ps1` (`-ExpectedProcessPath`),
  `hotkey-host.ps1` and `desktop-guard.ps1` are described by the same table. The previously invented
  `cancel-test.ps1` / `preflight-wechat.ps1` ids do not exist and are refused (`SCRIPT_NOT_ALLOWED`).

`verifyWorkerAbi()` re-derives every parameter table from the archived `param()` blocks, every request
field from the worker's own reads, and every argv token from the reviewed service, and reports the
mismatches. A drift between the descriptor and the source is therefore detected statically instead of
being "accepted" by a Fixture. The internal temp handles (`run/svc-<delivery token>.{request.json,
result.json,progress,cancel.json,wav}`) are generated only by the trusted owner inside one bounded run
root; the caller cannot supply them.

## 3. One execution and fact binding (144-ONCE / 144-BINDING)

`createInternalSenderOffline({ targets, transport, runRoot?, now?, silence? })` returns the relay
backend (`id`, `health`, `capabilities`, `resolveTarget`, `submit`, `status`, `cancel`, `recover`,
`stats`, `abi`).

`submit({ delivery, artifact, target })`:

1. refuses any delivery/artifact field that looks like a path, URL, command, script, shell, env,
   token or secret (Artifact-only boundary);
2. requires the delivery artifact ref/hash/bytes/duration (when present) to equal the trusted Artifact
   fact — a delivery record can never consume another artifact;
3. resolves the persisted target id/kind from its own directory and rechecks
   `identityVerified`/`authorized`/`allowlisted`/`bridgeAllowed`/`workerAllowed` (no upstream boolean
   grants anything);
4. takes one immutable, deeply frozen fact snapshot, then claims the delivery id **synchronously**
   (validation, claim, conflict check and the post-queue re-check live in one trusted boundary):
   - the same id + the same facts reuse the one in-flight promise or the settled result (`existing`);
   - the same id + different facts are refused with `DELIVERY_CONFLICT` and zero invocation;
   - a second queued copy of an already-`UNKNOWN` delivery can never invoke again.

One delivery therefore has exactly one worker invocation; mutating the caller's objects while the job
is queued cannot change the consumed artifact/target/backend.

**Terminal monotonicity and the execution slot (145-ASYNC-TERMINAL / QUEUED-OBSERVE / PENDING-SERIAL).**
The terminal verdict is write-once and every async exit re-checks it:

- a `query()` observation that settles the claim while `transport.invoke` is still awaiting stays
  final — a late `{dispatchOnly:true}` acknowledgement cannot reopen it into `ACCEPTED`, and a late
  `SENT_LOCAL`/`CANCELLED`/`UNKNOWN` can never rewrite the state, the cancel flags or the receipt;
- observation is bound to the one actual invocation: a delivery that is still queued (no invocation
  yet) never consumes a pre-existing worker result, and its `status` stays `QUEUED`;
- the single execution slot covers the **whole Worker holding period**: a dispatch-only claim keeps
  the slot until its terminal observation arrives, so no second delivery is invoked meanwhile. Only a
  terminal worker result (or a pre-UI cancel) releases the slot; `UNKNOWN` is such a terminal result,
  not an assumption that the device is free. There is still no second business queue or id owner.

## 4. Results, cancel and recovery (144-RESULT / 145-RESULT-BAD-EVIDENCE)

Worker results are classified with the same conservative rules as the reviewed service. A recognized
status name alone is never trusted: malformed or contradictory key evidence is `UNKNOWN`.

| Worker result | Internal layer |
|---|---|
| `SENT_LOCAL` / `ok:true` | `ACCEPTED` (+ receipt, `sentLocal`) |
| `CANCELLED` with `CANCELLED_BEFORE_UI`/`CANCELLED_CONFIRMED`, no bubble leak | `CANCELLED` with `cancelStage` |
| `CANCELLED` with `cancel_stage:'UNKNOWN'`, unrecognized/bad stage, bad `cancel_bubble_appeared`, bubble leak, `cancel_unconfirmed`/`UNKNOWN_AFTER_SEND`, bad `reason`/`timeline` | `UNKNOWN` (never "cancelled") |
| `REJECTED` with no UI evidence | `preSubmit` failure |
| `REJECTED` carrying `RECORDING`/`SENDING`/release evidence | `UNKNOWN` |
| `FAILED` before the UI (well-formed phases/timeline) | `preSubmit` failure |
| `FAILED` after `RECORDING`/`SENDING`, or with non-array/bad-entry `phases`/`timeline` | `UNKNOWN` |
| missing / empty / no usable status / thrown | `UNKNOWN` + `recoveryRequired`, terminal |

Only a provable pre-execution refusal is `preSubmit`; a missing, empty, corrupt, contradictory or
thrown result is *indeterminate*, never "provably not sent". `UNKNOWN` is terminal: a later submit
returns `UNKNOWN_NO_RESEND` and the receipt/accepted fact are preserved.

Cancellation is three explicit facts, never one flag:

- **requested** — the trusted cancel signal is written to the job's real `CancelFile` (payload
  `{reason:"USER_CANCELLED", at, source}`); the worker alone owns the safe Backspace/RAltUp/device
  restore sequence;
- **confirmed** — the worker's own observed `CANCELLED` result, with `CANCELLED_BEFORE_UI` (no
  recording was active) or `CANCELLED_CONFIRMED` (recording rolled back, no new bubble);
- **unconfirmed** — the worker cannot prove the rollback (`cancel_unconfirmed`, bubble appeared, or
  an unreadable signal): the delivery becomes `UNKNOWN`, the earlier `ACCEPTED` fact and receipt stay,
  and it is never resent.

A cancel that arrives while the job is still queued is a pre-UI cancellation (no worker call), exactly
like the reviewed queue. A cancel after a terminal result is `CANCEL_TOO_LATE`. A signal that cannot be
delivered is reported as requested-but-not-confirmed, never as stopped.

`recover({action:"status"|"restore"})` returns the real `voice-sender-recover.ps1` ABI descriptor
(`executed:false`, `realReady:false`); the device snapshot/restore itself is not executed offline.

## 5. Generation decoupling and the legacy text facade (144-LEGACY)

This unit owns delivery only and never synthesizes audio. Text-to-speech remains a Whale Audio Core
generation step whose SAVED Artifact is the only input.

`core/audio/legacy-text-delivery-offline.mjs` is the callable offline compatibility entry for the old
text-based callers:

```
legacy text request
  -> the same generation owner (openFixtureTaskOwner().save, AudioTask v2)
  -> the same persisted SAVED Artifact
  -> the same persistent Whale Relay entry (ensureDelivery)
  -> the same relay queue/backend (submit)
```

The request identity is derived deterministically from `(scope, legacyRequestId)` (**145-LEGACY-ID**):
the text and target are validated facts of that same request, not new identities. A replayed request
returns `EXISTING` from the existing catalog/owner/relay and can never generate, save or send twice; a
`FAILED`, `CANCELLED` or `UNKNOWN` delivery is never regenerated or resent; a changed **text** reuses
the original Task/Artifact/delivery result (no second invocation); a changed **target** is refused by
the relay's immutable request-key binding (`RELAY_CORE_CONFLICT`, no new task/artifact/delivery). The
facade keeps no cache, queue, timer or generation registry of its own, never calls the fixture producer
or a provider directly, and never invents a second artifact entry (the relay's new-Artifact path stays
zero-synthesis). The bytes are Fixture bytes; real text-to-speech synthesis remains OPEN.

## 6. Tests

`test/internal-sender-offline.test.mjs` (16 tests) — source/manifest provenance and the read-only
facade boundary (no write/spawn/socket import), the re-derived Worker ABI, the exact
request/argv/cancel-protocol mapping, the Artifact-only and closed-gate refusals, single execution
(concurrent/duplicate/after-UNKNOWN), fact binding (artifact/target conflict, frozen queued facts),
result layering (missing/empty/broken/thrown vs pre-UI refusal vs post-UI failure), the full
request→confirm/unconfirmed cancel protocol (queued/running/signal failure/too-late), the static
recovery descriptor, the Voice + permitted Singing relay chains (exactly one invocation), and the 145
close-outs: a verdict observed while `invoke` is awaiting is final, a settled verdict is never
rewritten by concurrent/late observations, a never-invoked queued delivery cannot consume a worker
result, the execution slot covers the whole Worker holding period, and malformed/contradictory
evidence is `UNKNOWN` while a well-formed pre-UI refusal stays `preSubmit`.

`test/legacy-text-delivery-offline.test.mjs` (8 tests) — one generation/save/delivery/invocation per
legacy request, replay `EXISTING` everywhere, UNKNOWN never regenerated or resent, cancelled delivery
kept but never resent, invalid text refused before any generation, a static thin-chain check, and the
145-LEGACY-ID cases: a changed text reuses the original result without a second invocation, a changed
target is refused by the immutable relay binding (no new task/artifact/delivery), and a changed text
never bypasses an accepted delivery.

All tests use synthetic WAV bytes in a temporary Fixture sandbox and the injected Fixture transport; no
real audio/network/device/WeChat/process.

## 7. Not implemented (remains OPEN)

- Real PowerShell/C# execution, window activation, UIA target verification, recording/playback and
  device recovery (real 13-B runtime); the archived closure is not materialised into a runnable root.
- Real text-to-speech synthesis for the legacy text path (the facade proves the chain only).
- Real WeChatAgent identity/permission evidence and real send/receipt.
- Installer/upgrade/rollback and unified install management (Plan14; deferred).
- Real TTS/RVC generation changes, real model/API/device/WeChat, production Host write or history
  migration.
