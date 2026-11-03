# IndexTTS-2.5 本地 Provider（Plan10 10-B，离线候选）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本文件描述的是一套**未接真实模型**的
IndexTTS-2.5 Provider 候选：固定上游/许可元数据、官方 SDK 惰性 worker、克隆＋情绪能力映射、
窄 worker 协议、受控进程管理、快照资源边界与 Fake 端到端验收。它不代表本机已安装 IndexTTS、
已加载权重、已取得参考音频/声音权利，也不代表已完成 Host、主 Task 或真实 Artifact 交接。

## 1. 固定上游与许可

| 项 | 值 |
|---|---|
| 上游代码 | `index-tts/index-tts` @ `d9e41aac89fd00b3d71497fddb287b7f24613712` |
| Python 包 | `indextts` `2.0.0`（`requires-python >=3.10,<3.12`；本批只记录元数据，不安装） |
| 目标模型 | `IndexTeam/IndexTTS-2.5` @ `c39ce5ba981572cb187443877ff559dfb246ce63` |
| 模型接口 | `indextts.infer_v2_5.IndexTTS2`；包版本仍是 `2.0.0`，不能只凭包版本认定 2.5 接口 |
| 输出 | 22.05 kHz 单声道波形；模型卡要求 NVIDIA GPU，约 6 GB VRAM |
| 许可 | **bilibili模型使用许可协议**（`LicenseRef-Bilibili-IndexTTS`），**不是 Apache-2.0、不是无限制分发** |
| 商业门槛 | 前一自然月 MAU > 1 亿或上一自然年收入 > 1 亿人民币，需另行申请商业许可 |
| 许可范围 | 模型/代码协议不覆盖第三方依赖、私人参考音频/克隆声音权利；中文协议文本为准 |

`core/tts/index-tts-contract.mjs` 的 `INDEX_TTS_UPSTREAM` / `indexLicenseView()` /
`indexMetadataInventory()` 是唯一来源。`indexLicenseView()` 明确 `apache2:false`、
`unrestrictedRedistribution:false` 与商业门槛；`indexMetadataInventory()` 把安装、权重、
Tokenizer 版本、依赖许可、私人素材权利都标为 **UNKNOWN**，不替用户确认实际使用/商用条款。

固定 `pyproject.toml` 的依赖（`torch==2.8.*`、`torchaudio==2.8.*`、`transformers==4.52.1`、
`modelscope==1.27.0`、`librosa==0.10.2.post1`、`numpy==2.2.6` 等）只做静态枚举，全部
`licenseStatus: UNKNOWN`。模型卡说明辅助模型（w2v-bert-2.0、MaskGCT semantic codec、CAMPPlus、
BigVGAN）不在仓库内、首次运行会下载到 `checkpoints/hf_cache/`；本批**不下载**，worker 要求这些
资源已存在于本地模型树，缺失即失败关闭。

模型 `config.yaml` 的 `version` 为 `2.5`，`s2mel.preprocess_params.sr` 为 `22050`；worker 在
静态启动时读取并核对 `version: 2.5`，不把包版本/文件名当作模型身份。

## 2. 能力矩阵（克隆＋情绪）

| 项 | 支持 | 说明 |
|---|---|---|
| 零样本克隆 | ✓ | 必须来自 Core 的可信克隆绑定；一次请求只能一种模态 |
| 预设音色 | ✗ | 不暴露，混用直接拒绝 |
| VoiceDesign | ✗ | 不暴露 |
| 情绪 8 维向量 | ✓ | 顺序 `[happy, angry, sad, afraid, disgusted, melancholic, surprised, calm]` |
| 情绪参考音频 | ✓ | 可信 `emotionBindingRef`，不能与向量/文本情绪混用 |
| 文本情绪 | 条件 | 仅当模型树含 `qwen0.6bemo4-merge` 且 `use_qwen_emo=True`；否则不可用 |
| 语言 | 5 | `zh-CN`→`ZH`、`en-US`→`EN`、`ja-JP`→`JA`、`es-ES`→`ES`、`ar-SA`→`AR` |
| 流式 | ✗ | 一次性输出 |
| 语速/时长因子 | ✗（本批不暴露） | 公开请求不携带 `duration_factor`，避免把任意内部参数放进公共合同 |

公开 `emotion` 使用固定字符串模式（neutral/happy/angry/sad/afraid/disgusted/melancholic/
surprised/calm），适配器映射为固定 8 维向量；8 维自定义向量/文本情绪/情绪参考只通过 Core
可信 `context` 传入，不属于公共 TTS 请求字段，也不接受浏览器路径/URL/额外字段。

## 3. 官方 worker 与加载边界

`workers/index_tts_worker.py` 是唯一会调用官方 SDK 的进程入口。它：

- 启动只读 `config.yaml`、绑定索引与 `importlib.metadata` 包版本，**不 import `indextts`、不加载
  模型**；`hello`/`health`/`discover` 都只回报静态能力。
- 只有真实合成才 `install_network_guard()` 后 import `indextts.infer_v2_5.IndexTTS2`；导入前设置
  `HF_HUB_OFFLINE=1`、`TRANSFORMERS_OFFLINE=1`、`MODELSCOPE_OFFLINE=1`，进程内替换
  `socket.socket.connect`/`socket.create_connection`/`urllib.request.urlopen`，阻断嵌套下载。
- 构造前要求主模型/辅助模型/Tokenizer 已在本地模型树；缺失时直接失败关闭，而不是让上游
  `ensure_models_available` 触发下载。
- **稳定快照**：`IndexTTS2` 的 `model_dir`/`cfg_path` 指向 worker 私有快照。所有普通文件逐字节
  复制并记录 SHA256，不使用 hardlink；总复制预算 8 GiB，剩余额度跨文件共享、在每次写入 1 MiB
  chunk 前扣减，超限失败关闭。快照位于 `WV_INDEX_TTS_TMP` 内（supervisor 负责清理），创建即
  登记、`shutdown`/EOF 清理，删除失败保留 `snapshotCleanupPending` 并重试，宿主临时目录兜底。
- 参考音频只从 `--binding-index` 的 token→`{file,text?}` 解析；文件必须允许根内、普通、单个
  ≤20 MiB、总 ≤64 MiB，启动记录 dev/ino/size/mtime/SHA256；实际合成时把**已审计字节**复制为
  私有稳定 WAV 文件再交给 `infer`，不把源路径直接给 SDK。
- 构造：`IndexTTS2(cfg_path=<snapshot>/config.yaml, model_dir=<snapshot>, use_bf16=False,
  use_cuda_kernel=False, use_qwen_emo=<bool>)`。不传 GPU/编译/DeepSpeed 选项，不由本批声明
  真实 GPU 行为。
- 调用映射：`infer(spk_audio_prompt=<稳定参考>, text, lang=<ZH/EN/JA/ES/AR>, output_path=<tmp>,
  emo_vector=<8维或None>, emo_alpha, emo_audio_prompt=<稳定情绪参考或None>, use_emo_text,
  emo_text, verbose=False, text_normalization=True)`；中性/无情绪不传向量。
- 输出用标准库 `wave` 校验：WAV/PCM16、22050 Hz、单声道、≤60 s、≤4 MiB；不照抄 Qwen 的
  24 kHz/1 MiB 参数。身份（requestId/model/backend/voiceId）不符即拒绝，不按当前请求重贴标签。
- 同一时间一个合成；取消在加载前/加载中/生成中分别处理；未完成/审计失败/加载中取消不提交候选
  缓存，下一次请求重新加载；已验收合法缓存不被普通取消销毁。

## 4. 协议与 supervisor

- `core/tts/index-tts-worker-protocol.mjs`：版本化 NDJSON `v:1`，信封/payload 白名单，路径/URL/
  命令/环境/密钥字段拒绝，2 MiB 上限，有界深度/节点解析，响应类型匹配；synthesize payload 只允许
  requestId/text/model/backend/modality/bindingRef/voiceId/language/emotion/emotionVector/
  emotionAlpha/emotionRef/emotionText/useEmotionText/format/maxBytes。
- `core/tts/index-tts-supervisor.mjs`：显式命令/允许根/可选绝对 runtime；`shell:false`、最小 env、
  有界 IO、有限期限、不重试；按代所有权、`error`≠exit、确认退出才释放、清理失败可重试、关闭/
  未确认退出后拒绝新合成；完整终态门禁（state + requestId/model/backend/voiceId）与取消事实分离。
- `core/tts/index-tts-adapter.mjs`：精确 `index-tts-local` + `IndexTTS-2.5` + `2.5` 模型版本 +
  `indextts 2.0.0` + protocol 1 交集；公共请求门禁、克隆绑定解析、能力交集、22.05 kHz 输出校验、
  UNKNOWN/CANCELLED、取消句柄、未决操作阻止重叠合成；`persisted:false`，不创建 Task/Artifact。

## 5. 测试与证据边界

- `test/index-tts-contract.test.mjs`（7 项）：固定元数据/非 Apache 许可、能力矩阵、manifest 校验与拒绝、
  模态互斥、协议白名单/深度/超限/类型/身份。
- `test/index-tts-provider.test.mjs`（5 项）：健康身份分类、可信绑定/语言交集发现、输出身份/格式/
  时长/字节上限、显式配置失败关闭、Task 权威门禁。
- `test/index-tts-official-worker.test.mjs`（17 项，Python 3 可用时执行）：注入本地 Fake `indextts` 包，
  经真实 supervisor/protocol/adapter 验证：静态启动不加载、克隆/情绪映射、情绪参考音频、文本情绪
  缺失拒绝、预设/混用/未登记拒绝、配置变更拒绝、大文件复制快照、累计预算、加载中取消/重载、超时
  UNKNOWN、未决占用阻止重入、崩溃、跨代重启、停止清理、加载错误/错误采样率、缺包失败关闭。
- 本轮 Index 专项 **29/29**；全量 **995/991 pass/4 platform skips/0 fail**；UI 63/63；build 后
  `client.js` 无 diff。
- 全部证据使用 Fake SDK/合成 WAV/临时 sandbox；**没有真实 IndexTTS 权重、真实推理、GPU、音质、
  中文短长句、Host/主 Task/Artifact、真实微信发送或素材权利验证**。
- 平台跳过（Python 不可用、目录链接权限等）在报告中单独列出，不用内存 mock 代替进程生命周期。

## 6. 明确未完成（Plan10 10-B 集成 OPEN）

- 真实 IndexTTS-2.5 权重/依赖安装、真实推理、22.05 kHz 音质、中文/英文/日文/西文/阿语短长句。
- 真实 NVIDIA GPU、约 6 GB VRAM、CPU 回退、显存回收、真实取消能否中断推理。
- `qwen0.6bemo4-merge` 真实资源、文本情绪、情绪参考音频与 8 维向量的真实效果。
- 真实参考音频/克隆声音的授权、同意与商用条款；bilibili 协议的 MAU/收入门槛需用户自行确认。
- 真实 DSH Host 装载、主 Task 执行、真实 Artifact 交接与持久化；本批 `persisted:false`。
- 模型卡/上游辅助模型的下载、`hf_cache`/Tokenizer 真实布局与许可仍未验证。

## 7. 复验命令

```powershell
cd E:\DSH\workspace\whale-voice
python -m py_compile workers/index_tts_worker.py
node --test test/index-tts-contract.test.mjs test/index-tts-official-worker.test.mjs
node --test
node build.mjs
git diff --exit-code -- client.js
```
