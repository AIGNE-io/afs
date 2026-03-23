import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { AFSReadonlyError } from "@aigne/afs";
import type { TestConfig } from "../types.js";

/**
 * Run AccessMode test suite.
 * Tests that readonly providers reject write operations.
 */
export function runAccessModeTests(getProvider: () => AFSModule, _config: TestConfig): void {
  describe("access-mode", () => {
    test("readonly: write should throw AFSReadonlyError", async () => {
      const provider = getProvider();

      // Skip if provider is readwrite or doesn't have write
      if (provider.accessMode !== "readonly" || !provider.write) {
        return;
      }

      try {
        await provider.write("/test-readonly.txt", { content: "test" });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSReadonlyError);
        expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      }
    });

    test("readonly: delete should throw AFSReadonlyError", async () => {
      const provider = getProvider();

      if (provider.accessMode !== "readonly" || !provider.delete) {
        return;
      }

      try {
        await provider.delete("/test-readonly.txt");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSReadonlyError);
        expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      }
    });

    test("readonly: exec should throw AFSReadonlyError", async () => {
      const provider = getProvider();

      if (provider.accessMode !== "readonly" || !provider.exec) {
        return;
      }

      try {
        await provider.exec("/test-action", {}, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSReadonlyError);
        expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      }
    });

    test("readonly: rename should throw AFSReadonlyError", async () => {
      const provider = getProvider();

      if (provider.accessMode !== "readonly" || !provider.rename) {
        return;
      }

      try {
        await provider.rename("/old.txt", "/new.txt");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSReadonlyError);
        expect((error as AFSReadonlyError).code).toBe("AFS_READONLY");
      }
    });
  });
}
