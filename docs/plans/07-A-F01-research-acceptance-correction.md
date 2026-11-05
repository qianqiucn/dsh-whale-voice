# Plan 07 · 07-A-F01 静态审计验收修订任务书（Level 2）

**任务版本：v1.0（2026-10-25）**  
**计划归属：原 Plan 07-A 的同编号修订 F01，绝非新的 Plan 15 或独立 07-B。**  
**派发状态：SENT（随 ChatGPT 当前回复交付给用户转发 DS）；工程状态：REVIEW_REQUIRED；验收目标：RESEARCH/OFFLINE 文档闭环。**  
**执行人：DeepSeek；计划/终审：ChatGPT。**  
**唯一工程对象：现有 PR #19 的单一 Markdown 报告，不新建 PR，不改任何源码。**

## 1. 任务为何必须存在

PR #19 的首次研究发现有价值，可以保留以下结论：RVC 是 Whale Singing 首发主线；AstrBot 插件与许可不明的 RVCSVC-API 不能直接复制/内嵌；上游当前仅把歌曲 ID/URL 送到不适合本项目的转换流程；授权本地音频必须成为 Whale Audio Core 的输入；原始研究可作为 07-B Fake Adapter 设计依据。CI 通过仅证明 GitHub 的构建/UI 流程，不证明静态研究完整。

**正式验收未通过的 4 个文档缺口（禁止扩大为新的研究任务）：**

- **F01｜原 A01–A14 编号错位。** 原任务书的 A01 是仓库/PR/CI/reviews；A02 才是上游锁定；A03 是许可证据；A04 是 API 静态证据。然而 #19 报告把 A01 标为上游锁定，把 A02 标为工作流，把 A04 标为“本地授权音频 BLOCKED”，与交付规格不一致，不能逐项复核。应按原任务书重新编号和评估；上游“本地音频不支持”是**研究到的能力阻塞，不是 A04 审计交付天然失败**，须两套状态分开。
- **F02｜源码证据粒度不足。** 报告第 12 章主要引用上游仓库树、LICENSE 和 README 的链接；没有为 /convert、/show_model、launch(0.0.0.0,share=True)、取消缺口、歌曲下载、自动模型下载、硬编码疑似凭据、Gradio 参数及返回值提供**精确固定 commit 的文件路径与行号**。原 07-A 要求 fixed URL/path/line 的追溯表；现在不能把所有 API 断言直接打 PASS。
- **F03｜Fake 示例与 PR #16 的现有 SVC v1 契约不兼容、缺明确映射。** 报告提出的顶层 `engine`/`targetVoiceProfileId`/`params`/`output` envelope **不是** `validateSvcRequest()` 允许的现有请求字段；现有必填是 `sourceAudioRef`、`targetVoiceId`、`pitchShift`、`formantShift`、`conversionStrength`（`outputFormat` 可选）。报告 Fake 输出缺 `targetVoiceId`，不能原样满足 `normalizeSvcResult()` 的输入要求。**现有 normalizeSvcResult 会统一生成 delivery.state=PENDING_ROUTER，允许这个唯一的待路由状态，但仍禁止 send、wechat 或真实交付动作**；不要误删现有防护。
- **F04｜新手安装依赖矩阵尚未达到组件逐项级别。** 当前 Windows 表列了整体环境事实，却没有为所选 RVC 模式的每一项组件说明“是否必装/条件/仅发送、探测证据、合法安装来源、确切许可、资源 UNKNOWN、自动安装可行性、失败后中文恢复和后续 Plan 归属”。这直接影响今后的 Novice First 一键流程，不允许靠开发者手动设置来遮盖。

## 2. 执行前必须重新核实的 GitHub 基线

以下为 ChatGPT 2026-10-25 已核查的快照，DS 执行前仍需重新读取 GitHub，记录是否变化：

| 对象 | 当时状态 | 本任务权限 |
|---|---|---|
| main | `bf9cf66807e12d0b25872a0fa3869962dde04818` | 只读、绝不修改 |
| PR #16 | OPEN，HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`，0 reviews，CI `40165832178` SUCCESS | 只读 SVC v1 契约；**03-B WAIT_USER_AUTHORIZATION**，不合并 |
| PR #17 | 权威规划分支 `docs/whale-voice-execution-plan-registry`，当前 HEAD 以查询结果为准 | 读取此任务，**DS 不得修改 docs/plans** |
| PR #18 | OPEN/DRAFT，`42cec57ae7018735cb6c65a4ef8b0a1d80473810` | 不修改 |
| PR #19 | OPEN，分支 `research/plan07a-rvc-upstream-audit`，HEAD `8276909efac54e4e2dd00c905cbd67e32c5073f3`，**1 file，+348/−0**，CI `40230248341` SUCCESS | **唯一允许更新的 PR/分支** |
| 07-A | SENT，收到报告后 **REVIEW_REQUIRED / F01 待修订** | 未 DONE；本任务是同编号续行 |
| 07-B、Plan 04、Plan 05 | PLANNED / NOT_SENT | 不开始 |

未获用户授权合并 PR #16/#17/#19、下载模型、运行真实 GPU、改动生产配置/发送微信；不能凭 #19 CI 视为 SVC Provider 已可用。

## 3. 必读文档（最新 GitHub，不靠上下文推测）

按顺序：
1. `AGENTS.md`、`docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md`、`docs/plans/TASK_SPEC_STANDARD.md`（规划分支）。
2. `docs/plans/07-A-rvc-upstream-static-audit-execution.md`，特别是“12. A01–A14 验收矩阵”的**原始编号定义**（规划分支）。
3. `docs/SVC_PROVIDER_RESEARCH.md`（PR #19 当前 HEAD 的已有研究报告，保留原工作）。
4. `core/svc/svc-contract.mjs`、`core/svc/svc-registry.mjs`（PR #16 未合并 HEAD）；阅读 `validateSvcRequest`、`normalizeSvcResult`、允许的字段及错误码。
5. `docs/plans/RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md`、`docs/plans/WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md`、`docs/plans/README.md`；不修改这些计划文件。
6. 上游锁定 SHA 的静态源码：`CCYellowStar2/astrbot_plugin_rvc_svc@0b84e382927e088b9f4f10ce09ea1e4175bb0d8d`、`CCYellowStar2/RVCSVC-API@274572c320147977a18dc0028e45f79da136a6e2`、`Plachtaa/seed-vc@51383efd921027683c89e5348211d93ff12ac2a8`。旧代码内容只能静态看，不执行、下载或复制入代码仓库。

## 4. 允许/禁止的文件改动

**只允许在 PR #19 当前研究分支修订 `docs/SVC_PROVIDER_RESEARCH.md`。** 可以修改其中审计证据、契约映射、依赖矩阵、风险标记和 A01–A14 表；不要删除合法研究成果、不另起第二份报告、不改变它的核心安全结论。

**不许**：
- 改 `core/**`、`test/**`、`pages.js`、`setup.js`、`index.js`、package 或 CI；不改规划 `docs/plans/**`。
- 新建研究 PR、在 PR #16 工程分支提交修复、把本任务合并进 main 或合并任意 PR。
- 安装 Python/pip、运行上游 .bat/Gradio/GPU/RVC/UVR/MSST、下载模型/歌曲/整合包、接触凭据、配置声卡、操作 WeChatAgent/Voice Sender 或发送真实微信。
- 复述疑似泄露的第三方 API key、Cookie、参数密文等值；证据只写固定文件链接与“敏感字串已遮蔽/不复用”，避免把泄露扩散到 GitHub 评论、PR 和日志。

## 5. F01：复原 A01–A14 原规格编号和 PASS 语义

把现有报告的“9. A01–A14 验收矩阵”**按 Plan 07-A 原任务书的顺序完全重写**；必须 14 项、不增不漏、每项有简洁证据链接/报告章节/当前状态：

| ID | 正式定义（不可修改） |
|---|---|
| A01 | main/PR/CI/reviews 实时事实与 #16 未合并 |
| A02 | 三上游 SHA 钉死 |
| A03 | 代码/模型/音频/声音四类许可证独立证据 |
| A04 | API 参数/错误/版本来自固定源码、不臆造 |
| A05 | 曲库权利、SSRF/DRM、音色同意与 fail-closed |
| A06 | Whale Audio/Whale Relay 职责分离，现有 SVC 契约不变 |
| A07 | RVC 主线、Seed-VC 后续、不宣传低显存 |
| A08 | Windows 依赖与可信探测、UNKNOWN 字段完整 |
| A09 | ≥12 负向、Top10 和对应处理 |
| A10 | Novice First DoD、中文路径与 3 条恢复 |
| A11 | 仅许可 docs 文件变更，无秘密/隐私/模型 |
| A12 | git diff/Markdown/编码/最新 HEAD CI |
| A13 | main/#16/#17/#18 未改、未启动真实生产和模型 |
| A14 | 唯一后续建议与硬停止条件 |

`PASS` 表示**已按只读研究要求交付可靠证据**；上游不支持 local Artifact 应在结论/兼容矩阵标 `UPSTREAM_BLOCKED`，不能把研究的障碍误写成“审计未完成”，也不能反过来把没有源码证据的猜测标 PASS。未知性能标 `UNVERIFIED`，不是测试通过。

## 6. F02：补上固定版本文件+行号的证据，而不是重复研究

在报告原“上游/协议/权利/供应链”章节增加一张可审计的证据表：

`ClaimId | 技术断言 | upstreamRepo@SHA | exactFile#Lstart-Lend | sourcePermalink | evidenceType | finding | unknownOrLimits`

**至少**各有独立来源且能由 ChatGPT 一键打开定位：
1. AstrBot 插件 LICENSE AGPL 与 README 对附加“学习/商用”措辞的实际内容（避免不准确法律推断）。
2. 插件 `api.py` 的疑似凭据/参数硬编码：只写文件/相关函数链接，不复制秘密、截图、Key 或其字面量；风险描述须严谨，不直接认定秘密一定有效。
3. `main.py` / `api.py` 的歌曲选择与 Record 发送调用链。
4. RVCSVC-API `app_rvc.py` 的 `/show_model` 与 `/convert` 声明、参数顺序、默认值、返回组件/临时文件；能确定的细节列完整，未知明确标 UNKNOWN。
5. `app_rvc.py` / `app_svc.py` 的 Gradio launch 暴露、auth/queue/cancel 的正/负证据。仅凭未发现不能推定**整个项目**不存在认证；写“在已审文件未见/未验证”。
6. 歌曲 ID/URL 的处理（包括本地 Artifact 是否有支持）、模型名、音频处理与 URL 来源。指出能力不兼容并附源码行。
7. UVR5/MSST checkpoint 自动下载路径、镜像/校验的文件与行；不得执行或触发实际下载。
8. PyTorch/cu118/Python/依赖具体版本来自锁定 `requirements.txt` 等文件；README 的硬件建议与实测区别。
9. Seed-VC 最小归档/许可、模型描述的来源（不新增实测）。
10. FFmpeg/RVC WebUI 等外部组件若尚未锁定 SHA、License 或权重证据，**直接标 UNVERIFIED**，不把 GitHub 页面的通用 license 元数据写成“已核实所有内嵌组件”事实。

若无法获得实际行号，标 `SOURCE_LINE_UNVERIFIED`，报告其原因及影响；绝不能自造 #L 起止行号或不恰当地透露 API key。报告 API 请求/返回的每一条确凿语句应能追溯到固定源码。

## 7. F03：区分三层契约、给出正确 v1 兼容映射

研究文件中明确划分**三层**，不要在 Fake 提案里混用：

- **层 A：Whale Singing / CoverTask 草稿（未来 Plan 05/08）**。此层将来可表达分离模式、伴奏增益、人声增益、混音等；目前仅 `PROPOSED`，未实现，不给现有 SVC v1 协议硬塞嵌套字段。
- **层 B：现有 PR #16 SVC v1 纯契约（真实源码，但未合并到 main）**。请求通过 `validateSvcRequest`；结果通过 `normalizeSvcResult`。逐字段给原生允许/必填/范围/来源/错误；不能修改真实源码。
- **层 C：后续原创 07-B Fake Gateway（现在仅设计）**。RVC_FAKE 模式/测试引擎属于隔离模拟，具体 Adapter wrapper 与 B 层字段如何一一转写必须给清晰转换表；不能把原研究请求示例误说成已可直接传入 B。

**现有源码固定事实（DS 需重新只读核验）**：
`validateSvcRequest` 允许顶层 `sourceAudioRef,targetVoiceId,pitchShift,formantShift,conversionStrength,outputFormat`；前五项必填，`outputFormat` 可选；未知字段拒绝。参考样例（只是文档示例，不改源码）：

    {
      "sourceAudioRef": "artifact:fixture-vocal-001",
      "targetVoiceId": "fixture-voice-a",
      "pitchShift": 0,
      "formantShift": 0,
      "conversionStrength": 1,
      "outputFormat": "audio/wav"
    }

`normalizeSvcResult(engineId, input)` 要求 `requestId`、`targetVoiceId`、`artifactRef`、`mime`、`sampleRate`、`durationMs`；其归一化结果自己生成 `delivery: {state:"PENDING_ROUTER"}`；即使输入可包含这个单一等待路由状态，Provider **绝无**发送目标、微信消息、自动投递权限。参考形态：

    {
      "requestId": "fixture-request-1",
      "targetVoiceId": "fixture-voice-a",
      "artifactRef": "artifact:fixture-output-1",
      "mime": "audio/wav",
      "sampleRate": 44100,
      "durationMs": 1200
    }

给出最少**四类修订说明**：
1. 原示例中 `targetVoiceProfileId` 与 SVC v1 `targetVoiceId` 的映射（不自动假定跨模型音色资产互通）。
2. 原嵌套 `params.pitchShift`、`params.vocalGainDb`、`params.instrumentalGainDb`、`params.separation` 之中，只有哪些能进入 SVC v1，其余留在 CoverTask/Mixer/Separation；没有直接等价时写 NEEDS_VERSIONED_CONTRACT_IN_PLAN05_08。
3. 输出 `targetVoiceId`、`artifactRef` 等必填项要齐全；`channels` 与直接 RVC 原生结果不能冒充 normalizeSvcResult 归一化字段。
4. `delivery.state=PENDING_ROUTER` 是经过规范化后的待路由标记，并非任何微信已提交/已收到/自动发送证据；`UNKNOWN` 时不可自动重试/转换/另选后端。

**最低 6 个纯文档级判断用例**，每例写“请求/调用器/预期校验”，无需跑 Node 或改测试：合法 SVC v1 输入 PASS；原裸 Fake 草稿传给 v1 INVALID_REQUEST；缺 targetVoiceId INVALID_RESULT；send/wechat 字段拒绝；仅 PENDING_ROUTER 被规范允许但不触发发送；混音参数只在 CoverTask，绝不穿透 v1 黑名单。错误名须以源码为准，不能捏造。

## 8. F04：逐组件 Windows 安装 Manifest 与 Novice First 审计

在旧 Windows 总结下增加**未来 UI 依赖逐组件表**，字段至少：
`componentId | 中文显示名 | 对用户用途 | 使用阶段/模式 | REQUIRED/CONDITIONAL/OPTIONAL/DELIVERY_ONLY | 探测方式及可信证据 | 是否无需安装可复用 | 来源/许可证/权重是否另许可 | 下载/磁盘/CPU/GPU/VRAM (有证据或 UNKNOWN) | 自动安装可行性 | 必须确认的权限/费用/隐私 | 常见失败的中文恢复操作 | 后续Plan`。

列全：Whale Audio Core 检查、合法用户 RVC 音色模型、外部 RVC Worker/Gateway（当前直连禁止）、纯人声时可跳过的分离器、被选定音频方案要求时才安装的 FFmpeg/编码器、试听/保存、仅发送时才需的 Whale Relay/WeChatAgent/Voice Sender、Seed-VC 后续可选 NOT_READY；**不能用当前许可不明 RVCSVC-API/插件作为默认“一键安装源”。**

至少给三个实操中文 UI 故障分支：
- “未找到可用的唱歌引擎”→“重新检测 / 暂时浏览 / 查看安全安装说明”。
- “当前设备未验证能运行所选翻唱模型”→“查看硬件要求 / 更换已验证模式 / 返回语音气泡”。**没有被证明的 CPU/云端翻唱就不能显示可用选项**。
- “歌曲或目标音色尚未取得使用授权”→“提供有权使用的文件 / 重新选择音色 / 取消”。

本次不开发 UI/安装器；未来新手不应使用命令行或手改 JSON 才能使用标称支持的正常功能；无安全安装渠道时诚实标 NOT_INSTALLABLE。所谓“保存”必须区分“保存输入文件”和“真实生成成功的 Artifact”。

## 9. 严格执行顺序

1. 在自己的研究工作树核验当前 main、PR #16/#17/#18/#19、对应 HEAD/CI/reviews，保留原文件与当前 diff；不要切换/重写任何生产分支。
2. 打开现有 PR #19 的 `docs/SVC_PROVIDER_RESEARCH.md`，标记上述四项需要修订的章节；不删已有原始发现/风险表。
3. F01 重映射 A01–A14 与基线状态，报告中区分“研究任务 PASS”与“上游能力 BLOCKED”。
4. F02 增补 pinned SHA + 文件定位 + 可打开的 #L 源链接；没核实的字段必须 UNKNOWN，不能生成或转贴疑似泄露凭据。
5. F03 从 PR #16 现有 `core/svc/svc-contract.mjs` 逐项核对请求/结果和拒绝行为，增补 3 层映射、字段表与 6 项文档判断例。
6. F04 填组件依赖 Manifest，明确 Windows/CPU/GPU 未实测、禁止自动下载、零编程新手中文恢复。
7. 将文件更新在**原 PR #19 分支**，确保 diff 相对 main 仍只有 1 个允许文档文件；`git diff --check`、已存在的 Markdown/doc integrity/隐私检查如实执行，不要求安装新工具。
8. 观察原 PR #19 **新 HEAD 对应** GitHub CI，若排队/失败如实报告、不要称成功；更新完成报告。
9. **停下**；不 Merge、不开始 07-B / Plan 04 / Plan 05；交回 ChatGPT 验收。

如果无法访问固定来源、发现原合同冲突、发现疑似泄露真实密钥、无法仅修改允许文件，停止受影响步骤并报告，不越权修复仓库/第三方代码。

## 10. F01 修订验收 DoD

| 验收 ID | 必须满足 |
|---|---|
| R01 | 原 A01–A14 编号/语义逐项对齐，主观 PASS 不替代直接证据 |
| R02 | 至少 10 个关键静态断言有 pinned SHA/file/#L/链接，未知标 UNKNOWN，凭据不泄露 |
| R03 | 现有 SVC v1 的 6 个请求字段和输出必填项、允许/拒绝字段对齐源码 |
| R04 | 报告给出 CoverTask 草稿 → v1 SVC → 07-B Fake 的严格三层映射与至少 6 个判断例 |
| R05 | 合法 RVC 音色、外部 Gateway、条件分离、混音/编码、仅发送组件、Seed-VC 未来候选的 Manifest 齐全 |
| R06 | Novice First 三种中文失败恢复、无 GPU/云端 UNKNOWN、不能自动安装/没有默认上游整合包 |
| R07 | 保留初版版权/许可/SSRF/公网/模型自动下载/UNKNOWN 不重发等风险，不退化为“可以直接集成” |
| R08 | 原 PR #19 只改一份报告、无敏感内容或生产副作用、CI 最新 HEAD 真实记录 |
| R09 | 最终结论仍可为 `APPROVE_FAKE_ADAPTER_DESIGN`，但必须精确限定为原创、隔离、离线的 Fake 设计；许可和真实 Gateway 一律另审 |
| R10 | 不修改 #16/#17/#18/main、不合并/安装/运行模型或服务、不发送微信 |

**本轮只重做失配部分，不要求重新跑真实 GPU/音频/微信或重复 15 条既有负向案例。** CI PASS 不会自动将安全未知变成已验证。

## 11. DS 完成报告格式（不可换编号）

**《Plan 07-A-F01 · 原研究报告验收差距修复报告》**

1. main、PR #16–#19 状态/HEAD/reviews/CI、当前工作分支。
2. 原研究中的四个 F01–F04 缺口分别如何修复，精确文档行号/源码链接。
3. 以**原始规格顺序**报告 A01–A14 PASS/FAIL/BLOCKED 与证据；特别说明上游不可直连 ≠ 审计失败。
4. R01–R10 每项 PASS/FAIL/BLOCKED 与证据。
5. PR #16 SVC v1 与原 Fake 样例的字段差异、三层映射及六种文档检查。
6. RVC 首发/Seed-VC 后续选配/合法歌曲与声音许可证/Windows 新手 Manifest 的实际结论。
7. 只修改原 `docs/SVC_PROVIDER_RESEARCH.md`，文件数、行数、PR #19 新 HEAD、CI run。
8. doc integrity/UTF-8/privacy/diff 实测 vs NOT_RUN；不能说运行了 RVC 或进行真实 Windows GPU 验收。
9. 唯一最终结论 `APPROVE_FAKE_ADAPTER_DESIGN` 或 `BLOCKED_UPSTREAM`，清晰列阻断的直接源码复用和真实安装能力。
10. 逐项确认没有合并、生产、微信、驱动、服务、付费、下载、模型运行或新任务自发启动。

**完成并反馈后停止。** 下一份任务书由 ChatGPT 评估先决关系后派发，计划编号 01–14 不变，03-B 仍 WAIT_USER_AUTHORIZATION。无需要求用户再次发送已经在 PR #19 的上游风险分析。
