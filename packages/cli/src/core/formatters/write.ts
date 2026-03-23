/**
 * write Formatter - Core Implementation
 *
 * Formats write output without colors.
 * Accepts AFS native AFSWriteResult directly.
 */

import type { AFSBatchWriteResult, AFSWriteResult } from "@aigne/afs";
import type { ViewType } from "../types.js";

/**
 * Additional metadata fields that were written
 */
export interface WriteFormatOptions {
  fields?: string[];
}

/**
 * Format write output for different views
 *
 * @param result - AFS write result (native type)
 * @param view - View type (default, json, llm, human)
 * @param options - Format options (e.g., metadata fields)
 * @returns Formatted string (no ANSI colors)
 */
export function formatWriteOutput(
  result: AFSWriteResult,
  view: ViewType,
  options?: WriteFormatOptions,
): string {
  switch (view) {
    case "json":
      return formatJson(result, options);
    case "llm":
      return formatLlm(result, options);
    case "human":
      return formatHuman(result, options);
    default:
      return formatDefault(result);
  }
}

function formatJson(result: AFSWriteResult, options?: WriteFormatOptions): string {
  const output: Record<string, unknown> = {
    path: result.data.path,
    success: true,
  };

  if (result.data.meta?.size !== undefined) {
    output.size = result.data.meta.size;
  }

  if (options?.fields && options.fields.length > 0) {
    output.fields = options.fields;
  }

  return JSON.stringify(output, null, 2);
}

function formatDefault(result: AFSWriteResult): string {
  return `OK ${result.data.path}`;
}

function formatLlm(result: AFSWriteResult, options?: WriteFormatOptions): string {
  const lines: string[] = [];

  lines.push(`WRITE ${result.data.path}`);
  lines.push("STATUS SUCCESS");

  if (result.data.meta?.size !== undefined) {
    lines.push(`SIZE ${result.data.meta.size}`);
  }

  if (options?.fields && options.fields.length > 0) {
    lines.push(`FIELDS ${options.fields.join(",")}`);
    lines.push("SIDE_EFFECT META_UPDATED");
  }

  if (result.message) {
    lines.push(`MESSAGE ${result.message}`);
  }

  return lines.join("\n");
}

function formatHuman(result: AFSWriteResult, options?: WriteFormatOptions): string {
  const parts = [`Successfully wrote to ${result.data.path}`];

  if (result.data.meta?.size !== undefined) {
    parts.push(`(${result.data.meta.size} bytes)`);
  }

  if (options?.fields && options.fields.length > 0) {
    parts.push(`[meta: ${options.fields.join(", ")}]`);
  }

  return parts.join(" ");
}

/**
 * Format batch write output for different views.
 */
export function formatBatchWriteOutput(result: AFSBatchWriteResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatBatchWriteLlm(result);
    case "human":
      return formatBatchWriteHuman(result);
    default:
      return formatBatchWriteLlm(result);
  }
}

function formatBatchWriteLlm(result: AFSBatchWriteResult): string {
  const lines: string[] = [`BATCH_WRITE ${result.results.length} entries`];
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

function formatBatchWriteHuman(result: AFSBatchWriteResult): string {
  const lines: string[] = [];
  for (const entry of result.results) {
    lines.push(entry.success ? `OK ${entry.path}` : `FAIL ${entry.path}: ${entry.error}`);
  }
  lines.push(`${result.succeeded}/${result.results.length} succeeded`);
  return lines.join("\n");
}
