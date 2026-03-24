import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig } from "../types.js";

/**
 * Expected event declaration for conformance testing.
 */
export interface ExpectedEventDeclaration {
  /** Event type identifier */
  type: string;
  /** Optional description to verify */
  description?: string;
}

/**
 * Run event declaration validation suite.
 * Validates that the provider's /.meta contains well-formed
 * event declarations matching the fixture's expected events.
 *
 * This suite is optional — only runs when fixture declares events field.
 */
export function runEventDeclarationTests(
  getProvider: () => AFSModule,
  expectedEvents: ExpectedEventDeclaration[],
  _config: TestConfig,
): void {
  describe("event-declaration", () => {
    test(".meta should contain events array", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta");
      const meta = result.data?.meta;

      expect(meta).toBeDefined();
      expect(meta?.events).toBeDefined();
      expect(Array.isArray(meta?.events)).toBe(true);
    });

    test("each event.type should be a non-empty string", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta");
      const events = result.data?.meta?.events as Array<Record<string, unknown>> | undefined;
      if (!events) return;

      for (const evt of events) {
        expect(typeof evt.type).toBe("string");
        expect((evt.type as string).length).toBeGreaterThan(0);
      }
    });

    test("each event.description should be a string if present", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta");
      const events = result.data?.meta?.events as Array<Record<string, unknown>> | undefined;
      if (!events) return;

      for (const evt of events) {
        if (evt.description !== undefined) {
          expect(typeof evt.description).toBe("string");
        }
      }
    });

    test("event types should match fixture declarations", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta");
      const events = result.data?.meta?.events as Array<Record<string, unknown>> | undefined;
      if (!events) return;

      const actualTypes = events.map((e) => e.type as string).sort();
      const expectedTypes = expectedEvents.map((e) => e.type).sort();

      expect(actualTypes).toEqual(expectedTypes);
    });

    test("event count should match fixture declaration count", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      const result = await provider.read("/.meta");
      const events = result.data?.meta?.events as Array<Record<string, unknown>> | undefined;
      if (!events) return;

      expect(events).toHaveLength(expectedEvents.length);
    });
  });
}
