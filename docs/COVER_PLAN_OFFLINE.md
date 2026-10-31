# 演示翻唱（Cover）纯阶段计划 · 08-F-A

**状态：`OFFLINE` / `FIXTURE_ONLY` / `PLAN_ONLY` / `NOT_INTEGRATED`。**

本模块是一个**纯规划校验器**：它校验已有的演示源、音色/模型关联与一份 Cover 配方，输出确定、冻结、明确不执行的阶段计划。它不创建任务、不运行阶段、不分离/转换/混音/校验/保存任何音频，也不读写文件、网络、进程、时钟或随机数。计划通过不等于 Cover 编排、父 Plan08 或真实唱歌能力已经完成。

## 1. 导出与常量

模块 `core/audio/cover-plan.mjs` 恰四个导出：

| 导出 | 说明 |
|---|---|
| `COVER_PLAN_SCHEMA_VERSION` | 恒为 `1` |
| `COVER_PLAN_LIMITS` | 深冻结、恰五键：`minPitchShift:-12`、`maxPitchShift:12`、`minGainDb:-24`、`maxGainDb:12`、`maxStages:4` |
| `COVER_PLAN_CODES` | 深冻结、恰 14 键，值为 `COVER_PLAN_` + KEY |
| `planFixtureCover(payload)` | 同步纯函数；返回普通结果对象，不返回 Promise，不抛出调用者可触发的异常 |

`planFixtureCover` 每次返回**新建、深冻结**的结果；不修改也不冻结调用者输入；同内容重复调用结果值确定，无历史、无缓存。

## 2. 输入协议

根对象恰四键：`schemaVersion`（数字 1）、`sourceInput`（原 `resolveFixtureTaskSource` 的完整输入：`schemaVersion/voiceBinding/artifactLibrary/sourceRevision`）、`recipe`、`capabilities`。

读取任何业务字段前，整个 payload 先经原 `copyFixtureInput` 安全复制：4096 values / depth 12 / 32 object keys / 256 array items / 8192 string code units，plain 或 null-prototype 对象、有限数、密集标准数组；拒绝 accessor/Symbol/隐藏键/自定义原型/洞/额外数组属性/循环，caller getter 0。

`recipe` 恰四键：`schemaVersion`、`sourceLayout`（`MIXED` 或 `CLEAN_VOCAL`）、`separationPreset`（`NONE` 或 `FIXTURE_TWO_STEM`）、`mixConfig`（恰 `mode/vocalGainDb/instrumentalGainDb`）。**MIXED 必须 `FIXTURE_TWO_STEM`，CLEAN_VOCAL 必须 `NONE`**；两 gain 为有限数、范围 [-24,12] 含边界；`VOCAL_ONLY` 的 `instrumentalGainDb` 必须严格为 0。recipe 不接受 `pitchShift/modelId/providerId` 等输入键。

`capabilities` 恰三键：`schemaVersion`、`separator`、`mixer`；两者仅 `AVAILABLE_FIXTURE|UNAVAILABLE|UNKNOWN`。它们只是本次调用的 Fixture 声明，不是可信 CapabilityEvidence、资源租约、安装或模型能力实测。

pitch 只取原 resolver 已接受的 `sourceInput.voiceBinding.negotiation.request.pitchShift`（整数 [-12,12]），模型/路由只沿原 voice/model binding 与同 request 核一致；planner 不提供第二个来源。

## 3. 固定校验顺序

1. 整 root 安全复制 → 根键面/版本 → recipe 键面/版本/字段/交叉规则 → capabilities 键面/版本/枚举；这些失败时 resolver 调用 0 次。
2. 对复制后的完整 `sourceInput` 调用原 `resolveFixtureTaskSource` **恰一次**；失败协议（throw、坏形状、accessor）一律 `DEPENDENCY_FAILURE`，合法 `ok:false` 映射 `SOURCE_INVALID`，不回显其错误数组或输入。
3. 合法源 BLOCKED → 立即 `SOURCE_BLOCKED`（`dependencyReason` 仅为原 10 个 business reason 之一），**先于**任务/路由/能力可用性。
4. 源 LINKED → 先核共通事实（schema、四安全标志、taskId/feature/voiceProfileId 与已复制 draft 一致）；不是 `singing` + `SVC` → `UNSUPPORTED_TASK`（合法 TTS 源在此拒绝）。
5. 仅 SVC 分支再核完整 11 字段关联（profile/asset/source 单选定位与等值交叉检查、AUDIO 源、RVC_MODEL/rvc、pitch 原边界）；任何矛盾 → `DEPENDENCY_FAILURE`，不静默取 0 或换模型。
6. `CLEAN_VOCAL` + `WITH_INSTRUMENTAL` → `INSTRUMENTAL_MISSING`（先于能力可用性）。
7. `MIXED` 才检查 separator（UNAVAILABLE → `SEPARATION_UNAVAILABLE`，UNKNOWN → `SEPARATION_UNKNOWN`）；随后所有路线检查 mixer（UNAVAILABLE → `MIXING_UNAVAILABLE`，UNKNOWN → `MIXING_UNKNOWN`）。
8. 全部通过才 `PLANNED`。

## 4. 输出协议

成功与 BLOCKED 的 root 均为 `{ok:true, value}`；`value` 恰 15 键：

`schemaVersion, decision, reason, dependencyReason, messageZh, association, recipe, stages, outputSlot, outputArtifactRef, taskAuthority, mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed`

- `schemaVersion` 恒 1；四安全标志恒 `true/false/false/false`；`taskAuthority` 恒 `UNVERIFIED`；`outputArtifactRef` 恒 `null`。
- `PLANNED`：`reason/dependencyReason` 均 `null`；`association` 恰 11 键；`recipe` 为原四键 + `pitchShift`（恰 5 键，内部 `mixConfig` 仍恰 3 键）；`stages` 见 §5；`outputSlot` 恒 `VERIFIED_MASTER`（计划槽，不是已验证/已存储媒体）。
- `BLOCKED`：`reason` 为固定 business 码；`dependencyReason` 仅 `SOURCE_BLOCKED` 可非 `null`；`association/recipe/outputSlot` 均 `null`，`stages` 恰空数组。

`association` 十一个字段是单源消费对照（taskId/scopeId/voiceProfileId/profileRevision/modelAssetId/modelRevision/instanceId/candidateId/modelId/sourceRef/sourceRevision），全部来自同一次已复制并被原 resolver 完整验证的输入，不读取其他库。

## 5. 三条合法阶段图

| sourceLayout / mix mode | 阶段图（顺序即依赖） |
|---|---|
| MIXED / WITH_INSTRUMENTAL | SEPARATING [SOURCE]→[VOCAL, INSTRUMENTAL] → CONVERTING [VOCAL]→[CONVERTED_VOCAL] → MIXING [CONVERTED_VOCAL, INSTRUMENTAL]→[MASTER] → VERIFYING [MASTER]→[VERIFIED_MASTER] |
| MIXED / VOCAL_ONLY | 同上分离/转声；MIXING 输入仅 [CONVERTED_VOCAL]；VERIFYING 不变（INSTRUMENTAL 只是未消费的计划副产槽） |
| CLEAN_VOCAL / VOCAL_ONLY | CONVERTING [SOURCE]→[CONVERTED_VOCAL] → MIXING [CONVERTED_VOCAL]→[MASTER] → VERIFYING [MASTER]→[VERIFIED_MASTER]（恰 3 项） |

每个 stage 恰三键 `stage/inputs/outputs`；不接受自定义 stage、路径、URL、artifactRef 或 stageId。MIXED 恰 4 项、CLEAN 恰 3 项，总不超 `maxStages`。这些阶段字符串不是原 AudioTask v1 的 states；`VERIFIED_MASTER` 也不是已跑 inspection/真实校验。

## 6. 固定 14 码

| KEY | 类别 | path / 业务 reason | 中文说明 / 业务 messageZh |
|---|---|---|---|
| INVALID_INPUT | ok:false | `$` 或 `<unknown-key>`；`invalid input` | 演示翻唱规划请求格式不正确，请检查完整输入。 |
| RESOURCE_LIMIT | ok:false | `$`；`resource limit exceeded` | 演示翻唱规划输入超出允许范围。 |
| UNSUPPORTED_VERSION | ok:false | `schemaVersion`/`recipe.schemaVersion`/`capabilities.schemaVersion`；`unsupported schema version` | 暂不支持此演示翻唱规划版本。 |
| INVALID_RECIPE | ok:false | `recipe`；`invalid cover recipe` | 演示翻唱配方不完整或参数不受支持。 |
| INVALID_CAPABILITIES | ok:false | `capabilities`；`invalid fixture capabilities` | 演示能力声明格式不正确。 |
| SOURCE_INVALID | ok:false | `sourceInput`；`invalid fixture source` | 演示源、音色或模型关联格式不符合要求。 |
| DEPENDENCY_FAILURE | ok:false | `sourceInput`；`source dependency failure` | 无法确认演示源校验结果，请重新核对。 |
| SOURCE_BLOCKED | ok:true / BLOCKED | `COVER_PLAN_SOURCE_BLOCKED` | 所选演示源或音色目前不可用；请重新核对，系统不会自动替换或重试。 |
| UNSUPPORTED_TASK | ok:true / BLOCKED | `COVER_PLAN_UNSUPPORTED_TASK` | 当前演示规划仅支持唱歌的 SVC 任务。 |
| SEPARATION_UNAVAILABLE | ok:true / BLOCKED | `COVER_PLAN_SEPARATION_UNAVAILABLE` | 演示分离能力不可用，暂不能规划混合歌曲的翻唱。 |
| SEPARATION_UNKNOWN | ok:true / BLOCKED | `COVER_PLAN_SEPARATION_UNKNOWN` | 演示分离能力状态未知，请先确认。 |
| MIXING_UNAVAILABLE | ok:true / BLOCKED | `COVER_PLAN_MIXING_UNAVAILABLE` | 演示混音能力不可用，暂不能完成阶段规划。 |
| MIXING_UNKNOWN | ok:true / BLOCKED | `COVER_PLAN_MIXING_UNKNOWN` | 演示混音能力状态未知，请先确认。 |
| INSTRUMENTAL_MISSING | ok:true / BLOCKED | `COVER_PLAN_INSTRUMENTAL_MISSING` | 清唱源未提供伴奏，不能规划带伴奏混音；请选择仅人声。 |

协议错误只含一个固定 `errors[0]`（恰 `code/path/reason` 三键），无 `value`，不拼接调用者键值、异常 message 或私有路径。PLANNED 的固定 `messageZh` 为：**`已生成演示翻唱阶段计划；尚未分离、转换、混音、校验或保存音频。`**

## 7. 完整可执行示例

以下三份 JSON 均为**完整独立 root**，包含全部四个字段与完整 `sourceInput`（取自 `docs/TASK_FIXTURE_RUNNER_OFFLINE.md` §7 的演示源；全部 ID 均为明示虚构值）。测试逐字解析这些代码块并直接调用 `planFixtureCover`，不注入、不替换、不补字段。

### 示例 A · MIXED / WITH_INSTRUMENTAL（预期 PLANNED，4 stages，pitch 0）

```json
{
  "schemaVersion": 1,
  "sourceInput": {
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
  },
  "recipe": {
    "schemaVersion": 1,
    "sourceLayout": "MIXED",
    "separationPreset": "FIXTURE_TWO_STEM",
    "mixConfig": {
      "mode": "WITH_INSTRUMENTAL",
      "vocalGainDb": 0,
      "instrumentalGainDb": 0
    }
  },
  "capabilities": {
    "schemaVersion": 1,
    "separator": "AVAILABLE_FIXTURE",
    "mixer": "AVAILABLE_FIXTURE"
  }
}
```

调用：

```js
import { planFixtureCover } from './core/audio/cover-plan.mjs'

const result = planFixtureCover(exampleA)
result.ok            // true
result.value.decision // 'PLANNED'
result.value.association // 见下
```

预期关联：

```json
{"taskId":"task:demo-svc","scopeId":"scope:fixture-demo","voiceProfileId":"voice:demo-hero","profileRevision":1,"modelAssetId":"asset:fixture-model-a","modelRevision":1,"instanceId":"instance:rvc","candidateId":"rvc","modelId":"rvc-model:fixture-a","sourceRef":"artifact:fixture-source-1","sourceRevision":1}
```

预期 `stages` 为 SEPARATING → CONVERTING → MIXING（输入含 INSTRUMENTAL）→ VERIFYING，共 4 项；`outputSlot='VERIFIED_MASTER'`、`taskAuthority='UNVERIFIED'`、`outputArtifactRef=null`；四安全标志 `true/false/false/false`。**这只是计划，没有分离、转换、混音、校验或保存任何音频。**

### 示例 B · CLEAN_VOCAL / VOCAL_ONLY（预期 PLANNED，3 stages，无分离、不造 INSTRUMENTAL）

```json
{
  "schemaVersion": 1,
  "sourceInput": {
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
  },
  "recipe": {
    "schemaVersion": 1,
    "sourceLayout": "CLEAN_VOCAL",
    "separationPreset": "NONE",
    "mixConfig": {
      "mode": "VOCAL_ONLY",
      "vocalGainDb": 0,
      "instrumentalGainDb": 0
    }
  },
  "capabilities": {
    "schemaVersion": 1,
    "separator": "UNKNOWN",
    "mixer": "AVAILABLE_FIXTURE"
  }
}
```

调用 `planFixtureCover(exampleB)` 预期 `PLANNED`：`stages` 恰 CONVERTING → MIXING → VERIFYING 三项，无 SEPARATING、无 INSTRUMENTAL 槽；即便 `capabilities.separator` 为 `UNKNOWN`，清唱布局也不消费 separator 值，只要 `mixer=AVAILABLE_FIXTURE` 即可规划。`sourceLayout` 是调用者的 Fixture 声明，不声称已实测“干净人声”。

### 示例 C · CLEAN_VOCAL + WITH_INSTRUMENTAL（预期 INSTRUMENTAL_MISSING）

```json
{
  "schemaVersion": 1,
  "sourceInput": {
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
  },
  "recipe": {
    "schemaVersion": 1,
    "sourceLayout": "CLEAN_VOCAL",
    "separationPreset": "NONE",
    "mixConfig": {
      "mode": "WITH_INSTRUMENTAL",
      "vocalGainDb": 0,
      "instrumentalGainDb": 0
    }
  },
  "capabilities": {
    "schemaVersion": 1,
    "separator": "UNKNOWN",
    "mixer": "UNAVAILABLE"
  }
}
```

```js
const result = planFixtureCover(exampleC)
result.ok                  // true
result.value.decision      // 'BLOCKED'
result.value.reason        // 'COVER_PLAN_INSTRUMENTAL_MISSING'
result.value.association   // null
result.value.recipe        // null
result.value.stages        // []
result.value.outputSlot    // null
result.value.dependencyReason // null
```

该例同时固定**路由先于能力可用性**：即使 `mixer=UNAVAILABLE`，也先返回 `INSTRUMENTAL_MISSING`，不会凭空造伴奏或静音伴奏。SOURCE_BLOCKED 的优先级更高（见测试）；有限行为用例另行固定。

## 8. 未来兼容边界（当前全部 OPEN，不在本模块实现）

| 责任 | 当前状态与未来要求 |
|---|---|
| 单主任务与父源不变 | catalog 仍唯一签发 taskId；原 birth/task.source 保持原歌曲/源 scope 与 voice 关联。分离后的 VOCAL 与旧 Provider sourceAudioRef 不同，未来必须显式做内部 stage→Provider 输入谱系适配并复用原校验，不能改父 task.source、放宽旧 v1 同源检查或另造第二主 Task。 |
| Cover 意图绑定/冲突 | 旧 catalog idempotency/identityHash 未包含 pitch、modelRevision、layout、separation 或 mix 配置，`EXISTING` 不证明 Cover 选项相同。未来须在正式契约绑定同 task 的规范配方/请求身份，精确重复与差配置显式冲突；UNKNOWN/CLAIMED 不换 ID 重试。本模块不造内容 hash 或把 JSON 当认证 cap。 |
| StageArtifact 与 slot | 当前只给 SOURCE/VOCAL/INSTRUMENTAL/CONVERTED_VOCAL/MASTER/VERIFIED_MASTER 计划槽和父 source/modelRev/scope 谱系需求。真实 StageArtifact 字段、ref 签发、rights/expiry、模型修订、字节来源、临时所有者、缓存复用/删除策略及新版本接口仍 OPEN。布局/caps/声明 audio 元数据都不是实测。 |
| 一次 claim→全阶段→一次最终保存 | 当前 owner.save 硬绑定唯一 bytes engine，提前跑 Cover 再调用 save 会再执行；原 run 一旦 FINAL 也不能伪装可续存。未来正式执行单元须在唯一 owner claim 里编排原 Fake 阶段并复用唯一 final writer/proof/JOINT，不加 caller executor/第二 writer 或提前 FINAL，不重复合成/入库。 |
| 各类 8 键不能混用 | 原 source audio 仅 4 声明字段；WAV inspection 19 为实测；公有 Artifact metadata 8 与私有 SaveProof.artifact 8 字段和含义不同；pack entry 另有原 schema。Gateway fake ref 不是物理 STORED，sourceRef 也不是已产 Master；不得为 Cover 给原 metadata/proof/pack 加字段或把非 STORED 交给已验保存 proof。 |
| 资源/取消/清理 | 原 readiness AVAILABLE 非资源租约，Task 队列/Artifact 队列非 GPU 调度器。未来局部 GPU 串行、CPU/远程独立，cancel 请求/确认/释放/临时清理各自有证；owner 目前无 cancel API，保存不可中断边界保持。阶段 UNKNOWN 不冒充失败自动重跑，不清理未知已产资产。本模块不宣称取消/资源释放/缓存清理已实现。 |
| 媒体预算与真实性 | 原 source 元数据可沿 50MiB/300000ms 边界，但现 synthetic owner 输出/库单项 1MiB 且总预算另定，不承诺完整歌曲适配。现 Fake bytes 是 SILENCE/EDGE_SEQUENCE，不是实际 RVC、分离或混音；不能制造静音 stem 后称已完成处理。 |
| 阶段归属 | 后续 Plan08 仍需实际 Fake Cover 阶段/StageArtifact 生命周期、资源取消、可信动态 Evidence 及完整 Fake Model/Audio/Relay 父 E2E；本 F-A 通过最多纯规划 OFFLINE，不关闭 P08-07 或父 08。Plan09 为 Fake 双页面配置，Plan10/12 真实 Provider/唱歌集成及 Plan13 鲸递、Plan14 真实安装发行按原所属阶段另行验收。 |

## 9. 不做与安全边界

- 不调用 engine、gateway simulator、producer、owner/save、import/writer/持久 store、文件/网络/进程/时钟/随机、设备、安装、媒体转换或发送。
- 不签发主 TaskId、不创建/执行 Task、不登记资产、不写盘、不缓存、不重试、不回滚。
- 不把 `SOURCE_LINKED` 或 `capabilities` 声明升级为真实 READY；`taskAuthority` 恒 `UNVERIFIED`，`outputArtifactRef` 恒 `null`。
- 结果为纯规划元数据，随时可重新计算；不构成微信发送、真实生成、版权或投递证据。
