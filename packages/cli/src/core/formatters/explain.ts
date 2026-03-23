/**
 * explain Formatter - Core Implementation
 *
 * Formats explain output for concepts and paths.
 * Matches old version output format.
 */

import type { ExplainResult, PathExplainResult } from "../commands/explain.js";
import type { ViewType } from "../types.js";

/**
 * Format concept explain output for different views
 */
export function formatExplainOutput(result: ExplainResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatLlm(result);
    default:
      return formatDefault(result);
  }
}

function formatDefault(result: ExplainResult): string {
  let output = `${result.topic}\n${"=".repeat(result.topic.length)}\n\n${result.explanation}`;

  if (result.examples && result.examples.length > 0) {
    output += `\n\nExamples:\n${result.examples.map((e) => `  $ ${e}`).join("\n")}`;
  }

  return output;
}

function formatLlm(result: ExplainResult): string {
  const lines = [`TOPIC ${result.topic}`, "", result.explanation];

  if (result.examples && result.examples.length > 0) {
    lines.push("", "EXAMPLES");
    for (const example of result.examples) {
      lines.push(`CMD ${example}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format path explain output for different views
 */
export function formatPathExplainOutput(result: PathExplainResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatPathLlm(result);
    default:
      return formatPathDefault(result);
  }
}

function formatPathDefault(result: PathExplainResult): string {
  if (result.markdown) {
    return result.markdown;
  }

  const lines: string[] = [];

  lines.push(`PATH ${result.path}`);
  lines.push("");
  lines.push("TYPE");
  lines.push(result.type);

  if (result.description) {
    lines.push("");
    lines.push("DESCRIPTION");
    lines.push(result.description);
  }

  if (result.inputs && result.inputs.length > 0) {
    lines.push("");
    lines.push("INPUTS");
    for (const input of result.inputs) {
      lines.push(`- ${input}`);
    }
  }

  if (result.outputs && result.outputs.length > 0) {
    lines.push("");
    lines.push("OUTPUTS");
    for (const output of result.outputs) {
      lines.push(`- ${output}`);
    }
  }

  if (result.errors && result.errors.length > 0) {
    lines.push("");
    lines.push("ERRORS");
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
  }

  if (result.sideEffects && result.sideEffects.length > 0) {
    lines.push("");
    lines.push("SIDE EFFECTS");
    for (const effect of result.sideEffects) {
      lines.push(`- ${effect}`);
    }
  } else {
    lines.push("");
    lines.push("SIDE EFFECTS");
    lines.push("- none");
  }

  if (result.meta && Object.keys(result.meta).length > 0) {
    lines.push("");
    lines.push("METADATA");
    for (const [key, value] of Object.entries(result.meta)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

function formatPathLlm(result: PathExplainResult): string {
  if (result.markdown) {
    return result.markdown;
  }

  const lines: string[] = [];

  lines.push(`PATH ${result.path}`);
  lines.push(`TYPE ${result.type.toUpperCase()}`);

  if (result.description) {
    lines.push(`DESC ${result.description}`);
  }

  if (result.inputs && result.inputs.length > 0) {
    lines.push(`INPUTS ${result.inputs.join(", ")}`);
  }

  if (result.outputs && result.outputs.length > 0) {
    lines.push(`OUTPUTS ${result.outputs.join(", ")}`);
  }

  if (result.errors && result.errors.length > 0) {
    lines.push(`ERRORS ${result.errors.join(", ")}`);
  }

  lines.push(`SIDE_EFFECTS ${result.sideEffects?.join(", ") || "none"}`);

  if (result.meta) {
    for (const [key, value] of Object.entries(result.meta)) {
      lines.push(`${key.toUpperCase()} ${value}`);
    }
  }

  return lines.join("\n");
}
