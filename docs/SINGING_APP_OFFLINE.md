# Whale Singing · 12-A / APP-OFFLINE

**Status:** `12-A/APP-OFFLINE DONE` / `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-03).
This is a thin application layer over the existing Cover executor and Fixture Artifact library. It does **not**
implement real RVC, TTS, separation, a second Task/Artifact store, Relay/WeChat delivery or a production Host
write route. The whole Plan12-A and parent Plan12 remain OPEN.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [COVER_TASK_EXECUTION_CONTRACT.md](COVER_TASK_EXECUTION_CONTRACT.md),
[PLAN09_ONBOARDING_UX.md](PLAN09_ONBOARDING_UX.md), [ADR-022](DECISIONS.md).

## 1. Boundary

| Layer | Responsibility |
|---|---|
| Whale Singing page (`plan09.js`) | Existing Chinese dual-page UI; new FIXTURE/OFFLINE task panel only when a trusted adapter is injected |
| `window.__WHALE_SINGING_APP__` | Explicitly injected adapter/harness bridge; absent in production read-only Host => panel shows “未接入” and cannot create a task |
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
- `status(taskId)` — Chinese stage/status projection.
- `cancel(taskId)` — existing `requestCoverCancel` with the actual `attemptId`; `ACCEPTED` is not “stopped”.
- `preview({taskId,draft})` — only a `SAVED` MASTER is read, through the Artifact library with the same scope,
  ref, rights and expiry; bounded bytes only.
- `resume({taskId,attemptId,requestKey})` — existing `resumeCoverFinal` identity/receipt path; no new task.

The accepted draft fields are `sourceRef`, `voiceProfileId`, `sourceLayout`, `mixMode`, `pitchShift`,
`vocalGainDb`, `instrumentalGainDb`. `CLEAN_VOCAL` is accepted only with `VOCAL_ONLY`; `MIXED` uses the
Fixture two-stem preset. No arbitrary paths, URLs, rights, ready flags or hashes are accepted from the browser.

## 3. UI

The Singing page gets a new card, only when `window.__WHALE_SINGING_APP__` exists:

- **可信演示素材 / 可信演示声线** selects filled from `list()`.
- **创建演示任务** → existing Cover Task birth (one idempotency key).
- **执行/重连** → status/execute; repeated clicks cannot create a second task.
- **刷新阶段**, **取消任务**, **读取受限预览**.
- Stage labels map the real checkpoints (分离/转换/混音/校验) to Chinese and display `SAVED ≠ SENT`.
- No audio element, device playback, real import or send button is added.

The FIXTURE/OFFLINE card explicitly says `realReady=false`. Without the adapter the card is a read-only
“未接入唱歌应用适配器” notice; the existing draft and dependency wizard remain available.

## 4. Test evidence

- `test/singing-app.test.mjs` (6 tests): trusted list/no proof leak; MIXED run → one MASTER + bounded preview;
  CLEAN_VOCAL run; changed parameters conflict; missing dependencies/unknown source/voice; rejected rights.
- UI harness: **64/64**, including the panel's create/execute/preview/task-id stability actions with the injected
  fixture adapter.
- Full `node --test`: **1069 tests / 1065 pass / 4 platform skips / 0 fail**.
- `node build.mjs`: `client.js` regenerated with the new panel; syntax check passes.
- All tests use temporary Fixture sandboxes, synthetic WAVs and the isolated UI harness; no real audio,
  device playback, network, private files, WeChat or paid service.

## 5. Not implemented / remained OPEN

- Real RVC/SVC models, licensed song material, UVR/MSST separation, quality/CPU-GPU/long-audio/recovery.
- Original 12-A's 13-A Fake Delivery dependency and `RVC_SVC_COVER_INTEGRATION_BLUEPRINT` real gateway.
- 12-B legal search/DeepSeek Tools, 12-C real send, 12-D Seed-VC.
- Production Host route, real file import/playback, WeChat/Relay delivery, authentication changes.
- Plan10/Plan11 real model/API DoD; Plan13 pre-dispatch full ADR-001 and unified whale delivery/Sender expansion.

`SAVED` is a Fixture Artifact save only; it is never `SENT`, never a real cover, and never a rights proof.
