# Plan 03-B · PR #16 单项合并与新main离线验证（授权审阅稿）
**版本：v1.0 · 2026-10-26。**
**状态：WAIT_USER_AUTHORIZATION / NOT_SENT_FOR_EXECUTION。仅供用户审阅，未获明确授权不得执行合并。**
**执行模式：标准（获授权后）。原因：普通Git/PR与离线检查，不需要创造DSH插件或预设。**
**拟执行人：DeepSeek；计划与验收：ChatGPT。原Plan03-B，不新增主Plan。**
本文件已把操作细节准备完整，但不构成授权或正式派发。用户授权后须由ChatGPT重新核实事实，再确认可执行版本；不能拿本审阅稿自行启动。

## 1. 拟授权的唯一结果
仅将qianqiucn/dsh-whale-voice的PR #16、精确HEAD45da9e7b2c2e4d625ef7e96315f4a41f0300bb75，以GitHub Merge Commit方式合入main，保留原分支，然后验证新main的离线测试和CI。
不批准#17–#23合并、关闭、改base或删除；#18历史Draft继续保留。
合并只让纯契约进入主线，不部署、不重载DSH，不启动Provider/模型，不启用配置写入或微信发送。

## 2. 已核实基线（2026-10-26）
| 对象 | 证据 |
|---|---|
| 仓库 | private，默认main |
| main | bf9cf66807e12d0b25872a0fa3869962dde04818 |
| #16 | OPEN、非Draft、base main、0 GitHub reviews、mergeable=true |
| #16目标HEAD | 45da9e7b2c2e4d625ef7e96315f4a41f0300bb75 |
| 分支 | feature/tts-provider-neutral-contract |
| 修复增量 | 相对954a01a恰六文件，+987/-84；两个正常提交 |
| 最新HEAD CI | run40246403639，build/ui SUCCESS，head_sha与45da9e7一致 |
| ChatGPT复核 | SVC29+TTS16共45/45独立PASS，61额外边界断言PASS，原八组问题关闭 |
| DS报告0003 | 全量221/220 pass/1 skip、UI24/24、build无client.js差异；这些本地全量值非ChatGPT独立重跑 |
| 合并配置 | allow_merge_commit=true；delete_branch_on_merge=false（启动仍须重查） |
03-A及03-A-F01已达到离线合并前门禁；GitHub当前0 reviews，ChatGPT会话验收不是GitHub人工review，不伪造审批。
#21/#22/#23相关模块仍未合并；本合并不包含它们，不声称跨PR版本或资产映射已经完成。

## 3. 授权门禁
必须有用户本人明确同意本次#16目标HEAD、Merge Commit合入main；知悉当前0条GitHub reviews。用户上传报告、说验收通过、收到此文件或DS建议均不算授权。
授权证据应为用户直接消息或其明确转交的原文，不能用另一AI自称批准替代。只记录授权摘要，不保存私人对话全文。
若用户选择仅继续审阅，则保持WAIT_USER_AUTHORIZATION，禁止调用合并端点。
获授权后ChatGPT仍需再次核对main/#16HEAD/CI/review/设置。HEAD或main变更时原授权不能自动套到新目标，先报告delta由ChatGPT处理。
不设置auto-merge、不使用admin override，不绕过保护/必需review。

## 4. 阅读与写入范围
先读执行端有效AGENTS.md、报告INDEX、获授权后的正式03-B版本及03-A-F01验收结论。
只读源码/文档：#16已验收六文件、TTS/SVC目录与现有CI .github/workflows/ci.yml、package.json、主线原状态。
允许的远端变化仅为一次符合授权的#16合并及GitHub自动产生merge commit/#16 MERGED状态。
不新建工程提交/PR，不编辑运行代码/状态文档/CI/依赖，不推送本地main，不改仓库设置。
本地只允许正常fetch、干净工作区下切到精确merge SHA进行测试，以及按既有规则写仓库外报告/INDEX。不能删除文件、stash/clean/reset遮盖修改。

## 5. 合并请求与结果契约
通过现有GitHub认证向GitHub服务端发起标准PR合并：
- 仓库qianqiucn/dsh-whale-voice，pull_number=16。
- sha必须固定为45da9e7b2c2e4d625ef7e96315f4a41f0300bb75。
- merge_method必须为merge；不允许squash或rebase。
- 成功需核实merged=true及返回merge commit SHA，随后从PR和Git对象独立回读。
- 不使用自动删分支功能，仓库delete_branch_on_merge必须仍为false。
HEAD条件不能原子锁定main；合并前再次读main，合并后核对父提交。若发生并发变化，报告实际情况，不谎称基线被原子锁住，不自动回滚。
可使用现有gh的GitHub REST调用或等价已安装工具；不下载新CLI、不改认证、不输出token。

## 6. 合并前固定检查
P01 有针对本次#16的用户授权且目标未变。
P02 当前remote正确、工作区干净；有未提交内容则保留并停止切换。
P03 #16仍OPEN/非Draft/base main/HEAD完全匹配。
P04 main完全匹配bf9cf66807e12d0b25872a0fa3869962dde04818。
P05 build/ui成功且head_sha匹配目标HEAD，无新失败/待完成检查。
P06 GitHub reviews数及状态如实；有changes_requested或保护要求未满足则停止。
P07 mergeable=true、merge commit可用、自动删分支false；未知按UNKNOWN停止，不改设置。
P08 目标HEAD之后无新未审代码；不因本任务补文档产生新HEAD。
P09 其他PR的HEAD/base/state已记快照，#21→#22关系保留。
全部满足才进入一次合并操作；已有验收且未变化的代码不必在合并前重复全量测试。

## 7. 执行顺序（仅获授权并复核后）
1. 再次执行第6节，保存非敏感状态与授权摘要。
2. 只向GitHub提交第5节的#16合并请求一次。
3. 回读#16 merged状态、merged_at、merge_commit_sha，记M；查询main最新HEAD。
4. 查询M的父提交和tree：正常期望父为原main与授权HEAD，且无并发更改时tree与授权HEAD相同。不得仅凭HTTP成功判断完成。
5. 确认feature/tts-provider-neutral-contract分支仍存在且HEAD不变；其他PR没有被本任务合并/关闭/改base。
6. 记录GitHub自动触发的新main CI（原workflow含push:main）。它与旧PR CI是两份独立证据。
7. 正常fetch main，工作区干净时切至精确M的detached HEAD进行本地离线检查；不重写/推送本地main，不建立新实现分支。
8. 完成第9节检查、形成第15节编号报告，然后停止，不继续合并其他PR或开始06/08。
在正式派发前，本节只是审阅步骤，不许可实际调用。

## 8. 兼容与恢复
SVC_SCHEMA_VERSION仍1；已批准的createdAt/属性收紧随#16进入main；旧未实现Provider和qwen-local兼容迁移语义不变。
不迁移生产配置/音色/参考音频，不运行真实Provider。
合并失败且远端无变化：保留原main和PR，报告原因。
成功后CI失败：标MERGED / POST_MERGE_CHECK_FAILED；停止后续，不force push/reset/revert main，不自动建回滚提交。提供失败证据与最小修复/回退建议，等待ChatGPT及用户决定。
请求超时或返回不明：先只读查PR/main/merge SHA，不盲目重试。若已合并只做验证；状态仍不明则UNKNOWN停止。
没有生产部署，所以不存在生产服务回滚动作。

## 9. 合并后离线验证
使用现有环境，在精确M运行：
- node --test test/svc-contract.test.mjs test/tts-provider.test.mjs：当前基线45/45。
- node --test：当前报告基线221/220 pass/1 platform skip；按真实平台记录，新增失败不能用skip掩盖。
- node build.mjs；node --check client.js、client.template.js、pages.js、setup.js、build.mjs、index.js。
- git diff --exit-code -- client.js；git diff --check；git status --short。
- 已有UI环境时npm.cmd run test:ui，期望现有24项通过；不运行test:ui:setup、不本地安装依赖/浏览器；缺环境记NOT_RUN。
- 核对新main CI的build/ui都SUCCESS，且head_sha=M，不能借用40246403639的绿灯。
现有GitHub CI会按已存在的workflow安装锁定测试依赖/Chromium，属于原隔离工作流，不能扩大到用户机器或真实服务。
Node文档完整性检查沿用现有测试；无运行代码修改，不为同步状态造额外commit。

## 10. 正负/异常检查矩阵
| ID | 场景 | 结果 |
|---|---|---|
| V01 | 用户无授权/授权对象不匹配 | 零合并动作，WAIT_USER_AUTHORIZATION |
| V02 | HEAD或main变化 | 停止，不套用旧目标 |
| V03 | CI非绿/有阻断review/保护要求 | BLOCKED，不override |
| V04 | auto-delete=true/未知 | 停止，不改设置或冒险删分支 |
| V05 | 目标满足并合并成功 | 仅#16 MERGED，回读M/main/父提交/tree |
| V06 | 请求超时不明 | 查状态，不盲重试 |
| V07 | 分支保留及其他PR | 原分支保留，#17–#23未被修改 |
| V08 | M专项/全量/build/UI | 如实记录通过、失败和缺环境 |
| V09 | push main的新CI | M对应build/ui成功才可离线验收 |
| V10 | 合并后检查失败 | 保留证据，停止，无自动回滚或下一任务 |
这些是操作验收，不通过改测试/改workflow制造绿灯。

## 11. 异常决策
#16已经被他人合并：先确认实际M与目标关系；不重复合并，报告是否符合授权。
合并API拒绝：原样记录状态/安全原因，不换成squash/admin/main直推。
本地checkout脏或文件将被覆盖：不切换，不stash，先报告；可以继续只读远端CI。
本地测试环境不全：不用安装解决，记限制；远端新CI是否足够由ChatGPT验收，不伪称本地跑过。
main合并后又前进：继续验证精确M，同时报告最新main差异，不能称最新main已验证。
任何需要额外新提交、回滚、改base、下一PR合并或真实运行：停止该部分，不扩大本次授权。

## 12. 安全与隐私
不读取/记录凭据、聊天、联系人、私有声音/模型；报告只留必要的非敏感Git与测试信息。
不启动、停止、重载DSH/WeChatAgent/Sender/Qwen/微信，不安装模型/ZIP/驱动，不碰音频设备，不访问真实Gateway或付费API。
不更改生产配置/白名单/Hook/DLL，UNKNOWN不自动重发，Worker NEVER_WRITE与双闸门不变。
合并源码不等于部署。只有本文件第1节的一项Git合并可在明确授权后实施。

## 13. Novice First
普通用户本轮只需审阅并决定是否授权，不用运行Git/终端/编辑JSON。
成功后说明“主线已纳入离线契约”，不能说“RVC可以唱歌”或“配置已经应用”。
未实现、连接异常和结果不明继续诚实显示；无新页面/可访问性实现，本轮N/A。
下一次真实用户路径、引擎、音色资产与安装仍按06/08/09/12/13/14独立推进，不能因merge跳过。

## 14. 完成定义
D01 用户明确授权、ChatGPT复核后的执行版本已派发；
D02 单一#16精确目标采用Merge Commit合入main；
D03 M/main/父提交/tree核验且原分支保留；
D04 V01–V10逐项结果与授权边界有据；
D05 专项/全量/build/UI/文档/工作区检查真实，缺项不冒称PASS；
D06 新M的build/ui CI SUCCESS；未完成则PENDING，不宣布03-B DONE；
D07 无其他PR/生产副作用、无多余commit/安装；
D08 报告归档、索引维护且停止。
03-B DONE与Git MERGED、功能OFFLINE分别记录。任何一项不足按实际状态报告，不回填成功。

## 15. 正式报告（执行后才生成）
标题《Plan03-B · PR#16合并与main离线验证报告》。
按本地AGENTS规则保存完整编号.md，读取report/INDEX后取下一号，不硬编码。至少包含：
全局序号/时间及时区/任务03-B/正式计划版本/授权摘要；
执行前后main、PR16 head/base/state/review/CI；合并方式与M、父提交/tree、分支保留；
V01–V10、D01–D08；本地实际测试和新M CI链接；其他PR不变与生产无影响；
存在的问题、源码状态文档中历史OPEN快照的说明（不额外补commit）、唯一后续建议。
本地报告不进工程Git。DS不更新规划台账DONE、不自动继续开发。

## 16. 当前交接与停止线
**此审阅稿当前不交DS执行。先由用户决定是否授权仅#16的上述目标合并。**
授权后ChatGPT复核最新事实再明确正式派发；标准模式，优先继续当前DS对话。
如新开DS对话，必须先选择标准、读取有效AGENTS和报告索引、核对目标分支/工作区/授权，不能把新会话当成权限重置。
没有授权则停在这里，不以“继续项目”或本文件存在代替许可，不另造重复Fake/审计来绕过门禁。
