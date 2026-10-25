# Plan 03 · PR #16 正式审查及多引擎架构基线合并

**任务状态：PLANNED（等待计划 02 通过）**  
**目标：** 经用户单独明确授权后，将已经补充并通过复审的 TTS-A 设计安全纳入 main。

## 合并门禁

1. 核验最新 main、PR #16 的 base/head、实际 Diff、可合并性、评审记录及与 Plan 01 的依赖；不得使用过期 SHA。
2. 确认 IndexTTS、Gemini、OpenAI 等候选、旧 Qwen 配置兼容、TTS/SVC 共用 Core 的设计边界已完善。
3. 确认 Provider Registry 未把研究候选变成生产可选项；未包含音色文件、模型权重、真实 Key、私人路径和不受许可保护的资产。
4. 执行构建、Node、UI、文档、秘密扫描；确认最新 HEAD CI build/ui 成功。
5. 单独取得合并授权后采用 Merge Commit；合并后复核 main 含正确 HEAD、CI 成功、本地工作区干净。
6. 输出最终 Merge Commit、PR/CI 链接、合并后测试基线及下一阶段可复用契约。

## 限制

禁止自动合并、Force Push、历史改写、删除分支、自动启动模型/付费服务、生产配置写入、重启 DSH 或微信发送。TTS-A 合并仍属于架构/隔离契约验收，不代表真实多 Provider 已集成。