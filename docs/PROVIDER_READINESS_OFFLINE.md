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
