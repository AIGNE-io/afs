import { beforeEach, describe, expect, it } from "bun:test";
import { ProviderRouter } from "../../src/provider/router.js";

describe("ProviderRouter", () => {
  let router: ProviderRouter;

  beforeEach(() => {
    router = new ProviderRouter();
  });

  describe("registerRoute", () => {
    it("should register a simple route", () => {
      const handler = async () => ({ data: [] });
      router.registerRoute("/", "list", handler);

      const match = router.match("/", "list");
      expect(match).not.toBeNull();
      expect(match!.route.pattern).toBe("/");
      expect(match!.route.operation).toBe("list");
    });

    it("should register route with description", () => {
      const handler = async () => ({ data: [] });
      router.registerRoute("/", "list", handler, "List root");

      const match = router.match("/", "list");
      expect(match!.route.description).toBe("List root");
    });

    it("should detect route conflicts and warn", () => {
      const handler1 = async () => ({ data: [] });
      const handler2 = async () => ({ data: [] });

      router.registerRoute("/users", "list", handler1);
      // Same pattern + operation should warn (but still work)
      router.registerRoute("/users", "list", handler2);

      // The second registration should override
      const match = router.match("/users", "list");
      expect(match!.route.handler).toBe(handler2);
    });
  });

  describe("match", () => {
    it("should match exact paths", () => {
      router.registerRoute("/users", "list", async () => ({ data: [] }));

      const match = router.match("/users", "list");
      expect(match).not.toBeNull();
      expect(match!.params).toEqual({});
    });

    it("should extract parameters from path", () => {
      router.registerRoute("/:table/:pk", "read", async () => ({ id: "1", path: "/" }));

      const match = router.match("/users/123", "read");
      expect(match).not.toBeNull();
      expect(match!.params.table).toBe("users");
      expect(match!.params.pk).toBe("123");
    });

    it("should match wildcard patterns", () => {
      router.registerRoute("/**", "list", async () => ({ data: [] }));

      const match = router.match("/any/deep/path", "list");
      expect(match).not.toBeNull();
    });

    it("should extract wildcard remainder", () => {
      router.registerRoute("/:branch/**", "read", async () => ({ id: "1", path: "/" }));

      const match = router.match("/main/src/index.ts", "read");
      expect(match).not.toBeNull();
      expect(match!.params.branch).toBe("main");
      // The rest of the path should be accessible
      expect(match!.params._).toBeDefined();
    });

    it("should return null for non-matching paths", () => {
      router.registerRoute("/users", "list", async () => ({ data: [] }));

      const match = router.match("/posts", "list");
      expect(match).toBeNull();
    });

    it("should return null for wrong operation", () => {
      router.registerRoute("/users", "list", async () => ({ data: [] }));

      const match = router.match("/users", "read");
      expect(match).toBeNull();
    });

    it("should prioritize exact match over parameter match", () => {
      const exactHandler = async () => ({ data: [{ id: "exact", path: "/" }] });
      const paramHandler = async () => ({ data: [{ id: "param", path: "/" }] });

      router.registerRoute("/:table", "list", paramHandler);
      router.registerRoute("/special", "list", exactHandler);

      const match = router.match("/special", "list");
      expect(match!.route.handler).toBe(exactHandler);
    });
  });

  describe("getStaticChildren", () => {
    it("should return direct static children of a path", () => {
      router.registerRoute("/", "list", async () => ({ data: [] }));
      router.registerRoute("/users", "list", async () => ({ data: [] }));
      router.registerRoute("/posts", "list", async () => ({ data: [] }));
      router.registerRoute("/users/:id", "read", async () => ({ id: "1", path: "/" }));

      const children = router.getStaticChildren("/");
      expect(children).toContain("/users");
      expect(children).toContain("/posts");
      // Should not include parameterized paths
      expect(children).not.toContain("/users/:id");
    });

    it("should return nested static children", () => {
      router.registerRoute("/:table", "list", async () => ({ data: [] }));
      router.registerRoute("/:table/new", "read", async () => ({ id: "1", path: "/" }));
      router.registerRoute("/:table/schema", "read", async () => ({ id: "1", path: "/" }));

      const children = router.getStaticChildren("/users");
      expect(children).toContain("/users/new");
      expect(children).toContain("/users/schema");
    });

    it("should exclude .meta and .actions from children", () => {
      router.registerRoute("/:table/:pk", "read", async () => ({ id: "1", path: "/" }));
      router.registerRoute("/:table/:pk/.meta", "read", async () => ({ id: "1", path: "/" }));
      router.registerRoute("/:table/:pk/.actions", "list", async () => ({ data: [] }));

      const children = router.getStaticChildren("/users/1");
      // .meta and .actions are implicit, not returned as children
      expect(children).not.toContain("/users/1/.meta");
      expect(children).not.toContain("/users/1/.actions");
    });

    it("should return empty array for leaf nodes", () => {
      router.registerRoute("/:table/:pk", "read", async () => ({ id: "1", path: "/" }));

      const children = router.getStaticChildren("/users/1");
      expect(children).toEqual([]);
    });
  });

  describe("getAllPatterns", () => {
    it("should return all registered patterns", () => {
      router.registerRoute("/", "list", async () => ({ data: [] }));
      router.registerRoute("/:table", "list", async () => ({ data: [] }));
      router.registerRoute("/:table/:pk", "read", async () => ({ id: "1", path: "/" }));

      const patterns = router.getAllPatterns();
      expect(patterns).toContain("/");
      expect(patterns).toContain("/:table");
      expect(patterns).toContain("/:table/:pk");
    });
  });

  describe("Multiple operations on same pattern", () => {
    it("should support different operations on same pattern", () => {
      const listHandler = async () => ({ data: [] });
      const readHandler = async () => ({ id: "1", path: "/" });
      const writeHandler = async () => ({ data: { id: "1", path: "/" } });

      router.registerRoute("/:table/:pk", "list", listHandler);
      router.registerRoute("/:table/:pk", "read", readHandler);
      router.registerRoute("/:table/:pk", "write", writeHandler);

      expect(router.match("/users/1", "list")!.route.handler).toBe(listHandler);
      expect(router.match("/users/1", "read")!.route.handler).toBe(readHandler);
      expect(router.match("/users/1", "write")!.route.handler).toBe(writeHandler);
    });
  });

  describe("URLPattern suffix patterns", () => {
    it("should match suffix pattern /:path*/.meta", () => {
      const metaHandler = async () => ({ id: "1", path: "/" });
      const readHandler = async () => ({ id: "2", path: "/" });

      router.registerRoute("/:path*/.meta", "read", metaHandler);
      router.registerRoute("/:path*", "read", readHandler);

      // .meta suffix should match the meta handler
      const metaMatch = router.match("/users/123/.meta", "read");
      expect(metaMatch).not.toBeNull();
      expect(metaMatch!.route.handler).toBe(metaHandler);
      expect(metaMatch!.params.path).toBe("users/123");

      // Non-.meta should match the wildcard handler
      const normalMatch = router.match("/users/123", "read");
      expect(normalMatch).not.toBeNull();
      expect(normalMatch!.route.handler).toBe(readHandler);
    });

    it("should match root .meta path", () => {
      const metaHandler = async () => ({ id: "1", path: "/" });
      router.registerRoute("/:path*/.meta", "read", metaHandler);

      const match = router.match("/.meta", "read");
      expect(match).not.toBeNull();
      expect(match!.route.handler).toBe(metaHandler);
      // For root, path should be empty or undefined
      expect(match!.params.path === "" || match!.params.path === undefined).toBe(true);
    });

    it("should prioritize more specific suffix patterns", () => {
      const kindsHandler = async () => ({ id: "kinds", path: "/" });
      const metaHandler = async () => ({ id: "meta", path: "/" });
      const wildcardHandler = async () => ({ id: "wildcard", path: "/" });

      // Register in any order - specificity should determine match
      router.registerRoute("/:path*", "read", wildcardHandler);
      router.registerRoute("/:path*/.meta", "read", metaHandler);
      router.registerRoute("/:path*/.meta/.kinds", "read", kindsHandler);

      // Most specific: .meta/.kinds
      const kindsMatch = router.match("/users/.meta/.kinds", "read");
      expect(kindsMatch!.route.handler).toBe(kindsHandler);

      // Medium specific: .meta
      const metaMatch = router.match("/users/.meta", "read");
      expect(metaMatch!.route.handler).toBe(metaHandler);

      // Least specific: wildcard
      const wildcardMatch = router.match("/users/data", "read");
      expect(wildcardMatch!.route.handler).toBe(wildcardHandler);
    });

    it("should match deeply nested suffix patterns", () => {
      const metaHandler = async () => ({ id: "1", path: "/" });
      router.registerRoute("/:path*/.meta", "read", metaHandler);

      const match = router.match("/a/b/c/d/e/.meta", "read");
      expect(match).not.toBeNull();
      expect(match!.params.path).toBe("a/b/c/d/e");
    });

    it("should support suffix pattern with additional named params", () => {
      const handler = async () => ({ id: "1", path: "/" });
      router.registerRoute("/:path*/.meta/:resource", "read", handler);

      const match = router.match("/users/123/.meta/icon.png", "read");
      expect(match).not.toBeNull();
      expect(match!.params.path).toBe("users/123");
      expect(match!.params.resource).toBe("icon.png");
    });
  });

  describe("URLPattern specificity ordering", () => {
    it("should order routes by specificity (static > param > wildcard)", () => {
      const staticHandler = async () => ({ data: [] });
      const paramHandler = async () => ({ data: [] });
      const wildcardHandler = async () => ({ data: [] });

      // Register in reverse specificity order
      router.registerRoute("/:path*", "list", wildcardHandler);
      router.registerRoute("/:id", "list", paramHandler);
      router.registerRoute("/special", "list", staticHandler);

      // Static should match /special
      expect(router.match("/special", "list")!.route.handler).toBe(staticHandler);

      // Param should match /other
      expect(router.match("/other", "list")!.route.handler).toBe(paramHandler);

      // Wildcard should match deep paths
      expect(router.match("/a/b/c", "list")!.route.handler).toBe(wildcardHandler);
    });

    it("should prefer longer patterns at same specificity level", () => {
      const shortHandler = async () => ({ id: "short", path: "/" });
      const longHandler = async () => ({ id: "long", path: "/" });

      router.registerRoute("/:a/:b", "read", shortHandler);
      router.registerRoute("/:a/:b/:c", "read", longHandler);

      // 3-segment path should match the longer pattern
      expect(router.match("/1/2/3", "read")!.route.handler).toBe(longHandler);

      // 2-segment path should match the shorter pattern
      expect(router.match("/1/2", "read")!.route.handler).toBe(shortHandler);
    });
  });
});
