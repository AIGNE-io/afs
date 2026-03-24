import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { ExecuteTestCase, TestConfig } from "../types.js";

/**
 * Run exec usage metadata validation suite.
 * Validates that exec results contain well-formed usage metadata
 * (tokens, cost, durationMs).
 *
 * This suite is optional — only runs when fixture declares expectUsage: true
 * and provides executeCases or actionCases.
 */
export function runExecUsageMetadataTests(
  getProvider: () => AFSModule,
  execCases: ExecuteTestCase[],
  _config: TestConfig,
): void {
  describe("exec-usage-metadata", () => {
    // Use the first non-throwing exec case for validation
    const validCase = execCases.find((c) => !c.shouldThrow);
    if (!validCase) return;

    test("exec result should contain usage field", async () => {
      const provider = getProvider();
      if (!provider.exec) return;

      const result = await provider.exec(validCase.path, validCase.args, {});
      expect(result).toBeDefined();

      const usage = result.usage as Record<string, unknown> | undefined;
      expect(usage).toBeDefined();
    });

    test("usage.tokens should have input, output, total as numbers if present", async () => {
      const provider = getProvider();
      if (!provider.exec) return;

      const result = await provider.exec(validCase.path, validCase.args, {});
      const usage = result.usage as Record<string, unknown> | undefined;
      if (!usage) return;

      const tokens = usage.tokens as Record<string, unknown> | undefined;
      if (!tokens) return;

      expect(typeof tokens.input).toBe("number");
      expect(typeof tokens.output).toBe("number");
      expect(typeof tokens.total).toBe("number");
    });

    test("usage.cost should be a number if present", async () => {
      const provider = getProvider();
      if (!provider.exec) return;

      const result = await provider.exec(validCase.path, validCase.args, {});
      const usage = result.usage as Record<string, unknown> | undefined;
      if (!usage) return;

      if (usage.cost !== undefined) {
        expect(typeof usage.cost).toBe("number");
      }
    });

    test("usage.durationMs should be a non-negative number if present", async () => {
      const provider = getProvider();
      if (!provider.exec) return;

      const result = await provider.exec(validCase.path, validCase.args, {});
      const usage = result.usage as Record<string, unknown> | undefined;
      if (!usage) return;

      if (usage.durationMs !== undefined) {
        expect(typeof usage.durationMs).toBe("number");
        expect(usage.durationMs as number).toBeGreaterThanOrEqual(0);
      }
    });
  });
}
