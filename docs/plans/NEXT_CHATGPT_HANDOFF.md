# Whale Voice · ChatGPT 新会话交接卡

> **用途：** 用户换新对话时，下一位 ChatGPT 首先读取的最新项目交接文档。它不是新的工程开发任务，也不是生产操作授权。  
> **维护者：** ChatGPT（仅负责计划、排序、记忆、GitHub 计划跟踪和完成审查）。DeepSeek 不承担这份文档的维护。  
> **本次核验：2026-10-25（UTC 以 GitHub 实时记录为准）。** 本文件里的 SHA、CI、状态是有时点的快照，启动新会话必须重新查询。

## Plan 02 已验收完成、Plan 03 已派发（2026-10-25，最新状态）

- **Plan 02 = DONE**：工程 PR #16 HEAD 3ad32bcb22b1a0346eed91f7236afb4f1cc8f773，main/base bf9cf66，OPEN、mergeable、未合并。GitHub Actions run 40163881122 SUCCESS。已经阅读本次 Commit 的五文件代码和负向测试 Diff，F01–F05/N01–N05 纯契约修复符合目标。DeepSeek 报告 Node 197（196 PASS/1 SKIP），UI 24/24；ChatGPT 没有本地运行这些命令。功能始终 DESIGN/OFFLINE。
- **Plan 03 = SENT**：下一份已升级 EXECUTION-READY v2，链接 [03-merge-tts-a-pr16.md](03-merge-tts-a-pr16.md)。仅审查 PR #16 全量 22 文件、同步工程分支 docs/PROJECT_STATUS.md 与 docs/AI_CONTEXT.md 的当前 197/旧 192 验收状态、跑隔离回归、检查最新新 HEAD CI，并输出 READY_FOR_USER_MERGE_DECISION 或 BLOCKED。**未经用户针对 PR #16 的额外明确授权，绝不能合并。**
- Plan 01 = SENT（旧 GUI 测试分支仍待证据），Plan 04–14 = PLANNED；计划体系只有 #17，H0 已完成；#18 Draft 仍不得合并或关闭。继续按“报告 → 查重 → 验收 → 完整下一份任务书 → DSH 对话交接判断”的流程。
- **DSH 对话交接建议：此刻适合换新执行端对话。** Plan 02 已结束，Plan 03 是独立只读/文档合并前门禁。先请旧 DS 保全 git status/未提交工作，再在新对话读取 AGENTS.md、PR #16 实时 HEAD/CI 和完整 Plan 03；换 AI 对话不等于重启任何服务。不能看到 DSH 的真实 token 使用量。
- 此最新块覆盖下方早期 Plan 02 F01–F05 尚需修复、#17 旧 HEAD 和“尚未派发新工程任务”的历史快照。新会话一定重新查询 GitHub 动态状态。
## 用户新交接偏好（2026-10-25）

收到每份 DeepSeek 开发报告时，除验收及立即返回一份完整可复制的下一步执行计划书外，ChatGPT 还须主动判断是否要让 DSH/DeepSeek 执行端换新对话。按继续使用、阶段完成后交接、建议立即交接三档判断，依据报告中的上下文漂移、忘记约束、重复实现、长审计和阶段边界，不能假称直接看到执行端 token。若需要交接，给出包含分支/PR/HEAD/CI、未完成事项、安全边界、未提交工作及唯一下一动作的非敏感 handoff。只换 AI 对话，不重启任何生产服务。权威规则见 [长期记忆](CHATGPT_LONG_TERM_MEMORY.md) §1.1–1.2 和 [执行标准](../../EXECUTION_STANDARD.md) §2.1。

## 新会话 Plan 02 静态审查结果（2026-10-25；尚未终审）

本轮已读取真实 GitHub 计划分支、TTS-A PR #16 核心契约/Registry/测试；没有代替 DeepSeek 修改工程源码。PR #16 head 仍为 `1fd2cca`，该版本 CI `40160267636` SUCCESS。发现 5 项**静态代码审查待复现**问题：Manifest 未知顶层键、TTS 请求隐藏投递字段、SVC 请求额外目标字段被原样回传、Cloud 凭据 UNKNOWN 可能被判 AVAILABLE、TTS 结果 `target` 被静默接受。具体行级核验方向、唯一修复建议和 N01–N05 负向测试已写入 [Plan 02 §2.1](02-tts-a-complete-review.md)，变更登记见 [CHANGELOG](CHANGELOG.md)。这不是新运行过的测试失败结论，不是 Provider 已投入生产。

- **保持** Plan 01 `SENT`，Plan 02 `IN PROGRESS / REVIEW_REQUIRED`，Plan 03 `PLANNED`；不标 Plan 02 DONE，不重复注册 10 TTS + 2 SVC 候选。
- **下一技术闭环**：由 DeepSeek 在现有 #16 分支验证 F01–F05；必要时只修纯契约和测试，给出当前 HEAD 的 Node/UI/CI/安全证据及 T01–T10 报告。ChatGPT 核验后再决定 DONE；合并由用户另行授权。
- H0 已完成，#17 是唯一计划体系；#18 保持 Draft 未合并/关闭。本轮记录仅在 #17，未生产写入、未发送微信、未做真实 API 调用。
- 最近核实的 GitHub：main `bf9cf66`；#17 在计划/日志更改后 HEAD `519370f`，对应 CI run `40163140024` 当时 `in_progress`，**新提交后的 CI 状态需重新读取**，不能当成功。

## 最新接续结果（2026-10-25；优先于下方历史快照）

H0 的 14 对计划/重叠入口/TASK_STATUS 比对和选择性补充已完成，见 [H0_PLAN_RECONCILIATION.md](H0_PLAN_RECONCILIATION.md)。#17 为唯一计划体系；#18 保留历史来源、仍 OPEN/DRAFT，未关闭或合并。Plan 01 SENT、Plan 02 IN PROGRESS / REVIEW_REQUIRED，未派发新任务。

本轮核验 main bf9cf66；#16 1fd2cca CI 40160267636 成功；#18 42cec57 CI 40159114676 成功；#17 整理前 2c4a01a CI 40161821455 成功。新 HEAD 必须重新查询。下面的旧交接保留历史；“先做 H0”已由本结果取代，下一轮依据用户请求继续 Plan 02 终审或 Plan 01 反馈。

## 0. 给下一位 ChatGPT 的最重要提醒

**不要仅凭这个交接文档开始开发、标记 DONE 或合并 PR。先通过 GitHub 工具读取执行标准、长期记忆、最新源码与 Git/PR/CI。** 如果本文件尚未合并 main，使用下文列出的开放计划分支读取；不要误以为 main 已经具备新标准。

用户最重视：
1. **你负责做足规划。** 给 DeepSeek 的任务书要详细到可直接执行：唯一建议方案、精确源码文件、函数/Schema/接口契约、先后步骤、异常决策树、测试矩阵、验收 DoD、Git/CI/报告格式。**减少 DeepSeek 再次决定产品方向的空间**；但不能虚构未知源码、接口或版本。
2. **你和 DeepSeek 分工明确。** DeepSeek 是主要代码执行者，负责写代码、测试、技术 PR 和技术报告。ChatGPT 只负责计划、优先级、技术复审/完成标记与计划相关的 GitHub 协调；DeepSeek 无需替你维护计划状态，也不需要逐次遵守 ChatGPT 专属的计划调度规则。
3. **每次收到“下一份”**，先核对 Git/CI/已实现的代码，选对下一个任务，按 [TASK_SPEC_STANDARD.md](TASK_SPEC_STANDARD.md) 扩写为 `EXECUTION-READY`，更新计划仓库，在一条消息中只发**一份**任务书。不要把 Level 1 的路线草案直接派给 DeepSeek。
4. **每次收到新想法**，在该次会话中整理依赖、更新相关计划、顺序和 [CHANGELOG.md](CHANGELOG.md)，重要的长期偏好写入 [CHATGPT_LONG_TERM_MEMORY.md](CHATGPT_LONG_TERM_MEMORY.md)；提供真实 Commit/PR 链接。
5. **每次收到完成报告**，查 PR 最新 HEAD、代码、CI、逐条 DoD 后才标 `DONE`；`DONE`、`MERGED`、`OFFLINE`、`INTEGRATED`、`VERIFIED` 是不同维度。没有证据就保留 `REVIEW_REQUIRED`，不能猜测。
6. **不能暗中后台工作。** 只在活跃对话并且 GitHub 工具可用时更新；失败必须说明。
7. **所有高风险操作另外授权。** PR 合并、生产配置写入、服务重启、微信发送、未知 Hook/DLL、音频设备变更、付费 API、删除/强推/Release 都不能由文档推导出授权。

## 1. 新会话必须依次读取的文件（从计划分支读取，直到合入 main）

1. [执行标准](../../EXECUTION_STANDARD.md) — ChatGPT 专用 GitHub 计划协作规范。
2. [AGENTS.md](../../AGENTS.md) — 双 AI 分工与共同工程安全边界。
3. [长期记忆](CHATGPT_LONG_TERM_MEMORY.md) — 用户稳定要求与 Whale Voice 架构不变量。
4. [详细任务书标准](TASK_SPEC_STANDARD.md) 与 [任务模板](TASK_SPEC_TEMPLATE.md) — 可执行任务编写门禁。
5. **本交接卡**及 [新会话首要任务书](NEXT_CHATGPT_ACTION_PLAN.md)。
6. [计划总索引](README.md)、[变更日志](CHANGELOG.md) 与正在处理的具体计划。
7. main 上的 [PROJECT_STATUS](../PROJECT_STATUS.md)、[AI_CONTEXT](../AI_CONTEXT.md)、[ROADMAP](../ROADMAP.md)、[DECISIONS](../DECISIONS.md)，以及任务有关的代码与测试。
8. GitHub 事实：main HEAD、PR 列表、各 PR head/base、CI 与 Diff；当前事实永远优于旧记忆快照。

> **特别注意：** main 中旧的 PROJECT_STATUS/AI_CONTEXT 可能仍记载 PR #15 未合并、2B-2a OFFLINE。这是过时文档；已有真实八页 GUI 验收报告标为 INTEGRATED（非 VERIFIED），PR #15 已合并。不要为修一个 SHA 造成无限自引用文档 PR；在合适阶段统一同步即可。

## 2. GitHub 仓库和本轮核实的快照

- 私有仓库：**https://github.com/qianqiucn/dsh-whale-voice**。
- main：`bf9cf66807e12d0b25872a0fa3869962dde04818`（Git compare 与此前基线一致；**必须再次核验**）。
- **[PR #16 · TTS-A](https://github.com/qianqiucn/dsh-whale-voice/pull/16)**：OPEN，head `1fd2ccaed3ee7e1c90c7caee1f22a7458ad1c184`，base main，mergeable true；CI run **40160267636 SUCCESS**。
- **[PR #17 · ChatGPT 计划、记忆、执行标准](https://github.com/qianqiucn/dsh-whale-voice/pull/17)**：OPEN，base main，mergeable true；此交接修改之前的 head `f42f0a6b0820fcc8318b151556d26df4ba5dda99`，CI run **40160989897 SUCCESS**。**交接提交后 PR17 会产生新 HEAD，需要核对最新 CI。**
- **[PR #18 · 另一套 14 份任务书和状态台账](https://github.com/qianqiucn/dsh-whale-voice/pull/18)**：OPEN，head `42cec57ae7018735cb6c65a4ef8b0a1d80473810`，base main，mergeable true；CI run **40159114676 SUCCESS**。

### 必须优先处理的 GitHub 文档重叠

**PR #17 与 PR #18 是基于 main 的两个独立开放计划 PR，不是先后祖先关系。**

- PR #17 分支：`docs/whale-voice-execution-plan-registry`，包括 `EXECUTION_STANDARD.md`、`AGENTS.md`、`docs/plans/CHATGPT_LONG_TERM_MEMORY.md`、`TASK_SPEC_STANDARD.md`、`TASK_SPEC_TEMPLATE.md`、`docs/plans/README.md`、`01–14` 等计划书、CHANGELOG 和本交接。
- PR #18 分支：`docs/whale-roadmap-taskbooks-20261025`，包括另一个 `docs/plans/README.md`、`docs/plans/TASK_STATUS.md`、`01–14`（文件名不同）、`AGENTS.md` 和 `docs/README.md`。
- **共同更改**：`AGENTS.md`、`docs/README.md`、`docs/plans/README.md`；另外两套 01–14 计划在语义上重复但文件名不同。每个 PR 当前 individually mergeable，并不意味着连续合并不冲突。
- PR #18 的任务状态文件仍描述 PR #16 为较早版本，与 PR #16 最新 HEAD 不同。PR #17 的 Plan 02 已基于 `1fd2cca` 修订为**只做最终审查，不重复开发**。
- **建议采用 PR #17 的分工、执行标准、长期记忆及任务详细质量门禁作为规范核心；将 PR #18 有价值的任务内容/状态台账进行逐项对比吸收，再决定如何保留单一权威计划索引。** **不要**未经用户授权合并任一个 PR、删除 PR #18 或强推/改写历史。
- 对如何消除重复的具体操作已写在 [NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md)。

## 3. 当前功能进度（把设计与集成分开）

- Phase 3B / 4A：真实 DSH Host + 只读 Core/配置 `INTEGRATED`，**非 VERIFIED**。
- Phase 4B-1：隔离 Config Store，PR #9 已合并，功能 `OFFLINE`；无生产配置写路由。
- Phase 4B-2A：隔离配置协调协议，PR #12 已合并，`OFFLINE`；无可信跨进程强 CAS、私有恢复存储和真实 apply。
- Phase 4B-2B-1：组件能力审计 `AUDIT COMPLETE / OFFLINE`，PR #14 已合并。
- Phase 4B-2B-2a：Schema v3、Capability GET-only 路由、真实 DSH Host 重启后八个导航页及组件弹层已做只读验收，**INTEGRATED、非 VERIFIED**。PR #15 已合并；Node 基线用户报告 176（175 pass / 1 skip）、24 UI；本地另外两项情绪/任务交互 UI 检查曾报告 26/26，但其测试分支/commit 尚未确认进 main。
- Phase 4B-2B-2b：**NOT STARTED**；生产 Owner API 写入、Sender automation PUT 授权等都未开展。
- TTS-A：PR #16 为 `DESIGN / OFFLINE` 纯契约/研究，**不是可用 Provider**。已核对其 HEAD 含 Qwen、IndexTTS、Gemini、OpenAI 等候选及独立 Seed-VC/RVC SVC 契约；所有候选 `NOT_IMPLEMENTED`、不可选择。后续只需按照 [Plan 02](02-tts-a-complete-review.md) 终审后再决定 DONE，不重复造注册表。
- GUI 情绪预设与任务/日志真实互动仍为演示/Mock；不能误称真实 TTS 情绪控制或真实 Sender 任务历史已打通。
- 真正微信原生 Hook/DLL 语音气泡仍为 `RESEARCH_CANDIDATE`，不是正式稳定交付后端。

## 4. 产品架构不可变原则

```text
DSH UI / WeChatAgent extension (only if supported)
     ↓
Whale Voice Core
  - ONE global Task Manager + Task/Delivery IDs
  - TTS Provider Registry (local/cloud/custom)
  - SVC Provider Registry (Seed-VC/RVC research)
  - Voice Library / Audio Pipeline / resource coordination
     ↓
Whale Relay Core（鲸递）
  - one safe delivery execution for one Delivery ID
  - ui-automation: existing Voice Sender, not rewritten
  - native-hook: research only, disabled pending verification
     ↓
WeChatAgent platform: identity, chat auth, WeChat integration
```

- WeChatAgent 是必需接入平台，不能在 Whale Voice 里重建另一套微信机器人。
- Native Hook 不能绕过 Sender/Worker/WeChatAgent 的许可与目标复验；`UNKNOWN` 外部副作用不得自动重试/切换后端。
- Bridge `voice.enabled` 和 Worker `voice_enabled` 是独立闸门；Worker `NEVER_WRITE`。
- 保存 `SAVED` 绝不等于运行生效 `APPLIED`，无 loaded revision 保持未知/待确认。
- Qwen 是个人当前参考 Provider，`whale-v1` 是个人音色；不能成为公版产品强制默认。支持多款本地、云端和自定义 API TTS；SVC 是不同输入/处理契约。
- 真正文件写入、音频、微信、设备、模型服务和付费 API 需要单项明确授权。

## 5. 计划进度与推荐下一步

**计划编号是计划发送队列，而不是所有已交付里程碑的编号：**

- **Plan 01 GUI 回归测试纳入 CI**：`SENT`，用户此前已收到任务书，未有 GitHub 证据显示对应 2 项测试完成提交/合并；不要擅自标 DONE。可与 PR #16 独立并行。
- **Plan 02 TTS-A / TTS-A-H 终审**：`IN PROGRESS / REVIEW_REQUIRED`；PR #16 @ `1fd2cca` 已提交新增候选及 SVC/Relay 契约，最新 CI 成功。下一步是**审查、验收证据和精确负向测试**，不能再派同样的编码任务。
- **Plan 03**：PR #16 的独立合并门禁；需要用户单独授权。后续 Plan 04–14 依赖条件详见总索引。
- **下一个 ChatGPT 自身要完成的任务**是优先审查/协调开放计划 PR #17 与 #18 的重叠、避免双份执行标准和双份状态索引，然后更新规范化的一份总计划；这是**计划管理任务**，不是要求 DeepSeek 自己整理计划。
- 如用户明确提出新的开发任务而非计划整理，应先尊重用户当前请求，核验当前 PR，选择满足前置的 Level 2 任务，再发送一份。

## 6. 给新会话的固定工作限制

- 先看标准与最新 Git，不要依据此快照执行合并。
- ChatGPT 管计划；DeepSeek 管开发。开发 PR 由 DeepSeek 按用户任务做，不给 DeepSeek 分配计划表维护负担。
- 计划管理默认独立文档 PR；不要直接改 main，不开启 Auto Merge，不创建重复计划 PR。
- 用户发下一份时只给一份，并在当次 GitHub 更新 SENT；新想法当次入库；完成报告核查后才 DONE。
- 对 PR #17 与 #18 重叠须先解决**规范唯一性**和**状态证据新旧差异**；不用为了看起来“统一”而擅自修改工程运行代码。
- 用户可能在不同 ChatGPT 对话/桌面客户端继续，工具连接应重新验证；无法访问私有仓库时应明确说明，不虚构远端 Commit。
- 每轮结果提供具体 Commit / PR / 当前 CI、修改文件、安全影响与待授权项。

## 7. 交接完成定义

这份文档写入 PR #17 只是**为新对话持久保存上下文**，不代表任务 01 或 02 完成，也不代表 PR #16/#17/#18 已合并。下一位 ChatGPT 应先照 [NEXT_CHATGPT_ACTION_PLAN.md](NEXT_CHATGPT_ACTION_PLAN.md) 核对，再决定当前请求的下一步。

**新会话入口短句：** “读取 PR #17 的 `docs/plans/NEXT_CHATGPT_HANDOFF.md` 与 `NEXT_CHATGPT_ACTION_PLAN.md`，先核验最新 GitHub，再按执行标准继续。”
