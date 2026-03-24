/**
 * resolveRelativeSrc — TDD tests for relative path resolution in AUP trees.
 *
 * Rules:
 * - src starting with "/" → absolute, leave unchanged
 * - src starting with "http" → external URL, leave unchanged
 * - src starting with "$" → template variable, leave unchanged
 * - everything else → relative, prepend "/" to make absolute in Runtime AFS
 *
 * Relative paths resolve to the Runtime AFS root (not the blocklet's global
 * mount path). This ensures `data/inbox` → `/data/inbox` works identically
 * in local daemon and worker environments.
 */

import { describe, expect, test } from "bun:test";
import { resolveRelativeSrc } from "../src/aup-app.js";

describe("resolveRelativeSrc", () => {
  describe("relative paths → prepend / for Runtime AFS root", () => {
    test("simple relative path", () => {
      const node = { id: "a", type: "afs-list", src: "data/inbox" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("/data/inbox");
    });

    test("nested relative path", () => {
      const node = { id: "a", type: "afs-list", src: "data/threads/thread-001" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("/data/threads/thread-001");
    });

    test("relative path with ./", () => {
      const node = { id: "a", type: "afs-list", src: "./data/inbox" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("/data/inbox");
    });
  });

  describe("absolute paths → leave unchanged", () => {
    test("absolute path starting with /", () => {
      const node = { id: "a", type: "afs-list", src: "/web/sites" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("/web/sites");
    });

    test("root path /", () => {
      const node = { id: "a", type: "explorer", src: "/" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("/");
    });
  });

  describe("external URLs → leave unchanged", () => {
    test("https URL", () => {
      const node = { id: "a", type: "media", src: "https://cdn.example.com/img.png" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("https://cdn.example.com/img.png");
    });

    test("http URL", () => {
      const node = { id: "a", type: "media", src: "http://localhost:3000/api" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("http://localhost:3000/api");
    });
  });

  describe("template variables → leave unchanged", () => {
    test("$args reference", () => {
      const node = { id: "a", type: "surface", src: "$args.path" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("$args.path");
    });

    test("${} template", () => {
      const node = { id: "a", type: "surface", src: "${content.path}" };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBe("${content.path}");
    });
  });

  describe("no src → unchanged", () => {
    test("node without src", () => {
      const node = { id: "a", type: "text", props: { content: "hello" } };
      const result = resolveRelativeSrc(node);
      expect(result.src).toBeUndefined();
    });
  });

  describe("recursive — resolves children", () => {
    test("resolves src in nested children", () => {
      const tree = {
        id: "root",
        type: "view",
        children: [
          { id: "list", type: "afs-list", src: "data/inbox" },
          {
            id: "panel",
            type: "view",
            children: [{ id: "detail", type: "surface", src: "data/inbox/msg-001.json" }],
          },
        ],
      };
      const result = resolveRelativeSrc(tree);
      expect((result.children![0] as any).src).toBe("/data/inbox");
      expect((result.children![1] as any).children[0].src).toBe("/data/inbox/msg-001.json");
    });

    test("preserves absolute src in children", () => {
      const tree = {
        id: "root",
        type: "view",
        children: [
          { id: "list", type: "afs-list", src: "/web/sites" },
          { id: "rel", type: "afs-list", src: "data/items" },
        ],
      };
      const result = resolveRelativeSrc(tree);
      expect((result.children![0] as any).src).toBe("/web/sites");
      expect((result.children![1] as any).src).toBe("/data/items");
    });
  });

  describe("props.src in events/set → leave unchanged (runtime resolved)", () => {
    test("does not modify event set.src with $args", () => {
      const tree = {
        id: "list",
        type: "afs-list",
        src: "data/inbox",
        events: { select: { target: "detail", set: { src: "$args.path" } } },
      };
      const result = resolveRelativeSrc(tree);
      expect(result.src).toBe("/data/inbox");
      // Event set.src is a template — not touched
      expect((result.events as any).select.set.src).toBe("$args.path");
    });
  });

  describe("edge cases", () => {
    test("does not mutate original node", () => {
      const node = { id: "a", type: "afs-list", src: "data/inbox" };
      const result = resolveRelativeSrc(node);
      expect(node.src).toBe("data/inbox");
      expect(result.src).toBe("/data/inbox");
    });
  });
});
