# 02 · TTS-A 多引擎架构补充与 PR #16 审查

**初始状态：PLANNED · EXISTING_PR。** PR: https://github.com/qianqiucn/dsh-whale-voice/pull/16；入库时 head `c851be7cc6a76aeff3069cb3924d0edc19ce5dee`，OPEN。继续已有 PR，不建重复 TTS-A。

## 定位

Whale Voice 的聊天 LLM 与 TTS 引擎独立；Qwen 是一个可选 Provider，`whale-v1` 是开发者音色，不是通用默认依赖。未来一个 Core 同时支持 TTS（文字→语音）与 SVC（已有语音/歌声→音色转换），二者推理契约独立。

## 要做的事

1. 核对 `core/tts/provider-contract.mjs`、`provider-registry.mjs`、`provider-config.mjs`、相关测试与文档；有无误报已实现能力。
2. TTS 候选：Qwen3-TTS、IndexTTS、Piper、Kokoro、sherpa-onnx；Gemini TTS、OpenAI 语音 API、Azure、ElevenLabs；自托管 HTTP/自定义 API。逐项记录官方支持、版本、许可与未实现状态，不凭聊天模型名推断 TTS 能力。
3. 区分 Provider ID/Instance/Model/Voice Profile/Voice Asset；声明 clone、emotion、stream、languages、formats、cancel、credential、network、cost、GPU/CPU 等能力；缺能力时明确禁用而非伪造成功。
4. 兼容旧 `qwen-local`；不因 Qwen 离线便断言云端 Provider 离线。绝不自动切到付费 Provider。
5. 说明未来 Seed-VC/RVC 属 SVC，不混进 `synthesize(text)`；Whale Relay 属统一投递层，不在 Provider 中直接发送微信。
6. API Key 受保护，不回传前端/日志；自定义 URL、SSRF/重定向和私人内容上传有独立威胁模型。
7. 补充纯契约/Fake Provider 测试与文档，运行 build、Node、UI、隐私扫描，更新现有 PR，核实最新 CI。

## 不做的事

不安装模型、不运行真实付费 API、不改生产配置、不合并 PR、不启动 03。完成时输出兼容矩阵、Diff、测试、风险和建议。
