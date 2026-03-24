/**
 * AFS Explorer Status Bar Component
 *
 * Top status bar showing current path and info.
 */

import type Blessed from "blessed";
import type { ExplorerStore } from "../state.js";
import { Colors, Symbols } from "../theme.js";
import type { ExplorerState } from "../types.js";

export interface StatusBarOptions {
  parent: Blessed.Widgets.Node;
  store: ExplorerStore;
  width: string | number;
  top?: string | number;
  left?: string | number;
}

/**
 * Create status bar component
 */
export function createStatusBar(blessed: typeof Blessed, options: StatusBarOptions) {
  const { parent, store, width, top = 0, left = 0 } = options;

  // Create box for status bar
  const bar = blessed.box({
    parent,
    top,
    left,
    width,
    height: 1,
    tags: true,
    style: {
      fg: Colors.fg.selected,
      bg: Colors.bg.functionKey,
    },
  });

  // Update content from state
  function updateContent(state: ExplorerState): void {
    const path = state.currentPath || "/";
    const count = state.entries.filter((e) => e.type !== "up").length;
    const loading = state.loading ? " Loading..." : "";
    const error = state.error ? ` ${Symbols.error} ${state.error}` : "";

    // Build status line: "AFS Explorer | /path"
    const left = ` AFS Explorer | ${path}`;
    const right = `${count} items${loading}${error} `;

    // Calculate padding to right-align
    const barWidth = typeof bar.width === "number" ? bar.width : 80;
    const padding = Math.max(0, barWidth - left.length - right.length);

    bar.setContent(`${left}${" ".repeat(padding)}${right}`);
  }

  // Subscribe to state changes
  store.subscribe((state) => {
    updateContent(state);
    (bar.screen as Blessed.Widgets.Screen)?.render();
  });

  // Initial render
  updateContent(store.getState());

  return {
    element: bar,

    /**
     * Set temporary message
     */
    setMessage(message: string): void {
      bar.setContent(` ${message}`);
      (bar.screen as Blessed.Widgets.Screen)?.render();
    },

    /**
     * Restore normal status
     */
    restore(): void {
      updateContent(store.getState());
    },

    /**
     * Destroy the component
     */
    destroy(): void {
      bar.destroy();
    },
  };
}

export type StatusBar = ReturnType<typeof createStatusBar>;
