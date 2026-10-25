# Whale Voice · 计划派发与完成状态

**更新于：** 2026-10-25。此表追踪“计划任务”而非历史 Phase 全部功能已完成；以证据和最新 Git 为准。

| ID | 状态 | 发给用户 | 证据/说明 |
|---|---|---|---|
| 01 | SENT · AWAITING_RESULT | 2026-10-25 | 已在聊天发送；本地 `506fe3b` 未确认推送，待建立测试 PR |
| 02 | PLANNED · EXISTING_PR | — | TTS-A 已有 PR #16，下一步补充/复审，不重复启动 |
| 03 | PLANNED | — | 只有经审查并单独授权才能合并 #16 |
| 04 | PLANNED | — | WeChatAgent 扩展机制只读研究 |
| 05 | PLANNED | — | Whale Voice Core / Whale Relay Core 边界 |
| 06 | PLANNED | — | Fake Provider 核心 |
| 07 | PLANNED | — | SVC Research |
| 08 | PLANNED | — | 共享音频与投递契约 |
| 09 | PLANNED | — | 4B-2B-2b 离线 UI |
| 10 | PLANNED | — | 本地模型需要单独运行授权 |
| 11 | PLANNED | — | 付费 API 需要单独授权 |
| 12 | PLANNED | — | 真实歌曲/微信发送单独授权 |
| 13 | PLANNED | — | Native Hook 仅研究候选 |
| 14 | PLANNED | — | Release 单独授权 |

## 独立已验证里程碑（不是任务书派发完成标记）

- Phase 3B / 4A：`INTEGRATED`，非 `VERIFIED`（既往真实 Host 验收）。
- Phase 4B-1 / 4B-2A：`OFFLINE`（代码已合并但无生产写入）。
- Phase 4B-2B-1：`AUDIT COMPLETE / OFFLINE`。
- Phase 4B-2B-2a：`INTEGRATED / NOT VERIFIED`，真实重启后 Host/schema-v3-only 显示链与全部八个页面通过只读验收；原始 v3 envelope、真实 Console/Network、异常注入及 780px 实机未验证。该事实来自用户提交的验收报告，当前项目状态文档尚未同步。
- TTS-A / PR #16：已提交待审，不是 DONE。
- Whale Relay：命名与架构方向已确认，开发状态仍 `PLANNED`。

## 记录规则

- `PLANNED`：文件已存在，尚未发出任务。
- `SENT`：已单独向用户发送，不能算做完成。
- `IN_PROGRESS`：有已验证分支/PR 实际开展。
- `REPORTED_DONE_AWAITING_VERIFICATION`：用户或 Agent 提供报告，尚缺验收证据。
- `DONE`：达到该任务明确验收要求，附可核验证据。
- `BLOCKED`：缺授权、上游接口或关键测试。
- `SUPERSEDED`：新设计取代旧任务，需记录原因及继任 ID。

每次有新想法、下一份、完成报告时更新本表及受影响计划；通过新的 commit/PR 提交，不未经许可改 main。
