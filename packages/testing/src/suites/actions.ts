import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { ActionExpectedOutput, ActionTestCase, TestConfig } from "../types.js";

/**
 * Check if expected output is a validator function.
 */
function isValidator(expected: ActionExpectedOutput): expected is (
  result: {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  },
  expect: typeof import("bun:test").expect,
) => void {
  return typeof expected === "function";
}

/**
 * Check if expected output is a contains matcher.
 */
function isContainsMatcher(
  expected: ActionExpectedOutput,
): expected is { contains: Record<string, unknown> } {
  return typeof expected === "object" && expected !== null && "contains" in expected;
}

/**
 * Check if expected output is a success-only matcher.
 */
function isSuccessMatcher(expected: ActionExpectedOutput): expected is { success: boolean } {
  return (
    typeof expected === "object" &&
    expected !== null &&
    "success" in expected &&
    !("data" in expected) &&
    !("contains" in expected)
  );
}

/**
 * Check if expected output is a data matcher.
 */
function isDataMatcher(
  expected: ActionExpectedOutput,
): expected is { data: Record<string, unknown> } {
  return typeof expected === "object" && expected !== null && "data" in expected;
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
 * Run action test suite.
 * Tests input/output behavior of actions on nodes.
 *
 * Actions are executed via exec() on .actions paths and return
 * AFSActionResult with success/data/error fields.
 */
export function runActionTests(
  getProvider: () => AFSModule,
  cases: ActionTestCase[],
  _config: TestConfig,
): void {
  describe("actions", () => {
    for (const testCase of cases) {
      test(`action ${testCase.path}: ${testCase.name}`, async () => {
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

          // AFSExecResult now extends AFSActionResult: { success, data?, error? }
          // Validate output if expected is specified
          if (testCase.expected !== undefined) {
            if (isValidator(testCase.expected)) {
              // Custom validator function - pass expect for assertions
              testCase.expected(result, expect);
            } else if (isSuccessMatcher(testCase.expected)) {
              // Just check success status
              expect(result.success).toBe(testCase.expected.success);
            } else if (isDataMatcher(testCase.expected)) {
              // Exact match on data field
              expect(result.success).toBe(true);
              expect(result.data).toEqual(testCase.expected.data);
            } else if (isContainsMatcher(testCase.expected)) {
              // Partial match with contains
              expect(result.success).toBe(true);
              const matches = deepContains(result.data, testCase.expected.contains);
              expect(matches).toBe(true);
            }
          }
        }
      });
    }
  });
}
