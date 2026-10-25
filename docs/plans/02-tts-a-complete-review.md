# Plan 02 · TTS-A / TTS-A-H 多引擎设计最终复核（EXECUTION-READY）

**任务状态：IN PROGRESS；当前子状态：REVIEW_REQUIRED（功能补充已提交，待最终审查）**  
**计划版本：v2 · 2026-10-25**  
**工程执行者：DeepSeek；计划与 DONE 标记者：ChatGPT。**  
**当前已知 Git 基线：** main `bf9cf66807e12d0b25872a0fa3869962dde04818`；目标 [PR #16](https://github.com/qianqiucn/dsh-whale-voice/pull/16) head `1fd2ccaed3ee7e1c90c7caee1f22a7458ad1c184`（执行前必须重新核验）。  
**最新已核实 CI：** run `40160267636` SUCCESS；PR 报告记录 Node 192（191 PASS / 1 平台 skip）、UI 24/24、build 217349 bytes。  
**目标验收等级：DESIGN / OFFLINE。禁止将此阶段称作真实 TTS/SVC INTEGRATED。**

> 此计划已根据 **PR #16 的最新实际代码**从“要求新增 3 个 Provider 候选与 Relay/SVC”改为“核对已提交的结果，仅修补发现的明确缺口”。**不要重复做已经完成的候选注册或新建第二个 TTS-A PR。**

## 1. 唯一目标和可交付结果

完成 PR #16 对本轮**纯契约设计**的终审：10 个 TTS 候选、2 个 SVC 候选、统一三层职责、TTS/SVC 独立请求及配置迁移提案相互一致；候选全为不可选择、无真实 I/O；安全负向用例和 CI 通过后，向 ChatGPT 返回一份逐条验收报告，由 ChatGPT 决定计划 02 是否可标 `DONE`。

**不实现：** TTS-B 生产中立化、真实 Qwen/IndexTTS/Gemini/OpenAI/SVC Adapter、API 凭据、生产写路由、Qwen 服务启动、Voice Sender/Whale Relay 真正集成、微信发送。

## 2. 已核实事实与未决范围

| 文件/状态 | 当前仓库事实 | 本轮操作 |
|---|---|---|
| `core/tts/provider-registry.mjs` | 已有 `indextts`、`google-gemini-tts`、`openai-speech` 候选；全部 `NOT_IMPLEMENTED` / `selectable:false` | **只核验，不重复实现** |
| `core/svc/svc-contract.mjs` | 已有纯 SVC 音频输入契约，无推理 I/O | 核对与 TTS 差异 |
| `core/svc/svc-registry.mjs` | Seed-VC、RVC 候选，不属于 TTS Registry | 核对候选不可用 |
| `docs/TTS_PROVIDER_ARCHITECTURE.md` | 已写 Whale Voice Core / Whale Relay / WeChatAgent 三层职责 | 核对与源码/安全 ADR 一致 |
| `core/tts/provider-config.mjs` | 设计级 v2 迁移、Qwen v1 保留、云端凭据引用规则 | 核对迁移与脱敏 |
| `test/tts-provider.test.mjs` | Fake Provider 契约与候选检查 | 运行并核对负面断言 |
| `test/svc-contract.test.mjs` | SVC 独立输入、候选和失败关闭检查 | 运行并核对负面断言 |
| 生产 GUI / Core | 当前尚保留 Qwen/`whale-v1` 的显示及全局关联 | **只列入后续 TTS-B/Provider Core，不在 PR #16 开发** |

**最新只读终审发现 5 项需要验证/修复的纯契约缺口（F01–F05）。** 当前不得标 DONE；只能在同一 PR #16 分支做最小契约与测试修补，不得进入生产适配器。见下文「2.1」。

## 2.1 2026-10-25 ChatGPT 源码静态复核：F01–F05（待 DeepSeek 运行证明）

证据基线：PR #16 head `1fd2ccaed3ee7e1c90c7caee1f22a7458ad1c184`；该 HEAD 的 GitHub Actions run `40160267636` 为 SUCCESS（build + UI），但**绿灯不是本节负向用例的覆盖证明**。下述缺口来自逐函数静态阅读，**没有在本轮本地运行 Node/Playwright，也没有执行真实服务、音频、付费请求或微信发送**。如果工程 HEAD 变化，先重新查证，已修复者记 PASS，不重复实现。

| 编号 | 文件/函数 | 静态观察 | 应达到的明确契约 |
|---|---|---|---|
| F01 | `core/tts/provider-contract.mjs` / `validateProviderManifest()` | 注释声称拒绝未知顶层字段；实际只校验已知字段与精确命中的 forbidden key，未知普通字段可被原样克隆返回 | 采用顶层键白名单；如添加 `deliveryTarget`、`targetChatId` 或任意未知键，应返回 `INVALID_MANIFEST`；不回传原始注入字段 |
| F02 | 同文件 / `checkSynthesisRequest()` | 对有效 Fake manifest + `observation.state:'ok'` 的请求，只读取已知键，额外 `wechat`/`targetChatId` 等不会被拒绝 | 采用明确请求字段白名单（当前文档含 `requestId,text,voiceId,language,emotion,format,streaming`）；未知字段和投递字段一律失败关闭；无新 I/O |
| F03 | `core/svc/svc-contract.mjs` / `validateSvcRequest()` | 仅拦截少数 forbidden key，`targetChatId` 等未知字段可随完整输入 `JSON.parse(JSON.stringify(input))` 返回 | 采用白名单（`sourceAudioRef,targetVoiceId,pitchShift,formantShift,conversionStrength,outputFormat`），其余键返回 `SVC_INVALID_REQUEST`，成功结果只由允许字段构成 |
| F04 | `core/tts/provider-contract.mjs` / `evaluateProviderStatus()`、`checkSynthesisRequest()` | 对必需凭据的 Cloud Fake，`credentials:'unknown'` + `state:'ok'` 可报告 `AVAILABLE` 并通过请求校验 | 仅在必需凭据明确为 `present` 且观测健康时可 `AVAILABLE`；`missing` 继续 `CREDENTIALS_MISSING`，`unknown` 降级 `UNKNOWN`/拒绝请求，不得据 `ok` 猜测凭据已授权 |
| F05 | `core/tts/provider-contract.mjs` / `normalizeSynthesisResult()` | 文档称拒绝 `target`，但 forbidden key 不含 `target`，不匹配字段可被悄然丢弃而正常返回 `ok:true` | 明确结果顶层字段白名单（文档结果字段及现有 `warnings,createdAt`），未知投递目标键应拒绝而非静默忽略；成功输出继续仅有 `delivery:PENDING_ROUTER` |

**唯一推荐执行顺序（仍属既有 Plan 02/PR #16，不另开 PR）：**

1. 重读最新 PR #16 head、既有 TTS/SVC Contract、架构文档、测试；若 F01–F05 在新版本已修，记录行级证据和测试 PASS，不改该项。
2. 为每项先补至少一个负向回归测试；保留已有合法 Fake provider、Qwen 迁移与 TTS/SVC 契约用例。对拒绝统一沿用当前稳定错误码，不增加真实发送/新 API。
3. 按 F01→F05 做最小纯函数修补。只对白名单规定的键进行转换和返回；不传播调用者输入的未知隐私/目标字段。不要因未知凭据或 version/health 状态推断引擎已安装或可执行。
4. 运行现有 `node build.mjs`、`node --test`、`npm.cmd run test:ui`、`git diff --check`、文档/Secret 检查；无生产 Root、Owner API、模型调用、真实微信发送。
5. 若有修复，提交到同一个 PR #16，核对新 HEAD 的 CI；回报 F01–F05 + T01–T10 的 PASS/FAIL/BLOCKED、文件/行、Commit 与未覆盖项。**未通过前继续 REVIEW_REQUIRED；通过后由 ChatGPT 核验 DoD，是否合并还需用户单独授权。**

**附加必须可判定的回归：**

- N01 manifest 含未知顶层字段与伪投递键时拒绝；完全合法 Manifest 仍 PASS。
- N02 TTS 请求含 `wechat`、`targetChatId`、`delivery` 等附加字段拒绝；合法 `requestId` 与文本等不被误拒。
- N03 SVC 请求含 `targetChatId`、`recipient` 或未知嵌套对象时拒绝，不得回传；合法源 Artifact 请求仍 PASS。
- N04 必需凭据未知+健康 ok 不得进入 `AVAILABLE`/允许合成；缺失/已证实存在/无须凭据独立测试。
- N05 TTS 合成结果带 `target`、`targetChatId` 或未知敏感字段拒绝；合法 Artifact+`PENDING_ROUTER` 继续 PASS。

**审查约束：** 此处记录的是待工程复现的代码审查发现，不是已运行测试的 FAIL，也不改变 TTS-A 的 DESIGN/OFFLINE 或 Plan 02 的 IN PROGRESS/REVIEW_REQUIRED。不得由 ChatGPT 在此计划 PR 代替 DeepSeek 修改运行代码。

## 3. 前置与阅读顺序（DeepSeek 实施侧）

1. `AGENTS.md` 与 `docs/WECHATAGENT_COMPATIBILITY.md`（通用工程/微信安全边界）。
2. 本 PR #16 最新 Diff 与最新 HEAD（不能盲信此处历史 SHA）。
3. `core/tts/provider-contract.mjs`、`core/tts/provider-registry.mjs`、`core/tts/provider-config.mjs`。
4. `core/svc/svc-contract.mjs`、`core/svc/svc-registry.mjs`。
5. `test/tts-provider.test.mjs`、`test/svc-contract.test.mjs`。
6. `docs/TTS_PROVIDER_ARCHITECTURE.md`、`docs/TTS_PROVIDER_AUDIT.md`、`docs/DECISIONS.md` 中与 Provider / Delivery / UNKNOWN 相关的既有决策。

DeepSeek 无须执行 ChatGPT 专属计划管理流程，不负责更改 `docs/plans/`。

## 4. 允许的改动范围

**默认不改代码；只做只读审查、真实运行现有自动化和报告。**

若实际发现明确错误，允许在**现有 PR #16 分支**做最小修复，限定为：

- `core/tts/provider-contract.mjs`
- `core/tts/provider-registry.mjs`
- `core/tts/provider-config.mjs`
- `core/svc/svc-contract.mjs`
- `core/svc/svc-registry.mjs`
- `test/tts-provider.test.mjs`
- `test/svc-contract.test.mjs`
- `docs/TTS_PROVIDER_ARCHITECTURE.md`
- `docs/TTS_PROVIDER_AUDIT.md`
- 必要的 README/状态说明（且必须核对与现有 PR 变动不冲突）。

**不要修改：** `index.js` 生产 Host 写路由、`core/config-store.mjs`、`core/config-coordinator.mjs` 生产协调逻辑、`core/detect.mjs` 真实环境读写、已安装 WeChatAgent、Bridge、Worker、Voice Sender、Qwen、真实前端可写控件。

## 5. 预期契约与行为

### 5.1 Registry

- TTS Registry 需至少包含当前已登记的 10 个候选（按 ID 对比，不依赖数组排序）：`qwen3-tts`、`piper`、`kokoro`、`sherpa-onnx`、`indextts`、`azure-speech`、`elevenlabs`、`google-gemini-tts`、`openai-speech`、`custom-http`。
- 每项 `integrationStatus === "NOT_IMPLEMENTED"`、`selectable === false`；Registry 汇总 `implemented: []`、`selectable: []`、`defaultProviderId: null`。
- `qwen-local` 只能作为兼容别名/当前用户保存值，不自动设置成产品默认 Provider。
- 模型名、可用语言、音色、情绪、费用、接口细节若尚无可核实证据，不能虚构为“已审计能力”。

### 5.2 TTS/SVC 分离

- TTS 请求含文本和合成参数，SVC 请求含已有音频引用和转换参数；不接受 SVC 任务冒充 `synthesize(text)`。
- Seed-VC 与 RVC **只**出现在 SVC Registry，不出现在 TTS Provider 目录。
- 两类纯契约都不应执行 I/O、下载、真实生成、读取秘密或发送微信。
- 合成/转换结果是待验证的音频 Artifact，Delivery 仍须经过 Core/Whale Relay；Provider 不许自带微信目标/直接发送逻辑。

### 5.3 配置、状态和安全

- v1 `qwen-local` 迁移保留当前已存 provider/model/voice/baseUrl 值，但不会把个人 `whale-v1` 当全用户默认。
- 云端/自定义 legacy 配置无法安全推断时要求用户显式重新选择，不能猜成 Qwen。
- API Key、Token、Password 不作为明文字段进入公共配置；只允许受支持的 `credentialRef`。
- Provider 不支持的音色、语言、情绪或流式请求必须拒绝或按**现有显式契约**返回错误，不静默“成功”。
- `UNKNOWN` 不被映射为健康、已生效或可用；`SAVED` 不是 `APPLIED`，任何可能已外部发送的请求 `UNKNOWN` 不自动重发。

## 6. 唯一执行路线（不要重做产品设计）

1. 获取最新 GitHub PR #16 的 HEAD/base/状态；确认仍是设计分支而非已合并 main。若 HEAD 变化，先检查最新 Diff，不能基于本文件 SHA 直接改。
2. 对照第 5 节逐项查阅真实导出与用例；建立每条契约的 PASS/FAIL/UNKNOWN 证据表。
3. 若均已实现：**不改文件，直接进行第 7 节测试并交付最终审查报告**。
4. 若某项失败：只修复被证实的具体项，优先最小修改与已有纯测试；不得扩大到生产 Adapter 或前端。
5. 运行测试、文档编码/链接与秘密扫描；确认新的 `client.js` 构建产物没有未经授权的生产前端变化。
6. 如有真实改动，正常 Push 到**同一个 PR #16**，等待新 HEAD 的 CI；若没有改动，不要造空 Commit 或额外 PR。
7. 更新 PR #16 技术报告中的测试计数与限制；输出交接报告，停止。**不自动合并或进入 TTS-B。**

## 7. 必须运行和判定的测试

| 编号 | 输入/场景 | 期望 |
|---|---|---|
| T01 | 查询 10 个 TTS 候选 | 10 个 ID 全存在、均不可选择/未实现、无默认引擎 |
| T02 | 查询 SVC Registry | `seed-vc` / `rvc` 可见但未实现，TTS Registry 不包含它们 |
| T03 | 选择研究候选 | 明确 NOT_IMPLEMENTED/拒绝，不启动网络或进程 |
| T04 | 将 `qwen-local` v1 配置迁移到 v2 | 保留已存信息，不产生公版默认或丢个人音色 |
| T05 | cloud/custom 旧值与缺少凭据 | 不猜 Qwen、不暴露 Key、需用户重新选择 |
| T06 | 使用不兼容 voiceId、语言、情绪或流式参数 | 返回现有契约规定的拒绝状态，不产生音频 |
| T07 | Fake Provider 断连/超时/Qwen 离线 | 不让无关 Provider 健康状态联动失败，不伪造 AVAILABLE |
| T08 | 尝试在合成/SVC 请求中附加微信目标或发送字段 | 拒绝/无发送副作用 |
| T09 | 向 SVC 请求提供普通纯文本替代音频 | 按 SVC Schema 失败关闭，不变成 TTS |
| T10 | 输出/日志/PR Diff 扫描 | 无真实 Token、私人目标、音频、模型或生产路径 |

**执行命令（本仓库 Windows 基线）：**

```powershell
node build.mjs
node --test
npm.cmd run test:ui
git diff --check
```

文档链接与 UTF-8 完整性按现有项目规则检查；报告真实 PASS/FAIL/SKIP，不把历史 `191/192` 当成新运行结果。**CI 必须是最新 PR HEAD 的 build + ui SUCCESS，旧 run 不算。**

## 8. 封闭异常决策与停止边界

| 情况 | 本轮唯一处理 |
|---|---|
| 某目标在当前 PR 已经实现 | 记录 PASS；不重复修改 |
| 源码实际导出名与报告不同 | 以现有源码为准，检查等价语义；不为适配报告而重命名稳定 API |
| 当前 PR 新版本引入额外 Provider | 复核其仍未实现且不可选择；若存在默认选择/生产调用，列安全缺陷并停止合并建议 |
| 找不到所称文件 | 输出具体缺失路径和 HEAD；不自己发明一个相似实现或另起 PR |
| 发现真实外部网络调用、生产文件写入或微信发送路径 | 标记 BLOCKED，保留证据，停止该操作 |
| 单个测试失败但修复需要删除权限校验 | 不删除安全校验，报告 BLOCKED |
| 需要修改 `docs/plans` 或调整任务顺序 | 仅把差异写入报告交给 ChatGPT，DeepSeek 不负责计划管理 |

## 9. DoD（完成后 ChatGPT 才可标 DONE）

- [ ] TTS 与 SVC 候选清单、不可选择、无默认状态在最新 HEAD 均被测试验证。
- [ ] 三层 Whale Voice / Whale Relay / WeChatAgent 职责无矛盾，且没有将 Relay/Hook 冒充已实现。
- [ ] Provider 合同与 v2 迁移保留现有安全/兼容语义。
- [ ] 新旧自动化测试、文档、秘密扫描和最新 HEAD CI 全部符合本阶段标准。
- [ ] PR #16 的 Diff 未引入真实 Provider、付费网络、生产 Host 写路径、用户真实音频或微信发送。
- [ ] 明确记录仍未完成的 TTS-B GUI/检测中立化、真实音色/Provider 接入、载入版本确认等未来事项。
- [ ] 阶段等级保持 `DESIGN / OFFLINE`；**不自动合并 PR、不修改 main、不进入 TTS-B**。

## 10. DeepSeek 最终报告必须按此格式

1. 当前 PR #16 head/base/state/CI run（最新）。
2. 第 7 节 T01–T10 与第 9 节 DoD：逐条 PASS / FAIL / BLOCKED 和证据路径。
3. 若修改代码：精确文件、修复原因、新 Commit；若无需修改：明确“无变更，不造空 Commit”。
4. Node/UI/build/文档/Secret 的实际计数、跳过和差异说明。
5. 生产环境是否触及（配置/WeChatAgent/Relay/Sender/Qwen/微信/付费 API）。
6. 剩余风险与 TTS-B 待办；不得宣称真实 Provider 已集成。
7. 完成后停止，等待 ChatGPT 复核标记和用户对 PR 合并的单独决定。
