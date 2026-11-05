# Plan 01 · Phase 4B-2B-2a GUI 自动化测试收尾

**任务状态：SENT（已发送，待执行/反馈）**  
**基线：** main bf9cf66807e12d0b25872a0fa3869962dde04818（执行时重新核验）  
**阶段验收：** Phase 4B-2B-2a INTEGRATED、非 VERIFIED；正式八页面的真实 GUI 补充验收已完成。  
**范围：** 仅测试，不修改生产运行代码和服务。

## 目的

将「情绪系统」和「任务与日志」此前在本地补充、通过的 2 项 Playwright UI 交互检查纳入 Git 仓库与 CI，形成后续 TTS/SVC/Whale Relay 开发的回归门禁。

## 工作步骤

1. 检查本地分支 \`test/phase4b2b2a-gui-coverage\` 和历史提交 \`506fe3b\` 是否仍存在；若不存在，依据已验收的需求重新实现，绝不猜测或伪造提交。
2. 基于最新 main 核查分支 Diff，只保留必要的 \`tests/ui/run.mjs\` 测试变化，不把桌面截图、生产配置、私人数据和无关代码带入。
3. 情绪系统：验证自然/温柔/开心/害羞/俏皮/难过六预设，选中切换与 \`aria-pressed\`，演示提示，禁用的强度/自动判断、空场景映射；选择演示情绪不得真实请求 TTS、修改参考音频或冒充已生效。
4. 任务与日志：验证演示任务、搜索、状态筛选、UNKNOWN 详情、不可自动重发、演示刷新不调用 Sender 队列、无真实聊天和目标数据。
5. 保持已有 Capability Schema v3、Bridge/Worker 安全分层和 Mock/真实隔离测试；避免重复覆盖。
6. 构建并运行 \`node build.mjs\`、\`node --test\`、\`npm.cmd run test:ui\`、文档完整性、\`git diff --check\`、秘密扫描；确认 CI 的 build/ui 检查通过。
7. 从最新 main 建立独立测试 PR；报告变更文件、测试结果、Commit、PR、CI 状态。

## 验收条件

测试实际在隔离 Playwright 和 GitHub CI 中运行；不依赖生产 DSH；无网络语音调用或微信副作用；原有测试保持通过。

## 安全与完成门禁

禁止生产配置修改、服务重启、Hook/音频设备操作、真实微信发送、Force Push、删除分支/Tag/Worktree。创建 PR 不等于合并；合并需单独授权。收到可核实的完成证据后，在计划索引标记 DONE，并记录 PR/Commit/CI。