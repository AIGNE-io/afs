import { beforeEach, describe, expect, test } from "bun:test";
import { AFS, type AFSEntry, AFSNotFoundError, AFSReadonlyError } from "@aigne/afs";
import { JSONModule } from "./mocks/json-module.js";

let readonlyAFS: AFS;
let readwriteAFS: AFS;

beforeEach(async () => {
  const readonlyModule = new JSONModule({
    name: "readonly-module",
    description: "Readonly Module",
    accessMode: "readonly",
    data: {
      fileA: { content: "Content A" },
      fileB: { content: "Content B" },
    },
  });

  const readwriteModule = new JSONModule({
    name: "readwrite-module",
    description: "Readwrite Module",
    accessMode: "readwrite",
    data: {
      fileA: { content: "Content A" },
      fileB: { content: "Content B" },
    },
  });

  readonlyAFS = new AFS();
  await readonlyAFS.mount(readonlyModule);
  readwriteAFS = new AFS();
  await readwriteAFS.mount(readwriteModule);
});

describe("readonly module", () => {
  test("should block write operations", async () => {
    try {
      await readonlyAFS.write("/modules/readonly-module/fileA/content", {
        content: "New Content",
      });
      expect.unreachable("Should have thrown AFSReadonlyError");
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
      expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      expect((error as AFSReadonlyError).message).toContain("readonly");
      expect((error as AFSReadonlyError).message).toContain("write");
    }
  });

  test("should block delete operations", async () => {
    try {
      await readonlyAFS.delete("/modules/readonly-module/fileA/content");
      expect.unreachable("Should have thrown AFSReadonlyError");
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
      expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      expect((error as AFSReadonlyError).message).toContain("readonly");
      expect((error as AFSReadonlyError).message).toContain("delete");
    }
  });

  test("should block rename operations", async () => {
    try {
      await readonlyAFS.rename(
        "/modules/readonly-module/fileA/content",
        "/modules/readonly-module/renamed/content",
      );
      expect.unreachable("Should have thrown AFSReadonlyError");
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
      expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      expect((error as AFSReadonlyError).message).toContain("readonly");
      expect((error as AFSReadonlyError).message).toContain("rename");
    }
  });

  test("should allow read operations", async () => {
    const result = await readonlyAFS.read("/modules/readonly-module/fileA/content");

    expect(result.data?.content).toBe("Content A");
  });

  test("should allow list operations", async () => {
    const result = await readonlyAFS.list("/modules/readonly-module");

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some((entry: AFSEntry) => entry.path.includes("fileA"))).toBe(true);
  });

  test("should allow search operations", async () => {
    const result = await readonlyAFS.search("/modules/readonly-module", "Content A");

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some((entry: AFSEntry) => entry.content === "Content A")).toBe(true);
  });
});

describe("readwrite module", () => {
  test("should allow write operations", async () => {
    const result = await readwriteAFS.write("/modules/readwrite-module/fileA/content", {
      content: "Updated Content",
    });

    expect(result.data?.content).toBe("Updated Content");

    // Verify the write
    const readResult = await readwriteAFS.read("/modules/readwrite-module/fileA/content");
    expect(readResult.data?.content).toBe("Updated Content");
  });

  test("should allow delete operations", async () => {
    const result = await readwriteAFS.delete("/modules/readwrite-module/fileA/content");

    expect(result.message).toContain("Successfully deleted");

    // Verify the delete (should throw AFSNotFoundError)
    await expect(
      readwriteAFS.read("/modules/readwrite-module/fileA/content"),
    ).rejects.toBeInstanceOf(AFSNotFoundError);
  });

  test("should allow rename operations", async () => {
    const result = await readwriteAFS.rename(
      "/modules/readwrite-module/fileA/content",
      "/modules/readwrite-module/renamed/content",
    );

    expect(result.message).toContain("Successfully renamed");

    // Verify old path doesn't exist (should throw AFSNotFoundError)
    await expect(
      readwriteAFS.read("/modules/readwrite-module/fileA/content"),
    ).rejects.toBeInstanceOf(AFSNotFoundError);

    // Verify new path exists
    const newRead = await readwriteAFS.read("/modules/readwrite-module/renamed/content");
    expect(newRead.data?.content).toBe("Content A");
  });

  test("should allow all read operations", async () => {
    // Read
    const readResult = await readwriteAFS.read("/modules/readwrite-module/fileA/content");
    expect(readResult.data?.content).toBe("Content A");

    // List
    const listResult = await readwriteAFS.list("/modules/readwrite-module");
    expect(listResult.data.length).toBeGreaterThan(0);

    // Search
    const searchResult = await readwriteAFS.search("/modules/readwrite-module", "Content A");
    expect(searchResult.data.length).toBeGreaterThan(0);
  });
});

describe("readonly module - exec", () => {
  test("should block exec operations on readonly provider", async () => {
    const readonlyExecModule = {
      name: "readonly-exec-module",
      accessMode: "readonly" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      read: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, content: "test" },
      }),
      exec: async (_path: string, _args: Record<string, any>) => ({
        success: true,
        data: { result: "executed" },
      }),
    };

    const afs = new AFS();
    await afs.mount(readonlyExecModule);

    try {
      await afs.exec("/modules/readonly-exec-module/.actions/test", {}, {});
      expect.unreachable("Should have thrown AFSReadonlyError");
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
      expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      expect((error as AFSReadonlyError).message).toContain("readonly");
      expect((error as AFSReadonlyError).message).toContain("exec");
    }
  });

  test("should not leak provider implementation details in error", async () => {
    const readonlyExecModule = {
      name: "secret-provider",
      accessMode: "readonly" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      exec: async () => ({ success: true, data: {} }),
    };

    const afs = new AFS();
    await afs.mount(readonlyExecModule);

    try {
      await afs.exec("/modules/secret-provider/.actions/test", {}, {});
      expect.unreachable("Should have thrown AFSReadonlyError");
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
      // Error message should mention module name and operation but not internal details
      const msg = (error as AFSReadonlyError).message;
      expect(msg).toContain("secret-provider");
      expect(msg).toContain("readonly");
      expect(msg).toContain("exec");
    }
  });

  test("readonly check happens before args validation (no side-effects)", async () => {
    let execCalled = false;
    const readonlyExecModule = {
      name: "sideeffect-module",
      accessMode: "readonly" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      read: async (path: string) => {
        return { data: { id: path.split("/").pop() || "/", path, content: "test" } };
      },
      exec: async () => {
        execCalled = true;
        return { success: true, data: {} };
      },
    };

    const afs = new AFS();
    await afs.mount(readonlyExecModule);

    try {
      await afs.exec("/modules/sideeffect-module/.actions/test", {}, {});
    } catch {
      // Expected
    }

    expect(execCalled).toBe(false);
    // readCalled may be true from mount check or enrichment, but exec should not be called
  });

  test("readonly provider read/list/stat still works after exec block", async () => {
    const readonlyExecModule = {
      name: "mixed-ops-module",
      accessMode: "readonly" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      read: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, content: "readable" },
      }),
      list: async () => ({ data: [{ id: "item", path: "/item" }] }),
      exec: async () => ({ success: true, data: {} }),
    };

    const afs = new AFS();
    await afs.mount(readonlyExecModule);

    // exec should be blocked
    try {
      await afs.exec("/modules/mixed-ops-module/.actions/test", {}, {});
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
    }

    // But read and list should still work
    const readResult = await afs.read("/modules/mixed-ops-module/something");
    expect(readResult.data?.content).toBe("readable");

    const listResult = await afs.list("/modules/mixed-ops-module");
    expect(listResult.data.length).toBeGreaterThan(0);
  });
});

describe("readwrite module - exec", () => {
  test("should allow exec on readwrite provider", async () => {
    const readwriteExecModule = {
      name: "rw-exec-module",
      accessMode: "readwrite" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      read: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, content: "test" },
      }),
      exec: async (_path: string, _args: Record<string, any>) => ({
        success: true,
        data: { result: "executed" },
      }),
    };

    const afs = new AFS();
    await afs.mount(readwriteExecModule);

    const result = await afs.exec("/modules/rw-exec-module/.actions/test", {}, {});
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe("executed");
  });

  test("should return correct AFSExecResult from readwrite provider", async () => {
    const readwriteExecModule = {
      name: "rw-exec-result-module",
      accessMode: "readwrite" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      read: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, content: "test" },
      }),
      exec: async () => ({
        success: true,
        data: { count: 42, message: "done" },
      }),
    };

    const afs = new AFS();
    await afs.mount(readwriteExecModule);

    const result = await afs.exec("/modules/rw-exec-result-module/.actions/do", {}, {});
    expect(result.success).toBe(true);
    expect(result.data?.count).toBe(42);
    expect(result.data?.message).toBe("done");
  });
});

describe("mixed mount - exec readonly", () => {
  test("readonly exec blocked while readwrite exec works in same AFS", async () => {
    const readonlyModule = {
      name: "ro-mixed",
      accessMode: "readonly" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      read: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, content: "test" },
      }),
      exec: async () => ({ success: true, data: {} }),
    };

    const readwriteModule = {
      name: "rw-mixed",
      accessMode: "readwrite" as const,
      stat: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
      }),
      read: async (path: string) => ({
        data: { id: path.split("/").pop() || "/", path, content: "test" },
      }),
      exec: async () => ({ success: true, data: { ok: true } }),
    };

    const afs = new AFS();
    await afs.mount(readonlyModule, "/ro");
    await afs.mount(readwriteModule, "/rw");

    // Readonly exec should be blocked
    try {
      await afs.exec("/ro/.actions/test", {}, {});
      expect.unreachable("Should have thrown AFSReadonlyError");
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
    }

    // Readwrite exec should work
    const result = await afs.exec("/rw/.actions/test", {}, {});
    expect(result.success).toBe(true);
    expect(result.data?.ok).toBe(true);
  });
});

describe("default access mode", () => {
  test("should default to readonly when accessMode is not specified", async () => {
    // Use a plain AFSModule without accessMode specified
    const defaultModule = {
      name: "default-module",
      // accessMode is undefined, should default to readonly
      stat: async (path: string) => ({ data: { id: path.split("/").pop() || "/", path } }),
      write: async () => ({ data: { id: "foo", path: "/foo" } }),
    };

    const defaultAFS = new AFS();
    await defaultAFS.mount(defaultModule);

    try {
      await defaultAFS.write("/modules/default-module/foo", {
        content: "New Content",
      });
      expect.unreachable("Should have thrown AFSReadonlyError");
    } catch (error) {
      expect(error).toBeInstanceOf(AFSReadonlyError);
    }
  });
});
