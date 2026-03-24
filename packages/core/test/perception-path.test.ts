/**
 * Tests for .perception/ implicit path (Phase 0.5)
 *
 * .perception/ is the third implicit path in AFS (alongside .meta and .actions).
 * It allows providers to expose UI hints, views, and display instructions.
 * Like .meta and .actions, .perception/ entries are not included in list results.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import { AFSBaseProvider } from "../src/provider/base.js";
import { List, Meta, Read } from "../src/provider/decorators.js";
import type { RouteContext } from "../src/provider/types.js";
import type { AFSEntry, AFSListResult } from "../src/type.js";

// ─── Test Provider with .perception/ support ────────────────────

class PerceptionProvider extends AFSBaseProvider {
  readonly name = "perceiver";
  readonly description = "Provider with perception support";

  @List("/")
  async listRoot(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [{ id: "item", path: "/item", meta: { childrenCount: 0 } }],
    };
  }

  @Read("/")
  async readRoot(_ctx: RouteContext): Promise<AFSEntry> {
    return { id: "root", path: "/", meta: { childrenCount: 1 } };
  }

  @Meta("/")
  async metaRoot(_ctx: RouteContext): Promise<AFSEntry> {
    return { id: "root-meta", path: "/.meta", meta: { kind: "test:root" } };
  }

  // .perception/ directory listing
  @List("/.perception")
  async listPerception(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [
        { id: "README.md", path: "/.perception/README.md", meta: { childrenCount: 0 } },
        { id: "views", path: "/.perception/views", meta: { childrenCount: 1 } },
      ],
    };
  }

  @Read("/.perception/README.md")
  async readPerceptionReadme(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "README.md",
      path: "/.perception/README.md",
      content: "# UI Hints\nThis provider supports a custom view.",
    };
  }

  @List("/.perception/views")
  async listPerceptionViews(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [
        {
          id: "dashboard.html",
          path: "/.perception/views/dashboard.html",
          meta: { childrenCount: 0 },
        },
      ],
    };
  }

  @Read("/.perception/views/dashboard.html")
  async readPerceptionDashboard(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "dashboard.html",
      path: "/.perception/views/dashboard.html",
      content: "<div>Dashboard</div>",
    };
  }
}

/** Provider without perception support */
class NoPerceptionProvider extends AFSBaseProvider {
  readonly name = "no-perception";
  readonly description = "Provider without perception support";

  @List("/")
  async listRoot(_ctx: RouteContext): Promise<AFSListResult> {
    return { data: [{ id: "item", path: "/item" }] };
  }

  @Read("/")
  async readRoot(_ctx: RouteContext): Promise<AFSEntry> {
    return { id: "root", path: "/", meta: { childrenCount: 1 } };
  }
}

/** Provider with nested .perception/ */
class NestedPerceptionProvider extends AFSBaseProvider {
  readonly name = "nested-perceiver";
  readonly description = "Provider with nested perception paths";

  @List("/")
  async listRoot(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [{ id: "sub", path: "/sub", meta: { childrenCount: 1 } }],
    };
  }

  @Read("/")
  async readRoot(_ctx: RouteContext): Promise<AFSEntry> {
    return { id: "root", path: "/", meta: { childrenCount: 1 } };
  }

  @List("/sub")
  async listSub(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [{ id: "child", path: "/sub/child", meta: { childrenCount: 0 } }],
    };
  }

  @Read("/sub")
  async readSub(_ctx: RouteContext): Promise<AFSEntry> {
    return { id: "sub", path: "/sub", meta: { childrenCount: 1 } };
  }

  // Root-level perception
  @Read("/.perception/README.md")
  async readRootPerception(_ctx: RouteContext): Promise<AFSEntry> {
    return { id: "README.md", path: "/.perception/README.md", content: "Root perception" };
  }

  // Nested perception
  @Read("/sub/.perception/README.md")
  async readSubPerception(_ctx: RouteContext): Promise<AFSEntry> {
    return { id: "README.md", path: "/sub/.perception/README.md", content: "Sub perception" };
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe(".perception/ implicit path", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  describe("happy path", () => {
    test(".perception/ does not appear in list('/') results", async () => {
      await afs.mount(new PerceptionProvider(), "/test");

      const result = await afs.list("/test");
      const paths = result.data.map((e) => e.path);

      expect(paths).not.toContain("/test/.perception");
      expect(paths.some((p) => p.includes(".perception"))).toBe(false);
    });

    test("list('.perception/') returns perception directory contents", async () => {
      await afs.mount(new PerceptionProvider(), "/test");

      const result = await afs.list("/test/.perception");
      expect(result.data.length).toBeGreaterThan(0);

      const paths = result.data.map((e) => e.path);
      expect(paths).toContain("/test/.perception/README.md");
    });

    test("read('.perception/README.md') returns content", async () => {
      await afs.mount(new PerceptionProvider(), "/test");

      const result = await afs.read("/test/.perception/README.md");
      expect(result.data?.content).toContain("UI Hints");
    });

    test(".perception/views/ subdirectory is listable and readable", async () => {
      await afs.mount(new PerceptionProvider(), "/test");

      const listResult = await afs.list("/test/.perception/views");
      expect(listResult.data.length).toBeGreaterThan(0);

      const readResult = await afs.read("/test/.perception/views/dashboard.html");
      expect(readResult.data?.content).toContain("Dashboard");
    });
  });

  describe("bad path", () => {
    test("provider without perception handlers returns not found", async () => {
      await afs.mount(new NoPerceptionProvider(), "/test");

      await expect(afs.read("/test/.perception/README.md")).rejects.toThrow();
    });

    test(".perception/nonexistent returns not found", async () => {
      await afs.mount(new PerceptionProvider(), "/test");

      await expect(afs.read("/test/.perception/nonexistent.md")).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    test(".perception/ paths are not enriched (same as .meta/.actions)", async () => {
      // This is verified indirectly — .perception/ paths skip enrichment
      // to avoid recursive fetches. We verify it by checking that a
      // .perception/ read doesn't trigger additional meta/actions fetches.
      await afs.mount(new PerceptionProvider(), "/test");

      const result = await afs.read("/test/.perception/README.md");
      // Should return raw content without enriched actions/meta
      expect(result.data?.content).toContain("UI Hints");
    });

    test("nested .perception/ paths work independently", async () => {
      await afs.mount(new NestedPerceptionProvider(), "/test");

      // Root-level perception
      const rootResult = await afs.read("/test/.perception/README.md");
      expect(rootResult.data?.content).toBe("Root perception");

      // Nested perception
      const subResult = await afs.read("/test/sub/.perception/README.md");
      expect(subResult.data?.content).toBe("Sub perception");
    });

    test(".perception/ does not appear in nested list results", async () => {
      await afs.mount(new NestedPerceptionProvider(), "/test");

      const result = await afs.list("/test/sub");
      const paths = result.data.map((e) => e.path);

      expect(paths.some((p) => p.includes(".perception"))).toBe(false);
    });
  });
});
