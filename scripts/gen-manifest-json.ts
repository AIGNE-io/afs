#!/usr/bin/env bun
/**
 * One-time migration script: extract static manifest() from each provider
 * and write manifest.json files with JSON Schema (converting Zod if needed).
 *
 * Usage: bun scripts/gen-manifest-json.ts [--dry-run]
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PROVIDERS_DIR = join(ROOT, "providers");
const DRY_RUN = process.argv.includes("--dry-run");

interface ProviderEntry {
  dir: string;
  name: string;
  entryFile: string;
}

/**
 * Find all provider directories that have a src/ with TypeScript files.
 */
function findProviders(): ProviderEntry[] {
  const entries: ProviderEntry[] = [];
  // Support categorized layout: providers/CATEGORY/NAME/
  for (const category of readdirSync(PROVIDERS_DIR)) {
    const categoryDir = join(PROVIDERS_DIR, category);
    try {
      for (const name of readdirSync(categoryDir)) {
        const dir = join(categoryDir, name);
        const srcDir = join(dir, "src");
        if (!existsSync(srcDir)) continue;

        // Find the main entry file
        for (const candidate of [
          "index.ts",
          `${name}-afs.ts`,
          `${name}-provider.ts`,
          `${name}.ts`,
        ]) {
          const entryFile = join(srcDir, candidate);
          if (existsSync(entryFile)) {
            entries.push({ dir, name, entryFile });
            break;
          }
        }
      }
    } catch {
      // Not a directory, skip
    }
  }
  return entries;
}

/**
 * Check if a schema is already a plain JSON Schema object (not Zod).
 */
function isPlainJSONSchema(schema: unknown): boolean {
  if (schema == null || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  return s.type !== undefined && s.properties !== undefined && typeof s.properties === "object";
}

/**
 * Convert a Zod schema to JSON Schema using Zod 4's toJSONSchema.
 */
async function zodToJSONSchema(zodSchema: unknown): Promise<unknown> {
  try {
    const { z } = await import(join(ROOT, "packages/core/node_modules/zod"));
    return (z as unknown as { toJSONSchema: (s: unknown) => unknown }).toJSONSchema(zodSchema);
  } catch (e) {
    console.warn(`  Warning: Zod→JSON Schema conversion failed: ${e}`);
    return undefined;
  }
}

async function main() {
  const providers = findProviders();
  console.log(`Found ${providers.length} providers`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { dir, name, entryFile } of providers) {
    const manifestPath = join(dir, "manifest.json");

    // Skip if manifest.json already exists
    if (existsSync(manifestPath)) {
      console.log(`  ⏭  ${name}: manifest.json already exists`);
      skipped++;
      continue;
    }

    try {
      // Dynamic import the provider module
      const mod = await import(entryFile);

      // Find the class with static manifest()
      let manifest: Record<string, unknown> | null = null;
      for (const key of Object.keys(mod)) {
        const cls = mod[key];
        if (typeof cls === "function" && typeof cls.manifest === "function") {
          const raw = cls.manifest();
          // Handle multi-manifest (returns array)
          manifest = Array.isArray(raw) ? raw[0] : raw;
          break;
        }
      }

      if (!manifest) {
        console.log(`  ⏭  ${name}: no static manifest() found`);
        skipped++;
        continue;
      }

      // Convert schema from Zod to JSON Schema if needed
      const result: Record<string, unknown> = { ...manifest };
      if (result.schema) {
        if (isPlainJSONSchema(result.schema)) {
          // Already JSON Schema — keep as-is
        } else {
          // Assume Zod — convert
          const jsonSchema = await zodToJSONSchema(result.schema);
          if (jsonSchema) {
            result.schema = jsonSchema;
          } else {
            delete result.schema;
          }
        }
      }

      // Write manifest.json
      const json = `${JSON.stringify(result, null, 2)}\n`;
      if (DRY_RUN) {
        console.log(`  ✓  ${name}: would write manifest.json (${json.length} bytes)`);
      } else {
        writeFileSync(manifestPath, json);
        console.log(`  ✓  ${name}: wrote manifest.json (${json.length} bytes)`);
      }
      generated++;
    } catch (e) {
      console.error(`  ✗  ${name}: failed — ${e}`);
      failed++;
    }
  }

  console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${failed} failed`);
  if (DRY_RUN) console.log("(dry run — no files written)");
}

main().catch(console.error);
