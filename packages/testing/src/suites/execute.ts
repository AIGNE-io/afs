import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { ExecuteExpectedOutput, ExecuteTestCase, TestConfig } from "../types.js";

/**
 * Check if expected output is a validator function.
 */
function isValidator(
  expected: ExecuteExpectedOutput,
): expected is (output: Record<string, unknown>, expect: typeof import("bun:test").expect) => void {
  return typeof expected === "function";
}

/**
 * Check if expected output is a contains matcher.
 */
function isContainsMatcher(
  expected: ExecuteExpectedOutput,
): expected is { contains: Record<string, unknown> } {
  return typeof expected === "object" && expected !== null && "contains" in expected;
}

/**
 * Deep check if target contains all keys/values from subset.
 */
function deepContains(target: unknown, subset: unknown): boolean {
  if (subset === null || subset === undefined) {
    return target === subset;
  }

  if (typeof subset !== "object") {
    return target === subset;
  }

  if (Array.isArray(subset)) {
    if (!Array.isArray(target)) return false;
    return subset.every((item, index) => deepContains(target[index], item));
  }

  if (typeof target !== "object" || target === null) {
    return false;
  }

  const targetObj = target as Record<string, unknown>;
  const subsetObj = subset as Record<string, unknown>;

  for (const key of Object.keys(subsetObj)) {
    if (!(key in targetObj)) return false;
    if (!deepContains(targetObj[key], subsetObj[key])) return false;
  }

  return true;
}

/**
 * Run execute test suite.
 * Tests input/output behavior of executable nodes.
 */
export function runExecuteTests(
  getProvider: () => AFSModule,
  cases: ExecuteTestCase[],
  _config: TestConfig,
): void {
  describe("execute", () => {
    for (const testCase of cases) {
      test(`exec ${testCase.path}: ${testCase.name}`, async () => {
        const provider = getProvider();

        if (!provider.exec) {
          // exec not supported, skip
          return;
        }

        if (testCase.shouldThrow) {
          // Expect execution to throw
          let threw = false;
          let errorMessage = "";

          try {
            await provider.exec(testCase.path, testCase.args as Record<string, any>, {});
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
          // Expect successful execution
          const result = await provider.exec(
            testCase.path,
            testCase.args as Record<string, any>,
            {},
          );

          expect(result).toBeDefined();
          expect(result.data).toBeDefined();

          // Validate output if expected is specified
          if (testCase.expected !== undefined) {
            if (isValidator(testCase.expected)) {
              // Custom validator function - pass expect for assertions
              testCase.expected(result.data ?? {}, expect);
            } else if (isContainsMatcher(testCase.expected)) {
              // Partial match with contains
              const matches = deepContains(result.data ?? {}, testCase.expected.contains);
              expect(matches).toBe(true);
            } else {
              // Exact deep equality match
              expect(result.data).toEqual(testCase.expected);
            }
          }
        }
      });
    }
  });
}
