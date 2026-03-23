import { describe, expect, test } from "bun:test";
import { getProviderSchema, loadProvider } from "../src/loader/index.js";

/**
 * Loader Unit Tests
 *
 * These tests validate the loader's error handling behavior.
 * Integration tests with actual providers are in the CLI package
 * which has access to all provider dependencies.
 */
describe("Dynamic Provider Loader", () => {
  describe("loadProvider", () => {
    test("throws error for non-existent package", async () => {
      await expect(loadProvider("@nonexistent/package-xyz")).rejects.toThrow(
        /Failed to import package/,
      );
    });

    test("throws error for package without load method", async () => {
      // Try to load a package that exists but doesn't have the AFS Provider interface
      await expect(loadProvider("zod")).rejects.toThrow(/does not export a valid AFS Provider/);
    });

    test("error message includes package name", async () => {
      try {
        await loadProvider("@nonexistent/my-provider");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("@nonexistent/my-provider");
      }
    });
  });

  describe("getProviderSchema", () => {
    test("throws error for non-existent package", async () => {
      await expect(getProviderSchema("@nonexistent/package-xyz")).rejects.toThrow(
        /Failed to import package/,
      );
    });

    test("throws error for package without schema method", async () => {
      await expect(getProviderSchema("zod")).rejects.toThrow(/does not export schema\(\) method/);
    });

    test("error message includes package name", async () => {
      try {
        await getProviderSchema("@nonexistent/my-provider");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("@nonexistent/my-provider");
      }
    });
  });
});
