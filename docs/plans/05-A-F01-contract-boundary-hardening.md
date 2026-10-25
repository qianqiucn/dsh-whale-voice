# Plan 05-A-F01 · 纯契约输入边界与错误脱敏修订
**版本：v1.0 · 2026-10-25 · Level 2 / SENT。**
**父任务：Plan 05-A = REVIEW_REQUIRED；工程 PR #21 = OPEN；功能等级 OFFLINE / NOT_INTEGRATED。**
**执行者：DeepSeek；验收与计划管理：ChatGPT。继续原分支、原 PR，不新建重复任务。**

## 1. 唯一目标与替代关系
修复三项已独立复现的输入校验缺口：Relay 完整记录校验缺失、隐藏自有字段被静默忽略、错误路径回显任意键名。
本修订补充并优先于原 [05-A v1.0](05-A-whale-audio-core-offline-contract-implementation.md) 中相关校验细节；原 Schema v1、状态机、五文件范围、全部 52 项安全意图及 B01–B18 继续有效。
不重写三个模块、不重做 04-A/07-A/03-A，不启动 05-B/06/07-B/08/09/13，不修改真实用户功能。

## 2. 已核验基线与证据来源
2026-10-25 GitHub 只读核验：
- main：`bf9cf66807e12d0b25872a0fa3869962dde04818`。
- PR #21：OPEN、非 Draft、base main、0 reviews，分支 `feature/plan05a-whale-audio-core-contracts`，HEAD `0e05061476a97826e7b2bbc2886847d1dbc92fd8`。
- PR #21 仅原定五份新增文件，+2979/-0。
- 当前 HEAD 的 [CI 40236154425](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40236154425) SUCCESS；build/ui 及各步骤成功。
- ChatGPT 从该 SHA 读取全部五文件，在隔离本地副本用 Node v24.22.0 独立重跑原测试：65 tests / 65 pass / 0 fail。
- 全仓库 241/240/1 与本机 UI 24/24 是 DeepSeek 报告数；ChatGPT 核对远端相应 jobs 成功，未在本轮本地重跑全仓库/build/UI。CI 使用 Node 22。
- PR #16 OPEN @ `954a01a08587bc8bd5b8caccf026298ca54d5215`；#17 OPEN @ `913f2f6a59543ff42c166bbddb77900d61565611`（本次规划写入前）；#18 OPEN/Draft；#19 OPEN @ `e21dee8a8192f24a3465f169c761e62d30611e59`；#20 OPEN @ `6007fecd351d0cdb492a4ec5962ac2abe1962242`。
- Plan 03-B 仍 WAIT_USER_AUTHORIZATION。PR #16/#21 均不得合并。

### 三项已复现发现（均 P2，阻断本阶段契约验收）
| 编号 | 当前代码位置（上述 SHA） | 输入与实测 | 必须改成 |
|---|---|---|---|
| F01-01 | relay-handoff.mjs:153–279 | 合法 SAVED 记录删 source/voiceProfileId，改 feature 与 TTS 不匹配、observedAt 非法、lastError 非法，仍 ok:true；source/rights/cancel/delivery 内分别加 token 也均 ok:true | 完整记录验证失败，不能构造候选 |
| F01-02 | task-contract.mjs:232/689/720；feature-manifest.mjs:211/297；relay-handoff.mjs:160 | draft 增加不可枚举 token 或 Symbol 键仍 ok:true；action 不可枚举 send 仍推进 PROCESSING；不可枚举 singing='bad/revision' 被当成普通版本变更 | 拒绝非 JSON 自有属性及所有未知字段，不推进状态 |
| F01-03 | 三模块 safeKeyForPath（task:224、manifest:139、relay:128） | 未知键名 fixture-private-contact@example.test 被原样写入 errors.path；这是纯虚构测试标记 | 未知键一律固定占位，不能回显键名或值 |

候选仍保持 submitAllowed:false；未发现这些问题能触发真实发送。问题是合同接受了应拒绝的数据及返回值泄露任意输入，不能夸大为已发生微信泄露或发送。

## 3. 执行前阅读与授权范围
依次读取规划分支 AGENTS.md、原 05-A、本 F01、NOVICE_FIRST_PRODUCT_STANDARD.md，再读取 PR #21 的五个工程文件和现有 CI 定义。
只读检查 main、#16–#21 当前 HEAD/state、#21 reviews/CI、工作区未提交内容。记录有无他人新增修改；不得覆盖。
允许：原 PR 的局部源代码/测试/说明修订、离线验证、正常 commit/push 和更新自身 PR 描述。
DeepSeek 不修改 docs/plans；本阶段不要求它补 docs/PROJECT_STATUS.md、根 CHANGELOG.md 等范围外文件。五文件专项范围优先，计划记忆由 ChatGPT 维护。

## 4. 唯一允许修改的五文件
| 文件 | 本次最小修改 |
|---|---|
| core/audio/task-contract.mjs | 导出统一 validateAudioTaskRecord；完善字段描述符检查、未知字段固定路径；原 readRecord/状态机复用 |
| core/audio/feature-manifest.mjs | observations/acknowledgements 全部自有键检查与错误脱敏；业务分类不变 |
| core/audio/relay-handoff.mjs | 引入统一 record 验证；去除重复而不完整的记录 Schema 校验；保留候选专属前置和固定结果 |
| test/audio-core-contract.test.mjs | 保留现有 65 项意图，增加本修订 N01–N16 参数化负向/正向回归 |
| docs/WHALE_AUDIO_CORE_CONTRACT.md | 更新新增导出、输入策略、错误路径、复核矩阵和实际测试计数，修正 §5.2 delivery 描述 |

不新增第六个工程文件。不得修改 index.js、core/server.mjs、core/detect.mjs、core/capabilities.mjs、core/config*.mjs、pages.js、setup.js、client*.js、package.json、锁文件、已有其他测试、docs/plans、PR #16/#17/#19/#20。
不通过扩大静态扫描例外、删除测试或降低输入约束来通过。

## 5. 统一完整记录验证（F01-01）
新增唯一公开导出：
`validateAudioTaskRecord(record) -> {ok:true,value:normalizedRecord} | {ok:false,errors:[{code,path,reason}]}`。
用现有私有 readRecord 作为唯一 Schema/跨字段不变量来源，保留 attempt 防异常包装。成功为新的深冻结标准记录；不修改输入、不获取时钟/随机/外部状态。
transitionAudioTask 与 projectAudioTask 继续复用同一验证实现，禁止维护两份不同完整 Schema。

记录全部必填字段：
schemaVersion、taskId、feature、taskType、source、voiceProfileId、deliveryRequested、rights、state、outputArtifactRef、cancel、delivery、lastError、observedAt、mockOnly、realOperationAllowed。
source 仅 kind/ref；rights 仅 state；cancel 仅 requested/confirmed；delivery 仅 state/deliveryId；lastError 仅 null 或 {code}。
沿用原类型、ID、UTC 时间校验、feature/taskType/source 配对、rights/state、artifact/state、cancel/state、lastError/state 约束。schemaVersion=1；mockOnly=true；realOperationAllowed=false；delivery 固定 NOT_REQUESTED/null。
不放宽现有合法状态，不实现真实权限认证或事件历史证明。

Relay 固定流程：
1. 先调用 validateAudioTaskRecord(taskRecord)。不成功时原样返回其安全错误信封，不构造候选。
2. 后续仅使用返回的 normalizedRecord，禁止再次读取原 taskRecord 的字段。
3. 有效记录 state 属 BLOCKED_RIGHTS/CANCEL_REQUESTED/CANCELLED/FAILED/UNKNOWN -> AUDIO_DELIVERY_FORBIDDEN。
4. 其他有效非 SAVED -> AUDIO_STATE_CONFLICT。
5. 有效 SAVED 且 deliveryRequested=false -> AUDIO_DELIVERY_FORBIDDEN。
6. deliveryId 非 string 或不匹配既有 delivery: 安全格式 -> AUDIO_INVALID_ID；taskId 与 deliveryId 不可相同。
7. 返回现有十字段深冻结候选；stage=PROPOSED_NOT_AUTHORIZED，mockOnly=true，submitAllowed/targetVerified/authorizationVerified/backendSelected 全 false。

完整结构错误优先于候选语义；合法 UNKNOWN/CANCELLED 的既有拒绝码不变。有效 SAVED 记录已经通过 output/rights/cancel/lastError 校验，不得为了兼容伪造记录补默认字段。

## 6. 所有自有属性检查（F01-02）
固定输入策略：对象只接受 Object.prototype 或 null 原型；每个自有属性必须是**字符串键、可枚举的数据属性**。允许冻结对象；不要求 writable/configurable 为 true。
- 用 Reflect.ownKeys 检查所有自有键，不能只用 Object.keys。
- Symbol 键一律失败；不读取 symbol.description 或 String(symbol)。
- 未知字符串键，无论 enumerable=true/false，一律失败，不静默丢弃。
- 已知键若不可枚举或是 getter/setter，一律失败；只用 descriptor.value 取值，绝不执行 getter/setter。
- 拒绝有自定义原型的对象，不读取继承字段。
- 保留原循环/重复节点/深度/预算保护；扫描也应使用完整自有键和描述符。不能用 JSON.stringify/parse 洗掉隐藏字段；不能先 spread 再校验。
- 不新增 I/O、第三方库、动态执行；异常仍通过现有 attempt 返回固定安全错误。此策略不宣称可隔离任意恶意 Proxy 代码。

覆盖入口：validateAudioTaskDraft、createAudioTaskRecord 的 draft/metadata、validateAudioTaskRecord、transitionAudioTask 的 record/action、projectAudioTask、Relay 的 taskRecord、projectFeatureAvailability 的 observations、evaluateFirstUse 的 acknowledgedByFeature。
覆盖所有嵌套 source/rights/cancel/delivery/lastError。原标量参数继续原格式校验。

错误契约：
| 情形 | 错误 |
|---|---|
| Audio 未知或 Symbol 键 | AUDIO_UNKNOWN_FIELD；record 已有敏感字符串键仍可用 AUDIO_DELIVERY_FORBIDDEN |
| Audio 已知但不可枚举/accessor | AUDIO_TYPE_MISMATCH |
| observations 未知或 Symbol 键 | MANIFEST_UNKNOWN_OBSERVATION |
| observations 已知但不可枚举/accessor/非法值 | MANIFEST_INVALID_OBSERVATION |
| acknowledgement 未知/Symbol/不可枚举/accessor/非法值 | MANIFEST_INVALID_ACKNOWLEDGEMENT |
| 类型/必填/语义错误 | 沿用原 05-A 对应错误码 |
不新增错误码，不回显未知键。若一个输入同时存在多类错误，可返回多个安全错误；必须 ok:false 且无 value。

兼容性决定：acknowledgedByFeature={} 或缺少某个 feature 键仍代表未确认/showDialog=true；现有 source/record 必填项仍不可省略。observations=undefined 仍等同全部 UNKNOWN。不得把缺省首访状态改成可用或已安装。

## 7. 错误路径固定化（F01-03）
删除“符合 ASCII/长度就可回显任意键”的策略。未知键无论像不像隐私，一律用静态 `<unknown-key>`：
- 顶层：`<unknown-key>`；
- 已知嵌套对象：`source.<unknown-key>`、`rights.<unknown-key>`、`cancel.<unknown-key>`、`delivery.<unknown-key>`、`lastError.<unknown-key>`；
- 参数：`metadata.<unknown-key>`、`action.<unknown-key>`、`observations.<unknown-key>`、`acknowledgedByFeature.<unknown-key>`。
允许精确显示合法 Schema 中的静态字段路径，如 taskId、source.ref、observedAt、observations.audio-core。不能显示未知字符串、Symbol 描述、输入值、错误 stack 或 getter 抛出的文本。
reason 保持固定常量，不能拼接调用者内容。
原 T04 对 errors[0].path==='nickname' 的断言改为 '<unknown-key>'，保留“未知字段必须拒绝”的意图。不是删除测试以掩盖问题。

## 8. 已审定且无需返工的设计
1. tts-selected 固定 REQUIRED：本阶段合理。
2. Seed-VC 五字段依赖定义外使用 SEED_VC_STATUS：允许；保留 OPTIONAL/NOT_READY/notDefault/noAutoInstall。
3. deliveryRequired 在全部 implemented=false 时仍列三个组件：本阶段保守且允许；文档解释它是不可用的发送依赖，不表示真实观测已经缺失，也不阻塞本地生成。
4. 保留两功能首访隔离、RVC 首发、全 Fake VERIFIED 仍 realReady=false、现有取消/UNKNOWN/SAVED 状态机。
5. 原“只改五文件”优先于通用状态文档同步要求；这不作为 DeepSeek 的失败项。

文档 §5.2 当前写“没有 delivery 字段”需改为：允许且必需 delivery:{state:'NOT_REQUESTED',deliveryId:null}；拒绝其他 delivery 状态/字段。测试统计按实际重新汇总；原报告 T 组写35，但实际为36，36+16+11+2=65。不得固定沿用旧数。

## 9. 回归矩阵（保留 T/F/R/S；新增 N01–N16）
每行至少一个 node:test；多输入用参数化逐项断言，不以文档 PASS 替代。先补测试，在旧 HEAD 证明 F01-01/02/03 的代表例失败，再修复。
| ID | 输入/准备 | 必须结果 |
|---|---|---|
| N01 | 合法 TTS/SVC SAVED Fixture 调统一验证与 Relay | 深拷贝、原十字段候选、全部禁提交标志 |
| N02 | 逐个删除 record 的全部必填键 | validate/project/Relay 均 ok:false，不补默认 |
| N03 | feature/taskType 不配对、source.kind 错、voiceProfileId/observedAt 非法 | Core/Relay 均拒绝 |
| N04 | source/rights/cancel/delivery/lastError 内逐个加 token、send 或未知键；lastError 用合法 FAILED Fixture | 校验拒绝，无原样键值回显 |
| N05 | SAVED 带 lastError、确认取消、无 output；UNVERIFIED+SAVED | 拒绝不一致状态 |
| N06 | draft/metadata/action/record 顶层不可枚举未知 token/send | ok:false；action 不推进；输入不变 |
| N07 | source/rights/cancel/delivery/lastError 内不可枚举未知字段 | 各入口拒绝；嵌套不漏检 |
| N08 | 上述对象及 observations/ack 中 Symbol 键，含虚构私密描述 | 拒绝，返回不含描述 |
| N09 | 已知键不可枚举：taskId、observedAt、action.type、observations.audio-core、ack.singing | 规定类型/Manifest 错误；bad/revision 不得作为普通版本变更成功返回 |
| N10 | 已知和未知 getter/setter，带计数器或抛错 | 结构化拒绝；getter/setter 计数为0 |
| N11 | 任意未知键为虚构邮箱、短私密标记、路径、URL、中文 | Audio/Manifest/Relay 全错误序列化均不含标记或值；路径固定占位 |
| N12 | schema 已知字段非法值含同样标记；getter 抛同样标记 | 固定安全错误，不泄露原文/stack |
| N13 | Object.create(null) 合法输入、冻结合法输入；自定义原型/继承输入 | 前两种通过且新拷贝，后者拒绝 |
| N14 | {} ack、单 feature ack、版本变化、undefined observations、全 VERIFIED | 原 first-use/UNKNOWN/MOCK_ONLY 行为不退化 |
| N15 | 所有合法可达状态到 Relay；同一合法候选重复调用 | 仅 SAVED+意图成功；UNKNOWN/取消不重试；确定且无副作用 |
| N16 | 循环/重复节点/过深输入及 Symbol/隐藏字段组合；纯模块静态检查 | 有限返回失败不抛错；import 仍仅本任务纯模块，无 I/O |

测试仅用虚构 fixture；不给真实 Token/聊天/路径/声线。新增“隐私键”是本地构造的无效输入，不是业务输出可使用的 ID。

## 10. 有序执行
1. 核验 Git、工作区、原 PR/HEAD/CI、五文件范围，确认不是另起 05-A。
2. 在原 test 文件补 N01–N16，保存修复前代表性失败证据。
3. 局部修正 task-contract 的完整属性检查与静态错误路径；导出统一 record validator。
4. 修正 feature-manifest 相同边界；保留三项已接受设计。
5. Relay 使用统一 validator 后的规范化副本；删去冲突的重复 Schema 检查，保留候选专属规则。
6. 跑完整离线回归并更新工程说明；固定文档实际行为/数目，保留历史结果为历史。
7. 执行以下检查，确认变更只在五文件内，正常 commit/push 原分支，更新 PR #21 描述。
8. 读取新 HEAD 对应 CI，提交报告后停止。不由 DeepSeek 更新规划文件或宣称最终验收 DONE。

## 11. 命令与预期
仅使用已安装环境，不安装依赖：
```powershell
git status --short --branch
git log --oneline -5
node --check core/audio/task-contract.mjs
node --check core/audio/feature-manifest.mjs
node --check core/audio/relay-handoff.mjs
node --check test/audio-core-contract.test.mjs
node --test test/audio-core-contract.test.mjs
node --test
node build.mjs
git diff --exit-code -- client.js
git diff --check
git diff --cached --check
git diff --name-status origin/main...HEAD
```
构建不得改变 client.js；单测无失败，既有平台 skip 如实报告。UI 环境已完整可用才运行 `npm.cmd run test:ui`，否则 NOT_RUN 并解释，不执行 npm install。执行项目已有文档完整性检查与 staged diff 隐私扫描。
新 HEAD 的 CI build/ui 应成功；QUEUED/IN_PROGRESS/FAILURE 只能如实上报，不能沿用 40236154425。不以本任务授权扩展既有 CI 的安装步骤或下载范围。

## 12. 异常决策树与兼容
| 发现 | 固定处理 |
|---|---|
| #21 HEAD 前进且为他人修改 | 只读比较，保留修改；冲突或范围不明停止报告 |
| main 或 #16 合并状态变化 | 记录新事实；不主动 merge/rebase/cherry-pick，不消解未知依赖 |
| 必须第六个文件/新增依赖/改 Host 才能修复 | 停受影响部分，报最小需要；禁止扩大范围 |
| 原正常测试失败 | 修本次回归；不删原安全意图 |
| 当前测试对未知键原文有旧断言 | 只改为固定占位预期，说明契约隐私收紧 |
| Node/UI 环境缺失 | 已有安全检查继续，如实 NOT_RUN，不安装 |
| 发现真实隐私或秘密 | 停提交，不在报告复制值 |
| 需要真实生成/发送/重启/生产写入/合并 | 不执行，报告独立授权需求 |

Schema 保持1；合法可枚举 JSON 输入和十字段候选兼容。只有原本违反 JSON/白名单的输入与不安全错误路径被收紧；新增 validator 为加法导出。无生产数据迁移、无生产回滚操作；禁止删工程历史或强推。

## 13. Novice First DoD
本次无新 UI，仍 OFFLINE；最终普通用户无需终端/Git/pip/手改 JSON。文档保留：
- Voice：中文入口→只读检查→本功能依赖说明→稍后再说→未来生成/试听/保存→明确授权后可选发送。
- Singing：独立首访→RVC 标准翻唱→合法素材/音色→按需分离/混音→未来试听保存；Seed-VC 暂不支持，无 GPU 不虚构 CPU 可用。
- 三条恢复：组件未知→重新检查/以后再说；素材或音色无权→更换合法材料；发送权限未知→只保存不发送。
- 错误技术信息不含私人键值、路径或堆栈；未知输入不能被包装成生成/安装/发送成功。
- Fake 取消确认不声称真实进程已停；全 Fake VERIFIED 不升级 READY；SAVED 不等于 APPLIED/SENT_LOCAL。
真实安装器、双页面和端到端体验仍由后续计划处理；不要求本次提前实现。

## 14. 验收标准
F01 必须全部满足：
- F01-01 完整记录验证单一来源；嵌套字段、必填、类型、配对和状态不变量全被验证。
- F01-02 全部入口的隐藏/Symbol/accessor 策略一致；没有 getter 执行、静默丢字段、隐式首访确认。
- F01-03 错误信封无任意输入键值回显；保留固定合法 Schema 路径。
- 原 65 项意图与 N01–N16 全通过；重核 B01–B18，不只提交“三项已修好”。
- 五文件范围、build/Node/diff/privacy、最新 HEAD CI 有真实证据；UI RUN/NOT_RUN 有据。
- Novice First 文档、三项已接受设计、误写 delivery 与计数同步正确。
- 无 merge、部署、生产配置、模型、微信、依赖安装、服务操作。

## 15. 完成报告
标题《Plan 05-A-F01 · 输入边界与错误脱敏修复报告》；包含：
1. 原 PR #21、新完整 HEAD、base、执行前后 main/#16 状态、CI run/jobs/reviews。
2. 五文件改动与新增 validator 签名、共享验证调用链。
3. F01-01/02/03 各自修复前最小复现、修复后输出与准确行号。
4. T/F/R/S 与 N01–N16 对照，实际总数/通过/失败/skip。
5. B01–B18 逐项 PASS/FAIL/BLOCKED，有文件/测试证据。
6. build、full Node、UI、docs、diff、隐私及最新 HEAD CI。
7. 用户流程与未集成事项；三个已批准设计保持情况。
8. 未解决项与全部未执行的生产操作；结论 READY_FOR_PLAN05A_F01_REVIEW 或 REVIEW_REQUIRED。
完成后停止，验收由 ChatGPT 执行。不得自动进入新阶段或合并。

## 16. 本轮 ChatGPT 原 B01–B18 独立验收
| ID | 结论 | 依据/限制 |
|---|---|---|
| B01 | PASS | main/#16–#21 状态实时核查，03-B 未授权 |
| B02 | PASS | #21 base main，恰好五份 added，+2979/-0 |
| B03 | PASS（静态/离线范围） | 三模块源码审查与 S01/S02；无真实外部 I/O |
| B04 | PARTIAL | draft 正常 TTS/SVC 规则正确；Relay 未完整验证同一记录 |
| B05 | FAIL | 隐藏字段接受及错误键名回显，F01-02/03 |
| B06 | PARTIAL | Core 不透明引用检查正确；Relay source/voiceProfile 不检查 |
| B07 | PASS（状态机范围） | 源码与 T15–T26；无新动作 |
| B08 | PASS | 取消请求与确认区分；UNKNOWN 终态 |
| B09 | PASS | Audio SAVED、配置 APPLIED、Relay SENT 分离 |
| B10 | PASS | Voice/Singing/RVC/Seed-VC 分类及 F01–F03 |
| B11 | PASS | Fake realReady=false；微信依赖单列 |
| B12 | PARTIAL | 正常首访隔离通过；隐藏非法 ack 未拒绝 |
| B13 | FAIL | 候选禁提交标志保持，但不完整/嵌套敏感输入仍成功 |
| B14 | PASS（可见差异范围） | 无 #16 导入或文件变更；未来映射仍 docs-only，未声称可机械证明原创来源 |
| B15 | PARTIAL | 65/65 独立通过；未覆盖此次复现的关键负向 |
| B16 | PASS（证据来源限定） | 最新 CI build/ui SUCCESS，五文件差异；全量本地数字来自 DS，不冒称 ChatGPT 本地复跑 |
| B17 | PASS（阶段性） | 双故事板、中文恢复、Fake 标签与人工事项；不是最终 GUI 验收 |
| B18 | PASS（代码/报告范围） | 未接 Host/UI/发送，无 merge；无法从 Git 独立证明机器全部行为，生产未操作依 DS 声明 |

**最终：Plan 05-A REVIEW_REQUIRED；Plan 05-A-F01 SENT；PR #21 OPEN；不进入下一模块。**
DSH 对话建议：继续当前 DeepSeek 对话完成同一 PR 的小型修订，无需重新交接；若上下文已明显失真再保全工作后换对话。
