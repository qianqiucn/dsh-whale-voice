# Qwen3-TTS 本地 Provider（Plan10 10-A，离线候选）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本文件描述的是一套**未接真实模型**的本地
Provider 候选：固定上游元数据、官方 SDK 惰性 worker、Provider 中立能力映射、窄 worker 协议、
受控进程管理与 Fake 端到端验收。它不代表本机已安装 Qwen、已加载权重、已授权私人音色，也不代表
已完成 Host、主 Task 或真实 Artifact 交接。

## 1. 固定上游与静态盘点

| 项 | 值 |
|---|---|
| 上游代码 | `QwenLM/Qwen3-TTS` @ `022e286b98fbec7e1e916cb940cdf532cd9f488e` |
| Python 包 | `qwen-tts` `0.1.1`（`requires-python >=3.9`；本批只记录元数据，不安装） |
| Base 模型 | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` @ `fd4b254389122332181a7c3db7f27e918eec64e3` |
| 许可 | 上游代码与 Base 模型卡为 Apache-2.0 |
| 许可范围 | **不覆盖**依赖、其他变体、Tokenizer、私人参考音频/音色；这些需要单独确认 |

`core/tts/qwen-contract.mjs` 的 `QWEN_UPSTREAM` / `qwenLicenseView()` /
`qwenMetadataInventory()` 是唯一来源。已审计的发布模型身份只有 README 表中的五个 12 Hz 变体：

| 模型身份 | backend | 说明 |
|---|---|---|
| `Qwen3-TTS-12Hz-1.7B-Base` | `base-clone` | Base 克隆（需可信参考绑定） |
| `Qwen3-TTS-12Hz-0.6B-Base` | `base-clone` | Base 克隆（0.6B） |
| `Qwen3-TTS-12Hz-1.7B-CustomVoice` | `custom-voice` | 预设音色 + 指令控制 |
| `Qwen3-TTS-12Hz-0.6B-CustomVoice` | `custom-voice` | 预设音色；上游 0.6B 不支持 instruct |
| `Qwen3-TTS-12Hz-1.7B-VoiceDesign` | `voice-design` | 10-A 仅声明，不暴露公共请求 |

25 Hz 变体只出现在上游评测表，不在发布模型表内，因此**不**被当作已审计身份。模型身份必须同时
匹配 backend 与本地 `config.json` 的 `tts_model_type`/`tts_model_size`，仅名称前缀相同不算通过。

静态依赖盘点来自固定 `pyproject.toml`：`transformers==4.57.3`、`accelerate==1.12.0`、
`gradio`、`librosa`、`torchaudio`、`soundfile`、`sox`、`onnxruntime`、`einops`。上游未逐项声明
许可，故全部为 **UNKNOWN**；Tokenizer 身份/版本只有在真实加载后才能确认，当前也是 **UNKNOWN**。
安装/权重/私人素材权利皆未验证。固定上游的加载链为 `AutoConfig` + `AutoModel.from_pretrained` +
`AutoProcessor.from_pretrained(<本地目录>)`，speech tokenizer 属于模型权重；worker 在导入官方包
之前设置 `HF_HUB_OFFLINE=1`/`TRANSFORMERS_OFFLINE=1` 并安装进程内网络 guard，嵌套加载器一旦尝试
联网即失败关闭。`qwenMetadataInventory().loadingBoundary` 记录该边界。

## 2. 能力矩阵（互不混用）

| backend | 预设音色 | 克隆 | 参考音频 | VoiceDesign | 情绪 | 公共请求 |
|---|---|---|---|---|---|---|
| `custom-voice` | ✓ | ✗ | ✗ | ✗ | ✓（1.7B；0.6B 无 instruct） | ✓ |
| `base-clone` | ✗ | ✓ | ✓ | ✗ | ✗ | 仅内部可信绑定 |
| `voice-design` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗（本批不暴露） |

- 一次请求只能带**一种**模态：预设 `voiceId`、可信克隆绑定或 VoiceDesign 指令；混用直接拒绝
  （`QWEN_MIXED_MODALITY`）。
- 模态还要与**实际 backend** 兼容：Base 模型不接受预设音色请求，CustomVoice 不接受克隆绑定
  （`QWEN_UNSUPPORTED_MODALITY` → `UNSUPPORTED_VOICE`）。
- 克隆请求只传不透明 `bindingRef` token；解析后的实际音色身份必须是已登记绑定，且 resolver
  返回的 `referenceRef` 必须与登记值一致，否则拒绝。结果里的 `voiceId` 是实际登记身份，
  不再统一写成 `clone-bound`。
- VoiceDesign 在 10-A 仅声明、不暴露公共请求通道。

## 3. 官方 worker（新增）

`workers/qwen3_tts_worker.py` 是唯一会调用官方 SDK 的进程入口。它：

- 启动时只读本地 `config.json`、`--binding-index` 与 `importlib.metadata` 包版本，**不 import
  `qwen_tts`、不加载模型**；`hello` / `health` / `discover` 都只回报静态能力。
- 只有真实合成才 `import qwen_tts` 并调用 `Qwen3TTSModel.from_pretrained(...)`，且固定
  `local_files_only=True`、`trust_remote_code=False`；模型目录必须是 `--allowed-root` 内的真实
  子目录，禁止 HF repo id、URL 与隐式下载。
- 官方调用映射：
  - `custom-voice` → `generate_custom_voice(text, language, speaker, instruct)`；`language` 映射
    `zh-CN ↔ Chinese`、`en-US ↔ English`；`emotion` 映射为固定 instruct 文本（neutral 为空）。
  - `base-clone` → `generate_voice_clone(text, language, ref_audio, ref_text, x_vector_only_mode)`；
    `ref_audio` 只能是可信索引中已解析、且在允许根内的本地 WAV；无 `ref_text` 时使用
    `x_vector_only_mode=True`。
  - `voice-design` 不暴露；其余 modality 直接拒绝。
- 克隆参考音频只从 `--binding-index` 的 `token → {file, text}` 解析，文件必须是允许根内、总预算
  32 MiB 内的普通文件且单个 ≤20 MiB；启动时记录 SHA256。协议里永远不会出现路径、URL、base64
  或命令。**实际生成时** worker 通过已打开并复核的 fd 读取全部字节，重新核对 size/SHA256，再把
  这批**已审计字节**以 `data:audio/wav;base64,...` 交给官方 `generate_voice_clone`，因此 SDK
  消费的是被验证的内容，而不是可能在检查后被替换的路径。
- **实际使用边界重新审计**：启动时缓存模型目录/`config.json` 摘要与参考文件的 dev/ino/size/
  SHA256；每次合成在 SDK 调用前重新检查允许根归属、存在性、普通文件、大小、身份与内容；模型
  目录下的**实际子资源树**（config、processor/tokenizer、speech tokenizer 等）逐项 realpath
  检查，任何 junction/symlink 指向允许根外都拒绝。模型/配置/参考被替换、删除、改成越界链接、
  内容或大小变化时，在 `from_pretrained`/`generate_*` 之前以 `QWEN_RESOURCE_CHANGED` 拒绝；
  参考文件在整个生成期间保持打开的 fd，SDK 使用已读取的审计字节。配置与子资源树在**加载完成后**
  再次审计，加载期间发生的变化会在生成前拒绝。
- **网络 guard**：导入官方包前设置离线环境变量并替换 `socket.socket.connect`、
  `socket.create_connection`、`urllib.request.urlopen`；嵌套 `AutoConfig`/`AutoModel`/
  `AutoProcessor` 的缺失回退若尝试联网会得到 `QWEN_NETWORK_BLOCKED`，不会静默下载。
- **直接依赖健康**：启动时用 `importlib.util.find_spec` 检查 worker 直接导入的 `qwen_tts` 与
  `soundfile`（不 import 重型包）；缺任一或版本不符即 `hello` 失败关闭，后续不会加载模型。
  运行期导入失败会记录为该依赖已知失效，随后 `health` 返回 `degraded` 与
  `dependencies.soundfile=false`；依赖恢复后 `health` 通过重新 `find_spec` 明确恢复为 `ok`。
- 同一时间只允许一个合成；`cancel` 立即回 ack 并置取消标记，但**ack 不等于实际停止**；如果取消
  在加载开始前到达，worker 在 50 ms 预检窗口内直接返回 `cancelled` 而不加载；加载中取消则在加载
  结束后、`generate_*` 之前返回 `cancelled`。正在运行的生成结束后才会发终止结果，迟到结果不会
  被晋升为成功。
- 输出先写自身临时目录的 WAV，再读回 base64；超过 1 MiB 或格式/时长不符则失败。worker 不写
  资产库、不创建 Task、不发起网络、不打印敏感内容；错误只回固定码与短消息。
- 缺少包/版本不符/配置矛盾/资源越界都会在 `hello` 阶段失败关闭，不会先启动模型再报错。

## 4. Worker 协议（内部、版本化）

NDJSON over stdio，`v:1`；请求 `hello/health/discover/synthesize/cancel/shutdown`，响应
`ready/result/error/event`。

- 信封只允许 `v/id/type/payload`；payload 逐类型白名单；未知字段、路径/URL/命令/环境/密钥键
  一律拒绝；单行 ≤2 MiB。
- **有界解析**：原始文本先做结构扫描（最大深度 24），解析后再做迭代式节点/数组/深度预算
  （4096 节点、256 元素数组），超限返回 `QWEN_PROTOCOL_TOO_DEEP`/`TOO_COMPLEX`，不递归、不抛
  出到宿主。
- `result` 的终态 `state` 只能是 `ok` / `cancelled` / `unknown`；非 `ok` 不允许携带音频字节；
  health/discover 允许无 `state` 的静态结果。
- `error` 的 `code` 必须是 `QWEN_*` 形态；未知码按安全失败处理。
- 响应类型必须匹配当前操作：`hello` 只接受 `ready`，`synthesize/health/discover` 只接受
  `result`，`cancel` 接受 `event|result`；类型不符计为协议错误而不是成功。
- `decodeResponse` 支持 `expect` 白名单；supervisor 的每次请求都带期望类型。

## 5. 受控进程管理

`core/tts/qwen-supervisor.mjs`：

- 只在显式配置（`worker.command` + `allowedRoot`，可选 `runtime`）下启动；**无默认命令、无隐式
  启动**。`command` 必须位于允许根内（真实路径校验）；`runtime` 必须是既有绝对路径；
  `shell:false`，只给 `WV_QWEN_PROTOCOL`/`WV_QWEN_TMP`，不继承主机环境。
- **代际所有权**：每次 start 生成一个 generation，stdout/stderr、pending、操作表、临时目录、
  退出句柄都属于该代；旧代事件（包括迟到 stdout 与 `error`）不能触碰新代。
- **操作关联**：每个合成记录 requestId、已签发 messageId、操作状态（ACTIVE/UNRESOLVED）、代际
  和请求身份（model/backend/voiceId）。只有**完整终态**才能释放：`state` ∈ `ok/cancelled/unknown`
  且 requestId/model/backend/voiceId 与发送时完全一致。通用 result（如 `loaded:true`）、缺/null
  requestId、错身份都不算终态，会标记 UNRESOLVED 并阻止后续合成。没有 pending 的迟到 result 同样
  必须通过完整终态门禁才释放；无效迟到消息既不释放，也不删除等待可信终态所需的 messageOwner
  关联。type mismatch 的 pending 结算为 UNKNOWN 并保留未决占用。
- `error` 事件**不等于退出**：句柄、pending 与临时目录继续归旧代所有，只有真实 `exit`/`close`
  才结算。
- `stop()` 同步标记 `stopRequested` 并关闭准入；握手完成时若同代 stop 意图已存在，start 不会
  重新 `accepting=true`，返回 `QWEN_STOPPING`。**启动失败收尾绑定原代**：第一代 hello 失败时只
  清理/停止第一代，不会对已建立的新代调用全局 stop。`shutdown` → 宽限期 → 仅杀自己的 PID；
  **只有确认退出才释放**。未确认退出返回 `QWEN_EXIT_UNCONFIRMED` 并保留句柄，后续合成继续
  被 `QWEN_STOPPING` 拒绝。
- 临时目录清理失败不吞掉：进入 `retainedTempDirs`，`tempDirActive` 保持 true，`stop()` 返回
  `QWEN_CLEANUP_INCOMPLETE`；后续 start/stop 会重试清理，不以新 start 覆盖旧归属。
- 只管理自己启动的子进程；退出/崩溃后不重启、不重试；stdout 有界（4 MiB）与 stderr 有界
  （8 KiB）；协议垃圾/深嵌套/超限只计数并终止本代，不执行未知内容。
- 请求期限：显式非法（0/负数/非整数/超上限）失败关闭；省略/非法时使用有限默认 120000 ms，
  `state().lastRequestTimeoutMs` 可观察。
- 超时：请求超时 → 取消请求 → 返回 `UNKNOWN`（`unknown:true`），调用方不得视为失败后重发；
  未获得终止答复的合成会占用 `unresolvedOperations`，阻止后续重叠合成。

## 6. 健康、发现与输出校验

- `classifyQwenHealth`：`provider` 必须**精确等于** `qwen-tts`；`workerProtocol` 必须为 1；
  backend 必须合法且与已审计模型身份一致；包版本必须是已审计的 `0.1.1`；CustomVoice 的
  `instructSupported` 必须与模型大小一致；健康查询非 ok 或模型/后端矛盾 → degraded/不可用。
- `normalizeQwenDiscovery`：`models`/`languages`/`limits` 必须显式非空且合法，不再用
  `zh-CN` 或 200 字默认值补洞；worker 声明更小的限额（如 `maxChars=1`）会按更小值生效。
  预设/克隆分离；克隆必须有可信登记绑定；预设后端无音色 → 不可用。
- **能力交集是绑定约束**：某 voice 明确声明的语言与全局语言没有交集时跳过该 voice（不把空交集
  解释成“全局可用”）；全部无交集则不可用。产物时长按 manifest 的 `maxAudioSeconds` 校验，
  执行期限取 `min(provider 配置, manifest.timeoutMs)`；worker 公布的更小上限不会被扩大。
- `validateQwenOutput`：先核对 in-flight 身份（`requestId`/`model`/`backend`/`voiceId` 四项全等），
  再 base64 严格解码 → 字节上限 → 复用 `core/audio/wav-byte-inspector.mjs` 校验
  WAV/PCM16/采样率/声道/时长/峰值/hash → 与 worker 声明格式逐项比对 → 生成 Provider 中立结果。
  一把有效 WAV 只证明格式，不能替代请求/模型/音色关联；四项分别错或一起错都会被拒绝
  （`QWEN_OUTPUT_IDENTITY_MISMATCH`）。结果 `artifactRef` 是内存字节的哈希
  （`qwen-bytes:<sha256 前 32>`），`persisted:false`，`delivery.state='PENDING_ROUTER'`；
  **不写资产库、不伪装 FIXTURE_IMPORT、不创建 Task**。

## 7. 请求门禁、终态与 Task 关联

- 公共请求门禁直接作用于**调用者请求**：未知字段、`format`、`streaming`、voice、language、
  emotion 都复用既有 `checkSynthesisRequest`，不再静默重建并丢弃字段。外部 `requestId` 会被内部
  请求 ID 替换，但不会被当作未知字段放行。
- 终态保留真实语义：worker 明确 error `QWEN_UNKNOWN_RESULT` → `unknown:true`；`result.state` 为
  `unknown` → UNKNOWN；为 `cancelled` → `cancelled:true, unknown:false`。已知未知不会被包装成
  确定失败，也不会自动重试。
- 取消事实分四层：请求、可信 ack、实际停止、最终结果。`beginSynthesis()` 返回
  `{requestId, cancel, result}` 句柄；只有 ack 的 `requestId` 与请求一致且 `state='cancelled'` 时，
  原请求才结算为 `CANCELLED`（`cancelConfirmed:true, stopped:false`）。取消被拒绝、ack 超时、
  身份不符或只收到 progress 事件时返回 `QWEN_CANCEL_NOT_CONFIRMED`，原请求不被改成确定取消；
  ack 不等于实际停止，操作保持 `UNRESOLVED` 直到收到正确关联的终止结果或确认退出。迟到 success
  只计 `lateResponses`，不晋升成功；正确关联的 UNKNOWN 终止可释放占用，但“结果未知”与“执行已
  结束”仍是两个判断。从未签发的 messageId、cancel messageId 或无关 claimed id 不能清除占用。
  若 worker 的 `cancelled` 终止结果先于 ack 到达，仍按 CANCELLED 结算并释放占用；只有 ack 确认
  之后到达的成功才被视为迟到并丢弃。
- Task 关联：`provider.synthesize(request, { taskId })` 要求调用方传入既有权威签发的 `taskId`，
  只把它回显在结果里；可选择传入 `taskAuthority(taskId)` 复核既有权威状态（CREATED/PROCESSING），
  未确认则拒绝。Provider 不创建/分配 Task，不写目录，不触碰 owner/catalog。Fake 证据使用
  `core/audio/task-catalog.mjs` 在临时 sandbox 签发真实 `task:fixture-…`，贯穿 worker 调用与结果，
  并确认 catalog 仍只有一条记录。

## 8. Fake 与测试

- `test-fixtures/fake-qwen-worker.mjs`：自有 Fake 子进程，走**同一条** supervisor/协议路径；
  不加载模型、不联网、不写文件，按 argv 选择成功/错误/崩溃/超时/迟到/取消/坏字节/坏格式/超大/
  无音色/版本不符/无关服务/未审计模型/错误协议版本/空 models/空 languages/无 limits/极小限额/
  深嵌套/事件冒结果/输出身份篡改/幽灵消息/取消拒绝/进度 ack/错误 ack 身份/迟到进度/
  语言冲突/音频时限/小 timeout 等模式。
- `test-fixtures/fake-qwen-sdk/`：**测试专用** Fake `qwen_tts` + `soundfile`，通过官方 worker 的
  显式 `--runtime-dir` 注入；记录 `from_pretrained`/`generate_custom_voice`/`generate_voice_clone`
  调用、离线环境变量、嵌套 `AutoConfig`/`AutoModel`/`AutoProcessor` 调用以及被 guard 拒绝的网络
  尝试，用于证明“静态阶段不加载、合成才加载”、官方参数映射和嵌套加载器不回退联网。它不包含
  任何 torch/权重/真实网络。
- `test/qwen-provider.test.mjs`（25 项）：能力矩阵/元数据盘点、模态互斥、协议有界解析与信封/
  类型检查、健康身份与能力交集、发现缺省拒绝、无隐式启动、权威 Task 签发贯穿、请求门禁、
  字节/格式/限额、clone 实际身份、输出四项身份、UNKNOWN/CANCELLED 终态、超时/重入占用、迟到不
  晋升、取消句柄、期限约束、深嵌套隔离、未确认停止、error≠exit 代际、关闭中拒绝新工作、清理失败
  可重试。
- `test/qwen-official-worker.test.mjs`（17 项，Python 3 可用时执行）：CustomVoice 官方映射与
  嵌套加载/离线 guard、Base 克隆本地引用映射（SDK 收到 data-uri 字节与 SHA256）、缺包/配置矛盾/
  资源越界失败关闭、取消 ack 与迟到结果、模型配置变更/参考超限/参考消失/junction 越界/模型目录
  junction 越界、同尺寸参考原地改写、加载中参考变化仍使用已审计字节、加载中配置变化拒绝、
  speech-tokenizer 子资源越界、运行期 `soundfile` 失效与 health 恢复、缺 `soundfile` 直接依赖、
  加载前与加载中取消。
- `test/qwen-095-repair.test.mjs`（15 项）：语音语言空交集、产物时长上限、小 timeout 生效、
  取消拒绝/超时/错身份/progress、幽灵 messageId、错误身份/类型占用、正确关联 UNKNOWN 释放、
  错误 claimed 迟到、迟到 progress、启停竞态、通用/缺/null requestId/错身份不完整终态、
  非终态迟到不破坏恢复关联、旧代启动失败不停止新代。
- 若执行环境禁止子进程管道（EPERM）、目录链接或没有 Python 3，对应测试按平台跳过并在报告中注明；
  不得用内存 mock 替代进程生命周期证据。
- 本轮 Qwen 专项 **58/58**；全量 **956/952 pass/4 platform skips/0 fail**；UI 63/63；build 后
  `client.js` 无 diff。

## 9. 明确未完成（Plan10 集成 OPEN）

- 真实 Qwen 权重/依赖安装、真实推理、真实音频质量、中文短/长句、CPU/GPU 资源与失败恢复的真实验证。
- 真实 DSH Host 装载、主 Task 执行、真实 Artifact 交接与保存；本批不冒充已打通用户生成链。
- VoiceDesign 公共通道、克隆参考素材的真实解析与权利确认。
- 真实取消能否中断模型推理、真实进程内存释放与 GPU 回收仍未验证。
- 云端 Provider、IndexTTS（10-B）、轻量候选（10-C）不在本批。
- 不安装、不下载、不启动/重启现有服务、不读取私人素材、不真实发送。
