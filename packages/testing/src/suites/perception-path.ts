import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig, TestDataStructure } from "../types.js";
import { flattenTree, isDirectory } from "../types.js";

/**
 * Perception fixture declaration for conformance testing.
 */
export interface PerceptionFixture {
  /** Expected content substring in .perception/README.md */
  readme?: string;
  /** List of expected entries in .perception/ (e.g., ["README.md", "views"]) */
  entries?: string[];
}

/**
 * Run perception path validation suite.
 * Validates that .perception/ is a proper implicit path:
 * - Not included in list results
 * - Listable and readable when provider implements handlers
 *
 * This suite is optional — only runs when fixture declares perception field.
 */
export function runPerceptionPathTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  perception: PerceptionFixture,
  _config: TestConfig,
): void {
  describe("perception-path", () => {
    test(".perception/ should not appear in list('/') results", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const result = await provider.list("/");
      const paths = result.data.map((e) => e.path ?? e.id);

      expect(paths.some((p) => p.includes(".perception"))).toBe(false);
    });

    test(".perception/ should not appear in any directory's list results", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const directories = flattenTree(structure.root).filter((n) => isDirectory(n.node));

      for (const dir of directories) {
        const result = await provider.list(dir.path);
        const paths = result.data.map((e) => e.path ?? e.id);

        expect(paths.some((p) => p.includes(".perception"))).toBe(false);
      }
    });

    test("list('.perception/') should return directory contents", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const result = await provider.list("/.perception");
      expect(result.data.length).toBeGreaterThan(0);
    });

    if (perception.readme) {
      test("read('.perception/README.md') should contain expected content", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read("/.perception/README.md");
        expect(result.data?.content).toBeDefined();
        expect(String(result.data!.content)).toContain(perception.readme!);
      });
    }

    if (perception.entries && perception.entries.length > 0) {
      test("declared perception entries should be accessible", async () => {
        const provider = getProvider();
        if (!provider.list) return;

        const result = await provider.list("/.perception");
        const ids = result.data.map((e) => e.id);

        for (const entry of perception.entries!) {
          expect(ids).toContain(entry);
        }
      });
    }
  });
}
