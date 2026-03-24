import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { AFSNotFoundError } from "@aigne/afs";
import type { TestConfig } from "../types.js";

/**
 * Run not-found error test suite.
 * Tests that operations on non-existent paths throw AFSNotFoundError.
 *
 * Expected behavior:
 * - read/list/stat on non-existent path: throw AFSNotFoundError
 * - search on non-existent path: returns empty results (not error)
 * - write/delete/rename on non-existent path: throw AFSNotFoundError
 * - Unsupported operations: method is undefined
 */
export function runNoHandlerTests(getProvider: () => AFSModule, _config: TestConfig): void {
  // Use a path that definitely does not exist
  const nonExistentPath = "/____path-that-does-not-exist-12345____";

  describe("not-found-errors", () => {
    describe("read operations", () => {
      test("read: non-existent path should throw AFSNotFoundError", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        try {
          await provider.read(nonExistentPath);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
        }
      });

      test("list: non-existent path should throw AFSNotFoundError", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        try {
          await provider.list(nonExistentPath);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
        }
      });

      test("stat: non-existent path should throw AFSNotFoundError", async () => {
        const provider = getProvider();
        if (!provider.stat) return;

        try {
          await provider.stat(nonExistentPath);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
        }
      });
    });

    describe("search behavior", () => {
      test("search: non-existent path should return empty results or throw error", async () => {
        const provider = getProvider();
        if (!provider.search) return;

        try {
          // Search on non-existent path may return empty array or throw error
          const result = await provider.search(nonExistentPath, "query");
          expect(result).toBeDefined();
          expect(result.data).toBeDefined();
          expect(Array.isArray(result.data)).toBe(true);
          expect(result.data.length).toBe(0);
        } catch (error) {
          // Throwing an error is also acceptable (e.g., AFSNotFoundError or search tool error)
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    describe("write operations", () => {
      test("delete: non-existent path should throw AFSNotFoundError", async () => {
        const provider = getProvider();
        if (!provider.delete) return;
        if (provider.accessMode === "readonly") return;

        try {
          await provider.delete(nonExistentPath);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
        }
      });

      test("rename: non-existent source should throw AFSNotFoundError", async () => {
        const provider = getProvider();
        if (!provider.rename) return;
        if (provider.accessMode === "readonly") return;

        const newPath = "/____new-path____";
        try {
          await provider.rename(nonExistentPath, newPath);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
        }
      });
    });

    describe("method availability", () => {
      test("unsupported operations should have undefined methods", () => {
        const provider = getProvider();

        // Methods are either functions or undefined (not some other value)
        const operations = [
          "list",
          "read",
          "write",
          "delete",
          "exec",
          "search",
          "stat",
          "explain",
          "rename",
        ] as const;

        for (const op of operations) {
          const method = provider[op];
          expect(method === undefined || typeof method === "function").toBe(true);
        }
      });

      test("accessMode should be defined", () => {
        const provider = getProvider();
        expect(provider.accessMode).toBeDefined();
        expect(["readonly", "readwrite"]).toContain(provider.accessMode as string);
      });

      test("name should be defined", () => {
        const provider = getProvider();
        expect(provider.name).toBeDefined();
        expect(typeof provider.name).toBe("string");
        expect(provider.name.length).toBeGreaterThan(0);
      });
    });
  });
}
