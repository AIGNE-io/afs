/**
 * AFS Namespace Isolation Tests
 *
 * Tests for namespace support in AFS mount and operations:
 * - Default namespace (null) for mounts without explicit namespace
 * - Named namespaces for isolation
 * - Conflict detection within same namespace
 * - No conflict across different namespaces
 * - Operations using canonical paths
 *
 * Test categories:
 * 1. Mount with Namespace - Basic mounting behavior
 * 2. Namespace Isolation - Different namespaces don't conflict
 * 3. Conflict Detection - Same namespace path conflicts
 * 4. Operations - list, read, write with namespaces
 * 5. Mount Management - getMounts, getNamespaces, unmount
 * 6. Security - Namespace injection, traversal
 * 7. Edge Cases - Empty, special characters, unicode
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS, type AFSEntry, type AFSModule } from "@aigne/afs";

/**
 * Create a mock module for testing
 */
function createMockModule(
  name: string,
  options: {
    content?: Record<string, string>;
    accessMode?: "readonly" | "readwrite";
  } = {},
): AFSModule {
  const content = options.content ?? { "/file.txt": "default content" };

  return {
    name,
    description: `Mock module: ${name}`,
    accessMode: options.accessMode ?? "readonly",

    // Required for mount check
    stat: async (path) => ({
      data: { id: path.split("/").pop() || "/", path },
    }),

    list: async (path) => {
      const entries: AFSEntry[] = Object.keys(content)
        .filter((p) => p.startsWith(path === "/" ? "/" : `${path}/`) || p === path)
        .map((p) => ({
          id: p,
          path: p,
          summary: `Entry at ${p}`,
        }));
      return {
        data:
          entries.length > 0
            ? entries
            : [{ id: path, path, summary: "dir", meta: { childrenCount: 0 } }],
      };
    },

    read: async (path) => {
      const fileContent = content[path];
      if (fileContent !== undefined) {
        return { data: { id: path, path, content: fileContent } };
      }
      return { data: { id: path, path, content: `content of ${path}` } };
    },

    write:
      options.accessMode === "readwrite"
        ? async (path, data) => {
            content[path] = String(data.content);
            return { data: { id: path, path, content: String(data.content) } };
          }
        : undefined,

    search: async (path, query) => ({
      data: [{ id: "search-result", path, summary: `Found: ${query}` }],
    }),
  };
}

// =============================================================================
// 1. MOUNT WITH NAMESPACE - Basic Mounting Behavior
// =============================================================================

describe("Namespace: Mount with Namespace", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  describe("default namespace (no namespace specified)", () => {
    test("mounts to default namespace when not specified", async () => {
      await afs.mount(createMockModule("src"), "/src");

      const mounts = afs.getMounts();
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.namespace).toBeNull();
      expect(mounts[0]!.path).toBe("/src");
    });

    test("mounts to default namespace with explicit null", async () => {
      await afs.mount(createMockModule("src"), "/src", { namespace: null });

      const mounts = afs.getMounts();
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.namespace).toBeNull();
    });

    test("mounts to default namespace with explicit undefined", async () => {
      await afs.mount(createMockModule("src"), "/src", { namespace: undefined });

      const mounts = afs.getMounts();
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.namespace).toBeNull();
    });

    test("multiple mounts to default namespace with different paths", async () => {
      await afs.mount(createMockModule("src"), "/src");
      await afs.mount(createMockModule("config"), "/config");

      const mounts = afs.getMounts();
      expect(mounts).toHaveLength(2);
      expect(mounts.every((m) => m.namespace === null)).toBe(true);
    });
  });

  describe("named namespace", () => {
    test("mounts to named namespace", async () => {
      await afs.mount(createMockModule("api"), "/api", { namespace: "staging" });

      const mounts = afs.getMounts("staging");
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.namespace).toBe("staging");
      expect(mounts[0]!.path).toBe("/api");
    });

    test("mounts multiple modules to same namespace", async () => {
      await afs.mount(createMockModule("api"), "/api", { namespace: "staging" });
      await afs.mount(createMockModule("db"), "/db", { namespace: "staging" });

      const mounts = afs.getMounts("staging");
      expect(mounts).toHaveLength(2);
    });

    test("mounts to multiple different namespaces", async () => {
      await afs.mount(createMockModule("api1"), "/api", { namespace: "staging" });
      await afs.mount(createMockModule("api2"), "/api", { namespace: "prod" });

      expect(afs.getMounts("staging")).toHaveLength(1);
      expect(afs.getMounts("prod")).toHaveLength(1);
    });
  });

  describe("mixed namespaces", () => {
    test("mounts to both default and named namespaces", async () => {
      await afs.mount(createMockModule("local"), "/src");
      await afs.mount(createMockModule("remote"), "/api", { namespace: "staging" });

      const defaultMounts = afs.getMounts(null);
      const stagingMounts = afs.getMounts("staging");

      expect(defaultMounts).toHaveLength(1);
      expect(stagingMounts).toHaveLength(1);
    });
  });
});

// =============================================================================
// 2. NAMESPACE ISOLATION - Different Namespaces Don't Conflict
// =============================================================================

describe("Namespace: Isolation", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  test("same path in different namespaces does not conflict", async () => {
    await afs.mount(createMockModule("staging-api"), "/api", { namespace: "staging" });
    await afs.mount(createMockModule("prod-api"), "/api", { namespace: "prod" });

    expect(afs.getMounts("staging")).toHaveLength(1);
    expect(afs.getMounts("prod")).toHaveLength(1);
  });

  test("same path in default and named namespace does not conflict", async () => {
    await afs.mount(createMockModule("local-api"), "/api");
    await afs.mount(createMockModule("staging-api"), "/api", { namespace: "staging" });

    expect(afs.getMounts(null)).toHaveLength(1);
    expect(afs.getMounts("staging")).toHaveLength(1);
  });

  test("root mount in different namespaces does not conflict", async () => {
    await afs.mount(createMockModule("default-root"), "/", { namespace: null });
    await afs.mount(createMockModule("staging-root"), "/", { namespace: "staging" });
  });

  test("nested paths in different namespaces do not conflict", async () => {
    await afs.mount(createMockModule("m1"), "/api", { namespace: "a" });
    await afs.mount(createMockModule("m2"), "/api/v1", { namespace: "b" });
  });

  test("operations access correct namespace", async () => {
    const stagingContent = { "/data.json": '{"env":"staging"}' };
    const prodContent = { "/data.json": '{"env":"prod"}' };

    await afs.mount(createMockModule("staging", { content: stagingContent }), "/config", {
      namespace: "staging",
    });
    await afs.mount(createMockModule("prod", { content: prodContent }), "/config", {
      namespace: "prod",
    });

    const stagingResult = await afs.read("$afs:staging/config/data.json");
    const prodResult = await afs.read("$afs:prod/config/data.json");

    expect(stagingResult.data?.content).toContain("staging");
    expect(prodResult.data?.content).toContain("prod");
  });
});

// =============================================================================
// 3. CONFLICT DETECTION - Same Namespace Path Conflicts
// =============================================================================

describe("Namespace: Conflict Detection", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  describe("exact path conflict", () => {
    test("throws on duplicate path in default namespace", async () => {
      await afs.mount(createMockModule("m1"), "/src");

      await expect(afs.mount(createMockModule("m2"), "/src")).rejects.toThrow(/conflict/i);
    });

    test("throws on duplicate path in named namespace", async () => {
      await afs.mount(createMockModule("m1"), "/api", { namespace: "staging" });

      await expect(
        afs.mount(createMockModule("m2"), "/api", { namespace: "staging" }),
      ).rejects.toThrow(/conflict/i);
    });

    test("allows replace with replace option", async () => {
      await afs.mount(createMockModule("m1"), "/src");

      await afs.mount(createMockModule("m2"), "/src", { replace: true });

      const mounts = afs.getMounts();
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.module.name).toBe("m2");
    });

    test("allows replace in named namespace", async () => {
      await afs.mount(createMockModule("m1"), "/api", { namespace: "staging" });

      await afs.mount(createMockModule("m2"), "/api", { namespace: "staging", replace: true });

      const mounts = afs.getMounts("staging");
      expect(mounts[0]!.module.name).toBe("m2");
    });
  });

  describe("parent-child path conflict", () => {
    test("throws when parent path already mounted", async () => {
      await afs.mount(createMockModule("parent"), "/api");

      await expect(afs.mount(createMockModule("child"), "/api/v1")).rejects.toThrow(/conflict/i);
    });

    test("throws when child path already mounted", async () => {
      await afs.mount(createMockModule("child"), "/api/v1");

      await expect(afs.mount(createMockModule("parent"), "/api")).rejects.toThrow(/conflict/i);
    });

    test("parent-child conflict only within same namespace", async () => {
      await afs.mount(createMockModule("parent"), "/api", { namespace: "a" });

      // Different namespace, should not conflict
      await afs.mount(createMockModule("child"), "/api/v1", { namespace: "b" });
    });
  });

  describe("root mount conflict", () => {
    test("throws when mounting over root", async () => {
      await afs.mount(createMockModule("root"), "/");

      await expect(afs.mount(createMockModule("sub"), "/anything")).rejects.toThrow(/conflict/i);
    });

    test("throws when mounting root over existing", async () => {
      await afs.mount(createMockModule("sub"), "/src");

      await expect(afs.mount(createMockModule("root"), "/")).rejects.toThrow(/conflict/i);
    });
  });
});

// =============================================================================
// 4. OPERATIONS - list, read, write with Namespaces
// =============================================================================

describe("Namespace: Operations", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  describe("list operation", () => {
    test("list using canonical path for default namespace", async () => {
      await afs.mount(createMockModule("src"), "/src");

      const result = await afs.list("$afs/src");
      expect(result.data).toBeDefined();
    });

    test("list using canonical path for named namespace", async () => {
      await afs.mount(createMockModule("api"), "/api", { namespace: "staging" });

      const result = await afs.list("$afs:staging/api");
      expect(result.data).toBeDefined();
    });

    test("list returns empty for non-existent namespace", async () => {
      // Non-existent namespace returns empty results (consistent with fs semantics)
      const result = await afs.list("$afs:nonexistent/path");
      expect(result.data).toHaveLength(0);
    });

    test("list returns empty for unmounted path in namespace", async () => {
      await afs.mount(createMockModule("api"), "/api", { namespace: "staging" });

      // Unmounted path returns empty results
      const result = await afs.list("$afs:staging/other");
      expect(result.data).toHaveLength(0);
    });
  });

  describe("read operation", () => {
    test("read using canonical path for default namespace", async () => {
      const content = { "/file.txt": "hello world" };
      await afs.mount(createMockModule("src", { content }), "/src");

      const result = await afs.read("$afs/src/file.txt");
      expect(result.data?.content).toBe("hello world");
    });

    test("read using canonical path for named namespace", async () => {
      const content = { "/config.json": '{"key":"value"}' };
      await afs.mount(createMockModule("config", { content }), "/config", { namespace: "prod" });

      const result = await afs.read("$afs:prod/config/config.json");
      expect(result.data?.content).toContain("key");
    });

    test("read from correct namespace when same path exists in multiple", async () => {
      const stagingContent = { "/env": "staging" };
      const prodContent = { "/env": "production" };

      await afs.mount(createMockModule("staging", { content: stagingContent }), "/config", {
        namespace: "staging",
      });
      await afs.mount(createMockModule("prod", { content: prodContent }), "/config", {
        namespace: "prod",
      });

      const stagingResult = await afs.read("$afs:staging/config/env");
      const prodResult = await afs.read("$afs:prod/config/env");

      expect(stagingResult.data?.content).toBe("staging");
      expect(prodResult.data?.content).toBe("production");
    });
  });

  describe("write operation", () => {
    test("write using canonical path for default namespace", async () => {
      await afs.mount(createMockModule("src", { accessMode: "readwrite" }), "/src");

      const result = await afs.write("$afs/src/new.txt", { content: "new content" });
      expect(result.data).toBeDefined();
    });

    test("write using canonical path for named namespace", async () => {
      await afs.mount(createMockModule("data", { accessMode: "readwrite" }), "/data", {
        namespace: "staging",
      });

      const result = await afs.write("$afs:staging/data/new.txt", { content: "staging data" });
      expect(result.data).toBeDefined();
    });

    test("write to correct namespace isolation", async () => {
      const stagingContent: Record<string, string> = {};
      const prodContent: Record<string, string> = {};

      await afs.mount(
        createMockModule("staging", { content: stagingContent, accessMode: "readwrite" }),
        "/data",
        {
          namespace: "staging",
        },
      );
      await afs.mount(
        createMockModule("prod", { content: prodContent, accessMode: "readwrite" }),
        "/data",
        {
          namespace: "prod",
        },
      );

      await afs.write("$afs:staging/data/file.txt", { content: "staging" });
      await afs.write("$afs:prod/data/file.txt", { content: "production" });

      expect(stagingContent["/file.txt"]).toBe("staging");
      expect(prodContent["/file.txt"]).toBe("production");
    });
  });

  describe("search operation", () => {
    test("search using canonical path for default namespace", async () => {
      await afs.mount(createMockModule("src"), "/src");

      const result = await afs.search("$afs/src", "query");
      expect(result.data).toBeDefined();
    });

    test("search using canonical path for named namespace", async () => {
      await afs.mount(createMockModule("docs"), "/docs", { namespace: "user" });

      const result = await afs.search("$afs:user/docs", "query");
      expect(result.data).toBeDefined();
    });
  });
});

// =============================================================================
// 5. MOUNT MANAGEMENT - getMounts, getNamespaces, unmount
// =============================================================================

describe("Namespace: Mount Management", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  describe("getMounts", () => {
    test("returns all mounts when no namespace specified", async () => {
      await afs.mount(createMockModule("m1"), "/a");
      await afs.mount(createMockModule("m2"), "/b", { namespace: "ns" });

      const mounts = afs.getMounts();
      expect(mounts).toHaveLength(2);
    });

    test("returns only default namespace mounts with null", async () => {
      await afs.mount(createMockModule("m1"), "/a");
      await afs.mount(createMockModule("m2"), "/b", { namespace: "ns" });

      const mounts = afs.getMounts(null);
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.path).toBe("/a");
    });

    test("returns only named namespace mounts", async () => {
      await afs.mount(createMockModule("m1"), "/a");
      await afs.mount(createMockModule("m2"), "/b", { namespace: "ns" });

      const mounts = afs.getMounts("ns");
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.path).toBe("/b");
    });

    test("returns empty array for non-existent namespace", async () => {
      await afs.mount(createMockModule("m1"), "/a");

      const mounts = afs.getMounts("nonexistent");
      expect(mounts).toHaveLength(0);
    });
  });

  describe("getNamespaces", () => {
    test("returns empty array when no mounts", async () => {
      const namespaces = afs.getNamespaces();
      expect(namespaces).toHaveLength(0);
    });

    test("returns null for default namespace mounts", async () => {
      await afs.mount(createMockModule("m1"), "/a");

      const namespaces = afs.getNamespaces();
      expect(namespaces).toContain(null);
    });

    test("returns all defined namespaces", async () => {
      await afs.mount(createMockModule("m1"), "/a");
      await afs.mount(createMockModule("m2"), "/b", { namespace: "staging" });
      await afs.mount(createMockModule("m3"), "/c", { namespace: "prod" });

      const namespaces = afs.getNamespaces();
      expect(namespaces).toHaveLength(3);
      expect(namespaces).toContain(null);
      expect(namespaces).toContain("staging");
      expect(namespaces).toContain("prod");
    });

    test("does not duplicate namespaces", async () => {
      await afs.mount(createMockModule("m1"), "/a", { namespace: "ns" });
      await afs.mount(createMockModule("m2"), "/b", { namespace: "ns" });

      const namespaces = afs.getNamespaces();
      expect(namespaces.filter((n) => n === "ns")).toHaveLength(1);
    });
  });

  describe("unmount", () => {
    test("unmounts from default namespace", async () => {
      await afs.mount(createMockModule("m1"), "/src");

      const result = afs.unmount("/src");
      expect(result).toBe(true);
      expect(afs.getMounts()).toHaveLength(0);
    });

    test("unmounts from named namespace", async () => {
      await afs.mount(createMockModule("m1"), "/api", { namespace: "staging" });

      const result = afs.unmount("/api", "staging");
      expect(result).toBe(true);
      expect(afs.getMounts("staging")).toHaveLength(0);
    });

    test("returns false when path not found", async () => {
      const result = afs.unmount("/nonexistent");
      expect(result).toBe(false);
    });

    test("returns false when path in wrong namespace", async () => {
      await afs.mount(createMockModule("m1"), "/api", { namespace: "staging" });

      // Try to unmount from default namespace
      const result = afs.unmount("/api", null);
      expect(result).toBe(false);

      // Original mount still exists
      expect(afs.getMounts("staging")).toHaveLength(1);
    });

    test("only unmounts from specified namespace", async () => {
      await afs.mount(createMockModule("m1"), "/api", { namespace: "staging" });
      await afs.mount(createMockModule("m2"), "/api", { namespace: "prod" });

      afs.unmount("/api", "staging");

      expect(afs.getMounts("staging")).toHaveLength(0);
      expect(afs.getMounts("prod")).toHaveLength(1);
    });
  });

  describe("isMounted", () => {
    test("returns true for mounted path in default namespace", async () => {
      await afs.mount(createMockModule("m1"), "/src");

      expect(afs.isMounted("/src")).toBe(true);
      expect(afs.isMounted("/src", null)).toBe(true);
    });

    test("returns true for mounted path in named namespace", async () => {
      await afs.mount(createMockModule("m1"), "/api", { namespace: "staging" });

      expect(afs.isMounted("/api", "staging")).toBe(true);
    });

    test("returns false for unmounted path", async () => {
      expect(afs.isMounted("/nonexistent")).toBe(false);
    });

    test("returns false for path in wrong namespace", async () => {
      await afs.mount(createMockModule("m1"), "/api", { namespace: "staging" });

      expect(afs.isMounted("/api", null)).toBe(false);
      expect(afs.isMounted("/api", "prod")).toBe(false);
    });
  });
});

// =============================================================================
// 6. SECURITY - Namespace Injection, Traversal
// =============================================================================

describe("Namespace: Security", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  describe("namespace name validation", () => {
    test("rejects namespace with /", async () => {
      await expect(
        afs.mount(createMockModule("m"), "/path", { namespace: "ns/bad" }),
      ).rejects.toThrow();
    });

    test("rejects namespace with :", async () => {
      await expect(
        afs.mount(createMockModule("m"), "/path", { namespace: "ns:bad" }),
      ).rejects.toThrow();
    });

    test("rejects namespace with shell metachar ;", async () => {
      await expect(
        afs.mount(createMockModule("m"), "/path", { namespace: "ns;rm" }),
      ).rejects.toThrow();
    });

    test("rejects namespace with shell metachar |", async () => {
      await expect(
        afs.mount(createMockModule("m"), "/path", { namespace: "ns|cat" }),
      ).rejects.toThrow();
    });

    test("rejects empty namespace", async () => {
      await expect(afs.mount(createMockModule("m"), "/path", { namespace: "" })).rejects.toThrow();
    });

    test("rejects whitespace namespace", async () => {
      await expect(
        afs.mount(createMockModule("m"), "/path", { namespace: "   " }),
      ).rejects.toThrow();
    });

    test("rejects namespace with NUL", async () => {
      await expect(
        afs.mount(createMockModule("m"), "/path", { namespace: "ns\x00bad" }),
      ).rejects.toThrow();
    });

    test("rejects namespace with newline", async () => {
      await expect(
        afs.mount(createMockModule("m"), "/path", { namespace: "ns\nbad" }),
      ).rejects.toThrow();
    });
  });

  describe("path traversal via canonical path", () => {
    test("normalizes .. in canonical path", async () => {
      await afs.mount(createMockModule("src"), "/src");

      // Should normalize and not escape
      const result = await afs.list("$afs/src/../src");
      expect(result.data).toBeDefined();
    });

    test("cannot escape namespace via ..", async () => {
      await afs.mount(createMockModule("staging"), "/api", { namespace: "staging" });
      await afs.mount(createMockModule("prod"), "/api", { namespace: "prod" });

      // .. in path should not cross namespace boundaries
      // (namespaces are logical, not path-based)
      const result = await afs.read("$afs:staging/api/../api");
      expect(result.data).toBeDefined();
    });
  });

  describe("canonical path injection", () => {
    test("literal $afs in path is not treated as namespace reference", async () => {
      await afs.mount(createMockModule("weird"), "/weird");

      // Path containing literal $afs should be handled correctly
      // This tests that we don't double-parse:
      // $afs/weird/$afs:hack/path → namespace=null, path=/weird/$afs:hack/path
      // The $afs:hack part is NOT re-parsed, it's a literal path segment
      // This is correct and safe behavior - no double parsing occurs
      const result = await afs.list("$afs/weird/$afs:hack/path");
      // Should succeed and return results (from mock module)
      expect(result.data).toBeDefined();
    });
  });
});

// =============================================================================
// 7. EDGE CASES - Empty, Special Characters, Unicode
// =============================================================================

describe("Namespace: Edge Cases", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  describe("namespace naming", () => {
    test("accepts single character namespace", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "a" });
    });

    test("accepts numeric namespace", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "123" });
    });

    test("accepts hyphenated namespace", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "my-namespace" });
    });

    test("accepts underscored namespace", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "my_namespace" });
    });

    test("accepts dotted namespace", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "my.namespace" });
    });

    test("accepts long namespace name", async () => {
      const longName = "a".repeat(200);
      await afs.mount(createMockModule("m"), "/path", { namespace: longName });
    });
  });

  describe("unicode namespaces", () => {
    test("accepts Chinese namespace name", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "测试" });

      const mounts = afs.getMounts("测试");
      expect(mounts).toHaveLength(1);
    });

    test("accepts Japanese namespace name", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "テスト" });
    });

    test("accepts emoji namespace name", async () => {
      await afs.mount(createMockModule("m"), "/path", { namespace: "🚀" });
    });
  });

  describe("case sensitivity", () => {
    test("namespace names are case-sensitive", async () => {
      await afs.mount(createMockModule("lower"), "/path", { namespace: "staging" });
      await afs.mount(createMockModule("upper"), "/path", { namespace: "Staging" });

      expect(afs.getMounts("staging")).toHaveLength(1);
      expect(afs.getMounts("Staging")).toHaveLength(1);
      expect(afs.getNamespaces()).toHaveLength(2);
    });
  });

  describe("path edge cases", () => {
    test("mounts to root path in namespace", async () => {
      await afs.mount(createMockModule("root"), "/", { namespace: "ns" });

      const mounts = afs.getMounts("ns");
      expect(mounts).toHaveLength(1);
      expect(mounts[0]!.path).toBe("/");
    });

    test("handles deep nested paths", async () => {
      const deepPath = "/a/b/c/d/e/f/g/h/i/j";
      await afs.mount(createMockModule("deep"), deepPath, { namespace: "ns" });

      const mounts = afs.getMounts("ns");
      expect(mounts[0]!.path).toBe(deepPath);
    });
  });

  describe("concurrent operations", () => {
    test("handles concurrent mounts to different namespaces", async () => {
      // Synchronous but simulates concurrent mounting
      for (let i = 0; i < 100; i++) {
        await afs.mount(createMockModule(`m${i}`), `/path${i}`, { namespace: `ns${i % 10}` });
      }

      // Should have 10 namespaces with 10 mounts each
      for (let i = 0; i < 10; i++) {
        expect(afs.getMounts(`ns${i}`)).toHaveLength(10);
      }
    });

    test("handles concurrent operations on different namespaces", async () => {
      await afs.mount(createMockModule("a"), "/data", { namespace: "a" });
      await afs.mount(createMockModule("b"), "/data", { namespace: "b" });
      await afs.mount(createMockModule("c"), "/data", { namespace: "c" });

      const operations = [
        afs.list("$afs:a/data"),
        afs.list("$afs:b/data"),
        afs.list("$afs:c/data"),
      ];

      const results = await Promise.all(operations);
      expect(results.every((r) => r.data !== undefined)).toBe(true);
    });
  });
});

// =============================================================================
// 8. BACKWARD COMPATIBILITY
// =============================================================================

describe("Namespace: Backward Compatibility", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  test("existing code without namespace continues to work", async () => {
    // Old-style mount without namespace option
    await afs.mount(createMockModule("src"), "/src");

    const mounts = afs.getMounts();
    expect(mounts).toHaveLength(1);
  });

  test("operations with regular paths work in default namespace", async () => {
    await afs.mount(createMockModule("src"), "/src");

    // Using canonical path for default namespace
    const result = await afs.list("$afs/src");
    expect(result.data).toBeDefined();
  });
});
