import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { DeleteTestCase, TestConfig } from "../types.js";

/**
 * Run delete case tests.
 * Tests delete operations based on fixture-defined cases.
 * These tests run LAST because they modify the data structure.
 */
export function runDeleteCaseTests(
  getProvider: () => AFSModule,
  cases: DeleteTestCase[],
  _config: TestConfig,
): void {
  describe("delete-cases", () => {
    for (const testCase of cases) {
      test(`delete ${testCase.path}: ${testCase.name}`, async () => {
        const provider = getProvider();

        if (!provider.delete) {
          // delete not supported, skip
          return;
        }

        if (testCase.shouldThrow) {
          // Expect delete to throw
          let threw = false;
          let errorMessage = "";

          try {
            await provider.delete(testCase.path, {});
          } catch (error) {
            threw = true;
            errorMessage = error instanceof Error ? error.message : String(error);
          }

          expect(threw).toBe(true);

          // Optionally match error message
          if (typeof testCase.shouldThrow === "string") {
            expect(errorMessage).toContain(testCase.shouldThrow);
          } else if (testCase.shouldThrow instanceof RegExp) {
            expect(errorMessage).toMatch(testCase.shouldThrow);
          }
        } else {
          // Expect successful delete
          const result = await provider.delete(testCase.path, {});

          expect(result).toBeDefined();

          // Verify deletion if verifyDeleted is true (default)
          const shouldVerify = testCase.verifyDeleted !== false;
          if (shouldVerify && provider.list) {
            // Try to access the deleted path - should throw or return empty
            let deleted = false;
            try {
              const listResult = await provider.list(testCase.path, {});
              // If list succeeds but returns nothing, consider it deleted
              deleted = !listResult.data || listResult.data.length === 0;
            } catch {
              // Path not found = successfully deleted
              deleted = true;
            }

            expect(deleted).toBe(true);
          }
        }
      });
    }
  });
}
