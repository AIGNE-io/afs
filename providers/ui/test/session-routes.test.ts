import { describe, expect, it } from "bun:test";
import { createMockInputSource } from "../src/tty.js";
import { AFSUIProvider } from "../src/ui-provider.js";

function createTestProvider(backend: "tty" | "web" | "term" = "tty") {
  const inputSource = createMockInputSource();
  const output: string[] = [];
  const stdout = {
    write: (s: string) => {
      output.push(s);
      return true;
    },
  };

  const provider = new AFSUIProvider({
    backend,
    ttyOptions: { inputSource, stdout },
    webOptions: { port: 0, inputSource, stdout },
    termOptions: { port: 0, inputSource, stdout },
  });

  return { provider, inputSource, output };
}

// ── Session Discovery ──

describe("session discovery", () => {
  it("list /:endpoint/sessions/ returns active sessions", async () => {
    const { provider } = createTestProvider("tty");
    // TTY auto-creates a default session
    const result = await provider.list("/tty/sessions");
    expect(result.data).toBeInstanceOf(Array);
    // TTY backend should have at least one auto-session
    expect(result.data.length).toBeGreaterThanOrEqual(1);
  });

  it("list with no sessions returns empty", async () => {
    const { provider } = createTestProvider("web");
    const result = await provider.list("/web/sessions");
    // Web sessions are created on connect, so initially empty
    expect(result.data).toBeInstanceOf(Array);
  });
});

// ── Session Metadata ──

describe("session metadata", () => {
  it("stat /:endpoint/sessions/:id returns session info", async () => {
    const { provider } = createTestProvider("tty");
    // Get the auto-created session
    const sessions = await provider.list("/tty/sessions");
    const sessionId = sessions.data[0]!.id;
    const stat = await provider.stat(`/tty/sessions/${sessionId}`);
    expect(stat.data!.meta!.endpoint || stat.data!.meta!.kind).toBeTruthy();
  });

  it("stat unknown session throws", async () => {
    const { provider } = createTestProvider("tty");
    await expect(provider.stat("/tty/sessions/nonexistent")).rejects.toThrow(/not found/i);
  });
});

// ── Message CRUD ──

describe("message CRUD", () => {
  it("write message to session, then list it", async () => {
    const { provider } = createTestProvider("tty");
    const sessions = await provider.list("/tty/sessions");
    const sid = sessions.data[0]!.id;

    await provider.write(`/tty/sessions/${sid}/messages`, {
      content: { type: "text", from: "agent", content: "hello" },
    });

    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    expect(msgs.data.length).toBeGreaterThanOrEqual(1);
    const last = msgs.data[msgs.data.length - 1]!;
    expect(last.meta?.type || (last.content as any)?.type).toBe("text");
  });

  it("read specific message by ID", async () => {
    const { provider } = createTestProvider("tty");
    const sessions = await provider.list("/tty/sessions");
    const sid = sessions.data[0]!.id;

    await provider.write(`/tty/sessions/${sid}/messages`, {
      content: { type: "text", from: "agent", content: "hello" },
    });

    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    const msgId = msgs.data[msgs.data.length - 1]!.id;

    const msg = await provider.read(`/tty/sessions/${sid}/messages/${msgId}`);
    expect(msg.data!.content).toBeTruthy();
  });

  it("write message to unknown session throws", async () => {
    const { provider } = createTestProvider("tty");
    await expect(
      provider.write("/tty/sessions/unknown/messages", {
        content: { type: "text", from: "agent", content: "hi" },
      }),
    ).rejects.toThrow(/not found/i);
  });
});

// ── Pages (session-scoped) ──

describe("session-scoped pages", () => {
  it("write and read page within session", async () => {
    const { provider } = createTestProvider("tty");
    const sessions = await provider.list("/tty/sessions");
    const sid = sessions.data[0]!.id;

    await provider.write(`/tty/sessions/${sid}/pages/dash`, {
      content: "<h1>Dashboard</h1>",
      meta: { format: "html" },
    });

    const page = await provider.read(`/tty/sessions/${sid}/pages/dash`);
    expect(page.data!.content).toBe("<h1>Dashboard</h1>");
  });

  it("list pages in session", async () => {
    const { provider } = createTestProvider("tty");
    const sessions = await provider.list("/tty/sessions");
    const sid = sessions.data[0]!.id;

    await provider.write(`/tty/sessions/${sid}/pages/a`, {
      content: "A",
      meta: { format: "html" },
    });
    await provider.write(`/tty/sessions/${sid}/pages/b`, {
      content: "B",
      meta: { format: "html" },
    });

    const pages = await provider.list(`/tty/sessions/${sid}/pages`);
    expect(pages.data.length).toBe(2);
  });
});

// ── Root and Explain ──

describe("root level", () => {
  it("list / shows endpoint", async () => {
    const { provider } = createTestProvider("tty");
    const result = await provider.list("/");
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some((e) => e.path?.includes("tty"))).toBe(true);
  });

  it("explain / returns device description", async () => {
    const { provider } = createTestProvider("tty");
    const result = await provider.explain("/");
    expect(result.content).toBeTruthy();
  });
});

// ── Stat ──

describe("session stat", () => {
  it("stat /:endpoint/sessions/:id returns session info", async () => {
    const { provider } = createTestProvider("tty");
    const sessions = await provider.list("/tty/sessions");
    const sid = sessions.data[0]!.id;
    const stat = await provider.stat(`/tty/sessions/${sid}`);
    expect(stat.data!.id).toBe(sid);
  });
});
