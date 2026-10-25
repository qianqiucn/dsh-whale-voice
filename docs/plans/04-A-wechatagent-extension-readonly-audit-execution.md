# Plan 04 · 04-A WeChatAgent / DSH 正式扩展能力和授权边界审计（Level 2）

**任务版本：v1.0 · 2026-10-25。原 Plan 04 下 04-A 只读研究，不新建 Plan 15。**  
**任务状态：SENT（本任务书由 ChatGPT 交付用户转发 DeepSeek）；目标等级：RESEARCH / OFFLINE DOCUMENTATION，非 INTEGRATED、非 VERIFIED。**  
**决策/验收：ChatGPT；只读研究、独立 docs-only PR：DeepSeek。**  
**唯一最终交付：`docs/WECHATAGENT_EXTENSION_INTEGRATION.md`。**  
**硬边界：不得升级/安装/重启 DSH、WeChatAgent、微信、Voice Sender；不得读取真人聊天、Token、授权名单或私有运行数据；不得建立可调用真实发送的 Tool，也不得合并任何 PR。**

## 1. 唯一业务目标与用户可见价值

审清 **DSH 插件、WeChatAgent 扩展、WeChatAgent v0.4.1 ZIP 插件 API v2** 的真实能力，决定普通用户未来如何通过简体中文图形界面启用 Whale Voice（语音气泡）与 Whale Singing（唱歌）而无需代码、命令行、手工修改 JSON。研究支持的能力包括：接收经过授权的 DeepSeek 工具意图、获得受信任的聊天/发起者标识、查询和取消自己被许可的鲸音任务、由鲸音保存 Artifact，并经鲸递单次授权投递。

**不得把“上游新出现扩展 API”解释为当前已经兼容/可以自动安装。** 目前产品默认兼容基线仍为已记录的 WeChatAgent 0.3.9 + DSH 既有独立插件与只读 Adapter；上游 0.4.1 新增 ZIP 插件 API v2，有潜在**可选**新入口，但此 API 与现有 DSH 插件体系不同。是否未来需要额外制作 ZIP 桥接层，只审计，不实施；更不能因“简单”自动升级本地微信框架。

本阶段不是实现机器人控制、点歌、Group Voice、真实发送、外挂安装、Native Hook、模型下载或生产配置写入。Plan 03-B（合并 PR #16）仍需用户独立许可，**Plan 04-A 静态审计不依赖实际 Merge，可在等待期间开展**。

## 2. ChatGPT 已核验的事实快照（2026-10-25；DS 执行前必须重新核实）

| 项目 | 本轮基线 | 禁止误读 |
|---|---|---|
| main | `bf9cf66807e12d0b25872a0fa3869962dde04818` | 未授权修改 |
| PR #16 | OPEN，HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`，0 reviews，CI `40165832178` SUCCESS | TTS/SVC v1 DESIGN/OFFLINE，03-B 未获合并授权 |
| PR #17 | 规划分支 `docs/whale-voice-execution-plan-registry`，以读到的最新 HEAD 为准 | 只读规则、ChatGPT 负责改计划 |
| PR #18 | OPEN/Draft，HEAD `42cec57ae7018735cb6c65a4ef8b0a1d80473810` | 历史重复来源 |
| PR #19 | OPEN，HEAD `e21dee8a8192f24a3465f169c761e62d30611e59`，仅研究报告 489 行，CI `40231587503` SUCCESS | 07-A 研究 DONE，但 #19 尚未合并；只读引用，不改 PR |
| WeChatAgent 历史已观测本地版 | 0.3.9；Windows 微信 4.1.10.27；DSH SDK 0.2.0-rc.2、Shell 0.2.1-rc.2（此前报告） | **不是本轮重新探测当前机器的证明** |
| WeChatAgent 上游 v0.3.9 | tag v0.3.9 → commit `0e76902a66c7bde6a3f78335284cea7f9be6e1b1` | tag 为 annotated；不要误用 tag object SHA |
| 上游 v0.4.0 | tag v0.4.0 → commit `34766b6f52e8e87c09dff8ad19dc62c39700aa4d` | 静态参考 |
| 上游 v0.4.1 | 2026-10-25 release → commit `08c09da6773967dea72acd48ffb5a8c6555e0f9c`；API v2 ZIP 插件、独立进程、按聊天权限 | 新发布≠已安装；不能自动升级 |
| WeChatAgent 上游最新 main（查询时） | `08c09da6773967dea72acd48ffb5a8c6555e0f9c` | 下次读取时若前进，用固定 tags 作证据 |

上游 **v0.4.1 官方发布说明**：
https://github.com/sourcepro5/WeChatAgent/releases/tag/v0.4.1
**正式插件开发规范**：
https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/docs/PLUGIN_DEVELOPMENT.md

首次只读观察（待 DS 固定代码证据核验）：
- 0.4.1 API v2 使用 ZIP 清单 `plugin.json` + `index.mjs` 和 `setup(api)`；插件安装前预览名称/版本/权限，安装后仍需单独授权“启用”和聊天范围。
- 规范明确**DSH 插件并不等同或兼容 WeChatAgent ZIP 插件**，不能将现有 DSH Whale Voice 项目直接压缩成 ZIP 上架。
- API v2 暴露注册 Tool/按聊天授权/取消/状态等有限宿主能力；明确没有通用文件/原生图片发送 API。Node 子进程并**非 OS 安全沙箱**。
- 真正实施 API v2 插件可能有二次启用步骤，且 v0.4.1 发行说明列出升级前退出/重新准备配置，**本轮不得执行**。
- 原 `packages/adapter-wechatagent/index.mjs` 仅只读发现/版本/Health；`accountVerified=null` 或 401 不代表账号授权。当前 DSH Host GET 能力并非写权限或正式插件安装器。

## 3. 必读规范及准确基线源码

**仓库规划分支只读：**
1. `AGENTS.md`、`EXECUTION_STANDARD.md`、`docs/plans/README.md`。
2. `docs/plans/04-wechatagent-extensions-audit.md` 和**本任务书**。
3. `docs/plans/WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md`、`docs/plans/RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md`、`docs/plans/05-unified-core-a.md`。
4. `docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md`、`docs/plans/TASK_SPEC_STANDARD.md`。

**当前工程 main（只读，路径存在才可推断能力）：**
- `docs/WECHATAGENT_COMPATIBILITY.md`、`docs/VOICE_DELIVERY_BACKENDS.md`、`docs/CAPABILITY_API.md`、`docs/SETUP_API.md`、`docs/CONFIG_SOURCES.md`、`docs/CONFIG_COORDINATION.md`。
- `packages/adapter-wechatagent/index.mjs`、`core/detect.mjs`、`core/capabilities.mjs`、`core/config.mjs`、`index.js`、`core/server.mjs`、`core/request-guards.mjs`。
- `test/core.test.mjs` 及实际存在的 adapter/core、UI 回归。**不要猜不存在的测试或未出现的 Tool**。
- 未合并的 PR #16 `core/svc/svc-contract.mjs`，仅作为未来 SVC v1 契约；当前 main 不含它，不得宣称已经集成。

**WeChatAgent 官方上游三固定版本（全程只读）：**
- `sourcepro5/WeChatAgent` tag `v0.3.9` / `0e76902a66c7bde6a3f78335284cea7f9be6e1b1`；
- tag `v0.4.0` / `34766b6f52e8e87c09dff8ad19dc62c39700aa4d`；
- tag `v0.4.1` / `08c09da6773967dea72acd48ffb5a8c6555e0f9c`。
优先查 `docs/PLUGIN_DEVELOPMENT.md`、`README.md`、`RELEASE_NOTES.md`、`LICENSE`、`LICENSES.md`、`packages/plugin-api/{index,catalog,installer,process,worker}.mjs`、`packages/extension-runtime/{index,catalog}.mjs`、`components/qq-bridge/src/{...}` 和 `packages/dsh-social-bridge-plugin` 中实际与 Tool、身份、回复/取消、授权和适配器相关的**存在的**文件。每项代码证据使用固定 SHA/path/line，未找到明示接口就 `UNKNOWN/UNSUPPORTED`。

本轮**不需要本机 WeChatAgent 安装目录访问**；历史已观测的 0.3.9 是研究输入，不让 DS 读取私人工作区。不可要求用户粘贴个人聊天、会话 ID、群 ID 或 Token。

## 4. 文件与 Git 权限（本轮唯一变更）

从执行时最新 main 创建独立研究分支：
`research/plan04-wechatagent-extension-audit`。若已有同名合法研究 PR，优先复用并核实；若占用冲突停下报告，不新建重复任务 PR。

**仅可新增（或精确补充既有）**：
`docs/WECHATAGENT_EXTENSION_INTEGRATION.md`。本轮查 main 未发现该文件，但执行前重新检查，若已有同目的报告应评估差异并停止重复创建。

**禁止**更改任何 `core/**`、`packages/**`、`test/**`、`pages.js`、`setup.js`、`index.js`、`package.json`、`docs/plans/**`；禁止改或合并 PR #16/#17/#18/#19，禁止删除分支、Force Push、PR auto-merge、修改任何生产配置。

**运行限制**：只读 Git/GitHub、文本/静态文档验证、`git diff --check`、已有不安装新依赖的 doc integrity/UTF-8/隐私检查。此阶段无任何真实集成或需运行 WeChatAgent 的测试；如已有测试被执行，必须单独记为“仓库旧测试回归，非该接口验证”。不要下载可执行 ZIP/Hook、运行 setup scripts、WeChatAgent/DSH/微信实例。

## 5. 技术调研任务 A：版本化扩展能力/生命周期

必须建立至少含三版本的矩阵：
`version/commit | extensionType | discovery/install | manifestVersion | permissions | enable/disable | configure | unload/update/uninstall | chatScope | hooks/tools | UI exposure | resourceLimits | status | sourceEvidence`。

严格查清：
1. 0.3.9 原“扩展”机制究竟是什么：内置清单/内置入口/动态加载/专有 UI 卡片；是否存在**正式公开、稳定的第三方 SDK**。无源码证据不能猜。
2. 0.4.0 与 0.3.9 的变化；不要把旧文“0.4.0 是最新”的历史快照当现状。
3. 0.4.1 ZIP Plugin API v2：`plugin.json` Schema、`index.mjs`/`setup(api)`、`registerTool`、`registerAction`、Chat/Tool 权限、启用和禁用、可见范围、负载/数量/超时/内存、配置与升级/卸载及数据保留。存在版本差异则引用源码。
4. 0.4.1 **标准 ZIP 插件与 DSH 插件格式不兼容**：画出两条独立运行路径，不提出直接将 DSH 插件改名 ZIP 的伪方案。
5. 只有 `package installed` 不足以判定`enabled`、`permissionsGranted`、`chatAllowed`、`hostReady`、`toolRegistered` 或 `taskAuthorized`；给可靠状态/错误映射。
6. 插件 Node Worker 是进程隔离而不是 OS 沙箱；限制自身 capabilities、allowlist、权限检查与供应链是否仍会暴露磁盘访问，需说明不把未经审核 ZIP 当成“一键安全安装”。
7. 文档/源码无法保证的“升级后支持”只记静态候选，不给出要求当前 Windows 用户升级的操作步骤或安装指令。

将关键结论分类 `SUPPORTED_BY_PINNED_SOURCE`、`INTERNAL_ONLY`、`UNSUPPORTED`、`UNKNOWN`、`NOT_INSTALLED`、`RUNTIME_UNVERIFIED`；不得将 public source capability 变成当前本机已验证。

## 6. 技术调研任务 B：会话身份、私聊群聊与最小权限

绘制至少两类**不包含真实用户 ID**的序列图：
- 纯文本 TTS：`已授权微信会话/DSH 意图→只创建 Whale Audio Core 任务→生成/试听/保存→用户额外同意→Whale Relay 一次投递`；
- 点歌：`自然语言想唱歌→可选曲名候选/来源确认→合法音频 Artifact→RVC 任务→试听/保存→独立授权交付`。搜歌元数据不能推定可以下载付费歌曲。

来源字段/权限矩阵必须逐层确定：
- v0.4.1 插件 `ctx.chat.key/kind/id`、`ctx.actor.id`、`sessionId` 的来源、命名空间、可信程度与泄露面；与旧 WeChatAgent Bridge、DSH Tool 接口/唯一任务 ID 不要直接等同。
- 稳定私聊、群聊身份与当前使用者本人/管理员/群权限、白名单数量和已验证实际授权**相互独立**。永远不能用昵称/群名当唯一 ID，不能用 `accountVerified`、401、alive pid 或健康检查当微信发送授权。
- 工具入口、发送开关、群聊发送、目标重新验证、取消/超时、权限撤销，区分申请创建任务、实际发送和 `SENT_LOCAL` / 微信服务端确认 / `UNKNOWN`。
- 用户没有配置 WeChatAgent 或正在使用 Whale Singing 离线试听：不能被登录/发送权限阻断；不要新增第二套聊天帐号读取或授权数据库。
- 若 DSH Tool 没有正式来源身份字段，列 `UNVERIFIED_ORIGIN` / 不能安全发送；不准在研究报告中发明安全的来源映射。
- 研究 v0.4.1 所谓 `reply` 的能力与实际语音/文件发送的区别：**API v2 开发规范明确没有任意文件/原生图片发送接口**；如想发 Whale Singing 音频，仍须另外审查鲸递/Voice Sender 路线，不可把文字 `reply` 冒充语音发送。

列出至少 12 项可信/不可信输入和“缺失/不明”时的 fail-closed 行为，例如恶意 displayName、ID 格式畸形、群私范围变化、切换账号、授权撤销、未升级宿主、Token 未读取、工具重复注册、插件取消、用户重复点击发送、UNKNOWN 消息等。

## 7. 技术调研任务 C：部署方案严格对比与唯一推荐

按“无需升级当前 0.3.9、保护已工作的 Windows 微信语音链”为最高兼容原则，比较三条路线：

**S1 首选：现有 DSH Whale Voice Plugin + `packages/adapter-wechatagent` 只读兼容层，未来 Whale Audio Core 接收受许可 DSH Tool 意图。** 基于已验证公开/源码可见能力，且不需要 0.4.1 升级；若具体 DSH Tool 注册尚未确证，建议下一计划继续查证，不在本轮实施。

**S2 条件可选：WeChatAgent 0.4.1 API v2 ZIP 插件作为额外聊天侧前端/命令入口，发送受限意图给 Whale Audio Core。** 必须解释 ZIP→Core 的安全适配、Host 特性/version/权限/聊天授权、进程安全、重复任务风险；**不能假装 DSH 插件即 ZIP，不能引入第二个 Core**，也不能默示这是当前首发必需组件。等待用户决定是否兼容更新版与未来研发授权。

**S3 禁止：把 AstrBot、私人 WeChat Hook、DLL 注入、WeChatAgent 内置私有 JS 直接移植或绕过会话授权。** 不作为可选实现路径。

输出对比列：`userSteps | 0.3.9Compatible | requiresUpgrade | APIStability | permissions | supportGroupPrivate | fileOrAudioSend | noGPUPreview | noviceInstall | safetyRisk | recommendation`。**目标选型先推荐 S1 安全、稳定、无额外升级路径；S2 可选兼容研究，除非公开证据显示 S1 不足才上报 ChatGPT 决策，不让 DS 自行改产品路线。**

## 8. Novice First · 中文操作草案（本轮只设计不实施）

未来普通用户不能理解 `SDK`、`Webhook`、`OneBot`、`Plugin API v2`。报告必须给出两套简体中文初次流程：
- **标准普通用户**：打开 DSH → 点击 Whale Voice 或 Whale Singing → 组件自动只读检查 → “当前未检测到微信连接/权限”仅禁用发送，不妨碍已有本地生成/预览/保存 → 用户在所属微信平台图形界面明确授权 → 点击“发送到已授权聊天”前再次确认对象与一次投递 → 查看可靠状态/失败恢复。
- **若未来启用新版插件目录**：在可用版本的 WeChatAgent “能力→能力目录”看到经审计的插件→查看来源/版本/权限→主动安装→主动启用/选聊天→回来 Whale Singing 操作。当前 0.3.9 中**不能显示不存在的 ZIP 插件安装路径或按钮**；绝不自动安装/升级/重启现有 WeChatAgent。

最少四种中文错误：
“需要先连接微信框架”；“这项权限尚未允许”；“当前宿主版本暂不支持该能力”；“发送结果尚未确认，请先核实聊天记录，不能自动重复发送”；
各给`原因/现在可点什么/允许继续哪些离线功能`。异常包括无联网、WeChatAgent 不存在、更新版本不兼容、外部插件 ZIP 非可信、私聊群聊权限变化、重复第一次进入、窄屏/键盘。

**DoD 限定**：只是静态产品流程设计，不表示当前八页 GUI 已有写入功能、0.4.1 已安装、真实微信发送已开放或 ZIP 插件已构建。跨 Voice/Singing 的首次依赖弹窗仍互相独立。

## 9. 原创 Fake 测试设计，不实际开发

提交 **≥15 个按场景编号的只读 Fake 测试种子**，覆盖：
01 0.3.9 没有新增 ZIP 接口时回退 S1；
02 0.4.1 仅装未启用；
03 工具权限授予但聊天未授权；
04 私聊允许群聊拒绝；
05 account 未验证；
06 401 auth_required 而不是健康绿灯；
07 昵称重复/stable ID 不明；
08 Tool id 冲突/撤销；
09 Plugin 加载超时/worker 终止；
10 权限中途撤销；
11 CANCEL_REQUESTED 与真实取消确认区分；
12 任务重复/单次投递去重；
13 UNKNOWN 不自动重发；
14 仅试听/保存无微信依赖；
15 0.4.1 reply 只能用于受权文本、不代表原生音频；
16 Fake SongID/版权未确认不自动下载；
17 CPU/noGPU 不冒充 SVC READY。
表格列`Case/input/expectedStatus/visibleZhText/failClosed/noExternalEffect/ownerPlan`。

**不得创建/注册真实 DSH Tool 或 ZIP 插件，不调用任何真实 WeChatAgent 消息 API。**

## 10. 推荐研究文件固定结构与证据标准

`docs/WECHATAGENT_EXTENSION_INTEGRATION.md` 须包含以下 12 节：
1. 日期、范围、main/PR 快照、三上游版本固定 SHA 与未安装声明；
2. 当前功能结论及推荐 S1、S2 条件、S3 禁止；
3. API 证据索引（不少于 12 条固定文件/commit/行号链接）；
4. 0.3.9/0.4.0/0.4.1 扩展机制与 API v2 生命周期矩阵；
5. DSH Plugin 与 WeChatAgent ZIP Plugin 的格式、职责、边界；
6. 身份/来源/私群权限/账号切换/授权撤销矩阵；
7. Whale Audio Core / Whale Relay / Voice Sender/WeChatAgent 原接口映射与信任边界图；
8. 版本升级、许可、Token、子进程安全与公网风险；
9. 标准 S1 / 可选 S2 / 禁止 S3 方案对比和静态阻塞；
10. Novice First 中文首次使用与四种错误恢复；
11. ≥15 Fake 负向案例及下游 Plan 05/08/09/12/13 对应变更建议；
12. Git/CI、测试 NOT_RUN、UNKNOWN 清单、STOP 条件和唯一结论。

每个已确认行为应引`upstreamVersion@SHA / file / #Lstart-Lend / evidenceType`；无来源标 UNKNOWN，不能用旧 0.3.9 报告推断 0.4.1 实际行为，也不能用 0.4.1 公共来源宣称用户已升级。

## 11. 分级结论和不可改变的决策树

| 发现 | 唯一处理 | 硬停止 |
|---|---|---|
| 0.3.9 没有受支持 ZIP API | 标旧版本 `UNSUPPORTED`，S1 继续为默认，S2 仅 0.4.1 候选 | 不升级 |
| 0.4.1 API v2 真实存在 | 固定源码与权限边界，附条件可选 S2；不改现有插件 | 不安装 ZIP |
| 0.4.1 Plugin 提供 `reply` | 仅当源码有据且权限允许时算文本回复能力 | 不当音频/文件直接发送 |
| v0.4.1 不是 OS 沙箱 | 明确信任和安装审计风险、推荐仅受信任来源 | 不执行第三方 ZIP |
| 账号/聊天/来源 ID 不可认证 | 标 UNKNOWN / DENY_SEND，允许离线操作 | 不猜会话、不泄露私密 |
| 官方无稳定扩展注册点 | 使用 S1 DSH Plugin/Adapter；官方确认或新接口另审 | 不注入私有实现 |
| 上游带 native Hook / 新补丁 | 只记录官方书面事实和 License | 不使用 Native Hook |
| 用户未授权 Merge/升级/发送 | 文档研究继续，工程和生产 STOP | 绝不扩大权限 |

报告的唯一建议结论：
`RECOMMEND_DSH_ADAPTER_AND_OPTIONAL_V041_PLUGIN_AUDIT`
或如关键公开证据无法可靠证明：
`BLOCKED_EXTENSION_EVIDENCE`。

前者只批准 ChatGPT 后续考虑 Plan 05 的契约/FAKE 设计任务，不是批准真实新版 ZIP 插件、RVC、微信消息或生产配置写入。

## 12. 执行顺序（一步不漏）

1. 只读核对 main、PR #16–#19 HEAD、reviews/CI、是否已存在研究报告与 worktree 未提交内容。
2. 读最新规划和已有 Whale Voice main 的 read-only Adapter、WeChatAgent 兼容、安全交付与配置职责合同，绘制准确事实表。
3. 在 GitHub **固定三版本 tag→commit**，核验 API v2 插件文档/许可与源码，无需下载 ZIP/模型/可执行文件。
4. 完成版本与 `DSH-Plugin≠WeChatAgent-ZIP` 的分层能力/格式/风险矩阵。
5. 完成身份/私群/账号/权限撤销/取消/回执与一次投递的安全矩阵。
6. 完成 S1/S2/S3 的唯一推荐选型，标真实无法证实或不支持的场景。
7. 编写小白中文首次体验与错误恢复以及 ≥15 个未来 Fake 测试种子。
8. 仅在 `research/plan04-wechatagent-extension-audit` 新建/更新 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md`；不碰旧任务 docs/plan 或工程文件。
9. 文档 UTF-8/固定引用有效性/隐私 scan/`git diff --check`；可选已有只读 doc integrity，不能临时安装新依赖；记下 NOT_RUN。
10. 创建独立 docs-only PR，检查相对最新 main 仍只 1 个研究 Markdown，核实最终 HEAD 自己的 CI；如果 CI 尚排队按事实报告，不宣称 Success。
11. **停止**，不合并、不自动开始 Plan 05/07-B、不下载/升级/发送。

## 13. A01–A15 验收矩阵

| ID | 必须有的研究证据 |
|---|---|
| A01 | main、#16–#19 HEAD、review/CI、PR 状态实时核验，不把研究成功当合并批准 |
| A02 | WeChatAgent 0.3.9/0.4.0/0.4.1 三个 tag→Commit SHA 固定 |
| A03 | 官方 API v2 ZIP 规范及 ≥12 证据定位、许可/来源状态真实 |
| A04 | 明确 DSH Plugin 与 WeChatAgent ZIP Plugin 不兼容、不能直接转换 |
| A05 | 0.3.9/0.4.0/0.4.1 扩展/Tool/生命周期版本矩阵，事实与 UNKNOWN 分离 |
| A06 | 插件权限、聊天范围、授权撤销、取消、Host 准入、隔离风险完整 |
| A07 | 来源/稳定身份与私群、昵称/目标区分、缺授权时 fail closed |
| A08 | WeChatAgent 不执行音频推理，Whale Audio/Relay/Voice Sender 责任边界和 UNKNOWN 不重发 |
| A09 | S1/S2/S3 方案对比，唯一推荐保留 0.3.9 当前稳定语音链 |
| A10 | 提及音频/文件发送能力必须有源码证据，不得把 `reply` 当音频 API |
| A11 | Novice First 中文两条流程、四条恢复、无需最终用户命令行、现阶段真实功能限制 |
| A12 | ≥15 个 Fake 正负测试设计，未来责任 Plan 映射，不执行生产 |
| A13 | docs-only 1 文件，所有 Git 差异、密钥/个人信息扫描真实 |
| A14 | 最新 PR HEAD CI 与本地 NOT_RUN 区分、未执行安装模型/升级/微信 |
| A15 | 单一结论与 Stop，保留 Plan 03-B 合并权限与 Plan 01–14 编号 |

**不适用**：插件真实 ZIP 打包/安装、微信群真正发语音、真实 0.4.1 升级与 Windows/DSH 真实重启、真实音频/模型和 GUI 安装测试：`NOT_RUN/OUT_OF_SCOPE`；不能当通过。

## 14. 最终 DeepSeek 报告固定格式

《Plan 04-A · WeChatAgent 扩展能力与权限审计报告》至少包含：
1. research 分支/新文档 PR、main/base/head、文件 diff、reviews、CI；
2. WeChatAgent v0.3.9/0.4.0/0.4.1 版本/时间/固定 SHA、关键 API v2 源证据；
3. S1/S2/S3 与最终部署选型（不触碰现有实际安装）；
4. DSH 与 ZIP 接口不同点、插件状态与 Token/权限/聊天范围、信任边界；
5. Whale Audio/Relay/Voice Sender 原链维持、安全发送与回执状态；
6. 可迁移到未来双页面的普通用户中文流程/4 条恢复；
7. ≥15 个 Fake 场景与后续 Plan 05/08/09/12/13 责任归属；
8. A01–A15 各项 PASS/FAIL/BLOCKED/证据链接；
9. 文档检查与 run/NOT_RUN、Git/CI 真实事实；
10. 未决的版本、安装器、权限、音频发送与许可证风险；
11. 单一 `RECOMMEND_DSH_ADAPTER_AND_OPTIONAL_V041_PLUGIN_AUDIT` 或 `BLOCKED_EXTENSION_EVIDENCE` 结论；
12. 未启动或重启任何生产服务、未读取密钥/聊天、未安装 ZIP/模型/二进制、未调用微信、未合并任何 PR 的声明。**结束后立即停止**。

## 15. Hard-stop 与用户责任

发生以下情况必须停止影响步骤并如实报告：研究必须升级真实 WeChatAgent 才能得到答案、需要读取实际聊天 Token/白名单/私有数据库、需要 ZIP 安装后才有可确定协议、上游含不透明 Hook/DLL、现有合同和公开源码矛盾且需运行验证、对外发送/回复才可验证、主分支出现非预期工作区修改、PR 无法只含研究文档、需要启动任何收费/生产/微信操作。绝不为让小白容易使用而静默越过本人授权或安装未知二进制。

**DSH 对话交接提醒**：Plan 07-A 研究已通过后建议使用新的 DS 对话执行 04-A；用户可直接贴本文件的派发指令并让 DS 先读取 AGENTS.md 和本任务书。研究结束后不要自行发起 05 或 07-B，后续由 ChatGPT 审查并给下一份详细任务书。
