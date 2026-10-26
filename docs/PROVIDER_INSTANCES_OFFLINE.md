# Provider Instances — offline Fixture view & capability negotiation (Plan 06-B)

**Status:** `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`. This document describes a pure contract
layer, not a working provider, GUI, installer, scheduler or delivery path.

`core/audio/provider-instances.mjs` composes the **existing** TTS/SVC candidate catalogues into a
bounded per-call instance snapshot and answers one narrow question:

> Could this demonstration request be accepted by this explicitly selected demonstration instance?

It never calls a real provider, starts a process, opens a socket, reads a file or credential, loads a
model, synthesizes/converts audio, advances a Core task, creates an Artifact or a delivery
candidate. A compatible decision is **not** generation, installation, playback or send success.

## 1. Public surface (exactly four exports)

| Export | Meaning |
|---|---|
| `PROVIDER_INSTANCES_SCHEMA_VERSION` | `1` |
| `PROVIDER_INSTANCE_ERRORS` | fixed error codes (`PROVIDER_INSTANCE_*`) |
| `buildProviderInstanceView(input)` | validates one bounded registry snapshot and builds the view |
| `negotiateProviderInstance(input)` | explicitly selects an instance and negotiates one request |

All functions are synchronous and pure. There is no module-level mutable catalogue, cache, queue,
clock, randomness or persistence. The existing catalogues are read-only dependencies
(`getProviderCandidate`, `getRegistryView`, `getSvcCandidate`, `getSvcRegistryView`); the existing TTS
validators and the RVC Fake v1 **capability description** are reused. The module does not import
`simulateRvcFakeConversion`, `normalizeSvcResult`, `normalizeSynthesisResult`, `transitionAudioTask`
or any Relay interface.

## 2. `buildProviderInstanceView(input)`

Input shape: `{ schemaVersion: 1, instances: [ ...0..32 items ] }`.

Each instance has exactly seven keys:

| Field | Contract |
|---|---|
| `instanceId` | `instance:` + 1..64 safe characters; unique across the whole snapshot |
| `category` | `TTS` or `SVC` |
| `candidateId` | an existing catalogue id; TTS accepts the `qwen-local` alias and normalizes to `qwen3-tts`; SVC must be exact |
| `protocolVersion` | integer `1..2147483647`; `1` is this version, other values keep the instance but force `VERSION_UNKNOWN` |
| `fixture` | literal `true`; anything else is `REAL_OPERATION_FORBIDDEN` |
| `manifest` | TTS: a manifest accepted by `normalizeProviderManifest`; SVC: `null` |
| `observation` | exactly `{state, credentials, observedAt, versionMatches}` |

`observation.state` is one of `ok/degraded/offline/timeout/unknown`; `credentials` is
`present/missing/unknown/not_required`; `observedAt` is `null` or a canonical UTC timestamp; and
`versionMatches` is `true/false/null`. These are **declared demonstration observations**, not a live
health check. No clock is read and no freshness claim is made.

Rules: candidate must belong to its category; unknown candidates are `UNKNOWN_CANDIDATE`; known
candidates from the other category are `INVALID_INSTANCE`; `manifest.id` and `manifest.kind` must
match the resolved candidate; SVC credentials must be `not_required`; optional TTS credentials must
be `not_required`, required TTS credentials may be `present/missing/unknown`.

Output (on valid structure):

```text
{ ok: true, value: {
  schemaVersion: 1, mode: 'FIXTURE_ONLY',
  candidates: { tts: <existing registry view>, svc: <existing registry view> },
  instances: [ { instanceId, category, candidateId, kind, adapter, status, reason,
                 fixtureSelectable, mockOnly: true, realOperationAllowed: false, observedAt } ],
  realSelectable: [], defaultInstanceId: null, realOperationAllowed: false
} }
```

`fixtureSelectable` only means “this offline negotiation entry may accept the request”. The original
`implemented/selectable/default` values are unchanged and remain empty for real use.

### Status priority (fixed)

1. No adapter (`seed-vc`) → `NOT_IMPLEMENTED`.
2. Protocol version ≠ 1, `versionMatches !== true`, or a TTS manifest whose version is not `AUDITED`
   → `VERSION_UNKNOWN` (even if health says `ok`).
3. TTS required credentials `missing` → `CREDENTIALS_MISSING`; `unknown` → `UNKNOWN` with
   `CREDENTIALS_UNKNOWN`.
4. Observation `timeout` → `UNKNOWN/TIMEOUT`; `unknown` → `UNKNOWN/HEALTH_UNKNOWN`; `offline` →
   `OFFLINE`; `degraded` → `DEGRADED`.
5. State `ok`: TTS must actually pass `evaluateProviderStatus(...) === AVAILABLE` to become
   `FIXTURE_AVAILABLE`; RVC becomes `FIXTURE_AVAILABLE` directly. All others are `UNKNOWN/HEALTH_UNKNOWN`.

Only `FIXTURE_AVAILABLE` sets `fixtureSelectable=true`.

## 3. `negotiateProviderInstance(input)`

Top-level shape: `{ schemaVersion: 1, registry, selection, consent, request }`.

- `registry` is the same bounded registry snapshot; it is re-validated on every call. A caller-made
  view object is never trusted.
- `selection` is exactly `{category, instanceId}`; there is no default and no “first instance”.
- `consent` is exactly `{networkAllowed, textUploadAllowed, paidAllowed}` with required booleans. It
  is Fixture input for this new envelope and is not written into old manifests.
- `request` is either the TTS request shape or the RVC Fake v1 request shape (decided by the selected
  instance category).

Output on a legal call (including capability blocks):

```text
{ ok: true, value: { schemaVersion: 1, category, instanceId, candidateId, decision,
                     reason, messageZh, mockOnly: true, realOperationAllowed: false,
                     submitAllowed: false, automaticRetryAllowed: false } }
```

`decision` is `FIXTURE_COMPATIBLE` or `BLOCKED`; successful negotiation has `reason: null`.
Unknown selected instance → `BLOCKED/INSTANCE_UNKNOWN` with `candidateId: null`; category mismatch →
`BLOCKED/CATEGORY_MISMATCH`; a selected instance that is not `FIXTURE_AVAILABLE` is blocked with its
own status reason. No cross-instance or cross-category fallback exists.

### TTS request

Exactly seven keys, all required by this layer: `requestId`, `text`, `voiceId`, `language`,
`emotion`, `format`, `streaming`. Missing/extra fields or wrong types are
`BLOCKED/INVALID_REQUEST`; the older default-language/emotion/format behavior is not used to fill
gaps. After the request shape is valid, the layer checks the new Fixture consent gates in order:

1. `manifest.network.required === true` requires `networkAllowed` → else `NETWORK_REQUIRED`.
2. `manifest.network.textUpload === true` or `manifest.privacy.textLeavesDevice === true` requires
   `textUploadAllowed` → else `TEXT_UPLOAD_NOT_CONFIRMED`.
3. `manifest.cost.paid === true` requires `paidAllowed` → else `COST_NOT_CONFIRMED`.

Only then does it call the existing `checkSynthesisRequest(manifest, observation, request)` and map
its fixed codes to reasons (`UNSUPPORTED_VOICE/LANGUAGE/EMOTION/STREAMING/FORMAT`,
`CREDENTIALS_MISSING`, `PROVIDER_NOT_AVAILABLE`, `INVALID_RESPONSE`, etc.). Free-form upstream
messages are never forwarded and the request text is never returned.

### SVC request

For `rvc`, the request is exactly the existing RVC Fake v1 seven-field request and is validated with
`validateRvcFakeRequest`. The selected `targetModelId` must exist in `listRvcFakeModels()` and have
`simulatedAvailable === true`; model B is `MODEL_NOT_AVAILABLE` and is never replaced by model A.
The module does not require a scenario/context and never runs a simulated conversion. `seed-vc`
remains `NOT_IMPLEMENTED` and receives no adapter.

## 4. Errors, paths and privacy

Structural failures return `{ ok: false, errors: [ { code, path, reason } ] }` with only the first
error. `code` is from `PROVIDER_INSTANCE_ERRORS`; `path` is one of `$`, `schemaVersion`, `instances`,
`instance`, `manifest`, `observation`, `registry`, `selection`, `consent`, `request`,
`<unknown-key>`; `reason` is a fixed English phrase. Unknown key names, caller IDs, text, exception
text and stack text are never echoed.

Reason namespace (Plan06-B-F01): reasons produced by this new layer — in both `view.instances[].reason`
and `BLOCKED.value.reason` — use the full `PROVIDER_INSTANCE_*` enum values. Existing TTS capability
codes returned by `checkSynthesisRequest` keep their `PROVIDER_ERRORS` values (`UNSUPPORTED_*`,
`INVALID_RESPONSE`, `NETWORK_REQUIRED`, `TEXT_UPLOAD_NOT_CONFIRMED`, etc.). Status words remain
unprefixed (`FIXTURE_AVAILABLE`, `VERSION_UNKNOWN`, `OFFLINE`, ...). `selection.instanceId` must match
the same `^instance:[A-Za-z0-9_-]{1,64}$` regex used at registration; a bad id is
`INVALID_INPUT`/`selection` and is never echoed. A present `schemaVersion` that is not integer `1`
(including `'1'`, `null`, `true`, `0`, `2`, `1.5`, arrays or objects) is `UNSUPPORTED_VERSION`; only
a missing key is `INVALID_INPUT`.

Every layer uses the same bounded structural policy: plain/null-prototype objects only, string
enumerable data properties only, no getters/setters/Symbols/hidden keys, no extra array properties or
holes, no cycles, and limits of 4096 values / depth 12 / 32 object keys / 256 array items / 8192
string code units. Over-limit input returns `RESOURCE_LIMIT`; malformed input returns `INVALID_INPUT`.
Caller accessors are never invoked; a throwing Proxy is converted to the fixed `INVALID_INPUT` error,
without claiming to sandbox the Proxy's own traps. Output objects are newly built and deeply frozen;
input objects are never mutated or shared.

The `messageZh` field uses a fixed Chinese table so a future GUI can explain a block. Representative
cases: version unknown → “实例版本尚未确认…”; credentials missing/unknown → “凭据状态尚未就绪…”;
offline/timeout/degraded → “实例状态尚未就绪…不会自动重试”; unsupported voice/model → “请选择兼容项，
不会自动换模型或下载”; network/upload/cost consent → “本演示不会联网、上传或收费”; and success →
“演示实例与请求匹配；尚未生成音频，不能据此试听、保存或发送。”

## 5. Novice storyboard and limits (no GUI in this plan)

No user-facing page is added. The future storyboard is: the user opens the Voice or Singing area,
sees the relevant dependency explanation and an explicit demonstration label, selects a ready
demonstration instance, and gets a Simplified-Chinese reason for incompatible options. The two
features share the Audio Core but must not clone accounts, voice libraries, tasks or installers.

Three recoveries: (1) not connected / version unknown → re-check or try later; the other feature or
instance is not dragged down; (2) unsupported voice/model or insufficient rights → choose compatible
legal material; nothing is downloaded or auto-granted; (3) credential/network consent or timeout /
unknown → the later GUI handles consent and credentials; this layer reads no secrets, uploads
nothing, retries nothing.

RVC remains the first singing route; Seed-VC is a later optional no-training experiment, not a
low-VRAM/no-GPU fallback. Qwen and the personal `whale-v1` are not product defaults. Voice does not
force Singing, and generation/preview does not require WeChat delivery dependencies. CPU/GPU
performance is unknown and is not promised.

## 6. Verification snapshot (this branch)

- `node --test test/provider-instances.test.mjs`: **48/48** (R01–R30 + N01–N18).
- `node --test test/tts-provider.test.mjs`: **21/21** (16 existing + M01–M05).
- Existing + new full suite: **431 tests / 430 pass / 1 platform skip / 0 fail**.
- `node build.mjs` succeeds; generated `client.js` is unchanged.
- UI harness: existing 24/24 checks (no new UI).
- This is `OFFLINE` contract evidence, not a real Host/GUI or provider integration.

## 7. Plan06-B-F01 review repairs

The first PR #24 review found four boundary gaps; this branch fixes them without changing the public
success shapes:

1. **Manifest helper failures** — `validateProviderManifest` now checks the return value of all eight
   section validators (`version`, `capabilities`, `health`, `credentials`, `network`, `privacy`,
   `cost`, `resources`). If a validator returns non-`true` without appending an error, a fixed
   `INVALID_MANIFEST` error for that section is added; no manifest can normalize successfully after a
   failed section. The composition layer also converts dependency exceptions into fixed
   `INVALID_INSTANCE`/`INVALID_REQUEST` failures instead of escaping.
2. **Selection id** — `selection.instanceId` uses the registration regex; malformed ids (URLs, paths,
   whitespace, newlines, wrong prefix, over-64 suffix) return `INVALID_INPUT`/`selection` without
   echoing the value. A well-formed but unknown `instance:missing` remains a legal
   `BLOCKED`/`INSTANCE_UNKNOWN`.
3. **Reason namespace** — new-layer reasons use the full `PROVIDER_INSTANCE_*` values, while existing
   TTS capability codes keep `PROVIDER_ERRORS` values; status words and the fixed Chinese messages are
   unchanged.
4. **Schema version** — a present `schemaVersion` other than integer `1` is `UNSUPPORTED_VERSION` at
   the build top level, the negotiation top level and `negotiate.registry`; only a missing key is
   `INVALID_INPUT`. Instance `protocolVersion` keeps its separate rule (valid non-1 → instance
   `VERSION_UNKNOWN`; invalid type/range → `INVALID_INSTANCE`).

The original R01–R30 security intent is retained; expectations were tightened to the full reason
values. M01–M05 cover the manifest-validator root cause and N01–N18 cover the composition/selection/
version/reason repairs.

Remaining work is explicitly out of scope here: 06-C scheduling, 08 voice/asset/id mapping, real
provider adapters, Relay, installer and all UI product flows.
