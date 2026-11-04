# voice-sender service (loopback only)

A thin Node service in front of the already-verified PowerShell/C# sender. It does **not**
reimplement audio playback, recording control or device switching —it calls `../voice-sender.ps1`.

```
POST /v1/messages
   →validate (allow-list, trusted target table, no paths, no shell)
   →serial queue (one WeChat UI job at a time)
   →TTS provider (default: local Qwen3-TTS + fixed whale-v1 clone)
   →existing sender  (right-Alt push-to-talk, 1000ms pre/post silence, Backspace cancel)
   →durable state (SENT_LOCAL / FAILED / UNKNOWN / CANCELLED)
```

## Layout

```
service/
  package.json            node >= 22, ESM, no runtime deps
  service.config.json     ports, limits, TTS provider config, sender mode
  targets.json            trustedTargetId →WeChat UI name
  src/util.mjs            atomic json, logging, path guards
  src/validate.mjs        request validation + target resolution + emotion enum
  src/store.mjs           durable job store (atomic writes, 200 job cap)
  src/emotion.mjs         neutral/gentle/happy/shy/playful/sad (accepted, not yet applied)
  src/wav.mjs             strict PCM-16 mono WAV validation (duration/peak/clipping)
  src/tts.mjs             provider facade (qwen-local default, deepseek-web legacy)
  src/providers/qwen-local.mjs   local Qwen HTTP + WAV validation + atomic cache
  src/providers/deepseek-web.mjs old dsh-ds-tts adapter (rollback only)
  src/sender.mjs          spawns the PowerShell worker with an argv array
  src/queue.mjs           serial queue, dedupe, boot recovery, cancel
  src/hotkey.mjs          separate RegisterHotKey host lifecycle + signal watcher
  src/wechat.mjs          read-only UIA window/probe adapter
  src/server.mjs          HTTP + bearer auth + loopback guard
  scripts/qwen-smoke.mjs  manual one-shot local Qwen synth (never touches WeChat)
  ../hotkey-host.ps1      WM_HOTKEY message loop (Ctrl+Shift+F12 default)
  ../wechat-status.ps1    read-only window discovery/foreground facts
  ../lib/CancelPolicy.ps1 pure cancellation outcome policy
  ../lib/FocusPolicy.ps1  pure focus/fullscreen/auto policy (IdleMs is diagnostic only)
  test/*.test.mjs         115 offline unit tests
  runtime/                token, state, logs, service.json, hotkey.json, tts-cache
```

## V2 automation and emergency stop

- `automation.mode` defaults to `manual`; `auto` is opt-in.
- `auto` requires a verified WeChat main window (process path + class + UIA chat elements),
  bounded activation, target re-verification before recording, and optional full-screen pause.
- `Ctrl+Shift+F12` is registered by a separate `hotkey-host.ps1` process using
  `RegisterHotKey` + `WM_HOTKEY`. The host writes an atomic signal file even if the Node service
  is busy; the service latches the stop, cancels queued/pre-UI jobs, and writes a per-job cancel
  file for an active worker. No new task is accepted until `POST /v1/emergency-stop/reset`.
- The worker checks per-job and global signals before devices, before recording, and throughout
  pre-silence/playback/post-silence. It uses Backspace before RAltUp for the verified cancel path,
  aborts playback, restores capture defaults, and reports `CANCELLED_BEFORE_UI`,
  `CANCELLED_CONFIRMED`, or `UNKNOWN` conservatively. After release it never claims a rollback.
- Private targets are still bound to the trusted target table + exact UI title + unique session
  item. Group auto-open remains fail-closed because this client exposes no stable group id.


## Run

```powershell
# real mode (needs the WeChat window and the local Qwen service on 127.0.0.1:8765)
node src/server.mjs

# simulation mode (no TTS call, no WeChat interaction)
$env:VOICE_SERVICE_FAKE='1'; node src/server.mjs
```

`runtime/service.json` records `{pid, host, port, startedAt}`; `runtime/service.token` holds the
bearer token (generated on first start). Stop with `POST /v1/shutdown` or Ctrl+C.

## Endpoints (all require `Authorization: Bearer <token>` and a loopback socket)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | mode, queue, TTS base/voice, automation, hotkey, emergency state, targets |
| POST | `/v1/messages` | `{requestId, trustedSessionId, trustedTargetId, text, voice?, emotion?}` →202 |
| GET | `/v1/messages` | last 50 jobs |
| GET | `/v1/messages/:id` | one job (state, timeline, cancelStage, media, result, warnings) |
| POST | `/v1/messages/:id/cancel` | queued/pre-UI cancel; active worker gets a cancel-file request |
| POST | `/v1/emergency-stop` | same controlled path as the hotkey; latches until reset |
| POST | `/v1/emergency-stop/reset` | clears the latch only when no task is active |
| GET | `/v1/automation/status` | read-only window/foreground/target/recording/hotkey state |
| GET | `/v1/automation/config` | current mode, flags, hotkey registration |
| PUT | `/v1/automation/config` | update mode/flags/hotkey (persisted; hotkey re-registered when changed) |
| POST | `/v1/maintenance/restore-devices` | runs `voice-sender-recover.ps1` |
| POST | `/v1/shutdown` | cancel queued jobs, stop hotkey host, then exit |

## States

`QUEUED →SYNTHESIZING →READY →WAITING_FOR_UI →SENT_LOCAL | FAILED | UNKNOWN | CANCELLED`

- `SENT_LOCAL` means the WeChat **client** shows a new native bubble. It is not proof of delivery.
- A job that was `WAITING_FOR_UI`/`SENDING`/`RECORDING` when the service died becomes `UNKNOWN`
  on the next boot and is never re-run.
- `QUEUED` on boot is cancelled (never auto-resumed).

## Security invariants

1. binds `127.0.0.1` only; non-loopback sockets are rejected;
2. bearer token from a file (32 random bytes hex), compared with `timingSafeEqual`;
3. request bodies are allow-listed field by field —a `wav`, `path`, `script` or `chat` key is a 400;
4. the WeChat chat comes from `targets.json`, never from the request or model output;
5. two enabled targets sharing one UI name →`ambiguous_target` (refuse, never guess);
6. the wav path is derived from the TTS cache key, re-checked to be inside the cache dir, and the
   bytes must pass RIFF/PCM-16/mono/duration/peak checks before the worker sees them;
7. the child process is started with an argv array (`powershell -File ... -Request <json>`), no shell,
   no interpolation of request text into a command line;
8. a send timeout or a service restart never re-runs TTS and never re-sends a message.

## Config knobs (`service.config.json`)

| key | default | meaning |
|---|---|---|
| `port` | 43371 | loopback port |
| `maxTextChars` | 300 | text cap for one utterance |
| `maxQueue` | 8 | queued/active job cap |
| `jobTimeoutMs` | 240000 | per-job budget |
| `allowedVoices` | `["whale-v1"]` | voice allow-list |
| `tts.provider` | `qwen-local` | `qwen-local` or `deepseek-web`; no auto fallback |
| `tts.baseUrl` | `http://127.0.0.1:8765` | local Qwen API (loopback only) |
| `tts.voiceId` | `whale-v1` | fixed clone voice |
| `tts.tokenFile` | `...\api-token.txt` | Qwen bearer token (never logged) |
| `tts.maxDurationSec` | 45 | hard cap; worker's 50s record budget still applies |
| `tts.referenceSha256` | —| refuses to run if whale-v1 reference changed |
| `sender.mode` | `real` | `fake` for simulations |
| `sender.preSilenceMs` / `postSilenceMs` | 1000 / 1000 | passed to the worker per request |

## Tests

```powershell
node --test        # 115 tests, offline, no WeChat, no TTS
```

Covers: field allow-list (path smuggling), request id shape, text limits, voice/emotion allow-list,
unknown/disabled/ambiguous targets, serial ordering, request dedupe, boot recovery
(in-flight→UNKNOWN, queued→CANCELLED), queued cancel, in-flight cancel request, shutdown cancel,
TTS failure not reaching the UI, Qwen HTTP/status/Content-Type/WAV validation (headers, PCM,
duration, size, silence, clipping), cache hits, token/reference fail-closed, malformed audio id.

## One-shot test sessions

A real end-to-end test can add this to `state/voice-settings.json` while enabled:

```json
"test_session": { "id": "e2e-20261024-xxxx", "max_tasks": 1 }
```

The first voice enqueue writes `state/voice-test-session.json` with `used: 1` and `locked: true`.
Every later voice request is rejected with `test_session_exhausted` —including after a failed
job. A new authorization must use a new `id`. Production voice settings **omit** `test_session`,
so normal multi-message voice behavior is unchanged.

## Focus policy

`lib/FocusPolicy.ps1` is a pure PowerShell function. **IdleMs is diagnostic only and never a
rejection condition.** Foreground ownership is still required before recording; `auto` mode may
perform bounded activation (`Activate-WeChatWindow`) and then re-verify the HWND. Full-screen
foreground windows pause auto activation by default. Genuine target/window changes still cancel.

## Known limits

- Private target identity is bound to the trusted target table + exact UIA title + a unique
  `session_item_<name>` element. There is no stable wxid exposed by this client; collisions are
  refused, not fuzzy-matched.
- Group auto-open is deliberately fail-closed: the UIA tree does not provide a stable real group
  id, so `identityVerified` alone is not accepted as UI proof.
- Desktop interactivity is probed (`desktop-guard.ps1`) before the sender starts; a locked or
  disconnected session fails closed.
- The local Qwen API has no server-side generation timeout and reports CUDA OOM as a generic
  HTTP 500. The Node adapter treats both as a pre-UI `FAILED` (safe text fallback).
