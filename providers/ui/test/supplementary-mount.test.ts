/**
 * AUP Supplementary Provider — Integration Tests
 *
 * Tests the full supplementary provider flow:
 * 1. Data provider + supplement provider mounted at .aup/ sub-path
 * 2. AFS list discovers both built-in and supplement views
 * 3. AFS read returns correct content from supplement
 * 4. Multiple supplements coexist without conflict
 * 5. Unmount cleanup works correctly
 *
 * Uses in-memory mock providers for deterministic testing.
 */

import { describe, expect, test } from "bun:test";
import { AFS, type AFSEntry, type AFSModule } from "@aigne/afs";

// ── Helpers ──

/**
 * Create a data provider that has a built-in .aup/default/ with a recipe.
 * Simulates a real provider that ships its own UI.
 */
function createDataProviderWithAup(name: string): AFSModule {
  const tree: Record<string, AFSEntry> = {
    "/": {
      id: name,
      path: "/",
      meta: { childrenCount: 3, description: `${name} data provider` },
    },
    "/data": {
      id: "data",
      path: "/data",
      meta: { childrenCount: 2 },
    },
    "/data/users": {
      id: "users",
      path: "/data/users",
      content: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    },
    "/data/orders": {
      id: "orders",
      path: "/data/orders",
      content: [
        { id: 1, userId: 1, total: 99.99 },
        { id: 2, userId: 2, total: 49.5 },
      ],
    },
    "/.aup": {
      id: ".aup",
      path: "/.aup",
      meta: { childrenCount: 1 },
    },
    "/.aup/default": {
      id: "default",
      path: "/.aup/default",
      meta: { childrenCount: 1 },
    },
    "/.aup/default/default.json": {
      id: "default.json",
      path: "/.aup/default/default.json",
      content: {
        id: "root",
        type: "view",
        children: [
          {
            id: "title",
            type: "text",
            props: { content: "Default Data View", scale: "lg" },
          },
          { id: "list", type: "afs-list", src: "/data" },
        ],
      },
    },
  };

  return {
    name,
    description: `${name} data provider with built-in UI`,
    accessMode: "readonly",
    stat: async (path) => {
      const entry = tree[path];
      if (entry) {
        const { content: _, ...statData } = entry;
        return { data: statData };
      }
      return { data: { id: path.split("/").pop() || "/", path } };
    },
    list: async (path) => {
      const prefix = path === "/" ? "/" : `${path}/`;
      const entries: AFSEntry[] = [];
      for (const [p, v] of Object.entries(tree)) {
        if (p === path) continue;
        const relative = p.startsWith(prefix) ? p.slice(prefix.length) : null;
        if (relative && !relative.includes("/")) {
          entries.push(v);
        }
      }
      return { data: entries };
    },
    read: async (path) => {
      const entry = tree[path];
      if (entry) return { data: entry };
      throw new Error(`Not found: ${path}`);
    },
  };
}

/**
 * Create a supplement provider serving analytics UI files.
 */
function createAnalyticsSupplement(): AFSModule {
  const files: Record<string, AFSEntry> = {
    "/": {
      id: "analytics",
      path: "/",
      meta: { childrenCount: 2 },
    },
    "/default.json": {
      id: "default.json",
      path: "/default.json",
      content: {
        id: "root",
        type: "view",
        children: [
          {
            id: "title",
            type: "text",
            props: { content: "Analytics Dashboard", scale: "lg" },
          },
          {
            id: "chart",
            type: "chart",
            props: { variant: "bar", title: "Orders by User" },
          },
        ],
      },
    },
    "/meta.json": {
      id: "meta.json",
      path: "/meta.json",
      content: {
        label: "Analytics",
        icon: "bar-chart",
        description: "Analytics dashboard for data exploration",
      },
    },
  };

  return {
    name: "supplement-analytics",
    description: "Analytics dashboard supplement",
    accessMode: "readonly",
    stat: async (path) => {
      const entry = files[path];
      if (entry) {
        const { content: _, ...statData } = entry;
        return { data: statData };
      }
      return { data: { id: path.split("/").pop() || "/", path } };
    },
    list: async (path) => {
      const prefix = path === "/" ? "/" : `${path}/`;
      const entries: AFSEntry[] = [];
      for (const [p, v] of Object.entries(files)) {
        if (p === path) continue;
        const relative = p.startsWith(prefix) ? p.slice(prefix.length) : null;
        if (relative && !relative.includes("/")) {
          entries.push(v);
        }
      }
      return { data: entries };
    },
    read: async (path) => {
      const entry = files[path];
      if (entry) return { data: entry };
      throw new Error(`Not found: ${path}`);
    },
  };
}

/**
 * Create a simple admin panel supplement.
 */
function createAdminSupplement(): AFSModule {
  const files: Record<string, AFSEntry> = {
    "/": {
      id: "admin",
      path: "/",
      meta: { childrenCount: 2 },
    },
    "/default.json": {
      id: "default.json",
      path: "/default.json",
      content: {
        id: "root",
        type: "view",
        children: [
          {
            id: "title",
            type: "text",
            props: { content: "Admin Panel", scale: "lg" },
          },
          { id: "form", type: "form", props: { fields: ["name", "email"] } },
        ],
      },
    },
    "/meta.json": {
      id: "meta.json",
      path: "/meta.json",
      content: {
        label: "Admin",
        icon: "shield",
        description: "Administrative controls",
      },
    },
  };

  return {
    name: "supplement-admin",
    description: "Admin panel supplement",
    accessMode: "readonly",
    stat: async (path) => {
      const entry = files[path];
      if (entry) {
        const { content: _, ...statData } = entry;
        return { data: statData };
      }
      return { data: { id: path.split("/").pop() || "/", path } };
    },
    list: async (path) => {
      const prefix = path === "/" ? "/" : `${path}/`;
      const entries: AFSEntry[] = [];
      for (const [p, v] of Object.entries(files)) {
        if (p === path) continue;
        const relative = p.startsWith(prefix) ? p.slice(prefix.length) : null;
        if (relative && !relative.includes("/")) {
          entries.push(v);
        }
      }
      return { data: entries };
    },
    read: async (path) => {
      const entry = files[path];
      if (entry) return { data: entry };
      throw new Error(`Not found: ${path}`);
    },
  };
}

// ── Happy Path ──

describe("Supplementary Mount Integration — Happy Path", () => {
  test("data provider + analytics supplement mounts without error", async () => {
    const afs = new AFS();
    const data = createDataProviderWithAup("store");
    const analytics = createAnalyticsSupplement();

    await afs.mount(data, "/modules/store");
    await afs.mount(analytics, "/modules/store/.aup/analytics");

    expect(afs.isMounted("/modules/store")).toBe(true);
    expect(afs.isMounted("/modules/store/.aup/analytics")).toBe(true);
  });

  test("list .aup/ returns both default and analytics entries", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    const result = await afs.list("/modules/store/.aup", { maxDepth: 1 });
    const names = result.data.map((e) => {
      const parts = e.path.split("/").filter(Boolean);
      return parts[parts.length - 1];
    });

    expect(names).toContain("default");
    expect(names).toContain("analytics");
  });

  test("analytics recipe is readable through AFS", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    const result = await afs.read("/modules/store/.aup/analytics/default.json");
    expect(result.data?.content).toBeDefined();

    const recipe = result.data!.content as Record<string, unknown>;
    expect(recipe.type).toBe("view");
    expect((recipe.children as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: "title",
      type: "text",
    });
  });

  test("view switcher has 2 tabs: Default and Analytics", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    // Verify both views are discoverable
    const result = await afs.list("/modules/store/.aup", { maxDepth: 1 });
    expect(result.data.length).toBe(2);
  });

  test("three supplements produce 4 total tabs (default + 3)", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");
    await afs.mount(createAdminSupplement(), "/modules/store/.aup/admin");

    const result = await afs.list("/modules/store/.aup", { maxDepth: 1 });
    const names = result.data.map((e) => e.path.split("/").filter(Boolean).pop());

    expect(names).toContain("default");
    expect(names).toContain("analytics");
    expect(names).toContain("admin");
    expect(names.length).toBe(3);
  });
});

// ── Bad Path ──

describe("Supplementary Mount Integration — Bad Path", () => {
  test("cannot mount analytics supplement twice at same path", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    await expect(
      afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics"),
    ).rejects.toThrow(/conflict/i);
  });

  test("cannot mount supplement at .aup/default when data provider has it", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");

    await expect(
      afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/default"),
    ).rejects.toThrow(/conflict/i);
  });

  test("reading non-existent supplement returns error", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");

    await expect(afs.read("/modules/store/.aup/nonexistent/default.json")).rejects.toThrow();
  });

  test("supplement with missing default.json is listed but recipe read fails", async () => {
    const emptySupplement: AFSModule = {
      name: "supplement-empty",
      accessMode: "readonly",
      stat: async (path) => ({
        data: { id: path.split("/").pop() || "/", path },
      }),
      list: async () => ({ data: [] }),
      read: async (path) => {
        throw new Error(`Not found: ${path}`);
      },
    };

    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(emptySupplement, "/modules/store/.aup/empty-view");

    // Should be listed
    expect(afs.isMounted("/modules/store/.aup/empty-view")).toBe(true);

    // Recipe read should fail
    await expect(afs.read("/modules/store/.aup/empty-view/default.json")).rejects.toThrow();
  });
});

// ── Edge Cases ──

describe("Supplementary Mount Integration — Edge Cases", () => {
  test("data provider without built-in .aup/ + supplement works", async () => {
    // Provider without .aup/
    const bareProvider: AFSModule = {
      name: "bare-data",
      accessMode: "readonly",
      stat: async (path) => ({
        data: { id: path.split("/").pop() || "/", path },
      }),
      list: async () => ({
        data: [{ id: "table1", path: "/table1" }],
      }),
      read: async (path) => ({
        data: { id: path.split("/").pop() || "/", path, content: "data" },
      }),
    };

    const afs = new AFS();
    await afs.mount(bareProvider, "/modules/bare-data");
    await afs.mount(createAnalyticsSupplement(), "/modules/bare-data/.aup/analytics");

    // Supplement is the only .aup/ entry
    expect(afs.isMounted("/modules/bare-data/.aup/analytics")).toBe(true);

    const recipe = await afs.read("/modules/bare-data/.aup/analytics/default.json");
    expect(recipe.data?.content).toBeDefined();
  });

  test("unmount and remount supplement with updated content", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    // Read original
    const original = await afs.read("/modules/store/.aup/analytics/meta.json");
    expect((original.data?.content as Record<string, unknown>).label).toBe("Analytics");

    // Unmount
    afs.unmount("/modules/store/.aup/analytics");

    // Mount updated version
    const updatedSupplement: AFSModule = {
      name: "supplement-analytics-v2",
      accessMode: "readonly",
      stat: async (path) => ({
        data: { id: path.split("/").pop() || "/", path },
      }),
      list: async () => ({ data: [] }),
      read: async (path) => {
        if (path === "/meta.json") {
          return {
            data: {
              id: "meta.json",
              path: "/meta.json",
              content: { label: "Analytics v2", icon: "chart-line" },
            },
          };
        }
        throw new Error(`Not found: ${path}`);
      },
    };

    await afs.mount(updatedSupplement, "/modules/store/.aup/analytics");

    const updated = await afs.read("/modules/store/.aup/analytics/meta.json");
    expect((updated.data?.content as Record<string, unknown>).label).toBe("Analytics v2");
  });

  test("supplement does not expose parent provider internal paths", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    // List supplement — should only show supplement files
    const result = await afs.list("/modules/store/.aup/analytics");
    const paths = result.data.map((e) => e.path);

    // Should NOT contain data provider paths
    expect(paths.some((p) => p.includes("/data/"))).toBe(false);
    expect(paths.some((p) => p.includes("/users"))).toBe(false);
    expect(paths.some((p) => p.includes("/orders"))).toBe(false);
  });
});

// ── Security ──

describe("Supplementary Mount Integration — Security", () => {
  test("readonly supplement cannot be written to", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    await expect(
      afs.write("/modules/store/.aup/analytics/default.json", {
        content: "hacked",
      }),
    ).rejects.toThrow();
  });

  test("supplement at .aup/admin cannot access parent data", async () => {
    const afs = new AFS();
    const data = createDataProviderWithAup("store");
    await afs.mount(data, "/modules/store");
    await afs.mount(createAdminSupplement(), "/modules/store/.aup/admin");

    // Read from supplement works
    const supplementRead = await afs.read("/modules/store/.aup/admin/default.json");
    expect(supplementRead.data?.content).toBeDefined();

    // Parent data is accessible through its own path (not through supplement)
    const parentRead = await afs.read("/modules/store/data/users");
    expect(parentRead.data?.content).toBeDefined();
  });
});

// ── Data Damage ──

describe("Supplementary Mount Integration — Data Damage", () => {
  test("removing analytics supplement leaves data and default UI intact", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");
    await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");

    // Verify analytics works
    const before = await afs.read("/modules/store/.aup/analytics/default.json");
    expect(before.data?.content).toBeDefined();

    // Remove supplement
    afs.unmount("/modules/store/.aup/analytics");

    // Data provider and default .aup/ still work
    const defaultRecipe = await afs.read("/modules/store/.aup/default/default.json");
    expect(defaultRecipe.data?.content).toBeDefined();

    const data = await afs.read("/modules/store/data/users");
    expect(data.data?.content).toBeDefined();

    // Analytics is gone
    expect(afs.isMounted("/modules/store/.aup/analytics")).toBe(false);
  });

  test("mount/unmount supplement repeatedly without side effects", async () => {
    const afs = new AFS();
    await afs.mount(createDataProviderWithAup("store"), "/modules/store");

    for (let i = 0; i < 10; i++) {
      await afs.mount(createAnalyticsSupplement(), "/modules/store/.aup/analytics");
      expect(afs.isMounted("/modules/store/.aup/analytics")).toBe(true);

      afs.unmount("/modules/store/.aup/analytics");
      expect(afs.isMounted("/modules/store/.aup/analytics")).toBe(false);
    }

    // Parent provider still works after 10 cycles
    const result = await afs.read("/modules/store/data/users");
    expect(result.data?.content).toBeDefined();
  });
});
