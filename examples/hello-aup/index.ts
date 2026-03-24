/**
 * AFS Hello AUP Example
 *
 * Minimal example showing AUP (Agent UI Protocol) — render a live page
 * from code, then update it with a patch. Open http://127.0.0.1:3210
 * in your browser after starting the script.
 *
 * Run:  bun examples/hello-aup/index.ts
 */

import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";

// ── 1. Boot the UI backend ──────────────────────────────────────────

const PORT = 3210;
const backend = new WebBackend({ port: PORT });
await backend.listen();

const provider = new AFSUIProvider({ backend });
const afs = new AFS();
await afs.mount(provider, "/ui");

console.log(`\n  Hello AUP running at http://127.0.0.1:${PORT}`);
console.log("  Open in your browser. Waiting for client...\n");

// ── 2. Wait for a browser to connect ────────────────────────────────

const sessionId = await new Promise<string>((resolve) => {
  const poll = setInterval(() => {
    const sessions = provider.sessions.list("web");
    if (sessions.length > 0) {
      clearInterval(poll);
      resolve(sessions[0]!.id);
    }
  }, 100);
});
console.log(`  Client connected (session: ${sessionId})\n`);

// ── 3. Render an AUP tree ───────────────────────────────────────────

const tree = {
  id: "root",
  type: "view",
  children: [
    {
      id: "heading",
      type: "text",
      props: { content: "Hello, AUP!", level: 1 },
    },
    {
      id: "intro",
      type: "text",
      props: {
        content:
          "This page is rendered by an AFS agent using the **Agent UI Protocol**.\n\n" +
          "The server builds a declarative tree of UI nodes and pushes it to the browser over WebSocket. " +
          "No HTML templates, no client framework — just data.",
        format: "markdown",
      },
    },
    {
      id: "info",
      type: "view",
      props: { layout: "row" },
      children: [
        { id: "badge1", type: "text", props: { content: "AFS", mode: "badge" } },
        { id: "badge2", type: "text", props: { content: "AUP", mode: "badge" } },
        { id: "badge3", type: "text", props: { content: "WebSocket", mode: "badge" } },
      ],
    },
    {
      id: "clock",
      type: "text",
      props: { content: `Server time: ${new Date().toLocaleTimeString()}` },
    },
  ],
};

await afs.write(`/ui/web/sessions/${sessionId}/tree`, {
  content: tree,
  meta: { fullPage: true, style: "midnight" },
});

console.log("  Rendered initial page.");

// ── 4. Live-update with patches ─────────────────────────────────────

// Update the clock every second to show live patching
setInterval(async () => {
  try {
    await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
      ops: [
        {
          op: "update",
          id: "clock",
          props: { content: `Server time: ${new Date().toLocaleTimeString()}` },
        },
      ],
    });
  } catch {
    // Session may have disconnected
  }
}, 1000);

console.log("  Clock is ticking (live patches every second).");
console.log("  Press Ctrl+C to stop.\n");

// Keep alive
setInterval(() => {}, 60_000);
