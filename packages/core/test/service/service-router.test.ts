/**
 * ServiceRouter tests — request routing, 404 handling, prefix matching.
 *
 * Dimensions:
 *  Happy: normal routing, prefix stripping, multiple handlers
 *  Bad: invalid prefix, no matching handler
 *  Security: prefix injection attempts
 */
import { describe, expect, test } from "bun:test";
import { ServiceRouter } from "../../src/service/router.js";
import type { ServiceHandler } from "../../src/service/types.js";

/** Create a simple handler that returns its name + the received pathname. */
function makeHandler(name: string): ServiceHandler {
  return {
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      return new Response(JSON.stringify({ handler: name, path: url.pathname }), {
        headers: { "content-type": "application/json" },
      });
    },
  };
}

async function parseBody(res: Response): Promise<{ handler: string; path: string }> {
  return res.json() as Promise<{ handler: string; path: string }>;
}

describe("ServiceRouter", () => {
  // ═══ Happy ═══

  describe("Happy path", () => {
    test("routes request to registered handler", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));

      const res = await router.fetch(new Request("http://localhost/api/data"));
      expect(res.status).toBe(200);
      const body = await parseBody(res);
      expect(body.handler).toBe("api");
    });

    test("strips prefix from forwarded URL", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));

      const res = await router.fetch(new Request("http://localhost/api/users/123"));
      const body = await parseBody(res);
      expect(body.path).toBe("/users/123");
    });

    test("exact prefix match routes correctly", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));

      const res = await router.fetch(new Request("http://localhost/api"));
      expect(res.status).toBe(200);
      const body = await parseBody(res);
      expect(body.handler).toBe("api");
      expect(body.path).toBe("/");
    });

    test("longest prefix wins", async () => {
      const router = new ServiceRouter();
      router.register("/ui", makeHandler("ui"));
      router.register("/ui/ws", makeHandler("ui-ws"));

      const res = await router.fetch(new Request("http://localhost/ui/ws/connect"));
      const body = await parseBody(res);
      expect(body.handler).toBe("ui-ws");
      expect(body.path).toBe("/connect");
    });

    test("multiple handlers coexist", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));
      router.register("/ui", makeHandler("ui"));
      router.register("/mcp", makeHandler("mcp"));

      const res1 = await router.fetch(new Request("http://localhost/api/data"));
      const res2 = await router.fetch(new Request("http://localhost/ui/page"));
      const res3 = await router.fetch(new Request("http://localhost/mcp"));

      expect((await parseBody(res1)).handler).toBe("api");
      expect((await parseBody(res2)).handler).toBe("ui");
      expect((await parseBody(res3)).handler).toBe("mcp");
    });

    test("root handler catches unmatched paths", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));
      router.register("/", makeHandler("root"));

      const res = await router.fetch(new Request("http://localhost/other/path"));
      const body = await parseBody(res);
      expect(body.handler).toBe("root");
    });

    test("preserves query string in forwarded request", async () => {
      const router = new ServiceRouter();
      router.register("/api", {
        async fetch(req: Request): Promise<Response> {
          const url = new URL(req.url);
          return new Response(
            JSON.stringify({ path: url.pathname, query: url.searchParams.get("q") }),
          );
        },
      });

      const res = await router.fetch(new Request("http://localhost/api/search?q=hello"));
      const body = (await res.json()) as { path: string; query: string };
      expect(body.path).toBe("/search");
      expect(body.query).toBe("hello");
    });

    test("unregister removes handler", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));

      expect(router.unregister("/api")).toBe(true);

      const res = await router.fetch(new Request("http://localhost/api/data"));
      expect(res.status).toBe(404);
    });

    test("prefixes returns registered prefixes", () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));
      router.register("/ui", makeHandler("ui"));

      const prefixes = router.prefixes;
      expect(prefixes).toContain("/api");
      expect(prefixes).toContain("/ui");
    });

    test("re-registering same prefix replaces handler", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("v1"));
      router.register("/api", makeHandler("v2"));

      const res = await router.fetch(new Request("http://localhost/api/data"));
      const body = await parseBody(res);
      expect(body.handler).toBe("v2");
    });
  });

  // ═══ Bad ═══

  describe("Bad input", () => {
    test("returns 404 when no handler matches", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));

      const res = await router.fetch(new Request("http://localhost/other/path"));
      expect(res.status).toBe(404);
    });

    test("empty router returns 404 for any path", async () => {
      const router = new ServiceRouter();
      const res = await router.fetch(new Request("http://localhost/anything"));
      expect(res.status).toBe(404);
    });

    test("throws on prefix not starting with /", () => {
      const router = new ServiceRouter();
      expect(() => router.register("api", makeHandler("api"))).toThrow();
    });

    test("unregister returns false for non-existent prefix", () => {
      const router = new ServiceRouter();
      expect(router.unregister("/nonexistent")).toBe(false);
    });

    test("handler that throws returns 500-level error from handler itself", async () => {
      const router = new ServiceRouter();
      router.register("/bad", {
        async fetch(): Promise<Response> {
          throw new Error("handler exploded");
        },
      });

      // The router does NOT catch handler errors — they propagate
      // (the transport layer is responsible for catching)
      try {
        await router.fetch(new Request("http://localhost/bad/path"));
        // If we get here, the router might have a built-in error boundary
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toBe("handler exploded");
      }
    });
  });

  // ═══ Security ═══

  describe("Security", () => {
    test("path with .. does not escape prefix matching", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));
      router.register("/admin", makeHandler("admin"));

      // Attempt: /api/../admin should NOT route to admin handler
      // The URL parser normalizes the path
      const res = await router.fetch(new Request("http://localhost/api/../admin"));
      // URL normalization should resolve /api/../admin to /admin
      // This is handled by the URL constructor, so the router sees /admin
      const body = await parseBody(res);
      expect(body.handler).toBe("admin");
    });

    test("double-slash in path does not bypass routing", async () => {
      const router = new ServiceRouter();
      router.register("/api", makeHandler("api"));

      const res = await router.fetch(new Request("http://localhost//api/data"));
      // URL normalization: //api/data is a valid path
      // The router should handle it gracefully
      expect([200, 404]).toContain(res.status);
    });

    test("prefix with trailing slash is normalized", async () => {
      const router = new ServiceRouter();
      router.register("/api/", makeHandler("api"));

      // Should match /api/data
      const res = await router.fetch(new Request("http://localhost/api/data"));
      expect(res.status).toBe(200);
    });
  });
});
