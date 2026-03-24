import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig, TestDataStructure } from "../../types.js";
import { flattenTree, isFile } from "../../types.js";

/**
 * Run SensitiveLeakSecurity suite.
 * Tests that sensitive fields are masked when sensitivity=redacted.
 *
 * Only runs if the provider has sensitiveFields configured.
 */
export function runSensitiveLeakTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  describe("sensitive-leak", () => {
    test("sensitiveFields are masked in read results", async () => {
      const provider = getProvider();
      const read = provider.read;
      if (!read) return;

      // Check if provider has sensitiveFields
      const sensitiveFields = (provider as unknown as Record<string, unknown>).sensitiveFields as
        | string[]
        | undefined;
      if (!sensitiveFields || sensitiveFields.length === 0) {
        return; // Skip if no sensitive fields
      }

      // Find a file node to read
      const files = flattenTree(structure.root).filter((n) => n.path !== "/" && isFile(n.node));
      const firstFile = files[0];
      if (!firstFile) return;

      // Read with default sensitivity (should be redacted if provider supports it)
      const result = await read(firstFile.path);
      if (!result || !result.data || typeof result.data !== "object") return;

      const data = result.data as unknown as Record<string, unknown>;

      // Check that sensitive fields are masked
      for (const field of sensitiveFields) {
        if (field in data) {
          const value = data[field];
          if (typeof value === "string") {
            // Sensitive values should be redacted (e.g., "[REDACTED]" or "***")
            // They should NOT contain actual credential-like patterns
            expect(value).not.toMatch(/^(sk-|ghp_|gho_|aws_|AKIA)/);
          }
        }
      }
    });

    test("non-sensitive fields remain readable", async () => {
      const provider = getProvider();
      const read = provider.read;
      if (!read) return;

      const sensitiveFields = (provider as unknown as Record<string, unknown>).sensitiveFields as
        | string[]
        | undefined;
      if (!sensitiveFields || sensitiveFields.length === 0) return;

      const files = flattenTree(structure.root).filter((n) => n.path !== "/" && isFile(n.node));
      const firstFile = files[0];
      if (!firstFile) return;

      const result = await read(firstFile.path);
      if (!result || !result.data || typeof result.data !== "object") return;

      const data = result.data as unknown as Record<string, unknown>;
      const sensitiveSet = new Set(sensitiveFields);

      // Non-sensitive fields should have their actual values
      for (const [key, value] of Object.entries(data)) {
        if (!sensitiveSet.has(key) && typeof value === "string" && value.length > 0) {
          // Non-sensitive strings should NOT be "[REDACTED]"
          if (value === "[REDACTED]") {
            expect(`non-sensitive field "${key}" should not be redacted`).toBe("but it is");
          }
        }
      }
    });
  });
}
