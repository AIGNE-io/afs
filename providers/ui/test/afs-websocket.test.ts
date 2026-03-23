/**
 * Phase 0: AFS-over-WebSocket transport layer tests.
 *
 * Tests the browser AFS proxy — the server-side handler in WebBackend
 * that forwards afs_read/write/list/exec/stat/subscribe/unsubscribe
 * messages from WebSocket clients to the AFS instance.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

// ─── Helpers ──────────────────────────────────────────────────────

let backend: WebBackend | null = null;
let afs: AFS | null = null;
let provider: AFSUIProvider | null = null;
let serverInfo: { port: number; host: string };

async function setup() {
  afs = new AFS();

  // Mount UI provider with web backend — gives us routes to test against
  provider = new AFSUIProvider({ backend: "web", webOptions: { port: 0 } });
  await afs.mount(provider, "/ui");
  await provider.ready();

  // Extract backend and server info
  backend = (provider as unknown as { backend: WebBackend }).backend;
  const url = backend.url!;
  const port = Number.parseInt(new URL(url).port, 10);
  serverInfo = { port, host: "127.0.0.1" };
}

afterEach(async () => {
  if (backend) {
    await backend.close();
    backend = null;
  }
  afs = null;
  provider = null;
});

function wsUrl(): string {
  return `ws://127.0.0.1:${serverInfo.port}`;
}

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl());
    socket.on("error", reject);
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "join_session" }));
      resolve(socket);
    });
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    socket.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

/** Send an AFS request and wait for the matching response by reqId. */
function afsRequest(
  socket: WebSocket,
  msg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const reqId = msg.reqId as string;
    const timeout = setTimeout(() => reject(new Error("afsRequest timeout")), 5000);

    const handler = (data: unknown) => {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      if ((parsed.type === "afs_result" || parsed.type === "afs_error") && parsed.reqId === reqId) {
        clearTimeout(timeout);
        socket.off("message", handler);
        resolve(parsed);
      }
    };
    socket.on("message", handler);
    socket.send(JSON.stringify(msg));
  });
}

/** Collect N messages matching a predicate. */
function collectMessages(
  socket: WebSocket,
  count: number,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const collected: Record<string, unknown>[] = [];
    const timeout = setTimeout(
      () => reject(new Error(`collectMessages timeout: got ${collected.length}/${count}`)),
      timeoutMs,
    );
    const handler = (data: unknown) => {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      if (predicate(parsed)) {
        collected.push(parsed);
        if (collected.length >= count) {
          clearTimeout(timeout);
          socket.off("message", handler);
          resolve(collected);
        }
      }
    };
    socket.on("message", handler);
  });
}

// ─── Tests ────────────────────────────────────────────────────────

describe("AFS-over-WebSocket proxy", () => {
  describe("afs_read", () => {
    test("reads content from a mounted provider", async () => {
      await setup();
      const ws = await connectWs();
      // skip session message
      await nextMessage(ws);

      // Read UI provider's root meta — always available
      const result = await afsRequest(ws, {
        type: "afs_read",
        reqId: "r1",
        path: "/ui/.meta",
      });

      expect(result.type).toBe("afs_result");
      expect(result.reqId).toBe("r1");
      const data = result.data as Record<string, unknown>;
      expect(data).toBeTruthy();

      ws.close();
    });

    test("returns error for non-existent path", async () => {
      await setup();
      const ws = await connectWs();
      await nextMessage(ws);

      const result = await afsRequest(ws, {
        type: "afs_read",
        reqId: "r2",
        path: "/nonexistent/path/does-not-exist",
      });

      expect(result.type).toBe("afs_error");
      expect(result.reqId).toBe("r2");
      expect(typeof result.error).toBe("string");

      ws.close();
    });
  });

  describe("afs_list", () => {
    test("lists entries from a mounted provider", async () => {
      await setup();
      const ws = await connectWs();
      await nextMessage(ws);

      // List root — should include /ui
      const result = await afsRequest(ws, {
        type: "afs_list",
        reqId: "l1",
        path: "/",
      });

      expect(result.type).toBe("afs_result");
      const data = result.data as Record<string, unknown>;
      expect(data).toBeTruthy();

      ws.close();
    });
  });

  describe("afs_stat", () => {
    test("returns stat metadata", async () => {
      await setup();
      const ws = await connectWs();
      await nextMessage(ws);

      const result = await afsRequest(ws, {
        type: "afs_stat",
        reqId: "s1",
        path: "/ui",
      });

      expect(result.type).toBe("afs_result");
      expect(result.reqId).toBe("s1");
      const data = result.data as Record<string, unknown>;
      expect(data).toBeTruthy();

      ws.close();
    });
  });

  describe("afs_write", () => {
    test("writes content via AFS proxy", async () => {
      await setup();
      const ws = await connectWs();
      const sessionMsg = await nextMessage(ws);
      const sessionId = sessionMsg.sessionId as string;

      // Write a page via AFS
      const result = await afsRequest(ws, {
        type: "afs_write",
        reqId: "w1",
        path: `/ui/web/sessions/${sessionId}/pages/test-page`,
        content: "<h1>Hello</h1>",
        meta: { format: "html" },
      });

      expect(result.type).toBe("afs_result");

      ws.close();
    });
  });

  describe("afs_exec", () => {
    test("returns error for non-existent action", async () => {
      await setup();
      const ws = await connectWs();
      await nextMessage(ws);

      const result = await afsRequest(ws, {
        type: "afs_exec",
        reqId: "e1",
        path: "/ui/.actions/nonexistent",
        args: {},
      });

      expect(result.type).toBe("afs_error");
      expect(result.reqId).toBe("e1");

      ws.close();
    });
  });

  describe("afs_subscribe / afs_unsubscribe", () => {
    test("subscribe receives events", async () => {
      await setup();
      const ws = await connectWs();
      const sessionMsg = await nextMessage(ws);
      const sessionId = sessionMsg.sessionId as string;

      // Subscribe to writes on the UI session
      const subResult = await afsRequest(ws, {
        type: "afs_subscribe",
        reqId: "sub1",
        subId: "mySub",
        filter: { type: "afs:write", path: "/ui" },
      });
      expect(subResult.type).toBe("afs_result");

      // Write a page — should trigger event
      const eventPromise = collectMessages(
        ws,
        1,
        (m) => m.type === "afs_event" && m.subId === "mySub",
      );

      await afs!.write(`/ui/web/sessions/${sessionId}/pages/test-page`, {
        content: "<h1>Hello</h1>",
        meta: { format: "html" },
      });

      const events = await eventPromise;
      expect(events.length).toBe(1);
      expect(events[0]!.subId).toBe("mySub");

      ws.close();
    });

    test("unsubscribe stops events", async () => {
      await setup();
      const ws = await connectWs();
      const sessionMsg = await nextMessage(ws);
      const sessionId = sessionMsg.sessionId as string;

      // Subscribe
      await afsRequest(ws, {
        type: "afs_subscribe",
        reqId: "sub2",
        subId: "mySub2",
        filter: { type: "afs:write", path: "/ui" },
      });

      // Unsubscribe
      const unsubResult = await afsRequest(ws, {
        type: "afs_unsubscribe",
        reqId: "unsub2",
        subId: "mySub2",
      });
      expect(unsubResult.type).toBe("afs_result");

      // Write — should NOT trigger event
      await afs!.write(`/ui/web/sessions/${sessionId}/pages/test-page2`, {
        content: "<h1>No event</h1>",
        meta: { format: "html" },
      });

      // Wait briefly — no event should arrive
      let gotEvent = false;
      const handler = (data: unknown) => {
        const parsed = JSON.parse(String(data)) as Record<string, unknown>;
        if (parsed.type === "afs_event" && parsed.subId === "mySub2") gotEvent = true;
      };
      ws.on("message", handler);
      await new Promise((r) => setTimeout(r, 300));
      ws.off("message", handler);

      expect(gotEvent).toBe(false);

      ws.close();
    });
  });

  describe("concurrent requests", () => {
    test("multiple requests resolve independently", async () => {
      await setup();
      const ws = await connectWs();
      await nextMessage(ws);

      // Fire 3 requests in parallel
      const [r1, r2, r3] = await Promise.all([
        afsRequest(ws, { type: "afs_read", reqId: "c1", path: "/ui/.meta" }),
        afsRequest(ws, { type: "afs_list", reqId: "c2", path: "/" }),
        afsRequest(ws, { type: "afs_stat", reqId: "c3", path: "/ui" }),
      ]);

      expect(r1.reqId).toBe("c1");
      expect(r1.type).toBe("afs_result");
      expect(r2.reqId).toBe("c2");
      expect(r2.type).toBe("afs_result");
      expect(r3.reqId).toBe("c3");
      expect(r3.type).toBe("afs_result");

      ws.close();
    });
  });

  describe("cleanup on disconnect", () => {
    test("subscriptions are cleaned up when client disconnects", async () => {
      await setup();
      const ws = await connectWs();
      const sessionMsg = await nextMessage(ws);
      const sessionId = sessionMsg.sessionId as string;

      // Subscribe
      await afsRequest(ws, {
        type: "afs_subscribe",
        reqId: "sub3",
        subId: "mySub3",
        filter: { type: "afs:write", path: "/ui" },
      });

      // Close the connection
      ws.close();
      await new Promise((r) => setTimeout(r, 100));

      // Write — subscription should have been cleaned up,
      // no error from trying to send to closed socket
      await afs!.write(`/ui/web/sessions/${sessionId}/pages/cleanup-test`, {
        content: "after disconnect",
        meta: { format: "html" },
      });

      // If we get here without error, cleanup worked
      expect(true).toBe(true);
    });
  });

  describe("error handling", () => {
    test("missing reqId is handled gracefully", async () => {
      await setup();
      const ws = await connectWs();
      await nextMessage(ws);

      // Send without reqId — server should ignore
      ws.send(JSON.stringify({ type: "afs_read", path: "/ui/.meta" }));

      // Should not crash — verify with a subsequent valid request
      const result = await afsRequest(ws, {
        type: "afs_read",
        reqId: "after-bad",
        path: "/ui/.meta",
      });
      expect(result.type).toBe("afs_result");

      ws.close();
    });

    test("AFS proxy is unavailable when no AFS mounted", async () => {
      // Create a standalone WebBackend without AFS
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();

      const ws = await connectWs();

      const result = await afsRequest(ws, {
        type: "afs_read",
        reqId: "no-afs",
        path: "/ui/.meta",
      });

      expect(result.type).toBe("afs_error");
      expect(typeof result.error).toBe("string");

      ws.close();
      await backend.close();
      backend = null;
    });
  });
});
