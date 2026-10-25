# ChatGPT 交接行动计划 C1 · 恢复上下文与 Plan 03-A 最新证据核验

> **执行者：下一次 ChatGPT 会话。不是 DeepSeek 开发任务，不是新的 Plan 15。**
>
> **任务状态：DONE（2026-10-25，已由本次 ChatGPT 对话执行 GitHub 恢复核验）。**
>
> **执行范围：只读核验与 GitHub 计划文档必要更新；不修改工程运行代码，不自动合并 PR。**
>
> **起始快照：2026-10-25，Europe/Amsterdam。实时 GitHub 状态优先于以下任何 SHA。**
>
> 前置交接：[NEXT_CHATGPT_HANDOFF.md](NEXT_CHATGPT_HANDOFF.md)。先读该文件再执行本计划。

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

**恢复行动：** 优先核对05-B是否已经实施、其新PR和父base；若仅收到重复F01报告且无新HEAD，不重做F01或派第二份05-B。完成后停止等待交付。旧C1已完成。

## 最新核验（2026-10-25）· Plan 05-A REVIEW_REQUIRED，F01 已派发

**当前唯一工程任务：[Plan 05-A-F01 · 输入边界与错误脱敏修订](05-A-F01-contract-boundary-hardening.md) = SENT。** 继续原 PR #21 / `feature/plan05a-whale-audio-core-contracts`，不创建重复 PR、不推进下一模块；父任务 05-A 尚未 DONE，等级 OFFLINE / NOT_INTEGRATED。

已核验 [PR #21](https://github.com/qianqiucn/dsh-whale-voice/pull/21) OPEN，HEAD `0e05061476a97826e7b2bbc2886847d1dbc92fd8`，base main `bf9cf66807e12d0b25872a0fa3869962dde04818`，仅五份新增文件 +2979/-0，0 reviews；[CI 40236154425](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40236154425) build/ui SUCCESS。ChatGPT 独立重跑新文件测试 **65/65 PASS**（Node v24.22.0；CI Node22）；全量 241/240/1、UI24/24 是 DS 报告值，ChatGPT 核对远端 jobs 成功但未本地重跑全仓库/UI。

**独立额外输入复现三项缺口**：F01-01 Relay 接受缺少必填字段/配对错误/嵌套 token 的记录；F01-02 Object.keys 漏检不可枚举及 Symbol 键；F01-03 errors.path 回显任意短 ASCII 键（虚构邮箱标记复现）。候选仍不可发送，不宣称真实泄露或发送。B05/B13 FAIL；B04/B06/B12/B15 PARTIAL；完整 B01–B18 与修复规格见 F01 第16节。

已批准保留：tts-selected REQUIRED；独立 SEED_VC_STATUS；本阶段 deliveryRequired 恒列未实现投递组件。只修原五文件，新增统一 validateAudioTaskRecord、完整自有属性检查、未知键固定占位及 N01–N16 回归。原65项和原52项安全意图保留；报告T组实际36而非35，合计65。

**03-B 仍 WAIT_USER_AUTHORIZATION，#16 OPEN @954a01a；#17 唯一规划分支，#18 Draft，#19/#20 OPEN，04-A 与07-A研究 DONE 不重做。** 不 merge、改生产、装依赖/模型、升级服务或发微信。DeepSeek 继续当前对话做原PR小修；ChatGPT 收新报告后复核新 HEAD/CI 和全部验收，不凭旧绿灯标 DONE。以下旧 SENT/等待首次报告/C1 03-A 待办仅属历史。

**恢复入口修正：** 本文件旧 C1 已完成，禁止按旧正文重新派 03-A。新会话优先读取本节与 F01，核对 #21 的新增修订；没有 F01 报告时不重复派发。

## C1 执行实录（2026-10-25，恢复任务已完成）

- 已读取 PR #17 计划分支的 EXECUTION_STANDARD.md、AGENTS.md、CHATGPT_LONG_TERM_MEMORY.md、NEXT_CHATGPT_HANDOFF.md、NEXT_CHATGPT_ACTION_PLAN.md，并补读 TASK_SPEC_STANDARD、任务模板、计划总表及 Plan 03。
- GitHub main HEAD bf9cf66807e12d0b25872a0fa3869962dde04818；PR #16 OPEN/未合并/mergeable，HEAD 3ad32bcb22b1a0346eed91f7236afb4f1cc8f773，当前 HEAD CI run 40163881122 SUCCESS；PR #18 OPEN/DRAFT，HEAD 42cec57ae7018735cb6c65a4ef8b0a1d80473810，CI run 40159114676 SUCCESS。
- PR #17 在本次 C1 文档更新前核实 HEAD 8864e4c3ab0aec5a8dd177579497bd1f0960efdb，run 40165005768 SUCCESS；本次计划文档提交会改变 #17 HEAD，后续需另查其 CI，不能沿用旧 run。
- PR #16 最新文档 docs/PROJECT_STATUS.md、docs/AI_CONTEXT.md 均有历史 192 Node 记录、没有当前 197 及 3ad32bc；工程 HEAD 未较 Plan 02 修复提交前进。因此没有可据此验收 Plan 03-A DONE 的新交付证据。
- 03-A 保持 SENT；03-B 仍 WAIT_USER_AUTHORIZATION；Plan 01 SENT、02 DONE、04–14 PLANNED；H0 已完成且不重做。没有合并 PR、修改工程代码或生产环境，也没有本地重跑 Windows Node/UI 测试。
- **下一会话不得重新执行 C1 作为新独立计划**。新会话仍先读本文件和交接卡作为恢复入口，再核实最新 Git/PR/CI；唯一工程进度跟进对象为 **Plan 03-A 已派发任务的实际交付/续行**，不得新建 Plan 15 或推进 03-B 合并。
## 1. 唯一目标和完成后应得到什么

下次打开新 ChatGPT 对话时，**准确恢复 Whale Voice 的规划职责，核实 Plan 03-A 是否已由 DeepSeek 完成**，基于真实 PR/CI 证据决定：

- **若 03-A 未完成**：保留 \`SENT\`，给用户明确待执行项；用户要求继续开发时只发 **Plan 03-A 的续行版**（同一 ID/PR，不重复 Plan 02 TTS-A），绝不能把 03-B 视为获授权。
- **若 03-A 已完成且验收通过**：记录其合并前门禁结果 \`READY_FOR_USER_MERGE_DECISION\`，更新计划证据，**等待用户单独授权是否执行 03-B 合并 PR #16**，不得自行合并。
- **若出现新问题/失败**：保留当前任务，以同一 Plan 03-A 补丁/复验处理，不创建相似的 Plan 15。
- **若用户这次发送的是 DeepSeek 的报告**：依据该报告进行审查，并**在同一答复中给出一份完整、独立可复制的 Level 2 DeepSeek 执行或续行任务书**，附 DSH 对话交接建议；无需用户重复说“下一份”。

**结果归属：** 这份 C1 是 ChatGPT 自己的恢复/核验计划；DeepSeek 正在执行的工程计划保持原编号 **Plan 03（03-A/03-B）**。C1 完成不等于工程 Plan 03 DONE。

## 2. 历史事实（只有在下次实时核实后才可称为“当前”）

| 项目 | 2026-10-25 最近核验 | 下次必须确认 |
|---|---|---|
| 仓库 | \`qianqiucn/dsh-whale-voice\`（私有） | 连接是否仍有读取/写入权限 |
| main | \`bf9cf66807e12d0b25872a0fa3869962dde04818\` | 最新 HEAD 是否变化 |
| PR #16 | OPEN，\`3ad32bcb22b1a0346eed91f7236afb4f1cc8f773\`，base main | 最新 head/state/draft/mergeable/review/CI/文件差异 |
| PR #16 CI | run \`40163881122\` SUCCESS | **只能使用最新 HEAD 对应的 run** |
| PR #17 | OPEN，当前核验前 HEAD \`4b700bc330cab4a58aec528484550ff134b78f89\` | 交接更新后 HEAD 已变，需查询最新 CI |
| PR #18 | OPEN / Draft，\`42cec57ae7018735cb6c65a4ef8b0a1d80473810\` | 不合并、不关闭；不重做 H0 |
| Plan 01 | \`SENT\`，旧 GUI 测试 26/26 曾为本地报告 | 是否已有远端工程 PR/CI |
| Plan 02 | \`DONE\` / Git \`PR_OPEN\`，TTS-A 纯契约 \`DESIGN/OFFLINE\` | 若有新证据才改变状态 |
| Plan 03 | **03-A \`SENT\`；03-B \`WAIT_USER_AUTHORIZATION\`** | 03-A 是否已有新工程提交/审查报告 |

**直接源码证据：** 本轮从 PR #16 HEAD 读取 \`docs/PROJECT_STATUS.md\`、\`docs/AI_CONTEXT.md\`，二者均含历史 \`192\` 而未含新验收 \`197\`。这说明当时 Plan 03-A 的状态同步尚没有 Git 交付；不能仅凭旧用户报告宣布 03-A 完成。

## 3. 必须在新会话按此顺序阅读

1. [EXECUTION_STANDARD.md](../../EXECUTION_STANDARD.md)。
2. [AGENTS.md](../../AGENTS.md)（此工程安全规则对 DeepSeek 和 ChatGPT 均适用）。
3. [CHATGPT_LONG_TERM_MEMORY.md](CHATGPT_LONG_TERM_MEMORY.md)。
4. [TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md)、[TASK_SPEC_TEMPLATE.md](TASK_SPEC_TEMPLATE.md)。
5. [NEXT_CHATGPT_HANDOFF.md](NEXT_CHATGPT_HANDOFF.md)、**本文件**。
6. [计划总表](README.md)、[Plan 03-A/B](03-merge-tts-a-pr16.md)、[Plan 02](02-tts-a-complete-review.md)，按需 [Plan 01](01-gui-coverage-closeout.md)。
7. [H0 去重交付](H0_PLAN_RECONCILIATION.md) 仅看结论，**不可把 H0 当作未执行的下一任务**。
8. PR #16 工程分支的 \`docs/PROJECT_STATUS.md\`、\`docs/AI_CONTEXT.md\` 和必要源码/测试；实际 GitHub PR/CI/changed files 比旧状态文档更权威。

这些文件目前在 **PR #17 的计划分支**；如 PR #17 已合并，改为读取最新 main 版本并避免继续向已合并旧分支提交新历史。

## 4. 精确的 GitHub 检查步骤

### Step A · 先验证连接与 main

1. 用 GitHub connector 读取 \`AGENTS.md\` 和计划执行标准。
2. 获取最新 main SHA；若与本快照不同，核查新合并的 PR 对计划的影响。
3. 读取 #16/#17/#18 的最新 PR 元数据，记录 OPEN/MERGED/DRAFT、head/base、mergeable/review；不能用单个 \`mergeable:true\` 推断连续合并安全。
4. 取每个 PR **当前 HEAD** 的 Actions run，区分 SUCCESS、FAILURE、IN_PROGRESS、无结果；旧 HEAD 的绿灯不可复用。

**停止条件：** 若 GitHub 连接失效或 PR 已无法读取，报告不能核实，绝不编造 Git 结论或 Commit。

### Step B · 判断 Plan 03-A 的进度（优先）

1. 读取 PR #16 最新 HEAD 的两份文档：
   - \`docs/PROJECT_STATUS.md\`
   - \`docs/AI_CONTEXT.md\`
2. 检查是否记录本轮工程修复验收 \`3ad32bc\` / 197 Node（196 PASS、1 Windows skip）/24 UI、历史 192 保留为历史、TTS-A \`DESIGN/OFFLINE\`、PR #16 OPEN/待授权合并。
3. 检查 PR #16 在 \`3ad32bc\` 之后是否又有新的工程或文档 Commit，是否属于这两份文件的 Plan 03-A 范围；比对最新 head 的 Diff 与 CI。
4. 对照 [Plan 03](03-merge-tts-a-pr16.md) 的 DoD：是否完成全量 22 文件设计/安全审查、是否有更新后的 Node/UI/build/文档/隐私检查、是否明确输出 \`READY_FOR_USER_MERGE_DECISION\` 或 \`BLOCKED\`。
5. **不能仅凭 PR #16 CI 绿就判定文档同步或人工评审完成。** 无实际报告/文档证据时标 \`SENT\`，不是 DONE。
6. 检查是否发生超范围生产代码/Provider 接入变化；真实 API/发送路径若被添加，独立报告审查，停止合并建议。

### Step C · 根据证据走唯一分支

| 实际发现 | 本轮唯一处理 | 不得做什么 |
|---|---|---|
| PR #16 无新增 03-A 交付 | Plan 03-A 继续 \`SENT\`；如用户要求任务，完整转发 Plan 03-A 的**续行版**，强调仅剩未做项 | 不产生新编号、重做 F01–F05、自动合并 |
| 有新增提交但 HEAD CI 未完成 | 审查新增 Diff，等待用户后续请求时复核 CI；记录 IN PROGRESS / CI PENDING | 不把旧 CI SUCCESS 当新成功 |
| 03-A DoD 完整、最新 HEAD CI 成功 | 将 03-A 标审查通过，输出 \`READY_FOR_USER_MERGE_DECISION\` 并请求用户针对 PR #16 的明确合并授权 | **不得执行 03-B 合并** |
| 03-A 审查发现安全缺口或测试失败 | 同一 03-A 的最小补丁/复验规格，列出实际文件、负向测试、停止条件 | 不掩盖错误、不同时创建两个同目标 PR |
| PR #16 已由别人合并 | 检查 main Merge Commit 与当前测试、更新 Plan 03 状态，避免重复 Merge | 不改写 Git 历史 |
| PR #17 已合并 | 如真有新计划记录要写，从最新 main 建立**一个**新 docs 分支/PR | 不继续沿用旧 #17 分支制造新计划历史 |
| PR #18 仍 Draft | 将其保留历史候选，不重做已完成的 H0 | 不关闭、删除、合并或建立第二套权威索引 |

### Step D · 处理 Plan 01、其它计划与新想法

- Plan 01 是独立 GUI 自动化工作，仍 \`SENT\`；只有远端 PR/CI 或可复核交付证据才标 DONE。
- Plan 04–14 不因本轮交接跳过 Plan 03 授权门禁；若用户明确要求提前进行**只读研究**，单独说明不依赖生产写入并更新序列记录。
- 新想法：先查重、明确原任务与新任务的依赖/权限，选择性修改现有唯一计划文档；不要新开重复主计划；重要长期要求同步 \`CHATGPT_LONG_TERM_MEMORY.md\`。
- 用户交付报告：按 \`EXECUTION_STANDARD.md §2\` 自动给一份完整 Level 2 任务，**不是只有链接**。若用户只是要求“恢复上下文”，先做本计划核验，不凭空派工程任务。

## 5. 本任务允许与禁止的仓库写入

**允许（需要有实际变化）：** 对 PR #17（如果仍 OPEN）中 \`NEXT_CHATGPT_HANDOFF.md\`、本行动计划、\`docs/plans/README.md\`、\`CHANGELOG.md\` 进行必要的状态/证据更新；正常 Commit/Push；核验本 HEAD CI；更新 PR 描述。

**默认禁止：** 修改 PR #16 工程源码、替 DeepSeek 做 Plan 03-A、自动合并任一 PR、关闭 PR #18、写 main、Force Push、重写历史/删除分支、改变仓库可见性、发布 Release；修改任何生产 DSH/WeChatAgent/Bridge/Worker/Voice Sender/Qwen/音频设备/微信配置或 Hook/DLL；触发真实音频、微信消息、付费 API。

**没有新事实不产生空 Commit。** 对 PR #17 的文档更新要检查与 #18 历史分支的重叠，但不要重新全面比较全部 14 份计划（H0 已完成）。

## 6. 验收矩阵（ChatGPT 在新对话中逐项完成）

| ID | 检查 | 通过条件 |
|---|---|---|
| C1-01 | 连通性 | 可以读取私有仓库当前 AGENTS、PR 和计划分支 |
| C1-02 | 记忆恢复 | 能正确复述 DeepSeek/ChatGPT 分工和 Level 2 计划标准 |
| C1-03 | main/PR | #16/#17/#18 最新 HEAD、状态、Draft 与相应 CI 已核实 |
| C1-04 | 计划 ID | Plan 01 SENT、02 DONE、03-A SENT/03-B 待授权均按实际新证据处理 |
| C1-05 | 03-A DoD | 检查工程文档中的 197/192 状态、全 Diff 审查和最新 CI，不假定已完成 |
| C1-06 | H0 避免重复 | #17 唯一规划体系、#18 历史 Draft；不重做 H0 |
| C1-07 | 安全 | 无生产操作、无未授权 PR Merge、无私人数据写入 |
| C1-08 | 记录 | 有变化才更新 #17 计划文件并报告 Commit/CI；否则说明无提交 |
| C1-09 | 用户沟通 | 回复当前状态与下一动作；如果用户提供报告，附**完整一份 DeepSeek 计划书**和 DSH 交接建议 |

**本计划仅凭 GitHub API 做只读和文档核验**；除非有授权并具备 Windows 工程环境，不能假称在本机跑了 \`node --test\` 或真实 Electron GUI。

## 7. 最终向用户怎么交付

- 本次已读取的执行标准、交接卡及实际核验过的 PR/CI。
- 最新 main HEAD、#16/#17/#18 的状态与当前 CI。
- Plan 03-A 具体剩余项或通过证据，Plan 03-B 是否已获授权（默认无）。
- 如果文档有修改：文件名、Commit、PR #17 链接、CI；如果无新证据：说明无修改、不造空 Commit。
- 是否触及生产环境（默认否）。
- 下一项**唯一**建议动作（Plan 03-A 续行/用户授权讨论；不重复 TTS-A）。
- 用户若在新对话发来 DeepSeek 报告，则同轮输出完整 Level 2 工程计划和 DSH 执行端是否要换新聊天的判断。

## 8. 完成后停止

**C1 只是 ChatGPT 的恢复、核验与交接计划。完成 C1 不自动推进下一技术阶段，也不代表有合并权限。** 等用户进一步提出需求、送来报告或明确授权，才执行后续范围。

---

**新会话启动指令（可复制）：**

> 读取 Whale Voice 私有仓库 PR #17 分支的 \`docs/plans/NEXT_CHATGPT_HANDOFF.md\` 与 \`NEXT_CHATGPT_ACTION_PLAN.md\`，按 C1 恢复角色、核验最新 main/PR #16–18/CI 和 Plan 03-A 进度。遵守 ChatGPT 专属计划标准；DeepSeek 只负责编码。不得重复 H0、不得改动原 Plan 01–14 编号、不得未经我单独授权合并或操作生产环境。核验后告诉我当前状态和唯一下一步。
