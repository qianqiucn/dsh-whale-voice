# TASK_CATALOG_OFFLINE — 隔离持久任务目录与幂等ID签发（Plan 08-D-A）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本模块 `core/audio/task-catalog.mjs` 只在既有信任机制创建的**临时隔离目录**内持久保存 AudioTask v1 的**初始记录**（`CREATED` / `BLOCKED_RIGHTS`），签发本目录内的 owner task id，并按 `(scopeId, idempotencyKey)` 阻止重复创建。

它不是持久执行器：**不运行 08-C/Provider/Fake，不推进 Task，不生成/保存音频，不创建 deliveryId/Relay 候选，不发送**。普通用户本轮没有新增可用功能或 GUI。

## 1. 公开面

模块恰好三个导出：

| 导出 | 说明 |
|---|---|
| `TASK_CATALOG_SCHEMA_VERSION` | 固定 `1` |
| `TASK_CATALOG_ERRORS` | 15 个固定错误码，每个值为 `TASK_CATALOG_` 加键名 |
| `openFixtureTaskCatalog(options)` | async 工厂；成功返回只含 `reserve` / `get` 两个 async 方法的冻结 handle |

`options` 恰 `{sandbox}`；`sandbox` 必须是原 `createConfigSandbox()` 返回、被原 `isTrustedSandbox` 认可的 capability。工厂不创建第二个 cap，不接受 root/路径/fs/adapter/callback 或 JSON 伪造 cap。

所有方法返回 JSON 信封，整图 fresh/deep-frozen。handle 不是 JSON 协议，不暴露 root、sandbox、record、索引、恢复或清理接口。

## 2. reserve 输入

根恰 5 键，全部必填：

```text
{schemaVersion:1, scopeId, idempotencyKey, draft, observedAt}
```

- `scopeId`：`/^scope:fixture-[A-Za-z0-9_-]{1,32}$/`；
- `idempotencyKey`：`/^key:fixture-[A-Za-z0-9_-]{1,48}$/`；
- `draft`：旧 AudioTaskDraft 去掉 `taskId` 后的七个允许字段：`schemaVersion, feature, taskType, source, voiceProfileId, deliveryRequested, rights`。除 `deliveryRequested` 沿旧合同可缺省 `false` 外，其余六项必填；`taskId`/deliveryId/发送参数/正文/预验结果等额外字段一律拒绝。
- `observedAt`：规范 UTC 时间。

处理顺序：先完整验证本次输入与 `observedAt`（用旧 `createAudioTaskRecord` + `validateAudioTaskRecord`，内部占位 taskId 绝不写盘/返回），**再查幂等键**。坏日期不能被旧幂等条目掩盖。

| 情形 | 结果 |
|---|---|
| 同一 `(scopeId, key)`、同一规范身份 | `EXISTING`：返回原 TaskId 与投影；首次 `observedAt` 与文件字节不变 |
| 同一 `(scopeId, key)`、身份不同 | `IDEMPOTENCY_CONFLICT`：不分配 ID、不写、不覆盖 |
| 相同身份、不同 key | 新显式创建请求，签发新 TaskId |
| 不同 scope、相同 key | 各自创建；`get` 跨 scope 统一 `NOT_FOUND` |

新 TaskId 由本 owner 用 `node:crypto.randomBytes(16)` 签发，格式严格 `task:fixture-` + 32 位小写 hex；对目录**全部 scope** 检查唯一，碰撞最多 3 次，仍重复则 `ID_COLLISION`。保证范围仅此目录，**不是跨独立目录/真实部署的全局唯一权威**。

## 3. get 输入

根恰 `{schemaVersion:1, scopeId, taskId}`；`taskId` 严格本 owner 格式。每次经同一队列重读/验证目录，按 `scopeId + taskId` 查找；跨 scope 与不存在统一返回 `NOT_FOUND`（不暴露“其他 scope 存在”）。成功 `outcome=FOUND`，只返回旧 `projectAudioTask` 投影。

## 4. 成功输出

reserve/get 统一 8 键：

```json
{
  "ok": true,
  "value": {
    "schemaVersion": 1,
    "outcome": "CREATED",
    "revision": 1,
    "task": { "…": "旧 projectAudioTask 安全投影" },
    "mockOnly": true,
    "realOperationAllowed": false,
    "submitAllowed": false,
    "automaticRetryAllowed": false
  }
}
```

`outcome` 仅 `CREATED` / `EXISTING` / `FOUND`；`revision` 是本次已读/已确认快照 revision。`task` 只含旧安全投影，不回显 scope/key/identityHash/正文/源引用/完整 record/机器路径。

## 5. 落盘 Schema

sandbox root 内唯一正式文件：**`audio-task-catalog-v1.json`**，UTF-8 无 BOM，最多 **128 KiB**、最多 **32 entries**。不溢出建第二文件、不删除旧条目腾键。原 config sandbox marker 不修改。

快照恰 `{schemaVersion:1, revision, entries}`；`revision` 为非负安全整数且严格等于 `entries.length`（仅追加创建）。初始文件不存在视作 revision 0 / entries []；工厂与 get 不创建空文件。已存在空文件不是“不存在”，必须 `STORE_INVALID`。

每个 entry 恰 `{scopeId, idempotencyKey, identityHash, record}`：

- `record` 为旧完整 16 字段 Task record，经原 `validateAudioTaskRecord`，且 `taskId` 必须严格匹配本 owner 的 `/^task:fixture-[0-9a-f]{32}$/`；
- 只允许初始 `CREATED` / `BLOCKED_RIGHTS`、无输出、cancel 两 false、delivery `NOT_REQUESTED/null`、lastError null；
- 用记录字段重建旧 draft 再 create 并严格核对规范 record；
- `identityHash = SHA256(JSON.stringify(identity))`，小写 64 hex；identity 固定为 `{schemaVersion, feature, taskType, source:{kind,ref}, voiceProfileId, deliveryRequested, rights:{state}}`，`observedAt/taskId/state` 不参与身份；
- 读盘逐条重算 hash，查重 taskId（跨 scope）与 `(scopeId,key)`；任何重复/坏 record/hash/未知键/坏 schema/超限整库拒绝，不选择性跳坏条目。

SHA256 仅用于规范身份比较/检测意外变化，**不是签名或防恶意篡改证明**。目录只持久引用/权利/初始记录与 fixture 键，无正文/manifest/请求/音频/凭据。

## 6. 同 cap 串行、路径安全与外改

模块级 WeakMap 以原 trusted capability 对象为键共享一个 Promise 队列，所有 `open/reserve/get`（含多个 handle）同队列串行；每次操作重读当前磁盘，不用 handle 旧缓存决定重复创建。

沿 config-store 原则做任务专属检查（不调用 ConfigStore）：

- 每个读写事务核 `isTrustedSandbox`、root/marker `lstat`/`realpath`、root 仍在原 `tempRoot`、marker 常规文件且 `kind/id` 匹配、root dev/ino 可用时一致；
- 正式/临时目标必须为 root 内常规文件，无 symlink/junction/目录/多硬链接（`nlink>1`）；禁止跟随目标链接；
- 所有读取走**真实 fd 有界读**：打开后 `fstat` 核对身份/长度，按固定缓冲分段 `readSync`，正式库最多实际读 **128 KiB+1**、marker 最多 **4 KiB+1**；禁止 `readFileSync` 或无界读取后再限长；严格 UTF-8 解码后 JSON 解析；
- 读事务结束（open/get/EXISTING）再核一次 root/marker 与目标身份；失败按 UNKNOWN 锁闭，不返回正常结果；
- 权限/不存在/链接/大小错误不把实际路径带出。

同 cap 首次合法读取建立原始文件摘要（或不存在标志）。后续内容**先做编码/JSON/完整 Schema/record/身份 hash 验证**：坏结构/编码/record 固定 `STORE_INVALID`、预算超限 `RESOURCE_LIMIT`；只有合法快照与已确认摘要不同才 `STORE_CHANGED`。后两者都会共享停止写入，不默默采用外部覆盖；提交前重读比较；同 cap 自己确认成功后才更新共享摘要。磁盘坏结构不自动修复或覆盖。

这里只保证本模块同 cap/同进程协作；**未实现跨进程锁/CAS/恢复**，不宣称抵抗同权限恶意进程的全部 TOCTOU 或 Windows 断电原子性。

### 6.1 提交、写入不确定与不重试

只有真正新键且校验全部通过才写。形成旧 entries + 一条的完整新快照；写前确认条目/字节预算。root 内独占 `wx` 创建随机模块生成的临时文件（`audio-task-catalog-v1.<32hex>.tmp`），**按 `fs.writeSync` 实际返回数循环续写直到严格写完**（正数短写续写；0/负数/非整数/超余量/抛错在 rename 前拒绝）；随后 fsync、关闭，再以有界 fd 读核对临时文件身份与完整字节，才进入 rename。rename 后再次核 root/marker、目标身份与完整回读，全部一致才返回 `CREATED`/更新共享确认摘要。不把 rename 成功、mtime、stat 或 JSON 能 parse 当确认写入。

临时文件清理只针对**本操作 `wx` 成功创建并取得 fd 身份**的同一常规文件：清理前重新核 root/身份/dev-ino/nlink/root 内；`EEXIST` 先存文件、被外部替换的文件都不得删除或提交；身份不可确认时保留并停止。未创建成功/未取得身份一律不 unlink。

未尝试 rename 时的安全分类：root/marker 失效 `SANDBOX_INVALID`、外改 `STORE_CHANGED`（锁闭）、坏库 `STORE_INVALID`、超限 `RESOURCE_LIMIT`；仅本操作临时文件创建/写/fsync/close 等普通 I/O 失败 → `WRITE_REJECTED`（不锁闭，可正常重试）。

rename **一旦尝试**后任何异常（rename 抛错、根/marker/目标身份、size、编码/Schema、摘要、close 或回读失败）→ `WRITE_UNKNOWN`，共享锁闭所有新 reserve；不自动回滚、覆盖、重新 rename、删除正式文件或重跑创建。之后 `reserve/get/open` 统一 `CATALOG_UNKNOWN`，不提供 clear/reset/recover 接口，新 handle 也不能绕过。分类优先级：rename 已尝试后，任何根身份/存储结构/摘要/回读失败均优先 `WRITE_UNKNOWN`。

成功 fsync+rename+回读也仅是隔离环境当前可确认保存，**不承诺目录 fsync/断电耐久性或“全部边界已验/原子安全”**；没有自动重试创建/恢复旧 UNKNOWN 执行。这里的 UNKNOWN 写入状态不是 `Task.state=UNKNOWN`。

## 7. TTS创建示例

以下为完整 `reserve` 五键输入（可直接 `JSON.parse`）：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-catalog",
  "idempotencyKey": "key:fixture-tts-1",
  "draft": {
    "schemaVersion": 1,
    "feature": "voice-bubbles",
    "taskType": "TTS",
    "source": {
      "kind": "TEXT_REF",
      "ref": "artifact:fixture-text-1"
    },
    "voiceProfileId": "voice:demo-hero",
    "deliveryRequested": false,
    "rights": {
      "state": "CONFIRMED_FIXTURE"
    }
  },
  "observedAt": "2026-10-27T00:00:00.000Z"
}
```

在可信临时 sandbox 中实际返回 `ok:true`、`outcome:"CREATED"`、`revision:1`、`task.state:"CREATED"`；同一输入再次 reserve 返回 `EXISTING` 与原 TaskId，文件字节不变。

## 8. SVC权利阻断示例

以下为完整 `reserve` 五键输入（同一 scope、不同 key，`rights.state="UNVERIFIED"`）：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-catalog",
  "idempotencyKey": "key:fixture-svc-1",
  "draft": {
    "schemaVersion": 1,
    "feature": "singing",
    "taskType": "SVC",
    "source": {
      "kind": "AUDIO_REF",
      "ref": "artifact:fixture-source-1"
    },
    "voiceProfileId": "voice:demo-hero",
    "deliveryRequested": false,
    "rights": {
      "state": "UNVERIFIED"
    }
  },
  "observedAt": "2026-10-27T00:00:00.000Z"
}
```

实际返回 `outcome:"CREATED"`、`task.state:"BLOCKED_RIGHTS"`；不 BEGIN、不执行、不投递。合法负向权利可以入库，但外层只表示“演示任务记录已保存，等待确认素材权利”，不是已生成/已保存/已发送。

## 9. 错误协议

15 个码，值均为 `TASK_CATALOG_` 加键名：

`INVALID_INPUT`、`RESOURCE_LIMIT`、`UNSUPPORTED_VERSION`、`SANDBOX_INVALID`、`DRAFT_REJECTED`、`STORE_INVALID`、`STORE_CHANGED`、`IDEMPOTENCY_CONFLICT`、`ID_COLLISION`、`NOT_FOUND`、`WRITE_REJECTED`、`WRITE_UNKNOWN`、`CATALOG_UNKNOWN`、`DEPENDENCY_FAILURE`、`INTERNAL_FAILURE`。

错误恰 `{ok:false, errors:[{code,path,reason}]}` 一项；`reason` 为枚举键小写、下划线换空格的固定短语；`path` 仅 `$`、`schemaVersion`、`scopeId`、`idempotencyKey`、`draft`、`observedAt`、`taskId`、`<unknown-key>`。复杂 I/O/内部异常不转发原异常、路径或堆栈。

## 10. 研发使用示例（不是普通用户流程）

```js
import { createConfigSandbox, removeConfigSandbox } from './core/config-sandbox.mjs'
import { openFixtureTaskCatalog } from './core/audio/task-catalog.mjs'

const sandbox = createConfigSandbox()
const opened = await openFixtureTaskCatalog({ sandbox })
if (opened.ok) {
  const created = await opened.value.reserve(ttsInput)
  const same = await opened.value.reserve(ttsInput) // EXISTING
  const found = await opened.value.get({
    schemaVersion: 1,
    scopeId: created.value.task.taskId ? 'scope:fixture-catalog' : 'scope:fixture-catalog',
    taskId: created.value.task.taskId,
  })
  const reopened = await openFixtureTaskCatalog({ sandbox }) // 同进程同 cap 重开
}
removeConfigSandbox(sandbox)
```

同一 Node 进程内可关闭 handle 后用原 cap 重开并读盘复用 ID；**新进程/序列化 cap 不能恢复旧目录**（config-sandbox 信任是模块私有 WeakSet）。

## 11. 未来故事板与三恢复

未来中文流程：“创建演示任务” → 页面显示“演示任务记录已保存”或“等待确认素材权利” → 再次相同请求显示原任务（不是重新执行成功）。本轮没有真实生成按钮，也没有新增可点击 GUI。

| 场景 | 用户文案 | 恢复 |
|---|---|---|
| 使用权未确认 | 演示任务记录已保存，等待确认素材权利。 | 返回选择合法材料；原阻断任务不自动重开 |
| 同键不同内容 | 请求内容已变化，请回到原任务或明确新建。 | 系统不自动换键、不覆盖 |
| 写入未知/目录变化 | 任务记录是否保存暂时无法确认，请先检查；系统不会自动重新创建。 | 保留目录、停止写，由未来可信恢复流程处理；不能让用户手改 JSON/删锁/复制命令解决正常操作 |

## 12. 限制与父阶段

- 同进程、同 cap 协作；无跨进程锁/CAS/恢复，无生产部署全局 ID 权威。
- 不执行 Task、不推进状态、不保存音频/成品、不投递/发送、不签发 deliveryId。
- 08-C 只公开安全投影；本目录不从投影还原 record，也不复制七场景状态机。
- 真实字节/成品保存删除、持久执行防重、跨进程恢复、队列资源运行、Cover、动态依赖、完整 Fake E2E、Relay/GUI 仍缺；父 Plan08 仍 IN_PROGRESS。

## 13. 测试与证据

行为测试位于 `test/task-catalog.test.mjs`，使用原 `createConfigSandbox()` 创建真实 OS 临时目录，覆盖 D01–D20：创建/幂等/冲突/scope 隔离、同 cap 并发、重开与伪造 cap、落盘 schema 与 owner ID、32 条与 128KiB 边界、ID 碰撞、路径/链接/标记拒绝、外改锁闭、写入顺序与 WRITE_REJECTED/WRITE_UNKNOWN 故障注入、getter/Proxy/复制预算、fresh/frozen、文档 JSON 原样执行等。测试结束只删除自己创建的已验证 sandbox。

故障注入只在测试进程内临时包装本任务使用的真实 `fs`/`crypto` 函数并在 finally 恢复，不修改公开 API、环境开关或生产目录；平台不支持的链接测试按实情 skip。实际执行计数与结果记录在交付报告与 CI 中，本文档不预填未经执行的通过数。
