# Whale Voice · 计划演变记录

此文件只记录任务书与排序变化，不代替 Git commit、测试或项目阶段验收。



## 2026-10-26 · 用户最新交付偏好：本地Markdown文件按发送顺序归档
用户要求：以后的计划书直接交付.md文件，在本地专用计划书目录按实际发送顺序编号。
- ChatGPT交付完整Level2任务时，创建独立UTF-8 Markdown文件，命名为三位发送序号_Plan原编号_中文标题.md，并更新目录索引；回复提供可点击文件链接和简要说明，无须再粘贴全文。这是对旧条款“必须回复正文贴全文”的明确替代，完整规格仍须真实写入文件，不能用裸任务名称代替。
- 本地序号从本次归档001开始，仅代表文件交付顺序，不重编Plan01–14。当前001为Plan06-A v1.0，本次仅补存刚发送的任务，不是再次派发。
- 修订后重新发送使用下一序号，保留旧文件并标明原ID/版本/替代关系；普通验收、建议、状态说明不占序号。不凭不完整历史回填旧顺序。
- 继续在现有授权规划分支保存正式计划与验收事实；用户明确要求“不写入仓库”的临时计划或报告仍只在本地/对话交付。不得把本机绝对路径、隐私或凭据写入仓库。
- 此偏好持续适用于后续会话；先读取本地目录索引再取下一序号。若文件环境不可用，明确说明未创建，不能谎称已交付。
本次无新工程派发：06-A仍SENT，07-B仍DONE/OFFLINE，03-B仍WAIT_USER_AUTHORIZATION；没有合并或生产操作。


## 最新验收与唯一派发（2026-10-26）· 07-B DONE，06-A SENT
**07-B = DONE / OFFLINE / NOT_INTEGRATED，PR #23 OPEN。** HEAD a570430e9d5be24aa0f2415b6699cdfa957583f6、base main@bf9cf66807e12d0b25872a0fa3869962dde04818、0 reviews；精确三added +1892/-0。[CI40242597119](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40242597119) 当前HEAD build/ui SUCCESS。ChatGPT独立40/40与271额外边界断言PASS；DS全量216/215/1、UI24/24和本机build为报告值，未独立本地重跑全仓库/UI。完整K01–K16与非阻断错误路径/嵌套类型规格澄清见[07-B最新验收](07-B-rvc-fake-gateway-offline-protocol.md)；无阻断返修。
**唯一下一任务：[06-A · 现有Provider复用与集成前置核验](06-A-provider-reuse-integration-readiness-audit.md) = SENT。** 只读跨PR盘点、三层字段/状态映射、文件交集与依赖，直接对话报告，不新增代码/Registry/Fake、分支、提交或PR，也不写报告入仓库。Plan06实现仍PLANNED，集成仍未开展。理由：已有实现散在未合并#16/#21/#22/#23，先核实复用和合并决策材料，避免继续叠加孤立契约或绕过03-B。
当前main仍bf9cf66807e12d0b25872a0fa3869962dde04818；#16 OPEN@954a01a、#19@e21dee8、#20@6007fec、#21@da3d0f7、#22@9d71658、#23@a570430均未合并；#22 base为#21分支。#17是唯一规划入口，#18保留历史Draft。03-B仍WAIT_USER_AUTHORIZATION；05-A/F01与05-B/F01 DONE/OFFLINE。原01–14不重编号。
现在适合新开DeepSeek/DSH对话，06-A只需只读分析/规划和文件/Git读取；模式名称以实际执行端为准。保留并核实未提交内容，不重启DSH/微信/模型。新手易用性、RVC首发/Seed-VC后续、BLOCKED_CODE_REUSE/BLOCKED_DIRECT_API_INTEGRATION、Worker NEVER_WRITE、UNKNOWN不自动重发不变。
**以下07-B SENT、06未派发、旧任务SENT等段落均为历史快照；以本节为当前唯一指令。**

## 最新验收与唯一派发（2026-10-25）· 05-B/F01 DONE，07-B SENT

**05-B与05-B-F01 = DONE / OFFLINE / NOT_INTEGRATED，PR #22仍OPEN。** 当前HEAD `9d716583da69054ac06733a9dd18ca29b4681fbe`，base为父#21分支@da3d0f7，0 reviews；相对父三added +1650/-0。[CI40240851940](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40240851940) 的head_sha已核对，build/ui各步骤SUCCESS。ChatGPT独立读三文件修订差异、重跑36+81=117/117并复验四组/双undefined，全部符合固定拒绝。DS全量293/292/1、UI24/24、本机build为报告值，ChatGPT核查对应CI成功，未本地重跑全仓库/UI。完整D01–08/C01–16复核见[05-B-F01最新验收节](05-B-F01-required-observation-object-validation.md)。

**唯一下一工程：[Plan07-B · 原创RVC Fake Gateway纯协议](07-B-rvc-fake-gateway-offline-protocol.md) = SENT。** 已完成07-A/04-A研究与05-A/05-B离线边界满足本次独立Fake协议前置；Plan05真实集成未完成，不因本次放开Host/模型。按既有队列07-B先于06，不重做研究。
从最新main独立建feature/plan07b-rvc-fake-gateway，只新增core/svc/rvc-fake-gateway.mjs、test/rvc-fake-gateway.test.mjs、docs/RVC_FAKE_GATEWAY.md；零代码依赖、G01–G40、仅Fixture/固定endpointId/模拟结果，不扩大#21→#22堆叠链。#16/#21/#22仅只读理解与文档映射，不复制/import/cherry-pick；真实SVC适配需#16专项合并与08资产映射后另派。

main仍bf9cf66807e12d0b25872a0fa3869962dde04818；03-B WAIT_USER_AUTHORIZATION，#16/#19/#20/#21/#22均未合并，#18历史Draft不关闭。上游BLOCKED_CODE_REUSE/BLOCKED_DIRECT_API_INTEGRATION保留，RVC首发/Seed-VC后续、小白优先、Bridge/Worker安全不变。无真实安装/媒体/网络/微信/生产/合并。建议05-B结束后新开DS对话进入独立RVC阶段。
**以下05-B REVIEW_REQUIRED、F01 SENT、07-B NOT_SENT均属更早快照。**

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

## 2026-10-25 · Plan 04-A GitHub 终审通过；Plan 05-A 纯工程 Level 2 正式派发

- 核查 PR #20 `research/plan04-wechatagent-extension-audit` OPEN、HEAD `6007fecd351d0cdb492a4ec5962ac2abe1962242`、仅 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md` +361、CI `40233344202` SUCCESS，E01–E25 证据、v0.3.9/v0.4.0/v0.4.1 功能矩阵、权限撤销/隔离、S1/S2/S3、17 个 Fake Seed、A01–A15 达成研究 DoD。**Plan 04-A = DONE（RESEARCH/OFFLINE，PR #20 未合并）**，不等于 ZIP、真实 WeChat Tool/文件音频发送已集成。
- 决策：默认 **S1 DSH Plugin + WeChatAgent 只读 Adapter**，v0.4.1 ZIP v2 是不兼容 DSH Plugin 的**后续可选**，本轮未升级历史本地 0.3.9、未重启/安装/微信操作。
- **唯一新派发 Plan 05-A = SENT（OFFLINE ENGINEERING）**：新增完整 `docs/plans/05-A-whale-audio-core-offline-contract-implementation.md`。DeepSeek 仅在单独功能分支/PR 新增三 `core/audio` 纯模块、≥40 个 Node 自动测试（计划 52 用例）和 `docs/WHALE_AUDIO_CORE_CONTRACT.md`，奠定 Whale Voice/Singing 同一 CoreTask、首访 FeatureManifest、Relay 候选不可提交的纯安全界限。不修改 Host、既有 GUI、Config、Sender 或生产。Fake 不是已实装功能。
- 03-B 仍为 `WAIT_USER_AUTHORIZATION`，#16 TTS/SVC v1 OPEN 未合并；05-A 不能导入/复制该合同，亦不能靠 05-A 自动授权 05-B/06/07-B 或合并任何 PR。
- 原 01–14 稳定编号、小白可视化简体中文/自动受控安装（未来另审）与安全门禁不变；本轮**仅 PR #17 规划分支**写入任务书/总表/交接/长期记忆及变更日志。#16/#19/#20/main 都未操作；新 CI 须随 #17 最终 HEAD 配对。

## 2026-10-25 · 07-A-F01 终审通过；派发 Plan 04-A / WeChatAgent v0.4.1 扩展静态审计

- 实时核验 [PR #19](https://github.com/qianqiucn/dsh-whale-voice/pull/19) OPEN、HEAD `e21dee8`、1 file +489 行、CI `40231587503` SUCCESS；研究报告 C01–C17 固定源码行、SVC v1 三层映射、A01–A14 / R01–R10、Novice First Windows Manifest 和正负例均修复完毕。**Plan 07-A 及其 F01 修订均为 DONE（RESEARCH/OFFLINE）**，但 #19 未合并、RVC/Seed-VC 真实引擎/网关与微信均未执行。
- 核心研究结论保留：`APPROVE_FAKE_ADAPTER_DESIGN` 仅允许后续原创隔离 Fake 契约设计；`BLOCKED_CODE_REUSE` 和 `BLOCKED_DIRECT_API_INTEGRATION` 仍为真实阻断项。不能自动开展 07-B；Plan 05 Core 契约前置仍需完成。
- **新增并正式派发 Plan 04-A Level 2**：`docs/plans/04-A-wechatagent-extension-readonly-audit-execution.md`，只读审核 WeChatAgent v0.3.9/v0.4.0/v0.4.1 的扩展/Tool/ZIP 插件/聊天授权，输出 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md`，只创建 docs-only PR，禁止安装或改生产。
- 上游于 2026-10-25 发布 **WeChatAgent 0.4.1**，首次公开正式 ZIP 插件 API v2；官方开发文档明确此 ZIP 插件与 DSH Plugin **不兼容**。本项目默认保持先前安装版 0.3.9 的现有稳定语音 UI Automation 链路，不因上游更新自动升级。需将 S1 当前 DSH+Adapter 与 S2 未来 ZIP 入口分开比对并保留权限/隐私。
- 零编程新手产品门禁继续强制：默认 GUI/中文/最小依赖/授权确认/明确故障恢复；不可把研发 docs-only、Mock、代码扫描/CI 当作生产体验达标。
- 只对 PR #17 规划 branch 写入新任务书与进度/长期记忆，不改 main、PR #16/#18/#19、不合并、不重启 DSH/WeChatAgent/微信、不发真实消息、不下载任何模型/二进制。03-B 的用户 Merge 授权依旧未给。CI 需用 #17 新 HEAD 重新核实。

## 2026-10-25 · Plan 07-A 第一次报告独立复核：REVIEW_REQUIRED，派发同编号 F01

- DeepSeek 提交 PR #19 `research/plan07a-rvc-upstream-audit`，HEAD `8276909`，只有 `docs/SVC_PROVIDER_RESEARCH.md` +348 行，Actions run `40230248341` SUCCESS，PR 未合并。已验证 main `bf9cf66`、#16 `954a01a` OPEN、#17 docs OPEN、#18 Draft；CI 仅证明构建/界面现有功能通过，非 RVC 实际可用。
- 技术审计主方向认可：RVC 首发、Seed-VC 后续免训练、AstrBot AGPL 附加声明、RVCSVC-API 源许可不明、疑似泄漏第三方凭据、0.0.0.0 + Gradio share、自动模型下载及商业歌曲授权风险，推荐原创 Fake Gateway；禁止代码复制与真实直接接入。
- **未满足的四项 Level 2 验收**：报告 A01–A14 编号与原任务书错位；缺上游 pinned SHA + 函数行号级源证据；Fake 示例 `targetVoiceProfileId`/嵌套 params 与 PR #16 SVC v1 `targetVoiceId` 等白名单不直接兼容、返回缺 `targetVoiceId`；Windows 首次依赖仍是环境总结，未给逐组件来源/探测/许可/模式/失败恢复矩阵。
- **派发决策**：Plan 07-A 保留 REVIEW_REQUIRED；正式新增同编号 **Plan 07-A-F01 = SENT**，权威任务书 `docs/plans/07-A-F01-research-acceptance-correction.md`，只允许原 PR #19 报告文件修订、R01–R10 和原 A01–A14 复验，不新开 Plan/PR、不重做全部研究。
- 状态与安全：Plan 03-B WAIT_USER_AUTHORIZATION、07-B NOT_SENT；本轮只改 #17 规划 docs，不动 #16 工程、#19 初始研究或 main；不运行上游模型、下载、安装、修改生产或发送微信；最终 #17 CI 后续以最新 HEAD 为准。

## 2026-10-25 · Plan 03-A 最终报告验收、正式派发 Plan 07-A 只读任务书

- **触发**：用户提供 Plan 03 PR #16 合并前审查 G01–G12 通过报告，并说明已向 DeepSeek 同步最新架构，要求继续发下一份详细计划。
- **事实**：PR #16 OPEN、HEAD 954a01a、main bf9cf66、0 reviews、CI 40165832178 SUCCESS；03-A DONE，03-B WAIT_USER_AUTHORIZATION，不存在默示合并。TTS/SVC 纯合同 DESIGN/OFFLINE。
- **选择**：按最新总表，在合并审批等待期间派发与 merge 无关的 07-A 只读研究，确保不重做 03-A、不越权合并。新增 docs/plans/07-A-rvc-upstream-static-audit-execution.md 完整 Level 2 任务书，固定公开上游 SHA、唯一文档交付 docs/SVC_PROVIDER_RESEARCH.md、A01–A14、权限/负向矩阵与 Novice First DoD。
- **状态**：Plan 07-A SENT（已交付用户、待其转发 DeepSeek，不等于 DS 完成）；07-B 未派发；03-B 未授权；原 Plan 01–14 不重编号。新研究 PR 未来由 DeepSeek 独立 docs-only 开发与提交。
- **安全**：本轮仅 PR #17 规划分支写文档；未改 main/工程 PR、未合并、未修改微信/Worker/Voice Sender/鲸递生产配置、未下载或运行模型/歌曲/音频。最新规划 CI 以新的 PR #17 HEAD 运行后结果为准。

## 2026-10-25 · 用户确定“不会代码的编程小白优先”为永久产品门禁

- **用户原话**：“请你始终记住，本项目是始终给不会代码的编程小白用的，保持易用性”。此为**跨所有 Core/UI/Installer/Provider/Relay/Release 的永久产品目标**，不属于一次性 UI 改进建议；既有生产安全与许可证门禁仍优先遵守。
- **权威新增**：`docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md`，规定“首访 GUI→按功能只读检测依赖→选择容易理解的模式→明确同意后受控安装→生成/试听/保存→授权发送”、简体中文提示、无显卡/云端替代、失败/取消恢复、共享组件、反复进入不骚扰和透明费用/许可。
- **规则落地**：`AGENTS.md`、`EXECUTION_STANDARD.md`、`docs/plans/CHATGPT_LONG_TERM_MEMORY.md`、`TASK_SPEC_STANDARD.md`、`TASK_SPEC_TEMPLATE.md` 都要求未来所有相关 DeepSeek Level 2 任务书加入 **Novice First DoD**，报告须明确普通用户怎么用和仍需手动的步骤。
- **已有计划对齐**：`docs/plans/README.md`、Plan 09 UI、Plan 14 安装器、`WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md`、`NEXT_CHATGPT_HANDOFF.md` 增加本标准，不强制一次提前完成全部后端。
- **新门禁**：正式标称可用的普通用户路径不能要求 Git/Python/pip/npm、命令行、手动 JSON/ENV/端口；纯研发阶段可运行 CLI 测试但不冒充用户产品。第三方组件不能合法自动安装时必须显示限制/替代，不能执行未经审计的一键脚本；真实安装、下载、付费、配置写入和微信发送独立授权。
- **状态与范围**：仅修改 PR #17 规划分支文档，无工程运行改动，不修改 main/PR #16、WeChatAgent、鲸递生产、安装服务、微信，不合并 PR、不删除分支。原 Plan 01–14 序号和 07-A PLANNED/NOT_SENT、03-B WAIT_USER_AUTHORIZATION 不变；未来须以 Git/CI 实时状态为准。

## 2026-10-25 · RVC 定为首发；Seed-VC 延后为零样本免训练试唱选配（用户已授权）

- **用户明确授权**根据前一轮建议调整规划：RVC 是 Whale Singing 的首发主线路，Seed-VC 不取消但只作为后续免训练零样本试唱选项。
- **旧方案→新方案**：旧 Plan 07 主要对 Seed-VC 与 RVC 并行研究、旧 Plan 12 泛指 Seed-VC/RVC 同等候选、旧 Plan 14 两者均列高性能本地可选 → **Plan 07-A 专注 RVC 上游许可/API/分离混音与环境审计，Seed-VC 只做最小静态档案；Plan 12-A 首发 RVC，新增原 Plan 12 的 12-D 后续可选 Seed-VC 零样本试唱；Plan 14 默认 RVC 安装选项、Seed-VC 不预装不默认可用**。
- 官方 Seed-VC 仓库 2025-11-21 归档，1–30 秒授权参考音频可零样本；44.1 kHz 歌声专用模型约 200M 参数，25M Tiny 主要普通语音用途。**免训练≠低显存、CPU 低资源或实时唱歌**，资源/质量/长歌可行性须经后续专项实测，未经验收不得宣称可用。
- 已同步 Plan 06、07、12、14、RVC/SVC 总蓝图、Whale Audio Core 双入口首次依赖规范、唯一 README 派发队列、长期记忆和交接卡。原 01–14 编号、已有 01 SENT / 02 DONE / 03-A DONE、03-B WAIT_USER_AUTHORIZATION 及 07-A PLANNED/NOT_SENT 均保持；12-D 不是 Plan 15 或新 PR。
- 本轮写入仅 PR #17 权威规划分支，**不修改 PR #16 的源码/Registry**，不合并 PR #16/#17/#18，不改 `main`、WeChatAgent、Voice Sender、鲸递、生产配置，不下载模型/曲库音频、不执行真实转换、安装器、付费服务或微信发送。最终 CI 须以 #17 最新 HEAD 为准。

## 2026-10-25 · 改名 Whale Audio Core、分开 Voice/Singing 页面与首次依赖弹窗

- 用户新需求：“语音whale voice和唱歌whale singing在一个core里面，这个core也重新给我个名字，但是前端这俩界面单独分开，进入语音气泡界面和唱歌界面需要弹出第一次使用要安装的依赖”。
- **新架构名**：TTS+SVC 共用 Whale Audio Core（鲸音核心）；旧 Whale Voice Core 作为文档历史别名。Whale Voice=语音气泡独立前端，Whale Singing=唱歌独立前端。Whale Relay Core（鲸递）名称与唯一投递职责不变。两页共享 Task/Delivery ID、音色/Provider/模型资源和授权；仓库 `dsh-whale-voice`、老 API/config/UI 八页/whale-v1 兼容保留，不能粗暴替换或发布未测改名。
- **首次依赖 UI**：各 feature 首访一次展示最小依赖和安装选项；Voice 提供本地/CPU/云端 TTS、音色、可选气泡发送；Singing 提供已授权源音频、RVC/SVC Worker、条件分离/混音、可选歌曲文件投递。复用现有 Modal/SetupWizard/ComponentsDialog，串行弹窗、二访不骚扰、依赖去重；仅浏览/稍后再说允许，未安装禁用真实能力。任何安装、模型下载、服务启动、生产写入和微信发送必须独立授权。
- **旧方案→新方案**：旧“Whale Voice Core 统一 TTS/SVC + 一个 Whale Voice 前端”→ 新“Whale Audio Core 统一共享服务 + Whale Voice 与 Whale Singing 分页 + 两套 feature-scoped 首次依赖引导（复用同一组件中心）”。UI 工作加入原 Plan 09，安装供应链加入原 Plan 14；架构/共享合同属于 Plan 05/08，唱歌视图属于 Plan 12，交付兼容属于 Plan 13，上游安装检测属于 07-A。没有新 Plan 15。
- 本轮新增 docs/plans/WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md，更新执行标准、翻唱蓝图、Plan 05/07/08/09/12/13/14、权威 README、长期记忆、交接文件及本日志。**动态派发顺序不变**：下一份安全候选 07-A 仍 PLANNED；03-B 合并需用户明确授权，#16 不得擅自 merge。
- 全部只是 PR #17 分支规划 Markdown 修改；没有工程/运行代码、Host、真实音频、模型/安装/下载、WeChatAgent/Voice Sender/Worker、微信发送或生产环境操作；PR #18 保持历史 Draft，未合并/关闭。文档 CI 以实际最新 HEAD 为准。

## 2026-10-25 · 用户选定 AstrBot RVC/SVC 翻唱路线并重排现有计划派发顺序

- **触发与意图**：用户明确表示“我想采用 astrbot_plugin_rvc_svc 并把这个集成进我的后端鲸递core，整理仓库计划书发送顺序，并将这个计划按你推荐的顺序写入”。此为功能与计划排序授权，非直接启动代码、部署、合并或真实翻唱授权。
- **技术事实**：公开插件仓库标明 AGPL-3.0；其 README 依赖 RVCSVC-API 独立网关、RVC/SVC WebUI 和人声分离，非单独安装即可在 DSH 使用。独立后端仓库未见明确 LICENSE，须后续逐 Commit/第三方许可证核验。默认不复制代码、模型或歌曲，优先原创 Fake + 兼容适配。
- **核心职责**：用户面向鲸递获得一体化使用体验，但 Whale Voice Core 仍持有任务/音频/搜索/SVC/模型与授权，Whale Relay（鲸递）Core 只做目标复核/单次交付；WeChatAgent 身份和原 Sender 路径保留。自动搜歌先仅元数据；有权音源和合法音色模型才允许进入处理。长歌曲默认文件，可支持语音需真实后端另验。
- **仓库落地**：新建 docs/plans/RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md；原 Plan 04、05、06、07、08、09、12、13、14 添加正式需求、前置条件、阶段 DoD 和安全/许可门禁；计划 README 添加独立动态队列、长期记忆/交接卡添加长期方向。原 01–14 数字和任务文件路径不改，H0 也不重复。
- **旧派发建议 → 新排序**：旧 01→14 自然顺序不适合优先翻唱；建议先允许独立 07-A（上游许可/API 只读研究，尚 PLANNED），#16 的 03-B 合并仍等待用户明确授权，之后 04→05→07-B→06→08→13-A→09(OFFLINE)→12-A→13-B→12-B/12-C；10/11 在先决条件成熟后可并行，13-C 研究、14 发布验收排后。Plan 01 原 SENT、02 DONE、03-A DONE 与 03-B 阻塞状态不变。
- **范围与许可**：本轮只对 PR #17 计划管理分支做 Markdown 正常提交；没有进入项目工程代码、没有下载/运行第三方仓库、没有真实歌曲/模型、没有操作 WeChatAgent/Voice Sender/DSH 或修改生产。没有 Merge PR #16/#17/#18、Force Push、删除分支或 Release。
- **下一唯一候选**：用户要求发正式下一份执行计划时，优先把原 Plan 07-A 提升为 Level 2、实测核实 GitHub/第三方 commit 后只读派发给 DeepSeek。当前不标 SENT、不越过 03-B 的合并授权。

## 2026-10-25 · Plan 03-A 合并前检查正式通过；03-B 仍需用户授权

- DeepSeek 提交《Plan 03 · PR #16 合并前准备与待授权报告》；GitHub 当前 main `bf9cf66`，PR #16 OPEN、mergeable/未合并 @ `954a01a08587bc8bd5b8caccf026298ca54d5215`，总 22 files +2490/-176，人工 Reviews 0。
- ChatGPT 用 GitHub 实际 Commit、compare 与两份 blob 核实文档同步 Commit `954a01a` 是在工程修复 `3ad32bc` 之后的 1 个提交，只修改 `docs/AI_CONTEXT.md`（+43/-20）、`docs/PROJECT_STATUS.md`（+20/-8），合计 +63/-28。两文档保留旧 192 测试历史并新增现行 197（196 PASS、1 平台 SKIP），不误称生产集成。
- HEAD `954a01a` 的 Actions run `40165832178` 以及 build 和 ui 两个 Job 均 SUCCESS。DeepSeek 本地报告 `node --test` 197/196/1、UI 24/24、build 217349 bytes、G01–G12 PASS，ChatGPT 没有在 Windows 本地重新运行。
- **03-A = DONE / READY_FOR_USER_MERGE_DECISION**，**03-B = WAIT_USER_AUTHORIZATION / NOT_DISPATCHED**；整个 Plan 03 尚未 DONE，不能自动合并 PR #16；TTS-A 仍 DESIGN/OFFLINE。Plan 01 SENT、02 DONE、04–14 PLANNED；H0/C1 已完成，不重复派发。
- 只更新 PR #17 规划分支的 Plan 03、计划索引、handoff 与 changelog；#18 OPEN/DRAFT 保留历史，不操作。当前仍待用户**针对 PR #16 是否以 Merge Commit 合并 main 的明确决定**，同时应让用户知道人工 Review 数为 0。
- 这次没有工程代码、main、生产配置、服务、微信发送、Hook/模型/收费 API 的改动；未合并任何 PR。
## 2026-10-25 · 新聊天交接刷新：以 C1 替换已完成 H0

- 触发：用户准备重新打开 ChatGPT 对话，要求在 GitHub 持久写入我自己的交接文档，并为下一位 ChatGPT 提供唯一首项行动计划。
- 已发现 PR #17 的 `NEXT_CHATGPT_HANDOFF.md` 与 `NEXT_CHATGPT_ACTION_PLAN.md` 已存在，故**直接更新原文件，不制造第三套交接文档**；H0 14 对任务去重已完成，历史证据保留于 `H0_PLAN_RECONCILIATION.md`。
- 更新 [交接卡](NEXT_CHATGPT_HANDOFF.md)：本轮真实 GitHub 状态、角色与产品边界、长期记忆读取顺序、计划状态、Plan 03-A 实测缺口、新会话粘贴入口，移除会误导的新旧快照冲突。
- 将 [行动计划](NEXT_CHATGPT_ACTION_PLAN.md) 从“已完成的 H0”替换为 **C1：恢复上下文 + 核实 Plan 03-A 的新增工程/文档/CI 证据**。C1 是 ChatGPT 计划协调任务，**不是 Plan 15、不自动分配给 DeepSeek**。
- GitHub 证据（提交交接前）：main `bf9cf66`；工程 #16 OPEN `3ad32bc`、run `40163881122` SUCCESS；计划 #17 OPEN `4b700bc`、run `40164634185` SUCCESS；历史 #18 OPEN / DRAFT `42cec57`、run `40159114676` SUCCESS。交接提交会改变 #17 HEAD，因此后续必须查新 CI。
- 直接读取工程 PR #16 `docs/PROJECT_STATUS.md` 与 `docs/AI_CONTEXT.md`，它们尚含旧 `192` 而没有 `197` 最新验收记录，因此 **Plan 03-A 当前仍是 SENT，不能标完成**。Plan 02 DONE、Plan 03-B 等用户独立合并授权、Plan 01 SENT、Plan 04–14 PLANNED；**编号与顺序无变化**。
- 用户核心偏好、自动回一份完整计划、换新 DSH 执行端聊天提醒和安全门禁均已写入长期记忆/执行标准；下一 ChatGPT 应先读这些而不是只读交接卡。
- 本轮仅 PR #17 分支的规划文档正常 Commit/Push；不改代码、main、生产配置、模型、Hook、语音发送或音频设备，不合并/关闭任何 PR。

## 2026-10-25 · C1 交接恢复按新方案完成（只核验、不推进工程）

- 已完整读取 #17 计划分支的执行标准、AGENTS、长期记忆、新交接卡和 C1 行动计划，并检查 TASK_SPEC_STANDARD、计划索引、Plan 02/03、主分支工程状态文件。
- 实时 GitHub：main bf9cf66807e12d0b25872a0fa3869962dde04818；工程 PR #16 OPEN/mergeable/未合并 @ 3ad32bcb22b1a0346eed91f7236afb4f1cc8f773，CI 40163881122 SUCCESS；计划 PR #17 在本次 C1 记录修改前 @ 8864e4c3ab0aec5a8dd177579497bd1f0960efdb，CI 40165005768 SUCCESS；历史规划 PR #18 OPEN/DRAFT @ 42cec57ae7018735cb6c65a4ef8b0a1d80473810，CI 40159114676 SUCCESS；三个 PR 的人工 Review 数为零。
- Plan 03-A 核验：#16 HEAD 仍为 Plan 02 完成时 3ad32bc，docs/PROJECT_STATUS.md 与 docs/AI_CONTEXT.md 仍保留 192、无最新 197 和修复验收 checkpoint，没有后续提交、全量差异审查报告或新 HEAD CI；所以 **03-A 保持 SENT，不能标 DONE 或 READY_FOR_USER_MERGE_DECISION**。
- C1 自身（ChatGPT 新对话恢复计划）标记 DONE；Plan 01 SENT、Plan 02 DONE、Plan 03-B WAIT_USER_AUTHORIZATION、04–14 PLANNED。H0 已做，不重做。用户本次没有提交新的 DeepSeek 开发报告，因此不重复派发已发出的 03-A 任务书。
- 唯一下一步仍是让 DeepSeek 按原 Plan 03-A 完成全 PR Diff 审查、仅同步两份工程状态 Markdown、重新运行隔离回归和最新 HEAD CI、交付合并前审查包。没有单独授权绝不合并 PR #16、#17、#18。
- 本次只在 PR #17 计划分支更新 C1、交接卡、索引、变更日志，无工程源码、生产配置、模型、WeChatAgent、Voice Sender、微信或服务改动；本地未执行 Windows 测试。
## 2026-10-25 · 原始 Plan 编号与 Plan 03 总范围恢复

- 用户发现当前 Plan 编号与上一段 GPT 可能不一致。核对 PR #17 唯一索引、PR #18 历史目录和已完成的 H0_PLAN_RECONCILIATION：01–14 的语义顺序没有改变；差别主要是文档文件名、状态快照与技术阶段名称容易混用。
- 明确稳定体系：TTS-A/TTS-A-H/Phase 4B-2B-2a 是技术阶段 ID；Plan 01–14 是派发任务序号；PR #16/#17/#18 是 GitHub 审查编号，彼此独立。
- 纠正 ChatGPT 先前的范围漂移：原 Plan 03 始终包括 PR #16 审查及单独授权后合并；此前仅做合并前文档/CI 审核是 **03-A SENT**，真正 merge+合并后 main 验证是 **03-B WAIT_USER_AUTHORIZATION**，未派发也未执行。不会因 03-A 完成将整个 Plan 03 标 DONE。
- 更新 Plan 03、唯一总表、长期记忆与新对话交接卡；Plan 01 SENT、Plan 02 DONE、Plan 04–14 未改变；未修改工程 PR #16 代码、main 或生产服务，未合并任何 PR。
## 2026-10-25 · Plan 02 终审通过；自动派发 Plan 03 合并前门禁

- 用户提交 F01–F05 完成报告，报告 PR #16 HEAD 3ad32bcb22b1a0346eed91f7236afb4f1cc8f773、CI run 40163881122；ChatGPT 核对 GitHub PR OPEN / mergeable、实际该 Commit 5 个文件 Diff、5 个负向测试断言以及当前 HEAD CI SUCCESS。
- F01–F05 五项修复均有真实代码证据；DeepSeek 报告 node --test 197（196 PASS / 1 平台 SKIP）、UI 24/24、build 217349 bytes，ChatGPT 未独立本地重跑。因此 Plan 02 更新为 DONE，但功能仍是 DESIGN/OFFLINE，PR #16 仍未合并。
- 当前工程 PR #16 总 Diff 22 files (+2452/-173)；docs/PROJECT_STATUS.md 与 docs/AI_CONTEXT.md 仍显示旧 TTS-A 192 Node 快照，需要区分旧历史与新 197 证据；这不是再执行 F01–F05。
- 按“报告自动回一份去重计划书”要求，将 Plan 03 从 PLANNED 改为 SENT，升级 EXECUTION-READY v2，只允许审查全量 PR Diff、同步上述两份状态文档、运行隔离回归并复核**新 HEAD** CI，最终输出待用户合并决策包，不实施合并。
- 计划 01 保持 SENT；04–14 均未启动；PR #17 唯一计划体系、#18 Draft 历史重复记录不变。无生产服务、真实 WeChat、模型、付费 API 或主分支修改；没有自动合并任何 PR。
- DSH 执行端对话建议：Plan 02 已完成且进入 Plan 03 新阶段，是适合新开执行端对话的安全交接节点；先保存当前工作区状态，携带唯一 Plan 03 任务书与 PR/HEAD/CI。
## 2026-10-25 · 避免每次报告派发重复任务书

- 用户询问重复任务如何处理，明确报告触发“自动返回完整任务书”不等于每次新增一个工程任务。
- 按任务 ID + 目标/DoD + 原工程 PR/HEAD 去重；无新证据只给原任务的完整续行版，不重做已完成项、不重复 SENT、不新建 PR/空 Commit。
- 新缺口在原任务上加版本及差异修复；已满足 DoD 才切换下一项；需要用户单独授权时仅允许安全准备核验。
- 固化于长期记忆、执行标准及唯一计划总表。本轮 01–14 顺序未变，Plan 02 仍在现有 PR #16 做 F01–F05 终审，#17 与 #18 的 H0 去重已完成，勿重做。
- 仅修改 PR #17 的计划协作文档，无生产配置、服务、微信、合并或运行代码变更。

## 2026-10-25 · 用户要求主动提醒 DSH 执行端换新对话与上下文交接

- 新增固定协作偏好：ChatGPT 每次看到 DeepSeek 开发/测试/完成报告，在执行实时验收与自动返回下一份完整任务书的同时，判断是否该让 DSH/DeepSeek 执行端清空长对话、进行新会话交接。
- 提醒档位：继续当前会话；当前 PR/阶段完成后交接；如出现遗忘约束、版本混淆、重复开发或明确的上下文截断则立即交接。
- 固定交接包包含 PR/HEAD/CI、完成状态和缺口、安全范围、未提交工作及唯一下一动作；先保全已有工程结果、再开启新 AI 对话并核验 Git 事实。不复制敏感数据，也不将聊天交接理解为重启生产服务。
- 规则已经存入长期记忆、执行标准和下一位 ChatGPT 的交接卡。本轮不改变 01–14 计划顺序与 PR #16 工程状态，仅更新 PR #17 计划文档。

## 2026-10-25 · 新会话继续 Plan 02：PR #16 纯契约静态复核

- 触发：用户要求读取旧“DSH插件”对话并继续；从 #17 交接卡恢复角色分工、H0 完成事实、Plan 01/02 状态，GitHub main 和 PR #16–#18 重新核实。
- 当前基线：main `bf9cf66`；#16 `1fd2cca` CI `40160267636` SUCCESS；#17 整理后 `4e183fe` CI `40162268291` SUCCESS；#18 `42cec57` CI `40159114676` SUCCESS。三个 PR 都未合并，review 数为零；#18 为 Draft。
- 审查 #16 的现有 Provider/SVC Registry、Contract、迁移和相关测试，确认十个 TTS + 两个 SVC 候选是设计态且不可选择；不重复让 DeepSeek 创建候选。
- 对照 Plan 02 的 T05/T08、安全边界及架构文档，新增 **F01–F05** 静态审查待核验项：Manifest 未知顶层键、TTS 请求额外投递字段、SVC 请求未知字段回传、必需云凭据 UNKNOWN 时的可用性误判、合成结果 `target` 字段被静默忽略。详见 [Plan 02 §2.1](02-tts-a-complete-review.md) 和 N01–N05 负向回归要求。
- **未本地运行 Node/UI，发现属于静态代码证据，尚未由 DeepSeek 实测复现/修复。** 不把旧 CI SUCCESS 等同于新增负向检查通过。
- 顺序与状态：01–14 不变；Plan 01 SENT；Plan 02 IN PROGRESS / REVIEW_REQUIRED；Plan 03 仍需 Plan 02 终审和用户合并授权。TTS-A 仍 DESIGN/OFFLINE。
- 仅修改 PR #17 中的计划与变更日志；无生产运行文件、配置、微信、音频、模型、API、服务、合并或分支删除。

## 2026-10-25 · H0 新会话接续与计划去重整理

- 用户要求读取“DSH插件”并继续；完成交接指定的 H0。
- 比对 #17/#18 全部 14 对正文、3 个重叠入口及 TASK_STATUS；[逐项结果](H0_PLAN_RECONCILIATION.md)。
- #17 为唯一计划体系；选择性补充 04–08、11–14 的验收细节。01 已发送内容不变，02 保持终审；不引入第二套任务/台账。
- 01–14 顺序不变；01 SENT；02 IN PROGRESS / REVIEW_REQUIRED；未派发新任务，不标工程 DONE。
- #16 当前 1fd2cca、#18 当前 42cec57 的 CI 成功；#17 父版本 2c4a01a 的 CI 40161821455 成功，新提交单独查验。
- H0 计划整理完成；PR #17 合并和重复 #18 关闭仍待用户单独决定。未进行生产操作。

## 2026-10-25 · 新 ChatGPT 对话交接与下一步行动书

- 触发：用户准备换新 ChatGPT 对话，要求把我自己的交接文档写入 GitHub 并给下一位 ChatGPT 一份明确的执行计划。
- 新增 [NEXT_CHATGPT_HANDOFF.md](NEXT_CHATGPT_HANDOFF.md)：新会话首读入口、用户长期要求、两 AI 分工、实际 PR/CI 状态、历史与真实集成的区别、当前计划以及安全边界。
- 新增 [NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md)：**H0 ChatGPT 下一会话首项计划管理工作**，先核验并梳理 PR #17 与 PR #18 两套计划文档的重叠，保留唯一权威索引，再复核 PR #16 和 Plan 01/02 的证据。该任务不是 DeepSeek 的编码任务，也不授权合并。
- 本轮核实 GitHub：main `bf9cf66`；PR #16 OPEN @ `1fd2cca`，CI `40160267636` SUCCESS；PR #17 OPEN（交接提交前 @ `f42f0a6`），CI `40160989897` SUCCESS；PR #18 OPEN @ `42cec57`，CI `40159114676` SUCCESS。**交接提交后 PR #17 的 HEAD 已更新，必须重新核验本次 CI。**
- PR #17 与 PR #18 都修改 `AGENTS.md`、`docs/README.md`、`docs/plans/README.md`；两套 14 份计划书内容和命名重叠，PR #18 有独立的 `TASK_STATUS.md`。推荐以 #17 的 ChatGPT-only 执行标准/记忆及任务规格为主，逐条审查吸收 #18 的增量；未经用户授权不合并、关闭或删除任何 PR。
- 更新 `EXECUTION_STANDARD.md`、`AGENTS.md`、`CHATGPT_LONG_TERM_MEMORY.md`、`docs/plans/README.md` 和 `docs/README.md` 的 ChatGPT 专用首读入口。
- 计划排序/状态：01–14 不变；Plan 01 `SENT`（未验收 DONE），Plan 02 `IN PROGRESS / REVIEW_REQUIRED`，Plan 03 等待终审与单独合并授权。
- 生产影响：无。仅文档/计划分支修改；未合并 PR，未修改生产配置、模型、微信、音频设备或服务；未新增代码运行路径。

## 2026-10-25 · GitHub 作为 ChatGPT 长期规划记忆库；任务书升级为可直接执行规格

- 触发：用户要求 GitHub 持久保存重要协作记忆；**“计划书尽可能详细，留给 DS 思考的空间越少越好，它只需要执行。”**
- 新增 [CHATGPT_LONG_TERM_MEMORY.md](CHATGPT_LONG_TERM_MEMORY.md)，集中记录用户长期偏好、ChatGPT/DeepSeek 分工、Whale Voice/Relay/WeChatAgent 定位、任务与 Git 状态区分、安全边界及每次计划任务的读取顺序。
- 新增 [TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md)：每份发给 DeepSeek 的工程计划必须达到 `EXECUTION-READY Level 2`，写全目标、实时 Git/源码证据、唯一技术路线、改动文件、接口/状态与错误语义、按序步骤、失败决策树、安全、测试矩阵、DoD、PR/CI、交付报告；派发前自评至少 90/100，虚构接口或越权一票否决。
- 新增 [TASK_SPEC_TEMPLATE.md](TASK_SPEC_TEMPLATE.md) 供 ChatGPT 编写可复制的任务书；已有 01–14 部分是 Level 1 路线条目，今后每次派发前**先扩写完整规格**，不直接把简略路线条目给 DeepSeek。
- 更新 `EXECUTION_STANDARD.md`、`AGENTS.md` 的 **ChatGPT-only** 前置阅读规则；DeepSeek 的日常编码、测试和工程 PR 仍只需遵循通用 `AGENTS.md` 安全规则，不承担计划管理。
- 更新 `docs/README.md`、计划总表和 Plan 02 的证据与任务内容，使新会话能找回本套规范。
- 核验 GitHub PR #16 **已更新**到 `1fd2cca`，run `40160267636` SUCCESS：IndexTTS / Gemini / OpenAI 候选、Whale Relay 三层职责、独立 Seed-VC/RVC 的 SVC 合同已存在。**因此 Plan 02 不再让 DS 重复实现，而改为精确终审/负向测试；在验收前保持 IN PROGRESS / REVIEW_REQUIRED，Git PR_OPEN。**
- 排序变化：**无，01–14 顺序保持**；仅增加派发前的质量门禁和现有 Plan 02 的“开发→复核”处理。
- 生产影响：无；本轮仅编辑计划/规范文档及 PR 描述，不写生产配置、不启动模型、不发微信、不合并任何 PR。
- 仍需授权：PR #17 的合并、PR #16 的合并均需用户单独决定。

## 2026-10-25 · TTS-A 交付报告核验与计划 02 继续执行

- 触发：DeepSeek 提交 TTS-A Provider-neutral 审计、契约、v2 迁移提案与隔离测试完成报告，用户要求继续开发。
- 证据：核验 PR #16 OPEN @ `c851be7`；代码存在 Registry、Config、Provider Contract，CI run `40157763811` SUCCESS；测试 188 Node（187 pass / 1 skip）和 24 UI 属开发报告记录。
- 工程阶段：TTS-A 初版 `DESIGN / OFFLINE` 完成，不等于生产可用。
- 状态：Plan 02 保持 `IN PROGRESS`，Git `PR_OPEN`。理由：当前注册表没有 IndexTTS、Gemini TTS、OpenAI 语音 API；正式架构文档还需补充 Whale Relay 与 SVC 的独立责任边界。
- 顺序：01–14 不变。优先让 DeepSeek 在现有 PR #16 进行最后一轮范围补充；计划 01 测试收尾可独立进行。
- 下一份发送：Plan 02 的补充任务书，禁止重复新建 TTS-A PR、启动生产 TTS 或自动合并。
- 安全：无生产配置写入、付费调用、模型启动或真实微信发送。

## 2026-10-25 · 明确 DeepSeek / ChatGPT 双 AI 分工

- 触发：用户指出另一个 AI 仅参与计划书与 GitHub 协调，计划管理规则只要求 ChatGPT 遵守。
- 旧规则：`AGENTS.md` 和执行标准把“所有 Git/GitHub 操作必须先读计划标准、发下一份、重排并打标”的要求错误地推广到所有开发 AI。
- 新规则：**DeepSeek 负责代码、测试、技术实现和正常工程 Git/PR；ChatGPT 独占计划书发送、计划顺序维护、创意整合、状态记录与 DONE 核验。** 两个 AI 都遵守通用 Git 安全、质量与生产授权边界。
- 已更新 `AGENTS.md`、`EXECUTION_STANDARD.md`、`docs/plans/README.md`、`docs/README.md` 和 PR 模板，确保 DeepSeek 不被迫承担 ChatGPT 的计划管理工作。
- 顺序变化：无；01–14 任务保持不变，计划状态不变。
- 状态/证据：通过当前计划管理 PR #17 的文档 Commit 修订；未合并到 main。
- 生产影响：无；不修改 Core、微信、模型、Sender、Bridge 或生产配置。

## 2026-10-25 · GitHub 执行标准固定化

- 触发：用户要求“给自己在 Git 上写执行标准，每次上 Git 先看一眼”；计划顺序无变化。
- 新增 [根目录执行标准](../../EXECUTION_STANDARD.md)，覆盖 Git/PR 操作前置读取、最新状态与授权核验、每次发送一份、创意重排、完成报告打标、CI/秘密扫描、复核与汇报。
- [AGENTS.md](../../AGENTS.md) 的启动步骤加入强制先读标准，适用于只读 PR 审查与后续会话。
- [文档索引](../README.md) 与计划总表增加执行标准入口；GitHub PR 模板增加阅读确认清单。
- 不新增开发阶段，不改变 01–14 排序、任务状态、主仓库运行代码、生产配置或微信服务。
- 相关文件仍通过计划管理 PR #17 提交并等待审查；不得据此假设已合并 main。

## 2026-10-25 · 初始归档

- 从对话中的 14 份可独立发送的任务书建立 `docs/plans/01–14`。
- 计划 01：GUI 情绪/任务与日志测试收尾，已发送给用户，状态 SENT；本地分支需要实测核验。
- 计划 02：现有 PR #16 的 TTS-A 补充与最终审查，状态 IN PROGRESS，避免重复启动。
- 计划 03：PR #16 合并门禁，等待用户明确合并授权。
- 增加产品定位：一个 Whale Voice Core，同时服务 TTS 和 SVC；WeChatAgent 为必需微信平台依赖。
- 将用户提出的 **Whale Relay（鲸递）** 纳入 Plan 05（Core 边界）、Plan 08（统一任务与投递 ID）、Plan 13（Relay-A/B/C），替换“Sender 是唯一发送后端”的旧定位；现有 UI Automation 被保留为适配器，Native Hook 只作为研究候选。
- 加入统一状态模型：任务 SENT/DONE 与 Git PR_OPEN/MERGED、功能 OFFLINE/INTEGRATED/VERIFIED 分离。
- 建立「每次发送一份、每次创意重排、每次报告验收后打标」流程。
- 记录现有 2B-2a 真实八页 GUI 的 INTEGRATED 验收，但不宣称 VERIFIED；当前尚无生产写入功能。
- 本次只是文档/计划归档，不改生产 Core、不运行 DLL、不启动微信操作；本登记 PR 尚未合并 main。

## 新事件登记格式

日期：
- 触发：用户下一份 / 新想法 / 完成报告 / 独立审查。
- 涉及计划：
- 顺序变化：原 → 新（若无则写「无」）。
- 状态变化：原 → 新；Git 状态另记。
- 证据：PR、Commit、CI、实际验收。
- 安全与兼容影响：
- 尚需授权：
