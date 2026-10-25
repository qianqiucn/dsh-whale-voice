# Plan 03-A-F01 · PR #16 SVC输入边界与合并前证据修复
**版本：v1.0 · 2026-10-26 · DONE / OFFLINE / PR_OPEN。原实施范围保留历史。**
**模式：标准。原因：在既有仓库修复纯校验代码、测试和说明，不需要创造DSH运行时插件。**
**执行：DeepSeek；验收/规划：ChatGPT。目标：OFFLINE / PRE_MERGE_REPAIR，复用原PR #16。**
**本次是06-A发现问题后的同一03-A合并前门禁补丁，不是新主Plan，不重做02/F01–F05、06-A或07-B。03-B仍未获合并授权。**


## 2026-10-26 · ChatGPT正式验收：03-A-F01 DONE / OFFLINE / PR_OPEN
输入为用户本地正式报告0003（修复v1.0）。#16仍OPEN/非Draft/base main/0 reviews，HEAD45da9e7b2c2e4d625ef7e96315f4a41f0300bb75；main仍bf9cf66807e12d0b25872a0fa3869962dde04818。相对954a01a为两个正常提交、恰六文件+987/-84，符合白名单；未带入#23。
[CI40246403639](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40246403639) build/ui SUCCESS，jobs的head_sha已核对。ChatGPT独立读取六文件增量及固定源码，在隔离副本运行SVC29+TTS16=45/45 PASS，另做61个断言PASS（逐已知字段getter/隐藏、两域未知/隐藏token/Symbol、投递附加flag、UTC日期、输出前置），旧F1–F8关闭。DS全量221/220/1、UI24/24、本机build为报告证据；ChatGPT核查远端CI，未独立本地重跑全仓/UI。
| 验收 | 结果 |
|---|---|
| D01 | PASS：原#16、六文件白名单、无新PR或跨PR复制 |
| D02 | PASS：普通对象/描述符/键数限制，已知及未知getter不执行 |
| D03 | PASS：根/投递白名单、createdAt规范UTC、10字段新输出 |
| D04 | PASS：固定占位错误，无未知键值或异常回显；独立marker探针 |
| D05 | PASS：v1数值域/可选undefined/null原型兼容，输入不变 |
| D06 | PASS：实际专项45/45，61独立断言；全量无新增失败据DS及CI |
| D07 | PASS：六文件文档与构建/UI证据真实分层，未冒称独立全量 |
| D08 | PASS：新HEAD对应build/ui SUCCESS |
| D09 | PASS：未修改迁移/Registry实现；迁移保留既有配置选择≠运行选中/可用，按此语义解释文档 |
| D10 | PASS：远端无运行接线，报告已归档，未合并或真实操作 |
03-A合并前建议恢复READY_FOR_USER_MERGE_DECISION；旧BLOCKED_PENDING_SVC_FIX由本次实际验收解除，但03-B仍WAIT_USER_AUTHORIZATION/NOT_SENT_FOR_EXECUTION。
下一阶段[03-B授权审阅稿](03-B-pr16-merge-authorization-review.md)已准备，只有用户审阅，不是DS工程派发；明确仅#16/45da9e7/Merge Commit/保留分支/新main离线CI，不包含其余PR或部署。不能为绕过授权继续叠加同目标审计/Fake。


## 1. 唯一目标及增量
修复core/svc/svc-contract.mjs两入口的属性检查与错误脱敏，严格拒绝未知结果/投递字段，去除createdAt对象共享；在原PR #16补足回归与准确文档。
这是原本“合并前已就绪”结论的新增证据修订：03-A历史验收保留，但当前合并建议BLOCKED_PENDING_SVC_FIX，直到本补丁新HEAD复核通过。06-A本身DONE/READ_ONLY_AUDIT，Plan06运行实现未启动。
结果是更严格的离线契约，无新用户界面、真实Provider、模型或发送能力。

## 2. 最新事实与独立复现
2026-10-26核验：
- main bf9cf66807e12d0b25872a0fa3869962dde04818。
- #16 OPEN、base main、分支feature/tts-provider-neutral-contract、HEAD954a01a08587bc8bd5b8caccf026298ca54d5215；22files；当前HEAD CI40165832178 SUCCESS。
- #17唯一规划入口，写本任务前HEADc8dbae4029a0dc962539835b2a464d5c12ce5574；#18保留历史Draft，不重新做H0取舍。
- #21 da3d0f7f34df99f11d21cf3a656adcfaa206ce25；#22 9d716583da69054ac06733a9dd18ca29b4681fbe（base #21分支）；#23 a570430e9d5be24aa0f2415b6699cdfa957583f6。均OPEN，不能复制/import。
- 输入报告0002_Plan06-A核验报告v1.0已完成复用与集成前置审计；本次不修改该报告历史。
ChatGPT在固定#16源码副本独立重跑SVC既有5/5 PASS，但8组额外探针发现：
F1 未知结果键被接受；F2 delivery:{state:PENDING_ROUTER,submitAllowed:true}被接受；
F3 隐藏token被接受；F4 Symbol键被接受；F5 结果mime getter被执行4次且接受；
F6 请求未知虚构键名回显到errors.path；F7 请求sourceAudioRef getter执行4次且接受；
F8 createdAt对象被接受并原样共享引用。
仅协议校验缺口，没有执行真实发送，也没有据此证明生产泄露。不能把“隐藏token被丢弃”或“输出固定PENDING_ROUTER”当作可以忽略输入边界的理由。

## 3. 启动与阅读
先读执行端实际生效AGENTS.md、报告索引、当前任务及规划分支AGENTS；原03-A和06-A最新结论用于理解，不重执行审计。
读取#16这六文件：core/svc/svc-contract.mjs、test/svc-contract.test.mjs、docs/TTS_PROVIDER_ARCHITECTURE.md、docs/PROJECT_STATUS.md、docs/AI_CONTEXT.md、CHANGELOG.md。
只读补充：core/svc/svc-registry.mjs、core/tts/provider-contract.mjs、provider-config.mjs、provider-registry.mjs、test/tts-provider.test.mjs、docs/ROADMAP.md、docs/DECISIONS.md、package.json及现有CI。
启动先核实remote、工作区、当前分支、#16真实HEAD和CI。报告显示当前checkout在#23，不可直接在该分支写本修复。

## 4. 文件白名单
| 文件 | 动作 |
|---|---|
| core/svc/svc-contract.mjs | 修复validateSvcRequest/normalizeSvcResult及私有结构检查；不新增公开导出 |
| test/svc-contract.test.mjs | 保留原5项安全意图，新增R01–R24 |
| docs/TTS_PROVIDER_ARCHITECTURE.md | 说明SVC严格输入/错误/createdAt契约，澄清迁移的既有选择保留 |
| docs/PROJECT_STATUS.md | 增补本修复当前证据/PR仍OPEN，旧197历史保留 |
| docs/AI_CONTEXT.md | 同步当前门禁与真实测试，不冒称集成 |
| CHANGELOG.md | 一条纯契约边界修复说明 |
其余文件只读。必要的本地报告/INDEX按已授权规则写仓库外。
不改TTS实现、Registry返回码、配置迁移代码、ROADMAP/DECISIONS、package/依赖/CI、Host/UI/client.js、#21/#22/#23或docs/plans。架构仍然原纯契约，本次不新增ADR。

## 5. 保留现有公开契约
SVC_SCHEMA_VERSION=1、SVC_ERRORS现有键值、两个公开函数及成功/失败信封均保留：
- validateSvcRequest成功{ok:true,errors:[],request}，失败{ok:false,errors:[{code,path,reason}]}；
- normalizeSvcResult成功{ok:true,errors:[],result}，失败同形且无result。
请求只允许sourceAudioRef、targetVoiceId、pitchShift、formantShift、conversionStrength、outputFormat。
前五项必填；outputFormat缺省或显式undefined仍按省略处理。保留已有REF/VOICE正则、pitch有限数-24..24、formant -1..1、strength0..1及audio/*格式。不套用07-B的整数-12..12、Fixture限制。
engineId为函数参数，仍按现有非空字符串校验，绝不拿modelId/voiceProfileId冒充。
不接受07-B新增schemaVersion/targetModelId/inputAudio/rights/context字段，不补资产映射或默认音色。
不因为本次修复使任何Provider候选selectable=true。

## 6. 固定结构防御方案
仅接受Object.prototype或null原型的普通对象；已冻结的合法对象可用。
使用Reflect.ownKeys及Object.getOwnPropertyDescriptors/Descriptor检查所有自有属性：仅字符串、可枚举数据属性。已知/未知字段上的Symbol、不可枚举属性、getter/setter一律拒绝，getter执行计数必须0。
每个检查层最多32自有键；超限有限失败。只遍历固定Schema层，不递归遍历未知值、不JSON清洗、不递归克隆原始输入。原rejectSecretKeys递归扫描须替换为固定层结构策略，不能保留会调用getter的Object.entries路径。
先检查根结构/键数/属性白名单，再读已验证数据描述符里的值，再检查必填/类型/语义。允许首错返回；未知字段不静默忽略。
请求只有根层；结果只有根层及可选delivery层。字段值出现循环、深嵌对象时按已知字段类型拒绝，不深入遍历。
外层try/catch对检查异常固定失败，不输出异常内容。不能宣称隔离恶意Proxy运行代码，只保证异常转安全错误。

## 7. SVC结果输入与输出
结果输入根白名单恰为：
providerId、requestId、targetVoiceId、artifactRef、mime、sampleRate、durationMs、createdAt、delivery。
requestId/targetVoiceId/artifactRef/mime/sampleRate/durationMs必填。保留原类型/正则及数值条件（sampleRate整数8000..192000；durationMs非负整数）。不添加真实文件检查。
providerId省略/undefined允许；否则须严格等于engineId，类型不匹配拒绝。
delivery省略/undefined允许并规范化输出PENDING_ROUTER；显式给值只能普通对象恰有一个可枚举数据键state，值PENDING_ROUTER。null、缺state、隐藏state、Symbol、submitAllowed、target、token等任何附加字段都拒绝。不接收SENT/NOT_REQUESTED作为本v1输入。
createdAt：缺省/undefined/null→null；否则仅接受长度24的UTC规范字符串YYYY-MM-DDTHH:mm:ss.sssZ，需Date.parse有限且new Date(parsed).toISOString()严格等于输入，防无效日历日期。Date.parse仅用于值验证，不读取当前时间；禁止Date.now/随机填默认时间。
该createdAt收紧是明确的新边界修复：原对象/数组/数字/空串等不再接受，文档写清，不做生产数据迁移；当前无真实调用链。
输出保持原10键：schemaVersion、engineId、requestId、targetVoiceId、artifactRef、mime、sampleRate、durationMs、createdAt、delivery。
只能从已校验标量构造新对象，delivery也是新对象；绝不保留输入对象引用。无需新增冻结公共契约；不修改输入。
PENDING_ROUTER只是规范化结果标签，不代表已进入队列/可发送/有真实Artifact。

## 8. 固定错误策略与脱敏
只用现有SVC_ERRORS，不新增枚举、不修改registry中的NOT_IMPLEMENTED等既有字符串。
- 请求结构/属性/未知键/必填/数字：INVALID_REQUEST；targetVoiceId非法仍UNSUPPORTED_VOICE；outputFormat非法仍UNSUPPORTED_FORMAT。
- 结果根结构/属性/未知键/必填/createdAt/关联：INVALID_RESULT；voice/音频格式等保留原UNSUPPORTED_*类别。
- 显式delivery结构/属性/附加键/错误state：DELIVERY_NOT_PROVIDER；顶层send/wechat/sentToWechat也用DELIVERY_NOT_PROVIDER。
- 其他未知或凭据键按所属域INVALID_REQUEST/INVALID_RESULT拒绝，不递归读取其值。
path仅可为$、已知静态字段、delivery.state或固定<unknown-key>/delivery.<unknown-key>；不得包含原始未知键、Symbol描述、输入值、异常、路径或堆栈。
reason固定短语：结构/属性“invalid object structure”、未知“unknown field is not allowed”、缺必填“required”、类型“invalid field type”、语义“invalid field value”、异常“input could not be inspected safely”；也可保留已有静态语义说明，但不能拼接输入。异常错误类别按当前入口域选择，path=$。
所有失败不带request/result或其他原始对象引用。用虚构marker验证JSON.stringify整个失败信封不包含该未知键/值。

## 9. 文档澄清与兼容界线
架构说明原句“No provider is enabled or selected by migration alone”与代码既有qwen-local兼容迁移不一致。
只改文档：合法旧qwen-local迁移保留既有选择，生成enabled:true的配置描述；不启动服务、不联网、不证明运行可用，也不改变默认产品Provider。cloud/custom/未知仍不猜成Qwen，需用户选择。不得为了让旧句成立而改迁移代码或测试。
Registry选择错误与PROVIDER_ERRORS/SVC_ERRORS不是同一返回域，枚举差异列为未来适配文档事项，不在本次重命名公开错误。
Relay rights已有任务校验间接保证，不在#21追加重复校验。
#17/#18权威取舍已经由H0完成：#17唯一、#18历史保留；不重做、不关闭。
没有运行配置或数据写入，无生产回滚；正常新提交回退源码，不强推/重置远端。

## 10. R01–R24回归矩阵
每行至少一项node:test，参数化覆盖各入口/层；原5项保留，不靠删断言过关。
| ID | 输入/检查 | 必须结果 |
|---|---|---|
| R01 | 原合法SVC请求，有/无outputFormat | 成功，原规范字段保持 |
| R02 | 原合法结果，无delivery/providerId/createdAt | 成功，PENDING_ROUTER、createdAt:null |
| R03 | 显式合法delivery、匹配providerId、规范UTC时间 | 成功且字段准确 |
| R04 | 结果未知普通键及07-B专有字段 | INVALID_RESULT固定占位，无静默丢弃 |
| R05 | delivery加submitAllowed:true/false、target/token/任意键 | 都DELIVERY_NOT_PROVIDER |
| R06 | 请求/结果隐藏未知token、隐藏已知字段 | 拒绝，不能因不可枚举漏过 |
| R07 | 请求/结果/delivery所有层Symbol键 | 拒绝且不回显描述 |
| R08 | 两入口已知/未知字段getter/setter，含会throw的getter | 拒绝，调用计数0，无异常泄露 |
| R09 | delivery.state/未知字段访问器 | 拒绝，调用计数0 |
| R10 | Object.create(null)与冻结合法输入 | 通过，语义保持 |
| R11 | 数组/类实例/自定义原型/继承必填/非对象 | 有限失败，不读继承属性 |
| R12 | 请求/结果逐必填字段删除及undefined | 对应失败，不补值 |
| R13 | 三个可选结果键及outputFormat显式undefined | 按省略兼容；createdAt:null允许 |
| R14 | delivery:null/空对象/错误state/SENT/NOT_REQUESTED | 拒绝 |
| R15 | providerId不匹配/非字符串，engineId空或非字符串 | 拒绝 |
| R16 | pitch/formant/strength边界、小数合法、NaN/Infinity/越界 | 保留v1数值域，不夹紧 |
| R17 | 原source/voice/format/sampleRate/duration正负边界 | 正确成功或原错误域 |
| R18 | createdAt对象/数组/数字/布尔/空串/非法日期/非规范时间 | INVALID_RESULT；合法UTC规范值通过 |
| R19 | 循环/超深值放未知键、已知标量字段，>32键各层 | 有限失败、无递归爆栈 |
| R20 | 虚构私密键/值/Symbol/抛错marker | 完整错误信封不含marker/堆栈/输入引用 |
| R21 | 修改成功输出delivery、重复调用、输入前后快照 | 输入不变、输出不共享输入或跨调用对象 |
| R22 | F1–F8原复现输入 | 全部拒绝；getter0；未知键不回显 |
| R23 | 07-B请求/缺targetVoiceId的Fake样结果直接进v1 | 拒绝，不新增跨PRimport或复制 |
| R24 | 目录NOT_IMPLEMENTED、纯模块无I/O/网络/进程/发送 | 原候选隔离不退化 |
R23仅本测试内构造少量虚构字段复现，不复制07-B模块/测试；不宣称版本适配已实现。

## 11. 实施顺序与本地验证
1. 确认无未保存工程修改；在原#16分支进行。当前可能停#23分支，干净后正常切到#16已存在分支；不带入#23文件，不stash/clean/reset掩盖工作。
2. 复核#16HEAD，读取实际差异。若HEAD变化已含同修复，先做差异验收，不重复编码。
3. 先增复现/负向回归，记录红灯；实现固定层描述符检查与白名单，再补成功兼容用例。
4. 修订六文件白名单内文档与当前证据。
5. 使用现有环境执行：node --check core/svc/svc-contract.mjs；node --check test/svc-contract.test.mjs；node --test test/svc-contract.test.mjs；node --test test/tts-provider.test.mjs；node --test；node build.mjs；node --check client.js/client.template.js/pages.js/build.mjs；git diff --exit-code -- client.js。
6. UI环境已存在时npm.cmd run test:ui；不安装依赖/浏览器。不存在则NOT_RUN并报告，远端对应ui成功仍可作为独立CI证据，不假称本地跑过。
7. 项目既有文档编码/链接检查、git diff --check、git diff --cached --check及暂存隐私检查必须真实；只暂存六文件白名单，检查相对起始954a01a新增差异，不把原22文件都当本次改动。
8. 正常commit/push原分支更新#16，不新建PR；PR描述补充本修复及OFFLINE边界；等待并核对新HEAD对应build/ui CI。
9. 报告后停止，不执行合并、06-B/08实现或真实调用。
旧全量197/196/1是历史基线，本次实际计数按结果；不能从#21/#22/#23复制测试凑数。

## 12. 封闭异常决策
工作区脏：保留并报告，不覆盖；分支不存在：核对远端跟踪后在同#16分支正常恢复，不创平行PR。
HEAD有新提交：读增量再判定；目标发生大改：停止危险部分，不按旧规格覆盖。
第七文件/新增依赖/修改TTS代码才能修：停止该扩展，报告最小原因。
新测试要降低安全边界才能过：不降级，报告BLOCKED。
CI排队：PENDING，失败：FAIL，查原因但不扩大范围；旧HEAD绿灯不复用。
遇真实秘密：停止提交，不在报告抄值。
许可/模型/网络/安装/真实Host操作：本次不需要，不能顺手做。
仅发现其他域安全问题：提供证据另列，不吞并为全仓重构。

## 13. Novice First与安全
UI无变化，普通用户不用执行任何命令；不得把严格契约修复说成可生成/唱歌/发送。
文档至少明确：音色不合法→重新选择合法音色；格式或参数不支持→调整输入，不静默换引擎；结果格式不可信→停止并重新检查，不自动发送/重试。
未集成组件不显示可用；无GPU/离线不承诺CPU/云回退。取消请求不等于真实已停，UNKNOWN不自动重发，SAVED不等于APPLIED/SENT。
Worker NEVER_WRITE、Bridge/Worker双闸门、WeChatAgent身份授权全部保留。
不装包/模型/ZIP、不访问真实Gateway/音乐平台/微信，不读凭据/聊天/音频，不改设备，不重启或部署，不合并/关闭/改base/强推/删分支/Release。

## 14. DoD
D01 原#16/正确分支六文件内最小增量；
D02 两入口固定层描述符策略、无getter/隐藏/Symbol旁路；
D03 结果根/delivery白名单与createdAt安全标量；
D04 脱敏错误不回显未知键值/异常；
D05 原v1合法范围/可选undefined兼容，输出无输入引用；
D06 原5项+R01–R24和TTS专项/全量无新增失败；
D07 build/client.js无变化、UI状态真实、文档/diff/privacy有据；
D08 新HEAD的build/ui均SUCCESS才可结论READY_FOR_03AF01_OFFLINE_REVIEW；
D09 迁移文档准确，未修改配置选择/Registry错误码；
D10 无真实操作/合并/新队列、报告正确归档且停止。
任何待完成项写REVIEW_REQUIRED/PENDING，不自行把03-A重新标READY或开启03-B。最终验收由ChatGPT完成。

## 15. 完整报告与文件归档
按执行端AGENTS规则保存新编号Markdown并维护INDEX，不能覆盖0001/0002。
报告包含：全局序号/时间及时区/任务03-A-F01/v1.0/本计划来源；main与#16执行前后HEAD/base/state；实际六文件增量；
F1–F8逐项旧行为/新行为；R01–R24与原5项；D01–D10逐项证据；Node总数/pass/fail/skip、TTS专项、build/UI/docs/privacy、当前HEAD CI链接；
createdAt兼容收紧、迁移文档解释、原候选/权限不变；新手边界；未解决问题；未执行真实操作。
报告类型为修复报告。读当前索引后取下一全局报告号，预计0003但不得硬编码；正式文件在用户指定report目录，回读验证后只给文件链接和简短结论。
本地报告不放工程Git；DS不修改规划DONE或当前工程以外的AGENTS规则。

## 16. 对话交接与停止
建议继续当前DS对话：刚完成06-A，已熟悉这次发现，无需再开一段；使用标准模式。
如用户选择新开，也必须先选标准，再读取有效AGENTS、报告INDEX和本任务，核实#16分支/HEAD/工作区。先动作是检查分支与未提交内容，不重启DSH/微信/模型。
唯一工程是本03-A-F01，结束发送修复报告等待ChatGPT，不自动合并或进入06运行代码。
