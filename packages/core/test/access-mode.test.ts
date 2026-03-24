import { beforeEach, describe, expect, test } from "bun:test";
import { AFS, AFSReadonlyError } from "@aigne/afs";
import { JSONModule } from "./mocks/json-module.js";

/**
 * Tests for extended access modes: readonly | create | append | readwrite.
 *
 * These test the enforcement layer in AFS core (checkWritePermission) and
 * base provider (write/delete/rename/exec guards).
 */

function createModule(accessMode: "readonly" | "create" | "append" | "readwrite") {
  return new JSONModule({
    name: `${accessMode}-module`,
    description: `Module with ${accessMode} access`,
    accessMode,
    data: {
      existing: { content: "Original content" },
      another: { content: "Another file" },
    },
  });
}

let afs: AFS;

// ── create mode ──

describe("accessMode: create", () => {
  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createModule("create"));
  });

  // Happy path
  test("write(mode: create) succeeds on new path", async () => {
    const result = await afs.write(
      "/modules/create-module/newfile",
      { content: "New content" },
      { mode: "create" },
    );
    expect(result.data?.content).toBe("New content");
  });

  // Bad path: denied write modes
  test("write() with no mode (= replace) is denied", async () => {
    await expect(
      afs.write("/modules/create-module/existing", { content: "Overwrite" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: replace) is denied", async () => {
    await expect(
      afs.write("/modules/create-module/existing", { content: "X" }, { mode: "replace" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: append) is denied", async () => {
    await expect(
      afs.write("/modules/create-module/existing", { content: "X" }, { mode: "append" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: update) is denied", async () => {
    await expect(
      afs.write("/modules/create-module/existing", { content: "X" }, { mode: "update" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: patch) is denied", async () => {
    await expect(
      afs.write(
        "/modules/create-module/existing",
        { patches: [{ op: "str_replace", target: "Original", content: "New" }] },
        { mode: "patch" },
      ),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: prepend) is denied", async () => {
    await expect(
      afs.write("/modules/create-module/existing", { content: "prefix" }, { mode: "prepend" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("delete() is denied", async () => {
    await expect(afs.delete("/modules/create-module/existing")).rejects.toThrow(/access mode/i);
  });

  test("rename() is denied", async () => {
    await expect(
      afs.rename("/modules/create-module/existing", "/modules/create-module/renamed"),
    ).rejects.toThrow(/access mode/i);
  });

  // Edge case: create mode allows the write through, then provider-level create-exists
  // check may or may not fire (depends on provider). The access mode guard does NOT
  // block write(mode: "create") — that's the whole point.
  test("write(mode: create) passes access mode guard", async () => {
    // This should NOT throw AFSAccessModeError — the guard allows create mode through
    const result = await afs.write(
      "/modules/create-module/newfile2",
      { content: "OK" },
      { mode: "create" },
    );
    expect(result.data?.content).toBe("OK");
  });

  // Read operations still work
  test("read() works normally", async () => {
    const result = await afs.read("/modules/create-module/existing/content");
    expect(result.data?.content).toBe("Original content");
  });

  test("list() works normally", async () => {
    const result = await afs.list("/modules/create-module");
    expect(result.data.length).toBeGreaterThan(0);
  });

  test("search() works normally", async () => {
    const result = await afs.search("/modules/create-module", "Original");
    expect(result.data.length).toBeGreaterThan(0);
  });

  // Error quality
  test("error has correct code", async () => {
    try {
      await afs.write("/modules/create-module/existing", { content: "X" });
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.code).toBe("AFS_ACCESS_MODE");
    }
  });

  test("error message includes access mode and attempted operation", async () => {
    try {
      await afs.write("/modules/create-module/existing", { content: "X" });
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.message).toContain("create");
      expect(error.message).toContain("replace");
    }
  });
});

// ── append mode ──

describe("accessMode: append", () => {
  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createModule("append"));
  });

  // Happy path
  test("write(mode: create) succeeds on new path", async () => {
    const result = await afs.write(
      "/modules/append-module/newfile",
      { content: "New" },
      { mode: "create" },
    );
    expect(result.data?.content).toBe("New");
  });

  test("write(mode: append) succeeds on existing path", async () => {
    const result = await afs.write(
      "/modules/append-module/existing/content",
      { content: " appended" },
      { mode: "append" },
    );
    expect(result.data).toBeDefined();
  });

  // Bad path: denied modes
  test("write() with no mode (= replace) is denied", async () => {
    await expect(afs.write("/modules/append-module/existing", { content: "X" })).rejects.toThrow(
      /access mode/i,
    );
  });

  test("write(mode: replace) is denied", async () => {
    await expect(
      afs.write("/modules/append-module/existing", { content: "X" }, { mode: "replace" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: update) is denied", async () => {
    await expect(
      afs.write("/modules/append-module/existing", { content: "X" }, { mode: "update" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: patch) is denied", async () => {
    await expect(
      afs.write(
        "/modules/append-module/existing",
        { patches: [{ op: "str_replace", target: "a", content: "b" }] },
        { mode: "patch" },
      ),
    ).rejects.toThrow(/access mode/i);
  });

  test("write(mode: prepend) is denied", async () => {
    await expect(
      afs.write("/modules/append-module/existing", { content: "X" }, { mode: "prepend" }),
    ).rejects.toThrow(/access mode/i);
  });

  test("delete() is denied", async () => {
    await expect(afs.delete("/modules/append-module/existing")).rejects.toThrow(/access mode/i);
  });

  test("rename() is denied", async () => {
    await expect(
      afs.rename("/modules/append-module/existing", "/modules/append-module/renamed"),
    ).rejects.toThrow(/access mode/i);
  });

  // Read operations still work
  test("read() works normally", async () => {
    const result = await afs.read("/modules/append-module/existing/content");
    expect(result.data?.content).toBe("Original content");
  });

  test("list() works normally", async () => {
    const result = await afs.list("/modules/append-module");
    expect(result.data.length).toBeGreaterThan(0);
  });

  test("search() works normally", async () => {
    const result = await afs.search("/modules/append-module", "Original");
    expect(result.data.length).toBeGreaterThan(0);
  });
});

// ── readwrite mode (backward compat) ──

describe("accessMode: readwrite (backward compat)", () => {
  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createModule("readwrite"));
  });

  test("write(replace) succeeds", async () => {
    const result = await afs.write("/modules/readwrite-module/existing/content", {
      content: "Updated",
    });
    expect(result.data?.content).toBe("Updated");
  });

  test("write(create) succeeds on new path", async () => {
    const result = await afs.write(
      "/modules/readwrite-module/newfile",
      { content: "New" },
      { mode: "create" },
    );
    expect(result.data?.content).toBe("New");
  });

  test("delete succeeds", async () => {
    const result = await afs.delete("/modules/readwrite-module/existing/content");
    expect(result.message).toContain("deleted");
  });

  test("rename succeeds", async () => {
    const result = await afs.rename(
      "/modules/readwrite-module/existing/content",
      "/modules/readwrite-module/renamed/content",
    );
    expect(result.message).toContain("renamed");
  });
});

// ── readonly mode (unchanged behavior) ──

describe("accessMode: readonly (unchanged)", () => {
  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createModule("readonly"));
  });

  test("write is denied with AFSReadonlyError", async () => {
    await expect(
      afs.write("/modules/readonly-module/existing", { content: "X" }),
    ).rejects.toBeInstanceOf(AFSReadonlyError);
  });

  test("delete is denied with AFSReadonlyError", async () => {
    await expect(afs.delete("/modules/readonly-module/existing")).rejects.toBeInstanceOf(
      AFSReadonlyError,
    );
  });

  test("read works normally", async () => {
    const result = await afs.read("/modules/readonly-module/existing/content");
    expect(result.data?.content).toBe("Original content");
  });
});

// ── Security: error messages ──

describe("security: error messages", () => {
  test("AFSAccessModeError does not expose file content", async () => {
    afs = new AFS();
    await afs.mount(createModule("create"));

    try {
      await afs.write("/modules/create-module/existing", { content: "secret-data-12345" });
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.message).not.toContain("secret-data-12345");
      expect(error.message).not.toContain("Original content");
    }
  });
});

// ── Data integrity ──

describe("data integrity", () => {
  test("create mode prevents accidental overwrite", async () => {
    afs = new AFS();
    await afs.mount(createModule("create"));

    // Try to overwrite via replace — should be denied before reaching provider
    await expect(
      afs.write("/modules/create-module/existing/content", { content: "Overwrite" }),
    ).rejects.toThrow();

    // Original content should be intact
    const result = await afs.read("/modules/create-module/existing/content");
    expect(result.data?.content).toBe("Original content");
  });

  test("append mode prevents truncation", async () => {
    afs = new AFS();
    await afs.mount(createModule("append"));

    // Try to replace — should be denied
    await expect(
      afs.write("/modules/append-module/existing/content", { content: "Replacement" }),
    ).rejects.toThrow();

    // Original content should be intact
    const result = await afs.read("/modules/append-module/existing/content");
    expect(result.data?.content).toBe("Original content");
  });
});

// ── Default access mode ──

describe("default access mode", () => {
  test("default is still readonly (backward compat)", async () => {
    const module = {
      name: "no-mode-module",
      stat: async (path: string) => ({ data: { id: path.split("/").pop() || "/", path } }),
      write: async () => ({ data: { id: "x", path: "/x" } }),
    };
    afs = new AFS();
    await afs.mount(module);

    await expect(
      afs.write("/modules/no-mode-module/x", { content: "test" }),
    ).rejects.toBeInstanceOf(AFSReadonlyError);
  });
});
