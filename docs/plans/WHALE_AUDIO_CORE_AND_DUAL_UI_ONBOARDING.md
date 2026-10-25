# Whale Audio Core（鲸音核心）· 双功能页面与首次依赖向导规范

**架构/产品决定 · 2026-10-25 · PLANNED / NOT_DISPATCHED · ChatGPT 维护 · 用户提出并要求纳入既有计划。**
**权威关联**：[RVC/SVC 翻唱集成蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)；原 Plan 05、08、09、12、13、14；[总计划表](README.md)。
**本文件是规划设计而非工程合并/安装授权。Plan 01–14 编号不变。**

## 1. 名称与边界（唯一推荐）

- **共享后端正式产品名称：Whale Audio Core（鲸音核心）**。它统一承载 TTS、SVC/歌声转换、音色 Profile、模型/Provider 适配、音频 Artifact、任务/资源调度、许可与状态。UI 名称不是第二个后端。
- **前端功能 A：Whale Voice（语音气泡）**：以文本→语音、音色/情绪/语言选择、试听、短语音与可选语音气泡交付为主要场景。
- **前端功能 B：Whale Singing（唱歌）**：点歌/授权曲源、人声伴奏分离、RVC/SVC 转换、混音、预览/保存、可选音频文件投递。非歌词→旋律自动作曲。
- **独立的 Whale Relay Core（鲸递）不重命名**，只处理目标二次校验、固定后端一次安全投递及可信回执；WeChatAgent 仍拥有微信账号/会话/权限；不得把模型、音源抓取或 GPU 作业塞进 Relay。
- **品牌与兼容性**：仓库 `qianqiucn/dsh-whale-voice`、NPM/package/DSH 插件标识 `dsh-whale-voice`、现有 `whale-v1`、legacy 配置键/Provider ID、Host 路由、API/Artifact schema、客户端槽位暂不更名/迁移。未来实现阶段由 Plan 05 产出单独的公开显示名与内部符号映射、向后兼容/迁移与回退表；在本轮只是**逻辑 Core 的对外命名**，不破坏已验收 Phase 4B-2B-2a/PR #16。
- 旧文档中的 `Whale Voice Core` 如涉及 TTS+SVC 共用核心，**逻辑上视为 Whale Audio Core（历史旧称）**；若单指语音气泡工作流，继续使用 `Whale Voice`。原历史快照不批量替换。

## 2. 前端分开，但不复制服务

现有 `client.template.js` 的 `NAV` 为八页：overview、settings、permissions、safety、studio、emotions、activity、advanced；`pages.js` 为具体页面；`WhaleVoiceApp` 使用单 `page` 状态、现有 `Modal`、`SetupWizard`、`ComponentsDialog`。实际现有八页/组件管理已经有 INTEGRATED 的历史验收；下面的新两页是**PLANNED**，不能声称已存在或真实可用。

未来页面结构首选保留原八页路由和旧功能，并在主导航增加独立入口（先离线原型，不擅自更改运行版）：
- `voice-bubbles`：显示 **Whale Voice · 语音气泡**，语音文本输入、Provider/voiceProfileId、试听与授权交付按钮。与旧 `settings`（语音设置）及 `studio`（音色中心）互相跳转，不移除已验收旧页。
- `singing`：显示 **Whale Singing · 唱歌**，曲名/用户上传的授权音源、来源许可、SVC 后端与 voiceProfileId、音高/人声/伴奏参数、分离/转换/混音进度、试听/保存、可选文件投递。
- 共享的音色中心、组件管理、权限、任务与日志保持**一份数据源**，只在任务 UI 上按 `kind=voice-bubble | singing` 过滤或区分；Shared Artifact 和 Provider 状态必须能追溯来源，禁止两个页面各建孤立任务库、Delivery ID 或凭据存储。
- 导航组可以展示 **创作 / 语音气泡 / 唱歌**；新增两页以后页面数才可能从 8 变为 10。不得将组件弹层当成第九个页面，也不能把计划草稿冒充现有 INTEGRATED。移动/窄屏应允许滚动/分组，键盘可聚焦，仍保留旧页面与外部入口。

## 3. 每个功能“第一次进入弹窗列依赖”，而不是强制安装

功能首次被访问时，**分别触发各自的 `FirstUseDependenciesDialog`**；即使另一功能配置完成，也不能直接跳过本功能首次说明。弹窗与现有全局 SetupWizard/ComponentsDialog 共用弹层基础组件、能力探测与安装/许可状态，不生成两套安装器或同时叠两个 modal。

**第一次进入判据**：每功能、每 workspace/profile、按其 `manifestRevision` 保存 `introAcknowledged / selectedMode / lastVerifiedCapabilityRevision`。第一次进入弹一次并展示依赖清单；用户关闭、跳过或“以后再说”可浏览**只读页面/说明/演示（显式 Mock）**。只有依赖就绪才可解锁真实生成；只有投递专属权限就绪才可解锁发送。安装失败、组件变化、新版本不兼容、主动“依赖管理”时可重开；**同一页面反复进入不能无限弹窗**。不能只靠浏览器 localStorage 把 `installed` 伪造为已验证，可信状态来自现有只读 Host/Owner 能力 + 未来受授权安装管理器。

**弹窗字段**：功能名/说明、所选工作模式、推荐与可替代 Provider、必需/可选/投递阶段依赖分组、来源/版本/许可、体积范围（未知则明确未知）、磁盘/内存/CPU/GPU/CUDA 要求（探测不到写 UNKNOWN）、权限及网络/收费声明、当前安装状态及证据时间、安装进度/取消/失败恢复、管理组件入口、`安装所选项`/ `使用云端或已有服务` / `稍后再说`。可逐项选择，不得默认全选大模型。明确声明安装与“已配置/已加载/已验证可用”不是同一件事。所有按钮须可访问，允许 Esc/取消；危险安装必须经单独确认。

### 3.1 Whale Voice · 语音气泡 首次依赖

- **共同基础**：能访问 Whale Audio Core 只读能力、已支持的 DSH Host Adapter、Feature 状态；若未就绪，弹窗只提供说明/重新检查。
- **生成（择一）**：已安装可信本地 TTS Provider 与获授权 voice asset；**或**无需本地模型、由用户明确批准的云端 Provider/API/网络费用；**或**轻量 CPU Provider。用户不能被强制安装 Qwen/Whale-v1，本地模型/专属音色并非全局默认。
- **要发语音气泡才需要**：受支持的 WeChatAgent 身份与聊天权限、Whale Relay 的已验投递能力、既有 Voice Sender UI Automation 或明确支持的其他后端；缺少这些时仍可离线合成、试听和保存，不能错误宣称发出了微信消息。音频设备操作/真实发送必须独立授权，Worker NEVER_WRITE 与 Bridge/Worker 门禁不变。
- 可选：额外音色包、FFmpeg/编码器**仅在某选用 Provider 真需要时列为必需**，否则不强制。

### 3.2 Whale Singing · 唱歌 首次依赖

- **共同基础**：同一 Whale Audio Core、Artifact Store/任务能力、素材使用权与目标音色/模型授权。
- **生成（择一）**：经 Plan 07 许可/API/版本审查后的外部 RVC 或其他 SVC Gateway 及用户合法模型；预处理/人声分离 UVR/MSST/Demucs **只在输入确需分离时为必需**；混音/格式工具（如 FFmpeg）在所选方案要求时列出。云端独立歌声服务只有完成隐私/收费审核并获许可才作为可选替代，不假装内置。
- 缺少显卡不能直接锁死页面：只显示受支持 CPU/远端模式；若当前后端确实需要 GPU 且无可用替代，显示 `UNSUPPORTED_HARDWARE` 并允许仅查看/保存既有产物。
- **完整歌曲投递是后续可选依赖**：WeChatAgent/Whale Relay 已验证音频文件发送能力及授权目标；若仅有 Voice Sender 语音气泡且时长/文件不支持，默认仅预览/保存，不假设会在微信发出。未知版权、不可使用音色或下载未授权 -> 不开始生成/发送。
- 外部 `astrbot_plugin_rvc_svc` 不是本产品必装插件；独立 RVCSVC-API 许可未明时不得内嵌/自动下载，先采用原创 Fake Adapter+只读探测。

## 4. 安装状态、权限与页面跳转契约（拟定，待后续版本化）

**计划中的 API 不是现有 API**：
- `GET feature-dependencies?feature=voice-bubble|singing&profileId=...` 返回 `feature, manifestRevision, modeOptions, requirements[], aggregateStatus, verifiedAt, sourceRevision`。
- Requirement 字段：`id, appliesTo, essentiality(REQUIRED|OPTIONAL|DELIVERY_ONLY|CONDITIONAL), versionConstraint, platformSupport, providerId?, licenseRef?, installMethod, downloadSize?, resourceEstimate?, state, evidence`。
- `state` 限定 `UNKNOWN | NOT_INSTALLED | INSTALLED_UNVERIFIED | NEEDS_UPDATE | READY | BLOCKED | INSTALLING | FAILED`。无可信 Host 检测 = UNKNOWN，不可从前端按钮显示/Mock 数据推断 READY。
- 当前界面进度/持久数据采用隔离草稿，独立于真实配置 `SAVED/APPLIED`；模态对话关闭只保存 acknowledgment，不改变安装和权限状态。
- 真正安装 API 必须未来专门设计、签名/哈希/许可证/显式批准/受控目录/最小权限/超时/取消/安装失败清理/重试幂等；**本轮与 Plan 09/14 的 OFFLINE 草稿只允许 Fake Installer**，不能写任意文件或运行 Shell/Python/Pip。
- 所有探测、下载/安装、启动、API 凭据录入、生产配置 apply、音频设备操作、微信发送**分别授权**。依赖安装成功不是用户批准后台任务或聊天发送；安装不自动启动模型，不自动启用云端付费 API。

## 5. 拟定 UI 交互（正/负向）

1. 首次打开 Voice：探测共同依赖 → 展示 Voice 专有 modal → 选择本地/CPU/云端模式及显示最小安装项 → `稍后再说`可进入只读页面；选择“安装”才进入额外同意界面（本阶段 Fake）。
2. 随后首次打开 Singing：必须展示 **Singing 自己的**分离/SVC/混音选项，不能沿用 Voice 的已安装结论；共享 FFmpeg/资源可标已验证，不重复下载。
3. 再次进入 Voice/Singing：当清单与能力证据仍有效，不再次弹首次说明；通过“管理依赖”随时可手动打开。升级、缺失和损坏有可见提醒，但不死循环弹窗。
4. 依赖 UNKNOWN/离线、无 GPU、云端未授权、安装失败、用户取消、重装后资源丢失、权限拒绝：精准提示 + 禁用仅受影响动作，旧页面和另一功能不被拖垮。
5. 原有全局 SetupWizard（启动时未完成可自动弹出）优先展示；它关闭后才可能触发目标功能首次依赖弹窗；多个 Modal 必须串行，不得遮挡焦点/键盘/关闭行为。
6. 只有真状态 `READY` 才允许对应生成能力；离线或 Fake 不允许显示“已安装/可用/发送成功”。微信 delivery UNKNOWN 不自动重试，真实发出前必须复核目标与权限。

## 6. 路线映射与验收门禁（稳定 Plan ID）

- **Plan 05（Unified Core-A）**：确定 Whale Audio Core 名称、legacy API 映射、服务/依赖能力聚合与资源拥有者（契约，OFFLINE）。
- **Plan 08（Shared Core-C）**：共享模型/Artifact/Provider/任务和可验证 feature-dependencies manifest，最小依赖的选择与状态机。
- **Plan 09（配置 UX）**：先做两页及独立首次依赖模态的 **Fake UI**，复用 `Modal/SetupWizard/ComponentsDialog` 与原页面；新导航/流程未实装前不得称已 INTEGRATED。
- **Plan 12（Singing）**：连接唱歌专属分离/SVC/混音状态和目标声线授权，页面可重用音色库而非语音设置页。
- **Plan 13（Relay）**：语音气泡与歌曲文件分别基于已验证后端交付能力，不混淆 SAVED/DELIVERED；不强制安装 Relay 才能浏览/保存。
- **Plan 14（安装/发布）**：接入经过供应链审计的 feature-scoped Installer；离线、CPU、云端、GPU 模式与首次使用退出/取消/重进测试；未许可外部二进制不得自动安装。
- **Plan 07-A（下一个可先独立发送的审计）**：一并调查 RVC/分离/混音外部依赖的可检测性、Windows 安装来源与授权，输出 Singing 安装依赖矩阵；**不把现有 Plan 07-A 标 SENT**。
- **Plan 03-B** 保持 WAIT_USER_AUTHORIZATION；原 Plan 01、02、03-A 历史验收不变。

**分阶段 DoD**：原八页和组件弹窗不退化；双页各有独立入口；各首次弹窗只展示各自 mode 下真实必要依赖、跨页共享去重；无权限不下载/安装/真实投递；首访/二访/新版本/失败恢复/无 GPU/云端无密钥/仅浏览路径有 Fake 回归和可访问性测试。工程 PR、真实 Windows/Host 与发布许可各阶段另行验收。

## 7. 禁止事项

当前只保存本产品架构与 UI 行为决定，不更名仓库/已有代码/配置/API，不增加真实安装器，不触碰 DSH/WeChatAgent/Voice Sender/模型/微信，不重启服务、不合并 PR、不自动发送。许可未知的上游代码与权重不因“用户进入页面”而下载。遇到与既有安全和版本契约冲突，保留 legacy、标 BLOCKED 交给 ChatGPT 下一版细化。
