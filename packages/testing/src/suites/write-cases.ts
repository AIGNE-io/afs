import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig, WriteExpectedOutput, WriteTestCase } from "../types.js";

/**
 * Check if expected output is a validator function.
 */
function isValidator(
  expected: WriteExpectedOutput,
): expected is (
  result: { data?: { path: string; content?: unknown; meta?: Record<string, unknown> | null } },
  expect: typeof import("bun:test").expect,
) => void {
  return typeof expected === "function";
}

/**
 * Check if expected output is a content matcher.
 */
function isContentMatcher(expected: WriteExpectedOutput): expected is { content: unknown } {
  return typeof expected === "object" && expected !== null && "content" in expected;
}

/**
 * Check if expected output is a contentContains matcher.
 */
function isContentContainsMatcher(
  expected: WriteExpectedOutput,
): expected is { contentContains: string } {
  return typeof expected === "object" && expected !== null && "contentContains" in expected;
}

/**
 * Check if expected output is a meta matcher.
 */
function isMetaMatcher(
  expected: WriteExpectedOutput,
): expected is { meta: Record<string, unknown> } {
  return typeof expected === "object" && expected !== null && "meta" in expected;
}

/**
 * Run write case tests.
 * Tests write operations based on fixture-defined cases.
 * These tests run LAST because they may modify the data structure.
 */
export function runWriteCaseTests(
  getProvider: () => AFSModule,
  cases: WriteTestCase[],
  _config: TestConfig,
): void {
  describe("write-cases", () => {
    for (const testCase of cases) {
      test(`write ${testCase.path}: ${testCase.name}`, async () => {
        const provider = getProvider();

        if (!provider.write) {
          // write not supported, skip
          return;
        }

        if (testCase.shouldThrow) {
          // Expect write to throw
          let threw = false;
          let errorMessage = "";

          try {
            await provider.write(testCase.path, testCase.payload, testCase.options ?? {});
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
          // Expect successful write
          const result = await provider.write(
            testCase.path,
            testCase.payload,
            testCase.options ?? {},
          );

          expect(result).toBeDefined();

          // Validate output if expected is specified
          if (testCase.expected !== undefined) {
            if (isValidator(testCase.expected)) {
              // Custom validator function
              testCase.expected(result, expect);
            } else if (isContentMatcher(testCase.expected)) {
              // Verify written content matches
              expect(result.data?.content).toEqual(testCase.expected.content);
            } else if (isContentContainsMatcher(testCase.expected)) {
              // Verify content contains string
              const content = result.data?.content;
              expect(typeof content === "string").toBe(true);
              expect(content as string).toContain(testCase.expected.contentContains);
            } else if (isMetaMatcher(testCase.expected)) {
              // Verify meta matches
              expect(result.data?.meta).toMatchObject(testCase.expected.meta);
            }
          }

          // Optionally verify by reading back
          if (testCase.expected && provider.read) {
            const readResult = await provider.read(testCase.path, {});
            expect(readResult).toBeDefined();
          }
        }
      });
    }
  });
}
