/**
 * exec Formatter - Core Implementation
 *
 * Formats exec output without colors.
 * Accepts AFS native AFSExecResult directly.
 */

import type { AFSExecResult } from "@aigne/afs";
import type { ViewType } from "../types.js";

/**
 * Format exec output for different views
 *
 * @param result - AFS exec result (native type)
 * @param view - View type (default, json, llm, human)
 * @param options - Format options (path for display)
 * @returns Formatted string (no ANSI colors)
 */
export function formatExecOutput(
  result: AFSExecResult,
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

function formatDefault(result: AFSExecResult, path?: string): string {
  if (result.success) {
    if (result.data) {
      return JSON.stringify(result.data);
    }
    return path ? `OK ${path}` : "OK";
  }
  const errorCode = result.error?.code || "ERROR";
  return `${errorCode} ${path || ""} ${result.error?.message || ""}`.trim();
}

function formatLlm(result: AFSExecResult, path?: string): string {
  const lines: string[] = [];

  if (path) {
    lines.push(`EXEC ${path}`);
  }
  lines.push(`STATUS ${result.success ? "SUCCESS" : "FAILED"}`);

  if (result.data) {
    lines.push(`DATA ${JSON.stringify(result.data)}`);
  }

  if (!result.success && result.error) {
    if (result.error.code) {
      lines.push(`ERROR ${result.error.code}`);
    }
    if (result.error.message) {
      lines.push(`MESSAGE ${result.error.message}`);
    }
    if (result.error.details) {
      lines.push(`DETAILS ${JSON.stringify(result.error.details)}`);
    }
  }

  return lines.join("\n");
}

function formatHuman(result: AFSExecResult, path?: string): string {
  if (result.success) {
    const lines = path ? [`Executed: ${path}`] : ["Executed successfully"];
    if (result.data) {
      lines.push("");
      lines.push(JSON.stringify(result.data, null, 2));
    }
    return lines.join("\n");
  }

  const lines = path ? [`Failed: ${path}`] : ["Execution failed"];
  lines.push("");
  if (result.error?.code) {
    lines.push(`Error: ${result.error.code}`);
  }
  if (result.error?.message) {
    lines.push(`Message: ${result.error.message}`);
  }
  if (result.error?.details) {
    lines.push("Details:");
    for (const [key, value] of Object.entries(result.error.details)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
  return lines.join("\n");
}
