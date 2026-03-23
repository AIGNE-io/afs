import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSBaseProvider } from "../../src/provider/base.js";
import { Delete, List, Read, Search, Write } from "../../src/provider/decorators.js";
import type { RouteContext } from "../../src/provider/types.js";
import type { AFSEntry, AFSSearchOptions, AFSWriteEntryPayload } from "../../src/type.js";

/**
 * Simple FS Provider using AFSBaseProvider
 * Demonstrates the decorator-based routing pattern
 */
class SimpleFS extends AFSBaseProvider {
  readonly name = "simple-fs";
  readonly accessMode = "readwrite" as const;

  constructor(private basePath: string) {
    super();
  }

  @List("/")
  async listRoot(_ctx: RouteContext): Promise<{ data: AFSEntry[] }> {
    const items = await readdir(this.basePath);
    const entries: AFSEntry[] = [];

    for (const item of items) {
      const fullPath = join(this.basePath, item);
      const stats = await stat(fullPath);
      entries.push(
        this.buildEntry(`/${item}`, {
          meta: {
            childrenCount: stats.isDirectory() ? undefined : 0,
            size: stats.size,
          },
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
        }),
      );
    }

    return { data: entries };
  }

  @List("/**")
  async listDir(ctx: RouteContext): Promise<{ data: AFSEntry[] }> {
    try {
      const fullPath = join(this.basePath, ctx.path);
      const items = await readdir(fullPath);
      const entries: AFSEntry[] = [];

      for (const item of items) {
        const itemFullPath = join(fullPath, item);
        const stats = await stat(itemFullPath);
        entries.push(
          this.buildEntry(this.joinPath(ctx.path, item), {
            meta: {
              childrenCount: stats.isDirectory() ? undefined : 0,
              size: stats.size,
            },
            createdAt: stats.birthtime,
            updatedAt: stats.mtime,
          }),
        );
      }

      return { data: entries };
    } catch {
      return { data: [] };
    }
  }

  @Read("/**")
  async readFile(ctx: RouteContext): Promise<AFSEntry | undefined> {
    try {
      // Handle .meta paths
      if (ctx.path.endsWith("/.meta")) {
        return this.readMeta(ctx.path);
      }

      const fullPath = join(this.basePath, ctx.path);
      const stats = await stat(fullPath);

      let content: string | undefined;
      if (stats.isFile()) {
        content = await readFile(fullPath, "utf-8");
      }

      return this.buildEntry(ctx.path, {
        content,
        meta: {
          childrenCount: stats.isDirectory() ? undefined : 0,
          size: stats.size,
        },
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
      });
    } catch {
      return undefined;
    }
  }

  private async readMeta(metaPath: string): Promise<AFSEntry | undefined> {
    try {
      const nodePath = metaPath.replace(/\/?\.meta$/, "") || "/";
      const fullPath = join(this.basePath, nodePath);
      const stats = await stat(fullPath);

      return this.buildEntry(metaPath, {
        content: {
          type: stats.isDirectory() ? "directory" : "file",
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        },
      });
    } catch {
      return undefined;
    }
  }

  @Write("/**")
  async writeFile(ctx: RouteContext, payload: AFSWriteEntryPayload) {
    const fullPath = join(this.basePath, ctx.path);

    // Ensure parent directory exists
    const parentDir = join(fullPath, "..");
    await mkdir(parentDir, { recursive: true });

    const content =
      typeof payload.content === "string" ? payload.content : JSON.stringify(payload.content);

    await writeFile(fullPath, content, "utf-8");

    return { data: this.buildEntry(ctx.path, { content: payload.content }) };
  }

  @Delete("/**")
  async deleteFile(ctx: RouteContext) {
    const fullPath = join(this.basePath, ctx.path);
    await rm(fullPath, { recursive: true });
    return { message: `Deleted ${ctx.path}` };
  }

  @Search("/**")
  async searchFiles(ctx: RouteContext, query: string, _options?: AFSSearchOptions) {
    // Simple search implementation - find files containing query in name
    const searchDir = join(this.basePath, ctx.path === "/" ? "" : ctx.path);
    const items = await readdir(searchDir);
    const matches: AFSEntry[] = [];

    for (const item of items) {
      if (item.toLowerCase().includes(query.toLowerCase())) {
        matches.push(this.buildEntry(this.joinPath(ctx.path, item)));
      }
    }

    return { data: matches };
  }
}

describe("AFSBaseProvider E2E - SimpleFS", () => {
  let testDir: string;
  let provider: SimpleFS;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `afs-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });

    // Create test fixtures
    await mkdir(join(testDir, "subdir"));
    await writeFile(join(testDir, "file1.txt"), "Hello World");
    await writeFile(join(testDir, "file2.txt"), "Another file");
    await writeFile(join(testDir, "subdir", "nested.txt"), "Nested content");

    provider = new SimpleFS(testDir);
  });

  afterEach(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  describe("list()", () => {
    it("should list root directory contents", async () => {
      const result = await provider.list("/");
      expect(result.data).toHaveLength(3); // file1.txt, file2.txt, subdir
      expect(result.data.map((e) => e.path).sort()).toEqual([
        "/file1.txt",
        "/file2.txt",
        "/subdir",
      ]);
    });

    it("should list subdirectory contents", async () => {
      const result = await provider.list("/subdir");
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.path).toBe("/subdir/nested.txt");
    });

    it("should return childrenCount metadata", async () => {
      const result = await provider.list("/");
      const subdir = result.data.find((e) => e.path === "/subdir");
      const file = result.data.find((e) => e.path === "/file1.txt");

      expect(subdir?.meta?.childrenCount).toBeUndefined(); // directory has children
      expect(file?.meta?.childrenCount).toBe(0); // file has no children
    });

    it("should return empty for non-existent path", async () => {
      const result = await provider.list("/nonexistent");
      expect(result.data).toEqual([]);
    });
  });

  describe("read()", () => {
    it("should read file content", async () => {
      const result = await provider.read("/file1.txt");
      expect(result.data).toBeDefined();
      expect(result.data!.content).toBe("Hello World");
    });

    it("should read nested file", async () => {
      const result = await provider.read("/subdir/nested.txt");
      expect(result.data).toBeDefined();
      expect(result.data!.content).toBe("Nested content");
    });

    it("should read directory (no content)", async () => {
      const result = await provider.read("/subdir");
      expect(result.data).toBeDefined();
      expect(result.data!.content).toBeUndefined();
    });

    it("should read .meta path", async () => {
      const result = await provider.read("/file1.txt/.meta");
      expect(result.data).toBeDefined();
      expect(result.data!.content).toMatchObject({
        type: "file",
        size: expect.any(Number),
      });
    });

    it("should return undefined for non-existent file", async () => {
      const result = await provider.read("/nonexistent.txt");
      expect(result.data).toBeUndefined();
    });
  });

  describe("write()", () => {
    it("should create new file", async () => {
      const result = await provider.write("/new.txt", { content: "New content" });
      expect(result.data.path).toBe("/new.txt");

      // Verify file was created
      const readResult = await provider.read("/new.txt");
      expect(readResult.data!.content).toBe("New content");
    });

    it("should update existing file", async () => {
      await provider.write("/file1.txt", { content: "Updated content" });

      const result = await provider.read("/file1.txt");
      expect(result.data!.content).toBe("Updated content");
    });

    it("should create nested file with parent directories", async () => {
      await provider.write("/deep/nested/file.txt", { content: "Deep content" });

      const result = await provider.read("/deep/nested/file.txt");
      expect(result.data!.content).toBe("Deep content");
    });
  });

  describe("delete()", () => {
    it("should delete file", async () => {
      await provider.delete("/file1.txt");

      const result = await provider.read("/file1.txt");
      expect(result.data).toBeUndefined();
    });

    it("should delete directory recursively", async () => {
      await provider.delete("/subdir");

      const result = await provider.list("/subdir");
      expect(result.data).toEqual([]);
    });
  });

  describe("search()", () => {
    it("should find files matching query", async () => {
      const result = await provider.search("/", "file");
      expect(result.data).toHaveLength(2);
      expect(result.data.map((e) => e.path).sort()).toEqual(["/file1.txt", "/file2.txt"]);
    });

    it("should be case insensitive", async () => {
      const result = await provider.search("/", "FILE");
      expect(result.data).toHaveLength(2);
    });

    it("should return empty for no matches", async () => {
      const result = await provider.search("/", "xyz");
      expect(result.data).toHaveLength(0);
    });
  });

  describe("integration", () => {
    it("should support full CRUD workflow", async () => {
      // Create
      await provider.write("/workflow.txt", { content: "Initial" });

      // Read
      let result = await provider.read("/workflow.txt");
      expect(result.data!.content).toBe("Initial");

      // Update
      await provider.write("/workflow.txt", { content: "Updated" });
      result = await provider.read("/workflow.txt");
      expect(result.data!.content).toBe("Updated");

      // List
      const listResult = await provider.list("/");
      expect(listResult.data.some((e) => e.path === "/workflow.txt")).toBe(true);

      // Delete
      await provider.delete("/workflow.txt");
      result = await provider.read("/workflow.txt");
      expect(result.data).toBeUndefined();
    });
  });
});

describe("AFSBaseProvider E2E - Readonly Provider", () => {
  let testDir: string;

  class ReadonlyFS extends AFSBaseProvider {
    readonly name = "readonly-fs";
    readonly accessMode = "readonly" as const;

    constructor(private basePath: string) {
      super();
    }

    @List("/")
    async listRoot(): Promise<{ data: AFSEntry[] }> {
      const items = await readdir(this.basePath);
      return {
        data: items.map((item) => this.buildEntry(`/${item}`)),
      };
    }

    @Read("/**")
    async readFile(ctx: RouteContext): Promise<AFSEntry> {
      const fullPath = join(this.basePath, ctx.path);
      const content = await readFile(fullPath, "utf-8");
      return this.buildEntry(ctx.path, { content });
    }
  }

  beforeEach(async () => {
    testDir = join(tmpdir(), `afs-e2e-readonly-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "test.txt"), "Test content");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should allow read operations", async () => {
    const provider = new ReadonlyFS(testDir);

    const listResult = await provider.list("/");
    expect(listResult.data).toHaveLength(1);

    const readResult = await provider.read("/test.txt");
    expect(readResult.data!.content).toBe("Test content");
  });

  it("should not have write method when no write routes registered", () => {
    const provider = new ReadonlyFS(testDir);
    // ReadonlyFS has no @Write decorator, so write method should not exist
    expect(provider.write).toBeUndefined();
  });

  it("should not have delete method when no delete routes registered", () => {
    const provider = new ReadonlyFS(testDir);
    // ReadonlyFS has no @Delete decorator, so delete method should not exist
    expect(provider.delete).toBeUndefined();
  });

  it("should not have exec method when no exec routes registered", () => {
    const provider = new ReadonlyFS(testDir);
    // ReadonlyFS has no @Exec decorator, so exec method should not exist
    expect(provider.exec).toBeUndefined();
  });
});

describe("AFSBaseProvider E2E - Pagination", () => {
  class PaginatedProvider extends AFSBaseProvider {
    readonly name = "paginated";
    readonly accessMode = "readonly" as const;

    private items = Array.from({ length: 100 }, (_, i) => ({
      id: String(i + 1),
      name: `Item ${i + 1}`,
    }));

    @List("/")
    async listItems(ctx: RouteContext): Promise<{ data: AFSEntry[]; total?: number }> {
      const opts = ctx.options as { offset?: number; limit?: number } | undefined;
      const offset = opts?.offset || 0;
      const limit = opts?.limit || 10;

      const sliced = this.items.slice(offset, offset + limit);
      const data = sliced.map((item) =>
        this.buildEntry(`/${item.id}`, { id: item.id, content: item }),
      );

      // Only set total if there's more data
      const hasMore = offset + limit < this.items.length;
      return {
        data,
        total: hasMore ? this.items.length : undefined,
      };
    }
  }

  it("should support offset/limit pagination", async () => {
    const provider = new PaginatedProvider();

    // First page
    const page1 = await provider.list("/", { offset: 0, limit: 10 });
    expect(page1.data).toHaveLength(10);
    expect(page1.data[0]?.path).toBe("/1");
    expect(page1.total).toBe(100);

    // Second page
    const page2 = await provider.list("/", { offset: 10, limit: 10 });
    expect(page2.data).toHaveLength(10);
    expect(page2.data[0]?.path).toBe("/11");
    expect(page2.total).toBe(100);

    // Last page (no total since all data returned)
    const lastPage = await provider.list("/", { offset: 90, limit: 20 });
    expect(lastPage.data).toHaveLength(10);
    expect(lastPage.total).toBeUndefined();
  });

  it("should default to first page if no options", async () => {
    const provider = new PaginatedProvider();

    const result = await provider.list("/");
    expect(result.data).toHaveLength(10);
    expect(result.data[0]?.path).toBe("/1");
  });

  it("should not apply offset twice when handler already paginates", async () => {
    const provider = new PaginatedProvider();

    const result = await provider.list("/", { offset: 5, limit: 10 });
    expect(result.data).toHaveLength(10);
    expect(result.data[0]?.path).toBe("/6");
    expect(result.data[9]?.path).toBe("/15");
  });
});
