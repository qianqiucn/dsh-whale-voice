# SOURCE_ARTIFACTS_OFFLINE — Fixture源Artifact与任务请求关联（Plan 08-B）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本模块 `core/audio/source-artifacts.mjs` 只在一套虚构 Fixture 数据上核对“任务声明的源引用 → 同 scope/版本/权利/有效期的文本或音频元数据 → 同一 Provider 请求内容”是否一致；它不读文件、不解码音频、不计算校验和、不生成音频、不派发、不推进 AudioTask，也不新增 GUI 或 Host 端点。普通用户本轮没有新增可用功能。

`FIXTURE_SOURCE_LINKED` 只表示**演示源关联成立**：所选源条目的声明内容与同一 Provider 请求一致。它不表示字节存在、音频可解码、codec/peak/大小/哈希有效、真实使用权已确认，也不表示音频已生成、可试听/保存/发送。

## 1. 公开面

模块恰好四个导出：

| 导出 | 说明 |
|---|---|
| `SOURCE_ARTIFACTS_SCHEMA_VERSION` | 固定 `1` |
| `SOURCE_ARTIFACT_ERRORS` | 18 个固定错误/原因码，每个值为 `SOURCE_ARTIFACT_` 加键名 |
| `validateFixtureSourceLibrary(input)` | 验证一个 `FixtureSourceLibrary v1` |
| `resolveFixtureTaskSource(input)` | 组合 08-A 音色绑定与源关联 |

两个入口都是同步纯函数：不读时钟、不用随机数、不做 I/O/网络、不启进程、不保留跨调用可变业务状态。两个入口各自对整根输入调用一次共享 `copyFixtureInput`，随后只读副本，并用 `deepFreezeFixtureValue` 冻结全部输出。resolver 只实际调用旧 08-A 的 `resolveFixtureVoiceBinding` 一次，不重新实现 Task/Provider 顺序。

## 2. FixtureSourceLibrary v1

顶层**恰**两个键：

```json
{ "schemaVersion": 1, "artifacts": [] }
```

`artifacts` 为 0–32 项的稠密标准数组；33 项及以上返回 `SOURCE_ARTIFACT_RESOURCE_LIMIT`（`path: "$"`）。每项**恰** 9 键，全部必填，按以下顺序校验：

```text
artifactRef, revision, scopeId, kind, rightsState,
availability, expiresAt, text, audio
```

| 字段 | 规则 |
|---|---|
| `artifactRef` | `/^artifact:fixture-[A-Za-z0-9_-]{1,48}$/`，全库唯一（跨 scope 也不容忍重复）；不是 URL/路径/文件名 |
| `revision` | 整数 1–2147483647 |
| `scopeId` | `/^scope:fixture-[A-Za-z0-9_-]{1,32}$/`，虚构隔离域，不是真实身份/会话认证 |
| `kind` | `TEXT` / `AUDIO` |
| `rightsState` | `CONFIRMED_FIXTURE` / `UNVERIFIED` / `REVOKED`；合法负向可入库，选中时判断 |
| `availability` | `PRESENT` / `ABSENT` / `UNKNOWN` |
| `expiresAt` | `null` 或严格规范 UTC `YYYY-MM-DDTHH:mm:ss.sssZ`（正则 + `Date.parse` + 回转 `toISOString` 逐字相同） |
| `text` | `TEXT` 必为 1–8192 UTF-16 码元字符串；不 trim、不替换换行、不做 Unicode 归一化；正文是数据，绝不作为地址访问 |
| `audio` | `TEXT` 必须为 `null`；`AUDIO` 必为 `{durationMs, byteLength, sampleRate, channels}`，字段顺序与整数约束如下 |

AUDIO 四字段直接复用原 RVC Fixture 常量（不复制第二套能力表）：

- `durationMs`：1 至 `RVC_FAKE_LIMITS.maxDurationMs`（当前 300000）；
- `byteLength`：1 至 `RVC_FAKE_LIMITS.maxByteLength`（当前 52428800）；
- `sampleRate`：必须属于 `RVC_FAKE_LIMITS.inputSampleRates`（16000/22050/24000/32000/44100/48000）；
- `channels`：严格等于 `RVC_FAKE_LIMITS.inputChannels`（1）。

AUDIO 只是当前 RVC 输入的**元数据 Fixture 子集**：没有原始字节、mime、codec、peak、hash 或 “verified” 字段；不假称通用成品 Artifact 库或真实音频已验证。`request.outputFormat` 是输出格式，不能用来判断源 codec。

全库严格检查，未选中的坏结构也会拒绝；未选中的合法 `UNVERIFIED`/`REVOKED`/`ABSENT`/`UNKNOWN`/过期条目不连坐选中条目。检查顺序：库根未知键 → 缺键 → schema → `artifacts` 类型/长度；随后按数组顺序、按上述字段顺序验值，重复在 `artifactRef` 有效后检查。

## 3. validate 输出

成功恰 6 键：

```json
{
  "ok": true,
  "value": {
    "schemaVersion": 1,
    "artifactCount": 1,
    "mockOnly": true,
    "realOperationAllowed": false,
    "submitAllowed": false,
    "automaticRetryAllowed": false
  }
}
```

**不返回**归一化全文库、正文、源引用、scope 清单或音频字段。resolver 必须接原始两键库，不接受这个结果封套代替。

## 4. resolver 输入与唯一顺序

输入根恰 4 键，全部必填：

```text
{schemaVersion:1, voiceBinding:<08-A原六键输入>,
 artifactLibrary:<第2节两键库>, sourceRevision:<1..2147483647整数>}
```

`voiceBinding` 仍是 08-A 的 `{schemaVersion, library, taskDraft, negotiation, expectation, now}`，本模块不改其接口；scope 只取同一 `expectation.scopeId`，时间只取同一 `now`。`sourceRevision` 是显式预期源版本，不默认取当前最新版。

唯一顺序：

1. 整根安全复制；根未知键/缺键/字段数/schema，随后 `sourceRevision`，再 `artifactLibrary` 全库结构，按此顺序严格校验。结构错误不能被旧业务 BLOCKED 掩盖。
2. 对同一副本 `voiceBinding` 实际调用 `resolveFixtureVoiceBinding` 一次；合法 `ok:false` 统一 `VOICE_BINDING_INVALID/voiceBinding`；抛错或不合既有协议为 `DEPENDENCY_FAILURE/$`。
3. 旧 08-A 合法 BLOCKED：立即返回新 BLOCKED / `VOICE_BINDING_BLOCKED`，嵌套 `voiceBinding` 保留原安全 value/reason/messageZh，`source:null`，中文复用旧 `messageZh`；合法源条目不能把旧拒绝升级。
4. 旧 FIXTURE_BOUND 后，从同一副本 `taskDraft.source.ref`、`expectation.scopeId` 取唯一源条目。不在库或仅属其他 scope 均为 `SOURCE_UNAVAILABLE`（逐字段相同，不区分存在性）；不加前缀/截断，不按列表首项回退。
5. 源 revision 不等于 `sourceRevision` → `SOURCE_REVISION_MISMATCH`；rights 非 `CONFIRMED_FIXTURE` → `SOURCE_RIGHTS_UNCONFIRMED`。
6. `availability=ABSENT` → `SOURCE_MISSING`；`UNKNOWN` → `SOURCE_UNKNOWN`；`PRESENT` 才继续。`expiresAt` 非 `null` 且 `<= now` → `SOURCE_EXPIRED`（等于也过期），不自动续期/重新获取。
7. `feature=voice-bubbles` 应为 `TEXT`，`singing` 应为 `AUDIO`，否则 `SOURCE_KIND_MISMATCH`。
8. TTS：源 `text` 必须与同一 `negotiation.request.text` 按 JS 字符串严格相等，否则 `SOURCE_TEXT_MISMATCH`；不 trim、不拼接、不做 Unicode 归一化或 CRLF 替换。
9. SVC：旧 08-A 已核 `source.ref === request.sourceAudioRef`，本层不改引用；精确比较源 `audio` 的 `durationMs/byteLength/sampleRate/channels` 与同一 `request.inputAudio` 四值，任何不同 → `SOURCE_AUDIO_MISMATCH`。不把输出 format 当源格式，不读/生成音频字节。
10. 全部通过才 `FIXTURE_SOURCE_LINKED`；不调用 06-C/06-D、不推进 Task。重复显式调用只重算，不是跨会话幂等或生成重试。

## 5. 组合输出与固定中文

成功/合法业务拒绝恰 10 键：

```text
{schemaVersion:1, decision, reason, messageZh,
 voiceBinding:<本调用旧08-A安全value>, source,
 mockOnly:true, realOperationAllowed:false, submitAllowed:false, automaticRetryAllowed:false}
```

- `decision` 仅 `FIXTURE_SOURCE_LINKED` / `BLOCKED`；LINKED 时 `reason=null`。
- LINKED 的 `source` 恰 `{kind, revision}`，不含源引用或正文；BLOCKED 的 `source=null`。
- `voiceBinding` 是本次旧入口返回的安全新对象，不含原文本、源引用、registry 或 manifest。

| 结果/reason | 固定 messageZh |
|---|---|
| LINKED | 演示源内容与任务请求已核对；尚未生成音频，不能据此试听、保存或发送。 |
| VOICE_BINDING_BLOCKED | 原 08-A messageZh 完整复用 |
| SOURCE_UNAVAILABLE / SOURCE_MISSING | 没有可用的演示任务源，请重新选择或稍后再说。 |
| SOURCE_REVISION_MISMATCH | 演示任务源版本已变化，请刷新后重新选择。 |
| SOURCE_RIGHTS_UNCONFIRMED | 演示任务源使用权尚未确认或已撤销，请确认后再继续。 |
| SOURCE_UNKNOWN | 演示任务源状态未知，请重新检查，系统不会自动获取。 |
| SOURCE_EXPIRED | 演示任务源已过期，请重新选择。 |
| SOURCE_KIND_MISMATCH / SOURCE_TEXT_MISMATCH / SOURCE_AUDIO_MISMATCH | 演示任务源与请求不一致，请重新选择；系统不会自动替换。 |

所有成功/BLOCKED/error 整图 fresh 且 deep-frozen；不冻结输入，无输入或跨调用对象共享；不自动下载/恢复/换 Provider/重试；UNKNOWN 不重发。

## 6. 错误协议

结构失败恰 `{ok:false, errors:[{code,path,reason}]}`，固定一项首错；`path` 仅允许 `$`、`schemaVersion`、`artifactLibrary`、`voiceBinding`、`sourceRevision`、`<unknown-key>`；`reason` 为枚举键小写、下划线换空格的固定短语，不回显值。

结构/依赖 8 码：`INVALID_INPUT`、`RESOURCE_LIMIT`、`UNSUPPORTED_VERSION`、`INVALID_LIBRARY`、`DUPLICATE_ARTIFACT`、`INVALID_SOURCE_REVISION`、`VOICE_BINDING_INVALID`、`DEPENDENCY_FAILURE`。

业务 10 码：`VOICE_BINDING_BLOCKED`、`SOURCE_UNAVAILABLE`、`SOURCE_REVISION_MISMATCH`、`SOURCE_RIGHTS_UNCONFIRMED`、`SOURCE_MISSING`、`SOURCE_UNKNOWN`、`SOURCE_EXPIRED`、`SOURCE_KIND_MISMATCH`、`SOURCE_TEXT_MISMATCH`、`SOURCE_AUDIO_MISMATCH`。

| 位置/失败 | 固定 code / path |
|---|---|
| 两入口安全复制失败/超预算 | `INVALID_INPUT/$` 或 `RESOURCE_LIMIT/$` |
| 各入口根非对象/缺键/字段数 | `INVALID_INPUT/$` |
| 各入口根未知键 | `INVALID_INPUT/<unknown-key>` |
| 各入口根 schema 存在但非 1 | `UNSUPPORTED_VERSION/schemaVersion` |
| resolver 嵌套 artifactLibrary 非对象/缺键/未知键/字段数 | `INVALID_LIBRARY/artifactLibrary` |
| 嵌套 artifactLibrary.schemaVersion 存在非 1 | `UNSUPPORTED_VERSION/artifactLibrary` |
| 库内 artifacts/字段/类型/格式/变体错误 | `INVALID_LIBRARY/artifactLibrary` |
| 合法源引用重复 | `DUPLICATE_ARTIFACT/artifactLibrary` |
| 源数组 33 项 | `RESOURCE_LIMIT/$` |
| sourceRevision 错误 | `INVALID_SOURCE_REVISION/sourceRevision` |
| 旧 08-A 合法 ok:false / 异常或非法返回 | `VOICE_BINDING_INVALID/voiceBinding` / `DEPENDENCY_FAILURE/$` |

根先类型 → 未知键 → 缺键/字段数 → schema；unsafe 复制始终先于业务；getter/setter 不调用，Symbol/隐藏/自定义原型/洞/循环等既有策略保持；抛错 Proxy 固定拒绝但不宣称 trap 被沙箱隔离。依赖异常未实际注入即标 `STATIC_NOT_INJECTED`。

## 7. TTS完整示例

以下为**完整四键输入**，可直接 `JSON.parse` 后原样传给 `resolveFixtureTaskSource`（`voiceBinding` 六键、源库、实例 manifest 与请求全部展开，无省略或占位）：

```json
{
  "schemaVersion": 1,
  "voiceBinding": {
    "schemaVersion": 1,
    "library": {
      "schemaVersion": 1,
      "profiles": [
        {
          "voiceProfileId": "voice:demo-hero",
          "revision": 1,
          "scopeId": "scope:fixture-demo",
          "displayName": "演示角色",
          "rightsState": "CONFIRMED_FIXTURE",
          "bindings": [
            {
              "instanceId": "instance:qwen",
              "assetId": "asset:fixture-voice-a"
            }
          ]
        }
      ],
      "assets": [
        {
          "assetId": "asset:fixture-voice-a",
          "revision": 1,
          "scopeId": "scope:fixture-demo",
          "kind": "TTS_VOICE",
          "candidateId": "qwen3-tts",
          "providerRef": "voice-a",
          "availability": "PRESENT",
          "rightsState": "CONFIRMED_FIXTURE",
          "integrity": null,
          "expiresAt": null
        }
      ]
    },
    "taskDraft": {
      "schemaVersion": 1,
      "taskId": "task:demo-tts",
      "feature": "voice-bubbles",
      "taskType": "TTS",
      "source": {
        "kind": "TEXT_REF",
        "ref": "artifact:fixture-text-1"
      },
      "voiceProfileId": "voice:demo-hero",
      "deliveryRequested": false,
      "rights": {
        "state": "CONFIRMED_FIXTURE"
      }
    },
    "negotiation": {
      "schemaVersion": 1,
      "registry": {
        "schemaVersion": 1,
        "instances": [
          {
            "instanceId": "instance:qwen",
            "category": "TTS",
            "candidateId": "qwen3-tts",
            "protocolVersion": 1,
            "fixture": true,
            "manifest": {
              "schemaVersion": 1,
              "id": "qwen3-tts",
              "name": "Fixture Local TTS",
              "kind": "LOCAL",
              "version": {
                "value": "1.0.0",
                "source": "fixture",
                "audited": true
              },
              "capabilities": {
                "languages": [
                  "zh-CN"
                ],
                "voices": [
                  {
                    "id": "voice-a",
                    "name": "Voice A",
                    "kind": "preset",
                    "languages": [
                      "zh-CN"
                    ],
                    "referenceAudioRequired": false
                  },
                  {
                    "id": "voice-b",
                    "name": "Voice B",
                    "kind": "preset",
                    "languages": [
                      "zh-CN"
                    ],
                    "referenceAudioRequired": false
                  }
                ],
                "clone": {
                  "supported": false,
                  "requiresReferenceAudio": false
                },
                "emotion": {
                  "supported": false,
                  "modes": [],
                  "defaultMode": "neutral"
                },
                "streaming": false,
                "formats": [
                  {
                    "mime": "audio/wav",
                    "sampleRate": 24000,
                    "channels": 1
                  }
                ],
                "limits": {
                  "maxChars": 100,
                  "timeoutMs": 5000,
                  "maxAudioSeconds": 30
                },
                "retry": {
                  "maxAttempts": 1,
                  "retryOn": [
                    "TIMEOUT"
                  ],
                  "idempotent": true
                },
                "cancellation": true
              },
              "health": {
                "mode": "local",
                "path": null,
                "timeoutMs": 1000,
                "auth": "none"
              },
              "credentials": {
                "required": false,
                "storage": "none",
                "ref": null
              },
              "network": {
                "required": false,
                "textUpload": false,
                "endpointPolicy": "loopback-only"
              },
              "privacy": {
                "textLeavesDevice": false,
                "retention": "none",
                "note": "fixture only"
              },
              "cost": {
                "paid": false,
                "model": "free",
                "note": "fixture only"
              },
              "resources": {
                "local": true,
                "gpuRequired": false,
                "cpuCapable": true
              }
            },
            "observation": {
              "state": "ok",
              "credentials": "not_required",
              "observedAt": "2026-10-26T00:00:00.000Z",
              "versionMatches": true
            }
          }
        ]
      },
      "selection": {
        "category": "TTS",
        "instanceId": "instance:qwen"
      },
      "consent": {
        "networkAllowed": false,
        "textUploadAllowed": false,
        "paidAllowed": false
      },
      "request": {
        "requestId": "request:fixture-1",
        "text": "hello",
        "voiceId": "voice-a",
        "language": "zh-CN",
        "emotion": "neutral",
        "format": "audio/wav",
        "streaming": false
      }
    },
    "expectation": {
      "scopeId": "scope:fixture-demo",
      "profileRevision": 1,
      "assetRevision": 1
    },
    "now": "2026-10-27T00:00:00.000Z"
  },
  "artifactLibrary": {
    "schemaVersion": 1,
    "artifacts": [
      {
        "artifactRef": "artifact:fixture-text-1",
        "revision": 1,
        "scopeId": "scope:fixture-demo",
        "kind": "TEXT",
        "rightsState": "CONFIRMED_FIXTURE",
        "availability": "PRESENT",
        "expiresAt": null,
        "text": "hello",
        "audio": null
      }
    ]
  },
  "sourceRevision": 1
}
```

该虚构示例实际返回 `ok:true`、`decision:"FIXTURE_SOURCE_LINKED"`、`reason:null`、`source:{kind:"TEXT",revision:1}`，中文为固定成功文案。把源 `text` 改成 `"hello "`（多一个空格）或 `"Hello"` 后，实际返回 `SOURCE_ARTIFACT_SOURCE_TEXT_MISMATCH`——逐码元比较，不做 trim/归一化。

## 8. SVC完整示例

以下为**完整四键输入**，可直接 `JSON.parse` 后原样传给 `resolveFixtureTaskSource`（RVC 实例与 `inputAudio` 四字段、源 audio 四字段完整展开）：

```json
{
  "schemaVersion": 1,
  "voiceBinding": {
    "schemaVersion": 1,
    "library": {
      "schemaVersion": 1,
      "profiles": [
        {
          "voiceProfileId": "voice:demo-hero",
          "revision": 1,
          "scopeId": "scope:fixture-demo",
          "displayName": "演示角色",
          "rightsState": "CONFIRMED_FIXTURE",
          "bindings": [
            {
              "instanceId": "instance:rvc",
              "assetId": "asset:fixture-model-a"
            }
          ]
        }
      ],
      "assets": [
        {
          "assetId": "asset:fixture-model-a",
          "revision": 1,
          "scopeId": "scope:fixture-demo",
          "kind": "RVC_MODEL",
          "candidateId": "rvc",
          "providerRef": "rvc-model:fixture-a",
          "availability": "PRESENT",
          "rightsState": "CONFIRMED_FIXTURE",
          "integrity": {
            "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "byteLength": 1048576
          },
          "expiresAt": null
        }
      ]
    },
    "taskDraft": {
      "schemaVersion": 1,
      "taskId": "task:demo-svc",
      "feature": "singing",
      "taskType": "SVC",
      "source": {
        "kind": "AUDIO_REF",
        "ref": "artifact:fixture-source-1"
      },
      "voiceProfileId": "voice:demo-hero",
      "deliveryRequested": false,
      "rights": {
        "state": "CONFIRMED_FIXTURE"
      }
    },
    "negotiation": {
      "schemaVersion": 1,
      "registry": {
        "schemaVersion": 1,
        "instances": [
          {
            "instanceId": "instance:rvc",
            "category": "SVC",
            "candidateId": "rvc",
            "protocolVersion": 1,
            "fixture": true,
            "manifest": null,
            "observation": {
              "state": "ok",
              "credentials": "not_required",
              "observedAt": "2026-10-26T00:00:00.000Z",
              "versionMatches": true
            }
          }
        ]
      },
      "selection": {
        "category": "SVC",
        "instanceId": "instance:rvc"
      },
      "consent": {
        "networkAllowed": false,
        "textUploadAllowed": false,
        "paidAllowed": false
      },
      "request": {
        "schemaVersion": 1,
        "sourceAudioRef": "artifact:fixture-source-1",
        "targetModelId": "rvc-model:fixture-a",
        "pitchShift": 0,
        "outputFormat": "audio/wav",
        "inputAudio": {
          "durationMs": 1000,
          "byteLength": 1000,
          "sampleRate": 44100,
          "channels": 1
        },
        "rights": {
          "state": "CONFIRMED_FIXTURE"
        }
      }
    },
    "expectation": {
      "scopeId": "scope:fixture-demo",
      "profileRevision": 1,
      "assetRevision": 1
    },
    "now": "2026-10-27T00:00:00.000Z"
  },
  "artifactLibrary": {
    "schemaVersion": 1,
    "artifacts": [
      {
        "artifactRef": "artifact:fixture-source-1",
        "revision": 1,
        "scopeId": "scope:fixture-demo",
        "kind": "AUDIO",
        "rightsState": "CONFIRMED_FIXTURE",
        "availability": "PRESENT",
        "expiresAt": null,
        "text": null,
        "audio": {
          "durationMs": 1000,
          "byteLength": 1000,
          "sampleRate": 44100,
          "channels": 1
        }
      }
    ]
  },
  "sourceRevision": 1
}
```

该虚构示例实际返回 `FIXTURE_SOURCE_LINKED`、`source:{kind:"AUDIO",revision:1}`。把源 `audio.byteLength` 改成 `1001` 后实际返回 `SOURCE_ARTIFACT_SOURCE_AUDIO_MISMATCH`；这只是元数据声明比较，不读音频字节、不解码、不验证 codec 或哈希。

## 9. 已知限制

- 只比较声明：不证明字节存在、可解码、大小正确、codec 有效、无 clipping 或哈希一致。
- `TEXT` 正文仅用于本次严格比较；validate 不返回、错误/结果不回显正文或源引用。
- `AUDIO` 是 RVC 输入的元数据子集，不是通用成品 Artifact；`request.outputFormat` 与源 codec 无关。
- `scopeId` 不是身份认证；`revision` 不是持久 CAS/全局分配；`CONFIRMED_FIXTURE` 不是真实授权。
- 不创建成品、deliveryId、Relay 候选、队列或持久缓存；删除/撤权/到期只在下次显式调用时判断。
- 真实模型、音频、GPU、微信设备与发送仍不在本轮范围。

## 10. 未来界面故事板（尚未实现，本轮没有新增可点击按钮）

以下为**未来** GUI 的普通用户路径，本轮代码没有实现，也没有新增按钮或 Host 端点：

1. 用户选择“语音气泡”或“唱歌”。
2. 选择源（演示正文或演示音频）与共享角色。
3. 选择已支持的演示实例。
4. 页面展示“演示源关联结果”：LINKED 时显示固定成功文案并说明尚未生成音频；阻断时显示对应中文原因。
5. 用户确认后，未来版本才进入真实生成/保存/发送；本轮不承诺。

研发人员可用 Node 测试或临时脚本调用本模块，但那不是普通用户操作路径。

## 11. 三种失败恢复

| 场景 | 用户看到 | 正确恢复 |
|---|---|---|
| 正文/元数据不一致 | 演示任务源与请求不一致，请重新选择；系统不会自动替换。 | 重新选择与请求一致的源；系统不会自动改内容或补字段 |
| 版本变化 | 演示任务源版本已变化，请刷新后重新选择。 | 刷新界面后重选；不自动取最新版 |
| 权利不足/过期或未知 | 演示任务源使用权尚未确认或已撤销… / 演示任务源已过期… / 演示任务源状态未知… | 先确认合法使用权，或重选/稍后检查；不自动获取或续期 |

新手成功只到“演示源已核对”，不会出现“已生成/已保存/已发送成功”。

## 12. 测试与证据

行为测试位于 `test/source-artifacts.test.mjs`，覆盖 S01–S22 场景组及边界（源库字段/复制预算、文本逐码元比较、音频四字段、旧 08-A 阻断优先、错误协议、getter/Proxy、fresh/deep-frozen、文档两个完整 JSON 原样正负执行等）。测试全部使用虚构数据，不触发真实发送、设备或生产配置。

实际执行命令与计数记录在 Plan08-B 交付报告及 CI 中；本文档不预填未经执行的通过数。

## 13. 未包含与父阶段

本轮无 dispatch/Task 推进、ID 分配、持久队列/缓存、真实媒体/文件操作或 GUI；音频解码/codec/peak/clip/校验和/真实删除与 Cover/资源运行保留父矩阵缺口。父 Plan08 仍 IN_PROGRESS；08-B 完成只补源内容/声明关联子集，不宣告父阶段或真实功能完成。
