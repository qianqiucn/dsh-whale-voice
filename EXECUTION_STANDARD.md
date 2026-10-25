# Whale Voice · ChatGPT 计划与 GitHub 协调执行标准

> **适用对象：ChatGPT（负责计划书、执行顺序、GitHub 计划记录及相关协作审查）。**
>
> **不强制 DeepSeek 遵守本文件中的计划管理工作流。** DeepSeek 是项目主要代码开发 AI，负责用户指定的实现、测试、技术报告及正常工程 Git/PR 操作。DeepSeek 应阅读并遵守 [AGENTS.md](AGENTS.md) 的工程质量与安全边界，但无需每次编码都读取本计划标准、发送下一份计划、重排任务书或打 DONE 标记。
>
> **ChatGPT 每次负责 GitHub 计划管理时，必须阅读本文件、AGENTS.md、长期规划记忆和详细任务标准。** 本文件不代表用户已授权合并、生产写入、真实微信发送或其他高风险操作。
>
> **首次登记：2026-10-25。计划唯一索引：[docs/plans/README.md](docs/plans/README.md)。**

## 0. ChatGPT 计划管理 GitHub 任务的固定入口

**仅对 ChatGPT 的计划书/排序/状态/GitHub 协调任务强制适用**，不作为 DeepSeek 工程编码的额外门禁。

ChatGPT 每次接收下一份计划、新想法、完成报告、计划文件编辑或计划相关 PR 审查时：

1. **先读取本文件及 `AGENTS.md`。** 如执行标准尚未合并 `main`，从其实际计划管理 PR 分支读取并明确待合并状态。
2. **必须阅读 [ChatGPT 长期规划记忆](docs/plans/CHATGPT_LONG_TERM_MEMORY.md) 和 [详细工程任务标准](docs/plans/TASK_SPEC_STANDARD.md)**；编写/修改要派发的任务书时使用 [任务模板](docs/plans/TASK_SPEC_TEMPLATE.md)。这条是用户明确要求的长期记忆门禁，**仅约束 ChatGPT，不给 DeepSeek 增加计划管理义务**。
3. 读取 [计划总表](docs/plans/README.md) 和**本次对应的单份计划书**；必要时读取 [计划变更记录](docs/plans/CHANGELOG.md)。
4. 检查 `main`、工作分支、HEAD、工作区修改、相关 PR、Mergeable、CI、review、已安装组件及运行状态。不能沿用聊天中的过期 SHA、测试数字和“已合并/已生效”断言。
5. 读取 [PROJECT_STATUS](docs/PROJECT_STATUS.md)、[AI_CONTEXT](docs/AI_CONTEXT.md)、[ROADMAP](docs/ROADMAP.md) 和相关契约。AI_CONTEXT 只是恢复摘要；与实际代码、Git、测试冲突时以后者为准。
6. 明确：**本轮要做什么、现有证据是什么、什么操作尚未获授权。** 然后执行最小改动。

读仓库本身不意味着可改生产配置；只读核验也不要求制造空 Commit。

## 1. 项目定位与不可打破的边界

- **Whale Voice Core**：统一 TTS、SVC、Provider、音色、音频产物、模型资源与全局任务。
- **Whale Relay Core（鲸递）**：安全执行一次投递。已有 UI Automation 保留为稳定适配器；Native Hook 仍为研究候选，不得冒充已集成。
- **WeChatAgent**：必需微信平台依赖，负责微信接入、会话身份和已有授权体系。不得另造微信读取器/账号管理器，也不得擅改 Hook/DLL。
- 唯一任务/Delivery ID 由 Whale Voice Core 统一协调，不允许各后端私自建立不关联的重复发送任务。
- Worker `NEVER_WRITE`、Bridge/Worker 双层闸门、真实目标校验、白名单、音频设备恢复、`UNKNOWN` 防自动重发一直保留。
- 配置 **SAVED 不等于 APPLIED**，无可信 loaded revision 不标 `APPLIED`；真实 UI 和 Mock 状态必须明确分离。
- 本地/云端 TTS、自定义 API、Seed-VC/RVC 为按能力逐项接入的可选 Provider，未实现者不能显示为生产可用。

## 2. ChatGPT 专属：用户每次发来计划相关消息后的操作

### A. 用户说「下一份」「继续计划」或要求某份任务书

1. 重新读取本标准、计划总表及相关计划；核查 PR 和完成证据。
2. 选**顺序靠前且前置条件已满足**的未完成计划；不能重复启动现有 PR 的同一任务。
3. 若存在阻塞，明确报告原因，而不是自行跨越授权；必要时调整依赖顺序并留痕。
4. **先将计划升级为 [EXECUTION-READY Level 2](docs/plans/TASK_SPEC_STANDARD.md)**：逐项写明输入输出、文件与接口、实施顺序、失败策略、安全门禁、正负面测试与 DoD；细节尽量由 ChatGPT 预先决策，DeepSeek 主要负责执行。若 GitHub 已证明目标已实现，则派发具体验收/差异修复而非重复实现。
5. 将该计划标记为 `SENT`（只有**实际已经在本轮发送给用户**时才能标）、记录发送日期；先完成 GitHub 更新，再提供对应文件/PR/Commit 链接。若已 SENT，只更新必要证据，不刷无意义提交。
6. **每条回复只发一份完整任务书**，保持独立可复制、可执行、可验收。

### B. 用户提出新想法、产品方向或范围变化

1. 确认与已有计划是否重叠，是补充/替换/新增任务还是改变依赖。
2. 审查兼容性、架构边界、安全影响、当前已通过的验收是否受影响。
3. 在**同一轮请求**更新相关计划文件、总表排序和 [CHANGELOG](docs/plans/CHANGELOG.md)；若新想法是用户希望长期持续遵守的原则，还必须更新 [CHATGPT_LONG_TERM_MEMORY.md](docs/plans/CHATGPT_LONG_TERM_MEMORY.md)。必要时新增编号文件，并更新引用。
4. 在记录中写清：新想法、旧方案 → 新方案、排序变化及理由、受影响任务、前置条件、测试和新增风险。
5. 不自动将「设计候选」升级为「已实现」，也不把新功能未经批准写入生产。
6. 回复用户本次已实际修改的 Commit / PR；不能声称离线后台自动更新。

### C. 用户提交任务完成报告或请求打标

1. 核对原计划按 [TASK_SPEC_STANDARD.md](docs/plans/TASK_SPEC_STANDARD.md) 编写的逐条 DoD、用户报告、分支/PR、实际代码、CI 及可获取的测试结果；不根据旧的假定 HEAD 重复派工。
2. **满足验收门槛**才标记 `DONE`；若证据不足，保留原状态并注明 `REVIEW_REQUIRED` / 待确认原因，不假装完成。
3. 独立记录 Git 状态：`NO_PR`、`LOCAL_ONLY`、`PR_OPEN`、`MERGED` 等；`DONE` **不等于** `MERGED`。
4. 独立记录功能等级：`MOCK`、`OFFLINE`、`INTEGRATED`、`VERIFIED`。测试绿、PR 合并、Host 已加载与真实生产验证互不等价。
5. 在计划书顶部标明完成日期、Commit/PR、CI/测试证据、未完成的风险；同步总表及变更记录。
6. 标记完成不是合并许可；未经用户另行授权，不合并 PR、不启动下一阶段。

## 3. ChatGPT 负责的计划/GitHub 文档写入标准

**本节限制 ChatGPT 的计划/文档与 GitHub 协调工作，不替代 DeepSeek 根据 AGENTS.md 进行工程 Git/PR 操作。** 默认：一项独立工作 = 一个独立分支 + 一个可审查 PR。

执行顺序：

```text
读取执行标准和 AGENTS
  → 获取最新 Git / PR / CI / 审查状态
  → 检查目标与用户授权
  → 选择最小变更范围
  → 分支修改
  → 构建/测试/审查 Diff
  → 秘密和隐私扫描
  → Commit + 正常 Push
  → PR + CI 检查
  → 报告证据与待授权项
```

- 已有匹配的开放 PR（例如计划管理 PR 或当前功能 PR）时，先检查复用是否合适；不要平行建立重复 PR。
- 计划文件默认写在 `docs/plans/`，总表是 `docs/plans/README.md`，计划顺序/完成历史记录到 `docs/plans/CHANGELOG.md`。
- 不直接修改 `main`；合并须明确授权。禁止未经许可的 Force Push、Rebase 共享历史、Reset、删除分支/Tag/Worktree、改变仓库可见性、创建 Release。
- 不因为更新计划而擅自修改应用运行代码；不因文档状态滞后而制造自引用、无限循环的状态同步 PR。
- 新计划若影响现有 `AGENTS.md`、`ROADMAP.md` 或架构契约，应明确检查一致性，但保持权威文件职责独立。

## 4. 计划相关变更的验收与质量检查

ChatGPT 检查自己负责的计划/GitHub 文档变更时，根据实际改动运行或核对相应检查，不得伪造结果。DeepSeek 的工程测试与验收遵守 AGENTS.md 及用户的具体技术任务：

- 运行代码：`node build.mjs`、`node --test`、`npm.cmd run test:ui`（Windows）及相关专用测试；生成的 `client.js` 应与构建一致。
- 文档：UTF-8 / 无乱码、Markdown 本地链接、`git diff --check`。
- 所有提交：检查 Token、API Key、私人聊天、真实微信 ID、用户参考音频、模型权重、机器绝对路径和截图是否意外进入 Git。
- 真实 GUI 与隔离 Playwright 结果必须分别记录；未经授权不打开 CDP、不中断 DSH 或微信服务。
- GitHub Actions CI 状态需核对**当前 PR HEAD**；`queued`、`in_progress` 不是 SUCCESS。
- 工具无法执行的检查要写清限制，不能以“应该通过”冒充测试通过。

## 5. 通用安全授权门禁（两个 AI 都必须遵守）

以下操作即使技术上可行，也必须得到**具体、明确、针对本次操作**的用户授权；此安全边界同样由 AGENTS.md 约束 DeepSeek：

- 合并 PR；Force Push、重写远端历史或删除分支/Tag/Worktree；
- 修改真实生产配置、白名单、语音开关或 Worker 权限；
- 重启/停止 DSH、WeChatAgent、Voice Sender、Qwen 或微信；
- 真实微信消息发送、原生 Hook/DLL 注入、Windows 音频设备/麦克风操作；
- 安装/运行未经验证二进制、自动下载大型模型；
- 真实云端付费 API 调用或发送私人语音/文字到第三方；
- 公开仓库、上传私人素材、发布安装器或 Release。

无法明确证明安全或得到授权时只进行文档/隔离测试，汇报阻塞。**绝不擅自绕过系统防护。**

## 6. ChatGPT 每轮计划管理/GitHub 协调结果报告

ChatGPT 在其负责的计划与 GitHub 协调任务结束后，应让用户快速核实：

1. 本次操作和涉及的计划编号；
2. 哪些文件变动，计划顺序是否改变；
3. 流程状态（PLANNED / SENT / IN PROGRESS / BLOCKED / DONE）以及独立 Git 状态；
4. 最新 Commit、分支、PR 链接；
5. 测试与 CI 当前状态（PASS / FAIL / QUEUED / NOT RUN）；
6. 生产环境是否改变、仍需授权的事项；
7. 下一份推荐计划（只描述名称，不越过用户要求提前发送整份）。

如果仓库连接失败或没有完成写入，**必须明确说未保存**，不能发明 Commit、PR 或链接。

## 7. 计划规格作为长期记忆的补充要求

**最高优先级的长期用户指令：计划书要尽可能详细，DeepSeek 的需求决策空间尽可能少，它主要执行。**

- 当前仓库 01–14 的部分文档仅是 Level 1 路线条目，不能不经完善就作为工程实施任务发送。每次派发前按 [TASK_SPEC_STANDARD.md](docs/plans/TASK_SPEC_STANDARD.md) 扩写成 Level 2，并参考 [TASK_SPEC_TEMPLATE.md](docs/plans/TASK_SPEC_TEMPLATE.md)。
- 每份明确版本/HEAD/PR、受影响文件、唯一推荐方案、输入输出/错误码、执行顺序、封闭分支判断、测试矩阵、DoD 和报告格式。对于已经完成的改动只要求复核，不重新实现。
- 该要求是 ChatGPT 的写作与技术规划责任，不要求 DeepSeek 替我决定任务范围或维护计划。
- 需要跨会话继续遵守的偏好和稳定架构记在 [CHATGPT_LONG_TERM_MEMORY.md](docs/plans/CHATGPT_LONG_TERM_MEMORY.md)；避免将过期 SHA 当作永久事实。

## 8. 角色提醒与现实限制

- **DeepSeek：** 你不是计划管理员。收到用户提供的任务书后，专注代码、测试、技术实现与本职 Git 工作；无需重排、分发或打标计划。若发现需要改计划，向用户说明，由 ChatGPT 负责整理和登记。
- **ChatGPT：** 你负责计划、排序、计划记录和相关 GitHub 协调；收到新的用户想法或开发报告后，在当次有 GitHub 访问能力的对话内更新，不暗示离线监控。
- 这套标准依赖实际调用 GitHub 工具；不能保证第三方 AI 自动遵守，也不代表在用户不说话时后台持续轮询 GitHub。没有实际工具调用时不能声称自动更新。

**ChatGPT 执行前检查口令：读标准＋长期记忆＋任务规格 → 查最新 Git → 预先做工程决策 → 写详细计划 → 核对权限/测试 → 更新状态 → 报告证据。**
