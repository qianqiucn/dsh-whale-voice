# 09 · Phase 4B-2B-2b：多引擎配置草稿/预览与状态 UX

**状态：PLANNED。** 前置：2B-2a `INTEGRATED`；05/06/08 的 Provider 与任务数据契约明确。**本轮仅 OFFLINE UI，不授权生产写。**

## 功能

1. 配置草稿支持 Provider、实例、模型、音色、TTS/SVC 类型与能力参数，切换 Provider 不复用不兼容的 Voice ID 或旧凭据。
2. 显示改动、验证、放弃、冲突（`expectedRevision`）、计划确认（`confirmedPlanId`）、过期与失败。
3. 分开 `SAVED`、`PENDING_APPLY`、`UNKNOWN`、`APPLIED`；无可信 loaded revision 绝不标 APPLIED。
4. Core/WeChatAgent/Sender/Worker 有不同权威 Owner；Bridge enabled 与 Worker voice_enabled 独立，Worker NEVER_WRITE。
5. 云端凭据不得进公共前端态/日志；自定义 API 必须先设计 URL、访问与密钥安全。
6. 没有 Owner 写接口不能从 Core 改组件 JSON；Sender automation PUT 有能力但仍无生产 Core 授权。

## 分阶段

- **2b-UI**：Fake source/temporary sandbox 上实现编辑、预览、冲突、状态与 UI 自动化测试。
- **2b-Owner**：组件 owner-side 写入、跨进程单写者、runtime apply 证据，需以后另行明确授权。

## 验收

涵盖错误版本/私有值泄漏、未授权云端、Provider 变化、保存/生效/回滚误报、离线状态。PR 不得启用生产配置写路由；完成停止。
