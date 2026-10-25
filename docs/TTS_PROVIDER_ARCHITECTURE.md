# Provider-Neutral TTS / SVC Architecture (TTS-A / TTS-A-H)

**Status:** design and pure contracts only. No provider adapter, Host route, credential store or
production configuration is connected in this phase.
**Related:** [TTS Provider Audit](TTS_PROVIDER_AUDIT.md),
[Capability API](CAPABILITY_API.md), [Architecture](ARCHITECTURE.md).

## 1. Product boundary and three layers

Whale Voice is a multi-engine voice plugin. The target responsibilities are deliberately separated:

| Layer | Owns | Does not own |
|---|---|---|
| **Whale Voice Core** | TTS/SVC task coordination, provider management, unified voice library, audio artifact management | WeChat access, UI Automation, final WeChat delivery |
| **Whale Relay Core（鲸递）** | Safe delivery, UI Automation adapter, future optional Native Hook, delivery status, deduplication and target verification | Provider synthesis, voice library, WeChat account identity |
| **WeChatAgent** | WeChat access, account/session identity, existing chat authorization | TTS/SVC synthesis, provider selection, Relay deduplication |

**Whale Relay Core is a target component and is not implemented in this phase.** The current
repository still reaches the existing Voice Sender Windows UI Automation path; Relay Core is the
future boundary that will own that delivery adapter. WeChatAgent remains the required WeChat platform
layer and is not replaced by Relay or by Whale Voice.

```text
DSH UI / Bridge
      |
      v
Whale Voice Core
  TTS/SVC task coordination + Provider management
  Unified voice library + audio artifact management
      |
      +--> TTS Provider Adapter (LOCAL / CLOUD / CUSTOM)
      |        |
      |        +--> audio artifact + metadata
      |
      +--> SVC Engine Adapter (Seed-VC / RVC candidates)
      |        |
      |        +--> converted audio artifact
      |
      +--> Shared Audio Pipeline (validate/normalize/cache)
      |
      +--> Whale Relay Core（鲸递）
               Safe delivery + UI Automation adapter
               Optional Native Hook + delivery status/dedup/target verification
               |
               +--> WeChatAgent access/identity + existing Voice Sender UI Automation path
```

Provider/SVC outputs never include a WeChat send, target chat mutation, Worker permit change,
credential value or direct filesystem path. All audio goes through the shared pipeline and Relay;
**no Provider may directly send WeChat messages**.

## 2. Provider interface

The authoritative pure validator is `core/tts/provider-contract.mjs`. Every provider manifest has:

| Field | Contract |
|---|---|
| `id`, `name`, `kind` | Stable lower-case ID, display name, `LOCAL` / `CLOUD` / `CUSTOM` |
| `version` | `{value, source, audited}`; no value means `UNKNOWN`; only an audited value can be `AUDITED` |
| `capabilities.languages` | Declared language tags |
| `capabilities.voices` | `{id, name, kind, languages, referenceAudioRequired}`; ID is provider-scoped |
| `capabilities.clone` | Whether reference-audio cloning is supported |
| `capabilities.emotion` | Whether emotion is supported, allowed modes and default mode |
| `capabilities.streaming` | Streaming synthesis declared, not assumed |
| `capabilities.formats` | `{mime, sampleRate, channels}` audio formats |
| `capabilities.limits` | Max chars, timeout, max audio seconds |
| `capabilities.retry` | Max attempts, retryable reasons, idempotency |
| `capabilities.cancellation` | Whether cancellation is supported |
| `health` | `http`/`local`/`none`, relative path, timeout, auth mode |
| `credentials` | Required, protected storage kind, optional credential reference |
| `network` | Required, text-upload flag, endpoint policy |
| `privacy` | Whether text leaves the device, retention policy, note |
| `cost` | Paid/free and billing model, note |
| `resources` | Local/GPU/CPU requirements |

`providerCapabilitySummary()` exposes only counts/declarations for UI; it never exposes secrets.
The manifest top-level allowlist is `schemaVersion, id, name, kind, version, capabilities, health,
credentials, network, privacy, cost, resources`; unknown top-level fields are rejected, including
`targetChatId` and delivery-target fields.
`evaluateProviderStatus()` maps an observation to `AVAILABLE` / `DEGRADED` / `UNAVAILABLE` /
`CREDENTIALS_MISSING` / `UNKNOWN`. A required credential that is `unknown`/missing cannot produce
`AVAILABLE`; only an explicit `present` permits an `ok` observation to become `AVAILABLE`. A timeout
or provider error is `DEGRADED`, not healthy.

### Synthesis request

```json
{
  "requestId": "opaque-id",
  "text": "text to synthesize",
  "voiceId": "provider-scoped-voice",
  "language": "zh-CN",
  "emotion": "neutral",
  "format": "audio/wav",
  "streaming": false
}
```

`checkSynthesisRequest()` fails closed with stable codes: unsupported voice, language, emotion,
streaming or format, missing credentials, provider unavailable, text outside limits. The request
top-level allowlist is `requestId, text, voiceId, language, emotion, format, streaming`; unknown
fields such as `wechat`, `targetChatId`, `recipient`, `send` or `deliveryTarget` return
`INVALID_RESPONSE` before normal capability checks.

### Synthesis result

```json
{
  "schemaVersion": 1,
  "providerId": "provider-id",
  "requestId": "opaque-id",
  "voiceId": "provider-scoped-voice",
  "language": "zh-CN",
  "emotion": "neutral",
  "artifactRef": "opaque-audio-reference",
  "mime": "audio/wav",
  "sampleRate": 24000,
  "channels": 1,
  "durationMs": 1200,
  "delivery": { "state": "PENDING_ROUTER" }
}
```

The result contains an opaque `artifactRef`, not a raw filesystem path or an embedded credential.
`normalizeSynthesisResult()` rejects `delivery.state != PENDING_ROUTER`, `wechat`, `send`, `target`
and secret-looking fields. The result top-level allowlist is `requestId, voiceId, language, emotion,
artifactRef, mime, sampleRate, channels, durationMs, createdAt, warnings, delivery`; unknown target
fields are rejected rather than silently dropped. Whale Relay Core（鲸递）is the only future component
allowed to hand audio to the existing Voice Sender flow.

## 3. Registry

`core/tts/provider-registry.mjs` is a **candidate catalog**, not an implementation:

| Candidate | Kind | Status |
|---|---|---|
| Qwen3-TTS (`qwen3-tts`, legacy alias `qwen-local`) | LOCAL | reference implementation; not a product default; not a registry adapter |
| Piper | LOCAL | candidate only |
| Kokoro | LOCAL | candidate only |
| sherpa-onnx | LOCAL | candidate only |
| IndexTTS | LOCAL | candidate only; model variants/license/clone/emotion/CPU-GPU unverified |
| Azure Speech | CLOUD | candidate only |
| ElevenLabs | CLOUD | candidate only |
| Google Gemini TTS | CLOUD | candidate only; API/voices/languages/retention/cost unverified |
| OpenAI Speech API | CLOUD | candidate only; endpoint/model/voice/format/cost unverified; no default voice |
| Custom HTTP TTS | CUSTOM | candidate only |

All entries have `integrationStatus: NOT_IMPLEMENTED`, `selectable: false`; the registry exposes no
default provider and `selectProviderCandidate()` always returns `NOT_IMPLEMENTED` in TTS-A. A future
adapter must add an audited manifest and explicit selection; it cannot appear merely because a
process, model file or URL exists. The three new entries add no model name, default voice, endpoint,
credential or claimed capability.

### TTS / SVC boundary

TTS and SVC are two task types with different inputs, even though they share infrastructure:

| | TTS | SVC |
|---|---|---|
| Input | Text + synthesis parameters | Existing speech/singing audio + conversion parameters |
| Output | Synthesized audio artifact | Converted audio artifact |
| Example engines | Qwen3-TTS, Piper, Kokoro, cloud TTS | Seed-VC, RVC |
| Registry | `core/tts/provider-registry.mjs` | `core/svc/svc-registry.mjs` (separate) |
| Contract | `core/tts/provider-contract.mjs` | `core/svc/svc-contract.mjs` |

- Seed-VC and RVC are **SVC candidates only** and are not inserted into the TTS Provider Registry.
- Both task types use the **shared voice library**, **shared audio pipeline** and **shared task
  system** owned by Whale Voice Core.
- SVC source audio is an opaque artifact reference, never a raw file path; the target voice comes
  from the shared library, not an engine default.
- SVC request allowlist: `sourceAudioRef, targetVoiceId, pitchShift, formantShift,
  conversionStrength, outputFormat`; unknown target/delivery fields are rejected. A successful
  validation returns only these allowed fields, with `outputFormat` retained only when supplied.
- SVC results also end with `delivery: PENDING_ROUTER`; Relay owns delivery.
- **Fixed input boundary (Plan 03-A-F01):** both SVC entry points accept only plain objects
  (`Object.prototype` or `null` prototype). Every own property of each fixed schema layer must be
  an enumerable string-keyed data property; Symbol keys, hidden/non-enumerable properties, getters
  and setters are rejected **without being invoked**, and each layer is capped at 32 own keys.
  Unknown fields are rejected, never silently dropped, and error paths use the fixed
  `<unknown-key>` placeholder rather than the caller's key text.
- **Result shape:** the root allowlist is `providerId, requestId, targetVoiceId, artifactRef, mime,
  sampleRate, durationMs, createdAt, delivery`. `requestId, targetVoiceId, artifactRef, mime,
  sampleRate, durationMs` are required; `providerId` and `delivery` are optional. An explicit
  `delivery` must be exactly `{ state: 'PENDING_ROUTER' }` with no additional keys; `SENT` and
  `NOT_REQUESTED` are not valid v1 inputs. The normalized result keeps exactly ten fields and never
  shares the input object or its `delivery` object.
- **`createdAt`:** absent, `undefined` or `null` normalize to `null`; otherwise only a canonical UTC
  string `YYYY-MM-DDTHH:mm:ss.sssZ` is accepted, verified by parsing and a strict
  `toISOString()` round-trip (invalid calendar dates are rejected). No clock or random value is read
  and no default time is invented.
- **Errors:** fixed reason phrases and fixed paths (`$`, known fields, `delivery.state`,
  `<unknown-key>`, `delivery.<unknown-key>`); failure envelopes never echo caller keys, values,
  exception text or stack text, and never carry the original request/result object.
- `PENDING_ROUTER` is a normalized label only; it does not mean queued, deliverable or backed by a
  real artifact.
- Registry selection helpers return plain-string codes (`NOT_IMPLEMENTED`, `PROVIDER_UNKNOWN`,
  `SVC_ENGINE_UNKNOWN`) that are **not** part of the `PROVIDER_ERRORS`/`SVC_ERRORS` contract
  namespaces. Unifying those domains is a future adapter/documentation item; this repair does not
  rename any public error value.
- TTS-A-H only defines the SVC contract/candidate boundary. No SVC inference, model download,
  training, conversion, audio generation or consent workflow is implemented.

## 4. Configuration schema v2 proposal

The current schema v1 has one `tts` object with `provider`, `model`, `voice`, `baseUrl`. The proposal
adds instances, models, voices, voice packs and explicit compatibility metadata while preserving
the existing Qwen values.

```json
{
  "schemaVersion": 2,
  "selectedProviderId": "qwen-local-default",
  "selectedVoiceId": "whale-v1",
  "providers": [
    {
      "instanceId": "qwen-local-default",
      "providerId": "qwen3-tts",
      "displayName": "Qwen3-TTS (local reference)",
      "kind": "LOCAL",
      "enabled": true,
      "transport": "http",
      "endpoint": "http://127.0.0.1:8765",
      "modelId": "qwen-local-primary",
      "credentialRef": null,
      "limits": { "timeoutMs": 120000 }
    }
  ],
  "models": [
    { "id": "qwen-local-primary", "providerInstanceId": "qwen-local-default", "model": "Qwen3-TTS-12Hz-1.7B-Base" }
  ],
  "voices": [
    {
      "id": "whale-v1",
      "providerInstanceId": "qwen-local-default",
      "displayName": "whale-v1",
      "kind": "legacy",
      "referenceAudio": null
    }
  ],
  "voicePacks": [],
  "compatibility": {
    "migratedFrom": 1,
    "requiresUserSelection": false,
    "notes": ["qwen-local legacy values preserved; no write or provider switch performed."]
  }
}
```

Rules:

- `providerId` is a catalog identity; `instanceId` is a configured instance.
- Model, voice and voice pack IDs are separate and provider-scoped.
- A voice may have `referenceAudio: null`; not every voice is cloned.
- `selectedVoiceId` must belong to the selected provider.
- Switching provider never silently reuses an incompatible voice.
- Multiple providers can be installed; exactly one may be selected.
- Qwen offline does not change another provider's status.
- Cloud/custom legacy values (no concrete adapter) migrate to `selectedProviderId: null` and
  `requiresUserSelection: true`; they are never guessed into Qwen.
- Migration preserves an **existing** Qwen legacy selection only: it emits `enabled: true` for that
  preserved instance description, does not start, probe or verify a provider, and does not make the
  provider selected or usable by itself. No provider becomes available merely because migration ran.

### Credentials and endpoints

- Store only a `credentialRef`; the secret itself belongs in a protected OS credential store
  (design review required before implementation).
- Never put a key in a URL, query string, frontend state, LocalStorage, logs or Git.
- Endpoint policy: cloud requires HTTPS; custom requires HTTPS or loopback HTTP; credentials,
  query strings and fragments are rejected.
- `publicTtsConfig()` exposes `endpointConfigured` and `credentialConfigured` booleans, never the
  raw endpoint, credential reference or key.
- A missing credential yields `CREDENTIALS_MISSING`; no request is attempted.

## 5. Migration and compatibility

`core/tts/provider-config.mjs` provides pure `migrateTtsConfig()` and `validateTtsConfig()`:

1. A v2 object is validated, not remigrated (idempotent).
2. A v1 `qwen-local` object preserves provider/model/voice/baseUrl as a Qwen instance.
3. A v1 `cloud`, `custom` or unknown provider is **not** mapped to Qwen; selection is deferred.
4. Unknown provider IDs, duplicate IDs, secret fields, unsafe URLs and provider/voice mismatches
   are rejected.
5. No file is read or written; production migration requires a separate write/rollback task.

The current `core/config-schema.mjs` v1 remains unchanged in TTS-A. The proposal is not wired into
the isolated store, Host routes or production files.

## 6. GUI plan

Keep the existing dark glass visual language and all current read-only/demo boundaries.

| Surface | TTS-B/C target |
|---|---|
| Overview | Show **selected provider**, current model/voice and per-provider status; demo metrics stay labelled |
| Voice Settings | Generic provider instance list/selection, endpoint/credential status, capabilities summary |
| Voice Studio | Voices filtered by selected provider capability; clone/streaming/emotion controls only when declared; no fake preview |
| Emotions | Show controls only if the selected provider declares emotion support; otherwise empty/unsupported state |
| Advanced | Provider contract/version/capabilities/health evidence; no secret or raw endpoint |
| Components | Distinguish selected provider from installed-but-unselected providers; show version, health and blockers |
| Setup wizard | Let users choose local/cloud/custom direction; cloud/custom credential fields remain disabled until Core credential storage exists |

No demo control becomes a production write control in this phase. No success state is shown for an
unimplemented provider.

## 7. Security invariants

- WeChatAgent remains the WeChat access/identity/authorization authority.
- Whale Voice Core owns TTS/SVC task coordination, provider management, the shared voice library and
  audio artifact management.
- Whale Relay Core（鲸递）owns safe delivery, the UI Automation adapter, optional future Native Hook,
  delivery status/dedup and target verification. It is a target component, not implemented here; the
  current Voice Sender UI Automation path is unchanged.
- Providers and SVC engines only produce audio artifacts; they never send WeChat and never write the
  target chat.
- Worker `NEVER_WRITE` remains independent.
- `UNKNOWN` is not retried automatically and is never displayed as success.
- Saved configuration is not runtime-applied evidence.
- Text is not uploaded to a cloud provider without explicit user knowledge/confirmation.
- No paid request is made without explicit authorization.
- Qwen need not be running to configure another provider.
- Provider/SVC manifests cannot contain credential values or delivery behavior.

## 8. TTS-B / TTS-C split

### TTS-B — Provider service and neutral configuration (next implementation step)

- Add a provider service that loads validated manifests and observations.
- Implement provider-aware status and capability projection; remove Qwen-only TTS gating.
- Add v2 migration and isolated tests; keep production write disabled.
- Add neutral read-only GUI provider/voice model; no real provider network calls.
- Update coordinator sources from `qwenRuntime` to per-provider observations.
- Keep the SVC contract/candidate registry separate; SVC inference remains unimplemented.

### TTS-C — Real adapters and secure credentials

- Implement one local adapter (Qwen reference or Piper/Kokoro after a separate audit).
- Implement one cloud adapter only after credential storage, text-upload consent, cost cap and
  retention review.
- Implement custom HTTP adapter with endpoint validation, auth references, request limits and
  response-format verification.
- Add real synthesis/preview tests with no production sends; then a separate Voice Sender/Relay
  integration acceptance.
- No provider or SVC engine sends WeChat; all audio goes through the shared pipeline and Relay
  (`PENDING_ROUTER`). Real SVC (Seed-VC/RVC) requires a separate model/license/consent review and is
  not part of TTS-C's ordinary TTS adapter scope.

## 9. Open questions

- Which local backend is the first non-Qwen implementation candidate after a license/model audit?
- Which cloud provider is acceptable for the first paid integration, and what is the cost cap?
- What OS credential store is supported across the target Windows versions?
- How are community voice packs signed/verified and how is voice-cloning consent enforced?
- What audio normalization is required before the existing Sender accepts provider output?
