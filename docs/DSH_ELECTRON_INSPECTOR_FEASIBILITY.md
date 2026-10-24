# DSH Electron Inspector — Feasibility and Safety Boundary

**Status:** feasibility only. No production DSH debugging was enabled, no CDP port was opened, and no
production page content was read.

**Baseline at investigation**

- DSH executable: `0.2.1-rc.2` (build `332895e0f7c9d4dbfb29729f5eb367fa263ff986`)
- DSH GUI: `http://127.0.0.1:57393`
- Host PID `29116`; UI PID `37464`
- Neither process command line contains `--remote-debugging-port` or a Host `--inspect` flag
- DSH runtime version marker: `44.7.0` (not the DSH app version)

## 1. Native Inspector capability

DSH exposes a read-only **Cordis Inspector**, not a browser inspector:

| Provider | What it can return | What it cannot return |
|---|---|---|
| Host `Service` | Service keys, method signatures, referenced types | DOM, accessibility tree, computed CSS |
| Host `Event` | Event names and listener signatures | Page content |
| Host `Config` | Plugin config schema/status | Rendered values |
| Host `Tool` | Tool schemas visible to the Agent | Browser DevTools state |
| Client `Service` / `Event` | Client service/event contracts | DOM |
| Client `Builtin` | `ctx`, `React`, `host`, `styles`, `console` | A DOM/accessibility/CDP API |
| Client `Slots` | Slot topology, registrations, occupants, owner props | Element bounds, CSS, rendered text |
| Client `Theme` | Theme token names | Specific plugin DOM |

Useful evidence from `Slots`:

- `main` is present.
- Its occupants include `whale-voice`, active.
- This proves the plugin is registered in the DSH main panel; it does **not** prove what DOM the
  plugin renders.

No `mcp`, `browser`, `debug`, `webContents`, or `devTools` Service was found in the host catalog.
`Client.Slots` is the only native structural view of the plugin UI, and it is a **slot/registration**
view, not a DOM or Accessibility Tree.

## 2. Does DSH provide a supported DOM/Electron Inspector?

**No supported agent-facing DOM inspector was found.**

- No Host API to read DOM, accessibility, computed style, element bounds, console or network.
- No Client API for DOM inspection beyond React/own-component execution.
- No supported CDP endpoint in the current process.
- DevTools is available as an Electron/desktop UI feature (packaged app menu/devtools switch), but
  that is a manual interactive surface, not a stable Agent API.
- DSH's source has a Host `--inspect=127.0.0.1:<port>` path only for a **development/unpackaged**
  launch (`DSH_DESKTOP_HOST_INSPECT_PORT`, `developmentHostInspectPort`). The packaged production
  launch does not use it.

Therefore:

- **DOM / Accessibility Tree / CSS / bounds / Console / network: unavailable from the supported
  Inspector.**
- **CDP or a development instance would be required** for those capabilities.

## 3. Option assessment

### Option A — existing trusted Inspector

**Partially usable, insufficient for the requested Level 2.**

Can verify:

- plugin registration in `main`
- slot occupancy/registration topology
- plugin/service/config presence
- theme tokens

Cannot verify:

- rendered DOM
- accessible names/roles from the real page
- button/switch/disabled state
- bounding boxes and clipping
- `border-radius`, `overflow`, `backdrop-filter`
- Console/network errors
- DSH/plugin seam geometry

### Option B — isolated DSH development instance with CDP

**Technically plausible, not authorized or executed.**

A separate process/profile could in principle expose Chromium DevTools or a development Host inspect
port. However:

- the packaged DSH app is not a development build;
- its Host inspect port is gated by `development` (unpackaged);
- a new Chromium debugging port is outside the current supported interface;
- a separate single-instance/profile launch must be proven not to attach to the production profile;
- no production token, private profile or production page content may be used.

This is a separate authorization item, not a safe default.

### Option C — isolated Playwright Harness + real GUI screenshots

**Recommended.**

- Keep the pinned `playwright@1.64.1` Level 1 harness for DOM/accessibility/role/layout/console
  checks with fake data.
- Use the trusted Inspector only for real registration metadata.
- For the real DSH page, use explicitly authorized manual screenshots/visual review, not automated
  DOM extraction.
- Never claim the harness result is a real DSH Electron DOM inspection.

## 4. Level status

| Level | Status |
|---|---|
| Level 1 — isolated Playwright DOM/UI | **PASS** (10/10 checks; CI `ui` job) |
| Level 2 — real DSH host render structure | **BLOCKED** — no supported DOM/CDP interface |
| Level 3 — authorized production GUI read-only | **NOT REQUESTED / NOT PERFORMED** |

## 5. What could be verified safely now

- Inspector provider list and `Slots` topology
- `main` occupant `whale-voice` active
- DSH/Host versions and current process flags
- No remote debugging flag currently present
- Existing Playwright harness remains independently green

Not collected:

- production DOM, accessibility tree, screenshots or page text
- any Token or chat data
- any CSS/bounds from the production Electron renderer

## 6. Authorization required for Option B

Before any attempt, require explicit approval for:

1. Launching a **separate DSH Electron development instance** with an isolated profile.
2. A loopback-only debugging port (ephemeral or fixed) **not** used by the production DSH.
3. Confirmation that the production PID `29116` / profile `desktop` is not restarted, attached to or
   modified.
4. A temporary `user-data-dir` containing no production login/session data.
5. A rollback that closes only the test process and leaves production DSH intact.

Suggested prototype (not executed):

```text
separate dev DSH process
  --user-data-dir=<temp profile>
  --remote-debugging-port=0        # only after authorization
  or DSH_DESKTOP_HOST_INSPECT_PORT=<loopback port> in an unpackaged development build
```

The exact supported flags must be verified against the target build before use; Electron supporting a
flag does not make it a supported DSH API.

## 7. Security decisions

- No debug port was opened.
- No production DSH process was restarted or attached to.
- No production Host Token was read.
- No Chrome profile or cookies were copied.
- No real page DOM/content was read.
- No CDP command was sent.
- No Sender, WeChatAgent, Qwen or WeChat operation was performed.
- No screenshot/private data was added to the repository.

## 8. Recommendation

**Use Option C now.**

Use the existing `docs/UI_TESTING.md` harness for actual DOM/CSS/Console/layout work, and use the
trusted Inspector only for slot/registration metadata. If Level 2 is required later, authorize a
separate isolated DSH development instance and debugging port as a separate prototype; do not convert
the production DSH window into a debug target.
