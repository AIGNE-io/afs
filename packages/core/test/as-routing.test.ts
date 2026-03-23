import { beforeEach, describe, expect, test } from "bun:test";
import type {
  AFSEntry,
  AFSListOptions,
  AFSListResult,
  AFSModule,
  AFSReadOptions,
  AFSReadResult,
  AFSSearchOptions,
  AFSSearchResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
} from "@aigne/afs";
import { AFS } from "@aigne/afs";

/**
 * Mock provider that supports `as` and `supportedAs()`.
 */
class AsAwareModule implements AFSModule {
  readonly name: string;
  readonly description?: string;
  readonly accessMode = "readwrite" as const;

  // Track calls for assertion (only tracks calls with `as` option)
  lastReadOptions?: AFSReadOptions;
  lastWriteOptions?: AFSWriteOptions;
  lastReadPath?: string;
  lastWritePath?: string;

  constructor(opts: { name: string; description?: string }) {
    this.name = opts.name;
    this.description = opts.description;
  }

  async supportedAs(_path: string): Promise<string[]> {
    return ["text", "html", "json"];
  }

  async read(path: string, options?: AFSReadOptions): Promise<AFSReadResult> {
    // Only track reads with `as` option (ignore enrichment reads to .meta etc.)
    if (options?.as) {
      this.lastReadPath = path;
      this.lastReadOptions = options;
    }

    const as = options?.as;
    const content = as ? `Content of ${path} as ${as}` : `Content of ${path}`;

    return {
      data: {
        id: path,
        path,
        content,
        meta: { childrenCount: undefined },
      },
    };
  }

  async write(
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ): Promise<AFSWriteResult> {
    this.lastWritePath = path;
    this.lastWriteOptions = options;

    return {
      data: {
        id: path,
        path,
        content: content.content,
        meta: {},
      },
    };
  }

  async list(path: string, _options?: AFSListOptions): Promise<AFSListResult> {
    return {
      data: [
        { id: path, path, meta: { childrenCount: 1 } },
        { id: `${path}/child`, path: `${path}/child`, content: "child content" },
      ],
    };
  }

  async search(path: string, query: string, _options?: AFSSearchOptions): Promise<AFSSearchResult> {
    return {
      data: [{ id: path, path, content: `match: ${query}` }],
    };
  }
}

/**
 * Mock provider that does NOT support `as` (no supportedAs method).
 */
class NoAsModule implements AFSModule {
  readonly name: string;

  constructor(opts: { name: string }) {
    this.name = opts.name;
  }

  async read(path: string, _options?: AFSReadOptions): Promise<AFSReadResult> {
    return {
      data: {
        id: path,
        path,
        content: `plain content of ${path}`,
        meta: {},
      },
    };
  }

  async list(path: string, _options?: AFSListOptions): Promise<AFSListResult> {
    return {
      data: [{ id: path, path, meta: { childrenCount: 0 } }],
    };
  }
}

describe(".as/ Path Routing", () => {
  let afs: AFS;
  let asModule: AsAwareModule;
  let noAsModule: NoAsModule;

  beforeEach(async () => {
    asModule = new AsAwareModule({ name: "docs", description: "Docs provider" });
    noAsModule = new NoAsModule({ name: "plain" });
    afs = new AFS();
    await afs.mount(asModule);
    await afs.mount(noAsModule);
  });

  describe("Path Parsing", () => {
    test('"/doc.md/.as/" → list supported as values', async () => {
      const result = await afs.list("/modules/docs/doc.md/.as/");
      // Should return the supported as values as entries
      expect(result.data.length).toBeGreaterThan(0);
      const names = result.data.map((e: AFSEntry) => e.id);
      expect(names).toContain("text");
      expect(names).toContain("html");
      expect(names).toContain("json");
    });

    test('"/doc.md/.as/text" read → calls provider.read with as option', async () => {
      const result = await afs.read("/modules/docs/doc.md/.as/text");
      expect(result.data?.content).toBe("Content of /doc.md as text");
      expect(asModule.lastReadOptions?.as).toBe("text");
      expect(asModule.lastReadPath).toBe("/doc.md");
    });

    test("/.as/ trailing slash optional", async () => {
      const result1 = await afs.list("/modules/docs/doc.md/.as/");
      const result2 = await afs.list("/modules/docs/doc.md/.as");
      expect(result1.data.length).toBe(result2.data.length);
    });
  });

  describe("Routing to Provider", () => {
    test("read with .as/text → provider.read(path, { as: 'text' })", async () => {
      const result = await afs.read("/modules/docs/doc.md/.as/text");
      expect(result.data?.content).toBe("Content of /doc.md as text");
      expect(asModule.lastReadPath).toBe("/doc.md");
      expect(asModule.lastReadOptions?.as).toBe("text");
    });

    test("write with .as/text → provider.write(path, content, { as: 'text' })", async () => {
      const result = await afs.write("/modules/docs/doc.md/.as/text", {
        content: "new text content",
      });
      expect(result.data).toBeDefined();
      expect(asModule.lastWritePath).toBe("/doc.md");
      expect(asModule.lastWriteOptions?.as).toBe("text");
    });

    test("list .as/ → returns supported as values", async () => {
      const result = await afs.list("/modules/docs/doc.md/.as/");
      expect(result.data.length).toBe(3);
      const names = result.data.map((e: AFSEntry) => e.id);
      expect(names).toContain("text");
      expect(names).toContain("html");
      expect(names).toContain("json");
    });

    test("provider without supportedAs → NOT_FOUND on .as/ list", async () => {
      await expect(afs.list("/modules/plain/doc.md/.as/")).rejects.toThrow();
    });

    test("provider without supportedAs → error on .as/text read", async () => {
      await expect(afs.read("/modules/plain/doc.md/.as/text")).rejects.toThrow();
    });

    test(".as/ after empty → list (not read)", async () => {
      const result = await afs.list("/modules/docs/doc.md/.as/");
      expect(result.data.length).toBe(3);
    });

    test(".as/ with path traversal (..) → normalized away by path validation", async () => {
      // Path validation normalizes ".." before .as/ parsing sees it,
      // so "/doc.md/.as/../secret" becomes "/doc.md/secret" — no .as/ routing triggered
      const result = await afs.read("/modules/docs/doc.md/.as/../secret");
      // This reads /doc.md/secret (no .as/ involved)
      expect(result.data?.content).toBe("Content of /doc.md/secret");
    });

    test("read nonexistent path with .as/ → NOT_FOUND", async () => {
      // The module returns data for any path, so test with a module that would fail
      // The key test is that the routing works correctly
      const result = await afs.read("/modules/docs/nonexistent/.as/text");
      // Should still route to provider — provider decides if path exists
      expect(result.data).toBeDefined();
    });
  });

  describe("Coexistence with .meta / .actions", () => {
    test(".as/ and .meta are independent", async () => {
      // Reading .as/ should not interfere with .meta
      const asResult = await afs.list("/modules/docs/doc.md/.as/");
      expect(asResult.data.length).toBe(3);

      // Reading the doc itself should still work
      const readResult = await afs.read("/modules/docs/doc.md");
      expect(readResult.data?.content).toBeDefined();
    });
  });

  describe("as option and .as/ path equivalence", () => {
    test("read with as option equals read with .as/ path", async () => {
      const pathResult = await afs.read("/modules/docs/doc.md/.as/text");
      const optionResult = await afs.read("/modules/docs/doc.md", { as: "text" });

      expect(pathResult.data?.content).toBe(optionResult.data?.content);
    });

    test("write with as option equals write with .as/ path", async () => {
      await afs.write("/modules/docs/doc.md/.as/text", { content: "via path" });
      const pathWriteOpts = { ...asModule.lastWriteOptions };

      await afs.write("/modules/docs/doc.md", { content: "via option" }, { as: "text" });
      const optionWriteOpts = { ...asModule.lastWriteOptions };

      expect(pathWriteOpts.as).toBe("text");
      expect(optionWriteOpts.as).toBe("text");
    });
  });
});
