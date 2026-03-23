/**
 * Phase 3: Kind-based template registry tests.
 *
 * Tests the convention-over-configuration layer:
 * - Register kind → AUP template mapping
 * - Three-layer priority: role="item" > kind registry > built-in itemStyle
 * - Wildcard prefix matching: "ts:*" matches "ts:task"
 * - ${entry.field} binding works in kind templates
 */
import { describe, expect, test } from "bun:test";

// ── Kind Template Registry (unit tests) ──────────────────────────

// Mirrors the registry that will be added to core.ts / list.ts

class KindTemplateRegistry {
  private templates: Record<string, Record<string, unknown>> = {};

  register(kind: string, template: Record<string, unknown>): void {
    this.templates[kind] = template;
  }

  get(kind: string): Record<string, unknown> | null {
    // Exact match first
    if (this.templates[kind]) return this.templates[kind];
    // Wildcard prefix: "ts:*" matches "ts:task", "ts:task-group"
    const colonIdx = kind.indexOf(":");
    if (colonIdx >= 0) {
      const prefix = `${kind.substring(0, colonIdx)}:*`;
      if (this.templates[prefix]) return this.templates[prefix];
    }
    return null;
  }

  clear(): void {
    this.templates = {};
  }
}

// ── Tests ──

describe("Kind template registry", () => {
  test("exact kind match returns registered template", () => {
    const reg = new KindTemplateRegistry();
    const tpl = { id: "task-card", type: "section", props: { content: "${entry.id}" } };
    reg.register("ts:task", tpl);

    const found = reg.get("ts:task");
    expect(found).toBe(tpl);
  });

  test("unregistered kind returns null", () => {
    const reg = new KindTemplateRegistry();
    expect(reg.get("unknown:thing")).toBeNull();
  });

  test("wildcard prefix 'ts:*' matches 'ts:task'", () => {
    const reg = new KindTemplateRegistry();
    const tpl = { id: "ts-wildcard", type: "text", props: {} };
    reg.register("ts:*", tpl);

    expect(reg.get("ts:task")).toBe(tpl);
    expect(reg.get("ts:task-group")).toBe(tpl);
    expect(reg.get("ts:queue-item")).toBe(tpl);
  });

  test("exact match takes priority over wildcard", () => {
    const reg = new KindTemplateRegistry();
    const exactTpl = { id: "exact", type: "text", props: {} };
    const wildcardTpl = { id: "wildcard", type: "text", props: {} };
    reg.register("ts:task", exactTpl);
    reg.register("ts:*", wildcardTpl);

    expect(reg.get("ts:task")).toBe(exactTpl);
    expect(reg.get("ts:task-group")).toBe(wildcardTpl);
  });

  test("no colon in kind skips wildcard check", () => {
    const reg = new KindTemplateRegistry();
    reg.register("ts:*", { id: "w", type: "text", props: {} });

    // "file" has no colon, shouldn't match "ts:*"
    expect(reg.get("file")).toBeNull();
  });
});

describe("Three-layer template resolution", () => {
  // Simulates the resolution logic in the renderer
  function resolveRenderer(opts: {
    itemTemplate: Record<string, unknown> | null;
    kindRegistry: KindTemplateRegistry;
    entryKind: string;
    builtinStyle: string;
  }): { type: "role-template" | "kind-template" | "builtin"; template?: Record<string, unknown> } {
    // Priority 1: role="item" child
    if (opts.itemTemplate) return { type: "role-template", template: opts.itemTemplate };
    // Priority 2: kind registry
    const kindTpl = opts.kindRegistry.get(opts.entryKind);
    if (kindTpl) return { type: "kind-template", template: kindTpl };
    // Priority 3: built-in itemStyle
    return { type: "builtin" };
  }

  test("role='item' child overrides kind template (priority 1 > 2)", () => {
    const reg = new KindTemplateRegistry();
    reg.register("ts:task", { id: "kind-tpl", type: "text", props: {} });
    const roleTpl = { id: "role-tpl", type: "section", props: {} };

    const result = resolveRenderer({
      itemTemplate: roleTpl,
      kindRegistry: reg,
      entryKind: "ts:task",
      builtinStyle: "row",
    });
    expect(result.type).toBe("role-template");
    expect(result.template).toBe(roleTpl);
  });

  test("kind template overrides built-in itemStyle (priority 2 > 3)", () => {
    const reg = new KindTemplateRegistry();
    const kindTpl = { id: "kind-tpl", type: "card", props: {} };
    reg.register("ts:task", kindTpl);

    const result = resolveRenderer({
      itemTemplate: null,
      kindRegistry: reg,
      entryKind: "ts:task",
      builtinStyle: "row",
    });
    expect(result.type).toBe("kind-template");
    expect(result.template).toBe(kindTpl);
  });

  test("unregistered kind falls back to built-in itemStyle (priority 3)", () => {
    const reg = new KindTemplateRegistry();

    const result = resolveRenderer({
      itemTemplate: null,
      kindRegistry: reg,
      entryKind: "unknown:thing",
      builtinStyle: "card",
    });
    expect(result.type).toBe("builtin");
  });

  test("empty kind falls back to built-in", () => {
    const reg = new KindTemplateRegistry();
    reg.register("ts:task", { id: "k", type: "text", props: {} });

    const result = resolveRenderer({
      itemTemplate: null,
      kindRegistry: reg,
      entryKind: "",
      builtinStyle: "row",
    });
    expect(result.type).toBe("builtin");
  });
});
