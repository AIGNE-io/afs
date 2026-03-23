import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig, TestDataStructure } from "../types.js";
import { flattenTree, isDirectory } from "../types.js";

/**
 * AUP recipe fixture declaration for conformance testing.
 * When provided, validates that .aup/ recipes are properly served.
 */
export interface AupRecipeFixture {
  /** Path prefix where .aup/ lives (e.g., "/" or "/themes"). Defaults to "/". */
  path?: string;
  /** Expected recipe variant names (e.g., ["default", "compact"]) */
  variants: string[];
}

/**
 * Run .aup/ recipe path validation suite.
 * Validates that .aup/ is a proper implicit path:
 * - Not included in list results (hidden like .perception/)
 * - Recipes are readable and contain valid AUP node trees
 *
 * This suite is optional — only runs when fixture declares aup field.
 */
export function runAupRecipeTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  aup: AupRecipeFixture,
  _config: TestConfig,
): void {
  const basePath = aup.path || "/";

  describe("aup-recipe", () => {
    test(".aup/ should not appear in list results", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const result = await provider.list(basePath);
      const paths = result.data.map((e) => e.path ?? e.id);

      expect(paths.some((p) => p.includes(".aup"))).toBe(false);
    });

    test(".aup/ should not appear in any directory's list results", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const directories = flattenTree(structure.root).filter((n) => isDirectory(n.node));

      for (const dir of directories) {
        const result = await provider.list(dir.path);
        const paths = result.data.map((e) => e.path ?? e.id);

        expect(paths.some((p) => p.includes(".aup"))).toBe(false);
      }
    });

    for (const variant of aup.variants) {
      const recipePath =
        basePath === "/" ? `/.aup/${variant}.json` : `${basePath}/.aup/${variant}.json`;

      test(`read('${recipePath}') should return valid AUP node tree`, async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read(recipePath);
        expect(result.data?.content).toBeDefined();

        const recipe =
          typeof result.data!.content === "string"
            ? JSON.parse(result.data!.content)
            : result.data!.content;

        // Must be an object with id and type (basic AUP node contract)
        expect(recipe).toBeObject();
        expect(typeof recipe.id).toBe("string");
        expect(typeof recipe.type).toBe("string");
        // type must not be empty
        expect(recipe.type.length).toBeGreaterThan(0);
      });
    }
  });
}
