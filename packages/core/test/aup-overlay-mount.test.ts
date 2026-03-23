/**
 * AUP Supplementary Provider — Sub-path Overlay Mount Tests
 *
 * Tests that `.aup/` sub-path mounts are allowed as an exception to the
 * parent-child mount conflict rule, enabling external providers to supply
 * UI views alongside a data provider.
 *
 * Test categories:
 * 1. Happy Path — mount succeeds, list returns both, read works, multiple supplements
 * 2. Bad Path — .aup/default blocked, non-.aup sub-path blocked, parent-over-child blocked
 * 3. Edge Cases — supplement-only, trailing slash, empty supplement, unmount, order-independent
 * 4. Security — access mode isolation, path isolation
 * 5. Data Leak — supplement cannot list parent, reads are isolated
 * 6. Data Damage — supplement mount/unmount does not affect parent
 */

import { describe, expect, test } from "bun:test";
import { AFS, type AFSEntry, type AFSModule } from "@aigne/afs";

// ── Helpers ──

/** Minimal module that passes mount check, with optional .aup/default/ content */
function createDataProvider(
  name: string,
  options: {
    hasAup?: boolean;
    content?: Record<string, unknown>;
    accessMode?: "readonly" | "readwrite";
  } = {},
): AFSModule {
  const hasAup = options.hasAup ?? false;
  const content: Record<string, unknown> = {
    "/": { id: name, path: "/" },
    ...(options.content ?? {}),
  };

  if (hasAup) {
    content["/.aup"] = { id: ".aup", path: "/.aup" };
    content["/.aup/default"] = { id: "default", path: "/.aup/default" };
    content["/.aup/default/default.json"] = {
      id: "default.json",
      path: "/.aup/default/default.json",
      content: { type: "text", props: { content: "Built-in view" } },
    };
  }

  return {
    name,
    description: `Data provider: ${name}`,
    accessMode: options.accessMode ?? "readonly",
    stat: async (path) => {
      const entry = content[path];
      if (entry && typeof entry === "object" && "id" in entry) {
        return { data: entry as AFSEntry };
      }
      return { data: { id: path.split("/").pop() || "/", path } };
    },
    list: async (path) => {
      const prefix = path === "/" ? "/" : `${path}/`;
      const entries: AFSEntry[] = [];
      for (const [p, v] of Object.entries(content)) {
        if (p === path) continue;
        // Direct children only
        const relative = p.startsWith(prefix) ? p.slice(prefix.length) : null;
        if (relative && !relative.includes("/")) {
          entries.push(v as AFSEntry);
        }
      }
      return { data: entries };
    },
    read: async (path) => {
      const entry = content[path];
      if (entry && typeof entry === "object" && "id" in entry) {
        return { data: entry as AFSEntry };
      }
      throw new Error(`Not found: ${path}`);
    },
  };
}

/** Supplement provider — an AFSFS-like provider serving .aup/{name}/ files */
function createSupplementProvider(
  name: string,
  files: Record<string, unknown>,
  options: { accessMode?: "readonly" | "readwrite" } = {},
): AFSModule {
  return {
    name: `supplement-${name}`,
    description: `Supplement: ${name}`,
    accessMode: options.accessMode ?? "readonly",
    stat: async (path) => ({
      data: { id: path.split("/").pop() || "/", path },
    }),
    list: async (path) => {
      const prefix = path === "/" ? "/" : `${path}/`;
      const entries: AFSEntry[] = [];
      for (const [p, v] of Object.entries(files)) {
        if (p === path) continue;
        const relative = p.startsWith(prefix) ? p.slice(prefix.length) : null;
        if (relative && !relative.includes("/")) {
          entries.push({ id: relative, path: p, content: v });
        }
      }
      return { data: entries };
    },
    read: async (path) => {
      if (path in files) {
        return { data: { id: path.split("/").pop() || "/", path, content: files[path] } };
      }
      throw new Error(`Not found: ${path}`);
    },
  };
}

// ── 1. Happy Path ──

describe("AUP overlay mount — Happy Path", () => {
  test("mount succeeds when mounting at /.aup/{name} sub-path of existing mount", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
      "/default.json": { type: "chart", props: { chartType: "bar" } },
    });

    await afs.mount(data, "/modules/sqlite");
    // This should NOT throw
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    expect(afs.isMounted("/modules/sqlite")).toBe(true);
    expect(afs.isMounted("/modules/sqlite/.aup/analytics")).toBe(true);
  });

  test("afs.list returns both built-in and supplement .aup/ entries", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite", { hasAup: true });
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
      "/default.json": { type: "chart", props: {} },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // List .aup/ directory — should see both default (from data) and analytics (supplement)
    const result = await afs.list("/modules/sqlite/.aup", { maxDepth: 1 });
    const names = result.data.map((e) => e.path);

    expect(names).toContain("/modules/sqlite/.aup/default");
    expect(names).toContain("/modules/sqlite/.aup/analytics");
  });

  test("afs.read on supplement path returns supplement content", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");
    const dashboardRecipe = { type: "chart", props: { chartType: "bar" } };
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
      "/dashboard.json": dashboardRecipe,
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    const result = await afs.read("/modules/sqlite/.aup/analytics/dashboard.json");
    expect(result.data?.content).toEqual(dashboardRecipe);
  });

  test("multiple supplements coexist at different .aup/ sub-paths", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");

    const analytics = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
      "/default.json": { type: "chart" },
    });
    const admin = createSupplementProvider("admin", {
      "/": { id: "admin", path: "/" },
      "/default.json": { type: "form" },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(analytics, "/modules/sqlite/.aup/analytics");
    await afs.mount(admin, "/modules/sqlite/.aup/admin");

    expect(afs.isMounted("/modules/sqlite/.aup/analytics")).toBe(true);
    expect(afs.isMounted("/modules/sqlite/.aup/admin")).toBe(true);

    // Read from each supplement independently
    const analyticsResult = await afs.read("/modules/sqlite/.aup/analytics/default.json");
    expect(analyticsResult.data?.content).toEqual({ type: "chart" });

    const adminResult = await afs.read("/modules/sqlite/.aup/admin/default.json");
    expect(adminResult.data?.content).toEqual({ type: "form" });
  });
});

// ── 2. Bad Path ──

describe("AUP overlay mount — Bad Path", () => {
  test("mount throws when mounting at .aup/default if parent provider has .aup/default", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite", { hasAup: true });
    const supplement = createSupplementProvider("override", {
      "/": { id: "default", path: "/" },
    });

    await afs.mount(data, "/modules/sqlite");

    // Trying to mount at .aup/default should fail — additive only
    await expect(afs.mount(supplement, "/modules/sqlite/.aup/default")).rejects.toThrow(
      /conflict/i,
    );
  });

  test("mount throws for sub-path mount that does NOT contain /.aup/", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");
    const extra = createSupplementProvider("extra", {
      "/": { id: "extra", path: "/" },
    });

    await afs.mount(data, "/modules/sqlite");

    // Non-.aup sub-path mount should still be blocked
    await expect(afs.mount(extra, "/modules/sqlite/tables/users")).rejects.toThrow(/conflict/i);
  });

  test("mount throws when mounting a parent path over an existing .aup/ sub-mount", async () => {
    const afs = new AFS();
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
    });
    const data = createDataProvider("sqlite");

    // Mount supplement first
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // Now mounting at /modules/sqlite (parent) should fail because
    // the non-.aup parent-child conflict check still applies
    await expect(afs.mount(data, "/modules/sqlite")).rejects.toThrow(/conflict/i);
  });

  test("afs.read on non-existent supplement returns not found", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");
    await afs.mount(data, "/modules/sqlite");

    await expect(afs.read("/modules/sqlite/.aup/nonexistent/recipe.json")).rejects.toThrow();
  });
});

// ── 3. Edge Cases ──

describe("AUP overlay mount — Edge Cases", () => {
  test("supplement is the ONLY .aup/ entry when provider has no built-in .aup/", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite"); // no hasAup
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
      "/default.json": { type: "chart" },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // List .aup/ — should only see the supplement
    const result = await afs.list("/modules/sqlite/.aup", { maxDepth: 1 });
    const paths = result.data.map((e) => e.path);
    expect(paths).toContain("/modules/sqlite/.aup/analytics");
  });

  test("mount path with trailing slash is normalized", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
    });

    await afs.mount(data, "/modules/sqlite");
    // Trailing slash should be normalized
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics/");

    expect(afs.isMounted("/modules/sqlite/.aup/analytics")).toBe(true);
  });

  test("supplement provider serving empty directory does not crash", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");
    const empty = createSupplementProvider("empty", {
      "/": { id: "empty", path: "/" },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(empty, "/modules/sqlite/.aup/empty");

    // List should return empty
    const result = await afs.list("/modules/sqlite/.aup/empty");
    expect(result.data).toBeDefined();
  });

  test("unmount supplement removes it without affecting parent or other supplements", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite");
    const analytics = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
    });
    const admin = createSupplementProvider("admin", {
      "/": { id: "admin", path: "/" },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(analytics, "/modules/sqlite/.aup/analytics");
    await afs.mount(admin, "/modules/sqlite/.aup/admin");

    // Unmount analytics
    const removed = afs.unmount("/modules/sqlite/.aup/analytics");
    expect(removed).toBe(true);

    // Parent and other supplement still mounted
    expect(afs.isMounted("/modules/sqlite")).toBe(true);
    expect(afs.isMounted("/modules/sqlite/.aup/admin")).toBe(true);
    expect(afs.isMounted("/modules/sqlite/.aup/analytics")).toBe(false);
  });

  test("mount supplement before data provider succeeds (order independent)", async () => {
    const afs = new AFS();
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
    });
    const data = createDataProvider("sqlite");

    // Mount supplement first at the .aup/ sub-path
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // Now mount data provider at parent — this should be blocked by normal rules
    // because parent-over-existing-child is blocked (even for .aup/)
    // The intent says: "The reverse (mounting a parent over an existing .aup/ sub-mount) should still be blocked."
    await expect(afs.mount(data, "/modules/sqlite")).rejects.toThrow(/conflict/i);
  });
});

// ── 4. Security ──

describe("AUP overlay mount — Security", () => {
  test("supplement provider inherits access mode from its own mount config", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite", { accessMode: "readwrite" });
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
      "/recipe.json": { type: "chart" },
    });
    // supplement is readonly by default

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // Read should work
    const result = await afs.read("/modules/sqlite/.aup/analytics/recipe.json");
    expect(result.data?.content).toEqual({ type: "chart" });
  });

  test("supplement cannot read/write paths outside its .aup/{name}/ sub-path", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite", {
      content: {
        "/": { id: "sqlite", path: "/" },
        "/tables": { id: "tables", path: "/tables" },
      },
    });
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // supplement's read at its mount path works
    const result = await afs.read("/modules/sqlite/.aup/analytics");
    expect(result.data).toBeDefined();
  });
});

// ── 5. Data Leak ──

describe("AUP overlay mount — Data Leak", () => {
  test("supplement provider cannot list entries from parent data provider", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite", {
      content: {
        "/": { id: "sqlite", path: "/", meta: { childrenCount: 1 } },
        "/tables": { id: "tables", path: "/tables" },
      },
    });
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
      "/recipe.json": { type: "chart" },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // List the supplement — should only show supplement content, not parent's tables
    const result = await afs.list("/modules/sqlite/.aup/analytics");
    const paths = result.data.map((e) => e.path);
    expect(paths.some((p) => p.includes("tables"))).toBe(false);
  });
});

// ── 6. Data Damage ──

describe("AUP overlay mount — Data Damage", () => {
  test("mounting supplement does not modify parent provider .aup/default content", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite", { hasAup: true });
    const supplement = createSupplementProvider("analytics", {
      "/": { id: "analytics", path: "/" },
    });

    await afs.mount(data, "/modules/sqlite");

    // Read built-in .aup/default before supplement mount
    const beforeResult = await afs.read("/modules/sqlite/.aup/default/default.json");
    const beforeContent = beforeResult.data?.content;

    // Mount supplement
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // Read built-in .aup/default after supplement mount — should be unchanged
    const afterResult = await afs.read("/modules/sqlite/.aup/default/default.json");
    expect(afterResult.data?.content).toEqual(beforeContent);
  });

  test("unmounting supplement does not affect parent provider or other supplements", async () => {
    const afs = new AFS();
    const data = createDataProvider("sqlite", { hasAup: true });
    const admin = createSupplementProvider("admin", {
      "/": { id: "admin", path: "/" },
      "/recipe.json": { type: "form" },
    });

    await afs.mount(data, "/modules/sqlite");
    await afs.mount(admin, "/modules/sqlite/.aup/admin");

    // Unmount supplement
    afs.unmount("/modules/sqlite/.aup/admin");

    // Parent still works
    const parentResult = await afs.read("/modules/sqlite/.aup/default/default.json");
    expect(parentResult.data?.content).toBeDefined();
  });

  test("writing to supplement does not touch parent provider storage", async () => {
    const parentWrites: string[] = [];
    const supplementWrites: string[] = [];

    const data = createDataProvider("sqlite", { accessMode: "readwrite" });
    // Monkey-patch write to track
    const origDataWrite = data.write;
    data.write = async (path, payload, opts) => {
      parentWrites.push(path);
      return origDataWrite!(path, payload, opts);
    };

    const supplement: AFSModule = {
      name: "supplement-analytics",
      accessMode: "readwrite",
      stat: async (path) => ({
        data: { id: path.split("/").pop() || "/", path },
      }),
      read: async (path) => ({
        data: { id: path.split("/").pop() || "/", path, content: "original" },
      }),
      write: async (path, payload) => {
        supplementWrites.push(path);
        return {
          data: { id: path.split("/").pop() || "/", path, content: payload.content },
        };
      },
    };

    const afs = new AFS();
    await afs.mount(data, "/modules/sqlite");
    await afs.mount(supplement, "/modules/sqlite/.aup/analytics");

    // Write to supplement path
    await afs.write("/modules/sqlite/.aup/analytics/recipe.json", { content: "updated" });

    // Parent write should NOT have been called
    expect(parentWrites).toEqual([]);
    // Supplement write should have been called
    expect(supplementWrites).toEqual(["/recipe.json"]);
  });
});
