# Plan08-E-B · 隔离 WAV 资产库原子存取与验证删除（内部文档）

**状态：`OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`。**

本模块是 Plan08 原规格中“音频字节持久资产”的**离线 Fixture 底座**：把一份人工构造的 WAV
字节原子写入一个固定单包，之后按库自己的引用做范围/声明权限/过期闸门下的读回与逻辑删除。
它不绑定 Task/owner，不推进 `MARK_SAVED`，不投递，不生成音频，也不代表真实用户授权。

## 1. 定位与边界

- **输入**：调用方提供的人工 WAV 字节（原生 `Uint8Array` / `Buffer`）。
- **存储**：只管理受信任 cap 根下的唯一文件 `audio-artifacts-v1.json` 及其自身生成的同前缀
  随机 `.tmp`；不读写旧 WAV、Task catalog、Task owner 或任何其他文件。
- **输出**：安全 metadata（E-A 的 19 键测量投影）与完全独立的可变字节副本；`origin` 固定
  `FIXTURE_IMPORT`，不会声称模型生成、旧 Fake 引用或 Task 已保存。
- **隔离**：同一 cap 的旧/新 handle 共享同一 Artifact 队列、confirmed digest 与 UNKNOWN 锁；
  Artifact 域故障不会锁定或改写 Task 域。**不承诺跨进程锁**，也不承诺抵抗被篡改的整个运行时。
- **删除**：只删除本库当前正式快照里的逻辑条目；**不是 OS 物理擦除**，不撤销此前已返回的
  副本，不删除其他 scope/key 的同内容资产或外部拷贝。

## 2. 公开面

`core/audio/artifact-library.mjs` 恰好导出四项：

| 导出 | 说明 |
|---|---|
| `ARTIFACT_LIBRARY_SCHEMA_VERSION` | 固定为 `1` |
| `ARTIFACT_LIBRARY_LIMITS` | 深冻结预算：`maxItemBytes` / `maxDecodedBytes` / `maxEntries` / `maxPackBytes` / `maxIdAttempts` |
| `ARTIFACT_LIBRARY_ERRORS` | 冻结错误表；每项为 `ARTIFACT_LIBRARY_<KEY>` |
| `openFixtureArtifactLibrary({ sandbox })` | async 工厂；成功返回冻结 `{ok:true,value:handle}` |

工厂的 options 只允许一个自有可枚举 data 字段 `sandbox`，其值必须是
`createConfigSandbox()` 注册过的 cap；传路径、URL、root 或伪造 JSON 一律 `SANDBOX_INVALID`。
工厂只验证当前 cap 与包，不会创建空文件。

handle 恰好四个 async 方法：`import`、`get`、`readBytes`、`delete`。

## 3. 请求合同

所有请求都必须带 `schemaVersion: 1`，且只允许下表字段；未知键、Symbol、隐藏键、getter、
非 data descriptor 一律 `INVALID_INPUT`，getter 不会被执行。所有固定 metadata 在**首个 await /
排队之前**同步读取并复制，排队后不再重读调用方对象。

| 方法 | 允许字段 | 成功 outcome |
|---|---|---|
| `import` | `schemaVersion, scopeId, requestKey, bytes, now, expiresAt, rights` | `STORED` / `EXISTING` / `DELETED` / `EXPIRED` |
| `get` | `schemaVersion, scopeId, artifactRef, now, rights` | `FOUND` / `NOT_FOUND` / `DELETED` / `EXPIRED` |
| `readBytes` | 同 `get` | 同 `get`，`FOUND` 时额外返回 `bytes` |
| `delete` | `schemaVersion, scopeId, artifactRef, now` | `DELETED` / `ALREADY_DELETED` / `NOT_FOUND` |

- `scopeId` / `requestKey`：1–64 个 ASCII `[A-Za-z0-9:_-]`。
- `artifactRef`：库自己签发的 `artifact:fixture-bytes-<32 位小写 hex>`，不接受调用方指定。
- `now` / `expiresAt`：必须能原样往返同一值的 UTC ISO 时间（如 `2026-10-29T00:00:00.000Z`）；
  `now` 是 Fixture 显式时间，不是可信生产时钟。
- `rights`：恰 `{ state, proofRef }`；`state` ∈ `GRANTED` / `DENIED` / `UNKNOWN`；`proofRef` 为
  `null` 或 `fixture-rights:` 前缀的安全标识（总长 ≤ 128）。**`import` 只接受 `GRANTED` 且
  `proofRef` 非空**，否则在读取/排队/写盘前就返回 `RIGHTS_REJECTED`。

## 4. 包格式、预算与事务

唯一正式包：

```json
{
  "schemaVersion": 1,
  "sandboxId": "<cap id，仅内部核验，绝不对外返回>",
  "revision": 1,
  "entries": [
    {
      "artifactRef": "artifact:fixture-bytes-<32hex>",
      "scopeId": "scope:fixture-demo",
      "requestKey": "key:fixture-demo-1",
      "identityHash": "<64hex>",
      "origin": "FIXTURE_IMPORT",
      "createdAt": "2026-10-29T00:00:00.000Z",
      "expiresAt": "2026-10-29T01:00:00.000Z",
      "rights": { "state": "GRANTED", "proofRef": "fixture-rights:demo-proof" },
      "inspection": { "schemaVersion": 1, "format": "WAV", "codec": "PCM_S16LE" },
      "payload": "<canonical base64>",
      "deletedAt": null
    }
  ]
}
```

（上例只截取 inspection 前三个键；真实条目含 E-A 的完整 19 键。）

- `revision = STORED 条数 + 2 × DELETED 条数`；每次首次导入或首次删除加 1，重复/查询/失败不变。
- 条目只能是 `STORED`（`payload` 为规范 base64，`deletedAt:null`）或 `DELETED` 墓碑
  （`payload:null`，`deletedAt` 为 UTC ISO）；墓碑保留引用/scope/key/导入身份与元信息，不允许
  在同 key 上复活。
- 写入前的读取是**有界严格读取**：UTF-8、`JSON.parse` 后与原文本完全一致的 canonical 往返
  （拒绝空白差异、重复键、键序变化、非规范转义）、精确 Schema、规范 base64，再对每个 payload
  解码并**真实调用 E-A 复验**，测量字段必须逐项一致；不能只信盘上的 hash 或扩展名。
- 每个条目的 `identityHash` 都由库用**同一个身份算法**重算核对（scope/key、`inspection.sha256`、
  `expiresAt`、`rights.state/proofRef`）；STORED 与 DELETED 都拒绝摘要与自身字段不一致的条目，
  固定 `STORE_INVALID`，不修复、不重写、不靠后来调用方输入补过。
- 写入是**单包原子替换**：校验 current digest → `wx/0600` 独占 tmp → 短写循环补全 → fsync →
  一次 close（不重试）→ tmp 回读全等 → 紧邻重核 cap 与 current digest → **rename 前再次核对
  已捕获 tmp 的可信路径、普通单链接、真实路径、dev/ino 与完整 bytes** → 一次 rename →
  回读身份/字节/Schema/revision 确认后才更新共享 confirmed digest。
- 最后一次 current 读之后、rename 之前若 tmp 被替换或内容不符，固定 `STORE_CHANGED` 并锁定
  Artifact 域：**零 rename、旧正式包字节不变**，该事务永久放弃清理这个不再归它所有的 tmp
  （不会在 finally 重新取得资格后删除它）。该 tmp 由本事务按已知 bytes 写入且原 bytes 已在
  6 MiB 包预算内，因此这次复核读到超限（例如被换成 6 MiB+1 的 foreign 文件）同样证明 tmp
  已变化，仍固定 `STORE_CHANGED`，而不是新用户请求/正式包预算错误 `RESOURCE_LIMIT`。
- rename 之前可确认的 write/fsync/close 失败为 `WRITE_REJECTED`：旧正式字节不变，不自动重试，
  只清理本事务已捕获 dev/ino 的自有 tmp（且只尝试一次）。rename 已尝试或提交后不能确认的
  结果为 `WRITE_UNKNOWN`：保留实际包/墓碑、不回滚、不补写，并锁定整个 Artifact 域；所有已存在
  handle 与新工厂此后固定 `LIBRARY_UNKNOWN`。
- 删除的提交后确认同样失败关闭：真实 delete rename 已完成且私有回读通过后，任何额外的公开
  回读/目标不可读确认异常都先锁定 Artifact 域并固定 `WRITE_UNKNOWN`，保留真实墓碑字节，
  不回滚、不重写、不重试；不会把所有提交前普通输入/读错误一律改成 UNKNOWN。

预算（独立于 E-A 的 50 MiB 检验上限，不表示生产长音频能力）：

| 预算 | 值 |
|---|---|
| 单项 WAV | ≤ 1,048,576 bytes |
| 所有 STORED 解码字节总量 | ≤ 4,194,304 bytes |
| 条目数（含 DELETED 墓碑） | ≤ 32 |
| 唯一 pack 完整 UTF-8 | ≤ 6,291,456 bytes |
| 引用签发碰撞尝试 | 最多 3 次，之后 `ID_COLLISION`，不落盘 |

## 5. 幂等、权限、过期与删除语义

- **导入身份** = 规范化 scope/key + 实际 owned bytes 的 SHA-256 + `expiresAt` + `rights`。
  同 `(scope,key)` 同身份、不同 `now` 的重放返回 `EXISTING`，不写盘、不改变 `createdAt`/引用/
  revision；身份不同返回 `KEY_CONFLICT`。匹配墓碑返回 `DELETED` 且不复活。
- 首次导入要求 `expiresAt > now`，否则 `EXPIRED`（零写）。已存 STORED 条目过期后同身份重放
  返回 `EXPIRED`，不续期。
- `get` / `readBytes` 每次使用本次 `now`：当前 `rights.state` 必须 `GRANTED` 且 `proofRef`
  与存储值一致，否则 `RIGHTS_REJECTED`，不返回 metadata/bytes；到期返回 `EXPIRED`，无 payload。
- 跨 scope 的 get/readBytes/delete 统一 `NOT_FOUND`，不回显存在性、原 scope、hash 或权利信息。
- `delete` 不因过期或当前权利撤销而阻止同 scope 清理；墓碑清理后重复 delete 返回
  `ALREADY_DELETED` 且不写盘、不增 revision。成功以新正式包回读通过、目标 `payload:null`、
  后续 get/readBytes 只能看到 `DELETED` 为准。
- 成功 `readBytes` 返回**全新、完全独立、可变**的 `Uint8Array`；信封与 metadata 冻结，但
  typed array 不冻结、不共享内部视图。修改返回字节或调用方原字节都不影响落盘、后续读或 hash。

## 6. 可原样执行的示例

在仓库根目录保存为任意 `.mjs` 文件后运行 `node <文件>`，或直接整段执行（`cwd` 必须是仓库根）。
脚本只使用系统临时目录中新创建的隔离 cap 和人工内存 WAV，结束时删除该 cap；最后一行输出为
JSON 摘要，可用于人工核对 `STORED → FOUND/bytes 相等 → 拒绝无权限导入 → DELETED → 再读仍
DELETED` 的完整链路。

```js
import { createConfigSandbox, removeConfigSandbox } from './core/config-sandbox.mjs'
import { openFixtureArtifactLibrary } from './core/audio/artifact-library.mjs'

function wav(frames = 16, rate = 16000, channels = 1) {
  const dataBytes = frames * channels * 2
  const bytes = Buffer.alloc(44 + dataBytes)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + dataBytes, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(channels, 22)
  bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * channels * 2, 28)
  bytes.writeUInt16LE(channels * 2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(dataBytes, 40)
  for (let index = 0; index < frames * channels; index += 1) {
    bytes.writeInt16LE(((index * 97) % 2000) - 1000, 44 + index * 2)
  }
  return bytes
}

const sandbox = createConfigSandbox()
try {
  const opened = await openFixtureArtifactLibrary({ sandbox })
  if (!opened.ok) throw new Error('open failed: ' + JSON.stringify(opened.errors))
  const library = opened.value
  const bytes = wav(16)
  const rights = { state: 'GRANTED', proofRef: 'fixture-rights:demo-proof' }
  const imported = await library.import({
    schemaVersion: 1,
    scopeId: 'scope:fixture-demo',
    requestKey: 'key:fixture-demo-1',
    bytes,
    now: '2026-10-29T00:00:00.000Z',
    expiresAt: '2026-10-29T01:00:00.000Z',
    rights,
  })
  if (!imported.ok) throw new Error('import failed: ' + JSON.stringify(imported.errors))
  const artifactRef = imported.value.artifact.artifactRef
  const readRequest = {
    schemaVersion: 1,
    scopeId: 'scope:fixture-demo',
    artifactRef,
    now: '2026-10-29T00:10:00.000Z',
    rights,
  }
  const found = await library.get(readRequest)
  const read = await library.readBytes(readRequest)
  const bytesMatch = read.ok && Buffer.compare(Buffer.from(read.value.bytes), bytes) === 0
  const denied = await library.import({
    schemaVersion: 1,
    scopeId: 'scope:fixture-demo',
    requestKey: 'key:fixture-demo-denied',
    bytes: wav(8),
    now: '2026-10-29T00:10:00.000Z',
    expiresAt: '2026-10-29T01:00:00.000Z',
    rights: { state: 'DENIED', proofRef: null },
  })
  const deleted = await library.delete({
    schemaVersion: 1,
    scopeId: 'scope:fixture-demo',
    artifactRef,
    now: '2026-10-29T00:20:00.000Z',
  })
  const afterDelete = await library.get(readRequest)
  console.log(JSON.stringify({
    outcome: imported.value.outcome,
    found: found.ok ? found.value.outcome : found.errors[0].code,
    bytesMatch,
    rightsRejected: denied.ok ? denied.value.outcome : denied.errors[0].code,
    deleted: deleted.ok ? deleted.value.outcome : deleted.errors[0].code,
    afterDelete: afterDelete.ok ? afterDelete.value.outcome : afterDelete.errors[0].code,
    revision: deleted.ok ? deleted.value.revision : null,
    mockOnly: imported.value.mockOnly,
    realOperationAllowed: imported.value.realOperationAllowed,
  }))
} finally {
  removeConfigSandbox(sandbox)
}
```

一次正常运行的摘要形如：

```json
{"outcome":"STORED","found":"FOUND","bytesMatch":true,"rightsRejected":"ARTIFACT_LIBRARY_RIGHTS_REJECTED","deleted":"DELETED","afterDelete":"DELETED","revision":2,"mockOnly":true,"realOperationAllowed":false}
```

## 7. 错误协议

固定前缀 `ARTIFACT_LIBRARY_`，固定 `errors: [{ code, path, reason }]` 一项，不回显原异常、堆栈、
用户值或私有字节；`path` 只可能是已知字段名、`$` 或 `<unknown-key>`。

| KEY | 触发场景 |
|---|---|
| `INVALID_INPUT` | 请求字段集合/类型/规范时间/pattern 不合法，或 getter/Symbol/隐藏键 |
| `UNSUPPORTED_VERSION` | `schemaVersion` 不是 1 |
| `INVALID_BYTES` | `bytes` 不是真实可用的 `Uint8Array` 视图（Proxy/伪造/分离/resizable/Shared/DataView/其他 typed array） |
| `INVALID_WAV` | E-A 拒绝的 WAV 载体/格式/PCM 结构 |
| `RESOURCE_LIMIT` | 用户单项/总量/条目数或正式 pack 大小超预算（最后 tmp 复核的超限按 `STORE_CHANGED`） |
| `SANDBOX_INVALID` | cap 不可信、root/marker 变化或清理信任失败 |
| `STORE_INVALID` | 包不是合法 canonical 快照，或 payload/测量/身份不一致 |
| `STORE_CHANGED` | 已确认的包被外部改写/删除/替换 |
| `KEY_CONFLICT` | 同 `(scope,key)` 已存不同导入身份 |
| `RIGHTS_REJECTED` | 导入非 `GRANTED`，或读取时当前权利不足/不符 |
| `EXPIRED` | 首次导入过期，或已存条目的读取/重放已过期 |
| `ID_COLLISION` | 3 次随机引用全部与现有引用冲突 |
| `WRITE_REJECTED` | rename 前可确认的 write/fsync/close 失败；旧字节不变，不自动重试 |
| `WRITE_UNKNOWN` | rename 已尝试/提交后无法确认；保留实际包并锁定 Artifact 域 |
| `LIBRARY_UNKNOWN` | 已锁定域的后续调用；不读写、不恢复、不重试 |
| `INTERNAL_FAILURE` | 内部实现失败（不泄露细节） |

WAV 错误到本库错误的映射是固定的：`INVALID_BYTES→INVALID_BYTES`、
`RESOURCE_LIMIT→RESOURCE_LIMIT`、`UNSUPPORTED_VERSION→UNSUPPORTED_VERSION`、
`INVALID_INPUT→INVALID_INPUT`、`UNSUPPORTED_FORMAT/INVALID_CONTAINER/INVALID_PCM→INVALID_WAV`、
`INTERNAL_FAILURE→INTERNAL_FAILURE`。

## 8. 未测试与未声明

- 没有真实 producer、Task 保存/权威 ownership 关联、`MARK_SAVED`、deliveryId、Relay 或发送。
- 没有真实用户认证/授权或 Host 路由；scope/rights 只是 cap 内的 Fixture 声明。
- 没有跨进程锁、崩溃恢复、物理擦除、全盘清理、旧音频目录扫描或迁移。
- 没有下载/读取真实媒体、模型、GPU、设备、录音或播放。
- 未覆盖任意 Proxy trap、被篡改运行时或全部同权限 TOCTOU；不承诺这些场景下的隔离。

## 9. 本地验证

```powershell
node --check core/audio/artifact-library.mjs
node --check core/audio/fixture-artifact-store-internal.mjs
node --test test/artifact-library.test.mjs
```

L01–L11 共 22 项测试（本机 21 pass / 1 platform skip / 0 fail；skip 为当前 Windows 账户禁止创建
符号链接，属明确平台限制而非产品通过）覆盖：真实存取与重开、幂等/碰撞/并发、入队前快照与原生
载体、scope/权限/过期、验证删除与旧包恢复拒绝、坏包与 canonical/padbits/身份关联校验、三项预算
与 pack 有界读、提交前短写/写/fsync/close 故障、**最后 current 读后 tmp 被替换 → STORE_CHANGED
+ 零 rename + 旧包保留 + foreign tmp 不清理**（同一替换 hook 另含一个 6 MiB+1 的 foreign tmp
代表：首错固定 `STORE_CHANGED`/`$`、命中 1 次、tmp 身份不同、正式 rename 0、旧 pack 字节不变、
foreign 内容/长度不变、旧 handle 与新工厂 `LIBRARY_UNKNOWN`）、rename 后 UNKNOWN（导入与删除
两条路径）、
**删除提交后公开额外确认故障 → WRITE_UNKNOWN + 全 handle 锁**、cap/marker/硬链接/符号链接
（平台不支持时显式 skip）/清理信任失败以及 Task 域隔离。全量回归、build、语法与 client 同步由
仓库常规命令另行执行。

## 10. 与 Task 保存候选契约的关系（PLANNED）

同一 claim 保存事务的候选契约见
[TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md](TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md) v1.3
（`PLANNED` / `DESIGN_REVIEW_REQUIRED`，运行时未实现）。

- 本文的库合同**不变**：唯一 import 实现（七键输入）、`origin: FIXTURE_IMPORT`、`(scope, requestKey)` 幂等、
  入队前 owned copy、重新 inspector、原子包写入与墓碑删除。
- **导入身份 ≠ Task 关联**：`artifactIdentityHash(scopeId, requestKey, byteSha256, expiresAt, rights)`
  只覆盖这些字段，不含 taskId 或 claim；同字节或同 requestKey 都不证明任何 Task ownership。
- 候选方案只在 owner 侧用 `record.outputArtifactRef` + 库权威读取（`readStoredForSave`）建立关联；
  库不新增 Task 字段、不新增 origin、不反向依赖 owner。
