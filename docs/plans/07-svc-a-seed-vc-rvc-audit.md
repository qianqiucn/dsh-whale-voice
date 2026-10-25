# Plan 07 · SVC-A Seed-VC / RVC AI 翻唱研究

**状态：PLANNED；独立研究，不阻塞通用 Core 设计。**

## 2026-10-25 用户选择的 RVC/SVC 集成路线（Plan 07-A 可优先独立研究，仍 PLANNED）

**权威跨阶段规格：[RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)。** 用户决定参考 astrbot_plugin_rvc_svc 并将翻唱结果接入鲸递后端。此决定仅确立产品方向，不代表现在执行或复制、安装、下载、运行任何上游软件。

### 07-A · 上游许可与技术接口审计（准备好成为下一份 Level 2，只读）

**ID**：原 Plan 07 的 07-A，版本 DRAFT v1；**状态** PLANNED / NOT_SENT。**优先级**：03-B 等授权期间允许优先安排这一项只读研究，不修改 main，也不跳过 03-B 的真实 merge 门禁。

**目的**：判断是否可通过合法、稳定的外部服务接口复用 RVC/SVC、UVR5、人声分离与歌曲混音，提供确定的兼容配置、资源和版权风险矩阵。不得无依据将插件宣称为 DSH 原生插件或 Whale Relay 本体。

**资料输入（执行前锁定精确 upstream commit SHA）**：

1. `https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc`：`LICENSE`、`README.md`、`main.py`、`api.py`、`_conf_schema.json`、`requirements.txt`、`metadata.yaml`。
2. `https://github.com/CCYellowStar2/RVCSVC-API`：`README.md`、`app_rvc.py`、`app_svc.py`、`requirements.txt`、`使用说明.md`、根目录许可证/版权声明及 msst/uvr5 内嵌依赖。
3. upstream RVC、SoVITS-SVC、UVR5/MSST 与潜在第三方权重许可证和安装/运行约束；仅静态引用，禁止实际 pip install、启动或权重下载。
4. 本仓库 `AGENTS.md`、`core/svc/svc-contract.mjs`、`core/svc/svc-registry.mjs`、`core/tts/provider-contract.mjs`、`docs/TTS_PROVIDER_ARCHITECTURE.md`、`docs/WECHATAGENT_COMPATIBILITY.md`，对比现有白名单与任务/交付安全边界。

**默认决策**：原创 Whale Voice Core RVC/SVC Fake Gateway 与可选用户自行安装的外部 API 通道；不移植 AstrBot 命令系统，不复制 AGPL 代码、不 vendor 许可不明的独立 API。插件 AGPL-3.0，需要发行与网络使用场景的法务/维护者核实；RVCSVC-API 暂未见明确 LICENSE，判为 `UNVERIFIED_RIGHT_TO_REUSE`，不能以公开可读代替许可证。不得绕过收费曲库或 DRM。

**必须输出到 `docs/SVC_PROVIDER_RESEARCH.md` 的表格字段**：`component/upstreamUrl/pinnedCommit/licenseEvidence/runtimeDeps/reuseMode/rightsStatus/apiEvidence/health+failure/CPU+GPUWindows/cancel+timeouts/audioRights/securityRisk/decision`；另附 07-A 行动清单、交互图、风险 Top10、建议的下游 Plan 05/06/08/12/13 界限。文件如已存在，只做最小增补，不另建第二份研究。

**协议静态待验证事实**：README 示例 Gradio `/show_model`、`/convert`（歌曲 ID、pitch、vocalGain、instrumentGain、模型名），候选 RVC 7860 / SVC 7866；返回形状、HTTP/Gradio 版本、是否支持本地源音频、模型选择、取消、输出位置和安全性一律标 `UNVERIFIED` 直到静态源码确认。不要尝试调用现有生产 127.0.0.1 服务。实际端口不是永久契约。

**步骤**：1. 钉死两个 upstream SHA 与文件证据；2. 逐项许可证核验，区分独立进程互通与复制衍生代码义务；3. 梳理 AstrBot command/selection/API、网易云搜索下载路径、Gradio 协议及错误/超时/缓存；4. 与 Whale Voice SVC 纯契约和 Whale Relay 仅投递边界逐项对照；5. 输出数据/声音权利与 SSRF/URL redirect/付费下载禁令；6. 建立 Windows 环境、GPU/CPU、音频格式/时长/取消/并发资源矩阵；7. 给出独立 Fake Gateway 07-B 输入与 BLOCKED 条件；8. Markdown/秘密检查；9. 用新的仅文档研究 PR 交付证据、CI、停止。

**负向案例**：无 LICENSE、AGPL 复制冲突、模型权利不明、只有 Song ID 不支持本地媒体、网易云 VIP/地区不可用、来源 URL 转向私有 IP、无 GPU、旧 Python/CUDA、同名选歌歧义、RVC 模型与音色用户权利不明、/convert 取消后继续执行、返回任意路径、长歌不能走语音气泡。每一例须给 fail-closed 动作，不建议偷偷回退到默认音色或下载源。

**DoD**：固定证据链接/SHA 的许可矩阵完整；有唯一推荐兼容形态与禁止直接复制的明确说明；输出静态协议差异与真实缺口、最小 Fake 测试场景、审计报告 `APPROVE_FAKE_ADAPTER_DESIGN` 或 `BLOCKED_UPSTREAM`; Node/Windows 模型/微信运行一律 NOT_RUN；无生产副作用、不修改工程代码、不触碰 docs/plans（由 ChatGPT 维护），不宣称新 Provider 已 INTEGRATED。

### 07-B · 兼容适配验证（07-A 与 Plan 05 完成后再派发）

只实现隔离 Fake Gradio `/show_model` 和 `/convert` 合同、错误/取消/返回 Artifact 校验、allowlist URL 与 resource cap；任何真实模型执行或用户提供歌曲分离都需单独授权。后续 Plan 06 的 Registry 不得因为 Fake 健康成功将 Provider 自动变成生产 selectable。
## 核心区分
- **SVC**：把已有讲话/歌唱人声转换成目标音色；Seed-VC/RVC 属此类。
- **Singing synthesis**：歌词、旋律/MIDI 到唱歌人声，是不同任务。
- **Music processing**：人声分离、伴奏混音、音频校验，也不是 SVC 模型本身。

## 调查
1. 研究 Seed-VC 官方项目及可信维护 Fork、模型版本、推理接口、Windows/CPU/GPU 依赖、许可与归档维护风险。
2. 研究 RVC 的模型格式、训练与推理要求、授权和可复用模型导入。
3. 对比零样本参考声音、音高/节奏保留、语言、长音频、实时性、音色稳定性和资源消耗；实际试听需另行授权。
4. 设计原曲→可选分离→声线转换→音频校验→混音→试听→存储/发送流水线，纯人声输入避免不必要分离。
5. 梳理歌曲版权、声音克隆授权、参考音频隐私、模型/代码/权重各自许可；不将 GPL 代码或未授权 DLL 直接打包进主项目。
6. 输出 SVC Provider 能力矩阵、与 Core 契约差异、GPU/安装门槛和隔离原型建议。

## 门禁
仅读取可信源码和文档、Fake SVC 测试；未经单独许可不下载大模型、不执行不可信代码、不启动 Hook、不中转真实微信歌曲。独立 PR；完成后停止。

## H0 对照补充（2026-10-25，未派发）

- 研究交付固定为 docs/SVC_PROVIDER_RESEARCH.md；分别列代码/权重许可和分发条件。
- Fake SVC 测试矩阵至少覆盖音频超限、无伴奏、无效输出、强制取消与显存冲突；仅设计与隔离验证，不运行真实模型。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
