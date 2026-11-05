# Plan 07 · 07-A RVC 上游许可 / API / Windows 依赖静态审计

**版本：v1.0（2026-10-25）｜等级：Level 2 / RESEARCH-OFFLINE｜状态：SENT（由用户转交 DeepSeek）。**

**角色**：ChatGPT 负责产品决策、任务书与验收；DeepSeek 只执行这份研究，建立单独 docs-only PR，完结后报告并停止。本轮不是 07-B 编码、12-A 实机翻唱、03-B 合并或任何安装/真实发送授权。

## 1. 唯一目标

验证 CCYellowStar2/astrbot_plugin_rvc_svc 及其独立 RVCSVC-API 的 **RVC 标准翻唱** 是否可经合法、可控、可替换的原创兼容适配层接入 Whale Audio Core（鲸音核心）。输出完整、可追溯的静态研究报告 **docs/SVC_PROVIDER_RESEARCH.md**，供后续 07-B Fake Gateway 设计直接使用。

Whale Singing 首发主线仅 RVC；Seed-VC 只做基本静态档案，后续 Plan 12-D 免训练零样本试唱才可能考虑实测，绝不称低显存/CPU 轻量。Whale Voice（语音气泡）与 Whale Singing（唱歌）有独立前端入口，后端共用 Whale Audio Core。Whale Relay（鲸递）仅负责安全投递，不运行 GPU 推理、搜索或分离歌曲。产品长期目标用户为不会代码的 Windows 普通用户。

**本轮只能读公开源码/本仓库合同、写文档、做文档检查与新研究 PR；不能改任何工程代码。**

## 2. 执行前实时核验基线（发现变化记录差异，不自动解决）

- main：bf9cf66807e12d0b25872a0fa3869962dde04818。
- PR #16：OPEN，未合并，HEAD 954a01a08587bc8bd5b8caccf026298ca54d5215；22 files；GitHub Reviews 0；CI 40165832178 SUCCESS；TTS/SVC 只是 DESIGN/OFFLINE、NOT_IMPLEMENTED。Plan 03-A DONE，但 03-B WAIT_USER_AUTHORIZATION。
- PR #17：规划分支 docs/whale-voice-execution-plan-registry，原 HEAD 110a1b388befe9f52737e77f7cd951fa5011f818，CI 40228467845 SUCCESS；此后增加本任务书所以 HEAD 必然前进。只读规划，禁止 DeepSeek 修改 docs/plans。
- PR #18：OPEN / DRAFT，HEAD 42cec57ae7018735cb6c65a4ef8b0a1d80473810，历史任务资料，不合并。
- Plan 01 仍 SENT；不要重复 Plan 02 F01–F05、03-A，亦不要启动 TTS-B 或 Phase 4B 生产配置写入。
- GitHub 数字由 DeepSeek 执行前重新核对最新 main/PR/CI/reviews；CI 必须与对应 HEAD 配对。

## 3. 阅读输入

**规划分支只读**：
AGENTS.md、EXECUTION_STANDARD.md、docs/plans/README.md、docs/plans/07-svc-a-seed-vc-rvc-audit.md、本执行任务书、docs/plans/RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md、docs/plans/WHALE_AUDIO_CORE_AND_DUAL_UI_ONBOARDING.md、docs/plans/NOVICE_FIRST_PRODUCT_STANDARD.md、docs/plans/TASK_SPEC_STANDARD.md。

**工程只读**（部分只存在未合并 PR #16，必须从其 HEAD 查阅，不得假设已在 main）：
core/svc/svc-contract.mjs、core/svc/svc-registry.mjs、core/tts/provider-contract.mjs、core/tts/provider-registry.mjs、docs/TTS_PROVIDER_ARCHITECTURE.md、docs/WECHATAGENT_COMPATIBILITY.md、docs/VOICE_DELIVERY_BACKENDS.md（存在时）、index.js、core/server.mjs、setup.js。

**上游只读 GitHub**：
1. CCYellowStar2/astrbot_plugin_rvc_svc：master HEAD 在本轮核得 0b84e382927e088b9f4f10ce09ea1e4175bb0d8d。读 LICENSE、README.md、api.py、main.py、_conf_schema.json、requirements.txt、metadata.yaml。
2. CCYellowStar2/RVCSVC-API：main HEAD 在本轮核得 274572c320147977a18dc0028e45f79da136a6e2。读 README.md、app_rvc.py、app_svc.py、msst_backend.py、requirements.txt、使用说明.md、uvr5 和 msst 的纯文本代码、启动 bat 的内容（禁止执行）。
3. Plachtaa/seed-vc：main HEAD 在本轮核得 51383efd921027683c89e5348211d93ff12ac2a8，仓库已归档。只记录许可证、归档风险、零样本参考音频与专用歌声模型的区别，不做 fork 调查或跑分。
4. 如需定位 RVC/UVR5/MSST/FFmpeg 原始上游，记录准确 URL、Commit/发行版、许可证和引文；无法核实写 UNVERIFIED，禁止猜测。

上游 HEAD 可能变化，研究必须锁定实际阅读时 SHA 并提供 immutable permalink。此前未发现 RVCSVC-API 根 LICENSE 文件，**不等于已证实没有任何授权条款**；静态审查后仍无明确许可时写 UNVERIFIED_RIGHT_TO_REUSE / BLOCKED_REUSE，不将公开可读等同可重分发。

## 4. 唯一允许的研究 PR 与改动

新分支：research/plan07a-rvc-upstream-audit（如果已占用，报告冲突并用追加 -v2 的新分支）。基于执行时最新 main，创建 docs-only PR；**只允许新增或最小更新 docs/SVC_PROVIDER_RESEARCH.md**。本轮开始前该文件在规划分支未发现，执行时若已存在，先 diff，不得覆盖别人的报告。

不得修改 docs/plans、PR #16、PR #17、PR #18 或任何源码、配置、模型、依赖清单，不触碰 production。可运行 git status、git diff --check 和现成无安装的文档检查；不强制跑 Node/UI，因为未改代码，若运行必须诚实标 NOT_RVC_VALIDATION。不能通过安装新工具来满足测试。

## 5. 许可证与组件审计（按证据逐项）

为 AstrBot 插件、独立 RVCSVC-API、RVC 引擎、SoVITS-SVC 仅接口候选、UVR5/MSST 分离模块、FFmpeg、其预训练权重、歌曲源和参考音色分别建立表格。

每行字段：
component / upstreamUrl / pinnedCommit / licenseEvidence（固定 URL）/ codeRights / modelWeightRights / rightsOfAudioAndVoice / runtimeDeps / reuseMode / reuseAllowed-or-BLOCKED / risk / recommendation。

分别区分：读代码、独立 API 交互、源码复制、修改、随发行包分发、模型权重再分发、音乐下载/改编/传播、真人参考音色许可。插件标 AGPL-3.0 仍须核验具体 LICENSE；独立网关未见根 LICENSE 必须审查全文与子模块，若不明，禁止 vendor 或复制源码。不得发表没有充分证据的最终法律结论。

## 6. 原工作流、API 与差异证据

静态描绘完整链路：
用户/DSH 意图 → AstrBot 命令/搜曲候选 → 曲库元数据 → 可合法取得的音频 → 人声分离 → RVC 音色转换 → 混音 → 产物 → 可选发送。

输出 Mermaid 或 ASCII 流程图，标出每一步真实负责模块、输入输出类型、缓存/临时文件、错误、取消、许可证及授权判断。

逐项由固定 SHA 的源码核实：
- 是否确有 Gradio /show_model、/convert；参数顺序、类型、音高、模型 ID、增益单位、返回值形状、错误表达、同步/异步和 Gradio 版本。
- 能否直接处理用户提供的**已授权本地音频**；如果只支持平台 SongID，写 LOCAL_AUTHORIZED_INPUT_UNSUPPORTED，不自行设计违法抓取。
- 文件名/输出路径/HTTP 下载/重定向和 SSRF 风险，模型名是否可被用于路径/命令注入。
- 健康、模型列表、版本协商、超时、并发、取消是否真的可用；没有源码证据写 UNKNOWN / RUNTIME_UNVERIFIED。
- 不能把 README 示例端口 7860/7866 或示例参数当作已验证正式稳定 API。

表格字段：upstream-file-and-line@SHA / endpoint-or-function / request / result / errors / state-and-timeout / rightsImpact / evidenceStatus / proposedAdapterMapping / gap。

**禁止调用本地真实 127.0.0.1 RVC 服务，不运行 Python、批处理、模型或音乐转换。**

## 7. 与 Whale Audio、Whale Relay 现有契约映射

比对未合并 PR #16 的纯 SVC v1 契约/注册表，输出每个候选字段及其白名单是否支持、尚缺什么；不得往真实契约暗加 songId、URL、磁盘路径或未审核投递字段。

未来唯一推荐架构：DeepSeek Tool 只提交经授权的点歌任务；Whale Audio Core 管理 Rights、Source Artifact、VoiceProfile、CoverTask、Separation、RVC Adapter、Mixer、ArtifactStore、进度和取消；外部 RVC Gateway 执行受限推理；鲸递 Whale Relay 只接收已校验产物、一次投递 ID、已复核目标与用户授权。WeChatAgent 仍拥有身份。UNKNOWN 不自动重发；SENT_LOCAL 不是送达确认；Worker NEVER_WRITE、Bridge/Worker 分权保持不变。

输出 07-B 后续可能采用的 Fake Gateway **提案**（接口、输入/输出、错误码、状态、超时、取消、文件校验、资源限制、版本兼容、幂等/缓存范围）；所有未来接口明确标 PROPOSED_NOT_IMPLEMENTED。whale-v1 的 Qwen TTS 音色不能自动冒充已存在 RVC 歌唱音色模型。

## 8. Windows/硬件及新手首次安装依赖审计

按 Whale Singing 标准 RVC 翻唱模式列：
中文展示名 / 功能说明 / 必装-条件-可选-仅发送 / 可检测证据 / 来源和版本 / 许可 / 安装体积或 UNKNOWN / CPU 方案或 UNKNOWN / GPU-CUDA-内存或 UNKNOWN / 是否要求系统权限 / 错误恢复 / 所属 Plan。

至少包括：共用鲸音 Core、RVC Gateway、合法 RVC 音色模型、条件人声分离（纯人声可跳过）、所选方案所需混音/格式工具、试听/保存资产、**只有选择真实发送时**才可能要求的 Relay/WeChatAgent/Voice Sender。Seed-VC 只列后续免训练选项，NOT_READY、NOT_DEFAULT，不默认下载、不宣称低显存。不能无测试就断言 CPU 可流畅翻唱。

**非程序员体验 DoD**：写出简体中文首次流程“打开唱歌→系统检查→选择标准翻唱→查看所需组件、空间与授权→未来获得同意后可安装→选择已授权歌曲与音色→生成/试听/保存→单独授权发送”，并明确当前 GUI/真实安装器未实现，不能假称操作已可用。普通用户的最终标准流程不得要求 Git、Python/pip/npm、命令行、手改 JSON/ENV、配置端口；不能合法自动安装的第三方依赖必须诚实说明原因及替代。

至少提供三种中文失败恢复文案（RVC 未就绪、机器不支持所选 GPU 模型、歌曲版权不足），对应“重新检测/更换模式/换授权源/稍后再说”；Whale Voice 日常 TTS 不受 Singing 依赖阻塞。

## 9. 负向案例（至少 12 项，风险 Top 10）

最低检查集：上游无明确许可证；AGPL 义务不清；模型权重/真人音色授权缺失；版权歌曲 VIP/DRM/地域限制；同名曲目歧义；只有 SongID 无合法本地输入；无 GPU/内存耗尽；错误 Gradio 版本；恶意路径/SSRF/音频炸弹；生成取消而 GPU 仍运行；输出格式/长度不满足微信；错误聊天对象；提交结果 UNKNOWN 触发重复发送；缓存跨用户泄漏；Seed-VC Tiny 被误当轻量唱歌。

每例说明：触发条件、证据、风险等级、fail-closed 处理、残余风险、后续所属 Plan。排序给 Top 10，不能把未知标 PASS。

## 10. 执行顺序与最终提交

1. 核实 GitHub 主线、三个 PR、reviews 和 CI、现有文件/工作树；记录动态差异。
2. 固定三个上游 SHA 与源码证据，只读许可矩阵。
3. 绘制真实 AstrBot→Gateway→RVC→音频→发送流程，核验 API/参数/输出与缺口。
4. 同 #16 SVC 纯契约比对，确定原创 Fake Gateway 作为唯一后续候选。
5. 调查 Windows 安装、驱动、GPU/无 GPU 限制和面向新手的按需依赖清单。
6. 写负向场景、风险 Top 10、Seed-VC 最小静态档案、后续 07-B Fake 测试种子（至少 10 个）。
7. 新增 docs/SVC_PROVIDER_RESEARCH.md，按第 11 节固定章节；检查引用、隐私、UTF-8 和 git diff --check。不要把模型/音频/Token 放进仓库。
8. 新建仅文档 PR，确认 diff 仅研究报告、最新 HEAD 的 CI 状态；完成即停止。不修改或合并 #16/#17/#18，不开展 07-B。

出现需要下载/运行上游程序才能验证、许可证必须拷贝不明确的代码、Git 变更超出仅文档范围、涉及真实系统与微信时，立即 STOP 对应工作并如实记录。

## 11. 报告文件的强制章节

docs/SVC_PROVIDER_RESEARCH.md 按顺序含：
01 审计范围/日期/上游 SHA；
02 一句话结论/唯一推荐形态；
03 上游组件及代码-权重-曲源-音色许可证据矩阵；
04 AstrBot 搜歌/下载/分离/RVC/混音/发送图；
05 Gradio API 具体函数/参数/返回/错误与来源证据；
06 Whale Audio/Relay/WeChatAgent 契约差异；
07 Windows CPU/GPU 与首次依赖表；
08 新手中文路径和三种失败恢复；
09 12+ 负向场景/风险 Top 10；
10 07-B Fake Gateway 规划与至少十项模拟测试；
11 仍未知的事实/禁止直接重用的组件；
12 检查记录、Git/PR/CI、安全与未运行声明。

**单一最终结论枚举：APPROVE_FAKE_ADAPTER_DESIGN 或 BLOCKED_UPSTREAM。**
前者仅意味着允许 ChatGPT 考虑另行派发 07-B Fake 设计，绝不表示同意真实推理/模型下载/微信发送。若源代码直接复用受阻但原创 Fake 仍有技术依据，可报告 APPROVE_FAKE_ADAPTER_DESIGN，同时明确 BLOCKED_CODE_REUSE；缺少可定义协议的证据则 BLOCKED_UPSTREAM。

## 12. A01–A14 验收矩阵

A01 main/PR/CI/reviews 实时事实与 #16 未合并；
A02 三上游 commit 钉死；
A03 代码/模型/音频/声音四类许可证独立证据；
A04 API 参数/错误/版本来自固定源码，不臆造；
A05 曲库权益、SSRF/DRM、音色同意 fail closed；
A06 Whale Audio 与 Whale Relay 分责和现有 SVC 契约不变；
A07 RVC 主线、Seed-VC 延后、不宣传“低显存”；
A08 Windows 依赖与可信检测、UNKNOWN 字段完整；
A09 ≥12 负向、Top 10、对应处理；
A10 Novice First DoD：中文用户路径、三条恢复和真实 UX 缺口；
A11 仅允许的 docs 文件变更，无隐私/模型/私密文件；
A12 git diff/Markdown/编码/真实 CI 状态；
A13 main 和 #16–#18 未被操作，未启动生产或真实模型；
A14 唯一可执行的下游建议及硬停止条件。

每项 PASS/FAIL/BLOCKED 并附来源与证据；真实 Windows/GPU、试听、UI、模型运行和微信测试一律 NOT_RUN/OUT_OF_SCOPE，不能伪装 PASS。

## 13. DeepSeek 最终回报模板

标题：《Plan 07-A · RVC 上游许可与依赖静态审计报告》

一、research 分支 / PR / base / head / OPEN；
二、main/#16/#17/#18 最新核验与 CI 区分；
三、各上游 SHA、许可证矩阵和引用；
四、/show_model /convert 等接口、音源授权输入与真实缺口；
五、Whale Audio/Relay 的兼容形态及 07-B Fake 输入；
六、Windows/CPU/GPU、依赖/安装/维护/权利风险；
七、小白首次操作路径和至少三条失败恢复；
八、A01–A14 PASS/FAIL/BLOCKED 证据；
九、检查命令真实输出、PR 最新 CI run、未运行哪些测试；
十、唯一结论 APPROVE_FAKE_ADAPTER_DESIGN 或 BLOCKED_UPSTREAM；
十一、所有未授权生产/模型/微信/下载/合并操作未执行；
十二、下一步只给建议，不能自行启动 07-B 或改变 docs/plans 的 SENT/DONE。

**停止条件**：任何需要执行未获授权的安装、模型、GPU、歌曲下载、付费、生产写入、微信发送、合并/Force Push、扩大工程文件范围时，停止并报告事实。只读研究完成后停止，由 ChatGPT 验收、重排和派发后续任务。

**DSH 上下文交接提醒**：Plan 03-A 到 07-A 属清晰任务边界，推荐新开 DS 对话，首先阅读本文件与 AGENTS.md。切换对话不代表重启任何服务。
