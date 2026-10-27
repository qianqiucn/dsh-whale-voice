# Provider Dispatch — single RVC Fixture dispatch (Plan 06-C)

**Status:** `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED`. This document describes a pure
synchronous contract, not a working queue, worker, GUI, real RVC engine or delivery path.

`core/audio/provider-dispatch.mjs` connects three already accepted pieces in one call:

1. the 06-B Fixture negotiation (`negotiateProviderInstance`) is **recomputed** from the supplied
   negotiation input — a caller-made view/decision is never trusted;
2. the existing RVC Fake gateway performs **at most one** simulated conversion;
3. the existing strict `validateRvcFakeResult` checks that result against the same request/context
   copies.

It adds no second model catalogue, no second conversion algorithm, no second result schema, no
queue, no retry, no real adapter and no delivery. A `SIMULATED` phase means one legal demonstration
simulation completed; it does **not** mean audio exists or can be previewed, saved or sent.

## 1. Public surface (exactly three exports)

| Export | Meaning |
|---|---|
| `PROVIDER_DISPATCH_SCHEMA_VERSION` | `1` |
| `PROVIDER_DISPATCH_ERRORS` | fixed `PROVIDER_DISPATCH_*` error codes |
| `dispatchRvcFakeOnce(input)` | validate → negotiate → simulate once → validate result → build output |

The module is synchronous and pure: no module-level mutable catalogue/cache/clock/randomness, no
I/O, no process, no network, no model load, no task/Artifact/Relay call.

## 2. Input

Exactly three top-level keys:

```text
{
  schemaVersion: 1,
  negotiation: { schemaVersion, registry, selection, consent, request },  // 06-B five-key input
  context: { requestId, endpointId, scenario }
}
```

- `schemaVersion` must be integer `1`; any other safely copied value → `UNSUPPORTED_VERSION`;
  a missing key → `INVALID_INPUT`/`schemaVersion`.
- `negotiation` is the normal 06-B input. It is validated again by `negotiateProviderInstance`; a
  forged `decision`/view object, malformed selection/registry or invalid RVC request fails closed
  with `NEGOTIATION_INVALID`/`negotiation` (or a legal 06-B `BLOCKED` result for capability gaps).
- `context` has exactly three keys:
  - `requestId`: `^request:fixture-[A-Za-z0-9_-]{1,32}$`;
  - `endpointId`: the literal `gateway:fixture-rvc`;
  - `scenario`: one of the seven existing `RVC_FAKE_SCENARIOS`.
  Missing/extra/invalid fields → `INVALID_CONTEXT`/`context`. There is **no default scenario**.

The whole root input is copied by `copyFixtureInput` before any schema access (the shared helper
extracted from 06-B): plain/null-prototype objects only, enumerable string data properties only, no
getters/Symbols/hidden keys/custom prototypes, no cycles/holes/extra array properties, limits of 4096
values / depth 12 / 32 keys / 256 array items / 8192 string code units. Copied objects — ordinary and
null-prototype inputs alike — are always **null-prototype** objects; arrays stay standard dense
arrays. Caller getters are never invoked; the original object is never mutated or reread. This closes
the check-then-use gap: the request and context used for simulation and validation come from the same
validated copy.

## 3. Output

Success (including every legal BLOCKED result) is always:

```text
{ ok: true, value: {
  schemaVersion: 1,
  category, instanceId, candidateId,
  requestId,
  phase: 'BLOCKED' | 'SIMULATED',
  reason,              // BLOCKED: 06-B reason or PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH
                       // SIMULATED: result.code (null on success, RVC_FAKE_* on a scenario failure)
  negotiation,         // detached copy of the accepted 06-B negotiation value
  result,              // SIMULATED: validated 15-field RVC Fake result; BLOCKED: null
  messageZh,
  mockOnly: true,
  realOperationAllowed: false,
  submitAllowed: false,
  automaticRetryAllowed: false
} }
```

The entire success envelope (`{ ok: true, value }`) and all 14 fields are freshly built and recursively
frozen; error envelopes are recursively frozen too. `requestId` is the validated context id and
equals `result.requestId` for SIMULATED. A BLOCKED result never fabricates a result object.

`phase` distinctions:

- `BLOCKED` — 06-B rejected the instance/selection/model (offline, version/credentials/health,
  category mismatch, model B, invalid request), **or** the instance is TTS/other
  (`PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH`). No simulation ran.
- `SIMULATED` — exactly one RVC Fake simulation ran and its result passed
  `validateRvcFakeResult`. The phase does not assert real conversion, audio, task success or send.

## 4. Seven simulated results

All results have `delivery.state: 'NOT_REQUESTED'`, `delivery.submitAllowed: false`,
`mockOnly: true`, `realOperationAllowed: false`, `automaticRetryAllowed: false`.

| Scenario | `status` | `code` | cancel requested/confirmed | artifactRef |
|---|---|---|---|---|
| `SUCCESS` | `SUCCEEDED_FAKE` | `null` | false / false | `artifact:fixture-output-…` |
| `OFFLINE` | `OFFLINE` | `RVC_FAKE_OFFLINE` | false / false | null |
| `MODEL_MISSING` | `MODEL_NOT_AVAILABLE` | `RVC_FAKE_MODEL_NOT_AVAILABLE` | false / false | null |
| `TIMEOUT` | `TIMEOUT` | `RVC_FAKE_TIMEOUT` | false / false | null |
| `CANCEL_REQUESTED` | `CANCEL_REQUESTED` | `RVC_FAKE_CANCEL_PENDING` | true / false | null |
| `CANCEL_CONFIRMED` | `CANCELLED_FAKE` | `RVC_FAKE_CANCELLED` | true / true | null |
| `UNKNOWN` | `UNKNOWN` | `RVC_FAKE_UNKNOWN` | false / false | null |

`CANCEL_CONFIRMED` is a simulated confirmation, not proof that a real process stopped. `TIMEOUT`
and `UNKNOWN` carry no artifact, no sample rate/duration, and no automatic retry permission.

## 5. Errors

Structural/contract failures return `{ ok: false, errors: [{ code, path, reason }] }` with one fixed
error; no web/model/credential/exception text is echoed.

| Code | When | Path |
|---|---|---|
| `PROVIDER_DISPATCH_INVALID_INPUT` | malformed structure, missing field, accessor/Symbol/hidden/custom prototype, unsafe value, unknown key | `$`, `<unknown-key>`, `schemaVersion` |
| `PROVIDER_DISPATCH_RESOURCE_LIMIT` | value/depth/key/array/string limits exceeded | `$` |
| `PROVIDER_DISPATCH_UNSUPPORTED_VERSION` | present `schemaVersion` other than integer `1` | `schemaVersion` |
| `PROVIDER_DISPATCH_INVALID_CONTEXT` | context shape/id/endpoint/scenario invalid | `context` |
| `PROVIDER_DISPATCH_NEGOTIATION_INVALID` | 06-B returned an error envelope (bad registry/selection/consent/request shape) or a forged input | `negotiation` |
| `PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH` | 06-B succeeded but the instance is not SVC/RVC (TTS etc.) | — (BLOCKED value) |
| `PROVIDER_DISPATCH_DEPENDENCY_FAILURE` | dependency threw or returned a structurally impossible result | `$` |
| `PROVIDER_DISPATCH_SIMULATION_REJECTED` | existing simulator returned non-success | `result` |
| `PROVIDER_DISPATCH_INVALID_RESULT` | existing validator rejected the simulated result, or a required field is missing | `result` |

06-B capability reasons inside a legal BLOCKED value keep their full `PROVIDER_INSTANCE_*` values
(e.g. `PROVIDER_INSTANCE_OFFLINE`, `PROVIDER_INSTANCE_MODEL_NOT_AVAILABLE`). A TTS-compatible
instance is blocked here with `PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH`; this plan does not add a TTS
synthesizer.

## 6. One-shot semantics and non-goals

- One `dispatchRvcFakeOnce` call performs **one** negotiation computation, **one** simulator call and
  **one** result validation. There is no loop, retry, fallback, second model or second attempt.
- The simulator and validator are the existing RVC Fake functions; their 15-field result schema and
  safety flags are not redefined here.
- No queue, worker, resource manager, Core task transition, Artifact creation, Relay interface,
  `submit`, delivery candidate, GUI, installer or real model/audio path is added.
- TTS dispatch, real RVC, multi-engine scheduling, 08 voice/asset/id mapping and sending remain out
  of scope. `voiceProfileId` / `targetVoiceId` / `targetModelId` remain different concepts.

## 7. Novice storyboard and limits (no GUI)

No user-facing page is added. The future storyboard: in the Singing area the user selects an
explicit demonstration instance and a compatible model, sees a clear "this is a demonstration"
label, triggers at most one simulated run, and reads a fixed Simplified-Chinese explanation.

Three recoveries:

1. Not connected / version or health unknown → check again or try later; no automatic retry, no fake
   "success". The other feature/instance is not dragged down.
2. Unsupported model/voice or insufficient rights → choose compatible legal material; nothing is
   downloaded, no model is swapped and the B model never falls back to A.
3. Timeout / unknown / cancel → the UI must show "unknown" honestly and ask the user; it must not
   resend, claim completion, or treat a simulated cancel as a real stop. Credentials/network/cost
   consent remain a later-GUI concern; this layer reads no secrets and uploads nothing.

## 8. Verification snapshot

- `node --test test/provider-dispatch.test.mjs`: **34/34** (T01–T26 + F01-A–D + F02-A–D).
- Existing 06-B/TTS/RVC: **109/109** (48 + 21 + 40).
- Full suite: **465 tests / 464 pass / 1 platform skip / 0 fail**.
- `node build.mjs` succeeds; `client.js` unchanged; UI harness 24/24 (no new UI).
- These are offline contract results, not real Host/GUI/provider integration.

## 9. Plan06-C-F01 review repairs

- **F01 — freeze the complete envelope.** The earlier implementation froze only `value`, leaving the
  outer `{ ok: true, value }` writable. All success branches now return a recursively frozen
  `successEnvelope`; `ok`, `value` and every reachable result/negotiation/safety object are frozen.
  F01-C attempts strict-mode writes/replacements and verifies they throw without changing content.
  F01-D verifies fresh graphs per call and that the caller input is not frozen.
- **F02 — restore the G-equivalent copy policy.** `copyObject` again uses
  `Object.create(null)` + field assignment (not a plain `{}` + `defineProperty`). Copied objects,
  ordinary or null-prototype, are null-prototype; arrays remain standard dense arrays; the original
  limits/rejections and caller isolation are unchanged. F02-B covers own `__proto__` / `constructor`
  / `prototype` data keys without prototype pollution; F02-C pins exact limits and historic
  rejections; F02-D revalidates the seven scenarios and 06-B decisions without prototype drift.
- T16 now checks the outer envelope too. T22 compares against an explicit null-prototype graph while
  keeping all fields/values and the existing `validateRvcFakeResult` revalidation; no safety
  assertion was dropped.

## 10. Boundaries kept

- Worker `NEVER_WRITE`, Bridge/Worker dual gate, WeChatAgent identity/authorization, Core single task,
  Relay one delivery, `UNKNOWN` no-auto-resend and `SAVED != APPLIED/SENT` remain unchanged.
- Upstream RVC `BLOCKED_CODE_REUSE` / `BLOCKED_DIRECT_API_INTEGRATION` are not resolved.
- No real provider, model, media, audio device, WeChat, Gateway, paid API, music platform, install,
  service restart or production change is performed or implied.
