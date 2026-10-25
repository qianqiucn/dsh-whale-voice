# Plan 04 · WeChatAgent 扩展机制与授权体系专项审计

**任务状态：PLANNED（推荐在 TTS-A 合并后）**

## 最新验收（2026-10-25）· Plan 04-A DONE，独立研究 PR #20 未合并

[PR #20](https://github.com/qianqiucn/dsh-whale-voice/pull/20) 的 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md` 361 行研究文档已由 ChatGPT 对照固定 E01–E25、17 Fake 测试种子、A01–A15 逐项验收，HEAD `6007fecd351d0cdb492a4ec5962ac2abe1962242`，CI `40233344202` SUCCESS。**04-A = DONE（RESEARCH/OFFLINE）**，绝不意味着上游 0.4.1 已安装或 WeChatAgent 新增 Tool/音频发送已实现。唯一技术推荐 **S1 当前 DSH Plugin + WeChatAgent Adapter**，S2 新 ZIP Plugin v2 仅未来可选（与 DSH 不兼容、无原生音频/文件发送）；S3 Native Hook/DLL 禁止，用户当前已记录 0.3.9 原链不因研究升级。

**下一份正式派发 Plan 05-A（[Level 2](05-A-whale-audio-core-offline-contract-implementation.md)）**，只做统一鲸音 Core 的离线纯模块/测试，保留本阶段研究结论和小白优先。计划 03-B Merge PR #16 仍 WAIT_USER_AUTHORIZATION；不能把研究 DONE 或 CI 当作合并批准。本文下方旧“Plan 04 PLANNED”仅为历史。

## 2026-10-25 · Plan 04-A 正式 Level 2 派发（最新权威状态）

**Plan 04-A = SENT / 等待 DeepSeek 静态审计报告**，完整可直接执行的任务书：[04-A-wechatagent-extension-readonly-audit-execution.md](04-A-wechatagent-extension-readonly-audit-execution.md)。唯一输出为 `docs/WECHATAGENT_EXTENSION_INTEGRATION.md`，只限新独立研究 docs-only PR。不安装、不升级、不重启、不访问聊天数据库/Token、不调用真实微信、不动工程或计划分支、绝不合并。

最新发现：上游 `sourcepro5/WeChatAgent` 2026-10-25 已发布 **v0.4.1**，其 ZIP 插件 API v2 有正式文档、按聊天授权与子进程执行，但**与 DSH 插件不兼容**；当前本项目仅报告历史 WeChatAgent 0.3.9 安装版，不能据此认定本机已有 0.4.1。04-A 需比较 v0.3.9/v0.4.0/v0.4.1 并且**默认保留 DSH 插件 + 只读 Adapter 的 S1 路线，ZIP 插件可选 S2 研究，不得自动迁移生产**。

原 Plan 04–14 序号不变，07-A 静态研究 DONE、07-B/05 未派发、03-B 合并等待独立授权。本文件下方“Plan 04 PLANNED、推荐 TTS-A 合并后”的文字是旧初版；**研究 04-A 可独立在 03-B 等待期间进行，后续真实集成仍需其前置与专项许可**。

## 2026-10-25 · 自动点歌入口新增审计范围（仍 PLANNED）

用户选择参考 astrbot_plugin_rvc_svc 实现自然语言点歌、RVC/SVC 翻唱和鲸递交付。跨阶段规格见 [RVC/SVC 蓝图](RVC_SVC_COVER_INTEGRATION_BLUEPRINT.md)。Plan 04 只读审计新增：
- DSH/WeChatAgent 受支持的 Tool 执行入口、消息来源、稳定会话 ID、群聊权限、用户取消/会话超时、最小权限、文件/音频支持与大小限制。
- DeepSeek 只能经 Whale Voice Core Tool 创建、查询、取消翻唱任务；不得直连 AstrBot 插件、RVC 管理端或微信 Native Hook，亦不持有 WeChatAgent Token。
- 如无公开扩展 API，只用 DSH Plugin/Tool + WeChatAgent Adapter，不注入已安装组件。歌曲音频来源、模型权利和投递目标必须分别获授权。
- Mock 验收：未授权群聊拒绝、同名候选确认、禁用发送仍可离线保存、取消不等于撤回已发消息。无服务启停和真实微信调用。

## 平台关系

WeChatAgent 是 Whale Voice 的必需微信平台依赖，负责微信消息、账号会话、目标身份与权限。Whale Voice 不能重新实现第二套微信账号管理、读消息或机器人框架。优先调用受支持的 WeChatAgent/DSH Tool 接口；没有官方扩展 API 时不能伪装“正式已支持”。

## 审计任务

1. 在只读条件下识别安装版 WeChatAgent 0.3.9 的扩展清单、扩展配置、启停、授权、版本、卡片呈现与生命周期；比较当前公开上游版本的变化，实际版本须重新确认。
2. 判断扩展是动态第三方注册、内置清单还是私有注册。找出明确稳定的入口与测试证据；分类为 SUPPORTED / INTERNAL_ONLY / UNSUPPORTED / UNKNOWN。
3. 查证私聊与群聊的聊天范围、账号切换、授权撤销、来源身份、扩展最小权限；避免多个相互矛盾的白名单。
4. 审查 DSH Tool/Plugin 与 WeChatAgent Extension 的职责、AI 工具返回状态、取消/失败契约、Bridge 版本兼容、Token/Origin 保护。
5. 明确扩展 UI 的可选功能：小鲸鱼语音、AI 翻唱、功能授权、运行状态及跳转 DSH 设置；仅是候选，不提前开发假扩展卡片。
6. 建立 \`docs/WECHATAGENT_EXTENSION_INTEGRATION.md\`：受支持接口证据、版本矩阵、最小权限、推荐集成方式、风险和缺口。若无正式接口，保留 DSH 插件 + WeChatAgent Adapter/Tool 路径。

## 验收和限制

只能做源码/文档只读审计及 Fake Adapter 测试。不得改已安装 WeChatAgent、读取私人数据库/Token、安装 DLL/Hook、修改微信、启动真实发送或重启服务。创建独立研究 PR，先审查后决定集成。

## H0 对照补充（2026-10-25，未派发）

- 审计记录增加安装、卸载、图标和生命周期是否公开支持；目标身份不得以昵称代替稳定 ID。未公开注册机制只记为 INTERNAL_ONLY，不采用注入。

来源：PR #18 对应编号任务，经 [H0 对照记录](H0_PLAN_RECONCILIATION.md) 选择性吸收。仍是 PLANNED 路线条目，派发前须完善为 Level 2；本补充不启动工程实现。
