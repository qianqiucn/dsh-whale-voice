# 01 · GUI 自动化测试覆盖收尾

**派发状态：SENT · AWAITING_RESULT。** 已单独发给用户；不能因真实 GUI 验收 PASS 便标记此测试 PR 为 DONE。

**背景**：Phase 4B-2B-2a 已在真实 Electron 八个正式页面及组件管理弹层验收达到 INTEGRATED，尚未 VERIFIED。情绪系统和任务与日志后补充的两项 Playwright 交互检查在本地分支 `test/phase4b2b2a-gui-coverage`、提交 `506fe3b`，尚无 push/PR 证据。

## 任务

1. 核对本地分支、提交与最新 main，避免覆盖任何现存未提交工作。如果不存在，依据可复核验收记录重新编写。
2. 情绪：六预设，`aria-pressed` 切换、说明提示、禁用强度/自动判断、场景空状态、无真实 TTS fetch/XHR 与“已生效”误报。
3. 任务与日志：八个虚构 fixture、搜索筛选、UNKNOWN 弹层、不自动重发、演示刷新不碰真实 Sender 队列、私人数据隔离。
4. 仅提交测试/必要测试辅助文件，继续使用现有 fake `window.__WHALE_SETUP__`；不真实发送微信。
5. 运行 `node build.mjs`、`node --test`、`npm.cmd run test:ui`、文档完整性、`git diff --check`、隐私扫描。
6. 正常 push 和创建独立 PR，核对 CI。需要合并时另行授权。

## 完成门槛

测试 PR 存在、目标分支正确、完整 Diff 可审查、本地和 CI 检查通过、无生产配置/微信/音频副作用。仅创建 PR 不等于合并，报告中记录两种状态。完成后停止。
