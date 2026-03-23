/**
 * AUP Subsystems — Tests for terminal subsystem primitive.
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
  return { afs, backend, ws, messages, sessionId: sessionMsg.sessionId };
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

/* ─── Terminal Subsystem ─────────────────────────────── */

describe("AUP Terminal Subsystem", () => {
  test("terminal node stores and broadcasts correctly", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [{ id: "term1", type: "terminal", props: { rows: 24, cols: 80 } }],
        },
      });
      expect(result.success).toBe(true);

      const msg = await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
      const root = msg.root as { children?: { type: string; props: Record<string, unknown> }[] };
      expect(root.children![0]!.type).toBe("terminal");
      expect(root.children![0]!.props.rows).toBe(24);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Mixed Primitives ──────────────────────────── */

describe("AUP Mixed Primitives", () => {
  test("all primitive types including terminal in one tree", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [
            { id: "t1", type: "text", props: { content: "Title" } },
            { id: "a1", type: "action", props: { label: "Go" } },
            { id: "i1", type: "input", props: { type: "text" } },
            { id: "m1", type: "media", props: { type: "icon", content: "🤖" } },
            { id: "o1", type: "overlay", props: { mode: "dialog" }, state: { open: false } },
            { id: "tbl", type: "table", props: { columns: [{ key: "k", label: "K" }], rows: [] } },
            { id: "term", type: "terminal", props: { rows: 24, cols: 80 } },
          ],
        },
      });
      expect(result.success).toBe(true);

      const msg = await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
      const root = msg.root as { children?: { type: string }[] };
      const types = root.children!.map((c) => c.type);
      expect(types).toEqual(["text", "action", "input", "media", "overlay", "table", "terminal"]);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
