# 06 · Provider Core-B：注册、能力协商与 Fake 引擎调度

**状态：PLANNED。** 前置：03 TTS-A 契约及 05 Unified Core-A 审查通过。

## 实现范围

1. Provider Registry 区分 `TTS`、`SVC` 与实例，支持稳定 ID、版本、平台与健康状态。
2. 统一能力集合：voice presets、voice clone、emotion/style、language、streaming、cancel、audio formats、resource needs、credential/network/cost。
3. Fake TTS、Fake SVC 独立 Adapter，输出格式受检的 artifact 而非调用微信。
4. 请求前 Capability Negotiation；缺模型/音色/语言/情绪等能力时明确拒绝或要求可见的降级确认。
5. 版本未知、不兼容、认证缺失、Qwen 离线但其他 Provider 可用，必须正确保留组件独立状态。
6. Provider 显示为 `NOT_IMPLEMENTED` 的候选不得在正式可选列表出现；没有用户授权不能调用云端。
7. 输出健康只反映 Provider 本身，不等于微信已发送、配置 APPLIED 或 TTS 已试听。

## 测试门禁

Fake 组件、超时、取消、注册冲突、配置迁移、无 GPU、敏感投影脱敏、没有真实付费请求或微信行为。建独立 PR；不生产启用，不修改现有 Sender。完成停止。
