# 03 · TTS-A / PR #16 合并与新基线

**状态：PLANNED；需要用户单独明确合并授权。**

## 前置条件

02 补充通过审查，现有 GUI 测试收尾已有明确处理方案，PR #16 最新 head/CI/mergeable 可核实，用户就该 PR 明确授权。

## 执行

1. 重新读 main、PR head/base/review/CI，不用固定旧 SHA 代替实时检查。
2. 复核 Provider-neutral 契约、候选尚未实现、`qwen-local` 兼容、SVC/Relay 边界、许可证、凭据安全。
3. 核对本地 build/Node/UI/文档与隐私扫描；确认不出现生产发送或写入路由。
4. 使用 Merge Commit 合并（不 rebase/force push），检查 main 包含预期 head，main CI 成功。
5. 更新交接状态，记录 merge SHA 和后续 Unified Core 的契约依据。

## 禁止

不删分支/Tag/Worktree，不安装或运行真实模型，不改 DSH/WeChatAgent/Sender/Worker/微信配置，不自动进入 04。
