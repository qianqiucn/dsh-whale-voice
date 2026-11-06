# 08 · Shared Core-C：音色库、音频流水线、队列与 Relay 投递契约

**状态：PLANNED。** 前置：05、06、07 审查完成。

## 统一音色库

Voice Profile 区分 `profileId`（角色/显示名称）、`providerAssets`（每引擎专属 Voice ID/参考音频/提示对象/模型）、语言、授权/来源、文件校验和清理。一个“小鲸鱼”角色可关联 Qwen、IndexTTS、Seed-VC 不同资产；不可直接跨引擎互传专属内部对象。开发者 `whale-v1` 不打包成用户默认。

## 统一 Audio Pipeline

校验 `format`、sample rate、channels、duration、peak/clip、大小、输出 artifact 与时效性。区分 WAV/PCM/Opus/SILK 编码要求与文件交付。对整曲音频不能假定可用微信语音气泡。产生 artifact 不代表发送成功。

## 任务与资源

- 生成任务和投递任务分别有 ID、状态、取消、过期、失败和日志。
- 单 GPU 任务优先，按需加载并在空闲时释放模型；云端 Provider 不争夺本地 GPU。
- 硬件/模型状态应有准确观测，不承诺未测量的显存。
- 临时模型/参考音频/聊天数据不能提交 Git，需受限目录和删除策略。

## Whale Relay 基础契约

为任务指定一个投递后端、目标、deliveryId、授权和幂等性。Whale Relay 将现有 Voice Sender 暂视为 `ui-automation` adapter；`native-hook` 仍不可在生产选择。`UNKNOWN` 不自动再次提交或切换后端。

## 验收

使用 Fake 音频、Fake 模型和 Fake Relay 完成兼容、安全、取消、后端锁定、去重、恢复状态测试；独立 PR，不执行微信/音频设备实际动作。完成停止。
