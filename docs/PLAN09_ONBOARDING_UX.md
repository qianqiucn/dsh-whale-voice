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

## 7. 0112 复核补正

- 事务面板的 prepare/execute/apply/recover 全部 `await` 适配器，带 busy、异常映射和请求 token；编辑草稿/切换上下文后的迟到结果被丢弃。
- 预览在 prepare 时冻结为具体字段/值（`data-testid=plan09-frozen-preview`）；确认使用冻结后的 planId，UNKNOWN 后禁止 prepare 与 apply，只允许 `recover/getStatus` 只读查证；投影保留 opaque revision、每源步骤与 PARTIALLY_APPLIED。
- 依赖证据按 workspace/profile/manifest/capability/mode 作用域共享；关闭/取消/切模式会失效当前作用域定时器；失败原因随本次操作传入，不再用全局状态。
- 仅浏览按当前 `manifestRevision` 记忆；能力 revision 变化不再自动弹窗，而是页面提醒并可手动重开。
- 向导和页面使用同一份实际 `sourceLayout`/投递选择；唱歌 cloud/existing 不再要求本地 RVC/分离，改用 cloud/gateway；鲸音 Core 与鲸递发送模块分离，投递能力不作为生成前置。
- Voice 切换模式会同步 engine/provider（cloud→cloud、existing→custom、local/cpu→local）；云端授权、Provider kind、唱歌音色与 engine 绑定统一校验；任何草稿变化使旧预览/旧计划失效。
- UI 证据新增：harness 隔离适配器为异步；另有一条 Playwright 浏览器 → `exposeFunction` → 真实 `createConfigCoordinator` + Fake Source + 临时 sandbox 的端到端保存链（断言 sender 保存值、saveCount、prepare/execute/apply 调用）。

## 8. 0113 复核补正

- 已发出的 execute/apply 与已知 transactionId 独立于草稿：编辑仍保留事务与只读查证入口；UNKNOWN 不因编辑/切页丢失 ID。
- prepare 的 null/异常、execute/apply/recover 异常、重复点击均有 busy 收束和明确 FAILED/UNKNOWN；phase 以权威 state 为准，不再被旧 result 投影覆盖。
- 准备阶段的上下文/授权变化会把计划标为 stale 并禁止确认；确认前再次校验草稿与授权。
- 依赖检查在切模式、旧 scope 退出与组件卸载时统一取消；迟到结果不能复活已取消项。
- Voice 切引擎会同步模式；Singing existing 保持 gateway；模式/引擎/Provider/音色/依赖按同一组合校验。

## 9. 0114 复核补正

- 事务权威升级为按 workspace/profile/feature/manifest 的共享 store：execute/apply 在途与结果跨页保留并通知当前页面；busy 为全局互斥，重复 apply 不再调用两次。
- 准备快照绑定 draftSerial 与 contextSerial；返回页面后草稿/上下文不一致则旧计划不可确认；旧 profile 的事务不会复制到新 profile。
- 响应通道丢失（未能确认是否写入）按 UNKNOWN 处理，不自动重写；“结束此事务”只在已确定结果时可用（见 §10），未决 UNKNOWN 不因缺少 transactionId、编辑草稿或点击重置而消失。
- 依赖按真实共享身份隔离：Core/Sender/WeChat 跨 feature/engine 复用；GPU/RVC/Gateway/分离等按 mode+engine 隔离。取消后向导展示订阅共享 store，不再停留在 checking。
- 真实协议映射：UI Provider 目录 ID 映射到现有 `tts.provider` 枚举（qwen-local/cloud/custom），cloud/existing 已用真实隔离 Coordinator 验证保存；未扩 writer 白名单。
- 授权/上下文变化同步清空旧预览；手动切 Singing Gateway/RVC 不会自动改旧音色，需按中文校验重新选择。

## 10. 0115 复核补正

- 事务面板的实际运行逻辑改为调用共享 reducer（`plan09ReduceTransaction`）：准备快照、已发出操作、未决结果与确定终态都在同一身份条目里，编辑/切页/重进不再各自持有副本，也不再保留未接入的纯模块状态逻辑。
- 事务身份按 `workspace/profile/feature`（`plan09TransactionKey`）而不是 manifest/向导版本：只切换 `manifestRevision` 不会生成一个看似干净的 DIRTY 事务，旧的 UNKNOWN 仍保留并可只读查证。
- 操作结果只认 Coordinator 自己的 `state`：`null`、`undefined`、`{}`、仅 `{ok:true}` 或无法识别的结构一律为 UNKNOWN，禁止 prepare、apply 与“结束并开始下一份”；`state:PREPARED` 视为未执行的拒绝。SAVED/APPLIED/PARTIALLY_APPLIED/CONFLICT/FAILED 等明确 state 才按原义显示。
- 未决 UNKNOWN（含无 transactionId 的响应丢失）不能通过重置清除；只有 SAVED/PENDING_APPLY/APPLIED/PARTIALLY_APPLIED 等已确定结果可显式结束，并将旧事务记入历史。
- 每个操作带单调序号（`opSeq`/`inFlightSeq`）：迟到响应只结算它所属的操作；编辑草稿不会释放执行中的互斥；迟到的 prepare 成功或拒绝都不会覆盖当前计划。
- 草稿内容与冻结计划不一致（例如换页回到默认值）时显示内容不一致提示，确认被拒绝，并允许直接重新准备当前草稿，不再需要额外编辑才能恢复。
- 共享依赖的未完成操作按发起页面退出取消（关闭向导、切模式、卸载、切页），已完成的共享证据仍跨页复用；所有写入都会通知同一身份的当前观察者，不再只更新原组件。
- 作用域 helper 统一由 `core/plan09-ux-internal.mjs` 提供（`plan09IdentityScope`、`plan09EngineScope`、`plan09DependencyScope`），浏览器运行逻辑不再重复定义同一事实。

## 11. 0116 复核补正

- 可信“未写入/已回滚”的失败可以显式结束关联并准备下一份草稿：Coordinator 只有在适配器声明 `writeOutcome: NOT_WRITTEN` 且此前已保存步骤回滚成功时才返回 `FAILED`；只读恢复再次给出 `FAILED/committed:false/recoveryRequired:false` 时仍保留该结论。结束只清空当前关联并把旧事务记入历史，**不重放已消费的计划**；普通失败不标注“未写入”，UNKNOWN 继续锁存。
- 准备期间发生上下文/授权变化时，迟到返回的旧计划直接标为 stale（`CONTEXT_CHANGED`），确认按当前权限重新校验，同时允许直接重新准备当前草稿；不再出现“显示 PREPARED 但 prepare/confirm/reset 全部禁用且无提示”的死角。
- 依赖身份（workspace/profile/manifest/capability）变化时，除了卸载清理，还会用旧身份快照取消本页启动的未完成检查；切 profile/revision 后旧响应不会变成 ready，返回原身份看到的是 cancelled 而不是 ready。
- 已完成共享证据的跨页复用、按 owner 取消、identity 广播与 reducer/序号门禁保持不变。

## 12. 0117 复核补正

- 跨页卸载后的迟到 prepare 结果不再依赖已卸载组件保存的旧上下文：面板把每个事务键**当前渲染**的上下文串记录在模块级映射中；prepare 完成时用该实时值与发起时的 `inFlightContext` 比较，不一致即标记 `CONTEXT_CHANGED` / stale。
- 增加“计划出现即复核”的 effect：共享条目一出现 plan，就用当前上下文串与 plan 的 `contextSerial` 比对，覆盖“旧组件在别的页面完成、返回后才看到计划”的时序。
- 结果：跨页迟到的成功计划显示中文过期提示，确认继续被当前授权拦住，但可直接重新准备；若在计划完成前已回到原上下文（或改回原上下文）仍可合法确认。
- 非阻断校正：`noWriteConfirmed` 提示只在 `FAILED` 阶段显示；随后若查证丢响应转 UNKNOWN，旧“未写入/可结束关联”提示不再出现，UNKNOWN 继续锁存。
- `FAILED` 语义按 Coordinator 契约区分：execute 的确定未写入/已回滚（`NOT_WRITTEN` + rolledBack）与服务已保存后 apply 被拒（`committed=true`）都属于确定失败、可结束关联，但只有前者会被标注“未写入”。
