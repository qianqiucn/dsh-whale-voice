# Plan 09 — 双页面入口、首次依赖向导与隔离配置交互

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本文件描述的是离线 Fake UI 与草稿行为，不代表真实
安装、Provider、GPU、媒体、微信或发送已接入。

## 1. 两个独立入口

| 入口 | 页面 | 作用 |
|---|---|---|
| 语音气泡 `voice-bubbles` | `Plan09FeaturePage` | 文字转私聊语音气泡的本机 / CPU / 云端 / 已有服务草稿 |
| 唱歌 `singing` | `Plan09FeaturePage` | RVC 标准翻唱、人声分离、音高/增益草稿；SVC 仅说明，不安装 |

两个入口共享同一份音色、Provider、依赖与任务展示来源；不创建第二套 Task/Delivery 权威或凭据库。
原八页、音色中心、组件管理与全局 SetupWizard 保留。

## 2. 首次说明与依赖向导

- 全局 SetupWizard 优先；全局向导打开时，目标 feature 向导不叠加。全局向导关闭后，若该 feature
  尚未确认，再打开对应向导。
- 状态按 `workspace/profile + feature + manifestRevision` 存储在
  `wv.plan09.wizard.v1.<workspace>.<profile>.<feature>.<revision>`；记录
  `introAcknowledged`、`selectedMode`、`verifiedCapabilitiesRevision`。
- Voice 的确认不覆盖 Singing；两个 feature 各自首次提示。
- 关闭/仅浏览可进入显式演示；复访不反复弹；能力 revision 变化时显示提醒并可手动重开。
- `introAcknowledged` 只表示读过说明，**不是 READY、安装成功或生产授权**。

## 3. 按模式的最小依赖

| 模式 | 条件依赖 | 说明 |
|---|---|---|
| 本机 GPU | `gpu` | 未知/无 GPU 显示未知或阻塞，不冒充可用 |
| 仅 CPU | 无 GPU | 速度与唱歌质量未验证 |
| 云端 | `network` | 需要授权与连通性；费用与文本传输单独确认 |
| 已有服务 | 无 | 复用已安装服务；仍需真实探测才可标为已知 |

依赖分为必需、可选、仅投递（Sender/WeChatAgent）与条件组；缺另一功能或微信依赖不阻断浏览和草稿保存。
共享已验证项不重复模拟安装。

## 4. Fake 安装与失败恢复

只有明确点击“演示安装”才驱动 UI 内的 Fake 检查/进度/取消/失败/重试；安装与加载/验证分开。
失败原因包括无 GPU、断网、空间不足、许可缺失与未知，均有中文原因和重新检查/切换动作。
**不会下载文件、执行脚本或调用真实安装器。**

## 5. 配置草稿与事务交互

- 语音气泡：引擎（本机/云端/自定义）、Provider、模型、音色 Profile、语言、情绪、语速 0.5–2.0、
  音量 0–100、演示文本。切换引擎会清理不兼容字段并提示。
- 唱歌：RVC/SVC/Gateway、授权素材、音色同意、音高 −12..12、人声/伴奏增益 −12..12、
  分离与混音、投递申请。SVC 明确标记为后续可选且不安装；来源/权限不足禁用相关演示。
- 事务面板复用 Coordinator 的可观察状态语义：DIRTY → PREPARED → 精确确认 → VALIDATED → SAVED →
  PENDING_APPLY / APPLIED；同时展示 CONFLICT（计划过期、确认 ID 不匹配、revision 冲突）与 UNKNOWN。
  planId、TTL、一次消费与 expectedRevision 均在隔离演示事务中体现。
- UI 面板是**前端隔离演示事务**，写入 localStorage/内存，不写生产配置；真实 Coordinator 行为由
  `test/plan09-ux.test.mjs` 使用 Fake Source/Runtime 和临时 sandbox 调用
  `prepareChange/execute/apply` 验证。SAVED ≠ APPLIED ≠ SENT。

## 6. 边界

- 不接收、存储或输出真实密钥、聊天、音频；素材只用虚构引用。
- 无真实素材抓取/上传、无真实播放/合成、无真实微信发送/安装/下载。
- Worker NEVER_WRITE、Bridge/Worker 双门、WeChatAgent 身份权限独立继续保留。
- 真实 Provider/GPU/媒体/设备/微信/安装为后续阶段；本 UI 不改变其授权状态。
