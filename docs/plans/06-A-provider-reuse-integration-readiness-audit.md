# Plan 06-A · 现有 Provider 实现复用与集成前置核验
**版本：v1.0 · 2026-10-26 · EXECUTION-READY Level 2 / SENT。**
**执行：DeepSeek；规划与验收：ChatGPT。原 Plan06 子任务，目标等级 READ_ONLY_AUDIT / NOT_INTEGRATED。**
**唯一方案：跨 PR 固定版本只读核验，直接在对话交付报告；不修改仓库、不新增 PR、不新建第二套 Registry/Fake。**

## 1. 目标和增量
把已有 #16 TTS/SVC Registry、#21 Audio Core、#22 组合视图与 #23 RVC Fake 的复用边界、真实缺口、合并依赖整理成可供用户决定下一次工程授权的证据。
07-B 已验收 DONE，无需重写或重跑其全部测试。05-A/B 及修复、03-A、04-A、07-A/F01 也不重做。本任务只审查未来集成前置；Plan06 的注册/调度实现不因此 DONE。
最终用户界面无变化。防止未合并代码被当成 main 能力，也防止为绕过合并门禁不断新增独立 Fake。

## 2. 已核实基线（2026-10-26，启动时再核验）
| 对象 | HEAD | 状态 / base |
|---|---|---|
| main | bf9cf66807e12d0b25872a0fa3869962dde04818 | 当前基线 |
| #16 | 954a01a08587bc8bd5b8caccf026298ca54d5215 | OPEN / main；03-A DONE，03-B WAIT_USER_AUTHORIZATION |
| #17 | 本任务所在规划提交，启动时读取最新 HEAD | OPEN / main；唯一规划入口 |
| #18 | 42cec57ae7018735cb6c65a4ef8b0a1d80473810 | 历史 Draft，保留 |
| #19 | e21dee8a8192f24a3465f169c761e62d30611e59 | OPEN / main；07-A研究 DONE |
| #20 | 6007fecd351d0cdb492a4ec5962ac2abe1962242 | OPEN / main；04-A研究 DONE |
| #21 | da3d0f7f34df99f11d21cf3a656adcfaa206ce25 | OPEN / main；05-A/F01 DONE/OFFLINE |
| #22 | 9d716583da69054ac06733a9dd18ca29b4681fbe | OPEN / feature/plan05a-whale-audio-core-contracts；05-B/F01 DONE/OFFLINE |
| #23 | a570430e9d5be24aa0f2415b6699cdfa957583f6 | OPEN / main；07-B DONE/OFFLINE |
#23 CI40242597119 build/ui SUCCESS；ChatGPT独立重跑40/40及271边界断言 PASS。DS全量216/215/1、UI24/24为其报告值，ChatGPT未本地重跑全仓库/UI。
事实来源分别记录：GitHub元数据、固定SHA源码、既有CI、DS本地新检查；不得互相替代。

## 3. 阅读入口
先读最新规划分支的 AGENTS.md、本任务、原06、07-B最新验收节；工程恢复读各分支 docs/AI_CONTEXT.md、docs/PROJECT_STATUS.md、docs/ROADMAP.md，摘要旧状态不得覆盖实际Git。
精读固定SHA：
- #16：core/tts/provider-registry.mjs、provider-contract.mjs、provider-config.mjs；core/svc/svc-registry.mjs、svc-contract.mjs；test/tts-provider.test.mjs、test/svc-contract.test.mjs。
- #21：core/audio/ 下该PR新增三模块、对应测试与契约说明；用changed files获得真实文件名，不猜路径。
- #22：core/audio/core-view.mjs、test/audio-core-view.test.mjs、docs/WHALE_AUDIO_CORE_VIEW.md。
- #23：core/svc/rvc-fake-gateway.mjs、test/rvc-fake-gateway.test.mjs、docs/RVC_FAKE_GATEWAY.md。
- #19/#20：docs/SVC_PROVIDER_RESEARCH.md、docs/WECHATAGENT_EXTENSION_INTEGRATION.md，只读采用结论，不重做上游研究。
DeepSeek无需替ChatGPT维护总表或DONE标记。

## 4. 文件与权限范围
全部工程、计划、配置文件只读。可以使用现有GitHub认证查询仓库和CI；必要时正常fetch公开于本私有仓库的分支对象。允许仓库外临时目录保存非敏感源码快照/检查输出；不复制进工作分支。
交付物仅对话中的《Plan06-A · Provider复用与集成前置核验报告》；Git状态NOT_REQUIRED，不建分支/commit/PR，不改PR描述、base或review状态。
不执行checkout覆盖工作区、stash、reset、clean、cherry-pick、rebase、merge、删除。发现脏工作区保留并报告文件相对路径，不打印私密内容。

## 5. 审计记录契约（不是新增运行API）
每条结论必须有：
ID；所属任务；源PR与完整SHA；仓库相对路径+有效行号/导出名；当前行为；分类；后续归属；未解除门禁。
分类只能为：
REUSE_AS_IS（未来基线包含后复用）、EXTEND_EXISTING（未来增量扩展）、MAPPING_REQUIRED（需明确版本/资产映射）、BLOCKED_AUTHORIZATION（缺专项授权）、UNKNOWN（证据不足）。
这五项只用于报告分类，不能写进生产Schema或替代现有错误码。
每PR记录state/draft/head/base/merged/changed files/最新HEAD对应CI结论/review；mergeable=null记UNKNOWN，true只表示当前单PR文本条件，不能当整批可合并证据。

## 6. 已决定的复用原则
#16 的 provider-registry.mjs / svc-registry.mjs 是未来候选目录的复用起点。当前 getRegistryView/getSvcRegistryView 仍 DESIGN_ONLY，implemented/selectable为空、默认ID为空；selectProviderCandidate/selectSvcCandidate 对已知项仍 NOT_IMPLEMENTED。不得重新设计第三份候选目录或把候选健康显示为可选。
TTS 与 SVC 分类保留；同一个共享 Audio Core 不表示混成一个TTS目录。qwen-local仅兼容alias，Qwen参考路径不是默认Provider。Seed-VC后续选配，不挤占RVC首发。
#21拥有任务/双功能依赖/Relay候选边界，#22只组合视图；不新建第二套任务ID、发送队列或UI状态机。
#23只拥有Fixture纯协议；不能充当真实Provider adapter、模型安装检测、媒体解码或发送实现。
未来核心编排→Provider→Artifact→独立Relay的责任不变；WeChatAgent负责微信身份权限。Worker NEVER_WRITE、UNKNOWN不自动重发、SAVED≠APPLIED保留。

## 7. 执行步骤
1. 记录当前本地分支/HEAD/工作区和远端main、#16–#23最新元数据；本地生产组件状态本任务不探测。
2. 若上述工程PR发生新提交/合并，列出基线差异和影响；停止沿旧SHA给出“可直接集成”结论。仍可完成固定版本的安全只读盘点。
3. 按第3节读取源码及测试，为四组已有实现整理导出、输入输出、严格未知字段策略、状态与错误边界。只摘取必要小段，优先路径/行号链接。
4. 完成第9节A01–A12；每项结论必须有实际源码证据，不能只有“已支持”。
5. 拉取每个PR的changed files，交叉列出相同路径，区分源码重叠、文档重叠、#22相对#21差异与相对main累积差异。不要把父文件计入#22独立新增量。
6. 给出依赖图和两组清单：可独立审查的PR；必须父项在先的PR。#21→#22是已知堆叠，#16/#23文本独立不代表语义已互通。#17规划不属于运行前置；#18保留历史。
7. 查询当前HEAD CI；已有成功无需为了本次报告重跑全部Node/UI/build。若需复现一个疑点，仅在仓库外、现有运行时、明确Fixture下执行最小探针；记来源与限制。
8. 按第15节提交报告后停止，等待ChatGPT复核与用户后续授权。

## 8. 兼容和回退
不修改Schema/输入/输出/配置，不迁移数据，不应用任何映射；无生产回滚。
不能原样把07-B请求传validateSvcRequest，也不能把SUCCEEDED_FAKE当normalizeSvcResult合法结果；不能把modelId、voiceProfileId、targetVoiceId当同一个ID。报告写出明确缺失映射，禁止补默认值或静默夹紧。

## 9. 核验矩阵（每项PASS/FAIL/UNKNOWN并附证据）
| ID | 必须核实的情形 | 预期结论 |
|---|---|---|
| A01 | main与八个开放PR实际状态、最新HEAD CI | 每项有来源，旧绿灯不借用 |
| A02 | #16已知/未知TTS与SVC候选选择 | 已知NOT_IMPLEMENTED，未知各自UNKNOWN错误；默认/可选为空 |
| A03 | #16注册/能力/配置模块已有范围与未实现项 | 逐导出复用，不把纯验证器当运行调度 |
| A04 | #21任务所有权、#22组合视图 | 复用已有边界，无第二任务/交付ID |
| A05 | Core source.ref/voiceProfileId→07-B sourceAudioRef/targetModelId | Fixture限制和资产映射缺口列清，08负责 |
| A06 | SVC v1→07-B request/result逐字段 | 列共同/新增/缺失/禁止字段；pitch范围、formant/strength、targetVoiceId、requestId明确 |
| A07 | 假成功、NOT_IMPLEMENTED、AVAILABLE、真实selectable关系 | Fake成功永不提升真实可用、保存/发送权限 |
| A08 | OFFLINE/UNKNOWN/TIMEOUT与取消请求/确认 | 无静默后端切换、自动重试或伪确认 |
| A09 | 唯一taskId/deliveryId和NOT_REQUESTED/PENDING_ROUTER | 都不能构成投递授权；Relay/WeChatAgent分工明确 |
| A10 | changed-files重叠与父子依赖 | #22只按父增量；列出具体相同路径与语义冲突，文本无冲突≠集成通过 |
| A11 | 进入真实06实现前仍缺的条件 | 合并单独授权、版本适配/08资产映射、真实API许可与测试分别列，不混成一个总绿灯 |
| A12 | 新手Voice/Singing首次路径和三种失败 | 中文建议、无用户CLI、未实现明确，不提前改UI/安装器 |

A06至少核对以下负向例的已有测试或源码拒绝点：07-B字段直接进入v1、缺targetVoiceId的Fake结果、越Fake范围pitch、未知模型、submitAllowed=true、TIMEOUT后自动重试。静态核验明确标STATIC；未运行跨PR测试不得写TEST_PASS。

## 10. 封闭决策树
| 发现 | 唯一处理 |
|---|---|
| 已有实现覆盖需求 | 标REUSE_AS_IS，不再实现 |
| 只缺版本/ID映射 | 标MAPPING_REQUIRED，列明确字段/Plan08依赖，不写适配代码 |
| 没有统一运行调度 | 列EXTEND_EXISTING并指出未来增量位置；不当前实现 |
| 真实能力依赖合并/安装/生产 | 标BLOCKED_AUTHORIZATION，继续安全盘点，不操作 |
| CI排队/失败/mergeable未知 | 原样记录PENDING/FAIL/UNKNOWN，不能宣称READY_TO_MERGE |
| 对象/源码无法访问 | 记录UNKNOWN与缺少证据，不猜导出或接口 |
| 新SHA与快照不同 | 报告delta、复核受影响项；不修改已验收事实或追赶实现 |
| 发现新缺陷 | 给最小复现/影响；本任务不顺手修复或开第二PR |

## 11. 安全
不安装依赖/模型/ZIP，不访问真实Gateway/音乐平台，不下载或读取私有音频，不运行Gradio/推理/训练/播放器/设备，不使用微信/Hook/DLL/服务重启/付费API。
不读取或输出.env/token/聊天/联系人/参考音频/生产机器路径。不merge/close PR、改base、force push、删除分支、公开仓库或发布。
正常GitHub只读连接不等于真实后端网络授权。

## 12. Novice First DoD
本次不交付新用户功能，不要求普通用户运行命令。报告用中文说明当前演示和未集成限制。
未来路径固定：Voice或Singing各自入口→只读依赖说明→合法素材/音色→生成/试听/保存→另行选择投递。Voice不强装Singing；无GPU/断网不承诺未经实测CPU或云端回退。
至少三例：组件未连接→重新检查或以后再说；音色/使用权不齐→选择合法材料、不自动下载；超时/取消未确认→核查状态、不自动重试或发送。安装、收费、隐私上传仍需明确同意。
UI/可访问性自动测试本次N/A；真实用户流程仍NOT_INTEGRATED，不能写“新手已能唱歌”。

## 13. Git与检查
不建工程分支/PR，不更新计划台账；交付Git NOT_REQUIRED。保留原工作区所有修改，不自动stash。
仅核对现存CI，不修改工作流、不触发新运行。无源码/文档变更，build/全量Node/UI/diff检查本次N/A；若实际运行了最小探针列命令与结果，未跑不得写PASS。
可读固定SHA源码和Git对象；不做试合并、改base或修改生产checkout。无法核实未来顺序的冲突时标“未模拟合并”，不是验证通过。

## 14. DoD
D01 基线和证据来源完整；D02 A01–A12逐项有定位；D03 已有导出与复用/增量边界清楚；
D04 三层字段/ID/状态映射明确；D05 PR路径交集和#21→#22依赖准确；
D06 每项阻塞分授权/接口/资产/运行验证，不用一句“待集成”代替；
D07 给出唯一推荐：先由ChatGPT依据报告准备具体合并决策，用户授权后另派执行，不当前开展06运行代码；
D08 新手中文路径和三种失败清楚；D09 无仓库/生产副作用；D10 报告后停止。
完成只能标READ_ONLY_AUDIT_COMPLETE，不能标Plan06 DONE、READY_TO_MERGE或RVC INTEGRATED。

## 15. 报告格式
标题《Plan06-A · Provider复用与集成前置核验报告》。
1. 执行前后工作区摘要（非敏感）、main/PR快照、最新CI及证据来源。
2. 已有实现复用表（第5节字段），精确导出/行号。
3. Core/SVC v1/Fake三层字段映射表与六个负向例。
4. A01–A12与D01–D10结果，STATIC/实际探针清楚区分。
5. PR文件交集、依赖图、建议审查顺序、不能预测的合并后风险。
6. 仍需用户授权/Plan08/API与许可/真实测试的独立门禁。
7. 中文新手路径、三种失败与未实现门槛。
8. 测试：仅查询的CI与本次实际执行的检查分别列；未跑标N/A。
9. Git NOT_REQUIRED、仓库无改动、无新PR；未执行高风险动作。
10. 结论READ_ONLY_AUDIT_COMPLETE或EVIDENCE_INCOMPLETE，不自动开始下一步。
只发送报告，不写入仓库；ChatGPT负责把验收结论同步规划分支。

## 16. 新DS对话交接
本轮07-B已闭合，适合现在新开DeepSeek/DSH执行对话。选择能访问文件、终端和Git的工作模式；如果界面只有Plan/Build，本任务选择只读Plan/分析模式即可，不需要Build写入权限。具体名称依执行端实际界面，不虚构。
先验证仓库remote及工作区，保留未提交内容；不为聊天交接重启DSH/微信/模型。不猜本地仓库绝对路径。
新对话唯一任务是本06-A，不重做07-B或旧修复、不主动接入真实RVC；完成报告发回ChatGPT。
