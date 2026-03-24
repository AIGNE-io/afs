import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig, TestDataStructure } from "../types.js";

const OPERATION_KEYS: string[] = [
  "read",
  "list",
  "write",
  "delete",
  "search",
  "exec",
  "stat",
  "explain",
];

/**
 * Run capabilities operations validation suite.
 * Verifies that the provider's /.meta/.capabilities returns
 * a valid manifest with a complete operations declaration.
 */
export function runCapabilitiesOperationsTests(
  getProvider: () => AFSModule,
  _structure: TestDataStructure,
  _config: TestConfig,
): void {
  describe("capabilities-operations", () => {
    test("provider should return capabilities manifest via /.meta/.capabilities", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      expect(result.data).toBeDefined();
      expect(result.data?.content).toBeDefined();
    });

    test("capabilities manifest should have operations field", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      expect(manifest).toBeDefined();
      expect(manifest.operations).toBeDefined();
      expect(typeof manifest.operations).toBe("object");
    });

    test("operations should declare all 8 operations as booleans", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const operations = manifest?.operations as Record<string, unknown>;
      if (!operations) return;

      for (const key of OPERATION_KEYS) {
        expect(operations[key]).toBeDefined();
        expect(typeof operations[key]).toBe("boolean");
      }
    });

    test("operations should not have missing operation declarations", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const operations = manifest?.operations as Record<string, unknown>;
      if (!operations) return;

      const missing = OPERATION_KEYS.filter((key) => !(key in operations));
      expect(missing).toEqual([]);
    });

    test("extra fields in operations should be ignored (forward-compatible)", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const operations = manifest?.operations as Record<string, unknown>;
      if (!operations) return;

      // Just verify the 8 required fields exist - extra fields are fine
      for (const key of OPERATION_KEYS) {
        expect(key in operations).toBe(true);
      }
    });
  });
}
