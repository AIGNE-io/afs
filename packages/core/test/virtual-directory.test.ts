import { beforeEach, describe, expect, test } from "bun:test";
import { AFS, type AFSModule } from "@aigne/afs";

/**
 * Helper to create a minimal module with list + read support
 */
function createModule(
  name: string,
  opts?: { description?: string; children?: string[] },
): AFSModule {
  const children = opts?.children ?? ["child-a", "child-b"];
  return {
    name,
    description: opts?.description,
    stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
    list: async (path, _options) => ({
      data: children.map((c) => ({
        id: c,
        path: path === "/" ? `/${c}` : `${path}/${c}`,
        meta: { childrenCount: 0 },
      })),
    }),
    read: async (path) => {
      if (path === "/") {
        return {
          data: {
            id: "/",
            path: "/",
            meta: { childrenCount: children.length },
          },
        };
      }
      const seg = path.split("/").filter(Boolean);
      const childName = seg[0]!;
      if (children.includes(childName)) {
        return {
          data: {
            id: childName,
            path: `/${childName}`,
            content: `content of ${childName}`,
            meta: { childrenCount: undefined },
          },
        };
      }
      return { data: undefined };
    },
  };
}

describe("list with deep mount paths (virtual intermediate directories)", () => {
  let afs: AFS;
  let catalogModule: AFSModule;
  let cloudflareModule: AFSModule;

  beforeEach(async () => {
    catalogModule = createModule("official", {
      description: "Official catalog",
      children: ["provider-a", "provider-b"],
    });
    cloudflareModule = createModule("cloudflare", {
      description: "Cloudflare account",
      children: ["workers", "kv", "pages"],
    });

    afs = new AFS();
    await afs.mount(catalogModule, "/catalog/official");
    await afs.mount(cloudflareModule, "/cloudflare");
  });

  test("maxDepth=1 from root: deep mount shows as virtual dir, shallow mount shows as mount entry", async () => {
    const result = await afs.list("/", { maxDepth: 1 });

    // /cloudflare is 1 segment deep → shown as mount entry
    // /catalog/official is 2 segments deep → only /catalog shown as virtual dir
    expect(result.data).toHaveLength(2);

    const cloudflareEntry = result.data.find((e) => e.path === "/cloudflare");
    expect(cloudflareEntry).toBeDefined();
    expect(cloudflareEntry!.id).toBe("cloudflare");
    expect(cloudflareEntry!.summary).toBe("Cloudflare account");
    expect(cloudflareEntry!.meta?.childrenCount).toBe(-1);

    const catalogEntry = result.data.find((e) => e.path === "/catalog");
    expect(catalogEntry).toBeDefined();
    expect(catalogEntry!.id).toBe("catalog");
    expect(catalogEntry!.meta?.childrenCount).toBe(-1);
    // Virtual dir should NOT have module summary
    expect(catalogEntry!.summary).toBeUndefined();
  });

  test("maxDepth=2 from root: deep mount shows as mount entry", async () => {
    const result = await afs.list("/", { maxDepth: 2 });

    // /catalog/official is 2 segments deep, with maxDepth=2 it should show as mount entry
    const officialEntry = result.data.find((e) => e.path === "/catalog/official");
    expect(officialEntry).toBeDefined();
    expect(officialEntry!.id).toBe("official");
    expect(officialEntry!.summary).toBe("Official catalog");

    // /cloudflare with maxDepth=2: mount entry + provider children
    const cloudflareChildren = result.data.filter((e) => e.path.startsWith("/cloudflare/"));
    expect(cloudflareChildren.length).toBeGreaterThan(0);
  });

  test("maxDepth=1 from /catalog: mount entry shown at mount path", async () => {
    const result = await afs.list("/catalog", { maxDepth: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.path).toBe("/catalog/official");
    expect(result.data[0]!.id).toBe("official");
    expect(result.data[0]!.summary).toBe("Official catalog");
  });

  test("maxDepth=1 deduplicates shared prefix from multiple deep mounts", async () => {
    // Add another mount under /catalog
    const communityModule = createModule("community", {
      description: "Community catalog",
    });
    await afs.mount(communityModule, "/catalog/community");

    const result = await afs.list("/", { maxDepth: 1 });

    // Both /catalog/official and /catalog/community collapse to single /catalog entry
    const catalogEntries = result.data.filter((e) => e.path === "/catalog");
    expect(catalogEntries).toHaveLength(1);

    // Total entries: /cloudflare + /catalog
    expect(result.data).toHaveLength(2);
  });

  test("maxDepth=3 from root: expands into provider children", async () => {
    const result = await afs.list("/", { maxDepth: 3 });

    // /catalog/official with maxDepth=1 calls provider.list → returns children
    const officialChildren = result.data.filter((e) => e.path.startsWith("/catalog/official/"));
    expect(officialChildren.length).toBeGreaterThan(0);
  });
});

describe("list with triple-deep mount paths", () => {
  test("maxDepth=1 shows only first segment", async () => {
    const afs = new AFS();
    const mod = createModule("deep-mod");
    await afs.mount(mod, "/a/b/c");

    const result = await afs.list("/", { maxDepth: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.path).toBe("/a");
    expect(result.data[0]!.id).toBe("a");
  });

  test("maxDepth=2 shows two segments", async () => {
    const afs = new AFS();
    const mod = createModule("deep-mod");
    await afs.mount(mod, "/a/b/c");

    const result = await afs.list("/", { maxDepth: 2 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.path).toBe("/a/b");
    expect(result.data[0]!.id).toBe("b");
  });

  test("maxDepth=3 shows mount entry", async () => {
    const afs = new AFS();
    const mod = createModule("deep-mod", { description: "Deep module" });
    await afs.mount(mod, "/a/b/c");

    const result = await afs.list("/", { maxDepth: 3 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.path).toBe("/a/b/c");
    expect(result.data[0]!.id).toBe("deep-mod");
    expect(result.data[0]!.summary).toBe("Deep module");
  });
});

describe("read virtual intermediate directory", () => {
  let afs: AFS;

  beforeEach(async () => {
    afs = new AFS();
    const catalogModule = createModule("official", {
      description: "Official catalog",
      children: ["provider-a"],
    });
    const communityModule = createModule("community", {
      description: "Community catalog",
      children: ["provider-b"],
    });
    await afs.mount(catalogModule, "/catalog/official");
    await afs.mount(communityModule, "/catalog/community");
  });

  test("read virtual intermediate dir returns directory entry with childrenCount", async () => {
    const result = await afs.read("/catalog");

    expect(result.data).toBeDefined();
    expect(result.data!.id).toBe("catalog");
    expect(result.data!.path).toBe("/catalog");
    expect(result.data!.meta?.childrenCount).toBe(2); // official + community
  });

  test("read actual mount path delegates to provider", async () => {
    const result = await afs.read("/catalog/official");

    expect(result.data).toBeDefined();
    expect(result.data!.meta?.childrenCount).toBe(1); // provider-a
  });

  test("read non-existent intermediate path throws AFSNotFoundError", async () => {
    const { AFSNotFoundError } = await import("../src/error.js");
    await expect(afs.read("/nonexistent")).rejects.toBeInstanceOf(AFSNotFoundError);
  });

  test("read root as virtual directory", async () => {
    const result = await afs.read("/");

    expect(result.data).toBeDefined();
    expect(result.data!.path).toBe("/");
    // childrenCount = unique first segments of all mounts
    expect(result.data!.meta?.childrenCount).toBe(1); // just "catalog"
  });

  test("read single-mount virtual directory", async () => {
    const afs2 = new AFS();
    const mod = createModule("my-module");
    await afs2.mount(mod, "/deep/nested/path");

    // Read /deep
    const result1 = await afs2.read("/deep");
    expect(result1.data).toBeDefined();
    expect(result1.data!.id).toBe("deep");
    expect(result1.data!.meta?.childrenCount).toBe(1); // "nested"

    // Read /deep/nested
    const result2 = await afs2.read("/deep/nested");
    expect(result2.data).toBeDefined();
    expect(result2.data!.id).toBe("nested");
    expect(result2.data!.meta?.childrenCount).toBe(1); // "path"
  });
});

describe("stat virtual intermediate directory", () => {
  let afs: AFS;

  beforeEach(async () => {
    afs = new AFS();
    const catalogModule = createModule("official", {
      description: "Official catalog",
      children: ["provider-a"],
    });
    const communityModule = createModule("community", {
      description: "Community catalog",
      children: ["provider-b"],
    });
    await afs.mount(catalogModule, "/catalog/official");
    await afs.mount(communityModule, "/catalog/community");
  });

  test("stat virtual intermediate dir returns directory entry, not provider root", async () => {
    const result = await afs.stat("/catalog");

    expect(result.data).toBeDefined();
    expect(result.data!.id).toBe("catalog");
    expect(result.data!.path).toBe("/catalog");
    expect(result.data!.meta?.childrenCount).toBe(2); // official + community
    // Should NOT have provider-specific kind
    expect(result.data!.meta?.kind).toBeUndefined();
  });

  test("stat actual mount path delegates to provider", async () => {
    const result = await afs.stat("/catalog/official");

    expect(result.data).toBeDefined();
    // Provider returns its own root data
    expect(result.data!.id).toBe("/");
  });

  test("stat non-existent path throws AFSNotFoundError", async () => {
    const { AFSNotFoundError } = await import("../src/error.js");
    await expect(afs.stat("/nonexistent")).rejects.toBeInstanceOf(AFSNotFoundError);
  });

  test("stat deep virtual intermediate dir", async () => {
    const afs2 = new AFS();
    const mod = createModule("deep-mod");
    await afs2.mount(mod, "/a/b/c");

    const result = await afs2.stat("/a");
    expect(result.data).toBeDefined();
    expect(result.data!.id).toBe("a");
    expect(result.data!.meta?.childrenCount).toBe(1); // "b"

    const result2 = await afs2.stat("/a/b");
    expect(result2.data).toBeDefined();
    expect(result2.data!.id).toBe("b");
    expect(result2.data!.meta?.childrenCount).toBe(1); // "c"
  });
});
