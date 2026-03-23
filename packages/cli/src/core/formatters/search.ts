/**
 * search Formatter - Core Implementation
 *
 * Formats search output without colors.
 * Accepts AFS native AFSSearchResult directly.
 */

import type { AFSSearchResult } from "@aigne/afs";
import type { ViewType } from "../types.js";

/**
 * Format search output for different views
 *
 * @param result - AFS search result (native type)
 * @param view - View type (default, json, llm, human)
 * @returns Formatted string (no ANSI colors)
 */
export function formatSearchOutput(result: AFSSearchResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatLlm(result);
    case "human":
      return formatHuman(result);
    default:
      return formatDefault(result);
  }
}

function formatDefault(result: AFSSearchResult): string {
  if (result.data.length === 0) {
    return result.message || "No results found";
  }
  return result.data.map((entry) => entry.path).join("\n");
}

function formatLlm(result: AFSSearchResult): string {
  const lines: string[] = [];
  lines.push(`SEARCH_RESULTS ${result.data.length}`);
  for (const entry of result.data) {
    const summary = entry.summary ? ` "${entry.summary}"` : "";
    lines.push(`RESULT ${entry.path}${summary}`);
  }
  return lines.join("\n");
}

function formatHuman(result: AFSSearchResult): string {
  if (result.data.length === 0) {
    return result.message || "No results found";
  }
  const lines: string[] = [];
  lines.push(`Found ${result.data.length} result(s):`);
  lines.push("");
  for (const entry of result.data) {
    const summary = entry.summary ? ` - ${entry.summary}` : "";
    lines.push(`  ${entry.path}${summary}`);
  }
  return lines.join("\n");
}
