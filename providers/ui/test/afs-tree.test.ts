/**
 * Phase 1: Tree as AFS path + subscribe rendering tests.
 *
 * Tests that the UI tree is readable/writable/subscribable via AFS paths.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, type WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

// ─── Helpers ──────────────────────────────────────────────────────

let backend: WebBackend | null = null;
let afs: AFS | null = null;
let provider: AFSUIProvider | null = null;
let serverInfo: { port: number; host: string };

async function setup() {
  afs = new AFS();
  provider = new AFSUIProvider({ backend: "web", webOptions: { port: 0 } });
  await afs.mount(provider, "/ui");
  await provider.ready();
  backend = (provider as unknown as { backend: WebBackend }).backend;
  const url = backend.url!;
  serverInfo = { port: Number.parseInt(new URL(url).port, 10), host: "127.0.0.1" };
}

afterEach(async () => {
  if (backend) {
    await backend.close();
    backend = null;
  }
  afs = null;
  provider = null;
});

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverInfo.port}`);
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_session" }));
      resolve(ws);
    });
  });
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

function afsRequest(ws: WebSocket, msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const reqId = msg.reqId as string;
    const timeout = setTimeout(() => reject(new Error("afsRequest timeout")), 5000);
    const handler = (data: unknown) => {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      if ((parsed.type === "afs_result" || parsed.type === "afs_error") && parsed.reqId === reqId) {
        clearTimeout(timeout);
        ws.off("message", handler);
        resolve(parsed);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify(msg));
  });
}

const sampleTree = {
  id: "root",
  type: "view",
  children: [
    { id: "h1", type: "text", props: { content: "Hello AFS" } },
    {
      id: "btn1",
      type: "action",
      props: { label: "Click me" },
      events: { click: { exec: "/some/action" } },
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────

describe("Tree as AFS path", () => {
  describe("read tree path", () => {
    test("returns null when no tree is rendered", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;

      const result = await afsRequest(ws, {
        type: "afs_read",
        reqId: "r1",
        path: `/ui/web/sessions/${sessionId}/tree`,
      });

      expect(result.type).toBe("afs_result");
      const data = result.data as Record<string, unknown>;
      // No tree rendered yet — content should be null
      expect(data?.content).toBeNull();

      ws.close();
    });

    test("returns current tree after aup_render", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;

      // Render a tree via the existing aup_render action
      await afs!.exec(
        `/ui/web/sessions/${sessionId}/.actions/aup_render`,
        { root: sampleTree },
        {},
      );

      const result = await afsRequest(ws, {
        type: "afs_read",
        reqId: "r2",
        path: `/ui/web/sessions/${sessionId}/tree`,
      });

      expect(result.type).toBe("afs_result");
      const data = result.data as Record<string, unknown>;
      expect(data?.content).toBeTruthy();
      const tree = data!.content as Record<string, unknown>;
      expect(tree.id).toBe("root");
      expect(tree.type).toBe("view");

      ws.close();
    });
  });

  describe("write tree path", () => {
    test("writes a valid tree and stores it", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;

      // Write tree via AFS write
      const writeResult = await afsRequest(ws, {
        type: "afs_write",
        reqId: "w1",
        path: `/ui/web/sessions/${sessionId}/tree`,
        content: sampleTree,
      });

      expect(writeResult.type).toBe("afs_result");

      // Read it back
      const readResult = await afsRequest(ws, {
        type: "afs_read",
        reqId: "r3",
        path: `/ui/web/sessions/${sessionId}/tree`,
      });

      expect(readResult.type).toBe("afs_result");
      const data = readResult.data as Record<string, unknown>;
      const tree = data!.content as Record<string, unknown>;
      expect(tree.id).toBe("root");

      ws.close();
    });

    test("rejects invalid tree (missing id)", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;

      const result = await afsRequest(ws, {
        type: "afs_write",
        reqId: "w2",
        path: `/ui/web/sessions/${sessionId}/tree`,
        content: { type: "view" }, // missing id
      });

      expect(result.type).toBe("afs_error");
      expect(typeof result.error).toBe("string");

      ws.close();
    });
  });

  describe("subscribe to tree changes", () => {
    test("receives event when tree is written via AFS", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;
      const treePath = `/ui/web/sessions/${sessionId}/tree`;

      // Subscribe to writes on the tree path
      await afsRequest(ws, {
        type: "afs_subscribe",
        reqId: "sub1",
        subId: "treeSub",
        filter: { type: "afs:write", path: treePath },
      });

      // Set up event listener before writing
      let gotEvent = false;
      const handler = (data: unknown) => {
        const parsed = JSON.parse(String(data)) as Record<string, unknown>;
        if (parsed.type === "afs_event" && parsed.subId === "treeSub") gotEvent = true;
      };
      ws.on("message", handler);

      // Write tree via AFS
      await afs!.write(`${treePath}`, { content: sampleTree });

      // Wait for event
      await new Promise((r) => setTimeout(r, 200));
      ws.off("message", handler);

      expect(gotEvent).toBe(true);

      ws.close();
    });

    test("receives event when tree is updated via aup_render action", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;
      const treePath = `/ui/web/sessions/${sessionId}/tree`;

      // Subscribe to tree writes
      await afsRequest(ws, {
        type: "afs_subscribe",
        reqId: "sub2",
        subId: "treeSub2",
        filter: { type: "afs:write", path: treePath },
      });

      let gotEvent = false;
      const handler = (data: unknown) => {
        const parsed = JSON.parse(String(data)) as Record<string, unknown>;
        if (parsed.type === "afs_event" && parsed.subId === "treeSub2") gotEvent = true;
      };
      ws.on("message", handler);

      // Render via aup_render action
      await afs!.exec(
        `/ui/web/sessions/${sessionId}/.actions/aup_render`,
        { root: sampleTree },
        {},
      );

      await new Promise((r) => setTimeout(r, 200));
      ws.off("message", handler);

      expect(gotEvent).toBe(true);

      ws.close();
    });

    test("receives event when tree is patched via aup_patch action", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;
      const treePath = `/ui/web/sessions/${sessionId}/tree`;

      // First render a tree
      await afs!.exec(
        `/ui/web/sessions/${sessionId}/.actions/aup_render`,
        { root: sampleTree },
        {},
      );

      // Subscribe
      await afsRequest(ws, {
        type: "afs_subscribe",
        reqId: "sub3",
        subId: "treeSub3",
        filter: { type: "afs:write", path: treePath },
      });

      let gotEvent = false;
      const handler = (data: unknown) => {
        const parsed = JSON.parse(String(data)) as Record<string, unknown>;
        if (parsed.type === "afs_event" && parsed.subId === "treeSub3") gotEvent = true;
      };
      ws.on("message", handler);

      // Patch the tree
      await afs!.exec(
        `/ui/web/sessions/${sessionId}/.actions/aup_patch`,
        { ops: [{ op: "update", id: "h1", props: { content: "Updated" } }] },
        {},
      );

      await new Promise((r) => setTimeout(r, 200));
      ws.off("message", handler);

      expect(gotEvent).toBe(true);

      ws.close();
    });
  });

  describe("legacy broadcast compat", () => {
    test("aup_render still broadcasts legacy aup message", async () => {
      await setup();
      const ws = await connectWs();
      const session = await nextMessage(ws);
      const sessionId = session.sessionId as string;

      let gotLegacyAup = false;
      const handler = (data: unknown) => {
        const parsed = JSON.parse(String(data)) as Record<string, unknown>;
        if (parsed.type === "aup" && parsed.action === "render") gotLegacyAup = true;
      };
      ws.on("message", handler);

      await afs!.exec(
        `/ui/web/sessions/${sessionId}/.actions/aup_render`,
        { root: sampleTree },
        {},
      );

      await new Promise((r) => setTimeout(r, 100));
      ws.off("message", handler);

      expect(gotLegacyAup).toBe(true);

      ws.close();
    });
  });
});
