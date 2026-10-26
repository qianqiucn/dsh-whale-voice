# TTS Provider-Neutral Audit (TTS-A)

**Status:** design/audit complete, code not integrated, no real provider added.
**Baseline:** `main@bf9cf66807e12d0b25872a0fa3869962dde04818`.
**Scope:** audit of Qwen assumptions, provider contract design, schema/migration proposal and
GUI plan. No production configuration was read or written during this audit.

## 1. Product correction

Whale Voice is a multi-engine voice plugin for DeepSeek Harness, using WeChatAgent for WeChat
access. It is **not** a Qwen3-TTS-only plugin. Qwen3-TTS and `whale-v1` are the current developer
reference implementation and personal voice, not product defaults. Local, cloud and custom HTTP
providers must be selectable architecture candidates; none of the candidates in this phase is
implemented or enabled.

## 2. Three categories

| Category | Meaning | Action |
|---|---|---|
| **A. Qwen-specific** | Qwen `/health`, model/voice fields, Qwen service card, Qwen adapter diagnostics | May stay in a Qwen adapter, but must not define the global TTS contract |
| **B. Current Qwen selection** | Saved `qwen-local`, `whale-v1`, Qwen runtime values from the current production selection | Display as **current provider state**, never as the default for a new user or another provider |
| **C. Generic TTS** | Provider selection, voices, languages, preview, synthesis, status, retry, privacy, cost | Must become Provider-neutral |

## 3. Hardcode inventory

`file:line` refers to the TTS-A baseline. Priorities are implementation order, not current defects.

### A. Qwen-specific (keep in Qwen adapter)

| ID | Location | Current hardcode | Impact | Priority |
|---|---|---|---|---|
| A01 | `core/detect.mjs:19,78` | `DEFAULT_QWEN_URL = http://127.0.0.1:8765`; `qwenUrl` config/env | Global URL source assumes one provider | P1 |
| A02 | `core/detect.mjs:151-177` | `detectQwen()` uses `GET /health`, `provider: qwen-local`, Qwen service/model heuristics | Cannot probe a generic provider | P0 |
| A03 | `core/detect.mjs:195,203-237,280` | `qwen` is a fixed component; `detectAll` always calls it | Detection and status are Qwen-coupled | P0 |
| A04 | `core/capabilities.mjs:195-215,306` | `source: qwen`, `component: qwen`, `Qwen3-TTS` labels | Capability contract has a Qwen-only source | P1 |
| A05 | `core/capabilities.mjs:420-425,439` | TTS runtime is gated by `components.qwen` + sender | Qwen offline can make another provider look unavailable | P0 |
| A06 | `core/config-coordinator.mjs:146-159,179-183` | `ttsProvider` location `+ Qwen /health`; `qwenRuntime` source | Coordinator sources assume Qwen | P1 |
| A07 | `core/config-coordinator.mjs:203-207,604` | Sender TTS fields and Qwen dependency | Provider change is tied to Qwen runtime observation | P1 |
| A08 | `core/config.mjs:176-181` | Source row `qwen-health`, `%QWEN_URL%/health` | Read-only config source is Qwen-specific | P1 |
| A09 | `pages.js:13,195,265,611-671,797-808` | Qwen service icon/card, "Qwen 本地引擎", Qwen studio panel | UI presents Qwen as the engine model | P0 |
| A10 | `client.template.js:62-70,113-114,353` | Mock Qwen service, `qwen-local` provider metrics, sidefoot Qwen | Global shell hardcodes Qwen | P0 |
| A11 | `setup.js:270-298,403` | "本地 Qwen" provider card; "自动启动本地 TTS 服务" Qwen lifecycle | Wizard equates local TTS with Qwen | P1 |
| A12 | `README.md:2-8`; `package.json:description` | "Qwen3-TTS / whale-v1" product description | Product positioning is wrong | P0 |
| A13 | `docs/ARCHITECTURE.md`, `docs/CAPABILITY_API.md`, `docs/CONFIG_SOURCES.md`, `docs/SETUP_API.md` | Qwen-specific diagrams/contracts | Docs imply a single engine | P1 |

### B. Current Qwen selection (display as real current state)

| ID | Location | Current behavior | Required behavior | Priority |
|---|---|---|---|---|
| B01 | `core/config.mjs:283-299` | Reads `sender-service.tts.provider/model/voiceId/baseUrl`; runtime from Qwen | Preserve the saved current provider and display it as **selected**, not as default | P0 |
| B02 | `core/config.mjs:218-219,307` | `defaultVoice` falls back to `serviceTts.voiceId` | Current selection may be shown; a provider switch must not silently reuse an incompatible voice | P0 |
| B03 | `core/detect.mjs:225-235` | `savedProvider`, `savedVoice`, Qwen runtime | Separate saved provider, runtime observation and active/apply evidence | P0 |
| B04 | `pages.js:204,234-243,630-643` | Hero/studio show `whale-v1` and Qwen model as if fixed | Label as current personal voice/current selected provider; not a product default | P0 |
| B05 | `client.template.js:16,51,453` | Studio hint/default preview voice `whale-v1` | Any default voice must come from the selected provider, or be unset | P1 |
| B06 | `core/view.mjs:97,152-162` | TTS component `detail: tts.provider` and "TTS Provider" row | Rename/derive as selected provider; include provider instance ID/model/voice ID separately | P1 |

### C. Generic TTS that must become Provider-neutral

| ID | Location | Current hardcode | Impact | Priority |
|---|---|---|---|---|
| C01 | `core/config-schema.mjs:30-41` | `TTS_KEYS = provider,model,voice,baseUrl`; `PROVIDERS = qwen-local,cloud,custom` | No provider instance, model, voice pack, credential reference or capability separation | P0 |
| C02 | `core/config-schema.mjs:170-190` | `tts.provider` and `tts.voice` required; `baseUrl` optional but `configured` later requires it | Cloud providers that do not use a base URL cannot be represented; voice is assumed to exist | P0 |
| C03 | `core/config.mjs:285-286,323-324` | `configured = provider && voice && baseUrl` | Incorrect for cloud/custom; base URL is not a universal requirement | P0 |
| C04 | `core/config.mjs:283-299` | Single `tts` object | Cannot represent multiple provider instances or a catalog of voices | P0 |
| C05 | `core/view.mjs:71,97,113` | TTS configured = one boolean; TTS component one row | No provider-specific capability or "installed but not selected" state | P1 |
| C06 | `core/capabilities.mjs:106-120` | Sender TTS surface has only a generic save/authorization shape | No provider/voice/language/emotion capability facts | P1 |
| C07 | `core/config-coordinator.mjs:146-159` | One `ttsProvider` source with multi-file + Qwen observation | A provider registry may contain many instances; selection and application differ | P1 |
| C08 | `pages.js:65,149,317-349` | TTS Provider row, fixed 7 groups, `whale-v1` voice select, Qwen timeout text | Generic provider/voice controls are not neutral | P1 |
| C09 | `pages.js:611-671` | Studio profile and preview hardcode `Qwen3-TTS 1.7B Base`, `whale-v1`, clone-by-reference and emotion select | Voice/clone/emotion must follow provider capabilities | P0 |
| C10 | `pages.js:680` | Emotions page assumes Qwen Base does not guarantee emotion control | Emotion controls should appear only when the selected provider declares a supported mode | P1 |
| C11 | `setup.js:65,270-298` | `available: ['qwen-local','cloud','custom']`; cloud/custom `soon`; local named Qwen | Wizard must list actual provider candidates/capabilities, not a Qwen label | P1 |
| C12 | `client.template.js:51` | `default_voice: 'whale-v1'` in frontend defaults | New users must not inherit the developer's voice | P0 |
| C13 | `client.template.js:62-70` | Mock service list only Qwen/Sender/WeChatAgent | No Provider-neutral mock shape | P1 |
| C14 | `README.md:2-4`; `package.json:description` | Qwen/whale-v1 as product identity | Product identity must be multi-engine; reference implementation noted separately | P0 |
| C15 | `test/config.test.mjs`, `test/view.test.mjs`, `test/capability.test.mjs` | Fixtures assume `qwen-local`, `whale-v1`, model/voice health | Need provider-neutral fixtures and migration compatibility tests | P1 |

## 4. Priority plan

### P0 — remove global Qwen dependency

1. Introduce the provider contract/registry in `core/tts/` (TTS-A design only; no Host route).
2. Make TTS availability derive from the **selected provider's** observation, not from Qwen.
3. Add provider instance/model/voice/voice-pack identity to the future config schema.
4. Remove `whale-v1` as a frontend or new-install default; preserve it only as the current saved
   value and as a personal voice.
5. Rename product/package/UI copy from "Qwen3-TTS plugin" to "multi-engine voice plugin with Qwen
   as a reference implementation".

### P1 — migration and adapter boundary

1. Implement v2 migration for existing `qwen-local` data; cloud/custom legacy values require
   explicit provider selection and must not be guessed.
2. Add provider health/capabilities adapters and per-provider observations.
3. Separate provider instance, model, voice and voice pack; support voices without reference audio.
4. Add credential references, endpoint validation and text-upload/privacy declarations.
5. Update coordinator sources from `qwenRuntime` to provider-specific observations.

### P2 — GUI and future engines

1. Provider-neutral Overview/Settings/Studio/Emotions/Advanced/Components/Wizard.
2. Add real local/cloud/custom adapters behind separate implementation reviews.
3. Add provider-specific preview, streaming, clone and emotion controls when verified.
4. Add community voice-pack import/share as a separate supply-chain task.

## 5. Compatibility risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Existing production `qwen-local` config | Users already have provider/model/voice/baseUrl in Sender service config | Preserve as a v2 Qwen instance; migration is pure in TTS-A, no write |
| Old schema v1 | Current isolated config store accepts only v1 | Add v2 only after migration tests; do not change production schema in this phase |
| `whale-v1` personal voice | It may not exist for other users or providers | Treat as current personal voice; new users get no default voice until selection |
| Qwen offline | Cloud/custom providers are independent | Never gate all TTS on Qwen; status is per provider |
| Provider switch | Voice IDs are provider-specific | Reject incompatible voice with explicit error; no fallback |
| Cloud credentials | Keys can leak into config/URL/logs/frontend | Credential reference only; protected OS storage design; no key in URL/query/log |
| Text upload/cost | Cloud synthesis sends text and may charge | Explicit privacy/cost declaration and user confirmation before any request |
| API heterogeneity | Not all APIs share one protocol | Adapter per provider; no "OpenAI-compatible" assumption |
| Provider/version drift | Capabilities may change | Versioned manifest, `UNKNOWN` version state, no audited claim without evidence |
| Retry/duplicate | Some providers are non-idempotent | Retry only declared safe/idempotent; UNKNOWN never auto-retried |
| Provider sends WeChat | Violates delivery boundary | Provider result is `PENDING_ROUTER`; shared audio pipeline/delivery router owns sending |

## 6. Non-goals of TTS-A

- No real provider installation, network request, credential entry, audio generation or preview.
- No production config change, no Host route, no write control, no provider switch.
- No removal of Qwen code in this phase; the audit identifies exact adapter boundaries for TTS-B.
- No claim that Piper, Kokoro, sherpa-onnx, Azure, ElevenLabs or custom HTTP is implemented.

## 7. Audit conclusion

The current repository has a **real Qwen reference path** and already has useful neutral UI
scaffolding (local/cloud/custom cards, disabled credential fields, provider labels). It is not yet
Provider-neutral because status, config schema, default voice, detection and TTS capability
gating all assume `qwen-local` or Qwen runtime. TTS-A delivers the contract, registry, migration
proposal and tests; TTS-B must implement the provider service and neutral configuration; TTS-C
may connect real local/cloud/custom adapters with separate security review.

## 8. TTS-A-H supplements

- The TTS candidate matrix now also includes **IndexTTS** (LOCAL), **Google Gemini TTS** (CLOUD) and
  **OpenAI Speech API** (CLOUD). All remain `NOT_IMPLEMENTED`, unselectable, with no default voice,
  endpoint, credential or claimed model capability.
- **SVC is a separate task type**, not a TTS provider: Seed-VC and RVC are candidates in
  `core/svc/svc-registry.mjs` and are absent from the TTS registry. TTS input is text; SVC input is
  existing speech/singing audio. Both share the voice library, audio pipeline and task system.
- The target three layers are **Whale Voice Core** (orchestration/provider/voice library/artifacts),
  **Whale Relay Core（鲸递）** (safe delivery/UI Automation/Native Hook candidates/dedup/target
  verification) and **WeChatAgent** (WeChat access/identity/authorization). Relay Core is not
  implemented in this phase; no Provider or SVC engine may send WeChat directly.
