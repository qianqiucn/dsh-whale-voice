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
| `core/audio/task-owner.mjs` | `openFixtureTaskOwner({sandbox})` → `{run, get, save, artifactStatus}` | 公开 owner schema 恒 1；磁盘 owner 快照 v1（仅 CLAIMED/FINAL 非 SAVED）或 v2（含 SAVED FINAL）；22 个 `TASK_OWNER_` 错误码 |
| `core/audio/artifact-library.mjs` | `openFixtureArtifactLibrary({sandbox})` → `{import, get, readBytes, delete}` | 16 个 `ARTIFACT_LIBRARY_` 错误码；库权利域为 `GRANTED` + `proofRef`；单项 1,048,576 B、解码总量 4,194,304 B、条目 32、pack 6,291,456 B |
| `core/audio/fixture-wav-producer.mjs` | 4 导出（schema/limits/errors/`produceFixtureWav`） | 合成 PCM16 fixture，仅 SILENCE / EDGE_SEQUENCE |
| `core/audio/wav-byte-inspector.mjs` | 4 导出（schema/limits/errors/`inspectFixtureWavBytes`） | 只读检查；50 MiB / 300000 ms / 128 chunks |
| `core/audio/source-artifacts.mjs` | `resolveFixtureTaskSource(input)` | 输入 4 键；成功 value 恰 10 键；失败 root 恰 `{ok:false,errors:[{code,path,reason}]}` |
| `core/audio/voice-assets.mjs` | `resolveFixtureVoiceBinding(input)` | 返回 binding value 恰 13 键；`binding` 内恰 8 键 |
| `core/audio/provider-dispatch.mjs` / `svc/rvc-fake-gateway.mjs` | Provider dispatch + Fake RVC gateway | gateway request 恰 7 键 `schemaVersion/sourceAudioRef/targetModelId/pitchShift/outputFormat/inputAudio/rights`；context 恰 3 键 `requestId/endpointId/scenario`；有效 scenario 6 个 + SUCCESS |
| `core/audio/cover-plan.mjs` | `planFixtureCover(payload)` | 纯规划；PLANNED/BLOCKED、15 键 value、`taskAuthority:'UNVERIFIED'`、`outputArtifactRef:null`；**不是执行入口** |

### 2.2 CURRENT 形状（字段集合以 M parser 为准）

| 形状 | 恰键 |
|---|---|
| Task v1 record（16 键） | `schemaVersion, taskId, feature, taskType, source, voiceProfileId, deliveryRequested, rights, state, outputArtifactRef, cancel, delivery, lastError, observedAt, mockOnly, realOperationAllowed` |
| Task v1 终态（CURRENT） | `SAVED, CANCELLED, FAILED, UNKNOWN`（另有 CREATED/BLOCKED_RIGHTS/PROCESSING 等既有态） |
| catalog 快照（3 键） | `schemaVersion, revision, entries` |
| catalog entry（4 键） | `scopeId, idempotencyKey, identityHash, record` |
| owner 快照（3 键） | `schemaVersion, revision, entries` |
| owner entry（6 键） | `scopeId, taskId, birthIdentityHash, phase, record, completion` |
| `identityHashOf(record)` | `sha256(JSON.stringify({schemaVersion, feature, taskType, source:{kind,ref}, voiceProfileId, deliveryRequested, rights:{state}}))`，UTF-8；不含配方/pitch/模型修订 |
| 公有 Artifact metadata（8 键） | `artifactRef, scopeId, requestKey, origin, createdAt, expiresAt, rights, inspection` |
| 库取回 bytes | `readBytes({scopeId, artifactRef, now})` → owned copy；只对 `STORED` 条目 |
| 私有 SaveProof.artifact（8 键） | `artifactRef, identityHash, byteSha256, byteLength, expiresAt, requestKey, rights, inspection` |
| SaveProof root（11 键） | `schemaVersion, scopeId, taskId, birthIdentityHash, birthObservedAt, claimRevision, claimDigest, candidateRevision, recordIdentityHash, artifact, evaluatedAt` |
| WAV inspection（19 键） | `schemaVersion, format, codec, bitsPerSample, sampleRate, channels, byteLength, dataByteLength, frameCount, durationMs, peak, fullScaleSampleCount, sha256, validationState, mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed, messageZh` |
| canonical pack entry（11 键） | `artifactRef, scopeId, requestKey, identityHash, origin, createdAt, expiresAt, rights, inspection, payload, deletedAt` |
| Artifact pack v1 root（4 键） | `schemaVersion, sandboxId, revision, entries` |

### 2.3 CURRENT 队列/锁与版本事实（M 实测来源）

- `STATES = new WeakMap()`，按 sandbox capability 建 state；`state {sandbox, tail: Promise.resolve(), locked, files}`。
- `enqueue(state, run)` 串到 `state.tail`；catalog 与 owner **共享同一 capability 写队列**；Artifact 有独立队列；跨域固定 Task→Artifact 顺序，不反向持锁。
- `locked` 为 capability 级 unknown 锁：一旦不确定，该 capability 的 owner/catalog 操作全部 fail-closed。
- 版本语义（CURRENT，必须准确）：`revision` 每次**持久写**递增 1：claim 候选 `revision = current.revision + 1`；FINAL 候选 `revision = claimRevision + 1`（即相对 claim 再 +1）。**不存在“FINAL=+2/权重 2”的额外跳变**；v1.6 的 `claimRevision/candidateRevision` 直接对应这两个值。多任务按每次 CLAIMED/FINAL 写各 +1 累计。

### 2.4 CURRENT 身份/容量事实

- catalog 出生 `identityHash` 只覆盖 §2.2 的 8 个 identity 字段；**不含 pitch、模型修订、layout、separation、mix 配置**，所以 `EXISTING` 不证明 Cover 选项相同。
- `task.source` 在出生后不可变；旧 voice resolver 要求 Provider 源 ref 与父 source 同 ref。
- legacy `save` 硬绑定唯一 bytes engine（会再跑一次 RVC）；`run` 一旦 FINAL 不能“续存”。
- owner 文件上限 131,072 B / 32 条；Artifact 单项 1,048,576 B；解码总量 4,194,304 B；pack 6,291,456 B。
- 44,100 Hz mono、1,048,576 B 上限下最多 **524,266 帧 ≈ 11,888.1179 ms**；stereo 为 262,133 帧。

---

## 3. FUTURE：身份模型与出生协议（092-R01）

### 3.1 唯一机制与版本分层

**Cover 是原父 AudioTask v1（`feature:'singing'`, `taskType:'SVC'`）的版本化 intent，不是新的主 taskType、不是第二 TaskManager、不新签主 TaskId/DeliveryId。**

- **公开 schema 不变**：catalog/owner/Task 的公开 `schemaVersion` 恒 `1`（旧 legacy 请求/响应完全不变）。
- **公开方法只新增**：catalog handle 增加 `reserveCover(request)`；owner handle 增加 `executeCover/coverStatus/requestCoverCancel`。原 `reserve/get` 与 `run/get/save/artifactStatus` 签名/语义不变。
- **私有磁盘版本**：catalog 快照新增 `schemaVersion:3`（typed legacy/Cover entry）；owner 快照新增 `schemaVersion:3`（Cover variant）；Artifact pack 保持 v1。**3 只出现在磁盘文件，不出现在任何公开请求/响应**。
- 单一 authority：catalog 唯一签发 taskId；唯一 owner writer 仍是 `openOwnerFile(...).write`；不设第二 writer/authority/store。

### 3.2 出生协议：`reserveCover(request)`

request 恰 **6 键**：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "idempotencyKey": "cover:fixture-demo-1",
  "intentDraft": {
    "intentVersion": 1,
    "scopeId": "scope:fixture-demo",
    "sourceRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
    "sourceRevision": 1,
    "rightsState": "GRANTED",
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
    "outputProfile": {
      "format": "WAV",
      "codec": "PCM_S16LE",
      "sampleRate": 44100,
      "channels": 1
    }
  },
  "sourceEntry": {
    "artifactRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
    "requestKey": "import:fixture-source-1",
    "createdAt": "2026-11-01T00:00:00.000Z",
    "sourceEntryIdentityHash": "04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61",
    "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
    "byteLength": 52,
    "rights": {
      "state": "GRANTED",
      "proofRef": "fixture-rights:cover-demo-1",
      "expiresAt": null
    }
  },
  "observedAt": "2026-11-01T00:00:00.000Z"
}
```

`sourceEntry`（7 键）由未来 birth coordinator 在**同一 sandbox** 内对 Artifact 库做 fresh 读后填写：`readStoredForSave`/`readBytes` + 真实 `inspectFixtureWavBytes` + 权利/过期检查；它记录的是**库域实测事实**，不是调用者声明。调用者不得自造该对象；catalog 会重新校验其内部一致性（ref 格式、hash 长度、rights 枚举、expiry）。

**出生步骤（唯一，无二次签号）**：

1. 校验 request 形状/版本/预算（复用 M `copyFixtureInput` 的 4096 values、depth 12、32 keys、256 items、8192 code units；getter 0）。
2. 以 `(scopeId, idempotencyKey)` 查现有 catalog entry（fresh 读）：
   - 有 **legacy** entry → `TASK_CATALOG_COVER_INTENT_CONFLICT`（不覆盖 legacy）。
   - 有 **Cover** entry → 用该 entry 的已签发 `taskId`/`observedAt`/`birthIdentityHash` + 本次 `intentDraft` + `sourceEntry` **重算 intent 与 hash**：
     - 完全相等 → `EXISTING`（返回原 entry），**不再签发新 ID、不改盘**；
     - 不等 → `TASK_CATALOG_COVER_INTENT_CONFLICT`，**不改盘**。
3. 无 entry → 才由 catalog allocator 签发 `taskId`；`observedAt` 取本次 request 的值；用 §3.3 组装 Intent；`identityHash=identityHashOf(record)`、`intentHash=canonicalIntentHash(intent)`；组装 Cover entry；**一次 temp+fsync+单 rename** 写 v3 快照（原子出生）。
4. 任一步失败：不落盘、不签发 ID；已存在 v1 快照时首次 Cover 出生写 v3（含既有 legacy entry 原样）；不自动迁移旧文件（除非首次 Cover 出生/owner Cover claim）。

`reserveCover` 成功 value 恰 9 键：`{schemaVersion:1, outcome, taskId, scopeId, idempotencyKey, intentHash, attemptHint, record, messageZh}`；`outcome ∈ {CREATED, EXISTING}`；`attemptHint=null`（出生不创建 attempt）；`record` 为 Task v1 出生投影。


**catalog v3 快照（出生后，revision 1；Cover entry 9 键）**

```json
{
  "schemaVersion": 3,
  "revision": 1,
  "entries": [
    {
      "entryVersion": 1,
      "kind": "COVER",
      "scopeId": "scope:fixture-demo",
      "idempotencyKey": "cover:fixture-demo-1",
      "identityHash": "bf3c034eb609624d27f8d3994c9b5b86500eca247a7171e27466bf4c212ffedc",
      "intentHash": "44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13",
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
        "outputProfile": {
          "format": "WAV",
          "codec": "PCM_S16LE",
          "sampleRate": 44100,
          "channels": 1
        }
      },
      "record": {
        "schemaVersion": 1,
        "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
        "feature": "singing",
        "taskType": "SVC",
        "source": {
          "kind": "AUDIO_REF",
          "ref": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef"
        },
        "voiceProfileId": "voice:demo-hero",
        "deliveryRequested": false,
        "rights": {
          "state": "CONFIRMED_FIXTURE"
        },
        "state": "CREATED",
        "outputArtifactRef": null,
        "cancel": {
          "requested": false,
          "confirmed": false
        },
        "delivery": {
          "state": "NOT_REQUESTED",
          "deliveryId": null
        },
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

### 3.3 Intent 组装规则

- `intent` = `intentDraft` 的 19 键（§4.1）+ catalog 签发的 `taskId`/`birthObservedAt` + `birthIdentityHash`（`identityHashOf(record)`）+ `sourceEntry` 的 `sourceRef`/`sourceEntryIdentityHash`/`sourceByteSha256`/`sourceByteLength`。
- `taskDraft.source.ref` 必须**就是** `sourceEntry.artifactRef`（物理库 ref），且 `taskDraft.rights.state='CONFIRMED_FIXTURE'`（出生声明）；二者与库域 `GRANTED` 的映射见 §5.1。不一致 → `TASK_CATALOG_COVER_INPUT_INVALID`。
- Intent 的 `rightsState` 只允许库域 `GRANTED`；`rightsProofRef/rightsExpiresAt` 取 `sourceEntry.rights`。`REVOKED` 只作为 canonical 负向数据用于证明 hash 变化（§4.4），**不是合法出生输入**；任何非 `GRANTED` 的出生请求在进入 hash 比较前即 `TASK_CATALOG_COVER_INPUT_INVALID`。

### 3.4 同键/重复矩阵（唯一）

| 现有 entry \ 新 `reserveCover` | 重算 intent 相等 | 重算 intent 不等 | 新请求为 legacy `reserve` |
|---|---|---|---|
| 无 entry | 正常出生（CREATED） | 正常出生 | 正常 legacy 出生 |
| legacy entry | `TASK_CATALOG_COVER_INTENT_CONFLICT` | 同左 | `EXISTING`（原 legacy 行为） |
| Cover entry | `EXISTING`（0 新 ID/0 改盘） | `TASK_CATALOG_COVER_INTENT_CONFLICT` | `TASK_CATALOG_IDEMPOTENCY_CONFLICT` |
| 存储不确定（rename/digest） | `TASK_CATALOG_CATALOG_UNKNOWN` + capability 锁 | 同左 | 同左 |

普通并发同队列串行 → 后到者按上表返回；**任何分支都不产生第二个出生/第二 taskId**。

### 3.5 三方法统一 envelope 与预算（092-R01）

所有新方法（`reserveCover/executeCover/coverStatus/requestCoverCancel`）的根形状只有两种：

- 成功：`{ok:true, value:<恰键对象>}`；`value` 为新建 plain 对象并深冻结，无 accessor/symbol/隐藏键。
- 非成功：`{ok:false, errors:[{code,path,reason}]}`，**恰 1 个** error，恰 `code/path/reason` 三键字符串；不返回 `value`、不回显输入/异常 message/路径。
- 请求安全捕获：与 M 相同的 `copyFixtureInput` 边界（getter 0/预算/plain/有限数/密集数组/32 键/256 项/8192 字符）。
- 响应安全捕获（测试约定）：新返回值同样 own-data；`coverStatus.tempArtifacts` ≤ 8 项、`stages` ≤ 4 项、字符串 ≤ 8192；不接受 caller accessor。

错误码与 path/reason 见 §11；固定优先级见 §11.3。

### 3.6 方法兼容矩阵（旧/新 client × legacy/Cover × 状态）

| 调用者/对象 | legacy 出生（无 Cover intent） | Cover 出生（CLAIMED/有 attempt） | Cover 出生（FINAL SAVED） | Cover 出生（FINAL 非 SAVED / UNKNOWN） | 未知版本 |
|---|---|---|---|---|---|
| 旧 client `run/save` | 原行为 | `TASK_OWNER_COVER_LEGACY_BIRTH`（0 执行、0 改盘） | `TASK_OWNER_COVER_LEGACY_BIRTH`（不重跑） | 同左 | `*_STORE_INVALID` |
| 旧 client `get/artifactStatus` | 原行为 | 读出 Task 投影（ownerState=`UNKNOWN`，不暴露进度） | `SAVED` | `UNKNOWN` | `*_STORE_INVALID` |
| 新 client `executeCover` | `TASK_OWNER_COVER_BIRTH_REQUIRED` | 同 Intent/同 requestKey → 当前状态（不重跑）；旧 attempt 在途 → 当前状态；UNKNOWN → `TASK_OWNER_COVER_EXECUTION_UNKNOWN` | 同 Intent → `EXISTING` | FAILED/CANCELLED → 允许新 attempt（新 requestKey，attemptSeq+1）；UNKNOWN → `EXECUTION_UNKNOWN` | `*_STORE_INVALID` |
| 新 client `coverStatus` | `TASK_OWNER_COVER_BIRTH_REQUIRED` | 返回进度/租约/取消 | 返回 SAVED | 返回对应终态 | `*_STORE_INVALID` |
| 新 client `requestCoverCancel` | `TASK_OWNER_COVER_BIRTH_REQUIRED` | ACCEPTED/ACKNOWLEDGED/STOPPED/TOO_LATE | TOO_LATE | 固定返回（见 §8.3） | `*_STORE_INVALID` |

- 旧 client 永远看不到 Cover 进度/新错误码（除 fail-closed 的 StoreInvalid）；新 client 的所有方法对 legacy 出生都返回固定“需要 Cover 出生”，不隐式升级/不换 ID。
- 任何“拒绝”分支都 **0 改盘**；读取分支只 fresh 读。

## 4. FUTURE：Intent 规范

### 4.1 intentDraft 恰 19 键 / 完整 Intent 恰 25 键

`intentDraft`（调用者提交，19 键）：

| # | 字段 | 类型/可空 | 来源 | truth |
|---:|---|---|---|---|
| 1 | `intentVersion` | 整数，恒 1 | 本契约 | — |
| 2 | `scopeId` | string | 调用者 | CURRENT |
| 3 | `sourceRef` | 物理库 ref `^artifact:fixture-bytes-[0-9a-f]{32}$` | 调用者（必须等于 sourceEntry.artifactRef） | DECLARED |
| 4 | `sourceRevision` | 整数 ≥1 | 调用者声明 | DECLARED（非权威） |
| 5 | `rightsState` | 仅 `GRANTED` | 调用者（须等于 sourceEntry.rights.state） | DECLARED |
| 6 | `rightsProofRef` | string 1..128 | 调用者 | DECLARED |
| 7 | `rightsExpiresAt` | canonical ISO 或 null | 调用者 | DECLARED |
| 8 | `voiceProfileId` | string | 调用者（须与出生 voice binding 一致） | DECLARED |
| 9 | `profileRevision` | 整数 ≥1 | 调用者 | DECLARED |
| 10 | `modelAssetId` | string | 调用者 | DECLARED |
| 11 | `modelRevision` | 整数 ≥1 | 调用者 | DECLARED |
| 12 | `modelIntegrityTruth` | 恒 `DECLARED_FIXTURE` | 本契约 | DECLARED |
| 13 | `instanceId` | string | 调用者 | DECLARED |
| 14 | `candidateId` | 恒 `rvc` | 调用者 | DECLARED |
| 15 | `modelRef` | string | 调用者 | DECLARED |
| 16 | `backendRevision` | 整数 1 | 本契约 | DECLARED |
| 17 | `pitchShift` | 整数 -12..12 | 调用者 | DECLARED |
| 18 | `recipe` | 恰 5 键（§4.2） | 调用者 | DECLARED |
| 19 | `outputProfile` | 恰 4 键（§4.2） | 调用者 | DECLARED |

`intent`（catalog 组装，25 键）= intentDraft 19 键 + `taskId`（catalog 签发）+ `birthIdentityHash`（`identityHashOf(record)`）+ `birthObservedAt`（request.observedAt）+ `sourceEntryIdentityHash`/`sourceByteSha256`/`sourceByteLength`（sourceEntry 实测）。这些字段由 catalog 在出生时计算/复制，调用者不能自填。

### 4.2 recipe / outputProfile

- `recipe`（5 键）：`sourceLayout ∈ MIXED|CLEAN_VOCAL`；`separationPreset ∈ NONE|FIXTURE_TWO_STEM`（MIXED↔FIXTURE_TWO_STEM、CLEAN_VOCAL↔NONE）；`mixMode ∈ VOCAL_ONLY|WITH_INSTRUMENTAL`；`vocalGainDb`/`instrumentalGainDb` 为**整数** -24..12；`VOCAL_ONLY` 时 instrumental=0；`CLEAN_VOCAL+WITH_INSTRUMENTAL` 出生即拒绝。
- `outputProfile`（4 键）：`format:'WAV'`；`codec:'PCM_S16LE'`；`sampleRate ∈ {16000,22050,24000,32000,44100,48000}` 且必须等于源实测；**`channels` 在 Fake RVC 路径上只允许 `1`**（旧 RVC Fixture 仅 mono）；源 channels ≠1 或 outputProfile.channels ≠1 → `COVER_INPUT_INVALID`，不擅自重采样/立体声适配（092-R02）。

### 4.3 Canonical 形式与 hash

按 §4.1 的编号顺序（intent 组装后的 25 键按同一固定顺序：1–23 → taskId/birth* 位置固定在 intentVersion 之后）拼接，无空白；字符串标准 JSON 转义、不 trim/不归一化；整数十进制（`-0→0`）；null 写 `null`；recipe/outputProfile 子顺序固定。UTF-8 后 SHA-256 即 `intentHash`。排除时间（除 birthObservedAt）、调度/进度、attemptId、临时句柄。

### 4.4 canonical 向量（合法正例）

合法示例：physical sourceRef、`rightsState:'GRANTED'`、mono、pitch 0、gains 0；`birthIdentityHash` 由 `identityHashOf(record)` 计算为：

```
bf3c034eb609624d27f8d3994c9b5b86500eca247a7171e27466bf4c212ffedc
```

canonical 字节长度 **1118 B**；基础 `intentHash`：

```
44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13
```

| 单字段变体 | intentHash |
|---|---|
| `sourceByteSha256` → `d4…d4` | `5e877997594e33e18ad022abb0aa7197660936bd52ad8decc06da30dfe90d035` |
| `pitchShift` → 7 | `d9f81e88f48e6a55b89ddb56e6c1cc0038c7aeae28d8ab8bf058d715a5ab9ee7` |
| `modelRevision` → 2 | `59eedd60f39eef3729bd10aaea79c55d98a85a8611cee0e5e6efacb99809bb38` |
| `vocalGainDb` → -6 | `dc747629f7b1cb9fde182161c4d80f860ec2c79b26631daf73b6baa054e97177` |
| `rightsState` → `REVOKED`（仅 canonical 负向数据，**非合法出生输入**） | `58a24653466eee98cc4650c89b0010dfc902365e08a767099502944320015413` |

负例：`rightsState:'REVOKED'` 的请求在出生/执行入口先被枚举拒绝（`COVER_INPUT_INVALID`），不会进入“合法差 Intent 冲突”分支；该 hash 仅用于证明 canonical 算法对字段敏感。

### 4.5 稳定源身份（sourceEntryIdentityHash）

`sourceEntryIdentityHash = SHA256(UTF-8(canonical {artifactRef, scopeId, requestKey, origin, createdAt, byteSha256, byteLength}))`（7 字段固定顺序）。示例值：

```
04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61
```

规则：
- 库 import 事务落盘并 fresh 读回后由库计算；`createdAt` **参与** hash，因此同 ref 删除后重建（新 requestKey/createdAt）必然产生新 hash；同条目原字节与元数据不变才保持。
- 旧库墓碑/不复用 ref 的规则优先；不凭 caller 数字自证。
- 声明 `sourceRevision` 只是 Fixture 输入 inventory 的声明版本；真实版本以 `sourceEntryIdentityHash` + fresh STORED 字节为准（映射表 §5.2）。


---

## 5. FUTURE：真实源、权利映射、Provider 适配与 Stage 来源（092-R02）

### 5.1 声明权利 vs 库权利（明确映射，不放宽旧库）

| 域 | 事实 | 允许值 | 使用者 |
|---|---|---|---|
| Task/出生声明 | `taskDraft.rights.state` | 仅 `CONFIRMED_FIXTURE` | catalog 出生（声明） |
| Artifact 库（权威） | pack entry `rights.state` + `proofRef` + `expiresAt` | 仅 `GRANTED` + 非空 proofRef（1..128） | 唯一保存 writer、Cover 执行 fresh 校验 |
| Intent（记录库域事实） | `rightsState` / `rightsProofRef` / `rightsExpiresAt` | `GRANTED` / 库 proofRef / 库 expiry | 出生绑定与执行对照 |

规则：
1. 出生时 `sourceEntry.rights` 必须来自**同一 sandbox 的 STORED 库条目**（fresh `readStoredForSave` + `readBytes`），且 `state==='GRANTED'`、`proofRef` 非空、`expiresAt===null || Date.parse(expiresAt) > Date.parse(observedAt)`；否则 `TASK_CATALOG_COVER_INPUT_INVALID` 或（库读取不确定时）`TASK_CATALOG_DEPENDENCY_FAILURE`。
2. 出生声明 `CONFIRMED_FIXTURE` 与库域 `GRANTED` 的对应是**契约映射**，不是把两者当同一字段；旧库 schema/枚举**不扩大、不改**。
3. 执行前与 FINAL 前各做一次 fresh 库校验（STORED/GRANTED/proof/expiry/字节 hash/inspection）；任何不一致 → `COVER_RIGHTS_REJECTED` / `COVER_SOURCE_CHANGED` / `COVER_EXPIRED`（按 §11.3 优先级）。
4. 库 `rights.proofRef` 是权利引用，不是认证 cap；不写入日志/报告明文以外的地方。

### 5.2 父 source.ref → 物理 artifactRef 的绑定

- **唯一合法形式**：`taskDraft.source.ref` 必须匹配 M 库物理 ref `^artifact:fixture-bytes-[0-9a-f]{32}$`，且就是 `sourceEntry.artifactRef`。旧 Fixture 示例里的 `artifact:fixture-source-1` 只是 source resolver 的**声明别名**，不是物理库条目，**不能作为 Cover 源**；本契约示例统一使用物理 ref。
- 不允许静默 alias/前缀改写/按 scope 猜条目；找不到物理条目 → `COVER_SOURCE_UNAVAILABLE`，不创建、不改父 source。
- 逐字段对照（出生与执行时各核一次）：`scopeId` 相同；`artifactRef` 相同；库条目 `inspection.byteLength/sha256` 与 `byteSha256/byteLength` 相同；`rights/expiresAt` 与 `sourceEntry.rights` 相同；父 `task.source` 全生命周期保持出生值不变。

### 5.3 稳定源版本与声明 revision 映射

| 事实 | 来源 | 变化准则 |
|---|---|---|
| 父 `taskDraft.source.ref` | 出生（不可变） | 永不变 |
| `sourceRevision`（声明） | 调用者 Fixture inventory | 不权威；仅用于调用者期望对照；与库无直接字段，不参与 identityHash |
| pack `revision` | 库整包 | 随任何入库/删除变化，**不得**当源版本 |
| 条目 `requestKey`/`createdAt` | 库 entry | 同 ref 重建必变 |
| `sourceEntryIdentityHash` | 库计算（§4.5） | 任一 7 字段变化即变；稳定版本 |
| `byteSha256`/`byteLength` | 库 + inspector 实测 | 真实字节事实 |

- 出生时：`sourceEntry` 由 coordinator fresh 读库生成；catalog 校验其 `sourceEntryIdentityHash` 可按 §4.5 从 7 字段重算（机械可验），不匹配 → `TASK_CATALOG_COVER_INPUT_INVALID`。
- 执行时：fresh 读库并对 7 字段重算；与 Intent 不等 → `COVER_SOURCE_CHANGED`。
- 墓碑/删除：库规则优先；同 ref 已被删除或不可读 → `COVER_SOURCE_UNAVAILABLE`，不重签 ID、不换 ref。

### 5.4 派生 VOCAL → 真实 Provider 适配（字段级）

内部适配器 `buildCoverStageRequest`（FUTURE）把派生阶段映射到 M 原**支持的** Fake RVC gateway 请求（7 键）与 context（3 键），**不把 wrapper 直接当旧 Provider 请求**，也不重跑公开 source resolver：

| 目标字段（gateway request） | 取值来源 | 说明 |
|---|---|---|
| `schemaVersion` | 恒 1 | 原 gateway 版本 |
| `sourceAudioRef` | `derived:fixture-stage:<attemptId>:VOCAL` | 内部派生句柄；不是物理 artifactRef，不进入库/proof |
| `targetModelId` | `intent.modelRef` | 与出生 voice binding 一致 |
| `pitchShift` | `intent.pitchShift` | 原 gateway 校验范围 |
| `outputFormat` | `'wav'`（gateway 固定） | 与 intent.outputProfile 对应 |
| `inputAudio` | 派生 owned bytes 的实测 `{durationMs, byteLength, sampleRate, channels}` | 来自真实 inspector/字节，不用声明值 |
| `rights` | fresh 库 `{state:'GRANTED', proofRef}` | 不是出生声明 |

context 恰 3 键：`{requestId:'cover:<attemptId>:CONVERTING', endpointId: intent.instanceId, scenario:'SUCCESS'}`。

- 调用前：适配器自行校验派生 bytes 的 owned copy/hash/inspection/时长/声道（mono）；调用后：校验 gateway 返回的 `status/artifactRef/mime/sampleRate/durationMs/cancel` 与请求一致，把**返回字节载体**转成下一阶段 owned bytes（不落库、不写盘、不重签）。
- 不新增 dispatcher、第二 gateway、第二 writer 或 caller callback；返回的 fake artifactRef 只是网关输出标识，**不冒充**物理 STORED。
- 失败映射：gateway 校验/协议不符 → `COVER_DEPENDENCY_FAILURE`；业务 BLOCKED → `COVER_STAGE_REJECTED`；取消 → §8。

### 5.5 三图 Stage 来源/输入表

| 图 | 阶段 | inputs（角色） | outputs（角色） | truthLevel |
|---|---|---|---|---|
| MIXED / WITH_INSTRUMENTAL | SEPARATING | SOURCE（STORED 实测） | VOCAL, INSTRUMENTAL | MEASURED_SYNTHETIC |
| 同上 | CONVERTING | VOCAL | CONVERTED_VOCAL | MEASURED_SYNTHETIC |
| 同上 | MIXING | CONVERTED_VOCAL, INSTRUMENTAL | MASTER | MEASURED_SYNTHETIC |
| 同上 | VERIFYING | MASTER | VERIFIED_MASTER（同字节别名） | MEASURED_SYNTHETIC_VERIFIED |
| MIXED / VOCAL_ONLY | 同上 | MIXING 只吃 CONVERTED_VOCAL | MASTER | 同上 |
| CLEAN_VOCAL / VOCAL_ONLY | CONVERTING | **SOURCE**（不依赖不存在的 VOCAL） | CONVERTED_VOCAL | MEASURED_SYNTHETIC |
| 同上 | MIXING | CONVERTED_VOCAL | MASTER | 同上 |
| 同上 | VERIFYING | MASTER | VERIFIED_MASTER | 同上 |

- `SOURCE` 的 manifest `origin` 记录真实来源 `FIXTURE_IMPORT`，`truthLevel='MEASURED_STORED_FIXTURE'`（不是本次合成）；派生阶段 `origin='SYNTHETIC_FIXTURE'`、`truthLevel='MEASURED_SYNTHETIC'`；MASTER 为 `MEASURED_SYNTHETIC_VERIFIED`。
- 每阶段 parentLinks 按本表 inputs 顺序；`sequence` 为图内 0..3；`producedByStage` 见上表。

### 5.6 StageArtifact manifest（24 键完整版 + 中间 7 键紧凑版）

**完整 manifest（24 键，用于 SOURCE 与 MASTER）**：

`manifestVersion, taskId, scopeId, intentHash, attemptId, role, producedByStage, sequence, parentLinks, rootSourceIdentityHash, rootSourceSha256, byteLength, byteSha256, inspection, mediaProfile, rights, expiresAt, modelRevision, profileRevision, backendRevision, origin, truthLevel, availability, verification`

**中间阶段紧凑谱系（7 键，用于 VOCAL/INSTRUMENTAL/CONVERTED_VOCAL）**：

`role, producedByStage, sequence, byteSha256, byteLength, parentLinks, availability`

- `parentLinks`：密集数组，每项 `{role, byteSha256}`，按输入顺序；SOURCE 为空数组。
- `inspection`：19 键，与 M inspector 完全一致；compact 版不含 inspection（只有 byteSha/bytes），**不是完整 StageArtifact**。
- `availability ∈ {TEMP_OWNED, CLEANED, UNKNOWN}`（不出现 DELETED；墓碑只属于库）。
- `verification` 恰 4 键：`{state:'PASSED'|'FAILED'|'NOT_RUN', inspectedAt, inspector:'FIXTURE_WAV_CHECKED', masterSha256}`。
- `truthLevel ∈ {MEASURED_STORED_FIXTURE, MEASURED_SYNTHETIC, MEASURED_SYNTHETIC_VERIFIED}`。
- 内存载体（FUTURE，4 键）：`{bytes: Uint8Array, byteLength, sha256, inspection}`；owned copy，不与调用者/其他阶段共享 backing store；持久快照只写 manifest/compact，不写 bytes。
- 旧 shape 映射（CURRENT，不得混用）：source audio4（声明）≠ 公有 metadata8 ≠ proof artifact8 ≠ root11 ≠ inspection19 ≠ pack entry11 ≠ pack root4；MASTER 以普通 STORED 条目入库，中间产物不冒充 STORED/ref。

---

## 6. FUTURE：三图字节算法与向量

### 6.1 媒体 profile 与限制

- PCM16 LE、WAV 44 B canonical 头；`sampleRate ∈ {16000,22050,24000,32000,44100,48000}`；**channels 固定 1**（Fake RVC 路径）；`dataByteLength = frameCount × 2`，`byteLength = 44 + dataByteLength ≤ 1,048,576`。
- 运算在 16-bit 有符号样本域；输出前 `clamp` 到 `[-32768,32767]`；唯一取整 `Math.trunc`（向零）；不使用浮点 pow/sin/随机；gain 用 §6.3 整数表。
- `origin=SYNTHETIC_FIXTURE`；不是实际音乐分离、不是真实 RVC 推理、不是真实混音。

### 6.2 三图算法

1. **SEPARATING**（仅 MIXED）：`vocal = trunc(s/2)`；`instrumental = s − vocal`。
2. **CONVERTING**：`factor = 1000 + 25 × pitchShift`（700..1300）；`converted = clamp(trunc((vocal × factor) / 1000))`。模型/backend revision 不影响合成字节（如实记录于 Intent）。
3. **MIXING**：
   - WITH_INSTRUMENTAL：`out = clamp(trunc((converted × F(vocalGainDb) + instrumental × F(instrumentalGainDb)) / 1000))`
   - VOCAL_ONLY：`out = clamp(trunc((converted × F(vocalGainDb)) / 1000))`
4. **VERIFYING**：对 MASTER 实际字节调用原 inspector 一次，要求 19 键与声明 inspection **完全相等**、sha256 一致；不生成第二 MASTER；`VERIFIED_MASTER` 是同字节别名。
5. 越界：byteLength > 1,048,576 或 frame 关系不符 → `COVER_RESOURCE_LIMIT`/`COVER_STAGE_REJECTED`，不截断。

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

### 6.4 小向量不变（已复算，保留）

源：4 帧 mono 44100，`[1000,-2000,32767,-32768]`，52 B。

| 产物 | 样本 | WAV SHA-256 |
|---|---|---|
| SOURCE | `[1000,-2000,32767,-32768]` | `11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd` |
| VOCAL | `[500,-1000,16383,-16384]` | `3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2` |
| INSTRUMENTAL | `[500,-1000,16384,-16384]` | `5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f` |
| CONVERTED p0 | `[500,-1000,16383,-16384]` | `3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2` |
| CONVERTED p+7 | `[587,-1175,19250,-19251]` | `63db9d5f601f19613d1056d7c7ecc1cb2f8f3ab16a97d873c1cae751d7725c8f` |
| MASTER 0 dB | `[1000,-2000,32767,-32768]` | `11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd` |
| MASTER vocal −6 dB | `[750,-1501,24591,-24592]` | `751a15a688306c0dee934c113675b488393d126bb181e0fe9dbe69a2ac4e94b7` |

（pitch 0 与 0 dB 的同 hash 是算法事实，Intent 仍以 pitch/gains 区分；不据此称真实处理。）

---

## 7. FUTURE：执行 API、单 claim 事务、版本/checkpoint/附件（092-R03/R04/R05）

### 7.1 三方法 request/result（含时钟）

**executeCover request 恰 8 键**：`schemaVersion(1), scopeId, taskId, requestKey, now, expiresAt, rights, intent`。
- `requestKey` `^[A-Za-z0-9:_-]{1,64}$`；`now/expiresAt` canonical ISO；`rights` `{state:'GRANTED', proofRef}`；`intent` 必须等于出生绑定 Intent（canonical 后比对；不等 → `COVER_INTENT_MISMATCH`；合法字段枚举不符 → 先 `COVER_INPUT_INVALID`）。

**executeCover result 恰 6 键**：`{schemaVersion, outcome, attemptId, statusState, messageZh, value}`；`outcome ∈ {SAVED, EXISTING, CANCELLED, FAILED, UNKNOWN, BLOCKED}`。
**成功 value 恰 8 键**：`{taskId, scopeId, intentHash, attemptId, master(4键), inspection(19键), messageZh, mockOnly}`；`master={artifactRef, byteLength, sha256, expiresAt}`。

**coverStatus request 恰 4 键**：`{schemaVersion, scopeId, taskId, now}`；status 恰 15 键：
`schemaVersion, state, phase, attemptId, attemptSeq, intentHash, stages, cancel, lease, tempArtifacts, master, lastError, messageZh, createdAt, updatedAt`。
- `state ∈ {NO_ATTEMPT, CLAIMED, SEPARATING, CONVERTING, MIXING, VERIFYING, FINALIZING, SAVED, CANCELLED, FAILED, UNKNOWN}`。
- `stages` 稠密 0..4 项 `{stage, status}`；`status ∈ {PENDING, RUNNING, DONE, FAILED, CANCELLED, UNKNOWN}`。
- `cancel = {requested, requestedAt, acknowledgedAt, confirmedAt, reason}`；`lease = {leaseId, kind:'LOGICAL_FIXTURE', gpu:'EXCLUSIVE', acquiredAt, releasedAt|null}|null`。
- `tempArtifacts` 稠密 0..8 项 `{role, byteLength, sha256, availability}`（`availability ∈ {TEMP_OWNED, CLEANED, UNKNOWN}`）。
- `master = {artifactRef, byteLength, sha256, expiresAt}|null`；`lastError={code,path,reason}|null`；时间为 canonical ISO。

**requestCoverCancel request 恰 5 键**：`{schemaVersion, scopeId, taskId, attemptId, now}`；result 恰 5 键：`{schemaVersion, cancelRequested, cancelState, acknowledgedAt, messageZh}`，`cancelState ∈ {ACCEPTED, ACKNOWLEDGED, STOPPED, TOO_LATE, UNKNOWN}`。
- `CANCEL_UNKNOWN` 错误码只在 fence/存储**无法读取**时出现；正常取消永远返回确定的 cancelState，不把“未读到”伪装成 UNKNOWN state。
- 期限：`requestedAt`（持久写入）与本次 request `now` 比较；**不使用未定义时钟**；超过 30,000 ms 仍未 ack → 后续 status 报 `CANCEL_UNKNOWN`，执行仍按 fence 检查但不宣称停止。

### 7.2 owner v3 Cover entry（恰 14 键）

`entryVersion, kind, scopeId, taskId, birthIdentityHash, phase, record, completion, intentHash, intent, attempt, checkpoints, manifest, cancel`

- `phase ∈ {CLAIMED, FINAL}`；`completion` CLAIMED 为 null，FINAL 为 `{kind:'SAVED'|'CANCELLED'|'FAILED'|'UNKNOWN', reason}`（reason 为固定码或 null）。
- `attempt` 恰 **8 键**：`{attemptId, attemptSeq, requestKey, startedAt, finishedAt|null, status, error, lease}`；`status ∈ {CLAIMED, RUNNING, SAVED, CANCELLED, FAILED, UNKNOWN}`；`error={code,path,reason}|null`；`lease` 见 §8.2。
- `checkpoints` 稠密 0..6 项，每项恰 **5 键**：`{index, stage, at, status, tempSummary}`；`stage ∈ {CLAIMED, SEPARATED, CONVERTED, MIXED, MASTER_IMPORTED, VERIFIED}`；`tempSummary = {role, byteSha256, byteLength}|null`。
- `manifest` 6 槽：`source`（24 键或 null）、`vocal`/`instrumental`/`converted`（7 键 compact 或 null）、`master`（24 键或 null）、`verification`（4 键或 null）；CLAIMED 可为 null/部分，FINAL 时 source/master/verification 必须非 null（三图均需 root source；INSTRUMENTAL 仅 WITH_INSTRUMENTAL 非 null）。
- `cancel` 5 键。

### 7.3 revision 公式（唯一、与 M 一致）

- 每次 **Claimed 写**：`revision = current.revision + 1`。
- 每次 **checkpoint 写**：`revision` **不变**（只用新 digest 作为下一 baseDigest）；checkpoint 只更新 Cover CLAIMED entry 的 checkpoints/manifest 摘要。
- **FINAL 写**：`revision = claimRevision + 1`（与 M 的候选 revision 语义完全一致；不引入“final=+2/权重2”）。
- 多任务：每次 CLAIMED/FINAL 各 +1 累计；v3 与 legacy entry 共享同一 revision 序列。
- 示例（单 Cover 任务、0 legacy）：出生 revision 0 → claim 1 →（6 个 checkpoint 仍 1）→ FINAL 2。因此示例 owner 快照 `revision=2`（不是 4）。
- v1.6 proof 的 `claimRevision`/`candidateRevision` 即上述两值；`freshCurrent=proof.claimRevision/claimDigest/baseDigest`、`candidate=claim+1` 语义不变。

### 7.4 锁序与 FINAL 临界区（092-R04）

固定顺序 **Task(owner/catalog) → Artifact**，绝不持 Artifact 反向等 Task：

| 步骤 | 持锁 | 动作 |
|---|---|---|
| 出生 | catalog 写队列（短） | 单快照写 |
| claim | owner 写队列（短） | revision+1、attempt/lease 写入 |
| 阶段计算 | 无队列 | owned bytes/inspector，不写盘 |
| checkpoint | owner 写队列（短） | revision 不变，更新 entry |
| MASTER import | **Artifact 队列** | 单次 import；返回后立即释放 Artifact |
| FINAL | **owner 写队列** | 内部只做 queue-free 的 artifact fresh 读；不获取 Artifact 队列 |
| JOINT | 无写锁 | owner fresh 读 + artifact fresh 读（只读） |
| 取消 | 侧通道 + owner 短写 | 不持 Artifact/Task 反向等待 |

- 旧 legacy save 的 Task→Artifact 顺序与本表一致；Cover 不在持 Artifact 时等待 Task。
- 长阶段不占 capability 全局写队列；每次重新取得时 fresh 核 digest/权限/版本。
- cancel 请求不需要 Artifact 锁；其短写只走 owner 队列（若 owner 队列被同 cap 的 legacy 长写占用，则按合作式让出点等待，不新增调度器）。

### 7.5 checkpoint 语义（持久但不动 revision）

- 持久点 6 个：CLAIMED(0)、SEPARATED(1)、CONVERTED(2)、MIXED(3)、MASTER_IMPORTED(4)、VERIFIED(5)；每 attempt 每点最多一次。
- 每个 checkpoint 的 `tempSummary` 记录该阶段真实 owned bytes 的 `{role, sha256, byteLength}`（不写 bytes）；MASTER_IMPORTED 的 tempSummary 记录库 ref？不——ref 属 manifest/checkpoint 额外字段？为避免 checkpoint 超 5 键，MASTER_IMPORTED 的 `tempSummary` 仍用 `{role:'MASTER', byteSha256, byteLength}`，而真实 `artifactRef` 写入 `manifest.master`（同一短写更新），因此重开可由 checkpoint 4 证明 import 已发生并从 manifest.master 取 ref。**manifest.master 必须在 checkpoint 4 的同一短写中写入**（该写 revision 不变）。
- checkpoint 写不改 `record.state`；Task v1 投影仍为出生态（不塞 SEPARATING 等新值）。

### 7.6 唯一 writer 签名与 coverAttachment（delta 判定）

- 未来签名：`writeOwner(state, bytes, baseDigest, revision, proof = null, coverAttachment = null)` → `openOwnerFile(state).write(bytes, baseDigest, revision, proof, coverAttachment)`；旧 4 参调用完全不变。
- writer 内部：`proof` 仍走 v1.6 的 root11/artifact8 校验与 pre/post 门禁；`coverAttachment` 是**独立第 5 参**，不替代/不塞入 proof。
- **触发条件**：仅当 `planOwnerDelta` 判定本次 `current→candidate` 的**唯一新增 SAVED FINAL** 是 Cover entry（本次 delta 的 savedEntry），才要求 `coverAttachment` 非 null；历史已 SAVED 的 Cover entry 原样保留，不再触发。非 SAVED 写（checkpoint/取消/失败）`coverAttachment` 必须为 null。
- attachment 恰 7 键：`attachmentVersion, intentHash, attemptId, sourceEntryIdentityHash, lineage{sourceSha256,vocalSha256,instrumentalSha256|null,convertedSha256}, masterSha256, verification{validationState,peak,fullScaleSampleCount,durationMs}`。
- writer 校验：`masterSha256===proof.artifact.byteSha256`；`intentHash===candidate cover entry.intentHash`；`attemptId===entry.attempt.attemptId`；`sourceEntryIdentityHash===intent.sourceEntryIdentityHash`；lineage 与 `manifest` compact 记录逐一相等；verification 与 `manifest.verification` 相等。任一不符 → `WRITE_REJECTED` 无锁。

### 7.7 终态写入与可读投影（092-R04）

| 终态 | owner cover entry | Task v1 record | completion.kind | 旧 `get` 投影 | 新 `coverStatus.state` |
|---|---|---|---|---|---|
| SAVED | FINAL + master | `state='SAVED'`、`outputArtifactRef=真实 ref` | `SAVED` | `SAVED` | `SAVED` |
| CANCELLED | FINAL（可无 master；若已 import 则 manifest.master 记录 ref） | `state='CANCELLED'`、`cancel.confirmed=true`、`outputArtifactRef=null` | `CANCELLED` | `UNKNOWN`（旧读者不谎报成功） | `CANCELLED` |
| FAILED | FINAL（manifest partial/null） | `state='FAILED'`、`lastError={code}`、ref null | `FAILED` | `UNKNOWN` | `FAILED` |
| UNKNOWN | **保持 CLAIMED**（不写 FINAL） | `state` 保持出生态（不写新值） | — | `UNKNOWN` | `UNKNOWN` |

- CANCELLED/FAILED 的 FINAL 写仍走唯一 writer；`record.state` 只用 M 既有枚举；不把取消写成 SAVED、不往 Task state 塞新值。
- 取消/失败/UNKNOWN 释放规则见 §8；UNKNOWN 不写 FINAL、保留 claim 与（必要时）lease。

### 7.8 崩溃、重开与执行去重（092-R05）

| 崩溃点 | 持久事实 | 重开结果 | 允许动作 |
|---|---|---|---|
| claim 后、SEPARATED checkpoint 前 | CLAIMED + checkpoint 0 | `UNKNOWN`（无法证明源转换未执行） | 只读核对；**不自动重跑** |
| 转换执行后、checkpoint 1/2 写前 | CLAIMED + 旧 checkpoint | `UNKNOWN` | 同上；不得以“临时丢失”为由重算 |
| MASTER import 后、checkpoint 4 写前 | 库可能有新 STORED；owner 无 ref 记录 | `UNKNOWN` | 只读；不得再次 import/删已知 STORED |
| checkpoint 4 已写、FINAL 前 | CLAIMED + manifest.master（真实 ref/sha） | `CLAIMED` + master 事实 | 允许**仅**在 fresh 校验库 STORED 与 receipt 一致后完成 FINAL 写；校验失败 → `UNKNOWN`；**不再 import** |
| FINAL 写/rename 不确定 | FINAL 或 CLAIMED 可能 | `UNKNOWN` + capability 锁 | 不重试、不换 ID、不回滚 |
| FINAL 已写、JOINT 未完成 | FINAL + STORED | 后续 fresh 读决定 SAVED/UNKNOWN | 不重跑 |
| 已 SAVED 重开 | FINAL + STORED | `EXISTING`（同 Intent） | 0 RVC/0 import；可用性 fresh 读 |

**去重/requestKey 规则**：
- `attempt.requestKey` 持久保存；`executeCover` 同 task/Intent/requestKey：CLAIMED → 返回当前状态（0 重跑）；SAVED → `EXISTING`；FAILED/CANCELLED → 新 attempt 需**新 requestKey**（attemptSeq+1），旧 receipt/attempt 保留；UNKNOWN → `COVER_EXECUTION_UNKNOWN`（不换 key、不新 attempt）。
- 差 Intent 一律 `COVER_INTENT_MISMATCH`；不得用换 key 绕过差 Intent/单 claim。
- 新 attempt 不覆盖旧 attempt/checkpoint 历史（保留在 attemptSeq 旧记录？owner entry 只有当前 attempt；旧 attempt 摘要写入 `checkpoints`？）——为保持 entry 14 键，旧 attempt 不另存；新 attempt 只允许在 FAILED/CANCELLED 的 FINAL 之后，并保留原 FINAL completion 作为历史？这会导致 entry 被覆盖。**修订**：FAILED/CANCELLED 后重新执行需要一个新的 Cover entry？不允许换 ID。因此定义：FAILED/CANCELLED 为**终态**；同 task 重开只能 `EXISTING`/读取，不提供新 attempt。`attemptSeq` 因此恒为 1（保留字段以便未来扩展，但本契约不新增重试）。这样避免历史覆盖与 UNKNOWN 重跑。§12 中“允许新 attempt”删除，改为固定终态。

### 7.9 完整虚构 JSON 示例（NOT_IMPLEMENTED）

示例均使用合法物理 sourceRef、`birthIdentityHash=bf3c034e…ffedc`、Intent hash `44223ddf…0f13`、单任务 revision 2。

**executeCover request（8 键）**

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
  "requestKey": "cover-exec:demo-1",
  "now": "2026-11-01T00:00:01.000Z",
  "expiresAt": "2026-11-02T00:00:00.000Z",
  "rights": { "state": "GRANTED", "proofRef": "fixture-rights:cover-demo-1" },
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
    "recipe": { "sourceLayout": "MIXED", "separationPreset": "FIXTURE_TWO_STEM", "mixMode": "WITH_INSTRUMENTAL", "vocalGainDb": 0, "instrumentalGainDb": 0 },
    "outputProfile": { "format": "WAV", "codec": "PCM_S16LE", "sampleRate": 44100, "channels": 1 }
  }
}
```

**executeCover 成功 result（6 键；value 8 键）**

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
    "intentHash": "44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13",
    "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
    "master": { "artifactRef": "artifact:fixture-bytes-00112233445566778899aabbccddeeff", "byteLength": 52, "sha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "expiresAt": "2026-11-02T00:00:00.000Z" },
    "inspection": { "schemaVersion": 1, "format": "WAV", "codec": "PCM_S16LE", "bitsPerSample": 16, "sampleRate": 44100, "channels": 1, "byteLength": 52, "dataByteLength": 8, "frameCount": 4, "durationMs": 0.09070294784580499, "peak": 1, "fullScaleSampleCount": 2, "sha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "validationState": "FIXTURE_WAV_CHECKED", "mockOnly": true, "realOperationAllowed": false, "submitAllowed": false, "automaticRetryAllowed": false, "messageZh": "演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。" },
    "messageZh": "演示翻唱已保存到本地演示资产库；这不是真实生成，也没有发送到微信。",
    "mockOnly": true
  }
}
```

**coverStatus 结果（15 键）**

```json
{
  "schemaVersion": 1,
  "state": "SAVED",
  "phase": "FINAL",
  "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
  "attemptSeq": 1,
  "intentHash": "44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13",
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

**requestCoverCancel 结果（5 键）**

```json
{ "schemaVersion": 1, "cancelRequested": true, "cancelState": "ACCEPTED", "acknowledgedAt": null, "messageZh": "已收到演示取消请求；尚未确认阶段停止。" }
```

**owner 快照 v3（revision 2，一个 Cover entry，14 键）**

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
      "intentHash": "44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13",
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
        { "index": 0, "stage": "CLAIMED", "at": "2026-11-01T00:00:01.000Z", "status": "DONE", "tempSummary": null },
        { "index": 1, "stage": "SEPARATED", "at": "2026-11-01T00:00:02.000Z", "status": "DONE", "tempSummary": { "role": "VOCAL", "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "byteLength": 52 } },
        { "index": 2, "stage": "CONVERTED", "at": "2026-11-01T00:00:03.000Z", "status": "DONE", "tempSummary": { "role": "CONVERTED_VOCAL", "byteSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "byteLength": 52 } },
        { "index": 3, "stage": "MIXED", "at": "2026-11-01T00:00:04.000Z", "status": "DONE", "tempSummary": { "role": "MASTER", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "byteLength": 52 } },
        { "index": 4, "stage": "MASTER_IMPORTED", "at": "2026-11-01T00:00:04.500Z", "status": "DONE", "tempSummary": { "role": "MASTER", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "byteLength": 52 } },
        { "index": 5, "stage": "VERIFIED", "at": "2026-11-01T00:00:04.800Z", "status": "DONE", "tempSummary": { "role": "MASTER", "byteSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "byteLength": 52 } }
      ],
      "manifest": {
        "source": {
          "manifestVersion": 1,
          "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
          "scopeId": "scope:fixture-demo",
          "intentHash": "44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13",
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
          "expiresAt": null,
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
          "intentHash": "44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13",
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

**coverAttachment（7 键，与上例谱系一致）**

```json
{
  "attachmentVersion": 1,
  "intentHash": "44223ddfcef329c513b236bf67b323820a0123b935a269c29c56ce2ab7700f13",
  "attemptId": "cover-attempt:00112233445566778899aabbccddeeff",
  "sourceEntryIdentityHash": "04cd12de8c127b965ed88d92550d0074f292c0df7d40e8d2e4cd6135d5eade61",
  "lineage": { "sourceSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd", "vocalSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2", "instrumentalSha256": "5160b2b3f7bf66d94b5621b98ab8e948cfd9ecd7426e3c7bf57df4d9a911985f", "convertedSha256": "3abff58b5e15546f07ba05ad86b91786742b5a6abb790ba1429062877c93d0f2" },
  "masterSha256": "11d76b6130456b150b9822441ba7511c7fcd8ccf585686b25d7c012fa24fa7fd",
  "verification": { "validationState": "FIXTURE_WAV_CHECKED", "peak": 1, "fullScaleSampleCount": 2, "durationMs": 0.09070294784580499 }
}
```


---

## 8. FUTURE：取消、资源、清理与缓存（092-R04）

### 8.1 取消侧通道与合作点

- `requestCoverCancel` 写同 owner 的 cancel fence（内存 + 一次短 owner 队列写），**不排入长执行队列**；不持 Artifact/Task 反向锁。
- 固定合作点：阶段开始前、阶段循环每 4096 帧（`await Promise.resolve()` 让出，不新增调度器）、每个 checkpoint 前后、import 前、FINAL 提交 fence 前。
- FINAL 的 `temp fsync → rename` 之间为**不可中断区**；该区内请求也不会被丢弃：先记录，提交完成后按 §8.3 固定响应。
- 时钟：只使用请求/持久记录中的 canonical 时间（`cancel.requestedAt` 与 cancel request `now`）；不读系统时钟、不用未定义“fresh now”。

### 8.2 取消响应表（按区域唯一）

| 请求到达时状态 | cancelState | 是否写盘 | 执行动作 |
|---|---|---|---|
| 未 claim（NO_ATTEMPT） | `TOO_LATE`（无尝试可停） | 否 | 无 |
| CLAIMED / 阶段计算中 | `ACCEPTED` | 短写 `cancel.requested/requestedAt` | 下一合作点 ack → `ACKNOWLEDGED`；停止后 `STOPPED` + FINAL CANCELLED |
| checkpoint 写中 | `ACCEPTED` | 同上（排队后写） | 该短写完成后 ack |
| MASTER import 进行中 | `ACCEPTED` | 同上 | import 返回后不再进入下一步，转停止/清理；不丢弃已入库 STORED |
| FINAL 不可中断区（fsync 后、rename 前） | `TOO_LATE` | 不写 fence | FINAL 完成；随后 SAVED；不撤销 |
| FINAL 已提交 / JOINTP 后 | `TOO_LATE` | 否 | 不回滚、不改历史 |
| fence/存储不可读 | `UNKNOWN` + 错误 `CANCEL_UNKNOWN` | 否 | 只读核对，不改状态 |

- `cancelState` 只有在 fence/存储无法读取时才 `UNKNOWN`；正常路径不出现“未知取消”。
- `requested/acknowledged/confirmed` 三个事实分别可验：请求短写、合作点 ack、FINAL CANCELLED 写入。
- 取消后的临时字节按 §8.4 清理；已 import 的 STORED MASTER 不删除（记录在 manifest.master，availability=`STORED`），CANCELLED 的 record.outputArtifactRef 仍为 null。

### 8.3 租约（逻辑）

- `lease = {leaseId, kind:'LOGICAL_FIXTURE', gpu:'EXCLUSIVE', acquiredAt, releasedAt|null}`，归属 task/scope/intent/attempt；claim 写入时获得。
- 释放点：SAVED / CANCELLED / FAILED 的持久写；**UNKNOWN 时保留 lease**，防止重跑；已确认停止并写入终态后才释放。
- 本地 GPU 类独占；CPU/cloud 不抢 GPU（本契约只有 SYNTHETIC_FIXTURE，全部记 `LOGICAL_FIXTURE`）；readiness 的 `AVAILABLE` 不是 lease。
- 这是逻辑占用，不是 GPU/显存/进程/设备实测。

### 8.4 清理与缓存

- 只清理本 attempt 证明拥有的临时字节/compact 记录；不删父 SOURCE、共享模型、其他 task、STORED MASTER、不确定资产。
- 清理结果：`availability ∈ {CLEANED, UNKNOWN}`；失败不谎报；不宣称 JS 副本安全擦除。
- 缓存默认禁用；未来启用须另审并绑定 source identity + rights + model/profile/backend revisions + recipe + outputProfile + expiry，每次 fresh 复核权利撤销/过期。

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

### 9.2 入场预留：按实际编码长度，不用未证常数

- 库 import 的候选 entry 由同一 writer 序列化为完整 JSON（11 键，payload 为 base64）。**入场判据**：`currentPackBytes + utf8(serializeEntry(candidateEntry)) ≤ 6,291,456`，其中序列化函数与 writer 同一实现，不做常数估算。
- 可复算示例（MASTER 取最大 1,048,576 B）：payload base64 `4×ceil(1048576/3)=1,398,104`；实测 entry 骨架（其余 10 键、inspection 取最大字段长度、UTF-8）**966 B**；entry 合计 **1,399,070 B**；因此 `currentPackBytes ≤ 6,291,456 − 1,399,070 = 4,892,386`（不是 4,891,816；旧稿 4,893,312 为错误）。
- 解码总量：`currentDecodedBytes + masterBytes ≤ 4,194,304`（MASTER 最大时 `currentDecodedBytes ≤ 3,145,728`）。
- 条目：`currentEntries + 1 ≤ 32`（含 tombstone）。
- owner：`utf8(owner candidate snapshot) ≤ 131,072` 且 `entries ≤ 32`；Cover entry 实测示例（完整 Intent+6 checkpoint+6 manifest 槽）**4,964 B**，按最终内容逐字节计算；`16,384 B` 仅为单条设计上限，**不是**入场判据本身。
- 以上均在入场时计算一次，并在 MASTER import 前与 FINAL 写前**按当时实际字节 fresh 重算**；任一不满足 → `COVER_RESOURCE_LIMIT`，0 新入库。

### 9.3 受控内存峰值（真实事务，含已有库负载）

场景：既有解码 `D=3,145,728`（上限）+ 新 MASTER `M=1,048,576`：

| 项 | 字节 | 说明 |
|---|---:|---|
| 已解码既有 payload | 3,145,728 | 解析现有条目所需 |
| MASTER owned copy | 1,048,576 | import 的 request bytes |
| MASTER inspector 副本 | ≤1,048,576 | inspector 内部 owned 副本 |
| 既有 payload base64 重编码 | 4,194,304 | `4×ceil(D/3)` |
| MASTER base64 | 1,398,104 | `4×ceil(M/3)` |
| 组合 JSON 输出字符串 | ≈5,593,432 | 编码串 + 骨架/转义 |
| **合计** | **≈17,477,296** | 不含 JS/GC 隐含堆 |

- **import 事务受控内存预算 = 20,971,520 B（20 MiB）**（该场景余量约 3.5 MiB）；超出 → `COVER_RESOURCE_LIMIT`。
- **阶段计算受控预算 = 3,145,728 B**（SOURCE/VOCAL/INSTRUMENTAL 各 1 MiB 同时存活的最坏图）；MIXING 时 INSTRUMENTAL+CONVERTED+MASTER 同样 3 MiB。
- 明确排除：JS 运行时/GC 隐含堆、V8 字符串内部表示、临时 GC 副本；这些不为本契约承诺，但受控 native/字符串峰值如上表全部计入。
- 释放/UNKNOWN 退场：SOURCE 在 SEPARATED checkpoint 后释放；VOCAL 在 CONVERTED 后释放；INSTRUMENTAL/CONVERTED 在 MIXING 后释放；MASTER 在 FINAL+JOINT 后释放；UNKNOWN 时保留 claim/lease 与 manifest 事实，临时字节按 §8.4 标 `CLEANED`/`UNKNOWN`。

### 9.4 容量示例（CURRENT 计算）

- 1,048,576 B 上限：mono 44,100 Hz 524,266 帧 ≈ **11,888.1179 ms**；48,000 Hz mono ≈ 10,922.2 ms；stereo 不在 Fake RVC 路径（§4.2）。
- 不能把 inspector 的 50 MiB / 300,000 ms 当库 1 MiB 上限；超限固定拒绝，不截断。
- 32 条目是上限，不承诺 32 个最大 Cover 同时装下（解码总量/pack 先到限）。

## 10. FUTURE：版本与兼容矩阵

### 10.1 支持版本

| 文件 | 支持版本 | 未知版本行为 |
|---|---|---|
| catalog 快照 | v1（legacy）、v3（typed legacy/Cover） | 其他 → `TASK_CATALOG_STORE_INVALID` fail-closed |
| owner 快照 | v1、v2、v3（Cover variant） | 其他 → `TASK_OWNER_STORE_INVALID` fail-closed |
| Artifact pack | v1（不变） | 其他 → `ARTIFACT_LIBRARY_STORE_INVALID`（M 原行为） |
| 公开 schema | 恒 1（catalog/owner/Task/新方法 request） | 其他 → 原 `UNSUPPORTED_VERSION` |

### 10.2 程序 × 版本矩阵

| 程序 \ 对象 | catalog v1 | catalog v3 | owner v1/v2 | owner v3 | 未知版本 |
|---|---|---|---|---|---|
| 旧程序（M） | 正常 legacy | `STORE_INVALID`（fail-closed） | 正常 | `STORE_INVALID` | `STORE_INVALID` |
| 新程序（FUTURE） | 正常 legacy（Cover 出生写 v3） | 正常 legacy + Cover | 正常 legacy | 正常 Cover 读取/恢复 | 对应 `*_STORE_INVALID` |

- 旧程序遇新版本一律 fail-closed；新程序不自动迁移旧文件；只有下一次 Cover 出生/owner Cover claim 才写 v3。
- 方法兼容矩阵见 §3.6（旧/新 client × legacy/Cover × 状态）。

## 11. FUTURE：错误码与优先级

### 11.1 owner Cover 码（`TASK_OWNER_COVER_` + KEY，21 个）

| KEY | path | 固定 reason | 中文 |
|---|---|---|---|
| `INPUT_INVALID` | `$`/字段 | `invalid cover input` | 演示翻唱执行请求格式不正确。 |
| `BIRTH_REQUIRED` | `$` | `cover birth required` | 该任务不是 Cover 出生，不能执行翻唱。 |
| `LEGACY_BIRTH` | `$` | `cover intent not bound` | 该任务没有绑定 Cover 意图，旧执行路径不会运行。 |
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

### 11.2 catalog Cover 码（`TASK_CATALOG_COVER_` + KEY，3 个）

| KEY | 场景 | 中文 |
|---|---|---|
| `INPUT_INVALID` | 出生输入/intentDraft/sourceEntry 不合法 | 演示翻唱出生请求格式不正确。 |
| `INTENT_CONFLICT` | 同 key 重算 Intent 不等/legacy 冲突 | 该演示翻唱请求与已有意图冲突。 |
| `BIRTH_REJECTED` | 出生快照/关联校验失败 | 演示翻唱出生被拒绝。 |

### 11.3 固定优先级

1. 输入/根结构（`INPUT_INVALID`，含 `rightsState !== 'GRANTED'` 等枚举拒绝）；
2. 出生/Intent（`BIRTH_REQUIRED`/`LEGACY_BIRTH`/`INTENT_MISMATCH`）；
3. rights/expiry（`RIGHTS_REJECTED`/`EXPIRED`）；
4. source fresh（`SOURCE_UNAVAILABLE`/`SOURCE_CHANGED`）；
5. 资源（`RESOURCE_LIMIT`）；
6. 阶段（`STAGE_REJECTED`/`DEPENDENCY_FAILURE`）；
7. 取消（`CANCEL_TOO_LATE`/`CANCEL_UNKNOWN`）；
8. 保存（`SAVE_REJECTED`/`SAVE_UNKNOWN`）；
9. 存储不确定（`STORE_INVALID`/`STORE_CHANGED`/`EXECUTION_UNKNOWN`/`UNKNOWN`）。

旧 22 码与 v1.6 语义不变；Cover 码不与旧码互换。

## 12. FUTURE：状态/失败矩阵

| # | 状态/事件 | 磁盘/资产事实 | 固定结果 | 锁域 | 允许/禁止 |
|---:|---|---|---|---|---|
| 1 | legacy 出生 + executeCover | 无 Cover entry | `BIRTH_REQUIRED` | 无 | 禁止隐式升级/换 ID |
| 2 | Cover 已绑定未 claim | catalog v3 有 intent | `NO_ATTEMPT` | 短写 | 可开始；旧 run/save 0 执行 |
| 3 | claim 在途 | CLAIMED + attempt + checkpoint | `CLAIMED/...` | owner 短写 | 可 status/cancel；并发 execute 返回当前状态 |
| 4 | 阶段确定性失败 | CLAIMED→FINAL FAILED、临时清理 | `FAILED`；`STAGE_REJECTED` | owner 短写 | 终态；不自动/不换 key 重跑 |
| 5 | 阶段 UNKNOWN | CLAIMED、无 FINAL | `UNKNOWN`；`EXECUTION_UNKNOWN` | owner + lease hold | 只读核对；不重跑/不换 key |
| 6 | 取消 accepted/acked/stopped | CLAIMED→FINAL CANCELLED | `CANCELLED` | 侧通道+短写 | 不重复取消；已 import 资产不删 |
| 7 | FINAL 已提交后取消 | FINAL + STORED | `SAVED`；`CANCEL_TOO_LATE` | 无 | 不回滚/不改历史 |
| 8 | MASTER import 后、FINAL 前失败 | 库有新 STORED；owner CLAIMED+checkpoint4 | `UNKNOWN`/`SAVE_REJECTED` | Artifact→owner | 不重复 import；可按 §7.8 完成 FINAL 或只读 |
| 9 | FINAL rename 不确定 | CLAIMED 或 FINAL | `SAVE_UNKNOWN`→`UNKNOWN` | 底层锁 | 不重试/不回滚 |
| 10 | JOINT 失败 | FINAL + STORED | `EXECUTION_UNKNOWN` | 底层锁 | 不重跑；后续 fresh 读 |
| 11 | 已 SAVED 重开 | FINAL + STORED | `EXISTING`（同 Intent） | 无 | 0 RVC/0 import |
| 12 | 同 task 同 Intent 不同 requestKey | 已 CLAIMED/FINAL | 当前状态/`EXISTING`；UNKNOWN → `EXECUTION_UNKNOWN` | 无 | 不换 key 绕过 |
| 13 | 同 task 差 Intent | 已有 SAVED/CLAIMED | `INTENT_MISMATCH`/`INTENT_CONFLICT` | 无 | 不改 ID/不换 key |
| 14 | 旧程序遇 v3 | catalog/owner v3 | `STORE_INVALID` | 无 | fail-closed |
| 15 | 新程序遇未知版本 | 任意未知 | `*_STORE_INVALID` | 无 | fail-closed |

- UNKNOWN 不自动重试、不回滚、不换 ID、不删不确定资产、不降级历史 SAVED。
- 中间 rename/中间 store 标 **N/A**（不新建中间持久 store）。
- 保留 M v1.6 已验 11 行机械故障事实，本表只覆盖新增维度。

## 13. FUTURE：实施表与七组验收

### 13.1 未来实施表（全部 NOT_IMPLEMENTED）

| 文件/接口 | 类型 | 依赖 | 说明 |
|---|---|---|---|
| `core/audio/cover-intent.mjs`（新） | 内部模块 | `fixture-store-base-internal.mjs` | canonical Intent/hash/冲突比较 |
| `core/audio/cover-birth.mjs`（新） | 内部模块 | `artifact-library.mjs`、catalog | fresh STORED 读取 + sourceEntry 生成 + 调 `reserveCover` |
| `core/audio/cover-stage-bytes.mjs`（新） | 内部模块 | `wav-byte-inspector.mjs`、gateway | 分离/转换/混音/验证与 owned bytes |
| `core/audio/cover-executor-internal.mjs`（新） | 内部模块 | owner、library、store | 单 claim、checkpoint、cancel、lease、attachment |
| `core/audio/task-catalog.mjs`（改） | v3 + `reserveCover` | 新 cover-intent | catalog v3 解析与原子出生 |
| `core/audio/fixture-task-store-internal.mjs`（改） | v3 + 第 5 参 | 新 cover-intent | owner v3 解析/写事务/attachment 分支 |
| `core/audio/task-owner.mjs`（改） | 新三方法 | 新 executor | execute/status/cancel |
| 新测试（FUTURE） | 测试 | 上述 | 七组验收，本轮不写 |

### 13.2 七组有限验收（FUTURE）

1. **身份/源**：物理源绑定、原子出生与 legacy 抢跑 0 执行、同 Intent 0 重跑、差参/版本/rights 冲突、父 source 不变、真实 STORED/错派生拒绝。
2. **三图/Fake bytes**：三图与清唱缺伴奏、hash/model/pitch/gain 因果、MASTER inspection、损坏/错模型/旧 hash；合成不称真实音乐。
3. **rights/预算**：阶段与提交前撤权/未知/过期；item/峰值/4 MiB/32 项/pack/owner 实际字节；已有 D 与 MASTER 同事务峰值；缓存禁用。
4. **一次保存/故障**：并发/重开仅 1 claim/1 转换/1 import/1 FINAL，差 Intent 0 执行；原 pre/post/JOINT/域锁、delete 等待 JOINT、UNKNOWN 资产保留与 §7.8 崩溃表。
5. **取消/资源**：各区域 cancel 响应表、ack/stop/release/cleanup 分证、忙时可控制、GPU 独占/CPU-cloud 独立、UNKNOWN 不自动重跑。
6. **旧新兼容/协议**：版本矩阵/方法矩阵、原公 8/私 8/root 11/19/Task 投影、三方法 envelope、getter0/预算、完整正负例。
7. **父 Fake E2E**：原 08 Fake Model/Audio/Relay 父链另行门禁；Cover 不前置真实 12/13；动态 Evidence/资源责任；合同不关闭父 08。

### 13.3 本轮不做

不新增 runtime/planner/validator/reference/tests；不运行阶段；不创建主任务/资产；不加 writer/store；不调用真实模型/媒体/GPU/设备/微信/安装；不改 M 源码/旧 v1.6/F-A。

## 14. 机械核验、来源与已知限制

### 14.1 本文件机械核验（生成时执行）

| 检查 | 结果 |
|---|---|
| 全部 JSON 块 `JSON.parse` | 通过（8 个：出生 request、execute request、result、status、cancel、owner v3、attachment、catalog v3） |
| 键计数 | intent 25、intentDraft 19、catalog Cover entry 9、record 16、owner entry 14、attempt 8、checkpoint 5、manifest 6、source/master manifest 24、compact 7、verification 4、attachment 7、status 15、execute request 8、result 6/value 8、cancel 5、出生 request 6、sourceEntry 7 |
| canonical Intent | 1,118 B；`44223ddf…0f13`；五变体 `5e877997…`/`d9f81e88…`/`59eedd60…`/`dc747629…`/`58a24653…`（两两不等；REVOKED 仅 canonical 负向数据） |
| birthIdentityHash | `bf3c034e…ffedc`（由 `identityHashOf(record)` 计算） |
| 媒体向量 | 7 个 52 B WAV SHA 与 §6.4 一致 |
| revision | 单任务 0→1（claim）→1（checkpoints）→2（FINAL）；示例快照 revision=2 |
| 容量 | entry 骨架 966 B + base64 1,398,104 = 1,399,070 B；P 上限 4,892,386 B；峰值表合计 17,477,296 B ≤ 20,971,520 B |
| owner entry | 示例 4,964 B；单条设计上限 16,384 B；总 131,072 B/32 条在写入时按实际字节核 |

> 仅证明文档自洽与向量可复算，不证明 FUTURE 已实现。

### 14.2 来源定位

CURRENT：§2 所列 M 模块与 v1.6 契约（blob `d02a8097…`）；规划：PR17（未合入，不代表已实现）。本文件不修改源码/旧契约/PR17。

### 14.3 已知非阻断与勘误

- 纯计划器（087）已合 main、OFFLINE/PLAN_ONLY；保存 v1.6 已由 PR40 合 main（OFFLINE/NOT_INTEGRATED）；本契约不重做。
- 旧稿的 `4,891,816/4,893,312`、`1536 B` 常数、`claim1/final2` 表述、`revision=4` 示例、`a1…` birthIdentityHash 示例、`artifact:fixture-source-1` 源、`CLEANED/DELETED` 混用、`CANCEL_UNKNOWN` 与 state 混用均已在本版修正；不改 089 原文与历史报告。

### 14.4 明确未实现

全部 Cover 执行 API、catalog v3/owner v3、StageArtifact、三图算法、取消/租约/清理、预算预留、版本迁移与兼容矩阵；真实模型权重/分离/RVC/GPU/设备/微信/安装发布；父 08 的 Cover/资源/动态 Evidence/Fake E2E 责任。

### 14.5 状态

**CONTRACT_CANDIDATE / PLANNED_RUNTIME / NOT_IMPLEMENTED / FIXTURE_ONLY / NOT_INTEGRATED。** 本文件通过只代表设计候选，不代表实现、集成或真实翻唱能力；后续实施必须另有正式执行单元与明确授权。
