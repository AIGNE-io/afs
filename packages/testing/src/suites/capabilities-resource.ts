import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig } from "../types.js";

const VALID_OPS = ["read", "write", "exec"];

/**
 * Run capabilities resource validation suite.
 * Validates that the provider's /.meta/.capabilities contains
 * a well-formed resources declaration (caps, pricing, limits).
 *
 * This suite is optional — only runs when fixture declares expectResources: true.
 */
export function runCapabilitiesResourceTests(
  getProvider: () => AFSModule,
  _config: TestConfig,
): void {
  describe("capabilities-resource", () => {
    test("capabilities manifest should contain resources field", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      expect(manifest).toBeDefined();
      expect(manifest.resources).toBeDefined();
      expect(typeof manifest.resources).toBe("object");
    });

    test("resources.caps should be an array if present", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const resources = manifest?.resources as Record<string, unknown> | undefined;
      if (!resources?.caps) return;

      expect(Array.isArray(resources.caps)).toBe(true);
    });

    test("each cap should have valid op and non-empty path", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const resources = manifest?.resources as Record<string, unknown> | undefined;
      const caps = resources?.caps as Array<Record<string, unknown>> | undefined;
      if (!caps) return;

      for (const cap of caps) {
        expect(VALID_OPS).toContain(cap.op as string);
        expect(typeof cap.path).toBe("string");
        expect((cap.path as string).length).toBeGreaterThan(0);
      }
    });

    test("each cap description should be a string if present", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const resources = manifest?.resources as Record<string, unknown> | undefined;
      const caps = resources?.caps as Array<Record<string, unknown>> | undefined;
      if (!caps) return;

      for (const cap of caps) {
        if (cap.description !== undefined) {
          expect(typeof cap.description).toBe("string");
        }
      }
    });

    test("resources.pricing.currency should be a string if present", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const resources = manifest?.resources as Record<string, unknown> | undefined;
      const pricing = resources?.pricing as Record<string, unknown> | undefined;
      if (!pricing?.currency) return;

      expect(typeof pricing.currency).toBe("string");
    });

    test("resources.pricing numeric fields should be numbers", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const resources = manifest?.resources as Record<string, unknown> | undefined;
      const pricing = resources?.pricing as Record<string, unknown> | undefined;
      if (!pricing) return;

      for (const opKey of ["exec", "read", "write"]) {
        const opPricing = pricing[opKey] as Record<string, unknown> | undefined;
        if (!opPricing) continue;
        for (const [_key, val] of Object.entries(opPricing)) {
          if (val !== undefined) {
            expect(typeof val).toBe("number");
          }
        }
      }
    });

    test("resources.limits numeric fields should be positive integers", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta/.capabilities");
      const manifest = result.data?.content as Record<string, unknown>;
      const resources = manifest?.resources as Record<string, unknown> | undefined;
      const limits = resources?.limits as Record<string, unknown> | undefined;
      if (!limits) return;

      for (const key of ["rpm", "rpd", "maxTokensPerRequest", "maxConcurrency"]) {
        const val = limits[key];
        if (val !== undefined) {
          expect(typeof val).toBe("number");
          expect(val as number).toBeGreaterThan(0);
          expect(Number.isInteger(val)).toBe(true);
        }
      }
    });
  });
}
