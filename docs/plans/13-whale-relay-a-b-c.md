# Plan 13 · Whale Relay（鲸递）统一投递 Core · A/B/C

**状态：PLANNED；架构方案已被用户提出并认可，正式实现尚未开始。**

## 2026-10-25 · 共用鲸音 Core 与双入口的投递边界（原 Plan 13，仍 PLANNED）

产品共享生成后端已确定命名 **Whale Audio Core（鲸音核心）**，Whale Voice 语音气泡与 Whale Singing 唱歌为两页；鲸递 **Whale Relay Core** 原名不变。详见 [双入口首次依赖规范](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)。
- 两页可各自选择生成/预览/保存，只有用户另外批准真实投递后才使用 Relay；因此**不能把 Sender/WeChatAgent 安装列为只打开页面或只生成音频的通用强制依赖**。
- Relay 的能力探测可供首次弹窗展示交付“可用/不可用/未知”，但前端安装勾选不等于授予微信发送许可；仍由 WeChatAgent 验证目标，Worker NEVER_WRITE、UNKNOWN 不自动重发。
- 声泡与完整歌曲分别按 Backend 支持的格式/时长/文件能力路由，不因两页共享 Core 就默认一条发送管线都支持；真实文件发送与音频设备操作分别验收与授权。

## 2026-10-25 · 翻唱输出纳入鲸递后端交付（原 Plan 13）

用户希望将 astrbot_plugin_rvc_svc 的能力接入鲸递。正确架构为 Whale Voice Core 生成、Whale Relay Core 一次安全投递；详见 [蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)。Relay 不承载歌曲抓取、GPU 推理、模型、音源授权源头。
- **13-A（先于 12-A）**：Fake Backend 消费 outputArtifactId、deliveryId、targetIdentity、authorizationProofRef；目标复核、格式/时长能力、去重、一次提交、UNKNOWN 不重发。
- **13-B**：保留 Voice Sender UI Automation 适配器。先审计能否交付歌曲文件、格式/大小/时长及可信回执；若只支持语音气泡，则长歌返回 UNSUPPORTED_FORMAT 或本地保存，不强行模拟。
- **13-C**：Native Hook/DLL/SILK 继续仅研究候选，绝不因翻唱需求提前部署。保持 Bridge/Worker 闸门、NEVER_WRITE、SAVED != APPLIED 与 UNKNOWN 保护。
- Fake 回归覆盖未授权目标、群权限撤销、超长音频、文件交付禁用、重复请求、提交超时、UNKNOWN、设备状态变化、取消已提交任务、无服务器回执。

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

## H0 对照补充（2026-10-25，未派发）

- Relay-A 状态测试补充 QUEUED/REJECTED、HTTP 200、ret=0 和 dryRun=true 不构成服务端确认；auto 在明确无副作用和切换规则之前保持禁用。
- 前端原型明确显示后端、权限、焦点/设备限制与状态来源；未验证的 native-hook 不可选择。歌曲文件与语音气泡依已核验后端能力分流。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
