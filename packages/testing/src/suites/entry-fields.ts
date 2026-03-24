import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { joinURL } from "ufo";
import {
  findFirstDirectory,
  findFirstFile,
  type TestConfig,
  type TestDataStructure,
} from "../types.js";

/**
 * Run entry fields validation test suite.
 * Tests that entries have required fields with correct types.
 */
export function runEntryFieldsTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;
  const fileNode = findFirstFile(root);
  const dirNode = findFirstDirectory(root);

  describe("entry-fields", () => {
    describe("required fields", () => {
      test("read: entry should have id field", async () => {
        const provider = getProvider();
        if (!provider.read || !fileNode) return;

        const result = await provider.read(fileNode.path);
        expect(result.data).toBeDefined();
        expect(result.data?.id).toBeDefined();
        expect(typeof result.data?.id).toBe("string");
      });

      test("read: entry should have path field", async () => {
        const provider = getProvider();
        if (!provider.read || !fileNode) return;

        const result = await provider.read(fileNode.path);
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBeDefined();
        expect(typeof result.data?.path).toBe("string");
        expect(result.data?.path.startsWith("/")).toBe(true);
      });

      test("list: entries should have id and path", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/", { maxDepth: 1 });
        expect(result.data).toBeDefined();

        for (const entry of result.data) {
          expect(entry.id).toBeDefined();
          expect(typeof entry.id).toBe("string");
          expect(entry.path).toBeDefined();
          expect(typeof entry.path).toBe("string");
        }
      });
    });

    describe("metadata fields", () => {
      if (dirNode) {
        test("directory: should have childrenCount in metadata", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(dirNode.path);
          expect(result.data).toBeDefined();

          // childrenCount may be in metadata
          // Valid values: -1 (unknown count), 0 (empty dir), or N>0 (exact count)
          if (result.data?.meta?.childrenCount !== undefined) {
            expect(typeof result.data.meta.childrenCount).toBe("number");
            expect(result.data.meta.childrenCount).toBeGreaterThanOrEqual(-1);
          }
        });
      }

      test("meta read: should return metadata object", async () => {
        const provider = getProvider();
        if (!provider.read || !fileNode) return;

        const metaPath = joinURL(fileNode.path, ".meta");
        const result = await provider.read(metaPath);

        expect(result.data).toBeDefined();
        expect(result.data?.meta).toBeDefined();
        expect(typeof result.data?.meta).toBe("object");
      });
    });

    describe("optional fields", () => {
      if (fileNode) {
        test("file: content field should be present", async () => {
          const provider = getProvider();
          if (!provider.read) return;

          const result = await provider.read(fileNode.path);
          expect(result.data).toBeDefined();
          // Content should be defined (can be any type)
          expect("content" in (result.data || {})).toBe(true);
        });
      }

      test("entry: dates should be Date objects if present", async () => {
        const provider = getProvider();
        if (!provider.read || !fileNode) return;

        const result = await provider.read(fileNode.path);
        expect(result.data).toBeDefined();

        if (result.data?.createdAt !== undefined) {
          expect(result.data.createdAt).toBeInstanceOf(Date);
        }

        if (result.data?.updatedAt !== undefined) {
          expect(result.data.updatedAt).toBeInstanceOf(Date);
        }
      });
    });

    describe("stat fields", () => {
      test("stat: should return path field", async () => {
        const provider = getProvider();
        if (!provider.stat || !fileNode) return;

        const result = await provider.stat(fileNode.path);
        expect(result.data).toBeDefined();
        expect(result.data?.path).toBeDefined();
        expect(result.data?.path).toBe(fileNode.path);
      });

      if (dirNode) {
        test("stat directory: childrenCount should be number if present", async () => {
          const provider = getProvider();
          if (!provider.stat) return;

          const result = await provider.stat(dirNode.path);
          expect(result.data).toBeDefined();

          if (result.data?.meta?.childrenCount !== undefined) {
            expect(typeof result.data.meta.childrenCount).toBe("number");
          }
        });
      }

      if (fileNode) {
        test("stat file: size should be number if present", async () => {
          const provider = getProvider();
          if (!provider.stat) return;

          const result = await provider.stat(fileNode.path);
          expect(result.data).toBeDefined();

          if (result.data?.meta?.size !== undefined) {
            expect(typeof result.data.meta.size).toBe("number");
            expect(result.data.meta.size).toBeGreaterThanOrEqual(0);
          }
        });
      }
    });
  });
}
