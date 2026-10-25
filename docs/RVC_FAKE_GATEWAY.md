# Whale Voice · 原创 RVC Fake Gateway 纯协议（Plan 07-B）

**状态：OFFLINE / ORIGINAL-FAKE-PROTOCOL。2026-10-25。**

**先说明这是什么：** 这是一个**原创的演示网关协议**，用来验证将来「唱歌 → RVC 音色转换」这条链路的数据契约。它**不是**真实 RVC，**没有**连接任何服务器、Gradio、模型或音频，也**不会**生成、试听、保存或发送任何东西。

- 两个演示模型都是虚构 Fixture，**不是**已安装的 RVC 模型。
- 所有声音相关字段都是协议描述，**不证明音频存在**。
- `gateway:fixture-rvc` 只是一个固定标签，**不是**网络地址、白名单或访问授权。
- 真实的 HTTP 传输、认证、模型资产映射与投递仍属于后续 Plan 08/12/13。
- 07-A 的上游研究结论保持：`BLOCKED_CODE_REUSE`、`BLOCKED_DIRECT_API_INTEGRATION`；本协议**没有复制** AstrBot、RVCSVC-API 或任何上游代码、常量、下载器。

---

## 1. 固定导出（8 个）

| 导出 | 说明 |
|---|---|
| `RVC_FAKE_GATEWAY_SCHEMA_VERSION` | 固定 `1`；本协议独立 Schema，**不是** SVC v1 |
| `RVC_FAKE_ERRORS` | 15 个冻结错误码 |
| `RVC_FAKE_SCENARIOS` | 7 个冻结场景名 |
| `RVC_FAKE_LIMITS` | 冻结的演示协议上限 |
| `listRvcFakeModels()` | 两个演示模型（每次返回新的深冻结拷贝） |
| `validateRvcFakeRequest(request)` | 校验并规范化请求 |
| `simulateRvcFakeConversion(request, context)` | 按场景产出确定性模拟响应 |
| `validateRvcFakeResult(result, request, context)` | 校验结果是否与该请求/场景的唯一预期一致 |

统一返回信封：成功 `{ok:true,value}`；失败 `{ok:false,errors:[{code,path,reason}]}`，**没有 `value`**，用户数据错误不抛异常。成功对象与数组均为新构造并深冻结，输入不被修改。

---

## 2. 演示模型目录

`listRvcFakeModels()` 的成功值是一个固定顺序的两项数组，每项恰好八个键：

```text
modelId, labelZh, engine, simulatedAvailable,
integrationStatus, selectable, mockOnly, realOperationAllowed
```

| modelId | labelZh | simulatedAvailable |
|---|---|---|
| `rvc-model:fixture-a` | 演示音色A（非真实模型） | `true` |
| `rvc-model:fixture-b` | 演示音色B（模拟未就绪） | `false` |

所有模型固定：`engine: "RVC_FAKE"`、`integrationStatus: "NOT_IMPLEMENTED"`、`selectable: false`、`mockOnly: true`、`realOperationAllowed: false`。没有第三个模型、真实权重名或下载地址。`simulatedAvailable` 只表示演示分支，**不表示已安装或真实健康**。

---

## 3. 请求契约（七个字段全部必填）

```json
{
  "schemaVersion": 1,
  "sourceAudioRef": "artifact:fixture-vocal-a",
  "targetModelId": "rvc-model:fixture-a",
  "pitchShift": 0,
  "outputFormat": "audio/wav",
  "inputAudio": {
    "durationMs": 1200,
    "byteLength": 48000,
    "sampleRate": 44100,
    "channels": 1
  },
  "rights": { "state": "CONFIRMED_FIXTURE" }
}
```

| 字段 | 规则 |
|---|---|
| `schemaVersion` | 整数 `1`；与 SVC v1 不是同一 Schema |
| `sourceAudioRef` | `artifact:fixture-` + 1–48 位 `[A-Za-z0-9_-]`；只接受虚构 Fixture，不解析真实资产 |
| `targetModelId` | 必须是目录中的两个 ID 之一；未知模型拒绝，**不默认 A** |
| `pitchShift` | 整数 `-12..12`；不截断、不夹紧 |
| `outputFormat` | 必填且只能是 `audio/wav` |
| `inputAudio` | 恰好四个键：`durationMs / byteLength / sampleRate / channels` |
| `rights` | 恰好 `{ state }`，只能 `CONFIRMED_FIXTURE` |

**演示协议上限（不是硬件性能承诺）：**

| 限制 | 值 |
|---|---|
| `maxDurationMs` | 300000 |
| `maxByteLength` | 52428800 |
| `inputSampleRates` | 16000 / 22050 / 24000 / 32000 / 44100 / 48000 |
| `inputChannels` | 1 |
| `outputSampleRate` | 44100 |

`UNVERIFIED` 或任何“真实已授权”声明都不能运行模拟。显式 `undefined`、用 `null` 替代必填字段、正文、字节、歌曲 ID、URL、目标聊天、`provider`、`send`、`token`、`formantShift`、`conversionStrength`、`gain`、`separation` 等未知字段全部拒绝。

---

## 4. context（恰好三个字段）

```json
{
  "requestId": "request:fixture-demo-a",
  "endpointId": "gateway:fixture-rvc",
  "scenario": "SUCCESS"
}
```

- `requestId`：`request:fixture-` + 1–32 位安全字符，由调用者注入。
- `endpointId`：**只能**是 `gateway:fixture-rvc`；不访问真实地址或 `127.0.0.1`。
- `scenario`：只能是七种场景之一。
- `scenario` 是测试输入，**不是**外部健康证据。

---

## 5. 模拟响应（恰好十五个字段）

```json
{
  "schemaVersion": 1,
  "requestId": "request:fixture-demo-a",
  "engine": "RVC_FAKE",
  "targetModelId": "rvc-model:fixture-a",
  "status": "SUCCEEDED_FAKE",
  "code": null,
  "artifactRef": "artifact:fixture-output-demo-a",
  "mime": "audio/wav",
  "sampleRate": 44100,
  "durationMs": 1200,
  "cancel": { "requested": false, "confirmed": false },
  "delivery": { "state": "NOT_REQUESTED", "submitAllowed": false },
  "mockOnly": true,
  "realOperationAllowed": false,
  "automaticRetryAllowed": false
}
```

| scenario | status | code | cancel |
|---|---|---|---|
| `SUCCESS` | `SUCCEEDED_FAKE` | `null` | false / false |
| `OFFLINE` | `OFFLINE` | `RVC_FAKE_OFFLINE` | false / false |
| `MODEL_MISSING` | `MODEL_NOT_AVAILABLE` | `RVC_FAKE_MODEL_NOT_AVAILABLE` | false / false |
| `TIMEOUT` | `TIMEOUT` | `RVC_FAKE_TIMEOUT` | false / false |
| `CANCEL_REQUESTED` | `CANCEL_REQUESTED` | `RVC_FAKE_CANCEL_PENDING` | **true / false** |
| `CANCEL_CONFIRMED` | `CANCELLED_FAKE` | `RVC_FAKE_CANCELLED` | **true / true** |
| `UNKNOWN` | `UNKNOWN` | `RVC_FAKE_UNKNOWN` | false / false |

- **模型 B 优先**：只要请求合法且 `targetModelId` 是 B，无论 scenario 是什么都返回 `MODEL_NOT_AVAILABLE`，**不回退 A**。
- `SUCCEEDED_FAKE` 时：`artifactRef = "artifact:fixture-output-" + requestId` 去掉 `request:fixture-` 的后缀；`mime = "audio/wav"`；`sampleRate = 44100`；`durationMs = 请求的时长`。**没有生成文件，不证明音频存在。**
- 非成功状态：`artifactRef / mime / sampleRate / durationMs` 全部 `null`。
- 所有响应固定 `delivery = { state: "NOT_REQUESTED", submitAllowed: false }`、`mockOnly: true`、`realOperationAllowed: false`、`automaticRetryAllowed: false`。
- 合法的 `OFFLINE`/`TIMEOUT`/`UNKNOWN` 属于 `ok:true` 的**模拟响应**，不等于生成成功；只有结构或验证失败才是 `ok:false`。

---

## 6. 结果验证

`validateRvcFakeResult(result, request, context)` 先验证请求与 context，再用**同一个**权威结果构造规则算出唯一预期，最后逐字段校验结果：

- 十五个键全部必填；`cancel`、`delivery` 键严格固定。
- `schemaVersion`、`engine`、`requestId`、`targetModelId` 必须与请求/上下文一致。
- `status`、`code`、`cancel`、四个音频字段必须与场景和模型规则一致（模型 B 的优先级也一致）。
- 成功的 `artifactRef` 必须是本次 `requestId` 派生值。
- 不接受路径、URL、真实文件或字节冒充产物。
- 不允许翻转固定标志，也不允许 `SENT` 或 `PENDING_ROUTER` 冒充本协议状态。
- 未知字段拒绝，不清洗后继续。
- 成功返回新的规范化冻结副本。

**Artifact 验证只限格式与关联**，不是解码、时长探测或文件存在性验证。

---

## 7. 错误码与属性策略

`RVC_FAKE_ERRORS` 为冻结对象，键名为错误码去掉 `RVC_FAKE_` 的部分：

```text
INVALID_REQUEST  UNKNOWN_FIELD  TYPE_MISMATCH  UNSUPPORTED_VERSION
MODEL_NOT_AVAILABLE  UNSUPPORTED_FORMAT  RIGHTS_UNCONFIRMED  RESOURCE_LIMIT
INVALID_CONTEXT  INVALID_RESULT  OFFLINE  TIMEOUT  CANCEL_PENDING  CANCELLED  UNKNOWN
```

| 情形 | 错误码 | reason |
|---|---|---|
| 未知 / Symbol 键 | `RVC_FAKE_UNKNOWN_FIELD` | `unknown field is not allowed` |
| 已知键隐藏 / accessor / 类型错误 | `RVC_FAKE_TYPE_MISMATCH` | `invalid field type or property` |
| 缺必填字段（含显式 `undefined`） | 所属域 `INVALID_REQUEST` / `INVALID_CONTEXT` / `INVALID_RESULT` | `required` |
| 非普通对象或超过 32 键 | 所属域 `INVALID_REQUEST` / `INVALID_CONTEXT` / `INVALID_RESULT` | `invalid object structure` |
| 整数版本不为 1 | `RVC_FAKE_UNSUPPORTED_VERSION` | `unsupported schema version` |
| 源引用或 requestId 格式非法 | `INVALID_REQUEST` / `INVALID_CONTEXT` | `fixture reference required` |
| 未注册模型 | `RVC_FAKE_MODEL_NOT_AVAILABLE` | `fixture model not registered` |
| 不支持格式 | `RVC_FAKE_UNSUPPORTED_FORMAT` | `only fixture audio/wav is supported` |
| 权利状态不合法 | `RVC_FAKE_RIGHTS_UNCONFIRMED` | `fixture rights required` |
| 数字超限或不支持数值 | `RVC_FAKE_RESOURCE_LIMIT` | `outside fixture protocol limits` |
| endpoint / scenario 不在固定集合 | `RVC_FAKE_INVALID_CONTEXT` | `unsupported fixture context` |
| 结果关联或不变量冲突 | `RVC_FAKE_INVALID_RESULT` | `inconsistent fixture result` |
| 意外检查异常 | `RVC_FAKE_INVALID_REQUEST` | `input could not be inspected safely` |

**属性策略（每一层输入对象一致）**：仅 `Object.prototype` 或 null 原型；仅字符串自有键；仅可枚举数据属性；冻结对象可用；Symbol、隐藏字段、getter/setter（**从不执行**）、自定义原型拒绝；每层最多 32 个自有键；只遍历固定 Schema 层，不遍历未知值；不递归克隆原始对象；不回显输入值、未知键、Symbol 描述、异常或堆栈。

**顺序固定**：request → context → 模型 B 优先 → scenario → 构造并验证结果。可以首错返回；各域先结构、属性、必填，再语义。

---

## 8. 未来三层映射（仅文档，未实现）

| 本协议字段 | 未来处理 |
|---|---|
| `sourceAudioRef` | 可来自 Core 的 `source.ref`；真实资产解析与权利归 Plan 08 |
| `targetModelId` | **不等于** `voiceProfileId`，也不等于 #16 的 `targetVoiceId`；Plan 08 需要显式映射 |
| `pitchShift` 整数 -12..12 | #16 接受 -24..24 的有限数，**不能静默夹紧** |
| `formantShift` / `conversionStrength` | 本协议不支持；以后适配需明确能力声明 |
| `inputAudio` / `rights` / `schemaVersion` | Fake 内部字段，**不能**把整个请求直传 `validateSvcRequest` |
| `context.requestId` | 外部关联；#16 v1 请求不接收该字段 |
| `SUCCEEDED_FAKE` 结果 | 缺 `targetVoiceId`，**不是** #16 的合法归一化结果 |
| `delivery: NOT_REQUESTED` | 与 #16 归一化产生的 `PENDING_ROUTER` 不同；两者都**不是**发送权限 |
| `show_model` / `convert` 功能类比 | 只用于说明演示操作，**不代表**上游真实接口已验证 |

真实的适配必须等待 #16 获得用户授权合并，以及 Plan 08 的资产映射；本阶段**没有**运行任何 #16 兼容测试。

---

## 9. Novice First · 普通用户会看到什么（当前仍未接 UI）

先说明：这是演示网关；演示模型不是真实安装的 RVC；没有真实生成、试听或发送；所有真实能力仍未支持。

未来路径：

```text
唱歌 → 独立依赖说明 → RVC 标准翻唱 → 合法本地素材与音色
     → 按需分离、转换、混音 → 试听保存 → 另行授权发送
```

至少六类中文状态与恢复：

| 状态 | 中文说明与恢复 |
|---|---|
| `OFFLINE` | 翻唱组件尚未连接；重新检查，或以后再说 |
| `MODEL_NOT_AVAILABLE` | 目标音色尚未准备好；重新选择合法音色，**不自动下载** |
| `RESOURCE_LIMIT` | 素材超出演示协议范围；换较短测试素材，或返回 |
| `RIGHTS_UNCONFIRMED` | 尚未确认使用权；更换合法材料 |
| `CANCEL_REQUESTED` | 已请求取消，**尚未确认停止** |
| `UNKNOWN` / `TIMEOUT` | 结果不明，请核查；**不会自动重试或切换后端** |

Seed-VC 不安装、不冒充可用；无 GPU 不虚构 CPU 方案。普通用户无需终端、Git、Python 或手改 JSON；研发测试命令不计入最终用户路径。

---

## 10. 验证证据

```bash
node --check core/svc/rvc-fake-gateway.mjs
node --test test/rvc-fake-gateway.test.mjs   # G01–G40，40 项
node --test                                  # 本分支全量 216 项（215 pass / 1 skip）
node build.mjs && git diff --exit-code -- client.js
git diff --check
```

本分支基于 `main`（尚无 05-A/05-B 模块），因此全量计数是 **216**，不是 05-B 分支的 293；没有从其他 PR 复制测试。G01–G40 覆盖目录、边界、场景、模型优先级、结果关联、脱敏、不可变与静态纯净性。

---

## 11. 未实现边界

- 没有 HTTP 路由、没有 Gradio、没有真实 RVC、没有模型或权重、没有音频文件。
- 没有 Provider Registry、任务队列、下载器、分离/混音器或发送 Tool。
- 没有真实 URL 白名单、认证或传输；固定 `endpointId` **不构成** SSRF 防护或网络授权。
- 没有合并任何 PR、没有部署、没有安装、没有微信或生产操作。

**本文件不代表 RVC 已可用。** 它只固定了未来实现所需的演示协议边界。
