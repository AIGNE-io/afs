import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { AFSNotFoundError } from "@aigne/afs";
import type { TestConfig } from "../types.js";

/**
 * Run error types test suite.
 * Tests that errors are thrown with correct types and properties.
 */
export function runErrorTypesTests(getProvider: () => AFSModule, _config: TestConfig): void {
  describe("error-types", () => {
    describe("AFSNotFoundError", () => {
      test("list not-found: should throw AFSNotFoundError with path", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const nonExistentPath = "/non-existent-path-for-error-test-12345";

        try {
          await provider.list(nonExistentPath);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
          expect((error as AFSNotFoundError).path).toBe(nonExistentPath);
          expect((error as AFSNotFoundError).code).toBe("AFS_NOT_FOUND");
          expect((error as AFSNotFoundError).name).toBe("AFSNotFoundError");
        }
      });

      test("read not-found: should throw AFSNotFoundError with path", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const nonExistentPath = "/non-existent-file-for-error-test-12345.txt";

        try {
          await provider.read(nonExistentPath);
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
          expect((error as AFSNotFoundError).path).toBe(nonExistentPath);
          expect((error as AFSNotFoundError).code).toBe("AFS_NOT_FOUND");
        }
      });

      test("stat not-found: should throw AFSNotFoundError with path", async () => {
        const provider = getProvider();
        if (!provider.stat) return;

        const nonExistentPath = "/non-existent-stat-path-12345";

        try {
          await provider.stat(nonExistentPath);
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
          expect((error as AFSNotFoundError).path).toBe(nonExistentPath);
          expect((error as AFSNotFoundError).code).toBe("AFS_NOT_FOUND");
        }
      });

      test("meta not-found: should throw AFSNotFoundError", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const nonExistentPath = "/non-existent-meta-path-12345/.meta";

        try {
          await provider.read(nonExistentPath);
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(AFSNotFoundError);
          expect((error as AFSNotFoundError).code).toBe("AFS_NOT_FOUND");
        }
      });
    });

    describe("error message", () => {
      test("not-found error should have descriptive message", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const nonExistentPath = "/test-error-message-12345.txt";

        try {
          await provider.read(nonExistentPath);
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBeDefined();
          expect((error as Error).message.length).toBeGreaterThan(0);
        }
      });
    });
  });
}
