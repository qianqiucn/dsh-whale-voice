# Whale Voice · 同一 claim 内的任务保存事务契约（候审）v1.4

> **状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
> 候审技术契约，不是已实现功能，不构成运行时代码授权。现有 owner 仍只有 `run`/`get`
> （`SIMULATED`/`NO_EXECUTION`），库仍只有 `FIXTURE_IMPORT`；**没有任务保存能力**。
>
> 基准 `main` **M `08cf0b61acc402d619618df2ad15bce5436b0873`**；`文件:行` 以 M 为准。
> v1.4 按 074 补齐 delta/proof、成功 schema、22 码与事实映射、固定调用路径与真实故障设计；
> 070–073 已过项与 0066–0069 原文保留。

---

## 1. 现状关键事实（M）

| 域 | 事实 | 出处 |
|---|---|---|
| engine | bytes 导出 `:994`、旧 existing `:971`、producer `:755`、`BEGIN_PROCESS` `:761`、PROCESSING 返回 `:769-782` | `task-fixture-engine-internal.mjs` |
| 库 writer | fsync `:715`、最后 temp 门禁 `:800-838`、唯一 rename `:845`、post `:851-873`；`:889` 是 `INTERNAL_FAILURE` | `fixture-artifact-store-internal.mjs` |
| Task writer | fsync `:803`、current/pre `:869-885`、rename `:889`、post `:895-918`；写前外改 `:734-736`；关联坏 `:574-581` | `fixture-task-store-internal.mjs` |
| owner 转发 | `writeOwner(state,bytes,baseDigest,revision)` 在 `owner:259-260`；FINAL `revision=claimRevision+1`（`:480`、`:500`） | `task-owner.mjs` |
| run/get | `run`:80-81 四键；`get`:81 三键；无 entry 时 `run` claim 执行、`get` `NOT_FOUND`（`:539-541`）；已有 entry：`run` `EXISTING`、`get` `FOUND`；`successValue` 11 字段（`:146-164`） | 同上 |
| revision | `1×CLAIMED + 2×FINAL`（`:462-524`） | task-store |
| 文件/预算 | `audio-task-owner-v1.json`、128 KiB/32 条（`:29,31,33`）；`^task:fixture-[0-9a-f]{32}$`（`:45`） | 同上 |
| 库 | 常量 `:40-46`；import 七键；proof 后缀 `{1,128}` 且总长 ≤128（实际 ≤113）；时钟 `.sssZ`；`metadataOf` 无 identityHash；rights 形状 `:289-308` | `artifact-library.mjs` |
| isInside | 原序 `isInside(parent, child)`（`config-sandbox:24`；task-store `:226` 以 `root, real` 调用） | 两文件 |

---

## 2. 版本、claim 摘要与强制 delta proof

### 2.1 current claim 版本 ≠ candidate FINAL 版本

| 阶段 | 比较 |
|---|---|
| pre（读当前 CLAIMED） | `freshCurrent.revision === proof.claimRevision`；`freshCurrent.digest === proof.claimDigest === baseDigest` |
| 候选 | `candidateRevision = claimRevision + 1`；`writeOwner`/writer 的 `expectedRevision === candidateRevision` |
| post（已 rename） | `sha256(bytes) === parsed digest`、`parsed.revision === expectedRevision`、record/ref 一致；**不再**与 claim 比较 |
| 错误分流 | 当前快照读取/摘要不符 → `STORE_CHANGED`+Task 锁；仅 proof 形状/候选版本不符 → `WRITE_REJECTED`（无锁） |

### 2.2 强制 delta 规则（写回主契约）

1. writer 真实读取 current 与 candidate，按 **entry 差分**分类：
   - **仅本次唯一 CLAIMED → 新增 SAVED FINAL**：必须携带本次 proof；
   - 无 proof、错误形状、对应错任务、一次改多任务、借 proof 改写已有 SAVED：一律 **pre 拒绝**（`WRITE_REJECTED`，无锁）；
   - 普通 CLAIMED 写入、旧 `SIMULATED`/`NO_EXECUTION` 写入、原样保留历史 SAVED：允许 **proof=null**；
   - 库已删除不拦旧 `run` 追加其他任务；不触碰该历史、不重 import。
2. proof 严格 **根 11 键**：`schemaVersion, scopeId, taskId, birthIdentityHash, birthObservedAt,
   claimRevision, claimDigest, candidateRevision, recordIdentityHash, artifact, evaluatedAt`；
   **artifact 恰 8 键**：`artifactRef, identityHash, byteSha256, byteLength, expiresAt, requestKey, rights, inspection`。
   `rights` 沿原两键形状（`artifact-library:289-308`）；`inspection` 沿原 19 键严格解析及数值界限
   （`wav-byte-inspector` 的 WAV 预算：`byteLength ≤ 1 MiB`、采样率/声道/帧数/peak[0,1]）；
   `byteLength` 沿原 WAV 与 1 MiB 预算。
3. `evaluatedAt` 必须等于请求 `now`（示例 `2026-10-30T23:00:00.000Z`）；所有字段按 §2.4 左右操作数在 pre/post 核对。
4. **一般 claimDigest** 来自“本次已确认 CLAIMED 完整快照字节”的 SHA256；下面的 791B/`e30bee44…`
   只是固定 fixture 值，**其他任务/多 entry 不得硬编码该摘要**。
5. post 阶段（rename 已发生）不报 `WRITE_REJECTED`，按 writer 中性错误与 owner 公开映射分层（§8）。

### 2.3 可复算示例

固定 fixture 的 CLAIMED 快照（`revision=1`，唯一 entry）见 §5.1；紧凑 JSON 为 **791 bytes**，
SHA256 `e30bee44aef05a134df2680e39cde609b3a3a8ec541d4e872457f7ffea43f50a`（仅该 fixture）。

### 2.4 proof 左右操作数

| 域 | 左（proof/候选） | 右（fresh 权威） | 检查点 |
|---|---|---|---|
| scope/task | `proof.scopeId/taskId`、candidate record | fresh 出生、当前唯一 CLAIMED、请求 | pre |
| birth | `proof.birthIdentityHash/birthObservedAt` | fresh 出生 `identityHashOf` 与 observedAt；另核 taskId/observedAt 字符串 | pre+post |
| record | `proof.recordIdentityHash` + `sameImmutable` | `identityHashOf(candidate)` + 出生全部不可变字段（taskId/feature/taskType/source/voiceProfileId/rights.state/deliveryRequested/observedAt） | pre+post |
| claim/candidate | `claimRevision/claimDigest`、`candidateRevision` | 当前 CLAIMED revision/digest；`expectedRevision=candidateRevision` | pre |
| actual STORED | `artifact.*`（含 19 键 inspection） | 本次唯一新 STORED 的规范字段 + fresh 严格库解析 + candidate `outputArtifactRef` | pre+post |

- `recordIdentityHash` 与 `birthIdentityHash` 在 `identityOf` 算法下可能相等（identity 不含 state/ref），
  因此 record 绑定还必须用 `sameImmutable` + 显式 `state=SAVED`、`outputArtifactRef=artifactRef` 判定。
- 生命周期：import 返回后构造 → 冻结 → `writeOwner` 第 5 实参 → pre/post 读取 → 调用结束丢弃；不写盘。

---

## 3. 唯一候选方案

同一 claim 内：bytes 引擎一次 → 持 Artifact 队列、非重入 import 一次 → `ATTACH_FAKE_ARTIFACT` →
`MARK_SAVED` → 带 proof 的严格 `FINAL(SAVED)` → 联合确认。
合法非 SUCCESS/阻断按旧 owner 写 `SIMULATED`/`NO_EXECUTION` FINAL，不 import。

---

## 4. 旧方法、save 与 status 的完整 schema，22 码与事实映射

### 4.1 旧 run/get 与 save 成功 value

- 旧 `run`/`get` 保留 M `successValue` 的 **11 字段**：`schemaVersion, outcome, revision, ownerState,
  reason, task, userMessageZh, mockOnly, realOperationAllowed, submitAllowed, automaticRetryAllowed`；
  `task` 用 `projectAudioTask` 的 **14 字段**与固定演示后缀，不增字段。
- `run` 对已有 entry 用 `EXISTING`，`get` 用 `FOUND`；CLAIMED 均是 **`ok:true` UNKNOWN 历史投影**，
  `reason=TASK_OWNER_EXECUTION_UNKNOWN`。
- `save` 成功 value = 上述 11 字段 **+ artifact**，恰 **12 键**：
  - 本次 SAVED：`artifact` = `{artifactRef, byteLength, sha256, expiresAt}`，均来自本次已确认 STORED；
  - 其余 `ok:true` 结果：`artifact=null`。
- 已有任一合法 FINAL → `EXISTING` + 原 `ownerState`/原 `reason`，不接管、不重跑、不重读库补 metadata；
  已有 SAVED 的当前可用性只问 `artifactStatus`。
- 合法非 SUCCESS / 阻断 → `SIMULATED` / `NO_EXECUTION`，保留既有 Task 结论。
- 已有 CLAIMED 的新 save → `TASK_OWNER_SAVE_UNKNOWN` 错误。
- 无出生 → 既有 `TASK_OWNER_NOT_FOUND`；`TASK_OWNER_SAVE_PRECONDITION` 仅用于“格式已合法的本次 input
  与出生完整身份不一致、尚未 claim”的前置拒绝，**不用于已有合法 FINAL**；claim 后 fresh 关联坏 →
  原 `BIRTH_INVALID`/原锁。
- 类型/字符串格式沿原边界；`mockOnly=true`，其余三个 Allowed=false；新 SAVED 中文为固定演示保存说明；
  旧方法旧文案不改；失败根统一 `{ok:false, errors:[{code,path,reason}]}`。

### 4.2 status 完整六字段与唯一顺序

`ok:true` 根 `{ok,value}`，value 恰 **6 键**：`schemaVersion`(1)、`state`(六选一)、`ownerState`
(null/SIMULATED/NO_EXECUTION/SAVED/UNKNOWN)、`artifactRef`(ref/null)、`expiresAt`(.sssZ/null)、
`messageZh`（固定中文）。无 bytes/sha/proof/record。输入仍五键；格式错用旧 `INVALID_INPUT`（path=字段），
版本错 `UNSUPPORTED_VERSION/schemaVersion`。

| 顺序 | 判断 | 返回 |
|---|---|---|
| 1 | Task 共享域已锁 | 错误 `TASK_OWNER_OWNER_UNKNOWN/$/owner unknown` |
| 2 | `freshAssociations` 固定读取链抛原 `StoreFailure` | 原 `toFailure` 映射：`TASK_OWNER_+key`、`path=error.errorPath`、`reason=storeReason(key)`；保留该函数对 Task 锁的实际修改 |
| 3 | fresh 关联校验不匹配 / 无出生 | `BIRTH_INVALID/$/birth invalid`（Task 锁）/ `NOT_FOUND/$/not found` |
| 4 | 无 owner entry | `MISSING/null`，ref/null，exp/null，`没有已保存的演示资产。` |
| 5 | 旧 FINAL SIMULATED/NO_EXECUTION | `MISSING/原kind`，同上文案 |
| 6 | CLAIMED | `UNKNOWN/UNKNOWN`，`无法确认这次演示保存结果。` |
| 7 | SAVED 且当前 rights 非 GRANTED 或 proofRef=null | `RIGHTS_REJECTED/SAVED`，ref/exp 均 null，`当前授权不允许读取此演示资产。` |
| 8 | SAVED 且 Artifact 域已锁 | 错误 `TASK_OWNER_SAVE_ARTIFACT_UNKNOWN/$/artifact import unknown` |
| 9 | fresh 库首次外改/损坏 | `TASK_OWNER_STORE_CHANGED/$/store changed` 或 `STORE_INVALID/$/store invalid`，原 Artifact 锁；后续同第 8 行 |
| 10 | SAVED 但库无 ref | `MISSING/SAVED`，`演示资产当前不存在。` |
| 11 | 当前 GRANTED 但 proof 与库 entry 不符 | `RIGHTS_REJECTED/SAVED`，`当前授权不允许读取此演示资产。` |
| 12 | 该 ref 为 DELETED | `DELETED/SAVED`，ref/原 expiresAt，`演示资产已删除。` |
| 13 | STORED 且 now>=expiresAt | `EXPIRED/SAVED`，ref/expiresAt，`演示资产已过期。` |
| 14 | STORED 有效 | `READABLE/SAVED`，ref/expiresAt，`演示资产当前可读取。` |

方法序列：cap 与已知 Task 锁在前；格式/版本在真实读之前；表内顺序固定。rights 形状沿
`artifact-library:289-308`；`DENIED/UNKNOWN/null proof` 是合法形状但不可读；非法字符串/类型是输入错误；
rights 拒绝不得泄露 ref/expiry。库未能 fresh 读取时不得假称 proof 匹配或 READABLE。历史 `get` 不因 status 改变。

### 4.3 22 码完整表

| # | 最终 code | path | 固定 reason |
|---|---|---|---|
| 1 | `TASK_OWNER_INVALID_INPUT` | `$`/`<unknown-key>`/`scopeId`/`taskId`/`input` 及原 `readOptions`/`readExactRoot` 位置；新 status 另含 `now`/`rights` | `invalid input` |
| 2 | `TASK_OWNER_RESOURCE_LIMIT` | `input` 或 `$`（按预算边界） | `resource limit` |
| 3 | `TASK_OWNER_UNSUPPORTED_VERSION` | `schemaVersion` 或 `input` | `unsupported version` |
| 4 | `TASK_OWNER_SANDBOX_INVALID` | `$` | `sandbox invalid` |
| 5 | `TASK_OWNER_NOT_FOUND` | `$` | `not found` |
| 6 | `TASK_OWNER_BIRTH_INVALID` | `$` | `birth invalid` |
| 7 | `TASK_OWNER_STORE_INVALID` | `$` | `store invalid` |
| 8 | `TASK_OWNER_STORE_CHANGED` | `$` | `store changed` |
| 9 | `TASK_OWNER_WRITE_REJECTED` | `$` | `write rejected` |
| 10 | `TASK_OWNER_WRITE_UNKNOWN` | `$` | `write unknown` |
| 11 | `TASK_OWNER_OWNER_UNKNOWN` | `$` | `owner unknown` |
| 12 | `TASK_OWNER_EXECUTION_UNKNOWN` | `$` 或旧成功 `value.reason`（不新增抛错路径） | `execution unknown` |
| 13 | `TASK_OWNER_DEPENDENCY_FAILURE` | `$` | `dependency failure` |
| 14 | `TASK_OWNER_INTERNAL_FAILURE` | `$` | `internal failure` |
| 15 | `TASK_OWNER_SAVE_INPUT_INVALID` | 已知坏字段；未知键 `<unknown-key>`；缺键/根形状 `$`；input 子结构统一 `input` | `save input invalid` |
| 16 | `TASK_OWNER_SAVE_RIGHTS_REJECTED` | `rights` | `save rights rejected` |
| 17 | `TASK_OWNER_SAVE_EXPIRED_REQUEST` | `expiresAt` | `save request expired` |
| 18 | `TASK_OWNER_SAVE_PRECONDITION` | `$` | `save precondition failed` |
| 19 | `TASK_OWNER_SAVE_ARTIFACT_REJECTED` | `$` | `artifact import rejected` |
| 20 | `TASK_OWNER_SAVE_ARTIFACT_UNKNOWN` | `$` | `artifact import unknown` |
| 21 | `TASK_OWNER_SAVE_TASK_REJECTED` | `$` | `task attach or save rejected` |
| 22 | `TASK_OWNER_SAVE_UNKNOWN` | `$` | `save outcome unknown` |

- 版本固定：新 save 根 `schemaVersion` 错 → `TASK_OWNER_UNSUPPORTED_VERSION/schemaVersion`；
  `input.schemaVersion` 错 → `TASK_OWNER_UNSUPPORTED_VERSION/input`；status 版本错同样用该码；
  不归 `SAVE_INPUT_INVALID`。
- status 调用原 `freshAssociations` 链的 `STORE_INVALID/RESOURCE_LIMIT/STORE_CHANGED/SANDBOX_INVALID/
  WRITE_UNKNOWN` 按原 `toFailure` 映射；非原有效 `StoreFailure` → `TASK_OWNER_INTERNAL_FAILURE/$`。
- `EXECUTION_UNKNOWN` 在成功投影里是**原完整 code**（`TASK_OWNER_EXECUTION_UNKNOWN`），不是英文 reason。

### 4.4 事实映射（错误/状态之后的后续结果）

| 错后事实 | run / get | save / status | factory 与其他域 |
|---|---|---|---|
| 无 entry、无锁、出生有效 | run 可走原 claim；get `NOT_FOUND` | save 可发起一次；status `MISSING/null` | Task/Artifact 原工厂可开 |
| CLAIMED、无 Task 锁 | run `EXISTING/UNKNOWN`；get `FOUND/UNKNOWN`（ok:true、原 reason） | save `SAVE_UNKNOWN`；status `UNKNOWN/UNKNOWN` | catalog 原操作可用；Artifact 锁独立 |
| 已合法 FINAL、无 Task 锁 | run `EXISTING`/get `FOUND` + 原 kind（含 SAVED） | save `EXISTING`+原 kind、artifact=null；status 按 §4.2 | catalog/owner 工厂原逻辑 |
| Task 共享锁 | 所有 owner factory/run/get/save/status → `OWNER_UNKNOWN/$/owner unknown` | 同左，无成功 value | catalog factory/reserve/get → `CATALOG_UNKNOWN/$/catalog unknown`；Artifact 不因此锁 |
| Artifact 锁、Task 无锁 | run/get/owner factory/catalog 只依 Task 事实 | CLAIMED/旧非 SAVED 先按 Task；SAVED 的 status 与真正到库门禁的新 save → `SAVE_ARTIFACT_UNKNOWN`；调用数与序列同既定 | Artifact 全方法 `LIBRARY_UNKNOWN/$/原 library reason` |

旧 Artifact 错误 reason 用其原 REASONS，不把 owner `storeReason` 用到库。

---

## 5. 存储、revision 与兼容

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

CLAIMED 快照（791B，摘要见 §2.3）：

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

SaveProof（根 11 键 + artifact 8 键，含 evaluatedAt）：

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
  },
  "evaluatedAt": "2026-10-30T23:00:00.000Z"
}
```

save 安全输出（12 键，含 artifact）：

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

所有 hash/长度/proof 与 M 原算法一致；示例只属候选，不表示 v2 可被现 parser 解析。

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
| 11 | `writeOwner(...,candidateRevision,proof)` 写 FINAL | 持有 | pre `WRITE_REJECTED`；post `WRITE_UNKNOWN` |
| 12 | 联合确认 → 释放 | — | SAVE_UNKNOWN 若失败 |

线性化：库 rename `:845`、Task rename `:889`；非跨文件原子。

---

## 7. 固定调用路径、helper 与依赖

### 7.1 调用链

```text
save(input)
  → writeOwner(state, bytes, baseDigest, candidateRevision, proof)        // task-owner.mjs:259-260
  → openOwnerFile(state).write(bytes, baseDigest, candidateRevision, proof) // task-store writer
```

旧调用 `writeOwner(state, bytes, baseDigest, revision)` 默认 `proof=null`；新增第 5 实参必须逐层转发，不能只改最内签名。

### 7.2 `readStoredForSave`

```text
readStoredForSave(artifactState, { scopeId, artifactRef, now })
  → { ok:true, value:{ state:'STORED'|'DELETED'|'EXPIRED'|'MISSING', artifact } }
  → { ok:false, errorKey, path }
```

- 同步、免重入、fresh 严格读；不拿 Artifact 队列。
- `MISSING` 时 `artifact=null`；其余 `artifact` 恰 **8 键**
  `{artifactRef,identityHash,byteSha256,byteLength,expiresAt,requestKey,rights,inspection}`，
  全部取原规范 entry 与 inspection；`DELETED` 保留原墓碑 inspection。
- 优先级：`DELETED` 先于 `EXPIRED`；已锁 → `LIBRARY_UNKNOWN`；非预期异常 → `INTERNAL_FAILURE`。
- writer 仅接受 `STORED` 且与 proof 完整匹配；status 按 §4.2 转公共结果。

### 7.3 同 cap、base 与依赖边

- 不新增 proof cap 字段/品牌 lease/第三文件；“同 cap”由 owner/writer 捕获的受信 Task state 与
  `getArtifactState(state.sandbox)` 确定；proof 全部字段按当前 CLAIMED/出生/该库验证。删除任何
  “`state.sandbox === proof来源`”伪比较。
- base（新 `fixture-store-base-internal.mjs`）唯一复用原 `StoreFailure` 类与检查算法；有界读/身份/marker
  私有闭包随原函数迁移，不重写第二套安全算法；`isInside(parent,child)` 保持原序（`config-sandbox:24`，
  task-store `:226` 以 `root,real` 调用），不翻转。
- 兼容：Task-store 从 base 导入并**兼容重导出**旧共享名；catalog 与 artifact-library 原 helper imports 仍有效；
  artifact-store 原 Task-store 共享依赖改到 base，解除反向环；base 从 config-sandbox 复用并按原签名转出
  `normalizePath/isInside`，原 config 导出不改。

| importer | dependency |
|---|---|
| base | config-sandbox（`isTrustedSandbox`）、`normalizePath`/`isInside` 原算法 |
| artifact-store | base（StoreFailure/检查/有界读/身份/marker 闭包） |
| Task-store | base；artifact-store（`readStoredForSave`） |
| artifact-library | artifact-store；Task-store 兼容共享出口 |
| task-owner | Task-store；artifact-library；artifact-store（`getArtifactState`） |

初始化顺序：config-sandbox → base → artifact-store → Task-store → library → owner；无环、无 TDZ。

---

## 8. 锁与失败矩阵

### 8.1 锁可见性

| 事件 | catalog factory/reserve/get | owner factory/run/get/save/status | artifact factory/import/get/readBytes/delete |
|---|---|---|---|
| Task 域锁（claim/final/BIRTH_INVALID） | `CATALOG_UNKNOWN` | `OWNER_UNKNOWN` | 不变 |
| Artifact 域锁 | 不变 | run/get 历史不变；save/status 报库错 | `LIBRARY_UNKNOWN` |
| 无锁 | 正常 | 按状态 | 正常 |

### 8.2 失败类别（writer 中性首错 vs owner 公开首错）

| # | 场景 | 磁盘 | engine | import | Task 锁 | Artifact 锁 | writer 首错 | owner 公开首错 | 资产 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 输入/rights/过期 | 无 | 0 | 0 | 否 | 否 | — | SAVE_INPUT/RIGHTS/EXPIRED | 无 |
| 2 | 坏 proof/pre 拒绝（含候选版本） | 旧 | 0 | 0 | 否 | 否 | `WRITE_REJECTED` | `TASK_OWNER_WRITE_REJECTED` | 无 |
| 3 | claim 外改 | 可能 CLAIMED | 0 | 0 | 是 | 否 | `STORE_CHANGED`/`STORE_INVALID` | 同 | 无 |
| 4 | claim rename 未知 | 可能 CLAIMED | 0 | 0 | 是 | 否 | `WRITE_UNKNOWN` | `TASK_OWNER_SAVE_UNKNOWN` | 无 |
| 5 | claim 后关联坏 | CLAIMED | 0 | 0 | 是 | 否 | `BIRTH_INVALID` | 同 | 无 |
| 6 | engine 坏协议 | CLAIMED | 1 | 0 | 否 | 否 | — | `TASK_OWNER_SAVE_UNKNOWN` | 无 |
| 7 | 合法非 SUCCESS/阻断 | FINAL SIMULATED/NO_EXECUTION | 1 | 0 | 否 | 否 | — | ok:true | 无 |
| 8 | 库 pre 拒绝 | CLAIMED | 1 | 1 拒 | 否 | 否 | — | `SAVE_ARTIFACT_REJECTED` | 旧包不变 |
| 9 | 库 rename 未知 | CLAIMED | 1 | 1 | 否 | 是 | — | `SAVE_ARTIFACT_UNKNOWN` | 可能已存，保留 |
| 10 | 新 STORED 后 pre 拒绝（proof/record） | CLAIMED | 1 | 1 | 否 | 否 | `WRITE_REJECTED` | `TASK_OWNER_WRITE_REJECTED` | 孤儿保留 |
| 11 | 同位置 Task 外改/出生坏 | CLAIMED | 1 | 1 | 是 | 否 | `STORE_CHANGED`/`BIRTH_INVALID` | 同 | 孤儿保留 |
| 12 | 同位置 Artifact 外改 | CLAIMED | 1 | 1 | 否 | 是 | 库 `STORE_CHANGED` | `SAVE_ARTIFACT_REJECTED` | 旧包保留 |
| 13 | Task FINAL rename 未知 | 可能 FINAL | 1 | 1 | 是 | 否 | `WRITE_UNKNOWN` | `SAVE_UNKNOWN` | 保留 |
| 14 | post 确认失败 | 可能 FINAL | 1 | 1 | 是 | 否 | `WRITE_UNKNOWN` | `SAVE_UNKNOWN` | 保留 |
| 15 | 联合确认前发现外改 | CLAIMED/可能 FINAL | 1 | 1 | 按域 | 按域 | 按域 | 按 §4.4 | 保留 |
| 16 | 成功返回后外改 | FINAL 已存 | — | — | 仅后读 | 按域 | — | 下次读首错；不回退历史 | 保留 |
| 17 | 并发/旧 run | 唯一 | ≤1 | ≤1 | 各自 | 各自 | — | 后序分流 | 不接管 |
| 18 | 保存后删除/过期/撤权 | FINAL 不变 | 0 | 0 | 否 | 视库 | — | status 状态 | 历史不改 |

**发现阶段不能倒置**：writer 确认后、owner 联合确认前发现外改 → 按被改域加锁、当前调用失败；
已经联合确认并成功返回后发生的外改 → 只影响**下一次** fresh 读取，不倒报上次保存失败；
仅 Artifact 外改不自动锁 Task、历史 `get` 不回退。第 11/12/13 行区分“claim 成功 1、FINAL 0、
Artifact 1”，不能称 Task 总 rename 0。

---

## 9. 删除、过期、取消

- 持 Artifact 队列至联合确认；`delete` 只在释放后执行；失败释放后 delete 可删新资产，owner 墓碑不回滚。
- 历史 SAVED 与当前可用性分离（§4.2）；不自动清孤儿；UNKNOWN 不删/不重 import。
- 无 cancel API；保存为不可中断单次尝试（`NOT_SUPPORTED`）。

---

## 10. 实施与测试 DoD（只写设计）

| 步 | runtime | 测试（未来） | 前置 |
|---|---|---|---|
| 1 | base 新文件；task/artifact store 改 import | 既有测试全量 | — |
| 2 | `readStoredForSave`（artifact-store） | `test/artifact-library.test.mjs` 只读四态 | 1 |
| 3 | task-store v2/SAVED/proof+pre/post 门禁 | `test/task-owner.test.mjs` v1/v2/proof | 1 |
| 4 | `importInQueue` + owner save/status | `test/task-owner-save.test.mjs`（新） | 2,3 |

故障代表固定设计（未来测试，不实现）：

| 代表 | 真实方法/目标/时点 | 命中与计数/文件结果 |
|---|---|---|
| claim rename 未知 | wrapper 仅匹配 `renameSync` 的 `args[1]` 为 owner 固定正式文件，第一次目标 rename；真实委托成功后记录成功并抛 EIO | fault 1；claim attempt 1/success 1、FINAL 0、Artifact 0；CLAIMED 保留/Task 锁 |
| 库 rename 未知 | `renameSync` `args[1]` 为 artifact 正式文件；真实委托一次后抛 EIO | claim 1、Artifact attempt 1/success 1、FINAL 0；Artifact 锁，Task 仅 CLAIMED |
| 新 STORED 后坏 proof | 测试 VM 仅包装固定 `writeOwner` 符号；真实 engine/import 成功后、仅在 FINAL 调用把 proof 复制成错 ref 的新冻结对象再转发唯一 writer | claim 1/FINAL 0/Artifact 1；pre 拒绝/无 Task 锁/孤儿保留；成功控制同输入不替换 |
| FINAL 内 Task 外改 | `fsyncSync` 通过 fdPaths 匹配 owner 自有 tmp，阶段已新 STORED 且为 FINAL；真实 fsync 一次后替换 Task 正式文件为原 parser 通过但 digest 不同的 fixture，再走真实 fresh 门禁 | fault 1/claim 1/FINAL 0/Artifact 1；`STORE_CHANGED`/Task 锁；外改数据与新资产保留 |
| 同位置 Artifact 外改 | 同一 FINAL tmp 真实 fsync 后，用原库严格 parser 通过且摘要不同的规范 pack 外改 Artifact 正式包；不调用公开 delete | fault 1/claim 1/FINAL 0/Artifact 1；Artifact `STORE_CHANGED`/Artifact 锁，不擅加 Task 锁 |
| FINAL rename 未知 | `renameSync` `args[1]` 为 owner 正式文件，第二次该目标 rename；真实委托后抛 EIO | claim 1、FINAL attempt 1/success 1、Artifact 1；FINAL 真实存在/Task 锁/资产保留 |
| writer post 确认失败 | 观察到 FINAL rename 成功后，在 post 的 `lstatSync(正式 owner)` 一次真实委托后抛 EIO（不用不存在的 readFileSync） | fault 1/claim 1/FINAL 1/Artifact 1；中性 `WRITE_UNKNOWN`、公开唯一映射、字节保留 |
| writer 返回后联合确认失败 | `writeOwner` 包装器真实返回成功后置测试 phase 标志；随后第一次真实 owner/artifact fresh 读的 `lstatSync` 按固定目标匹配，真实委托后注入一域外改/错误 | fault 1，三 rename 均成功；按域/阶段锁与公开首错、后续按 §4.4 |
| 成功返回后外改 | 先完成真实保存控制并成功返回，再外改一域，调用下一次 get/status | 本次保存保持成功；下一读首错/该域锁，第二读固定 UNKNOWN；仅 Artifact 外改时 Task 历史不变 |

- wrapper 计数必须在**真实成功委托后、故障抛出前**记录（含 after 分支）；attempt 与 success 分列。
- M fsProxy 默认 file 取 `args[0]` 临时路径；rename 必须在 wrapper 加固定 `args[1]` 目标匹配；
  tmp 名为 `audio-task-owner-v1.<hex>.tmp`，不可拿正式文件名匹配 `args[0]`。
- fd 读真实为 `readSync`，`fstatSync` 每次读两次且含 claim/pre/post 多轮；用 `lstatSync` + 明确 phase
  避免不确定计数；临时 fd 阶段由 fdPaths 与固定文件名/phase 确认。
- 每代表列 when/skip（phase 唯一时 skip=0）、目标调用 1、真实成功控制、三文件磁盘内容、
  engine/import 累计与原/新 handle/factory。其余代表（输入/合法非 SUCCESS/库拒绝/delete 排队/旧 run）
  复用已给控制并补同等判据；不新增跨进程/真实取消/生产场景。

---

## 11. 威胁模型与未决

同进程受信 sandbox；JSON/SHA/ref 非认证 cap；不承诺跨进程恢复；SAVED 非真实生成/版权/发送；
真实 TTS/RVC、GUI、投递、取消 API 未解决。

---

## 12. 结论

v1.4 恢复强制 delta 与严格 proof（11+8 键、`evaluatedAt`、一般 claimDigest），给出 save 12 键/status 6 键、
22 码与事实映射，固定 `writeOwner(...proof)` 调用链、`readStoredForSave` 返回、base 依赖边与 `isInside` 原序，
并把 9 个故障代表落到真实 fs 方法/目标/时点与 attempt/success 分列计数。

**状态：`PLANNED` / `DESIGN_REVIEW_REQUIRED` / `RUNTIME_NOT_IMPLEMENTED` / `NOT_INTEGRATED`。**
