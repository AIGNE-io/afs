/**
 * AUP Shell Layout — Tests for desktop shell semantics:
 * - `view` with `mode: "shell"` activates CSS Grid desktop layout
 * - Children use `role` prop for named regions (menubar, sidebar, content, etc.)
 * - Collapsible sidebar/inspector via `state.collapsed`
 * - Global keyboard shortcuts via `shortcut:*` events
 */
import { describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

/* ─── helpers ──────────────────────────────────────────── */

async function setupWeb() {
  const backend = new WebBackend({ port: 0 });
  const info = await backend.listen();
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");

  const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
  await new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_session" }));
      resolve();
    });
  });

  const messages: Record<string, unknown>[] = [];
  ws.on("message", (data) => {
    try {
      messages.push(JSON.parse(String(data)));
    } catch {}
  });

  await new Promise<void>((resolve) => {
    const check = () => {
      if (messages.some((m) => m.type === "session")) resolve();
      else setTimeout(check, 10);
    };
    check();
  });

  const sessionMsg = messages.find((m) => m.type === "session") as { sessionId: string };
  return { afs, backend, ws, messages, sessionId: sessionMsg.sessionId, provider };
}

function waitForMessage(
  messages: Record<string, unknown>[],
  predicate: (m: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const found = messages.find(predicate);
      if (found) return resolve(found);
      if (Date.now() > deadline) return reject(new Error("Timeout waiting for message"));
      setTimeout(check, 10);
    };
    check();
  });
}

function sendEventAndWaitResult(
  ws: WebSocket,
  messages: Record<string, unknown>[],
  nodeId: string,
  event: string,
  data?: Record<string, unknown>,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  const before = messages.length;
  const msg: Record<string, unknown> = { type: "aup_event", nodeId, event };
  if (data) msg.data = data;
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const found = messages
        .slice(before)
        .find((m) => m.type === "aup_event_result" && m.nodeId === nodeId && m.event === event);
      if (found) return resolve(found);
      if (Date.now() > deadline) return reject(new Error("Timeout waiting for aup_event_result"));
      setTimeout(check, 10);
    };
    check();
  });
}

async function renderTree(
  afs: AFS,
  sessionId: string,
  messages: Record<string, unknown>[],
  root: Record<string, unknown>,
) {
  await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, { root });
  await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
}

/* ─── Shell Layout ───────────────────────────────────────── */

describe("AUP Shell Layout", () => {
  test("shell tree renders and broadcasts to client", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          { id: "menubar", type: "view", props: { role: "menubar" } },
          {
            id: "body",
            type: "view",
            props: { role: "body", layout: "row" },
            children: [
              { id: "sidebar", type: "view", props: { role: "sidebar" } },
              { id: "content", type: "view", props: { role: "content" } },
            ],
          },
          { id: "statusbar", type: "view", props: { role: "statusbar" } },
        ],
      });

      // Render message was received
      const renderMsg = messages.find((m) => m.type === "aup" && m.action === "render");
      expect(renderMsg).toBeDefined();
      const root = renderMsg!.root as Record<string, unknown>;
      const props = root.props as Record<string, unknown>;
      expect(props.mode).toBe("shell");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("shell with all 8 regions stores correctly", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const shellTree = {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          { id: "menubar", type: "view", props: { role: "menubar" } },
          { id: "toolbar", type: "view", props: { role: "toolbar" } },
          {
            id: "body",
            type: "view",
            props: { role: "body", layout: "row" },
            children: [
              { id: "sidebar", type: "view", props: { role: "sidebar" } },
              { id: "content", type: "view", props: { role: "content" } },
              { id: "inspector", type: "view", props: { role: "inspector" } },
            ],
          },
          { id: "statusbar", type: "view", props: { role: "statusbar" } },
          { id: "dock", type: "view", props: { role: "dock" } },
        ],
      };

      await renderTree(afs, sessionId, messages, shellTree);

      // Read back the tree from server
      const readResult = await afs.read(`/ui/web/sessions/${sessionId}/tree`);
      const tree = readResult.data?.content as Record<string, unknown>;
      expect(tree).toBeDefined();
      const children = tree.children as Array<Record<string, unknown>>;
      expect(children).toHaveLength(5); // menubar, toolbar, body, statusbar, dock
      expect((children[0]!.props as Record<string, unknown>).role).toBe("menubar");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("shell with only body and statusbar works", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          {
            id: "body",
            type: "view",
            props: { role: "body" },
            children: [
              {
                id: "content",
                type: "view",
                props: { role: "content" },
                children: [{ id: "t1", type: "text", props: { content: "Hello" } }],
              },
            ],
          },
          {
            id: "statusbar",
            type: "view",
            props: { role: "statusbar" },
            children: [{ id: "t2", type: "text", props: { content: "Ready" } }],
          },
        ],
      });

      const renderMsg = messages.find((m) => m.type === "aup" && m.action === "render");
      expect(renderMsg).toBeDefined();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("nested views inside shell regions work", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          {
            id: "body",
            type: "view",
            props: { role: "body", layout: "row" },
            children: [
              {
                id: "content",
                type: "view",
                props: { role: "content", mode: "tabs" },
                children: [
                  {
                    id: "tab1",
                    type: "view",
                    props: { label: "Tasks" },
                    children: [{ id: "card1", type: "view", props: { mode: "card" } }],
                  },
                  { id: "tab2", type: "view", props: { label: "Terminal" } },
                ],
                state: { activeTab: "tab1" },
              },
            ],
          },
        ],
      });

      const renderMsg = messages.find((m) => m.type === "aup" && m.action === "render");
      expect(renderMsg).toBeDefined();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Collapsible ────────────────────────────────────────── */

describe("AUP Shell Collapsible", () => {
  test("sidebar collapse state stored correctly", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          {
            id: "body",
            type: "view",
            props: { role: "body", layout: "row" },
            children: [
              {
                id: "sidebar",
                type: "view",
                props: { role: "sidebar" },
                state: { collapsed: true },
              },
              { id: "content", type: "view", props: { role: "content" } },
            ],
          },
        ],
      });

      // Read back tree
      const readResult = await afs.read(`/ui/web/sessions/${sessionId}/tree`);
      const tree = readResult.data?.content as Record<string, unknown>;
      const body = (tree.children as Array<Record<string, unknown>>)[0]!;
      const sidebar = (body.children as Array<Record<string, unknown>>)[0]!;
      expect((sidebar.state as Record<string, unknown>).collapsed).toBe(true);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("sidebar toggle event received by server", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      provider.onAupEvent = async (_sid, _nid, _evt, cfg) => cfg;

      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          {
            id: "body",
            type: "view",
            props: { role: "body", layout: "row" },
            children: [
              {
                id: "sidebar",
                type: "view",
                props: { role: "sidebar" },
                events: { toggle: { exec: "/app/.actions/toggle-sidebar" } },
                state: { collapsed: false },
              },
              { id: "content", type: "view", props: { role: "content" } },
            ],
          },
        ],
      });

      const result = await sendEventAndWaitResult(ws, messages, "sidebar", "toggle", {
        collapsed: true,
      });
      expect(result.error).toBeUndefined();
      const r = result.result as Record<string, unknown>;
      expect(r.exec).toBe("/app/.actions/toggle-sidebar");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Keyboard Shortcuts ─────────────────────────────────── */

describe("AUP Keyboard Shortcuts", () => {
  test("shortcut event on menubar node resolves to exec config", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      provider.onAupEvent = async (_sid, _nid, _evt, cfg) => cfg;

      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          {
            id: "menubar",
            type: "view",
            props: { role: "menubar" },
            events: {
              "shortcut:meta+k": { exec: "/app/.actions/command-palette" },
              "shortcut:meta+n": { exec: "/app/.actions/new-task" },
            },
          },
        ],
      });

      // Server-side: shortcut events resolve like any other event
      const result = await sendEventAndWaitResult(ws, messages, "menubar", "shortcut:meta+k");
      expect(result.error).toBeUndefined();
      const r = result.result as Record<string, unknown>;
      expect(r.exec).toBe("/app/.actions/command-palette");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("multiple shortcuts on different nodes resolve independently", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      provider.onAupEvent = async (_sid, _nid, _evt, cfg) => cfg;

      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        props: { mode: "shell" },
        children: [
          {
            id: "menubar",
            type: "view",
            props: { role: "menubar" },
            events: { "shortcut:meta+k": { exec: "/app/.actions/palette" } },
          },
          {
            id: "content",
            type: "view",
            props: { role: "content" },
            events: { "shortcut:meta+shift+n": { exec: "/app/.actions/new" } },
          },
        ],
      });

      const r1 = await sendEventAndWaitResult(ws, messages, "menubar", "shortcut:meta+k");
      expect((r1.result as Record<string, unknown>).exec).toBe("/app/.actions/palette");

      const r2 = await sendEventAndWaitResult(ws, messages, "content", "shortcut:meta+shift+n");
      expect((r2.result as Record<string, unknown>).exec).toBe("/app/.actions/new");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
