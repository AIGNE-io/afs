import { describe, expect, test } from "bun:test";
import { resolveTranslations } from "@aigne/afs-aup";
import { type AUPAppConfig, loadAUPApp } from "../src/aup-app.js";
import type { AUPNode } from "../src/aup-types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const INDEX_TREE: AUPNode = {
  id: "index-root",
  type: "view",
  children: [{ id: "title", type: "text", props: { content: "Index Page" } }],
};

const DASHBOARD_TREE: AUPNode = {
  id: "dashboard-root",
  type: "view",
  children: [{ id: "title", type: "text", props: { content: "Dashboard" } }],
};

const _MAP_TREE: AUPNode = {
  id: "map-root",
  type: "view",
  children: [{ id: "map-view", type: "map" }],
};

const WRAPPER_TREE: AUPNode = {
  id: "wrapper",
  type: "view",
  children: [
    {
      id: "nav",
      type: "view",
      children: [{ id: "back-btn", type: "action", props: { label: "Back" } }],
    },
    { $ref: "content" } as any,
  ],
};

/** Create a mock readFile function from a file map */
function mockReadFile(files: Record<string, unknown>) {
  return async (path: string) => {
    if (path in files) return files[path];
    throw new Error(`File not found: ${path}`);
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("loadAUPApp", () => {
  // =========================================================================
  // Loading — pages
  // =========================================================================
  describe("Loading — pages", () => {
    test("loads all page trees from readFile", async () => {
      const app = await loadAUPApp(
        {
          defaultPage: "index",
          pages: {
            index: { tree: "pages/index.json" },
            dashboard: { tree: "pages/dashboard.json" },
          },
        },
        mockReadFile({
          "pages/index.json": INDEX_TREE,
          "pages/dashboard.json": DASHBOARD_TREE,
        }),
      );

      expect(app.defaultTree).toEqual(INDEX_TREE);
      const resolver = app.pageResolver!;
      expect((await resolver("index"))!.tree).toEqual(INDEX_TREE);
      expect((await resolver("dashboard"))!.tree).toEqual(DASHBOARD_TREE);
    });

    test("defaultPage selects correct initial tree", async () => {
      const app = await loadAUPApp(
        {
          defaultPage: "dashboard",
          pages: {
            index: { tree: "pages/index.json" },
            dashboard: { tree: "pages/dashboard.json" },
          },
        },
        mockReadFile({
          "pages/index.json": INDEX_TREE,
          "pages/dashboard.json": DASHBOARD_TREE,
        }),
      );

      expect(app.defaultTree).toEqual(DASHBOARD_TREE);
    });

    test("without defaultPage uses first page", async () => {
      const app = await loadAUPApp(
        {
          pages: {
            index: { tree: "pages/index.json" },
            dashboard: { tree: "pages/dashboard.json" },
          },
        },
        mockReadFile({
          "pages/index.json": INDEX_TREE,
          "pages/dashboard.json": DASHBOARD_TREE,
        }),
      );

      expect(app.defaultTree).toEqual(INDEX_TREE);
    });

    test("missing default page file throws during load", async () => {
      await expect(
        loadAUPApp(
          {
            pages: {
              index: { tree: "pages/missing.json" },
            },
          },
          mockReadFile({}),
        ),
      ).rejects.toThrow(/not found/i);
    });

    test("missing non-default page throws on first resolve (lazy)", async () => {
      const app = await loadAUPApp(
        {
          pages: {
            index: { tree: "pages/index.json" },
            broken: { tree: "pages/missing.json" },
          },
        },
        mockReadFile({ "pages/index.json": INDEX_TREE }),
      );

      // Default page loaded fine
      expect(app.defaultTree).toEqual(INDEX_TREE);
      // Non-default page throws when resolved
      await expect(app.pageResolver("broken")).rejects.toThrow(/not found/i);
    });

    test("empty pages object throws", async () => {
      await expect(loadAUPApp({ pages: {} }, mockReadFile({}))).rejects.toThrow();
    });

    test("only default page is loaded eagerly, others are lazy", async () => {
      const readPaths: string[] = [];
      const readFile = async (path: string) => {
        readPaths.push(path);
        if (path === "pages/index.json") return INDEX_TREE;
        if (path === "pages/dashboard.json") return DASHBOARD_TREE;
        throw new Error(`File not found: ${path}`);
      };

      const app = await loadAUPApp(
        {
          defaultPage: "index",
          pages: {
            index: { tree: "pages/index.json" },
            dashboard: { tree: "pages/dashboard.json" },
          },
        },
        readFile,
      );

      // Only default page read during load
      expect(readPaths).toContain("pages/index.json");
      expect(readPaths).not.toContain("pages/dashboard.json");

      // Dashboard loaded on first resolve
      const dashboard = (await app.pageResolver("dashboard"))!;
      expect(dashboard.tree).toEqual(DASHBOARD_TREE);
      expect(readPaths).toContain("pages/dashboard.json");
    });

    test("lazy-loaded page is cached after first resolve", async () => {
      let readCount = 0;
      const readFile = async (path: string) => {
        readCount++;
        if (path === "pages/index.json") return INDEX_TREE;
        if (path === "pages/dashboard.json") return DASHBOARD_TREE;
        throw new Error(`File not found: ${path}`);
      };

      const app = await loadAUPApp(
        {
          pages: {
            index: { tree: "pages/index.json" },
            dashboard: { tree: "pages/dashboard.json" },
          },
        },
        readFile,
      );

      const countAfterLoad = readCount;
      await app.pageResolver("dashboard");
      const countAfterFirst = readCount;
      await app.pageResolver("dashboard");
      // Second resolve should not trigger another read
      expect(readCount).toBe(countAfterFirst);
      expect(countAfterFirst).toBe(countAfterLoad + 1);
    });

    test("only default locale is loaded eagerly, others are lazy", async () => {
      const readPaths: string[] = [];
      const PAGE: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(title)" },
      };
      const readFile = async (path: string) => {
        readPaths.push(path);
        if (path === "pages/index.json") return PAGE;
        if (path === "locales/en.json") return { title: "Welcome" };
        if (path === "locales/zh.json") return { title: "欢迎" };
        throw new Error(`File not found: ${path}`);
      };

      const app = await loadAUPApp(
        {
          locales: ["en", "zh"],
          pages: { index: { tree: "pages/index.json" } },
        },
        readFile,
      );

      // Only default locale (first) loaded eagerly
      expect(readPaths).toContain("locales/en.json");
      expect(readPaths).not.toContain("locales/zh.json");

      // zh locale loaded on first resolve
      const zh = (await app.pageResolver("index", "zh"))!;
      expect(zh.tree.props!.content).toBe("欢迎");
      expect(readPaths).toContain("locales/zh.json");
    });
  });

  // =========================================================================
  // Wrapper substitution
  // =========================================================================
  describe("Wrapper", () => {
    test("wrapper template wraps page tree via $ref content", async () => {
      const app = await loadAUPApp(
        {
          wrapper: "wrapper.json",
          pages: {
            index: { tree: "pages/index.json" },
          },
        },
        mockReadFile({
          "wrapper.json": WRAPPER_TREE,
          "pages/index.json": INDEX_TREE,
        }),
      );

      const tree = app.defaultTree;
      expect(tree.id).toBe("wrapper");
      expect(tree.children).toHaveLength(2);
      expect(tree.children![0]!.id).toBe("nav");
      // $ref: "content" replaced with page tree
      expect(tree.children![1]!.id).toBe("index-root");
    });

    test("wrapper applies to resolved pages too", async () => {
      const app = await loadAUPApp(
        {
          wrapper: "wrapper.json",
          pages: {
            index: { tree: "pages/index.json" },
            dashboard: { tree: "pages/dashboard.json" },
          },
        },
        mockReadFile({
          "wrapper.json": WRAPPER_TREE,
          "pages/index.json": INDEX_TREE,
          "pages/dashboard.json": DASHBOARD_TREE,
        }),
      );

      const resolved = (await app.pageResolver!("dashboard"))!;
      expect(resolved.tree.id).toBe("wrapper");
      expect(resolved.tree.children![1]!.id).toBe("dashboard-root");
    });

    test("no wrapper returns raw page tree", async () => {
      const app = await loadAUPApp(
        {
          pages: {
            index: { tree: "pages/index.json" },
          },
        },
        mockReadFile({ "pages/index.json": INDEX_TREE }),
      );

      expect(app.defaultTree).toEqual(INDEX_TREE);
    });
  });

  // =========================================================================
  // Page resolver — tone/palette
  // =========================================================================
  describe("Page resolver — tone/palette", () => {
    test("page-level tone/palette is returned by resolver", async () => {
      const app = await loadAUPApp(
        {
          pages: {
            index: { tree: "pages/index.json" },
            dashboard: { tree: "pages/dashboard.json", tone: "bold", palette: "vivid" },
          },
        },
        mockReadFile({
          "pages/index.json": INDEX_TREE,
          "pages/dashboard.json": DASHBOARD_TREE,
        }),
      );

      expect((await app.pageResolver!("dashboard"))!.tone).toBe("bold");
      expect((await app.pageResolver!("dashboard"))!.palette).toBe("vivid");
      expect((await app.pageResolver!("index"))!.tone).toBeUndefined();
      expect((await app.pageResolver!("index"))!.palette).toBeUndefined();
    });

    test("non-existent page returns undefined from resolver", async () => {
      const app = await loadAUPApp(
        {
          pages: {
            index: { tree: "pages/index.json" },
          },
        },
        mockReadFile({ "pages/index.json": INDEX_TREE }),
      );

      expect(await app.pageResolver!("nonexistent")).toBeUndefined();
    });
  });

  // =========================================================================
  // AUPAppConfig shape
  // =========================================================================
  describe("AUPAppConfig validation", () => {
    test("config with only pages is valid", async () => {
      const config: AUPAppConfig = {
        pages: { index: { tree: "pages/index.json" } },
      };
      const app = await loadAUPApp(config, mockReadFile({ "pages/index.json": INDEX_TREE }));
      expect(app.defaultTree).toBeDefined();
    });

    test("config with defaultPage + wrapper + pages", async () => {
      const config: AUPAppConfig = {
        defaultPage: "dashboard",
        wrapper: "wrapper.json",
        pages: {
          index: { tree: "pages/index.json" },
          dashboard: { tree: "pages/dashboard.json" },
        },
      };
      const app = await loadAUPApp(
        config,
        mockReadFile({
          "wrapper.json": WRAPPER_TREE,
          "pages/index.json": INDEX_TREE,
          "pages/dashboard.json": DASHBOARD_TREE,
        }),
      );
      expect(app.defaultTree.id).toBe("wrapper");
      expect(app.defaultTree.children![1]!.id).toBe("dashboard-root");
    });
  });

  // =========================================================================
  // i18n — $t() resolution
  // =========================================================================
  describe("i18n — $t() resolution", () => {
    const I18N_PAGE: AUPNode = {
      id: "root",
      type: "view",
      children: [
        { id: "title", type: "text", props: { content: "$t(welcome)" } },
        {
          id: "btn",
          type: "action",
          props: { label: "$t(nav.home)", variant: "primary" },
          events: { click: { page: "index" } },
        },
        {
          id: "form",
          type: "input",
          props: { label: "$t(form.name)", placeholder: "$t(form.name.hint)" },
        },
      ],
    };

    test("resolves $t(key) in props.content", () => {
      const tree: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(hello)" },
      };
      const result = resolveTranslations(tree, { hello: "Hello World" });
      expect(result.props!.content).toBe("Hello World");
    });

    test("resolves multiple $t() in same string", () => {
      const tree: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(greeting), $t(name)!" },
      };
      const result = resolveTranslations(tree, { greeting: "Hello", name: "World" });
      expect(result.props!.content).toBe("Hello, World!");
    });

    test("leaves non-$t strings untouched", () => {
      const tree: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "Static text", level: 1 },
      };
      const result = resolveTranslations(tree, { foo: "bar" });
      expect(result.props!.content).toBe("Static text");
      expect(result.props!.level).toBe(1);
    });

    test("falls back when key missing in messages", () => {
      const tree: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(missing)" },
      };
      const result = resolveTranslations(tree, {}, { missing: "Fallback" });
      expect(result.props!.content).toBe("Fallback");
    });

    test("keeps $t() literal when key not in any messages", () => {
      const tree: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(unknown)" },
      };
      const result = resolveTranslations(tree, {});
      expect(result.props!.content).toBe("$t(unknown)");
    });

    test("resolves $t in nested children", () => {
      const result = resolveTranslations(I18N_PAGE, {
        welcome: "Welcome",
        "nav.home": "Home",
        "form.name": "Name",
        "form.name.hint": "Enter your name",
      });
      expect(result.children![0]!.props!.content).toBe("Welcome");
      expect(result.children![1]!.props!.label).toBe("Home");
      expect(result.children![1]!.props!.variant).toBe("primary"); // non-$t untouched
      expect(result.children![2]!.props!.label).toBe("Name");
      expect(result.children![2]!.props!.placeholder).toBe("Enter your name");
    });

    test("resolves $t in deep nested props (table columns, select options)", () => {
      const tree: AUPNode = {
        id: "table",
        type: "table",
        props: {
          columns: [
            { key: "name", label: "$t(col.name)" },
            { key: "age", label: "$t(col.age)" },
          ],
        },
      };
      const result = resolveTranslations(tree, {
        "col.name": "Name",
        "col.age": "Age",
      });
      const cols = result.props!.columns as any[];
      expect(cols[0].label).toBe("Name");
      expect(cols[1].label).toBe("Age");
      expect(cols[0].key).toBe("name"); // non-$t untouched
    });

    test("does not modify $ref nodes", () => {
      const tree: AUPNode = {
        id: "wrapper",
        type: "view",
        children: [
          { id: "nav", type: "text", props: { content: "$t(nav)" } },
          { $ref: "content" } as any,
        ],
      };
      const result = resolveTranslations(tree, { nav: "Navigation" });
      expect(result.children![0]!.props!.content).toBe("Navigation");
      expect((result.children![1] as any).$ref).toBe("content");
    });

    test("does not mutate original tree", () => {
      const tree: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(hello)" },
      };
      resolveTranslations(tree, { hello: "Hello" });
      expect(tree.props!.content).toBe("$t(hello)");
    });

    // ── loadAUPApp with locales ──

    test("loadAUPApp loads locale files and resolves in pageResolver", async () => {
      const PAGE: AUPNode = {
        id: "root",
        type: "view",
        children: [{ id: "t", type: "text", props: { content: "$t(title)" } }],
      };
      const app = await loadAUPApp(
        {
          locales: ["en", "zh"],
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({
          "pages/index.json": PAGE,
          "locales/en.json": { title: "Welcome" },
          "locales/zh.json": { title: "欢迎" },
        }),
      );

      const en = (await app.pageResolver("index", "en"))!;
      expect(en.tree.children![0]!.props!.content).toBe("Welcome");

      const zh = (await app.pageResolver("index", "zh"))!;
      expect(zh.tree.children![0]!.props!.content).toBe("欢迎");
    });

    test("pageResolver falls back to first locale when key missing", async () => {
      const PAGE: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(only_en)" },
      };
      const app = await loadAUPApp(
        {
          locales: ["en", "zh"],
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({
          "pages/index.json": PAGE,
          "locales/en.json": { only_en: "English Only" },
          "locales/zh.json": {},
        }),
      );

      const zh = (await app.pageResolver("index", "zh"))!;
      expect(zh.tree.props!.content).toBe("English Only");
    });

    test("pageResolver without locale returns raw tree (no $t resolution)", async () => {
      const PAGE: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(title)" },
      };
      const app = await loadAUPApp(
        {
          locales: ["en"],
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({
          "pages/index.json": PAGE,
          "locales/en.json": { title: "Welcome" },
        }),
      );

      // Without locale — uses first locale as default
      const result = (await app.pageResolver("index"))!;
      expect(result.tree.props!.content).toBe("Welcome");
    });

    test("no locales configured — $t() stays as literal", async () => {
      const PAGE: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(title)" },
      };
      const app = await loadAUPApp(
        {
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({ "pages/index.json": PAGE }),
      );

      const result = (await app.pageResolver("index"))!;
      expect(result.tree.props!.content).toBe("$t(title)");
    });

    test("defaultTree uses first locale for $t resolution", async () => {
      const PAGE: AUPNode = {
        id: "root",
        type: "text",
        props: { content: "$t(title)" },
      };
      const app = await loadAUPApp(
        {
          locales: ["en", "zh"],
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({
          "pages/index.json": PAGE,
          "locales/en.json": { title: "Welcome" },
          "locales/zh.json": { title: "欢迎" },
        }),
      );

      expect(app.defaultTree.props!.content).toBe("Welcome");
    });

    test("wrapper + $t() works together", async () => {
      const NAV: AUPNode = {
        id: "wrapper",
        type: "view",
        children: [
          { id: "nav", type: "action", props: { label: "$t(nav.home)" } },
          { $ref: "content" } as any,
        ],
      };
      const PAGE: AUPNode = {
        id: "page",
        type: "text",
        props: { content: "$t(page.title)" },
      };
      const app = await loadAUPApp(
        {
          wrapper: "wrapper.json",
          locales: ["en", "zh"],
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({
          "wrapper.json": NAV,
          "pages/index.json": PAGE,
          "locales/en.json": { "nav.home": "Home", "page.title": "Welcome" },
          "locales/zh.json": { "nav.home": "首页", "page.title": "欢迎" },
        }),
      );

      const zh = (await app.pageResolver("index", "zh"))!;
      expect(zh.tree.children![0]!.props!.label).toBe("首页");
      expect(zh.tree.children![1]!.props!.content).toBe("欢迎");
    });
  });

  // =========================================================================
  // Feature B: $locale resolution via resolveAUPVariables
  // =========================================================================
  describe("$locale resolution", () => {
    test("$locale in wrapper href resolved to current locale", async () => {
      const WRAPPER: AUPNode = {
        id: "wrapper",
        type: "view",
        children: [
          { id: "nav", type: "action", props: { href: "/app/$locale/", label: "$t(nav.home)" } },
          { $ref: "content" } as any,
        ],
      };
      const PAGE: AUPNode = {
        id: "page",
        type: "text",
        props: { content: "$t(title)" },
      };
      const app = await loadAUPApp(
        {
          wrapper: "wrapper.json",
          locales: ["en", "zh"],
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({
          "wrapper.json": WRAPPER,
          "pages/index.json": PAGE,
          "locales/en.json": { "nav.home": "Home", title: "Welcome" },
          "locales/zh.json": { "nav.home": "首页", title: "欢迎" },
        }),
      );

      const zh = (await app.pageResolver("index", "zh"))!;
      // $locale should be resolved to "zh"
      expect(zh.tree.children![0]!.props!.href).toBe("/app/zh/");
      // $t() should also be resolved
      expect(zh.tree.children![0]!.props!.label).toBe("首页");

      const en = (await app.pageResolver("index", "en"))!;
      expect(en.tree.children![0]!.props!.href).toBe("/app/en/");
    });

    test("$t(_locale) no longer works (replaced by $locale)", async () => {
      const PAGE: AUPNode = {
        id: "root",
        type: "action",
        props: { href: "/app/$t(_locale)/", label: "Link" },
      };
      const app = await loadAUPApp(
        {
          locales: ["en", "zh"],
          pages: { index: { tree: "pages/index.json" } },
        },
        mockReadFile({
          "pages/index.json": PAGE,
          "locales/en.json": {},
          "locales/zh.json": {},
        }),
      );

      const zh = (await app.pageResolver("index", "zh"))!;
      // _locale is no longer injected into messages, so $t(_locale) stays unresolved
      expect(zh.tree.props!.href).toBe("/app/$t(_locale)/");
    });
  });
});
