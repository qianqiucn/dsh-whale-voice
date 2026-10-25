# Handoff Plan H0 · 新一位 ChatGPT 的首个执行计划

> **任务负责人：ChatGPT，非 DeepSeek。** 本任务是**计划仓库整理/验收/优先级协调**，不包含运行代码开发、生产配置变更或微信发送。  
> **计划状态：H0 文档比对与整理已完成（2026-10-25）；PR 合并/关闭待用户决定。**
> **先读结果：** [H0_PLAN_RECONCILIATION.md](H0_PLAN_RECONCILIATION.md)。下文保留原 H0 验收步骤作历史依据，不要重复执行已完成的 14 对整理。下一轮按用户请求处理 Plan 02 终审或 Plan 01 报告；本轮未派发新工程任务。  
> **目标成果：** 消除计划管理 PR #17 与 #18 的重复和事实冲突，保持**唯一权威计划入口**；安全更新下一轮执行顺序；最终向用户汇报需单独授权的合并决策。  
> **不是合并授权：** 本计划绝不允许自行合并、关闭、删除或强推 PR #16/#17/#18。

## 1. 为什么要先做这件事

当前仓库有 3 个开放 PR：

| PR | 目的 | 基线/历史证据 | 目前 |
|---|---|---|---|
| [#16](https://github.com/qianqiucn/dsh-whale-voice/pull/16) | TTS-A/TTS-A-H Provider-neutral、SVC/Whale Relay 契约 | head `1fd2cca`，CI `40160267636` SUCCESS | 设计完成待终审，不是生产接入 |
| [#17](https://github.com/qianqiucn/dsh-whale-voice/pull/17) | ChatGPT 专属执行标准、长期记忆、14 计划和状态、交接 | 分支 `docs/whale-voice-execution-plan-registry`，CI 交接前 `40160989897` SUCCESS | 本次交接所在 PR，尚未合并 |
| [#18](https://github.com/qianqiucn/dsh-whale-voice/pull/18) | 另一套 14 任务书、TASK_STATUS 台账 | head `42cec57`，CI `40159114676` SUCCESS | 未合并，和 #17 重叠 |

当前三个 PR 自己相对 main 的 `mergeable:true` 并不能保证 **#17→#18 或 #18→#17** 顺序合并没有文档冲突。PR #18 的 TTS-A 快照较旧，PR #17 包含更新后的 Level 2 标准与更准确的 Plan 02。**不能直接两份计划一起合并，形成两套相互竞争的状态台账。**

## 2. 事实核验顺序：本任务必须先读

1. [EXECUTION_STANDARD.md](../../EXECUTION_STANDARD.md)。
2. [AGENTS.md](../../AGENTS.md)。
3. [CHATGPT_LONG_TERM_MEMORY.md](CHATGPT_LONG_TERM_MEMORY.md)。
4. [TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md)、[TASK_SPEC_TEMPLATE.md](TASK_SPEC_TEMPLATE.md)。
5. [NEXT_CHATGPT_HANDOFF.md](NEXT_CHATGPT_HANDOFF.md)。
6. [本计划索引](README.md)、[CHANGELOG.md](CHANGELOG.md)、[Plan 01](01-gui-coverage-closeout.md) 和 [Plan 02](02-tts-a-complete-review.md)。
7. PR #17、PR #18 的实际 changed filenames + Diff，特别是双方的 `AGENTS.md`、`docs/README.md`、`docs/plans/README.md`，以及 #18 的 `TASK_STATUS.md`。
8. PR #16 最新文件、head/CI/状态；main HEAD 与项目旧 `AI_CONTEXT` 需要分开识别。

不要把历史 SHA 当作当前 HEAD；如其中某 PR 已合并/关闭，本计划需要按新事实缩小范围，而不是重新打开或复写。

## 3. 实施方案：只选一套权威计划体系

**推荐方案：以 PR #17 为主，选择性吸收 PR #18 的有价值内容，而不是制造第三套 14 任务书。**

### 3.1 固定单一权威路径

| 内容 | 唯一建议路径 | 处理方式 |
|---|---|---|
| GitHub 计划执行标准 | `EXECUTION_STANDARD.md` | 保留 ChatGPT-only 限制 |
| 开发通用工程边界 | `AGENTS.md` | DeepSeek 执行代码，ChatGPT 负责计划 |
| 长期用户需求与稳定架构 | `docs/plans/CHATGPT_LONG_TERM_MEMORY.md` | 用户“详细任务书、DS 只需执行”不得丢 |
| 完整任务详细度门禁 | `docs/plans/TASK_SPEC_STANDARD.md` | Level 2 EXECUTION-READY |
| 新会话交接 | `docs/plans/NEXT_CHATGPT_HANDOFF.md` | 每次重要里程碑刷新最新事实 |
| 新会话首要行动 | `docs/plans/NEXT_CHATGPT_ACTION_PLAN.md` | 下一轮工作/边界 |
| 唯一计划索引与当前任务状态 | `docs/plans/README.md` | 不再维持两张互相矛盾的当前状态表 |
| 历史演变日志 | `docs/plans/CHANGELOG.md` | 事件追加，不覆盖旧历史 |
| 01–14 的唯一任务正文 | PR #17 现有 01–14 文件 | 每次派发前升级为 Level 2；允许吸收 #18 更具体的内容 |

**PR #18 的 `TASK_STATUS.md`：** 对照 #17 的索引状态，若提供了独特的完成证据可吸收到现有索引/CHANGELOG；不建议作为第二份“当前权威”，除非用户明确改变这一决策。为了保留来源，可以在变更日志写明其历史价值与 PR 链接；不要未经授权直接删除 #18 或改动它的历史。

### 3.2 比对 14 对任务内容，避免实质信息丢失

按编号 01–14 建立对应表（PR #17 / PR #18 两份文件名不同），重点比较：

1. 任务范围、前置依赖、技术默认方案；
2. 具体模块路径与入口、接口契约、异常状态；
3. 正向/负向测试、权限边界、完成 DoD；
4. PR #18 中更细的实施说明（若确有）是否可并入 PR #17；
5. 有无错误地将历史 `SENT`/本地测试/旧 PR #16 HEAD 标为 `DONE`。

选取真实、可证且不违反当前产品方向的补充并入 PR #17 的相应计划；不可自动把全部 PR #18 文档复制一份进仓库，也不应删除唯一历史证据。

### 3.3 先保护正在进行的任务

- **Plan 01**：保持 `SENT`。用户已有任务书；只因本地历史 commit `506fe3b` 报告通过不能直接标 `DONE`。需要核验真实测试分支 Push/PR、CI 26/26 与变更范围。
- **Plan 02**：保持 `IN PROGRESS / REVIEW_REQUIRED`。PR #16 最新已提交 IndexTTS、Gemini、OpenAI、Seed-VC/RVC、Whale Relay 文档；不可重复开发；按 Plan 02 T01–T10 终审并核实最新 HEAD 的 CI 之后才能标 DONE。
- **Plan 03**：待 Plan 02 通过后提出 PR #16 合并申请；不自行合并。
- **Phase 4B-2B-2a**：`INTEGRATED / NOT VERIFIED`，来源是真实 DSH Host 和全部八页验收；不要因 main 的旧 AI_CONTEXT/PROJECT_STATUS 仍写 OFFLINE 而降低已报告的等级，也不能伪造真实异常注入。

## 4. 可接受的 Git 操作

**允许：** 只读审查、比对 Diff、编辑/提交 PR #17 分支的计划与交接文件、必要时正常 Push，更新 PR 描述，核验最新 CI。独立 PR 的代码实现由 DeepSeek 承担。

**禁止：** 自动 Merge #16/#17/#18，直接写 main，Force Push，删除/关闭 PR #18，删分支/Tag/Worktree，动真实 DSH、WeChatAgent、Bridge、Worker、Voice Sender、Qwen、微信、Hook/DLL、音频设备或生产配置，触发付费云端 TTS。

如果 PR #17 在新会话时已合并：停止向旧分支继续写，改从最新 main 新开**单一状态/计划维护分支**，避免混乱。  
如果 PR #18 先合并：以合并后的 main 为基线进行一次结构比较，保留 ChatGPT 专用执行标准/记忆文档，报告与 PR #17 的潜在冲突，不把旧基线强行覆盖新 main。

## 5. 步骤清单（按顺序执行，每步可判定）

1. **确认 GitHub 连接与仓库：** 读取 private repo 上 `AGENTS.md`、PR #16/#17/#18 元数据；如无访问权限，明确汇报并停止“已更新”表述。
2. **核验 main 最新 HEAD 和所有相关 PR：** 不再使用历史 SHA 直接声称最新；记录 head/base/CI/mergeable/审查状态。
3. **核对执行标准与长期记忆：** 完整读取，不漏掉“DeepSeek 无须维护计划”和“用户要最大程度细化”。
4. **检查 PR #17 与 #18 重叠文件的实际内容与 Diff：** 先列对照矩阵，明确权威文件选型和仍需吸收的内容。
5. **只对查出的具体缺口修改 PR #17：** 最小增量吸收 PR #18 有价值任务步骤、修正任务索引与历史记录；如内容本来已完整，**不造空 Commit**。
6. **一致性核验：** 计划 01 SENT、计划 02 REVIEW_REQUIRED、PR #16 DESIGN/OFFLINE、2B-2a INTEGRATED、WeChatAgent 必需依赖、Whale Relay Hook 研究态不得变。
7. **文档质量检查：** UTF-8、Markdown 链接、Diff 范围/敏感字段（Token、私人聊天、音频、绝对本机路径）。如可运行 Node/UI/CI 则记录真实结果，不冒充未执行的测试。
8. **GitHub 结果：** 正常 commit/push 到计划 PR（若有改动），更新 PR 描述、核验新 HEAD CI；没有修改则只提交对比与结论。
9. **交付汇报：** 向用户给出建议的唯一计划体系、PR #17/#18 差异/处理、已通过的测试和需单独授权的合并步骤；无授权不得合并。
10. **根据用户下一条消息再行动：** 用户要“下一份”才派发一份 Level 2 任务；用户给完成报告才核验 DONE；新想法当轮写库。

## 6. 必须明确处理的异常分支

| 发现 | 处理 |
|---|---|
| PR #17 已与 #18 有先后合并导致冲突 | 不 Force Push；核对 main 并记录冲突文件，按最新 main 新建独立计划维护分支 |
| PR #18 已包含某任务的更详实测试细节 | 仅在不破坏安全前提下合并其内容到 PR #17 现有唯一编号任务书 |
| 同一任务两份文件事实矛盾 | 以当次代码/Git/CI 为准，保留历史证据但只留下一个当前结论 |
| PR #16 已提前合并 | 先重新核实测试、合并方式与主干状态，更新计划 02/03，而非让 DeepSeek 重做 |
| GUI Plan 01 找不到本地分支 | 保留 SENT，按用户已批准的测试范围恢复实现；本任务只汇报，不直接代 DeepSeek 开发 |
| 用户未授权合并 | 不合并，提供需要单独确认的建议 |
| GitHub 连接或 PR 写入失败 | 直接说明未保存，不能发明 SHA/PR/CI |
| GitHub CI 仍运行中或失败 | 报告 queued/in_progress/failure，不把旧 head SUCCESS 套用新 head |

## 7. 验收 DoD

- [ ] GitHub 新会话读取入口/长期记忆/两个 AI 分工已重新核实；
- [ ] PR #16/#17/#18 最新状态和 CI 正确记录；
- [ ] 计划索引、变更历史及两套 14 任务的重叠风险被识别并明确处理建议；
- [ ] 没有重复派发 TTS-A 已完成的编码项；
- [ ] Plan 01、Plan 02 状态没被无证据改为 DONE；
- [ ] 没有生产写入、微信发送、模型运行、服务重启或未授权合并；
- [ ] 若有修改，提供 Git Commit、PR、CI；若无修改，说明原因；
- [ ] 交付用户可决定的下一步，而不是假装已合并。

## 8. 新 ChatGPT 最终报告格式

1. 本次读取的规范和 main/PR 最新事实。
2. PR #17/#18 差异和权威文件建议。
3. 已保存的变更文件、Commit/PR 或“未产生提交”。
4. 文档检查及 GitHub CI。
5. Plan 01/02 与功能级别状态是否有证据改变。
6. 当前用户还需要单独授权的操作。
7. 下一份建议任务的**名称**；除非用户明确要求“下一份”，不提前发送一整份 DeepSeek 任务书。

**执行完 H0 后停止，不自动开始下一阶段。**
