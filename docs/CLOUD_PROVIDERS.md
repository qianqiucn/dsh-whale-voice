# Cloud and Custom TTS Providers (Plan 11, offline unit)

**Status:** `OFFLINE` / `FIXTURE_ONLY` / `NOT_INTEGRATED` (2026-11-03).
This unit implements the first cloud/custom provider contracts and a real, injectable HTTP path,
but it does **not** create a production Host route, accept a real API key in the UI, make a real
vendor request, or claim a working cloud voice. Real accounts, prices, retention terms, network
execution and Host integration require a later, separate authorization.

Related: [TTS Provider Architecture](TTS_PROVIDER_ARCHITECTURE.md),
[ADR-021](DECISIONS.md), [README](../README.md).

## 1. Scope

| Item | This unit |
|---|---|
| Windows credential store | Implemented as an application-owned DPAPI CurrentUser namespace; non-Windows is explicitly unavailable |
| Azure Speech | One narrow synchronous REST adapter: preset zh-CN/en-US neural voices, plain text only, 24 kHz/16-bit/mono WAV |
| Custom HTTP | One fixed versioned JSON → WAV protocol, HTTPS or numeric-loopback HTTP, no redirects, bounded response |
| Neutral interface | Same health/synthesize/capabilities/manifest/public projection for both adapters |
| Task/Artifact/delivery | Not created by the provider; a successful fixture result is `persisted:false` and `PENDING_ROUTER` |
| Real network/API | Off by default; tests use injected transports or a local loopback fixture |
| Browser | Never calls a vendor directly; no real credential input or Host write route in this unit |
| Other clouds | ElevenLabs / Gemini / OpenAI remain `PLANNED`; the candidate registry is unchanged |

## 2. Four gates before any request

A cloud/custom synthesis is attempted only when **all** of these are true:

1. **Trusted configuration** — the endpoint/target comes from Core configuration, never from chat,
   the browser request, a provider response or a redirect.
2. **Explicit text-upload consent** — `consent.textUpload === true` and, when present,
   `consent.providerId` matches the adapter. This is separate from enabling the network.
3. **Credential present** — the credentialRef resolves through the application-owned store; a
   missing/corrupt credential never falls back to plaintext or an environment variable.
4. **Known cost mode/bound** — Azure is paid; an unknown unit price fails closed. A
   character-based upper bound is reserved in a durable ledger before the request. A custom service
   must be explicitly `free` (with confirmation and a free ledger for call/dedup limits), explicitly
   `paid` (known price and hard budget), or `unknown` — and `unknown` makes **zero** requests. It is
   never silently treated as free.

In addition, the adapter's own **network gate** defaults to disabled. `NETWORK_DISABLED` is a
normal state, not an error to be retried silently.

## 3. Credential storage

`core/tts/cloud-credentials.mjs` implements one namespace below a trusted application root:

```text
<root>/whale-voice-credentials-v1/credential-<sha256(ref)>.json
```

- Only a JSON envelope with `schemaVersion`, `ref`, `algorithm: dpapi-current-user`, base64
  ciphertext, `createdAt` and `updatedAt` is stored.
- The plaintext is protected with Windows DPAPI **CurrentUser**. The helper is invoked with the
  value on **stdin**, never in command arguments or logs. Tests use synthetic values only.
- Write is temp-file + fsync + single rename + read-back/ACL attempt. A failed write leaves the old
  envelope intact; a corrupt envelope fails closed and is never auto-repaired.
- The store only touches exact ref-derived files. It does not enumerate a directory, scan another
  application's credentials or read environment/token files.
- Non-Windows, or a missing protector, returns `CREDENTIAL_UNAVAILABLE`. There is no plaintext
  fallback.
- DPAPI CurrentUser protects against other Windows users, **not** against every process running as
  the same user. It is not portable across accounts or machines.

## 4. Cost ledger

`core/tts/cloud-cost.mjs` is a small atomic JSON ledger:

- The integer price is `unitPriceMicrosPerCharacter` in a configured currency; there is no float
  money and no default price. A `free` mode uses price 0 and still keeps a durable call/character
  limit and request dedup.
- One ledger file is the authority. Every operation re-reads it under an in-process queue plus a
  bounded file lock, so two handles on the same root cannot spend the same budget or overwrite each
  other. `reserve` computes `charCount × price`, checks `spent + unknown + pending + new <= limit`,
  and persists a `PENDING` reservation **before** the request.
- A same-requestId `PENDING` duplicate is refused, not allowed into transport a second time. A
  success commits the actual amount; a failure before the request releases it; a timeout, broken
  connection or any post-send uncertainty becomes `UNKNOWN` and keeps the reserved amount (never a
  free retry).
- A restart converts any leftover `PENDING` reservation to `UNKNOWN`. Completed/UNKNOWN requestIds
  stay deduplicated; at the bounded capacity (`maxCalls`) the ledger fails closed
  (`CALL_LIMIT_EXCEEDED`/`DEDUP_CAPACITY`) instead of truncating old records and reusing an UNKNOWN id.
- A corrupt ledger, changed mode/price/limit or unknown price fails closed instead of resetting the
  budget.

## 5. Azure Speech adapter

`core/tts/azure-speech-contract.mjs` + `azure-speech-adapter.mjs`.

### 5.1 Fixed objects

- Region: a fixed allowlist of common Speech regions; the endpoint is
  `https://<region>.tts.speech.microsoft.com/cognitiveservices/v1`.
- Voices: preset-only `zh-CN-XiaoxiaoNeural`, `zh-CN-YunxiNeural`, `zh-CN-XiaoyiNeural`,
  `zh-CN-YunjianNeural`, `en-US-JennyNeural`, `en-US-GuyNeural`.
- Languages: `zh-CN`, `en-US`.
- Output: `riff-24khz-16bit-mono-pcm`; the adapter re-inspects the returned bytes as 24 kHz /
  16-bit / mono PCM16.
- Not supported: clone, custom voice, arbitrary SSML, streaming, batch, avatar, real-time
  conversation or paid downgrade.

### 5.2 Request shape

Plain text is XML-escaped and inserted into exactly one `<speak>` / `<voice>` shape. The caller
cannot supply SSML. The credential is placed only in the required
`Ocp-Apim-Subscription-Key` header; no token exchange, account probe, query string or URL secret is
used. `Content-Type: application/ssml+xml` and the fixed output-format header are set by the
adapter.

### 5.3 Health

The health states are deliberately separate:

| State | Meaning |
|---|---|
| `NOT_CONFIGURED` | No region or credentialRef |
| `CREDENTIALS_MISSING` | The ref does not resolve |
| `NETWORK_DISABLED` | Configured, but the network gate is off |
| `CONFIGURED_UNVERIFIED` | Configuration is complete; no live request has verified the account |
| `AVAILABLE` | Only after a real live request succeeded |
| `DEGRADED` / `UNAVAILABLE` | A recorded live failure or unavailable state |
| `UNKNOWN` | No positive evidence |

A successful **injected/Fake** response never sets `AVAILABLE`; it is labelled
`INJECTED_TEST` internally. Offline success cannot be shown as ONLINE.

### 5.4 Official basis

- REST TTS: <https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech>
- Voices/languages: <https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts>
- Data privacy: <https://learn.microsoft.com/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security?view=foundry-classic>
- Pricing: <https://azure.microsoft.com/pricing/details/speech/>
- Product terms: <https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA>

The official statement that preset neural text/audio is not logged is recorded for Azure only. It
does not transfer to a custom service. Exact prices, account quota, commercial terms and the user's
right to use the service are **UNKNOWN** at this stage.

## 6. Custom HTTP protocol

`core/tts/custom-http-contract.mjs` + `custom-http-adapter.mjs`.

### 6.1 Request

`POST` to the trusted target, `Content-Type: application/json`, `Accept: audio/wav`:

```json
{
  "protocol": "whale-voice-custom-tts",
  "version": 1,
  "requestId": "custom-request-001",
  "text": "你好，自定义服务。",
  "voiceId": "custom-default",
  "language": "zh-CN",
  "format": "wav"
}
```

Only `custom-default` (zh-CN/en-US) is declared in this unit. There is no template language,
script, URL downloader, arbitrary header name or clone/emotion/streaming field.

### 6.2 Target policy

- `https:` for a public host; `http:` only for the explicit numeric loopback `127.0.0.1` or
  `[::1]`. `localhost` and public HTTP are rejected.
- No userinfo, query or fragment. No redirect is followed; `3xx` is `REDIRECT_REJECTED`.
- Every DNS answer must be public. Private, loopback, link-local, metadata, reserved, mixed and
  IPv4-mapped IPv6 addresses are rejected.
- The validated address is pinned into the connection lookup, so a second DNS resolution cannot
  rebind the socket. TLS verification is never disabled and `servername` remains the configured
  host.
- Response starts with `audio/wav`/`audio/x-wav`; the body is streamed under an immediate byte cap
  and total timeout, then re-inspected as 24 kHz mono PCM16 WAV.

### 6.3 Cost modes

- `unknown` (default): zero request; the projection says “费用未知，禁止请求”.
- `free`: only with explicit `freeConfirmed:true` and a free ledger; still subject to the text
  limit, call limit and persistent request dedup.
- `paid`: needs an explicit integer price and hard budget; uses the same durable ledger authority
  as Azure (no second billing/dedup truth). A missing price or exhausted budget makes zero request.

The old “FREE_OR_UNKNOWN” fallback is removed; unknown cost is never displayed or executed as free.

### 6.4 Authentication and retention

- Auth modes are only `none`, `bearer` (`Authorization: Bearer …`) or `x-api-key`
  (`X-API-Key: …`). The secret comes from a credentialRef resolved by Core.
- The custom service's retention, logging and training policy is **UNKNOWN**. It must not inherit
  the Azure retention statement; the UI shows that explicitly.

## 7. Neutral result and Chinese projection

`core/tts/cloud-provider-pipeline.mjs` composes the two adapters:

- `runCloudSynthesisFixture()` calls the real adapter path, requires `persisted:false`, a valid WAV
  inspection and `delivery.state === 'PENDING_ROUTER'`, and returns a neutral result. It creates no
  Task, Artifact, database row or delivery.
- `cloudProviderPublicView()` and `cloudProviderComparison()` produce Chinese gates/status labels
  and strip credential-like keys. Public projections contain no endpoint host/path, credentialRef,
  API key or request text.
- Both adapters expose `{ health, synthesize, capabilities, manifest, publicProjection, metadata }`.
  The old design-only candidate registry remains unchanged; selection/Host wiring is out of scope.

## 8. Errors and limits

| Area | Examples |
|---|---|
| Gates | `NETWORK_DISABLED`, `TEXT_UPLOAD_NOT_CONFIRMED`, `CREDENTIALS_MISSING`, `COST_UNKNOWN`, `COST_QUOTA_EXCEEDED`, `COST_DUPLICATE_REQUEST`, `COST_CALL_LIMIT_EXCEEDED`, `COST_DEDUP_CAPACITY` |
| Target/security | `TARGET_PRIVATE`, `TARGET_LOOPBACK_ONLY`, `TARGET_CREDENTIALS`, `TARGET_DNS_FAILED`, `REDIRECT_REJECTED`, `HEADER_LIMIT` |
| Transport | `TIMEOUT`, `CANCELLED`, `NETWORK_ERROR`, `RESPONSE_TOO_LARGE`, `CONTENT_TYPE` |
| Provider | `AUTH_FAILED` (401/403), `RATE_LIMITED` (429), `PROVIDER_ERROR` (5xx), `INVALID_AUDIO` |
| Text/audio | max 2,000 characters per request, 600 s audio, 8 MiB response, 16 KiB headers, 30 s timeout (defaults) |

Non-success response bodies are not passed through. Error objects and public projections never
contain the key, credentialRef, endpoint or request text. `UNKNOWN`/`CANCELLED` are terminal for
automatic retry; no provider auto-switch or paid downgrade exists.

Cancellation is checked before request construction and after credential/DNS/cost awaits. A
pre-cancel creates zero outbound requests and installs no request object. The request error listener
is installed before any destroy, so a cancel race cannot surface as an unhandled `ECONNRESET`. A
non-2xx response is finished and destroyed immediately instead of draining an unbounded error body.
A cancel during Azure/custom cost commit does not return success audio; the sent charge is
committed or kept as `UNKNOWN`, never released as if unsent.

## 9. Tests and evidence

New tests (all offline / synthetic):

- Credential ciphertext roundtrip, corruption/write-failure old-value preservation, non-Windows
  unavailable, invalid refs and a real Windows DPAPI temp-fixture roundtrip.
- Cost reserve/commit, duplicate, unknown price/limit, concurrent quota, restart UNKNOWN, corrupt
  ledger, changed config, two handles on one root, full dedup capacity and explicit-free call limits.
- Same-requestId concurrency/restart for Azure and custom; pre-cancel, credential/DNS-await cancel,
  commit-during-cancel, non-2xx infinite-stream destruction, request-listener-before-destroy.
- Public address policy, DNS pinning, mixed/private/loopback rejection, redirect/content-type/header/
  body/timeout/abort/broken-stream behaviour, plus a real loopback HTTP fixture.
- SSML escaping; Azure gates, 401/403/429/5xx, timeout, cancel, bad WAV, oversize, duplicate and
  secret-free projections.
- Custom fixed JSON protocol, explicit unknown/free/paid cost modes, auth headers, unsupported
  modalities, caller target rejection, error mapping, real loopback success/redirect and secret-free
  projections.
- Neutral fixture results for both adapters; no Task/Artifact/delivery is created.

Local result at this unit: **49 Plan11 tests** (all offline/synthetic), full suite **1059 / 1055 pass /
4 platform skips / 0 fail**, UI **63/63**, `node build.mjs` unchanged. These are offline/injected
evidence; no real Azure/custom API was called.

## 10. Not implemented / next authorization

- No real Azure account, key, region validation, price/quota or live request.
- No production Host route, credential input UI, network enable UI or running-plugin configuration
  change.
- No custom service deployment, retention agreement, auth server or real WAV quality validation.
- No Task/Artifact/delivery integration; no WeChat or Voice Sender path.
- Real network execution, paid calls, production integration and any `INTEGRATED`/`VERIFIED`
  claim require a later explicit authorization and a real environment.
