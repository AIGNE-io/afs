/**
 * AUP Stage-to-Live — Integration tests for aup_stage, aup_take, aup_release via WebSocket.
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

  const port = info.port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
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

  await waitForMessage(messages, (m) => m.type === "session");
  const sessionMsg = messages.find((m) => m.type === "session") as {
    sessionId: string;
    sessionToken?: string;
  };
  const sessionId = sessionMsg.sessionId;
  const sessionToken = sessionMsg.sessionToken;

  return { afs, backend, ws, messages, sessionId, sessionToken, port };
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

function makeTree(id: string) {
  return {
    id,
    type: "view",
    children: [{ id: `${id}-t`, type: "text", props: { content: `Scene ${id}` } }],
  };
}

/* ─── Tests ──────────────────────────────────────────── */

describe("AUP Stage-to-Live", () => {
  test("aup_stage sends stage message with sceneId and root to client", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const tree = makeTree("demo");
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "demo",
        root: tree,
      });
      expect(result.success).toBe(true);

      const msg = await waitForMessage(messages, (m) => m.type === "aup" && m.action === "stage");
      expect(msg.sceneId).toBe("demo");
      expect((msg.root as { id: string }).id).toBe("demo");
      expect(msg.treeVersion).toBeDefined();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_stage forwards fullPage/tone/palette options", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "styled",
        root: makeTree("styled"),
        fullPage: true,
        tone: "editorial",
        palette: "vivid",
      });
      expect(result.success).toBe(true);

      const msg = await waitForMessage(
        messages,
        (m) => m.type === "aup" && m.action === "stage" && m.sceneId === "styled",
      );
      expect(msg.fullPage).toBe(true);
      expect(msg.tone).toBe("editorial");
      expect(msg.palette).toBe("vivid");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_take sends take message with sceneId and transition", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "s1",
        root: makeTree("s1"),
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "stage");

      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_take`, {
        sceneId: "s1",
        transition: "dissolve",
        duration: 500,
      });
      expect(result.success).toBe(true);

      const msg = await waitForMessage(messages, (m) => m.type === "aup" && m.action === "take");
      expect(msg.sceneId).toBe("s1");
      expect(msg.transition).toBe("dissolve");
      expect(msg.duration).toBe(500);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_take without prior stage throws error", async () => {
    const { afs, backend, ws, sessionId } = await setupWeb();
    try {
      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_take`, {
          sceneId: "nonexistent",
        }),
      ).rejects.toThrow(/not found|not staged/i);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_release sends release message to client", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      // Stage two, take one
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "live",
        root: makeTree("live"),
      });
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "spare",
        root: makeTree("spare"),
      });
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_take`, {
        sceneId: "live",
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "take");

      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_release`, {
        sceneId: "spare",
      });
      expect(result.success).toBe(true);

      const msg = await waitForMessage(messages, (m) => m.type === "aup" && m.action === "release");
      expect(msg.sceneId).toBe("spare");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("aup_release on active scene throws error", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "live",
        root: makeTree("live"),
      });
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_take`, {
        sceneId: "live",
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "take");

      await expect(
        afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_release`, {
          sceneId: "live",
        }),
      ).rejects.toThrow(/active|live/i);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("reconnect replays active scene", async () => {
    const { afs, backend, ws, messages, sessionId, sessionToken, port } = await setupWeb();
    try {
      // Stage and take
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "main",
        root: makeTree("main"),
        fullPage: true,
      });
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_take`, {
        sceneId: "main",
      });
      await waitForMessage(messages, (m) => m.type === "aup" && m.action === "take");

      // Disconnect + reconnect with same sessionId
      ws.terminate();
      // Small delay to let server process the disconnect
      await new Promise((r) => setTimeout(r, 50));
      const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
      const msgs2: Record<string, unknown>[] = [];
      // Register message handler BEFORE sending join_session so we don't miss the replay
      ws2.on("message", (data) => {
        try {
          msgs2.push(JSON.parse(String(data)));
        } catch {}
      });
      await new Promise<void>((resolve, reject) => {
        ws2.on("error", reject);
        ws2.on("open", () => {
          ws2.send(JSON.stringify({ type: "join_session", sessionId, sessionToken }));
          resolve();
        });
      });

      // Should get a stage message for the active scene on reconnect
      const replay = await waitForMessage(
        msgs2,
        (m) => m.type === "aup" && (m.action === "stage" || m.action === "render"),
        5000,
      );
      expect((replay.root as { id: string }).id).toBe("main");

      ws2.terminate();
    } finally {
      await backend.close();
    }
  });

  test("aup_render still works unchanged (backward compat)", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      const result = await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
        root: makeTree("legacy"),
      });
      expect(result.success).toBe(true);

      const msg = await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
      expect((msg.root as { id: string }).id).toBe("legacy");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("full cycle: stage → take → stage(new) → take(new)", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      // Stage scene A, take it
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "A",
        root: makeTree("A"),
      });
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_take`, {
        sceneId: "A",
      });
      await waitForMessage(
        messages,
        (m) => m.type === "aup" && m.action === "take" && m.sceneId === "A",
      );

      // Stage scene B, take it (A goes to background)
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_stage`, {
        sceneId: "B",
        root: makeTree("B"),
      });
      await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_take`, {
        sceneId: "B",
      });

      const takeB = await waitForMessage(
        messages,
        (m) => m.type === "aup" && m.action === "take" && m.sceneId === "B",
      );
      expect(takeB.sceneId).toBe("B");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
