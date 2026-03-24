/**
 * Phase 5: Page Layout tests.
 *
 * Tests: /pages/:id CRUD, navigate action, layout format, HTML pages.
 */
import { describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, createMockInputSource, WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

/* ─── helpers ──────────────────────────────────────────── */

function makeProvider(opts?: { outputBuffer?: string[] }) {
  const output = opts?.outputBuffer ?? [];
  const inputSource = createMockInputSource(Array(30).fill("test input"));
  const stdout = {
    write(data: string) {
      output.push(data);
      return true;
    },
  };
  const backend = new WebBackend({ port: 0, inputSource, stdout });
  const provider = new AFSUIProvider({ backend, pagesDir: false });
  return { provider, backend, output, inputSource };
}

async function mountProvider(opts?: { outputBuffer?: string[] }) {
  const { provider, backend, output, inputSource } = makeProvider(opts);
  const afs = new AFS();
  await afs.mount(provider, "/ui");
  return { afs, provider, backend, output, inputSource };
}

/* ─── Happy Path ─────────────────────────────────────── */

describe("Pages — Happy Path", () => {
  test("write to /pages/main creates a page", async () => {
    const { afs } = await mountProvider();
    const result = await afs.write("/ui/pages/main", {
      content: "<h1>Hello</h1>",
      meta: { format: "html" },
    });
    expect(result.data).toBeDefined();
  });

  test("read from /pages/main returns page content", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/pages/main", {
      content: "<h1>Hello</h1>",
      meta: { format: "html" },
    });
    const result = await afs.read("/ui/pages/main");
    expect(result.data?.content).toBe("<h1>Hello</h1>");
    expect(result.data?.meta?.format).toBe("html");
  });

  test("list /pages returns created pages", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/pages/alpha", { content: "A", meta: { format: "html" } });
    await afs.write("/ui/pages/beta", { content: "B", meta: { format: "html" } });

    const result = await afs.list("/ui/pages");
    const names = result.data?.map((e) => e.id).sort();
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });

  test("list /pages returns empty when no pages exist", async () => {
    const { afs } = await mountProvider();
    const result = await afs.list("/ui/pages");
    expect(result.data).toEqual([]);
  });

  test("delete /pages/main removes the page", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/pages/main", { content: "X", meta: { format: "html" } });

    const delResult = await afs.delete("/ui/pages/main");
    expect(delResult).toBeDefined();

    // Should not be readable anymore
    await expect(afs.read("/ui/pages/main")).rejects.toThrow();
  });

  test("navigate action switches to page", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/pages/home", {
      content: "<h1>Home</h1>",
      meta: { format: "html" },
    });

    const result = await afs.exec("/ui/.actions/navigate", { page: "home" });
    expect(result.success).toBe(true);
  });

  test("write with format=layout creates layout page", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/pages/dashboard", {
      content: "",
      meta: {
        format: "layout",
        layout: {
          header: "Dashboard Header",
          sidebar: "Nav Links",
          main: "Main Content",
          footer: "Footer",
        },
      },
    });
    const result = await afs.read("/ui/pages/dashboard");
    expect(result.data?.meta?.format).toBe("layout");
    expect(result.data?.meta?.layout).toBeDefined();
  });

  test("overwrite existing page updates content", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/pages/main", { content: "V1", meta: { format: "html" } });
    await afs.write("/ui/pages/main", { content: "V2", meta: { format: "html" } });

    const result = await afs.read("/ui/pages/main");
    expect(result.data?.content).toBe("V2");
  });

  test("meta /pages reports page capabilities", async () => {
    const { afs } = await mountProvider();
    const result = await afs.read("/ui/pages/.meta");
    expect(result.data?.meta?.kind).toBe("pages-directory");
  });

  test("root list includes pages directory", async () => {
    const { afs } = await mountProvider();
    const result = await afs.list("/ui");
    const ids = result.data?.map((e) => e.id);
    expect(ids).toContain("pages");
    expect(ids).toContain("input");
    expect(ids).toContain("output");
  });

  test("root meta reports childrenCount=12", async () => {
    const { afs } = await mountProvider();
    const result = await afs.read("/ui/.meta");
    expect(result.data?.meta?.childrenCount).toBe(12);
  });

  test("navigate sends page content to web backend via WebSocket", async () => {
    const backend = new WebBackend({ port: 0 });
    const info = await backend.listen();

    const provider = new AFSUIProvider({ backend, pagesDir: false });
    const afs = new AFS();
    await afs.mount(provider, "/ui");

    const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on("error", reject);
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "join_session" }));
        resolve();
      });
    });

    try {
      await afs.write("/ui/pages/home", {
        content: "<h1>Home</h1>",
        meta: { format: "html" },
      });

      const msgPromise = new Promise<Record<string, unknown>>((resolve) => {
        const handler = (data: unknown) => {
          const parsed = JSON.parse(String(data)) as Record<string, unknown>;
          if (parsed.type === "navigate") {
            ws.off("message", handler);
            resolve(parsed);
          }
        };
        ws.on("message", handler);
      });

      await afs.exec("/ui/.actions/navigate", { page: "home" });
      const msg = await msgPromise;

      expect(msg.type).toBe("navigate");
      expect(msg.pageId).toBe("home");
      expect(msg.content).toBe("<h1>Home</h1>");
    } finally {
      ws.terminate();
      await backend.close();
    }
  });
});

/* ─── Bad Path ───────────────────────────────────────── */

describe("Pages — Bad Path", () => {
  test("read non-existent page throws", async () => {
    const { afs } = await mountProvider();
    await expect(afs.read("/ui/pages/nope")).rejects.toThrow();
  });

  test("navigate to non-existent page throws", async () => {
    const { afs } = await mountProvider();
    await expect(afs.exec("/ui/.actions/navigate", { page: "nope" })).rejects.toThrow();
  });

  test("navigate without page arg throws", async () => {
    const { afs } = await mountProvider();
    await expect(afs.exec("/ui/.actions/navigate", {})).rejects.toThrow("page");
  });

  test("delete non-existent page throws", async () => {
    const { afs } = await mountProvider();
    await expect(afs.delete("/ui/pages/nope")).rejects.toThrow();
  });
});

/* ─── Security ───────────────────────────────────────── */

describe("Pages — Security", () => {
  test("page HTML content is sanitized on navigate", async () => {
    const output: string[] = [];
    const { afs } = await mountProvider({ outputBuffer: output });

    await afs.write("/ui/pages/xss", {
      content: '<p>safe</p><script>alert("xss")</script>',
      meta: { format: "html" },
    });

    await afs.exec("/ui/.actions/navigate", { page: "xss" });

    // The navigate output should have sanitized HTML
    const navigateOutput = output.join("");
    // In test mode, navigate writes content; it should be sanitized
    expect(navigateOutput).not.toContain("<script");
    expect(navigateOutput).toContain("<p>safe</p>");
  });
});

/* ─── Client-side XSS protection ───────────────────── */

describe("Client HTML — XSS protection", () => {
  // Import WEB_CLIENT_HTML to verify the generated template
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WEB_CLIENT_HTML } = require("@aigne/afs-ui") as { WEB_CLIENT_HTML: string };

  test("includes DOMPurify CDN script", () => {
    expect(WEB_CLIENT_HTML).toContain("dompurify");
  });

  test("sanitizeHtml uses DOMPurify.sanitize", () => {
    expect(WEB_CLIENT_HTML).toContain("DOMPurify.sanitize");
  });

  test("sanitizeHtml does not use regex-based stripping", () => {
    // The old approach used regex to strip script tags — should be gone
    expect(WEB_CLIENT_HTML).not.toContain("<\\/script>/gi");
  });

  test("renderMarkdown pipes output through DOMPurify", () => {
    // Verify marked.parse output is sanitized before innerHTML
    const renderMdMatch = WEB_CLIENT_HTML.match(
      /function renderMarkdown[\s\S]*?(?=\n {2}function )/,
    );
    expect(renderMdMatch).toBeTruthy();
    const renderMdBody = renderMdMatch![0];
    expect(renderMdBody).toContain("DOMPurify.sanitize");
  });
});
