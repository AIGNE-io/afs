import type {
  AFSEntry,
  AFSExplainOptions,
  AFSExplainResult,
  AFSListResult,
  AFSSearchOptions,
  AFSStatResult,
  AFSWriteEntryPayload,
  ProviderTreeSchema,
} from "@aigne/afs";
import { AFSNotFoundError } from "@aigne/afs";
import {
  AFSBaseProvider,
  Explain,
  List,
  Meta,
  Read,
  type RouteContext,
  Search,
  Stat,
  Write,
} from "@aigne/afs/provider";
import { joinURL } from "ufo";
import { parse as parseYAML } from "yaml";

export interface AFSMarkdownOptions {
  /** Markdown content string */
  content: string;
  /** Provider name */
  name?: string;
  /** Description */
  description?: string;
}

interface Section {
  level: number;
  title: string;
  /** Body text (content between this heading and the next heading at same or higher level) */
  body: string;
  /** Line index in original source where the heading appears */
  headingLineIndex: number;
  /** Line index where the body starts */
  bodyStartLineIndex: number;
  /** Line index where the body ends (exclusive) */
  bodyEndLineIndex: number;
  children: Section[];
}

interface CodeBlock {
  language: string;
  content: string;
  startLine: number;
  endLine: number;
}

interface TableInfo {
  content: string;
  startLine: number;
  endLine: number;
}

interface LinkInfo {
  text: string;
  href: string;
  line: number;
}

interface ParsedMarkdown {
  frontmatter: Record<string, unknown> | string | null;
  sections: Section[];
  codeblocks: CodeBlock[];
  tables: TableInfo[];
  links: LinkInfo[];
  /** All lines of the document (after frontmatter) */
  lines: string[];
  /** Raw frontmatter text (including delimiters) or empty */
  rawFrontmatter: string;
}

function parseMarkdown(raw: string): ParsedMarkdown {
  const result: ParsedMarkdown = {
    frontmatter: null,
    sections: [],
    codeblocks: [],
    tables: [],
    links: [],
    lines: [],
    rawFrontmatter: "",
  };

  if (!raw || !raw.trim()) {
    return result;
  }

  let content = raw;

  // Parse frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmMatch) {
    result.rawFrontmatter = fmMatch[0];
    const fmBody = fmMatch[1]!;
    try {
      const parsed = parseYAML(fmBody);
      result.frontmatter = typeof parsed === "object" && parsed !== null ? parsed : fmBody;
    } catch {
      result.frontmatter = fmBody;
    }
    content = content.slice(fmMatch[0].length);
  }

  const lines = content.split("\n");
  result.lines = lines;

  // Single pass: track code block regions, extract code blocks, and collect headings
  const inCodeBlock: boolean[] = new Array(lines.length).fill(false);
  let insideCode = false;
  let codeStart = -1;
  let codeLang = "";
  const flatSections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.match(/^```/)) {
      inCodeBlock[i] = true;
      if (insideCode) {
        result.codeblocks.push({
          language: codeLang,
          content: lines.slice(codeStart + 1, i).join("\n"),
          startLine: codeStart,
          endLine: i,
        });
        insideCode = false;
      } else {
        insideCode = true;
        codeStart = i;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (insideCode) {
      inCodeBlock[i] = true;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flatSections.push({
        level: headingMatch[1]!.length,
        title: headingMatch[2]!.trim(),
        body: "",
        headingLineIndex: i,
        bodyStartLineIndex: i + 1,
        bodyEndLineIndex: i + 1,
        children: [],
      });
    }
  }

  // Calculate body ranges and extract body text
  for (let i = 0; i < flatSections.length; i++) {
    const current = flatSections[i]!;
    const next = flatSections[i + 1];
    current.bodyEndLineIndex = next ? next.headingLineIndex : lines.length;
    const bodyLines = lines.slice(current.bodyStartLineIndex, current.bodyEndLineIndex);
    current.body = trimEmptyLines(bodyLines.join("\n"));
  }

  // Build hierarchy
  result.sections = buildSectionTree(flatSections);

  // Parse tables
  let tableStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (inCodeBlock[i]) continue;
    const line = lines[i]!;
    const isTableLine = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableLine) {
      if (tableStart === -1) tableStart = i;
    } else {
      if (tableStart !== -1) {
        const tableLines = lines.slice(tableStart, i);
        result.tables.push({
          content: tableLines.join("\n"),
          startLine: tableStart,
          endLine: i - 1,
        });
        tableStart = -1;
      }
    }
  }
  // Handle table at end of file
  if (tableStart !== -1) {
    result.tables.push({
      content: lines.slice(tableStart).join("\n"),
      startLine: tableStart,
      endLine: lines.length - 1,
    });
  }

  // Parse links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (let i = 0; i < lines.length; i++) {
    if (inCodeBlock[i]) continue;
    let match: RegExpExecArray | null;
    // biome-ignore lint: assignment in condition is intentional for regex iteration
    while ((match = linkRegex.exec(lines[i]!)) !== null) {
      result.links.push({
        text: match[1]!,
        href: match[2]!,
        line: i,
      });
    }
  }

  return result;
}

function trimEmptyLines(s: string): string {
  return s.replace(/^\n+/, "").replace(/\n+$/, "");
}

function buildSectionTree(flat: Section[]): Section[] {
  const root: Section[] = [];
  const stack: Section[] = [];

  for (const section of flat) {
    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1]!.level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(section);
    } else {
      stack[stack.length - 1]!.children.push(section);
    }
    stack.push(section);
  }

  return root;
}

function sectionChildrenCount(section: Section): number {
  return 2 + (section.children.length > 0 ? 1 : 0); // title, body, children?
}

function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  for (const s of sections) {
    result.push(s);
    if (s.children.length > 0) {
      result.push(...flattenSections(s.children));
    }
  }
  return result;
}

/**
 * Build a TOC (Table of Contents) from sections.
 */
function buildToc(sections: Section[]): Array<{ level: number; title: string; index: number }> {
  const flat = flattenSections(sections);
  return flat.map((s, i) => ({ level: s.level, title: s.title, index: i }));
}

/**
 * Strip markdown formatting to produce plain text.
 */
function stripMarkdown(md: string): string {
  let text = md;

  // Remove frontmatter
  text = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

  // Remove code fences (keep content)
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, "$1");

  // Remove headings (keep text)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1");

  // Remove bold/italic
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/_(.+?)_/g, "$1");

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, "$1");

  // Replace links [text](url) with just text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // Remove table formatting (pipes and alignment)
  text = text.replace(/^\|[-:| ]+\|$/gm, ""); // separator rows
  text = text.replace(/\|/g, " ");

  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Navigate to a section by index path like "/sections/0/children/1".
 */
function navigateSection(sections: Section[], segments: string[]): Section | undefined {
  if (segments.length === 0) return undefined;

  const index = Number.parseInt(segments[0]!, 10);
  if (Number.isNaN(index) || index < 0 || index >= sections.length) return undefined;

  const section = sections[index]!;

  if (segments.length === 1) return section;

  // Navigate deeper
  const rest = segments.slice(1);
  if (rest[0] === "children") {
    return navigateSection(section.children, rest.slice(1));
  }

  return section; // Will be handled by the caller for title/body
}

/**
 * AFSMarkdown — exposes markdown content as a navigable AFS tree.
 *
 * Tree structure:
 * /frontmatter       — parsed YAML frontmatter (or null)
 * /toc               — heading outline
 * /sections/          — array of sections
 * /sections/0/title   — section heading text
 * /sections/0/body    — section body content
 * /sections/0/children/ — sub-sections
 * /codeblocks/        — code blocks
 * /codeblocks/0       — first code block content
 * /tables/            — tables
 * /tables/0           — first table content
 * /links/             — links
 * /links/0            — first link
 */
export class AFSMarkdown extends AFSBaseProvider {
  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "write", "search", "stat", "explain"],
      tree: {
        "/": { kind: "markdown:root" },
        "/frontmatter": { kind: "markdown:frontmatter" },
        "/toc": { kind: "markdown:toc" },
        "/sections/{index}": { kind: "markdown:section" },
        "/sections/{index}/title": { kind: "markdown:title" },
        "/sections/{index}/body": { kind: "markdown:body" },
        "/codeblocks/{index}": { kind: "markdown:codeblock" },
        "/tables/{index}": { kind: "markdown:table" },
        "/links/{index}": { kind: "markdown:link" },
      },
      auth: { type: "none" },
      bestFor: ["markdown document navigation", "section editing", "content extraction"],
      notFor: ["binary files", "large datasets"],
    };
  }

  readonly name: string;
  readonly description?: string;
  override readonly accessMode = "readwrite" as const;

  private rawContent: string;
  private parsed: ParsedMarkdown;

  constructor(options: AFSMarkdownOptions) {
    super();
    this.name = options.name ?? "markdown";
    this.description = options.description;
    this.rawContent = options.content;
    this.parsed = parseMarkdown(options.content);
  }

  async supportedAs(_path: string): Promise<string[]> {
    return ["text"];
  }

  // ========== List Handlers ==========

  @List("/")
  async listRoot(_ctx: RouteContext): Promise<AFSListResult> {
    const entries: AFSEntry[] = [];
    if (this.parsed.frontmatter !== null) {
      entries.push(this.buildEntry("/frontmatter", { meta: {} }));
    }
    entries.push(this.buildEntry("/toc", { meta: {} }));
    entries.push(
      this.buildEntry("/sections", { meta: { childrenCount: this.parsed.sections.length } }),
    );
    entries.push(
      this.buildEntry("/codeblocks", { meta: { childrenCount: this.parsed.codeblocks.length } }),
    );
    entries.push(
      this.buildEntry("/tables", { meta: { childrenCount: this.parsed.tables.length } }),
    );
    entries.push(this.buildEntry("/links", { meta: { childrenCount: this.parsed.links.length } }));
    return { data: entries };
  }

  @List("/:path*")
  async listCatchAll(ctx: RouteContext<{ path: string }>): Promise<AFSListResult> {
    const p = joinURL("/", ctx.params.path);

    if (p === "/sections") {
      return {
        data: this.parsed.sections.map((s, i) =>
          this.buildEntry(`/sections/${i}`, {
            meta: {
              childrenCount: sectionChildrenCount(s),
              description: s.title,
            },
          }),
        ),
      };
    }

    // /sections/0, /sections/0/children, etc.
    const sectionsMatch = p.match(/^\/sections\/(.+)$/);
    if (sectionsMatch) {
      const segments = sectionsMatch[1]!.split("/");
      // Check if last segment is "children"
      if (segments[segments.length - 1] === "children") {
        const parentSegments = segments.slice(0, -1);
        const section = navigateSection(this.parsed.sections, parentSegments);
        if (!section) return { data: [] };
        return {
          data: section.children.map((c, i) => {
            const childPath = `/sections/${parentSegments.join("/")}/children/${i}`;
            return this.buildEntry(childPath, {
              meta: {
                childrenCount: sectionChildrenCount(c),
                description: c.title,
              },
            });
          }),
        };
      }

      // "title" and "body" are leaf nodes — no children to list
      if (segments[segments.length - 1] === "title" || segments[segments.length - 1] === "body") {
        return { data: [] };
      }

      // List a specific section's children: title, body, children
      const section = navigateSection(this.parsed.sections, segments);
      if (!section) return { data: [] };
      const sectionPath = `/sections/${segments.join("/")}`;
      const entries: AFSEntry[] = [
        this.buildEntry(joinURL(sectionPath, "title"), { meta: {} }),
        this.buildEntry(joinURL(sectionPath, "body"), { meta: {} }),
      ];
      if (section.children.length > 0) {
        entries.push(
          this.buildEntry(joinURL(sectionPath, "children"), {
            meta: { childrenCount: section.children.length },
          }),
        );
      }
      return { data: entries };
    }

    if (p === "/codeblocks") {
      return {
        data: this.parsed.codeblocks.map((cb, i) =>
          this.buildEntry(`/codeblocks/${i}`, {
            meta: { language: cb.language },
          }),
        ),
      };
    }

    if (p === "/tables") {
      return {
        data: this.parsed.tables.map((_, i) => this.buildEntry(`/tables/${i}`, { meta: {} })),
      };
    }

    if (p === "/links") {
      return {
        data: this.parsed.links.map((l, i) =>
          this.buildEntry(`/links/${i}`, {
            meta: { href: l.href },
          }),
        ),
      };
    }

    // Check if path is a valid leaf node (no children to list, but path exists)
    const entry = this.readContent(p);
    if (entry) {
      return { data: [] };
    }

    throw new AFSNotFoundError(p);
  }

  // ========== Read Handlers ==========

  @Read("/.meta/.capabilities")
  async readCapabilities(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    const operations = ["list", "read", "write", "stat", "explain", "search"];

    return this.buildEntry("/.meta/.capabilities", {
      content: {
        schemaVersion: 1,
        provider: this.name,
        description: this.description || "Markdown virtual filesystem",
        tools: [],
        actions: [],
        operations: this.getOperationsDeclaration(),
      },
      meta: { kind: "afs:capabilities", operations },
    });
  }

  @Read("/:path*")
  async readCatchAll(ctx: RouteContext<{ path?: string }>): Promise<AFSEntry | undefined> {
    const p = ctx.params.path ? joinURL("/", ctx.params.path) : "/";
    const options = ctx.options as { as?: string } | undefined;

    // Handle as: "text" — return plain text version
    if (options?.as === "text") {
      if (p === "/") {
        return this.buildEntry("/", { content: stripMarkdown(this.rawContent) });
      }
      // Read the base content first, then strip markdown
      const baseEntry = await this.readContent(p);
      if (!baseEntry) return undefined;
      const rawContent =
        typeof baseEntry.content === "string"
          ? baseEntry.content
          : JSON.stringify(baseEntry.content);
      return {
        ...baseEntry,
        content: stripMarkdown(rawContent),
      };
    }

    if (p === "/") {
      return this.buildEntry("/", { meta: { childrenCount: -1 } });
    }

    const entry = this.readContent(p);
    if (!entry) {
      throw new AFSNotFoundError(p);
    }
    return entry;
  }

  /**
   * Internal read logic (no "as" processing).
   */
  private readContent(p: string): AFSEntry | undefined {
    if (p === "/frontmatter") {
      if (this.parsed.frontmatter === null) {
        return undefined;
      }
      return this.buildEntry("/frontmatter", {
        content: this.parsed.frontmatter,
        meta: { kind: "markdown:frontmatter" },
      });
    }

    if (p === "/toc") {
      return this.buildEntry("/toc", {
        content: buildToc(this.parsed.sections),
        meta: { kind: "markdown:toc" },
      });
    }

    // Directory-like reads for top-level collections
    if (p === "/sections") {
      return this.buildEntry("/sections", {
        meta: { childrenCount: this.parsed.sections.length, kind: "markdown:sections" },
      });
    }
    if (p === "/codeblocks") {
      return this.buildEntry("/codeblocks", {
        meta: { childrenCount: this.parsed.codeblocks.length, kind: "markdown:codeblocks" },
      });
    }
    if (p === "/tables") {
      return this.buildEntry("/tables", {
        meta: { childrenCount: this.parsed.tables.length, kind: "markdown:tables" },
      });
    }
    if (p === "/links") {
      return this.buildEntry("/links", {
        meta: { childrenCount: this.parsed.links.length, kind: "markdown:links" },
      });
    }

    // /sections/...
    const sectionsMatch = p.match(/^\/sections\/(.+)$/);
    if (sectionsMatch) {
      const segments = sectionsMatch[1]!.split("/");
      const lastSegment = segments[segments.length - 1];

      if (lastSegment === "title" || lastSegment === "body") {
        const parentSegments = segments.slice(0, -1);
        const section = navigateSection(this.parsed.sections, parentSegments);
        if (!section) return undefined;

        const content = lastSegment === "title" ? section.title : section.body;
        const kind = lastSegment === "title" ? "markdown:title" : "markdown:body";
        return this.buildEntry(p, { content, meta: { kind } });
      }

      // Check if last segment is "children"
      if (lastSegment === "children") {
        const parentSegments = segments.slice(0, -1);
        const section = navigateSection(this.parsed.sections, parentSegments);
        if (!section) return undefined;
        return this.buildEntry(p, {
          meta: { childrenCount: section.children.length, kind: "markdown:children" },
        });
      }

      // Reading a section itself
      const section = navigateSection(this.parsed.sections, segments);
      if (!section) return undefined;

      return this.buildEntry(p, {
        meta: {
          kind: "markdown:section",
          childrenCount: sectionChildrenCount(section),
          title: section.title,
        },
      });
    }

    // /codeblocks/N, /tables/N, /links/N
    const indexedMatch = p.match(/^\/(codeblocks|tables|links)\/(\d+)$/);
    if (indexedMatch) {
      const [, collection, indexStr] = indexedMatch;
      const index = Number.parseInt(indexStr!, 10);

      if (collection === "codeblocks") {
        const cb = this.parsed.codeblocks[index];
        if (!cb) return undefined;
        return this.buildEntry(p, {
          content: cb.content,
          meta: { kind: "markdown:codeblock", language: cb.language },
        });
      }
      if (collection === "tables") {
        const table = this.parsed.tables[index];
        if (!table) return undefined;
        return this.buildEntry(p, {
          content: table.content,
          meta: { kind: "markdown:table" },
        });
      }
      // links
      const link = this.parsed.links[index];
      if (!link) return undefined;
      return this.buildEntry(p, {
        content: link.text,
        meta: { kind: "markdown:link", href: link.href },
      });
    }

    return undefined;
  }

  // ========== Meta Handler ==========

  @Meta("/:path*")
  async metaCatchAll(ctx: RouteContext<{ path?: string }>): Promise<AFSEntry | undefined> {
    const p = ctx.params.path ? joinURL("/", ctx.params.path) : "/";
    const metaPath = joinURL(p, ".meta");

    if (p === "/") {
      return this.buildEntry(metaPath, {
        meta: { childrenCount: this.countRootChildren() },
        content: { childrenCount: this.countRootChildren() },
      });
    }

    // Try to read the node to get its meta
    const entry = this.readContent(p);
    if (entry) {
      return this.buildEntry(metaPath, {
        meta: entry.meta ?? undefined,
        content: entry.meta ?? {},
      });
    }

    // Check if it's a listable directory
    const listResult = await this.listCatchAll({
      path: p,
      params: { path: p.slice(1) },
      options: {},
    } as RouteContext<{ path: string }>);

    if (listResult.data.length > 0) {
      return this.buildEntry(metaPath, {
        meta: { childrenCount: listResult.data.length },
        content: { childrenCount: listResult.data.length },
      });
    }

    throw new AFSNotFoundError(p);
  }

  // ========== Write Handler ==========

  @Write("/:path*")
  async writeCatchAll(
    ctx: RouteContext<{ path: string }>,
    payload: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    const p = joinURL("/", ctx.params.path);
    const content = payload.content as string;

    const sectionsMatch = p.match(/^\/sections\/(.+)$/);
    if (!sectionsMatch) {
      throw new Error(`Write not supported for path: ${p}`);
    }

    const segments = sectionsMatch[1]!.split("/");
    const lastSegment = segments[segments.length - 1];

    if (lastSegment !== "title" && lastSegment !== "body") {
      throw new Error("Write only supported for /sections/.../title or /sections/.../body");
    }

    const parentSegments = segments.slice(0, -1);
    const section = navigateSection(this.parsed.sections, parentSegments);
    if (!section) {
      throw new Error(`Section not found: ${p}`);
    }

    // Modify the raw content
    const lines = this.rawContent.split("\n");
    const fmLineCount = this.parsed.rawFrontmatter
      ? this.parsed.rawFrontmatter.split("\n").length - 1
      : 0;

    if (lastSegment === "title") {
      const headingLine = fmLineCount + section.headingLineIndex;
      const hashes = "#".repeat(section.level);
      lines[headingLine] = `${hashes} ${content}`;
      section.title = content;
    } else {
      // body
      const bodyStart = fmLineCount + section.bodyStartLineIndex;
      const bodyEnd = fmLineCount + section.bodyEndLineIndex;
      // Replace body lines
      const newBodyLines = content === "" ? [""] : ["", content, ""];
      lines.splice(bodyStart, bodyEnd - bodyStart, ...newBodyLines);
      section.body = content;
    }

    // Rebuild
    this.rawContent = lines.join("\n");
    this.parsed = parseMarkdown(this.rawContent);

    return {
      data: this.buildEntry(p, { content, meta: {} }),
    };
  }

  // ========== Search Handler ==========

  @Search("/:path*")
  async searchCatchAll(
    _ctx: RouteContext<{ path?: string }>,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<{ data: AFSEntry[]; message?: string }> {
    const results: AFSEntry[] = [];
    const limit = options?.limit ?? 100;
    const caseSensitive = options?.caseSensitive ?? false;
    const q = caseSensitive ? query : query.toLowerCase();

    const matches = (text: string): boolean => {
      const t = caseSensitive ? text : text.toLowerCase();
      return t.includes(q);
    };

    // Search sections
    const allSections = flattenSections(this.parsed.sections);
    for (const section of allSections) {
      if (results.length >= limit) break;
      if (matches(section.title) || matches(section.body)) {
        results.push(
          this.buildEntry(`/sections/${allSections.indexOf(section)}`, {
            content: section.title,
            meta: { kind: "markdown:section", title: section.title },
          }),
        );
      }
    }

    // Search codeblocks
    for (let i = 0; i < this.parsed.codeblocks.length && results.length < limit; i++) {
      const cb = this.parsed.codeblocks[i]!;
      if (matches(cb.content) || matches(cb.language)) {
        results.push(
          this.buildEntry(`/codeblocks/${i}`, {
            content: cb.content,
            meta: { kind: "markdown:codeblock", language: cb.language },
          }),
        );
      }
    }

    // Search tables
    for (let i = 0; i < this.parsed.tables.length && results.length < limit; i++) {
      const table = this.parsed.tables[i]!;
      if (matches(table.content)) {
        results.push(
          this.buildEntry(`/tables/${i}`, {
            content: table.content,
            meta: { kind: "markdown:table" },
          }),
        );
      }
    }

    // Search links
    for (let i = 0; i < this.parsed.links.length && results.length < limit; i++) {
      const link = this.parsed.links[i]!;
      if (matches(link.text) || matches(link.href)) {
        results.push(
          this.buildEntry(`/links/${i}`, {
            content: link.text,
            meta: { kind: "markdown:link", href: link.href },
          }),
        );
      }
    }

    return {
      data: results,
      message: `Found ${results.length} result(s) for "${query}"`,
    };
  }

  // ========== Stat Handler ==========

  @Stat("/:path*")
  async statCatchAll(ctx: RouteContext<{ path?: string }>): Promise<AFSStatResult> {
    const p = ctx.params.path ? joinURL("/", ctx.params.path) : "/";

    if (p === "/") {
      return {
        data: {
          id: "/",
          path: "/",
          meta: {
            childrenCount: this.countRootChildren(),
          },
        },
      };
    }

    // Check if the path is valid by trying to read it
    const entry = this.readContent(p);
    if (!entry) {
      // Check if it's a listable directory
      const listResult = await this.listCatchAll({
        path: p,
        params: { path: p.slice(1) },
        options: {},
      } as RouteContext<{ path: string }>);
      if (listResult.data.length === 0) {
        throw new AFSNotFoundError(p);
      }
      return {
        data: {
          id: p,
          path: p,
          meta: { childrenCount: listResult.data.length },
        },
      };
    }

    return {
      data: {
        id: entry.id,
        path: entry.path,
        meta: entry.meta,
      },
    };
  }

  // ========== Explain Handler ==========

  @Explain("/:path*")
  async explainCatchAll(ctx: RouteContext<{ path?: string }>): Promise<AFSExplainResult> {
    const p = ctx.params.path ? joinURL("/", ctx.params.path) : "/";
    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";

    const lines: string[] = [];

    if (format === "markdown") {
      if (p === "/") {
        lines.push("# Markdown Document");
        lines.push("");
        lines.push("This provider exposes a parsed markdown document as a navigable tree.");
        lines.push("");
        lines.push("## Structure");
        lines.push("");
        lines.push(`- **/frontmatter** — Parsed YAML frontmatter`);
        lines.push(`- **/toc** — Table of contents`);
        lines.push(`- **/sections** — ${this.parsed.sections.length} top-level section(s)`);
        lines.push(`- **/codeblocks** — ${this.parsed.codeblocks.length} code block(s)`);
        lines.push(`- **/tables** — ${this.parsed.tables.length} table(s)`);
        lines.push(`- **/links** — ${this.parsed.links.length} link(s)`);
      } else if (p === "/frontmatter") {
        lines.push("# Frontmatter");
        lines.push("");
        lines.push("Parsed YAML frontmatter from the document header.");
      } else if (p === "/toc") {
        lines.push("# Table of Contents");
        lines.push("");
        lines.push("Heading outline of the document.");
      } else if (p.startsWith("/sections")) {
        const segments = p
          .replace(/^\/sections\/?/, "")
          .split("/")
          .filter(Boolean);
        if (segments.length === 0) {
          lines.push("# Sections");
          lines.push("");
          lines.push(`${this.parsed.sections.length} top-level section(s).`);
        } else {
          const section = navigateSection(
            this.parsed.sections,
            segments.filter((s) => s !== "children"),
          );
          if (section) {
            lines.push(`# Section: ${section.title}`);
            lines.push("");
            lines.push(`**Level:** H${section.level}`);
            lines.push(`**Children:** ${section.children.length} subsection(s)`);
          } else {
            lines.push(`# ${p}`);
            lines.push("");
            lines.push("Section path within the document.");
          }
        }
      } else if (p.startsWith("/codeblocks")) {
        lines.push("# Code Blocks");
        lines.push("");
        lines.push(`${this.parsed.codeblocks.length} code block(s) in the document.`);
      } else if (p.startsWith("/tables")) {
        lines.push("# Tables");
        lines.push("");
        lines.push(`${this.parsed.tables.length} table(s) in the document.`);
      } else if (p.startsWith("/links")) {
        lines.push("# Links");
        lines.push("");
        lines.push(`${this.parsed.links.length} link(s) in the document.`);
      } else {
        throw new AFSNotFoundError(p);
      }
    }

    return {
      content: lines.join("\n"),
      format,
    };
  }

  // ========== Public API ==========

  /**
   * Get the current raw markdown content (useful for persistence).
   */
  getRawContent(): string {
    return this.rawContent;
  }

  // ========== Private Helpers ==========

  private countRootChildren(): number {
    let count = 0;
    if (this.parsed.frontmatter !== null) count++;
    count++; // toc
    count++; // sections
    count++; // codeblocks
    count++; // tables
    count++; // links
    return count;
  }
}
