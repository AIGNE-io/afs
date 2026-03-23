/**
 * AUP Events — Tests for event → AFS exec wiring via WebSocket transport.
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

  // Wait for session message
  await new Promise<void>((resolve) => {
    const check = () => {
      if (messages.some((m) => m.type === "session")) resolve();
      else setTimeout(check, 10);
    };
    check();
  });

  const sessionMsg = messages.find((m) => m.type === "session") as { sessionId: string };
  const sessionId = sessionMsg.sessionId;

  return { afs, backend, ws, messages, sessionId, provider };
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

function sendAndWaitResult(
  ws: WebSocket,
  messages: Record<string, unknown>[],
  nodeId: string,
  event: string,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  const before = messages.length;
  ws.send(JSON.stringify({ type: "aup_event", nodeId, event }));
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

/* ─── Happy Path ─────────────────────────────────────── */

describe("AUP Events — Happy Path", () => {
  test("click event returns exec config", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      // Intercept to return config (tests event resolution, not exec dispatch)
      provider.onAupEvent = async (_sid, _nid, _evt, cfg) => cfg;
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [
            {
              id: "btn1",
              type: "action",
              props: { label: "Click me" },
              events: { click: { exec: "/data/.actions/submit", args: { x: 1 } } },
            },
          ],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      const result = await sendAndWaitResult(ws, messages, "btn1", "click");
      expect(result.type).toBe("aup_event_result");
      expect(result.nodeId).toBe("btn1");
      expect(result.event).toBe("click");
      expect(result.error).toBeUndefined();
      const r = result.result as Record<string, unknown>;
      expect(r.exec).toBe("/data/.actions/submit");
      expect(r.args).toEqual({ x: 1 });
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("event with no args returns empty args", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      provider.onAupEvent = async (_sid, _nid, _evt, cfg) => cfg;
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [
            {
              id: "btn2",
              type: "action",
              events: { click: { exec: "/path/.actions/go" } },
            },
          ],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      const result = await sendAndWaitResult(ws, messages, "btn2", "click");
      const r = result.result as Record<string, unknown>;
      expect(r.exec).toBe("/path/.actions/go");
      expect(r.args).toEqual({});
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("different events on same node resolve independently", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      provider.onAupEvent = async (_sid, _nid, _evt, cfg) => cfg;
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [
            {
              id: "item1",
              type: "action",
              events: {
                click: { exec: "/do/click" },
                hover: { exec: "/do/hover" },
              },
            },
          ],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      const r1 = await sendAndWaitResult(ws, messages, "item1", "click");
      expect((r1.result as Record<string, unknown>).exec).toBe("/do/click");

      const r2 = await sendAndWaitResult(ws, messages, "item1", "hover");
      expect((r2.result as Record<string, unknown>).exec).toBe("/do/hover");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Bad Path ───────────────────────────────────────── */

describe("AUP Events — Bad Path", () => {
  test("event on non-existent node returns error", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "root", type: "view" },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      const result = await sendAndWaitResult(ws, messages, "nonexistent", "click");
      expect(result.error).toBeDefined();
      expect(String(result.error)).toContain("not found");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("event on node with no events returns error", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [{ id: "t1", type: "text", props: { content: "hi" } }],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      const result = await sendAndWaitResult(ws, messages, "t1", "click");
      expect(result.error).toBeDefined();
      expect(String(result.error)).toContain("no events");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("unknown event name returns error", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [
            {
              id: "btn",
              type: "action",
              events: { click: { exec: "/do/click" } },
            },
          ],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      const result = await sendAndWaitResult(ws, messages, "btn", "hover");
      expect(result.error).toBeDefined();
      expect(String(result.error)).toContain("no 'hover' event");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("event with .. in exec path returns error", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      // validateNode now rejects exec paths containing ".." at render time
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
          root: {
            id: "root",
            type: "view",
            children: [
              {
                id: "bad",
                type: "action",
                events: { click: { exec: "/../../../etc/passwd" } },
              },
            ],
          },
        }),
      ).rejects.toThrow("..");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Edge Cases ─────────────────────────────────────── */

describe("AUP Events — Edge Cases", () => {
  test("event after patch still resolves updated node", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      provider.onAupEvent = async (_sid, _nid, _evt, cfg) => cfg;
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [
            {
              id: "btn",
              type: "action",
              events: { click: { exec: "/v1/.actions/go" } },
            },
          ],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      // Patch: update event exec path
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
        ops: [
          {
            op: "update",
            id: "btn",
            events: { click: { exec: "/v2/.actions/go" } },
          },
        ],
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "patch");

      const result = await sendAndWaitResult(ws, messages, "btn", "click");
      const r = result.result as Record<string, unknown>;
      expect(r.exec).toBe("/v2/.actions/go");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("event on removed node returns error", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [
            {
              id: "btn",
              type: "action",
              events: { click: { exec: "/path/.actions/go" } },
            },
          ],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      // Remove the node
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
        ops: [{ op: "remove", id: "btn" }],
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "patch");

      const result = await sendAndWaitResult(ws, messages, "btn", "click");
      expect(result.error).toBeDefined();
      expect(String(result.error)).toContain("not found");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Security ───────────────────────────────────────── */

describe("AUP Events — Security", () => {
  test("javascript: protocol in exec path is rejected at render time", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
          root: {
            id: "root",
            type: "view",
            children: [
              {
                id: "bad",
                type: "action",
                events: { click: { exec: "javascript:alert(1)" } },
              },
            ],
          },
        }),
      ).rejects.toThrow("javascript:");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
