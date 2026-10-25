# 13 · Whale Relay（鲸递）：统一投递 Core、UI 模拟与 Native Hook 研究

**状态：PLANNED。** Whale Relay 是 Whale Voice 下的独立可替换交付子系统，不是另一套微信客户端。原 Voice Sender 的稳定路径必须保留。

## Relay-A：统一投递契约和威胁模型

- 一个全局 Whale Voice Task Manager 唯一拥有任务；Relay 只消费一次已授权 `deliveryId`，先冻结 backend 与目标，再提交。不得双队列重复创建任务。
- 后端注册为 `ui-automation`（现有 Voice Sender）和禁用的 `native-hook`（研究）。`auto` 必须先定义无副作用/UNKNOWN 时的切换禁止。
- 用户权限依赖 WeChatAgent Adapter 和 Sender 的最终独立安全检查；Bridge/Worker 双层闸门不合并。
- 统一请求/结果契约区分 `QUEUED`、`REJECTED`、`SENT_LOCAL`、`UNKNOWN`、有确实可信回执时的 server-confirmed；`ret=0`、HTTP 200、`dryRun=true` 不是可靠服务器确认。

## Relay-B：现有 UI Automation 适配

- 通过 Adapter 接入现有 Voice Sender 的配置/健康/任务，保持其目标核验、UIA 窗口安全、VB-CABLE 切换与恢复、取消、队列和设备保护。
- 只做分层协议与 Fake Adapter 验证；未经许可不执行真实快捷键、窗口切换、麦克风设置或微信发送。

## Relay-C：原生 Hook 独立研究

- 审核两位社区开发者的 Hook / WeChatAgent voice 接线研究证据；独立核对版本、许可证、DLL 来源、编解码(SILK/PCM)、目标 ID、发送回执、dry-run、异常与账号风险。
- 不借用 WeChatAgent 未公开功能冒充正式接口；不将来源不明 DLL 打包安装或要求关闭系统防护。
- 只有版本、许可、共存、目标身份、状态回执、可隔离测试和安全门禁全部通过，才申请进一步原型授权。

## 前端与跨场景

发送与安全页面的“鲸递”方式选择：稳定 `ui-automation`，原生/auto 继续灰显；显示后台焦点、设备、授权、风险、状态和来源信息。TTS/SVC 可共用 Relay，但歌曲文件与语音气泡按后端格式能力选择，不能硬把整曲塞进语音消息。

## 交付

Relay 架构/接口、Fake Backend/防重发测试、UI 原型与 Native Hook 研究文档，按 A/B/C 分独立 PR。不改生产 Hook/发送链，不重启微信；真实发送必须单独授权。完成停止。
