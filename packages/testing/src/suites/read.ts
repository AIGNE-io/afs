import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import {
  validateEntry,
  validateListResult,
  validateReadResult,
  validateStatResult,
} from "../assertions.js";
import {
  findFirstDirectory,
  findFirstFile,
  flattenTree,
  isDirectory,
  type TestConfig,
  type TestDataStructure,
} from "../types.js";

/**
 * Run ReadOperations test suite.
 */
export function runReadTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  config: TestConfig,
): void {
  const root = structure.root;
  const testOpts = config.timeout ? { timeout: config.timeout } : undefined;

  // Find test data from tree structure
  const fileNode = findFirstFile(root);
  const dirNode = findFirstDirectory(root);

  // Find an empty directory (has children array but length 0)
  const allNodes = flattenTree(root);
  const emptyDirNode = allNodes.find(
    (n) => n.node.children !== undefined && n.node.children.length === 0,
  );

  // Find a file in a subdirectory (depth >= 2)
  const subdirFileNode = allNodes.find(
    (n) => n.depth >= 2 && n.node.content !== undefined && !isDirectory(n.node),
  );

  describe("list", () => {
    test("list-root: should list children at root (not including root itself)", async () => {
      const provider = getProvider();
      if (!provider.list) {
        // list not supported, skip
        return;
      }

      const result = await provider.list("/");
      validateListResult(result);

      // If root has children, should have results; otherwise empty
      const rootChildCount = root.children?.length ?? 0;
      if (rootChildCount > 0) {
        expect(result.data.length).toBeGreaterThan(0);
      }

      // list() should NOT include the requested path itself
      expect(result.data.some((e) => e.path === "/")).toBe(false);
    });

    if (dirNode) {
      test("list-subdir: should list children in subdirectory (not including self)", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list(dirNode.path);
        validateListResult(result);

        // list() should NOT include the requested path itself
        expect(result.data.some((e) => e.path === dirNode.path)).toBe(false);
      });
    }

    if (emptyDirNode) {
      test("list-empty-dir: should return empty array for empty directory", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list(emptyDirNode.path);
        validateListResult(result);

        // Empty dir should return empty array (no children)
        expect(result.data.length).toBe(0);
      });
    }

    test("list-not-found: should throw for non-existent path", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      await expect(provider.list("/non-existent-path-12345")).rejects.toThrow();
    });

    test("list-depth-0: should return empty array for maxDepth=0", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const result = await provider.list("/", { maxDepth: 0 });
      validateListResult(result);
      // maxDepth=0 returns empty array (no children levels to expand)
      expect(result.data.length).toBe(0);
    });

    test("list-depth-1: should return direct children for maxDepth=1", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const result = await provider.list("/", { maxDepth: 1 });
      validateListResult(result);

      // Should NOT include root
      expect(result.data.some((e) => e.path === "/")).toBe(false);

      // All entries should be direct children (depth 1)
      for (const entry of result.data) {
        const depth = entry.path.split("/").filter(Boolean).length;
        expect(depth).toBe(1);
      }
    });

    test("list-with-limit: should respect limit parameter", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const result = await provider.list("/", { limit: 2 });
      validateListResult(result);
      expect(result.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe("list-read consistency", () => {
    test(
      "all listed entries must be readable",
      async () => {
        const provider = getProvider();
        if (!provider.list || !provider.read) return;

        // Recursive function to check list-read consistency
        async function checkPath(path: string, maxRecursionDepth = 3): Promise<void> {
          if (maxRecursionDepth <= 0) return;

          const listResult = await provider.list!(path, { maxDepth: 1 });
          validateListResult(listResult);

          for (const entry of listResult.data) {
            // Every listed entry must be readable
            const readResult = await provider.read!(entry.path);
            expect(readResult.data).toBeDefined();
            expect(readResult.data?.path).toBe(entry.path);

            // Recursively check children if this entry has children
            const childrenCount = readResult.data?.meta?.childrenCount;
            if (childrenCount !== undefined && childrenCount !== 0) {
              await checkPath(entry.path, maxRecursionDepth - 1);
            }
          }
        }

        await checkPath("/");
      },
      testOpts,
    );

    test(
      "nested directories: all descendants should be readable",
      async () => {
        const provider = getProvider();
        if (!provider.list || !provider.read) return;

        // Get all entries up to depth 3
        const result = await provider.list("/", { maxDepth: 3 });
        validateListResult(result);

        // Every entry in the list must be readable
        for (const entry of result.data) {
          const readResult = await provider.read(entry.path);
          expect(readResult.data).toBeDefined();
          expect(readResult.data?.path).toBe(entry.path);
        }
      },
      testOpts,
    );
  });

  describe("read", () => {
    if (fileNode) {
      test("read-file-root: should read file content", async () => {
        const provider = getProvider();
        if (!provider.read) {
          // read not supported, skip
          return;
        }

        const result = await provider.read(fileNode.path);
        validateReadResult(result);
        expect(result.data).toBeDefined();
        validateEntry(result.data!);
      });
    }

    if (subdirFileNode) {
      test("read-file-subdir: should read file in subdirectory", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read(subdirFileNode.path);
        validateReadResult(result);
        expect(result.data).toBeDefined();
        validateEntry(result.data!);
      });
    }

    if (dirNode) {
      test("read-directory: should read directory entry", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read(dirNode.path);
        validateReadResult(result);
        expect(result.data).toBeDefined();
      });
    }

    test("read-not-found: should throw for non-existent path", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      await expect(provider.read("/non-existent-file-12345.txt")).rejects.toThrow();
    });
  });

  describe("stat", () => {
    if (fileNode) {
      test("stat-file: should get file stats", async () => {
        const provider = getProvider();
        if (!provider.stat) {
          // stat not supported, skip
          return;
        }

        const result = await provider.stat(fileNode.path);
        validateStatResult(result);
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBeDefined();
      });
    }

    if (dirNode) {
      test("stat-directory: should get directory stats", async () => {
        const provider = getProvider();
        if (!provider.stat) return;

        const result = await provider.stat(dirNode.path);
        validateStatResult(result);
        expect(result.data).toBeDefined();
      });
    }

    test("stat-not-found: should throw for non-existent path", async () => {
      const provider = getProvider();
      if (!provider.stat) return;

      await expect(provider.stat("/non-existent-path-12345")).rejects.toThrow();
    });
  });
}
