/**
 * delete Formatter - Core Implementation
 *
 * Formats delete output without colors.
 * Accepts AFS native AFSDeleteResult directly.
 */

import type { AFSBatchDeleteResult, AFSDeleteResult } from "@aigne/afs";
import type { ViewType } from "../types.js";

/**
 * Format delete output for different views
 *
 * @param result - AFS delete result (native type)
 * @param view - View type (default, json, llm, human)
 * @param options - Format options (path for display)
 * @returns Formatted string (no ANSI colors)
 */
export function formatDeleteOutput(
  result: AFSDeleteResult,
  view: ViewType,
  options?: { path?: string },
): string {
  const path = options?.path;
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatLlm(result, path);
    case "human":
      return formatHuman(result, path);
    default:
      return formatDefault(result, path);
  }
}

function formatDefault(result: AFSDeleteResult, path?: string): string {
  if (path) {
    return path;
  }
  return result.message || "Deleted";
}

function formatLlm(result: AFSDeleteResult, path?: string): string {
  const lines: string[] = [];

  lines.push(`DELETE ${path || "path"}`);
  lines.push("STATUS SUCCESS");

  if (result.message) {
    lines.push(`MESSAGE ${result.message}`);
  }

  return lines.join("\n");
}

function formatHuman(result: AFSDeleteResult, path?: string): string {
  if (path) {
    return `Deleted: ${path}`;
  }
  return result.message || "Deleted successfully";
}

/**
 * Format batch delete output for different views.
 */
export function formatBatchDeleteOutput(result: AFSBatchDeleteResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatBatchDeleteLlm(result);
    case "human":
      return formatBatchDeleteHuman(result);
    default:
      return formatBatchDeleteLlm(result);
  }
}

function formatBatchDeleteLlm(result: AFSBatchDeleteResult): string {
  const lines: string[] = [`BATCH_DELETE ${result.results.length} entries`];
  for (const entry of result.results) {
    if (entry.success) {
      lines.push(`OK ${entry.path}`);
    } else {
      lines.push(`FAIL ${entry.path} — ${entry.error}`);
    }
  }
  lines.push(
    `SUMMARY ${result.succeeded}/${result.results.length} succeeded, ${result.failed} failed`,
  );
  return lines.join("\n");
}

function formatBatchDeleteHuman(result: AFSBatchDeleteResult): string {
  const lines: string[] = [];
  for (const entry of result.results) {
    lines.push(entry.success ? `Deleted: ${entry.path}` : `FAIL ${entry.path}: ${entry.error}`);
  }
  lines.push(`${result.succeeded}/${result.results.length} deleted`);
  return lines.join("\n");
}
