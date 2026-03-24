/**
 * AFS Explorer Types
 *
 * Type definitions for the TUI file explorer
 */

import type { ActionSummary, AFS } from "@aigne/afs";

/**
 * Entry type in the file list
 */
export type EntryType = "file" | "directory" | "exec" | "link" | "up";

/**
 * An entry in the explorer file list
 */
export interface ExplorerEntry {
  /** Display name */
  name: string;
  /** Full AFS path */
  path: string;
  /** Entry type */
  type: EntryType;
  /** File size in bytes (for files) */
  size?: number;
  /** Last modified date */
  modified?: Date;
  /** Number of children (for directories) */
  childrenCount?: number;
  /** Content hash */
  hash?: string;
  /** Human-readable description */
  description?: string;
  /** Provider name */
  provider?: string;
  /** Custom icon name from meta */
  icon?: string;
  /** Kind name from meta */
  kind?: string;
  /** Kind inheritance chain from meta (e.g., ["mcp:tool", "afs:executable", "afs:node"]) */
  kinds?: string[];
  /** Custom label from meta */
  label?: string;
  /** Tags from meta */
  tags?: string[];
  /** Available actions for this entry */
  actions?: ActionSummary[];
}

/**
 * Metadata for the currently selected entry
 */
export interface EntryMetadata {
  path: string;
  size?: number;
  modified?: Date;
  childrenCount?: number;
  hash?: string;
  description?: string;
  provider?: string;
  mountPath?: string;
  uri?: string;
  permissions?: string[];
  /** Available actions for this entry (from stat) */
  actions?: ActionSummary[];
  /** Additional provider-specific metadata (all meta fields) */
  extra?: Record<string, unknown>;
}

/**
 * Explorer state
 */
export interface ExplorerState {
  /** Current directory path */
  currentPath: string;
  /** List of entries in current directory */
  entries: ExplorerEntry[];
  /** Currently selected index */
  selectedIndex: number;
  /** Scroll offset for virtual scrolling */
  scrollOffset: number;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error?: string;
  /** Metadata of selected entry */
  metadata?: EntryMetadata;
  /** Search/filter text */
  filterText?: string;
}

/**
 * Context passed to action handlers and keybindings
 */
export interface ExplorerContext {
  /** Current state */
  state: ExplorerState;
  /** AFS instance */
  afs: AFS;
  /** Update state */
  setState: (update: Partial<ExplorerState>) => void;
  /** Navigate to path */
  navigate: (path: string) => Promise<void>;
  /** Refresh current directory */
  refresh: () => Promise<void>;
  /** Show message dialog */
  showMessage: (title: string, content: string) => void;
  /** Show error dialog */
  showError: (message: string) => void;
  /** Request screen redraw */
  render: () => void;
  /** Exit explorer */
  quit: () => void;
}

/**
 * Action item for the action picker dialog
 * Unified definition for screen.ts and dialog.ts
 */
export interface ActionItem {
  /** Action name displayed to user */
  name: string;
  /** Full path to execute the action (e.g., "/path/.actions/export" or "/path" for exec nodes) */
  path: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * Result of an action execution
 */
export interface ActionResult {
  /** Whether action succeeded */
  success: boolean;
  /** Optional message to display */
  message?: string;
  /** Data returned by action */
  data?: unknown;
}

/**
 * Action handler function
 */
export type ActionHandler = (ctx: ExplorerContext, ...args: unknown[]) => Promise<ActionResult>;

/**
 * Action definition
 */
export interface Action {
  /** Unique action identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Handler function */
  handler: ActionHandler;
}

/**
 * Key binding definition
 */
export interface KeyBinding {
  /** Key or keys that trigger this binding */
  key: string | string[];
  /** Label shown in function bar (e.g., "Help", "Explain") */
  label?: string;
  /** Description for help dialog */
  description: string;
  /** Action to execute */
  action: string;
  /** Optional action arguments */
  args?: unknown[];
  /** Condition for when this binding is active */
  when?: (ctx: ExplorerContext) => boolean;
  /** Priority for display order (higher = more left) */
  priority?: number;
}

/**
 * Key handler function
 */
export type KeyHandler = (ctx: ExplorerContext) => Promise<void>;

/**
 * Explorer options
 */
export interface ExplorerOptions {
  /** Starting path */
  startPath?: string;
  /** Hide metadata panel */
  noMetadata?: boolean;
  /** Disable colors */
  noColors?: boolean;
}
