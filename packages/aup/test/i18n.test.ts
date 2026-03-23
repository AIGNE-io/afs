import { describe, expect, test } from "bun:test";
import type { AUPNode } from "../src/aup-types.js";

// Tests are written BEFORE implementation — TDD.
// Import will fail until we create the module.
import { resolveAUPVariables, resolveTranslationString, resolveTranslations } from "../src/i18n.js";

// ── resolveTranslationString ──────────────────────────────────────────────────

describe("resolveTranslationString", () => {
  // ── Happy path ──

  test("resolves single $t() key", () => {
    const result = resolveTranslationString("$t(greeting)", { greeting: "Hello" });
    expect(result).toBe("Hello");
  });

  test("resolves multiple $t() in one string", () => {
    const result = resolveTranslationString("$t(greeting), $t(name)!", {
      greeting: "Hello",
      name: "World",
    });
    expect(result).toBe("Hello, World!");
  });

  test("mixed text and $t()", () => {
    const result = resolveTranslationString("Visit $t(place) on $t(date)", {
      place: "Tokyo",
      date: "March 1st",
    });
    expect(result).toBe("Visit Tokyo on March 1st");
  });

  test("returns string unchanged when no $t() present", () => {
    expect(resolveTranslationString("plain text", {})).toBe("plain text");
  });

  test("returns empty string unchanged", () => {
    expect(resolveTranslationString("", {})).toBe("");
  });

  test("falls back to fallback messages when key missing in primary", () => {
    const result = resolveTranslationString("$t(greeting)", {}, { greeting: "Hello (fallback)" });
    expect(result).toBe("Hello (fallback)");
  });

  test("primary wins over fallback when both have the key", () => {
    const result = resolveTranslationString(
      "$t(greeting)",
      { greeting: "Hola" },
      { greeting: "Hello" },
    );
    expect(result).toBe("Hola");
  });

  test("leaves $t() literal when key not found in any messages", () => {
    const result = resolveTranslationString("$t(unknown.key)", {}, {});
    expect(result).toBe("$t(unknown.key)");
  });

  test("handles dotted keys", () => {
    const result = resolveTranslationString("$t(nav.blog.title)", {
      "nav.blog.title": "Blog",
    });
    expect(result).toBe("Blog");
  });

  test("handles keys with hyphens", () => {
    const result = resolveTranslationString("$t(hero-section.cta)", {
      "hero-section.cta": "Get Started",
    });
    expect(result).toBe("Get Started");
  });

  // ── Bad path ──

  test("handles malformed $t( without closing paren — no substitution", () => {
    const result = resolveTranslationString("$t(unclosed", { unclosed: "value" });
    expect(result).toBe("$t(unclosed");
  });

  test("handles empty key $t() — regex requires 1+ chars, no match", () => {
    const result = resolveTranslationString("$t()", { "": "empty-key-value" });
    // $t() with empty key does NOT match — regex [^)]+ requires at least one char
    expect(result).toBe("$t()");
  });

  test("handles nested $t($t(x)) — no recursive resolution", () => {
    const result = resolveTranslationString("$t($t(inner))", {
      inner: "resolved-inner",
      "$t(inner)": "should-not-match",
    });
    // The outer $t() captures "$t(inner" as the key (up to first ")"), not recursive
    // Behavior depends on regex — key is "$t(inner" which won't match anything
    // Result: leaves outer $t() literal or resolves to whatever regex captures
    expect(result).not.toContain("should-not-match");
  });

  // ── Security ──

  test("translation values with HTML are NOT escaped (caller responsibility)", () => {
    // resolveTranslationString is a pure substitution — escaping is the renderer's job
    const result = resolveTranslationString("$t(msg)", {
      msg: '<script>alert("xss")</script>',
    });
    expect(result).toBe('<script>alert("xss")</script>');
  });

  test("translation keys cannot contain closing paren (regex boundary)", () => {
    // Key with ) in it — the regex /\$t\(([^)]+)\)/ stops at first )
    const result = resolveTranslationString("$t(key)rest)", { key: "value" });
    expect(result).toBe("valuerest)");
  });

  test("keys with special regex chars are treated as literal", () => {
    // Dots, hyphens, underscores — should work fine as dict keys
    const result = resolveTranslationString("$t(a.b-c_d)", { "a.b-c_d": "ok" });
    expect(result).toBe("ok");
  });

  test("handles very long key names", () => {
    const longKey = "a".repeat(1000);
    const result = resolveTranslationString(`$t(${longKey})`, { [longKey]: "long" });
    expect(result).toBe("long");
  });

  test("handles very long translation values", () => {
    const longValue = "x".repeat(10000);
    const result = resolveTranslationString("$t(k)", { k: longValue });
    expect(result).toBe(longValue);
  });

  test("translation values with $t() are NOT recursively resolved", () => {
    // Prevents infinite loops and injection via translation content
    const result = resolveTranslationString("$t(a)", {
      a: "$t(b)",
      b: "should-not-resolve",
    });
    expect(result).toBe("$t(b)");
  });

  test("keys with path traversal patterns are just strings", () => {
    const result = resolveTranslationString("$t(../../etc/passwd)", {
      "../../etc/passwd": "nice try",
    });
    expect(result).toBe("nice try");
  });

  test("keys with null bytes are handled", () => {
    const result = resolveTranslationString("$t(key\0evil)", {});
    // Regex won't match null as ) so it captures "key\0evil"
    expect(typeof result).toBe("string");
  });
});

// ── resolveTranslations (AUP tree) ────────────────────────────────────────────

describe("resolveTranslations", () => {
  const msgs = { title: "Hello", desc: "World", "nav.home": "Home" };
  const fallback = { title: "Hello (en)", missing: "Fallback value" };

  // ── Happy path ──

  test("resolves $t() in props.content", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(title)" },
    };
    const result = resolveTranslations(node, msgs);
    expect(result.props!.content).toBe("Hello");
  });

  test("resolves $t() in nested props", () => {
    const node: AUPNode = {
      id: "t1",
      type: "table",
      props: {
        columns: [
          { label: "$t(title)", key: "name" },
          { label: "$t(desc)", key: "desc" },
        ],
      },
    };
    const result = resolveTranslations(node, msgs);
    const cols = result.props!.columns as Array<{ label: string }>;
    expect(cols[0]!.label).toBe("Hello");
    expect(cols[1]!.label).toBe("World");
  });

  test("resolves $t() in children recursively", () => {
    const node: AUPNode = {
      id: "root",
      type: "view",
      children: [
        { id: "c1", type: "text", props: { content: "$t(title)" } },
        {
          id: "c2",
          type: "view",
          children: [{ id: "c3", type: "text", props: { content: "$t(desc)" } }],
        },
      ],
    };
    const result = resolveTranslations(node, msgs);
    expect((result.children![0] as AUPNode).props!.content).toBe("Hello");
    const nested = (result.children![1] as AUPNode).children![0] as AUPNode;
    expect(nested.props!.content).toBe("World");
  });

  test("uses fallback for missing keys", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(missing)" },
    };
    const result = resolveTranslations(node, {}, fallback);
    expect(result.props!.content).toBe("Fallback value");
  });

  test("leaves $t() literal when key not found anywhere", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(nonexistent)" },
    };
    const result = resolveTranslations(node, msgs);
    expect(result.props!.content).toBe("$t(nonexistent)");
  });

  test("does not mutate the original tree", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(title)" },
    };
    const original = JSON.stringify(node);
    resolveTranslations(node, msgs);
    expect(JSON.stringify(node)).toBe(original);
  });

  test("preserves non-string prop values", () => {
    const node: AUPNode = {
      id: "t1",
      type: "chart",
      props: { data: [1, 2, 3], enabled: true, count: 42 },
    };
    const result = resolveTranslations(node, msgs);
    expect(result.props!.data).toEqual([1, 2, 3]);
    expect(result.props!.enabled).toBe(true);
    expect(result.props!.count).toBe(42);
  });

  test("handles node without props", () => {
    const node: AUPNode = { id: "t1", type: "view" };
    const result = resolveTranslations(node, msgs);
    expect(result.props).toBeUndefined();
  });

  test("handles node without children", () => {
    const node: AUPNode = { id: "t1", type: "text", props: { content: "$t(title)" } };
    const result = resolveTranslations(node, msgs);
    expect(result.children).toBeUndefined();
    expect(result.props!.content).toBe("Hello");
  });

  test("skips $ref nodes (wrapper content placeholder)", () => {
    const node: AUPNode = {
      id: "wrapper",
      type: "view",
      children: [
        { id: "header", type: "text", props: { content: "$t(title)" } },
        { $ref: "content" } as unknown as AUPNode,
        { id: "footer", type: "text", props: { content: "$t(desc)" } },
      ],
    };
    const result = resolveTranslations(node, msgs);
    expect((result.children![0] as AUPNode).props!.content).toBe("Hello");
    expect((result.children![1] as any).$ref).toBe("content");
    expect((result.children![2] as AUPNode).props!.content).toBe("World");
  });

  test("handles deeply nested props (3+ levels)", () => {
    const node: AUPNode = {
      id: "t1",
      type: "view",
      props: {
        config: {
          header: {
            title: "$t(title)",
            subtitle: { text: "$t(desc)" },
          },
        },
      },
    };
    const result = resolveTranslations(node, msgs);
    const config = result.props!.config as any;
    expect(config.header.title).toBe("Hello");
    expect(config.header.subtitle.text).toBe("World");
  });

  test("handles props with array of strings", () => {
    const node: AUPNode = {
      id: "t1",
      type: "view",
      props: {
        items: ["$t(title)", "static", "$t(desc)"],
      },
    };
    const result = resolveTranslations(node, msgs);
    expect(result.props!.items).toEqual(["Hello", "static", "World"]);
  });

  // ── Bad path ──

  test("handles empty children array", () => {
    const node: AUPNode = { id: "t1", type: "view", children: [] };
    const result = resolveTranslations(node, msgs);
    expect(result.children).toEqual([]);
  });

  test("handles empty props object", () => {
    const node: AUPNode = { id: "t1", type: "view", props: {} };
    const result = resolveTranslations(node, msgs);
    expect(result.props).toEqual({});
  });

  test("handles empty messages", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(title)" },
    };
    const result = resolveTranslations(node, {});
    expect(result.props!.content).toBe("$t(title)");
  });

  test("handles null-ish prop values gracefully", () => {
    const node: AUPNode = {
      id: "t1",
      type: "view",
      props: { a: null, b: undefined },
    };
    const result = resolveTranslations(node, msgs);
    expect(result.props!.a).toBeNull();
    expect(result.props!.b).toBeUndefined();
  });

  // ── Security ──

  test("translation values with HTML are passed through (renderer must escape)", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(xss)" },
    };
    const result = resolveTranslations(node, {
      xss: '<img src=x onerror="alert(1)">',
    });
    // resolveTranslations is a data transform — HTML escaping is the renderer's duty
    expect(result.props!.content).toBe('<img src=x onerror="alert(1)">');
  });

  test("translation values are NOT recursively resolved (prevents injection loops)", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(a)" },
    };
    const result = resolveTranslations(node, {
      a: "$t(b)",
      b: "injected",
    });
    // Value of key "a" is "$t(b)" — must NOT be further resolved
    expect(result.props!.content).toBe("$t(b)");
  });

  test("huge tree does not stackoverflow (reasonable depth)", () => {
    // Build a 100-level deep tree
    let node: AUPNode = { id: "leaf", type: "text", props: { content: "$t(title)" } };
    for (let i = 0; i < 100; i++) {
      node = { id: `level-${i}`, type: "view", children: [node] };
    }
    const result = resolveTranslations(node, msgs);
    // Walk down to the leaf
    let current: AUPNode = result;
    for (let i = 0; i < 100; i++) {
      current = current.children![0] as AUPNode;
    }
    expect(current.props!.content).toBe("Hello");
  });

  test("node id/type fields are never translated", () => {
    const node: AUPNode = {
      id: "$t(title)",
      type: "text" as any,
      props: { content: "static" },
    };
    const result = resolveTranslations(node, msgs);
    // id and type should stay as-is — only props and children are resolved
    expect(result.id).toBe("$t(title)");
    expect(result.type).toBe("text");
  });

  test("event handlers in props are preserved unchanged", () => {
    const node: AUPNode = {
      id: "btn",
      type: "action",
      props: { label: "$t(title)" },
      events: { click: { exec: "/navigate", args: { page: "home" } } },
    };
    const result = resolveTranslations(node, msgs);
    expect(result.props!.label).toBe("Hello");
    // events should be structurally preserved
    expect(result.events).toEqual({ click: { exec: "/navigate", args: { page: "home" } } });
  });
});

// ── resolveAUPVariables ($locale, $theme, etc.) ───────────────────────────────

describe("resolveAUPVariables", () => {
  // ── Happy path ──

  test("replaces $locale in href prop", () => {
    const node: AUPNode = {
      id: "link",
      type: "action",
      props: { href: "/sites/app/$locale/", label: "Home" },
    };
    const result = resolveAUPVariables(node, { locale: "zh" });
    expect(result.props!.href).toBe("/sites/app/zh/");
    expect(result.props!.label).toBe("Home");
  });

  test("replaces multiple variables in one string", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "Lang: $locale, Theme: $theme" },
    };
    const result = resolveAUPVariables(node, { locale: "ja", theme: "opus" });
    expect(result.props!.content).toBe("Lang: ja, Theme: opus");
  });

  test("replaces $locale in nested children", () => {
    const node: AUPNode = {
      id: "root",
      type: "view",
      children: [
        { id: "c1", type: "action", props: { href: "/app/$locale/" } },
        {
          id: "c2",
          type: "view",
          children: [{ id: "c3", type: "action", props: { href: "/docs/$locale/" } }],
        },
      ],
    };
    const result = resolveAUPVariables(node, { locale: "zh" });
    expect((result.children![0] as AUPNode).props!.href).toBe("/app/zh/");
    const nested = (result.children![1] as AUPNode).children![0] as AUPNode;
    expect(nested.props!.href).toBe("/docs/zh/");
  });

  test("leaves strings unchanged when no variables present", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "plain text" },
    };
    const result = resolveAUPVariables(node, { locale: "zh" });
    expect(result.props!.content).toBe("plain text");
  });

  test("leaves unknown $variables unchanged", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$unknown stays" },
    };
    const result = resolveAUPVariables(node, { locale: "zh" });
    expect(result.props!.content).toBe("$unknown stays");
  });

  test("does not mutate original tree", () => {
    const node: AUPNode = {
      id: "t1",
      type: "action",
      props: { href: "/app/$locale/" },
    };
    const original = JSON.stringify(node);
    resolveAUPVariables(node, { locale: "zh" });
    expect(JSON.stringify(node)).toBe(original);
  });

  test("handles empty variables — no-op", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$locale" },
    };
    const result = resolveAUPVariables(node, {});
    expect(result.props!.content).toBe("$locale");
  });

  test("skips $ref nodes", () => {
    const node: AUPNode = {
      id: "w",
      type: "view",
      children: [
        { id: "h", type: "text", props: { content: "$locale" } },
        { $ref: "content" } as unknown as AUPNode,
      ],
    };
    const result = resolveAUPVariables(node, { locale: "zh" });
    expect((result.children![0] as AUPNode).props!.content).toBe("zh");
    expect((result.children![1] as any).$ref).toBe("content");
  });

  // ── Security ──

  test("variable values are NOT recursively resolved", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$locale" },
    };
    const result = resolveAUPVariables(node, { locale: "$theme" });
    expect(result.props!.content).toBe("$theme");
  });

  test("$locale does not match $t(locale)", () => {
    const node: AUPNode = {
      id: "t1",
      type: "text",
      props: { content: "$t(locale)" },
    };
    const result = resolveAUPVariables(node, { locale: "zh" });
    // $t() is a different system — resolveAUPVariables should NOT touch it
    expect(result.props!.content).toBe("$t(locale)");
  });

  // ── Events ──

  test("resolves $locale in events.click.href", () => {
    const node = {
      id: "btn",
      type: "action",
      props: { label: "Home" },
      events: { click: { href: "/sites/app/$locale/" } },
    } as unknown as AUPNode;
    const result = resolveAUPVariables(node, { locale: "zh" });
    expect((result.events as any).click.href).toBe("/sites/app/zh/");
    expect(result.props!.label).toBe("Home");
  });

  test("resolves $locale in nested event args", () => {
    const node: AUPNode = {
      id: "btn",
      type: "action",
      props: { label: "Go" },
      events: { click: { exec: "/nav", args: { url: "/app/$locale/page" } } },
    };
    const result = resolveAUPVariables(node, { locale: "ja" });
    expect(result.events!.click!.args!.url).toBe("/app/ja/page");
  });

  // ── Composability with resolveTranslations ──

  test("works correctly when chained with resolveTranslations", () => {
    const node: AUPNode = {
      id: "root",
      type: "view",
      children: [
        { id: "t1", type: "text", props: { content: "$t(greeting)" } },
        { id: "link", type: "action", props: { href: "/app/$locale/", label: "$t(nav.home)" } },
      ],
    };
    // First resolve translations, then variables
    const msgs = { greeting: "你好", "nav.home": "首页" };
    let result = resolveTranslations(node, msgs);
    result = resolveAUPVariables(result, { locale: "zh" });

    expect((result.children![0] as AUPNode).props!.content).toBe("你好");
    expect((result.children![1] as AUPNode).props!.href).toBe("/app/zh/");
    expect((result.children![1] as AUPNode).props!.label).toBe("首页");
  });
});
