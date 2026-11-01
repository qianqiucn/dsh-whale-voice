# Whale Voice · 执行总计划与任务书目录

> 计划版本：2026-10-25 v1。此目录是**待办规划与派发记录**，不是代码真实验收或生产运行状态的权威来源。发生冲突时优先查看代码、Git/PR/CI、`docs/PROJECT_STATUS.md`、`docs/DECISIONS.md` 与实际运行证据。
>
> 产品定位：**Whale Voice Core** 统一 TTS/SVC、音色、音频与全局任务；**Whale Relay Core（鲸递）** 统一按键模拟、未来经验证的 Native Hook 等投递后端；**WeChatAgent** 是必需的微信接入和会话授权平台依赖。

## 现有基线（入库时）

- `main = bf9cf66807e12d0b25872a0fa3869962dde04818`（入库时核实；以后以实时 Git 为准）
- #15 merged；Phase 4B-2B-2a **INTEGRATED / 非 VERIFIED**：真实 Host 和全部八个导航页面+组件弹层通过人工只读验收；真实异常注入、Console/Network 仍未验证。尚未在现有项目状态文档同步。
- GUI 补充 Playwright 两项测试只在本地分支 `test/phase4b2b2a-gui-coverage` / `506fe3b` 报告；**没有证据表明已 push/merge**。
- #16 `feat(tts): Phase TTS-A provider-neutral audit and contracts` **OPEN**，HEAD `c851be7cc6a76aeff3069cb3924d0edc19ce5dee`（入库时核实）。
- WeChatAgent 0.3.9 为当前已审计本地基线；不假定 0.4.0/Hook 方案可直接运行。
- Voice Sender 现有 UI Automation 继续保留；Hook/SILK 原生语音是**研究候选**，不是稳定已实现。
- **此次计划入库仅创建文档分支/PR，不更改生产配置，不重启服务、不发送微信、不合并 PR。**

## 派发顺序（一次只发送一份，按最新依赖重新核验）

| 序号 | 文件 | 简称 | 初始状态 |
|---|---|---|---|
| 01 | [01-gui-test-coverage.md](01-gui-test-coverage.md) | 情绪/活动 GUI 测试收尾 | SENT · NOT VERIFIED DONE |
| 02 | [02-tts-a-pr16-review.md](02-tts-a-pr16-review.md) | TTS-A 多引擎 PR #16 增补 | PLANNED |
| 03 | [03-merge-pr16.md](03-merge-pr16.md) | 审查、授权后合并 #16 | PLANNED |
| 04 | [04-wechatagent-extensions.md](04-wechatagent-extensions.md) | WeChatAgent 扩展/授权机制审计 | PLANNED |
| 05 | [05-unified-core-architecture.md](05-unified-core-architecture.md) | 统一 TTS/SVC + Whale Relay 边界 | PLANNED |
| 06 | [06-provider-core.md](06-provider-core.md) | Provider 注册与 Fake 调度 | PLANNED |
| 07 | [07-svc-a-research.md](07-svc-a-research.md) | Seed-VC / RVC 审计 | PLANNED |
| 08 | [08-shared-audio-voice-task.md](08-shared-audio-voice-task.md) | 音色、音频、队列、Relay 投递契约 | PLANNED |
| 09 | [09-config-ui-4b2b2b.md](09-config-ui-4b2b2b.md) | 4B-2B-2b 配置草稿与冲突 UX | PLANNED |
| 10 | [10-local-tts.md](10-local-tts.md) | 本地 TTS 引擎接入 | PLANNED |
| 11 | [11-cloud-custom-tts.md](11-cloud-custom-tts.md) | 云端/自定义 TTS 接入 | PLANNED |
| 12 | [12-svc-b-singing.md](12-svc-b-singing.md) | 唱歌流水线与扩展入口 | PLANNED |
| 13 | [13-whale-relay.md](13-whale-relay.md) | 鲸递 Core + UI 模拟 + Native Hook 研究 | PLANNED |
| 14 | [14-install-release.md](14-install-release.md) | 安装器、隐私、发布验收 | PLANNED |

详细当前任务状态见 [TASK_STATUS.md](TASK_STATUS.md)。**序号代表推荐派发顺序，不是自动启动授权。** 阶段内部可拆分新 PR；进度动态变化时，先改目录与状态再发下一份。

## 每次交互中的 Git 协作协议

1. **发送下一份**：核对 Git/PR/CI 后，在本次交互中更新 `TASK_STATUS.md` 的 `SENT`、发送日期与对应文件，正常 commit/push，给用户本份任务书。每次只派发一份新任务书。
2. **新想法**：在当前回复中评估依赖、兼容与风险，更新相关计划文件、目录排序与状态，再 commit/push。新增技术不能自动被标记为可用。
3. **完成报告**：核验足够证据（PR/CI/运行验收）；达成该任务验收标准才标记 `DONE`；否则 `REPORTED_DONE_AWAITING_VERIFICATION` / `BLOCKED` / `PARTIAL`。记录证据链接与时间。
4. **每轮操作**：优先在此规划分支或后续获授权的维护分支创建审核用 PR，避免触碰 `main`；规划 PR 合并后以后从最新 `main` 起新分支。
5. **不会后台自动执行**：只有用户继续发消息的当次交互才能更新仓库；不承诺会在聊天之外持续监控。
6. **权限门禁**：一般计划文档编辑、正常提交/推送/创建 PR 已获授权；PR 合并、force push、删分支、配置写入、重启、真微信发送、真实付费 API 调用、第三方 Hook/DLL 安装均需单独明确授权。
7. **分层状态**：任务的 `DONE` 不等于全产品 `INTEGRATED` 或 `VERIFIED`；必须分别记录研究、OFFLINE、INTEGRATED、VERIFIED 的证据。

## 稳定约束

- WeChatAgent 是必需依赖；不私自做第二套微信客户端/账号管理。
- 统一全局任务所有权，Whale Relay 只负责受控投递；不许两个 Core 各自无协调重发。
- Worker `NEVER_WRITE`；Bridge/Worker 双层安全；`UNKNOWN` 不自动重发。
- 真实配置保存 ≠ 运行时生效；没有可信 loaded revision 时不能标记 `APPLIED`。
- Qwen 与 `whale-v1` 不得写成普通用户强制默认依赖；无 GPU 用户可走云端或轻量本地路线。
- Native Hook 只可研究与独立沙箱验证；未授权不能替换现有 UI Automation。
