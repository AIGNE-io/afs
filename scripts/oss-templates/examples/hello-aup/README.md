# AFS Hello AUP Example

Render a live web page from pure code using **AUP (Agent UI Protocol)** — no HTML templates, no client-side framework, just a declarative tree of UI nodes pushed to the browser over WebSocket.

## What It Does

1. **Starts a web server** on port 3210
2. **Waits for a browser** to connect via WebSocket
3. **Renders a page** by writing an AUP node tree to the session
4. **Live-updates the clock** every second using patch operations

The browser sees a styled page with a heading, markdown content, badges, and a ticking clock — all driven from server-side code.

## Run

```bash
bun index.ts
```

Then open **http://127.0.0.1:3210** in your browser.

## What You'll See

A page with:
- **"Hello, AUP!"** heading
- Markdown-formatted description text
- Three badges: AFS, AUP, WebSocket
- A live-updating server clock (refreshes every second)

## Key Concepts

### AUP (Agent UI Protocol)

AUP lets agents build UIs by describing **what** to show, not **how** to render it. The server sends a tree of typed nodes, and the client renders them appropriately for its capabilities (web browser, terminal, mobile, etc.).

```typescript
const tree = {
  id: "root",
  type: "view",
  children: [
    { id: "title", type: "text", props: { content: "Hello!", level: 1 } },
    { id: "body",  type: "text", props: { content: "Some **markdown**", format: "markdown" } },
  ],
};
```

### Writing to the Session Tree

Render by writing to the session's `tree` path — this is the AFS-first approach:

```typescript
await afs.write(`/ui/web/sessions/${sessionId}/tree`, {
  content: tree,
  meta: { fullPage: true, style: "midnight" },
});
```

Options:
- `fullPage: true` — render the tree as a full browser page
- `style` — visual theme: `"midnight"`, `"clean"`, `"glass"`, `"brutalist"`, `"soft"`, `"cyber"`

### Live Patching

Update specific nodes without re-rendering the entire page:

```typescript
await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
  ops: [
    { op: "update", id: "clock", props: { content: "New text" } },
  ],
});
```

Patch operations:
| Op | Description |
|----|-------------|
| `update` | Modify an existing node's props, state, or events |
| `create` | Add a new child node to a parent |
| `remove` | Delete a node from the tree |
| `reorder` | Change a node's position within its parent |

### Node Types

| Type | Description | Key Props |
|------|-------------|-----------|
| `view` | Container / layout | `layout` (`"row"`, `"column"`, `"grid"`) |
| `text` | Text content | `content`, `level` (1-6 for headings), `format` (`"markdown"`), `mode` (`"badge"`) |
| `action` | Button | `label`, `variant` (`"primary"`, `"ghost"`), `href` |
| `input` | Form input | `inputType`, `placeholder`, `value` |
| `media` | Image/video | `url`, `alt` |
| `table` | Data table | `columns`, `rows` |

### The Flow

```
Server                          Browser
  │                               │
  │  1. Start WebBackend          │
  │  2. Mount UIProvider          │
  │                               │
  │  ←── WebSocket connect ────── │  3. Open http://127.0.0.1:3210
  │                               │
  │  4. Write AUP tree            │
  │  ──── {type: "aup",    ────→  │  5. Render nodes as HTML
  │        action: "render",      │
  │        root: {...}}           │
  │                               │
  │  6. Patch (every second)      │
  │  ──── {type: "aup",    ────→  │  7. Update clock text in-place
  │        action: "patch",       │
  │        ops: [...]}            │
```

## Packages Used

- [`@aigne/afs`](../../packages/core) — Core AFS library
- [`@aigne/afs-ui`](../../providers/ui) — UI provider with WebBackend and AUP rendering
