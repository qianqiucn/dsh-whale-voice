# Plan 04 · WeChatAgent 扩展机制与授权体系专项审计

**任务状态：PLANNED（推荐在 TTS-A 合并后）**

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
