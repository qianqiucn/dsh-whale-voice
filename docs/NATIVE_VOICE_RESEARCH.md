# Native Voice Delivery — Research Candidates（2026-11-04 refresh, 119 revision）

> **119 revision (2026-11-04):** license/admission wording corrected in place — PadChat-SDK’s
> `package.json` declares ISC (the external protocol service authorization stays UNKNOWN) and
> WeChatAgent’s root MIT does not cover the complete third-party Hook/client native path (gates 3/6
> for that path are UNKNOWN/not admitted). Capability conclusions are unchanged; see §3a and §7.

**Status:** documentation research only (`13-C / RESEARCH_CANDIDATE`). No third-party package, DLL,
Hook, service or WeChat client was downloaded, installed, executed or changed. No voice message was
sent and no production state was touched; the local machine environment was **not** re-probed.

This document records public, verifiable evidence only. An API name in a README is **not** proof that
the API works on the current Windows WeChat version, that it creates a native voice bubble, or that it
is licensed for Whale Voice.

**Observation method (2026-11-04, Europe/Amsterdam):** public first-party GitHub repository metadata
(`repos/<owner>/<repo>`), the default-branch `README.md` / `docs/index.md` / `LICENSE` /
`LICENSES.md` / `package.json` text, and the default-branch head commit. Only public text was read;
no repository archive, DLL, installer, Hook, SDK or WeChat client was downloaded or run. A previous
snapshot was taken on 2026-10-24; changes are listed in §3.

---

## 1. Status vocabulary

| Label | Meaning |
|---|---|
| `SUPPORTED` | An implementation path has been verified; does not imply the service is currently running |
| `UNSUPPORTED` | The reviewed implementation explicitly lacks the capability |
| `RESEARCH_CANDIDATE` | A plausible public interface exists, but version, license, coexistence, receipt or safety evidence is incomplete |
| `PROTOTYPE_READY` | Every prerequisite gate is satisfied; a separate authorized prototype may start |
| `INTEGRATED` | Real integration exists in Whale Voice |
| `VERIFIED` | Authorized end-to-end acceptance is complete |

Whale Voice delivery status (unchanged by this refresh):

| Backend | Status | Notes |
|---|---|---|
| `ui-automation` | **SUPPORTED** | Existing Voice Sender path; historical real native bubble observation; currently may be offline |
| `wechatagent-native` | **UNSUPPORTED** | WeChatAgent 0.4.2 outbound adapter still exposes only text/sticker; `record` is receive-side |
| `third-party-native` | **RESEARCH_CANDIDATE** | Public native-voice APIs exist in unrelated projects; none is integrated or verified |
| `auto` | **PLANNED / disabled** | Not implemented; automatic cross-backend fallback is forbidden after a possible send |

---

## 2. Pinned public objects (2026-11-04)

| Candidate | Repository | Default branch @ head | Head commit time | Repo metadata observed |
|---|---|---|---|---|
| A | https://github.com/mrsanshui/WeChatPYAPI | `master` @ `05060facb1ca87ba1cc088597e23c0163c7f1479` | 2026-10-27T12:38:53Z (`WeChatPYAPI V-9.2.1`) | 1,081 stars / 227 forks / 0 open issues; `pushed_at` 2026-10-27T12:39:41Z; **no LICENSE**; `version.txt` = `WeChatPYAPI V-9.2.1`; root has `专业版/` and `社区版/` (HTTP + Python interface dirs) |
| B | https://github.com/AvengersWeChat/PadChat-SDK | `master` @ `f1dd594233fbf11c2ffb8de3adea80c178edad21` | 2024-03-01T21:07:40Z (`Update README.md`) | 2,017 stars / 538 forks / 7 open issues; `pushed_at` 2024-06-13T13:13:02Z; **no separate LICENSE file**, but `package.json` v0.6.1 declares `"license": "ISC"` with a `binsee/padchat-sdk` source pointer; WebSocket SDK to a separate Windows iPad-protocol service |
| C | https://github.com/sourcepro5/WeChatAgent | `main` @ `38c1060ce500a294d69a4a2f9e07ca1b63a08b06` | 2026-11-01T03:53:33Z (`docs: add plugin package download paths to README`) | 2,230 stars / 39 forks / 32 open issues; `pushed_at` 2026-11-01T03:53:36Z; `package.json` version **0.4.2**; root `LICENSE` MIT + `LICENSES.md` third-party notices (`license.spdx_id` = `NOASSERTION`); `docs/WECHAT_HOOK.md` states the source copy excludes third-party Hook source/DLL/client and that the native path needs separately licensed source and a matching client build |

`license: null` from the GitHub API means GitHub found **no recognized LICENSE file**; it is not an implicit grant. A package-level `license` field is separate evidence and is recorded per candidate below.
The local installed WeChatAgent version and the local Windows WeChat version are **historical
snapshot facts only** (last recorded 0.3.9 / 4.1.10.27) and were **not re-measured** in this round;
both remain **UNKNOWN** for the current machine.

---

## 3. Changes vs the 2026-10-24 snapshot

| Item | 2026-10-24 snapshot | 2026-11-04 observation | Meaning |
|---|---|---|---|
| WeChatPYAPI last push | 2026-09-13 | 2026-10-27T12:39:41Z | Repository moved; version label now `V-9.2.1` (`version.txt`, head commit) |
| WeChatPYAPI stars/forks | 1,077 / 228 | 1,081 / 227 | Popularity drift only |
| WeChatPYAPI voice API | `send_voice(to_wx, path, voice_time)` | Same signature; `path` = SILK **absolute path**, `voice_time` in **milliseconds**, returns `True/False` | Interface unchanged |
| WeChatPYAPI version targets | Community 3.6.0.18 (unmaintained); Professional 4.1.12.26 | Unchanged in README; `start_wx` still documents `V-4.1.12.26` | Still no evidence for any other Windows WeChat version |
| WeChatPYAPI LICENSE | none | Still **none** in the repository root | Redistribution NOT granted |
| WeChatPYAPI security instruction | README asks to disable antivirus before cloning | Still present | Unacceptable for Whale Voice |
| PadChat-SDK code | last commit 2024-03-01; `pushed_at` 2024-06-13 | Unchanged (same commit / push timestamps) | No maintenance movement |
| PadChat-SDK stars/forks/issues | 2,007 / 535 / 7 | 2,017 / 538 / 7 | Popularity drift only |
| PadChat-SDK voice API | `sendVoice(toUserName, file, time)` | Unchanged: SILK only, `file` = **base64-encoded buffer** (docs: “文件buffer的base64编码”), `time` in **ms**, returns `Promise<object>` with `msgId`/`status:0` examples | Interface unchanged; not a Windows-client integration |
| PadChat-SDK license | none at repo root | Still **no separate LICENSE file**; `package.json` v0.6.1 declares **ISC** (`binsee/padchat-sdk` source pointer) | SDK package license declaration exists; the external iPad-protocol **service** authorization is still UNKNOWN |
| WeChatAgent public version | 0.4.0 | **0.4.2** | Upstream advanced two patch versions |
| WeChatAgent outbound methods | `sendText`, `sendSticker` | **Still only text/sticker** in `components/qq-bridge/src/adapters/wechat/wechat-onebot-adapter.js`; `record` appears only in the incoming filter | Still no outbound voice API |
| WeChatAgent SILK capability | not noted | `packages/voice-codec/silk-wasm` pinned to `idranme/silk-wasm` npm **3.7.1** (MIT), listed in `LICENSES.md` | SILK codec exists for **inbound decode / voice-input**, not for sending |
| WeChatAgent voice feature | none | Optional `speech-recognition-1.2.0` plugin (voice **input** transcription, `docs/VOICE_INPUT.md`) | Receive/transcribe only; still not outbound |
| WeChatAgent license | root MIT + third-party notices | Unchanged root MIT + expanded `LICENSES.md` (qq-bridge, weflow-cli, silk-wasm …); `docs/WECHAT_HOOK.md` states the copy excludes third-party Hook source/DLL/client and the native path requires separately licensed source plus a matching client build | Voice send still absent; root MIT covers the project’s own code only, not the complete native Hook/client path |

---

## 3a. 119 revision — license/admission correction (2026-11-04)

Two absolute statements in the 118 revision were wrong and are corrected here (the capability facts do
not change):

1. **PadChat-SDK is not “no license”.** Its `package.json` at `f1dd594…` is `padchat-sdk` **v0.6.1**,
   `"license": "ISC"`, author `binsee`, repository `git+https://github.com/binsee/padchat-sdk.git`.
   There is no separate LICENSE/notice file in the repository, and the **external iPad-protocol
   service** that the SDK talks to publishes no authorization terms. The SDK package declaration and
   the external service authorization are different facts and are scored separately.
2. **WeChatAgent root MIT is not a native-voice admission.** `docs/WECHAT_HOOK.md` at `38c1060…`
   states that the public source copy “不包含第三方 Hook 源码、DLL、微信程序或安装包”, that the native
   path needs separately authorized Hook source (`components/WeChat-Hook`) built against a matching
   Windows x64 WeChat client (the 4.1.10.27 path cites `aixed/WeChat-Hook` @ `e905d07…`), and that
   “引用、动态表情和音视频发送不在此 profile 的支持范围” for the newer 4.1.15.13 profile. The root MIT
   license covers the project’s own code; gates 3 and 6 for the **complete native path** therefore
   remain UNKNOWN / explicitly not admitted — the public tree not bundling the Hook is not evidence
   that no unverified component is required.

The 12-gate scores in §7 are updated accordingly (B gate 3 → UNKNOWN, C gates 3/6 → UNKNOWN).

---

## 4. Candidate A — WeChatPYAPI

- Repository: https://github.com/mrsanshui/WeChatPYAPI (`master` @ `05060fa…`, 2026-10-27).
- Public API text (`README.md`, `help(WeChatPYApi)` block):
  - `send_voice(self, to_wx, path, voice_time)` — “发送语音消息”; `path` = “silk文件的绝对路径”;
    `voice_time` = “语音时长，单位:毫秒”; return = “True:成功 False:失败”.
  - `start_wx(self, path=None)` — “目前支持微信版本：V-4.1.12.26”.
- Edition text: community edition WeChat `3.6.0.18`, “不再维护更新”; professional WeChat `4.1.12.26`.
- Distribution text: clone the project and **disable antivirus** before cloning; a Baidu-pan link is
  offered for the required WeChat installer. This instruction is **not followed** by Whale Voice.
- No repository LICENSE. Professional edition distribution/authorization terms are not published in
  the repository.
- Evidence gap: no public statement of compatibility with any Windows WeChat version other than
  3.6.0.18 / 4.1.12.26; no coexistence statement with WeChatAgent; no server `msgId`/receipt; no
  dryRun; no cancellation/recovery/UNKNOWN contract; no idempotency or single-delivery contract.
- Identity/target: `to_wx` accepts “微信ID/群ID”, but how the ID is verified against the logged-in
  account/session is not documented; group voice support is not separately documented.

**Classification: `RESEARCH_CANDIDATE` (fails admission gates 2, 3, 4, 6, 8, 11).**
The method name is real public documentation evidence, not proof of native voice delivery in this
environment.

---

## 5. Candidate B — PadChat-SDK

- Repository: https://github.com/AvengersWeChat/PadChat-SDK (`master` @ `f1dd594…`, 2024-03-01 last code commit).
- Architecture text (`README.md`): “通过websocket协议与运行在windows平台上的微信ipad协议服务程序通讯，
  来登陆与操作微信” — a separate Windows-service dependency, not a drop-in adapter for the installed
  WeChat process.
- Public API text (`docs/index.md`):
  - `padchat.sendVoice(toUserName, file, time) ⇒ Promise<object>` — “发送语音消息”;
    “只能发送silk格式的语音文件”; `toUserName` = target user/group id; `file` = base64 of the file
    buffer; `time` = “语音时间，单位为毫秒” (data-field table).
  - Example responses show `msgId` together with `status : 0`.
  - `getMsgVoice(rawMsgData)` returns base64 SILK; documented BUG: “超过60Kb的语音数据，只能拉取到60Kb，
    也就是说大约36~40秒以上的语音会丢失后边部分语音内容” (receive side).
- Login dependency text: `init` / `login` / `logout` / `getWxData` / `getLoginToken`; separate
  device/login data and a separate account session.
- The repository has **no separate LICENSE/notice file**, but `package.json` (v0.6.1) declares
  `"license": "ISC"` and points to `binsee/padchat-sdk` as the upstream source. That declaration
  covers the SDK package; it does **not** publish authorization for the separate Windows
  iPad-protocol service, and a README “free/open” tone is still not a grant for the service.
- Evidence gap: no current Windows-WeChat compatibility evidence; no coexistence with WeChatAgent; no
  proof that the returned `msgId` corresponds to a locally observed native voice bubble; no official
  `UNKNOWN`/cancel/recovery contract; the required protocol service’s availability and authorization
  are unverified.

**Classification: `RESEARCH_CANDIDATE` (fails admission gates 2, 3, 5, 6, 8, 11).**
A message ID is a possible server acknowledgement, not proof of a native bubble.

---

## 6. Candidate C — WeChatAgent upstream (0.4.2)

- Repository: https://github.com/sourcepro5/WeChatAgent (`main` @ `38c1060…`, 2026-11-01; version 0.4.2).
- Outbound adapter `components/qq-bridge/src/adapters/wechat/wechat-onebot-adapter.js`:
  `sendText(...)`, `sendSticker(...)`, and the private/group helpers call `sendText`. `record` appears
  only in the **incoming** message filter (`['text','image','file','record']` with a receive-side
  voice condition) — it is not an outbound send action.
- Public code search for `sendVoice` / `send_voice` in the repository returns **0** results.
- New since the snapshot: `packages/voice-codec/silk-wasm` (pinned npm `idranme/silk-wasm` 3.7.1, MIT)
  and the optional `speech-recognition-1.2.0` plugin / `docs/VOICE_INPUT.md` — these decode and
  transcribe **incoming** voice; they are not an outbound voice API.
- License: root `LICENSE` is MIT; `LICENSES.md` records qq-bridge (MIT), weflow-cli (MIT), silk-wasm
  (MIT). `docs/WECHAT_HOOK.md` at the same commit states that the public source copy “不包含第三方 Hook
  源码、DLL、微信程序或安装包”, that the native path requires separately authorized Hook source built
  against a matching Windows x64 client (4.1.10.27 path cites `aixed/WeChat-Hook` @ `e905d07…`), and
  that the newer 4.1.15.13 profile explicitly excludes “音视频发送”. GitHub reports
  `license.spdx_id = NOASSERTION`; the root MIT license covers this project’s own code, not the
  complete Hook/client path.
- Evidence gap: no voice send, no voice send contract, no voice receipt, no extension point for native
  voice. Incoming `record` support must not be read as outbound capability.

**Classification: `UNSUPPORTED` for native voice (gate 1 fails).**
Do not fork or monkey-patch it as the production route.

---

## 7. Admission-gate matrix (12 gates)

Legend: **PASS** = public evidence satisfies the gate; **FAIL** = public evidence contradicts it;
**UNKNOWN** = no sufficient public evidence (never treated as a pass).

| # | Admission gate | A WeChatPYAPI | B PadChat-SDK | C WeChatAgent |
|---|---|---|---|---|
| 1 | Real callable voice API identified | **PASS** (`send_voice`, README) | **PASS** (`sendVoice`, docs) | **FAIL** (text/sticker only) |
| 2 | Current or explicitly supported WeChat version verified | **FAIL** (3.6.0.18 / 4.1.12.26 only; current client unverified) | **FAIL/UNKNOWN** (no current Windows-client evidence; iPad-protocol service) | **UNKNOWN** (0.4.2 baseline; local runtime unmeasured) |
| 3 | License permits the intended use/distribution | **FAIL** (no LICENSE; professional terms absent) | **UNKNOWN** (`package.json` v0.6.1 declares **ISC** for the SDK; no separate LICENSE/notice file; the external iPad-protocol service publishes no authorization) | **UNKNOWN** (root MIT covers the project’s own code; the complete native path needs separately licensed third-party Hook source and a matching client build) |
| 4 | No system security feature must be disabled | **FAIL** (README asks to disable antivirus) | **UNKNOWN** (no such instruction; unverified service binary) | **PASS** |
| 5 | Coexistence with WeChatAgent proven or architecture documented | **FAIL/UNKNOWN** (no evidence; separate Hook/login likely) | **FAIL** (separate iPad-protocol login/service) | **PASS** (is the platform) |
| 6 | No unverified binary required | **FAIL** (DLL/service) | **FAIL** (external iPad-protocol service binary required; authorization unknown) | **UNKNOWN** (external Hook DLL + matching Windows x64 client build required; not bundled by the public tree and not verified) |
| 7 | Private and group target identity verifiable | **UNKNOWN** (`to_wx` accepts wxid/群ID; verification semantics undocumented) | **UNKNOWN** (`toUserName` accepts group id; provenance unverified) | **UNKNOWN** (no voice path) |
| 8 | Submission / receipt / `UNKNOWN` semantics documented | **FAIL** (boolean only) | **UNKNOWN/FAIL** (`msgId`+`status:0` examples; no bubble proof, no UNKNOWN/cancel contract) | **FAIL** (no voice send) |
| 9 | Isolated test environment possible | **UNKNOWN** (not attempted) | **UNKNOWN** (not attempted) | **UNKNOWN** (no voice path) |
| 10 | Existing Voice Sender remains intact | **PASS** | **PASS** | **PASS** |
| 11 | No uncontrolled duplicate-send path | **FAIL/UNKNOWN** (no idempotency evidence) | **UNKNOWN** (no dedupe contract) | **PASS** (n/a) |
| 12 | Account/platform risk assessed and disclosed | **PASS** (risk documented) | **PASS** (risk documented) | **PASS** |

**None is `PROTOTYPE_READY`.** No candidate passes gates 1–2–3–5–6–8–11 together. No prototype is
authorized; Native/auto remain unselectable/unsubmittable in Whale Voice.

---

## 8. Capability and semantics matrix (requested dimensions)

| Dimension | A WeChatPYAPI | B PadChat-SDK | C WeChatAgent |
|---|---|---|---|
| Callable interface | `send_voice(to_wx, path, voice_time)` | `sendVoice(toUserName, file, time)` | none (inbound `record` only) |
| Identity / group target | `to_wx` = wxid/群ID; no verification contract | `toUserName` = user/群ID (`@chatroom`); no verification contract | identity exists for text; no voice path |
| Windows WeChat compatibility | Community 3.6.0.18 / Professional 4.1.12.26 only | No current Windows-client mapping | Platform baseline (0.4.2 public) |
| WeChatAgent compatibility | No evidence; separate Hook risk | No evidence; separate login | Is the platform |
| Coexistence / login dependency | Separate DLL/Hook flow implied; not documented | Separate iPad-protocol service + login token | Existing WeChat session |
| SILK format / size / duration units | SILK absolute path; duration **ms**; size limit not documented | SILK base64; duration **ms**; inbound >60 KB (~36–40 s) truncation bug documented | SILK codec available for **inbound** decode (silk-wasm 3.7.1) |
| dryRun | Not documented | Not documented | n/a |
| Side-effect boundary | Not documented | Not documented | n/a |
| `ret=0` / boolean / HTTP 200 / `accepted_unconfirmed` | Returns `True/False`; acceptance ≠ bubble | `status:0` + `msgId` examples; acceptance ≠ bubble | n/a |
| `SENT_LOCAL` / trusted server receipt | Boolean only; no receipt | `msgId` only; no local-bubble proof | text/sticker database-confirmed only |
| Cancel / recovery / `UNKNOWN` / single-delivery single-entry | Not documented | Not documented | n/a |
| Source / license / redistribution | No LICENSE; professional terms absent | `package.json` declares ISC for the SDK (v0.6.1); no separate notice; external service authorization unknown | Root MIT + notices for its own code; `docs/WECHAT_HOOK.md` excludes third-party Hook/client and requires separate authorization |

A message ID, `True`, `status:0` or an HTTP 200 is **not** a native-bubble receipt. Whale Voice must
record a delivery grade, not collapse everything into `success`.

---

## 9. Unidentified items from the original plan

The original Plan 13-C text refers to “两位社区开发者”, `wechat_voice_say` and `wechat_sing`. A public
web search on 2026-11-04 did **not** identify a precise first-party repository, commit, release or
document for those names. They are recorded as:

- **`UNKNOWN / 缺少精确定位`** — not assigned to A/B/C, not assumed to be the same project, and not
  used to block the other candidates.
- One ambiguous public lead was observed during the search:
  `https://github.com/epsilonH-eps/dsh-tts-bridge-wechatagent-bridge` (MIT, `pushed_at`
  2026-10-29T19:20:23Z, public metadata only). It is recorded as an **unassessed lead**; no README,
  source, release or license text was read this round, it is not in the 12-gate matrix, and it is not
  a candidate or an admission decision.

The historical “two community developers” attribution cannot be verified from public first-party
evidence and must not be treated as established provenance.

---

## 10. Security, licensing and account risk

### WeChatPYAPI

- No repository LICENSE; redistribution of source or DLL is not granted by the public README.
- Professional distribution/authorization terms were not found in the public repository.
- README requires disabling antivirus; that is prohibited.
- DLL/injection/process-control risk is high and unverified; current WeChat version mismatch persists.

### PadChat-SDK

- No separate LICENSE file; `package.json` v0.6.1 declares **ISC** for the SDK package only. The
  separate iPad-protocol service publishes no authorization terms.
- Requires a separate proprietary iPad-protocol service and login channel.
- Old code (2024) and service availability are unverified.
- A separate account/session may conflict with WeChatAgent and platform terms.
- Message ID is not a local-bubble proof; inbound voice >60 KB is documented to truncate.

### WeChatAgent

- Root MIT plus separate third-party notices; the public source copy excludes third-party
  WeChat-Hook source/binaries/WeChat client and does not grant them. The complete native path depends
  on externally licensed Hook source and a matching client build, so its license gate is UNKNOWN, not
  a pass based on the root MIT.
- No outbound voice API; inbound SILK/transcription capability must not be re-labeled as send.

### Shared

- All third-party paths are unofficial WeChat automation and may violate platform terms.
- Account restriction/ban risk must be explained to the user before any test.
- Never weaken antivirus, Smart App Control, code signing, TLS or authentication for a candidate.
- Never bundle an unverified DLL or service into the Whale Voice repository/installer.

---

## 11. Decision

- Keep `ui-automation` as the supported production path; the merged Plan 13-B internal Sender remains
  the relay's offline delivery module (`OFFLINE / FIXTURE_ONLY / NOT_INTEGRATED`).
- Keep `wechatagent-native` `UNSUPPORTED` for 0.4.2 (outbound text/sticker only).
- Keep `third-party-native` as `RESEARCH_CANDIDATE`; no candidate is `PROTOTYPE_READY`.
- Do not integrate WeChatPYAPI or PadChat-SDK now; do not download/run their DLL/service/SDK.
- Keep Native/auto unselectable and unsubmittable; do not create a runner, production route, second
  retry path or new queue. No production/installation/WeChat change is authorized.
- The unified Whale Relay module, WeChatAgent independence, Artifact-only input, unique
  `taskId`/`deliveryId`, UNKNOWN no-resend, NEVER_WRITE and the Bridge/Worker two gates are unchanged.

---

## 12. Missing facts and permissions for a future minimal experiment (NOT executed)

Each would need its own explicit plan and owner authorization:

1. A supported-version statement (or isolated-VM evidence) matching the actual Windows WeChat client,
   including whether group voice is supported.
2. A written license/authorization for the exact binary/API and for redistribution, or a documented
   first-party extension contract that avoids bundling proprietary files.
3. Proof that no antivirus/security feature must be disabled.
4. A coexistence design with WeChatAgent (separate login vs shared session) and its account risk.
5. A receipt contract distinguishing accepted / `SENT_LOCAL` / trusted server receipt / `UNKNOWN`,
   plus cancel, recovery, duplicate-send and single-delivery single-entry semantics.
6. Evidence that the returned ID corresponds to a locally observed native voice bubble.
7. SANDBOX facts: dedicated test account, single allow-listed target, send limit, no production data.

Until then this research may be considered complete, but the runtime capability is **not admitted**.
