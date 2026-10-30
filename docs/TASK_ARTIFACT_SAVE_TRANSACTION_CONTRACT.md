# Whale Voice · 同一 claim 内的任务保存事务契约（候审）v1.0

> **状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
> 本文只是**候审技术契约**，不是已实现功能，也不构成运行时代码授权。仓库内现有程序仍只有
> owner 的 `run`/`get`（只写 `SIMULATED`/`NO_EXECUTION`），资产库仍只有 `FIXTURE_IMPORT`；
> 不存在“任务已保存到资产库”的真实能力，**不得**把本文当作 `SAVED` 已可用的证据。
>
> 基准提交：`main` **M `08cf0b61acc402d619618df2ad15bce5436b0873`**（tree `7a6abf130e9102c58af6caa1677718b2bbfe8610`）。
> 文中 `文件:行` 均指该提交的实际源码；“当时实现”与“本文候选”严格分栏。

---

## 1. 目的、范围与非授权

### 1.1 要解决的问题

Plan08-E-D 已在**同一纯函数引擎**内，从一次真实 Fake SUCCESS 得到 `PROCESSING` 记录与一份
`SYNTHETIC_FIXTURE` 字节包（`runExistingFixtureTaskBytesOnce`）。但今天仍然没有“把这次任务的
结果保存进演示资产库”的可信路径：

- owner 只调用旧 `runExistingFixtureTaskOnce`，只在 `FINAL` 里记录 `SIMULATED`/`NO_EXECUTION`；
- 资产库只接受人工 `FIXTURE_IMPORT`，`origin` 固定，天然不含 Task/claim 证明；
- 两个域各有自己的队列、digest、锁与 rename，**两次 rename 不是跨文件原子事务**；
- 直接把两次 rename 串起来、放宽旧状态集合、或把 `requestKey = taskId` 当 ownership 证明，都不成立。

本文给出**唯一一份**可审的候选事务契约：在同一个 owner claim 内产生字节、导入资产、完成 Task
`ATTACH_FAKE_ARTIFACT` → `MARK_SAVED`、写入严格 `FINAL`，并定义所有失败/未知/并发/删除边界。

### 1.2 明确不做的事

- 不修改任何源码、schema 文件、测试、配置、CI、依赖、client/HostGUI；本文件所在 PR 只含文档。
- 不实现 `SAVED`，不运行候选保存流程，不新增验证器/模拟器来“证明”已保存。
- 不新增第三个持久文件、中间 phase、品牌 lease、第二 TaskId/DeliveryId、第二 owner 或队列。
- 不把 `SYNTHETIC_FIXTURE` 当成真实生成、来源权利或 ownership 凭证；不把库 `GRANTED` +
  fixture-rights `proofRef` 与 Task `CONFIRMED_FIXTURE` 混为同一合同。
- 不承诺跨进程锁/恢复；威胁模型仍是**受信临时 sandbox + 同进程 capability**。

---

## 2. 现状证据（当时实现，逐项可追溯）

> 以下全部来自 M 的实际源码；行号为该提交的工作树行号。本文候选方案不得改写这些既有语义，
> 只能在后续实现中**最小复用**。

### 2.1 owner：只有 run/get，两种 completion

`core/audio/task-owner.mjs`

| 事实 | 出处 |
|---|---|
| 工厂 `openFixtureTaskOwner({sandbox})`，handle 冻结为 `{run,get}`，全部经 `enqueue` 串行 | `:552`、`:568-571` |
| `run` 先 fresh 读出生登记与全部 owner 关联（`verifyOwnerAssociations`），出生缺失 → `NOT_FOUND` | `:421-423`、`:574` |
| 已存在 `FINAL` 直接返回 `EXISTING`；已存在 `CLAIMED` 返回 `EXECUTION_UNKNOWN` 投影 | `:426-430` |
| `CLAIMED` 以 `revision+1`、`birthIdentityHash`、`record=birth.record`、`completion:null` 写入 | `:433-451` |
| claim 后、engine 前重读并核对 claim digest 与出生 record 一致 | `:453-460` |
| engine 至多一次（旧入口），异常 → `EXECUTION_UNKNOWN` | `:462-474` |
| engine 结果经 `interpretEngine` 严格守卫（13 键信封、安全 flags、原 validator、`sameOwnerImmutable`、投影深等、phase/state 组合） | `:349-411` |
| engine 后、FINAL 前再 fresh 关联一次 | `:476-478` |
| FINAL 以 `revision+2` 写入；`WRITE_UNKNOWN` 原样上抛，`WRITE_REJECTED` → `EXECUTION_UNKNOWN` | `:480-507` |
| FINAL 后第四次关联确认失败 → `lockStore` + `WRITE_UNKNOWN` | `:509-523` |
| `get`：无 `now`，只按存储结论返回 `SIMULATED`/`NO_EXECUTION`/`UNKNOWN` | `:531-545` |
| 错误表 14 键（`INVALID_INPUT`…`INTERNAL_FAILURE`），固定前缀 `TASK_OWNER_` | `:58-78` |
| 三种中文文案：`SIMULATED`/`NO_EXECUTION`/`UNKNOWN` | `:108-112` |

### 2.2 task store：六键 entry、两键 completion、共享工具

`core/audio/fixture-task-store-internal.mjs`

| 事实 | 出处 |
|---|---|
| `OWNER_ENTRY_KEYS = {scopeId,taskId,birthIdentityHash,phase,record,completion}` | `:53` |
| `OWNER_COMPLETION_KEYS = {kind,reason}`；`CLAIMED.completion===null`；`FINAL` 仅 `SIMULATED`/`NO_EXECUTION` | `:54`、`:477-512` |
| `OWNER_SNAPSHOT_SCHEMA_VERSION = 1`，`revision === entries.length` | `:55`、`:457-460` |
| `identityOf` 只含 schemaVersion/feature/taskType/source/voiceProfileId/deliveryRequested/rights，**不含 taskId、observedAt** | `:119-129` |
| `sameImmutable` 额外比较 taskId、observedAt（owner 关联门禁） | `:545-547`、`sameImmutable` 定义处 |
| 共享：`enqueue`、`lockStore`、`sha256`、`stableStringify`、`openOwnerFile`、`verifyOwnerAssociations`、`raiseStore` | `:36-65` 区段与导出 |
| 四种合法无执行原因：`SOURCE_BLOCKED`/`READINESS_BLOCKED`/`DISPATCH_BLOCKED`/`UNSUPPORTED_DISPATCH` | `:60-65` |
| 允许 `SIMULATED` 的终态：`ARTIFACT_READY`/`FAILED`/`UNKNOWN`/`CANCEL_REQUESTED`/`CANCELLED` | `:56-58` |
| 任何 `CLAIMED`（无 FINAL）都是不可重跑墓碑；库/owner store 不自动清理 | `:557-559` 与 owner `:426-430` |

### 2.3 engine：新 bytes 入口是纯函数

`core/audio/task-fixture-engine-internal.mjs`

| 事实 | 出处 |
|---|---|
| 第六导出 `runExistingFixtureTaskBytesOnce(frame)`，同步纯函数 | `:955` 起 |
| 真实 Fake SUCCESS 验证后才调用一次 producer，再做一次 `BEGIN_PROCESS` | `:711-744` |
| 成功返回冻结 `{record,result,production}`：`PROCESSING`、`outputArtifactRef=null`、`hasOutput=false`、`production` 为 producer 原 value | 同上 |
| 不 ATTACH、不 SAVED、不建第二 Task、不写任何文件 | 同上 |
| 旧 `runDraftFixtureTaskOnce` / `runExistingFixtureTaskOnce` 及旧 14 码不变 | `:791`、`:932` |
| 许可错误表：`UNREPRESENTABLE_DURATION`/`RESOURCE_LIMIT`/`DEPENDENCY_FAILURE` | `:100-104` |

### 2.4 资产库与 artifact store：独立事务、FIXTURE_IMPORT

`core/audio/artifact-library.mjs` / `core/audio/fixture-artifact-store-internal.mjs`

| 事实 | 出处 |
|---|---|
| 唯一文件 `audio-artifacts-v1.json`，schema 1，`origin` 固定 `FIXTURE_IMPORT` | `artifact-library.mjs:41-42` |
| 预算：item 1 MiB、decoded 4 MiB、32 entries、pack 6 MiB | `artifact-library.mjs:43-46` |
| handle：`import`/`get`/`readBytes`/`delete`，各自 `enqueueArtifact` | `artifact-library.mjs:587-628` |
| import 输入六键 `{schemaVersion,scopeId,requestKey,bytes,now,expiresAt,rights}`；调用者字节在入队前先做 owned copy | `artifact-library.mjs:102`、`:211` 区段 |
| 只接受 `GRANTED` + 真实 proofRef；`DENIED/UNKNOWN` 拒绝 | `artifact-library.mjs:302`、`:321-324` |
| 结果：`STORED`/`EXISTING`/`DELETED`/`ALREADY_DELETED`/`EXPIRED`/`KEY_CONFLICT` | `artifact-library.mjs:111-117` |
| `artifactIdentityHash(scopeId,requestKey,byteSha256,expiresAt,rights)` 为库唯一身份算法，用于幂等/冲突 | `fixture-artifact-store-internal.mjs:106` |
| 库自己的队列 `enqueueArtifact`、digest、共享 UNKNOWN 锁 `lockArtifact`/`isArtifactLocked` | `:125-155` |
| writer：独占 temp → 短写补全 → fsync → 私有读回 → 单次 rename → post-rename 双重确认；rename 前失败 `WRITE_REJECTED`，rename 已尝试后失败 `WRITE_UNKNOWN` + 锁 | `:634-639`、`:670-690` 区段 |
| 只清理本事务自己创建且仍持有同一 dev/ino 的 temp | `:598-625` |
| 依赖方向：artifact-store **import 自** task-store 的 `sha256`/`stableStringify`/capability 谓词 | `:27-40` 区段 |

### 2.5 catalog 与 Task 合同

`core/audio/task-catalog.mjs` / `core/audio/task-contract.mjs`

| 事实 | 出处 |
|---|---|
| catalog 是**唯一 TaskId 签发者**：`reserve` 按 `(scope,idempotencyKey)` 去重、冲突报 `IDEMPOTENCY_CONFLICT`，生成/校验 `task:` ID | `task-catalog.mjs:195-236` |
| 动作 `ATTACH_FAKE_ARTIFACT` 只允许 `PROCESSING`，要求 `artifactRef`，进入 `ARTIFACT_READY` | `task-contract.mjs:620-628` |
| 动作 `MARK_SAVED` 只允许 `ARTIFACT_READY` 且必须有 `outputArtifactRef`，进入 `SAVED`（终态） | `task-contract.mjs:633-638` |
| `MARK_UNKNOWN` 只允许 `PROCESSING`/`CANCEL_REQUESTED`；`SAVED` 不可再转 UNKNOWN | `task-contract.mjs:680-682` |

### 2.6 当前缺口（本候选要闭合的）

1. 没有“保存”入口：owner 只会跑旧 entry，且 `FINAL` 只认 `SIMULATED`/`NO_EXECUTION`；
2. 没有 Task→Artifact 的可信绑定：库 `origin` 恒为 `FIXTURE_IMPORT`，`requestKey`/同字节都不证明 ownership；
3. 没有跨域提交窗口定义：两次 rename 各自线性化，允许“资产已存但 owner 未确认”的孤儿；
4. 没有保存后的当前可用性投影：`get` 无 `now`，无法判断过期/删除/权利撤销；
5. 没有取消 API：现只有 Fake 场景里的取消结果，不能宣称支持保存中取消。

---

## 3. 唯一候选方案（总览）

**复用原资产库 `FIXTURE_IMPORT` 与唯一 writer，由同一 owner 的严格 `FINAL/completion` 建立
Task 关联。** 不新增第二种存储、不改库 `origin`、不伪造“库原生 Task 来源”。

一句话序列：**同一 claim 内 → 一次 bytes 引擎 → 一次库 import（只认本次新 `STORED`）→
Task `ATTACH_FAKE_ARTIFACT` → `MARK_SAVED` → 严格 `FINAL(SAVED)` → 新鲜联合确认 → 安全投影。**

### 3.1 为什么这是最小可行路径

- `ATTACH_FAKE_ARTIFACT`、`MARK_SAVED`、`SAVED` 终态、`outputArtifactRef` 都已存在且已验收，
  不需要新 Task 动作；
- 库已具备 owned copy、重新 inspector、SHA256、原子包写入、墓碑删除与 UNKNOWN 锁，
  不需要第二套存储；
- owner 已有 claim、四次 fresh 关联门禁、严格 engine 守卫；
- 缺口只是“同一 claim 内把 bytes → 库 → Task → FINAL 串起来，并把每一段失败语义写死”，
  这正是本文的范围。

### 3.2 绑定关系（关键）

| 绑定 | 权威来源 | 不重复存储 |
|---|---|---|
| Task 身份 | catalog 出生登记 + `birthIdentityHash` | owner entry 已有 |
| 本次 claim | owner `CLAIMED` 条目 + 写入后 digest | owner entry 已有 |
| 本次字节 | engine `production.bytes`（`SYNTHETIC_FIXTURE`） | 只在内存中转交库 import |
| 资产 ref | 库本次新 `STORED` 返回的 `artifactRef` | 写入 Task `outputArtifactRef`，owner 不另存 ref |
| 字节身份 | 库 `inspection.sha256` + `identityHash` | FINAL 只写 ref，需要时从库权威读取 |
| 权利/过期 | 保存请求显式 `rights`/`expiresAt`，库落盘 | 库 entry 权威，owner 不复制 |

**禁止**：`requestKey = taskId` 自动推导；用 Task `CONFIRMED_FIXTURE` 自动生成库 `GRANTED`/`proofRef`；
把 `SYNTHETIC_FIXTURE` 或 producer 安全 flags 当来源/版权证明。

---

## 4. 唯一 API 与 schema 提案

### 4.1 新入口（单一）

在**同一** `openFixtureTaskOwner` handle 上新增一个方法：

```js
handle.save(input) -> Promise<Result>
```

- 不新增第二个 factory/模块/队列；`run`/`get` 签名与行为完全不变。
- `save` 进入与 `run`/`get` 相同的能力检查、`enqueue` 串行队列与 `state.locked` 检查。
- 不接收 caller 的 `bytes`、`artifactRef`、`record`、`production`、回调、路径或 sandbox 覆盖。

### 4.2 输入（精确键、类型、上限）

`SAVE_KEYS = {schemaVersion, scopeId, taskId, requestKey, now, expiresAt, rights}`，全部为自有
可枚举 data 字段（拒绝 getter/Symbol/隐藏键/多键）。

| 键 | 类型/格式 | 说明 |
|---|---|---|
| `schemaVersion` | `1`（整数） | 与 owner handle 一致；不匹配 → `UNSUPPORTED_VERSION` |
| `scopeId` | `^scope:fixture-[A-Za-z0-9_-]{1,32}$` | 原 `SCOPE_PATTERN` |
| `taskId` | `^task:[A-Za-z0-9_-]{1,64}$` | 原 `TASK_ID_PATTERN`，必须是 catalog 出生登记里的真实任务 |
| `requestKey` | `^[A-Za-z0-9:_-]{1,64}$` | 与库同一 pattern；显式传入，**不**从 taskId 推导 |
| `now` | ISO-8601 `YYYY-MM-DDTHH:MM:SS(.sss)Z` | 保存发生的 Fixture 时钟；用于库的过期判断 |
| `expiresAt` | 同上，且严格 `> now` | 库落盘的过期时间；不得为 `null` |
| `rights` | `{state:'GRANTED', proofRef:'fixture-rights:<1-48>'}` 恰两键 | 仅此一种合法形态；`DENIED`/`UNKNOWN` 早拒 |

`rights.proofRef` 模式：`^fixture-rights:[A-Za-z0-9_-]{1,48}$`。它是**声明**，不是认证；
真实认证仍由后续产品/权限计划定义。

### 4.3 输出（安全投影，绝不外泄 record/production/receipt）

成功（本次提交或已存在）：

```json
{
  "ok": true,
  "value": {
    "schemaVersion": 1,
    "outcome": "SAVED",
    "revision": 3,
    "ownerState": "SAVED",
    "reason": null,
    "task": { "taskId": "task:fixture-…", "state": "SAVED", "hasOutput": true, "messageZh": "…" },
    "artifact": { "artifactRef": "artifact:fixture-bytes-…", "byteLength": 88244, "sha256": "…64hex…", "expiresAt": "2026-10-31T00:00:00.000Z" },
    "userMessageZh": "演示结果已保存到本地演示资产库；这不会发送到微信，也不代表真实生成。",
    "mockOnly": true,
    "realOperationAllowed": false,
    "submitAllowed": false,
    "automaticRetryAllowed": false
  }
}
```

- `task` 只放 `projectAudioTask` 的**安全投影**（与 owner 现有一致），不放 record。
- `artifact` 只放库已落盘的只读元数据，不放 bytes；真正读取仍需 `readBytes` 的 rights/expiry 门禁。
- `outcome`：`SAVED`（本次完成）或 `EXISTING`（此前已 `FINAL(SAVED)`，不再执行）。
- 未知：`{ok:false, errors:[{code:'TASK_OWNER_SAVE_UNKNOWN',…}]}`，之后 `get` 返回 `ownerState:'UNKNOWN'`。

### 4.4 新增错误表（候选，仅本文定义）

`TASK_OWNER_SAVE_ERRORS`（固定前缀 `TASK_OWNER_SAVE_`）：

| key | 触发 | 首次返回 | 后续 run/get | engine | import |
|---|---|---|---|---|---|
| `INPUT_INVALID` | 输入形状/键/格式 | 错误 | — | 0 | 0 |
| `RIGHTS_REJECTED` | rights 非 `GRANTED`/proofRef 非法 | 错误 | — | 0 | 0 |
| `EXPIRED_REQUEST` | `expiresAt <= now` 或 `now` 非法 | 错误 | — | 0 | 0 |
| `PRECONDITION` | 无出生/无 claim/claim 非本次状态 | 错误 | — | 0 | 0 |
| `ARTIFACT_REJECTED` | 库 pre-commit 拒绝（KEY_CONFLICT/预算/权利/过期/DELETED/EXISTING） | 错误 | — | 1 | 1 |
| `ARTIFACT_UNKNOWN` | 库 rename 已尝试/未知 | `SAVE_UNKNOWN` | `UNKNOWN` | 1 | 1 |
| `TASK_REJECTED` | `ATTACH`/`MARK_SAVED`/最终 record 校验拒绝 | 错误 | claim 墓碑 | 1 | 1 |
| `SAVE_UNKNOWN` | owner FINAL rename 已尝试/未知，或 post-final 确认失败 | `SAVE_UNKNOWN` | `UNKNOWN` | 1 | 1 |
| `STORE_*` / `SANDBOX_INVALID` / `UNSUPPORTED_VERSION` / `INTERNAL_FAILURE` | 沿用 owner 现有 14 码语义 | 同现有 | 同现有 | 按位置 | 按位置 |

错误结构沿用 `{ok:false, errors:[{code, path, reason}]}`，单错、深冻结、回显零输入。

### 4.5 复用的验证器（不新增第二套）

| 校验 | 复用 |
|---|---|
| scope/taskId 模式 | `SCOPE_PATTERN`/`TASK_ID_PATTERN`（task store 导出） |
| 出生 + 关联 | `openOwnerFile`、`verifyOwnerAssociations`、`sameOwnerImmutable` |
| Task 状态迁移 | `transitionAudioTask`（`ATTACH_FAKE_ARTIFACT`/`MARK_SAVED`） |
| record 合法性 | `validateAudioTaskRecord`、`projectAudioTask` |
| engine 结果 | 现有 bytes 入口 + 现有严格守卫（新增 bytes 适配分支） |
| 库 import | 现有 `handle.import`（不新增库 API） |
| 库读取/身份 | 现有 `readArtifactPack` + `artifactIdentityHash` |

---

## 5. 持久 schema 与兼容

### 5.1 owner entry 扩展（唯一方案）

快照仍三键 `{schemaVersion, revision, entries}`，entry 仍六键。**只扩展 `completion.kind` 的
合法取值**与快照版本：

```json
{
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-demo-5",
  "birthIdentityHash": "…64hex…",
  "phase": "FINAL",
  "record": { "…完整 SAVED record…": "…" },
  "completion": { "kind": "SAVED", "reason": null }
}
```

- `kind` 合法集合：`SIMULATED`、`NO_EXECUTION`、**`SAVED`**；`reason` 仍只允许 `null`（`NO_EXECUTION` 例外保留原四值）。
- 不新增 `artifact` 子对象、不新增 entry 键：资产绑定由 `record.outputArtifactRef` + 库权威读取表达。
- `SAVED` 的 `record.state` 必须是 `SAVED`，`outputArtifactRef` 必须是真实库 ref，`delivery.state` 仍 `NOT_REQUESTED`、`deliveryId` 仍 `null`。

### 5.2 快照版本策略

| 场景 | 行为 |
|---|---|
| 读到 `schemaVersion=1`（仅 SIMULATED/NO_EXECUTION） | 新代码正常读取，等价现行为 |
| 首次写入 `SAVED` | 整个快照以 **`schemaVersion=2`** 重写（同一事务、全量 entries 保留、旧条目不改写内容） |
| 读到 `schemaVersion=2` | 新代码接受 `SAVED`；`SIMULATED`/`NO_EXECUTION` 条目规则不变 |
| 旧代码读 `schemaVersion=2` | 必须 `UNSUPPORTED_VERSION`（fail-closed），不得继续写；**文档要求旧运行时拒绝打开** |
| 未来读取 `schemaVersion>2` | `UNSUPPORTED_VERSION`，不自动迁移 |

**不做**：打开即迁移、隐式升级、读写混合版本、把旧条目重算/重签。

### 5.3 旧程序读新格式的失败边界

- 旧 owner 的 `openOwnerFile` 对 `schemaVersion !== 1` 抛 `UNSUPPORTED_VERSION`（现实现即如此）；
- 因此任何写入了 `SAVED` 的 store **不能被旧程序继续使用**；这是刻意选择，避免旧程序把
  `SAVED` 当损坏数据或覆盖成 `SIMULATED`。
- 库格式**不变**（schema 1、`FIXTURE_IMPORT`），旧库代码仍可读写；新代码只是多了“owner 引用它”的事实。

---

## 6. 唯一状态序列与线性化

### 6.1 序列（每步：前置 / 写什么 / 内存事实 / 失败落盘）

| # | 动作 | 前置 | 持久/内存 | 失败时 |
|---|---|---|---|---|
| 1 | `save` 入队 + 能力检查 | handle 可用、未锁 | 仅内存 | `OWNER_UNKNOWN`/`SANDBOX_INVALID`，0 写入 |
| 2 | 读输入 | 七键合法 | 仅内存 | 输入类错误，0 写入 |
| 3 | fresh 读出生+owner 关联 | birth 存在、关联完整 | 仅内存 | `NOT_FOUND`/`BIRTH_INVALID`/`STORE_INVALID`，0 写入 |
| 4 | 已有 entry 分流 | — | 仅内存 | `FINAL(SAVED)` → `EXISTING`；`CLAIMED` → `SAVE_UNKNOWN`；其他 FINAL → `TASK_REJECTED` |
| 5 | 写 `CLAIMED`（revision+1） | 无 entry | owner 文件 | rename 前拒绝 → `WRITE_REJECTED`；已尝试 → `WRITE_UNKNOWN`+锁 |
| 6 | claim 后 fresh 复核 | digest、出生一致 | owner 文件已读 | `STORE_CHANGED`/`BIRTH_INVALID`，claim 留墓碑 |
| 7 | bytes 引擎一次 | claim 已确认 | 内存 `{record,production}` | 引擎异常/坏结果 → `SAVE_UNKNOWN`，claim 墓碑，**无 import** |
| 8 | 库 import 一次 | 引擎 `PROCESSING` | 库文件 | 见 §8 矩阵；只接受本次新 `STORED` |
| 9 | 库提交后、Task 前 fresh 复核 | claim 仍在 | owner 已读 | 外部改写 → `STORE_CHANGED`，**资产保留**，claim 墓碑 |
| 10 | `ATTACH_FAKE_ARTIFACT(ref)` | `PROCESSING` | 内存 record | 拒绝 → `TASK_REJECTED`，资产孤儿保留 |
| 11 | `MARK_SAVED` + 最终 `validateAudioTaskRecord` | `ARTIFACT_READY`+ref | 内存 record | 拒绝 → `TASK_REJECTED`，资产孤儿保留 |
| 12 | 写 `FINAL(SAVED)`（revision+2，快照 v2） | claim digest 未变、库 ref 仍匹配 | owner 文件 | 见 §7.3 writer 门禁 |
| 13 | post-final 联合确认 | 新读 owner + 库 | 仅内存 | 失败 → `lockStore`+`SAVE_UNKNOWN`，**不删资产** |
| 14 | 返回安全投影 | — | — | — |

### 6.2 两个线性化点（不可合并声明）

1. **Artifact 线性化点**：库 writer 的单次 `rename(temp → audio-artifacts-v1.json)`。
2. **Owner 线性化点**：owner writer 的单次 `rename(temp → fixture-task-owner-v1.json)`。

两次 rename **各自原子、跨文件非原子**。因此存在两个真实窗口：

- 资产已提交、owner 未提交：**孤儿资产**（owner 仍 `CLAIMED` 墓碑）。默认**不自动清理**。
- owner 已提交、确认读失败：资产与 FINAL 都可能已落盘，**保留**，返回 `SAVE_UNKNOWN`，`get` 报 `UNKNOWN`。

### 6.3 为什么不需要中间 phase / 第三文件 / lease

- 字节只在**同一次调用**的内存中从引擎交给库，库立刻做 owned copy 与重新 inspector；不存在
  “已知字节但未入库”的持久中间态需要表达；
- claim 墓碑已经表达“已尝试、不可重跑”；
- FINAL 的 `completion.kind=SAVED` + `record.outputArtifactRef` 已足以表达成功；
- 引入 lease/第三文件会新增第二权威与清理语义，且无法把两次 rename 变成原子，收益为负。

---

## 7. 队列、digest、锁与 writer 内闸门

### 7.1 取得顺序（唯一）

```text
owner queue (enqueue)
  └─ artifact queue (enqueueArtifact)        ← 只在第 8 步短暂持有
       └─ 库 writer: temp → fsync → rename → confirm
  └─ 返回 owner 队列继续 Task 迁移 / owner writer
```

- **Task → Artifact 单方向**：save 流程先持 owner 队列，再进入库队列；库内部不再回调 owner。
- **禁止反向获取**：库的任何路径不得调用 owner；owner 不得在持有库队列时再入 owner 队列。
- 同队列重入：`enqueue`/`enqueueArtifact` 都是串行 tail，**不得**在队列任务内再次入同一队列
  （现有实现也不允许），本文明确禁止。
- 库 `delete` 与 save 冲突由库队列串行化；删除发生在 save 之后时，语义见 §9。

### 7.2 锁域矩阵

| 事件 | 锁 owner 域 | 锁 artifact 域 | 新 handle 可见性 |
|---|---|---|---|
| owner `WRITE_UNKNOWN`（claim/final rename 已尝试或 post-final 失败） | **是**（`lockStore`） | 否 | 新 owner handle `OWNER_UNKNOWN` |
| 库 `WRITE_UNKNOWN`（import/delete rename 已尝试） | 否 | **是**（`lockArtifact`） | 新库 handle `LIBRARY_UNKNOWN` |
| 保存中库未知 | 否（claim 留墓碑） | 是 | owner `get` → `UNKNOWN`；库全锁 |
| 保存中 owner 未知 | 是 | 否（资产保留可读） | owner `OWNER_UNKNOWN`；库仍可按 rights 读 |
| 组合 | **不宣称跨域锁**；两域各自 fail-closed，绝不因一域锁而删除另一域数据 | | |

### 7.3 owner writer 内 pre/post-rename 门禁（新增，最小）

现 `writeOwner` 只有 `openOwnerFile(state).write(bytes, baseDigest, revision)`。候选实现需在
**同一次 write 调用内**增加两个固定检查点（不放 outer get）：

**pre-rename（写 temp、fsync 后、rename 前）**

1. 复核 capability/root/marker 与 base digest；
2. fresh 读出生登记，确认 `birthIdentityHash` 与 record 的 `taskId/observedAt` 未变；
3. fresh 读库包，按 `record.outputArtifactRef` 找到 `STORED` 条目，校验
   `scopeId`、`artifactIdentityHash`、`inspection.sha256`、`byteLength`、`expiresAt` 与本次 import 返回值一致；
4. 任一不符 → 放弃本次 rename，返回 `WRITE_REJECTED`（库资产保留、owner 仍 CLAIMED）。

**post-rename（rename 返回后、返回前）**

5. 重新读 owner 文件：新 bytes 的 digest、revision、entry `phase=FINAL`/`completion=SAVED`；
6. 重新读库包：ref 仍 `STORED`、identity/sha/长度一致、未过期（以 `now` 判定）；
7. 任一失败 → `lockStore` + `SAVE_UNKNOWN`，**不删除资产、不回滚、不重试**。

### 7.4 依赖拓扑与初始化

现依赖：`artifact-store → task-store`（`sha256`/`stableStringify`/capability 谓词）。
候选新增：`task-owner → artifact-library`（只读包校验）。合成 DAG：

```text
task-store  (no imports from owner/artifact)
   ↑                ↑
artifact-store   task-owner ──→ artifact-library ──→ artifact-store
```

- 无环：`task-store` 不 import 任何上层；`artifact-library` 只在运行时调用 `artifact-store`；
  `task-owner` 新增的是对 `artifact-library`/`artifact-store` 的**读取型**依赖。
- 初始化顺序：`task-store` → `artifact-store` → `artifact-library` → `task-owner`；均为 ESM
  顶层无副作用常量，不产生 TDZ 循环。
- 若实现时发现需要 `artifact-store` 反向读取 owner（例如按 taskId 查资产），**必须**改为在
  owner 侧做关联（不新增反向边）；本文禁止反向 import。
- 不向 store 开放 caller validator/回调；只新增固定私有 helper（`readStoredForSave`），
  不重构已验收的存储算法。

---

## 8. 异常 / 取消 / 读取矩阵（完整）

| # | 窗口/场景 | owner 文件事实 | 库文件事实 | engine | import | 锁 | 首次返回 | 后续 get | 清理/重试 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 输入/权利/过期拒绝（claim 前） | 无 entry | 无变化 | 0 | 0 | — | `INPUT_INVALID`/`RIGHTS_REJECTED`/`EXPIRED_REQUEST` | 原样 | 允许修正后重试 |
| 2 | claim rename 未知 | 可能已写 CLAIMED | 无变化 | 0 | 0 | owner | `WRITE_UNKNOWN` | `OWNER_UNKNOWN` | 不重试、不删 |
| 3 | claim 已确认、engine throw/坏 production | CLAIMED | 无变化 | 1 | 0 | — | `SAVE_UNKNOWN` | `UNKNOWN` | 不重跑 |
| 4 | 合法非 SUCCESS/源/准入/TTS 阻断 | CLAIMED | 无变化 | 1 | 0 | — | `TASK_REJECTED`（保留原因投影） | `UNKNOWN` | 不重跑；不写 FINAL |
| 5 | 库 import pre-commit 拒绝（KEY_CONFLICT/预算/rights/EXPIRED/EXISTING/DELETED） | CLAIMED | 旧包不变 | 1 | 1（被拒） | — | `ARTIFACT_REJECTED` | `UNKNOWN` | 不采用/不删除预存资产 |
| 6 | 库 import rename 已尝试/未知 | CLAIMED | 可能已存 | 1 | 1 | artifact | `ARTIFACT_UNKNOWN`（= `SAVE_UNKNOWN`） | `UNKNOWN` | 无第二提交；资产保留 |
| 7 | 新 STORED 已确认、owner FINAL 写前拒绝 | CLAIMED | 本次新资产已存 | 1 | 1 | — | `SAVE_UNKNOWN` 或 `ARTIFACT_REJECTED`（按阶段） | `UNKNOWN` | 孤儿保留（默认不清理） |
| 8 | owner temp/fsync 时库或出生被外改 | 旧 owner 不变 | 旧包不变（库写前已确认） | 1 | 1 | owner（若 rename 已试） | `WRITE_REJECTED` 或 `WRITE_UNKNOWN` | 视锁 | 不盲重试 |
| 9 | owner rename 后确认失败 | FINAL 可能已落盘 | 新资产已存 | 1 | 1 | owner | `SAVE_UNKNOWN` | `UNKNOWN` | 资产必须保留，不回滚 |
| 10 | 并发/多 handle/旧 run 交叉 | 同 Task 仅一条 claim | 同 `(scope,requestKey)` 仅一条 | ≤1 | ≤1 | 两域各自串行 | 后到者按已有 entry 分流 | — | 旧 FINAL/CLAIMED 不被接管 |
| 11 | 保存后删除/过期/权利撤销/库外改 | FINAL SAVED 不变（历史） | `DELETED`/`EXPIRED`/`STORE_CHANGED` | 0 | 0 | 视库错误 | `artifactStatus` 返回当前态 | `get` 仍 SAVED（历史） | 不把历史改成失败 |
| 12 | 保存中/后取消 | 无 cancel API | 无变化 | — | — | — | 明确 `NOT_SUPPORTED`（本阶段） | — | 不宣称支持 |

### 8.1 关于“保存后当前可用性”

`get` 无 `now`，只能回答**历史结论**（`FINAL(SAVED)`）。判断“现在还能不能读/试听”必须新增
只读投影（候选，非本 PR 实现）：

```js
handle.artifactStatus({ schemaVersion: 1, scopeId, taskId, now }) ->
  { state: 'READABLE' | 'EXPIRED' | 'DELETED' | 'MISSING' | 'UNKNOWN', artifactRef?, expiresAt?, messageZh }
```

- 只读：不写任何文件、不改 FINAL；
- 仍经库的 rights/expiry 门禁；
- 删除/过期是**当前可用性**，不回写 Task 历史。

### 8.2 取消

现有 owner 没有 cancel API；Fake 场景的 `CANCEL_REQUESTED`/`CANCELLED` 只是 engine 结果。
本候选**不支持**保存中取消：save 不引入取消检查点、不新增 cancel 方法。若未来要支持，需另立
正式计划，定义取消与 FINAL 写入的竞争窗口；在此之前文档明确“保存是不可中断的单次尝试”。

---

## 9. 删除、过期与孤儿策略

| 场景 | 规则 |
|---|---|
| 默认孤儿 | save 已产生新 STORED 但 owner 未 FINAL → **保留**，不自动清理 |
| 允许清理的唯一条件（若实现清理） | 仅本次事务新 `STORED`、owner 仍 `CLAIMED`、库可证明该 ref 的 `identityHash` 等于本次 import 返回、且 owner 未发生任何 rename 尝试；否则不删 |
| 未知即停 | 任一域 UNKNOWN / rename 已尝试 → **禁止删除**，只报告 |
| 用户主动删除 | 走库 `delete`（墓碑）；Task FINAL 不变，`artifactStatus` 报 `DELETED` |
| 过期 | 库 `EXPIRED`；Task FINAL 不变；`artifactStatus` 报 `EXPIRED` |
| 库外改 | `STORE_CHANGED`/`LIBRARY_UNKNOWN`；不自动修复、不重签 |

---

## 10. 分步实施白名单与 DoD

> 以下每一步都需要**后续独立正式计划**授权；本文不授权执行。

### 步骤 1：库只读关联 helper（最小拆分）

- 文件：`core/audio/fixture-artifact-store-internal.mjs`（新增私有 `readStoredForSave(state, scopeId, ref)`，只读、复用 `readArtifactPack`/`artifactIdentityHash`）。
- schema/API：无公开变化；不新导出给 caller。
- 停止点：只读 helper 单测（真实临时文件）。
- 证据：读到的 `STORED` 条目 identity/sha/长度与写入一致；`DELETED`/`EXPIRED`/缺失分别返回固定错误。
- 前置：无；后续：步骤 3 使用。

### 步骤 2：owner 快照 v2 与 completion SAVED

- 文件：`core/audio/fixture-task-store-internal.mjs`（entry 校验、completion 合法集、v1→v2 读取规则）、`core/audio/task-owner.mjs`（写入 v2）。
- schema：`schemaVersion=2`；`kind` 增加 `SAVED`。
- 停止点：v1 读兼容、v2 写入、旧代码读 v2 必须 `UNSUPPORTED_VERSION`。
- 证据：真实临时文件读写；v1 快照不被改写；v2 快照可读；未知版本拒绝。

### 步骤 3：owner `save` 事务主流程

- 文件：`core/audio/task-owner.mjs`（`save` 方法 + 严格 bytes 适配 + 库 import + Task 迁移 + FINAL）。
- 依赖：步骤 1/2；复用 `runExistingFixtureTaskBytesOnce`、`handle.import`、`transitionAudioTask`。
- 停止点：未接 GUI/CLI；只有内部 handle。
- 证据：真实临时目录下 1 次成功（PROCESSING→ARTIFACT_READY→SAVED、库 STORED、owner FINAL SAVED），重复 save → `EXISTING`。
- 故障：每个阶段注入一次真实失败，断言 §8 对应行。

### 步骤 4：writer 内 pre/post-rename 联合门禁

- 文件：`core/audio/task-owner.mjs`（或 task-store 的 owner writer 私有扩展）。
- 停止点：rename 前拒绝必须零 rename；rename 后失败必须锁 owner 且保留资产。
- 证据：真实 fs 故障注入（rename 抛错/确认读失败/库文件被替换）。

### 步骤 5：只读可用性投影与文案

- 文件：`core/audio/task-owner.mjs`（`artifactStatus`）。
- 停止点：只读，不写盘。
- 证据：SAVED→READABLE、删除→DELETED、过期→EXPIRED、库外改→UNKNOWN。

每步 DoD：真实依赖（真实临时文件/真实 validator）、每例先有成功控制、故障注入在真实
write/fsync/rename/确认点、断言磁盘事实与调用次数、跨 handle UNKNOWN 可见性；不以手造
`ok:true` 或“两次 rename 顺序”模拟原子性。

---

## 11. 威胁模型与未解决边界

- 信任边界：同进程、受信临时 sandbox capability；普通 JSON/SHA256/ref **不是认证 cap**；
  不承诺“同权限任意篡改运行时”或跨进程恢复。
- `SAVED` 只表示“演示资产已保存”，不表示真实生成、版权/人格权、微信发送或配置生效。
- 字节可变引用：库自有 owned copy 与重新 inspector 仍是唯一入库事实来源；save 回执不绕过
  `readBytes` 的 rights/expiry 门禁。
- 未解决（需另立计划）：真实 TTS/RVC、真实来源认证、GUI、投递、跨进程锁、取消 API。

---

## 12. 结论

本候选给出**唯一**可审路径：同一 owner claim 内，用一次 bytes 引擎、一次库 `FIXTURE_IMPORT`
（只认本次新 `STORED`）、原 `ATTACH_FAKE_ARTIFACT`/`MARK_SAVED`，再写严格 `FINAL(SAVED)`，
并以 writer 内 pre/post-rename 联合门禁与两域各自 UNKNOWN 锁保证失败语义。

**状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
后续实现须获独立正式计划；本文不是运行时代码授权。
