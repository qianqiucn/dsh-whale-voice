# Unified Configuration Coordination (Phase 4B-2A)

**Status:** `OFFLINE` — isolated coordination protocol and fixture tests only. No production
configuration write, no production Host route, no service start/stop/reload and no WeChat send.

**Scope:** define how a future Core can plan, save and confirm changes across independent component
authorities without merging their safety layers or claiming runtime effect from file writes.

---

## 1. Authority matrix

Paths are logical; the Core resolves them from configured roots. No browser request can supply or
override a path, URL or command.

| Configuration | Authoritative source | Writer | Read/apply behavior | Runtime confirmation | Phase 4B-2A handling |
|---|---|---|---|---|---|
| Core component roots / Qwen URL | `%DSH_HOME%/whale-voice/core.json` | Core | Read at Host boot; reload requires a Host restart | None | `core` source is read-only; paths/URLs are not accepted from a client |
| Bridge user voice switch | `%WECHATAGENT_ROOT%/data/workspace/state/voice-settings.json` | Bridge | Read by the Bridge on each voice call; hot-read | No supported loaded-revision API | `bridgeVoice` is a simulated writable source; high-risk preview only |
| WeChat message access / permissions | `%WECHATAGENT_ROOT%/data/workspace/config/wechatagent.json` | WeChatAgent | Auth-protected health; no active-config read | No supported config-version API | Read-only; no names/IDs accepted or exposed |
| Sender Service settings | `%VOICE_SENDER_ROOT%/service/service.config.json` | Sender Service | Service-owned config; may require service reload | No supported loaded-revision API | `senderService` is a simulated writable source for TTS/automation fields only |
| Worker final safety permit | `%VOICE_SENDER_ROOT%/config.json` | Sender Worker | Independent `voice_enabled` gate before recording/sending | No supported loaded-revision API | Read-only; **never** changed by Bridge/Sender coordination |
| TTS provider / voice | `%VOICE_SENDER_ROOT%/service/service.config.json` + Qwen `/health` | Provider config layer / Sender Service | Saved provider/voice vs Qwen runtime observation | Qwen health is observation only; not apply proof | `ttsProvider` maps to `senderService`; no duplicate writer |
| Target map | `%VOICE_SENDER_ROOT%/service/targets.json` | Voice Sender | Private target identity | N/A | Never read, returned or written |
| Qwen runtime | `%QWEN_URL%/health` | Qwen | Read-only health/model/voice | Observation only | Read-only observation |

### Bridge vs Worker

`voice-settings.json` `enabled` is the Bridge user switch. Voice Sender `config.json`
`voice_enabled` is the Worker independent final-safety permit. They are **different safety layers**:
a Worker `true` cannot override a Bridge `false`, and a Bridge `true` does not bypass the Worker.
The coordinator never writes `voice_enabled`, never merges the two values and never treats either as
permission to expand WeChat targets.

---

## 2. Coordinator API

`core/config-coordinator.mjs` exports:

```js
createConfigCoordinator({ sandbox, sources, runtime, fsImpl? })
getConfigAuthorityMatrix()
```

The coordinator requires a trusted `createConfigSandbox()` capability. It does not accept a root,
file path, URL or command from the caller. Source adapters are injected by a trusted test/application
entry point.

| Method | Purpose |
|---|---|
| `getBaseline()` | Read allow-listed display fields and opaque revisions; no target IDs/tokens |
| `prepareChange(draft)` | Validate sources and revisions, return a safe change plan |
| `validatePlan(planId)` | Re-read revisions without writing |
| `execute(planId, {userConfirmed, confirmedPlanId})` | Save the prepared sources in order; journal each step |
| `apply(transactionId, {userConfirmed, observedVersion?})` | Call only trusted runtime confirmation interfaces |
| `recover(transactionId)` | Read-only recovery classification; never repeats saves/applies |
| `getStatus(transactionId, {observedVersion?})` | Read current state; stale observers are ignored |

### Draft shape

```js
{
  schemaVersion: 1,
  changes: {
    bridgeVoice: {
      expectedRevision: '<32 lowercase hex>',
      set: { enabled: false, mode: 'explicit', ... }
    },
    senderService: {
      expectedRevision: '<32 lowercase hex>',
      set: { tts: { provider: 'qwen-local', voice: 'whale-v1' } }
    }
  }
}
```

Only `bridgeVoice` and `senderService` are writable in Phase 4B-2A. `core`, `workerSafety` and
`wechatPermissions` are read-only. The plan is private-input based: the public plan contains field
names, opaque revisions, risk and dependencies, but no full config, target names, tokens or paths.

---

## 3. Plan contract

`prepareChange()` returns `state: PREPARED`, `previewOnly: true`, `saved: false`,
`applyState: NOT_APPLIED`, `activeRevision: null`, `activeConfirmed: false` and:

- source IDs and authority labels;
- current/expected opaque revisions;
- changed field names only;
- risk level (`MEDIUM`/`HIGH`/`CRITICAL`);
- whether a reload may be required;
- whether runtime confirmation exists;
- dependencies (for example `bridgeVoice → workerSafety` as a read-only dependency);
- whether execution is simulation-only;
- whether explicit user confirmation is required.

A preview is **not** a save, **not** runtime application and **not** permission to enable voice.
Execution requires `userConfirmed: true` **and** `confirmedPlanId` equal to the exact plan when the
plan is high risk.

Each `prepareChange()` gets an unpredictable, random plan ID. The ID is not derived from the new
values and does not leak them; the server keeps an immutable private snapshot of the validated draft,
the candidate documents and the source revisions. Two plans with the same current revision and field
names but different values (for example `voice-a` and `voice-b`) therefore have different identities
and cannot overwrite each other's executable snapshot. Plans expire after the configured TTL
(default 10 minutes) and are marked consumed once a journal is created; consumed or expired plans
cannot be executed again.

A plan confirmation is scoped to one exact plan ID. A shared flag, generic "confirm" action or another
plan's ID must not authorize a different high-risk change.

---

## 4. State contract

The coordinator distinguishes save and apply states:

| State | Meaning |
|---|---|
| `PREPARED` | Validated plan exists; nothing has been written |
| `VALIDATING` | Reserved for an explicit validation phase |
| `SAVING` | A save transaction is in progress |
| `SAVED` | All source saves completed and the journal is committed |
| `PENDING_APPLY` | Saved, but no trusted runtime confirmation yet |
| `APPLYING` | Runtime confirmation calls are in progress |
| `APPLIED` | Every source returned a loaded revision exactly matching its saved revision |
| `PARTIALLY_APPLIED` | Some sources exactly confirmed; others rejected/mismatched/unknown; no automatic retry |
| `CONFLICT` | Expected revision changed; no write |
| `FAILED` | Validation/save failed; reversible steps may have been rolled back |
| `UNKNOWN` | Result cannot be confirmed; do not infer success or retry blindly |

Public results keep `activeRevision: null` unless a single source supplies a trusted loaded revision.
For multi-source apply, per-source `activeRevision` evidence is returned; there is no invented global
revision. `activeConfirmed` is true only for `APPLIED`.

No PID, process liveness, file mtime, HTTP 200, health check or equal file contents can establish
`APPLIED`. The runtime evidence contract is:

```js
{
  ok: true,
  loadedRevision: '<must equal the savedRevision supplied to apply>'
}
```

A different algorithm is accepted only through a trusted component interface that proves the loaded
revision corresponds to this saved revision; no such interface is implemented in Phase 4B-2A. A
mismatched, older, empty or forged revision returns `UNKNOWN`/`REVISION_MISMATCH`, never `APPLIED`.
A saved revision is never matched against an arbitrary well-formed 32-hex value.

---

## 5. Journal and recovery

The journal lives only at:

```text
<trusted-sandbox>/.whale-coordination/<transaction-id>.json
```

It records:

- transaction ID and plan ID;
- phase, committed marker, version, timestamps;
- source IDs and per-step status;
- expected/saved opaque revisions;
- error codes and user-confirmation requirement.

It does **not** record source config documents, target IDs, tokens, allowed lists or private names.
If recovery needs previous documents, they must be kept in a separate restricted private recovery
store; Phase 4B-2A deliberately does not put them in the journal.

Reads revalidate the trusted sandbox, journal directory realpath/type and a bounded file size before
parsing. The journal schema, phase, version, transaction ID, source IDs, step statuses and revisions
are checked strictly. A symlink/junction, oversized file, truncated JSON, unknown field or inconsistent
step is rejected as `CONFIG_COORDINATION_JOURNAL_INVALID`; the caller gets a safe failure, not an
uncaught exception or unrelated file content.

Writes use a same-directory temp file, best-effort `fsync`, rename and best-effort directory `fsync`.
This is a durability boundary, **not** a claim of verified power-loss atomicity on Windows or any
filesystem.

Recovery is read-only:

- `SAVED` → `PENDING_APPLY`;
- `APPLIED`/`PARTIALLY_APPLIED` → same terminal state;
- `FAILED` → `FAILED`;
- `SAVING`/`APPLYING` → `UNKNOWN` with `recoveryRequired:true`;
- repeated recovery never repeats a save/apply side effect.

Same-process rollback is attempted only for source saves the adapter marks as reversible and
confirmed. If rollback cannot be confirmed, the result is `UNKNOWN`, not a claimed full rollback.
No journal means no recovery; no automatic process restart is attempted.

### Save failure outcome

A failed `save()` is not automatically treated as "nothing was written". The adapter must report
`writeOutcome: "NOT_WRITTEN"` as explicit evidence of no side effect, or `"UNKNOWN"`/omit it. If the
outcome is unknown, the transaction remains `UNKNOWN` even when earlier reversible steps were rolled
back. Only an explicit `NOT_WRITTEN` plus confirmed rollback of all earlier steps may produce
`FAILED`/`rolledBack:true`.

### Rollback confirmation

Rollback is complete only when all of the following hold for every previously saved source:

1. the adapter reports `{ok:true}`;
2. its reported revision is present and exactly equals that source's pre-transaction
   `previousRevision`;
3. a subsequent read-only `read()` succeeds;
4. the observed revision exactly equals the same `previousRevision`.

Missing/mismatched reported revisions, read exceptions, observed external modification and unknown
results are `UNCONFIRMED`; the transaction stays `UNKNOWN`. Evidence contains only source ids,
expected/reported/observed opaque revisions and reason codes — never config documents or private
targets. Rollback is not retried automatically.

---

## 6. Single writer and concurrency

- All coordinator mutations are serialized in one coordinator instance.
- One plan can produce one save; consuming the plan prevents a second execution. A different plan
  with stale revisions still returns `CONFLICT`.
- An external non-cooperating writer can race between revision checks and the source adapter commit.
  Phase 4B-2A does **not** claim cross-process strong consistency.
- No supported cross-process lock/CAS was found for these external files. A production adapter must
  either use a component-provided lock/transaction boundary or explicitly document the residual race.
- The Source Adapter is the single writer responsibility for its authority. The coordinator never
  writes another component's file directly.

---

## 7. Runtime confirmation

Phase 4B-2A uses only an injected `FakeRuntime` in isolated tests. A runtime adapter supports:

```js
{
  apply({ source, savedRevision, transactionId }) {
    return { ok: true, activeRevision: '<loaded revision>' }
  }
}
```

- `APPLIED` requires every saved source to return a trusted loaded revision.
- A missing interface yields `PENDING_APPLY`, `activeRevision:null`, `activeConfirmed:false`.
- Rejection yields `FAILED`/`PARTIALLY_APPLIED`; unknown/throw yields `UNKNOWN`.
- No runtime adapter starts Sender, reloads Bridge/Worker, changes audio devices or sends a voice
  task.
- Applying config does not dispatch a voice task and does not grant WeChat permission.

---

## 8. Frontend protocol

The coordinator methods are the proposed Core API. The frontend must receive:

- baseline revisions and allow-listed values;
- safe plan summaries;
- conflict/error states;
- save transaction ID;
- apply/recovery state;
- no raw config, target IDs, tokens or absolute paths.

The existing production frontend is not modified in Phase 4B-2A. No demonstration switch becomes a
real write control. A future UI may render the states
`DIRTY → VALIDATING → CONFLICT / SAVED → PENDING_APPLY → APPLIED / UNKNOWN` from this API.

---

## 9. Isolation and tests

The test suite uses:

- trusted temp sandbox + journal;
- in-memory fixture source adapters (not production file stores);
- Fake Runtime confirmation;
- injected save/journal failures and external revisions.

Covered behavior includes single/multi-source plans, schema/unknown/revision errors, distinct plan
identity for different values, exact-plan confirmation, expiry/consumption, single-instance
concurrency, external modification, partial save/rollback, save-failure write-outcome unknown,
journal failure/recovery, journal schema/size/symlink tampering, exact runtime revision matching,
mismatch/old/empty/forged confirmation, runtime reject/partial/unknown, sensitive output,
Worker/permission boundaries, Core read/schema errors, stale observers, Host non-import and journal
containment.

The Phase 4B-2A suite currently has 49 tests (48 pass, 1 platform-conditional symlink skip).

Production source adapters and real runtime confirmation remain **NOT IMPLEMENTED**. The fixture
adapter intentionally does not claim atomic file writes; a production adapter must use the owning
component's API or the existing ConfigStore/atomic primitives.

---

## 10. Windows limitations

- Journal writes use temp+rename inside the trusted temp sandbox; file locking/antivirus can still
  cause `EPERM`/`EACCES`; the result is `FAILED`/`UNKNOWN`, never an assumed success.
- Real production files are not touched. Windows-specific atomic replacement, service reload and
  Worker/Bridge hot-read behavior must be revalidated with the real components under separate
  authorization.
- No service start, stop, reload, audio-device change or WeChat operation is part of this phase.

---

## 11. Next gate (Phase 4B-2B)

Before any production write/apply:

1. Implement source adapters for the actual authority owners using their supported APIs.
2. Add component-provided loaded-revision confirmation; absence must remain `PENDING_APPLY`.
3. Resolve cross-process locking/CAS or adopt an explicit single-writer service.
4. Add real multi-file journal persistence and restricted private recovery storage if rollback needs
   backups.
5. Revalidate Windows locking, service reload, Bridge hot-read and Worker final-safety behavior.
6. Obtain separate production-write authorization; no UI switch may bypass Worker/WeChatAgent.

Phase 4B-1 remains `OFFLINE`; Phase 3B/4A remain `INTEGRATED`; Phase 4B-2A is an isolated prototype,
not production acceptance.
