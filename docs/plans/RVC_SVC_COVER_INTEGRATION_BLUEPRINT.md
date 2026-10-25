# Whale Voice · RVC/SVC 自动翻唱与鲸递交付接入蓝图（架构决策 / 非执行授权）

**创建：2026-10-25 · 决策状态：USER_SELECTED_DIRECTION / PLANNED · 维护者：ChatGPT · 适用原 Plan 05/06/07/08/09/12/13/14。**

> 用户明确选定 [CCYellowStar2/astrbot_plugin_rvc_svc](https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc) 作为功能与交互参照，并希望与 Whale Relay（鲸递）后端组成完整自动翻唱—投递体验。**本决定不等于批准拷贝上游代码、安装运行后端、下载模型/歌曲、真实发送、合并 PR 或修改生产。**
>
> **稳定 ID 不变：Plan 01–14 原名和文件名保持；本文件是跨计划共享需求与分段实施规格，不创建 Plan 15。** 当前 Plan 03-A DONE；03-B WAIT_USER_AUTHORIZATION；Plan 07/12/13 仍 PLANNED。

## 最新品牌与双入口决策（2026-10-25，优先于旧称）

用户追加决定：将原共用的 Whale Voice Core 重新命名为 **Whale Audio Core（鲸音核心）**，保留 **Whale Voice · 语音气泡**、新增 **Whale Singing · 唱歌** 为相互独立的前端页面，首次进入每个页面展示对应依赖与安装方式的独立弹窗；共享已安装资源、Capability、音色和任务。完整约束、前端现状、依赖清单、用户跳过/取消、安全与检测状态见 [Whale Audio Core 双页面首次使用规范](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)。

下文所有“Whale Voice Core”在 TTS+SVC 共用服务语义下等价于**Whale Audio Core（历史旧称）**；产品“Whale Voice”只表示语音气泡入口。Whale Relay Core（鲸递）、WeChatAgent 职责和原 01–14 任务 ID 不变；不批量改 Git/plugin ID 或生产配置。Plan 05/08 负责共享 Core，Plan 09 完成 Fake 双页+首次 Modal、Plan 12 Singing 页面/依赖、Plan 14 真正安装器安全验收；Plan 07-A 增加检测与依赖许可调研。

## 1. 产品目标与用户验收场景

用户向 DeepSeek/小鲸鱼说「帮我唱一首某某歌」，由已授权的 DSH Tool 理解意图并创建可观察任务；在合法可访问的歌曲目录中**搜索元数据**、澄清同名候选或选择经过确认的歌曲，获取**有使用许可**的原始音频；分离人声/伴奏、以用户有权使用的目标 RVC/SVC 模型翻唱、校验混音导出、先试听或保存，并在另行授权的渠道里作为音频文件/受支持的语音消息投递，最终显示可信回执。

- **MVP-1（优先交付，OFFLINE）**：用户提供已授权的本地歌曲输入 Artifact + 已授权音色模型 → Fake/隔离后端生成分离与转换结果 → 验证、缓存/清理、保存 Artifact；没有网络歌曲下载、微信发送和大型模型启动。
- **MVP-2（元数据检索，OFFLINE）**：DSH Tool 调用歌曲元数据 Search Adapter，列出来源、曲名/歌手/版本/时长及许可状态；未具合法音频取得权就明确请求用户提供文件/授权，不以搜索成功视为下载许可。歧义返回候选等待确认。
- **MVP-3（受控音频交付）**：只有经过用户另行授权、WeChatAgent/Relay 目标权限和支持能力验收后，完成单次 file/audio 投递。长歌曲默认文件产物，Voice Bubble 需单独验证后端和时长/格式支持。
- **最终愿景（独立授权与实测后）**：自然语言请求 → 自动发现并获取允许使用的源音频 → 分离 → RVC/SVC 翻唱 → 混音 → 授权渠道发出。**不承诺任意商业歌曲可自动下载和分发，也不默认自动用真人声音克隆。**

## 2. 上游仓库实际事实与许可门禁

- 插件：[astrbot_plugin_rvc_svc](https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc)，AstrBot 的命令插件，README 声称网易云搜索、选歌/选模型、自动下载、人声分离、RVC/SoVITS-SVC 转换、后处理与混音；仓库标为 **AGPL-3.0**。其命令、AstrBot 生命周期和微信投递不能直接复制/安装为 DSH 插件。
- 推理中间层：[RVCSVC-API](https://github.com/CCYellowStar2/RVCSVC-API)，上游文档给出 **Gradio** 端点 /show_model、/convert；RVC 网关通常 127.0.0.1:7860、SVC 通常 127.0.0.1:7866。/convert 示例参数按顺序为 (songId, pitchSemitones, vocalGainDb, instrumentalGainDb, modelFilename)。**这个示例仅用于 Plan 07-A 复核，不能视为未经验证的正式兼容 API**；返回值、异常形状、鉴权、任务取消需源码/沙箱实测后锁定。
- 上游依赖额外 RVC 或 SoVITS-SVC WebUI 进程与 UVR/MSST 分离模块；GPU、Python/CUDA、FFmpeg、模型文件和服务启动顺序需要真实主机的兼容性调查，不能宣称“复制插件即可用”。
- **版权/许可阻塞项**：插件 AGPL-3.0 对源代码复制、修改、部署交互可能产生开源许可义务，需在发行/复用前核查；RVCSVC-API 仓库页面目前未看到明确 LICENSE，不应因为源码可读就认定可以重分发/复制其代码。RVC/SVC/分离模型的代码、权重、音乐和参考音色也各有独立许可。Plan 07-A 逐项给出来源、commit、SPDX/文件证据、使用边界和合规结论；不满足时 STOP_CODE_REUSE。
- **默认工程选择**：不 vendor、不修改/内嵌 AstrBot 插件，也不复制无许可后端；由 DeepSeek 实施原创**适配器与 Fake Gateway**，以用户自行合法安装的外部服务为可选运行依赖。若真实协议/权利不清，保持 Fake 路线；计划可调整但不绕过门禁。

## 3. 强制架构：统一后端体验，Core 职责不混淆

```text
用户 / DSH DeepSeek Tool / WeChatAgent 支持的入口
    -> Whale Voice Core: 唱歌 Task、source/voice 权限、选歌、资源策略、
       音频 Pipeline、RVC/SVC Provider Adapter、Artifact、进度/取消
         -> 可选独立 RVCSVC-API 或等价合规 RVC/SVC/UVR Worker
         <- stem / converted vocal / mixed result (受限 Artifact)
    -> Whale Voice Core: 合并前验证 outputArtifactId、用户投递授权、
       唯一 taskId 和 deliveryId、明确 route/target
    -> Whale Relay Core (鲸递): 目标二次复核、固定 delivery backend、
       一次提交、UNKNOWN 不重发、可信状态
         -> 已有 Voice Sender ui-automation / 将来经核验的支持接口
         -> WeChatAgent 账号/会话/权限所有者
```

**用户的“集成进鲸递后端”解释为统一部署与完整体验的鲸递交付能力**，而非让 Relay 持有歌曲抓取、GPU 推理或模型实例。Whale Voice Core 管生成任务与音频资产；Whale Relay Core 只管安全投递。若要单程序部署，也必须在内部保持这些层的模块/API 隔离；不能因部署方便让推理进程获取微信凭据。

稳定不变量：WeChatAgent 不被替换、Worker NEVER_WRITE、Bridge/Worker 独立授权、SAVED != APPLIED、UNKNOWN 不自动重发、SENT_LOCAL != 服务端确认、UI Automation 保留、native-hook 仅研究候选、个人 whale-v1 不成为产品默认。

## 4. 接口草案（仅新规划契约，不冒充现有接口）

使用既有契约优先，若字段冲突按源码检查后在 Plan 05/08 显式版本化；**禁止悄悄放宽现有 TTS/SVC 的字段白名单**。

- SongSearch.request = { query, preferredSource?, locale?, maxCandidates=5 }；result = { candidates:[{ catalogId, title, artist, version?, durationMs?, provenance, rightsState }], requiresSelection }。rightsState ∈ { VERIFIED_LICENSED, USER_PROVIDED, UNKNOWN, DENIED }；UNKNOWN/DENIED 不得取回音频。
- CoverTask.create = { sourceAudioArtifactId?, selectedCatalogId?, sourceRightsProofRef?, voiceProfileId, svcProviderId, pitchSemitones=0, options?, deliveryIntent? }。**不得接受任意远端可下载 URL 或绝对文件路径作为受信任 Artifact**；pitch 范围 -12..+12，其他配置按引擎能力验证。
- CoverTask.state = VALIDATING_INPUT -> SEARCHING_METADATA? -> AWAITING_SELECTION? -> ACQUIRING_AUTHORIZED_AUDIO? -> SEPARATING -> CONVERTING -> MIXING -> VERIFYING -> SAVED -> DELIVERY_PENDING? -> DELIVERY_SUBMITTED? -> DELIVERED_CONFIRMED?；失败/取消/过期为终态并保留单独阶段错误；UI 不得把 SAVED 或 SUBMITTED 冒充 DELIVERED。
- ProviderGateway (Fake 先行) = probeCapabilities(), listModels(), convert({sourceArtifactRef, modelId, pitch, jobId, abortSignal?})；中间层实际只接受歌曲 ID 的情况必须先构建法律允许的媒体输入策略，不能伪造支持本地文件，也不能绕过许可去做网络抓取。
- Output Artifact = {artifactId, mediaType, codec, sampleRate, channels, durationMs, bytes, checksum, expiresAt, ownerScope, rightsState, provenance}; 禁止返回任意外部机器路径，所有媒体必须校验内容格式/大小/解码、峰值、生命周期。
- Error codes: NO_LICENSED_SOURCE, SEARCH_AMBIGUOUS, RIGHTS_NOT_CONFIRMED, VOICE_CONSENT_MISSING, BACKEND_OFFLINE, BACKEND_VERSION_UNSUPPORTED, MODEL_NOT_AVAILABLE, SEPARATION_FAILED, CONVERSION_FAILED, MIX_FAILED, ARTIFACT_INVALID, RESOURCE_LIMIT, CANCEL_UNCONFIRMED, DELIVERY_NOT_AUTHORIZED, DELIVERY_UNKNOWN。不同失败不能自动切换真实发送后端。
- 生命周期：有界超时、串行本地 GPU 任务、短期缓存（key 含 source hash/rights scope/model+params+backend revision）、显式取消、取消未证实时不可称资源已释放、敏感音频和临时文件只存受限目录与按政策清理，绝不进 Git。

## 5. 推荐发送序列与 DoD 分段（原编号保留）

| 派发先后 | 原 Plan ID | 独立子阶段目标 | 前置/独立门禁 |
|---|---|---|---|
| **可立即先做的只读研究** | **07-A** | 审计插件/独立 API 的 commit、协议、许可、版权/声音同意、Windows 资源需求；产出 docs/SVC_PROVIDER_RESEARCH.md 和接入矩阵，不下载/运行模型 | 与 03-B 合并权限无关，**仍 PLANNED，须升级 Level 2 再派发** |
| 合并门禁 | 03-B | 用户决定是否合并 #16；明确授权后单独执行 | **WAIT_USER_AUTHORIZATION；未授权不派发合并** |
| 平台入口 | 04 | WeChatAgent/DSH 实际支持的 Tool/扩展及权限证据 | 可独立只读；无微信发送 |
| 核心架构 | 05 | Core / Relay / Adapter / 搜索 / 素材授权 / Job 与唯一 ID 契约 | 04 与既有安全约束 |
| 适配器细审 | 07-B | 选定 Fake Gateway / Gradio /convert /show_model 的契约与安全矩阵；不可复制未许可源码 | 07-A、05 |
| 引擎管理 | 06 | Fake RVC/SVC 能力协商、离线发现、资源调度 | 05 / 07-B |
| 音频任务底座 | 08 | Songs/Stem/Model/Artifact/混音任务、缓存、取消、隐私、授权证明 | 05/06/07 |
| 统一交付安全 | 13-A | Fake Whale Relay 一次投递、身份复验、UNKNOWN、不重发、文件能力 | 05/08 |
| 配置草稿 UI | 09（OFFLINE） | RVC/SVC/分离后端状态与选歌/音色配置草稿；不允许生产写入 | 06/08；有单独写入门禁 |
| 离线翻唱 MVP | 12-A | 使用用户许可音频 + Fake/已核验的独立 Gateway，分离/转音色/混音/保存；不发微信 | 07/08/13-A；真实模型单独授权 |
| 现有 Sender 接口 | 13-B | UI Automation 只在批准条件下封装；先 Fake 路由/文件交付能力审计 | 13-A；真实发送单独授权 |
| 自动点歌 | 12-B | DeepSeek Tool 意图解析→合规歌曲元数据检索→候选确认→许可验证→生成/预览；按受支持接口交付 | 12-A / 04 / 13-B；真实发送单独授权 |
| 原 TTS 能力 | 10、11 | 本地/云端 TTS 分阶段；不被唱歌功能永久阻塞，按资源可并行 | 06/08/09 |
| 原生投递研究 | 13-C | Native Hook/SILK 仅研究候选 | 独立高风险门禁 |
| 发布验收 | 14 | 把翻唱作为**可选组件**：明示大模型/显卡/协议许可，no-GPU 用户不被强迫安装 | 子模块完成与 Release 单独授权 |

以上“派发先后”是**先后依赖图**，不是要强行停掉原 Plan 01 GUI 收尾，也不是让 DeepSeek 在一次对话里执行全部阶段。每次仅发送一个 Level 2 的完整独立任务；Plan 07-A 是当前最优可立即推进的**安全候选**，但尚未发送执行版。Plan 03-B 没被用户单独授权前，只允许只读研究/纯 Fake 契约等独立任务，不能用研发进度代替合并决策。

## 6. 验收矩阵与中止门槛

1. **许可**：分别核实插件 AGPL、RVCSVC-API 源代码许可、每个依赖/权重许可证、原曲/伴奏/参考音色授权。任何权利不明的素材、许可冲突或必须复制未许可代码 -> STOP，改原创 Fake 或用户供应授权素材。
2. **搜索与源**：同名候选、无结果、平台收费/VIP、地区限制、无权访问、URL redirect/SSRF、非法格式、超长/超大 -> 明确错误/人工选择；禁止绕过付费墙/DRM/平台访问控制。
3. **API**：/show_model 不可达/恶意模型名，/convert 版本不符、Gradio 错误响应、服务启动不安全、超时、GPU OOM、音频损坏 -> 无错误成功状态、不中断 DSH、敏感日志不泄漏。
4. **生成**：不需要人声分离的输入、分离无伴奏、音高越界、音量越界、错误声线、污染缓存、任务取消、并发单 GPU -> Fake 稳定可复现；真实模型与音源另行授权。
5. **投递**：源音频未经授权、目标未授权、长音频文件不支持、发送状态 UNKNOWN、消息超时但可能已发、消息误投不同会话 -> fail closed，不自动换后端重试；人工审核才可再次尝试。
6. **兼容**：现有 TTS-A DESIGN/OFFLINE、qwen-local 兼容、WeChatAgent 所有权、Bridge/Worker 安全开关、已有 Voice Sender 运行链、Plan 01/03 已验收事实、Mock/INTEGRATED 分级均保留。
7. **工程交付**：新代码仅在获得该阶段实施指令后；独立 PR、固定 base/HEAD、正负测试、node build/node --test/UI CI、diff/secret/UTF-8；模型、音频、token、Cookie、私有 URL 不入库。

## 7. 当前决策与停止条件

- **已批准的产品规划方向**：参考 astrbot_plugin_rvc_svc 能力，建设由 DeepSeek 可触发的自动 RVC/SVC 翻唱流水线，形成 Whale Voice Core 音频产物并经 Whale Relay 安全交付。
- **尚未批准的实施动作**：直接导入 AGPL 插件、复制/打包可能无许可的 RVCSVC-API、安装或运行未知整合包、自动下载歌曲/权重、开 GPU 推理、真实微信发送、改变 Worker/Bridge/Whale Relay 生产能力、合并 PR、Release。
- **下一份最值得详细派发的任务**：原 Plan 07-A「上游许可证 + API 契约 + 宿主隔离审计」（只读）；验收成果先约束 Plan 05/06/08/12/13，然后才安排 Offline Fake 技术实现。
