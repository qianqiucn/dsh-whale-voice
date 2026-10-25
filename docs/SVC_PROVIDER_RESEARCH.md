# Plan 07-A · RVC 上游许可、API 与 Windows 依赖静态审计

**状态：** `RESEARCH-OFFLINE` / `REVIEW_REQUIRED`（F01 修订后）
**日期：** 2026-10-25
**执行者：** DeepSeek
**唯一工程交付：** 本文件；不修改代码、配置、模型、PR #16/#17/#18 或 `docs/plans/`
**结论：** `APPROVE_FAKE_ADAPTER_DESIGN`，同时 `BLOCKED_CODE_REUSE` / `BLOCKED_DIRECT_API_INTEGRATION`
**未执行：** 真实模型、RVC/SVC 推理、音频下载、GPU、Windows 安装、微信、付费 API、生产服务

> 本文件是静态研究，不是法律意见，也不是上游可用性承诺。`UNVERIFIED` 不是“无许可”，也不是“已获许可”；`PASS` 只表示研究任务已交付可靠证据。

---

## 0. 执行前基线（A01 证据）

| 项 | 本轮核验值 |
|---|---|
| `main` | `bf9cf66807e12d0b25872a0fa3869962dde04818` |
| PR #16 | OPEN，**未合并**，HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`，22 files，**0 reviews**，CI `40165832178` SUCCESS |
| PR #17 | 规划分支 `docs/whale-voice-execution-plan-registry`，HEAD `90391c3de9e90e26ede43186194b8d7de838be49`，OPEN |
| PR #18 | OPEN/Draft，HEAD `42cec57ae7018735cb6c65a4ef8b0a1d80473810`，历史资料，不合并 |
| 研究分支 | `research/plan07a-rvc-upstream-audit` |
| 研究 PR | **#19**，HEAD 由本轮文档提交更新；base `main` |
| 本轮唯一文件 | `docs/SVC_PROVIDER_RESEARCH.md` |

PR #16 仍 **OPEN / DESIGN / OFFLINE**；03-B 仍为 `WAIT_USER_AUTHORIZATION`。PR #19 的 CI 成功不代表 RVC/SVC 功能可用。

## 1. 结论先行

**可批准 07-B 的原创 Fake Adapter 设计；不可把上游插件或 RVCSVC-API 直接复制、vendor、内嵌或作为生产依赖。**

阻断直接复用的核心原因：

1. AstrBot 插件 LICENSE 为 **AGPL-3.0**，但 README 又声明“仅供学习和研究、请勿商业用途”；两者关系需法律/维护者审查。
2. RVCSVC-API 根目录**未发现 LICENSE 文件**；README 只有限制性“学习/研究/个人娱乐”声明。公开可读不等于可以复制/再分发，判为 `UNVERIFIED_RIGHT_TO_REUSE`。
3. 插件 `api.py` 第 6–7 行含疑似第三方请求参数/凭据常量；本报告不复制其值，且该文件不能作为可复用实现。
4. RVCSVC-API 的 `/convert` 接收**歌曲 ID/URL**并下载，不接受本地授权音频 Artifact；与 Whale Audio Core 的本地素材/授权/Artifact 模型不兼容。
5. API 以 `0.0.0.0` + Gradio `share=True` 启动，已审文件未见认证；存在暴露风险。
6. API 自动下载 UVR5/MSST 模型，无 checksum/用户确认；不满足 Novice First 和供应链安全。
7. 无服务端取消、无稳定结构化错误、无音频时长/格式契约、无模型/音色权利验证；真实 Windows/GPU 行为未测试。

**状态分层：**

- 研究交付：**PASS**（证据已补齐）。
- 上游直接代码复用：**BLOCKED_CODE_REUSE**。
- 上游当前 API 直接接入：**BLOCKED_DIRECT_API_INTEGRATION**。
- 上游本地 Artifact 输入能力：**UPSTREAM_BLOCKED**（能力缺失，不是审计失败）。
- 真实 Provider/SVC/Windows：**UNVERIFIED / NOT_RUN**。

## 2. 上游锁定版本

| 组件 | 仓库 | 本轮锁定 |
|---|---|---|
| AstrBot 插件 | `CCYellowStar2/astrbot_plugin_rvc_svc` | `0b84e382927e088b9f4f10ce09ea1e4175bb0d8d`（2025-10-24） |
| RVCSVC-API | `CCYellowStar2/RVCSVC-API` | `274572c320147977a18dc0028e45f79da136a6e2`（2026-07-11） |
| Seed-VC | `Plachtaa/seed-vc` | `51383efd921027683c89e5348211d93ff12ac2a8`；仓库已归档；GPL-3.0 |
| RVC WebUI | `RVC-Project/Retrieval-based-Voice-Conversion-WebUI` | MIT（仓库元数据；具体版本/权重另核） |
| UVR5 | `Anjok07/ultimatevocalremovergui` | MIT（仓库元数据；整合包内 vendor 代码另核） |
| MSST | `ZFTurbo/Music-Source-Separation-Training` | MIT（仓库元数据；整合包内 vendor 代码另核） |
| so-vits-svc | `svc-develop-team/so-vits-svc` | AGPL-3.0（仓库元数据；仅接口候选） |

## 3. 固定源码证据表（F02）

> 凭据类只给文件和函数位置，**不复制字符串**。`#L` 链接均固定在锁定的 commit 上。

| ClaimId | 技术断言 | upstreamRepo@SHA | exactFile#Lstart-Lend | sourcePermalink | evidenceType | finding | unknownOrLimits |
|---|---|---|---|---|---|---|---|
| C01 | 插件代码许可为 AGPL-3.0 | `astrbot_plugin_rvc_svc@0b84e382` | `LICENSE#L1-L20` | <https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/LICENSE#L1-L20> | license text | AGPL-3.0 header | 是否适用于所有子文件需逐文件核 |
| C02 | README 另加“仅供学习/研究、勿商用”限制 | `astrbot_plugin_rvc_svc@0b84e382` | `README.md#L170-L172` | <https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/README.md#L170-L172> | README | 与 AGPL 的关系不清楚 | 非标准许可声明；需法律审查 |
| C03 | RVCSVC-API 根目录无 LICENSE | `RVCSVC-API@274572c3` | 根文件列表无 `LICENSE` | <https://github.com/CCYellowStar2/RVCSVC-API/tree/274572c320147977a18dc0028e45f79da136a6e2> | tree listing | 未发现明确代码许可文件 | 不等于无任何授权条款；整库权利未明 |
| C04 | API README 仅限制性使用声明 | `RVCSVC-API@274572c3` | `README.md#L281-L283` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/README.md#L281-L283> | README | 仅学习/研究/个人娱乐 | 不是 SPDX 许可；不可当开源许可 |
| C05 | 插件含疑似第三方参数/凭据常量 | `astrbot_plugin_rvc_svc@0b84e382` | `api.py#L6-L7` | <https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/api.py#L6-L7> | source/security | 两段长硬编码字符串，文件注释含第三方来源表述 | **值不复制、不复用**；无法确认是否有效或授权 |
| C06 | 插件直接通过 Record 发送 | `astrbot_plugin_rvc_svc@0b84e382` | `main.py#L303-L314` | <https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/main.py#L303-L314> | source | `/convert` 结果路径直接 `Record` 发送 | 绕过统一 Relay/目标复核 |
| C07 | RVC 的 `/show_model` 暴露未被证实；SVC 有绑定 | `RVCSVC-API@274572c3` | `app_rvc.py#L76-L85`、`app_rvc.py#L434-L446`；`app_svc.py#L459-L463` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L434-L446> | source | RVC 仅见 `convert` 的 `api_name`；未见 `show_model` 绑定；SVC 明确绑定 `show_model` | 不能确认 RVC `/show_model` 可用；插件调用见 C15 |
| C08 | `/convert` 参数、歌曲 ID/URL 输入、音频输出组件 | `RVCSVC-API@274572c3` | `app_rvc.py#L214-L231`、`#L251`、`#L440-L446` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L440-L446> | source | 参数为 `song_name_src,key_shift,vocal_vol,inst_vol,model_dropdown,...`；无本地文件输入；API 输出为隐藏 `gr.Audio` 文件路径 | 本地授权 Artifact 不支持；文件路径不是结构化 Artifact |
| C09 | 歌曲经第三方 URL 下载 | `RVCSVC-API@274572c3` | `app_rvc.py#L32-L50`、`#L164-L182` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L32-L50> | source | `biliplayer.91vrchat.com`、`api.vkeys.cn`；`requests` 超时/重定向 | 版权/隐私/条款未核；不可自动调用 |
| C10 | 长于 5 分钟自动截断 | `RVCSVC-API@274572c3` | `app_rvc.py#L164-L182` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L164-L182> | source | 超过 5 分钟只保留前 300000 ms，未返回明确错误 | 静默截断；不满足长歌契约 |
| C11 | API 以 0.0.0.0 + share=True 启动 | `RVCSVC-API@274572c3` | `app_rvc.py#L458-L459`；`app_svc.py#L538-L539` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L458-L459> | source | 公网 tunnel、LAN 监听；已审文件未见认证 | 不能推定整个项目永无认证；需安全审查 |
| C12 | UVR5 启动自动下载 | `RVCSVC-API@274572c3` | `app_rvc.py#L117-L138` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L117-L138> | source | `download_file_openxlab` 重试并写模型目录 | 未执行下载；无 checksum |
| C13 | MSST checkpoint 自动下载无 hash | `RVCSVC-API@274572c3` | `msst_backend.py#L14-L16`、`#L44-L61` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/msst_backend.py#L44-L61> | source | `urlopen` 写 `.part`，仅检查非空，无签名/hash | 供应链风险；未执行 |
| C14 | Python/CUDA/torch 依赖版本 | `RVCSVC-API@274572c3` | `requirements.txt#L1-L10`；`README.md#L33-L35` | <https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/requirements.txt#L1-L10> | requirements/README | `torch==2.7.1+cu118`、torchaudio/torchvision、`onnxruntime-gpu`、`audio-separator[gpu]`；README 称 Python 3.10+/CUDA 11.8+/4GB RAM | README 与 requirements 版本不一致；CPU/GPU 实测 UNKNOWN |
| C15 | 插件模型刷新/转换调用链 | `astrbot_plugin_rvc_svc@0b84e382` | `main.py#L78-L80`、`#L303-L314` | <https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/main.py#L303-L314> | source | `/show_model`、`/convert`，只传歌曲 ID + 模型名 | RVC `/show_model` 未证实；无本地 Artifact |
| C16 | Seed-VC 归档与 GPL-3.0；歌声模型约 200M | `seed-vc@51383efd` | `LICENSE#L1-L20`、`README.md#L8`、`#L44` | <https://github.com/Plachtaa/seed-vc/blob/51383efd921027683c89e5348211d93ff12ac2a8/LICENSE#L1-L20> | license/README | GPL-3.0；1–30 秒参考；Tiny 25M 是语音，44.1k 歌声模型约 200M | 仓库 archived；未运行，不宣传低显存/CPU |
| C17 | RVC/SoVITS/UVR/MSST 外部许可 | 外部仓库 | 仓库元数据 | <https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI> | repo metadata | RVC MIT；SoVITS AGPL-3.0；UVR/MST MIT | 具体版本、vendor 代码、模型权重未逐一核；FFmpeg 构建许可 UNVERIFIED |

## 4. 许可与权利矩阵（A03/A05）

> 本表是证据矩阵，不是法律意见。

| component | 代码权利 | 模型/权重权利 | 音频/声音权利 | 复用结论 |
|---|---|---|---|---|
| AstrBot 插件 | AGPL-3.0；README 附加学习/非商用声明 | 不含权重 | 未处理 | **BLOCKED_CODE_REUSE** |
| RVCSVC-API | 根目录无 LICENSE；README 限制性声明 | 未提供权重；自动下载 | 未处理 | **UNVERIFIED_RIGHT_TO_REUSE** |
| 插件 `api.py` | 同插件；含疑似第三方秘密常量 | 不适用 | 不适用 | 禁止复用该文件 |
| RVC WebUI | MIT（元数据） | RVC 模型另核 | 用户音色/音频授权另核 | 可作外部候选 |
| so-vits-svc | AGPL-3.0 | 模型/扩散权重另核 | 声音授权另核 | 仅接口候选 |
| Seed-VC | GPL-3.0；archived | 零样本权重另核 | 参考音频需同意 | 后续可选，不首装 |
| UVR5 / MSST | 上游 MIT；API 内 vendor 代码无本仓库许可文件 | 分离模型另核 | 输入歌曲版权另核 | 不复制 vendor 代码 |
| FFmpeg | 依构建 LGPL/GPL | 不适用 | 媒体权利另核 | 具体构建 **UNVERIFIED** |
| 歌曲源/API | 服务条款未核 | 不适用 | 下载/改编/传播权利未核 | 默认禁止自动下载 |
| 模型/参考音色 | 无统一许可 | 用户自备权利未知 | 真人同意未知 | 必须记录授权 |

**关键许可事实：**

- 插件根目录有完整 AGPL-3.0 文本（C01），README 又有额外限制（C02）；两者不可简单合并解释。
- API 根目录无 LICENSE（C03），README 仅是限制性说明（C04）；其内嵌 `uvr5/`、`msst/` 也没有独立许可文件。
- 插件 `api.py` L6-L7 的疑似凭据/参数常量属于直接阻断项；本报告不复述其值（C05）。
- RVC/SoVITS/UVR/MST 的仓库元数据不能替代对具体版本、vendor 代码和模型权重的逐项核验；未核部分一律 `UNVERIFIED`（C17）。

## 5. 原工作流与真实 API（A04）

```text
AstrBot 命令
  -> 网易云/第三方搜索
  -> 用户选歌 + 模型
  -> 第三方 URL 下载歌曲
  -> UVR5 / MSST 分离
  -> RVC/SVC WebUI 推理
  -> EQ/压缩/混响/混音
  -> 临时 MP3 路径
  -> AstrBot Record 直接发送
```

### 5.1 `/show_model`

- SVC：`app_svc.py#L459-L463` 明确 `api_name="show_model"`。
- RVC：`app_rvc.py#L76-L85` 定义 `show_model()`；但在已审 Blocks 绑定区 `#L434-L446` 只看到 `convert` 的 `api_name`，没有 `show_model` 的 `api_name` 绑定。
- 插件却对 RVC/SVC 都调用 `/show_model`（`main.py#L78-L80`）。
- 结论：**RVC 的 `/show_model` 端点能力未证实/可能缺失**，不能按 README 或插件代码假定可用；需 `SOURCE_LINE_UNVERIFIED`/运行时验证（本轮未运行）。

### 5.2 `/convert`

- 签名：`app_rvc.py#L214`：

```text
convert(song_name_src, key_shift, vocal_vol, inst_vol,
        model_dropdown, reverb_intensity, delay_intensity,
        uvr_choice="VR-HP5 (默认)")
```

- 参数含义（源码可见）：歌曲 ID/URL、半音升降、人声音量 dB、伴奏音量 dB、模型文件名、混响、延迟、分离模型。
- 输出：Gradio 文件路径；不是结构化 `{artifactRef,mime,...}`。
- 绑定：`app_rvc.py#L442-L446` 的隐藏 API 按钮 `api_name="convert"`；SVC 对应 `app_svc.py#L522-L526`。
- 无正式 OpenAPI；无稳定版本号；依赖 Gradio 默认参数。

### 5.3 本地 Artifact 能力缺口

- `convert` 只接受 `song_name_src`；`app_rvc.py#L224-L231` 对空值报错，对 http(s) 链接只提取 `id=`，否则当作歌曲 ID。
- `#L243-L251`：命中缓存则读缓存，否则调用 `wwy_downloader()` 下载。
- `wwy_downloader` 调用 `get_response()`（`#L32-L50`）从第三方 URL 下载音频。
- **没有任何本地文件路径/Artifact 参数**。
- 结论：**`UPSTREAM_BLOCKED`（本地授权音频能力）**；这不是静态审计失败，而是 07-B 必须自建本地 Artifact 兼容层的原因。

### 5.4 歌曲下载与截断

- `get_response()` 使用 `biliplayer.91vrchat.com`，备用 `api.vkeys.cn`（`#L32-L50`）。
- 下载失败只抛文本异常；没有权利/地区/付费/DRM 判断。
- `wwy_downloader` 对超过 5 分钟的音频只截取前 300000 ms（`#L164-L182`），没有明确用户错误。
- 这不是“支持任意长度歌曲”的能力证据。

### 5.5 公网暴露、队列、取消

- `app_rvc.py#L458-L459`：`app.queue(max_size=40, api_open=False)`；`app.launch(server_name="0.0.0.0", share=True, show_error=True)`。
- `app_svc.py#L538-L539`：相同 `0.0.0.0` + `share=True`，端口 7866。
- 已审文件未见认证配置；`api_open=False` 不是认证。
- 已审文件未见 `job.cancel`/服务端取消路径；插件只有客户端 `timeout`（`main.py#L303-L312`）。
- 客户端超时可能只停止等待，不能证明 GPU 任务已停止。
- 这是“已审文件未见”，不是对整个项目做绝对否定。

### 5.6 自动下载

- UVR5：`download_file_openxlab()` 在启动时调用，从 ModelScope 下载 5_HP-Karaoke-UVR（`app_rvc.py#L117-L138`）。
- MSST：`msst_backend.py#L14-L16` 固定 ModelScope checkpoint URL；`#L44-L61` 写 `.part`、仅检查非空，无 hash/signature。
- 两者都没有用户确认/取消/校验和；不满足供应链安全。

## 6. 风险 Top 10 与负向矩阵（A09）

### Top 10

1. **许可不清/AGPL 冲突**：插件 AGPL 与 README 限制并存；API 无 LICENSE。
2. **硬编码疑似凭据**：插件 `api.py#L6-L7`；不复制、不复用。
3. **公网暴露**：API `0.0.0.0` + `share=True`，已审文件无认证。
4. **SSRF/任意后端 URL**：插件管理员可设置任意 RVC/SVC 地址，无 allowlist。
5. **自动下载无校验**：UVR/MSST 模型无 hash/signature。
6. **版权与隐私**：第三方歌曲源，无授权/条款/地区校验。
7. **无服务端取消**：客户端超时不终止 GPU 任务。
8. **输入/输出契约脆弱**：歌曲 ID、模型文件名、临时路径、Gradio 默认值。
9. **资源不可控**：4GB VRAM/16GB RAM 只是 README 建议；CPU/长歌/并发未实测。
10. **直接聊天发送**：插件 `Record` 绕过 Relay/目标复核。

### N1–N15

| # | 场景 | 预期 fail-closed |
|---|---|---|
| N1 | API 无 LICENSE/许可不明 | `BLOCKED_REUSE`，不复制/vendor |
| N2 | 插件硬编码疑似凭据 | 拒绝复用；安全事件报告 |
| N3 | API 无认证/公网 share | 不接入；仅本机受控 fake |
| N4 | 任意后端 URL | 拒绝非 allowlist；默认 loopback |
| N5 | 本地文件而非 song ID | `UPSTREAM_BLOCKED`；07-B 用本地 Artifact |
| N6 | 无模型/未授权模型 | `MODEL_UNAVAILABLE`/`RIGHTS_UNVERIFIED` |
| N7 | 音高/增益越界 | 参数错误，不启动转换 |
| N8 | 歌曲无法合法取得 | 不下载；提示提供授权文件 |
| N9 | 分离失败/无伴奏 | `SEPARATION_FAILED`，不伪造成功 |
| N10 | 超时/OOM | `TIMEOUT`/`RESOURCE_EXHAUSTED`，不自动重试 |
| N11 | 取消后服务端继续 | 标记风险，不宣称已停止 |
| N12 | 返回任意路径/损坏音频 | Artifact 校验失败，拒绝交付 |
| N13 | 长歌/格式不支持语音气泡 | 仅保存/文件投递，不强制语音气泡 |
| N14 | 云端/付费/隐私未授权 | 拒绝网络/付费调用 |
| N15 | 重复投递/UNKNOWN | 不自动重发；人工确认 |

## 7. Windows 依赖与组件 Manifest（A08 / F04）

### 7.1 现有环境事实

| 项 | 静态事实 | 证据状态 |
|---|---|---|
| OS | Windows 优先；bat 用 `venv\Scripts\python.exe` | 静态 |
| Python | README 称 3.10+；未锁 Python | UNVERIFIED |
| PyTorch | 实际 `torch==2.7.1+cu118`、torchaudio/torchvision cu118 | C14 |
| CUDA | README 称 CUDA 11.8+ | UNVERIFIED |
| GPU | 插件 README 建议 NVIDIA 4GB+ VRAM；API README 称至少 4GB RAM | README 建议，不是实测保证 |
| CPU | `--is_nohalf` 存在；无 CPU 性能/质量证据 | UNVERIFIED |
| 外部 WebUI | 需先启动 RVC 或 so-vits-svc；SVC 需替换文件/独立目录 | 文档/源码 |
| 模型 | RVC `.pth`+`.index`；SVC `.pth`/`.json`/diffusion | 文档 |
| 安装器 | 无；手动 venv/pip/CUDA/WebUI/模型/端口 | 不满足 Novice First |
| 卸载/升级 | 无完整方案 | UNVERIFIED |
| 真实耗时/质量 | 无 | NOT_RUN |

### 7.2 未来 UI 逐组件 Manifest

> 这不是已实现 API，只是未来首访弹窗/安装器的设计输入。当前上游插件/API 不能作为默认“一键安装源”。

| componentId | 中文显示名 / 用途 | 阶段 | 必需性 | 探测方式及可信证据 | 可复用现有 | 来源/许可/权重 | 资源/磁盘/CPU/GPU/VRAM | 自动安装 | 必须确认 | 中文失败恢复 | 后续 Plan |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `core-audio` | 鲸音核心 / 任务、音色、Artifact、模型 | 生成 | REQUIRED | Core 只读能力/loaded revision | 是 | 本项目 | 本机资源 UNKNOWN | 不适用 | 无 | 重开依赖检查/查看状态 | Plan 05/08 |
| `rvc-voice-model` | RVC 音色模型 / 目标声线 | 生成 | REQUIRED（RVC） | 文件存在+格式/元数据+用户选择 | 用户自备 | 模型许可/训练数据/声音同意 UNKNOWN | 文件大小/显存 UNKNOWN | **否**（无默认下载） | 使用授权/真人声音同意 | 提供有权文件/换音色/取消 | Plan 07-B/12 |
| `external-rvc-gateway` | 外部 RVC Worker/Gateway / 真实推理 | 生成 | REQUIRED（真实 RVC） | 本机回环健康、版本、模型列表、能力 | 用户自行安装 | 当前 API/插件许可不明；**不默认安装** | Python/CUDA/GPU/VRAM UNKNOWN | **否**（当前不可自动安装） | 安装来源/许可/端口/资源 | 重新检测/查看安装说明/仅保存 | Plan 07-B/14 |
| `python-runtime` | Python/CUDA/PyTorch 运行时 / 外部 Gateway 依赖 | 生成 | CONDITIONAL（仅外部 Gateway） | 只读版本探测 | 可复用用户环境 | Python/CUDA/torch 许可与版本另核 | 版本/磁盘/GPU UNKNOWN | **否**（不作为普通用户步骤） | 版本/来源/驱动 | 查看要求/换已验证模式 | Plan 14 |
| `rvc-webui` | RVC WebUI / 原版推理服务 | 生成 | CONDITIONAL（外部方案） | 端口/健康/模型列表 | 用户自行安装 | MIT；权重另核 | GPU/VRAM/磁盘 UNKNOWN | **否** | 来源/模型/端口 | 重新检测/查看说明/返回 | Plan 14 |
| `separator` | 人声分离器 / 分开主唱与伴奏 | 预处理 | CONDITIONAL（纯人声可跳过） | 运行健康/模型存在 | 可复用 | UVR/MST MIT；vendor/模型另核 | 磁盘/CPU/GPU UNKNOWN | **否**（当前自动下载不可接受） | 模型来源/许可/空间 | 跳过分离/换模式/仅保存 | Plan 08/12 |
| `ffmpeg-encoder` | 音频编码/处理 / 格式转换 | 输出 | CONDITIONAL（方案需要时） | 版本/路径/能力探测 | 可复用 | FFmpeg 构建 LGPL/GPL UNVERIFIED | 磁盘 UNKNOWN | 需受审安装器 | 构建/许可/来源 | 更换输出/仅保存 WAV | Plan 14 |
| `preview-save` | 试听/保存 / 本地 Artifact | 输出 | REQUIRED | 本地文件/Artifact 状态 | 是 | 本项目 | 磁盘 UNKNOWN | 不适用 | 保存位置/覆盖 | 重试/更改目录/取消 | Plan 08/09 |
| `relay` | Whale Relay（鲸递）/ 安全单次投递 | 发送 | DELIVERY_ONLY | 目标/授权/后端能力 | 现有 UI Automation | 本项目/Relay 预算 | 网络/目标 UNKNOWN | 不适用 | 目标与发送授权 | 取消发送/仅保存/重试需人工 | Plan 13 |
| `wechatagent` | WeChatAgent / 微信身份与授权 | 发送 | DELIVERY_ONLY | 版本/连接/授权证据 | 必需外部平台 | sourcepro5/WeChatAgent 另核 | 网络/账号 UNKNOWN | 否 | 账号/会话/发送权限 | 检查连接/返回/取消 | Plan 13 |
| `voice-sender` | Voice Sender / Windows UI Automation | 发送 | DELIVERY_ONLY | 进程/健康/版本/目标 | 现有组件 | 本项目 | 音频设备 UNKNOWN | 不适用 | 设备/目标/发送 | 检查设备/仅保存/取消 | Plan 13 |
| `seed-vc` | Seed-VC 免训练试唱 / 后续可选 | 生成（未来） | OPTIONAL / NOT_READY | 固定模型+参考音频授权 | 否 | GPL-3.0；archived；权重另核 | 200M 歌声模型；资源 UNKNOWN | **否**（不首装/不下载） | 参考音频同意/许可 | 查看说明/返回 RVC/取消 | Plan 12-D |

**Manifest 结论：**

- RVC 是首发主线；Seed-VC 是后续可选，不能标低显存/CPU 可用。
- 当前 RVCSVC-API/插件不能作为默认自动安装源；无安全渠道则标 `NOT_INSTALLABLE`。
- 所有资源/性能未实测处只能显示 `UNKNOWN`，不得给出虚假显卡/CPU 承诺。
- 保存输入文件 ≠ 生成成功 Artifact；生成 ≠ 已发送。

## 8. 三层契约映射（F03 / A06）

### 8.1 三层定义

| 层 | 名称/状态 | 作用 | 允许字段/说明 |
|---|---|---|---|
| A | CoverTask 草稿（未来 Plan 05/08） | 歌曲翻唱任务，可含分离/混音/伴奏 | `sourceAudioRef`、`targetVoiceProfileId`、`pitchShift`、`formantShift`、`conversionStrength`、`separationMode`、`vocalGainDb`、`instrumentalGainDb`、`mix`、`outputFormat` 等；**PROPOSED，未实现** |
| B | PR #16 SVC v1（真实纯契约，未合并 main） | SVC 请求/结果边界 | 请求：`sourceAudioRef,targetVoiceId,pitchShift,formantShift,conversionStrength,outputFormat?`；结果：`requestId,targetVoiceId,artifactRef,mime,sampleRate,durationMs`（`createdAt` 可选） |
| C | 07-B Fake Gateway（现在仅设计） | 隔离模拟 RVC/SVC，不运行真实模型 | 内部 `engine=RVC_FAKE`；对外只把 B 层字段交给 v1，不把 CoverTask 嵌套字段直接塞入 |

### 8.2 B 层源码事实

请求（`core/svc/svc-contract.mjs#L20,L53-L87`，PR #16 HEAD `954a01a`）：

```text
sourceAudioRef: string, opaque ref pattern
targetVoiceId: string, shared voice id pattern
pitchShift: finite, -24..24
formantShift: finite, -1..1
conversionStrength: finite, 0..1
outputFormat?: audio/* (optional)
unknown top-level fields -> SVC_INVALID_REQUEST
```

结果（`#L94-L128`）：

```text
requestId: non-empty string
targetVoiceId: valid voice id
artifactRef: opaque ref
mime: audio/*
sampleRate: integer 8000..192000
durationMs: integer >= 0
delivery?: if present, must be PENDING_ROUTER
```

- 成功结果由 `normalizeSvcResult` 自己生成 `delivery: {state:"PENDING_ROUTER"}`。
- 输入带 `send`/`wechat` 或非法 `delivery` -> `SVC_DELIVERY_NOT_PROVIDER`。
- `PENDING_ROUTER` **只表示等待共享路由**，不是发送权限、已提交、已收到或自动发送。
- `requestId` 不在 v1 请求字段中；它必须由 Core/任务尝试的外部关联提供，不能作为请求字段硬塞。

**合法 v1 请求示例（文档示例，不改源码）：**

```json
{
  "sourceAudioRef": "artifact:fixture-vocal-001",
  "targetVoiceId": "fixture-voice-a",
  "pitchShift": 0,
  "formantShift": 0,
  "conversionStrength": 1,
  "outputFormat": "audio/wav"
}
```

**合法结果示例（归一化后补齐 `targetVoiceId`，不包含 `send`/`wechat`）：**

```json
{
  "requestId": "fixture-request-1",
  "targetVoiceId": "fixture-voice-a",
  "artifactRef": "artifact:fixture-output-1",
  "mime": "audio/wav",
  "sampleRate": 44100,
  "durationMs": 1200
}
```

旧版研究中的 Fake 示例是 CoverTask 草稿 envelope，**不能原样作为 v1 请求**；其 `targetVoiceProfileId` 必须经层 A 映射，且结果不能缺 `targetVoiceId`。

### 8.3 CoverTask/Fake -> v1 映射

| 来源字段 | v1 字段 | 处理 |
|---|---|---|
| `targetVoiceProfileId` | `targetVoiceId` | 仅在 Plan 05/08 有共享 voice identity 映射时转换；**不自动假定跨模型音色资产互通** |
| `params.pitchShift` | `pitchShift` | 范围 -24..24；上游 RVC 界面 -12..12，适配器应拒绝/显式限制，不能静默改写 |
| `params.formantShift` | `formantShift` | v1 接受 -1..1；真实 RVC 是否有等价能力 **UNVERIFIED**，需版本化适配 |
| `params.conversionStrength` | `conversionStrength` | v1 接受 0..1；真实 RVC 无直接参数时需 adapter 明确 `NEEDS_VERSIONED_CONTRACT_IN_PLAN05_08` |
| `params.vocalGainDb` | — | **不进入 v1**；留在 CoverTask/Mixer（Plan 08/12） |
| `params.instrumentalGainDb` | — | **不进入 v1**；留在 CoverTask/Mixer |
| `params.separation` | — | **不进入 v1**；留在 Separator/CoverTask |
| `output.outputFormat` | `outputFormat` | 可选 `audio/*`；缺省由 Core/Adapter 决定 |
| `requestId`（结果） | `requestId` | 不在请求字段；由 Core/Task 关联/尝试 ID 提供 |
| `engine` / `params` / `output` envelope | — | **不进入 v1**；属于 Fake/CoverTask 内部封装 |
| `channels`（若出现） | — | `normalizeSvcResult` 不输出 `channels`；不能冒充 v1 归一化字段 |

### 8.4 六个以上文档级判断案例

| # | 输入/调用器 | 预期 |
|---|---|---|
| 1 | 合法 v1 请求（六字段，含/不含 outputFormat） | `validateSvcRequest` PASS；只返回允许字段 |
| 2 | 原裸 Fake 草稿 `{engine,targetVoiceProfileId,params,output}` 直接传 v1 | `SVC_INVALID_REQUEST`（`engine`/`targetVoiceProfileId`/`params`/`output` 均未知字段） |
| 3 | 在 v1 请求加入 `vocalGainDb` | `SVC_INVALID_REQUEST`（混音参数不属于 v1） |
| 4 | 结果缺 `targetVoiceId` | `SVC_UNSUPPORTED_VOICE`（源码如此；不是 `INVALID_RESULT`） |
| 5 | 结果带 `send`/`wechat` | `SVC_DELIVERY_NOT_PROVIDER` |
| 6 | 结果带 `delivery:{state:"PENDING_ROUTER"}` | 合法；归一化输出仍为 `PENDING_ROUTER`，不发送 |
| 7 | 结果带 `delivery:{state:"SENT"}` | `SVC_DELIVERY_NOT_PROVIDER` |
| 8 | 结果缺 `artifactRef` | `SVC_INVALID_RESULT` |

## 9. 与 Whale Audio Core / Relay 的兼容形态

```text
Whale Singing
  -> Whale Audio Core：CoverTask、音色、模型、Artifact、分离/转换/混音
      -> 原创 SVC Adapter（层 C）
          -> Fake Gateway（07-B）
          -> 可选用户自行安装的外部 RVC Gateway（后续单独审查）
      -> 受验证 audio artifact（PENDING_ROUTER）
  -> Whale Relay Core：目标验证 + 单次安全投递
  -> WeChatAgent：微信身份/授权
```

- 上游仅作为行为参考，不是内部实现。
- Core 接受 `sourceAudioRef`；不把歌曲 ID 当唯一输入。
- 不让 Gradio 模型文件名成为公共 Provider/Voice ID。
- 不复制插件 `Record` 直接发送逻辑。
- 真实外部 Gateway 未来必须单独许可、URL allowlist、认证、超时、取消、配额和供应链审计。

## 10. 新手首次体验（A10）

当前上游路径对普通用户不合格：

1. 需手工安装 Python/CUDA/venv/WebUI/模型/FFmpeg。
2. 需编辑 API 端口、启动 bat、理解启动顺序。
3. 需手工放置/重命名模型/index/配置/diffusion。
4. 搜索下载歌曲没有版权/授权确认；模型/音色没有同意流程。
5. 错误多为技术文本/日志，无法在 GUI 内恢复。
6. API `0.0.0.0` + `share=True`，不适合普通用户机器。

未来设计：

- Whale Singing 首次进入独立依赖弹窗；默认 RVC，Seed-VC 后续可选。
- 只读探测；用户点击“安装所选组件”后才确认安装/许可。
- 缺 GPU/资源未验证时显示 UNKNOWN，不虚构 CPU/云端可用。
- 先保存输入/只读预览，生成成功后才产生 Artifact。
- 发送是独立权限；`PENDING_ROUTER` 不等于已发送。

### 三条中文失败恢复

- **“未找到可用的唱歌引擎”** → “重新检测” / “暂时浏览” / “查看安全安装说明”。
- **“当前设备未验证能运行所选翻唱模型”** → “查看硬件要求” / “更换已验证模式” / “返回语音气泡”；没有证据的 CPU/云端选项不显示为可用。
- **“歌曲或目标音色尚未取得使用授权”** → “提供有权使用的文件” / “重新选择音色” / “取消”。

## 11. A01–A14（原规格，F01）

| ID | 原规格定义 | 结果 | 证据 |
|---|---|---|---|
| A01 | main/PR/CI/reviews 实时事实与 #16 未合并 | **PASS** | 第 0 节：main `bf9cf66`；#16 OPEN，HEAD `954a01a`，0 reviews，CI `40165832178` |
| A02 | 三上游 commit 钉死 | **PASS** | 第 2 节：插件 `0b84e382`、API `274572c3`、Seed-VC `51383efd` |
| A03 | 代码/模型/音频/声音四类许可证独立证据 | **PASS（含 UNVERIFIED）** | 第 3/4 节：AGPL、无 LICENSE、GPL、MIT、权重/音频/声音 UNVERIFIED |
| A04 | API 参数/错误/版本来自固定源码、不臆造 | **PASS** | 第 3/5 节 C07–C15；明确 RVC `/show_model` 未证实；本地输入 `UPSTREAM_BLOCKED` |
| A05 | 曲库权利、SSRF/DRM、音色同意与 fail-closed | **PASS** | 第 3/4/6 节：第三方源、任意 URL、无 DRM/同意检查、N1–N15 |
| A06 | Whale Audio/Whale Relay 职责分离，现有 SVC 契约不变 | **PASS** | 第 8/9 节；PR #16 源码只读；未改契约 |
| A07 | RVC 主线、Seed-VC 后续、不宣传低显存 | **PASS** | 第 4/7 节；Seed-VC `OPTIONAL/NOT_READY`，200M 歌声模型事实 |
| A08 | Windows 依赖与可信探测、UNKNOWN 字段完整 | **PASS（静态）** | 第 7 节 Manifest；资源/性能未实测处 UNKNOWN |
| A09 | ≥12 负向、Top 10、对应处理 | **PASS** | 第 6 节 N1–N15 + Top 10 |
| A10 | Novice First DoD、中文路径与 3 条恢复 | **PASS（设计）** | 第 10 节；当前上游 UX 仍不合格 |
| A11 | 仅许可 docs 文件变更，无秘密/隐私/模型 | **PASS** | 仅本文件；凭据值未复制 |
| A12 | git diff/Markdown/编码/最新 HEAD CI | **PASS** | 最终 PR #19 新 HEAD CI（见第 13 节） |
| A13 | main/#16–#18 未改、未启动真实生产和模型 | **PASS** | 本轮仅 docs；未安装/运行/发送 |
| A14 | 唯一后续建议与硬停止条件 | **PASS** | `APPROVE_FAKE_ADAPTER_DESIGN` + 下游仅 07-B Fake |

**重要区分：**

- A04 的 `PASS` 是**审计交付**通过；其中“本地 Artifact 输入”是 **UPSTREAM_BLOCKED** 能力缺口。
- A03 的 `PASS` 不等于所有许可已批准；模型/权重/音频/声音仍 `UNVERIFIED`。
- A06 的 `PASS` 不等于 SVC v1 已合并 main；它仍是 PR #16 的未合并契约。
- A08/A10 是设计/静态 PASS，不是 Windows/GPU/真实安装验收。

## 12. R01–R10 验收

| ID | 结果 | 证据 |
|---|---|---|
| R01 原 A01–A14 对齐 | **PASS** | 第 11 节逐项按原顺序；研究 PASS 与上游 BLOCKED 分离 |
| R02 ≥10 关键静态断言 pinned SHA/file/#L | **PASS** | 第 3 节 C01–C17（17 条），未复制凭据 |
| R03 SVC v1 请求/结果/拒绝字段 | **PASS** | 第 8.2 节；`SVC_REQUEST_KEYS` L20；validator L53–L87；normalizer L94–L128 |
| R04 三层映射 + ≥6 判断例 | **PASS** | 第 8.1–8.4；8 个判断例 |
| R05 RVC 音色/外部 Gateway/分离/混音/发送/Seed-VC Manifest | **PASS** | 第 7.2 节逐组件表 |
| R06 三种中文恢复、无 GPU/云端 UNKNOWN、无默认上游整合包 | **PASS** | 第 7/10 节；自动安装列均为否/需受审 |
| R07 保留许可/SSRF/公网/自动下载/UNKNOWN 风险 | **PASS** | 第 4/6 节；结论未退化为“可直接集成” |
| R08 仅一份报告、无敏感内容/生产副作用、最新 CI | **PASS** | 本轮只改本文件；CI 见第 13 节 |
| R09 结论限定原创、隔离、离线 Fake | **PASS** | 第 1/14 节 |
| R10 不修改 #16/#17/#18/main、不合并/安装/运行/发送 | **PASS** | 第 13/14 节 |

## 13. 检查、PR/CI 与未运行项

本地执行（仅文档）：

```text
git diff --check                 PASS
docs integrity / Markdown UTF-8  PASS
secret/privacy scan              PASS（未复制凭据值）
```

- 研究分支：`research/plan07a-rvc-upstream-audit`。
- 原 PR：#19；**只允许/实际只修改 `docs/SVC_PROVIDER_RESEARCH.md`**。
- Node/UI 测试：**NOT_RUN**，本轮仅 Markdown，未改工程代码；CI 不是 RVC 验证。
- 真实 Windows/GPU/CPU、模型、试听、音频、微信：**NOT_RUN / OUT_OF_SCOPE**。

## 14. 唯一结论与硬停止

**最终结论：`APPROVE_FAKE_ADAPTER_DESIGN`。**

允许进入 **07-B 的原创、隔离、离线 Fake Adapter 设计与测试**，但：

- 不直接集成当前 RVCSVC-API；
- 不复制 AstrBot 插件；
- 不 vendor `uvr5/`、`msst/` 或模型；
- 不自动下载歌曲/权重；
- 不运行真实 RVC/Seed-VC/GPU/CUDA；
- 不直接发送微信；
- 不把 Fake 结果标成 INTEGRATED/VERIFIED；
- 真实外部 Gateway/许可/安装一律另审（Plan 07-B/14）。

**硬停止条件：** 任何需要真实安装、模型下载、GPU 推理、歌曲下载、凭据、生产写入、微信发送、合并 PR 或 Force Push 的动作，立即停止并等待单独授权。

## 15. 来源（pinned）

- 插件树：<https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/tree/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d>
- 插件 LICENSE：<https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/LICENSE#L1-L20>
- 插件 README 许可证段：<https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/README.md#L170-L172>
- 插件 `api.py`（不复制 L6-L7 的值）：<https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/api.py#L6-L7>
- 插件 `main.py` 发送链：<https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc/blob/0b84e382927e088b9f4f10ce09ea1e4175bb0d8d/main.py#L303-L314>
- API 树（无 LICENSE）：<https://github.com/CCYellowStar2/RVCSVC-API/tree/274572c320147977a18dc0028e45f79da136a6e2>
- API README 许可证段：<https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/README.md#L281-L283>
- API `app_rvc.py` `/convert`：<https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L214-L231>
- API `app_rvc.py` 启动：<https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L458-L459>
- API `app_rvc.py` 下载：<https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/app_rvc.py#L32-L50>
- API `msst_backend.py`：<https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/msst_backend.py#L44-L61>
- API `requirements.txt`：<https://github.com/CCYellowStar2/RVCSVC-API/blob/274572c320147977a18dc0028e45f79da136a6e2/requirements.txt#L1-L10>
- Seed-VC：<https://github.com/Plachtaa/seed-vc/tree/51383efd921027683c89e5348211d93ff12ac2a8>
- Seed-VC LICENSE：<https://github.com/Plachtaa/seed-vc/blob/51383efd921027683c89e5348211d93ff12ac2a8/LICENSE#L1-L20>
- RVC WebUI：<https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI>
- UVR5：<https://github.com/Anjok07/ultimatevocalremovergui>
- MSST：<https://github.com/ZFTurbo/Music-Source-Separation-Training>
- so-vits-svc：<https://github.com/svc-develop-team/so-vits-svc>
