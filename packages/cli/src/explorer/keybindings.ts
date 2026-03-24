/**
 * AFS Explorer Keybindings
 *
 * Extensible key binding system for the TUI explorer.
 * Allows registering, unregistering, and querying key bindings.
 */

import type { ExplorerContext, KeyBinding } from "./types.js";

/**
 * Key binding registry
 */
export class KeyBindingRegistry {
  private bindings: Map<string, KeyBinding> = new Map();
  private keyToAction: Map<string, string> = new Map();

  /**
   * Register a new key binding
   */
  register(binding: KeyBinding): void {
    // Store binding by action id
    this.bindings.set(binding.action, binding);

    // Map keys to action
    const keys = Array.isArray(binding.key) ? binding.key : [binding.key];
    for (const key of keys) {
      this.keyToAction.set(this.normalizeKey(key), binding.action);
    }
  }

  /**
   * Unregister a key binding by action id
   */
  unregister(action: string): void {
    const binding = this.bindings.get(action);
    if (!binding) return;

    // Remove key mappings
    const keys = Array.isArray(binding.key) ? binding.key : [binding.key];
    for (const key of keys) {
      this.keyToAction.delete(this.normalizeKey(key));
    }

    // Remove binding
    this.bindings.delete(action);
  }

  /**
   * Get all registered bindings
   */
  getBindings(): KeyBinding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Get binding for a specific key
   */
  getBindingForKey(key: string, ctx?: ExplorerContext): KeyBinding | undefined {
    const action = this.keyToAction.get(this.normalizeKey(key));
    if (!action) return undefined;

    const binding = this.bindings.get(action);
    if (!binding) return undefined;

    // Check condition if context provided
    if (ctx && binding.when && !binding.when(ctx)) {
      return undefined;
    }

    return binding;
  }

  /**
   * Get binding by action id
   */
  getBindingByAction(action: string): KeyBinding | undefined {
    return this.bindings.get(action);
  }

  /**
   * Get bindings for function bar display (sorted by priority)
   */
  getFunctionBarBindings(): KeyBinding[] {
    return this.getBindings()
      .filter((b) => b.label !== undefined)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Check if a key is bound
   */
  hasKey(key: string): boolean {
    return this.keyToAction.has(this.normalizeKey(key));
  }

  /**
   * Normalize key string for consistent lookup
   */
  private normalizeKey(key: string): string {
    return key.toLowerCase().trim();
  }

  /**
   * Clear all bindings
   */
  clear(): void {
    this.bindings.clear();
    this.keyToAction.clear();
  }
}

/**
 * Default key bindings for the explorer
 *
 * Uses single letter keys for simplicity. Labels show highlighted key.
 * Navigation uses vim-style hjkl keys.
 */
export const defaultBindings: KeyBinding[] = [
  // Single letter commands (shown in function bar)
  {
    key: "?",
    label: "[?]Help",
    description: "Show help dialog",
    action: "help",
    priority: 100,
  },
  {
    key: "e",
    label: "[E]xplain",
    description: "Show AFS explain for selected item",
    action: "explain",
    priority: 90,
  },
  {
    key: "v",
    label: "[V]iew",
    description: "View file content",
    action: "view",
    priority: 80,
  },
  {
    key: "x",
    label: "E[x]ec",
    description: "Execute AFS action on selected item",
    action: "exec",
    priority: 70,
  },
  {
    key: "r",
    label: "[R]efresh",
    description: "Refresh current directory",
    action: "refresh",
    priority: 60,
  },
  {
    key: "q",
    label: "[Q]uit",
    description: "Exit explorer",
    action: "quit",
    priority: 0,
  },

  // Navigation keys (vim-style hjkl)
  {
    key: ["up", "k"],
    description: "Move selection up",
    action: "nav:up",
  },
  {
    key: ["down", "j"],
    description: "Move selection down",
    action: "nav:down",
  },
  {
    key: ["enter", "return", "l"],
    description: "Enter directory or view file",
    action: "nav:enter",
  },
  {
    key: ["backspace", "h"],
    description: "Go to parent directory",
    action: "nav:back",
  },
  {
    key: ["home", "g"],
    description: "Go to first item",
    action: "nav:home",
  },
  {
    key: ["end", "G"],
    description: "Go to last item",
    action: "nav:end",
  },
  {
    key: ["pageup", "C-u"],
    description: "Page up",
    action: "nav:pageup",
  },
  {
    key: ["pagedown", "C-d"],
    description: "Page down",
    action: "nav:pagedown",
  },

  // Other
  {
    key: "/",
    description: "Search/filter",
    action: "filter",
  },

  // Cancel (for dialogs)
  {
    key: "escape",
    description: "Cancel/close dialog",
    action: "cancel",
  },
];

/**
 * Create a new registry with default bindings
 */
export function createDefaultRegistry(): KeyBindingRegistry {
  const registry = new KeyBindingRegistry();
  for (const binding of defaultBindings) {
    registry.register(binding);
  }
  return registry;
}

/**
 * Format key name for display (e.g., "C-h" -> "^H", "f1" -> "F1")
 */
export function formatKeyName(key: string | string[]): string {
  const k = Array.isArray(key) ? key[0] : key;
  if (!k) return "";

  // Ctrl+letter keys (C-h -> ^H)
  if (k.startsWith("C-") && k.length === 3) {
    return `^${k[2]!.toUpperCase()}`;
  }

  // Function keys
  if (k.startsWith("f") && k.length <= 3) {
    return k.toUpperCase();
  }

  // Special keys
  const specialKeys: Record<string, string> = {
    enter: "Enter",
    return: "Enter",
    backspace: "Bksp",
    escape: "Esc",
    pageup: "PgUp",
    pagedown: "PgDn",
    home: "Home",
    end: "End",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
  };

  return specialKeys[k.toLowerCase()] || k;
}
