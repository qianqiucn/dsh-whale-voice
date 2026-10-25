# Plan 05 · Unified Core-A 统一 TTS/SVC 与 Whale Relay 职责

**任务状态：PLANNED**  
**前置：** TTS-A 契约及 WeChatAgent 扩展审计结论可用。

## 最新派发（2026-10-25）· 05-A SENT：隔离纯契约 + 自动测试，避开 #16 合并门禁

**Plan 05-A 正式派发 SENT，权威 Level 2：[05-A-whale-audio-core-offline-contract-implementation.md](05-A-whale-audio-core-offline-contract-implementation.md)**。此次不再只是静态调研，允许 DS 从最新 main 创建独立纯合同功能分支，仅新增 `core/audio/task-contract.mjs`、`feature-manifest.mjs`、`relay-handoff.mjs`、`test/audio-core-contract.test.mjs`、`docs/WHALE_AUDIO_CORE_CONTRACT.md`；≥40 个 Node 自动离线测试（计划 T01–T28/F01–F14/R01–R10 共 52 条）；不接 Host/生产，不读取音频或用户隐私，不发微信、不真实 RVC/Provider/Relay、不自动安装、不合并。

**前置研究足够**：07-A/F01 和 04-A 均 DONE（仅 RESEARCH/OFFLINE），源研究 PR #19/#20 均 OPEN。**但 Plan 03-B 仍 WAIT_USER_AUTHORIZATION，PR #16 TTS/SVC v1 仍未合并 main**；05-A 仅从 #16 合同只读理解命名和未来映射，不导入/复制/修改其代码。**这是 Plan 05 子阶段安全推进，不代表允许 05-B 真正 Host 集成**。后续 05-B/06/07-B 等必须待各自前置/专项授权。

**永续 UX 目标**：项目最终给不会代码的小白，Voice/Singing 首次功能依赖独立；本阶段 Fake 无真实生成/安装，但中文失败恢复、RVC 主线和 Seed-VC 后续不可用状态都纳入自动测试/文档。不要为了省步骤造成“假绿色”，假保存不等于配置 APPLIED 或投递成功。

## 2026-10-25 · 共用 Core 正式命名与兼容门禁（原 Plan 05，仍 PLANNED）

**唯一目标名：Whale Audio Core（鲸音核心）。** Whale Voice 是语音气泡产品入口，Whale Singing 是唱歌产品入口，共享一个 Core 的任务/音色/Provider/资源/Artifact/许可/配置；WeChatAgent 和 Whale Relay Core（鲸递）仍独立。权威规格：[双前端及首次依赖规范](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)。
- 对已有 Whale Voice Core（旧称）先**建立逻辑/文档别名和 API 映射**，不要直接改 `dsh-whale-voice`、插件槽位/服务 API/config key、`whale-v1`、PR #16 契约或用户数据。迁移/兼容需先定版本和回退测试。
- 增加 FeatureDependencies 合同、按 voice-bubble/singing 独立的需求清单、Capability 与安装可信观测、跨功能共享资产去重、每功能首次访问确认标记；安装器与真实写入不属于 Plan 05。
- 技术 DoD 先用 Fake Host/FeatureManifest 证明：一份 Core 管两页，不共享错误的 onboarding 状态、不建重复 TaskId/DeliveryId、SAVED 与 APPLIED 分离、WeChatAgent 和 Relay 不受越权写入。现有八页历史验收等级保持不变。

## 2026-10-25 · RVC/SVC 自动翻唱统一后端部署边界（仍 PLANNED）

依据 [RVC/SVC 蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)，后端可对用户呈现“鲸递的一体化唱歌交付能力”，但**不可把搜索、人声分离、RVC/SVC 推理、混音任务所有权挪给 Whale Relay**。
- Whale Voice Core 拥有歌曲检索授权、CoverTask、TaskId、SVC Provider Adapter、源音频/分离/转换/混音 Artifact、voiceProfileId、资源/取消/缓存、DeliveryId。
- 独立可选的合法 RVCSVC-API 或等价 Worker 仅做音频处理，Gradio show_model/convert 必须先审计；不把第三方源码直接打包进 DSH。
- Whale Relay 只消费有效 outputArtifactId 与通过 WeChatAgent 验证的 target 和 deliveryIntent，固定 backend 只提交一次，UNKNOWN 不自动重发。长歌默认文件，Mock 与真实投递分离。
- 新增状态矩阵：SEARCHING_METADATA、AWAITING_SELECTION、RIGHTS_NOT_CONFIRMED、SEPARATING、CONVERTING、MIXING、SAVED、DELIVERY_PENDING、UNKNOWN。生成、保存和服务端确认不能混淆。
- DoD 用 Fake DSH Tool、Fake SVC Gateway、Fake Relay 证明无越权发送、重复任务、模型/Token 泄漏；不改真实运行链。

## 正式产品架构

Whale Voice Core 统一管理配置、任务、引擎、音色、音频产物、权限和整体状态：

- Config Manager / Task Manager / Provider Registry
- Model Manager / Voice Library / Audio Pipeline
- Capability & Status / Delivery coordination

Provider 分为：
- TTS：Qwen、IndexTTS、Piper/Kokoro、Gemini、OpenAI、Custom API。
- SVC：Seed-VC、RVC 等歌声/语音音色转换；不是普通文字生成。

**Whale Relay Core（鲸递）** 负责一次投递的执行与安全：后端锁定、目标身份复验、去重、投递状态、取消边界、设备恢复。下辖已有 \`ui-automation\` 适配器以及未来可选的 \`native-hook\`（目前仅研究候选）。WeChatAgent 负责微信平台接入与会话授权。

关键规则：**Whale Voice Task Manager 持有唯一全局任务和 Delivery ID；Whale Relay 不能创建脱离主任务系统的独立发送队列。** 音频生成完成不等于微信发送完成；UNKNOWN 不自动改后端重发。

## 设计任务

1. 定义版本化任务契约：taskId、taskType(TTS/SVC)、providerId、voiceProfileId、input/output descriptor、状态/进度、取消、error、deliveryIntent。
2. 分离推理任务与实际投递任务，建立明确的 idempotency key、Delivery ID 和状态机。
3. 模型运行在独立 Python/其他进程；Core 不常驻加载所有模型，崩溃不能拖垮 DSH。初版资源策略采用单 GPU 任务调度。
4. 定义统一音色角色与不同 Provider 专属资产的关联方式，不假设跨引擎模型文件互通。
5. 规定短语音、长音频、翻唱歌曲的格式与交付策略；不能假设完整歌曲必须走微信语音气泡。
6. 兼容现有 Phase 4B revision/journal、Bridge/Worker 双闸门、WeChatAgent 目标授权、已有 Voice Sender 与 Mock 安全隔离。

## 交付与门禁

产出架构文档、模块职责图、TTS/SVC/Relay 协议与 Fake Runtime 测试。**暂不大规模重构生产代码，不启用 Hook/真实语音发送。** PR 独立审查，完成后停止。

## H0 对照补充（2026-10-25，未派发）

- 任务协议审查显式覆盖 providerInstanceId、privacyScope、cancelPolicy；这些是设计要求，字段最终按已有契约核验，不能冒充现有 API。生成 taskId 与投递 deliveryId 分离，并给出错误/恢复矩阵及兼容迁移方案。
- 回执分开 SENT_LOCAL 与可信服务端确认，HTTP 200/ret=0 不提升为确认。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
