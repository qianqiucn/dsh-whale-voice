# Whale Voice · 执行计划总表（含 Whale Relay · 鲸递）

> **本文件是未来计划执行与回报的权威登记表，不代表生产代码功能已经实现。** 当前 Git/PR/CI、源码与真实验收记录优先于本摘要。  
> **建立日期：2026-10-25；初始仓库基线：main@bf9cf66807e12d0b25872a0fa3869962dde04818。**
>
> 当前产品方向：一个 Whale Voice Core（TTS、SVC、音色库、音频/任务），一个 Whale Relay Core（鲸递：UI Automation 和未来可选 Native Hook 的统一投递执行层），WeChatAgent 作为必需微信接入、账号/会话/授权平台。**两 Core 不得各自独立投递同一任务，唯一 taskId 和 deliveryId 属于 Whale Voice Core。**

## 0. AI 协作职责与执行标准范围

本项目由两位 AI 分工协作：

- **DeepSeek：主要代码开发者。** 根据用户已发送并授权的任务书实施代码、测试、技术评审和常规工程 Git/PR；遵守 [AGENTS.md](../../AGENTS.md) 的质量、安全与权限规则。**不需要执行本计划索引的调度、重排、SENT/DONE 打标和更新记录流程。**
- **ChatGPT：计划书与 GitHub 计划协调者。** 负责发送下一份、整合新想法、修改开发顺序、记录 GitHub 计划状态、核验完成报告并标记 DONE；不代替 DeepSeek 的日常代码实现。

**[EXECUTION_STANDARD.md](../../EXECUTION_STANDARD.md) 只对 ChatGPT 的计划/GitHub 协调任务强制适用。** DeepSeek 可以正常 Push 代码和创建工程 PR；无需每次访问 GitHub 都阅读计划执行标准。两个 AI 都须遵守 AGENTS 的通用安全与明确授权边界。

ChatGPT 的计划记录只在当前用户对话且 GitHub 工具可用时更新，不是离线自动监控。

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

## 二、当前推荐发送顺序

| 顺序 | 计划书 | 流程 | Git / 事实 | 前置 |
|---:|---|---|---|---|
| 01 | [GUI 自动化测试收尾](01-gui-coverage-closeout.md) | **SENT** | 旧本地 test 分支/Commit 506fe3b 待再次核实；尚无对应远端 PR | 真实八页 GUI 已 INTEGRATED |
| 02 | [TTS-A 多引擎架构补充及 PR #16 复审](02-tts-a-complete-review.md) | **IN PROGRESS** | [PR #16](https://github.com/qianqiucn/dsh-whale-voice/pull/16) OPEN · `c851be7` · CI SUCCESS；设计初版已交付，待补 IndexTTS/Gemini/OpenAI 及 Whale Relay/SVC 契约 | 01 可独立收尾；02 现有 PR 继续补充 |
| 03 | [PR #16 合并与新基线](03-merge-tts-a-pr16.md) | PLANNED | 等待复审；明确合并授权 | 02 |
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
- PR #16 的 TTS-A 初版已经完成纯契约与隔离审计，设计等级为 `DESIGN / OFFLINE`（GitHub CI `40157763811` SUCCESS）；计划 02 因还需要补入 IndexTTS、Gemini、OpenAI、Whale Relay/SVC 边界，继续 `IN PROGRESS`。不能重新创建重复的 TTS-A 启动任务或宣称生产 TTS 已集成。
- Voice Sender 的 UI Automation 路径已有外部组件；Native Hook 的代码/社区复现仍为研究候选，不能声称已正式集成。
- WeChatAgent 为必需依赖，不自动安装/升级、不替换为自行实现的微信机器人。

## 四、持续协作规则

1. **用户说“下一份”**：读取本索引和最新 Git/PR，检查最早未完成且依赖满足的计划；更新状态为 `SENT`（若尚未发），记录发送日期，提交到同一追踪 PR/后续计划 PR；**在同一条回复中只发送这一份**。
2. **用户提出新想法**：判断范围是功能/架构/研究/安全还是已存在计划补丁。更新对应计划书和本索引；必要时新增独立计划，重编号或设依赖，记录变更；每次变更说明影响，不默默修改已完成事实。
3. **用户提交完成报告**：基于报告和可访问的 Git/CI、测试、源码复查。满足当前任务验收条件才标 `DONE`，单独记录 Git PR `MERGED/PR_OPEN`；无法核实时标注 `REVIEW_REQUIRED` 在备注中，不假装完成。
4. **重复修复**：小范围安全修复优先归入当前计划或原 PR，而不是不断新增阶段名。
5. **仓库落地**：每次用户要求发送、变更或标记，必须在该次会话内实际调用 GitHub 工具更新文件，并返回 commit / PR 链接；不能声称异步更新、自动监听所有聊天或平台后台。
6. **写入分支**：默认用独立 docs 分支与 PR，不直接写 `main`；依赖旧分支时先核对 base/冲突。用户可以批准合并，但默认不自行合并。
7. **历史**：每次重要重排、完成与依赖变化记录到 [CHANGELOG.md](CHANGELOG.md)，写明日期、旧状态、新状态、证据与理由；避免把“已发送”写成“已完成”。
8. **越界门禁**：生产配置写入、服务重启、付费 API、真实微信消息、Hook/DLL 执行、Force Push、删除分支、公开仓库、Release 等操作需单独明确授权。

## 五、对自动更新的实际限制

本计划登记 **不是后台机器人**，不能在用户离线时自行编辑。只有用户在聊天中提出下一份计划、修改需求或送来完成报告并且 GitHub 连接可用时，我才能实时更新；如连接失败则明确说明，不能假装已经写入。

**首份已发送：** 2026-10-25，Plan 01。后续尚未发送用户执行的计划即使已经建档，也仍为 PLANNED（Plan 02 例外：已存在 PR，状态 IN PROGRESS）。
