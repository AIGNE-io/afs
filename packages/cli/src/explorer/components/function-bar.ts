/**
 * AFS Explorer Function Bar Component
 *
 * Bottom function key bar (F1-F10 style).
 */

import type Blessed from "blessed";
import { formatKeyName, type KeyBindingRegistry } from "../keybindings.js";
import { Colors } from "../theme.js";
import type { KeyBinding } from "../types.js";

export interface FunctionBarOptions {
  parent: Blessed.Widgets.Node;
  registry: KeyBindingRegistry;
  width: string | number;
  bottom?: string | number;
  left?: string | number;
}

/**
 * Format a single function key for display
 */
export function formatFunctionKey(binding: KeyBinding): { key: string; label: string } {
  const key = formatKeyName(binding.key);
  const label = binding.label || binding.action;
  return { key, label };
}

/**
 * Create function bar component
 */
export function createFunctionBar(blessed: typeof Blessed, options: FunctionBarOptions) {
  const { parent, registry, width, bottom = 0, left = 0 } = options;

  // Create box for function bar
  const bar = blessed.box({
    parent,
    bottom,
    left,
    width,
    height: 1,
    tags: true,
    style: {
      fg: Colors.fg.selected,
      bg: Colors.bg.functionKey,
    },
  });

  // Build function bar content
  function buildContent(): string {
    const bindings = registry.getFunctionBarBindings();
    const parts: string[] = [];

    for (const binding of bindings) {
      const { key, label } = formatFunctionKey(binding);
      // Key in inverse, label normal
      parts.push(`{inverse}${key}{/inverse}${label}`);
    }

    return parts.join(" ");
  }

  // Initial render
  bar.setContent(buildContent());

  return {
    element: bar,

    /**
     * Refresh the function bar (if bindings changed)
     */
    refresh(): void {
      bar.setContent(buildContent());
      (bar.screen as Blessed.Widgets.Screen)?.render();
    },

    /**
     * Destroy the component
     */
    destroy(): void {
      bar.destroy();
    },
  };
}

export type FunctionBar = ReturnType<typeof createFunctionBar>;
