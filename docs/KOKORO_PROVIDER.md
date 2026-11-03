# Kokoro-82M 本地 Provider（Plan10 10-C，离线候选）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本文件描述的是一套**未接真实模型**的
Kokoro-82M Provider 候选：固定上游/许可元数据、官方 SDK 惰性 worker、预设音色/语言能力映射、
窄 worker 协议、受控进程管理、快照资源边界与 Fake 端到端验收。它不代表本机已安装 Kokoro、
已加载权重、已取得音色/G2P 资源或真实 CPU 音质，也不代表已完成 Host、主 Task 或真实 Artifact
交接。

## 1. 固定上游与许可

| 项 | 值 |
|---|---|
| 上游代码 | `hexgrad/kokoro` @ `dfb907a02bba8152ca444717ca5d78747ccb4bec` |
| Python 包 | `kokoro` `0.9.4`（本批只记录元数据，不安装） |
| 模型 | `hexgrad/Kokoro-82M` @ `f3ff3571791e39611d31c381e3a41a3af07b4987`，v1.0 |
| 输出 | 24 kHz 波形；CPU 路径（`device="cpu"`） |
| 许可 | 上游代码与 Kokoro-82M 模型标 **Apache-2.0**；依赖、音色 tensor、Misaki/espeak G2P 与字典**不推定同一许可**，保持 UNKNOWN |
| 未确认 | 逐依赖许可、voice tensor 许可、G2P/字典许可、本地安装/权重/音色可用性、真实 CPU 性能/音质 |

`core/tts/kokoro-contract.mjs` 的 `KOKORO_UPSTREAM`/`kokoroLicenseView()`/
`kokoroMetadataInventory()` 是唯一来源；`license` 明确 `dependenciesCovered:false`、
`voicesCovered:false`、`g2pCovered:false`。

## 2. 能力矩阵（仅预设音色）

| 项 | 支持 | 说明 |
|---|---|---|
| 预设音色 | ✓ | 必须来自 Core 可信本地 voice index；一次请求一个 voiceId |
| 克隆 | ✗ | 不暴露 Kokoro clone，拒绝 clone binding |
| VoiceDesign | ✗ | 不暴露 |
| 情绪 | ✗ | 无情绪控制；公共请求只接受 neutral |
| 语言 | 9 语言码 | `en-US(a)/en-GB(b)/es-ES(e)/fr-FR(f)/hi-IN(h)/it-IT(i)/pt-BR(p)/ja-JP(j)/zh-CN(z)`；实际能力取 voice index 交集 |
| 流式 | ✗ | 一次性输出 |
| 输出 | 24 kHz 单声道 PCM16 | 不是 Qwen 24k/Index 22.05k 的参数照抄 |

官方 `KPipeline` 每个语言一个实例；Kokoro 的 G2P 对 `j`/`z` 需要 Misaki 额外包，其他语言
使用 espeak-ng；缺失时 worker 返回 `KOKORO_G2P_UNAVAILABLE`/依赖失败，不偷换语言。

## 3. 官方 worker 与加载边界

`workers/kokoro_worker.py` 是唯一会调用官方 SDK 的进程入口。它：

- 启动只读本地 `config.json`、`kokoro-v1_0.pth`、voice index 与 `importlib.metadata` 包版本，
  **不 import `kokoro`、不加载模型**；`hello`/`health`/`discover` 只回报静态能力。
- 只有真实合成才 `install_network_guard()` 后 import `kokoro.KModel`/`KPipeline`；导入前设置
  `HF_HUB_OFFLINE=1`/`TRANSFORMERS_OFFLINE=1`，进程内替换 socket/urllib，阻断隐式下载。
- 构造前要求 `config.json`（含 `vocab`）、`kokoro-v1_0.pth` 和每个 voice `.pt` 已在允许根内；
  voice index 只允许相对 `.pt` 路径、单个 ≤50 MiB、总 ≤200 MiB，记录 SHA256；不把 voice 名称
  交给 `hf_hub_download`。
- **稳定快照**：模型目录逐字节复制到 `WV_KOKORO_TMP` 下的私有快照（无 hardlink；总预算 8 GiB，
  跨文件共享、写入 chunk 前扣减；超限失败关闭）；voice tensor 在合成前按已审计字节复制为稳定
  私有 `.pt`，SDK 不直接消费可替换源路径。
- 构造 `KModel(config=<snapshot>/config.json, model=<snapshot>/kokoro-v1_0.pth,
  disable_complex=True).to("cpu").eval()`；`KPipeline(lang_code, model=model, device="cpu")`；
  调用 `pipeline(text, voice=<stable .pt>, speed=1.0)`；分块结果按固定 0.15 s 静音合并。
- 输出用标准库 `wave` 校验 24 kHz/单声道/PCM16、≤60 s、≤4 MiB；身份（requestId/model/backend/
  voiceId）不符拒绝；`persisted:false`；不创建 Task/Artifact/投递入口。
- 取消/超时/UNKNOWN、候选缓存收束、快照归属/`snapshotCleanupPending`/shutdown 清理沿用已验
  10-A/10-B 模式；普通取消不无故销毁合法缓存。

## 4. 协议与 supervisor

- `core/tts/kokoro-worker-protocol.mjs`：版本化 NDJSON `v:1`，信封/payload 白名单，路径/URL/
  命令/环境/密钥字段拒绝，2 MiB/depth/node 上限，ready/result/error/event 校验；synthesize
  payload 只允许 requestId/text/model/backend/modality/voiceId/language/format/maxBytes。
- `core/tts/kokoro-supervisor.mjs`：显式命令/允许根/可选绝对 runtime；`shell:false`、最小 env、
  有界 IO、有限期限、不重试；按代所有权、`error`≠exit、确认退出才释放、清理失败可重试、关闭/
  未确认退出后拒绝新工作；完整终态门禁（state+requestId/model/backend/voiceId）与取消事实分离。
- `core/tts/kokoro-adapter.mjs`：精确 `kokoro-local` + `Kokoro-82M-v1.0` + modelVersion 1.0 +
  `kokoro 0.9.4` + protocol 1 交集；预设-only、语言/音色交集、24 kHz 输出校验、UNKNOWN/
  CANCELLED、取消句柄、未决操作阻止重入；`persisted:false`。

## 5. 测试与证据边界

- `test/kokoro-provider.test.mjs`（6 项）：固定元数据/Apache 边界、manifest/能力交集、模态互斥、
  健康/发现/输出身份与格式、协议白名单、provider/supervisor 显式配置失败关闭。
- `test/kokoro-official-worker.test.mjs`（9 项，Python 3 可用时执行）：真实 supervisor/protocol/
  adapter + 注入 Fake `kokoro`：静态启动不加载、预设音色/语言/CPU 映射、24 kHz 输出、分块合并、
  clone/缺失音色拒绝、配置/voice 变更拒绝、加载中取消/重载、超时 UNKNOWN、加载错误/G2P 缺失/
  空音频、停止清理与缺包失败关闭。
- 本轮 Kokoro 专项 **15/15**；全量 **1010/1006 pass/4 platform skips/0 fail**；UI 63/63；
  build 后 `client.js` 无 diff。
- 全部证据使用 Fake SDK/合成 WAV/临时 sandbox；**没有真实 Kokoro 权重、真实 CPU 推理、音质、
  中文/英文实际音频、Host/主 Task/Artifact、微信或音色/G2P 素材权利验证**。
- 平台跳过（Python 不可用、目录链接权限等）在报告中列明；不用内存 mock 代替进程生命周期。

## 6. 明确未完成（Plan10 10-C 集成 OPEN）

- 真实 Kokoro-82M 权重/依赖安装、真实 CPU 推理、24 kHz 音质、中文/英文实际短长句。
- 真实 voice tensor、Misaki/espeak 字典/G2P 资源与许可；缺失语言的真实回退/不可用展示。
- CPU 性能/内存、真实取消能否中断推理、进程/GPU/内存回收。
- 真实 DSH Host 装载、主 Task 执行、真实 Artifact 交接与持久化；本批 `persisted:false`。
- 真实音色/参考素材权利、商用条款；本 Provider 不使用私人参考音频。

## 7. 复验命令

```powershell
cd E:\DSH\workspace\whale-voice
python -m py_compile workers/kokoro_worker.py
node --test test/kokoro-provider.test.mjs test/kokoro-official-worker.test.mjs
node --test
node build.mjs
git diff --exit-code -- client.js
```
