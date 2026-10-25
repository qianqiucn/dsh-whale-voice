# Whale Voice · 下一次 ChatGPT 会话交接卡

> **首读级别：最高。维护者：ChatGPT（规划与 GitHub 协调），不要求 DeepSeek 维护。**
>
> **更新时间：2026-10-25，Europe/Amsterdam。** 本文是核验时点的快照，不保证下一次会话的 PR/CI/Commit 仍相同。
>
> **唯一推荐接续任务书：[NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md)。** 该计划属于下一位 ChatGPT，不是新的 DeepSeek 工程任务，不代表授权自动合并。
>
> 重要：本文件在计划管理 **PR #17 分支**，而不是默认已合入 main。新对话若从 main 找不到，应读分支 \`docs/whale-voice-execution-plan-registry\`。**下一次必须以实时 GitHub 为准。**

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

## 最新交接（2026-10-25）· Plan 04-A 验收 DONE、05-A 已派发

**用户提供 DeepSeek《Plan 04-A · WeChatAgent 扩展能力与权限审计报告》后，ChatGPT 独立核验**：PR #20 OPEN、HEAD `6007fecd351d0cdb492a4ec5962ac2abe1962242`、唯一 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md` +361、CI `40233344202` SUCCESS；25 条 E01–E25 固定源码证据、0.3.9/0.4.0/0.4.1 版本权限矩阵、DSH Plugin≠WeChatAgent ZIP、17 Fake、A01–A15 均符合静态审计验收。**Plan 04-A = DONE（RESEARCH/OFFLINE），PR #20 未合并，真实 Tool、ZIP、身份/微信/音频投递仍未实现**。S1 当前 DSH + 只读 Adapter 默认；S2 v0.4.1 ZIP 后续可选；S3 Hook/DLL 禁止，不能自动升级 0.3.9。

**唯一刚派发下一份任务：Plan 05-A = SENT（OFFLINE PURE CODE）**，完整文件 [05-A-whale-audio-core-offline-contract-implementation.md](05-A-whale-audio-core-offline-contract-implementation.md)。这次要求 DS 在**新独立 PR** 做三个 `core/audio` 纯模块（Task、Feature Manifest、Relay 不可提交候选）、一个 ≥40 Node 自动化测试、一个接口文档，绝不挂入 Host、改现有八页/Setup、安装模型/WeChat、生成真实音频或发送。源码只能在最新 main 尚无 `core/audio` 的前提下隔离开发。PR #16 未合并，**不能导入其 SVC/TTS 纯合同到 main**，05-A 需明文设计未来映射。**05-A 的 Fake PASS 不是新版用户功能可用**，后续计划会处理 05-B/06/07-B/08/09/13/14。

**03-B 仍 WAIT_USER_AUTHORIZATION**，PR #16 OPEN @ `954a01a`、0 reviews、CI `40165832178` SUCCESS；PR #17 为规划分支，#18 旧 Draft，#19 RVC 研究 OPEN。当前 main `bf9cf66`。任何 Merge、部署/升级/启动 WeChatAgent、真实 Tool/微信/付费/模型、生产写入均没有新的用户授权。**原 01–14 编号与“AI 写详细计划、DeepSeek 只执行、小白易用第一”约束不变。**

收到 DS 05-A 工程交付报告时，先实时查新 PR/HEAD/diff/CI，逐项验证 B01–B18、纯模块导出、无外部副作用与 52 Case、已有 Node/build/UI 结果；通过才考虑 05-B 或提醒用户单独决定 Plan 03-B，不应无条件启动 07-B。历史“04-A SENT 等初报/05 PLANNED”此后属于旧记录。

## 2026-10-25 · 最新交接：07-A/F01 已验收 DONE；04-A 正式派发

本轮收到 DeepSeek 的《Plan 07-A-F01 · 原研究报告验收差距修复报告》后，ChatGPT 使用 GitHub 真实核对：[PR #19](https://github.com/qianqiucn/dsh-whale-voice/pull/19) OPEN、HEAD `e21dee8a8192f24a3465f169c761e62d30611e59`、仅 1 个 Markdown +489 行、CI `40231587503` SUCCESS。完整 `docs/SVC_PROVIDER_RESEARCH.md` 已含 C01–C17 pinned 源码证据、SVC v1 三层映射、8 个文档判断、逐组件新手安装 Manifest、原编号 A01–A14 与 R01–R10。**07-A/F01 = DONE（RESEARCH/OFFLINE）**，但不代表模型、音频、Provider、微信实际可用，#19 不合并。直接复制 AstrBot/RVCSVC-API 和直接 API 集成仍 BLOCKED。

**最新唯一已派发任务书：Plan 04-A = SENT**，[04-A-wechatagent-extension-readonly-audit-execution.md](04-A-wechatagent-extension-readonly-audit-execution.md)。研究 WeChatAgent 扩展/插件、DSH Tool、会话授权，尤其今日新发布 **WeChatAgent v0.4.1** ZIP Plugin API v2 与 DSH 插件体系不兼容的边界。仅输出独立研究 PR 的 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md`，**禁止升级/安装 ZIP/操作真实会话/代码/合并**。未来的初学者产品依然必须图形化、中文、依赖按需授权。新会话收到 DS 的 04-A 报告先验 A01–A15；若通过再评估 03-B 合并门禁与 Plan 05 Core-A，07-B 在 Plan 05 契约之前绝不实施。此前 07-A REVIEW_REQUIRED / 04 PLANNED、0.4.0 最新的说法均是旧快照。

**长期合并闸门不变：Plan 03-B WAIT_USER_AUTHORIZATION，PR #16 HEAD 954a01a、0 reviews、CI 40165832178 SUCCESS，但未合并；PR #17 是唯一规划 branch，#18 历史 Draft，#19 研究 OPEN**。任何旧完成状态、项目主干 Commit、CI 和本地版本，下次须实时重查。用户没有批准从此任务书自动升级 WeChatAgent 0.3.9 或发微信。

## 最新交接：Plan 07-A 初报需同 ID 修订 F01（2026-10-25）

**本条优先于下文任何“07-A = SENT 等待第一次报告”的历史段落。** 用户已提供《Plan 07-A · RVC 上游许可与依赖静态审计报告》。ChatGPT 已实时核查 PR #19 OPEN、HEAD `8276909`、仅 `docs/SVC_PROVIDER_RESEARCH.md` +348 行、CI `40230248341` SUCCESS；#16/#17/#18 仍 OPEN、main 未变。报告核心安全/许可证/原创 Fake 结论正确，但没有通过原 Level 2 A01–A14 完整验收：编号错位、源码缺 commit+行号级证据、提议 Fake 包装层未明确映射 PR #16 的 SVC v1 纯合同，未来首次安装 Manifest 缺逐组件证据。

**已正式派发 Plan 07-A-F01 = SENT，07-A = REVIEW_REQUIRED，07-B = PLANNED/NOT_SENT**。唯一详细执行文档：[07-A-F01-research-acceptance-correction.md](07-A-F01-research-acceptance-correction.md)，只允许 DeepSeek 在**原 PR #19** 的 `docs/SVC_PROVIDER_RESEARCH.md` 内按 R01–R10 修复，报告 A01–A14 必须与原任务书一致；不能新建重复 PR、改 #16/#17/main/生产或开始 07-B。下一聊天收到 F01 报告先验收真实最新 PR #19 HEAD/CI 与事实；达到标准再标 Plan 07-A DONE，并选择真正有前置条件的下一计划（当前队列 04→05→07-B；03-B 的 #16 merge 必须用户明确授权）。

**注意 PR #16**：当前仍 OPEN，0 reviews，合并门禁 03-B WAIT_USER_AUTHORIZATION；不能拿上游研究的成功来代替合并批准。Whale Audio Core / Voice/Singing 双页 / 小白优先 / Seed-VC 后续可选与 RVC 主线仍为永久产品决策。

## 最新阶段交接（2026-10-25）· Plan 07-A 已交付任务书

ChatGPT 收到 DeepSeek 的 Plan 03-A G01–G12 最终合并前准备报告，经实时核对：main bf9cf66、PR #16 OPEN @ 954a01a、CI 40165832178 SUCCESS、0 reviews；PR #17 规划最新旧 HEAD 110a1b38 的 CI 40228467845 SUCCESS。**03-A DONE 不等于授权合并**；03-B 仍 WAIT_USER_AUTHORIZATION。

**唯一刚派发的下一份任务书：Plan 07-A，独立文件 [07-A-rvc-upstream-static-audit-execution.md](07-A-rvc-upstream-static-audit-execution.md)，任务状态 SENT/待 DS 报告。** 只研究 RVC 外部许可/API/Windows 依赖和零编程小白首次安装的证据，Seed-VC 仅最小静态档案。输出 docs/SVC_PROVIDER_RESEARCH.md 的 docs-only PR，不能开始真实模型/下载/生产/微信或改 PR #16。用户转发 DS 后，下一轮收到 DS 报告需依据 A01–A14 与新手 DoD 验收，再回下一份详细任务书。07-B 不得自动启动；03-B merge 需要用户独立授权。历史交接中“07-A PLANNED/NOT_SENT”是本次正式派发前的记录。

## 最新最高优先级原则：用户零编程基础（2026-10-25）

用户明确要求：“请你始终记住，本项目是始终给不会代码的编程小白用的，保持易用性。” 此为永续架构与任务验收门禁，见 [NOVICE_FIRST_PRODUCT_STANDARD.md](NOVICE_FIRST_PRODUCT_STANDARD.md)。每次 ChatGPT 给 DeepSeek 的 Level 2 任务书与对应报告验收都要附 Novice First DoD，确保普通用户从简体中文 UI 完成声明支持的流程，不被迫通过终端、Git、Python/pip/npm、手动配置 JSON/ENV 才能使用；新手安装应当是经过审核和用户主动确认的图形化过程，带最小依赖、清晰进度和错误恢复，不牺牲隐私/版权/WeChatAgent/Worker/Relay 安全。不能把当前 Mock/只读页面宣称已满足产品标准。原 Plan 01–14 和 07-A PLANNED、03-B WAIT_USER_AUTHORIZATION 不变；用户本轮仅批准记忆与规划标准落地，不授权实际下载安装/工程重构或合并 PR。

## 最新优先决策：RVC 首发、Seed-VC 免训练零样本选配（2026-10-25）

**用户明确授权调整 PR #17 的规划文档。** Whale Singing 主路线为 RVC：Plan 07-A 上游许可/API/资源只读审计→12-A RVC 离线 MVP→12-B/C 自动点歌与受控交付（均受各自前置与权限门禁约束）。**Seed-VC 非首发，不删除历史候选，仅属 Plan 12-D 后续“零样本/免训练试唱”选配**：07-A 只做固定上游来源/许可证/归档风险与专用唱歌模型情况的最小静态档案；RVC MVP 稳定后经用户另行授权才可能进行 Windows/GPU/CPU 真实实测。官方歌声转换模型约 200M 参数、Tiny 25M 主要用于语音；**不能宣传低显存、CPU 轻量或自动实时整首翻唱**。Seed-VC 官方上游 2025-11-21 归档，固定版本与安全/维护风险必须核查。

Whale Audio Core（鲸音核心）仍共享 TTS/SVC；Whale Voice 与 Whale Singing 分开两个前端，首次依赖弹窗各自独立。Plan 14 默认 Singing 仅展示 RVC 标准翻唱的必需依赖，Seed-VC 只作为后续可选说明，不预装、不自动下载、不宣称 READY。Plan 06 的 provider registry 保持扩展接口但未实现候选不可选。权威 [总表](README.md)、[Plan 07](07-svc-a-seed-vc-rvc-audit.md)、[Plan 12](12-svc-b-singing-wechatagent.md)、[Plan 14](14-onboarding-release-quality.md)、[双入口规范](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)。原 Plan 01–14 不重编号，03-B 仍 WAIT_USER_AUTHORIZATION，07-A 当前 PLANNED/NOT_SENT。本轮只有计划仓库变更，没有用户授权合并工程 PR、安装、运行模型或真实发微信。

## 最新优先交接决策：Whale Audio Core（鲸音核心）与双首次向导（2026-10-25）

**用户最新要求**：语音产品 **Whale Voice · 语音气泡** 与唱歌产品 **Whale Singing · 唱歌** 共用一个更名的后端 **Whale Audio Core（鲸音核心）**，但前端是两个独立页面；分别第一次进入时弹各自的依赖清单与安装选项，之后可跳过/重新检测、安装状态可信、共用组件不重复安装。Whale Relay Core（鲸递）依旧只负责安全投递，WeChatAgent 依旧拥有微信身份；仓库/插件 ID、现有已验八页、legacy API/配置和 whale-v1 不能贸然改名。

已新增权威文档：[WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md](WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)，并更新 05/07/08/09/12/13/14、翻唱蓝图、README、长期记忆、执行标准。Plan 09 先做 **Fake 两页及独立首次 Modal**，Plan 14 才审供应链/实安装。用户只授权**规划更新**，未授权创建工程代码、安装模型/工具、服务启停、付费联网、微信投递或 PR 合并。

继续沿用上一轮动态推荐队列，**07-A 上游许可/API/安装可检测性只读研究是下一项可派发的候选（PLANNED/NOT_SENT）**；03-B 仍等用户单独决定是否合并 PR #16。Plan 01/02/03-A 状态和原 01–14 编号不变。任何早期交接中“只有 Whale Voice Core”或“Plan 03-A 尚未完成”的陈述均为历史快照，以本段及最新 GitHub HEAD/CI 为准。

## 最近期规划决策：采纳 AstrBot RVC/SVC 自动翻唱路线并重排动态队列（2026-10-25）

**优先级高于下文任何旧“下一步是 Plan 03-A”的历史快照。** 用户决定把 astrbot_plugin_rvc_svc 的点歌/分离/RVC-SVC 转换/混音能力变成 Whale Voice + Whale Relay（鲸递）后端的可选歌唱流水线。不能直接安装 AstrBot 插件进 DSH，也不让鲸递 Core 负责搜索和推理：Whale Voice Core 协调 CoverTask/音频/Provider，独立受许可的兼容 Gateway 运行 SVC，鲸递只执行受控一次投递，WeChatAgent 依旧拥有微信身份权限。绝不修改原 01–14 编号。

权威设计：[RVC/SVC 自动翻唱蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)。已经实际更新 Plan 04/05/06/07/08/09/12/13/14、计划总表、长期记忆、变更日志。**新推荐派发顺序以计划总表最新队列为准**，不是旧表里纯编号先后。核心：可先发 07-A 上游 API/许可证/版权和资源只读审计，再在用户单独批准的 #16 03-B 合并门禁后处理 04→05→07-B→06→08→13-A→09(OFFLINE)→12-A→13-B→12-B/12-C；10/11 可按资源并行，13-C 最后研究，14 发行验收。03-B 未获授权仍 WAIT_USER_AUTHORIZATION，不得自行 Merge；Plan 07-A 当前也还是 PLANNED/NOT_SENT，须先由 ChatGPT 升级/派发 Level 2。

上游公开资料表明插件仓库带 AGPL-3.0，独立 RVCSVC-API 仓库尚未找到明确 LICENSE；必须先审计权利，不可擅自复制/打包。网易云/QQ 搜索不代表拥有歌曲下载/翻唱/分发权。默认用户提供授权音频，真实音源获取、推理和消息发送各需独立许可。

最新已验收的工程事实：Plan 03-A DONE，工程 PR #16 OPEN @ 954a01a08587bc8bd5b8caccf026298ca54d5215，Actions 40165832178 build/ui SUCCESS、0 reviews；main bf9cf66，03-B 待单独合并许可；Plan 01 SENT、02 DONE；H0/C1 已完结，#17 单一规划分支、#18 历史 Draft。此规划变更仅更新 #17 docs，没有给 DeepSeek 发送新任务，也没有更改代码/生产/微信。

## 最新交接优先项：Plan 03-A 已通过，03-B 等用户授权（2026-10-25）

- 用户已提交 DeepSeek 的《Plan 03 · PR #16 合并前准备与待授权报告》。本次 ChatGPT 独立核验 GitHub：PR #16 HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`、base main `bf9cf66807e12d0b25872a0fa3869962dde04818`，OPEN、mergeable、未合并；PR 总 22 文件 +2490/-176；GitHub 人工 reviews=0。
- 03-A 的 `954a01a` 相比代码 HEAD `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773` 只前进 1 个提交，两份文档 `docs/AI_CONTEXT.md` +43/-20、`docs/PROJECT_STATUS.md` +20/-8；两文档保留历史 192 并新增当前 197（196 PASS / 1 SKIP）和 UI 24/24、DESIGN/OFFLINE、合并需用户许可。
- **HEAD 954a01a 的 GitHub Actions run `40165832178` build 与 ui 两 Jobs 均 SUCCESS**。DeepSeek 报告本地 Node 197（196 pass、1 skip）、UI 24/24、build 217349 bytes、G01–G12 全通过；ChatGPT 验证了 GitHub 文件/Commit/Jobs，但未在本地重跑 Windows Node/UI。
- **Plan 03-A = DONE / READY_FOR_USER_MERGE_DECISION；Plan 03-B = WAIT_USER_AUTHORIZATION / 未派发**；总 Plan 03 仍未完成，PR #16 尚未合并，TTS-A 仍 DESIGN/OFFLINE，无任何真实 TTS/SVC Provider。Plan 01 SENT、Plan 02 DONE、04–14 PLANNED；H0 和 C1 不重做。
- Plan #17 仍为唯一规划分支；#18 OPEN/DRAFT 重叠历史保持原状。任何对 #16/#17/#18 的 Merge Commit、Force Push、删分支或生产操作必须用户明确授权，不能把报告、已写计划书或绿色 CI 视为授权。
- **下一项唯一决策：请求用户明确选择是否将 PR #16 当前（或重新核实后的）HEAD 合并进 main，特别说明目前 0 条人工 Review。** 如果用户授权才重新审阅最新 HEAD/main/reviews/CI、给 DS 03-B 精确执行任务书；如果拒绝或暂缓则等待，不生成新修复任务。
- DeepSeek 完成 03-A，进入等待人工门禁的清晰阶段边界。DSH 对话建议：现有对话如果很长，先保全非敏感工作区 git status，在 03-B 获授权时用新的 DSH 聊天执行后续任务；只更换聊天，不重启服务。
## C1 新对话恢复实录（2026-10-25，最新状态优先）

- **C1 已完成，不应再当作未开始的 ChatGPT 项目重复执行。** 已依交接标准读取五份指定文件及详细任务标准、任务索引，完成主干、PR #16–#18、最新 HEAD CI 与 03-A 工程文档核验。未来新会话依然需要实时确认 GitHub 状态，但不用新建第二个 C1。
- main bf9cf66807e12d0b25872a0fa3869962dde04818；#16 OPEN、mergeable、未合并、HEAD 3ad32bcb22b1a0346eed91f7236afb4f1cc8f773、CI 40163881122 SUCCESS；#18 OPEN/DRAFT、HEAD 42cec57ae7018735cb6c65a4ef8b0a1d80473810、CI 40159114676 SUCCESS。三 PR 均无已提交的人工 Review。
- #17 本次规划文档提交前 HEAD 8864e4c3ab0aec5a8dd177579497bd1f0960efdb、run 40165005768 SUCCESS；本次写入改变 #17 HEAD，后续核查最新 CI，不沿用前版成功结论。
- **Plan 03-A 仍 SENT、未验收**：#16 HEAD 没有从 Plan 02 的 3ad32bc 前进，docs/PROJECT_STATUS.md 和 docs/AI_CONTEXT.md 仍含旧 192、没有当前 197 与 3ad32bc 的新验收快照；合并前 22 文件独立审查、两份状态文档修改后的新 CI 与最终工程报告均无交付证据。
- Plan 02 DONE（DESIGN/OFFLINE，工程 PR 仍 OPEN）；Plan 01 SENT；Plan 03-B WAIT_USER_AUTHORIZATION；Plan 04–14 PLANNED；H0 已完成，不再做 14 对重复比对。
- **唯一后续动作**：请 DeepSeek 按已派发的 Plan 03-A 完成原工程 PR #16 的全 Diff 安全审查、同步两份状态文档、隔离测试与新 HEAD CI，并提交报告；ChatGPT 收到该工程报告后核实 DoD 并自动回完整续行/下一份计划书。没报告不重复创建或派发任务。未获单独许可，绝不合并 PR。
- 本轮只更新 PR #17 计划交接状态；没有修改 #16 工程、main、运行中的 DSH/WeChatAgent/微信/音频设备或生产配置，没有本地 Windows 执行环境测试。
## 0. 新一位 ChatGPT 的 30 秒恢复摘要

1. 这是 **Whale Voice / 小鲸鱼** 的私有仓库：\`qianqiucn/dsh-whale-voice\`，DSH 插件，**WeChatAgent 是微信接入平台的必需依赖**，不要改造成第二套微信机器人。
2. **用户让 ChatGPT 管规划，DeepSeek 管编码。** ChatGPT 负责详细任务书、顺序、Git 计划记忆、审查与 DONE 标记；DeepSeek 负责被分配的源码实现、测试、工程 PR、报告。两者共用 AGENTS 安全约束。
3. 用户要求：**任务书尽可能精确到 DeepSeek 几乎只需执行**；每次收到 DeepSeek 开发/测试/验收报告，**本轮自动返回一份完整、独立可复制的 Level 2 执行/续行计划**，无需等“下一份”，同时主动判断 DSH 执行端是否应换新聊天。
4. 原始 **Plan 01–14 编号稳定，不能重排编号来掩盖历史**；技术阶段 TTS-A/TTS-A-H/4B-2B-2a 等、Plan 编号、GitHub PR 编号是三套不同标识。
5. **Plan 02 = DONE**（TTS-A/TTS-A-H 纯契约阶段，PR #16 仍 OPEN）。**Plan 03 = 03-A SENT、03-B WAIT_USER_AUTHORIZATION**（PR #16 最终审查及获明确授权后合并）。**Plan 01 GUI 回归 = SENT**；Plan 04–14 仍待按依赖推进。
6. H0 的 PR #17/#18 两套 14 计划去重已经**完成**，记录在 [H0_PLAN_RECONCILIATION.md](H0_PLAN_RECONCILIATION.md)。**#17 是唯一权威规划入口；#18 是 Draft 历史来源。不要重做 14 对比对或开第三套计划。**
7. **下一位 ChatGPT 的唯一第一任务**：读取标准并核验当前 PR #16/#17/#18/最新 CI、确认 Plan 03-A 是否有新交付证据；按 [NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md) 行动。不能未经用户另行授权合并 PR #16/#17/#18 或开始生产写入。
8. 本交接不要求调用付费 API、TTS 推理、真实微信、Windows 音频设备、Hook/DLL，不允许重启生产服务。

## 1. 必须遵守的启动阅读顺序（ChatGPT 专属）

1. [EXECUTION_STANDARD.md](../../EXECUTION_STANDARD.md)：ChatGPT 的 GitHub/规划执行标准。
2. [AGENTS.md](../../AGENTS.md)：两 AI 分工、通用质量与安全底线。
3. [CHATGPT_LONG_TERM_MEMORY.md](CHATGPT_LONG_TERM_MEMORY.md)：用户稳定偏好、每份报告自动回完整计划和执行端换新对话提醒。
4. [TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md) 与 [TASK_SPEC_TEMPLATE.md](TASK_SPEC_TEMPLATE.md)：Level 2 EXECUTION-READY 与 16 节详细任务书模板。
5. **本交接卡**及 [下一会话执行计划](NEXT_CHATGPT_ACTION_PLAN.md)。
6. [唯一计划总表](README.md)、[计划日志](CHANGELOG.md)、[Plan 03](03-merge-tts-a-pr16.md)、[Plan 02](02-tts-a-complete-review.md)、按需 [Plan 01](01-gui-coverage-closeout.md)。
7. [H0 去重结果](H0_PLAN_RECONCILIATION.md)，需要了解来源时读，不重新实施 H0。
8. 工程分支上的 [PROJECT_STATUS](../PROJECT_STATUS.md)、[AI_CONTEXT](../AI_CONTEXT.md)、[ROADMAP](../ROADMAP.md)、[DECISIONS](../DECISIONS.md) 与实际代码/测试；**main 文档可能陈旧**。
9. **实时 GitHub**：最新 main HEAD、PR #16/#17/#18 head/base/state/draft/CI、实际 Diff、review；无法访问则明确告知，不编造状态。

如果这些材料不一致，GitHub 当前代码、测试及用户实际授权优先；记忆和报告不能独立证明代码已实现。

## 2. 2026-10-25 本轮实时核验证据（下次务必重查）

| 对象 | 本轮核验事实 | 本轮证据/注意 |
|---|---|---|
| \`main\` | \`bf9cf66807e12d0b25872a0fa3869962dde04818\` | Compare \`bf9cf66...main\` 返回 identical |
| [PR #16 TTS-A](https://github.com/qianqiucn/dsh-whale-voice/pull/16) | OPEN；HEAD \`3ad32bcb22b1a0346eed91f7236afb4f1cc8f773\`；base main；可合并 | CI run \`40163881122\` **SUCCESS**；22 files；未合并 |
| [PR #17 计划体系](https://github.com/qianqiucn/dsh-whale-voice/pull/17) | OPEN；HEAD \`4b700bc330cab4a58aec528484550ff134b78f89\`（**交接修改之前**）；base main | CI run \`40164634185\` **SUCCESS**；本交接变更提交后 HEAD/CI 会更新，旧 run 不可沿用 |
| [PR #18 另一规划来源](https://github.com/qianqiucn/dsh-whale-voice/pull/18) | OPEN / Draft；HEAD \`42cec57ae7018735cb6c65a4ef8b0a1d80473810\` | CI run \`40159114676\` **SUCCESS**；**不要**再次建立第二权威总表、未经许可不得关闭/合并 |
| Plan 01 | SENT，\`test/phase4b2b2a-gui-coverage\` / \`506fe3b\` 为先前本地报告，远端验收仍缺 | 不应凭本地历史描述标 DONE |
| Plan 02 | DONE（2026-10-25），工程等级 DESIGN/OFFLINE | F01–F05 + N01–N05 的 PR #16 纯契约缺陷已核验；DS 报告 Node 197（196 pass/1 Windows skip）/ UI 24/24，ChatGPT 未本地重跑 |
| Plan 03 | **03-A SENT，03-B WAIT_USER_AUTHORIZATION** | 03-A 为合并前复审/状态文档同步；03-B 合并必须用户明确授权，未派发 |
| H0 | DONE | 去重记录已有，不重做 |

**工程 PR #16 两个仍需同步的文档证据（本轮直接读取其 HEAD）：**

- \`docs/PROJECT_STATUS.md\`：**不包含 197**，仍包含历史 **192** 测试计数。
- \`docs/AI_CONTEXT.md\`：**不包含 197**，仍包含历史 **192** 测试计数。
- 因此目前**没有 PR #16 03-A 文档同步完成的 Git 证据**；不能把“计划 03-A 已发送”写成完成。03-A 的最新严格操作见 [Plan 03](03-merge-tts-a-pr16.md)。

请不要把本次交接之后的新 PR #17 提交 SHA 当作固定值；必须重新查询当前 PR head 和 CI。

## 3. 当前阶段进度：已完成什么、未完成什么

- **Phase 3B、4A**：真实 DSH Host/只读配置为 \`INTEGRATED\`，不是 \`VERIFIED\`。
- **Phase 4B-1**：隔离配置单文件 Store，PR #9 已合并，\`OFFLINE\`；没有生产写路由。
- **Phase 4B-2A**：隔离 Config Coordinator、Journal、修订及回滚合同，PR #12 已合并，\`OFFLINE\`；无完整跨进程强一致与真实 loaded revision。
- **Phase 4B-2B-1**：组件能力审计，PR #14 已合并，\`AUDIT COMPLETE / OFFLINE\`。
- **Phase 4B-2B-2a**：Capability Schema v3 / GET-only Host 路由、真实 DSH 重启后的八个导航页与组件管理已验收为 **INTEGRATED，非 VERIFIED**；PR #15 已合并。情绪系统与任务/日志仍为明示 Mock 交互。
- **Phase 4B-2B-2b**：尚未开始；真实 Sender automation 写入、Bridge/Worker 权限、运行时 apply 等没有获授权。
- **TTS-A/TTS-A-H**：PR #16 设计/纯契约已交付，10 个 TTS + 2 个 SVC 注册候选、provider-neutral 设计、v2 配置迁移提案、F01–F05 安全修复；全部 **DESIGN/OFFLINE，不是生产 Provider 集成**。
- **Whale Relay（鲸递）**：统一投递层是目标架构；既有 Voice Sender UI Automation 是外部已有路径；Native Hook 是研究候选而非正式支持。
- **WeChatAgent**：插件的微信接入必需平台；扩展功能按官方/已安装版本审计，不能修改私有 Hook、强行注入、绕开消息与白名单授权。
- **Qwen/whale-v1**：本地个人参考引擎/音色，不是整个产品的强制默认；产品目标覆盖多款本地、云端、自定义 API TTS 与 Seed-VC/RVC 等 SVC 候选。

## 4. 产品的不可降低安全契约

\`\`\`text
DSH UI / WeChatAgent extension（仅受支持接口）
  → Whale Voice Core：唯一全局 Task + Delivery ID / TTS + SVC / Provider / 音色 / 音频
  → Whale Relay Core（目标）：投递验证与单次安全执行
      ├─ ui-automation：已有 Voice Sender 路径，保留不重写
      └─ native-hook：研究候选，未验证不可开启
  → WeChatAgent：微信会话、身份与权限平台
\`\`\`

- Worker \`NEVER_WRITE\`；Bridge voice.enabled 与 Worker voice_enabled 为独立闸门。
- 发送结果 \`UNKNOWN\` 不自动重试或换 Native Hook/按键后端重发；\`SENT_LOCAL\` 不等于微信服务端已收。
- 配置 \`SAVED\` 不等于运行时 \`APPLIED\`；无可信 loadedRevision 仅 PENDING_APPLY/UNKNOWN。
- 不把 Mock、隔离测试、CI 绿色、真实 GUI 集成或 PR 合并混成一项验收。
- GitHub 计划正文不得存真实 Token、Cookie、微信个人标识、联系名单、参考音频/音色文件、截图、本机敏感绝对路径。
- 高风险操作（Merge、Force Push、删除分支/Tag、生产配置写入、服务重启、真实微信发送、Hook/DLL、音频设备、付费 API、公开仓库/Release）必须**单独明确授权**。文档交接不是授权。

## 5. 两位 AI 的边界及用户沟通习惯

| ChatGPT 必须亲自负责 | DeepSeek 应负责 |
|---|---|
| 详细 Level 2 任务书、唯一建议技术路线、精准文件/接口/错误/测试、计划排序 | 根据已授权的任务书进行工程代码/测试/技术文档和 PR |
| 新想法当轮评估/归档、计划依赖与变更历史 | 报告可验证的阻塞、实测与实现差异 |
| 报告后检查 Git/CI/DoD、独立标记 DONE/PR 状态 | 不替 ChatGPT 重排计划或维护 SENT/DONE 台账 |
| 每份 DeepSeek 报告后**同一回复自动给出完整一份续行或新任务** | 不自主开始下个计划或高风险生产操作 |
| 每次报告同时提醒 DSH 执行端是否应该换新对话 | 需要换新执行端聊天时先保存工作区/PR 非敏感交接 |

**去重规则：** 相同报告与 HEAD 没新证据，不增加新 Plan 编号、不新开 PR、不让 DS 重做已实现的 TTS-A；只给原任务完整的续行版。报告显示上下文漂移或阶段切换时，提醒换新 DSH 执行端对话；无法直接看到它的 token 余量。

## 6. 下一位 ChatGPT 的最先要做的事情

**不要再做 H0，也不要凭旧交接擅自宣布 Plan 03 完成。**

1. 读本交接的全部前置标准与 [NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md)。
2. 核对最新 main、#16/#17/#18 以及**每个最新 HEAD 对应 CI**。
3. 查 PR #16 的 \`docs/PROJECT_STATUS.md\`、\`docs/AI_CONTEXT.md\` 是否已同步新 197 基线，以及是否有新的 03-A 审查/CI/报告证据。
4. 如果**无新增交付**：保持 Plan 03-A SENT、03-B 未授权；不重复发一份新任务去覆盖已发送任务。用户请求任务或新会话执行端需要接续时，用 **Plan 03-A 的原 ID 续行**，不创建 Plan 15。
5. 如果**03-A 有完整报告**：逐项核对 Plan 03 DoD，必要时更新状态；通过后只把 PR #16 标为 **READY_FOR_USER_MERGE_DECISION**，请用户决定是否授权 03-B；**本交接不含授权**。
6. 如果用户发送新的开发报告，按长期规则**当次提供唯一一份完整的可复制任务书**并判断执行端换新对话。
7. 对 #17/#18 的重复计划问题：H0 已比对完成，只保留 #17 为权威，#18 为历史 Draft；只在新变化出现时做最小复核，不再重跑全量整理。
8. 更新本文件中的**最新证据段落**及计划索引/变更日志（如有实质变化），正常 Commit/Push 到 #17；没有新事实不制造空提交。CI 未通过不能声称通过。

## 7. 新会话开场语（用户可直接粘贴）

> 继续 Whale Voice 的 ChatGPT 规划职责。请先读取私有 GitHub 仓库 \`qianqiucn/dsh-whale-voice\` 的 PR #17 分支 \`docs/whale-voice-execution-plan-registry\` 中 \`EXECUTION_STANDARD.md\`、\`AGENTS.md\`、\`docs/plans/CHATGPT_LONG_TERM_MEMORY.md\`、\`docs/plans/NEXT_CHATGPT_HANDOFF.md\` 和 \`docs/plans/NEXT_CHATGPT_ACTION_PLAN.md\`。先核对最新 main/PR #16–18/CI 与 Plan 03-A 的现状，不重复 H0，不改 Plan 编号。你负责详细计划和 Git 状态；DeepSeek 负责执行。**未获授权不合并 PR。** 按交接中的下一项计划继续。

**交接完成判据：** 下一位 ChatGPT 能仅凭这些文档恢复“谁负责什么、目前在哪、下一步是什么、哪些操作不能碰”；无需从过去整段长对话推断。
