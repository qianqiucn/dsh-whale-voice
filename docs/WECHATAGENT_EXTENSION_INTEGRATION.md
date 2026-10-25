# Plan 04-A · WeChatAgent / DSH 正式扩展能力与授权边界审计

**状态：** `RESEARCH-OFFLINE` / `SENT` / 文档研究
**日期：** 2026-10-25
**研究分支：** `research/plan04-wechatagent-extension-audit`
**唯一交付：** 本文件；不修改代码、配置、模型、PR #16/#17/#18/#19 或 `docs/plans/`
**唯一结论：** `RECOMMEND_DSH_ADAPTER_AND_OPTIONAL_V041_PLUGIN_AUDIT`
**未执行：** 未升级/重启 WeChatAgent/DSH/微信，未安装 ZIP/模型/二进制，未读取聊天/Token，未发送微信，未合并 PR

> 本文件是静态研究，不是本机安装证明、真实发送验证或法律意见。上游公开能力不等于当前用户已安装、启用或授权。`NOT_INSTALLED`、`RUNTIME_UNVERIFIED`、`UNKNOWN` 不得显示为可用。

---

## 1. 基线、版本与范围

### 1.1 执行时 GitHub 快照

| 对象 | 本轮核验 |
|---|---|
| `main` | `bf9cf66807e12d0b25872a0fa3869962dde04818` |
| PR #16 | OPEN，未合并，HEAD `954a01a08587bc8bd5b8caccf026298ca54d5215`，0 reviews，CI `40165832178` SUCCESS |
| PR #17 | 规划分支 `docs/whale-voice-execution-plan-registry`，HEAD `96f9643db08280e09e26fbb2dd75bb6a192ebd5c`，CI `40232474111` SUCCESS |
| PR #18 | OPEN/Draft，HEAD `42cec57ae7018735cb6c65a4ef8b0a1d80473810` |
| PR #19 | OPEN，HEAD `e21dee8a8192f24a3465f169c761e62d30611e59`，仅 `docs/SVC_PROVIDER_RESEARCH.md`，CI `40231587503` SUCCESS |
| Plan 03-B | `WAIT_USER_AUTHORIZATION`，不得合并 PR #16 |
| 本轮分支基座 | `main@bf9cf66` |

### 1.2 WeChatAgent 三版本固定

| 版本 | 发布时间 | Tag 对象 | 固定 Commit |
|---|---|---|---|
| 0.3.9 | 2026-10-20 | annotated tag | `0e76902a66c7bde6a3f78335284cea7f9be6e1b1` |
| 0.4.0 | 2026-10-23 | lightweight tag | `34766b6f52e8e87c09dff8ad19dc62c39700aa4d` |
| 0.4.1 | 2026-10-25 | annotated tag | `08c09da6773967dea72acd48ffb5a8c6555e0f9c` |

0.4.1 tag 本身是 `392f89cb44e03c8924e7b0c3f6c4dd25b5afc4dc`；研究使用其 dereference 后的 commit。0.3.9 tag 本身是 `34f60bc87e09004e7f7c59ce36e949381d583f17`。

### 1.3 本地工程事实

- 当前 `packages/adapter-wechatagent` 是**只读 Adapter**：检测安装/版本/进程与固定 `/WeChatAgent/health`，只支持 0.3.9 兼容判断；没有事件、身份、发送或 DSH Tool 注册。
- `docs/WECHATAGENT_COMPATIBILITY.md` 记录 0.3.9 / public 0.4.0 的 native voice 为 **UNSUPPORTED**；当前 Voice Sender UI Automation 才是既有语音投递路径。
- 0.4.1 是本轮上游新增的 ZIP Plugin API v2，**不是本机已安装功能**。
- `docs/VOICE_DELIVERY_BACKENDS.md` 当前仍以 UI Automation 为唯一支持的语音投递后端。

## 2. 结论先行与唯一推荐

**推荐：S1 保持现有 DSH Whale Voice Plugin + 只读 WeChatAgent Adapter；S2 的 v0.4.1 ZIP Plugin 仅保留后续审计资格；S3 禁止。**

| 方案 | 结论 | 原因 |
|---|---|---|
| **S1 DSH Plugin + Adapter** | **默认推荐** | 不升级 0.3.9；保留既有 Windows 微信语音链；权限、身份、任务由 DSH/Core/Relay 控制；但当前 Adapter 只读，Tool/事件/发送仍需后续计划 |
| **S2 0.4.1 ZIP Plugin** | **条件可选 / 只审计** | API v2 真实存在，但它是 WeChatAgent 宿主插件，不是 DSH 插件；无文件/音频发送 API；`ctx.fetch` 仅公开 GET，不能直连本机 Core；需升级宿主与新增桥接，当前不采用 |
| **S3 Hook/DLL/私有注入** | **禁止** | 绕过授权、版本脆弱、不可审计；不符合 WeChatAgent 所有权与安全边界 |

**S2 不是首发必需组件，也不是“把 DSH 插件改名 ZIP”就能得到的能力。**

## 3. API 证据索引（≥12 条固定定位）

> 所有链接固定在 commit；不含真实用户 ID、聊天内容或 Token。

| ID | 断言 | 版本@Commit | 文件#行 | Permalink | 类型 | 限制/未知 |
|---|---|---|---|---|---|---|
| E01 | 0.3.9 tag 指向 commit | `v0.3.9` | tag `34f60bc...` → commit `0e76902...` | <https://github.com/sourcepro5/WeChatAgent/releases/tag/v0.3.9> | release/tag | 非安装证明 |
| E02 | 0.4.0 tag 指向 commit | `v0.4.0` | commit `34766b6...` | <https://github.com/sourcepro5/WeChatAgent/releases/tag/v0.4.0> | release/tag | 非安装证明 |
| E03 | 0.4.1 tag 指向 commit | `v0.4.1` | tag `392f89c...` → commit `08c09da...` | <https://github.com/sourcepro5/WeChatAgent/releases/tag/v0.4.1> | release/tag | 2026-10-25 发布；非本机 |
| E04 | 0.3.9 无 ZIP Plugin API | `0.3.9@0e76902` | tree 无 `packages/plugin-api`、无 `docs/PLUGIN_DEVELOPMENT.md` | <https://github.com/sourcepro5/WeChatAgent/tree/0e76902a66c7bde6a3f78335284cea7f9be6e1b1> | tree | 旧版自定义扩展不由 WeChatAgent 加载 |
| E05 | 0.4.0 无 ZIP Plugin API | `0.4.0@34766b6` | tree 无 `packages/plugin-api`；DSH 插件仍在 DSH | <https://github.com/sourcepro5/WeChatAgent/tree/34766b6f52e8e87c09dff8ad19dc62c39700aa4d> | tree | 0.4.0 仍是 DSH 工具/技能路径 |
| E06 | 0.4.1 新增 ZIP 安装 | `0.4.1@08c09da` | `RELEASE_NOTES.md#L7` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/RELEASE_NOTES.md#L7> | release note | 安装≠启用；≠已授权聊天 |
| E07 | ZIP 清单 schema | `0.4.1@08c09da` | `docs/PLUGIN_DEVELOPMENT.md#L37-L73` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/docs/PLUGIN_DEVELOPMENT.md#L37-L73> | docs/schema | 未知顶层字段拒绝 |
| E08 | 示例 `plugin.json` | `0.4.1@08c09da` | `examples/plugins/chat-notes/plugin.json#L1-L16` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/examples/plugins/chat-notes/plugin.json#L1-L16> | source fixture | 示例不是生产插件 |
| E09 | API v2 权限/限额常量 | `0.4.1@08c09da` | `packages/plugin-api/catalog.mjs#L6-L10` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/plugin-api/catalog.mjs#L6-L10> | source | 权限只是宿主 API 约束 |
| E10 | DSH 插件格式不同于 ZIP | `0.4.1@08c09da` | `docs/PLUGIN_DEVELOPMENT.md#L14` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/docs/PLUGIN_DEVELOPMENT.md#L14> | docs | 不能直接转换 |
| E11 | DSH 插件包使用 `main`/`dsh.bundle.patch` | `0.4.1@08c09da` | `packages/dsh-social-bridge-plugin/package.json#L5-L29` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/dsh-social-bridge-plugin/package.json#L5-L29> | package | 需 DSH peer 依赖 |
| E12 | 安装预览不执行代码 | `0.4.1@08c09da` | `packages/plugin-api/installer.mjs#L21-L31`；`docs/PLUGIN_DEVELOPMENT.md#L261` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/plugin-api/installer.mjs#L21-L31> | source | 预览仍写 staging |
| E13 | 安装后默认 disabled | `0.4.1@08c09da` | `packages/plugin-api/installer.mjs#L50-L56`；`docs/PLUGIN_DEVELOPMENT.md#L238` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/plugin-api/installer.mjs#L50-L56> | source | 必须另选权限/聊天/启用 |
| E14 | 子进程隔离 | `0.4.1@08c09da` | `packages/plugin-api/process.mjs#L9-L18`、`#L44-L57` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/plugin-api/process.mjs#L44-L57> | source | Node child ≠ OS sandbox |
| E15 | 启用/权限/聊天 gate | `0.4.1@08c09da` | `packages/plugin-api/index.mjs#L21-L25`、`#L57-L64` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/plugin-api/index.mjs#L21-L25> | source | 缺一即不可用 |
| E16 | 当前聊天与 actor 字段 | `0.4.1@08c09da` | `packages/plugin-api/index.mjs#L62`；`docs/PLUGIN_DEVELOPMENT.md#L132-L136` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/plugin-api/index.mjs#L62> | source/docs | actor 可能为空；不是管理员凭据 |
| E17 | `reply` 是文本队列 | `0.4.1@08c09da` | `packages/plugin-api/index.mjs#L110-L112`；`docs/PLUGIN_DEVELOPMENT.md#L145` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/plugin-api/index.mjs#L110-L112> | source | `{queued:true}` ≠ 送达回执 |
| E18 | 无文件/音频发送 API | `0.4.1@08c09da` | `docs/PLUGIN_DEVELOPMENT.md#L168`；`packages/plugin-api/worker.mjs#L7-L15` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/docs/PLUGIN_DEVELOPMENT.md#L168> | docs/source | 不能把 text reply 当语音 |
| E19 | 白名单按私聊/群聊 | `0.4.1@08c09da` | `packages/extension-runtime/catalog.mjs#L168-L173` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/extension-runtime/catalog.mjs#L168-L173> | source | 需已有 whitelist |
| E20 | 私聊/群聊来源字段 | `0.4.1@08c09da` | `components/qq-bridge/src/onebot/normalize.js#L7-L11`、`#L27-L31` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/components/qq-bridge/src/onebot/normalize.js#L7-L11> | source | 昵称不作为 ID |
| E21 | 管理员身份独立 | `0.4.1@08c09da` | `packages/dsh-social-bridge-plugin/assistant-policy.mjs#L16-L36` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/packages/dsh-social-bridge-plugin/assistant-policy.mjs#L16-L36> | source | 真实 wxid 只在本机配置 |
| E22 | DSH 按聊天授权工具 | `0.4.1@08c09da` | `docs/DSH_CHAT_ACCESS.md#L5-L24`；`docs/PLUGIN_CATALOG.md#L7-L14` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/docs/DSH_CHAT_ACCESS.md#L5-L24> | docs | 授权仍按 DSH 工具 ID |
| E23 | 0.3.9/0.4.0 无语音发送 | `0.4.1@08c09da` | `docs/WECHATAGENT_COMPATIBILITY.md#L21-L22`（本仓库） | <https://github.com/qianqiucn/dsh-whale-voice/blob/main/docs/WECHATAGENT_COMPATIBILITY.md#L21-L22> | docs | 本机历史观测，不是 0.4.1 实测 |
| E24 | 0.4.1 升级需停止/重开 | `0.4.1@08c09da` | `RELEASE_NOTES.md#L27` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/RELEASE_NOTES.md#L27> | release note | 本轮未执行 |
| E25 | 许可证/第三方边界 | `0.4.1@08c09da` | `LICENSE#L1-L21`；`LICENSES.md#L1-L20` | <https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/LICENSE#L1-L21> | license | 根文本 MIT；第三方/Hook/SnowLuma 另核；GitHub metadata 为 NOASSERTION |

## 4. 三版本扩展机制矩阵

| 版本 | 扩展类型 | 发现/安装 | 清单 | 权限 | 启用/禁用 | 配置 | 更新/卸载 | 聊天范围 | Tool/Hook | UI 暴露 | 资源/隔离 | 状态 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.3.9 | DSH 插件/技能 + 内置扩展页 | 在 DSH 安装；WeChatAgent 扩展页只开关内置功能 | DSH package；`extensions/skills/meme-search` | DSH 原生工具授权 + 聊天范围 | DSH 管理插件；WeChatAgent 按会话授权 | DSH/WeChatAgent 配置 | 由 DSH 管理 | 私聊/群聊白名单；切换账号独立 | DSH Tool/Skill；无 ZIP `registerTool` | 扩展页、会话“技能与工具” | DSH/微信进程，非 ZIP 子进程 | `SUPPORTED_BY_PINNED_SOURCE`（DSH 路径）；ZIP `UNSUPPORTED` |
| 0.4.0 | 同上 + 助手模式/文件收发 | 在 DSH 安装；WeChatAgent 继续按聊天授权 | DSH package；无 ZIP API | DSH 原生权限 + 管理员/聊天范围 | DSH 管理；WeChatAgent 会话授权 | 同上 | DSH 管理 | 私聊/群聊；管理员控制 | DSH Tool/Skill；仍无 ZIP API | 能力页、聊天设置 | 非 ZIP 子进程 | `SUPPORTED_BY_PINNED_SOURCE`（DSH 路径）；ZIP `UNSUPPORTED` |
| 0.4.1 | DSH 插件/技能 + **ZIP API v2** | WeChatAgent 能力目录拖入 ZIP；安装预览；不执行代码 | `plugin.json`（apiVersion 2/host wechatagent）+ `index.mjs` | ZIP 声明权限 + 每插件/聊天 enable；DSH 工具仍另管 | 安装后 disabled；单独权限+聊天+启用 | 自动 Schema 设置；secret 脱敏 | 更新归档旧代码、清权限、停用；卸载保留数据 | `ctx.chat` 当前私聊/群聊；无跨聊天参数 | `api.registerTool`、`registerAction`、hooks；无 DSH Tool 直连 | 能力目录、卡片、设置 | Node 子进程、96MiB 堆、2s 加载/8s 工具/35s 动作；**非 OS 沙箱** | `SUPPORTED_BY_PINNED_SOURCE`（上游源码）；本机 `NOT_INSTALLED` / `RUNTIME_UNVERIFIED` |

### 4.1 0.4.1 ZIP 生命周期

```text
选择 ZIP
 -> inspect：解包/清单/限额校验，返回 ticket + 预览；不执行插件
 -> install：确认 ticket/revision；代码落盘，enabled=false、permissions=[]
 -> 用户在能力目录选择权限与聊天
 -> enable：必须与插件声明权限一致；聊天必须在 whitelist
 -> 子进程启动/加载（2 秒），注册 tool/action/hook
 -> 使用：每轮最多 3 个工具，每次 8 秒；超时/取消/崩溃杀死该子进程
 -> disable/update/uninstall：结束进程；更新清权限并停用；卸载保留数据
```

关键限制（源码/文档）：

- ZIP ≤8 MiB，解压 ≤16 MiB，单文件 ≤4 MiB，≤128 项，≤32 插件，同时 ≤8 运行。
- 安装预览只做校验，不执行代码；安装本身仍写 staging/plugins；启用是独立动作。
- 更新相同 id 会归档旧代码、清空权限、停用，必须重新确认；卸载归档代码，保留插件数据。
- 插件只能访问主机暴露的 `storage/history/fetch/reply/documents/persona/model_generate/schedule` 等 API；没有任意文件/原生图片/音频发送 API。
- 进程隔离是故障隔离，不是 OS 沙箱；Node 仍可访问本机文件/系统能力，因此只应启用信任来源。
- `ctx.fetch` 只允许公开 HTTP(S) GET、受限时间和大小，拒绝本机/内网；因此 **ZIP 插件不能借它直接调用本机 Whale Audio Core**。注意：插件代码仍在非 OS 沙箱的 Node 子进程中，理论上可用 Node 原生网络/文件能力；那属于未经批准的私有桥接，不是受支持的 Core 路径，也不得用来绕过 `ctx.fetch` 或权限。

## 5. DSH Plugin 与 WeChatAgent ZIP Plugin 的区别

| 维度 | DSH Plugin（Whale Voice 当前路径） | WeChatAgent ZIP Plugin（0.4.1） |
|---|---|---|
| 宿主 | DSH | WeChatAgent bridge |
| 入口/包格式 | `package.json` `main/index.js`；可含 `dsh.bundle.patch`/Cordis patch | `plugin.json` `apiVersion=2,host=wechatagent` + `index.mjs` |
| 安装位置 | DSH 插件管理器 | WeChatAgent “能力 → 能力目录” |
| Tool 注册 | DSH plugin/Cordis 工具 | `api.registerTool()`，名称 `<pluginId>__<toolId>` |
| 权限 | DSH 原生工具授权 + WeChatAgent 按聊天分配 | ZIP permissions + `enabled` + `chats` |
| 运行时 | DSH 进程/其插件运行时 | 独立 Node 子进程（非 OS 沙箱） |
| 文件/音频发送 | 由 DSH 工具/Relay 另行决定 | **无文件/音频发送 API**；`reply` 仅文本 |
| 是否可互相改名 | **否**；文档明确不兼容 | **否**；ZIP 不是 DSH 插件 |
| 当前本机 | 只读 Adapter + 既有 DSH 插件；无新 Tool | **未安装** 0.4.1 ZIP 宿主/插件 |

**不能把现有 DSH Whale Voice 项目压缩为 ZIP，也不能把 ZIP 插件当 DSH 插件安装。**

## 6. 身份、来源与权限

### 6.1 可信输入

| 输入 | 来源/证据 | 用途 | 不可信/缺失时 |
|---|---|---|---|
| `ctx.chat.key` | 当前聊天 `wechat:(private|group):<opaque-id>`（E16） | 当前任务作用域 | 非当前会话 -> 拒绝 |
| `ctx.chat.kind` | private/group（E16/E20） | 私聊/群聊区分 | 非二值 -> 拒绝 |
| `ctx.chat.id` | 规范化会话 ID（E20） | 与白名单交集 | 空/畸形 -> 拒绝 |
| `ctx.actor.id` | 当前批次可识别发送者；可能为空（E16） | 当前发送者隔离 | 空 -> 不能做需身份操作 |
| `ctx.account.id` | 账号作用域哈希，不含原 wxid（E16） | 存储/授权隔离 | 未绑定 -> `requiresAccount` 插件不可用 |
| admin 真实 wxid | 本机 assistant settings（E21） | 管理员任务/审批 | 昵称/群名/模型声明不算 |
| `sender_key` | 仅 64 hex `memberId`（E20） | 群友稳定成员键 | 不再用昵称猜 |
| DSH 工具授权 | DSH 按会话保存工具 ID（E22） | 允许 Tool | 未授权 -> Tool 不可见/不可执行 |
| ZIP permissions/chats | `config/plugins.json` + whitelist（E15/E19） | 启用 gate | 任一缺失 -> 不可用 |
| `PENDING_ROUTER` | 共享 SVC/音频路由状态（概念边界） | 等待 Relay | 不是发送权限 |
| `UNKNOWN` | 发送/回执不确定 | 终止，不重发 | 不自动重试/不换后端 |
| `accountVerified` | 只接受显式 boolean（本仓库 Adapter） | 账号验证 | 缺失/401 -> null/未知，不绿色 |
| `displayName`/群名 | 展示字段 | 仅显示 | 不用于 target/授权 |
| Tool 参数目标 ID | 模型/插件输入 | **不可信** | 必须与当前聊天/白名单交叉验证 |
| 插件 id/tool id | 清单/注册 | 命名空间/权限 | 冲突 -> 撤回/拒绝 |

### 6.2 私聊/群聊与授权路径

```text
微信消息
 -> WeChatAgent reader
 -> normalize: kind=private|group, conversation_id, sender_id
 -> DSH/WeChatAgent per-chat whitelist and tool authorization
 -> only current chat's allowed tools reach the model
 -> Core creates one task; Relay performs one delivery
```

- 私聊标识来自 `user_id`；群聊来自 `group_id`；缺失/非 private|group 直接拒绝（E20）。
- 群友稳定键只在 `memberId` 为 64 hex 时附加；昵称/群名只作展示（E20）。
- 管理员是真实 wxid 列表；`assistantAdministrator` 只匹配该列表，`ctx.actor` 不是管理员凭据（E16/E21）。
- DSH 工具授权按会话工具 ID 保存；插件改名/同名不会自动扩权；未授权不会进入模型工具声明（E22）。
- ZIP 插件 `active()` 同时检查 enabled、generation、进程、声明权限、授予权限、聊天白名单、chats 列表；任一失败即不可用（E15）。
- 账号切换后使用账号作用域；旧账号授权不能沿用（E16；`DSH_CHAT_ACCESS` L38）。
- 没有授权时：不注册/不暴露 Tool、不执行、不发送；可离线预览/保存（设计）。

### 6.3 取消、超时、重复

- ZIP Tool：每轮最多 3 次，每次 8 秒；超时/取消/崩溃会终止该子进程；不归档 DSH 会话（E14；PLUGIN_DEVELOPMENT L124）。
- ZIP Action：最多 35 秒；`ctx.signal` 取消；UI 仍须区分“已请求取消”和“真实停止”。
- DSH 原生任务：任务编号/持久批次去重；DSH 重启将执行中任务标为中断，不自动重跑（ASSISTANT_REMOTE L66）。
- 发送：`ctx.reply` 只排队文本，不是送达回执；文件和音频没有 API（E17/E18）。
- `UNKNOWN` / 超时可能已产生外部副作用：不自动重发、不自动换后端；必须人工核对。
- Relay 仍是唯一投递决策层；所有发送必须一次 task/delivery ID、目标复核和去重。

## 7. 责任边界与目标链路

```text
Whale Voice / Whale Singing (UI)
  -> Whale Audio Core (TTS/SVC, voice/model/artifact/tasks)
  -> Whale Relay Core (target verification + one delivery)
  -> Voice Sender (existing Windows UI Automation)
  -> WeChat

WeChatAgent:
  - WeChat connection, account/session identity, whitelist, existing authorization
  - DSH bridge: routes only authorized per-chat tools
  - NOT audio inference, NOT RVC/TTS, NOT a second Core
```

- WeChatAgent 仅负责微信接入、账号/会话身份、聊天范围和既有授权；不承担音频推理。
- DSH/ZIP 插件只发起任务/返回 artifact；不直接发送语音/歌曲。
- Whale Audio Core 拥有任务/音频/音色/模型/Artifact；Whale Relay 只做安全投递；Voice Sender 保留最终目标/设备/取消。
- `PENDING_ROUTER` 是等待 Relay 的中间状态，不是“已发送”或“可发送”。
- 当前唯一支持的真实语音投递后端仍是 UI Automation；WeChatAgent native voice 在 0.3.9/0.4.0 是 `UNSUPPORTED`，0.4.1 API v2 也没有文件/音频发送 API。

## 8. 许可、Token、子进程与公网风险

- WeChatAgent 根 LICENSE 文本为 MIT；但 GitHub metadata 为 `NOASSERTION`，且 `LICENSES.md` 明确第三方 Hook/WeChat/SnowLuma 等有独立许可/非商业条款；不能把根 MIT 扩大为所有组件。
- ZIP 插件作者的代码/模型/素材许可由插件作者决定；安装前必须展示来源/版本/权限，不能把“公开 ZIP”当安全。
- `X-Console-Token` 保护 `/api/plugins`；Token 不应由插件读取/记录；本轮未读取任何 Token。
- 子进程限制环境变量和 96 MiB 堆，但不是 OS 沙箱；恶意插件仍可能直接访问本机文件/系统能力。
- `ctx.fetch` 限制公开 GET、DNS/IP/重定向并拒绝内网；这降低 SSRF，但不等于“插件完全无网络”。
- 0.4.1 升级要求停止后台、退出 WeChatAgent/DSH、重开；**本轮未执行**，不得自动升级。
- 0.4.1 的 ZIP 安装器/宿主是新的攻击面；只应启用可信来源，不能默认自动安装第三方 ZIP。

## 9. S1 / S2 / S3 对比

| 维度 | S1：DSH Plugin + Adapter | S2：0.4.1 ZIP Plugin | S3：Hook/DLL/私有注入 |
|---|---|---|---|
| 用户步骤 | 打开 DSH/Whale Voice；核对权限；生成/试听/保存；单独确认发送 | 需 0.4.1 宿主；能力目录预览/安装；选权限/聊天；启用；再回到 Core 工作流 | 安装/替换私有组件、绕过授权 |
| 兼容 0.3.9 | **是** | 否，要求 0.4.1 | 不可保证 |
| 是否需升级 | 否 | **是** | 高 |
| API 稳定性 | DSH 原生 + 只读 Adapter；未来 Tool 约定需设计 | API v2 是新的 WeChatAgent 宿主契约；仍可能变化 | 私有/不稳定 |
| 权限 | DSH 原生 + 会话授权 + Relay | ZIP permissions + per-chat + `enabled` | 绕过/不透明 |
| 私聊/群聊 | 现有白名单/会话授权；群聊仍需唤醒规则 | `ctx.chat` 当前会话；白名单 | 风险不可控 |
| 文件/音频发送 | 现有 UI Automation 语音链；音频文件需单独审查 | **无文件/音频 API**；仅文本 reply | 禁止 |
| 无 GPU 预览 | 可离线试听/保存 | 依赖 Core，当前无直接连接 | 不适用 |
| 新手安装 | 不需要额外升级；现有 0.3.9 | 需 0.4.1 升级/宿主重开；更复杂 | 不可接受 |
| 安全风险 | 中；保留既有 Relay/Voice Sender | 中高；新宿主/子进程/供应链 | 高 |
| 推荐 | **默认** | **只做后续可选审计** | **禁止** |

**S2 的实际阻塞：** API v2 没有文件/音频发送 API；`ctx.fetch` 只允许公开 HTTP(S) GET 且拒绝本机/内网，因此不能经宿主 API 直接访问本机 Whale Audio Core。插件代码虽非 OS 沙箱、理论上可用 Node 原生网络，但那属于未批准私有桥接，不能作为安全集成方案。要让它成为语音/唱歌入口，需要新的受权本地桥接、权限模型和独立安全审查。**当前不建议把它作为首发路径。**

## 10. Novice First：中文流程与四种恢复

### 10.1 标准 S1 流程（未来设计，不是当前已实现）

1. 打开 DSH，看到 **Whale Voice · 语音气泡** 或 **Whale Singing · 唱歌**。
2. 点击功能，自动只读检查 Core、WeChatAgent、语音发送依赖；不自动安装/升级。
3. 若微信未连接：只禁用“发送”，保留本地生成/试听/保存。
4. 用户在微信侧完成账号/会话授权；DSH 只读取授权状态，不要求输入 wxid/Token。
5. 生成/试听后，点击“发送到已授权聊天”；再次确认目标与一次投递。
6. 显示 `QUEUED` / `SENT_LOCAL` / `UNKNOWN`；`UNKNOWN` 不自动重发。

### 10.2 可选 S2 预览流程（仅 0.4.1 已安装且未来获授权时）

1. WeChatAgent “能力 → 能力目录”。
2. 查看来源/版本/权限，拖入经审计 ZIP。
3. 预览 → 确认安装 → 选择权限/聊天 → 主动启用。
4. 回到 Whale Audio Core 生成/保存；ZIP 只能发起受权文本/任务意图，不能直接发音频。
5. 当前 0.3.9 不显示 ZIP 安装按钮或路径；不自动升级。

### 10.3 四种中文错误恢复

| 文案 | 原因 | 现在可做什么 | 允许的离线能力 |
|---|---|---|---|
| **需要先连接微信框架** | WeChatAgent 未安装/未连接/无可用 Bridge | “重新检测” / “查看安装说明” / “仅本地使用” | 生成、试听、保存；禁用发送 |
| **这项权限尚未允许** | 当前聊天不在白名单，或工具/插件权限未授予 | “打开授权说明” / “检查当前聊天” / “取消” | 本地生成/保存；不发送 |
| **当前宿主版本暂不支持该能力** | 0.3.9 无 ZIP API，或 0.4.1 未安装/未启用 | “查看版本说明” / “继续使用当前可用功能” / “返回” | 不自动升级；本地功能可用 |
| **发送结果尚未确认，请先核实聊天记录，不能自动重复发送** | 超时/断连/回执 `UNKNOWN` | “查看任务状态” / “人工核实聊天” / “结束” | 不自动重发、不换后端 |

其他边界：窄屏/键盘可操作；对话框可 Esc/取消；重复进入不无限弹窗；未授权不能靠“重试”变成授权；Fake/Mock 不得显示真实安装/发送成功。

## 11. ≥15 个 Fake 测试种子（本轮不执行）

| Case | input | expectedStatus | visibleZhText | failClosed | noExternalEffect | ownerPlan |
|---|---|---|---|---|---|---|
| 01 | 0.3.9，无 ZIP API | `S1_FALLBACK` | “当前版本使用现有 DSH 适配器” | 是 | 不安装 ZIP | 05/09 |
| 02 | 0.4.1 ZIP 已安装未启用 | `INSTALLED_DISABLED` | “已安装，尚未启用” | 是 | 不执行插件 | 09/14 |
| 03 | 工具权限已授予、聊天未授权 | `CHAT_DENIED` | “这项权限尚未允许” | 是 | 不调用工具 | 09/13 |
| 04 | 私聊允许、群聊拒绝 | `PRIVATE_ALLOWED_GROUP_DENIED` | “当前群聊未授权” | 是 | 不向群发送 | 13 |
| 05 | account 未验证 | `ACCOUNT_UNVERIFIED` | “微信账号尚未验证” | 是 | 不发送 | 13 |
| 06 | 401 auth_required | `AUTH_REQUIRED` | “需要先连接/验证微信” | 是 | 不重试、不绿灯 | 13 |
| 07 | 昵称重复/稳定 ID 不明 | `IDENTITY_AMBIGUOUS` | “无法确认当前聊天身份” | 是 | 不猜目标 | 13 |
| 08 | Tool id 冲突/权限撤销 | `TOOL_UNAVAILABLE` | “当前工具不可用，请重新授权” | 是 | 不执行 | 05/09 |
| 09 | 插件加载超时/worker 终止 | `PLUGIN_TIMEOUT` | “插件加载失败，可重试或停用” | 是 | 只杀该进程 | 09/14 |
| 10 | 任务中途权限撤销 | `PERMISSION_REVOKED` | “授权已变化，任务已停止” | 是 | 不继续/不发送 | 13 |
| 11 | 用户点取消但服务端未确认 | `CANCEL_REQUESTED` | “已请求取消，尚未确认停止” | 是 | 不宣称已取消 | 13 |
| 12 | 重复任务/重复点击发送 | `DEDUPED` | “已在处理，不重复提交” | 是 | 单 task/delivery | 13 |
| 13 | 发送超时/UNKNOWN | `UNKNOWN` | “结果未知，请先核实，不能自动重发” | 是 | 不重发/不换后端 | 13 |
| 14 | 仅试听/保存、无微信依赖 | `LOCAL_ONLY` | “仅本地试听/保存” | 是 | 不访问微信 | 08/09 |
| 15 | ZIP `ctx.reply` 文本 | `TEXT_REPLY_ONLY` | “只能发送文本，不能发送音频” | 是 | 不当语音/文件 | 09/13 |
| 16 | Fake SongId/版权未确认 | `SOURCE_RIGHTS_UNVERIFIED` | “请提供有权使用的音频” | 是 | 不下载歌曲 | 07/12 |
| 17 | CPU/noGPU 未验证 | `SVC_READY_UNVERIFIED` | “当前设备未验证可运行” | 是 | 不显示可用 | 12 |

所有案例为**设计种子**，不创建真实 DSH Tool、不安装 ZIP、不调用微信 API。

## 12. A01–A15 验收

| ID | 结果 | 证据 |
|---|---|---|
| A01 main/#16–#19 实时事实 | **PASS** | 第 1 节；#16 OPEN/0 reviews；03-B WAIT |
| A02 三版本 tag→commit 固定 | **PASS** | 第 1.2 节；annotated tag 已 dereference |
| A03 API v2 规范 + ≥12 证据、许可状态 | **PASS** | 第 3 节 E01–E25；根 LICENSE MIT，第三方另核 |
| A04 DSH 与 ZIP 不兼容 | **PASS** | E10/E11；格式表；不能改名/转换 |
| A05 三版本扩展/Tool/生命周期矩阵 | **PASS** | 第 4 节；0.3.9/0.4.0 无 ZIP；0.4.1 有 v2 |
| A06 权限/聊天/撤销/取消/Host/隔离 | **PASS** | 第 4/6 节；E09/E12–E15/E19 |
| A07 来源/身份/私群/fail closed | **PASS** | 第 6 节；当前 Adapter 无 DSH Tool，未来来源映射仍 `UNVERIFIED_ORIGIN`；不猜目标 |
| A08 WeChatAgent 不执行音频推理；Core/Relay/Sender 边界 | **PASS** | 第 7 节；E18/E23；Voice Sender 保留 |
| A09 S1/S2/S3 对比，唯一推荐 | **PASS** | 第 9 节；S1 默认；S2 只审计；S3 禁止 |
| A10 音频/文件能力有源码证据，不把 reply 当音频 | **PASS** | E17/E18；`reply` 文本队列；无 file/audio API |
| A11 Novice First 两条流程/四恢复/无 CLI/当前限制 | **PASS** | 第 10 节；仅为静态设计，当前未实现 UI/安装器 |
| A12 ≥15 Fake 测试与 Plan 映射 | **PASS** | 第 11 节 17 案例；不执行 |
| A13 docs-only 1 文件；无密钥/个人信息 | **PASS** | 仅本文件；未复制真实 ID/Token |
| A14 最新 PR HEAD CI 与 NOT_RUN 区分 | **PASS** | 第 13 节；真实 CI；模型/微信 NOT_RUN |
| A15 单一结论与 Stop；保留 03-B/01–14 | **PASS** | 第 14 节；未合并、未改计划 |

**A07 的有限性：** 当前 Adapter 没有 Whale Voice DSH Tool；DSH 工具来源/身份映射是根据上游 DSH 集成文档与源码的静态证据，未来实现必须使用当前 turn 的 `conversation_id`/`sender_id`，不得接受模型参数中的聊天 ID。未实际验证时标 `UNVERIFIED_ORIGIN`，不能安全发送。

## 13. 检查、Git/CI 与未运行项

本地（仅文档）：

```text
git diff --check                 PASS
docs integrity / Markdown UTF-8  PASS
secret/privacy scan              PASS
```

- 研究分支：`research/plan04-wechatagent-extension-audit`。
- 新建独立 docs-only PR；相对 `main` 只包含本文件。
- Node/UI 测试：**NOT_RUN**（未改工程代码；CI 不是接口/微信验证）。
- 真实 WeChatAgent/DSH/微信安装、升级、重启、Tool 注册、ZIP 安装、音频/文件发送、聊天读取：**NOT_RUN / OUT_OF_SCOPE**。
- 最终 PR HEAD/CI 以实际查询为准；排队或失败不得宣称 SUCCESS。

## 14. 唯一结论与停止

**`RECOMMEND_DSH_ADAPTER_AND_OPTIONAL_V041_PLUGIN_AUDIT`**

含义：

- 推荐保持 **S1**：现有 DSH Whale Voice Plugin + 只读 WeChatAgent Adapter；不升级 0.3.9。
- **S2** 0.4.1 ZIP API v2 仅保留后续可选审计资格；当前不安装、不启用、不把它当 DSH 插件。
- **S3** 禁止。
- 不是批准真实 ZIP 安装、真实语音/文件发送、微信 Tool 注册、生产配置写入或 PR 合并。
- Plan 03-B 仍 `WAIT_USER_AUTHORIZATION`；PR #16/#17/#18/#19 均不合并。

**硬停止：** 任何真实安装/升级、ZIP 执行、Token/聊天读取、Tool 注册、音频/文件发送、生产写入或 PR 合并，立即停止并等待单独授权。

## 15. 未决/UNKNOWN

1. 0.4.1 ZIP API v2 在真实 Windows/DSH/微信组合上的安装、启用、升级和取消行为未实测。
2. `ctx.actor` 在私聊/群聊中的实际可信度、空值率和账号切换行为未实测。
3. ZIP 插件无法通过 `ctx.fetch` 调本机 Core；未来是否需要新的本机桥接/受权 API 未决定。
4. DSH Tool 的当前 Whale Voice 来源身份映射未实现；当前 Adapter 只读。
5. 0.3.9/0.4.0 的 native voice/file send 仍未验证；上游 0.4.1 也没有文件/音频 API。
6. 第三方 ZIP 作者许可、Hook/微信/SnowLuma 条款和安装器签名状态未逐项法律核验。
7. 真实 WeChatAgent 0.4.1 升级、DSH 重开、插件安装、发送回执与 UNKNOWN 未执行。

## 16. 来源（pinned）

- 0.3.9：<https://github.com/sourcepro5/WeChatAgent/tree/0e76902a66c7bde6a3f78335284cea7f9be6e1b1>
- 0.4.0：<https://github.com/sourcepro5/WeChatAgent/tree/34766b6f52e8e87c09dff8ad19dc62c39700aa4d>
- 0.4.1：<https://github.com/sourcepro5/WeChatAgent/tree/08c09da6773967dea72acd48ffb5a8c6555e0f9c>
- Plugin API v2 规范：<https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/docs/PLUGIN_DEVELOPMENT.md>
- 0.4.1 release：<https://github.com/sourcepro5/WeChatAgent/releases/tag/v0.4.1>
- 0.4.1 LICENSE：<https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/LICENSE#L1-L21>
- 0.4.1 third-party notices：<https://github.com/sourcepro5/WeChatAgent/blob/08c09da6773967dea72acd48ffb5a8c6555e0f9c/LICENSES.md>
- 本仓库 Adapter：`packages/adapter-wechatagent/index.mjs`（当前 main）
- 本仓库兼容文档：`docs/WECHATAGENT_COMPATIBILITY.md`
- 本仓库投递后端：`docs/VOICE_DELIVERY_BACKENDS.md`
