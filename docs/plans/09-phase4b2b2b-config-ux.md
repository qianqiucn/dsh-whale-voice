# Plan 09 · Phase 4B-2B-2b 多引擎配置交互与写入门禁

**状态：PLANNED。Phase 4B-2B-2a 已 INTEGRATED，非 VERIFIED。生产写入尚未获授权。**

## 本轮范围：OFFLINE 前端草稿
1. 独立 Provider 选择、模型、Voice Profile、语言、情绪/语速等能力相关参数；不兼容参数切换时明确清理或询问，不静默复用。
2. 本地/云端/自定义配置差异；凭据不得传回无授权前端、日志或公共 Capability。
3. 显示 DIRTY、PREPARED、CONFLICT、SAVED、PENDING_APPLY、UNKNOWN、APPLIED（仅可信 loaded revision）。保存不等于生效。
4. 复用现有 Coordinator prepareChange / validatePlan / expectedRevision / confirmedPlanId / execute / getStatus 状态机，计划随机 ID、过期与一次性消费、UNKNOWN/回滚证据规则不能降低。
5. 全部用 Fake Source Adapter、Fake Runtime、临时沙箱来做状态交互。

## 权威配置边界
WeChatAgent 权限由其支持的 Owner API/人工控制台管理；Bridge voice enabled 与 Worker voice_enabled 分层；Worker NEVER_WRITE；Sender automation PUT 的存在不代表 Core 被授权。不得直接编辑其它组件的 JSON。

## 后续写入阶段（必须另行授权）
只有在跨进程/单写者边界、Owner API、私有恢复存储、可信 loaded revision 证据与 Windows 文件行为经过审查后，才能讨论生产写入。未取得 loaded revision 的组件必须保持 PENDING_APPLY / UNKNOWN。

## 验收
Fake 保存、冲突、计划过期、云端未授权、部分恢复、组件断连、实时/Mock 隔离测试，完成 PR。绝不调用生产 PUT。