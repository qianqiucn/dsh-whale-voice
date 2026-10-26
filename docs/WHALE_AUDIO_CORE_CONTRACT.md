# Whale Audio Core · 统一任务、双功能依赖与 Relay 边界纯契约（Plan 05-A）

**状态：OFFLINE / PURE-CONTRACT / FAKE-TEST。2026-10-25。**

**F01 修订（同日）：** 收紧输入边界与错误脱敏——统一记录校验 `validateAudioTaskRecord`、完整自有属性检查（Symbol/隐藏/accessor）、错误路径固定占位符 `<unknown-key>`；新增回归 N01–N16。Schema 仍为 v1，合法可枚举 JSON 输入与十字段候选保持兼容。

**结论先说清楚：**

- 本轮只交付三个**纯函数模块**和离线自动测试，**没有**新增可点击的页面入口，**没有**真正生成语音或翻唱，**没有**安装或下载任何组件，**没有**发送任何微信消息。
- 所有用户可见文字里的“演示 / 尚未接入真实生成”不是客套话，是这套合同的硬性状态。
- 现有插件八页、`whale-v1` 语音链路、WeChatAgent 适配与 Windows 语音发送代码**一行未改**。
- PR #16（Provider-neutral TTS/SVC v1）**仍未合并**，本模块**没有导入、复制或修改它的任何代码**。

权威任务书：`docs/plans/05-A-whale-audio-core-offline-contract-implementation.md`（规划分支，只读）。

---

## 0. 这份文档解决什么问题

Whale Voice（语音气泡）和 Whale Singing（唱歌）以后共用同一个 **Whale Audio Core（鲸音核心）**。共用的是：任务结构、状态机、音色身份引用、音频产物引用、依赖判定和首次使用判定。不共用的是：两个功能的首次进入标记、各自的必需组件清单，以及“生成 / 保存 / 发送”三种完全不同的成功语义。

这份文档把三个纯合同写清楚，让人工审查和未来的 Plan 05-B / 06 / 07-B / 08 / 09 / 13 / 14 可以直接照着实现 UI 与持久化，而不必重新发明状态含义。

它**不是**运行手册，也**不是**“功能已完成”的声明。

---

## 1. 三层职责与数据流

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Whale Audio Core（鲸音核心）                                          │
│  · CoreTask v1        ：任务草稿 / 状态机 / 取消 / 产物引用            │
│  · FeatureManifest v1 ：Voice 与 Singing 各自依赖与首访判定            │
│  · RelayHandoffCandidate v1：只生成“不可提交的审阅候选”                │
│  · 未来负责：Provider Registry、模型/音色资产、任务持久化（Plan 06/08） │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 只传：已保存产物引用 + 明确的投递意图候选
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Whale Relay Core（鲸递）· Plan 13-A 才会实现                           │
│  · 目标身份复核、权限检查、固定后端、单次提交、去重、UNKNOWN 保护      │
│  · 本阶段只有 stage = PROPOSED_NOT_AUTHORIZED，没有任何发送实现        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 复用既有受信任接口，不改写
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ WeChatAgent（上游依赖）＋ 既有 Voice Sender（Windows UI Automation）  │
│  · 账号、会话、目标授权归 WeChatAgent                                  │
│  · 语音气泡的实际录制与发送归既有 Voice Sender，本阶段完全未触碰       │
└──────────────────────────────────────────────────────────────────────┘
```

三条不可跨越的线：

1. **音频任务不发送**。Core 只到“已保存的产物”，`SAVED` 永远不等于已发送。
2. **Relay 不生成音频**。Relay 不承担 TTS、RVC、人声分离、混音、歌曲下载。
3. **WeChatAgent 拥有微信身份与会话**。本项目不重建第二套微信账号/会话系统。

---

## 2. 通用约定

| 约定 | 内容 |
|---|---|
| 返回信封 | 成功 `{ ok: true, value }`；失败 `{ ok: false, errors: [{ code, path, reason }] }` |
| 不抛错 | 由用户数据造成的错误一律结构化返回，不抛出异常、不输出堆栈 |
| 纯函数 | 无文件、网络、进程、时钟、随机数、配置读写；时间与 ID 全部由调用者注入 |
| 冻结拷贝 | 接受的输入会生成**深冻结的新对象**，调用者拿不到可变的共享状态 |
| 白名单 | 只接受文档列出的字段；未知字段、敏感字段一律拒绝，绝不静默丢弃 |
| 错误文案 | `reason` 是稳定的英文机器原因，不含输入值、路径或 Token；中文面向用户文案单独查表 |

---

## 3. 模块 A：`core/audio/task-contract.mjs`（CoreTask v1）

### 3.1 导出

| 导出 | 说明 |
|---|---|
| `AUDIO_TASK_SCHEMA_VERSION` | 固定 `1` |
| `AUDIO_TASK_STATES` / `AUDIO_TASK_STATE_LIST` | 冻结状态常量 / 可用于断言的状态数组 |
| `AUDIO_ERRORS` | 八个冻结错误码 |
| `AUDIO_TASK_MESSAGES_ZH` | 每个状态对应的固定中文说明（含“演示状态”后缀） |
| `validateAudioTaskDraft(draft)` | 校验并返回标准化、深冻结的草稿 |
| `createAudioTaskRecord(draft, metadata)` | 生成初始记录（`metadata` 仅 `{ observedAt }`） |
| `transitionAudioTask(record, action)` | 执行一次 Fake 状态转移，返回新记录 |
| `projectAudioTask(record)` | 面向未来 UI 的白名单脱敏投影 |
| `validateAudioTaskRecord(record)` | **F01-01**：完整记录的唯一权威校验；返回新的深冻结标准记录，失败返回安全错误信封 |

记录校验只有一份实现：私有 `readRecord` 由公开的 `validateAudioTaskRecord` 暴露，`transitionAudioTask`、`projectAudioTask` 与 Relay 边界全部复用它。Relay **不再**维护第二套不完整的 Schema，也不会给缺失字段补默认值。

### 3.2 `AudioTaskDraft v1` 字段白名单

| 字段 | 必填 | 规则 |
|---|---|---|
| `schemaVersion` | 是 | 必须是整数 `1` |
| `taskId` | 是 | `task:` + 1–64 位 `[A-Za-z0-9_-]`；由未来 Core owner 分配，本模块**不保证全局唯一** |
| `feature` | 是 | `voice-bubbles` 或 `singing` |
| `taskType` | 是 | `TTS` 或 `SVC`；`voice-bubbles` 只能配 `TTS`，`singing` 只能配 `SVC` |
| `source` | 是 | 只有 `{ kind, ref }`：`TEXT_REF` → `artifact:...`（TTS）；`AUDIO_REF` → `artifact:...`（SVC）。不接受正文、URL、SongID、文件路径或字节 |
| `voiceProfileId` | 是 | `voice:` + 1–64 位安全字符；**不是** RVC 模型文件名 |
| `deliveryRequested` | 否 | 布尔，缺省 `false`；只是“将来是否想发送”的意图候选，不是授权 |
| `rights` | 是 | 只有 `{ state: "CONFIRMED_FIXTURE" }` 或 `{ state: "UNVERIFIED" }` |

**明确拒绝的顶层键（示例，不限于此）：** `send`、`wechat`、`targetChatId`、`token`、`apiKey`、`recipient`、`providerId`、`params`、`songId`、`nickname` 等一切未列出的字段。

### 3.3 错误码

| 错误码 | 含义 |
|---|---|
| `AUDIO_INVALID_REQUEST` | 结构、必填项或取值不在允许范围 |
| `AUDIO_INVALID_ID` | 不透明 ID / 引用格式不合法（含 URL、路径、模型名冒充） |
| `AUDIO_UNKNOWN_FIELD` | 未知字段或敏感字段（含发送、目标、凭据类） |
| `AUDIO_TYPE_MISMATCH` | 类型错误，或 feature 与 taskType / source.kind 交叉不匹配 |
| `AUDIO_STATE_CONFLICT` | 非法状态转移、重复事件、终态推进 |
| `AUDIO_RIGHTS_UNCONFIRMED` | 使用权未确认却要开始处理 |
| `AUDIO_DELIVERY_FORBIDDEN` | 伪造已发送、投递字段或真实运行标记 |
| `AUDIO_ARTIFACT_REQUIRED` | 该状态必须有输出产物，但缺失 |

### 3.4 初始记录

`createAudioTaskRecord` 返回：

```text
state           : CONFIRMED_FIXTURE → CREATED ；UNVERIFIED → BLOCKED_RIGHTS
outputArtifactRef: null
cancel          : { requested: false, confirmed: false }
delivery        : { state: "NOT_REQUESTED", deliveryId: null }
lastError       : null
observedAt      : 调用者注入的合法 UTC RFC3339 时间
mockOnly        : true    （不可由输入覆盖）
realOperationAllowed: false （不可由输入覆盖）
```

### 3.5 状态机（只有这 7 个动作）

```text
   CREATED ──BEGIN_PROCESS──▶ PROCESSING ──ATTACH_FAKE_ARTIFACT──▶ ARTIFACT_READY ──MARK_SAVED──▶ SAVED（终态）

   CREATED / PROCESSING / ARTIFACT_READY ──REQUEST_CANCEL──▶ CANCEL_REQUESTED ──CONFIRM_CANCEL──▶ CANCELLED（终态）

   CREATED / PROCESSING / ARTIFACT_READY / CANCEL_REQUESTED ──FAIL──▶ FAILED（终态）

   PROCESSING / CANCEL_REQUESTED ──MARK_UNKNOWN──▶ UNKNOWN（终态）

   UNVERIFIED rights ──▶ BLOCKED_RIGHTS：没有任何自动出路，必须由未来独立流程重新确认。
```

| 动作 | 允许来源 | 结果 | 语义限制 |
|---|---|---|---|
| `BEGIN_PROCESS` | 仅 `CREATED` | `PROCESSING` | 只是 Fake 状态推进，**不运行任何 Provider** |
| `ATTACH_FAKE_ARTIFACT` | 仅 `PROCESSING` | `ARTIFACT_READY` | `artifactRef` 必须是 `artifact:` 引用 |
| `MARK_SAVED` | 仅 `ARTIFACT_READY` | `SAVED` | 必须有产物；**不代表 APPLIED，也不代表已发送** |
| `REQUEST_CANCEL` | `CREATED` / `PROCESSING` / `ARTIFACT_READY` | `CANCEL_REQUESTED` | 只记录“用户想取消”，**不宣称真实处理已停止** |
| `CONFIRM_CANCEL` | 仅 `CANCEL_REQUESTED` | `CANCELLED` | 仅 Fake 手动模拟确认 |
| `FAIL` | `CREATED` / `PROCESSING` / `ARTIFACT_READY` / `CANCEL_REQUESTED` | `FAILED` | `code` 只允许公开安全值 `AUDIO_FAKE_FAILURE`，不含堆栈或用户消息 |
| `MARK_UNKNOWN` | `PROCESSING` / `CANCEL_REQUESTED` | `UNKNOWN` | **终止自动推进与重试**，只能以后人工恢复 |

终态 `SAVED` / `CANCELLED` / `FAILED` / `UNKNOWN`：任何动作都返回 `AUDIO_STATE_CONFLICT`。没有自动恢复、没有自动重试、没有自动换后端重发。

### 3.6 三种“成功”必须分开

| 名称 | 出现位置 | 含义 | 不等于 |
|---|---|---|---|
| `SAVED` | 音频任务状态 | Fake 产物已写入演示资产库 | 配置 `APPLIED`；微信 `SENT_LOCAL` |
| `APPLIED` | 配置生效状态（`core/config-coordinator.mjs`） | 配置在运行组件中实际生效 | 音频任务已保存 |
| `SENT_LOCAL` | Relay / Sender 状态（Plan 13 起） | 本地微信 UI 观察到发送气泡 | 对方已收到或已播放 |

三者使用**不同的命名空间**，任何 UI 都不得把它们画成同一个“完成”。

### 3.7 投影白名单 `projectAudioTask`

只输出：`schemaVersion`、`taskId`、`feature`、`taskType`、`state`、`voiceProfileId`、`hasInput`、`hasOutput`、`cancelRequested`、`cancelConfirmed`、`deliveryRequested`、`mockOnly`、`realOperationAllowed`、`userMessageZh`。

**不输出**：`source.ref`、`artifactRef`、`rights`、`lastError` 细节、任何 Token、目标聊天、路径或用户原文。`userMessageZh` 只来自固定查表，不拼接输入文字。

### 3.8 输入属性策略（F01-02）

所有入口（draft、metadata、record、action、`source`/`rights`/`cancel`/`delivery`/`lastError`、observations、acknowledgements）执行同一策略：

| 输入形态 | 结果 |
|---|---|
| `Object.prototype` 或 `null` 原型的普通对象 | 允许 |
| 自定义原型、类实例 | 拒绝 |
| Symbol 键（任意位置，任意嵌套） | 拒绝；错误中不出现 Symbol 描述 |
| 未知字符串键（可枚举或隐藏） | 拒绝 |
| 已知键但不可枚举 | `AUDIO_TYPE_MISMATCH` / `MANIFEST_INVALID_OBSERVATION` / `MANIFEST_INVALID_ACKNOWLEDGEMENT` |
| getter / setter | 拒绝；**从不执行**访问器 |
| 冻结对象 | 允许（只要求是可枚举数据属性） |
| 循环、重复节点、过深、超大对象图 | 在固定步数内拒绝，不无限递归 |
| 已知键的非法值 / 必填缺失 | 原对应错误码 |

实现使用 `Reflect.ownKeys` 加属性描述符读取，**不**先 spread 或 JSON 序列化再校验，否则隐藏字段会被“洗掉”。检查过程若遇到异常，仍返回固定安全错误；本契约不宣称能够隔离任意恶意 Proxy 代码。

### 3.9 错误路径与脱敏（F01-03）

- 未知键一律报告固定占位符 `<unknown-key>`，**不再**根据字符外观、长度或斜杠猜测是否敏感。
- 合法 Schema 中的固定路径仍可显示，例如 `taskId`、`source.ref`、`observedAt`、`action.type`、`observations.audio-core`。
- 错误信封禁止出现：任意未知键名、Symbol 描述、输入值、原始异常消息或堆栈、getter 抛出的内容。
- `reason` 只来自固定常量，不拼接用户数据。

---

## 4. 模块 B：`core/audio/feature-manifest.mjs`（FeatureDependencyManifest v1）

### 4.1 导出

| 导出 | 说明 |
|---|---|
| `FEATURE_MANIFEST_SCHEMA_VERSION` | 固定 `1` |
| `FEATURE_MANIFEST_REVISION` | 当前依赖清单版本标记 `plan05a.v1` |
| `FEATURE_IDS` | `["voice-bubbles", "singing"]` |
| `DEPENDENCY_REQUIREMENTS` | `REQUIRED` / `CONDITIONAL` / `OPTIONAL` / `DELIVERY_ONLY` |
| `DEPENDENCY_OBSERVATION_STATES` | `VERIFIED` / `MISSING` / `UNKNOWN` / `BLOCKED` |
| `SEED_VC_STATUS` | Seed-VC 的 `NOT_READY` / `notDefault` / `noAutoInstall` 标记 |
| `listFeatureDependencies(feature)` | 该功能的冻结依赖清单（每次返回全新克隆） |
| `projectFeatureAvailability(feature, observations)` | 由 Fake 观察推导可用性投影 |
| `evaluateFirstUse(feature, acknowledgedByFeature, manifestRevision)` | 是否需要弹本功能首次依赖说明 |

每个依赖定义只有五个字段：`id`、`labelZh`、`purposeZh`、`requirement`、`implemented`。本阶段 `implemented` **全部为 `false`**：这份离线合同不具备真实运行能力。

### 4.2 Whale Voice · 语音气泡（`voice-bubbles`）

| id | 级别 | 中文标签 | 说明 |
|---|---|---|---|
| `audio-core` | REQUIRED | 音频任务与状态 | 两个功能共用的任务与资源记录 |
| `tts-selected` | REQUIRED | 选择一种语音生成方式 | 必须选定一种方式；当前没有任何真实模型 |
| `voice-profile` | REQUIRED | 选择合法音色 | 共享音色库中的有权音色，不是模型文件名 |
| `preview-save` | REQUIRED | 试听与保存 | 保存成功不代表已发送 |
| `wechatagent` | DELIVERY_ONLY | 微信账号与聊天授权 | 只有要发送才需要 |
| `whale-relay` | DELIVERY_ONLY | 安全投递协调 | 只有要真实发送才需要 |
| `voice-sender` | DELIVERY_ONLY | 微信语音发送组件 | 只有要发语音气泡才需要 |

### 4.3 Whale Singing · 唱歌（`singing`）

| id | 级别 | 中文标签 | 说明 |
|---|---|---|---|
| `audio-core` | REQUIRED | 音频任务与状态 | 与 Voice 共用 |
| `rvc-gateway` | REQUIRED | 歌声转换后端 | 真实 RVC 才需要，当前未实现 |
| `rvc-voice-model` | REQUIRED | 目标音色模型资产 | 需要有合法使用权的模型，当前一个都没有安装 |
| `source-rights` | REQUIRED | 歌曲或音频使用权 | 只能使用用户已获授权的本地音频 |
| `separator` | CONDITIONAL | 人声与伴奏分离 | 输入已是纯人声时可跳过；未知不等于可用 |
| `mixer-encoder` | CONDITIONAL | 混音与格式转换 | 按输出格式需要 |
| `preview-save` | REQUIRED | 试听与保存 | 保存成功不代表已发送 |
| `seed-vc` | OPTIONAL | Seed-VC · 后续免训练试唱（暂不支持） | **NOT_READY**，不在首发必需集合，不自动安装 |
| `wechatagent` / `whale-relay` / `voice-sender` | DELIVERY_ONLY | 同 Voice | 只有发歌曲文件才需要 |

**重要：** 免训练不等于低显存，也不保证无显卡可用。本阶段不安装、不下载、不运行 Seed-VC，也不会把任何 Fake 观察提升为“可安装/CPU 可用”。

### 4.4 可用性投影

```text
{ feature, mode: "MOCK_ONLY", realReady: false,
  missingRequired[], unknownRequired[], blockedRequired[],
  deliveryRequired[], optionalUnavailable[], userMessageZh }
```

判定规则（固定，不允许未来放宽）：

1. `mode` 永远是 `MOCK_ONLY`，`realReady` 永远是 `false`。
2. 即使把**所有**组件都伪造成 `VERIFIED`，结论仍然不是真实可用。
3. `wechatagent` / `whale-relay` / `voice-sender` 只进入 `deliveryRequired`，**永不进入** `missingRequired`，因此缺少微信依赖不影响本地生成、试听和保存。本阶段 `deliveryRequired` 表示**发送依赖尚未真正可用**（`implemented:false`），并不代表真实检测已经证明它们缺失，也不阻塞本地生成。
4. `seed-vc` 即使被伪造成 `VERIFIED`，也仍然出现在 `optionalUnavailable`。
5. `CONDITIONAL` 组件只按输入需要出现，不参与就绪门槛。
6. 组件 `UNKNOWN` 必须显示为“需要检查”，不得显示为绿色成功，也不得展示虚构的安装进度。

### 4.5 首次使用判定

```text
evaluateFirstUse(feature, acknowledgedByFeature, manifestRevision)
→ { feature, showDialog, reason, readOnly: true }
reason ∈ FIRST_USE | REVISION_CHANGED | ALREADY_ACKNOWLEDGED
```

- 只有**该功能自己**记录的版本等于当前 `manifestRevision` 才免二次弹窗；Voice 的确认不能让 Singing 免弹窗。
- 清单版本变化 → 重新提示。
- 纯函数**不持久化**用户确认，也不会因为“已确认”就声称安装完成。
- 非法 acknowledge、未知 feature、无效版本一律 fail closed 返回结构化错误。

---

## 5. 模块 C：`core/audio/relay-handoff.mjs`（RelayHandoffCandidate v1）

### 5.1 导出与返回结构

```text
buildRelayHandoffCandidate(taskRecord, deliveryId)
→ { ok: true, value: { schemaVersion: 1, taskId, deliveryId, artifactRef,
                       stage: "PROPOSED_NOT_AUTHORIZED",
                       mockOnly: true, submitAllowed: false,
                       targetVerified: false, authorizationVerified: false,
                       backendSelected: false } }
```

### 5.2 前置条件（全部满足才给候选）

**执行顺序固定：先做完整结构校验，再做候选语义判断。结构错误优先，且不会构造候选。**

| 条件 | 不满足时 |
|---|---|
| 记录通过 `validateAudioTaskRecord`（16 个必填字段、嵌套白名单、配对与状态不变量） | 直接返回其安全错误信封，不构造候选 |
| 任务状态为 `SAVED` | `AUDIO_STATE_CONFLICT` |
| `UNKNOWN` / `CANCELLED` / `CANCEL_REQUESTED` / `FAILED` / `BLOCKED_RIGHTS` | `AUDIO_DELIVERY_FORBIDDEN` |
| `rights.state === "CONFIRMED_FIXTURE"` | `AUDIO_RIGHTS_UNCONFIRMED` |
| 存在合法 `outputArtifactRef` | `AUDIO_ARTIFACT_REQUIRED` / `AUDIO_INVALID_ID` |
| `deliveryRequested === true` | `AUDIO_DELIVERY_FORBIDDEN` |
| `deliveryId` 为 `delivery:` + 1–64 位安全字符，且与 `taskId` 不同 | `AUDIO_INVALID_ID` |
| `delivery` **必须恰好**是 `{state:"NOT_REQUESTED",deliveryId:null}` | 其他状态、标识或额外字段 → `AUDIO_DELIVERY_FORBIDDEN` |
| 记录里没有 `sent` / 目标 / 凭据等未知字段 | `AUDIO_DELIVERY_FORBIDDEN`（敏感键）或 `AUDIO_UNKNOWN_FIELD` |

### 5.3 边界声明

- 结构里**没有** `targetId`、`chatId`、`targetName`、`token`、`backend`、`URL`、`path`、`sendMessage`。
- 它不是 WeChatAgent 参数，不是 Voice Sender 命令，也不是队列消息，任何 Runner 都不能消费它。
- `taskId` 与 `deliveryId` 都由调用者注入；本模块**不生成 ID**，也不能凭单条记录宣称全局幂等已完成。
- **全局唯一索引、目标复核、固定后端、单次提交、UNKNOWN 人工核验**属于 Plan 13-A。

---

## 6. 与未合并 PR #16（TTS/SVC v1）的关系

**PR #16 仍然 OPEN、未合并。本模块没有导入、复制或修改它的任何代码。** 两份契约的字段映射只作为**未来设计**记录：

| Plan 05-A（Core） | PR #16 SVC v1（未合并） | 未来处理 |
|---|---|---|
| `taskId` | 无对应（v1 用 `requestId`） | Plan 08 持久化层分配并映射 |
| `source.ref`（`artifact:` 不透明引用） | `sourceAudioRef` | 需要一个**版本化适配器**，不能直传 |
| `voiceProfileId` | `targetVoiceId` | **不相等**：Core 音色是共享库角色，SVC 目标是具体模型音色，Plan 08 必须给出显式映射 |
| `params.*`（音高、共振峰等） | `pitchShift` / `formantShift` / `conversionStrength` | 本阶段**不实现**，留给 Plan 08/12 |
| `AUDIO_*` 错误码 | `SVC_INVALID_REQUEST` 等 | 适配器负责转换，不共用错误命名空间 |

因此：**Plan 05-A 的 `AudioTaskDraft` 不能直接传给 `validateSvcRequest()`**，将来必须有版本化适配器与迁移测试。

同理，PR #19 的 RVC 静态研究结论不构成可复用代码（授权不明，BLOCKED），PR #20 的 WeChatAgent 结论仍是 S1：DSH 插件 + 只读 Adapter，不引入 ZIP Plugin。

---

## 7. Novice First · 面向完全不会代码的用户

> 本节验收的是**将来的 GUI 能否基于这套合同正确展示**，不是“现在就能点”。

### 7.1 Whale Voice · 语音气泡 首次进入故事板

1. 用户点开“Whale Voice · 语音气泡”。
2. 系统只读检查：能不能连上 Core、有没有可用语音生成方式、有没有合法音色、试听与保存是否就绪。
3. 弹窗只列**本功能**的依赖，分成“必需 / 需要发送时才要”两组，并说明当前是演示数据。
4. 用户可以选择“稍后再说”，仍然能浏览页面和说明；也可以选择“检查需要的组件”。
5. 生成后先试听，再“保存到本地”。
6. 只有用户想发微信时，才出现“发送到已授权聊天”，并再走一次目标与权限确认。
7. 关掉后再进来：同一版本不再重复弹窗；点“管理依赖”可以随时重开。

### 7.2 Whale Singing · 唱歌 首次进入故事板

1. 用户点开“Whale Singing · 唱歌”。
2. 系统只读检查：Core、RVC 转换后端、目标音色模型、歌曲使用权、分离与混音（按需）、试听与保存。
3. 弹窗先给 **RVC · 标准翻唱**（首发主线），并明确标注：转换后端与音色模型**当前未安装、未实现**。
4. 同一弹窗里 **Seed-VC · 后续免训练试唱** 是灰色“暂不支持”，不能选、不会下载，也不因为“免训练”就说低显存。
5. 若没有显卡或资源未知，只显示“需要检查 / 暂不支持”，不锁死整个页面，也不虚构 CPU 可用。
6. 用户可先“稍后再说”；等将来依赖真正就绪，才解锁“开始翻唱”。
7. 用户选歌或授权本地音频 → 分离（按需）→ 转换 → 混音 → 试听 → 保存 → 可选发送。
8. Voice 的确认状态**不会**让 Singing 跳过本页说明。

### 7.3 普通用户会看到的六种中文状态

| 界面状态 | 用户看到的话 | 合同依据 | 必须标注 |
|---|---|---|---|
| `BLOCKED_RIGHTS` | “还没有确认音色或素材的使用权，暂时不能开始生成。” | `AUDIO_TASK_STATES.BLOCKED_RIGHTS` | 模拟 |
| `UNKNOWN_REQUIRED_DEPENDENCY` | “部分必需组件状态未知，需要重新检查后才能判断。” | `unknownRequired[]` | 尚未真实支持 |
| `MODEL_NOT_READY` | “目标音色模型还没准备好，当前不能开始。” | 必需依赖 `implemented: false` | 尚未真实支持 |
| `CANCEL_REQUESTED` | “已收到取消请求，正在等待确认；这不证明真实处理已经停止。” | `CANCEL_REQUESTED` | 模拟 |
| `MOCK_ONLY` | “当前是演示模式：尚未接入真实生成或安装。” | `mode: "MOCK_ONLY"`, `realReady: false` | 演示 |
| `DELIVERY_NOT_AUTHORIZED` | “发送权限或目标尚未确认，本轮只保存不发送。” | `stage: PROPOSED_NOT_AUTHORIZED`, `submitAllowed: false` | 尚未真实支持 |

**禁止**把这些状态显示成绿色成功、虚假安装百分比、虚构模型下载量或“已发送”。

### 7.4 三种错误恢复（按钮级）

| 情况 | 中文说明 | 可执行的恢复 |
|---|---|---|
| 缺少需要的组件 | “有必需组件缺失或被阻止。” | ①“重新检查” ②“以后再说” ③“换一个可用方案” |
| 没有目标音色或歌曲的使用权 | “尚未有权使用该音色/歌曲。” | ①“更换合法材料” ②“返回上一步” |
| 发送权限或目标不明 | “发送权限/目标不明。” | ①“只保存不发送” ②“取消发送” ③“返回保存结果” |

另外提供“切换到另一个模式 / 返回 Whale Voice 页面”，任何失败路径都不要求用户看控制台、复制堆栈或手改文件。

### 7.5 目前仍需技术人员、由后续计划清除的事项

| 事项 | 当前状态 | 由谁清除 |
|---|---|---|
| 图形化安装器、依赖下载与校验 | 未实现，无安装授权 | Plan 14 |
| 真实 TTS Provider Registry 与本地/云端 Provider | 未实现（PR #16 未合并） | Plan 06、Plan 10、Plan 11 |
| 真实 RVC/SVC 推理与 Fake Gateway | 未实现，禁止下载模型 | Plan 07-B、Plan 12 |
| 共享音色库、任务持久化、TaskId/DeliveryId 唯一索引 | 未实现（本阶段只在内存里、由调用方注入） | Plan 08、Plan 13-A |
| 两个页面与独立首次依赖弹窗的真实 UI | 未实现（现有八页不变） | Plan 09 |
| 真实投递、目标复核、UNKNOWN 人工核验 | 未实现 | Plan 13-A |
| 真实 Windows 端到端测试 | 未执行 | Plan 14 / 上线前专项 |

**正常首次使用路径不得要求普通用户**运行 pip / CUDA / Git、编辑 JSON/ENV、读文件路径、粘贴代码或理解端口。

### 7.6 Fake 与真实 READY 的分界

- 本文件所有 `READY` 字样都带“演示”限定；真实 `READY` 只能来自未来受信任 Host 的实测能力证据。
- 用户误点“生成 / 发送”时，**不能**出现成功提示；只能出现“尚未接入真实生成”或“仅保存不发送”。
- 现有八页、SetupWizard、ComponentsDialog、`whale-v1` 链路与 Windows 语音发送行为**不受本阶段影响**。

---

## 8. 兼容、回退与不做的事

**保留不动：** 插件包名 `dsh-whale-voice`、`index.js` 的 GET Host 路由、八页 GUI、SetupWizard、组件列表、Bridge/Worker 双闸门、既有 `whale-v1` Qwen TTS 链路、既有 Voice Sender 的 UI Automation 发送。

**本阶段明确不做：** 不改 `index.js` / `core/server.mjs` / `core/detect.mjs` / `core/capabilities.mjs` / `core/config*.mjs` / `pages.js` / `setup.js` / `client*.js` / `package.json` / 既有测试 / `docs/plans/**`；不接 Host 路由，不加 UI 入口，不装依赖，不下载模型，不跑推理，不发微信，不合并任何 PR。

**回退方式：** 删除本阶段新增的五个文件即可完全回退，不涉及数据迁移、配置版本或运行中服务。

---

## 9. 如何验证（本阶段实际执行过的命令）

```bash
node --test test/audio-core-contract.test.mjs   # 81 个离线用例（T 36 / F 16 / R 11 / S 2 / N 16）
node --test                                     # 全仓库既有用例
node build.mjs                                  # 生成客户端，确认无差异
git diff --check                                # 空白与冲突标记
```

`N01–N16` 覆盖 F01 的三类缺口：统一记录校验与 Relay 无旁路、隐藏/Symbol/accessor 属性、错误路径不回显。修复前记录为 81 项中 14 项失败，修复后 81/81 通过。

`npm run test:ui` 只有在本机 Playwright 环境已完整存在时才运行；否则如实记为 `NOT_RUN`，且本轮不修改任何 UI 代码。

---

## 10. 剩余风险与下一阶段前置条件

1. **真实能力尚未接入**：本阶段所有 `implemented` 均为 `false`，任何“可用”结论都必须等 Plan 05-B 起的真实集成。
2. **持久化缺失**：TaskId / DeliveryId 的唯一性、幂等与审计尚未实现，只由调用者注入；Plan 08 与 Plan 13-A 必须先补这一层。
3. **PR #16 未合并**：SVC 字段映射目前只是文档设计，必须等合并后写版本化适配器并补迁移测试。
4. **许可证与供应链**：RVC / Seed-VC / 分离与混音工具的真实使用需单独审计，本轮不下载、不内嵌。
5. **真实 Windows 验证未做**：语音发送、设备恢复、目标复核仍需在获得单独授权后由专项计划验证。
6. **下一阶段前置**：ChatGPT 审核本报告与 PR；Plan 03-B 的用户合并授权；05-B / 06 / 07-B / 08 / 09 各自的专项任务书。

---

**本文件不代表功能已可用。** 它只是让后续实现有据可依，让普通用户不会被“假绿色”误导。
