# Whale Voice · ChatGPT 长期规划记忆

> **文件用途：** 作为 ChatGPT 在后续新会话中恢复「用户长期要求、架构决定、与 DeepSeek 的协作方式、计划编写习惯」的持久记忆入口。**只读本文件还不够**，具体实施必须以最新仓库代码、Git/PR/CI、真实验收和权威契约为准。
>
> **维护者：** ChatGPT（计划与 GitHub 协调角色），不是 DeepSeek 的日常工作任务。
>
> **建立：2026-10-25。** 禁止写入用户凭据、微信身份、私人聊天、联系人、参考音频、桌面截图和生产机器路径。

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
- 用户发完成报告：比对任务中的每一条验收点、PR、测试、CI 和安全承诺。证据满足才标 `DONE`；条件未满足标 `IN PROGRESS` 或 `REVIEW_REQUIRED` 并写清具体差距。
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
