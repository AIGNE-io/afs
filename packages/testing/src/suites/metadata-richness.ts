import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { flattenTree, isDirectory, type TestConfig, type TestDataStructure } from "../types.js";

/**
 * Run metadata richness validation suite.
 * Checks that list entries have required metadata fields:
 * - meta.kind: must be a non-empty string
 * - meta.childrenCount: must be defined for directory nodes
 * - meta.description: recommended but not enforced
 */
export function runMetadataRichnessTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;
  const allNodes = flattenTree(root).filter((n) => n.path !== "/");

  describe("metadata-richness", () => {
    describe("kind field", () => {
      test("list entries should have meta.kind as non-empty string", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 1 });
        expect(result.data).toBeDefined();

        for (const entry of result.data) {
          expect(entry.meta?.kind).toBeDefined();
          expect(typeof entry.meta?.kind).toBe("string");
          expect((entry.meta?.kind as string).length).toBeGreaterThan(0);
        }
      });

      test("kind is any non-empty string (no format restriction)", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 1 });
        if (result.data.length === 0) return;

        const entry = result.data[0]!;
        expect(typeof entry.meta?.kind).toBe("string");
        // Any non-empty string is valid - no format enforcement
        expect((entry.meta?.kind as string).length).toBeGreaterThan(0);
      });
    });

    describe("childrenCount field", () => {
      for (const node of allNodes.filter((n) => isDirectory(n.node))) {
        test(`directory "${node.path}" should have childrenCount defined`, async () => {
          const provider = getProvider();
          if (!provider.list) return;

          // List the parent to find this directory entry
          const parentPath = node.path.split("/").slice(0, -1).join("/") || "/";
          const result = await provider.list(parentPath, { maxDepth: 1 });

          const entry = result.data.find((e) => e.path === node.path || e.id === node.node.name);
          if (!entry) return; // Skip if not found in parent list

          expect(entry.meta?.childrenCount).toBeDefined();
          expect(typeof entry.meta?.childrenCount).toBe("number");
        });
      }

      test("childrenCount = -1 is valid (unknown children count)", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 1 });
        for (const entry of result.data) {
          if (entry.meta?.childrenCount !== undefined) {
            expect(typeof entry.meta.childrenCount).toBe("number");
            // -1, 0, and positive are all valid
            expect(entry.meta.childrenCount >= -1).toBe(true);
          }
        }
      });

      test("childrenCount = 0 is valid for leaf nodes and empty directories", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 1 });
        for (const entry of result.data) {
          if (entry.meta?.childrenCount === 0) {
            // 0 is valid for both files and empty directories
            expect(entry.meta.childrenCount).toBe(0);
          }
        }
      });
    });

    describe("description field", () => {
      test("description is recommended but not required", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 1 });
        // Just check that if description exists, it's a string
        for (const entry of result.data) {
          if (entry.meta?.description !== undefined) {
            expect(typeof entry.meta.description).toBe("string");
          }
        }
        // No assertion for existence - it's recommended, not required
      });
    });
  });
}
