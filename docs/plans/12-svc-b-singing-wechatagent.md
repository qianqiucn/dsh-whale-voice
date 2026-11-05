# Plan 12 · SVC-B AI 翻唱与 WeChatAgent 扩展入口

**状态：PLANNED；前置：SVC-A、Shared Core-C、WeChatAgent 扩展审计。**

## 最新已授权 SVC 引擎分层（2026-10-25；优先于旧文）

**首发标准翻唱 = RVC。后续可选免训练试唱 = Seed-VC，明确 NOT_DEFAULT / NOT_IMPLEMENTED / NOT_READY。** 统一属于 Whale Audio Core（鲸音核心），Whale Singing 是独立页面；不为 Seed-VC 新建后端 Core、投递通路或任务 ID。

- **12-A RVC 主线路**：合法歌曲 Artifact → 可选分离主唱/伴奏 → 已授权 RVC 音色模型转换 → 混音/校验/保存/预览（先 Fake，后获专门批准才可真实推理）。RVC 上线验收不以 Seed-VC 为依赖，也不要求先训练用户音色模型；已有合法 RVC 模型可用时才试唱。
- **12-B/12-C**：DeepSeek 的合法元数据搜歌、选择、音频获取权限与 Whale Relay 安全交付规则不变；未获得授权不能真实下载/发送。
- **12-D（同一 Plan 12 下新增后续可选子阶段，不是新计划编号）**：当 12-A 已验收且 Plan 07 Seed-VC 最小档案/许可证通过后，才评估免训练零样本试唱。用户提供有权使用的 1–30 秒参考音频（先按上游推荐区间，不确保所有素材效果）、授权歌曲、所选 Seed-VC SVC 模型；共享 Separation/Mixer/Artifact/VoiceProfile/TaskManager。先 Fake Gateway；真实模型/音频与推理需用户专项许可。
- **资源与语义**：Seed-VC 是“免训练便捷”，**不是已证明的低显存或 CPU 轻量版**。歌声任务不得偷用 Tiny 语音模型冒充 44.1kHz 歌声模型。必须经过 Windows 运行、显存/内存/时长、长音频/质量/取消/恢复与权利测试后才标可用；仓库归档风险必须展示。
- **UI/权限**：首发模式列表 RVC 为主；Seed-VC 可显示为可选说明或“待支持/未安装”并禁用启动，直到后续实际完成。选中 Seed-VC 不应自动安装或启动外部模型；不能降低 Whale Voice TTS、WeChatAgent、Whale Relay 与 Worker NEVER_WRITE 安全闸门。
- **完成门禁**：未实测前保持规划/候选，不能把用户批准“调整计划”解释为批准下载、运行、改代码、微信发送或合并。

## 2026-10-25 · Whale Singing 独立前端与初始化流程（原 Plan 12，仍 PLANNED）

- 前端称 **Whale Singing · 唱歌**，与 **Whale Voice · 语音气泡** 在 NAV/页面状态上明确分开，共用 **Whale Audio Core（鲸音核心）** 与音色/任务/Artifact/Provider，实际歌声转换仍由受审计的独立 RVC/SVC Gateway 完成。
- 首次进入 Singing 页触发 feature-scoped 依赖弹窗（Plan 09/14，详细契约 [这里](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)）：外部 SVC Worker/已授权模型、条件人声分离、所选混音格式组件、GPU/CPU 资源、曲源/音色授权；投递所需 Whale Relay 和 WeChatAgent 另列，**不必为只预览/保存而强迫安装投递组件**。
- 没有 GPU、缺模型/许可证、仅有未审计 RVCSVC-API 时显示受限状态，不自动安装/抓取音乐；有用户授权源与稳定转换后方可生成。语音 Voice 功能不能因 Singing 缺 GPU/后端而不可用。
- Singing 页面显示搜歌与来源选择、分离/转换/混音阶段、声线、输出格式、试听与保存，只有 Relay 支持并且用户单独授权才显示可执行发送。任何保存状态不能误称发送成功。
- 12-A Fake E2E 应包含首次进入弹窗、跳过后禁用真实生成、从 Voice 切换、第二次不重复弹、外部服务不可用、无权模型/曲源、生成成功但投递未授权。新页面在相应 UI 阶段实际验收前保持 PLANNED/OFFLINE。

## 2026-10-25 · 用户确认 astrbot_plugin_rvc_svc 功能路线（原 Plan 12）

**状态：PLANNED / NOT_SENT。** 方向确立但工程实现未启动。详细接口、法律门禁和排序见 [RVC/SVC 蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)。

### 12-A · 合法素材 + 离线翻唱 MVP
前置 Plan 07-A 许可/API 审计、07-B Fake Gateway、Plan 05/06/08 Core 契约、Plan 13-A Fake Delivery。仅使用用户有权使用的本地音源或 Fake fixture；真实 RVC/SoVITS-SVC、UVR/MSST 与模型运行须单独授权。
- 校验输入权利/目标音色同意 → 按需分离人声伴奏 → RVC/SVC 声线转换 → 混音/响度/时长与格式验证 → 受限 Artifact 保存/预览。任一阶段失败不触发 Relay。
- Fake E2E 包括坏媒体、无权音源、缺失伴奏、非法声线、上游失联、取消竞态、资源冲突、缓存隔离、未经授权发送；精准返回错误而非假成功。
- 不直接复制 AGPL 插件或许可状态不明的 RVCSVC-API 源码；适配原创且独立的兼容协议，不能强制所有用户安装 AstrBot。

### 12-B · DeepSeek 点歌与授权搜索
在 12-A、04、13-B 就绪后，以 DSH Tools 做 searchSongs（合法目录元数据）、createCoverTask（仅授权源）、getCoverTaskStatus、cancelCoverTask、previewCoverArtifact。DeepSeek 只决定交互和参数，不能直连音乐下载器、任意 URL 或微信投递。
- 曲名歧义返回最多五个候选待确认；搜索到歌曲不代表有音频使用权。若无法依法取得原曲，要求用户提供授权音频，不能绕过 VIP、地域或 DRM。
- 明确 SEARCHING、SEPARATING、CONVERTING、MIXING、SAVED 状态，不得把成品保存冒充发送成功。

### 12-C · 实际交付准入
经用户单独授权和 Whale Relay/WeChatAgent 已验证文件或语音能力后方可投递。长歌优先文件，后端不支持就仅保存；UNKNOWN 不自动重试。真实发送、配置更新、服务重启、设备权限另行授权。

**DoD**：每子阶段独立 PR、Level2 任务书、正负案例、源码/素材权利、任务与 Artifact 数据契约、实际测试与 CI、Fake/真实级别、停止条件齐全才验收。不把 TTS-A 合同、AGPL/许可审计与微信身份所有权绕开。

## 引擎与流水线
首发选择经许可审计的 RVC，隔离进程进行已有歌声音色转换；Seed-VC 仅为后续零样本免训练选配（12-D），不阻塞首发；原曲→（按需）人声分离→转换→校验→混音→试听→保存/可选发送。必须分别显示生成、预处理、转换、混音、交付的状态；不能声称 Seed-VC 直接从歌词作曲。

## UI
在 Whale Voice 内复用音色库、任务与日志、Provider 选择、组件管理；可增加唱歌专属工作区，不另造第二套 Core。展示来源素材、参考音色、引擎、进度、试听、输出格式、来源授权说明。

## WeChatAgent 集成
若第 04 阶段证实受支持的扩展注册 API，可设计 Whale Voice 扩展卡片与指定聊天授权；否则继续 DSH Tool/Plugin + WeChatAgent Adapter，不擅改内部清单。WeChatAgent 保有会话身份和授权职责。

## 安全
不得自动接受外部任意文件链接，不得未经授权克隆他人声音或默认公开参考音频；真实转换、安装扩展、微信发送各需单独授权。长歌曲能否发微信语音气泡取决于已验证后端能力，必要时支持本地保存/文件交付。先 Fake SVC 和 Fake Relay 测试，再分步实现。

## H0 对照补充（2026-10-25，未派发）

- Fake E2E 使用 SVC/Audio/WeChatAgent/Relay 四个替身；逐阶段验证取消、时长/体积上限与临时文件删除。模型运行、扩展安装与真实发送分别验收。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
