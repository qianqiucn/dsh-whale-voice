# Provider Generation → SAVED Candidate (Plan 10-R1, OFFLINE / ISOLATED)

**Status:** `IN PROGRESS` / `OFFLINE` — internal wiring candidate only. No model was loaded, no process
was spawned, no WeChat/device/window was touched, no production Host route was added, and nothing is
merged. `SAVED` here means "the isolated coordinator stored provider bytes in the existing Artifact
library", **not** that a user can click real generation, not that a Sender can deliver it, and not
that the Plan 08 owner snapshot contains a provider entry.

## 1. What this unit actually is

`core/audio/provider-generation-offline.mjs` is a claim-first coordinator between an already-audited
provider contract (the existing Qwen adapter/supervisor API) and the existing Artifact authority
(`openFixtureArtifactLibrary`, `artifact:fixture-bytes-…`). It deliberately does **not** modify the
Plan 08 owner snapshot (schema v1/v2 has no provider entry kind) and does not add a Host/UI route.

Pipeline:

```
prepare(scope, task, requestKey, rights, provider, request)
  → durable claim (claim ledger v1, same trusted sandbox)
  → submit(claimId) → provider.beginSynthesis(...)
  → re-measure bytes here (WAV: PCM16 / 24 kHz / mono / 200–20000 ms / ≤1 MiB)
  → artifacts.import(same Artifact authority)
  → artifacts.readBytes readback + SHA256 equality
  → claim SAVED (+ jointProof: claim/request digest, task birth hash, provider binding, artifact ref/hash/length/duration)
```

## 2. Contract (v1, fail-closed)

- `PROVIDER_GENERATION_SCHEMA_VERSION = 1`; any other `schemaVersion` → `UNSUPPORTED_VERSION`.
- Strict key surfaces on claim/request/rights/provider; unknown keys or types are rejected.
- `rights.state` must be `GRANTED` with a `fixture-rights:…` proof; anything else is refused **before**
  the provider is called.
- The task must be confirmed by the injected authority (`{identityHash, state}`); a task already in
  `SAVED` (or any non-initial state) is refused.
- One claim per `(scopeId, taskId)` and one per `(scopeId, requestKey)`:
  - identical claim material → `EXISTING` (no synthesis);
  - changed request/provider/rights → `CONFLICT`;
  - the same `taskId` under another scope → `CROSS_SCOPE`.
- After a terminal state (`SAVED`, `FAILED`, `CANCELLED`, `UNKNOWN`, `SAVE_UNKNOWN`) `submit()` only
  returns `EXISTING`; a failed or unknown generation is **never** resynthesised to repair a save.
- Cancel records `requested` / `ack` / `unknown` as separate facts; a late result may still win the
  race and produce `SAVED`, but it never re-binds a different claim or reopens a terminal one.
- **121 lifecycle:** a cancel that arrives while `beginSynthesis` is still pending is recorded
  `PENDING` and applied to the handle once it appears; `close()` settles owned active claims as
  `UNKNOWN` (attempting a bounded cancel for the owned handle) instead of leaving them `BEGINNING`;
  an ACK with `confirmed:false` is not a confirmation; a contradictory `cancelled+unknown` result is
  `UNKNOWN`, not `CANCELLED`.
- A failed artifact write or a readback mismatch leaves a `SAVE_UNKNOWN` tombstone with no artifact.
- `SAVED` never implies delivery, never allocates a `deliveryId`, and never touches the relay.

## 3. Explicit limits / not done (121 status)

1. **Owner SAVED entry not written (121 status: not completed).** The Plan 08 owner SAVED write is a
   strict `SaveProof` transaction validated against the artifact store, and the artifact library labels
   every entry with a fixed fixture origin. A provider entry therefore needs **coordinated schema
   changes in both stores** (artifact origin/version + owner v3 entry/proof keys) plus full
   owner-invariant regression — explicitly not completed in this pass. The claim keeps
   `taskIdentityHash`/`claimDigest` so a later unit can bind without re-synthesis.
2. **Catalog/owner authority is injected**, not read internally. This keeps the module free of owner
   internals; the existing owner tests remain the authority for catalog issuance and owner invariants,
   and the provider unit tests use a deterministic test authority.
3. **Provider is injected** (the audited `createQwenProvider` in production, a test double here). No
   model, GPU, interpreter, network or cloud path is started.
4. **No Host/UI route**, no production write, no UI change.
5. The `expiresAt` window (24 h) is used only for the Artifact library entry, not a delivery/TTL policy.

## 4. Tests

`test/provider-generation-offline.test.mjs` (8 tests, synthetic WAV in a temporary sandbox):

- prepare → submit → SAVED artifact, joint proof, reopen/readback, double-submit no resynthesis;
- unsupported version, denied rights, duplicate/conflict/cross-scope, over-long text, refused authority;
- invalid or over-limit provider output (sample rate, channels, duration) → FAILED with no artifact;
- cancel ACK + late result → CANCELLED; unknown result → UNKNOWN and no resynthesis;
- failed artifact write → `SAVE_UNKNOWN` tombstone, no resynthesis;
- readback mismatch → `SAVE_UNKNOWN` tombstone;
- closed coordinator rejects new claims.

Full suite after this unit: **1152 tests / 1148 pass / 4 platform skips / 0 fail**; build unchanged
(`client.js` 314,687).

## 5. What a real trial would still need (not executed, not authorized)

- An explicit owner-schema v3 decision/extension (or an alternative joint-proof design) for Task SAVED.
- A trusted provider configuration surface (model path/identity, interpreter, GPU use) and a separate
  runtime permission for `start/health` and synthesis.
- Fixed short text, 1–3 requests, a bounded timeout, an isolated temp root and a snapshot budget.
- No CPU/cloud fallback claim: the Qwen manifest requires GPU and the product does not support CPU
  fallback.
