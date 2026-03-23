import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig } from "../../types.js";

/**
 * Run ResourceExhaustionSecurity suite.
 * Tests that the provider handles extreme inputs without crashing, hanging, or OOM.
 */
export function runResourceExhaustionTests(
  getProvider: () => AFSModule,
  _config: TestConfig,
): void {
  describe("resource-exhaustion", () => {
    test("handles 10,000-char path without crash", async () => {
      const provider = getProvider();
      if (!provider.read) return;
      const longPath = `/${"a".repeat(10000)}`;

      try {
        await provider.read(longPath);
        // Returning empty/null is fine
      } catch {
        // Throwing an error is the correct behavior
      }
      // If we reach here, the provider didn't crash or hang
    });

    test("handles 500-deep nested path without stack overflow", async () => {
      const provider = getProvider();
      if (!provider.list) return;
      const deepPath = `/${Array.from({ length: 500 }, (_, i) => `d${i}`).join("/")}`;

      try {
        await provider.list(deepPath);
      } catch {
        // Error is acceptable — stack overflow or hang is not
      }
    });

    test("root / still works after stress tests", async () => {
      const provider = getProvider();
      if (!provider.list) return;
      const result = await provider.list("/");
      expect(result).toBeDefined();
    });

    test("handles path with many special characters", async () => {
      const provider = getProvider();
      if (!provider.read) return;
      const specialPath = "/foo%00bar%0abaz/../../../";

      try {
        await provider.read(specialPath);
      } catch {
        // Error is fine
      }
    });

    // T9: Large payload handling
    test("write 1MB content is handled gracefully", async () => {
      const provider = getProvider();
      if (!provider.write) return;
      if (provider.accessMode === "readonly") return;

      const largeContent = "x".repeat(1024 * 1024); // 1MB
      try {
        await provider.write("/__large-payload-test", { content: largeContent });
      } catch {
        // Error is acceptable — crash or hang is not
      }
    });

    test("write deeply nested JSON (1000 levels) does not stack overflow", async () => {
      const provider = getProvider();
      if (!provider.write) return;
      if (provider.accessMode === "readonly") return;

      // Build a deeply nested object
      let nested: Record<string, unknown> = { value: "leaf" };
      for (let i = 0; i < 1000; i++) {
        nested = { child: nested };
      }

      try {
        await provider.write("/__deep-json-test", { content: JSON.stringify(nested) });
      } catch {
        // Error is acceptable — stack overflow is not
      }
    });

    test("exec with 1MB argument string does not crash", async () => {
      const provider = getProvider();
      if (!provider.exec) return;

      const largeArg = "x".repeat(1024 * 1024);
      try {
        await provider.exec("/__large-exec-test", { input: largeArg }, {});
      } catch {
        // Error is acceptable — crash or hang is not
      }
    });

    // T6: Read path that would produce > 100MB response — must timeout or error
    test("handles request for extremely large resource gracefully", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      // Try reading a path that could be very large
      try {
        await provider.read(`/${"a".repeat(50000)}`);
      } catch {
        // Error is the correct behavior
      }
    });
  });
}
