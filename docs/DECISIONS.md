# Architectural Decisions

**Status legend:** `ACCEPTED` = current project rule; `SUPERSEDED` = replaced; `RESEARCH` = not implemented;
`REJECTED` = explicitly not chosen.

All decisions are dated **2026-10-24** unless noted. Each links to its authoritative document.

---

## ADR-001 鈥?WeChatAgent is the required WeChat platform dependency

**Status:** `ACCEPTED`
**Decision:** Whale Voice does not implement a second WeChat reader, account manager, session store or
bot. WeChat messaging and account/session context depend on the independent
`sourcepro5/WeChatAgent` project.

**Reason:** Avoid duplicating a high-risk, version-fragile Hook/account system; keep one platform
boundary and one compatibility policy.

**Rejected alternatives:** Native replacement bot; private WeChat reader; bundled Hook fork as the
main integration.

**Related:** [WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [AGENTS.md](../AGENTS.md).

---

## ADR-002 鈥?Voice Sender remains an independent delivery backend

**Status:** `ACCEPTED`
**Decision:** The Voice Sender is a separate Windows component responsible for final target check,
UI Automation, recording/playback, device recovery, cancellation and result reporting. It must not be
folded into the DSH frontend or Core Host process.

**Reason:** It is the historically verified native-bubble path and carries independent safety checks;
coupling it to the UI or Core would increase blast radius.

**Rejected alternatives:** Send from the browser; send from the Host Node process; move audio/UI
automation into the plugin client.

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md), [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

---

## ADR-003 鈥?Native voice delivery remains a research candidate

**Status:** `RESEARCH`
**Decision:** Keep `third-party-native` as a `RESEARCH_CANDIDATE`. WeChatAgent 0.3.9/0.4.0 native
voice is `UNSUPPORTED`. Do not integrate WeChatPYAPI or PadChat-SDK without version, license,
coexistence, receipt and safety proof.

**Reason:** Public API names are not evidence of current WeChat compatibility or a native bubble;
third-party DLL/service and account risks are material.

**Rejected alternatives:** Treating a README `send_voice`/`sendVoice` as working support; installing a
DLL or disabling antivirus; silently upgrading WeChat; using an unlicensed service.

**Related:** [NATIVE_VOICE_RESEARCH.md](NATIVE_VOICE_RESEARCH.md),
[VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md).

---

## ADR-004 鈥?Core owns unified configuration and delivery coordination

**Status:** `ACCEPTED`
**Decision:** Whale Voice Core is the authority for configuration reading, target authorization and
task lifecycle. Delivery backends execute; they do not create independent queues or retry loops.

**Reason:** One task ID, one delivery ID and one selected backend are required to prevent duplicate
sends and preserve UNKNOWN semantics.

**Rejected alternatives:** Frontend-selected backend with no Core record; independent backend queues;
per-backend retry.

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md), [SEND_SAFETY_API.md](SEND_SAFETY_API.md).

---

## ADR-005 鈥?Bridge switch and Worker safety permit are different layers

**Status:** `ACCEPTED`
**Decision:** `voice-settings.json.enabled` is the Bridge user switch.
`config.json.voice_enabled` is the Worker's independent final-safety permit. They are not compared
as one value; the snapshot exposes `voice.worker` separately and `voice.consistency: not_comparable`.

**Reason:** Bridge false and Worker true are expected in production. A Worker true does not override a
Bridge false. Collapsing them creates false mismatch or unsafe bypass.

**Rejected alternatives:** A single combined voice switch; treating different values as a conflict.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-006 鈥?UNKNOWN never triggers automatic resend

**Status:** `ACCEPTED`
**Decision:** `UNKNOWN` is terminal for automatic retry. No backend switch, new delivery ID or silent
replay is allowed after a request may have produced an external send.

**Reason:** Duplicate voice messages are a safety and privacy failure; a timeout may still mean the
message was submitted.

**Rejected alternatives:** Retry on timeout; fall back to another backend; replay historical tasks
after plugin reload.

**Related:** [VOICE_DELIVERY_BACKENDS.md](VOICE_DELIVERY_BACKENDS.md),
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## ADR-007 鈥?Saved configuration is not runtime-effective configuration

**Status:** `ACCEPTED`
**Decision:** `savedRevision` and `application.state` describe the saved snapshot, not proof of the
running configuration. `activeRevision` remains `null` until a supported runtime-version interface
exists.

**Reason:** File mtime, process liveness or a saved value cannot prove the Bridge/Worker loaded that
value. UI must show 鈥滅敓鏁堟湭纭/鏈煡鈥?rather than 鈥滃凡鐢熸晥鈥?

**Rejected alternatives:** Equating a successful read or save with live effect; treating mtime as
proof.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [SETUP_API.md](SETUP_API.md).

---

## ADR-008 鈥?UI Inspector uses isolated Playwright; real Electron debugging needs separate authorization

**Status:** `ACCEPTED`
**Decision:** Level 1 UI testing uses a pinned Playwright harness with fake setup data. The production
DSH Electron page is not attached through CDP, no debug port is opened, and any real Electron
inspection requires a separate authorized isolated instance.

**Reason:** The production DSH has no supported agent-facing DOM/CDP endpoint; weakening auth or
opening debugging would create unsafe access to private UI.

**Rejected alternatives:** Enabling CDP on production DSH; reusing the production profile; reading
production page content via unsupported means.

**Related:** [UI_TESTING.md](UI_TESTING.md),
[DSH_ELECTRON_INSPECTOR_FEASIBILITY.md](DSH_ELECTRON_INSPECTOR_FEASIBILITY.md).

---

## ADR-009 鈥?Production changes and isolated tests are separate

**Status:** `ACCEPTED`
**Decision:** Development and tests must use isolated profiles, fake data and read-only sources.
Production configuration writes, real sends, service restarts, audio-device changes and Hook/DLL
changes require separate explicit authorization.

**Reason:** Keeps tests safe and prevents test success from being confused with production
authorization.

**Rejected alternatives:** Testing against production Host/token; modifying voice switches to make a
test pass; disabling security controls.

**Related:** [AGENTS.md](../AGENTS.md), [PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## ADR-010 鈥?Phase 4A-H request and revision hardening

**Status:** `ACCEPTED`
**Decision:**

- Origin validation compares complete `scheme + host + port`.
- No-Origin DSH same-origin GET is accepted only with loopback/Host, Sec-Fetch-Site, token and DSH
  connection checks.
- HTTP reads reject responses without a streaming reader instead of using unbounded `text()`.
- `accountVerified` is true only for an explicit supported boolean; an account object alone is unknown.
- `configRevision` is an opaque process-keyed HMAC over the authoritative saved-config coverage:
  voice, worker, TTS, permissions/allowlists and source state.

**Reason:** These were concrete pre-merge safety/contract defects found in review; fixing them
before Phase 4B avoids carrying an unsafe revision/auth foundation into writes.

**Rejected alternatives:** Public unkeyed SHA-256 over low-entropy allowlist IDs; trusting
Content-Length; inferring account verification from a generic object; partial UI-only revision.

**Related:** [CONFIG_SOURCES.md](CONFIG_SOURCES.md), [SETUP_API.md](SETUP_API.md),
[WECHATAGENT_COMPATIBILITY.md](WECHATAGENT_COMPATIBILITY.md).

---

## ADR-011 鈥?Stage handoff memory is maintained, but not authoritative

**Status:** `ACCEPTED`
**Decision:** Each stage maintains `AI_CONTEXT.md` as a concise recovery summary and `DECISIONS.md`
for architecture decisions. On conflict, repository code, Git/GitHub state, tests and the named
authoritative docs win.

**Reason:** Long-running AI sessions need fast recovery without treating stale summaries as truth.

**Rejected alternatives:** Chat history as source of truth; a single oversized status file; copying
secrets/private data into memory files.

**Related:** [AI_CONTEXT.md](AI_CONTEXT.md), [AGENTS.md](../AGENTS.md).
