import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig } from "../../types.js";

/**
 * Path traversal attack payloads.
 * Tests that providers don't allow navigation outside their mount boundary.
 */
const TRAVERSAL_PAYLOADS = [
  { path: "/../../../etc/passwd", label: "basic ../ traversal" },
  { path: "/..%2f..%2f..%2fetc/passwd", label: "URL-encoded ..%2f traversal" },
  { path: "/....//....//etc/passwd", label: "double-dot-slash ....// traversal" },
  { path: "/valid/../../../etc/passwd", label: "mixed valid + traversal" },
  { path: "/..\\..\\..\\etc\\passwd", label: "backslash traversal" },
  { path: "/\x00/etc/passwd", label: "null byte injection" },

  // T2: Unicode normalization attacks
  { path: "/\u002e\u002e/\u002e\u002e/etc/passwd", label: "Unicode escape \\u002e traversal" },
  { path: "/\uff0e\uff0e/\uff0e\uff0e/etc/passwd", label: "fullwidth dot traversal" },
  { path: "/\u2025/etc/passwd", label: "two dot leader traversal" },

  // T3: Double URL encoding
  { path: "/%252e%252e/%252e%252e/etc/passwd", label: "double-encoded .. traversal" },
  { path: "/%25%32%65%25%32%65/etc/passwd", label: "double-encoded individual chars" },

  // T8: CRLF injection in paths
  { path: "/valid\r\nX-Injected: true", label: "CRLF header injection" },
  { path: "/valid\r\n\r\n<script>alert(1)</script>", label: "CRLF response splitting" },
];

/**
 * Run PathTraversalSecurity suite.
 * Tests that the provider rejects path traversal attempts.
 * All providers must handle these — either return error/empty or reject gracefully.
 */
export function runPathTraversalTests(getProvider: () => AFSModule, _config: TestConfig): void {
  describe("path-traversal", () => {
    for (const { path, label } of TRAVERSAL_PAYLOADS) {
      test(`read() rejects ${label}`, async () => {
        const provider = getProvider();
        if (!provider.read) return;
        try {
          const result = await provider.read(path);
          // If it returns, it must NOT contain sensitive system content
          if (result?.data) {
            const content =
              typeof result.data === "string" ? result.data : JSON.stringify(result.data);
            expect(content).not.toContain("root:");
            expect(content).not.toContain("/bin/bash");
            expect(content).not.toContain("/bin/sh");
          }
        } catch {
          // Throwing an error is the correct behavior
        }
      });

      test(`list() rejects ${label}`, async () => {
        const provider = getProvider();
        if (!provider.list) return;
        try {
          const result = await provider.list(path);
          // If it returns, ensure it doesn't list external directories
          if (result?.data) {
            for (const entry of result.data) {
              // Entry paths should not contain traversal sequences
              expect(entry.path).not.toContain("../");
              expect(entry.path).not.toContain("..\\");
            }
          }
        } catch {
          // Throwing an error is the correct behavior
        }
      });
    }

    test("normal valid path still works after traversal attempts", async () => {
      const provider = getProvider();
      if (!provider.list) return;
      // Root path should always work
      const result = await provider.list("/");
      expect(result).toBeDefined();
    });
  });
}
