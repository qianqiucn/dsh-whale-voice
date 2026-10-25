# Whale Voice · 计划演变记录

此文件只记录任务书与排序变化，不代替 Git commit、测试或项目阶段验收。

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