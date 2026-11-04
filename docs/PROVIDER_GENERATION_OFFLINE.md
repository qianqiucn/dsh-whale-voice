# Provider Generation → SAVED Candidate (Plan 10-R1, OFFLINE / ISOLATED)

**Status:** `IN PROGRESS` / `OFFLINE` — internal wiring candidate only. No model was loaded, no process
was spawned, no WeChat/device/window was touched, no production Host route was added, and nothing is
merged. `SAVED` means "the isolated coordinator stored provider bytes in the existing Artifact
library **and** the original task owner recorded that Artifact as the task's SAVED result (132)", not
that a user can click real generation, not that a Sender can deliver it, and not that a real model
ran.

## 1. What this unit actually is

`core/audio/provider-generation-offline.mjs` is a claim-first coordinator between an already-audited
provider contract (the existing Qwen adapter/supervisor API), the existing Artifact authority
(`openFixtureArtifactLibrary`, `artifact:fixture-bytes-…`) and the existing Task owner
(`openFixtureTaskOwner`). It deliberately does not add a Host/UI route.

Pipeline:

```
prepare(scope, task, requestKey, rights, provider, request)
  → durable claim (claim ledger v1, same trusted sandbox)
  → submit(claimId) → provider.beginSynthesis(...)
  → re-measure bytes here (WAV: PCM16 / 24 kHz / mono / 200–20000 ms / ≤1 MiB)
  → artifacts.import(same Artifact authority)
  → artifacts.readBytes readback + SHA256 equality
  → taskOwner.saveArtifact(...)  → original task CREATED → PROCESSING → ARTIFACT_READY → SAVED
  → claim SAVED (+ jointProof: claim/request digest, task birth hash, provider binding, artifact ref/hash/length/duration)
```

A failed original-task save leaves a `SAVE_UNKNOWN` tombstone on the claim (no SAVED claim, no second
synthesis, the already-imported Artifact stays as it is).

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
- **132 original-task save:** `taskOwner` is a required dependency. After the readback, the coordinator
  calls `taskOwner.saveArtifact({scopeId, taskId, now, rights, artifactRef, artifactSha256,
  artifactByteLength})`; only when that write returns `ownerState:'SAVED'` for the same `artifactRef`
  does the claim become `SAVED` (the result exposes that owner value as `task`). The owner write is
  the same `CLAIMED → FINAL SAVED` transaction with the mandatory `SaveProof`; the task record itself
  moves `CREATED → PROCESSING → ARTIFACT_READY → SAVED`. No owner/artifact schema change was needed:
  the v2 SAVED entry and its proof bind Artifact facts, not the fixture engine that produced them.
- `SAVED` never implies delivery, never allocates a `deliveryId`, and never touches the relay.

## 3. Explicit limits / not done (132 status)

1. **Original-task SAVED (132: completed).** `taskOwner.saveArtifact` records the already-imported
   provider Artifact on the birth task; reopen reads the same `SAVED`/`READABLE` artifact from the
   persisted owner and library stores. It does not synthesize and does not create a second task or
   asset store.
2. **Catalog/owner authority is injected** (and the owner handle is now required). The provider unit
   tests use a deterministic test authority with a real catalog birth/owner store; the existing owner
   tests remain the authority for catalog issuance and owner invariants.
3. **Provider is injected** (the audited `createQwenProvider` in production, a test double here). No
   model, GPU, interpreter, network or cloud path is started.
4. **No Host/UI route**, no production write, no UI change.
5. The `expiresAt` window (24 h) is used only for the Artifact library entry, not a delivery/TTL policy.

## 4. Tests

`test/provider-generation-offline.test.mjs` (12 tests, synthetic WAV in a temporary sandbox):

- prepare → submit → SAVED artifact, joint proof, original task SAVED, double-submit no resynthesis;
- 132: the provider result is saved by the original task and survives a full reopen (the same test
  fails on the baseline as `TASK_OWNER_NOT_FOUND` when the task owner write is missing);
- unsupported version, denied rights, duplicate/conflict/cross-scope, over-long text, refused authority;
- invalid or over-limit provider output (sample rate, channels, duration) → FAILED with no artifact;
- cancel ACK + late result → CANCELLED; unknown result → UNKNOWN and no resynthesis;
- failed artifact write → `SAVE_UNKNOWN` tombstone, no resynthesis;
- readback mismatch → `SAVE_UNKNOWN` tombstone;
- closed coordinator rejects new claims.

Full suite after this unit: **1156 tests / 1152 pass / 4 platform skips / 0 fail**; build unchanged
(`client.js` 314,687).

## 5. What a real trial would still need (not executed, not authorized)

- A trusted provider configuration surface (model path/identity, interpreter, GPU use) and a separate
  runtime permission for `start/health` and synthesis.
- Fixed short text, 1–3 requests, a bounded timeout, an isolated temp root and a snapshot budget.
- No CPU/cloud fallback claim: the Qwen manifest requires GPU and the product does not support CPU
  fallback.
