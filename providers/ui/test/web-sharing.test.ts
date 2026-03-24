/**
 * AUP Web Sharing — Phases 0-3.
 *
 * Phase 0: Sharing Declaration — /ui/sharing/ CRUD, metadata schema, validation, edge cases.
 * Phase 1: Static Snapshot Mode — freeze AUP tree to self-contained HTML, serve via HTTP.
 * Phase 2: Live Mode — WebSocket channels for sharing entries.
 * Phase 3: SEO & Metadata — og tags, title, description injection.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";
import { createMockInputSource } from "../src/tty.js";

// ─── Helpers ──────────────────────────────────────────────────────

function makeProvider() {
  const output: string[] = [];
  const inputSource = createMockInputSource(Array(30).fill("test input"));
  const stdout = {
    write(data: string) {
      output.push(data);
      return true;
    },
  };
  const provider = new AFSUIProvider({
    backend: "tty",
    ttyOptions: { inputSource, stdout },
    pagesDir: false,
  });
  return { provider, output };
}

async function mountProvider() {
  const { provider, output } = makeProvider();
  const afs = new AFS();
  await afs.mount(provider, "/ui");
  return { afs, provider, output };
}

/** Create a web-backed provider for HTTP snapshot serving tests */
async function mountWebProvider() {
  const backend = new WebBackend({ port: 0 });
  const info = await backend.listen();
  const provider = new AFSUIProvider({ backend, pagesDir: false });
  const afs = new AFS();
  await afs.mount(provider, "/ui");
  return { afs, provider, backend, port: info.port };
}

// ─── Phase 0: Sharing Declaration ─────────────────────────────────

describe("Web Sharing — Happy Path", () => {
  test("write creates a sharing entry with all fields", async () => {
    const { afs } = await mountProvider();
    const result = await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    expect(result.data).toBeDefined();
    expect(result.data?.meta?.kind).toBe("sharing-entry");
  });

  test("read returns the sharing entry with all fields populated", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    const result = await afs.read("/ui/sharing/blog");
    const content = result.data?.content as Record<string, unknown>;
    expect(content.target).toBe("/modules/blog");
    expect(content.access).toBe("guest");
    expect(content.mode).toBe("static");
    expect(content.slug).toBe("blog");
    expect(content.createdAt).toBeGreaterThan(0);
    expect(content.updatedAt).toBeGreaterThan(0);
  });

  test("list returns all sharing entries", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    await afs.write("/ui/sharing/dashboard", {
      content: { target: "/modules/dash", access: "link-only", mode: "live" },
    });
    const result = await afs.list("/ui/sharing");
    expect(result.data?.length).toBe(2);
    const names = result.data?.map((e) => e.id).sort();
    expect(names).toContain("blog");
    expect(names).toContain("dashboard");
  });

  test("delete removes the entry and subsequent read returns 404", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    const delResult = await afs.delete("/ui/sharing/blog");
    expect(delResult).toBeDefined();
    await expect(afs.read("/ui/sharing/blog")).rejects.toThrow();
  });

  test("writing entry with mode live persists correctly", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/dashboard", {
      content: { target: "/modules/dash", access: "guest", mode: "live" },
    });
    const result = await afs.read("/ui/sharing/dashboard");
    const content = result.data?.content as Record<string, unknown>;
    expect(content.mode).toBe("live");
  });
});

describe("Web Sharing — Bad Path", () => {
  test("write without target returns error", async () => {
    const { afs } = await mountProvider();
    await expect(
      afs.write("/ui/sharing/blog", {
        content: { access: "guest", mode: "static" },
      }),
    ).rejects.toThrow("target");
  });

  test("write with invalid access returns validation error", async () => {
    const { afs } = await mountProvider();
    await expect(
      afs.write("/ui/sharing/blog", {
        content: { target: "/modules/blog", access: "invalid", mode: "static" },
      }),
    ).rejects.toThrow("access");
  });

  test("write with empty object returns error", async () => {
    const { afs } = await mountProvider();
    await expect(
      afs.write("/ui/sharing/blog", {
        content: {},
      }),
    ).rejects.toThrow("target");
  });

  test("read nonexistent entry throws", async () => {
    const { afs } = await mountProvider();
    await expect(afs.read("/ui/sharing/nonexistent")).rejects.toThrow();
  });

  test("delete nonexistent entry throws", async () => {
    const { afs } = await mountProvider();
    await expect(afs.delete("/ui/sharing/nonexistent")).rejects.toThrow();
  });
});

describe("Web Sharing — Edge Cases", () => {
  test("two entries pointing to the same target is allowed", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog-v1", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    await afs.write("/ui/sharing/blog-v2", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    const result = await afs.list("/ui/sharing");
    expect(result.data?.length).toBe(2);
  });

  test("overwriting entry updates updatedAt but preserves createdAt", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    const first = await afs.read("/ui/sharing/blog");
    const firstContent = first.data?.content as Record<string, unknown>;
    const createdAt = firstContent.createdAt as number;

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "user", mode: "static" },
    });
    const second = await afs.read("/ui/sharing/blog");
    const secondContent = second.data?.content as Record<string, unknown>;
    expect(secondContent.createdAt).toBe(createdAt);
    expect(secondContent.updatedAt as number).toBeGreaterThanOrEqual(createdAt);
    expect(secondContent.access).toBe("user");
  });

  test("empty list returns empty array not error", async () => {
    const { afs } = await mountProvider();
    const result = await afs.list("/ui/sharing");
    expect(result.data).toEqual([]);
  });

  test("entry with meta.title persists SEO metadata", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/about", {
      content: {
        target: "/modules/about",
        access: "guest",
        mode: "static",
        meta: { title: "About Us", description: "Learn about our team" },
      },
    });
    const result = await afs.read("/ui/sharing/about");
    const content = result.data?.content as Record<string, unknown>;
    const meta = content.meta as Record<string, unknown>;
    expect(meta.title).toBe("About Us");
    expect(meta.description).toBe("Learn about our team");
  });
});

describe("Web Sharing — Data Safety", () => {
  test("deleting a sharing entry does not affect other entries", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    await afs.write("/ui/sharing/dashboard", {
      content: { target: "/modules/dash", access: "guest", mode: "live" },
    });
    await afs.delete("/ui/sharing/blog");
    const result = await afs.list("/ui/sharing");
    expect(result.data?.length).toBe(1);
    expect(result.data?.[0]?.id).toBe("dashboard");
  });

  test("reading sharing entry returns mapping metadata, not target content", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    const result = await afs.read("/ui/sharing/blog");
    const content = result.data?.content as Record<string, unknown>;
    // Should have sharing entry fields, not target content
    expect(content.target).toBe("/modules/blog");
    expect(content.slug).toBe("blog");
    expect(content).not.toHaveProperty("children");
  });

  test("concurrent writes to same entry last-write-wins", async () => {
    const { afs } = await mountProvider();
    await Promise.all([
      afs.write("/ui/sharing/blog", {
        content: { target: "/modules/blog", access: "guest", mode: "static" },
      }),
      afs.write("/ui/sharing/blog", {
        content: { target: "/modules/blog", access: "user", mode: "static" },
      }),
    ]);
    const result = await afs.read("/ui/sharing/blog");
    const content = result.data?.content as Record<string, unknown>;
    // One of the two writes should have won
    expect(["guest", "user"]).toContain(content.access as string);
  });
});

describe("Web Sharing — Root List Integration", () => {
  test("root list includes sharing directory", async () => {
    const { afs } = await mountProvider();
    const result = await afs.list("/ui");
    const ids = result.data?.map((e) => e.id);
    expect(ids).toContain("sharing");
  });

  test("sharing meta reports kind and childrenCount", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/blog", {
      content: { target: "/modules/blog", access: "guest", mode: "static" },
    });
    const result = await afs.read("/ui/sharing/.meta");
    expect(result.data?.meta?.kind).toBe("sharing-directory");
    expect(result.data?.meta?.childrenCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 1: Static Snapshot Mode
// ═══════════════════════════════════════════════════════════════════

const sampleTree = {
  id: "root",
  type: "view",
  children: [{ id: "h1", type: "text", props: { content: "Hello Snapshot" } }],
};

describe("Static Snapshot — Happy Path", () => {
  let webCtx: { afs: AFS; provider: AFSUIProvider; backend: WebBackend; port: number } | null =
    null;

  afterEach(async () => {
    if (webCtx?.backend) {
      await webCtx.backend.close();
      webCtx = null;
    }
  });

  test("snapshot action generates HTML containing the AUP tree", async () => {
    const { afs } = await mountProvider();
    // Create sharing entry and render AUP tree to a session
    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });

    // Render AUP tree to a live channel that will serve as source
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });

    // Execute snapshot action
    const result = await afs.exec("/ui/sharing/demo/.actions/snapshot", {
      sessionId: sid,
    });
    expect(result.success).toBe(true);

    // Read the sharing entry — should have snapshot
    const entry = await afs.read("/ui/sharing/demo");
    const content = entry.data?.content as Record<string, unknown>;
    expect(content.snapshot).toBeDefined();
    const html = content.snapshot as string;
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Hello Snapshot");
  });

  test("generated HTML is self-contained with inline CSS and JS", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/demo");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    // Should contain inline CSS and JS
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
    // Should contain snapshot mode flag
    expect(html).toContain("_SNAPSHOT_MODE");
    // Should have the AUP tree embedded
    expect(html).toContain("Hello Snapshot");
  });

  test("re-snapshotting overwrites the previous snapshot", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;

    // First render and snapshot
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId: sid });

    // Second render with different content
    const tree2 = {
      id: "root",
      type: "view",
      children: [{ id: "h1", type: "text", props: { content: "Updated Content" } }],
    };
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, { root: tree2 });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/demo");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain("Updated Content");
    expect(html).not.toContain("Hello Snapshot");
  });

  test("HTTP GET to /s/{slug} returns snapshot HTML", async () => {
    webCtx = await mountWebProvider();
    const { afs, port } = webCtx;

    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });

    // We need a session — connect WebSocket to create one, then render
    const ws = await connectWs(port);
    const sessionId = await joinSession(ws);

    await afs.exec(`/ui/web/sessions/${sessionId}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId });

    // HTTP GET
    const response = await fetch(`http://127.0.0.1:${port}/s/demo`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Hello Snapshot");

    ws.close();
  });

  test("HTTP GET to /s/nonexistent returns 404", async () => {
    webCtx = await mountWebProvider();
    const { port } = webCtx;

    const response = await fetch(`http://127.0.0.1:${port}/s/nonexistent`);
    expect(response.status).toBe(404);
  });
});

describe("Static Snapshot — Bad Path", () => {
  test("snapshot of live mode entry returns error", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/dash", {
      content: { target: "/modules/dash", access: "guest", mode: "live" },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await expect(
      afs.exec("/ui/sharing/dash/.actions/snapshot", { sessionId: sid }),
    ).rejects.toThrow("live");
  });

  test("snapshot without sessionId returns error", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });
    await expect(afs.exec("/ui/sharing/demo/.actions/snapshot", {})).rejects.toThrow("sessionId");
  });

  test("snapshot action on nonexistent sharing entry throws", async () => {
    const { afs } = await mountProvider();
    await expect(
      afs.exec("/ui/sharing/nope/.actions/snapshot", { sessionId: "x" }),
    ).rejects.toThrow();
  });
});

describe("Static Snapshot — Security", () => {
  test("snapshot HTML does not contain the actual session ID", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/demo");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    // Actual session ID value should not be embedded in the snapshot
    expect(html).not.toContain(sid);
    // The internal target path should not appear in the snapshot
    expect(html).not.toContain("/modules/demo");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 3: SEO & Metadata
// ═══════════════════════════════════════════════════════════════════

describe("SEO Metadata — Happy Path", () => {
  test("sharing entry with meta.title injects <title> into snapshot", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/about", {
      content: {
        target: "/modules/about",
        access: "guest",
        mode: "static",
        meta: { title: "About Us" },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/about/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/about");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain("<title>About Us</title>");
  });

  test("sharing entry with meta.description injects meta description tag", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/about", {
      content: {
        target: "/modules/about",
        access: "guest",
        mode: "static",
        meta: { title: "About", description: "Learn about our team" },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/about/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/about");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain('<meta name="description"');
    expect(html).toContain("Learn about our team");
  });

  test("sharing entry with meta.image injects og:image tag", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/about", {
      content: {
        target: "/modules/about",
        access: "guest",
        mode: "static",
        meta: { title: "About", image: "https://example.com/og.png" },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/about/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/about");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain("og:image");
    expect(html).toContain("https://example.com/og.png");
  });

  test("all OG tags present when full meta provided", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/about", {
      content: {
        target: "/modules/about",
        access: "guest",
        mode: "static",
        meta: {
          title: "About Us",
          description: "Team page",
          image: "https://example.com/og.png",
        },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/about/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/about");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain("og:title");
    expect(html).toContain("og:description");
    expect(html).toContain("og:image");
    expect(html).toContain("og:url");
    expect(html).toContain("og:type");
  });

  test("og:url uses the sharing slug", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/about", {
      content: {
        target: "/modules/about",
        access: "guest",
        mode: "static",
        meta: { title: "About" },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/about/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/about");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain("/s/about");
    // Should NOT contain internal target path
    expect(html).not.toContain("/modules/about");
  });
});

describe("SEO Metadata — Bad Path", () => {
  test("missing meta.title falls back to entry name as title", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/demo");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain("<title>demo</title>");
  });

  test("missing meta.description omits description tag", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/demo", {
      content: {
        target: "/modules/demo",
        access: "guest",
        mode: "static",
        meta: { title: "Demo" },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/demo");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).not.toContain('name="description"');
  });

  test("snapshot without any meta still produces valid HTML", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/demo", {
      content: { target: "/modules/demo", access: "guest", mode: "static" },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/demo/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/demo");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });
});

describe("SEO Metadata — Security", () => {
  test("meta values are HTML-escaped to prevent XSS", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/xss", {
      content: {
        target: "/modules/xss",
        access: "guest",
        mode: "static",
        meta: { title: '<script>alert("xss")</script>', description: '"><img onerror="alert(1)">' },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/xss/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/xss");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).not.toContain('onerror="alert(1)"');
  });

  test("meta.image with non-http URL is omitted from og tags", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/bad-img", {
      content: {
        target: "/modules/demo",
        access: "guest",
        mode: "static",
        meta: { title: "Test", image: "javascript:alert(1)" },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/bad-img/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/bad-img");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    // og:image should not be present since image URL is not http/https
    expect(html).not.toContain("og:image");
    // The malicious URL should not appear in OG meta tags
    expect(html).not.toContain('content="javascript:');
  });

  test("description longer than 200 chars is truncated for og:description", async () => {
    const { afs } = await mountProvider();
    const longDesc = "A".repeat(300);
    await afs.write("/ui/sharing/long", {
      content: {
        target: "/modules/demo",
        access: "guest",
        mode: "static",
        meta: { title: "Test", description: longDesc },
      },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await afs.exec("/ui/sharing/long/.actions/snapshot", { sessionId: sid });

    const entry = await afs.read("/ui/sharing/long");
    const html = (entry.data?.content as Record<string, unknown>).snapshot as string;
    // og:description should be truncated
    const ogDescMatch = html.match(/og:description[^>]*content="([^"]*)"/);
    if (ogDescMatch) {
      expect(ogDescMatch[1]!.length).toBeLessThanOrEqual(203); // 200 + "..."
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 2: Live Mode
// ═══════════════════════════════════════════════════════════════════

describe("Live Mode — Happy Path", () => {
  let webCtx: { afs: AFS; provider: AFSUIProvider; backend: WebBackend; port: number } | null =
    null;

  afterEach(async () => {
    if (webCtx?.backend) {
      await webCtx.backend.close();
      webCtx = null;
    }
  });

  test("creating a live sharing entry makes the channel accessible", async () => {
    webCtx = await mountWebProvider();
    const { afs } = webCtx;
    await afs.write("/ui/sharing/dash", {
      content: { target: "/modules/dash", access: "guest", mode: "live" },
    });
    // The sharing entry should exist and have mode: live
    const entry = await afs.read("/ui/sharing/dash");
    const content = entry.data?.content as Record<string, unknown>;
    expect(content.mode).toBe("live");
  });

  test("AUP render on live sharing channel propagates to viewers", async () => {
    webCtx = await mountWebProvider();
    const { afs, port } = webCtx;
    await afs.write("/ui/sharing/dash", {
      content: { target: "/modules/dash", access: "guest", mode: "live" },
    });

    // Connect a viewer to the channel
    const viewer = await connectChannel(port, "sharing:dash");

    // Render content to the sharing channel
    await afs.exec("/ui/web/live/sharing:dash/.actions/aup_render", {
      root: sampleTree,
    });

    // Viewer should receive the tree
    const msg = await nextWsMessage(viewer, (m) => m.type === "aup");
    expect(msg.action).toBe("render");
    expect((msg.root as Record<string, unknown>).id).toBe("root");

    viewer.close();
  });

  test("deleting live sharing entry is allowed", async () => {
    webCtx = await mountWebProvider();
    const { afs } = webCtx;
    await afs.write("/ui/sharing/dash", {
      content: { target: "/modules/dash", access: "guest", mode: "live" },
    });
    const result = await afs.delete("/ui/sharing/dash");
    expect(result).toBeDefined();
    await expect(afs.read("/ui/sharing/dash")).rejects.toThrow();
  });
});

describe("Live Mode — Bad Path", () => {
  test("snapshot action on live mode entry returns error", async () => {
    const { afs } = await mountProvider();
    await afs.write("/ui/sharing/dash", {
      content: { target: "/modules/dash", access: "guest", mode: "live" },
    });
    const sid = (await afs.list("/ui/tty/sessions")).data?.[0]?.id as string;
    await afs.exec(`/ui/tty/sessions/${sid}/.actions/aup_render`, {
      root: sampleTree,
    });
    await expect(
      afs.exec("/ui/sharing/dash/.actions/snapshot", { sessionId: sid }),
    ).rejects.toThrow("live");
  });
});

// ─── WebSocket helpers ──────────────────────────────────────────────

async function connectWs(port: number): Promise<WebSocket> {
  const { WebSocket: WS } = await import("ws");
  return new Promise((resolve, reject) => {
    const ws = new WS(`ws://127.0.0.1:${port}`) as unknown as WebSocket;
    (ws as unknown as { on: (event: string, fn: (...args: unknown[]) => void) => void }).on(
      "error",
      reject,
    );
    (ws as unknown as { on: (event: string, fn: (...args: unknown[]) => void) => void }).on(
      "open",
      () => resolve(ws),
    );
  });
}

async function joinSession(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    (ws as unknown as { send: (data: string) => void }).send(
      JSON.stringify({ type: "join_session" }),
    );
    (ws as unknown as { once: (event: string, fn: (...args: unknown[]) => void) => void }).once(
      "message",
      (data: unknown) => {
        const msg = JSON.parse(String(data)) as Record<string, unknown>;
        resolve(msg.sessionId as string);
      },
    );
  });
}

async function connectChannel(port: number, channelId: string): Promise<WebSocket> {
  const { WebSocket: WS } = await import("ws");
  return new Promise((resolve, reject) => {
    const ws = new WS(`ws://127.0.0.1:${port}`) as unknown as WebSocket;
    (ws as unknown as { on: (event: string, fn: (...args: unknown[]) => void) => void }).on(
      "error",
      reject,
    );
    (ws as unknown as { on: (event: string, fn: (...args: unknown[]) => void) => void }).on(
      "open",
      () => {
        (ws as unknown as { send: (data: string) => void }).send(
          JSON.stringify({ type: "join_channel", channelId }),
        );
        (ws as unknown as { once: (event: string, fn: (...args: unknown[]) => void) => void }).once(
          "message",
          (data: unknown) => {
            const msg = JSON.parse(String(data)) as Record<string, unknown>;
            if (msg.type === "channel") resolve(ws);
            else reject(new Error(`Expected channel ack, got: ${msg.type}`));
          },
        );
      },
    );
  });
}

function nextWsMessage(
  ws: WebSocket,
  predicate?: (msg: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("nextMessage timeout")), 5000);
    const handler = (data: unknown) => {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      if (!predicate || predicate(parsed)) {
        clearTimeout(timeout);
        (ws as unknown as { off: (event: string, fn: (...args: unknown[]) => void) => void }).off(
          "message",
          handler,
        );
        resolve(parsed);
      }
    };
    (ws as unknown as { on: (event: string, fn: (...args: unknown[]) => void) => void }).on(
      "message",
      handler,
    );
  });
}
