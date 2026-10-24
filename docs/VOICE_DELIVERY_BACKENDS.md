# Voice Delivery Backends 鈥?Research and Architecture

**Status:** research only. No WeChat message, voice bubble, Hook change, DLL install, service restart or
production configuration write was performed.

**Scope:** installed WeChatAgent `0.3.9`, public upstream WeChatAgent `0.4.0`, the current Whale Voice
request/authorization design, the existing Voice Sender UI Automation path, and public third-party
native-voice API documentation. Detailed candidate evidence is in
[NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md).

---

## 1. Conclusion first

| Capability | Classification | Evidence |
|---|---|---|
| Existing Voice Sender UI Automation voice bubble | **SUPPORTED** (for its verified UI path; still requires foreground and a real send test) | `voice-outbox.js` posts `/v1/messages`; sender observes a native bubble |
| WeChatAgent 0.3.9 native voice bubble | **UNSUPPORTED** | outbound adapter exposes `sendText` and `sendSticker` only |
| WeChatAgent 0.4.0 native voice bubble | **UNSUPPORTED** | public adapter still has no voice send; text/sticker outbound |
| OneBot `record` / voice / audio outbound segment | **UNSUPPORTED in this adapter** | protocol is generic; no record send action is implemented |
| Third-party native voice (`third-party-native`) | **RESEARCH_CANDIDATE** | WeChatPYAPI and PadChat-SDK publish native voice API docs; none is integrated or verified |
| Future native backend | **PROTOTYPE_READY only after the admission gates** | no candidate currently satisfies version, license, coexistence, receipt and safety gates |
| Exact WeChat 4.1.10.27 native voice support | **UNKNOWN / unverified** | current client version is a WeChatAgent baseline; no third-party evidence matches it |

**Do not start a native-send prototype against current WeChatAgent 0.3.9.** There is no real API in
that adapter. Third-party projects exist and are worth continued research, but their public API names
are not proof of current-version compatibility or a native bubble. See
[NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md).

**Do not claim Whale Voice supports native voice delivery.** The only supported delivery backend is
the existing UI Automation path.

---

## 2. What WeChatAgent actually supports

Source inspected:

- installed `0.3.9` adapter and bridge source
- public upstream `0.4.0` adapter and README
- `components/qq-bridge/src/adapters/wechat/wechat-onebot-adapter.js`
- `components/qq-bridge/src/adapters/base-adapter.js`
- `components/qq-bridge/src/core/voice-outbox.js`
- `components/qq-bridge/src/core/social-engine.js`
- `components/qq-bridge/src/onebot/reverse-ws-server.js`
- installer documentation and README

### 2.1 Outbound adapter

The WeChat OneBot adapter implements:

```text
sendText()    -> send_private_msg / send_group_msg with [{type:'text'}]
sendSticker() -> send_private_msg / send_group_msg with [{type:'wechat_sticker'}]
```

It does **not** implement:

```text
sendVoice / SendVoice / send_record / record / audio / voice segment
```

`BaseAdapter` declares capability fields for text, image, quote reply, native reply, group history,
history, unread messages, group member, mention and poke. It has **no voice/audio capability field**.
The concrete WeChat adapter does not add one.

### 2.2 Incoming path

Incoming messages are accepted only for:

```text
text
image (with image data)
file (in the newer public 0.4.0 adapter)
```

Unsupported incoming media is logged and dropped. This is receive-side filtering; it is not evidence
of an outbound record implementation.

### 2.3 README scope

The 0.3.9 README describes:

> 鍘熺敓鏂囧瓧鍙婅〃鎯呭寘鍙戦€?
The public 0.4.0 README adds files, assistant tasks and native stickers, but still does not advertise
native voice sending. It explicitly lists unsupported items including voice/video understanding and
general new-WeChat adaptation.

### 2.4 OneBot protocol vs implementation

OneBot defines a generic `record` segment. That is a protocol possibility, **not** proof that this
WeChatAgent adapter accepts or implements it. The only outbound message payloads constructed here are
`text` and `wechat_sticker`. No `record` action is registered or forwarded by this adapter.

---

## 3. Is there any real SendVoice-equivalent?

### 3.1 Social engine VOICE path

`social-engine.js` can produce a `VOICE` decision. That path calls:

```text
VoiceOutbox.enqueue()
  -> POST http://127.0.0.1:<voice-sender>/v1/messages
  -> Voice Sender
  -> Windows UI Automation recording/playback and native bubble observation
```

This is the **existing UI Automation backend**, not a WeChatAgent native send API.

Important distinctions from `voice-outbox.js`:

- a `202`/`200` only means queued;
- only the sender's final state (for example `SENT_LOCAL`, observed as a new native bubble) counts as
  delivered;
- `UNKNOWN` is terminal and must not be retried;
- the text is sent to the Sender; WeChatAgent itself does not create a voice segment.

### 3.2 Hook / native source

A read-only search of the installed Hook and bridge source did not find a supported `SendVoice`
method. The Hook contains low-level send infrastructure and version-specific native entry points; no
reviewed code exposes a voice-message submission contract with a server receipt.

We did not:

- resolve or guess internal function addresses;
- install or replace a DLL;
- modify the Hook;
- call undocumented native functions;
- send a test message.

Therefore there is **no source-level evidence** for a native voice bubble in the current stack.

### 3.3 Server receipt

Text sends require:

```text
result.data.receipt === 'wechat-server-id'
```

Sticker sends require both a server receipt and `media_type === 'wechat-sticker'`.
Timeout/uncertain text/sticker attempts are marked `unconfirmed`/`UNKNOWN` and are not blindly
resent.

There is **no voice send receipt contract** to evaluate. A generic OneBot success, HTTP 200, or local
queue acknowledgement would not prove a WeChat voice bubble.

### 3.4 Third-party native APIs 鈥?public documentation only

Two unrelated public projects expose native voice methods:

| Project | Public method | Format / return | Current compatibility evidence |
|---|---|---|---|
| WeChatPYAPI | `send_voice(to_wx, path, voice_time)` | SILK path; boolean | Professional 4.1.12.26; community 3.6.0.18; current environment 4.1.10.27 |
| PadChat-SDK | `sendVoice(toUserName, file, time)` | SILK Buffer/base64; object with `msgId` | No current Windows 4.1.10.27 evidence; separate iPad-protocol service |

This is **API documentation evidence**, not Whale Voice integration evidence. Neither project is
installed, called, bundled or verified. Neither can be assumed compatible with WeChatAgent's login,
Hook or current WeChat. Detailed findings and gates:
[NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md).

A boolean or `msgId` is not the same as observing a locally created native voice bubble.

---

## 4. Audio format and target requirements

### Existing UI Automation path

The current Whale Voice frontend constrains generation to:

```text
WAV 路 24 kHz / mono
```

The sender handles playback/recording and device recovery. This is a local WAV handoff, not evidence
that WeChatAgent accepts WAV, SILK, AMR or Opus natively.

### Native path

No reviewed WeChatAgent source documents:

- accepted audio formats (SILK/AMR/Opus/WAV);
- conversion or duration limits;
- server message ID/receipt semantics;
- voice-bubble confirmation.

The third-party candidates publicly mention **SILK**, but their exact profile, duration limits and
receipt behavior are not verified. **Do not assume SILK support alone makes a native backend safe.**
Any future native backend must define and test the exact format and receipt contract.

### Target identity

`sendText`/`sendSticker` accept only synthetic integer IDs for a resolved private user or group. The
VoiceOutbox separately checks an explicit allowed-target map and blocks group voice when
`for_group` is false. These are existing authorization controls, not a native voice API.

A future native backend would still need:

- explicit user permission;
- private/group white-list intersection;
- trusted target identity, not display-name matching;
- group @/explicit-request rules;
- final identity verification before submission.

---

## 5. Current WeChat version

The compatibility matrix records Windows WeChat `4.1.10.27` as the verified local client for the
WeChatAgent 0.3.9 installer baseline.

That means:

- the client/installer version is within the **current documented baseline**;
- it does **not** prove native voice support;
- WeChatPYAPI's professional documentation names `4.1.12.26`, so it is **not** a version match;
- PadChat-SDK has no current Windows 4.1.10.27 support evidence;
- any native voice implementation would need a new compatibility entry and a real isolated send test.

No WeChat upgrade, Hook install, DLL install or version change was performed. Do not upgrade WeChat to
chase a third-party candidate.

---

## 6. Licensing and account risk

- WeChatAgent's root project is MIT-licensed, with separate third-party notices.
- The Hook/native components are **not** MIT-covered by that root license; the project documentation
  states they have separate authorization and are not part of the public source copy.
- WeChatPYAPI has **no repository LICENSE file**; the professional edition's distribution terms were
  not found in public documentation. Do not redistribute its DLL/source.
- PadChat-SDK has **no repository LICENSE file** and depends on a separate proprietary iPad-protocol
  service; a README saying "free" is not a license grant.
- The current installer is not commercially code-signed; this is not evidence of safety.
- Hook-based WeChat automation carries account, platform-Terms and version fragility risks.
- Do not redistribute, reverse-engineer or modify the Hook to add voice.
- Do not bundle third-party DLLs or restricted components into Whale Voice.
- Do not disable antivirus, Smart App Control, code signing or TLS for a candidate.

Any future native work needs a written license/authorization review, not just a technical spike.

---

## 7. Maintainer extension point

The only clean code-level extension point is the adapter contract:

```text
BaseAdapter.sendText()
BaseAdapter.getCapabilities()
WechatOneBotAdapter.sendText()
WechatOneBotAdapter.sendSticker()
```

A future upstream adapter could add a version-gated method such as `sendVoice()` and a capability
flag, with a documented OneBot action or service contract. **No such upstream method, action, version
guarantee or maintainer confirmation exists in the reviewed 0.3.9 or public 0.4.0 source.**

WeChatPYAPI and PadChat-SDK are **not** WeChatAgent extension points. They are unrelated third-party
projects with their own process/login/service models. Do not treat them as upstream WeChatAgent
features, and do not add a private WeChatAgent fork or monkey-patch as the production route.

---

## 8. Multi-backend architecture

### 8.1 Backend contract

```text
DeliveryBackend
  id: 'ui-automation' | 'wechatagent-native' | 'third-party-native'
  capabilities(): {
    state: 'supported' | 'unsupported' | 'research_candidate' | 'prototype_ready'
    voice: 'supported' | 'unsupported' | 'unknown'
    wechatVersions: string[]
    audioFormats: string[]
    privateSend: boolean
    groupSend: boolean
    requiresForeground: boolean
    requiresAudioDriver: boolean
    requiresExtraAuthorization: boolean
    receipt: 'server-id' | 'local-bubble' | 'boolean' | 'none' | 'unknown'
    cancel: 'supported' | 'unsupported' | 'unknown'
    version: string | null
    reason: string
  }
  health(): { state, observedAt, reason }
  resolveTarget(input): { ok, trustedTargetId, reason }
  submit(task): {
    state: 'QUEUED' | 'SUBMITTED' | 'UNKNOWN' | 'REJECTED' | 'FAILED'
    backendRequestId: string | null
    serverMessageId: string | null
  }
  status(backendRequestId): { state, serverMessageId, evidence }
  cancel(backendRequestId): { state: 'CANCELLED' | 'TOO_LATE' | 'UNKNOWN' }
```

### 8.2 Core owns the single queue

- Core creates one durable task with one delivery ID.
- Core selects the backend **before** submission and records the choice.
- Core enforces one active backend per task; no backend may create a second task.
- Core owns dedupe, permission intersection, target identity checks, global queue and `UNKNOWN`
  anti-replay.
- Backends execute only; they do not independently enqueue retries.
- The UI Automation backend keeps its device recovery/cancel protections.
- A native backend would need its own health, receipt and final-identity checks.

### 8.3 Routing rules

- Default remains `ui-automation`.
- `wechatagent-native` is `UNSUPPORTED` for 0.3.9/0.4.0 and cannot be selected.
- `third-party-native` remains `RESEARCH_CANDIDATE`; it cannot be exposed as an active backend.
- `auto` is future-only and must not be exposed as an active selection now.
- No automatic fallback after timeout, `UNKNOWN`, recording, submission, a possible receipt, or
  unverified target identity.
- A fallback is allowed only when the selected backend proves **no external side effect** occurred,
  and the user explicitly authorizes it.
- A native candidate must not create a second queue, second delivery ID or independent retry loop.

### 8.4 UI Automation remains protected

Do not remove:

- Voice Sender final target check;
- private/group allow-list checks;
- device recovery and cancellation;
- Sender independent health checks;
- `UNKNOWN` anti-replay.

---

## 9. Frontend settings

Future `鍙戦€佷笌瀹夊叏` delivery-method section:

| Selection | State now | Display |
|---|---|---|
| 鎸夐敭妯℃嫙鍙戦€?(`ui-automation`) | supported implementation, not necessarily running | current verified backend; foreground/audio-device requirements |
| 鍘熺敓鎺ュ彛鐩村彂 (`wechatagent-native`) | **disabled** | 鈥滃綋鍓?WeChatAgent 鏃犲師鐢熻闊虫帴鍙ｂ€?|
| 鍘熺敓鎺ュ彛鐩村彂 (`third-party-native`) | **disabled / research candidate** | 鈥滅爺绌跺€欓€夛紝鏈獙璇佺増鏈€佽鍙€佸洖鎵т笌鍏卞瓨鈥?|
| 鑷姩閫夋嫨 (`auto`) | **disabled** | 鈥滄湭鏉ヨ兘鍔涳紝灏氭湭鍚敤鈥?|

Required display fields:

- current method;
- availability and reason;
- compatible version;
- foreground requirement;
- audio-driver/microphone/VB-CABLE requirement;
- extra authorization/license requirement;
- last result and receipt grade;
- backend health.

A disabled native option must not look enabled, and no UI action may save a native preference that
cannot be executed. The current real GUI does not yet contain this delivery-method section; this is a
planning contract, not implemented UI.

---

## 10. Performance and maintenance comparison

| Dimension | UI Automation | Native backend |
|---|---|---|
| Current evidence | verified local path, real native bubble observation | none for voice |
| Speed | recording/playback/UI waits; slower | potentially faster |
| Foreground | required for WeChat focus/UIA | potentially not required |
| Audio driver | requires VB-CABLE/recording route | unknown |
| Target identity | Sender final UIA check | would need new native check |
| Receipt | local bubble observation + task state | server message ID required |
| Failure modes | focus loss, device busy, UIA drift | Hook/version/protocol failure |
| Maintenance | medium/high (Windows UI changes) | very high/unknown (private/native API) |
| Risk | foreground/device side effects | account/platform/licensing, unknown |
| Recommendation | **keep as production path** | **do not implement now** |

The third-party native candidates are not a third column of 鈥渟upported鈥?yet:

- WeChatPYAPI would add a proprietary Python/DLL/service dependency, has a 4.1.12.26 vs 4.1.10.27
  version gap, no repository license, and only a boolean return.
- PadChat-SDK would add a separate iPad-protocol login/service, has stale code and no license; its
  `msgId` is not proof of a local native bubble.
- Both remain `RESEARCH_CANDIDATE`; neither should replace or bypass Voice Sender.

---

## 11. Failure and switching policy

Never automatically switch and resend when:

- API/HTTP timeout may have submitted the request;
- result is `UNKNOWN`;
- recording or submission stage has started;
- a matching message receipt exists;
- target conversation identity is not confirmed.

Only a proven no-side-effect failure may be considered for an explicitly user-authorized switch.
Historical tasks must never be replayed.

---

## 12. Decision

### Current native voice backends

- WeChatAgent 0.3.9 native voice: **UNSUPPORTED**.
- WeChatAgent 0.4.0 native voice: **UNSUPPORTED**.
- Third-party native voice: **RESEARCH_CANDIDATE**; no candidate satisfies the admission gates.
- UI Automation: **SUPPORTED** existing path.

### Future native work

Do not start a prototype merely because a public README contains `send_voice` or `sendVoice`.
`PROTOTYPE_READY` requires all twelve gates in
[NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md), including:

1. a real callable API;
2. verified current/declared WeChat version;
3. a license for the intended use and distribution;
4. no disabled system security feature;
5. coexistence with WeChatAgent, or an acceptable architecture;
6. no unverified binary;
7. private/group target identity verification;
8. explicit submission, receipt and `UNKNOWN` semantics;
9. an isolated test environment;
10. the existing Voice Sender preserved;
11. no uncontrolled duplicate sending;
12. account/platform risk disclosed.

No candidate currently passes all gates. No native prototype, DLL install, Hook change, WeChat
upgrade or real voice test is authorized.

### Existing backend

**SUPPORTED** as the UI Automation path, subject to its foreground/device/real-send constraints.
It remains the default and must not be removed or weakened while native research continues.

**Recommendation:** keep UI Automation; do not start a native prototype against 0.3.9. Revisit only
when a published upstream extension point exists.
