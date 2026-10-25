# Plan 05-B · Whale Audio Core 双入口统一只读视图（纯组合 / OFFLINE）
**版本：v1.0 · 2026-10-25 · Level 2 / SENT。**
**执行：DeepSeek；计划与验收：ChatGPT。原 Plan 05 的子阶段，不新增主 Plan 编号。**
**父阶段：05-A/F01 DONE / OFFLINE，PR #21 OPEN 未合并。**
**唯一方案：三个新文件、复用 #21 纯模块、明确父分支的后续 PR；不修改已验收源文件。**

## 1. 目标、增量与用户可见结果
将 05-A 的任务投影、两个功能的依赖状态与独立首访提示，组合为一个严格验证、深冻结、脱敏的应用视图。
未来 Voice/Singing 页面只需消费这一份 Core 视图，减少各页面自行解释状态造成“假就绪”、串功能或泄露引用。
本次交付是可自动测试的纯函数与中文说明；没有新页面、Host 路由、真实生成、安装、试听、保存或发送。
05-A 原三个模块及81项测试已经完成，不重写。05-B 只组合现有读取能力；不新建 Core、任务库、Provider Registry、调度队列、持久唯一索引或 Relay。
本阶段05-B也不等于原 Plan05全部完成。后续 Provider/共享资产/GUI/真实集成仍按原依赖单独派发。

## 2. 已核验事实（2026-10-25，执行前再次读取）
| 项目 | 真实结果 |
|---|---|
| main | bf9cf66807e12d0b25872a0fa3869962dde04818 |
| PR #21 | OPEN、非 Draft、base main、0 reviews |
| #21 HEAD | da3d0f7f34df99f11d21cf3a656adcfaa206ce25 |
| #21 CI | run40237933787 SUCCESS，build/ui各步骤成功 |
| ChatGPT独立验证 | 新SHA 81/81；原探针14组拒绝结果正确；另20个独立边界断言通过 |
| DS全量报告 | 257 tests/256 pass/1 skip；UI24/24、build无client.js差异。ChatGPT核查相应CI成功，未本地重跑全仓库/UI |
| #21范围 | 仅五份新增文件，+3382/-0 |
| PR #16 | OPEN @954a01a08587bc8bd5b8caccf026298ca54d5215；03-B仍WAIT_USER_AUTHORIZATION |
| 新路径与分支 | 核验时不存在 core/audio/core-view.mjs、test/audio-core-view.test.mjs、docs/WHALE_AUDIO_CORE_VIEW.md；新分支名未占用 |
| 既有视图 | core/capability-view.mjs 属历史Capability v3，不是新音频视图；只读参考，不能导入或改动 |

旧报告的“无法生成任何被篡改记录”只能解释为本合同范围的结构与不变量检查，不声称验证了真实历史、材料许可或微信授权。

## 3. 阅读与职责边界
先读规划分支 AGENTS、原05-A、05-A-F01、本05-B、NOVICE_FIRST_PRODUCT_STANDARD、双入口规范；再读 #21 HEAD：
- core/audio/task-contract.mjs：validateAudioTaskRecord、projectAudioTask；
- core/audio/feature-manifest.mjs：listFeatureDependencies、projectFeatureAvailability、evaluateFirstUse；
- core/audio/relay-handoff.mjs 和 test/audio-core-contract.test.mjs（只读理解禁提交边界）；
- docs/WHALE_AUDIO_CORE_CONTRACT.md；
- .github/workflows/ci.yml、package.json、test/docs-integrity.test.mjs。
ChatGPT维护规划；DeepSeek仅实施本任务，不修改docs/plans。
微信权限仍归WeChatAgent，投递归Relay；本视图没有授权核验能力。

## 4. Git依赖与唯一分支方案
本任务依赖已验收但未合并的 #21，采用明确父分支的后续PR：
- 新分支：feature/plan05b-audio-core-view。
- 从精确 #21 HEAD da3d0f7f34df99f11d21cf3a656adcfaa206ce25 创建；不从旧main假装已具备依赖。
- 新PR base固定为 feature/plan05a-whale-audio-core-contracts，head为新分支。
- 标题包含 Plan 05-B、OFFLINE；描述注明 Depends on #21，未合并。
- PR相对父分支仅三个新增文件；相对main会包含父PR五文件，这不是本阶段新修改，报告必须区分。
- 不修改 #21 分支，不自动合并或变更base；后续父PR获授权合并后，重设base/冲突处理另行安排。
- #16仍不作为代码依赖，不复制、导入、合并或cherry-pick。
- 若 #21 已前进、已合并、分支已变或文件已存在，先报告差异，停止依赖有争议的开发，不静默切换方案。
正常创建源分支/提交/推送/PR在本任务范围；PR合并无授权。依赖PR未合并不阻止此独立可审查的离线工作，但阻止宣称main已集成。

## 5. 唯一允许新增的三个文件
| 路径 | 内容 |
|---|---|
| core/audio/core-view.mjs | 单一纯视图组合函数、固定错误码与Schema常量 |
| test/audio-core-view.test.mjs | V01–V28离线组合/隔离/隐私/纯度测试 |
| docs/WHALE_AUDIO_CORE_VIEW.md | 接口、字段、错误、分层、双首访故事板与证据 |

原 #21五文件全部只读，其他源代码/测试/文档也不得修改。禁止UI/Host、package/锁文件、构建脚本、CI、config、docs/plans、生产路径。
不新增依赖、不安装测试环境、不下载模型；不为导出内部helper修改已验收模块。

## 6. 固定导出和输入契约
仅导出：
- AUDIO_CORE_VIEW_SCHEMA_VERSION = 1；
- AUDIO_CORE_VIEW_ERRORS：冻结对象，见第9节；
- projectAudioCoreView(input)。

成功 {ok:true,value}；失败 {ok:false,errors:[{code,path,reason}]}，失败没有value；用户数据错误不throw。

input六个顶层字段全部必填，不接受其他字段：
```json
{
  "schemaVersion": 1,
  "activeFeature": "voice-bubbles",
  "taskRecord": null,
  "observationsByFeature": {
    "voice-bubbles": {},
    "singing": {}
  },
  "acknowledgedByFeature": {},
  "manifestRevision": "plan05a.v1"
}
```
- schemaVersion：整数1；它是新视图输入版本，不更改Task v1或现有Capability v3。
- activeFeature：voice-bubbles或singing。
- taskRecord：null或完整AudioTaskRecord v1。不接受draft/投影/部分记录，不补默认；非null必须与activeFeature一致。
- observationsByFeature：普通对象，恰好两个必填键voice-bubbles、singing，各值为普通观察对象。内部键及枚举由现有projectFeatureAvailability判定；不新增第二套组件枚举。
- acknowledgedByFeature：现有FeatureManifest允许的对象；{}表示两功能未确认；缺单功能记录仍为未确认。直接复用evaluateFirstUse。
- manifestRevision：现有安全版本标记；复用evaluateFirstUse校验，不重新定义正则。
禁止deliveryId、target、backend、provider、命令、URL、路径、正文或字节等顶层扩展字段。

属性策略继承F01：Object.prototype/null原型，字符串自有键，可枚举数据属性；拒绝Symbol、隐藏、getter/setter、自定义原型，不执行访问器。
本模块自己负责input及observationsByFeature两个新增对象层；其余结构委托现有完整验证。不能先spread/JSON克隆洗掉非法字段。新增两层各自自有键数上限32，超限返回INVALID_REQUEST；不遍历未知值。
允许冻结合法输入；不要求writable/configurable=true。不声称隔离任意恶意Proxy；异常返回固定安全错误。
无时钟、随机、文件、网络、进程、计时器或隐式存储。

## 7. 唯一组合流程
1. 用描述符检查input普通对象、全部自有键、六个必填字段及版本/activeFeature。失败立即返回固定安全错误。
2. 检查observationsByFeature恰好两个必填功能键和属性策略；不按activeFeature跳过另一功能。
3. 顺序对voice-bubbles、singing调用listFeatureDependencies、projectFeatureAvailability、evaluateFirstUse。使用既有函数结果；任何一项失败，整个视图失败，不返回部分成功。
4. taskRecord为null时task=null；非null先validateAudioTaskRecord，失败TASK_INVALID；使用其规范化value检查feature是否匹配，合法后projectAudioTask。不能把原始记录直接拼入输出。
5. 从成功的子结果构造第8节白名单输出，递归冻结所有对象/数组；成功每次返回新的对象图，不与输入或前一次输出共享可变对象。
6. 不调用createAudioTaskRecord、transitionAudioTask、buildRelayHandoffCandidate，不分配TaskId/DeliveryId，不修改首访确认。
允许import仅 ./task-contract.mjs、./feature-manifest.mjs；不得动态import或引入现有Host/Capability/Provider/Relay运行模块。

## 8. 成功输出（恰好九个顶层键）
```text
{
 schemaVersion:1,
 mode:"MOCK_ONLY",
 activeFeature,
 features:{
  "voice-bubbles":{dependencies:[...],availability:{...},firstUse:{...}},
  "singing":{dependencies:[...],availability:{...},firstUse:{...}}
 },
 task:null | existingProjectAudioTaskValue,
 actions:{
  canGenerate:false, canInstall:false, canPreview:false,
  canSave:false, canSend:false, canRequestCancel:false
 },
 mockOnly:true,
 realOperationAllowed:false,
 userMessageZh:"当前为演示只读视图，尚未接入真实生成、安装、试听、保存或发送。"
}
```
features每项恰好dependencies/availability/firstUse三键，分别来自现有三个公开函数。task只能是现有projectAudioTask白名单。
actions六键永远false：本视图没有真实命令执行接口；task.hasOutput=true也只是Fake产物，不能变成真实试听/保存权限。
中文顶层文字为固定常量，其他中文使用既有固定子投影。
不得出现source/ref/outputArtifactRef/artifactRef/rights/observedAt/deliveryId/rawError、目标、凭据、原始异常或输入对象。taskId、voiceProfileId、deliveryRequested属于既有公开task投影，可保留。
以上禁止项指原始字段键和私有输入值，不以字符串子串扫描误拒合法静态组件id（例如source-rights）。dependencies中的静态purposeZh/labelZh可包含既有技术说明，但不能增加任意用户输入。
features保留两个功能并按固定构造顺序；activeFeature只影响所选task一致性，不共享首访确认、不隐藏另一页缺陷、不构建第二个任务系统。

## 9. 固定错误码、路径与优先级
AUDIO_CORE_VIEW_ERRORS固定七项：
INVALID_REQUEST: CORE_VIEW_INVALID_REQUEST；
UNKNOWN_FIELD: CORE_VIEW_UNKNOWN_FIELD；
TYPE_MISMATCH: CORE_VIEW_TYPE_MISMATCH；
SCHEMA_UNSUPPORTED: CORE_VIEW_SCHEMA_UNSUPPORTED；
FEATURE_MISMATCH: CORE_VIEW_FEATURE_MISMATCH；
TASK_INVALID: CORE_VIEW_TASK_INVALID；
MANIFEST_INVALID: CORE_VIEW_MANIFEST_INVALID。

| 情形 | code | path | 固定reason |
|---|---|---|---|
| 非普通input或检查异常 | INVALID_REQUEST | $ | input could not be validated safely |
| 缺六个必填之一 | INVALID_REQUEST | 对应静态字段名 | required |
| 新增对象层超过32键 | INVALID_REQUEST | $或observationsByFeature | too many fields |
| 未知/Symbol键 | UNKNOWN_FIELD | <unknown-key>或observationsByFeature.<unknown-key> | unknown field is not allowed |
| 已知隐藏/accessor/错误类型 | TYPE_MISMATCH | 对应静态已知字段路径 | expected enumerable data property of the documented type |
| schemaVersion非整数 | TYPE_MISMATCH | schemaVersion | expected integer schema version |
| 整数版本不为1 | SCHEMA_UNSUPPORTED | schemaVersion | unsupported schema version |
| 非法activeFeature | INVALID_REQUEST | activeFeature | unknown feature |
| 子观察失败 | MANIFEST_INVALID | observationsByFeature.voice-bubbles或.singing | feature observations could not be validated |
| 子首访失败 | MANIFEST_INVALID | acknowledgedByFeature | first-use decision could not be validated |
| 子任务验证/投影失败 | TASK_INVALID | taskRecord | task record could not be validated |
| task.feature与activeFeature不符 | FEATURE_MISMATCH | taskRecord.feature | task does not belong to the active feature |

observationsByFeature缺任一功能键：INVALID_REQUEST，path为对应静态功能路径，reason=required。
manifestRevision错误类型可在顶层TYPE_MISMATCH；字符串但不合法由子函数返回MANIFEST_INVALID，path=manifestRevision，reason=manifest revision could not be validated。
固定校验顺序：新增对象结构→两个功能按voice/singing顺序的依赖/观察/首访→任务。可以首个错误即返回；同一错误类别路径与reason必须稳定。
对manifestRevision/ack的归因：先借evaluateFirstUse(feature,{},manifestRevision)确认revision合法，再用真实ack计算，确保invalid revision固定path=manifestRevision；两功能仍各自计算真实ack。
不透传底层errors/values，只做上述固定映射；不得把错误reason拼接输入或Symbol描述。此函数处理的是视图输入，不把结构错误误报为微信发送UNKNOWN。

## 10. V01–V28自动测试（每行至少一个node:test）
| ID | 场景与必须结果 |
|---|---|
| V01 | 无任务Voice视图：九键、双feature、task=null、六actions=false |
| V02 | 无任务Singing视图：相同共享结构，activeFeature正确 |
| V03 | 合法TTS记录：task与projectAudioTask结果一致 |
| V04 | 合法SVC记录：同一视图函数支持，不复制Task Schema |
| V05 | task与activeFeature交叉：FEATURE_MISMATCH，无部分输出 |
| V06 | 逐个缺六字段及两个功能键：INVALID_REQUEST |
| V07 | 非对象/数组/函数/类实例/自定义原型：结构化失败 |
| V08 | 版本字符串/非整数/未知整数：对应类型/版本错误 |
| V09 | 顶层target/token/provider/deliveryId、任意未知键：拒绝且无回显 |
| V10 | 顶层与功能map的Symbol/不可枚举/访问器：拒绝；getter执行0 |
| V11 | 观察中未知组件/跨功能组件/非法枚举/隐藏键/Symbol：MANIFEST_INVALID |
| V12 | 即使非活动功能观察错误也必须整体失败 |
| V13 | ack非法/隐藏/Symbol/getter：失败且无执行/回显 |
| V14 | 无效/空/路径样revision：安全固定错误 |
| V15 | task为draft/投影/部分记录：TASK_INVALID，不补字段 |
| V16 | task嵌套敏感字段/隐藏/Symbol/accessor：TASK_INVALID，沿用F01 |
| V17 | Voice已确认/Singing未确认：两功能firstUse保持独立 |
| V18 | manifestRevision变化：两功能按各自版本重新提示 |
| V19 | 全Fake VERIFIED：两feature仍MOCK_ONLY/realReady=false，actions全false |
| V20 | 缺微信组件只进deliveryRequired，不污染生成必需集合 |
| V21 | Seed-VC VERIFIED仍后续不可用、非首发必需；RVC集合不变 |
| V22 | 九个合法可达Task状态逐个投影：UNKNOWN/取消/SAVED均显示既有演示文本 |
| V23 | 输出与JSON序列化中不含原始source.ref/outputArtifactRef/rights/时间或私密错误标记；允许taskId/voiceProfileId |
| V24 | 成功结果逐层冻结、每次新对象图；输入深比较不变，尝试改输出不能污染下次 |
| V25 | null原型/冻结合法输入可用；原型继承不能替代必填字段 |
| V26 | 循环/过深/重复节点非法task与>32键新增对象层：有限失败不抛错 |
| V27 | 直接调用与组合结果逐项对照两feature公开函数，输入变化只影响对应feature；不承诺进程级原子快照 |
| V28 | 静态导入仅两纯模块；无I/O/时钟/随机/进程/队列/持久化/状态转移/发送候选构造 |

V23的假引用使用artifact:fixture-private-source/out等合法opaque引用，确保不是因非法输入提前拒绝而虚假证明脱敏。V22为两个feature分别创建fixture，配对正确。
非法键和异常内容均用虚构marker；不得读取用户数据。

## 11. 实施步骤与实际检查
1. 复核Git/PR/CI/文件/分支，确认 #21精确HEAD与本任务前置。
2. 从规定SHA建新分支，先写V测试，再实现新纯组合模块。
3. 按错误优先级完成属性/子契约映射、双功能组合、任务隔离及深冻结。
4. 补中文文档和V矩阵，检查不会误导普通用户为真实功能。
5. 执行：
```powershell
git status --short --branch
node --check core/audio/core-view.mjs
node --check test/audio-core-view.test.mjs
node --test test/audio-core-view.test.mjs
node --test test/audio-core-contract.test.mjs
node --test
node build.mjs
git diff --exit-code -- client.js
git diff --check
git diff --cached --check
git diff --name-status da3d0f7f34df99f11d21cf3a656adcfaa206ce25...HEAD
```
新V测试与原81意图全通过；全量无新失败，既有platform skip如实保留；build不得改变client.js。
UI环境已完整存在才npm.cmd run test:ui；缺失写NOT_RUN，不安装。运行已有docs完整性检查和staged diff隐私检查。现有CI不改；GitHub既有UI job的锁定依赖安装与本地额外安装区分报告，不扩展工作流。
6. 正常提交推送，新PR指向规定父分支；检查PR相对base仅三个added。读取新HEAD对应CI build/ui结果。最新CI未完成只能PENDING，不能称通过。
7. 输出完成报告并停止。

## 12. 封闭异常决策树与迁移
| 事实变化 | 固定动作 |
|---|---|
| #21有新HEAD/合并/base变化 | 只读比较并报告，不擅自采用新依赖或重设base |
| 新路径/分支/同目标PR已存在 | 不覆盖，查是否已有实施，报告复用建议 |
| 需要改原五文件/第4个新文件/新增依赖 | 停受影响部分并报最小理由，不扩大范围 |
| 底层合同拒绝输入 | 固定映射错误；不删字段后重试、不补合法默认 |
| 需要真实安装/探测/媒体/微信/生产API | 保持未集成，停止该操作 |
| 测试失败 | 在新三文件内修复；不得降低原81项意图或放宽属性策略 |
| 发现真实秘密/隐私 | 停提交，不复制值 |
无需生产迁移或生产回滚。新文件不被现有Host/UI导入；源分支撤回通过普通新提交处理，不删除远端历史、不强推。不沿用原契约文件为“已合并”。

## 13. Novice First DoD（当前阶段）
未来两入口共用中文视图，但首访仍独立；Voice首次确认不能绕过Singing说明。每个feature显示自己的必需/可选/发送依赖；缺微信不阻断仅生成路径。无GPU/未知模型诚实UNKNOWN，Seed-VC暂不支持。
文档给两条未来故事板与三类按钮恢复：
- Voice→检查组件→选模式→稍后再说→未来生成/试听/保存→另行授权发送；
- Singing→独立依赖说明→RVC标准翻唱→合法材料→未来按需分离/混音→试听保存；
- 缺组件：重新检查/以后再说；无素材或音色权利：更换合法材料；投递权限未知：只保存不发送。
本阶段actions全部false，用户并没有可点击的新功能；普通用户不需要运行这些研发命令。当前CLI仅为开发验证，不计入最终产品可用路径。
演示取消不证明进程已停，hasOutput不代表真实音频可播放，SAVED不等于APPLIED/SENT_LOCAL；真实安装器、双页面和模型仍待后续专项。

## 14. DoD C01–C16
| ID | 必须条件 |
|---|---|
| C01 | 05-A/F01已验收，实时Git与03-B未授权事实记录准确 |
| C02 | 新分支从精确父SHA创建；唯一后续PR、base正确，父PR未被改动 |
| C03 | 相对父base仅三个规定文件，原五文件与Host/UI/config未变 |
| C04 | 六字段输入+两feature map严格验证，版本与错误优先级明确 |
| C05 | 属性策略继承F01，隐藏/Symbol/getter无旁路 |
| C06 | 复用既有验证/投影/Manifest，无第二套Task/依赖Schema |
| C07 | 选定task与activeFeature一致，两feature始终各自完整校验 |
| C08 | 首访/观察互相隔离，Seed-VC/RVC/微信分类不退化 |
| C09 | 九键成功结构/六actions恒false/全Fake不升级真实能力 |
| C10 | 仅task公开投影，无原始ref/rights/时间/任意错误回显 |
| C11 | 深冻结新对象图、确定性、输入不变、无持久状态 |
| C12 | V01–V28与原81意图全PASS，覆盖真实安全结果不只计数 |
| C13 | 全量Node/build/docs/diff/privacy与UI状态真实；client.js无差异 |
| C14 | 新PR最新HEAD的build/ui CI真实，不借用父PR绿灯 |
| C15 | Novice First双故事板、中文恢复、演示禁用与人工门槛准确 |
| C16 | 无合并/部署/安装/真实媒体/微信/服务/生产变化；等级仅OFFLINE |
全部满足后交ChatGPT验收；DeepSeek不得自行改规划DONE。

## 15. 完成报告固定栏目
标题《Plan 05-B · 双入口统一只读视图交付报告》：
1. main/#16/#21/新PR的执行前后state/base/完整HEAD/reviews/CI及父依赖。
2. 相对父PR三个文件的差异，与相对main累计差异分别报告。
3. 导出签名、六字段输入、九字段输出、七错误码、验证顺序。
4. 两feature和选定task的合法/拒绝例；明确六actions恒false。
5. V01–V28逐项、原81回归、全量/平台skip/build/UI/docs/privacy及最新CI。
6. C01–C16逐项PASS/FAIL/BLOCKED，附行号与证据。
7. 两条普通用户未来流程、三类恢复、仍未支持的安装/真实生成/GUI。
8. 未解决项、未执行的高风险操作；结论READY_FOR_PLAN05B_OFFLINE_REVIEW或REVIEW_REQUIRED。
报告后停止。不得直接推进06/07-B或合并父子PR。

## 16. DSH对话建议
05-A/F01已完成，可在干净工作区准备非敏感交接后新开DeepSeek对话执行05-B。交接注明仓库、main、父PR#21/精确SHA、后续PR的base规则、原81项不改和三文件范围。
新开AI对话不等于重启DSH/微信/模型服务。若继续当前对话也必须重新核验，不能凭长上下文假定父PR已合并。
