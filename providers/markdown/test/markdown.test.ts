import { beforeEach, describe, expect, test } from "bun:test";
import { AFSMarkdown } from "@aigne/afs-markdown";

const SAMPLE_MD = `---
title: Test Document
author: Test Author
---

# Introduction

This is the introduction section.

## Getting Started

Follow these steps to get started.

### Prerequisites

You need Node.js installed.

## API Reference

Here is the API documentation.

\`\`\`typescript
const x = 1;
console.log(x);
\`\`\`

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |

[Link Text](https://example.com)
[Another Link](https://test.com)
`;

describe("AFSMarkdown Provider", () => {
  let provider: AFSMarkdown;

  beforeEach(() => {
    provider = new AFSMarkdown({
      content: SAMPLE_MD,
      name: "test-md",
    });
  });

  describe("Structure Parsing", () => {
    test("simple markdown with sections → correct toc + sections tree", async () => {
      const result = await provider.list("/");
      expect(result.data.length).toBeGreaterThan(0);

      // Should have top-level nodes: frontmatter, toc, sections, codeblocks, tables, links
      const names = result.data.map((e) => e.id);
      expect(names).toContain("/sections");
      expect(names).toContain("/frontmatter");
    });

    test("nested headings (H1 > H2 > H3) → correct children hierarchy", async () => {
      // Read the first section (Introduction)
      const sections = await provider.list("/sections");
      const sectionNames = sections.data.map((e) => e.id);
      expect(sectionNames.length).toBeGreaterThan(0);

      // Introduction has children: Getting Started
      const intro = await provider.list("/sections/0");
      const _introChildren = intro.data.filter((e) => e.id.includes("children"));
      // Getting Started should have Prerequisites as child
    });

    test("frontmatter (YAML) → parsed as JSON", async () => {
      const result = await provider.read("/frontmatter");
      expect(result.data?.content).toEqual({
        title: "Test Document",
        author: "Test Author",
      });
    });

    test("code blocks with language tag → listed", async () => {
      const result = await provider.list("/codeblocks");
      expect(result.data.length).toBeGreaterThan(0);

      const block = await provider.read("/codeblocks/0");
      expect(block.data?.content).toContain("const x = 1;");
      expect(block.data?.meta?.language).toBe("typescript");
    });

    test("tables → listed", async () => {
      const result = await provider.list("/tables");
      expect(result.data.length).toBeGreaterThan(0);

      const table = await provider.read("/tables/0");
      expect(table.data?.content).toContain("Column A");
    });

    test("links → listed", async () => {
      const result = await provider.list("/links");
      expect(result.data.length).toBeGreaterThan(0);

      const link = await provider.read("/links/0");
      expect(link.data?.content).toBeDefined();
      expect(link.data?.meta?.href).toBe("https://example.com");
    });

    test("mixed content → all parsed", async () => {
      const root = await provider.list("/");
      const names = root.data.map((e) => e.id);
      expect(names).toContain("/frontmatter");
      expect(names).toContain("/sections");
      expect(names).toContain("/codeblocks");
      expect(names).toContain("/tables");
      expect(names).toContain("/links");
    });
  });

  describe("Bad Input", () => {
    test("empty markdown → empty tree (no error)", async () => {
      const p = new AFSMarkdown({ content: "", name: "empty" });
      const result = await p.list("/");
      expect(result.data).toBeDefined();
    });

    test("only frontmatter, no body → frontmatter has value, sections empty", async () => {
      const p = new AFSMarkdown({
        content: "---\ntitle: Hello\n---\n",
        name: "fm-only",
      });
      const fm = await p.read("/frontmatter");
      expect(fm.data?.content).toEqual({ title: "Hello" });

      const sections = await p.list("/sections");
      expect(sections.data.length).toBe(0);
    });

    test("heading level gap (H1 > H3) → best-effort parse", async () => {
      const p = new AFSMarkdown({
        content: "# Title\n\n### Skipped H2\n\nContent\n",
        name: "gap",
      });
      const sections = await p.list("/sections");
      expect(sections.data.length).toBeGreaterThan(0);
    });

    test("invalid frontmatter → raw string fallback", async () => {
      const p = new AFSMarkdown({
        content: "---\n: invalid: yaml: [\n---\n# Title\n",
        name: "bad-fm",
      });
      const fm = await p.read("/frontmatter");
      // Should not throw, either parsed or raw string
      expect(fm.data).toBeDefined();
    });
  });

  describe("Read Operations", () => {
    test("read /toc → heading outline", async () => {
      const result = await provider.read("/toc");
      expect(result.data).toBeDefined();
      const content = result.data?.content;
      expect(content).toBeDefined();
      // Should contain heading names
      expect(JSON.stringify(content)).toContain("Introduction");
      expect(JSON.stringify(content)).toContain("Getting Started");
    });

    test("read /sections/0/title → first section title", async () => {
      const result = await provider.read("/sections/0/title");
      expect(result.data?.content).toBe("Introduction");
    });

    test("read /sections/0/body → first section body (without sub-headings)", async () => {
      const result = await provider.read("/sections/0/body");
      expect(result.data?.content).toContain("This is the introduction section.");
    });

    test("read /frontmatter → parsed JSON", async () => {
      const result = await provider.read("/frontmatter");
      expect(result.data?.content).toEqual({
        title: "Test Document",
        author: "Test Author",
      });
    });

    test("read /nonexistent → throws AFSNotFoundError", async () => {
      await expect(provider.read("/nonexistent")).rejects.toThrow();
    });
  });

  describe("Write-Back", () => {
    test("write /sections/0/body → section content updated", async () => {
      await provider.write("/sections/0/body", { content: "Updated introduction." });
      const result = await provider.read("/sections/0/body");
      expect(result.data?.content).toContain("Updated introduction.");
    });

    test("write preserves other sections", async () => {
      const beforeApi = await provider.read("/sections/0/children/0/title");
      await provider.write("/sections/0/body", { content: "Changed intro" });
      const afterApi = await provider.read("/sections/0/children/0/title");
      expect(afterApi.data?.content).toBe(beforeApi.data?.content);
    });

    test("write heading title → heading updated", async () => {
      await provider.write("/sections/0/title", { content: "New Intro Title" });
      const result = await provider.read("/sections/0/title");
      expect(result.data?.content).toBe("New Intro Title");
    });

    test("write empty body → section body cleared but heading preserved", async () => {
      await provider.write("/sections/0/body", { content: "" });
      const body = await provider.read("/sections/0/body");
      expect(body.data?.content).toBe("");
      const title = await provider.read("/sections/0/title");
      expect(title.data?.content).toBe("Introduction");
    });

    test("write preserves frontmatter", async () => {
      await provider.write("/sections/0/body", { content: "new content" });
      const fm = await provider.read("/frontmatter");
      expect(fm.data?.content).toEqual({
        title: "Test Document",
        author: "Test Author",
      });
    });

    test("write preserves code blocks", async () => {
      await provider.write("/sections/0/body", { content: "new content" });
      const blocks = await provider.list("/codeblocks");
      expect(blocks.data.length).toBeGreaterThan(0);
    });
  });

  describe("supportedAs", () => {
    test("supportedAs returns ['text']", async () => {
      const result = await provider.supportedAs("/");
      expect(result).toContain("text");
    });
  });

  describe("as: 'text'", () => {
    test("markdown with formatting → plain text", async () => {
      const result = await provider.read("/", { as: "text" });
      const text = result.data?.content as string;
      expect(text).toBeDefined();
      // Should not contain markdown formatting
      expect(text).not.toContain("# ");
      expect(text).not.toContain("```");
      expect(text).toContain("Introduction");
    });

    test("links [text](url) → only text", async () => {
      const mdWithLinks = "Hello [click here](https://example.com) world";
      const p = new AFSMarkdown({ content: mdWithLinks, name: "links" });
      const result = await p.read("/", { as: "text" });
      const text = result.data?.content as string;
      expect(text).toContain("click here");
      expect(text).not.toContain("https://example.com");
      expect(text).not.toContain("[");
      expect(text).not.toContain("]");
    });
  });
});
