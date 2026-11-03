# Whale Singing · 12-A / APP-OFFLINE

**Status:** `12-A/APP-OFFLINE DONE` / `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-03).
This is a thin application layer over the existing Cover executor and Fixture Artifact library. It does **not**
implement real RVC, TTS, separation, a second Task/Artifact store, Relay/WeChat delivery or a production Host
write route. The whole Plan12-A and parent Plan12 remain OPEN.

**104 update:** R01 now has a real test-only HTTP bridge (`tests/ui/singing-bridge.mjs`) whose browser adapter calls
the actual `openSingingApp`/Cover executor/Fixture library in a temporary sandbox; no fixed task/stage/hash returns.
R02 adds `start()`/slow controlled execution, real status polling and cancel while the long Promise is still
pending, with a task-ref guard for late responses. This is still harness-only and not a production bridge.

**105 update:** R01 closes the delayed-create identity hole. The page uses a monotonic selection generation plus a
per-operation busy token; every create/execute/status/cancel/preview and poll response (success, rejection,
exception and finally) is ignored when its generation is stale or its task id is not the current task. The bridge
keeps an immutable `taskId → {draft, sourceRef, voiceProfileId}` map and executes/previews only from that map, never
from a global `lastDraft`/`lastTaskId`. Selecting B after a delayed A create therefore cannot rebind A or let execute
use A's material; A remains `NO_ATTEMPT` and only B can save a MASTER.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [COVER_TASK_EXECUTION_CONTRACT.md](COVER_TASK_EXECUTION_CONTRACT.md),
[PLAN09_ONBOARDING_UX.md](PLAN09_ONBOARDING_UX.md), [ADR-022](DECISIONS.md), [ADR-023](DECISIONS.md).

## 1. Boundary

| Layer | Responsibility |
|---|---|
| Whale Singing page (`plan09.js`) | Existing Chinese dual-page UI; new FIXTURE/OFFLINE task panel only when a trusted adapter is injected |
| `window.__WHALE_SINGING_APP__` | Explicitly injected fetch adapter; in the UI harness it calls the test-only HTTP bridge to real Core. Absent in production read-only Host => panel shows “未接入”. |
| `core/singing-app-internal.mjs` | Thin coordinator: trusted source/voice catalogs, existing Cover birth/execute/status/cancel/resume, bounded MASTER preview |
| `cover-executor-internal.mjs` | Existing single Task claim, dependency gate, synthetic stages, unique MASTER import and terminal semantics |
| Artifact library | Existing scoped STORED bytes; preview reads only the saved MASTER by scope/ref/rights/expiry |
| RVC gateway / Relay / WeChatAgent | Not called by this unit; no real model, playback or delivery |

The adapter is deliberately not registered in `index.js`. Production Host remains read-only; the UI test harness
injects the adapter explicitly. Browser input supplies only source/voice selection and bounded parameters; rights,
model facts, dependency facts and hashes come from Core/test-owned catalogs.

## 2. Application contract

`openSingingApp({ sandbox, scopeId, sources, voices, dependenciesProvider, now })` returns an app with:

- `list()` — public source/voice labels, `fixtureOnly:true`, `realReady:false`; no proof refs or secrets.
- `create(draft)` — resolves a trusted source and voice; builds the canonical intent draft; calls
  `createCoverTask` once. The idempotency key is derived from source + voice. Same parameters return `EXISTING`;
  changed parameters on that key return a parameter conflict.
- `run(draft)` — reuses an existing task/status; only a `NO_ATTEMPT` task proceeds to dependency verification and
  `executeCover`. `CLAIMED`, `SAVED`, `CANCELLED`, `FAILED` and `UNKNOWN` are returned as status, never silently
  re-executed.
- `start(draft)` — starts the same `run` without holding the long Promise; returns after the task reaches a
  non-`NO_ATTEMPT` state. Repeated starts for one task are ignored. `waitFor(taskId)` exposes the test-only wait.
  The bridge stores the immutable draft/source/voice per task id and executes/previews only that record; it rejects
  a missing or mismatched task id instead of falling back to a global last draft.
- `status(taskId)` — Chinese stage/status projection.
- `cancel(taskId)` — existing `requestCoverCancel` with the actual `attemptId`; `ACCEPTED` is not “stopped”.
- `preview({taskId,draft})` — only a `SAVED` MASTER is read, through the Artifact library with the same scope,
  ref, rights and expiry; bounded bytes only.
- `resume({taskId,attemptId,requestKey})` — existing `resumeCoverFinal` identity/receipt path; no new task.

The accepted draft fields are `sourceRef`, `voiceProfileId`, `sourceLayout`, `mixMode`, `pitchShift`,
`vocalGainDb`, `instrumentalGainDb`. `CLEAN_VOCAL` is accepted only with `VOCAL_ONLY`; `MIXED` uses the
Fixture two-stem preset. No arbitrary paths, URLs, rights, ready flags or hashes are accepted from the browser.

`openSingingApp` also accepts a test/harness-only `stageDelayMs` (0–2000, default 0), passed to `executeCover` as
a bounded pause before the next stage. It is not a production feature; the default is zero and cancellation is
checked through the existing fence after every pause. A canceled run reaches `CANCELLED` with no MASTER.

## 3. UI

The Singing page gets a new card, only when `window.__WHALE_SINGING_APP__` exists:

- **可信演示素材 / 可信演示声线** selects filled from `list()`.
- **创建演示任务** → existing Cover Task birth (one idempotency key).
- **执行/重连** → status/execute; repeated clicks cannot create a second task.
- **刷新阶段**, **取消任务**, **读取受限预览**. Status/cancel remain enabled while the task is `CLAIMED`; the
  page polls the real status every 300 ms and can cancel the same task while the long Promise is pending.
- A selection generation plus per-operation busy token covers create/execute/status/cancel/preview and auto-poll
  success, rejection, exception and finally. A late A response after selecting B cannot rebind task A, overwrite
  B's stage/preview/error/busy state, or let execute use A's material. A->B->A ABA switches also get a new
  generation. A task ref/generation guard additionally ignores late results from a task the user has switched away
  from; a switched task cannot overwrite the current task id or MASTER summary.
- Stage labels map the real checkpoints (分离/转换/混音/校验) to Chinese and display `SAVED ≠ SENT`.
- No audio element, device playback, real import or send button is added.

The FIXTURE/OFFLINE card explicitly says `realReady=false`. Without the adapter the card is a read-only
“未接入唱歌应用适配器” notice; the existing draft and dependency wizard remain available.

### 3.1 Real Fixture bridge (test-only)

`tests/ui/singing-bridge.mjs` owns a temporary `createConfigSandbox`, imports two synthetic WAV sources into the
real Fixture Artifact library, opens `openSingingApp` with a trusted voice catalog and the test-only
`coverDependencies` provider, and exposes `/singing-app/*` to the browser adapter. It calls the real
`create`/`start`/`status`/`cancel`/`preview` methods, has a real `stageDelayMs` for cancel testing, and exposes
metrics from actual status (`masterCount`, MASTER hash/length, preview bytes/hash, per-task state/source). The bridge
keeps a per-task immutable intent map and supports test-only hold/release/fail-next-create controls for late-response
regressions. The browser adapter only fetches these endpoints; it does not synthesize fixed task ids, stages or
hashes. The bridge is imported only by `tests/ui/run.mjs`, never by `index.js` or the production Host.

## 4. Test evidence

- `test/singing-app.test.mjs` (7 tests): trusted list/no proof leak; MIXED run → one MASTER + bounded preview;
  CLEAN_VOCAL run; controlled slow run status/cancel → `CANCELLED` with no MASTER; changed parameters conflict;
  missing dependencies/unknown source/voice; rejected rights.
- UI harness: **69/69**, including real bridge create → execute → SAVED → preview (MASTER bytes/hash from the
  Core library), confirmed cancel during a slow run with zero MASTER, a delayed A create/rejection that cannot
  rebind after selecting B (B saves, A stays `NO_ATTEMPT`), a switched-task late-response guard and a
  missing-adapter fail-closed check.
- Full `node --test`: **1070 tests / 1066 pass / 4 platform skips / 0 fail**.
- `node build.mjs`: `client.js` 308,426 chars regenerated; syntax check passes.
- All tests use temporary Fixture sandboxes, synthetic WAVs and the isolated UI harness; no real audio,
  device playback, network, private files, WeChat or paid service.

## 5. Not implemented / remained OPEN

- Real RVC/SVC models, licensed song material, UVR/MSST separation, quality/CPU-GPU/long-audio/recovery.
- Original 12-A's 13-A Fake Delivery dependency and `RVC_SVC_COVER_INTEGRATION_BLUEPRINT` real gateway.
- 12-B legal search/DeepSeek Tools, 12-C real send, 12-D Seed-VC.
- Production Host route/bridge, real file import/playback, WeChat/Relay delivery, authentication changes.
  The HTTP bridge in this unit is test-only and deliberately not registered by `index.js`.
- Plan10/Plan11 real model/API DoD; Plan13 pre-dispatch full ADR-001 and unified whale delivery/Sender expansion.

`SAVED` is a Fixture Artifact save only; it is never `SENT`, never a real cover, and never a rights proof.
