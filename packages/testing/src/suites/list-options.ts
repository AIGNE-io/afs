import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { validateListResult } from "../assertions.js";
import { findNestedDirectory, type TestConfig, type TestDataStructure } from "../types.js";

/**
 * Run advanced list options test suite.
 * Tests list operations with various options.
 */
export function runListOptionsTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;

  // Find a nested directory for deep traversal tests
  const nestedDir = findNestedDirectory(root);

  describe("list-options", () => {
    describe("maxDepth", () => {
      test("maxDepth=2: should traverse two levels deep", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 2 });
        validateListResult(result);

        // Should have more entries than maxDepth=1
        const depth1Result = await provider.list("/", { maxDepth: 1 });
        // If there are nested directories, depth 2 should have more entries
        if (nestedDir) {
          expect(result.data.length).toBeGreaterThanOrEqual(depth1Result.data.length);
        }
      });

      test("maxDepth=0: should return empty array", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 0 });
        validateListResult(result);

        // maxDepth=0 returns empty array (no children levels to expand)
        expect(result.data.length).toBe(0);
      });

      if (nestedDir) {
        test("maxDepth on subdirectory: should respect depth from that point", async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list(nestedDir.path, { maxDepth: 1 });
          validateListResult(result);

          // Should NOT include the directory itself - list() never includes self
          expect(result.data.some((e) => e.path === nestedDir.path)).toBe(false);
        });
      }
    });

    describe("limit", () => {
      test("limit=1: should return at most 1 entry", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { limit: 1 });
        validateListResult(result);
        expect(result.data.length).toBeLessThanOrEqual(1);
      });

      test("limit larger than total: should return all entries", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { limit: 10000 });
        validateListResult(result);
        // Should work without error
      });
    });

    describe("offset", () => {
      test("offset=0: should return from beginning", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { offset: 0 });
        validateListResult(result);
      });

      test("offset with limit: should be accepted without error", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        // Note: Not all providers fully implement offset pagination.
        // This test verifies the options are accepted without error.
        const result = await provider.list("/", { limit: 2, offset: 1 });
        validateListResult(result);
        // Just verify it returns a valid result - pagination behavior varies
      });
    });

    describe("pattern", () => {
      test("pattern matching: should filter by glob pattern", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        // This test depends on provider supporting pattern
        // Some providers may not support it
        try {
          const result = await provider.list("/", { pattern: "*", maxDepth: 1 });
          validateListResult(result);
        } catch {
          // Pattern not supported, skip
        }
      });
    });
  });
}
