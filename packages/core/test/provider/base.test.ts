import { beforeEach, describe, expect, it } from "bun:test";
import { AFSBaseProvider } from "../../src/provider/base.js";
import {
  Actions,
  Delete,
  Exec,
  List,
  Meta,
  Read,
  Search,
  Stat,
  Write,
} from "../../src/provider/decorators.js";
import type { RouteContext } from "../../src/provider/types.js";
import type { AFSEntry, AFSWriteEntryPayload } from "../../src/type.js";

// Test provider implementation
class TestProvider extends AFSBaseProvider {
  readonly name = "test";
  readonly accessMode = "readwrite" as const;

  private data: Map<string, any> = new Map([
    [
      "users",
      [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
        { id: "3", name: "Charlie" },
      ],
    ],
    [
      "posts",
      [
        { id: "1", title: "Hello" },
        { id: "2", title: "World" },
      ],
    ],
  ]);

  @List("/")
  async listTables(_ctx: RouteContext): Promise<{ data: AFSEntry[] }> {
    const tables = Array.from(this.data.keys());
    return {
      data: tables.map((name) =>
        this.buildEntry(`/${name}`, { meta: { childrenCount: this.data.get(name)?.length } }),
      ),
    };
  }

  @List("/:table")
  async listRows(
    ctx: RouteContext<{ table: string }>,
  ): Promise<{ data: AFSEntry[]; total?: number }> {
    const opts = ctx.options as { offset?: number; limit?: number } | undefined;
    const { offset = 0, limit = 1000 } = opts || {};
    const rows = this.data.get(ctx.params.table) || [];
    const sliced = rows.slice(offset, offset + limit);
    return {
      data: sliced.map((row: any) =>
        this.buildEntry(`/${ctx.params.table}/${row.id}`, {
          content: row,
          meta: { childrenCount: 0 },
        }),
      ),
      total: sliced.length < rows.length ? rows.length : undefined,
    };
  }

  @Read("/:table/:pk")
  async getRow(ctx: RouteContext<{ table: string; pk: string }>): Promise<AFSEntry> {
    const rows = this.data.get(ctx.params.table) || [];
    const row = rows.find((r: any) => r.id === ctx.params.pk);
    if (!row) {
      throw new Error(`Not found: ${ctx.path}`);
    }
    return this.buildEntry(ctx.path, { content: row, meta: { childrenCount: 0 } });
  }

  @Write("/:table/:pk")
  async updateRow(ctx: RouteContext<{ table: string; pk: string }>, content: AFSWriteEntryPayload) {
    const rows = this.data.get(ctx.params.table) || [];
    const index = rows.findIndex((r: any) => r.id === ctx.params.pk);
    if (index >= 0) {
      rows[index] = { ...rows[index], ...content.content };
    } else {
      rows.push({ id: ctx.params.pk, ...content.content });
    }
    return {
      data: this.buildEntry(ctx.path, { content: rows[index >= 0 ? index : rows.length - 1] }),
    };
  }

  @Delete("/:table/:pk")
  async deleteRow(ctx: RouteContext<{ table: string; pk: string }>) {
    const rows = this.data.get(ctx.params.table) || [];
    const index = rows.findIndex((r: any) => r.id === ctx.params.pk);
    if (index >= 0) {
      rows.splice(index, 1);
    }
    return { message: "Deleted" };
  }

  @Meta("/:table/:pk")
  async getRowMeta(ctx: RouteContext<{ table: string; pk: string }>): Promise<AFSEntry> {
    return this.buildEntry(`${ctx.path}`, {
      content: { schema: { id: "string", name: "string" } },
      meta: { childrenCount: 0 },
    });
  }

  @Actions("/:table/:pk")
  async listRowActions(
    ctx: RouteContext<{ table: string; pk: string }>,
  ): Promise<{ data: AFSEntry[] }> {
    return {
      data: [
        this.buildEntry(`${ctx.path}/delete`, { meta: { kind: "action" } }),
        this.buildEntry(`${ctx.path}/duplicate`, { meta: { kind: "action" } }),
      ],
    };
  }

  @Search("/:table")
  async searchTable(ctx: RouteContext<{ table: string }>, query: string) {
    const rows = this.data.get(ctx.params.table) || [];
    const matches = rows.filter((r: any) =>
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
    );
    return {
      data: matches.map((row: any) =>
        this.buildEntry(`/${ctx.params.table}/${row.id}`, { content: row }),
      ),
    };
  }

  @Exec("/:table/:pk/.actions/:action")
  async execAction(
    ctx: RouteContext<{ table: string; pk: string; action: string }>,
    args: Record<string, unknown>,
  ) {
    return { success: true, data: { action: ctx.params.action, args } };
  }
}

// Readonly provider for testing access mode
class ReadonlyProvider extends AFSBaseProvider {
  readonly name = "readonly";
  readonly accessMode = "readonly" as const;

  @List("/")
  async listRoot() {
    return { data: [] };
  }

  @Read("/:path")
  async readPath(ctx: RouteContext<{ path: string }>) {
    return { id: "1", path: ctx.path };
  }
}

describe("AFSBaseProvider", () => {
  let provider: TestProvider;
  let readonlyProvider: ReadonlyProvider;

  beforeEach(() => {
    provider = new TestProvider();
    readonlyProvider = new ReadonlyProvider();
  });

  describe("constructor", () => {
    it("should collect routes from decorators", () => {
      // If constructor worked, list should work
      expect(provider.name).toBe("test");
    });
  });

  describe("list()", () => {
    it("should list root entries", async () => {
      const result = await provider.list("/");
      expect(result.data).toHaveLength(2);
      expect(result.data.map((e) => e.path)).toContain("/users");
      expect(result.data.map((e) => e.path)).toContain("/posts");
    });

    it("should list table rows", async () => {
      const result = await provider.list("/users");
      expect(result.data).toHaveLength(3);
    });

    it("should support pagination with offset/limit", async () => {
      const result = await provider.list("/users", { offset: 1, limit: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.content.name).toBe("Bob");
      expect(result.total).toBe(3); // Total is set because there's more data
    });

    it("should not set total when all data is returned", async () => {
      const result = await provider.list("/users", { limit: 100 });
      expect(result.data).toHaveLength(3);
      expect(result.total).toBeUndefined();
    });

    it("should return empty array for non-matching path", async () => {
      const result = await provider.list("/nonexistent");
      expect(result.data).toEqual([]);
    });

    describe("maxDepth=0", () => {
      it("should return empty array", async () => {
        const result = await provider.list("/", { maxDepth: 0 });
        expect(result.data).toHaveLength(0);
      });

      it("should return empty array for subdirectory", async () => {
        const result = await provider.list("/users", { maxDepth: 0 });
        expect(result.data).toHaveLength(0);
      });

      it("should not include self node", async () => {
        const result = await provider.list("/", { maxDepth: 0 });
        expect(result.data).toHaveLength(0);
      });

      it("should not leak children information", async () => {
        const result = await provider.list("/", { maxDepth: 0 });
        expect(result.data).toHaveLength(0);
      });

      it("should be a read-only operation (no state change)", async () => {
        const before = await provider.list("/users", { maxDepth: 1 });
        await provider.list("/users", { maxDepth: 0 });
        const after = await provider.list("/users", { maxDepth: 1 });
        expect(after.data.length).toBe(before.data.length);
      });

      it("maxDepth=0 + pattern should still return empty array", async () => {
        const result = await provider.list("/", { maxDepth: 0, pattern: "*.ts" });
        expect(result.data).toHaveLength(0);
      });

      it("maxDepth=undefined should default to 1 (not 0)", async () => {
        const result = await provider.list("/");
        // Default maxDepth=1 should return children, not empty
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data.some((e) => e.path === "/users" || e.path === "/posts")).toBe(true);
      });

      it("should not throw for non-existent path", async () => {
        // maxDepth=0 returns empty array immediately, no route matching needed
        const result = await provider.list("/users/1", { maxDepth: 0 });
        expect(result.data).toHaveLength(0);
      });
    });
  });

  describe("read()", () => {
    it("should read a single entry", async () => {
      const result = await provider.read("/users/1");
      expect(result.data).toBeDefined();
      expect(result.data!.content.name).toBe("Alice");
    });

    it("should throw for non-existent entry", async () => {
      await expect(provider.read("/users/999")).rejects.toThrow("Not found");
    });

    it("should read .meta path via @Meta decorator", async () => {
      const result = await provider.read("/users/1/.meta");
      expect(result.data).toBeDefined();
      expect(result.data!.content.schema).toBeDefined();
    });
  });

  describe("write()", () => {
    it("should write an entry", async () => {
      const result = await provider.write("/users/1", { content: { name: "Alice Updated" } });
      expect(result.data.path).toBe("/users/1");

      // Verify the write
      const read = await provider.read("/users/1");
      expect(read.data!.content.name).toBe("Alice Updated");
    });

    it("should create new entry if not exists", async () => {
      await provider.write("/users/99", { content: { name: "New User" } });
      const read = await provider.read("/users/99");
      expect(read.data!.content.name).toBe("New User");
    });

    it("should not exist on provider without write routes", () => {
      // ReadonlyProvider has no @Write decorator, so write method should not exist
      expect(readonlyProvider.write).toBeUndefined();
    });
  });

  describe("delete()", () => {
    it("should delete an entry", async () => {
      await provider.delete("/users/1");
      await expect(provider.read("/users/1")).rejects.toThrow("Not found");
    });

    it("should not exist on provider without delete routes", () => {
      // ReadonlyProvider has no @Delete decorator, so delete method should not exist
      expect(readonlyProvider.delete).toBeUndefined();
    });
  });

  describe("search()", () => {
    it("should search entries", async () => {
      const result = await provider.search("/users", "alice");
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.content.name).toBe("Alice");
    });

    it("should return empty for no matches", async () => {
      const result = await provider.search("/users", "nonexistent");
      expect(result.data).toHaveLength(0);
    });
  });

  describe("exec()", () => {
    it("should execute an action", async () => {
      const result = await provider.exec("/users/1/.actions/delete", { confirm: true });
      expect(result.success).toBe(true);
      expect(result.data?.action).toBe("delete");
      expect((result.data?.args as Record<string, unknown>)?.confirm).toBe(true);
    });

    it("should not exist on provider without exec routes", () => {
      // ReadonlyProvider has no @Exec decorator, so exec method should not exist
      expect(readonlyProvider.exec).toBeUndefined();
    });
  });

  describe("utility methods", () => {
    it("normalizePath should handle various inputs", () => {
      // @ts-ignore - accessing protected method for testing
      expect(provider.normalizePath("/")).toBe("/");
      // @ts-ignore
      expect(provider.normalizePath("/users/")).toBe("/users");
      // @ts-ignore
      expect(provider.normalizePath("users")).toBe("/users");
      // @ts-ignore
      expect(provider.normalizePath("")).toBe("/");
    });

    it("joinPath should join segments correctly", () => {
      // @ts-ignore
      expect(provider.joinPath("/users", "1")).toBe("/users/1");
      // @ts-ignore
      expect(provider.joinPath("/", "users")).toBe("/users");
      // @ts-ignore
      expect(provider.joinPath("/users", "/posts")).toBe("/users/posts");
    });

    it("buildEntry should create valid AFSEntry", () => {
      // @ts-ignore
      const entry = provider.buildEntry("/test", {
        content: { foo: "bar" },
        meta: { childrenCount: 0 },
      });
      expect(entry.id).toBe("/test"); // id defaults to normalized path
      expect(entry.path).toBe("/test");
      expect(entry.content).toEqual({ foo: "bar" });
      expect(entry.meta?.childrenCount).toBe(0);
      expect(entry.createdAt).toBeUndefined(); // no fake timestamps
      expect(entry.updatedAt).toBeUndefined();
    });
  });
});

describe("AFSBaseProvider maxDepth=0 with stat support", () => {
  class StatProvider extends AFSBaseProvider {
    readonly name = "stat-test";
    readonly accessMode = "readonly" as const;

    @List("/")
    async listRoot() {
      return {
        data: [
          this.buildEntry("/docs", { meta: { childrenCount: 3 } }),
          this.buildEntry("/src", { meta: { childrenCount: 5 } }),
        ],
      };
    }

    @List("/:dir")
    async listDir(ctx: RouteContext<{ dir: string }>) {
      return {
        data: [this.buildEntry(`/${ctx.params.dir}/file1`, { meta: { childrenCount: 0 } })],
      };
    }

    @Stat("/")
    async statRoot() {
      const entry = this.buildEntry("/", {
        meta: { childrenCount: 2, kind: "stat-test:root" },
      });
      entry.summary = "Root directory";
      return { data: entry };
    }

    @Stat("/:dir")
    async statDir(ctx: RouteContext<{ dir: string }>) {
      const entry = this.buildEntry(`/${ctx.params.dir}`, {
        meta: { childrenCount: 1, kind: "stat-test:dir" },
      });
      entry.summary = `Directory ${ctx.params.dir}`;
      return { data: entry };
    }
  }

  it("maxDepth=0 should return empty array (not use stat)", async () => {
    const provider = new StatProvider();
    const result = await provider.list("/", { maxDepth: 0 });
    expect(result.data).toHaveLength(0);
  });

  it("maxDepth=0 on subdirectory should return empty array", async () => {
    const provider = new StatProvider();
    const result = await provider.list("/docs", { maxDepth: 0 });
    expect(result.data).toHaveLength(0);
  });

  it("maxDepth=0 should not return any data", async () => {
    const provider = new StatProvider();
    const result = await provider.list("/", { maxDepth: 0 });
    expect(result.data).toHaveLength(0);
  });

  it("maxDepth=0 result should not contain any paths", async () => {
    const provider = new StatProvider();
    const result = await provider.list("/", { maxDepth: 0 });
    expect(result.data).toHaveLength(0);
  });

  it("negative maxDepth should default to normal behavior (not crash)", async () => {
    const provider = new StatProvider();
    // Negative maxDepth should be treated like default (maxDepth=1)
    const result = await provider.list("/", { maxDepth: -1 });
    expect(result.data).toBeInstanceOf(Array);
  });
});

describe("AFSBaseProvider with wildcards", () => {
  class WildcardProvider extends AFSBaseProvider {
    readonly name = "wildcard";
    readonly accessMode = "readwrite" as const;

    @List("/**")
    async listAll(ctx: RouteContext) {
      return { data: [this.buildEntry(`${ctx.path}/child`)] };
    }

    @Read("/**")
    async readAll(ctx: RouteContext) {
      return this.buildEntry(ctx.path, { content: `Content of ${ctx.path}` });
    }
  }

  it("should match wildcard patterns", async () => {
    const provider = new WildcardProvider();

    const list = await provider.list("/any/deep/path");
    expect(list.data).toHaveLength(1);

    const read = await provider.read("/some/other/path");
    expect(read.data!.content).toBe("Content of /some/other/path");
  });
});

describe("AFSBaseProvider with handleDepth option", () => {
  // Provider that handles depth itself (opt-in behavior)
  class SelfHandleDepthProvider extends AFSBaseProvider {
    readonly name = "self-depth";
    readonly accessMode = "readonly" as const;

    listCallCount = 0;

    @List("/**", { handleDepth: true }) // Handler manages depth
    async listItems(ctx: RouteContext) {
      this.listCallCount++;
      const opts = ctx.options as { maxDepth?: number } | undefined;
      const maxDepth = opts?.maxDepth ?? 1;

      // Handler implements its own depth logic
      const entries = [this.buildEntry("/a", { meta: { childrenCount: 2 } })];

      if (maxDepth > 1) {
        entries.push(
          this.buildEntry("/a/b", { meta: { childrenCount: 1 } }),
          this.buildEntry("/a/c", { meta: { childrenCount: 0 } }),
        );
      }

      if (maxDepth > 2) {
        entries.push(this.buildEntry("/a/b/d", { meta: { childrenCount: 0 } }));
      }

      return { data: entries };
    }
  }

  // Provider that delegates depth handling to base provider (default behavior)
  class DelegateDepthProvider extends AFSBaseProvider {
    readonly name = "delegate-depth";
    readonly accessMode = "readonly" as const;

    listCallCount = 0;

    @List("/**") // handleDepth defaults to false - base provider handles depth
    async listItems(ctx: RouteContext) {
      this.listCallCount++;
      const path = ctx.path;

      // Always returns single-level results
      if (path === "/") {
        return {
          data: [this.buildEntry("/a", { meta: { childrenCount: 2 } })],
        };
      }
      if (path === "/a") {
        return {
          data: [
            this.buildEntry("/a/b", { meta: { childrenCount: 1 } }),
            this.buildEntry("/a/c", { meta: { childrenCount: 0 } }),
          ],
        };
      }
      if (path === "/a/b") {
        return {
          data: [this.buildEntry("/a/b/d", { meta: { childrenCount: 0 } })],
        };
      }
      return { data: [] };
    }
  }

  describe("handleDepth: true (opt-in)", () => {
    it("should call handler once with maxDepth passed through", async () => {
      const provider = new SelfHandleDepthProvider();

      const result = await provider.list("/", { maxDepth: 3 });

      // Handler called once
      expect(provider.listCallCount).toBe(1);
      // Handler returned all levels
      expect(result.data).toHaveLength(4);
      expect(result.data.map((e) => e.path)).toEqual(["/a", "/a/b", "/a/c", "/a/b/d"]);
    });

    it("should respect maxDepth=1", async () => {
      const provider = new SelfHandleDepthProvider();

      const result = await provider.list("/", { maxDepth: 1 });

      expect(provider.listCallCount).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.path).toBe("/a");
    });
  });

  describe("handleDepth: false (default)", () => {
    it("should expand depth via base provider BFS", async () => {
      const provider = new DelegateDepthProvider();

      const result = await provider.list("/", { maxDepth: 3 });

      // Base provider calls handler multiple times for BFS expansion
      expect(provider.listCallCount).toBeGreaterThan(1);
      // Results should include entries from all levels
      expect(result.data.length).toBeGreaterThan(1);
    });

    it("should only call handler once for maxDepth=1", async () => {
      const provider = new DelegateDepthProvider();

      const result = await provider.list("/", { maxDepth: 1 });

      // Only single level requested, handler called once
      expect(provider.listCallCount).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.path).toBe("/a");
    });

    it("should default to maxDepth=1 when not specified", async () => {
      const provider = new DelegateDepthProvider();

      const result = await provider.list("/");

      expect(provider.listCallCount).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });

  describe("childrenCount semantics in BFS expansion", () => {
    // Provider that returns entries with various childrenCount values
    class ChildrenCountTestProvider extends AFSBaseProvider {
      readonly name = "childrencount-test";
      readonly accessMode = "readonly" as const;

      expandedPaths: string[] = [];

      @List("/**")
      async listItems(ctx: RouteContext) {
        this.expandedPaths.push(ctx.path);
        const path = ctx.path;

        if (path === "/") {
          return {
            data: [
              // childrenCount > 0: should expand
              this.buildEntry("/dir-with-count", { meta: { childrenCount: 2 } }),
              // childrenCount = -1: should expand (unknown count)
              this.buildEntry("/dir-unknown-count", { meta: { childrenCount: -1 } }),
              // childrenCount = 0: should NOT expand (leaf)
              this.buildEntry("/leaf-zero", { meta: { childrenCount: 0 } }),
              // childrenCount = undefined: should NOT expand (leaf per Protocol)
              this.buildEntry("/leaf-undefined", { meta: {} }),
            ],
          };
        }

        if (path === "/dir-with-count") {
          return {
            data: [
              this.buildEntry("/dir-with-count/child1", { meta: { childrenCount: 0 } }),
              this.buildEntry("/dir-with-count/child2", { meta: { childrenCount: 0 } }),
            ],
          };
        }

        if (path === "/dir-unknown-count") {
          return {
            data: [this.buildEntry("/dir-unknown-count/child", { meta: { childrenCount: 0 } })],
          };
        }

        return { data: [] };
      }
    }

    it("should expand entries with childrenCount > 0", async () => {
      const provider = new ChildrenCountTestProvider();

      const result = await provider.list("/", { maxDepth: 2 });

      expect(provider.expandedPaths).toContain("/dir-with-count");
      expect(result.data.map((e) => e.path)).toContain("/dir-with-count/child1");
      expect(result.data.map((e) => e.path)).toContain("/dir-with-count/child2");
    });

    it("should expand entries with childrenCount = -1 (unknown)", async () => {
      const provider = new ChildrenCountTestProvider();

      const result = await provider.list("/", { maxDepth: 2 });

      expect(provider.expandedPaths).toContain("/dir-unknown-count");
      expect(result.data.map((e) => e.path)).toContain("/dir-unknown-count/child");
    });

    it("should NOT expand entries with childrenCount = 0", async () => {
      const provider = new ChildrenCountTestProvider();

      await provider.list("/", { maxDepth: 2 });

      expect(provider.expandedPaths).not.toContain("/leaf-zero");
    });

    it("should NOT expand entries with childrenCount = undefined (leaf per Protocol)", async () => {
      const provider = new ChildrenCountTestProvider();

      await provider.list("/", { maxDepth: 2 });

      expect(provider.expandedPaths).not.toContain("/leaf-undefined");
    });

    it("should include all entries in result regardless of expansion", async () => {
      const provider = new ChildrenCountTestProvider();

      const result = await provider.list("/", { maxDepth: 2 });
      const paths = result.data.map((e) => e.path);

      // All root entries should be in result
      expect(paths).toContain("/dir-with-count");
      expect(paths).toContain("/dir-unknown-count");
      expect(paths).toContain("/leaf-zero");
      expect(paths).toContain("/leaf-undefined");
    });
  });
});

describe("AFSBaseProvider method availability", () => {
  // Provider with only list and read
  class ReadOnlyProvider extends AFSBaseProvider {
    readonly name = "readonly";
    readonly accessMode = "readonly" as const;

    @List("/")
    async listRoot() {
      return { data: [] };
    }

    @Read("/:id")
    async readItem(ctx: RouteContext<{ id: string }>) {
      return this.buildEntry(ctx.path);
    }
  }

  // Provider with all operations
  class FullProvider extends AFSBaseProvider {
    readonly name = "full";
    readonly accessMode = "readwrite" as const;

    @List("/")
    async listRoot() {
      return { data: [] };
    }

    @Read("/:id")
    async readItem(ctx: RouteContext<{ id: string }>) {
      return this.buildEntry(ctx.path);
    }

    @Write("/:id")
    async writeItem() {
      return { data: this.buildEntry("/test") };
    }

    @Delete("/:id")
    async deleteItem() {
      return { message: "Deleted" };
    }

    @Search("/")
    async searchItems() {
      return { data: [] };
    }
  }

  it("should only have methods for registered operations", () => {
    const provider = new ReadOnlyProvider();

    // Registered operations should have methods
    expect(typeof provider.list).toBe("function");
    expect(typeof provider.read).toBe("function");

    // Unregistered operations should not have methods
    expect(typeof provider.write).toBe("undefined");
    expect(typeof provider.delete).toBe("undefined");
    expect(typeof provider.exec).toBe("undefined");
    expect(typeof provider.search).toBe("undefined");
    expect(typeof provider.stat).toBe("undefined");
    expect(typeof provider.explain).toBe("undefined");
    expect(typeof provider.rename).toBe("undefined");
  });

  it("should have all methods when all operations are registered", () => {
    const provider = new FullProvider();

    expect(typeof provider.list).toBe("function");
    expect(typeof provider.read).toBe("function");
    expect(typeof provider.write).toBe("function");
    expect(typeof provider.delete).toBe("function");
    expect(typeof provider.search).toBe("function");

    // These are still undefined because not registered
    expect(typeof provider.exec).toBe("undefined");
    expect(typeof provider.stat).toBe("undefined");
    expect(typeof provider.explain).toBe("undefined");
    expect(typeof provider.rename).toBe("undefined");
  });
});
