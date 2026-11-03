# Internal Windows Sender · Plan 13-B / OFFLINE

**Status:** `13-B/OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-04).
This is the Whale Relay Core's own internal Windows delivery module, packaged as an offline unit. It
consumes only a trusted SAVED Artifact fact plus a trusted target and exposes exactly the backend
interface the relay already owns. It does **not** run the original PowerShell/C# sender, does not
spawn a process, does not open a socket, device or WeChat window and never writes. The whole Plan13-B
and the real Plan12/13 DoD remain OPEN.

Related: ADR-001, ADR-024–ADR-029 ([DECISIONS.md](DECISIONS.md)),
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

## 2. Layers

| Layer | Offline unit |
|---|---|
| Relay target/allowlist/identity gate | the module's own target directory + two gates |
| Fixed script + fixed argv | `buildInternalInvocation()` whitelist; no arbitrary path/URL/command |
| Queue / claim / cancel / recovery | one serial in-memory queue, one invocation per delivery |
| Process execution | injected Fixture transport (never a real child process) |
| NEVER_WRITE / UNKNOWN no-resend | preserved; no retry, re-bind or text fallback |

`createInternalSenderOffline({ targets, transport })` returns the relay backend (`id`, `health`,
`capabilities`, `resolveTarget`, `submit`, `status`, `cancel`, `stats`) with `mode: "FIXTURE"`,
`realReady: false`, `realOperationAllowed: false`.

`submit({ delivery, artifact, target })`:

1. refuses any delivery/artifact field that looks like a path, URL, command, script, shell, env,
   token or secret (Artifact-only boundary);
2. resolves the persisted delivery target id/kind from its own directory and rechecks
   `identityVerified`, `authorized`, `allowlisted`, `bridgeAllowed`, `workerAllowed` (no upstream
   boolean grants anything);
3. validates the trusted artifact fact (WAV, ≤8 MiB, ≤15 min) and builds the fixed invocation
   (`voice-sender.ps1 -deliveryId … -artifactSha256 … -targetKind …`, `shell:false`);
4. serializes through one queue, invokes the Fixture transport exactly once per delivery, maps the
   result to `ACCEPTED` / `CANCELLED` / `FAILED` / `UNKNOWN`, and never retries or re-binds.

`createFixtureTransport()` records the exact fixed invocation and returns scripted results; a
transport exception maps to `UNKNOWN` (terminal, never resent).

## 3. Generation decoupling and legacy entry

This unit owns delivery only. It never synthesizes audio: text-to-speech remains a Whale Audio Core
generation step whose SAVED Artifact is the only input; the legacy text facade keeps calling the same
generation owner and the same SAVED Artifact, then the one relay queue. There is no second generation
registry, no dual synthesis, no cache double-write and no second retry path in the relay. The original
Sender installation/callers are neither changed nor retired, and no production history is migrated.

## 4. Safety semantics retained

- final target recheck, two gates, allowlist intersection and NEVER_WRITE;
- `UNKNOWN` is terminal: no automatic resend, backend switch, id change or text fallback;
- cancel is explicit and confirmed (`CANCELLED`), and an accepted result is never overwritten by a
  late/unknown one;
- emergency stop/device recovery source is kept as a reviewed resource; this offline unit does not
  execute it, and the real window/device path remains UNKNOWN.

## 5. Tests

`test/internal-sender-offline.test.mjs` (7 tests, all synthetic fixtures):

- 26 + 2 source files match the manifest's stored hashes; no machine path or credential-shaped
  value; no bare non-Node import; the facade never imports the original HTTP server or
  `child_process`/`http`/`net`;
- fixed invocation whitelist (script ids, parameter keys, bounded single-line scalars, contained
  paths; unknown script/key refused);
- Artifact-only refusal of path/URL/command smuggling and the internal target gate matrix;
- one serial queue, one invocation per delivery, duplicate returns the settled result without a
  second invocation;
- cancel/UNKNOWN mapping and no resend;
- end-to-end: a real persisted Voice SAVED task and a real persisted Singing Cover MASTER (with its
  explicit permit) each reach this internal backend through the relay exactly once (`ACCEPTED`).

## 6. Not implemented (remains OPEN)

- Real PowerShell/C# execution, window activation, UIA target verification, recording/playback and
  device recovery (real 13-B runtime).
- Real WeChatAgent identity/permission evidence and real send/receipt.
- Installer/upgrade/rollback and unified install management (Plan14; deferred).
- Real TTS/RVC generation changes, real model/API/device/WeChat, production Host write or history
  migration.
