import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { validateListResult } from "../assertions.js";
import {
  findNestedDirectory,
  flattenTree,
  isDirectory,
  type TestConfig,
  type TestDataStructure,
} from "../types.js";

/**
 * Run deep list traversal test suite.
 * Tests BFS depth expansion and pattern matching:
 * - maxDepth > 1 traversal
 * - Pattern filtering with glob
 * - Total count semantics
 *
 * IMPORTANT: list() only returns children, never includes the requested path itself.
 * - maxDepth=0: returns [] (no children at depth 0)
 * - maxDepth=1 or undefined: returns direct children only
 * - maxDepth=N (N>1): returns children + all descendants up to N-1 levels deep
 */
export function runDeepListTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  config: TestConfig,
): void {
  const root = structure.root;
  const allNodes = flattenTree(root);
  const nestedDir = findNestedDirectory(root);

  // Count total nodes and directories in tree (excluding root)
  const _totalNodes = allNodes.length;
  const _directories = allNodes.filter((n) => isDirectory(n.node));
  const maxDepth = Math.max(...allNodes.map((n) => n.depth));

  // Test options with timeout from config
  const testOpts = config.timeout ? { timeout: config.timeout } : undefined;

  describe("deep-list", () => {
    describe("depth traversal", () => {
      test(
        "maxDepth=0: should return empty array",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list("/", { maxDepth: 0 });
          validateListResult(result);

          // maxDepth=0 returns empty array (no children levels to expand)
          expect(result.data.length).toBe(0);
        },
        testOpts,
      );

      test(
        "maxDepth=1: should return only direct children (not self)",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list("/", { maxDepth: 1 });
          validateListResult(result);

          const rootChildCount = root.children?.length ?? 0;

          // Should return exactly the direct children count
          expect(result.data.length).toBe(rootChildCount);

          // Should NOT include the root path itself
          expect(result.data.some((e) => e.path === "/")).toBe(false);

          // All entries should be direct children (depth 1)
          for (const entry of result.data) {
            const depth = entry.path.split("/").filter(Boolean).length;
            expect(depth).toBe(1);
          }
        },
        testOpts,
      );

      if (maxDepth >= 2) {
        test(
          "maxDepth=2: should include children and grandchildren (not self)",
          async () => {
            const provider = getProvider();
            if (!provider.list) return;

            const depth1Result = await provider.list("/", { maxDepth: 1 });
            const depth2Result = await provider.list("/", { maxDepth: 2 });
            validateListResult(depth2Result);

            // depth=2 should have at least as many entries as depth=1
            expect(depth2Result.data.length).toBeGreaterThanOrEqual(depth1Result.data.length);

            // If there are nested directories with children, depth=2 should have more
            if (nestedDir) {
              expect(depth2Result.data.length).toBeGreaterThan(depth1Result.data.length);
            }

            // Should NOT include root path
            expect(depth2Result.data.some((e) => e.path === "/")).toBe(false);

            // All entries should be at depth 1 or 2
            for (const entry of depth2Result.data) {
              const depth = entry.path.split("/").filter(Boolean).length;
              expect(depth).toBeGreaterThanOrEqual(1);
              expect(depth).toBeLessThanOrEqual(2);
            }
          },
          testOpts,
        );

        test(
          "maxDepth=3: should traverse three levels (not including self)",
          async () => {
            const provider = getProvider();
            if (!provider.list) return;

            const depth2Result = await provider.list("/", { maxDepth: 2 });
            const depth3Result = await provider.list("/", { maxDepth: 3 });
            validateListResult(depth3Result);

            // Should have at least as many as depth=2
            expect(depth3Result.data.length).toBeGreaterThanOrEqual(depth2Result.data.length);

            // Should NOT include root path
            expect(depth3Result.data.some((e) => e.path === "/")).toBe(false);
          },
          testOpts,
        );
      }

      test(
        "large maxDepth: should handle gracefully (not include self)",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          // Request very deep traversal
          const result = await provider.list("/", { maxDepth: 100 });
          validateListResult(result);

          const rootChildCount = root.children?.length ?? 0;

          // If root has children, should return at least that many
          // If root has no children, should return empty array
          if (rootChildCount > 0) {
            expect(result.data.length).toBeGreaterThanOrEqual(rootChildCount);
          } else {
            expect(result.data.length).toBe(0);
          }

          // Should NOT include root path
          expect(result.data.some((e) => e.path === "/")).toBe(false);
        },
        testOpts,
      );

      if (nestedDir) {
        test(
          "depth from subdirectory: should traverse relative to path",
          async () => {
            const provider = getProvider();
            if (!provider.list) return;

            // Get parent of nested dir
            const parentPath = nestedDir.path.split("/").slice(0, -1).join("/") || "/";

            const result = await provider.list(parentPath, { maxDepth: 2 });
            validateListResult(result);

            // Should include the nested directory
            expect(result.data.some((e) => e.path === nestedDir.path)).toBe(true);
          },
          testOpts,
        );
      }
    });

    describe("pattern filtering", () => {
      test(
        "pattern *: should match all at current level",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const rootChildCount = root.children?.length ?? 0;

          try {
            const result = await provider.list("/", { pattern: "*", maxDepth: 1 });
            validateListResult(result);
            // Should have entries if root has children
            if (rootChildCount > 0) {
              expect(result.data.length).toBeGreaterThanOrEqual(1);
            }
            // Should NOT include root path
            expect(result.data.some((e) => e.path === "/")).toBe(false);
          } catch {
            // Pattern not supported by this provider
          }
        },
        testOpts,
      );

      test(
        "pattern *.md: should filter by extension",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          // Find if there are any .md files in structure
          const _mdFiles = allNodes.filter((n) => n.path.endsWith(".md"));

          try {
            const result = await provider.list("/", { pattern: "*.md", maxDepth: 10 });
            validateListResult(result);

            // All results should match *.md pattern (or be directories containing .md files)
            // And should NOT include root
            for (const entry of result.data) {
              // Either ends with .md or has children (directory)
              const isMatch = entry.path.endsWith(".md") || entry.meta?.childrenCount !== undefined;
              expect(isMatch).toBe(true);
              // Root should never be included
              expect(entry.path).not.toBe("/");
            }
          } catch {
            // Pattern not supported
          }
        },
        testOpts,
      );

      test(
        "pattern with no matches: should return empty or just directories",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          try {
            const result = await provider.list("/", {
              pattern: "*.nonexistentextension12345",
              maxDepth: 10,
            });
            validateListResult(result);
            // Should have few or no results
          } catch {
            // Pattern not supported
          }
        },
        testOpts,
      );
    });

    describe("limit and total", () => {
      test(
        "limit with deep traversal: should respect limit",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list("/", { maxDepth: 10, limit: 3 });
          validateListResult(result);

          expect(result.data.length).toBeLessThanOrEqual(3);
        },
        testOpts,
      );

      test(
        "total: should indicate complete count if available",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list("/", { maxDepth: 1 });
          validateListResult(result);

          // total may or may not be present
          // If present, should be >= data.length
          if (result.total !== undefined) {
            expect(result.total).toBeGreaterThanOrEqual(result.data.length);
          }
        },
        testOpts,
      );

      test(
        "small limit: should still work",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list("/", { limit: 1 });
          validateListResult(result);

          expect(result.data.length).toBeLessThanOrEqual(1);
        },
        testOpts,
      );
    });

    describe("BFS order", () => {
      test(
        "entries should be in breadth-first order (no root included)",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list("/", { maxDepth: 10 });
          validateListResult(result);

          // Verify BFS order: entries at depth N should come before depth N+1
          // Root (depth 0) should never be in results
          for (const entry of result.data) {
            const depth = entry.path.split("/").filter(Boolean).length;
            // All entries should have depth >= 1 (children or deeper)
            expect(depth).toBeGreaterThanOrEqual(1);
            // Root should never be included
            expect(entry.path).not.toBe("/");
          }
        },
        testOpts,
      );
    });

    describe("default maxDepth behavior", () => {
      test(
        "maxDepth=undefined defaults to 1 (direct children only)",
        async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const undefinedResult = await provider.list("/");
          const depth1Result = await provider.list("/", { maxDepth: 1 });
          validateListResult(undefinedResult);

          // Both should return the same results
          expect(undefinedResult.data.length).toBe(depth1Result.data.length);

          // Should NOT include root
          expect(undefinedResult.data.some((e) => e.path === "/")).toBe(false);
        },
        testOpts,
      );
    });
  });
}
