/**
 * gen-agent-md Command
 *
 * Generates a .afs/AGENT.md file from a provider's manifest and treeSchema.
 * This is a developer tool for provider authors.
 */

import type { CommandModule } from "yargs";
import type { CommandFactoryOptions, FormatFunction } from "./types.js";

export interface GenAgentMdArgs {
  provider: string;
}

interface ManifestInput {
  name: string;
  description: string;
  category: string;
  uriTemplate: string;
  tags?: string[];
  useCases?: string[];
}

interface TreeSchemaInput {
  operations: string[];
  tree: Record<
    string,
    { kind: string; operations?: string[]; actions?: string[]; destructive?: string[] }
  >;
  auth?: { type: string; env?: string[] };
  bestFor?: string[];
  notFor?: string[];
}

/**
 * Generate AGENT.md content from manifest and optional treeSchema.
 *
 * Exported for direct use in tests and other tools.
 */
export function generateAgentMd(manifest: ManifestInput, treeSchema?: TreeSchemaInput): string {
  const lines: string[] = [];

  // YAML frontmatter
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

  // Markdown body
  lines.push(`# ${manifest.name}`);
  lines.push("");
  lines.push(manifest.description);
  lines.push("");

  // Path structure from treeSchema
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

  // Use cases
  if (manifest.useCases?.length) {
    lines.push("## Use Cases");
    lines.push("");
    for (const uc of manifest.useCases) {
      lines.push(`- ${uc}`);
    }
    lines.push("");
  }

  // Best for / Not for
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

const formatGenAgentMd: FormatFunction = (result) => {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
};

export function createGenAgentMdCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, GenAgentMdArgs> {
  return {
    command: "gen-agent-md <provider>",
    describe: "Generate .afs/AGENT.md for a provider package",
    builder: {
      provider: {
        type: "string",
        description: "Provider package name (e.g., @aigne/afs-sqlite) or directory path",
        demandOption: true,
      },
    },
    handler: async (argv) => {
      try {
        const providerPath = argv.provider;

        // Dynamic import the provider package
        const mod = (await import(providerPath)) as Record<string, unknown>;

        // Find the provider class with static manifest()
        let manifest: ManifestInput | undefined;
        let treeSchema: TreeSchemaInput | undefined;

        for (const key of Object.keys(mod)) {
          const val = mod[key];
          if (typeof val !== "function") continue;
          if (typeof (val as any).manifest !== "function") continue;

          const result = (val as any).manifest();
          const m = Array.isArray(result) ? result[0] : result;
          if (m?.name) {
            manifest = m;
            if (typeof (val as any).treeSchema === "function") {
              treeSchema = (val as any).treeSchema();
            }
            break;
          }
        }

        if (!manifest) {
          options.onResult({
            command: "gen-agent-md",
            result: null,
            format: formatGenAgentMd,
            error: { message: `No provider class with static manifest() found in ${providerPath}` },
          });
          return;
        }

        const content = generateAgentMd(manifest, treeSchema);

        options.onResult({
          command: "gen-agent-md",
          result: content,
          format: formatGenAgentMd,
        });
      } catch (err) {
        options.onResult({
          command: "gen-agent-md",
          result: null,
          format: formatGenAgentMd,
          error: { message: `Failed to generate AGENT.md: ${err}` },
        });
      }
    },
  };
}
