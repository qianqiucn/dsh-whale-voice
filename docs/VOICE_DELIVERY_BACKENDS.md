# Voice Delivery Backends — Research and Architecture

**Status:** research only. No WeChat message, voice bubble, Hook change, DLL install, service restart or
production configuration write was performed.

**Scope:** installed WeChatAgent `0.3.9` source, its bundled documentation, the current Whale Voice
request/authorization design, and the existing Voice Sender UI Automation path.

---

## 1. Conclusion first

| Capability | Classification | Evidence |
|---|---|---|
| Existing Voice Sender UI Automation voice bubble | **SUPPORTED** (for its verified UI path; still requires foreground and a real send test) | `voice-outbox.js` posts `/v1/messages`; sender observes a native bubble |
| WeChatAgent 0.3.9 native voice bubble | **UNSUPPORTED** | outbound adapter exposes `sendText` and `sendSticker` only |
| OneBot `record` / voice / audio outbound segment | **UNSUPPORTED** | protocol is generic; this WeChatAgent adapter does not implement a record send action |
| Future native backend | **PROTOTYPE_REQUIRED only if upstream adds a supported API** | `BaseAdapter` extension point exists, but no send-voice implementation or maintainer confirmation |
| Exact WeChat 4.1.10.27 native voice support | **UNKNOWN for voice** | client version is in the compatibility matrix; no voice-send evidence |

**Do not start a native-send prototype against current 0.3.9.** There is no real API to call. The
correct next action is an upstream capability request/prototype only after a supported extension point
is published and authorized.

---

## 2. What the installed WeChatAgent actually supports

Source inspected:

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
```

Unsupported incoming types are logged and dropped. This is receive-side filtering; it is not evidence
of an outbound record implementation.

### 2.3 README scope

The 0.3.9 README describes:

> 原生文字及表情包发送

It explicitly lists unsupported items including voice/video understanding and general new-WeChat
adaptation. It does not advertise native voice sending.

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

---

## 4. Audio format and target requirements

### Existing UI Automation path

The current Whale Voice frontend constrains generation to:

```text
WAV · 24 kHz / mono
```

The sender handles playback/recording and device recovery. This is a local WAV handoff, not evidence
that WeChatAgent accepts WAV, SILK, AMR or Opus natively.

### Native path

No reviewed WeChatAgent source documents:

- accepted audio formats (SILK/AMR/Opus/WAV);
- conversion or duration limits;
- server message ID/receipt semantics;
- voice-bubble confirmation.

**Do not assume any of these formats will work.** A future native backend must define and test the
exact format and receipt contract.

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
- any native voice implementation would need a new compatibility entry and a real isolated send test.

No WeChat upgrade, Hook install, DLL install or version change was performed.

---

## 6. Licensing and account risk

- WeChatAgent's root project is MIT-licensed, with separate third-party notices.
- The Hook/native components are **not** MIT-covered by that root license; the project documentation
  states they have separate authorization and are not part of the public source copy.
- The current installer is not commercially code-signed; this is not evidence of safety.
- Hook-based WeChat automation carries account, platform-Terms and version fragility risks.
- Do not redistribute, reverse-engineer or modify the Hook to add voice.
- Do not bundle third-party DLLs or restricted components into Whale Voice.

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
guarantee or maintainer confirmation exists in the reviewed 0.3.9 source.**

Do not add a private fork or monkey-patch as the production route.

---

## 8. Dual-backend architecture

### 8.1 Backend contract

```text
DeliveryBackend
  id: 'ui-automation' | 'wechatagent-native'
  capabilities(): {
    voice: 'supported' | 'unsupported' | 'unknown'
    requiresForeground: boolean
    requiresAudioDriver: boolean
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
- `wechatagent-native` is disabled unless its capability is `supported`, target identity is verified
  and the version is explicitly compatible.
- `auto` is future-only and must not be exposed as an active selection now.
- No automatic fallback after timeout, `UNKNOWN`, recording, submission, a possible receipt, or
  unverified target identity.
- A fallback is allowed only when both backends prove **no external side effect** occurred, and the
  user explicitly authorizes it.

### 8.4 UI Automation remains protected

Do not remove:

- Voice Sender final target check;
- private/group allow-list checks;
- device recovery and cancellation;
- Sender independent health checks;
- `UNKNOWN` anti-replay.

---

## 9. Frontend settings

Future `发送与安全` delivery-method section:

| Selection | State now | Display |
|---|---|---|
| 按键模拟发送 (`ui-automation`) | available but not auto-verified | current verified backend; foreground requirement |
| 原生接口直发 (`wechatagent-native`) | **disabled** | “当前 WeChatAgent 0.3.9 无原生语音接口” |
| 自动选择 (`auto`) | **disabled** | “未来能力，尚未启用” |

Required display fields:

- current method;
- availability and reason;
- compatible version;
- foreground requirement;
- audio-driver requirement;
- last result;
- backend health.

A disabled native option must not look enabled, and no UI action may save a native preference that
cannot be executed.

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

### Current native voice backend

**UNSUPPORTED** for WeChatAgent 0.3.9.

### Future native work

**PROTOTYPE_REQUIRED** only after:

1. upstream publishes a supported voice send method/action;
2. format, receipt and target contract are documented;
3. license/authorization is reviewed;
4. an isolated test harness and a one-shot no-send authorization exist;
5. compatibility with the exact WeChat version is proven.

### Existing backend

**SUPPORTED** as the UI Automation path, subject to its foreground/device/real-send constraints.

**Recommendation:** keep UI Automation; do not start a native prototype against 0.3.9. Revisit only
when a published upstream extension point exists.
