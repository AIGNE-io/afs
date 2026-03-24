import { describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import { AFSNotFoundError } from "../src/error.js";
import type { AFSModule } from "../src/type.js";

/**
 * Test AFS Core fallback mechanisms:
 * - stat -> read fallback (when provider has no stat method)
 * - list -> childrenCount fallback (when provider has no list method)
 * - explain -> read fallback (when provider has no explain method)
 */

// Helper to create minimal provider with only read method
// Automatically includes root "/" entry for mount check compatibility
function createReadOnlyProvider(
  entries: Record<string, { content?: string; meta?: Record<string, unknown> }>,
): AFSModule {
  // Ensure root path exists for mount check
  const allEntries: Record<string, { content?: string; meta?: Record<string, unknown> }> = {
    "/": { meta: {} },
    ...entries,
  };

  return {
    name: "read-only-provider",
    description: "Provider with only read method",
    accessMode: "readonly",

    async read(path) {
      const entry = allEntries[path];
      if (!entry) {
        throw new AFSNotFoundError(path);
      }
      return {
        data: {
          id: path,
          path,
          content: entry.content,
          meta: entry.meta,
        },
      };
    },
  };
}

// Helper to create provider with both stat and read
// Automatically includes root "/" entry for mount check compatibility
function _createFullProvider(
  entries: Record<
    string,
    { content?: string; meta?: Record<string, unknown>; statMeta?: Record<string, unknown> }
  >,
): AFSModule {
  // Ensure root path exists for mount check
  const allEntries: Record<
    string,
    { content?: string; meta?: Record<string, unknown>; statMeta?: Record<string, unknown> }
  > = { "/": { meta: {} }, ...entries };

  return {
    name: "full-provider",
    description: "Provider with stat and read",
    accessMode: "readonly",

    async read(path) {
      const entry = allEntries[path];
      if (!entry) {
        throw new AFSNotFoundError(path);
      }
      return {
        data: {
          id: path,
          path,
          content: entry.content,
          meta: entry.meta,
        },
      };
    },

    async stat(path) {
      const entry = allEntries[path];
      if (!entry) {
        throw new AFSNotFoundError(path);
      }
      return {
        data: {
          id: path.split("/").pop() || "/",
          path,
          meta: entry.statMeta ?? entry.meta,
        },
      };
    },
  };
}

describe("AFS Core Fallback", () => {
  describe("stat -> read fallback", () => {
    test("Provider without stat method: stat() calls read()", async () => {
      const provider = createReadOnlyProvider({
        "/test.txt": {
          content: "Hello World",
          meta: { description: "Test file" },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.stat("/test/test.txt");
      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/test/test.txt");
      expect(result.data?.meta?.description).toBe("Test file");
    });

    test("Fallback result should not contain content", async () => {
      const provider = createReadOnlyProvider({
        "/file.txt": {
          content: "Secret content that should not appear in stat",
          meta: { size: 100 },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.stat("/test/file.txt");
      expect(result.data).toBeDefined();
      // stat result should NOT have content property
      expect("content" in (result.data || {})).toBe(false);
    });

    test("Fallback result includes path and meta", async () => {
      const provider = createReadOnlyProvider({
        "/doc.md": {
          content: "# Doc",
          meta: {
            size: 50,
            kind: "afs:document",
            description: "A document",
          },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.stat("/test/doc.md");
      expect(result.data?.path).toBe("/test/doc.md");
      expect(result.data?.meta?.size).toBe(50);
      expect(result.data?.meta?.kind).toBe("afs:document");
    });

    test("read throws error -> stat also throws", async () => {
      const provider = createReadOnlyProvider({
        // Only /exists.txt is defined, /missing.txt will throw
        "/exists.txt": { content: "exists" },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      await expect(afs.stat("/test/missing.txt")).rejects.toThrow();
    });

    test("Provider stat throws AFSNotFoundError: falls through to read fallback", async () => {
      const provider: AFSModule = {
        name: "partial-stat-provider",
        accessMode: "readonly",

        async read(path) {
          return {
            data: { id: path, path, content: "from read", meta: { source: "read" } },
          };
        },

        async stat(path) {
          // Only handles root, throws for everything else
          if (path === "/") {
            return { data: { id: "/", path, meta: {} } };
          }
          throw new AFSNotFoundError(path);
        },
      };

      const afs = new AFS();
      await afs.mount(provider, "/test");

      // Should fall through to read() fallback, not throw
      const result = await afs.stat("/test/subpath");
      expect(result.data).toBeDefined();
      expect(result.data?.meta?.source).toBe("read");
      // Content should be stripped in stat fallback
      expect("content" in (result.data || {})).toBe(false);
    });

    test("Provider with stat method: uses stat for primary data", async () => {
      let statCalled = false;

      const provider: AFSModule = {
        name: "track-provider",
        accessMode: "readonly",

        async read(path) {
          // read may be called for enrichment, but stat provides primary data
          return {
            data: { id: path, path, content: "from read", meta: { source: "read" } },
          };
        },

        async stat(path) {
          // Skip tracking for mount check (root path)
          if (path !== "/") statCalled = true;
          return {
            data: {
              id: path.split("/").pop() || "/",
              path,
              meta: { source: "stat", kind: "afs:test" },
            },
          };
        },
      };

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.stat("/test/file.txt");
      expect(statCalled).toBe(true);
      // The primary source should be from stat, even if enrichment happened
      expect(result.data?.meta?.source).toBe("stat");
    });
  });

  describe("list -> childrenCount fallback", () => {
    test("Provider without list method, childrenCount=0: returns []", async () => {
      const provider = createReadOnlyProvider({
        "/leaf.txt": {
          content: "leaf node",
          meta: { childrenCount: 0 },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.list("/test/leaf.txt");
      expect(result.data).toEqual([]);
    });

    test("Provider without list method, childrenCount=undefined: returns []", async () => {
      const provider = createReadOnlyProvider({
        "/leaf.txt": {
          content: "leaf node",
          meta: {}, // childrenCount is undefined
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.list("/test/leaf.txt");
      expect(result.data).toEqual([]);
    });

    test("Provider without list method, childrenCount=5: throws error", async () => {
      const provider = createReadOnlyProvider({
        "/dir": {
          meta: { childrenCount: 5 },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      await expect(afs.list("/test/dir")).rejects.toThrow(/list/i);
    });

    test("Provider without list method, childrenCount=-1: throws error", async () => {
      const provider = createReadOnlyProvider({
        "/dynamic": {
          meta: { childrenCount: -1 },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      await expect(afs.list("/test/dynamic")).rejects.toThrow(/list/i);
    });

    test("Error message indicates need to implement list", async () => {
      const provider = createReadOnlyProvider({
        "/dir": {
          meta: { childrenCount: 3 },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      try {
        await afs.list("/test/dir");
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message.toLowerCase()).toContain("list");
      }
    });

    test("Provider with list method: uses list, not fallback", async () => {
      let listCalled = false;

      const provider: AFSModule = {
        name: "track-provider",
        accessMode: "readonly",

        async read(path) {
          return {
            data: { id: path, path, meta: { childrenCount: 0 } },
          };
        },

        async stat(path) {
          // For mount check - no children
          return {
            data: { id: path.split("/").pop() || "/", path },
          };
        },

        async list(_path) {
          listCalled = true;
          return {
            data: [{ id: "child", path: "/child" }],
          };
        },
      };

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.list("/test/dir");
      expect(listCalled).toBe(true);
      // read might be called for enrichment, but list should be the primary
      expect(result.data.length).toBe(1);
    });
  });

  describe("explain -> read fallback", () => {
    test("Provider without explain method: generates markdown from meta", async () => {
      const provider = createReadOnlyProvider({
        "/doc.md": {
          content: "# Document",
          meta: {
            description: "A test document",
            kind: "afs:document",
          },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.explain("/test/doc.md");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("/test/doc.md");
      expect(result.content).toContain("A test document");
    });

    test("Generated explain includes path and description", async () => {
      const provider = createReadOnlyProvider({
        "/api/users": {
          meta: {
            description: "User management API",
            kind: "afs:api",
          },
        },
      });

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.explain("/test/api/users");
      expect(result.content).toContain("/test/api/users");
      expect(result.content).toContain("User management API");
    });

    test("read throws error -> explain also throws", async () => {
      const provider = createReadOnlyProvider({});

      const afs = new AFS();
      await afs.mount(provider, "/test");

      await expect(afs.explain("/test/missing")).rejects.toThrow();
    });

    test("Provider explain throws AFSNotFoundError: falls through to stat fallback", async () => {
      const provider: AFSModule = {
        name: "partial-explain-provider",
        accessMode: "readonly",

        async read(path) {
          return {
            data: { id: path, path, meta: { description: "from read" } },
          };
        },

        async stat(path) {
          return {
            data: { id: path.split("/").pop() || "/", path, meta: { description: "from stat" } },
          };
        },

        async explain(path) {
          // Only handles root, throws for everything else
          if (path === "/") {
            return { format: "markdown", content: "# Root" };
          }
          throw new AFSNotFoundError(path);
        },
      };

      const afs = new AFS();
      await afs.mount(provider, "/test");

      // Should fall through to stat-based explain, not throw
      const result = await afs.explain("/test/unknown-subpath");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("/test/unknown-subpath");
    });

    test("Provider with explain method: uses explain, not fallback", async () => {
      let explainCalled = false;

      const provider: AFSModule = {
        name: "track-provider",
        accessMode: "readonly",

        async read(path) {
          return {
            data: { id: path, path, meta: { description: "from read" } },
          };
        },

        async stat(path) {
          // For mount check - no children
          return {
            data: { id: path.split("/").pop() || "/", path },
          };
        },

        async explain(_path) {
          explainCalled = true;
          return {
            format: "markdown",
            content: "# Custom Explanation",
          };
        },
      };

      const afs = new AFS();
      await afs.mount(provider, "/test");

      const result = await afs.explain("/test/file");
      expect(explainCalled).toBe(true);
      // read might be called for stat, but explain should provide content
      expect(result.content).toBe("# Custom Explanation");
    });
  });
});
