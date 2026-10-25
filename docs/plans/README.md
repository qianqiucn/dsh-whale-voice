# Whale Voice · 执行计划总表（含 Whale Relay · 鲸递）

> **本文件是未来计划执行与回报的权威登记表，不代表生产代码功能已经实现。** 当前 Git/PR/CI、源码与真实验收记录优先于本摘要。  
> **建立日期：2026-10-25；初始仓库基线：main@bf9cf66807e12d0b25872a0fa3869962dde04818。**
>
> 当前产品方向：一个 Whale Voice Core（TTS、SVC、音色库、音频/任务），一个 Whale Relay Core（鲸递：UI Automation 和未来可选 Native Hook 的统一投递执行层），WeChatAgent 作为必需微信接入、账号/会话/授权平台。**两 Core 不得各自独立投递同一任务，唯一 taskId 和 deliveryId 属于 Whale Voice Core。**

## 新对话的首要入口（ChatGPT）

**用户要换新会话时，下一位 ChatGPT 首先读取 [NEXT_CHATGPT_HANDOFF.md](NEXT_CHATGPT_HANDOFF.md)，再执行 [NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md) 的实时核验步骤。**

- 交接卡记录最新计划/Git/PR 快照和重要安全边界。
- [C1 · 新会话恢复与 Plan 03-A 实时核验](NEXT_CHATGPT_ACTION_PLAN.md) 已于 2026-10-25 依实时 GitHub 核验执行完毕（`DONE`），不是新 Plan 15；今后新会话读其结果和最新交接卡即可，不再重复做 C1/H0。已有的 Plan 03-A 才是下一项工程进度跟进对象。
- 目前存在 **PR #17 和 PR #18 两套重叠的计划文件**（均独立基于 main、未合并），不能未经比对与用户批准就合并两套。
- 任何 SHA、测试数量和 PR 状态都须重新查询；执行标准/记忆文档仍以最新可用仓库分支为准。

## C1 已完成记录与现在的唯一跟进任务（2026-10-25）

- **先读 [新会话交接卡](NEXT_CHATGPT_HANDOFF.md) 与 [已完成的 C1 核验记录](NEXT_CHATGPT_ACTION_PLAN.md)**，随后只需重新核验新变化。C1 自身 DONE，不是工程任务，不改变原 Plan 01–14 编号。
- C1 本轮核验：main `bf9cf66`；PR #16 OPEN `3ad32bc`（run `40163881122` SUCCESS）；PR #17 本次 C1 文档写入前 OPEN `8864e4c`（run `40165005768` SUCCESS，后续文档提交的新 HEAD/CI 必须重查）；PR #18 OPEN/DRAFT `42cec57`（run `40159114676` SUCCESS）。
- **Plan 02 DONE、Plan 03-A SENT、03-B WAIT_USER_AUTHORIZATION、Plan 01 SENT。** 最新 PR #16 工程 HEAD 的 `docs/PROJECT_STATUS.md`、`docs/AI_CONTEXT.md` 尚不含最新 `197` 计数（含旧 `192`），所以 03-A 尚无完成证据；不得冒充其已完成或重做 F01–F05。
- 新 ChatGPT 先核实 03-A 的新增工程 HEAD/文档/CI；若无新进展，保留 SENT，用户要继续时只发原 ID 的续行版；若有报告则验收并自动回**一份完整** Level 2 DeepSeek 计划书。任何 PR 合并须用户单独授权。

## H0 整理结果（2026-10-25，历史快照，勿覆盖最新状态）

已完成 [14 对计划与台账比对](H0_PLAN_RECONCILIATION.md)：本总表及 #17 原有正文为唯一当前入口，吸收 #18 的具体测试/验收补充，后者保留作历史来源。PR #18 尚未关闭，#17 尚未合并；不得同时派发两套任务。01–14 顺序、01 SENT、02 IN PROGRESS / REVIEW_REQUIRED 不变。本轮没有派发新工程任务。

## 0. AI 协作职责与执行标准范围

本项目由两位 AI 分工协作：

- **DeepSeek：主要代码开发者。** 根据用户已发送并授权的任务书实施代码、测试、技术评审和常规工程 Git/PR；遵守 [AGENTS.md](../../AGENTS.md) 的质量、安全与权限规则。**不需要执行本计划索引的调度、重排、SENT/DONE 打标和更新记录流程。**
- **ChatGPT：计划书与 GitHub 计划协调者。** 负责发送下一份、整合新想法、修改开发顺序、记录 GitHub 计划状态、核验完成报告并标记 DONE；不代替 DeepSeek 的日常代码实现。

**[EXECUTION_STANDARD.md](../../EXECUTION_STANDARD.md) 只对 ChatGPT 的计划/GitHub 协调任务强制适用。** DeepSeek 可以正常 Push 代码和创建工程 PR；无需每次访问 GitHub 都阅读计划执行标准。两个 AI 都须遵守 AGENTS 的通用安全与明确授权边界。

ChatGPT 的计划记录只在当前用户对话且 GitHub 工具可用时更新，不是离线自动监控。

## 0.1 GitHub 长期记忆 + 详细任务书质量门禁

- **[CHATGPT_LONG_TERM_MEMORY.md](CHATGPT_LONG_TERM_MEMORY.md)**：ChatGPT 对用户长期要求、两 AI 分工、Whale Voice/Relay/WeChatAgent 边界的持久记忆；新会话和每次计划相关 GitHub 工作都必须先读。
- **[TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md)**：严格的工程任务详细程度标准（Level 2 EXECUTION-READY 才能派发）。原则：**ChatGPT 预先解决需求、方案选择、文件/接口与测试设计，尽量减少 DeepSeek 再次决策的空间。**
- **[TASK_SPEC_TEMPLATE.md](TASK_SPEC_TEMPLATE.md)**：每份完整任务书的可复制模板，含目标、最新事实、文件变更、契约、顺序、异常决策树、测试、DoD、报告和停止条件。

**已有 01–14 部分文档是 Level 1 的路线条目，不代表都已达到可以直接交付实现的详细程度。** 每次用户要求“下一份”时，ChatGPT 必须先结合最新 GitHub 源码/PR 逐项填全 Level 2 规格并写回仓库，再发送一份给 DeepSeek。**已经通过 PR 实现的步骤只做复核，不重复派发。**

这条额外质量要求**只约束 ChatGPT 计划书编写**，不要求 DeepSeek 维护这些记忆、重排计划或执行 DONE 打标；双方继续遵守共同的 AGENTS 安全边界。

## 一、严格区分发送状态与工程状态

任务的 **流程状态**（只能有一个）：

| 状态 | 含义 |
|---|---|
| `PLANNED` | 计划已登记，尚未发送给用户执行 |
| `SENT` | 本轮已把任务书发送给用户，等待执行/报告 |
| `IN PROGRESS` | 有可信实施证据（分支、PR、进展），但尚未验收完成 |
| `BLOCKED` | 需要权限、上游能力或决策，暂停 |
| `DONE` | 用户报告与可核实的验收证据表明任务达到自身范围的完成门禁；**不等于 PR 已合并** |

另设独立 **Git 状态**（可同时显示）：`NOT_REQUIRED` / `NO_PR` / `LOCAL_ONLY` / `PR_OPEN` / `MERGED`。研究或验证任务 DONE 可以仍为 PR_OPEN；PR MERGED 也不代表生产 INTEGRATED。

平台/功能验收等级 `MOCK`、`OFFLINE`、`INTEGRATED`、`VERIFIED` 不应混为上述任务状态。

## 稳定 ID 对照：不要把阶段编号、任务编号与 PR 编号混用

- 原项目的 `TTS-A / TTS-A-H / Phase 4B-2B-2a / Phase 4B-2B-2b` 等是**技术阶段名**，必须沿用原来的定义；`Plan 01–14` 只是上一段 GPT 建立的**派发序号**；`PR #16/#17/#18` 是 GitHub 的 PR 编号。
- 上一段 GPT 的 Plan 01=GUI 测试收尾、Plan 02=TTS-A/TTS-A-H 复核、Plan 03=PR #16 审查并在用户授权后合并，之后 Plan 04=WeChatAgent 扩展审计。今后这四个稳定任务 ID 不再因子步骤拆分或追加修复而整体重编号。
- 此前把 Plan 03 临时改写为纯“合并前文档同步”导致范围误解；已更正为 **原 Plan 03 总任务，03-A 合并前检查（SENT），03-B 授权后合并（尚未授权/未派发）**。不能用完成 03-A 替代 03-B。
- PR #17 / #18 的 14 项规划经 H0 对照为同序语义对应，主要文件名及部分历史状态不同；#17 为唯一权威计划入口，#18 保留历史来源，不发两套任务。
## 二、当前推荐发送顺序

**2026-10-25 最新记录：** 01 SENT、02 DONE、03-A SENT／03-B 待授权（Plan 03 原任务仍是授权后合并，不改编号）。下表其余计划仍受安全与先决条件约束。

| 顺序 | 计划书 | 流程 | Git / 事实 | 前置 |
|---:|---|---|---|---|
| 01 | [GUI 自动化测试收尾](01-gui-coverage-closeout.md) | **SENT** | 旧本地 test 分支/Commit 506fe3b 待再次核实；尚无对应远端 PR | 真实八页 GUI 已 INTEGRATED |
| 02 | [TTS-A / TTS-A-H 终审和 F01–F05 契约修复](02-tts-a-complete-review.md) | **DONE（2026-10-25）** | [PR #16](https://github.com/qianqiucn/dsh-whale-voice/pull/16) OPEN @ `3ad32bc`；CI `40163881122` SUCCESS；F01–F05 修复、N01–N05 新测试；Node 197/196 pass/1 skip（DS 报告） | 设计/隔离任务完成，不等于 PR MERGED 或 Provider INTEGRATED；不再重复执行 |
| 03 | [PR #16 正式审查及授权后合并（03-A/03-B）](03-merge-tts-a-pr16.md) | **03-A SENT；03-B 待用户合并授权** | `3ad32bc` / CI `40163881122` SUCCESS；03-A 只读审查与状态文档；03-B 尚未派发；**PR 仍 OPEN** | 02 DONE；合并及合并后 main 验证必须用户单独授权 |
| 04 | [WeChatAgent 扩展机制审计](04-wechatagent-extensions-audit.md) | PLANNED | 无新增 PR | 03，亦可独立只读研究 |
| 05 | [Unified Core-A：TTS/SVC/Whale Relay 职责](05-unified-core-a.md) | PLANNED | 无新增 PR | 03–04 的契约 |
| 06 | [Provider Core-B：引擎注册与调度](06-provider-core-b.md) | PLANNED | 无新增 PR | 05 |
| 07 | [SVC-A：Seed-VC / RVC 研究](07-svc-a-seed-vc-rvc-audit.md) | PLANNED | 无新增 PR | 05；独立研究可并行 |
| 08 | [Shared Core-C：音色库/音频/任务](08-shared-core-c-voice-audio-tasks.md) | PLANNED | 无新增 PR | 05–07 |
| 09 | [Phase 4B-2B-2b：多引擎配置 UX](09-phase4b2b2b-config-ux.md) | PLANNED | 无新增 PR | 06、08；生产写入另行授权 |
| 10 | [TTS-C：本地 Provider](10-tts-c-local-providers.md) | PLANNED | 无新增 PR | 06、08–09 |
| 11 | [TTS-D：云端与自定义 API](11-tts-d-cloud-custom-api.md) | PLANNED | 无新增 PR | 06、08–09；收费调用另行授权 |
| 12 | [SVC-B：AI 唱歌及 WeChatAgent 扩展入口](12-svc-b-singing-wechatagent.md) | PLANNED | 无新增 PR | 04、07–08 |
| 13 | [Whale Relay-A/B/C：统一投递与安全](13-whale-relay-a-b-c.md) | PLANNED | 无新增 PR | 05、08；**Relay-A 契约审计可提早与 06 并行** |
| 14 | [安装器、轻量部署、发布验收](14-onboarding-release-quality.md) | PLANNED | 无新增 PR | 主要模块达到足够集成级别 |

顺序是下一份**发送建议**，不是必须把研究、契约、安全工作全部串行阻塞。每轮只发送一份待执行任务书；未来新增创意后先评估依赖、安全和代价，再重排此表并在变更记录中写清原因。

## 三、已经完成的事实（不要重复开计划）

- Phase 4B-2B-2a 已在真实 DSH Host + 八个导航页完成 `INTEGRATED` 验收，**不是 `VERIFIED`**。
- 八页包含情绪系统和任务与日志；组件管理是另验的弹层，不是第九个导航页。
- 情绪/任务互动的额外 2 项 Playwright 检查在本地测试分支曾显示 26/26 通过，但尚需纳入远端 Git CI（Plan 01）。
- `main@bf9cf66` 已合并 PR #15；运行已加载只读 Capability Schema v3；仍没有生产配置写入路由。
- PR #16 的 TTS-A / TTS-A-H 已经在 `3ad32bc` 关闭 F01–F05 纯契约安全缺口并补 N01–N05 测试，CI `40163881122` SUCCESS；**Plan 02 = DONE**，PR 仍 OPEN，功能仍为 `DESIGN / OFFLINE`。最新 DeepSeek 报告 Node 197（196 pass/1 skip）、UI 24/24，ChatGPT 未在本地重跑。**Plan 03 的 03-A = SENT**，只允许合并前审查和当前/历史状态文档同步；**03-B 尚未派发且待用户明确合并授权**，禁止重复 F01–F05 开发。
- Voice Sender 的 UI Automation 路径已有外部组件；Native Hook 的代码/社区复现仍为研究候选，不能声称已正式集成。
- WeChatAgent 为必需依赖，不自动安装/升级、不替换为自行实现的微信机器人。

## 四、持续协作规则

1. **用户说“下一份”**：读取本索引和最新 Git/PR，检查最早未完成且依赖满足的计划；更新状态为 `SENT`（若尚未发），记录发送日期，提交到同一追踪 PR/后续计划 PR；**在同一条回复中只发送这一份**。
2. **用户提出新想法**：判断范围是功能/架构/研究/安全还是已存在计划补丁。更新对应计划书和本索引；必要时新增独立计划，重编号或设依赖，记录变更；每次变更说明影响，不默默修改已完成事实。
3. **用户提交进度、测试或完成报告**：基于报告、Git/CI、源码复查，满足全部 DoD 才标 `DONE`；否则保持 `REVIEW_REQUIRED`，独立保留 PR 状态。**本条回复必须自动包含一份完整、可复制给 DeepSeek 的 Level 2 执行计划书**：验收不通过先修当前 PR，已通过才发下一项，证据不足/权限阻塞发只读验证或安全准备任务；无需用户再请求“下一份”。裸文件链接或计划名称不算派发。
4. **严格任务去重**：每份报告发完整计划书前，先按任务 ID、实际交付目标/DoD、工程 PR/HEAD 判定是否同一任务。重复报告没有新证据时只发**原计划的完整续行版**（相同 ID、PR，已完成部分不得重做），不新增任务、不重复标 SENT、不造空 Commit；已有新缺口时仅对原任务更新版本和差异，再安排最小修复/复验；全部 DoD 通过才发新任务。重复的另一套 #18 规划已由 H0 对齐，#17 仍是唯一权威入口，不重做 H0。
5. **仓库落地**：每次用户要求发送、变更或标记，必须在该次会话内实际调用 GitHub 工具更新文件，并返回 commit / PR 链接；不能声称异步更新、自动监听所有聊天或平台后台。
6. **写入分支**：默认用独立 docs 分支与 PR，不直接写 `main`；依赖旧分支时先核对 base/冲突。用户可以批准合并，但默认不自行合并。
7. **历史**：每次重要重排、完成与依赖变化记录到 [CHANGELOG.md](CHANGELOG.md)，写明日期、旧状态、新状态、证据与理由；避免把“已发送”写成“已完成”。
8. **越界门禁**：生产配置写入、服务重启、付费 API、真实微信消息、Hook/DLL 执行、Force Push、删除分支、公开仓库、Release 等操作需单独明确授权。

## 五、对自动更新的实际限制

本计划登记 **不是后台机器人**，不能在用户离线时自行编辑。只有用户在聊天中提出下一份计划、修改需求或送来完成报告并且 GitHub 连接可用时，我才能实时更新；如连接失败则明确说明，不能假装已经写入。

**首份已发送：** 2026-10-25，Plan 01。后续尚未发送用户执行的计划即使已经建档，也仍为 PLANNED（Plan 02 例外：已存在 PR，状态 IN PROGRESS）。