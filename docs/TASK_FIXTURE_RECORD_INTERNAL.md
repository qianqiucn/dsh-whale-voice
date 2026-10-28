# Plan08-D-B · 已有 Task 记录的内部单次模拟复用（内部文档）

状态：**OFFLINE** / **FIXTURE_ONLY** / **NOT_INTEGRATED**。本文件面向研发/审核，不是普通用户文档，也不代表已接入 Host、GUI、真实 Provider 或持久执行。

## 1. 目的与范围

旧 08-C 每次运行都会 `createAudioTaskRecord`，而 08-D-A 目录已经保存了合法的初始完整 Task。D-B 收敛为**唯一内部 engine**：

- `runDraftFixtureTaskOnce(input)`：旧 draft 入口，仍创建初始 Task；
- `runExistingFixtureTaskOnce(frame)`：复用已有完整初始 Task，不再次 create、不换 TaskId、不改 `observedAt`。

两个入口共用同一套源校验、准入、至多一次 RVC Fake、旧 Task 动作与最终投影。旧公开 `task-fixture-runner.mjs` 仍是兼容门面，只转发 draft 入口的 `result`。

## 2. 内部 frame

`runExistingFixtureTaskOnce` 的根恰三键：

```text
{
  scopeId: "scope:fixture-demo",
  record: AudioTaskRecordV1,   // 完整 16 字段记录，不是安全投影
  input: { schemaVersion, sourceInput, readiness, context } // 旧四键输入
}
```

- `scopeId` 必须严格匹配 `/^scope:fixture-[A-Za-z0-9_-]{1,32}$/`，并精确等于 `input.sourceInput.voiceBinding.expectation.scopeId`。
- `record` 必须实际通过旧 `validateAudioTaskRecord`，且只能是 `CREATED` / `BLOCKED_RIGHTS`；输出、取消确认、投递、lastError 等已推进字段一律拒绝。
- `input` 的 `taskDraft` 必须是合法旧草稿，且与 `record` 的 schemaVersion/taskId/feature/taskType/source.kind+ref/voiceProfileId/deliveryRequested/rights.state 逐项一致；`deliveryRequested` 缺省按旧规范 false。
- frame 采用浅层描述符检查（普通对象、恰三键、自有可枚举 data descriptor、零 getter），再分别复制 owner 分区 `{scopeId,record}` 与 input 分区；每区仍受旧 4096 values / depth12 / 32 keys / 256 items / 8192 chars 限制，不把完整 frame 塞进一次旧复制。

## 3. 结果与隔离

内部两个入口都返回私有二键对象：

```text
{ record: AudioTaskRecordV1 | null, result: 原 TASK_FIXTURE JSON信封 }
```

- `record` 是完整内部记录，可能包含 `observedAt` 等字段；**不得**把它放进 Host/GUI/JSON 或旧公开门面。
- `result` 仍是旧 13 键信封，不新增 record/scope/frame 字段。
- 错误时 `record=null`，但 `result` 的 14 个错误码、固定 reason 与路径保持旧协议。
- 两个入口都是同步纯函数：无 I/O、网络、随机数、时钟、进程、队列、模块级业务状态或恢复。

## 4. 时间与状态

- 复用 `record.observedAt`，不强制等于本次 `voiceBinding.now`，也不发明 `createdAt`。
- 本次 `now` 仍用于源/音色/权利/expiry 的当前检查；不能用旧 `observedAt` 绕过当前阻断。
- 合法 `BLOCKED_RIGHTS` 记录只保留原阻断；若依赖返回可执行 linked/ready 而 record 仍 `BLOCKED_RIGHTS`，`DEPENDENCY_FAILURE` 失败关闭。
- 任何非初始状态（`PROCESSING`、`ARTIFACT_READY`、`SAVED`、`CANCEL_REQUESTED`、`CANCELLED`、`FAILED`、`UNKNOWN`）均在 Fake 前拒绝，不重置、不重跑。
- 每次调用至多一次 Fake；**同一 CREATED 快照再次调用仍可能再次模拟**，本步不持久、不宣称跨调用幂等、不提供 claim/恢复。

## 5. 未来 owner 边界

未来持久 owner 必须自行从目录私有 entry 取 `scopeId` 与完整 `record`，先完成持久 claim，再调用本 engine，最后按当时契约确认结果；本步不实现：

- 目录 handle 的 run/claim/commit；
- 跨进程锁/恢复；
- UNKNOWN 自动重试或“已认领”状态；
- Host/GUI 路由、真实 Provider、音频生成/保存/投递/发送。

`scopeId`/TaskId 只是 Fixture 关联声明，不是 WeChat 授权、登录身份或目录来源证明。

## 6. 研发调用示例（不是普通用户流程）

```js
import { runExistingFixtureTaskOnce } from './core/audio/task-fixture-engine-internal.mjs'

const out = runExistingFixtureTaskOnce({ scopeId, record, input })
if (out.result.ok) {
  // out.result.value.task 是旧安全投影；out.record 只在内部使用
}
```

普通用户当前**没有新增按钮或可用流程**；本步不提供生成、试听、保存、发送能力。

## 7. 限制

- 仅同进程纯函数复用；不持久、不跨进程、不防重。
- 不读目录、不读文件、不接触生产配置或真实音频。
- 不改变 08-A/B/C/D-A 的既有协议、目录 Schema 或 Task 合同。
- 未集成 DSH Host/GUI，未连接真实模型/微信/Sender。

## 8. 预检顺序与错误分类

固定顺序（先完整预检，再共用源/准入流程）：

```text
frame 浅描述符/根预算 → owner 分区复制 → input 分区复制 → input 根形状/schemaVersion
→ scope 形状 → record 旧 validator → 初始状态/字段 → 安全取得 draft 并旧规范化
→ expectation/scope 与八领域等价 → 共用 source/context/readiness
```

- 合法 record 拒绝 → `INVALID_INPUT/$`；record validator 抛错/坏协议 → `DEPENDENCY_FAILURE/$`。
- 合法 draft 拒绝 → `SOURCE_INPUT_INVALID/sourceInput`；draft validator 抛错/坏协议 → `DEPENDENCY_FAILURE/$`。
- 最终 record 合法拒绝 → `TASK_TRANSITION_REJECTED/$`；抛错/坏协议 → `DEPENDENCY_FAILURE/$`。
- 混合坏输入按上述固定顺序命中，不由外层 catch 覆盖；record=null，零 Fake/create/transition。
- 已知例外：特定 `ok:true, value=42` 在旧 M 会落到 TRANSITION，本步按 040 §8 明确收紧为 DEPENDENCY；不宣称所有恶意依赖返回逐值等于旧 M。
- 坏成功协议：`ok:true` 但 `value` 为空对象、缺 `source`、`source=42` 等残缺形状，在读取内部字段前判为 `DEPENDENCY_FAILURE/$`；合法 `ok:false` 仍按阶段返回输入/来源/归约拒绝。

## 9. 未来中文流程与三恢复（尚未实现 GUI）

未来正常流程应是“从任务列表打开原任务 → 检查素材与依赖 → 明确开始 → 显示同一任务进度/结果”，不能创建第二 Task 欺骗用户。当前没有页面、按钮或持久恢复。

三类恢复文案（未来 UX 约束，本轮未实现）：

- 素材已过期或权利变化：“素材当前不可用，请重新选择有权使用的素材；原任务不会自动重新执行。”
- 记录/关联不一致：“任务信息暂时无法核对，请返回任务列表检查；系统不会替换任务编号。”
- 已运行/结果未知：“该任务已开始或结果尚未确认，系统不会自动再执行。”取消请求不冒充已停止。
