# Plan 07-B · 原创 RVC Fake Gateway 纯协议与离线适配验证
**版本：v1.0 · 2026-10-25 · EXECUTION-READY Level 2 / SENT。**
**执行：DeepSeek；计划与验收：ChatGPT。原Plan07子阶段，不新增主Plan编号。**
**等级：OFFLINE / ORIGINAL-FAKE-PROTOCOL。唯一方案：从最新main独立新增三个文件，无代码依赖、无真实网络或模型。**

## 1. 唯一目标与前置决定
实现一个原创、可确定测试的RVC演示网关协议：列出演示模型、验证合法Fixture音频引用与资源上限、模拟转换/取消/未知结果、严格验证返回Artifact描述。
批准依据：07-A/F01研究DONE，04-A研究DONE；05-A/F01与05-B/F01的离线Task/视图边界已经验收。它们满足本次**独立Fake协议**所需的边界设计前置，不表示整个Plan05真实集成已经完成。
按既有队列07-B先于06。06的Provider Registry、08的共享音色/Artifact解析、12的真实工作流、13的真实Relay仍后置。
本轮不导入#16/#21/#22代码，不新增第三层堆叠PR；从main起独立PR。合同映射仅文档说明，不伪称与未合并SVC v1已经接通。
“show_model/convert”只可在文档作为演示操作的功能类比，不创建HTTP路由、不运行Gradio、不宣称上游RVC的/show_model已证实。真实URL allowlist、认证和传输须以后专项；本轮只允许一个固定Fake endpointId，任何URL/命令都拒绝。

## 2. 当前真实基线（执行前重新核验）
| 项目 | 2026-10-25已核实 |
|---|---|
| main | bf9cf66807e12d0b25872a0fa3869962dde04818 |
| #16 | OPEN @954a01a08587bc8bd5b8caccf026298ca54d5215；03-B WAIT_USER_AUTHORIZATION |
| #17 | 唯一规划分支，工程执行只读；本轮状态提交前HEAD0a094cd9dcbb40334d564507e76a785ac6134c27 |
| #19 | OPEN @e21dee8a8192f24a3465f169c761e62d30611e59；RVC研究DONE，直接代码复用/API集成仍BLOCKED |
| #20 | OPEN @6007fecd351d0cdb492a4ec5962ac2abe1962242；WeChatAgent研究DONE |
| #21 | OPEN @da3d0f7f34df99f11d21cf3a656adcfaa206ce25；05-A/F01 DONE/OFFLINE |
| #22 | OPEN @9d716583da69054ac06733a9dd18ca29b4681fbe，base为#21分支；05-B/F01 DONE/OFFLINE |
| #22 CI | run40240851940 build/ui各步骤SUCCESS |
| ChatGPT专项复验 | 36+81共117/117 PASS；四组及双undefined独立探针均拒绝 |
| DS全量报告 | 293/292 pass/1 skip、UI24/24、build无差异；ChatGPT核查对应CI成功，未本地重跑全仓库/UI |
| 新路径 | main无core/svc；本次三个目标文件核验时不存在 |
| 新分支 | feature/plan07b-rvc-fake-gateway核验时不存在 |

新分支从实际最新main建立；若main变化引入svc或目标文件，先比对报告，不覆盖。#16未合并不能假装core/svc/svc-contract.mjs已在main；本阶段不复制其实现。

## 3. 只读阅读与授权
先读规划分支AGENTS、原Plan07、[07-A/F01研究](https://github.com/qianqiucn/dsh-whale-voice/blob/e21dee8a8192f24a3465f169c761e62d30611e59/docs/SVC_PROVIDER_RESEARCH.md)、本07-B、Novice First及RVC集成蓝图。
研究报告重点：§8三层映射、§9职责、§14批准仅限原创隔离Fake。无需重做07-A或下载上游工程。
#16的svc-contract.mjs、#21Task与#22View只读理解边界；不能复制/import/cherry-pick。
允许源码分支、离线测试、正常commit/push、新PR。禁止上游代码复用、模型/音频/软件安装、服务/HTTP监听、用户音源、真实推理/微信、生产配置、合并/关闭PR或删除历史。
临时PR整理任务不重做、不入库。DS不修改docs/plans或现有状态文档，专项三文件范围优先。

## 4. 唯一允许新增文件
分支feature/plan07b-rvc-fake-gateway；base=main，新独立PR，不复用#21/#22。
| 文件 | 必须交付 |
|---|---|
| core/svc/rvc-fake-gateway.mjs | 零import的原创纯协议、内置演示模型、请求/结果验证、确定性模拟 |
| test/rvc-fake-gateway.test.mjs | G01–G40自动化正负/边界/状态/隐私/纯度测试 |
| docs/RVC_FAKE_GATEWAY.md | 签名/Schema/错误/案例/未来映射/中文恢复与未实现边界 |

禁止任何第四文件、既有文件修改、package/锁文件/CI/Host/UI/config/Provider Registry/Task状态机。
模块禁止fs/http/net/child_process/worker/process、fetch、URL/路径执行、Date/时钟/随机/计时器、动态import/require、Promise/async、缓存或模块级可变业务状态。测试可用node:test/assert和fs做静态检查。
不创建服务、真实Gradio客户端、歌曲搜索/下载器、分离/混音器、发送Tool。

## 5. 固定导出
仅允许以下8项公开导出：
1. RVC_FAKE_GATEWAY_SCHEMA_VERSION=1。
2. RVC_FAKE_ERRORS（第9节15个值）。
3. RVC_FAKE_SCENARIOS（第7节七个字符串）。
4. RVC_FAKE_LIMITS（冻结数字与枚举：maxDurationMs=300000、maxByteLength=52428800、inputSampleRates=[16000,22050,24000,32000,44100,48000]、inputChannels=1、outputSampleRate=44100）。
5. listRvcFakeModels()。
6. validateRvcFakeRequest(request)。
7. simulateRvcFakeConversion(request, context)。
8. validateRvcFakeResult(result, request, context)。

所有函数统一成功{ok:true,value}、失败{ok:false,errors:[{code,path,reason}]}；无用户数据throw。成功为新构造深冻结对象/数组，不修改输入；失败无value。
资源上限是**演示协议限制**，不是上游硬件性能、整曲支持或真实可处理承诺。

## 6. Fixture模型目录与请求
listRvcFakeModels()成功value为两个模型的固定有序数组，每条恰好八键：
```text
{
 modelId:"rvc-model:fixture-a" | "rvc-model:fixture-b",
 labelZh:"演示音色A（非真实模型）" | "演示音色B（模拟未就绪）",
 engine:"RVC_FAKE",
 simulatedAvailable:true | false,
 integrationStatus:"NOT_IMPLEMENTED",
 selectable:false,
 mockOnly:true,
 realOperationAllowed:false
}
```
A为simulatedAvailable=true，B=false。每次新拷贝深冻结；无第三模型、真实模型名、权重路径或下载地址。simulatedAvailable不是已安装或真实健康，selectable始终false。

请求七个字段全部必填、只允许：
```json
{
  "schemaVersion": 1,
  "sourceAudioRef": "artifact:fixture-vocal-a",
  "targetModelId": "rvc-model:fixture-a",
  "pitchShift": 0,
  "outputFormat": "audio/wav",
  "inputAudio": {
    "durationMs": 1200,
    "byteLength": 48000,
    "sampleRate": 44100,
    "channels": 1
  },
  "rights": {"state": "CONFIRMED_FIXTURE"}
}
```
- schemaVersion整数1；不是SVC v1或CoreTask版本的同义声明。
- sourceAudioRef仅 `artifact:fixture-` 后接1–48位[A-Za-z0-9_-]。本阶段只收虚构Fixture，不解析或验证真实资产存在。
- targetModelId必须为目录中的两个固定ID之一，不接受模型文件名/路径或voiceProfileId；未知ID失败MODEL_NOT_AVAILABLE。
- pitchShift为整数-12..12；不截断、夹紧、自动更改。
- outputFormat只能audio/wav，必填，无默认格式。
- inputAudio恰好四个必填键：durationMs整数1..300000；byteLength整数1..52428800；sampleRate为枚举之一；channels整数1。
- rights恰好state键，仅CONFIRMED_FIXTURE。UNVERIFIED或其他声明不能运行模拟；不是用户真实媒体/音色授权。
所有可选写法、显式undefined、null替代必填、正文/字节/歌曲ID/URL、provider/target/send/token、formantShift/conversionStrength/gain/separation等未知字段全部失败。
未知参数不得被静默丢弃，未支持能力不得猜值补齐。

## 7. context与模拟结果
context恰好三个必填字段：
```json
{
  "requestId": "request:fixture-demo-a",
  "endpointId": "gateway:fixture-rvc",
  "scenario": "SUCCESS"
}
```
requestId仅request:fixture-后接1–32位安全字符；由调用者注入，不产生全局唯一ID。
endpointId只接受固定gateway:fixture-rvc；无真实地址，不访问127.0.0.1，任何其他endpoint/URL/凭据字段都拒绝。
scenario固定七种：
SUCCESS、OFFLINE、MODEL_MISSING、TIMEOUT、CANCEL_REQUESTED、CANCEL_CONFIRMED、UNKNOWN。
scenario是测试脚本输入，不是可信外部健康证据。

处理顺序：完整request验证→完整context验证→模型B未就绪优先→scenario→构造并校验结果。
模型B无论scenario是什么，合法请求/上下文后均得MODEL_NOT_AVAILABLE；不回退A。模型A按表模拟：
| scenario | result.status | result.code | cancel.requested/confirmed | 音频描述 |
|---|---|---|---|---|
| SUCCESS | SUCCEEDED_FAKE | null | false/false | 有Fixture输出 |
| OFFLINE | OFFLINE | RVC_FAKE_OFFLINE | false/false | 全null |
| MODEL_MISSING | MODEL_NOT_AVAILABLE | RVC_FAKE_MODEL_NOT_AVAILABLE | false/false | 全null |
| TIMEOUT | TIMEOUT | RVC_FAKE_TIMEOUT | false/false | 全null |
| CANCEL_REQUESTED | CANCEL_REQUESTED | RVC_FAKE_CANCEL_PENDING | true/false | 全null |
| CANCEL_CONFIRMED | CANCELLED_FAKE | RVC_FAKE_CANCELLED | true/true | 全null |
| UNKNOWN | UNKNOWN | RVC_FAKE_UNKNOWN | false/false | 全null |

模拟响应成功信封的value恰好十五键：
```text
{
 schemaVersion:1,
 requestId:context.requestId,
 engine:"RVC_FAKE",
 targetModelId:request.targetModelId,
 status,
 code,
 artifactRef, mime, sampleRate, durationMs,
 cancel:{requested,confirmed},
 delivery:{state:"NOT_REQUESTED",submitAllowed:false},
 mockOnly:true,
 realOperationAllowed:false,
 automaticRetryAllowed:false
}
```
SUCCEEDED_FAKE的artifactRef确定为 `artifact:fixture-output-` + requestId去掉`request:fixture-`的后缀；mime固定audio/wav、sampleRate=44100、durationMs=request.inputAudio.durationMs。它只是字符串Fixture哨兵，没有生成文件，也不证明实际音频存在。
其他状态artifactRef/mime/sampleRate/durationMs四者全部null。模型B同MODEL_MISSING的结果。
所有响应的delivery、mockOnly、realOperationAllowed、automaticRetryAllowed保持固定值。timeout/UNKNOWN/取消都不重试、不换后端。
合法协议下的OFFLINE等是ok:true的**模拟响应**，不等于生成成功；结构/输入/结果验证失败才是ok:false。文档必须解释这一区别。

## 8. 结果验证与属性策略
validateRvcFakeResult先验证request和context，再完整验证result及所有嵌套键，构造新的规范化冻结结果：
- 不允许缺任何十五键；cancel/delivery键恰好如第7节。
- schemaVersion、engine、requestId、targetModelId与已验证上下文匹配。
- status/code/cancel、是否含音频、音频固定元数据与scenario/模型规则一致。
- Fake成功ref必须是本次requestId派生值；不收任意路径/URL/真实文件/字节。
- 固定标志不允许翻转；不接受已发送或PENDING_ROUTER冒充本协议状态。
- 未知字段不丢弃，拒绝，不通过JSON清洗后继续。
- 验证Artifact是合同格式/关联检查，不是实际媒体解码或文件存在性验证。
simulate内部复用同一权威结果规则，不维护两份冲突Schema；避免simulate→validate→simulate递归。

所有输入对象层只允许Object.prototype/null原型、字符串自有键、可枚举数据属性。冻结合法对象可用；Symbol/隐藏/accessor/custom prototype均拒绝，不执行getter/setter。
每个被检查对象最多32自有键；超限拒绝。仅遍历固定Schema层，不遍历未知字段值，不对原始对象做递归克隆；循环/数组/深嵌对象放到任意字段都应有限失败、不抛错。
只用属性描述符取值；未知/Symbol键名和描述永不回显。异常固定返回安全错误，不声称隔离任意Proxy代码。

## 9. 错误枚举与封闭规则
RVC_FAKE_ERRORS冻结，键名为以下去掉RVC_FAKE_的部分，值固定：
RVC_FAKE_INVALID_REQUEST、RVC_FAKE_UNKNOWN_FIELD、RVC_FAKE_TYPE_MISMATCH、RVC_FAKE_UNSUPPORTED_VERSION、RVC_FAKE_MODEL_NOT_AVAILABLE、RVC_FAKE_UNSUPPORTED_FORMAT、RVC_FAKE_RIGHTS_UNCONFIRMED、RVC_FAKE_RESOURCE_LIMIT、RVC_FAKE_INVALID_CONTEXT、RVC_FAKE_INVALID_RESULT、RVC_FAKE_OFFLINE、RVC_FAKE_TIMEOUT、RVC_FAKE_CANCEL_PENDING、RVC_FAKE_CANCELLED、RVC_FAKE_UNKNOWN。

失败errors每条仅code/path/reason：
- 未知或Symbol键：UNKNOWN_FIELD；path为所属静态层+`<unknown-key>`；reason=unknown field is not allowed。
- 已知隐藏/accessor或类型错误：TYPE_MISMATCH；静态字段路径；reason=invalid field type or property。
- 缺必填：request用INVALID_REQUEST、context用INVALID_CONTEXT、result用INVALID_RESULT；静态字段路径，reason=required。
- 非普通对象/超32键：所属域INVALID_REQUEST/INVALID_CONTEXT/INVALID_RESULT，path为request/context/result或对应静态嵌套层；reason=invalid object structure。
- request/result整数schema不为1：UNSUPPORTED_VERSION，静态schemaVersion路径；reason=unsupported schema version。
- sourceAudioRef/requestId格式非法：所属域INVALID_REQUEST/INVALID_CONTEXT；静态路径；reason=fixture reference required。
- 不在目录的targetModelId：MODEL_NOT_AVAILABLE，request.targetModelId；reason=fixture model not registered。
- 不支持outputFormat：UNSUPPORTED_FORMAT，request.outputFormat；reason=only fixture audio/wav is supported。
- rights.state不为CONFIRMED_FIXTURE：RIGHTS_UNCONFIRMED，request.rights.state；reason=fixture rights required。
- duration/bytes/pitch整数超限或sampleRate/channels数值不支持：RESOURCE_LIMIT，对应静态路径；reason=outside fixture protocol limits。非整数/非数字先TYPE_MISMATCH。
- endpointId/scenario字符串不在固定集合：INVALID_CONTEXT，对应静态路径；reason=unsupported fixture context。
- result状态/关联/取消/固定标志/元数据不一致：INVALID_RESULT，result；reason=inconsistent fixture result。
- 意外检查异常：INVALID_REQUEST，$；reason=input could not be inspected safely。
可以首错返回；固定顺序为request→context→result，各域先结构/属性/必填后语义。错误不含原始值、未知键、路径、异常或输入引用。

## 10. 与Core/SVC v1/真实上游的未来映射（只写文档）
| 本协议 | 未来映射与当前禁止 |
|---|---|
| sourceAudioRef | 可来自Core source.ref，但真实资产解析/类型/权利仍归08，不在此读文件 |
| targetModelId | 不等于Core voiceProfileId，也不等于#16 targetVoiceId；08需显式音色角色→Provider资产映射 |
| pitchShift -12..12整数 | #16 v1接受-24..24有限数，不能把超本Fake范围静默夹紧 |
| formantShift/conversionStrength | 本协议无这两个字段；以后版本适配需明确支持情况，不能当前乱塞 |
| inputAudio/rights/schemaVersion | 本Fake内部字段，不能把整个request原样传validateSvcRequest |
| context.requestId | 外部关联，#16的v1请求不收此字段；结果关联另外映射 |
| SUCCEEDED_FAKE result | 不含targetVoiceId，不是#16合法归一化结果，不直接交normalizeSvcResult |
| delivery NOT_REQUESTED/submitAllowed:false | #16 PENDING_ROUTER由它自己的归一化产生；两者均非发送授权 |
| show_model/convert功能类比 | 只是本项目Fake设计，不是上游RVC/show_model可用性证据 |

#16未合并且不导入，所以不声称已经运行v1兼容自动测试。未来真正版本适配须在#16获授权合并及08映射后另行实施。
代码复用BLOCKED_CODE_REUSE、直接API接入BLOCKED_DIRECT_API_INTEGRATION不解除。不复制AstrBot/RVCSVC-API任何源码、常量、下载器或模型包。
实际网络只允许以后经单独批准的固定版本/地址/认证/限流/超时/取消协议；本轮固定endpointId替代URL选择，所有URL均拒绝，不能冒称已有SSRF安全HTTP客户端。

## 11. G01–G40自动测试
每行至少一个node:test；所有fixtures显式虚构，禁止真实媒体/凭据。
| ID | 必须证明 |
|---|---|
| G01 | 模型恰好A/B、八键与模拟可用差别、selectable始终false |
| G02 | 目录新深冻结拷贝，读取/修改尝试不污染 |
| G03 | 最小合法请求与边界值通过，七键及嵌套规范化 |
| G04 | 源ref的URL/Windows/UNC/正文/字节/非fixture引用拒绝 |
| G05 | 未知/路径样/voiceProfile样模型ID拒绝，不默认A |
| G06 | pitch整数上下界通过，越界/小数/NaN/Infinity拒绝 |
| G07 | 只允许必填audio/wav，其他格式/undefined拒绝 |
| G08 | 时长1及300000合法，0/300001/小数拒绝 |
| G09 | bytes1及52428800合法，0/超限/非整数拒绝 |
| G10 | sampleRate枚举与channels=1严格，字符串/不支持值拒绝 |
| G11 | 仅CONFIRMED_FIXTURE权利，UNVERIFIED/伪真实授权拒绝 |
| G12 | 顶层target/send/token/provider/song/gain等未知键拒绝 |
| G13 | inputAudio/rights/cancel/delivery嵌套未知字段拒绝 |
| G14 | request/context/result各层Symbol/隐藏/getter/setter拒绝，执行计数0 |
| G15 | 合法null原型/冻结对象通过，数组/自定义原型/类/原始值拒绝 |
| G16 | 循环/深嵌/重复节点非法值及>32键有限失败，无递归失控 |
| G17 | context请求ID、固定endpoint、scenario及未知敏感参数严格校验 |
| G18 | 逐个删除/显式undefined所有request/inputAudio/rights/context/result/cancel/delivery必填字段，拒绝不补默认 |
| G19 | A+SUCCESS产生SUCCEEDED_FAKE，不生成媒体或发送 |
| G20 | B+SUCCESS产生MODEL_NOT_AVAILABLE，绝不换A |
| G21 | OFFLINE状态/代码/null输出/禁重试 |
| G22 | TIMEOUT状态/代码/null输出/禁重试 |
| G23 | MODEL_MISSING模拟状态及固定代码 |
| G24 | CANCEL_REQUESTED仅请求true，confirmed=false，不当已停 |
| G25 | CANCEL_CONFIRMED为CANCELLED_FAKE，两flagtrue，仅模拟确认 |
| G26 | UNKNOWN输出为空且automaticRetryAllowed=false，无切换/重试 |
| G27 | B未就绪优先于scenario，合法context仍必须先验证 |
| G28 | 成功artifactRef关联本次requestId，mime/rate/duration固定准确 |
| G29 | 合法结果验证新冻结副本；模拟响应ok不等于真实成功 |
| G30 | result错误requestId/target/engine/schema拒绝 |
| G31 | result路径/URL/任意artifact或bytes冒充输出拒绝 |
| G32 | result音频格式/采样率/时长不符合Fake规则拒绝 |
| G33 | 非成功四个音频字段必须全部null，不得夹带产物 |
| G34 | cancel标志与状态矛盾拒绝 |
| G35 | delivery SENT/PENDING_ROUTER、submitAllowedtrue、mockOnlyfalse、realOperationAllowedtrue、自动重试true均拒绝 |
| G36 | 错误信封不含未知私密键/值/Symbol/异常/堆栈；使用虚构marker |
| G37 | 请求/上下文/结果输入不变，成功对象图无可变共享 |
| G38 | 重复调用确定、不同请求ID输出不同；不宣称跨进程持久幂等 |
| G39 | 固定endpointId不是网络授权，任意URL/localhost/备用后端字段拒绝 |
| G40 | 源模块无import/require/网络/文件/时钟/随机/进程/异步/队列/持久化 |

不把“模块文件尚不存在”的加载失败当成已覆盖每个负向；完成后报告实际断言和数目。请求/结果成功与错误status均需断言完整字段、flags、null约束与code。

## 12. 有序实施和验证
1. 复核main、开放PR/目标分支/三路径、研究批准范围，确认没有重复实现。
2. 从最新main创建规定新分支，先固定测试fixtures与G矩阵，再实现纯协议。
3. 完成请求/上下文/结果严格结构、模拟状态、目录、固定禁提交和错误。
4. 写中文文档，明确研发上限/Fake结果/未接入三层映射。
5. 使用已安装环境运行：
```powershell
node --check core/svc/rvc-fake-gateway.mjs
node --check test/rvc-fake-gateway.test.mjs
node --test test/rvc-fake-gateway.test.mjs
node --test
node build.mjs
git diff --exit-code -- client.js
git diff --check
git diff --cached --check
git diff --name-status origin/main...HEAD
```
G01–G40实际覆盖且全PASS，全量无新失败，既有platform skip如实，client.js无变化。main不含05-A/05-B，所以不能把本分支全量基线误写为293；按实际计数，严禁从别的PR复制测试进来凑数。
UI环境已完整存在才npm.cmd run test:ui，否则NOT_RUN，不安装。项目已有docs完整性及staged diff隐私扫描必须真实。现有CI不改，不扩大既有工作流安装/下载。
6. 新PR base=main，恰好三个added；正常commit/push，获取新HEAD CI。排队只报PENDING，不能用#22/#19绿灯为新工程背书。
7. 报告后停止，不自行升级06、08或真实Gateway。

## 13. Novice First DoD
本轮没有新页面或真实生成，面向用户文档先用中文解释：这是演示网关，不是已安装RVC，目录音色为虚构，无法试听或发送，所有真实能力仍未支持。
未来路径：唱歌→独立依赖说明→RVC标准翻唱→合法本地素材/音色→按需分离/转换/混音→试听保存→另行授权发送。Voice可独立使用，不强装Singing或微信依赖。
至少给六条中文状态与恢复：
- OFFLINE：“翻唱组件尚未连接；重新检查或以后再说。”
- MODEL_NOT_AVAILABLE：“目标音色尚未准备好；重新选择合法音色，不自动下载。”
- RESOURCE_LIMIT：“素材超出演示协议范围；使用较短测试素材或返回”，不宣称真实硬件上限。
- RIGHTS_UNCONFIRMED：“未确认素材和音色使用权；更换合法材料。”
- CANCEL_REQUESTED：“已请求取消，尚未确认停止”；仅Fake确认也不冒称真实进程结束。
- UNKNOWN/TIMEOUT：“结果不明，请核查；不会自动重试或切换发送后端。”
Seed-VC不安装、不在目录冒充可用，无GPU不能虚构CPU路径。普通用户无须终端/Git/Python/手改JSON，研发命令不计入最终产品路径。

## 14. 异常决策、迁移与硬停止
| 情况 | 唯一处理 |
|---|---|
| main新增svc/目标文件或同名分支PR | 核查重复并报告，不覆盖，不强行维持旧SHA |
| 需要导入未合并#16/#21/#22 | 本阶段不做，保持独立Fake和文档映射，不复制/merge |
| 需要第4文件/包/Host/真实配置 | 停受影响部分，报最小需求 |
| 上游代码/模型许可或真实参数不明 | 维持BLOCKED/UNKNOWN，不下载、不复制、不猜可用 |
| 测试需降低安全校验才过 | 停止扩大改动，报告 |
| 发现真实秘密/隐私 | 停提交，不复制值 |
| 真实网络/推理/声音/发送/重启/安装/合并 | 不执行，单独授权后才可能另派 |

只有新的Fake协议Schema v1，不迁移CoreTask、SVC v1或插件ID；旧接口和生产链路不动。无生产状态，无生产回滚。源码回退用正常新提交，不删除远端历史/分支、不强推、不发布Release。

## 15. 验收K01–K16
| ID | 必须条件 |
|---|---|
| K01 | 07-A/04-A/05-A/05-B前置及实时Git清楚，03-B未授权不越过 |
| K02 | 从实际main独立分支/唯一PR，base main，仅三added |
| K03 | 原创零依赖纯协议，不复制上游或未合并PR实现 |
| K04 | 目录两Fixture、模型不等于共享VoiceProfile、全局selectable=false |
| K05 | 请求七键/上下文三键/所有必填/范围/权利/属性严格 |
| K06 | 固定endpointId且网络永远不允许，无地址/命令/凭据入口 |
| K07 | 模拟七场景、模型未就绪优先、无默认音色或后端回退 |
| K08 | 十五字段结果/状态关联/Artifact/null元数据准确，结果验证无旁路 |
| K09 | 取消请求≠确认、UNKNOWN/TIMEOUT无自动重试 |
| K10 | Mock禁运行/禁提交始终固定，Fake不是READY或真实产物 |
| K11 | 脱敏错误/深冻结新副本/输入不变/确定性/无持久状态 |
| K12 | G01–G40自动测试全覆盖且PASS，非只给Markdown计数 |
| K13 | 全量/build/docs/diff/privacy/UI状态真实，最新工程HEAD CI有据 |
| K14 | Core/Fake/#16SVC v1三层映射准确，未声称上游真实兼容或真实URL安全 |
| K15 | Novice First中文路径/六状态恢复/未实现组件准确 |
| K16 | 无合并/安装/模型/生产/微信，结论仅OFFLINE |

## 16. 报告与对话交接
标题《Plan07-B · 原创RVC Fake Gateway纯协议交付报告》：
1. main/#16/#19/#21/#22/新PR执行前后base/HEAD/state及授权门禁。
2. 新三文件、导出、请求/上下文/十五字段响应、目录与上限。
3. 七场景结果、取消/UNKNOWN/模型优先级/禁提交/无真实Artifact。
4. G01–G40对照，实际总数/通过/失败/skip；full Node/build/UI/docs/privacy及最新新PR CI。
5. K01–K16逐项PASS/FAIL/BLOCKED，行号/测试证据。
6. 三层未来映射与未解决真实许可/传输/资产映射问题。
7. 普通用户路径、六条中文恢复与仍需后续实现的事项。
8. 未执行高风险操作；唯一结论READY_FOR_PLAN07B_OFFLINE_REVIEW或REVIEW_REQUIRED。
报告后停止，不自动进入06，不更新规划DONE，不合并。

对话建议：05-B/F01结束、转入独立RVC模块，适合干净工作区交接后新开DeepSeek对话。交接保留仓库/main/新分支名、研究固定SHA、三文件范围、无上游复制/无未合并代码依赖及全部安全门禁。新开AI聊天不等于重启DSH/微信/模型。
