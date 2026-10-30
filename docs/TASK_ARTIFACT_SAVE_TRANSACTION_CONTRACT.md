# Whale Voice · 同一 claim 内的任务保存事务契约（候审）v1.3

> **状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
> 候审技术契约，不是已实现功能，不构成运行时代码授权。现有 owner 仍只有 `run`/`get`
> （`SIMULATED`/`NO_EXECUTION`），库仍只有 `FIXTURE_IMPORT`；**没有任务保存能力**。
>
> 基准 `main` **M `08cf0b61acc402d619618df2ad15bce5436b0873`**；`文件:行` 以 M 为准。
> v1.3 按 073 修订版本比较、claim 摘要、proof 绑定、旧 run/get 语义、status 规范、模块签名与失败矩阵；
> 070–072 已过项与 0066–0068 原文保留。

---

## 1. 现状关键事实（M）

| 域 | 事实 | 出处 |
|---|---|---|
| engine | bytes 导出 `:994`、旧 existing `:971`、producer `:755`、`BEGIN_PROCESS` `:761`、PROCESSING 返回 `:769-782` | `task-fixture-engine-internal.mjs` |
| 库 writer | fsync `:715`、最后 temp 门禁 `:800-838`、唯一 rename `:845`、post `:851-873`；`:889` 是 `INTERNAL_FAILURE` | `fixture-artifact-store-internal.mjs` |
| Task writer | fsync `:803`、current/pre `:869-885`、rename `:889`、post `:895-918`；写前 `readVerified(baseDigest)` 外改 `:734-736`；关联坏 `:574-581` | `fixture-task-store-internal.mjs` |
| 库外改 | fresh 读 `artifact-store:569-571` → Artifact 域锁 | 同上 |
| owner | `run` 输入四键、`get` 三键；`run` 无 owner entry 时 claim 后执行（非 NOT_FOUND）；`get` 无 entry 为 `NOT_FOUND`（`:539-541`）；已有 entry：`run`→`EXISTING`，`get`→`FOUND` | `task-owner.mjs:80-81,415-545` |
| owner 版本写 | FINAL `expectedRevision = claimRevision + 1`（`:480`、`:500`）；writer 的 `expectedRevision` 是**候选落盘版本**（task-store `:745`、`:907`） | 同上 |
| owner revision | 快照 `revision = 1×CLAIMED + 2×FINAL`（`:462-524`） | task-store |
| 固定文件/预算 | `audio-task-owner-v1.json`、128 KiB/32 条（`:29,31,33`）；`^task:fixture-[0-9a-f]{32}$`（`:45`） | 同上 |
| 库 | 常量 `:40-46`；import 七键；proof 后缀 `{1,128}` 且总长 ≤128（实际 ≤113）；时钟 `.sssZ`；`metadataOf` 无 identityHash | `artifact-library.mjs:102,109,276-282,306,361-371` |

---

## 2. 版本、claim 摘要与 proof 绑定（R2-A）

### 2.1 当前 claim 版本 ≠ 候选 FINAL 版本

唯一 writer 的 `expectedRevision` 是**候选落盘版本**，不是当前版本；owner 写 FINAL 传 `claimRevision+1`。
因此：

| 阶段 | 比较 |
|---|---|
| pre（读当前 CLAIMED） | `freshCurrent.revision === proof.claimRevision` 且 `freshCurrent.digest === proof.claimDigest === baseDigest` |
| 候选 | `candidateRevision = claimRevision + 1`；`expectedRevision === candidateRevision`（单次本任务转 FINAL 恒 +1） |
| post（已 rename） | 比较**本次 candidate 字节**：`sha256(bytes) === parsed candidate digest`、`parsed.revision === expectedRevision`、record/ref 一致；**不再**与 claimRevision/claimDigest 比较 |
| 错误分流 | 读取当前快照 digest 不符 → `STORE_CHANGED`+Task 锁；仅 proof 字段/候选版本不符 → `WRITE_REJECTED`（无锁）。两者不共用同一错误 |

### 2.2 可复算的 CLAIMED 示例（791 bytes）

按 M owner `:433-451` 的 `JSON.stringify` 与 task-contract `:496-514` 的字段顺序，示例的 CLAIMED 快照完整如下
（`revision=1`，唯一 entry，`completion=null`）：

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "entries": [
    {
      "scopeId": "scope:fixture-demo",
      "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
      "birthIdentityHash": "41932dbe77a714314869e225b62f9650271eb78914e920a295259da23c4a000e",
      "phase": "CLAIMED",
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
        "state": "CREATED",
        "outputArtifactRef": null,
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
      "completion": null
    }
  ]
}
```

规范化字节为上面 JSON 的紧凑序列化（无空白），**791 bytes**，SHA256 =
`e30bee44aef05a134df2680e39cde609b3a3a8ec541d4e872457f7ffea43f50a`；`proof.claimDigest` 必须等于该值。
任何读者可用「`JSON.stringify(上述对象)` 的 UTF-8 字节」复算；不是任意 64hex。

### 2.3 proof 严格键面与左右操作数

`SaveProof`（owner 内部，冻结，不持久）：

| 键 | 类型/上限 | 来源 |
|---|---|---|
| `schemaVersion` | `1` | 常量 |
| `scopeId`/`taskId` | 原 pattern | 请求 + 出生 |
| `birthIdentityHash` | 64hex | 出生 record |
| `birthObservedAt` | 规范 `.sssZ` | 出生 record |
| `claimRevision` | 整数 ≥1 | 已确认 CLAIMED 快照 |
| `claimDigest` | 64hex | 上述 791B 规范字节 |
| `candidateRevision` | 整数 = claimRevision+1 | 本次候选 |
| `recordIdentityHash` | 64hex | `identityHashOf(candidateRecord)` |
| `artifact.artifactRef` | 库 ref | 本次唯一 STORED |
| `artifact.identityHash` | 64hex | `artifactIdentityHash(scopeId,requestKey,byteSha256,expiresAt,rights)` 重算 |
| `artifact.byteSha256`/`byteLength` | 64hex/整数 | 本次 STORED inspection |
| `artifact.expiresAt`/`requestKey`/`rights` | 规范值 | 请求与库 entry |
| `artifact.inspection` | **完整 19 键**（嵌入，不用引用） | 本次 STORED |
| `evaluatedAt` | 规范 `.sssZ` = 请求 `now` | 请求 |

**必须明确左右两侧**（不是“来源表自称严格”）：

| 域 | 左（proof/候选） | 右（fresh 权威） | 检查点 |
|---|---|---|---|
| scope/task | `proof.scopeId/taskId`、candidate record | fresh 出生、当前唯一 CLAIMED、请求 | pre |
| birth | `proof.birthIdentityHash/birthObservedAt` | fresh 出生 record 的 `identityHashOf` 与 observedAt；**另核 taskId/observedAt 字符串**，不用 hash 代替 | pre+post |
| record | `proof.recordIdentityHash` + `sameImmutable(candidate,birth)` | `identityHashOf(candidate)`、birth 全部不可变字段（taskId/feature/taskType/source/voiceProfileId/rights.state/deliveryRequested/observedAt） | pre+post |
| claim/candidate | `proof.claimRevision/claimDigest`、`proof.candidateRevision` | 当前 CLAIMED revision/digest；`expectedRevision`=candidate | pre |
| actual STORED | `proof.artifact.*`（含 19 键 inspection） | 本次唯一新 STORED 的规范化字段 + fresh 严格库解析 + candidate `outputArtifactRef` | pre+post |

- `recordIdentityHash` 与 `birthIdentityHash` 在 `identityOf` 算法下**可能相等**（identity 不含 state/outputArtifactRef）；
  因此 record 绑定还必须用 `sameImmutable` + 显式 `state=SAVED`、`outputArtifactRef=artifactRef` 判定，不得只看 hash。
- proof 生命周期：构造（import 返回后）→ 冻结 → 作为 writer 第 4 实参 → pre/post 读取 → 调用结束丢弃；不写盘。
- post 阶段（rename 已发生）任何 proof/rights/expiry 不符 → **`WRITE_UNKNOWN`**（不是 `WRITE_REJECTED`）。

---

## 3. 唯一候选方案

同一 claim 内：bytes 引擎一次 → 持 Artifact 队列、非重入 import 一次 → `ATTACH_FAKE_ARTIFACT` →
`MARK_SAVED` → 带 proof 的严格 `FINAL(SAVED)` → 联合确认。
合法非 SUCCESS/阻断按旧 owner 写 `SIMULATED`/`NO_EXECUTION` FINAL，不 import。

---

## 4. 四方法完整协议（R2-B）

**原则**：错误 → `{ok:false,errors:[{code,path,reason}]}`（单错、深冻结、零回显）；合法“没有/未完成/历史”
→ `ok:true` 投影。Artifact 域锁**不改变** Task 历史 `get` 的结果。

### 4.1 `run`（旧方法）

| 条件 | 返回 |
|---|---|
| 无出生 | `TASK_OWNER_NOT_FOUND` envelope |
| 有出生、无 owner entry | 正常 claim → engine → FINAL（旧流程，可执行保存以外的旧行为） |
| 已有 CLAIMED | `ok:true`，`outcome='EXISTING'`，`ownerState='UNKNOWN'`，`reason=TASK_OWNER_EXECUTION_UNKNOWN` |
| 已有 FINAL `SIMULATED`/`NO_EXECUTION` | `ok:true`，`EXISTING`，`ownerState` 原值 |
| 已有 FINAL `SAVED` | `ok:true`，`EXISTING`，`ownerState='SAVED'` |
| 出生损坏/关联坏 | `TASK_OWNER_BIRTH_INVALID`（Task 域锁） |
| Task 域锁 | `TASK_OWNER_OWNER_UNKNOWN` |

### 4.2 `get`

同表，但：无 owner entry → `TASK_OWNER_NOT_FOUND`；已有 entry → `outcome='FOUND'`（不是 EXISTING）；
不执行 engine；**Artifact 锁不影响** 历史 SAVED 的 `get`。

### 4.3 `artifactStatus`（五键只读：`schemaVersion,scopeId,taskId,now,rights`）

返回 `{ok:true,value:{schemaVersion,state,ownerState,artifactRef,expiresAt,messageZh}}`，字段存在规则：

| 条件（按优先级自上而下） | state | artifactRef/expiresAt |
|---|---|---|
| Task 域锁 | envelope `TASK_OWNER_OWNER_UNKNOWN` | — |
| 无出生 | envelope `TASK_OWNER_NOT_FOUND` | — |
| 无 owner entry 或非 SAVED FINAL | `MISSING` | `null`/`null` |
| CLAIMED | `UNKNOWN`（ownerState UNKNOWN） | `null`/`null` |
| 当前 rights 非 GRANTED 或 proof 不符 | `RIGHTS_REJECTED` | `null`/`expiresAt` |
| 库锁/外改 | envelope `TASK_OWNER_SAVE_ARTIFACT_UNKNOWN` 或 `STORE_CHANGED`（按库首错） | — |
| 库 entry `DELETED` | `DELETED` | ref/expiresAt |
| `now >= expiresAt` | `EXPIRED` | ref/expiresAt |
| 库 entry `STORED` 且有效 | `READABLE` | ref/expiresAt |

优先级：Task 事实 → rights → 库锁 → 删除 → 过期 → 可读；不得越过 rights 泄露资产，也不把旧 GRANTED 当当前许可。

### 4.4 `save`（八键）

成功/EXISTING/合法非 SUCCESS/NO_EXECUTION/CLAIMED 及 artifact 字段规则：

| 结果 | outcome/ownerState | artifact 字段 |
|---|---|---|
| 本次成功 | `SAVED`/`SAVED` | 存在（ref/byteLength/sha256/expiresAt） |
| 已 FINAL SAVED | `EXISTING`/`SAVED` | 存在 |
| 合法非 SUCCESS | `SIMULATED`/`SIMULATED` | `null` |
| 合法阻断 | `NO_EXECUTION`/`NO_EXECUTION` | `null` |
| CLAIMED 已存在 | envelope `TASK_OWNER_SAVE_UNKNOWN` | — |

### 4.5 错误码（8 新 + 14 继承，完整）

| code | path | 固定 reason | 触发 | 后续 run/get/save/status |
|---|---|---|---|---|
| `TASK_OWNER_SAVE_INPUT_INVALID` | 键/`$` | `save input invalid` | 八键/input 形状 | 原样 |
| `TASK_OWNER_SAVE_RIGHTS_REJECTED` | `rights` | `save rights rejected` | rights 非 GRANTED/proof 非法 | 原样 |
| `TASK_OWNER_SAVE_EXPIRED_REQUEST` | `expiresAt` | `save request expired` | `expiresAt<=now` | 原样 |
| `TASK_OWNER_SAVE_PRECONDITION` | `$` | `save precondition failed` | 无出生/无 claim 可续/已有非 SAVED FINAL | 原样 |
| `TASK_OWNER_SAVE_ARTIFACT_REJECTED` | `$` | `artifact import rejected` | 库 pre 拒绝/库外改 | CLAIMED→UNKNOWN |
| `TASK_OWNER_SAVE_ARTIFACT_UNKNOWN` | `$` | `artifact import unknown` | 库 rename 未知/库锁 | UNKNOWN |
| `TASK_OWNER_SAVE_TASK_REJECTED` | `$` | `task attach or save rejected` | ATTACH/MARK_SAVED/record 校验拒绝 | CLAIMED→UNKNOWN |
| `TASK_OWNER_SAVE_UNKNOWN` | `$` | `save outcome unknown` | owner FINAL rename 尝试后失败/联合确认失败 | UNKNOWN |

继承码（同 M 14 码，不新增）：`TASK_OWNER_INVALID_INPUT/RESOURCE_LIMIT/UNSUPPORTED_VERSION/SANDBOX_INVALID/
NOT_FOUND/BIRTH_INVALID/STORE_INVALID/STORE_CHANGED/WRITE_REJECTED/WRITE_UNKNOWN/OWNER_UNKNOWN/
EXECUTION_UNKNOWN/DEPENDENCY_FAILURE/INTERNAL_FAILURE`；映射见 §9。

---

## 5. 存储、revision 与兼容（完整表，不引用外部）

- entry 六键；`completion.kind` 增加 `SAVED`（reason null）；`record.state='SAVED'`、`outputArtifactRef=ref`、
  `delivery.state='NOT_REQUESTED'`、`deliveryId=null`。
- `revision = 1×CLAIMED + 2×FINAL`；首次写 SAVED 升快照 v2，旧 entry/墓碑保留，revision 重算。

| 磁盘状态 | 新读 | 新写 | 旧读 | 旧写 | Task 锁 |
|---|---|---|---|---|---|
| v1 空 | OK | CLAIMED（v1） | OK | OK | — |
| v1 全 CLAIMED | OK | 追加 | OK | OK | — |
| v1 SIMULATED FINAL | OK | 追加；含 SAVED 升 v2 | OK | OK | — |
| v1 NO_EXECUTION FINAL | OK | 同上 | OK | OK | — |
| v2 含 SAVED | OK | 保持 v2 | `STORE_INVALID` | 拒绝 | — |
| v2 混合 | OK | 保持 v2 | `STORE_INVALID` | 拒绝 | — |
| 未知版本 | `STORE_INVALID` | 拒绝 | `STORE_INVALID` | 拒绝 | — |
| 外改 | `STORE_CHANGED` | 拒绝 | `STORE_CHANGED` | 拒绝 | Task |
| 33 条/128KiB+1 | `RESOURCE_LIMIT` | 拒绝 | 同 | 同 | — |
| 出生坏/缺失 | `BIRTH_INVALID`/`NOT_FOUND` | 拒绝 | 同 | 同 | BIRTH_INVALID 时锁 |

只读打开不写盘；升级后旧 run 追加任务必须继续 v2，不降级、不丢 SAVED；不执行迁移。

### 5.1 完整示例（同一 fixture）

save 请求（八键）：

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

CLAIMED 快照（791B，摘要见 §2.2）：

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "entries": [
    {
      "scopeId": "scope:fixture-demo",
      "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
      "birthIdentityHash": "41932dbe77a714314869e225b62f9650271eb78914e920a295259da23c4a000e",
      "phase": "CLAIMED",
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
        "state": "CREATED",
        "outputArtifactRef": null,
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
      "completion": null
    }
  ]
}
```

SAVED record（16 键）：

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

SAVED entry（六键）：

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

SaveProof（含 19 键 inspection）：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-0123456789abcdef0123456789abcdef",
  "birthIdentityHash": "41932dbe77a714314869e225b62f9650271eb78914e920a295259da23c4a000e",
  "birthObservedAt": "2026-10-27T00:00:00.000Z",
  "claimRevision": 1,
  "claimDigest": "e30bee44aef05a134df2680e39cde609b3a3a8ec541d4e872457f7ffea43f50a",
  "candidateRevision": 2,
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
    },
    "inspection": {
      "schemaVersion": 1,
      "format": "WAV",
      "codec": "PCM_S16LE",
      "bitsPerSample": 16,
      "sampleRate": 44100,
      "channels": 1,
      "byteLength": 88244,
      "dataByteLength": 88200,
      "frameCount": 44100,
      "durationMs": 1000,
      "peak": 0,
      "fullScaleSampleCount": 0,
      "sha256": "3fa20276d8a4131431490ed129d0b05fafa4e9c82d4339b5cf635512103d6615",
      "validationState": "FIXTURE_WAV_CHECKED",
      "mockOnly": true,
      "realOperationAllowed": false,
      "submitAllowed": false,
      "automaticRetryAllowed": false,
      "messageZh": "演示模式的WAV字节已校验；不代表使用权、生成、保存或发送。"
    }
  }
}
```

安全输出：

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

status 请求：

```json
{"schemaVersion":1,"scopeId":"scope:fixture-demo","taskId":"task:fixture-0123456789abcdef0123456789abcdef","now":"2026-10-30T23:10:00.000Z","rights":{"state":"GRANTED","proofRef":"fixture-rights:demo-1"}}
```

全部 hash/长度/proof 与 M 原算法一致；示例只属候选，不表示 v2 可被现 parser 解析。

---

## 6. 唯一序列与线性化

| # | 动作 | 队列 | 关键结果 |
|---|---|---|---|
| 1 | 入队/能力/锁 | Task | OWNER_UNKNOWN/SANDBOX_INVALID |
| 2 | 读八键/两分区 copy | Task | 输入错误 |
| 3 | fresh 出生/关联 | Task | NOT_FOUND/BIRTH_INVALID |
| 4 | 分发 | Task | FINAL→EXISTING；CLAIMED→SAVE_UNKNOWN |
| 5 | 写 CLAIMED（rev+1） | Task | WRITE_REJECTED/WRITE_UNKNOWN |
| 6 | 复核 | Task | STORE_CHANGED/BIRTH_INVALID |
| 7 | bytes 引擎一次 | Task | 坏协议→SAVE_UNKNOWN；非 SUCCESS→FINAL SIMULATED/NO_EXECUTION |
| 8 | 持 Artifact 队列 + importInQueue | Task→Artifact | ARTIFACT_REJECTED/UNKNOWN |
| 9 | 构造/冻结 SaveProof | 持有 | ARTIFACT_REJECTED |
| 10 | ATTACH/MARK_SAVED/校验 | 持有 | TASK_REJECTED |
| 11 | 写 FINAL（proof，v2，候选 rev） | 持有 | WRITE_REJECTED（pre）/WRITE_UNKNOWN（post） |
| 12 | 联合确认 → 释放 | — | SAVE_UNKNOWN 若失败 |

线性化：库 rename `:845`、Task rename `:889`；非跨文件原子。

---

## 7. 模块、导出与依赖（R3-A）

| 文件 | 导出/签名 | state 类型 | 调用者 | 队列 |
|---|---|---|---|---|
| `fixture-store-base-internal.mjs`（新） | `StoreFailure`、`isStoreFailure(e)`、`raiseStore(key,path)`、`storeReason(key)`、`sha256(buf)`、`stableStringify(v)`、`isPlainObject(v)`、`hasOwn(o,k)`、`keySurface(o,set)`、`normalizePath(p)`、`isInside(child,parent)`、`assertRegularStat(stat,key)`、`sameIdentity(a,b)`、`readBoundedPath(state,path,max,opts)`、`checkSandbox(state)` | Task/Artifact 共用 `{sandbox}` 子集 | task-store、artifact-store | — |
| `fixture-artifact-store-internal.mjs` | 既有 + **`readStoredForSave(state, {scopeId, artifactRef, now}) → {ok:true,value:{artifactRef,identityHash,byteSha256,byteLength,expiresAt,requestKey,rights,inspection,state:'STORED'}}` / `{ok:false,errorKey,path}`** | Artifact state（`getArtifactState`） | task-store writer | **否**（同步只读，不排队） |
| `fixture-task-store-internal.mjs` | `write(bytes, baseDigest, expectedRevision, proof=null)`（proof 见 §2.3）；内部 `getArtifactState(state.sandbox)` 取得 Artifact state | Task state | task-owner | 否（owner 已持 Task 队列） |
| `artifact-library.mjs` | 既有 `openFixtureArtifactLibrary`；**新增 `export function importInQueue(state, request)`**（`readImport`→`importOnce`，不入队） | Artifact state | task-owner（持 Artifact 队列时） | 由调用者持有 |
| `task-owner.mjs` | `openFixtureTaskOwner`；handle 增加 `save`/`artifactStatus` | Task state + sandbox | 外部 | `enqueue` |

- 公开面：`artifact-library` 现有 handle 方法/导出不变；**新增的是内部导出 `importInQueue`**，不是“整个导出面不变”。
- `readStoredForSave`：同步、免重入、不拿队列；只做 fresh 严格读与 19 键 inspection 复验；`STORED/DELETED/EXPIRED/缺失`
  分别返回 `state` 或固定 `errorKey`。
- writer 收到的 proof 必须由**同一 sandbox capability** 构造；writer 用 `getArtifactState(state.sandbox)` 取 Artifact state，
  校验 `state.sandbox === proof` 来源相同；不把 Task state 传给库。
- base 迁移后，Task-store 继续通过 base 使用 `readBoundedPath/sameIdentity/assertRegularStat`，**不得**回引 Task-store 成环。

DAG（全部真实边）：

```text
config-sandbox ─→ fixture-store-base-internal
                        ↑                ↑
        fixture-artifact-store ──────────┘
                 ↑            ↑
   fixture-task-store ────────┘   （task-store → artifact-store：readStoredForSave）
          ↑                ↑
   task-owner ─→ artifact-library ─→ artifact-store
```

初始化：base → artifact-store → task-store → artifact-library → owner；无副作用、无环。

---

## 8. 锁与失败矩阵（R3-B）

### 8.1 锁可见性

| 事件 | catalog factory/reserve/get | owner factory/run/get/save/status | artifact factory/import/get/readBytes/delete |
|---|---|---|---|
| Task 域锁（claim/final/BIRTH_INVALID） | `CATALOG_UNKNOWN` | `OWNER_UNKNOWN`（历史 get 也 UNKNOWN） | 不变 |
| Artifact 域锁 | 不变 | run/get 历史不变；save/status 报库错 | `LIBRARY_UNKNOWN` |
| 无锁 | 正常 | 按状态 | 正常 |

### 8.2 失败类别（writer 首错 vs owner 公开首错）

| # | 场景 | 磁盘 | engine | import | Task 锁 | Artifact 锁 | writer 首错 | owner 公开首错 | 资产 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 输入/rights/过期 | 无 | 0 | 0 | 否 | 否 | — | SAVE_INPUT/RIGHTS/EXPIRED | 无 |
| 2 | proof/候选版本坏（pre） | 旧 | 0 | 0 | 否 | 否 | `WRITE_REJECTED` | `TASK_OWNER_WRITE_REJECTED` | 无 |
| 3 | claim pre 拒绝（record/输入） | 旧 | 0 | 0 | 否 | 否 | `WRITE_REJECTED` | `TASK_OWNER_WRITE_REJECTED` | 无 |
| 4 | claim 外改 | 可能 CLAIMED | 0 | 0 | 是 | 否 | `STORE_CHANGED`/`STORE_INVALID` | 同 | 无 |
| 5 | claim rename 未知 | 可能 CLAIMED | 0 | 0 | 是 | 否 | `WRITE_UNKNOWN` | `TASK_OWNER_SAVE_UNKNOWN` | 无 |
| 6 | claim 后关联坏 | CLAIMED | 0 | 0 | 是 | 否 | `BIRTH_INVALID` | 同 | 无 |
| 7 | engine 坏协议 | CLAIMED | 1 | 0 | 否 | 否 | — | `TASK_OWNER_SAVE_UNKNOWN` | 无 |
| 8 | 合法非 SUCCESS/阻断 | FINAL SIMULATED/NO_EXECUTION | 1 | 0 | 否 | 否 | — | ok:true | 无 |
| 9 | 库 pre 拒绝 | CLAIMED | 1 | 1 拒 | 否 | 否 | — | `SAVE_ARTIFACT_REJECTED` | 旧包不变 |
| 10 | 库 rename 未知 | CLAIMED | 1 | 1 | 否 | 是 | — | `SAVE_ARTIFACT_UNKNOWN` | 可能已存，保留 |
| 11 | 新 STORED 后 pre 拒绝（proof/record） | CLAIMED | 1 | 1 | 否 | 否 | `WRITE_REJECTED` | `TASK_OWNER_WRITE_REJECTED` | 孤儿保留 |
| 12 | 同位置 Task 外改/出生坏 | CLAIMED | 1 | 1 | 是 | 否 | `STORE_CHANGED`/`BIRTH_INVALID` | 同 | 孤儿保留 |
| 13 | 同位置 Artifact 外改 | CLAIMED | 1 | 1 | 否 | 是 | 库 `STORE_CHANGED` | `SAVE_ARTIFACT_REJECTED` | 旧包保留 |
| 14 | Task FINAL rename 未知 | 可能 FINAL | 1 | 1 | 是 | 否 | `WRITE_UNKNOWN` | `SAVE_UNKNOWN` | 保留 |
| 15 | post 确认失败 | 可能 FINAL | 1 | 1 | 是 | 否 | `WRITE_UNKNOWN` | `SAVE_UNKNOWN` | 保留 |
| 16 | 联合确认后外改 | FINAL | 1 | 1 | 是 | 否 | — | `SAVE_UNKNOWN` | 保留 |
| 17 | 并发/旧 run | 唯一 | ≤1 | ≤1 | 各自 | 各自 | — | 后到分流 | 不接管 |
| 18 | 保存后删除/过期/撤权 | FINAL 不变 | 0 | 0 | 否 | 视库 | — | status 状态 | 历史不改 |

第 11/12/13 行区分“Task 已 claim 成功 1 次、FINAL 0 次、Artifact 1 次”，不能称 Task 总 rename 0。

---

## 9. 删除、过期、取消

- 持 Artifact 队列至联合确认；`delete` 只在释放后执行；失败释放后 delete 可删新资产，owner 墓碑不回滚。
- 历史 SAVED 与当前可用性分离（§4.3）；不自动清孤儿；UNKNOWN 不删/不重 import。
- 无 cancel API；保存为不可中断单次尝试（`NOT_SUPPORTED`）。

---

## 10. 实施与测试 DoD（只写设计）

| 步 | runtime | 测试（未来） | 前置 |
|---|---|---|---|
| 1 | base 新文件；task/artifact store 改 import | 既有测试全量 | — |
| 2 | `readStoredForSave`（artifact-store） | `test/artifact-library.test.mjs` 只读四态 | 1 |
| 3 | task-store v2/SAVED/proof+pre/post 门禁 | `test/task-owner.test.mjs` v1/v2/proof | 1 |
| 4 | `importInQueue` + owner save/status | `test/task-owner-save.test.mjs`（新） | 2,3 |

测试代表（复用 M `test/task-owner.test.mjs:203-250` 的 fsProxy 与 `:271-315` 真实 engine 委托替换）：

| 例 | fs 方法/匹配 | 命中 | 计数判据 |
|---|---|---|---|
| claim pre 拒绝 | 不注入；构造坏 proof | — | claim rename 0/FINAL 0/Artifact 0 |
| claim 外改 | `renameSync`? 否；改出生文件后 `write` | 1 | claim rename 0、Task 锁 |
| claim rename 未知 | `renameSync` 命中 owner 文件第 1 次 | 1 | claim rename 1 尝试、FINAL 0、Task 锁 |
| 库 pre 拒绝 | 冲突 requestKey | — | import 1 拒、Artifact rename 0 |
| 库 rename 未知 | `renameSync` 命中 artifact 文件 | 1 | Artifact rename 1、Artifact 锁、claim 保留 |
| 新 STORED 后 pre 拒绝 | proof 改 ref | — | claim 1、FINAL 0、Artifact 1、孤儿 |
| 同位置 Task 外改 | 出生文件改后 `fsyncSync` 后读 | 1 | Task 锁、claim 1/FINAL 0/Artifact 1 |
| Task FINAL rename 未知 | `renameSync` 命中 owner 文件第 2 次 | 1 | FINAL rename 1 尝试、possible FINAL |
| Task post 确认失败 | `readFileSync`/`fstatSync` 命中 owner 第 2 次读 | 1 | `SAVE_UNKNOWN`、不删 |
| delete 排队 | import 后调用 delete | — | 阻塞至 save 结束 |
| 旧 run/多 handle/factory | 保存后旧 run | — | EXISTING/SAVED、锁按 §8.1 |

每例给成功控制、真实委托命中 1、磁盘保留、engine/import 累计、旧/新 handle 与 factory 结果；
claim/FINAL/Artifact rename 分开计数，不用“rename 0/1”混同。未实现测试不报为已通过。

---

## 11. 威胁模型与未决

同进程受信 sandbox；JSON/SHA/ref 非认证 cap；不承诺跨进程恢复；SAVED 非真实生成/版权/发送；
真实 TTS/RVC、GUI、投递、取消 API 未解决。

---

## 12. 结论

v1.3 分离 current claim 与 candidate FINAL 的版本/digest，给出可复算 791B CLAIMED 摘要
（`e30bee44…`），把 proof 写成双侧操作数与 19 键 inspection，修正旧 run/get（EXISTING/FOUND）、
status 独立 schema 与优先级、完整 8+14 错误表、完整兼容表、模块签名/DAG 与 18 类失败矩阵。

**状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
