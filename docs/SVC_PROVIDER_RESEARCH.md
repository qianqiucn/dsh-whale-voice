# Plan 07-A · RVC 上游许可、API 与 Windows 依赖静态审计

**状态：** `RESEARCH-OFFLINE` / `SENT`（本轮只读研究，不做 07-B 编码）
**日期：** 2026-10-25
**执行者：** DeepSeek
**唯一允许的工程交付：** 本文件；不修改代码、配置、模型、PR #16/#17/#18 或 `docs/plans/`
**结论：** `APPROVE_FAKE_ADAPTER_DESIGN`，同时 `BLOCKED_CODE_REUSE` / `BLOCKED_DIRECT_API_INTEGRATION`
**未执行：** 真实模型、RVC/SVC 推理、音频下载、GPU、Windows 安装、微信、付费 API、生产服务

---

## 0. 执行前基线

| 项 | 本轮核验值 |
|---|---|
| `main` | `bf9cf66807e12d0b25872a0fa3869962dde04818` |
| PR #16 | OPEN，未合并，HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`，22 files，0 reviews，CI `40165832178` SUCCESS |
| PR #17 | 规划分支 `docs/whale-voice-execution-plan-registry`，HEAD `90391c3de9e90e26ede43186194b8d7de838be49`，OPEN |
| PR #18 | OPEN/Draft，HEAD `42cec57ae7018735cb6c65a4ef8b0a1d80473810`，历史资料，不合并 |
| 研究分支 | `research/plan07a-rvc-upstream-audit`，从 `main` 创建 |
| 本轮唯一文件 | `docs/SVC_PROVIDER_RESEARCH.md` |

GitHub 事实以执行时 API/Git 重新核验为准；本报告不把历史 SHA、CI 或 review 作为当前合并许可。

## 1. 结论先行

**可批准 07-B 的原创 Fake Adapter 设计；不可把上游插件或 RVCSVC-API 直接复制、vendor、内嵌或作为生产依赖。**

原因：

1. AstrBot 插件 LICENSE 为 **AGPL-3.0**，但 README 又声明“仅供学习和研究、请勿商业用途”；代码复制/网络部署的许可义务与附加限制需要单独法律审查。
2. RVCSVC-API 仓库根目录**未发现 LICENSE 文件**，README 只有“仅供学习、研究和个人娱乐”的限制性说明；公开可读不等于允许复制/再分发，判为 `UNVERIFIED_RIGHT_TO_REUSE`。
3. 插件 `api.py` 内含疑似第三方请求参数/凭据常量；本报告不复制其值。该文件不能作为可复用实现。
4. RVCSVC-API 的 `/convert` 接收**歌曲 ID/URL**并从第三方源下载音频，不接受本地授权音频 Artifact；与 Whale Audio Core 的本地素材、授权、Artifact 和隐私模型不兼容。
5. API 以 `0.0.0.0` + Gradio `share=True` 启动，无内置认证；存在局域网/公网暴露与未授权调用风险。
6. 上游自动下载 UVR5/MSST 模型，无校验和、无用户确认；不满足 Novice First 和供应链安全。
7. 无取消、无稳定结构化错误、无音频时长/格式契约、无模型/音色权利验证；真实 Windows/GPU 行为未测试。

因此，07-B 应实现**原创 Fake Gateway + 本地 Artifact 输入契约**；上游仅作为“用户自行安装的外部服务”参考，不进入仓库、不自动安装、不默认联网。

## 2. 上游锁定证据

| 组件 | 仓库 | 本轮锁定 |
|---|---|---|
| AstrBot 插件 | `CCYellowStar2/astrbot_plugin_rvc_svc` | `0b84e382927e088b9f4f10ce09ea1e4175bb0d8d`（2025-10-24） |
| RVCSVC-API | `CCYellowStar2/RVCSVC-API` | `274572c320147977a18dc0028e45f79da136a6e2`（2026-07-11） |
| Seed-VC | `Plachtaa/seed-vc` | `51383efd921027683c89e5348211d93ff12ac2a8`；仓库已归档；GPL-3.0 |
| RVC WebUI | `RVC-Project/Retrieval-based-Voice-Conversion-WebUI` | MIT（仓库元数据；具体版本/权重另核） |
| UVR5 | `Anjok07/ultimatevocalremovergui` | MIT（仓库元数据；整合包内 vendor 代码另核） |
| MSST | `ZFTurbo/Music-Source-Separation-Training` | MIT（仓库元数据；整合包内 vendor 代码另核） |
| so-vits-svc | `svc-develop-team/so-vits-svc` | AGPL-3.0（仓库元数据；仅接口候选） |

链路证据：

- 插件 `main.py` 用 `gradio_client.Client` 调 `/show_model`、`/convert`，模型名来自 Gradio 端。
- 插件 `api.py` 通过网易云/第三方搜索、评论、歌词和额外下载 URL 获取歌曲信息。
- API `app_rvc.py` / `app_svc.py` 下载歌曲、调用 UVR/MSST 分离、调用 RVC/SVC WebUI、做后处理与混音，返回临时文件路径。
- 插件收到路径后直接 `Record(file=result_path)` 发送，属于聊天框架内直接投递，不是 Whale Relay 的中立 Artifact 契约。

## 3. 许可与权利矩阵

> 本表是静态证据矩阵，不是法律意见。`UNVERIFIED` 不等于“无许可”，也不等于“已获许可”。

| component | upstreamUrl / pinnedCommit | licenseEvidence | codeRights | model/weightRights | audio/voiceRights | reuseMode | rightsStatus | risk | recommendation |
|---|---|---|---|---|---|---|---|---|---|
| AstrBot 插件 | `CCYellowStar2/astrbot_plugin_rvc_svc` @ `0b84e382` | 根 `LICENSE` 为 AGPL-3.0；README 另称仅供学习/研究、勿商用 | AGPL-3.0；网络交互/修改/分发义务需审查 | 插件仓库不含模型权重 | 网易云歌曲与翻唱输出权利未处理 | 独立进程参考，或 clean-room 重写 | `BLOCKED_CODE_REUSE` | 许可冲突/AGPL 传染/硬编码第三方凭据 | 不复制；只参考产品流程 |
| RVCSVC-API | `CCYellowStar2/RVCSVC-API` @ `274572c3` | 根目录无 LICENSE；README 仅限制性“学习/研究/个人娱乐”声明 | 无明确再分发许可 | 无模型权重；下载来源另核 | 歌曲下载/改编/传播权利未处理 | 仅用户自行安装的外部服务；不 vendor | `UNVERIFIED_RIGHT_TO_REUSE` | 源码可读≠可复用；整体权利不清 | 不复制、不打包；独立适配器 |
| RVC WebUI | `RVC-Project/Retrieval-based-Voice-Conversion-WebUI` | GitHub 元数据 MIT | MIT（具体版本核验） | RVC 模型/权重通常独立，许可未核 | 训练/推理声音授权未处理 | 可选外部 WebUI | `PARTIAL_VERIFIED` | 模型与代码许可不同 | 只做外部 Gateway 候选 |
| so-vits-svc | `svc-develop-team/so-vits-svc` | AGPL-3.0 | AGPL-3.0 | 模型/扩散权重独立，未核 | 歌声/参考声音授权未处理 | 仅接口候选，不实现 | `BLOCKED_CODE_REUSE` | AGPL 与部署义务 | 保持可选/UNVERIFIED |
| UVR5 | `Anjok07/ultimatevocalremovergui` | MIT（仓库元数据） | MIT | UVR 模型权重另核 | 输入歌曲版权未处理 | API 内 vendor 代码/外部工具 | `PARTIAL_UNVERIFIED` | vendor 代码无本仓库 LICENSE | 不复制 vendor 代码 |
| MSST | `ZFTurbo/Music-Source-Separation-Training` | MIT（仓库元数据） | MIT | BS-Roformer 权重另核 | 输入歌曲版权未处理 | API 内 vendor 代码/自动下载 | `PARTIAL_UNVERIFIED` | 自动下载无 checksum | 不自动下载 |
| Seed-VC | `Plachtaa/seed-vc` @ `51383efd` | GPL-3.0；仓库 archived | GPL-3.0 | 零样本模型权重另核 | 1–30 秒参考音频需同意/授权 | 后续可选，不做真实运行 | `PARTIAL_VERIFIED` | 归档、GPL、资源未知 | 仅静态档案，不首装 |
| FFmpeg | 官方/发行版 | LGPL/GPL 依构建 | 依具体构建 | 不适用 | 输入/输出媒体权利另核 | 外部依赖，不内嵌 | `UNVERIFIED_BUILD` | 构建选项会影响许可 | 由安装器核验具体构建 |
| 歌曲源/API | 网易云、`biliplayer.91vrchat.com`、`api.vkeys.cn` 等 | 服务条款/版权未核 | 不适用 | 不适用 | 下载、改编、传播权利未核 | 仅用户合法取得的本地文件 | `UNVERIFIED` | 版权/条款/地区限制/隐私 | 默认不让 Core 自动下载 |
| 参考音色/模型 | 用户自备 | 无统一许可 | 不适用 | 用户自备模型权利未知 | 真人声音同意/授权未知 | 用户显式选择 | `UNVERIFIED` | 声音克隆滥用/权利风险 | 必须授权确认与来源记录 |

### 3.1 关键许可事实

- 插件 LICENSE 是 AGPL-3.0（完整文本已存在），但 README 的“仅供学习/研究、请勿商业用途”是额外限制；两者关系需法律/维护者确认。即便按 AGPL 处理，复制/修改/网络部署会触发相应源码提供义务，不能直接并入本仓库。
- RVCSVC-API 根目录文件列表**没有 LICENSE**；README 的“仅供学习、研究和个人娱乐”不是标准开源许可。其内嵌 `uvr5/`、`msst/` 代码也没有本仓库的独立许可文件。结论：**不 vendor、不复制、不随发行包分发**。
- 插件 `api.py` 含两段长硬编码字符串和一个访问参数，文件注释带有“偷来的 key”字样；本报告不复述其值。无论其法律性质如何，都不可进入本项目。
- API 的自动下载：`uvr5` 从 ModelScope 下载模型，`msst_backend.py` 从 ModelScope 下载 checkpoint；均无 hash/signature 校验，且 `download_file_openxlab` 有无限重试循环。

## 4. 原工作流与真实 API

```text
用户/AstrBot 命令
  -> 网易云/第三方搜索
  -> 用户按序号选歌 + 模型
  -> 第三方 URL 下载歌曲
  -> UVR5 / MSST 人声分离
  -> RVC/SVC WebUI 推理
  -> EQ/压缩/混响 + 混音
  -> 临时 MP3 路径
  -> AstrBot Record 直接发送
```

与目标链路差异：

```text
Whale Singing (Whale Audio Core)
  -> 本地/已授权 sourceAudioRef
  -> Core Task + 分离/转换/混音
  -> 唯一 audio artifact
  -> Whale Relay 安全投递
```

| 项 | 上游实际 | 目标 |
|---|---|---|
| 音频输入 | `/convert` 接收歌曲 ID/URL，再下载 | Artifact / 本地授权文件 |
| 歌曲搜索 | 第三方在线搜索/下载，无权利校验 | 元数据可搜索，但音频需合法取得 |
| 模型选择 | Gradio 模型文件名，无来源/哈希 | 受控 model manifest + 许可/来源 |
| 直接发送 | 插件 `Record` 发送 | 只产生 Artifact，Relay 投递 |
| 取消 | 客户端超时，无服务端取消 | 明确 cancel + 任务状态 |
| 错误 | 文本/异常/临时路径 | 结构化错误码 + 可恢复状态 |
| 下载 | 自动 UVR/MSST 权重 | 用户确认 + 校验 + 可撤销 |

### 4.1 协议静态结论

- `/show_model`：无参数，返回模型文件名列表（`list[str]`），无版本/哈希/许可元数据。
- `/convert`：至少五个位置参数——歌曲 ID/URL、升降调（-12..12）、人声音量 dB、伴奏音量 dB、模型文件名；上游还有混响/延迟/UVR 选择默认参数。返回值是临时文件路径（Gradio 文件输出），不是结构化结果。
- 插件调用 `/convert` 时只传前五个参数；依赖 Gradio 默认值，非稳定文档契约。
- `/convert` **没有本地文件输入参数**；输入 `song_name_src` 被 `get_response()` 用于 `music.163.com/song?id=`/第三方下载。因此当前上游无法直接满足“用户合法本地音频 Artifact”。
- 无正式 OpenAPI/版本化 schema；字段、默认值、返回路径依赖 Gradio 版本与源码。
- `app.launch(server_name="0.0.0.0", share=True)`：对外监听并启用 Gradio 公网 tunnel；未见认证。
- `app.queue(max_size=40)`：任务队列有限，但无用户级隔离/配额；单个 GPU 可能 OOM。
- 插件管理员命令可设置任意 `rvc_base_url`/`svc_base_url`，无 allowlist；存在 SSRF/任意主机访问风险。
- 插件模型选择来自后端文件名；没有模型/音色/参考音色授权验证。

## 5. 安全、隐私与供应链风险

### Top 10 风险

1. **许可不清/AGPL 冲突**：插件 AGPL 与“仅供学习”声明并存；API 无 LICENSE；直接复用风险高。
2. **硬编码第三方凭据**：插件 `api.py` 含疑似第三方参数/密钥，不能复制；公开仓库已有暴露风险。
3. **公网暴露**：API `0.0.0.0` + `share=True`，无认证；可被局域网/公网调用。
4. **SSRF/任意后端 URL**：管理员可设置任意 RVC/SVC 地址；插件无 allowlist。
5. **自动下载无校验**：UVR/MSST 模型从 ModelScope 下载，无 hash/signature；供应链风险。
6. **版权与隐私**：自动从第三方下载歌曲，未验证授权/隐私/地区条款；文本/音频可能离开设备。
7. **无取消/超时副作用**：客户端超时不会取消服务端 GPU 任务；可能继续占用资源。
8. **输入/输出契约脆弱**：歌曲 ID、模型文件名、临时路径、Gradio 默认值；无版本/错误码。
9. **资源不可控**：4GB VRAM/16GB RAM 只是 README 建议；无 CPU 性能证据，长歌/并发可能 OOM。
10. **直接聊天发送**：插件 `Record` 发送，绕过统一 Relay/目标校验；不可复用。

### 负向/异常矩阵（设计输入）

| # | 场景 | 预期 fail-closed 行为 |
|---|---|---|
| N1 | API 无 LICENSE/许可不明 | `BLOCKED_REUSE`，不复制/vendor |
| N2 | 插件硬编码凭据 | 拒绝导入/复制；报告安全事件 |
| N3 | API 无认证/公网 share | 不接入；仅本机受控 fake |
| N4 | 任意后端 URL | 拒绝非 allowlist；默认 loopback |
| N5 | 输入为本地文件而非 song ID | 当前上游 `UNSUPPORTED_LOCAL_INPUT`；07-B fake 定义本地 Artifact |
| N6 | 无模型/模型未授权 | `MODEL_UNAVAILABLE`/`RIGHTS_UNVERIFIED`，不生成 |
| N7 | 音高/音量越界 | 参数错误，不启动转换 |
| N8 | 歌曲无法合法取得 | 不下载；提示用户提供授权文件 |
| N9 | 分离失败/无伴奏 | 明确 `SEPARATION_FAILED`，不伪造成功 |
| N10 | 推理超时/OOM | `TIMEOUT`/`RESOURCE_EXHAUSTED`，不自动重试 |
| N11 | 取消后服务端继续 | 标记 `CANCEL_REQUESTED`/仍运行风险，不宣称已停止 |
| N12 | 返回任意路径/损坏音频 | Artifact 校验失败，拒绝交付 |
| N13 | 长歌/格式不支持语音气泡 | 仅保存/文件投递，不强制语音气泡 |
| N14 | 云端/付费/隐私未授权 | 拒绝网络/付费调用 |
| N15 | 重复投递/UNKNOWN | 不自动重发；人工确认 |

## 6. Windows / CPU / GPU / 安装矩阵

| 项 | 静态事实 | 证据状态 |
|---|---|---|
| OS | Windows 为主；bat 使用 `venv\Scripts\python.exe` | 静态可见 |
| Python | README 称 3.10+；实际 requirements 未锁 Python | 未实机 |
| PyTorch | 实际 `torch==2.7.1+cu118`、torchaudio/torchvision cu118 | `requirements.txt` |
| CUDA | README 称 CUDA 11.8+；实际 cu118 wheels | 未实机 |
| GPU | 插件 README 推荐 NVIDIA 4GB+ VRAM；API README 建议 4GB RAM | 未实机，不能当保证 |
| CPU | API 支持 `--is_nohalf`，但没有 CPU 性能/质量证据 | `UNKNOWN` |
| 依赖 | `audio-separator[gpu]`、`onnxruntime-gpu`、gradio、pedalboard、librosa、torch 等 | 未安装 |
| 外部 WebUI | 需先启动 RVC 或 so-vits-svc WebUI；SVC 需替换文件/独立目录模式 | 静态说明 |
| 模型 | RVC `.pth` + `.index`；SVC `.pth`/`.json`/diffusion；需按固定目录放置 | 静态说明 |
| 下载 | UVR5 模型约 120MB（README）；MSST 模型自动下载 | 未执行；无 checksum |
| 服务 | `app_rvc.py`/`app_svc.py`、Gradio `0.0.0.0`、share；bat 启动 | 静态可见 |
| 安装器 | 无；需手动 venv/pip/CUDA/WebUI/模型/端口 | **不满足 Novice First** |
| 卸载/升级 | 无；模型/缓存/venv 分散 | `UNVERIFIED` |
| 实际耗时/质量 | 无 | `NOT_RUN` |

**资源结论：** 不能基于 README 宣称 CPU 可用、4GB 足够或整首歌耗时；必须在未来真实机器测试后才能写入用户承诺。

## 7. 与 Whale Audio Core / Relay 的兼容形态

推荐架构（不复制上游）：

```text
Whale Singing UI
  -> Whale Audio Core (TTS/SVC tasks, voice/model/artifact)
      -> original SVC adapter contract
          -> FakeGateway (07-B, offline)
          -> optional user-installed external RVC gateway (later, separately audited)
      -> audio artifact (validated)
  -> Whale Relay Core (target verification + one delivery)
  -> WeChatAgent (identity/authorization)
```

- 上游只作为“外部 Gateway 行为参考”，不是内部实现。
- Core 接受 `sourceAudioRef`（本地/合法授权 Artifact），不接收歌曲 ID 作为唯一输入。
- 模型/音色/分离/混音均由 Core 的 manifest/voice library/任务管理，不让 Gradio 文件名成为公共 ID。
- 结果只返回 Artifact + metadata；不返回临时绝对路径给 UI/Relay。
- 真实外部 Gateway 未来必须单独许可、URL allowlist、认证、超时、取消、配额和供应链审计。

### 7.1 07-B Fake Gateway 输入

必须用 fixture：

```json
{
  "schemaVersion": 1,
  "engine": "RVC_FAKE",
  "sourceAudioRef": "artifact:fixture-vocal-001",
  "targetVoiceProfileId": "fixture-voice-a",
  "params": {
    "pitchShift": 0,
    "vocalGainDb": 0,
    "instrumentalGainDb": 0,
    "separation": "AUTO"
  },
  "output": { "mime": "audio/wav", "sampleRate": 44100, "channels": 1 }
}
```

返回：

```json
{
  "schemaVersion": 1,
  "requestId": "fixture-request-1",
  "artifactRef": "artifact:fixture-output-1",
  "mime": "audio/wav",
  "sampleRate": 44100,
  "durationMs": 1200,
  "delivery": { "state": "PENDING_ROUTER" }
}
```

Fake Gateway 测试（≥10）：

1. 合法本地 Artifact → 成功。
2. 无 sourceAudioRef → `INVALID_SOURCE`。
3. 非音频/损坏 source → `INVALID_AUDIO`。
4. 模型未知 → `MODEL_NOT_FOUND`。
5. 模型权利未确认 → `RIGHTS_UNVERIFIED`。
6. 音高/增益越界 → `INVALID_PARAMS`。
7. 长音频/超限 → `AUDIO_TOO_LONG`，不静默截断。
8. 分离失败 → `SEPARATION_FAILED`，不伪造干声。
9. 超时 → `TIMEOUT`，可取消状态可见。
10. 取消 → `CANCELLED`，不产生“成功” Artifact。
11. 输出损坏 → `INVALID_ARTIFACT`。
12. 返回 `PENDING_ROUTER`；任何 `wechat/send/target` 字段拒绝。
13. 不自动下载模型、不访问网络、不启动进程。
14. 失败不自动重试，尤其 UNKNOWN。

## 8. 新手首次体验（Novice First）

当前上游路径对普通用户不合格：

1. 安装 AstrBot 插件/后端、Python 3.10、CUDA、PyTorch、venv、WebUI、模型文件和 FFmpeg，均需手动。
2. 需编辑 `app_rvc.py` 的 `RVC_API_BASE`、SVC 的 `SVC_API_BASE`，启动多个 bat，理解端口和启动顺序。
3. 需手工放置/重命名 `.pth`、`.index`、`.json`、diffusion 文件，SVC 还需替换文件/切换独立目录模式。
4. 搜索并下载歌曲没有版权/授权确认；模型/音色没有同意流程。
5. 出错只给技术错误/日志，无法在 GUI 内恢复。
6. 后端 API 0.0.0.0/share、无认证，不适合普通用户机器。

未来产品路径（设计，不实施）：

- Whale Singing 首次进入独立依赖弹窗；默认 RVC，展示必需/可选、来源/许可、空间/GPU/CPU、费用/网络。
- 只读检测组件；用户点击“安装所选组件”才进入安装/许可确认；可“稍后再说”。
- 无 GPU 时显示 CPU/远端替代/仅保存；不虚构可用。
- 缺少 RVC/模型时禁用生成，仅允许查看/保存已有 Artifact。
- 失败内联中文解释：模型缺失、空间不足、GPU OOM、音频无权限、分离失败、网络失败；提供重试/切换/返回。
- 不要求终端/Python/JSON；技术细节折叠到“高级详情”。

**至少三条恢复路径：**

1. 依赖未装：稍后再说 → 只读/保存；管理依赖重开。
2. 无 GPU/显存不足：切换已支持的 CPU/远端模式，或仅保存输入/不生成。
3. 模型/音频无授权：停止生成，提示用户提供合法本地文件或选择已授权音色；不自动下载/替代。

## 9. A01–A14 验收矩阵

| ID | 结果 | 证据 |
|---|---|---|
| A01 上游锁定 SHA/许可矩阵 | **PASS** | 三个 pinned commit；插件 AGPL-3.0；API 无 LICENSE；RVC MIT/SoVITS AGPL/Seed-VC GPL-3.0 archived；证据 URL/源码 |
| A02 原工作流静态还原 | **PASS** | 搜索 → 下载 → UVR/MSST → RVC/SVC → 后处理/混音 → 临时文件 → Record |
| A03 真实 API 契约 | **PASS（静态）** | `/show_model` list；`/convert` 5+ 参数、返回路径；Gradio，无版本化 schema |
| A04 本地授权音频输入 | **BLOCKED** | `/convert` 只收 song ID/URL，无本地音频参数；07-B 必须自建 Artifact 接口 |
| A05 组件许可证/权利 | **PASS（有 UNVERIFIED）** | 表格逐项；API/vendor/权重/歌曲/声音权利不明确 |
| A06 Fake Gateway 设计 | **PASS** | 本地 Artifact、参数、Artifact 返回、PENDING_ROUTER；不含真实模型 |
| A07 Windows/CPU/GPU/依赖 | **PASS（静态）** | 手动 Python/CUDA/WebUI/模型/bat；4GB/16GB 未实机；CPU 为 UNKNOWN |
| A08 依赖检测/UNKNOWN | **PASS（设计）** | 组件/模型/来源/资源/许可逐项；不可检测即 UNKNOWN |
| A09 负向测试/Top10 | **PASS** | N1–N15 + Top10 |
| A10 Novice First | **PASS（设计）** | 独立首次弹窗、四条路径、三条恢复；当前上游不满足 |
| A11 文档范围/隐私 | **PASS** | 仅本文件；无模型/音频/私钥；不复制硬编码凭据 |
| A12 Diff/Markdown/编码/CI | **PASS（本地）** | 见第 10 节；PR 最新 CI 另核 |
| A13 main/#16–#18/生产 | **PASS** | 未修改 main、PR #16/#17/#18、服务、模型、微信 |
| A14 下游建议/停止条件 | **PASS** | `APPROVE_FAKE_ADAPTER_DESIGN`；不直接集成；07-B 只 Fake |

## 10. 检查、PR 与未运行项

本地执行（仅文档）：

```text
git diff --check
Markdown/UTF-8 integrity test
```

- 本研究分支只新增 `docs/SVC_PROVIDER_RESEARCH.md`。
- 未运行 Node/UI 测试，因为未改工程代码；这不是 RVC 验证。若需要仓库通用文档检查，另行使用现有测试。
- 未运行真实 Windows、GPU、CPU、模型、试听、微信或 UI 测试。
- PR/CI 以最终 docs-only PR 的实际 HEAD 为准；不得沿用旧 run。

## 11. 唯一建议

**`APPROVE_FAKE_ADAPTER_DESIGN`**：允许进入 07-B 的原创 Fake Adapter 设计与隔离测试，禁止：

- 复制/修改/内嵌 AstrBot 插件或 RVCSVC-API 源码；
- vendor `uvr5/`、`msst/` 或模型权重；
- 接入真实 RVC/Seed-VC/GPU、自动下载歌曲/权重、付费 API；
- 直接使用上游 `Record` 发送、0.0.0.0/share 服务或无认证 API；
- 宣称 RVC/SVC 已可用、已安装或 INTEGRATED。

**硬停止条件：** 任何需要真实安装、模型下载、GPU 推理、歌曲下载、凭据、生产写入、微信发送、合并 PR 或 Force Push 的动作，立即停止并等待单独授权。

## 12. 来源链接（pinned）

- 插件：<https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/tree/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d>
- 插件 LICENSE：<https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/LICENSE>
- API：<https://github.com/CCYellowStar2/RVCSVC-API/tree/274572c320147977a18dc0028e45f79da136a6e2>
- API README：<https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/README.md>
- Seed-VC：<https://github.com/Plachtaa/seed-vc/tree/51383efd921027683c89e5348211d93ff12ac2a8>
- RVC WebUI：<https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI>
- UVR5：<https://github.com/Anjok07/ultimatevocalremovergui>
- MSST：<https://github.com/ZFTurbo/Music-Source-Separation-Training>
- so-vits-svc：<https://github.com/svc-develop-team/so-vits-svc>

## 13. 未决问题

1. RVCSVC-API 的维护者是否能提供明确 LICENSE/再分发许可？
2. 上游插件 README 的“仅供学习”与 AGPL-3.0 的关系需法律确认。
3. 是否允许外部 RVC Gateway 作为“用户自行安装”的可选依赖，仍需未来 07-B/Plan 14 设计。
4. RVC 模型/音色的训练数据与真人声音同意如何验证？
5. Windows CPU/GPU 资源、长歌、取消/并发、真实输出质量均未实测，不能承诺。
6. 歌曲元数据搜索/下载的版权与平台条款需后续合规审查，默认不自动化。
