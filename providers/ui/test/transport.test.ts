import { describe, expect, it } from "bun:test";
import type { UIBackend } from "../src/backend.js";
import { isAUPTransport, isSessionAware } from "../src/backend.js";

// ── Mock backends for type guard testing ──

/** Minimal UIBackend — no transport capabilities (like TTYBackend) */
function createBasicBackend(): UIBackend {
  return {
    type: "basic",
    supportedFormats: ["text"],
    capabilities: ["text"],
    write: async () => {},
    read: async () => "",
    prompt: async () => "",
    notify: async () => {},
    clear: async () => {},
    hasPendingInput: () => false,
    getViewport: () => ({}),
    dispose: async () => {},
  };
}

/** Backend with session factory (like TermBackend) */
function createSessionAwareBackend(): UIBackend {
  const base = createBasicBackend();
  return Object.assign(base, {
    type: "session-aware",
    setSessionFactory: () => {},
  });
}

/** Backend with full AUP transport (like WebBackend) */
function createAUPTransportBackend(): UIBackend {
  const base = createBasicBackend();
  return Object.assign(base, {
    type: "aup-transport",
    setSessionFactory: () => {},
    sendToSession: () => {},
    sendToLiveChannel: () => {},
    broadcastRaw: () => {},
    getActiveChannelIds: () => [],
    setAupEventHandler: () => {},
    setChannelJoinHandler: () => {},
    setSessionJoinHandler: () => {},
    setPageResolver: () => {},
    setAFS: () => {},
  });
}

// ── Type Guard Tests ──

describe("isSessionAware", () => {
  it("returns false for basic backend (no setSessionFactory)", () => {
    expect(isSessionAware(createBasicBackend())).toBe(false);
  });

  it("returns true for backend with setSessionFactory", () => {
    expect(isSessionAware(createSessionAwareBackend())).toBe(true);
  });

  it("returns true for AUP transport backend (superset)", () => {
    expect(isSessionAware(createAUPTransportBackend())).toBe(true);
  });
});

describe("isAUPTransport", () => {
  it("returns false for basic backend", () => {
    expect(isAUPTransport(createBasicBackend())).toBe(false);
  });

  it("returns false for session-aware-only backend", () => {
    expect(isAUPTransport(createSessionAwareBackend())).toBe(false);
  });

  it("returns true for full AUP transport backend", () => {
    expect(isAUPTransport(createAUPTransportBackend())).toBe(true);
  });

  it("returns false if sendToSession is not a function", () => {
    const backend = createBasicBackend();
    (backend as any).sendToSession = "not-a-function";
    expect(isAUPTransport(backend)).toBe(false);
  });
});

// ── Real backend type guard checks ──

describe("real backends satisfy type guards", () => {
  it("TTYBackend is not session-aware", async () => {
    const { TTYBackend } = await import("../src/tty.js");
    const backend = new TTYBackend({
      inputSource: { readLine: async () => "", hasPending: () => false },
    });
    expect(isSessionAware(backend)).toBe(false);
    expect(isAUPTransport(backend)).toBe(false);
  });

  it("TermBackend is session-aware but not AUP transport", async () => {
    const { createMockInputSource } = await import("../src/tty.js");
    const { TermBackend } = await import("../src/term.js");
    const backend = new TermBackend({ inputSource: createMockInputSource() });
    expect(isSessionAware(backend)).toBe(true);
    expect(isAUPTransport(backend)).toBe(false);
  });

  it("WebBackend is both session-aware and AUP transport", async () => {
    const { createMockInputSource } = await import("../src/tty.js");
    const { WebBackend } = await import("../src/web.js");
    const backend = new WebBackend({ inputSource: createMockInputSource() });
    expect(isSessionAware(backend)).toBe(true);
    expect(isAUPTransport(backend)).toBe(true);
  });
});
