# Whale Voice · 同一 claim 内的任务保存事务契约（候审）v1.1

> **状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
> 本文只是**候审技术契约**，不是已实现功能，也不构成运行时代码授权。仓库内现有程序仍只有
> owner 的 `run`/`get`（`SIMULATED`/`NO_EXECUTION`）与资产库的 `FIXTURE_IMPORT`；**没有任务保存能力**。
>
> 基准提交：`main` **M `08cf0b61acc402d619618df2ad15bce5436b0873`**（tree `7a6abf13…`）。
> `文件:行` 均指该提交实际源码；“当时实现”与“本文候选”严格分栏。v1.1 按 071 修订 R1–R3。

---

## 1. 目的、范围与非授权

同一 owner claim 内，把一次真实 Fake SUCCESS 得到的 `PROCESSING` 记录与 `SYNTHETIC_FIXTURE`
字节，经现有资产库 `FIXTURE_IMPORT` 保存为真实资产，并把 Task 迁到 `SAVED`、写入严格 `FINAL`。

不做：源码/测试/schema/config/CI/依赖/HostGUI 修改；`SAVED` 运行时实现；第三持久文件/中间 phase/
lease/第二 TaskId/DeliveryId/第二 owner/队列；真实生成或权利认证；跨进程锁承诺。

---

## 2. 现状证据（当时实现，M 实际行为）

### 2.1 owner 现状（`core/audio/task-owner.mjs`）

| 事实 | 出处 |
|---|---|
| `TASK_OWNER_SCHEMA_VERSION` 直接等于 `OWNER_SNAPSHOT_SCHEMA_VERSION`（请求版本与快照版本当前耦合） | `:56` |
| handle 冻结 `{run,get}`，全部经 `enqueue` 串行 | `:552-571` |
| `run` 输入四键 `{schemaVersion,scopeId,taskId,input}`；`get` 三键 | `:80-81` |
| 请求 `schemaVersion` 必须等于 `TASK_OWNER_SCHEMA_VERSION` | `:217` |
| 已 `FINAL` → `EXISTING`；已 `CLAIMED` → UNKNOWN 投影 | `:426-430` |
| `CLAIMED` 写 `revision+1`、`birthIdentityHash`、`record=birth.record`、`completion:null` | `:433-451` |
| engine 一次（旧入口）、`interpretEngine` 严格守卫 | `:462-474`、`:349-411` |
| `FINAL` 写 `revision+2`；`WRITE_UNKNOWN` 上抛、`WRITE_REJECTED` → `EXECUTION_UNKNOWN` | `:480-507` |
| FINAL 后 fresh 关联失败 → `lockStore` + `WRITE_UNKNOWN` | `:509-523` |
| `get` 无 `now`，只回答存储结论 | `:531-545` |
| 错误表 14 键、前缀 `TASK_OWNER_`；三种中文文案 | `:58-78`、`:108-112` |

### 2.2 owner 持久文件（`core/audio/fixture-task-store-internal.mjs`）

| 事实 | 出处 |
|---|---|
| 固定文件名 **`audio-task-owner-v1.json`**（**不是** `fixture-task-owner-v1.json`） | `:29` |
| 预算 `MAX_OWNER_BYTES = 128*1024`、`MAX_OWNER_ENTRIES = 32` | `:31`、`:33` |
| `SCOPE_PATTERN = ^scope:fixture-[A-Za-z0-9_-]{1,32}$`；**`TASK_ID_PATTERN = ^task:fixture-[0-9a-f]{32}$`**；catalog 幂等键 `^key:fixture-[A-Za-z0-9_-]{1,48}$` | `:43-45` |
| entry 六键 `{scopeId,taskId,birthIdentityHash,phase,record,completion}`；completion 仅 `{kind,reason}` | `:53-54` |
| **revision 不是 `.length`**：它是权重和 `weight`；解析时 `CLAIMED += 1`、`FINAL += 2`，末尾要求 `snapshot.revision === weight` | `:462-524` |
| 快照版本不匹配（`!== 1`）→ **`STORE_INVALID`**（不是 `UNSUPPORTED_VERSION`） | `:457` |
| `CLAIMED` 记录必须 `initialOnly` 且 `completion===null` | `:477-479` |
| `SIMULATED` FINAL 要求 `reason===null` 且终态属于 `{ARTIFACT_READY,FAILED,UNKNOWN,CANCEL_REQUESTED,CANCELLED}` | `:497-509` |
| `NO_EXECUTION` FINAL 要求 `reason` 属于四个固定原因且 record 保持出生原样 | `:511-522` |
| `identityOf` 不含 taskId/observedAt；`sameImmutable` 额外比较 taskId/observedAt | `:119-133`、`sameImmutable` |
| 共享 writer `write(bytes, baseDigest, expectedRevision)`：temp → 短写 → `fsyncSync` → 私有读回 → pre-rename `associationsGate` → 单次 `renameSync` → post-rename 身份/字节/Schema/关联确认；rename 前失败 `WRITE_REJECTED`，rename 已尝试后失败 `WRITE_UNKNOWN`+锁 | `:745-929`（fsync `:803`；pre `:882-885`；rename `:887-893`；post `:895-918`） |
| Task 域锁覆盖 **catalog + owner**（`getStoreState`/`lockStore` 共享） | `:135-155`、`:574`、`:603-604` |

### 2.3 engine 现状（`core/audio/task-fixture-engine-internal.mjs`）

| 事实 | 出处 |
|---|---|
| 第六导出 `runExistingFixtureTaskBytesOnce(frame)` 同步纯函数 | `:955` |
| 真实 Fake SUCCESS 后一次 producer、一次 `BEGIN_PROCESS` | `:711-744` |
| 成功返回 `PROCESSING`、`outputArtifactRef=null`、`hasOutput=false`、私有 `production` | 同上 |
| 不 ATTACH/SAVED/建 Task/写文件 | 同上 |
| 旧入口与 14 码不变 | `:791`、`:932`、`:56-58` |

### 2.4 资产库与 artifact store

`core/audio/artifact-library.mjs`

| 事实 | 出处 |
|---|---|
| **import 输入恰七键** `{schemaVersion,scopeId,requestKey,bytes,now,expiresAt,rights}` | `:102` |
| `rights` 两键；`PROOF_PATTERN = ^fixture-rights:[A-Za-z0-9:_-]{1,128}$`，并额外要求 `proofRef.length <= 128`；因此合法后缀实际 **≤113** 字符（前缀 `fixture-rights:` 15 字符） | `:105`、`:109`、`:306` |
| 时钟：`new Date(ms).toISOString() === value`，即**规范 `.sssZ`** | `:276-282` |
| import 只接受 `GRANTED` + 非空 proofRef；`DENIED/UNKNOWN` → `RIGHTS_REJECTED` | `:302-324` |
| `metadataOf(entry)` 返回 `artifactRef/scopeId/requestKey/origin/createdAt/expiresAt/rights/inspection`，**没有 `identityHash`** | `:361-371` |
| handle `import/get/readBytes/delete` 各自 `enqueueArtifact` | `:587-628` |

`core/audio/fixture-artifact-store-internal.mjs`

| 事实 | 出处 |
|---|---|
| 常量实际位置：`ARTIFACT_FILE_NAME='audio-artifacts-v1.json'`、schema 1、`origin='FIXTURE_IMPORT'`、pack 6 MiB、32 entries、item 1 MiB、decoded 4 MiB | `:40-46` |
| 唯一身份算法 `artifactIdentityHash(scopeId,requestKey,byteSha256,expiresAt,rights)` | `:106` |
| Artifact 独立队列 `enqueueArtifact`、digest、UNKNOWN 锁 `lockArtifact`/`isArtifactLocked` | `:125-155` |
| writer：独占 temp → fsync → 私有读回 → 单次 rename → post-rename 双重确认；rename 前 `WRITE_REJECTED`、已尝试后 `WRITE_UNKNOWN`+锁 | `:634-690` |
| 依赖：从 task-store import `StoreFailure/checkSandbox/isPlainObject/isStoreFailure/keySurface/raiseStore/sha256/stableStringify` | `:27-37` |

### 2.5 catalog 与 Task 合同

| 事实 | 出处 |
|---|---|
| catalog 唯一签发 TaskId，`reserve` 按 `(scope,idempotencyKey)` 幂等 | `task-catalog.mjs:195-236` |
| `ATTACH_FAKE_ARTIFACT` 仅 `PROCESSING` 且需 `artifactRef` → `ARTIFACT_READY` | `task-contract.mjs:620-628` |
| `MARK_SAVED` 仅 `ARTIFACT_READY` 且有 ref → `SAVED` | `:633-638` |
| `MARK_UNKNOWN` 仅 `PROCESSING`/`CANCEL_REQUESTED` | `:680-682` |

### 2.6 缺口

没有保存入口；没有 Task↔Artifact 可信绑定；没有跨域提交窗口；没有当前可用性；没有取消 API。

---

## 3. 唯一候选方案

**同一 claim 内：一次 bytes 引擎 → 一次库 import（非重入 primitive，持 Artifact 队列）→
`ATTACH_FAKE_ARTIFACT` → `MARK_SAVED` → 带证明的严格 `FINAL(SAVED)` → 联合确认 → 安全投影。**

- 合法非 SUCCESS/阻断**不**变成失败：与旧 owner 一致写 `SIMULATED`/`NO_EXECUTION` FINAL，不 import；
- 只有真实失败才返回错误；
- 不新增 Task 动作、库 origin 或存储。

---

## 4. 唯一 API

### 4.1 `handle.save(input)` — 八键

| 键 | 类型/规则 |
|---|---|
| `schemaVersion` | `1`（请求版本；与快照版本解耦） |
| `scopeId` | `^scope:fixture-[A-Za-z0-9_-]{1,32}$` |
| `taskId` | `^task:fixture-[0-9a-f]{32}$`（**必须是 catalog 出生登记的真实 taskId**） |
| `requestKey` | `^[A-Za-z0-9:_-]{1,64}$`（库 pattern；显式传入，不从 taskId 推导） |
| `now` | 规范 ISO `.sssZ` |
| `expiresAt` | 规范 ISO `.sssZ`，且 `> now` |
| `rights` | `{state:'GRANTED', proofRef:'fixture-rights:<≤113>'}` 恰两键 |
| `input` | 与现有 `run.input` **完全同构**的四键 `{schemaVersion:1, sourceInput, readiness, context}`，按原边界校验与预算；不接受 caller record/bytes/ref/adapter |

校验顺序：根形状/键 → `schemaVersion` → scope/taskId → requestKey/时间 → rights → `input` 两分区 copy
（`copyFixtureInput`）→ 与出生/当前 claim 的身份域比较。任一步失败不写盘、不调 engine/库。

`input` 不得由 owner 默认构造 READY/模型/场景/授权；缺失即 `INPUT_INVALID`。

### 4.2 `handle.artifactStatus(input)` — 五键只读

`{schemaVersion:1, scopeId, taskId, now, rights}`；`rights` 为**当前**声明（沿库 `readRights` 形状与
门禁），不得从库 entry 旧 `GRANTED` 冒充。

返回 `{ok:true,value:{schemaVersion,state,artifactRef,expiresAt,messageZh,...}}`，
`state ∈ {READABLE, EXPIRED, DELETED, MISSING, RIGHTS_REJECTED, UNKNOWN}`；库锁/外改/无 SAVED 历史
分别映射（见 §10）。只读：不写盘、不改 FINAL。

### 4.3 返回值（安全投影）

成功保存（本次）：

```json
{
  "ok": true,
  "value": {
    "schemaVersion": 1,
    "outcome": "SAVED",
    "revision": 2,
    "ownerState": "SAVED",
    "reason": null,
    "task": {
      "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
      "state": "SAVED",
      "hasOutput": true,
      "messageZh": "已保存到演示资产库；这不代表已经发送到微信。"
    },
    "artifact": {
      "artifactRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
      "byteLength": 88244,
      "sha256": "…64 lowercase hex…",
      "expiresAt": "2026-10-31T00:00:00.000Z"
    },
    "userMessageZh": "演示结果已保存到本地演示资产库；这不会发送到微信，也不代表真实生成。",
    "mockOnly": true,
    "realOperationAllowed": false,
    "submitAllowed": false,
    "automaticRetryAllowed": false
  }
}
```

其它结果：`outcome` 为 `EXISTING`（此前已 FINAL）、`SIMULATED`（合法非 SUCCESS 终态，未保存）、
`NO_EXECUTION`（合法阻断）。未知：`{ok:false,errors:[{code:'TASK_OWNER_SAVE_UNKNOWN',…}]}`。

### 4.4 最终错误表（完整 code / path / reason / 首错 / 后续）

前缀 `TASK_OWNER_SAVE_`；**不把 `SAVE_` 写进 key 造成双前缀**。

| key | 最终 code | path | 固定 reason | 首错 | 后续 run/get/save/status |
|---|---|---|---|---|---|
| `INPUT_INVALID` | `TASK_OWNER_SAVE_INPUT_INVALID` | 具体键或 `$` | `save input invalid` | 返回 | 不变；非持久 |
| `RIGHTS_REJECTED` | `TASK_OWNER_SAVE_RIGHTS_REJECTED` | `rights` | `save rights rejected` | 返回 | 不变 |
| `EXPIRED_REQUEST` | `TASK_OWNER_SAVE_EXPIRED_REQUEST` | `expiresAt` | `save request expired` | 返回 | 不变 |
| `PRECONDITION` | `TASK_OWNER_SAVE_PRECONDITION` | `$` | `save precondition failed` | 返回 | 不变 |
| `ARTIFACT_REJECTED` | `TASK_OWNER_SAVE_ARTIFACT_REJECTED` | `$` | `artifact import rejected` | 返回 | claim 墓碑 → `UNKNOWN` |
| `ARTIFACT_UNKNOWN` | `TASK_OWNER_SAVE_ARTIFACT_UNKNOWN` | `$` | `artifact import unknown` | 返回 | `UNKNOWN` |
| `TASK_REJECTED` | `TASK_OWNER_SAVE_TASK_REJECTED` | `$` | `task attach or save rejected` | 返回 | claim 墓碑 → `UNKNOWN` |
| `UNKNOWN` | `TASK_OWNER_SAVE_UNKNOWN` | `$` | `save outcome unknown` | 返回 | `UNKNOWN` |

继承错误单列：`SANDBOX_INVALID`、`INVALID_INPUT`（handle 形状）、`NOT_FOUND`、`BIRTH_INVALID`、
`STORE_INVALID`、`STORE_CHANGED`、`WRITE_REJECTED`、`WRITE_UNKNOWN`、`OWNER_UNKNOWN`、
`EXECUTION_UNKNOWN`、`DEPENDENCY_FAILURE`、`INTERNAL_FAILURE`、`RESOURCE_LIMIT`、`UNSUPPORTED_VERSION`
沿用 `TASK_OWNER_*` 语义；不把 `STORE_*` 通配符算作固定 save 码。

### 4.5 旧 `run`/`get` 遇新 `SAVED` 条目

- 新代码 `run`：`EXISTING`，`ownerState='SAVED'`，`task` 为 SAVED 投影，`reason=null`；
- 新代码 `get`：`FOUND`/`SAVED`；
- **不改**旧 `SIMULATED`/`NO_EXECUTION` 任务的既有返回；
- 旧二进制（M 版本）读 v2 快照会在 `:457` 抛 `STORE_INVALID`，不会把 SAVED 当 NO_EXECUTION、
  也不会降级重写；这是**旧程序实际行为**，不是候选错误码。

---

## 5. 持久 schema、revision 与兼容

### 5.1 entry

仍六键；`completion.kind` 增加 `'SAVED'`（`reason` 必须 `null`）；`record.state==='SAVED'`、
`outputArtifactRef` 为真实库 ref、`delivery.state='NOT_REQUESTED'`、`deliveryId=null`。

### 5.2 revision 权重（真实规则）

```text
revision = 1 × (CLAIMED 条目数) + 2 × (FINAL 条目数)
```

例：2 个 FINAL + 1 个 CLAIMED → revision 5；新增一条 SAVED FINAL → 7。
候选 SAVED FINAL 属于 FINAL，权重 2；不得写 `revision = entries.length`，也不得按 entry 序号递增。
上限仍 32 条、128 KiB。

### 5.3 版本解耦与升级

| 对象 | 当前 | 候选 |
|---|---|---|
| 请求 `schemaVersion`（run/get/save/status） | `1` | 仍 `1`（与快照解耦，新增 `TASK_OWNER_REQUEST_SCHEMA_VERSION`） |
| owner 快照 `schemaVersion` | `1` | 读 `1`、首次 SAVED 写 `2`；不改旧 entry 内容 |
| 库格式 | `1` | 不变 |

- 只读打开（工厂、`get`、`artifactStatus`、旧 `run` 读取）**绝不写盘、不迁移**；
- 首次保存升级：以同一事务重写全量 entries（旧条目内容与顺序保留、墓碑保留），revision 按 5.2 重算；
- 升级后新 `run` 创建其他任务必须继续写 **v2**，不得降回 v1、不得丢弃 SAVED 条目。

### 5.4 兼容矩阵（读写/错误/锁/是否写盘）

| 磁盘状态 | 新代码读 | 新代码写 | 旧二进制读 | 旧二进制写 | 锁 |
|---|---|---|---|---|---|
| v1 空 | OK | 首次 CLAIMED 写 v1 | OK | OK | — |
| v1 全 CLAIMED | OK | 追加；仍 v1 | OK | OK | — |
| v1 含 SIMULATED FINAL | OK | 追加；若含 SAVED 才升 v2 | OK | OK | — |
| v1 含 NO_EXECUTION FINAL | OK | 同上 | OK | OK | — |
| v2 含 SAVED | OK | 追加；保持 v2 | **STORE_INVALID** | 拒绝，不写 | 旧程序不锁（读取即失败） |
| v2 混合 | OK | 保持 v2 | STORE_INVALID | 拒绝 | — |
| 未知版本 3 | STORE_INVALID | 拒绝 | STORE_INVALID | 拒绝 | — |
| 合法外改（内容/哈希不符） | STORE_CHANGED + 锁 | 拒绝 | STORE_CHANGED | 拒绝 | Task 域 |
| 超预算（33 条/128 KiB+1） | RESOURCE_LIMIT | 拒绝 | RESOURCE_LIMIT | 拒绝 | — |
| 出生登记损坏/缺失 | BIRTH_INVALID/NOT_FOUND | 拒绝 | 同 | 同 | Task 域（BIRTH_INVALID 时锁） |

---

## 6. 私有证明对象（SaveProof）

### 6.1 结构（owner 内部，冻结，不持久、不进公开面）

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
  "birthIdentityHash": "…64hex…",
  "birthObservedAt": "2026-10-27T00:00:00.000Z",
  "claimDigest": "…64hex…",
  "claimRevision": 1,
  "recordIdentityHash": "…64hex…",
  "artifact": {
    "artifactRef": "artifact:fixture-bytes-…",
    "identityHash": "…64hex…",
    "byteSha256": "…64hex…",
    "byteLength": 88244,
    "expiresAt": "2026-10-31T00:00:00.000Z",
    "requestKey": "save:fixture-demo-1",
    "rights": { "state": "GRANTED", "proofRef": "fixture-rights:demo-1" }
  }
}
```

| 字段 | 权威来源 | 谁比较 |
|---|---|---|
| `birthIdentityHash`/`birthObservedAt` | catalog 出生条目 | writer pre/post 重新解析出生 |
| `claimDigest`/`claimRevision` | 已确认 CLAIMED 字节 | writer 的 base digest/revision |
| `recordIdentityHash` | `identityHashOf(begin 后 record)` | writer post 解析 FINAL record |
| `artifact.identityHash` | **`artifactIdentityHash(scopeId,requestKey,byteSha256,expiresAt,rights)` 按真实 STORED 元数据重算** | writer 与 fresh 库 entry 的同一算法结果比较 |
| `byteSha256/byteLength` | 本次 import 的 `inspection.sha256`/`metadataOf` | writer 与 fresh 库 entry |
| `expiresAt/requestKey/rights` | 本次请求与库 entry | writer 与 fresh 库 entry |

- **不假定** `metadataOf` 有 `identityHash`（它没有）；由 owner 用原算法重算；
- 证明是**一次调用的内存对象**，生命周期到 save 返回；不写入 entry、不跨进程承诺；
- 持久 `completion` 只保留 `{kind:'SAVED',reason:null}`；`record.outputArtifactRef` 保存 ref；
  其余（sha/长度/identity）由库权威存储承载，writer/后续读取按 ref 现算比较。

### 6.2 反例（必须拒绝）

- 同 `birthIdentityHash` 但 `taskId`/`observedAt` 与出生不符 → `PRECONDITION`/`BIRTH_INVALID`；
- claimDigest 与磁盘 CLAIMED 不符 → `STORE_CHANGED`；
- 库 ref 存在但 `byteSha256`/`byteLength`/`identityHash` 与本次证明不符 → `ARTIFACT_REJECTED`/`WRITE_REJECTED`；
- 同 requestKey 但库返回 `EXISTING`（非本次 STORED）→ `ARTIFACT_REJECTED`，不领养。

---

## 7. 唯一状态序列与线性化

| # | 动作 | 前置 | 持久/内存 | 失败 |
|---|---|---|---|---|
| 1 | 入队 + 能力/锁检查 | handle 可用 | 内存 | `OWNER_UNKNOWN`/`SANDBOX_INVALID` |
| 2 | 读/校验八键（含 input 两分区 copy） | 形状合法 | 内存 | `INPUT_INVALID` 等 |
| 3 | fresh 出生+关联 | birth 存在 | 内存 | `NOT_FOUND`/`BIRTH_INVALID` |
| 4 | 已有 entry 分流 | — | 内存 | FINAL→`EXISTING`；CLAIMED→`SAVE_UNKNOWN` |
| 5 | 写 CLAIMED（rev+1） | 无 entry | owner | `WRITE_REJECTED`/`WRITE_UNKNOWN` |
| 6 | claim 后 fresh 复核（digest/出生） | — | owner | `STORE_CHANGED`/`BIRTH_INVALID` |
| 7 | bytes 引擎一次 | claim 确认 | 内存 | 坏协议→`SAVE_UNKNOWN`；合法非 SUCCESS→写 FINAL(SIMULATED) 并返回 |
| 8 | 持 **Artifact 队列**，非重入 primitive import 一次 | 引擎 `PROCESSING` | 库 | 拒绝→`ARTIFACT_REJECTED`；未知→`ARTIFACT_UNKNOWN` |
| 9 | 由真实 STORED 元数据构造 SaveProof | import 成功 | 内存 | 构造不符→`ARTIFACT_REJECTED` |
| 10 | `ATTACH_FAKE_ARTIFACT(ref)` | `PROCESSING` | 内存 | `TASK_REJECTED` |
| 11 | `MARK_SAVED` + `validateAudioTaskRecord` | `ARTIFACT_READY`+ref | 内存 | `TASK_REJECTED` |
| 12 | 写 FINAL（rev+2，快照 v2，带 SaveProof） | 证明与库/出生仍符 | owner | pre-rename `WRITE_REJECTED`；post `WRITE_UNKNOWN` |
| 13 | 联合确认（fresh owner + fresh 库） | — | 内存 | 失败→锁+`SAVE_UNKNOWN`，资产保留 |
| 14 | 释放 Artifact 队列，返回安全投影 | — | — | — |

两个线性化点：库 rename、owner rename；**跨文件非原子**。第 8–13 步整段持有 Artifact 队列，
所以“import 后、FINAL 前被删除”的公开 delete 无法插入（见 §8.2）。

---

## 8. 队列、锁、writer 与依赖

### 8.1 取得顺序与重入

```text
Task 域队列 (enqueue)                       ← 全程持有
  └─ Artifact 队列 (enqueueArtifact)        ← 第 8–13 步持有
       └─ import primitive（不再次入队）
```

- 唯一方向 Task→Artifact；禁止反向获取；**持有 Artifact 队列期间不得调用 `handle.import`**
  （它会再次入同一队列），必须调用固定的非重入 primitive `importInQueue(state, request)`。
- 该 primitive 是库内部固定函数：同一 `importOnce` 实现、无回调参数、只在该队列内被 owner 调用；
  公开 `handle.import` 行为不变。

### 8.2 delete 插入窗口

公开 `delete` 也在 Artifact 队列排队，因此 save 的第 8–13 步期间它**等待**；save 释放后 delete
才执行——这是“保存完成后删除”，不是“保存中删除”。若 save 在 import 后失败（§9 行 7/9/10/11），
队列释放后 delete 可正常删除该新资产；owner 保持 CLAIMED 墓碑，不回滚、不重 import。
不制造第三队列，不宣称跨进程锁。

### 8.3 唯一 writer 归属

- **owner 文件唯一 writer 仍在 `fixture-task-store-internal.mjs` 的 `write()`**；不新写第二 writer、
  不用 outer get 替代 fsync 间隙门禁。
- 固定签名扩展（无回调）：

```js
write(bytes, baseDigest, expectedRevision, proof = null)
```

- `proof` 为 §6 的冻结对象或 `null`（旧调用不变）。非 `null` 时：
  - pre-rename（现 `:882-885` 之后、`:889` 之前）：解析 `bytes` → 校验 `record.outputArtifactRef` 与
    `proof.artifact.artifactRef` 一致 → 调 `readStoredForSave(state, scopeId, artifactRef)` 读 fresh 库
    entry → 用 `artifactIdentityHash` 重算并与 `proof.artifact.identityHash` 比较，比较 sha/长度/
    expiresAt/requestKey/rights → 任一不符 `WRITE_REJECTED`；
  - post-rename（现 `:895-918` 内、`:911` 关联门禁之后）：再读库与解析后的 FINAL，重复同一比较；
    失败 → `WRITE_UNKNOWN` + `lockStore`（资产保留）。

### 8.4 依赖拆分（无环）

当前 `artifact-store → task-store`（8 个公共工具，`:27-37`）。候选需 `task-store → artifact-store`
（读库校验），若直接加边会成环。因此提出**唯一最小拆分**：

- 新私有模块 `core/audio/fixture-store-base-internal.mjs`，导出：`StoreFailure`、`isStoreFailure`、
  `raiseStore`、`storeReason`、`sha256`、`stableStringify`、`isPlainObject`、`hasOwn`、`keySurface`、
  `checkSandbox`（即 artifact-store 现 import 的 8 项 + `storeReason`/`hasOwn`）；
- `fixture-task-store-internal.mjs` 与 `fixture-artifact-store-internal.mjs` 均改从 base import；
- `fixture-artifact-store-internal.mjs` 新增只读 `readStoredForSave(state, scopeId, artifactRef)`；
- `fixture-task-store-internal.mjs` 可安全 import 该 helper；
- 初始化顺序：`fixture-store-base-internal` → `fixture-artifact-store-internal` → `fixture-task-store-internal`
  → `task-owner`；ESM 顶层无副作用常量，无环、无 TDZ。
- DAG：

```text
fixture-store-base-internal
   ↑                     ↑
fixture-artifact-store  fixture-task-store
   ↑                         ↑
        task-owner ──────────┘
```

- 禁止把 caller validator/fs/路径/回调传进 store；`readStoredForSave` 是固定只读函数。

### 8.5 锁矩阵（Task 域 = catalog + owner）

| 事件 | Task 域（catalog+owner） | Artifact 域 | 可见性 |
|---|---|---|---|
| claim 前拒绝/输入错 | 无锁 | 无锁 | 全部正常 |
| claim rename 未知 | 锁 | 无锁 | 新旧 catalog/owner handle `*_UNKNOWN`；Artifact 正常 |
| owner pre-rename 拒绝 | 无锁 | 无锁 | 正常，资产保留 |
| owner post-rename/确认失败 | 锁 | 无锁 | Task 全 `UNKNOWN`；Artifact 正常 |
| 库 pre-commit 拒绝 | 无锁 | 无锁 | 正常（资产未写） |
| 库 rename 未知 | 无锁（claim 墓碑） | 锁 | owner `get`→`UNKNOWN`；库全 `LIBRARY_UNKNOWN` |
| 保存成功 | 无锁 | 无锁 | 正常 |
| BIRTH_INVALID（关联坏） | 锁（现行为） | 无锁 | Task 全 `UNKNOWN` |

不把 Task 锁改成仅 owner 锁；不制造跨域锁。

---

## 9. 异常矩阵（精确，无“或/按阶段”）

| # | 场景 | 落盘事实 | engine | import | 锁 | 首错 | 后续 run/get | 资产 |
|---|---|---|---|---|---|---|---|---|
| 1 | save 输入/权利/过期（claim 前） | 无 entry | 0 | 0 | — | `INPUT_INVALID`/`RIGHTS_REJECTED`/`EXPIRED_REQUEST` | 原样 | 无 |
| 2 | claim rename 未知 | 可能 CLAIMED | 0 | 0 | Task | `WRITE_UNKNOWN` | `UNKNOWN` | 无 |
| 3 | claim 已确认、engine 坏协议 | CLAIMED | 1 | 0 | — | `SAVE_UNKNOWN` | `UNKNOWN` | 无 |
| 4 | **合法非 SUCCESS**（OFFLINE/MODEL_MISSING/TIMEOUT/CANCEL_*/UNKNOWN） | FINAL `SIMULATED`（原终态） | 1 | 0 | — | `ok:true outcome=SIMULATED` | 正常读结论 | 无 |
| 5 | **合法阻断**（source/readiness/TTS/dispatch） | FINAL `NO_EXECUTION`（原原因） | 1 | 0 | — | `ok:true outcome=NO_EXECUTION` | 正常读结论 | 无 |
| 6 | 库 pre-commit 拒绝（KEY_CONFLICT/预算/权利/过期/EXISTING/DELETED） | CLAIMED | 1 | 1（被拒） | — | `ARTIFACT_REJECTED` | `UNKNOWN` | 旧包不变 |
| 7 | 库 rename 未知 | CLAIMED | 1 | 1 | Artifact | `ARTIFACT_UNKNOWN` | `UNKNOWN`；库锁 | 可能已存，保留 |
| 8 | 新 STORED 后 owner pre-rename 拒绝 | CLAIMED | 1 | 1 | — | `WRITE_REJECTED` | `UNKNOWN` | 孤儿保留 |
| 9 | Task ATTACH/MARK_SAVED/record 拒绝 | CLAIMED | 1 | 1 | — | `TASK_REJECTED` | `UNKNOWN` | 孤儿保留 |
| 10 | owner rename 后确认失败 | FINAL 可能已落盘 | 1 | 1 | Task | `SAVE_UNKNOWN` | `UNKNOWN` | 必须保留 |
| 11 | 并发/多 handle/旧 run 交叉 | 同 Task 一条 | ≤1 | ≤1 | 各自 | 后到按 entry 分流 | — | 旧 FINAL 不被接管 |
| 12 | 保存后删除/过期/撤权/库外改 | FINAL SAVED 不变 | 0 | 0 | 视库 | `artifactStatus` 当前态 | `get` 仍 SAVED | 历史不改 |
| 13 | 保存中/后取消 | 无 cancel API | — | — | — | `NOT_SUPPORTED` | — | — |

第 4/5 行即“旧结论兼容”：不把合法失败/取消/无执行当提交未知，也不 import。

---

## 10. 删除、过期、当前可用性

`artifactStatus` 映射：

| 库事实 | state | 是否 READABLE |
|---|---|---|
| `STORED` 且未过期且当前 rights GRANTED+proof 匹配 | `READABLE` | 是 |
| `DELETED`/`ALREADY_DELETED` | `DELETED` | 否 |
| `EXPIRED`（`now >= expiresAt`） | `EXPIRED` | 否 |
| 无该 ref/无 SAVED 历史 | `MISSING` | 否 |
| 当前 rights `DENIED`/`UNKNOWN`/proof 不符 | `RIGHTS_REJECTED` | 否 |
| 库锁/`STORE_CHANGED` | `UNKNOWN` | 否 |

- FINAL SAVED 是历史结论，`get` 不因后续删除/过期改状态；
- 不自动清孤儿；UNKNOWN 不删/不回滚/不重 import；不新增 cancel API。

---

## 11. 实施步骤（门禁前置）

> 每步需独立正式计划授权；本文只给白名单与依赖。

| 步 | 文件（唯一） | 内容 | 停止点/证据 |
|---|---|---|---|
| 1 | `core/audio/fixture-store-base-internal.mjs`（新）；`fixture-task-store-internal.mjs`、`fixture-artifact-store-internal.mjs`（改 import） | 公共工具拆分，保持行为 | 全量既有测试不变；无环 |
| 2 | `fixture-artifact-store-internal.mjs` | `readStoredForSave` 只读 helper | 真实临时包：STORED/DELETED/EXPIRED/缺失四态 |
| 3 | `fixture-task-store-internal.mjs` | owner 快照 v2、`SAVED` completion、revision 权重、proof 参数与 pre/post 门禁 | v1 读兼容；v2 写；pre/post 故障注入 |
| 4 | `task-owner.mjs` | `save` 八键、`artifactStatus`、SaveProof、旧 run/get 的 SAVED 分流 | 成功路径含完整门禁，不得先弱后强 |
| 5 | `test/task-owner-save.test.mjs`（新）；既有 `test/task-owner.test.mjs`（只读或最小补） | 真实 fs 故障设计（§12） | 每例成功控制+故障命中 |

步骤 3/4 的 proof 门禁必须与保存成功路径**同一步交付**，不得先放行弱保存。

---

## 12. 测试设计（真实检查点）

| 例 | 真实委托/注入点 | 判据 |
|---|---|---|
| 成功 | 真实 catalog/owner/library + 临时目录 | FINAL SAVED、库 STORED、revision 权重正确、重复 save→EXISTING |
| claim 后 engine 坏协议 | 包装真实 engine 一次成功后替换 | engine 1、import 0、CLAIMED、后续 UNKNOWN |
| 合法非 SUCCESS/阻断 | 真实场景 | FINAL SIMULATED/NO_EXECUTION、import 0 |
| 库拒绝 | 真实库 + 冲突 key/rights/expiry | 首错固定、无 FINAL、旧包不变 |
| 库 rename 未知 | 在库 writer `:889` 注入 | Artifact 锁、owner CLAIMED、无第二 import |
| owner pre-rename 拒绝 | task-store `:882-885` 后注入证明不符 | 零 rename、资产孤儿保留 |
| owner rename 未知 | `:889` 注入 | Task 锁、FINAL 字节保留、资产保留 |
| post-rename 确认失败 | `:895-918` 注入 | `SAVE_UNKNOWN`、不删除、不重试 |
| 并发 delete | import 后尝试 delete | 被 Artifact 队列阻塞；save 结束后才删除 |
| 旧 run 交叉 | 保存后旧 run | `EXISTING`/SAVED，不重跑 |

每例：真实成功控制、目标真实函数命中 1、磁盘 rename 0/1、handle 锁可见性、engine/import 计数。

---

## 13. 威胁模型与未解决

同进程受信 sandbox；JSON/SHA/ref/requestKey 不是认证 cap；不承诺跨进程恢复；`SAVED` 不代表真实生成、
版权或发送；字节读取仍走库 rights/expiry；真实 TTS/RVC、GUI、投递、取消 API 未解决。

---

## 14. 结论

v1.1 修正了 R1（revision 权重/旧 v2 `STORE_INVALID`/真实文件名与 pattern/库常量位置/七键 import 与 proof
长度）、R2（save 加 `input`、SaveProof 与真实身份来源、status 当前 rights、完整错误码/旧方法分流/完整
例子）、R3（唯一 writer 归属与 proof 参数、持 Artifact 队列的删除窗口、Task 域共享锁矩阵、门禁前置步骤）。

**状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
