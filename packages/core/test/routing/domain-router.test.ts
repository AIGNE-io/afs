/**
 * Domain router — host-header-based blocklet routing.
 *
 * Tests for extracting blocklet name from Host header,
 * loading routes from AFS, and dispatching by handler type.
 */

import { describe, expect, it } from "bun:test";
import {
  createDomainRouter,
  type DomainRouterDeps,
  extractBlockletFromHost,
  loadBlockletRoutes,
} from "../../src/routing/domain-router.js";
import type { AFSContext } from "../../src/type.js";

// ─── extractBlockletFromHost ─────────────────────────────────────────────────

describe("extractBlockletFromHost", () => {
  it("extracts subdomain from {name}.localhost:{port}", () => {
    expect(extractBlockletFromHost("showcase.localhost:4900")).toBe("showcase");
  });

  it("extracts subdomain from {name}.localhost (no port)", () => {
    expect(extractBlockletFromHost("showcase.localhost")).toBe("showcase");
  });

  it("returns undefined for bare localhost:{port}", () => {
    expect(extractBlockletFromHost("localhost:4900")).toBeUndefined();
  });

  it("returns undefined for bare localhost", () => {
    expect(extractBlockletFromHost("localhost")).toBeUndefined();
  });

  it("handles multi-level subdomain — only first segment", () => {
    expect(extractBlockletFromHost("blog.showcase.localhost:4900")).toBe("blog.showcase");
  });

  it("returns undefined for empty host", () => {
    expect(extractBlockletFromHost("")).toBeUndefined();
  });

  it("returns undefined for IP address", () => {
    expect(extractBlockletFromHost("127.0.0.1:4900")).toBeUndefined();
  });

  it("returns undefined for 0.0.0.0", () => {
    expect(extractBlockletFromHost("0.0.0.0:4900")).toBeUndefined();
  });

  it("extracts subdomain from production domain (non-localhost)", () => {
    // Production domains like "showcase.aigne.io" are NOT parsed as subdomain
    // — they go through domainRegistry lookup instead.
    // extractBlockletFromHost only handles *.localhost patterns.
    expect(extractBlockletFromHost("showcase.aigne.io")).toBeUndefined();
  });
});

// ─── loadBlockletRoutes ──────────────────────────────────────────────────────

describe("loadBlockletRoutes", () => {
  /** Minimal AFS-like mock that returns route file contents. */
  function createMockAFS(routes: Record<string, string>) {
    return {
      async list(path: string) {
        const entries = Object.keys(routes)
          .filter((k) => k.startsWith(path))
          .map((k) => ({ path: k, type: "file" as const }));
        return { data: entries };
      },
      async read(path: string) {
        const content = routes[path];
        if (!content) throw new Error(`Not found: ${path}`);
        return { data: { content } };
      },
    };
  }

  it("loads routes from /data/.route/ within blocklet mount", async () => {
    const afs = createMockAFS({
      "/blocklets/showcase/data/.route/web": [
        "site: showcase",
        "path: /",
        "source: .",
        "handler: web",
      ].join("\n"),
      "/blocklets/showcase/data/.route/app": [
        "site: showcase",
        "path: /app",
        "source: .",
        "handler: aup",
      ].join("\n"),
    });

    const routes = await loadBlockletRoutes(afs as any, "/blocklets/showcase");
    expect(routes).toHaveLength(2);
    expect(routes.find((r) => r.handler === "web")?.path).toBe("/");
    expect(routes.find((r) => r.handler === "aup")?.path).toBe("/app");
  });

  it("falls back to /blocklet/.route/ if /data/.route/ is empty", async () => {
    const afs = createMockAFS({
      "/blocklets/showcase/blocklet/.route/web": [
        "site: showcase",
        "path: /",
        "source: .",
        "handler: web",
      ].join("\n"),
    });

    const routes = await loadBlockletRoutes(afs as any, "/blocklets/showcase");
    expect(routes).toHaveLength(1);
    expect(routes[0]!.handler).toBe("web");
  });

  it("returns empty array if no route files exist", async () => {
    const afs = createMockAFS({});
    const routes = await loadBlockletRoutes(afs as any, "/blocklets/showcase");
    expect(routes).toHaveLength(0);
  });

  it("skips invalid route files", async () => {
    const afs = createMockAFS({
      "/blocklets/showcase/data/.route/good": [
        "site: showcase",
        "path: /",
        "source: .",
        "handler: web",
      ].join("\n"),
      "/blocklets/showcase/data/.route/bad": "not valid yaml: [[[",
    });

    const routes = await loadBlockletRoutes(afs as any, "/blocklets/showcase");
    expect(routes).toHaveLength(1);
    expect(routes[0]!.name).toBe("good");
  });

  it("route entries include name from filename", async () => {
    const afs = createMockAFS({
      "/blocklets/showcase/data/.route/my-api": [
        "site: showcase",
        "path: /api",
        "source: ./api",
        "handler: exec",
      ].join("\n"),
    });

    const routes = await loadBlockletRoutes(afs as any, "/blocklets/showcase");
    expect(routes[0]!.name).toBe("my-api");
  });
});

// ─── createDomainRouter ──────────────────────────────────────────────────────

describe("createDomainRouter", () => {
  /** Build a minimal DomainRouterDeps for testing. */
  function buildDeps(overrides?: Partial<DomainRouterDeps>): DomainRouterDeps {
    return {
      resolveBlocklet: () => undefined,
      loadRoutes: async () => [
        { name: "web", site: "showcase", path: "/", source: ".", handler: "web" as const },
        { name: "app", site: "showcase", path: "/app", source: ".", handler: "aup" as const },
        { name: "api", site: "showcase", path: "/api", source: "./api", handler: "exec" as const },
      ],
      getAupClientResponse: async () =>
        new Response("<html>AUP Client</html>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      renderWebPage: async (_blockletName, _subPath, _context) =>
        new Response("<html>Web Page</html>", {
          headers: { "Content-Type": "text/html" },
        }),
      handleExec: async (_blockletName, _source, _subPath, _method, _body, _query, _context) =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        }),
      ...overrides,
    };
  }

  it("returns null for bare localhost (no blocklet subdomain)", async () => {
    const router = createDomainRouter(buildDeps());
    const result = await router.handleRequest(new Request("http://localhost:4900/"));
    expect(result).toBeNull();
  });

  it("returns null when blocklet not found", async () => {
    const router = createDomainRouter(buildDeps({ resolveBlocklet: () => undefined }));
    const result = await router.handleRequest(new Request("http://unknown.localhost:4900/"));
    expect(result).toBeNull();
  });

  it("dispatches handler:web for root path", async () => {
    const router = createDomainRouter(
      buildDeps({ resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined) }),
    );
    const result = await router.handleRequest(new Request("http://showcase.localhost:4900/"));
    expect(result).not.toBeNull();
    expect(result!.headers.get("Content-Type")).toBe("text/html");
    const body = await result!.text();
    expect(body).toContain("Web Page");
  });

  it("dispatches handler:aup for /app path", async () => {
    const router = createDomainRouter(
      buildDeps({ resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined) }),
    );
    const result = await router.handleRequest(new Request("http://showcase.localhost:4900/app"));
    expect(result).not.toBeNull();
    const body = await result!.text();
    expect(body).toContain("AUP Client");
  });

  it("dispatches handler:exec for /api path", async () => {
    const router = createDomainRouter(
      buildDeps({ resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined) }),
    );
    const result = await router.handleRequest(
      new Request("http://showcase.localhost:4900/api/users", { method: "POST" }),
    );
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 404 when no route matches the path", async () => {
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined),
        loadRoutes: async () => [
          { name: "app", site: "showcase", path: "/app", source: ".", handler: "aup" as const },
        ],
      }),
    );
    const result = await router.handleRequest(
      new Request("http://showcase.localhost:4900/nonexistent"),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(404);
  });

  it("passes subPath correctly to exec handler", async () => {
    let capturedSubPath = "";
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined),
        handleExec: async (_name, _source, subPath) => {
          capturedSubPath = subPath;
          return new Response("ok");
        },
      }),
    );
    await router.handleRequest(new Request("http://showcase.localhost:4900/api/users/123"));
    expect(capturedSubPath).toBe("/users/123");
  });

  it("resolves production domain via resolveBlocklet", async () => {
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => {
          // name here is the full domain from non-.localhost hosts
          if (name === "showcase.aigne.io") return "showcase";
          return undefined;
        },
      }),
    );
    const result = await router.handleRequest(new Request("http://showcase.aigne.io/app"));
    expect(result).not.toBeNull();
    const body = await result!.text();
    expect(body).toContain("AUP Client");
  });

  it("caches routes per blocklet (loadRoutes called once)", async () => {
    let loadCount = 0;
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined),
        loadRoutes: async () => {
          loadCount++;
          return [
            { name: "app", site: "showcase", path: "/app", source: ".", handler: "aup" as const },
          ];
        },
      }),
    );

    await router.handleRequest(new Request("http://showcase.localhost:4900/app"));
    await router.handleRequest(new Request("http://showcase.localhost:4900/app"));
    await router.handleRequest(new Request("http://showcase.localhost:4900/app"));
    expect(loadCount).toBe(1);
  });

  it("extractBlockletForWs returns blocklet name from *.localhost Host", () => {
    const router = createDomainRouter(buildDeps());
    expect(router.extractBlockletForWs("showcase.localhost:4900")).toBe("showcase");
    expect(router.extractBlockletForWs("localhost:4900")).toBeUndefined();
    // Production domains are not resolved for WS (they use handshake)
    expect(router.extractBlockletForWs("showcase.aigne.io")).toBeUndefined();
  });

  it("handleRequest passes context to handleExec", async () => {
    let capturedContext: AFSContext | undefined;
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined),
        handleExec: async (_name, _source, _subPath, _method, _body, _query, context) => {
          capturedContext = context;
          return new Response("ok");
        },
      }),
    );
    await router.handleRequest(new Request("http://showcase.localhost:4900/api/test"), {
      context: { requestId: "test-123" },
    });
    expect(capturedContext).toBeDefined();
    expect(capturedContext!.requestId).toBe("test-123");
  });

  it("handleRequest passes context to renderWebPage", async () => {
    let capturedContext: AFSContext | undefined;
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined),
        renderWebPage: async (_name, _subPath, context) => {
          capturedContext = context;
          return new Response("ok");
        },
      }),
    );
    await router.handleRequest(new Request("http://showcase.localhost:4900/"), {
      context: { requestId: "test-456" },
    });
    expect(capturedContext).toBeDefined();
    expect(capturedContext!.requestId).toBe("test-456");
  });

  it("handleRequest works without context (backward compatible)", async () => {
    let capturedContext: AFSContext | undefined = { requestId: "should-be-overwritten" };
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => (name === "showcase" ? "showcase" : undefined),
        handleExec: async (_name, _source, _subPath, _method, _body, _query, context) => {
          capturedContext = context;
          return new Response("ok");
        },
      }),
    );
    await router.handleRequest(new Request("http://showcase.localhost:4900/api/test"));
    expect(capturedContext).toBeUndefined();
  });

  it("handleRequest uses pre-resolved blockletName, skipping host resolution", async () => {
    let resolveBlockletCalled = false;
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: () => {
          resolveBlockletCalled = true;
          return undefined;
        },
      }),
    );
    // Request to bare localhost (no subdomain) — would return null without blockletName
    const result = await router.handleRequest(new Request("http://localhost:4900/app"), {
      blockletName: "showcase",
    });
    expect(result).not.toBeNull();
    expect(resolveBlockletCalled).toBe(false); // resolveBlocklet should NOT be called
    const body = await result!.text();
    expect(body).toContain("AUP Client");
  });

  it("handleRequest falls back to host resolution when blockletName not provided", async () => {
    let resolveBlockletCalled = false;
    const router = createDomainRouter(
      buildDeps({
        resolveBlocklet: (name) => {
          resolveBlockletCalled = true;
          return name === "showcase" ? "showcase" : undefined;
        },
      }),
    );
    await router.handleRequest(new Request("http://showcase.localhost:4900/app"));
    expect(resolveBlockletCalled).toBe(true);
  });
});
