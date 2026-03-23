/**
 * mount Formatter - Core Implementation
 *
 * Formats mount output without colors.
 * Accepts ConfigMountEntry[] from the config layer.
 */

import type { ConfigMountEntry } from "../../config/mount-commands.js";
import type { ViewType } from "../types.js";

/**
 * Format mount list output for different views
 *
 * @param mounts - ConfigMountEntry array
 * @param view - View type (default, json, llm, human)
 * @returns Formatted string (no ANSI colors)
 */
export function formatMountListOutput(mounts: ConfigMountEntry[], view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(
        mounts.map((m) => ({
          path: m.path,
          namespace: m.namespace,
          uri: m.uri,
          description: m.description,
        })),
        null,
        2,
      );
    case "llm":
      return formatLlm(mounts);
    case "human":
      return formatHuman(mounts);
    default:
      return formatDefault(mounts);
  }
}

function formatDefault(mounts: ConfigMountEntry[]): string {
  if (mounts.length === 0) {
    return "No mounts configured";
  }

  return mounts
    .map((m) => {
      const ns = m.namespace ? `@${m.namespace}` : "";
      const descPart = m.description ? ` (${m.description})` : "";
      return `${ns}${m.path} -> ${m.uri}${descPart}`;
    })
    .join("\n");
}

function formatLlm(mounts: ConfigMountEntry[]): string {
  if (mounts.length === 0) {
    return "NO_MOUNTS";
  }

  return mounts
    .map((m) => {
      const lines = [`MOUNT ${m.path}`];
      if (m.namespace) {
        lines.push(`NAMESPACE=${m.namespace}`);
      }
      lines.push(`URI=${m.uri}`);
      if (m.description) {
        lines.push(`DESC=${m.description}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatHuman(mounts: ConfigMountEntry[]): string {
  if (mounts.length === 0) {
    return "No mounts configured.";
  }

  const lines = ["Configured Mounts:", ""];
  for (const m of mounts) {
    const ns = m.namespace ? ` (namespace: ${m.namespace})` : "";
    lines.push(`  ${m.path}${ns}`);
    lines.push(`    URI: ${m.uri}`);
    if (m.description) {
      lines.push(`    Description: ${m.description}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
