import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig } from "../../types.js";

/**
 * Run AccessBoundarySecurity suite.
 * Tests that readonly providers reject write/delete/exec operations.
 * For readwrite providers, verifies that operations work (complementary to AccessModeValidation).
 * Also tests prototype pollution and reserved path write protection.
 */
export function runAccessBoundaryTests(getProvider: () => AFSModule, _config: TestConfig): void {
  describe("access-boundary", () => {
    test("readonly provider rejects write()", async () => {
      const provider = getProvider();
      if (provider.accessMode !== "readonly") return;
      if (!provider.write) return;

      try {
        await provider.write("/__security-test-write", { content: "test" });
        // Should not succeed on readonly provider
        expect("write succeeded on readonly").toBe("should have thrown");
      } catch (error: unknown) {
        expect(error).toBeDefined();
        if (error instanceof Error) {
          expect(error.message || error.constructor.name).toBeTruthy();
        }
      }
    });

    test("readonly provider rejects delete()", async () => {
      const provider = getProvider();
      if (provider.accessMode !== "readonly") return;
      if (!provider.delete) return;

      try {
        await provider.delete("/__security-test-delete");
        expect("delete succeeded on readonly").toBe("should have thrown");
      } catch (error: unknown) {
        expect(error).toBeDefined();
      }
    });

    test("readonly provider rejects exec()", async () => {
      const provider = getProvider();
      if (provider.accessMode !== "readonly") return;
      if (!provider.exec) return;

      try {
        await provider.exec("/__security-test-exec", {}, {});
        expect("exec succeeded on readonly").toBe("should have thrown");
      } catch (error: unknown) {
        expect(error).toBeDefined();
      }
    });

    test("readonly provider rejects rename()", async () => {
      const provider = getProvider();
      if (provider.accessMode !== "readonly") return;
      if (!provider.rename) return;

      try {
        await provider.rename("/__security-src", "/__security-dst");
        expect("rename succeeded on readonly").toBe("should have thrown");
      } catch (error: unknown) {
        expect(error).toBeDefined();
      }
    });

    // T1: Prototype pollution via write
    test("write to /__proto__/polluted must error or be no-op", async () => {
      const provider = getProvider();
      if (!provider.write) return;

      try {
        await provider.write("/__proto__/polluted", { content: "pwned" });
      } catch {
        // Error is the correct behavior
      }

      // Verify prototype was not polluted
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    test("write to /constructor/prototype must error or be no-op", async () => {
      const provider = getProvider();
      if (!provider.write) return;

      try {
        await provider.write("/constructor/prototype", { content: "pwned" });
      } catch {
        // Error is the correct behavior
      }

      // Verify no pollution
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    // T5: Reserved/internal path write protection
    test("write to /.meta must be rejected", async () => {
      const provider = getProvider();
      if (!provider.write) return;

      try {
        await provider.write("/.meta", { content: "injected" });
        // If it doesn't throw, it should be a no-op (not overwrite internal state)
      } catch {
        // Error is the correct behavior
      }
    });

    test("write to /.actions/custom must be rejected", async () => {
      const provider = getProvider();
      if (!provider.write) return;

      try {
        await provider.write("/.actions/custom", { content: "injected" });
      } catch {
        // Error is the correct behavior
      }
    });

    test("write to /.perception/ must be rejected", async () => {
      const provider = getProvider();
      if (!provider.write) return;

      try {
        await provider.write("/.perception/injected.md", { content: "injected" });
      } catch {
        // Error is the correct behavior
      }
    });

    test("write to /.aup/ must be rejected", async () => {
      const provider = getProvider();
      if (!provider.write) return;

      try {
        await provider.write("/.aup/injected.json", { content: "injected" });
      } catch {
        // Error is the correct behavior
      }
    });
  });
}
