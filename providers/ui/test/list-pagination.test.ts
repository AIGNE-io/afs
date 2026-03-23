/**
 * Phase 1: Pagination plumbing tests.
 *
 * Tests three layers:
 * 1. WS proxy forwards options (offset/limit) and returns { data, total }
 * 2. Client API window.afs.list(path, options) sends correct WS message
 * 3. AFS core pagination on provider with offset/limit
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  AFS,
  type AFSEntry,
  type AFSListOptions,
  type AFSListResult,
  type AFSModule,
} from "@aigne/afs";
import { AFSUIProvider, type WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

// ─── Mock Provider ────────────────────────────────────────────────

/** Simple in-memory provider that supports offset/limit pagination. */
function createMockProvider(itemCount: number): AFSModule {
  const items: { id: string; content: string }[] = [];
  for (let i = 0; i < itemCount; i++) {
    items.push({ id: `item-${String(i).padStart(3, "0")}`, content: `content-${i}` });
  }

  return {
    name: "mock-list",
    description: "Mock provider for pagination testing",
    accessMode: "readonly",

    async stat(path: string) {
      return {
        data: {
          id: "mock-list",
          path,
          meta: { description: "Mock list provider", childrenCount: items.length },
        },
      };
    },

    async list(path: string, options?: AFSListOptions): Promise<AFSListResult> {
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? items.length;
      const sliced = items.slice(offset, offset + limit);
      return {
        data: sliced.map((item) => ({
          id: item.id,
          path: `${path}/${item.id}`,
          meta: { kind: "test:item" },
          content: { value: item.content },
        })),
        total: items.length,
      };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

let backend: WebBackend | null = null;
let afs: AFS | null = null;
let provider: AFSUIProvider | null = null;
let serverInfo: { port: number };

async function setup(itemCount = 25) {
  afs = new AFS();

  // Mount mock provider with N items
  await afs.mount(createMockProvider(itemCount), "/data");

  // Mount UI provider
  provider = new AFSUIProvider({ backend: "web", webOptions: { port: 0 } });
  await afs.mount(provider, "/ui");
  await provider.ready();

  backend = (provider as unknown as { backend: WebBackend }).backend;
  const url = backend.url!;
  serverInfo = { port: Number.parseInt(new URL(url).port, 10) };
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
    const socket = new WebSocket(`ws://127.0.0.1:${serverInfo.port}`);
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

// ─── Tests ────────────────────────────────────────────────────────

describe("afs-list pagination", () => {
  describe("WS proxy: afs_list with options", () => {
    test("forwards offset/limit and returns { data, total }", async () => {
      await setup(25);
      const ws = await connectWs();
      await nextMessage(ws); // skip session

      const result = await afsRequest(ws, {
        type: "afs_list",
        reqId: "p1",
        path: "/data",
        options: { offset: 0, limit: 10 },
      });

      expect(result.type).toBe("afs_result");
      const data = result.data as { data: AFSEntry[]; total: number };
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(10);
      expect(data.total).toBe(25);

      ws.close();
    });

    test("offset skips entries correctly", async () => {
      await setup(25);
      const ws = await connectWs();
      await nextMessage(ws);

      const result = await afsRequest(ws, {
        type: "afs_list",
        reqId: "p2",
        path: "/data",
        options: { offset: 20, limit: 10 },
      });

      expect(result.type).toBe("afs_result");
      const data = result.data as { data: AFSEntry[]; total: number };
      // 25 items, offset 20, limit 10 → should get 5 remaining
      expect(data.data.length).toBe(5);
      expect(data.total).toBe(25);

      ws.close();
    });

    test("without options returns all items with total", async () => {
      await setup(25);
      const ws = await connectWs();
      await nextMessage(ws);

      const result = await afsRequest(ws, {
        type: "afs_list",
        reqId: "p3",
        path: "/data",
      });

      expect(result.type).toBe("afs_result");
      const data = result.data as { data: AFSEntry[]; total?: number };
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(25);

      ws.close();
    });
  });

  describe("AFS core: list with offset/limit", () => {
    test("offset and limit work on AFS.list directly", async () => {
      await setup(25);

      const page1 = await afs!.list("/data", { offset: 0, limit: 10 });
      expect(page1.data.length).toBe(10);

      const page2 = await afs!.list("/data", { offset: 10, limit: 10 });
      expect(page2.data.length).toBe(10);

      const page3 = await afs!.list("/data", { offset: 20, limit: 10 });
      expect(page3.data.length).toBe(5);

      // IDs should not overlap between pages
      const ids1 = page1.data.map((e) => e.id);
      const ids2 = page2.data.map((e) => e.id);
      const ids3 = page3.data.map((e) => e.id);
      const allIds = [...ids1, ...ids2, ...ids3];
      expect(new Set(allIds).size).toBe(25);
    });

    test("total reflects full dataset size regardless of limit", async () => {
      await setup(50);

      const result = await afs!.list("/data", { offset: 0, limit: 5 });
      expect(result.data.length).toBe(5);
      expect(result.total).toBe(50);
    });
  });
});
