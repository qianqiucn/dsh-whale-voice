# 05 · Unified Core-A：TTS/SVC 与 Whale Relay 的系统边界

**状态：PLANNED。** 前置：02/03 多 TTS 契约稳定；04 平台接口审计可为 WeChatAgent 边界提供证据。

## 产品架构

- **Whale Voice Core**：Config Manager、Provider Registry、Model Manager、Voice Library、Audio Pipeline、全局 Task Manager、Capability/Status。是 TTS/SVC 生成任务的唯一编排者。
- **Whale Relay Core（鲸递）**：一个投递任务的一次执行与安全边界，调度 `ui-automation`（原 Voice Sender）、未来经授权验证的 `native-hook` 与其他允许的交付后端。**不独立拥有全局生成队列**。
- **WeChatAgent**：微信消息、账户和会话授权的必需平台依赖；不在 Whale Voice 重做微信 reader/账号/聊天 DB。
- **Provider 运行时**：各自隔离 Python/HTTP/其他进程。Core 不必把所有模型塞在单个 Node 进程。

## 任务契约

设计版本化任务：`taskId`、`taskType=TTS|SVC`、`providerInstanceId`、`voiceProfileId`、`inputDescriptor`、`outputArtifactId`、`state`、`progress`、`cancelPolicy`、`privacyScope`。TTS 输入是文本；SVC 输入是经过校验的音频+参考声音+可选伴奏。禁止强行使用同一合成接口。

**生成任务 taskId 与投递 deliveryId 分开。** Whale Voice Core 决定是否申请投递；Whale Relay 接受一次已授权投递，固定目标和后端并维护副作用边界；两个 Core 不得各自创建不受控可重发队列。

## 安全契约

`UNKNOWN` 不自动重发/自动后端切换；`SENT_LOCAL` 不等于微信服务器确认；Bridge/Worker 独立门禁，Worker NEVER_WRITE。保存≠应用，无 loaded revision 不标 `APPLIED`。云端隐私/计费需用户明确授权。

## 本轮交付

架构 ADR、模块边界、版本化任务/生成/投递协议、错误与恢复矩阵、兼容迁移计划、Fake Runtime/Delivery 契约测试、独立 PR。不得重构生产已运行服务、修改微信、安装 Hook 或执行真实发送。完成后停止。
