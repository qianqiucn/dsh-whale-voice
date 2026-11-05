# Whale Voice · ChatGPT 计划与 GitHub 协调执行标准

> **适用对象：ChatGPT（负责计划书、执行顺序、GitHub 计划记录及相关协作审查）。**
>
> **不强制 DeepSeek 遵守本文件中的计划管理工作流。** DeepSeek 是项目主要代码开发 AI，负责用户指定的实现、测试、技术报告及正常工程 Git/PR 操作。DeepSeek 应阅读并遵守 [AGENTS.md](AGENTS.md) 的工程质量与安全边界，但无需每次编码都读取本计划标准、发送下一份计划、重排任务书或打 DONE 标记。
>
> **ChatGPT 每次负责 GitHub 计划管理时，必须阅读本文件、AGENTS.md、长期规划记忆和详细任务标准。** 本文件不代表用户已授权合并、生产写入、真实微信发送或其他高风险操作。
>
> **首次登记：2026-10-25。计划唯一索引：[docs/plans/README.md](docs/plans/README.md)。**



## 2026-10-26 · 永久交接规则：每次新开DS/DSH对话必须提醒模式
用户实际界面提供「标准」「创造」。以后每次建议或协助新开DeepSeek/DSH对话，都在回复和计划书开头明确写：推荐模式、简短原因、读写/安装/生产边界和首项动作；不能等用户追问。
官方中文模式定义已查证：标准用于代码/文件/资料工作，具备检索、编辑、终端等工具；创造用于通过对话定制DSH插件/界面、组合工具与提示词创建自定义模式。官方来源：
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-agent-preset/src/client/locales.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-agent-preset/README.zh.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-09-16-creator-persistent-plugin-management.md
模式是工具/提示词预设，不是模型强弱，也不是读写权限。标准也能修改代码与运行测试；创造不是普通开发必选，也不能把它描述成只在内存试验、不持久安装。当前官方架构说明标准与创造都可在权限门禁下使用plugin_manager；本项目任务授权仍独立限制。
默认判定：仓库核验、修复、测试、普通工程代码→标准；明确需要创造/检查DSH插件、运行时能力或自定义预设→评估创造并写明原因。Whale Voice虽是DSH插件，纯离线模块/审计不自动需要创造。只有实际需求匹配时才推荐创造，不宣称两者能力互斥。
Plan06-A明确选择「标准模式」，只读核验、不改文件/不安装/不合并来自任务书限制。禁止再用用户界面不存在的Plan/Build充当模式名称，也不能把标准误称为只读模式。旧06-A§16与旧交接中的Plan/Build措辞由本规则及06-A v1.1替代。
选择模式最好在发送第一条消息前完成；官方说明已有会话保留开始时的预设。界面或版本变化时重新查证，不安装切换插件、不自动改默认模式、不重启DSH/微信/模型。
本次只纠正交接说明：06-A仍SENT，未新派工程；原任务范围与DoD不变。


## 2026-10-26 · 用户最新交付偏好：本地Markdown文件按发送顺序归档
用户要求：以后的计划书直接交付.md文件，在本地专用计划书目录按实际发送顺序编号。
- ChatGPT交付完整Level2任务时，创建独立UTF-8 Markdown文件，命名为三位发送序号_Plan原编号_中文标题.md，并更新目录索引；回复提供可点击文件链接和简要说明，无须再粘贴全文。这是对旧条款“必须回复正文贴全文”的明确替代，完整规格仍须真实写入文件，不能用裸任务名称代替。
- 本地序号从本次归档001开始，仅代表文件交付顺序，不重编Plan01–14。当前001为Plan06-A v1.0，本次仅补存刚发送的任务，不是再次派发。
- 修订后重新发送使用下一序号，保留旧文件并标明原ID/版本/替代关系；普通验收、建议、状态说明不占序号。不凭不完整历史回填旧顺序。
- 继续在现有授权规划分支保存正式计划与验收事实；用户明确要求“不写入仓库”的临时计划或报告仍只在本地/对话交付。不得把本机绝对路径、隐私或凭据写入仓库。
- 此偏好持续适用于后续会话；先读取本地目录索引再取下一序号。若文件环境不可用，明确说明未创建，不能谎称已交付。
本次无新工程派发：06-A仍SENT，07-B仍DONE/OFFLINE，03-B仍WAIT_USER_AUTHORIZATION；没有合并或生产操作。


## 永久产品门禁：新手易用性高于开发者便利（2026-10-25）

用户已经明确要求：“本项目始终给不会代码的编程小白用，保持易用性。” 这是 ChatGPT 所写全部未来任务书/验收报告必须长期遵守的**产品约束**，详见 [docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md](docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md)。

- **ChatGPT 派发前**：为每份相关 Level 2 任务书附“零编程基础用户第一次如何操作”的标准流程、所需依赖、简体中文控件、硬件/云端替代、取消与失败恢复，DeepSeek 不必临时补产品设计。
- **报告验收前**：按任务范围检查普通用户不使用命令行、Git、手动 JSON、pip、npm、Python 即可使用该任务声明已经支持的功能；对 Mock/OFFLINE 研发件需诚实说明尚不支持最终用户直用，不把前端演示、只读、无真实 Installer 夸成完成。
- **长期权衡**：功能丰富不能强迫新手预装多套模型；首访 GUI 引导与分功能最小依赖、复用原组件、透明资源/费用、无显卡和无需微信投递的预览/保存路径，优先于多引擎“功能数量”。
- **安全不降级**：用户一键按钮仍需要经审核 Installer/API、显式安装/付费/写入/发送同意，不能因易用性绕过 WeChatAgent、Worker NEVER_WRITE、UNKNOWN 不重发和许可证限制。
- 将上述检查纳入 [docs/plans/TASK_SPEC_STANDARD.md](docs/plans/TASK_SPEC_STANDARD.md) 和 GitHub README/交接卡；以后新会话必须读取并执行，不要让用户重复强调。

## 2026-10-25 · 已批准产品命名（更新后遵循，历史文档保留旧称）

TTS 与 SVC/歌声转换的**唯一共用核心**对外正式称 **Whale Audio Core（鲸音核心）**，原“Whale Voice Core”是旧文档的兼容别名；**Whale Voice** 是语音气泡功能，**Whale Singing** 是唱歌功能。两者各有独立前端入口/首次依赖弹窗，但共用音色、模型、Provider、音频和唯一 Task/Delivery ID。**Whale Relay Core（鲸递）只负责一次安全交付**，WeChatAgent 继续负责微信权限；不能因改名降低原安全边界，也不能批量更名已部署的 plugin/route/schema。权威 [双入口与依赖规范](docs/plans/WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md)；此改名仅文档决定，真正改 UI/安装器需后续 Level 2 工程计划、Fake 回归和独立授权。

## 新会话首读交接（ChatGPT 专用）

用户新开 ChatGPT 对话时，除了此标准、AGENTS、长期记忆与 TASK_SPEC_STANDARD，还必须先读：
- [NEXT_CHATGPT_HANDOFF.md](docs/plans/NEXT_CHATGPT_HANDOFF.md) — 最近状态、风险、未合并 PR 和进度证据；
- [NEXT_CHATGPT_ACTION_PLAN.md](docs/plans/NEXT_CHATGPT_ACTION_PLAN.md) — 下一位 ChatGPT 要执行的第一项计划管理任务（不代表自动授权）。

这两份文件属于 **ChatGPT 的计划管理职责**，不要求 DeepSeek 在日常编码时阅读，也不允许因“交接”自动合并 PR。

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

### C. 用户提交任务完成、进展、测试或验收报告（必须自动交付下一份）

**用户明确规定：每次发报告，都要在当次 ChatGPT 回复里收到一份完整 DeepSeek 计划书，不必重复请求“下一份”。** 下方审查/打标步骤照旧执行，但只反馈状态或只给任务链接均不合格。

- 尚未验收通过：对原工程 PR 的未通过项给出最小修复/负向回归任务书，不重复既有实现。
- 已通过验收：按依赖选择下一项，扩写成 EXECUTION-READY Level 2 并完整发送。
- 证据不足/需要单独授权：交付安全的只读审计、隔离测试或授权前准备计划，不得跳过合并、生产写入、付费/微信发送等授权。
- 一轮只派发一份；必须在回复正文贴完整可复制的目标、真实基线、文件/契约、顺序、失败分支、正负测试、DoD、报告格式，GitHub 文件链接仅作为持久存档。
- 同轮更新计划管理文件的派发记录；文档未能写入时须说明。不自动启动 DeepSeek、合并 PR 或执行生产操作。

### C.1 报告审查与打标步骤

1. 核对原计划按 [TASK_SPEC_STANDARD.md](docs/plans/TASK_SPEC_STANDARD.md) 编写的逐条 DoD、用户报告、分支/PR、实际代码、CI 及可获取的测试结果；不根据旧的假定 HEAD 重复派工。
2. **满足验收门槛**才标记 `DONE`；若证据不足，保留原状态并注明 `REVIEW_REQUIRED` / 待确认原因，不假装完成。
3. 独立记录 Git 状态：`NO_PR`、`LOCAL_ONLY`、`PR_OPEN`、`MERGED` 等；`DONE` **不等于** `MERGED`。
4. 独立记录功能等级：`MOCK`、`OFFLINE`、`INTEGRATED`、`VERIFIED`。测试绿、PR 合并、Host 已加载与真实生产验证互不等价。
5. 在计划书顶部标明完成日期、Commit/PR、CI/测试证据、未完成的风险；同步总表及变更记录。
6. 标记完成不是合并许可；未经用户另行授权，不合并 PR、不启动下一阶段。

## 2.0 报告触发任务书的强制去重

“每次报告都发任务书”**不是**“每次报告都创建新任务”。每次回复前先比对当前报告与计划索引、任务 ID、目标 DoD、最新 PR/HEAD/CI：

1. 相同报告 + 相同 HEAD + 无新证据或需求：原任务继续有效。完整转发原任务的**续行版**，注明“不是新任务；继续原 PR；已通过项无需重复做”；不重复记 SENT、不造空提交。
2. 相同目标但新增失败证据：只在原 ID/PR 下修补未通过项，标注新增/修改/保留的要求以及计划版本；不用新编号或新 PR。
3. 相同目标仍执行中：完整的续行书只列必须执行的剩余步骤，并维持原 DoD 和安全约束；明确不另起并行任务。
4. 原 DoD 已核实全部通过：该任务 DONE，然后选下一个不同目标且满足前置条件的任务；不可仅为了“每次发任务”而重复实施已完结内容。
5. 两个计划可能重复：按任务交付物/用户可见效果/接口与 PR 范围交叉对比；保留一个权威 ID，另一个只留历史或标为重复，不得在无用户授权下关闭 PR。

每份发给 DS 的报告后续计划正文注明**ID、版本、报告/HEAD 基线、增量差异、已完成禁止重做项、剩余步骤及 DoD**。保证单份完整可复制且不造成新的无授权工程命令。若重复派工源于执行端上下文失真，按 §2.1 建议交接。

## 2.1 每份报告后的 DSH/DeepSeek 对话交接判断（ChatGPT 专用）

用户要求我主动提醒其在合适时机让 DSH 执行端**新开 AI 对话、清空长上下文并交接**。因此报告复核时除了自动派发完整执行任务书，还必须附一条对话交接建议：

- **继续当前对话**：执行端仍准确遵循已批准的计划、能找到当前 PR/HEAD、没有明显上下文衰退，也没有跨阶段切换。
- **本轮完成后交接**：一个 PR/子阶段即将完成，或进入另一个大模块，或当前执行端已积累大量长报告与反复修改；在干净 Git 边界准备非敏感 handoff 再换新对话。
- **建议立即交接**：报告显示忘记安全约束、混淆版本或 PR、反复重做已实现内容、遗漏关键上下文，或者执行端明确报告 token/上下文压缩问题。先保全工作和风险状态，切勿继续扩大开发。

交接内容必须说明工作仓库/分支/PR/HEAD/CI、已完成/待办、修改范围、重要安全限制、未提交工作及恢复办法、当前唯一下一动作，并在新对话首先重新核验事实。**ChatGPT 无法直接看见 DSH 端上下文使用量；结论由用户贴来的报告、可核验 Git 状态和阶段边界推断，不能谎称实时监控。** 新开 AI 对话不等于重启 DSH 或微信、Qwen、Voice Sender 服务。详细规则见 [长期记忆 §1.2](docs/plans/CHATGPT_LONG_TERM_MEMORY.md)。

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
7. 非报告类请求可以只简述推荐计划；**用户发来开发/测试/完成报告时必须主动附上完整、可复制的 DeepSeek 计划书，不能只描述名称或提供链接**。

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
