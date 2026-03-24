/**
 * AFS Explorer Actions
 *
 * Core action handlers for the explorer.
 * These are separated from UI for testability.
 */

import type { AFS, AFSEntry, AFSEntryMetadata } from "@aigne/afs";
import type { ActionResult, EntryMetadata, ExplorerEntry, ExplorerState } from "./types.js";

/**
 * Check if an entry is executable based on its meta
 */
export function isExecutable(meta: AFSEntryMetadata | null | undefined): boolean {
  if (!meta) return false;

  if (Array.isArray(meta.kinds)) {
    return meta.kinds.includes("afs:executable");
  }

  return meta.kind === "afs:executable";
}

/**
 * Check if a value is a valid directory-indicating childrenCount
 *
 * Per Provider Protocol spec:
 * - childrenCount > 0: known children → directory
 * - childrenCount = -1: unknown children count → directory
 * - childrenCount = 0 or undefined: leaf node → file
 */
function isDirectory(childrenCount: unknown): boolean {
  if (typeof childrenCount !== "number" || Number.isNaN(childrenCount)) {
    return false;
  }
  // -1 means unknown children (directory), > 0 means has children (directory)
  return childrenCount === -1 || childrenCount > 0;
}

/**
 * Convert AFS entry to explorer entry
 *
 * Type determination priority:
 * 1. afs:executable → exec
 * 2. afs:link → link
 * 3. childrenCount > 0 or -1 → directory
 * 4. Otherwise (childrenCount = 0, undefined, invalid) → file
 */
export function toExplorerEntry(entry: AFSEntry, _basePath: string): ExplorerEntry {
  const name = entry.path.split("/").pop() || entry.path;
  const metadata = entry.meta || {};

  // Determine type based on childrenCount (per Provider Protocol spec)
  // - childrenCount > 0 or -1 → directory
  // - childrenCount = 0, undefined, or invalid → file (leaf node)
  let type: ExplorerEntry["type"] = "file"; // Default to file (leaf node)

  // Check for special types from kinds array or kind field (highest priority)
  if (isExecutable(metadata)) {
    type = "exec";
  } else if (metadata.kind === "afs:link" || metadata.kinds?.includes("afs:link")) {
    type = "link";
  } else if (isDirectory(metadata.childrenCount)) {
    type = "directory";
  }
  // Otherwise keep default "file" - leaf node

  return {
    name,
    path: entry.path,
    type,
    size: metadata.size,
    modified: entry.updatedAt instanceof Date ? entry.updatedAt : undefined,
    childrenCount: metadata.childrenCount,
    hash: metadata.hash,
    description: metadata.description,
    provider: metadata.provider,
    // Meta fields from .afs/meta.yaml
    icon: metadata.icon,
    kind: metadata.kind,
    kinds: Array.isArray(metadata.kinds) ? metadata.kinds : undefined,
    label: metadata.label,
    tags: Array.isArray(metadata.tags) ? metadata.tags : undefined,
    // Actions from AFSEntry
    actions: entry.actions,
  };
}

/**
 * Create parent directory entry
 */
export function createUpEntry(parentPath: string): ExplorerEntry {
  return {
    name: "..",
    path: parentPath,
    type: "up",
  };
}

/**
 * Build immediate children from a list of deep paths
 * For example, if path is "/" and entries contain "/github/ArcBlock/afs",
 * this returns a virtual directory entry for "/github"
 */
function buildImmediateChildren(path: string, afsEntries: AFSEntry[]): Map<string, ExplorerEntry> {
  const normalizedPath = path === "/" ? "" : path;
  const pathDepth = normalizedPath === "" ? 0 : normalizedPath.split("/").filter(Boolean).length;
  const childrenMap = new Map<string, ExplorerEntry>();

  for (const entry of afsEntries) {
    // Skip the current directory itself
    if (entry.path === path) continue;

    const entryParts = entry.path.split("/").filter(Boolean);

    // Get the immediate child name (the part right after current path)
    const childName = entryParts[pathDepth];
    if (!childName) continue;

    const childPath = `/${entryParts.slice(0, pathDepth + 1).join("/")}`;

    // Check if this entry IS the immediate child (not a deeper descendant)
    const isDirectChild = entryParts.length === pathDepth + 1;

    if (isDirectChild) {
      // This is a direct child - use the actual entry
      childrenMap.set(childName, toExplorerEntry(entry, path));
    } else if (!childrenMap.has(childName)) {
      // This is a deeper descendant - create a virtual directory for the intermediate path
      childrenMap.set(childName, {
        name: childName,
        path: childPath,
        type: "directory",
        childrenCount: -1, // Unknown
      });
    }
  }

  return childrenMap;
}

/**
 * Load directory entries from AFS
 */
export async function loadDirectory(
  afs: AFS,
  path: string,
): Promise<{ entries: ExplorerEntry[]; error?: string }> {
  try {
    const result = await afs.list(path, { maxDepth: 1 });
    const entries: ExplorerEntry[] = [];

    // Add parent directory entry if not at root
    if (path !== "/") {
      const parentPath = path.split("/").slice(0, -1).join("/") || "/";
      entries.push(createUpEntry(parentPath));
    }

    // Build immediate children from potentially deep paths
    const childrenMap = buildImmediateChildren(path, result.data);
    entries.push(...childrenMap.values());

    // Sort: directories first, then by name
    entries.sort((a, b) => {
      // Up always first
      if (a.type === "up") return -1;
      if (b.type === "up") return 1;

      // Directories before files
      const aIsDir = a.type === "directory";
      const bIsDir = b.type === "directory";
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      // Alphabetical
      return a.name.localeCompare(b.name);
    });

    return { entries };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load directory";
    return { entries: [], error: message };
  }
}

/**
 * Load metadata for an entry using stat() to get enriched data (including actions)
 */
export async function loadMetadata(
  afs: AFS,
  entry: ExplorerEntry,
): Promise<EntryMetadata | undefined> {
  if (entry.type === "up") {
    return undefined;
  }

  try {
    // Use stat to get detailed metadata with auto-enriched actions
    const result = await afs.stat(entry.path);
    const data = result.data;

    if (!data) {
      return {
        path: entry.path,
        size: entry.size,
        modified: entry.modified,
      };
    }

    const meta = data.meta || {};

    return {
      path: entry.path,
      size: meta.size as number | undefined,
      modified: data.updatedAt instanceof Date ? data.updatedAt : undefined,
      childrenCount: meta.childrenCount as number | undefined,
      hash: meta.hash as string | undefined,
      description: meta.description as string | undefined,
      provider: meta.provider as string | undefined,
      mountPath: meta.mountPath as string | undefined,
      uri: meta.uri as string | undefined,
      permissions: meta.permissions as string[] | undefined,
      // Actions from stat (auto-enriched by core)
      actions: data.actions,
      // All metadata fields for display
      extra: meta,
    };
  } catch {
    // Return basic metadata if detailed load fails
    return {
      path: entry.path,
      size: entry.size,
      modified: entry.modified,
    };
  }
}

/**
 * Get explain output for an entry
 */
export async function getExplain(
  afs: AFS,
  path: string,
): Promise<{ content: string; error?: string }> {
  try {
    // Try to get explain from AFS if available
    // For now, build explain from metadata
    const result = await afs.list(path, { maxDepth: 0 });
    const entry = result.data[0];

    if (!entry) {
      return { content: "", error: "Entry not found" };
    }

    const metadata = entry.meta || {};
    const lines: string[] = [];

    lines.push(`OBJECT ${path}`);
    lines.push("");

    if (metadata.description) {
      lines.push("DESCRIPTION");
      lines.push(metadata.description);
      lines.push("");
    }

    if (metadata.size !== undefined) {
      lines.push("SIZE");
      lines.push(`${metadata.size} bytes`);
      lines.push("");
    }

    if (metadata.childrenCount !== undefined) {
      lines.push("CHILDREN");
      lines.push(`${metadata.childrenCount} items`);
      lines.push("");
    }

    if (metadata.provider) {
      lines.push("PROVIDER");
      lines.push(metadata.provider);
      lines.push("");
    }

    if (metadata.hash) {
      lines.push("HASH");
      lines.push(metadata.hash);
      lines.push("");
    }

    return { content: lines.join("\n") };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get explain";
    return { content: "", error: message };
  }
}

/**
 * Execute an action on an entry
 *
 * For executable entries (kinds includes "afs:executable"), this calls
 * the underlying exec command. The action parameter is currently not used
 * but reserved for future action selection.
 */
export async function executeAction(
  afs: AFS,
  path: string,
  _action: string,
  params?: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const result = await afs.exec(path, params || {}, {});

    return {
      success: result.success,
      message: result.error?.message,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Read file content
 */
export async function readFileContent(
  afs: AFS,
  path: string,
): Promise<{ content: string; error?: string }> {
  try {
    const result = await afs.read(path);
    const entry = result.data;
    if (!entry) {
      return { content: "", error: "File not found" };
    }

    // Content can be string, Buffer, ArrayBuffer, Uint8Array, or undefined
    const rawContent = entry.content;
    if (rawContent === undefined || rawContent === null) {
      return { content: "", error: "No content available" };
    }

    // Convert to string based on type
    let content: string;
    if (typeof rawContent === "string") {
      content = rawContent;
    } else if (Buffer.isBuffer(rawContent)) {
      content = rawContent.toString("utf-8");
    } else if (rawContent instanceof Uint8Array) {
      content = Buffer.from(rawContent).toString("utf-8");
    } else if (rawContent instanceof ArrayBuffer) {
      content = Buffer.from(new Uint8Array(rawContent)).toString("utf-8");
    } else if (typeof rawContent === "object") {
      // If content is an object (e.g., JSON data), stringify it
      content = JSON.stringify(rawContent, null, 2);
    } else {
      // Fallback for other types
      content = String(rawContent);
    }

    return { content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read file";
    return { content: "", error: message };
  }
}

/**
 * Navigation helpers
 */
export const navigation = {
  /**
   * Move selection up
   */
  up(state: ExplorerState): Partial<ExplorerState> {
    const newIndex = Math.max(0, state.selectedIndex - 1);
    return { selectedIndex: newIndex };
  },

  /**
   * Move selection down
   */
  down(state: ExplorerState): Partial<ExplorerState> {
    const newIndex = Math.min(state.entries.length - 1, state.selectedIndex + 1);
    return { selectedIndex: newIndex };
  },

  /**
   * Go to first item
   */
  home(_state: ExplorerState): Partial<ExplorerState> {
    return { selectedIndex: 0, scrollOffset: 0 };
  },

  /**
   * Go to last item
   */
  end(state: ExplorerState): Partial<ExplorerState> {
    return { selectedIndex: Math.max(0, state.entries.length - 1) };
  },

  /**
   * Page up (move by pageSize items)
   */
  pageUp(state: ExplorerState, pageSize: number): Partial<ExplorerState> {
    const newIndex = Math.max(0, state.selectedIndex - pageSize);
    return { selectedIndex: newIndex };
  },

  /**
   * Page down (move by pageSize items)
   */
  pageDown(state: ExplorerState, pageSize: number): Partial<ExplorerState> {
    const newIndex = Math.min(state.entries.length - 1, state.selectedIndex + pageSize);
    return { selectedIndex: newIndex };
  },

  /**
   * Get selected entry
   */
  getSelected(state: ExplorerState): ExplorerEntry | undefined {
    return state.entries[state.selectedIndex];
  },

  /**
   * Get parent path
   */
  getParentPath(path: string): string {
    if (path === "/") return "/";
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    return `/${parts.join("/")}` || "/";
  },
};

/**
 * Filter entries by search text
 */
export function filterEntries(entries: ExplorerEntry[], filterText: string): ExplorerEntry[] {
  if (!filterText) return entries;

  const lower = filterText.toLowerCase();
  return entries.filter((e) => e.name.toLowerCase().includes(lower) || e.type === "up");
}

/**
 * Create initial state
 */
export function createInitialState(startPath: string = "/"): ExplorerState {
  return {
    currentPath: startPath,
    entries: [],
    selectedIndex: 0,
    scrollOffset: 0,
    loading: true,
  };
}
