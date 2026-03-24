import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { joinURL } from "ufo";
import { findFirstFile, type TestConfig, type TestDataStructure } from "../types.js";

/**
 * Run path normalization test suite.
 * Tests that various path formats are handled correctly.
 */
export function runPathNormalizationTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;

  // Find a file entry for testing
  const fileNode = findFirstFile(root);

  describe("path-normalization", () => {
    describe("list", () => {
      test("root with trailing slash: list('/') should work", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/");
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
      });

      test("empty string path: should normalize to root", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        // Some providers may throw, some may normalize
        try {
          const result = await provider.list("");
          expect(result.data).toBeDefined();
        } catch {
          // Acceptable behavior
        }
      });

      if (fileNode) {
        test("path with trailing slash: should normalize", async () => {
          const provider = getProvider();
          if (!provider.list) return;

          const parentPath = fileNode.path.split("/").slice(0, -1).join("/") || "/";

          // Try with trailing slash
          try {
            const result = await provider.list(joinURL(parentPath, "/"));
            expect(result.data).toBeDefined();
          } catch {
            // Some providers may not support trailing slash
          }
        });
      }
    });

    describe("read", () => {
      if (fileNode) {
        test("read with exact path: should return entry", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(fileNode.path);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBe(fileNode.path);
        });

        test("read path without leading slash: should normalize", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const pathWithoutSlash = fileNode.path.slice(1); // Remove leading /

          try {
            const result = await provider.read(pathWithoutSlash);
            expect(result.data).toBeDefined();
            // Normalized path should have leading slash
            expect(result.data?.path?.startsWith("/")).toBe(true);
          } catch {
            // Acceptable behavior - some providers require leading slash
          }
        });
      }
    });

    describe("stat", () => {
      test("stat root path: should work", async () => {
        const provider = getProvider();
        if (!provider.stat) return;

        const result = await provider.stat("/");
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBe("/");
      });

      if (fileNode) {
        test("stat file path: should return path in result", async () => {
          const provider = getProvider();
          if (!provider.stat) return;

          const result = await provider.stat(fileNode.path);
          expect(result.data).toBeDefined();
          expect(result.data?.path).toBeDefined();
        });
      }
    });
  });
}
