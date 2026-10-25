# Plan 02 · TTS-A 多引擎架构补充及 PR #16 最终审查

**任务状态：IN PROGRESS（TTS-A 初版 DESIGN/OFFLINE 已完成；Plan 02 的补充范围尚未达到验收）**  
**现有 PR：** https://github.com/qianqiucn/dsh-whale-voice/pull/16  
**已知审查 HEAD：** c851be7cc6a76aeff3069cb3924d0edc19ce5dee（执行时重新核验）。

## 2026-10-25 · TTS-A 初版交付核验与剩余差距

**已核验：** PR #16 head `c851be7cc6a76aeff3069cb3924d0edc19ce5dee`，OPEN / MERGEABLE；CI run `40157763811` SUCCESS。仓库内实际存在 `core/tts/provider-contract.mjs`、`provider-registry.mjs`、`provider-config.mjs`、审计/架构文档；Registry 所有候选均 `NOT_IMPLEMENTED`、`selectable:false`。开发报告记录：188 Node（187 PASS、1 平台跳过）、24 UI PASS；这里的测试数字为报告证据，CI SUCCESS 已独立核对。

**TTS-A 子阶段：DESIGN / OFFLINE 已交付。** 纯设计与配置迁移提案的成功不等于任何实际 TTS 已接入。

**尚未满足本计划：**

1. 当前 Registry 尚无 `indextts`、`gemini-tts`、`openai-tts`（用户已明确要求纳入第一批候选）。需要查明准确官方产品/接口名称和生命周期，再增加为 **不可选择的研究候选**；不编造模型版本、许可证或能力。
2. `docs/TTS_PROVIDER_ARCHITECTURE.md` 仍以 Voice Sender / Delivery Router 为例，未在正式主结构中明确 **Whale Relay Core（鲸递）** 的投递身份与边界；也尚未正式说明 SVC 的音频输入契约与 TTS 文字请求不同。
3. Provider-neutral 只是设计；现有 GUI 的 Qwen/`whale-v1` 全局默认和健康门控尚未迁移，这属于后续 Provider Core/TTS-B **实现阶段**，不要求本轮直接改生产 GUI。

**本轮下一次发送给 DeepSeek 的范围：** 在现有 PR #16 补齐前两项文档/纯候选/契约测试，复核第三项已明确登记到后续计划，不启动 TTS-B。完成后再考虑将 Plan 02 标记 DONE、对 Plan 03 请求独立 PR 合并授权。

## 产品契约

Whale Voice 是基于 DeepSeek Harness 与 WeChatAgent 的可插拔语音插件。Qwen3-TTS 是参考实现而非必需依赖；`whale-v1` 是用户个人资产，不是公版默认音色。聊天 LLM 与 TTS 模型彼此独立。

长期由一个 Whale Voice Core 调度文字转语音（TTS）和唱歌声线转换（SVC）两类任务；SVC 的输入音频/专属参数不能塞进 TTS 的 `synthesize(text)`。

## 审查与补充

1. 检查 `core/tts/provider-contract.mjs`、`provider-registry.mjs`、`provider-config.mjs`、相关测试及 `docs/TTS_PROVIDER_*.md`；分离 Provider ID、实例、模型、音色、资产、能力与音频产物。
2. 候选清单明确纳入本地 Qwen3-TTS、IndexTTS、Piper、Kokoro、sherpa-onnx；云端 Gemini TTS、OpenAI 语音 API、Azure Speech、ElevenLabs；自托管和自定义 HTTP 服务。
3. 按各项目当前官方文档验证模型/接口、许可证、版本及弃用信息；未实现/未验证者一律标记候选，绝不显示为已安装、可用或已集成。
4. 设计每个 Provider 的语言、音色、声音克隆、情绪、语速、流式、取消、输出格式、联网/费用/凭据能力声明；不默认所有云端 API 兼容 OpenAI 协议。
5. 以架构文档说明 TTS、SVC、共享任务、音色库、音频管线和 Whale Relay 的接口边界，本轮不实现真实 SVC。
6. 验证旧 `qwen-local` 配置兼容；切换 Provider 不继承不兼容音色；本地 Qwen 离线不能令其他 Provider 一起失败；敏感凭据不能进入日志/前端/Git。
7. 增加纯契约和 Fake Provider 测试，并检查无实际 API 计费或微信发送；更新现有 PR #16。

## 验收

构建、Node/Playwright、文档完整性和隐私扫描通过；提供 Provider 支持矩阵与 TTS/SVC 边界；CI 最新 HEAD 为成功。只审查和补充协议，不连接生产模型/付费 API、不改生产配置、不自动合并。

## 这次补充任务书的交付要求

- 更新现有 PR #16，而不是另开重叠 PR。
- 加入 IndexTTS、Gemini TTS、OpenAI 语音服务候选及相应 `NOT_IMPLEMENTED` / `selectable:false` 测试。
- 架构文档正式加入 **Whale Voice Core → 统一 Audio Pipeline → Whale Relay Core → WeChatAgent / UI Automation** 的职责链（示意图不意味着生产已集成）；明确 Seed-VC/RVC 是 SVC 候选，不是 TTS Provider。
- 为云端接口差异、语音克隆/情绪能力、费用和隐私说明预留逐 Provider 能力/同意要求；不得复制未经核验的当前 API 规格。
- 执行构建、Node/UI、文档链接与隐私检查，Push 现有 PR 并核验 CI。不能以 CI 成功代替人工审查；不合并、不调真实模型、不重启服务、不发送微信。
