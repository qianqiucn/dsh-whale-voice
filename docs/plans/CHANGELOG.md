# Whale Voice · 计划演变记录

此文件只记录任务书与排序变化，不代替 Git commit、测试或项目阶段验收。

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
