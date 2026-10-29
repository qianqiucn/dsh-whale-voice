# Plan 10 · TTS-C 本地 Provider 实现

**状态：PLANNED；前置：Provider Core-B、Audio Pipeline 和安全调度稳定。**

## 推荐按独立子任务依次实现
1. Qwen3-TTS：保留现有开发环境和用户自有音色作为测试基线，不作为强制安装依赖。
2. IndexTTS：研究并实现符合当前官方模型能力的参考声音克隆、情绪及推理封装。
3. 轻量本地：选择合法可分发、CPU 路径可验证的 Piper/Kokoro/sherpa-onnx 之一。

每项提供 Provider Adapter、健康检查、模型/音色发现、合成、输出校验、取消/错误/超时、资源需求、独立进程和关闭清理；不混用 Provider 的克隆提示或音色 ID。模型不默认自动下载、不同时强行常驻 GPU。

## 验收
先 Fake，获单项授权后才用本地真实模型测试中文短句、长句、取消、格式、CPU/GPU 资源和失败恢复。真实 WAV 生成不等于微信投递成功，不调用真实 WeChatAgent/Sender。每个 Provider 独立 PR、独立验收和许可检查。