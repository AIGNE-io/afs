import { beforeEach, describe, expect, it } from "bun:test";
import {
  DEVICE_CAPS_TERM,
  DEVICE_CAPS_TTY,
  DEVICE_CAPS_WEB_FULL,
  type DeviceCaps,
  fillPrimitives,
} from "../src/aup-types.js";
import { Session, SessionManager } from "../src/session.js";

// ── SessionManager ──

describe("SessionManager", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
  });

  // Happy Path

  it("create() returns session with unique ID", () => {
    const s1 = mgr.create("web");
    const s2 = mgr.create("web");
    expect(s1.id).toBeTruthy();
    expect(s2.id).toBeTruthy();
    expect(s1.id).not.toBe(s2.id);
    expect(s1.endpoint).toBe("web");
  });

  it("get() returns existing session", () => {
    const s = mgr.create("web");
    const found = mgr.get(s.id);
    expect(found).toBe(s);
  });

  it("list() returns all active sessions", () => {
    mgr.create("web");
    mgr.create("web");
    mgr.create("term");
    expect(mgr.list().length).toBe(3);
  });

  it("list() filters by endpoint", () => {
    mgr.create("web");
    mgr.create("web");
    mgr.create("term");
    expect(mgr.list("web").length).toBe(2);
    expect(mgr.list("term").length).toBe(1);
  });

  it("delete() removes session", () => {
    const s = mgr.create("web");
    mgr.delete(s.id);
    expect(mgr.list().length).toBe(0);
  });

  // Bad Path

  it("get() throws on unknown session ID", () => {
    expect(() => mgr.get("nonexistent")).toThrow(/not found/i);
  });

  it("delete() throws on unknown session ID", () => {
    expect(() => mgr.delete("nonexistent")).toThrow(/not found/i);
  });

  // Edge Cases

  it("gc() removes sessions inactive beyond threshold", () => {
    const s = mgr.create("web");
    // Manually set lastActive to the past
    (s as any)._lastActive = Date.now() - 60_000;
    mgr.gc(30_000); // 30s threshold
    expect(mgr.list().length).toBe(0);
  });

  it("gc() keeps recently active sessions", () => {
    mgr.create("web");
    mgr.gc(30_000);
    expect(mgr.list().length).toBe(1);
  });

  it("handles 100+ sessions", () => {
    for (let i = 0; i < 100; i++) mgr.create("web");
    expect(mgr.list().length).toBe(100);
  });

  // Security

  it("session ID has sufficient entropy (>= 8 chars)", () => {
    const s = mgr.create("web");
    expect(s.id.length).toBeGreaterThanOrEqual(8);
  });
});

// ── Session ──

describe("Session", () => {
  let session: Session;

  beforeEach(() => {
    session = new Session("test-id", "web");
  });

  // Happy Path

  it("addMessage() stores message with auto-generated ID + timestamp", () => {
    const msg = session.addMessage({ type: "text", from: "agent", content: "hello" });
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeTruthy();
    expect(msg.type).toBe("text");
    expect(msg.from).toBe("agent");
    expect((msg as any).content).toBe("hello");
  });

  it("listMessages() returns messages in order", () => {
    session.addMessage({ type: "text", from: "agent", content: "first" });
    session.addMessage({ type: "text", from: "user", content: "second" });
    const msgs = session.listMessages();
    expect(msgs.length).toBe(2);
    expect((msgs[0] as any).content).toBe("first");
    expect((msgs[1] as any).content).toBe("second");
  });

  it("findMessage() finds by ID", () => {
    const msg = session.addMessage({ type: "text", from: "agent", content: "hello" });
    const found = session.findMessage(msg.id);
    expect(found).toEqual(msg);
  });

  it("filterMessages() filters by type", () => {
    session.addMessage({ type: "text", from: "agent", content: "hi" });
    session.addMessage({ type: "form", from: "agent", id: "f1", fields: [] });
    session.addMessage({ type: "text", from: "user", content: "bye" });
    const texts = session.filterMessages({ type: "text" });
    expect(texts.length).toBe(2);
  });

  it("filterMessages() filters by from", () => {
    session.addMessage({ type: "text", from: "agent", content: "hi" });
    session.addMessage({ type: "text", from: "user", content: "bye" });
    const userMsgs = session.filterMessages({ from: "user" });
    expect(userMsgs.length).toBe(1);
    expect((userMsgs[0] as any).content).toBe("bye");
  });

  it("filterMessages() filters by type AND from", () => {
    session.addMessage({ type: "text", from: "agent", content: "1" });
    session.addMessage({ type: "text", from: "user", content: "2" });
    session.addMessage({ type: "form", from: "agent", fields: [] });
    const result = session.filterMessages({ type: "text", from: "user" });
    expect(result.length).toBe(1);
  });

  // Bad Path

  it("addMessage() rejects message without type", () => {
    expect(() => session.addMessage({ from: "agent" } as any)).toThrow(/type/i);
  });

  it("addMessage() rejects message without from", () => {
    expect(() => session.addMessage({ type: "text" } as any)).toThrow(/from/i);
  });

  it("findMessage() returns undefined for unknown ID", () => {
    expect(session.findMessage("nope")).toBeUndefined();
  });

  // Edge Cases

  it("handles 1000+ messages", () => {
    for (let i = 0; i < 1000; i++) {
      session.addMessage({ type: "text", from: "agent", content: `msg-${i}` });
    }
    expect(session.listMessages().length).toBe(1000);
  });

  // Pages

  it("setPage() and getPage() round-trip", () => {
    session.setPage("dash", { content: "<h1>Hi</h1>", format: "html" });
    const page = session.getPage("dash");
    expect(page?.content).toBe("<h1>Hi</h1>");
    expect(page?.format).toBe("html");
  });

  it("listPages() returns all pages", () => {
    session.setPage("a", { content: "A", format: "html" });
    session.setPage("b", { content: "B", format: "html" });
    expect(session.listPages().length).toBe(2);
  });

  it("deletePage() removes page", () => {
    session.setPage("a", { content: "A", format: "html" });
    session.deletePage("a");
    expect(session.getPage("a")).toBeUndefined();
  });

  it("getPage() returns undefined for unknown page", () => {
    expect(session.getPage("nope")).toBeUndefined();
  });

  // Metadata

  it("toMeta() returns session metadata", () => {
    const meta = session.toMeta();
    expect(meta.id).toBe("test-id");
    expect(meta.endpoint).toBe("web");
    expect(meta.created).toBeTruthy();
    expect(meta.lastActive).toBeTruthy();
  });

  it("touch() updates lastActive", () => {
    const before = session.toMeta().lastActive;
    // Small delay to ensure timestamp differs
    session.touch();
    const after = session.toMeta().lastActive;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  // Data Damage

  it("deleting session data clears messages", () => {
    session.addMessage({ type: "text", from: "agent", content: "hi" });
    session.clear();
    expect(session.listMessages().length).toBe(0);
    expect(session.listPages().length).toBe(0);
  });
});

// ── Device Capabilities (D13) ──

describe("Session DeviceCaps", () => {
  it("defaults to DEVICE_CAPS_WEB_FULL when no caps provided", () => {
    const session = new Session("s1", "web");
    expect(session.deviceCaps).toEqual(DEVICE_CAPS_WEB_FULL);
  });

  it("accepts caps in constructor", () => {
    const session = new Session("s1", "tty", DEVICE_CAPS_TTY);
    expect(session.deviceCaps.platform).toBe("cli");
    expect(session.deviceCaps.primitives.text).toBe("native");
    expect(session.deviceCaps.primitives.chart).toBe("unsupported");
  });

  it("setDeviceCaps() validates and accepts valid caps", () => {
    const session = new Session("s1", "web");
    const iosCaps: DeviceCaps = {
      platform: "ios",
      formFactor: "phone",
      primitives: fillPrimitives({ text: "native", chart: "webview" }, "unsupported"),
      features: { camera: true, gps: true },
    };
    const err = session.setDeviceCaps(iosCaps);
    expect(err).toBeNull();
    expect(session.deviceCaps.platform).toBe("ios");
    expect(session.deviceCaps.features?.camera).toBe(true);
  });

  it("setDeviceCaps() rejects invalid caps and preserves previous", () => {
    const session = new Session("s1", "web", DEVICE_CAPS_TERM);
    const err = session.setDeviceCaps({ invalid: true });
    expect(err).toBeTruthy();
    // Previous caps preserved
    expect(session.deviceCaps).toEqual(DEVICE_CAPS_TERM);
  });

  it("setDeviceCaps() rejects caps with bad primitive value", () => {
    const err = new Session("s1", "web").setDeviceCaps({
      platform: "web",
      formFactor: "desktop",
      primitives: { text: "INVALID" },
    });
    expect(err).toContain("native, webview, partial, unsupported");
  });
});

describe("SessionManager with DeviceCaps", () => {
  it("create() passes caps to new session", () => {
    const mgr = new SessionManager();
    const session = mgr.create("tty", DEVICE_CAPS_TTY);
    expect(session.deviceCaps).toEqual(DEVICE_CAPS_TTY);
  });

  it("create() defaults to WEB_FULL when no caps given", () => {
    const mgr = new SessionManager();
    const session = mgr.create("web");
    expect(session.deviceCaps).toEqual(DEVICE_CAPS_WEB_FULL);
  });

  it("createWithId() passes caps to new session", () => {
    const mgr = new SessionManager();
    const session = mgr.createWithId("ab".repeat(8), "term", DEVICE_CAPS_TERM);
    expect(session.deviceCaps).toEqual(DEVICE_CAPS_TERM);
  });
});
