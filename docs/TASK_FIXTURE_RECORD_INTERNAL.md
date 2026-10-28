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
- 坏成功协议：`ok:true` 但 `value` 为空对象、标量 `42`、缺 `source`、`source=42` 等残缺形状，在读取内部字段前判为 `DEPENDENCY_FAILURE/$`；合法 `ok:false` 仍按阶段返回输入/来源/归约拒绝。成功根字段 schemaVersion/taskId/feature/taskType/voiceProfileId/deliveryRequested/source/rights 缺失或类型错误同样按 DEPENDENCY 处理；`undefined` 赋值（schemaVersion/taskId/deliveryRequested）是与真实 `delete` 分开的类型控制。
- 三阶段协议用同一张有限表：每个 validator 包装**先以原参数委托真实 validator**（记录真实 `ok` 与阶段），只有真实控制 `ok:true` 后才注入。合法拒绝用**独立探针**：在真实控制之外用删除字段后的参数再调用原 validator，取得真实 `ok:false`（初始 record→INVALID_INPUT、draft→SOURCE_INPUT_INVALID、最终 record→TASK_TRANSITION_REJECTED）；`throw`/`null`/`ok` 非布尔/`value=42`/空对象/缺 source/source=42 八类 proof 证明坏协议→DEPENDENCY。最终 record 失败断言发生在纯 BEGIN/ATTACH 之后：`transition=2`、`dispatch=1`，不存在归约前 transition0 的假拒绝。
- 三种来源分开：①**输入侧 delete** → 真实合法拒绝（阶段码）；②**成功 payload 的 value delete**（初始 record 删 schemaVersion、draft 删 taskId、draft 删 deliveryRequested）→ 仍 `ok:true` 但缺必需字段 → `DEPENDENCY_FAILURE/$`，测试断言字段确实不存在；③**赋 `undefined`** 是类型控制，不与前两者混同。payload 对照组归约前 `dispatch0/transition0`、record=null。
- 自动测试含 test-only `vm.SourceTextModule` worker：entry（existing / 内部 draft / 实际 public）与 fault（target+kind）**分开配置**，`final` 调用序号按实际入口推导（existing 第 2 次、draft/public 第 1 次），同一 8 类表同时用于三入口 final。`counts.validateRecord/validateDraft` 只表示 engine 调入包装次数；真实控制次数（controlOk）、真实 validator 调用（realRecordCalls/realDraftCalls）与合法拒绝探针（legalRefusalProbes）单列，避免用重复探针掩盖 engine 调度。正常 existing 输出与 native 深等且 source1/gate1/dispatch1/create0/transition2/validateRecord2/validateDraft1/rvcCalls1/rvcOk1；legacy/public create1 且 private record 不离开门面；public 的私有 `record:null` 一律由同 fault 的内部 draft 配对证明，不把公开硬编码值当证据。
- 合法碰撞：catalog record source、taskDraft source、negotiation request.sourceAudioRef 与 artifactLibrary ref 四引用同步为自然 Fake 输出引用时，source/validator 通过并到达专用 `artifactRef === source.ref` 门禁，返回 `INVALID_TASK_RESULT`（faultHit=0、rvcCalls1/rvcOk1、无二次 dispatch）；不同步 ref 仍是 SOURCE_BLOCKED 对照（dispatch0/transition0），worker 与 native 深等。
- 外层关联：gate↔dispatch 的 instanceId/candidateId/category/readiness.instanceId 变异 → `DEPENDENCY_FAILURE/$`，`dispatch1` 且 `rvcCalls0`（在 RVC 结果 validator 之前拒绝）；结果侧 requestId/targetModelId 变异与缺 `durationMs`/`status=42` → `INVALID_TASK_RESULT/$`，`rvcCalls1/rvcOk0`、`dispatch1`、`transition0`、无附着保存。两类错误码不统一。
- 初始状态零调用：SAVED/UNKNOWN/PROCESSING 等在 Fake 前拒绝（source/gate/Fake/create/transition/dispatch 全 0，record=null）；源阻断（artifactId availability=ABSENT）legacy create0，准入阻断 legacy create1、dispatch0；六混合预检（版本、未知根键、缺 draft、坏 record+缺源、异 scope、坏 draft+异 scope）的共用依赖调用全 0，仅按顺序出现初始 record/draft validator 计数。三个已有合法帧另补动态计数：existing TTS 与真实 `BLOCKED_RIGHTS` 均 create0/dispatch0/transition0，legacy/public TTS create1/dispatch0/transition0，且 worker 与 native 深等、TaskId/状态保持。

## 9. 未来中文流程与三恢复（尚未实现 GUI）

未来正常流程应是“从任务列表打开原任务 → 检查素材与依赖 → 明确开始 → 显示同一任务进度/结果”，不能创建第二 Task 欺骗用户。当前没有页面、按钮或持久恢复。

三类恢复文案（未来 UX 约束，本轮未实现）：

- 素材已过期或权利变化：“素材当前不可用，请重新选择有权使用的素材；原任务不会自动重新执行。”
- 记录/关联不一致：“任务信息暂时无法核对，请返回任务列表检查；系统不会替换任务编号。”
- 已运行/结果未知：“该任务已开始或结果尚未确认，系统不会自动再执行。”取消请求不冒充已停止。

## 10. 逐项覆盖矩阵（B01–B16 与边界组）

下列映射均为**行为测试**：真实解析/状态逻辑 + 真实 Core 响应结构驱动，不是源码字符串断言。测试文件为 `test/task-fixture-record.test.mjs`，产品/旧测试/目录 Schema 未改。

| 组 | 覆盖点 | 测试证据（函数/断言） |
|---|---|---|
| B01 | 旧门面 13 键信封不变、无 record/observedAt 泄漏 | `B01`：`runFixtureAudioTaskOnce` 键序、与 draft 入口 `result` 深等 |
| B02 | 已有 record 复用不产生第二条目录项 | `B02`：目录 hash/revision 不变、taskId/observedAt 保留 |
| B03 | 七场景状态机与投影一致 | `B03`：SUCCESS/OFFLINE/MODEL_MISSING/TIMEOUT/CANCEL_*/UNKNOWN 的 phase/state/states |
| B04 | 本次 now 只用于当前检查 | `B04`：后续 now 不替换 observedAt；过期源阻断 |
| B05 | scope 关联与合法异 scope | `B05`（frame/expectation 三态拒绝）、`B05 legal cross-scope`：`profiles` 与其绑定 `assets` 同步移 `scope:fixture-other` 后**原库 validator 先 ok=true**，原库→合法 `BLOCKED`、内层 `VOICE_ASSET_PROFILE_UNAVAILABLE`、TaskId 保留；只改 profile 仍是结构非法 |
| B06 | 身份八域与规范合法性 | `B06`（非法组合→draft validator `ok:false`→`SOURCE_INPUT_INVALID/sourceInput`）；`B06 legal`：taskId / 联动 feature-taskType-source.kind / source.ref / voiceProfileId / rights.state / deliveryRequested 逐个**先 `validateAudioTaskDraft` ok=true**，再命中 record 比较 `INVALID_INPUT/$`；schemaVersion 固定 1 |
| B07 | 投影/缺字段/未知键/版本不可冒充 record | `B07` |
| B08 | 非初始状态在 Fake 前拒绝 | `B08` + `B10` worker 计数 |
| B09 | 源/准入/TTS/REMOTE 阻断 | `B09`（CPU 阻断、TTS 未实现）；`B09 overlay`：源 `availability=ABSENT` 先得合法 `BLOCKED/SOURCE_ARTIFACT_SOURCE_MISSING`，坏 context→`INVALID_CONTEXT/context`、坏 readiness→`READINESS_INVALID/readiness`；`manifest.resources.local=false` 时 CPU/GPU 即使 `UNAVAILABLE` 仍是 `requiredResource=REMOTE`/`FIXTURE_READY`（保留 `TTS_MANIFEST`）；`installation=ABSENT` 的负控**从已构造 remote 克隆**（`local=false` 保持、CPU/GPU 不可用）→合法 `BLOCKED/PROVIDER_READINESS_INSTALLATION_MISSING`、gate `requiredResource=REMOTE`、engine `READINESS_BLOCKED`、TaskId 保留 |
| B10 | 阻断计数与六混合优先级 | `F01` 六组合 + `B10` worker：SAVED/UNKNOWN 全零、dispatch0、record=null；legacy 源阻断 create0、准入阻断 create1、dispatch0；六混合共用依赖全 0；`D` 三个已有合法帧：existing TTS 与真实 `BLOCKED_RIGHTS` create0/dispatch0/transition0，legacy/public TTS create1/dispatch0/transition0，worker 与 native 深等 |
| B11 | 外层关联与坏结果分段 | `B11`：instanceId/candidateId/category/readiness.instanceId→`DEPENDENCY_FAILURE/$` 且 `rvcCalls0`；requestId/targetModelId/缺 durationMs/status=42→`INVALID_TASK_RESULT/$` 且 `rvcCalls1/rvcOk0`、`dispatch1`、`transition0`；`F01 legal collision` 四引用同步 |
| B12 | 结构边界、精确分区深度、hidden/null 原型/循环、owner 值预算 | `B12`（getter/Symbol/Proxy/32 键）；`B12 measured`：先**测量**真实深度——合法 TTS 输入 `depth12` 被接受、`nested(13)` 拒 `RESOURCE_LIMIT`、`nested(12)` 过预算后按形状拒；owner 分区 `{scopeId,record}` 实测 13 拒、12 过；hidden 键、循环→`INVALID_INPUT`；深 null 原型合法输入可执行；owner 独立值预算一例（record 额外字段挂 17×256 子数组，深度/键数/数组长度均未超限）→`RESOURCE_LIMIT/$`、record=null |
| B13 | 冻结、fresh 与全图隔离 | `B13` 根级；`B13 full-graph`：执行前记录实际输入/record 的对象集合、每个对象冻结状态与 JSON；执行后 wrapper 与 `{record,result}` 全图对象**全部冻结**、与输入/record 集合**零交集**、输入 JSON 与冻结状态不变；两次运行输出对象集合互不相交；并对实际 record 的**每个对象**逐一比较执行后 `Object.isFrozen` 与保存值（两次执行后均复检） |
| B14 | 同 CREATED 快照可再次纯模拟、不发明 claim | `B14` |
| B16 | 内部文档边界与状态标签 | `B16`：内部/OFFLINE/NOT_INTEGRATED/不持久/不宣称等标记 |
| 三阶段/final 三入口 | 先真实委托、合法拒绝/坏协议/成功 payload 缺字段分组 | `T02`：包装先以原参数委托真实 validator（`controlOk`、`realRecordCalls`/`realDraftCalls` 单列），合法拒绝用独立删除探针取得真实 `ok:false`（`legalRefusalProbes`）；同一 8 类（throw/null/坏 ok/42/空对象/缺 source/source=42）用于 initial、draft 与 final 三入口（existing 第 2 次、draft/public 第 1 次），均 `DEPENDENCY_FAILURE/$`、final `transition2/dispatch1/rvc1/1`、无二次 dispatch；成功 payload 真 `delete`（schemaVersion/taskId/deliveryRequested）→ `payloadDeleted.present=false` 且 `DEPENDENCY/$`；public 只验公开错误与不外泄，私有 null 由同 fault 内部 draft 配对证明 |

**与 0043 的据实更正（不回写历史）：** 0043 把“输入侧删除字段得到的真实合法 `ok:false`”与“成功 payload 缺必需字段”混同，且 `throw` 在真实 validator 调用之前注入；本轮改为**先真实委托 + 独立合法拒绝探针 + 成功 payload 真 delete** 三源分列，并把同一 8 类 proof 覆盖到 existing/draft/public 的 final 入口。0043 的“全部原可执行项 PASS / 真删除成功根字段”属过度表述，历史报告与回执保留、不覆盖。

未覆盖/明确保留：真实音频字节、模型推理、GPU/设备、持久 claim/跨进程恢复、Host/GUI、微信发送与真实用户链路；本步仍是 **OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。

## 11. 与 08-D-C 持久 owner 的关系（新增）

本模块的 `runExistingFixtureTaskOnce` 仍是唯一 existing-record 执行入口，行为不变。Plan 08-D-C 在其上增加一个**同进程、同 trusted sandbox capability** 的持久 owner（`core/audio/task-owner.mjs`）：

- 先以 catalog 出生登记的真实完整初始 record 原子写入 `CLAIMED`，再调用本入口**至多一次**；
- 调用前后 owner 都在同一 capability 上重新读取出生登记并重做全部关联门禁；出生文件损坏或合法外改时本入口调用数为 0，不会把旧出生对象当作永远有效；
- 只有返回的完整 record 通过原 `validateAudioTaskRecord`、不可变身份（taskId/feature/taskType/source/voiceProfileId/rights/deliveryRequested/observedAt）与出生一致、phase/状态合法，且与本模块真实 `projectAudioTask` 结果完整结构等价时才保存 `FINAL`；薄适配守卫只校验本入口冻结的 13 键信封与固定安全标志，不复制旧状态机；
- 已确认 claim 但无可信 FINAL（engine throw、坏协议、record=null、最终提交未确认）时首次返回固定 `TASK_OWNER_EXECUTION_UNKNOWN` 并保留 CLAIMED 墓碑；后续 run/get 只读该墓碑为 `ownerState=UNKNOWN`，不再调用本入口；
- 因此“同一 CREATED 快照再次调用仍可能再次模拟”的旧限制在 owner 路径上被持久 claim 与只读重复所取代，而**本模块自身仍是同步纯函数**，不持久、不防重。

两模块都仍是 `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`；不接 Host/GUI、真实模型/音频/设备/投递，也没有跨进程恢复。
