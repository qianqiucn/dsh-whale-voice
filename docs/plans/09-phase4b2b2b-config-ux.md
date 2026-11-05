# Plan 09 · Phase 4B-2B-2b 多引擎配置交互与写入门禁

**状态：PLANNED。Phase 4B-2B-2a 已 INTEGRATED，非 VERIFIED。生产写入尚未获授权。**

## 长期新增 · 不会代码的用户优先 UI 验收

[Novice First 产品规范](NOVICE_FIRST_PRODUCT_STANDARD.md) 必须用于 Whale Voice 与 Whale Singing 两个页面。首次弹窗用简体中文说明“检查依赖→选可用方案→只安装所选项→开始试听/保存”，允许稍后再说、重新检测、取消与失败恢复；只显示普通人理解的“本机运行/云端服务/需要安装”，把版本/端口/CUDA 放在高级详情。不要求普通用户手动安装 Python、编辑 JSON 或使用终端。RVC 为 Singing 首发主线，Seed-VC 后续可选、不预装。当前阶段仅 Fake UI，真实安装/生成/微信发送仍禁用，不可虚报完成。Playwright 验收须覆盖初访/复访、无显卡、断网、安装失败/未知、窄屏、键盘和中文错误恢复。

## 2026-10-25 · Whale Voice/Whale Singing 分离页面与首次弹窗（原 Plan 09，仍 PLANNED）

前端**两个独立入口**：`Whale Voice · 语音气泡`（规划 route `voice-bubbles`）；`Whale Singing · 唱歌`（规划 route `singing`）。共享 **Whale Audio Core（鲸音核心）**；具体流程与字段见 [双前端及首次依赖规范](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)。

当前 `client.template.js` 有 **八页** NAV（overview/settings/permissions/safety/studio/emotions/activity/advanced），`pages.js` 承载页面内容，`WhaleVoiceApp` 内有 `Modal`/SetupWizard/ComponentsDialog。真实八页既有 INTEGRATED，不可把新界面当作已经实现；建议先在离线 Fake 层规划加两条 route，保留原八页、音色中心、旧配置信息及组件管理。

- **首次进入各功能都应单独显示依赖选择弹窗**；语音页列 TTS 本地/CPU/云端择一、音色与可选 Relay/WeChatAgent 投递依赖；唱歌页列合法曲源、RVC/SVC 可选 Worker、条件分离与混音工具、音色使用权、可选音频文件交付。不得以进入 Voice 后自动跳过 Singing 首次弹窗。
- 弹窗显示已安装/未知、推荐/可选/仅发送需要的依赖、许可、来源、体积未知项、GPU/CPU 兼容、进度/取消/失败恢复；`仅浏览` 可以关闭进入功能页的只读/演示状态，不自动下载模型，也不默认为已装或可用。
- **重用**现有 Modal、首次 SetupWizard、ComponentsDialog；先后顺序为全局 SetupWizard→目标 feature 的首次弹窗，不允许叠弹；同一 feature 第二次正常进入不再骚扰，依赖失效/新版本提示有手动重开入口。
- 当前仅 Fake Installer + Fake Capability 演示，不改变生产开关、模型文件、API 凭据或真实 Host；严格保持 SAVED != APPLIED、UNKNOWN 防重发和已有八页布局无回归。
- DoD：两新导航可访问、移动/窄屏布局、Esc/焦点恢复/按钮、首访/二访/跨功能/重新检测/无 GPU/离线/取消/仅预览的正负 Playwright 回归，真实八页 Host 验收另行授权。

## 2026-10-25 · AI 翻唱离线配置 UX 追加项（仍 PLANNED）

参考 [蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)，在既有 OFFLINE 配置草稿新增源音频授权、RVC/SVC 模式、音色同意、已审计 Gateway 健康/模型、音高 -12..12、人声/伴奏增益、预览/保存、投递授权状态。Backend OFFLINE、无 GPU、下载无许可证时禁用真实运行。
- 上游整合包安装/升级、端口重配、网络、现有 WeChatAgent 设置均不在默认权限内。
- 测试 Fake Backend/Model unavailable、Rights missing、Timeout/Cancellation、No delivery permission、SAVED != APPLIED、Mock 假绿灯不变可用。
- 翻唱优先级上升不等于取得 Phase 4B-2B-2b 的生产写入许可。

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