/**
 * stat Formatter - Core Implementation
 *
 * Formats stat output without colors.
 * Accepts AFS native AFSStatResult directly.
 */

import type { AFSStatResult } from "@aigne/afs";
import type { ViewType } from "../types.js";

/**
 * Format stat output for different views
 *
 * @param result - AFS stat result (native type)
 * @param view - View type (default, json, llm, human)
 * @returns Formatted string (no ANSI colors)
 */
export function formatStatOutput(result: AFSStatResult, view: ViewType): string {
  switch (view) {
    case "json":
      return formatJson(result);
    case "llm":
      return formatLlm(result);
    case "human":
      return formatHuman(result);
    default:
      return formatDefault(result);
  }
}

/**
 * JSON format: Flattened structure
 */
function formatJson(result: AFSStatResult): string {
  const data = result.data;
  if (!data) {
    return JSON.stringify({ error: result.message || "No data" }, null, 2);
  }

  const meta = data.meta as Record<string, unknown> | undefined;
  const output: Record<string, unknown> = {
    path: data.path,
  };

  if (data.updatedAt) {
    output.modified = safeISOString(data.updatedAt);
  }
  if (data.createdAt) {
    output.created = safeISOString(data.createdAt);
  }
  if (data.actions && data.actions.length > 0) {
    output.actions = data.actions.map((a) => ({
      name: a.name,
      description: a.description,
    }));
  }

  // Merge metadata at top level (includes size, childrenCount, etc.)
  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (value !== null && value !== undefined) {
        output[key] = value;
      }
    }
  }

  return JSON.stringify(output, null, 2);
}

function formatDefault(result: AFSStatResult): string {
  const data = result.data;
  if (!data) {
    return result.message || "No data";
  }

  const meta = data.meta as Record<string, unknown> | undefined;
  const lines: string[] = [];

  lines.push(`PATH=${data.path}`);

  if (meta?.kind) {
    lines.push(`KIND=${meta.kind}`);
  }

  const kinds = meta?.kinds;
  if (kinds && Array.isArray(kinds) && kinds.length > 0) {
    lines.push(`KINDS=${kinds.join(",")}`);
  }

  if (meta?.size !== undefined) {
    lines.push(`SIZE=${meta.size}`);
  }

  if (meta?.childrenCount !== undefined) {
    lines.push(`CHILDREN=${meta.childrenCount}`);
  }

  if (data.updatedAt) {
    lines.push(`MODIFIED=${formatDateValue(data.updatedAt)}`);
  }

  if (data.actions && data.actions.length > 0) {
    lines.push(`ACTIONS=${data.actions.map((a) => a.name).join(",")}`);
  }

  return lines.join("\n");
}

function formatLlm(result: AFSStatResult): string {
  const data = result.data;
  if (!data) {
    return result.message || "NO_DATA";
  }

  const lines: string[] = [];
  const meta = data.meta as Record<string, unknown> | undefined;

  lines.push(`NODE ${data.path}`);

  if (meta?.kind) {
    lines.push(`KIND ${meta.kind}`);
  }

  const kinds = meta?.kinds;
  if (kinds && Array.isArray(kinds) && kinds.length > 0) {
    lines.push(`KINDS ${kinds.join(" ")}`);
  }

  if (meta?.size !== undefined) {
    lines.push(`SIZE ${meta.size}`);
  }

  if (meta?.childrenCount !== undefined) {
    lines.push(`CHILDREN ${meta.childrenCount}`);
  }

  if (data.updatedAt) {
    lines.push(`UPDATED ${formatDateValue(data.updatedAt)}`);
  }

  // Provider-specific metadata as META_* fields
  if (meta) {
    for (let [key, value] of Object.entries(meta)) {
      // Skip already handled fields
      if (["kind", "kinds", "size", "childrenCount"].includes(key)) continue;
      // Skip complex values
      if (value === null || value === undefined) continue;
      if (typeof value === "object") value = JSON.stringify(value);

      lines.push(`META_${key.toUpperCase()} ${value}`);
    }
  }

  if (data.actions && data.actions.length > 0) {
    lines.push(`ACTIONS_COUNT ${data.actions.length}`);
    for (const action of data.actions) {
      const desc = action.description ? ` "${action.description}"` : "";
      const schema = action.inputSchema;
      const schemaPart = schema !== undefined ? ` SCHEMA ${JSON.stringify(schema)}` : "";
      lines.push(`ACTION ${action.name}${desc}${schemaPart}`);
    }
  }

  lines.push(`SIDE_EFFECT NONE`);

  return lines.join("\n");
}

function formatHuman(result: AFSStatResult): string {
  const data = result.data;
  if (!data) {
    return result.message || "No data available";
  }

  const lines: string[] = [];
  const meta = data.meta as Record<string, unknown> | undefined;

  lines.push(`Path:     ${data.path}`);

  if (meta?.kind) {
    lines.push(`Kind:     ${meta.kind}`);
  }

  const kinds = meta?.kinds;
  if (kinds && Array.isArray(kinds) && kinds.length > 0) {
    lines.push(`Kinds:    ${kinds.join(" → ")}`);
  }

  if (meta?.size !== undefined) {
    lines.push(`Size:     ${formatSize(meta.size as number)}`);
  }

  if (meta?.childrenCount !== undefined) {
    lines.push(`Children: ${meta.childrenCount}`);
  }

  if (data.updatedAt) {
    lines.push(`Modified: ${formatDate(data.updatedAt)}`);
  }

  // Provider-specific metadata
  if (meta) {
    for (let [key, value] of Object.entries(meta)) {
      // Skip already handled fields
      if (["kind", "kinds", "size", "childrenCount"].includes(key)) continue;
      // Skip complex values
      if (value === null || value === undefined) continue;
      if (typeof value === "object") value = JSON.stringify(value);

      // Format key in PascalCase with proper padding
      const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
      const label = `${formattedKey}:`;
      // Pad to 10 chars if shorter, otherwise no space between label and value
      const padding = label.length < 10 ? " ".repeat(10 - label.length) : "";
      lines.push(`${label}${padding}${value}`);
    }
  }

  if (data.actions && data.actions.length > 0) {
    lines.push("");
    lines.push(`Actions (${data.actions.length}):`);
    for (const action of data.actions) {
      const desc = action.description ? ` - ${action.description}` : "";
      lines.push(`  • ${action.name}${desc}`);
    }
  }

  return lines.join("\n");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Safely convert a date value to ISO string.
 * Handles Date objects, strings, and other types.
 */
function safeISOString(date: unknown): string {
  if (date instanceof Date) return date.toISOString();
  if (typeof date === "string") return date;
  return String(date);
}

/**
 * Format Date to ISO string (for default/llm views)
 */
function formatDateValue(date: unknown): string {
  return safeISOString(date);
}

/**
 * Format Date for human-readable display
 */
function formatDate(date: unknown): string {
  if (date instanceof Date) {
    try {
      return date.toLocaleString();
    } catch {
      return date.toISOString();
    }
  }
  return safeISOString(date);
}
