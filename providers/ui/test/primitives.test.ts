/**
 * Phase 6: UI Primitives tests.
 *
 * Tests: dialog, progress, form, table, toast actions.
 */
import { describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, createMockInputSource, TTYBackend, WebBackend } from "@aigne/afs-ui";

/* ─── helpers ──────────────────────────────────────────── */

async function mountWebProvider(inputs?: string[]) {
  const output: string[] = [];
  const inputSource = createMockInputSource(inputs ?? Array(30).fill("test input"));
  const stdout = {
    write(data: string) {
      output.push(data);
      return true;
    },
  };
  const backend = new WebBackend({ port: 0, inputSource, stdout });
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");
  return { afs, output, inputSource };
}

async function mountTTYProvider(inputs?: string[]) {
  const output: string[] = [];
  const inputSource = createMockInputSource(inputs ?? Array(30).fill("test input"));
  const stdout = {
    write(data: string) {
      output.push(data);
      return true;
    },
  };
  const backend = new TTYBackend({ inputSource, stdout });
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");
  return { afs, output, inputSource };
}

/* ─── Happy Path ─────────────────────────────────────── */

describe("UI Primitives — Happy Path", () => {
  test("dialog action returns user selection", async () => {
    // Input "1" selects first button (Yes)
    const { afs } = await mountWebProvider(["1"]);
    const result = await afs.exec("/ui/.actions/dialog", {
      title: "Confirm",
      content: "Are you sure?",
      buttons: ["Yes", "No"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.selection).toBe("Yes");
  });

  test("progress action updates progress display", async () => {
    const { afs } = await mountWebProvider();
    const result = await afs.exec("/ui/.actions/progress", {
      label: "Loading",
      value: 50,
      max: 100,
    });
    expect(result.success).toBe(true);
  });

  test("form action collects field values", async () => {
    // Inputs for each field: "Alice" for name, "30" for age
    const { afs } = await mountWebProvider(["Alice", "30"]);
    const result = await afs.exec("/ui/.actions/form", {
      title: "User Info",
      fields: [
        { name: "name", label: "Name", type: "text" },
        { name: "age", label: "Age", type: "text" },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.values).toEqual({ name: "Alice", age: "30" });
  });

  test("table action displays data", async () => {
    const { afs } = await mountWebProvider();
    const result = await afs.exec("/ui/.actions/table", {
      headers: ["Name", "Score"],
      rows: [
        ["Alice", "95"],
        ["Bob", "87"],
      ],
    });
    expect(result.success).toBe(true);
  });

  test("toast action sends lightweight notification", async () => {
    const { afs } = await mountWebProvider();
    const result = await afs.exec("/ui/.actions/toast", {
      message: "Saved!",
      toastType: "success",
    });
    expect(result.success).toBe(true);
  });

  test("all 5 primitives appear in actions list", async () => {
    const { afs } = await mountWebProvider();
    const result = await afs.list("/ui/.actions");
    const actionIds = result.data?.map((e) => e.id) ?? [];
    for (const name of ["dialog", "progress", "form", "table", "toast"]) {
      expect(actionIds).toContain(name);
    }
  });

  test("each primitive has inputSchema in meta", async () => {
    const { afs } = await mountWebProvider();
    const result = await afs.list("/ui/.actions");
    const primitives = ["dialog", "progress", "form", "table", "toast"];
    for (const action of result.data ?? []) {
      if (primitives.includes(action.id)) {
        expect(action.meta?.inputSchema).toBeDefined();
      }
    }
  });

  test("dialog on TTY backend falls back to select prompt", async () => {
    // Input "1" selects first button
    const { afs } = await mountTTYProvider(["1"]);
    const result = await afs.exec("/ui/.actions/dialog", {
      title: "Confirm",
      content: "Sure?",
      buttons: ["OK", "Cancel"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.selection).toBe("OK");
  });

  test("form on TTY backend falls back to sequential prompts", async () => {
    const { afs } = await mountTTYProvider(["Bob", "25"]);
    const result = await afs.exec("/ui/.actions/form", {
      title: "Profile",
      fields: [
        { name: "name", label: "Name", type: "text" },
        { name: "age", label: "Age", type: "text" },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.values).toEqual({ name: "Bob", age: "25" });
  });

  test("table on TTY backend writes formatted text", async () => {
    const { afs, output } = await mountTTYProvider();
    await afs.exec("/ui/.actions/table", {
      headers: ["Col1"],
      rows: [["val1"]],
    });
    const text = output.join("");
    expect(text).toContain("Col1");
    expect(text).toContain("val1");
  });
});

/* ─── Bad Path ───────────────────────────────────────── */

describe("UI Primitives — Bad Path", () => {
  test("dialog without buttons throws", async () => {
    const { afs } = await mountWebProvider();
    await expect(afs.exec("/ui/.actions/dialog", { title: "X", content: "Y" })).rejects.toThrow(
      "buttons",
    );
  });

  test("dialog without title throws", async () => {
    const { afs } = await mountWebProvider();
    await expect(
      afs.exec("/ui/.actions/dialog", { content: "Y", buttons: ["OK"] }),
    ).rejects.toThrow("title");
  });

  test("form without fields throws", async () => {
    const { afs } = await mountWebProvider();
    await expect(afs.exec("/ui/.actions/form", { title: "X" })).rejects.toThrow("fields");
  });

  test("form with empty fields array throws", async () => {
    const { afs } = await mountWebProvider();
    await expect(afs.exec("/ui/.actions/form", { title: "X", fields: [] })).rejects.toThrow(
      "fields",
    );
  });

  test("table without headers throws", async () => {
    const { afs } = await mountWebProvider();
    await expect(afs.exec("/ui/.actions/table", { rows: [["a"]] })).rejects.toThrow("headers");
  });

  test("toast without message throws", async () => {
    const { afs } = await mountWebProvider();
    await expect(afs.exec("/ui/.actions/toast", {})).rejects.toThrow("message");
  });

  test("progress without value throws", async () => {
    const { afs } = await mountWebProvider();
    await expect(afs.exec("/ui/.actions/progress", { label: "X" })).rejects.toThrow("value");
  });
});
