# Plan 08 · Shared Core-C 统一音色库、音频流水线与任务

**状态：PLANNED；前置：Unified Core-A、Provider Core-B 和 SVC-A 的契约。**

## 2026-10-25 · 翻唱歌曲与音频 Artifact 子规格（仍 PLANNED）

落实 [RVC/SVC 蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md) 的 CoverTask 与音源授权边界，不改变既有 TTS/SVC 请求合同：
- 一个 CoverTask 包含合法 sourceAudioArtifactId 或已验证许可的 CatalogId、sourceRightsProofRef、voiceProfileId、SVC Provider ID、modelId、pitch -12..12、separationPreset、mixConfig、outputArtifactId。严禁把外部 URL/绝对磁盘路径直接当受信任 Artifact。
- 人声/伴奏 Stem、转换人声、混音 Master 都是受限 Artifact；记录 sourceHash、codec、duration、bytes、channels、expiry、scope、modelRevision、consent/rightsState。缓存不能跨用户暴露未授权音频，删除须可验证。
- 状态区分 ACQUIRING、SEPARATING、CONVERTING、MIXING、VERIFYING、SAVED、DELIVERY_*；已有干净人声可跳过分离，无伴奏则不能假造伴奏。
- 验收音频解码、大小/时长/峰值、压缩炸弹、损坏结果、错误模型、并发 GPU、任务取消、缓存污损；Relay 只接手已授权成品和目标。
- 默认 Fake Audio/Gateway/Relay E2E；联网、真实 GPU、微信发送另行授权。

## 音色库
设计 voiceProfileId/名称/语言/授权/来源及 Provider 专属关联：Qwen prompt、IndexTTS 参考音频、Seed-VC 参考声、RVC 模型、云端 Voice ID。共享“角色音色”身份但不共享不可兼容的模型资产；不将个人 whale-v1 变成公版默认。

## 音频结果
统一 format/sampleRate/channels/duration/peak/outputArtifactId/expiry/ownership/validationState；准确区分 WAV、裸 PCM、SILK 与其他编码。安全重采样、响度、临时文件、格式校验。生成完成 != 投递成功。

## Task Manager 与 Relay
区分 TTS/SVC/预处理/混音/文件交付/微信发送。全局唯一 taskId 和 deliveryId 由 Whale Voice Core 管理；Whale Relay 执行固定后端的一次发送。取消、过期、队列、设备恢复、重复恢复及 UNKNOWN 防重发有明确状态。

## 模型资源
模型按需加载、空闲卸载；本地 GPU 初期使用单任务策略，CPU 和云端分开管理。显存数据只能基于运行观察，不虚构精确预算。

## 验收
Fake Model/Fake Audio/Fake Relay 的兼容性、格式、路径/隐私、任务取消、资源冲突和未知投递回归测试；真实音频/模型/微信操作须单独授权。独立 PR 与 CI。

## H0 对照补充（2026-10-25，未派发）

- 音色资产补充校验和、大小和清理规则；音频验收显式覆盖 channels、duration、peak/clip、大小、有效期及损坏内容。各编码支持情况依据后端证据，不能仅凭扩展名认定。
- 临时资产使用受限目录与可验证删除策略；云端任务不占本地 GPU。Fake Relay 验收增加后端锁定、重复提交与重复恢复。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
