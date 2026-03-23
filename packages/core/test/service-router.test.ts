/**
 * ServiceRouter tests — path prefix matching + dispatch.
 */

import { describe, expect, it } from "bun:test";
import { ServiceRouter } from "../src/service/router.js";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

describe("ServiceRouter", () => {
  it("routes to matching handler and strips prefix", async () => {
    const router = new ServiceRouter();
    router.register("/api", {
      async fetch(req) {
        const url = new URL(req.url);
        return json({ path: url.pathname });
      },
    });

    const res = await router.fetch(new Request("http://localhost/api/users"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "/users" });
  });

  it("returns 404 for unmatched paths", async () => {
    const router = new ServiceRouter();
    router.register("/api", {
      async fetch() {
        return json({ ok: true });
      },
    });

    const res = await router.fetch(new Request("http://localhost/unknown"));
    expect(res.status).toBe(404);
  });

  it("matches longest prefix first", async () => {
    const router = new ServiceRouter();
    router.register("/api", {
      async fetch() {
        return json({ handler: "api" });
      },
    });
    router.register("/api/v2", {
      async fetch() {
        return json({ handler: "api-v2" });
      },
    });

    const res = await router.fetch(new Request("http://localhost/api/v2/items"));
    expect(await res.json()).toEqual({ handler: "api-v2" });
  });

  it("exact prefix match without trailing slash", async () => {
    const router = new ServiceRouter();
    router.register("/health", {
      async fetch() {
        return json({ status: "ok" });
      },
    });

    const res = await router.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("preserves query string through rewrite", async () => {
    const router = new ServiceRouter();
    router.register("/api", {
      async fetch(req) {
        const url = new URL(req.url);
        return json({ q: url.searchParams.get("q") });
      },
    });

    const res = await router.fetch(new Request("http://localhost/api/search?q=hello"));
    expect(await res.json()).toEqual({ q: "hello" });
  });

  it("unregister removes handler", async () => {
    const router = new ServiceRouter();
    router.register("/temp", {
      async fetch() {
        return json({ ok: true });
      },
    });
    expect(router.unregister("/temp")).toBe(true);

    const res = await router.fetch(new Request("http://localhost/temp"));
    expect(res.status).toBe(404);
  });

  it("replaces handler for duplicate prefix", async () => {
    const router = new ServiceRouter();
    router.register("/api", {
      async fetch() {
        return json({ v: 1 });
      },
    });
    router.register("/api", {
      async fetch() {
        return json({ v: 2 });
      },
    });

    const res = await router.fetch(new Request("http://localhost/api/test"));
    expect(await res.json()).toEqual({ v: 2 });
  });

  it("root handler catches everything not matched", async () => {
    const router = new ServiceRouter();
    router.register("/api", {
      async fetch() {
        return json({ handler: "api" });
      },
    });
    router.register("/", {
      async fetch() {
        return json({ handler: "root" });
      },
    });

    const apiRes = await router.fetch(new Request("http://localhost/api/test"));
    expect(await apiRes.json()).toEqual({ handler: "api" });

    const rootRes = await router.fetch(new Request("http://localhost/anything"));
    expect(await rootRes.json()).toEqual({ handler: "root" });
  });

  it("prefixes lists all registered prefixes", () => {
    const router = new ServiceRouter();
    router.register("/a", {
      async fetch() {
        return new Response();
      },
    });
    router.register("/b", {
      async fetch() {
        return new Response();
      },
    });
    expect(router.prefixes.sort()).toEqual(["/a", "/b"]);
  });
});
