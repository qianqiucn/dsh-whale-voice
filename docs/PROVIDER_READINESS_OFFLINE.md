# Provider Readiness — Fixture installation/resource admission (Plan 06-D)

**Status:** `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`. This is a demonstration admission layer, not
a real installer, hardware probe, scheduler, TTS synthesizer or product integration.

`core/audio/provider-readiness.mjs` composes the accepted 06-B negotiation and 06-C dispatch:

```text
06-B negotiation → full observation-table validation → selected installation state
→ resource admission → optional single existing RVC Fixture dispatch
```

It adds no real installation detection, CPU/GPU measurement, provider registry, queue, persistent
task, Artifact or delivery. `PRESENT` and `FIXTURE_READY` mean only that a demonstration observation
satisfies this Fixture gate. They do not prove real installation, real capacity or real generation.

## 1. Public surface (exactly four exports)

| Export | Meaning |
|---|---|
| `PROVIDER_READINESS_SCHEMA_VERSION` | `1` |
| `PROVIDER_READINESS_ERRORS` | fixed `PROVIDER_READINESS_*` codes |
| `negotiateReadyFixtureProvider(input)` | gate one explicit instance/request |
| `dispatchReadyRvcFakeOnce(input)` | gate then optionally call the existing RVC dispatcher |

Both functions are synchronous/pure. They copy the whole root input once with the shared
`copyFixtureInput` helper and only use that copy; the caller's object is never read again, mutated or
frozen. No second safety-copy algorithm, no callback/Adapter injection, no new public dependencies.

The old 06-B/06-C v1 APIs remain usable and unchanged.

## 2. Input and readiness observations

Negotiation input (exactly three keys):

```text
{ schemaVersion: 1, negotiation: <06-B five-key input>, readiness: <observations> }
```

Dispatch input adds exactly one key: `context` with `requestId`, `endpointId` and `scenario`.
`requestId` must match `^request:fixture-[A-Za-z0-9_-]{1,32}$`, `endpointId` must be the literal
`gateway:fixture-rvc`, and `scenario` must be one of the existing `RVC_FAKE_SCENARIOS`; there is no
default scenario.

`readiness` is exactly `{ schemaVersion: 1, instances: [...] }` with 0–32 observations. Each
observation is exactly:

```text
{ instanceId, installation, resources: { profile, cpu, gpu } }
```

- `instanceId`: `^instance:[A-Za-z0-9_-]{1,64}$`, unique, and must exist in the same
  `negotiation.registry.instances`; unknown IDs are rejected even if that instance is not selected.
- `installation`: `PRESENT` / `ABSENT` / `UNKNOWN`.
- `profile`: `TTS_MANIFEST` for TTS instances; `CPU_FIXTURE` / `GPU_FIXTURE` for SVC instances.
- `cpu` / `gpu`: `AVAILABLE` / `UNAVAILABLE` / `UNKNOWN` demonstration observations.

The full observation table must match the registry categories; a malformed unselected observation is
still rejected and cannot be hidden by selecting another instance. There is no default observation,
profile, resource state or instance, and no caching between calls.

## 3. Admission order

1. Copy and validate root shape/required keys/unknown keys/schema, readiness shape/enums/IDs and the
   dispatch context (when present).
2. Call the existing 06-B `negotiateProviderInstance` on the same copied negotiation. A legal
   `ok:false` maps to `NEGOTIATION_INVALID`; a throw/malformed envelope maps to
   `DEPENDENCY_FAILURE`.
3. Validate every observation ID and profile against the already-validated registry.
4. A legal 06-B `BLOCKED` stays `BLOCKED`, with its original controlled reason/messageZh and
   `observation: null`; it is never upgraded by installation/resource labels.
5. A compatible selection requires its own observation; absence is
   `OBSERVATION_MISSING` (no first/other ID fallback).
6. `ABSENT` → `INSTALLATION_MISSING`; `UNKNOWN` → `INSTALLATION_UNKNOWN`; only `PRESENT` reaches
   resource admission. Installation is not health; the old negotiation still controls health/version/
   credentials/model/request gates.
7. Required resource comes from the same selected descriptor:
   - TTS reads the validated `manifest.resources`: `local=false` → `REMOTE`; `local=true` and
     `gpuRequired=true` → `GPU`; otherwise `cpuCapable=true` → `CPU`; both false → `UNKNOWN`
     (`RESOURCE_POLICY_UNKNOWN`).
   - SVC: `CPU_FIXTURE` → `CPU`, `GPU_FIXTURE` → `GPU`.
   - GPU requirement never silently falls back to CPU; CPU requirement never switches to GPU.
   - `REMOTE` needs no local CPU/GPU admission; local CPU/GPU observations do not make a remote
     provider real or prove remote capacity. Network/upload/cost/version/health still go through the
     old negotiation unchanged.
8. Required CPU/GPU `UNKNOWN` → `RESOURCE_UNKNOWN`; `UNAVAILABLE` → `RESOURCE_UNAVAILABLE`;
   `AVAILABLE` → `FIXTURE_READY`. `REMOTE` → `FIXTURE_READY`.
9. No other instance is tried, no profile/backend is swapped, no retry/queue/GPU lock/task is created.

All decisions are `mockOnly:true`, `realOperationAllowed:false`, `submitAllowed:false`,
`automaticRetryAllowed:false`; the real registry `selectable` list remains empty.

## 4. Gate output (13 keys)

```text
{ ok: true, value: {
  schemaVersion: 1,
  category, instanceId, candidateId,
  decision: 'FIXTURE_READY' | 'BLOCKED',
  reason,                 // READY: null; BLOCKED: full PROVIDER_INSTANCE_* or PROVIDER_READINESS_*
  negotiation,            // detached copy of the accepted 06-B value
  observation,            // null for old BLOCKED/missing; else {installation, profile, requiredResource, cpu, gpu}
  messageZh,
  mockOnly: true, realOperationAllowed: false, submitAllowed: false, automaticRetryAllowed: false
} }
```

`requiredResource` is one of `CPU`/`GPU`/`REMOTE`/`UNKNOWN`. A present/unknown installation still
projects the declared `requiredResource`; the business reason still follows the order above.

Fixed Chinese messages: READY “演示准入通过；尚未接入真实生成、安装或发送。”; missing observation;
installation missing/unknown; resource policy unknown; resource unknown; resource unavailable. Old
06-B blocks reuse their original fixed Chinese text.

## 5. Dispatch output (10 keys)

```text
{ ok: true, value: {
  schemaVersion: 1,
  readiness: <gate value>,
  dispatch: <old dispatcher value> | null,
  phase: 'BLOCKED' | 'SIMULATED',
  reason, messageZh,
  mockOnly: true, realOperationAllowed: false, submitAllowed: false, automaticRetryAllowed: false
} }
```

- Gate `BLOCKED` → `dispatch:null`, phase/reason/message from the gate; the old dispatcher is not
  called.
- Gate `FIXTURE_READY` → the existing `dispatchRvcFakeOnce` is called **once** with the same copied
  negotiation/context. That dispatcher re-negotiates and performs at most one RVC simulation plus its
  existing strict result validation. Two pure negotiations are not two simulations.
- A TTS gate can be `FIXTURE_READY`; the old dispatcher then returns its legal
  `BLOCKED/UNSUPPORTED_DISPATCH`, which is preserved. This plan does not add a Fake TTS synthesizer.
- The seven RVC scenarios keep their status/code/cancel/delivery/artifact behavior; TIMEOUT/UNKNOWN
  have no artifacts or auto-retry, and CANCEL_REQUESTED is not a confirmed real stop.
- A legal old dispatcher `ok:false` becomes `DISPATCH_REJECTED`; throw/malformed → `DEPENDENCY_FAILURE`.
  No retry. Dependency-failure branches are `STATIC_NOT_INJECTED` unless a test actually injects them.

## 6. Errors and privacy

Error envelope: `{ ok:false, errors:[{ code, path, reason }] }`, one fixed first error, recursively
frozen. Paths: `$`, `schemaVersion`, `negotiation`, `readiness`, `context`, `<unknown-key>`.

Codes: `INVALID_INPUT`, `RESOURCE_LIMIT`, `UNSUPPORTED_VERSION`, `INVALID_READINESS`,
`DUPLICATE_OBSERVATION`, `UNKNOWN_OBSERVATION_INSTANCE`, `NEGOTIATION_INVALID`, `INVALID_CONTEXT`,
`DEPENDENCY_FAILURE`, `DISPATCH_REJECTED`; the six admission reasons (`OBSERVATION_MISSING`,
`INSTALLATION_MISSING`, `INSTALLATION_UNKNOWN`, `RESOURCE_POLICY_UNKNOWN`, `RESOURCE_UNKNOWN`,
`RESOURCE_UNAVAILABLE`) are legal BLOCKED reasons only.

No original key names, manifest/text/request/consent values, URLs, exceptions or upstream error
arrays are echoed. Unsafe structures are rejected by the shared helper before schema access: getters/
setters never run, Symbols/hidden keys/custom prototypes/cycles/holes/extra array properties are
rejected, and limits are 4096 values / depth 12 / 32 keys / 256 array items / 8192 string code units.
The 32-observation cap is a business cap (`RESOURCE_LIMIT/$`) on top of those limits.

## 7. Ordinary-user storyboard and limits

No GUI is added. In a future UI, the user selects an explicit demonstration instance and sees a
"Fixture / demonstration" label; the gate explains missing installation, unknown resource or
unavailable resource in plain Chinese. Three recoveries:

1. **Missing installation** → install/check the dependency or try later; nothing is downloaded or
   installed automatically.
2. **Unknown resource state** → re-check or choose another available demonstration; no automatic
   hardware probing or bypass.
3. **Insufficient resource** → pick an available CPU/GPU/remote demonstration; no silent downgrade,
   GPU-to-CPU fallback or send.

The packaging **不声称真实 RVC 的 CPU/GPU 支持或已测硬件**; CPU/GPU profiles are fixed demonstration
labels. `PRESENT` is not a real installation, `FIXTURE_READY` is not generation readiness, and no
button may show "real generation/send" from this layer.

**普通用户说明：**缺少安装、安装状态未知、资源未知或资源不足时，按上述三类恢复处理；不会自动安装、
探测硬件、下载模型或降级执行。

## 8. Non-goals and boundaries

- No real installer, filesystem scan, registry read, model download, hardware/telemetry probe,
  process/queue/GPU lock, persistent task, Artifact, Relay or delivery.
- No TTS synthesizer, no second RVC algorithm, no new registry/catalogue, no config migration.
- No change to the old 06-B/06-C source, tests, public exports or safety flags.
- No real credentials, directories, URLs, media, network, paid API, WeChat or production config.
- RVC upstream `BLOCKED_CODE_REUSE` / `BLOCKED_DIRECT_API_INTEGRATION` remain unresolved; the whole
  Plan06 is still not complete. This plan closes only the Fixture admission sub-scope.

## 9. Verification snapshot

- New provider-readiness behavior matrix: D01–D27 in `test/provider-readiness.test.mjs`.
- Existing 143 dispatch/06-B/TTS/RVC tests retained.
- Full suite, build, syntax, `client.js` parity and the isolated 24-check UI harness are reported in
  the associated delivery report for the actual commit; this document does not claim a green CI by
  itself.

## 10. D27 cross-category evidence table (Plan06-D-F01)

This table is the evidence reference required by D27. It distinguishes what was actually asserted
offline from declarations, Fake protocol behavior, static checks and genuinely missing coverage.
Test names are exact names in the named files at the commit that adds this section; line numbers are
not used because they drift. Nothing below adds a real TTS runtime, a real RVC process or a new
injection point.

| # | Concern | Evidence (file → exact test/assertion) | What it proves | Level | Limit / owner |
|---|---|---|---|---|---|
| 1 | TTS unsupported output format / streaming | `test/provider-instances.test.mjs` → `R16 unsupported streaming/format, empty text and over-limit text block`; `test/provider-dispatch.test.mjs` → `T10 invalid Fixture request fields block in 06-B before any simulation` | Unsupported `format`/`streaming` is rejected as a controlled 06-B capability block; no provider fallback, no simulation | RUN-OFFLINE | Classification/admission only; not a real TTS codec test |
| 2 | TTS error audio / result schema | `test/tts-provider.test.mjs` → `synthesis result is audio-only and never performs delivery`; `synthesis result rejects unknown target fields instead of silently dropping them` | Result normalization keeps audio-only fields and rejects unknown delivery/target fields | RUN-OFFLINE | Uses Fixture result objects; no real audio bytes |
| 3 | TTS request format / hidden delivery fields | `test/tts-provider.test.mjs` → `TTS request rejects hidden delivery fields before normal validation`; `test/provider-instances.test.mjs` → `R15 unsupported voice, language and emotion each block without dropping parameters` | Request shape and delivery fields are rejected before capability checks; parameters are not silently dropped | RUN-OFFLINE | Admission/validation only |
| 4 | TTS timeout / health degraded | `test/provider-instances.test.mjs` → `R11 timeout, unknown, offline and degraded map to fixed statuses`; `test/provider-dispatch.test.mjs` → `T03 offline/unknown/timeout/degraded/version-unknown instances block with no result` | Observation states map to fixed blocked statuses; no dispatch result | RUN-OFFLINE | Status classification; **not** a simulated TTS synthesis timeout |
| 5 | TTS cancellation capability vs execution | `test/tts-provider.test.mjs` → `local and fake-cloud providers expose independent capabilities and status` (manifest `capabilities.cancellation: true`) | The manifest can declare cancellation capability | DECLARATION-ONLY | No TTS cancellation runtime; declaration ≠ executed cancel. TTS execution/cancel remains `NOT_IMPLEMENTED` in the parent matrix |
| 6 | SVC invalid media / output format | `test/rvc-fake-gateway.test.mjs` → `G04 URL、路径、正文与非 Fixture 源引用全部拒绝`; `G07 outputFormat 只接受必填 audio/wav`; `test/provider-dispatch.test.mjs` → `T10 ...` | URLs/paths/wrong media formats are rejected before simulation | RUN-OFFLINE | Fixture input validation only |
| 7 | SVC timeout / UNKNOWN | `test/rvc-fake-gateway.test.mjs` → `G22 TIMEOUT 模拟响应无产物且不得自动重试`; `G26 UNKNOWN 无产物、无重试、无后端切换`; `test/provider-dispatch.test.mjs` → `T02 all seven scenarios preserve exact status/code/cancel/delivery and fixed Chinese`, `T12 TIMEOUT/UNKNOWN produce no artifact and no retry permission` | Exact Fake status/code/artifact/retry behavior for TIMEOUT and UNKNOWN | FAKE-SCENARIO-PROTOCOL | Simulated gateway only; no real process timeout |
| 8 | SVC cancel request vs confirmation | `test/rvc-fake-gateway.test.mjs` → `G24 取消请求不等于已停止`; `G25 CANCELLED_FAKE 仅表示模拟确认`; `test/provider-dispatch.test.mjs` → `T13 cancel request and confirmation remain distinct and never claim a real stop`; `test/provider-readiness.test.mjs` → `D14 TIMEOUT/UNKNOWN have no artifact/retry and cancel request is distinct from confirmation` | `CANCEL_REQUESTED` ≠ confirmed stop; `CANCEL_CONFIRMED` remains a simulated confirmation | FAKE-SCENARIO-PROTOCOL | No real process stop/cancel signal |
| 9 | Wrapped RVC complete result + validator | `test/provider-readiness.test.mjs` → `D01 normal RVC PRESENT/CPU_AVAILABLE is READY and all seven scenarios match the old dispatcher`; `D13 context/request linkage, no default scenario and the complete 15-field result stay intact`; `test/provider-dispatch.test.mjs` → `T22 SIMULATED.result revalidates with the existing validator and matches direct simulation` | Gate keeps the old 15-field result, request/context linkage and revalidates with the existing validator | RUN-OFFLINE | Fake simulation; not real RVC audio/GPU execution |
| 10 | TTS actual synthesis execution (timeout/cancel/audio) | None | No TTS synthesizer or execution path exists | NOT-IMPLEMENTED / NONE | Parent Plan06 matrix owns real TTS execution evidence; do not infer it from rows 1–5 |

Rows 1–4, 6–9 are offline behavior assertions. Row 5 is declaration only. Rows 7–8 are the Fake
scenario protocol. Row 10 is explicitly unimplemented. The schema/error-namespace check
`D27 readiness schema version is exported as 1 and the error namespace is complete` is additional
coverage; it does **not** replace any cross-category row above.

## 11. Controlled reason namespace (clarification)

The accepted 06-B negotiation can return existing TTS contract codes, for example
`TEXT_UPLOAD_NOT_CONFIRMED` (not every reason is prefixed `PROVIDER_INSTANCE_`). The readiness wrapper
preserves the original controlled `reason` value for a legal 06-B `BLOCKED`; it does not rewrite it,
re-prefix it or map it into the readiness namespace. This is a documentation clarification of already
verified behavior (`test/provider-instances.test.mjs` → `R17 cloud consent gates run before existing
capability checks`; `N13 network/upload keep provider codes, cost uses the new enum, priority unchanged`),
not a code change or a second enum. New readiness-only reasons use `PROVIDER_READINESS_*`.
