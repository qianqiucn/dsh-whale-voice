# Isolated Configuration Write (Phase 4B-1)

**Status:** `OFFLINE` — merged via PR #9; isolated single-file store and test-only HTTP API. There is
**no production write route** on the DSH Host and no write to WeChatAgent, Bridge, Voice Sender, Qwen
or `%DSH_HOME%/whale-voice/core.json` in this phase.

**Scope:** implement and test the foundation for safe configuration writes: schema validation,
migration, an opaque process-local revision, optimistic concurrency, single-file atomic save, recovery
and saved-vs-effective separation.

---

## 1. Components

| Module | Responsibility |
|---|---|
| [`core/config-sandbox.mjs`](../core/config-sandbox.mjs) | trusted test-sandbox capability, marker and root/realpath checks |
| [`core/config-schema.mjs`](../core/config-schema.mjs) | pure schema validation, v0→v1 migration and sanitized public projection |
| [`core/config-store.mjs`](../core/config-store.mjs) | sandboxed target guard, revision, optimistic write, atomic replace and rollback |
| [`core/isolated-write-server.mjs`](../core/isolated-write-server.mjs) | test-only loopback HTTP API; **not imported by the production Host** |
| [`test/config-store.test.mjs`](../test/config-store.test.mjs) | behavior tests for validation, revision, atomicity, recovery, isolation and API |

The production Host (`index.js`) and the read-only Core server (`core/server.mjs`) are unchanged.

---

## 2. Trusted sandbox capability and fixed target

An arbitrary directory string is **not** a write capability. Tests/development code must first create a
trusted sandbox under the OS temporary root:

```js
import { createConfigSandbox } from './core/config-sandbox.mjs'
import { createConfigStore } from './core/config-store.mjs'

const sandbox = createConfigSandbox()
const store = createConfigStore({ sandbox })
```

`createConfigSandbox()`:

- creates a fresh directory under the real OS temporary root;
- writes a random-id marker (`.whale-voice-sandbox.json`, mode `0600`);
- registers an opaque, frozen capability in a module-private `WeakSet`;
- returns the capability, not a caller-supplied path string.

`createConfigStore()` accepts only that registered capability:

- an ordinary directory string is rejected with `CONFIG_SANDBOX_REQUIRED`, even if it is named
  `test` or `isolated`;
- a forged sandbox object is rejected;
- root, realpath, marker path, marker identity and temporary-root containment are re-checked;
- a marker that is deleted, replaced or redirected fails closed with `CONFIG_SANDBOX_INVALID`;
- a symlink or junction for the root/marker is rejected;
- the target file name is fixed (`config.json` by default), directly inside the sandbox;
- the browser/API can never provide a path, URL or command;
- a target symlink/junction or target that escapes the root is rejected with
  `CONFIG_PATH_ESCAPE`;
- `%DSH_HOME%/whale-voice`, `WHALE_WECHATAGENT_HOME`, `WHALE_VOICE_SENDER_HOME` and overlapping
  directories are rejected with `CONFIG_UNSAFE_ROOT`;
- `options.env` is only an additional deny-list source; it cannot turn a path into a trusted
  sandbox, and the real process environment is also considered;
- there is no disk-wide scan and no automatic creation of arbitrary directories.

The sandbox capability is intended to be bound to a controlled test lifecycle. This is **not** an
absolute OS sandbox against a hostile process with filesystem access or write permission to the
temporary root; it prevents accidental namespace/path trust, not a compromised OS account. See §6.

---

## 3. Schema v1

This isolated schema is the new unified write contract, not the read-only roots file
`core/config.example.json`. It deliberately never writes the sanitized `ConfigSnapshot` back to disk;
the full v1 object is the authoritative input, while the public projection is read-only.

```json
{
  "schemaVersion": 1,
  "voice": {
    "enabled": false,
    "mode": "explicit",
    "forGroup": false,
    "autoProbability": 0,
    "defaultVoice": "whale-v1"
  },
  "tts": {
    "provider": "qwen-local",
    "model": "Qwen3-TTS-12Hz-1.7B-Base",
    "voice": "whale-v1",
    "baseUrl": "http://127.0.0.1:8765"
  },
  "permissions": {
    "private": ["wechat:private:fixture-a"],
    "groups": []
  }
}
```

### Required fields

- `schemaVersion` (integer `1`);
- `voice.enabled`, `voice.mode`, `voice.forGroup`, `voice.autoProbability`,
  `voice.defaultVoice`;
- `tts.provider`, `tts.voice`;
- `permissions.private`, `permissions.groups`.

### Optional fields

- `tts.model`: string or `null`;
- `tts.baseUrl`: `http(s)` URL without embedded credentials, or `null`.

Missing required safety fields are errors. They are never defaulted to `false`, `0`, “allowed” or
“unknown but safe”.

### Rules

- `voice.mode` is currently `explicit` only; automatic voice modes need a future schema revision.
- `voice.autoProbability` is an integer in `[0,100]`.
- permission arrays are unique target IDs with a bounded length; no display names.
- unknown fields are **rejected** (`CONFIG_UNKNOWN_FIELD`), not silently dropped.
- invalid types, enums, ranges, URLs or duplicate IDs fail the whole write; no partial file is written.

---

## 4. Migration

The only supported migration is legacy `schemaVersion: 0` → `schemaVersion: 1`.

Legacy v0 is a frozen migration fixture using the old flat voice fields:

```json
{
  "schemaVersion": 0,
  "enabled": false,
  "mode": "explicit",
  "for_group": false,
  "auto_probability": 0,
  "default_voice": "whale-v1",
  "tts": { "provider": "qwen-local", "voice": "whale-v1" },
  "permissions": { "private": [], "groups": [] }
}
```

- migration is pure and idempotent;
- reading a v0 file returns a migrated v1 object and a revision based on the migrated content;
- the v0 file is not modified by `read()`;
- writing the migrated object persists v1 only in the isolated file;
- incompatible versions fail closed with `CONFIG_SCHEMA_UNSUPPORTED`;
- no production configuration is migrated by this phase.

---

## 5. Revision and optimistic concurrency

The store computes an opaque, process-local HMAC-SHA-256 revision:

- key generated per process (or injected only in tests);
- 32 lowercase hex characters;
- input covers the full authoritative v1 object, including permission IDs and TTS base URL;
- the key and raw values are never returned by the API;
- a process restart produces a different revision even for identical content; callers must re-read.

A write requires `expectedRevision`:

1. validate the request revision format;
2. read the current saved configuration;
3. compute its current revision;
4. compare with `expectedRevision`;
5. validate the proposed object;
6. re-read immediately before writing;
7. write a temp file, fsync and re-check the current revision;
8. atomically replace the target;
9. re-read and verify the saved revision.

A mismatch returns `409 CONFIG_CONFLICT` / `CONFIG_CONFLICT`; the newer file is never overwritten.

Within one store instance, writes are serialized. Two concurrent writes with the same expected
revision produce one `SAVED` and one `CONFLICT`.

---

## 6. Atomic save and recovery

Single-file save sequence:

1. validate schema;
2. confirm the target is still inside the root and is a regular file;
3. create a unique temp file in the same directory (`wx`, mode `0600`);
4. write the complete JSON, verify the byte count and `fsync` it;
5. re-check the current revision;
6. `rename` the temp file over the target (same filesystem);
7. best-effort directory `fsync`;
8. re-read and verify the saved revision;
9. remove temp resources.

Failure behavior:

- pre-write / validation failure: no file change;
- temp open/write/fsync/replace failure: original file remains; temp is cleaned;
- short write: failed before replace;
- post-save verification failure: the previous raw content is restored via another temp+rename; the
  result is `CONFIG_VERIFY_FAILED` with `rolledBack: true`;
- if rollback cannot be confirmed, `CONFIG_ROLLBACK_FAILED`, never a false success;
- orphan temp files are ignored by reads and can be removed with `cleanupTempFiles()`.

### Windows limitation

The implementation relies on same-directory `fs.rename` to replace the target. This is atomic on the
tested Windows/NTFS and POSIX environments, but Windows can fail with `EPERM`/`EACCES` when the file
is open, locked by antivirus/indexing or permission-restricted. The store returns a failure and keeps
the previous file; it does **not** delete the target and retry a non-atomic copy. Directory `fsync` is
best-effort because it is not portable on Windows.

### External writers and multi-process limits

The store guarantees serialization inside one store instance. It does **not** guarantee
cross-process compare-and-swap against arbitrary external writers:

- a write re-reads the file several times before `rename`, narrowing the race;
- a non-cooperating process can still modify the target in the final window between the last check
  and `rename`;
- another Core instance in the same process/root is not coordinated by this store;
- directory permissions and OS file locking are part of the deployment boundary.

This limitation is explicit; Phase 4B-1 does not claim full multi-process concurrency safety.

### Multi-file transactions

This phase implements **one file** only. The real system spans Core, WeChatAgent, Bridge
`voice-settings.json`, Voice Sender service and Worker files. Several independent atomic renames do
not make a transaction; per-file partial success, ordering, journalling, cross-file rollback and
recovery are future work (Phase 4B-2A or later).

---

## 7. Saved vs effective

Public state uses:

| State | Meaning |
|---|---|
| `UNCHANGED` | read/no-op; no new content written |
| `DIRTY` | UI has a draft (frontend only) |
| `VALIDATING` | schema/revision validation in progress (UI) |
| `SAVING` | write in progress |
| `SAVED` | file content was replaced and verified |
| `PENDING_APPLY` | saved, but runtime effect is not confirmed |
| `APPLIED` | runtime effect confirmed by trusted evidence |
| `CONFLICT` | expected revision is stale |
| `FAILED` | validation/write/verification failure |
| `UNKNOWN` | state is not known |

A pure read/GET returns top-level `state: "UNCHANGED"` and
`application.state: "UNCHANGED"`; it does **not** claim that a new pending change exists. A successful
write returns top-level `state: "SAVED"` and `application.state: "PENDING_APPLY"`. A no-op write
returns `UNCHANGED`/`UNCHANGED`. `CONFLICT`/`FAILED` are error states and do not produce a successful
public view.

`APPLIED` is reserved for a future trusted runtime-effect interface and is not produced by Phase
4B-1. The public projection always keeps:

```text
activeRevision = null
activeConfirmed = false
activeState = UNKNOWN
```

There is no supported runtime config-version interface. HTTP 200 or a successful file save is **not**
proof that the Bridge, Sender Worker or WeChatAgent applied the value.

---

## 8. Test-only HTTP API

`createIsolatedWriteServer()` is for tests/development only and is not registered by `index.js`.

```text
GET  /config  -> public read view
POST /config  -> { expectedRevision, config }
```

Security:

- loopback socket and loopback Host only;
- `x-whale-config-token` required (timing-safe compare);
- POST requires an explicit same-origin `Origin`;
- `Sec-Fetch-Site: cross-site` rejected;
- `application/json` only;
- body cap 64 KiB and body timeout 2 s;
- one active write per server; further concurrent writes receive `429 CONFIG_WRITE_BUSY`;
- no path, URL, command or arbitrary file name in the request;
- responses contain only the sanitized public view (permission counts, no IDs, no base URL, no token).

Status mapping includes `401`, `403`, `404`, `405`, `408`, `409`, `413`, `415`, `422`, `429` and
`500`.

---

## 9. Test coverage

The behavior tests cover:

- read, save, no-op, schema type/enum/range/required/unknown/duplicate fields;
- pure-read vs write vs no-op vs conflict/failure state semantics, including `activeState:UNKNOWN`;
- v0 migration and idempotence;
- revision success, conflict, restart invalidation, external modification, direct concurrency;
- temp failures, partial write, fsync failure, replace failure, post-save verification failure and
  rollback;
- permission/read/corrupt/missing files;
- trusted sandbox capability, forged capability, tampered marker, unapproved ordinary directories,
  production/WeChatAgent/Sender roots, fake `DSH_HOME`, filename traversal and symlink/junction escape;
- API auth, Origin, body limit, malformed JSON, timeout, schema/conflict handling, concurrency and
  sensitive-field output;
- rejected paths leave no target file modification;
- the production Host remains read-only and does not import the isolated write server.

The existing read-only detector, No-Core, stale-response, UI and demo tests remain unchanged.

---

## 10. Next stage

Phase 4B-2A, only after separate authorization, should address:

- a controlled production write API behind the trusted Host;
- multi-file transaction/journal and partial-success recovery;
- cross-process locking/CAS or an explicit single-writer service boundary;
- actual apply/effect confirmation and rollback;
- frontend draft/conflict/pending-apply UX.

This phase does not modify production configuration, restart services, start Voice Sender, touch
WeChatAgent/Qwen or send messages.
