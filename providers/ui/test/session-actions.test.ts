import { describe, expect, it } from "bun:test";
import { createMockInputSource } from "../src/tty.js";
import { AFSUIProvider } from "../src/ui-provider.js";

function createTestProvider(inputs: string[] = ["test"]) {
  const inputSource = createMockInputSource(inputs);
  const output: string[] = [];
  const stdout = {
    write: (s: string) => {
      output.push(s);
      return true;
    },
  };

  const provider = new AFSUIProvider({
    backend: "tty",
    ttyOptions: { inputSource, stdout },
  });

  return { provider, inputSource, output };
}

function getSessionId(provider: AFSUIProvider) {
  // TTY auto-creates a default session
  return provider.list("/tty/sessions").then((r) => r.data[0]!.id);
}

// ── Happy Path: Interactive Actions ──

describe("interactive actions (write message + await response)", () => {
  it("exec prompt writes prompt message, returns response", async () => {
    const { provider } = createTestProvider(["Alice"]);
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/prompt`, {
      message: "What is your name?",
      type: "text",
    });

    expect(result.success).toBe(true);
    expect(result.data?.response).toBe("Alice");

    // Verify messages were written
    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    expect(msgs.data.length).toBeGreaterThanOrEqual(2);
    const types = msgs.data.map((m) => m.meta?.type);
    expect(types).toContain("prompt");
    expect(types).toContain("prompt.response");
  });

  it("exec form writes form message, returns submitted data", async () => {
    const { provider } = createTestProvider(["Bob", "30"]);
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/form`, {
      title: "User Info",
      fields: [
        { name: "name", label: "Name", type: "text" },
        { name: "age", label: "Age", type: "text" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.values).toBeDefined();
  });

  it("exec dialog writes dialog message, returns selected button", async () => {
    const { provider } = createTestProvider(["1"]);
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/dialog`, {
      title: "Confirm",
      content: "Are you sure?",
      buttons: ["OK", "Cancel"],
    });

    expect(result.success).toBe(true);
    expect(result.data?.selection).toBeDefined();

    // Verify messages written
    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    const types = msgs.data.map((m) => m.meta?.type);
    expect(types).toContain("dialog");
    expect(types).toContain("dialog.response");
  });

  it("exec confirm writes confirm message, returns boolean", async () => {
    const { provider } = createTestProvider(["y"]);
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/prompt`, {
      message: "Continue?",
      type: "confirm",
    });

    expect(result.success).toBe(true);
    // Verify prompt messages
    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    expect(msgs.data.length).toBeGreaterThanOrEqual(2);
  });

  it("exec select writes select message, returns chosen value", async () => {
    const { provider } = createTestProvider(["B"]);
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/prompt`, {
      message: "Pick one",
      type: "select",
      options: ["A", "B", "C"],
    });

    expect(result.success).toBe(true);
    expect(result.data?.response).toBeDefined();
  });
});

// ── Happy Path: Non-Interactive Actions ──

describe("non-interactive actions (fire-and-forget)", () => {
  it("exec table writes table message (no await)", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/table`, {
      headers: ["Name", "Score"],
      rows: [["Alice", "95"]],
    });

    expect(result.success).toBe(true);

    // Should have written a table message
    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    const types = msgs.data.map((m) => m.meta?.type);
    expect(types).toContain("table");
  });

  it("exec toast writes notification message", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/toast`, {
      message: "Done!",
    });

    expect(result.success).toBe(true);

    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    const types = msgs.data.map((m) => m.meta?.type);
    expect(types).toContain("notification");
  });

  it("exec progress writes progress message", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/progress`, {
      label: "Loading",
      value: 50,
      max: 100,
    });

    expect(result.success).toBe(true);

    const msgs = await provider.list(`/tty/sessions/${sid}/messages`);
    const types = msgs.data.map((m) => m.meta?.type);
    expect(types).toContain("progress");
  });

  it("exec clear delegates to backend", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/clear`, {});
    expect(result.success).toBe(true);
  });

  it("exec navigate navigates to session page", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    // Create a page first
    await provider.write(`/tty/sessions/${sid}/pages/dash`, {
      content: "<h1>Dashboard</h1>",
      meta: { format: "html" },
    });

    const result = await provider.exec(`/tty/sessions/${sid}/.actions/navigate`, {
      page: "dash",
    });
    expect(result.success).toBe(true);
  });
});

// ── Bad Path ──

describe("action bad path", () => {
  it("prompt without message arg throws", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    await expect(provider.exec(`/tty/sessions/${sid}/.actions/prompt`, {})).rejects.toThrow(
      /message/i,
    );
  });

  it("form without fields arg throws", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    await expect(provider.exec(`/tty/sessions/${sid}/.actions/form`, {})).rejects.toThrow(
      /fields/i,
    );
  });

  it("dialog without buttons arg throws", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    await expect(
      provider.exec(`/tty/sessions/${sid}/.actions/dialog`, {
        title: "Test",
        content: "Test",
      }),
    ).rejects.toThrow(/buttons/i);
  });

  it("action on unknown session throws", async () => {
    const { provider } = createTestProvider(["test"]);

    await expect(
      provider.exec("/tty/sessions/nonexistent/.actions/prompt", {
        message: "hi",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

// ── Security ──

describe("action security", () => {
  it("cannot exec action on another endpoint's session", async () => {
    const { provider } = createTestProvider(["test"]);
    const sid = await getSessionId(provider);

    // Try using "web" endpoint for a tty session
    await expect(
      provider.exec(`/web/sessions/${sid}/.actions/prompt`, {
        message: "hi",
      }),
    ).rejects.toThrow();
  });
});

// ── Per-session action listing ──

describe("session action listing", () => {
  it("list /:endpoint/sessions/:id/.actions returns all actions", async () => {
    const { provider } = createTestProvider();
    const sid = await getSessionId(provider);

    const result = await provider.list(`/tty/sessions/${sid}/.actions`);
    expect(result.data.length).toBeGreaterThanOrEqual(9);

    const names = result.data.map((a) => a.id);
    expect(names).toContain("prompt");
    expect(names).toContain("form");
    expect(names).toContain("dialog");
    expect(names).toContain("table");
    expect(names).toContain("toast");
    expect(names).toContain("clear");
    expect(names).toContain("navigate");
  });

  it("root /.actions still works (backward compat)", async () => {
    const { provider } = createTestProvider(["test"]);

    const result = await provider.list("/.actions");
    expect(result.data.length).toBeGreaterThanOrEqual(9);
  });
});
