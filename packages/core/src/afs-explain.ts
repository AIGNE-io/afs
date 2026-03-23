/**
 * Explain generation helpers for AFS.
 *
 * These functions produce human-readable markdown documentation
 * for AFS paths. They take structured data as input and return
 * formatted markdown — no AFS instance dependencies.
 */
import type { AFSEntry, AFSExplainResult, AFSListResult } from "./type.js";

/** Mount info needed by explainRoot() */
export interface MountInfo {
  path: string;
  module: { name: string; description?: string };
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Build explain markdown from stat data.
 * Used by both the module-found fallback and the no-module safety net.
 */
export function buildExplainFromStat(
  path: string,
  data: Omit<AFSEntry, "content">,
): AFSExplainResult {
  const lines: string[] = [];
  lines.push(`# ${path}`);
  lines.push("");

  const meta = data.meta || {};

  if (meta.size !== undefined) {
    lines.push(`- **Size**: ${formatBytes(meta.size as number)}`);
  }
  if (meta.childrenCount !== undefined) {
    lines.push(`- **Children**: ${meta.childrenCount} items`);
  }
  if (data.updatedAt) {
    lines.push(`- **Modified**: ${data.updatedAt.toISOString()}`);
  }

  if (meta.description) {
    lines.push("");
    lines.push("## Description");
    lines.push(String(meta.description));
  }
  if (meta.provider) {
    lines.push(`- **Provider**: ${meta.provider}`);
  }
  if (meta.kind) {
    lines.push(`- **Kind**: ${meta.kind}`);
  }
  if (meta.kinds && Array.isArray(meta.kinds)) {
    lines.push(`- **Kinds**: ${meta.kinds.join(", ")}`);
  }

  if (data.actions && data.actions.length > 0) {
    lines.push("");
    lines.push("## Actions");
    for (const action of data.actions) {
      lines.push(`- **${action.name}**${action.description ? `: ${action.description}` : ""}`);
    }
  }

  return {
    format: "markdown",
    content: lines.join("\n"),
  };
}

/**
 * Build explain for a virtual intermediate directory.
 */
export function buildVirtualDirExplain(path: string, data: AFSEntry): AFSExplainResult {
  const childrenCount = data.meta?.childrenCount;
  const lines: string[] = [];
  lines.push(`# ${path}`);
  lines.push("");
  lines.push("- **Type**: Virtual directory");
  if (childrenCount !== undefined) {
    lines.push(`- **Children**: ${childrenCount} items`);
  }

  return {
    format: "markdown",
    content: lines.join("\n"),
  };
}

/**
 * Generate root explain: intro + 4 sections.
 */
export async function explainRoot(
  mounts: MountInfo[],
  listRootActions: () => Promise<AFSListResult>,
): Promise<AFSExplainResult> {
  const lines: string[] = [];
  lines.push("# AFS — Agentic File System");
  lines.push("");
  lines.push(
    "AFS is a virtual filesystem developed by [ArcBlock](https://www.arcblock.io) that gives AI agents a unified, path-based interface to any data source.",
  );
  lines.push(
    'Inspired by Unix and Plan 9\'s "everything is a file", AFS extends the idea to **everything is context** — databases, APIs, smart home devices, and cloud services all become files and directories that agents can read, write, search, and act on.',
  );
  lines.push("");

  // Section 1: Mounted Providers
  lines.push("## Mounted Providers");
  lines.push("");
  if (mounts.length === 0) {
    lines.push("No providers currently mounted. Use the `mount` action to add providers.");
    lines.push("");
  } else {
    for (const m of mounts) {
      if (m.module.description) {
        // Multi-line descriptions: first line as header, rest indented
        const descLines = m.module.description.split("\n");
        lines.push(`- **${m.module.name}** (\`${m.path}\`) — ${descLines[0]}`);
        for (let i = 1; i < descLines.length; i++) {
          lines.push(`  ${descLines[i]}`);
        }
      } else {
        lines.push(`- **${m.module.name}** (\`${m.path}\`)`);
      }
    }
    lines.push("");
  }

  // Section 2: Standard Operations
  lines.push("## Standard Operations");
  lines.push("");
  lines.push("- **read** — Read file or node content");
  lines.push("- **list** — List children of a directory or container");
  lines.push("- **stat** — Get metadata without content");
  lines.push("- **explain** — Get human-readable documentation for a path");
  lines.push("- **search** — Search within a mounted provider");
  lines.push("- **write** — Create or update content");
  lines.push("- **delete** — Remove a file or node");
  lines.push("- **exec** — Execute an action at a path");
  lines.push("");

  // Section 3: Root Actions
  lines.push("## Root Actions");
  lines.push("");
  const { data: actions } = await listRootActions();
  for (const action of actions) {
    const desc = action.actions?.[0]?.description || action.summary || "";
    lines.push(`- **${action.id}** — ${desc}`);
  }
  lines.push("");
  lines.push("Use `explain('/.actions/<name>')` for detailed usage.");
  lines.push("");

  // Section 4: Quick Start
  lines.push("## Quick Start");
  lines.push("");
  lines.push("- List all sites: `list /web/sites`");
  lines.push("- Read a site page: `read /web/sites/{name}/pages/index.html`");
  lines.push('- Search a provider: `search /registry "query"` (search at `/` is not supported)');
  lines.push("- Run an LLM: `exec /modules/aignehub/defaults/.actions/chat {messages: [...]}`");
  lines.push("- Discover capabilities: `explain {path}` on any mount");
  lines.push("");

  // Section 5: Built-in Systems
  lines.push("## Built-in Systems");
  lines.push("");
  lines.push(
    "- **`.meta`** — Metadata for any node. Access via `read('/.meta')` at root, or append `/.meta` to any path.",
  );
  lines.push(
    "- **`.actions`** — Executable actions. Access via `read('/.actions')` to list, `exec('/.actions/<name>', args)` to run.",
  );
  lines.push(
    "- **`.afs/`** — Provider self-documentation. `read {path}/.afs/README.md` for description, `list {path}/.afs/skills/` for capabilities.",
  );
  lines.push(
    "- **`.knowledge/`** — Capability index. `read /.knowledge` for a one-shot summary of all providers and actions. `read /.knowledge/{provider}` for provider details.",
  );
  lines.push("");

  return { format: "markdown", content: lines.join("\n") };
}

/**
 * Explain a root action path (/.actions or /.actions/{name}).
 */
export async function explainRootAction(
  path: string,
  listRootActions: () => Promise<AFSListResult>,
): Promise<AFSExplainResult> {
  if (path === "/.actions") {
    const lines: string[] = [];
    lines.push("# Root Actions");
    lines.push("");
    lines.push("Available actions at the AFS root level:");
    lines.push("");
    const { data: actions } = await listRootActions();
    for (const action of actions) {
      const desc = action.actions?.[0]?.description || action.summary || "";
      lines.push(`- **${action.id}** — ${desc}`);
    }
    lines.push("");
    lines.push("Use `explain('/.actions/<name>')` for detailed parameters and usage.");
    return { format: "markdown", content: lines.join("\n") };
  }

  // /.actions/{name} — generate parameter table from inputSchema
  const actionName = path.slice("/.actions/".length);
  const { data: actions } = await listRootActions();
  const entry = actions.find((a) => a.id === actionName);
  if (!entry) {
    // Caller should handle AFSNotFoundError
    return { format: "markdown", content: "" };
  }

  const action = entry.actions?.[0];
  const lines: string[] = [];
  lines.push(`# ${actionName}`);
  lines.push("");
  if (action?.description) {
    lines.push(action.description);
    lines.push("");
  }

  // Parameter table from inputSchema
  const schema = action?.inputSchema as Record<string, any> | undefined;
  const properties = schema?.properties as Record<string, any> | undefined;
  const required = (schema?.required as string[]) || [];

  if (properties && Object.keys(properties).length > 0) {
    lines.push("## Parameters");
    lines.push("");
    lines.push("| Name | Type | Required | Description |");
    lines.push("|------|------|----------|-------------|");
    for (const [name, prop] of Object.entries(properties)) {
      const propObj = prop as Record<string, unknown>;
      const type = (propObj.type as string) || "any";
      const isRequired = required.includes(name) ? "yes" : "no";
      const desc = (propObj.description as string) || "";
      lines.push(`| ${name} | ${type} | ${isRequired} | ${desc} |`);
    }
    lines.push("");
  }

  // Usage example
  lines.push("## Example");
  lines.push("");
  const exampleArgs: Record<string, string> = {};
  for (const name of required) {
    exampleArgs[name] = `<${name}>`;
  }
  lines.push(
    `\`\`\`\nexec('/.actions/${actionName}', ${JSON.stringify(exampleArgs, null, 2)})\n\`\`\``,
  );

  return { format: "markdown", content: lines.join("\n") };
}

/**
 * Explain a root meta path (/.meta or /.meta/{subpath}).
 * Returns null if the path is not a recognized root meta path.
 */
export function explainRootMeta(path: string): AFSExplainResult | null {
  if (path === "/.meta") {
    const lines: string[] = [];
    lines.push("# Root Metadata");
    lines.push("");
    lines.push("The `.meta` system provides metadata about any AFS node.");
    lines.push("");
    lines.push("## Available Sub-paths");
    lines.push("");
    lines.push("- **`.capabilities`** — Aggregated capabilities from all mounted providers");
    lines.push("");
    lines.push(
      "Use `read('/.meta')` to get structured root metadata including mounted providers and available actions.",
    );
    return { format: "markdown", content: lines.join("\n") };
  }

  if (path === "/.meta/.capabilities") {
    const lines: string[] = [];
    lines.push("# Capabilities");
    lines.push("");
    lines.push("Aggregated capabilities manifest from all mounted providers.");
    lines.push(
      "Describes the combined operations, tools, and action catalogs available across the system.",
    );
    lines.push("");
    lines.push("Use `read('/.meta/.capabilities')` to get the full structured capabilities data.");
    return { format: "markdown", content: lines.join("\n") };
  }

  return null;
}
