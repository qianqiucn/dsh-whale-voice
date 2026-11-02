# Qwen3-TTS 本地 Provider（Plan10 10-A，离线候选）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本文件描述的是一套**未接真实模型**的本地
Provider 候选：固定上游元数据、Provider 中立能力映射、窄 worker 协议、受控进程管理与 Fake
端到端验收。它不代表本机已安装 Qwen、已加载权重、已授权私人音色，也不代表已完成 Host、主 Task
或真实 Artifact 交接。

## 1. 固定上游与许可

| 项 | 值 |
|---|---|
| 上游代码 | `QwenLM/Qwen3-TTS` @ `022e286b98fbec7e1e916cb940cdf532cd9f488e` |
| Python 包 | `qwen-tts` `0.1.1`（本批只记录元数据，不安装） |
| Base 模型 | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` @ `fd4b254389122332181a7c3db7f27e918eec64e3` |
| 许可 | 上游代码与 Base 模型卡为 Apache-2.0 |
| 许可范围 | **不覆盖**依赖、其他变体、私人参考音频/音色；这些需要单独确认 |

模块 `core/tts/qwen-contract.mjs` 的 `QWEN_UPSTREAM` / `qwenLicenseView()` 是唯一来源；版本不符时
Provider 状态降级，不冒充已审计。

## 2. 能力矩阵（互不混用）

| backend | 预设音色 | 克隆 | 参考音频 | VoiceDesign | 情绪 | 公共请求 |
|---|---|---|---|---|---|---|
| `custom-voice` | ✓ | ✗ | ✗ | ✗ | ✓（neutral/cheerful/gentle） | ✓ |
| `base-clone` | ✗ | ✓ | ✓ | ✗ | ✗ | 仅内部可信绑定 |
| `voice-design` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗（本批不暴露） |

- 一次请求只能带**一种**模态：预设 `voiceId`、可信克隆绑定或 VoiceDesign 指令；混用直接拒绝
  （`QWEN_MIXED_MODALITY`）。
- 克隆材料只能来自 Core 的可信绑定（不透明 `bindingRef` token），协议里禁止路径/URL/命令/环境/密钥。
- VoiceDesign 在 10-A 仅声明、不暴露公共请求通道，避免把指令塞进旧白名单。

## 3. 限额

| 项 | 值 |
|---|---|
| 文本 | ≤ 200 字 |
| 音频 | ≤ 20 秒 |
| 输出字节 | ≤ 1 MiB（与既有 Fixture 资产预算一致，不扩大旧库预算） |
| 格式 | WAV / PCM16 / 24000 Hz / 单声道 |
| 请求超时 | 120000 ms（测试可缩短，不超过上限） |
| 重试 | 0 次；不做自动 retry/fallback/UNKNOWN 重发 |
| 取消 | 支持，取消请求与确认分开记录 |

## 4. Worker 协议（内部、版本化）

NDJSON over stdio，`v:1`；请求 `hello/health/discover/synthesize/cancel/shutdown`，响应
`ready/result/error/event`。

- 每个信封校验版本、类型、ID 形态、payload 键白名单、禁用键（path/url/token/command/env 等）与
  2 MiB 上限；未知字段一律拒绝。
- `hello` 必须返回 `provider: qwen-tts`（或 `Qwen3-TTS-*` 模型）与 `qwenTtsVersion`；否则健康分类为
  `UNRELATED_SERVICE` / `VERSION_MISMATCH`。
- `synthesize` 请求固定携带 `requestId/text/model/backend/modality/voiceId|bindingRef/language/
  emotion/format{ mime, sampleRate, channels }/maxBytes`；响应返回 base64 字节与声明格式。
- 迟到响应不匹配任何在途请求，只计 `lateResponses`，不会重试或复活旧请求。

## 5. 受控进程管理

`core/tts/qwen-supervisor.mjs`：

- 只在显式配置（`worker.command` + `allowedRoot`，可选 `runtime`）下启动；**无默认命令、无隐式启动**。
- `command` 必须位于允许根内（真实路径校验）；`runtime` 必须是既有绝对路径；`shell:false`，
  只给 `WV_QWEN_PROTOCOL`/`WV_QWEN_TMP`，不继承主机环境。
- 只管理自己启动的子进程；退出/崩溃后不重启、不重试；`stop()` 先 `shutdown` 再在宽限期后仅杀自己的
  PID，最后删除本轮临时目录。
- stdout 有界（4 MiB）与 stderr 有界（8 KiB）；协议垃圾只计数，不执行。
- 超时：请求超时 → 取消请求 → 返回 `UNKNOWN`（`unknown:true`），调用方不得视为失败后重发。

## 6. 健康、发现与输出校验

- `classifyQwenHealth`：无 worker → offline；身份不符 → `UNRELATED_SERVICE`；版本不符 →
  `VERSION_MISMATCH`；模型不符 → `MODEL_MISMATCH`；健康查询非 ok → degraded；全部匹配才 available。
- `normalizeQwenDiscovery`：预设/克隆分离；克隆必须有可信绑定；预设后端无音色 → 不可用。
- `validateQwenOutput`：base64 严格解码 → 字节上限 → 复用 `core/audio/wav-byte-inspector.mjs` 校验
  WAV/PCM16/采样率/声道/时长/峰值/hash → 与 worker 声明格式逐项比对 → 生成 Provider 中立结果。
  结果 `artifactRef` 是内存字节的哈希（`qwen-bytes:<sha256 前 32>`），`persisted:false`，
  `delivery.state='PENDING_ROUTER'`；**不写资产库、不伪装 FIXTURE_IMPORT、不创建 Task**。

## 7. Task 关联

`provider.synthesize(request, { taskId })` 要求调用方传入既有权威签发的 `taskId`（形态校验），只把它
回显在结果里；Provider 不创建/分配 Task，不写目录，不触碰 owner/catalog。缺失或非法 `taskId` →
`INVALID_RESPONSE`。

## 8. Fake 与测试

- `test/helpers/fake-qwen-worker.mjs` 是自有的 Fake 子进程，走**同一条** supervisor/协议路径；
  不加载模型、不联网、不写文件，按 argv 选择成功/错误/超时/崩溃/迟到/坏字节/坏格式/超大/无音色/
  版本不符/无关服务等故障。
- `test/qwen-provider.test.mjs` 覆盖：能力矩阵与许可、模态互斥、协议拒绝路径/密钥/未知字段、
  健康分类、无隐式启动与越界命令、Fake 端到端字节校验与不落盘、坏字节/坏格式/超限、错误与崩溃映射、
  超时取消与 UNKNOWN、迟到响应、不可用后端、克隆绑定、Task 关联、发现分离。
- 若执行环境禁止子进程管道（EPERM），进程类测试按平台跳过并在报告中注明；不得用内存 mock 替代
  进程生命周期证据。

## 9. 明确未完成（Plan10 集成 OPEN）

- 真实 Qwen 权重/依赖安装、真实推理、真实音频质量、中文短/长句、CPU/GPU 资源与失败恢复的真实验证。
- 真实 DSH Host 装载、主 Task 执行、真实 Artifact 交接与保存；本批不冒充已打通用户生成链。
- VoiceDesign 公共通道、克隆参考素材的真实解析与权利确认。
- 云端 Provider、IndexTTS（10-B）、轻量候选（10-C）不在本批。
- 不安装、不下载、不启动/重启现有服务、不读取私人素材、不真实发送。
