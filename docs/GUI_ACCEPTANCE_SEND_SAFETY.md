# Send & Safety — real DSH GUI acceptance

**Date:** 2026-10-24
**Scope:** read-only visual/UI inspection of the running DSH Electron page. No restart, no Host reload,
no debug port, no CDP and no write action.

## 1. Runtime baseline

| Item | Observed |
|---|---|
| DSH app | `0.2.1-rc.2` |
| GUI | `http://127.0.0.1:57393` |
| Host PID | `29116` |
| UI PID | `37464` |
| Host window | `开发 — DeepSeek Harness` |
| Plugin client footer | `v0.1.0` |
| Loaded frontend marker | real `发送与安全 / Safety` navigation and page render |

The running renderer already showed the new PR #8 navigation and page. No client refresh, Host reload
or DSH restart was performed to obtain this evidence.

`PR #8` changed client UI/docs only; the Host version remains the already-running DSH
`0.2.1-rc.2` process.

## 2. Evidence method

- Windows UI Automation (UIA) read-only tree inspection of the real DSH window.
- Actual navigation clicks inside the Whale Voice page.
- Window resize to `1100x820`, then restore to maximized.
- Screen capture saved **outside the repository** because the desktop contains private sidebar
  context. It is not committed or uploaded.
- No CDP/DevTools, no Host Inspector DOM, no production page text export.

Because no supported DOM/DevTools endpoint is enabled, **computed CSS, DOM structure, Console entries
and network failures could not be directly read**. Those remain a known evidence limitation; visual
appearance and UIA control state were inspected instead.

## 3. Real GUI findings

### 3.1 Navigation and page shell

- Real nav contains `发送与安全` between `权限管理` and `音色中心`.
- Breadcrumb: `Whale Voice / 发送与安全 · Safety`.
- Page header: `WHALE VOICE / SAFETY`, `发送与安全`.
- Three cards: `紧急停止`, `微信窗口管理`, `游戏模式`.
- Page notice: “安全控制后端尚未接入…未知状态不会显示为安全通过.”
- Top status: `等待后端 API` and `只读状态`; **not** “Core 已读取” on this page.
- Rounded/glass frame, plugin logo and scrolling were visually present.
- At a narrow window (`1100x820`):
  - navigation collapses to the compact rail;
  - content becomes two columns, then stacks on further narrowing;
  - vertical scrolling works;
  - no horizontal clipping was observed;
  - the third card remains reachable by scrolling.

### 3.2 Emergency stop

Real elements observed:

- `全局紧急停止` with `未支持`
- `注册快捷键` button disabled (`UIA IsEnabled=false`)
- `候选快捷键` shows `Ctrl + Shift + F12`
- description says it is only a planned default; registration conflict checks are not implemented
- `当前可取消任务`: `未知`
- `最近一次停止结果`: `未执行`
- `取消后的设备恢复`: `未知`
- `录制快捷键` button disabled
- Notice explicitly states recording/submission can be `UNKNOWN` and must not be rewritten.

**No wording claims the shortcut is active or can currently protect a real send.** The page says
"本轮不会注册真实键盘监听", "仅规划默认值", and the actions are disabled.

### 3.3 WeChat window management

- `自动发现微信窗口` switch disabled
- `当前窗口状态`: `未知`
- `允许自动聚焦微信窗口` switch disabled
- `当前焦点策略`: `未知`
- `授权会话验证`: `未验证`
- `最近一次窗口定位结果`: `未执行`
- Explicit notice: “发现微信窗口 ≠ 已验证目标聊天.”

No window discovery, focus change or target identity check was executed.

### 3.4 Game mode

- `游戏时暂停语音任务` switch disabled; shows `演示值`
- `游戏时不抢微信焦点` switch disabled; shows `演示值`
- `全屏游戏保护`: `未支持`
- `任务暂停与降级策略`: `未知`
- Notice states only new tasks are paused by default in the future, already-recording/submitted
  tasks are not assumed cancellable, and expired tasks are not auto-retried.

### 3.5 Migration results

| Surface | Real observation |
|---|---|
| `总览` | `发送与安全` summary with “紧急停止 · 窗口焦点 · 游戏保护”; no duplicate game-mode switch |
| `语音设置` | `故障降级` card with `语音服务不可用时使用文字回复`; no game-mode card; no Qwen-offline duplicate |
| `组件管理` | `自动启动本地 TTS 服务` row exists, marked `未支持`, switch disabled (`IsEnabled=false`) |
| Safety page | only one game-mode authority; one emergency/focus authority |

Existing Core config readout remains visible in Voice Settings:

- `真实配置 · 只读`
- `Core 已读取`
- Bridge/Worker separation remains distinct.

This is real Core readout, not a mock. The safety controls themselves are **MOCK/disabled** because no
safety capability API exists.

## 4. Control state evidence

UIA `IsEnabled` values in the real DSH window:

| Control | Enabled |
|---|---|
| 注册快捷键 | **false** |
| 录制快捷键 | **false** |
| 自动发现微信窗口 (switch) | **false** |
| 允许自动聚焦微信窗口 (switch) | **false** |
| 游戏时暂停语音任务 (switch) | **false** |
| 游戏时不抢微信焦点 (switch) | **false** |
| 自动启动本地 TTS 服务 (Components) | **false** |

No safety setting is persisted by these controls; they are display-only.

## 5. Mock / unavailable list

Still mock or unavailable:

- global emergency-stop hotkey registration and listener;
- cancel task state machine and device restore;
- WeChat window discovery, auto-focus and target validation;
- fullscreen/game detection;
- task pause/degrade policy;
- Qwen auto-start;
- safety capability/status/cancel API endpoints.

Not mock:

- Core availability signal used to choose “等待后端 API” vs “Core 未连接”;
- existing real config readout on Voice Settings/Components;
- existing Voice Sender/WeChatAgent/Qwen status readouts elsewhere.

## 6. What could not be observed safely

- Computed CSS (`border-radius`, `backdrop-filter`) values; only visual appearance was inspected.
- DOM/Accessibility tree via CDP; UIA was used as a native desktop accessibility surface.
- Console messages, unhandled rejections and failed network requests.
- Exact loaded JS asset hash.

No debug port was opened and no DevTools was attached to production.

## 7. Automation results

```text
node build.mjs      -> pass, client.js 186092 bytes
node --test         -> 52/52 pass
npm.cmd run test:ui -> 12/12 pass
```

Artifacts remain in gitignored `tests/ui/.artifacts/`; the real desktop screenshot remains outside the
repository.

## 8. Verdict

**Real DSH GUI visual acceptance: PASS for the implemented MOCK/disabled safety page.**

- The page is actually present in the running DSH renderer.
- All unimplemented controls are disabled.
- No safety API is presented as connected.
- No false claim of active emergency-stop protection was found.
- Migration results are present without duplicate game-mode controls.

**Backend safety capability: not implemented.**
The page remains `MOCK`/`OFFLINE` with respect to hotkey, cancel, window, focus, game and recovery
backends. A real Windows safety acceptance remains a later Phase 6 activity.

**Phase 4B:** not entered. Phase 4B remains a separate configuration-write stage requiring its own
authorization and design; this GUI acceptance does not grant configuration write authority.
