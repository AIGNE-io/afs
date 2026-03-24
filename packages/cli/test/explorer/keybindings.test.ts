import { describe, expect, test } from "bun:test";
import {
  createDefaultRegistry,
  defaultBindings,
  formatKeyName,
  KeyBindingRegistry,
} from "../../src/explorer/keybindings.js";
import type { ExplorerContext, KeyBinding } from "../../src/explorer/types.js";

describe("KeyBindingRegistry", () => {
  describe("register", () => {
    test("registers a single key binding", () => {
      const registry = new KeyBindingRegistry();
      const binding: KeyBinding = {
        key: "f1",
        label: "Help",
        description: "Show help",
        action: "help",
      };

      registry.register(binding);

      expect(registry.getBindingForKey("f1")).toEqual(binding);
    });

    test("registers multiple keys for same action", () => {
      const registry = new KeyBindingRegistry();
      const binding: KeyBinding = {
        key: ["f10", "q"],
        label: "Quit",
        description: "Exit",
        action: "quit",
      };

      registry.register(binding);

      expect(registry.getBindingForKey("f10")).toEqual(binding);
      expect(registry.getBindingForKey("q")).toEqual(binding);
    });

    test("normalizes key case", () => {
      const registry = new KeyBindingRegistry();
      registry.register({
        key: "F1",
        description: "Help",
        action: "help",
      });

      expect(registry.getBindingForKey("f1")).toBeDefined();
      expect(registry.getBindingForKey("F1")).toBeDefined();
    });
  });

  describe("unregister", () => {
    test("removes binding by action", () => {
      const registry = new KeyBindingRegistry();
      registry.register({
        key: "f1",
        description: "Help",
        action: "help",
      });

      registry.unregister("help");

      expect(registry.getBindingForKey("f1")).toBeUndefined();
    });

    test("removes all keys for multi-key binding", () => {
      const registry = new KeyBindingRegistry();
      registry.register({
        key: ["f10", "q"],
        description: "Quit",
        action: "quit",
      });

      registry.unregister("quit");

      expect(registry.getBindingForKey("f10")).toBeUndefined();
      expect(registry.getBindingForKey("q")).toBeUndefined();
    });

    test("handles unregistering non-existent action", () => {
      const registry = new KeyBindingRegistry();
      // Should not throw
      registry.unregister("non-existent");
    });
  });

  describe("getBindings", () => {
    test("returns all registered bindings", () => {
      const registry = new KeyBindingRegistry();
      registry.register({ key: "f1", description: "Help", action: "help" });
      registry.register({ key: "f2", description: "Explain", action: "explain" });

      const bindings = registry.getBindings();

      expect(bindings.length).toBe(2);
      expect(bindings.map((b) => b.action)).toContain("help");
      expect(bindings.map((b) => b.action)).toContain("explain");
    });

    test("returns empty array when no bindings", () => {
      const registry = new KeyBindingRegistry();
      expect(registry.getBindings()).toEqual([]);
    });
  });

  describe("getBindingForKey with condition", () => {
    test("returns binding when condition is true", () => {
      const registry = new KeyBindingRegistry();
      const binding: KeyBinding = {
        key: "f4",
        description: "Exec",
        action: "exec",
        when: () => true,
      };
      registry.register(binding);

      const mockCtx = {} as ExplorerContext;
      expect(registry.getBindingForKey("f4", mockCtx)).toEqual(binding);
    });

    test("returns undefined when condition is false", () => {
      const registry = new KeyBindingRegistry();
      registry.register({
        key: "f4",
        description: "Exec",
        action: "exec",
        when: () => false,
      });

      const mockCtx = {} as ExplorerContext;
      expect(registry.getBindingForKey("f4", mockCtx)).toBeUndefined();
    });

    test("returns binding without checking condition if no context", () => {
      const registry = new KeyBindingRegistry();
      const binding: KeyBinding = {
        key: "f4",
        description: "Exec",
        action: "exec",
        when: () => false,
      };
      registry.register(binding);

      // Without context, condition is not checked
      expect(registry.getBindingForKey("f4")).toEqual(binding);
    });

    test("condition receives context", () => {
      const registry = new KeyBindingRegistry();
      let receivedCtx: ExplorerContext | undefined;

      registry.register({
        key: "f4",
        description: "Exec",
        action: "exec",
        when: (ctx) => {
          receivedCtx = ctx;
          return true;
        },
      });

      const mockCtx = { state: { currentPath: "/test" } } as ExplorerContext;
      registry.getBindingForKey("f4", mockCtx);

      expect(receivedCtx).toBe(mockCtx);
    });
  });

  describe("getBindingByAction", () => {
    test("returns binding by action id", () => {
      const registry = new KeyBindingRegistry();
      const binding: KeyBinding = {
        key: "f1",
        description: "Help",
        action: "help",
      };
      registry.register(binding);

      expect(registry.getBindingByAction("help")).toEqual(binding);
    });

    test("returns undefined for unknown action", () => {
      const registry = new KeyBindingRegistry();
      expect(registry.getBindingByAction("unknown")).toBeUndefined();
    });
  });

  describe("getFunctionBarBindings", () => {
    test("returns only bindings with labels", () => {
      const registry = new KeyBindingRegistry();
      registry.register({ key: "f1", label: "Help", description: "Help", action: "help" });
      registry.register({ key: "up", description: "Move up", action: "nav:up" }); // No label

      const barBindings = registry.getFunctionBarBindings();

      expect(barBindings.length).toBe(1);
      expect(barBindings[0]!.action).toBe("help");
    });

    test("sorts by priority (higher first)", () => {
      const registry = new KeyBindingRegistry();
      registry.register({
        key: "f10",
        label: "Quit",
        description: "Quit",
        action: "quit",
        priority: 0,
      });
      registry.register({
        key: "f1",
        label: "Help",
        description: "Help",
        action: "help",
        priority: 100,
      });
      registry.register({
        key: "f5",
        label: "Refresh",
        description: "Refresh",
        action: "refresh",
        priority: 50,
      });

      const barBindings = registry.getFunctionBarBindings();

      expect(barBindings[0]!.action).toBe("help");
      expect(barBindings[1]!.action).toBe("refresh");
      expect(barBindings[2]!.action).toBe("quit");
    });
  });

  describe("hasKey", () => {
    test("returns true for registered key", () => {
      const registry = new KeyBindingRegistry();
      registry.register({ key: "f1", description: "Help", action: "help" });

      expect(registry.hasKey("f1")).toBe(true);
    });

    test("returns false for unregistered key", () => {
      const registry = new KeyBindingRegistry();
      expect(registry.hasKey("f1")).toBe(false);
    });
  });

  describe("clear", () => {
    test("removes all bindings", () => {
      const registry = new KeyBindingRegistry();
      registry.register({ key: "f1", description: "Help", action: "help" });
      registry.register({ key: "f2", description: "Explain", action: "explain" });

      registry.clear();

      expect(registry.getBindings()).toEqual([]);
      expect(registry.hasKey("f1")).toBe(false);
    });
  });
});

describe("defaultBindings", () => {
  test("includes single-letter commands with labels", () => {
    const labeledBindings = defaultBindings.filter((b) => b.label);
    const actions = labeledBindings.map((b) => b.action);

    expect(actions).toContain("help");
    expect(actions).toContain("explain");
    expect(actions).toContain("view");
    expect(actions).toContain("exec");
    expect(actions).toContain("refresh");
    expect(actions).toContain("quit");
  });

  test("includes navigation keys", () => {
    const actions = defaultBindings.map((b) => b.action);

    expect(actions).toContain("nav:up");
    expect(actions).toContain("nav:down");
    expect(actions).toContain("nav:enter");
    expect(actions).toContain("nav:back");
  });

  test("quit has q key", () => {
    const quitBinding = defaultBindings.find((b) => b.action === "quit");
    expect(quitBinding?.key).toBe("q");
  });

  test("help has ? key", () => {
    const helpBinding = defaultBindings.find((b) => b.action === "help");
    expect(helpBinding?.key).toBe("?");
  });

  test("cancel has escape key", () => {
    const cancelBinding = defaultBindings.find((b) => b.action === "cancel");
    expect(cancelBinding?.key).toBe("escape");
  });
});

describe("createDefaultRegistry", () => {
  test("creates registry with all default bindings", () => {
    const registry = createDefaultRegistry();
    const bindings = registry.getBindings();

    expect(bindings.length).toBe(defaultBindings.length);
  });

  test("? is bound to help", () => {
    const registry = createDefaultRegistry();
    const binding = registry.getBindingForKey("?");

    expect(binding?.action).toBe("help");
  });

  test("q is bound to quit", () => {
    const registry = createDefaultRegistry();
    const binding = registry.getBindingForKey("q");

    expect(binding?.action).toBe("quit");
  });

  test("escape is bound to cancel", () => {
    const registry = createDefaultRegistry();
    const binding = registry.getBindingForKey("escape");

    expect(binding?.action).toBe("cancel");
  });
});

describe("formatKeyName", () => {
  test("formats Ctrl+letter keys", () => {
    expect(formatKeyName("C-h")).toBe("^H");
    expect(formatKeyName("C-e")).toBe("^E");
    expect(formatKeyName("C-r")).toBe("^R");
  });

  test("formats function keys to uppercase", () => {
    expect(formatKeyName("f1")).toBe("F1");
    expect(formatKeyName("f10")).toBe("F10");
  });

  test("formats special keys", () => {
    expect(formatKeyName("enter")).toBe("Enter");
    expect(formatKeyName("backspace")).toBe("Bksp");
    expect(formatKeyName("escape")).toBe("Esc");
    expect(formatKeyName("pageup")).toBe("PgUp");
    expect(formatKeyName("pagedown")).toBe("PgDn");
  });

  test("formats arrow keys with symbols", () => {
    expect(formatKeyName("up")).toBe("↑");
    expect(formatKeyName("down")).toBe("↓");
    expect(formatKeyName("left")).toBe("←");
    expect(formatKeyName("right")).toBe("→");
  });

  test("handles array of keys (uses first)", () => {
    expect(formatKeyName(["up", "k"])).toBe("↑");
  });

  test("returns original for unknown keys", () => {
    expect(formatKeyName("x")).toBe("x");
  });

  test("handles empty array", () => {
    expect(formatKeyName([])).toBe("");
  });
});
