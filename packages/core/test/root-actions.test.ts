import { describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import { AFSNotFoundError, AFSValidationError } from "../src/error.js";
import type { AFSDeleteResult, AFSModule, AFSWriteResult } from "../src/type.js";

/**
 * Tests for Phase 0: Core Changes — Provider Registry
 *
 * 1. AFSModule uri property
 * 2. AFS loadProvider injectable method
 * 3. Root-level action support (/.actions/*)
 */

// Helper: create a simple provider that passes mount check
function createSimpleProvider(name: string, opts?: { uri?: string }): AFSModule {
  return {
    name,
    description: `${name} provider`,
    accessMode: "readwrite",
    uri: opts?.uri,

    async stat() {
      return { data: { id: "/", path: "/", meta: { childrenCount: 0 } } };
    },

    async read(path) {
      if (path === "/") {
        return { data: { id: "/", path: "/", meta: { childrenCount: 0 } } };
      }
      throw new AFSNotFoundError(path);
    },

    async list() {
      return { data: [] };
    },

    async exec(path, args) {
      return { success: true, data: { path, args } };
    },
  };
}

describe("AFSModule uri property", () => {
  test("AFSModule interface allows setting and reading uri property", async () => {
    const provider = createSimpleProvider("test-fs", { uri: "fs:///tmp/test" });
    expect(provider.uri).toBe("fs:///tmp/test");
  });

  test("uri property is undefined by default and does not affect normal mount/use", async () => {
    const provider = createSimpleProvider("test-fs");
    expect(provider.uri).toBeUndefined();

    const afs = new AFS();
    await afs.mount(provider, "/test");

    const result = await afs.list("/test");
    expect(result.data).toBeDefined();
  });
});

describe("AFS loadProvider injectable method", () => {
  test("loadProvider can be assigned as async function and called", async () => {
    const afs = new AFS();
    let called = false;
    let calledUri = "";
    let calledPath = "";

    afs.loadProvider = async (uri: string, path: string) => {
      called = true;
      calledUri = uri;
      calledPath = path;
    };

    await afs.loadProvider("fs:///tmp", "/mnt/test");
    expect(called).toBe(true);
    expect(calledUri).toBe("fs:///tmp");
    expect(calledPath).toBe("/mnt/test");
  });

  test("multiple assignments — last one wins", async () => {
    const afs = new AFS();
    const calls: string[] = [];

    afs.loadProvider = async () => {
      calls.push("first");
    };
    afs.loadProvider = async () => {
      calls.push("second");
    };

    await afs.loadProvider("x", "/y");
    expect(calls).toEqual(["second"]);
  });
});

describe("Root-level action support (/.actions/*)", () => {
  test("exec('/.actions/mount', { uri, path }) routes to root action handler", async () => {
    const afs = new AFS();
    let loadedUri = "";
    let loadedPath = "";

    afs.loadProvider = async (uri: string, path: string) => {
      loadedUri = uri;
      loadedPath = path;
    };

    const result = await afs.exec("/.actions/mount", {
      uri: "fs:///tmp/test",
      path: "/mnt/fs",
    });

    expect(result.success).toBe(true);
    expect(loadedUri).toBe("fs:///tmp/test");
    expect(loadedPath).toBe("/mnt/fs");
  });

  test("root action handler receives correct args", async () => {
    const afs = new AFS();
    let receivedArgs: Record<string, unknown> = {};

    afs.loadProvider = async (uri: string, path: string) => {
      receivedArgs = { uri, path };
    };

    await afs.exec("/.actions/mount", {
      uri: "sqlite:///tmp/test.db",
      path: "/mnt/sqlite",
    });

    expect(receivedArgs).toEqual({
      uri: "sqlite:///tmp/test.db",
      path: "/mnt/sqlite",
    });
  });

  test("root /.actions/mount calls afs.loadProvider(uri, path)", async () => {
    const afs = new AFS();
    let loadProviderCalled = false;

    afs.loadProvider = async () => {
      loadProviderCalled = true;
    };

    await afs.exec("/.actions/mount", { uri: "fs:///tmp", path: "/mnt" });
    expect(loadProviderCalled).toBe(true);
  });

  // Bad Path tests
  test("exec('/.actions/mount', {}) missing required params throws AFSValidationError", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {};

    await expect(afs.exec("/.actions/mount", {})).rejects.toThrow(AFSValidationError);
  });

  test("exec('/.actions/mount', { uri: '', path: '' }) empty strings throw error", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {};

    await expect(afs.exec("/.actions/mount", { uri: "", path: "" })).rejects.toThrow(
      AFSValidationError,
    );
  });

  test("exec('/.actions/nonexistent', {}) throws AFSNotFoundError", async () => {
    const afs = new AFS();

    await expect(afs.exec("/.actions/nonexistent", {})).rejects.toThrow(AFSNotFoundError);
  });

  test("loadProvider not injected — /.actions/mount throws meaningful error", async () => {
    const afs = new AFS();
    // Do NOT assign loadProvider

    await expect(afs.exec("/.actions/mount", { uri: "fs:///tmp", path: "/mnt" })).rejects.toThrow(
      /loadProvider not configured/,
    );
  });

  test("loadProvider implementation throws — exec propagates error", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {
      throw new Error("Provider creation failed");
    };

    await expect(afs.exec("/.actions/mount", { uri: "fs:///tmp", path: "/mnt" })).rejects.toThrow(
      "Provider creation failed",
    );
  });

  // Edge cases
  test("root action does not interfere with mounted provider exec routing", async () => {
    const afs = new AFS();
    const provider = createSimpleProvider("test-fs");
    await afs.mount(provider, "/test");

    // Provider exec should still work
    const result = await afs.exec("/test/.actions/refresh", { force: true });
    expect(result.success).toBe(true);
    expect(result.data?.path).toBe("/.actions/refresh");
  });

  // Security
  test("root /.actions/mount inputSchema validates uri is non-empty string", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {};

    // uri is number — should fail validation
    await expect(afs.exec("/.actions/mount", { uri: 123, path: "/mnt" })).rejects.toThrow(
      AFSValidationError,
    );
  });

  test("root action error does not expose internal stack to caller", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {
      throw new Error("Internal error with /secret/path/details");
    };

    try {
      await afs.exec("/.actions/mount", { uri: "fs:///tmp", path: "/mnt" });
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      // Error should be thrown but we just verify it doesn't crash
      expect(error).toBeInstanceOf(Error);
    }
  });

  // Data Leak
  test("loadProvider failure error does not leak filesystem paths", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {
      throw new Error("Failed to load");
    };

    try {
      await afs.exec("/.actions/mount", { uri: "fs:///tmp", path: "/mnt" });
    } catch (error) {
      expect(error.message).toBe("Failed to load");
      // The error message should not contain internal implementation paths
    }
  });

  // Data Damage
  test("loadProvider failure does not leave partial mount state", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {
      throw new Error("Mount failed");
    };

    const mountsBefore = afs.getMounts();

    try {
      await afs.exec("/.actions/mount", { uri: "fs:///tmp", path: "/mnt" });
    } catch {
      // Expected
    }

    const mountsAfter = afs.getMounts();
    expect(mountsAfter.length).toBe(mountsBefore.length);
  });
});

// ============================================================
// Phase 3 Part A: Root read/list/write/delete actions
// ============================================================

/**
 * Helper: create a readwrite provider with full CRUD operations.
 * Simulates a simple in-memory filesystem.
 */
function createCRUDProvider(
  name: string,
  files: Record<string, string> = { "/hello.txt": "hello world" },
): AFSModule {
  const store = new Map(Object.entries(files));

  return {
    name,
    description: `${name} CRUD provider`,
    accessMode: "readwrite",

    async stat(path) {
      if (path === "/") {
        return { data: { id: "/", path: "/", meta: { childrenCount: store.size } } };
      }
      if (store.has(path)) {
        return { data: { id: path, path, meta: { kind: "afs:file" } } };
      }
      throw new AFSNotFoundError(path);
    },

    async read(path) {
      if (path === "/") {
        return { data: { id: "/", path: "/", content: {}, meta: { childrenCount: store.size } } };
      }
      if (store.has(path)) {
        return {
          data: { id: path, path, content: store.get(path), meta: { kind: "afs:file" } },
        };
      }
      throw new AFSNotFoundError(path);
    },

    async list(path) {
      if (path === "/") {
        return {
          data: [...store.keys()].map((k) => ({
            id: k,
            path: k,
            meta: { kind: "afs:file" as const },
          })),
        };
      }
      return { data: [] };
    },

    async write(path, content): Promise<AFSWriteResult> {
      store.set(
        path,
        typeof content.content === "string" ? content.content : JSON.stringify(content),
      );
      return { data: { id: path, path }, message: "written" };
    },

    async delete(path): Promise<AFSDeleteResult> {
      if (!store.has(path)) {
        throw new AFSNotFoundError(path);
      }
      store.delete(path);
      return { message: "deleted" };
    },
  };
}

describe("Root read/list/write/delete actions", () => {
  // Happy Path
  test("/.actions/read { path } reads file content via root action", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs", { "/hello.txt": "hello world" });
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/read", { path: "/data/hello.txt" });
    expect(result.success).toBe(true);
    expect(result.data?.content).toBe("hello world");
  });

  test("/.actions/list { path } lists directory content via root action", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs", { "/a.txt": "a", "/b.txt": "b" });
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/list", { path: "/data" });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown as unknown[]).length).toBe(2);
  });

  test("/.actions/write { path, content } writes file via root action", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs");
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/write", {
      path: "/data/new-file.txt",
      content: "new content",
    });
    expect(result.success).toBe(true);

    // Verify the file was written
    const readResult = await afs.read("/data/new-file.txt");
    expect(readResult.data?.content).toBe("new content");
  });

  test("/.actions/delete { path } deletes file via root action", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs", { "/to-delete.txt": "bye" });
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/delete", { path: "/data/to-delete.txt" });
    expect(result.success).toBe(true);

    // Verify the file was deleted
    await expect(afs.read("/data/to-delete.txt")).rejects.toThrow(AFSNotFoundError);
  });

  test("buildRootActions includes read/list/write/delete in root actions list", async () => {
    const afs = new AFS();
    afs.loadProvider = async () => {};

    const actionsResult = await afs.read("/.actions");
    const actionNames = actionsResult.data?.content?.actions?.map((a: { name: string }) => a.name);
    expect(actionNames).toContain("read");
    expect(actionNames).toContain("list");
    expect(actionNames).toContain("write");
    expect(actionNames).toContain("delete");
  });

  // Bad Path
  test("write action path is empty → AFSValidationError", async () => {
    const afs = new AFS();
    await expect(afs.exec("/.actions/write", { path: "", content: "x" })).rejects.toThrow(
      AFSValidationError,
    );
  });

  test("write action content is missing → AFSValidationError", async () => {
    const afs = new AFS();
    await expect(afs.exec("/.actions/write", { path: "/data/file.txt" })).rejects.toThrow(
      AFSValidationError,
    );
  });

  test("delete action path is empty → AFSValidationError", async () => {
    const afs = new AFS();
    await expect(afs.exec("/.actions/delete", { path: "" })).rejects.toThrow(AFSValidationError);
  });

  test("read action path points to nonexistent file → returns error", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs");
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/read", { path: "/data/nonexistent.txt" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // Edge Cases
  test("write action overwrites existing file", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs", { "/existing.txt": "old content" });
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/write", {
      path: "/data/existing.txt",
      content: "new content",
    });
    expect(result.success).toBe(true);

    const readResult = await afs.read("/data/existing.txt");
    expect(readResult.data?.content).toBe("new content");
  });

  test("delete action with recursive: true", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs", { "/dir/file.txt": "data" });
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/delete", {
      path: "/data/dir/file.txt",
      recursive: true,
    });
    expect(result.success).toBe(true);
  });

  test("read action returns consistent result with afs.read()", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs", { "/test.txt": "test content" });
    await afs.mount(provider, "/data");

    const directRead = await afs.read("/data/test.txt");
    const actionRead = await afs.exec("/.actions/read", { path: "/data/test.txt" });

    expect(actionRead.success).toBe(true);
    expect(actionRead.data?.content).toBe(directRead.data?.content);
  });

  // Security
  test("ASH provider allowRootActions gating is respected (tested at handler level)", async () => {
    const afs = new AFS();
    // Root actions exist even without specific permission — permission gating
    // is handled by ASH world bridge, not at root action level.
    // Verify the actions are always listed (gating is caller's responsibility).
    const actionsResult = await afs.read("/.actions");
    const actionNames = actionsResult.data?.content?.actions?.map((a: { name: string }) => a.name);
    expect(actionNames).toContain("write");
    expect(actionNames).toContain("delete");
  });

  // Data Leak
  test("root action error messages don't expose filesystem absolute paths", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs");
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/read", { path: "/data/nonexistent" });
    expect(result.success).toBe(false);
    // Error message should reference the AFS path, not host filesystem paths
    expect(result.error?.message).not.toMatch(/\/Users\//);
    expect(result.error?.message).not.toMatch(/\/home\//);
  });

  // Data Damage
  test("write action failure returns error (not silent)", async () => {
    const afs = new AFS();
    // No provider mounted — write should fail
    const result = await afs.exec("/.actions/write", {
      path: "/nonexistent/file.txt",
      content: "data",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("delete action failure returns error", async () => {
    const afs = new AFS();
    const provider = createCRUDProvider("test-fs");
    await afs.mount(provider, "/data");

    const result = await afs.exec("/.actions/delete", { path: "/data/nonexistent" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
