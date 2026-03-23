/**
 * ls Formatter - Core Implementation
 *
 * Formats ls output without colors.
 * Accepts AFS native AFSListResult directly.
 */

import type { AFSEntry, AFSListResult } from "@aigne/afs";
import type { ViewType } from "../types.js";

export interface FormatLsOptions {
  /** The path being listed (used for special formatting of .actions paths) */
  path?: string;
}

/**
 * Check if a path is an actions path
 */
function isActionsPath(path: string): boolean {
  return path.endsWith("/.actions") || path.includes("/.actions/");
}

/**
 * Format ls output for different views
 *
 * @param result - AFS list result (native type)
 * @param view - View type (default, json, llm, human)
 * @param options - Format options
 * @returns Formatted string (no ANSI colors)
 */
export function formatLsOutput(
  result: AFSListResult,
  view: ViewType,
  options?: FormatLsOptions,
): string {
  // Check if we're listing an actions path for special formatting
  const isActions = options?.path && isActionsPath(options.path);

  switch (view) {
    case "json":
      return isActions ? formatActionsJson(result, options.path!) : formatJson(result);
    case "llm":
      return isActions ? formatActionsLlm(result, options.path!) : formatLlm(result);
    case "human":
      return isActions ? formatActionsHuman(result, options.path!) : formatHuman(result);
    default:
      return isActions ? formatActionsDefault(result) : formatDefault(result);
  }
}

/**
 * Default format: Machine truth, one path per line
 */
function formatDefault(result: AFSListResult): string {
  if (result.data.length === 0 && result.message) {
    return `# ${result.message}`;
  }

  const lines = result.data.map((entry) => entry.path);
  if (result.total !== undefined && result.total > result.data.length) {
    lines.push(`# Results truncated (${result.data.length} of ${result.total} shown)`);
  }
  return lines.join("\n");
}

/**
 * JSON format: Structured output with meta field preserved
 */
function formatJson(result: AFSListResult): string {
  const entries = result.data.map((entry) => {
    const output: Record<string, unknown> = {
      path: entry.path,
    };

    if (entry.meta && Object.keys(entry.meta).length > 0) {
      output.meta = entry.meta;
    }

    return output;
  });

  return JSON.stringify({ entries, total: result.total ?? entries.length }, null, 2);
}

/**
 * LLM format: Token-efficient, semantic facts
 */
function formatLlm(result: AFSListResult): string {
  const lines: string[] = [];

  if (result.data.length === 0 && result.message) {
    lines.push(`ERROR ${result.message}`);
    return lines.join("\n");
  }

  for (const entry of result.data) {
    const parts = [`ENTRY ${entry.path}`];

    if (entry.meta?.kind) {
      parts.push(`KIND=${entry.meta.kind}`);
    }

    if (entry.meta?.size !== undefined) {
      parts.push(`SIZE=${entry.meta.size}`);
    }

    if (entry.meta?.childrenCount !== undefined) {
      parts.push(`CHILDREN=${entry.meta.childrenCount}`);
    }

    lines.push(parts.join(" "));
  }

  lines.push(`TOTAL ${result.data.length}`);
  if (result.total !== undefined && result.total > result.data.length) {
    lines.push("TRUNCATED true");
  }
  return lines.join("\n");
}

interface TreeNode {
  name: string;
  entry?: AFSEntry;
  children: Map<string, TreeNode>;
}

/**
 * Human format: Tree structure (without colors)
 */
function formatHuman(result: AFSListResult): string {
  if (result.data.length === 0 && result.message) {
    return result.message;
  }

  // Build tree structure from flat paths
  const root: TreeNode = { name: "", children: new Map() };

  for (const entry of result.data) {
    const parts = entry.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, children: new Map() });
      }
      current = current.children.get(part)!;

      if (i === parts.length - 1) {
        current.entry = entry;
      }
    }
  }

  // Render tree
  const lines: string[] = [];
  renderTree(root, "", lines);

  if (result.total !== undefined && result.total > result.data.length) {
    lines.push("");
    lines.push(`(Results truncated - ${result.data.length} of ${result.total} entries shown)`);
  }

  return lines.join("\n");
}

function renderTree(node: TreeNode, prefix: string, lines: string[]): void {
  const children = Array.from(node.children.values());

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const isLast = i === children.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const isDirectory =
      typeof child.entry?.meta?.childrenCount === "number" || child.children.size > 0;
    const icon = isDirectory ? "📁" : "📄";
    const sizeStr =
      child.entry?.meta?.size !== undefined ? `  ${formatSize(child.entry.meta.size)}` : "";
    const kindStr = child.entry?.meta?.kind ? ` (${child.entry.meta.kind})` : "";

    lines.push(`${prefix}${connector}${icon} ${child.name}${kindStr}${sizeStr}`);

    const childPrefix = prefix + (isLast ? "    " : "│   ");
    renderTree(child, childPrefix, lines);
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Actions-specific formatters

function getActionName(entry: AFSEntry): string {
  const parts = entry.path.split("/");
  return parts[parts.length - 1] || entry.path;
}

function getActionDescription(entry: AFSEntry): string | undefined {
  return entry.meta?.description;
}

function getNodePathFromActions(actionsPath: string): string {
  const idx = actionsPath.lastIndexOf("/.actions");
  return idx > 0 ? actionsPath.substring(0, idx) : "/";
}

function formatActionsHuman(result: AFSListResult, path: string): string {
  const lines: string[] = [];
  const nodePath = getNodePathFromActions(path);

  if (result.data.length === 0) {
    lines.push(`No actions available for ${nodePath}`);
    return lines.join("\n");
  }

  lines.push(`Available actions for ${nodePath}:`);
  lines.push("");

  const maxNameLen = Math.max(...result.data.map((e) => getActionName(e).length));

  for (const entry of result.data) {
    const name = getActionName(entry);
    const desc = getActionDescription(entry) || "";
    lines.push(`  ${name.padEnd(maxNameLen + 2)}${desc}`);
  }

  return lines.join("\n");
}

function formatActionsLlm(result: AFSListResult, path: string): string {
  const lines: string[] = [];

  lines.push(`ACTIONS ${path}`);

  if (result.data.length === 0) {
    lines.push("ACTIONS_COUNT 0");
    return lines.join("\n");
  }

  for (const entry of result.data) {
    const name = getActionName(entry);
    const desc = getActionDescription(entry);
    const schema = entry.meta?.inputSchema;
    const descPart = desc ? ` DESCRIPTION "${desc}"` : "";
    const schemaPart = schema !== undefined ? ` SCHEMA ${JSON.stringify(schema)}` : "";
    lines.push(`ACTION ${name}${descPart}${schemaPart}`);
  }

  return lines.join("\n");
}

function formatActionsJson(result: AFSListResult, path: string): string {
  const actions = result.data.map((entry) => ({
    name: getActionName(entry),
    description: getActionDescription(entry),
    inputSchema: entry.meta?.inputSchema,
  }));

  return JSON.stringify(
    {
      path,
      data: actions,
    },
    null,
    2,
  );
}

function formatActionsDefault(result: AFSListResult): string {
  if (result.data.length === 0) {
    return "";
  }
  return result.data.map((entry) => getActionName(entry)).join("\n");
}
