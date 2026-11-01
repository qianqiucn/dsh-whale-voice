# Plan 05-B-F01 · 必填功能观察对象的显式 undefined 拒绝
**版本：v1.0 · 2026-10-25 · Level 2 / DONE（历史派发版本v1.0）。**
**父任务：Plan05-B DONE / OFFLINE；功能等级OFFLINE / NOT_INTEGRATED。**
**执行：DeepSeek；计划与验收：ChatGPT。继续原PR #22，不创建新PR或新主Plan。**

## 最新独立验收（2026-10-25）· 05-B/F01 DONE / OFFLINE

本节替代之前REVIEW_REQUIRED作为当前结论；旧复现与首轮验收保留历史。
#22 OPEN/非Draft/0 reviews，HEAD `9d716583da69054ac06733a9dd18ca29b4681fbe`，base仍#21分支@da3d0f7；相对父精确三个added +1650/-0，父五文件未变。新[run40240851940](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40240851940)直接读取head_sha匹配本提交，build/ui各步骤SUCCESS。
源码改动仅在buildFeatures调用底层函数前增加isPlainObject守卫；无全局优先级重排、父函数变更或输出权限提升。ChatGPT独立运行36+81=117/117 PASS（Node v24.22.0），旧四组activeFeature×受影响feature与双undefined探针均返回固定MANIFEST_INVALID/准确功能路径/固定reason、无value。
全仓库293/292/1、UI24/24、本机build/privacy为DS报告；ChatGPT核对CI步骤并静态审查三文件，未本地重跑全仓库/UI，机器未操作依DS声明。

| ID | 复核结果与证据 |
|---|---|
| D01 | PASS：原#22/正确父base/新完整HEAD，开放PR仍7，#21未变 |
| D02 | PASS：U01/U02及5组独立探针全部按固定错误拒绝 |
| D03 | PASS：U03–05非普通值拒绝，合法{}、null原型、冻结对象保持 |
| D04 | PASS：U06/U07与V既有用例，顺序/脱敏/getter零执行/首访和动作不退化 |
| D05 | PASS：U08直接断言父undefined仍合法，父81独立PASS，差异无父文件 |
| D06 | PASS：36项与81项共117独立PASS；修复前7失败为DS记录，旧探针旧SHA曾独立复现放行 |
| D07 | PASS（来源限定）：三文件差异、当前HEAD CI build/ui成功，DS全量本机报告与本轮专项来源分开 |
| D08 | PASS（本阶段）：中文数据不完整恢复、MOCK/未集成说明保留，无运行入口/合并或生产变更 |

| ID | 原C矩阵复核 |
|---|---|
| C01 | PASS：main/#16/#21/#22及03-B状态核实 |
| C02 | PASS：原分支/原PR/父base未变 |
| C03 | PASS：相对父仅三added，+1650/-0 |
| C04 | PASS：完整六字段和功能map，undefined按固定错误拒绝 |
| C05 | PASS：原描述符属性检查保留，U07无getter执行 |
| C06 | PASS：只导入两纯模块，使用既有helper，未复制Schema |
| C07 | PASS：task配对与活动/非活动观察类型完整验证，U01–03/U06 |
| C08 | PASS：双首访、组件分类及依赖隔离，V17–21/U08 |
| C09 | PASS：九键/六actions恒false，Fake不升级真实READY |
| C10 | PASS：Task白名单与固定错误映射，V23/U03/U07 |
| C11 | PASS：原深冻结/确定性/输入不变，V24；源码无状态写入 |
| C12 | PASS：V28+U8+父81共117独立PASS，原漏测现已覆盖 |
| C13 | PASS（来源限定）：DS本机全量/build/UI/docs/privacy报告，ChatGPT核对对应CI且本地专项117通过 |
| C14 | PASS：9d71658精确head run40240851940成功 |
| C15 | PASS（阶段性）：中文故事板/错误恢复与未实现事项保留，无最终GUI可用性宣称 |
| C16 | PASS（可见代码/报告）：无Host/模型/发送入口、无PR合并；不从Git证明机器全部行为 |

**决定：05-B/F01 DONE，PR_OPEN，OFFLINE。** 05-A/F01仍DONE。下一份仅[07-B原创Fake协议](07-B-rvc-fake-gateway-offline-protocol.md)，不自动合并父子PR。原第14节为首轮历史审查，不再代表当前状态。

## 1. 唯一目标和替代关系
修复一个已独立复现的契约缺口：05-B要求observationsByFeature的两个必填功能键各自持有普通观察对象，但当前显式undefined会被05-A的可选参数默认行为当作空观察对象接受。
本修订只收紧05-B组合层，不改变已验收05-A的“projectFeatureAvailability(feature, undefined)表示全部UNKNOWN”的公开行为。
本文件补充原[05-B任务书](05-B-audio-core-readonly-view.md)第6–10节；原版本、错误码、固定顺序、三个文件范围、V01–V28和C01–C16继续有效。
修复后仍是离线只读视图，没有新增真实用户功能。未通过之前不进入06/07-B或另一个模块。

## 2. 实时基线与证据（执行前重查）
- main：bf9cf66807e12d0b25872a0fa3869962dde04818。
- PR #22 OPEN、非Draft、0 reviews；分支feature/plan05b-audio-core-view。
- #22 HEAD：08a8f64ee9b6a6ca859a9ed734d2122950c46a73。
- #22 base：feature/plan05a-whale-audio-core-contracts @da3d0f7f34df99f11d21cf3a656adcfaa206ce25，父PR #21未合并。
- #22相对父分支恰好三个added、+1371/-0；merge-base是精确父SHA，ahead_by=1。
- [CI40239317990](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40239317990)对应当前#22 HEAD，build/ui各步骤SUCCESS。
- ChatGPT独立从该SHA读取三文件及父合同，在本地隔离副本重跑28+81=109 tests /109 pass /0 fail。全仓库285/284/1、UI24/24、build为DS报告；ChatGPT核查CI成功，未本地重跑全仓库/UI。
- #16仍OPEN @954a01a08587bc8bd5b8caccf026298ca54d5215；Plan03-B WAIT_USER_AUTHORIZATION；#17规划当前HEAD b92b83a81663ebbbc55ff2cad32fa0977fbdc1ae（本轮文档提交前）。
任何新HEAD/base/父分支变化都需先核实，不依赖此历史快照强行覆盖。

## 3. 只读阅读与已完成保护
读取AGENTS、原05-B、本F01、NOVICE_FIRST_PRODUCT_STANDARD；再读#22的core-view、测试、说明，及父分支feature-manifest的可选observations语义。
05-A/F01仍DONE，不重新打开其任务；临时PR整理工作已经结束，不作为本修订的一部分，不写临时整理任务书或报告到仓库。
已经通过的双功能组合、首访隔离、Task验证、白名单脱敏、深冻结、六actions恒false全部保留。

## 4. 唯一允许修改的三个文件
| 文件 | 必须的最小改动 |
|---|---|
| core/audio/core-view.mjs | 在传给projectFeatureAvailability前显式要求每个功能的观察值为普通对象 |
| test/audio-core-view.test.mjs | 保留V01–V28，新增U01–U08参数化回归，证明修复前失败与修复后成功 |
| docs/WHALE_AUDIO_CORE_VIEW.md | 解释缺键/显式undefined/合法{}区别，更新实际测试结果 |

禁止修改父PR五文件、Host/UI/config、package/锁文件、CI、已有其他测试和docs/plans。禁止新增第4个文件或依赖。DeepSeek不负责写规划注册表。

## 5. 已复现最小输入
```javascript
const input = {
  schemaVersion: 1,
  activeFeature: 'voice-bubbles',
  taskRecord: null,
  observationsByFeature: {
    'voice-bubbles': {},
    singing: undefined
  },
  acknowledgedByFeature: {},
  manifestRevision: 'plan05a.v1'
}
projectAudioCoreView(input)
```
当前：ok:true，singing被当作全部UNKNOWN。
必须：ok:false，无value，错误为：
```json
{
  "ok": false,
  "errors": [{
    "code": "CORE_VIEW_MANIFEST_INVALID",
    "path": "observationsByFeature.singing",
    "reason": "feature observations could not be validated"
  }]
}
```
把activeFeature切成singing，或将undefined放到voice-bubbles，也必须拒绝。ChatGPT已实际复现2个activeFeature×2个受影响feature四种组合，以及两值同时undefined，当前全部错误放行。
位置：当前core/audio/core-view.mjs:239–240，直接把readField(...).value传入具有默认undefined语义的底层函数；V11目前没有覆盖这种输入。
本函数公开接收JavaScript对象，且原任务专门约束隐藏/Symbol等非JSON输入；不能用“JSON可能删除undefined”代替本层校验。结果仍为MOCK_ONLY、realReady=false、actions全false；不夸大为真实生成或发送。

## 6. 唯一修复方案
复用core-view中现有isPlainObject helper，在buildFeatures的固定feature循环中：
1. 保留既有revisionProbe与dependencies读取顺序。
2. 经已验证的数据属性读取当前功能observations。
3. 在调用projectFeatureAvailability之前检查isPlainObject(observations)。
4. 不满足时返回第5节同一固定错误；路径只能由FEATURE_IDS中的静态feature拼接。
5. 普通对象才交给既有projectFeatureAvailability校验组件/枚举/属性；其失败仍映射同一固定错误。
不得把undefined转换为{}、删除该功能、跳过非活动feature或返回部分成功。不得改父模块默认值或复制一份组件枚举/Schema。
也不把此项检查提前为全局新扫描，以免改变Voice→Singing的错误优先级。其他任务验证顺序、Schema版本、导出和成功结构不变。

## 7. 输入/错误兼容规则
| 输入 | 必须结果 |
|---|---|
| observationsByFeature缺voice-bubbles/singing键 | 原CORE_VIEW_INVALID_REQUEST，对应静态路径，reason required |
| 任一键存在且值undefined | CORE_VIEW_MANIFEST_INVALID，对应功能路径，固定reason |
| null/数组/字符串/数值/布尔/函数/类实例/自定义原型对象 | 同一MANIFEST_INVALID，不成功 |
| {} | 合法观察对象，按原规则全部UNKNOWN，仍MOCK_ONLY |
| Object.create(null)且无非法键 | 合法 |
| 冻结合法观察对象 | 合法 |
| 普通对象含非法组件/状态/隐藏/Symbol/accessor | 仍由父契约拒绝，组合层映射MANIFEST_INVALID |
| 顶层或map的隐藏/Symbol/getter | 原checkLayer拒绝，不执行访问器 |
| 底层projectFeatureAvailability(feature, undefined)直接调用 | 保持原合法UNKNOWN行为，不改父合同 |

错误不包含原始值、未知键名、私密标记或异常堆栈。source/task相关校验不放宽。无新增权限、时间、ID、持久化或队列。

## 8. U01–U08自动化回归矩阵
每行至少一个node:test；矩阵每个元素逐项断言，不仅检查“不抛错”。
| ID | 准备与必须观察结果 |
|---|---|
| U01 | 两activeFeature×两受影响feature=4组显式undefined：全部MANIFEST_INVALID、path准确、reason准确、无value |
| U02 | 两值同时undefined：第一个错误固定voice-bubbles；保留Voice→Singing顺序 |
| U03 | 两feature分别输入null/数组/字符串/数字/boolean/函数/Date/Map/类实例/自定义原型：固定拒绝；不字符串化输入 |
| U04 | 缺键与显式undefined区分；两个{}仍成功UNKNOWN；所有成功动作开关false |
| U05 | 两feature普通/null原型/冻结合法观察对象均可用；有合法VERIFIED输入时仍realReady=false |
| U06 | 错误优先级：坏revision+undefined仍先revision；合法revision、坏task+undefined先功能观察；Voice与Singing同时坏按Voice先；不引入全局重排 |
| U07 | 功能map已知键的getter/隐藏属性/Symbol和观察对象里的getter继续拒绝；计数0、输入不变、错误不含虚构marker |
| U08 | 原父公开函数undefined仍合法；组合层拒绝；空对象组合结果仍与公开函数一致，双首访隔离、固定导入和六actions不退化 |

先在旧HEAD加至少U01/U02代表例，记录真实失败，再做局部修复；原28项及父81项全部保留。新用例可细分，但不得用手工PASS表替代Node运行。

## 9. 单一执行顺序
1. 核验main/#16/#21/#22、完整HEAD/base、reviews、CI、工作区；不另建PR。
2. 原测试文件新增U矩阵，获取修复前失败证据。
3. 在core-view现有buildFeatures中做最小类型守卫。
4. 文档准确说明本层必填object与底层可选参数差别，更新统计。
5. 跑第10节检查，确认父五文件未动、仅原三文件有本轮差异。
6. 正常commit/push到原分支，更新#22自身描述的新修订/统计/CI；不改变base。
7. 新HEAD对应CI完成后交报告，停止。未完成如实PENDING，不借旧绿灯。

## 10. 必须检查
仅使用已安装环境：
```powershell
node --check core/audio/core-view.mjs
node --check test/audio-core-view.test.mjs
node --test test/audio-core-view.test.mjs
node --test test/audio-core-contract.test.mjs
node --test
node build.mjs
git diff --exit-code -- client.js
git diff --check
git diff --cached --check
git diff --name-status 08a8f64ee9b6a6ca859a9ed734d2122950c46a73...HEAD
git diff --name-status da3d0f7f34df99f11d21cf3a656adcfaa206ce25...HEAD
```
前一差异只应涉及本轮三文件，后一差异相对父仍为三added；父五文件内容不变。build必须无client.js差异；全量无新失败，既有平台skip如实。
UI已完整可用才npm.cmd run test:ui，否则NOT_RUN，不安装。现有docs完整性、staged diff隐私扫描与新HEAD CI必须如实报告；不改现有CI。
本次不要求重跑临时整理任务，不要求重算全部PR的模拟合并。

## 11. 异常决策与安全边界
| 情况 | 唯一处理 |
|---|---|
| #22/父#21已被他人推进或合并 | 只读比对，保留修改；依赖不一致先报告，不擅自merge/rebase/改base |
| 必须改父模块或第4文件 | 停受影响步骤，报告最小需求 |
| 测试失败 | 修原三文件，不删安全意图、不放宽原任务合同 |
| 工作区有未提交内容 | 保全，不清空/覆盖，不改写历史 |
| 需要安装/模型/真实音频/微信/生产配置 | 不执行，仍OFFLINE |
| 发现真实秘密 | 停提交，不复制值 |

#16合并授权仍独立；不得借修订合并任何PR、关闭#18、删除分支、强推、发布或重启。无生产状态变化，无生产回滚。三文件源码可通过后续正常提交撤回，不删除历史。

## 12. Novice First DoD
本次没有新UI，保留原双入口故事板与中文恢复：
Voice/Singing各自只读检查与独立首访；RVC首发、Seed-VC暂不支持；无GPU不编造CPU能力；缺微信不阻断仅生成路径。
{}明确表示“已提供观察容器，组件状态未知”；undefined或缺键是接口输入无效，不能包装为一次成功检查。未来界面应显示“状态数据不完整，请重新检查”，可返回或稍后再说；本轮只写文档，不接真实按钮。
保留组件缺失→重新检查/以后再说；材料无权→更换合法材料；权限不明→只保存不发送。
普通用户不需要终端/Git/pip/JSON。研发命令不计入最终用户路径；动作六键仍全false，Fake≠READY，SAVED≠APPLIED/SENT_LOCAL。

## 13. 修订验收D01–D08
| ID | 必须条件 |
|---|---|
| D01 | 原PR#22/父base/HEAD准确，无新PR或父修改 |
| D02 | 显式undefined在四组及双undefined均按固定错误拒绝 |
| D03 | 非普通观察值拒绝，合法{}、null原型、冻结对象保持 |
| D04 | 错误优先级/脱敏/属性检查/首访与动作不退化 |
| D05 | 05-A底层undefined默认行为和父81项不变 |
| D06 | 原V01–V28+U01–U08全PASS，记录修复前代表失败 |
| D07 | 三文件、Node/build/docs/diff/privacy/UI与新HEAD CI证据真实 |
| D08 | Novice First说明准确，仍OFFLINE，无合并/安装/生产/发送 |
同时重新提交原C01–C16验收表，不只报“undefined已修”。

## 14. 首轮历史：C01–C16独立复核
| ID | 本轮结果与依据 |
|---|---|
| C01 | PASS：main/#16/#21/#22实际核验，03-B未授权 |
| C02 | PASS：#22唯一后续PR、base正确，merge-base=da3d0f7 |
| C03 | PASS：相对父精确三added +1371/-0，无父五文件改动 |
| C04 | FAIL：两个必填观察值未强制为普通对象，显式undefined错误成功 |
| C05 | PASS：新增两层Reflect.ownKeys/描述符与V10、继承父F01策略 |
| C06 | PASS：只导入两纯模块、复用已有规则，无第二套Task Schema |
| C07 | PARTIAL：task匹配正确；非活动功能undefined仍静默接受 |
| C08 | PASS（正常对象范围）：首访/观察隔离、RVC/Seed-VC/微信分类正确 |
| C09 | PASS：九键/六actions false，错误成功输入也没有升级真实能力 |
| C10 | PASS：白名单Task投影、固定错误映射，源码及V23无原始引用 |
| C11 | PASS：新对象图、深冻结、确定性和输入不变，V24 |
| C12 | PARTIAL：原28+父81独立109/109通过，但漏显式undefined负向 |
| C13 | PASS（来源限定）：DS本机全量285/284/1、UI24/24报告；ChatGPT核对CI各步骤且本地复跑109专项，不冒称全量本地复验 |
| C14 | PASS：新#22 HEAD run40239317990 build/ui成功 |
| C15 | PASS（阶段文档）：双流程、三恢复、演示禁用与未实现门槛保留；需补本修订无效容器说明 |
| C16 | PASS（可见代码/报告）：无真实运行入口、无merge，机器生产未操作依DS声明 |
首轮历史结论：05-B REVIEW_REQUIRED，05-B-F01 SENT，PR#22 OPEN；05-A/F01仍DONE，不进入下阶段。

## 15. 报告格式
标题《Plan05-B-F01 · 必填观察对象校验修复报告》：
1. 原PR#22的新完整HEAD、base/父SHA、main/#16/#21执行前后状态、reviews及新CI。
2. 三文件差异、修复前最小复现与失败证据、修复后精确错误对象及行号。
3. U01–U08参数矩阵、原V01–V28和父81测试总数/通过/失败/skip。
4. D01–D08与C01–C16逐项PASS/FAIL/BLOCKED及证据。
5. full Node/build/UI/docs/diff/privacy及新HEAD CI；不能沿用40239317990。
6. {}与undefined/缺键区别、父合同不变、中文恢复与仍未集成事项。
7. 未解决问题与未执行的危险操作；结论READY_FOR_PLAN05B_F01_REVIEW或REVIEW_REQUIRED。
不代替ChatGPT打DONE，完成后停止。

## 16. 对话交接建议
继续当前DeepSeek对话完成同一PR小修，不需要重新交接或重复整理仓库。如果确有上下文失真，先保全精确分支/HEAD/父依赖与本任务再换对话；不重启应用服务。
