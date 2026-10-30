# Whale Voice · 同一 claim 内的任务保存事务契约（候审）v1.2

> **状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
> 候审技术契约，不是已实现功能，不构成运行时代码授权。现有 owner 仍只有 `run`/`get`
> （`SIMULATED`/`NO_EXECUTION`），库仍只有 `FIXTURE_IMPORT`；**没有任务保存能力**。
>
> 基准 `main` **M `08cf0b61acc402d619618df2ad15bce5436b0873`**；`文件:行` 以 M 为准。
> v1.2 按 072 修订 R1–R3 余项；070/071 已过方向与 0066/0067 原文保留。

---

## 1. R1：关键源码定位校准（以 M 为准）

### 1.1 engine（`core/audio/task-fixture-engine-internal.mjs`）

| 事实 | 真实行 |
|---|---|
| bytes 入口导出 `runExistingFixtureTaskBytesOnce` | **`:994`** |
| 旧 existing 入口 `runExistingFixtureTaskOnce` | **`:971`** |
| 旧 draft 入口 `runDraftFixtureTaskOnce` | `:831` |
| 真实 producer 调用 `produceFixtureWav` | **`:755`** |
| `BEGIN_PROCESS` 动作 | **`:761`** |
| `PROCESSING` 三键返回 `bytesResult(...)` | **`:769-782`** |
| 旧 ATTACH 分支（bytes 模式不走） | `:784` 起 |
| 旧 14 码 / 三 bytes 码 | `:56-58` / `:100-104` |

### 1.2 库 writer（`core/audio/fixture-artifact-store-internal.mjs`）

| 事实 | 真实行 |
|---|---|
| `fsyncSync` | **`:715`** |
| 最后 temp 门禁（身份/字节/摘要/规范解析） | **`:800-838`** |
| 唯一 `renameSync` | **`:845`** |
| post-rename 读回/身份/字节/Schema 确认 | **`:851-873`** |
| `:889` 实际是 `INTERNAL_FAILURE`，**不是** rename 未知 | `:889` |

### 1.3 Task writer（`core/audio/fixture-task-store-internal.mjs`）——与库分开

| 事实 | 真实行 |
|---|---|
| `fsyncSync` | **`:803`** |
| current/pre-rename 关联门禁 | **`:869-885`** |
| 唯一 `renameSync` | **`:889`** |
| post-rename 读回/revision/关联确认 | **`:895-918`** |
| owner entry/pre-commit 外改读取 | `:734-736`（`STORE_CHANGED`+锁） |
| 关联校验失败 | `:574-581`（Task 域锁） |
| 库 fresh 外改 | `artifact-store:569-571`（Artifact 域锁） |

两文件检查点不得共用裸行号；测试注入点按 §12 分别标注。

---

## 2. 现状事实（保留已核正项）

- 固定文件 `audio-task-owner-v1.json`（`:29`）、`MAX_OWNER_BYTES=128 KiB`/`MAX_OWNER_ENTRIES=32`（`:31-33`）；
  `TASK_ID_PATTERN ^task:fixture-[0-9a-f]{32}$`（`:45`）。
- revision = `1×CLAIMED + 2×FINAL`（`:462-524`）。
- 快照版本不匹配 → `STORE_INVALID`（`:457`）。
- 库常量在 `fixture-artifact-store-internal:40-46`；import 七键（`artifact-library:102`）；
  proof 正则后缀 `{1,128}` 且总长 ≤128（实际 ≤113），时钟规范 `.sssZ`（`:109,276-282,306`）。
- `metadataOf` 无 `identityHash`（`:361-371`）；`identityHash` 只能由 `artifactIdentityHash` 重算。
- Task 域锁覆盖 catalog+owner；Artifact 域独立。

---

## 3. 唯一候选方案

同一 claim 内：一次 bytes 引擎 → 一次库 import（持 Artifact 队列、非重入）→ `ATTACH_FAKE_ARTIFACT`
→ `MARK_SAVED` → 带强制 proof 的严格 `FINAL(SAVED)` → 联合确认。

合法非 SUCCESS/阻断按旧 owner 结论写 `SIMULATED`/`NO_EXECUTION` FINAL，不 import、不报未知。

---

## 4. 四方法协议（完整、无“沿用/按阶段/视锁”）

### 4.1 规则总则

1. **错误 envelope**：`{ok:false, errors:[{code,path,reason}]}`，单错、深冻结、零回显输入。
2. **ok:true 历史/未知投影**：`{ok:true, value:{schemaVersion, outcome, revision, ownerState, reason, task, userMessageZh, mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed}}`；
   `ownerState ∈ {SIMULATED, NO_EXECUTION, SAVED, UNKNOWN}`，`task` 为 §4.4 的 14 字段投影。
3. 所有方法共享 `schemaVersion=1` 请求版本；存储版本另计。
4. 输入/schema/rights/锁/存储损坏一律 envelope；合法“没有/未完成”一律 ok:true 投影。

### 4.2 `run`（旧方法，行为扩展仅限 SAVED 分流）

| 状态 | 返回 |
|---|---|
| 无出生 / owner 无 entry | `TASK_OWNER_NOT_FOUND` envelope |
| 出生损坏/关联坏 | `TASK_OWNER_BIRTH_INVALID` envelope（Task 域锁） |
| CLAIMED | `ok:true`，`outcome='EXISTING'`，`ownerState='UNKNOWN'`，`task` 为 CLAIMED 投影，`reason=TASK_OWNER_EXECUTION_UNKNOWN` |
| FINAL `SIMULATED` | `ok:true`，`EXISTING`，`ownerState='SIMULATED'` |
| FINAL `NO_EXECUTION` | `ok:true`，`EXISTING`，`ownerState='NO_EXECUTION'`，`reason` 原值 |
| FINAL `SAVED` | `ok:true`，`EXISTING`，`ownerState='SAVED'`，`task` SAVED 投影 |
| Task 域锁 | `TASK_OWNER_OWNER_UNKNOWN` envelope |
| 新 run（无 entry） | 现有 claim→engine→FINAL 流程不变；仅当新 SAVED 才走 save 路径 |

### 4.3 `get` / `artifactStatus`

`get`：无 birth/entry → `NOT_FOUND`；其余状态同 `run` 的投影（不执行 engine）。
`artifactStatus`（只读，五键 `{schemaVersion,scopeId,taskId,now,rights}`）：

| 状态 | 返回 |
|---|---|
| 无 owner entry，或 FINAL 为 `SIMULATED`/`NO_EXECUTION` | `ok:true`，`state='MISSING'`，无 artifact |
| CLAIMED（未完成） | `ok:true`，`state='UNKNOWN'`，`ownerState='UNKNOWN'` |
| FINAL `SAVED` + 库 `STORED` + 未过期 + 当前 rights GRANTED/proof 匹配 | `ok:true`，`state='READABLE'`，含 `artifactRef/byteLength/sha256/expiresAt` |
| FINAL `SAVED` + 库 `DELETED` | `ok:true`，`state='DELETED'` |
| FINAL `SAVED` + `now >= expiresAt` | `ok:true`，`state='EXPIRED'` |
| FINAL `SAVED` + 当前 rights `DENIED`/`UNKNOWN`/proof 不符 | `ok:true`，`state='RIGHTS_REJECTED'` |
| 库锁 / `STORE_CHANGED` | `TASK_OWNER_OWNER_UNKNOWN` envelope（Artifact 域锁时） |

`get` 无 `now`，只回答历史；`artifactStatus` 不伪造当前可读，也不回退历史 SAVED。

### 4.4 Task 公开投影（与 M 完全一致，14 字段）

`schemaVersion, taskId, feature, taskType, state, voiceProfileId, hasInput, hasOutput,
cancelRequested, cancelConfirmed, deliveryRequested, mockOnly, realOperationAllowed, userMessageZh`
（`task-contract.mjs:950-975`）；`userMessageZh` 固定为状态文案 + 演示后缀，不新增公开字段。

### 4.5 `save` 输入（八键）

`{schemaVersion, scopeId, taskId, requestKey, now, expiresAt, rights, input}`；`input` 与
`run.input` 完全同构（`{schemaVersion,sourceInput,readiness,context}`），两分区 copy 与原边界校验，
不得默认 READY/模型/场景/授权。

### 4.6 `save` 结果

| 情况 | 返回 |
|---|---|
| 本次成功 | `ok:true`，`outcome='SAVED'`，`ownerState='SAVED'`，`revision` 按权重，`task` SAVED 投影，`artifact` 四字段 |
| 已 FINAL `SAVED` | `ok:true`，`outcome='EXISTING'`，`ownerState='SAVED'` |
| 合法非 SUCCESS | `ok:true`，`outcome='SIMULATED'`，`ownerState='SIMULATED'`，无 artifact |
| 合法阻断 | `ok:true`，`outcome='NO_EXECUTION'`，`ownerState='NO_EXECUTION'`，`reason` 原值 |
| CLAIMED 已存在 | `ok:false`，`TASK_OWNER_SAVE_UNKNOWN` |
| 输入/权利/过期/前置 | 对应 §4.7 码 |

### 4.7 错误表（最终 8 码 + 继承码）

| key | 最终 code | path | 固定 reason | 优先级 |
|---|---|---|---|---|
| `INPUT_INVALID` | `TASK_OWNER_SAVE_INPUT_INVALID` | 具体键/`$` | `save input invalid` | 1 |
| `RIGHTS_REJECTED` | `TASK_OWNER_SAVE_RIGHTS_REJECTED` | `rights` | `save rights rejected` | 2 |
| `EXPIRED_REQUEST` | `TASK_OWNER_SAVE_EXPIRED_REQUEST` | `expiresAt` | `save request expired` | 3 |
| `PRECONDITION` | `TASK_OWNER_SAVE_PRECONDITION` | `$` | `save precondition failed` | 4 |
| `ARTIFACT_REJECTED` | `TASK_OWNER_SAVE_ARTIFACT_REJECTED` | `$` | `artifact import rejected` | 5 |
| `ARTIFACT_UNKNOWN` | `TASK_OWNER_SAVE_ARTIFACT_UNKNOWN` | `$` | `artifact import unknown` | 6 |
| `TASK_REJECTED` | `TASK_OWNER_SAVE_TASK_REJECTED` | `$` | `task attach or save rejected` | 7 |
| `UNKNOWN` | `TASK_OWNER_SAVE_UNKNOWN` | `$` | `save outcome unknown` | 8 |

继承（不新增码）：`TASK_OWNER_SANDBOX_INVALID/INVALID_INPUT/NOT_FOUND/BIRTH_INVALID/STORE_INVALID/
STORE_CHANGED/WRITE_REJECTED/WRITE_UNKNOWN/OWNER_UNKNOWN/EXECUTION_UNKNOWN/DEPENDENCY_FAILURE/
INTERNAL_FAILURE/RESOURCE_LIMIT/UNSUPPORTED_VERSION`；旧 14 码总量不变。

---

## 5. 存储 schema、revision 与兼容

- entry 仍六键；`completion.kind` 增加 `SAVED`（`reason=null`）；`record.state='SAVED'`、
  `outputArtifactRef` 为真实库 ref、`delivery.state='NOT_REQUESTED'`、`deliveryId=null`。
- revision = `1×CLAIMED + 2×FINAL`；首次写 SAVED 升快照 v2，保留旧 entry/墓碑，revision 重算。
- 兼容矩阵（v1 空/CLAIMED/两种 FINAL、v2 SAVED/混合、未知版本、外改、超预算）按 071 已定；
  旧二进制读 v2 → `STORE_INVALID`；新代码只读打开不写盘；升级后旧 run 追加任务必须继续 v2。

### 5.1 完整示例（同一 fixture，字段一致）

**save 请求（八键，完整 input）**

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
  "requestKey": "save:fixture-demo-1",
  "now": "2026-10-30T23:00:00.000Z",
  "expiresAt": "2026-10-31T00:00:00.000Z",
  "rights": {
    "state": "GRANTED",
    "proofRef": "fixture-rights:demo-1"
  },
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
          "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
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

**SAVED Task record（16 键）**

```json
{
  "schemaVersion": 1,
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
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
  },
  "state": "SAVED",
  "outputArtifactRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
  "cancel": {
    "requested": false,
    "confirmed": false
  },
  "delivery": {
    "state": "NOT_REQUESTED",
    "deliveryId": null
  },
  "lastError": null,
  "observedAt": "2026-10-27T00:00:00.000Z",
  "mockOnly": true,
  "realOperationAllowed": false
}
```

**SAVED entry（六键）**

```json
{
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
  "birthIdentityHash": "41932dbe77a714314869e225b62f9650271eb78914e920a295259da23c4a000e",
  "phase": "FINAL",
  "record": {
    "schemaVersion": 1,
    "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
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
    },
    "state": "SAVED",
    "outputArtifactRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
    "cancel": {
      "requested": false,
      "confirmed": false
    },
    "delivery": {
      "state": "NOT_REQUESTED",
      "deliveryId": null
    },
    "lastError": null,
    "observedAt": "2026-10-27T00:00:00.000Z",
    "mockOnly": true,
    "realOperationAllowed": false
  },
  "completion": {
    "kind": "SAVED",
    "reason": null
  }
}
```

**私有 SaveProof**

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
  "birthIdentityHash": "41932dbe77a714314869e225b62f9650271eb78914e920a295259da23c4a000e",
  "birthObservedAt": "2026-10-27T00:00:00.000Z",
  "claimDigest": "b14580c96e5ab9d192c08abdc7f43efe5a88187ee95a6fe7a3ac81fdfe025edd",
  "claimRevision": 1,
  "recordIdentityHash": "41932dbe77a714314869e225b62f9650271eb78914e920a295259da23c4a000e",
  "artifact": {
    "artifactRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
    "identityHash": "34fec9402eec2356045f58366b039eaea1192c45c6178de8fea16401a8a5cbb4",
    "byteSha256": "3fa20276d8a4131431490ed129d0b05fafa4e9c82d4339b5cf635512103d6615",
    "byteLength": 88244,
    "expiresAt": "2026-10-31T00:00:00.000Z",
    "requestKey": "save:fixture-demo-1",
    "rights": {
      "state": "GRANTED",
      "proofRef": "fixture-rights:demo-1"
    }
  }
}
```

**安全返回**

```json
{
  "ok": true,
  "value": {
    "schemaVersion": 1,
    "outcome": "SAVED",
    "revision": 2,
    "ownerState": "SAVED",
    "reason": null,
    "task": {
      "schemaVersion": 1,
      "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
      "feature": "singing",
      "taskType": "SVC",
      "state": "SAVED",
      "voiceProfileId": "voice:demo-hero",
      "hasInput": true,
      "hasOutput": true,
      "cancelRequested": false,
      "cancelConfirmed": false,
      "deliveryRequested": false,
      "mockOnly": true,
      "realOperationAllowed": false,
      "userMessageZh": "已保存到演示资产库；这不代表已经发送到微信。（演示状态，尚未接入真实生成）"
    },
    "artifact": {
      "artifactRef": "artifact:fixture-bytes-0123456789abcdef0123456789abcdef",
      "byteLength": 88244,
      "sha256": "3fa20276d8a4131431490ed129d0b05fafa4e9c82d4339b5cf635512103d6615",
      "expiresAt": "2026-10-31T00:00:00.000Z"
    },
    "userMessageZh": "演示结果已保存到本地演示资产库；这不会发送到微信，也不代表真实生成。",
    "mockOnly": true,
    "realOperationAllowed": false,
    "submitAllowed": false,
    "automaticRetryAllowed": false
  }
}
```

**status 请求（五键）**

```json
{"schemaVersion":1,"scopeId":"scope:fixture-demo","taskId":"task:fixture-0123456789abcdef0123456789abcdef","now":"2026-10-30T23:10:00.000Z","rights":{"state":"GRANTED","proofRef":"fixture-rights:demo-1"}}
```

以上 TaskId 为合法 32hex；ref 为 `artifact:fixture-bytes-<32hex>`；时间规范 `.sssZ`；
`userMessageZh` 与 §4.4 固定文案一致；hash/长度/proof 与原库算法一致。示例只属候选，
不表示现 parser 可解析未来 v2，也不执行保存。

---

## 6. SaveProof 强制规则（current→candidate delta）

### 6.1 生效条件

- 仅当写盘前后差分是 **“已存在唯一 CLAIMED → 新 SAVED FINAL”** 时，`proof` **必须**提供且严格匹配；
- `proof=null` 只允许旧 `run` **原样保留已有 SAVED 历史**（不新增/改写/接管 SAVED，也不要求旧资产仍存在或未过期）；
- 缺失/形状不符/多任务/不匹配 → writer 在 pre-rename 拒绝（`WRITE_REJECTED`），不写 FINAL；
- 不新增持久 receipt/phase/第三文件。

### 6.2 逐项唯一规则

| 项 | 来源 | 与什么比较 | 检查点 | 失败 |
|---|---|---|---|---|
| scopeId/taskId | 请求 + 出生 + candidate record | 三者相等；且该 Task 唯一 entry | pre | `WRITE_REJECTED` |
| birthIdentityHash/birthObservedAt | catalog 出生 | 与 fresh 出生及 entry 一致 | pre+post | `WRITE_REJECTED`/`WRITE_UNKNOWN` |
| 出生不可变字段 | 出生 record | 与 candidate record 的 `sameImmutable` 字段一致 | pre | `WRITE_REJECTED` |
| claimDigest/claimRevision | 已确认 CLAIMED 字节 | `baseDigest === claimDigest`、`expectedRevision === claimRevision` | pre | `STORE_CHANGED`/`WRITE_REJECTED` |
| recordIdentityHash | candidate record | 与 candidate FINAL 的 `identityHashOf` 一致 | post | `WRITE_UNKNOWN` |
| 最终动作链 | candidate record | `outputArtifactRef===artifact.artifactRef` 且 state=SAVED | pre+post | `WRITE_REJECTED`/`WRITE_UNKNOWN` |
| ref/sha/长度/identity | 本次唯一 STORED | 与 fresh 库 entry（`readStoredForSave`）用 `artifactIdentityHash` 重算比较 | pre+post | 同上 |
| requestKey/rights/expiry | 请求与库 entry | 四者一致且未过期 | pre+post | `WRITE_REJECTED` |

claim 摘要语义：pre 比较的是**已确认 CLAIMED 的 digest**；post 确认的是**本次 candidate FINAL 的
digest**（`sha256(bytes)` 由 writer 自己计算），不得把 post 的 FINAL digest 当作 claim digest。

### 6.3 有限反例（唯一拒绝点）

| 反例 | 拒绝点 |
|---|---|
| A/B 同 `birthIdentityHash` 但 taskId/observedAt 不同，B FINAL 传 A 的 proof/ref | writer pre：scopeId/taskId 或 birthObservedAt 不等 → `WRITE_REJECTED` |
| 错 `claimDigest`/`claimRevision` | pre：baseDigest/revision 不符 → `STORE_CHANGED` |
| 错库 ref / sha / 长度 / identity | pre/post：`readStoredForSave` 比较失败 → `WRITE_REJECTED`/`WRITE_UNKNOWN` |
| 新 SAVED 无 proof 或 proof=null | pre：delta 分类为 SAVED 而 proof 缺失 → `WRITE_REJECTED` |
| 仅历史 SAVED、库已删除，旧 run 追加其他任务 | 合法控制：旧 run 不要求 proof、不触碰该 SAVED、不 import |

---

## 7. 唯一序列与线性化

| # | 动作 | 队列 | 失败 |
|---|---|---|---|
| 1 | 入队/能力/锁 | Task | `OWNER_UNKNOWN`/`SANDBOX_INVALID` |
| 2 | 读八键/两分区 copy | Task | §4.7 码 |
| 3 | fresh 出生+关联 | Task | `NOT_FOUND`/`BIRTH_INVALID` |
| 4 | 已有 entry 分流 | Task | FINAL→EXISTING；CLAIMED→`SAVE_UNKNOWN` |
| 5 | 写 CLAIMED（rev+1） | Task | `WRITE_REJECTED`/`WRITE_UNKNOWN` |
| 6 | claim 后复核（digest/出生） | Task | `STORE_CHANGED`/`BIRTH_INVALID` |
| 7 | bytes 引擎一次 | Task | 坏协议→`SAVE_UNKNOWN`；合法非 SUCCESS→FINAL(SIMULATED) 返回 |
| 8 | 取 Artifact 队列 + 非重入 import 一次 | Task→Artifact | 拒绝→`ARTIFACT_REJECTED`；未知→`ARTIFACT_UNKNOWN` |
| 9 | 构造 SaveProof（frozen） | Task+Artifact 持有 | 构造不符→`ARTIFACT_REJECTED` |
| 10 | ATTACH + MARK_SAVED + 校验 | 持有 Artifact | `TASK_REJECTED` |
| 11 | 写 FINAL（proof，v2） | 持有 Artifact | pre `WRITE_REJECTED`；post `WRITE_UNKNOWN` |
| 12 | 联合确认（owner+库） | 持有 Artifact | 锁+`SAVE_UNKNOWN` |
| 13 | 释放 Artifact，返回 | — | — |

两个线性化点：库 rename `:845`、Task rename `:889`；跨文件非原子。

---

## 8. 队列、锁、证明路径与依赖

### 8.1 非重入 primitive 的真实路径

- 现有：`artifact-library.mjs:431 importOnce(state, request)` 为私有；公开 `import` 在 `:589-597`
  先 `readImport` 再 `enqueueArtifact`。
- 候选唯一方案（新代码时）：`artifact-library.mjs` **新增内部导出**
  `export function importInQueue(state, request)`：`request = readImport(request)` 后**直接**调用
  `importOnce(state, request)`，**不**入队；仅 owner 在持有 Artifact 队列时调用；公开 `import`
  行为与导出面不变。owner 不直接触碰 `importOnce` 私有符号。
- owner 取得 Artifact state：`getArtifactState(state.sandbox)`（artifact-store 导出）；Task state 与
  Artifact state 分别来自各自 WeakMap，**不把 Task state 传给库**。
- 持队列期间禁止调用公开 `import`/`get`/`readBytes`/`delete`（会自等）；只允许 §8.1 primitive 与
  直接 `readArtifactPack`/`readStoredForSave` 只读调用。

### 8.2 base 拆分与真实依赖闭包

- 新文件 `core/audio/fixture-store-base-internal.mjs`，导出：`StoreFailure`、`isStoreFailure`、
  `raiseStore`、`storeReason`、`sha256`、`stableStringify`、`isPlainObject`、`hasOwn`、`keySurface`、
  `checkSandbox`、`normalizePath`、`isInside`。
- `checkSandbox` 依赖 `isTrustedSandbox`（来自 `../config-sandbox.mjs`）、`normalizePath`、`isInside`、
  `fs` 与 marker 常量；**marker 校验函数与其有界读、身份辅助**一并随 `checkSandbox` 迁入 base，
  不能留在 Task-store 再被 base 反向 import。
- 文件白名单：`fixture-store-base-internal.mjs`（新）、`fixture-task-store-internal.mjs`（改 import 并保留
  writer/parse）、`fixture-artifact-store-internal.mjs`（改 import + 新增 `readStoredForSave`）、
  `artifact-library.mjs`（新增 `importInQueue`）、`task-owner.mjs`（save/status）。
- DAG：

```text
config-sandbox ─→ fixture-store-base-internal
                        ↑              ↑
             fixture-artifact-store  fixture-task-store
                        ↑                  ↑
             artifact-library ────────────┘
                        ↑
                    task-owner
```

- 初始化顺序：`config-sandbox` → base → artifact-store → task-store → artifact-library → owner；
  ESM 顶层无副作用，无环、无 TDZ。禁止 caller validator/fs/路径/回调进入 store。

### 8.3 锁可见性（原/新 handle 与 factory）

| 事件 | catalog factory/reserve/get | owner factory/run/get/save/status | artifact factory/import/get/readBytes/delete |
|---|---|---|---|
| Task 域锁（owner/claim/post-FINAL） | `CATALOG_UNKNOWN` | `OWNER_UNKNOWN` | 正常 |
| Task 域锁（BIRTH_INVALID） | `CATALOG_UNKNOWN` | `OWNER_UNKNOWN` | 正常 |
| Artifact 域锁 | 正常 | `get`→UNKNOWN 投影；`save/status`→`OWNER_UNKNOWN` | `LIBRARY_UNKNOWN` |
| 无锁 | 正常 | 按状态投影 | 正常 |

CLAIMED 逻辑墓碑 ≠ Task 物理锁；库锁 ≠ Task 锁。

---

## 9. 失败矩阵（有限、确定）

| # | 场景 | 磁盘 | engine | import | Task 锁 | Artifact 锁 | 首错 | 后续 | 资产 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | claim 前输入/rights/过期 | 无 | 0 | 0 | 否 | 否 | §4.7 | 原样 | 无 |
| 2 | CLAIMED 写 pre 拒绝 | 旧 owner | 0 | 0 | 否 | 否 | `WRITE_REJECTED` | 原样 | 无 |
| 3 | CLAIMED rename 未知 | 可能 CLAIMED | 0 | 0 | 是 | 否 | `WRITE_UNKNOWN` | OWNER_UNKNOWN | 无 |
| 4 | claim 后 Task 外改/关联坏 | CLAIMED | 0 | 0 | 是 | 否 | `STORE_CHANGED`/`BIRTH_INVALID` | OWNER_UNKNOWN | 无 |
| 5 | engine 坏协议 | CLAIMED | 1 | 0 | 否 | 否 | `SAVE_UNKNOWN` | UNKNOWN | 无 |
| 6 | 合法非 SUCCESS/阻断 | FINAL SIMULATED/NO_EXECUTION | 1 | 0 | 否 | 否 | ok:true | 正常 | 无 |
| 7 | 库 pre 拒绝 | CLAIMED | 1 | 1 被拒 | 否 | 否 | `ARTIFACT_REJECTED` | UNKNOWN | 旧包不变 |
| 8 | 库 rename 未知 | CLAIMED | 1 | 1 | 否 | 是 | `ARTIFACT_UNKNOWN` | UNKNOWN | 可能已存，保留 |
| 9 | 新 STORED 后 Task pre 拒绝 | CLAIMED | 1 | 1 | 否 | 否 | `WRITE_REJECTED`/`TASK_REJECTED` | UNKNOWN | 孤儿保留 |
| 10 | Task rename 已尝试 | 可能 FINAL | 1 | 1 | 是 | 否 | `WRITE_UNKNOWN` | OWNER_UNKNOWN | 保留 |
| 11 | Task rename 后确认失败 | 可能 FINAL | 1 | 1 | 是 | 否 | `SAVE_UNKNOWN` | OWNER_UNKNOWN | 必须保留 |
| 12 | 联合确认后外改 | FINAL 已存 | 1 | 1 | 是 | 否 | `SAVE_UNKNOWN` | OWNER_UNKNOWN | 保留 |
| 13 | 并发/旧 run 交叉 | 唯一 | ≤1 | ≤1 | 各自 | 各自 | 后到分流 | — | 不接管 |
| 14 | 保存后删除/过期/撤权 | FINAL 不变 | 0 | 0 | 否 | 视库 | status 状态 | get 历史 | 历史不改 |

第 9/10/11 行明确：save 已尝试 owner rename 时**不能断言仍 CLAIMED**；不回滚、不删孤儿。

---

## 10. 删除、过期、取消

- 持 Artifact 队列至联合确认：公开 `delete` 只在释放后执行；失败释放后 delete 可删新资产，owner 墓碑不回滚。
- 历史 SAVED 与当前可用性分离（§4.3）；不自动清孤儿；UNKNOWN 不删/不重 import。
- 无 cancel API；保存为不可中断单次尝试（`NOT_SUPPORTED`）。

---

## 11. 实施步骤与证据（只写名单）

| 步 | runtime 文件 | 测试文件（未来） | 前置 |
|---|---|---|---|
| 1 | `fixture-store-base-internal.mjs`（新）；task/artifact store 改 import | 既有 task-owner/artifact 测试全量 | — |
| 2 | `fixture-artifact-store-internal.mjs`（`readStoredForSave`） | `test/artifact-library.test.mjs` 增只读四态 | 1 |
| 3 | `fixture-task-store-internal.mjs`（v2/SAVED/revision/proof+pre/post 门禁） | `test/task-owner.test.mjs` 增 v1/v2/proof 拒绝 | 1 |
| 4 | `artifact-library.mjs`（`importInQueue`）；`task-owner.mjs`（save/status/proof 构造/旧方法分流） | `test/task-owner-save.test.mjs`（新） | 2,3 |
| 5 | 文档/状态 | — | 4 |

writer/proof/兼容与 save 成功路径同一步不可分交付。

### 11.1 测试代表与真实计数

| 例 | 真实委托/注入点 | 判据 |
|---|---|---|
| 成功 | 真实 catalog/owner/library + 临时目录 | Task rename **1 claim + 1 final**、Artifact rename **1**、FINAL SAVED、库 STORED、revision 权重、重复 save→EXISTING |
| claim pre 拒绝 | Task writer `:869-885` 前证明/输入不符 | claim rename 0、FINAL rename 0、Artifact 0、无锁 |
| claim 未知 | `:889` 注入 | claim rename 1 尝试、FINAL 0、Task 锁 |
| engine 坏协议 | 包装真实 engine 一次成功后替换 | engine 1、import 0、CLAIMED、Task 无锁 |
| 合法非 SUCCESS/阻断 | 真实场景 | FINAL SIMULATED/NO_EXECUTION、import 0 |
| 库 pre 拒绝 | 冲突 key/rights/expiry | import 1 被拒、Artifact rename 0、旧包不变 |
| 库 rename 未知 | 库 `:845` 注入 | Artifact rename 1 尝试、Artifact 锁、owner CLAIMED |
| Task pre 拒绝（新 STORED 后） | Task `:869-885` 注入 proof 不符 | Task rename 0、资产孤儿保留 |
| Task rename 未知 | Task `:889` 注入 | Task 锁、possible FINAL、资产保留 |
| Task post 确认失败 | Task `:895-918` 注入 | `SAVE_UNKNOWN`、不删、不重试 |
| delete 排队 | import 后尝试 delete | Artifact 队列阻塞至 save 结束 |
| 旧 run/多 handle/factory | 保存后旧 run 与其他 handle | EXISTING/SAVED、锁可见性按 §8.3 |

每例给：真实成功控制、目标函数命中次数、Task claim/FINAL 两次 rename 与 Artifact rename 分开计数、
磁盘保留、handle/factory 结果、engine/import 累计数。未实现测试不得报告为已通过。

---

## 12. 威胁模型与未决

同进程受信 sandbox；JSON/SHA/ref 非认证 cap；不承诺跨进程恢复；SAVED 不代表真实生成/版权/发送；
真实 TTS/RVC、GUI、投递、取消 API 未解决。

---

## 13. 结论

v1.2 校准 R1 三处真实行号（engine 994/971/755/761/769-782；库 715/800-838/845/851-873，:889 为
INTERNAL_FAILURE；Task 803/869-885/889/895-918），把证明升级为强制 delta 规则并给出完整协议、
完整示例与反例，固定非重入 primitive 与 base 依赖闭包，给出有限失败矩阵与真实计数测试设计。

**状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
