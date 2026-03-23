import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { joinURL } from "ufo";
import { isDirectory, isFile, type TestConfig, type TestTreeNode } from "../types.js";

/**
 * Run structure validation tests.
 * Strictly validates that every node in the defined tree structure:
 * 1. Can be read via read()
 * 2. Can be listed via list()
 * 3. Has accessible metadata via read(.meta)
 * 4. Has expected content/children/metadata values if specified
 */
export function runStructureTests(
  getProvider: () => AFSModule,
  root: TestTreeNode,
  _config: TestConfig,
): void {
  describe("structure-validation", () => {
    // Collect all nodes with their paths for testing
    const nodesToTest: Array<{ path: string; node: TestTreeNode }> = [];

    function collectNodes(node: TestTreeNode, parentPath: string): void {
      const currentPath =
        parentPath === "/" && node.name === "" ? "/" : joinURL(parentPath, node.name);

      nodesToTest.push({ path: currentPath, node });

      if (node.children) {
        for (const child of node.children) {
          collectNodes(child, currentPath);
        }
      }
    }

    collectNodes(root, "/");

    // Test each node in the tree
    for (const { path, node } of nodesToTest) {
      const isDir = isDirectory(node);
      const isFileNode = isFile(node);
      const nodeType = isDir ? "directory" : isFileNode ? "file" : "node";

      describe(`${path} (${nodeType})`, () => {
        // ========== Required: Read API ==========
        test("read: should be readable", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(path);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBeDefined();
        });

        // ========== Required: List API ==========
        test("list: should be listable with maxDepth=1", async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list(path, { maxDepth: 1 });
          expect(result.data).toBeDefined();
          expect(Array.isArray(result.data)).toBe(true);
          // list() should NOT include the requested path itself
          expect(result.data.some((e) => e.path === path)).toBe(false);
        });

        test("list: maxDepth=0 should return empty array", async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list(path, { maxDepth: 0 });
          expect(result.data).toBeDefined();
          expect(Array.isArray(result.data)).toBe(true);
          // maxDepth=0 returns empty array (no children levels to expand)
          expect(result.data.length).toBe(0);
        });

        // ========== Required: Meta API ==========
        test("meta: should have accessible metadata", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          // Use joinURL to properly construct meta path
          const metaPath = joinURL(path, ".meta");
          const result = await provider.read(metaPath);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(metaPath);
          expect(result.data?.meta).toBeDefined();
        });

        // ========== Optional: Validate content if specified ==========
        if (isFileNode && node.content !== undefined && node.content !== "") {
          test("content: should have expected content", async () => {
            const provider = getProvider();
            if (!provider.read) return;

            const result = await provider.read(path);
            expect(result.data).toBeDefined();

            if (typeof node.content === "object") {
              // Object content: verify actual content is an object with expected keys
              expect(typeof result.data?.content).toBe("object");
              expect(result.data?.content).toMatchObject(node.content);
            } else {
              // String content: partial match (contains) — existing behavior
              expect(result.data?.content).toContain(node.content);
            }
          });
        }

        // ========== Optional: Validate children if specified ==========
        if (isDir && node.children && node.children.length > 0) {
          test("children: should list expected children", async () => {
            const provider = getProvider();
            if (!provider.list) return;

            const result = await provider.list(path, { maxDepth: 1 });
            expect(result.data).toBeDefined();
            expect(Array.isArray(result.data)).toBe(true);

            // list() returns only children, not the path itself
            const listedPaths = result.data.map((e) => e.path);

            // Verify each expected child is present
            const expectedChildPaths = node.children!.map((child) => joinURL(path, child.name));

            for (const expectedPath of expectedChildPaths) {
              expect(listedPaths).toContain(expectedPath);
            }
          });
        }

        // ========== Compliance: childrenCount consistency ==========
        test("childrenCount: should match actual children count", async () => {
          const provider = getProvider();
          if (!provider.read || !provider.list) return;

          // Get childrenCount from read result
          const readResult = await provider.read(path);
          const childrenCount = readResult.data?.meta?.childrenCount;

          // Get actual children from list
          const listResult = await provider.list(path, { maxDepth: 1 });
          const actualChildCount = listResult.data.length;

          // Validate based on childrenCount semantics:
          // - undefined or 0: no children (leaf node)
          // - N > 0: exactly N children
          // - -1: has children, count unknown
          if (childrenCount === undefined || childrenCount === 0) {
            // Leaf node: should have no children
            expect(actualChildCount).toBe(0);
          } else if (childrenCount === -1) {
            // Unknown count: should have at least 1 child
            expect(actualChildCount).toBeGreaterThanOrEqual(1);
          } else if (childrenCount > 0) {
            // Exact count: should match
            expect(actualChildCount).toBe(childrenCount);
          }
        });

        // ========== Optional: Validate metadata values if specified ==========
        if (node.meta && Object.keys(node.meta).length > 0) {
          test("meta: should have expected metadata values", async () => {
            const provider = getProvider();
            if (!provider.read) return;

            const metaPath = joinURL(path, ".meta");
            const result = await provider.read(metaPath);
            expect(result.data).toBeDefined();
            expect(result.data?.meta).toBeDefined();

            // Verify each expected metadata key
            for (const [key, value] of Object.entries(node.meta!)) {
              expect(result.data?.meta?.[key]).toEqual(value);
            }
          });
        }

        // ========== Optional: Validate actions if specified ==========
        if (node.actions && node.actions.length > 0) {
          test("actions: should have expected actions", async () => {
            const provider = getProvider();
            if (!provider.list) return;

            // List actions at this node
            const actionsPath = joinURL(path, ".actions");
            const result = await provider.list(actionsPath, { maxDepth: 1 });
            expect(result.data).toBeDefined();
            expect(Array.isArray(result.data)).toBe(true);

            // Get action names from the listing
            // Actions are entries where path ends with .actions/<name>
            const listedActionNames = result.data
              .filter((e) => e.path !== actionsPath)
              .map((e) => {
                const parts = e.path.split("/");
                return parts[parts.length - 1];
              });

            // Verify each expected action is present
            for (const expectedAction of node.actions!) {
              expect(listedActionNames).toContain(expectedAction.name);

              // Optionally verify action description if specified
              if (expectedAction.description) {
                const actionEntry = result.data.find((e) =>
                  e.path.endsWith(`/.actions/${expectedAction.name}`),
                );
                expect(actionEntry?.meta?.description ?? actionEntry?.summary).toContain(
                  expectedAction.description,
                );
              }
            }
          });
        }
      });
    }
  });
}
