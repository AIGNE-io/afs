/**
 * AUP Render — Integration tests for aup_render session action + WebSocket transport.
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

  // Collect messages
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

  // Get session id
  const sessionMsg = messages.find((m) => m.type === "session") as { sessionId: string };
  const sessionId = sessionMsg.sessionId;

  return { afs, backend, ws, messages, sessionId };
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

/* ─── Happy Path ─────────────────────────────────────── */

describe("AUP Render — Happy Path", () => {
  test("aup_render stores graph and broadcasts to client", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const tree = {
        id: "root",
        type: "view",
        children: [
          { id: "t1", type: "text", props: { content: "Hello AUP" } },
          { id: "a1", type: "action", props: { label: "Click me" } },
        ],
      };

      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: tree,
      });
      expect(result.success).toBe(true);

      const aupMsg = await waitForMessage(
        messages,
        (m) => m.type === "aup" && m.action === "render",
      );
      expect(aupMsg.type).toBe("aup");
      expect(aupMsg.action).toBe("render");
      expect((aupMsg.root as { id: string }).id).toBe("root");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("multiple aup_render calls replace previous graph", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "r1", type: "view" },
      });
      await waitForMessage(
        messages,
        (m) => m.type === "aup" && (m.root as { id: string })?.id === "r1",
      );

      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "r2", type: "view", props: { mode: "card" } },
      });
      await waitForMessage(
        messages,
        (m) => m.type === "aup" && (m.root as { id: string })?.id === "r2",
      );

      const renders = messages.filter((m) => m.type === "aup" && m.action === "render");
      expect(renders.length).toBeGreaterThanOrEqual(2);
      const last = renders[renders.length - 1]!;
      expect((last.root as { id: string }).id).toBe("r2");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_render coexists with chat messages", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      // Send chat write via backend directly (session message write forwards to backend)
      await afs.write("/ui/output", { content: "Chat message" });
      await waitForMessage(messages, (m) => m.type === "write");

      // Send AUP render
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "root", type: "view" },
      });
      await waitForMessage(messages, (m) => m.type === "aup");

      const writeMsg = messages.find((m) => m.type === "write");
      const aupMsg = messages.find((m) => m.type === "aup");
      expect(writeMsg).toBeDefined();
      expect(aupMsg).toBeDefined();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Bad Path ───────────────────────────────────────── */

describe("AUP Render — Bad Path", () => {
  test("aup_render without root throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {}),
      ).rejects.toThrow("root");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_render with root missing id throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
          root: { type: "view" },
        }),
      ).rejects.toThrow("node.id");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_render with root missing type throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
          root: { id: "r" },
        }),
      ).rejects.toThrow("node.type");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Patch via action ───────────────────────────────── */

describe("AUP Patch — via session action", () => {
  test("aup_patch applies ops and broadcasts", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      // First render
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [{ id: "t1", type: "text", props: { content: "V1" } }],
        },
      });

      // Patch
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
        ops: [{ op: "update", id: "t1", props: { content: "V2" } }],
      });
      expect(result.success).toBe(true);

      const patchMsg = await waitForMessage(
        messages,
        (m) => m.type === "aup" && m.action === "patch",
      );
      expect(patchMsg).toBeDefined();
      expect((patchMsg.ops as unknown[])[0]).toMatchObject({
        op: "update",
        id: "t1",
      });
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_patch without prior render throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
          ops: [{ op: "update", id: "x", props: {} }],
        }),
      ).rejects.toThrow("No active AUP graph");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_patch without ops throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "root", type: "view" },
      });
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {}),
      ).rejects.toThrow("ops");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("failed patch doesn't corrupt store", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [{ id: "t1", type: "text" }],
        },
      });

      // Attempt bad patch
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
          ops: [{ op: "update", id: "nonexistent", props: { x: 1 } }],
        }),
      ).rejects.toThrow();

      // Re-render should still work (store intact)
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "root", type: "view" },
      });
      expect(result.success).toBe(true);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── AUP actions listed ─────────────────────────────── */

describe("AUP Actions — Discovery", () => {
  test("session actions include aup_render and aup_patch", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      const result = await afs.list(`/ui/web/sessions/${sessionId}/.actions`);
      const ids = result.data?.map((e) => e.id) ?? [];
      expect(ids).toContain("aup_render");
      expect(ids).toContain("aup_patch");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
