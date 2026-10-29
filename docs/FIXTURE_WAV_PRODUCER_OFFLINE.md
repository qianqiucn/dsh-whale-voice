# Fixture PCM16 测试信号产出（Plan 08-E-C / OFFLINE）

本文件说明 `core/audio/fixture-wav-producer.mjs` 的**离线**契约。它是 08-E-A 字节检验与 08-E-B
隔离资产库之间最小必要的前置：由纯函数实际构造有界 PCM16 测试信号，再由原 08-E-A 检验同一份
最终 bytes，最后在测试中走真实 08-E-B 导入/读回/逻辑删除。

**这不是 TTS/RVC 推理，不是人物音色或翻唱结果，不产生 Task/Artifact 身份，也不代表保存、发送
或真实用户可用。** `origin: 'SYNTHETIC_FIXTURE'` 只表示“人工测试信号类别”，不是不可伪造的
capability、来源证明、权利或 ownership；把该输出包当作 Task SAVED 或旧 RVC Fake 生成证明都是错的。

## 1. 公开面

恰四个导出，无顶层副作用（不读文件/网络/时钟/随机/模型/设备，不建目录，不缓存跨调用状态）：

```text
FIXTURE_WAV_PRODUCER_SCHEMA_VERSION = 1
FIXTURE_WAV_PRODUCER_LIMITS          深冻结，恰四键
FIXTURE_WAV_PRODUCER_ERRORS          深冻结，恰七码
produceFixtureWav(input)             同步纯函数
```

`FIXTURE_WAV_PRODUCER_LIMITS`：

| 键 | 值 |
|---|---|
| `maxByteLength` | `1048576`（本 producer 独立上限，恰与 08-E-B 单项预算相等，不代表 E-A 的 50 MiB） |
| `sampleRates` | `[16000, 22050, 24000, 32000, 44100, 48000]` |
| `channels` | `[1, 2]` |
| `patterns` | `['SILENCE', 'EDGE_SEQUENCE']` |

## 2. 输入

input 必须是 plain 对象（`Object.prototype` 或 `null` 原型），**恰五个自有可枚举 data 字段**，全部
必填；不允许额外键、`Symbol` 键、隐藏键或 accessor，且**不调用任何 getter**。

| 字段 | 合法值 |
|---|---|
| `schemaVersion` | 正整数且必须为 `1` |
| `sampleRate` | 六个受支持采样率之一（有限整数） |
| `channels` | `1` 或 `2`（有限整数） |
| `frameCount` | 正安全整数（`Number.isSafeInteger`） |
| `pattern` | `'SILENCE'` 或 `'EDGE_SEQUENCE'` |

不接受 bytes/PCM 数组、caller 提供的 metadata/hash/ref/TaskId/scope/rights、路径/URL、回调/
构造函数、seed/任意频率或采样表达式；错误不回显未知键值或输入内容。

### 固定首错顺序

1. 非 plain 根 → `INVALID_INPUT` / `$`；
2. `Symbol` 或未知键 → `INVALID_INPUT` / `<unknown-key>`；
3. 按 `schemaVersion → sampleRate → channels → frameCount → pattern` 逐字段检查缺失/不可枚举/
   accessor → `INVALID_INPUT` / 该字段名（字段数量不另抢首错）；
4. 值检查：`schemaVersion` 类型/正安全整数 → `INVALID_INPUT`，合法整数但非 1 →
   `UNSUPPORTED_VERSION`；`sampleRate`/`channels`/`pattern` 类型 → `INVALID_INPUT`，类型合法但
   不支持 → `UNSUPPORTED_FORMAT`（内部顺序 `sampleRate → channels → pattern`）；
5. `frameCount` 非正安全整数（含 NaN/Infinity/0/负/小数/unsafe）→ `INVALID_PCM` / `frameCount`；
6. 超过预算 → `RESOURCE_LIMIT` / `frameCount`；
7. 依赖检验失败 → `DEPENDENCY_FAILURE` / `$`；
8. 模块自身未知内部异常 → `INTERNAL_FAILURE` / `$`。

## 3. 真实字节构造

只产标准 44 字节头，无 metadata、额外 chunk、pad 或扩展 fmt；全部整数小端：

| 偏移 | 内容 |
|---|---|
| 0 | `RIFF` |
| 4 | `fileSize - 8`（u32 LE） |
| 8 | `WAVE` |
| 12 | `fmt `，16 长度 |
| 20 | PCM formatTag `1`（u16） |
| 22 | channels（u16） |
| 24 | sampleRate（u32） |
| 28 | byteRate = sampleRate × blockAlign（u32） |
| 32 | blockAlign = channels × 2（u16） |
| 34 | bitsPerSample `16`（u16） |
| 36 | `data` |
| 40 | dataByteLength（u32） |
| 44… | PCM16 样本 |

**先预算后分配**：先核 `frameCount <= floor((1048576 - 44) / (channels * 2))`，再乘法、分配与
循环；超限不分配输出、不调用 inspector。mono 最多 **524266** 帧、stereo 最多 **262133** 帧，两者
完整文件都恰 **1048576 bytes**；各多 1 帧固定 `RESOURCE_LIMIT`。`Number.MAX_SAFE_INTEGER` 同样
在分配前被拒绝（不会抛 `RangeError`、不会走 `INTERNAL_FAILURE`）。

两种模式是固定字节定义，不按听感近似：

- `SILENCE`：所有 PCM 样本为 0。
- `EDGE_SEQUENCE`：固定五样本循环 `[-32768, -16384, 0, 16384, 32767]`，按 data 中交错
  `sampleIndex` 从 0 顺序循环，`sampleIndex = frameIndex × channels + channelIndex`；不按声道
  重置、不归一化、不 clip。

无正弦/浮点波形、重采样、解码、外部源、播放或录音。`frameCount` 是权威；`durationMs` 为
`frameCount * 1000 / sampleRate` 的原实测有限数（不 round/ceil）；`peak` 与
`fullScaleSampleCount` 由原 inspector 测量（分母 32768），不代表诊断听感削波。

## 4. 依赖复检

完整 bytes 写完后**实际调用一次**原 `inspectFixtureWavBytes({schemaVersion: 1, bytes})`，不拼装
inspection、不写第二套 WAV parser/hash。输入或预算拒绝时调用 0 次。

返回值先用 descriptor 守卫（不触发 getter）：必须恰为原成功信封 `{ok:true,value}`，value 恰原
19 键 measurement，并核对 `schemaVersion/format/codec/bitsPerSample`、`sampleRate/channels/
frameCount/dataByteLength/byteLength` 与本次构造一致、`durationMs` 为同一公式结果、`peak∈[0,1]`、
`fullScaleSampleCount` 为 `0..frameCount×channels` 的整数、`sha256` 为 64 位小写十六进制、
`validationState='FIXTURE_WAV_CHECKED'`、四个固定布尔值，且 `messageZh` 必须与原 inspector 的
**固定中文消息严格相等**（`演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。`）——仅
“非空字符串”不够，任何其他非空文字（即使其余 18 个字段完全不变）都属于依赖协议失败。任一不符、
抛错、`ok:false`、`null` 或协议缺失，统一 `DEPENDENCY_FAILURE` / `$`，**不返回任何 bytes 或部分
成功**，不重试、不传播原始异常。

## 5. 返回值

成功根恰冻结 `{ok:true, value}`；value 恰九键：

```text
schemaVersion: 1
origin: 'SYNTHETIC_FIXTURE'
bytes: 本次全新 owned Uint8Array
inspection: 原 inspector 的全新 19 键深冻结 measurement
mockOnly: true
realOperationAllowed: false
submitAllowed: false
automaticRetryAllowed: false
messageZh: '已生成演示PCM16测试信号；不是TTS或翻唱结果，也不代表保存或发送。'
```

**非空 `Uint8Array` 不能 `Object.freeze`**：信封、value 与 inspection 冻结，`bytes` 自身保持可写。
每次调用及两次输出之间 `bytes` 与 backing `ArrayBuffer` 独立；输入不变，无跨调用缓存。inspection
描述返回时那一份最终 bytes；调用方之后修改 bytes 不会改旧 inspection，也不会使其成为真实来源
凭证。任何后续保存方必须再次 owned copy 并复检实际 bytes。

本模块不签 `TaskId`/`ArtifactId`/`deliveryId`，不读取或修改 Task；测试导入 08-E-B 后条目
`origin` 仍为 `FIXTURE_IMPORT`、ID 由库自签，两个语义不可混写。

## 6. 错误码

| 码 | reason |
|---|---|
| `FIXTURE_WAV_PRODUCER_INVALID_INPUT` | `invalid fixture input` |
| `FIXTURE_WAV_PRODUCER_UNSUPPORTED_VERSION` | `unsupported fixture version` |
| `FIXTURE_WAV_PRODUCER_UNSUPPORTED_FORMAT` | `unsupported fixture format` |
| `FIXTURE_WAV_PRODUCER_INVALID_PCM` | `invalid PCM frame count` |
| `FIXTURE_WAV_PRODUCER_RESOURCE_LIMIT` | `fixture byte budget exceeded` |
| `FIXTURE_WAV_PRODUCER_DEPENDENCY_FAILURE` | `fixture inspection unavailable` |
| `FIXTURE_WAV_PRODUCER_INTERNAL_FAILURE` | `internal fixture failure` |

失败恰为全新深冻结 `{ok:false, errors:[{code,path,reason}]}`，只有一项首错，无 value/bytes/堆栈/
原始异常/输入内容。

## 7. 可运行示例

以下 JSON 块由 `test/fixture-wav-producer.test.mjs` 原样执行并核对期望值；它们只是测试信号。

### 7.1 单声道静音

```json
{
  "name": "producer-silence",
  "note": "人工测试信号，不是 TTS/RVC 结果",
  "input": { "schemaVersion": 1, "sampleRate": 16000, "channels": 1, "frameCount": 1, "pattern": "SILENCE" },
  "expected": {
    "byteLength": 46,
    "durationMs": 0.0625,
    "peak": 0,
    "fullScaleSampleCount": 0,
    "sha256": "156075e2635b9b2c186258f4db987ed9fbdfb727f49e5eac4b9a126aefbdf727"
  }
}
```

### 7.2 立体声边界序列

```json
{
  "name": "producer-edge",
  "note": "人工测试信号，不是 TTS/RVC 结果",
  "input": { "schemaVersion": 1, "sampleRate": 48000, "channels": 2, "frameCount": 3, "pattern": "EDGE_SEQUENCE" },
  "expected": {
    "byteLength": 56,
    "durationMs": 0.0625,
    "peak": 1,
    "fullScaleSampleCount": 3,
    "sha256": "8b6a5a5542a9ee92ce450a7db0ac951e512c670c8b19b90a67037dbd1f151485"
  }
}
```

### 7.3 真实 08-E-B 导入/读回/删除

```json
{
  "name": "library-roundtrip",
  "note": "测试内使用真实 trusted 临时 sandbox；库自签 ID，不写 Task/owner",
  "producerInput": { "schemaVersion": 1, "sampleRate": 48000, "channels": 2, "frameCount": 3, "pattern": "EDGE_SEQUENCE" },
  "scopeId": "scope:fixture-producer",
  "requestKey": "key:fixture-producer-roundtrip"
}
```

对应调用（与 C07 相同参数、真实库实现）：

```js
import { produceFixtureWav } from './core/audio/fixture-wav-producer.mjs'
import { openFixtureArtifactLibrary } from './core/audio/artifact-library.mjs'

const produced = produceFixtureWav({
  schemaVersion: 1,
  sampleRate: 48000,
  channels: 2,
  frameCount: 3,
  pattern: 'EDGE_SEQUENCE',
})
const opened = await openFixtureArtifactLibrary({ sandbox })
const imported = await opened.value.import({
  schemaVersion: 1,
  scopeId: 'scope:fixture-producer',
  requestKey: 'key:fixture-producer-roundtrip',
  bytes: produced.value.bytes,
  now: '2026-10-29T00:00:00.000Z',
  expiresAt: '2026-10-29T01:00:00.000Z',
  rights: { state: 'GRANTED', proofRef: 'fixture-rights:proof-1' },
})
// imported.value.artifact.origin === 'FIXTURE_IMPORT'，ID 为库自签 artifact:fixture-bytes-<32hex>
```

## 8. 未实现与未声明

- 不生成 TTS/RVC 音频、不模拟人物音色/唱歌、不与旧 RVC Fake ref 配对。
- 不接 Task/owner/store/engine/source/Provider/Gateway，不推进 `MARK_SAVED`、不写持久状态。
- 不提供真实来源、权利或 ownership 证明；`SYNTHETIC_FIXTURE` 可被任何调用方构造。
- 不做跨进程锁、崩溃恢复、队列、清理或恢复接口；不读/写生产配置、媒体目录或用户文件。
- 不覆盖任意 Proxy trap、被篡改运行时或全部同权限 TOCTOU。
- 图形用户流程未实现：研发调用/命令不等于普通用户流程。

## 9. 本地验证

```powershell
node --check core/audio/fixture-wav-producer.mjs
node --test test/fixture-wav-producer.test.mjs
```

专项 `C01–C08` 覆盖：C01 实际 **14 组**（六采样率各 mono `SILENCE` + stereo `EDGE_SEQUENCE` 的
12 组，另加 16000 的 mono `EDGE_SEQUENCE` 与 stereo `SILENCE` 两组；不是 6×2×2=24 的完整笛卡尔
积，原“六率各至少一次”等要求已满足）、三条独立字面向量、结构与首错、1 MiB 边界（C04 五例并在
test-only worker 中以委托真实 `Uint8Array` 的被动观测记录输出构造：两个合法例各 1×1,048,576 且
观察对象就是返回 `bytes`，三个拒绝例 0 构造/0 复检，inspector 内部 copy 分列）、内存隔离、
C06 七类依赖故障注入（含“非空但错误固定消息”）、真实 08-E-B 字节链与公开面/文档示例；C08 另断言
`FIXTURE_WAV_PRODUCER_LIMITS.maxByteLength === ARTIFACT_LIBRARY_LIMITS.maxItemBytes`。全量回归、
构建、语法、UI 与精确 CI 由仓库常规命令另行执行。
