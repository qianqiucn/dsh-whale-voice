# Whale Voice · ChatGPT 长期规划记忆

> **文件用途：** 作为 ChatGPT 在后续新会话中恢复「用户长期要求、架构决定、与 DeepSeek 的协作方式、计划编写习惯」的持久记忆入口。**只读本文件还不够**，具体实施必须以最新仓库代码、Git/PR/CI、真实验收和权威契约为准。
>
> **维护者：** ChatGPT（计划与 GitHub 协调角色），不是 DeepSeek 的日常工作任务。
>
> **建立：2026-10-25。** 禁止写入用户凭据、微信身份、私人聊天、联系人、参考音频、桌面截图和生产机器路径。

## 最新正式验收（2026-10-25）· 05-B REVIEW_REQUIRED，05-B-F01 SENT

[PR #22](https://github.com/qianqiucn/dsh-whale-voice/pull/22) OPEN/非Draft/0 reviews，HEAD `08a8f64ee9b6a6ca859a9ed734d2122950c46a73`，base为父#21分支 `feature/plan05a-whale-audio-core-contracts` @`da3d0f7f34df99f11d21cf3a656adcfaa206ce25`；父PR未变、未合并。相对父精确三added +1371/-0；[CI40239317990](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40239317990) build/ui全成功。
ChatGPT独立复跑V28+父81共109/109 PASS（Node v24.22.0），并复核三文件源码；DS全量285/284/1、UI24/24、本机build为报告值，ChatGPT核查相应CI成功，未在本地重跑全仓库/UI。

**额外探针发现一项P2契约缺口**：observationsByFeature中任一必填feature值显式undefined时，被底层可选参数默认行为当成{}接受。2个activeFeature×2个受影响feature四组，以及两值同时undefined均返回错误成功。原05-B要求每个值是普通对象；C04 FAIL、C07/C12 PARTIAL。动作仍全false，无真实生成/发送。
**唯一派发：[Plan 05-B-F01 · 必填观察对象校验](05-B-F01-required-observation-object-validation.md) = SENT。** 原PR#22/原三文件最小修复，在组合层调用projectFeatureAvailability前检查普通对象，固定MANIFEST_INVALID/功能路径/安全reason；新增U01–U08。父05-A默认undefined→UNKNOWN行为和原81项不得改动。完整C01–C16复核见F01第14节。

05-A/F01继续DONE/OFFLINE，05-B保持REVIEW_REQUIRED/PR_OPEN/OFFLINE；03-B WAIT_USER_AUTHORIZATION，#16 OPEN @954a01a，main仍bf9cf66807e12d0b25872a0fa3869962dde04818。不进入06/07-B，不合并、关闭PR、改base、安装或操作生产。建议继续当前DS对话做小修。以下“05-B SENT待初报”属历史，不重复派发原实现。

## 最新验收与唯一派发（2026-10-25）· 05-A/F01 DONE，05-B SENT

**Plan 05-A 与05-A-F01 = DONE / OFFLINE / NOT_INTEGRATED。** [PR #21](https://github.com/qianqiucn/dsh-whale-voice/pull/21) 仍OPEN，HEAD `da3d0f7f34df99f11d21cf3a656adcfaa206ce25`，base main `bf9cf66807e12d0b25872a0fa3869962dde04818`，0 reviews，恰好五个新增文件 +3382/-0；[CI 40237933787](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40237933787) build/ui SUCCESS。ChatGPT独立读取修订差异、重跑81/81、复验旧探针14组并另做20个边界断言，关闭F01-01/02/03。全量257/256/1与UI24/24为DS报告值，ChatGPT核对对应CI成功，未在本地重跑全仓库/UI。完整B01–B18复核见[F01最新验收节](05-A-F01-contract-boundary-hardening.md)。

**唯一新派发：[Plan 05-B · 双入口统一只读视图](05-B-audio-core-readonly-view.md) = SENT。** 仅新增core/audio/core-view.mjs、test/audio-core-view.test.mjs、docs/WHALE_AUDIO_CORE_VIEW.md，组合既有Task投影、双功能依赖和首访提示，V01–V28；不增加真实命令。05-B严格限定纯离线组合，历史提到“05-B真实Host集成”的文字不构成本次范围，真实接入需后续专项。
源分支feature/plan05b-audio-core-view从#21精确HEAD建立，新PR以feature/plan05a-whale-audio-core-contracts为base，显式Depends on #21；原五文件只读。**不视为main已含#21，不自动合并、重设base或复制未合并#16**。父分支变化需先报告。

Plan03-B仍WAIT_USER_AUTHORIZATION（#16 OPEN @954a01a）；#17为唯一规划入口、#18旧Draft、#19/#20研究DONE但PR未合并。Plan05整体并未DONE，06/07-B/08/09/13/14仍未派发。05-A/F01不再重做。不会代码用户优先、RVC首发/Seed-VC后续选配、无真实安装/生成/发送、Bridge/Worker门禁不变。05-B适合在干净工作区交接后新开DeepSeek对话。
**本节之后的05-A SENT/REVIEW_REQUIRED、F01 SENT或旧C1待办均为历史记录。**

## 最新核验（2026-10-25）· Plan 05-A REVIEW_REQUIRED，F01 已派发

**当前唯一工程任务：[Plan 05-A-F01 · 输入边界与错误脱敏修订](05-A-F01-contract-boundary-hardening.md) = SENT。** 继续原 PR #21 / `feature/plan05a-whale-audio-core-contracts`，不创建重复 PR、不推进下一模块；父任务 05-A 尚未 DONE，等级 OFFLINE / NOT_INTEGRATED。

已核验 [PR #21](https://github.com/qianqiucn/dsh-whale-voice/pull/21) OPEN，HEAD `0e05061476a97826e7b2bbc2886847d1dbc92fd8`，base main `bf9cf66807e12d0b25872a0fa3869962dde04818`，仅五份新增文件 +2979/-0，0 reviews；[CI 40236154425](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40236154425) build/ui SUCCESS。ChatGPT 独立重跑新文件测试 **65/65 PASS**（Node v24.22.0；CI Node22）；全量 241/240/1、UI24/24 是 DS 报告值，ChatGPT 核对远端 jobs 成功但未本地重跑全仓库/UI。

**独立额外输入复现三项缺口**：F01-01 Relay 接受缺少必填字段/配对错误/嵌套 token 的记录；F01-02 Object.keys 漏检不可枚举及 Symbol 键；F01-03 errors.path 回显任意短 ASCII 键（虚构邮箱标记复现）。候选仍不可发送，不宣称真实泄露或发送。B05/B13 FAIL；B04/B06/B12/B15 PARTIAL；完整 B01–B18 与修复规格见 F01 第16节。

已批准保留：tts-selected REQUIRED；独立 SEED_VC_STATUS；本阶段 deliveryRequired 恒列未实现投递组件。只修原五文件，新增统一 validateAudioTaskRecord、完整自有属性检查、未知键固定占位及 N01–N16 回归。原65项和原52项安全意图保留；报告T组实际36而非35，合计65。

**03-B 仍 WAIT_USER_AUTHORIZATION，#16 OPEN @954a01a；#17 唯一规划分支，#18 Draft，#19/#20 OPEN，04-A 与07-A研究 DONE 不重做。** 不 merge、改生产、装依赖/模型、升级服务或发微信。DeepSeek 继续当前对话做原PR小修；ChatGPT 收新报告后复核新 HEAD/CI 和全部验收，不凭旧绿灯标 DONE。以下旧 SENT/等待首次报告/C1 03-A 待办仅属历史。

## 最新项目事实（2026-10-25）· 04-A DONE、05-A SENT，纯工程重启推进

用户一贯要求：**收到每次 DS 报告后 ChatGPT 必须核验并自动返回一份尽可能详尽、闭合设计、可直接发 DS 的下一任务书**。最新经核验 `Plan 07-A/F01` 和 `Plan 04-A` 均为 **DONE/RESEARCH-OFFLINE**；PR #19/#20 仅 docs，均未 Merge。04-A 研究结论 `RECOMMEND_DSH_ADAPTER_AND_OPTIONAL_V041_PLUGIN_AUDIT`：**S1 DSH 插件 + WeChatAgent 只读 Adapter** 最稳、不升级现有记录 0.3.9；0.4.1 ZIP Plugin API v2 另属宿主、与 DSH 不兼容、无任意音频发送 API；S2 仅未来选配审计，S3 Hook/DLL 禁止。

**唯一最新正式派发 05-A = SENT（纯原创工程，仍 OFFLINE）**，权威完整 Level 2 [05-A-whale-audio-core-offline-contract-implementation.md](05-A-whale-audio-core-offline-contract-implementation.md)：三个 `core/audio` 无 I/O 纯模块、52 条预定 Node Fake/状态/Manifest/Relay 候选测试、1 个中文契约报告文件，独立 PR；无 Host 注入、真实任务运行、UI 页面、模型下载/安装、微信发送。PR #16 的 TTS/SVC v1 仍在未合并 OPEN PR，不能 import/cherry-pick，TaskContract 与 SVC v1 未来对接必须待 #16 用户专项合并及版本化映射。Plan 03-B 保持 `WAIT_USER_AUTHORIZATION`。不要重新派发已完成的 04/07，也不因 05-A Fake 通过就宣称新手产品已完成。

永久最高产品原则仍为**零编程基础用户易用**：正常正式支持的功能不让用户手动装 Git/Python/pip/CUDA/编辑 JSON；分 Voice/Singing 独立依赖弹窗、真正有据的可用状态、中文错误与可恢复的安全图形路径；无权下载或未知 GPU 不能假绿灯。小白易用性永远不绕过法律、隐私和双层发送安全。原 Plan 01–14 不变；用户同意项目设计推进并非授权 Merge/生产写入/模型/微信发送。

## 2026-10-25 · 07-A 验收完毕；新 WeChatAgent v0.4.1 与 Plan 04-A 派发

计划状态真实区分：**Plan 07-A/F01 = DONE（RESEARCH/OFFLINE，PR #19 OPEN，未合并）；Plan 04-A = SENT**（权威完整任务书 [04-A-wechatagent-extension-readonly-audit-execution.md](04-A-wechatagent-extension-readonly-audit-execution.md)）；Plan 03-B = WAIT_USER_AUTHORIZATION（PR #16 未合并）；Plan 05 与 07-B 仍 PLANNED。绝不能把上游静态审计 DONE 冒充 RVC 可用、PR MERGED 或批准 07-B 工程。

2026-10-25 上游 [sourcepro5/WeChatAgent v0.4.1](https://github.com/sourcepro5/WeChatAgent/releases/tag/v0.4.1) 提供正式 **ZIP 插件 API v2**，有 `plugin.json`/`index.mjs`/`setup(api)`、按聊天授权和隔离子进程（**非真正 OS 安全沙箱**），**官方文档声明 DSH 插件与 ZIP 插件不兼容**。历史本机 WeChatAgent 0.3.9、WeChat 4.1.10.27 是之前的报告状态，不等于已经升级 0.4.1；不得自动更新/重启/装 ZIP 或把 `reply` 当任意音频发送。Plan 04-A 优先研究 DSH 原插件 + 安全 WeChatAgent Adapter（S1），API v2 只做条件性 S2 方案评估；04-A 独立只读不要求先合并 #16。

**零编程用户长期最高 UX 约束继续适用**：所有默认最终用户路径简体中文图形操作、可信依赖检测/同意安装、取消失败恢复，不能令小白手动安装 Python/命令行/JSON。不因此绕过许可证/会话权限/Worker NEVER_WRITE/UNKNOWN 不自动重发。下次对话必须优先核对本段、当前 [计划 README](README.md) 和最新交接卡，忽略下方历史旧状态。

## 长期最高优先级产品要求 · 零编程基础用户优先（2026-10-25，用户明确要求始终遵守）

**用户原话：“请你始终记住，本项目是始终给不会代码的编程小白用的，保持易用性。”** 这是贯穿 Whale Audio Core、Whale Voice、Whale Singing、Whale Relay、首次安装、设置、模型、错误处理和正式发布的**永久产品验收原则**，高于为开发者追求技术完整性而牺牲新手可用性的偏好，但不降低安全/许可证/权限门禁。

**唯一权威细则：[NOVICE_FIRST_PRODUCT_STANDARD.md](NOVICE_FIRST_PRODUCT_STANDARD.md)。** 今后 ChatGPT 编写任何 Level 2 任务书时必须增加“非程序员首次使用验收（Novice First DoD）”，确保能够从界面完成已支持的正常流程：有中文清楚指引、自动只读检测、明确模式推荐、依赖可选择的受控安装、错误能通过界面恢复，不要求普通用户运行 Python/pip/git/npm/命令行、手动改 JSON、了解端口和环境变量。已有开发阶段 OFFLINE/Fake/只读能力不可冒充生产可用；涉及安装、费用、模型/音频下载、系统写入、微信发送时仍须主动授权。

**不要把复杂性转嫁给新手**：依赖重用、Windows CPU/no-GPU 可选模式、云端费用/隐私确认、RVC 标准翻唱先行、Seed-VC 零样本试唱后续可选、首访各功能弹窗、简单按钮、可取消/失败恢复、清晰“生成/保存/发送”状态及未知不重发，都要成为任务验收点。安全无法自动化的第三方组件必须诚实标示手动步骤和替代路径，不能偷偷执行未知脚本。此前计划仅部分实现，不代表新手标准已经满足。

## 1.7 最新获授权 Seed-VC 可选定位（2026-10-25）

用户授权调整：**RVC 是 Whale Singing 首发唯一优先推进的标准歌声转换路线；Seed-VC 不删除，保留为后续“免训练/零样本试唱”选配。** 其技术卖点是经授权的短参考声无需为专属声线预训练，不意味着模型更小、省显存或 CPU 轻量。官方 44.1 kHz 歌声约 200M 参数，25M Tiny 主要普通语音转换；上游于 2025-11-21 归档，必须固定版本、调查许可、Windows 兼容和维护风险，不可提前承诺资源/音质。官方源：https://github.com/Plachtaa/seed-vc 。

永久规划约束：原 Plan 07-A 优先 RVC + 分离/混音 + 外部 API 许可审计，Seed-VC 仅做最小静态档案；原 Plan 12-A RVC MVP 完成后，才可**另行授权**推进同一编号下的 Plan 12-D Seed-VC 可选试唱；Plan 12-B/C 搜歌与交付不被 12-D 阻塞。Plan 14 的 Singing 首次依赖清单默认 RVC，Seed-VC 不预装、不下载，未验收就显示 NOT_READY；共享 Whale Audio Core 和 Whale Relay 安全边界不变。原 01–14 不重编号；03-B 仍等待 PR #16 的合并授权。详见 Plan 07、12、14、[README](README.md) 和 [双入口首次依赖规范](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)。本次只允许规划更新，不意味着模型下载、训练、推理、生产配置写入或真实微信发送。

## 1.6 用户确定共享 Core 更名与两个独立首次使用页面（2026-10-25）

用户明确要求：把语音 Whale Voice 与唱歌 Whale Singing 放进**一个 Core**，给共用 Core 重新命名；两种功能的前端界面单独分开，分别在**首次进入时弹出各自需要安装的依赖清单**。ChatGPT 按此确定对外共享名为 **Whale Audio Core（鲸音核心）**，Voice 与 Singing 是产品子功能/前端两页面而不是两个后端。鲸递 Whale Relay Core 和 WeChatAgent 的独立职责仍保持。

权威 [双前端与首次依赖规范](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)：两个拟定路由 voice-bubbles 和 singing，复用现有 Modal/SetupWizard/ComponentsDialog；首访分别显示按 Provider/mode 分组的必需、可选、仅发送需要的组件、状态/来源/许可/资源，允许跳过后浏览只读页，共享依赖去重、后续重复进入不骚扰。安装/真实下载/模型启动/生产 apply/微信发送须单独明确授权；Fake/UI 清单不是真安装、UNKNOWN 不等于 READY。八页旧页面和 plugin ID/ABI/config/whale-v1 不自动更名。

此需求已纳入**原 Plan 05/07-A/08/09/12/13/14**；原 Plan 01–14 编号不变，03-B 仍 WAIT_USER_AUTHORIZATION，优先可独立准备的 07-A 仍 PLANNED/NOT_SENT。以后写详细任务书须确保首访/二访/跨页/无GPU/云端/安装失败/取消/重复依赖及可访问性覆盖完整。

## 1.5 用户新确认的 RVC/SVC 自动翻唱产品路线（2026-10-25）

用户明确选择 [CCYellowStar2/astrbot_plugin_rvc_svc](https://github.com/CCYellowStar2/astrbot_plugin_rvc_svc) 作为翻唱/点歌能力参考，希望“想让小鲸鱼唱一首歌”能由 DeepSeek 触发搜索、分离、RVC/SVC 声线转换、混音、最终经鲸递发送。此为**明确的产品规划决定**，不是给 DeepSeek 的工程安装/代码复用/联网下载/真实发送授权。

长期稳定要求：
- 把原插件的点歌与 RVC/SVC 自动翻唱能力纳入 **原 Plan 07/12**，输出 Artifact 后经 **原 Plan 13 的 Whale Relay 安全交付**；必要的 Core/音频/设置依赖落在原 04/05/06/08/09/14，不创 Plan 15、不重编号。
- 虽然希望在“鲸递后端”获得统一体验，但鲸递只负责一次受控投递。音源合法获取、分离、音色转换、混音和任务/模型生命周期必须由 Whale Voice Core / 独立合法 SVC Worker 管理。WeChatAgent 掌管微信身份，现有 Voice Sender 保留。
- 原插件 AGPL-3.0；其独立 RVCSVC-API 仓库未见明确根 LICENSE。没有版权/许可证审计，不可直接复制/打包上游源码或整合包；采用原创 Fake + 外部 API 适配的可替换架构，始终尊重第三方许可证。
- 歌曲搜索元数据不等于取得受版权保护的音源和分发授权；优先用户已授权音频 / 许可音源，未知权利时拒绝下载。参考音色需用户有权使用并有适当同意；不绕过音乐平台 VIP、DRM 与区域限制。
- **权威跨计划蓝图**为 [RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)，当前权威**动态派发排序**为 [README.md](README.md) 中“已采纳的新产品方向与唯一派发排序”一节。下一项优先可派发 Plan 07-A 上游许可/API 只读研究（PLANNED/NOT_SENT），Plan 03-B 仍须用户单独合并授权。
- 未获专项许可，不启动生产模型、下载歌曲/权重、触发真实微信发送、重启服务、修改生产配置、合并 PR 或打包发布。多 GPU / 无 GPU 路线保留，翻唱是可选模块而非基本 TTS 安装要求。

## 1. 用户最希望 ChatGPT 永远遵守的一条要求（优先级最高）

**“计划书尽可能详细，留给 DeepSeek 思考的空间越少越好，它只需要执行。”**

实践含义：

- 我的任务不是提出模糊建议让 DeepSeek 再次设计需求，而是提供**能直接按步骤执行、能逐条验收的完整工程任务说明书**。
- 决策工作尽量在交付给 DeepSeek 之前由 ChatGPT 完成：明确目标、不做什么、已知基线、前置依赖、精确文件/接口/Schema、合理默认方案、先后顺序、失败策略、安全边界、测试矩阵、完成条件、PR/CI 交付格式。
- 技术细节若可用仓库代码核实，应先核实再写，不猜字段、路径、版本、接口；杜绝把“需要调研后才能确认”包装为已经存在的功能。
- 对确实不确定的事实，给 DeepSeek 一组**封闭、可执行的分支处理**：若核验 A 则执行 A1；若核验 B 则执行 B1；若仍无法确认则停止危险实现并在报告中列出证据。**不允许填空式自由发挥**。
- 保留最低限度的专业判断：允许 DeepSeek 在不改变用户目标、架构、安全和外部契约的前提下选择局部实现细节、修正发现的简单缺陷。出现材料事实矛盾或可能破坏生产安全的设计选择时，必须停止并回报，不应擅自发明答案。
- 默认**一份任务书、一项主题、一个工程 PR、一次明确验收**。涉及多个不同生产权限的操作应拆为阶段，避免一次放权。
- 除非用户明确要求多个方案，否则最终交给 DeepSeek 的文本应当是**单一推荐实施路线**，不是几种并列可能性让它挑选。

**全部计划发送前必须根据 [TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md) 自审，并使用 [TASK_SPEC_TEMPLATE.md](TASK_SPEC_TEMPLATE.md) 的结构写全。** 简略路线图条目不等于可以直接派发的任务书。

## 1.1 用户新增最高优先级要求：收到报告必须自动回计划书

**2026-10-25 用户原话：“每次我发报告给你的时候都发回计划书给我。”** 该要求与“计划书尽可能详细、DS 只需执行”同级优先。

- 用户每次发送 DeepSeek 开发进度、测试、验收或完成报告时，ChatGPT **必须在同一条回复中主动附上一份完整、独立、可直接复制给 DeepSeek 的执行计划书**，无需等用户再说“下一份”。不得仅给状态/简述/链接。
- 若当前工作尚未通过验收，下一份必须优先对当前工程 PR 做**缺陷修复+复验任务书**；已通过才按依赖选下一项。不要重做已经实现的功能。
- 若证据不足，则给当前版本的只读审计与隔离复现任务书；若需要合并、生产写入、真实发送、付费调用等单独授权，则只能给授权前的安全核验/准备计划，不能越权实施。
- 计划要满足 TASK_SPEC_STANDARD 的 Level 2：真实 Git/源码基线、单一技术路线、文件与精确接口、实施顺序、失败分支、正负面测试、DoD、交付格式。一条回复仅一份计划，**正文完整可复制**，GitHub 链接仅作补充。
- 同轮在当前可用的唯一计划管理 PR 中更新记录；GitHub 不可用则明确说明，仍交付据实可执行的任务正文。发出计划不等于 DeepSeek 已执行或用户授权高风险操作，也不代表能在后台继续工作。

## 1.2 DSH/DeepSeek 执行端对话换新与交接提醒

用户希望由 ChatGPT 主动判断何时让 DSH/DeepSeek 执行端另开新对话，以避免长上下文导致工程偏航，并提醒做好交接。这是 ChatGPT 的长期跟进职责，与收到报告自动回完整任务书同时执行。

- **每次收到工程进度、测试或完成报告，都评估一次“执行端是否需要新会话”**；在回复结尾给出简短结论：继续当前对话 / 建议本轮收尾后交接 / 建议现在交接。仅凭报告间接判断，不能声称看到了执行端真实剩余 token 或其会话状态。
- **建议现在交接的信号：** DSH/DeepSeek 开始忘记已决定的架构或安全规则，混淆 main 与 PR HEAD、反复要求已经提供的信息、重复完成项、对多次纠正仍偏航，或执行端自行提示上下文不足/压缩/截断。此时先停止扩大任务，提交或保全已完成工作、记录未提交改动，再换新对话。
- **建议阶段边界交接的信号：** 已完成一个清晰的 PR/阶段、当前对话经过多轮大型审计与代码修复、接下来将切换 TTS/SVC/Relay 等不同子系统或长周期任务；优先在干净、可重建的工程边界交接，而不是在半次真实发送、未明状态或未提交的危险变更中强制切换。长会话是提醒信号，不把固定轮次数臆测成上下文容量。
- **交接包必含：** 仓库/分支/目标 PR 与 HEAD、当前状态及最新 CI、已完成和未完成的 DoD、允许修改与禁止触及的文件/服务、当前任务书链接与完整内容入口、安全不变量、已发现风险、工作区未提交修改及恢复方式、下一步唯一动作和停止条件；不得复制 Token、私人微信内容、音频或其他秘密。
- **换新 DSH 对话流程：** 在旧对话让执行端先保存非敏感 handoff（可放工程 PR 的适当文档或贴给用户），确保必要代码正常 commit/push 且没有未知未提交改动；在新对话先读 AGENTS.md 和 handoff、重新核对实际 Git/PR/CI，再按 ChatGPT 的那一份执行计划开展工作。只切换 AI 聊天，不重启 DSH、WeChatAgent、Qwen、Sender 或微信服务。
- **提醒方式：** 当触发时在验收意见和下一份 DeepSeek 任务书之后明确写“DSH 对话交接提醒”以及是立即还是阶段完成后；提供可复制的新会话启动指令。不做无依据的后台监视或按时自动提醒。

## 1.3 任务书去重与版本续行（2026-10-25）

用户问“重复任务书怎么处理”：既要每份报告自动回完整执行计划，也必须避免二次派发与重复开发。

- 每次先以**任务 ID + 交付目标/DoD + 工程 PR/分支**三要素判断语义是否同一任务，而不是仅比较标题或报告措辞；对照最新 Git HEAD、Diff、CI 与计划索引。
- **相同报告、相同 HEAD、无新的验收差异**：回应时贴原任务的最新可执行续行版，醒目标“继续原任务／无新开发授权／不要重做已完成项”；不新增编号、PR、工作流或空 Commit，不将重复贴送计作新的派发事件。
- **原任务进行中**：只列未完成 DoD、证据缺口与应执行的剩余步骤；给完整且独立可复制的**续行计划书**，相同 ID、相同 PR，必要时仅递增计划版本；禁止并行启动重复工作。
- **验收失败**：在原任务下新增补丁版本及 Fxx/Nxx 缺口复验要求，标注相对上版增删内容，不重复既有实现；由 DeepSeek 在原工程 PR 做最小修复。
- **验收已过**：更新 DONE 后派发下一项真正不同的、依赖满足的任务。若下一项因合并/生产权限被阻塞，仅派发安全核验或授权前准备，不绕过门禁。
- **两个规划 PR/文档重复**：以 #17 规划索引为唯一权威（H0 已完成），#18 只作历史来源；不得重新做 14 对比对或擅自合并/关闭。
- 任务正文必须有 `任务 ID / 版本 / 基于哪份报告与 HEAD / 本次相对上版差异 / 已完成不再做 / 剩余操作 / DoD`，以便用户转交 DS 时不会误以为是新任务。
- 报告末尾继续给出 DSH 对话交接建议。如果重复内容暴露执行端上下文漂移，建议先保存进度并换新对话。

## 1.4 原有技术阶段、Plan 派发序号及 PR 编号不可混用

- **技术阶段**（TTS-A / TTS-A-H / Phase 4B-2B-2a / 2b 等）沿用原项目术语，描述产品/技术里程碑；**Plan 01–14** 是上一位 GPT 归档的任务派发顺序；**PR #16/#17/#18** 是 GitHub 变更编号。三套 ID 均不互相重命名。
- 保留上一位 GPT 的稳定 Plan 对应：01 GUI 覆盖收尾，02 TTS-A/TTS-A-H PR #16 复核，03 PR #16 审查并在单独授权后合并，04 WeChatAgent 扩展审计；05–14 按当前唯一索引继承，不因新增子工作而整体移号。
- 之前 ChatGPT 把 Plan 03 从“最终审查及授权后合并”改写成了“只做合并前文档同步”，造成用户理解上的编号与范围不一致，已纠正：Plan 03 总范围保持不变，03-A 是已发送的合并前审查，03-B 是**尚未获授权和未派发的实际 merge / 合并后验收**。03-A SENT 不能算 Plan 03 DONE。
- 两套文档 PR #17 和 #18 的 01–14 已于 H0 对照过，原顺序等价、文件名不同；只认 #17 为权威，不能重新建立一套 01–14 或再做 H0。
- 每份工程任务书固定同时标明稳定 Plan ID、技术阶段 ID、PR ID、子步骤和版本；增量修复用 Fxx/Nxx 或 03-A/B，不重排既有 Plan 编号。发现原编号与新文案冲突时须先对照 Git 历史并主动解释、修复。
## 2. 固定角色分工

| 参与者 | 长期责任 |
|---|---|
| **用户** | 确定产品方向、评价优先级、最终授权合并/生产高风险操作 |
| **ChatGPT（我）** | 编写可直接执行的详细计划书；调度顺序；把新想法融入总计划；在 GitHub 中保存长期记忆与计划版本；技术/安全复核；核对完成报告，合格后标记 DONE |
| **DeepSeek** | 接收一份已经详细定义的任务；编写代码、运行测试、生成报告、创建工程 PR；发现阻塞时返回证据和明确阻塞点，不负责计划管理或任务重排 |

DeepSeek 不必在每次工程 Git 操作前阅读 ChatGPT 计划管理标准，也不需要替 ChatGPT 维护计划索引和 DONE 标记。两者都遵守 [AGENTS.md](../../AGENTS.md) 的通用安全与权限限制。

## 3. 产品定位，不能被后续建议冲淡

- **Whale Voice** 是 DeepSeek Harness（DSH）中的多引擎语音产品，**WeChatAgent 是微信平台依赖**，不能把 Whale Voice 重新做成第二个微信机器人、账号管理器或 Hook 接管器。
- **一个 Whale Voice Core**：TTS（文字到语音）+ SVC（已有歌声/语音转换）共用模型/Provider 管理、角色音色库、音频处理和任务协调。Qwen3-TTS 不是全局默认值；个人 `whale-v1` 不是公开默认音色。
- **Whale Relay（鲸递）Core**：微信等渠道的安全投递执行层；保留既有 UI Automation Voice Sender 作为适配器，Native Hook 仅研究候选；绝不能因为 Hook 存在就跳过授权、目标复验或结果不确定的防重发。
- Whale Voice Core 持有唯一全局任务及 delivery ID；Whale Relay 只执行固定后端的一次投递，不维护未关联的第二套任务队列。
- 本地 TTS（Qwen、IndexTTS、Piper、Kokoro）、云端 TTS（Gemini、OpenAI 等）、自定义 API 和 SVC（Seed-VC、RVC）均为可选能力，不强制用户拥有 NVIDIA GPU 或下载大模型。**候选 != 已实现/已接入/可选择。**
- 音色角色可以关联多个 Provider 的专属音色资产；不能把不同模型的参考数据直接复用或把 SVC 硬塞成 TTS。
- 对微信发送，`SENT_LOCAL`、网络返回成功和真正服务器确认必须区分；`UNKNOWN` 不自动重试/切换后端；Worker 最终安全闸门 `NEVER_WRITE`、Bridge/Worker 双层权限独立保留。
- 配置 `SAVED` 与 `APPLIED` 分离；没有可信 loaded revision 不得自称已经生效。演示数据必须与真实只读配置明确分隔。

## 3.1 新会话交接长期机制

**用户明确要求：** 每次准备更换 ChatGPT 对话时，在 GitHub 保存供“下一位自己”读取的交接和下一步行动计划。
优先更新以下两个固定位置，不不断新增按日期命名的独立交接文件：

- [NEXT_CHATGPT_HANDOFF.md](NEXT_CHATGPT_HANDOFF.md)：最新事实快照、项目定位、两 AI 分工、未合并 PR、待验证点和隐私/安全边界。
- [NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md)：下一对话第一项计划管理任务的可执行步骤、条件分支、DoD、停止条件。

**每次新对话必须先读此二文件，随后核实 GitHub 实时状态；不能假装交接文档是永远最新事实。**
交接内容不要暗示用户已经批准 PR 合并或生产操作；DeepSeek 无须管理这两份 ChatGPT 专用文档。

## 4. 每次开启 GitHub 计划工作时的阅读顺序（ChatGPT 必须执行）

1. [EXECUTION_STANDARD.md](../../EXECUTION_STANDARD.md) — ChatGPT 的 GitHub 与计划执行标准。
2. [AGENTS.md](../../AGENTS.md) — 双 AI 角色、安全与工程约束。
3. **本文件：CHATGPT_LONG_TERM_MEMORY.md** — 永久偏好和架构定位。
4. [TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md) — 详细任务质量门禁。
5. [计划总表](README.md)、[计划变更记录](CHANGELOG.md) 和当前任务的独立计划书。
6. [PROJECT_STATUS](../PROJECT_STATUS.md)、[AI_CONTEXT](../AI_CONTEXT.md)、[ROADMAP](../ROADMAP.md)、[DECISIONS](../DECISIONS.md) 及相关契约。
7. **最后重新查询 GitHub 的最新 main、开放 PR、当前 PR HEAD/CI/差异。** 实时证据优先于本文件记录的历史状态。

本文件不能让模型离线自动继续工作。只有当前对话有仓库访问能力且用户提出相关请求时才调用工具更新。若工具失败，必须明确说未写入。

## 5. 新想法、计划发送与完成报告的持久流程

- 用户有新想法：先检查是否与已有任务重复，选择修改已有计划还是新增任务；重新计算依赖、优先级、风险；更新计划书、计划总表、变更日志，报告 Commit/PR。不能只在聊天里答应“记住了”。
- 用户要下一份：先核对已完成及正在进行的 PR；对于**已存在新 Commit 的工作，只审查已实现内容，不再次派发同样开发**；补充缺口后才给出**一份完整任务书**。
- 任务书必须详细到 DeepSeek 不需要重新决定基本产品需求、公开状态语义、配置权威、接口设计和测试门槛。若必需事实未核实，应先安排只读审计任务，不能要求 DeepSeek直接赌一个生产实现。
- 用户发进展、测试或完成报告：比对任务中的每一条验收点、PR、测试、CI 和安全承诺。证据满足才标 `DONE`；条件未满足标 `IN PROGRESS` 或 `REVIEW_REQUIRED` 并写清差距；**无论是否通过，都在同条回复中主动交付下一份完整 DeepSeek 任务书**。
- 分开记录 **任务状态**（PLANNED/SENT/IN PROGRESS/BLOCKED/DONE）、**Git 状态**（PR_OPEN/MERGED 等）和**功能级别**（MOCK/OFFLINE/INTEGRATED/VERIFIED）。
- 计划归档与审查 PR 默认不自动合并；生产服务重启、配置写入、真实微信发送、未知 DLL、付费云端 API、强推、删除、公开仓库、Release 均单独授权。

## 6. 可长期引用的权威资料

- [执行计划总表](README.md) — 计划顺序和即时状态。
- [TASK_SPEC_STANDARD](TASK_SPEC_STANDARD.md) — 计划书详细程度和批准门禁。
- [TASK_SPEC_TEMPLATE](TASK_SPEC_TEMPLATE.md) — 任务书复制模板。
- [CHANGELOG](CHANGELOG.md) — 每次新想法和顺序变化的来由。
- [AGENTS](../../AGENTS.md) — 不可绕过的工程与微信安全规则。
- [DECISIONS](../DECISIONS.md) — 已接受的技术 ADR。
- [TTS Provider Architecture](../TTS_PROVIDER_ARCHITECTURE.md) — 当前 TTS-A 设计（具体新版本应复核 Git）。
- [WeChatAgent Compatibility](../WECHATAGENT_COMPATIBILITY.md) — 微信接入约束。
- GitHub PR/CI/Commit 和仓库源码 — 动态事实优先。

## 7. 动态现状只作快照，不能当作永远正确

**2026-10-25 快照：** PR #17 是 ChatGPT 计划归档与执行标准 PR，尚待合并；PR #16 是 DeepSeek 的 TTS-A 设计 PR，已经持续推进且最新提交可能改变了候选目录与架构。Phase 4B-2B-2a 已经过真实八页 GUI 验收，为 `INTEGRATED`、不是 `VERIFIED`。所有 SHA/CI/PR 状态在新会话中必须重新读取最新 GitHub 证据，**不得把此快照硬编码为当前事实**。

## 8. 记忆维护纪律

- **稳定原则写本文件；变动中的任务状态写计划总表；技术决策与被否决选项写 DECISIONS；实施状态写 PROJECT_STATUS；事件顺序写计划 CHANGELOG。** 不复制整个历史报告到本文件。
- 任何用户明确要求“以后一直这样”的协作偏好，应优先作为一个可检查规则写入本文件，并在 EXECUTION_STANDARD / AGENTS 中增加必要的入口链接。
- 确认没有写入个人秘密、真实身份、私人音频、Token 或绝对本机路径。
- 新会话如读取不到本文件，应先检查计划管理 PR 是否已合并，再从当前可用的正确分支读取；不得假装记忆已同步。
