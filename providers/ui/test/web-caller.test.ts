/**
 * WebBackend caller identity tests.
 *
 * Verifies that x-caller-did / x-caller-pk headers injected via
 * injectConnection() are stored per-connection and forwarded to
 * the aupEventHandler callback.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { UiConnection } from "../src/ui-transport.js";
import { WebBackend } from "../src/web.js";

/* ─── Minimal UiConnection mock ─────────────────────────── */

function createMockConn(): UiConnection & {
  _msgHandler: ((msg: string) => void) | null;
  _closeHandler: (() => void) | null;
  _open: boolean;
  simulateMessage(msg: Record<string, unknown>): void;
  simulateClose(): void;
} {
  const conn = {
    _msgHandler: null as ((msg: string) => void) | null,
    _closeHandler: null as (() => void) | null,
    _open: true,
    get isOpen() {
      return this._open;
    },
    send(_msg: string) {},
    onMessage(cb: (msg: string) => void) {
      this._msgHandler = cb;
    },
    onClose(cb: () => void) {
      this._closeHandler = cb;
    },
    close() {
      this._open = false;
      this._closeHandler?.();
    },
    simulateMessage(msg: Record<string, unknown>) {
      this._msgHandler?.(JSON.stringify(msg));
    },
    simulateClose() {
      this._open = false;
      this._closeHandler?.();
    },
  };
  return conn;
}

describe("WebBackend caller identity", () => {
  let backend: WebBackend;

  afterEach(async () => {
    await backend?.close();
  });

  // ─── Phase 1: caller storage ───────────────────────────────

  describe("caller storage via injectConnection", () => {
    test("injectConnection with x-caller-did stores caller", async () => {
      backend = new WebBackend({
        port: 0,
        inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
      });
      backend.setSessionFactory((_endpoint, requestedSid) => ({
        sessionId: requestedSid || "test-session-store",
      }));
      const conn = createMockConn();
      conn.send = () => {};
      backend.injectConnection(conn, {
        "x-caller-did": "did:abt:z1abc",
        "x-caller-pk": "pk123",
      });
      conn.simulateMessage({ type: "join_session" });

      // Wait for async handshake to complete (session registration)
      await new Promise((r) => setTimeout(r, 50));

      const caller = backend.getCallerForSession("test-session-store");
      expect(caller).toBeDefined();
      expect(caller!.did).toBe("did:abt:z1abc");
    });

    test("injectConnection without caller headers stores no caller", async () => {
      backend = new WebBackend({
        port: 0,
        inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
      });
      backend.setSessionFactory((_endpoint, requestedSid) => ({
        sessionId: requestedSid || "test-session-nocaller",
      }));
      const conn = createMockConn();
      conn.send = () => {};
      backend.injectConnection(conn, {});
      conn.simulateMessage({ type: "join_session" });

      // Wait for async handshake to complete (session registration)
      await new Promise((r) => setTimeout(r, 50));

      const caller = backend.getCallerForSession("test-session-nocaller");
      expect(caller).toBeUndefined();
    });

    test("connection close cleans up caller entry", async () => {
      backend = new WebBackend({
        port: 0,
        inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
      });
      backend.setSessionFactory(() => ({ sessionId: "test-session-cleanup" }));
      const conn = createMockConn();
      conn.send = () => {};
      backend.injectConnection(conn, {
        "x-caller-did": "did:abt:z1abc",
        "x-caller-pk": "pk123",
      });
      conn.simulateMessage({ type: "join_session" });

      // Wait for async handshake to complete (session registration)
      await new Promise((r) => setTimeout(r, 50));

      // Verify caller is stored before disconnect
      expect(backend.getCallerForSession("test-session-cleanup")).toBeDefined();

      conn.simulateClose();

      // After disconnect, caller should be cleaned up
      expect(backend.getCallerForSession("test-session-cleanup")).toBeUndefined();
    });
  });

  // ─── Phase 2: caller forwarded to aupEventHandler ──────────

  describe("aupEventHandler receives caller", () => {
    test("aup_event on authed connection passes caller to handler", async () => {
      backend = new WebBackend({
        port: 0,
        inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
      });

      let receivedCaller: { did: string; pk?: string } | undefined;
      backend.setAupEventHandler(async (_msg, _sessionId, _channelId, caller) => {
        receivedCaller = caller;
        return { ok: true };
      });

      // Set up session factory so the connection gets a session
      backend.setSessionFactory((_endpoint, requestedSid) => ({
        sessionId: requestedSid || "test-session",
      }));

      const conn = createMockConn();
      // Capture sent messages to verify
      const sent: string[] = [];
      conn.send = (msg: string) => sent.push(msg);

      backend.injectConnection(conn, {
        "x-caller-did": "did:abt:z1authed",
        "x-caller-pk": "pkABC",
      });

      // Complete handshake
      conn.simulateMessage({ type: "join_session" });

      // Send AUP event
      conn.simulateMessage({
        type: "aup_event",
        nodeId: "btn1",
        event: "click",
        data: { value: 42 },
      });

      // Wait for async handler
      await new Promise((r) => setTimeout(r, 50));

      expect(receivedCaller).toEqual({ did: "did:abt:z1authed", pk: "pkABC" });
    });

    test("aup_event on anonymous connection passes undefined caller", async () => {
      backend = new WebBackend({
        port: 0,
        inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
      });

      let receivedCaller: { did: string; pk?: string } | undefined = { did: "should-be-replaced" };
      backend.setAupEventHandler(async (_msg, _sessionId, _channelId, caller) => {
        receivedCaller = caller;
        return { ok: true };
      });

      backend.setSessionFactory((_endpoint, requestedSid) => ({
        sessionId: requestedSid || "test-session",
      }));

      const conn = createMockConn();
      conn.send = () => {};

      // No caller headers
      backend.injectConnection(conn, {});

      conn.simulateMessage({ type: "join_session" });
      conn.simulateMessage({
        type: "aup_event",
        nodeId: "btn1",
        event: "click",
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(receivedCaller).toBeUndefined();
    });

    test("multiple connections each have independent callers", async () => {
      backend = new WebBackend({
        port: 0,
        inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
      });

      const callers: Array<{ did: string; pk?: string } | undefined> = [];
      backend.setAupEventHandler(async (_msg, _sessionId, _channelId, caller) => {
        callers.push(caller);
        return { ok: true };
      });

      backend.setSessionFactory((_endpoint, requestedSid) => ({
        sessionId: requestedSid || crypto.randomUUID(),
      }));

      // Connection 1: authed
      const conn1 = createMockConn();
      conn1.send = () => {};
      backend.injectConnection(conn1, {
        "x-caller-did": "did:abt:z1first",
        "x-caller-pk": "pk1",
      });
      conn1.simulateMessage({ type: "join_session", sessionId: "s1" });

      // Connection 2: different identity
      const conn2 = createMockConn();
      conn2.send = () => {};
      backend.injectConnection(conn2, {
        "x-caller-did": "did:abt:z1second",
        "x-caller-pk": "pk2",
      });
      conn2.simulateMessage({ type: "join_session", sessionId: "s2" });

      // Send events from each
      conn1.simulateMessage({ type: "aup_event", nodeId: "n1", event: "click" });
      await new Promise((r) => setTimeout(r, 50));

      conn2.simulateMessage({ type: "aup_event", nodeId: "n2", event: "click" });
      await new Promise((r) => setTimeout(r, 50));

      expect(callers).toHaveLength(2);
      expect(callers[0]).toEqual({ did: "did:abt:z1first", pk: "pk1" });
      expect(callers[1]).toEqual({ did: "did:abt:z1second", pk: "pk2" });
    });

    test("caller is cleaned up after disconnect — no leak", async () => {
      backend = new WebBackend({
        port: 0,
        inputSource: { readLine: () => new Promise(() => {}), hasPending: () => false } as any,
      });

      let receivedCaller: { did: string; pk?: string } | undefined = { did: "sentinel" };
      backend.setAupEventHandler(async (_msg, _sessionId, _channelId, caller) => {
        receivedCaller = caller;
        return { ok: true };
      });

      backend.setSessionFactory(() => ({ sessionId: "s1" }));

      // First connection with caller — then disconnect
      const conn1 = createMockConn();
      conn1.send = () => {};
      backend.injectConnection(conn1, { "x-caller-did": "did:abt:z1gone" });
      conn1.simulateMessage({ type: "join_session" });
      conn1.simulateClose();

      // New connection without caller
      const conn2 = createMockConn();
      conn2.send = () => {};
      backend.injectConnection(conn2, {});
      conn2.simulateMessage({ type: "join_session" });

      conn2.simulateMessage({ type: "aup_event", nodeId: "n1", event: "click" });
      await new Promise((r) => setTimeout(r, 50));

      // Should be undefined, not the old caller
      expect(receivedCaller).toBeUndefined();
    });
  });
});
