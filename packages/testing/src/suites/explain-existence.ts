import { describe, expect, test } from "bun:test";
import type { AFSExplainResult, AFSModule } from "@aigne/afs";
import type { TestConfig, TestDataStructure } from "../types.js";

/**
 * Run explain existence validation suite.
 * Verifies that the provider implements an explain handler
 * and that it returns non-empty content for the root path.
 */
export function runExplainExistenceTests(
  getProvider: () => AFSModule,
  _structure: TestDataStructure,
  _config: TestConfig,
): void {
  describe("explain-existence", () => {
    test("provider should implement explain handler", () => {
      const provider = getProvider();
      expect(provider.explain).toBeDefined();
      expect(typeof provider.explain).toBe("function");
    });

    test("explain root should return non-empty result", async () => {
      const provider = getProvider();
      if (!provider.explain) return;

      const result = (await provider.explain("/")) as AFSExplainResult;
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.content.length).toBeGreaterThan(0);
    });

    test("explain result should have format field", async () => {
      const provider = getProvider();
      if (!provider.explain) return;

      const result = (await provider.explain("/")) as AFSExplainResult;
      expect(result.format).toBeDefined();
      expect(typeof result.format).toBe("string");
      expect(["markdown", "text"]).toContain(result.format);
    });
  });
}
