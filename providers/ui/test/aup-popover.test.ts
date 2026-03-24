/**
 * AUP Popover Overlay — Tests for overlay with mode: "popover".
 * Popover is positioned relative to an anchor node, supports light dismiss.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";
import { createMessageCollector } from "./helpers/message-collector.js";

/* ─── helpers ──────────────────────────────────────────── */

let _assertNoBadMessages: (() => void) | null = null;
afterEach(() => {
  _assertNoBadMessages?.();
  _assertNoBadMessages = null;
});

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
  return { afs, backend, ws, messages, sessionId: sessionMsg.sessionId, provider };
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

async function renderTree(
  afs: AFS,
  sessionId: string,
  messages: Record<string, unknown>[],
  root: Record<string, unknown>,
) {
  await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, { root });
  await waitForMessage(messages, (m) => m.type === "aup" && m.action === "render");
}

/* ─── Popover Tests ──────────────────────────────────────── */

describe("AUP Popover Overlay", () => {
  test("popover renders with state.open: true", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          { id: "trigger", type: "action", props: { label: "Menu" } },
          {
            id: "pop1",
            type: "overlay",
            props: { mode: "popover", anchor: "trigger" },
            state: { open: true },
            children: [
              { id: "opt1", type: "action", props: { label: "Option 1" } },
              { id: "opt2", type: "action", props: { label: "Option 2" } },
            ],
          },
        ],
      });

      const renderMsg = messages.find((m) => m.type === "aup" && m.action === "render");
      expect(renderMsg).toBeDefined();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("popover with anchor prop stores correctly", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          { id: "btn1", type: "action", props: { label: "Click" } },
          {
            id: "pop1",
            type: "overlay",
            props: { mode: "popover", anchor: "btn1", position: "bottom" },
            state: { open: false },
          },
        ],
      });

      const readResult = await afs.read(`/ui/web/sessions/${sessionId}/tree`);
      const tree = readResult.data?.content as Record<string, unknown>;
      const children = tree.children as Array<Record<string, unknown>>;
      const popover = children[1]!;
      const props = popover.props as Record<string, unknown>;
      expect(props.mode).toBe("popover");
      expect(props.anchor).toBe("btn1");
      expect(props.position).toBe("bottom");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("popover children render inside content area", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "pop1",
            type: "overlay",
            props: { mode: "popover", anchor: "root" },
            state: { open: true },
            children: [
              { id: "item1", type: "text", props: { content: "Item 1" } },
              { id: "item2", type: "text", props: { content: "Item 2" } },
            ],
          },
        ],
      });

      const readResult = await afs.read(`/ui/web/sessions/${sessionId}/tree`);
      const tree = readResult.data?.content as Record<string, unknown>;
      const children = tree.children as Array<Record<string, unknown>>;
      const popover = children[0]!;
      const popChildren = popover.children as Array<Record<string, unknown>>;
      expect(popChildren).toHaveLength(2);
      expect(popChildren[0]!.id).toBe("item1");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("popover dismiss event resolves correctly", async () => {
    const { afs, backend, ws, messages, sessionId, provider } = await setupWeb();
    try {
      // Dismiss events on overlays may not have an explicit exec config
      // They fire as synthetic events via onAupEvent
      let receivedEvent: string | null = null;
      provider.onAupEvent = async (_sid, nodeId, evt, _cfg) => {
        receivedEvent = evt;
        return { dismissed: true, nodeId };
      };

      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "pop1",
            type: "overlay",
            props: { mode: "popover", anchor: "root" },
            state: { open: true },
          },
        ],
      });

      // Simulate dismiss event from client
      const before = messages.length;
      ws.send(JSON.stringify({ type: "aup_event", nodeId: "pop1", event: "dismiss" }));
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const deadline = Date.now() + 2000;
        const check = () => {
          const found = messages
            .slice(before)
            .find((m) => m.type === "aup_event_result" && m.nodeId === "pop1");
          if (found) return resolve(found);
          if (Date.now() > deadline) return reject(new Error("Timeout"));
          setTimeout(check, 10);
        };
        check();
      });

      expect(result.error).toBeUndefined();
      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent!).toBe("dismiss");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });

  test("existing overlay modes still work (toast)", async () => {
    const { afs, backend, ws, messages, sessionId } = await setupWeb();
    try {
      await renderTree(afs, sessionId, messages, {
        id: "root",
        type: "view",
        children: [
          {
            id: "toast1",
            type: "overlay",
            props: { mode: "toast", title: "Saved!", intent: "success" },
            state: { open: true },
          },
        ],
      });

      const renderMsg = messages.find((m) => m.type === "aup" && m.action === "render");
      expect(renderMsg).toBeDefined();
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});
