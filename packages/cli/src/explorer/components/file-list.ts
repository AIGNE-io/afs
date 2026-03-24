/**
 * AFS Explorer File List Component
 *
 * Main file listing component using blessed list widget.
 */

import type Blessed from "blessed";
import { navigation } from "../actions.js";
import type { ExplorerStore } from "../state.js";
import { Colors, formatSize, Icons, Symbols } from "../theme.js";
import type { ExplorerEntry, ExplorerState } from "../types.js";

export interface FileListOptions {
  parent: Blessed.Widgets.Node;
  store: ExplorerStore;
  width: string | number;
  height: string | number;
  top?: string | number;
  left?: string | number;
}

/**
 * Format an entry for display in the list
 */
export function formatEntry(entry: ExplorerEntry, maxNameWidth: number): string {
  // Use default ASCII icons based on entry type (emoji icons not displayed due to terminal rendering issues)
  const icon = Icons[entry.type] || Icons.file;
  const name = entry.name.padEnd(maxNameWidth);
  const size = entry.size !== undefined ? formatSize(entry.size).padStart(8) : "        ";
  const modified = entry.modified ? formatDate(entry.modified) : "            ";

  return `${icon} ${name} ${size} ${modified}`;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const isThisYear = date.getFullYear() === now.getFullYear();

  const month = date.toLocaleString("en", { month: "short" });
  const day = date.getDate().toString().padStart(2, " ");

  if (isThisYear) {
    const hours = date.getHours().toString().padStart(2, "0");
    const mins = date.getMinutes().toString().padStart(2, "0");
    return `${month} ${day} ${hours}:${mins}`;
  }
  return `${month} ${day}  ${date.getFullYear()}`;
}

/**
 * Create file list component
 */
export function createFileList(blessed: typeof Blessed, options: FileListOptions) {
  const { parent, store, width, height, top = 0, left = 0 } = options;

  // Create list widget
  const list = blessed.list({
    parent,
    top,
    left,
    width,
    height,
    tags: true,
    keys: false,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: Symbols.scrollbar,
      track: {
        bg: Colors.bg.main,
      },
      style: {
        inverse: true,
      },
    },
    style: {
      fg: Colors.fg.normal,
      bg: Colors.bg.main,
      selected: {
        fg: Colors.fg.selected,
        bg: Colors.bg.selected,
      },
      item: {
        fg: Colors.fg.normal,
        bg: Colors.bg.main,
      },
    },
    border: {
      type: "line",
    },
  });

  // Calculate max name width based on entries
  function getMaxNameWidth(entries: ExplorerEntry[]): number {
    if (entries.length === 0) return 20;
    const maxLen = Math.max(...entries.map((e) => e.name.length));
    return Math.min(Math.max(maxLen, 10), 40);
  }

  // Update list content from state
  function updateContent(state: ExplorerState): void {
    const maxNameWidth = getMaxNameWidth(state.entries);
    const items = state.entries.map((entry) => {
      const formatted = formatEntry(entry, maxNameWidth);
      // Apply color based on type
      const color = getEntryColor(entry.type);
      return `{${color}-fg}${formatted}{/${color}-fg}`;
    });

    list.setItems(items);
    list.select(state.selectedIndex);
    list.scrollTo(state.selectedIndex);
  }

  // Get color name for entry type
  function getEntryColor(type: ExplorerEntry["type"]): string {
    switch (type) {
      case "directory":
        return Colors.fg.directory;
      case "exec":
        return Colors.fg.exec;
      case "link":
        return Colors.fg.link;
      case "up":
        return Colors.fg.up;
      default:
        return Colors.fg.file;
    }
  }

  // Subscribe to state changes
  store.subscribe((state) => {
    updateContent(state);
    (list.screen as Blessed.Widgets.Screen)?.render();
  });

  // Initial render
  updateContent(store.getState());

  // Return component interface
  return {
    element: list,

    /**
     * Focus the list
     */
    focus(): void {
      list.focus();
    },

    /**
     * Get visible height (for page calculations)
     */
    getVisibleHeight(): number {
      // Account for border
      const h = typeof list.height === "number" ? list.height : 20;
      return Math.max(1, h - 2);
    },

    /**
     * Get selected entry
     */
    getSelected(): ExplorerEntry | undefined {
      return navigation.getSelected(store.getState());
    },

    /**
     * Destroy the component
     */
    destroy(): void {
      list.destroy();
    },
  };
}

export type FileList = ReturnType<typeof createFileList>;
