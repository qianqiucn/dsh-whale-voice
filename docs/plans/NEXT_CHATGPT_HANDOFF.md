# Whale Voice · ChatGPT 新会话交接卡

> **用途：** 用户换新对话时，下一位 ChatGPT 首先读取的最新项目交接文档。它不是新的工程开发任务，也不是生产操作授权。  
> **维护者：** ChatGPT（仅负责计划、排序、记忆、GitHub 计划跟踪和完成审查）。DeepSeek 不承担这份文档的维护。  
> **本次核验：2026-10-25（UTC 以 GitHub 实时记录为准）。** 本文件里的 SHA、CI、状态是有时点的快照，启动新会话必须重新查询。

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
