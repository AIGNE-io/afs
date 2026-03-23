/**
 * read Formatter - Core Implementation
 *
 * Formats read output without colors.
 * Accepts AFS native AFSReadResult directly.
 */

import type { AFSReadResult } from "@aigne/afs";
import type { ViewType } from "../types.js";

/**
 * Options for formatting read output
 */
export interface ReadFormatOptions {
  path?: string;
}

/**
 * Format read output for different views
 *
 * @param result - AFS read result (native type)
 * @param view - View type (default, json, llm, human)
 * @param options - Format options (e.g., original path)
 * @returns Formatted string (no ANSI colors)
 */
export function formatReadOutput(
  result: AFSReadResult,
  view: ViewType,
  options?: ReadFormatOptions,
): string {
  switch (view) {
    case "json":
      return formatJson(result);
    case "llm":
      return formatLlm(result);
    case "human":
      return formatHuman(result, options);
    default:
      return formatDefault(result, options);
  }
}

/**
 * Default format: Raw content
 */
function formatDefault(result: AFSReadResult, options?: ReadFormatOptions): string {
  if (!result.data) {
    // For root or virtual nodes without data, show the path
    return options?.path || result.message || "No data";
  }

  const entry = result.data;
  const content = entry.content;

  // If there's content, show it
  if (content !== undefined && content !== null && content !== "") {
    return typeof content === "string" ? content : JSON.stringify(content, null, 2);
  }

  // For directories (no content), show one-liner summary
  const parts = [entry.path];

  if (entry.meta?.kind) {
    parts.push(entry.meta.kind);
  }

  if (entry.meta?.childrenCount !== undefined) {
    parts.push(`children=${entry.meta.childrenCount}`);
  }

  if (entry.actions && entry.actions.length > 0) {
    parts.push(`actions=${entry.actions.map((a) => a.name).join(",")}`);
  }

  return parts.join(" ");
}

/**
 * JSON format
 */
function formatJson(result: AFSReadResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * LLM format: Structured text for AI parsing
 */
function formatLlm(result: AFSReadResult): string {
  if (!result.data) {
    return result.message || "NO_DATA";
  }

  const entry = result.data;
  const lines: string[] = [];

  lines.push(`NODE ${entry.path}`);

  if (entry.meta?.kind) {
    lines.push(`KIND ${entry.meta.kind}`);
  }

  if (entry.meta?.kinds && Array.isArray(entry.meta.kinds)) {
    lines.push(`KINDS ${entry.meta.kinds.join(" ")}`);
  }

  if (entry.meta?.childrenCount !== undefined) {
    lines.push(`CHILDREN ${entry.meta.childrenCount}`);
  }

  if (entry.meta?.size !== undefined) {
    lines.push(`SIZE ${entry.meta.size}`);
  }

  if (entry.actions && entry.actions.length > 0) {
    lines.push(`ACTIONS_COUNT ${entry.actions.length}`);
    for (const action of entry.actions) {
      const desc = action.description ? ` "${action.description}"` : "";
      const schema = action.inputSchema;
      const schemaPart = schema !== undefined ? ` SCHEMA ${JSON.stringify(schema)}` : "";
      lines.push(`ACTION ${action.name}${desc}${schemaPart}`);
    }
  }

  const content = entry.content;
  if (content !== undefined && content !== null && content !== "") {
    lines.push(`CONTENT ${JSON.stringify(content)}`);
  }

  return lines.join("\n");
}

/**
 * Human format: Formatted display (without colors)
 */
function formatHuman(result: AFSReadResult, options?: ReadFormatOptions): string {
  if (!result.data) {
    // For root or virtual nodes without data, show the path
    return options?.path || result.message || "No data available";
  }

  const entry = result.data;
  const lines: string[] = [];

  lines.push(`Path: ${entry.path}`);

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    lines.push("Metadata:");
    for (const [key, value] of Object.entries(entry.meta)) {
      if (value === null || value === undefined) continue;
      const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`  ${key}: ${valueStr}`);
    }
  }

  if (entry.actions && entry.actions.length > 0) {
    lines.push(`Actions: ${entry.actions.map((a) => a.name).join(", ")}`);
  }

  const content = entry.content;
  const meta = entry.meta as Record<string, unknown> | undefined;
  if (content !== undefined && content !== null && content !== "") {
    lines.push("");
    lines.push("Content:");
    lines.push(formatContent(content));
  } else if (meta?.childrenCount !== undefined && (meta.childrenCount as number) > 0) {
    lines.push("");
    lines.push("Content:");
    lines.push("  (directory - use 'afs ls' to list children)");
  }

  return lines.join("\n");
}

function formatContent(content: unknown): string {
  if (typeof content === "string") {
    return content
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
  }
  return `  ${JSON.stringify(content, null, 2).split("\n").join("\n  ")}`;
}
