/**
 * E2E integration test — mock OCAP + supplementary recipe providers.
 *
 * Validates the complete chain explorer flow:
 * 1. OCAP provider returns list/read data for a collection
 * 2. Supplementary provider serves .aup/ recipes on the same mount
 * 3. AFS routing merges both at the correct paths
 * 4. Recipe + data can be read independently for binding
 *
 * Mount strategy: each collection is its own mount (matching how a real
 * split-mount architecture works with AFS supplementary mounts).
 */
import { describe, expect, test } from "bun:test";
import { AFS, type AFSEntry, type AFSModule } from "@aigne/afs";

/* ── Mock token collection provider ── */

function createMockTokenProvider(): AFSModule {
  const tokens: AFSEntry[] = [
    {
      id: "z1token1",
      path: "/z1token1",
      content: {
        address: "z1token1",
        symbol: "TBA",
        name: "Test Token A",
        totalSupply: "1000000000000000000000",
        decimal: 18,
        genesisTime: "2024-01-01T00:00:00Z",
      },
      meta: { kind: "ocap:token" },
    },
    {
      id: "z1token2",
      path: "/z1token2",
      content: {
        address: "z1token2",
        symbol: "TBB",
        name: "Test Token B",
        totalSupply: "5000000000000000000000000",
        decimal: 18,
        genesisTime: "2024-06-15T12:00:00Z",
      },
      meta: { kind: "ocap:token" },
    },
  ];

  return {
    name: "mock-tokens",
    accessMode: "readonly",
    stat: async (path: string) => {
      if (path === "/" || path === "") {
        return {
          data: {
            id: "tokens",
            path: "/",
            meta: { kind: "ocap:collection", childrenCount: tokens.length },
          },
        };
      }
      const token = tokens.find((t) => t.path === path);
      if (token) return { data: { id: token.id, path, meta: token.meta } };
      throw new Error(`not found: ${path}`);
    },
    list: async (path: string, options?: { offset?: number; limit?: number }) => {
      if (path === "/" || path === "") {
        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? 100;
        return { data: tokens.slice(offset, offset + limit), total: tokens.length };
      }
      throw new Error(`not found: ${path}`);
    },
    read: async (path: string) => {
      const token = tokens.find((t) => t.path === path);
      if (token) return { data: token };
      throw new Error(`not found: ${path}`);
    },
  };
}

/* ── Mock recipe providers ── */

function createMockListRecipeProvider(recipe: Record<string, unknown>): AFSModule {
  return {
    name: "mock-list-recipe",
    accessMode: "readonly",
    stat: async (path: string) => ({
      data: { id: path.split("/").pop() || "/", path },
    }),
    list: async () => ({
      data: [{ id: "default.json", path: "/default.json", content: recipe, meta: {} }],
    }),
    read: async (path: string) => {
      if (path === "/default.json" || path === "/")
        return { data: { id: "default.json", path, content: recipe } };
      throw new Error("not found");
    },
  };
}

function createMockItemRecipeProvider(recipe: Record<string, unknown>): AFSModule {
  return {
    name: "mock-item-recipe",
    accessMode: "readonly",
    stat: async (path: string) => ({
      data: { id: path.split("/").pop() || "/", path },
    }),
    list: async () => ({
      data: [{ id: "item.json", path: "/item.json", content: recipe, meta: {} }],
    }),
    read: async (path: string) => {
      if (path === "/item.json" || path === "/")
        return { data: { id: "item.json", path, content: recipe } };
      throw new Error("not found");
    },
  };
}

/* ── Test recipes ── */

const tokenListRecipe = {
  id: "token-list",
  type: "afs-list",
  src: "/tokens",
  props: {
    layout: "table",
    columns: [
      { key: "content.symbol", label: "Symbol" },
      { key: "content.totalSupply", label: "Supply", format: "bignum:18" },
    ],
  },
};

const tokenItemRecipe = {
  id: "token-detail",
  type: "view",
  props: { layout: { direction: "column", gap: "md" } },
  children: [
    { id: "title", type: "text", props: { content: "Token: ${content.symbol}" } },
    { id: "supply", type: "text", props: { content: "Supply: ${content.totalSupply|bignum:18}" } },
  ],
};

/* ── Tests ── */

describe("Chain Explorer E2E — supplementary recipe discovery", () => {
  test("list recipe is discoverable at .aup/default", async () => {
    const afs = new AFS();
    await afs.mount(createMockTokenProvider(), "/tokens");
    await afs.mount(createMockListRecipeProvider(tokenListRecipe), "/tokens/.aup/default");

    // Recipe is accessible
    const recipe = await afs.read("/tokens/.aup/default/default.json");
    expect(recipe.data?.content).toBeDefined();
    expect((recipe.data!.content as Record<string, unknown>).type).toBe("afs-list");
  });

  test("item recipe is discoverable at .aup/item-view", async () => {
    const afs = new AFS();
    await afs.mount(createMockTokenProvider(), "/tokens");
    await afs.mount(createMockItemRecipeProvider(tokenItemRecipe), "/tokens/.aup/item-view");

    const recipe = await afs.read("/tokens/.aup/item-view/item.json");
    expect(recipe.data?.content).toBeDefined();
    expect((recipe.data!.content as Record<string, unknown>).type).toBe("view");
  });

  test("data and recipes coexist — same mount prefix", async () => {
    const afs = new AFS();
    await afs.mount(createMockTokenProvider(), "/tokens");
    await afs.mount(createMockListRecipeProvider(tokenListRecipe), "/tokens/.aup/default");
    await afs.mount(createMockItemRecipeProvider(tokenItemRecipe), "/tokens/.aup/item-view");

    // Data is accessible
    const tokenData = await afs.read("/tokens/z1token1");
    expect(tokenData.data?.content).toBeDefined();
    expect((tokenData.data!.content as Record<string, unknown>).symbol).toBe("TBA");

    // List is accessible (2 tokens + .aup virtual dir from supplementary mounts)
    const tokenList = await afs.list("/tokens");
    expect(tokenList.data!.length).toBeGreaterThanOrEqual(2);
    const tokenEntries = tokenList.data!.filter((e) => e.id !== ".aup");
    expect(tokenEntries).toHaveLength(2);

    // List recipe is accessible
    const listRecipe = await afs.read("/tokens/.aup/default/default.json");
    expect((listRecipe.data!.content as Record<string, unknown>).id).toBe("token-list");

    // Item recipe is accessible
    const itemRecipe = await afs.read("/tokens/.aup/item-view/item.json");
    expect((itemRecipe.data!.content as Record<string, unknown>).id).toBe("token-detail");
  });

  test("stat distinguishes directory from leaf for recipe dispatch", async () => {
    const afs = new AFS();
    await afs.mount(createMockTokenProvider(), "/tokens");

    // Directory — has childrenCount
    const dirStat = await afs.stat("/tokens");
    expect(dirStat.data?.meta?.childrenCount).toBeGreaterThanOrEqual(0);

    // Leaf — no childrenCount (triggers leaf recipe path in surface)
    const leafStat = await afs.stat("/tokens/z1token1");
    expect(leafStat.data?.meta?.childrenCount).toBeUndefined();
  });

  test("binding data: leaf read returns content for template substitution", async () => {
    const afs = new AFS();
    await afs.mount(createMockTokenProvider(), "/tokens");

    const token = await afs.read("/tokens/z1token1");
    const content = token.data?.content as Record<string, unknown>;

    // These are the fields referenced by ${content.symbol} and ${content.totalSupply|bignum:18}
    expect(content.symbol).toBe("TBA");
    expect(content.totalSupply).toBe("1000000000000000000000");
    expect(content.decimal).toBe(18);
  });

  test("multiple supplementary providers on same collection", async () => {
    const afs = new AFS();
    await afs.mount(createMockTokenProvider(), "/tokens");
    await afs.mount(createMockListRecipeProvider(tokenListRecipe), "/tokens/.aup/default");
    await afs.mount(createMockItemRecipeProvider(tokenItemRecipe), "/tokens/.aup/item-view");

    // Both recipe providers are accessible independently
    const listRecipe = await afs.read("/tokens/.aup/default/default.json");
    expect((listRecipe.data!.content as Record<string, unknown>).id).toBe("token-list");

    const itemRecipe = await afs.read("/tokens/.aup/item-view/item.json");
    expect((itemRecipe.data!.content as Record<string, unknown>).id).toBe("token-detail");
  });
});
