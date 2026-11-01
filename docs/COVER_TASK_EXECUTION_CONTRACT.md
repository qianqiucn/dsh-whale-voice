# Whale Voice · Cover 执行与 StageArtifact 事务契约（候选）

**状态：`CONTRACT_CANDIDATE` / `PLANNED_RUNTIME` / `NOT_IMPLEMENTED` / `FIXTURE_ONLY` / `NOT_INTEGRATED`。**

本文件是 Plan 08-F-B 的唯一设计合同候选：它把「同一 claim 内完成一次 Cover 执行并只保存一个 MASTER」所需的身份、出生原子性、执行 API、Intent、真实源字节与派生谱系、StageArtifact、阶段字节算法、事务/队列/租约、取消、预算、版本兼容和未来实施表一次定清。**其中所有 FUTURE 标记的 API、实体、流程、字段和伪码都尚未实现**；本文件不授权实现，也不构成运行时能力或真实分离/转换/混音/保存/发送证据。合入本文件不代表任何阶段已经运行。

- 现行事实基线：`main` M `c5c3a7e363c11b5e4aefbcf4c88d7fcea378e8d3`（tree `49bd24dfce4c59a8fb66c866576a5d35fd6faab1`），即 087 纯计划器已合入的 main。
- 冻结保存契约：`docs/TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md` v1.6，blob `d02a809702b06e6afd8a3f126b0458d3fa110d27`，本文件只读引用、不修改。
- 规划来源：PR17 规划对象 `c9d92d2735b01e2ee31c84d4f0f2aad9b5c6158b`（未合入 main，不代表已实现）；本文件不修改 PR17。
- 本文件不含真实歌曲、真实音色、真实模型文件、凭据或私人数据；所有示例均为明示虚构 Fixture。

---

## 1. 分层与阅读规则

| 标记 | 含义 |
|---|---|
| **CURRENT** | 已存在于 M 的行为/字段，来源可定位到 `core/audio/*` 与 v1.6 契约；本文件不改写它们 |
| **FUTURE** | 本文件规定的未来实现；当前无代码、无测试、无运行时效果 |
| **NOT_IMPLEMENTED** | 明确没有实现，不得在状态页/报告/PR 中当作已完成 |
| **N/A** | 按本文件的实现边界不适用，附理由 |

阅读规则：
1. 任何 FUTURE 字段/API/状态都不得在未落地时用于对外展示“可用”。
2. 本文件与 M 源码冲突时，以 M 源码为 CURRENT 事实，并在 §14 记录精确冲突与最小停依赖。
3. 本文件的 JSON 示例全部是虚构数据；`NOT_IMPLEMENTED` 示例不能被当作 API 已运行。

---

## 2. CURRENT：M 的实际形状与限制

### 2.1 公开能力（CURRENT）

| 模块 | 导出/方法 | 关键限制 |
|---|---|---|
| `core/audio/task-catalog.mjs` | `openFixtureTaskCatalog({sandbox})` → `{reserve, get}` | 唯一 TaskId 签发者；`reserve` 输入 5 键 `schemaVersion/scopeId/idempotencyKey/draft/observedAt`；`get` 输入 3 键；15 个 `TASK_CATALOG_` 错误码；磁盘 `audio-task-catalog-v1.json`，快照 `{schemaVersion, revision, entries}`，当前只接受 `schemaVersion:1` |
| `core/audio/task-owner.mjs` | `openFixtureTaskOwner({sandbox})` → `{run, get, save, artifactStatus}` | 公开 owner schema 恒 1；磁盘 owner 快照 v1（仅 CLAIMED/FINAL 非 SAVED）或 v2（含 SAVED FINAL）；22 个 `TASK_OWNER_` 错误码 |
| `core/audio/artifact-library.mjs` | `openFixtureArtifactLibrary({sandbox})` → `{import, get, readBytes, delete}` | 16 个 `ARTIFACT_LIBRARY_` 错误码；单项 1,048,576 B、解码总量 4,194,304 B、条目 32、pack 6,291,456 B |
| `core/audio/fixture-wav-producer.mjs` | 4 导出（schema/limits/errors/`produceFixtureWav`） | 合成 PCM16 fixture，仅 SILENCE / EDGE_SEQUENCE |
| `core/audio/wav-byte-inspector.mjs` | 4 导出（schema/limits/errors/`inspectFixtureWavBytes`） | 只读检查；50 MiB / 300000 ms / 128 chunks |
| `core/audio/source-artifacts.mjs` | `resolveFixtureTaskSource(input)` | 输入 4 键 `schemaVersion/voiceBinding/artifactLibrary/sourceRevision`；成功 value 恰 10 键；失败 root 恰 `{ok:false,errors:[{code,path,reason}]}` |
| `core/audio/voice-assets.mjs` | `resolveFixtureVoiceBinding(input)` | 返回 binding value 恰 13 键；`binding` 内恰 8 键 |
| `core/audio/cover-plan.mjs` | `planFixtureCover(payload)` | 纯规划；PLANNED/BLOCKED、15 键 value、`taskAuthority:'UNVERIFIED'`、`outputArtifactRef:null`；**不是执行入口** |

### 2.2 CURRENT 形状（字段集合以 M parser 为准）

| 形状 | 恰键 |
|---|---|
| Task v1 record（16 键） | `schemaVersion, taskId, feature, taskType, source, voiceProfileId, deliveryRequested, rights, state, outputArtifactRef, cancel, delivery, lastError, observedAt, mockOnly, realOperationAllowed` |
| catalog 快照（3 键） | `schemaVersion, revision, entries` |
| catalog entry（4 键） | `scopeId, idempotencyKey, identityHash, record` |
| owner 快照（3 键） | `schemaVersion, revision, entries` |
| owner entry（6 键） | `scopeId, taskId, birthIdentityHash, phase, record, completion` |
| `identityHashOf(record)` | `sha256(JSON.stringify({schemaVersion, feature, taskType, source:{kind,ref}, voiceProfileId, deliveryRequested, rights:{state}}))`，UTF-8；不含配方/pitch/模型修订 |
| 公有 Artifact metadata（8 键） | `artifactRef, scopeId, requestKey, origin, createdAt, expiresAt, rights, inspection` |
| 私有 SaveProof.artifact（8 键） | `artifactRef, identityHash, byteSha256, byteLength, expiresAt, requestKey, rights, inspection` |
| SaveProof root（11 键） | `schemaVersion, scopeId, taskId, birthIdentityHash, birthObservedAt, claimRevision, claimDigest, candidateRevision, recordIdentityHash, artifact, evaluatedAt` |
| WAV inspection（19 键） | `schemaVersion, format, codec, bitsPerSample, sampleRate, channels, byteLength, dataByteLength, frameCount, durationMs, peak, fullScaleSampleCount, sha256, validationState, mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed, messageZh` |
| canonical pack entry（11 键） | `artifactRef, scopeId, requestKey, identityHash, origin, createdAt, expiresAt, rights, inspection, payload, deletedAt` |
| Artifact pack v1 root（4 键） | `schemaVersion, sandboxId, revision, entries` |

### 2.3 CURRENT 队列/锁事实（M 实测来源）

- `STATES = new WeakMap()`，按 sandbox capability 建 state；`state {sandbox, tail: Promise.resolve(), locked, files}`。
- `enqueue(state, run)` 把任务串到 `state.tail`；catalog 与 owner **共享同一 capability 写队列**，**不是按 taskId 的独立队列**。
- Artifact 有独立队列；跨域操作按固定顺序 Task→Artifact，不反向持锁。
- `locked` 为 capability 级 unknown 锁：一旦不确定，该 capability 的 owner/catalog 操作全部 fail-closed。

### 2.4 CURRENT 身份/容量事实

- catalog 出生 `identityHash` 只覆盖 §2.2 的 8 个 identity 字段；**不含 pitch、模型修订、layout、separation、mix 配置**，所以 `EXISTING` 不证明 Cover 选项相同。
- `task.source` 在出生后不可变；旧 voice resolver 要求 Provider 源 ref 与父 source 同 ref。
- legacy `save` 硬绑定唯一 bytes engine（会再跑一次 RVC）；`run` 一旦 FINAL 不能“续存”。
- owner 文件上限 131,072 B / 32 条；Artifact 单项 1,048,576 B；解码总量 4,194,304 B；pack 6,291,456 B。
- 44,100 Hz mono、1,048,576 B 上限下最多 **524,266 帧 ≈ 11,888.1179 ms**；stereo 为 262,133 帧。

---

## 3. FUTURE：身份模型（唯一选择）

### 3.1 唯一机制

**Cover 是原父 AudioTask v1（`feature:'singing'`, `taskType:'SVC'`）的版本化 intent，不是新的主 taskType、不是第二 TaskManager、不新签主 TaskId/DeliveryId。**

- 唯一主 ID 仍由 catalog allocator 签发。
- Intent 必须在**出生写入的同一个快照提交**里原子绑定；任何 legacy 执行入口（旧 `run`/旧 `save`）在 Cover 出生上必须 0 执行、0 改盘。
- 采用**同 catalog 私有的 typed entry**：catalog 快照新增 `schemaVersion:3`，entry 分为 legacy（§2.2 4 键）与 cover（9 键）。公开 schema 1 / Task v1 / Artifact pack v1 均不偷加字段。
- owner 采用**显式 Cover 新 variant**：owner 快照 `schemaVersion:3`，entry 分为 legacy（6 键）与 cover（14 键，见 §6.2）。旧 v1.6 SaveProof root11/artifact8 **不变**；Cover 额外绑定放在同 writer 的新第 5 参数 `coverAttachment`（7 键，见 §6.5）。
- 不设第二 authority/store/writer；所有持久写仍由 `openOwnerFile(...).write` / catalog writer 的同一实现完成。

### 3.2 catalog 快照 v3（FUTURE）

```json
{
  "schemaVersion": 3,
  "revision": 3,
  "entries": [
    {
      "entryVersion": 1,
      "kind": "COVER",
      "scopeId": "scope:fixture-demo",
      "idempotencyKey": "cover:fixture-demo-1",
      "identityHash": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      "intentHash": "0f3c09358d4e2e7c28de3d8c2a9ca828e6271a0a3fdfd08372a2434a44cb9983",
      "intent": {
        "intentVersion": 1,
        "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
        "scopeId": "scope:fixture-demo",
        "birthIdentityHash": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
        "birthObservedAt": "2026-11-01T00:00:00.000Z",
        "sourceRef": "artifact:fixture-source-1",
        "sourceEntryIdentityHash": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
        "sourceByteSha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
        "sourceByteLength": 88244,
        "sourceRevision": 1,
        "rightsState": "CONFIRMED_FIXTURE",
        "rightsProofRef": "fixture-rights:cover-demo-1",
        "rightsExpiresAt": null,
        "voiceProfileId": "voice:demo-hero",
        "profileRevision": 1,
        "modelAssetId": "asset:fixture-model-a",
        "modelRevision": 1,
        "modelIntegrityTruth": "DECLARED_FIXTURE",
        "instanceId": "instance:rvc",
        "candidateId": "rvc",
        "modelRef": "rvc-model:fixture-a",
        "backendRevision": 1,
        "pitchShift": 0,
        "recipe": {
          "sourceLayout": "MIXED",
          "separationPreset": "FIXTURE_TWO_STEM",
          "mixMode": "WITH_INSTRUMENTAL",
          "vocalGainDb": 0,
          "instrumentalGainDb": 0
        },
        "outputProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 }
      },
      "record": {
        "schemaVersion": 1,
        "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
        "feature": "singing",
        "taskType": "SVC",
        "source": { "kind": "AUDIO_REF", "ref": "artifact:fixture-source-1" },
        "voiceProfileId": "voice:demo-hero",
        "deliveryRequested": false,
        "rights": { "state": "CONFIRMED_FIXTURE" },
        "state": "CREATED",
        "outputArtifactRef": null,
        "cancel": { "requested": false, "confirmed": false },
        "delivery": { "state": "NOT_REQUESTED", "deliveryId": null },
        "lastError": null,
        "observedAt": "2026-11-01T00:00:00.000Z",
        "mockOnly": true,
        "realOperationAllowed": false
      },
      "createdAt": "2026-11-01T00:00:00.000Z"
    }
  ]
}
```

Cover catalog entry 恰 9 键：`entryVersion, kind, scopeId, idempotencyKey, identityHash, intentHash, intent, record, createdAt`。`kind` 恒 `"COVER"`；`identityHash` 用 M 原算法对 `record` 计算；`intentHash` 见 §4.3。

### 3.3 出生原子性规则（FUTURE）

1. `reserve` 的 Cover 变体（request 6 键：`schemaVersion:3, scopeId, idempotencyKey, intentDraft, observedAt, rights`）在内存中一次性构造 `intent`、`record`、`entry`；**单次 temp+fsync+单次 rename** 写入完整 v3 快照。任一校验失败不落盘。
2. legacy 快照（v1）与 Cover 快照（v3）互斥升级：首次出现 Cover entry 即写 v3；之后允许 legacy entry 与 Cover entry 混合（新 legacy 出生也写进 v3 快照的 legacy 形状 entry）。**不自动迁移**已有 v1 快照，直到发生下一次 Cover 出生。
3. 旧程序遇 `schemaVersion:3` → 现有 parser 拒绝 `STORE_INVALID`，**fail-closed**；不提供 permissive fallback。
4. 已存在的 legacy 出生不可被“就地升级”为 Cover（`task.source`/identity 不含 intent）；需要 Cover 的用户必须**新建 Cover 出生**（新 taskId/新 idempotencyKey），旧出生保持 legacy 语义。
5. 同一 `idempotencyKey` 的冲突矩阵见 §3.4。

### 3.4 同键冲突矩阵（FUTURE）

| 已有 entry \ 新请求 | 完全同 Intent | 差 Intent | 新请求为 legacy |
|---|---|---|---|
| legacy 出生（同 key） | `IDEMPOTENCY_CONFLICT`（legacy 与 Cover 不同身份） | 同左 | `EXISTING`（原 legacy 行为） |
| Cover 出生（同 key） | `EXISTING` + 原 `intentHash`/`record`，**0 新执行** | `COVER_INTENT_CONFLICT`（`TASK_CATALOG_` 域），0 新执行、不改盘 | `IDEMPOTENCY_CONFLICT` |
| 无 entry | 正常出生 | 正常出生 | 正常 legacy 出生 |

- crash/rename 不确定：与原 catalog 一致 → `CATALOG_UNKNOWN`、capability 锁；不自动重试、不换 key/ID。
- 普通并发：同队列串行；后到者按上表返回 `EXISTING` 或冲突，不产生第二个出生。
- 旧程序优先级：旧程序完全看不到 v3 文件内容以外的新字段；对 v3 一律 fail-closed，因此**不存在旧程序抢执行 Cover 的窗口**。

## 4. FUTURE：Intent 规范

### 4.1 Intent 恰 25 键

| # | 字段 | 类型/可空 | 权威来源 | truth |
|---:|---|---|---|---|
| 1 | `intentVersion` | 整数，恒 1 | 本契约 | — |
| 2 | `taskId` | string，M catalog 签发 | catalog 出生 | CURRENT |
| 3 | `scopeId` | string | catalog 出生 | CURRENT |
| 4 | `birthIdentityHash` | 64 hex | `identityHashOf(record)` | CURRENT |
| 5 | `birthObservedAt` | canonical ISO | record.observedAt | CURRENT |
| 6 | `sourceRef` | string | taskDraft.source.ref | DECLARED |
| 7 | `sourceEntryIdentityHash` | 64 hex | 见 §5.1 的稳定源版本 | MEASURED_FIXTURE |
| 8 | `sourceByteSha256` | 64 hex | 库 STORED owned copy | MEASURED_FIXTURE |
| 9 | `sourceByteLength` | 整数 44..1,048,576 | 同上 | MEASURED_FIXTURE |
| 10 | `sourceRevision` | 整数 ≥1 | 调用者声明 + 条目对照 | DECLARED |
| 11 | `rightsState` | 枚举 `CONFIRMED_FIXTURE` | 出生 rights + fresh 库 | CURRENT |
| 12 | `rightsProofRef` | string 或 null | fresh 库 rights | DECLARED |
| 13 | `rightsExpiresAt` | canonical ISO 或 null | fresh 库 | DECLARED |
| 14 | `voiceProfileId` | string | 出生 binding | CURRENT |
| 15 | `profileRevision` | 整数 ≥1 | 出生 binding | CURRENT |
| 16 | `modelAssetId` | string | 出生 binding | CURRENT |
| 17 | `modelRevision` | 整数 ≥1 | 出生 binding | CURRENT |
| 18 | `modelIntegrityTruth` | 恒 `DECLARED_FIXTURE` | 本契约 | DECLARED |
| 19 | `instanceId` | string | 出生 binding | CURRENT |
| 20 | `candidateId` | 恒 `rvc` | 出生 binding | CURRENT |
| 21 | `modelRef` | string | 出生 binding.providerRef | CURRENT |
| 22 | `backendRevision` | 整数 1 | 本契约（Fixture backend） | DECLARED |
| 23 | `pitchShift` | 整数 -12..12 | 出生 request | CURRENT |
| 24 | `recipe` | 恰 5 键，见 §4.2 | Cover 出生请求 | DECLARED |
| 25 | `outputProfile` | 恰 4 键，见 §4.2 | Cover 出生请求 | DECLARED |

> 模型 weights 当前未被读取；`modelIntegrityTruth` 只允许 `DECLARED_FIXTURE`，任何 hash 都只是 identity，不是认证。

### 4.2 recipe / outputProfile 子形状

- `recipe`（5 键）：`sourceLayout` ∈ `MIXED|CLEAN_VOCAL`；`separationPreset` ∈ `NONE|FIXTURE_TWO_STEM`（MIXED↔FIXTURE_TWO_STEM、CLEAN_VOCAL↔NONE）；`mixMode` ∈ `VOCAL_ONLY|WITH_INSTRUMENTAL`；`vocalGainDb`、`instrumentalGainDb` 为**整数** -24..12（Cover 出生要求整数 dB；F-A planner 的浮点 gain 不在本 Intent 中）；`VOCAL_ONLY` 时 `instrumentalGainDb` 必须为 0；`CLEAN_VOCAL + WITH_INSTRUMENTAL` 在出生即拒绝（`COVER_INPUT_INVALID`）。
- `outputProfile`（4 键）：`format` 恒 `WAV`；`codec` 恒 `PCM_S16LE`；`sampleRate` ∈ `{16000,22050,24000,32000,44100,48000}` 且必须等于源条目实测 sampleRate；`channels` 1|2 且必须等于源条目实测 channels。

### 4.3 Canonical 形式与 hash 算法

Intent canonical 字节：按 §4.1 的编号顺序（1→25）拼接，**无空白**；字符串用标准 JSON 双引号转义（不 trim、不做 Unicode 归一化）；整数直接十进制（无前导零、无 `+`、无小数点、`-0` 归一为 `0`）；null 写 `null`；`recipe` 按 `sourceLayout, separationPreset, mixMode, vocalGainDb, instrumentalGainDb` 顺序；`outputProfile` 按 `format, codec, sampleRate, channels` 顺序。UTF-8 编码后 SHA-256 即 `intentHash`。

**排除**：时间（除 `birthObservedAt`）、调度/进度、临时句柄、attemptId、临时目录、观测进度；这些不进入 Intent，但仍需每次 fresh 门禁。

### 4.4 canonical 向量（独立可计算）

基础 Intent（示例数据）canonical 字节长度 **1101 B**，SHA-256：

```
0f3c09358d4e2e7c28de3d8c2a9ca828e6271a0a3fdfd08372a2434a44cb9983
```

| 变体（仅改一字段） | intentHash |
|---|---|
| `sourceByteSha256` 改为 `d4…d4` | `fadc21d19513b5c45222fd622792bd6ab17f434eceb309d54bfd166d16f2bfcd` |
| `pitchShift` 改为 7 | `48893f6e696bd4f0f7d29f52663589c5fe484ffee392b5887a41be8f6ae87c1e` |
| `modelRevision` 改为 2 | `dd4d9dffb7ed67cfc8a588a3c9d209f62c9a43be62230a330616fa2529350730` |
| `vocalGainDb` 改为 -6 | `7130c257914f1f9ecd266a3ee3d74b7973a8914389dba863d956904c97086a92` |
| `rightsState` 改为 `REVOKED` | `5dec0ceecb23658e1c2ae1b7830b8659b94f0a55f077125849f30c82e96410ed` |

独立核验：按 §4.3 手工/脚本拼接 canonical 字节后 SHA-256，应与上表逐一相等；五个变体两两不相等，且与基础值不等。同 Intent 精确重复 → `EXISTING`、0 重跑；任一字段变化 → `COVER_INTENT_CONFLICT`。hash 只是身份对比，不是认证 cap。


---

## 5. FUTURE：可信 SOURCE、版本映射、派生适配与 StageArtifact

### 5.1 SOURCE 必须是真实 STORED 字节（FUTURE）

- `sourceInput` 里的 `PRESENT/CONFIRMED_FIXTURE/audio` 四字段只是**声明**；执行前必须从**同一受信 sandbox 的 Artifact 库**按 `sourceRef` 读取 **STORED** 条目：
  1. fresh 读库，要求 `state==='STORED'`；
  2. 检查 `rights.state==='CONFIRMED_FIXTURE'`、`expiresAt` 未过期；
  3. `readBytes` 产生 owned copy；
  4. 用真实 `inspectFixtureWavBytes` 复检，`inspection.sha256===byteSha256`、`byteLength` 一致；
  5. 与 Intent 的 `sourceByteSha256/sourceByteLength/sourceEntryIdentityHash` 逐一相等，否则 `COVER_SOURCE_CHANGED`。
- 缺条目/未 STORED/scope 不符/字节不符/权利撤销/过期：分别固定拒绝，**不静默 alias、不伪造父 draft、不读任意文件/URL、不签第二任务**。

### 5.2 稳定源版本（stable source identity）

M 的 pack 只有整包 `revision`，会随无关入库变化；不能当稳定源版本。定义：

```
sourceEntryIdentityHash = SHA256(UTF-8(canonical {
  "artifactRef": <string>,
  "scopeId": <string>,
  "requestKey": <string>,
  "origin": <string>,
  "byteSha256": <string>,   // inspection.sha256
  "byteLength": <integer>   // inspection.byteLength
}))
```

- 签发者：Artifact 库（同 writer 的 import 事务）；写入口径：STORED 条目落盘后 fresh 读回计算。
- 变化规则：同 `artifactRef` 被 delete 后重建（新 requestKey/createdAt）或任何上述字段变化 → 新 hash；只有同条目原字节不变才保持不变。
- 对照表：调用者声明 `sourceRevision` / pack `revision` / 条目 `requestKey`+`createdAt` / 稳定 `sourceEntryIdentityHash` / 实测 `byteSha256`。**调用者数字不自证可信**；执行时以 fresh 读回为准。

### 5.3 声明 vs 实测对照（FUTURE）

| 来源 | 字段 | truth |
|---|---|---|
| 调用者/出生 | `taskDraft.source.ref`、`sourceRevision` | DECLARED |
| voice binding | `profileRevision`、`assetRevision`、`instanceId`、`candidateId`、`providerRef` | CURRENT（出生时已绑） |
| 库 STORED | `byteSha256`、`byteLength`、`inspection`（19 键）、`rights`、`expiresAt` | MEASURED_FIXTURE |
| 模型文件 | weights hash | UNKNOWN（当前不读，不称已实测） |
| 输出 | MASTER bytes 的 `inspection`（19 键） | MEASURED_FIXTURE |

### 5.4 派生 VOCAL → Provider 内部适配（FUTURE）

父 `task.source` 永远是原歌曲/父源，不改、不换 ref。内部适配器 `buildCoverStageRequest`（FUTURE）为每个阶段构造 Provider 请求，恰 7 键：

```
{"schemaVersion":1,"taskId":…,"scopeId":…,"intentHash":…,"lineage":{"rootSourceIdentityHash":…,"stageRole":"VOCAL","stageSha256":…,"stageByteLength":…},"model":{"instanceId":…,"candidateId":"rvc","modelRef":…,"assetRevision":…,"profileRevision":…,"backendRevision":1},"request":{"pitchShift":0,"inputAudio":{"durationMs":…,"byteLength":…,"sampleRate":…,"channels":…},"rights":{"state":"CONFIRMED_FIXTURE"}}}
```

规则：
1. 只在该 attempt 的 claim 内调用；每次调用前 fresh 复核 task/scope/intent、根 source identity/字节 hash、派生 parent links、model/profile/backend revision、rights/expiry。
2. 复用 M 原有支持层校验/dispatch；不重新跑公开 source resolver、不伪造父 draft、不签第二任务。
3. 派生请求的 `stageSha256/ByteLength` 必须等于内存中该阶段 owned bytes 的实际值；不给 Provider 传 MB 级路径/URL/任意引用。
4. 任何父源/模型/权利不一致 → `COVER_STAGE_REJECTED` 或 `COVER_RIGHTS_REJECTED`（按 §11 优先级），不重放。

### 5.5 StageArtifact 规范（FUTURE，恰 24 键 manifest）

角色固定：`SOURCE / VOCAL / INSTRUMENTAL / CONVERTED_VOCAL / MASTER`；`VERIFIED_MASTER` 只是 MASTER 的验证别名，**不产生第二产物/第二 ref/第二 import**。

manifest 24 键：

`manifestVersion, taskId, scopeId, intentHash, attemptId, role, producedByStage, sequence, parentLinks, rootSourceIdentityHash, rootSourceSha256, byteLength, byteSha256, inspection, mediaProfile, rights, expiresAt, modelRevision, profileRevision, backendRevision, origin, truthLevel, availability, verification`

| 字段 | 类型/取值 |
|---|---|
| `manifestVersion` | 恒 1 |
| `role` | `SOURCE\|VOCAL\|INSTRUMENTAL\|CONVERTED_VOCAL\|MASTER` |
| `producedByStage` | `SOURCE` 为 `INGEST`；其余为 `SEPARATING\|CONVERTING\|MIXING\|VERIFYING` |
| `sequence` | 整数 0..3（图内顺序） |
| `parentLinks` | 密集数组，每项 `{role, byteSha256}`，按输入顺序；SOURCE 为空数组 |
| `rootSourceIdentityHash` | §5.2 的稳定源版本 |
| `rootSourceSha256` | 根 SOURCE 字节 hash（所有派生都携带） |
| `byteLength` | 44..1,048,576 |
| `byteSha256` | 64 hex |
| `inspection` | 19 键，与 M inspector 完全一致 |
| `mediaProfile` | `{format:'WAV', codec:'PCM_S16LE', sampleRate, channels}` |
| `rights` | `{state, proofRef}`，从根源继承；撤销即失效 |
| `expiresAt` | canonical ISO 或 null，继承根源 |
| `modelRevision`/`profileRevision`/`backendRevision` | 与 Intent 一致 |
| `origin` | 恒 `SYNTHETIC_FIXTURE` |
| `truthLevel` | `MEASURED_SYNTHETIC`（MASTER 为 `MEASURED_SYNTHETIC_VERIFIED`） |
| `availability` | `TEMP_OWNED\|VERIFIED\|STORED\|DELETED\|UNKNOWN` |
| `verification` | `{state:'NOT_RUN'\|'PASSED'\|'FAILED', inspectedAt, inspector:'FIXTURE_WAV_CHECKED'}` |

内存载体形状（FUTURE，恰 4 键）：`{bytes: Uint8Array, byteLength, sha256, inspection}`；owned copy，不与调用者/其他阶段共享 backing store；持久快照中**不写入原生 bytes**，只写 manifest/投影；JSON 示例里的 `payloadBase64` 仅为明确标注的虚构编码样本。

### 5.6 旧 shape 映射表（CURRENT，不得混用）

| 形状 | 恰键 | 来源/用途 | 与 Cover 的关系 |
|---|---|---|---|
| source audio4 | `durationMs, byteLength, sampleRate, channels` | 调用者声明 | 只作声明；真实以 STORED 字节/inspection 为准 |
| 公有 Artifact metadata 8 | `artifactRef, scopeId, requestKey, origin, createdAt, expiresAt, rights, inspection` | 库 `get` 投影 | 不含 identityHash/byteSha/bytes；不是 proof 权威 |
| 私有 SaveProof.artifact 8 | `artifactRef, identityHash, byteSha256, byteLength, expiresAt, requestKey, rights, inspection` | 唯一 writer 的 proof | MASTER 使用；Cover 额外事实放 `coverAttachment`，不塞入这 8 键 |
| SaveProof root 11 | 见 §2.2 | writer delta 绑定 | 保持 v1.6 不变 |
| inspection 19 | 见 §2.2 | 实测 WAV | StageArtifact 复用同一 19 键 |
| canonical entry 11 | 见 §2.2 | pack 落盘 | 不新增 Stage 字段；MASTER 为普通 STORED 条目 |
| pack v1 root 4 | `schemaVersion, sandboxId, revision, entries` | 库文件 | 保持 v1；不因 Cover 改 root/entry |

- 中间产物只存在同 owner 的**受限临时内存/manifest**；不冒充物理 STORED/ref。
- 最终 MASTER 一次 `import`；只有库真实分配且 fresh 确认的 `artifactRef` 可进入最终 proof。
- 持久证据只由同 owner 唯一 writer 写；不另建 store。
- `SOURCE` 与共享模型只读，不清理；临时派生产物按 §8 清理规则处理。

---

## 6. FUTURE：三图字节算法与向量

### 6.1 媒体 profile

- PCM16 LE、WAV 44 字节 canonical 头；`sampleRate ∈ {16000,22050,24000,32000,44100,48000}`；`channels ∈ {1,2}`；frame/byte 关系 `dataByteLength = frameCount × channels × 2`，`byteLength = 44 + dataByteLength ≤ 1,048,576`。
- 所有字节运算在 16-bit 有符号样本域完成；中间运算用 JS 安全整数，输出前 clamp 到 `[-32768,32767]`；`Math.trunc` 为唯一取整（向零）。所有算法都不依赖浮点 pow/sin/随机；gain 使用 §6.4 的整数表。
- 标记：`origin=SYNTHETIC_FIXTURE`；不是实际音乐分离、不是真实 RVC 推理、不是真实混音。

### 6.2 三图与阶段

| 图 | 阶段序列 |
|---|---|
| MIXED / WITH_INSTRUMENTAL | SEPARATING → CONVERTING → MIXING → VERIFYING |
| MIXED / VOCAL_ONLY | 同上，MIXING 输入仅 CONVERTED_VOCAL |
| CLEAN_VOCAL / VOCAL_ONLY | CONVERTING（SOURCE）→ MIXING → VERIFYING |

1. **SEPARATING（仅 MIXED）**：对每个源样本 `s`：`vocal = trunc(s / 2)`；`instrumental = s − vocal`。两者都在 `[-32768,32767]`；不 clamp 也安全（|vocal| ≤ 16384，|inst| ≤ 16384+…）。
2. **CONVERTING**：`factor = 1000 + 25 × pitchShift`（pitchShift ∈ [-12,12] → 700..1300）；`converted = clamp(trunc((vocal × factor) / 1000))`。模型/backend revision **不影响** SYNTHETIC 字节（如实记录于 Intent，仍参与冲突判定）。
3. **MIXING**：
   - WITH_INSTRUMENTAL：`out = clamp(trunc((converted × F(vocalGainDb) + instrumental × F(instrumentalGainDb)) / 1000))`
   - VOCAL_ONLY：`out = clamp(trunc((converted × F(vocalGainDb)) / 1000))`（`instrumentalGainDb` 必为 0）
4. **VERIFYING**：对 MASTER 实际字节调用原 `inspectFixtureWavBytes` 一次，要求 19 键与声明的 master inspection **完全相等**、`sha256` 一致；**不生成第二个 MASTER**；`VERIFIED_MASTER` 只是同字节的别名。
5. 溢出/越界：clamp 后仍记录 `peak`/`fullScaleSampleCount`；若实际 byteLength 超过 1,048,576 或 frame 关系不符 → `COVER_RESOURCE_LIMIT` / `COVER_STAGE_REJECTED`，不截断。

### 6.3 gain 表 F(dB)（整数 permille，FUTURE 唯一表）

| dB | -24 | -23 | -22 | -21 | -20 | -19 | -18 | -17 | -16 | -15 | -14 | -13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F | 63 | 71 | 79 | 89 | 100 | 112 | 126 | 141 | 158 | 178 | 200 | 224 |

| dB | -12 | -11 | -10 | -9 | -8 | -7 | -6 | -5 | -4 | -3 | -2 | -1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F | 251 | 282 | 316 | 355 | 398 | 447 | 501 | 562 | 631 | 708 | 794 | 891 |

| dB | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F | 1000 | 1122 | 1259 | 1413 | 1585 | 1778 | 1995 | 2239 | 2512 | 2818 | 3162 | 3548 | 3981 |

（`F(dB) = round(1000 × 10^(dB/20))` 的整数表；Cover 出生只接受整数 dB，因此该表覆盖全部合法取值。）

### 6.4 小向量（虚构，独立可计算）

源：4 帧 mono 44100，样本 `[1000, -2000, 32767, -32768]`，44 字节头 + 8 字节数据 = 52 B。

| 产物 | 样本 | WAV SHA-256 |
|---|---|---|
| SOURCE | `[1000,-2000,32767,-32768]` | `11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd` |
| VOCAL (÷2) | `[500,-1000,16383,-16384]` | `3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2` |
| INSTRUMENTAL (s−v) | `[500,-1000,16384,-16384]` | `5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f` |
| CONVERTED pitch 0 | `[500,-1000,16383,-16384]` | `3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2` |
| CONVERTED pitch +7 | `[587,-1175,19250,-19251]` | `63db9d5f601f19613d1056d7c7ecc1cb2f8f3ab16a97d873c1cae751d7725c8f` |
| MASTER 0 dB (WITH_INSTRUMENTAL) | `[1000,-2000,32767,-32768]` | `11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd` |
| MASTER vocal −6 dB | `[750,-1501,24591,-24592]` | `751a15a688306c0dee934c113675b488393d126bb181e0fe9dbe69a2ac4e94b7` |

说明：
- pitch 0 的 CONVERTED 与 VOCAL 同字节、0 dB WITH_INSTRUMENTAL 的 MASTER 与 SOURCE 同字节——这是算法的确定性事实，**Intent 仍通过 pitch/gains 区分**，并如实记录“同 hash 来自合成算法”；不得据此声称真实 RVC/混音。
- 上述 hash 是 52 B 文件的整文件 SHA-256（44 B 头 + 8 B 数据），可独立复算。

---

## 7. FUTURE：执行 API、单 claim 事务与恢复

### 7.1 同 owner 的唯一 API

`openFixtureTaskOwner({sandbox})` 的返回值在 v3 增加三个方法，旧四方法签名/语义不变：

```
executeCover(request) -> Promise<envelope>
coverStatus(request)  -> Promise<envelope>
requestCoverCancel(request) -> Promise<envelope>
```

**executeCover request** 恰 8 键：`schemaVersion(1), scopeId, taskId, requestKey, now, expiresAt, rights, intent`。
- `requestKey`：`^[A-Za-z0-9:_-]{1,64}$`，Cover 执行去重键；不复用 legacy save 的 key 语义。
- `rights`：`{state, proofRef}`，必须与 Intent/库 fresh 一致。
- `intent` 必须与出生绑定的 `intentHash` 完全一致（canonical 后比对）；否则 `COVER_INTENT_MISMATCH`。

**executeCover 结果**（恰 6 键）：`{schemaVersion:1, outcome, attemptId, statusState, messageZh, value}`；
- `outcome ∈ {SAVED, EXISTING, CANCELLED, FAILED, UNKNOWN, BLOCKED}`；
- 成功 `value` 恰 8 键：`{taskId, scopeId, intentHash, attemptId, master:{artifactRef, byteLength, sha256, expiresAt}, inspection(19键), userMessageZh, mockOnly, realOperationAllowed}`？——修正为恰 8 键：`taskId, scopeId, intentHash, attemptId, master(4键), inspection(19键), messageZh, mockOnly`。

**coverStatus request** 恰 3 键：`{schemaVersion, scopeId, taskId}`；返回恰 14 键：
`schemaVersion, state, phase, attemptId, attemptSeq, intentHash, stages, cancel, lease, tempArtifacts, master, lastError, messageZh, updatedAt`。
- `state ∈ {NO_ATTEMPT, CLAIMED, SEPARATING, CONVERTING, MIXING, VERIFYING, FINALIZING, SAVED, CANCELLED, FAILED, UNKNOWN}`（11 态）。
- `stages`：密集数组 0..4 项，每项 `{stage, status}`，`status ∈ {PENDING, RUNNING, DONE, FAILED, CANCELLED, UNKNOWN}`；不把 F.A 的 PLANNED 当作执行。
- `cancel`：`{requested, requestedAt, acknowledgedAt, confirmedAt, reason}`（值可 null）。
- `lease`：`{leaseId, kind:'LOGICAL_FIXTURE', gpu:'EXCLUSIVE', acquiredAt, releasedAt|null}` 或 null。
- `tempArtifacts`：密集数组，每项 `{role, byteLength, sha256, availability}`（只报临时/已验证/已清理/未知，不含 bytes）。
- `master`：`{artifactRef, byteLength, sha256, expiresAt}|null`。
- `lastError`：`{code, path, reason}|null`；`messageZh` 固定中文；`updatedAt` canonical ISO。

**requestCoverCancel request** 恰 4 键：`{schemaVersion, scopeId, taskId, attemptId}`；返回恰 5 键：`{schemaVersion, cancelRequested, cancelState, acknowledgedAt, messageZh}`，`cancelState ∈ {ACCEPTED, ACKNOWLEDGED, STOPPED, TOO_LATE, UNKNOWN}`。

### 7.2 owner v3 Cover entry（FUTURE，恰 14 键）

`entryVersion, kind, scopeId, taskId, birthIdentityHash, phase, record, completion, intentHash, intent, attempt, checkpoints, manifest, cancel`

- `phase ∈ {CLAIMED, FINAL}`；`completion` 在 CLAIMED 为 null，FINAL 为 `{kind:'SAVED', reason:null}`。
- `attempt` 恰 6 键：`{attemptId, attemptSeq, startedAt, finishedAt|null, status, lease}`；`attemptId = 'cover-attempt:' + 32 hex`（由 catalog allocator 的同一随机源签发，非用户输入）。
- `checkpoints`：密集数组，最多 6 项，每项 `{index, stage, at, status}`，仅在 §7.4 规定时点持久化。
- `manifest`：FINAL 时恰 6 键 `{source, vocal, instrumental|null, converted, master, verification}`，每项为 §5.5 manifest 或 null；CLAIMED 时为 null。
- `cancel`：`{requested, requestedAt, acknowledgedAt, confirmedAt, reason}`，初始全 false/null。
- 语义：claim 写 revision+1；FINAL 写 revision+2（总 +2，沿用 claim1/final2 权重）；`birthIdentityHash` 仍绑定原出生。

### 7.3 全局写队列与阶段执行分界（FUTURE）

- 阶段计算（分离/转换/混音/验证）**不占用** `state.tail` 写队列；只有落盘步骤短暂入队：出生、claim、checkpoint（若持久化）、FINAL、cancel 确认。
- 每个落盘步骤：入队 → fresh 读 owner/catalog/artifact → 检查 `baseDigest`/revision/权限 → 写 temp+fsync+rename+回读 → 出队。
- 阶段之间重新取队列做 fresh 门禁；不长期持有，避免阻塞同 capability 的其他任务与 CPU/REMOTE 独立任务。
- 单 task 在途 claim 由 owner cover entry 的 `phase=CLAIMED` + `attempt.status` 判定；并发第二个 `executeCover` 在同队列内看到 CLAIMED → 返回当前状态/`EXISTING`，不重复执行。
- Artifact 队列：MASTER import 与 joint 确认期间持有；delete 等操作按 M 原顺序排队，不在阶段计算期间持有。
- 旧 `save` 的不可中断语义保留；Cover 不修改旧 save 的 bytes engine 绑定，也不让旧 save 在 Cover 出生上执行（§3.3）。

### 7.4 checkpoint 持久化点（FUTURE）

只允许在以下 6 个时点写 checkpoint（每 attempt 每个时点最多一次）：
`CLAIMED`(index 0) → `SEPARATED`(1) → `CONVERTED`(2) → `MIXED`(3) → `MASTER_IMPORTED`(4) → `VERIFIED`(5)。
- checkpoint 只记录 `{index, stage, at, status}` 与对应 manifest 摘要（哪一阶段、字节 hash/length），**不写 bytes**。
- checkpoint 的 revision 递增为 +1 每次；FINAL 仍为 claim+2 的相对权重语义（checkpoint revision 只作为当前 baseDigest，不改变 claim1/final2 的证明语义）。
- 崩溃恢复：从最后一个 checkpoint + 临时 manifest 重建计划；没有可证明的既有临时产物则重新计算；**不重跑已 FINAL 的旧执行**。

### 7.5 coverAttachment（FUTURE，恰 7 键，writer 第 5 参数）

```
{"attachmentVersion":1,"intentHash":…,"attemptId":…,"sourceEntryIdentityHash":…,"lineage":{"sourceSha256":…,"vocalSha256":…,"instrumentalSha256":…|null,"convertedSha256":…},"masterSha256":…,"verification":{"validationState":"FIXTURE_WAV_CHECKED","peak":…,"fullScaleSampleCount":…,"durationMs":…}}
```

唯一 writer 分支：
- 候选快照含 Cover SAVED FINAL → 必须提供恰好 7 键、深冻结、own-data 的 `coverAttachment`，且 `masterSha256 === proof.artifact.byteSha256`、`intentHash === owner entry.intentHash`、lineage 与 checkpoints/manifest 一致；否则 `WRITE_REJECTED` 无锁。
- 候选不含 Cover FINAL → attachment 必须为 null；否则 `WRITE_REJECTED`。
- 旧 v1/v2 写入路径不传第 5 参，行为不变；v1.6 proof 的 pre/post 门禁、JOINT、分域锁与 UNKNOWN 语义原样复用。

### 7.6 完整时序（FUTURE）

```
reserveCover (catalog v3, atomic birth+intent)
  -> executeCover: fresh birth/intent/source(STORED bytes+rights+identity)
  -> claim write (CLAIMED, lease acquired, revision+1)
  -> SEPARATING (temp VOCAL/INSTRUMENTAL) -> checkpoint 1
  -> CONVERTING (temp CONVERTED) -> checkpoint 2
  -> MIXING (temp MASTER owned copy) -> checkpoint 3
  -> VERIFYING (inspector on MASTER) -> checkpoint 4
  -> Artifact queue: import MASTER once -> fresh STORED read -> checkpoint 5 (MASTER_IMPORTED)
  -> owner queue: FINAL write with proof + coverAttachment (revision+2 semantics)
  -> JOINT re-read (owner + artifact)
  -> SAVED (leased released, temps cleaned)
```

每步标注：持久（写盘）或内存（owned bytes/temp）；锁域（catalog/owner 共享写队列 vs Artifact 队列）；失败后的可达操作见 §12 矩阵。


### 7.7 完整虚构 JSON 示例（全部 NOT_IMPLEMENTED）

以下示例只用于固定协议形状与字段计数；它们**不是可调用 API**，也不代表实现已存在。

**executeCover request（恰 8 键）**

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
  "requestKey": "cover-exec:demo-1",
  "now": "2026-11-01T00:00:01.000Z",
  "expiresAt": "2026-11-02T00:00:00.000Z",
  "rights": { "state": "CONFIRMED_FIXTURE", "proofRef": "fixture-rights:cover-demo-1" },
  "intent": {
    "intentVersion": 1,
    "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
    "scopeId": "scope:fixture-demo",
    "birthIdentityHash": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    "birthObservedAt": "2026-11-01T00:00:00.000Z",
    "sourceRef": "artifact:fixture-source-1",
    "sourceEntryIdentityHash": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
    "sourceByteSha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
    "sourceByteLength": 88244,
    "sourceRevision": 1,
    "rightsState": "CONFIRMED_FIXTURE",
    "rightsProofRef": "fixture-rights:cover-demo-1",
    "rightsExpiresAt": null,
    "voiceProfileId": "voice:demo-hero",
    "profileRevision": 1,
    "modelAssetId": "asset:fixture-model-a",
    "modelRevision": 1,
    "modelIntegrityTruth": "DECLARED_FIXTURE",
    "instanceId": "instance:rvc",
    "candidateId": "rvc",
    "modelRef": "rvc-model:fixture-a",
    "backendRevision": 1,
    "pitchShift": 0,
    "recipe": {
      "sourceLayout": "MIXED",
      "separationPreset": "FIXTURE_TWO_STEM",
      "mixMode": "WITH_INSTRUMENTAL",
      "vocalGainDb": 0,
      "instrumentalGainDb": 0
    },
    "outputProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 }
  }
}
```

**executeCover 成功结果（恰 6 键；`value` 恰 8 键）**

```json
{
  "schemaVersion": 1,
  "outcome": "SAVED",
  "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
  "statusState": "SAVED",
  "messageZh": "演示翻唱已保存到本地演示资产库；这不是真实生成，也没有发送到微信。",
  "value": {
    "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
    "scopeId": "scope:fixture-demo",
    "intentHash": "0f3c09358d4e2e7c28de3d8c2a9ca828e6271a0a3fdfd08372a2434a44cb9983",
    "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
    "master": {
      "artifactRef": "artifact:fixture-bytes-00112233445566778899aabbccddeeff",
      "byteLength": 88244,
      "sha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
      "expiresAt": "2026-11-02T00:00:00.000Z"
    },
    "inspection": {
      "schemaVersion": 1,
      "format": "WAV",
      "codec": "PCM_S16LE",
      "bitsPerSample": 16,
      "sampleRate": 44100,
      "channels": 1,
      "byteLength": 88244,
      "dataByteLength": 88200,
      "frameCount": 44100,
      "durationMs": 1000,
      "peak": 1,
      "fullScaleSampleCount": 2,
      "sha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
      "validationState": "FIXTURE_WAV_CHECKED",
      "mockOnly": true,
      "realOperationAllowed": false,
      "submitAllowed": false,
      "automaticRetryAllowed": false,
      "messageZh": "演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。"
    },
    "messageZh": "演示翻唱已保存到本地演示资产库；这不是真实生成，也没有发送到微信。",
    "mockOnly": true
  }
}
```

**coverStatus 结果（恰 14 键）**

```json
{
  "schemaVersion": 1,
  "state": "SAVED",
  "phase": "FINAL",
  "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
  "attemptSeq": 1,
  "intentHash": "0f3c09358d4e2e7c28de3d8c2a9ca828e6271a0a3fdfd08372a2434a44cb9983",
  "stages": [
    { "stage": "SEPARATING", "status": "DONE" },
    { "stage": "CONVERTING", "status": "DONE" },
    { "stage": "MIXING", "status": "DONE" },
    { "stage": "VERIFYING", "status": "DONE" }
  ],
  "cancel": { "requested": false, "requestedAt": null, "acknowledgedAt": null, "confirmedAt": null, "reason": null },
  "lease": { "leaseId": "lease:fixture-cover-1", "kind": "LOGICAL_FIXTURE", "gpu": "EXCLUSIVE", "acquiredAt": "2026-11-01T00:00:01.000Z", "releasedAt": "2026-11-01T00:00:05.000Z" },
  "tempArtifacts": [
    { "role": "VOCAL", "byteLength": 88244, "sha256": "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4", "availability": "CLEANED" }
  ],
  "master": {
    "artifactRef": "artifact:fixture-bytes-00112233445566778899aabbccddeeff",
    "byteLength": 88244,
    "sha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
    "expiresAt": "2026-11-02T00:00:00.000Z"
  },
  "lastError": null,
  "messageZh": "演示翻唱当前可读取。",
  "updatedAt": "2026-11-01T00:00:05.000Z"
}
```

**requestCoverCancel 结果（恰 5 键）**

```json
{
  "schemaVersion": 1,
  "cancelRequested": true,
  "cancelState": "ACCEPTED",
  "acknowledgedAt": null,
  "messageZh": "已收到演示取消请求；尚未确认阶段停止。"
}
```

**owner 快照 v3（含一个 Cover entry，恰 14 键）**

```json
{
  "schemaVersion": 3,
  "revision": 4,
  "entries": [
    {
      "entryVersion": 1,
      "kind": "COVER",
      "scopeId": "scope:fixture-demo",
      "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
      "birthIdentityHash": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      "phase": "FINAL",
      "record": {
        "schemaVersion": 1,
        "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
        "feature": "singing",
        "taskType": "SVC",
        "source": { "kind": "AUDIO_REF", "ref": "artifact:fixture-source-1" },
        "voiceProfileId": "voice:demo-hero",
        "deliveryRequested": false,
        "rights": { "state": "CONFIRMED_FIXTURE" },
        "state": "SAVED",
        "outputArtifactRef": "artifact:fixture-bytes-00112233445566778899aabbccddeeff",
        "cancel": { "requested": false, "confirmed": false },
        "delivery": { "state": "NOT_REQUESTED", "deliveryId": null },
        "lastError": null,
        "observedAt": "2026-11-01T00:00:00.000Z",
        "mockOnly": true,
        "realOperationAllowed": false
      },
      "completion": { "kind": "SAVED", "reason": null },
      "intentHash": "0f3c09358d4e2e7c28de3d8c2a9ca828e6271a0a3fdfd08372a2434a44cb9983",
      "intent": {
        "intentVersion": 1,
        "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
        "scopeId": "scope:fixture-demo",
        "birthIdentityHash": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
        "birthObservedAt": "2026-11-01T00:00:00.000Z",
        "sourceRef": "artifact:fixture-source-1",
        "sourceEntryIdentityHash": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
        "sourceByteSha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
        "sourceByteLength": 88244,
        "sourceRevision": 1,
        "rightsState": "CONFIRMED_FIXTURE",
        "rightsProofRef": "fixture-rights:cover-demo-1",
        "rightsExpiresAt": null,
        "voiceProfileId": "voice:demo-hero",
        "profileRevision": 1,
        "modelAssetId": "asset:fixture-model-a",
        "modelRevision": 1,
        "modelIntegrityTruth": "DECLARED_FIXTURE",
        "instanceId": "instance:rvc",
        "candidateId": "rvc",
        "modelRef": "rvc-model:fixture-a",
        "backendRevision": 1,
        "pitchShift": 0,
        "recipe": {
          "sourceLayout": "MIXED",
          "separationPreset": "FIXTURE_TWO_STEM",
          "mixMode": "WITH_INSTRUMENTAL",
          "vocalGainDb": 0,
          "instrumentalGainDb": 0
        },
        "outputProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 }
      },
      "attempt": {
        "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
        "attemptSeq": 1,
        "startedAt": "2026-11-01T00:00:01.000Z",
        "finishedAt": "2026-11-01T00:00:05.000Z",
        "status": "SAVED",
        "lease": { "leaseId": "lease:fixture-cover-1", "kind": "LOGICAL_FIXTURE", "gpu": "EXCLUSIVE", "acquiredAt": "2026-11-01T00:00:01.000Z", "releasedAt": "2026-11-01T00:00:05.000Z" }
      },
      "checkpoints": [
        { "index": 0, "stage": "CLAIMED", "at": "2026-11-01T00:00:01.000Z", "status": "DONE" },
        { "index": 1, "stage": "SEPARATED", "at": "2026-11-01T00:00:02.000Z", "status": "DONE" },
        { "index": 2, "stage": "CONVERTED", "at": "2026-11-01T00:00:03.000Z", "status": "DONE" },
        { "index": 3, "stage": "MIXED", "at": "2026-11-01T00:00:04.000Z", "status": "DONE" },
        { "index": 4, "stage": "MASTER_IMPORTED", "at": "2026-11-01T00:00:04.500Z", "status": "DONE" },
        { "index": 5, "stage": "VERIFIED", "at": "2026-11-01T00:00:04.800Z", "status": "DONE" }
      ],
      "manifest": {
        "source": null,
        "vocal": null,
        "instrumental": null,
        "converted": null,
        "master": {
          "manifestVersion": 1,
          "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
          "scopeId": "scope:fixture-demo",
          "intentHash": "0f3c09358d4e2e7c28de3d8c2a9ca828e6271a0a3fdfd08372a2434a44cb9983",
          "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
          "role": "MASTER",
          "producedByStage": "MIXING",
          "sequence": 3,
          "parentLinks": [
            { "role": "CONVERTED_VOCAL", "byteSha256": "d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5" },
            { "role": "INSTRUMENTAL", "byteSha256": "d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6" }
          ],
          "rootSourceIdentityHash": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
          "rootSourceSha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
          "byteLength": 88244,
          "byteSha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
          "inspection": {
            "schemaVersion": 1,
            "format": "WAV",
            "codec": "PCM_S16LE",
            "bitsPerSample": 16,
            "sampleRate": 44100,
            "channels": 1,
            "byteLength": 88244,
            "dataByteLength": 88200,
            "frameCount": 44100,
            "durationMs": 1000,
            "peak": 1,
            "fullScaleSampleCount": 2,
            "sha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
            "validationState": "FIXTURE_WAV_CHECKED",
            "mockOnly": true,
            "realOperationAllowed": false,
            "submitAllowed": false,
            "automaticRetryAllowed": false,
            "messageZh": "演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。"
          },
          "mediaProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 },
          "rights": { "state": "CONFIRMED_FIXTURE", "proofRef": "fixture-rights:cover-demo-1" },
          "expiresAt": "2026-11-02T00:00:00.000Z",
          "modelRevision": 1,
          "profileRevision": 1,
          "backendRevision": 1,
          "origin": "SYNTHETIC_FIXTURE",
          "truthLevel": "MEASURED_SYNTHETIC_VERIFIED",
          "availability": "STORED",
          "verification": { "state": "PASSED", "inspectedAt": "2026-11-01T00:00:04.800Z", "inspector": "FIXTURE_WAV_CHECKED" }
        },
        "verification": { "state": "PASSED", "inspectedAt": "2026-11-01T00:00:04.800Z", "inspector": "FIXTURE_WAV_CHECKED" }
      },
      "cancel": { "requested": false, "requestedAt": null, "acknowledgedAt": null, "confirmedAt": null, "reason": null }
    }
  ]
}
```

**coverAttachment（恰 7 键）**

```json
{
  "attachmentVersion": 1,
  "intentHash": "0f3c09358d4e2e7c28de3d8c2a9ca828e6271a0a3fdfd08372a2434a44cb9983",
  "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
  "sourceEntryIdentityHash": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
  "lineage": {
    "sourceSha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
    "vocalSha256": "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
    "instrumentalSha256": "d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6",
    "convertedSha256": "d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5"
  },
  "masterSha256": "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
  "verification": { "validationState": "FIXTURE_WAV_CHECKED", "peak": 1, "fullScaleSampleCount": 2, "durationMs": 1000 }
}
```


---

## 8. FUTURE：取消、资源、清理与缓存

### 8.1 取消是同 owner 的侧通道

- `requestCoverCancel` 不排入 `state.tail` 长队列；它写入同 owner 的 capability 级 cancel fence（内存 + 一次短队列持久写），阶段在固定合作点检查 fence。
- 固定合作点：每个阶段开始前、每个阶段计算循环每 4096 帧、每个 checkpoint 前后、Artifact import 前、FINAL 提交 fence 前。FINAL 的 temp fsync→rename 之间为**不可中断区**。
- 状态与写入者：

| 事件 | 写入者 | 可见状态 |
|---|---|---|
| request accepted | owner cancel fence（短队列） | `cancel.requested=true/requestedAt` |
| stage ack | 阶段循环 | `cancel.acknowledgedAt` + stage status `CANCELLED` |
| stage stopped | 阶段循环 | stage `CANCELLED`、leased 仍持有到释放 |
| resource released | owner FINAL/UNKNOWN 写 | `lease.releasedAt` |
| cleanup verified | owner 清理步骤 | `tempArtifacts[].availability='CLEANED'` |

- `cancelState ∈ {ACCEPTED, ACKNOWLEDGED, STOPPED, TOO_LATE, UNKNOWN}`；已请求 ≠ 已取消；`TOO_LATE`（FINAL 已提交）不回滚成功；`UNKNOWN` 不改写为失败、不自动重跑。
- 取消确认期限：自 `requestedAt` 起 **30,000 ms**（逻辑时钟：以每次 fresh `now` 比较）；超时后 `coverStatus` 报 `CANCEL_UNKNOWN`，执行继续按 fence 检查，但不宣称已停止。

### 8.2 逻辑租约（LOGICAL_FIXTURE）

- `lease = {leaseId, kind:'LOGICAL_FIXTURE', gpu:'EXCLUSIVE', acquiredAt, releasedAt|null}`，归属于 task/scope/intent/attempt；在 claim 写入时获得，在 SAVED/CANCELLED/FAILED/UNKNOWN 的持久写时释放。
- 本地 GPU 类任务独占；CPU/cloud 类任务不抢 GPU（本契约目前只有 SYNTHETIC_FIXTURE，全部按 `LOGICAL_FIXTURE` 记）。这是**逻辑**占用，不是实际 GPU/显存/进程/设备测试；readiness 的 `AVAILABLE` 不是 lease。
- 退场/取消/未知：租约必须回到 `releasedAt!=null` 才可再次领取；UNKNOWN 期间不重新领取同一 attempt。

### 8.3 清理规则

- 只清理**本 attempt 证明拥有**的临时字节/manifest；不删父 SOURCE、共享模型、其他 task、`STORED` MASTER、不确定已存资产。
- 清理失败 → `tempArtifacts` 保留 `availability='UNKNOWN'`，不谎报 CLEANED；不影响已 SAVED 的 MASTER。
- 不宣称“JS 副本全部安全擦除”；只保证不再有本 attempt 的引用并记录清理结果。

### 8.4 缓存默认禁用

- 本契约**不实现缓存**，也不声称缓存命中。
- 未来若启用，必须另审并至少绑定：实际 sourceSHA + scope/rights + model/profile/backend revision + recipe（layout/preset/mix/gains）+ outputProfile + expiry；每次 fresh 复核权利撤销/过期；不提供跨 scope 私有音频捷径。

---

## 9. FUTURE：预算、峰值与容量

### 9.1 固定上限（CURRENT 常量，不得扩大）

| 项 | 值 |
|---|---|
| Artifact 单项 | 1,048,576 B |
| Artifact 解码总量 | 4,194,304 B |
| Artifact 条目（含 tombstone） | 32 |
| Artifact pack 字节 | 6,291,456 B |
| owner 文件 | 131,072 B |
| owner 条目 | 32 |
| inspector | 52,428,800 B / 300,000 ms / 128 chunks |

### 9.2 Cover 峰值表（FUTURE）

| 阶段 | 同时受控的字节缓冲 | 受控字节峰值 |
|---|---|---|
| INGEST | SOURCE owned copy | 1,048,576 |
| SEPARATING | SOURCE + VOCAL + INSTRUMENTAL（SOURCE 在校验后即可释放） | 3,145,728 |
| CONVERTING | VOCAL + INSTRUMENTAL + CONVERTED（VOCAL 在哈希记录后释放） | 3,145,728 |
| MIXING | INSTRUMENTAL + CONVERTED + MASTER（CONVERTED 在混音后释放） | 3,145,728 |
| IMPORT/VERIFY | MASTER + inspector 内部副本（≤1,048,576） | 2,097,152 |

- **受控临时内存预算 = 3,145,728 B**；计算前按图求峰值，超出 → `COVER_RESOURCE_LIMIT`，不开始分配。
- 受控字节不含 JSON/base64 编码与 JS/GC 隐含堆；不承诺全部副本精确回收/安全擦除。

### 9.3 入场预留与最终 fresh 重核

1. Artifact 条目：现有条目数 E（含 tombstone）+ 1 ≤ 32 → 需要 **E ≤ 31**。
2. 解码总量：现有解码 D + MASTER ≤ 4,194,304 → 需要 **D ≤ 3,145,728**。
3. pack：现有 pack 字节 P + B + 1,536 ≤ 6,291,456，其中 `B = 4 × ceil(masterBytes / 3)`（base64 长度），1,536 为非 payload JSON 上限；需要 **P ≤ 4,893,312**（当 MASTER 取最大值时）。
4. owner：现有字节 + Cover entry JSON（≤16,384 B，含 25 键 Intent + checkpoint + manifest 摘要）≤ 131,072；条目 ≤32。
5. 入场时计算并预留以上四项；MASTER 写入前**再 fresh 重核**；任一不满足 → 固定 `COVER_RESOURCE_LIMIT`，0 新入库。

### 9.4 容量示例（CURRENT 计算）

- 44 B 头 + PCM16 数据 ≤ 1,048,576 B → 最大数据 1,048,532 B。
- mono 44,100 Hz：524,266 帧 = **11,888.1179 ms**。
- stereo 44,100 Hz：262,133 帧 ≈ 5,944.06 ms；48,000 Hz mono：524,266 帧 ≈ 10,922.2 ms。
- 不能拿 inspector 的 50 MiB / 300,000 ms 当成库 1 MiB 的完整歌曲输出上限；超限固定拒绝，不静默截断。
- 32 条目是上限，不承诺 32 个最大 Cover 都能同时装下（解码总量与 pack 先到限）。

---

## 10. FUTURE：版本与兼容矩阵

### 10.1 版本集合

| 文件 | 支持版本 | 未知版本行为 |
|---|---|---|
| catalog 快照 | v1（legacy）、v3（含 Cover typed entry） | 其他 → `TASK_CATALOG_STORE_INVALID`，fail-closed |
| owner 快照 | v1、v2、v3（Cover variant） | 其他 → `TASK_OWNER_STORE_INVALID`，fail-closed |
| Artifact pack | v1（不变） | 其他 → `ARTIFACT_LIBRARY_STORE_INVALID`（M 原行为） |
| 公开 schema | catalog/owner/Task 公开 schemaVersion 恒 1 | 其他 → 原 `UNSUPPORTED_VERSION` |

### 10.2 程序 × 版本矩阵

| 程序 \ 对象 | catalog v1 | catalog v3 | owner v1/v2 | owner v3 | 未知版本 |
|---|---|---|---|---|---|
| 旧程序（M 当前） | 正常 legacy | `STORE_INVALID`（fail-closed） | 正常 | `STORE_INVALID`（fail-closed） | `STORE_INVALID` |
| 新程序（FUTURE） | 正常 legacy（可执行 Cover 出生升级到 v3） | 正常 legacy + Cover | 正常 legacy | 正常 Cover 状态读取/恢复 | 对应 *`_STORE_INVALID` |

- 旧程序遇新版本一律 fail-closed，无 permissive fallback、无 legacy 旁路。
- 新程序不自动迁移旧 v1/v2 文件；只有下一次 Cover 出生/owner Cover claim 才写 v3。
- 旧 client 调旧四方法：legacy 行为保持；对 Cover 出生，`run/save` 返回 `TASK_OWNER_COVER_LEGACY_BIRTH`（0 执行），`get/artifactStatus` 可读投影。
- 新 client 的 `executeCover` 对 legacy 出生返回 `TASK_OWNER_COVER_BIRTH_REQUIRED`（不隐式升级/不换 ID）。
- 阶段进度是新视图，**不写入** Task v1 的 `state`（不塞 `SEPARATING` 等）。

---

## 11. FUTURE：错误码（新增，独立于旧 22 码）

### 11.1 owner Cover 码（`TASK_OWNER_COVER_` + KEY）

| KEY | 类别/path | 固定 reason | 中文说明 |
|---|---|---|---|
| `INPUT_INVALID` | ok:false；`$`/已知字段 path | `invalid cover input` | 演示翻唱执行请求格式不正确。 |
| `BIRTH_REQUIRED` | ok:false；`$` | `cover birth required` | 该任务不是 Cover 出生，不能执行翻唱。 |
| `LEGACY_BIRTH` | ok:false；`$` | `cover intent not bound` | 该任务没有绑定 Cover 意图，旧执行路径不会运行。 |
| `INTENT_MISMATCH` | ok:false；`intent` | `cover intent mismatch` | 本次意图与出生绑定不一致。 |
| `RIGHTS_REJECTED` | ok:false；`rights` | `cover rights rejected` | 当前授权不允许执行或保存。 |
| `EXPIRED` | ok:false；`expiresAt` | `cover request expired` | 演示请求已过期。 |
| `SOURCE_CHANGED` | ok:false；`sourceInput` | `cover source changed` | 源文件内容或版本已变化。 |
| `SOURCE_UNAVAILABLE` | ok:false；`sourceInput` | `cover source unavailable` | 演示源当前不可用。 |
| `RESOURCE_LIMIT` | ok:false；`$` | `cover resource limit exceeded` | 演示翻唱超出允许的资源范围。 |
| `STAGE_REJECTED` | ok:false；`$` | `cover stage rejected` | 演示阶段无法按契约执行。 |
| `DEPENDENCY_FAILURE` | ok:false；`$` | `cover dependency failure` | 无法确认演示依赖结果，请重新核对。 |
| `CANCEL_TOO_LATE` | ok:true / too-late | `cover cancel too late` | 保存已提交，不能再取消。 |
| `CANCEL_UNKNOWN` | ok:false；`$` | `cover cancel unknown` | 取消状态无法确认。 |
| `EXECUTION_UNKNOWN` | ok:false；`$` | `cover execution unknown` | 执行结果无法确认，系统不会自动重跑。 |
| `STORE_INVALID` | ok:false；`$` | `cover store invalid` | 本地演示记录无法核对。 |
| `STORE_CHANGED` | ok:false；`$` | `cover store changed` | 本地演示记录已变化。 |
| `SAVE_REJECTED` | ok:false；`$` | `cover save rejected` | 保存候选被拒绝，未写入。 |
| `SAVE_UNKNOWN` | ok:false；`$` | `cover save unknown` | 保存结果无法确认。 |
| `NOT_FOUND` | ok:false；`$` | `cover task not found` | 未找到该演示任务或尝试。 |
| `INTERNAL_FAILURE` | ok:false；`$` | `cover internal failure` | 演示翻唱执行内部失败。 |
| `UNKNOWN` | ok:false；`$` | `cover unknown` | 当前演示翻唱状态未知。 |

### 11.2 catalog Cover 码（`TASK_CATALOG_COVER_` + KEY）

| KEY | 场景 | 中文 |
|---|---|---|
| `INPUT_INVALID` | Cover 出生输入/意图不合法 | 演示翻唱出生请求格式不正确。 |
| `INTENT_CONFLICT` | 同 key 差 Intent | 该演示翻唱请求与已有意图冲突。 |
| `BIRTH_REJECTED` | 出生快照/关联校验失败 | 演示翻唱出生被拒绝。 |

### 11.3 优先级（FUTURE，固定顺序）

1. 输入/根结构（`INPUT_INVALID`）；
2. 出生/Intent 绑定（`BIRTH_REQUIRED`/`LEGACY_BIRTH`/`INTENT_MISMATCH`）；
3. rights/expiry（`RIGHTS_REJECTED`/`EXPIRED`）；
4. source fresh（`SOURCE_UNAVAILABLE`/`SOURCE_CHANGED`）；
5. 资源入场（`RESOURCE_LIMIT`）；
6. 阶段执行（`STAGE_REJECTED`/`DEPENDENCY_FAILURE`）；
7. 取消 fence（`CANCEL_TOO_LATE`/`CANCEL_UNKNOWN`）；
8. 保存（`SAVE_REJECTED`/`SAVE_UNKNOWN`）；
9. 存储不确定（`STORE_INVALID`/`STORE_CHANGED`/`EXECUTION_UNKNOWN`/`UNKNOWN`）。

旧 22 码与旧 v1.6 语义不变；Cover 码不与旧码互换，避免用旧安全码掩盖新事实。

---

## 12. FUTURE：状态 / 失败矩阵

| # | 状态/事件 | 磁盘/资产可能事实 | 固定结果 | 锁域 | 允许动作 / 禁止 |
|---:|---|---|---|---|---|
| 1 | 未绑定（legacy 出生） | 仅 legacy 出生、无 Cover entry | `COVER_BIRTH_REQUIRED` | 无 | 可新建 Cover 出生；不得就地升级 |
| 2 | 已绑定未 claim | catalog v3 有 intent；owner 无 entry | `NO_ATTEMPT`；execute 可开始 | 短入队 | 可执行；0 旧 run/save 执行 |
| 3 | claim 后在途 | owner v3 CLAIMED + attempt | `CLAIMED/SEPARATING/...` | catalog/owner 短写 | 可 status/cancel；第二次 execute 返回当前状态 |
| 4 | 阶段失败（确定性） | claim 保留、无 FINAL、临时已清理 | `FAILED`；`STAGE_REJECTED` | 短写 | 可显式新 attempt（同 Intent 新 requestKey）；不自动重跑 |
| 5 | 阶段 UNKNOWN | claim 保留、临时 UNKNOWN | `UNKNOWN`；`EXECUTION_UNKNOWN` | 短写 + 逻辑租约 hold | 只 status/人工核对；不重跑/不删资产 |
| 6 | 取消请求已接受 | claim 保留、cancel.requested | `CANCELLED`（合作点） | 侧通道 | 可 status；不可重复取消 |
| 7 | 取消 too-late | FINAL 已提交 | `SAVED`；`CANCEL_TOO_LATE` | 无 | 不回滚、不改历史 |
| 8 | MASTER import 后、FINAL 前失败 | 库有新 STORED；owner 仍 CLAIMED | `SAVE_REJECTED` 或 `EXECUTION_UNKNOWN` | Artifact/owner | 不重复 import；不删已知 STORED；人工核对 |
| 9 | FINAL rename 不确定 | 盘上可能 CLAIMED 或 FINAL | `SAVE_UNKNOWN` → owner UNKNOWN | 底层锁 | 不重试；保留实际字节 |
| 10 | FINAL 已提交、JOINT 失败 | FINAL 在盘、资产 STORED | `EXECUTION_UNKNOWN`/`SAVE_UNKNOWN` | 底层锁 | 不重跑；后续 fresh 读判断 |
| 11 | 已 SAVED 后重开 | v3 FINAL + STORED MASTER | `EXISTING`（同 Intent）；差 Intent `INTENT_MISMATCH` | 无 | 可 status/get；0 重跑 |
| 12 | 同 task 重复同 Intent | 同上 | `EXISTING`，0 新 RVC/0 import | 无 | 只用原结论 |
| 13 | 同 task 差 Intent | 已有 SAVED/CLAIMED | `COVER_INTENT_CONFLICT`/`INTENT_MISMATCH` | 无 | 不改 ID、不换 key 绕过 |
| 14 | 旧程序遇 v3 | catalog/owner v3 | `STORE_INVALID` | 无 | fail-closed，不降级 |
| 15 | 新程序遇未知版本 | 任意未知 | `*_STORE_INVALID` | 无 | fail-closed，不迁移 |

- `UNKNOWN` 一律不自动重试、不回滚、不换 ID、不删不确定资产、不把历史 SAVED 降级。
- 中间字节只在内存/临时 manifest；中间 rename/持久库写标 **N/A**（不新建中间 store/FS 事务填表）。
- 保留 M 的 v1.6 已验 11 行机械故障事实；本表只覆盖新增 Intent/stage/cancel/lease/版本维度。

---

## 13. FUTURE：实施表与七组有限验收

### 13.1 未来实施表（全部 NOT_IMPLEMENTED，不授权本轮实现）

| 文件/接口 | 类型 | 依赖 | 说明 |
|---|---|---|---|
| `core/audio/cover-intent.mjs`（新） | 新内部模块 | `fixture-store-base-internal.mjs`（hash/stableStringify 语义） | canonical Intent + hash + 冲突比较 |
| `core/audio/cover-stage-bytes.mjs`（新） | 新内部模块 | `wav-byte-inspector.mjs`、`fixture-input-boundary.mjs` | 分离/转换/混音/验证算法与 owned bytes |
| `core/audio/cover-executor-internal.mjs`（新） | 新内部模块 | `task-owner.mjs`、`artifact-library.mjs`、`fixture-task-store-internal.mjs` | 单 claim 执行、checkpoint、cancel fence、租约 |
| `core/audio/task-catalog.mjs`（改） | 版本扩展 | 新 cover-intent | catalog v3 解析/出生 typed entry |
| `core/audio/fixture-task-store-internal.mjs`（改） | 版本扩展 | 新 cover-intent | owner v3 解析/写事务/attachment 分支 |
| `core/audio/task-owner.mjs`（改） | 新 API | 新 cover-executor | `executeCover/coverStatus/requestCoverCancel` |
| 新测试（FUTURE） | 新测试 | 上述 | 七组有限验收，不在本轮编写 |

### 13.2 七组有限验收（FUTURE）

1. **身份/源**：真 catalog、伪造跨 scope、原子出生与 legacy 抢跑 0 执行；同 Intent 0 重跑、差参数/版本/rights 冲突；父 source 不变、真实 STORED/错派生拒绝。
2. **三图/Fake bytes**：三图与清唱缺伴奏、真实输入 hash/model/pitch/gain 因果、MASTER inspection、损坏/错模型/旧 hash；合成不称真实音乐。
3. **rights/预算**：阶段与 commit 前撤权/未知/过期；item/峰值/4 MiB/32 项/pack/owner；已有项与格式/峰值 clip；缓存禁用及后续门禁。
4. **一次保存/故障**：并发/重开仅 1 claim/1 转换/1 import/1 FINAL，差 Intent 0 执行；原 pre/post/JOINT/域锁、Artifact 共享队列 delete 等待 JOINT 及 UNKNOWN 资产保留复用；仅新增 Intent/variant/checkpoint 必要差异。
5. **取消/资源**：阶段/precommit/fence 中/SAVED 后；request/ack/stop/release/cleanup 分证；忙队列仍可控制；GPU 独占/CPU-cloud 不抢；无确认 UNKNOWN 不自动重跑。
6. **旧新兼容/协议**：完整版本/方法矩阵；原公 8/私 8/root 11/19/Task 投影保持；安全捕获/getter0/budget/owned bytes/隐私/完整正负例；旧矩阵按未变证据复用。
7. **父 Fake E2E**：原 08 Fake Model/Audio/Relay 父链另有完成门禁；音频 Cover 不前置真实 12/13；动态可信 Evidence/资源各有责任；合同不关闭父 08。

### 13.3 本轮不做

- 不新增 runtime/planner/validator/reference 代码或测试；不运行阶段；不创建主任务/资产；不增加 writer/store；不调用真实模型、媒体、GPU、设备、微信或安装；不修改 M 源码/旧 v1.6/F-A 代码与测试。

---

## 14. 机械核验、来源与已知限制

### 14.1 本文件的机械核验（生成时执行，非运行时测试）

| 检查 | 结果 |
|---|---|
| 全部 JSON 代码块可 `JSON.parse` | 通过（§3.2 快照、§5.4 请求、§5.5 manifest、§7.5 attachment） |
| Intent canonical 字节长度 1,101 B、基础 SHA-256 与 §4.4 一致 | 通过（独立脚本复算） |
| 五个 Intent 变体 hash 两两不等且与基础不等 | 通过 |
| 媒体小向量 SHA-256 与 §6.4 一致（52 B WAV，44 B 头 + 8 B 数据） | 通过 |
| 预算算式：单帧 2 B、mono 524,266 帧、11888.1179 ms；base64 `4×ceil(N/3)` | 通过 |
| 字段表/状态/版本/错误矩阵与 §3–§12 相互一致 | 通过（人工+脚本交叉核对） |

> 这些检查只证明文档自洽与向量可复算，**不证明任何 FUTURE 功能已实现或已运行**。

### 14.2 来源定位

- CURRENT：`core/audio/task-catalog.mjs`、`task-owner.mjs`、`fixture-task-store-internal.mjs`、`fixture-artifact-store-internal.mjs`、`artifact-library.mjs`、`source-artifacts.mjs`、`voice-assets.mjs`、`cover-plan.mjs`、`wav-byte-inspector.mjs`；`docs/TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md` v1.6（blob `d02a8097…`）。
- 规划：PR17 `docs/plans/08-shared-core-c-voice-audio-tasks.md`、`RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md`（未合入，不代表已实现）。
- 本文件不修改上述源码、文档或 PR17。

### 14.3 已知非阻断事实

- 纯计划器（087）已在 main 合入且 OFFLINE/PLAN_ONLY；本契约不重做它。
- 保存事务 v1.6 已由 PR40 合入 main（OFFLINE/NOT_INTEGRATED）；本契约不重做保存实现。
- PR 正文/历史报告中的旧测试数量与“safe extra”措辞属于历史快照，不因本文件更新。

### 14.4 明确未实现（NOT_IMPLEMENTED）

- 全部 Cover 执行 API、catalog v3、owner v3、StageArtifact、三图字节算法、取消/租约/清理、预算预留、版本迁移与兼容矩阵。
- 真实模型权重读取/校验、真实分离/音乐/RVC 推理、GPU/设备/微信发送、安装/发布。
- 父 08 的 Catch/资源/动态 Evidence/完整 Fake E2E；本契约不关闭父阶段。

### 14.5 状态

**CONTRACT_CANDIDATE / PLANNED_RUNTIME / NOT_IMPLEMENTED / FIXTURE_ONLY / NOT_INTEGRATED。**
本文件通过只代表设计候选，不代表实现、集成或真实翻唱能力。任何后续实施必须另有正式执行单元与明确授权。
