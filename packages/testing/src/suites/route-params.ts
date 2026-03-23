import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { joinURL } from "ufo";
import {
  findFirstDirectory,
  findFirstFile,
  flattenTree,
  type TestConfig,
  type TestDataStructure,
} from "../types.js";

/**
 * Run route params test suite.
 * Tests that path parameters are correctly extracted and entries have proper structure.
 * This validates that the router correctly parses dynamic segments like :id, :path*, etc.
 */
export function runRouteParamsTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;
  const allNodes = flattenTree(root);
  const fileNode = findFirstFile(root);
  const dirNode = findFirstDirectory(root);

  // Find a deeply nested path for testing
  const deepNode = allNodes.find((n) => n.depth >= 2);

  describe("route-params", () => {
    describe("path extraction", () => {
      test("root path: should have path '/'", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read("/");
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBe("/");
      });

      if (fileNode) {
        test("file path: should match request path exactly", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(fileNode.path);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(fileNode.path);
        });
      }

      if (dirNode) {
        test("directory path: should match request path exactly", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(dirNode.path);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(dirNode.path);
        });
      }

      if (deepNode) {
        test("deep path: should preserve full path structure", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(deepNode.path);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(deepNode.path);

          // Verify path segments are preserved
          const segments = deepNode.path.split("/").filter(Boolean);
          const resultSegments = result.data?.path?.split("/").filter(Boolean) ?? [];
          expect(resultSegments).toEqual(segments);
        });
      }
    });

    describe("id generation", () => {
      test("entry id: should be defined and non-empty", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read("/");
        expect(result.data).toBeDefined();
        expect(result.data?.id).toBeDefined();
        expect(typeof result.data?.id).toBe("string");
        expect(result.data?.id?.length).toBeGreaterThan(0);
      });

      if (fileNode) {
        test("file id: should be string", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(fileNode.path);
          expect(result.data).toBeDefined();
          expect(typeof result.data?.id).toBe("string");
        });
      }

      test("list entries: all should have valid ids", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 2 });
        expect(result.data).toBeDefined();

        for (const entry of result.data) {
          expect(entry.id).toBeDefined();
          expect(typeof entry.id).toBe("string");
          expect(entry.id.length).toBeGreaterThan(0);
        }
      });
    });

    describe("path consistency", () => {
      test("list entries: paths should be consistent with parent", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 1 });
        expect(result.data).toBeDefined();

        for (const entry of result.data) {
          // All paths should start with /
          expect(entry.path.startsWith("/")).toBe(true);

          // Non-root paths should not end with /
          if (entry.path !== "/") {
            expect(entry.path.endsWith("/")).toBe(false);
          }

          // Child paths should start with parent path (or be root)
          if (entry.path !== "/") {
            const parentPath = entry.path.split("/").slice(0, -1).join("/") || "/";
            expect(parentPath === "/" || result.data.some((e) => e.path === parentPath)).toBe(true);
          }
        }
      });

      if (dirNode) {
        test("subdirectory list: child paths should be prefixed correctly", async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const result = await provider.list(dirNode.path, { maxDepth: 1 });
          expect(result.data).toBeDefined();

          for (const entry of result.data) {
            // All entries should either be the directory itself or children
            const dirPathWithSlash = joinURL(dirNode.path, "/");
            expect(entry.path === dirNode.path || entry.path.startsWith(dirPathWithSlash)).toBe(
              true,
            );
          }
        });
      }
    });

    describe("meta path handling", () => {
      test(".meta path: should have correct path in response", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read("/.meta");
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBe("/.meta");
      });

      if (fileNode) {
        test("file .meta path: should preserve full meta path", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const metaPath = joinURL(fileNode.path, ".meta");
          const result = await provider.read(metaPath);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(metaPath);
        });
      }

      if (dirNode) {
        test("directory .meta path: should preserve full meta path", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const metaPath = joinURL(dirNode.path, ".meta");
          const result = await provider.read(metaPath);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(metaPath);
        });
      }
    });

    describe("stat path handling", () => {
      test("stat: path should match request", async () => {
        const provider = getProvider();
        if (!provider.stat) return;

        const result = await provider.stat("/");
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBe("/");
      });

      if (fileNode) {
        test("stat file: path should match request", async () => {
          const provider = getProvider();
          if (!provider.stat) return;

          const result = await provider.stat(fileNode.path);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(fileNode.path);
        });
      }
    });
  });
}
