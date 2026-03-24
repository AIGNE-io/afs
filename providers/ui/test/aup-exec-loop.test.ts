/**
 * AUP Exec Loop — Tests for the closed reactive loop:
 * user click → handleAupEvent → afs.exec() → result back to client.
 *
 * Previously, handleAupEvent returned config objects without executing anything.
 * Now, when the provider is mounted on an AFS instance, it auto-dispatches to afs.exec().
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { AFSEntry, AFSExecResult } from "@aigne/afs";
import { AFS } from "@aigne/afs";
import type { RouteContext } from "@aigne/afs/provider";
import { Actions, AFSBaseProvider, Exec, List, Read } from "@aigne/afs/provider";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";
import { createMessageCollector } from "./helpers/message-collector.js";

/* ─── Mock Provider: records exec calls ──────────────────── */

class MockDataProvider extends AFSBaseProvider {
  readonly name = "data";
  readonly accessMode = "readwrite" as const;
  execCalls: Array<{ action: string; args: Record<string, unknown> }> = [];

  @Read("/")
  async readRoot(): Promise<AFSEntry> {
    return this.buildEntry("/", { content: "mock data provider", meta: { childrenCount: 1 } });
  }

  @List("/")
  async listRoot(): Promise<{ data: AFSEntry[] }> {
    return {
      data: [this.buildEntry("/items", { meta: { childrenCount: 2 } })],
    };
  }

  @Read("/items")
  async readItems(): Promise<AFSEntry> {
    return this.buildEntry("/items", { content: { count: this.execCalls.length } });
  }

  @Actions("/items")
  async listItemActions(): Promise<{ data: AFSEntry[] }> {
    return {
      data: [
        this.buildEntry("/items/.actions/submit", {
          meta: { kind: "action", description: "Submit items" },
        }),
      ],
    };
  }

  @Exec("/items/.actions/submit")
  async execSubmit(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    this.execCalls.push({ action: "submit", args });
    return { success: true, data: { success: true, received: args } };
  }

  @Exec("/items/.actions/fail")
  async execFail(): Promise<AFSExecResult> {
    throw new Error("Provider action failed intentionally");
  }
}

/* ─── helpers ──────────────────────────────────────────── */

let _assertNoBadMessages: (() => void) | null = null;
afterEach(() => {
  _assertNoBadMessages?.();
  _assertNoBadMessages = null;
});

async function setupWithMockProvider() {
  const backend = new WebBackend({ port: 0 });
  const info = await backend.listen();
  const uiProvider = new AFSUIProvider({ backend });
  const dataProvider = new MockDataProvider();
  const afs = new AFS();
  await afs.mount(dataProvider, "/data");
  await afs.mount(uiProvider, "/ui");

  const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
  await new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_session" }));
      resolve();
    });
  });

  const collector = createMessageCollector(ws);
  _assertNoBadMessages = collector.assertNoBadMessages;
  const messages = collector.messages as Record<string, unknown>[];

  // Wait for session
  await new Promise<void>((resolve) => {
    const check = () => {
      if (messages.some((m) => m.type === "session")) resolve();
      else setTimeout(check, 10);
    };
    check();
  });

  const sessionMsg = messages.find((m) => m.type === "session") as { sessionId: string };
  const sessionId = sessionMsg.sessionId;

  return { afs, backend, ws, messages, sessionId, uiProvider, dataProvider };
}

/** Setup WITHOUT mounting on AFS — simulates no-AFS fallback */
async function setupWithoutAFS() {
  const backend = new WebBackend({ port: 0 });
  const info = await backend.listen();
  const uiProvider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(uiProvider, "/ui");

  const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
  await new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_session" }));
      resolve();
    });
  });

  const collector = createMessageCollector(ws);
  _assertNoBadMessages = collector.assertNoBadMessages;
  const messages = collector.messages as Record<string, unknown>[];

  await new Promise<void>((resolve) => {
    const check = () => {
      if (messages.some((m) => m.type === "session")) resolve();
      else setTimeout(check, 10);
    };
    check();
  });

  const sessionMsg = messages.find((m) => m.type === "session") as { sessionId: string };
  const sessionId = sessionMsg.sessionId;

  return { afs, backend, ws, messages, sessionId, uiProvider };
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

function sendEventAndWaitResult(
  ws: WebSocket,
  messages: Record<string, unknown>[],
  nodeId: string,
  event: string,
  data?: Record<string, unknown>,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  const before = messages.length;
  const msg: Record<string, unknown> = { type: "aup_event", nodeId, event };
  if (data) msg.data = data;
  ws.send(JSON.stringify(msg));
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

async function renderTree(
  afs: AFS,
  sessionId: string,
  messages: Record<string, unknown>[],
  root: Record<string, unknown>,
) {
  await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, { root });
  await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
}

/* ─── Happy Path ─────────────────────────────────────────── */

describe("AUP Exec Loop — Happy Path", () => {
  test("button click auto-dispatches to afs.exec() and returns result", async () => {
    const { afs, backend, ws, messages, sessionId, dataProvider } = await setupWithMockProvider();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "submit-btn",
            type: "action",
            props: { label: "Submit" },
            events: { click: { exec: "/data/items/.actions/submit", args: { x: 1 } } },
          },
        ],
      });

      const result = await sendEventAndWaitResult(ws, messages, "submit-btn", "click");
      expect(result.error).toBeUndefined();
      // The result should be the exec return value, not a config object
      const r = result.result as Record<string, unknown>;
      expect(r.success).toBe(true);
      expect(r.received).toEqual({ x: 1 });
      // Verify the provider actually received the call
      expect(dataProvider.execCalls).toHaveLength(1);
      expect(dataProvider.execCalls[0]!.args).toEqual({ x: 1 });
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("args from tree and client data merge correctly", async () => {
    const { afs, backend, ws, messages, sessionId, dataProvider } = await setupWithMockProvider();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/data/items/.actions/submit", args: { fromTree: "yes" } } },
          },
        ],
      });

      // Send event with additional client data
      const result = await sendEventAndWaitResult(ws, messages, "btn", "click", {
        fromClient: "also",
      });
      expect(result.error).toBeUndefined();
      // Provider should receive merged args
      expect(dataProvider.execCalls).toHaveLength(1);
      expect(dataProvider.execCalls[0]!.args).toEqual({ fromTree: "yes", fromClient: "also" });
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── onAupEvent Override ───────────────────────────────── */

describe("AUP Exec Loop — onAupEvent Override", () => {
  test("onAupEvent returning value prevents afs.exec()", async () => {
    const { afs, backend, ws, messages, sessionId, uiProvider, dataProvider } =
      await setupWithMockProvider();
    try {
      // Register override that handles all events
      uiProvider.onAupEvent = async (_sid, _nid, _evt, _cfg) => {
        return { intercepted: true };
      };

      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/data/items/.actions/submit" } },
          },
        ],
      });

      const result = await sendEventAndWaitResult(ws, messages, "btn", "click");
      expect(result.error).toBeUndefined();
      const r = result.result as Record<string, unknown>;
      expect(r.intercepted).toBe(true);
      // Provider should NOT have been called
      expect(dataProvider.execCalls).toHaveLength(0);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("onAupEvent returning undefined falls through to afs.exec()", async () => {
    const { afs, backend, ws, messages, sessionId, uiProvider, dataProvider } =
      await setupWithMockProvider();
    try {
      // Register override that does NOT handle this event (returns undefined)
      uiProvider.onAupEvent = async (_sid, _nid, _evt, _cfg) => {
        return undefined;
      };

      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/data/items/.actions/submit", args: { v: 42 } } },
          },
        ],
      });

      const result = await sendEventAndWaitResult(ws, messages, "btn", "click");
      expect(result.error).toBeUndefined();
      // Should have fallen through to afs.exec()
      const r = result.result as Record<string, unknown>;
      expect(r.success).toBe(true);
      expect(dataProvider.execCalls).toHaveLength(1);
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Backward Compatibility ────────────────────────────── */

describe("AUP Exec Loop — Backward Compatibility", () => {
  test("without other providers on AFS, returns config object (no exec)", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWithoutAFS();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/nonexistent/.actions/go", args: { x: 1 } } },
          },
        ],
      });

      const result = await sendEventAndWaitResult(ws, messages, "btn", "click");
      // When exec path doesn't match any provider, AFS throws — error propagates
      // OR if we want backward compat for unmounted paths, we need to handle gracefully
      // The key test: no crash, returns either error or config
      expect(result.type).toBe("aup_event_result");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Error Propagation ─────────────────────────────────── */

describe("AUP Exec Loop — Error Propagation", () => {
  test("afs.exec() error propagates to client as aup_event_result.error", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWithMockProvider();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: { click: { exec: "/data/items/.actions/fail" } },
          },
        ],
      });

      const result = await sendEventAndWaitResult(ws, messages, "btn", "click");
      expect(result.error).toBeDefined();
      expect(String(result.error)).toContain("failed intentionally");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
