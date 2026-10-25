# Plan 13 · Whale Relay（鲸递）统一投递 Core · A/B/C

**状态：PLANNED；架构方案已被用户提出并认可，正式实现尚未开始。**

## 身份与职责
**Whale Voice Core** 持有全局 taskId/deliveryId、统一调度、授权与状态。**Whale Relay Core（鲸递）** 对单次交付作目标二次验证、后端锁定、队列串行、取消边界、投递回执和设备恢复。**WeChatAgent** 是微信平台依赖，处理账号、会话与身份授权，不在 Whale Voice 内重做第二套微信读取器。

## Relay-A · 契约与安全
- 定义 \`DeliveryBackend\` 的 capabilities/health/resolveTarget/submit/status/cancel；状态必须区分预检、已提交、SENT_LOCAL、UNKNOWN、服务端确认（仅可信回执）。
- 固定后端于第一次提交前，同一 deliveryId 不得同时从两个后端提交；UNKNOWN 或超时可能已提交时绝不自动切换/重发。
- 目标合法性、白名单、私聊/群聊授权、Worker 最终闸门、同一唯一队列和去重独立测试。

## Relay-B · 保留并封装 UI Automation
将现有独立 Voice Sender 作为 \`ui-automation\` 适配器纳入 Relay，而不是删除重写。保留 VB-CABLE、窗口焦点校验、录音取消、设备恢复、单任务锁、安全白名单和异常回执。生产适配要单独授权，Fake 先验收。

## Relay-C · 原生发送研究
对现有两位社区开发者的微信原生语音源码/WeChatAgent 补丁、SILK 转换、Hook/DLL、\`wechat_voice_say\` 与 \`wechat_sing\` 案例进行静态审查与兼容性核验。关键问题是 dryRun、ret=0 accepted_unconfirmed、实际气泡/回执、不确定结果、目标 ID、版本与许可证。未达到准入条件前保持 RESEARCH_CANDIDATE，原生 Hook 控件必须禁用，不能替换稳定路径。

## Safety
规划紧急停止、游戏模式、不抢焦点、设备恢复、失效取消与任务过期策略。安全 API 未实现时不能显示“生效”；急停不能假装已经撤回微信消息。

## 验收
分 A/B/C 三个独立 PR 与阶段报告。先 Fake Delivery 测试，真实微信发送/Hook/服务控制/音频设备操作必须分项获得明确授权；未经批准不得下载/运行未知 DLL。