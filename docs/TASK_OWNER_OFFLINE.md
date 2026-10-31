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

## 5. 单次尝试、四个受限门禁与三种 UNKNOWN

**新鲜出生关联门禁（08-D-C-F01）。** 依赖动作前后的判定都不使用缓存 catalog：owner 工厂、`run`/`get`，以及 claim 之后、engine 返回之后、最终提交之后，都用同一 trusted capability 的受限真实读取重新读两个固定文件，并对**全部** owner 条目重做出生关联（身份哈希、完全初始 record、不可变字段）。出生文件损坏、合法外改或条目不符时，不再等到下一次 `get` 才发现。

| 检查点 | 时机 | 失败处理 |
|---|---|---|
| 门禁1 当前 | 解析请求后、claim 前 | `NOT_FOUND`/`BIRTH_INVALID`/`STORE_*`，0 写 0 engine |
| 门禁2 claim 后 | 真实 CLAIMED rename 成功、调用 engine 前 | engine 0，保留 CLAIMED 墓碑，按实际来源报错并锁闭 |
| 门禁3 engine 后 | engine 返回、最终提交前 | 不写 FINAL，保留 CLAIMED 墓碑，按实际来源报错并锁闭 |
| 门禁4 提交后 | 真实 FINAL rename 之后 | 保留盘上实际字节，`WRITE_UNKNOWN` + 共享锁，不回滚伪造 CLAIMED |

**写事务内门禁（F01 v1.1）。** 除 owner 模块的检查点之外，owner 固定文件的**真实写事务**也在三处通过同一受限有界读取复核出生登记与**全部** owner 条目关联，而不是只把旧 catalog 对象传回比较：`current`（写入口读自身文件后）、`pre`（临时文件真实 fsync 与回读完成之后、真正 rename **之前**，校验即将提交的字节）、`post`（真实 rename 后回读确认时）。`pre` 失败即停止提交：不执行 FINAL rename，盘上保持已确认的 `CLAIMED` 字节，按实际来源报 `STORE_CHANGED`/`STORE_INVALID`/`BIRTH_INVALID` 并共享锁闭；`post` 失败按存储未知处理（保留实际字节 + `WRITE_UNKNOWN`）。关联校验只有一份实现（`verifyOwnerAssociations`），由 owner 模块检查点与写事务共用；关联失败会锁闭同一 capability，因此既有/新的 owner 与 catalog handle 后续都不能继续执行或写入，而合法的 `NOT_FOUND`/错 scope 不会触发全库锁闭。私有持锁路径不重入公开队列。

| 情形 | 处理 |
|---|---|
| claim 写入 rename 前失败且可确认未提交 | `WRITE_REJECTED`，engine 0；后续明确新 run（同 cap 新 handle）可重新走完整检查，内部没有自动重试 |
| claim 写入 rename 已尝试但未确认 | `WRITE_UNKNOWN`，共享锁闭，engine 0 |
| claim 已确认，engine 抛错/坏协议/record=null | 首次返回固定 **`TASK_OWNER_EXECUTION_UNKNOWN`**（不是 `ok:true`/RECORDED，也不是普通可重试 WRITE_REJECTED），保留 CLAIMED 墓碑，不重跑 |
| claim 已确认，最终提交 rename 前普通失败 | 同上：首次固定 `EXECUTION_UNKNOWN` |
| 最终提交 rename 已尝试但未确认 | `WRITE_UNKNOWN` + 共享锁，其他任务也不得绕过 |
| engine 合法 Task UNKNOWN | 原样保存 Task UNKNOWN，与 owner/存储 UNKNOWN 分开，不重试 |

`RECORDED` 只用于首次**可信 FINAL 已确认**。同一墓碑之后的 `run`/`get` 仍返回 11 键安全投影：`EXISTING`/`FOUND` + `ownerState=UNKNOWN` + `reason=TASK_OWNER_EXECUTION_UNKNOWN`，engine 新增 0。三种 UNKNOWN 互相独立：Task UNKNOWN（`task.state=UNKNOWN`）、owner 执行 UNKNOWN（无可信 FINAL）、存储 UNKNOWN（`WRITE_UNKNOWN`/损坏 + 共享锁）。

**可信返回协议（08-D-C-F01）。** engine 完全不变；owner 侧只做薄适配守卫：私有根恰 `record`/`result`，result 根成功信封恰 `ok`/`value`，value 恰旧 13 键且版本/phase/`messageZh`/`states` 类型正确、`mockOnly=true`、`realOperationAllowed=false`、`submitAllowed=false`、`automaticRetryAllowed=false`；record 再走原唯一 `validateAudioTaskRecord`、出生不可变字段与投递门禁，并与 `projectAudioTask(record)` 的真实结果做**完整结构等价**比较（不只看 TaskId/phase）；BLOCKED 只接受四个固定 reason 且 record 必须等于出生 record，SIMULATED 只接受合法 reason 集合与状态集。缺键、坏形状、访问器/异常、相似但非法值一律视为不可用结果，不回显未知值。`value.task` 在比较前先按真实 `projectAudioTask` 键集做 **data-descriptor 守卫**：必须是 plain 对象、恰好全部自有可枚举 data 属性、无 accessor/hidden/Symbol/额外键，随后只比较安全拷贝；因此 `task.state` 的 getter 不会被调用（调用 0 次），hidden 与 Symbol 键也会被拒绝而不是被 `Object.keys`/`JSON.stringify` 丢掉。

**内部存储封闭（08-D-C-F01）。** `fixture-task-store-internal.mjs` 只绑定两个固定文件及其预算/错误域/已知 Schema：调用方只能选择 `catalog`/`owner` 两个内部操作与两个错误域，不能传文件名、预算或 parse 回调；非法域在任何读写前拒绝（0 读 0 写 0 caller parser），不会创建第三个正式文件或逃逸 root。此为本模块内部契约封口，不表示 Node 私有模块能限制同权限恶意 JS 直接使用 `fs`。

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

`test/task-owner.test.mjs`（20 项）覆盖 050 的 C01–C08、C10、051 的 T01–T06 与 052 的 E01–E05；C09–C12 为回归/文档/CI/PR 项，本次据实重跑。v1.2 只更正 E01 的真实注入顺序（after 真实 fsync 成功）并补齐 E04 故障前已有两个 owner + 一个 catalog handle 的可用控制与故障后各操作/新工厂的锁闭断言；0048 的“E01–E06 全部闭合”与 E04“全锁”表述以本表为准（0048 文件未改动）。T01–T03 的 engine/fs 故障注入只存在于测试文件内的独立 worker（同一 VM module graph，catalog facade 与 owner 共享同一 store 实例/队列/锁/摘要），产品无注入接口。原 catalog 45（44 pass + 1 本环境 EPERM skip）、D-B 28、旧 runner 20 保持。

| ID | 状态 | 本次证据来源 |
|---|---|---|
| C01 | 已证（复跑） | 真实出生 → 一次 engine → FINAL；catalog 字节不变；目录仅 3 文件；公开 11 键 |
| C02 | 已证（复跑） | 同 handle 并发/重开/错 scope/不存在；总 engine 1 |
| C03 | 已证（复用） | 7 个 context 场景逐个保存并重开读回；重复 run 只读 |
| C04 | 已证（复用） | TTS/权利/源缺失/资源四类合法阻断；重复只读 |
| C05 | 已证（加强） | 同 cap 同一 sandbox：claim fsync 故障 → `WRITE_REJECTED`、faultAt.engine=0、无 owner 文件；清障后同 cap 新 handle 再 run → `RECORDED`，总 engine 1 |
| C06 | 已证（更正） | 13 类不可用 engine 返回 → 首次固定 `EXECUTION_UNKNOWN`、CLAIMED 墓碑、后续 UNKNOWN、总 engine 1；最终普通失败同 |
| C07 | 已证（复用） | 空/坏 JSON/版本/多键/revision/确认后外改；整库拒绝、不修复、不采用 |
| C08 | 已证（复用） | 3 导出、14 码、11 键、descriptor、深冻、无路径/正文泄漏 |
| C09 | 已证（本轮） | 专项 `catalog+record+runner+owner` 113/112 pass/1 platform skip/0 fail；旧断言未删弱 |
| C10 | 已证（复用） | 文档 4 个完整 JSON 原样执行（reserve/成功/阻断/读取） |
| C11 | 已证（本轮） | 全量 `node --test` 658/656 pass/0 fail/2 platform skip；build 未变；语法与 client 同步 |
| C12 | 已证（本轮） | 原 PR33 追加提交、未合并、完整报告与真实回执 |
| T01 | 已证（新增） | claim 真实 rename 后出生坏盘 → engine0/`STORE_INVALID`/锁；engine 后合法出生外改 → 不写 FINAL/`STORE_CHANGED`/锁；真实 FINAL rename 后确认失败 → 实际字节保留/`WRITE_UNKNOWN`/全锁；工厂坏关联 → `BIRTH_INVALID` |
| T02 | 已证（新增） | 真 FINAL 控制 + 真实 engine 后仅改投影/flag/缺字段/版本/states/访问器/根多键 → 全部 `EXECUTION_UNKNOWN` + CLAIMED、总 engine 1 |
| T03 | 已证（新增） | 2 owner + 1 catalog handle 并发同 Task → engine1/无死锁；claim rename 后未知 → 共享锁；最终普通失败 → 本 Task UNKNOWN 而无关 Task 可执行；FINAL rename 后回读失败 → 盘上 FINAL + 全锁不重跑 |
| T04 | 已证（新增） | 第三 name/spec/caller parser/缺 domain → `INTERNAL_FAILURE`、0 读 0 parser、无第三文件；两固定文件与其固定域正常 |
| T05 | 已证（新增） | 合法 CLAIMED 控制；同 scope 重复/跨 scope/错 birth hash/非法 FINAL 状态与 reason/revision/缺关联/未知 phase/CLAIMED 带 completion → 整库拒绝不修复；32 条合法、33 条 `RESOURCE_LIMIT`；128 KiB 合法、128 KiB+1 拒绝 |
| T06 | 已证（新增） | depth12 合法/depth13 拒绝/过宽数组拒绝（engine 0、无 owner 文件）；输出与输入图不共享、两次结果不共享、输入冻结态不变；已阻断任务改可执行后 engine 新增 0、盘字节不变 |
| E01 | 已证（v1.2 顺序更正） | 正常子对象控制；第二次 owner temp 真实 `fsyncSync` **成功返回之后**才做出生 `observedAt` 合法改动（`afterRealCall=true`/`realCallOk=true`/`legalBirthValid=true`、命中 1）→ rename 前停提交：`STORE_CHANGED`、总 owner rename 仅 claim 1（FINAL rename 0）、盘上 CLAIMED/revision 1、共享锁、engine 1 |
| E02 | 已证（新增） | 仅坏 `birthIdentityHash`（schema 合法）→ 工厂 `BIRTH_INVALID` 且同 cap 已锁：既有 catalog handle 的 get/reserve、新 catalog、新 owner 工厂全部 `*_UNKNOWN`，catalog 字节/条目数与 owner 字节不变、无新 ID；合法 `NOT_FOUND` 对照不锁全库 |
| E03 | 已证（新增） | 真实引擎先运行；仅把 `task.state` 改成返回原值的 getter / 加 hidden 键 / 加 Symbol 键 → getter 实际调用 **0** 次、首次固定 `EXECUTION_UNKNOWN`、CLAIMED 无 FINAL、后续 `EXISTING`+UNKNOWN、总 engine 1 |
| E04 | 已证（v1.2 全 handle 补证） | 故障前取得并证明可用：2 个 owner handle + 1 个 catalog handle（同一合法 payload 的 `reserve` 返回 `EXISTING`）；真实 FINAL 已落盘后对 **catalog 出生文件**注入一次故障（命中 1、`ownerRenames=2`）→ `WRITE_UNKNOWN`、盘上 FINAL/revision 2 保留；故障后两个已有 owner 的 run/get 均 `OWNER_UNKNOWN`，已有 catalog 的 get 与同一合法 reserve 均 `CATALOG_UNKNOWN`，新 catalog/owner 工厂各域 UNKNOWN；两文件字节/条目、engine 1、owner rename 2 全部不变 |
| E05 | 已证（新增） | `ABSENT→PRESENT` 变化先用真实 existing engine 独立证明“改后合法可执行”（SIMULATED/ARTIFACT_READY），再同 Task 重复 run → `EXISTING`/原 `NO_EXECUTION`/盘字节不变/engine 新增 0；7 个 context + 4 类合法阻断共 11 例，逐一“首次 +1、重复 +0”；原 B12 深度 12 合法 TTS 完整 input 穿 owner 包装仍接受、depth13 `RESOURCE_LIMIT`；调用方可变输入逐对象冻结态与 JSON 前后不变 |

平台限制：本环境 hardlink/symlink 相关旧断言按既定 EPERM skip 记录，不据此修改产品拒链策略。本文档不预填未执行的通过数。

## 13. 候选保存事务契约（PLANNED，尚未实现）

同一 claim 内把 `PROCESSING + bytes` 保存进演示资产库的候选契约见
[TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md](TASK_ARTIFACT_SAVE_TRANSACTION_CONTRACT.md) v1.6
（`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`）。

**当前 owner 仍未实现保存**：工厂只有 `run`/`get`，`FINAL` 只允许 `SIMULATED`/`NO_EXECUTION`，
不写 `SAVED`、不调用资产库、不产生 `artifactRef`；owner 快照现为 v1、`revision` 按
`CLAIMED=1 / FINAL=2` 权重累计。本文第 1–12 节全部为既有行为，仍为 `OFFLINE` / `FIXTURE_ONLY` /
`NOT_INTEGRATED`；候选文档不是运行时代码授权。

## 14. 共享存储基础模块（08-E-E-B Step 1，已实现）

`core/audio/fixture-store-base-internal.mjs` 是唯一共享 helper 家园（15 个内部导出）：`StoreFailure` 与错误 helper、`isPlainObject`/`keySurface`/`hasOwn`/`sha256`/`stableStringify`、`checkSandbox`（含 marker/有界读/身份闭包）、`readBoundedPath`/`sameIdentity`/`assertRegularStat`、`normalizePath`/`isInside`。

Task-store 仍兼容重导出原十个共享名且保持**同一绑定**（`StoreFailure` 仍只有一个类）；catalog/owner/library 的既有 import 与行为不变。本切片不改变 owner 的 v1 快照、`run`/`get` 语义与两固定文件；保存运行时（save/status/v2/proof）仍未实现，owner 仍只输出 `SIMULATED`/`NO_EXECUTION`。


## 15. 同一 claim 保存事务（08-E-C，离线实现）

`openFixtureTaskOwner` 现返回 `{run, get, save, artifactStatus}`；公开 `schemaVersion` 恒为 `1`，磁盘 owner 快照新增 `v2`（含一条 `SAVED` FINAL 时才写 v2，只读不写盘升级）。

- `save` 请求恰八键 `schemaVersion/scopeId/taskId/requestKey/now/expiresAt/rights/input`，`input` 恰四键，沿用原两分区 copy 与预算；成功值 = 原 11 字段 + `artifact`（仅本次 SAVED 携 `{artifactRef, byteLength, sha256, expiresAt}`，其余 `artifact:null`）。
- 唯一 writer 在 pre（temp fsync 后、rename 前）与 post（rename 后）按 entry 差分强制 proof：恰一条 `CLAIMED -> SAVED FINAL` 必须携带本次冻结 `SaveProof`（根 11 键 + artifact 8 键 + 19 键 inspection，`claimRevision=当前 revision`、`claimDigest=sha256(当前完整字节)`、`candidateRevision=claim+1`、`evaluatedAt=request.now`）；缺 proof/错形状/错任务/一次多任务/改写历史 SAVED 一律 pre `WRITE_REJECTED`（无锁）。
- 新增内部 `readStoredForSave(artifactState,{scopeId,artifactRef,now})`：同步、免重入、fresh；四态 `STORED/DELETED/EXPIRED/MISSING`，`MISSING` 时 `artifact=null`，其余恰八键且 inspection 19 键；`DELETED` 优先 `EXPIRED`。
- 新增 `importInQueue(artifactState,input)`：仅供持 Artifact 队列的 owner 使用，复用原七键解析/owned-copy/原 `importOnce`，不再入队。
- `artifactStatus` 五键输入、六字段输出，按契约十四步优先级；`UNKNOWN`/`MISSING`/`RIGHTS_REJECTED` 不泄漏 ref/expiry；历史 `get` 不因删除/过期/撤权改历史。
- 新增 8 个公开错误码（共 22）：`SAVE_INPUT_INVALID`/`SAVE_RIGHTS_REJECTED`/`SAVE_EXPIRED_REQUEST`/`SAVE_PRECONDITION`/`SAVE_ARTIFACT_REJECTED`/`SAVE_ARTIFACT_UNKNOWN`/`SAVE_TASK_REJECTED`/`SAVE_UNKNOWN`，reason 固定，不套用旧小写规则。

本地证据：`test/task-owner-save.test.mjs` 15 项全通过（含真实 fs 故障：claim rename 未知、库 rename 未知、FINAL rename 未知、post 确认失败、FINAL 内 Task/Artifact 外改、成功后外改）；全量 719 测试 716 通过 3 平台 skip 0 失败。

未完成：11 个固定故障代表中 joint 阶段两项、公开流程坏 proof、库 pre 拒绝与 delete 排队等未逐一取证；文档示例尚未由测试原样载入执行。本轮不改变真实保存、TTS、微信或 Host 能力。

### 15.1 完整可执行示例（真实出生 → save → status → 旧 get）

示例只描述**请求形状与固定安全值**；其中 `taskId`、`artifactRef`、`sha256`、`byteLength` 等运行期事实由真实 catalog 签发与本次导入产生，使用时用真实值替换，不能把示例值当 cap 或固定结果。

保存请求（八键；`input` 与原 `run.input` 同构）：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-<real-issued-32-hex>",
  "requestKey": "save:fixture-demo-1",
  "now": "2026-10-27T00:00:01.000Z",
  "expiresAt": "2026-10-28T00:00:00.000Z",
  "rights": { "state": "GRANTED", "proofRef": "fixture-rights:demo-1" },
  "input": { "schemaVersion": 1, "sourceInput": {}, "readiness": {}, "context": {} }
}
```

成功值（恰十二键；只有本次 SAVED 携 `artifact`，其余 `ok:true` 为 `artifact:null`）：

```json
{
  "schemaVersion": 1,
  "outcome": "SAVED",
  "revision": 2,
  "ownerState": "SAVED",
  "reason": null,
  "task": {
    "schemaVersion": 1,
    "taskId": "task:fixture-<real-issued-32-hex>",
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
    "artifactRef": "artifact:fixture-bytes-<real-32-hex>",
    "byteLength": 88244,
    "sha256": "<real-sha256>",
    "expiresAt": "2026-10-28T00:00:00.000Z"
  },
  "userMessageZh": "演示结果已保存到本地演示资产库；这不会发送到微信，也不代表真实生成。",
  "mockOnly": true,
  "realOperationAllowed": false,
  "submitAllowed": false,
  "automaticRetryAllowed": false
}
```

状态请求与结果（五键输入、六字段输出；本例为当前可读取）：

```json
{
  "schemaVersion": 1,
  "scopeId": "scope:fixture-demo",
  "taskId": "task:fixture-<real-issued-32-hex>",
  "now": "2026-10-27T00:00:02.000Z",
  "rights": { "state": "GRANTED", "proofRef": "fixture-rights:demo-1" }
}
```

```json
{
  "schemaVersion": 1,
  "state": "READABLE",
  "ownerState": "SAVED",
  "artifactRef": "artifact:fixture-bytes-<real-32-hex>",
  "expiresAt": "2026-10-28T00:00:00.000Z",
  "messageZh": "演示资产当前可读取。"
}
```

时序与限制：`schemaVersion` 公开恒为 `1`；磁盘 owner 快照首次写 SAVED 升 `v2`（`schemaVersion:2`），此前 `v1`；两次 rename（模板→正式、Artifact→Task）**非原子**；Task 与 Artifact 各自独立锁；`UNKNOWN` 不自动重试、不回滚、不重造 ID；`SAVED` 只代表演示资产，不是真实生成、版权或投递证据。
