# Plan 03 · PR #16 正式审查及授权后合并（03-A 已验收；03-B 等待用户授权）

**稳定任务 ID：Plan 03；计划版本：v4，2026-10-25（03-A 实证验收，03-B 权限门禁）。**  
**总任务定义：PR #16 正式审查、取得明确授权后合并、建立新的 main 基线；与上一段 GPT 的 Plan 03 完全同一个任务，不改动 01–14 顺序。**  
**03-A 合并前安全检查与状态文档同步：DONE / READY_FOR_USER_MERGE_DECISION（2026-10-25）。03-B 合并及合并后验证：WAIT_USER_AUTHORIZATION，未派发、不得执行。**  
**执行者：DeepSeek（只负责工程审查、最小状态文档修订和测试）；计划跟踪/DONE：ChatGPT。**  
**工程阶段：PRE-MERGE GATE / OFFLINE。仅准备待审批资料；此版本没有合并许可。**

## 0-A. 最新最终审查记录（2026-10-25；优先于下面 03-A 历史执行正文）

**03-A 状态：DONE。合并门禁结果：READY_FOR_USER_MERGE_DECISION。Plan 03 总任务仍未完成：03-B 未获用户单独授权。**

- 最新 Git：main `bf9cf66807e12d0b25872a0fa3869962dde04818`；工程 PR #16 `OPEN`、mergeable=true、not merged，HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`；PR 总变更 22 files、+2490/-176；Review 0。
- `954a01a` 是在 F01–F05 的代码 HEAD `3ad32bcb22b1a0346eed91f7236afb4f1cc8f773` 之后新增的**唯一一个**文档提交，仅修改 `docs/PROJECT_STATUS.md` 与 `docs/AI_CONTEXT.md`（+63/-28）。两份文档均已新增 197/196 pass/1 skip 和 UI 24/24 的隔离结果快照，并将旧 192/191/1 保留为历史；保持 DESIGN/OFFLINE、不误标 MERGED 或 VERIFIED。
- GitHub Actions run [40165832178](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40165832178) 对 **当前** `954a01a` 的 `build` 与 `ui` 两 Job 都为 SUCCESS。此前代码 HEAD `3ad32bc` 的 run `40163881122` 为 SUCCESS，不能互相替代。
- DeepSeek 的 Plan 03-A 报告宣称 G01–G12 PASS、`node --test` 197（196 pass/1 skip）、UI 24/24、build 217349 bytes、docs/diff/privacy PASS；这些本地值来自执行端报告。ChatGPT 核对了实际 GitHub Commit diff、两份文档内容、PR/HEAD 与 CI Jobs；**没有在 Windows 环境独立执行 Node/Playwright，也没有另做完整本地审计**。
- 10 TTS + 2 SVC 都只是 NOT_IMPLEMENTED 候选，无生产 Provider、Relay/WeChat 真实发送、云端凭据集成或 TTS-B 实现。Plan 01 仍 SENT；Plan 02 DONE；计划 PR #17 OPEN（唯一台账），#18 Draft 历史来源；H0 不重做。
- **后续唯一门禁为用户对 PR #16 当前或另行确认的目标 HEAD 明确授权 03-B。** 本段不含该授权。不因审批前的计划书而给 DS 启动合并权限；不得 Merge、Squash/Rebase、Force Push、删除分支、更新 main 或重启生产。

### 03-B 授权前检查清单（只有用户许可后才可变为实施任务）

1. 用户本人须针对 PR #16 明确表示同意**合并至 main**，说明接受当前没有人工 PR review（0）的情况，或者要求先获得人工 review；当前对话中的验收报告不是合并授权。
2. 获授权后 ChatGPT 先重新核对最新 main、#16 base/head、Diff、mergeability、reviews、最新 HEAD build/ui CI；任一事实改变都须重新评估，不照旧 SHA 盲执行。
3. 用户许可后，ChatGPT 再单独提供 Plan 03-B EXECUTION-READY 的 Merge Commit 与合并后验证细则；DeepSeek 不得根据本 03-A 文档猜测或提前执行。
4. 如果用户拒绝或暂缓，继续保留 #16 OPEN，Plan 03-B `WAIT_USER_AUTHORIZATION`，不产生无意义工作或提交。
## 0. 稳定编号解释与安全分段（优先于本文件其他说明）

- 原 Plan 03 从来不是一个独立的“只改两份文档”任务，它的最终交付目标是 **PR #16 在用户明确授权后安全并入 main，并完成合并后验证**。2026-10-25 为了保证合并安全，将实施内容分为同一 ID 的 03-A 和 03-B；这是**子步骤，不是新增 Plan 04 或替换原 Plan 03**。
- **03-A（本次唯一发送给 DeepSeek 的执行部分）：** 阅读 PR #16 全 Diff、同步两份状态文档、跑隔离测试与最新 HEAD CI、报告 READY_FOR_USER_MERGE_DECISION 或 BLOCKED。以下 §1–12 都专指 03-A。
- **03-B（仅占位，不授权执行）：** 用户未来明确同意合并 PR #16 后，ChatGPT 需重新核实 main/base/HEAD/CI/人工审查/冲突，并另行交付精确的合并执行指令，按用户批准的方式实施和验证 main 基线。当前禁止自动 merge、squash/rebase、删除分支、部署或生产验证。
- **状态不得混淆：** 03-A SENT 不意味着整个 Plan 03 DONE；03-B 未授权不应冒充 DELIVERED/MERGED。Plan 02 的 DONE 只是其纯契约验收，与 Plan 03 Git 合并不同。
- `TTS-A`、`Phase 4B-2B-2b` 是原项目阶段标识，`Plan 01–14` 是规划派发 ID，`PR #16` 是 GitHub 代码审查 ID；不得相互替代或重新编号。
## 1. 本轮唯一目标与交付成果

Plan 02 已 DONE：F01–F05 与 N01–N05 修复已提交，不能重复开发。本轮在现有 PR #16 做最终合并前证据门禁与状态文档同步，输出可供用户决定是否授权合并的审查包。**到“待用户授权”即停止**；任何绿色 CI 或本文档派发都不能解释为许可合并。

预期交付：最新 PR #16 HEAD 上完成两处历史/当前测试计数同步，构建和隔离回归没有退化；22 文件全量 PR Diff 按风险审阅；明确输出“READY_FOR_USER_MERGE_DECISION”或“BLOCKED”，包括证据链接。只有用户未来对具体 PR #16 另行明确批准后，才讨论原 Plan 03 的 Merge Commit 后半段；此任务绝不执行合并。

## 2. 当前已核验基线与不得重做的内容

- 主分支：main @ bf9cf66807e12d0b25872a0fa3869962dde04818。
- 工程 PR：https://github.com/qianqiucn/dsh-whale-voice/pull/16 ，OPEN、mergeable true、未合并；feature/tts-provider-neutral-contract @ 3ad32bcb22b1a0346eed91f7236afb4f1cc8f773。
- 此 HEAD GitHub Actions：run 40163881122 SUCCESS；完整 PR 当前 22 文件 +2452/-173，最新修复 Commit 只改 5 文件。
- DeepSeek Plan 02 报告：Node 197（196 PASS、1 平台 SKIP）、UI 24/24、build 输出 client.js 217349 bytes；这些是报告值，下一版本必须重新跑并记录。
- F01–F05 已复核解决：Manifest/TTS/SVC 顶层白名单、必需 Cloud 凭据不能 unknown→AVAILABLE、合成结果目标字段拒绝；N01–N05 测试存在。
- 10 个 TTS 候选与 2 个 SVC 候选均 NOT_IMPLEMENTED 且不可选；没有真实 Provider/SVC、Relay 投递集成、声音资产/凭据/付费 API/生产写路由；当前状态保持 DESIGN / OFFLINE。
- #17 是唯一 ChatGPT 计划管理分支；#18 是 Draft 历史重复计划来源，H0 已做过。**本次不可修改或合并 #17/#18，不能重做 H0。**
- Plan 01 GUI 补充测试仍 SENT、远端证据待核实；它不是要求重做已通过的 TTS-A 契约测试，也不能冒充 GUI 全局 VERIFIED。

## 3. 阅读顺序和责任边界

依次读取 AGENTS.md、docs/WECHATAGENT_COMPATIBILITY.md、现有 PR #16 全量 Diff、core/tts/provider-contract.mjs、core/tts/provider-config.mjs、core/tts/provider-registry.mjs、core/svc/svc-contract.mjs、core/svc/svc-registry.mjs、test/tts-provider.test.mjs、test/svc-contract.test.mjs、docs/TTS_PROVIDER_ARCHITECTURE.md、docs/PROJECT_STATUS.md、docs/AI_CONTEXT.md、docs/DECISIONS.md。

只读核实当前真实 Git 工作区状态、upstream 与 origin、main 与 PR #16 的 HEAD/CI/审查记录。若 HEAD 已不等于上面的 SHA，先阅读新增 Diff；不得基于旧 SHA 盲改。

DeepSeek 不负责更新 docs/plans，也不替 ChatGPT 决定新计划排序或打标。ChatGPT 将对审查包做最终验收并提请用户选择是否授权合并。

## 4. 允许修改与绝对非目标

**唯一允许写入的现有工程文件：**

1. docs/PROJECT_STATUS.md —— 补充最新 TTS-A HEAD 对应的 197 项 Node / 24 UI / CI 证据，并区分原 192 项历史快照。
2. docs/AI_CONTEXT.md —— 同步相同的当前证据、PR OPEN / DESIGN-OFFLINE、验收状态与下一步合并授权门禁。

不要在其他文件做“顺手修复”。审计发现其他问题时仅记入风险表，标记 BLOCKED 或待后续任务审理。除以上两份状态文件外，严禁修改工程源码、测试代码、package.json、UI、模型/音色、Provider Registry、WeChatAgent、Bridge/Worker、Voice Sender、Host 配置或 docs/plans。

允许常规 Git 分支切换、只读审计、在现有 PR #16 分支提交这两份状态文档、正常 push、启动已有离线自动测试。不得新开竞争性 TTS-A PR、删分支或强推。

## 5. 状态文档数据契约与唯一修改方案

目标文档是当前工程分支的状态快照，不能用“全局搜索替换 192→197”污染历史事实。

- 在 docs/PROJECT_STATUS.md 的最新验收/测试区增加可辨认的 **PR #16 TTS-A post-F01–F05 acceptance checkpoint** 段落或表格行。内容必须：HEAD 3ad32bc（若同步导致新文档提交，应分别记“工程代码验收 HEAD 3ad32bc”与“文档同步后新 PR HEAD”）；原 run 40163881122 SUCCESS；Node 197（196 PASS、1 平台 SKIP）、UI 24/24 均明确标为 DeepSeek 本轮执行报告；功能 DESIGN/OFFLINE；PR OPEN 未合并；N01–N05 已新增；生产无副作用为报告说明；未来合并等待用户单独授权。
- 在 docs/AI_CONTEXT.md 的当前工作状态与最新检查记录附近同步同样口径；对引用旧 192/191/1 的语句若对应的是旧 TTS-A 阶段，明确注记为“历史快照（修复前）”；如确属独立旧阶段基线，则保留原数字，不改变其历史含义。
- 两份文档不得把 Fake 契约测试写成真实 Provider 可用、把 UI 24/24 写成真实八页 GUI VERIFIED、把 TTS-A 写成 TTS-B、把候选变成 selectable 或 default、把 CLOSED/MERGED 写成实际 PR 状态。
- 使用实际最新 SHA、链接、日期，绝不写自引用的“当前文档 HEAD 就是本次提交 SHA”：写修复代码的 HEAD 和后续提交的 Git link 即可；没有可信 loaded revision 不得写 APPLIED。
- 如果检查显示某处旧计数确实是先前一次独立历史运行，保留并加注“historical”；不要为了统一数字抹掉历史证据。

## 6. 一次性执行步骤

1. 确认 HEAD/PR/CI/评审和工作区：检查 git status、git branch、git rev-parse HEAD，GitHub PR #16 最新 head/base 与其成功 run；只基于 feature/tts-provider-neutral-contract 做改动。出现未提交的非本任务修改不得覆盖，先在报告里记明并暂停写入。
2. 做只读审查清单：PR #16 全量 22 文件逐项按运行代码、纯契约、测试、文档、依赖/构建分类；确认没有新 Host 写路由、真实通信、模型下载、WeChatAgent/Bridge/Worker/Voice Sender 改动或凭据、私有音频/路径泄漏。检查全量 Diff 不仅是最新 5 文件 Commit。
3. 先检查两份状态文档的所有 192、191、197、196、24、PR #16 和 TTS-A 相关位置；为每处确定是否属于历史记录/当前证据。若数据无法明确归属，保留原文并添加独立最新快照，而不是推断。
4. **仅修改**第 4 节允许的两个 Markdown 文件，按第 5 节同步；修订必须维持原文档结构、相对链接、UTF-8 和历史记录可追溯。
5. 在本机隔离环境执行 node build.mjs、node --test、npm.cmd run test:ui、git diff --check，按仓库已有规范执行 Markdown 链接与 Secret/Privacy 检查。全程不运行真实 Provider、微信或生产 GUI。
6. 提交两份文档的最小 Diff 到原 PR #16 分支；正常 push，不新建第二工程 PR。若无须改文档则不造空 Commit，直接保留 3ad32bc。
7. **必须重新核验提交后最新 PR HEAD 对应的 CI build/ui 成功**。旧的 run 40163881122 只能当先前代码修复的证据，不能借其替新 HEAD 背书。
8. 输出审查包与完整报告，标记 READY_FOR_USER_MERGE_DECISION 或 BLOCKED，然后停止；**不得调用 merge、关闭/删除 PR、切换到 TTS-B 实现**。

## 7. 负向/正向/隔离测试矩阵

| ID | 检查 | 预期及判据 |
|---|---|---|
| G01 | 检查 PR #16 HEAD/base/state | OPEN、未合并、head 变更可追溯；无神秘其他分支 |
| G02 | PR 全量 22 文件路径与 Diff | 变更符合 TTS-A 设计/F01–F05 范围；无生产写/真实发送 |
| G03 | Registry 候选与 v1 兼容 | TTS 10 + SVC 2、不可选、无默认；qwen-local 旧值保留 |
| G04 | TTS/SVC 隐藏投递字段 | 现有 N01–N05 正负面测试全过，不得出现新回归 |
| G05 | Cloud unknown credentials / UNKNOWN | 无 AVAILABLE 推断、无请求成功伪造、无自动重发 |
| G06 | 两份文档旧测试计数 | 当前 197 和历史 192 区分明确；没有不实 VERIFIED / MERGED |
| G07 | 文档范围 | Git Diff 新增更改只在 docs/PROJECT_STATUS.md 与 docs/AI_CONTEXT.md |
| G08 | Node / build / UI / diff | 重新运行并真实记录 PASS/FAIL/SKIP；生成客户端一致 |
| G09 | CI 最新 SHA | 本次新 HEAD 的 build + ui SUCCESS；排队不算成功 |
| G10 | 敏感数据与隔离 | Git Diff/日志无 Token、私人音频/目标/本机路径；无生产副作用 |
| G11 | 合并保护 | PR #16 保持 OPEN，main HEAD 未被本任务改变 |
| G12 | 外部 UI 测试区分 | Plan 01 未验收部分不误标 DONE，OFFLINE/INTEGRATED/VERIFIED 语义保留 |

命令（在已有 Windows 工程仓库中，使用现有脚本，禁止安装额外全局依赖）：

node build.mjs  
node --test  
npm.cmd run test:ui  
git diff --check

本轮无新运行逻辑，测试总数一般不应因两份 Markdown 修改而变化；实际值必须据实填报。

## 8. 必须使用的异常决策树

| 事件 | 唯一动作 |
|---|---|
| #16 被他人合并或 HEAD 改变 | 停止以旧状态写文档，重新核验并返回差异；绝不重写 main |
| 工作区已有非任务修改 | 保全现状、报告具体路径，不清空/覆盖/重置用户改动 |
| 文档旧数字对应其他阶段 | 原样保留，另设最新 TTS-A checkpoint |
| 最新 CI queued/in_progress/failure | 不宣布 READY；记录 run/status，必要时定位失败，不对安全断言放宽 |
| PR 存在新的生产写入、秘密或越权依赖 | BLOCKED，提供 Diff 证据，不自动删代码或执行服务 |
| 发现需要生产凭据/真实发送/付费 API 才能测试 | 跳过高风险动作并标 NOT_AUTHORIZED；当前任务只做隔离证据 |
| 需要改任务或 docs/plans | 报告给 ChatGPT，DeepSeek 不私自重排 |
| 人类 Review 未提供 | 正确显示 0 reviews；不把 CI 代替人工审批，不假造审核通过 |
| 仅剩合并步骤 | 标记待用户授权并停止，不执行 merge |

## 9. 安全、不变量、迁移及回退

本轮只读审计加状态文档变更，不涉及生产迁移，也不需要生产回滚。通过原 PR 文档 Commit 可以恢复任何误写的状态行，但不得使用 force push/reset 清理他人提交。

必须保持 WeChatAgent 必需、Whale Voice Core 与未来 Whale Relay 职责分开；SAVED != APPLIED；Worker NEVER_WRITE；Bridge/Worker 权限独立；目标校验不可绕过；UNKNOWN 不自动重发；当前 UI Automation Sender 不改变。Qwen/whale-v1 是现有个人兼容值，不是全球默认。未审核模型能力、许可、云端费用与真实声音授权不得推断。

**不许可**：合并任意 PR、生产配置/权限写入、微信消息、模型/二进制下载、服务重启、Hook/DLL、Windows 音频设备、第三方付费 API、仓库可见性调整、Release、分支删除/Force Push。

## 10. 完成定义（DoD）

- [ ] 与最新 GitHub PR #16 HEAD、22 文件 Diff、CI/评审事实匹配。
- [ ] 两份 Markdown 当前状态计数已同步，历史数字保留并有清楚标签；无不实功能等级。
- [ ] F01–F05 / N01–N05 不再被重复开发，设计/纯测试无倒退。
- [ ] node build、Node、UI、文档/隐私/Diff 检查成功，报告包含真实数字与 skip。
- [ ] 若有提交，提交内容仅两个允许的文件；当前新 HEAD GitHub CI 为 SUCCESS。
- [ ] main 未修改、PR #16 OPEN 未合并；#17/#18/Plan01 状态未被擅自改变。
- [ ] 审查包有 READY_FOR_USER_MERGE_DECISION 或 BLOCKED 结论和明确剩余授权。
- [ ] 操作停止于合并前；没有真实 TTS/SVC、Relay、微信/生产或收费动作。

## 11. DeepSeek 最终报告格式

请回复《Plan 03 · PR #16 合并前准备与待授权报告》，分段提供：

1. 仓库、分支、main SHA、PR #16 base/head、OPEN/mergeable 状态、Review 数。
2. 22 文件全量 Diff 分类与可疑/不允许改动证据。
3. 两份 Markdown 的准确修改行、原/新计数语义与是否产生文档 Commit。
4. G01–G12 每项 PASS/FAIL/BLOCKED，附源文件/测试或 GitHub 证据。
5. 本地 build/Node/UI/文档/Privacy/Diff 真实计数和最新 PR HEAD GitHub CI run。
6. 生产安全隔离与未授权高风险动作未执行的确认。
7. 唯一结论 READY_FOR_USER_MERGE_DECISION 或 BLOCKED，并列出残余问题、下一步需要的明确用户合并授权。
8. **报告完成即停止，不合并、不开始 TTS-B。**

## 12. 交接与上下文保护

Plan 02 已收尾。如果目前 DSH 对话很长，可在本任务启动前另开新对话：先在旧对话保存当前 git status、工作分支与 PR #16 链接，再在新对话读取 AGENTS.md、以上计划和真实 PR/CI；本计划书可以直接作为新会话唯一启动任务。仅切换 AI 对话，不停止任何生产服务。

**派发门禁自评：95/100。** 真实基线、目标文件、唯一方案、测试、失败分支与安全均明确；真正 merge 环节因没有用户授权而明确排除。