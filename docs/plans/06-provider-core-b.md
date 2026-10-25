# Plan 06 · Provider Core-B 多引擎注册与安全调度

**状态：06-A SENT（只读复用/集成前置核验）；06运行实现仍PLANNED，未集成。**


## 最新验收与唯一派发（2026-10-26）· 07-B DONE，06-A SENT
**07-B = DONE / OFFLINE / NOT_INTEGRATED，PR #23 OPEN。** HEAD a570430e9d5be24aa0f2415b6699cdfa957583f6、base main@bf9cf66807e12d0b25872a0fa3869962dde04818、0 reviews；精确三added +1892/-0。[CI40242597119](https://github.com/qianqiucn/dsh-whale-voice/actions/runs/40242597119) 当前HEAD build/ui SUCCESS。ChatGPT独立40/40与271额外边界断言PASS；DS全量216/215/1、UI24/24和本机build为报告值，未独立本地重跑全仓库/UI。完整K01–K16与非阻断错误路径/嵌套类型规格澄清见[07-B最新验收](07-B-rvc-fake-gateway-offline-protocol.md)；无阻断返修。
**唯一下一任务：[06-A · 现有Provider复用与集成前置核验](06-A-provider-reuse-integration-readiness-audit.md) = SENT。** 只读跨PR盘点、三层字段/状态映射、文件交集与依赖，直接对话报告，不新增代码/Registry/Fake、分支、提交或PR，也不写报告入仓库。Plan06实现仍PLANNED，集成仍未开展。理由：已有实现散在未合并#16/#21/#22/#23，先核实复用和合并决策材料，避免继续叠加孤立契约或绕过03-B。
当前main仍bf9cf66807e12d0b25872a0fa3869962dde04818；#16 OPEN@954a01a、#19@e21dee8、#20@6007fec、#21@da3d0f7、#22@9d71658、#23@a570430均未合并；#22 base为#21分支。#17是唯一规划入口，#18保留历史Draft。03-B仍WAIT_USER_AUTHORIZATION；05-A/F01与05-B/F01 DONE/OFFLINE。原01–14不重编号。
现在适合新开DeepSeek/DSH对话，06-A只需只读分析/规划和文件/Git读取；模式名称以实际执行端为准。保留并核实未提交内容，不重启DSH/微信/模型。新手易用性、RVC首发/Seed-VC后续、BLOCKED_CODE_REUSE/BLOCKED_DIRECT_API_INTEGRATION、Worker NEVER_WRITE、UNKNOWN不自动重发不变。
**以下07-B SENT、06未派发、旧任务SENT等段落均为历史快照；以本节为当前唯一指令。**

## 最新已授权 Provider 选型约束（2026-10-25）

Whale Singing 首发只把 **RVC** 作为主要开发和验收对象；现有 SoVITS-SVC、Seed-VC 的未来扩展槽位不删除，但不得因纯契约已声明候选，就自动把它们标为真实可选。**Seed-VC 是 Plan 12-D 的后续零样本免训练试唱候选**，不是低显存/CPU 优化承诺、不是主线路，也不阻塞 RVC Provider 与标准歌曲流水线。默认不启动 Seed-VC、加载权重或下载模型。若以后实现，须独立固定许可/接口/资源测试，通过 Fake 正负例与 Windows 实测后才能从 NOT_IMPLEMENTED 提升，且与 RVC 共用 Core 的音频/任务/交付安全状态。

## 2026-10-25 · RVC/SVC 外部 Gateway 适配规格（仍 PLANNED）

结合 [蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md) 和 Plan 07-A 的许可/API 审计，RVC 与 SoVITS-SVC 作为分离的可选 SVC Provider 实例；不得放宽 TTS-A 白名单或当作 TTS 默认模型。
- 先实现纯 Fake Gateway 与状态投影 OFFLINE/UNKNOWN/MODEL_NOT_AVAILABLE/AVAILABLE；Fake 健康成功不能让真实 Registry.selectable=true。
- 模型名不得作为路径、命令、URL，稳定 modelId 应关联使用权利和资产。未知模型 fail closed。
- 上游 Gradio show_model/convert 参数、错误、超时、输出路径和取消语义需要 07-A/07-B 静态/沙箱核实；不能因上游支持 songId 就在当前 validateSvcRequest 内注入未经验证字段。
- Fake 回归覆盖无 GPU、断线、非法媒体、超时、取消不确认、API 版本不匹配、缓存串用户、恶意路径、未知模型、下载未授权。资源调度属于 Whale Voice Core，而不是鲸递。
- 真后端启动、模型安装和网络下载不是该 Plan 的默认授权。

## 任务
- 实现 TTS/SVC 分类注册、稳定 Provider ID、实例、版本、安装/健康状态、语言、音色、情绪/克隆/流式/取消、联网/费用和资源能力。
- 用 Fake TTS、Fake SVC 执行能力协商：不支持音色、语言、情绪、格式时准确拒绝，不暗中丢参数。
- 用户 Provider 选择不得自动变成付费云端；失败转移必须显式授权；Qwen 离线不能让其他 Provider 假死。
- Provider 只生成音频或转换歌声，不直接向微信发送；实际交付由 Whale Relay 执行且 Core 持有任务主权。
- Provider 降级、版本不匹配、凭据缺失、错误音频、超时与取消都应返回可诊断的安全状态；UNKNOWN 不显示成功。

## 验收
纯 Fake 引擎覆盖注册冲突、版本未知、状态降级、错误音色、云端未授权、失败隔离。执行 build、Node、UI、文档与隐私扫描，创建独立 PR；无真实模型/付费 API/生产配置/微信调用，未获批准不合并。

## H0 对照补充（2026-10-25，未派发）

- 增补 Fake 验收：无 GPU、配置迁移、敏感投影脱敏、输出 artifact 格式验证；未实现候选不得成为正式可选项。健康成功不等于试听、配置 APPLIED 或微信发送成功。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
