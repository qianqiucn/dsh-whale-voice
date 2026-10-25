# Plan 02 · TTS-A 多引擎架构补充及 PR #16 最终审查

**任务状态：IN PROGRESS（已有 PR #16；本计划的扩充验收尚未完成）**  
**现有 PR：** https://github.com/qianqiucn/dsh-whale-voice/pull/16  
**已知审查 HEAD：** c851be7cc6a76aeff3069cb3924d0edc19ce5dee（执行时重新核验）。

## 产品契约

Whale Voice 是基于 DeepSeek Harness 与 WeChatAgent 的可插拔语音插件。Qwen3-TTS 是参考实现而非必需依赖；\`whale-v1\` 是用户个人资产，不是公版默认音色。聊天 LLM 与 TTS 模型彼此独立。

长期由一个 Whale Voice Core 调度文字转语音（TTS）和唱歌声线转换（SVC）两类任务；SVC 的输入音频/专属参数不能塞进 TTS 的 \`synthesize(text)\`。

## 审查与补充

1. 检查 \`core/tts/provider-contract.mjs\`、\`provider-registry.mjs\`、\`provider-config.mjs\`、相关测试及 \`docs/TTS_PROVIDER_*.md\`；分离 Provider ID、实例、模型、音色、资产、能力与音频产物。
2. 候选清单明确纳入本地 Qwen3-TTS、IndexTTS、Piper、Kokoro、sherpa-onnx；云端 Gemini TTS、OpenAI 语音 API、Azure Speech、ElevenLabs；自托管和自定义 HTTP 服务。
3. 按各项目当前官方文档验证模型/接口、许可证、版本及弃用信息；未实现/未验证者一律标记候选，绝不显示为已安装、可用或已集成。
4. 设计每个 Provider 的语言、音色、声音克隆、情绪、语速、流式、取消、输出格式、联网/费用/凭据能力声明；不默认所有云端 API 兼容 OpenAI 协议。
5. 以架构文档说明 TTS、SVC、共享任务、音色库、音频管线和 Whale Relay 的接口边界，本轮不实现真实 SVC。
6. 验证旧 \`qwen-local\` 配置兼容；切换 Provider 不继承不兼容音色；本地 Qwen 离线不能令其他 Provider 一起失败；敏感凭据不能进入日志/前端/Git。
7. 增加纯契约和 Fake Provider 测试，并检查无实际 API 计费或微信发送；更新现有 PR #16。

## 验收

构建、Node/Playwright、文档完整性和隐私扫描通过；提供 Provider 支持矩阵与 TTS/SVC 边界；CI 最新 HEAD 为成功。只审查和补充协议，不连接生产模型/付费 API、不改生产配置、不自动合并。