/**
 * Live Channels — public AUP projection surfaces.
 *
 * Tests: channel tree read/write, multi-viewer broadcast, late-joiner snapshot,
 * AUP render/patch actions, channel listing, session isolation.
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

/** Connect as a private session client */
function connectSession(): Promise<{ ws: WebSocket; sessionId: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverInfo.port}`);
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_session" }));
      ws.once("message", (data) => {
        const msg = JSON.parse(data.toString());
        resolve({ ws, sessionId: msg.sessionId });
      });
    });
  });
}

/** Connect as a live channel viewer */
function connectChannel(channelId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverInfo.port}`);
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_channel", channelId }));
      ws.once("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "channel") resolve(ws);
        else reject(new Error(`Expected channel ack, got: ${msg.type}`));
      });
    });
  });
}

function nextMessage(
  ws: WebSocket,
  predicate?: (msg: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("nextMessage timeout")), 5000);
    const handler = (data: unknown) => {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      if (!predicate || predicate(parsed)) {
        clearTimeout(timeout);
        ws.off("message", handler);
        resolve(parsed);
      }
    };
    ws.on("message", handler);
  });
}

const sampleTree = {
  id: "root",
  type: "view",
  children: [{ id: "h1", type: "text", props: { content: "Hello Live" } }],
};

// ─── Tests ────────────────────────────────────────────────────────

describe("Live Channels", () => {
  describe("channel tree read/write via AFS", () => {
    test("write to channel tree and read back", async () => {
      await setup();
      await afs!.write("/ui/web/live/dashboard/tree", { content: sampleTree });
      const result = await afs!.read("/ui/web/live/dashboard/tree");
      const content = result.data?.content as Record<string, unknown>;
      expect(content).toBeTruthy();
      expect(content.id).toBe("root");
    });

    test("read channel tree returns null when no tree rendered", async () => {
      await setup();
      const result = await afs!.read("/ui/web/live/empty-channel/tree");
      expect(result.data?.content).toBeNull();
    });
  });

  describe("aup_render action → broadcast to viewers", () => {
    test("render broadcasts AUP to connected channel viewer", async () => {
      await setup();
      const ws = await connectChannel("demo");

      try {
        const msgPromise = nextMessage(ws, (m) => m.type === "aup");

        await afs!.exec("/ui/web/live/demo/.actions/aup_render", { root: sampleTree });

        const msg = await msgPromise;
        expect(msg.type).toBe("aup");
        expect(msg.action).toBe("render");
        expect((msg.root as Record<string, unknown>).id).toBe("root");
        expect(msg.fullPage).toBe(true);
      } finally {
        ws.terminate();
      }
    });

    test("render broadcasts to multiple viewers", async () => {
      await setup();
      const ws1 = await connectChannel("multi");
      const ws2 = await connectChannel("multi");

      try {
        const p1 = nextMessage(ws1, (m) => m.type === "aup");
        const p2 = nextMessage(ws2, (m) => m.type === "aup");

        await afs!.exec("/ui/web/live/multi/.actions/aup_render", { root: sampleTree });

        const [msg1, msg2] = await Promise.all([p1, p2]);
        expect(msg1.type).toBe("aup");
        expect(msg2.type).toBe("aup");
        expect((msg1.root as Record<string, unknown>).id).toBe("root");
        expect((msg2.root as Record<string, unknown>).id).toBe("root");
      } finally {
        ws1.terminate();
        ws2.terminate();
      }
    });
  });

  describe("aup_patch action → broadcast patch to viewers", () => {
    test("patch broadcasts to channel viewers", async () => {
      await setup();
      const ws = await connectChannel("patch-test");

      try {
        // Render first
        await afs!.exec("/ui/web/live/patch-test/.actions/aup_render", { root: sampleTree });
        // Drain the render message
        await nextMessage(ws, (m) => m.type === "aup" && m.action === "render");

        // Now patch
        const patchPromise = nextMessage(ws, (m) => m.type === "aup" && m.action === "patch");
        await afs!.exec("/ui/web/live/patch-test/.actions/aup_patch", {
          ops: [{ op: "update", id: "h1", props: { content: "Updated" } }],
        });

        const msg = await patchPromise;
        expect(msg.action).toBe("patch");
        expect(msg.ops).toBeDefined();
      } finally {
        ws.terminate();
      }
    });
  });

  describe("late joiner receives snapshot", () => {
    test("new viewer receives current tree on join", async () => {
      await setup();

      // Render to channel before anyone joins
      await afs!.exec("/ui/web/live/late/.actions/aup_render", { root: sampleTree });

      // Now join — should receive snapshot
      const ws = await connectChannel("late");
      try {
        const msg = await nextMessage(ws, (m) => m.type === "aup");
        expect(msg.action).toBe("render");
        expect((msg.root as Record<string, unknown>).id).toBe("root");
        expect(msg.fullPage).toBe(true);
      } finally {
        ws.terminate();
      }
    });
  });

  describe("channel listing", () => {
    test("list channels returns active channels", async () => {
      await setup();
      // Create channels by rendering
      await afs!.exec("/ui/web/live/ch1/.actions/aup_render", { root: sampleTree });
      await afs!.exec("/ui/web/live/ch2/.actions/aup_render", { root: sampleTree });

      const result = await afs!.list("/ui/web/live");
      const ids = result.data?.map((e) => e.id).sort();
      expect(ids).toContain("ch1");
      expect(ids).toContain("ch2");
    });

    test("read live directory reports channel count", async () => {
      await setup();
      await afs!.exec("/ui/web/live/x/.actions/aup_render", { root: sampleTree });
      const result = await afs!.read("/ui/web/live");
      expect(result.data?.content).toContain("1 active");
    });

    test("endpoint list includes live directory", async () => {
      await setup();
      const result = await afs!.list("/ui/web");
      const ids = result.data?.map((e) => e.id);
      expect(ids).toContain("sessions");
      expect(ids).toContain("live");
    });
  });

  describe("session isolation", () => {
    test("channel render does NOT affect private session", async () => {
      await setup();
      const { ws: sessionWs } = await connectSession();

      try {
        // Set up listener on session for any AUP messages
        let gotAup = false;
        const handler = (data: unknown) => {
          const parsed = JSON.parse(String(data)) as Record<string, unknown>;
          if (parsed.type === "aup") gotAup = true;
        };
        sessionWs.on("message", handler);

        // Render to live channel
        await afs!.exec("/ui/web/live/isolated/.actions/aup_render", { root: sampleTree });

        // Wait briefly
        await new Promise((r) => setTimeout(r, 200));
        sessionWs.off("message", handler);

        expect(gotAup).toBe(false);
      } finally {
        sessionWs.terminate();
      }
    });

    test("session render does NOT affect channel viewers", async () => {
      await setup();
      const { ws: sessionWs, sessionId } = await connectSession();
      const channelWs = await connectChannel("no-leak");

      try {
        let gotAup = false;
        const handler = (data: unknown) => {
          const parsed = JSON.parse(String(data)) as Record<string, unknown>;
          if (parsed.type === "aup") gotAup = true;
        };
        channelWs.on("message", handler);

        // Render to session
        await afs!.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, { root: sampleTree });

        await new Promise((r) => setTimeout(r, 200));
        channelWs.off("message", handler);

        expect(gotAup).toBe(false);
      } finally {
        sessionWs.terminate();
        channelWs.terminate();
      }
    });
  });

  describe("channel actions listing", () => {
    test("list channel actions returns aup_render and aup_patch", async () => {
      await setup();
      const result = await afs!.list("/ui/web/live/demo/.actions");
      const ids = result.data?.map((e) => e.id);
      expect(ids).toContain("aup_render");
      expect(ids).toContain("aup_patch");
    });
  });

  describe("error handling", () => {
    test("aup_render without root throws", async () => {
      await setup();
      await expect(afs!.exec("/ui/web/live/err/.actions/aup_render", {})).rejects.toThrow("root");
    });

    test("aup_patch without ops throws", async () => {
      await setup();
      await expect(afs!.exec("/ui/web/live/err/.actions/aup_patch", {})).rejects.toThrow("ops");
    });

    test("write invalid tree to channel throws", async () => {
      await setup();
      await expect(
        afs!.write("/ui/web/live/err/tree", { content: { type: "view" } }), // missing id
      ).rejects.toThrow();
    });

    test("live routes on non-web endpoint throw 404", async () => {
      // Provider is web-only, so this is tested by trying to access /tty/live
      // Since our provider is "web" type, we just check the guard works
      await setup();
      await expect(afs!.list("/ui/tty/live")).rejects.toThrow();
    });
  });

  describe("viewer disconnect cleanup", () => {
    test("no error when sending to channel after viewer disconnects", async () => {
      await setup();
      const ws = await connectChannel("cleanup");

      // Disconnect
      ws.terminate();
      await new Promise((r) => setTimeout(r, 100));

      // Render should not throw
      await afs!.exec("/ui/web/live/cleanup/.actions/aup_render", { root: sampleTree });
    });
  });
});
