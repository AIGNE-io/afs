# AUP Protocol Specification

**Version:** 0.1-draft
**Status:** Phase 0a — extracted from TypeScript reference implementation

## 1. Overview

AUP (Agentic Universal Primitives) is a real-time protocol for agents to render
interactive user interfaces. An agent constructs a **semantic node tree** —
describing *what* to display, not *how* — and the client renders it according to
device capabilities and theme.

AUP runs over WebSocket as a sub-protocol of AFS. The agent (server) manages
the node tree; the client renders it and sends user events back.

### Design Intent

Traditional UI requires agents to generate HTML/CSS/JS for specific platforms.
AUP inverts this: the agent describes intent ("show a text input and a submit button"),
and the client renders it natively on web, terminal, mobile, or any future device.

Key properties:
- **Semantic, not visual** — Nodes define *what*, clients decide *how*
- **Atomic patching** — Incremental updates via patch operations
- **Device-adaptive** — Primitives degrade gracefully on limited devices
- **AFS-integrated** — Events dispatch as AFS `exec` calls; data binds via AFS paths

### Architecture

```
Agent (server)                     Client (device)
┌─────────────┐                    ┌─────────────┐
│ AUP Session │◄── WebSocket ────►│  Renderer    │
│  Logic      │                    │  (Web/TTY/   │
│             │    render ────►    │   iOS/etc.)  │
│  Node Store │    patch  ────►    │              │
│             │    stage  ────►    │  Device Caps │
│             │    take   ────►    │              │
│             │◄── event          │              │
└─────────────┘                    └─────────────┘
```

---

## 2. Node Model

### AUPNode

A node is the atomic element of the UI tree.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier across the entire tree |
| `type` | string | Yes | Primitive type name |
| `props` | Record<string, unknown> | No | Primitive-specific attributes |
| `src` | string | No | AFS path — read-only data binding |
| `bind` | string | No | AFS path — read-write data binding |
| `state` | Record<string, unknown> | No | UI-local mutable state |
| `events` | Record<string, AUPEvent> | No | Event bindings |
| `children` | AUPNode[] | No | Child nodes |

### AUPEvent

Maps a user interaction to an AFS exec call.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `exec` | string | Yes | AFS path to execute |
| `args` | Record<string, unknown> | No | Arguments passed to exec |

### Primitive Types

17 built-in primitives:

| Primitive | Description | Containable |
|-----------|-------------|-------------|
| `view` | Generic container | Yes |
| `text` | Text display (markdown, rich text) | No |
| `media` | Images, video, audio | No |
| `input` | Text input, textarea, selects | No |
| `action` | Buttons, links | No |
| `overlay` | Modal, popover, toast, drawer | Yes |
| `table` | Tabular data | No |
| `time` | Timestamps, durations, countdowns | No |
| `chart` | Data visualizations | No |
| `map` | Geographic maps | No |
| `calendar` | Date/event display | No |
| `chat` | Chat/message interface | Yes |
| `rtc` | Real-time communication (video/audio call) | No |
| `explorer` | File/tree browser | No |
| `editor` | Code/text editor | No |
| `canvas` | Drawing/painting surface | No |
| `afs-list` | AFS directory listing component | No |
| `nav` | Navigation container (tabs, stack, present, menu, switcher) | Yes |

Custom types are allowed — clients render them as `view` fallback.

### Semantic Tokens

| Token | Values |
|-------|--------|
| `AUPVariant` | `primary`, `secondary`, `ghost`, `destructive` |
| `AUPSize` | `xs`, `sm`, `md`, `lg`, `xl` |
| `AUPIntent` | `info`, `success`, `warning`, `error` |

### Universal Props

Available on all node types:

| Prop | Type | Description |
|------|------|-------------|
| `region` | string | Semantic region identifier |
| `role` | string | Accessibility/semantic role |
| `layout` | string | Spatial intent: `row`, `column`, `grid`, `stack`, `overlay-grid` |
| `width` | string/number | Width constraint |
| `maxWidth` | string/number | Maximum width |
| `height` | string/number | Height constraint |
| `flex` | number | Flex grow factor |
| `gap` | string/number | Spacing between children |
| `focusable` | boolean | Whether the node can receive keyboard/controller focus |
| `focusOrder` | number | Explicit focus/tab order (auto-derived from layout if omitted) |
| `accessibilityLabel` | string | Screen reader / voice control label |
| `accessibilityHint` | string | Additional context for assistive technologies |
| `accessibilityRole` | string | Override semantic role for accessibility tree |

### Data Binding

- **`src`** (read-only): Client reads AFS path and displays content. One-way binding.
- **`bind`** (read-write): Client reads and writes AFS path. Two-way binding. Changes from user input are written back to the AFS path.

Security: `src` and `bind` paths must not contain `javascript:` scheme. Paths cannot contain `..`.

---

## 3. Session Lifecycle

### Connection Handshake

**Step 1: Client connects via WebSocket**

**Step 2: Client sends handshake message**

```json
{
  "type": "join_session",
  "sessionId": "optional-existing-id",
  "sessionToken": "optional-auth-token",
  "treeVersion": 0,
  "caps": { ... }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"join_session"` | Yes | Handshake type |
| `sessionId` | string | No | Reconnect to existing session |
| `sessionToken` | string | No | Session authentication |
| `treeVersion` | number | No | Client's current tree version (for reconnect optimization) |
| `caps` | DeviceCaps | No | Device capability declaration |

**Step 3: Server responds**

```json
{
  "type": "session",
  "sessionId": "assigned-session-id",
  "sessionToken": "generated-token-or-null"
}
```

**Step 4: Server sends current tree state**

If client provided `treeVersion` matching server's current version, server may skip
re-rendering. Otherwise, server sends a full `render` message.

### Alternative: Channel Mode

For broadcast/live viewing (read-only, multiple viewers):

```json
{ "type": "join_channel", "channelId": "channel-name" }
```

Server responds:

```json
{ "type": "channel", "channelId": "channel-name" }
```

Channel clients receive render/patch messages but cannot send events.

### Session Registry

- One `AUPSessionLogic` instance per session
- Sessions are created on first join, destroyed explicitly
- Multiple clients can join the same session (broadcast to all)
- Session state persists across client disconnects/reconnects

---

## 4. Messages

### 4.1 Server → Client

#### render — Full Tree

```json
{
  "type": "aup",
  "action": "render",
  "root": { ... },
  "treeVersion": 1,
  "fullPage": false,
  "chrome": false,
  "theme": "default",
  "style": "default",
  "locale": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"aup"` | Yes | Protocol identifier |
| `action` | `"render"` | Yes | Full tree render |
| `root` | AUPNode | Yes | Complete node tree |
| `treeVersion` | number | Yes | Monotonically increasing version |
| `fullPage` | boolean | No | Full-page rendering mode |
| `chrome` | boolean | No | Show toolbar (language, theme, mode) |
| `theme` | string | No | Theme identifier |
| `style` | string | No | Visual style |
| `locale` | string | No | Language/locale |

#### patch — Incremental Update

```json
{
  "type": "aup",
  "action": "patch",
  "ops": [ ... ],
  "treeVersion": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"aup"` | Yes | Protocol identifier |
| `action` | `"patch"` | Yes | Incremental update |
| `ops` | AUPPatchOp[] | Yes | Patch operations (see §5) |
| `treeVersion` | number | Yes | New version after patch |

#### stage — Pre-render Scene

```json
{
  "type": "aup",
  "action": "stage",
  "sceneId": "scene-1",
  "root": { ... },
  "treeVersion": 1
}
```

Same fields as `render` plus `sceneId`. Client prepares the scene off-screen.

#### take — Activate Scene

```json
{
  "type": "aup",
  "action": "take",
  "sceneId": "scene-1"
}
```

Client swaps the staged scene to live display. Zero-teardown transition.

#### aup_event_result — Event Response

```json
{
  "type": "aup_event_result",
  "nodeId": "btn-submit",
  "event": "click",
  "result": { "status": "ok" },
  "error": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"aup_event_result"` | Event result |
| `nodeId` | string | Node that fired the event |
| `event` | string | Event name |
| `result` | unknown | Success value (if succeeded) |
| `error` | string \| null | Error message (if failed) |

#### Other Server Messages

| Type | Fields | Description |
|------|--------|-------------|
| `write` | content, format?, component?, componentProps? | Text output |
| `prompt` | message, promptType, options? | Interactive prompt |
| `notify` | message | Toast notification |
| `navigate` | pageId, content, format, layout? | Page navigation |
| `clear` | (none) | Clear screen |
| `afs_result` | reqId, data | AFS proxy success |
| `afs_error` | reqId, error | AFS proxy failure |
| `afs_event` | subId, event | AFS subscription event |

---

### 4.2 Client → Server

#### aup_event — User Interaction

```json
{
  "type": "aup_event",
  "nodeId": "input-name",
  "event": "change",
  "data": { "value": "Alice" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"aup_event"` | Yes | Event message |
| `nodeId` | string | Yes | Node that fired the event |
| `event` | string | Yes | Event name |
| `data` | Record<string, unknown> | No | Event-specific data |

**Standard Events:**

| Event | Trigger | Typical Data |
|-------|---------|--------------|
| `click` | Button/link pressed | — |
| `change` | Input value changed | `{ value }` |
| `send` | Chat message sent | `{ message }` |
| `sort` | Table sort changed | `{ column, direction }` |
| `select` | Item selected | `{ value }` / `{ values }` |
| `confirm` | Dialog confirmed | — |
| `cancel` | Dialog cancelled | — |
| `dismiss` | Overlay dismissed | — |
| `complete` | Task completed | — |
| `load` | Content loaded | — |
| `error` | Error occurred | `{ message }` |
| `message` | Generic message | `{ content }` |

**Gesture Events:**

Gesture events extend the standard event system for touch and spatial interaction.
Any node can declare gesture event handlers. Clients SHOULD only emit gesture events
that match their declared `DeviceInput.gestures` capabilities (see §7).

| Event | Trigger | Data | Continuous? |
|-------|---------|------|-------------|
| `swipe` | Quick directional drag | `{ direction: "left"\|"right"\|"up"\|"down", velocity }` | No |
| `longpress` | Press and hold | `{ x, y, duration }` | No |
| `pan` | Drag/move | `{ dx, dy, x, y, state: "start"\|"move"\|"end" }` | Yes |
| `pinch` | Two-finger pinch/spread | `{ scale, centerX, centerY, state }` | Yes |
| `rotate` | Two-finger rotation | `{ angle, centerX, centerY, state }` | Yes |

**Continuous vs discrete:** Discrete gesture events (`swipe`, `longpress`) fire once.
Continuous gesture events (`pan`, `pinch`, `rotate`) fire repeatedly during the gesture
with `state` tracking the lifecycle. Continuous events support `throttle` (ms) to control
emission rate.

```json
{
  "type": "view",
  "events": {
    "pinch": { "exec": "/map/.actions/zoom", "throttle": 50 },
    "pan": { "exec": "/map/.actions/move", "throttle": 50 },
    "longpress": { "exec": "/photo/.actions/context-menu" },
    "swipe": { "exec": "/deck/.actions/navigate", "filter": { "direction": ["left", "right"] } }
  }
}
```

**Gesture degradation:** When a device does not support touch/gesture input, clients
SHOULD map gestures to equivalent pointer/keyboard interactions:

| Gesture | Pointer fallback | Keyboard fallback |
|---------|-----------------|-------------------|
| `swipe` | — | Arrow keys |
| `longpress` | Right-click / context menu | Menu key |
| `pan` | Click-drag | Arrow keys |
| `pinch` | Ctrl+scroll | `+`/`-` keys |
| `rotate` | — | `[`/`]` keys |

**Event Dispatch:**

1. Client sends `aup_event`
2. Server looks up node by `nodeId`
3. If node has `events[eventName]` → exec the declared AFS path with merged args
4. If no event config but `onExecEvent` handler exists → fallback to handler
5. Server sends `aup_event_result` back to client

#### Other Client Messages

| Type | Fields | Description |
|------|--------|-------------|
| `input` | content | Text input (terminal mode) |
| `prompt_response` | value | Response to `prompt` message |
| `navigate_request` | pageId | Deep link navigation |
| `afs_read` | reqId, path | Proxy: read AFS path |
| `afs_list` | reqId, path, options? | Proxy: list AFS directory |
| `afs_write` | reqId, path, content?, meta? | Proxy: write AFS path |
| `afs_exec` | reqId, path, args? | Proxy: exec AFS action |
| `afs_stat` | reqId, path | Proxy: stat AFS entry |
| `afs_subscribe` | reqId, path, subId, filter? | Subscribe to AFS events |
| `afs_unsubscribe` | reqId, subId | Unsubscribe |

**AFS Proxy:**

Clients can perform AFS operations over the WebSocket connection instead of
separate HTTP calls. Each request includes a `reqId` for correlation. Server
responds with `afs_result` or `afs_error` with the matching `reqId`.

---

## 5. Patch Operations

Patches are the primary mechanism for incremental tree updates. All operations
in a single patch message are applied **atomically** — if any operation fails
validation, the entire batch is rejected and the tree remains unchanged.

### 5.1 create

Add a new node to the tree.

```json
{
  "op": "create",
  "id": "new-node-id",
  "parentId": "parent-node-id",
  "node": { "id": "new-node-id", "type": "text", "props": { "content": "Hello" } },
  "index": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `op` | `"create"` | Yes | Operation type |
| `id` | string | Yes | New node ID (must not exist in tree) |
| `parentId` | string | Yes | Parent node ID (must exist) |
| `node` | AUPNode | Yes | Complete node to insert |
| `index` | number | No | Insertion position in parent's children (default: append) |

**Validation:**
- `id` must not already exist in the tree
- `parentId` must exist in the tree
- `node.id` must equal `id`

### 5.2 update

Modify an existing node's properties, state, or events.

```json
{
  "op": "update",
  "id": "existing-node-id",
  "props": { "content": "Updated text" },
  "state": { "expanded": true }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `op` | `"update"` | Yes | Operation type |
| `id` | string | Yes | Node ID (must exist) |
| `props` | Record<string, unknown> | No | Merged into existing props |
| `state` | Record<string, unknown> | No | Merged into existing state |
| `events` | Record<string, AUPEvent> | No | **Replaces** existing events |

**Merge semantics:**
- `props`: shallow merge (`Object.assign` semantics)
- `state`: shallow merge
- `events`: full replacement (not merged)

### 5.3 remove

Remove a node and all its descendants from the tree.

```json
{
  "op": "remove",
  "id": "node-to-remove"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `op` | `"remove"` | Yes | Operation type |
| `id` | string | Yes | Node ID to remove |

**Behavior:**
- Removing the root node clears the entire tree
- All descendants are also removed
- Node index is cleaned up (descendants removed from lookup)

### 5.4 reorder

Move a node to a new position within its parent's children.

```json
{
  "op": "reorder",
  "id": "node-to-move",
  "parentId": "parent-node-id",
  "index": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `op` | `"reorder"` | Yes | Operation type |
| `id` | string | Yes | Node ID to move |
| `parentId` | string | Yes | Parent node ID |
| `index` | number | Yes | New position in parent's children |

**Behavior:**
- Node must be a child of the specified parent (no reparenting — node must already be in the specified parent)
- Throws on out-of-bounds index (index must be in range [0, parent.children.length - 1) after removing the node)

> **Note (S12):** `create` allows `index === parent.children.length` (append semantics), but `reorder` rejects `index >= parent.children.length` (strict bounds). This is intentional: create is inserting into the current array, while reorder first removes the node then reinserts, so the valid range is one smaller.

### Tree Version

- Version is a monotonically increasing integer
- Increments on every `render` or `patch` operation
- Starts at 0 for a new session
- Client tracks version for reconnect optimization

---

## 6. Scenes (Dual-Buffer)

Scenes enable zero-teardown transitions between different UI states.

### Lifecycle

```
empty → staged → taken (active) → released
                   ↑                  │
                   └──── re-stage ────┘
```

### Operations

#### stage

Prepare a scene off-screen.

```json
{ "type": "aup", "action": "stage", "sceneId": "scene-1", "root": { ... } }
```

- Client renders the tree but does not display it
- Multiple scenes can be staged simultaneously
- Server manages a scene store (LRU, max 3 scenes by default)

#### take

Activate a staged scene.

```json
{ "type": "aup", "action": "take", "sceneId": "scene-1" }
```

- Client swaps the staged scene to live display
- Previous scene is no longer active
- Only one scene can be active at a time

#### release

Free scene resources (server-side API, not a WS message).

- Cannot release the active scene
- LRU eviction handles cleanup automatically

### Scene Patching

Staged scenes can receive patches before being taken:

```typescript
sceneManager.applyPatch(sceneId, ops)
```

This allows progressive pre-rendering of complex UIs.

---

## 7. Device Capabilities

### DeviceCaps

Clients declare their rendering capabilities at connection time.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `platform` | string | Yes | `"web"`, `"ios"`, `"android"`, `"cli"`, etc. |
| `formFactor` | string | Yes | `"desktop"`, `"phone"`, `"tablet"`, `"watch"`, `"tv"`, `"headset"`, `"terminal"` |
| `display` | DeviceDisplay | No | Display characteristics |
| `input` | DeviceInput | No | Input method capabilities |
| `primitives` | Record<string, PrimitiveCap> | Yes | Per-primitive rendering capability |
| `features` | Record<string, boolean> | No | Device features (`"camera"`, `"gps"`, `"biometric"`, etc.) |

### PrimitiveCap

| Value | Meaning |
|-------|---------|
| `"native"` | Full native rendering |
| `"webview"` | Rendered in embedded web view |
| `"partial"` | Basic rendering, some features missing |
| `"unsupported"` | Cannot render this primitive |

### DeviceDisplay

| Field | Type | Values |
|-------|------|--------|
| `type` | string | `"visual"`, `"spatial"`, `"audio-only"`, `"tactile"` |
| `color` | string | `"full"`, `"limited"`, `"mono"` |
| `refresh` | string | `"realtime"`, `"slow"` |
| `resolution` | { w, h } | Pixel dimensions |
| `depth` | string | `"2d"`, `"3d"` |

### DeviceInput

| Field | Type | Description |
|-------|------|-------------|
| `touch` | boolean | Touch screen |
| `keyboard` | boolean | Physical/virtual keyboard |
| `voice` | boolean | Voice input |
| `gaze` | boolean | Eye tracking |
| `gestures` | string[] | Supported gesture types (see below) |
| `dpad` | boolean | Directional pad / TV remote (focus-based navigation) |
| `controller` | boolean | Game controller |

**Gesture capabilities:** The `gestures` array declares which gesture events the device
can emit. Agents use this to decide whether to generate gesture-dependent UI.

| Value | Description |
|-------|-------------|
| `"swipe"` | Quick directional flick |
| `"longpress"` | Press and hold |
| `"pan"` | Continuous drag/move |
| `"pinch"` | Two-finger scale |
| `"rotate"` | Two-finger rotation |

Typical presets:
- Phone/tablet: `["swipe", "longpress", "pan", "pinch", "rotate"]`
- Desktop (trackpad): `["swipe", "pan", "pinch"]`
- Desktop (mouse only): `["pan", "longpress"]`
- TV/terminal: `[]`

### Built-in Presets

| Preset | Platform | Form Factor | Key Capabilities |
|--------|----------|-------------|------------------|
| `DEVICE_CAPS_TTY` | cli | terminal | text only |
| `DEVICE_CAPS_TERM` | web | terminal | text + basic styling |
| `DEVICE_CAPS_WEB_CHAT` | web | desktop | text, chat, overlay, media, action |
| `DEVICE_CAPS_WEB_FULL` | web | desktop | all primitives via webview |

---

## 8. Degradation

When a client cannot render a primitive, AUP automatically degrades it.

### Degradation Chains

| Primitive | Fallback Chain |
|-----------|---------------|
| `globe` | map → media → text |
| `chart` | table → text |
| `map` | media → text |
| `editor` | input → text |
| `canvas` | media → text |
| `rtc` | unsupported |
| `calendar` | table → text |
| `time` | text |
| `overlay` | text |
| `nav` | view → text |

### Algorithm

```
function degradeTree(node, caps):
  for each node in tree (recursive):
    if caps.primitives[node.type] is "unsupported":
      for fallback in DEGRADATION_CHAINS[node.type]:
        if caps.primitives[fallback] is not "unsupported":
          node.type = fallback
          node.props._degradedFrom = originalType
          break
      if still unsupported:
        node.type = "text"
        node.props._unsupported = true
```

- Degradation is applied server-side before sending to client
- Degraded nodes are annotated with `_degradedFrom` prop
- Nodes with no meaningful fallback become text with `_unsupported: true`

---

## 9. AFS Exec Actions

AUP operations are also accessible as AFS exec actions, enabling agent
orchestration through the filesystem interface.

### Session Actions

All paths follow pattern: `/:endpoint/sessions/:sessionId/.actions/<action>`

| Action | Input | Description |
|--------|-------|-------------|
| `aup_render` | `{ root, fullPage?, chrome?, theme?, style?, locale? }` | Render full tree |
| `aup_patch` | `{ ops }` | Apply patch operations |
| `aup_stage` | `{ sceneId, root, fullPage?, chrome?, theme?, style?, locale? }` | Stage a scene |
| `aup_take` | `{ sceneId }` | Activate staged scene |
| `aup_save` | `{ pageId }` | Save current tree as page |
| `aup_load` | `{ pageId, fullPage?, chrome?, theme?, style?, locale? }` | Load saved page |

### Live Channel Actions

Pattern: `/:endpoint/live/:channelId/.actions/<action>`

| Action | Input | Description |
|--------|-------|-------------|
| `aup_render` | `{ root, ... }` | Render to live channel (broadcast) |
| `aup_patch` | `{ ops }` | Patch live channel tree |

---

## 10. Validation Rules

### Node Validation

- `id`: must be a non-empty string
- `type`: must be a non-empty string
- `src`: if present, must be a string, must not contain `javascript:`
- `bind`: if present, must be a string, must not contain `javascript:`
- `events`: each event's `exec` path must be a string, must not contain `..` or `javascript:`
- `children`: recursively validated

### Patch Operation Validation

| Operation | Required Fields |
|-----------|----------------|
| `create` | id (string), parentId (string), node (valid AUPNode) |
| `update` | id (string), at least one of: props, state, events |
| `remove` | id (string) |
| `reorder` | id (string), parentId (string), index (number) |

### DeviceCaps Validation

- `platform`: required, must be a string
- `formFactor`: required, must be a string
- `primitives`: required, must be an object with values from PrimitiveCap enum

---

## 11. State Diagrams

### Session Lifecycle

```
[disconnected] ──connect──► [connected]
                              │
                         join_session
                              │
                              ▼
                           [joined] ◄──── reconnect (with treeVersion)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                 render     patch     event
                    │         │         │
                    └─────────┼─────────┘
                              │
                         disconnect
                              │
                              ▼
                        [disconnected]
```

### Scene Lifecycle

```
[empty] ──stage──► [staged] ──take──► [active]
                      │                   │
                      │              stage (new)
                      │                   │
                   release                ▼
                      │              [staged] (new active)
                      ▼
                   [released]
```

### Tree Version

```
version: 0  ──render──► version: 1  ──patch──► version: 2  ──patch──► version: 3
                                                                          │
                                                                     render (reset)
                                                                          │
                                                                          ▼
                                                                     version: 4
```

Version never decreases. Every `render` or `patch` increments by 1.

---

## 12. Navigation Primitive

Navigation is a first-class primitive in AUP. Every multi-screen application — mobile,
desktop, web, or TV — uses the same five navigation modes. The client renderer maps
each mode to the platform's native navigation component.

### Design Principles

1. **Agent describes intent, client chooses component.** The agent says "tabs with 3 items";
   the client decides whether that's a bottom tab bar (phone), sidebar (tablet), or
   top nav (TV).
2. **Client must render maximally.** Even if the agent doesn't optimize for the current
   form factor, the client must produce a reasonable layout from any valid nav tree.
3. **Navigation is composable.** Nav nodes nest: a `switcher` contains windows that each
   contain `tabs`, which each contain `stack` pages. This models real app structure.

### Nav Node

```
type: "nav"
props:
  mode: "tabs" | "stack" | "present" | "menu" | "switcher"
  ... (mode-specific props below)
children: AUPNode[]   # Content for the active page/item
```

### Mode: `tabs`

Switch between top-level sections. Exactly one tab is active at a time.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `"tabs"` | Yes | — |
| `items` | TabItem[] | Yes | Tab definitions |
| `activeTab` | string | Yes | ID of the active tab |
| `position` | string | No | Hint: `"bottom"`, `"top"`, `"side"`. Client may override based on form factor. |

**TabItem:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique tab identifier |
| `label` | string | Yes | Display text |
| `icon` | string | No | Icon name or AFS path |
| `badge` | string/number | No | Badge content (notification count, dot) |

**Platform mapping:**

| Form Factor | Native Component |
|-------------|-----------------|
| Phone | UITabBarController / BottomNavigationView |
| Tablet | Sidebar (iPadOS) / NavigationRail |
| Desktop/Web | Side nav, top nav bar, or tab strip |
| TV | Top tab bar with focus navigation |
| Terminal | Numbered menu: `[1] Home  [2] Settings  [3] Profile` |

**Tab switching:** Agent sends a `patch` operation updating `activeTab` and replacing
`children` with the new tab's content. Client animates the transition natively.

### Mode: `stack`

Push/pop navigation within a section. Models drill-down flows.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `"stack"` | Yes | — |
| `title` | string | No | Navigation bar title |
| `backAction` | boolean | No | Show back button (default: true if depth > 1) |
| `backLabel` | string | No | Custom back button label |
| `headerActions` | ActionItem[] | No | Trailing navigation bar buttons |

**ActionItem:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Action identifier |
| `label` | string | Yes | Display text |
| `icon` | string | No | Icon name |
| `variant` | AUPVariant | No | Visual style |

**Stack operations:** Pushing a new page is a `patch` that adds a child. Popping
removes the last child. The client maintains a visual stack with back gesture support.

**Platform mapping:**

| Form Factor | Native Component |
|-------------|-----------------|
| Phone | UINavigationController / NavHostFragment (full-screen push) |
| Tablet | NavigationSplitView detail pane / master-detail |
| Desktop/Web | Route change with history, breadcrumbs |
| TV | Full-screen transition with focus-based back |
| Terminal | Print new content, `[b] Back` action |

### Mode: `present`

Temporary overlay on top of current content. Dismissed by user action or agent.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `"present"` | Yes | — |
| `style` | string | Yes | `"sheet"`, `"dialog"`, `"fullscreen"`, `"popover"`, `"drawer"` |
| `dismissible` | boolean | No | User can dismiss (default: true) |
| `title` | string | No | Presentation title / header |
| `anchor` | string | No | Node ID to anchor popover to |
| `position` | string | No | `"bottom"`, `"center"`, `"leading"`, `"trailing"` |

**Dismissal:** When user dismisses, client sends `aup_event` with event name
`"dismiss"` on the nav node. Agent can then `patch` to remove the presentation.

**Platform mapping:**

| Form Factor | Style: sheet | Style: dialog | Style: popover | Style: drawer |
|-------------|-------------|--------------|----------------|---------------|
| Phone | Bottom sheet (`.sheet`) | Alert/dialog | Full-screen sheet | Side drawer |
| Tablet | Partial sheet | Centered dialog | Anchored popover | Side drawer |
| Desktop/Web | Modal overlay | Dialog | Dropdown/popover | Side panel |
| TV | Center overlay | Center dialog | — (degrade to dialog) | — (degrade to dialog) |
| Terminal | Inline text block | `[y/n]` prompt | — (degrade to text) | — (degrade to text) |

### Mode: `menu`

Action list triggered by user interaction. Desktop menu bars, context menus,
phone action sheets — all are menu mode with different triggers.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `"menu"` | Yes | — |
| `trigger` | string | No | `"bar"`, `"context"`, `"press"`, `"hover"` |
| `items` | MenuItem[] | Yes | Menu items |
| `title` | string | No | Menu/action sheet title |

**MenuItem:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Item identifier |
| `label` | string | Yes | Display text |
| `icon` | string | No | Icon name |
| `shortcut` | string | No | Keyboard shortcut (e.g., `"⌘N"`, `"Ctrl+S"`) |
| `disabled` | boolean | No | Greyed out |
| `destructive` | boolean | No | Styled as destructive action |
| `children` | MenuItem[] | No | Submenu items |
| `divider` | boolean | No | Render as separator line (other fields ignored) |

**Menu selection:** Client sends `aup_event` with event name `"select"` and
`data: { itemId: "..." }` on the nav node.

**Platform mapping:**

| Form Factor | trigger: bar | trigger: context | trigger: press |
|-------------|-------------|-----------------|----------------|
| Phone | — (degrade to tabs) | — (degrade to press) | Action sheet |
| Tablet | Top menu bar (iPad) | Context menu | Action sheet / popover |
| Desktop/Web | Menu bar with dropdowns | Right-click context menu | Click dropdown |
| TV | — (degrade to tabs) | — (degrade to list) | Focus-select list |
| Terminal | Numbered list | Numbered list | Numbered list |

### Mode: `switcher`

Switch between multiple independent workspaces, windows, or apps. This is the
semantic equivalent of a desktop dock/taskbar or mobile app switcher.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `"switcher"` | Yes | — |
| `items` | SwitcherItem[] | Yes | Workspace/window definitions |
| `activeItem` | string | Yes | ID of the active workspace |
| `position` | string | No | Hint: `"bottom"`, `"top"`, `"leading"` |

**SwitcherItem:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Workspace identifier |
| `label` | string | Yes | Display text |
| `icon` | string | No | Icon or thumbnail path |
| `badge` | string/number | No | Notification indicator |
| `closable` | boolean | No | Can be closed by user |

**Platform mapping:**

| Form Factor | Native Component |
|-------------|-----------------|
| Phone | Bottom sheet app picker / tab group |
| Tablet | Split view source list / floating dock |
| Desktop/Web | Dock / taskbar / window list |
| TV | Input/app selector strip |
| Terminal | Numbered workspace list |

**Relationship to WM:** The web provider's existing window manager (WM) maps to
a `switcher` nav node. Each WM window becomes a `SwitcherItem`. The dock is the
switcher's visual representation. This gives the WM a spec-level definition rather
than being a web-specific ad-hoc feature.

### Composition

Nav nodes compose naturally to model real application structures:

```
nav (mode: switcher)                    ← Desktop dock / mobile app tabs
├── items: [app1, app2, app3]
├── activeItem: "app1"
│
└── children:
    nav (mode: tabs)                    ← App-level sections
    ├── items: [home, search, profile]
    ├── activeTab: "home"
    │
    └── children:
        nav (mode: stack)               ← Section drill-down
        ├── title: "Home"
        │
        └── children:
            view (layout: column)       ← Actual page content
            ├── text "Welcome"
            └── action "Start"
```

The depth of nesting is unconstrained. A phone client might collapse the outer
`switcher` into the OS-level app switcher and render only `tabs` + `stack`.
A desktop client renders all three levels. A TV client renders `tabs` as a top
bar and ignores `switcher` (single-app context).

### Nav Events

All nav modes emit events on the nav node:

| Event | Data | Description |
|-------|------|-------------|
| `tabChange` | `{ tabId }` | User switched tabs |
| `back` | `{}` | User triggered back navigation |
| `dismiss` | `{}` | User dismissed a presentation |
| `select` | `{ itemId }` | User selected a menu item |
| `switcherChange` | `{ itemId }` | User switched workspaces |
| `close` | `{ itemId }` | User closed a switcher item |

The agent handles these events to update the tree accordingly (change `activeTab`,
pop stack, remove presentation, etc.).

### Focus & Accessibility

The `nav` primitive integrates with the universal focus/accessibility props (§2).

**Focus behavior by mode:**

| Mode | Focus Behavior |
|------|---------------|
| `tabs` | Tab items are focusable. Arrow keys move between tabs. Enter selects. |
| `stack` | Focus moves to first focusable element of new page on push. Back button is focusable. |
| `present` | Focus traps inside the presentation. Escape dismisses (if `dismissible`). |
| `menu` | Arrow keys navigate items. Enter selects. Escape closes. |
| `switcher` | Items are focusable. Arrow keys move between items. Enter switches. |

**Voice control:** When `DeviceInput.voice` is `true`, all nav items must have
meaningful labels. Voice engine maps spoken labels to navigation actions:
- "Go to Settings" → activates the "Settings" tab
- "Go back" → triggers back navigation
- "Open file menu" → opens the menu with trigger "bar", label "File"
- "Close" → dismisses current presentation

---

## 13. Additional Primitives

Four additional primitive types exist beyond the 17 core primitives (§2):

| Primitive | Description | Containable |
|-----------|-------------|-------------|
| `deck` | Slide/card deck — swipeable pages, presentation mode | Yes |
| `ticker` | Real-time scrolling text or data feed | No |
| `frame` | Embedded content frame (iframe-like sandboxed content) | No |
| `broadcast` | Live stream or video broadcast | No |

**deck props:**

| Prop | Type | Description |
|------|------|-------------|
| `activeIndex` | number | Currently visible slide (0-based) |
| `autoplay` | boolean | Auto-advance slides |
| `interval` | number | Auto-advance interval (ms) |
| `loop` | boolean | Loop back to first slide after last |

**ticker props:**

| Prop | Type | Description |
|------|------|-------------|
| `items` | `{ label, value, trend? }[]` | Data items to scroll |
| `speed` | number | Scroll speed multiplier |
| `direction` | `"ltr"` \| `"rtl"` | Scroll direction |

**frame props:**

| Prop | Type | Description |
|------|------|-------------|
| `url` | string | Content URL to embed |
| `sandbox` | string | Sandbox permissions (same as iframe sandbox attribute) |
| `allowScripts` | boolean | Allow JavaScript execution |

**broadcast props:**

| Prop | Type | Description |
|------|------|-------------|
| `streamUrl` | string | Stream source URL |
| `live` | boolean | Whether the stream is live |
| `muted` | boolean | Start muted |

These primitives degrade like others (§8): `deck` → `view`, `ticker` → `text`, `frame` → `text` (shows URL), `broadcast` → `media` → `text`.

---

## 14. Bridge Protocol

AUP content can be embedded in iframes or webviews using the bridge protocol. Communication uses `window.postMessage` with structured message types.

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `aup_bridge_init` | Host → Frame | Initialize bridge with session info |
| `aup_bridge_ready` | Frame → Host | Frame is ready to receive AUP messages |
| `aup_bridge_render` | Host → Frame | Forward a render message |
| `aup_bridge_patch` | Host → Frame | Forward a patch message |
| `aup_bridge_event` | Frame → Host | Forward a user event to the host |
| `aup_bridge_resize` | Frame → Host | Frame requests size change |

### Handshake

1. Host creates iframe and sends `aup_bridge_init` with `{ sessionId, origin }`.
2. Frame responds with `aup_bridge_ready` with `{ capabilities }`.
3. Host forwards AUP `render`/`patch` messages as `aup_bridge_render`/`aup_bridge_patch`.
4. Frame forwards user events as `aup_bridge_event`.

All bridge messages include a `source: "aup"` field for identification and origin validation.

---

## 15. Caller Identity

Authenticated AUP sessions carry DID-based caller identity via HTTP headers:

| Header | Type | Description |
|--------|------|-------------|
| `x-caller-did` | string | Caller's Decentralized Identifier (DID) |
| `x-caller-pk` | string | Caller's public key (for signature verification) |

- These headers are set during WebSocket upgrade or initial HTTP handshake.
- The server propagates them into `AFSContext` as `userId` (mapped from DID).
- Event handlers and AFS operations receive the caller identity through the context chain.
- If neither header is present, the session is treated as anonymous.

---

## 16. TypeScript Interface Completeness Note

The following fields are present in the implementation but may not be explicitly called out in earlier sections:

- **`treeVersion`** on `render` and `patch` messages — always present, documented in §4.1.
- **`stage` / `take`** message types — documented in §4.1 and §6.
- **`data`** field on `aup_event` messages — documented in §4.2.
- **`sceneId`** on `stage` messages — documented in §4.1 and §6.

All message types and their complete field sets are documented in Appendix A (Complete Message Reference). Implementors should treat that table as the authoritative field listing.

---

## Appendix A: Complete Message Reference

### Server → Client Messages

| Type | Action | Key Fields |
|------|--------|------------|
| `aup` | `render` | root, treeVersion, fullPage?, chrome?, theme?, style?, locale? |
| `aup` | `patch` | ops[], treeVersion |
| `aup` | `stage` | sceneId, root, treeVersion, (render options) |
| `aup` | `take` | sceneId |
| `aup_event_result` | — | nodeId, event, result?, error? |
| `session` | — | sessionId, sessionToken |
| `channel` | — | channelId |
| `write` | — | content, format?, component?, componentProps? |
| `prompt` | — | message, promptType, options? |
| `notify` | — | message |
| `navigate` | — | pageId, content, format, layout? |
| `clear` | — | (none) |
| `afs_result` | — | reqId, data |
| `afs_error` | — | reqId, error |
| `afs_event` | — | subId, event |

### Client → Server Messages

| Type | Key Fields |
|------|------------|
| `join_session` | sessionId?, sessionToken?, treeVersion?, caps? |
| `join_channel` | channelId |
| `aup_event` | nodeId, event, data? |
| `input` | content |
| `prompt_response` | value |
| `navigate_request` | pageId |
| `afs_read` | reqId, path |
| `afs_list` | reqId, path, options? |
| `afs_write` | reqId, path, content?, meta? |
| `afs_exec` | reqId, path, args? |
| `afs_stat` | reqId, path |
| `afs_subscribe` | reqId, path, subId, filter? |
| `afs_unsubscribe` | reqId, subId |
