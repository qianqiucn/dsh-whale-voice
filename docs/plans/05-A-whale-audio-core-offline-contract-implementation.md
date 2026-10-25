# Plan 05 · 05-A Whale Audio Core 统一任务 / 双功能依赖 / Relay 边界纯契约（Level 2 工程任务书）

**任务版本：v1.0 · 2026-10-25。原 Plan 05 内 05-A 子阶段；不新增 Plan 15，不更换原 Plan 01–14 编号。**  
**派发状态：SENT（本任务书供用户直接转发 DeepSeek）；实施等级：OFFLINE / PURE-CONTRACT / FAKE-TEST；验收身份：ChatGPT。**  
**DeepSeek 在独立功能分支提交原创纯模块、离线单测和文档 PR；不得合并、部署、注册 Host 或改变任何生产行为。**  
**本轮目标是推进工程，而不是重复 Plan 04/07 的研究：至少实现 3 个真实可测试的纯函数模块和 ≥40 个自动化离线用例。**

## 1. 用户目标与阶段边界

Whale Voice · 语音气泡与 Whale Singing · 唱歌以后共享 **Whale Audio Core（鲸音核心）** 的任务、VoiceProfile 身份、Artifact 引用和依赖决策。Whale Relay Core（鲸递）只消费将来**另行授权**的已验证音频和可信目标；WeChatAgent 仍持有微信账号、会话与目标授权。现有 Windows Voice Sender 的 UI Automation 发送链一行也不能改变。

**此次交付后用户不会看到新增的可运行前端页面或真实语音/唱歌。** 本阶段是纯合同 + 自动化测试的 **OFFLINE** 前置件，给 Plan 05-B/06/07-B/08/09/13 提供稳定边界。不能标 INTEGRATED、可安装、可发送或真实 GPU 验证。

本阶段有三个必须实现的独立纯能力：
1. **CoreTask v1**：TTS、SVC 统一任务入参、Opaque 引用、任务状态、取消与“生成/保存”边界，不处理推理本身。
2. **FeatureDependencyManifest v1**：Voice/Singing 的独立依赖清单和只读状态推断，首发 Singing 只考虑 RVC，Seed-VC 后续可选且 NOT_READY。
3. **RelayHandoffCandidate v1**：仅生成**显式不可提交的候选描述**供后续 Plan 13 设计检查，**绝不触发或假定微信授权**。这一层没有发送目标、发送 HTTP、队列消费者。

另外必须提交普通用户中文状态映射和“如何未来实现无命令行首访”的文档，不能用 Fake 测试冒充正式用户体验完成。

## 2. 先核对当前真实 GitHub 状态（快照不是永远的 HEAD）

ChatGPT 核验时：
- `main@bf9cf66807e12d0b25872a0fa3869962dde04818`；
- PR #16：`OPEN` / 未合并，HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`，CI `40165832178` SUCCESS、Reviews 0。里面的 `core/tts/**`、`core/svc/**` 仍为 **DESIGN/OFFLINE**，**不在 main**；Plan 03-B = **WAIT_USER_AUTHORIZATION**。
- PR #17：`docs/whale-voice-execution-plan-registry` 是规划权威，**只读此任务书**；不得由 DS 更改 `docs/plans/**`。
- PR #18：Draft 历史重复条目，不需任何改动。
- PR #19：`docs/SVC_PROVIDER_RESEARCH.md` 研究 PR `OPEN` @ `e21dee8`；07-A/F01 的静态研究已验收 DONE，不等于已合并。
- PR #20：`docs/WECHATAGENT_EXTENSION_INTEGRATION.md` 研究 PR `OPEN` @ `6007fec`，CI `40233344202` SUCCESS；04-A 静态研究 DONE，不等于已合并。
- **当前 main 尚无 `core/audio/`，也没有 `test/audio-core-contract.test.mjs`。** 执行前重查；发现已有人实施时停止新建重复工程，报告差异由 ChatGPT 决定复用。
- 先前实测 DSH/WeChatAgent 0.3.9、Windows WeChat 4.1.10.27 只是历史基线；不得在本轮探测或修改用户安装。
- `sourcepro5/WeChatAgent` 已发布 v0.4.1 ZIP API v2，但不兼容 DSH 插件。Plan 04-A 推荐 **S1：DSH Plugin + 现有只读 WeChatAgent Adapter**；S2 ZIP 仅可选研究，S3 Hook/DLL 禁止。本轮不引入任何 ZIP Plugin/SDK。

**若 main 在 DS 实际执行前变更，必须先分析新增代码是否覆盖本任务；不得为了维持旧 SHAs 强行 reset/rebase 已更改的 main。若 #16 已通过另行用户授权合并，先报告该重大差异，本任务不得自行消解合并冲突。**

## 3. 必须阅读的规范与源文件

**权威规划分支只读**：`AGENTS.md`、`EXECUTION_STANDARD.md`、`docs/plans/README.md`、本 05-A Level 2、`docs/plans/05-unified-core-a.md`、`docs/plans/06-provider-core-b.md`、`docs/plans/08-shared-core-c-voice-audio-tasks.md`、`docs/plans/09-phase4b2b2b-config-ux.md`、`docs/plans/13-whale-relay-a-b-c.md`、`docs/plans/WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md`、`docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md`、`docs/plans/TASK_SPEC_STANDARD.md`。

**main 真正已存在的代码，先读后判断如何复用**：
- `core/config-schema.mjs` 的状态与 Schema 检查方式；`core/config-coordinator.mjs` 的 **SAVED vs APPLIED**、隔离测试/未知状态约束。
- `core/capabilities.mjs`（CAPABILITY_SCHEMA_VERSION=3，READ_ONLY）、`core/detect.mjs`（只读组件检测；目前仅 wechatagent/sender/qwen）。
- `packages/adapter-wechatagent/index.mjs` 只读健康/版本，`index.js` 只 GET 的 Host 路由；不要增加入口。
- `test/core.test.mjs`、`test/config-capability-schema.test.mjs` 与现有测试风格；`package.json` 的 `node --test`、`npm run test:ui`。
- 未合并 PR #16 中的 `core/svc/svc-contract.mjs`、`core/tts/provider-contract.mjs`、相关纯 Registry/测试，只读对齐字段和错误码；不可复制、导入或更改 #16。
- PR #19 `docs/SVC_PROVIDER_RESEARCH.md` 中的三层（CoverTask 草稿/SVC v1/Fake）、代码复用 BLOCKED；PR #20 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md` 的 S1/来源权限未验证结论。

**无代码依赖/包需要新增**。使用 Node ≥22.13 自带 `node:test` / `node:assert/strict`；绝不因测试下载工具、依赖或模型。

## 4. 本轮唯一允许改动的工程文件

从最新 main **新建独立分支**：`feature/plan05a-whale-audio-core-contracts`（若分支名冲突，验证是否已有任务 PR，不覆盖；冲突则停止/报告）。

只允许**新增**：
1. `core/audio/task-contract.mjs`：纯 CoreTask 验证、初始化、状态转换/脱敏投影。
2. `core/audio/feature-manifest.mjs`：Voice/Singing 的纯依赖清单及就绪投影。
3. `core/audio/relay-handoff.mjs`：不可提交的 Relay 候选纯合同。
4. `test/audio-core-contract.test.mjs`：≥40 个 Node 纯离线测试。
5. `docs/WHALE_AUDIO_CORE_CONTRACT.md`：签名、Schema、错误、状态机、未来映射、回退与 Novice First。

**禁止修改**：`index.js`、`core/server.mjs`、`core/detect.mjs`、`core/capabilities.mjs`、`core/config*.mjs`、`core/isolated-write-server.mjs`、`pages.js`、`setup.js`、`client*.js`、`package.json`、`test/core.test.mjs`、`docs/plans/**`，以及 PR #16/#17/#19/#20 的任意代码或研究报告。无第三方 vendor、脚本、Windows installer、WeChatAgent Plugin ZIP。若必须更改其他文件才能构建，则STOP并提出最小必要变更请求，不能擅自扩大范围。

纯模块**只能 import 其他本任务的纯模块**或不 import，禁止 `fs/http/net/https/child_process/worker_threads/process.env/fetch/URL`、`Date.now`、`crypto/randomUUID`、事件循环定时器、文件路径和真实配置。所有时间/ID 由测试/未来受信任调用者注入，不负责分配持久唯一 ID。**拒绝任意真实音频 bytes、私聊/群 ID、Token、外部 URL、绝对文件路径和任何发送指令。**

## 5. 模块 A：`task-contract.mjs` 精确接口

### 5.1 导出和通用错误

固定导出：
- `AUDIO_TASK_SCHEMA_VERSION = 1`
- `AUDIO_TASK_STATES`（Object.freeze）
- `validateAudioTaskDraft(draft)`
- `createAudioTaskRecord(draft, metadata)`
- `transitionAudioTask(record, action)`
- `projectAudioTask(record)`

所有验证函数**不 throw 由用户数据造成的错误**；返回 `{ok:true,value}` 或 `{ok:false,errors:[{code,path,reason}]}`。统一错误枚举（冻结）：
`AUDIO_INVALID_REQUEST`、`AUDIO_INVALID_ID`、`AUDIO_UNKNOWN_FIELD`、`AUDIO_TYPE_MISMATCH`、`AUDIO_STATE_CONFLICT`、`AUDIO_RIGHTS_UNCONFIRMED`、`AUDIO_DELIVERY_FORBIDDEN`、`AUDIO_ARTIFACT_REQUIRED`。函数签名/错误码在文档中相同；不得使用机器路径/Token 值组成错误字符串。

### 5.2 输入格式 `AudioTaskDraft v1`

必须是无原型行为依赖的普通 JSON object，无继承字段参与校验，拒绝数组、函数、循环引用（返回验证错误，不要无限递归）。**仅允许以下顶层键**：
- `schemaVersion`：必须整数 1；
- `taskId`：必填，`task:` 后接 1–64 个 [A-Za-z0-9_-]，例如 `task:demo-01`；由未来 Core owner 分配，本阶段接受并校验，绝不能声明自身保证全局唯一；
- `feature`：必填 `voice-bubbles` 或 `singing`；
- `taskType`：必填 `TTS` 或 `SVC`；voice-bubbles 必须 TTS，singing 必须 SVC；
- `source`：必填 JSON object，严格二选一：`{kind:"TEXT_REF",ref:"artifact:text-fixture-01"}`（TTS）/ `{kind:"AUDIO_REF",ref:"artifact:vocal-fixture-01"}`（SVC）；`ref` 仅允许 `artifact:` + 1–64 字母数字/下划线/连字符；**不能直接放文字、URL、SongID、文件路径或字节**；
- `voiceProfileId`：必填，`voice:` + 1–64 安全字符；表示共享音色库中**不透明的角色/资产引用**，不是 RVC 模型文件名；后续 Plan 08 必须提供实际映射才可推理。
- `deliveryRequested`：可选 boolean，默认 `false`。它**只是将来用户意图候选，不证明已确认/可发送**。不得接受目标聊天 ID、后端选择、WeChat/Token、发送参数。
- `rights`：必填，仅 `{state:"CONFIRMED_FIXTURE"}` 或 `{state:"UNVERIFIED"}`；`CONFIRMED_FIXTURE` 只用于本次**预置伪音频/文本**，**绝不表示用户真实授权或自动可运行**；`UNVERIFIED` 允许初始化为 `BLOCKED_RIGHTS`，不得走处理。禁止由输入自己提升真实媒体 rights 成为 “已授权可用”。真实权限契约归 Plan 08/12/13。

验证返回标准化、深度新拷贝的 `value`，不保留外部输入对象引用；输入键名如 `send`、`wechat`、`targetChatId`、`token`、`apiKey`、`recipient`、`providerId`、`params`、`songId` 或其他未知字段全部拒绝（不能默默 drop）。

### 5.3 实例化与状态机

`createAudioTaskRecord(draft, metadata)`：先调用 validate，`metadata` 只接受 `{observedAt:string}`，格式必须可解析为合法 UTC RFC3339 timestamp（例如 `2026-10-25T12:00:00.000Z`）；为了纯净，**禁止自动生成当前时间**。返回 `{ok:true,value:record}`，record 带 validated draft 字段 + `state`：
- rights `UNVERIFIED` → `BLOCKED_RIGHTS`；
- fixture rights → `CREATED`；
- `outputArtifactRef:null`；
- `cancel:{requested:false,confirmed:false}`；
- `delivery:{state:"NOT_REQUESTED",deliveryId:null}`；
- `lastError:null`；
- `observedAt` 保留注入值；
- `mockOnly:true`、`realOperationAllowed:false` 固定不可通过输入覆盖。

Task状态常量至少包含 `CREATED`、`BLOCKED_RIGHTS`、`PROCESSING`、`ARTIFACT_READY`、`SAVED`、`CANCEL_REQUESTED`、`CANCELLED`、`FAILED`、`UNKNOWN`；`APPLIED` 是**配置生效状态**，不是音频任务的“已保存”；`SENT_LOCAL` 是**Relay** 状态，不得出现在 AudioTask.state。

`transitionAudioTask(record, action)` 的 `action` 只能：
- `{type:"BEGIN_PROCESS"}`：CREATED→PROCESSING，其他拒绝。只是 Fake 状态推进，不运行 Provider。
- `{type:"ATTACH_FAKE_ARTIFACT",artifactRef:"artifact:..."}`：PROCESSING→ARTIFACT_READY，严格检查 ref；如无合法 rights / 已取消拒绝。
- `{type:"MARK_SAVED"}`：ARTIFACT_READY→SAVED；必须已有 Artifact，**SAVED 不意味着 APPLIED/发送**。
- `{type:"REQUEST_CANCEL"}`：CREATED/PROCESSING/ARTIFACT_READY→CANCEL_REQUESTED，`cancel.requested=true`；不宣称已停止运行的任务。
- `{type:"CONFIRM_CANCEL"}`：CANCEL_REQUESTED→CANCELLED，`cancel.confirmed=true`，仅 Fake 手动模拟确认。
- `{type:"FAIL",code:"AUDIO_..."}`：CREATED/PROCESSING/ARTIFACT_READY/CANCEL_REQUESTED→FAILED，code 只允许预定义公开安全值（如 `AUDIO_FAKE_FAILURE`）；不可携带错误堆栈/路径/用户消息。
- `{type:"MARK_UNKNOWN"}`：PROCESSING/CANCEL_REQUESTED→UNKNOWN，**终止自动推进和重试**，需要以后独立的人工恢复契约。
- 其他动作/非法转移/任意发送动作、同一个事件重复提交全部 `AUDIO_STATE_CONFLICT` 或 `AUDIO_UNKNOWN_FIELD`；终态 `SAVED/CANCELLED/FAILED/UNKNOWN` 无自动恢复、无自动发送。

每次转移必须返回**深度新拷贝，不修改传入 record**；来源 record 必须先结构校验并拒绝伪造已发送状态、改变 `mockOnly/realOperationAllowed`、额外敏感字段。纯合同不做进程取消的虚假承诺。

`projectAudioTask(record)` 面向未来 UI 的**白名单脱敏投影**，只输出 `schemaVersion/taskId/feature/taskType/state/voiceProfileId/hasInput/hasOutput/cancelRequested/cancelConfirmed/deliveryRequested/mockOnly/realOperationAllowed/userMessageZh`。不得输出 `source.ref`、`artifactRef`、`rights`、任意 Token/身份/路径；`userMessageZh` 用固定查表映射，不拼接输入文字。Fake 全程显示“演示状态，尚未接入真实生成”。

## 6. 模块 B：`feature-manifest.mjs` 精确接口

固定导出：
- `FEATURE_MANIFEST_SCHEMA_VERSION = 1`
- `listFeatureDependencies(feature)`
- `projectFeatureAvailability(feature, observations)`
- `evaluateFirstUse(feature, acknowledgedByFeature, manifestRevision)`

**静态唯一两个 feature**：`voice-bubbles`（TTS）及 `singing`（SVC），互不继承“首次完成”标记。依赖对象只能由**冻结的内置定义**生成，普通传参不能注入新组件名、下载 URL、命令行或权限指令。

`listFeatureDependencies("voice-bubbles")`：
- `audio-core` REQUIRED，描述“音频任务与状态”；
- `tts-selected` REQUIRED/CONDITIONAL（随所选方案决定，但默认没有已验证真实模型），“选择一种语音生成方式”；
- `voice-profile` REQUIRED，“选择合法音色”；
- `preview-save` REQUIRED，“试听与保存”；
- `wechatagent`、`whale-relay`、`voice-sender` 均 DELIVERY_ONLY（**仅选择发送才需要**）。

`listFeatureDependencies("singing")`：
- `audio-core` REQUIRED；
- `rvc-gateway` REQUIRED（真实 RVC 才会需要，当前 NOT_READY）；
- `rvc-voice-model` REQUIRED（需合法音色资产）；
- `source-rights` REQUIRED（合法本地已授权音频）；
- `separator` CONDITIONAL（已是纯人声可跳过，不等于该组件可用）；
- `mixer-encoder` CONDITIONAL（按输出格式需要）；
- `preview-save` REQUIRED；
- `wechatagent`、`whale-relay`、`voice-sender` DELIVERY_ONLY；
- `seed-vc` OPTIONAL / NOT_READY / notDefault / noAutoInstall，中文描述“后续免训练试唱（暂不支持）”；**不能进入 RVC 首发必需集合**。

每个定义只包含 `id/labelZh/purposeZh/requirement/implemented`（implemented=false 代表这份离线合同不具有真实运行能力，部分 Core 客户端已有读状态但不意味着它作为新 Core 已完成）。数组排序固定，禁止重名，调用者改变返回数据不得污染后续读取（冻结或克隆）。

`projectFeatureAvailability(feature, observations)`：`observations` 必须是普通对象，允许键只能为该 feature 的组件 id，各值只接受 `"VERIFIED"|"MISSING"|"UNKNOWN"|"BLOCKED"`；无提供则 UNKNOWN。**本阶段输入是 Fake 观察，不允许推定真实 VERIFY**。输出：
`{feature,mode:"MOCK_ONLY",realReady:false,missingRequired:[...],unknownRequired:[...],blockedRequired:[...],deliveryRequired:[...],optionalUnavailable:[...],userMessageZh}`。
- 即使全部 observations 显示 VERIFIED，`mode` 仍 MOCK_ONLY、`realReady=false`；只用来设计“将来如何检查”。
- 微信/Relay/Sender 缺失不算生成/试听/保存缺陷，只影响未来可选发送；在本阶段永远不能授予发送权限。
- `singing` 对 `seed-vc` VERIFED **也不能**提升实际 READY（静态定义 NOT_READY）。
- 组件未知/失效以中文“需要检查/尚未支持”说明，不显示绿色“已成功生成”，不得展示虚构安装进度。

`evaluateFirstUse(feature, acknowledgedByFeature, manifestRevision)`：`acknowledgedByFeature` 只允许 `{"voice-bubbles":string|null,"singing":string|null}`；`manifestRevision` 为调用者传入的非空安全版本标记（1–64 字母数字/._-）。输出 `{feature,showDialog,reason,readOnly:true}`；该 feature 记录的版本 == manifestRevision 才免二次弹窗；另一 feature 的记录不能使它免弹窗，manifest 变更需要重新提示。**纯函数不持久化用户确认，也不能假装安装已完成**。遗漏/无效版本/多余字段 fail closed 返回结构化 error。

## 7. 模块 C：`relay-handoff.mjs` 精确接口

固定导出：`RELAY_CANDIDATE_SCHEMA_VERSION = 1`、`buildRelayHandoffCandidate(taskRecord, deliveryId)`。

前置：仅 `taskRecord.state==="SAVED"`，输出 artifact ref 合法，且 draft `deliveryRequested===true` 时，才能生成纯**审阅候选**。`deliveryId` 由未来 Core owner 从外部传入，格式 `delivery:` + 1–64 安全字符；不得在这里随机生成/伪造真实授权。`deliveryId` 必须与 `taskId` 不同。**不能根据单个记录证明全局唯一或真正投递幂等；后续 Plan 13 必须持久唯一索引。**

成功返回：
`{ok:true,value:{schemaVersion:1,taskId,deliveryId,artifactRef,stage:"PROPOSED_NOT_AUTHORIZED",mockOnly:true,submitAllowed:false,targetVerified:false,authorizationVerified:false,backendSelected:false}}`。
该结构**不含** `targetId/chatId/targetName/token/backend/URL/path/sendMessage`，不是 WeChatAgent / Voice Sender 参数，不能被 Runner 消费。真实 Relay 的送达、幂等、目标复核和发送状态属于 **Plan 13-A**，本模块仅提供责任边界哨兵。

输入只要 `UNVERIFIED_RIGHTS`、没有 output、未保存、未请求 delivery、cancel/UNKNOWN、伪造 sent 字段、deliveryId 畸形等立即返回 `AUDIO_DELIVERY_FORBIDDEN`/其他预定义错误。不可假装 `SAVED` 自动允许发送。

## 8. 兼容和回退严格约束

- **绝不导入、复制或修改尚未合并的 PR #16 TTS/SVC v1**。`taskType=SVC` 的未来映射记录在文档：Core 的 `voiceProfileId` 不直接等于 `targetVoiceId`；需 Plan 08 明确共享 VoiceProfile → SVC 目标音色映射。`source.ref` 是 Core opaque AudioRef，后续 v1 可以映射 `sourceAudioRef`；`params.pitchShift` 等不在本阶段实现。Plan 05-A 产出的 TaskDraft **不应直接传给 `validateSvcRequest()`**，未来必须有版本化适配器。
- 保留 `dsh-whale-voice` 插件包名、`whale-v1` 既有 Qwen TTS profile、`index.js` GET Host、原八页 GUI、SetupWizard、组件列表、Bridge/Worker 双闸门。不能把现有运行中的 Whale Voice Core 重命名成破坏性服务迁移。
- 配置 `SAVED` 不是 `APPLIED`；在纯 Audio Task 上 `SAVED` 只是 Fake Artifact 保存阶段，**两种语义以不同 namespace 区分**；不能把 `SAVED` 当发送许可。
- 真实 TTS/SVC 模型、音色文件的许可/对应、明码正文/歌曲、云端凭据、真实微信目标、窗口设备和 native-hook **全部不属于本任务任何函数的输入与副作用**。
- Plan 06 Provider Registry、Plan 07-B Fake Gateway、Plan 08 音色/Task 持久化、Plan 09 双真实页面、Plan 13-A Relay 幂等/后端路由、Plan 14 Installer 都以此为纯前置，绝不提前实现它们的外部 I/O。

## 9. 自动测试最低矩阵（≥40 个 `node:test`，必须真的运行）

按以下 ID 命名用例（可以细分增加，不能删掉关键负向；纯函数应可快速确定运行）：

**CoreTask T01–T20**：
T01 TTS 基础 draft；T02 SVC 基础 draft；T03 feature/taskType 交叉拒绝；T04 未知字段；T05 token/wechat/send/target 字段拒绝；T06 URL 代替 ref 拒绝；T07 Windows 绝对路径拒绝；T08 缺 source；T09 source.kind 不匹配；T10 模型名当 voiceId 拒绝；T11 非对象/数组；T12 schema 版本变化；T13 fixture rights CREATED；T14 UNVERIFIED BLOCKED_RIGHTS；T15 valid BEGIN_PROCESS；T16 attach fake artifact；T17 MARK_SAVED；T18 没有音频不能保存；T19 被取消/未知不可推进；T20 record/action 输入与输出无共享可修改对象。

**Task state/cancel T21–T28**：
T21 CREATED 取消申请；T22 取消请求≠取消确认；T23 CONFIRM_CANCEL 测试；T24 非法取消确认；T25 PROCESSING→UNKNOWN 后不自动重试；T26 SAVED 是终态且≠ APPLIED/SENT_LOCAL；T27 外部输入伪造 realOperationAllowed:true 拒绝；T28 projection 仅白名单并给中文 Mock 状态，不暴露源 ref。

**依赖/首次向导 F01–F14**：
F01 Voice required/optional/delivery 分类；F02 Singing RVC 必需集合；F03 Seed-VC 后续 OPTIONAL NOT_READY；F04 Singing 不接受未登记的组件键（包括虚构的第二账号/另一聊天平台组件）；F05 缺 WeChatAgent 仍显示本地生成相关状态；F06 缺 Core = 不 ready；F07 unknown 模型 = UNKNOWN；F08 无 GPU/资源未证 = UNKNOWN；F09 全 Fake VERIFIED 仍 realReady:false；F10 Manifest list 并发读取不共享可变数组；F11 Voice 首次进入显示 Dialog；F12 Voice 已确认/Singing 未确认仍分别弹窗；F13 manifestRevision 更新重新提示；F14 非法 acknowledge/未知 feature 返回 error。

**Relay候选 R01–R10**：
R01 SAVED + request + 已存在 fake artifact → 候选但 submitAllowed=false；R02 SAVED 无 deliveryRequested 拒绝；R03 CREATED 拒绝；R04 UNKNOWN 拒绝；R05 CANCELLED 拒绝；R06 不合法 deliveryId 拒绝；R07 无任何可提取 target/Token/URL/后台字段；R08 没有自动 Queue/HTTP 或自动重试；R09 deliverId 与 taskId 均外部注入，模块不生成唯一 ID；R10 多次调用是确定的纯数据结果，无法触发真实提交。

≥52 个基础案例优先；**最低 ≥40 且 T01–T28/F01–F14/R01–R10 的每条安全意图都要测试**。禁止以人工 Markdown 表代替自动化测试。全部 Fake fixtures 只能使用 `artifact:fixture-...`、`voice:fixture-...`、`task:fixture-...`；不得导入用户声线、微信联系人或实际音频。

执行命令（仅本 repo 已安装 Node/依赖，缺失不能 npm install）：
- `node --test test/audio-core-contract.test.mjs` 必须全 PASS；
- `node --test` 必须无新失败；既有 platform SKIP 可如实记录；
- `node build.mjs` 必须 PASS 且生成 `client.js` 不产生差异；
- 如果 Playwright UI 环境**已完整存在且无需安装**，执行 `npm run test:ui`；否则写 `NOT_RUN / environment not prepared`，**不以此否定离线任务，但必须确保不修改 UI 代码**；
- `git diff --check`、秘密/隐私静态扫描、只读文件改动范围验证都必须通过。

## 10. 关键安全与负向边界（封闭决策树）

| 遇到的情况 | 唯一处理 | 禁止 |
|---|---|---|
| 需要从 PR #16 复制/导入 SVC v1 才能跑代码 | 记录 PLAN05_DEPENDS_ON_MERGE，保持本阶段独立纯字段，停有冲突的步骤 | 不 cherry-pick/merge |
| 已有人在 main 建 core/audio 任务模块 | 报告冲突并停止复写相同路径 | 不覆盖或重复 PR |
| Fake Task request 带非允许字段、真实目标或密钥 | INVALID / FAIL CLOSED | 不过滤后继续“成功” |
| 要为目标授权读取 WeChatAgent 私人名单/聊天 | 不实现，仅返回没有授权证据；后续 Plan13 再审 | 不读用户私密 |
| Seed-VC 后续模式被测试 Fake 标 VERIFIED | 输出 NOT_READY、realReady=false | 不标可安装 |
| 确认取消但没有进程运行证据 | 仅 Fake CANCELLED，不冒充真实进程 | 不kill/restart |
| UI/Host 才能达到某种可用性 | 在报告登记 Plan09/14 依赖 | 不临时挂生产路由 |
| 任何发送结果为 UNKNOWN | 后续真实投递必须人工核验，无自动重试 | 不自动换路由 |
| test:ui 依赖未准备 | NOT_RUN 如实报告，其他测试继续 | 不 npm install |
| 模型/音频/ZIP 许可缺失 | 不导入、不下载，保持 UNKNOWN | 不借用许可证不明资源 |

## 11. Novice First · 面向完全不会代码的用户的强制验收

本阶段没有新前端，Novice First **验收的是将来的 GUI 能否基于这套纯合同做正确状态展示**，而不是当下用户已能实际点击完成。

`docs/WHALE_AUDIO_CORE_CONTRACT.md` 必须用简体中文交付：
1. Voice/Singing 两个独立首访故事板（“检查→选模式→查看必需/可选→稍后再说→试听/保存→选择发送才要求微信”）；两者共享 Core 但不共用首访标记。
2. Singing RVC 标准翻唱与 Seed-VC “后续试唱（暂不支持）”的准确标签；不能向无 GPU 用户谎称 CPU Seed-VC 可用。
3. 至少 5 种实际给普通用户看的状态说明：`BLOCKED_RIGHTS`、`UNKNOWN_REQUIRED_DEPENDENCY`、`MODEL_NOT_READY`、`CANCEL_REQUESTED`、`MOCK_ONLY`、`DELIVERY_NOT_AUTHORIZED`；标“模拟/尚未真实支持”，别给开发者错误堆栈。
4. 三个错误恢复：“缺少需要的组件→重新检查/以后再说”，“尚未有权使用目标音色/歌曲→更换合法材料”，“发送权限/目标不明→只保存不发送”；以及换模式/返回 Voice 页面。
5. 记录当前仍需技术人员的事项（真实安装器、Provider、RVC、WeChatAgent sender 映射、真实 Windows 测试），按后续 Plan 06/07/08/09/13/14 清除；不能要求普通最终用户运行 pip/CUDA/Git、改 JSON、读文件路径。
6. Fake 状态和真实 READY 永远区分，用户误点“生成/发送”不能出现成功提示。当前八页不受影响。

## 12. 单一工程实现顺序

1. 只读确认最新 main、PR #16–#20、对应 CI、研究结论及规划分支身份；检查 `core/audio/` 尚不存在、`test/audio-core-contract.test.mjs` 尚未被他人占用。
2. 从 main 建 `feature/plan05a-whale-audio-core-contracts`，先创建三模块空安全骨架、独立测试与 docs，保证 diff 只含允许文件。
3. 先实现 `validateAudioTaskDraft`，拒绝敏感与未知输入，覆盖 T01–T14；再实现创建/状态转换/投影，完成 T15–T28。
4. 实现 FeatureManifest，确保两个 feature 的依赖/首次标记互相独立、全部 Fake 不提升真实 READY，完成 F01–F14。
5. 实现 `relay-handoff` 的候选不可提交结构，R01–R10；禁止生成新送达状态和真实目标。
6. 在文档里给状态/Schema/错误、PR #16 v1 未来映射（明确尚未合并）、三层 Core/Relay/WeChatAgent 数据流图。
7. 跑 `node --test test/audio-core-contract.test.mjs`、`node --test`、`node build.mjs`；Node 环境已具备才跑 UI，文档检查及 `git diff --check`/静态隐私扫描。**不安装**。
8. 创建独立 PR，base=main，确认五文件且没有主干/生产代码变化；获取最新 PR HEAD 对应 CI run 的实际结论（queued 时不能谎报 SUCCESS）。
9. 将最终报告交 ChatGPT 验收并停止，**不 Merge、不开始 05-B/06/07-B、08/09**。

## 13. DoD · B01–B18（必须每项提供真实证据）

| ID | 验收项 |
|---|---|
| B01 | main/PR #16–#20 动态基线与 03-B 合并门禁；不重复历史工作 |
| B02 | 新独立 feature 分支，唯一 PR、base main，仅五份规定文件 |
| B03 | 代码只有原创纯函数，无网络、文件、随机、进程、配置/Host/UI 副作用 |
| B04 | TTS/SVC 相同 Core Task v1，禁止非法配对、真实用户材料和身份目标 |
| B05 | 固定 Schema v1 + 白名单 + 安全错误 + 不抛错/无敏感回显 |
| B06 | 不透明 TextRef/AudioRef/VoiceProfileId 身份一致、无真实路径/URL |
| B07 | 状态机 CREATED/PROCESSING/ARTIFACT_READY/SAVED/取消/FAILED/UNKNOWN 只允许合法跃迁 |
| B08 | 用户取消请求≠确认停止；UNKNOWN 无自动恢复/自动重试 |
| B09 | Mock Artifact SAVED ≠ config APPLIED ≠ Relay 已发送；三类状态分离 |
| B10 | Voice/Singing 静态依赖独立、Seed-VC 不作为首发必需 |
| B11 | Fake 全 VERIFIED 仍不构成真实 ready；缺 WeChatAgent 不阻塞本地功能 |
| B12 | first-use feature/manifestRevision 独立、不可自动持久化用户确认 |
| B13 | Relay candidate 只能 PROPOSED_NOT_AUTHORIZED、submitAllowed:false；无目标和网络 |
| B14 | PR #16 TTS/SVC v1 不修改/不复制；字段映射只作为 docs 的未来设计 |
| B15 | ≥40 个完整离线 Node 自动测试 + 关键安全 case PASS（建议全部 52） |
| B16 | build/full Node/diff/privacy 真实 PASS；UI 若未跑必须明确 NOT_RUN；最新 PR HEAD CI 如实记录 |
| B17 | Novice First 双页面首访、中文故障恢复、不可用状态与人工步骤清单齐全 |
| B18 | 不合并/部署/安装/下载/真实 TTS/SVC/微信/服务重启/配置改写；结论仅 OFFLINE |

若有 Bxx FAIL，则不是本阶段 DONE；修同 PR，不另发新编号。

## 14. 最终 DeepSeek 报告固定格式

标题：**《Plan 05-A · Whale Audio Core 纯契约与 Fake 测试交付报告》**。

必须包含：
1. main/PR #16–#20 执行前/后核验、研究结论、合并授权闸门；
2. 新分支/PR、base/head、变更文件清单、CI 与 reviews；
3. A/B/C 模块导出、白名单字段、Schema v1、错误码与 `OFFLINE/NOT_INTEGRATED`；
4. TTS/SVC Task 转移和取消、UNKNOWN、SAVED/DELIVERY 候选边界；
5. Voice/Singing 各自依赖/首次 manifest，RVC/Seed-VC 的未实现标签；
6. Relay Candidate 无目标/不可提交/唯一 ID 的未来责任，PR #16 v1 契约未复制和未来 mapping；
7. `test/audio-core-contract.test.mjs` 测试总数 + T01–T28/F01–F14/R01–R10 对照；
8. Node 全量、build、UI（RUN/NOT_RUN 原因）、`git diff --check`、docs/隐私扫描、最新 HEAD CI；
9. B01–B18 `PASS/FAIL/BLOCKED` 与文件行号、测试证据；
10. 普通用户两条首次流程和五个中文错误/未实现路径；
11. **唯一结论 `READY_FOR_PLAN05_NEXT_OFFLINE_REVIEW` 或 `REVIEW_REQUIRED`**；
12. 确认未合并任何 PR、未接入 Host/GUI、未运行模型、未安装依赖/升级 WeChatAgent、未实际微信发送，完成后停止。

**只有“允许考虑下一步隔离 Core/Provider 工作”的意思，没有生产实施或 PR #16 merge 的默示授权。**

## 15. 硬停止条件和交接

发生以下情况 STOP 受影响操作并报告：main 已有重名任务合同、工程修改需要触及原 index/server/UI/真实 config、要 import 未合并 PR #16、需要真实音频/微信/Token/私人声线、测试必须 npm install、需要创建第二仓库/修改其他 PR/强制更新、更改用户 Windows 机器、需要做真实 Sender 或 ZIP/Hook 试验、需合并/部署。无证据不猜兼容。

**DSH 对话建议**：Plan 04-A 静态研究阶段已结束，05-A 是新一轮纯代码/自动化测试工程，适宜新开一个 DeepSeek 对话。新对话阅读本任务书 + AGENTS.md，再只实现允许的三个纯模块。ChatGPT 在用户发回 B01–B18 报告后复核 PR 并派发下一份，不改变原 Plan 编号。
