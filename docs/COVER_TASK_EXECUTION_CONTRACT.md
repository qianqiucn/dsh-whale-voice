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
| `core/audio/task-catalog.mjs` | `openFixtureTaskCatalog({sandbox})` → `{reserve, get}` | 唯一 TaskId 签发者；`reserve` 输入恰 5 键 `schemaVersion(1)/scopeId/idempotencyKey/draft/observedAt`；`get` 输入 3 键；15 个 `TASK_CATALOG_` 错误码；磁盘 `audio-task-catalog-v1.json`，快照 `{schemaVersion, revision, entries}`，当前只接受 `schemaVersion:1` |
| `core/audio/task-owner.mjs` | `openFixtureTaskOwner({sandbox})` → `{run, get, save, artifactStatus}` | 公开 owner schema 恒 1；磁盘 owner 快照 v1/v2；22 个 `TASK_OWNER_` 错误码 |
| `core/audio/artifact-library.mjs` | `openFixtureArtifactLibrary({sandbox})` → `{import, get, readBytes, delete}` | 16 个 `ARTIFACT_LIBRARY_` 错误码；库权利域恰 2 键 `{state:'GRANTED', proofRef}`，`expiresAt` 是 entry 的独立顶层字段；单项 1,048,576 B、解码总量 4,194,304 B、条目 32、pack 6,291,456 B |
| `core/audio/source-artifacts.mjs` | `resolveFixtureTaskSource(input)` | 输入 4 键；成功 value 恰 10 键；失败 root 恰 `{ok:false,errors:[{code,path,reason}]}` |
| `core/audio/voice-assets.mjs` | `resolveFixtureVoiceBinding(input)` | 返回 binding value 恰 13 键；`binding` 内恰 8 键 |
| `core/audio/svc/rvc-fake-gateway.mjs` | Fake RVC gateway 校验/调用 | request 恰 7 键；`sourceAudioRef` 必须匹配 `^artifact:fixture-[A-Za-z0-9_-]{1,48}$`；`outputFormat` 恒 `audio/wav`；`rights` 恰 `{state:'CONFIRMED_FIXTURE'}`；context 恰 3 键，`requestId` 匹配 `^request:fixture-[A-Za-z0-9_-]{1,32}$`、`endpointId` 恒 `gateway:fixture-rvc`；返回**只有 metadata/ref，没有 bytes** |
| `core/audio/cover-plan.mjs` | `planFixtureCover(payload)` | 纯规划；PLANNED/BLOCKED、15 键 value、`taskAuthority:'UNVERIFIED'`、`outputArtifactRef:null`；**不是执行入口** |

### 2.2 CURRENT 形状

| 形状 | 恰键 |
|---|---|
| Task v1 record（16 键） | `schemaVersion, taskId, feature, taskType, source, voiceProfileId, deliveryRequested, rights, state, outputArtifactRef, cancel, delivery, lastError, observedAt, mockOnly, realOperationAllowed` |
| Task v1 终态 | `SAVED, CANCELLED, FAILED, UNKNOWN`（另有 CREATED/BLOCKED_RIGHTS/PROCESSING 等既有态） |
| catalog 快照（3 键） | `schemaVersion, revision, entries` |
| catalog entry（4 键） | `scopeId, idempotencyKey, identityHash, record` |
| owner 快照（3 键） | `schemaVersion, revision, entries` |
| owner entry（6 键） | `scopeId, taskId, birthIdentityHash, phase, record, completion` |
| `identityHashOf(record)` | `sha256(JSON.stringify({schemaVersion, feature, taskType, source:{kind,ref}, voiceProfileId, deliveryRequested, rights:{state}}))`，UTF-8；不含配方/pitch/模型修订 |
| 库 entry（公有投影 8 键） | `artifactRef, scopeId, requestKey, origin, createdAt, expiresAt, rights, inspection`；`rights` 恰 2 键 `{state, proofRef}` |
| 库读取 | `readStoredForSave({scopeId, artifactRef})` 返回 import 事务可直接使用的 STORED 事实；`readBytes({scopeId, artifactRef, now})` 返回 owned bytes；`import` 返回合法 ref |
| 私有 SaveProof.artifact（8 键） | `artifactRef, identityHash, byteSha256, byteLength, expiresAt, requestKey, rights, inspection` |
| SaveProof root（11 键） | `schemaVersion, scopeId, taskId, birthIdentityHash, birthObservedAt, claimRevision, claimDigest, candidateRevision, recordIdentityHash, artifact, evaluatedAt` |
| WAV inspection（19 键） | `schemaVersion, format, codec, bitsPerSample, sampleRate, channels, byteLength, dataByteLength, frameCount, durationMs, peak, fullScaleSampleCount, sha256, validationState, mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed, messageZh` |
| canonical pack entry（11 键） | `artifactRef, scopeId, requestKey, identityHash, origin, createdAt, expiresAt, rights, inspection, payload, deletedAt` |
| Artifact pack v1 root（4 键） | `schemaVersion, sandboxId, revision, entries` |

### 2.3 CURRENT 队列/锁与版本事实

- `STATES = new WeakMap()`；`state {sandbox, tail, locked, files}`；catalog 与 owner **共享同一 capability 写队列**；Artifact 有独立队列；跨域固定 Task→Artifact 顺序。
- `locked` 为 capability 级 unknown 锁：一旦不确定，该 capability 的 owner/catalog 操作全部 fail-closed。
- revision：每次持久写 +1：claim = current+1；FINAL = claimRevision+1（相对 claim 再 +1）；**没有 final=+2/权重 2**。多任务按每次 CLAIMED/FINAL 各 +1 累计。

### 2.4 CURRENT 身份/容量事实

- catalog 出生 `identityHash` 只覆盖 8 个 identity 字段，不含 pitch/模型修订/recipe/outputProfile。
- `task.source` 出生后不可变；旧 voice resolver 要求 Provider 源 ref 与父 source 同 ref。
- legacy `save` 硬绑定唯一 bytes engine（会再跑一次 RVC）；`run` 一旦 FINAL 不能“续存”。
- owner 131,072 B / 32 条；Artifact 单项 1,048,576 B；解码 4,194,304 B；pack 6,291,456 B。
- 44,100 Hz mono 上限 524,266 帧 ≈ 11,888.1179 ms；stereo 262,133 帧。

---

## 3. FUTURE：身份模型与出生（092-R01）

### 3.1 唯一机制与信任边界

**Cover 是原父 AudioTask v1（`feature:'singing'`, `taskType:'SVC'`）的版本化 intent；不是新主 taskType、不是第二 TaskManager、不新签主 TaskId/DeliveryId。**

- **公开 schema 不变**：catalog/owner/Task 公开 `schemaVersion` 恒 1；公开 catalog handle 仍只有 `reserve/get`，公开 owner handle 仍只有 `run/get/save/artifactStatus`。
- **不新增公开出生方法**：Cover 出生由未来内部模块 `cover-birth-internal.mjs` 的 `createCoverTask({sandbox, scopeId, idempotencyKey, intentDraft, observedAt})` 执行；它在**同一受信 sandbox** 内自己打开 Artifact 库、自己读 STORED 字节/权利/expiry/inspection，然后调用 catalog 的**内部写入函数**（非公开 API）完成原子出生。调用者只能提交 `intentDraft` 与 `(scopeId, key)`，**不能提交 sourceEntry/sourceHash/rights 快照**，因此无法伪造出生事实。
- **私有磁盘版本**：catalog 快照 `schemaVersion:3`（typed legacy/Cover entry）；owner 快照 `schemaVersion:3`（Cover variant）；Artifact pack 保持 v1。`3` 只出现在磁盘文件，不出现在公开请求/响应。
- 单一 authority：catalog 唯一签发 taskId；唯一 owner writer 仍是 `openOwnerFile(...).write`；不设第二 writer/authority/store。

### 3.2 内部出生协议 `createCoverTask(request)`

内部 request 恰 **5 键**：`{schemaVersion:1, scopeId, idempotencyKey, intentDraft(19 键, §4.1), observedAt}`。

**权威读源（唯一，不信任调用者）**：

1. 打开同 sandbox Artifact 库，按 `intentDraft.sourceRef` 取 STORED entry：
   - `readStoredForSave({scopeId, artifactRef})` 取得 entry 事实（含顶层 `expiresAt`、2 键 `rights`、`inspection`、`requestKey`、`createdAt`、`origin`）；
   - `readBytes({scopeId, artifactRef, now})` 取 owned copy；
   - 用原 `inspectFixtureWavBytes` 复检，要求 `inspection.sha256 === byteSha256`、`byteLength` 一致；
   - 校验：`state==='STORED'`、`rights.state==='GRANTED'`、`proofRef` 非空 1..128、`expiresAt` 为非空 canonical ISO 且 `> observedAt`；
   - 计算稳定源身份（7 字段，§4.5）。
2. 任一失败：`TASK_CATALOG_COVER_INPUT_INVALID`（格式/枚举）或 `TASK_CATALOG_DEPENDENCY_FAILURE`（库读取不确定），**不落盘、不签 ID**。
3. 用实测事实组装 `sourceFacts`（8 键，§5.1），再执行 §3.3 的幂等/出生顺序。

**出生顺序（唯一，无二次签号）**：

1. 以 `(scopeId, idempotencyKey)` fresh 读 catalog：
   - 有 legacy entry → `TASK_CATALOG_COVER_INTENT_CONFLICT`。
   - 有 Cover entry → 用该 entry 的已签发 `taskId`/`observedAt`/`birthIdentityHash` + 本次 `intentDraft` + **本次实测 sourceFacts** 重算 intent/hash：完全相等 → `EXISTING`（0 新 ID/0 改盘）；不等 → 冲突，0 改盘。
2. 无 entry → 才签发 `taskId`；`record` 用 §3.2 模板；组装 `intent`（25 键）与 Cover entry（9 键）；**单次 temp+fsync+单 rename** 写 v3 快照（原子出生）。
3. 首次 Cover 出生把既有 legacy entry 原样带入 v3；不自动迁移旧文件。
4. 任一步失败不落盘、不签 ID；rename/digest 不确定 → `TASK_CATALOG_CATALOG_UNKNOWN` + capability 锁。

成功 value 恰 9 键：`{schemaVersion:1, outcome, taskId, scopeId, idempotencyKey, intentHash, intent, record, messageZh}`；`outcome ∈ {CREATED, EXISTING}`。

### 3.3 同键/重复矩阵（唯一）

| 现有 entry \ 新 `createCoverTask` | 重算 intent 相等 | 重算 intent 不等 | 新请求为 legacy `reserve` |
|---|---|---|---|
| 无 entry | 正常出生（CREATED） | 正常出生 | 正常 legacy 出生 |
| legacy entry | `TASK_CATALOG_COVER_INTENT_CONFLICT` | 同左 | `EXISTING`（原 legacy 行为） |
| Cover entry | `EXISTING`（0 新 ID/0 改盘） | `TASK_CATALOG_COVER_INTENT_CONFLICT` | `TASK_CATALOG_IDEMPOTENCY_CONFLICT` |
| 存储不确定 | `TASK_CATALOG_CATALOG_UNKNOWN` + 锁 | 同左 | 同左 |

同队列串行；任何分支都不产生第二个出生/第二 taskId。

### 3.4 四个新 owner 方法的统一 envelope

未来 owner handle 增加 **4 个**方法：`executeCover`、`coverStatus`、`requestCoverCancel`、`resumeCoverFinal`（原四方法不变）。所有新方法的**公开根形状只有两种**：

- 成功：`{ok:true, value:<恰键对象>}`；`value` 为新建 plain 对象、深冻结、无 accessor/symbol/隐藏键。
- 非成功：`{ok:false, errors:[{code,path,reason}]}`，**恰 1 个** error、恰 3 个字符串键；不返回 `value`、不回显输入/异常 message/路径。

请求安全捕获复用 M `copyFixtureInput` 边界（4096 values、depth 12、32 keys、256 items、8192 code units、getter 0）。响应 own-data；`coverStatus.value.tempArtifacts ≤ 8`、`stages ≤ 4`、字符串 ≤ 8192。

**内层 value 形状**（在 `ok:true.value` 内）：

| 方法 | 内层 value 恰键 |
|---|---|
| `executeCover` | 6 键 `{schemaVersion, outcome, attemptId, statusState, messageZh, value}`；`value` 仅 SAVED 时为 8 键 master 投影，其余 outcome 恒 `null` |
| `resumeCoverFinal` | 同 executeCover（6 键；`resume` 也返回 outcome，仅 SAVED/CANCELLED/FAILED/UNKNOWN 之一且 value 只在 SAVED 非 null） |
| `coverStatus` | 15 键（§7.1） |
| `requestCoverCancel` | 5 键（§7.1） |
| 出生（内部） | 9 键（§3.2） |

非 SAVED 的完整合法类型表：

| outcome | attemptId | value | statusState | 说明 |
|---|---|---|---|---|
| SAVED | 非空 | 8 键 | SAVED | 唯一带 master 的 outcome |
| EXISTING | 非空（进行中/已存） | null | 当前 state | 0 重跑；`statusState` 反映当前 |
| BLOCKED | null（未 claim） | null | NO_ATTEMPT | 出生/资源/权利等拒绝，0 执行 |
| CANCELLED | 非空 | null | CANCELLED | 终态 |
| FAILED | 非空 | null | FAILED | 终态 |
| UNKNOWN | 非空或 null | null | UNKNOWN | 只读，不重跑 |

完整固定错误示例见 §7.9（含 `{ok:false,errors:[…]}` 根）。

### 3.5 方法兼容矩阵（旧/新 client × legacy/Cover × 状态）

| 调用者/对象 | legacy 出生 | Cover 出生（在途） | Cover 出生（FINAL SAVED） | Cover 出生（FINAL 非 SAVED） | owner/catalog v3 |
|---|---|---|---|---|---|
| 旧 client `run/save/get/artifactStatus` | 原行为 | `TASK_OWNER_STORE_INVALID`（旧 parser 不认 v3，0 执行、0 改盘） | 同左 | 同左 | 同左 |
| 新 client `executeCover` | `TASK_OWNER_COVER_BIRTH_REQUIRED` | 当前状态（`EXISTING`，不重跑） | `EXISTING` | 终态（CANCELLED/FAILED/UNKNOWN，不重跑） | fail-closed |
| 新 client `coverStatus` | `BIRTH_REQUIRED` | 进度/租约/取消 | SAVED | 终态 | fail-closed |
| 新 client `requestCoverCancel` | `BIRTH_REQUIRED` | 按 §8.2 区域表 | `TOO_LATE` | 固定终态响应 | fail-closed |
| 新 client `resumeCoverFinal` | `BIRTH_REQUIRED` | 仅 checkpoint4 receipt 可完成 FINAL | `EXISTING` | 终态 | fail-closed |

- 旧 client 只可能看到 `TASK_OWNER_STORE_INVALID`/`TASK_CATALOG_STORE_INVALID`，**不会看到任何新 Cover 码**（新码只经新方法返回）。
- 新 client 对 legacy 出生一律 `BIRTH_REQUIRED`；不隐式升级/不换 ID。
- 所有拒绝分支 0 改盘；读取分支只 fresh 读。

## 4. FUTURE：Intent 规范

### 4.1 intentDraft 恰 19 键 / 完整 Intent 恰 25 键

`intentDraft`（调用者提交，19 键）：`intentVersion(1), scopeId, sourceRef, sourceRevision(≥1), rightsState('GRANTED'), rightsProofRef(1..128), rightsExpiresAt(非空 ISO), voiceProfileId, profileRevision(≥1), modelAssetId, modelRevision(≥1), modelIntegrityTruth('DECLARED_FIXTURE'), instanceId, candidateId('rvc'), modelRef, backendRevision(1), pitchShift(-12..12), recipe(5 键), outputProfile(4 键)`。

完整 `intent`（25 键）= intentDraft 19 键 + `taskId`（catalog 签发）+ `birthIdentityHash`（identityHashOf(record)）+ `birthObservedAt`（request.observedAt）+ `sourceEntryIdentityHash`/`sourceByteSha256`/`sourceByteLength`（内部实测 sourceFacts）。调用者不能自填这 6 个字段。

**canonical 字段顺序（25 个，唯一）**：`intentVersion, taskId, scopeId, birthIdentityHash, birthObservedAt, sourceRef, sourceEntryIdentityHash, sourceByteSha256, sourceByteLength, sourceRevision, rightsState, rightsProofRef, rightsExpiresAt, voiceProfileId, profileRevision, modelAssetId, modelRevision, modelIntegrityTruth, instanceId, candidateId, modelRef, backendRevision, pitchShift, recipe, outputProfile`（recipe 子序 `sourceLayout, separationPreset, mixMode, vocalGainDb, instrumentalGainDb`；outputProfile 子序 `format, codec, sampleRate, channels`）。

### 4.2 recipe / outputProfile

- `recipe`：`sourceLayout ∈ MIXED|CLEAN_VOCAL`；`separationPreset ∈ NONE|FIXTURE_TWO_STEM`（MIXED↔FIXTURE_TWO_STEM、CLEAN_VOCAL↔NONE）；`mixMode ∈ VOCAL_ONLY|WITH_INSTRUMENTAL`；gains 为整数 -24..12；VOCAL_ONLY 时 instrumental=0；CLEAN_VOCAL+WITH_INSTRUMENTAL 出生即拒绝。
- `outputProfile`：`format:'WAV'`；`codec:'PCM_S16LE'`；`sampleRate ∈ {16000,22050,24000,32000,44100,48000}` 且等于源实测；**channels 只允许 1**（Fake RVC 仅 mono）；否则 `COVER_INPUT_INVALID`，不重采样。

### 4.3 Canonical 形式与 hash

按 §4.1 的 25 字段固定顺序拼接，无空白；字符串标准 JSON 转义、不 trim/不归一化；整数十进制（`-0→0`）；`null` 写 `null`；子对象固定子序。UTF-8 后 SHA-256 即 `intentHash`。排除调度/进度/attemptId/临时句柄。

### 4.4 canonical 向量（合法正例，含非空 expiry）

`birthIdentityHash = bf3c034eb609624d27f8d3994c9b5b86500eca247a7171e27466bf4c212ffedc`；canonical 字节 **1140 B**；基础 `intentHash`：

```
c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35
```

| 单字段变体 | intentHash |
|---|---|
| `sourceByteSha256` → `d4…d4` | `2d374e51ccb020cfb905338a5c9a19fab7e91c5b42b984c4cbc9d39009e0a8c3` |
| `pitchShift` → 7 | `5b0d1e3b41ac69844bb5b36d9498c4059005df3d719e77e9a53b9395eeb0c8a7` |
| `modelRevision` → 2 | `10404b39418ef35ea106ef1c418c8bef8d614b5747ff01171a3d61993cd7e928` |
| `vocalGainDb` → -6 | `e487db0c8ca340a135319dc356012408f8bdad50975b7da7a6aad8ecbd2cd76d` |
| `rightsState` → `REVOKED`（仅负向 canonical 数据） | `701d72fe81364b2f898d55b6f32990d9461ea97c1ac094b1e3f9967d3c3c7027` |

负例：`REVOKED` 在入口枚举即 `COVER_INPUT_INVALID`，不进入合法冲突分支。

### 4.5 稳定源身份（sourceEntryIdentityHash）

`SHA256(UTF-8(canonical {artifactRef, scopeId, requestKey, origin, createdAt, byteSha256, byteLength}))`（7 字段固定顺序）。示例：

```
04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61
```

规则：库 import 事务落盘并 fresh 读回后由内部出生代码计算；`createdAt` 参与，因此同 ref 删除重建必变；`expiresAt` 不参与该 hash，但作为独立事实参与权利/过期校验并被复制到 Intent。


---

## 5. FUTURE：真实源、Provider 适配与 Stage 来源（092-R02）

### 5.1 实测 sourceFacts（8 键，仅内部产生）

| 字段 | 来源（内部出生代码） | 说明 |
|---|---|---|
| `artifactRef` | `readStoredForSave` / 库投影 | 物理 ref，必须匹配 `^artifact:fixture-bytes-[0-9a-f]{32}$` |
| `scopeId` | 库条目 | 必须等于请求 scope |
| `requestKey` | 库条目 | 该次 import 的请求键 |
| `origin` | 库条目 | `FIXTURE_IMPORT` 等 |
| `createdAt` | 库条目 | canonical ISO |
| `byteSha256` | `readBytes` + 原 inspector | 真实字节 hash |
| `byteLength` | inspector | 真实长度 |
| `expiresAt` | 库 entry 顶层字段 | **非空 canonical ISO**，`expiresAt > observedAt` |

- `rights` 单独为库 2 键 `{state:'GRANTED', proofRef}`；**不存在 rights.expiresAt 子字段**；Intent `rightsExpiresAt` 复制 `sourceFacts.expiresAt`。
- 出生时该对象只在内部代码内构造，不经过公开 JSON；`reserveCover` 不存在（§3.1），因此调用者无法自造。
- 执行时重新执行同一读源流程，逐字段对照 Intent；任一不符按 §11.3 优先级拒绝。

### 5.2 声明权利 vs 库权利（映射，不放宽旧库）

| 域 | 字段 | 允许值 | 用途 |
|---|---|---|---|
| Task 出生声明 | `taskDraft.rights.state` | `CONFIRMED_FIXTURE` | 仅出生声明 |
| 库（权威） | entry.`rights`（2 键） | `{state:'GRANTED', proofRef(1..128)}` | 真实保存/执行门禁 |
| 库（权威） | entry.`expiresAt` | 非空 ISO | 真实过期门禁 |
| Intent | `rightsState`/`rightsProofRef`/`rightsExpiresAt` | 复制库事实 | 出生绑定与执行对照 |

出生/执行/提交前各一次 fresh 校验；`CONFIRMED_FIXTURE`（Task）与 `GRANTED`（库）是**契约映射**，不合并字段、不改旧库 schema。

### 5.3 父 source.ref 绑定

- 父 `source.ref` 必须是物理库 ref，且就是 `sourceFacts.artifactRef`；旧 `artifact:fixture-source-1` 不是物理条目，不能作为 Cover 源。
- 无静默 alias/前缀改写/按 scope 猜条目；缺失 → `COVER_SOURCE_UNAVAILABLE`，不改父 source。
- 逐字段对照：scope 相同、ref 相同、inspection/byteSha/byteLength 相同、rights/expiry 相同、父 `task.source` 永不变。

### 5.4 稳定源版本与声明 revision 映射

| 事实 | 来源 | 变化准则 |
|---|---|---|
| `source.ref` | 出生（不可变） | 永不变 |
| `sourceRevision`（声明） | 调用者 | 不权威，不参与 identityHash |
| pack `revision` | 库整包 | 随任意入库/删除变化，不当源版本 |
| `requestKey`/`createdAt` | 库 entry | 同 ref 重建必变 |
| `sourceEntryIdentityHash` | 内部计算（§4.5） | 任一 7 字段变化即变 |
| `byteSha256`/`byteLength` | 实测 | 真实字节事实 |

执行时 fresh 重算 7 字段 hash；不等 → `COVER_SOURCE_CHANGED`；条目缺失/不可读 → `COVER_SOURCE_UNAVAILABLE`；不换 ref/不重签 ID。

### 5.5 派生 VOCAL → 真实 Provider 适配（按 M 实际校验）

适配器 `buildCoverStageRequest`（FUTURE）输出 M 原 gateway **恰好认可的** request（7 键）+ context（3 键）：

| 字段 | 取值 | 必须满足的 M 校验 |
|---|---|---|
| `schemaVersion` | 1 | 原 schema |
| `sourceAudioRef` | `artifact:fixture-vocal-<16 hex>`（内部派生句柄） | `^artifact:fixture-[A-Za-z0-9_-]{1,48}$` |
| `targetModelId` | `intent.modelRef` | 原模型引用校验 |
| `pitchShift` | `intent.pitchShift` | 原范围校验 |
| `outputFormat` | `'audio/wav'` | 恒 `audio/wav` |
| `inputAudio` | 派生 owned bytes 的**实测** `{durationMs, byteLength, sampleRate, channels}` | 原 inputAudio 校验 |
| `rights` | `{state:'CONFIRMED_FIXTURE'}`（gateway 域） | gateway 恰 2 键枚举 |
| context.requestId | `request:fixture-cover-<16 hex>` | `^request:fixture-[A-Za-z0-9_-]{1,32}$` |
| context.endpointId | `gateway:fixture-rvc` | 恒等 |
| context.scenario | `SUCCESS` | 6 个有效 scenario 之一 |

- **网关只返回 metadata/ref，不返回 bytes**。转换后的 owned bytes 由内部 `cover-stage-bytes.mjs` 按 §6 算法从输入 owned bytes 产生；网关返回值只用于一致性校验（`artifactRef/mime/sampleRate/durationMs/status/cancel`），不得当字节源。
- 不重跑旧 save 的二次 RVC、不新增 dispatcher/gateway、不把派生句柄当物理库 ref（它不进入库/proof）。
- 调用前内部校验派生字节 hash/inspection/mono/时长；调用后校验元数据一致；失败映射 `COVER_DEPENDENCY_FAILURE`/`COVER_STAGE_REJECTED`。

### 5.6 三图 Stage 来源/输入表

| 图 | 阶段 | inputs | outputs | truthLevel |
|---|---|---|---|---|
| MIXED / WITH_INSTRUMENTAL | SEPARATING | SOURCE | VOCAL, INSTRUMENTAL | MEASURED_SYNTHETIC |
| 同上 | CONVERTING | VOCAL | CONVERTED_VOCAL | MEASURED_SYNTHETIC |
| 同上 | MIXING | CONVERTED_VOCAL, INSTRUMENTAL | MASTER | MEASURED_SYNTHETIC |
| 同上 | VERIFYING | MASTER | VERIFIED_MASTER（同字节别名） | MEASURED_SYNTHETIC_VERIFIED |
| MIXED / VOCAL_ONLY | 同上 | MIXING 只吃 CONVERTED_VOCAL | MASTER | 同上 |
| CLEAN_VOCAL / VOCAL_ONLY | CONVERTING | **SOURCE**（无 VOCAL） | CONVERTED_VOCAL | MEASURED_SYNTHETIC |
| 同上 | MIXING | CONVERTED_VOCAL | MASTER | 同上 |
| 同上 | VERIFYING | MASTER | VERIFIED_MASTER | 同上 |

- SOURCE `origin=FIXTURE_IMPORT`、`truthLevel=MEASURED_STORED_FIXTURE`；派生的 `origin=SYNTHETIC_FIXTURE`、`truthLevel=MEASURED_SYNTHETIC`；MASTER 为 `MEASURED_SYNTHETIC_VERIFIED`。
- parentLinks 按 inputs 顺序；sequence 图内 0..3。

### 5.7 StageArtifact manifest（完整 24 键 + 中间 7 键 compact）

**完整 manifest（24 键，用于 SOURCE/MASTER）**：`manifestVersion, taskId, scopeId, intentHash, attemptId, role, producedByStage, sequence, parentLinks, rootSourceIdentityHash, rootSourceSha256, byteLength, byteSha256, inspection, mediaProfile, rights, expiresAt, modelRevision, profileRevision, backendRevision, origin, truthLevel, availability, verification`。

**compact（7 键，用于 VOCAL/INSTRUMENTAL/CONVERTED_VOCAL）**：`role, producedByStage, sequence, byteSha256, byteLength, parentLinks, availability`。

| 字段 | 完整 Stage | compact |
|---|---|---|
| `availability` | `{TEMP_OWNED, CLEANED, UNKNOWN, STORED}` | `{TEMP_OWNED, CLEANED, UNKNOWN}` |
| `verification` | 4 键 `{state:'PASSED'|'FAILED'|'NOT_RUN', inspectedAt, inspector:'FIXTURE_WAV_CHECKED', masterSha256}` | 无 |
| `inspection` | 19 键 | 无（**compact 不是完整 StageArtifact**） |
| 写入时点 | 阶段完成时（TEMP_OWNED）→ 入库后 STORED → 清理后 CLEANED | 阶段完成时写 compact |
| `rights` | 2 键 `{state:'GRANTED', proofRef}` | 无 |

- 内存载体（4 键）：`{bytes, byteLength, sha256, inspection}`，owned copy；持久快照只写 manifest/compact，不写 bytes。
- 旧 shape 映射：source audio4（声明）≠ 公有 metadata8 ≠ proof artifact8 ≠ root11 ≠ inspection19 ≠ pack entry11 ≠ pack root4；MASTER 以普通 STORED 条目入库，中间产物不冒充 STORED/ref。

---

## 6. FUTURE：三图字节算法与向量

### 6.1 媒体 profile

PCM16 LE、WAV 44 B canonical 头；`sampleRate ∈ {16000,22050,24000,32000,44100,48000}`；**channels 恒 1**；`dataByteLength = frameCount × 2`；`byteLength = 44 + dataByteLength ≤ 1,048,576`；16-bit 域、`Math.trunc` 取整、输出 clamp `[-32768,32767]`；不使用浮点 pow/sin/随机。

### 6.2 算法

1. **SEPARATING**：`vocal = trunc(s/2)`；`instrumental = s − vocal`。
2. **CONVERTING**：`factor = 1000 + 25 × pitchShift`（700..1300）；`converted = clamp(trunc((vocal × factor) / 1000))`；模型/backend revision 不影响合成字节。
3. **MIXING**：WITH_INSTRUMENTAL `clamp(trunc((converted×F(vocalGainDb) + instrumental×F(instrumentalGainDb))/1000))`；VOCAL_ONLY `clamp(trunc((converted×F(vocalGainDb))/1000))`。
4. **VERIFYING**：对 MASTER 实际字节调用原 inspector 一次，要求 19 键与声明 inspection 完全相等、sha256 一致；不生成第二 MASTER。
5. 越界 → `COVER_RESOURCE_LIMIT`/`COVER_STAGE_REJECTED`，不截断。

### 6.3 gain 表 F(dB)（整数 permille）

| dB | -24 | -23 | -22 | -21 | -20 | -19 | -18 | -17 | -16 | -15 | -14 | -13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F | 63 | 71 | 79 | 89 | 100 | 112 | 126 | 141 | 158 | 178 | 200 | 224 |

| dB | -12 | -11 | -10 | -9 | -8 | -7 | -6 | -5 | -4 | -3 | -2 | -1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F | 251 | 282 | 316 | 355 | 398 | 447 | 501 | 562 | 631 | 708 | 794 | 891 |

| dB | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F | 1000 | 1122 | 1259 | 1413 | 1585 | 1778 | 1995 | 2239 | 2512 | 2818 | 3162 | 3548 | 3981 |

### 6.4 小向量（不变，复用 0092 复算）

源 4 帧 mono 44100 `[1000,-2000,32767,-32768]`，52 B：

| 产物 | SHA-256 |
|---|---|
| SOURCE | `11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd` |
| VOCAL | `3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2` |
| INSTRUMENTAL | `5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f` |
| CONVERTED p0 | `3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2` |
| CONVERTED p+7 | `63db9d5f601f19613d1056d7c7ecc1cb2f8f3ab16a97d873c1cae751d7725c8f` |
| MASTER 0 dB | `11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd` |
| MASTER vocal −6 dB | `751a15a688306c0dee934c113675b488393d126bb181e0fe9dbe69a2ac4e94b7` |

---

## 7. FUTURE：执行 API、单 claim 事务、checkpoint/receipt、恢复

### 7.1 四方法 request/result

**executeCover request 恰 8 键**：`{schemaVersion:1, scopeId, taskId, requestKey, now, expiresAt, rights:{state:'GRANTED',proofRef}, intent(25 键)}`。

**executeCover 内层 value 6 键**：`{schemaVersion, outcome, attemptId, statusState, messageZh, value}`；outcome 表见 §3.4。

**coverStatus request 恰 4 键**：`{schemaVersion, scopeId, taskId, now}`；内层 value 恰 15 键：
`schemaVersion, state, phase, attemptId, attemptSeq, intentHash, stages, cancel, lease, tempArtifacts, master, lastError, messageZh, createdAt, updatedAt`。
- `state ∈ {NO_ATTEMPT, CLAIMED, SEPARATING, CONVERTING, MIXING, VERIFYING, FINALIZING, SAVED, CANCELLED, FAILED, UNKNOWN}`。
- `stages` 0..4 项 `{stage,status}`；`tempArtifacts` 0..8 项 `{role,byteLength,sha256,availability}`；`lease`/`cancel`/`master`/`lastError` 见 §7.2。

**requestCoverCancel request 恰 5 键**：`{schemaVersion, scopeId, taskId, attemptId, now}`；内层 value 恰 5 键：`{schemaVersion, cancelRequested, cancelState, acknowledgedAt, messageZh}`；`cancelState ∈ {ACCEPTED, ACKNOWLEDGED, STOPPED, TOO_LATE}`（不可读时走错误码，不出现 UNKNOWN cancelState）。

**resumeCoverFinal request 恰 6 键**：`{schemaVersion, scopeId, taskId, attemptId, requestKey, now}`；内层 value 同 executeCover 6 键；仅允许 CLAIMED + checkpoint4 receipt（§7.5），0 第二 import。

### 7.2 owner v3 Cover entry（14 键）

`entryVersion, kind, scopeId, taskId, birthIdentityHash, phase, record, completion, intentHash, intent, attempt, checkpoints, manifest, cancel`

- `phase ∈ {CLAIMED, FINAL}`；`completion`：CLAIMED 为 null；FINAL 为 `{kind:'SAVED'|'CANCELLED'|'FAILED'|'UNKNOWN', reason}`。
- `attempt` 8 键：`{attemptId, attemptSeq(恒1), requestKey, startedAt, finishedAt|null, status, error, lease}`；`status ∈ {CLAIMED,RUNNING,SAVED,CANCELLED,FAILED,UNKNOWN}`。
- `checkpoints` 0..6 项，每项 **6 键**：`{index, stage, at, status, tempSummary, importReceipt}`；`stage ∈ {CLAIMED,SEPARATED,CONVERTED,MIXED,MASTER_IMPORTED,VERIFIED}`；`tempSummary={role,byteSha256,byteLength}|null`；`importReceipt` 仅在 index 4 非 null。
- `importReceipt` 恰 5 键：`{artifactRef, byteSha256, byteLength, expiresAt, requestKey}`——**唯一物理 ref 存放位置**（§7.5）。
- `manifest` 6 槽：`source`（24 键或 null）、`vocal`/`instrumental`/`converted`（7 键 compact 或 null）、`master`（24 键或 null）、`verification`（4 键或 null）。
- `cancel` 5 键。

### 7.3 revision 与 FINAL proof（fresh 快照）

- 持久写：claim = current+1；checkpoint = **不变**；FINAL = claimRevision+1。
- FINAL 的 proof 必须绑定**当时 fresh 完整 CLAIMED 快照**：`proof.claimRevision`/`claimDigest` = 读取时的当前 v3 快照 revision 与 digest（含其他任务条目、本任务全部 checkpoint），`proof.candidateRevision = claimRevision + 1`；不得使用最初 claim 的旧 digest。
- 有限时序示例：A claim（rev1, digestD1）→ B（其他任务）正常 FINAL（rev2, digestD2）→ A FINAL：proof.claimRevision=2、claimDigest=D2、candidateRevision=3；A 的 FINAL 写必须接受 B 的条目并保持其原样。
- 单任务示例：出生 rev0 → claim rev1 → 6 checkpoint 仍 rev1 → FINAL rev2。

### 7.4 锁序与短临界区（092-R04）

固定 **Task(owner/catalog) → Artifact**；最终短临界区**同时持有 Artifact 穿过唯一 import → FINAL writer → JOINT**：

| 步骤 | 持锁 | 动作 |
|---|---|---|
| 出生 | catalog 队列 | 原子 v3 快照 |
| claim/checkpoint | owner 队列 | 短写（revision +1 / +0） |
| 阶段计算 | 无队列 | owned bytes/inspector |
| **FINAL 临界区** | **owner 队列 → Artifact 队列（同一短临界区）** | import MASTER → FINAL writer（含 proof/attachment）→ JOINT fresh 读 → 释放 Artifact → 释放 owner |
| cancel | 侧通道 + owner 短写 | 不反向等待 Artifact |

- 长阶段在全局队列之外；重新取得时 fresh 核 digest/权限/版本。
- 共享库 delete 在 Artifact 队列上等待，因此不能插进 import 与 FINAL/JOINT 之间（冻结 v1.6 的 delete 等待 JOINT 语义保持）。
- 不使用 queue-free 读冒充互斥。

### 7.5 checkpoint 与唯一 import receipt

6 个持久点：CLAIMED(0)、SEPARATED(1)、CONVERTED(2)、MIXED(3)、MASTER_IMPORTED(4)、VERIFIED(5)；每 attempt 每点最多一次；revision 不变；不写 record.state。

- **MASTER_IMPORTED 的同一短写**必须写入 `checkpoint[4].importReceipt`（5 键）与 `manifest.master`（24 键完整 manifest）：
  - `importReceipt = {artifactRef, byteSha256, byteLength, expiresAt, requestKey}`（库返回的真实 ref）；
  - `manifest.master` 不含 artifactRef（24 键固定），但含 `byteSha256/byteLength/inspection/availability='STORED'`；
  - 因此重开时**唯一物理 ref 来自 importReceipt**，不按 hash 搜索猜测。
- checkpoint 4 写失败/rename 不确定 → UNKNOWN；不得凭 hash 重建 ref。

### 7.6 writer 签名与 coverAttachment（delta-only）

- 未来签名：`writeOwner(state, bytes, baseDigest, revision, proof=null, coverAttachment=null)` → `openOwnerFile(state).write(...)`；旧 4 参调用不变。
- `coverAttachment` 只在“本次 delta 的唯一新增 Cover SAVED FINAL”时非 null；历史 SAVED/checkpoint/取消/失败必须 null；仅本次 import 的 MASTER 使用。
- attachment 恰 **7 键**：`{attachmentVersion, intentHash, attemptId, sourceEntryIdentityHash, lineage:{sourceSha256, vocalInputSha256, instrumentalSha256|null, convertedSha256}, masterSha256, verification:{validationState, peak, fullScaleSampleCount, durationMs}}`。
- **lineage 语义**：`vocalInputSha256` = 转换阶段实际输入 bytes 的 hash：MIXED 图为 VOCAL 的 compact hash；CLEAN 图为 SOURCE 的 hash（此时 `manifest.vocal` 为 null）；`instrumentalSha256` 仅 WITH_INSTRUMENTAL 非 null，其余 null。
- **verification 对照（两种形状不直接相等）**：

| attachment.verification | 来源 | 与 manifest.verification 的关系 |
|---|---|---|
| `validationState='FIXTURE_WAV_CHECKED'` | master inspection.validationState | 要求 `manifest.verification.state==='PASSED'` 且 `inspector==='FIXTURE_WAV_CHECKED'` |
| `peak` / `fullScaleSampleCount` / `durationMs` | master inspection 同名字段 | 与 master manifest.inspection 对应字段逐一相等 |
| （无 inspectedAt/inspector/masterSha256） | — | `manifest.verification.inspectedAt/inspector/masterSha256` 单独校验；`masterSha256` 与 proof.artifact.byteSha256 相等 |

- writer 校验：7 键/深冻结/own-data；`masterSha256===proof.artifact.byteSha256===manifest.master.byteSha256`；`intentHash`/`attemptId`/`sourceEntryIdentityHash` 与 entry/intent 相等；lineage 与 compact/master manifest 按上表逐一相等；任一不符 → `WRITE_REJECTED` 无锁。

### 7.7 终态可空条件与投影（092-R03）

| 终态 | manifest.source | manifest.master | manifest.verification | record.state | outputArtifactRef | lastError |
|---|---|---|---|---|---|---|
| SAVED | 必须 24 键 | 必须 24 键 | 必须 4 键 PASSED | `SAVED` | 真实 ref | null |
| CANCELLED | 若已过 checkpoint1 则必须；claim 级取消可 null | 已 import 则必须（含 receipt）；否则 null | master 非 null 时必须，否则 null | `CANCELLED` | null | null |
| FAILED | 若已过 checkpoint1 则必须；更早失败可 null | 仅当失败发生在 import 后 | 同 master | `FAILED` | null | `{code}` |
| UNKNOWN | 不写 FINAL（保持 CLAIMED） | — | — | 保持出生态 | null | — |

- 旧 `get` 投影：SAVED→`SAVED`；CANCELLED/FAILED→`UNKNOWN`（旧读者不谎报）；UNKNOWN→`UNKNOWN`；新 `coverStatus` 显示精确终态。
- 不写假 MASTER 满足 FINAL；`completion.kind` 与 record 状态一一对应。

### 7.8 崩溃/重开/执行去重（092-R05）

| 崩溃点 | 持久事实 | 重开结果 | 允许动作 |
|---|---|---|---|
| claim 后、SEPARATED checkpoint 前 | CLAIMED+checkpoint0 | UNKNOWN（无法证明未转换） | 只读；**不重跑** |
| 转换后、checkpoint1/2 写前 | CLAIMED+旧 checkpoint | UNKNOWN | 只读；不重算 |
| MASTER import 后、checkpoint4 写前 | 库可能多 STORED；owner 无 receipt | UNKNOWN | 只读；不第二 import/不删已知资产 |
| checkpoint4 已写（含 receipt）、FINAL 前 | CLAIMED+receipt+master manifest | **仅 `resumeCoverFinal` 可完成**：fresh 校验当前快照仍 CLAIMED/非 UNKNOWN、revision/digest 匹配、库 STORED 与 receipt 逐字段相等、proof 用当前 digest；0 第二 import | 成功后 FINAL；任一不符→UNKNOWN 只读 |
| FINAL 写/rename 不确定 | FINAL 或 CLAIMED | UNKNOWN+capability 锁 | 不重试/不换 ID/不回滚 |
| FINAL 已写、JOINT 未完成 | FINAL+STORED | 后续 fresh 读决定 | 不重跑 |
| 已 SAVED 重开 | FINAL+STORED | EXISTING | 0 RVC/0 import |

- `executeCover` 同 task/Intent/requestKey：CLAIMED→当前状态；SAVED→EXISTING；CANCELLED/FAILED/UNKNOWN→终态（不重跑、不换 key、不新 attempt；attemptSeq 恒 1）。
- `resumeCoverFinal` 只完成已有 receipt 的 FINAL；普通 `status/get` 不写盘、不迁移、不自动恢复。

### 7.9 完整虚构 JSON 示例（NOT_IMPLEMENTED）

**executeCover 成功返回（公开根 `ok:true`，内层 value 6 键，value 内 8 键）**

```json
{
  "ok": true,
  "value": {
    "schemaVersion": 1,
    "outcome": "SAVED",
    "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
    "statusState": "SAVED",
    "messageZh": "演示翻唱已保存到本地演示资产库；这不是真实生成，也没有发送到微信。",
    "value": {
      "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
      "scopeId": "scope:fixture-demo",
      "intentHash": "c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35",
      "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
      "master": { "artifactRef": "artifact:fixture-bytes-00112233445566778899aabbccddeeff", "byteLength": 52, "sha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "expiresAt": "2026-11-02T00:00:00.000Z" },
      "inspection": { "schemaVersion": 1, "format": "WAV", "codec": "PCM_S16LE", "bitsPerSample": 16, "sampleRate": 44100, "channels": 1, "byteLength": 52, "dataByteLength": 8, "frameCount": 4, "durationMs": 0.09070294784580499, "peak": 1, "fullScaleSampleCount": 2, "sha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "validationState": "FIXTURE_WAV_CHECKED", "mockOnly": true, "realOperationAllowed": false, "submitAllowed": false, "automaticRetryAllowed": false, "messageZh": "演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。" },
      "messageZh": "演示翻唱已保存到本地演示资产库；这不是真实生成，也没有发送到微信。",
      "mockOnly": true
    }
  }
}
```

**完整固定错误（公开根 `ok:false`，恰 1 条）**

```json
{ "ok": false, "errors": [{ "code": "TASK_OWNER_COVER_INTENT_MISMATCH", "path": "intent", "reason": "cover intent mismatch" }] }
```

**EXISTING（在途）内层 value**

```json
{ "schemaVersion": 1, "outcome": "EXISTING", "attemptId": "cover-attempt:00112233445566778899aabbccddeeff", "statusState": "CONVERTING", "messageZh": "该演示翻唱请求已在执行中，未重复开始。", "value": null }
```

**coverStatus 成功（15 键 value）**

```json
{
  "schemaVersion": 1,
  "state": "SAVED",
  "phase": "FINAL",
  "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
  "attemptSeq": 1,
  "intentHash": "c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35",
  "stages": [
    { "stage": "SEPARATING", "status": "DONE" },
    { "stage": "CONVERTING", "status": "DONE" },
    { "stage": "MIXING", "status": "DONE" },
    { "stage": "VERIFYING", "status": "DONE" }
  ],
  "cancel": { "requested": false, "requestedAt": null, "acknowledgedAt": null, "confirmedAt": null, "reason": null },
  "lease": { "leaseId": "lease:fixture-cover-1", "kind": "LOGICAL_FIXTURE", "gpu": "EXCLUSIVE", "acquiredAt": "2026-11-01T00:00:01.000Z", "releasedAt": "2026-11-01T00:00:05.000Z" },
  "tempArtifacts": [
    { "role": "VOCAL", "byteLength": 52, "sha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "availability": "CLEANED" }
  ],
  "master": { "artifactRef": "artifact:fixture-bytes-00112233445566778899aabbccddeeff", "byteLength": 52, "sha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "expiresAt": "2026-11-02T00:00:00.000Z" },
  "lastError": null,
  "messageZh": "演示翻唱当前可读取。",
  "createdAt": "2026-11-01T00:00:01.000Z",
  "updatedAt": "2026-11-01T00:00:05.000Z"
}
```

**requestCoverCancel 成功（5 键 value）**

```json
{ "schemaVersion": 1, "cancelRequested": true, "cancelState": "ACCEPTED", "acknowledgedAt": null, "messageZh": "已收到演示取消请求；尚未确认阶段停止。" }
```

**owner 快照 v3（revision 2，一个 Cover entry 14 键）**

```json
{
  "schemaVersion": 3,
  "revision": 2,
  "entries": [
    {
      "entryVersion": 1,
      "kind": "COVER",
      "scopeId": "scope:fixture-demo",
      "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
      "birthIdentityHash": "bf3c034eb609624d27f8d3994c9b5b86500eca247a7171e27466bf4c212ffedc",
      "phase": "FINAL",
      "record": {
        "schemaVersion": 1,
        "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
        "feature": "singing",
        "taskType": "SVC",
        "source": { "kind": "AUDIO_REF", "ref": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef" },
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
      "intentHash": "c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35",
      "intent": {
        "intentVersion": 1,
        "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
        "scopeId": "scope:fixture-demo",
        "birthIdentityHash": "bf3c034eb609624d27f8d3994c9b5b86500eca247a7171e27466bf4c212ffedc",
        "birthObservedAt": "2026-11-01T00:00:00.000Z",
        "sourceRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
        "sourceEntryIdentityHash": "04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61",
        "sourceByteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
        "sourceByteLength": 52,
        "sourceRevision": 1,
        "rightsState": "GRANTED",
        "rightsProofRef": "fixture-rights:cover-demo-1",
        "rightsExpiresAt": "2026-11-02T00:00:00.000Z",
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
        "recipe": { "sourceLayout": "MIXED", "separationPreset": "FIXTURE_TWO_STEM", "mixMode": "WITH_INSTRUMENTAL", "vocalGainDb": 0, "instrumentalGainDb": 0 },
        "outputProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 }
      },
      "attempt": {
        "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
        "attemptSeq": 1,
        "requestKey": "cover-exec:demo-1",
        "startedAt": "2026-11-01T00:00:01.000Z",
        "finishedAt": "2026-11-01T00:00:05.000Z",
        "status": "SAVED",
        "error": null,
        "lease": { "leaseId": "lease:fixture-cover-1", "kind": "LOGICAL_FIXTURE", "gpu": "EXCLUSIVE", "acquiredAt": "2026-11-01T00:00:01.000Z", "releasedAt": "2026-11-01T00:00:05.000Z" }
      },
      "checkpoints": [
        { "index": 0, "stage": "CLAIMED", "at": "2026-11-01T00:00:01.000Z", "status": "DONE", "tempSummary": null, "importReceipt": null },
        { "index": 1, "stage": "SEPARATED", "at": "2026-11-01T00:00:02.000Z", "status": "DONE", "tempSummary": { "role": "VOCAL", "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "byteLength": 52 }, "importReceipt": null },
        { "index": 2, "stage": "CONVERTED", "at": "2026-11-01T00:00:03.000Z", "status": "DONE", "tempSummary": { "role": "CONVERTED_VOCAL", "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "byteLength": 52 }, "importReceipt": null },
        { "index": 3, "stage": "MIXED", "at": "2026-11-01T00:00:04.000Z", "status": "DONE", "tempSummary": { "role": "MASTER", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "byteLength": 52 }, "importReceipt": null },
        { "index": 4, "stage": "MASTER_IMPORTED", "at": "2026-11-01T00:00:04.500Z", "status": "DONE", "tempSummary": { "role": "MASTER", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "byteLength": 52 }, "importReceipt": { "artifactRef": "artifact:fixture-bytes-00112233445566778899aabbccddeeff", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "byteLength": 52, "expiresAt": "2026-11-02T00:00:00.000Z", "requestKey": "import:cover-master-1" } },
        { "index": 5, "stage": "VERIFIED", "at": "2026-11-01T00:00:04.800Z", "status": "DONE", "tempSummary": { "role": "MASTER", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "byteLength": 52 }, "importReceipt": null }
      ],
      "manifest": {
        "source": {
          "manifestVersion": 1,
          "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
          "scopeId": "scope:fixture-demo",
          "intentHash": "c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35",
          "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
          "role": "SOURCE",
          "producedByStage": "INGEST",
          "sequence": 0,
          "parentLinks": [],
          "rootSourceIdentityHash": "04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61",
          "rootSourceSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
          "byteLength": 52,
          "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
          "inspection": { "schemaVersion": 1, "format": "WAV", "codec": "PCM_S16LE", "bitsPerSample": 16, "sampleRate": 44100, "channels": 1, "byteLength": 52, "dataByteLength": 8, "frameCount": 4, "durationMs": 0.09070294784580499, "peak": 1, "fullScaleSampleCount": 2, "sha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "validationState": "FIXTURE_WAV_CHECKED", "mockOnly": true, "realOperationAllowed": false, "submitAllowed": false, "automaticRetryAllowed": false, "messageZh": "演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。" },
          "mediaProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 },
          "rights": { "state": "GRANTED", "proofRef": "fixture-rights:cover-demo-1" },
          "expiresAt": "2026-11-02T00:00:00.000Z",
          "modelRevision": 1,
          "profileRevision": 1,
          "backendRevision": 1,
          "origin": "FIXTURE_IMPORT",
          "truthLevel": "MEASURED_STORED_FIXTURE",
          "availability": "STORED",
          "verification": { "state": "PASSED", "inspectedAt": "2026-11-01T00:00:00.000Z", "inspector": "FIXTURE_WAV_CHECKED", "masterSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd" }
        },
        "vocal": { "role": "VOCAL", "producedByStage": "SEPARATING", "sequence": 1, "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "byteLength": 52, "parentLinks": [{ "role": "SOURCE", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd" }], "availability": "CLEANED" },
        "instrumental": { "role": "INSTRUMENTAL", "producedByStage": "SEPARATING", "sequence": 1, "byteSha256": "5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f", "byteLength": 52, "parentLinks": [{ "role": "SOURCE", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd" }], "availability": "CLEANED" },
        "converted": { "role": "CONVERTED_VOCAL", "producedByStage": "CONVERTING", "sequence": 2, "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "byteLength": 52, "parentLinks": [{ "role": "VOCAL", "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2" }], "availability": "CLEANED" },
        "master": {
          "manifestVersion": 1,
          "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
          "scopeId": "scope:fixture-demo",
          "intentHash": "c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35",
          "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
          "role": "MASTER",
          "producedByStage": "MIXING",
          "sequence": 3,
          "parentLinks": [
            { "role": "CONVERTED_VOCAL", "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2" },
            { "role": "INSTRUMENTAL", "byteSha256": "5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f" }
          ],
          "rootSourceIdentityHash": "04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61",
          "rootSourceSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
          "byteLength": 52,
          "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
          "inspection": { "schemaVersion": 1, "format": "WAV", "codec": "PCM_S16LE", "bitsPerSample": 16, "sampleRate": 44100, "channels": 1, "byteLength": 52, "dataByteLength": 8, "frameCount": 4, "durationMs": 0.09070294784580499, "peak": 1, "fullScaleSampleCount": 2, "sha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "validationState": "FIXTURE_WAV_CHECKED", "mockOnly": true, "realOperationAllowed": false, "submitAllowed": false, "automaticRetryAllowed": false, "messageZh": "演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。" },
          "mediaProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 },
          "rights": { "state": "GRANTED", "proofRef": "fixture-rights:cover-demo-1" },
          "expiresAt": "2026-11-02T00:00:00.000Z",
          "modelRevision": 1,
          "profileRevision": 1,
          "backendRevision": 1,
          "origin": "SYNTHETIC_FIXTURE",
          "truthLevel": "MEASURED_SYNTHETIC_VERIFIED",
          "availability": "STORED",
          "verification": { "state": "PASSED", "inspectedAt": "2026-11-01T00:00:04.800Z", "inspector": "FIXTURE_WAV_CHECKED", "masterSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd" }
        },
        "verification": { "state": "PASSED", "inspectedAt": "2026-11-01T00:00:04.800Z", "inspector": "FIXTURE_WAV_CHECKED", "masterSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd" }
      },
      "cancel": { "requested": false, "requestedAt": null, "acknowledgedAt": null, "confirmedAt": null, "reason": null }
    }
  ]
}
```

**coverAttachment（7 键；lineage 与 compact 对应）**

```json
{
  "attachmentVersion": 1,
  "intentHash": "c34f059d4ef6beab90c0d112c58e511382a934a68a4fb5301a13defc7e3edb35",
  "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
  "sourceEntryIdentityHash": "04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61",
  "lineage": { "sourceSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "vocalInputSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "instrumentalSha256": "5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f", "convertedSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2" },
  "masterSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
  "verification": { "validationState": "FIXTURE_WAV_CHECKED", "peak": 1, "fullScaleSampleCount": 2, "durationMs": 0.09070294784580499 }
}
```


---

## 8. FUTURE：取消、资源、清理与缓存（092-R04）

### 8.1 取消侧通道与真实合作点

- `requestCoverCancel` 写同 owner 的 cancel fence（内存 + 一次短 owner 队列写），不排长执行队列、不反向等 Artifact。
- 合作点：
  - 每 4096 帧检查一次 fence 标志（同步、廉价）；
  - **每个阶段边界**以及**至少每 65,536 帧**执行一次真正的宏任务让出：`await new Promise((resolve) => setImmediate(resolve))`，使外部 I/O/UI 取消回调得以执行；
  - 每个 checkpoint 前后、import 前、FINAL 提交 fence 前。
- 本机有限观察（记录于验收证据）：仅 `await Promise.resolve()` 的微任务让出在 128 个连续合作点后仍未投递排队 `setImmediate` 的取消回调；因此规范要求上述宏任务边界，不宣称“微任务让出即可取消”。不新增调度器、不改事件循环实现。
- FINAL 的 `temp fsync → rename` 为不可中断区；期间请求按 §8.2 固定响应。

### 8.2 取消响应表（按区域唯一）

| 请求到达时 | cancelState | 写盘 | 动作 |
|---|---|---|---|
| 未 claim | `TOO_LATE` | 否 | 无尝试可停 |
| CLAIMED/阶段计算中 | `ACCEPTED` | 短写 requested/requestedAt | 下一合作点 ack → STOPPED + FINAL CANCELLED |
| checkpoint 写中 | `ACCEPTED` | 排队短写 | 写完成后 ack |
| import 中 | `ACCEPTED` | 短写 | import 后不再下一步，停止/清理；不删已 STORED |
| FINAL 不可中断区 | `TOO_LATE` | 否 | FINAL 完成；随后 SAVED；不撤销 |
| FINAL 已提交/JOINT 后 | `TOO_LATE` | 否 | 不回滚 |
| fence/存储不可读 | 错误 `CANCEL_UNKNOWN` | 否 | 只读核对 |

- `cancelState ∈ {ACCEPTED, ACKNOWLEDGED, STOPPED, TOO_LATE}`；**UNKNOWN 只作错误码**（fence/存储不可读），不作为 cancelState，也不由 ack 超时触发。
- ack 超时只表现为 `acknowledgedAt=null`（仍 ACCEPTED），不谎报 UNKNOWN。
- 请求短写、合作点 ack、FINAL CANCELLED 三事实分别可验。

### 8.3 租约与清理

- `lease = {leaseId, kind:'LOGICAL_FIXTURE', gpu:'EXCLUSIVE', acquiredAt, releasedAt|null}`；claim 时获得；SAVED/CANCELLED/FAILED 的持久写释放；**UNKNOWN 保留**（防重跑）。
- 本地 GPU 独占；CPU/cloud 不抢 GPU；readiness `AVAILABLE` 不是 lease；这是逻辑占用，不是 GPU/显存/进程实测。
- 清理只清本 attempt 证明拥有的临时字节/compact；不删父 SOURCE、共享模型、其他 task、STORED MASTER、不确定资产；结果 `CLEANED`/`UNKNOWN`；不宣称安全擦除。
- 缓存默认禁用；未来启用须另审并绑定 source identity + rights + model/profile/backend revisions + recipe + outputProfile + expiry。

## 9. FUTURE：预算、峰值与容量（092-R06）

### 9.1 固定上限（CURRENT，不扩大）

| 项 | 值 |
|---|---|
| Artifact 单项 | 1,048,576 B |
| Artifact 解码总量 | 4,194,304 B |
| Artifact 条目（含 tombstone） | 32 |
| Artifact pack 字节 | 6,291,456 B |
| owner 文件 | 131,072 B |
| owner 条目 | 32 |
| inspector | 52,428,800 B / 300,000 ms / 128 chunks |

### 9.2 入场：完整 candidate pack 实际序列化

- 判据不是“现有字节 + 单条 entry”，而是**完整候选 pack**：
  `utf8(serializePack({schemaVersion:1, sandboxId, revision: current.revision+1, entries: [...current.entries, candidateEntry]})) ≤ 6,291,456`。
- 该序列化包含：已有非空 entries 之间的逗号、JSON 空白规则、`revision` 位数变化、每个 entry 的完整 11 键；与 writer 实际写盘同一实现，不做常数估算。
- 可复算示例（虚构）：库内 1 条 52 B SOURCE entry，新增 1 条 52 B MASTER entry，候选 root revision 2 → **2177 B**（< 6,291,456）。该示例不代表所有合法字段的最大值；入场永远按当时实际候选计算。
- 解码总量：`currentDecodedBytes + masterBytes ≤ 4,194,304`（MASTER 最大时 D ≤ 3,145,728）。
- 条目：`currentEntries + 1 ≤ 32`（含 tombstone）。
- owner：`utf8(owner candidate snapshot) ≤ 131,072` 且 entries ≤ 32；单条设计上限 16,384 B 只是设计界限，入场用**实际 UTF8 字节**。完整示例 entry **8874 B**、snapshot **8919 B**（revision 2，含 6 checkpoint 与 importReceipt）。
- 以上在入场与 import/FINAL 前按当时实际字节 fresh 重算；任一不满足 → `COVER_RESOURCE_LIMIT`，0 新入库。

### 9.3 受控 Buffer 峰值（含 writer 实际存活阶段）

最坏场景：候选 pack 取上限 `N=6,291,456`，既有解码 `D=3,145,728`，MASTER `M=1,048,576`；writerg 写 pack 时以下 Buffer 可以同时存活，逐项计入（不是 V8/GC 隐含堆）：

| 项 | 字节 | 说明 |
|---|---:|---|
| 已解码既有 payload D | 3,145,728 | 解析现有条目 |
| MASTER request owned copy M | 1,048,576 | import 请求 |
| MASTER inspector 副本 | 1,048,576 | inspector 内部 |
| 候选 pack UTF8 Buffer N | 6,291,456 | writer 序列化结果 |
| 回读 chunks 合计 N | 6,291,456 | `readBoundedFd` 读完 |
| `Buffer.concat` 结果 N+D+M | 10,485,760 | 严格自检 |
| **合计** | **29,360,128** | ≤ **33,554,432（32 MiB）** |

- **import/FINAL 受控 Buffer 预算 = 33,554,432 B（32 MiB）**；超出 → `COVER_RESOURCE_LIMIT`。
- **阶段计算受控预算 = 3,145,728 B**（SOURCE/VOCAL/INSTRUMENTAL 各 1 MiB 的最坏图；MIXING 同）。
- 明确排除的只有 V8/字符串内部表示与 GC 临时副本；上表全部为**显式分配的 Buffer**，不得以“GC 会回收”为由不计数。
- 释放：SOURCE 在 SEPARATED 后、VOCAL 在 CONVERTED 后、INSTRUMENTAL/CONVERTED 在 MIXING 后、MASTER 在 FINAL+JOINT 后；UNKNOWN 保留 claim/lease 与 manifest 事实。

### 9.4 容量示例

- 44,100 Hz mono 524,266 帧 ≈ 11,888.1179 ms；48,000 Hz mono ≈ 10,922.2 ms；stereo 不在路径。
- 不能把 inspector 50 MiB 当库 1 MiB；超限固定拒绝，不截断。
- 32 条目上限，不承诺 32 个最大 Cover 同时装下。

## 10. FUTURE：版本与兼容

### 10.1 支持版本

| 文件 | 支持 | 未知 |
|---|---|---|
| catalog | v1、v3 | 其他 → `TASK_CATALOG_STORE_INVALID` |
| owner | v1、v2、v3 | 其他 → `TASK_OWNER_STORE_INVALID` |
| Artifact pack | v1 | 其他 → `ARTIFACT_LIBRARY_STORE_INVALID` |
| 公开 schema/request | 恒 1 | 其他 → 原 `UNSUPPORTED_VERSION` |

### 10.2 程序 × 版本矩阵

| 程序 | catalog v1 | catalog v3 | owner v1/v2 | owner v3 | 未知 |
|---|---|---|---|---|---|
| 旧程序 | legacy | `STORE_INVALID` | legacy | `STORE_INVALID` | `STORE_INVALID` |
| 新程序 | legacy（出生写 v3） | legacy+Cover | legacy | Cover 读取/恢复 | `*_STORE_INVALID` |

旧程序遇新版本 fail-closed；新程序不自动迁移；方法矩阵见 §3.5。

## 11. FUTURE：错误码与优先级

### 11.1 owner Cover 码（`TASK_OWNER_COVER_` + KEY，21 个）

| KEY | path | 固定 reason | 中文 |
|---|---|---|---|
| `INPUT_INVALID` | `$`/字段 | `invalid cover input` | 演示翻唱执行请求格式不正确。 |
| `BIRTH_REQUIRED` | `$` | `cover birth required` | 该任务不是 Cover 出生，不能执行翻唱。 |
| `LEGACY_BIRTH` | `$` | `cover intent not bound` | 该任务没有绑定 Cover 意图，执行已拒绝。 |
| `INTENT_MISMATCH` | `intent` | `cover intent mismatch` | 本次意图与出生绑定不一致。 |
| `RIGHTS_REJECTED` | `rights` | `cover rights rejected` | 当前授权不允许执行或保存。 |
| `EXPIRED` | `expiresAt` | `cover request expired` | 演示请求已过期。 |
| `SOURCE_CHANGED` | `sourceInput` | `cover source changed` | 源文件内容或版本已变化。 |
| `SOURCE_UNAVAILABLE` | `sourceInput` | `cover source unavailable` | 演示源当前不可用。 |
| `RESOURCE_LIMIT` | `$` | `cover resource limit exceeded` | 演示翻唱超出允许的资源范围。 |
| `STAGE_REJECTED` | `$` | `cover stage rejected` | 演示阶段无法按契约执行。 |
| `DEPENDENCY_FAILURE` | `$` | `cover dependency failure` | 无法确认演示依赖结果，请重新核对。 |
| `CANCEL_TOO_LATE` | `$` | `cover cancel too late` | 保存已提交，不能再取消。 |
| `CANCEL_UNKNOWN` | `$` | `cover cancel unknown` | 取消状态无法确认。 |
| `EXECUTION_UNKNOWN` | `$` | `cover execution unknown` | 执行结果无法确认，系统不会自动重跑。 |
| `STORE_INVALID` | `$` | `cover store invalid` | 本地演示记录无法核对。 |
| `STORE_CHANGED` | `$` | `cover store changed` | 本地演示记录已变化。 |
| `SAVE_REJECTED` | `$` | `cover save rejected` | 保存候选被拒绝，未写入。 |
| `SAVE_UNKNOWN` | `$` | `cover save unknown` | 保存结果无法确认。 |
| `NOT_FOUND` | `$` | `cover task not found` | 未找到该演示任务或尝试。 |
| `INTERNAL_FAILURE` | `$` | `cover internal failure` | 演示翻唱执行内部失败。 |
| `UNKNOWN` | `$` | `cover unknown` | 当前演示翻唱状态未知。 |

### 11.2 catalog Cover 码（`TASK_CATALOG_COVER_` + KEY，3 个，内部出生路径）

| KEY | path | 固定 reason | 中文 |
|---|---|---|---|
| `INPUT_INVALID` | `$`/`intentDraft.*` | `invalid cover birth input` | 演示翻唱出生请求格式不正确。 |
| `INTENT_CONFLICT` | `idempotencyKey` | `cover intent conflict` | 该演示翻唱请求与已有意图冲突。 |
| `BIRTH_REJECTED` | `$` | `cover birth rejected` | 演示翻唱出生被拒绝。 |

### 11.3 固定优先级

1. 输入/枚举（`INPUT_INVALID`，含 `rightsState!=='GRANTED'`）；
2. 出生/Intent（`BIRTH_REQUIRED`/`LEGACY_BIRTH`/`INTENT_MISMATCH`）；
3. rights/expiry（`RIGHTS_REJECTED`/`EXPIRED`）；
4. source fresh（`SOURCE_UNAVAILABLE`/`SOURCE_CHANGED`）；
5. 资源（`RESOURCE_LIMIT`）；
6. 阶段（`STAGE_REJECTED`/`DEPENDENCY_FAILURE`）；
7. 取消（`CANCEL_TOO_LATE`/`CANCEL_UNKNOWN`）；
8. 保存（`SAVE_REJECTED`/`SAVE_UNKNOWN`）；
9. 存储不确定（`STORE_INVALID`/`STORE_CHANGED`/`EXECUTION_UNKNOWN`/`UNKNOWN`）。

旧 22 码与 v1.6 语义不变；新码只经新方法返回，旧 client 不会看到（§3.5）。

## 12. FUTURE：状态/失败矩阵

| # | 状态/事件 | 事实 | 固定结果 | 锁域 | 允许/禁止 |
|---:|---|---|---|---|---|
| 1 | legacy 出生 + executeCover | 无 Cover intent | `BIRTH_REQUIRED` | 无 | 禁止隐式升级/换 ID |
| 2 | 已绑定未 claim | catalog v3 | `NO_ATTEMPT` | 短写 | 可开始；旧 run/save 遇 v3 为 STORE_INVALID |
| 3 | claim 在途 | CLAIMED+attempt+checkpoint | 当前状态 | owner 短写 | 可 status/cancel；并发 execute 返回当前状态 |
| 4 | 阶段确定性失败 | FINAL FAILED、清理 | `FAILED`；`STAGE_REJECTED` | owner 短写 | 终态；不重跑/不换 key |
| 5 | 阶段 UNKNOWN | CLAIMED 无 FINAL | `UNKNOWN`；`EXECUTION_UNKNOWN` | owner+lease hold | 只读核对；不重跑 |
| 6 | 取消 accepted/acked/stopped | FINAL CANCELLED | `CANCELLED` | 侧通道+短写 | 不重复取消；不删已 STORED |
| 7 | FINAL 后取消 | FINAL+STORED | `SAVED`；`TOO_LATE` | 无 | 不回滚 |
| 8 | import 后、checkpoint4 前崩溃 | 库可能多 STORED；无 receipt | `UNKNOWN` | 无 | 不第二 import/不删已知资产 |
| 9 | checkpoint4 后、FINAL 前崩溃 | CLAIMED+receipt+master manifest | 仅 `resumeCoverFinal` 可完成 | owner→Artifact | fresh 校验后 FINAL；0 第二 import；失败→UNKNOWN |
| 10 | FINAL rename 不确定 | CLAIMED 或 FINAL | `SAVE_UNKNOWN`→`UNKNOWN` | 底层锁 | 不重试/不回滚 |
| 11 | JOINT 失败 | FINAL+STORED | `EXECUTION_UNKNOWN` | 底层锁 | 不重跑；后续 fresh 读 |
| 12 | 已 SAVED 重开 | FINAL+STORED | `EXISTING` | 无 | 0 RVC/0 import |
| 13 | 同 task/Intent 不同 requestKey | CLAIMED/FINAL | 当前状态/`EXISTING` | 无 | 不换 key 绕过 |
| 14 | 同 task 差 Intent | 任意 | `INTENT_MISMATCH`/`CONFLICT` | 无 | 不改 ID |
| 15 | 旧程序遇 v3 | v3 | `STORE_INVALID` | 无 | fail-closed |
| 16 | 新程序遇未知版本 | 未知 | `*_STORE_INVALID` | 无 | fail-closed |

- UNKNOWN 不自动重试/回滚/换 ID/删不确定资产/降级历史 SAVED。
- 中间 rename/中间 store 标 **N/A**；保留 M v1.6 已验 11 行机械故障事实，本表只覆盖新增维度。

## 13. FUTURE：实施表与七组验收

### 13.1 未来实施表（全部 NOT_IMPLEMENTED）

| 文件/接口 | 类型 | 依赖 | 说明 |
|---|---|---|---|
| `core/audio/cover-intent.mjs`（新） | 内部 | 原 hash 语义 | canonical Intent/hash/冲突 |
| `core/audio/cover-birth-internal.mjs`（新） | 内部 | 库、catalog 内部写 | 可信读源 + sourceFacts + 原子出生 |
| `core/audio/cover-stage-bytes.mjs`（新） | 内部 | inspector、gateway | 分离/转换/混音/验证与 owned bytes |
| `core/audio/cover-executor-internal.mjs`（新） | 内部 | owner、库、store | claim/checkpoint/receipt/cancel/lease/attachment/resume |
| `core/audio/task-catalog.mjs`（改） | 版本扩展 | 新 intent | catalog v3 解析/内部出生写 |
| `core/audio/fixture-task-store-internal.mjs`（改） | 版本扩展 | 新 intent | owner v3/第 5 参/receipt/resume 写 |
| `core/audio/task-owner.mjs`（改） | 4 新方法 | 新 executor | execute/status/cancel/resume |
| 新测试（FUTURE） | 测试 | 上述 | 七组验收，本轮不写 |

### 13.2 七组有限验收（FUTURE）

1. **身份/源**：内部读源不可伪造、原子出生/legacy 抢跑 0 执行、同 Intent 0 重跑、差参/版本/rights 冲突、父 source 不变。
2. **三图/Fake bytes**：三图/清唱、hash/model/pitch/gain 因果、MASTER inspection、损坏/错模型/旧 hash；合成不称真实。
3. **rights/预算**：撤权/未知/过期；item/解码/32 项/完整 pack/owner 实际字节/32MiB Buffer 峰值/缓存禁用。
4. **一次保存/故障**：并发/重开仅 1 claim/1 转换/1 import/1 FINAL；原 pre/post/JOINT/域锁；崩溃表与 resume 0 第二 import。
5. **取消/资源**：各区域响应、宏任务合作点真可取消、ack/stop/release/cleanup 分证、GPU 独占/CPU-cloud、UNKNOWN hold。
6. **旧新兼容/协议**：版本/方法矩阵、原公 8/私 8/root 11/19/Task 投影、四方法 envelope、完整正负例。
7. **父 Fake E2E**：原 08 Fake Model/Audio/Relay 父链另行门禁；合同不关闭父 08。

### 13.3 本轮不做

不新增 runtime/planner/validator/reference/tests；不运行阶段；不创建任务/资产；不加 writer/store；不调用真实模型/媒体/GPU/设备/微信/安装；不改 M 源码/旧 v1.6/F-A。

## 14. 机械核验、来源与限制

### 14.1 机械核验（生成时执行）

| 检查 | 结果 |
|---|---|
| JSON 块解析 | 通过（7 个：execute 成功、固定错误、EXISTING、status、cancel、owner v3、attachment） |
| 键计数 | intent 25、intentDraft 19、catalog Cover entry 9、record 16、owner entry 14、attempt 8、checkpoint 6、importReceipt 5、manifest 6、source/master 24、compact 7、verification 4、attachment 7、status 15、execute request 8、result 6/value 8、cancel 5 |
| canonical Intent | 1,140 B；`c34f059d…db35`；五变体 `2d374e51…`/`5b0d1e3b…`/`10404b39…`/`e487db0c…`/`701d72fe…` |
| birthIdentityHash / source identity | `bf3c034e…ffedc` / `04cd12de…eade61`（实算） |
| revision | 单任务 claim1 → FINAL2；跨任务示例 proof.claimRevision=2、candidate=3 |
| 媒体向量 | 7 个 52 B WAV SHA 不变（复用 0092 复算） |
| 完整 pack 示例 | 2177 B < 6,291,456 |
| Buffer 峰值 | 29,360,128 ≤ 33,554,432 |
| owner 字节 | entry 8874 B / snapshot 8919 B |

> 只证明文档自洽与向量可复算，不证明 FUTURE 已实现。

### 14.2 来源与勘误

- CURRENT：§2 的 M 模块与 v1.6 契约（blob `d02a8097…`）；规划：PR17（未合入）。
- 本版修正前稿：caller 可伪造 sourceEntry（改为内部读源）、公开反向返回/error envelope、旧 client 新码表述、终态重试残句、CANCEL_UNKNOWN 混用、canonical 顺序、gateway 字段、网关 bytes 误解、expiry/rights schema、attachment 与 manifest verification 混比、FINAL 全非空矛盾、availability/clean lineage、FINAL proof 旧 digest、Artifact 提前释放、微任务让出、checkpoint4 无 ref、完整 pack/32MiB 峰值/owner 字节数。

### 14.3 明确未实现

全部 Cover API/catalog v3/owner v3/StageArtifact/三图算法/取消/租约/预算/迁移；真实模型/媒体/GPU/设备/微信/安装发布；父 08 的 Cover/资源/动态 Evidence/Fake E2E。

### 14.4 状态

**CONTRACT_CANDIDATE / PLANNED_RUNTIME / NOT_IMPLEMENTED / FIXTURE_ONLY / NOT_INTEGRATED。** 通过只代表设计候选；后续实施必须另有正式执行单元与明确授权。
