/**
 * AFS Explorer Metadata Panel Component
 *
 * Right panel showing detailed metadata for selected entry.
 */

import type Blessed from "blessed";
import { Colors, formatSize, Icons } from "../theme.js";
import type { EntryMetadata, ExplorerEntry } from "../types.js";

export interface MetadataPanelOptions {
  parent: Blessed.Widgets.Node;
  width: string | number;
  height: string | number;
  top?: string | number;
  right?: string | number;
}

/**
 * Format metadata for display
 */
export function formatMetadata(entry: ExplorerEntry, metadata?: EntryMetadata): string[] {
  const lines: string[] = [];

  // Entry name with type indicator (only show icon for non-files)
  const icon = entry.type !== "file" ? Icons[entry.type] : "";
  const prefix = icon ? `${icon} ` : "";
  lines.push(`${prefix}${entry.name}`);
  lines.push("");

  // Path
  lines.push(`Path: ${entry.path}`);

  // Size
  if (entry.size !== undefined || metadata?.size !== undefined) {
    const size = metadata?.size ?? entry.size;
    lines.push(`Size: ${formatSize(size!)}`);
  }

  // Children count
  if (entry.childrenCount !== undefined || metadata?.childrenCount !== undefined) {
    const count = metadata?.childrenCount ?? entry.childrenCount;
    lines.push(`Items: ${count}`);
  }

  // Modified date
  if (entry.modified || metadata?.modified) {
    const date = metadata?.modified ?? entry.modified;
    lines.push(`Modified: ${formatDateTime(date!)}`);
  }

  // Provider
  if (entry.provider || metadata?.provider) {
    lines.push(`Provider: ${metadata?.provider ?? entry.provider}`);
  }

  // Hash
  if (entry.hash || metadata?.hash) {
    const hash = metadata?.hash ?? entry.hash;
    // Truncate long hashes
    const display = hash!.length > 20 ? `${hash!.slice(0, 20)}...` : hash;
    lines.push(`Hash: ${display}`);
  }

  // Mount path
  if (metadata?.mountPath) {
    lines.push(`Mount: ${metadata.mountPath}`);
  }

  // URI
  if (metadata?.uri) {
    lines.push(`URI: ${metadata.uri}`);
  }

  // Kind/Kinds information (show one or the other, avoid redundancy)
  // Prefer entry.kinds/kind, fallback to metadata.extra.kinds/kind
  const kinds =
    entry.kinds && entry.kinds.length > 0
      ? entry.kinds
      : (metadata?.extra?.kinds as string[] | undefined);
  const kind = entry.kind ?? (metadata?.extra?.kind as string | undefined);

  if (kinds && kinds.length > 0) {
    lines.push(`Kinds: ${kinds.join(" → ")}`);
  } else if (kind) {
    lines.push(`Kind: ${kind}`);
  }

  // Display all meta fields from extra (flat, same level as other fields)
  if (metadata?.extra && Object.keys(metadata.extra).length > 0) {
    // Filter out built-in fields that are already displayed above
    const builtInFields = new Set([
      "size",
      "mimeType",
      "childrenCount",
      "hash",
      "provider",
      "mountPath",
      "uri",
      "permissions",
      "kind",
      "kinds",
    ]);

    for (const [key, value] of Object.entries(metadata.extra)) {
      if (builtInFields.has(key) || value === undefined) continue;

      // Special handling for inputSchema - show properties nicely
      if (key === "inputSchema" && typeof value === "object" && value !== null) {
        const schema = value as Record<string, unknown>;
        if (schema.properties && typeof schema.properties === "object") {
          lines.push("");
          lines.push("InputSchema:");
          const props = schema.properties as Record<string, unknown>;
          for (const [propName, propSchema] of Object.entries(props)) {
            const ps = propSchema as Record<string, unknown>;
            const type = ps.type || "any";
            const desc = ps.description ? ` - ${ps.description}` : "";
            const req =
              Array.isArray(schema.required) && schema.required.includes(propName) ? "*" : "";
            lines.push(`  • ${propName}${req}: ${type}${desc}`);
          }
          continue;
        }
      }

      // Capitalize first letter of key for display
      const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
      const displayValue = formatValue(value);

      if (displayValue.includes("\n")) {
        lines.push("");
        lines.push(`${displayKey}:`);
        for (const line of displayValue.split("\n")) {
          lines.push(`  ${line}`);
        }
      } else {
        lines.push(`${displayKey}: ${displayValue}`);
      }
    }
  }

  // Actions section (prefer metadata.actions from stat, fallback to entry.actions)
  const actions = metadata?.actions ?? entry.actions;
  lines.push("");
  lines.push("─────── Actions ───────");
  if (actions && actions.length > 0) {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action) {
        lines.push(`[${i + 1}] ${action.name}`);
      }
    }
    lines.push("");
    lines.push("(F4 to execute)");
  } else {
    lines.push("(none)");
  }

  return lines;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    // Simple arrays of primitives
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return value.join(", ");
    }
    // Arrays of objects with name/type (like columns, fields, properties)
    if (value.every((v) => typeof v === "object" && v !== null && "name" in v)) {
      return formatNamedItems(
        value as Array<{ name: string; type?: string; description?: string }>,
      );
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[unable to display]";
    }
  }
  if (typeof value === "object") {
    // Check if it's a JSON Schema properties object
    const obj = value as Record<string, unknown>;
    if (isSchemaProperties(obj)) {
      return formatSchemaProperties(obj);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[unable to display]";
    }
  }
  return String(value);
}

/**
 * Check if object looks like JSON Schema properties
 */
function isSchemaProperties(obj: Record<string, unknown>): boolean {
  const values = Object.values(obj);
  if (values.length === 0) return false;
  // Check if values look like schema definitions (have type property)
  return values.every((v) => typeof v === "object" && v !== null && ("type" in v || "$ref" in v));
}

/**
 * Format JSON Schema properties object
 */
function formatSchemaProperties(props: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [name, schema] of Object.entries(props)) {
    const s = schema as Record<string, unknown>;
    const type = s.type || s.$ref || "any";
    const desc = s.description ? ` - ${s.description}` : "";
    lines.push(`• ${name}: ${type}${desc}`);
  }
  return lines.join("\n");
}

/**
 * Format array of named items (columns, fields, etc.)
 */
function formatNamedItems(
  items: Array<{
    name: string;
    type?: string;
    description?: string;
    nullable?: boolean;
    primaryKey?: boolean;
  }>,
): string {
  const lines: string[] = [];
  for (const item of items) {
    const type = item.type ? `: ${item.type}` : "";
    const desc = item.description ? ` - ${item.description}` : "";
    // Add flags for nullable and primaryKey
    const flags: string[] = [];
    if (item.primaryKey) flags.push("PK");
    if (item.nullable) flags.push("nullable");
    const flagsStr = flags.length > 0 ? ` (${flags.join(", ")})` : "";
    lines.push(`• ${item.name}${type}${flagsStr}${desc}`);
  }
  return lines.join("\n");
}

/**
 * Format date and time
 */
function formatDateTime(date: Date): string {
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Create metadata panel component
 */
export function createMetadataPanel(blessed: typeof Blessed, options: MetadataPanelOptions) {
  const { parent, width, height, top = 0, right = 0 } = options;

  // Create box for metadata panel
  const panel = blessed.box({
    parent,
    top,
    right,
    width,
    height,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: {
      fg: Colors.fg.normal,
      bg: Colors.bg.main,
    },
    border: {
      type: "line",
    },
    label: " Details ",
  });

  let currentEntry: ExplorerEntry | undefined;
  let _currentMetadata: EntryMetadata | undefined;

  return {
    element: panel,

    /**
     * Update panel with entry info
     */
    update(entry: ExplorerEntry, metadata?: EntryMetadata): void {
      currentEntry = entry;
      _currentMetadata = metadata;

      if (entry.type === "up") {
        panel.setContent(" Parent directory");
        (panel.screen as Blessed.Widgets.Screen)?.render();
        return;
      }

      const lines = formatMetadata(entry, metadata);
      panel.setContent(lines.map((l) => ` ${l}`).join("\n"));
      (panel.screen as Blessed.Widgets.Screen)?.render();
    },

    /**
     * Clear the panel
     */
    clear(): void {
      currentEntry = undefined;
      _currentMetadata = undefined;
      panel.setContent("");
      (panel.screen as Blessed.Widgets.Screen)?.render();
    },

    /**
     * Get current entry
     */
    getCurrentEntry(): ExplorerEntry | undefined {
      return currentEntry;
    },

    /**
     * Destroy the component
     */
    destroy(): void {
      panel.destroy();
    },
  };
}

export type MetadataPanel = ReturnType<typeof createMetadataPanel>;
