# Plan08-E-A · 有界 WAV 字节校验与安全元数据（内部文档）

状态：**OFFLINE** / **FIXTURE_ONLY** / **NOT_INTEGRATED**。本文件面向研发/审核，不是普通用户文档。它不代表已接入 Host/GUI、真实模型/音频、成品库或发送链路；本模块只校验**调用方实际传入的字节**。

## 1. 目的与范围

原 08-B 源 Artifact 只比较**声明**的四元数据（`durationMs`/`byteLength`/`sampleRate`/`channels`），08-C 的 RVC Fake 只有引用与声明值，Task `MARK_SAVED` 仍是纯 Fake 归约。本模块补上**真实字节检验**这一层：一个同步纯入口消费调用方字节，在固定预算内完整解析 RIFF/WAVE PCM16，实测元数据与整文件 SHA256，供后续成品库/保存删除/Cover 消费。

不做：文件存储、网络、进程、时钟、随机、播放、录音、解码器安装、Provider/RVC 调用、Task/owner/store 交互、ID 签发、`MARK_SAVED`/Relay、成品保存或删除、跨进程恢复。**不把人工字节冒认成旧 Fake 生成物，也不把校验成功当作用户使用权或可投递 Artifact 凭证。**

## 2. 公开面

恰四个导出（无顶层副作用）：

```text
WAV_BYTES_SCHEMA_VERSION = 1
WAV_BYTE_LIMITS          // 深冻结预算表
WAV_BYTE_ERRORS          // 冻结的 8 个固定码
inspectFixtureWavBytes(input)   // 同步纯入口
```

`WAV_BYTE_LIMITS`：`maxByteLength=52428800`（完整文件 50 MiB，含 header/chunks/pad）、`maxDurationMs=300000`、`maxChunks=128`（含 `fmt `/`data` 及所有顶层子 chunk，不含 RIFF 外层）、`bitsPerSample=16`、`sampleRates=[16000,22050,24000,32000,44100,48000]`、`channels=[1,2]`。预算不能由输入覆盖。

## 3. 输入与原生字节边界

根输入**恰两自有可枚举 data 字段**：`{ schemaVersion: 1, bytes: <真实 Uint8Array，含 Buffer> }`。普通或 null 原型根允许；未知键、隐藏键、Symbol 键、accessor（getter 不执行）、缺字段均安全拒绝，错误不回显未知键名。

`bytes` 必须是真的 `Uint8Array`（含 `Buffer`）：通过受信任 intrinsic 读取 brand、`buffer`、`byteOffset`、`byteLength`，**不信任**调用方覆盖的 `length`/`byteLength`/`constructor`/迭代器。拒绝 Proxy、伪造原型、数组、字符串/base64、`DataView` 及其他 typed array、`SharedArrayBuffer`、已 detached 或 resizable 的 backing buffer。视图上的额外属性不参与语义且不会被调用。

先核视图自身长度与字节预算，再从**该视图确切 offset/length** 复制到自有固定 `Uint8Array`；`subarray`/`Buffer` 池视图只复制自己那一段，前后私有字节不进长度与 hash。后续格式检查、samples、SHA256 全部基于这份自有副本；不改、不冻结调用方视图或其底层 buffer，也不返回任何可变字节引用。

## 4. 支持 profile 与预算

| 项 | 值 |
|---|---|
| 容器 | little-endian `RIFF` / `WAVE`（RIFX/RF64、裸 PCM、压缩/float/extensible 明确不支持） |
| 编码 | `formatTag=1` PCM、`bitsPerSample=16` → `PCM_S16LE` |
| sampleRate | 16000 / 22050 / 24000 / 32000 / 44100 / 48000 |
| channels | 1 或 2（stereo 在本 profile 通过，不代表旧 RVC 输入支持 stereo） |
| 完整文件字节 | ≤ 52428800（含 header/chunks/pad） |
| 时长 | ≤ 300000 ms（整数交叉乘法比较，不 round） |
| 顶层 chunk | ≤ 128（含 fmt/data） |

必须**完整遍历到末尾**：RIFF 声明 size 恰为实际视图字节数 − 8；每 chunk 具完整 8 字节头、payload 边界与 odd-size pad（pad 不计入 chunkSize 但计入文件长度，pad 字节不要求为 0）；未知 chunk 只在预算内跳过，不递归/解压/返回内容；零长度未知 chunk 仍推进并计数。截断、缺 pad、越界 size、尾随尺寸矛盾一律拒绝。

顶层恰 1 个 `fmt ` 与 1 个 `data`，两者顺序任意，未知 chunk 可前/中/后。`fmt ` payload 仅 16 字节，或 18 字节且 `cbSize=0`；其他布局明确不支持。按实际 fmt 核 `blockAlign=channels×2`、`byteRate=sampleRate×blockAlign`；data 字节必须整帧，`frameCount=dataByteLength/blockAlign>0`；`durationMs=frameCount×1000/sampleRate` 保留有限小数（帧数是权威，不 round/ceil 冒充旧整数元数据）。

`peak=max(abs(sample))/32768`；`fullScaleSampleCount` 统计所有声道中等于 −32768 或 32767 的样本个数。满幅计数是精确信号指标，**不等于已经诊断听感削波或证明无失真**；满幅样本本身不是本层格式错误，不自动归一化/限幅。SHA256 覆盖完整自有文件字节（含 header/未知 chunks/pad），不是只 hash data 或调用方声明。

## 5. 返回与错误协议

成功是深冻结全新 `{ok:true,value}`，value 恰 19 键：

```text
schemaVersion, format, codec, bitsPerSample, sampleRate, channels,
byteLength, dataByteLength, frameCount, durationMs, peak, fullScaleSampleCount,
sha256, validationState, mockOnly, realOperationAllowed, submitAllowed,
automaticRetryAllowed, messageZh
```

固定值：`format="WAV"`、`codec="PCM_S16LE"`、`bitsPerSample=16`、`validationState="FIXTURE_WAV_CHECKED"`、`mockOnly=true`、三个真实操作标志全 `false`、`messageZh="演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。"`。数值与 hash 都从同一 owned bytes 派生，不接收任何声明元数据当成功依据；结果不含 bytes、chunk 内容、路径、URL、TaskId、ArtifactId/ref、scope、ownership、rights 或 DeliveryId。

失败恰 `{ok:false,errors:[{code,path,reason}]}`，fresh/deep-frozen，固定一项首错，不带 value，不抛用户数据异常，不回显值/字节/未知键名/原生异常/堆栈。8 个固定码（`WAV_BYTES_` 前缀）：`INVALID_INPUT`、`UNSUPPORTED_VERSION`、`INVALID_BYTES`、`RESOURCE_LIMIT`、`UNSUPPORTED_FORMAT`、`INVALID_CONTAINER`、`INVALID_PCM`、`INTERNAL_FAILURE`。`path` 只取 `$`、`schemaVersion`、`bytes`、`<unknown-key>`，`reason` 固定查表。

**首错顺序**：① 根形状/键/字段（`INVALID_INPUT`、`UNSUPPORTED_VERSION`）；② 原生载体与视图字节预算（`INVALID_BYTES`、`RESOURCE_LIMIT`/`bytes`）；③ 容器完整性与 chunk 遍历（`INVALID_CONTAINER`；chunk 数超预算 → `RESOURCE_LIMIT`）；④ profile（`UNSUPPORTED_FORMAT`）；⑤ PCM 算术与整帧（`INVALID_PCM`）；⑥ 时长预算（`RESOURCE_LIMIT`）；⑦ 实际未知内部异常 → `INTERNAL_FAILURE`。

## 6. 限制与语义边界

- 结果是内部检验元数据，不是可注册/可投递的可信 Artifact 凭证，也不认证来源；不签发 ID、不伪造旧 Fake `outputRef` 与字节的归属关系、不调用 owner/Task 转移、`MARK_SAVED` 或 Relay、不保存或删除成品。
- 本 profile 是项目策略支持的子集，不代表规范只允许此子集，也不代表模型/GPU 能力或所有后端支持。
- 错误输入不留跨调用状态，不恢复、不重试；需要外部 decoder、新依赖、真实媒体/模型/设备、文件库或 Task/store 协议改动的步骤一律不在本模块内。
- 成品库 ownership/可验证删除、其他 codec/重采样、Cover、资源动态依赖、全局 ID-deliveryId、跨进程、完整父 E2E、中文图形界面与获授权真实链路仍缺。

## 7. 成功示例

以下为**完整**可原样构造执行的输入（`bytesHex` 是 76 字节 mono/16000 Hz/16 帧/峰值 0.5 的人工 Fixture，独立计算的整文件 SHA256 为 `9d2b85f5df217dac492a908f7f42a837836ea165cfea7d34e0ff7a7038d4b65d`）：

```json
{
  "schemaVersion": 1,
  "bytesHex": "524946464400000057415645666d74201000000001000100803e0000007d00000200100064617461200000000040000000000000000000000000000000000000000000000000000000000000"
}
```

调用方式（研发调用，不是普通用户流程）：

```js
const bytes = Uint8Array.from(Buffer.from(example.bytesHex, 'hex'))
inspectFixtureWavBytes({ schemaVersion: 1, bytes })
```

返回 `ok:true`，`value` 满足：`byteLength=76`、`dataByteLength=32`、`frameCount=16`、`durationMs=1`、`peak=0.5`、`fullScaleSampleCount=0`、`sampleRate=16000`、`channels=1`、`sha256=9d2b85f5…4b65d`。

## 8. 失败示例

同一 Fixture 被截断为前 20 字节（只剩 RIFF 头与半个 fmt 头）：

```json
{
  "schemaVersion": 1,
  "bytesHex": "524946464400000057415645666d742010000000"
}
```

返回 `ok:false`、`errors[0].code="WAV_BYTES_INVALID_CONTAINER"`、`path="$"`（RIFF 声明长度与实际视图不符）。

## 9. 与旧源合同的关系（W07）

把人工 mono 整毫秒 Fixture 的四个实测值（`durationMs`/`byteLength`/`sampleRate`/`channels`）填入既有合法 SVC 源/request Fixture 的同一四字段后，旧 `resolveFixtureTaskSource` 仍实际 `FIXTURE_SOURCE_LINKED`；只改一处 metadata 的合法负控实际 `SOURCE_ARTIFACTS_SOURCE_AUDIO_MISMATCH`。旧模块零改；该比较只证明同元数据，不证明 Fake 引用归属、权利或成品已保存。**分数时长不能 round 塞进旧整数合同**（例如 0.3125 ms 不是 1 ms）。

## 10. 测试与证据

`test/wav-byte-inspector.test.mjs` 覆盖 W01–W08：真实正常/载体（Buffer、普通视图、subarray 前后哨兵、同名遮蔽 getter 0 次、调用方字节与冻结态不变）、完整 RIFF（两顺序、前中后未知 chunk、odd pad、缺 pad/截断/巨大声明/尾随矛盾/重复或缺失 fmt-data/空 data、128/129 chunk 边界与零长度未知 chunk）、格式与算术（六 rate、1–2ch、PCM16、整帧、blockAlign/byteRate 矛盾、裸 PCM/RIFX/RF64/float/其他 profile）、资源界线（字节预算 +1 与 exact-limit 控制、时长 300000 ms 与 +1 帧、分数时长不 round）、实测指标与字面 SHA256 向量（静音、正负满幅计数、改一个 data 字节或 unknown-chunk pad 即整体 hash 变化）、输入/输出安全（Shared/resizable/detached、Proxy、伪造原型、其他 typed array、DataView、数组/字符串、根隐藏/Symbol/accessor 与 getter 0 次、输出全图冻结且与输入不共享、常量冻结、无二进制回显）、旧源合同兼容、文档示例原样执行与无 `fs`/网络/进程/时钟/随机依赖。

测试全部在人工内存字节上构造，不下载/读取私人或真实媒体，不播放/录音/调用模型。本文档不预填未执行的通过数。
