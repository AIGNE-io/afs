/**
 * AUP Persistence — Tests for aup_save / aup_load session actions.
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

/* ─── Happy Path ─────────────────────────────────────── */

describe("AUP Persistence — Happy Path", () => {
  test("aup_save persists current graph to session page", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const tree = {
        id: "root",
        type: "view",
        children: [
          { id: "t1", type: "text", props: { content: "Hello" } },
          { id: "a1", type: "action", props: { label: "Click" } },
        ],
      };

      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, { root: tree });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_save`, {
        pageId: "dashboard",
      });
      expect(result.success).toBe(true);

      // Read it back as a page
      const page = await afs.read(`/ui/web/sessions/${sessionId}/pages/dashboard`);
      expect(page.data).toBeDefined();
      const parsed = JSON.parse(String(page.data!.content));
      expect(parsed.id).toBe("root");
      expect(parsed.children).toHaveLength(2);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_load restores a previously saved graph", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      // Render + save
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [{ id: "t1", type: "text", props: { content: "V1" } }],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_save`, { pageId: "saved1" });

      // Render something else
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "root2", type: "view" },
      });

      // Load saved graph
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_load`, {
        pageId: "saved1",
      });
      expect(result.success).toBe(true);

      // Verify it was broadcast as render
      const renderMsg = await waitForMessage(
        messages,
        (m) =>
          m.type === "aup" && m.action === "render" && (m.root as { id: string })?.id === "root",
      );
      expect(renderMsg).toBeDefined();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("save then modify then save again updates correctly", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [{ id: "t1", type: "text", props: { content: "V1" } }],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_save`, { pageId: "evolving" });

      // Patch
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_patch`, {
        ops: [{ op: "update", id: "t1", props: { content: "V2" } }],
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "patch");

      // Save again
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_save`, { pageId: "evolving" });

      // Read back — should have V2
      const page = await afs.read(`/ui/web/sessions/${sessionId}/pages/evolving`);
      const parsed = JSON.parse(String(page.data!.content));
      expect(parsed.children[0].props.content).toBe("V2");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Bad Path ───────────────────────────────────────── */

describe("AUP Persistence — Bad Path", () => {
  test("aup_save with no active graph throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_save`, { pageId: "empty" }),
      ).rejects.toThrow("No active AUP graph");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_save without pageId throws", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: { id: "root", type: "view" },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");

      await expect(afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_save`, {})).rejects.toThrow(
        "pageId",
      );
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_load with non-existent page throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_load`, { pageId: "ghost" }),
      ).rejects.toThrow();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_load without pageId throws", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_load`, {})).rejects.toThrow(
        "pageId",
      );
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Edge Cases ─────────────────────────────────────── */

describe("AUP Persistence — Edge Cases", () => {
  test("load graph with unknown primitive types works (graceful degradation)", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      // Render + save a graph with a weird type
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: {
          id: "root",
          type: "view",
          children: [{ id: "x1", type: "custom-widget", props: { data: "test" } }],
        },
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_save`, { pageId: "custom" });

      // Load it back
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_load`, {
        pageId: "custom",
      });
      expect(result.success).toBe(true);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Discovery ──────────────────────────────────────── */

describe("AUP Persistence — Discovery", () => {
  test("session actions include aup_save and aup_load", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      const result = await afs.list(`/ui/web/sessions/${sessionId}/.actions`);
      const ids = result.data?.map((e) => e.id) ?? [];
      expect(ids).toContain("aup_save");
      expect(ids).toContain("aup_load");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
