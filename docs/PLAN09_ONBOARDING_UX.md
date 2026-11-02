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
| 云端 | `cloud` | 需要授权与连通性；费用与文本传输单独确认；本地 RVC/分离不再强制 |
| 已有服务 | `gateway` | 复用已安装服务；仍需真实探测才可标为已知 |

依赖分为必需、可选、仅投递（鲸递发送模块/WeChatAgent 桥）与条件组；唱歌按 `MIXED`/`CLEAN_VOCAL`
决定是否需要分离，缺投递依赖不阻断浏览和草稿保存。共享已验证项不重复模拟安装；内部 `core` 兼容 ID
保留，对外称鲸音 Core / 鲸递 Core。

## 4. Fake 安装与失败恢复

只有明确点击“演示安装”才驱动 Fake 检查/进度/取消/失败/重试；安装成功后必须再点“验证能力”，
检查通过才显示演示就绪。安装/验证状态放在跨页面共享的 store 中，取消会使迟到回调失效，切页/重开
不会把已就绪项重置为未检查，也不会重复安装。失败原因包括无 GPU、断网、空间不足、许可缺失与未知，
均有中文原因和重新检查/切换动作。**不会下载文件、执行脚本或调用真实安装器。**

## 5. 配置草稿与事务交互

- 语音气泡：中文 Provider/音色方案（本机 Qwen、隔离云端 Fixture、自定义本机服务）、语言、情绪、
  语速 0.5–2.0、音量 0–100、演示文本；Provider/模型/Profile 的高级自定义默认折叠。切换引擎会清理
  不兼容字段（含音色），云端未授权时禁止预览/保存。
- 唱歌：RVC/Gateway、音色方案、`fixture://` 虚构素材引用、授权/同意、素材类型与混音、音高 −12..12、
  人声/伴奏增益、投递申请。SVC 明确标记为后续可选且不安装；云端模式自动切到 Gateway；来源/权限/
  数值不合法均阻断预览与保存。
- 事务面板不再使用前端玩具状态机：它只调用注入的 `window.__WHALE_PLAN09_CONFIG__` 隔离适配器
  （`getContext/prepareChange/execute/apply/recover/checkDependency`），显示真实 Coordinator 结果投影：
  PREPARED → 精确确认 → SAVED → PENDING_APPLY/APPLIED，以及 CONFLICT/UNKNOWN/FAILED。
  编辑草稿会作废旧计划；UNKNOWN 只能“只读查证”，不重新 prepare 掩盖未知；没有适配器时按钮禁用并
  显示“未接入配置适配器”。
- 语音草稿仅映射到既有 Coordinator 可写字段 `senderService.tts.provider/model/voice`；语言/情绪/
  语速/音量/云端真实调用显示为“草稿未应用”，不会另存无关 Bridge 变更。唱歌草稿没有对应可写字段，
  面板明确只读，不写配置。SAVED ≠ APPLIED ≠ SENT。
- Node 测试以同一适配器契约调用真实 `ConfigCoordinator`（Fake Source/Runtime + 临时 sandbox），
  覆盖确认 ID、TTL、一次消费、revision 冲突与待生效；UI 测试用 harness 隔离适配器记录调用。

## 6. 边界

- 不接收、存储或输出真实密钥、聊天、音频；素材只用虚构引用。
- 无真实素材抓取/上传、无真实播放/合成、无真实微信发送/安装/下载。
- Worker NEVER_WRITE、Bridge/Worker 双门、WeChatAgent 身份权限独立继续保留。
- 真实 Provider/GPU/媒体/设备/微信/安装为后续阶段；本 UI 不改变其授权状态。
