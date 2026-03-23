import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig } from "../../types.js";

/**
 * Patterns that indicate information leakage in error messages.
 */
const ABSOLUTE_PATH_PATTERNS = [
  /\/Users\/\w+/,
  /\/home\/\w+/,
  /C:\\Users\\\w+/,
  /\/var\/lib\//,
  /\/tmp\/[a-zA-Z0-9]{10,}/,
];

const STACK_TRACE_PATTERNS = [/^\s+at\s+/, /\.ts:\d+:\d+/, /\.js:\d+:\d+/];

/**
 * Run ErrorInfoLeakSecurity suite.
 * Tests that error messages don't expose internal paths, stack traces, or module names.
 */
export function runErrorInfoLeakTests(getProvider: () => AFSModule, _config: TestConfig): void {
  describe("error-info-leak", () => {
    test("read non-existent path error does not contain absolute local path", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      try {
        await provider.read("/definitely-nonexistent-path-12345");
      } catch (error: unknown) {
        if (error instanceof Error) {
          for (const pattern of ABSOLUTE_PATH_PATTERNS) {
            expect(error.message).not.toMatch(pattern);
          }
        }
      }
    });

    test("read error does not expose stack trace in message", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      try {
        await provider.read("/definitely-nonexistent-path-12345");
      } catch (error: unknown) {
        if (error instanceof Error) {
          for (const pattern of STACK_TRACE_PATTERNS) {
            expect(error.message).not.toMatch(pattern);
          }
        }
      }
    });

    test("list with invalid path error does not expose internals", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      try {
        await provider.list("/\x00invalid");
      } catch (error: unknown) {
        if (error instanceof Error) {
          for (const pattern of ABSOLUTE_PATH_PATTERNS) {
            expect(error.message).not.toMatch(pattern);
          }
          for (const pattern of STACK_TRACE_PATTERNS) {
            expect(error.message).not.toMatch(pattern);
          }
        }
      }
    });
  });
}
