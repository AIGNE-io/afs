import { describe, expect, it } from "bun:test";
import type {
  DeleteRouteHandler,
  ExecRouteHandler,
  ListRouteHandler,
  ReadRouteHandler,
  RouteContext,
  RouteDefinition,
  RouteMetadata,
  RouteOperation,
  SearchRouteHandler,
  WriteRouteHandler,
} from "../../src/provider/types.js";
import type { AFSListOptions, AFSListResult } from "../../src/type.js";

describe("Provider Types", () => {
  describe("RouteOperation", () => {
    it("should include all 6 operations", () => {
      const operations: RouteOperation[] = ["list", "read", "write", "delete", "exec", "search"];
      expect(operations).toHaveLength(6);
    });
  });

  describe("RouteContext", () => {
    it("should have path, params, and options", () => {
      const ctx: RouteContext<{ table: string }> = {
        path: "/users",
        params: { table: "users" },
        options: { limit: 10 },
      };

      expect(ctx.path).toBe("/users");
      expect(ctx.params.table).toBe("users");
      expect((ctx.options as { limit?: number })?.limit).toBe(10);
    });

    it("should support generic params type", () => {
      const ctx: RouteContext<{ table: string; pk: string }> = {
        path: "/users/1",
        params: { table: "users", pk: "1" },
      };

      expect(ctx.params.table).toBe("users");
      expect(ctx.params.pk).toBe("1");
    });
  });

  describe("RouteDefinition", () => {
    it("should have pattern, operation, handler, and optional description", () => {
      const mockHandler = async () => ({ data: [] });
      const def: RouteDefinition = {
        pattern: "/:table",
        operation: "list",
        handler: mockHandler,
        description: "List table rows",
      };

      expect(def.pattern).toBe("/:table");
      expect(def.operation).toBe("list");
      expect(def.handler).toBe(mockHandler);
      expect(def.description).toBe("List table rows");
    });

    it("should allow description to be optional", () => {
      const def: RouteDefinition = {
        pattern: "/",
        operation: "read",
        handler: async () => ({ id: "1", path: "/" }),
      };

      expect(def.description).toBeUndefined();
    });
  });

  describe("RouteMetadata", () => {
    it("should store decorator metadata", () => {
      const meta: RouteMetadata = {
        pattern: "/:table/:pk",
        operation: "read",
        methodName: "getRow",
        description: "Get a single row",
      };

      expect(meta.pattern).toBe("/:table/:pk");
      expect(meta.operation).toBe("read");
      expect(meta.methodName).toBe("getRow");
      expect(meta.description).toBe("Get a single row");
    });
  });

  describe("Route Handlers", () => {
    it("ListRouteHandler should return { data, total? }", async () => {
      const handler: ListRouteHandler = async (_ctx) => {
        return { data: [{ id: "1", path: "/test" }], total: 100 };
      };

      const result = await handler({ path: "/", params: {} });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(100);
    });

    it("ListRouteHandler can omit total", async () => {
      const handler: ListRouteHandler = async (_ctx) => {
        return { data: [] };
      };

      const result = await handler({ path: "/", params: {} });
      expect(result.data).toEqual([]);
      expect(result.total).toBeUndefined();
    });

    it("ReadRouteHandler should return AFSEntry", async () => {
      const handler: ReadRouteHandler = async (ctx) => {
        return { id: "1", path: ctx.path, content: "test" };
      };

      const result = await handler({ path: "/test", params: {} });
      expect(result?.id).toBe("1");
      expect(result?.path).toBe("/test");
    });

    it("WriteRouteHandler should return AFSWriteResult", async () => {
      const handler: WriteRouteHandler = async (ctx, _content) => {
        return { data: { id: "1", path: ctx.path } };
      };

      const result = await handler({ path: "/test", params: {} }, { content: "new" });
      expect(result.data.path).toBe("/test");
    });

    it("DeleteRouteHandler should return AFSDeleteResult", async () => {
      const handler: DeleteRouteHandler = async (_ctx) => {
        return { message: "Deleted" };
      };

      const result = await handler({ path: "/test", params: {} });
      expect(result.message).toBe("Deleted");
    });

    it("ExecRouteHandler should return AFSExecResult", async () => {
      const handler: ExecRouteHandler = async (_ctx, args) => {
        return { success: true, data: { ...args } };
      };

      const result = await handler({ path: "/test", params: {} }, { action: "run" });
      expect(result.success).toBe(true);
      expect(result.data?.action).toBe("run");
    });

    it("SearchRouteHandler should return AFSSearchResult", async () => {
      const handler: SearchRouteHandler = async (_ctx, query, _options) => {
        return { data: [{ id: "1", path: "/found", summary: query }] };
      };

      const result = await handler({ path: "/", params: {} }, "test query");
      expect(result.data[0]?.summary).toBe("test query");
    });
  });
});

describe("AFSListResult with total", () => {
  it("should support optional total field", () => {
    const result: AFSListResult = {
      data: [{ id: "1", path: "/test" }],
      total: 100,
    };

    expect(result.total).toBe(100);
  });

  it("total undefined means data is complete", () => {
    const result: AFSListResult = {
      data: [{ id: "1", path: "/test" }],
    };

    // When total is undefined, data.length IS the total
    expect(result.total).toBeUndefined();
  });
});

describe("AFSListOptions with offset", () => {
  it("should support offset field", () => {
    const options: AFSListOptions = {
      offset: 10,
      limit: 20,
    };

    expect(options.offset).toBe(10);
    expect(options.limit).toBe(20);
  });
});
