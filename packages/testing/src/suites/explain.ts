import { describe, expect, test } from "bun:test";
import type { AFSExplainResult, AFSModule } from "@aigne/afs";
import { findFirstFile, type TestConfig, type TestDataStructure } from "../types.js";

/**
 * Run explain operation test suite.
 * Tests the explain() method for getting human-readable descriptions.
 */
export function runExplainTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;
  const fileNode = findFirstFile(root);

  describe("explain", () => {
    test("explain: method should exist or be undefined", () => {
      const provider = getProvider();
      // explain is optional - should be either a function or undefined
      expect(provider.explain === undefined || typeof provider.explain === "function").toBe(true);
    });

    test("explain root: should return explanation if supported", async () => {
      const provider = getProvider();
      if (!provider.explain) return;

      try {
        const result = (await provider.explain("/")) as AFSExplainResult;
        expect(result).toBeDefined();
        // AFSExplainResult has format and content directly (not wrapped in data)
        if (result.content !== undefined) {
          expect(typeof result.content).toBe("string");
        }
        if (result.format !== undefined) {
          expect(typeof result.format).toBe("string");
          expect(["markdown", "text"]).toContain(result.format);
        }
      } catch (error) {
        // No explain handler is acceptable - should throw "No explain handler" error
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("explain");
      }
    });

    if (fileNode) {
      test("explain file: should return explanation for file path", async () => {
        const provider = getProvider();
        if (!provider.explain) return;

        try {
          const result = (await provider.explain(fileNode.path)) as AFSExplainResult;
          expect(result).toBeDefined();
          // AFSExplainResult has format and content directly (not wrapped in data)
          expect(result.format).toBeDefined();
          expect(result.content).toBeDefined();
        } catch (error) {
          // No handler is acceptable
          expect(error).toBeInstanceOf(Error);
        }
      });
    }

    test("explain: no handler should throw descriptive error", async () => {
      const provider = getProvider();
      if (!provider.explain) return;

      // Try to explain a path that likely has no handler
      const testPath = "/test-explain-no-handler-12345";

      try {
        await provider.explain(testPath);
        // If it doesn't throw, that's also acceptable (provider may have catch-all handler)
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        // Should mention either "explain" or "handler" or the path
        expect(
          message.includes("explain") || message.includes("handler") || message.includes(testPath),
        ).toBe(true);
      }
    });
  });
}
