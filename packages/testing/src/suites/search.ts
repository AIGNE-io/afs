import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { validateSearchResult } from "../assertions.js";
import {
  findFirstDirectory,
  flattenTree,
  isDirectory,
  type TestConfig,
  type TestDataStructure,
} from "../types.js";

/**
 * Run SearchOperations test suite.
 */
export function runSearchTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;

  // Find a file with content for search testing
  const allNodes = flattenTree(root);
  const fileWithContent = allNodes.find(
    (n) =>
      n.node.content !== undefined && typeof n.node.content === "string" && !isDirectory(n.node),
  );

  const dirNode = findFirstDirectory(root);

  describe("search", () => {
    test("search-basic-root: should search with simple query at root", async () => {
      const provider = getProvider();
      if (!provider.search) {
        // search not supported, skip
        return;
      }

      // Use a common pattern that should exist in most test setups
      const content = fileWithContent?.node.content;
      const query = typeof content === "string" ? content.slice(0, 10) : "test";
      const result = await provider.search("/", query);

      validateSearchResult(result);
    });

    if (dirNode) {
      test("search-basic-subdir: should search within subdirectory", async () => {
        const provider = getProvider();
        if (!provider.search) return;

        const query = "test";
        const result = await provider.search(dirNode.path, query);

        validateSearchResult(result);
      });
    }

    test("search-no-results: should return empty when no match", async () => {
      const provider = getProvider();
      if (!provider.search) return;

      const result = await provider.search("/", "nonexistentquerystring12345xyz");

      validateSearchResult(result);
      expect(result.data.length).toBe(0);
    });

    test("search-with-limit: should respect limit parameter", async () => {
      const provider = getProvider();
      if (!provider.search) return;

      // Use a query that might match multiple files
      const result = await provider.search("/", "e", { limit: 1 });

      validateSearchResult(result);
      expect(result.data.length).toBeLessThanOrEqual(1);
    });
  });
}
