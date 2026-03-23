/**
 * AUP Caller Flow — End-to-end test: caller identity from WebBackend
 * reaches afs.exec() context as userId/sessionId.
 *
 * Uses injectConnection() with mock UiConnection to avoid real WebSocket.
 */
import { describe, expect, test } from "bun:test";
import type { AFSEntry, AFSExecResult } from "@aigne/afs";
import { AFS } from "@aigne/afs";
import type { RouteContext } from "@aigne/afs/provider";
import { Actions, AFSBaseProvider, Exec, List, Read } from "@aigne/afs/provider";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";
import type { UiConnection } from "../src/ui-transport.js";

/* ─── Mock provider that captures exec context ──────────── */

class ContextCapturingProvider extends AFSBaseProvider {
  readonly name = "data";
  readonly accessMode = "readwrite" as const;
  execContexts: Array<Record<string, unknown>> = [];

  @Read("/")
  async readRoot(): Promise<AFSEntry> {
    return this.buildEntry("/", { content: "root", meta: { childrenCount: 1 } });
  }

  @List("/")
  async listRoot(): Promise<{ data: AFSEntry[] }> {
    return { data: [this.buildEntry("/items", { meta: { childrenCount: 0 } })] };
  }

  @Actions("/items")
  async listItemActions(): Promise<{ data: AFSEntry[] }> {
    return {
      data: [
        this.buildEntry("/items/.actions/act", {
          meta: { kind: "action", description: "Test action" },
        }),
      ],
    };
  }

  @Exec("/items/.actions/act")
  async execAct(ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const options = ctx.options as { context?: Record<string, unknown> } | undefined;
    this.execContexts.push({ ...(options?.context ?? {}) });
    return { success: true, data: { ok: true, args } };
  }
}

/* ─── Mock UiConnection ─────────────────────────────────── */

function createMockConn(): UiConnection & {
  sentMessages: Record<string, unknown>[];
  simulateMessage(msg: Record<string, unknown>): void;
  simulateClose(): void;
} {
  let msgHandler: ((msg: string) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  let open = true;

  const conn = {
    sentMessages: [] as Record<string, unknown>[],
    get isOpen() {
      return open;
    },
    send(msg: string) {
      try {
        conn.sentMessages.push(JSON.parse(msg));
      } catch {}
    },
    onMessage(cb: (msg: string) => void) {
      msgHandler = cb;
    },
    onClose(cb: () => void) {
      closeHandler = cb;
    },
    close() {
      open = false;
      closeHandler?.();
    },
    simulateMessage(msg: Record<string, unknown>) {
      msgHandler?.(JSON.stringify(msg));
    },
    simulateClose() {
      open = false;
      closeHandler?.();
    },
  };
  return conn;
}

/* ─── Helpers ────────────────────────────────────────────── */

function waitFor<T>(check: () => T | null | undefined, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const result = check();
      if (result != null) return resolve(result);
      if (Date.now() > deadline) return reject(new Error("waitFor timeout"));
      setTimeout(poll, 10);
    };
    poll();
  });
}

async function setup(callerHeaders: Record<string, string | undefined> = {}) {
  const backend = new WebBackend({
    port: 0,
    inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
  });
  const uiProvider = new AFSUIProvider({ backend });
  const dataProvider = new ContextCapturingProvider();
  const afs = new AFS();
  await afs.mount(dataProvider, "/data");
  await afs.mount(uiProvider, "/ui");

  const conn = createMockConn();
  backend.injectConnection(conn, callerHeaders);

  // Complete handshake
  conn.simulateMessage({ type: "join_session" });

  // Wait for session assignment
  const sessionMsg = (await waitFor(() => conn.sentMessages.find((m) => m.type === "session"))) as {
    sessionId: string;
  };

  return { afs, backend, conn, uiProvider, dataProvider, sessionId: sessionMsg.sessionId };
}

async function renderTree(afs: AFS, sessionId: string, root: Record<string, unknown>) {
  await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, { root });
  // Give time for render to propagate internally
  await new Promise((r) => setTimeout(r, 50));
}

/* ─── Tests ──────────────────────────────────────────────── */

describe("AUP Caller → exec context", () => {
  test("authenticated caller → exec context has userId", async () => {
    const { afs, backend, conn, dataProvider, sessionId } = await setup({
      "x-caller-did": "did:abt:z1authUser",
      "x-caller-pk": "pkAuth",
    });

    try {
      await renderTree(afs, sessionId, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/data/items/.actions/act", args: { v: 1 } } },
          },
        ],
      });

      // Send AUP event
      conn.simulateMessage({ type: "aup_event", nodeId: "btn", event: "click" });

      // Wait for aup_event_result (success or error)
      const result = await waitFor(() =>
        conn.sentMessages.find((m) => m.type === "aup_event_result"),
      );

      // Should succeed, not error
      expect(result.error).toBeUndefined();
      expect(dataProvider.execContexts).toHaveLength(1);
      const ctx = dataProvider.execContexts[0]!;
      expect(ctx.userId).toBe("did:abt:z1authUser");
      expect(ctx.sessionId).toBe(sessionId);
    } finally {
      await backend.close();
    }
  });

  test("anonymous caller → exec context has no userId", async () => {
    const { afs, backend, conn, dataProvider, sessionId } = await setup({});

    try {
      await renderTree(afs, sessionId, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/data/items/.actions/act" } },
          },
        ],
      });

      conn.simulateMessage({ type: "aup_event", nodeId: "btn", event: "click" });

      const result = await waitFor(() =>
        conn.sentMessages.find((m) => m.type === "aup_event_result"),
      );

      expect(result.error).toBeUndefined();
      expect(dataProvider.execContexts).toHaveLength(1);
      const ctx = dataProvider.execContexts[0]!;
      expect(ctx.userId).toBeUndefined();
      expect(ctx.sessionId).toBe(sessionId);
    } finally {
      await backend.close();
    }
  });

  test("sessionId is always passed to exec context", async () => {
    const { afs, backend, conn, dataProvider, sessionId } = await setup({
      "x-caller-did": "did:abt:z1test",
    });

    try {
      await renderTree(afs, sessionId, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/data/items/.actions/act" } },
          },
        ],
      });

      conn.simulateMessage({ type: "aup_event", nodeId: "btn", event: "click" });

      const result = await waitFor(() =>
        conn.sentMessages.find((m) => m.type === "aup_event_result"),
      );

      expect(result.error).toBeUndefined();
      const ctx = dataProvider.execContexts[0]!;
      expect(typeof ctx.sessionId).toBe("string");
      expect((ctx.sessionId as string).length).toBeGreaterThan(0);
    } finally {
      await backend.close();
    }
  });
});
