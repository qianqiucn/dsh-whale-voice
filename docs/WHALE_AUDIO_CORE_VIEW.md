# Whale Audio Core · 双入口统一只读视图（Plan 05-B）

**状态：OFFLINE / PURE-COMPOSITION / FAKE-TEST。2026-10-25。**

**一句话结论：** 这份视图把「音频任务的安全投影」「Voice/Singing 各自的依赖状态」「两个功能各自的首次使用提示」组合成一份确定性数据，供未来两个页面共同读取。它**不会**生成、安装、试听、保存、发送或改变任何真实状态；输出的 6 个动作开关**永远是 `false`**。

- 本阶段**没有**新增页面、Host 路由、按钮或可点击功能。
- 本阶段**没有**生成音频、下载模型、安装组件或调用微信。
- 05-A 的三个纯模块与 81 项测试**只读复用**，未修改一行。
- 本分支基于**尚未合并**的 PR #21（父分支），因此本视图目前只存在于堆叠 PR 中，不属于 `main`。

---

## 1. 分层与数据流

```text
  未来 Whale Voice 页面                未来 Whale Singing 页面
            \                          /
             \                        /
        ┌──────────────────────────────────────┐
        │ projectAudioCoreView(input)          │  ← 唯一读取入口（本阶段）
        │  1. 校验视图请求（六字段 + 两层属性） │
        │  2. 组合两个功能的只读状态            │
        │  3. 组合所选任务的安全投影            │
        └───────────────┬──────────────────────┘
                        │ 只读调用，不改状态
        ┌───────────────┴──────────────────────┐
        │ 05-A 已验收纯模块（只读复用）         │
        │  · task-contract: validate/project    │
        │  · feature-manifest: deps/availability/firstUse │
        └──────────────────────────────────────┘

  不在此图中：Provider 推理、安装器、持久化、Whale Relay、WeChatAgent 发送。
```

**职责边界：** 微信身份与权限仍归 WeChatAgent；真实投递仍归 Whale Relay；本视图既不验证也不授予发送权限。

---

## 2. 固定导出

```text
AUDIO_CORE_VIEW_SCHEMA_VERSION = 1
AUDIO_CORE_VIEW_ERRORS          // 7 个冻结错误码
projectAudioCoreView(input)     // 唯一函数
```

返回信封：

```text
成功：{ ok: true, value }
失败：{ ok: false, errors: [{ code, path, reason }] }
```

失败信封**没有** `value`；由用户输入造成的错误不抛异常。

---

## 3. 输入契约（六个字段，全部必填）

```json
{
  "schemaVersion": 1,
  "activeFeature": "voice-bubbles",
  "taskRecord": null,
  "observationsByFeature": {
    "voice-bubbles": {},
    "singing": {}
  },
  "acknowledgedByFeature": {},
  "manifestRevision": "plan05a.v1"
}
```

| 字段 | 规则 |
|---|---|
| `schemaVersion` | 整数 `1`；这是**视图**版本，不改 Task v1，也不改 Capability v3 |
| `activeFeature` | `voice-bubbles` 或 `singing` |
| `taskRecord` | `null` 或完整 AudioTaskRecord；非 null 时其 `feature` 必须等于 `activeFeature` |
| `observationsByFeature` | **恰好**两个功能键，各值为普通观察对象；组件与状态取值复用 05-A 规则 |
| `acknowledgedByFeature` | 复用首访契约；空对象或缺某功能记录表示未确认 |
| `manifestRevision` | 复用首访函数的版本规则 |

**明确拒绝：** 顶层 `deliveryId`、目标聊天、`backend`、`providerId`、URL、路径、正文、字节、命令等任何未列出字段。

### 3.1 属性策略（输入层与 observationsByFeature 层）

| 输入形态 | 结果 |
|---|---|
| `Object.prototype` 或 `null` 原型 | 允许 |
| 自定义原型、类实例、数组 | 拒绝 |
| Symbol 键 | 拒绝（不输出描述） |
| 未知字符串键（可枚举或隐藏） | 拒绝（固定占位 `<unknown-key>`） |
| 已知键不可枚举 | `TYPE_MISMATCH` |
| getter / setter | 拒绝，**从不执行** |
| 冻结对象 | 允许（只要求可枚举数据属性） |
| 单层自有键 > 32 | `INVALID_REQUEST`，`too many fields` |

不先 spread、不先 JSON 克隆、不遍历未知字段的值。其余结构委托 05-A 的公开验证函数；异常统一返回固定安全错误（不宣称隔离任意恶意 Proxy）。

---

## 4. 固定成功输出（顶层恰好九个键）

```text
{
  schemaVersion: 1,
  mode: "MOCK_ONLY",
  activeFeature,
  features: {
    "voice-bubbles": { dependencies, availability, firstUse },
    "singing":       { dependencies, availability, firstUse }
  },
  task: null | <projectAudioTask 的白名单投影>,
  actions: {
    canGenerate: false, canInstall: false, canPreview: false,
    canSave: false, canSend: false, canRequestCancel: false
  },
  mockOnly: true,
  realOperationAllowed: false,
  userMessageZh: "当前为演示只读视图，尚未接入真实生成、安装、试听、保存或发送。"
}
```

- 每个功能块**恰好** `dependencies` / `availability` / `firstUse` 三个键，内容直接来自 05-A 的公开函数。
- `task` 只能是 `projectAudioTask` 的白名单结果：**不含** `source`、`ref`、`outputArtifactRef`、`rights`、`observedAt`、`deliveryId`、原始错误或异常文本。
- `taskId` / `voiceProfileId` / `deliveryRequested` 属于既有白名单字段，可以保留。
- 六个 `actions` 恒为 `false`。即使 `task.hasOutput === true`，也不代表可试听或可保存。
- 首访确认**不跨功能共享**；`activeFeature` 只约束所选任务，不隐藏另一功能的错误。
- 全部结果递归冻结，每次成功返回新的对象图，输入对象不被修改。

---

## 5. 错误码与固定错误

| 错误码 | 值 |
|---|---|
| `INVALID_REQUEST` | `CORE_VIEW_INVALID_REQUEST` |
| `UNKNOWN_FIELD` | `CORE_VIEW_UNKNOWN_FIELD` |
| `TYPE_MISMATCH` | `CORE_VIEW_TYPE_MISMATCH` |
| `SCHEMA_UNSUPPORTED` | `CORE_VIEW_SCHEMA_UNSUPPORTED` |
| `FEATURE_MISMATCH` | `CORE_VIEW_FEATURE_MISMATCH` |
| `TASK_INVALID` | `CORE_VIEW_TASK_INVALID` |
| `MANIFEST_INVALID` | `CORE_VIEW_MANIFEST_INVALID` |

| 情形 | 错误码 | 固定路径 | 固定 reason |
|---|---|---|---|
| 非普通 `input` 或检查异常 | `INVALID_REQUEST` | `$` | `input could not be validated safely` |
| 缺必填字段 | `INVALID_REQUEST` | 静态字段名 | `required` |
| 新增层超过 32 键 | `INVALID_REQUEST` | `$` 或 `observationsByFeature` | `too many fields` |
| 未知 / Symbol 键 | `UNKNOWN_FIELD` | `<unknown-key>` | `unknown field is not allowed` |
| 已知键隐藏 / accessor / 类型错误 | `TYPE_MISMATCH` | 静态路径 | `expected enumerable data property of the documented type` |
| `schemaVersion` 非整数 | `TYPE_MISMATCH` | `schemaVersion` | `expected integer schema version` |
| 整数但非 1 | `SCHEMA_UNSUPPORTED` | `schemaVersion` | `unsupported schema version` |
| 非法 `activeFeature` | `INVALID_REQUEST` | `activeFeature` | `unknown feature` |
| 观察对象校验失败 | `MANIFEST_INVALID` | `observationsByFeature.<feature>` | `feature observations could not be validated` |
| 首访对象校验失败 | `MANIFEST_INVALID` | `acknowledgedByFeature` | `first-use decision could not be validated` |
| 任务校验或投影失败 | `TASK_INVALID` | `taskRecord` | `task record could not be validated` |
| 任务与活动功能不符 | `FEATURE_MISMATCH` | `taskRecord.feature` | `task does not belong to the active feature` |
| 版本格式非法 | `MANIFEST_INVALID` | `manifestRevision` | `manifest revision could not be validated` |

**校验顺序固定：** 新增对象结构 → 两功能的依赖/观察/首访 → 任务。首个错误即可返回；不透传底层 `errors`、输入值、Symbol 描述或异常文本。

版本归因技巧：先调用 `evaluateFirstUse(feature, {}, manifestRevision)` 确认版本本身合法，再使用真实 acknowledgement 计算首访，避免把“版本坏了”误报成“确认记录坏了”。

---

## 6. 两条普通用户未来流程（当前均为演示只读）

### 6.1 Whale Voice · 语音气泡

1. 打开中文入口「语音气泡」。
2. 页面只读检查本功能依赖，并显示必需组与“发送时才需要”组。
3. 用户选择生成方式，或点「以后再说」继续浏览说明。
4. 未来：生成 → 试听 → 保存到本地。
5. 只有另行授权后，才可能出现“发送到已授权聊天”；本视图永远不提供该能力。

### 6.2 Whale Singing · 唱歌

1. 打开独立入口「唱歌」——它有自己的首次依赖说明，**不继承** Voice 的确认。
2. 首发主线是 **RVC · 标准翻唱**；需要合法素材、合法音色模型与转换后端。
3. 输入不是纯人声时，才需要“人声与伴奏分离”；输出格式需要时才需要混音。
4. 未来：翻唱 → 试听 → 保存。
5. **Seed-VC · 后续免训练试唱（暂不支持）** 灰显不可选；免训练不等于低显存，也不承诺无显卡可用。

### 6.3 三类恢复操作

| 情况 | 用户可做什么 |
|---|---|
| 缺少需要的组件 | 「重新检查」／「以后再说」／换一个可用方案 |
| 没有素材或音色的使用权 | 更换合法材料，或返回上一步 |
| 发送权限或目标不明 | 只保存不发送，或取消发送 |

### 6.4 必须一直保持的边界

- 两个功能的首次使用提示互相独立；确认一个不会让另一个免提示。
- 缺少微信相关组件只影响 `deliveryRequired`，**不阻断**仅生成/试听/保存的路径。
- 硬件与模型状态探测不到时如实显示 `UNKNOWN`，不编造 CPU/GPU 结论。
- 六个 `actions` 恒为 `false`，本阶段没有任何可点击的新真实功能。
- 演示取消不证明真实进程已停止；`hasOutput:true` 不证明真实音频可播放；`SAVED` 不等于配置 `APPLIED`，也不等于 Relay `SENT_LOCAL`。
- 开发者的 `node --test` 命令不是普通用户的使用路径。

**仍需后续专项实现：** 图形安装器、双页面真实 UI、真实 Provider/RVC 模型、任务持久化、真实投递与微信发送、真实 Windows 端到端验证（Plan 06/07-B/08/09/13-A/14）。

---

## 7. 本阶段验证证据

```bash
node --check core/audio/core-view.mjs
node --test test/audio-core-view.test.mjs        # V01–V28
node --test test/audio-core-contract.test.mjs    # 05-A 81 项回归
node --test                                      # 全仓库
node build.mjs && git diff --exit-code -- client.js
git diff --check
```

测试编号对照：V01–V05 组合形状与任务集成；V06–V10 输入边界；V11–V14 manifest 失败归因；V15–V18 任务校验与首访隔离；V19–V23 可用性行为与脱敏；V24–V28 冻结、兼容、鲁棒与纯净性。

---

## 8. 与父 PR 的关系

- 父 PR #21（Plan 05-A + F01）**尚未合并**；本分支从 `da3d0f7` 创建，新 PR 的 base 是 `feature/plan05a-whale-audio-core-contracts`。
- 相对父分支只新增三个文件：`core/audio/core-view.mjs`、`test/audio-core-view.test.mjs`、本文件。
- 相对 `main` 的差异会包含父 PR 的五个文件；这**不代表**父 PR 已合并。
- 没有合并、没有部署、没有安装、没有真实媒体、没有微信或生产操作。
