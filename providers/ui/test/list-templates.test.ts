/**
 * Phase 2: Item template system tests.
 *
 * Tests:
 * - role="item" child used as template
 * - ${entry.field} binding in template props
 * - role="header" / role="empty" children
 * - Fallback to built-in itemStyle when no templates
 * - Template binding engine (unit tests)
 */
import { describe, expect, test } from "bun:test";

// ── Template Binding Engine (unit tests) ────────────────────────

// Extract the binding logic for unit testing.
// These mirror the functions that will be added to list.ts.

function resolveFieldPath(entry: Record<string, unknown>, dotPath: string): string | null {
  const parts = dotPath.split(".");
  let val: unknown = entry;
  for (const part of parts) {
    if (val == null || typeof val !== "object") return null;
    val = (val as Record<string, unknown>)[part];
  }
  return val != null ? String(val) : null;
}

function bindStrings(obj: Record<string, unknown>, entry: Record<string, unknown>): void {
  for (const key in obj) {
    const v = obj[key];
    if (typeof v === "string") {
      obj[key] = v.replace(/\$\{entry\.([^}]+)\}/g, (_, path: string) => {
        return resolveFieldPath(entry, path) ?? "";
      });
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === "object") {
          bindStrings(item as Record<string, unknown>, entry);
        }
      }
    } else if (v && typeof v === "object") {
      bindStrings(v as Record<string, unknown>, entry);
    }
  }
}

function bindTemplate(
  templateNode: Record<string, unknown>,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const bound = JSON.parse(JSON.stringify(templateNode));
  bindStrings(bound, entry);
  bound.id = `${templateNode.id}--${(entry as { id: string }).id}`;
  return bound;
}

// ── Tests ──

describe("afs-list template binding engine", () => {
  test("${entry.id} resolves to entry id", () => {
    const tpl = { id: "tpl", type: "text", props: { content: "Item: ${entry.id}" } };
    const entry = { id: "task-001", path: "/tasks/task-001", meta: {}, content: {} };
    const bound = bindTemplate(tpl, entry);
    expect((bound.props as Record<string, unknown>).content).toBe("Item: task-001");
  });

  test("${entry.meta.kind} resolves nested paths", () => {
    const tpl = { id: "tpl", type: "badge", props: { label: "${entry.meta.kind}" } };
    const entry = { id: "t1", path: "/t1", meta: { kind: "ts:task" }, content: {} };
    const bound = bindTemplate(tpl, entry);
    expect((bound.props as Record<string, unknown>).label).toBe("ts:task");
  });

  test("${entry.content.status} resolves content fields", () => {
    const tpl = { id: "tpl", type: "text", props: { content: "Status: ${entry.content.status}" } };
    const entry = { id: "t1", path: "/t1", meta: {}, content: { status: "done" } };
    const bound = bindTemplate(tpl, entry);
    expect((bound.props as Record<string, unknown>).content).toBe("Status: done");
  });

  test("missing field resolves to empty string", () => {
    const tpl = { id: "tpl", type: "text", props: { content: "By: ${entry.content.assignee}" } };
    const entry = { id: "t1", path: "/t1", meta: {}, content: {} };
    const bound = bindTemplate(tpl, entry);
    expect((bound.props as Record<string, unknown>).content).toBe("By: ");
  });

  test("multiple bindings in one string", () => {
    const tpl = { id: "tpl", type: "text", props: { content: "${entry.id} (${entry.meta.kind})" } };
    const entry = { id: "task-1", path: "/t", meta: { kind: "ts:task" }, content: {} };
    const bound = bindTemplate(tpl, entry);
    expect((bound.props as Record<string, unknown>).content).toBe("task-1 (ts:task)");
  });

  test("binding in nested child props", () => {
    const tpl = {
      id: "tpl",
      type: "section",
      props: {},
      children: [
        { id: "child1", type: "text", props: { content: "${entry.id}" } },
        { id: "child2", type: "badge", props: { label: "${entry.content.priority}" } },
      ],
    };
    const entry = { id: "item-5", path: "/i5", meta: {}, content: { priority: "high" } };
    const bound = bindTemplate(tpl, entry);
    const children = bound.children as Array<Record<string, unknown>>;
    expect((children[0]!.props as Record<string, unknown>).content).toBe("item-5");
    expect((children[1]!.props as Record<string, unknown>).label).toBe("high");
  });

  test("bound node gets unique id per entry", () => {
    const tpl = { id: "card-tpl", type: "text", props: {} };
    const entry1 = { id: "a", path: "/a", meta: {}, content: {} };
    const entry2 = { id: "b", path: "/b", meta: {}, content: {} };
    const bound1 = bindTemplate(tpl, entry1);
    const bound2 = bindTemplate(tpl, entry2);
    expect(bound1.id).toBe("card-tpl--a");
    expect(bound2.id).toBe("card-tpl--b");
    expect(bound1.id).not.toBe(bound2.id);
  });

  test("template is deep-cloned (original not mutated)", () => {
    const tpl = { id: "tpl", type: "text", props: { content: "${entry.id}" } };
    const entry = { id: "mutant", path: "/m", meta: {}, content: {} };
    bindTemplate(tpl, entry);
    expect(tpl.props.content).toBe("${entry.id}"); // original unchanged
  });

  test("non-string props are preserved", () => {
    const tpl = {
      id: "tpl",
      type: "text",
      props: { content: "${entry.id}", count: 42, active: true },
    };
    const entry = { id: "x", path: "/x", meta: {}, content: {} };
    const bound = bindTemplate(tpl, entry);
    const props = bound.props as Record<string, unknown>;
    expect(props.count).toBe(42);
    expect(props.active).toBe(true);
  });
});

describe("afs-list template role detection", () => {
  // Template detection logic — mirrors what the renderer will do
  function detectTemplates(children: Array<{ props?: Record<string, unknown> }>) {
    let itemTpl = null as (typeof children)[0] | null;
    let headerTpl = null as (typeof children)[0] | null;
    let emptyTpl = null as (typeof children)[0] | null;
    for (const child of children) {
      const role = child.props?.role;
      if (role === "item") itemTpl = child;
      else if (role === "header") headerTpl = child;
      else if (role === "empty") emptyTpl = child;
    }
    return { itemTpl, headerTpl, emptyTpl };
  }

  test("detects role='item' child", () => {
    const children = [{ type: "text", props: { role: "item", content: "${entry.id}" } }];
    const { itemTpl, headerTpl, emptyTpl } = detectTemplates(children);
    expect(itemTpl).not.toBeNull();
    expect(headerTpl).toBeNull();
    expect(emptyTpl).toBeNull();
  });

  test("detects all three roles", () => {
    const children = [
      { type: "text", props: { role: "header", content: "Title" } },
      { type: "section", props: { role: "item" } },
      { type: "text", props: { role: "empty", content: "Nothing here" } },
    ];
    const { itemTpl, headerTpl, emptyTpl } = detectTemplates(children);
    expect(itemTpl).not.toBeNull();
    expect(headerTpl).not.toBeNull();
    expect(emptyTpl).not.toBeNull();
  });

  test("no role children returns all null", () => {
    const children = [{ type: "text", props: { content: "orphan" } }];
    const { itemTpl, headerTpl, emptyTpl } = detectTemplates(children);
    expect(itemTpl).toBeNull();
    expect(headerTpl).toBeNull();
    expect(emptyTpl).toBeNull();
  });

  test("empty children returns all null", () => {
    const { itemTpl, headerTpl, emptyTpl } = detectTemplates([]);
    expect(itemTpl).toBeNull();
    expect(headerTpl).toBeNull();
    expect(emptyTpl).toBeNull();
  });
});
