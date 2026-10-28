# TASK_FIXTURE_RUNNER_OFFLINE — 源关联、准入与单次RVC任务归属（Plan 08-C）

状态：**OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED**。本模块 `core/audio/task-fixture-runner.mjs` 把一个同步纯调用组合为：08-B 源关联 → 06-D 安装/资源 Fixture 准入 → 至多一次既有 RVC Fake → 旧 AudioTask v1 动作归约与安全投影。成功只到旧 Task 的 `ARTIFACT_READY`（Fake 引用就绪），**不 MARK_SAVED、不建成品 Artifact 库、不创建 Relay 候选、不发送**。

普通用户本轮没有新增可用功能，也没有新增可点击按钮或 Host 端点。TTS 没有模拟合成器，保持受控的 `UNSUPPORTED_DISPATCH` 未实现状态。

## 1. 公开面

模块恰好三个导出：

| 导出 | 说明 |
|---|---|
| `TASK_FIXTURE_SCHEMA_VERSION` | 固定 `1` |
| `TASK_FIXTURE_ERRORS` | 14 个固定错误/原因码，每个值为 `TASK_FIXTURE_` 加键名 |
| `runFixtureAudioTaskOnce(input)` | 唯一同步纯组合入口 |

不读时钟、不用随机数、不做 I/O/网络、不启进程、不创建队列/持久任务或跨调用状态。整根先调用一次共享 `copyFixtureInput`，所有输出用 `deepFreezeFixtureValue` 冻结。

## 2. 输入契约

根恰 4 键，全部必填：

```text
{schemaVersion:1, sourceInput:<08-B原四键输入>,
 readiness:<06-D原readiness观察>, context:<TTS为null，SVC为三键>}
```

- `sourceInput`：08-B 的 `{schemaVersion, voiceBinding, artifactLibrary, sourceRevision}`，其 `voiceBinding` 仍是 08-A 原六键。
- `readiness`：06-D 的两键 `{schemaVersion:1, instances:[...]}`；每个观察恰 `instanceId / installation / resources{profile,cpu,gpu}`，交给旧 `negotiateReadyFixtureProvider` 全文校验。
- `context`：TTS（`feature=voice-bubbles`）必须严格 `null`；SVC（`feature=singing`）恰 `{requestId, endpointId, scenario}`，`requestId` 匹配 `/^request:fixture-[A-Za-z0-9_-]{1,32}$/`、`endpointId="gateway:fixture-rvc"`、`scenario` 来自原 `RVC_FAKE_SCENARIOS`。

本模块不接受第二份 negotiation/draft/now/taskId、已验 source/ready/view 或现成 Task record；所有 06-D 调用只取同一 `sourceInput.voiceBinding.negotiation`，Task draft 只取同一 `taskDraft`，`observedAt` 只取同一 `now`。

## 3. 执行顺序

1. 整根安全复制；根类型 → 未知键 → 缺键/字段数 → schema。
2. 对同一副本 `sourceInput` 实际调用 `resolveFixtureTaskSource` 一次；合法 `ok:false` → `SOURCE_INPUT_INVALID/sourceInput`；异常/非法返回 → `DEPENDENCY_FAILURE/$`。
3. 按源结果 `voiceBinding.feature` 校验 `context` 变体；不合法 → `INVALID_CONTEXT/context`（源业务 BLOCKED 也不掩盖坏 context）。
4. 实际调用 `negotiateReadyFixtureProvider` 一次（纯前置准入，全文验证观察表）；合法 `ok:false` → `READINESS_INVALID/readiness`；异常/非法返回 → `DEPENDENCY_FAILURE/$`。
5. 源合法 BLOCKED：新 phase=BLOCKED、reason=`TASK_FIXTURE_SOURCE_BLOCKED`，`task=null`、`states=[]`、`execution=null`，中文取源 `messageZh`；不创建 Task、不派发。
6. 源 LINKED：先实际 `createAudioTaskRecord(同一原draft,{observedAt:同一now})`；拒绝 → `TASK_CREATION_REJECTED/$`。初始记录必须严格 `CREATED`、无输出、delivery `NOT_REQUESTED/null`，`states` 首项取真实记录 state。
7. 门禁合法 BLOCKED：phase=BLOCKED、reason=`TASK_FIXTURE_READINESS_BLOCKED`，保留 CREATED 投影与 `states=['CREATED']`，`execution=null`，不 BEGIN/不模拟。
8. TTS 且门禁 READY：phase=BLOCKED、reason=旧 `PROVIDER_DISPATCH_ERRORS.UNSUPPORTED_DISPATCH`（`PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH`），固定中文“该实例的演示执行尚未实现；可以查看能力说明或稍后再说。”；Task 仍 CREATED，`execution=null`，不调用任何 dispatcher。
9. 仅源 LINKED、门禁 READY、SVC：调用旧 `dispatchReadyRvcFakeOnce` **一次**；`ok:false` → `DISPATCH_REJECTED/$`，异常/非法 → `DEPENDENCY_FAILURE/$`。合法 BLOCKED 保留 CREATED，phase=BLOCKED、reason=`TASK_FIXTURE_DISPATCH_BLOCKED`，完整保留旧 execution 与中文。
10. 旧 execution.phase=SIMULATED：用原 `validateRvcFakeResult(result, 同一request, 同一context)` 复验；拒绝 → `INVALID_TASK_RESULT/$`。随后做本层输出归属检查（见第 4 节）。通过后按第 5 节用旧 `transitionAudioTask` 逐步归约，最终 `validateAudioTaskRecord` 再校验并 `projectAudioTask` 输出。

纯 readiness 前置与旧 dispatch 内部重核会重复纯协商计算，不等于重复模拟；唯一 Fake 调用仍归旧 06-D → 06-C 链。本入口是“同次纯模拟结果到 Task 状态的归约”，不是运行中进程时间线。

## 4. 输出归属门禁

旧 RVC Fake 对 `SUCCEEDED_FAKE` 生成的输出引用是 `artifact:fixture-output-<requestId后缀>`。本层在结果复验之后额外检查：

- 若 `result.status === "SUCCEEDED_FAKE"` 且 `result.artifactRef === task.source.ref`，固定返回 `INVALID_TASK_RESULT/$`；
- 不输出 execution、不归约 Task、不再次模拟、不回显源引用。

这是为了防止把任务输入引用与 Fake 输出引用混同、伪造“已有产物”；不修改旧 Fake 算法，也不预判复制其引用生成逻辑。其他合法结果完整保留原 15 字段 execution（含 Fake 输出 artifactRef 用于归属核验）。

## 5. 七场景到旧 Task 的唯一映射

七个场景均以可用模型 A 构造；模型 B 属于源/08-A/06-B 前置阻断，不是 `MODEL_MISSING` 模拟场景。

| scenario → result.status | 从 CREATED 起的旧动作 | 最终 state / 输出 |
|---|---|---|
| SUCCESS → SUCCEEDED_FAKE | BEGIN_PROCESS → ATTACH_FAKE_ARTIFACT | ARTIFACT_READY，hasOutput=true；不 MARK_SAVED |
| OFFLINE → OFFLINE | BEGIN_PROCESS → FAIL(AUDIO_FAKE_FAILURE) | FAILED，无输出；原 RVC_FAKE_OFFLINE 保留 execution |
| MODEL_MISSING → MODEL_NOT_AVAILABLE | BEGIN_PROCESS → FAIL(AUDIO_FAKE_FAILURE) | FAILED，无输出；原模型错误保留 |
| TIMEOUT → TIMEOUT | BEGIN_PROCESS → MARK_UNKNOWN | UNKNOWN，无输出/重试 |
| CANCEL_REQUESTED → CANCEL_REQUESTED | BEGIN_PROCESS → REQUEST_CANCEL | CANCEL_REQUESTED，requested=true/confirmed=false |
| CANCEL_CONFIRMED → CANCELLED_FAKE | BEGIN_PROCESS → REQUEST_CANCEL → CONFIRM_CANCEL | CANCELLED，requested/confirmed=true；仅模拟确认 |
| UNKNOWN → UNKNOWN | BEGIN_PROCESS → MARK_UNKNOWN | UNKNOWN，无输出/重试 |

Task FAIL 只认 `AUDIO_FAKE_FAILURE`，不把 `RVC_FAKE_*` 码塞进 Task.lastError。所有 Task delivery 始终 `{state:"NOT_REQUESTED", deliveryId:null}`；`deliveryRequested=true` 只是旧意图，不调用 Relay。`states` 是从真实 create/transition 返回值记录的状态数组（最多 4 项），Task 投影 state 必须等于 `states` 末项。

## 6. 输出与固定中文

成功/合法阻断的 value 恰 13 键：

```text
{ok:true,value:{schemaVersion:1,phase,reason,messageZh,
 sourceCheck,readiness,execution,task,states,
 mockOnly:true,realOperationAllowed:false,submitAllowed:false,automaticRetryAllowed:false}}
```

- `phase` 仅 `BLOCKED` / `SIMULATED`；`sourceCheck` 为本次 08-B 安全 value，`readiness` 为本次纯准入安全 value，`execution` 为旧 06-D 完整安全 value 或 `null`。
- `task` 仅旧 `projectAudioTask` 的安全投影或 `null`；不返回完整 Task record，不输出源引用/正文/原库/原请求/manifest。
- `SIMULATED` 时 `reason` 严格复用已复验 `result.code`（成功 null，其余原受控 RVC 码），`messageZh` 复用旧 execution 中文。

| 结果 | 固定 messageZh |
|---|---|
| SIMULATED | 复用旧 execution.messageZh |
| SOURCE_BLOCKED | 复用源 messageZh |
| READINESS_BLOCKED | 复用门禁 messageZh |
| DISPATCH_BLOCKED | 复用旧 dispatch messageZh |
| TTS UNSUPPORTED_DISPATCH | 该实例的演示执行尚未实现；可以查看能力说明或稍后再说。 |

Task 旧中文（例如 ARTIFACT_READY 的“演示音频已经生成，等待保存”）仍是原状态文案；外层成功说明保留“无真实音频、不能保存/发送”的边界，不改旧模块文案。

## 7. RVC完整示例

以下为**完整四键原始输入**，可直接 `JSON.parse` 后原样传给 `runFixtureAudioTaskOnce`（sourceInput 四键、voiceBinding 六键、实例 registry、观察表、context 全部展开，无省略或占位）：

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
  "readiness": {
    "schemaVersion": 1,
    "instances": [
      {
        "instanceId": "instance:rvc",
        "installation": "PRESENT",
        "resources": {
          "profile": "CPU_FIXTURE",
          "cpu": "AVAILABLE",
          "gpu": "AVAILABLE"
        }
      }
    ]
  },
  "context": {
    "requestId": "request:fixture-1",
    "endpointId": "gateway:fixture-rvc",
    "scenario": "SUCCESS"
  }
}
```

该虚构示例实际返回 `ok:true`、`phase:"SIMULATED"`、`reason:null`、`states:["CREATED","PROCESSING","ARTIFACT_READY"]`，Task 投影 `state:"ARTIFACT_READY"`、`hasOutput:true`；不 MARK_SAVED、不投递。

## 8. TTS阻断示例

以下为**完整四键原始输入**（`context` 严格 `null`）：

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
  },
  "readiness": {
    "schemaVersion": 1,
    "instances": [
      {
        "instanceId": "instance:qwen",
        "installation": "PRESENT",
        "resources": {
          "profile": "TTS_MANIFEST",
          "cpu": "AVAILABLE",
          "gpu": "AVAILABLE"
        }
      }
    ]
  },
  "context": null
}
```

该虚构示例实际返回 `phase:"BLOCKED"`、`reason:"PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH"`、`states:["CREATED"]`、Task `state:"CREATED"`、`execution:null`；不调用任何 TTS 合成或 RVC dispatcher。

## 9. 错误协议

14 个新码（结构/依赖 11 + 业务 3），值均为 `TASK_FIXTURE_` 加键名：

- 结构/依赖：`INVALID_INPUT`、`RESOURCE_LIMIT`、`UNSUPPORTED_VERSION`、`SOURCE_INPUT_INVALID`、`READINESS_INVALID`、`INVALID_CONTEXT`、`DEPENDENCY_FAILURE`、`TASK_CREATION_REJECTED`、`DISPATCH_REJECTED`、`TASK_TRANSITION_REJECTED`、`INVALID_TASK_RESULT`；
- 业务：`SOURCE_BLOCKED`、`READINESS_BLOCKED`、`DISPATCH_BLOCKED`。

另允许第 3/4 节明确的旧 `PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH` 与已复验 RVC `result.code` 作为业务 reason，不加入新枚举。

结构失败恰 `{ok:false, errors:[{code,path,reason}]}`，path 仅 `$`、`schemaVersion`、`sourceInput`、`readiness`、`context`、`<unknown-key>`；未知键不回显键名，异常/上游 errors 不转发。

## 10. 隐私、重复调用与边界

- 不输出源引用/正文、原库、原请求或 manifest；错误也不回显秘密标记/堆栈。
- 纯输入多次显式调用可以再次模拟；固定输出引用不证明全局唯一或持久幂等。
- `UNKNOWN` 的“无自动重试”只指本次入口内无重试/恢复循环；本模块没有跨调用历史，不能当恢复旧 UNKNOWN 任务或产品重试按钮。
- 不实现真实媒体/模型/GPU、字节解码/codec/peak/hash、保存删除、持久 Task/ID 分配/幂等/队列/恢复、并发资源运行、Cover/混音/Relay 或 GUI；静态纯模拟不冒充完整真实流水线。

## 11. 未来界面故事板（尚未实现，本轮没有新增可点击按钮）

语音气泡/唱歌 → 选择源与共享角色 → 选择已支持实例 → 查看演示任务状态（CREATED / PROCESSING / ARTIFACT_READY / FAILED / UNKNOWN / 取消请求与确认）。普通用户看不到本模块的研发入口。

至少三类失败恢复：

| 场景 | 用户看到 | 正确恢复 |
|---|---|---|
| 源不一致 | 演示任务源与请求不一致，请重新选择；系统不会自动替换。 | 重新选择源，不自动改正文/元数据 |
| 资源未知/不足 | 演示资源状态未知/不可用，请重新检查或稍后再说。 | 检查或选择明确支持的方案；不自动换引擎/改 CPU/GPU |
| TIMEOUT / UNKNOWN | 结果未知，需要人工确认；不会自动重发。 | 人工核查；取消请求与模拟确认分别展示；不标保存/发送成功 |

研发命令不是普通用户正常流程。

## 12. 测试与证据

行为测试位于 `test/task-fixture-runner.test.mjs`，覆盖 C01–C20 场景组与边界（七场景、源/准入/context 阻断、模型 B、TTS 未实现、输出归属碰撞、Task 动作与投影、错误协议、getter/Proxy、fresh/deep-frozen、文档两个完整 JSON 原样正负执行等）。测试全部使用虚构数据，不触发真实发送、设备或生产配置。

实际执行命令与计数记录在 Plan08-C 交付报告及 CI 中；本文档不预填未经执行的通过数。

## 13. 父阶段

父 Plan08 仍 IN_PROGRESS。本次只补“源 → 准入 → 单次 Fake → Task 归属”组合子集；真实字节/成品保存删除、持久 ID/幂等/队列/恢复、资源运行、Cover/混音、动态依赖/完整 Fake E2E/Relay/GUI 仍缺。合入 main 也不等于父阶段 DONE 或功能 INTEGRATED。
