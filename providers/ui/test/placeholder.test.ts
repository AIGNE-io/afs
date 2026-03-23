import { describe, expect, test } from "bun:test";

// Placeholder JS will export: _primaryProp, _saveOrigBindings, _applyPlaceholders
// We also need _surfaceBindField, _surfaceReplace, _surfaceBindDeep, _formatCell from existing code
import { FORMAT_CELL_JS } from "../src/web-page/renderers/format-cell.js";
import { PLACEHOLDER_JS } from "../src/web-page/renderers/placeholder.js";

// Extract placeholder functions from the JS string
const extractFns = new Function(`
  ${FORMAT_CELL_JS}
  ${PLACEHOLDER_JS}
  return { _primaryProp, _saveOrigBindings, _applyPlaceholders };
`)() as {
  _primaryProp: (type: string) => string | null;
  _saveOrigBindings: (node: Record<string, unknown>) => void;
  _applyPlaceholders: (node: Record<string, unknown>, designMode: boolean) => void;
};

const { _primaryProp, _saveOrigBindings, _applyPlaceholders } = extractFns;

// Helper: create a text node
function textNode(
  id: string,
  content: string,
  placeholder?: string | false,
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    id,
    type: "text",
    props: { content },
  };
  if (placeholder !== undefined) node.placeholder = placeholder;
  return node;
}

// Helper: create a media node
function mediaNode(id: string, src: string, placeholder?: string | false): Record<string, unknown> {
  const node: Record<string, unknown> = {
    id,
    type: "media",
    props: { src },
  };
  if (placeholder !== undefined) node.placeholder = placeholder;
  return node;
}

describe("placeholder + design/live mode", () => {
  // ── _primaryProp ──

  describe("_primaryProp", () => {
    test("text → content", () => {
      expect(_primaryProp("text")).toBe("content");
    });

    test("media → src", () => {
      expect(_primaryProp("media")).toBe("src");
    });

    test("view → null (container, no primary)", () => {
      expect(_primaryProp("view")).toBeNull();
    });

    test("action → null", () => {
      expect(_primaryProp("action")).toBeNull();
    });

    test("surface → null", () => {
      expect(_primaryProp("surface")).toBeNull();
    });
  });

  // ── _saveOrigBindings ──

  describe("_saveOrigBindings", () => {
    test("saves binding expression for text node", () => {
      const node = textNode("t1", "${content.subject}");
      _saveOrigBindings(node);
      expect((node as any)._origBinding).toBe("content.subject");
    });

    test("saves binding expression with pipe — strips pipe", () => {
      const node = textNode("t1", "${content.name|default:N/A}");
      _saveOrigBindings(node);
      expect((node as any)._origBinding).toBe("content.name");
    });

    test("saves binding expression for media node src", () => {
      const node = mediaNode("m1", "${content.imageUrl}");
      _saveOrigBindings(node);
      expect((node as any)._origBinding).toBe("content.imageUrl");
    });

    test("no binding in content — no _origBinding set", () => {
      const node = textNode("t1", "Static text");
      _saveOrigBindings(node);
      expect((node as any)._origBinding).toBeUndefined();
    });

    test("recurses into children", () => {
      const parent: Record<string, unknown> = {
        type: "view",
        children: [textNode("c1", "${content.title}"), textNode("c2", "${content.body}")],
      };
      _saveOrigBindings(parent);
      expect((parent as any)._origBinding).toBeUndefined(); // view has no primary
      expect(((parent.children as any[])[0] as any)._origBinding).toBe("content.title");
      expect(((parent.children as any[])[1] as any)._origBinding).toBe("content.body");
    });
  });

  // ── placeholder prop — live mode ──

  describe("placeholder prop — live mode", () => {
    test("binding has value → normal render, placeholder ignored", () => {
      const node = textNode("t1", "Hello World", "Placeholder text");
      _applyPlaceholders(node, false);
      expect((node.props as any).content).toBe("Hello World");
      expect((node as any)._aupPlaceholder).toBeUndefined();
      expect((node as any)._aupHidden).toBeUndefined();
    });

    test("binding empty + placeholder string → show placeholder + flag", () => {
      const node = textNode("t1", "", "No content available");
      _applyPlaceholders(node, false);
      expect((node.props as any).content).toBe("No content available");
      expect((node as any)._aupPlaceholder).toBe(true);
      expect((node as any)._aupHidden).toBeUndefined();
    });

    test("binding empty + placeholder: false → node hidden", () => {
      const node = textNode("t1", "", false);
      _applyPlaceholders(node, false);
      expect((node as any)._aupHidden).toBe(true);
      expect((node as any)._aupPlaceholder).toBeUndefined();
    });

    test("binding empty + no placeholder → node hidden (live mode default)", () => {
      const node = textNode("t1", "");
      _applyPlaceholders(node, false);
      expect((node as any)._aupHidden).toBe(true);
    });

    test("null content + no placeholder → node hidden", () => {
      const node: Record<string, unknown> = {
        id: "t1",
        type: "text",
        props: { content: null },
      };
      _applyPlaceholders(node, false);
      expect((node as any)._aupHidden).toBe(true);
    });

    test("primary content prop empty but other props have value → triggers placeholder (checks primary)", () => {
      const node = {
        id: "t1",
        type: "text" as const,
        props: { content: "", title: "Some Title" },
        placeholder: "Missing content",
      };
      _applyPlaceholders(node as any, false);
      expect((node.props as any).content).toBe("Missing content");
      expect((node as any)._aupPlaceholder).toBe(true);
    });

    test("primary content has value but other props empty → no placeholder (primary is fine)", () => {
      const node = {
        id: "t1",
        type: "text" as const,
        props: { content: "Main content", title: "" },
        placeholder: "Missing content",
      };
      _applyPlaceholders(node as any, false);
      expect((node.props as any).content).toBe("Main content");
      expect((node as any)._aupPlaceholder).toBeUndefined();
    });

    test("media node — empty src + placeholder → show placeholder", () => {
      const node = mediaNode("m1", "", "No image");
      _applyPlaceholders(node, false);
      expect((node.props as any).src).toBe("No image");
      expect((node as any)._aupPlaceholder).toBe(true);
    });

    test("media node — empty src + no placeholder → hidden", () => {
      const node = mediaNode("m1", "");
      _applyPlaceholders(node, false);
      expect((node as any)._aupHidden).toBe(true);
    });
  });

  // ── placeholder prop — design mode ──

  describe("placeholder prop — design mode", () => {
    test("binding empty + placeholder string → show placeholder (same as live)", () => {
      const node = textNode("t1", "", "Placeholder text");
      _applyPlaceholders(node, true);
      expect((node.props as any).content).toBe("Placeholder text");
      expect((node as any)._aupPlaceholder).toBe(true);
    });

    test("binding empty + no placeholder → auto-generate missing message with binding expr", () => {
      const node = textNode("t1", "");
      (node as any)._origBinding = "content.bodyHtml";
      _applyPlaceholders(node, true);
      expect((node.props as any).content).toBe("\u26a0 missing: content.bodyHtml");
      expect((node as any)._aupPlaceholder).toBe(true);
    });

    test("binding empty + no placeholder + no origBinding → fallback to prop name", () => {
      const node = textNode("t1", "");
      _applyPlaceholders(node, true);
      expect((node.props as any).content).toBe("\u26a0 missing: content");
      expect((node as any)._aupPlaceholder).toBe(true);
    });

    test("binding empty + placeholder: false → still hidden (explicit override)", () => {
      const node = textNode("t1", "", false);
      _applyPlaceholders(node, true);
      expect((node as any)._aupHidden).toBe(true);
      expect((node as any)._aupPlaceholder).toBeUndefined();
    });

    test("design mode flag propagates through recursion", () => {
      const parent: Record<string, unknown> = {
        type: "view",
        children: [textNode("c1", "")],
      };
      ((parent.children as any[])[0] as any)._origBinding = "content.title";
      _applyPlaceholders(parent, true);
      const child = (parent.children as any[])[0];
      expect(child.props.content).toBe("\u26a0 missing: content.title");
      expect(child._aupPlaceholder).toBe(true);
    });
  });

  // ── container/view nodes — never trigger placeholder ──

  describe("container nodes", () => {
    test("view node with empty props → no placeholder, no hidden", () => {
      const node = { type: "view", props: {} };
      _applyPlaceholders(node as any, false);
      expect((node as any)._aupHidden).toBeUndefined();
      expect((node as any)._aupPlaceholder).toBeUndefined();
    });

    test("surface node → no placeholder", () => {
      const node = { type: "surface", props: { src: "" } };
      _applyPlaceholders(node as any, false);
      expect((node as any)._aupHidden).toBeUndefined();
    });
  });

  // ── recursive behavior ──

  describe("recursive children processing", () => {
    test("processes nested children independently", () => {
      const parent: Record<string, unknown> = {
        type: "view",
        children: [
          textNode("c1", "Has content"),
          textNode("c2", "", "Placeholder for c2"),
          textNode("c3", ""),
        ],
      };
      _applyPlaceholders(parent, false);
      const children = parent.children as any[];
      // c1: has content → unchanged
      expect(children[0]._aupPlaceholder).toBeUndefined();
      expect(children[0]._aupHidden).toBeUndefined();
      // c2: empty + placeholder → shows placeholder
      expect(children[1].props.content).toBe("Placeholder for c2");
      expect(children[1]._aupPlaceholder).toBe(true);
      // c3: empty + no placeholder + live → hidden
      expect(children[2]._aupHidden).toBe(true);
    });
  });

  // ── integration: _saveOrigBindings + bind simulation + _applyPlaceholders ──

  describe("integration — saveOrigBindings + applyPlaceholders", () => {
    test("item.json recipe with placeholder props — missing field shows placeholder", () => {
      // Simulate a recipe node tree
      const recipe: Record<string, unknown> = {
        type: "view",
        children: [
          { ...textNode("subject", "${content.subject}"), placeholder: "No subject" },
          { ...textNode("body", "${content.bodyHtml}"), placeholder: "No HTML body" },
          textNode("from", "${content.from}"),
        ],
      };

      // Step 1: Save original bindings
      _saveOrigBindings(recipe);

      // Step 2: Simulate binding — subject exists, bodyHtml missing, from missing
      const children = recipe.children as any[];
      children[0].props.content = "Hello World"; // subject resolved
      children[1].props.content = ""; // bodyHtml missing
      children[2].props.content = ""; // from missing

      // Step 3: Apply placeholders (live mode)
      _applyPlaceholders(recipe, false);

      // subject: has value → normal
      expect(children[0].props.content).toBe("Hello World");
      expect(children[0]._aupPlaceholder).toBeUndefined();

      // bodyHtml: empty + placeholder string → shows placeholder
      expect(children[1].props.content).toBe("No HTML body");
      expect(children[1]._aupPlaceholder).toBe(true);

      // from: empty + no placeholder → hidden
      expect(children[2]._aupHidden).toBe(true);
    });

    test("same recipe, design mode vs live mode behaves differently", () => {
      const makeRecipe = () => ({
        type: "view",
        children: [textNode("body", "${content.bodyHtml}")],
      });

      // Live mode
      const liveRecipe = makeRecipe();
      _saveOrigBindings(liveRecipe);
      (liveRecipe.children as any[])[0].props.content = "";
      _applyPlaceholders(liveRecipe, false);
      expect((liveRecipe.children as any[])[0]._aupHidden).toBe(true);

      // Design mode
      const designRecipe = makeRecipe();
      _saveOrigBindings(designRecipe);
      (designRecipe.children as any[])[0].props.content = "";
      _applyPlaceholders(designRecipe, true);
      expect((designRecipe.children as any[])[0].props.content).toBe(
        "\u26a0 missing: content.bodyHtml",
      );
      expect((designRecipe.children as any[])[0]._aupPlaceholder).toBe(true);
    });
  });
});
