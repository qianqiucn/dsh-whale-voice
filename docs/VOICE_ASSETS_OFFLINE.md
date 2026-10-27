# VOICE_ASSETS_OFFLINE — 共享音色资产与 Provider 显式绑定（Plan 08-A）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本模块 `core/audio/voice-assets.mjs` 只在演示数据上核对“共享角色音色 ↔ 具体 Provider 实例 ↔ 该实例上的 TTS 音色或 RVC 模型”的显式映射；它不生成音频、不调用派发器、不推进 AudioTask、不创建 Artifact 或队列，也不新增任何 GUI 或 Host 端点。普通用户本轮没有新增可正常使用的功能。

`FIXTURE_BOUND` 只表示**演示绑定成立**：所选共享角色、所选演示实例、请求中的音色/模型字段与库中声明一致。它不表示依赖已就绪、模型或文件真实存在、音频已生成、可以试听/保存/发送，也不表示用户已对真实素材授权。

## 1. 公开面

模块恰好四个导出：

| 导出 | 说明 |
|---|---|
| `VOICE_ASSETS_SCHEMA_VERSION` | 固定 `1` |
| `VOICE_ASSET_ERRORS` | 27 个固定错误/原因码，每个值为 `VOICE_ASSET_` 加键名 |
| `validateVoiceAssetLibrary(input)` | 验证并规范化一个 `FixtureVoiceAssetLibrary v1` |
| `resolveFixtureVoiceBinding(input)` | 用一次显式调用解析一个绑定 |

两个入口都是同步纯函数：不读时钟、不用随机数、不做 I/O 或网络、不启进程、不保留跨调用可变业务状态。两个入口各自对整根输入调用一次既有 `copyFixtureInput`（与 06-B/06-C 共用的安全复制），随后只读该副本，并用 `deepFreezeFixtureValue` 冻结全部输出。resolver 不会再次调用会复制整库的公开验证入口。

## 2. `FixtureVoiceAssetLibrary v1`

顶层**恰**三个键：

```json
{ "schemaVersion": 1, "profiles": [], "assets": [] }
```

`profiles` 为 0–16 项的稠密数组，`assets` 为 0–32 项的稠密数组；业务数组超限返回 `VOICE_ASSET_RESOURCE_LIMIT`（`path: "$"`）。

### 2.1 profile

每项**恰**六个键，按以下顺序校验：

```text
voiceProfileId, revision, scopeId, displayName, rightsState, bindings
```

| 字段 | 规则 |
|---|---|
| `voiceProfileId` | `/^voice:[A-Za-z0-9_-]{1,64}$/`，全库唯一；不从显示名派生 |
| `revision` | 整数 1–2147483647；不接受字符串、0、小数 |
| `scopeId` | `/^scope:fixture-[A-Za-z0-9_-]{1,32}$/`，调用者提供的虚构隔离域，不是微信账号或真实身份认证 |
| `displayName` | 1–64 UTF-16 码元，首尾无空白，无 U+0000–U+001F / U+007F 控制符；允许中文；仅内部声明，resolver 不回显 |
| `rightsState` | `CONFIRMED_FIXTURE` / `UNVERIFIED` / `REVOKED`；合法负向状态可以入库，不自动升级 |
| `bindings` | 0–8 项，每项恰 `{instanceId, assetId}`；同一 profile 内 `instanceId` 不得重复 |

### 2.2 asset

每项**恰**十个键，按以下顺序校验：

```text
assetId, revision, scopeId, kind, candidateId, providerRef,
availability, rightsState, integrity, expiresAt
```

| 字段 | 规则 |
|---|---|
| `assetId` | `/^asset:fixture-[A-Za-z0-9_-]{1,48}$/`，全库唯一；不同于 `artifact:` 引用 |
| `revision` | 同 profile 规则；只用于本次快照匹配 |
| `scopeId` | 同 profile；所引资产必须与 profile 同 scope |
| `kind` | `TTS_VOICE` 或 `RVC_MODEL` |
| `candidateId` | canonical 标签 `/^[a-z][a-z0-9-]{1,63}$/`；本库只验语法，不硬编码候选清单；`RVC_MODEL` 必须严格等于 `rvc` |
| `providerRef` | `TTS_VOICE` 用 manifest `voice.id` 语法 `/^[a-z][a-z0-9-]{1,63}$/`；`RVC_MODEL` 用 `/^rvc-model:fixture-[A-Za-z0-9_-]{1,48}$/` |
| `availability` | `PRESENT` / `ABSENT` / `UNKNOWN`，只是 Fixture 声明 |
| `rightsState` | 同 profile |
| `integrity` | `TTS_VOICE` 必须为 `null`；`RVC_MODEL` 恰 `{sha256, byteLength}`，`sha256` 为 64 位小写 hex，`byteLength` 为 1–8589934592 的整数 |
| `expiresAt` | `null` 或严格规范 UTC `YYYY-MM-DDTHH:mm:ss.sssZ`；过期是合法业务状态 |

`integrity` 只是**元数据声明**：本模块不读文件、不计算哈希、不验证下载，校验和声明不升级为“文件已验证”。`CONFIRMED_FIXTURE` 不是真实授权，`scope` 不是身份认证，`revision` 不是持久 CAS 或全局唯一。

### 2.3 全库引用与结构规则

- 所有 `binding.assetId` 必须存在；悬空引用或跨 scope 引用为结构失败 `VOICE_ASSET_INVALID_REFERENCE`。
- 重复的 profile ID、asset ID、同 profile 内重复 instance 绑定为 `VOICE_ASSET_DUPLICATE_ID`。
- 全库严格验证，包括未被选中的条目；一个合法 `ABSENT` / `UNKNOWN` / `REVOKED` 条目不会连坐另一个合法绑定。
- 校验顺序：先根，再按数组顺序验 `assets`，随后 `profiles` 及 `bindings`，最后校验全库引用。

### 2.4 validate 成功输出

```json
{
  "ok": true,
  "value": {
    "schemaVersion": 1,
    "library": { "schemaVersion": 1, "profiles": [], "assets": [] },
    "mockOnly": true,
    "realOperationAllowed": false,
    "submitAllowed": false,
    "automaticRetryAllowed": false
  }
}
```

`value.library` 是调用者自有库的规范化副本，含 `displayName`，仅供内部返回；它不是 GUI 脱敏投影，不应写入日志。resolver 的 `library` 字段接收这个三键库，不接受整个验证封套。

## 3. `resolveFixtureVoiceBinding` 输入

顶层**恰**六个键：

```text
schemaVersion, library, taskDraft, negotiation, expectation, now
```

- `library`：上节三键库。
- `taskDraft`：原 `AudioTaskDraft v1`，原样交给既有 `validateAudioTaskDraft`。
- `negotiation`：06-B 原五键输入，原样交给既有 `negotiateProviderInstance`。
- `expectation`：恰 `{scopeId, profileRevision, assetRevision}`。
- `now`：调用者提供的规范 UTC 时间，不能为 `null`；模块不读系统时钟。

不接受调用者预先构造的 task 验证结果、instance view、`ready`/`compatible` 结果，也不接收文件路径、目标聊天、凭据或原始媒体。

## 4. 唯一解析顺序

1. 整根安全复制；验证根形状/schema、`expectation`、`now`、库全库结构及关联。库内按 assets、profiles/bindings、全库引用的顺序。
2. 实际调用 `validateAudioTaskDraft`；合法拒绝统一 `VOICE_ASSET_INVALID_TASK`，不转发旧 errors；异常或非法返回为 `VOICE_ASSET_DEPENDENCY_FAILURE`。
3. 实际调用 `negotiateProviderInstance`；合法拒绝统一 `VOICE_ASSET_INVALID_NEGOTIATION`；异常或非法返回为 `VOICE_ASSET_DEPENDENCY_FAILURE`。
4. `taskType=TTS` 必须对 `selection.category=TTS`；`SVC` 对 `SVC`，否则业务阻断 `TASK_KIND_MISMATCH`。
5. `taskDraft.rights.state` 必须 `CONFIRMED_FIXTURE`，否则 `TASK_RIGHTS_UNCONFIRMED`；profile/Provider 确认不能代替任务权利。
6. 原协商 `BLOCKED` 立即返回 `PROVIDER_BLOCKED`，完整保留原安全 provider 值与受控 `reason`/`messageZh`，`binding: null`，不继续推断资产可用。
7. 只按 `(taskDraft.voiceProfileId, expectation.scopeId)` 取 profile。缺失或属于其他 scope 都是 `PROFILE_UNAVAILABLE`（同文案同结果，不回显其他 scope）；revision 不符 `PROFILE_REVISION_MISMATCH`；权利非确认 `PROFILE_RIGHTS_UNCONFIRMED`。
8. 只按原 `selection.instanceId` 取 profile 内 binding；缺失 `BINDING_MISSING`，不按 candidate 或列表顺序代替。asset revision 不符 `ASSET_REVISION_MISMATCH`；权利未确认/撤销 `ASSET_RIGHTS_UNCONFIRMED`。
9. `availability=ABSENT` → `ASSET_MISSING`；`UNKNOWN` → `ASSET_UNKNOWN`；`PRESENT` 才继续。`expiresAt` 非 `null` 且 `expiresAt <= now` → `ASSET_EXPIRED`（等于也过期）。不自动续期或重新下载。
10. `kind` 必须与 `taskType` 对应，否则 `ASSET_KIND_MISMATCH`；`asset.candidateId` 必须等于原协商 canonical `candidateId`，否则 `CANDIDATE_MISMATCH`。alias 或另一个实例不能当成同一个绑定。
11. `TTS_VOICE` 的 `providerRef` 必须严格等于同一 `negotiation.request.voiceId`；`RVC_MODEL` 必须等于 `request.targetModelId`，否则 `PROVIDER_REF_MISMATCH`。
12. `SVC` 还要求 `taskDraft.source.ref === negotiation.request.sourceAudioRef`，否则 `SOURCE_MISMATCH`；不加前缀、不截断、不替换源引用。
13. 全部通过才 `FIXTURE_BOUND`；不调用 06-C/06-D 模拟，不创建或推进任务。未来运行入口仍须重新经过 06-D 等实际门禁，不能把本层 `FIXTURE_BOUND` 当作 ready。

## 5. 输出与固定中文

成功或合法业务阻断的输出 `value` **恰** 13 键：

```text
schemaVersion, decision, reason, messageZh,
taskId, feature, voiceProfileId, binding, provider,
mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed
```

- `decision` 仅 `FIXTURE_BOUND` / `BLOCKED`；`FIXTURE_BOUND` 时 `reason` 为 `null`。
- `taskId` / `feature` / `voiceProfileId` 只来自已验证 draft，不分配新 ID。
- `provider` 是本次 06-B 安全 value 的新拷贝，完整保留其受控 `reason` 与中文；不放 registry、manifest、observation、consent、正文或 source。
- `BLOCKED` 时 `binding: null`；`FIXTURE_BOUND` 时 `binding` **恰** 8 键：

```text
scopeId, profileRevision, assetId, assetRevision, kind, instanceId, candidateId, providerRef
```

固定中文（不拼接调用者值）：

| 情形 | messageZh |
|---|---|
| `FIXTURE_BOUND` | 演示音色绑定已核对；尚未生成音频，不能据此试听、保存或发送。 |
| 任务/音色/模型/候选/引用不一致 | 演示任务与所选音色不一致，请重新选择；系统不会自动替换。 |
| 任一层使用权未确认或撤销 | 演示使用权尚未确认或已撤销，请确认后再继续。 |
| profile/binding/资产缺失 | 没有可用的演示音色绑定，请重新选择或稍后再说。 |
| profile/asset 版本变化 | 演示资产版本已变化，请刷新后重新选择。 |
| 资产状态未知 | 演示资产状态未知，请重新检查，系统不会自动下载。 |
| 资产过期 | 演示资产已过期，请重新选择可用资产。 |
| 原 Provider 阻断 | 完整复用原 `provider.messageZh` |

所有成功、阻断与错误外封套及嵌套对象均为新图并深度冻结；输入不被冻结，也不在调用之间共享对象。重复显式解析只重算，不执行第二次合成，`UNKNOWN` 从不触发自动恢复或换 Provider。

## 6. 错误协议

结构失败恰为：

```json
{ "ok": false, "errors": [{ "code": "VOICE_ASSET_...", "path": "...", "reason": "..." }] }
```

固定首错，`path` 只允许 `$`、`schemaVersion`、`library`、`taskDraft`、`negotiation`、`expectation`、`now`、`<unknown-key>`；不拼条目 ID、下标、未知键文本或上游 errors。`reason` 是枚举键的小写、下划线换空格的固定短语。

结构/依赖错误：`INVALID_INPUT`、`RESOURCE_LIMIT`、`UNSUPPORTED_VERSION`、`INVALID_LIBRARY`、`DUPLICATE_ID`、`INVALID_REFERENCE`、`INVALID_TASK`、`INVALID_NEGOTIATION`、`INVALID_EXPECTATION`、`INVALID_NOW`、`DEPENDENCY_FAILURE`。

业务原因：`TASK_KIND_MISMATCH`、`SOURCE_MISMATCH`、`TASK_RIGHTS_UNCONFIRMED`、`PROFILE_UNAVAILABLE`、`PROFILE_REVISION_MISMATCH`、`PROFILE_RIGHTS_UNCONFIRMED`、`BINDING_MISSING`、`ASSET_REVISION_MISMATCH`、`ASSET_RIGHTS_UNCONFIRMED`、`ASSET_MISSING`、`ASSET_UNKNOWN`、`ASSET_EXPIRED`、`ASSET_KIND_MISMATCH`、`CANDIDATE_MISMATCH`、`PROVIDER_REF_MISMATCH`、`PROVIDER_BLOCKED`。

入口根形状：非对象、缺键或字段数错误 `INVALID_INPUT/$`；未知键 `INVALID_INPUT/<unknown-key>`；`schemaVersion` 存在但不严格为 1 `UNSUPPORTED_VERSION/schemaVersion`。resolver 嵌套 library 的非对象、缺键、未知键或字段数错误为 `INVALID_LIBRARY/library`，嵌套 `schemaVersion` 存在但非 1 为 `UNSUPPORTED_VERSION/library`，库内字段/类型/格式错误为 `INVALID_LIBRARY/library`。getter、Symbol、隐藏属性等复制错误总先于业务校验。

## 7. 示例（虚构数据）

```json
{
  "schemaVersion": 1,
  "library": {
    "schemaVersion": 1,
    "profiles": [
      {
        "voiceProfileId": "voice:demo-hero",
        "revision": 1,
        "scopeId": "scope:fixture-demo",
        "displayName": "演示角色",
        "rightsState": "CONFIRMED_FIXTURE",
        "bindings": [
          { "instanceId": "instance:qwen", "assetId": "asset:fixture-voice-a" },
          { "instanceId": "instance:rvc", "assetId": "asset:fixture-model-a" }
        ]
      }
    ],
    "assets": [
      {
        "assetId": "asset:fixture-voice-a",
        "revision": 1,
        "scopeId": "scope:fixture-demo",
        "kind": "TTS_VOICE",
        "candidateId": "qwen3-tts",
        "providerRef": "voice-a",
        "availability": "PRESENT",
        "rightsState": "CONFIRMED_FIXTURE",
        "integrity": null,
        "expiresAt": null
      }
    ]
  },
  "taskDraft": {
    "schemaVersion": 1,
    "taskId": "task:demo-tts",
    "feature": "voice-bubbles",
    "taskType": "TTS",
    "source": { "kind": "TEXT_REF", "ref": "artifact:fixture-text-1" },
    "voiceProfileId": "voice:demo-hero",
    "deliveryRequested": false,
    "rights": { "state": "CONFIRMED_FIXTURE" }
  },
  "negotiation": {
    "schemaVersion": 1,
    "registry": { "schemaVersion": 1, "instances": [] },
    "selection": { "category": "TTS", "instanceId": "instance:qwen" },
    "consent": { "networkAllowed": false, "textUploadAllowed": false, "paidAllowed": false },
    "request": {
      "requestId": "request:fixture-1",
      "text": "hello",
      "voiceId": "voice-a",
      "language": "zh-CN",
      "emotion": "neutral",
      "format": "audio/wav",
      "streaming": false
    }
  },
  "expectation": { "scopeId": "scope:fixture-demo", "profileRevision": 1, "assetRevision": 1 },
  "now": "2026-10-27T00:00:00.000Z"
}
```

（`registry.instances` 必须含合法演示实例；示例省略以保持简短。）解析成功时 `decision` 为 `FIXTURE_BOUND`，`binding.providerRef` 为 `voice-a`，`messageZh` 为固定成功文案。

### 7.1 已知限制：TTS 正文未与 request 文本关联

TTS 任务的 `source.ref` 是 `TEXT_REF` 的 Artifact 引用，但本轮**不解析**正文 Artifact，也不比对 `source.ref` 与 `request.text` 是否一致。因此 `FIXTURE_BOUND` 只证明音色/实例/请求音色字段绑定，**不能**宣称完整的 Task → Provider 适配。SVC 才会校验 `source.ref` 与 `sourceAudioRef` 相等。该缺口留给父 Plan08 的正文 Artifact 关联阶段。

## 8. 未来界面故事板（尚未实现，本轮没有可点击按钮）

以下为**未来** GUI 的普通用户路径，本轮代码没有实现它，也没有新增可点击按钮或 Host 端点：

1. 用户选择“语音气泡”或“唱歌”。
2. 在共享角色列表中选择一个演示角色（`voiceProfileId`）。
3. 选择已支持的演示实例（TTS 或 RVC）。
4. 页面展示“演示绑定状态”：`FIXTURE_BOUND` 时显示固定成功文案，并明确“尚未生成音频，不能试听、保存或发送”；阻断时显示对应中文原因。
5. 用户确认后，未来版本才进入真实生成/保存/发送流程；那一步属于后续计划，本轮不承诺。

研发人员可用 Node 测试或临时脚本调用本模块，但那不是普通用户操作路径。

## 9. 三种失败恢复

| 恢复场景 | 用户看到 | 正确恢复 |
|---|---|---|
| 版本变化 | “演示资产版本已变化，请刷新后重新选择。” | 刷新界面，重新选择角色/实例；系统不会自动迁移或沿用旧 revision |
| 使用权未确认/撤销 | “演示使用权尚未确认或已撤销，请确认后再继续。” | 先确认合法使用权；系统不会自动升级 `UNVERIFIED`/`REVOKED` |
| 模型/绑定缺失或未知 | “没有可用的演示音色绑定，请重新选择或稍后再说。” / “演示资产状态未知，请重新检查，系统不会自动下载。” | 重新选择，或稍后再检查；不下载、不自动换音色或模型 |

新手成功故事只到“演示绑定成立”，不会出现“已生成/已保存/已发送成功”。

## 10. 未包含与边界

本轮不调用 dispatcher、不推进 AudioTask、不建 Artifact/持久队列/ID 分配器、不解析 TTS 正文 Artifact、不读模型/音频文件、不增加 UI 或 Host 端点、不改旧 Provider/RVC/配置契约。旧 `AudioTaskDraft v1`、06-B 协商、06-C 派发、06-D 准入与 RVC Fake 目录保持原样，新库不是第二套 Provider Registry。

真实 TTS 生成/音频字节/进程取消、真实模型/RVC/GPU、持久 Task/幂等/资源运行、队列、Artifact、鲸递投递与微信发送仍未实现或未集成。父 Plan08 仍 IN_PROGRESS；08-A 完成不代表父阶段完成。

## 11. 测试与证据

行为测试位于 `test/voice-assets.test.mjs`，覆盖 V01–V26 场景组（含 27 个导出/错误码、13 键输出与 8 键 binding、TTS/SVC 独立绑定、原 Provider 阻断保留、三层权利、revision/过期、悬空/跨 scope 引用、复制预算与业务上限、getter/Symbol/Proxy、fresh/deep-frozen 等）。测试只使用虚构数据，不触发真实发送、录音设备、焦点切换或生产配置写入。

实际执行命令与计数记录在 Plan08-A 交付报告及其 CI 中；本文档不预填未经执行的通过数。
