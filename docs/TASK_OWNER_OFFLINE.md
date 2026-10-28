# Plan08-D-C · 隔离任务持久认领与单次模拟执行（内部文档）

状态：**OFFLINE** / **FIXTURE_ONLY** / **NOT_INTEGRATED**。本文件面向研发/审核，不是普通用户文档；它不代表已接入 Host、GUI、真实模型/音频/设备/投递或跨进程恢复。

## 1. 目的与范围

08-D-B 的 existing 入口是同步单次模拟：同一初始 record 反复调用仍可能再次 Fake。08-D-C 增加**同一 Node 进程、同一 trusted sandbox capability**内的持久 owner：

- 原 catalog 仍是唯一 TaskId 签发者和出生登记（v1 文件不迁移、不加 claim）；
- 新 owner 以出生登记为不可变证据，先原子写 `CLAIMED`，再调用原 existing engine **至多一次**，再原子保存 `FINAL` 完整 record；
- 重复 `run` / `get` 只读既有结论；已确认 claim 而没有可信 FINAL 时是**不可释放墓碑**，公开 `ownerState=UNKNOWN`。

不是第二套文件安全实现：fd 有界读、短写、fsync、临时回读、rename 后身份/内容确认、一次性清理资格与共享未知锁都在 `core/audio/fixture-task-store-internal.mjs`，catalog 与 owner 共用。

## 2. 前置：catalog 出生登记

先用 `openFixtureTaskCatalog({sandbox}).reserve(...)` 取得真实 TaskId（见第 7 节）。owner 不接受 caller.record、不从公开投影重建 record，也不再次签发 TaskId。

## 3. 新 owner API

恰好三个公开导出：

```text
TASK_OWNER_SCHEMA_VERSION = 1
TASK_OWNER_ERRORS
openFixtureTaskOwner({ sandbox })   // 只打开/验证，不创建空文件、不执行
```

成功 handle 恰 `run`、`get` 两个 async 方法（冻结）。`run` 根恰四键 `{schemaVersion, scopeId, taskId, input}`；`get` 根恰三键。成功信封根恰 `{ok, value}`，value 恰 11 键：

```text
schemaVersion, outcome, revision, ownerState, reason, task,
userMessageZh, mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed
```

- `outcome`：`RECORDED`（首次可信最终提交）/ `EXISTING`（重复 run 只读）/ `FOUND`（get）；
- `ownerState`：`SIMULATED` / `NO_EXECUTION` / `UNKNOWN`；
- `reason`：SIMULATED 固定 `null`；NO_EXECUTION 恰为 `TASK_FIXTURE_SOURCE_BLOCKED`、`TASK_FIXTURE_READINESS_BLOCKED`、`TASK_FIXTURE_DISPATCH_BLOCKED`、`PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH` 之一；由 CLAIMED 派生的 UNKNOWN 固定 `TASK_OWNER_EXECUTION_UNKNOWN`；
- `task` 只用原 `projectAudioTask` 白名单投影，`mockOnly=true`、三个真实操作标志全 false；
- 14 个固定错误码（`TASK_OWNER_` 前缀）：INVALID_INPUT、RESOURCE_LIMIT、UNSUPPORTED_VERSION、SANDBOX_INVALID、NOT_FOUND、BIRTH_INVALID、STORE_INVALID、STORE_CHANGED、WRITE_REJECTED、WRITE_UNKNOWN、OWNER_UNKNOWN、EXECUTION_UNKNOWN、DEPENDENCY_FAILURE、INTERNAL_FAILURE。

## 4. 持久快照

root 内唯一新文件 `audio-task-owner-v1.json`（UTF-8、无 BOM、≤128 KiB、≤32 条）。根恰 `{schemaVersion:1, revision, entries}`；entry 恰 `{scopeId, taskId, birthIdentityHash, phase, record, completion}`。

- `CLAIMED`：record = 原完整初始出生 record，completion = null；
- `FINAL`：record 通过原 `validateAudioTaskRecord` 且不可变字段与出生一致；completion 恰 `{kind, reason}`，SIMULATED 的 reason 必须 null、NO_EXECUTION 的 reason 必须四个固定值之一；
- `revision` = 各 CLAIMED 权重 1 / FINAL 权重 2 之和；新 claim +1，最终提交再 +1；重复/get 不写。

## 5. 单次尝试与三种 UNKNOWN

| 情形 | 处理 |
|---|---|
| claim 写入 rename 前失败且可确认未提交 | `WRITE_REJECTED`，engine 0；后续明确新 run 可重新走完整检查 |
| claim 写入 rename 已尝试但未确认 | `WRITE_UNKNOWN`，共享锁闭，engine 0 |
| claim 已确认，engine 抛错/坏协议/record=null | 保持 CLAIMED 墓碑，返回 ownerState UNKNOWN，不重跑 |
| claim 已确认，最终提交 rename 前失败 | 保持 CLAIMED 墓碑，返回 ownerState UNKNOWN |
| 最终提交 rename 已尝试但未确认 | `WRITE_UNKNOWN` + 共享锁，其他任务也不得绕过 |
| engine 合法 Task UNKNOWN | 原样保存 Task UNKNOWN，与 owner/存储 UNKNOWN 分开，不重试 |

## 6. 限制

同进程、同 capability 内有效；不跨进程、不掉电恢复、不迁移用户历史目录、不接 Host/GUI/Relay、不生成 deliveryId、不真实生成/保存/发送。新进程无法恢复旧 cap。

## 7. 前置reserve示例

以下为完整 `reserve` 输入（研发调用，不是普通用户流程）：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "idempotencyKey": "key:fixture-doc-svc",
  "draft": {
    "schemaVersion": 1,
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
  "observedAt": "2026-10-27T00:00:00.000Z"
}
```

`reserve` 返回的 `value.task.taskId` 就是下面示例中的 TaskId 占位符 `task:fixture-c71d0000000000000000000000000000`（第二例为 `task:fixture-c71d0000000000000000000000000001`）需要替换的真实值；调用方需把同一 TaskId 同时写入 `taskId` 与 `input.sourceInput.voiceBinding.taskDraft.taskId`。

## 8. 成功执行示例

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-c71d0000000000000000000000000000",
  "input": {
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
          "taskId": "task:fixture-c71d0000000000000000000000000000",
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
}
```

实际返回 `outcome=RECORDED`、`ownerState=SIMULATED`、`reason=null`、`revision=2`，Task 投影 `state=ARTIFACT_READY`；不 MARK_SAVED、不投递。

## 9. 权利阻断示例（NO_EXECUTION）

同一出生形态但权利未确认：catalog 出生 record 为 `BLOCKED_RIGHTS`，owner 保存 `NO_EXECUTION` 且 Fake 0：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-c71d0000000000000000000000000001",
  "input": {
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
              "rightsState": "UNVERIFIED",
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
              "rightsState": "UNVERIFIED",
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
          "taskId": "task:fixture-c71d0000000000000000000000000001",
          "feature": "singing",
          "taskType": "SVC",
          "source": {
            "kind": "AUDIO_REF",
            "ref": "artifact:fixture-source-1"
          },
          "voiceProfileId": "voice:demo-hero",
          "deliveryRequested": false,
          "rights": {
            "state": "UNVERIFIED"
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
              "state": "UNVERIFIED"
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
}
```

## 10. 读取示例

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-c71d0000000000000000000000000000"
}
```

返回 `outcome=FOUND`、`ownerState` 与 reason 按已保存结论；尚未认领的出生任务返回 `NOT_FOUND`，不创建 owner 文件。

## 11. 中文故事板与三恢复（尚未实现 GUI）

未来正常流程：从任务列表打开原任务 → 检查素材与依赖 → 明确开始 → 显示同一任务进度/结果 → 重复打开只读结论。三恢复文案（本轮未接 GUI）：

- 本次未执行（TTS/权利/资源阻断）：“本次演示没有真实执行；任务保持原状态，系统不会自动重试。”
- 执行结果未知（已认领但无可信最终结果）：“无法确认这次演示是否完成；系统不会自动重跑，请人工核对。”
- 存储待核（WRITE_UNKNOWN/损坏）：“本地演示记录暂时无法核对；不要手动改文件或删锁，请联系维护者。”

三者都不提供手改 JSON、删锁或复制文件作为普通用户路径。

## 12. 测试与证据

`test/task-owner.test.mjs` 覆盖 C01–C08 与本文两个示例；原 catalog 45、D-B 28、旧 runner 20 专项保持。测试使用真实临时 sandbox 与实际文件字节，注入仅存在于测试文件内的独立 worker（engine/fs 故障），产品无注入接口。本文档不预填未执行的通过数。
