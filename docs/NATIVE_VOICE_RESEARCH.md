# Native Voice Delivery — Research Candidates

**Status:** documentation research only. No third-party package, DLL, Hook, service or WeChat client
was installed or changed. No voice message was sent and no production state was touched.

This document records public, verifiable evidence only. An API name in a README is **not** proof that
the API works on the current Windows WeChat version, that it creates a native voice bubble, or that it
is licensed for Whale Voice.

---

## 1. Status vocabulary

| Label | Meaning |
|---|---|
| `SUPPORTED` | An implementation path has been verified; does not imply the service is currently running |
| `UNSUPPORTED` | The reviewed implementation explicitly lacks the capability |
| `RESEARCH_CANDIDATE` | There is a plausible public interface, but version, license, coexistence, receipt or safety evidence is incomplete |
| `PROTOTYPE_READY` | Every prerequisite gate is satisfied; a separate authorized prototype may start |
| `INTEGRATED` | Real integration exists in Whale Voice |
| `VERIFIED` | Authorized end-to-end acceptance is complete |

Current Whale Voice delivery status:

| Backend | Status | Notes |
|---|---|---|
| `ui-automation` | **SUPPORTED** | Existing Voice Sender path; historical real native bubble observation; currently may be offline |
| `wechatagent-native` | **UNSUPPORTED** | WeChatAgent 0.3.9 and public 0.4.0 expose no voice send; only text/sticker outbound |
| `third-party-native` | **RESEARCH_CANDIDATE** | Public native-voice APIs exist in unrelated projects; none is integrated or verified |
| `auto` | **PLANNED** | Not implemented; automatic cross-backend fallback is forbidden after a possible send |

---

## 2. Candidate A — WeChatPYAPI

- Repository: https://github.com/mrsanshui/WeChatPYAPI
- Public README: `send_voice(to_wx, path, voice_time)`
- API description: path is a **SILK** file; duration is milliseconds; returns `True`/`False`
- Public repo metadata observed on 2026-10-24:
  - 1,077 stars, 228 forks, 0 open issues
  - last push `2026-09-13`
  - no repository LICENSE file detected
- README version statement:
  - Community edition: Windows WeChat `3.6.0.18`; no long-running support; explicitly no longer maintained
  - Professional edition: Windows WeChat `4.1.12.26`; continued updates
- Current Whale Voice/WeChat environment: **4.1.10.27**
- README also instructs users to close antivirus software before cloning; this is **not acceptable**
  for Whale Voice and was not followed.
- No public evidence found for:
  - compatibility with 4.1.10.27;
  - coexistence with WeChatAgent's Hook/login;
  - a server message ID or native-bubble receipt (`send_voice` returns only boolean);
  - redistribution permission for the professional binary/DLL;
  - a supported extension contract that Whale Voice may call without bundling proprietary files.

**Classification: `RESEARCH_CANDIDATE`.**
The method name is real public documentation evidence, not proof of native voice delivery in this
environment. The version mismatch, missing license, DLL/service dependency, antivirus instruction and
missing receipt semantics prevent `PROTOTYPE_READY`.

---

## 3. Candidate B — PadChat-SDK

- Repository: https://github.com/AvengersWeChat/PadChat-SDK
- Public documentation: `sendVoice(toUserName, file, time)`
- API description:
  - file is **SILK** data as a Buffer or base64;
  - time is milliseconds;
  - returns an object shaped like `{ success, err, msg, data: { msgId, ... } }`;
  - documentation shows a `msgId` example.
- Public repo metadata observed on 2026-10-24:
  - 2,007 stars, 535 forks, 7 open issues
  - last push `2024-06-13` (stale relative to current WeChat versions)
  - no repository LICENSE file detected
- The SDK communicates over WebSocket with a separate Windows **iPad protocol service**; it is not a
  drop-in adapter for the installed Windows WeChat process.
- The documentation describes separate login initialization (`init`, `login`, `wxData`, `token`) and
  device/account binding. It has **no evidence** of using the existing WeChatAgent login, Hook or
  Windows WeChat session.
- No public evidence found for:
  - current Windows WeChat 4.1.10.27 compatibility;
  - coexistence with WeChatAgent;
  - availability or authorization of the required protocol service;
  - a license permitting redistribution or commercial integration;
  - proof that the returned `msgId` corresponds to a locally observed native voice bubble.

**Classification: `RESEARCH_CANDIDATE`.**
The historical interface is real, but it is an old, separate iPad-protocol service dependency. A
message ID is a possible server acknowledgement, not proof of a native bubble. It is not a current
Windows-WeChat integration path.

---

## 4. Candidate C — WeChatAgent upstream

- Repository: https://github.com/sourcepro5/WeChatAgent
- Installed local version: `0.3.9`
- Public upstream observed: `0.4.0` README
- Upstream 0.4.0 still describes text/native-sticker sending, not voice sending.
- Public `wechat-onebot-adapter.js` outbound methods:
  - `sendText()`
  - `sendSticker()`
- Incoming support includes text/image/file in 0.4.0. That is **receive-side** capability, not an
  outbound voice API.
- No `sendVoice`, `SendVoice`, `send_record`, `record` send action or audio-format contract was found.
- License: root MIT plus separate third-party notices; the native Hook/DLL components have separate
  authorization and are not covered by the root MIT text.
- No official maintainer confirmation of a native voice extension point was found.

**Classification: `UNSUPPORTED` for native voice.**
The adapter architecture is extensible in principle, but no published extension contract or
implementation exists. Do not fork or monkey-patch it as the production route.

---

## 5. Compatibility comparison

| Item | Current Whale Voice environment | WeChatPYAPI | PadChat-SDK | WeChatAgent |
|---|---|---|---|---|
| Windows WeChat | **4.1.10.27** | Professional 4.1.12.26; community 3.6.0.18 | No current Windows version evidence | 4.1.10.27 baseline |
| Native voice API | none | `send_voice` (SILK, bool) | `sendVoice` (SILK, msgId) | none |
| Message receipt | UI bubble observation | boolean only | `msgId` in response | text/sticker server ID only |
| Separate login | no | likely Python/DLL/service | **yes**, iPad-protocol login | existing WeChat session |
| Public license | MIT repo plus third-party notices | **no LICENSE found** | **no LICENSE found** | MIT plus third-party terms |
| Current maintenance | active | last public push 2026-09-13; community unmaintained | last push 2024-06-13; stale | active |
| Coexistence evidence | n/a | none | none; separate session | is current platform |

The versions do not line up. A public method name cannot be treated as compatibility evidence.

---

## 6. Audio and receipt requirements

Any candidate native path would need:

```text
TTS WAV -> audio validation -> SILK encode -> backend -> WeChat
```

Required checks:

- SILK profile, sample rate, duration and file limits;
- whether the backend expects a file path, Buffer or base64;
- duration units and rounding;
- target identity: private wxid vs group id;
- whether group voice is supported;
- request acceptance vs server receipt vs local bubble observation;
- timeout/`UNKNOWN` behavior;
- cancellation before/after submission.

SILK encoding success is not send success. HTTP 200, `true`, or a message ID is not automatically a
native voice bubble. Whale Voice must record a delivery grade, not collapse everything into `success`.

---

## 7. Security, licensing and account risk

### WeChatPYAPI

- No repository LICENSE; redistribution of source or DLL is not granted by the public README.
- Professional edition distribution/authorization terms were not found in the public repository.
- README requires disabling antivirus; that is prohibited.
- DLL/injection/process-control risk is high and unverified.
- Current WeChat version mismatch.

### PadChat-SDK

- No repository LICENSE; "free" in a README is not a license grant.
- Requires a separate proprietary iPad-protocol service and login channel.
- Old code and service availability are unverified.
- A separate account/session may conflict with WeChatAgent and platform terms.
- Message ID is not a local bubble proof.

### Shared risks

- All are unofficial WeChat automation and may violate platform terms.
- Account restriction/ban risk must be explained to the user before any test.
- Never weaken antivirus, Smart App Control, code signing, TLS or authentication to make a candidate
  work.
- Never bundle an unverified DLL or service into the Whale Voice repository/installer.

---

## 8. Admission gates

A candidate may move from `RESEARCH_CANDIDATE` to `PROTOTYPE_READY` only when **all** are true:

1. A real callable voice API is identified.
2. A current or explicitly supported WeChat version is verified.
3. The license permits the intended use and distribution model.
4. No system security feature must be disabled.
5. Coexistence with WeChatAgent is proven, or an acceptable architecture is documented.
6. No unverified binary is required.
7. Private and group target identity can be verified.
8. Submission, receipt and `UNKNOWN` semantics are documented.
9. An isolated test environment is possible.
10. The existing Voice Sender remains intact.
11. No uncontrolled duplicate-send path exists.
12. Account/platform risk is assessed and disclosed.

Both third-party candidates currently fail multiple gates:

- WeChatPYAPI: version mismatch, missing license/authorization, security instruction, no receipt,
  no coexistence proof.
- PadChat-SDK: stale/current-version gap, missing license, separate service/login, no coexistence or
  bubble proof.

**Neither is `PROTOTYPE_READY`.** No prototype is authorized.

---

## 9. Recommended future experiment (not this round)

If a candidate later becomes `PROTOTYPE_READY`:

- isolated test profile and dedicated test account;
- one explicitly allow-listed target only;
- single-send limit;
- no production account, chat database, token or whitelist;
- no automatic fallback from/to UI Automation;
- server-receipt and local-bubble observation treated as separate grades;
- complete rollback and process cleanup;
- comparison against the existing UI Automation result;
- explicit owner authorization before any real send.

This round performed none of those steps.

---

## 10. Decision

- Keep `ui-automation` as the supported production path.
- Keep `wechatagent-native` `UNSUPPORTED` for 0.3.9/0.4.0.
- Keep `third-party-native` as `RESEARCH_CANDIDATE`, not as an enabled feature.
- Do not integrate WeChatPYAPI or PadChat-SDK now.
- Research can continue in parallel with Phase 4B, without blocking the mainline.
- No native send service, DLL, Hook, package or WeChat version change is authorized.
