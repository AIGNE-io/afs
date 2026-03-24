#!/usr/bin/env bun
/**
 * Auto-generate .afs/AGENT.md for all provider packages.
 *
 * Scans providers/ and packages/ for @aigne/afs-* packages,
 * imports each, extracts manifest() + treeSchema(), and writes
 * .afs/AGENT.md using the same logic as `afs gen-agent-md`.
 *
 * Run after build: `bun scripts/gen-agent-md.ts`
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Packages that are NOT providers. */
const EXCLUDED = new Set([
  "@aigne/afs",
  "@aigne/afs-testing",
  "@aigne/afs-explorer",
  "@aigne/afs-registry",
  "@aigne/afs-http",
  "@aigne/afs-cli",
  "@aigne/afs-mapping",
  "@aigne/afs-compute-abstraction",
  "@aigne/afs-world-mapping",
  "@aigne/afs-domain-action",
  "@aigne/afs-session",
]);

interface Manifest {
  name: string;
  description: string;
  category: string;
  uriTemplate: string;
  tags?: string[];
  capabilityTags?: string[];
  useCases?: string[];
}

interface TreeSchema {
  operations: string[];
  tree: Record<
    string,
    { kind: string; operations?: string[]; actions?: string[]; destructive?: string[] }
  >;
  auth?: { type: string; env?: string[] };
  bestFor?: string[];
  notFor?: string[];
}

function generateAgentMd(manifest: Manifest, treeSchema?: TreeSchema): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`name: ${manifest.name}`);
  lines.push(`category: ${manifest.category}`);
  lines.push(`uri: ${manifest.uriTemplate}`);

  if (treeSchema) {
    lines.push("operations:");
    for (const op of treeSchema.operations) {
      lines.push(`  - ${op}`);
    }
  }

  if (manifest.tags?.length) {
    lines.push("tags:");
    for (const tag of manifest.tags) {
      lines.push(`  - ${tag}`);
    }
  }

  if (manifest.capabilityTags?.length) {
    lines.push("capabilityTags:");
    for (const tag of manifest.capabilityTags) {
      lines.push(`  - ${tag}`);
    }
  }

  if (treeSchema?.auth) {
    lines.push(`auth: ${treeSchema.auth.type}`);
    if (treeSchema.auth.env?.length) {
      lines.push("auth_env:");
      for (const env of treeSchema.auth.env) {
        lines.push(`  - ${env}`);
      }
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`# ${manifest.name}`);
  lines.push("");
  lines.push(manifest.description);
  lines.push("");

  if (treeSchema) {
    lines.push("## Path Structure");
    lines.push("");
    for (const [path, node] of Object.entries(treeSchema.tree)) {
      let line = `- \`${path}\` — ${node.kind}`;
      if (node.actions?.length) {
        line += ` (actions: ${node.actions.join(", ")})`;
      }
      if (node.destructive?.length) {
        line += ` **[destructive: ${node.destructive.join(", ")}]**`;
      }
      lines.push(line);
    }
    lines.push("");
  }

  if (manifest.useCases?.length) {
    lines.push("## Use Cases");
    lines.push("");
    for (const uc of manifest.useCases) {
      lines.push(`- ${uc}`);
    }
    lines.push("");
  }

  if (treeSchema?.bestFor?.length) {
    lines.push("## Best For");
    lines.push("");
    for (const item of treeSchema.bestFor) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (treeSchema?.notFor?.length) {
    lines.push("## Not Recommended For");
    lines.push("");
    for (const item of treeSchema.notFor) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const root = join(dirname(import.meta.dir));
  const scanDirs = ["providers", "packages"];
  let generated = 0;
  let skipped = 0;

  for (const scanDir of scanDirs) {
    const fullDir = join(root, scanDir);
    if (!existsSync(fullDir)) continue;

    for (const entry of readdirSync(fullDir)) {
      const pkgJsonPath = join(fullDir, entry, "package.json");
      if (!existsSync(pkgJsonPath)) continue;

      let pkgName: string;
      try {
        pkgName = JSON.parse(readFileSync(pkgJsonPath, "utf-8")).name;
      } catch {
        continue;
      }

      if (!pkgName?.startsWith("@aigne/afs-") || EXCLUDED.has(pkgName)) continue;

      const packageDir = join(fullDir, entry);

      try {
        // Resolve entry point
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        const rawImport = typeof pkg.exports === "object" ? pkg.exports["."]?.import : undefined;
        const esmEntry =
          (typeof rawImport === "string"
            ? rawImport
            : typeof rawImport === "object"
              ? rawImport.default
              : undefined) || pkg.module;
        const importPath = esmEntry
          ? join(packageDir, esmEntry)
          : pkg.main
            ? join(packageDir, pkg.main)
            : packageDir;

        const mod = (await import(importPath)) as Record<string, unknown>;

        // Collect all manifests from all provider classes in this package
        const sections: string[] = [];
        const seen = new Set<string>();

        for (const key of Object.keys(mod)) {
          const val = mod[key];
          if (typeof val !== "function") continue;
          if (typeof (val as any).manifest !== "function") continue;

          const result = (val as any).manifest();
          const manifests: Manifest[] = Array.isArray(result) ? result : [result];

          let treeSchema: TreeSchema | undefined;
          if (typeof (val as any).treeSchema === "function") {
            try {
              treeSchema = (val as any).treeSchema();
            } catch {
              /* skip */
            }
          }

          for (const manifest of manifests) {
            if (!manifest?.name || seen.has(manifest.name)) continue;
            seen.add(manifest.name);
            sections.push(generateAgentMd(manifest, treeSchema));
          }
        }

        if (sections.length === 0) continue;

        const content = sections.join("\n---\n\n");
        const agentMdDir = join(packageDir, ".afs");
        const agentMdPath = join(agentMdDir, "AGENT.md");

        // Check if content changed
        if (existsSync(agentMdPath)) {
          const existing = readFileSync(agentMdPath, "utf-8");
          if (existing === content) {
            skipped++;
            continue;
          }
        }

        mkdirSync(agentMdDir, { recursive: true });
        writeFileSync(agentMdPath, content, "utf-8");
        const names = Array.from(seen).join(", ");
        console.log(`  ✓ ${names} → ${agentMdPath.replace(`${root}/`, "")}`);
        generated++;
      } catch (err) {
        console.warn(`  ⚠ ${pkgName}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(`\nDone: ${generated} generated, ${skipped} unchanged`);
}

main().catch(console.error);
