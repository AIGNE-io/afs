import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateManifestJSON } from "../src/manifest.js";

const ROOT = resolve(import.meta.dir, "../../..");
const PROVIDERS_DIR = join(ROOT, "providers");

/**
 * Find all providers that have manifest.json files.
 */
function findManifestFiles(): Array<{ name: string; path: string }> {
  const results: Array<{ name: string; path: string }> = [];
  // Support both flat (providers/NAME/) and categorized (providers/CATEGORY/NAME/) layouts
  for (const entry of readdirSync(PROVIDERS_DIR)) {
    const entryPath = join(PROVIDERS_DIR, entry);
    // Check flat layout: providers/NAME/manifest.json
    const flatManifest = join(entryPath, "manifest.json");
    if (existsSync(flatManifest)) {
      results.push({ name: entry, path: flatManifest });
      continue;
    }
    // Check categorized layout: providers/CATEGORY/NAME/manifest.json
    try {
      for (const sub of readdirSync(entryPath)) {
        const nestedManifest = join(entryPath, sub, "manifest.json");
        if (existsSync(nestedManifest)) {
          results.push({ name: sub, path: nestedManifest });
        }
      }
    } catch {
      // Not a directory, skip
    }
  }
  return results;
}

describe("Manifest File Compatibility", () => {
  const manifests = findManifestFiles();

  // If no manifest.json files exist yet, skip gracefully
  if (manifests.length === 0) {
    it.skip("no manifest.json files found (run scripts/gen-manifest-json.ts first)", () => {});
    return;
  }

  for (const { name, path } of manifests) {
    it(`${name}/manifest.json passes schema validation`, () => {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      const result = validateManifestJSON(raw);
      expect(result.valid).toBe(true);
      if (!result.valid) {
        console.error(`${name}: ${result.errors?.join(", ")}`);
      }
    });

    it(`${name}/manifest.json schema field is JSON Schema (not Zod)`, () => {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      if (raw.schema) {
        // Must be a plain object with "type" and "properties" — not a Zod instance
        expect(typeof raw.schema).toBe("object");
        expect(raw.schema.type).toBe("object");
        expect(typeof raw.schema.properties).toBe("object");
        // Should not have Zod internals
        expect(raw.schema._def).toBeUndefined();
      }
    });
  }

  it("all generated manifest.json files have required fields", () => {
    for (const { path } of manifests) {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      expect(raw.name).toBeDefined();
      expect(raw.description).toBeDefined();
      expect(raw.uriTemplate).toBeDefined();
      expect(raw.category).toBeDefined();
    }
  });
});
