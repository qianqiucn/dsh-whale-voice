# Plan 06 · Provider Core-B 多引擎注册与安全调度

**状态：PLANNED；前置：TTS-A 和 Unified Core-A 契约审查完成。**

## 任务
- 实现 TTS/SVC 分类注册、稳定 Provider ID、实例、版本、安装/健康状态、语言、音色、情绪/克隆/流式/取消、联网/费用和资源能力。
- 用 Fake TTS、Fake SVC 执行能力协商：不支持音色、语言、情绪、格式时准确拒绝，不暗中丢参数。
- 用户 Provider 选择不得自动变成付费云端；失败转移必须显式授权；Qwen 离线不能让其他 Provider 假死。
- Provider 只生成音频或转换歌声，不直接向微信发送；实际交付由 Whale Relay 执行且 Core 持有任务主权。
- Provider 降级、版本不匹配、凭据缺失、错误音频、超时与取消都应返回可诊断的安全状态；UNKNOWN 不显示成功。

## 验收
纯 Fake 引擎覆盖注册冲突、版本未知、状态降级、错误音色、云端未授权、失败隔离。执行 build、Node、UI、文档与隐私扫描，创建独立 PR；无真实模型/付费 API/生产配置/微信调用，未获批准不合并。

## H0 对照补充（2026-10-25，未派发）

- 增补 Fake 验收：无 GPU、配置迁移、敏感投影脱敏、输出 artifact 格式验证；未实现候选不得成为正式可选项。健康成功不等于试听、配置 APPLIED 或微信发送成功。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
