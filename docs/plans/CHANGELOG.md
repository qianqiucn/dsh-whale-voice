# Whale Voice · 计划演变记录

此文件只记录任务书与排序变化，不代替 Git commit、测试或项目阶段验收。

## 2026-10-25 · 初始归档

- 从对话中的 14 份可独立发送的任务书建立 \`docs/plans/01–14\`。
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
